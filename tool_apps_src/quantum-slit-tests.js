/* Tests for MESQ.slit and MESQ.uncert (tool_apps_src/quantum/lib-slit.js): node tool_apps_src/quantum-slit-tests.js */
"use strict";
var assert = require("assert");
var Q = require("./quantum/lib.js"); require("./quantum/lib-slit.js");
var S = Q.slit, U = Q.uncert, C = Q.C, n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, (msg || "") + ": got " + a + ", expected " + b + " ± " + tol); }
function rel(a, b, tol, msg) { near(a, b, Math.abs(b) * tol, msg); }

/* ---------- de Broglie wavelengths (textbook values) ---------- */
rel(S.debroglie("electron", 5e4).lambda, 5.355e-12, 0.002, "50 keV electron λ (relativistic) = 5.36 pm");
rel(S.debroglie("electron", 100).lambda, 1.226e-10, 0.002, "100 eV electron λ = 0.123 nm");
rel(S.debroglie("photon", 1.96).lambda, 632.6e-9, 0.002, "1.96 eV photon = 633 nm");
var c60 = S.debroglie("c60", 0.18); rel(c60.v, 220, 0.03, "C60 at 0.18 eV ≈ 220 m/s"); rel(c60.lambda, 2.5e-12, 0.03, "C60 λ ≈ 2.5 pm");
rel(S.debroglie("neutron", 2.4e-4).lambda, 1.85e-9, 0.02, "cold neutron λ ≈ 1.85 nm");
rel(S.energyFor("electron", S.debroglie("electron", 1234).lambda), 1234, 1e-9, "energyFor inverts debroglie (electron)");
rel(S.energyFor("photon", 500e-9), 2.4797, 0.001, "500 nm photon = 2.48 eV");
ok(S.debroglie("electron", 3e5).v < C.c, "relativistic electron slower than light");

/* ---------- Fraunhofer pattern ---------- */
var o = { a: 1e-6, d: 4e-6, n: 2, lambda: 500e-9 };
near(S.intensity(0, o), 1, 1e-12, "centre = 1");
for (var m = 0; m < 4; m++) near(S.intensity(S.darkFringe(m, o), o), 0, 1e-12, "double-slit dark fringe " + m);
for (m = 1; m < 3; m++) near(S.intensity(S.envZero(m, o), o), 0, 1e-12, "envelope zero " + m);
near(S.intensity(S.brightFringe(1, o), o), Math.pow(S.sinc(Math.PI * o.a / o.d), 2), 1e-12, "bright fringe 1 sits on the envelope");
near(S.intensity(0.07, o), Math.pow(S.sinc(Math.PI * 1e-6 * 0.07 / 500e-9), 2) * Math.pow(Math.cos(Math.PI * 4e-6 * 0.07 / 500e-9), 2), 1e-12, "N=2 equals sinc²·cos²");
var o1 = { a: 2e-6, n: 1, lambda: 600e-9 };
near(S.intensity(0.3, o1), 0, 1e-12, "single slit zero at sinθ = λ/a"); near(S.intensity(0.6, o1), 0, 1e-12, "single slit second zero");
var o5 = { a: 0.5e-6, d: 3e-6, n: 5, lambda: 500e-9 };
near(S.intensity(500e-9 / (5 * 3e-6), o5), 0, 1e-12, "5 slits: first zero at λ/(Nd)");
near(S.intensity(500e-9 / 3e-6, o5), Math.pow(S.sinc(Math.PI * 0.5 / 3), 2), 1e-9, "5 slits: principal maximum at λ/d");
/* which-path */
near(S.visibility(0), 1, 0, "V(D=0) = 1"); near(S.visibility(1), 0, 0, "V(D=1) = 0"); near(S.visibility(0.6), 0.8, 1e-12, "V = sqrt(1-D²)");
var oW = { a: 1e-6, d: 4e-6, n: 2, lambda: 500e-9, V: 0 };
for (var s = -0.4; s <= 0.4; s += 0.013) near(S.intensity(s, oW), Math.pow(S.sinc(Math.PI * 1e-6 * s / 500e-9), 2), 1e-12, "full which-path = single-slit hump");
var oP = { a: 1e-6, d: 4e-6, n: 2, lambda: 500e-9, V: 0.8 }, sMax = S.brightFringe(0, oP), sMin = S.darkFringe(0, oP);
/* visibility measured near the centre (envelope ≈ 1) */
var Ia = S.intensity(1e-9, oP), Ib = S.intensity(sMin, oP) / Math.pow(S.sinc(Math.PI * 1e-6 * sMin / 500e-9), 2);
near((Ia - Ib) / (Ia + Ib), 0.8, 1e-9, "partial which-path: fringe visibility = V");
/* geometry */
var g = S.geometry({ a: 1e-6, d: 4e-6, lambda: 500e-9 }, 2); rel(g.fringe, 0.25, 1e-12, "fringe spacing λL/d"); near(g.perEnvelope, 8, 1e-12, "fringes per central envelope 2d/a");

