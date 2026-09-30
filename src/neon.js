// "Neon" palette and the shared outline house for the top-7 city pages.
export const C = {
  bg: "#0B0E1A", fg: "#E6E8F0", muted: "#8A90A8", line: "#1E2440", nodata: "#2A2F45", ground: "#262C48",
  blue: "#596FFF", aqua: "#26FFDB", pink: "#FF3396", lemon: "#FFDD33", orchid: "#F68CFF",
};
// 1 = weak → 5 = saturated
export const SCALE = {
  blue: ["#222A67", "#2F3A8B", "#3D4BB0", "#4B5DD7", "#596FFF"],
  aqua: ["#01463B", "#05705F", "#049E86", "#0CCEB0", "#26FFDB"],
  pink: ["#610A35", "#86134B", "#AC1E63", "#D5287C", "#FF3396"],
};
export const FONT = {
  display: '"Chakra Petch",system-ui,sans-serif',
  body: '"IBM Plex Sans",system-ui,sans-serif',
  mono: '"JetBrains Mono",ui-monospace,monospace',
};
export const REF_M2 = 60;
// binary threshold: aqua = at least the 60 m² reference flat, pink = below
export const m2Color = (m2) => (m2 >= REF_M2 ? C.aqua : C.pink);

export const GLOW = `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

// Body width grows linearly with m² (40 m² → 44 units); k scales the whole house
export const houseW = (m2, k = 1) => k * Math.max(12, 44 + (m2 - 40) * 3);
export const houseH = (w) => w * 0.97;

// Thin blue outline house on ground line gy, m² label above in the threshold colour
export function house(cx, gy, m2, { k = 1, font = 30, gap = 16 } = {}) {
  const w = houseW(m2, k), bh = w * 0.55, rh = w * 0.42, x = cx - w / 2, by = gy - bh, sw = Math.max(1.5, w * 0.022);
  const dw = w * 0.18, dh = bh * 0.5;
  return `<path d="M${x} ${gy} V${by} L${cx} ${by - rh} L${x + w} ${by} V${gy}" fill="rgba(89,111,255,.10)" stroke="${C.blue}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>` +
    `<path d="M${cx - dw / 2} ${gy} V${gy - dh} H${cx + dw / 2} V${gy}" fill="none" stroke="${C.blue}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<text x="${cx}" y="${by - rh - gap}" text-anchor="middle" fill="${m2Color(m2)}" font-family='${FONT.display}' font-weight="700" font-size="${font}">${m2} m²</text>`;
}

// Small dark skyline standing on gy, left edge sx
export function skyline(sx, gy, k = 1) {
  let s = "";
  [[0, 40, "#2A3160"], [20, 64, "#343C75"], [40, 48, "#2A3160"], [60, 32, "#222850"]]
    .forEach(([dx, h, f]) => { s += `<rect x="${sx + dx * k}" y="${gy - h * k}" width="${18 * k}" height="${h * k}" rx="${2 * k}" fill="${f}"/>`; });
  [[25, 54], [25, 40], [45, 36], [5, 28]]
    .forEach(([dx, dy]) => { s += `<rect x="${sx + dx * k}" y="${gy - dy * k}" width="${5 * k}" height="${5 * k}" fill="${C.blue}" opacity=".7"/>`; });
  return s;
}
