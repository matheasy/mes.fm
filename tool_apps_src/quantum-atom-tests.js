/* Tests for tool_apps_src/quantum/lib-atom.js (MESQ.atom, MESQ.calc): node tool_apps_src/quantum-atom-tests.js */
"use strict";
var assert = require("assert");
var Q = require("./quantum/lib.js");
require("./quantum/lib-atom.js");
var A = Q.atom, K = Q.calc, C = Q.C;
var n = 0;
function ok(c, msg) { assert.ok(c, msg); n++; }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, (msg || "") + ": got " + a + ", want " + b + " +- " + tol); }
function rel(a, b, tol, msg) { ok(Math.abs(a / b - 1) <= tol, (msg || "") + ": got " + a + ", want " + b + " (rel " + tol + ")"); }

/* --- radial normalization and <r> for many states --- */
function integ(f, a, b, N) { var h = (b - a) / N, s = f(a) + f(b); for (var i = 1; i < N; i++) s += (i & 1 ? 4 : 2) * f(a + i * h); return s * h / 3; }
for (var nn = 1; nn <= 7; nn++) for (var l = 0; l < nn; l++) {
	var rm = A.rMax(nn);
	near(integ(function (r) { return A.P(nn, l, r); }, 0, rm, 6000), 1, 1e-6, "norm R" + nn + l);
	near(integ(function (r) { return r * A.P(nn, l, r); }, 0, rm, 6000), A.meanR(nn, l), 1e-4 * nn * nn, "<r> " + nn + l);
	near(integ(function (r) { return r * r * A.P(nn, l, r); }, 0, rm, 6000), A.meanR2(nn, l), 1e-3 * Math.pow(nn, 4), "<r2> " + nn + l);
	ok(A.radialNodes(nn, l).length === nn - l - 1, "radial node count " + nn + l);
	ok(A.nodes(nn, l).angular === l, "angular nodes");
}
/* <r> textbook values */
near(A.meanR(1, 0), 1.5, 1e-12, "1s <r> = 1.5 a0");
near(A.meanR(2, 1), 5, 1e-12, "2p <r> = 5 a0");
near(A.meanR(3, 2), 10.5, 1e-12, "3d <r> = 10.5 a0");
/* most likely radius: 1s at a0, 2p at 4 a0, 3d at 9 a0 (n^2 for l = n-1) */
near(A.mostLikely(1, 0), 1, 1e-5, "1s peak at a0");
near(A.mostLikely(2, 1), 4, 1e-4, "2p peak 4 a0");
near(A.mostLikely(3, 2), 9, 1e-4, "3d peak 9 a0");
near(A.mostLikely(4, 3), 16, 1e-3, "4f peak 16 a0");
/* 2s node at r = 2 a0, 3s nodes at (9 -+ 3 sqrt 3)/2 */
near(A.radialNodes(2, 0)[0], 2, 1e-6, "2s node");
near(A.radialNodes(3, 0)[0], (9 - 3 * Math.sqrt(3)) / 2, 1e-6, "3s node 1");
near(A.radialNodes(3, 0)[1], (9 + 3 * Math.sqrt(3)) / 2, 1e-6, "3s node 2");
/* explicit 1s value: R10(0) = 2 */
near(A.R(1, 0, 0), 2, 1e-12, "R10(0)");
near(A.R(2, 1, 1), 1 / (2 * Math.sqrt(6)) * Math.exp(-0.5), 1e-12, "R21(1)");
/* inside 1s within a0: 1 - 5 e^-2 */
near(A.inside(1, 0, 1), 1 - 5 * Math.exp(-2), 1e-6, "P(r<a0) 1s");

