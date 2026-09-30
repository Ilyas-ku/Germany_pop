// Adds net pay and affordable flat size to the agglomeration maps.
// Reads public/data/agglo/<slug>.geojson (scripts/agglo_data.py) and the city
// wages from public/data/flats.json (scripts/flats_data.mjs), writes back.
// For every municipality: a single person earning the city's median (or 25th
// percentile) wage, commuting allowance for the straight-line distance to the
// main station, 30 % of net pay spent on warm rent.
import fs from "node:fs";
import path from "node:path";
import { net } from "./net.mjs";

const SHARE = 0.3;
const FLAT_M2 = 60;
const dir = path.resolve("public/data/agglo");
const flats = JSON.parse(fs.readFileSync("public/data/flats.json", "utf8"));
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".geojson"))) {
  const geo = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const city = flats.cities.find(c => c.name === geo.meta.city);
  for (const f of geo.features) {
    const p = f.properties;
    if (!p.warm_m2) continue;
    for (const [persona, gross] of Object.entries(city.wage)) {
      const n = net(gross, p.city ? 0 : p.dist_km);
      p[`m2_${persona}`] = round((SHARE * n) / p.warm_m2);
      p[`share_${persona}`] = round((p.warm_m2 * FLAT_M2) / n, 3);
    }
  }
  geo.meta = {
    ...geo.meta,
    wage: city.wage,
    net: Object.fromEntries(Object.entries(city.wage).map(([k, g]) => [k, Math.round(net(g))])),
    share: SHARE,
    flat_m2: FLAT_M2,
    stops: Object.fromEntries(flats.meta.stops.map(s => [s, city.modes.stops[s]])),
  };
  fs.writeFileSync(path.join(dir, file), JSON.stringify(geo));
  const vals = geo.features.map(f => f.properties.m2_median).filter(Boolean).sort((a, b) => a - b);
  console.log(file, geo.features.length, "m² median-earner range", vals[0], "–", vals.at(-1));
}
