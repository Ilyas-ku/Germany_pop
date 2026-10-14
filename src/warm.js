import "maplibre-gl/dist/maplibre-gl.css";
import "./warm.css";
import maplibregl from "maplibre-gl";
import { C, SCALE } from "./neon.js";

const BASE = import.meta.env.BASE_URL;


const fmtEur = (v) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmt2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const share = (ratio) => `${Math.round(100 / ratio)} %`;
const between = (fmt, lo, hi) => lo == null ? `< ${fmt(hi)}` : hi == null ? `> ${fmt(lo)}` : `${fmt(lo)}–${fmt(hi)}`;

// One page per metric: <body data-metric="ratio|net|rent">
const METRICS = {
  ratio: {
    key: (w) => `ratio_${w}`,
    colors: SCALE.blue,
    breaks: [2.5, 3, 3.5, 4],
    range: (lo, hi) => between(fmt1, lo, hi),
    note: (lo, hi) => lo == null ? `rent over ${share(hi)} of net` : hi == null ? `rent under ${share(lo)} of net` : `rent ${share(hi)}–${share(lo)} of net`,
    cells: (v) => [fmt2(v), share(v)],
  },
  net: {
    key: (w) => `net_${w}`,
    colors: SCALE.aqua,
    breaks: [2400, 2600, 2800, 3000],
    range: (lo, hi) => between(fmtEur, lo, hi),
    note: () => "",
    cells: (v) => [fmtEur(v), ""],
  },
  rent: {
    key: () => "warm_flat",
    colors: SCALE.pink,
    breaks: [600, 750, 900, 1050],
    range: (lo, hi) => between(fmtEur, lo, hi),
    note: () => "",
    cells: (v) => [fmtEur(v), ""],
  },
};
const metric = METRICS[document.body.dataset.metric || "ratio"];
const COLORS = metric.colors;
const BREAKS = metric.breaks;
const WAGES = {
  wo: { label: "where people live" },
  ao: { label: "where people work" },
};
let wage = "wo";

const legendEl = document.getElementById("legend");
const infoEl = document.getElementById("info");
const topEl = document.getElementById("top");
const bottomEl = document.getElementById("bottom");

let data, byId, selected = null;

function renderLegend() {
  const edges = [null, ...BREAKS, null];
  // listed from the top class down
  legendEl.innerHTML = COLORS.map((c, i) => {
    const lo = edges[i], hi = edges[i + 1];
    return `<div><i style="background:${c}"></i><b>${metric.range(lo, hi)}</b><span>${metric.note(lo, hi)}</span></div>`;
  }).reverse().join("");
}

function describe(p) {
  const r = p[`ratio_${wage}`];
  const lines = [
    `<b>${p.name}</b>`,
    `Median wage (${WAGES[wage].label}): ${fmtEur(p[`gross_${wage}`])} gross → ${fmtEur(p[`net_${wage}`])} net`,
    `Warm rent 60 m²: ${fmtEur(p.warm_flat)} (${fmt2(p.warm_m2)} €/m²: ${fmt2(p.cold_m2)} cold + ${fmt1(p.nk_cold)} utilities + ${fmt1(p.nk_warm)} heating)`,
    `Ratio ${fmt2(r)} → rent takes ${share(r)} of net pay`,
  ];
  if (wage === "wo" && p.coverage < 0.7) lines.push(`⚠ Wage estimate covers ${Math.round(p.coverage * 100)} % of residents`);
  return lines.join("\n");
}

function renderRanks() {
  const key = metric.key(wage);
  const rows = data.features.map(f => f.properties).sort((a, b) => b[key] - a[key]);
  const n = rows.length;
  const row = (p, rank) => {
    const [v, extra] = metric.cells(p[key], p);
    return `<tr data-id="${p.ags}"><td class="rk">${rank}</td><td class="nm">${p.name}</td><td class="v">${v}</td><td class="s">${extra}</td></tr>`;
  };
  topEl.innerHTML = `<tbody>${rows.slice(0, 10).map((p, i) => row(p, i + 1)).join("")}</tbody>`;
  bottomEl.innerHTML = `<tbody>${rows.slice(-10).reverse().map((p, i) => row(p, n - i)).join("")}</tbody>`;
}

function fillColor() {
  const step = ["step", ["get", metric.key(wage)], COLORS[0]];
  BREAKS.forEach((b, i) => step.push(b, COLORS[i + 1]));
  return step;
}

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": C.bg } }],
  },
  bounds: [[5.8, 47.2], [15.1, 55.1]],
  fitBoundsOptions: { padding: 16 },
  attributionControl: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

let hovered = null;
function highlight(id) {
  if (hovered != null) map.setFeatureState({ source: "kreise", id: hovered }, { hover: false });
  hovered = id;
  if (id != null) map.setFeatureState({ source: "kreise", id }, { hover: true });
}

function select(p) {
  selected = p;
  highlight(p.ags);
  infoEl.innerHTML = describe(p);
}

map.on("load", async () => {
  const [kreise, lines] = await Promise.all([
    fetch(`${BASE}data/kreise_warm.geojson`).then(r => r.json()),
    fetch(`${BASE}data/laender_lines.geojson`).then(r => r.json()),
  ]);
  data = kreise;
  byId = new Map(data.features.map(f => [f.properties.ags, f.properties]));

  map.addSource("kreise", { type: "geojson", data, promoteId: "ags" });
  map.addSource("laender", { type: "geojson", data: lines });
  map.addLayer({ id: "kreise-fill", type: "fill", source: "kreise", paint: { "fill-color": fillColor() } });
  map.addLayer({
    id: "kreise-line", type: "line", source: "kreise",
    paint: { "line-color": C.bg, "line-width": 0.6 },
  });
  map.addLayer({
    id: "laender-line", type: "line", source: "laender",
    paint: { "line-color": C.muted, "line-width": 1, "line-opacity": 0.6 },
  });
  map.addLayer({
    id: "kreise-hover", type: "line", source: "kreise",
    paint: {
      "line-color": C.lemon,
      "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 0],
    },
  });

  renderLegend();
  renderRanks();

  map.on("mousemove", "kreise-fill", (e) => {
    map.getCanvas().style.cursor = "pointer";
    select(e.features[0].properties);
  });
  map.on("click", "kreise-fill", (e) => select(e.features[0].properties));
  map.on("mouseleave", "kreise-fill", () => { map.getCanvas().style.cursor = ""; });

  for (const table of [topEl, bottomEl]) {
    table.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (tr) select(byId.get(tr.dataset.id));
    });
  }

  document.querySelectorAll('input[name="wage"]').forEach(el => el.addEventListener("change", (e) => {
    wage = e.target.value;
    map.setPaintProperty("kreise-fill", "fill-color", fillColor());
    renderRanks();
    if (selected) infoEl.innerHTML = describe(selected);
  }));

  const m = data.meta;
  document.getElementById("method").innerHTML = [
    `Wage: median gross monthly wage of full-time employees (BA, 31.12.2024). "Where people live" is estimated from BA's 1 km grid; "where people work" is the official district median.`,
    `Net: ${m.net}`,
    `Warm rent = BBSR asking rent 2025 (new leases, net cold) × premium for flats ≤ 65 m² (Zensus 2022) + cold utilities + heating and hot water paid to the landlord (Mikrozensus 2022, by region). Heating paid directly to a utility is not included.`,
    `Sources: ${m.attribution}`,
  ].map(t => `<li>${t}</li>`).join("");
});
