// Unpack a PMTiles archive into a static {z}/{x}/{y}.pbf directory.
// GitHub Pages gzips .pmtiles on the fly and then answers Range requests with
// slices of the gzipped stream, which breaks PMTiles in some browsers.
// Plain tile files need no Range requests.
//
// Usage: node scripts/pmtiles-to-dir.mjs public/data/gemeinden.pmtiles public/data/tiles

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { PMTiles } from "pmtiles";

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) {
  console.error("Usage: node scripts/pmtiles-to-dir.mjs <in.pmtiles> <outDir>");
  process.exit(1);
}

class FileSource {
  constructor(p) { this.fd = fs.openSync(p, "r"); this.p = p; }
  getKey() { return this.p; }
  async getBytes(offset, length) {
    const b = Buffer.alloc(length);
    fs.readSync(this.fd, b, 0, length, offset);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + length) };
  }
}

const archive = new PMTiles(new FileSource(src));
const header = await archive.getHeader();

fs.rmSync(outDir, { recursive: true, force: true });

let written = 0;
for (let z = header.minZoom; z <= header.maxZoom; z++) {
  const n = 2 ** z;
  const lon2x = lon => Math.floor((lon + 180) / 360 * n);
  const lat2y = lat => {
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
  };
  const [x0, x1] = [lon2x(header.minLon), lon2x(header.maxLon)];
  const [y0, y1] = [lat2y(header.maxLat), lat2y(header.minLat)];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const t = await archive.getZxy(z, x, y);
      if (!t) continue;
      const buf = Buffer.from(t.data);
      const dir = path.join(outDir, String(z), String(x));
      fs.mkdirSync(dir, { recursive: true });
      // getZxy normally returns decompressed bytes; gunzip only if still gzipped
      const isGz = buf[0] === 0x1f && buf[1] === 0x8b;
      fs.writeFileSync(path.join(dir, `${y}.pbf`), isGz ? zlib.gunzipSync(buf) : buf);
      written++;
    }
  }
}
console.log(`wrote ${written} tiles (z${header.minZoom}–${header.maxZoom}) to ${outDir}`);
