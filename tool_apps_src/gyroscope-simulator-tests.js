/* node tool_apps_src/gyroscope-simulator-tests.js -- checks MESGyro against conservation laws and textbook results */
"use strict";
var M = require("./gyroscope-simulator/lib.js"), D = Math.PI / 180, pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (got " + a + ", want " + b + " +/- " + tol + ")"); }
function runPivot(id, tilt, rpm, start, o, T, dt) {
	var b = M.body(id), w = M.radps(rpm), pr = start === "steady" ? M.steadyPrecession(b, w, tilt * D).slow : 0, s = M.pivotState(tilt * D, 0, w, pr), mn = 9, mx = -9, azi = 0, last = 0;
	o = o || {}; var i0 = M.pivotInfo(b, s, o);
	for (var t = 0; t < T - 1e-12; t += dt) { s = M.pivotStep(b, s, o, dt); var th = M.tiltOf(s.q); mn = Math.min(mn, th); mx = Math.max(mx, th); var a = M.aziOf(s.q), da = a - last; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; azi += da; last = a; }
	return { b: b, w: w, pr: pr, s: s, i0: i0, i1: M.pivotInfo(b, s, o), mn: mn / D, mx: mx / D, azi: azi };
}

/* --- formulas --- */
var g0 = M.body("gyro"), w0 = M.radps(3000);
near(M.rpm(M.radps(1234)), 1234, 1e-9, "rpm round trip");
var sp = M.steadyPrecession(g0, w0, 60 * D);
near(M.I1p(g0) * Math.cos(60 * D) * sp.slow * sp.slow - g0.I3 * w0 * sp.slow + g0.m * 9.81 * g0.l, 0, 1e-12, "slow root solves the quadratic");
near(M.I1p(g0) * Math.cos(60 * D) * sp.fast * sp.fast - g0.I3 * w0 * sp.fast + g0.m * 9.81 * g0.l, 0, 1e-8, "fast root solves the quadratic");
near(sp.slow / M.fastTopPrecession(g0, w0), 1, 0.01, "slow root ~ m g l / L for a fast top");
near(M.steadyPrecession(g0, w0, 90 * D).slow, M.fastTopPrecession(g0, w0), 1e-12, "horizontal axis: W = m g l / (I3 w) exactly");
ok(!M.steadyPrecession(g0, M.radps(50), 30 * D).ok, "too slow: no steady precession at 30 degrees");

/* --- frictionless pivot: energy, L_z and spin conserved --- */
var r = runPivot("gyro", 60, 3000, "rest", {}, 2, 2e-4);
near((r.i1.E - r.i0.E) / Math.abs(r.i0.E), 0, 1e-7, "energy conserved (released from rest)");
near((r.i1.Lz - r.i0.Lz) / r.i0.Lmag, 0, 1e-7, "vertical angular momentum conserved");
near(r.i1.spin, r.i0.spin, 1e-6 * r.i0.spin, "spin about the axis conserved (symmetric top)");
/* cusped nutation: dips by about 2 I1p m g l sin t / L^2 below the start, never above it */
near(r.mn, 60, 1e-4, "never rises above the release tilt");
near(r.mx - 60, M.nutationDip(r.b, r.w, 60 * D) / D, 0.08 * M.nutationDip(r.b, r.w, 60 * D) / D, "nutation dip matches the fast-top formula");
near(r.azi / 2, M.fastTopPrecession(r.b, r.w), 0.05 * M.fastTopPrecession(r.b, r.w), "average precession matches m g l / L");
/* steady precession: tilt stays put and the rate matches the formula */
r = runPivot("gyro", 60, 3000, "steady", {}, 2, 2e-4);
ok(r.mx - r.mn < 0.01, "steady start: no visible nutation (" + (r.mx - r.mn) + " deg)");
near(r.azi / 2, r.pr, 1e-3 * r.pr, "steady precession rate");
r = runPivot("gyro", 130, 3000, "steady", {}, 2, 2e-4);
ok(r.mx - r.mn < 0.02, "steady precession below the pivot");
/* step size: halving dt changes the answer very little */
var ra = runPivot("gyro", 45, 1500, "rest", {}, 1, 4e-4), rb = runPivot("gyro", 45, 1500, "rest", {}, 1, 2e-4);
near(M.tiltOf(ra.s.q), M.tiltOf(rb.s.q), 1e-5, "RK4 converged in the step size");

/* --- sleeping top --- */
var tb = M.body("top"), ws = M.sleepSpin(tb);
r = runPivot("top", 1.5, M.rpm(ws) * 1.4, "rest", {}, 3, 2e-4); ok(r.mx < 3, "above the sleeping speed it stays up (max tilt " + r.mx + ")");
r = runPivot("top", 1.5, M.rpm(ws) * 0.7, "rest", {}, 3, 2e-4); ok(r.mx > 45, "below the sleeping speed it falls over (max tilt " + r.mx + ")");

