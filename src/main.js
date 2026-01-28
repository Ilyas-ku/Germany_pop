import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import maplibregl from "maplibre-gl";
import { Protocol, PMTiles } from "pmtiles";
import * as turf from "@turf/turf";

// --- Years / fields / Berlin population ---
const normYearKey = (s) => String(s).replace(/-/g, "_");

const YEARS = [
  { label: "1871",      field: "pop_1871",       berlin: 931984 },
  { label: "1900-1910", field: "pop_1900_1910",  berlin: 3734258 },
  { label: "1939",      field: "pop_1939",       berlin: 4338756 },
  { label: "1946-1950", field: "pop_1946_1950",  berlin: 3170832 },
  { label: "1961-1964", field: "pop_1961_1964",  berlin: 3270959 },
  { label: "1985-1987", field: "pop_1985_1987",  berlin: 3075670 },
  { label: "1996",      field: "pop_1996",       berlin: 3458763 },
  { label: "2019",      field: "pop_2019",       berlin: 3669491 },
];

// maps: normalizedKey -> value
const YEAR_LABEL = Object.fromEntries(YEARS.map(y => [normYearKey(y.label), y.label]));
const YEAR_TO_FIELD = Object.fromEntries(YEARS.map(y => [normYearKey(y.label), y.field]));
const BERLIN_POP = Object.fromEntries(YEARS.map(y => [normYearKey(y.label), y.berlin]));

// --- Slider UI (top/bottom ticks) ---
const yearSlider = document.getElementById("yearSlider");
const yearTicksTop = document.getElementById("yearTicksTop");
const yearTicksBottom = document.getElementById("yearTicksBottom");
const yearMeta = document.getElementById("yearMeta");

// years placed at bottom
const BOTTOM_YEARS = new Set(["1871", "1939", "1961-1964", "1996"]);

// default
let selectedYearIndex = YEARS.length - 1; // 2019
let selectedYearKey = normYearKey(YEARS[selectedYearIndex].label);
let TARGET_POP = YEARS[selectedYearIndex].berlin;

yearSlider.min = 0;
yearSlider.max = String(YEARS.length - 1);
yearSlider.step = 1;
yearSlider.value = String(selectedYearIndex);

function setActiveTick(idx) {
  document.querySelectorAll(".year-tick").forEach(t => {
    t.classList.toggle("is-active", Number(t.dataset.idx) === idx);
  });
}

function fixOverlaps(container) {
  if (!container) return;
  const ticks = Array.from(container.querySelectorAll(".year-tick"));
  if (ticks.length <= 1) return;

  // reset
  ticks.forEach(t => t.classList.remove("is-compact"));

  const sorted = ticks
    .map(t => ({ el: t, left: t.getBoundingClientRect().left }))
    .sort((a, b) => a.left - b.left);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].el.getBoundingClientRect();
    const cur = sorted[i].el.getBoundingClientRect();
    if (cur.left < prev.right + 6) {
      sorted[i].el.classList.add("is-compact");
    }
  }
}

function renderTicks() {
  yearTicksTop.innerHTML = "";
  yearTicksBottom.innerHTML = "";

  YEARS.forEach((y, idx) => {
    const el = document.createElement("div");
    el.className = "year-tick";
    el.textContent = y.label;
    el.dataset.idx = String(idx);
    el.style.left = `${(idx / (YEARS.length - 1)) * 100}%`;

    el.addEventListener("click", () => {
      yearSlider.value = String(idx);
      yearSlider.dispatchEvent(new Event("input"));
    });

    (BOTTOM_YEARS.has(y.label) ? yearTicksBottom : yearTicksTop).appendChild(el);
  });

  setActiveTick(selectedYearIndex);

  requestAnimationFrame(() => {
    fixOverlaps(yearTicksTop);
    fixOverlaps(yearTicksBottom);
  });
}

function updateYearMeta() {
  const y = YEARS[selectedYearIndex];
  if (!yearMeta) return;
  yearMeta.innerHTML = `Berlin population <b>(${y.label})</b>: <b>${fmtInt(y.berlin)}</b>`;
}

// --- HUD ---
const hudTitle = document.getElementById("hud-title");
const hudSpinner = document.getElementById("hud-spinner");
const hudText = document.getElementById("hud-text");

// Layers
const FILL_LAYER_ID = "muni-selected-fill";
const LINE_LAYER_ID = "muni-selected-line";
const SOURCE_LAYER = "gemeinden";

// Default click
let lastClick = [10.45, 51.1657];
let latestJobId = 0;

function updateTitle() {
  hudTitle.textContent =
    `How much land holds the same number of people as Berlin (${YEARS[selectedYearIndex].label})`;
}

// initial UI render
renderTicks();
updateTitle();
updateYearMeta();
window.addEventListener("load", () => renderTicks());

// --- PMTiles protocol ---
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const PMTILES_URL = new URL(
  `${import.meta.env.BASE_URL}data/gemeinden.pmtiles`,
  window.location.href
).toString();

const p = new PMTiles(PMTILES_URL);
protocol.add(p);

// --- Worker ---
const worker = new Worker(new URL("./selector.worker.js", import.meta.url), { type: "module" });

worker.onmessageerror = (err) => {
  console.error("WORKER MESSAGE ERROR:", err);
  setHud(false, "Worker message error (cannot deserialize message).");
};

