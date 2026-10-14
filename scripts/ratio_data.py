"""Downloads and prepares district (Kreis) data for the salary/rent map.

Writes data-src/ratio/{rent.csv, wage_wo.csv, wage_ao.csv, meta.json}.
Needs data-src/ratio/kreise_full.geojson (npm run ratio:data creates it).
Requires: pip install openpyxl pyproj shapely

Sources
- Rent: Zensus 2022, Regionaltabelle Gebäude und Wohnungen, QMMIETE
  (average net cold rent per m², rented flats, 15.05.2022).
- Wage (residence): BA "Grunddaten regionale Entgelte", 1 km / 5 km grid,
  median gross monthly wage of full-time employees (core group) at place of
  residence, 31.12.2024. Aggregated to districts as the employee-weighted mean
  of cell medians; 1 km cells without a published median take their 5 km
  parent's median. This approximates, but is not, a district median.
- Wage (workplace): BA Entgeltstatistik, Kreise, sheet 8.1, median at place
  of work, 31.12.2024 (official district value).
"""
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

import openpyxl
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

OUT = Path("data-src/ratio")
CACHE = OUT / "cache"

RENT_URL = "https://www.destatis.de/static/DE/zensus/gitterdaten/Regionaltabelle_Gebaeude_Wohnungen.xlsx"
GRID_URL = ("https://statistik.arbeitsagentur.de/DE/Statischer-Content/Statistiken/Interaktive-Statistiken/"
            "Entgelte-regional/Generische-Publikationen/Grunddaten-regionale-Entgelte.zip?__blob=publicationFile")
AO_URL = ("https://statistik.arbeitsagentur.de/Statistikdaten/Detail/202412/iiia6/beschaeftigung-entgelt-entgelt/"
          "entgelt-dwolk-0-202412-xlsx.xlsx?__blob=publicationFile")


def fetch(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r:
            path.write_bytes(r.read())
    return path


def write_csv(name, header, rows):
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(header)
        w.writerows(rows)


def rent():
    wb = openpyxl.load_workbook(fetch(RENT_URL, "zensus_gebaeude_wohnungen.xlsx"), read_only=True)
    rows = wb["CSV-Wohnungen"].iter_rows(values_only=True)
    col = next(rows).index("QMMIETE")
    out = [(r[1], r[2], r[col]) for r in rows if r[1] and len(str(r[1])) == 5]
    write_csv("rent.csv", ["ags", "name", "value"], out)
    return {a: n for a, n, _ in out}


def wage_workplace():
    wb = openpyxl.load_workbook(fetch(AO_URL, "ba_entgelt_kreise_202412.xlsx"), read_only=True)
    out = [(r[0], r[1], round(r[10])) for r in wb["8.1"].iter_rows(values_only=True)
           if r[0] and len(str(r[0])) == 5 and r[2] == "Insgesamt"]
    write_csv("wage_ao.csv", ["ags", "name", "value"], out)


def wage_residence(names):
    num = lambda s: float(s.replace(".", "").replace(",", ".")) if s.strip() else None
    zf = zipfile.ZipFile(fetch(GRID_URL, "ba_grunddaten_regionale_entgelte.zip"))

    def grid(size):
        member = next(n for n in zf.namelist() if n.startswith(f"Medianentgelt_{size}_WO_"))
        rows = csv.reader(io.TextIOWrapper(zf.open(member), encoding="utf-8-sig"), delimiter=";")
        return {r[0]: (num(r[1]), num(r[2]) or 0) for r in rows if re.fullmatch(r"\d+kmN\d{4}E\d{4}", r[0])}

    g1, g5 = grid("1km"), grid("5km")

    feats = json.load(open(OUT / "kreise_full.geojson"))["features"]
    polys = [shape(f["geometry"]) for f in feats]
    codes = [f["properties"]["KRS"] for f in feats]
    tree = STRtree(polys)
    to_wgs = Transformer.from_crs(3035, 4326, always_xy=True)

    # per district: sum(emp*median), emp with a median, all emp
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    for cid, (med, emp) in g1.items():
        n, e = int(cid[4:8]), int(cid[9:13])
        if not med:
            parent = g5.get(f"5kmN{n // 5 * 5}E{e // 5 * 5}")
            med = parent[0] if parent else None
        pt = Point(*to_wgs.transform(e * 1000 + 500, n * 1000 + 500))
        hit = next((i for i in tree.query(pt) if polys[i].contains(pt)), None)
        if hit is None:  # coast / border cells
            hit = tree.nearest(pt)
        a = acc[codes[hit]]
        a[2] += emp
        if med:
            a[0] += emp * med
            a[1] += emp

    out = [(k, names.get(k, k), round(s / w), round(w / t, 3)) for k, (s, w, t) in sorted(acc.items()) if w]
    write_csv("wage_wo.csv", ["ags", "name", "value", "coverage"], out)


def main():
    names = rent()
    wage_workplace()
    wage_residence(names)
    meta = {
        "flat_m2": 70,
        "attribution": "Rent: BBSR asking rents 2025; Zensus 2022 (Destatis). Wages: Bundesagentur für Arbeit, Entgeltstatistik 31.12.2024.",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ok", file=sys.stderr)


if __name__ == "__main__":
    main()
