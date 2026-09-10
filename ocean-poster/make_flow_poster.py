#!/usr/bin/env python3
"""Poster of the world ocean's surface circulation, one per season.

The map is an ocean-centred projection: Adams "world in a square II" on a
rotated globe, oriented so the map's cut falls almost entirely on land, which
leaves the world ocean as a single uninterrupted body (the idea behind
Spilhaus's ocean map).  Where the cut does run through water the drawing is
faded into the paper rather than sliced off square.

Currents carry the image — the whole ocean is drawn as flow lines — and sea
surface temperature sits underneath as a wash.  Each season has its own paper,
ink and temperature ramp; see ``palettes.py``.

    python make_flow_poster.py --season winter
    python make_flow_poster.py --all
"""

import argparse
import os
import sys

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.colors import Normalize
from matplotlib.patches import FancyArrow
import matplotlib.patheffects as pe

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import palettes
from palettes import SEASONS, VMIN, VMAX, cmap_for, apply_overrides
from currents import CURRENTS, LABEL_AT
from flowfield import build_field, spline, streamlines, Field
from make_poster import fetch_sst, load_sst
import oceanmap


ROT = np.array([[1, 1], [-1, 1]]) / np.sqrt(2)     # 45 deg: diamond -> square


class Rot:
    """Wraps a pyproj transformer with the 45 degree turn."""

    def __init__(self, t, inverse=False):
        self.t, self.inverse = t, inverse

    def transform(self, a, b):
        if self.inverse:
            a, b = np.asarray(a), np.asarray(b)
            x = a * ROT[0, 0] + b * ROT[1, 0]
            y = a * ROT[0, 1] + b * ROT[1, 1]
            return self.t.transform(x, y)
        x, y = self.t.transform(a, b)
        x, y = np.asarray(x), np.asarray(y)
        return x * ROT[0, 0] + y * ROT[0, 1], x * ROT[1, 0] + y * ROT[1, 1]


def sample_sst(lon, lat, sst_lon, sst_lat, sst):
    """Nearest-neighbour lookup of the SST grid, periodic in longitude."""
    step_lon = sst_lon[1] - sst_lon[0]
    step_lat = sst_lat[1] - sst_lat[0]
    ix = np.round(((lon - sst_lon[0]) % 360) / step_lon).astype(int) % sst_lon.size
    iy = np.clip(np.round((lat - sst_lat[0]) / step_lat), 0,
                 sst_lat.size - 1).astype(int)
    return sst[iy, ix]


