import "maplibre-gl/dist/maplibre-gl.css";
import "./agglo.css";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { C, SCALE, FONT, GLOW, house, skyline } from "./neon.js";

const BASE = import.meta.env.BASE_URL;
const CITIES = [
  ["berlin", "Berlin"], ["hamburg", "Hamburg"], ["muenchen", "Munich"], ["koeln", "Cologne"],
  ["frankfurt", "Frankfurt"], ["stuttgart", "Stuttgart"], ["duesseldorf", "Düsseldorf"],
];
const STOPS = ["0", "10", "20", "30", "40"];
const WAGE_LABEL = { median: "Median", p25: "Lower-quarter" };

// Map classes: affordable flat size for 30 % of net pay, one aqua scale (more m² = brighter)
const COLORS = SCALE.aqua;
const BREAKS = [45, 52, 60, 70];
const NO_DATA = C.nodata;

const fmtEur = (v) => `${Math.round(v).toLocaleString("en-US")} €`;
const fmt1 = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v) => `${Math.round(v * 100)} %`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

let slug = new URLSearchParams(location.search).get("city") || "muenchen";
let persona = "median";
let data = null;
const cache = new Map();

/* ---------- infographic ---------- */

function storyNumbers() {
  const m = data.meta, net = m.net[persona];
  return {
    gross: m.wage[persona], net, budget: net * m.share,
    town: m.city.split(" am ")[0],
    stops: STOPS.map(s => ({ km: +s, rent: m.stops[s].rent, ...m.stops[s].personas[persona] })),
  };
}

const DISTS = ["Centre", "10 km", "20 km", "30 km", "40 km"];

// One city as a row of the all-cities sheet (cities.html), plus rent and share under each house
function storyHorizontal(title) {
  const n = storyNumbers();
  const W = 1180, cols = [410, 580, 750, 920, 1090], gy = 240, H = gy + 72;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}: flat size for 30 % of net pay every 10 km from the centre"><defs>${GLOW}</defs>`;
  DISTS.forEach((d, i) => { s += `<text x="${cols[i]}" y="24" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="15">${d}</text>`; });
  s += `<text x="0" y="${gy - 104}" fill="${C.fg}" font-family='${FONT.display}' font-weight="700" font-size="30">${esc(title)}</text>`;
  s += `<text x="0" y="${gy - 74}" fill="${C.muted}" font-family='${FONT.body}' font-size="16">gross ${fmtEur(n.gross)}</text>`;
  s += `<text x="0" y="${gy - 50}" fill="${C.muted}" font-family='${FONT.body}' font-size="16">net ${fmtEur(n.net)}</text>`;
  s += `<text x="0" y="${gy - 26}" fill="${C.muted}" font-family='${FONT.body}' font-size="16">${fmtEur(n.budget)} for rent</text>`;
  s += skyline(258, gy);
  s += `<line x1="250" x2="${W}" y1="${gy}" y2="${gy}" stroke="${C.ground}" stroke-width="2"/>`;
  n.stops.forEach((st, i) => {
    s += house(cols[i], gy, st.m2);
    s += `<text x="${cols[i]}" y="${gy + 30}" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="14">${fmt1(st.rent)} €/m²</text>`;
    s += `<text x="${cols[i]}" y="${gy + 52}" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="14">60 m² = ${pct(st.share)}</text>`;
  });
  return s + `</svg>`;
}

function storyVertical(title) {
  const n = storyNumbers();
  const W = 390, cols = [40, 117, 194, 271, 348], gy = 170, H = gy + 44, k = 0.42;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}: flat size for 30 % of net pay every 10 km from the centre"><defs>${GLOW}</defs>`;
  s += `<text x="0" y="24" fill="${C.fg}" font-family='${FONT.display}' font-weight="700" font-size="22">${esc(title)}</text>`;
  s += `<text x="0" y="46" fill="${C.muted}" font-family='${FONT.body}' font-size="12">net ${fmtEur(n.net)} · ${fmtEur(n.budget)} for rent</text>`;
  DISTS.forEach((d, i) => { s += `<text x="${cols[i]}" y="74" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="11">${d}</text>`; });
  s += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="${C.ground}" stroke-width="1.5"/>`;
  n.stops.forEach((st, i) => {
    s += house(cols[i], gy, st.m2, { k, font: 15, gap: 7 });
    s += `<text x="${cols[i]}" y="${gy + 18}" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="10">${fmt1(st.rent)} €/m²</text>`;
    s += `<text x="${cols[i]}" y="${gy + 34}" text-anchor="middle" fill="${C.muted}" font-family='${FONT.mono}' font-size="10">${pct(st.share)}</text>`;
  });
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
  style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": C.bg } }] },
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
    map.addLayer({ id: "gem-line", type: "line", source: "gem", paint: { "line-color": C.bg, "line-width": 0.7 } });
    map.addLayer({ id: "city-line", type: "line", source: "gem", filter: ["==", ["get", "city"], true], paint: { "line-color": C.blue, "line-width": 2 } });
    map.addLayer({ id: "rings", type: "line", source: "rings", paint: { "line-color": C.bg, "line-width": 1.4, "line-dasharray": [3, 2], "line-opacity": 0.9 } });
    map.addLayer({ id: "gem-hover", type: "line", source: "gem", paint: { "line-color": C.lemon, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 0] } });
    map.addLayer({ id: "station-glow", type: "circle", source: "station", paint: { "circle-radius": 16, "circle-color": C.blue, "circle-blur": 1, "circle-opacity": 0.8 } });
    map.addLayer({ id: "station", type: "circle", source: "station", paint: { "circle-radius": 5, "circle-color": C.blue, "circle-stroke-color": C.bg, "circle-stroke-width": 1.5 } });
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
