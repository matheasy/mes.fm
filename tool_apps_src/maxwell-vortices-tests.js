/* node tool_apps_src/maxwell-vortices-tests.js */
const V = require("./maxwell-vortices/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
function rel(a, b, tol, m) { ok(Math.abs(a / b - 1) <= tol, m + " (got " + a + ", want " + b + " rel " + tol + ")"); }
const MU0 = V.MU0;

/* --- straight wire --- */
rel(V.wireB(1, 1), 2e-7, 1e-9, "1 A at 1 m: 2e-7 T");
rel(V.wireB(10, 0.02), 1e-4, 1e-9, "10 A at 2 cm: 100 uT");
{ const B = V.segB([0.05, 0, 0], [0, 0, -1000], [0, 0, 1000], 10, [0, 0, 0]);
  rel(B[1], V.wireB(10, 0.05), 1e-6, "long segment = infinite wire"); near(B[0], 0, 1e-15, "wire field has no radial part"); near(B[2], 0, 1e-15, "no part along the wire");
  ok(B[1] > 0, "current up +z, field at +x points +y (right-hand rule)"); }
{ /* a finite segment: half-infinite wire seen from its end plane gives half the field */
  const B = V.segB([0.1, 0, 0], [0, 0, 0], [0, 0, 1e6], 3, [0, 0, 0]); rel(B[1], V.wireB(3, 0.1) / 2, 1e-6, "semi-infinite wire: half the field"); }
{ /* field circles the wire: |B| the same all round, and B . r = 0 */
  for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4, P = [0.03 * Math.cos(t), 0.03 * Math.sin(t), 0.01], B = V.segB(P, [0, 0, -50], [0, 0, 50], 2, [0, 0, 0]);
    rel(Math.hypot(B[0], B[1]), V.wireB(2, 0.03), 1e-6, "ring around the wire at " + (45 * k) + " deg"); near(B[0] * P[0] + B[1] * P[1], 0, 1e-12, "B perpendicular to r"); } }

/* --- loop --- */
{ const R = 0.05, I = 7, pts = V.circleXZ(R, 720);
  rel(Math.abs(V.pathB([0, 0, 0], pts, I, true)[1]), V.loopCentreB(I, R), 2e-5, "polygon loop centre = mu0 I / 2R");
  for (const z of [0.01, 0.05, 0.12, 0.4]) rel(Math.abs(V.pathB([0, z, 0], pts, I, true)[1]), V.loopAxisB(I, R, z), 2e-5, "loop on the axis at " + z + " m = mu0 I R^2 / 2 (R^2+z^2)^1.5");
  const Bc = V.pathB([0, 0.02, 0], pts, I, true); near(Bc[0], 0, 1e-12, "axis field has no x part"); near(Bc[2], 0, 1e-12, "axis field has no z part");
  ok(Bc[1] < 0, "current from +x towards +z: moment and axis field along -y");
  rel(V.loopCentreB(1, 1), MU0 / 2, 1e-12, "loopCentreB");
  /* far away the loop is a dipole: on the axis and off it */
  const mu = I * Math.PI * R * R;
  rel(V.loopAxisB(I, R, 100 * R), V.dipoleAxisB(mu, 100 * R), 2e-4, "far on the axis: loop -> dipole (z = 100 R)");
  ok(Math.abs(V.loopAxisB(I, R, 3 * R) / V.dipoleAxisB(mu, 3 * R) - 1) > 0.1, "close by it is not yet a dipole (z = 3R)");
  for (const P of [[0.6, 0.8, 0.1], [1.2, -0.5, 0.7], [0, 0, 1.5]]) { const Bl = V.pathB(P, pts, I, true), Bd = V.dipoleB([0, -mu, 0], P);
    rel(V.norm(Bl), V.norm(Bd), 3e-3, "far field off the axis = dipole |B| at " + P); ok(V.dot(Bl, Bd) / V.norm(Bl) / V.norm(Bd) > 0.9999, "same direction as the dipole at " + P); } }
