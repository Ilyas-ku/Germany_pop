import "maplibre-gl/dist/maplibre-gl.css";
import "./agglo.css";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";

const BASE = import.meta.env.BASE_URL;
const CITIES = [
  ["berlin", "Berlin"], ["hamburg", "Hamburg"], ["muenchen", "Munich"], ["koeln", "Cologne"],
  ["frankfurt", "Frankfurt"], ["stuttgart", "Stuttgart"], ["duesseldorf", "Düsseldorf"],
];
const STOPS = ["0", "10", "20", "30", "40"];
const REF_M2 = 60;
const WAGE_LABEL = { median: "Median", p25: "Lower-quarter" };

// Map classes: affordable flat size for 30 % of net pay
// coral below the 60 m² reference flat, teal from 60 m², as in the infographic
const COLORS = ["#d9533a", "#f08b6e", "#fbc9b8", "#7cc7b8", "#16655c"];
const BREAKS = [45, 52, 60, 70];
const NO_DATA = "#dedad2";

const fmtEur = (v) => `${Math.round(v).toLocaleString("en-US")} €`;
const fmt1 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v) => `${Math.round(v * 100)} %`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

let slug = new URLSearchParams(location.search).get("city") || "muenchen";
let persona = "median";
let data = null;
const cache = new Map();

/* ---------- infographic ---------- */

// ---- illustration parts (flat style with a little depth) ----

// House standing on (cx, base); facade width w grows linearly with flat size
function house(cx, base, w, cls = "home") {
  const d = w * 0.2, dy = d * 0.5, h = w * 0.62, rh = w * 0.44, ov = w * 0.07;
  const x = cx - (w + d) / 2, top = base - h, mid = x + w / 2;
  if (cls === "ghost") {
    return `<path d="M${x} ${base} V${top} H${x + w} V${base} M${x - ov} ${top} L${mid} ${top - rh} L${x + w + ov} ${top}" class="ghost"/>`;
  }
  const win = (wx) => `<g class="win"><rect x="${wx}" y="${top + h * 0.2}" width="${w * 0.2}" height="${w * 0.2}" rx="${w * 0.02}"/>` +
    `<path d="M${wx + w * 0.1} ${top + h * 0.2} v${w * 0.2} M${wx} ${top + h * 0.2 + w * 0.1} h${w * 0.2}"/></g>`;
  return `<g class="home">
    <ellipse cx="${cx + d * 0.3}" cy="${base + 2}" rx="${(w + d) * 0.62}" ry="${Math.max(3, w * 0.05)}" class="shadow"/>
    <path d="M${x + w} ${base} L${x + w + d} ${base - dy} V${top - dy} L${x + w} ${top} Z" class="side"/>
    <rect x="${x}" y="${top}" width="${w}" height="${h}" class="facade"/>
    <path d="M${mid} ${top - rh} L${mid + d} ${top - rh - dy} L${x + w + ov + d} ${top - dy} L${x + w + ov} ${top} Z" class="roof-side"/>
    <path d="M${x - ov} ${top} L${mid} ${top - rh} L${x + w + ov} ${top} Z" class="roof"/>
    <circle cx="${mid}" cy="${top - rh * 0.38}" r="${w * 0.055}" class="attic"/>
    ${win(x + w * 0.1)}${win(x + w * 0.7)}
    <path d="M${mid - w * 0.1} ${base} V${base - h * 0.42} a${w * 0.1} ${w * 0.1} 0 0 1 ${w * 0.2} 0 V${base} Z" class="door"/>
    <circle cx="${mid + w * 0.055}" cy="${base - h * 0.22}" r="${Math.max(1.2, w * 0.012)}" class="knob"/>
    <circle cx="${x - w * 0.02}" cy="${base - w * 0.07}" r="${w * 0.1}" class="bush"/>
    <circle cx="${x + w * 0.1}" cy="${base - w * 0.05}" r="${w * 0.075}" class="bush2"/>
  </g>`;
}

