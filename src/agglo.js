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

// House with its base centred at (cx, base); width w ∝ sqrt(m²)
function house(cx, base, w, cls) {
  const h = w * 0.66, roof = w * 0.46, x = cx - w / 2, top = base - h;
  const door = `<rect x="${cx - w * 0.09}" y="${base - h * 0.52}" width="${w * 0.18}" height="${h * 0.52}" rx="${w * 0.03}" class="door"/>`;
  const win = `<rect x="${x + w * 0.13}" y="${top + h * 0.2}" width="${w * 0.2}" height="${w * 0.17}" rx="${w * 0.02}" class="win"/>` +
    `<rect x="${x + w * 0.67}" y="${top + h * 0.2}" width="${w * 0.2}" height="${w * 0.17}" rx="${w * 0.02}" class="win"/>`;
  const chimney = `<rect x="${x + w * 0.7}" y="${top - roof * 0.8}" width="${w * 0.1}" height="${roof * 0.55}" class="chim"/>`;
  return `<g class="${cls}">${cls === "ghost" ? "" : chimney}` +
    `<path d="M${x - w * 0.07} ${top} L${cx} ${top - roof} L${x + w * 1.07} ${top} Z" class="roof"/>` +
    `<rect x="${x}" y="${top}" width="${w}" height="${h}" class="body"/>` +
    (cls === "ghost" ? "" : door + win) + `</g>`;
}

function rider(x, y) {
  // commuter on a bike, wheels resting on the road line y
  const r = 13;
  return `<g class="rider" transform="translate(${x} ${y})">
    <path d="M-66 -24 h26 M-72 -14 h30 M-62 -4 h22" class="speed"/>
    <circle cx="-20" cy="${-r}" r="${r}" class="wheel"/><circle cx="20" cy="${-r}" r="${r}" class="wheel"/>
    <path d="M-20 ${-r} L-4 ${-r} L10 ${-r - 18} L-8 ${-r - 18} Z M10 ${-r - 18} L20 ${-r} M-8 ${-r - 18} L-12 ${-r - 24} M10 ${-r - 18} L12 ${-r - 26} h6" class="frame"/>
    <path d="M-10 ${-r - 26} L4 ${-r - 52}" class="torso"/>
    <path d="M4 ${-r - 48} L16 ${-r - 28}" class="limb"/>
    <path d="M-10 ${-r - 26} L2 ${-r - 14} L-4 ${-r}" class="limb"/>
    <circle cx="8" cy="${-r - 62}" r="9" class="head"/>
    <path d="M-2 ${-r - 66} q10 -12 20 -2" class="helmet"/>
    <rect x="-14" y="${-r - 50}" width="12" height="16" rx="3" class="bag"/>
  </g>`;
}

function skyline(cx, base, scale) {
  const b = [[-70, 70], [-48, 118], [-18, 92], [8, 140], [36, 84], [58, 106]];
  return `<g class="sky">` + b.map(([dx, h], i) => {
    const w = 26 * scale, x = cx + dx * scale, hh = h * scale;
    const wins = Array.from({ length: Math.floor(hh / 16) - 1 }, (_, k) =>
      `<rect x="${x + 6 * scale}" y="${base - hh + 10 + k * 16}" width="${w - 12 * scale}" height="5" class="skywin"/>`).join("");
    return `<rect x="${x}" y="${base - hh}" width="${w}" height="${hh}" rx="2" class="tower t${i % 3}"/>${wins}`;
  }).join("") + `</g>`;
}

