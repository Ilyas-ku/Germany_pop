import fs from "node:fs";

const fc = JSON.parse(fs.readFileSync("data-src/Germany_Gemeinde.geojson", "utf8"));

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

function scanCoords(coords) {
  for (const c of coords) {
    if (typeof c[0] === "number") {
      const [x, y] = c;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else {
      scanCoords(c);
    }
  }
}

for (const f of fc.features) {
  if (!f.geometry) continue;
  scanCoords(f.geometry.coordinates);
}

console.log({ minX, minY, maxX, maxY });
