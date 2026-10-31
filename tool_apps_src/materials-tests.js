/* Tests for tool_apps_src/materials/lib.js (MESMech): node tool_apps_src/materials-tests.js */
"use strict";
var M = require("./materials/lib.js"), fails = 0, n = 0, PI = Math.PI;
function ok(c, msg) { n++; if (!c) { fails++; console.log("FAIL: " + msg); } }
function near(a, b, tol, msg) { var r = Math.abs(a - b) / Math.max(Math.abs(b), 1e-300); ok(r <= tol, msg + " (got " + a + ", want " + b + ", rel " + r.toExponential(2) + ")"); }

/* units: every unit converts there and back; known factors */
Object.keys(M.UNITS).forEach(function (k) { M.UNITS[k].forEach(function (u) { near(M.fromSI(k, M.toSI(k, 3.7, u[0]), u[0]), 3.7, 1e-12, "round trip " + k + " " + u[0]); }); });
near(M.toSI("stress", 1, "psi"), 6894.757293168, 1e-10, "1 psi in Pa");
near(M.toSI("stress", 1, "ksi"), 6.894757293168e6, 1e-10, "1 ksi in Pa");
near(M.conv("stress", 29000, "ksi", "GPa"), 199.948, 1e-5, "29,000 ksi = 199.9 GPa (steel E)");
near(M.toSI("force", 1, "lbf"), 4.4482216152605, 1e-12, "1 lbf in N");
near(M.toSI("force", 1, "kip"), 4448.2216152605, 1e-12, "1 kip in N");
near(M.conv("len", 1, "ft", "in"), 12, 1e-12, "1 ft = 12 in");
near(M.conv("area", 1, "in²", "mm²"), 645.16, 1e-12, "1 in² = 645.16 mm²");
near(M.conv("torque", 1, "lbf·ft", "N·m"), 1.3558179483, 1e-9, "1 lbf·ft in N·m");
near(M.toSI("power", 1, "hp"), 745.6998716, 1e-9, "1 hp in W");
near(M.toSI("speed", 60, "rpm"), 2 * PI, 1e-12, "60 rpm = 2π rad/s");
near(M.conv("dtemp", 9, "°F", "°C"), 5, 1e-12, "a 9 °F change = 5 °C");
near(M.conv("alpha", 6.5, "µin/in·°F", "µm/m·°C"), 11.7, 1e-12, "6.5 µin/in·°F = 11.7 µm/m·°C");
near(M.conv("density", 0.284, "lb/in³", "kg/m³"), 7861.1, 1e-4, "0.284 lb/in³ (steel) in kg/m³");
near(M.conv("energy", 1, "in·lbf/in³", "J/m³"), 6894.757293168, 1e-10, "in·lbf/in³ = psi");

/* parsing */
var q = M.parseQty("50 kN", "force"); ok(q.v === 50 && q.unit === "kN", "parse 50 kN");
q = M.parseQty("10mm", "len"); ok(q.v === 10 && q.unit === "mm", "parse 10mm");
q = M.parseQty("1,234.5 lbs", "force"); ok(q.v === 1234.5 && q.unit === "lbf", "parse 1,234.5 lbs");
q = M.parseQty("2.5e-3", "strain"); ok(q.v === 0.0025 && q.unit === null, "parse 2.5e-3");
q = M.parseQty("0.2 %", "strain"); ok(q.v === 0.2 && q.unit === "%", "parse 0.2 %");
q = M.parseQty("−12,5", "len"); ok(q.v === -12.5, "decimal comma and unicode minus");
q = M.parseQty("200 GPa", "stress"); ok(q.v === 200 && q.unit === "GPa", "parse GPa");
q = M.parseQty("36 ksi", "stress"); ok(q.unit === "ksi", "parse ksi");
q = M.parseQty("30 N/mm2", "stress"); ok(q.unit === "MPa", "N/mm² is MPa");
q = M.parseQty("100 ft-lb", "torque"); ok(q.unit === "lbf·ft" && q.v === 100, "parse ft-lb");
q = M.parseQty("1500 rpm", "speed"); ok(q.unit === "rpm", "parse rpm");
q = M.parseQty("12 apples", "len"); ok(isNaN(q.v), "unknown unit is rejected");
ok(isNaN(M.parseNum("1.2.3")) && isNaN(M.parseNum("")) && M.parseNum("12,345") === 12345, "parseNum edge cases");
ok(M.sig(636.6197724) === "636.6" && M.sig(0.000636619) === "0.0006366" && M.sig(0.0000636619) === "6.366e-5" && M.sig(1) === "1" && M.sig(1234567) === "1234567", "sig formatting");
ok(M.pretty(1234567) === "1,234,567" && M.pretty(1234) === "1234" && M.pretty(-0.0000123) === "−1.23 × 10⁻⁵", "pretty formatting");

