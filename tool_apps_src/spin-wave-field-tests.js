/* node tool_apps_src/spin-wave-field-tests.js */
const W = require("./spin-wave-field/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
function rel(a, b, tol, m) { ok(Math.abs(a / b - 1) <= tol, m + " (got " + a + ", want " + b + " rel " + tol + ")"); }
const D = Math.PI / 180;

/* --- Huygens double slit: fringe spacing lambda L / d --- */
[[1, 5, 200], [2, 8, 300], [0.5, 3, 150], [3, 12, 400]].forEach(([lam, d, L]) => {
	const P = W.setup({ lam, d, a: lam * 0.4, slits: 2, src: "plane" });
	const sp = W.fringeSpacing(P, L, 3 * lam * L / d, 3001, 5);
	/* exact small-angle-corrected spacing of the first two orders */
	const exact = (W.brightY(2, lam, d, L) - W.brightY(-2, lam, d, L)) / 4;
	rel(sp, exact, 0.02, `two-slit fringe spacing lam=${lam} d=${d} L=${L} matches d sin th = m lam`);
});
/* small angles: spacing = lam L / d */
[[0.5, 10, 400], [1, 25, 1000]].forEach(([lam, d, L]) => { const P = W.setup({ lam, d, a: 0.3, slits: 2 }); rel(W.fringeSpacing(P, L, 4 * lam * L / d, 3001, 5), W.smallAngleSpacing(lam, d, L), 0.01, `small angles: spacing = lam L / d (lam=${lam}, d=${d})`); });
/* the bright fringe of order m sits at d sin th = m lam */
{ const lam = 2, d = 10, L = 400, P = W.setup({ lam, d, a: 0.6, slits: 2 }); const ys = W.linspace(-330, 330, 13201), mx = W.extrema(ys, W.pattern(P, L, ys), "max");
	[1, 2, 3].forEach(m => { const y = W.brightY(m, lam, d, L), best = mx.reduce((p, q) => Math.abs(q.x - y) < Math.abs(p.x - y) ? q : p); near(best.x, y, 0.015 * y, `order ${m} maximum at d sin th = ${m} lam`); }); }
/* point source on the axis gives the same fringes */
{ const P = W.setup({ lam: 2, d: 8, a: 0.8, slits: 2, src: "point", srcX: -300 }); rel(W.fringeSpacing(P, 300, 200, 3001, 5), (W.brightY(2, 2, 8, 300) - W.brightY(-2, 2, 8, 300)) / 4, 0.03, "point source: same spacing"); }

/* --- single slit minima at a sin th = m lam --- */
{ const lam = 1, a = 8, L = 800, P = W.setup({ lam, a, slits: 1, n: 160 }); const ys = W.linspace(0, 400, 8001), I = W.pattern(P, L, ys), mn = W.extrema(ys, I, "min");
	[1, 2, 3].forEach(m => { const y = W.singleMinY(m, lam, a, L), best = mn.reduce((p, q) => Math.abs(q.x - y) < Math.abs(p.x - y) ? q : p); rel(best.x, y, 0.03, `single-slit minimum ${m} at a sin th = ${m} lam`); ok(best.v < 0.02 * I[0], `single-slit minimum ${m} is nearly dark`); });
	ok(I[0] === Math.max(...I), "single slit: brightest in the middle"); }
/* the far-field formula agrees with the sum */
{ const o = { lam: 1.5, d: 6, a: 1, slits: 2 }, L = 600, P = W.setup(o), I0 = W.intensity(P, L, 0);
	[0.05, 0.12, 0.2, 0.31].forEach(th => { const y = L * Math.tan(th), r = Math.hypot(L, y); near(W.intensity(P, Math.cos(th) * r, Math.sin(th) * r) / I0, W.farField(th, o) * Math.pow((1 + Math.cos(th)) / 2, 2) * L / r, 0.01, `sum vs far-field formula at ${th} rad`); }); }

/* --- spin-1/2 flipper in one slit --- */
{ const lam = 2, d = 8, L = 400, base = { lam, d, a: 0.6, slits: 2 }, sp = lam * L / d, ys = W.linspace(-60, 60, 2401);
	const I0 = W.pattern(W.setup(base), L, ys), I360 = W.pattern(W.setup(Object.assign({ alpha: 360 * D, s: 0.5 }, base)), L, ys), I720 = W.pattern(W.setup(Object.assign({ alpha: 720 * D, s: 0.5 }, base)), L, ys);
	const Iv360 = W.pattern(W.setup(Object.assign({ alpha: 360 * D, s: 1 }, base)), L, ys), I180 = W.pattern(W.setup(Object.assign({ alpha: 180 * D, s: 0.5 }, base)), L, ys);
	const mid = 1200, mx0 = Math.max(...I0);
	ok(I0[mid] > 0.95 * mx0, "no flipper: bright in the middle");
	ok(I360[mid] < 0.01 * mx0, "spin 1/2 turned 360: dark in the middle (sign -1)");
	const m360 = W.extrema(ys, I360, "max").sort((p, q) => Math.abs(p.x) - Math.abs(q.x))[0]; near(Math.abs(m360.x), sp / 2, 0.03 * sp, "360: the nearest bright fringe moved by half a fringe");
	let dmax = 0; for (let i = 0; i < ys.length; i++) dmax = Math.max(dmax, Math.abs(I720[i] - I0[i])); ok(dmax < 1e-9 * mx0, "spin 1/2 turned 720: pattern exactly restored");
	let dv = 0; for (let i = 0; i < ys.length; i++) dv = Math.max(dv, Math.abs(Iv360[i] - I0[i])); ok(dv < 1e-9 * mx0, "a vector turned 360: pattern unchanged");
	const m180 = W.extrema(ys, I180, "max").sort((p, q) => Math.abs(p.x) - Math.abs(q.x))[0]; near(Math.abs(m180.x), sp / 4, 0.04 * sp, "180: quarter-fringe shift");
	{ const b2 = { lam: 1, d: 40, a: 0.5, slits: 2 }, L2 = 4000, sp2 = 100, y2 = W.linspace(-2 * sp2, 2 * sp2, 4001), A = W.pattern(W.setup(b2), L2, y2), B = W.pattern(W.setup(Object.assign({ alpha: 360 * D, s: 0.5 }, b2)), L2, y2);
		let s0 = 0, s3 = 0; for (let i = 0; i < y2.length; i++) { s0 += A[i]; s3 += B[i]; } rel(s3, s0, 0.02, "the flipper moves light, it does not remove it"); }
	ok([I0, I360, I720, Iv360, I180].every(a => a.every(v => v >= 0 && isFinite(v))), "intensities are never negative"); }
near(W.fringeShift(360 * D, 0.5), 0.5, 1e-12, "fringeShift: 360 spin = half a fringe"); near(Math.abs(W.fringeShift(720 * D, 0.5)), 0, 1e-12, "fringeShift: 720 spin = none");
near(Math.abs(W.fringeShift(360 * D, 1)), 0, 1e-12, "fringeShift: 360 vector = none"); near(W.fringeShift(180 * D, 0.5), 0.25, 1e-12, "fringeShift: 180 spin = quarter");
{ const a = W.spinLook(0), b = W.spinLook(2 * Math.PI), c = W.spinLook(4 * Math.PI); near(a.arrow, b.arrow, 1e-9, "arrow at 0 and 360 looks the same"); ok(a.sign === 1 && b.sign === -1 && c.sign === 1, "sign + at 0, - at 360, + at 720"); }
{ const f = W.spinFactor(2 * Math.PI, 0.5); near(f.re, -1, 1e-12, "spin factor at 360 is -1"); near(W.spinFactor(4 * Math.PI, 0.5).re, 1, 1e-12, "spin factor at 720 is +1"); }

/* --- hit sampler follows the pattern --- */
{ const I = [0, 1, 3, 0, 0]; const s = W.sampler(I, 9), n = [0, 0, 0, 0, 0]; for (let i = 0; i < 40000; i++) n[s()]++; ok(n[0] === 0 && n[3] === 0, "no hits where the intensity is zero"); near(n[2] / n[1], 3, 0.15, "hits follow the intensity"); }

/* --- camera: floor point round trip --- */
{ const cam = { yaw: 0.7, pitch: 0.55, F: 60, k: 9, cx: 400, cy: 260 }; [[3, -4], [-10, 7], [22, 1]].forEach(([x, y]) => { const p = W.project(cam, x, y, 0), q = W.unprojectFloor(cam, p.x, p.y); near(q.x, x, 1e-6, "unproject x"); near(q.y, y, 1e-6, "unproject y"); }); }

/* --- the wave equation: speed, wavelength, absorbing edges, walls --- */
{ const w = W.Wave2D(260, 60, { c: 1, sponge: 20 }); const lam = 16; w.omega = 2 * Math.PI * w.c / lam;
	w.sources = [{ cells: [30 * 260 + 40], amp: 1 }]; for (let i = 0; i < Math.round(160 / w.dt); i++) w.step();
	const row = Array.from(w.u.slice(30 * 260 + 70, 30 * 260 + 200)); const zc = []; for (let i = 1; i < row.length; i++) if (row[i - 1] <= 0 && row[i] > 0) zc.push(i - 1 + row[i - 1] / (row[i - 1] - row[i]));
	ok(zc.length >= 5, "point source makes waves"); rel((zc[zc.length - 1] - zc[0]) / (zc.length - 1), lam, 0.05, "wavelength = c / f on the grid");
	ok(w.u.every(isFinite), "solver stays finite");
	w.sources = []; const e0 = w.energy(); for (let i = 0; i < Math.round(600 / w.dt); i++) w.step(); ok(w.energy() < 0.05 * e0, "sponge edges absorb the waves (energy " + (w.energy() / e0).toFixed(4) + " left)"); }
{ const w = W.Wave2D(120, 80, { c: 1 }); W.buildWall(w, 50, [[40, 6]], 2); ok(w.wall[10 * 120 + 50] === 1 && w.wall[40 * 120 + 50] === 0, "wall with a slit"); w.omega = 0.5; w.sources = [{ cells: [40 * 120 + 30], amp: 1 }];
	for (let i = 0; i < 400; i++) w.step(); ok(w.u[10 * 120 + 50] === 0, "walls stay still"); const f = w.flux(70, 40); ok(f && f.E >= 0, "energy density is never negative"); }
{ /* steady plane wave: flux points away from the source */ const w = W.Wave2D(200, 40, { c: 1, sponge: 16, open: "left" }); w.omega = 2 * Math.PI / 14; const cells = []; for (let j = 0; j < 40; j++) cells.push(j * 200 + 24); w.sources = [{ cells, amp: 1 }];
	let sx = 0; for (let i = 0; i < Math.round(200 / w.dt); i++) { w.step(); if (i > 250) { const f = w.flux(100, 20); if (f) sx += f.Sx; } } ok(sx > 0, "energy flows away from the source");
	const pa = w.phaseAmp(20 * 200 + 100); ok(pa.amp > 0 && isFinite(pa.phi), "phase / amplitude estimate"); }

console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
