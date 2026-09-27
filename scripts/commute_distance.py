"""Median distance from home to the city's main station for in-commuters
of the Top-7 cities.

Sources
- Pendleratlas der Statistischen Ämter (pendleratlas.statistikportal.de), 2024:
  all in-commuters per city (EZ files, EIP), exact flows of >= 1000 people
  between municipalities (EIP_Mobi_1000), unit locations and population.
  Covers employees, civil servants, self-employed (Pendlerrechnung der Länder).
- BA Pendlerverflechtungen Kreise, 30.06.2023 (employees only): complete
  in-commuters per home district. Used only to place commuters from flows
  < 1000: per home district, BA count scaled to the Pendleratlas total, minus
  the exact flows, spread over that district's remaining municipalities by
  population.

Distance = straight line from the municipality's point to the main station.
Writes public/data/commute_distance.json.
Requires: pip install openpyxl pyproj
"""
import csv
import io
import json
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

import openpyxl
from pyproj import Transformer

CACHE = Path("data-src/ratio/cache")
PA = "https://pendleratlas.statistikportal.de/data"
YEAR = 2024
BA_URL = ("https://statistik.arbeitsagentur.de/Statistikdaten/Detail/202306/iiia6/beschaeftigung-pendler-krpend/"
          "krpend-k-0-202306-xlsx.xlsx?__blob=publicationFile")

# name, ARS, district, main station (lon, lat) – same as scripts/commute_data.py
CITIES = [
    ("Berlin", "110000000000", "11000", (13.3694, 52.5250)),
    ("Hamburg", "020000000000", "02000", (10.0065, 53.5530)),
    ("München", "091620000000", "09162", (11.5586, 48.1402)),
    ("Köln", "053150000000", "05315", (6.9585, 50.9430)),
    ("Frankfurt am Main", "064120000000", "06412", (8.6630, 50.1070)),
    ("Stuttgart", "081110000000", "08111", (9.1817, 48.7842)),
    ("Düsseldorf", "051110000000", "05111", (6.7944, 51.2199)),
]
LANDS = [f"{i:02d}" for i in range(1, 17)]


def fetch(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r:
            path.write_bytes(r.read())
    return path


def read_csv(url, name):
    return list(csv.DictReader(open(fetch(url, name), encoding="utf-8-sig"), delimiter=";"))


def ba_inflows():
    """{work district: {home district or region code: count}} from BA table."""
    wb = openpyxl.load_workbook(fetch(BA_URL, "ba_krpend_202306.xlsx"), read_only=True)
    flows, work = defaultdict(dict), None
    for r in wb["Einpendler Kreise"].iter_rows(values_only=True):
        if r[0]:
            work = str(r[0])
        home, name, n = r[2], r[3], r[4]
        if not work or not home or not isinstance(n, (int, float)):
            continue
        home = str(home)
        # district rows, plus "Übrige Kreise" remainders of a region (skip region/Land totals)
        if len(home) == 5 or str(name).startswith("Übrige"):
            flows[work][home] = flows[work].get(home, 0) + n
    return flows


def weighted_quantiles(pairs, qs):
    pairs = sorted(pairs)
    total = sum(w for _, w in pairs)
    out, acc, i = [], 0.0, 0
    for q in qs:
        while acc + pairs[i][1] < q * total:
            acc += pairs[i][1]
            i += 1
        out.append(pairs[i][0])
    return out


def main():
    units = json.load(open(fetch(f"{PA}/geojson/gemeinden_{YEAR}.json", f"pa_gemeinden_{YEAR}.json")))["features"]
    ez = {}
    for land in LANDS:
        for r in read_csv(f"{PA}/csv/{YEAR}/{YEAR}_EZ_L{land}.csv", f"pa_{YEAR}_EZ_L{land}.csv"):
            ez[r["ARS"]] = r
    mobi = read_csv(f"{PA}/csv/{YEAR}/{YEAR}_EIP_Mobi_1000_L00.csv", f"pa_{YEAR}_EIP_Mobi_1000_L00.csv")
    ba = ba_inflows()

    merc_to_laea = Transformer.from_crs(3857, 3035, always_xy=True).transform
    wgs_to_laea = Transformer.from_crs(4326, 3035, always_xy=True).transform
    pos = {u["ars"]: merc_to_laea(u["x"], u["y"]) for u in units}
    pop = {a: float(r["Bev"]) for a, r in ez.items() if r.get("Bev")}

    out = []
    for name, ars, krs, hbf in CITIES:
        cx, cy = wgs_to_laea(*hbf)
        dist = lambda a: math.hypot(pos[a][0] - cx, pos[a][1] - cy) / 1000
        total = float(ez[ars]["EIP"])

        exact = {r["ARS_WO"]: float(r["EIP_1000"]) for r in mobi if r["ARS_AO"] == ars}
        weights = dict(exact)

        # remainder per BA home district/region, scaled to the Pendleratlas total
        inflow = ba[krs]
        scale = total / sum(inflow.values())
        for code, n in inflow.items():
            if code == krs:
                continue
            members = [a for a in pos if a[:len(code)] == code and a[:5] != krs]
            if len(code) < 5:  # "Übrige Kreise": skip districts listed on their own
                members = [a for a in members if a[:5] not in inflow]
            rest = n * scale - sum(exact.get(a, 0) for a in members)
            free = [a for a in members if a not in exact]
            free_pop = sum(pop.get(a, 0) for a in free)
            if rest <= 0 or free_pop == 0:
                continue
            for a in free:
                weights[a] = weights.get(a, 0) + rest * pop.get(a, 0) / free_pop

        pairs = [(dist(a), w) for a, w in weights.items() if a in pos]
        q25, q50, q75 = weighted_quantiles(pairs, [0.25, 0.5, 0.75])
        exact_pairs = [(dist(a), w) for a, w in exact.items() if a in pos]
        # Pendler = main residence elsewhere, incl. weekly commuters; <= 100 km as a daily proxy
        near = [(d, w) for d, w in pairs if d <= 100]
        out.append({
            "name": name,
            "in_commuters": round(total),
            "exact_share": round(sum(exact.values()) / total, 3),
            "median_km": round(q50, 1),
            "q25_km": round(q25, 1),
            "q75_km": round(q75, 1),
            "median_km_exact_only": round(weighted_quantiles(exact_pairs, [0.5])[0], 1),
            "median_km_within_100": round(weighted_quantiles(near, [0.5])[0], 1),
            "share_within_100": round(sum(w for _, w in near) / sum(w for _, w in pairs), 3),
            "placed_share": round(sum(w for _, w in pairs) / total, 3),
        })

    Path("public/data/commute_distance.json").write_text(json.dumps({
        "meta": {
            "year": YEAR,
            "note": "In-commuters only (live outside the city). Straight-line distance to the main station.",
            "attribution": "Pendleratlas der Statistischen Ämter des Bundes und der Länder 2024; BA Pendlerverflechtungen 30.06.2023.",
        },
        "cities": out,
    }, ensure_ascii=False, indent=1))
    for c in out:
        print(c)


if __name__ == "__main__":
    main()