// Small car driving right, wheels on line y; the driver sits in the front window
function car(x, y) {
  return `<g transform="translate(${x} ${y})">
    <ellipse cx="63" cy="1" rx="66" ry="5" class="shadow"/>
    <path d="M-40 -34 h26 M-48 -22 h32 M-38 -10 h20" class="speed"/>
    <path d="M0 -18 Q0 -30 12 -32 L30 -34 L46 -54 Q50 -58 56 -58 H86 Q92 -58 96 -53 L110 -36 L118 -34 Q126 -32 126 -22 V-14 Q126 -10 122 -10 H4 Q0 -10 0 -14 Z" class="car-halo"/>
    <path d="M0 -18 Q0 -30 12 -32 L30 -34 L46 -54 Q50 -58 56 -58 H86 Q92 -58 96 -53 L110 -36 L118 -34 Q126 -32 126 -22 V-14 Q126 -10 122 -10 H4 Q0 -10 0 -14 Z" class="car"/>
    <path d="M49 -52 H70 V-37 H36 Z" class="glass"/>
    <path d="M74 -52 H93 L105 -37 H74 Z" class="glass"/>
    <circle cx="86" cy="-44" r="6.5" class="skin"/>
    <path d="M79.5 -45 q1 -8 7 -8 q6 0 7 6 q-6 -3 -14 2 z" class="hair"/>
    <path d="M72 -34 V-14" class="seam"/>
    <rect x="119" y="-29" width="7" height="5" rx="2" class="headlight"/>
    <rect x="0" y="-29" width="5" height="6" rx="2" class="taillight"/>
    <circle cx="26" cy="-10" r="11" class="tyre"/><circle cx="26" cy="-10" r="4.5" class="hub"/>
    <circle cx="100" cy="-10" r="11" class="tyre"/><circle cx="100" cy="-10" r="4.5" class="hub"/>
  </g>`;
}

// Same car seen from above, pointing down (phone layout)
function carTop(cx, cy) {
  return `<g transform="translate(${cx} ${cy})">
    <rect x="-17" y="-32" width="34" height="64" rx="12" class="car-halo"/>
    <rect x="-3" y="-60" width="6" height="18" rx="3" class="speed-v"/><rect x="-11" y="-54" width="4" height="12" rx="2" class="speed-v"/><rect x="7" y="-54" width="4" height="12" rx="2" class="speed-v"/>
    <rect x="-17" y="-32" width="34" height="64" rx="12" class="car"/>
    <path d="M-13 8 Q0 2 13 8 L11 20 Q0 17 -11 20 Z" class="glass"/>
    <rect x="-12" y="-14" width="24" height="20" rx="5" class="roofcar"/>
    <path d="M-11 -22 Q0 -18 11 -22 L12 -16 H-12 Z" class="glass"/>
    <rect x="-13" y="27" width="7" height="4" rx="2" class="headlight"/><rect x="6" y="27" width="7" height="4" rx="2" class="headlight"/>
  </g>`;
}

// German "leaving town" sign: yellow plate, city name, thin red diagonal bar
function ortsschild(cx, base, name, scale = 1) {
  const w = (Math.max(56, name.length * 10.5) + 18) * scale, h = 40 * scale, y = base - 64 * scale;
  return `<g class="ort">
    <rect x="${cx - 2.5 * scale}" y="${y + h}" width="${5 * scale}" height="${base - y - h}" class="post"/>
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${5 * scale}" class="plate"/>
    <text x="${cx}" y="${y + h / 2 + 5 * scale}" text-anchor="middle" class="t-ort" font-size="${14 * scale}">${esc(name)}</text>
    <line x1="${cx - w / 2 + 6 * scale}" y1="${y + h - 6 * scale}" x2="${cx + w / 2 - 6 * scale}" y2="${y + 6 * scale}" class="bar"/>
  </g>`;
}