/* cross-sections */
near(M.section("round", { d: 0.01 }).A, 7.853981634e-5, 1e-10, "10 mm bar area 78.54 mm²");
near(M.section("tube", { D: 0.05, t: 0.005 }).A, PI * (0.05 * 0.05 - 0.04 * 0.04) / 4, 1e-12, "tube area");
near(M.section("rect", { b: 0.02, h: 0.01 }).I, 0.02 * Math.pow(0.01, 3) / 12, 1e-12, "rectangle: weak-axis I");
near(M.section("rtube", { B: 0.05, H: 0.05, t: 0.005 }).A, 0.05 * 0.05 - 0.04 * 0.04, 1e-12, "rectangular tube area");
ok(M.section("round", { d: 0 }).err !== "", "no diameter -> error");
near(M.sizeFor("round", {}, 7.853981634e-5).d, 0.01, 1e-9, "diameter for an area");
var tb = M.sizeFor("tube", { D: 0.05, t: 0.004 }, 0.0005); near(M.section("tube", tb).A, 0.0005, 1e-9, "tube resized to an area");
var rt = M.sizeFor("rtube", { B: 0.06, H: 0.03, t: 0.003 }, 0.0004); near(M.section("rtube", rt).A, 0.0004, 1e-9, "rectangular tube resized to an area"); near(rt.B / rt.H, 2, 1e-9, "aspect kept");

/* axial: 10 mm steel rod under 50 kN */
var A10 = M.section("round", { d: 0.01 }).A;
var r = M.axialSolve([["F", 50e3], ["A", A10], ["L", 1], ["E", 200e9]]);
near(r.v.s, 636.6197724e6, 1e-9, "sigma = 50 kN / 78.54 mm² = 636.6 MPa");
near(r.v.e, 636.6197724e6 / 200e9, 1e-9, "strain = sigma / E");
near(r.v.dL, 50e3 * 1 / (A10 * 200e9), 1e-9, "dL = F L / (A E)");
ok(r.missing.length === 0 && r.err === "", "fully solved");
/* the competitor's case: measure F, A, L, dL -> E */
r = M.axialSolve([["dL", 0.0005], ["F", 10e3], ["A", 1e-4], ["L", 1]]);
near(r.v.E, (10e3 / 1e-4) / 0.0005, 1e-12, "E from a test: 200 GPa");
/* the newest value wins: E typed earlier is worked out again */
r = M.axialSolve([["dL", 0.0005], ["F", 10e3], ["A", 1e-4], ["L", 1], ["E", 70e9]]);
ok(r.dropped.indexOf("E") >= 0 && Math.abs(r.v.E - 200e9) < 1, "older E dropped, worked out as 200 GPa");
r = M.axialSolve([["s", 100e6], ["F", 10e3], ["A", 1e-3], ["L", 2], ["E", 200e9]]);
ok(r.dropped.indexOf("A") >= 0 && Math.abs(r.v.A - 1e-4) < 1e-12, "typing sigma resizes the area");
r = M.axialSolve([["F", 10e3], ["A", 1e-4], ["E", 200e9]]);
ok(r.missing.join() === "L,dL" && r.oneMore.join() === "L,dL", "one more: L or dL");
r = M.axialSolve([["F", 10e3], ["A", 1e-4]]);
ok(r.missing.length === 4 && r.oneMore.length === 0, "two more needed");
r = M.axialSolve([["s", -100e6], ["F", 10e3], ["L", 1], ["E", 200e9]]);
ok(r.err !== "", "opposite signs of F and sigma are reported");
r = M.axialSolve([["F", -20e3], ["A", 1e-4], ["L", 1], ["E", 200e9]]);
ok(r.v.dL < 0 && r.v.s < 0 && r.err === "", "compression shortens");
near(M.euler(200e9, PI * Math.pow(0.01, 4) / 64, 1), PI * PI * 200e9 * PI * Math.pow(0.01, 4) / 64, 1e-12, "Euler load pinned ends");
near(M.euler(200e9, PI * Math.pow(0.01, 4) / 64, 1), 969.0, 1e-3, "Euler load of a 10 mm, 1 m steel rod = 969 N");

