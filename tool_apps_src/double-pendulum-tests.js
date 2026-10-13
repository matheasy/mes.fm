/* node tool_apps_src/double-pendulum-tests.js */
const D = require("./double-pendulum/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
const P = D.params();
/* energy conserved over a chaotic minute */
{ const s = [2.0, 1.5, 0, 0], E0 = D.energy(s, P).E; for (let i = 0; i < 30000; i++) D.step(s, P, 0.002); near((D.energy(s, P).E - E0) / Math.abs(E0), 0, 1e-6, "energy drift in 60 s"); }
/* RK4 converges: halve the step on a gentle swing */
{ const a = [0.4, 0.2, 0, 0], b = [0.4, 0.2, 0, 0]; for (let i = 0; i < 2500; i++) D.step(a, P, 0.002); for (let i = 0; i < 5000; i++) D.step(b, P, 0.001); near(a[0], b[0], 1e-9, "step convergence theta1"); }
/* small angles, normal modes: a start on a mode stays on it and has the predicted period */
{ const M = D.normalModes(P); near(M[0].omega * M[0].omega, 9.81 * (2 - Math.SQRT2), 1e-9, "slow mode omega^2 for equal masses and lengths"); near(M[1].omega * M[1].omega, 9.81 * (2 + Math.SQRT2), 1e-9, "fast mode omega^2");
  near(M[0].ratio, Math.SQRT2, 1e-9, "slow mode ratio"); near(M[1].ratio, -Math.SQRT2, 1e-9, "fast mode ratio");
  for (const k of [0, 1]) { const th = 0.001, s = [th, th * M[k].ratio, 0, 0], T = M[k].period, n = Math.round(T / 0.0005); for (let i = 0; i < n; i++) D.step(s, P, T / n);
    near(s[0], th, th * 2e-3, "mode " + k + " returns after one period (theta1)"); near(s[1], th * M[k].ratio, th * 3e-3, "mode " + k + " returns (theta2)"); } }
/* a light second bob on a light arm leaves a simple pendulum of period 2 pi sqrt(l/g) */
{ const Q = D.params({ m1: 1, m2: 1e-9, l1: 1, l2: 0.5 }), s = [0.05, 0.05, 0, 0], T = 2 * Math.PI * Math.sqrt(1 / 9.81), n = Math.round(T / 0.0005); for (let i = 0; i < n; i++) D.step(s, Q, T / n); near(s[0], 0.05, 2e-4, "simple pendulum limit"); }
/* damping removes energy */
{ const Q = D.params({ c: 0.3 }), s = [1, 1, 0, 0], E0 = D.energy(s, Q).E; for (let i = 0; i < 5000; i++) D.step(s, Q, 0.002); ok(D.energy(s, Q).E < E0 - 1, "damped"); }
/* the butterfly effect: a difference of 1e-9 rad grows past 1 rad within a few tens of seconds */
{ const a = [2.5, 2.0, 0, 0], b = [2.5 + 1e-9, 2.0, 0, 0]; let t = 0, grow = null, last0 = 1e-9; for (let i = 0; i < 25000; i++) { D.step(a, P, 0.002); D.step(b, P, 0.002); t += 0.002; if (grow === null && Math.hypot(a[0] - b[0], a[1] - b[1]) > 1) grow = t; }
  ok(grow !== null && grow < 40, "1e-9 difference reaches 1 rad (at t = " + grow + ")"); }
/* flip map: centre can never flip (energy bound is exact), a high start flips fast, the bound agrees with the integration */
ok(!D.canFlip(0, 0, P) && D.flipTime(0, 0, P, 10, 0.005) === Infinity, "hanging straight never flips");
ok(!D.canFlip(1.0, 1.0, P), "gentle start cannot flip");
{ const t = D.flipTime(2.6, 2.9, P, 10, 0.005); ok(isFinite(t) && t < 1, "high start flips quickly (" + t + " s)"); const t2 = D.flipTime(2.6, 2.9, P, 10, 0.0025); near(t, t2, 0.05, "flip time stable under a smaller step"); }
{ const E = D.flipEnergy(P); near(E, -(2) * 9.81 + 9.81, 1e-12, "flip energy for equal masses = -m g l"); /* just below the bound: never */ let any = false; for (let a = -3; a <= 3 && !any; a += 0.1) for (let b = -3; b <= 3; b += 0.1) if (!D.canFlip(a, b, P) && isFinite(D.flipTime(a, b, P, 4, 0.01))) { any = true; break; } ok(!any, "no start below the energy bound ever flips"); }
/* the map is fast enough: 60x60 cells for 10 s in a few seconds */
{ const t0 = Date.now(); let flips = 0; for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) if (isFinite(D.flipTime(-Math.PI + (i + 0.5) * 2 * Math.PI / 60, -Math.PI + (j + 0.5) * 2 * Math.PI / 60, P, 10, 0.005))) flips++; const dt = Date.now() - t0; ok(dt < 6000, "60x60 map time " + dt + " ms"); ok(flips > 600 && flips < 3200, "plausible flip count " + flips); console.log("map 60x60:", dt, "ms,", flips, "flipping cells"); }
/* positions */
{ const p = D.positions([Math.PI / 2, 0, 0, 0], P); near(p.x1, 1, 1e-12, "x1"); near(p.y1, 0, 1e-12, "y1"); near(p.y2, -1, 1e-12, "y2"); }
console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