// City: a back row of towers on the horizon and a front row that the road
// runs out from between. Returns [back, front] so the road can go in between.
function city(cx, base, front, s = 1) {
  const tower = (x, w, h, b, cls) => {
    const cols = Math.max(1, Math.floor((w - 8 * s) / (9 * s)));
    const rows = Math.max(1, Math.floor((h - 14 * s) / (13 * s)));
    let win = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r * 7 + c * 3 + Math.round(x)) % 5 === 0) continue;
        win += `<rect x="${x + 5 * s + c * 9 * s}" y="${b - h + 9 * s + r * 13 * s}" width="${5 * s}" height="${6 * s}" class="cwin"/>`;
      }
    }
    return `<rect x="${x}" y="${b - h}" width="${w}" height="${h}" rx="${2 * s}" class="${cls}"/>${win}`;
  };
  const back = [[-104, 34, 118], [-66, 42, 168], [-20, 30, 128], [14, 46, 196], [64, 36, 150], [104, 30, 108]]
    .map(([dx, w, h], i) => tower(cx + dx * s, w * s, h * s, base, `tw${i % 3}`)).join("") +
    `<path d="M${cx + 37 * s} ${base - 196 * s} V${base - 232 * s}" class="antenna"/><circle cx="${cx + 37 * s}" cy="${base - 212 * s}" r="${5 * s}" class="antenna-ball"/>`;
  const fr = [[-128, 58, 64], [-66, 50, 50], [-12, 44, 70], [36, 62, 44]]
    .map(([dx, w, h]) => tower(cx + dx * s, w * s, h * s, front, "front")).join("");
  return [`<g>${back}</g>`, `<g>${fr}</g>`];
}

const STORY_CSS = `
  .bg0{stop-color:#bfe0ff}.bg1{stop-color:#fff3e4}
  .hill{fill:#d5ead0}.hill2{fill:#bfe0b5}.ground{fill:#f1e8d6}
  .road{fill:#30333b}.lane{stroke:#fff;stroke-width:3;stroke-dasharray:18 14}.kerb{stroke:#fffdf8;stroke-width:2;opacity:.6}
  .sun{fill:#ffd166}
  .tw0{fill:#243150}.tw1{fill:#31416a}.tw2{fill:#435785}.front{fill:#1b2540}.cwin{fill:#ffe39a;opacity:.75}
  .antenna{stroke:#243150;stroke-width:3}.antenna-ball{fill:#243150}
  .shadow{fill:#14161c;opacity:.12}
  .facade{fill:#fbe3c6}.side{fill:#e9bf95}.roof{fill:#dc5a3c}.roof-side{fill:#b8432a}
  .attic{fill:#bfe0ff;stroke:#fff;stroke-width:1.5}
  .win rect{fill:#bfe0ff;stroke:#fff;stroke-width:2}.win path{stroke:#fff;stroke-width:1.6}
  .door{fill:#7a4a2a}.knob{fill:#ffd166}.bush{fill:#6fae5f}.bush2{fill:#8cc47a}
  .ghost{fill:none;stroke:#14161c;stroke-width:1.8;stroke-dasharray:6 5;opacity:.5}
  .car{fill:#2563eb}.car-halo{fill:none;stroke:#fffdf8;stroke-width:7;stroke-linejoin:round}
  .glass{fill:#d6ecff}.roofcar{fill:#1d4fbd}.seam{stroke:#1d4fbd;stroke-width:1.5}
  .skin{fill:#f1c9a5}.hair{fill:#3b2a20}
  .tyre{fill:#15171c;stroke:#fffdf8;stroke-width:2}.hub{fill:#c9ccd2}
  .headlight{fill:#ffd84d}.taillight{fill:#ff4d3d}
  .speed{stroke:#fffdf8;stroke-width:4;stroke-linecap:round;opacity:.85}.speed-v{fill:#fffdf8;opacity:.8}
  .plate{fill:#ffd500;stroke:#14161c;stroke-width:2.5}.post{fill:#6b6e75}
  .bar{stroke:#e2231a;stroke-width:3;stroke-linecap:round;opacity:.9}
  .t-ort{font-family:Inter,system-ui,sans-serif;font-weight:800;fill:#14161c}
  .t-title{font:800 34px Inter,system-ui,sans-serif;fill:#14161c;letter-spacing:-.02em}
  .t-sub{font:500 17px Inter,system-ui,sans-serif;fill:#3c3f47}
  .t-m2{font:800 30px Inter,system-ui,sans-serif;fill:#14161c;letter-spacing:-.02em}
  .t-km{font:700 15px Inter,system-ui,sans-serif;fill:#14161c}
  .t-det{font:500 13px Inter,system-ui,sans-serif;fill:#3c3f47}
  .t-foot{font:400 11px Inter,system-ui,sans-serif;fill:#6b6e75}
  .t-leg{font:600 13px Inter,system-ui,sans-serif;fill:#14161c}
  .pill{fill:#14161c}.t-pill{font:800 15px Inter,system-ui,sans-serif;fill:#fffdf8}
`;