/* --- friction --- */
r = runPivot("gyro", 60, 3000, "steady", { ks: 2e-5 }, 1, 2e-4);
near(r.i1.spin / r.i0.spin, Math.exp(-2e-5 * 1 / r.b.I3), 2e-3, "spin friction: spin decays as exp(-k t / I3)");
r = runPivot("gyro", 60, 3000, "steady", { kp: 5e-4 }, 3, 2e-4); ok(M.tiltOf(r.s.q) / D > 62, "precession friction lowers the axis");
ok(r.i1.E < r.i0.E, "friction loses energy");
r = runPivot("gyro", 70, 3000, "steady", { push: 6e-4 }, 3, 2e-4); ok(M.tiltOf(r.s.q) / D < 68, "hurrying the precession lifts the axis");
r = runPivot("gyrotop", 50, 6000, "steady", { kp: 1e-4, wh: [0, 0, 3] }, 4, 1e-4); ok(M.tiltOf(r.s.q) / D < 45, "turning holder + pivot friction: axis lines up with the holder's turn");
r = runPivot("gyrotop", 50, 6000, "steady", { kp: 1e-4, wh: [0, 0, -3] }, 4, 1e-4); ok(M.tiltOf(r.s.q) / D > 55, "holder turning the other way: axis turns away");
/* magnetic pull straight down at the centre of mass = more gravity: precession scales accordingly */
var b2 = M.body("gyro"), extra = 0.5, s2 = M.pivotState(90 * D, 0, w0, (b2.m * 9.81 + extra) * b2.l / (b2.I3 * w0)), mn2 = 999, mx2 = -999;
for (var t2 = 0; t2 < 1; t2 += 2e-4) { s2 = M.pivotStep(b2, s2, { mag: { F: [0, 0, -extra], d: b2.l } }, 2e-4); var th2 = M.tiltOf(s2.q) / D; mn2 = Math.min(mn2, th2); mx2 = Math.max(mx2, th2); }
ok(mx2 - mn2 < 0.01, "magnetic pull adds to gravity in the steady precession");

/* --- floor top --- */
function runFloor(id, tilt, rpm, mu, crr, T) {
	var b = M.body(id), s = M.floorState(b, tilt * D, 0, M.radps(rpm), 0), o = { mu: mu, crr: crr }, E0 = M.floorInfo(b, s, o).E, Emax = E0, hmin = 1, dt = 1e-4;
	for (var t = 0; t < T; t += dt) { s = M.floorStep(b, s, o, dt); var E = M.floorInfo(b, s, o).E; Emax = Math.max(Emax, E); var c = M.floorInfo(b, s, o).contact; hmin = Math.min(hmin, c[2]); }
	return { s: s, E0: E0, E1: M.floorInfo(b, s, o).E, Emax: Emax, tilt: M.tiltOf(s.q) / D, hmin: hmin };
}
var f = runFloor("top", 25, 2400, 0, 0, 2);
near(f.E1 / f.E0, 1, 2e-4, "floor, no friction: energy kept");
ok(f.tilt > 23 && f.tilt < 27, "floor, no friction: it does not rise (" + f.tilt + ")");
near(f.hmin, 0, 1e-5, "tip stays on the floor");
f = runFloor("top", 25, 2400, 0.3, 0.2, 5);
ok(f.tilt < 5, "sliding + rolling friction: the top rises to near vertical (" + f.tilt + ")");
ok(f.Emax <= f.E0 * (1 + 1e-5), "friction never adds energy");
var fs = runFloor("top", 25, 2400, 0.3, 0, 1), ft = runFloor("top", 25, 2400, 0.8, 0, 1);
ok(fs.tilt < 24.5 && ft.tilt < fs.tilt + 0.01, "more tip friction rises at least as fast (" + fs.tilt + " vs " + ft.tilt + ")");
f = runFloor("top", 25, 500, 0.3, 0.1, 2); ok(f.tilt > 45, "too slow: it falls (" + f.tilt + ")");
f = runFloor("tippe", 8, 1500, 0.3, 0, 5); ok(f.tilt > 150, "tippe top turns over (" + f.tilt + ")");

/* --- ice block --- */
var P = { m: 0.14, mb: 1.5, l: 0.04, I1: 6.5e-5, I3: 1.05e-4, mus: 0.03, muk: 0.024 };
function runIce(rpm, over, rest, T) {
	var p = Object.assign({}, P, over || {}), w = M.radps(rpm), s = M.iceState(p, Math.PI / 2, w, rest ? 0 : M.fastTopPrecession(p, w)), c0 = M.iceCOM(p, s), E0 = M.iceEnergy(p, s), mx = 0;
	for (var t = 0; t < T; t += 2e-4) { s = M.iceStep(p, s, 2e-4); mx = Math.max(mx, Math.hypot(s.x[0], s.x[1])); }
	var c1 = M.iceCOM(p, s); return { p: p, s: s, drift: Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), dE: (M.iceEnergy(p, s) - E0) / E0, mx: mx };
}
var wc = M.iceCriticalSpin(P);
near(M.iceForce(P, wc), P.mus * (P.mb + P.m) * 9.81, 1e-9, "critical spin: needed force = static friction");
var ic = runIce(0, { mus: 0 }, false, 0); // just the helper
ic = runIce(3000, { mus: 0 }, false, 2);
near(ic.drift, 0, 1e-9, "frictionless ice: centre of mass of everything stays still");
near(ic.dE, 0, 1e-8, "frictionless ice: energy kept");
near(ic.mx, 2 * M.iceCircle(P), 0.05 * M.iceCircle(P), "frictionless ice: block circles with radius m l / (M + m)");
ic = runIce(M.rpm(wc) * 2, {}, false, 2); near(ic.mx, 0, 1e-12, "above the critical spin the block does not move");
ic = runIce(M.rpm(wc) * 0.6, {}, false, 2); ok(ic.mx > 1e-3 && ic.s.slid > 1e-3, "below the critical spin the block slides (" + ic.mx + ")");
ok(ic.dE < 0, "sliding on ice loses energy");

console.log((fail ? "FAILED " : "ok ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
