"""Major surface currents of the world ocean.

Schematic centrelines digitised from standard oceanographic charts
(Tomczak & Godfrey, *Regional Oceanography*; NOAA Ocean Surface Currents).
Each entry is (name, kind, strength, [(lon, lat), ...]) where the path runs
downstream, `kind` is "warm" or "cold" and `strength` is a relative
0..1 weight used for line width.

Longitudes may run past +/-180 so that a path stays continuous across the
antimeridian.
"""

CURRENTS = [
    # ---------------- Atlantic ----------------
    ("Gulf Stream", "warm", 1.00, [
        (-80.5, 24.5), (-79.5, 28.0), (-79.0, 31.5), (-76.5, 34.0),
        (-73.0, 36.0), (-68.0, 38.5), (-62.0, 40.0), (-55.0, 41.5), (-49.0, 43.0)]),
    ("North Atlantic Drift", "warm", 0.80, [
        (-49.0, 43.0), (-42.0, 45.5), (-34.0, 48.0), (-25.0, 50.5),
        (-17.0, 52.5), (-10.0, 55.0), (-4.0, 58.0)]),
    ("Norwegian Current", "warm", 0.60, [
        (-4.0, 58.0), (2.0, 61.0), (7.0, 64.0), (14.0, 68.0),
        (22.0, 70.5), (33.0, 71.5), (43.0, 72.0)]),
    ("Irminger Current", "warm", 0.45, [
        (-25.0, 50.5), (-25.0, 56.0), (-27.0, 60.0), (-32.0, 63.0)]),
    ("East Greenland Current", "cold", 0.70, [
        (2.0, 79.0), (-6.0, 76.0), (-16.0, 72.0), (-26.0, 68.0),
        (-36.0, 64.0), (-43.0, 60.5), (-45.0, 58.0)]),
    ("West Greenland Current", "cold", 0.40, [
        (-45.0, 58.0), (-50.0, 60.0), (-54.0, 63.0), (-56.0, 67.0)]),
    ("Labrador Current", "cold", 0.75, [
        (-60.0, 66.0), (-60.0, 61.0), (-57.0, 56.0), (-54.0, 51.0),
        (-51.0, 47.0), (-49.5, 43.5)]),
    ("Canary Current", "cold", 0.60, [
        (-11.0, 37.0), (-13.0, 33.0), (-17.0, 28.0), (-19.5, 23.0),
        (-21.0, 18.0), (-22.0, 14.0)]),
    ("North Equatorial Current", "warm", 0.70, [
        (-22.0, 12.5), (-32.0, 11.5), (-42.0, 10.0), (-52.0, 9.0)]),
    ("Antilles / Caribbean Current", "warm", 0.75, [
        (-52.0, 9.0), (-60.0, 11.0), (-68.0, 14.0), (-76.0, 17.5),
        (-82.0, 21.0), (-83.0, 23.5), (-80.5, 24.5)]),
    ("North Equatorial Countercurrent", "warm", 0.45, [
        (-42.0, 4.0), (-32.0, 3.5), (-22.0, 3.0), (-12.0, 3.5), (-2.0, 4.5)]),
    ("Guinea Current", "warm", 0.40, [
        (-2.0, 4.5), (4.0, 3.5), (9.0, 3.0)]),
    ("South Equatorial Current", "warm", 0.70, [
        (5.0, -1.0), (-8.0, -2.5), (-20.0, -4.0), (-31.0, -5.5), (-40.0, -7.0)]),
    ("North Brazil Current", "warm", 0.55, [
        (-40.0, -7.0), (-46.0, -2.0), (-51.0, 3.0), (-55.0, 7.0)]),
    ("Brazil Current", "warm", 0.60, [
        (-38.0, -11.0), (-39.5, -18.0), (-45.0, -25.0), (-51.0, -31.0),
        (-56.0, -37.0)]),
    ("Malvinas (Falkland) Current", "cold", 0.60, [
        (-62.0, -54.0), (-60.0, -49.0), (-58.0, -44.0), (-56.0, -39.0)]),
    ("Benguela Current", "cold", 0.65, [
        (19.0, -35.0), (15.0, -30.0), (11.5, -24.0), (9.5, -18.0), (8.5, -12.0)]),
    ("South Atlantic Current", "cold", 0.45, [
        (-52.0, -40.0), (-35.0, -40.0), (-18.0, -39.0), (-2.0, -38.0), (12.0, -37.0)]),

    # ---------------- Pacific ----------------
    ("Kuroshio", "warm", 0.95, [
        (121.0, 21.0), (123.0, 25.0), (126.0, 29.0), (131.0, 31.5),
        (137.0, 33.5), (142.0, 35.0), (147.0, 36.0)]),
    ("Kuroshio Extension / North Pacific Current", "warm", 0.70, [
        (147.0, 36.0), (160.0, 39.0), (175.0, 41.5), (190.0, 43.0),
        (205.0, 44.5), (218.0, 45.5), (231.0, 46.0)]),
    ("Oyashio", "cold", 0.60, [
        (167.0, 57.0), (161.0, 52.0), (154.0, 47.0), (147.0, 43.0), (143.0, 39.5)]),
    ("Alaska Current", "warm", 0.50, [
        (231.0, 46.0), (226.0, 52.0), (215.0, 57.5), (203.0, 57.0), (195.0, 53.0)]),
    ("California Current", "cold", 0.65, [
        (231.0, 46.0), (233.0, 40.0), (238.0, 33.0), (244.0, 26.0), (250.0, 20.0)]),
    ("North Equatorial Current", "warm", 0.70, [
        (250.0, 15.0), (230.0, 13.0), (210.0, 12.0), (190.0, 11.5),
        (170.0, 11.0), (152.0, 11.0), (135.0, 11.5)]),
    ("Equatorial Countercurrent", "warm", 0.45, [
        (132.0, 5.5), (152.0, 5.5), (172.0, 6.0), (192.0, 6.5),
        (212.0, 7.0), (232.0, 7.5), (250.0, 8.0)]),
    ("South Equatorial Current", "warm", 0.75, [
        (274.0, -3.0), (255.0, -3.5), (235.0, -4.0), (215.0, -4.5),
        (195.0, -5.0), (175.0, -6.0), (158.0, -7.0)]),
    ("East Australian Current", "warm", 0.60, [
        (149.0, -18.0), (152.5, -25.0), (153.5, -32.0), (150.5, -38.0),
        (148.0, -42.0)]),
    ("Peru (Humboldt) Current", "cold", 0.70, [
        (285.0, -42.0), (285.5, -34.0), (283.0, -26.0), (280.0, -18.0),
        (277.5, -10.0), (275.0, -4.0)]),
    ("Kamchatka Current", "cold", 0.35, [
        (180.0, 62.0), (172.0, 59.0), (167.0, 57.0)]),

    # ---------------- Indian ----------------
    ("Agulhas Current", "warm", 0.80, [
        (40.5, -16.0), (38.5, -22.0), (34.0, -28.0), (28.0, -33.0),
        (22.0, -36.5), (17.0, -38.5)]),
    ("Agulhas Retroflection", "warm", 0.45, [
        (17.0, -38.5), (20.0, -41.0), (26.0, -41.0), (32.0, -39.0)]),
    ("Mozambique Current", "warm", 0.45, [
        (42.0, -11.0), (41.5, -16.0), (40.5, -16.0)]),
    ("South Equatorial Current", "warm", 0.70, [
        (105.0, -12.0), (90.0, -12.5), (75.0, -13.0), (60.0, -13.5), (47.0, -13.0)]),
    ("Somali Current", "warm", 0.55, [
        (48.0, -2.0), (50.5, 4.0), (52.5, 9.0), (56.0, 12.0), (60.0, 13.0)]),
    ("West Australian Current", "cold", 0.45, [
        (113.0, -34.0), (110.5, -27.0), (108.5, -20.0), (106.5, -14.0)]),
    ("Leeuwin Current", "warm", 0.35, [
        (114.0, -22.0), (113.0, -29.0), (115.0, -34.0), (120.0, -35.5)]),
    ("South Indian Current", "cold", 0.45, [
        (32.0, -41.0), (55.0, -42.0), (78.0, -42.5), (100.0, -42.0), (118.0, -41.0)]),

    # ---------------- Southern Ocean ----------------
    ("Antarctic Circumpolar Current", "cold", 0.90, [
        (-180.0, -60.0), (-160.0, -61.5), (-140.0, -62.0), (-120.0, -60.0),
        (-100.0, -57.5), (-80.0, -57.0), (-65.0, -58.5), (-52.0, -53.0),
        (-35.0, -48.5), (-18.0, -48.0), (0.0, -50.0), (18.0, -51.5),
        (36.0, -49.0), (54.0, -48.0), (72.0, -50.0), (90.0, -53.5),
        (108.0, -56.0), (126.0, -58.0), (144.0, -59.5), (162.0, -60.5),
        (180.0, -60.0)]),
    ("Antarctic Coastal Current", "cold", 0.35, [
        (180.0, -68.0), (150.0, -66.0), (120.0, -66.5), (90.0, -66.0),
        (60.0, -67.0), (30.0, -69.0), (0.0, -70.0), (-30.0, -71.0),
        (-60.0, -72.0), (-90.0, -73.0), (-120.0, -71.0), (-150.0, -69.0),
        (-180.0, -68.0)]),

    # ---------------- Arctic ----------------
    ("Transpolar Drift", "cold", 0.40, [
        (140.0, 76.0), (150.0, 81.0), (170.0, 85.0), (200.0, 87.0),
        (250.0, 86.0), (330.0, 84.0), (352.0, 80.0)]),
    ("Beaufort Gyre", "cold", 0.30, [
        (200.0, 72.0), (215.0, 74.5), (222.0, 78.0), (208.0, 80.0),
        (192.0, 78.5), (192.0, 75.0), (200.0, 72.0)]),
]