/* ---------- sampler builds the pattern ---------- */
var T = S.cdf(o, 0.4, 4096), r = Q.rng(3), bins = new Float64Array(80), Nn = 200000;
for (var i = 0; i < Nn; i++) { var th = S.sample(T, r()); bins[Math.min(79, Math.floor((th + 0.4) / 0.8 * 80))]++; }
var expect = new Float64Array(80), tot = 0;
for (i = 0; i < 80; i++) { var acc = 0; for (var q = 0; q < 20; q++) acc += S.intensity(Math.sin(-0.4 + (i + (q + 0.5) / 20) * 0.01), o); expect[i] = acc; tot += acc; }
var chi = 0; for (i = 0; i < 80; i++) { var e = expect[i] / tot * Nn; if (e > 50) chi = Math.max(chi, Math.abs(bins[i] - e) / Math.sqrt(e)); }
ok(chi < 5, "sampled arrivals follow I(θ) (max deviation " + chi.toFixed(2) + " σ)");
ok(Math.abs(S.sample(T, 0.5)) < 1e-3, "median arrival at the centre");

/* ---------- 2D solver ---------- */
(function () { var r = Q.rng(11), N = 32, a = new Float64Array(N * N), b = new Float64Array(N * N); for (var i = 0; i < N * N; i++) { a[i] = r() - 0.5; b[i] = r() - 0.5; }
	var a2 = Float64Array.from(a), b2 = Float64Array.from(b), mx = 0; S.fft2(a, b, N, false); Q.fft2(a2, b2, N, N, false);
	for (i = 0; i < N * N; i++) mx = Math.max(mx, Math.abs(a[i] - a2[i]), Math.abs(b[i] - b2[i])); near(mx, 0, 1e-10, "fast fft2 = Q.fft2");
	S.fft2(a, b, N, true); Q.fft2(a2, b2, N, N, true); mx = 0; for (i = 0; i < N * N; i++) mx = Math.max(mx, Math.abs(a[i] - a2[i])); near(mx, 0, 1e-12, "fast inverse fft2 = Q.fft2"); })();
var free = new S.Sim({ n: 64, L: 64, dt: 0.5, k0: 1, wallX: -10, wallW: 1, slits: [], x0: 32, y0: 32, sx: 4, sy: 4, absorb: 0.001, eta: 0 });
near(free.norm(), 1, 1e-9, "packet normalised");
var x0 = free.meanX(); free.step(10); near(free.norm(), 1, 1e-9, "split operator conserves probability (no walls, no absorber)");
near(free.meanX() - x0, 1 * 5, 0.05, "packet moves at the group velocity ħk0/m");
/* Bohm velocity of a plane-wave-like packet near its centre = k0 */
var v = free.velocity(32 + 5, 32, [0, 0, 0]); near(v[0], 1, 0.05, "Bohm velocity ≈ k0 at the packet centre");
/* double slit: the transverse momentum distribution behind the wall is the far-field pattern: dark at ky = π/d, bright at 2π/d */
var L2 = 256, d2 = 32, a2 = 8, k2 = 2 * Math.PI / 8, cs = S.centres(2, d2, L2 / 2);
var sim = new S.Sim({ n: 256, L: L2, dt: 0.6, k0: k2, wallX: 96, wallW: 4, V0: 3, slits: cs.map(function (c) { return [c - a2 / 2, c + a2 / 2]; }), x0: 50, y0: 128, sx: 16, sy: 50, absorb: 18, eta: 1.2 });
var t0 = Date.now(); sim.step(170); var ms = (Date.now() - t0) / 170;
ok(sim.normBeyond(100) > 0.05, "some probability passes the slits (" + sim.normBeyond(100).toFixed(3) + ")");
var re = new Float64Array(256 * 256), im = new Float64Array(256 * 256);
for (var iy = 0; iy < 256; iy++) for (var ix = 0; ix < 256; ix++) { var j = iy * 256 + ix; if ((ix + 0.5) > 104) { re[j] = sim.re[j]; im[j] = sim.im[j]; } }
Q.fft2(re, im, 256, 256, false);
var ky = Q.kgrid(256, 1), marg = new Float64Array(256);
for (iy = 0; iy < 256; iy++) for (ix = 0; ix < 256; ix++) { j = iy * 256 + ix; marg[iy] += re[j] * re[j] + im[j] * im[j]; }
function at(kv) { var b = Math.round(kv / (2 * Math.PI / 256)); return marg[(b + 256) % 256]; }
var I0 = at(0), Idark = at(Math.PI / d2), Ibright = at(2 * Math.PI / d2);
ok(Idark / I0 < 0.12, "2D solver: dark fringe at sinθ = λ/2d (ratio " + (Idark / I0).toFixed(3) + ")");
var pred = Math.pow(S.sinc(Math.PI * a2 / d2), 2);
near(Ibright / I0, pred, 0.2, "2D solver: first bright fringe height ≈ Fraunhofer sinc² (" + (Ibright / I0).toFixed(3) + " vs " + pred.toFixed(3) + ")");
console.log("  (2D step 256²: " + ms.toFixed(1) + " ms)");
/* tracers */
var tr = S.tracers({ x0: 50, y0: 128, sx: 16, sy: 50 }, 200, 5); ok(tr.x.length === 200, "200 tracers");
var mx = 0; for (i = 0; i < 200; i++) mx += tr.x[i]; near(mx / 200, 50, 3, "tracers sampled from |ψ|² (mean x)");

