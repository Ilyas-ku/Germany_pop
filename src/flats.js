import "./commute.css";
import "./flats.css";

const BASE = import.meta.env.BASE_URL;
const BAND_LABEL = { city: "In city", "0-10": "0–10 km", "10-20": "10–20 km", "20-30": "20–30 km", "30-40": "30–40 km" };
const PERSONA_LABEL = { median: "median", p25: "25th percentile" };

const cardsEl = document.getElementById("cards");
const fmtInt = (v) => Math.round(v).toLocaleString("de-DE");
const fmt2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => `${Math.round(v * 100)} %`;

let data, mode = "edge", persona = "median";

const bandsOf = (c) => data.meta.bands.filter(b => c.modes[mode][b]);
const tipOf = (c, b) => {
  const v = c.modes[mode][b], p = v.personas[persona];
  return `${BAND_LABEL[b]}: ${p.m2} m² for 30 % of ${fmtInt(p.net)} € net at ${fmt2(v.rent)} €/m². ` +
    `Old method (Zensus average, net cold): ${p.m2_old} m².`;
};

function road(c, maxM2, width) {
  return width < 560 ? roadVertical(c, maxM2, width) : roadHorizontal(c, maxM2, width);
}

function roadHorizontal(c, maxM2, W) {
  const bands = bandsOf(c);
  const n = bands.length, pad = 58;
  const maxSide = Math.min(104, (W - 2 * pad) / n - 8);
  const side = (m2) => maxSide * Math.sqrt(m2 / maxM2);
  const base = maxSide + 30;
  const roadY = base + 56;
  const H = roadY + 40;
  const x = (i) => pad + (i * (W - 2 * pad)) / (n - 1);
  const ref = side(data.meta.flat_m2);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.name}: affordable flat size by distance">`;
  s += `<line class="road" x1="${x(0)}" x2="${x(n - 1)}" y1="${roadY}" y2="${roadY}"/>`;
  bands.forEach((b, i) => {
    const v = c.modes[mode][b], p = v.personas[persona];
    const d = side(p.m2);
    s += `<rect class="flat" x="${x(i) - d / 2}" y="${base - d}" width="${d}" height="${d}" rx="3"><title>${tipOf(c, b)}</title></rect>`;
    s += `<rect class="ref" x="${x(i) - ref / 2}" y="${base - ref}" width="${ref}" height="${ref}" rx="2"/>`;
    s += `<text class="m2" x="${x(i)}" y="${base - Math.max(d, ref) - 8}" text-anchor="middle">${p.m2} m²</text>`;
    s += `<text x="${x(i)}" y="${base + 18}" text-anchor="middle">${fmt2(v.rent)} €/m²</text>`;
    s += `<text class="${p.share > data.meta.share ? "over" : ""}" x="${x(i)}" y="${base + 36}" text-anchor="middle">${data.meta.flat_m2} m² = ${pct(p.share)}</text>`;
    s += `<circle class="stop" cx="${x(i)}" cy="${roadY}" r="6"/>`;
    s += `<text class="band" x="${x(i)}" y="${roadY + 24}" text-anchor="middle">${BAND_LABEL[b]}</text>`;
  });
  return s + "</svg>";
}

