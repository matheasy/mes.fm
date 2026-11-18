/* Tests for tool_apps_src/ductile-fracture-simulator/lib.js (MESVoid): node tool_apps_src/ductile-fracture-simulator-tests.js */
"use strict";
var V = require("./ductile-fracture-simulator/lib.js"), fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log("FAIL: " + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (got " + a + ", want " + b + " ± " + tol + ")"); }

/* GTN yield function */
near(V.yieldRatio(0, 1), 1, 1e-12, "no voids: full strength");
[0.001, 0.01, 0.05, 0.2].forEach(function (fs) { [0, 1 / 3, 1, 2.5].forEach(function (T) {
	var x = V.yieldRatio(fs, T), g = x * x + 2 * V.Q1 * fs * Math.cosh(1.5 * V.Q2 * T * x) - 1 - V.Q3 * fs * fs;
	near(g, 0, 1e-9, "yield surface satisfied f*=" + fs + " T=" + T);
}); });
ok(V.yieldRatio(0.05, 2) < V.yieldRatio(0.05, 0.33), "voids weaken more at high triaxiality");
near(V.yieldRatio(V.FU, 1), 0, 1e-12, "f* = 1/q1: no strength left");
near(V.fstar(0.01, { fc: 0.03 }), 0.01, 1e-12, "below fc f* = f");
near(V.fstar(0.25, { fc: 0.15, fF: 0.25 }), V.FU, 1e-12, "at fF f* = 1/q1");

/* Lode directions: deviatoric (sum 0) with unit equivalent strain, ξ = 1 gives 1, −½, −½ */
[-1, -0.5, 0, 0.5, 1].forEach(function (xi) { var c = V.lodeDirs(xi), sum = c[0] + c[1] + c[2], eq = Math.sqrt(2 / 3 * (c[0] * c[0] + c[1] * c[1] + c[2] * c[2])); near(sum, 0, 1e-12, "lode sum ξ=" + xi); near(eq, 1, 1e-12, "lode equivalent ξ=" + xi); });
var c1 = V.lodeDirs(1); near(c1[0], 1, 1e-12, "ξ=1 axial"); near(c1[1], -0.5, 1e-12, "ξ=1 lateral");
var s = V.stresses(1 / 3, 1); near(s[0], 1, 1e-12, "uniaxial tension σ1 = σe"); near(s[1], 0, 1e-12, "uniaxial tension σ2 = 0");

/* unit cell: failure strain falls as triaxiality rises; compression never fails by voids */
V.MATS.forEach(function (m) {
	var prev = Infinity;
	[1 / 3, 0.6, 1, 1.5, 2.5].forEach(function (T) { var c = V.cell(m, T, 1); ok(c.ef != null && c.ef < prev, m.id + ": ef falls with T at " + T.toFixed(2)); if (c.ef) { prev = c.ef; ok(c.ec == null || c.ec < c.ef, m.id + " voids link before failure"); } });
	ok(V.cell(m, -1 / 3, -1, { emax: 3 }).ef == null, m.id + ": compression does not fail by voids");
	var t = V.cell(m, 1 / 3, 1), last = t.f[t.f.length - 1]; ok(last > m.f0, m.id + ": porosity grows in tension");
	/* the void stretches along the pull in tension and grows in volume */
	var sh = t.shape[Math.floor(t.shape.length / 2)]; ok(sh.r[0] > sh.r[1], m.id + ": void longer along the pull");
});
ok(V.cell(V.mat("copper"), 1, 1).ef > V.cell(V.mat("dirty"), 1, 1).ef * 2, "clean copper much more ductile than free-machining steel");
/* shear (ξ = 0, T = 0): voids do not grow in volume but the shear term still breaks it; turning the term off = no failure */
ok(V.cell(V.mat("steel"), 0, 0).ef != null, "shear breaks it (Nahshon-Hutchinson term)");
ok(V.cell(V.mat("steel"), 0, 0, { kw: 0, nuc: false, emax: 3 }).ef == null, "without the shear term and nucleation pure shear never fails");
/* growth rate at high T is roughly exponential in T (Rice-Tracey trend): ratio of failure strains */
var m0 = V.mat("steel"), a = V.cell(m0, 1, 1).ef, b = V.cell(m0, 2, 1).ef; ok(a / b > 2 && a / b < 8, "ef(T=1)/ef(T=2) between 2 and 8 (got " + (a / b).toFixed(2) + ")");

/* a round bar: reduction of area near each material's textbook value; crack starts on the axis; elongation sensible */
V.MATS.forEach(function (m) {
	var r = V.bar(m), fr = r.frames, k = r.crackAt;
	near(r.RA, m.ra, 0.06, m.id + " reduction of area");
	ok(k != null && fr[k].dead[0] === 1, m.id + ": first failure is on the axis (the centre of the neck)");
	ok(fr[k].dead[r.nr - 1] === 0, m.id + ": the surface is still whole when the centre cracks");
	ok(fr[fr.length - 1].broke && fr[fr.length - 1].F === 0, m.id + ": breaks and carries no load");
	ok(fr[0].Tc < 0.34 && fr[k].Tc > 0.38, m.id + ": triaxiality in the middle rises as it necks");
	ok(fr[k].Tc > fr[k].Ts, m.id + ": triaxiality highest at the centre (Bridgman)");
	var el = fr[fr.length - 2].dl / r.Lg; ok(el > 0.05 && el < 1.2, m.id + " elongation " + (el * 100).toFixed(0) + "%");
	var mx = 0, mi = 0; fr.forEach(function (f, i) { if (f.F > mx) { mx = f.F; mi = i; } }); ok(mi < k, m.id + ": the force peaks before the crack starts");
});
var smooth = V.bar(V.mat("steel")), notched = V.bar(V.mat("steel"), { notch: 0.3, nrad: 0.15 });
ok(notched.ef < smooth.ef * 0.7, "a notch breaks at a smaller strain");
ok(notched.frames[0].Tc > 1, "a sharp notch starts at high triaxiality");
ok(V.bar(V.mat("steel"), { notch: 0.3, nrad: 0.6 }).ef > notched.ef, "a blunter notch is less damaging");

/* dimples: seeded, in the disc, elongated in the shear lip */
var d1 = V.dimples(7, 0.7, 1, 400), d2 = V.dimples(7, 0.7, 1, 400);
ok(d1.length > 250 && JSON.stringify(d1) === JSON.stringify(d2), "dimples are seeded");
ok(d1.every(function (d) { return d.x * d.x + d.y * d.y < 1; }), "dimples inside the disc");
var lip = d1.filter(function (d) { return d.lip; }), flat = d1.filter(function (d) { return !d.lip; });
ok(lip.length > 10 && lip.every(function (d) { return d.rx / d.ry > 1.9; }) && flat.every(function (d) { return d.rx / d.ry < 1.3; }), "shear-lip dimples elongated, central ones round");

console.log(fails ? fails + " of " + n + " checks FAILED" : "all " + n + " checks passed");
process.exit(fails ? 1 : 0);