/* shear and torsion */
var sp = M.shearPin(10e3, 0.01, 2); near(sp.tau, 10e3 / (2 * A10), 1e-12, "double shear halves the stress"); near(sp.tau, 63.66e6, 1e-4, "10 kN, 10 mm pin, double shear: 63.66 MPa");
near(M.pinSize(10e3, 63.66197724e6, 2), 0.01, 1e-8, "pin size for an allowable stress");
near(M.gFrom(200e9, 0.3), 76.923e9, 1e-4, "G of steel = 76.9 GPa");
near(M.kFrom(200e9, 0.3), 166.667e9, 1e-5, "K of steel = 166.7 GPa");
var ts = M.torsion(1000, 0.05, 0, 1, 80e9);
near(ts.tau, 40.744e6, 1e-4, "50 mm shaft, 1 kN·m: tau_max = 40.74 MPa");
near(ts.J, PI * Math.pow(0.05, 4) / 32, 1e-12, "J of a solid shaft");
near(ts.theta, 1000 / (80e9 * PI * Math.pow(0.05, 4) / 32), 1e-12, "angle of twist T L / (G J)");
var th = M.torsion(1000, 0.05, 0.04, 1, 80e9); near(th.tauIn / th.tau, 0.8, 1e-12, "hollow shaft: inner stress = r_i / r_o of the outer");
near(M.shaftSize(1000, 40.744e6), 0.05, 1e-4, "shaft size for an allowable stress");
near(M.torsion(1000, M.shaftSize(1000, 50e6, 0.8), M.shaftSize(1000, 50e6, 0.8) * 0.8, 1, 80e9).tau, 50e6, 1e-9, "hollow shaft size gives the allowable stress");
near(M.torqueFromPower(10e3, M.toSI("speed", 1500, "rpm")), 63.662, 1e-4, "10 kW at 1500 rpm = 63.66 N·m");
/* elastic constants */
var ec = M.elastic("E,nu", 200e9, 0.3); near(ec.G, 76.923e9, 1e-4, "E,ν -> G"); near(ec.lam, 115.385e9, 1e-4, "λ of steel"); near(ec.M, ec.lam + 2 * ec.G, 1e-12, "M = λ + 2G");
near(M.elastic("E,G", 200e9, ec.G).nu, 0.3, 1e-9, "E,G -> ν");
near(M.elastic("E,K", 200e9, ec.K).nu, 0.3, 1e-9, "E,K -> ν");
var gk = M.elastic("G,K", ec.G, ec.K); near(gk.E, 200e9, 1e-9, "G,K -> E"); near(gk.nu, 0.3, 1e-9, "G,K -> ν");
near(M.elastic("G,nu", ec.G, 0.3).E, 200e9, 1e-9, "G,ν -> E"); near(M.elastic("K,nu", ec.K, 0.3).E, 200e9, 1e-9, "K,ν -> E");
ok(M.elastic("E,G", 200e9, 50e9).err !== "", "G below E/3 is impossible (ν > 0.5)");
/* 3D Hooke */
var hk = M.hooke([100e6, 0, 0, 0, 0, 0], 200e9, 0.3); near(hk.eps[0], 5e-4, 1e-12, "uniaxial εx"); near(hk.eps[1], -1.5e-4, 1e-12, "lateral = −ν εx");
var hs = [80e6, -30e6, 20e6, 15e6, -5e6, 10e6], hh = M.hooke(hs, 70e9, 0.33), back = M.hookeInv(hh.eps, 70e9, 0.33);
hs.forEach(function (v, i) { near(back.sig[i], v, 1e-9, "Hooke inverse component " + i); });
near(hh.vol, (1 - 2 * 0.33) * (80e6 - 30e6 + 20e6) / 70e9, 1e-12, "volume strain = (1 − 2ν)(σx+σy+σz)/E");
var pb = M.poissonBar(0.001, 0.3, 0.02, 1); near(pb.dd, -6e-6, 1e-9, "diameter change −ν ε d"); near(pb.volLin, 0.0004, 1e-12, "ΔV/V ≈ ε(1 − 2ν)"); near(pb.vol, 0.0004, 2e-3, "exact ΔV/V close to linear");
/* thermal */
var t1 = M.thermal(12e-6, 50, 1, 200e9, "free"); near(t1.free, 0.0006, 1e-12, "steel bar, +50 °C, 1 m: 0.6 mm");
var t2 = M.thermal(12e-6, 50, 1, 200e9, "held"); near(t2.sigma, -120e6, 1e-12, "held between walls: −120 MPa");
var t3 = M.thermal(12e-6, 50, 1, 200e9, "gap", 0.0002); near(t3.sigma, -80e6, 1e-9, "0.2 mm gap: −80 MPa"); near(t3.dTclose, 16.6667, 1e-5, "gap closes after 16.7 °C");
var t4 = M.thermal(12e-6, 10, 1, 200e9, "gap", 0.0002); ok(t4.sigma === 0 && Math.abs(t4.gapLeft - 0.00008) < 1e-12, "gap not closed: no stress");
var t5 = M.thermal(12e-6, -40, 1, 200e9, "held"); ok(t5.sigma > 0, "cooled between walls: tension");
/* resilience */
near(M.resilience(250e6, 200e9), 156250, 1e-12, "resilience A36 = σy²/2E = 0.156 MJ/m³");

