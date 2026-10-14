import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import "./ratio.css";
import maplibregl from "maplibre-gl";
import { C, SCALE } from "./neon.js";

// Wage variants: residence (default) and workplace
const MODES = {
  wo: { wage: "wage_wo", label: "where people live" },
  ao: { wage: "wage_ao", label: "where people work" },
};
// Rent variants: BBSR asking rents 2025 (new leases, default) and Zensus 2022 (existing leases)
const RENTS = {
  ask: { rent: "rent_ask", label: "asking rent 2025, new leases", breaks: [5, 6, 7, 8] },
  zen: { rent: "rent", label: "Zensus 2022, existing leases", breaks: [7, 8, 9, 10] },
};
let mode = "wo";
let rentMode = "ask";
const ratioKey = () => `ratio_${mode}_${rentMode}`;
let FLAT_M2 = 70;

// Sequential blue, dim -> bright (higher ratio = more affordable)
const COLORS = SCALE.blue;
// Fixed class breaks per rent variant (asking rents shift every ratio down)

const DATA_URL = `${import.meta.env.BASE_URL}data/kreise_ratio.geojson`;

const hudText = document.getElementById("hud-text");
const legendEl = document.getElementById("legend");
const rankEl = document.getElementById("rank");
const attributionEl = document.getElementById("attribution-custom");
const modeEl = document.getElementById("mode");
const rentEl = document.getElementById("rent-mode");

const fmtEur = (v) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmt2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function describe(p) {
  const m = MODES[mode];
  const r = RENTS[rentMode];
  const ratio = p[ratioKey()];
  const rent = p[r.rent];
  const lines = [
    `${p.name}`,
    `Median wage (${m.label}): ${fmtEur(p[m.wage])} gross / month`,
    `Rent (${r.label}): ${fmt2(rent)} €/m² → ${fmtEur(rent * FLAT_M2)} for ${FLAT_M2} m²`,
    `Ratio: ${fmt2(ratio)}  (rent = ${fmt1(100 / ratio)} % of wage)`,
  ];
  if (mode === "wo" && p.coverage < 0.7) {
    lines.push(`⚠ Wage based on ${Math.round(p.coverage * 100)} % of residents (grid data gaps)`);
  }
  return lines.join("\n");
}

function renderLegend() {
  const edges = [null, ...RENTS[rentMode].breaks, null];
  legendEl.innerHTML = COLORS.map((c, i) => {
    const lo = edges[i], hi = edges[i + 1];
    const label = lo == null ? `< ${hi}` : hi == null ? `> ${lo}` : `${lo}–${hi}`;
    return `<div class="ratio-legend-item"><span class="swatch" style="background:${c}"></span>${label}</div>`;
  }).join("");
}

function renderRanking(features) {
  const key = ratioKey();
  const rows = features.map(f => f.properties).filter(p => Number.isFinite(p[key])).sort((a, b) => b[key] - a[key]);
  const li = (p, i) => `<li value="${i}">${p.name} — <b>${fmt2(p[key])}</b></li>`;
  const n = rows.length;
  rankEl.innerHTML =
    `<div class="rank-head">Most affordable</div><ol>${rows.slice(0, 10).map((p, i) => li(p, i + 1)).join("")}</ol>` +
    `<div class="rank-head">Least affordable</div><ol>${rows.slice(-10).reverse().map((p, i) => li(p, n - i)).join("")}</ol>`;
}

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": C.bg } }]
  },
  bounds: [[5.8, 47.2], [15.1, 55.1]],
  fitBoundsOptions: { padding: 20 }
});

let data = null;

function fillColor() {
  const key = ratioKey();
  const step = ["step", ["get", key], COLORS[0]];
  RENTS[rentMode].breaks.forEach((b, i) => step.push(b, COLORS[i + 1]));
  renderLegend();
  renderRanking(data.features);
  return ["case", ["has", key], step, C.nodata];
}

let hovered = null;
let selected = null;

map.on("load", async () => {
  data = await fetch(DATA_URL).then(r => r.json());
  FLAT_M2 = data.meta?.flat_m2 ?? FLAT_M2;
  if (data.meta?.attribution) attributionEl.textContent = data.meta.attribution;

  map.addSource("kreise", { type: "geojson", data, promoteId: "ags" });

  map.addLayer({
    id: "kreise-fill",
    type: "fill",
    source: "kreise",
    paint: { "fill-color": fillColor() }
  });

  map.addLayer({
    id: "kreise-line",
    type: "line",
    source: "kreise",
    paint: {
      "line-color": ["case", ["boolean", ["feature-state", "hover"], false], C.lemon, C.bg],
      "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.6]
    }
  });

  const setHover = (id) => {
    if (hovered != null) map.setFeatureState({ source: "kreise", id: hovered }, { hover: false });
    hovered = id;
    if (id != null) map.setFeatureState({ source: "kreise", id }, { hover: true });
  };

  const show = (e) => {
    const f = e.features?.[0];
    if (!f) return;
    setHover(f.id);
    selected = f.properties;
    hudText.textContent = describe(f.properties);
  };

  map.on("mousemove", "kreise-fill", (e) => {
    map.getCanvas().style.cursor = "pointer";
    show(e);
  });
  map.on("click", "kreise-fill", show);
  map.on("mouseleave", "kreise-fill", () => {
    map.getCanvas().style.cursor = "";
    setHover(null);
  });

  rentEl.addEventListener("change", (e) => {
    rentMode = e.target.value;
    map.setPaintProperty("kreise-fill", "fill-color", fillColor());
    if (selected) hudText.textContent = describe(selected);
  });

  modeEl.addEventListener("change", (e) => {
    mode = e.target.value;
    map.setPaintProperty("kreise-fill", "fill-color", fillColor());
    if (selected) hudText.textContent = describe(selected);
  });
});
