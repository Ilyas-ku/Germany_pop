"""Warm rent components per district (Kreis) for the net-wage / warm-rent map.

Writes data-src/ratio/warm_rent.csv with, per district:
- asking:        BBSR asking rent 2025, net cold, €/m² (asking_rent_bbsr.csv)
- small_premium: rent of flats <= 65 m² relative to the district mean, from the
                 Zensus 2022 100 m grid by flat size (cell means, unweighted)
- nk_cold:       kalte Nebenkosten, €/m²   } Mikrozensus 2022, Tabelle 4,
- nk_warm:       warme Nebenkosten, €/m²   } by Regierungsbezirk / statistical
                                             region, else Land
The warm rent then follows the official Bruttowarmmiete definition
(net cold + cold + warm utilities paid to the landlord). Heating paid
directly to a utility (own gas boiler) is not part of it.
Requires: pip install openpyxl pyproj shapely
"""
import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

import openpyxl
from shapely.geometry import Point, shape
from shapely.strtree import STRtree
from pyproj import Transformer
from shapely.ops import transform

OUT = Path("data-src/ratio")
CACHE = OUT / "cache"
MZ_URL = ("https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Wohnen/Publikationen/Downloads-Wohnen/"
          "wohnen-in-deutschland-5122125229005.xlsx?__blob=publicationFile")

# Mikrozensus region names -> district code prefix
REGIONS = {
    "Schleswig-Holstein": "01", "Hamburg": "02", "Niedersachsen": "03", "Bremen": "04",
    "Nordrhein-Westfalen": "05", "Hessen": "06", "Rheinland-Pfalz": "07", "Baden-Württemberg": "08",
    "Bayern": "09", "Saarland": "10", "Berlin": "11", "Brandenburg": "12",
    "Mecklenburg-Vorpommern": "13", "Sachsen": "14", "Sachsen-Anhalt": "15", "Thüringen": "16",
    "Stuttgart": "081", "Karlsruhe": "082", "Freiburg": "083", "Tübingen": "084",
    "Oberbayern": "091", "Niederbayern": "092", "Oberpfalz": "093", "Oberfranken": "094",
    "Mittelfranken": "095", "Unterfranken": "096", "Schwaben": "097",
    "Darmstadt": "064", "Gießen": "065", "Kassel": "066",
    "Braunschweig": "031", "Hannover": "032", "Lüneburg": "033", "Weser-Ems": "034",
    "Düsseldorf": "051", "Köln": "053", "Münster": "055", "Detmold": "057", "Arnsberg": "059",
    "Koblenz": "071", "Trier": "072", "Rheinhessen-Pfalz": "073",
    "Chemnitz": "145", "Dresden": "146", "Leipzig": "147",
}


def utilities():
    from commute_data import fetch  # same cache / download helper
    wb = openpyxl.load_workbook(fetch(MZ_URL, "mz2022_wohnen.xlsx"), read_only=True)
    out = {}
    for r in wb["Tabelle_4"].iter_rows(values_only=True):
        if not r[0] or r[3] is None:
            continue
        name = str(r[0]).split("\n")[-1].strip()
        if name in REGIONS:
            out[REGIONS[name]] = {"nk_cold": float(r[3]), "nk_warm": float(r[7])}
    assert len(out) == len(REGIONS), set(REGIONS) - {k for k, v in REGIONS.items() if v in out}
    return out


def small_premium(codes):
    """Per district: mean rent of <= 65 m² flats / mean rent of all, 100 m cells."""
    to_laea = Transformer.from_crs(4326, 3035, always_xy=True).transform
    kreise = json.load(open(OUT / "kreise_full.geojson"))["features"]
    polys = [transform(to_laea, shape(f["geometry"])) for f in kreise]
    tree = STRtree(polys)
    km_krs = {}

    def krs_of(key):
        if key not in km_krs:
            p = Point(key[0] * 1000 + 500, key[1] * 1000 + 500)
            i = next((j for j in tree.query(p) if polys[j].contains(p)), None)
            km_krs[key] = kreise[i if i is not None else tree.nearest(p)]["properties"]["KRS"]
        return km_krs[key]

    acc = defaultdict(lambda: [0.0, 0, 0.0, 0])
    zf = zipfile.ZipFile(CACHE / "zensus_miete_groesse.zip")
    member = next(n for n in zf.namelist() if n.endswith(".csv"))
    for r in csv.DictReader(io.TextIOWrapper(zf.open(member), encoding="utf-8-sig"), delimiter=";"):
        try:
            v = float(r["durchschnMieteQM"].replace(",", "."))
        except ValueError:
            continue
        a = acc[krs_of((int(float(r["x_mp_100m"]) // 1000), int(float(r["y_mp_100m"]) // 1000)))]
        a[0] += v
        a[1] += 1
        if r["WOHNUNGSGROESSE"].startswith("klein"):
            a[2] += v
            a[3] += 1
    return {k: (a[2] / a[3]) / (a[0] / a[1]) for k, a in acc.items() if k in codes and a[3]}


def main():
    asking = {r["ags"]: r for r in csv.DictReader(open(OUT / "asking_rent_bbsr.csv", encoding="utf-8"), delimiter=";")}
    util = utilities()
    prem = small_premium(set(asking))
    rows = []
    for ags, r in sorted(asking.items()):
        u = util.get(ags[:3]) or util[ags[:2]]
        rows.append((ags, r["name"], r["value"], round(prem.get(ags, 1.0), 3), u["nk_cold"], u["nk_warm"]))
    with open(OUT / "warm_rent.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ags", "name", "asking", "small_premium", "nk_cold", "nk_warm"])
        w.writerows(rows)
    missing = [a for a in asking if a not in prem]
    print(f"{len(rows)} districts, premium missing for {missing}")
    p = sorted(r[3] for r in rows)
    print("premium min/median/max", p[0], p[len(p) // 2], p[-1])


if __name__ == "__main__":
    main()