/* materials data */
ok(M.MATS.length >= 30, "about 30 materials");
var ids = {}; M.MATS.forEach(function (m) { ok(!ids[m.id], "unique id " + m.id); ids[m.id] = 1; ok(m.E > 0 && m.G > 0 && m.nu > -1 && m.nu < 0.5 && m.su > 0 && m.rho > 0, "sane values " + m.id); ok(!m.sy || m.sy <= m.su, "yield <= UTS " + m.id);
	if (!m.aniso) near(m.G, M.gFrom(m.E, m.nu), 0.05, "isotropic " + m.id + ": G close to E / 2(1+ν)"); });

/* the stress-strain model hits its own inputs */
M.MATS.forEach(function (m) {
	var c = M.curve(m), r = M.measure(c), E = m.E * 1e9, i;
	var mono = true, fin = true; for (i = 1; i < c.e.length; i++) if (!(c.e[i] >= c.e[i - 1])) mono = false; for (i = 0; i < c.e.length; i++) if (!isFinite(c.s[i]) || !isFinite(c.t[i]) || !isFinite(c.et[i])) fin = false;
	ok(mono, m.id + ": strain never goes backwards"); ok(fin, m.id + ": all points finite");
	near(r.E, E, 0.04, m.id + ": slope of the start = E");
	near(r.uts, m.su * 1e6, 0.005, m.id + ": highest stress = UTS");
	var ef = m.el != null ? m.el / 100 : m.su / m.E / 1e3; near(r.ef, ef, 0.005, m.id + ": breaks at the elongation at break");
	if (c.yieldKind === "offset" || c.yieldKind === "luders") near(r.offset.s, m.sy * 1e6, 0.01, m.id + ": 0.2% offset yield");
	if (c.yieldKind === "peak") near(r.peak.s, m.sy * 1e6, 0.01, m.id + ": yield peak");
	ok(c.tough > 0, m.id + ": toughness > 0");
	if (c.sy && c.type !== "polymer") near(c.res, (m.sy * 1e6) * (m.sy * 1e6) / (2 * E), 1e-12, m.id + ": resilience");
});
/* necking (Considere) for the Hollomon-law metals: true plastic strain at the top = n (1 − σ/E) ≈ n */
["s4140", "ss304", "al6061", "cu", "in718"].forEach(function (id) {
	var c = M.curve(M.mat(id)), ep = c.etu - c.su * (1 + c.eu) / c.E;
	near(ep, c.n * (1 - c.su * (1 + c.eu) / c.E), 1e-6, id + ": necking at true plastic strain n(1 − σ/E)");
	near(ep, c.n, 0.01, id + ": necking at true strain ≈ n");
	near(c.su * (1 + c.eu), c.K * Math.pow(c.n, c.n) * Math.pow(1 - c.su * (1 + c.eu) / c.E, c.n), 1e-6, id + ": Hollomon K, n reproduce the true UTS");
});
var a36 = M.curve(M.mat("a36")); near(a36.suy, 1.07 * 250e6, 1e-12, "A36 upper yield 7% above the lower yield");
(function () {   /* the yield point drawn as a real test records it (2026-10-29) */
	var i, top = 0, it = 0, sum = 0, n = 0, dev = 0; for (i = 0; i < a36.e.length; i++) if (a36.s[i] > top && a36.e[i] < a36.eL) { top = a36.s[i]; it = i; }
	near(top, a36.suy, 1e-9, "A36 highest stress before the plateau = upper yield");
	ok(a36.eyu > a36.suy / a36.E * 1.02, "A36: the elastic line bends into a rounded peak (peak strain past σuy/E)");
	ok(M.stressAt(a36, a36.suy / a36.E) < a36.suy * 0.999, "A36: below the straight line just before the peak");
	var sl = (a36.s[it] - a36.s[it - 1]) / (a36.e[it] - a36.e[it - 1]); ok(sl < 0.1 * a36.E, "A36: the slope at the top of the peak is nearly zero (rounded, not a sharp corner)");
	for (i = 0; i < a36.e.length; i++) if (a36.ph[i] === "lud") { sum += a36.s[i]; n++; dev = Math.max(dev, Math.abs(a36.s[i] / 250e6 - 1)); }
	near(sum / n, 250e6, 0.002, "A36 Lüders plateau averages the lower yield"); ok(dev > 0.001 && dev <= 0.0041, "A36 plateau serrations are small (±0.4%)");
	ok(a36.eL >= 0.01 && a36.eL <= 0.03, "A36 Lüders strain 1 to 3%");
	ok(a36.emax > 0.13 && a36.emax < 0.21 && a36.smax / 6894757.29 > 57 && a36.smax / 6894757.29 < 81, "A36 UTS 58 to 80 ksi at about 15 to 20% strain");
	var flat = M.curve(M.mat("a36"), { ser: false }); near(M.stressAt(flat, 0.01), 250e6, 1e-9, "A36 without serrations: plateau exactly at the lower yield");
	var al = M.curve(M.mat("al2014")); ok(al.yieldKind === "offset" && !al.suy, "aluminium 2014-T6 yields continuously (no yield point), 0.2% offset");
	var dmax = 0; for (i = 1; i < al.s.length && al.e[i] < al.eu; i++) if (al.s[i] < al.s[i - 1] - 1) dmax = 1; ok(!dmax, "aluminium 2014-T6: stress rises without a drop up to the UTS");
})();
ok(a36.eu > a36.eL && a36.eu < a36.ef, "A36 necks between the plateau and the break");
var gl = M.curve(M.mat("glass")); near(M.stressAt(gl, gl.ef / 2), 22.5e6, 1e-9, "glass is linear to the break");
ok(M.curve(M.mat("mg")).noNeck && M.curve(M.mat("bone")).noNeck, "low-elongation metals break at the top of the curve");
var rb = M.curve(M.mat("rubber")); ok(rb.elastic && M.permanentSet(rb, 2, 5e6) === 0, "rubber comes back fully");
near(M.permanentSet(a36, 0.1, 380e6), 0.1 - 380e6 / 200e9, 1e-12, "unloading with slope E leaves e − s/E");
var cu = M.curve(M.mat("cu")); near(M.stressAt(cu, cu.eu), cu.su, 1e-9, "stressAt hits the UTS point");
/* custom material through the same model */
var cm = M.curve({ id: "x", name: "custom", c: "duct", E: 150, sy: 300, su: 450, el: 30, ra: 50 }), cr = M.measure(cm);
near(cr.offset.s, 300e6, 0.01, "custom: yield"); near(cr.uts, 450e6, 0.005, "custom: UTS"); near(cr.ef, 0.3, 0.005, "custom: elongation");

