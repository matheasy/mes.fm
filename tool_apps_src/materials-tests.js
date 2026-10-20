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
var a36 = M.curve(M.mat("a36")); near(a36.suy, 1.12 * 250e6, 1e-12, "A36 upper yield"); near(M.stressAt(a36, 0.01), 250e6, 1e-9, "A36 Lüders plateau at the lower yield");
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

console.log(fails ? fails + " of " + n + " checks FAILED" : "all " + n + " checks passed");
process.exit(fails ? 1 : 0);
