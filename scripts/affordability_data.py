"""Rent a commuter would actually face around the Top-7 cities, per ring.

For every Zensus 2022 1 km cell (flat-weighted, as in commute_data.py):
- rent_zensus:  average net cold rent of existing leases (Zensus 2022)
- rent_asking:  rent_zensus × (BBSR asking rent 2025 of the cell's district
                ÷ Zensus average of that district). BBSR publishes asking
                rents only per district; this keeps the grid's spatial
                pattern and moves its level to what new leases cost.
- small:        premium of flats <= 65 m² over the ring average, from the
                Zensus 100 m grid by flat size (cell means, unweighted)
- utilities:    kalte Nebenkosten per m² for households that moved in 2019
                or later (Mikrozensus 2022, Bruttokalt − Nettokalt) by
                municipality size: big city (>= 100k) 1.5, middle
                (20k–100k) 1.3, small / rural 1.1 €/m²
- dist_km:      flat-weighted straight-line distance to the main station

Wages per city (BA Entgeltstatistik 31.12.2024, workplace, full-time core
group): official median, and the 25th percentile interpolated linearly within
the published wage classes (the same interpolation reproduces the official
medians within 1 %).

Writes public/data/affordability_rings.json.
Requires: pip install pyproj shapely
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
UTILITIES = [(100_000, 1.5), (20_000, 1.3), (0, 1.1)]  # EWZ threshold, €/m²


def read(name):
    return {r["ags"]: r for r in csv.DictReader(open(OUT / name, encoding="utf-8"), delimiter=";")}


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
    factor = {a: asking[a] / zensus[a] for a in zensus}

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

    # cell -> district and municipality size (point in polygon, only for needed cells)
    kpolys = [transform(to_laea, shape(f["geometry"])) for f in kreise]
    ktree = STRtree(kpolys)
    gpolys = [transform(to_laea, shape(f["geometry"])) for f in gem_feats]
    gtree = STRtree(gpolys)
    cell_krs, cell_util = {}, {}
    for i in needed:
        p = pts[i]
        k = next((j for j in ktree.query(p) if kpolys[j].contains(p)), None)
        k = k if k is not None else ktree.nearest(p)
        cell_krs[i] = kreise[k]["properties"]["KRS"]
        g = next((j for j in gtree.query(p) if gpolys[j].contains(p)), None)
        g = g if g is not None else gtree.nearest(p)
        ewz = float(gem_feats[g]["properties"].get("EWZ") or 0)
        cell_util[i] = next(v for t, v in UTILITIES if ewz >= t)

    def band_of(part, centre, p):
        inside = part.contains(p)
        d_edge = 0 if inside else part.distance(p) / 1000
        d_centre = centre.distance(p) / 1000
        edge = "city" if inside else next((f"{b - 10}-{b}" for b in BANDS if d_edge <= b), None)
        centre_band = next((f"{b - 10}-{b}" for b in BANDS if d_centre <= b), None)
        return edge, centre_band, inside, d_centre

    # 1 km cell id -> bands, reused for the 100 m size grid
    km_bands = {}
    acc = {name: {"edge": defaultdict(lambda: [0.0] * 6), "centre": defaultdict(lambda: [0.0] * 6)} for name, *_ in cities}
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
                a = acc[name][mode][band]
                a[0] += flats
                a[1] += rent * flats
                a[2] += rent * factor[cell_krs[i]] * flats
                a[3] += cell_util[i] * flats
                a[4] += d * flats

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
            for band, (n, r, ra, u, d, _) in acc[name][mode].items():
                s = size[name][mode][band]
                bands[band] = {
                    "flats": round(n),
                    "rent_zensus": round(r / n, 2),
                    "rent_asking": round(ra / n, 2),
                    "small_premium": round((s[2] / s[3]) / (s[0] / s[1]), 3),
                    "utilities": round(u / n, 2),
                    "dist_km": round(d / n, 1),
                }
            city["modes"][mode] = bands
        out.append(city)

    Path("public/data/affordability_rings.json").write_text(json.dumps({
        "meta": {
            "bands": ["city"] + [f"{b - 10}-{b}" for b in BANDS],
            "sources": "Zensus 2022 1 km and 100 m grids (Destatis); BBSR asking rents 2025 per district; Mikrozensus 2022 (Destatis).",
        },
        "cities": out,
    }, ensure_ascii=False, indent=1))
    for c in out:
        print(c["name"], {b: (v["rent_zensus"], v["rent_asking"], v["small_premium"], v["utilities"], v["dist_km"]) for b, v in c["modes"]["edge"].items()})


if __name__ == "__main__":
    main()
