// Tests for mes.fm/moon/js/moon-weather-lib.js (Moon Weather section of mes.fm/moon).
// Run: node tool_apps_src/moon-weather-tests.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'mes.fm', 'moon', 'js');
const W = require(path.join(ROOT, 'moon-weather-lib.js'));
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'astronomy.browser.min.js'), 'utf8'), ctx);
const A = ctx.Astronomy, D = vm.runInContext('Date', ctx);
const T = ms => new D(ms);
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('FAIL', msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' +-' + tol + ')'); }

// 1. Full / new / first quarter: where the Sun is overhead.
const full = A.SearchMoonPhase(180, T(Date.UTC(2026, 9, 20)), 30).date;
const nw = A.SearchMoonPhase(0, T(Date.UTC(2026, 9, 30)), 30).date;
const fq = A.SearchMoonPhase(90, T(Date.UTC(2026, 10, 10)), 30).date;
let s = W.state(A, full);
near(Math.abs(W.wrap180(s.sunLon - s.earthLon)), 0, 1.5, 'full moon: Sun overhead near the sub-Earth point');
near(s.earthFrac, 0, 0.02, 'full moon: Earth is "new" from the Moon');
s = W.state(A, nw);
near(Math.abs(W.wrap180(s.sunLon - s.earthLon)), 180, 1.5, 'new moon: Sun over the far side');
near(s.earthFrac, 1, 0.02, 'new moon: full Earth');
s = W.state(A, fq);
near(W.wrap180(s.sunLon - s.earthLon), 90, 1.5, 'first quarter: Sun overhead 90 deg east of the sub-Earth point (colongitude ~0)');
ok(Math.abs(s.sunLat) < 1.6, 'subsolar latitude within 1.54 deg');

// 2. Sub-Earth point agrees with Astronomy Engine's own libration.
for (const d of [Date.UTC(2026, 0, 3), Date.UTC(2026, 4, 17, 6), Date.UTC(2027, 7, 9, 18)]) {
  const st = W.state(A, T(d)), lb = A.Libration(T(d));
  near(st.earthLat, lb.elat, 0.1, 'libration latitude ' + new Date(d).toISOString());
  near(W.wrap180(st.earthLon - lb.elon), 0, 0.1, 'libration longitude ' + new Date(d).toISOString());
}

// 3. Temperature model: equator noon ~390 K, pre-dawn ~95 K, midnight ~101 K, poles cold.
near(W.tempK(0, 0, 0, 0, 1), 392, 0.5, 'equator noon at 1 AU');
{ const k = W.tempK(0, -89, 0, 0, 1); ok(k > 95 && k < 160, 'one degree after sunrise: warming from the night low'); }
near(W.tempK(0, 180, 0, 0, 1), 100.7, 1.5, 'local midnight ~101 K');
near(W.tempK(0, 91, 0, 0, 1) > W.tempK(0, 120, 0, 0, 1) ? 1 : 0, 1, 0, 'cooling after sunset');
near(W.tempK(0, -91, 0, 0, 1), 95, 2, 'pre-dawn ~95 K');
ok(W.tempK(85, 0, 0, 0, 1) < 260, 'high latitude noon is much colder than the equator');
ok(W.tempK(0, 0, 0, 0, 0.983) > W.tempK(0, 0, 0, 0, 1.017), 'closer to the Sun = warmer');
const shack = W.SITES.find(x => x.id === 'shack');
near(W.siteTempK(shack, W.state(A, full)), 40, 0, 'permanently shadowed floor fixed');
// Range over a whole lunar day at the Apollo 11 site is about -170..+120 C.
let mn = 1e9, mx = -1e9;
for (let h = 0; h < 360; h += 2) { const k = W.tempK(0.674, 23.473, 0, 23.473 + h, 1); mn = Math.min(mn, k); mx = Math.max(mx, k); }
near(W.kToC(mx), 119, 3, 'Apollo 11 daily high in C'); near(W.kToC(mn), -178, 4, 'Apollo 11 nightly low in C');

// 4. Sunrise / sunset searches: a lunar day at the equator is ~14.8 Earth days.
const t0 = Date.UTC(2026, 9, 29, 12);
const ser = W.series(A, t0, 31, 3, T);
const a11 = W.SITES[0];
const ev = W.sunEvents(ser, a11, t0);
ok(ev.nextRise && ev.nextSet && ev.prevRise && ev.prevSet, 'Apollo 11: all four events found');
const dayLen = (ev.nextSet > ev.nextRise ? ev.nextSet - ev.nextRise : ev.nextSet - ev.prevRise) / 864e5;
near(dayLen, 14.77, 0.4, 'Apollo 11 daylight length in Earth days');
const st0 = W.interp(ser, t0), stE = W.state(A, T(t0));
near(W.wrap180(st0.sunLon - stE.sunLon), 0, 0.05, 'interpolated subsolar longitude');
// Elevation check at the found sunrise is ~0.
const sr = W.interp(ser, ev.nextRise);
near(W.sinElev(a11.lat, a11.lon, sr.sunLat, sr.sunLon), 0, 0.003, 'Sun on the horizon at sunrise');
ok(W.sunEvents(ser, shack, t0).nextRise === null, 'no sunrise in a permanent shadow');

// 5. Globe projection round trip and colours.
for (const [la, lo, la0, lo0] of [[10, 20, 0, 0], [-60, 150, -30, 170], [80, -40, 90, 0]]) {
  const p = W.project(la, lo, la0, lo0), q = W.unproject(p.x, p.y, la0, lo0);
  ok(p.front, 'point in front ' + la + ',' + lo);
  near(q.lat, la, 1e-6, 'unproject lat'); near(W.wrap180(q.lon - lo), 0, 1e-6, 'unproject lon');
}
ok(W.unproject(0.9, 0.9, 0, 0) === null, 'outside the disc');
ok(W.colorK(30)[2] > W.colorK(30)[0], 'cold is blue/violet'); ok(W.colorK(390)[0] > 180 && W.colorK(390)[2] < 80, 'hot is red');
ok(W.mareAt(32.8, -15.6) === 1 && W.mareAt(-60, 100) === 0, 'maria mask');
near(W.moonWeight(70), 11.56, 0.02, '70 kg weighs like 11.6 kg on the Moon');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
