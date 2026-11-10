/* node tool_apps_src/quantum-tunnel-tests.js : physics checks for MESQ.tunnel (tunnelling solver, transfer matrix, wells) */
"use strict";
var assert = require("assert");
var Q = require("./quantum/lib.js"); require("./quantum/lib-tunnel.js");
var T = Q.tunnel, n = 0;
function near(a, b, tol, msg) { n++; assert.ok(Math.abs(a - b) <= tol, (msg || "") + ": " + a + " vs " + b + " (tol " + tol + ")"); }
function ok(c, msg) { n++; assert.ok(c, msg); }

/* constants */
near(T.C0, 0.0380998, 2e-6, "hbar^2/2m_e in eV nm^2");
near(T.HBAR, 0.6582120, 1e-6, "hbar in eV fs");

/* transfer matrix = closed form for a rectangular barrier, below and above the top */
[[0.1, 1, 0.5], [0.5, 1, 0.5], [0.9, 1, 1], [1.5, 1, 0.5], [3, 1, 2], [0.2, 4, 0.3], [5, 4, 0.3]].forEach(function (q) {
	var E = q[0], V = q[1], a = q[2], t1 = T.trans(E, [{ V: V, d: a }], 0, 0), t2 = T.rectT(E, V, a);
	near(t1, t2, 1e-10 * Math.max(1, 1 / t2) * t2 + 1e-14, "rect E=" + E);
});
/* thin slicing of the same barrier gives the same answer */
var sl = []; for (var i = 0; i < 50; i++) sl.push({ V: 1, d: 0.01 });
near(T.trans(0.4, sl, 0, 0), T.rectT(0.4, 1, 0.5), 1e-10, "sliced barrier");
/* step up: T = 4 k1 k2 / (k1 + k2)^2 ; below the step: 0 */
(function () { var E = 2, V = 1, k1 = Math.sqrt(E), k2 = Math.sqrt(E - V); near(T.trans(E, [], 0, V), 4 * k1 * k2 / ((k1 + k2) * (k1 + k2)), 1e-12, "step up"); near(T.trans(0.5, [], 0, 1), 0, 0, "below step"); })();
/* above a barrier T < 1 except at the transmission resonances k'a = n pi */
(function () { var V = 1, a = 2, kp = Math.PI / a, E = V + T.C0 * kp * kp; near(T.rectT(E, V, a), 1, 1e-12, "resonance"); ok(T.rectT(1.2, 1, 0.7) < 0.999, "above barrier still reflects"); })();
/* resonant tunnelling: a symmetric double barrier reaches T ~ 1 below the barrier top, while one barrier alone is far smaller */
(function () {
	var s = T.shape("double", { V: 0.6, a: 1, g: 3 }), best = 0, Eb = 0;
	for (var E = 0.005; E < 0.35; E += 0.00002) { var t = T.TofE(s, E); if (t > best) { best = t; Eb = E; } }
	ok(best > 0.99, "double-barrier resonance " + best);
	ok(T.rectT(Eb, 0.6, 1) < 0.05, "single barrier at that energy is small");
})();
/* thick barrier: T falls like exp(-2 kappa a) */
(function () { var k = T.kappa(1, 0.5), r = T.rectT(0.5, 1, 3) / T.rectT(0.5, 1, 2); near(Math.log(r), -2 * k, 0.01, "exp(-2 kappa a) per extra width"); })();

/* time-dependent solver: unitary before the absorbers act, energy conserved, transmission matches the averaged exact T */
(function () {
	var s = T.shape("rect", { V: 1, a: 0.5 }), sim = new T.Sim({ shape: s, E: 0.7, sigma: 6, N: 4096, L: 200 });
	near(sim.norm(), 1, 1e-12, "initial norm");
	near(sim.E0, 0.7 + T.C0 / (4 * 36), 2e-3, "packet energy = E + C0/(4 sigma^2)");
	near(sim.kineticFFT(), sim.E0, 0.01, "grid kinetic energy close to the continuum value");
	sim.step(200); near(sim.norm() + sim.absL + sim.absR, 1, 1e-6, "unitary + absorbed = 1");
	var mid = 0; while (sim.t < Math.abs(sim.x0) / (2 * T.C0 * sim.k0 / T.HBAR)) { sim.step(50); mid++; }
	near(sim.norm(), 1, 1e-6, "nothing absorbed yet while it hits the barrier"); near(sim.energy(), sim.E0, 1e-6, "energy conserved through the collision");
	var v = 2 * T.C0 * sim.k0 / T.HBAR, need = (Math.abs(sim.x0) + sim.xR) / v * 1.15;
	while (sim.t < need) sim.step(100);
	var st = sim.stats(), tex = T.tAvg(s, 0.7, 6);
	near(st.right, tex, 0.015, "simulated T vs exact average");
	near(st.left + st.right + st.inside, 1, 2e-3, "probability adds up");
})();
/* tiny and resonant transmissions: the simulation agrees with the exact averaged T (relative 8%) */
[["rect", { V: 5, a: 0.4 }, 1, 2.5, 4096, 86], ["rect", { V: 1, a: 1.4 }, 0.5, 2.5, 4096, 86], ["tri", { V: 3, a: 1.2 }, 1, 2.5, 4096, 86], ["double", { V: 0.6, a: 0.45, g: 2.5 }, 0.1619, 10, 4096, 272], ["well", { V: 1, a: 1.5 }, 0.25, 3, 4096, 100]].forEach(function (c) {
	var s = T.shape(c[0], c[1]), sim = new T.Sim({ shape: s, E: c[2], sigma: c[3], N: c[4], L: c[5] });
	while (sim.stats().onGrid > 0.002 && sim.t < 3000) sim.step(100);
	var a = sim.stats().right, b = T.tAvg(s, c[2], c[3], sim.xR); near(a / b, 1, 0.08, c[0] + " " + JSON.stringify(c[1]) + " sim " + a + " exact " + b);
});
/* alpha-decay model: nothing gets through the hard wall, and the nucleus empties through the Coulomb barrier */
(function () { var s = T.shape("alpha", { V: 2, a: 1.5, W: 8, Vd: 1 }), sim = new T.Sim({ shape: s, E: 1.35, sigma: 1.1, N: 4096, L: 110 }); sim.step(Math.round(200 / sim.dt)); var st = sim.stats(); ok(st.absL < 1e-3, "no leak through the wall " + st.absL); ok(st.inside < 0.8 && st.right > 0.2, "leaks out to the right"); })();
/* proton: same picture, length unit 1/sqrt(1836) nm */
near(T.lenUnit(T.MASSES.proton), 1 / Math.sqrt(1836.15267), 1e-6, "proton length unit");