/* robustness: odd custom inputs never give NaN */
var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
var kinds = ["duct", "luders", "brittle", "polymer", "rubber"], nanFree = true, which = "";
for (var t = 0; t < 400; t++) {
	var kd = kinds[t % 5], E = Math.pow(10, -3 + 5.5 * rnd()), sy = Math.pow(10, 0.5 + 3.3 * rnd()), su = sy * (1 + 2 * rnd()), el = Math.pow(10, -1 + 3 * rnd());
	var raw = { id: "r", name: "r", c: kd, E: E, sy: sy, su: su, el: el, ra: 100 * rnd() }, sn = M.saneCurveMat(raw).m;
	sn.x = kd === "luders" ? { uy: 1.1, eL: Math.min(0.02, sn.el / 300) } : kd === "polymer" ? { ey: Math.max(1.2 * sn.sy / (sn.E * 1e3), 0.02), dr: 0.8, ed: sn.el / 100 * 0.7, brk: sn.su } : null;
	var cc = M.curve(sn);
	for (var q = 0; q < cc.e.length; q++) if (!isFinite(cc.e[q]) || !isFinite(cc.s[q]) || !isFinite(cc.t[q]) || !isFinite(cc.et[q])) { nanFree = false; which = kd + " E" + E + " sy" + sy + " su" + su + " el" + el; break; }
	if (!isFinite(cc.tough) || !isFinite(cc.smax)) { nanFree = false; which = which || kd + " tough"; }
}
ok(nanFree, "400 random custom materials (clamped by saneCurveMat) give finite curves " + which);
var rb2 = M.curve({ id: "r", name: "stiff rubber", c: "rubber", E: 68.9, su: 700, el: 15 }); ok(Math.abs(rb2.smax - 700e6) < 1e3 && rb2.ef < 0.15 && /earlier/.test(rb2.warn), "a too-stiff rubber breaks at its strength, earlier");
var sb = M.saneCurveMat({ id: "r", c: "brittle", E: 200, su: 700, el: 18 }), cb = M.curve(sb.m); ok(sb.notes.length === 1 && Math.abs(M.measure(cb).eu - cb.ef) < 1e-9, "a brittle custom material peaks at its break");
var odd = M.curve({ id: "r", name: "odd", c: "duct", E: 68.9, sy: 3447, su: 4826, el: 15 }); ok(odd.warn === "fit", "an impossible metal fit is flagged");

