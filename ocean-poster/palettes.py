"""Seasonal colour schemes for the currents poster.

Each season gets its own paper, ink and temperature ramp.  The ramps are all
cool-to-warm, but the warm end is read differently in each: blush and plum in
winter, coral in spring, terracotta in summer, rust in autumn.  The cold end
moves too — blue-violet in winter, teal in summer.
"""

from matplotlib.colors import LinearSegmentedColormap

VMIN, VMAX = -2.0, 30.0

SEASONS = {
    "winter": dict(
        months=(12, 1, 2),
        label="WINTER",
        span="DECEMBER – FEBRUARY",
        note="northern winter, southern summer",
        paper="#F0EFEC",
        ink="#161A24",
        warm="#8E4A66",
        cold="#223F6B",
        stops=[(-2, "#17253F"), (2, "#2A4066"), (7, "#486089"), (12, "#7688A6"),
               (16, "#A5AAB6"), (19, "#C6B2BC"), (22, "#DCA9B8"),
               (25, "#D18DA8"), (27.5, "#C06F92"), (30, "#9C4E74")],
    ),
    "spring": dict(
        months=(3, 4, 5),
        label="SPRING",
        span="MARCH – MAY",
        note="northern spring, southern autumn",
        paper="#F2F1EA",
        ink="#171C22",
        warm="#C06A5E",
        cold="#2F4FA0",
        stops=[(-2, "#26356B"), (2, "#3D5AA0"), (7, "#6685C4"), (12, "#93B0C6"),
               (16, "#AECBAF"), (19, "#CFD9A4"), (22, "#E8CE9C"),
               (25, "#EFAF92"), (27.5, "#DE8B7E"), (30, "#BE6668")],
    ),
    "summer": dict(
        months=(6, 7, 8),
        label="SUMMER",
        span="JUNE – AUGUST",
        note="northern summer, southern winter",
        paper="#F4EFE5",
        ink="#1B1712",
        warm="#A64B28",
        cold="#1E585C",
        stops=[(-2, "#1E4247"), (2, "#2F6165"), (7, "#4E8481"), (12, "#83A79C"),
               (16, "#B4BC9C"), (19, "#D8C79A"), (22, "#E3B076"),
               (25, "#D98B52"), (27.5, "#C26A3C"), (30, "#9E4526")],
    ),
    "autumn": dict(
        months=(9, 10, 11),
        label="AUTUMN",
        span="SEPTEMBER – NOVEMBER",
        note="northern autumn, southern spring",
        paper="#F1ECE3",
        ink="#1A1611",
        warm="#8B4A22",
        cold="#203B45",
        stops=[(-2, "#1A2C33"), (2, "#2B4750"), (7, "#456670"), (12, "#6E888B"),
               (16, "#99A184"), (19, "#C0AE7E"), (22, "#CE9A63"),
               (25, "#BC7847"), (27.5, "#A25A32"), (30, "#7E3D22")],
    ),
    "annual": dict(
        months=None,
        label="ANNUAL MEAN",
        span="ALL MONTHS",
        note=None,
        paper="#F2EFE9",
        ink="#16181B",
        warm="#7C2417",
        cold="#1E3A5F",
        stops=[(-2, "#22344F"), (2, "#3C5A78"), (7, "#6B8CA0"), (12, "#9DB5B9"),
               (16, "#C6C8B7"), (19, "#DFCDA9"), (22, "#DFB183"),
               (25, "#D08A5C"), (27.5, "#B75F3B"), (30, "#8E3320")],
    ),
}

# The current paths are the same in every season, with one real exception: the
# Somali Current reverses with the monsoon and runs southwestward under the
# northeast monsoon of the northern winter.
OVERRIDES = {
    "winter": {"Somali Current": dict(reverse=True, strength=0.35)},
}


def cmap_for(season):
    stops = SEASONS[season]["stops"]
    pos = [(t - VMIN) / (VMAX - VMIN) for t, _ in stops]
    return LinearSegmentedColormap.from_list(
        f"sst-{season}", list(zip(pos, [c for _, c in stops])), N=512)


def apply_overrides(currents, season):
    """Return the current list with any seasonal changes applied."""
    changes = OVERRIDES.get(season)
    if not changes:
        return list(currents), []
    out, applied = [], []
    for name, kind, strength, path in currents:
        c = changes.get(name)
        if c:
            if c.get("reverse"):
                path = list(reversed(path))
            strength = c.get("strength", strength)
            applied.append(name)
        out.append((name, kind, strength, path))
    return out, applied
