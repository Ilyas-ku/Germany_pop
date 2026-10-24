import "./story.css";
import { C, SCALE, DIVERGING5, GLOW, m2Color } from "./neon.js";

// Voice-over video for the commuter post, built on the visual language of ride.html
// (road, car, outline houses, skyline) and the agglomeration maps. Each scene matches one or
// two sentences of the script (SCENES[i].vo) and is a pure function of local time, so the page
// can be scrubbed (?t=42) and recorded frame by frame for an MP4.

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
if (params.has("capture")) document.body.classList.add("capture");

const NAMES = { berlin: "Berlin", hamburg: "Hamburg", muenchen: "Munich", koeln: "Cologne", frankfurt: "Frankfurt", stuttgart: "Stuttgart", duesseldorf: "Düsseldorf" };
const COMMUTE_NAMES = { "Berlin": "berlin", "Hamburg": "hamburg", "München": "muenchen", "Köln": "koeln", "Frankfurt am Main": "frankfurt", "Stuttgart": "stuttgart", "Düsseldorf": "duesseldorf" };
const STOPS = ["0", "10", "20", "30", "40"];
// agglomeration map images (public/story): 1000 css px square, main station in the centre,
// a 44 km circle fitted with 12 px padding
const MAP_PX_PER_KM = 488 / 44;

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (v, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const minus = (v) => `−${fmt(Math.abs(v))}`;
const pct = (ratio) => Math.round(Math.abs(ratio) * 100);
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

/* ---------- shared drawings (as in ride.html) ---------- */

function house(w) {
  const bh = w * 0.55, rh = w * 0.42, x = -w / 2, sw = Math.max(2, w * 0.024), dw = w * 0.18, dh = bh * 0.5, ww = w * 0.16;
  return `<path d="M${x} 0 V${-bh} L0 ${-bh - rh} L${-x} ${-bh} V0" fill="rgba(89,111,255,.10)" stroke="${C.blue}" stroke-width="${sw}" stroke-linejoin="round" filter="url(#glow)"/>
    <path d="M${-dw / 2} 0 V${-dh} H${dw / 2} V0" fill="none" stroke="${C.blue}" stroke-width="${sw}"/>
    <rect x="${x + w * 0.14}" y="${-bh * 0.78}" width="${ww}" height="${ww}" fill="none" stroke="${C.blue}" stroke-width="${sw * 0.8}"/>
    <rect x="${-x - w * 0.14 - ww}" y="${-bh * 0.78}" width="${ww}" height="${ww}" fill="none" stroke="${C.blue}" stroke-width="${sw * 0.8}"/>`;
}
const houseW = (m2, k = 1) => k * (44 + (m2 - 40) * 3);

// skyline standing on (x, ground), about 156 × 268 at k = 1
function skyline(x, ground, k = 1) {
  const towers = [[0, 28, 120], [32, 28, 176], [64, 36, 236], [104, 26, 150], [134, 22, 104]];
  let s = "";
  towers.forEach(([dx, w, h]) => {
    s += `<rect x="${x + dx * k}" y="${ground - h * k}" width="${w * k}" height="${h * k}" fill="rgba(89,111,255,.07)" stroke="${C.blue}" stroke-width="1.6"/>`;
    for (let y = ground - h * k + 14 * k; y < ground - 12 * k; y += 18 * k) {
      s += `<line x1="${x + (dx + 6) * k}" x2="${x + (dx + w - 6) * k}" y1="${y}" y2="${y}" stroke="${C.blue}" stroke-width="1" opacity=".35"/>`;
    }
  });
  return s + `<line x1="${x + 82 * k}" x2="${x + 82 * k}" y1="${ground - 236 * k}" y2="${ground - 268 * k}" stroke="${C.blue}" stroke-width="2"/>`;
}

// car facing right, wheels on y = 0; the body is drawn facing left and mirrored so the bonnet leads
function car(id = "", speedLines = true) {
  const st = `fill="none" stroke="${C.blue}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
  return `<g ${id ? `id="${id}"` : ""}>
    ${speedLines ? `<g class="speed" opacity="0"><path d="M-78 -30 H-56 M-90 -20 H-58 M-80 -10 H-60" ${st}/></g>` : ""}
    <g filter="url(#glow)" transform="scale(-1 1)">
      <path d="M-46 -8 V-18 Q-45 -23 -38 -24 L-22 -25 L-10 -38 Q-7 -41 -2 -41 H19 Q24 -41 27 -37 L35 -25 L43 -23 Q47 -22 47 -16 V-8 Z" fill="${C.bg}" ${st}/>
      <path d="M-16 -25 L-6 -36 H5 V-25 Z M10 -25 V-36 H20 L28 -25 Z" ${st}/>
      <circle cx="0" cy="-31" r="3.6" ${st}/>
      <circle cx="-26" cy="-7" r="8" fill="${C.bg}" ${st}/><circle cx="28" cy="-7" r="8" fill="${C.bg}" ${st}/>
    </g>
  </g>`;
}
const road = (x1, x2, y, h = 34) => `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" rx="6" fill="#111529"/>
  <line x1="${x1 + 12}" x2="${x2 - 12}" y1="${y + h / 2}" y2="${y + h / 2}" stroke="${C.nodata}" stroke-width="2" stroke-dasharray="14 12"/>`;

/* ---------- generic effects ----------
   data-in="t" local start time; data-fx = up | wipe | pop | fade | words | reveal; data-out="t" fades out */
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
    if (kind === "reveal") { // circular reveal from the centre, for maps
      const e = easeInOut(prog(lt, a, a + 1.6));
      el.style.clipPath = `circle(${e * 75}% at 50% 50%)`;
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
      el.style.clipPath = `inset(-20px ${(1 - easeOut(k)) * 100}% -20px 0)`;
      el.style.opacity = 1 - out;
    } else if (kind === "pop") {
      el.style.opacity = clamp(k * 2) * (1 - out);
      el.style.transform = `scale(${0.85 + 0.15 * easeBack(k)})`;
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
    return { slug, name: NAMES[slug], net: c.net.median, m2: STOPS.map((k) => c.stops[k].m2.median), rent: STOPS.map((k) => c.stops[k].rent) };
  });
  for (const c of commute.cities) {
    const city = cities.find((x) => x.slug === COMMUTE_NAMES[c.name]);
    city.inCommuters = c.in_commuters;
    city.commuteKm = c.median_km_within_100;
  }
  const top = kreise.features.map((f) => f.properties).sort((a, b) => b.warm_flat - a.warm_flat);
  return {
    cities, by: Object.fromEntries(cities.map((c) => [c.slug, c])),
    avgRent: STOPS.map((_, i) => mean(cities.map((c) => c.rent[i]))),
    // mean of the per-city changes, as in ride.html
    avgDrop: STOPS.map((_, i) => mean(cities.map((c) => c.rent[i] / c.rent[0] - 1))),
    avgNet: mean(cities.map((c) => c.net)),
    avgBudget: mean(cities.map((c) => c.net)) * 0.3,
    avgM2at20: mean(cities.map((c) => c.m2[2])),
    totalIn: cities.reduce((a, c) => a + c.inCommuters, 0),
    munichRent: top[0].warm_flat, districts: top.length,
    gain20: mean(cities.map((c) => c.m2[2] - c.m2[0])),
  };
}

/* ---------- scenes ---------- */
// cue times inside a scene follow the voice-over at ~2.5 words per second

const SCENES = [
  {
    vo: "How quickly do rent prices decrease as you move away from the city center?",
    dur: 6.5, src: "Average warm rent per m² on a new lease, 7 largest cities",
    XS: [290, 465, 640, 815, 975], G: 1040,
    html: () => `<h1 class="h1 abs" style="top:140px" data-in="0.2" data-fx="words">${words(["How quickly do", "rent prices <em>decrease</em>", "as you move away", "from the city center?"])}</h1>`,
    svg() {
      const { XS, G } = this;
      let s = skyline(60, G, 0.9) + `<line x1="40" x2="1040" y1="${G}" y2="${G}" stroke="${C.ground}" stroke-width="2"/>` + road(40, 1040, G + 14);
      XS.forEach((x, i) => {
        const col = i ? C.good : C.fg;
        s += `<g class="s0tag" opacity="0">
          <line x1="${x}" x2="${x}" y1="${G - 8}" y2="${G - 70}" stroke="${col}" stroke-width="2" opacity=".6"/>
          <circle cx="${x}" cy="${G - 74}" r="6" fill="${col}" filter="url(#glow)"/>
          <text x="${x}" y="${G - 96}" text-anchor="middle" ${DISP} font-size="${i ? 44 : 38}" fill="${col}">${i ? `${minus(pct(D.avgDrop[i]))} %` : `${fmt(D.avgRent[0], 1)} €`}</text>
          <text x="${x}" y="${G - 140}" text-anchor="middle" ${MONO} font-size="20" fill="${C.muted}">${i ? `${fmt(D.avgRent[i], 1)} €/m²` : "per m², center"}</text>
        </g>
        <text x="${x}" y="${G + 82}" text-anchor="middle" ${MONO} font-size="20" fill="${C.muted}">${i ? `${STOPS[i]} km` : "center"}</text>`;
      });
      return s + `<g id="s0car" transform="translate(${XS[0]} ${G + 44})">${car()}</g>`;
    },
    render(lt, el) {
      const { XS, G } = this;
      const k = easeInOut(prog(lt, 1.3, 5.6)), x = lerp(XS[0], XS[4], k);
      el.querySelector("#s0car").setAttribute("transform", `translate(${x} ${G + 44})`);
      el.querySelector("#s0car .speed").setAttribute("opacity", k > 0 && k < 1 ? 0.9 : 0);
      el.querySelectorAll(".s0tag").forEach((g, i) => {
        const e = easeOut(i === 0 ? prog(lt, 0.9, 1.3) : clamp((x - XS[i] + 40) / 40));
        g.setAttribute("opacity", e);
        g.setAttribute("transform", `translate(0 ${(1 - e) * 20})`);
      });
    },
  },
  {
    vo: "Nearly 3 million employees work in Germany's seven largest cities but live outside them.",
    dur: 5.5, src: "Pendleratlas 2024 · Federal Employment Agency, employees, June 2023",
    html: () => `
      <div class="abs big" style="top:170px" data-in="0.1" data-fx="fade"><span id="s1n">0.00</span><small>million</small></div>
      <div class="abs h3" style="top:410px" data-in="0.9">employees work in Germany's</div>
      <div class="abs h3" style="top:470px" data-in="1.1">7 largest cities</div>
      <div class="abs h3" style="top:530px" data-in="1.5">but live <em>outside</em> them.</div>`,
    svg() {
      // seven mini cities, commuters streaming in along their roads
      let s = "";
      D.cities.forEach((c, i) => {
        const y = 720 + i * 72;
        s += `<g class="s1row" opacity="0">
          <text x="72" y="${y + 6}" ${BODY} font-size="26" fill="${C.fg}">${c.name}</text>
          ${skyline(250, y + 12, 0.18)}
          <line x1="290" x2="1008" y1="${y + 6}" y2="${y + 6}" stroke="${C.ground}" stroke-width="2"/>`;
        for (let j = 0; j < 9; j++) s += `<circle class="s1dot" data-ph="${(j / 9 + i * 0.13) % 1}" cy="${y + 6}" r="4.5" fill="${SCALE.blue[3]}"/>`;
        s += `</g>`;
      });
      return s;
    },
    render(lt, el) {
      el.querySelector("#s1n").textContent = fmt((D.totalIn / 1e6) * easeOut(prog(lt, 0.1, 1.6)), 2);
      el.querySelectorAll(".s1row").forEach((r, i) => r.setAttribute("opacity", easeOut(prog(lt, 1.6 + i * 0.1, 2.1 + i * 0.1))));
      el.querySelectorAll(".s1dot").forEach((d) => {
        const ph = (+d.dataset.ph + lt * 0.22) % 1;
        d.setAttribute("cx", lerp(1008, 296, ph));
        d.setAttribute("opacity", ph > 0.92 ? (1 - ph) / 0.08 : Math.min(1, ph / 0.1));
      });
    },
  },
  {
    vo: "Munich alone draws 530,000 people from beyond its borders, more than Berlin does.",
    dur: 5.5, src: "In-commuters: employees who work in the city and live outside it (Pendleratlas 2024)",
    html: () => `
      <div class="abs h3" style="top:140px" data-in="0.1">Munich alone draws</div>
      <div class="abs big" style="top:210px;font-size:170px" data-in="0.4" data-fx="pop"><em>${fmt(Math.round(D.by.muenchen.inCommuters / 1000))},000</em></div>
      <div class="abs sub" style="top:390px" data-in="1.0">people from beyond its borders,</div>
      <div class="abs sub" style="top:440px;color:var(--fg)" data-in="3.3">more than Berlin (${fmt(Math.round(D.by.berlin.inCommuters / 1000))},000).</div>`,
    svg() {
      // each city is a road; its car drives as far as its number of in-commuters
      const rows = [...D.cities].sort((a, b) => b.inCommuters - a.inCommuters);
      return rows.map((c, i) => {
        const y = 600 + i * 90, len = (c.inCommuters / 540000) * 600;
        return `<g class="s2row" data-slug="${c.slug}" data-len="${len}" data-y="${y}">
          <text x="72" y="${y + 26}" ${BODY} font-size="30" fill="${C.fg}">${c.name}</text>
          ${road(290, 1008, y, 34)}
          <line class="trail" x1="300" x2="300" y1="${y + 44}" y2="${y + 44}" stroke="${c.slug === "muenchen" ? C.blue : SCALE.blue[2]}" stroke-width="4" stroke-linecap="round"/>
          <g class="car" transform="translate(300 ${y + 30}) scale(.6)">${car("", false)}</g>
          <text class="val" x="0" y="${y + 26}" ${MONO} font-size="24" fill="${C.fg}" opacity="0">${fmt(Math.round(c.inCommuters / 1000))}k</text>
        </g>`;
      }).join("");
    },
    render(lt, el) {
      el.querySelectorAll(".s2row").forEach((r, i) => {
        const y = +r.dataset.y, k = easeInOut(prog(lt, 0.5 + i * 0.1, 2.0 + i * 0.1)), x = 300 + +r.dataset.len * k;
        r.querySelector(".car").setAttribute("transform", `translate(${x} ${y + 30}) scale(.6)`);
        r.querySelector(".trail").setAttribute("x2", x);
        const v = r.querySelector(".val");
        v.setAttribute("x", x + 40);
        v.setAttribute("opacity", prog(lt, 1.8 + i * 0.1, 2.2 + i * 0.1));
        const slug = r.dataset.slug, on = slug === "muenchen" || (slug === "berlin" && lt > 3.3);
        r.setAttribute("opacity", lt > 2.6 && !on ? 0.4 : 1);
      });
    },
  },
  {
    vo: "Since I also work in Frankfurt and live in another city, I wanted to know what the commuters like me actually get for the ride.",
    dur: 10.5, src: "Flat size that 30 % of net pay rents, by municipality around Frankfurt",
    html: () => `
      <h2 class="h2 abs" style="top:130px" data-in="0.2" data-fx="words">${words(["I work in <em>Frankfurt</em>", "and live outside it."])}</h2>
      <div class="abs legend" style="top:300px" data-in="1.2" data-fx="fade"><span><i style="background:${DIVERGING5[0]}"></i>under 60 m²</span><span><i style="background:${DIVERGING5[2]}"></i>around 60 m²</span><span><i style="background:${DIVERGING5[4]}"></i>over 60 m²</span></div>
      <div class="mapimg" id="s3map" style="left:72px;top:350px;width:936px;height:880px" data-in="0.8" data-fx="reveal"><img src="${BASE}story/frankfurt.png" alt=""></div>
      <div class="abs box" style="top:1090px;left:110px;right:110px" data-in="4.6">What do commuters like me actually get for the ride?</div>`,
    // a car leaves the main station (map centre at 540, 790) and drives 26 km east
    svg: () => `<g id="s3car" opacity="0">${car()}</g>`,
    render(lt, el) {
      const z = 1 + 0.07 * prog(lt, 0, 10.5);
      el.querySelector("#s3map img").style.transform = `scale(${z})`;
      const pxkm = 0.936 * MAP_PX_PER_KM * z, k = easeInOut(prog(lt, 2.4, 6.0));
      const c = el.querySelector("#s3car");
      c.setAttribute("transform", `translate(${540 + k * 26 * pxkm} 790)`);
      c.setAttribute("opacity", prog(lt, 2.2, 2.6) * (1 - prog(lt, 6.4, 6.9)));
      c.querySelector(".speed").setAttribute("opacity", k > 0 && k < 1 ? 0.9 : 0);
    },
  },
  {
    vo: "First, how far they travel. Among commuters who live within 100 km of their city, half live closer than about 20 to 26 km from the main station.",
    dur: 11.5, src: "Pendleratlas 2024 · median straight-line distance from home to the main station",
    html: () => `
      <h2 class="h2 abs" style="top:130px" data-in="0.2" data-fx="words">${words(["How far do they travel?"])}</h2>
      <div class="abs sub" style="top:215px" data-in="2.0">Commuters who live within 100 km</div>
      <div class="abs" style="top:290px" data-in="6.6"><span class="num" style="font-size:96px"><em>20–26 km</em></span>
        <div class="sub" style="margin-top:6px;color:var(--fg)">half live closer than this</div></div>`,
    svg() {
      const cx = 540, cy = 900, k = 8.2;
      let s = `<circle id="s4band" cx="${cx}" cy="${cy}" r="${23 * k}" fill="none" stroke="${C.blue}" stroke-width="0" opacity=".38" filter="url(#glow)"/>`;
      [10, 20, 30, 40].forEach((r) => {
        s += `<circle class="s4ring" cx="${cx}" cy="${cy}" r="${r * k}" fill="none" stroke="${C.muted}" stroke-width="1.5" stroke-dasharray="6 6" opacity="0"/>`;
        s += `<text class="s4lab" x="${cx + r * k * 0.707 + 8}" y="${cy - r * k * 0.707 - 8}" ${MONO} font-size="20" fill="${C.muted}" opacity="0">${r} km</text>`;
      });
      // commuters as dots: deterministic sample with a median of ~24 km; they fly in from outside
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 150; i++) {
        const z = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
        const r = Math.min(44, 23.6 * Math.exp(0.5 * z)), a = rnd() * Math.PI * 2;
        s += `<circle class="s4dot" data-r="${r}" data-a="${a}" cx="${cx}" cy="${cy}" r="4" fill="${SCALE.blue[3]}" opacity="0"/>`;
      }
      s += `<circle cx="${cx}" cy="${cy}" r="9" fill="${C.blue}" filter="url(#glow)"/>`;
      s += `<text x="${cx}" y="${cy + 38}" text-anchor="middle" ${MONO} font-size="20" fill="${C.fg}">main station</text>`;
      return s;
    },
    render(lt, el) {
      const cx = 540, cy = 900, k = 8.2;
      el.querySelectorAll(".s4ring").forEach((r, i) => r.setAttribute("opacity", 0.7 * prog(lt, 2.0 + i * 0.25, 2.5 + i * 0.25)));
      el.querySelectorAll(".s4lab").forEach((r, i) => r.setAttribute("opacity", prog(lt, 2.2 + i * 0.25, 2.7 + i * 0.25)));
      el.querySelectorAll(".s4dot").forEach((d, i) => {
        const e = easeOut(prog(lt, 3.0 + (i % 50) * 0.05, 4.0 + (i % 50) * 0.05));
        const r = lerp(60, +d.dataset.r, e) * k, a = +d.dataset.a;
        d.setAttribute("cx", cx + Math.cos(a) * r);
        d.setAttribute("cy", cy + Math.sin(a) * r);
        d.setAttribute("opacity", 0.9 * e);
        d.setAttribute("fill", lt > 7.0 && +d.dataset.r <= 23.6 ? C.blue : SCALE.blue[2]);
      });
      const e = easeOut(prog(lt, 6.6, 7.6)), r1 = 20 * k, r2 = 26 * k;
      const band = el.querySelector("#s4band");
      band.setAttribute("r", (r1 + r2) / 2);
      band.setAttribute("stroke-width", (r2 - r1) * e);
    },
  },
  {
    vo: "Stuttgart and Frankfurt have the shortest typical commutes, at around 20 km. Berlin and Hamburg have the longest, at around 26 km.",
    dur: 9, src: "Ring: half of commuters living within 100 km live inside it · Pendleratlas 2024",
    CELLS: [["stuttgart", 72, 300, "good", 0.6], ["frankfurt", 558, 300, "good", 0.9], ["berlin", 72, 786, "bad", 4.4], ["hamburg", 558, 786, "bad", 4.7]],
    html() {
      return `<h2 class="h2 abs" style="top:130px" data-in="0.2" data-fx="words">${words(["Typical commute"])}</h2>
        <div class="abs sub" style="top:215px" data-in="0.6">shortest <span class="good">≈ 20 km</span> · longest <span class="bad">≈ 26 km</span></div>
        ${this.CELLS.map(([slug, x, y, cls, a]) => `
          <div class="mapimg" style="left:${x}px;top:${y}px;width:450px;height:450px" data-in="${a}" data-fx="reveal"><img src="${BASE}story/${slug}.png" alt="" style="opacity:.45"></div>
          <div class="maplab" style="left:${x + 18}px;top:${y + 18}px" data-in="${a + 0.6}">${D.by[slug].name}<small class="${cls}">${fmt(D.by[slug].commuteKm, 1)} km</small></div>`).join("")}`;
    },
    svg() {
      return this.CELLS.map(([slug, x, y, cls, a]) => `<circle class="s5ring" data-km="${D.by[slug].commuteKm}" data-a="${a + 0.6}"
          cx="${x + 225}" cy="${y + 225}" r="0" fill="${C[cls]}" fill-opacity=".14" stroke="${C[cls]}" stroke-width="4" filter="url(#glow)"/>
          <circle cx="${x + 225}" cy="${y + 225}" r="6" fill="${C.fg}"/>`).join("");
    },
    render(lt, el) {
      el.querySelectorAll(".s5ring").forEach((r) => {
        const e = easeOut(prog(lt, +r.dataset.a, +r.dataset.a + 1.2));
        r.setAttribute("r", +r.dataset.km * MAP_PX_PER_KM * 0.45 * e);
      });
    },
  },
  {
    vo: "Then, what that distance buys. Picture a single person earning the median wage in the city who spends 30 % of their net pay on warm rent for a flat on a new lease.",
    dur: 13.5, src: "Median wage of full-time employees working in the city (BA, 2024) · single, tax class I, 2025 rules",
    html: () => `
      <h2 class="h2 abs" style="top:130px" data-in="0.2" data-fx="words">${words(["What does that", "distance <em>buy</em>?"])}</h2>
      <div class="abs rows" style="top:560px">
        <div class="row" data-in="2.0" data-fx="wipe"><span>A single person<i>tax class I</i></span><b></b></div>
        <div class="row" data-in="3.6" data-fx="wipe"><span>Median wage in the city</span><b>Ø ${fmt(Math.round(D.avgNet))} € net</b></div>
        <div class="row" data-in="6.4" data-fx="wipe"><span>30 % of net pay</span><b style="color:var(--blue)">Ø ${fmt(Math.round(D.avgBudget))} €</b></div>
        <div class="row" data-in="9.2" data-fx="wipe"><span>Warm rent, new lease</span><b>incl. heating</b></div>
      </div>`,
    // the commuter rolls in; the flat appears when the formula is complete
    svg: () => `<line x1="72" x2="1008" y1="500" y2="500" stroke="${C.ground}" stroke-width="2"/>
      <g id="s6car" transform="translate(-120 498) scale(2)">${car()}</g>
      <g id="s6house" transform="translate(880 500) scale(0)">${house(150)}</g>`,
    render(lt, el) {
      const k = easeInOut(prog(lt, 1.6, 3.4));
      el.querySelector("#s6car").setAttribute("transform", `translate(${lerp(-120, 300, k)} 498) scale(2)`);
      el.querySelector("#s6car .speed").setAttribute("opacity", k > 0 && k < 1 ? 0.9 : 0);
      el.querySelector("#s6house").setAttribute("transform", `translate(880 500) scale(${Math.max(0.001, easeBack(prog(lt, 9.4, 10.2)))})`);
    },
  },
  {
    vo: "In the city center, that buys between 40 and 55 m², depending on the city.",
    dur: 6.5, src: "30 % of net pay on warm rent, new lease, within 5 km of the main station",
    html: () => {
      const v = D.cities.map((c) => c.m2[0]);
      return `<div class="abs h3" style="top:140px" data-in="0.2">In the city center:</div>
        <div class="abs" style="top:220px" data-in="0.9" data-fx="pop"><span class="num bad" style="font-size:150px">${Math.min(...v)}–${Math.max(...v)} m²</span></div>`;
    },
    svg() {
      const rows = [...D.cities].sort((a, b) => a.m2[0] - b.m2[0]);
      let s = `<line x1="40" x2="1040" y1="1090" y2="1090" stroke="${C.ground}" stroke-width="2"/>`;
      rows.forEach((c, i) => {
        const x = 110 + i * 143, w = houseW(c.m2[0], 0.9);
        s += `<g opacity=".45">${skyline(x - 33, 1090, 0.42)}</g>`;
        s += `<g class="s7h" data-x="${x}" transform="translate(${x} 1090) scale(0)">${house(w)}</g>`;
        s += `<text class="s7l" x="${x}" y="${1090 - 135}" text-anchor="middle" ${DISP} font-size="36" fill="${m2Color(c.m2[0])}" opacity="0">${c.m2[0]} m²</text>`;
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
      const by = D.by, p = this.phases, o = (i) => (i < 4 ? `data-out="${p[i + 1] - 0.2}"` : "");
      const blk = (i, a, b) => `<div class="abs" style="top:130px" data-in="${p[i] + 0.1}" ${o(i)}><div class="h2">${a}</div><div class="sub">${b}</div></div>`;
      return [
        blk(0, "20 km out,", "the picture splits."),
        blk(1, `Düsseldorf: <span class="good">${by.duesseldorf.m2[2]} m²</span>`, "for the same budget"),
        blk(2, `Stuttgart, Frankfurt, Cologne: <span class="good">≈ 60 m²</span>`, "a comfortable flat for one person"),
        blk(3, `Hamburg, Berlin: <span class="bad">low 50s</span>`, `${by.hamburg.m2[2]} and ${by.berlin.m2[2]} m²`),
        blk(4, `Munich: <span class="bad">${by.muenchen.m2[2]} m²</span>`, "with the highest net pay of the seven"),
      ].join("");
    },
    svg() {
      // the all-cities sheet, centre vs. 20 km: in each row a car drives out and a bigger house appears
      const rows = [...D.cities].sort((a, b) => b.m2[2] - a.m2[2]);
      const grp = { duesseldorf: 1, stuttgart: 2, frankfurt: 2, koeln: 2, hamburg: 3, berlin: 3, muenchen: 4 };
      let s = `<text x="470" y="352" text-anchor="middle" ${MONO} font-size="20" fill="${C.muted}">center</text>
        <text x="880" y="352" text-anchor="middle" ${MONO} font-size="20" fill="${C.muted}">20 km</text>`;
      rows.forEach((c, i) => {
        const g = 470 + i * 112, w0 = houseW(c.m2[0], 0.55), w2 = houseW(c.m2[2], 0.55);
        s += `<g class="s8row" data-g="${grp[c.slug]}" data-g0="${g}">
          <text x="72" y="${g - 12}" ${BODY} font-size="30" fill="${C.fg}">${c.name}</text>
          <g opacity=".55">${skyline(258, g, 0.3)}</g>
          <line x1="250" x2="1008" y1="${g}" y2="${g}" stroke="${C.ground}" stroke-width="2"/>
          <g transform="translate(470 ${g})">${house(w0)}</g>
          <text x="${470 + w0 / 2 + 10}" y="${g - 6}" ${DISP} font-size="26" fill="${m2Color(c.m2[0])}">${c.m2[0]}</text>
          <line class="trail" x1="520" x2="520" y1="${g + 10}" y2="${g + 10}" stroke="${C.blue}" stroke-width="3" stroke-linecap="round"/>
          <g class="car" transform="translate(520 ${g + 4}) scale(.45)">${car("", false)}</g>
          <g class="h20" transform="translate(880 ${g}) scale(0)">${house(w2)}</g>
          <text class="v20" x="${880 + w2 / 2 + 10}" y="${g - 6}" ${DISP} font-size="34" fill="${m2Color(c.m2[2])}" opacity="0">${c.m2[2]} m²</text>
        </g>`;
      });
      return s;
    },
    render(lt, el) {
      const p = this.phases, phase = p.filter((a) => lt >= a).length - 1;
      el.querySelectorAll(".s8row").forEach((r, i) => {
        const g = +r.dataset.g0, a = 0.3 + i * 0.22;
        const k = easeInOut(prog(lt, a, a + 1.1)), x = lerp(520, 820, k);
        const c = r.querySelector(".car");
        c.setAttribute("transform", `translate(${x} ${g + 4}) scale(.45)`);
        c.setAttribute("opacity", 1 - prog(lt, a + 1.1, a + 1.4));
        r.querySelector(".trail").setAttribute("x2", x);
        r.querySelector(".h20").setAttribute("transform", `translate(880 ${g}) scale(${Math.max(0.001, easeBack(prog(lt, a + 1.0, a + 1.6)))})`);
        r.querySelector(".v20").setAttribute("opacity", prog(lt, a + 1.3, a + 1.7));
        r.setAttribute("opacity", phase === 0 || +r.dataset.g === phase ? 1 : 0.25);
      });
    },
  },
  {
    vo: "This is yet another proof of Munich being the most expensive city in Germany.",
    dur: 6.5, src: "Warm rent of a 60 m² flat on a new lease, by district · brighter = more expensive",
    W: Math.round(900 * 1350 / 1650),
    html() {
      return `<h2 class="h2 abs" style="top:130px" data-in="0.2" data-fx="words">${words(["Munich: the most", "expensive rents"])}</h2>
      <div class="mapimg" style="left:310px;top:330px;width:${this.W}px;height:900px" data-in="0.5" data-fx="reveal"><img src="${BASE}story/germany_rent.png" alt=""></div>
      <div class="abs box" style="top:1010px;left:72px;right:auto;width:470px" data-in="2.2">
        <span class="num" style="font-size:64px;color:var(--fg)">${fmt(D.munichRent)} €</span>
        <div style="font:400 26px/1.35 var(--body);color:var(--muted);margin-top:6px">a month for 60 m², warm.<br>#1 of ${D.districts} districts</div>
      </div>`;
    },
    svg() {
      // Munich in the map image at (0.604, 0.878), from the map's fitted bounds
      const x = 310 + 0.604 * this.W, y = 330 + 0.878 * 900;
      return `<circle id="s9ring" cx="${x}" cy="${y}" r="30" fill="none" stroke="${C.fg}" stroke-width="3" opacity="0"/>
        <circle id="s9wave" cx="${x}" cy="${y}" r="30" fill="none" stroke="${C.fg}" stroke-width="2" opacity="0"/>
        <path id="s9lead" d="M${x - 30} ${y} L 542 1060" stroke="${C.fg}" stroke-width="2" opacity="0"/>`;
    },
    render(lt, el) {
      const k = prog(lt, 1.6, 2.2), w = (lt * 0.8) % 1;
      el.querySelector("#s9ring").setAttribute("opacity", k);
      const wave = el.querySelector("#s9wave");
      wave.setAttribute("r", 30 + w * 70);
      wave.setAttribute("opacity", k * (1 - w));
      el.querySelector("#s9lead").setAttribute("opacity", 0.7 * prog(lt, 2.2, 2.6));
    },
  },
  {
    vo: "At the same time, I was a bit surprised how fast the prices drop for Cologne and Düsseldorf. Due to high level of urbanization in Rhine-Ruhr region I expected the prices to be flatter compared to other big cities. Probably this level of development distributes housing demand.",
    dur: 19, src: "Warm rent per m² on a new lease: center vs. 20 km (±5 km)",
    // other big cities around Düsseldorf: label positions in the map image (0–1)
    TOWNS: [[673, 332], [1006, 342], [515, 516], [1175, 711], [308, 849], [949, 1236], [1065, 128], [1250, 284]].map(([x, y]) => [x / 1500, y / 1502]),
    html: () => `
      <div class="abs" style="top:130px" data-in="0.2" data-out="7.0"><div class="h2">How fast do rents fall?</div><div class="sub">rent per m², center → 20 km</div></div>
      <div class="abs" style="top:130px" data-in="7.4"><div class="h2">Rhine-Ruhr: a region</div><div class="h2">of <em>big cities</em></div></div>
      <div class="mapimg" id="s10map" style="left:72px;top:330px;width:936px;height:900px" data-in="7.3" data-fx="reveal"><img src="${BASE}story/duesseldorf.png" alt=""></div>
      <div class="abs box" style="top:1080px;left:110px;right:110px" data-in="15.4">Demand spreads across many cities.</div>`,
    svg() {
      // rent drops as roads: each car drives as far as rents fall
      const rows = D.cities.map((c) => ({ ...c, drop: c.rent[2] / c.rent[0] - 1 })).sort((a, b) => a.drop - b.drop);
      let s = `<g id="s10chart">` + rows.map((c, i) => {
        const y = 380 + i * 100, len = (-c.drop / 0.3) * 560;
        return `<g class="s10row" data-hi="${["duesseldorf", "koeln"].includes(c.slug) ? 1 : 0}" data-len="${len}" data-y="${y}">
          <text x="72" y="${y + 26}" ${BODY} font-size="30" fill="${C.fg}">${c.name}</text>
          ${road(300, 1008, y, 34)}
          <line class="trail" x1="310" x2="310" y1="${y + 44}" y2="${y + 44}" stroke="${SCALE.blue[3]}" stroke-width="4" stroke-linecap="round"/>
          <g class="car" transform="translate(310 ${y + 30}) scale(.6)">${car("", false)}</g>
          <text class="val" x="0" y="${y + 28}" ${MONO} font-size="28" fill="${C.fg}" opacity="0">${minus(pct(c.drop))} %</text>
        </g>`;
      }).join("") + `</g>`;
      s += this.TOWNS.map(() => `<circle class="s10town" r="0" fill="none" stroke="${C.fg}" stroke-width="3" opacity="0"/>`).join("");
      return s;
    },
    render(lt, el) {
      el.querySelector("#s10chart").setAttribute("opacity", 1 - easeInOut(prog(lt, 7.0, 7.6)));
      el.querySelectorAll(".s10row").forEach((r, i) => {
        const y = +r.dataset.y, k = easeInOut(prog(lt, 0.5 + i * 0.12, 2.0 + i * 0.12)), x = 310 + +r.dataset.len * k;
        r.querySelector(".car").setAttribute("transform", `translate(${x} ${y + 30}) scale(.6)`);
        const trail = r.querySelector(".trail"), hi = r.dataset.hi === "1" && lt >= 2.8;
        trail.setAttribute("x2", x);
        trail.setAttribute("stroke", hi ? C.blue : SCALE.blue[3]);
        trail.setAttribute("filter", hi ? "url(#glow)" : "");
        const v = r.querySelector(".val");
        v.setAttribute("x", x + 40);
        v.setAttribute("opacity", prog(lt, 1.8 + i * 0.12, 2.2 + i * 0.12));
        r.setAttribute("opacity", lt < 2.8 || r.dataset.hi === "1" ? 1 : 0.3);
      });
      // map: 936 × 900 box, image covers it at 936 × 937.5 around the centre (540, 780), zooming slowly
      const z = 1 + 0.05 * prog(lt, 7.3, 19);
      el.querySelector("#s10map img").style.transform = `scale(${z})`;
      el.querySelectorAll(".s10town").forEach((c, i) => {
        const [u, v] = this.TOWNS[i], a = 9.0 + i * 0.35, w = prog(lt, a, a + 1.2);
        c.setAttribute("cx", 540 + (u - 0.5) * 936 * z);
        c.setAttribute("cy", 780 + (v - 0.5) * 937.5 * z);
        c.setAttribute("r", 18 + 40 * easeOut(w));
        c.setAttribute("opacity", lt > a ? 0.9 * (1 - w) : 0);
      });
    },
  },
  {
    vo: "",
    dur: 5.5, src: "",
    html: () => `
      <div class="abs h3" style="top:140px;color:var(--muted)" data-in="0.1">Same budget, 20 km out:</div>
      <div class="abs" style="top:220px" data-in="0.4" data-fx="pop"><span class="num good" style="font-size:150px">+${fmt(Math.round(D.gain20))} m²</span></div>
      <div class="abs sub" style="top:400px;color:var(--fg)" data-in="0.8">on average across the 7 largest cities</div>
      <div class="abs src-list" style="top:520px" data-in="1.2">
        <div>Commuters: Pendleratlas 2024 · Federal Employment Agency, June 2023</div>
        <div>Wages: Federal Employment Agency, full-time employees, Dec 2024 · net pay: single, tax class I, 2025 rules</div>
        <div>Warm rent: BBSR asking rents 2025 · Mikrozensus 2022 · Zensus 2022</div>
        <div>Distances: straight line from the main station, ±5 km. Travel time and ticket costs are not included.</div>
      </div>`,
    svg: () => `${skyline(60, 1180, 0.6)}<line x1="40" x2="1040" y1="1180" y2="1180" stroke="${C.ground}" stroke-width="2"/>${road(40, 1040, 1194)}
      <g id="s11h" transform="translate(900 1180) scale(0)">${house(houseW(D.avgM2at20))}</g>
      <g id="s11car" transform="translate(220 1224)">${car()}</g>`,
    render(lt, el) {
      const k = easeInOut(prog(lt, 0.6, 2.6));
      el.querySelector("#s11car").setAttribute("transform", `translate(${lerp(220, 760, k)} 1224)`);
      el.querySelector("#s11car .speed").setAttribute("opacity", k > 0 && k < 1 ? 0.9 : 0);
      el.querySelector("#s11h").setAttribute("transform", `translate(900 1180) scale(${Math.max(0.001, easeBack(prog(lt, 2.4, 3.1)))})`);
    },
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
      ${s.svg ? `<svg class="chart" viewBox="0 0 1080 1350"><defs>${GLOW}</defs>${s.svg.call(s)}</svg>` : ""}
    </section>`).join("");
  sceneEls = [...document.querySelectorAll(".sc")];
  // journey strip: the whole video is one ride from the centre to 40 km
  $("journey").innerHTML = `<defs>${GLOW}</defs>
    <line x1="72" x2="1008" y1="104" y2="104" stroke="${C.line}" stroke-width="2"/>
    <line id="jtrail" x1="72" x2="72" y1="104" y2="104" stroke="${C.blue}" stroke-width="2.5"/>
    ${[0, 10, 20, 30, 40].map((km) => `<circle cx="${72 + (km / 40) * 936}" cy="104" r="3.5" fill="${C.muted}"/>`).join("")}
    <g id="jcar" transform="translate(72 103) scale(.42)">${car("", false)}</g>`;
}

function render(t) {
  const x = 72 + (t / TOTAL) * 936;
  $("jtrail").setAttribute("x2", x);
  $("jcar").setAttribute("transform", `translate(${x} 103) scale(.42)`);
  let cur = 0;
  SCENES.forEach((s, i) => {
    const el = sceneEls[i], lt = t - starts[i];
    const vis = lt > -0.4 && lt < s.dur + 0.4;
    el.style.display = vis ? "" : "none";
    if (!vis) return;
    if (lt >= 0 && lt < s.dur) cur = i;
    const kin = i === 0 ? 1 : easeOut(prog(lt, -0.3, 0.25));
    const kout = i === SCENES.length - 1 ? 0 : easeInOut(prog(lt, s.dur - 0.3, s.dur + 0.2));
    el.style.opacity = kin * (1 - kout);
    fx(el, lt);
    if (s.render) s.render.call(s, lt, el);
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