/* --- bending a wire into a loop --- */
{ const R = 1, b0 = V.bendPath(R, 0, 96), b1 = V.bendPath(R, 1, 96);
  near(b0.pts[1][0], 0, 1e-12, "s = 0: the wire is straight at x = 0"); near(b1.cross[0], 1, 1e-12, "s = 1: crossing at x = R");
  const len = p => { let s = 0; for (let i = 1; i < p.length; i++) s += V.norm(V.sub(p[i], p[i - 1])); return s; };
  for (const s of [0, 0.3, 0.7, 1]) { const b = V.bendPath(R, s, 400), arc = b.pts.slice(1, -1); rel(len(arc), 2 * Math.PI * R, 1e-4, "bent wire keeps its length 2 pi R at s = " + s); }
  /* at s = 1 the leads lie on top of each other and cancel: the field near the loop is the loop's own */
  const Bl = V.pathB([0, 0.3, 0], b1.pts, 1, true), Bc = V.pathB([0, 0.3, 0], V.circleXZ(1, 96), 1, true);
  rel(Bl[1], Bc[1], 1e-3, "fully bent wire (with its leads) = loop near the centre");
  /* s = 0: close to the middle of the wire it is a straight wire */
  rel(Math.abs(V.pathB([0.05, 0, 0], b0.pts, 1, true)[1]), V.wireB(1, 0.05), 0.02, "unbent: near the wire like mu0 I / 2 pi r"); }

/* --- a charge going round --- */
{ const b = V.bohr(); rel(b.mu, V.MUB, 1e-8, "Bohr orbit: mu = e v r / 2 = Bohr magneton"); rel(b.mu, V.orbitCurrent(V.E, b.v, b.r) * Math.PI * b.r * b.r, 1e-12, "mu = I pi r^2");
  rel(b.L, V.HBAR, 1e-8, "Bohr orbit angular momentum = hbar"); rel(b.mu / b.L, V.E / (2 * V.ME), 1e-8, "orbit gyromagnetic ratio e / 2m");
  rel(b.f, 6.5797e15, 1e-4, "Bohr orbit: 6.58e15 turns per second"); rel(b.I, 1.0542e-3, 1e-3, "Bohr orbit average current about 1.05 mA");
  rel(V.loopCentreB(b.I, b.r), 12.52, 2e-3, "field at the proton about 12.5 T"); }
rel(V.orbitMoment(2, 3, 4), 12, 1e-12, "mu = q v r / 2");
near(V.ringsMoment([{ q: 1, r: 1 }, { q: -1, r: 1 }], 5), 0, 1e-15, "equal + and - rings at one radius: no moment");
ok(V.ringsMoment([{ q: 1, r: 0.5 }, { q: -1, r: 1 }], 1) < 0, "neutral: + inside, - outside, turning together: a moment against the spin");
rel(V.ballMoment(1, 2, 3), 1 * 3 * 4 / 5, 1e-12, "spinning charged ball: q w r^2 / 5");
ok(V.ballEquatorSpeed(2.7928 * V.MUN, V.E, 0.84e-15) > V.C, "a classical spinning proton would need its surface faster than light");
{ /* moving charge right now: Biot-Savart for a point charge */
  const B = V.chargeB([0, 0, 1], [0, 0, 0], [1, 0, 0], 1); near(B[1], -1e-7, 1e-15, "q v x r / r^3 at 1 m"); }

/* --- Maxwell's cells and idle wheels: kinematics --- */
for (const [wi, wj] of [[1, 1], [1, -1], [2.5, -0.3], [-1, 0], [0.7, 0.7]]) { const a = 0.38, b = 0.12, c = V.contactSpeeds(a, b, wi, wj);
  near(c.cellI, c.wheelI, 1e-12, "wheel rolls on cell i without slipping (" + wi + ", " + wj + ")"); near(c.cellJ, c.wheelJ, 1e-12, "wheel rolls on cell j without slipping (" + wi + ", " + wj + ")"); }
