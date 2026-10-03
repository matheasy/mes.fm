/* node tool_apps_src/solar-system-tests.js -- checks the astronomy layer of mes.fm/solar-system-today against known values */
const assert = require("assert");
global.Astronomy = require("../mes.fm/moon/js/astronomy.browser.min.js");
const S = require("./solar-system-today/lib.js");
const d = new Date("2026-10-03T12:00:00Z");
const s = S.snapshot(d);
// Earth ~1 AU from the Sun; distances are sensible for every planet
assert(Math.abs(s.by.earth.r - 1.0) < 0.02);
[["mercury", 0.30, 0.47], ["venus", 0.71, 0.73], ["mars", 1.38, 1.67], ["jupiter", 4.95, 5.46], ["saturn", 9.0, 10.1], ["uranus", 18.3, 20.1], ["neptune", 29.8, 30.4], ["pluto", 29.7, 49.3]]
	.forEach(([id, lo, hi]) => assert(s.by[id].r >= lo && s.by[id].r <= hi, id + " r=" + s.by[id].r));
// the Sun seen from Earth is 180 degrees from Earth as seen from the Sun, and in Libra in early October
assert(Math.abs(S.wrap(s.sunLon - s.by.earth.lon) - 180) < 1e-9);
assert.strictEqual(S.sunView(d).con, "Virgo");   // the Sun is in Virgo on 3 Oct (it enters Libra on 31 Oct)
// 2026-10-03 is the last-quarter moon (about 13:25 UTC): phase angle ~270 degrees
assert(Math.abs(s.moon.phase - 269) < 2, "moon phase " + s.moon.phase);
assert.strictEqual(S.phaseName(269), "Last Quarter");
assert(s.moon.dist > 356000 && s.moon.dist < 407000);
// Mars was in Cancer at the 2027 opposition run-up (RA ~8h35m, dec +20)
assert.strictEqual(S.view("mars", d).con, "Cancer");
// Venus is an evening planet then (elongation ~29 degrees east)
const v = S.view("venus", d); assert.strictEqual(v.vis, "evening"); assert(Math.abs(v.elong - 29) < 1);
// events: 2026 solstice and the known next eclipses
const ev = S.events(d);
assert(ev.some(e => /Lunar eclipse/.test(e.label) && e.t.getUTCFullYear() === 2027 && e.t.getUTCMonth() === 1), "lunar eclipse Feb 2027");
assert(ev.some(e => /Solar eclipse \(annular\)/.test(e.label) && e.t.getUTCMonth() === 1), "annular eclipse Feb 2027");
assert(ev.some(e => /December solstice/.test(e.label) && e.t.getUTCDate() === 21));
assert(ev.every((e, i) => i === 0 || ev[i - 1].t <= e.t), "events sorted");
// Halley: ~35 AU out near aphelion (late 2023), back inside Earth's orbit around perihelion (2061)
const h = S.halley(d); assert(h.r > 33 && h.r < 36, "halley r " + h.r);
const hp = S.halley(new Date("2061-07-28T00:00:00Z")); assert(hp.r < 3, "halley 2061 r " + hp.r);
// helpers
assert.strictEqual(S.zodiacAt(180), "Virgo"); assert.strictEqual(S.zodiacAt(10), "Pisces"); assert.strictEqual(S.zodiacAt(250), "Ophiuchus");
assert.strictEqual(S.lightTime(1), "8 min 19 s");
assert(Math.abs(S.speedKms("earth", d) - 29.8) < 0.8);
assert(Math.abs(S.precession(new Date("2100-01-01T12:00:00Z")) - 1.397) < 0.01);
// every date in a wide range still computes
for (const y of [1000, 1500, 1800, 2000, 2100, 2500, 3000]) { const x = S.snapshot(new Date(Date.UTC(y, 5, 1))); assert(isFinite(x.by.neptune.r) && isFinite(x.moon.dist)); }
console.log("solar-system tests passed");
