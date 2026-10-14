"""Municipalities within 45 km of each Top-7 main station, with the warm rent
of a small flat on a new lease, for the agglomeration maps (agglo.html).

Warm rent per m² = recent-mover rent of the municipality × district factor
(BBSR 2025 ÷ recent movers, both from data-src/ratio/gemeinde_rent.csv, made
by scripts/affordability_data.py) × small-flat premium of the district
+ utilities + heating (data-src/ratio/warm_rent.csv).

Writes public/data/agglo/<slug>.geojson; scripts/build-agglo.mjs adds net pay
and affordable flat sizes.
Requires: pip install pyproj shapely
"""
import csv
import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform

from commute_data import CITIES

OUT = Path("data-src/ratio")
RADIUS_KM = 45
SLUGS = {
    "Berlin": "berlin", "Hamburg": "hamburg", "München": "muenchen", "Köln": "koeln",
    "Frankfurt am Main": "frankfurt", "Stuttgart": "stuttgart", "Düsseldorf": "duesseldorf",
}


def read(name):
    return {r["ags"]: r for r in csv.DictReader(open(OUT / name, encoding="utf-8"), delimiter=";")}


def main():
    to_laea = Transformer.from_crs(4326, 3035, always_xy=True).transform
    gem = json.load(open(OUT / "gemeinden_simple.geojson"))["features"]
    rent = read("gemeinde_rent.csv")
    warm = read("warm_rent.csv")

    shapes = [(f, transform(to_laea, shape(f["geometry"]))) for f in gem]
    dest = Path("public/data/agglo")
    dest.mkdir(parents=True, exist_ok=True)

    for name, ags_city, krs, hbf in CITIES:
        station = Point(to_laea(*hbf))
        circle = station.buffer(RADIUS_KM * 1000)
        feats = []
        for f, g in shapes:
            if not g.intersects(circle):
                continue
            ags = f["properties"]["AGS"]
            props = {
                "ags": ags,
                "name": f["properties"]["GEN"],
                "ewz": int(f["properties"].get("EWZ") or 0),
                "dist_km": round(station.distance(g.representative_point()) / 1000, 1),
                "city": ags == ags_city,
            }
            r, w = rent.get(ags), warm.get(ags[:5])
            if r and w:
                cold = float(r["rent_recent"]) * float(r["district_factor"]) * float(w["small_premium"])
                props["warm_m2"] = round(cold + float(w["nk_cold"]) + float(w["nk_warm"]), 2)
                props["own_value"] = r["own_value"] == "1"
            feats.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
        slug = SLUGS[name]
        (dest / f"{slug}.geojson").write_text(json.dumps({
            "type": "FeatureCollection",
            "meta": {"city": name, "station": list(hbf), "radius_km": RADIUS_KM},
            "features": feats,
        }, ensure_ascii=False))
        with_rent = sum(1 for x in feats if "warm_m2" in x["properties"])
        print(f"{name}: {len(feats)} municipalities, {with_rent} with rent")


if __name__ == "__main__":
    main()
