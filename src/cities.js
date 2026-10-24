import "./agglo.css";
import { C, FONT, GLOW, house, skyline } from "./neon.js";

// All seven agglomerations on one sheet: flat size for 30 % of net pay
// in the centre and every 10 km out. Same scale in every row.
const BASE = import.meta.env.BASE_URL;
const CITIES = [
  ["berlin", "Berlin"], ["hamburg", "Hamburg"], ["muenchen", "Munich"], ["koeln", "Cologne"],
  ["frankfurt", "Frankfurt"], ["stuttgart", "Stuttgart"], ["duesseldorf", "Düsseldorf"],
];
const STOPS = ["0", "10", "20", "30", "40"];
const DISTS = ["Centre", "10 km", "20 km", "30 km", "40 km"];
const WAGE_LABEL = { median: "Median", p25: "Lower-quarter" };

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

let persona = "median";
let summary = null;

function rows() {
  return CITIES.map(([slug, name]) => {
    const c = summary[slug];
    return { name, net: c.net[persona], budget: c.net[persona] * c.share, m2: STOPS.map(s => c.stops[s].m2[persona]) };
  });
}

function horizontal() {
  const W = 1180, cols = [410, 580, 750, 920, 1090], rowH = 240, top0 = 80;
  const H = top0 + rowH * CITIES.length + 10;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flat size affordable with 30 % of net pay in seven German cities at 0 to 40 km from the centre"><defs>${GLOW}</defs>`;
  DISTS.forEach((d, i) => { s += `<text x="${cols[i]}" y="40" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="15">${d}</text>`; });
  rows().forEach((r, i) => {
    const gy = top0 + i * rowH + rowH - 30;
    if (i) s += `<line x1="0" x2="${W}" y1="${gy - rowH + 30}" y2="${gy - rowH + 30}" stroke="${C.line}"/>`;
    s += `<text x="0" y="${gy - 70}" fill="${C.fg}" font-family='${FONT.display}' font-weight="700" font-size="30">${esc(r.name)}</text>`;
    s += `<text x="0" y="${gy - 40}" fill="${C.muted}" font-family='${FONT.body}' font-size="16">net ${fmt(r.net)} €</text>`;
    s += `<text x="0" y="${gy - 16}" fill="${C.muted}" font-family='${FONT.body}' font-size="16">${fmt(r.budget)} € for rent</text>`;
    s += skyline(258, gy);
    s += `<line x1="250" x2="${W}" y1="${gy}" y2="${gy}" stroke="${C.ground}" stroke-width="2"/>`;
    r.m2.forEach((m, j) => { s += house(cols[j], gy, m); });
  });
  return s + `</svg>`;
}

// Phone: five narrow columns per city, houses at 40 % scale
function vertical() {
  const W = 390, pad = 4, cols = [44, 120, 196, 272, 348], rowH = 150, top0 = 30, k = 0.42;
  const H = top0 + rowH * CITIES.length + 6;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flat size affordable with 30 % of net pay in seven German cities at 0 to 40 km from the centre"><defs>${GLOW}</defs>`;
  DISTS.forEach((d, i) => { s += `<text x="${cols[i]}" y="16" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="11">${d}</text>`; });
  rows().forEach((r, i) => {
    const top = top0 + i * rowH, gy = top + rowH - 14;
    s += `<line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="${C.line}"/>`;
    s += `<text x="${pad}" y="${top + 26}" fill="${C.fg}" font-family='${FONT.display}' font-weight="700" font-size="19">${esc(r.name)}</text>`;
    s += `<text x="${W - pad}" y="${top + 25}" text-anchor="end" fill="${C.muted}" font-family='${FONT.body}' font-size="12">net ${fmt(r.net)} € · ${fmt(r.budget)} € for rent</text>`;
    s += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="${C.ground}" stroke-width="1.5"/>`;
    r.m2.forEach((m, j) => { s += house(cols[j], gy, m, { k, font: 15, gap: 7 }); });
  });
  return s + `</svg>`;
}

function render() {
  document.getElementById("sub").textContent =
    `${WAGE_LABEL[persona]} wage in the city, single, warm rent of a new lease. Bigger house = bigger flat (sizes exaggerated). Label colour shows the 60 m² threshold.`;
  const el = document.getElementById("compare");
  el.innerHTML = el.clientWidth < 700 ? vertical() : horizontal();
}

document.querySelectorAll('input[name="persona"]').forEach(el => el.addEventListener("change", (e) => {
  persona = e.target.value;
  render();
}));

let lastW = 0;
new ResizeObserver(() => {
  const w = document.getElementById("compare").clientWidth;
  if (summary && (w < 700) !== (lastW < 700)) render();
  lastW = w;
}).observe(document.getElementById("compare"));

fetch(`${BASE}data/agglo/summary.json`).then(r => r.json()).then((d) => { summary = d; render(); });

