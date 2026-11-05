/* node tool_apps_src/crash-physics-tests.js -- checks of MESCrash (tool_apps_src/crash-physics/lib.js) */
"use strict";
var C = require("./crash-physics/lib.js"), n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL", msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol * Math.abs(b), msg + " (" + a + " vs " + b + ")"); }
var G = C.G;

/* basic quantities */
var r = C.impact({ pm: "steel", shape: "sphere", d: 0.01, v: 300, tm: "steel", h: 0.003 });
near(r.m, 7850 * Math.PI * 1e-6 / 6, 1e-9, "sphere mass");
near(r.ke, 0.5 * r.m * 9e4, 1e-12, "kinetic energy"); near(r.p, r.m * 300, 1e-12, "momentum");
near(C.R(C.mat("steel")), (2 / 3) * 250e6 * (1 + Math.log(200e9 / 750e6)), 1e-12, "cavity-expansion resistance");

/* Poncelet depth matches the closed form for a rigid projectile */
var o = { pm: "hsteel", shape: "round", d: 0.01, L: 0.05, v: 200, tm: "pine", h: 1, span: 1 };
var m = C.massOf(o), A = Math.PI * 1e-4 / 4, K = 0.5 * 500, Rt = 60e6;
ok(C.regime(o).id === "rigid", "hard steel into pine stays rigid");
near(C.depth(o).P, m / (2 * K * A) * Math.log(1 + K * 4e4 / Rt), 1e-9, "Poncelet depth");

/* monotone: thicker plates are harder, faster is deeper */
var prev = 0; [100, 200, 400, 800].forEach(function (v) { var P = C.depth(Object.assign({}, o, { v: v })).P; ok(P > prev, "depth grows with speed at " + v); prev = P; });
var vb1 = C.ballisticLimit({ pm: "steel", shape: "sphere", d: 0.01, v: 300, tm: "steel", h: 0.002, span: 0.5 }), vb2 = C.ballisticLimit({ pm: "steel", shape: "sphere", d: 0.01, v: 300, tm: "steel", h: 0.004, span: 0.5 });
ok(vb2 > vb1, "ballistic limit rises with thickness");

/* ballistic limit and stop thickness are consistent with the result */
[{ pm: "steel", shape: "sphere", d: 0.01, v: 300, tm: "steel", h: 0.003 }, { pm: "hsteel", shape: "cone", d: 0.02, L: 0.1, v: 800, tm: "concrete", h: 0.3 }, { pm: "steel", shape: "sphere", d: 0.01, v: 100, tm: "pine", h: 0.02 }].forEach(function (c, i) {
	var r2 = C.impact(c);
	ok(r2.perf === (c.v > r2.vbl), "case " + i + ": perforates iff speed above the ballistic limit");
	ok(r2.perf === (c.h < r2.hStop), "case " + i + ": perforates iff thinner than the stop thickness");
	if (r2.perf) ok(r2.vr > 0 && r2.vr < c.v, "case " + i + ": exit speed between 0 and the impact speed");
});

/* hypervelocity: Al sphere into Al at 7 km/s makes a crater p/d near 2 (Cour-Palais: ~2.1) and 4 mm is perforated */
var hv = C.impact({ pm: "al", shape: "sphere", d: 0.01, v: 7000, tm: "al", h: 0.2 });
ok(hv.reg === "erode" && hv.out === "crater", "hypervelocity regime");
ok(hv.P / 0.01 > 1.7 && hv.P / 0.01 < 2.8, "crater depth / diameter " + (hv.P / 0.01).toFixed(2));
near(hv.hStop, 1.8 * hv.P, 0.02, "Fish-Summers thickness 1.8 p");
ok(C.impact({ pm: "al", shape: "sphere", d: 0.01, v: 7000, tm: "al", h: 0.004 }).out === "through", "4 mm wall perforated");

/* hail: shatters, never penetrates, dents a thin roof by millimetres */
var ha = C.impact({ pm: "ice", shape: "sphere", d: 0.05, v: 30, tm: "steel", h: 0.0008, span: 1 });
ok(ha.out === "shatters" && !ha.perf, "hail shatters"); ok(ha.dent > 0.001 && ha.dent < 0.02, "hail dent mm " + (ha.dent * 1000).toFixed(1));
ok(C.impact({ pm: "ice", shape: "sphere", d: 0.05, v: 30, tm: "steel", h: 0.0008, span: 1 }).hStop < 1e-6, "no sheet needed to stop hail");

/* window: a marble from 1 m does not break it, a golf ball at 40 m/s does; a narrower pane is stronger */
ok(!C.impact({ pm: "glass", shape: "sphere", d: 0.015, v: 4.4, tm: "glass", h: 0.004, span: 0.8 }).perf, "marble bounces off a window");
ok(C.impact({ pm: "rubber", shape: "sphere", d: 0.0427, m: 0.0459, v: 40, tm: "glass", h: 0.004, span: 0.8 }).out === "breaks", "golf ball breaks a window");
ok(C.bendFail(C.mat("glass"), 0.006, 0.8).U > C.bendFail(C.mat("glass"), 0.004, 0.8).U, "thicker pane takes more energy");
ok(C.bendFail(C.mat("glass"), 0.004, 0.3, 0.02).P > C.bendFail(C.mat("glass"), 0.004, 1, 0.02).P, "small pane takes a bigger load");

