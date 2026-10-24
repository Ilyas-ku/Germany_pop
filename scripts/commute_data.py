"""Salary in a Top-7 city vs. rent in rings around it (for commuters).

Ratio = median gross monthly wage at workplace in the city (BA, 31.12.2024)
        / (average net cold rent per m² in the ring × 70 m²).
Rent per ring = flat-weighted mean of Zensus 2022 1 km grid cells
(durchschnMieteQM × AnzahlWohnungen, rented flats), cells assigned by centre.

Two ways to measure distance:
- "edge":   km outside the city boundary (city itself is its own band)
- "centre": km from the city's main station (Hauptbahnhof)

Needs data-src/ratio/wage_ao.csv (npm run ratio:data) and writes
public/data/commute.json.
Requires: pip install pyproj shapely
"""
import csv
import io
import json
import urllib.request
import zipfile
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform
from shapely.strtree import STRtree

OUT = Path("data-src/ratio")
CACHE = OUT / "cache"
GRID_URL = ("https://www.destatis.de/static/DE/zensus/gitterdaten/"
            "Durchschnittliche_Nettokaltmiete_und_Anzahl_der_Wohnungen.zip")

FLAT_M2 = 70
BANDS = [10, 20, 30, 40]

# AGS (Gemeinde), district code for wages, Hauptbahnhof (lon, lat)
CITIES = [
    ("Berlin", "11000000", "11000", (13.3694, 52.5250)),
    ("Hamburg", "02000000", "02000", (10.0065, 53.5530)),
    ("München", "09162000", "09162", (11.5586, 48.1402)),
    ("Köln", "05315000", "05315", (6.9585, 50.9430)),
    ("Frankfurt am Main", "06412000", "06412", (8.6630, 50.1070)),
    ("Stuttgart", "08111000", "08111", (9.1817, 48.7842)),
    ("Düsseldorf", "05111000", "05111", (6.7944, 51.2199)),
]


def fetch(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=600) as r:
            path.write_bytes(r.read())
    return path


def rent_cells():
    zf = zipfile.ZipFile(fetch(GRID_URL, "zensus_miete_grid.zip"))
    member = next(n for n in zf.namelist() if n.endswith("_1km-Gitter.csv"))
    rows = csv.DictReader(io.TextIOWrapper(zf.open(member), encoding="utf-8-sig"), delimiter=";")
    cells = []
    for r in rows:
        try:
            rent = float(r["durchschnMieteQM"].replace(",", "."))
            # decimal comma for rent, but "1,243" = 1243 flats
            flats = float(r["AnzahlWohnungen"].replace(",", "").replace(".", ""))
        except ValueError:
            continue  # "–" = zero / suppressed
        if flats > 0:
            cells.append((float(r["x_mp_1km"]), float(r["y_mp_1km"]), rent, flats))
    return cells


def main():
    to_laea = Transformer.from_crs(4326, 3035, always_xy=True).transform
    gem = {f["properties"]["AGS"]: f for f in json.load(open("public/data/Germany_Gemeinde.geojson"))["features"]}
    wages = {r["ags"]: int(r["value"]) for r in csv.DictReader(open(OUT / "wage_ao.csv"), delimiter=";")}

    cells = rent_cells()
    pts = [Point(x, y) for x, y, _, _ in cells]
    tree = STRtree(pts)

    out = []
    for name, ags, krs, hbf in CITIES:
        city = transform(to_laea, shape(gem[ags]["geometry"]))
        # Offshore bits (Hamburg's Neuwerk) would pull remote cells into the rings
        main_part = max(getattr(city, "geoms", [city]), key=lambda g: g.area)
        centre = Point(to_laea(*hbf))
        assert main_part.contains(centre), name

        reach = main_part.buffer(BANDS[-1] * 1000)
        acc = {"edge": {}, "centre": {}}
        for i in tree.query(reach):
            x, y, rent, flats = cells[i]
            p = pts[i]
            d_edge = 0 if main_part.contains(p) else main_part.distance(p) / 1000
            d_centre = centre.distance(p) / 1000
            keys = {
                "edge": "city" if d_edge == 0 else next((f"{b - 10}-{b}" for b in BANDS if d_edge <= b), None),
                "centre": next((f"{b - 10}-{b}" for b in BANDS if d_centre <= b), None),
            }
            if main_part.contains(p):
                keys["centre_city"] = "city"
            for mode, band in keys.items():
                if band:
                    a = acc["centre" if mode == "centre_city" else mode].setdefault(band, [0.0, 0.0])
                    a[0] += rent * flats
                    a[1] += flats

        wage = wages[krs]
        city_out = {"name": name, "wage": wage, "modes": {}}
        for mode, bands in acc.items():
            city_out["modes"][mode] = {
                band: {
                    "rent": round(s / n, 2),
                    "flats": round(n),
                    "ratio": round(wage / (s / n * FLAT_M2), 2),
                }
                for band, (s, n) in bands.items()
            }
        out.append(city_out)

    meta = {
        "flat_m2": FLAT_M2,
        "bands": ["city"] + [f"{b - 10}-{b}" for b in BANDS],
        "attribution": "Rent: Zensus 2022, 1 km grid (Destatis). Wages: Bundesagentur für Arbeit, median at workplace, 31.12.2024.",
    }
    Path("public/data/commute.json").write_text(json.dumps({"meta": meta, "cities": out}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
