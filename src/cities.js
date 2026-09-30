import "./agglo.css";

// All seven agglomerations on one picture: flat size for 30 % of net pay
// in the centre and every 10 km out. Same scale in every row.
const BASE = import.meta.env.BASE_URL;
const CITIES = [
  ["berlin", "Berlin"], ["hamburg", "Hamburg"], ["muenchen", "Munich"], ["koeln", "Cologne"],
  ["frankfurt", "Frankfurt"], ["stuttgart", "Stuttgart"], ["duesseldorf", "Düsseldorf"],
];
const STOPS = ["0", "10", "20", "30", "40"];
const REF_M2 = 60;
const WAGE_LABEL = { median: "Median", p25: "Lower-quarter" };

const fmtEur = (v) => `${Math.round(v).toLocaleString("en-US")} €`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

let persona = "median";
let summary = null;

const CSS = `
  .bg{fill:#f7f3ea}.road{fill:#c7cbd1}.rowline{stroke:#e6e1d6;stroke-width:1}
  .roof{fill:#9e2c1c}.facade{fill:#e0924f}.door{fill:#4e2e1c}.win{fill:#fdf6e8}
  .tw0{fill:#27365c}.tw1{fill:#35507f}.tw2{fill:#4a6b9e}
  .lo{fill:#d9533a}.hi{fill:#16655c}
  text{font-family:Inter,system-ui,sans-serif}
  .t-title{font-weight:800;fill:#14161c;letter-spacing:-.02em}
  .t-sub{font-weight:500;fill:#3c3f47}
  .t-col{font-weight:700;fill:#545861}
  .t-city{font-weight:800;fill:#14161c}
  .t-det{font-weight:500;fill:#545861}
  .t-m2{font-weight:800;letter-spacing:-.01em}
  .t-foot{font-weight:400;fill:#6b6e75}
`;

// Plain house: body, roof, door, two windows. Width w, standing on (cx, base).
function home(cx, base, w) {
  const h = w * 0.5, rh = w * 0.36, ov = w * 0.08, x = cx - w / 2, top = base - h, ww = w * 0.17;
  return `<path d="M${x - ov} ${top} L${cx} ${top - rh} L${x + w + ov} ${top} Z" class="roof"/>
    <rect x="${x}" y="${top}" width="${w}" height="${h}" class="facade"/>
    <rect x="${x + w * 0.12}" y="${top + h * 0.22}" width="${ww}" height="${ww}" class="win"/>
    <rect x="${x + w * 0.88 - ww}" y="${top + h * 0.22}" width="${ww}" height="${ww}" class="win"/>
    <rect x="${cx - w * 0.08}" y="${base - h * 0.6}" width="${w * 0.16}" height="${h * 0.6}" class="door"/>`;
}
const homeHeight = (w) => w * 0.86;

function skyline(x, base, s = 1) {
  return [[0, 14, 34, "tw2"], [15, 16, 58, "tw0"], [32, 14, 44, "tw1"], [47, 12, 28, "tw2"]]
    .map(([dx, w, h, c]) => `<rect x="${x + dx * s}" y="${base - h * s}" width="${w * s}" height="${h * s}" class="${c}"/>`).join("");
}

function rows() {
  return CITIES.map(([slug, name]) => {
    const c = summary[slug];
    return { name, net: c.net[persona], budget: c.net[persona] * c.share, m2: STOPS.map(s => c.stops[s].m2[persona]) };
  });
}

// widest house = largest flat of any city and either income, so rows and
// incomes share one scale; width grows with the square of m² (exaggerated)
function scale(wMax) {
  const max = Math.max(...Object.values(summary).flatMap(c => STOPS.flatMap(s => Object.values(c.stops[s].m2))));
  return (m2) => wMax * (m2 / max) ** 2;
}

const label = (m2) => (m2 < REF_M2 ? "lo" : "hi");

function header(titleLines, subLines, legendY, fs) {
  let s = "";
  titleLines.forEach((t, i) => { s += `<text x="${fs.pad}" y="${fs.titleY + i * fs.title * 1.15}" class="t-title" font-size="${fs.title}">${esc(t)}</text>`; });
  subLines.forEach((t, i) => { s += `<text x="${fs.pad}" y="${fs.subY + i * fs.sub * 1.35}" class="t-sub" font-size="${fs.sub}">${t}</text>`; });
  const ly = legendY, r = fs.sub * 0.4;
  s += `<circle cx="${fs.pad + r}" cy="${ly - r}" r="${r}" class="lo"/><text x="${fs.pad + r * 2 + 6}" y="${ly}" class="t-sub" font-size="${fs.sub}">under 60 m²</text>`;
  const x2 = fs.pad + fs.sub * 9;
  s += `<circle cx="${x2 + r}" cy="${ly - r}" r="${r}" class="hi"/><text x="${x2 + r * 2 + 6}" y="${ly}" class="t-sub" font-size="${fs.sub}">60 m² or more</text>`;
  return s;
}