/* ---------- uncertainty ---------- */
var G = U.grid(2048, 400);
[0.5, 1, 2, 5].forEach(function (w) {
	var st = U.stats(G, U.make(G, "gauss", w, 0));
	near(st.dx, w, 1e-6 * w + 1e-9, "Gaussian Δx = w (" + w + ")"); near(st.product, 0.5, 1e-6, "Gaussian Δx·Δp = ħ/2 (w=" + w + ")");
});
near(U.stats(G, U.make(G, "gauss", 2, 3)).product, 0.5, 1e-6, "moving Gaussian still minimum");
near(U.stats(G, U.make(G, "gauss", 2, 3)).k, 3, 1e-6, "mean momentum = k0");
var tri = U.stats(G, U.make(G, "tri", 2, 0)); near(tri.product, Math.sqrt(0.3), 0.02, "triangle (corners slightly rounded) Δx·Δk ≈ √(3/10) = 0.548");
var ptri = U.stats(G, U.make(G, "tri", 1, 1.5)), ttri = U.stats(G, U.evolve(G, ptri.phi, 20)); near(ttri.dx, U.spread(ptri.dx, ptri.dk, 20), 2e-3 * ttri.dx, "triangle spreading matches the formula (no wrap-around)");
["flat", "two", "tri"].forEach(function (sh) { ok(U.stats(G, U.make(G, sh, 2, 0)).product > 0.5 + 1e-3, sh + " packet: Δx·Δp > ħ/2"); });
/* free spreading: simulation = exact formula */
var p0 = U.make(G, "gauss", 1.2, 1.5), st0 = U.stats(G, p0);
[5, 15, 30].forEach(function (t) {
	var pt = U.evolve(G, st0.phi, t), st = U.stats(G, pt);
	near(st.dx, U.gaussSpread(1.2, t), 1e-4 * st.dx, "Gaussian spreading Δx(t) at t=" + t);
	near(st.x, 1.5 * t, 1e-4 * (1 + t), "centre moves at ħk0/m (t=" + t + ")");
	near(st.dk, st0.dk, 1e-9, "Δp is constant in free flight (t=" + t + ")");
});
var pf = U.make(G, "two", 1.5, 0), sf = U.stats(G, pf), ptf = U.stats(G, U.evolve(G, sf.phi, 12));
near(ptf.dx, U.spread(sf.dx, sf.dk, 12), 1e-4 * ptf.dx, "two humps: Δx(t)² = Δx0² + (Δp t/m)²");
rel(U.gaussSpread(2, 8), U.spread(2, 0.25, 8), 1e-12, "Gaussian formula is the general one with Δp = ħ/2Δx0");
rel(U.minDp(1e-10) / C.me, 5.79e5, 0.002, "electron confined to 0.1 nm: Δv ≥ 579 km/s");

console.log("quantum-slit-tests: " + n + " checks passed");
