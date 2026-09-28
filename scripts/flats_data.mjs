// Affordability for a single commuter to a Top-7 city, per distance ring.
// Reads public/data/affordability_rings.json (scripts/affordability_data.py).
//
// Net = gross − income tax − Soli − employee social insurance, 2025 rules,
// single, tax class I, no children, no church tax, statutory health insurance
// with the average Zusatzbeitrag. Income tax from the official BMF PAP
// (lohnsteuerrechner), annual, including the commuting allowance
// (Entfernungspauschale 2025: 0.30 €/km for the first 20 km, 0.38 € beyond,
// 220 working days, straight-line distance to the main station) where it
// exceeds the 1,230 € Werbungskosten lump sum.
// Social insurance 2025 (employee share): RV 9.3 %, AV 1.3 % up to 8,050 €;
// KV 7.3 % + 1.25 %, PV 2.4 % (childless) up to 5,512.50 €.
//
// Rent = asking rent 2025 × small-flat premium + kalte Nebenkosten (gross
// cold rent, the basis of the official Mietbelastung). Heating is not included.
import fs from "node:fs";
import { calculate } from "lohnsteuerrechner";

const YEAR = 2025;
const SHARE = 0.3;
const FLAT_M2 = 60;          // single person, fixed flat size
const TICKET = 58;           // Deutschlandticket 2025, € / month
const KVZ = 2.5;             // average Zusatzbeitrag 2025, %
const WORKDAYS = 220;
const SV = [
  { rate: 0.093 + 0.013, cap: 8050 },
  { rate: 0.073 + KVZ / 200 + 0.024, cap: 5512.5 },
];

const commuteAllowance = (km) => WORKDAYS * (0.3 * Math.min(km, 20) + 0.38 * Math.max(km - 20, 0));

function net(gross, km) {
  const extra = Math.max(0, commuteAllowance(km) - 1230);
  const t = calculate(YEAR, { LZZ: 1, RE4: Math.round(gross * 1200), STKL: 1, KVZ, PVZ: 1, LZZFREIB: Math.round(extra * 100) });
  const tax = (Number(t.LSTLZZ) + Number(t.SOLZLZZ)) / 1200;
  const sv = SV.reduce((s, { rate, cap }) => s + Math.min(gross, cap) * rate, 0);
  return gross - tax - sv;
}

const src = JSON.parse(fs.readFileSync("public/data/affordability_rings.json", "utf8"));
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

const cities = src.cities.map(c => ({
  name: c.name,
  wage: c.wage,
  modes: Object.fromEntries(Object.entries(c.modes).map(([mode, bands]) => [mode,
    Object.fromEntries(Object.entries(bands).map(([b, v]) => {
      const rent = v.rent_asking * v.small_premium + v.utilities;
      const personas = Object.fromEntries(Object.entries(c.wage).map(([p, gross]) => {
        const n = net(gross, v.dist_km);
        return [p, {
          net: round(n),
          cost: round(rent * FLAT_M2),
          share: round((rent * FLAT_M2) / n, 3),
          share_ticket: round((rent * FLAT_M2 + TICKET) / n, 3),
          m2: round((SHARE * n) / rent),
          // previous method: Zensus average rent of existing leases, net cold
          m2_old: round((SHARE * net(gross, 0)) / v.rent_zensus),
        }];
      }));
      return [b, { ...v, rent: round(rent, 2), personas }];
    })),
  ])),
}));

fs.writeFileSync("public/data/flats.json", JSON.stringify({
  meta: {
    share: SHARE,
    flat_m2: FLAT_M2,
    ticket: TICKET,
    tax_year: YEAR,
    bands: src.meta.bands,
    assumptions: "Single, tax class I, no children, no church tax, statutory health insurance with average Zusatzbeitrag (2.5 %), 2025 tax and contribution rules incl. commuting allowance.",
    sources: `${src.meta.sources} Wages: Bundesagentur für Arbeit, workplace, 31.12.2024.`,
  },
  cities,
}, null, 1));

for (const c of cities) {
  const e = c.modes.edge;
  console.log(c.name.padEnd(18), src.meta.bands.map(b => {
    const m = e[b].personas.median, q = e[b].personas.p25;
    return `${b}: ${e[b].rent}€ ${Math.round(m.share * 100)}%/${Math.round(q.share * 100)}% ${m.m2}m² (was ${m.m2_old})`;
  }).join(" | "));
}
