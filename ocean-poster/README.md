# The World Ocean — sea surface temperature and major currents

A print-ready poster of the world ocean: sea surface temperature as a
continuous field, with the major surface currents drawn over it.

![poster](ocean_currents_poster.png)

## Running it

```bash
pip install numpy scipy matplotlib netCDF4 cartopy
python make_poster.py                       # polar layout, 300 dpi PNG + PDF
python make_poster.py --projection robinson # wide Pacific-centred layout
python make_poster.py --month 1             # January mean instead of annual
python make_poster.py --cut-lat -72         # trim the southern rim of the disc
```

The first run downloads two things and caches them:

* `ersstv5.nc` (19 MB) next to the script — the SST data, not committed;
* Natural Earth coastlines, into cartopy's own cache.

Both PNG and PDF are written; `--dpi` controls the raster only.

## What the data is

**Temperature** — NOAA ERSST v5, the 2° monthly sea surface temperature
analysis. The script averages the 1991–2020 months (360 fields) into an
annual-mean climatology, or the 30 instances of one calendar month with
`--month`. The 2° grid is flood-filled across land, blurred, then resampled
6× so the field reads as a fluid rather than as cells; the land mask is
re-applied afterwards, and coastlines are drawn from Natural Earth on top.
Seas outside the analysis (the ice-covered Arctic margins, inland seas) are
painted in a flat pale grey rather than interpolated.

**Currents** — the paths in `currents.py` are schematic centrelines of the 41
named surface currents, digitised from standard oceanographic charts. They
are real currents in real places, but the geometry is a drawn generalisation,
not a velocity field: line width encodes relative strength, not speed in m/s,
and no eddies or seasonal reversals are shown (the Somali Current in
particular reverses with the monsoon; it is drawn in its summer state).

Each current is splined, tapered at both ends and given arrow heads. Names
are anchored at a fraction along the path set in `LABEL_AT` and rotated from
the *projected* tangent, so labels stay upright and aligned in any projection.

## Projections

`--projection polar` (default) is an azimuthal-equidistant view centred on the
North Pole showing the whole globe, clipped to a disc. It puts the Arctic at
the centre and wraps the Antarctic Circumpolar Current around the rim, at the
cost of heavy distortion in the far south. `--projection robinson` is the
conventional wide world map, centred on the Pacific.