def edge_fade(x, y, half, width):
    """1 well inside the map, easing to 0 at the cut.

    Where the cut runs through land nothing is drawn anyway; where it runs
    through water this dissolves the straight edge into the paper instead of
    slicing the ocean off with a ruler.
    """
    if width <= 0:
        return np.ones_like(x)
    d = np.minimum(half - np.abs(x), half - np.abs(y)) / (half * width)
    t = np.clip(d, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def background(lon, lat, inside, is_land, sst_lon, sst_lat, sst, cmap, wash,
               fade, paper):
    """RGBA image: the temperature wash in the water, transparent elsewhere."""
    val = sample_sst(lon, lat, sst_lon, sst_lat, np.ma.filled(sst, np.nan))
    rgba = cmap(Normalize(VMIN, VMAX)(val))
    base = np.array(matplotlib.colors.to_rgb(paper))
    rgba[..., :3] = wash * rgba[..., :3] + (1 - wash) * base
    rgba[..., 3] = np.where(inside & ~is_land & np.isfinite(val), 1.0, 0.0) * fade
    return rgba


def flat_overlay(mask, colour):
    rgba = np.zeros(mask.shape + (4,))
    rgba[..., :3] = matplotlib.colors.to_rgb(colour)
    rgba[..., 3] = mask.astype(float)
    return rgba


def draw_flow(ax, fwd, pts, stg, half, fade_width, ink):
    """The flow-line texture: one collection, weighted by flow strength."""
    x, y = fwd.transform(pts[..., 0].ravel(), pts[..., 1].ravel())
    x = np.asarray(x).reshape(pts.shape[:2])
    y = np.asarray(y).reshape(pts.shape[:2])

    p0 = np.stack([x[:, :-1], y[:, :-1]], axis=-1)
    p1 = np.stack([x[:, 1:], y[:, 1:]], axis=-1)
    segs = np.stack([p0, p1], axis=2).reshape(-1, 2, 2)
    s = np.fmin(stg[:, :-1], stg[:, 1:]).ravel()

    good = np.isfinite(segs).all(axis=(1, 2)) & np.isfinite(s)
    good &= np.hypot(*(segs[:, 1] - segs[:, 0]).T) < half * 0.05
    segs, s = segs[good], s[good]

    w = np.clip(s, 0, 1) ** 0.6
    mid = segs.mean(axis=1)
    colours = np.zeros((len(segs), 4))
    colours[:, :3] = matplotlib.colors.to_rgb(ink)
    colours[:, 3] = (0.085 + 0.46 * w) * edge_fade(mid[:, 0], mid[:, 1],
                                                   half, fade_width)
    lc = LineCollection(segs, colors=colours, linewidths=0.15 + 0.95 * w,
                        capstyle="round", zorder=3)
    lc.set_rasterized(True)
    ax.add_collection(lc)


def draw_current(ax, pieces, kind, strength, half, fade_width, th):
    colour = th["warm"] if kind == "warm" else th["cold"]
    lw = 1.9 + 5.4 * strength
    rgb = matplotlib.colors.to_rgb(colour)
    for p in pieces:
        segs = np.stack([p[:-1], p[1:]], axis=1)
        mid = segs.mean(axis=1)
        col = np.zeros((len(segs), 4))
        col[:, :3] = rgb
        col[:, 3] = 0.95 * edge_fade(mid[:, 0], mid[:, 1], half, fade_width)
        ax.add_collection(LineCollection(segs, colors=col, linewidths=lw,
                                         capstyle="round", joinstyle="round",
                                         zorder=6))

    longest = max(pieces, key=len)
    n_heads = 1 if strength < 0.4 else (2 if strength < 0.7 else 3)
    for frac in np.linspace(0.28, 0.85, n_heads):
        i = int(np.clip(frac * (len(longest) - 6), 0, len(longest) - 6))
        d = longest[i + 5] - longest[i]
        norm = np.hypot(*d) or 1.0
        L = (0.010 + 0.017 * strength) * half
        if edge_fade(longest[i, 0], longest[i, 1], half, fade_width) < 0.8:
            continue
        ax.add_patch(FancyArrow(
            longest[i, 0], longest[i, 1], *(d / norm * L * 0.2), width=1.0,
            head_width=L * 0.66, head_length=L * 0.9, color=colour, alpha=0.95,
            linewidth=0, zorder=7))


def draw_label(ax, pieces, text, frac, fontsize, th, offset=6.0):
    p = max(pieces, key=len)
    if len(p) < 12:
        return
    i = int(np.clip(frac * (len(p) - 1), 4, len(p) - 5))
    dx, dy = p[i + 4] - p[i - 4]
    norm = np.hypot(dx, dy)
    if norm == 0:
        return
    angle = np.degrees(np.arctan2(dy, dx))
    nx, ny = -dy / norm, dx / norm
    if angle > 90:
        angle, nx, ny = angle - 180, -nx, -ny
    elif angle < -90:
        angle, nx, ny = angle + 180, -nx, -ny
    ax.annotate(text, xy=tuple(p[i]), xytext=(nx * offset, ny * offset),
                textcoords="offset points", ha="center", va="center",
                rotation=angle, rotation_mode="anchor", fontsize=fontsize,
                color=th["ink"], fontfamily="DejaVu Sans", zorder=10,
                path_effects=[pe.withStroke(linewidth=2.0,
                                            foreground=th["paper"], alpha=0.9)])


def add_legend(fig, cmap, th, wash):
    ink, paper = th["ink"], th["paper"]
    key = fig.add_axes([0.14, 0.072, 0.72, 0.030])
    key.set_axis_off()
    key.set_xlim(0, 1)
    key.set_ylim(0, 1)
    for x0, colour, label in ((0.02, th["warm"], "warm current"),
                              (0.30, th["cold"], "cold current")):
        key.plot([x0, x0 + 0.055], [0.5, 0.5], color=colour, lw=4.0,
                 solid_capstyle="round")
        key.annotate("", xy=(x0 + 0.085, 0.5), xytext=(x0 + 0.055, 0.5),
                     arrowprops=dict(arrowstyle="-|>", color=colour, lw=0))
        key.text(x0 + 0.105, 0.5, label, va="center", fontsize=8.5, color=ink)
    for i, a in enumerate((0.18, 0.42, 0.72)):
        key.plot([0.60 + i * 0.035, 0.60 + i * 0.035 + 0.028], [0.5, 0.5],
                 color=ink, alpha=a, lw=0.4 + i * 0.5, solid_capstyle="round")
    key.text(0.72, 0.5, "surface flow, weaker → stronger", va="center",
             fontsize=8.5, color=ink)

    cax = fig.add_axes([0.36, 0.030, 0.28, 0.013])
    grad = cmap(np.linspace(0, 1, 512))[None, :, :3]
    base = np.array(matplotlib.colors.to_rgb(paper))
    cax.imshow(wash * grad + (1 - wash) * base, aspect="auto",
               extent=[VMIN, VMAX, 0, 1])
    cax.set_yticks([])
    cax.set_xticks([-2, 10, 20, 30])
    cax.set_xticklabels(["−2°", "10°", "20°", "30 °C"])
    cax.tick_params(length=0, pad=4, labelsize=7.5, colors=ink)
    for sp in cax.spines.values():
        sp.set_edgecolor(ink)
        sp.set_linewidth(0.4)
    cax.set_title("sea surface temperature", fontsize=7.5, color=ink, pad=5)


def render(season, args):
    th = SEASONS[season]
    cmap = cmap_for(season)
    ink, paper = th["ink"], th["paper"]

    print(f"[{season}] land bitmap …")
    land = oceanmap.Land(oceanmap.land_bitmap())

    currents, changed = apply_overrides(CURRENTS, season)
    print(f"[{season}] flow field …" +
          (f" (reversed: {', '.join(changed)})" if changed else ""))
    field = Field(*build_field(currents, land))

    _, fwd_raw, inv_raw = oceanmap.crs(args.proj)
    fwd, inv = Rot(fwd_raw), Rot(inv_raw, inverse=True)
    half = oceanmap.map_extent(fwd_raw) / np.sqrt(2)

    print(f"[{season}] raster …")
    n = args.raster
    lon, lat, inside = oceanmap.inverse_grid(inv, fwd, half, n)
    is_land = land(lon, lat) & inside

    sst_lon, sst_lat, sst, span, n_months = load_sst(
        fetch_sst(args.cache), th["months"] or "annual")

    print(f"[{season}] streamlines …")
    rng = np.random.default_rng(args.seed)
    sx = rng.uniform(-half, half, args.seeds * 3)
    sy = rng.uniform(-half, half, args.seeds * 3)
    slon, slat = inv.transform(sx, sy)
    ok = np.isfinite(slon) & np.isfinite(slat)
    slon = np.where(ok, np.nan_to_num(slon), 0.0)
    slat = np.where(ok, np.clip(np.nan_to_num(slat), -90, 90), 0.0)
    ok &= ~land(slon, slat)
    seeds = np.column_stack([slon[ok], slat[ok]])[:args.seeds]
    pts, stg = streamlines(field, seeds, steps=args.steps)
    print(f"[{season}]   {len(pts)} lines from {len(seeds)} seeds")

    fig = plt.figure(figsize=(13.0, 16.0), facecolor=paper)
    ax = fig.add_axes([0.035, 0.115, 0.93, 0.745])
    lim = half * (1.0 + args.margin)
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.set_aspect("equal")
    ax.axis("off")

    ext = [-half, half, -half, half]
    g = np.linspace(-half, half, n)
    gx, gy = np.meshgrid(g, g)
    fade = edge_fade(gx, gy, half, args.fade)
    ax.imshow(background(lon, lat, inside, is_land, sst_lon, sst_lat, sst,
                         cmap, args.wash, fade, paper),
              extent=ext, origin="lower", interpolation="bilinear", zorder=2)

    draw_flow(ax, fwd, pts, stg, half, args.fade, ink)

    paths = [spline(p, 700) for _, _, _, p in currents]
    pieces = oceanmap.project_paths(fwd, paths, half * 0.25)
    for (name, kind, strength, _), pc in zip(currents, pieces):
        if pc:
            draw_current(ax, pc, kind, strength, half, args.fade, th)

    ax.imshow(flat_overlay(is_land & inside, paper), extent=ext,
              origin="lower", interpolation="nearest", zorder=8)
    coast = np.where(fade > 0.35, is_land.astype(float), np.nan)
    ax.contour(g, g, coast, levels=[0.5], colors=ink, linewidths=0.45, zorder=9)

    for i, frac in LABEL_AT.items():
        if pieces[i]:
            draw_label(ax, pieces[i], currents[i][0].upper(), frac,
                       args.label_size, th)

    fig.text(0.5, 0.950, args.title, ha="center", va="center", fontsize=46,
             fontweight="bold", color=ink, fontfamily="DejaVu Sans")
    fig.text(0.5, 0.917, f"{th['label']}  ·  {th['span']}", ha="center",
             va="center", fontsize=13, color=ink, alpha=0.85,
             fontfamily="DejaVu Sans")
    fig.text(0.5, 0.893, "SURFACE CIRCULATION OF THE WORLD OCEAN",
             ha="center", va="center", fontsize=9.5, color=ink, alpha=0.55,
             fontfamily="DejaVu Sans")

    add_legend(fig, cmap, th, args.wash)
    note = f"   {th['note']}." if th["note"] else ""
    reversed_note = (f"   {', '.join(changed)} drawn reversed for the "
                     "northeast monsoon." if changed else "")
    fig.text(0.5, 0.012,
             "Flow lines are traced through a field interpolated from the drawn "
             "current paths — a picture of the circulation, not measured velocity."
             + reversed_note +
             f"   Temperature: NOAA ERSST v5, {span}, {n_months} monthly fields."
             + note + "   Coastlines: Natural Earth 1:50m.",
             ha="center", fontsize=6.6, color=ink, alpha=0.6)

    out = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   f"ocean_flow_{season}.png")
    fig.savefig(out, dpi=args.dpi, facecolor=paper)
    if out.lower().endswith(".png"):
        fig.savefig(out[:-4] + ".pdf", facecolor=paper, dpi=args.dpi)
    plt.close(fig)
    print(f"[{season}] wrote {out}")
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", choices=sorted(SEASONS), default="annual")
    ap.add_argument("--all", action="store_true",
                    help="render winter, spring, summer and autumn")
    ap.add_argument("--out", default=None)
    ap.add_argument("--cache", default=os.path.join(here, "ersstv5.nc"))
    ap.add_argument("--seeds", type=int, default=13000)
    ap.add_argument("--steps", type=int, default=230)
    ap.add_argument("--raster", type=int, default=2600)
    ap.add_argument("--fade", type=float, default=0.075)
    ap.add_argument("--margin", type=float, default=0.045)
    ap.add_argument("--wash", type=float, default=0.33)
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--label-size", type=float, default=7.0)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--proj", default=None,
                    help="override the projection with a proj4 string")
    ap.add_argument("--title", default="OCEAN CURRENTS")
    args = ap.parse_args()

    if args.all:
        if args.out:
            raise SystemExit("--out cannot be combined with --all")
        for season in ("winter", "spring", "summer", "autumn"):
            render(season, args)
    else:
        render(args.season, args)


if __name__ == "__main__":
    main()
