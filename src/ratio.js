import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import "./ratio.css";
import maplibregl from "maplibre-gl";

// Wage variants: residence (default) and workplace
const MODES = {
  wo: { wage: "wage_wo", ratio: "ratio_wo", label: "where people live" },
  ao: { wage: "wage_ao", ratio: "ratio_ao", label: "where people work" },
};
let mode = "wo";
let FLAT_M2 = 70;

// Sequential blue, light -> dark (higher ratio = more affordable)
const COLORS = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

const DATA_URL = `${import.meta.env.BASE_URL}data/kreise_ratio.geojson`;

const hudText = document.getElementById("hud-text");
const legendEl = document.getElementById("legend");
const rankEl = document.getElementById("rank");
const attributionEl = document.getElementById("attribution-custom");
const modeEl = document.getElementById("mode");

const fmtEur = (v) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmt2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function quantileBreaks(values, n) {
  const s = [...values].sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < n; i++) out.push(s[Math.floor((i / n) * s.length)]);
  return out;
}

function describe(p) {
  const m = MODES[mode];
  const ratio = p[m.ratio];
  const lines = [
    `${p.name}`,
    `Median wage (${m.label}): ${fmtEur(p[m.wage])} gross / month`,
    `Rent: ${fmt2(p.rent)} €/m² → ${fmtEur(p.rent * FLAT_M2)} for ${FLAT_M2} m²`,
    `Ratio: ${fmt2(ratio)}  (rent = ${fmt1(100 / ratio)} % of wage)`,
  ];
  if (mode === "wo" && p.coverage < 0.7) {
    lines.push(`⚠ Wage based on ${Math.round(p.coverage * 100)} % of residents (grid data gaps)`);
  }
  return lines.join("\n");
}

function renderLegend(breaks) {
  const edges = [null, ...breaks, null];
  legendEl.innerHTML = COLORS.map((c, i) => {
    const lo = edges[i], hi = edges[i + 1];
    const label = lo == null ? `< ${fmt1(hi)}` : hi == null ? `≥ ${fmt1(lo)}` : `${fmt1(lo)}–${fmt1(hi)}`;
    return `<div class="ratio-legend-item"><span class="swatch" style="background:${c}"></span>${label}</div>`;
  }).join("");
}

function renderRanking(features) {
  const key = MODES[mode].ratio;
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
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO"
      }
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#F7F8FB" } },
      { id: "bg", type: "raster", source: "osm", paint: { "raster-opacity": 0.55 } }
    ]
  },
  bounds: [[5.8, 47.2], [15.1, 55.1]],
  fitBoundsOptions: { padding: 20 }
});

let data = null;

function fillColor() {
  const key = MODES[mode].ratio;
  // Shared class breaks across both modes so switching shows real shifts
  const values = data.features.flatMap(f => Object.values(MODES).map(m => f.properties[m.ratio])).filter(Number.isFinite);
  const breaks = quantileBreaks(values, COLORS.length);
  const step = ["step", ["get", key], COLORS[0]];
  breaks.forEach((b, i) => step.push(b, COLORS[i + 1]));
  renderLegend(breaks);
  renderRanking(data.features);
  return ["case", ["has", key], step, "#e5e7eb"];
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
    paint: { "fill-color": fillColor(), "fill-opacity": 0.85 }
  });

  map.addLayer({
    id: "kreise-line",
    type: "line",
    source: "kreise",
    paint: {
      "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#111827", "#ffffff"],
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

  modeEl.addEventListener("change", (e) => {
    mode = e.target.value;
    map.setPaintProperty("kreise-fill", "fill-color", fillColor());
    if (selected) hudText.textContent = describe(selected);
  });
});
