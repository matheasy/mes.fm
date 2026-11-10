/* Tests for MESQ.ent (Bell / CHSH) and MESQ.sg (Stern-Gerlach). Run: node tool_apps_src/quantum-ent-tests.js */
"use strict";
var assert = require("assert");
var Q = require("./quantum/lib.js"); require("./quantum/lib-ent.js");
var E = Q.ent, G = Q.sg, D = Math.PI / 180, n = 0;
function near(a, b, tol, msg) { n++; assert.ok(Math.abs(a - b) <= tol, (msg || "") + ": " + a + " vs " + b + " (tol " + tol + ")"); }
function ok(c, msg) { n++; assert.ok(c, msg); }

/* --- correlation formulas --- */
near(E.E("ph", "q", 0, 0), 1, 1e-12, "photons same angle");
near(E.E("ph", "q", 0, 45 * D), 0, 1e-12, "photons 45");
near(E.E("ph", "q", 0, 90 * D), -1, 1e-12, "photons 90");
near(E.E("el", "q", 0, 0), -1, 1e-12, "singlet same angle anti-correlated");
near(E.E("el", "q", 0, 180 * D), 1, 1e-12, "singlet opposite");
near(E.E("el", "q", 0, 60 * D), -0.5, 1e-12, "singlet 60");
["ph", "el"].forEach(function (t) {
	near(E.Stheory(t, "q", E.optimal(t)), 2 * Math.SQRT2, 1e-12, t + " Tsirelson at optimal angles");
	near(E.Stheory(t, "bell", E.optimal(t)), 2, 1e-12, t + " Bell model reaches exactly 2 at optimal angles");
	near(E.Stheory(t, "malus", E.optimal(t)), Math.SQRT2, 1e-12, t + " Malus model gives sqrt2");
	/* joint probabilities sum to 1, marginals 1/2 for every pair of settings */
	for (var a = 0; a < 360; a += 7.5) for (var b = 0; b < 360; b += 11.25) {
		var J = E.joint(t, a * D, b * D);
		near(J[0] + J[1] + J[2] + J[3], 1, 1e-12, "sum");
		near(J[0] + J[1], 0.5, 1e-12, "Alice marginal"); near(J[0] + J[2], 0.5, 1e-12, "Bob marginal");
		ok(J.every(function (p) { return p >= -1e-15; }), "non-negative");
	}
});

/* --- local models never exceed 2: analytic correlations over a fine grid of all four settings --- */
["ph", "el"].forEach(function (t) {
	["bell", "malus"].forEach(function (m) {
		var best = 0, st = 15;
		for (var a = 0; a < 360; a += st) for (var ap = 0; ap < 360; ap += st) for (var b = 0; b < 360; b += st) for (var bp = 0; bp < 360; bp += st)
			best = Math.max(best, E.Stheory(t, m, [a * D, ap * D, b * D, bp * D]));
		ok(best <= 2 + 1e-9, t + " " + m + " max S over grid " + best);
	});
	/* the deterministic Bell model gives a CHSH sum of exactly +-2 for EVERY hidden angle, so any average is <= 2 */
	for (var trial = 0; trial < 200; trial++) {
		var r0 = Q.rng(trial + 1), set = [r0() * 6.3, r0() * 6.3, r0() * 6.3, r0() * 6.3];
		for (var lam = 0; lam < 2 * Math.PI; lam += 0.05) {
			var x = E.bellAnswers(t, set, lam), s = x.A[0] * x.B[0] - x.A[0] * x.B[1] + x.A[1] * x.B[0] + x.A[1] * x.B[1];
			ok(Math.abs(s) === 2, "per-lambda CHSH sum is +-2");
		}
	}
	/* sampled local model and its analytic E agree */
	var rr = Q.rng(99), cnt = E.newCounts();
	for (var i = 0; i < 40000; i++) { var ab = E.pair(t, "bell", 0, 30 * D, rr); E.add(cnt[0], ab[0], ab[1]); }
	near(E.cellE(cnt[0]), E.E(t, "bell", 0, 30 * D), 0.02, t + " bell sampled vs analytic");
	rr = Q.rng(98); cnt = E.newCounts();
	for (i = 0; i < 40000; i++) { ab = E.pair(t, "malus", 10 * D, 40 * D, rr); E.add(cnt[0], ab[0], ab[1]); }
	near(E.cellE(cnt[0]), E.E(t, "malus", 10 * D, 40 * D), 0.02, t + " malus sampled vs analytic");
});

