// Affordability for a single commuter to a Top-7 city, per distance ring.
// Reads public/data/affordability_rings.json (scripts/affordability_data.py).
//
// Net income: see scripts/net.mjs (with the commuting allowance for the
// straight-line distance to the main station).
//
// Warm rent = asking rent for a new lease × small-flat premium + utilities +
// heating and hot water paid to the landlord (Bruttowarmmiete). The asking rent
// follows BBSR 2025 per district, spread within the district by the rents of
// recent movers (see scripts/affordability_data.py).
import fs from "node:fs";
import { net, TAX_YEAR, NET_ASSUMPTIONS } from "./net.mjs";

const SHARE = 0.3;
const FLAT_M2 = 60;          // single person, fixed flat size
const TICKET = 58;           // Deutschlandticket 2025, € / month

const src = JSON.parse(fs.readFileSync("public/data/affordability_rings.json", "utf8"));
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

const cities = src.cities.map(c => ({
  name: c.name,
  wage: c.wage,
  modes: Object.fromEntries(Object.entries(c.modes).map(([mode, bands]) => [mode,
    Object.fromEntries(Object.entries(bands).map(([b, v]) => {
      const rent = v.rent_asking * v.small_premium + v.nk_cold + v.nk_warm;
      // previous version, for comparison: all-lease pattern, no heating
      const rentPrev = v.rent_old_method * v.small_premium + v.nk_cold;
      const personas = Object.fromEntries(Object.entries(c.wage).map(([p, gross]) => {
        const n = net(gross, v.dist_km);
        return [p, {
          net: round(n),
          cost: round(rent * FLAT_M2),
          share: round((rent * FLAT_M2) / n, 3),
          share_ticket: round((rent * FLAT_M2 + TICKET) / n, 3),
          m2: round((SHARE * n) / rent),
          share_prev: round((rentPrev * FLAT_M2) / n, 3),
          // first version: Zensus average rent of existing leases, net cold
          m2_old: round((SHARE * net(gross, 0)) / v.rent_zensus),
        }];
      }));
      return [b, { ...v, rent: round(rent, 2), rent_prev: round(rentPrev, 2), personas }];
    })),
  ])),
}));

fs.writeFileSync("public/data/flats.json", JSON.stringify({
  meta: {
    share: SHARE,
    flat_m2: FLAT_M2,
    ticket: TICKET,
    tax_year: TAX_YEAR,
    bands: src.meta.bands,
    stops: src.meta.stops,
    assumptions: `${NET_ASSUMPTIONS} Includes the commuting allowance.`,
    sources: `${src.meta.sources} Wages: Bundesagentur für Arbeit, workplace, 31.12.2024.`,
  },
  cities,
}, null, 1));

for (const c of cities) {
  const e = c.modes.edge;
  console.log(c.name.padEnd(18), src.meta.bands.map(b => {
    const m = e[b].personas.median, q = e[b].personas.p25;
    return `${b}: ${e[b].rent}€ ${Math.round(m.share * 100)}%/${Math.round(q.share * 100)}% (prev ${Math.round(m.share_prev * 100)}%) ${m.m2}m²`;
  }).join(" | "));
}
