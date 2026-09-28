import "./commute.css";

const BASE = import.meta.env.BASE_URL;
const SERIES = Array.from({ length: 7 }, (_, i) => `var(--series-${i + 1})`);
const BAND_LABEL = { city: "In city", "0-10": "0–10 km", "10-20": "10–20 km", "20-30": "20–30 km", "30-40": "30–40 km" };

const chartEl = document.getElementById("chart");
const legendEl = document.getElementById("legend");
const tableEl = document.getElementById("table");
const tip = document.getElementById("tip");

const fmt2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (v) => Math.round(v).toLocaleString("de-DE");

let rings, dist, mode = "edge", rentMode = "ask";

// Rent per ring: BBSR asking rents 2025 (new leases) or Zensus 2022 (existing leases)
function cell(c, band) {
  const v = c.modes[mode][band];
  return rentMode === "ask" ? v.ask : v;
}

function bandsFor(m) {
  return rings.meta.bands.filter(b => rings.cities.some(c => c.modes[m][b]));
}

function renderChart() {
  const bands = bandsFor(mode);
  const W = Math.max(320, chartEl.clientWidth || 860);
  const narrow = W < 600;
  const H = narrow ? 300 : 380, m = { t: 12, r: narrow ? 92 : 120, b: 40, l: 32 };
  const bandLabel = (b) => narrow ? BAND_LABEL[b].replace(" km", "").replace("In city", "City") : BAND_LABEL[b];
  const values = rings.cities.flatMap(c => bands.map(b => cell(c, b)?.ratio)).filter(Number.isFinite);
  const lo = Math.floor(Math.min(...values)), hi = Math.ceil(Math.max(...values));
  const x = (i) => m.l + (i * (W - m.l - m.r)) / (bands.length - 1);
  const y = (v) => m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wage to rent ratio by distance ring for seven cities">`;
  for (let v = lo; v <= hi; v++) {
    svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
  bands.forEach((b, i) => {
    svg += `<text x="${x(i)}" y="${H - m.b + 20}" text-anchor="middle">${bandLabel(b)}</text>`;
  });

  // end labels, nudged apart so they don't overlap
  const ends = rings.cities.map((c, ci) => ({ ci, y: y(cell(c, bands.at(-1)).ratio) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);

  rings.cities.forEach((c, ci) => {
    const pts = bands.map((b, i) => [x(i), y(cell(c, b).ratio)]);
    svg += `<polyline class="series" data-ci="${ci}" stroke="${SERIES[ci]}" points="${pts.map(p => p.join(",")).join(" ")}"/>`;
    pts.forEach(([px, py], i) => {
      svg += `<circle class="dot" data-ci="${ci}" cx="${px}" cy="${py}" r="4" fill="${SERIES[ci]}"/>`;
      svg += `<circle class="hit" data-ci="${ci}" data-b="${bands[i]}" cx="${px}" cy="${py}" r="12"/>`;
    });
    const end = ends.find(e => e.ci === ci);
    svg += `<text class="end-label" x="${W - m.r + 10}" y="${end.y + 4}">${narrow ? c.name.replace(" am Main", "") : c.name}</text>`;
  });
  svg += `<text class="axis-title" x="${m.l}" y="${m.t - 2}" dy="-2">ratio</text>`;
  if (narrow) svg += `<text class="axis-title" x="${W - m.r}" y="${H - 4}" text-anchor="end">km</text>`;
  chartEl.innerHTML = svg + "</svg>";

  chartEl.querySelectorAll(".hit").forEach(el => {
    el.addEventListener("pointerenter", (e) => showTip(e, +el.dataset.ci, el.dataset.b));
    el.addEventListener("pointermove", moveTip);
    el.addEventListener("pointerleave", hideTip);
  });
}

function showTip(e, ci, band) {
  const c = rings.cities[ci];
  const v = cell(c, band);
  tip.textContent = `${c.name} · ${BAND_LABEL[band]}\nWage: ${fmtInt(c.wage)} €\nRent: ${fmt2(v.rent)} €/m² → ${fmtInt(v.rent * rings.meta.flat_m2)} €\nRatio: ${fmt2(v.ratio)} (rent = ${fmt1(100 / v.ratio)} % of wage)`;
  tip.hidden = false;
  moveTip(e);
  chartEl.querySelectorAll(".series, .dot").forEach(el => el.classList.toggle("dim", +el.dataset.ci !== ci));
}

function moveTip(e) {
  const pad = 14;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(e.clientX + pad, window.innerWidth - r.width - 8)}px`;
  tip.style.top = `${Math.min(e.clientY + pad, window.innerHeight - r.height - 8)}px`;
}

function hideTip() {
  tip.hidden = true;
  chartEl.querySelectorAll(".dim").forEach(el => el.classList.remove("dim"));
}

function renderLegend() {
  legendEl.innerHTML = rings.cities.map((c, i) => `<span><i style="background:${SERIES[i]}"></i>${c.name}</span>`).join("");
}

function renderTable() {
  const bands = bandsFor(mode);
  const head = `<tr><th>City</th><th>Median wage</th>${bands.map(b => `<th>${BAND_LABEL[b]}</th>`).join("")}</tr>`;
  const rows = rings.cities.map(c => `<tr><td>${c.name}</td><td>${fmtInt(c.wage)} €</td>${bands.map(b => {
    const v = cell(c, b);
    return `<td><b>${fmt2(v.ratio)}</b> <small>${fmt2(v.rent)} €/m²</small></td>`;
  }).join("")}</tr>`).join("");
  tableEl.innerHTML = `<thead>${head}</thead><tbody>${rows}</tbody>`;
  document.getElementById("table-note").textContent = mode === "edge"
    ? "Rings are measured outward from the city boundary. Rings can include other cities (e.g. Köln lies 20–30 km from Düsseldorf's boundary)."
    : "Rings are measured from the main station, so the inner rings of large cities (Berlin, Hamburg) are still inside the city.";
}

function renderDistance() {
  const head = "<tr><th>City</th><th>In-commuters</th><th>Median, all</th><th>25–75 %</th><th>Median, living ≤ 100 km</th><th>Share ≤ 100 km</th></tr>";
  const rows = dist.cities.map(c => `<tr><td>${c.name}</td><td>${fmtInt(c.in_commuters)}</td><td><b>${fmt1(c.median_km)} km</b></td><td>${fmt1(c.q25_km)}–${fmt1(c.q75_km)} km</td><td><b>${fmt1(c.median_km_within_100)} km</b></td><td>${Math.round(c.share_within_100 * 100)} %</td></tr>`).join("");
  document.getElementById("dist").innerHTML = `<thead>${head}</thead><tbody>${rows}</tbody>`;
  document.getElementById("dist-note").textContent =
    "People whose main residence is outside the city, straight-line distance from their municipality to the main station. " +
    "Official commuter counts include people with a main residence far away who travel weekly, hence the ≤ 100 km column as a proxy for daily commuters. " +
    "Flows of ≥ 1000 people are exact; smaller flows are placed by district totals and population, so the medians are estimates.";
}

async function init() {
  let afford;
  [rings, dist, afford] = await Promise.all([
    fetch(`${BASE}data/commute.json`).then(r => r.json()),
    fetch(`${BASE}data/commute_distance.json`).then(r => r.json()),
    fetch(`${BASE}data/affordability_rings.json`).then(r => r.json()),
  ]);
  rings.cities.forEach((c, i) => {
    for (const [m, bands] of Object.entries(c.modes)) {
      for (const [b, v] of Object.entries(bands)) {
        const rent = afford.cities[i].modes[m][b].rent_asking;
        v.ask = { rent, ratio: c.wage / (rent * rings.meta.flat_m2) };
      }
    }
  });
  document.getElementById("sources").textContent = `Sources: ${rings.meta.attribution} Asking rents: BBSR 2025 per district, spread over the Zensus grid. ${dist.meta.attribution}`;
  renderLegend();
  renderChart();
  renderTable();
  renderDistance();

  let lastW = chartEl.clientWidth;
  new ResizeObserver(() => {
    if (chartEl.clientWidth !== lastW) {
      lastW = chartEl.clientWidth;
      renderChart();
    }
  }).observe(chartEl);

  document.querySelectorAll('input[name="mode"]').forEach(el => el.addEventListener("change", (e) => {
    mode = e.target.value;
    renderChart();
    renderTable();
  }));
  document.querySelectorAll('input[name="rent"]').forEach(el => el.addEventListener("change", (e) => {
    rentMode = e.target.value;
    renderChart();
    renderTable();
  }));
}

init();
