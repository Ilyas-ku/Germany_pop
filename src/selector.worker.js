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
    geometry: {
      type: "Polygon",
      coordinates: [ring]
    }
  };
}

let index = null;    // RBush over municipality bbox in WebMerc meters
let byId = new Map();
let isReady = false;

self.onmessage = async (e) => {
  const msg = e.data;

  try {
    if (msg.type === "init") {
      const { geomUrl } = msg;

      const geo = await fetch(geomUrl).then(r => {
        if (!r.ok) throw new Error(`Failed to fetch geometry GeoJSON: ${r.status}`);
        return r.json();
      });

      index = new RbushClass();
      byId = new Map();

      for (const f of geo.features) {
        if (!f?.geometry || !f?.properties) continue;

        const id = String(f.properties.OBJECTID);
        const pop = Number(f.properties.EWZ) || 0;
        const areaSqm = Number(f.properties.area) || 0;

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

        byId.set(id, { id, pop, areaSqm, geom: f.geometry, bboxMerc });
      }

      isReady = true;
      self.postMessage({ type: "ready" });
      return;
    }

    if (msg.type === "compute") {
      if (!isReady) return;

      const { jobId, lng, lat, targetPop } = msg;
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

        // IMPORTANT: circle built in WebMercator meters, then returned as lon/lat GeoJSON
        const circleFeature = makeMercatorCircleFeature(center, rMeters, 192);

        const candidates = index.search(searchRect);

        let totalPop = 0;
        let totalAreaSqm = 0;
        const ids = [];

        for (const c of candidates) {
          const rec = byId.get(String(c.id));
          if (!rec) continue;

          // Accurate test: polygon intersects the Mercator-distance circle
          if (turf.booleanIntersects(circleFeature, rec.geom)) {
            totalPop += rec.pop;
            totalAreaSqm += rec.areaSqm;
            if (needIds) ids.push(rec.id);
          }
        }

        return { totalPop, totalAreaSqm, ids, circleFeature };
      };

      // Expand upper bound
      let lo = 0;
      let hi = 25;

      while (true) {
        const { totalPop } = sumForRadius(hi, false);
        if (totalPop >= targetPop) break;
        hi *= 2;
      }

      // Binary search
      const EPS = 0.05; // km
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
      return;
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      jobId: msg?.jobId ?? null,
      message: err?.message ?? String(err)
    });
  }
};
