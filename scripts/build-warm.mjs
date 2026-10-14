// District map: monthly net wage ÷ warm rent of a 60 m² flat on a new lease.
// Inputs: data-src/ratio/kreise.geojson (npm run build:ratio), wage_wo.csv,
// wage_ao.csv, warm_rent.csv (scripts/warm_data.py).
// Output: public/data/kreise_warm.geojson
import fs from "node:fs";
import path from "node:path";
import { net, NET_ASSUMPTIONS } from "./net.mjs";

const FLAT_M2 = 60;
const dir = path.resolve("data-src/ratio");

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(path.join(dir, file), "utf8").trim().split(/\r?\n/);
  const keys = head.split(";");
  return new Map(lines.map(line => {
    const row = Object.fromEntries(line.split(";").map((v, i) => [keys[i], v]));
    return [row.ags, row];
  }));
}

const geo = JSON.parse(fs.readFileSync(path.join(dir, "kreise.geojson"), "utf8"));
const wageWo = readCsv("wage_wo.csv");
const wageAo = readCsv("wage_ao.csv");
const warm = readCsv("warm_rent.csv");
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// "München" next to "München, Landeshauptstadt" -> "München (Landkreis)"
const names = geo.features.map(f => wageAo.get(f.properties.KRS)?.name ?? f.properties.KRS);
const label = (n) => !n.includes(",") && names.some(o => o.startsWith(`${n},`)) ? `${n} (Landkreis)` : n;

for (const f of geo.features) {
  const ags = f.properties.KRS;
  const w = warm.get(ags), wo = wageWo.get(ags), ao = wageAo.get(ags);
  const cold = Number(w.asking) * Number(w.small_premium);
  const warmM2 = cold + Number(w.nk_cold) + Number(w.nk_warm);
  const props = {
    ags,
    name: label(ao?.name ?? w.name),
    asking: Number(w.asking),
    cold_m2: round(cold, 2),
    nk_cold: Number(w.nk_cold),
    nk_warm: Number(w.nk_warm),
    warm_m2: round(warmM2, 2),
    warm_flat: Math.round(warmM2 * FLAT_M2),
    coverage: Number(wo.coverage),
  };
  for (const [k, row] of [["wo", wo], ["ao", ao]]) {
    const gross = Number(row.value);
    const n = net(gross);
    props[`gross_${k}`] = gross;
    props[`net_${k}`] = Math.round(n);
    props[`ratio_${k}`] = round(n / (warmM2 * FLAT_M2), 3);
  }
  f.properties = props;
}

geo.meta = {
  flat_m2: FLAT_M2,
  net: NET_ASSUMPTIONS,
  attribution: "Wages: Bundesagentur für Arbeit 31.12.2024. Rent: BBSR asking rents 2025; Zensus 2022 (flat size); Mikrozensus 2022 (utilities).",
};
fs.writeFileSync(path.resolve("public/data/kreise_warm.geojson"), JSON.stringify(geo));

const r = geo.features.map(f => f.properties).sort((a, b) => b.ratio_wo - a.ratio_wo);
const q = (p) => r[Math.floor(p * (r.length - 1))].ratio_wo;
console.log("ratio_wo quantiles (high→low)", [0, .1, .25, .5, .75, .9, 1].map(q));
console.log("top", r.slice(0, 5).map(p => `${p.name} ${p.ratio_wo}`));
console.log("bottom", r.slice(-5).map(p => `${p.name} ${p.ratio_wo}`));