/* --- full 3D normalization of psi on a spherical grid, real and complex --- */
function norm3(nn, l, m, cplx) {
	var f = A.psiFn(nn, l, m, cplx), o = [0, 0], rm = A.rMax(nn), NR = 260, NT = 40, NP = 80, s = 0;
	var hr = rm / NR, ht = Math.PI / NT, hp = 2 * Math.PI / NP;
	for (var i = 0; i < NR; i++) { var r = (i + 0.5) * hr;
		for (var j = 0; j < NT; j++) { var th = (j + 0.5) * ht, st = Math.sin(th), ct = Math.cos(th);
			for (var k = 0; k < NP; k++) { var ph = (k + 0.5) * hp; f(r * st * Math.cos(ph), r * st * Math.sin(ph), r * ct, o); s += (o[0] * o[0] + o[1] * o[1]) * r * r * st; } } }
	return s * hr * ht * hp;
}
[[1, 0, 0], [2, 1, 1], [2, 1, -1], [3, 2, -2], [3, 2, 0], [4, 3, 3], [4, 3, -2]].forEach(function (s) {
	near(norm3(s[0], s[1], s[2], false), 1, 3e-3, "3D norm real " + s);
	near(norm3(s[0], s[1], s[2], true), 1, 3e-3, "3D norm complex " + s);
});
/* orientation: p_x positive on +x, p_y on +y, d_xy positive in the first quadrant, dz2 positive on the z axis */
var o = [0, 0];
ok(A.psiFn(2, 1, 1, false)(2, 0, 0, o)[0] > 0, "px + on +x");
ok(A.psiFn(2, 1, -1, false)(0, 2, 0, o)[0] > 0, "py + on +y");
ok(Math.abs(A.psiFn(2, 1, 1, false)(0, 2, 0, o)[0]) < 1e-12, "px zero on y axis");
ok(A.psiFn(3, 2, -2, false)(3, 3, 0, o)[0] > 0, "dxy + in quadrant 1");
ok(A.psiFn(3, 2, 0, false)(0, 0, 6, o)[0] > 0, "dz2 + on z");
ok(A.name(3, 2, 2, false) === "3d x²−y²", "name dx2-y2");
ok(A.name(4, 3, -2, false) === "4f xyz", "name fxyz");
/* complex m state: |psi|^2 independent of phi */
var fc = A.psiFn(3, 2, 1, true), a1 = fc(2, 0, 1, [0, 0]), a2 = fc(0, 2, 1, [0, 0]);
near(a1[0] * a1[0] + a1[1] * a1[1], a2[0] * a2[0] + a2[1] * a2[1], 1e-12, "complex m axial symmetry");
/* sampling: mean radius of samples ~ <r> */
var smp = A.sample(2, 1, 0, false, 20000, 7), sr = 0;
for (var i = 0; i < 20000; i++) sr += Math.sqrt(smp.x[i] * smp.x[i] + smp.y[i] * smp.y[i] + smp.z[i] * smp.z[i]);
near(sr / 20000, 5, 0.1, "sampled <r> 2p");
var zp = 0; for (i = 0; i < 20000; i++) if ((smp.z[i] > 0) === (smp.s[i] > 0)) zp++;
ok(zp === 20000, "2pz sign follows z");

/* --- energies and lines --- */
near(A.energy(1, 1), -13.6057, 1e-3, "E1 infinite mass");
near(A.energy(2, 1), -3.4014, 1e-3, "E2");
near(A.energy(1, 1, C.mp), -13.5984, 1e-3, "E1 reduced mass");
near(A.energy(1, 2), -54.4228, 1e-3, "He+ ground");
var ha = A.transition(3, 2, 1, C.mp);
near(ha.lamVac * 1e9, 656.47, 0.02, "H-alpha vacuum");
near(ha.lamAir * 1e9, 656.28, 0.02, "H-alpha air");
ok(ha.emit && ha.series === "Balmer" && ha.band === "visible", "H-alpha labels");
near(A.transition(4, 2, 1, C.mp).lamAir * 1e9, 486.13, 0.02, "H-beta air");
near(A.transition(5, 2, 1, C.mp).lamAir * 1e9, 434.05, 0.02, "H-gamma air");
near(A.transition(6, 2, 1, C.mp).lamAir * 1e9, 410.17, 0.02, "H-delta air");
near(A.transition(2, 1, 1, C.mp).lamVac * 1e9, 121.57, 0.02, "Lyman alpha");
near(A.transition(4, 3, 1, C.mp).lamAir * 1e9, 1875.1, 0.5, "Paschen alpha");
ok(!A.transition(1, 3).emit, "absorption flag");
near(A.seriesLimit(2, 1, C.mp) * 1e9, 364.7, 0.1, "Balmer limit");
ok(A.wavelengthRGB(656)[0] > 200 && A.wavelengthRGB(656)[2] === 0, "656 nm is red");
ok(A.wavelengthRGB(450)[2] === 255, "450 nm is blue");
ok(A.wavelengthRGB(300) === null, "UV has no colour");

