"""Rent a commuter would pay today when moving in, per ring around the Top-7 cities.

Rent level: BBSR asking rents 2025, published per district (Kreis).
Pattern within a district: net cold rent of households that moved in less
than two years before the census (Zensus 2022, table 5000H-0009, per
municipality), so old leases do not shape where rent is high or low.
Municipalities with too few recent movers fall back to their overall
Zensus rent × the district's recent/overall ratio.

For every Zensus 2022 1 km cell (weighted by its rented flats):
- rent_recent:  recent-mover rent of the cell's municipality (2022 level)
- rent_asking:  rent_recent × (BBSR 2025 of the district ÷ flat-weighted
                recent-mover rent of that district), i.e. the district
                average equals BBSR
- rent_old_method: previous approach (all leases × district factor), kept
                for comparison
- small_premium: premium of flats <= 65 m² over the ring average (Zensus
                100 m grid by flat size, cell means)
- nk_cold, nk_warm: utilities and heating paid to the landlord, €/m²
                (Mikrozensus 2022 Tabelle 4 by region, warm_rent.csv)
- dist_km:      flat-weighted straight-line distance to the main station

Wages per city (BA Entgeltstatistik 31.12.2024, workplace, full-time core
group): official median, and the 25th percentile interpolated linearly within
the published wage classes (the same interpolation reproduces the official
medians within 1 %).

Writes public/data/affordability_rings.json.
Requires: pip install openpyxl pyproj shapely
"""
import csv
import io
import openpyxl
import json
import zipfile
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform
from shapely.prepared import prep
from shapely.strtree import STRtree

from commute_data import BANDS, CITIES, rent_cells

OUT = Path("data-src/ratio")
CACHE = OUT / "cache"
SIZE_ZIP = CACHE / "zensus_miete_groesse.zip"
RECENT_URL = ("https://ergebnisse.zensus2022.de/proxy/api/rest/tables/5000H-0009/data/"
              "5000H%20GEOGM4%20HSH007%20STAG%20WOHND1")
RECENT = ("WOHND000B001", "WOHND001B001")  # under 1 year, 1 to under 2 years


def read(name):
    return {r["ags"]: r for r in csv.DictReader(open(OUT / name, encoding="utf-8"), delimiter=";")}


def recent_mover_rents():
    """{AGS8: (recent, total)} from Zensus table 5000H-0009 by municipality.
    Only unflagged values count ('()' = limited reliability, '-' / '.' = none)."""
    from commute_data import fetch
    d = json.load(open(fetch(RECENT_URL, "zensus_5000H-0009_gemeinden.json")))["data"][0]
    assert d["id"][-2:] == ["WOHND1", "GEOGM4"], d["id"]
    w_idx = d["dimension"]["WOHND1"]["category"]["index"]
    g_idx = d["dimension"]["GEOGM4"]["category"]["index"]
    n = len(g_idx)

    def val(w, g):
        i = w_idx[w] * n + g
        return d["value"][i] if d["status"][i] == "e" else None

    out = {}
    for ars, g in g_idx.items():
        rec = [v for v in (val(w, g) for w in RECENT) if v]
        out[ars[:5] + ars[9:]] = (sum(rec) / len(rec) if rec else None, val("%TOTAL%", g))
    return out


def wage_quantiles(codes):
    wb = openpyxl.load_workbook(CACHE / "ba_entgelt_kreise_202412.xlsx", read_only=True)
    rows = wb["8.1"].iter_rows(values_only=True)
    edges = None
    out = {}
    for r in rows:
        if r[4] and str(r[4]).startswith("bis "):  # class header, e.g. "bis 2.000 €"
            labels = [str(c) for c in r[4:10]]
            edges = [0] + [int(l.split("bis")[-1].replace(".", "").replace("€", "").strip()) for l in labels[:-1]] + [None]
        if r[0] in codes and r[2] == "Insgesamt":
            counts = [float(c) for c in r[4:10]]
            target, acc = 0.25 * sum(counts), 0.0
            for i, c in enumerate(counts):
                if acc + c >= target:
                    p25 = edges[i] + (target - acc) / c * (edges[i + 1] - edges[i])
                    break
                acc += c
            out[r[0]] = {"median": round(r[10]), "p25": round(p25)}
    return out