/* --- sampled CHSH test --- */
["ph", "el"].forEach(function (t) {
	var res = E.chsh(t, "q", E.optimal(t), 200000, Q.rng(7)), s = E.stats(res.counts);
	near(s.S, 2 * Math.SQRT2, 4 * s.dS, t + " sampled quantum S near 2sqrt2");
	ok(s.sigma > 20, t + " clearly above 2 (" + s.sigma.toFixed(1) + " sigma)");
	near(s.dS, Math.sqrt(4 * 0.5 / 50000), 0.002, t + " error of S about sqrt(4 (1-E^2)/N)");
	/* no signalling: Bob's +1 rate is 1/2 whichever setting Alice chose */
	[0, 1].forEach(function (x) {
		near(res.marg.B[x][1] / res.marg.B[x][0], 0.5, 0.01, t + " Bob 50/50 when Alice picks " + x);
		near(res.marg.A[x][1] / res.marg.A[x][0], 0.5, 0.01, t + " Alice 50/50 for setting " + x);
	});
	["bell", "malus"].forEach(function (m) {
		var r2 = E.chsh(t, m, E.optimal(t), 100000, Q.rng(11)), s2 = E.stats(r2.counts);
		ok(s2.S <= 2 + 3 * s2.dS, t + " " + m + " sampled S stays <= 2 (" + s2.S.toFixed(3) + ")");
		[0, 1].forEach(function (x) { near(r2.marg.B[x][1] / r2.marg.B[x][0], 0.5, 0.012, t + " " + m + " marginal"); });
	});
});

/* --- Stern-Gerlach, spin 1/2 --- */
var Z = 0, X = Math.PI / 2;
for (var th = 0; th <= 360; th += 15) {
	var T = G.theory(1, "z", [{ th: th * D, pass: 0 }]);
	near(T.screen[0], Math.pow(Math.cos(th * D / 2), 2), 1e-12, "P(+) = cos^2(theta/2) at " + th);
	near(T.screen[0] + T.screen[1], 1, 1e-12, "all reach screen");
}
var t1 = G.theory(1, "oven", [{ th: Z }]);
near(t1.screen[0], 0.5, 1e-12, "oven: two equal spots"); near(t1.screen[1], 0.5, 1e-12, "oven -");
var zz = G.theory(1, "oven", [{ th: Z, pass: 0 }, { th: Z }]);
near(zz.screen[0], 0.5, 1e-12, "Z then Z: everything that passes stays +"); near(zz.screen[1], 0, 1e-12, "Z then Z: none -");
var zx = G.theory(1, "oven", [{ th: Z, pass: 0 }, { th: X }]);
near(zx.stages[1].p[0], 0.5, 1e-12, "Z then X 50/50");
var zxz = G.theory(1, "z", [{ th: X, pass: 0 }, { th: Z }]);
near(zxz.screen[1], 0.25, 1e-12, "+z beam, X filter, Z: 1/4 come out spin down");
near(zxz.screen[0] + zxz.screen[1], 0.5, 1e-12, "half get through the X filter");
var zxz3 = G.theory(1, "oven", [{ th: Z, pass: 0 }, { th: X, pass: 0 }, { th: Z }]);
near(zxz3.screen[1] / zxz3.stages[1].arrive, 0.25, 1e-12, "of atoms passing the first Z, 1/4 end spin down");
var coh = G.theory(1, "oven", [{ th: Z, pass: 0 }, { th: X, pass: "coh" }, { th: Z }]);
near(coh.screen[1], 0, 1e-12, "X recombined coherently: the down spot stays empty");
var peek = G.theory(1, "oven", [{ th: Z, pass: 0 }, { th: X, pass: "peek" }, { th: Z }]);
near(peek.screen[1] / peek.stages[1].arrive, 0.5, 1e-12, "recombined but watched: 50/50 again");
near(G.theory(1, "x", [{ th: Z }]).stages[0].vec.x, 1, 1e-12, "+x source Bloch vector");
near(t1.stages[0].vec.len, 0, 1e-12, "oven is unpolarized");
var amp = G.theory(1, "z", [{ th: 60 * D }]).stages[0].amp;
near(amp[0], Math.cos(30 * D), 1e-12, "amplitude cos(theta/2)");