near(V.wheelKin(0.38, 0.12, 2, 2).V, 0, 1e-15, "uniform field: idle wheels spin in place (no current)");
rel(V.wheelKin(0.38, 0.12, 2, 2).W, -0.38 * 2 / 0.12, 1e-12, "uniform field: wheels spin the other way, faster by a/b");
rel(V.wheelKin(0.4, 0.1, 1, -1).V, 0.4, 1e-12, "opposite spins: the wheel travels (a current)");
{ /* lattice: a uniform spin is a steady state; energy is conserved in an insulator; the twist travels at the predicted speed */
  const L = V.lattice({ nx: 10, ny: 8 }); L.w.fill(1.5); const e0 = V.energy(L); for (let i = 0; i < 200; i++) V.step(L, 0.01);
  ok(L.w.every(w => Math.abs(w - 1.5) < 1e-12), "uniform field stays uniform"); ok(L.v.every(v => Math.abs(v) < 1e-12), "and no wheel moves"); rel(V.energy(L), e0, 1e-12, "energy unchanged");
  ok(Math.abs(L.b - (0.5 - L.a)) < 1e-15, "wheels fill the gap: a + b = half the spacing"); }
{ const L = V.lattice({ nx: 30, ny: 30 }); for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) L.th[y * 30 + x] = 0; /* twist the middle and release */
  for (let e = 0; e < L.M; e++) { const ci = L.ei[e], cj = L.ej[e], xi = ci % 30 - 14.5, yi = Math.floor(ci / 30) - 14.5, xj = cj % 30 - 14.5, yj = Math.floor(cj / 30) - 14.5;
    const g = (x, y) => Math.exp(-(x * x + y * y) / 6); L.u[e] = L.a * (g(xi, yi) - g(xj, yj)) / 2; }
  const e0 = V.energy(L), dt = V.stableDt(L) / 8; let emax = e0, emin = e0;
  for (let i = 0; i < 8000; i++) { V.step(L, dt); const e = V.energy(L); emax = Math.max(emax, e); emin = Math.min(emin, e); }
  ok(e0 > 0 && (emax - emin) / e0 < 0.02, "released twist: energy stays put (symplectic), spread " + ((emax - emin) / e0).toFixed(4));
  near(V.angMom(L), 0, 1e-9, "a released twist creates no net spin"); }
{ /* wave speed along a 1-cell-high strip: theta'' = c^2 theta_xx; a long gentle wave of length lambda has period lambda / c */
  const nx = 200, L = V.lattice({ nx: nx, ny: 1 }), c = V.waveSpeed(L), lam = 100, kx = 2 * Math.PI / lam;
  for (let x = 0; x < nx; x++) { L.th[x] = Math.cos(kx * (x + 0.5)); } /* a free-ended (Neumann) mode */
  for (let e = 0; e < L.M; e++) L.u[e] = L.a * (L.th[L.ei[e]] - L.th[L.ej[e]]) / 2;
  /* standing wave: omega starts at 0, after a quarter period the strain energy has gone into spin */
  const T = lam / c, dt = T / 4000; for (let i = 0; i < 1000; i++) V.step(L, dt);
  const keQ = L.w.reduce((s, w) => s + w * w, 0); let pe = 0; for (let e = 0; e < L.M; e++) pe += L.u[e] * L.u[e];
  ok(pe * L.k < 0.02 * keQ * L.I, "after a quarter of the predicted period the twist energy has turned into spin (wave speed a sqrt(k / 4I))"); }
{ /* steady current: a row of conducting wheels pushed with force F settles at speed F / g, with the cells on the two sides spinning opposite ways */
  const L = V.lattice({ nx: 6, ny: 6, g: 4 }), row = [];
  for (let x = 0; x < 6; x++) { const e = V.edgeAt(L, x, 2, x, 3); row.push(e); L.cond[e] = 1; L.src[e] = -2; } /* t = -x on vertical edges: -2 pushes towards +x */
  const dt = V.stableDt(L) / 2; for (let i = 0; i < 60000; i++) V.step(L, dt);
  rel(V.current(L, row), -2 / 4, 2e-3, "steady current: wheel speed = push / friction");
  ok(L.w[5 * 6 + 2] > 0 && L.w[0 * 6 + 2] < 0, "cells above spin counter-clockwise, below clockwise (field circles the current)");
  near(V.angMom(L), 0, 1e-9, "the current only moves spin from one side to the other (total stays 0)");
  ok(Math.abs(L.w[5 * 6 + 2] - L.w[3 * 6 + 0]) < 1e-3, "each side ends up uniform"); }
{ /* induction: switching on a primary current drives a brief opposite current in a nearby secondary */
  const L = V.lattice({ nx: 8, ny: 12, g: 4 }), P = [], S = [];
  for (let x = 0; x < 8; x++) { const e = V.edgeAt(L, x, 4, x, 5); P.push(e); L.cond[e] = 1; L.src[e] = -2; const f = V.edgeAt(L, x, 7, x, 8); S.push(f); L.cond[f] = 1; }
  const dt = V.stableDt(L) / 2; let smin = 0, smax = 0; for (let i = 0; i < 40000; i++) { V.step(L, dt); const s = V.current(L, S), p = V.current(L, P); if (s * p < 0) smin = Math.max(smin, Math.abs(s)); else smax = Math.max(smax, Math.abs(s)); }
  ok(smin > 0.01, "switching on: the secondary first runs the opposite way (Lenz), peak " + smin.toFixed(3));
  near(V.current(L, S), 0, 2e-3, "then dies away once the current is steady"); }