const STORY_CSS = `
  .bg0{stop-color:#cfe6ff}.bg1{stop-color:#fff1e2}
  .hill{fill:#d7e9cf}.hill2{fill:#c2dfb7}.ground{fill:#efe6d2}
  .road{fill:#34373f}.lane{stroke:#fff;stroke-width:3;stroke-dasharray:18 14}
  .sun{fill:#ffcf6e}
  .t0{fill:#28324a}.t1{fill:#3b4766}.t2{fill:#51607f}.skywin{fill:#ffd98a;opacity:.55}
  .fits .body{fill:#2f9e8f}.fits .roof{fill:#16655c}
  .short .body{fill:#ff8a6a}.short .roof{fill:#d9533a}
  .door{fill:#14161c;opacity:.75}.win{fill:#fff7e6}.chim{fill:#5b4a44}
  .ghost .body,.ghost .roof{fill:none;stroke:#14161c;stroke-width:1.6;stroke-dasharray:5 5;opacity:.45}
  .wheel{fill:none;stroke:#14161c;stroke-width:3}.frame{fill:none;stroke:#ff6b4a;stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round}
  .torso{stroke:#14161c;stroke-width:9;stroke-linecap:round}.limb{fill:none;stroke:#14161c;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}
  .head{fill:#f2c7a5}.helmet{fill:none;stroke:#ff6b4a;stroke-width:6;stroke-linecap:round}.bag{fill:#ffcf6e}
  .speed{stroke:#14161c;stroke-width:3;stroke-linecap:round;opacity:.35}
  .t-title{font:800 34px Inter,system-ui,sans-serif;fill:#14161c;letter-spacing:-.02em}
  .t-sub{font:500 17px Inter,system-ui,sans-serif;fill:#3c3f47}
  .t-sub b{font-weight:800}
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
    stops: STOPS.map(s => ({ km: +s, rent: m.stops[s].rent, ...m.stops[s].personas[persona] })),
  };
}

function storyHorizontal(title) {
  const n = storyNumbers();
  const W = 1200, H = 580, base = 392, roadY = 408;
  const xs = [150, 410, 640, 870, 1100];
  const w60 = 118, width = (m2) => w60 * Math.sqrt(m2 / REF_M2);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}: flat size for 30 % of net pay every 10 km from the centre">
  <style>${STORY_CSS}</style>
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bg0"/><stop offset="1" class="bg1"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="1105" cy="96" r="46" class="sun"/>
  <path d="M0 ${base - 40} C 200 ${base - 110}, 380 ${base - 20}, 560 ${base - 70} S 900 ${base - 120}, 1200 ${base - 50} V ${H} H 0 Z" class="hill"/>
  <path d="M0 ${base - 10} C 260 ${base - 60}, 520 ${base}, 760 ${base - 36} S 1060 ${base - 60}, 1200 ${base - 20} V ${H} H 0 Z" class="hill2"/>
  <rect y="${base}" width="${W}" height="${H - base}" class="ground"/>
  <rect y="${roadY}" width="${W}" height="46" class="road"/>
  <line x1="0" x2="${W}" y1="${roadY + 23}" y2="${roadY + 23}" class="lane"/>
  <text x="44" y="64" class="t-title">${esc(title)}</text>
  <text x="44" y="98" class="t-sub">${WAGE_LABEL[persona]} gross pay <tspan font-weight="800">${fmtEur(n.gross)}</tspan> → net <tspan font-weight="800">${fmtEur(n.net)}</tspan> → <tspan font-weight="800">${fmtEur(n.budget)}</tspan> a month for warm rent (30 %)</text>
  <g transform="translate(44 124)">${house(12, 22, 20, "fits")}<text x="30" y="18" class="t-leg">60 m² or more fits</text>
    ${house(192, 22, 20, "short")}<text x="210" y="18" class="t-leg">less than 60 m²</text>
    ${house(362, 22, 20, "ghost")}<text x="380" y="18" class="t-leg">a 60 m² flat</text></g>`;

  n.stops.forEach((st, i) => {
    const x = xs[i];
    const cls = st.m2 >= REF_M2 ? "fits" : "short";
    if (i === 0) {
      s += skyline(x, base, 1);
      s += `<rect x="${x - 58}" y="${base - 196}" width="116" height="38" rx="19" class="pill"/>`;
      s += `<text x="${x}" y="${base - 170}" text-anchor="middle" class="t-pill">${st.m2} m²</text>`;
    } else {
      const w = width(st.m2);
      s += house(x, base, w60, "ghost");
      s += house(x, base, w, cls);
      const top = base - Math.max(w, w60) * 1.12 - 14;
      s += `<text x="${x}" y="${top}" text-anchor="middle" class="t-m2">${st.m2} m²</text>`;
    }
    s += `<text x="${x}" y="${roadY + 76}" text-anchor="middle" class="t-km">${i === 0 ? "Centre" : `${st.km} km`}</text>`;
    s += `<text x="${x}" y="${roadY + 98}" text-anchor="middle" class="t-det">${fmt1(st.rent)} €/m² warm</text>`;
    s += `<text x="${x}" y="${roadY + 118}" text-anchor="middle" class="t-det">60 m² = ${pct(st.share)} of net</text>`;
  });
  s += rider(262, roadY + 30);
  s += `<text x="44" y="${H - 14}" class="t-foot">Warm rent of a new lease: BBSR asking rents 2025, Zensus 2022, Mikrozensus 2022. Net pay: single, tax class I, 2025 rules. Each house: ±5 km from the main station.</text>`;
  return s + `</svg>`;
}

