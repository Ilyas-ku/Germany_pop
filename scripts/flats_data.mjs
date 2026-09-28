// Net wage and affordable flat size (30 % of net on net cold rent) for the
// Top-7 commuter rings. Reads public/data/commute.json (npm run commute:data).
//
// Net = gross − Lohnsteuer − Soli − employee social insurance, 2025 rules,
// single, tax class I, no children, no church tax, statutory health insurance
// with the average Zusatzbeitrag. Lohnsteuer from the official BMF PAP
// (lohnsteuerrechner). Social insurance 2025 (employee share):
// RV 9.3 %, AV 1.3 % up to 8,050 €; KV 7.3 % + 1.25 %, PV 2.4 % (childless) up to 5,512.50 €.
import fs from "node:fs";
import { calculate } from "lohnsteuerrechner";

const YEAR = 2025;
const SHARE = 0.3;
const KVZ = 2.5; // average Zusatzbeitrag 2025, %
const SV = [
  { rate: 0.093 + 0.013, cap: 8050 },        // pension + unemployment
  { rate: 0.073 + KVZ / 200 + 0.024, cap: 5512.5 }, // health + care (childless)
];

function net(gross) {
  const t = calculate(YEAR, { LZZ: 2, RE4: Math.round(gross * 100), STKL: 1, KVZ, PVZ: 1 });
  const tax = (Number(t.LSTLZZ) + Number(t.SOLZLZZ)) / 100;
  const sv = SV.reduce((s, { rate, cap }) => s + Math.min(gross, cap) * rate, 0);
  return { tax, sv, net: gross - tax - sv };
}

const src = JSON.parse(fs.readFileSync("public/data/commute.json", "utf8"));
const cities = src.cities.map(c => {
  const n = net(c.wage);
  const budget = n.net * SHARE;
  const modes = Object.fromEntries(Object.entries(c.modes).map(([mode, bands]) => [mode,
    Object.fromEntries(Object.entries(bands).map(([b, v]) => [b, { rent: v.rent, m2: Math.round(budget / v.rent) }])),
  ]));
  return {
    name: c.name,
    gross: c.wage,
    tax: Math.round(n.tax),
    social: Math.round(n.sv),
    net: Math.round(n.net),
    budget: Math.round(budget),
    modes,
  };
});

fs.writeFileSync("public/data/flats.json", JSON.stringify({
  meta: {
    share: SHARE,
    tax_year: YEAR,
    bands: src.meta.bands,
    assumptions: "Single, tax class I, no children, no church tax, statutory health insurance with average Zusatzbeitrag (2.5 %), 2025 tax and contribution rules.",
    attribution: src.meta.attribution,
  },
  cities,
}, null, 1));

for (const c of cities) {
  console.log(c.name.padEnd(18), c.gross, "→ net", c.net, "budget", c.budget, "| edge m²:",
    src.meta.bands.map(b => c.modes.edge[b]?.m2).join(" / "));
}
