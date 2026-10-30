/* MES Moon Weather: pure maths for mes.fm/moon's "Moon Weather" section.
 *
 * Needs Astronomy Engine (passed in as A) only for the Sun / Earth / Moon vectors and the
 * IAU rotation model of the Moon. Everything else (selenographic coordinates, the surface
 * temperature model, sunrise / sunset searches, the colour scale) is plain maths, so this
 * file also runs in node: tool_apps_src/moon-weather-tests.js.
 *
 * Temperature model (an estimate, not a measurement):
 *   day:   T = 392 K x (1 AU / r)^0.5 x cos(i)^0.25          (radiative balance, scaled so the
 *          equator at noon matches Diviner's ~390-400 K; Williams et al. 2017, Icarus 283)
 *   night: T = Tf (1 + 0.12 (1 - t/N)) + 0.5 Tf e^(-t / 0.6)  (t, N in lunar hours since sunset /
 *          night length; Tf = 95 K x cos(lat)^0.25, at least 50 K: equatorial pre-dawn ~95 K and
 *          ~101 K at midnight, Vasavada et al. 2012, JGR 117)
 *   permanently shadowed craters: their own fixed value (Paige et al. 2010, Science 330).
 */
(function (root) {
  'use strict';
  var R = Math.PI / 180;
  var SYNODIC = 29.530589;            // days, mean synodic month = one lunar day-night cycle
  var LUNAR_HOUR = SYNODIC;            // Earth hours in one "lunar hour" (1/24 of a lunar day) = 29.53

  // Landing sites and places (selenographic, east longitude positive).
  var SITES = [
    { id: 'a11', name: 'Apollo 11 (Tranquility Base)', lat: 0.674, lon: 23.473, note: 'First crewed landing, 20 July 1969.' },
    { id: 'near', name: 'Centre of the near side', lat: 0, lon: 0, note: 'The point that faces Earth on average.' },
    { id: 'a15', name: 'Apollo 15 (Hadley Rille)', lat: 26.132, lon: 3.634, note: 'First lunar rover drive, 1971.' },
    { id: 'a17', name: 'Apollo 17 (Taurus-Littrow)', lat: 20.191, lon: 30.772, note: 'Last crewed landing, December 1972.' },
    { id: 'tycho', name: 'Tycho crater', lat: -43.31, lon: -11.36, note: 'Young bright crater with long rays.' },
    { id: 'copernicus', name: 'Copernicus crater', lat: 9.62, lon: -20.08, note: '93 km wide, about 800 million years old.' },
    { id: 'ce4', name: "Chang'e 4 (far side)", lat: -45.457, lon: 177.588, note: 'First landing on the far side, 2019. Earth is never in its sky.' },
    { id: 'far', name: 'Centre of the far side', lat: 0, lon: 180, note: 'Never sees Earth.' },
    { id: 'ch3', name: 'Chandrayaan-3 (Shiv Shakti point)', lat: -69.373, lon: 32.319, note: 'Landing closest to the south pole so far, 2023.' },
    { id: 'shackrim', name: 'Shackleton crater rim (south pole)', lat: -89.67, lon: -137.4, note: 'The Sun only skims the horizon; peaks near here are lit most of the year.' },
    { id: 'shack', name: 'Shackleton crater floor (permanent shadow)', lat: -89.67, lon: 129.78, psrK: 40,
      note: 'Never sees the Sun. Diviner measured roughly 25-60 K in south-pole cold traps; 40 K is used here.' },
    { id: 'hermite', name: 'Hermite crater floor (coldest measured)', lat: 86, lon: -89.9, psrK: 26,
      note: 'Diviner measured about 26 K (-247 °C), among the coldest places known in the Solar System.' }
  ];

  // Rough dark maria for the globe drawing: [lat, lon, angular radius in degrees].
  // Centres and sizes from the IAU / USGS gazetteer; drawn as soft round patches only.
  var MARIA = [
    [32.8, -15.6, 17], [28.0, 17.5, 10.5], [8.5, 31.4, 12], [17.0, 59.1, 8.3], [-7.8, 51.3, 11],
    [-21.3, -16.6, 10], [-15.2, 35.5, 5.5], [-24.4, -38.6, 6], [20, -55, 20], [5, -45, 14],
    [35, -40, 11], [56, 1.4, 6], [56, -25, 6], [-3, -18, 6], [27.3, 147.9, 4.5], [-19.4, -92.8, 5],
    [-10, -25, 8], [12, -10, 6]
  ];

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(v) { var l = Math.sqrt(dot(v, v)); return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function wrap180(d) { d = ((d % 360) + 360) % 360; return d > 180 ? d - 360 : d; }
  function wrap360(d) { return ((d % 360) + 360) % 360; }

  // The Moon's body frame from the IAU rotation model (pole + prime-meridian angle W).
  function moonFrame(A, t) {
    var ax = A.RotationAxis(A.Body.Moon, t);
    var n = [ax.north.x, ax.north.y, ax.north.z];
    var a0 = (ax.ra * 15 + 90) * R;          // ascending node of the Moon's equator on the ICRF equator
    var Q = [Math.cos(a0), Math.sin(a0), 0];
    return { n: n, Q: Q, y: cross(n, Q), W: ax.spin };
  }

  // Selenographic latitude / east longitude of a direction given in J2000 equatorial axes.
  function selenographic(f, v) {
    v = norm(v);
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, dot(v, f.n)))) / R,
      lon: wrap180(Math.atan2(dot(v, f.y), dot(v, f.Q)) / R - f.W)
    };
  }

  // Where the Sun and Earth are overhead on the Moon at time t.
  function state(A, t) {
    var m = A.GeoMoon(t);
    var s = A.GeoVector(A.Body.Sun, t, true);
    var f = moonFrame(A, t);
    var sun = [s.x - m.x, s.y - m.y, s.z - m.z];
    var earth = [-m.x, -m.y, -m.z];
    var ss = selenographic(f, sun), se = selenographic(f, earth);
    var rAU = Math.sqrt(dot(sun, sun));
    // Earth's phase seen from the Moon: phase angle at Earth between the Sun and the Moon.
    var cosPsi = dot(norm([s.x, s.y, s.z]), norm([m.x, m.y, m.z]));
    return {
      t: +(t.date || t), sunLat: ss.lat, sunLon: ss.lon, earthLat: se.lat, earthLon: se.lon,
      rAU: rAU, earthKm: Math.sqrt(dot(m, m)) * 149597870.7, earthFrac: (1 + cosPsi) / 2
    };
  }

  // Sine of the Sun's elevation at a site.
  function sinElev(lat, lon, sLat, sLon) {
    return Math.sin(lat * R) * Math.sin(sLat * R) +
      Math.cos(lat * R) * Math.cos(sLat * R) * Math.cos((lon - sLon) * R);
  }

  function floorK(lat) { return Math.max(50, 95 * Math.pow(Math.max(0, Math.cos(lat * R)), 0.25)); }

  // Surface temperature (K) from the Sun's position (sLat, sLon) and distance rAU.
  function tempK(lat, lon, sLat, sLon, rAU) {
    var ci = sinElev(lat, lon, sLat, sLon);
    var Tf = floorK(lat);
    var Td = ci > 0 ? 392 * Math.pow(1 / (rAU || 1), 0.5) * Math.pow(ci, 0.25) : 0;
    var x = -Math.tan(lat * R) * Math.tan(sLat * R);
    var Tn = Tf;
    if (x > -1 && x < 1) {
      var H0 = Math.acos(x);                                 // sunset hour angle
      var h = wrap360(lon - sLon) * R;                        // local hour angle, 0 = noon, east = afternoon
      if (h > H0 && h < 2 * Math.PI - H0) {
        var N = (2 * Math.PI - 2 * H0) / (2 * Math.PI) * 24;  // night length in lunar hours
        var tt = (h - H0) / (2 * Math.PI) * 24;               // lunar hours since sunset
        Tn = Tf * (1 + 0.12 * (1 - tt / N)) + 0.5 * Tf * Math.exp(-tt / 0.6);
      }
    }
    return Math.max(Td, Tn, Tf);
  }

  function siteTempK(site, st) {
    if (site.psrK) return site.psrK;
    return tempK(site.lat, site.lon, st.sunLat, st.sunLon, st.rAU);
  }

  // Lunar "time of day" at a site, 0-24 (12 = local noon), from the hour angle.
  function localHour(lon, sLon) { return wrap360(lon - sLon + 180) / 15; }

  // A series of states every stepH hours from t0 - days to t0 + days.
  function series(A, t0, days, stepH, mkTime) {
    var out = [], ms = +t0, n = Math.round(days * 24 / stepH);
    for (var i = -n; i <= n; i++) out.push(state(A, mkTime(ms + i * stepH * 3600000)));
    return out;
  }

  // Interpolate a state at time ms (longitudes unwrapped).
  function interp(ser, ms) {
    for (var i = 1; i < ser.length; i++) {
      if (ser[i].t >= ms) {
        var a = ser[i - 1], b = ser[i], f = (ms - a.t) / (b.t - a.t);
        function L(p, q) { return p + wrap180(q - p) * f; }
        return {
          t: ms, sunLat: a.sunLat + (b.sunLat - a.sunLat) * f, sunLon: wrap180(L(a.sunLon, b.sunLon)),
          earthLat: a.earthLat + (b.earthLat - a.earthLat) * f, earthLon: wrap180(L(a.earthLon, b.earthLon)),
          rAU: a.rAU + (b.rAU - a.rAU) * f, earthKm: a.earthKm + (b.earthKm - a.earthKm) * f,
          earthFrac: a.earthFrac + (b.earthFrac - a.earthFrac) * f
        };
      }
    }
    return ser[ser.length - 1];
  }

  // Next / previous sunrise and sunset at a site (ms), from a series. null if none in range.
  function sunEvents(ser, site, nowMs) {
    var res = { prevRise: null, prevSet: null, nextRise: null, nextSet: null };
    if (site.psrK) return res;
    var prev = null;
    for (var i = 0; i < ser.length; i++) {
      var s = ser[i], v = sinElev(site.lat, site.lon, s.sunLat, s.sunLon);
      if (prev && (prev.v <= 0) !== (v <= 0)) {
        var f = prev.v / (prev.v - v), tm = prev.t + (s.t - prev.t) * f;
        var key = v > 0 ? 'Rise' : 'Set';
        if (tm <= nowMs) res['prev' + key] = tm;
        else if (!res['next' + key]) res['next' + key] = tm;
      }
      prev = { t: s.t, v: v };
    }
    return res;
  }

  // Colour for a temperature in K: violet (coldest) - blue - cyan - white - yellow - red.
  var STOPS = [[20, [70, 30, 140]], [60, [48, 62, 200]], [100, [40, 140, 220]], [160, [110, 205, 225]],
    [230, [225, 240, 245]], [273, [250, 236, 160]], [320, [252, 190, 70]], [360, [240, 120, 40]], [400, [200, 40, 30]]];
  function colorK(K) {
    if (K <= STOPS[0][0]) return STOPS[0][1].slice();
    for (var i = 1; i < STOPS.length; i++) {
      if (K <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], f = (K - a[0]) / (b[0] - a[0]);
        return [0, 1, 2].map(function (j) { return Math.round(a[1][j] + (b[1][j] - a[1][j]) * f); });
      }
    }
    return STOPS[STOPS.length - 1][1].slice();
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  // How dark (0-1) the maria make a point: 0 = highland, ~1 = mare centre.
  function mareAt(lat, lon) {
    var best = 0, sl = Math.sin(lat * R), cl = Math.cos(lat * R);
    for (var i = 0; i < MARIA.length; i++) {
      var m = MARIA[i];
      var c = sl * Math.sin(m[0] * R) + cl * Math.cos(m[0] * R) * Math.cos((lon - m[1]) * R);
      var d = Math.acos(Math.max(-1, Math.min(1, c))) / R;
      if (d < m[2] * 1.25) {
        var v = d < m[2] * 0.75 ? 1 : 1 - (d - m[2] * 0.75) / (m[2] * 0.5);
        if (v > best) best = v;
      }
    }
    return best;
  }

  // Orthographic globe: view centre (lat0, lon0); x right, y up in the unit disc.
  // Returns {lat, lon} or null outside the disc.
  function unproject(x, y, lat0, lon0) {
    var r2 = x * x + y * y;
    if (r2 > 1) return null;
    var z = Math.sqrt(1 - r2);
    var a = lat0 * R, b = lon0 * R;
    var c = [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
    var e = [-Math.sin(b), Math.cos(b), 0];
    var n = [-Math.sin(a) * Math.cos(b), -Math.sin(a) * Math.sin(b), Math.cos(a)];
    var P = [x * e[0] + y * n[0] + z * c[0], x * e[1] + y * n[1] + z * c[1], x * e[2] + y * n[2] + z * c[2]];
    return { lat: Math.asin(Math.max(-1, Math.min(1, P[2]))) / R, lon: Math.atan2(P[1], P[0]) / R };
  }
  // Inverse: {x, y, front} for a point on the globe.
  function project(lat, lon, lat0, lon0) {
    var a = lat0 * R, b = lon0 * R, p = lat * R, q = lon * R;
    var P = [Math.cos(p) * Math.cos(q), Math.cos(p) * Math.sin(q), Math.sin(p)];
    var c = [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
    var e = [-Math.sin(b), Math.cos(b), 0];
    var n = [-Math.sin(a) * Math.cos(b), -Math.sin(a) * Math.sin(b), Math.cos(a)];
    return { x: dot(P, e), y: dot(P, n), front: dot(P, c) > 0 };
  }

  function kToC(K) { return K - 273.15; }
  function cToF(C) { return C * 9 / 5 + 32; }

  // Weight on the Moon: surface gravity 1.62 m/s^2 vs 9.80665 on Earth (NASA Moon fact sheet).
  var G_MOON = 1.62, G_EARTH = 9.80665;
  function moonWeight(w) { return w * G_MOON / G_EARTH; }

  var api = {
    SYNODIC: SYNODIC, LUNAR_HOUR: LUNAR_HOUR, SITES: SITES, MARIA: MARIA,
    moonFrame: moonFrame, selenographic: selenographic, state: state, sinElev: sinElev,
    floorK: floorK, tempK: tempK, siteTempK: siteTempK, localHour: localHour,
    series: series, interp: interp, sunEvents: sunEvents, colorK: colorK, rgb: rgb,
    mareAt: mareAt, unproject: unproject, project: project, kToC: kToC, cToF: cToF,
    moonWeight: moonWeight, G_MOON: G_MOON, G_EARTH: G_EARTH, wrap180: wrap180
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MESMoonWx = api;
})(this);