function storyNumbers() {
  const m = data.meta, net = m.net[persona];
  return {
    gross: m.wage[persona], net, budget: net * m.share,
    town: m.city.split(" am ")[0],
    stops: STOPS.map(s => ({ km: +s, rent: m.stops[s].rent, ...m.stops[s].personas[persona] })),
  };
}

function storyHorizontal(title) {
  const n = storyNumbers();
  const W = 1200, H = 660, base = 452, roadY = 458, roadH = 50;
  const cityX = 150, xs = [cityX, 540, 725, 910, 1095];
  // facade width grows linearly with flat size, so differences stand out
  const w60 = 104, width = (m2) => w60 * m2 / REF_M2;
  const [back, front] = city(cityX, base, roadY + roadH + 10, 0.86);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}: flat size for 30 % of net pay every 10 km from the centre">
  <style>${STORY_CSS}</style>
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bg0"/><stop offset="1" class="bg1"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="1105" cy="92" r="42" class="sun"/>
  <path d="M0 ${base - 40} C 200 ${base - 110}, 380 ${base - 20}, 560 ${base - 70} S 900 ${base - 120}, 1200 ${base - 50} V ${H} H 0 Z" class="hill"/>
  <path d="M0 ${base - 10} C 260 ${base - 60}, 520 ${base}, 760 ${base - 36} S 1060 ${base - 60}, 1200 ${base - 20} V ${H} H 0 Z" class="hill2"/>
  <rect y="${base}" width="${W}" height="${H - base}" class="ground"/>
  ${back}
  <rect x="${cityX}" y="${roadY}" width="${W - cityX}" height="${roadH}" class="road"/>
  <line x1="${cityX}" x2="${W}" y1="${roadY + 2}" y2="${roadY + 2}" class="kerb"/><line x1="${cityX}" x2="${W}" y1="${roadY + roadH - 2}" y2="${roadY + roadH - 2}" class="kerb"/>
  <line x1="${cityX}" x2="${W}" y1="${roadY + roadH / 2}" y2="${roadY + roadH / 2}" class="lane"/>
  ${front}
  <text x="44" y="64" class="t-title">${esc(title)}</text>
  <text x="44" y="98" class="t-sub">${WAGE_LABEL[persona]} gross pay <tspan font-weight="800">${fmtEur(n.gross)}</tspan> → net <tspan font-weight="800">${fmtEur(n.net)}</tspan> → <tspan font-weight="800">${fmtEur(n.budget)}</tspan> a month for warm rent (30 %)</text>
  <g transform="translate(44 126)">${house(14, 22, 20)}<text x="36" y="18" class="t-leg">the wider the house, the bigger the flat you can rent</text>
    ${house(500, 22, 20, "ghost")}<text x="522" y="18" class="t-leg">a 60 m² flat for comparison</text></g>`;

  n.stops.forEach((st, i) => {
    const x = xs[i];
    if (i === 0) {
      s += `<rect x="${x - 60}" y="${base - 262}" width="120" height="38" rx="19" class="pill"/>`;
      s += `<text x="${x}" y="${base - 236}" text-anchor="middle" class="t-pill">${st.m2} m²</text>`;
    } else {
      const w = width(st.m2);
      s += house(x, base, w60, "ghost");
      s += house(x, base, w);
      const top = base - Math.max(w, w60) * 1.12 - 16;
      s += `<text x="${x}" y="${top}" text-anchor="middle" class="t-m2">${st.m2} m²</text>`;
    }
    const ty = roadY + roadH + (i === 0 ? 46 : 32);
    s += `<text x="${x}" y="${ty}" text-anchor="middle" class="t-km">${i === 0 ? "Centre" : `${st.km} km`}</text>`;
    s += `<text x="${x}" y="${ty + 22}" text-anchor="middle" class="t-det">${fmt1(st.rent)} €/m² warm</text>`;
    s += `<text x="${x}" y="${ty + 42}" text-anchor="middle" class="t-det">60 m² = ${pct(st.share)} of net</text>`;
  });
  // leaving town: sign right where the road leaves the city, car driving away
  s += ortsschild(310, base, n.town);
  s += car(356, roadY + roadH - 6);
  s += `<text x="44" y="${H - 14}" class="t-foot">Warm rent of a new lease: BBSR asking rents 2025, Zensus 2022, Mikrozensus 2022. Net pay: single, tax class I, 2025 rules. Each house: ±5 km from the main station.</text>`;
  return s + `</svg>`;
}

function storyVertical(title) {
  const n = storyNumbers();
  const W = 390, top = 150, cityBase = top + 150, rowH = 150, first = cityBase + 150;
  const H = first + rowH * 4 + 10;
  const roadX = 52, hx = 150, w60 = 66, width = (m2) => w60 * m2 / REF_M2;
  const [back, front] = city(roadX + 64, cityBase, cityBase + 28, 0.55);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}: flat size for 30 % of net pay every 10 km from the centre">
  <style>${STORY_CSS}</style>
  <defs><linearGradient id="skyv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bg0"/><stop offset=".3" class="bg1"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#skyv)"/>
  <circle cx="362" cy="26" r="20" class="sun"/>
  ${back}
  <rect x="${roadX - 20}" y="${cityBase - 6}" width="40" height="${H - cityBase - 30}" rx="8" class="road"/>
  <line x1="${roadX}" x2="${roadX}" y1="${cityBase + 30}" y2="${H - 44}" class="lane"/>
  ${front}
  <text x="20" y="48" class="t-title" font-size="28">${esc(title)}</text>
  <text x="20" y="78" class="t-sub" font-size="14">${WAGE_LABEL[persona]} gross ${fmtEur(n.gross)} → net ${fmtEur(n.net)}</text>
  <text x="20" y="100" class="t-sub" font-size="14"><tspan font-weight="800">${fmtEur(n.budget)}</tspan> a month for warm rent (30 %)</text>
  <g transform="translate(20 126)">${house(10, 16, 16)}<text x="30" y="14" class="t-leg" font-size="12">wider = bigger flat</text>
    ${house(196, 16, 16, "ghost")}<text x="214" y="14" class="t-leg" font-size="12">a 60 m² flat</text></g>`;
  const centre = n.stops[0];
  s += `<text x="232" y="${cityBase - 58}" class="t-m2" font-size="28">${centre.m2} m²</text>`;
  s += `<text x="232" y="${cityBase - 36}" class="t-km">Centre</text>`;
  s += `<text x="232" y="${cityBase - 16}" class="t-det">${fmt1(centre.rent)} €/m² warm</text>`;
  s += `<text x="232" y="${cityBase + 2}" class="t-det">60 m² = ${pct(centre.share)} of net</text>`;
  s += ortsschild(roadX + 78, cityBase + 108, n.town, 0.72);
  s += carTop(roadX, cityBase + 96);
  n.stops.slice(1).forEach((st, i) => {
    const y = first + i * rowH + rowH - 40;
    s += house(hx, y, w60, "ghost");
    s += house(hx, y, width(st.m2));
    s += `<text x="232" y="${y - 58}" class="t-m2" font-size="28">${st.m2} m²</text>`;
    s += `<text x="232" y="${y - 36}" class="t-km">${st.km} km</text>`;
    s += `<text x="232" y="${y - 16}" class="t-det">${fmt1(st.rent)} €/m² warm</text>`;
    s += `<text x="232" y="${y + 2}" class="t-det">60 m² = ${pct(st.share)} of net</text>`;
  });
  s += `<text x="20" y="${H - 22}" class="t-foot">BBSR asking rents 2025, Zensus 2022, Mikrozensus 2022.</text>`;
  s += `<text x="20" y="${H - 8}" class="t-foot">Net pay: single, tax class I, 2025 rules.</text>`;
  return s + `</svg>`;
}

