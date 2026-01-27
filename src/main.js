import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import maplibregl from "maplibre-gl";
import { Protocol, PMTiles } from "pmtiles";
import * as turf from "@turf/turf";

// --- Years / fields / Berlin population (UI shows hyphens) ---

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

// default year
let selectedYearKey = normYearKey("2019");
let TARGET_POP = BERLIN_POP[selectedYearKey];

let lastClick = [10.45, 51.1657];

const yearSelect = document.getElementById("yearSelect");

yearSelect.innerHTML = YEARS.map(y => {
  const key = normYearKey(y.label);
  return `<option value="${key}">${y.label}</option>`;
}).join("");

yearSelect.value = selectedYearKey;

const hudTitle = document.getElementById("hud-title");
const hudSpinner = document.getElementById("hud-spinner");
const hudText = document.getElementById("hud-text");

const FILL_LAYER_ID = "muni-selected-fill";
const LINE_LAYER_ID = "muni-selected-line";
const SOURCE_LAYER = "gemeinden";

yearSelect.value = selectedYearKey;

function updateTitle() {
  hudTitle.textContent = `How much land holds the same number of people as Berlin (${YEAR_LABEL[selectedYearKey]})`;
}

updateTitle();

yearSelect.addEventListener("change", () => {
  selectedYearKey = yearSelect.value;              // уже нормализованный ключ
  TARGET_POP = BERLIN_POP[selectedYearKey];
  updateTitle();

  console.log("Compute with field:", YEAR_TO_FIELD[selectedYearKey], "target:", TARGET_POP);

  // пересчитать по последней точке
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


let latestJobId = 0;

// PMTiles protocol
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const PMTILES_URL = new URL(
  `${import.meta.env.BASE_URL}data/gemeinden.pmtiles`,
  window.location.href
).toString();

const p = new PMTiles(PMTILES_URL);
protocol.add(p);

// Worker
const worker = new Worker(new URL("./selector.worker.js", import.meta.url), { type: "module" });

worker.onerror = (err) => {
  console.error("WORKER ERROR:", err.message, err);
  setHud(false, `Worker error: ${err.message}`);
};

worker.onmessageerror = (err) => {
  console.error("WORKER MESSAGE ERROR:", err);
  setHud(false, "Worker message error (cannot deserialize message).");
};

// Style
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
    // pale basemap
    {
      id: "bg",
      type: "raster",
      source: "osm",
      paint: {
        "raster-opacity": 0.25,
        "raster-saturation": -0.35, // приглушаем цвет
        "raster-contrast": -0.05
      }
    },

    // all municipalities (very subtle)
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
    //{
    //  id: "muni-all-line",
    //  type: "line",
    //  source: "gemeinden",
    //  "source-layer": SOURCE_LAYER,
    //  paint: {
    //    "line-color": "#d6ccdeff",
    //    "line-width": 0,
    //    "line-opacity": 0
    //  }
    //},

    // selected (highlight)
    {
      id: FILL_LAYER_ID,
      type: "fill",
      source: "gemeinden",
      "source-layer": SOURCE_LAYER,
      paint: {
        "fill-color": "#ff3b89ff",
        "fill-opacity": 0.88
      },
      // compare as strings to avoid number/string mismatch
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
  center: [10.45, 51.1657],
  zoom: 5
});

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

map.on("click", "muni-all-fill", (e) => {
  const f = e.features?.[0];
  console.log("Clicked muni props:", f?.properties);
});


  // buffer circle source
  map.addSource("buffer-circle", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });


// Germany outer boundary (outline only)
const boundaryUrl = new URL(
  `${import.meta.env.BASE_URL}data/Germany_boundaries.geojson`,
  window.location.href
).toString();

const boundaryGeo = await fetch(boundaryUrl).then(r => r.json());

// Берём первую фичу (у тебя один полигон)
const poly = boundaryGeo.type === "FeatureCollection"
  ? boundaryGeo.features[0]
  : boundaryGeo;

// Превращаем полигон в линию (контур)
const outline = turf.polygonToLine(poly);

// Делаем source именно для линии
map.addSource("de-outline", {
  type: "geojson",
  data: outline
});

// Рисуем контур поверх всего
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

    // highlight polygons (handle AGS as string OR number-lost-leading-zeros)
    const idsStr = msg.ids.flatMap((id) => {
      const s = String(id).trim();
      const no0 = String(parseInt(s, 10)); // "03153019" -> "3153019"
      return Number.isFinite(parseInt(s, 10)) ? [s, no0] : [s];
    });

    const filter = ["in", ["to-string", ["get", "AGS"]], ["literal", idsStr]];
    map.setFilter(FILL_LAYER_ID, filter);
    map.setFilter(LINE_LAYER_ID, filter);
    setTimeout(() => {
      const rendered = map.queryRenderedFeatures({ layers: [FILL_LAYER_ID] });
      console.log("ids from worker:", msg.ids.length, "rendered:", rendered.length);
    }, 0);  


    // HUD
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
