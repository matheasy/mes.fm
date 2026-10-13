/* node tool_apps_src/time-dilation-tests.js */
const R = require("./time-dilation/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
function rel(a, b, tol, m) { ok(Math.abs(a - b) <= Math.abs(b) * tol, m + " (got " + a + ", want " + b + ", rel " + tol + ")"); }

/* gamma and beta */
near(R.gammaOf(0.6), 1.25, 1e-12, "gamma(0.6)"); near(R.gammaOf(0.8), 5 / 3, 1e-12, "gamma(0.8)");
near(R.gammaOf(0.99), 7.0888120, 1e-6, "gamma(0.99)"); near(R.gammaOf(0.9), 2.2941573, 1e-6, "gamma(0.9)");
near(R.betaOf(2), Math.sqrt(3) / 2, 1e-12, "beta(gamma 2)"); near(R.betaOf(R.gammaOf(0.123)), 0.123, 1e-12, "beta(gamma(b)) round trip");
ok(R.gammaOf(1) === Infinity, "gamma at c is infinite"); near(R.gammaOf(0), 1, 0, "gamma at rest");
/* slowdown 1 - 1/gamma, accurate for tiny speeds (ISS) */
near(R.slowdown(7660 / R.C), 0.5 * Math.pow(7660 / R.C, 2), 1e-14, "ISS slowdown ~ v^2/2c^2 = 3.26e-10");
near(R.slowdown(0.6), 0.2, 1e-12, "slowdown at 0.6c");
/* slider mapping is monotone and round-trips */
{ let prev = -1, good = true; for (let x = 0; x <= 1.0001; x += 0.05) { const b = R.fromSlider(x); if (!(b >= prev)) good = false; prev = b; } ok(good, "slider monotone");
  for (const b of [0, 0.1, 0.5, 0.9, 0.999]) near(R.fromSlider(R.toSlider(b)), b, 1e-9, "slider round trip " + b);
  near(R.gammaOf(R.fromSlider(1)), Math.cosh(R.MAXR), 1e-6 * Math.cosh(R.MAXR), "slider max gamma = cosh(MAXR)"); }
/* parsing */
near(R.parseSpeed("0.9c").beta, 0.9, 1e-12, "0.9c"); near(R.parseSpeed("90%").beta, 0.9, 1e-12, "90%"); near(R.parseSpeed(" 99.9 % ").beta, 0.999, 1e-12, "99.9 %");
near(R.parseSpeed("270000 km/s").beta, 270000000 / R.C, 1e-12, "270000 km/s"); near(R.parseSpeed("900 km/h").beta, 250 / R.C, 1e-12, "900 km/h");
near(R.parseSpeed("1,000 mph").beta, 1000 * 1609.344 / 3600 / R.C, 1e-12, "1,000 mph"); near(R.parseSpeed("gamma 10").beta, R.betaOf(10), 1e-12, "gamma 10"); near(R.parseSpeed("γ=7").gamma, 7, 1e-12, "γ=7");
near(R.parseSpeed("0.5").beta, 0.5, 1e-12, "bare 0.5 = fraction of c"); ok(R.parseSpeed("1c").error, "1c is refused"); ok(R.parseSpeed("300000 km/s").error, "above c refused"); ok(R.parseSpeed("5").error, "bare 5 needs a unit");
ok(R.parseSpeed("fast").error, "words refused"); ok(R.parseSpeed("").error, "empty"); ok(R.parseSpeed("gamma 0.5").error, "gamma below 1");
/* constant-speed round trip: 0.8c to a star 4 ly away: 10 years at home, 6 on the ship */
{ const t = R.tripConst(4, 0.8, true); near(t.tEarth, 10, 1e-12, "0.8c round trip, home years"); near(t.tShip, 6, 1e-12, "0.8c round trip, ship years"); const o = R.tripConst(4, 0.8, false); near(o.tEarth, 5, 1e-12, "one way home years"); near(o.tShip, 3, 1e-12, "one way ship years"); }
/* constant 1 g: well-known figures */
{ const p = R.trip1g(4.24, false); near(p.tShip, 3.54, 0.03, "1 g to Proxima: ship time ~3.5 yr"); near(p.tEarth, 5.87, 0.05, "1 g to Proxima: home time ~5.9 yr"); near(p.peakGamma, 1 + 0.5161 * 4.24, 0.01, "peak gamma");
  const a = R.trip1g(2.537e6, false); near(a.tShip, 28.5, 0.7, "1 g to Andromeda: ~28.5 yr on the ship"); rel(a.tEarth, 2.537e6 + 1, 1e-3, "and about 2.5 million years at home");
  const r = R.trip1g(4.24, true); near(r.tShip, 2 * p.tShip, 1e-9, "round trip doubles"); near(R.A1G, 1.0323, 1e-3, "1 g in ly/yr^2"); }
/* the interval: integrating sqrt(dt^2 - dx^2) along the worldline reproduces the ship's own time (the proper time IS the path length in spacetime) */
for (const model of [Object.assign({ kind: "const", beta: 0.9, d: 6, round: true }, R.tripConst(6, 0.9, true)), Object.assign({ kind: "g" }, R.trip1g(10, true)), Object.assign({ kind: "g" }, R.trip1g(25, false))]) {
	let sum = 0, p0 = R.tripState(model, 0); const N = 20000; for (let i = 1; i <= N; i++) { const p1 = R.tripState(model, i / N), dt = p1.t - p0.t, dx = p1.x - p0.x; sum += Math.sqrt(Math.max(0, dt * dt - dx * dx)); p0 = p1; }
	rel(sum, model.tShip, 2e-4, "interval along the worldline = ship time (" + model.kind + ", d=" + model.d + ")"); }
/* start and end of the trips */
{ const m = Object.assign({ kind: "g" }, R.trip1g(10, true)), s0 = R.tripState(m, 0), s1 = R.tripState(m, 1); near(s0.x, 0, 1e-9, "starts at home"); near(s1.x, 0, 1e-6, "back home (1 g round trip)"); near(s1.tau, m.tShip, 1e-9, "ends at the ship time");
  const mid = R.tripState(m, 0.5); near(mid.x, 10, 1e-6, "turn-around at the far end"); near(mid.beta, 0, 1e-6, "stopped there"); const fast = R.tripState(m, 0.25); near(fast.x, 5, 1e-6, "half-way out at a quarter of the trip"); near(R.gammaOf(fast.beta), m.peakGamma, 1e-6, "fastest at the half-way point of a leg"); }
{ const m = Object.assign({ kind: "const", beta: 0.8, d: 4, round: true }, R.tripConst(4, 0.8, true)), s = R.tripState(m, 0.5); near(s.x, 4, 1e-12, "const: far end half-way"); near(s.t, 5, 1e-12, "const: 5 years at home"); near(s.tau, 3, 1e-12, "const: 3 on the ship"); }
/* worldline is sorted in time and never faster than light */
{ const m = Object.assign({ kind: "g" }, R.trip1g(10, true)), w = R.worldline(m, 400); let good = true, sub = true; for (let i = 1; i < w.length; i++) { if (w[i].t < w[i - 1].t) good = false; const dt = w[i].t - w[i - 1].t, dx = Math.abs(w[i].x - w[i - 1].x); if (dx > dt + 1e-12) sub = false; } ok(good, "worldline time increases"); ok(sub, "worldline stays inside the light cone"); }
/* light clock: the zig-zag path is gamma times longer */
{ const L = R.lightClock(0.6); near(L.pathRatio, 1.25, 1e-12, "light clock path ratio"); near(L.tickRatio, 0.8, 1e-12, "light clock tick ratio"); near(Math.hypot(1, L.sideways), L.gamma, 1e-12, "Pythagoras: (c dt)^2 = (v dt)^2 + (c dtau)^2"); }
/* muons: the standard textbook numbers */
{ const m = R.muon(0.9994, 15); near(m.gamma, 28.87, 0.05, "muon gamma"); ok(m.survive > 0.4 && m.survive < 0.5, "about 45% of muons arrive with time dilation (" + m.survive + ")"); ok(m.surviveNoDilation < 0.001, "almost none without (" + m.surviveNoDilation + ")"); rel(m.lifetimeLab, 2.197e-6 * m.gamma, 1e-3, "muon lab lifetime"); }
/* kinetic energy */
rel(R.kineticEnergy(1, 0.8), (5 / 3 - 1) * R.C * R.C, 1e-12, "kinetic energy 0.8c"); ok(R.kineticEnergy(70, 0.999999) > 1e19, "energy grows without bound");
/* summary */
{ const s = R.summary(0.6, 10); near(s.shipYears, 8, 1e-12, "summary ship years"); near(s.distanceLy, 6, 1e-12, "summary distance"); near(s.slowPct, 20, 1e-9, "summary slowdown percent"); }
/* formatting */
ok(R.fmtYears(1) === "1 year", "1 year"); ok(R.fmtYears(2.5) === "2.5 years", "2.5 years"); ok(/million/.test(R.fmtYears(2.5e6)), "million"); ok(/days/.test(R.fmtYears(0.05)), "days"); ok(R.fmtYears(5e-9).indexOf("seconds") > 0, "seconds");
ok(R.fmtPct(0.9999) === "99.99%", "fmtPct " + R.fmtPct(0.9999)); ok(R.fmtPct(0.5) === "50%", "fmtPct 50"); ok(R.commas(1234567, 7) === "1,234,567", "commas " + R.commas(1234567, 7));
console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