/* thermal: yield / buckling temperatures, series, state, colour */
(function () {
	var a = 12e-6, E = 200e9, L = 10, sy = 250e6;
	var h = M.thermalDT(a, L, E, "held", 0, sy); ok(Math.abs(h.up - 104.1667) < 1e-3 && Math.abs(h.down + 104.1667) < 1e-3, "held steel bar yields after a 104 °C rise (or fall): 250 MPa / (200 GPa x 12e-6)");
	var gp = M.thermalDT(23e-6, 1, 69e9, "gap", 0.5e-3, 0); ok(Math.abs(gp.up - 21.739) < 1e-3 && gp.down === null, "a 0.5 mm gap on a 1 m aluminium bar closes after 21.7 °C; cooling never stresses it");
	var gy = M.thermalDT(23e-6, 1, 69e9, "gap", 0.5e-3, 276e6); ok(Math.abs(M.thermal(23e-6, gy.up, 1, 69e9, "gap", 0.5e-3).sigma + 276e6) < 1, "at the gap bar's yield temperature the stress is exactly the yield strength");
	ok(M.thermalDT(a, L, E, "free", 0, sy) === null, "a free bar never reaches a stress");
	var sb = M.bucklingStress(200e9, 0.02, 1, 1); ok(Math.abs(sb - Math.PI * Math.PI * 200e9 * 25e-6 / 1) < 1, "Euler stress of a 20 mm x 1 m pinned steel bar = pi^2 E (d/4)^2 / L^2 (49.3 MPa)");
	ok(Math.abs(M.bucklingStress(200e9, 0.02, 1, 0.5) / sb - 4) < 1e-9, "clamped ends: 4 times the pinned buckling stress");
	var pin = M.euler(200e9, Math.PI * Math.pow(0.02, 4) / 64, 1) / (Math.PI * 1e-4); ok(Math.abs(pin - sb) / sb < 1e-9, "buckling stress agrees with the Euler load / area");
	var ser = M.thermalSeries(a, L, E, "held", 0, -50, 150, 40); ok(ser.length === 41 && ser[0][0] === -50 && ser[40][0] === 150 && Math.abs(ser[40][1] + E * a * 150) < 1, "series runs from lo to hi with the held stress");
	var sg = M.thermalSeries(23e-6, 1, 69e9, "gap", 0.5e-3, 0, 40, 40); ok(sg[20][1] === 0 && sg[40][1] < 0, "gap series: zero until the gap closes, compression after");
	ok(M.thermalState(-100e6, 250e6, 49e6) === "buckle" && M.thermalState(-100e6, 250e6, 400e6) === "ok" && M.thermalState(-300e6, 250e6, 400e6) === "yield" && M.thermalState(300e6, 250e6, 49e6) === "yield" && M.thermalState(0, 250e6, 1) === "ok", "state: buckle / ok / yield / tension never buckles");
	ok(M.thermalState(-300e6, 250e6, 270e6) === "yield", "yield first when the strength is reached before the buckling stress");
	ok(M.heatRGB(0).join() === "148,163,184" && M.heatRGB(1).join() === "220,38,38" && M.heatRGB(-5).join() === "37,99,235", "bar colour: grey, red when hot, blue when cold (clamped)");
})();

