/* node tool_apps_src/orbit-simulator-tests.js */
const O = require("./orbit-simulator/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }

/* Earth: one lap in one year, Kepler's elements recovered */
let B = O.build("earth-sun"), s = B.sim, e = s.bodies[1], el = s.elementsOf(e);
near(el.a, 1, 1e-9, "Earth a"); near(el.e, 0.0167, 1e-6, "Earth e"); near(el.T, 1, 1e-5, "Earth period");
const E0 = s.energy().total, L0 = s.angularMomentum(); s.advance(10, 400000);
near((s.energy().total - E0) / Math.abs(E0), 0, 1e-8, "10-year energy drift"); near((s.angularMomentum() - L0) / L0, 0, 1e-12, "angular momentum conserved");
ok(Math.hypot(...s.momentum()) < 1e-15, "total momentum stays zero");
/* after exactly one period the planet is back (relative to the Sun) */
B = O.build("earth-sun"); s = B.sim; e = s.bodies[1]; let sun = s.bodies[0]; const rx = e.x - sun.x, ry = e.y - sun.y, T = s.elementsOf(e).T;
s.advance(T, 400000); near(Math.hypot(e.x - sun.x - rx, e.y - sun.y - ry), 0, 1e-5, "Earth returns after one period");
/* Kepler III for every planet in the inner preset: T^2/a^3 = 4 pi^2/(G M) -> 1 in solar units */
B = O.build("inner"); s = B.sim; sun = s.bodies[0];
s.bodies.slice(1).forEach(b => { const x = s.elementsOf(b, sun); near(x.T * x.T / (x.a * x.a * x.a), 1, 1e-4, b.name + " T^2/a^3"); });
near(s.elementsOf(s.bodies[1], sun).T, 0.2408, 3e-3, "Mercury year");
/* Kepler II: equal areas in equal times (Halley) */
B = O.build("halley"); s = B.sim; sun = s.bodies[0]; let h = s.bodies[2];
const hh = s.elementsOf(h, sun).h; let ok2 = true; for (let i = 0; i < 40; i++) { s.advance(0.5, 100000); const x = s.elementsOf(h, sun); if (Math.abs(x.h / hh - 1) > 1e-4) ok2 = false; } ok(ok2, "specific angular momentum constant (Kepler II)");
near(B.sim.elementsOf(B.sim.bodies[2], B.sim.bodies[0]).T, 75.3, 0.3, "Halley period");
ok(B.sim.elementsOf(B.sim.bodies[2], B.sim.bodies[0]).retro, "Halley retrograde");
/* Moon: 27.3 days, barycentre inside the Earth */
B = O.build("earth-moon"); s = B.sim; near(s.elementsOf(s.bodies[1]).T, 27.3, 0.1, "Moon period");
near(s.com().x, 0, 1e-12, "barycentre at the origin"); ok(Math.abs(s.bodies[0].x) < 0.1 * 3.844, "Earth wobble is small");
/* figure eight returns after one period */
B = O.build("figure8"); s = B.sim; const p0 = s.bodies.map(b => [b.x, b.y]); s.advance(6.32591398, 400000);
s.bodies.forEach((b, i) => near(Math.hypot(b.x - p0[i][0], b.y - p0[i][1]), 0, 1e-6, "figure-8 body " + i + " returns"));
/* Lagrange triangle stays a triangle for a while */
B = O.build("lagrange"); s = B.sim; s.advance(20, 400000); const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
near(d(s.bodies[0], s.bodies[1]) / d(s.bodies[1], s.bodies[2]), 1, 1e-6, "triangle stays equilateral");
/* Trojan asteroid stays 60 degrees ahead of Jupiter over 100 years */
B = O.build("trojans"); s = B.sim; s.advance(100, 800000); sun = s.bodies[0]; const ang = b => Math.atan2(b.y - sun.y, b.x - sun.x);
let dang = ang(s.bodies[2]) - ang(s.bodies[1]); dang = Math.atan2(Math.sin(dang), Math.cos(dang)); near(dang, Math.PI / 3, 0.5, "Trojan stays near L4"); ok(Math.abs(dang) > 0.3, "Trojan has not collapsed onto Jupiter");
/* circumbinary planet remains bound and near-circular */
B = O.build("binary"); s = B.sim; s.advance(30, 800000); const pl = s.bodies[2]; ok(s.elementsOf(pl, s.com()).bound !== undefined && Math.hypot(pl.x, pl.y) < 2 && Math.hypot(pl.x, pl.y) > 0.8, "planet stays near 1.2 AU");
/* Pythagorean problem: energy and momentum kept, even through the close encounters */
B = O.build("pythagorean"); s = B.sim; const Ep = s.energy().total; s.advance(60, 2000000); near((s.energy().total - Ep) / Math.abs(Ep), 0, 5e-3, "Pythagorean energy"); ok(Math.hypot(...s.momentum()) < 1e-9, "Pythagorean momentum");
/* gravity assist: the probe's orbit grows */
B = O.build("slingshot"); s = B.sim; sun = s.bodies[0]; const a0 = s.elementsOf(s.bodies[2], sun).a; s.advance(3, 800000); const a1 = s.elementsOf(s.bodies[2], sun); ok(a1.bound && a1.a > 1.5 * a0, "assist raises the probe's orbit (" + a0.toFixed(2) + " -> " + a1.a.toFixed(2) + " AU)");
/* merging conserves momentum and mass */
{ const q = new O.Sim(1); q.collide = true; q.add({ m: 1, x: 0, y: 0, vx: 0, vy: 0, rad: 0.2 }); q.add({ m: 1, x: 1, y: 0, vx: -1, vy: 0.2, rad: 0.2 });
  q.add({ m: 1e-6, x: 50, y: 0, vx: 0, vy: 0.1, rad: 0 }); const P0 = q.momentum(), M0 = q.com().m; q.advance(3, 100000);
  ok(q.bodies.length === 2 && q.merged === 1, "two bodies merged"); near(q.com().m, M0, 1e-12, "mass kept"); near(q.momentum()[1], P0[1], 1e-9, "momentum kept after merging"); }
/* elements: hyperbola and a circle */
{ const el = O.elements(1, 0, 0, 2, 1); ok(!el.bound && el.e > 1, "v = 2 vcirc is unbound"); const c = O.elements(1, 0, 0, 1, 1); near(c.e, 0, 1e-12, "circle e"); near(c.T, 2 * Math.PI, 1e-9, "circle T");
  near(O.elements(1, 0, 0, Math.SQRT2, 1).eps, 0, 1e-12, "escape speed has zero energy"); ok(O.orbitPath(el, 40, 20).length > 10, "hyperbola path"); const pe = O.orbitPath(c, 8); near(Math.hypot(pe[2][0], pe[2][1]), 1, 1e-9, "orbit path radius"); }
/* SI formulas */
{ const mu = O.G_SI * 5.9722e24, r = 6.3781e6 + 4e5; near(Math.sqrt(mu / r) / 1000, 7.67, 0.01, "ISS speed km/s"); near(2 * Math.PI * Math.sqrt(r * r * r / mu) / 60, 92.4, 0.3, "ISS period min");
  near(Math.sqrt(2 * mu / 6.3781e6) / 1000, 11.19, 0.02, "Earth escape speed"); const g = O.hohmann(mu, 6.6781e6, 4.2164e7); near(g.total / 1000, 3.9, 0.15, "LEO to GEO delta v"); near(g.time / 3600, 5.3, 0.1, "LEO to GEO hours");
  const gs = O.hohmann(O.G_SI * 1.98847e30, O.AU, 1.5237 * O.AU); near(g.dv1 > 0, true, 0, "dv positive"); near(gs.time / 86400, 258.8, 1.5, "Earth to Mars Hohmann days");
  near(O.parseLen("1 AU"), O.AU, 1, "parse AU"); near(O.parseLen("400 km"), 4e5, 1e-6, "parse km"); near(O.parseLen("6,778,000"), 6.778e9, 1, "bare numbers are km"); ok(isNaN(O.parseLen("far")), "parse nonsense"); }
/* timing: 5 years of the inner solar system in well under a second */
{ const t0 = Date.now(); const q = O.build("inner").sim; q.advance(5, 1e6); ok(Date.now() - t0 < 1500, "speed"); }
console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
