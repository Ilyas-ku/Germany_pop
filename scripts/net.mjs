// Monthly net wage from monthly gross, 2025 rules: single, tax class I, no
// children, no church tax, statutory health insurance with the average
// Zusatzbeitrag. Income tax from the official BMF PAP (lohnsteuerrechner),
// computed on the annual wage, optionally with the commuting allowance
// (Entfernungspauschale 2025: 0.30 €/km for the first 20 km, 0.38 € beyond,
// 220 working days) where it exceeds the 1,230 € Werbungskosten lump sum.
// Social insurance 2025 (employee share): RV 9.3 %, AV 1.3 % up to 8,050 €;
// KV 7.3 % + 1.25 %, PV 2.4 % (childless) up to 5,512.50 €.
import { calculate } from "lohnsteuerrechner";

export const TAX_YEAR = 2025;
export const NET_ASSUMPTIONS = "Single, tax class I, no children, no church tax, statutory health insurance with average Zusatzbeitrag (2.5 %), 2025 tax and contribution rules.";

const KVZ = 2.5;
const WORKDAYS = 220;
const SV = [
  { rate: 0.093 + 0.013, cap: 8050 },
  { rate: 0.073 + KVZ / 200 + 0.024, cap: 5512.5 },
];

const commuteAllowance = (km) => WORKDAYS * (0.3 * Math.min(km, 20) + 0.38 * Math.max(km - 20, 0));

export function net(gross, commuteKm = 0) {
  const extra = Math.max(0, commuteAllowance(commuteKm) - 1230);
  const t = calculate(TAX_YEAR, { LZZ: 1, RE4: Math.round(gross * 1200), STKL: 1, KVZ, PVZ: 1, LZZFREIB: Math.round(extra * 100) });
  const tax = (Number(t.LSTLZZ) + Number(t.SOLZLZZ)) / 1200;
  const sv = SV.reduce((s, { rate, cap }) => s + Math.min(gross, cap) * rate, 0);
  return gross - tax - sv;
}
