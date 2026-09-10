#!/usr/bin/env python3
"""Render a poster of sea-surface temperature and the major ocean currents.

Temperature is an annual-mean (or single-month) climatology computed from
NOAA ERSST v5, the 2-degree monthly SST analysis.  Coastlines come from
Natural Earth.  Current paths are the schematic centrelines in ``currents.py``;
their names are placed and rotated automatically from the projected geometry,
so the same code works in any projection.

    python make_poster.py --projection polar
    python make_poster.py --projection robinson --month 1
"""

import argparse
import os
import sys
import urllib.request

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, Normalize
from matplotlib.collections import LineCollection
from matplotlib.patches import FancyArrow
import matplotlib.patheffects as pe
import matplotlib.path as mpath
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from netCDF4 import Dataset, num2date
from scipy import ndimage
from scipy.interpolate import splprep, splev

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from currents import CURRENTS, LABEL_AT

SST_URL = "https://raw.githubusercontent.com/pydata/xarray-data/master/ersstv5.nc"

PAPER = "#F2EFE9"
LAND = "#EDE8DE"
ICE = "#D5DCDE"          # ocean with no SST analysis (permanent ice cover)
INK = "#16181B"
WARM_INK = "#7C2417"
COLD_INK = "#1E3A5F"

# temperature ramp: deep cold blue -> paper cream -> deep warm red
TEMP_STOPS = [
    (-2.0, "#22344F"),
    (2.0, "#3C5A78"),
    (7.0, "#6B8CA0"),
    (12.0, "#9DB5B9"),
    (16.0, "#C6C8B7"),
    (19.0, "#DFCDA9"),
    (22.0, "#DFB183"),
    (25.0, "#D08A5C"),
    (27.5, "#B75F3B"),
    (30.0, "#8E3320"),
]
VMIN, VMAX = -2.0, 30.0

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def temperature_cmap():
    pos = [(t - VMIN) / (VMAX - VMIN) for t, _ in TEMP_STOPS]
    return LinearSegmentedColormap.from_list(
        "sst", list(zip(pos, [c for _, c in TEMP_STOPS])), N=512)


def fetch_sst(cache):
    if not os.path.exists(cache):
        print(f"downloading {SST_URL}")
        urllib.request.urlretrieve(SST_URL, cache)
    return cache


def load_sst(path, month, y0=1991, y1=2020):
    """Return lon, lat, sst averaged over `month` ('annual' or 1-12)."""
    ds = Dataset(path)
    lat = np.asarray(ds.variables["lat"][:])
    lon = np.asarray(ds.variables["lon"][:])
    tvar = ds.variables["time"]
    times = num2date(tvar[:], tvar.units, only_use_cftime_datetimes=False,
                     only_use_python_datetimes=True)
    years = np.array([t.year for t in times])
    months = np.array([t.month for t in times])

    sel = (years >= y0) & (years <= y1)
    if month != "annual":
        sel &= months == int(month)
    if not sel.any():
        raise SystemExit(f"no ERSST months match {y0}-{y1} / {month}")

    field = np.ma.mean(ds.variables["sst"][sel], axis=0)
    ds.close()

    # repeat the outermost rows out to +/-90 so a polar projection has no hole
    field = np.ma.concatenate([field[:1], field, field[-1:]], axis=0)
    lat = np.concatenate([[2 * lat[0] - lat[1]], lat, [2 * lat[-1] - lat[-2]]])
    return lon, lat, field, f"{y0}-{y1}", int(sel.sum())


