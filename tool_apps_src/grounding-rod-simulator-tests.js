// node tool_apps_src/grounding-rod-simulator-tests.js
const G = require("./grounding-rod-simulator/lib.js"); let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol * Math.abs(b), m + " got " + a + " want " + b); }
const d58 = 0.015875;
near(G.rodR(100, 2.4, d58), 40.4, 0.01, "Dwight 8 ft 5/8 in in 100 ohm-m");
near(G.rodR(100, 3, 0.019), 100 / (2 * Math.PI * 3) * (Math.log(4 * 3 / 0.0095) - 1), 1e-9, "formula");
ok(G.rodR(100, 4.8, d58) < G.rodR(100, 2.4, d58), "longer rod is lower");
near(G.rodR(200, 2.4, d58) / G.rodR(100, 2.4, d58), 2, 1e-9, "linear in rho");
near(G.mutual(100, 2.4, d58, d58), G.rodR(100, 2.4, d58), 1e-9, "mutual at s=a is self");
ok(G.mutual(100, 2.4, d58, 1) > G.mutual(100, 2.4, d58, 2.4) && G.mutual(100, 2.4, d58, 2.4) > G.mutual(100, 2.4, d58, 6), "mutual falls with spacing");
const r1 = G.groupR(1, 100, 2.4, d58, 2.4), r2 = G.groupR(2, 100, 2.4, d58, 2.4), r2far = G.groupR(2, 100, 2.4, d58, 100);
ok(r2 < r1 && r2 > r1 / 2, "two rods: better than one, worse than half");
near(r2far, r1 / 2, 0.02, "two far-apart rods approach R/2");
near(r2, (G.rodR(100, 2.4, d58) + G.mutual(100, 2.4, d58, 2.4)) / 2, 1e-9, "two equal rods = (R + Rm)/2");
ok(G.groupR(4, 100, 2.4, d58, 2.4) < G.groupR(3, 100, 2.4, d58, 2.4), "more rods lower");
ok(G.groupR(4, 100, 2.4, d58, 4.8) < G.groupR(4, 100, 2.4, d58, 2.4), "wider spacing lower");
ok(G.rodsNeeded(25, 100, 2.4, d58, 2.4) === 2 || G.rodsNeeded(25, 100, 2.4, d58, 2.4) === 3, "rods for 25 ohm in loam");
ok(G.rodsNeeded(25, 10000, 2.4, d58, 2.4, 10) === null, "rock needs more than 10 rods");
near(G.lightningV(100, 30000, 10), 100 * 30000 / (2 * Math.PI * 10), 1e-12, "V(r)");
near(G.stepV(100, 30000, 10, 0.75), G.lightningV(100, 30000, 10) - G.lightningV(100, 30000, 10.75), 1e-12, "step");
ok(G.stepV(100, 30000, 2, 0.75) > G.stepV(100, 30000, 20, 0.75), "step falls with distance");
near(G.hemiRadius(100, 36), 100 / (2 * Math.PI * 36), 1e-12, "hemisphere radius");
const bt = G.betweenRods(100, 30000, 25, 10); ok(bt.rod1 === 750000 && bt.between > 0 && bt.between < bt.rod1, "unbonded rod voltage");
ok(G.bodyEffect(0.2).k === 0 && G.bodyEffect(3).k === 1 && G.bodyEffect(20).k === 3 && G.bodyEffect(60).k === 4 && G.bodyEffect(500).k === 5, "body effect bands");
ok(G.tripTime(10, 15, "std").trips === false, "10 A on 15 A: no trip");
ok(G.tripTime(300, 15, "std").t < 0.05, "300 A on 15 A: instant");
ok(G.tripTime(30, 15, "std").t > 5 && G.tripTime(30, 15, "std").t < 120, "2x: thermal");
const base = { V: 120, In: 15, curve: "std", Rline: 0.2, Regc: 0.2, Rsrc: 0.1, Rrod: 25, Rsrcg: 25, Rfloor: 1000 };
const f = G.faultCases(base);
near(f[0].I, 120 / 0.5, 1e-9, "EGC fault current 240 A"); ok(f[0].trip.trips && f[0].trip.t < 0.1, "EGC trips fast"); ok(f[0].Vcase < 60, "EGC touch voltage small");
near(f[1].I, 120 / (0.1 + 0.2 + 25 + 25), 1e-9, "rod-only fault current ~2.4 A"); ok(!f[1].trip.trips, "rod-only does not trip");
ok(f[1].Vcase > 50 && f[1].Vcase < 120, "rod-only case stays near 60 V");
ok(f[2].Ibody > 30 && f[2].Ibody < 120, "no-ground body current tens of mA");
near(G.ttMaxRA(30), 1666.67, 0.001, "TT 30 mA"); near(G.ttMaxRA(300), 166.67, 0.001, "TT 300 mA"); near(G.ttMaxRA(30, 25), 833.33, 0.001, "25 V limit");
near(G.staticE(150e-12, 15000), 0.5 * 150e-12 * 15000 * 15000, 1e-12, "static energy"); near(G.staticDecay(1e9, 150e-12, 10000, 100) / G.staticTau(1e9, 150e-12), Math.log(100), 1e-9, "decay");
console.log(n + " checks, " + bad + " failed"); process.exit(bad ? 1 : 0);
