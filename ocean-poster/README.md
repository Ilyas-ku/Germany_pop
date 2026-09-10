# The world ocean — currents and temperature

Two print-ready posters (PNG + PDF) built from the same data.

## 1. Ocean currents — `make_flow_poster.py`

![currents](preview_currents.png)

The currents carry the image: the whole ocean is drawn as flow lines, with sea
surface temperature underneath as a pale wash.

The map is **ocean-centred**: Adams "world in a square II" on a rotated globe,
oriented so the map's cut runs almost entirely through land. The world ocean
comes out as one uninterrupted body with the continents pushed to the edges —
the idea behind Spilhaus's ocean map. The rotation in `oceanmap.SPILHAUS` was
picked by searching for the orientation that puts the most land on the cut
(~79% of it); the remaining stretch shows as a straight edge across water.
Land is painted in the paper colour, so only coastlines are drawn and the ocean
floats on the page.

```bash
python make_flow_poster.py                       # 300 dpi PNG + PDF, ~2 min
python make_flow_poster.py --wash 0              # currents only, no temperature
python make_flow_poster.py --seeds 20000         # denser flow texture
python make_flow_poster.py --month 1 --wash 0.5  # January temperature, stronger
python make_flow_poster.py --seed 3              # a different set of flow lines
```

## 2. Temperature with currents over it — `make_poster.py`

![temperature](preview_temperature.png)

The earlier layout, where temperature is the subject and the named currents are
drawn over it as arrows.

```bash
python make_poster.py                       # polar disc (whole globe)
python make_poster.py --projection robinson # wide Pacific-centred world map
python make_poster.py --month 1             # January instead of the annual mean
```

## Running

```bash
pip install numpy scipy matplotlib netCDF4 cartopy pyproj pillow shapely
```

The first run caches `ersstv5.nc` (19 MB, not committed) next to the scripts and
the Natural Earth shapefiles in cartopy's own cache.

## What the data is

**Temperature** — NOAA ERSST v5, the 2° monthly sea surface temperature
analysis, averaged into a 1991–2020 annual-mean climatology (360 fields), or the
30 instances of one calendar month with `--month`. The 2° grid is flood-filled
across land, blurred and resampled so the field reads as a fluid; the land mask
is re-applied afterwards and coastlines come from Natural Earth 1:50m.

**Currents** — `currents.py` holds schematic centrelines for 41 named surface
currents, digitised from standard oceanographic charts. Real currents in real
places, but the geometry is a drawn generalisation: line width encodes relative
strength, not speed in m/s, and no eddies or seasonal reversals are shown (the
Somali Current in particular reverses with the monsoon; it is drawn in its
summer state).

**Flow lines** — `flowfield.py` turns those centrelines into a continuous field:
each path's direction is splatted onto a lon/lat grid at two scales, a tight one
that keeps the named currents sharp and a broad one that lets the direction
bleed into the water between them. Dividing by the splatted weight gives a
direction defined over the whole ocean; the weight itself becomes the strength
that sets each line's darkness and width. Particles are then advected through
it. **This is not a measured velocity field** — it is the drawn circulation
where a current was drawn, and an interpolation everywhere else. The gyres it
produces are a consequence of the currents that bound them, not an independent
observation.

## Files

| file | what it does |
| --- | --- |
| `currents.py` | the 41 current paths, plus where to anchor each name |
| `flowfield.py` | centrelines → flow field → streamlines |
| `oceanmap.py` | the ocean-centred projection, land bitmap, raster sampling |
| `make_flow_poster.py` | poster 1: currents |
| `make_poster.py` | poster 2: temperature, and the shared SST loading/palette |