/* sampled chain agrees */
function sim(j2, src, mags, N, seed) { var r = Q.rng(seed), c = [0, 0, 0], blocked = 0; for (var i = 0; i < N; i++) { var s = G.sample(j2, src, mags, r); if (s.spot >= 0) c[s.spot]++; else blocked++; } return { c: c, b: blocked, N: N }; }
var sz = sim(1, "oven", [{ th: Z, pass: 0 }, { th: X, pass: 0 }, { th: Z }], 200000, 3);
near(sz.c[1] / sz.N, 0.125, 0.004, "sampled Z-X-Z down spot"); near(sz.c[0] / sz.N, 0.125, 0.004, "sampled Z-X-Z up spot");
var sc = sim(1, "oven", [{ th: Z, pass: 0 }, { th: X, pass: "coh" }, { th: Z }], 50000, 4);
ok(sc.c[1] === 0, "sampled coherent recombination: no down atoms");
var s60 = sim(1, "z", [{ th: 60 * D }], 100000, 5);
near(s60.c[0] / s60.N, 0.75, 0.006, "sampled cos^2(30)");

/* --- spin 1: d-matrix unitarity and Z then X = 1/4, 1/2, 1/4 --- */
[0.3, 1.1, 2.0, 3.0].forEach(function (th) {
	var Dm = G.d(2, th);
	for (var i = 0; i < 3; i++) for (var k = 0; k < 3; k++) {
		var s = 0; for (var m = 0; m < 3; m++) s += Dm[m][i] * Dm[m][k];
		near(s, i === k ? 1 : 0, 1e-12, "d^1 orthonormal");
	}
	/* composition d(a) d(b) = d(a+b) */
	var A = G.d(2, th), B = G.d(2, 0.4), C = G.d(2, th + 0.4);
	for (i = 0; i < 3; i++) for (k = 0; k < 3; k++) { var t2 = 0; for (m = 0; m < 3; m++) t2 += A[i][m] * B[m][k]; near(t2, C[i][k], 1e-12, "d^1 composition"); }
});
var s1 = G.theory(2, "z", [{ th: X }]);
near(s1.screen[0], 0.25, 1e-12, "spin 1 +z then X: +1"); near(s1.screen[1], 0.5, 1e-12, "0"); near(s1.screen[2], 0.25, 1e-12, "-1");
var s1b = G.theory(2, "z", [{ th: 1.0 }]);
near(s1b.screen[0], Math.pow((1 + Math.cos(1)) / 2, 2), 1e-12, "spin 1 P(+1) = ((1+cos)/2)^2");
near(G.theory(2, "oven", [{ th: 0.7 }]).screen[1], 1 / 3, 1e-12, "spin 1 oven: three equal spots");
var s1z0 = G.theory(2, "oven", [{ th: Z, pass: 1 }, { th: X }]);
near(s1z0.stages[1].p[1], 0, 1e-12, "spin 1: m=0 along z never gives m=0 along x");
near(s1z0.stages[1].vec.len, 0, 1e-12, "m=0 has zero spin expectation");
var sim1 = sim(2, "z", [{ th: X }], 100000, 8);
near(sim1.c[1] / sim1.N, 0.5, 0.006, "sampled spin-1 middle beam");

console.log("quantum-ent tests: " + n + " checks passed");