/* bending: the general Macaulay solver against the textbook cases, superposition, statics, sections (2026-10-29) */
(function () {
	var EI = 200e9 * 18.456e-6, L = 4, P = 10e3, w = 5e3, C = M.BEAMCASES, r, k;
	function sol(sup, loads, b) { return M.beamSolve({ L: L, sup: sup, EI: EI, loads: loads, b: b }); }
	r = sol("ss", [{ t: "P", x: L / 2, P: P }]); k = C.ssP(P, L, EI);
	near(r.Mabs.M, k.M, 1e-9, "simply supported, P at midspan: Mmax = PL/4"); near(-r.Yabs.y, k.y, 1e-9, "simply supported, P at midspan: δ = PL³/48EI"); near(r.Yabs.x, L / 2, 1e-6, "…largest deflection at midspan");
	near(r.reac[0].R, P / 2, 1e-12, "…reactions P/2"); near(Math.abs(r.Vabs.V), P / 2, 1e-12, "…largest shear P/2");
	r = sol("ss", [{ t: "w", x1: 0, x2: L, w: w }]); k = C.ssW(w, L, EI);
	near(r.Mabs.M, k.M, 1e-9, "simply supported UDL: Mmax = wL²/8"); near(-r.Yabs.y, k.y, 1e-9, "simply supported UDL: δ = 5wL⁴/384EI"); near(r.Mabs.x, L / 2, 1e-9, "…at midspan");
	r = sol("cant", [{ t: "P", x: L, P: P }]); k = C.cantP(P, L, EI);
	near(-r.Mabs.M, k.M, 1e-9, "cantilever end load: M at the wall = PL (hogging)"); near(-r.Yabs.y, k.y, 1e-9, "cantilever end load: δ = PL³/3EI"); near(r.Yabs.x, L, 1e-12, "…at the free end");
	near(-r.reac[0].M, P * L, 1e-9, "…wall moment PL"); near(r.reac[0].R, P, 1e-12, "…wall force P");
	r = sol("cant", [{ t: "w", x1: 0, x2: L, w: w }]); k = C.cantW(w, L, EI); near(-r.Mabs.M, k.M, 1e-9, "cantilever UDL: wL²/2"); near(-r.Yabs.y, k.y, 1e-9, "cantilever UDL: wL⁴/8EI");
	r = sol("fixed", [{ t: "w", x1: 0, x2: L, w: w }]); k = C.fixW(w, L, EI);
	near(-r.Mmin.M, k.M, 1e-9, "fixed-fixed UDL: end moments wL²/12"); near(r.Mmax.M, k.Mmid, 1e-9, "fixed-fixed UDL: midspan wL²/24"); near(-r.Yabs.y, k.y, 1e-9, "fixed-fixed UDL: δ = wL⁴/384EI");
	r = sol("fixed", [{ t: "P", x: L / 2, P: P }]); k = C.fixP(P, L, EI); near(Math.abs(r.Mabs.M), k.M, 1e-9, "fixed-fixed central P: PL/8"); near(-r.Yabs.y, k.y, 1e-9, "fixed-fixed central P: PL³/192EI");
	r = sol("prop", [{ t: "w", x1: 0, x2: L, w: w }]); near(r.reac[1].R, 3 * w * L / 8, 1e-9, "propped cantilever UDL: prop reaction 3wL/8"); near(-r.reac[0].M, w * L * L / 8, 1e-9, "…wall moment wL²/8");
	near(-r.Yabs.y, w * Math.pow(L, 4) / (185 * EI), 0.002, "…δmax ≈ wL⁴/185EI");
	r = sol("over", [{ t: "P", x: L, P: P }], 3); near(r.reac[1].R, P * 4 / 3, 1e-9, "overhang: support reaction P(L)/b"); near(r.reac[0].R, -P / 3, 1e-9, "…the far support is pulled down");
	near(-r.Mabs.M, P * 1, 1e-9, "…hogging moment P × overhang at the support"); near(-r.at(L, -1).y, P * 1 * 1 / (3 * EI) * (1 + 3), 1e-9, "…tip deflection Pa²(a+b)/3EI");
	/* a: P not at midspan: Mmax = Pab/L under the load; δ under load = Pa²b²/3EIL */
	r = sol("ss", [{ t: "P", x: 1, P: P }]); near(r.Mabs.M, P * 1 * 3 / L, 1e-9, "simply supported, P at a: Mmax = Pab/L"); near(-r.at(1, 1).y, P * 1 * 9 / (3 * EI * L), 1e-9, "…δ under the load = Pa²b²/3EIL");
	/* superposition */
	var r1 = sol("ss", [{ t: "P", x: 1, P: P }]), r2 = sol("ss", [{ t: "w", x1: 1.5, x2: 3.2, w: w }]), r3 = sol("ss", [{ t: "P", x: 1, P: P }, { t: "w", x1: 1.5, x2: 3.2, w: w }]), sup = true;
	[0.3, 1.2, 2, 2.9, 3.7].forEach(function (x) { var a = r1.at(x, 1), b = r2.at(x, 1), c = r3.at(x, 1); if (Math.abs(a.M + b.M - c.M) > 1e-6 || Math.abs(a.y + b.y - c.y) > 1e-15) sup = false; }); ok(sup, "superposition: two loads = the sum of each alone");
	r = sol("ss", [{ t: "M", x: L / 2, M: 1e4 }]); near(r.reac[1].R, 1e4 / L, 1e-9, "couple on a simple beam: reactions ±M/L"); near(r.Mmax.M - r.Mmin.M, 1e4, 1e-9, "…M jumps by the couple");
	/* statics hold for an odd mix on every support layout */
	var mix = [{ t: "P", x: 0.7, P: 3e3 }, { t: "w", x1: 1, x2: 3.5, w: 2e3 }, { t: "M", x: 2.2, M: -4e3 }, { t: "P", x: 3.9, P: -1e3 }], tot = 3e3 + 2e3 * 2.5 - 1e3, st = true;
	M.BSUP.forEach(function (s) { var q = sol(s[0], mix, 2.8), F = 0; q.reac.forEach(function (o) { F += o.R; }); if (Math.abs(F - tot) > 1e-6 || Math.abs(q.at(L, 1).M) > 1e-6 || Math.abs(q.at(L, 1).V) > 1e-6) st = false; q.sup.forEach(function (o) { if (Math.abs(q.at(o.x, 1).y) > 1e-14) st = false; }); }); ok(st, "every support layout: forces balance, M(L) = 0, no deflection at the supports");
	/* sections */
	var s = M.beamSection("rect", { b: 0.05, h: 0.1 }); near(s.I, 0.05 * 1e-3 / 12, 1e-12, "rectangle I = bh³/12"); near(s.S, 0.05 * 0.01 / 6, 1e-12, "rectangle S = bh²/6"); near(s.Q / (s.I * s.tw), 1.5 / s.A, 1e-12, "rectangle τmax = 1.5 V/A");
	s = M.beamSection("round", { d: 0.04 }); near(s.Q / (s.I * s.tw), 4 / (3 * s.A), 1e-12, "round bar τmax = 4V/3A"); near(s.S, PI * 64e-6 / 32, 1e-12, "round S = πd³/32");
	s = M.beamSection("ibeam", { b: 0.1, h: 0.2, tf: 0.0085, tw: 0.0056 }); near(s.I, (0.1 * 8e-3 - 0.0944 * Math.pow(0.183, 3)) / 12, 1e-12, "I-beam I = (bh³ − (b−tw)hw³)/12"); near(s.c, 0.1, 1e-12, "I-beam c = h/2");
	var big = M.beamSection("ibeam", { b: 0.1, h: 0.2, tf: 0.0085, tw: 0.0056 }), ch = M.beamSection("chan", { b: 0.1, h: 0.2, tf: 0.0085, tw: 0.0056 }); near(ch.I, big.I, 1e-12, "a channel has the same strong-axis I as an I-beam of the same plates");
	s = M.beamSection("tube", { D: 0.06, t: 0.004 }); near(s.I, PI * (Math.pow(0.06, 4) - Math.pow(0.052, 4)) / 64, 1e-12, "tube I");
	s = M.beamSection("rtube", { B: 0.1, H: 0.15, t: 0.005 }); near(s.I, (0.1 * Math.pow(0.15, 3) - 0.09 * Math.pow(0.14, 3)) / 12, 1e-12, "box I");
	ok(M.beamSection("ibeam", { b: 0.1, h: 0.01, tf: 0.006, tw: 0.005 }).err, "flanges thicker than the depth are refused");
	ok(M.beamSolve({ L: 4, sup: "ss", EI: 1, loads: [] }).Mabs.M === 0, "no load: no moment");
})();

