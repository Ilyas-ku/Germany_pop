"""Turn the schematic current centrelines into a continuous flow field.

The named currents in ``currents.py`` are lines, not velocities.  To draw the
ocean as a moving fluid we splat each line's direction onto a lon/lat grid at
two scales: a tight one that keeps the named currents sharp, and a broad one
that lets the direction bleed into the water between them.  Dividing by the
splatted weight gives a direction field defined over the whole ocean; the
weight itself becomes a strength field, high on the currents and fading away
from them.

Nothing here is measured velocity.  The direction is the drawn current where a
current was drawn, and an interpolation everywhere else.
"""

import numpy as np
from scipy import ndimage
from scipy.interpolate import splprep, splev

STEP = 0.5                       # grid spacing, degrees
SIGMA_NEAR = 3.0                 # tight splat, degrees
SIGMA_FAR = 13.0                 # broad splat, degrees


def spline(points, n=600):
    p = np.asarray(points, dtype=float)
    tck, _ = splprep([p[:, 0], p[:, 1]], s=0, k=min(3, len(p) - 1))
    x, y = splev(np.linspace(0, 1, n), tck)
    return np.column_stack([x, y])


def build_field(currents, land_lookup):
    """Return (lons, lats, u, v, strength) on a regular lon/lat grid."""
    lons = np.arange(-180.0, 180.0, STEP)
    lats = np.arange(-90.0, 90.0 + STEP, STEP)
    nx, ny = lons.size, lats.size

    acc_u = np.zeros((ny, nx))
    acc_v = np.zeros((ny, nx))
    acc_w = np.zeros((ny, nx))

    for _, _, strength, path in currents:
        xy = spline(path)
        d = np.gradient(xy, axis=0)
        lat_r = np.radians(xy[:, 1])
        u = d[:, 0] * np.cos(lat_r)           # eastward component
        v = d[:, 1]                            # northward component
        norm = np.hypot(u, v)
        norm[norm == 0] = 1.0
        u, v = u / norm * strength, v / norm * strength

        ix = np.round((((xy[:, 0] + 180) % 360) - 180 + 180) / STEP).astype(int) % nx
        iy = np.clip(np.round((xy[:, 1] + 90) / STEP).astype(int), 0, ny - 1)
        np.add.at(acc_u, (iy, ix), u)
        np.add.at(acc_v, (iy, ix), v)
        np.add.at(acc_w, (iy, ix), strength)

    def blur(a, sigma_deg):
        s = sigma_deg / STEP
        return ndimage.gaussian_filter(a, s, mode=("nearest", "wrap"))

    near = [blur(a, SIGMA_NEAR) for a in (acc_u, acc_v, acc_w)]
    far = [blur(a, SIGMA_FAR) for a in (acc_u, acc_v, acc_w)]

    w = near[2] + 0.8 * far[2]
    eps = w.max() * 1e-4
    u = (near[0] + 0.8 * far[0]) / (w + eps)
    v = (near[1] + 0.8 * far[1]) / (w + eps)

    strength = near[2] + 0.45 * far[2]
    strength /= np.percentile(strength, 99.5)
    strength = np.clip(strength, 0, 1)

    sea = ~land_lookup(*np.meshgrid(lons, lats))
    u, v, strength = u * sea, v * sea, strength * sea
    return lons, lats, u, v, strength


class Field:
    """Bilinear sampling of the flow field, periodic in longitude."""

    def __init__(self, lons, lats, u, v, strength):
        self.lons, self.lats = lons, lats
        self.u, self.v, self.s = u, v, strength

    def _idx(self, lon, lat):
        x = (((lon + 180.0) % 360.0)) / STEP
        y = np.clip((lat + 90.0) / STEP, 0, self.lats.size - 1.001)
        return y, x

    def sample(self, lon, lat):
        y, x = self._idx(lon, lat)
        coords = np.vstack([y, x])
        kw = dict(order=1, mode="grid-wrap", prefilter=False)
        return (ndimage.map_coordinates(self.u, coords, **kw),
                ndimage.map_coordinates(self.v, coords, **kw),
                ndimage.map_coordinates(self.s, coords, **kw))


def streamlines(field, seeds, steps=220, step_deg=0.45, min_speed=0.02,
                min_len=10):
    """Advect every seed at once.  Returns (points, strength) arrays.

    points is (n_seeds, steps, 2) in lon/lat with NaN once a particle has left
    the water or run into still water; strength carries the flow strength at
    each point, which is what the drawing uses for weight and opacity.
    """
    lon = np.asarray(seeds, dtype=float)[:, 0].copy()
    lat = np.asarray(seeds, dtype=float)[:, 1].copy()
    alive = np.ones(lon.size, dtype=bool)

    pts = np.full((lon.size, steps, 2), np.nan)
    stg = np.full((lon.size, steps), np.nan)

    for k in range(steps):
        u, v, s = field.sample(lon, lat)
        speed = np.hypot(u, v)
        alive &= speed > min_speed
        alive &= np.abs(lat) < 88.0
        if not alive.any():
            break
        pts[alive, k, 0] = lon[alive]
        pts[alive, k, 1] = lat[alive]
        stg[alive, k] = s[alive]

        scale = np.where(speed > 1e-6, step_deg / np.maximum(speed, 1e-6), 0.0)
        cos = np.maximum(np.cos(np.radians(lat)), 0.15)
        lon = np.where(alive, lon + u * scale / cos, lon)
        lat = np.where(alive, lat + v * scale, lat)
        lon = ((lon + 180.0) % 360.0) - 180.0

    keep = np.isfinite(pts[:, :, 0]).sum(axis=1) >= min_len
    return pts[keep], stg[keep]