function renderStory() {
  const el = document.getElementById("story");
  const title = CITIES.find(([s]) => s === slug)[1];
  el.innerHTML = el.clientWidth < 700 ? storyVertical(title) : storyHorizontal(title);
}

/* ---------- map ---------- */

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#f4f1ea" } }] },
  center: [10.4, 51.2],
  zoom: 5,
  attributionControl: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
let markers = [];
let hovered = null;

const key = () => `m2_${persona}`;
function fillColor() {
  const step = ["step", ["get", key()], COLORS[0]];
  BREAKS.forEach((b, i) => step.push(b, COLORS[i + 1]));
  return ["case", ["has", key()], step, NO_DATA];
}

function describe(p) {
  if (!p.warm_m2) return `${p.name}\nNo rent data`;
  return [
    `${p.name}${p.city ? " (city)" : ""}`,
    `${fmt1(p.dist_km)} km from the main station`,
    `Warm rent, new lease: ${fmt1(p.warm_m2)} €/m²`,
    `30 % of net pay rents ${p[key()]} m²`,
    `A 60 m² flat takes ${pct(p[`share_${persona}`])} of net pay`,
  ].join("\n");
}

function renderLegend() {
  const edges = [null, ...BREAKS, null];
  document.getElementById("legend").innerHTML = COLORS.map((c, i) => {
    const lo = edges[i], hi = edges[i + 1];
    const label = lo == null ? `under ${hi} m²` : hi == null ? `${lo} m² and more` : `${lo}–${hi} m²`;
    return `<div><i style="background:${c}"></i>${label}</div>`;
  }).reverse().join("") + `<div><i style="background:${NO_DATA}"></i>no rent data (lakes, forests)</div>`;
}