/* dragging a load's size in the beam picture */
(function () {
	near(M.niceStep(10, 40), 0.5, 1e-12, "niceStep 10/40 = 0.5");
	near(M.niceStep(100, 5), 20, 1e-12, "niceStep 100/5 = 20");
	near(M.niceStep(7, 5), 2, 1e-12, "niceStep 7/5 -> 2");
	ok(M.niceStep(0, 5) === 1 && M.niceStep(NaN, 5) === 1, "niceStep of nothing = 1");
	near(M.snapTo(12.37, 0.5), 12.5, 1e-12, "snap 12.37 to 0.5");
	ok(M.snapTo(0.1 + 0.2, 0.1) === 0.3, "snap is clean (0.3, not 0.30000000000000004)");
	[5e3, -7.5e3, 12e3, 1].forEach(function (v) { var len = M.loadLen(v, 26, 40, 10e3); near(M.loadFromDist(v < 0 ? -len : len, 26, 40, 10e3), v, 1e-12, "load from its own arrow length " + v); });
	ok(M.loadFromDist(20, 26, 40, 10e3) === 0 && M.loadFromDist(-3, 26, 40, 10e3) === 0, "inside the base zone = 0");
	ok(M.loadFromDist(-60, 26, 40, 1e3) < 0, "below the beam = an upward (negative) load");
	near(M.snapLoad(10310, "force", "kN", 10e3), 10.5e3, 1e-12, "10.31 kN snaps to 10.5 kN (steps of 0.5 kN)");
	near(M.snapLoad(-4.48e3, "force", "kN", 10e3), -4.5e3, 1e-12, "negative loads snap too");
	var lb = M.snapLoad(M.toSI("force", 2.013, "kip"), "force", "kip", M.toSI("force", 2, "kip"));
	near(M.fromSI("force", lb, "kip"), 2, 1e-9, "2.013 kip snaps to 2 kip in US units (step 0.05 kip)");
	near(M.snapLoad(2.04e3, "dist", "kN/m", 2e3), 2.05e3, 1e-12, "spread load snaps in kN/m");
	near(M.angleDelta(3, -3), 2 * PI - 6, 1e-12, "angleDelta across ±π goes the short way");
	near(M.angleDelta(0, 1), 1, 1e-12, "angleDelta 0 -> 1");
	near(M.angleDelta(1, 0), -1, 1e-12, "angleDelta 1 -> 0");
})();

console.log(fails ? fails + " of " + n + " checks FAILED" : "all " + n + " checks passed");
process.exit(fails ? 1 : 0);