/* --- two magnets --- */
{ const m = 1, d = 0.08, F = (m1, m2, r) => V.dipoleForce(m1, m2, r), x = [1, 0, 0], y = [0, 1, 0];
  const ht = F([m, 0, 0], [m, 0, 0], [d, 0, 0]); ok(ht[0] < 0, "head to tail in a line: attract"); rel(-ht[0], 6 * V.MU0 * m * m / (4 * Math.PI * d ** 4), 1e-12, "coaxial force 6 mu0 m^2 / 4 pi r^4");
  const hh = F([m, 0, 0], [-m, 0, 0], [d, 0, 0]); ok(hh[0] > 0, "head to head: repel");
  const sp = F([m, 0, 0], [m, 0, 0], [0, d, 0]); ok(sp[1] > 0, "side by side, same way: repel"); rel(sp[1], 3 * V.MU0 * m * m / (4 * Math.PI * d ** 4), 1e-12, "side-by-side force 3 mu0 m^2 / 4 pi r^4");
  const sa = F([m, 0, 0], [-m, 0, 0], [0, d, 0]); ok(sa[1] < 0, "side by side, opposite: attract");
  const a = F([0.3, 0.5, 0], [-0.2, 0.7, 0.1], [0.05, -0.03, 0.02]), b = V.dipoleForce([-0.2, 0.7, 0.1], [0.3, 0.5, 0], [-0.05, 0.03, -0.02]);
  near(a[0] + b[0], 0, 1e-12, "Newton's third law x"); near(a[1] + b[1], 0, 1e-12, "Newton's third law y");
  /* force = -grad U */
  const m1 = [0.3, 0.5, 0], m2 = [-0.2, 0.7, 0.1], r = [0.05, -0.03, 0.02], h = 1e-7;
  for (let k = 0; k < 3; k++) { const rp = r.slice(), rm = r.slice(); rp[k] += h; rm[k] -= h; near(a[k], -(V.dipoleEnergy(m1, m2, rp) - V.dipoleEnergy(m1, m2, rm)) / (2 * h), 1e-5 * V.norm(a), "F = -grad U, component " + k); }
  ok(V.dipoleEnergy([m, 0, 0], [m, 0, 0], [d, 0, 0]) < 0 && V.dipoleEnergy([m, 0, 0], [-m, 0, 0], [d, 0, 0]) > 0, "energy low when attracting, high when repelling");
  const tq = V.dipoleTorque([m, 0, 0], [0, m, 0], [d, 0, 0]); ok(tq[2] < 0, "T shape: the second magnet is turned to line up head to tail");
  /* Maxwell's stress round the second magnet gives the same force */
  const m1b = [1, 0.4, 0], m2b = [0.2, -1, 0], c2 = [0.06, 0.03, 0], Bt = P => V.add(V.dipoleB(m1b, P), V.dipoleB(m2b, V.sub(P, c2)));
  const Fs = V.stressForce(Bt, c2, 0.03, 80, 160), Fd = V.dipoleForce(m1b, m2b, c2);
  rel(V.norm(Fs), V.norm(Fd), 3e-3, "Maxwell stress integral = dipole force (size)"); ok(V.dot(Fs, Fd) / V.norm(Fs) / V.norm(Fd) > 0.9999, "Maxwell stress integral = dipole force (direction)"); }
rel(V.barMoment(1.2, 2e-6), 1.2 * 2e-6 / V.MU0, 1e-12, "bar magnet m = Br V / mu0");
ok(V.PAIRS.length === 5, "five preset pairs");
/* streamline closes round a wire */
{ const f = (x, y) => { const B = V.segB([x, y, 0], [0, 0, -100], [0, 0, 100], 1, [0, 0, 0]); return [B[0], B[1]]; }, s = V.streamline(f, 1, 0, { h: 0.01, n: 2000 });
  ok(s.closed, "a field line round a straight wire closes"); const r = s.pts.map(p => Math.hypot(p[0], p[1])); ok(Math.max(...r) - Math.min(...r) < 1e-3, "and it is a circle"); }

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
