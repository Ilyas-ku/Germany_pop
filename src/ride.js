import "./ride.css";
import { C, GLOW, m2Color } from "./neon.js";

// Animated ride out of the city: every 10 km the flat that 30 % of net pay rents gets bigger.
// Numbers are plain averages over the seven largest cities (median earner).
// render(t) is a pure function of time, so the page can be scrubbed (?t=12) and recorded frame by frame.

const BASE = import.meta.env.BASE_URL;
const STOPS = ["0", "10", "20", "30", "40"];
const params = new URLSearchParams(location.search);
if (params.has("capture")) document.body.classList.add("capture");

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (v, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (v) => (v < 0 ? `−${fmt(-v)}` : `+${fmt(v)}`);
const clamp = (v) => Math.max(0, Math.min(1, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const easeBack = (k) => { const c = 1.6; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };

// ---- timeline (seconds) ----
const A0 = 3.0, DRIVE = 1.5, HOLD = 2.3;
const arrive = STOPS.map((_, i) => A0 + i * (DRIVE + HOLD));
const depart = arrive.map((a) => a + HOLD);
const SUM = arrive[4] + 2.6;          // summary card
const END = SUM + 5.6;                // fade to loop
const TOTAL = END + 0.7;

// ---- scene geometry (stage units) ----
const W = 1080, GROUND = 1080, ROAD = [1094, 1134], LABEL_Y = 1176;
const XS = [285, 470, 655, 840, 1010];
const houseW = (m2) => 0.95 * (44 + (m2 - 40) * 3);

const $ = (id) => document.getElementById(id);
let D = null;          // averaged numbers
let els = null;        // element handles

function averages(summary, commute) {
  const cs = Object.values(summary);
  const stops = STOPS.map((k) => ({
    km: +k,
    rent: mean(cs.map((c) => c.stops[k].rent)),
    drop: mean(cs.map((c) => c.stops[k].rent / c.stops["0"].rent - 1)),
    m2: mean(cs.map((c) => c.stops[k].m2.median)),
  }));
  return {
    stops,
    net: mean(cs.map((c) => c.net.median)),
    budget: mean(cs.map((c) => c.net.median * c.share)),
    commuteKm: mean(commute.cities.map((c) => c.median_km_within_100)),
  };
}

/* ---------- build ---------- */

function houseSvg(w) {
  const bh = w * 0.55, rh = w * 0.42, x = -w / 2, sw = Math.max(2, w * 0.024), dw = w * 0.18, dh = bh * 0.5, ww = w * 0.16;
  return `<path d="M${x} 0 V${-bh} L0 ${-bh - rh} L${-x} ${-bh} V0" fill="rgba(89,111,255,.10)" stroke="${C.blue}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>
    <path d="M${-dw / 2} 0 V${-dh} H${dw / 2} V0" fill="none" stroke="${C.blue}" stroke-width="${sw}" stroke-linejoin="round"/>
    <rect x="${x + w * 0.14}" y="${-bh * 0.78}" width="${ww}" height="${ww}" fill="none" stroke="${C.blue}" stroke-width="${sw * 0.8}"/>
    <rect x="${-x - w * 0.14 - ww}" y="${-bh * 0.78}" width="${ww}" height="${ww}" fill="none" stroke="${C.blue}" stroke-width="${sw * 0.8}"/>`;
}

function skylineSvg() {
  const towers = [[30, 28, 120], [62, 28, 176], [94, 36, 236], [134, 26, 150], [164, 22, 104]];
  let s = "";
  towers.forEach(([x, w, h]) => {
    s += `<rect x="${x}" y="${GROUND - h}" width="${w}" height="${h}" fill="rgba(89,111,255,.07)" stroke="${C.blue}" stroke-width="1.6"/>`;
    for (let y = GROUND - h + 14; y < GROUND - 12; y += 18) {
      s += `<line x1="${x + 7}" x2="${x + w - 7}" y1="${y}" y2="${y}" stroke="${C.blue}" stroke-width="1" opacity=".35"/>`;
    }
  });
  s += `<line x1="112" x2="112" y1="${GROUND - 236}" y2="${GROUND - 268}" stroke="${C.blue}" stroke-width="2"/>`;
  return s;
}

function carSvg() {
  const st = `fill="none" stroke="${C.blue}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
  return `<g id="car">
    <g id="speed" opacity="0"><path d="M-78 -30 H-56 M-90 -20 H-58 M-80 -10 H-60" ${st}/></g>
    <g filter="url(#glow)" transform="scale(-1 1)"><!-- body drawn facing left, mirrored so the bonnet leads -->
      <path d="M-46 -8 V-18 Q-45 -23 -38 -24 L-22 -25 L-10 -38 Q-7 -41 -2 -41 H19 Q24 -41 27 -37 L35 -25 L43 -23 Q47 -22 47 -16 V-8 Z" fill="${C.bg}" ${st}/>
      <path d="M-16 -25 L-6 -36 H5 V-25 Z M10 -25 V-36 H20 L28 -25 Z" ${st}/>
      <circle cx="0" cy="-31" r="3.6" ${st}/>
      <circle cx="-26" cy="-7" r="8" fill="${C.bg}" ${st}/><circle cx="28" cy="-7" r="8" fill="${C.bg}" ${st}/>
    </g>
  </g>`;
}

function build() {
  const s = D.stops;
  // title, word by word
  const lines = [["Same", "budget."], ["Every", "10 km,"], ["a", "<em>bigger</em>", "flat."]];
  $("title").innerHTML = lines.map((ws) => `<span class="ln">${ws.map((w) => `<span class="w">${w}</span>`).join(" ")}</span>`).join("");
  $("kicker").textContent = "Average of Germany's 7 largest cities";
  $("chips").innerHTML = [
    "Median earner, single",
    `Net pay <b>${fmt(Math.round(D.net))} €</b>`,
    `30 % = <b>${fmt(Math.round(D.budget))} €</b> warm rent`,
  ].map((c) => `<span class="rd-chip">${c}</span>`).join("");

  // one text block per stop
  const gain = (i) => Math.round(s[i].m2) - Math.round(s[0].m2);
  const blocks = s.map((st, i) => {
    const rows = i === 0
      ? [["Warm rent, new lease", `${fmt(st.rent, 1)} €/m²`, ""],
         [`${fmt(Math.round(D.budget))} € a month rents`, `${Math.round(st.m2)} m²`, Math.round(st.m2) >= 60 ? "good" : "bad"]]
      : [["Rent per m² vs. centre", `${sign(Math.round(st.drop * 100))} %`, "good"],
         ["Same budget rents", `${Math.round(st.m2)} m²`, Math.round(st.m2) >= 60 ? "good" : "bad"],
         ["Extra space", `${sign(gain(i))} m²`, ""]];
    const notes = {
      0: "City centre: 30 % of a median salary rents under 50 m².",
      2: `Half of all commuters live within ~${Math.round(D.commuteKm)} km of the main station.`,
      3: "The 60 m² mark: a comfortable flat for one person.",
      4: `${sign(Math.round((st.m2 / s[0].m2 - 1) * 100))} % more space than in the centre.`,
    };
    return `<div class="rd-block" data-i="${i}">
      <div class="rd-km"><span class="num">${st.km}</span><span class="unit">${i ? "km from the centre" : "km · city centre"}</span></div>
      <div class="rd-rows">${rows.map(([l, v, cls]) => `<div class="rd-row"><span>${l}</span><b class="${cls}">${v}</b></div>`).join("")}
        ${notes[i] ? `<div class="rd-note">${notes[i]}</div>` : ""}</div>
    </div>`;
  });
  const drop40 = Math.round(s[4].drop * 100), more = Math.round((s[4].m2 / s[0].m2 - 1) * 100);
  blocks.push(`<div class="rd-sum" id="sum">
    <h2>Same ${fmt(Math.round(D.budget))} €. <em>40 km</em> out:</h2>
    <div class="rd-stats">
      <div class="rd-stat"><b>${sign(drop40)} %</b><span>rent per m²</span></div>
      <div class="rd-stat"><b>${sign(gain(4))} m²</b><span>${Math.round(s[0].m2)} → ${Math.round(s[4].m2)} m² flat</span></div>
      <div class="rd-stat"><b>${sign(more)} %</b><span>more space</span></div>
    </div>
    <p>Travel time and ticket costs are not included.</p>
  </div>`);
  $("blocks").innerHTML = blocks.join("");
  $("foot").textContent = "Average of Berlin, Hamburg, Munich, Cologne, Frankfurt, Stuttgart and Düsseldorf. Median wage of full-time employees working in the city (BA, 2024), single, tax class I, 2025 rules. Warm rent of a new lease: BBSR asking rents 2025 + Mikrozensus 2022. Distance from the main station, ±5 km.";

  // scene
  let g = `<defs>${GLOW}<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>`;
  g += `<g id="sky">${skylineSvg()}</g>`;
  g += `<line id="ground" x1="24" x2="${W - 24}" y1="${GROUND}" y2="${GROUND}" stroke="${C.ground}" stroke-width="2"/>`;
  g += `<rect id="road" x="24" y="${ROAD[0]}" width="${W - 48}" height="${ROAD[1] - ROAD[0]}" rx="6" fill="#111529"/>`;
  g += `<line id="lane" x1="36" x2="${W - 36}" y1="${(ROAD[0] + ROAD[1]) / 2}" y2="${(ROAD[0] + ROAD[1]) / 2}" stroke="${C.nodata}" stroke-width="2" stroke-dasharray="14 12"/>`;
  // glow faked with a wide translucent line: filters on zero-height lines don't render
  g += `<g id="trail"><line x1="${XS[0]}" x2="${XS[0]}" y1="${ROAD[1] + 6}" y2="${ROAD[1] + 6}" stroke="${C.blue}" stroke-width="10" stroke-linecap="round" opacity=".25"/>` +
    `<line x1="${XS[0]}" x2="${XS[0]}" y1="${ROAD[1] + 6}" y2="${ROAD[1] + 6}" stroke="${C.blue}" stroke-width="3" stroke-linecap="round"/></g>`;
  s.forEach((st, i) => {
    g += `<circle class="dot" data-i="${i}" cx="${XS[i]}" cy="${ROAD[1] + 6}" r="5" fill="${C.bg}" stroke="${C.muted}" stroke-width="2"/>`;
    g += `<text class="km" data-i="${i}" x="${XS[i]}" y="${LABEL_Y}" text-anchor="middle" font-family='"JetBrains Mono",monospace' font-size="20" fill="${C.muted}">${i ? `${st.km} km` : "Centre"}</text>`;
    const w = houseW(st.m2), h = w * 0.97;
    g += `<g class="house" data-i="${i}" transform="translate(${XS[i]} ${GROUND})">${houseSvg(w)}</g>`;
    g += `<g class="lab" data-i="${i}" opacity="0">
      <text class="m2" x="${XS[i]}" y="${GROUND - h - 48}" text-anchor="middle" font-family='"Chakra Petch",sans-serif' font-weight="700" font-size="42" fill="${m2Color(Math.round(st.m2))}"></text>
      <text x="${XS[i]}" y="${GROUND - h - 18}" text-anchor="middle" font-family='"JetBrains Mono",monospace' font-size="19" fill="${C.muted}">${i ? `(${sign(Math.round(st.drop * 100))} %/m²)` : `(${fmt(st.rent, 1)} €/m²)`}</text>
    </g>`;
  });
  g += `<g id="carwrap" transform="translate(${XS[0]} ${ROAD[1] - 4})">${carSvg()}</g>`;
  $("scene").innerHTML = g;

  els = {
    words: [...document.querySelectorAll(".rd-title .w")],
    kicker: $("kicker"), chips: [...document.querySelectorAll(".rd-chip")], foot: $("foot"), fade: $("fade"),
    sky: $("sky"), ground: $("ground"), road: $("road"), lane: $("lane"), trail: $("trail"),
    car: $("carwrap"), speed: $("speed"),
    houses: [...document.querySelectorAll(".house")], labs: [...document.querySelectorAll(".lab")],
    dots: [...document.querySelectorAll(".dot")], kms: [...document.querySelectorAll("text.km")],
    blocks: [...document.querySelectorAll(".rd-block")], sum: $("sum"),
  };
}

/* ---------- render(t) ---------- */

function carX(t) {
  if (t >= SUM) return lerp(XS[4], W + 120, easeInOut(prog(t, SUM, SUM + 1.4)));
  for (let i = 0; i < 4; i++) {
    if (t < arrive[i + 1]) return lerp(XS[i], XS[i + 1], easeInOut(prog(t, depart[i], arrive[i + 1])));
  }
  return XS[4];
}

function render(t) {
  const s = D.stops;

  // header
  els.kicker.style.opacity = prog(t, 0, 0.5);
  els.words.forEach((w, i) => {
    const k = easeOut(prog(t, 0.15 + i * 0.07, 0.75 + i * 0.07));
    w.style.transform = `translateY(${(1 - k) * 110}%)`;
  });
  els.chips.forEach((c, i) => {
    const k = easeOut(prog(t, 1.2 + i * 0.15, 1.8 + i * 0.15));
    c.style.opacity = k;
    c.style.transform = `translateX(${(1 - k) * -30}px)`;
  });
  els.foot.style.opacity = prog(t, 2.0, 2.8);

  // scene draw-in
  const kSky = easeOut(prog(t, 1.6, 2.4));
  els.sky.style.opacity = kSky;
  els.sky.style.transform = `translateY(${(1 - kSky) * 30}px)`;
  const kRoad = easeInOut(prog(t, 1.8, 2.8));
  for (const el of [els.ground, els.road, els.lane]) {
    el.style.clipPath = `inset(0 ${(1 - kRoad) * 100}% 0 0)`;
  }

  // car and trail
  const x = carX(t);
  const moving = STOPS.some((_, i) => i < 4 && t > depart[i] && t < arrive[i + 1]) || (t > SUM && t < SUM + 1.4);
  els.car.setAttribute("transform", `translate(${x} ${ROAD[1] - 4 + (moving ? Math.sin(t * 40) * 0.8 : 0)})`);
  els.car.style.opacity = prog(t, 2.3, 2.8);
  els.speed.setAttribute("opacity", moving ? 0.9 : 0);
  els.trail.querySelectorAll("line").forEach((l) => l.setAttribute("x2", Math.min(x, XS[4])));
  els.trail.style.opacity = prog(t, 2.8, 3.2);

  // stops: house grows, label counts up, km label and dot light up
  s.forEach((st, i) => {
    const a = arrive[i];
    const k = easeBack(prog(t, a, a + 0.7));
    els.houses[i].setAttribute("transform", `translate(${XS[i]} ${GROUND}) scale(${Math.max(0.001, k)})`);
    const kl = easeOut(prog(t, a + 0.3, a + 0.8));
    els.labs[i].setAttribute("opacity", kl);
    els.labs[i].setAttribute("transform", `translate(0 ${(1 - kl) * 14})`);
    const from = i ? Math.round(s[i - 1].m2) : 30;
    els.labs[i].querySelector(".m2").textContent = `${Math.round(lerp(from, Math.round(st.m2), easeOut(prog(t, a + 0.3, a + 1.1))))} m²`;
    const on = t >= a;
    els.dots[i].setAttribute("fill", on ? C.blue : C.bg);
    els.dots[i].setAttribute("stroke", on ? C.blue : C.muted);
    els.kms[i].setAttribute("fill", on ? C.fg : C.muted);
    const kd = prog(t, 2.0 + i * 0.12, 2.5 + i * 0.12);
    els.dots[i].setAttribute("opacity", kd);
    els.kms[i].setAttribute("opacity", kd);
  });

  // text blocks: slide in from below with blur, rows wipe in, slide out upwards
  els.blocks.forEach((b, i) => {
    const a = arrive[i], end = i < 4 ? arrive[i + 1] : SUM;
    const kin = easeOut(prog(t, a + 0.1, a + 0.7));
    const kout = easeInOut(prog(t, end - 0.05, end + 0.4));
    b.style.opacity = kin * (1 - kout);
    b.style.transform = `translateY(${(1 - kin) * 50 - kout * 40}px)`;
    b.style.filter = `blur(${(1 - kin) * 10 + kout * 6}px)`;
    b.querySelectorAll(".rd-row").forEach((r, j) => {
      const kr = easeOut(prog(t, a + 0.3 + j * 0.14, a + 0.8 + j * 0.14));
      r.style.clipPath = `inset(0 ${(1 - kr) * 100}% 0 0)`;
    });
    const note = b.querySelector(".rd-note");
    if (note) {
      const kn = easeBack(prog(t, a + 0.9, a + 1.4));
      note.style.opacity = clamp(kn);
      note.style.transform = `translateX(${(1 - kn) * 60}px)`;
    }
  });

  // summary
  const ks = easeOut(prog(t, SUM + 0.2, SUM + 0.9));
  els.sum.style.opacity = ks;
  els.sum.style.transform = `translateY(${(1 - ks) * 40}px)`;
  els.sum.querySelectorAll(".rd-stat").forEach((c, j) => {
    const kc = easeBack(prog(t, SUM + 0.6 + j * 0.18, SUM + 1.2 + j * 0.18));
    c.style.opacity = clamp(kc);
    c.style.transform = `translateY(${(1 - kc) * 40}px) scale(${0.9 + 0.1 * kc})`;
  });

  els.fade.style.opacity = prog(t, END, TOTAL);
}

/* ---------- playback ---------- */

function fit() {
  const wrap = $("wrap");
  $("stage").style.transform = `scale(${wrap.clientWidth / 1080})`;
}

let playing = true, t0 = 0, tNow = 0;
function frame(now) {
  if (playing) {
    tNow = ((now - t0) / 1000) % TOTAL;
    render(tNow);
  }
  requestAnimationFrame(frame);
}

async function init() {
  const [summary, commute] = await Promise.all([
    fetch(`${BASE}data/agglo/summary.json`).then((r) => r.json()),
    fetch(`${BASE}data/commute_distance.json`).then((r) => r.json()),
  ]);
  D = averages(summary, commute);
  build();
  fit();
  new ResizeObserver(fit).observe($("wrap"));
  await document.fonts.ready;

  // scrub / capture hooks
  window.__total = TOTAL;
  window.__seek = (t) => { playing = false; tNow = t; render(t); };

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (params.has("t") || reduced) window.__seek(params.has("t") ? +params.get("t") : SUM + 3);
  t0 = performance.now();
  requestAnimationFrame(frame);

  $("play").addEventListener("click", () => {
    playing = !playing;
    if (playing) t0 = performance.now() - tNow * 1000;
    $("play").textContent = playing ? "Pause" : "Play";
  });
  $("replay").addEventListener("click", () => {
    playing = true;
    t0 = performance.now();
    $("play").textContent = "Pause";
  });
  document.body.dataset.ready = "1";
}

init();