// Phone: the road runs downwards, one row per ring
function roadVertical(c, maxM2, W) {
  const bands = bandsOf(c);
  const maxSide = 64, gap = 14;
  const side = (m2) => maxSide * Math.sqrt(m2 / maxM2);
  const roadX = 10, sqX = 84 + maxSide / 2;
  const rowH = maxSide + gap;
  const H = bands.length * rowH;
  const ref = side(data.meta.flat_m2);
  const tx = sqX + maxSide / 2 + 12;

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.name}: affordable flat size by distance">`;
  s += `<line class="road" x1="${roadX}" x2="${roadX}" y1="${rowH / 2}" y2="${H - rowH / 2}"/>`;
  bands.forEach((b, i) => {
    const v = c.modes[mode][b], p = v.personas[persona];
    const d = side(p.m2);
    const cy = i * rowH + rowH / 2;
    s += `<circle class="stop" cx="${roadX}" cy="${cy}" r="6"/>`;
    s += `<text class="band" x="${roadX + 14}" y="${cy + 4}">${BAND_LABEL[b]}</text>`;
    s += `<rect class="flat" x="${sqX - d / 2}" y="${cy - d / 2}" width="${d}" height="${d}" rx="3"/>`;
    s += `<rect class="ref" x="${sqX - ref / 2}" y="${cy - ref / 2}" width="${ref}" height="${ref}" rx="2"/>`;
    s += `<text class="m2" x="${tx}" y="${cy - 8}">${p.m2} m²</text>`;
    s += `<text x="${tx}" y="${cy + 10}">${fmt2(v.rent)} €/m²</text>`;
    s += `<text class="${p.share > data.meta.share ? "over" : ""}" x="${tx}" y="${cy + 26}">${data.meta.flat_m2} m² = ${pct(p.share)} of net</text>`;
  });
  return s + "</svg>";
}

function render() {
  const maxM2 = Math.max(...data.cities.flatMap(c => Object.values(c.modes[mode]).map(v => v.personas[persona].m2)), data.meta.flat_m2);
  cardsEl.innerHTML = data.cities.map((c, i) => {
    const city = c.modes[mode].city.personas[persona];
    return `
    <article class="fl-card" data-i="${i}">
      <div class="fl-head">
        <h2>${c.name}</h2>
        <div class="fl-money">
          <span><b>${fmtInt(c.wage[persona])} €</b> gross (${PERSONA_LABEL[persona]})</span><span class="arrow">→</span>
          <span><b>${fmtInt(city.net)} €</b> net</span><span class="arrow">→</span>
          <span><b>${fmtInt(city.net * data.meta.share)} €</b> for rent (30 %)</span>
        </div>
      </div>
      <div class="fl-road"></div>
    </article>`;
  }).join("");
  cardsEl.querySelectorAll(".fl-card").forEach(el => {
    const box = el.querySelector(".fl-road");
    box.innerHTML = road(data.cities[+el.dataset.i], maxM2, box.clientWidth || 900);
  });
}

async function init() {
  data = await fetch(`${BASE}data/flats.json`).then(r => r.json());
  const m = data.meta;
  document.getElementById("sub").textContent =
    `Solid square: flat size you get for 30 % of net income at the warm rent of a new lease (incl. utilities and heating). ` +
    `Dashed square: a ${m.flat_m2} m² flat; the line below says what share of net income it would take.`;
  const items = [
    `Wage: median (or 25th percentile, interpolated from BA wage classes) gross monthly wage of full-time employees working in the city, 31.12.2024.`,
    `Net: ${m.assumptions} Commuting allowance uses the straight-line distance to the main station, so it slightly understates the tax saving.`,
    `Rent: warm rent of a new lease. Level: BBSR asking rents 2025 per district. Within a district the rent follows what households who moved in during the two years before the 2022 census pay in each municipality (Zensus table 5000H-0009), not the average of all leases. Plus a small-flat premium (≤ 65 m²) from the Zensus 100 m grid, and utilities and heating paid to the landlord from Mikrozensus 2022 by region. Heating paid directly to a gas supplier is not included.`,
    `Commuting: a Deutschlandticket costs ${m.ticket} € / month (2025) wherever you live, so it does not change the comparison between rings; travel time is not modelled yet.`,
    `Sources: ${m.sources}`,
  ];
  document.getElementById("method").innerHTML = items.map(t => `<li>${t}</li>`).join("");
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
  document.querySelectorAll('input[name="persona"]').forEach(el => el.addEventListener("change", (e) => {
    persona = e.target.value;
    render();
  }));
}

init();
