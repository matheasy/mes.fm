// node tool_apps_src/negative-index-tests.js  -- MES Light & Metamaterials Lab (lib.js = MESMeta)
"use strict";
const M = require("./negative-index/lib.js"); let f = 0, n = 0;
function ok(c, m) { n++; if (!c) { f++; console.log("FAIL", m); } }
function near(a, b, tol, m) { n++; const e = Math.abs(a - b); if (!(e <= tol)) { f++; console.log("FAIL", m, a, "vs", b); } }
const C = M.cx;
// 1. Snell with signed indices
near(M.snell(1, 1.5, 30), Math.asin(0.5 / 1.5) * 180 / Math.PI, 1e-12, "glass");
near(M.snell(1, -1, 30), -30, 1e-12, "n = -1 mirrors the angle: same side of the normal");
ok(M.snell(1, -1.5, 40) < 0, "any negative n gives a negative angle"); ok(M.snell(1.5, 1, 60) === null, "total internal reflection"); near(M.critical(1.5, 1), 41.8103, 1e-3, "critical angle glass");
near(M.reflectance(1, 1.5, 0), 0.04, 1e-12, "4% at normal incidence on glass"); near(M.reflectance(1.5, 1, 50), 1, 0, "TIR reflects all");
// 2. Veselago flat lens: n = -1 focuses EVERY ray at a and d - a
const fo = M.slabFoci(-1, 1, 2.5); near(fo.inside, 2, 1e-12, "inside image at 2a from the source"); near(fo.outside, 1 + 2.5 + 1.5, 1e-12, "outside image at d - a behind");
[5, 20, 40, 60, 80].forEach(d => near(M.slabMiss(-1, 1, 2.5, d), 0, 1e-9, "n = -1 has no aberration at " + d + " deg"));
ok(Math.abs(M.slabMiss(-2, 1, 2.5, 40)) > 0.05, "n = -2 blurs a steep ray"); ok(M.slabFoci(1.5, 1, 2).outside === null, "a positive slab does not focus"); ok(M.slabFoci(-1, 3, 2).outside === null, "source farther than d: no outside image");
// 3. perfect lens transfer function
[0, 0.5, 0.99, 1.5, 3, 5].forEach(q => near(C.abs(M.slabT(q, [-1, 0], [-1, 0], 0.3)), 1, 1e-6, "lossless n = -1 copies kx = " + q + " k0 exactly"));
near(C.abs(M.slabT(0.5, [1, 0], [1, 0], 0.4)), 1, 1e-9, "a vacuum 'slab' passes propagating waves"); near(C.abs(M.slabT(2, [1, 0], [1, 0], 0.4)), Math.exp(-2 * Math.PI * Math.sqrt(3) * 0.8), 1e-9, "vacuum slab: evanescent decays over the whole path 2d");
near(C.abs(M.freeT(2, 0.4)), Math.exp(-2 * Math.PI * Math.sqrt(3) * 0.4), 1e-12, "free decay");
ok(C.abs(M.slabT(4, [-1, 0.1], [-1, 0.1], 0.3)) < 0.5, "loss kills the finest detail");
const r1 = M.resolution([-1, 0.01], [-1, 0.01], 0.2), r2 = M.resolution([-1, 0.1], [-1, 0.1], 0.2); ok(r1 > r2 && r2 > 1, "less loss = finer detail, both beat the classical limit (" + r1 + ", " + r2 + ")");
// 4. Drude
const om = 0.3, wp = M.drudeWp(om, -1); near(M.drude(om, wp, 0)[0], -1, 1e-12, "Drude tuned to eps = -1"); near(M.drude(wp, wp, 0)[0], 0, 1e-12, "eps = 0 at the plasma frequency");
ok(M.drude(om, wp, 0.01)[1] > 0, "loss gives Im eps > 0"); near(M.indexFrom([-1, 1e-9], [-1, 1e-9])[0], -1, 1e-6, "eps = mu = -1 -> n = -1 (Veselago branch)");
near(M.indexFrom([2.25, 0], [1, 0])[0], 1.5, 1e-12, "glass n"); ok(Math.abs(M.indexFrom([-1, 1e-9], [1, 0])[0]) < 1e-3, "only eps negative: n is imaginary");
// 5. FDTD: stability, vacuum speed, the n = -1 flat lens focuses at the predicted places, eps-only reflects
(function () {
	const W = 300, H = 180, y0 = 90, Y = new M.Yee(W, H, { wl: 20 }); Y.material(-1, -1, 0.01); Y.paint((x) => x >= 110 && x < 170 ? { kind: 3 } : null); Y.pointSource(80, y0, 1);
	for (let i = 0; i < 4000; i++) Y.step(); let mx = 0; for (let i = 0; i < Y.Ez.length; i++) mx = Math.max(mx, Math.abs(Y.Ez[i])); ok(isFinite(mx) && mx < 50, "NIM slab run is stable (" + mx.toFixed(2) + ")");
	function peakIn(a, b) { let best = 0, at = 0; for (let x = a; x < b; x++) { const v = Y.I[y0 * W + x]; if (v > best) { best = v; at = x; } } return at; }
	near(peakIn(120, 168), 140, 6, "inner focus at a = 30 cells into the slab"); near(peakIn(175, 240), 200, 6, "outer focus at d - a = 30 cells behind");
	function width(x) { let s = 0, s2 = 0; for (let y = 40; y < 140; y++) { const v = Y.I[y * W + x]; s += v; s2 += v * (y - y0) * (y - y0); } return Math.sqrt(s2 / s); }
	ok(width(200) < 14, "image spot is narrow (" + width(200).toFixed(1) + " cells)");
	const E = new M.Yee(W, H, { wl: 20 }); E.material(-1, 1, 0.01); E.paint((x) => x >= 110 ? { kind: 2 } : null); E.pointSource(80, y0, 1); for (let i = 0; i < 2000; i++) E.step();
	let inside = 0, front = 0; for (let y = 50; y < 130; y++) { inside += E.I[y * W + 140]; front += E.I[y * W + 95]; } ok(inside < front * 0.02, "eps < 0 alone: the wave does not get in (" + (inside / front).toExponential(1) + ")");
	const V = new M.Yee(300, 140, { wl: 20, ramp: 1 }); V.pointSource(40, 70, 1); let t1 = 0; for (let i = 0; i < 600; i++) { V.step(); if (!t1 && Math.abs(V.Ez[70 * 300 + 240]) > 1e-3) t1 = V.t * V.dt; }
	near(200 / t1, 1, 0.12, "front speed in vacuum ~ c (" + (200 / t1).toFixed(3) + ")");
})();
// 6. Fraunhofer
near(M.fraunhofer(0, 0.5, 2, 6, 4), 1, 1e-12, "central max = 1"); near(M.fraunhofer(0.25, 0.5, 2, 0, 1), 0, 1e-12, "first single-slit zero at sin = lambda / a");
near(M.fraunhofer(0.5 / 6, 0.5, 2, 6, 4), Math.pow(Math.sin(Math.PI * 2 * (0.5 / 6) / 0.5) / (Math.PI * 2 * (0.5 / 6) / 0.5), 2), 1e-9, "grating order 1 = envelope value");
near(M.fraunhofer(0.5 / 24, 0.5, 2, 6, 4), 0, 1e-12, "grating zero at sin = lambda / (N d)");
const ord = M.orders(0.633, 75, 25, 6); ok(ord[3].missing && !ord[2].missing && ord[6].missing, "d = 3a: orders 3 and 6 are missing");
near(M.slitMinima(0.633, 20, 2)[0].deg, Math.asin(0.633 / 20) * 180 / Math.PI, 1e-12, "slit minima"); near(M.screenY(45, 2), 2, 1e-12, "screen position");
// 7. little helpers
near(M.malus(1, 60), 0.25, 1e-12, "Malus cos^2"); near(M.cauchyBK7(589), 1.5167, 5e-4, "BK7 n_D"); ok(M.cauchyBK7(450) > M.cauchyBK7(650), "blue slows more (normal dispersion)");
near(M.prismDeviation(1.5, 60, 48.59), 37.18, 0.02, "minimum deviation of a 60 deg n=1.5 prism"); near(M.groupSpeed(1.76e7), 17.03, 0.05, "Hau 1999: about 17 m/s");
near(M.twoSource(10, 0, 3, 1), 4, 1e-12, "on-axis constructive"); const cm = M.cloakMap(0.5, 0, 0.3, 1); near(cm[0], 0.3 + 0.5 * 0.7, 1e-12, "cloak maps r into the shell");
const cr = M.cloakRay(0.2, 0.3, 1, -3, 3, 300); let minR = 9; for (let i = 0; i < cr.length; i += 2) minR = Math.min(minR, Math.hypot(cr[i], cr[i + 1])); ok(minR >= 0.3 - 1e-9, "cloaked rays never enter the core");
near(cr[cr.length - 1], 0.2, 1e-12, "and leave on their original line");
ok(M.DIFF_PRESETS.every(p => p.a > 0 && (p.N === 1 || p.d >= p.a)), "presets valid");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
