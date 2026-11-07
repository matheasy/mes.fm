/* MES Maps: pure helpers (no DOM, no d3). Node-testable: tool_apps_src/maps-tests.js */
(function (root) {
  "use strict";
  var R = 6371.0088, D = Math.PI / 180;
  var M = {};
  M.R = R;

  /* ---------- projection catalogue (maths lives in d3; this is what the page says about each) ---------- */
  // fam: cyl | pcyl | az | conic | poly | comp ; keeps: conformal | equal-area | equidistant | compromise | gnomonic | none
  M.PROJ = [
    {id: "equal-earth", n: "Equal Earth", fam: "pcyl", keeps: "equal-area", by: "Šavrič, Patterson & Jenny", y: 2018, use: "World maps where size must be fair; used by NASA and many atlases.", note: "Every country has its true size relative to the others, and the shapes stay close to the globe's."},
    {id: "mercator", n: "Mercator", fam: "cyl", keeps: "conformal", by: "Gerardus Mercator", y: 1569, use: "Sea navigation (a straight line is a constant compass bearing) and web maps when zoomed in.", note: "Angles and small shapes are right, but size grows fast towards the poles: at 60° latitude everything is drawn 4 times too big, Greenland looks as big as Africa. The poles are infinitely far away, so the map is cut at about 85°."},
    {id: "equirect", n: "Equirectangular (plate carrée)", fam: "cyl", keeps: "equidistant", by: "Marinus of Tyre", y: 100, use: "Raw data grids, satellite textures, quick plots: longitude and latitude are just x and y.", note: "North-south distances are true everywhere; east-west distances stretch more and more towards the poles."},
    {id: "gall-peters", n: "Gall-Peters", fam: "cyl", keeps: "equal-area", by: "James Gall (1855), Arno Peters (1973)", y: 1855, use: "Showing true sizes with a rectangle; famous from the 1970s debate about Mercator.", note: "Equal area, but shapes near the equator are stretched tall and those near the poles squashed flat."},
    {id: "miller", n: "Miller cylindrical", fam: "cyl", keeps: "compromise", by: "Osborn Miller", y: 1942, use: "A Mercator look-alike that can show the poles.", note: "Like Mercator with the latitudes squeezed, so the poles fit; neither conformal nor equal area."},
    {id: "robinson", n: "Robinson", fam: "pcyl", keeps: "compromise", by: "Arthur Robinson", y: 1963, use: "General world maps (National Geographic 1988-1998).", note: "Made to look right rather than to keep any one property: everything is a little off, nothing is badly off."},
    {id: "winkel3", n: "Winkel tripel", fam: "comp", keeps: "compromise", by: "Oswald Winkel", y: 1921, use: "National Geographic's world map since 1998.", note: "Balances the three distortions (area, direction, distance), hence 'tripel'. Among the lowest overall distortion of world maps."},
    {id: "natural-earth", n: "Natural Earth", fam: "pcyl", keeps: "compromise", by: "Tom Patterson", y: 2011, use: "Small-scale world maps with a friendly shape.", note: "A compromise with rounded corners where the poles are lines, not points."},
    {id: "mollweide", n: "Mollweide", fam: "pcyl", keeps: "equal-area", by: "Karl Mollweide", y: 1805, use: "Global data where area matters: the cosmic microwave background, climate maps.", note: "An ellipse twice as wide as tall; equal area, shapes get sheared near the edges."},
    {id: "sinusoidal", n: "Sinusoidal", fam: "pcyl", keeps: "equal-area", by: "Jean Cossin and others", y: 1570, use: "MODIS satellite tiles; teaching.", note: "Every parallel has its true length, so area is right, but the edges are badly sheared."},
    {id: "eckert4", n: "Eckert IV", fam: "pcyl", keeps: "equal-area", by: "Max Eckert-Greifendorff", y: 1906, use: "Equal-area world maps with rounded sides.", note: "Poles are half the length of the equator, which keeps the high latitudes less squashed than Mollweide."},
    {id: "hammer", n: "Hammer", fam: "comp", keeps: "equal-area", by: "Ernst Hammer", y: 1892, use: "Equal-area world maps, astronomy.", note: "An equal-area ellipse whose curved parallels reduce the shearing at the edges."},
    {id: "aitoff", n: "Aitoff", fam: "comp", keeps: "compromise", by: "David Aitoff", y: 1889, use: "The parent of Winkel tripel and Hammer.", note: "A stretched half of the azimuthal equidistant map; neither equal area nor conformal."},
    {id: "vandergrinten", n: "Van der Grinten", fam: "comp", keeps: "compromise", by: "Alphons van der Grinten", y: 1898, use: "National Geographic's world map 1922-1988.", note: "The whole world inside a circle, with Mercator-like exaggeration of the high latitudes."},
    {id: "loximuthal", n: "Loximuthal", fam: "pcyl", keeps: "none", by: "Karl Siemon", y: 1935, use: "From the centre point (here 40°N), a straight line is a rhumb line with its true length and bearing.", note: "Unusual heart-like outline; a curiosity for navigation."},
    {id: "az-north", n: "Azimuthal equidistant (North Pole)", fam: "az", keeps: "equidistant", by: "known since antiquity; al-Biruni", y: 1000, use: "The emblem of the United Nations; radio and air routes from one point; the picture often called the 'flat earth map'.", note: "Distances and directions from the centre (the North Pole) are true. Everything else stretches with distance from the centre: Antarctica becomes a ring round the edge, and Australia is drawn about twice as wide as it is."},
    {id: "az-ea", n: "Lambert azimuthal equal-area", fam: "az", keeps: "equal-area", by: "Johann Heinrich Lambert", y: 1772, use: "Continent maps, the EU's official grid (ETRS89-LAEA).", note: "Equal area all the way to the antipode, which becomes the whole outer circle."},
    {id: "stereo", n: "Stereographic", fam: "az", keeps: "conformal", by: "Hipparchus", y: -150, use: "Polar maps, crystallography, astrolabes.", note: "Conformal: circles on the globe stay circles. Size grows quickly away from the centre (cut at 140° here)."},
    {id: "gnomonic", n: "Gnomonic", fam: "az", keeps: "gnomonic", by: "Thales of Miletus", y: -580, use: "Planning great-circle routes: every straight line is the shortest path.", note: "Projects from the globe's centre, so it can show less than a hemisphere (cut at 60° here) and distorts fast."},
    {id: "ortho", n: "Orthographic (globe)", fam: "az", keeps: "none", by: "Hipparchus", y: -150, use: "Pictures of the Earth as seen from far away.", note: "What a camera far out in space sees: one hemisphere, squeezed towards the rim."},
    {id: "albers", n: "Albers equal-area conic", fam: "conic", keeps: "equal-area", by: "Heinrich Albers", y: 1805, use: "Maps of the USA, Canada and other mid-latitude countries (standard parallels 20° and 50° here).", note: "Like a cone wrapped round the globe; true scale on two standard parallels and equal area everywhere."},
    {id: "lcc", n: "Lambert conformal conic", fam: "conic", keeps: "conformal", by: "Johann Heinrich Lambert", y: 1772, use: "Aviation charts and many national grids (standard parallels 30° and 60° here).", note: "Conformal like Mercator but on a cone, so mid-latitude countries keep both shape and nearly true size. Far south it blows up (cut at 60°S)."},
    {id: "bonne", n: "Bonne", fam: "pcyl", keeps: "equal-area", by: "Rigobert Bonne", y: 1752, use: "Old atlas maps of continents.", note: "Heart-shaped equal-area map; true scale along every parallel and the central meridian."},
    {id: "homolosine", n: "Goode homolosine (interrupted)", fam: "pcyl", keeps: "equal-area", by: "J. Paul Goode", y: 1923, use: "Land-cover maps: the cuts fall in the oceans, so continents are barely distorted.", note: "An 'orange peel' map: equal area with very good land shapes, paid for by gaps in the oceans.", cut: true},
    {id: "butterfly", n: "Waterman butterfly", fam: "poly", keeps: "compromise", by: "Steve Waterman", y: 1996, use: "Low-distortion world maps; folds into a polyhedron.", note: "The globe flattened as a truncated octahedron and opened like a butterfly.", cut: true},
    {id: "peirce", n: "Peirce quincuncial", fam: "poly", keeps: "conformal", by: "Charles Sanders Peirce", y: 1879, use: "A conformal world in a square that tiles the plane.", note: "Conformal everywhere except four points; the four corners are the southern hemisphere.", cut: true},
    {id: "berghaus", n: "Berghaus star", fam: "poly", keeps: "none", by: "Hermann Berghaus", y: 1879, use: "The logo of the Association of American Geographers.", note: "An azimuthal equidistant northern hemisphere with the southern one cut into five star points.", cut: true}
  ];
  M.FAM = {cyl: "Cylindrical", pcyl: "Pseudocylindrical", az: "Azimuthal", conic: "Conic", comp: "Other (compromise)", poly: "Interrupted / polyhedral"};
  M.KEEPS = {conformal: "Conformal (keeps angles and small shapes)", "equal-area": "Equal area (keeps sizes)", equidistant: "Equidistant (keeps some distances)", compromise: "Compromise (a bit of everything)", gnomonic: "Gnomonic (great circles are straight)", none: "No special property"};
  M.proj = function (id) { for (var i = 0; i < M.PROJ.length; i++) if (M.PROJ[i].id === id) return M.PROJ[i]; return null; };

  /* ---------- geodesy on a sphere (mean Earth radius) ---------- */
  M.dist = function (a, b) { // [lon, lat] degrees -> km (haversine)
    var p1 = a[1] * D, p2 = b[1] * D, dp = p2 - p1, dl = (b[0] - a[0]) * D;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  M.bearing = function (a, b) { // initial great-circle bearing, degrees 0..360
    var p1 = a[1] * D, p2 = b[1] * D, dl = (b[0] - a[0]) * D;
    var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / D + 360) % 360;
  };
  function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * D / 2)); }
  M.rhumb = function (a, b) { // {km, bearing} along the loxodrome
    var p1 = a[1] * D, p2 = b[1] * D, dp = p2 - p1;
    var dl = (b[0] - a[0]) * D;
    if (Math.abs(dl) > Math.PI) dl = dl > 0 ? dl - 2 * Math.PI : dl + 2 * Math.PI;
    var dpsi = mercY(b[1]) - mercY(a[1]);
    var q = Math.abs(dpsi) > 1e-12 ? dp / dpsi : Math.cos(p1);
    var km = Math.sqrt(dp * dp + q * q * dl * dl) * R;
    var brg = (Math.atan2(dl, dpsi) / D + 360) % 360;
    return {km: km, bearing: brg};
  };
  M.rhumbPoints = function (a, b, n) { // points along the rhumb line (straight in Mercator)
    var dl = b[0] - a[0];
    if (Math.abs(dl) > 180) dl = dl > 0 ? dl - 360 : dl + 360;
    var y1 = mercY(a[1]), y2 = mercY(b[1]), out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, y = y1 + (y2 - y1) * t;
      var lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / D;
      if (Math.abs(y2 - y1) < 1e-12) lat = a[1];
      var lon = a[0] + dl * t;
      lon = ((lon + 540) % 360) - 180;
      out.push([lon, lat]);
    }
    return out;
  };
  M.compass = function (deg) {
    var n = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return n[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };
  // Mercator area scale relative to the equator at latitude lat (sec^2)
  M.mercArea = function (lat) { var c = Math.cos(Math.min(89.9, Math.abs(lat)) * D); return 1 / (c * c); };

  /* ---------- spherical rotation (True size: move a shape without changing it) ---------- */
  function toXYZ(p) { var l = p[0] * D, f = p[1] * D, c = Math.cos(f); return [c * Math.cos(l), c * Math.sin(l), Math.sin(f)]; }
  function toLL(v) { return [Math.atan2(v[1], v[0]) / D, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  // Rotation that carries point `from` to point `to`, keeping north as near to up as possible:
  // first slide along the meridian (change latitude about `from`), then turn about the polar axis.
  M.mover = function (from, to) {
    var dLon = (to[0] - from[0]) * D;
    var a = toXYZ([from[0], from[1]]), b = toXYZ([from[0], to[1]]);
    var ax = cross(a, b), s = Math.sqrt(dot(ax, ax)), c = dot(a, b);
    if (s > 1e-12) ax = [ax[0] / s, ax[1] / s, ax[2] / s];
    var ang = Math.atan2(s, c);
    var ca = Math.cos(ang), sa = Math.sin(ang), cl = Math.cos(dLon), sl = Math.sin(dLon);
    return function (p) {
      var v = toXYZ(p);
      if (s > 1e-12) { // Rodrigues
        var k = ax, kv = cross(k, v), kd = dot(k, v);
        v = [v[0] * ca + kv[0] * sa + k[0] * kd * (1 - ca), v[1] * ca + kv[1] * sa + k[1] * kd * (1 - ca), v[2] * ca + kv[2] * sa + k[2] * kd * (1 - ca)];
      }
      v = [v[0] * cl - v[1] * sl, v[0] * sl + v[1] * cl, v[2]];
      return toLL(v);
    };
  };
  M.mapCoords = function (geom, f) { // deep-copy a GeoJSON geometry through f([lon,lat])
    function ring(r) { return r.map(function (p) { return f(p); }); }
    if (geom.type === "Polygon") return {type: "Polygon", coordinates: geom.coordinates.map(ring)};
    if (geom.type === "MultiPolygon") return {type: "MultiPolygon", coordinates: geom.coordinates.map(function (pg) { return pg.map(ring); })};
    return geom;
  };

  /* ---------- the sun (day / night line) ---------- */
  M.subsolar = function (date) { // NOAA-style approximation, good to ~0.1 degree
    var d = (date.getTime() / 86400000) + 2440587.5 - 2451545.0; // days since J2000
    var g = (357.529 + 0.98560028 * d) * D;
    var q = 280.459 + 0.98564736 * d;
    var L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D;
    var e = (23.439 - 0.00000036 * d) * D;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    var lon = (ra / D - gmst * 15);
    lon = ((lon % 360) + 540) % 360 - 180;
    return [lon, dec / D];
  };
  M.isDay = function (p, date) { var s = M.subsolar(date); return M.dist(p, s) < Math.PI / 2 * R; };

  /* ---------- data helpers ---------- */
  M.decodeRings = function (polys) { // admin1 compact encoding -> MultiPolygon coordinates
    return polys.map(function (pg) {
      return pg.map(function (r) {
        var out = [], x = 0, y = 0;
        for (var i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; out.push([x / 100, y / 100]); }
        if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
        return out;
      });
    });
  };
  M.flag = function (a2) {
    if (!a2 || a2.length !== 2 || !/^[A-Z]{2}$/.test(a2)) return "";
    return String.fromCodePoint(0x1F1E6 + a2.charCodeAt(0) - 65, 0x1F1E6 + a2.charCodeAt(1) - 65);
  };
  M.fmtInt = function (n) { return Math.round(n).toLocaleString("en-US"); };
  M.fmtBig = function (n) {
    var a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(a >= 1e13 ? 1 : 2) + " trillion";
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + " billion";
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + " million";
    return M.fmtInt(n);
  };
  M.fmtKm = function (km, unit) {
    if (unit === "mi") return M.fmtInt(km / 1.609344) + " mi";
    if (unit === "nmi") return M.fmtInt(km / 1.852) + " nmi";
    return M.fmtInt(km) + " km";
  };
  M.fmtArea = function (km2, unit) {
    if (unit === "mi") return M.fmtInt(km2 / 2.589988) + " mi²";
    return M.fmtInt(km2) + " km²";
  };
  M.norm = function (s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  M.matches = function (q, fields) { // every word of q starts a word in one of the fields
    var w = M.norm(q).split(" ").filter(Boolean);
    if (!w.length) return true;
    var hay = " " + fields.map(M.norm).join(" ") + " ";
    return w.every(function (x) { return hay.indexOf(" " + x) >= 0; });
  };

  /* ---------- quiz ---------- */
  M.rng = function (seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; };
  M.shuffle = function (arr, r) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  // n answer choices: the right one plus n-1 others, preferring the same region (harder, fairer)
  M.choices = function (right, pool, n, r, same) {
    var others = pool.filter(function (x) { return x !== right; });
    var near = same ? others.filter(function (x) { return same(x); }) : [];
    var pick = M.shuffle(near, r).slice(0, n - 1);
    if (pick.length < n - 1) pick = pick.concat(M.shuffle(others.filter(function (x) { return pick.indexOf(x) < 0; }), r).slice(0, n - 1 - pick.length));
    return M.shuffle(pick.concat([right]), r);
  };

  if (typeof module !== "undefined" && module.exports) module.exports = M;
  else root.MESMaps = M;
})(this);
