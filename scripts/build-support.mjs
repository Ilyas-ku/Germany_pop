import fs from "node:fs";
import path from "node:path";

const inPath = path.resolve("data-src/Germany_Gemeinde.geojson");
const outDir = path.resolve("public/data");
const outPath = path.resolve(outDir, "municipalities_support.json");

const R = 6378137;
function mercX(lng) { return R * (lng * Math.PI / 180); }
function mercY(lat) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = clamped * Math.PI / 180;
  return R * Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function bboxWgs84(geom) {
  // минимальный bbox без turf, чтобы было быстрее
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  const scan = (coords) => {
    for (const c of coords) {
      if (typeof c[0] === "number") {
        const [lng, lat] = c;
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      } else {
        scan(c);
      }
    }
  };
  scan(geom.coordinates);

  return [minLng, minLat, maxLng, maxLat];
}

fs.mkdirSync(outDir, { recursive: true });

const fc = JSON.parse(fs.readFileSync(inPath, "utf8"));
const out = [];

for (const feat of fc.features) {
  const p = feat.properties ?? {};

  const id = Number(p.AGS);
  const ewz = Number(p.EWZ);
  const area = Number(p.area);

  if (!Number.isFinite(id) || !Number.isFinite(ewz) || !Number.isFinite(area)) continue;

  const b = bboxWgs84(feat.geometry);
  const minX = mercX(b[0]), maxX = mercX(b[2]);
  const minY = mercY(b[1]), maxY = mercY(b[3]);

  out.push({
    id,
    ewz,
    area,
    bboxWgs84: b,
    bboxMerc: [Math.min(minX, maxX), Math.min(minY, maxY), Math.max(minX, maxX), Math.max(minY, maxY)],
    geom: feat.geometry
  });
}

fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote: ${outPath} (${out.length} features)`);
