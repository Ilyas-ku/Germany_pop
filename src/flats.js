import "./commute.css";
import "./flats.css";

const BASE = import.meta.env.BASE_URL;
const BAND_LABEL = { city: "In city", "0-10": "0–10 km", "10-20": "10–20 km", "20-30": "20–30 km", "30-40": "30–40 km" };
const REF_M2 = 70; // dashed reference square

const cardsEl = document.getElementById("cards");
const fmtInt = (v) => Math.round(v).toLocaleString("de-DE");
const fmt2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let data, mode = "edge";

function road(c, maxM2, width) {
  return width < 560 ? roadVertical(c, maxM2, width) : roadHorizontal(c, maxM2, width);
}

function roadHorizontal(c, maxM2, W) {
  const bands = data.meta.bands.filter(b => c.modes[mode][b]);
  const n = bands.length, pad = 46;
  const maxSide = Math.min(112, (W - 2 * pad) / n - 8);
  const side = (m2) => maxSide * Math.sqrt(m2 / maxM2);
  const base = maxSide + 30; // bottom line of squares
  const roadY = base + 34;
  const H = roadY + 44;
  const x = (i) => pad + (i * (W - 2 * pad)) / (n - 1);
  const ref = side(REF_M2);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.name}: affordable flat size by distance">`;
  s += `<line class="road" x1="${x(0)}" x2="${x(n - 1)}" y1="${roadY}" y2="${roadY}"/>`;
  bands.forEach((b, i) => {
    const v = c.modes[mode][b];
    const d = side(v.m2);
    s += `<rect class="ref" x="${x(i) - ref / 2}" y="${base - ref}" width="${ref}" height="${ref}" rx="2"/>`;
    s += `<rect class="flat" x="${x(i) - d / 2}" y="${base - d}" width="${d}" height="${d}" rx="3"><title>${BAND_LABEL[b]}: ${v.m2} m² at ${fmt2(v.rent)} €/m²</title></rect>`;
    s += `<text class="m2" x="${x(i)}" y="${base - Math.max(d, ref) - 8}" text-anchor="middle">${v.m2} m²</text>`;
    s += `<text x="${x(i)}" y="${base + 18}" text-anchor="middle">${fmt2(v.rent)} €/m²</text>`;
    s += `<circle class="stop" cx="${x(i)}" cy="${roadY}" r="6"/>`;
    s += `<text class="band" x="${x(i)}" y="${roadY + 24}" text-anchor="middle">${BAND_LABEL[b]}</text>`;
  });
  return s + "</svg>";
}

// Phone: the road runs downwards, one row per ring
function roadVertical(c, maxM2, W) {
  const bands = data.meta.bands.filter(b => c.modes[mode][b]);
  const maxSide = 64, gap = 14;
  const side = (m2) => maxSide * Math.sqrt(m2 / maxM2);
  const roadX = 10, sqX = 84 + maxSide / 2;
  const rowH = maxSide + gap;
  const H = bands.length * rowH;
  const ref = side(REF_M2);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.name}: affordable flat size by distance">`;
  s += `<line class="road" x1="${roadX}" x2="${roadX}" y1="${rowH / 2}" y2="${H - rowH / 2}"/>`;
  bands.forEach((b, i) => {
    const v = c.modes[mode][b];
    const d = side(v.m2);
    const cy = i * rowH + rowH / 2;
    s += `<circle class="stop" cx="${roadX}" cy="${cy}" r="6"/>`;
    s += `<text class="band" x="${roadX + 14}" y="${cy + 4}">${BAND_LABEL[b]}</text>`;
    s += `<rect class="ref" x="${sqX - ref / 2}" y="${cy - ref / 2}" width="${ref}" height="${ref}" rx="2"/>`;
    s += `<rect class="flat" x="${sqX - d / 2}" y="${cy - d / 2}" width="${d}" height="${d}" rx="3"/>`;
    s += `<text class="m2" x="${sqX + maxSide / 2 + 12}" y="${cy}">${v.m2} m²</text>`;
    s += `<text x="${sqX + maxSide / 2 + 12}" y="${cy + 18}">${fmt2(v.rent)} €/m²</text>`;
  });
  return s + "</svg>";
}

function render() {
  const maxM2 = Math.max(...data.cities.flatMap(c => Object.values(c.modes[mode]).map(v => v.m2)));
  cardsEl.innerHTML = data.cities.map((c, i) => `
    <article class="fl-card" data-i="${i}">
      <div class="fl-head">
        <h2>${c.name}</h2>
        <div class="fl-money">
          <span><b>${fmtInt(c.gross)} €</b> gross</span><span class="arrow">→</span>
          <span><b>${fmtInt(c.net)} €</b> net</span><span class="arrow">→</span>
          <span><b>${fmtInt(c.budget)} €</b> for rent (30 %)</span>
        </div>
      </div>
      <div class="fl-road"></div>
    </article>`).join("");
  cardsEl.querySelectorAll(".fl-card").forEach(el => {
    const c = data.cities[+el.dataset.i];
    const box = el.querySelector(".fl-road");
    box.innerHTML = road(c, maxM2, box.clientWidth || 900);
  });
}

async function init() {
  data = await fetch(`${BASE}data/flats.json`).then(r => r.json());
  document.getElementById("sub").textContent =
    `Median gross wage of people working in the city, converted to net. 30 % of net goes to net cold rent ` +
    `(without utilities). Square area = flat size; dashed square = ${REF_M2} m² for reference.`;
  document.getElementById("foot").textContent =
    `Net: ${data.meta.assumptions} Rents are Zensus 2022 averages of existing leases; asking rents for new leases ` +
    `are higher, so a flat rented today would be smaller. Sources: ${data.meta.attribution}`;
  render();

  let lastW = cardsEl.clientWidth;
  new ResizeObserver(() => {
    if (cardsEl.clientWidth !== lastW) {
      lastW = cardsEl.clientWidth;
      render();
    }
  }).observe(cardsEl);

  document.querySelectorAll('input[name="mode"]').forEach(el => el.addEventListener("change", (e) => {
    mode = e.target.value;
    render();
  }));
}

init();