/* ===== wells ===== */
var N = 1200;
(function () { // infinite well: E_n = pi^2 c n^2 / L^2
	var w = T.well("inf", { L: 1 }), r = T.solveWell(w, N, 6), E1 = Math.PI * Math.PI * T.C0;
	near(r.E[0], E1, E1 * 1e-5, "infinite well E1 = 0.376 eV");
	for (var k = 1; k < 6; k++) near(r.E[k] / r.E[0], (k + 1) * (k + 1), 2e-4 * (k + 1) * (k + 1), "E_n/E_1 = n^2 (n=" + (k + 1) + ")");
	var s = 0; for (var i = 0; i < r.N; i++) s += r.psi[2][i] * r.psi[2][i]; near(s * r.dx, 1, 1e-9, "normalised");
	var o = 0; for (i = 0; i < r.N; i++) o += r.psi[1][i] * r.psi[3][i]; near(o * r.dx, 0, 1e-8, "orthogonal");
})();
(function () { // harmonic oscillator: (n + 1/2) hbar omega
	var w = T.well("ho", { w: 0.1 }), r = T.solveWell(w, N, 10);
	for (var k = 0; k < 10; k++) near(r.E[k], (k + 0.5) * 0.1, 5e-4 * (k + 1) * 0.1, "HO level " + k);
	near(T.expX(r, 3), 0, 1e-9, "HO <x> = 0");
})();
(function () { // finite well bound-state count
	[[1, 1], [0.5, 2], [2, 0.3], [1, 5]].forEach(function (q) { var r = T.solveWell(T.well("fin", { a: q[0], V: q[1] }), N, 30); near(r.E.length, T.finCount(q[0], q[1]), 0, "finite well a=" + q[0] + " V=" + q[1]); });
	var r1 = T.solveWell(T.well("fin", { a: 1, V: 1 }), N, 30), Einf = Math.PI * Math.PI * T.C0;
	ok(r1.E[0] < Einf && r1.E[0] > 0, "finite well ground below the infinite-well value");
})();
(function () { // double well: a small positive splitting, much smaller than the gap to the next pair
	var r = T.solveWell(T.well("dw", { V: 1, b: 1 }), N, 4), d1 = r.E[1] - r.E[0], d2 = r.E[2] - r.E[1];
	ok(d1 > 0, "splitting positive " + d1); ok(d1 < 0.05 * d2, "splitting small " + d1 + " vs " + d2);
	var p = T.expX(r, 0); near(p, 0, 1e-8, "symmetric ground state");
	/* (psi0 + psi1)/sqrt2 sits in one well, and after h / dE it is back */
	var re = new Float64Array(r.N), im = new Float64Array(r.N), amps = [{ n: 0, a: Math.SQRT1_2 }, { n: 1, a: Math.SQRT1_2 }];
	function xm(t) { T.superpose(r, amps, t, re, im); var s = 0; for (var i = 0; i < r.N; i++) s += (re[i] * re[i] + im[i] * im[i]) * r.x[i]; return s * r.dx; }
	var Tt = T.H / d1; ok(xm(0) < -0.4, "starts left " + xm(0)); ok(xm(Tt / 2) > 0.4, "half a period later right"); near(xm(Tt), xm(0), 1e-6, "back after h/dE");
})();
(function () { // Morse (H2-like): analytic levels; hbar omega = 0.545 eV for D = 4.75 eV, a = 19.4 /nm, mu = m_p / 2
	var mu = T.MASSES.proton / 2, c = T.C0 / mu, w = T.well("morse", { D: 4.75, a: 19.43, re: 0.0741 }, c), r = T.solveWell(w, 3000, 6);
	for (var k = 0; k < 6; k++) near(r.E[k], T.morseE(k, 4.75, 19.43, c), 2e-3 * r.E[k], "Morse level " + k);
	near(r.E[1] - r.E[0], 0.516, 0.01, "H2-like fundamental ~0.52 eV");
})();
(function () { // quantum bouncer: E_n = (c F^2)^(1/3) |a_n|
	var w = T.well("lin", { F: 1 }), r = T.solveWell(w, 1600, 8);
	for (var k = 0; k < 8; k++) near(r.E[k], w.e1 * T.AIRY[k], 2e-4 * r.E[k] + 1e-6, "bouncer level " + k);
})();
/* Sturm count sanity */
near(T.sturm(new Float64Array([2, 2, 2]), new Float64Array([-1, -1]), 2), 1, 0, "sturm count");

console.log("quantum-tunnel-tests: " + n + " checks passed");
