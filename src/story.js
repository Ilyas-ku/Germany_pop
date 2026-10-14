import "./story.css";
import { C, SCALE, DIVERGING5, GLOW, m2Color } from "./neon.js";

// Voice-over video for the commuter post. Each scene matches one or two sentences of the
// script (SCENES[i].vo) and is a pure function of local time, so the page can be scrubbed
// (?t=42) and recorded frame by frame for an MP4.

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
if (params.has("capture")) document.body.classList.add("capture");

const NAMES = { berlin: "Berlin", hamburg: "Hamburg", muenchen: "Munich", koeln: "Cologne", frankfurt: "Frankfurt", stuttgart: "Stuttgart", duesseldorf: "Düsseldorf" };
const COMMUTE_NAMES = { "Berlin": "berlin", "Hamburg": "hamburg", "München": "muenchen", "Köln": "koeln", "Frankfurt am Main": "frankfurt", "Stuttgart": "stuttgart", "Düsseldorf": "duesseldorf" };
const STOPS = ["0", "10", "20", "30", "40"];

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (v, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const minus = (v) => `−${fmt(Math.abs(v))}`;
const pct = (ratio) => Math.round(Math.abs(ratio) * 100); // magnitude in %, half rounds up
const clamp = (v) => Math.max(0, Math.min(1, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const easeBack = (k) => { const c = 1.6; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const $ = (id) => document.getElementById(id);
const words = (lines) => lines.map((l) => `<span class="ln">${l.split(" ").map((w) => `<span class="w">${w}</span>`).join(" ")}</span>`).join("");
const MONO = `font-family='"JetBrains Mono",monospace'`;
const DISP = `font-family='"Chakra Petch",sans-serif' font-weight="700"`;
const BODY = `font-family='"IBM Plex Sans",sans-serif'`;

// Outline house standing on (0, 0), body width w
function house(w) {
  const bh = w * 0.55, rh = w * 0.42, x = -w / 2, sw = Math.max(2, w * 0.024), dw = w * 0.18, dh = bh * 0.5;
  return `<path d="M${x} 0 V${-bh} L0 ${-bh - rh} L${-x} ${-bh} V0" fill="rgba(89,111,255,.10)" stroke="${C.blue}" stroke-width="${sw}" stroke-linejoin="round" filter="url(#glow)"/>
    <path d="M${-dw / 2} 0 V${-dh} H${dw / 2} V0" fill="none" stroke="${C.blue}" stroke-width="${sw}"/>`;
}
const houseW = (m2, k = 1) => k * (44 + (m2 - 40) * 3);

/* ---------- generic effects ----------
   data-in="t"   local start time;  data-fx = up | wipe | pop | fade | words;  data-out="t" fades out */
function fx(root, lt) {
  for (const el of root.querySelectorAll("[data-in]")) {
    const a = +el.dataset.in, kind = el.dataset.fx || "up";
    const out = el.dataset.out ? easeInOut(prog(lt, +el.dataset.out, +el.dataset.out + 0.4)) : 0;
    if (kind === "words") {
      el.querySelectorAll(".w").forEach((w, i) => {
        const k = easeOut(prog(lt, a + i * 0.06, a + 0.55 + i * 0.06));
        w.style.transform = `translateY(${(1 - k) * 110}%)`;
      });
      el.style.opacity = 1 - out;
      continue;
    }
    const k = prog(lt, a, a + (kind === "wipe" ? 0.7 : 0.6));
    if (kind === "up") {
      const e = easeOut(k);
      el.style.opacity = e * (1 - out);
      el.style.transform = `translateY(${(1 - e) * 40 - out * 30}px)`;
      el.style.filter = `blur(${(1 - e) * 8 + out * 6}px)`;
    } else if (kind === "wipe") {
      const e = easeOut(k);
      el.style.clipPath = `inset(-20px ${(1 - e) * 100}% -20px 0)`;
      el.style.opacity = 1 - out;
    } else if (kind === "pop") {
      const e = easeBack(k);
      el.style.opacity = clamp(k * 2) * (1 - out);
      el.style.transform = `scale(${0.85 + 0.15 * e})`;
    } else {
      el.style.opacity = easeOut(k) * (1 - out);
    }
  }
}

/* ---------- data ---------- */

let D = null;
function prepare(summary, commute, kreise) {
  const cities = Object.keys(NAMES).map((slug) => {
    const c = summary[slug];
    return {
      slug, name: NAMES[slug], net: c.net.median,
      m2: STOPS.map((k) => c.stops[k].m2.median),
      rent: STOPS.map((k) => c.stops[k].rent),
    };
  });
  for (const c of commute.cities) {
    const city = cities.find((x) => x.slug === COMMUTE_NAMES[c.name]);
    city.inCommuters = c.in_commuters;
    city.commuteKm = c.median_km_within_100;
  }
  const top = kreise.features.map((f) => f.properties).sort((a, b) => b.warm_flat - a.warm_flat);
  return {
    cities,
    avgRent: STOPS.map((_, i) => mean(cities.map((c) => c.rent[i]))),
    // mean of the per-city changes, as in ride.html
    avgDrop40: mean(cities.map((c) => c.rent[4] / c.rent[0] - 1)),
    avgNet: mean(cities.map((c) => c.net)),
    avgBudget: mean(cities.map((c) => c.net)) * 0.3,
    totalIn: cities.reduce((a, c) => a + c.inCommuters, 0),
    munichRent: top[0].warm_flat, districts: top.length,
    gain20: mean(cities.map((c) => c.m2[2] - c.m2[0])),
  };
}

/* ---------- scenes ---------- */
// dur in seconds; cue times inside a scene follow the voice-over at ~2.5 words per second

const SCENES = [
  {
    vo: "How quickly do rent prices decrease as you move away from the city center?",
    dur: 6.5, src: "Average warm rent per m² on a new lease, 7 largest cities",
    html: () => `<h1 class="h1 abs" style="top:130px" data-in="0.2" data-fx="words">${words(["How quickly do", "rent prices <em>decrease</em>", "as you move away", "from the city center?"])}</h1>`,
    svg() {
      const r = D.avgRent, X = (i) => 150 + i * 195, Y = (v) => lerp(1190, 830, (v - 13) / 6.5);
      const pts = r.map((v, i) => [X(i), Y(v)]);
      let s = `<line x1="110" x2="970" y1="1220" y2="1220" stroke="${C.ground}" stroke-width="2"/>`;
      s += `<path id="s0line" d="M${pts.map((p) => p.join(" ")).join(" L")}" fill="none" stroke="${C.blue}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>`;
      pts.forEach(([x, y], i) => {
        s += `<g class="s0pt" opacity="0"><circle cx="${x}" cy="${y}" r="9" fill="${C.bg}" stroke="${C.blue}" stroke-width="4"/>
          <text x="${x}" y="${y - 28}" text-anchor="middle" ${MONO} font-size="26" fill="${C.fg}">${fmt(r[i], 1)} €</text></g>`;
        s += `<text x="${x}" y="1262" text-anchor="middle" ${MONO} font-size="22" fill="${C.muted}" class="s0x" opacity="0">${i ? `${STOPS[i]} km` : "center"}</text>`;
      });
      s += `<text id="s0drop" x="${X(4)}" y="${Y(r[4]) + 90}" text-anchor="middle" ${DISP} font-size="64" fill="${C.good}" opacity="0">${minus(pct(D.avgDrop40))} %</text>`;
      return s;
    },
    render(lt, el) {
      const line = el.querySelector("#s0line"), len = line.getTotalLength();
      const k = easeInOut(prog(lt, 1.4, 3.8));
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len * (1 - k);
      el.querySelectorAll(".s0pt").forEach((p, i) => p.setAttribute("opacity", easeOut(prog(lt, 1.4 + i * 0.6, 1.8 + i * 0.6))));
      el.querySelectorAll(".s0x").forEach((p) => p.setAttribute("opacity", prog(lt, 1.2, 1.8)));
      const kd = easeBack(prog(lt, 4.0, 4.6));
      const d = el.querySelector("#s0drop");
      d.setAttribute("opacity", clamp(kd));
    },
  },
  {
    vo: "Nearly 3 million employees work in Germany's seven largest cities but live outside them.",
    dur: 5.5, src: "Pendleratlas 2024 · Federal Employment Agency, employees, June 2023",
    html: () => `
      <div class="abs big" style="top:210px" data-in="0.1" data-fx="fade"><span id="s1n">0.00</span><small>million</small></div>
      <div class="abs h3" style="top:450px" data-in="0.9">employees work in</div>
      <div class="abs h3" style="top:510px" data-in="1.1">Germany's 7 largest cities</div>
      <div class="abs h3" style="top:570px" data-in="1.5">but live <em>outside</em> them.</div>
      <div class="abs chips" style="top:720px">${D.cities.map((c, i) => `<span class="chip" data-in="${2.2 + i * 0.12}" data-fx="pop">${c.name}</span>`).join("")}</div>`,
    render(lt, el) {
      el.querySelector("#s1n").textContent = fmt((D.totalIn / 1e6) * easeOut(prog(lt, 0.1, 1.6)), 2);
    },
  },
  {
    vo: "Munich alone draws 530,000 people from beyond its borders, more than Berlin does.",
    dur: 5.5, src: "In-commuters: employees who work in the city and live outside it (Pendleratlas 2024)",
    html: () => {
      const mu = D.cities.find((c) => c.slug === "muenchen"), be = D.cities.find((c) => c.slug === "berlin");
      return `
      <div class="abs h3" style="top:130px" data-in="0.1">Munich alone draws</div>
      <div class="abs big" style="top:200px;font-size:170px" data-in="0.4" data-fx="pop"><em>${fmt(Math.round(mu.inCommuters / 1000))},000</em></div>
      <div class="abs sub" style="top:380px" data-in="1.0">people from beyond its borders,</div>
      <div class="abs sub" style="top:430px;color:var(--fg)" data-in="3.3">more than Berlin (${fmt(Math.round(be.inCommuters / 1000))},000).</div>`;
    },
    svg() {
      const rows = [...D.cities].sort((a, b) => b.inCommuters - a.inCommuters);
      let s = "";
      rows.forEach((c, i) => {
        const y = 620 + i * 88, w = (c.inCommuters / 540000) * 560;
        const col = c.slug === "muenchen" ? C.blue : SCALE.blue[1];
        s += `<text x="72" y="${y + 34}" ${BODY} font-size="30" fill="${C.fg}">${c.name}</text>`;
        s += `<rect class="s2bar" data-w="${w}" data-slug="${c.slug}" x="300" y="${y + 6}" height="40" rx="6" width="0" fill="${col}" ${c.slug === "muenchen" ? 'filter="url(#glow)"' : ""}/>`;
        s += `<text class="s2val" data-x="${310 + w}" x="${310 + w}" y="${y + 36}" ${MONO} font-size="26" fill="${C.fg}" opacity="0">${fmt(Math.round(c.inCommuters / 1000))}k</text>`;
      });
      return s;
    },
    render(lt, el) {
      el.querySelectorAll(".s2bar").forEach((b, i) => {
        b.setAttribute("width", +b.dataset.w * easeOut(prog(lt, 0.6 + i * 0.12, 1.5 + i * 0.12)));
        if (b.dataset.slug === "berlin") b.setAttribute("fill", lt > 3.3 ? SCALE.blue[3] : SCALE.blue[1]);
      });
      el.querySelectorAll(".s2val").forEach((v, i) => v.setAttribute("opacity", prog(lt, 1.3 + i * 0.12, 1.7 + i * 0.12)));
    },
  },
  {
    vo: "Since I also work in Frankfurt and live in another city, I wanted to know what the commuters like me actually get for the ride.",
    dur: 10.5, src: "Flat size for 30 % of net pay, by municipality around Frankfurt",
    html: () => `
      <h2 class="h2 abs" style="top:120px" data-in="0.2" data-fx="words">${words(["I work in <em>Frankfurt</em>", "and live outside it."])}</h2>
      <div class="abs legend" style="top:292px" data-in="1.2" data-fx="fade"><span><i style="background:${DIVERGING5[0]}"></i>under 60 m²</span><span><i style="background:${DIVERGING5[2]}"></i>around 60 m²</span><span><i style="background:${DIVERGING5[4]}"></i>over 60 m²</span></div>
      <div class="mapimg" id="s3map" style="left:72px;top:350px;width:936px;height:880px" data-in="0.8" data-fx="fade"><img src="${BASE}story/frankfurt.png" alt=""></div>
      <div class="abs box" style="top:1080px;left:110px;right:110px" data-in="4.6">What do commuters like me actually get for the ride?</div>`,
    render(lt, el) {
      el.querySelector("#s3map img").style.transform = `scale(${1 + 0.07 * prog(lt, 0, 10.5)})`;
    },
  },
  {
    vo: "First, how far they travel. Among commuters who live within 100 km of their city, half live closer than about 20 to 26 km from the main station.",
    dur: 11.5, src: "Pendleratlas 2024 · median straight-line distance from home to the main station",
    html: () => `
      <h2 class="h2 abs" style="top:120px" data-in="0.2" data-fx="words">${words(["How far do they travel?"])}</h2>
      <div class="abs sub" style="top:210px" data-in="2.0">Commuters who live within 100 km</div>
      <div class="abs" style="top:290px" data-in="6.6"><span class="num" style="font-size:96px"><em>20–26 km</em></span>
        <div class="sub" style="margin-top:6px;color:var(--fg)">half live closer than this</div></div>`,
    svg() {
      const cx = 540, cy = 900, k = 8.2;
      let s = `<circle id="s4band" cx="${cx}" cy="${cy}" r="${20 * k}" fill="none" stroke="${C.blue}" stroke-width="0" opacity=".38" filter="url(#glow)"/>`;
      [10, 20, 30, 40].forEach((r, i) => {
        s += `<circle class="s4ring" cx="${cx}" cy="${cy}" r="${r * k}" fill="none" stroke="${C.muted}" stroke-width="1.5" stroke-dasharray="6 6" opacity="0"/>`;
        s += `<text class="s4lab" x="${cx + r * k * 0.707 + 8}" y="${cy - r * k * 0.707 - 8}" ${MONO} font-size="20" fill="${C.muted}" opacity="0">${r} km</text>`;
      });
      // commuters as dots: deterministic sample with a median of ~24 km
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 150; i++) {
        const z = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
        const r = Math.min(44, 23.6 * Math.exp(0.5 * z)), a = rnd() * Math.PI * 2;
        s += `<circle class="s4dot" data-r="${r}" cx="${cx + Math.cos(a) * r * k}" cy="${cy + Math.sin(a) * r * k}" r="4" fill="${SCALE.blue[3]}" opacity="0"/>`;
      }
      s += `<circle cx="${cx}" cy="${cy}" r="9" fill="${C.blue}" filter="url(#glow)"/>`;
      s += `<text x="${cx}" y="${cy + 38}" text-anchor="middle" ${MONO} font-size="20" fill="${C.fg}">main station</text>`;
      return s;
    },
    render(lt, el) {
      el.querySelectorAll(".s4ring").forEach((r, i) => r.setAttribute("opacity", 0.7 * prog(lt, 2.0 + i * 0.25, 2.5 + i * 0.25)));
      el.querySelectorAll(".s4lab").forEach((r, i) => r.setAttribute("opacity", prog(lt, 2.2 + i * 0.25, 2.7 + i * 0.25)));
      el.querySelectorAll(".s4dot").forEach((d, i) => {
        d.setAttribute("opacity", 0.85 * prog(lt, 3.0 + (i % 50) * 0.04, 3.4 + (i % 50) * 0.04));
        const inner = +d.dataset.r <= 23.6;
        d.setAttribute("fill", lt > 7.0 && inner ? C.blue : SCALE.blue[2]);
      });
      // band from 20 to 26 km
      const k = easeOut(prog(lt, 6.6, 7.6)), r1 = 20 * 8.2, r2 = 26 * 8.2;
      const band = el.querySelector("#s4band");
      band.setAttribute("r", (r1 + r2) / 2);
      band.setAttribute("stroke-width", (r2 - r1) * k);
    },
  },
  {
    vo: "Stuttgart and Frankfurt have the shortest typical commutes, at around 20 km. Berlin and Hamburg have the longest, at around 26 km.",
    dur: 9, src: "Median distance of commuters living within 100 km (Pendleratlas 2024)",
    html: () => `<h2 class="h2 abs" style="top:120px" data-in="0.2" data-fx="words">${words(["Typical commute,", "by city"])}</h2>`,
    svg() {
      const rows = [...D.cities].sort((a, b) => a.commuteKm - b.commuteKm);
      const X = (km) => lerp(330, 960, (km - 15) / 15);
      let s = "";
      [15, 20, 25, 30].forEach((km) => {
        s += `<line x1="${X(km)}" x2="${X(km)}" y1="400" y2="1110" stroke="${C.line}" stroke-width="1.5"/>`;
        s += `<text x="${X(km)}" y="1150" text-anchor="middle" ${MONO} font-size="20" fill="${C.muted}">${km} km</text>`;
      });
      rows.forEach((c, i) => {
        const y = 440 + i * 100;
        const grp = ["stuttgart", "frankfurt"].includes(c.slug) ? "short" : ["berlin", "hamburg"].includes(c.slug) ? "long" : "";
        s += `<g class="s5row" data-grp="${grp}">
          <text x="72" y="${y + 10}" ${BODY} font-size="32" fill="${C.fg}">${c.name}</text>
          <line x1="${X(15)}" x2="${X(30)}" y1="${y}" y2="${y}" stroke="${C.ground}" stroke-width="2"/>
          <circle class="s5dot" data-x="${X(c.commuteKm)}" cx="${X(15)}" cy="${y}" r="13" fill="${SCALE.blue[3]}"/>
          <text class="s5val" data-x="${X(c.commuteKm)}" x="${X(c.commuteKm)}" y="${y - 24}" text-anchor="middle" ${MONO} font-size="24" fill="${C.fg}" opacity="0">${fmt(c.commuteKm, 1)}</text>
        </g>`;
      });
      return s;
    },
    render(lt, el) {
      el.querySelectorAll(".s5row").forEach((r, i) => {
        const dot = r.querySelector(".s5dot"), val = r.querySelector(".s5val");
        const k = easeOut(prog(lt, 0.5 + i * 0.1, 1.4 + i * 0.1));
        dot.setAttribute("cx", lerp(330, +dot.dataset.x, k));
        val.setAttribute("opacity", prog(lt, 1.2 + i * 0.1, 1.6 + i * 0.1));
        const g = r.dataset.grp;
        const on = (g === "short" && lt > 1.0) || (g === "long" && lt > 4.8);
        const col = on ? (g === "short" ? C.good : C.bad) : SCALE.blue[3];
        dot.setAttribute("fill", col);
        dot.setAttribute("filter", on ? "url(#glow)" : "");
        val.setAttribute("fill", on ? col : C.fg);
        r.setAttribute("opacity", lt > 1.0 ? (on ? 1 : 0.35) : 1);
      });
    },
  },
  {
    vo: "Then, what that distance buys. Picture a single person earning the median wage in the city who spends 30 % of their net pay on warm rent for a flat on a new lease.",
    dur: 13.5, src: "Median wage of full-time employees working in the city (BA, 2024) · single, tax class I, 2025 rules",
    html: () => `
      <h2 class="h2 abs" style="top:120px" data-in="0.2" data-fx="words">${words(["What does that", "distance <em>buy</em>?"])}</h2>
      <svg class="abs" style="top:360px;left:72px;width:120px;height:150px" viewBox="0 0 120 150" data-in="2.0" data-fx="pop">
        <circle cx="60" cy="38" r="26" fill="rgba(89,111,255,.10)" stroke="${C.blue}" stroke-width="3"/>
        <path d="M14 146 V118 Q14 78 60 78 Q106 78 106 118 V146" fill="rgba(89,111,255,.10)" stroke="${C.blue}" stroke-width="3" stroke-linejoin="round"/>
      </svg>
      <div class="abs rows" style="top:540px">
        <div class="row" data-in="2.0" data-fx="wipe"><span>A single person<i>tax class I</i></span><b></b></div>
        <div class="row" data-in="3.6" data-fx="wipe"><span>Median wage in the city</span><b>Ø ${fmt(Math.round(D.avgNet))} € net</b></div>
        <div class="row" data-in="6.4" data-fx="wipe"><span>30 % of net pay</span><b>Ø ${fmt(Math.round(D.avgBudget))} €</b></div>
        <div class="row" data-in="9.2" data-fx="wipe"><span>Warm rent, new lease</span><b>incl. heating</b></div>
      </div>`,
  },
  {
    vo: "In the city center, that buys between 40 and 55 m², depending on the city.",
    dur: 6.5, src: "30 % of net pay on warm rent, new lease, within 5 km of the main station",
    html: () => {
      const v = D.cities.map((c) => c.m2[0]);
      return `<div class="abs h3" style="top:130px" data-in="0.2">In the city center:</div>
        <div class="abs" style="top:210px" data-in="0.9" data-fx="pop"><span class="num bad" style="font-size:150px">${Math.min(...v)}–${Math.max(...v)} m²</span></div>`;
    },
    svg() {
      const rows = [...D.cities].sort((a, b) => a.m2[0] - b.m2[0]);
      let s = `<line x1="40" x2="1040" y1="1090" y2="1090" stroke="${C.ground}" stroke-width="2"/>`;
      rows.forEach((c, i) => {
        const x = 110 + i * 143, w = houseW(c.m2[0], 0.9), h = w * 0.97;
        s += `<g class="s7h" data-x="${x}" transform="translate(${x} 1090) scale(0)">${house(w)}</g>`;
        s += `<text class="s7l" x="${x}" y="${1090 - h - 22}" text-anchor="middle" ${DISP} font-size="36" fill="${m2Color(c.m2[0])}" opacity="0">${c.m2[0]} m²</text>`;
        s += `<text x="${x}" y="1134" text-anchor="middle" ${BODY} font-size="24" fill="${C.fg}">${c.name}</text>`;
      });
      return s;
    },
    render(lt, el) {
      el.querySelectorAll(".s7h").forEach((h, i) => {
        const k = Math.max(0.001, easeBack(prog(lt, 1.6 + i * 0.22, 2.2 + i * 0.22)));
        h.setAttribute("transform", `translate(${h.dataset.x} 1090) scale(${k})`);
      });
      el.querySelectorAll(".s7l").forEach((l, i) => l.setAttribute("opacity", prog(lt, 2.0 + i * 0.22, 2.4 + i * 0.22)));
    },
  },
  {
    vo: "Twenty kilometres out, the picture splits. In Düsseldorf, the same budget rents 75 m². In Stuttgart, Frankfurt and Cologne it reaches about 60 m², which is a comfortable flat for one person. Hamburg and Berlin stay in the low 50s. Munich, with the highest net pay of the seven, stays below 50 m².",
    dur: 21, src: "Median earner, 30 % of net pay on warm rent, new lease · center vs. 20 km (±5 km)",
    phases: [0, 2.5, 5.7, 12.7, 15.7],
    html() {
      const by = (s) => D.cities.find((c) => c.slug === s);
      const p = this.phases, o = (i) => (i < 4 ? `data-out="${p[i + 1] - 0.2}"` : "");
      const blk = (i, a, b) => `<div class="abs" style="top:120px" data-in="${p[i] + 0.1}" ${o(i)}><div class="h2">${a}</div><div class="sub">${b}</div></div>`;
      return [
        blk(0, "20 km out,", "the picture splits."),
        blk(1, `Düsseldorf: <span class="good">${by("duesseldorf").m2[2]} m²</span>`, "for the same budget"),
        blk(2, `Stuttgart, Frankfurt, Cologne: <span class="good">≈ 60 m²</span>`, "a comfortable flat for one person"),
        blk(3, `Hamburg, Berlin: <span class="bad">low 50s</span>`, `${by("hamburg").m2[2]} and ${by("berlin").m2[2]} m²`),
        blk(4, `Munich: <span class="bad">${by("muenchen").m2[2]} m²</span>`, "with the highest net pay of the seven"),
      ].join("");
    },
    svg() {
      const rows = [...D.cities].sort((a, b) => b.m2[2] - a.m2[2]);
      const X = (m) => lerp(330, 1000, (m - 35) / 45);
      const grp = { duesseldorf: 1, stuttgart: 2, frankfurt: 2, koeln: 2, hamburg: 3, berlin: 3, muenchen: 4 };
      let s = `<line x1="${X(60)}" x2="${X(60)}" y1="400" y2="1160" stroke="${C.fg}" stroke-width="1.5" stroke-dasharray="6 6" opacity=".5"/>
        <text x="${X(60)}" y="390" text-anchor="middle" ${MONO} font-size="20" fill="${C.fg}">60 m²</text>
        <g ${MONO} font-size="20" fill="${C.muted}"><circle cx="${X(35) + 6}" cy="1196" r="8" fill="none" stroke="${C.muted}" stroke-width="2.5"/><text x="${X(35) + 22}" y="1203">center</text>
        <circle cx="${X(35) + 136}" cy="1196" r="8" fill="${C.blue}"/><text x="${X(35) + 152}" y="1203">20 km</text></g>`;
      rows.forEach((c, i) => {
        const y = 450 + i * 100, x0 = X(c.m2[0]), x1 = X(c.m2[2]);
        s += `<g class="s8row" data-g="${grp[c.slug]}">
          <text x="72" y="${y + 10}" ${BODY} font-size="32" fill="${C.fg}">${c.name}</text>
          <line class="s8line" data-x0="${x0}" data-x1="${x1}" x1="${x0}" x2="${x0}" y1="${y}" y2="${y}" stroke="${C.blue}" stroke-width="4"/>
          <circle cx="${x0}" cy="${y}" r="10" fill="${C.bg}" stroke="${C.muted}" stroke-width="3"/>
          <circle class="s8dot" cx="${x0}" cy="${y}" r="14" fill="${m2Color(c.m2[2])}"/>
          <text class="s8val" x="${x1 + 26}" y="${y + 9}" ${DISP} font-size="30" fill="${m2Color(c.m2[2])}" opacity="0">${c.m2[2]} m²</text>
        </g>`;
      });
      return s;
    },
    render(lt, el) {
      const p = this.phases;
      const phase = p.filter((a) => lt >= a).length - 1;
      el.querySelectorAll(".s8row").forEach((r, i) => {
        const k = easeInOut(prog(lt, 0.4 + i * 0.12, 1.6 + i * 0.12));
        const line = r.querySelector(".s8line"), dot = r.querySelector(".s8dot");
        const x = lerp(+line.dataset.x0, +line.dataset.x1, k);
        line.setAttribute("x2", x);
        dot.setAttribute("cx", x);
        r.querySelector(".s8val").setAttribute("opacity", prog(lt, 1.4 + i * 0.12, 1.8 + i * 0.12));
        const on = phase === 0 || +r.dataset.g === phase;
        r.setAttribute("opacity", on ? 1 : 0.28);
        dot.setAttribute("filter", on && phase > 0 ? "url(#glow)" : "");
      });
    },
  },
  {
    vo: "This is yet another proof of Munich being the most expensive city in Germany.",
    dur: 6.5, src: "Warm rent of a 60 m² flat on a new lease, by district · brighter = more expensive",
    html: () => `
      <h2 class="h2 abs" style="top:120px" data-in="0.2" data-fx="words">${words(["Munich: the most", "expensive rents"])}</h2>
      <div class="mapimg" style="left:290px;top:330px;width:${Math.round(900 * 1350 / 1650)}px;height:900px;border:0" data-in="0.6" data-fx="fade"><img src="${BASE}story/germany_rent.png" alt=""></div>
      <div class="abs box" style="top:1000px;left:72px;right:auto;width:470px" data-in="2.2">
        <span class="num" style="font-size:64px;color:var(--fg)">${fmt(D.munichRent)} €</span>
        <div style="font:400 26px/1.35 var(--body);color:var(--muted);margin-top:6px">a month for 60 m², warm.<br>#1 of ${D.districts} districts</div>
      </div>`,
    svg() {
      const w = 900 * 1350 / 1650, x = 290 + 0.604 * w, y = 330 + 0.878 * 900;
      return `<circle id="s9ring" cx="${x}" cy="${y}" r="30" fill="none" stroke="${C.fg}" stroke-width="3" opacity="0"/>
        <path id="s9lead" d="M${x - 30} ${y} L 542 1050" stroke="${C.fg}" stroke-width="2" opacity="0"/>`;
    },
    render(lt, el) {
      const k = prog(lt, 1.6, 2.2), pulse = 1 + 0.12 * Math.sin(lt * 5);
      const ring = el.querySelector("#s9ring");
      ring.setAttribute("opacity", k);
      ring.setAttribute("r", 30 * pulse);
      el.querySelector("#s9lead").setAttribute("opacity", 0.7 * prog(lt, 2.2, 2.6));
    },
  },
  {
    vo: "At the same time, I was a bit surprised how fast the prices drop for Cologne and Düsseldorf. Due to high level of urbanization in Rhine-Ruhr region I expected the prices to be flatter compared to other big cities. Probably this level of development distributes housing demand.",
    dur: 19, src: "Warm rent per m² on a new lease: center vs. 20 km (±5 km)",
    html: () => `
      <div class="abs" style="top:120px" data-in="0.2" data-out="7.0"><div class="h2">How fast do rents fall?</div><div class="sub">rent per m², center → 20 km</div></div>
      <div class="abs" style="top:120px" data-in="7.4"><div class="h2">Rhine-Ruhr: a region</div><div class="h2">of <em>big cities</em></div></div>
      <div class="mapimg" id="s10map" style="left:72px;top:330px;width:936px;height:880px;opacity:0"><img src="${BASE}story/duesseldorf.png" alt=""></div>
      <div class="abs box" style="top:1060px;left:110px;right:110px" data-in="15.4">Demand spreads across many cities.</div>`,
    svg() {
      const rows = D.cities.map((c) => ({ ...c, drop: c.rent[2] / c.rent[0] - 1 })).sort((a, b) => a.drop - b.drop);
      let s = `<g id="s10chart">`;
      rows.forEach((c, i) => {
        const y = 400 + i * 100, w = (-c.drop / 0.3) * 560;
        const hi = ["duesseldorf", "koeln"].includes(c.slug);
        s += `<g class="s10row" data-hi="${hi ? 1 : 0}">
          <text x="72" y="${y + 34}" ${BODY} font-size="32" fill="${C.fg}">${c.name}</text>
          <rect class="s10bar" data-w="${w}" x="330" y="${y + 6}" height="40" rx="6" width="0" fill="${SCALE.blue[3]}"/>
          <text class="s10val" x="${342 + w}" y="${y + 37}" ${MONO} font-size="28" fill="${C.fg}" opacity="0">${minus(pct(c.drop))} %</text>
        </g>`;
      });
      return s + `</g>`;
    },
    render(lt, el) {
      const out = easeInOut(prog(lt, 7.0, 7.6));
      el.querySelector("#s10chart").setAttribute("opacity", 1 - out);
      el.querySelectorAll(".s10row").forEach((r, i) => {
        r.querySelector(".s10bar").setAttribute("width", +r.querySelector(".s10bar").dataset.w * easeOut(prog(lt, 0.6 + i * 0.12, 1.5 + i * 0.12)));
        r.querySelector(".s10val").setAttribute("opacity", prog(lt, 1.3 + i * 0.12, 1.7 + i * 0.12));
        const on = lt < 3.0 || r.dataset.hi === "1";
        r.setAttribute("opacity", on ? 1 : 0.3);
        r.querySelector(".s10bar").setAttribute("fill", r.dataset.hi === "1" && lt >= 3.0 ? C.blue : SCALE.blue[3]);
        r.querySelector(".s10bar").setAttribute("filter", r.dataset.hi === "1" && lt >= 3.0 ? "url(#glow)" : "");
      });
      const map = el.querySelector("#s10map");
      map.style.opacity = easeOut(prog(lt, 7.4, 8.2));
      map.querySelector("img").style.transform = `scale(${1 + 0.06 * prog(lt, 7.4, 19)})`;
    },
  },
  {
    vo: "",
    dur: 5.5, src: "",
    html: () => `
      <div class="abs h3" style="top:130px;color:var(--muted)" data-in="0.1">Same budget, 20 km out:</div>
      <div class="abs" style="top:210px" data-in="0.4" data-fx="pop"><span class="num good" style="font-size:150px">+${fmt(Math.round(D.gain20))} m²</span></div>
      <div class="abs sub" style="top:390px;color:var(--fg)" data-in="0.8">on average across the 7 largest cities</div>
      <div class="abs src-list" style="top:560px" data-in="1.2">
        <div>Commuters: Pendleratlas 2024 · Federal Employment Agency, June 2023</div>
        <div>Wages: Federal Employment Agency, full-time employees, Dec 2024 · net pay: single, tax class I, 2025 rules</div>
        <div>Warm rent: BBSR asking rents 2025 · Mikrozensus 2022 · Zensus 2022</div>
        <div>Distances: straight line from the main station, ±5 km. Travel time and ticket costs are not included.</div>
      </div>`,
  },
];

/* ---------- build & render ---------- */

let starts = [], TOTAL = 0, sceneEls = [];

function build() {
  let t = 0;
  starts = SCENES.map((s) => { const a = t; t += s.dur; return a; });
  TOTAL = t;
  $("scenes").innerHTML = SCENES.map((s, i) => `<section class="sc" data-i="${i}">
      ${s.html.call(s)}
      ${s.svg ? `<svg class="chart" viewBox="0 0 1080 1350"><defs>${GLOW}</defs>${s.svg()}</svg>` : ""}
    </section>`).join("");
  sceneEls = [...document.querySelectorAll(".sc")];
}

function render(t) {
  $("progress").style.width = `${(t / TOTAL) * 100}%`;
  let cur = 0;
  SCENES.forEach((s, i) => {
    const el = sceneEls[i], a = starts[i], lt = t - a;
    const vis = lt > -0.4 && lt < s.dur + 0.4;
    el.style.display = vis ? "" : "none";
    if (!vis) return;
    if (lt >= 0 && lt < s.dur) cur = i;
    const kin = i === 0 ? 1 : easeOut(prog(lt, -0.3, 0.25));
    const kout = i === SCENES.length - 1 ? 0 : easeInOut(prog(lt, s.dur - 0.3, s.dur + 0.2));
    el.style.opacity = kin * (1 - kout);
    fx(el, lt);
    if (s.render) s.render(lt, el);
  });
  $("count").textContent = `${String(cur + 1).padStart(2, "0")} / ${String(SCENES.length).padStart(2, "0")}`;
  $("src").textContent = SCENES[cur].src;
  $("time").textContent = `${t.toFixed(1)} / ${TOTAL.toFixed(1)} s`;
}

function fit() { $("stage").style.transform = `scale(${$("wrap").clientWidth / 1080})`; }

let playing = true, t0 = 0, tNow = 0;
function frame(now) {
  if (playing) {
    tNow = Math.min(TOTAL, (now - t0) / 1000);
    render(tNow);
  }
  requestAnimationFrame(frame);
}

async function init() {
  const [summary, commute, kreise] = await Promise.all([
    fetch(`${BASE}data/agglo/summary.json`).then((r) => r.json()),
    fetch(`${BASE}data/commute_distance.json`).then((r) => r.json()),
    fetch(`${BASE}data/kreise_warm.geojson`).then((r) => r.json()),
  ]);
  D = prepare(summary, commute, kreise);
  build();
  fit();
  new ResizeObserver(fit).observe($("wrap"));
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));

  window.__total = TOTAL;
  window.__seek = (t) => { playing = false; tNow = t; render(t); };
  window.__script = () => SCENES.map((s, i) => ({ start: starts[i], dur: s.dur, vo: s.vo }));

  if (params.has("t")) window.__seek(+params.get("t"));
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