/* water: a steel ball stops within a metre */
var w = C.impact({ pm: "steel", shape: "sphere", d: 0.01, v: 300, tm: "water", h: 1, span: 2 });
ok(!w.perf && w.P > 0.1 && w.P < 1, "water depth " + w.P.toFixed(2) + " m");

/* every material pair gives finite numbers */
var finite = true;
C.MATS.forEach(function (pm) { C.MATS.forEach(function (tm) { [5, 300, 5000].forEach(function (v) { var q = C.impact({ pm: pm.id, shape: "sphere", d: 0.02, v: v, tm: tm.id, h: 0.01, span: 0.6 }); if (!isFinite(q.ke) || !isFinite(q.P) || !(q.vbl > 0) || isNaN(q.hStop) || (q.perf && !(q.vr >= 0))) { finite = false; console.log("  bad", pm.id, tm.id, v, q.out); } }); }); });
ok(finite, "all material pairs at 5 / 300 / 5000 m/s give sensible numbers");

/* ---------- crash ---------- */
var c1 = C.crash({ m1: 1500, k1: 1e6, e1: 1, v1: 15.6, k2: 1e11, e2: 1 }).sum;
var om = Math.sqrt(1e6 / 1500);
near(c1.crush, 15.6 / om, 0.01, "elastic crush = v / omega"); near(c1.a1max, 15.6 * om, 0.01, "peak decel = v omega");
near(c1.tc, Math.PI / om, 0.02, "contact time = pi / omega"); near(c1.rebound, 15.6, 0.01, "e = 1 bounces at full speed");
[0.15, 0.5].forEach(function (e) { var s = C.crash({ m1: 1500, k1: 1e6, e1: Math.sqrt(e), e2: Math.sqrt(e), v1: 15.6, k2: 1e11 }).sum; near(s.rebound, e * 15.6, 0.03, "rebound speed e = " + e); near(s.eAbs, 0.5 * 1500 * 15.6 * 15.6 * (1 - e * e), 1e-9, "energy absorbed e = " + e); });
/* two equal cars head-on = one car into a wall */
var hw = C.crash({ m1: 1500, k1: 1e6, e1: 0.4, v1: 15.6, k2: 1e11, e2: 1 }).sum, ho = C.crash({ m1: 1500, k1: 1e6, e1: 0.4, v1: 15.6, m2: 1500, k2: 1e6, e2: 1, v2: -15.6 }).sum;
near(ho.crush1, hw.crush, 0.02, "head-on crush = wall crush"); near(ho.a1max, hw.a1max, 0.02, "head-on g = wall g");
/* momentum conservation, lighter car gets the larger delta-v */
var mv = C.crash({ m1: 1100, k1: 0.85e6, e1: 0.4, v1: 16.7, m2: 2200, k2: 1.3e6, e2: 0.4, v2: -16.7 }).sum;
near(1100 * mv.v1After + 2200 * mv.v2After, 1100 * 16.7 - 2200 * 16.7, 1e-6, "momentum conserved");
ok(mv.dv1 > mv.dv2 * 1.9, "small car delta-v about twice the SUV's");
/* occupants: belt < airbag only < nothing, in HIC and chest g */
var occ = ["beltbag", "bag", "none"].map(function (x) { return C.crash({ m1: 1500, k1: 1e6, e1: 0.39, e2: 0.39, v1: 15.6, k2: 1e11, occ: x }).sum.occ; });
ok(occ[0].hic < occ[1].hic && occ[1].hic < occ[2].hic, "HIC ordering belt+bag < bag < none");
ok(occ[0].clip3 > 25 && occ[0].clip3 < 70, "belted chest g plausible " + occ[0].clip3.toFixed(0));
ok(occ[2].pHead > 0.5, "unbelted head risk high");
/* HIC of a constant pulse: a for T <= 15 ms gives T a^2.5 */
var ts = [], gs = []; for (var i = 0; i <= 100; i++) { ts.push(i * 1e-4); gs.push(50); } near(C.hic(ts, gs, 0.015), 0.01 * Math.pow(50, 2.5), 1e-6, "HIC of a flat 10 ms pulse");
near(C.clip(ts, gs, 0.003), 50, 1e-9, "3 ms clip of a flat pulse");
near(C.phi(0), 0.5, 1e-6, "normal cdf"); near(C.phi(1.96), 0.975, 1e-3, "normal cdf 1.96");
/* egg: 10 cm onto concrete breaks it, 1 m onto a pillow does not */
var egg = C.obj("egg");
ok(C.crash({ m1: egg.m, k1: egg.k, e1: 0.2, v1: Math.sqrt(2 * G * 0.1), k2: 1e11, e2: 1 }).sum.Fmax > egg.breakF, "egg breaks from 10 cm on concrete");
ok(C.crash({ m1: egg.m, k1: egg.k, e1: 0.2, v1: Math.sqrt(2 * G * 1), k2: C.surf("pillow").k, e2: 0.3 }).sum.Fmax < egg.breakF, "egg survives 1 m onto a pillow");

console.log((bad ? bad + " of " : "all ") + n + " checks " + (bad ? "FAILED" : "passed"));
process.exit(bad ? 1 : 0);