function renderLists() {
  const towns = data.features.map(f => f.properties)
    .filter(p => p[key()] && !p.city && p.ewz >= 10000 && p.dist_km <= 40)
    .sort((a, b) => b[key()] - a[key()]);
  const row = (p) => `<tr data-ags="${p.ags}"><td class="nm">${esc(p.name)}</td><td class="km">${Math.round(p.dist_km)} km</td><td class="v">${p[key()]} m²</td></tr>`;
  document.getElementById("best").innerHTML = `<tbody>${towns.slice(0, 5).map(row).join("")}</tbody>`;
  document.getElementById("worst").innerHTML = `<tbody>${towns.slice(-5).reverse().map(row).join("")}</tbody>`;
}

function select(ags) {
  if (hovered) map.setFeatureState({ source: "gem", id: hovered }, { hover: false });
  hovered = ags;
  if (ags) map.setFeatureState({ source: "gem", id: ags }, { hover: true });
  const f = data.features.find(x => x.properties.ags === ags);
  if (f) document.getElementById("info").textContent = describe(f.properties);
}

function renderMap() {
  const station = data.meta.station;
  const rings = turf.featureCollection([10, 20, 30, 40].map(r => turf.circle(station, r, { steps: 128, units: "kilometers", properties: { r } })));
  const sources = { gem: data, rings, station: turf.point(station) };
  for (const [id, d] of Object.entries(sources)) {
    if (map.getSource(id)) map.getSource(id).setData(d);
    else map.addSource(id, { type: "geojson", data: d, ...(id === "gem" ? { promoteId: "ags" } : {}) });
  }
  if (!map.getLayer("gem-fill")) {
    map.addLayer({ id: "gem-fill", type: "fill", source: "gem", paint: { "fill-color": fillColor() } });
    map.addLayer({ id: "gem-line", type: "line", source: "gem", paint: { "line-color": "#fffdf8", "line-width": 0.6 } });
    map.addLayer({ id: "city-line", type: "line", source: "gem", filter: ["==", ["get", "city"], true], paint: { "line-color": "#14161c", "line-width": 2.2 } });
    map.addLayer({ id: "rings", type: "line", source: "rings", paint: { "line-color": "#14161c", "line-width": 1.2, "line-dasharray": [3, 3], "line-opacity": 0.55 } });
    map.addLayer({ id: "gem-hover", type: "line", source: "gem", paint: { "line-color": "#14161c", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 0] } });
    map.addLayer({ id: "station", type: "circle", source: "station", paint: { "circle-radius": 6, "circle-color": "#ff6b4a", "circle-stroke-color": "#fffdf8", "circle-stroke-width": 2.5 } });
    map.on("mousemove", "gem-fill", (e) => { map.getCanvas().style.cursor = "pointer"; select(e.features[0].properties.ags); });
    map.on("click", "gem-fill", (e) => select(e.features[0].properties.ags));
    map.on("mouseleave", "gem-fill", () => { map.getCanvas().style.cursor = ""; });
  } else {
    map.setPaintProperty("gem-fill", "fill-color", fillColor());
  }

  // labels as HTML markers (no glyph server needed)
  markers.forEach(m => m.remove());
  markers = [];
  const label = (lngLat, text, cls) => {
    const el = document.createElement("div");
    el.className = `ag-label ${cls}`;
    el.textContent = text;
    markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map));
  };
  const cityName = CITIES.find(([s]) => s === slug)[1];
  label([station[0], station[1] + 0.035], cityName, "city");
  const narrow = document.getElementById("map").clientWidth < 600;
  (narrow ? [20, 40] : [10, 20, 30, 40]).forEach(r => label(turf.destination(station, r, 90, { units: "kilometers" }).geometry.coordinates, `${r} km`, "ring"));
  data.features.map(f => f.properties).filter(p => !p.city && p.ewz >= 40000 && p.dist_km <= 44)
    .sort((a, b) => b.ewz - a.ewz).slice(0, 8)
    .forEach(p => {
      const f = data.features.find(x => x.properties.ags === p.ags);
      label(turf.pointOnFeature(f).geometry.coordinates, p.name.split(",")[0], "");
    });

  map.fitBounds(turf.bbox(turf.circle(station, 44, { units: "kilometers" })), { padding: 12, duration: 0 });
}