/* --- calculators --- */
var p = K.parse("500 nm", ["length", "energy", "freq"]); near(p.v, 5e-7, 1e-20, "parse nm"); ok(p.dim === "length", "dim");
near(K.parse("2 eV", ["length", "energy"]).v, 2 * C.e, 1e-30, "parse eV");
near(K.parse("1e-10 m", "length").v, 1e-10, 1e-25, "parse 1e-10 m");
near(K.parse("1.5×10^-3 s", "time").v, 1.5e-3, 1e-15, "parse x10^");
near(K.parse("0.5c", "speed").v, 0.5 * C.c, 1e-6, "parse 0.5c");
near(K.parse("25 °C", "temp").v, 298.15, 1e-9, "parse C");
near(K.parse("3", "length", "nm").v, 3e-9, 1e-22, "default unit");
near(K.parse("1 Å", "length").v, 1e-10, 1e-25, "angstrom");
near(K.parse("600 THz", ["length", "freq"]).v, 6e14, 1, "THz");
ok(K.parse("5 parsecs", "length").err, "unknown unit");
ok(K.parse("abc", "length").err, "not a number");
ok(K.parse("-5 K", "temp").err, "below 0 K");
/* electron through 100 V: 0.1226 nm (relativistic correction ~5e-5) */
var db = K.deBroglie(C.me, { K: 100 * C.e }); near(db.lambda * 1e9, 0.12264, 0.0001, "electron 100 V");
near(K.deBroglie(C.me, { K: 54 * C.e }).lambda * 1e9, 0.1669, 0.0002, "Davisson-Germer 54 eV");
/* electron at 100 kV: relativistic 3.70 pm vs non-relativistic 3.88 pm */
var d100k = K.deBroglie(C.me, { K: 1e5 * C.e }); near(d100k.lambda * 1e12, 3.701, 0.005, "100 kV electron rel"); near(d100k.lambdaNR * 1e12, 3.878, 0.005, "100 kV nonrel");
/* thermal neutron 2200 m/s: 0.1798 nm */
near(K.deBroglie(C.mn, { v: 2200 }).lambda * 1e9, 0.1798, 0.0002, "thermal neutron");
ok(K.deBroglie(C.me, { v: 3e8 }).err, "faster than light refused");
/* photon */
var ph = K.photon(500e-9, "length"); near(ph.eV, 2.4797, 1e-3, "500 nm = 2.48 eV"); near(ph.f / 1e12, 599.585, 0.01, "500 nm frequency");
near(K.photon(1 * C.e, "energy").lambda * 1e9, 1239.84, 0.01, "1 eV = 1240 nm");
/* uncertainty: electron confined to 0.1 nm -> dv ~ 5.8e5 m/s */
near(K.uncertainty(1e-10, C.me).dv, 5.79e5, 0.01e5, "electron in 0.1 nm");
near(K.energyTime(1e-9).eV, 3.29e-7, 0.01e-7, "1 ns -> 0.33 ueV");
/* tunnelling: electron 1 eV, barrier 2 eV, 0.5 nm wide (kappa = 5.12 /nm) */
var tn = K.tunnel(1 * C.e, 2 * C.e, 0.5e-9, C.me);
near(tn.kappa * 1e-9, 5.123, 0.003, "kappa");
near(tn.T, 1 / (1 + 4 * Math.pow(Math.sinh(tn.kappa * 0.5e-9), 2) / 4), 1e-12, "exact T formula");
rel(tn.thick, 16 * 0.25 * Math.exp(-2 * tn.kappa * 0.5e-9), 1e-9, "thick barrier");
rel(tn.T, tn.thick, 0.05, "thick approx close for kappa a = 2.6");
ok(K.tunnel(3 * C.e, 2 * C.e, 0.5e-9, C.me).above, "above barrier flag");
near(K.tunnel(2 * C.e, 2 * C.e, 1e-10, C.me).T, 1 / (1 + C.me * 1e-20 * 2 * C.e / (2 * C.hbar * C.hbar)), 1e-12, "E = V");
/* particle in a box: electron in 1 nm box, E1 = 0.376 eV */
near(K.box(1, 1e-9, C.me) / C.e, 0.3760, 0.0005, "box E1");
var dy = K.dye(6, 0.7e-9); ok(dy.homo === 3 && dy.lumo === 4, "dye homo/lumo");
/* Bohr */
var b1 = K.bohr(1, 1, Infinity); rel(b1.r, C.a0, 1e-12, "Bohr radius = a0"); rel(b1.v, 2.18769e6, 1e-5, "v1"); near(b1.eV, -13.6057, 1e-3, "E1"); rel(b1.T, 1.5198e-16, 1e-3, "period");
rel(K.bohr(1, 2, Infinity).r, C.a0 / 2, 1e-12, "He+ radius");
/* Rydberg */
near(K.rydberg(2, 3, 1, C.mp) * 1e9, 656.47, 0.02, "Rydberg H-alpha");
var fl = K.findLines(656.3e-9, 1, C.mp, 10, 3, true); ok(fl[0].n1 === 2 && fl[0].n2 === 3, "line finder");
/* Compton */
var cp = K.compton(1e-11, Math.PI / 2); rel(cp.lc, 2.42631e-12, 1e-5, "electron Compton wavelength"); rel(cp.dl, 2.42631e-12, 1e-5, "90 deg shift");
rel(K.compton(1e-11, Math.PI).dl, 4.85262e-12, 1e-5, "180 deg");
/* blackbody: Sun ~5772 K peaks at ~502 nm; 1 m^2 at 300 K radiates 459 W */
near(K.blackbody(5772).peak * 1e9, 502.0, 0.2, "Sun Wien peak");
near(K.blackbody(300).flux, 459.3, 0.2, "300 K flux");
var pk = K.blackbody(3000).peak, mid = K.planck(pk, 3000); ok(mid > K.planck(pk * 0.95, 3000) && mid > K.planck(pk * 1.05, 3000), "Planck peak at Wien");
/* thermal de Broglie: electron at 300 K = 4.30 nm; Rb-87 at 100 nK ~ 0.59 um */
near(K.thermal(C.me, 300) * 1e9, 4.30, 0.01, "thermal electron");
near(K.thermal(86.909 * C.u, 1e-7) * 1e6, 0.585, 0.01, "thermal Rb at 100 nK");

console.log("quantum-atom-tests: " + n + " checks passed");
