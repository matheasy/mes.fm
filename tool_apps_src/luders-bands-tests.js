/* Tests for the Lüders band simulator maths: node tool_apps_src/luders-bands-tests.js */
"use strict";
const L = require("./luders-bands/lib.js");
let fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log("FAIL", msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (got " + a + ", want " + b + " ± " + tol + ")"); }

/* front angle: tan² = (1+r)/r, and the line really does not stretch */
near(L.frontAngle(1), 54.7356, 1e-3, "isotropic front angle 54.7°");
near(L.frontAngle(1.6), 51.89, 0.02, "r = 1.6 front angle");
for (const r of [0.5, 1, 2, 3]) near(L.lineStrain(L.frontAngle(r), r), 0, 1e-12, "zero-stretch line r=" + r);
ok(L.frontAngle(0.5) > L.frontAngle(2), "lower r -> steeper front");

/* formulas */
near(L.bandSpeed(5 / 60, 0.02, 1), 4.1667, 1e-3, "band speed V/eL");
near(L.bandSpeed(5 / 60, 0.02, 2), 2.0833, 1e-3, "two fronts share the speed");
near(L.plateauTime(50, 0.02, 5 / 60), 12, 1e-9, "plateau time");
near(L.hallPetch(25), 218, 0.5, "Hall-Petch 25 µm");
ok(L.ludersFromGrain(8) > L.ludersFromGrain(40), "finer grain, longer plateau");
near(L.ageEquivalentHours(1, 20), 1, 1e-9, "ageing at reference temperature");
ok(L.ageEquivalentHours(1, 100) > 1000, "1 h at 100 °C ≈ months at room temperature");
ok(L.ageFraction(0, 20) === 0 && L.ageFraction(1e6, 20) > 0.99, "ageing fraction 0..1");
near(L.H({ sL: 250, eL: 0.02, K: 500, n: 0.5 }, 0.02), 250, 1e-9, "H at the Lüders strain = lower yield");
near(L.Hinv({ sL: 250, eL: 0.02, K: 500, n: 0.5 }, L.H({ sL: 250, eL: 0.02, K: 500, n: 0.5 }, 0.07)), 0.07, 1e-9, "Hinv inverts H");

/* a full run on every yield-point material: upper yield, plateau near the lower yield, Lüders strain = eL */
for (const m of L.MATS) {
  if (m.noYP) continue;
  const s = new L.Sim({ mat: m });
  s.runTo(m.eL + 0.02);
  const S = s.summary();
  ok(S.bands >= 1, m.id + ": a band forms");
  ok(S.upper > S.plateau, m.id + ": upper yield above the plateau");
  near(S.upper / m.sL, m.uy * (1 - 0.03), 0.02 * m.uy, m.id + ": upper yield = uy x sL at the shoulder");
  near(S.plateau / m.sL, 0.995, 0.01, m.id + ": plateau ≈ lower yield");
  near(S.ludersStrain, m.eL, 0.15 * m.eL, m.id + ": Lüders strain");
  ok(s.yieldedFraction() === 1, m.id + ": whole gauge yielded");
}

/* no yield point */
{ const s = new L.Sim({ mat: L.mat("if") }); s.runTo(0.03); ok(s.bands === 0 && s.summary().upper == null, "IF steel: no bands"); ok(s.s > 150, "IF steel hardens"); }

/* band speed in the simulation matches V / eL (one front) */
{
  const m = L.mat("a36"), s = new L.Sim({ mat: m, V: 6, scatter: 0 });
  const du = s.p.Lg * 2e-5, V = 6 / 60; let samples = [];
  while (s.strain() < 0.03) { s.step(du, du / V); if (s.phase === "luders") { const f = s.fronts(); if (f.length === 1) samples.push([s.t, f[0].x * s.p.Lg]); } }
  const a = samples[Math.floor(samples.length * 0.2)], b = samples[Math.floor(samples.length * 0.8)];
  near(Math.abs(b[1] - a[1]) / (b[0] - a[0]), L.bandSpeed(V, m.eL, 1), 0.08 * L.bandSpeed(V, m.eL, 1), "measured band speed");
}

/* notch in the middle: band starts there and runs both ways (two fronts) */
{ const s = new L.Sim({ mat: L.mat("a36"), notches: [0.5] }); let two = false; while (s.strain() < 0.01) { s.step(s.p.Lg * 2e-5, 0.01); if (s.fronts().length === 2) two = true; }
  near(s.events[0].x, 0.5, 0.03, "nucleates at the notch"); ok(two, "two fronts from a notch"); }

/* stiff machine: steeper yield drop (stress-strain slope during the drop) */
{
  function dropSlope(k) { const s = new L.Sim({ mat: L.mat("a36"), k }); let prev = [0, 0], worst = 0; while (s.strain() < 0.006) { s.step(s.p.Lg * 2e-5, 0.01); const c = [s.strain(), s.s]; const de = c[0] - prev[0]; if (de > 0 && c[1] < prev[1] - 1) worst = Math.max(worst, (prev[1] - c[1]) / de); prev = c; } return worst; }
  ok(dropSlope(20) > 4 * dropSlope(0.5), "stiff machine gives a steeper yield drop");
}

/* strain ageing brings the yield point back; reloading at once does not */
{
  const a = new L.Sim({ mat: L.mat("a36") }); a.runTo(0.05); a.unload(); a.age(0, 20); const e0 = a.strain(); a.runTo(e0 + 0.02); ok(a.summary().upper == null, "reload at once: no yield point");
  const b = new L.Sim({ mat: L.mat("a36") }); b.runTo(0.05); const sPre = b.s; b.unload(); b.age(1, 100); const e1 = b.strain(); b.runTo(e1 + 0.03);
  ok(b.summary().upper > sPre * 1.03, "aged: yield point returns above the old flow stress");
}

/* determinism */
{ const a = new L.Sim({ mat: L.mat("dc01"), seed: 3 }), b = new L.Sim({ mat: L.mat("dc01"), seed: 3 }); a.runTo(0.04); b.runTo(0.04); ok(a.curve.length === b.curve.length && a.s === b.s, "same seed, same test"); }

/* query round trip and junk */
{ const q = L.toQuery({ m: "a36", eL: 0.02, k: 3, n: "0.5" }); const o = L.fromQuery("?" + q + "&evil=<x>&m2=1"); ok(o.m === "a36" && o.eL === 0.02 && o.k === 3 && o.n === "0.5" && !o.evil, "query round trip"); ok(!L.fromQuery("m=<script>").m, "query rejects junk"); }

/* colours */
ok(L.viridisish(0).length === 3 && L.viridisish(1)[0] === 253, "colour map");

console.log(fails ? fails + " of " + n + " FAILED" : "all " + n + " passed");
process.exit(fails ? 1 : 0);
