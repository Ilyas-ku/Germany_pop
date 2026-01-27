import RBush from "rbush";
import * as turf from "@turf/turf";

const RbushClass = RBush?.default ?? RBush;

// WebMercator (EPSG:3857) helpers
const R = 6378137;

function lonLatToMerc(lon, lat) {
  const x = R * (lon * Math.PI / 180);
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  return { x, y };
}

function mercToLonLat(x, y) {
  const lon = (x / R) * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
  return [lon, lat];
}

// Create a circle polygon using WebMercator distance (meters)
function makeMercatorCircleFeature(centerLngLat, radiusMeters, steps = 192) {
  const [lng, lat] = centerLngLat;
  const c = lonLatToMerc(lng, lat);

  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = c.x + radiusMeters * Math.cos(a);
    const y = c.y + radiusMeters * Math.sin(a);
    ring.push(mercToLonLat(x, y));
  }

  return {
    type: "Feature",
    properties: { radiusMeters },
    geometry: { type: "Polygon", coordinates: [ring] }
  };
}

let index = null; // RBush in WebMerc meters
let byId = new Map();
let isReady = false;

self.onmessage = async (e) => {
  const msg = e.data;

  try {
    // ---------------- init ----------------
    if (msg.type === "init") {
      const { geomUrl } = msg;

      const geo = await fetch(geomUrl).then(r => {
        if (!r.ok) throw new Error(`Failed to fetch geometry GeoJSON: ${r.status}`);
        return r.json();
      });

      index = new RbushClass();
      byId = new Map();

      const feats = geo?.features || [];
      console.log("WORKER: loaded geojson features:", feats.length);
      console.log("WORKER: sample keys:", Object.keys(feats?.[0]?.properties || {}));

      for (const f of feats) {
        if (!f?.geometry) continue;
        const props = f.properties || {};

        const rawAGS = props.AGS ?? f.id ?? "";
        const id = String(rawAGS).padStart(8, "0"); // <-- КЛЮЧЕВО
        if (!id || id === "00000000") continue;

        const areaSqm = turf.area(f); // вместо props.area

        const b = turf.bbox(f); // [minLon, minLat, maxLon, maxLat]
        const a = lonLatToMerc(b[0], b[1]);
        const c = lonLatToMerc(b[2], b[3]);

        const bboxMerc = {
          minX: Math.min(a.x, c.x),
          minY: Math.min(a.y, c.y),
          maxX: Math.max(a.x, c.x),
          maxY: Math.max(a.y, c.y)
        };

        index.insert({ ...bboxMerc, id });

        // храним ВЕСЬ feature (а не geometry), и props отдельно
        byId.set(id, {
          id,
          feature: f,
          props,
          areaSqm
        });
      }

      isReady = true;
      self.postMessage({ type: "ready" });
      return;
    }

    // ---------------- compute ----------------
    if (msg.type === "compute") {
      if (!isReady) return;

      const { jobId, lng, lat, targetPop, popField } = msg;

      if (!popField) {
        self.postMessage({ type: "error", jobId, message: "popField is missing" });
        return;
      }

      if (!Number.isFinite(targetPop) || targetPop <= 0) {
        self.postMessage({ type: "error", jobId, message: `Bad targetPop: ${targetPop}` });
        return;
      }

      const center = [lng, lat];
      const cm = lonLatToMerc(lng, lat);

      const sumForRadius = (radiusKm, needIds) => {
        const rMeters = radiusKm * 1000;

        const searchRect = {
          minX: cm.x - rMeters,
          minY: cm.y - rMeters,
          maxX: cm.x + rMeters,
          maxY: cm.y + rMeters
        };

        const circleFeature = makeMercatorCircleFeature(center, rMeters, 192);
        const candidates = index.search(searchRect);

        let totalPop = 0;
        let totalAreaSqm = 0;
        const ids = [];

        for (const c of candidates) {
          const rec = byId.get(String(c.id));
          if (!rec) continue;

          // пересечение круга и полигона
          if (turf.booleanIntersects(circleFeature, rec.feature)) {
            const v = Number(rec.props?.[popField] ?? 0);
            totalPop += Number.isFinite(v) ? v : 0;

            totalAreaSqm += rec.areaSqm;
            if (needIds) ids.push(rec.id);
          }
        }

        return { totalPop, totalAreaSqm, ids, circleFeature };
      };

      // expand upper bound (с предохранителем)
      let lo = 0;
      let hi = 25; // км
      for (let i = 0; i < 30; i++) {
        const { totalPop } = sumForRadius(hi, false);
        if (totalPop >= targetPop) break;
        hi *= 2;
      }
      if (hi > 5000) {
        self.postMessage({
          type: "error",
          jobId,
          message: `Upper bound exploded (hi=${hi} km). popField=${popField}`
        });
        return;
      }

      // binary search
      const EPS = 0.05; // км
      while ((hi - lo) > EPS) {
        const mid = (lo + hi) / 2;
        const { totalPop } = sumForRadius(mid, false);
        if (totalPop >= targetPop) hi = mid;
        else lo = mid;
      }

      const final = sumForRadius(hi, true);

      self.postMessage({
        type: "result",
        jobId,
        radiusKm: hi,
        totalPop: final.totalPop,
        totalAreaSqm: final.totalAreaSqm,
        ids: final.ids,
        count: final.ids.length,
        circle: final.circleFeature
      });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      jobId: msg?.jobId ?? null,
      message: err?.message ?? String(err)
    });
  }
};