function horizontal() {
  const W = 1200, pad = 40, rowH = 170, y0 = 196, n = CITIES.length;
  const H = y0 + rowH * n + 44;
  const xs = [420, 585, 750, 915, 1080];
  const width = scale(128);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flat size for 30 % of net pay in seven German cities, centre to 40 km">
  <style>${CSS}</style><rect width="${W}" height="${H}" class="bg"/>`;
  s += header(["How much flat does 30 % of net pay rent?"],
    [`${WAGE_LABEL[persona]} wage in the city, single, warm rent of a new lease. Bigger house = bigger flat (sizes exaggerated).`],
    128, { pad, title: 34, titleY: 60, sub: 16, subY: 92 });
  STOPS.forEach((km, i) => {
    s += `<text x="${xs[i]}" y="${y0 - 8}" text-anchor="middle" class="t-col" font-size="15">${km === "0" ? "Centre" : `${km} km`}</text>`;
  });
  rows().forEach((r, i) => {
    const top = y0 + i * rowH, base = top + rowH - 24;
    if (i) s += `<line x1="${pad}" x2="${W - pad}" y1="${top}" y2="${top}" class="rowline"/>`;
    s += `<text x="${pad}" y="${base - 58}" class="t-city" font-size="24">${esc(r.name)}</text>`;
    s += `<text x="${pad}" y="${base - 32}" class="t-det" font-size="14">net ${fmtEur(r.net)}</text>`;
    s += `<text x="${pad}" y="${base - 12}" class="t-det" font-size="14">${fmtEur(r.budget)} for rent</text>`;
    s += `<rect x="262" y="${base}" width="${W - pad - 262}" height="10" rx="5" class="road"/>`;
    s += skyline(272, base, 1);
    r.m2.forEach((m2, j) => {
      const w = width(m2);
      s += home(xs[j], base, w);
      s += `<text x="${xs[j]}" y="${base - homeHeight(w) - 10}" text-anchor="middle" class="t-m2 ${label(m2)}" font-size="24">${m2} m²</text>`;
    });
  });
  s += `<text x="${pad}" y="${H - 18}" class="t-foot" font-size="12">Distance from the main station, ±5 km. Warm rent: BBSR asking rents 2025, Zensus 2022, Mikrozensus 2022. Net pay: BA wage 2024, single, tax class I, 2025 rules.</text>`;
  return s + `</svg>`;
}

function vertical() {
  const W = 390, pad = 16, rowH = 132, y0 = 196, n = CITIES.length;
  const H = y0 + rowH * n + 50;
  const xs = [52, 124, 196, 268, 340];
  const width = scale(60);
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flat size for 30 % of net pay in seven German cities, centre to 40 km">
  <style>${CSS}</style><rect width="${W}" height="${H}" class="bg"/>`;
  s += header(["How much flat does", "30 % of net pay rent?"],
    [`${WAGE_LABEL[persona]} wage in the city, single,`, "warm rent of a new lease.", "Bigger house = bigger flat (exaggerated)."],
    160, { pad, title: 22, titleY: 36, sub: 13, subY: 84 });
  STOPS.forEach((km, i) => {
    s += `<text x="${xs[i]}" y="${y0 - 6}" text-anchor="middle" class="t-col" font-size="12">${km === "0" ? "Centre" : `${km} km`}</text>`;
  });
  rows().forEach((r, i) => {
    const top = y0 + i * rowH, base = top + rowH - 18;
    s += `<line x1="${pad}" x2="${W - pad}" y1="${top}" y2="${top}" class="rowline"/>`;
    s += `<text x="${pad}" y="${top + 24}" class="t-city" font-size="17">${esc(r.name)}</text>`;
    s += `<text x="${W - pad}" y="${top + 24}" text-anchor="end" class="t-det" font-size="12">net ${fmtEur(r.net)} · ${fmtEur(r.budget)} for rent</text>`;
    s += `<rect x="${pad}" y="${base}" width="${W - 2 * pad}" height="6" rx="3" class="road"/>`;
    r.m2.forEach((m2, j) => {
      const w = width(m2);
      s += home(xs[j], base, w);
      s += `<text x="${xs[j]}" y="${base - homeHeight(w) - 6}" text-anchor="middle" class="t-m2 ${label(m2)}" font-size="15">${m2} m²</text>`;
    });
  });
  s += `<text x="${pad}" y="${H - 30}" class="t-foot" font-size="10">Distance from the main station, ±5 km. BBSR 2025, Zensus 2022,</text>`;
  s += `<text x="${pad}" y="${H - 16}" class="t-foot" font-size="10">Mikrozensus 2022. Net pay: single, tax class I, 2025 rules.</text>`;
  return s + `</svg>`;
}

function render() {
  const el = document.getElementById("compare");
  el.innerHTML = el.clientWidth < 700 ? vertical() : horizontal();
}

document.querySelectorAll('input[name="persona"]').forEach(el => el.addEventListener("change", (e) => {
  persona = e.target.value;
  render();
}));

let lastW = 0;
new ResizeObserver(() => {
  const w = document.getElementById("compare").clientWidth;
  if (summary && (w < 700) !== (lastW < 700)) render();
  lastW = w;
}).observe(document.getElementById("compare"));

fetch(`${BASE}data/agglo/summary.json`).then(r => r.json()).then((d) => { summary = d; render(); });