# Where to anchor each current's name: index into CURRENTS -> position
# along the path (0 = source, 1 = end).  Minor branches stay unlabelled.
LABEL_AT = {
    0: 0.55,   # Gulf Stream
    1: 0.5,   # North Atlantic Drift
    2: 0.55,   # Norwegian Current
    4: 0.5,   # East Greenland Current
    6: 0.5,   # Labrador Current
    7: 0.5,   # Canary Current
    8: 0.5,   # North Equatorial Current
    10: 0.5,   # North Equatorial Countercurrent
    12: 0.5,   # South Equatorial Current
    14: 0.5,   # Brazil Current
    15: 0.5,   # Malvinas (Falkland) Current
    16: 0.5,   # Benguela Current
    18: 0.5,   # Kuroshio
    19: 0.45,   # Kuroshio Extension / North Pacific Current
    20: 0.5,   # Oyashio
    21: 0.5,   # Alaska Current
    22: 0.5,   # California Current
    23: 0.5,   # North Equatorial Current
    24: 0.5,   # Equatorial Countercurrent
    25: 0.5,   # South Equatorial Current
    26: 0.5,   # East Australian Current
    27: 0.5,   # Peru (Humboldt) Current
    29: 0.5,   # Agulhas Current
    32: 0.5,   # South Equatorial Current
    33: 0.5,   # Somali Current
    34: 0.5,   # West Australian Current
    37: 0.3,   # Antarctic Circumpolar Current
    39: 0.5,   # Transpolar Drift
}
