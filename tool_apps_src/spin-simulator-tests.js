/* node tool_apps_src/spin-simulator-tests.js */
const S = require("./spin-simulator/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
function rel(a, b, tol, m) { ok(Math.abs(a / b - 1) <= tol, m + " (got " + a + ", want " + b + " rel " + tol + ")"); }
const D = Math.PI / 180;

/* --- neutrons: de Broglie and Larmor --- */
rel(S.speedFromLambda(1.8), 2197.8, 2e-3, "1.8 A neutron moves at about 2198 m/s");
rel(S.lambdaFromSpeed(S.speedFromLambda(1.445)), 1.445, 1e-12, "lambda <-> speed round trip");
rel(S.energyMeV(2200), 25.3, 3e-3, "2200 m/s thermal neutron = 25.3 meV");
rel(S.larmorFreq(1), 29.1647e6, 1e-4, "neutron Larmor frequency 29.16 MHz per tesla");
{ const v = 2000, L = 0.03, B = S.fieldFor(4 * Math.PI, L, v); rel(S.larmor(B, L, v), 4 * Math.PI, 1e-12, "fieldFor inverts larmor");
  rel(S.fringePeriodB(L, v, 0.5), 2 * S.fringePeriodB(L, v, 1), 1e-12, "spin-1/2 fringe period is twice the vector one");
  rel(S.periodDeg(S.fringePeriodB(L, v, 0.5), L, v), 720, 1e-12, "spin-1/2 period = 720 degrees of precession"); }
/* Werner-like settings: 1.445 A, 2.96 cm, 4 pi needs about 63 G */
{ const v = S.speedFromLambda(1.445), B = S.fieldFor(4 * Math.PI, 0.0296, v); near(B * 1e4, 63.4, 1, "Werner-like 4 pi field about 63 G"); }
/* --- the 720 degree repeat --- */
near(S.intensity(0, {}), 1, 1e-12, "no field: all in O");
near(S.intensity(360 * D, {}), 0, 1e-12, "spin 1/2 at 360: O dark");
near(S.intensity(720 * D, {}), 1, 1e-12, "spin 1/2 at 720: bright again");
near(S.intensity(360 * D, { spin: 1 }), 1, 1e-12, "classical vector at 360: back to bright");
near(S.intensity(180 * D, { spin: 1 }), 0, 1e-12, "classical vector at 180: dark");
near(S.intensity(360 * D, { beam: "H" }), 1, 1e-12, "the other beam takes the neutrons");
near(S.intensity(1.3, { vis: 0.4 }) + S.intensity(1.3, { vis: 0.4, beam: "H" }), 1, 1e-12, "O + H = 1");
near(S.intensity(0, { vis: 0.3 }), 0.65, 1e-12, "contrast 30%: max 0.65");
near(S.intensity(0, { chi: Math.PI }), 0, 1e-12, "phase shifter pi swaps O and H");
{ const p = S.spinorPhase(2 * Math.PI); near(p.re, -1, 1e-12, "spinor turned 360 is minus itself"); const q = S.spinorPhase(4 * Math.PI); near(q.re, 1, 1e-12, "spinor turned 720 is itself");
  near(S.vectorPhase(2 * Math.PI).re, 1, 1e-12, "a vector turned 360 is itself"); }
/* --- Poisson counts --- */
{ const r = S.rng(3); let s = 0, s2 = 0; const n = 20000; for (let i = 0; i < n; i++) { const k = S.poisson(7.5, r); s += k; s2 += k * k; } const m = s / n, v = s2 / n - m * m; near(m, 7.5, 0.1, "Poisson mean"); near(v, 7.5, 0.3, "Poisson variance = mean");
  let t = 0; for (let i = 0; i < n; i++) t += S.poisson(400, r); near(t / n, 400, 1, "large-mean Poisson"); ok(S.poisson(0, r) === 0, "zero mean gives zero"); }
/* --- scan + fit recovers the period --- */
{ const v = S.speedFromLambda(1.445), L = 0.0296, P = S.fringePeriodB(L, v, 0.5), Bs = S.linspace(0, 2.6 * P, 31);
  const sc = S.scan({ Bs, L, v, rate: 50, t: 60, vis: 0.35, bg: 5, seed: 11 });
  ok(sc.n.length === 31 && sc.n.every(Number.isInteger), "scan gives whole counts");
  const f = S.fitPeriod(sc.x, sc.n, 0.4 * P, 2.5 * P); rel(f.P, P, 0.03, "fit finds the spin-1/2 period"); ok(f.err > 0 && f.err < 0.05 * P, "fit error small but positive (" + f.err / P + ")");
  ok(Math.abs(f.P - P) < 3 * f.err, "true period within 3 sigma");
  near(S.periodDeg(f.P, L, v), 720, 25, "fitted period in degrees about 720"); near(f.vis, 0.35 * 50 / 55, 0.06, "fitted contrast includes the background");
  const sv = S.scan({ Bs, L, v, rate: 50, t: 60, vis: 0.35, bg: 5, seed: 12, spin: 1 }), fv = S.fitPeriod(sv.x, sv.n, 0.3 * P, 2.5 * P); rel(fv.P, P / 2, 0.04, "a vector beam would show 360"); }
{ const x = S.linspace(0, 10, 41), y = x.map(t => 100 + 40 * Math.cos(2 * Math.PI * t / 3.7 + 0.4)); const f = S.fitPeriod(x, y, 1, 8); rel(f.P, 3.7, 1e-4, "noise-free fit exact"); near(f.vis, 0.4, 1e-3, "noise-free contrast"); near(f.phase, 0.4, 1e-3, "noise-free phase"); }
near(S.coilCurrent(6.3e-3, 2000), 2.507, 0.01, "63 G from 2000 turns/m needs 2.5 A");

/* --- Einstein-de Haas --- */
rel(S.gammaPrime(2), 1.7588e11, 1e-4, "gamma for g = 2 is e/m");
{ const m = S.matOf("iron"), c = S.cylinder({ r: 1e-3, len: 0.05, rho: m.rho, Ms: m.Ms }); rel(c.m, 1.237e-3, 3e-3, "1 mm x 5 cm iron rod weighs 1.24 g"); rel(c.muSat, 0.2686, 3e-3, "its saturation moment");
  const dL = S.kickL(2 * c.muSat, m.g); rel(dL, 2 * c.muSat * 2 * S.C.me / (m.g * S.C.e), 1e-12, "kick = 2 mu / gamma'"); rel(S.gFrom(2 * c.muSat, dL), 1.92, 1e-12, "g' from kick round trip");
  near(S.electronL(c.muSat, m.g) + S.kickL(c.muSat, m.g), 0, 1e-25, "body + electrons = 0");
  /* free rod: flip once */
  const sim = S.EdH({ I: c.I, kappa: 0, c: 0, tauM: 0.02, g: m.g, muSat: c.muSat }); sim.setField(1); sim.step(0.5);
  rel(sim.s.w, S.kickL(c.muSat, m.g) / c.I, 1e-6, "free rod spins at mu/(gamma' I) after switching on"); near(sim.total(), 0, 1e-20, "free rod: body + electrons = 0");
  sim.setField(-1); sim.step(0.5); rel(sim.s.w, -S.kickL(c.muSat, m.g) / c.I, 1e-6, "reversing turns it the other way");
  rel(sim.gMeasured(), 1.92, 1e-3, "measured g' = material g'");
  /* on a fibre */
  const k = S.kappaFor(c.I, 4), f = S.EdH({ I: c.I, kappa: k, c: 0, tauM: 0.01, g: m.g, muSat: c.muSat }); f.setField(1); let mx = 0; for (let i = 0; i < 400; i++) { f.step(0.01); mx = Math.max(mx, Math.abs(f.s.th)); }
  rel(mx, S.flipAmp(S.kickL(c.muSat, m.g), c.I, k), 0.01, "first swing = dL / sqrt(I kappa)"); near(f.total(), 0, 1e-17, "with a fibre the lab takes the rest: total still 0");
  ok(Math.abs(f.Lb()) < 1.01 * Math.abs(f.Le()), "fibre: body angular momentum swings, bounded by the kick");
  rel(f.gMeasured(), 1.92, 0.01, "g' measured on a fibre too");
  /* resonance: amplitude grows with each reversal */
  const g = S.EdH({ I: c.I, kappa: k, c: 0, tauM: 0.01, g: m.g, muSat: c.muSat }); g.setAC(0.25); let a1 = 0, a5 = 0; for (let i = 0; i < 2000; i++) { g.step(0.01); const t = g.s.t; if (t < 4) a1 = Math.max(a1, Math.abs(g.s.th)); if (t > 16) a5 = Math.max(a5, Math.abs(g.s.th)); }
  ok(a5 > 3.5 * a1, "reversing at the fibre's frequency builds up the swing (" + a1 + " -> " + a5 + ")"); near(g.total(), 0, 1e-16, "resonance: total 0");
  /* damping limits it */
  const h = S.EdH({ I: c.I, kappa: k, c: c.I * 0.2, tauM: 0.01, g: m.g, muSat: c.muSat }); h.setAC(0.25); for (let i = 0; i < 6000; i++) h.step(0.01); let b1 = 0; for (let i = 0; i < 400; i++) { h.step(0.01); b1 = Math.max(b1, Math.abs(h.s.th)); } let b2 = 0; for (let i = 0; i < 400; i++) { h.step(0.01); b2 = Math.max(b2, Math.abs(h.s.th)); }
  rel(b2, b1, 0.03, "damped resonance reaches a steady swing");
  /* noise makes the measurement scatter but stays near */
  const nz = S.EdH({ I: c.I, kappa: 0, c: 0, tauM: 0.02, g: m.g, muSat: c.muSat, noise: 2e-13, seed: 5 }); for (let i = 0; i < 8; i++) { nz.setField(i % 2 ? -1 : 1); nz.step(0.4); } ok(isFinite(nz.gMeasured()) && Math.abs(nz.gMeasured() - 1.92) < 0.5, "noisy g' still near 1.92 (" + nz.gMeasured() + ")");
  ok(Math.abs(S.matOf("orbit").g - 1) < 1e-12 && S.matOf("nope").id === "iron", "materials lookup"); }

/* --- Barnett --- */
{ const w = S.rpmToOmega(6000); rel(w, 628.3, 1e-3, "6000 rpm = 628 rad/s"); const b = S.barnett(w, 100, 1.92, 1e-4);
  rel(b.B, w / S.gammaPrime(1.92), 1e-12, "equivalent field omega / gamma'"); ok(b.B > 3e-9 && b.B < 4.5e-9, "about 4 nT at 6000 rpm"); ok(b.M < 0 && b.mu < 0, "electrons: moment points against the spin");
  rel(b.M, -100 * b.B / S.C.mu0, 1e-12, "M = chi H"); ok(b.Le > 0, "electrons' angular momentum along the rotation");
  rel(S.barnett(2 * w, 100, 1.92, 1e-4).M, 2 * b.M, 1e-12, "twice the speed, twice the magnetization");
  rel(S.dipoleField(1, 0.1, true), 2e-4, 1e-6, "dipole field on axis 2e-7 mu / d^3"); }

console.log(pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