def main():
    to_laea = Transformer.from_crs(4326, 3035, always_xy=True).transform
    gem_feats = json.load(open("public/data/Germany_Gemeinde.geojson"))["features"]
    gem = {f["properties"]["AGS"]: f for f in gem_feats}
    kreise = json.load(open(OUT / "kreise_full.geojson"))["features"]

    zensus = {a: float(r["value"]) for a, r in read("rent.csv").items()}
    asking = {a: float(r["value"]) for a, r in read("asking_rent_bbsr.csv").items()}
    old_factor = {a: asking[a] / zensus[a] for a in zensus}
    utilities = {a: (float(r["nk_cold"]), float(r["nk_warm"])) for a, r in read("warm_rent.csv").items()}
    recent = recent_mover_rents()

    cells = rent_cells()
    pts = [Point(x, y) for x, y, _, _ in cells]
    tree = STRtree(pts)

    # which cells matter: within 40 km of any city
    cities = []
    for name, ags, krs, hbf in CITIES:
        city = transform(to_laea, shape(gem[ags]["geometry"]))
        main_part = max(getattr(city, "geoms", [city]), key=lambda g: g.area)
        cities.append((name, main_part, Point(to_laea(*hbf))))
    needed = sorted({i for _, part, _ in cities for i in tree.query(part.buffer(BANDS[-1] * 1000))})

    # every cell -> district and municipality (the district factor needs all its cells)
    kpolys = [transform(to_laea, shape(f["geometry"])) for f in kreise]
    ktree = STRtree(kpolys)
    gpolys = [transform(to_laea, shape(f["geometry"])) for f in gem_feats]
    gtree = STRtree(gpolys)

    def locate(p, polys, tree_):
        j = next((j for j in tree_.query(p) if polys[j].contains(p)), None)
        return j if j is not None else tree_.nearest(p)

    cell_krs = [kreise[locate(p, kpolys, ktree)]["properties"]["KRS"] for p in pts]
    cell_ags = [gem_feats[locate(p, gpolys, gtree)]["properties"]["AGS"] for p in pts]

    # district ratio recent / all leases, from municipalities that have both
    ratios = defaultdict(list)
    for ags, (rec, tot) in recent.items():
        if rec and tot:
            ratios[ags[:5]].append(rec / tot)
    median = lambda v: sorted(v)[len(v) // 2]
    krs_ratio = {k: median(v) for k, v in ratios.items()}
    national_ratio = median([r for v in ratios.values() for r in v])

    def cell_recent(i):
        rec, tot = recent.get(cell_ags[i], (None, None))
        if rec:
            return rec
        return (tot or cells[i][2]) * krs_ratio.get(cell_krs[i], national_ratio)

    rent_recent = [cell_recent(i) for i in range(len(cells))]
    sums = defaultdict(lambda: [0.0, 0.0])
    for i, (_, _, _, flats) in enumerate(cells):
        sums[cell_krs[i]][0] += rent_recent[i] * flats
        sums[cell_krs[i]][1] += flats
    factor = {k: asking[k] / (s / n) for k, (s, n) in sums.items()}

    near_flats = sum(cells[i][3] for i in needed)
    own = sum(cells[i][3] for i in needed if recent.get(cell_ags[i], (None,))[0])
    f = sorted(factor.values())
    print(f"flats near the cities with their municipality's own recent-mover rent: {own / near_flats:.1%}")
    print(f"BBSR 2025 / recent movers 2022 per district: min {f[0]:.2f} median {median(f):.2f} max {f[-1]:.2f}")

    def band_of(part, centre, p):
        inside = part.contains(p)
        d_edge = 0 if inside else part.distance(p) / 1000
        d_centre = centre.distance(p) / 1000
        edge = "city" if inside else next((f"{b - 10}-{b}" for b in BANDS if d_edge <= b), None)
        centre_band = next((f"{b - 10}-{b}" for b in BANDS if d_centre <= b), None)
        return edge, centre_band, inside, d_centre

    # 1 km cell id -> bands, reused for the 100 m size grid
    km_bands = {}
    acc = {name: {"edge": defaultdict(lambda: [0.0] * 8), "centre": defaultdict(lambda: [0.0] * 8)} for name, *_ in cities}
    for i in needed:
        x, y, rent, flats = cells[i]
        key = (int(x // 1000), int(y // 1000))
        for name, part, centre in cities:
            edge, centre_band, inside, d = band_of(part, centre, pts[i])
            targets = [("edge", edge), ("centre", centre_band)] + ([("centre", "city")] if inside else [])
            for mode, band in targets:
                if not band:
                    continue
                km_bands.setdefault(key, set()).add((name, mode, band))
                k = cell_krs[i]
                a = acc[name][mode][band]
                a[0] += flats
                a[1] += rent * flats
                a[2] += rent_recent[i] * factor[k] * flats
                a[3] += utilities[k][0] * flats
                a[4] += utilities[k][1] * flats
                a[5] += d * flats
                a[6] += rent_recent[i] * flats
                a[7] += rent * old_factor[k] * flats

    # small-flat premium per ring from the 100 m grid
    size = {name: {"edge": defaultdict(lambda: [0.0, 0, 0.0, 0]), "centre": defaultdict(lambda: [0.0, 0, 0.0, 0])} for name, *_ in cities}
    zf = zipfile.ZipFile(SIZE_ZIP)
    member = next(n for n in zf.namelist() if n.endswith(".csv"))
    for r in csv.DictReader(io.TextIOWrapper(zf.open(member), encoding="utf-8-sig"), delimiter=";"):
        key = (int(float(r["x_mp_100m"]) // 1000), int(float(r["y_mp_100m"]) // 1000))
        tags = km_bands.get(key)
        if not tags:
            continue
        try:
            v = float(r["durchschnMieteQM"].replace(",", "."))
        except ValueError:
            continue
        small = r["WOHNUNGSGROESSE"].startswith("klein")
        for name, mode, band in tags:
            s = size[name][mode][band]
            s[0] += v
            s[1] += 1
            if small:
                s[2] += v
                s[3] += 1

    wages = wage_quantiles({krs for _, _, krs, _ in CITIES})
    out = []
    for (name, *_), (_, _, krs, _) in zip(cities, CITIES):
        city = {"name": name, "wage": wages[krs], "modes": {}}
        for mode in ("edge", "centre"):
            bands = {}
            for band, (n, r, ra, uc, uw, d, rr, ro) in acc[name][mode].items():
                s = size[name][mode][band]
                bands[band] = {
                    "flats": round(n),
                    "rent_zensus": round(r / n, 2),
                    "rent_recent": round(rr / n, 2),
                    "rent_asking": round(ra / n, 2),
                    "rent_old_method": round(ro / n, 2),
                    "small_premium": round((s[2] / s[3]) / (s[0] / s[1]), 3),
                    "nk_cold": round(uc / n, 2),
                    "nk_warm": round(uw / n, 2),
                    "dist_km": round(d / n, 1),
                }
            city["modes"][mode] = bands
        out.append(city)

    Path("public/data/affordability_rings.json").write_text(json.dumps({
        "meta": {
            "bands": ["city"] + [f"{b - 10}-{b}" for b in BANDS],
            "sources": "BBSR asking rents 2025 per district; Zensus 2022 rents of recent movers per municipality (table 5000H-0009), 1 km and 100 m grids (Destatis); Mikrozensus 2022 utilities and heating (Destatis).",
        },
        "cities": out,
    }, ensure_ascii=False, indent=1))
    for c in out:
        print(c["name"].ljust(18), " | ".join(
            f'{b}: all {v["rent_zensus"]} recent {v["rent_recent"]} → {v["rent_asking"]} (old {v["rent_old_method"]})'
            for b, v in c["modes"]["edge"].items()))


if __name__ == "__main__":
    main()