/* ---------- page ---------- */

async function load() {
  if (!cache.has(slug)) cache.set(slug, await fetch(`${BASE}data/agglo/${slug}.geojson`).then(r => r.json()));
  data = cache.get(slug);
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.slug === slug)));
  document.getElementById("info").textContent = "Hover or tap a municipality.";
  renderAll();
  if (map.loaded()) renderMap(); else map.once("load", renderMap);
}

function renderAll() {
  renderStory();
  renderLegend();
  renderLists();
  document.getElementById("map-title").textContent =
    `Flat size for 30 % of net pay (${WAGE_LABEL[persona].toLowerCase()} earner)`;
}

document.getElementById("tabs").innerHTML = CITIES.map(([s, n]) =>
  `<button type="button" role="tab" data-slug="${s}" aria-selected="false">${n}</button>`).join("");
document.getElementById("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  slug = b.dataset.slug;
  history.replaceState(null, "", `?city=${slug}`);
  load();
});
document.querySelectorAll('input[name="persona"]').forEach(el => el.addEventListener("change", (e) => {
  persona = e.target.value;
  renderAll();
  if (map.getLayer("gem-fill")) map.setPaintProperty("gem-fill", "fill-color", fillColor());
}));
for (const table of ["best", "worst"]) {
  document.getElementById(table).addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (tr) select(tr.dataset.ags);
  });
}
let lastW = 0;
new ResizeObserver(() => {
  const w = document.getElementById("story").clientWidth;
  if (data && (w < 700) !== (lastW < 700)) renderStory();
  lastW = w;
}).observe(document.getElementById("story"));

document.getElementById("method").textContent =
  "Warm rent of a new lease per municipality: BBSR asking rents 2025 per district, spread within the district by what households who moved in during the two years before the 2022 census pay (Zensus table 5000H-0009), plus a small-flat premium (Zensus 2022) and utilities and heating paid to the landlord (Mikrozensus 2022). " +
  "Wage: median or 25th percentile gross wage of full-time employees working in the city (Bundesagentur für Arbeit, 31.12.2024), net pay for a single person in tax class I under 2025 rules incl. the commuting allowance. Distances are straight lines from the main station.";

load();
