// node tool_apps_src/moon-sky-tests.js -- pure maths of the /moon "Reading the Sky" celestial sphere (mes.fm/moon/js/moon-sky-lib.js)
'use strict';
var S = require('../mes.fm/moon/js/moon-sky-lib.js');
var n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log('FAIL', m); } }
function near(a, b, t, m) { ok(Math.abs(a - b) <= t, m + ' (' + a + ' vs ' + b + ')'); }
// vectors and back
[[0, 0], [6, 30], [13.5, -45.2], [23.9, 89]].forEach(function (p) { var r = S.radec(S.vec(p[0], p[1])); near(r.ra, p[0], 1e-9, 'ra round trip'); near(r.dec, p[1], 1e-9, 'dec round trip'); });
// ecliptic: 90 deg longitude = June solstice point, Dec +23.44, RA 6h
var j = S.radec(S.eclVec(90)); near(j.dec, 23.4393, 1e-6, 'solstice dec'); near(j.ra, 6, 1e-9, 'solstice ra');
near(S.radec(S.eclVec(180)).ra, 12, 1e-9, 'September equinox RA 12h');
// camera basis orthonormal, north pole projects straight up
var c = S.cam(55, 18);
near(S.dot(c.R, c.U), 0, 1e-12, 'R.U'); near(S.dot(c.U, c.F), 0, 1e-12, 'U.F'); near(S.dot(c.R, c.R), 1, 1e-12, '|R|');
var p = S.proj([0, 0, 1], c, 100, 100, 50); near(p.x, 100, 1e-9, 'pole x centred'); ok(p.y < 100, 'pole above centre');
// the point facing the camera projects to the centre and is in front
var f = S.proj(c.F, c, 100, 100, 50); near(f.x, 100, 1e-9, 'front x'); near(f.y, 100, 1e-9, 'front y'); near(f.z, 1, 1e-12, 'front depth');
// RA increases to the right on the front of the globe (viewed from outside)
var a1 = S.proj(S.vec(3, 0), S.cam(45, 0), 0, 0, 1), a2 = S.proj(S.vec(4, 0), S.cam(45, 0), 0, 0, 1); ok(a2.x > a1.x, 'RA grows to the right');
// LST
near(S.lst(10, -123), 10 - 8.2, 1e-9, 'lst west'); near(S.lst(23, 30), 1, 1e-9, 'lst wraps');
// horizon basis: zenith at dec = latitude, N / E / Z orthonormal, east = RA LST+6h on the equator
var h = S.horizon(5, 49);
near(S.radec(h.Z).dec, 49, 1e-9, 'zenith dec'); near(S.radec(h.Z).ra, 5, 1e-9, 'zenith ra');
near(S.dot(h.N, h.Z), 0, 1e-12, 'N.Z'); near(S.dot(h.E, h.Z), 0, 1e-12, 'E.Z'); near(S.dot(h.E, h.N), 0, 1e-12, 'E.N');
near(S.radec(h.E).ra, 11, 1e-9, 'east point RA'); near(S.radec(h.E).dec, 0, 1e-9, 'east point on equator');
ok(S.radec(h.N).dec > 0, 'north point towards the pole');
// altitude: zenith 90, pole = latitude, an object on the east point rises (alt 0, az 90)
near(S.altAz(5, 49, 5, 49).alt, 90, 1e-9, 'zenith alt');
near(S.altAz(0, 90, 7.3, 49).alt, 49, 1e-9, 'pole alt = latitude');
var e = S.altAz(11, 0, 5, 49); near(e.alt, 0, 1e-9, 'east point alt'); near(e.az, 90, 1e-9, 'east point az');
var s = S.altAz(5, 0, 5, 49); near(s.alt, 41, 1e-9, 'equator on the meridian alt = 90 - lat'); near(s.az, 180, 1e-9, 'due south');
// altAz agrees with the vector picture: sin(alt) = v.Z
[[3, 20], [17, -40], [9.5, 70]].forEach(function (q) { near(Math.sin(S.altAz(q[0], q[1], 5, 49).alt * S.D), S.dot(S.vec(q[0], q[1]), h.Z), 1e-12, 'alt vs dot'); });
// hour angle
near(S.hourAngle(1, 23), 2, 1e-12, 'ha wrap'); near(S.hourAngle(10, 14), -4, 1e-12, 'ha east');
// runs split front/back
var pts = S.ring([1, 0, 0], [0, 1, 0], 72).map(function (v) { return S.proj(v, S.cam(0, 0), 0, 0, 1); });
var rr = S.runs(pts); ok(rr.length >= 2 && rr.some(function (x) { return x.front; }) && rr.some(function (x) { return !x.front; }), 'equator has front and back runs');
// labels: never overlap, stay inside, the highest priority always placed
var items = []; for (var i = 0; i < 40; i++) items.push({ x: 150 + (i % 8) * 6, y: 100 + Math.floor(i / 8) * 5, text: 'Label ' + i, size: 12, pri: 40 - i });
var L = S.placeLabels(items, 400, 300);
ok(S.overlaps(L) === 0, 'no overlapping labels'); ok(L.filter(function (x) { return x.pri === 40; })[0].placed, 'top label placed');
ok(L.every(function (x) { return !x.placed || (x.box.x0 >= 2 && x.box.x1 <= 398 && x.box.y0 >= 2 && x.box.y1 <= 298); }), 'labels inside');
var L2 = S.placeLabels([{ x: 50, y: 50, text: 'A', pri: 1 }], 400, 300, [{ x0: 0, y0: 0, x1: 400, y1: 300 }]); ok(!L2[0].placed, 'blocked area respected');
// formatting
ok(S.fmtRA(14.5) === '14h 30m 00s', 'fmtRA'); ok(S.fmtDec(-14.4) === '−14° 24′', 'fmtDec'); ok(S.fmtRA(23.99999) === '0h 00m 00s', 'fmtRA wrap');
ok(S.STARS.length >= 15, 'stars');
console.log((bad ? bad + ' FAILED of ' : 'all ') + n + ' checks' + (bad ? '' : ' passed'));
process.exit(bad ? 1 : 0);