def smooth(lon, lat, field, factor=6, sigma=1.2):
    """Upsample the 2-degree grid so the field reads as a continuous fluid."""
    data = np.ma.filled(field.astype(float), np.nan)
    mask = np.isnan(data)

    # wrap in longitude so the 0/360 seam stays continuous
    pad = 8
    data = np.concatenate([data[:, -pad:], data, data[:, :pad]], axis=1)
    mask_p = np.concatenate([mask[:, -pad:], mask, mask[:, :pad]], axis=1)

    # flood land with the nearest ocean value, blur, then re-cut the coastline
    idx = ndimage.distance_transform_edt(mask_p, return_distances=False,
                                         return_indices=True)
    filled = ndimage.gaussian_filter(data[tuple(idx)], sigma=sigma, mode="nearest")

    big = ndimage.zoom(filled, factor, order=3, mode="nearest")
    big_mask = ndimage.zoom(mask_p.astype(float), factor, order=1,
                            mode="nearest") > 0.5

    dlon, dlat = lon[1] - lon[0], lat[1] - lat[0]
    lon_p = np.concatenate([lon[-pad:] - 360.0, lon, lon[:pad] + 360.0])
    lon_b = np.linspace(lon_p[0], lon_p[-1] + dlon, big.shape[1],
                        endpoint=False) + dlon / (2 * factor)
    lat_b = np.linspace(lat[0], lat[-1] + dlat, big.shape[0],
                        endpoint=False) + dlat / (2 * factor)
    return lon_b, lat_b, np.ma.array(big, mask=big_mask)


def spline(points, n=400):
    p = np.asarray(points, dtype=float)
    tck, _ = splprep([p[:, 0], p[:, 1]], s=0, k=min(3, len(p) - 1))
    x, y = splev(np.linspace(0, 1, n), tck)
    return np.column_stack([x, y])


def project(ax, xy):
    """lon/lat -> projection coordinates, with unplottable points dropped."""
    pts = ax.projection.transform_points(ccrs.PlateCarree(), xy[:, 0], xy[:, 1])
    return pts[:, :2]


def draw_current(ax, xy, kind, strength, scale):
    """Draw one current as a tapered ribbon with arrow heads along it."""
    colour = WARM_INK if kind == "warm" else COLD_INK
    base = (0.9 + 3.4 * strength) * scale

    t = np.linspace(0, 1, len(xy) - 1)
    width = base * (0.30 + 0.70 * np.sin(np.pi * t) ** 0.45)

    segs = np.stack([xy[:-1], xy[1:]], axis=1)
    ax.add_collection(LineCollection(
        segs, linewidths=width, colors=colour, alpha=0.92, capstyle="round",
        joinstyle="round", zorder=6, transform=ccrs.PlateCarree()))

    n_heads = 1 if strength < 0.4 else (2 if strength < 0.7 else 3)
    for frac in np.linspace(0.30, 0.86, n_heads):
        i = int(frac * (len(xy) - 6))
        dx, dy = xy[i + 4] - xy[i]
        norm = np.hypot(dx, dy) or 1.0
        L = (2.2 + 4.2 * strength) * scale
        ax.add_patch(FancyArrow(
            xy[i, 0], xy[i, 1], dx / norm * L * 0.15, dy / norm * L * 0.15,
            width=0.001, head_width=L * 0.62, head_length=L * 0.85,
            length_includes_head=False, color=colour, alpha=0.95, linewidth=0,
            zorder=7, transform=ccrs.PlateCarree()))


def draw_label(ax, xy, text, frac, fontsize, offset=5.0):
    """Place a name along the projected path, upright and clear of the line."""
    pxy = project(ax, xy)
    good = np.isfinite(pxy).all(axis=1)
    if good.sum() < 12:
        return
    pxy, xy = pxy[good], xy[good]

    i = int(np.clip(frac * (len(pxy) - 1), 4, len(pxy) - 5))
    dx, dy = pxy[i + 4] - pxy[i - 4]
    norm = np.hypot(dx, dy)
    if norm == 0:
        return

    angle = np.degrees(np.arctan2(dy, dx))
    nx, ny = -dy / norm, dx / norm          # left-hand normal, in screen space
    if angle > 90:
        angle, nx, ny = angle - 180, -nx, -ny
    elif angle < -90:
        angle, nx, ny = angle + 180, -nx, -ny

    ax.annotate(text, xy=tuple(xy[i]), xycoords=ccrs.PlateCarree()._as_mpl_transform(ax),
                xytext=(nx * offset, ny * offset), textcoords="offset points",
                ha="center", va="center", rotation=angle, rotation_mode="anchor",
                fontsize=fontsize, color=INK, fontfamily="DejaVu Sans",
                path_effects=[pe.withStroke(linewidth=1.8, foreground=PAPER,
                                            alpha=0.85)],
                zorder=10, annotation_clip=True)


