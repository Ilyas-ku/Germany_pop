// Joins district (Kreis) geometry with median wages and rents.
// Inputs (see data-src/ratio/README.md):
//   data-src/ratio/kreise.geojson  – dissolved from Germany_Gemeinde.geojson (npm run build:ratio)
//   data-src/ratio/wage.csv        – ags;name;value  (median gross monthly wage, €)
//   data-src/ratio/rent.csv        – ags;name;value  (average net cold rent, €/m²)
// Output: public/data/kreise_ratio.geojson
import fs from "node:fs";
import path from "node:path";

const FLAT_M2 = 70;
const dir = path.resolve("data-src/ratio");
const outPath = path.resolve("public/data/kreise_ratio.geojson");

function readCsv(file) {
  const rows = new Map();
  const lines = fs.readFileSync(path.join(dir, file), "utf8").trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    const [ags, name, value] = line.split(";");
    const v = Number(value);
    if (/^\d{5}$/.test(ags) && Number.isFinite(v)) rows.set(ags, { name, value: v });
  }
  return rows;
}

const geo = JSON.parse(fs.readFileSync(path.join(dir, "kreise.geojson"), "utf8"));
const wage = readCsv("wage.csv");
const rent = readCsv("rent.csv");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));

const missing = [];
for (const f of geo.features) {
  const ags = f.properties.KRS;
  const w = wage.get(ags), r = rent.get(ags);
  const props = { ags, name: w?.name ?? r?.name ?? f.properties.GEN1 ?? ags };
  if (w && r) {
    props.wage = w.value;
    props.rent = r.value;
    props.ratio = Math.round((w.value / (r.value * FLAT_M2)) * 1000) / 1000;
  } else {
    missing.push(`${ags} wage:${!!w} rent:${!!r}`);
  }
  f.properties = props;
}

geo.meta = meta;
fs.writeFileSync(outPath, JSON.stringify(geo));
console.log(`Wrote ${outPath}: ${geo.features.length} districts, ${missing.length} without data`);
if (missing.length) console.log(missing.join("\n"));
