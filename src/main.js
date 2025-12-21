import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import maplibregl from "maplibre-gl";
import { Protocol, PMTiles } from "pmtiles";
import * as turf from "@turf/turf";

let lastClick = [10.45, 51.1657];
const TARGET_POP = 3_800_000;

const hudSpinner = document.getElementById("hud-spinner");
const hudText = document.getElementById("hud-text");

const FILL_LAYER_ID = "muni-selected-fill";
const LINE_LAYER_ID = "muni-selected-line";
const SOURCE_LAYER = "gemeinden";

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
      promoteId: "OBJECTID"
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
      filter: ["in", ["to-string", ["get", "OBJECTID"]], ["literal", []]]
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
      filter: ["in", ["to-string", ["get", "OBJECTID"]], ["literal", []]]
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
    `${import.meta.env.BASE_URL}data/Germany_Gemeinde.geojson`,
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
    targetPop: TARGET_POP
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

    // highlight polygons
    const idsStr = msg.ids.map(String);
    const filter = ["in", ["to-string", ["get", "OBJECTID"]], ["literal", idsStr]];

    map.setFilter(FILL_LAYER_ID, filter);
    map.setFilter(LINE_LAYER_ID, filter);

    // HUD
    const areaKm2 = msg.totalAreaSqm / 1e6;
    setHud(
      false,
        `Population (2024): ${fmtInt(msg.totalPop)}\n` +
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
