"""Ocean-centred projection, a land bitmap, and raster sampling helpers."""

import numpy as np
from PIL import Image, ImageDraw
from pyproj import CRS, Transformer
import cartopy.io.shapereader as shpreader

# Adams "world in a square II" on a rotated globe, oriented so that the cut
# runs almost entirely through land: the world ocean comes out as one
# uninterrupted body, in the spirit of Spilhaus's ocean map.  The rotation was
# chosen by maximising the fraction of the map's edge that falls on land.
SPILHAUS = ("+proj=ob_tran +o_proj=adams_ws2 +o_lat_p=75 +o_lon_p=-69 "
            "+lon_0=127.5 +R=6378137 +no_defs +over")

LAND_STEP = 0.05        # degrees per pixel in the land bitmap


def crs(proj4=SPILHAUS):
    c = CRS.from_proj4(proj4)
    return (c,
            Transformer.from_crs("EPSG:4326", c, always_xy=True),
            Transformer.from_crs(c, "EPSG:4326", always_xy=True))


def land_bitmap(step=LAND_STEP, resolution="50m"):
    """Boolean array [lat, lon] that is True on land (lakes included)."""
    nx, ny = int(round(360 / step)), int(round(180 / step))
    img = Image.new("1", (nx, ny), 0)
    draw = ImageDraw.Draw(img)

    def polys(name):
        for g in shpreader.Reader(
                shpreader.natural_earth(resolution, "physical", name)).geometries():
            yield from (g.geoms if g.geom_type == "MultiPolygon" else [g])

    for name in ("land", "lakes"):
        for poly in polys(name):
            for ring in [poly.exterior]:
                lon, lat = np.array(ring.coords).T
                x = (lon + 180.0) / step
                y = (lat + 90.0) / step
                draw.polygon(list(zip(x, y)), fill=1)
    return np.array(img, dtype=bool)


class Land:
    """Nearest-neighbour lookup into the land bitmap."""

    def __init__(self, mask, step=LAND_STEP):
        self.mask, self.step = mask, step

    def __call__(self, lon, lat):
        x = np.clip(((np.asarray(lon) + 180.0) % 360.0) / self.step, 0,
                    self.mask.shape[1] - 1).astype(np.int32)
        y = np.clip((np.asarray(lat) + 90.0) / self.step, 0,
                    self.mask.shape[0] - 1).astype(np.int32)
        return self.mask[y, x]


def map_extent(fwd, samples=400):
    """Half-width of the projected world, in projection units."""
    lon = np.linspace(-180, 180, samples)
    lat = np.linspace(-89.9, 89.9, samples)
    L, A = np.meshgrid(lon, lat)
    x, y = fwd.transform(L.ravel(), A.ravel())
    ok = np.isfinite(x) & np.isfinite(y)
    return float((np.abs(x[ok]) + np.abs(y[ok])).max())


def inverse_grid(inv, fwd, half, n):
    """Sample the output raster: returns lon, lat, inside — each (n, n).

    ``+over`` lets the inverse return a lon/lat for points outside the map, so
    the domain test is a round trip: a pixel is inside only if projecting its
    lon/lat lands back where it started.
    """
    g = np.linspace(-half, half, n)
    gx, gy = np.meshgrid(g, g)
    lon, lat = inv.transform(gx.ravel(), gy.ravel())
    lon, lat = lon.reshape(n, n), lat.reshape(n, n)
    inside = np.isfinite(lon) & np.isfinite(lat)
    lon, lat = np.nan_to_num(lon), np.nan_to_num(lat)
    inside &= np.abs(lat) <= 90.0
    lon = np.where(inside, ((lon + 180) % 360) - 180, 0.0)
    lat = np.where(inside, np.clip(lat, -90, 90), 0.0)

    bx, by = fwd.transform(lon.ravel(), lat.ravel())
    bx, by = np.asarray(bx).reshape(n, n), np.asarray(by).reshape(n, n)
    err = np.hypot(np.nan_to_num(bx) - gx, np.nan_to_num(by) - gy)
    inside &= np.isfinite(bx) & np.isfinite(by) & (err < half * 5e-3)
    return lon, lat, inside


def project_paths(fwd, paths, jump):
    """Project lon/lat polylines, breaking them where they cross the map cut."""
    out = []
    for xy in paths:
        x, y = fwd.transform(xy[:, 0], xy[:, 1])
        x, y = np.asarray(x), np.asarray(y)
        bad = ~(np.isfinite(x) & np.isfinite(y))
        x[bad], y[bad] = np.nan, np.nan
        d = np.hypot(np.diff(x), np.diff(y))
        cut = np.where(~(d < jump))[0]
        pieces = np.split(np.column_stack([x, y]), cut + 1)
        out.append([p for p in pieces if len(p) > 1])
    return out