def add_legend(fig, cmap, box, period):
    """Temperature ramp plus the warm/cold key, laid out along the bottom."""
    x, y, w = box
    cax = fig.add_axes([x, y + 0.052, w, 0.016])
    cax.imshow(np.linspace(0, 1, 512)[None, :], aspect="auto", cmap=cmap,
               extent=[VMIN, VMAX, 0, 1])
    cax.set_yticks([])
    cax.set_xticks([-2, 5, 12, 19, 26, 30])
    cax.set_xticklabels(["−2°", "5°", "12°", "19°", "26°", "30 °C"])
    cax.tick_params(length=0, pad=5, labelsize=8.5, colors=INK)
    for s in cax.spines.values():
        s.set_edgecolor(INK)
        s.set_linewidth(0.5)
    cax.set_title(f"Sea surface temperature, {period}", fontsize=8.5,
                  color=INK, pad=7, fontfamily="DejaVu Sans")

    key = fig.add_axes([x, y, w, 0.026])
    key.set_axis_off()
    key.set_xlim(0, 1)
    key.set_ylim(0, 1)
    for x0, colour, label in ((0.10, WARM_INK, "warm current"),
                              (0.58, COLD_INK, "cold current")):
        key.plot([x0, x0 + 0.10], [0.55, 0.55], color=colour, lw=3.0,
                 solid_capstyle="round")
        key.annotate("", xy=(x0 + 0.135, 0.55), xytext=(x0 + 0.10, 0.55),
                     arrowprops=dict(arrowstyle="-|>", color=colour, lw=0))
        key.text(x0 + 0.17, 0.55, label, va="center", fontsize=8.5, color=INK)


LAYOUTS = {
    # projection -> (figsize, map axes rect, title y, subtitle y, legend box)
    "polar": ((13.0, 16.0), [0.02, 0.14, 0.96, 0.70], 0.945, 0.912,
              (0.30, 0.045, 0.40)),
    "robinson": ((14.0, 10.4), [0.025, 0.175, 0.95, 0.675], 0.945, 0.897,
                 (0.315, 0.042, 0.37)),
}


