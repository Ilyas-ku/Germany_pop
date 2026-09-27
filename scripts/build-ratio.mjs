// Joins district (Kreis) geometry with wages and rents.
// Inputs (created by `npm run ratio:data`, see scripts/ratio_data.py):
//   data-src/ratio/kreise.geojson – simplified districts (npm run build:ratio)
//   data-src/ratio/rent.csv       – ags;name;value (net cold rent, €/m²)
//   data-src/ratio/wage_wo.csv    – ags;name;value;coverage (median wage at residence, €)
//   data-src/ratio/wage_ao.csv    – ags;name;value (median wage at workplace, €)
// Output: public/data/kreise_ratio.geojson
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("data-src/ratio");
const outPath = path.resolve("public/data/kreise_ratio.geojson");

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(path.join(dir, file), "utf8").trim().split(/\r?\n/);
  const keys = head.split(";");
  return new Map(lines.map(line => {
    const row = Object.fromEntries(line.split(";").map((v, i) => [keys[i], v]));
    return [row.ags, row];
  }));
}

const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
const geo = JSON.parse(fs.readFileSync(path.join(dir, "kreise.geojson"), "utf8"));
const rent = readCsv("rent.csv");
const wageWo = readCsv("wage_wo.csv");
const wageAo = readCsv("wage_ao.csv");

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const missing = [];

for (const f of geo.features) {
  const ags = f.properties.KRS;
  const r = rent.get(ags), wo = wageWo.get(ags), ao = wageAo.get(ags);
  // BA names are unique ("Hof, Stadt" vs "Hof"); Zensus names are not
  const props = { ags, name: ao?.name ?? r?.name ?? ags };

  if (r) {
    props.rent = Number(r.value);
    const monthly = props.rent * meta.flat_m2;
    if (wo) {
      props.wage_wo = Number(wo.value);
      props.coverage = Number(wo.coverage);
      props.ratio_wo = round(props.wage_wo / monthly, 3);
    }
    if (ao) {
      props.wage_ao = Number(ao.value);
      props.ratio_ao = round(props.wage_ao / monthly, 3);
    }
  }
  if (props.ratio_wo == null || props.ratio_ao == null) missing.push(ags);
  f.properties = props;
}

// "München" next to "München, Landeshauptstadt" -> "München (Landkreis)"
const names = geo.features.map(f => f.properties.name);
for (const f of geo.features) {
  const n = f.properties.name;
  if (!n.includes(",") && names.some(o => o.startsWith(`${n},`))) f.properties.name = `${n} (Landkreis)`;
}

geo.meta = meta;
fs.writeFileSync(outPath, JSON.stringify(geo));
console.log(`Wrote ${outPath}: ${geo.features.length} districts, ${missing.length} incomplete ${missing.join(" ")}`);
