/* MES Moon: pure maths for the interactive "Reading the Sky" celestial sphere (moon-sky.js).
 * No DOM, no Astronomy Engine: node-testable (node tool_apps_src/moon-sky-tests.js).
 * Frame: equatorial, x = towards RA 0h (March equinox), y = RA 6h, z = north celestial pole. Unit vectors.
 * The picture is an orthographic view of that sphere from outside: camera az (degrees, around the pole) and el
 * (degrees above the celestial equator). Screen x right, y down.
 */
(function (root) {
  'use strict';
  var D = Math.PI / 180, EPS = 23.4393;
  function vec(raH, decD) { var a = raH * 15 * D, d = decD * D; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; }
  function radec(v) {
    var r = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    var ra = Math.atan2(v[1], v[0]) / D / 15; if (ra < 0) ra += 24;
    return { ra: ra, dec: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / D };
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var r = Math.sqrt(dot(a, a)) || 1; return [a[0] / r, a[1] / r, a[2] / r]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  // a point on the ecliptic at ecliptic longitude lam (degrees), in the equatorial frame
  function eclVec(lamD, eps) { var l = lamD * D, e = (eps == null ? EPS : eps) * D; return [Math.cos(l), Math.cos(e) * Math.sin(l), Math.sin(e) * Math.sin(l)]; }
  // camera: F points from the sphere's centre towards the viewer
  function cam(azD, elD) {
    var a = azD * D, e = elD * D, F = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
    var U = norm(add([0, 0, 1], F, -F[2]));
    return { F: F, U: U, R: cross(U, F) };
  }
  function proj(v, c, cx, cy, r) { return { x: cx + r * dot(v, c.R), y: cy - r * dot(v, c.U), z: dot(v, c.F) }; }
  // n+1 points of the circle cos t a + sin t b (t from t0 to t1 radians)
  function ring(a, b, n, t0, t1) {
    t0 = t0 || 0; t1 = t1 == null ? 2 * Math.PI : t1;
    var out = [];
    for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n; out.push([a[0] * Math.cos(t) + b[0] * Math.sin(t), a[1] * Math.cos(t) + b[1] * Math.sin(t), a[2] * Math.cos(t) + b[2] * Math.sin(t)]); }
    return out;
  }
  function parallel(decD, n) { var out = []; for (var i = 0; i <= n; i++) out.push(vec(24 * i / n, decD)); return out; }
  function meridian(raH, d0, d1, n) { var out = []; for (var i = 0; i <= n; i++) out.push(vec(raH, d0 + (d1 - d0) * i / n)); return out; }
  // eastward arc along the celestial equator from RA 0h to raH
  function raArc(raH, n) { var out = []; for (var i = 0; i <= n; i++) out.push(vec(raH * i / n, 0)); return out; }
  function lst(gstH, lonD) { var x = (gstH + lonD / 15) % 24; return x < 0 ? x + 24 : x; }
  // the observer's sky: zenith Z (RA = local sidereal time, Dec = latitude), north / east / south points of the horizon
  function horizon(lstH, latD) {
    var Z = vec(lstH, latD), P = [0, 0, 1], N;
    if (Math.abs(latD) > 89.999) N = vec(lstH + 12, 0); else N = norm(add(P, Z, -dot(P, Z)));
    var E = cross(N, Z);
    return { Z: Z, N: N, E: E, S: [-N[0], -N[1], -N[2]], W: [-E[0], -E[1], -E[2]] };
  }
  // geometric altitude / azimuth (degrees, azimuth from north through east); no refraction
  function altAz(raH, decD, lstH, latD) {
    var H = (lstH - raH) * 15 * D, d = decD * D, p = latD * D;
    var sa = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H);
    var alt = Math.asin(Math.max(-1, Math.min(1, sa)));
    var az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H)) / D;
    if (az < 0) az += 360;
    return { alt: alt / D, az: az };
  }
  // hour angle in hours, -12..12 (negative = east of the meridian, still rising)
  function hourAngle(lstH, raH) { var h = (lstH - raH) % 24; if (h > 12) h -= 24; if (h < -12) h += 24; return h; }
  // split projected points into runs on the front (z >= 0) and back of the sphere
  function runs(pts) {
    var out = [], cur = null;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], f = p.z >= 0;
      if (!cur || cur.front !== f) { cur = { front: f, pts: cur ? [cur.pts[cur.pts.length - 1]] : [] }; out.push(cur); }
      cur.pts.push(p);
    }
    return out;
  }
  // Greedy label placement: items {x, y, text, size, pri, r (marker radius), anchors (optional)}; higher pri first.
  // blocked: rectangles {x0,y0,x1,y1} labels must avoid. Returns items with {lx, ly, anchor, w, h} or skipped (placed=false).
  function placeLabels(items, W, H, blocked) {
    var placed = (blocked || []).slice(), res = [];
    items.slice().sort(function (a, b) { return b.pri - a.pri; }).forEach(function (it) {
      var s = it.size || 12, w = it.text.length * s * 0.56 + 4, h = s * 1.25, r = (it.r || 3) + 3;
      var cand = it.anchors || [[r, -h * 0.15, 'start'], [-r, -h * 0.15, 'end'], [0, -r - h * 0.35, 'middle'], [0, r + h * 0.75, 'middle'],
        [r, -r - h * 0.3, 'start'], [-r, -r - h * 0.3, 'end'], [r, r + h * 0.6, 'start'], [-r, r + h * 0.6, 'end'],
        [r + 14, -h * 0.15, 'start'], [-r - 14, -h * 0.15, 'end'], [0, -r - h * 1.4, 'middle'], [0, r + h * 1.8, 'middle']];
      var ok = null;
      for (var i = 0; i < cand.length && !ok; i++) {
        var c = cand[i], lx = it.x + c[0], ly = it.y + c[1];
        var x0 = c[2] === 'start' ? lx : c[2] === 'end' ? lx - w : lx - w / 2, y0 = ly - h * 0.78, box = { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h };
        if (box.x0 < 2 || box.x1 > W - 2 || box.y0 < 2 || box.y1 > H - 2) continue;
        var hit = false;
        for (var j = 0; j < placed.length && !hit; j++) { var q = placed[j]; if (box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0) hit = true; }
        if (!hit) ok = { lx: lx, ly: ly, anchor: c[2], box: box };
      }
      var o = Object.assign({}, it);
      if (ok) { o.placed = true; o.lx = ok.lx; o.ly = ok.ly; o.anchor = ok.anchor; o.box = ok.box; placed.push(ok.box); }
      else o.placed = false;
      res.push(o);
    });
    return res;
  }
  function overlaps(list) {
    var b = list.filter(function (x) { return x.placed; }).map(function (x) { return x.box; }), n = 0;
    for (var i = 0; i < b.length; i++) for (var j = i + 1; j < b.length; j++) if (b[i].x0 < b[j].x1 && b[i].x1 > b[j].x0 && b[i].y0 < b[j].y1 && b[i].y1 > b[j].y0) n++;
    return n;
  }
  function fmtRA(h) { h = ((h % 24) + 24) % 24; var s = Math.round(h * 3600) % 86400; return Math.floor(s / 3600) + 'h ' + ('0' + Math.floor(s % 3600 / 60)).slice(-2) + 'm ' + ('0' + s % 60).slice(-2) + 's'; }
  function fmtDec(d) { var sg = d < 0 ? '−' : '+', a = Math.round(Math.abs(d) * 60); return sg + Math.floor(a / 60) + '° ' + ('0' + a % 60).slice(-2) + '′'; }
  // 18 bright stars, J2000 RA (hours) / Dec (degrees), visual magnitude
  var STARS = [['Sirius', 6.7525, -16.716, -1.46], ['Canopus', 6.3992, -52.696, -0.74], ['Alpha Centauri', 14.6600, -60.834, -0.27],
    ['Arcturus', 14.2610, 19.182, -0.05], ['Vega', 18.6156, 38.784, 0.03], ['Capella', 5.2782, 45.998, 0.08], ['Rigel', 5.2423, -8.202, 0.13],
    ['Procyon', 7.6550, 5.225, 0.34], ['Betelgeuse', 5.9195, 7.407, 0.5], ['Altair', 19.8464, 8.868, 0.76], ['Aldebaran', 4.5987, 16.509, 0.86],
    ['Antares', 16.4901, -26.432, 0.96], ['Spica', 13.4199, -11.161, 0.97], ['Pollux', 7.7553, 28.026, 1.14], ['Fomalhaut', 22.9608, -29.622, 1.16],
    ['Deneb', 20.6905, 45.280, 1.25], ['Regulus', 10.1395, 11.967, 1.35], ['Polaris', 2.5303, 89.264, 1.98]];
  var api = { D: D, EPS: EPS, vec: vec, radec: radec, dot: dot, cross: cross, norm: norm, eclVec: eclVec, cam: cam, proj: proj, ring: ring,
    parallel: parallel, meridian: meridian, raArc: raArc, lst: lst, horizon: horizon, altAz: altAz, hourAngle: hourAngle, runs: runs,
    placeLabels: placeLabels, overlaps: overlaps, fmtRA: fmtRA, fmtDec: fmtDec, STARS: STARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MESSky = api;
})(this);