def make_projection(name, central_longitude):
    if name == "polar":
        return ccrs.AzimuthalEquidistant(central_longitude=central_longitude,
                                         central_latitude=90)
    return ccrs.Robinson(central_longitude=central_longitude)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(here, "ocean_currents_poster.png"))
    ap.add_argument("--projection", choices=sorted(LAYOUTS), default="polar")
    ap.add_argument("--central-longitude", type=float, default=None,
                    help="default: -30 for polar, -160 for robinson")
    ap.add_argument("--cut-lat", type=float, default=-90.0,
                    help="polar layout: southern latitude at the rim of the disc")
    ap.add_argument("--month", default="annual", help="'annual' or 1-12")
    ap.add_argument("--cache", default=os.path.join(here, "ersstv5.nc"))
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--label-size", type=float, default=6.2)
    ap.add_argument("--title", default="THE WORLD OCEAN")
    ap.add_argument("--subtitle",
                    default="SEA SURFACE TEMPERATURE · MAJOR SURFACE CURRENTS")
    args = ap.parse_args()

    lon0 = args.central_longitude
    if lon0 is None:
        lon0 = -30.0 if args.projection == "polar" else -160.0

    lon, lat, field, span, n_months = load_sst(fetch_sst(args.cache), args.month)
    lon_b, lat_b, big = smooth(lon, lat, field)
    cmap = temperature_cmap()
    period = (f"{span} annual mean" if args.month == "annual"
              else f"{MONTH_NAMES[int(args.month) - 1]} mean, {span}")

    figsize, rect, title_y, sub_y, legend_box = LAYOUTS[args.projection]
    fig = plt.figure(figsize=figsize, facecolor=PAPER)
    ax = fig.add_axes(rect, projection=make_projection(args.projection, lon0))
    ax.set_global()
    if args.projection == "polar":
        # clip to a clean disc: everything poleward of --cut-lat in the south
        radius = ax.projection.transform_point(0.0, args.cut_lat,
                                               ccrs.PlateCarree())[1]
        theta = np.linspace(0, 2 * np.pi, 400)
        ax.set_boundary(mpath.Path(np.column_stack(
            [np.cos(theta), np.sin(theta)]) * abs(radius)))
        ax.set_xlim(-abs(radius), abs(radius))
        ax.set_ylim(-abs(radius), abs(radius))
    ax.patch.set_facecolor(PAPER)
    ax.spines["geo"].set_visible(False)

    ax.add_feature(cfeature.NaturalEarthFeature("physical", "ocean", "50m"),
                   facecolor=ICE, edgecolor="none", zorder=1)
    ax.pcolormesh(lon_b, lat_b, big, cmap=cmap, norm=Normalize(VMIN, VMAX),
                  shading="auto", transform=ccrs.PlateCarree(), zorder=2,
                  rasterized=True)

    # fine isotherms give the field the grain of an engraved chart
    ax.contour(lon_b, lat_b, big, levels=np.arange(0, 31, 2), colors=INK,
               linewidths=0.28, alpha=0.34, transform=ccrs.PlateCarree(), zorder=3)
    ax.contour(lon_b, lat_b, big, levels=[10, 20, 26], colors=INK,
               linewidths=0.7, alpha=0.55, transform=ccrs.PlateCarree(), zorder=4)

    scale = 1.0 if args.projection == "robinson" else 0.85
    paths = [spline(p) for _, _, _, p in CURRENTS]
    for (name, kind, strength, _), xy in zip(CURRENTS, paths):
        draw_current(ax, xy, kind, strength, scale)

    ax.add_feature(cfeature.NaturalEarthFeature("physical", "land", "50m"),
                   facecolor=LAND, edgecolor="none", zorder=8)
    # inland seas and big lakes are outside the SST analysis: paint them out
    ax.add_feature(cfeature.NaturalEarthFeature("physical", "lakes", "50m"),
                   facecolor=ICE, edgecolor=INK, linewidth=0.25, zorder=8.5)
    ax.add_feature(cfeature.NaturalEarthFeature("physical", "coastline", "50m"),
                   facecolor="none", edgecolor=INK, linewidth=0.45, zorder=9)

    for i, frac in LABEL_AT.items():
        draw_label(ax, paths[i], CURRENTS[i][0].upper(), frac, args.label_size)

    fig.text(0.5, title_y, args.title, ha="center", va="center", fontsize=40,
             fontweight="bold", color=INK, fontfamily="DejaVu Sans")
    fig.text(0.5, sub_y, args.subtitle, ha="center", va="center", fontsize=12,
             color=INK, alpha=0.70, fontfamily="DejaVu Sans")

    add_legend(fig, cmap, legend_box, period)
    fig.text(0.5, 0.018,
             f"Temperature: NOAA ERSST v5, {period} ({n_months} monthly fields).   "
             "Coastlines: Natural Earth 1:50m.   "
             "Current paths: schematic centrelines after standard oceanographic charts.",
             ha="center", fontsize=6.8, color=INK, alpha=0.65)

    fig.savefig(args.out, dpi=args.dpi, facecolor=PAPER)
    if args.out.lower().endswith(".png"):
        fig.savefig(args.out[:-4] + ".pdf", facecolor=PAPER)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