// --- Slider handler ---
yearSlider.addEventListener("input", () => {
  selectedYearIndex = Number(yearSlider.value);
  selectedYearKey = normYearKey(YEARS[selectedYearIndex].label);
  TARGET_POP = YEARS[selectedYearIndex].berlin;

  updateTitle();
  setActiveTick(selectedYearIndex);
  updateYearMeta();

  // recompute using last click
  latestJobId += 1;
  setHud(true, "Computing…");
  worker.postMessage({
    type: "compute",
    jobId: latestJobId,
    lng: lastClick[0],
    lat: lastClick[1],
    targetPop: TARGET_POP,
    popField: YEAR_TO_FIELD[selectedYearKey]
  });
});

// --- Map style ---
const style = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO"
    },
    gemeinden: {
      type: "vector",
      url: `pmtiles://${PMTILES_URL}`,
      promoteId: "AGS"
    }
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#F7F8FB",
        "background-opacity": 1
      }
    },
    {
      id: "bg",
      type: "raster",
      source: "osm",
      paint: {
        "raster-opacity": 0.25,
        "raster-saturation": -0.35,
        "raster-contrast": -0.05
      }
    },
    {
      id: "muni-all-fill",
      type: "fill",
      source: "gemeinden",
      "source-layer": SOURCE_LAYER,
      paint: {
        "fill-color": "#3e0075ff",
        "fill-opacity": 0.04
      }
    },
    {
      id: FILL_LAYER_ID,
      type: "fill",
      source: "gemeinden",
      "source-layer": SOURCE_LAYER,
      paint: {
        "fill-color": "#ff3b89ff",
        "fill-opacity": 0.88
      },
      filter: ["in", ["to-string", ["get", "AGS"]], ["literal", []]]
    },
    {
      id: LINE_LAYER_ID,
      type: "line",
      source: "gemeinden",
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": "#FFECF4",
        "line-width": 0.1,
        "line-opacity": 0.95
      },
      filter: ["in", ["to-string", ["get", "AGS"]], ["literal", []]]
    }
  ]
};

const map = new maplibregl.Map({
  container: "map",
  style,
  center: lastClick,
  zoom: 5
});

// marker
const markerEl = document.createElement("div");
markerEl.className = "click-dot";
const marker = new maplibregl.Marker({ element: markerEl, anchor: "center" })
  .setLngLat(lastClick)
  .addTo(map);

map.on("load", async () => {
  // init worker
  worker.postMessage({
    type: "init",
    geomUrl: new URL(
      `${import.meta.env.BASE_URL}data/Germany_Gemeinde_census.geojson`,
      window.location.href
    ).toString()
  });

  // boundary outline
  const boundaryUrl = new URL(
    `${import.meta.env.BASE_URL}data/Germany_boundaries.geojson`,
    window.location.href
  ).toString();

  const boundaryGeo = await fetch(boundaryUrl).then(r => r.json());
  const poly = boundaryGeo.type === "FeatureCollection" ? boundaryGeo.features[0] : boundaryGeo;
  const outline = turf.polygonToLine(poly);

  map.addSource("de-outline", {
    type: "geojson",
    data: outline
  });

  map.addLayer({
    id: "de-outline-line",
    type: "line",
    source: "de-outline",
    paint: {
      "line-color": "#643f72",
      "line-width": 1.2,
      "line-opacity": 0.75
    }
  });

  setHud(false, "Ready. Click anywhere in Germany.");
});

map.on("click", (e) => {
  const { lng, lat } = e.lngLat;
  lastClick = [lng, lat];

  marker.setLngLat(lastClick);

  latestJobId += 1;
  setHud(true, "Computing…");

  worker.postMessage({
    type: "compute",
    jobId: latestJobId,
    lng,
    lat,
    targetPop: TARGET_POP,
    popField: YEAR_TO_FIELD[selectedYearKey]
  });
});

worker.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === "ready") {
    setHud(false, "Ready. Click anywhere in Germany.");
    return;
  }

  if (msg.type === "result") {
    if (msg.jobId !== latestJobId) return;

    const idsStr = msg.ids.flatMap((id) => {
      const s = String(id).trim();
      const n = parseInt(s, 10);
      const no0 = Number.isFinite(n) ? String(n) : s;
      return Number.isFinite(n) ? [s, no0] : [s];
    });

    const filter = ["in", ["to-string", ["get", "AGS"]], ["literal", idsStr]];
    map.setFilter(FILL_LAYER_ID, filter);
    map.setFilter(LINE_LAYER_ID, filter);

    const areaKm2 = msg.totalAreaSqm / 1e6;
    setHud(
      false,
      `Population (${YEAR_LABEL[selectedYearKey]}): ${fmtInt(msg.totalPop)}\n` +
      `Radius: ${msg.radiusKm.toFixed(2)} km\n` +
      `Municipalities: ${msg.count}\n` +
      `Total area: ${areaKm2.toFixed(1)} km²`
    );
    return;
  }

  if (msg.type === "error") {
    if (msg.jobId !== latestJobId) return;
    setHud(false, `Error: ${msg.message}`);
  }
};

function setHud(loading, text) {
  hudSpinner.style.display = loading ? "inline-block" : "none";
  hudText.textContent = text;
}

function fmtInt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}