function storyVertical(title) {
  const n = storyNumbers();
  const W = 390, rowH = 150, top = 190, H = top + rowH * 5 + 60;
  const roadX = 36, hx = 140, w60 = 76, width = (m2) => w60 * Math.sqrt(m2 / REF_M2);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}: flat size for 30 % of net pay every 10 km from the centre">
  <style>${STORY_CSS}</style>
  <defs><linearGradient id="skyv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bg0"/><stop offset=".35" class="bg1"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#skyv)"/>
  <circle cx="362" cy="26" r="20" class="sun"/>
  <rect x="${roadX - 18}" y="${top - 20}" width="36" height="${rowH * 5 + 10}" rx="6" class="road"/>
  <line x1="${roadX}" x2="${roadX}" y1="${top - 14}" y2="${top + rowH * 5 - 14}" class="lane"/>
  <text x="20" y="48" class="t-title" font-size="28">${esc(title)}</text>
  <text x="20" y="78" class="t-sub" font-size="14">${WAGE_LABEL[persona]} gross ${fmtEur(n.gross)} → net ${fmtEur(n.net)}</text>
  <text x="20" y="100" class="t-sub" font-size="14"><tspan font-weight="800">${fmtEur(n.budget)}</tspan> a month for warm rent (30 %)</text>
  <g transform="translate(20 124)">${house(8, 16, 14, "fits")}<text x="22" y="14" class="t-leg" font-size="12">≥ 60 m²</text>
    ${house(98, 16, 14, "short")}<text x="112" y="14" class="t-leg" font-size="12">&lt; 60 m²</text>
    ${house(198, 16, 14, "ghost")}<text x="212" y="14" class="t-leg" font-size="12">60 m² flat</text></g>`;
  n.stops.forEach((st, i) => {
    const y = top + i * rowH + rowH - 44;
    const cls = st.m2 >= REF_M2 ? "fits" : "short";
    if (i === 0) {
      s += skyline(hx, y, 0.62);
    } else {
      s += house(hx, y, w60, "ghost");
      s += house(hx, y, width(st.m2), cls);
    }
    s += `<text x="232" y="${y - 58}" class="t-m2" font-size="28">${st.m2} m²</text>`;
    s += `<text x="232" y="${y - 36}" class="t-km">${i === 0 ? "Centre" : `${st.km} km`}</text>`;
    s += `<text x="232" y="${y - 16}" class="t-det">${fmt1(st.rent)} €/m² warm</text>`;
    s += `<text x="232" y="${y + 2}" class="t-det">60 m² = ${pct(st.share)} of net</text>`;
  });
  // rider heading down the road, between the centre and the 10 km house
  s += `<g transform="translate(${roadX - 4} ${top + rowH - 4}) rotate(90) scale(0.62)">${rider(0, 0)}</g>`;
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
