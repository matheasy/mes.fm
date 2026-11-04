/* node tool_apps_src/quaternions-tests.js */
const Q = require("./quaternions/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + ")"); }
function qnear(a, b, tol, m) { ok(Q.near(a, b, tol || 1e-12), m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function vnear(a, b, tol, m) { ok(Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol, m + " (got " + JSON.stringify(a) + ")"); }
function mnear(A, B, tol, m) { let e = 0; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs(A[r][c] - B[r][c])); ok(e < tol, m + " (max err " + e + ")"); }
const D = Math.PI / 180, { ONE, I, J, K } = Q, m1 = Q.neg(ONE);
let seed = 12345; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function rq() { let v; do { v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; } while (Q.norm(v) < 0.2); return Q.normalize(v); }

/* --- Hamilton's rules --- */
qnear(Q.mul(I, I), m1, 0, "i² = −1"); qnear(Q.mul(J, J), m1, 0, "j² = −1"); qnear(Q.mul(K, K), m1, 0, "k² = −1");
qnear(Q.mulAll([I, J, K]), m1, 0, "ijk = −1");
qnear(Q.mul(I, J), K, 0, "ij = k"); qnear(Q.mul(J, K), I, 0, "jk = i"); qnear(Q.mul(K, I), J, 0, "ki = j");
qnear(Q.mul(J, I), Q.neg(K), 0, "ji = −k"); qnear(Q.mul(K, J), Q.neg(I), 0, "kj = −i"); qnear(Q.mul(I, K), Q.neg(J), 0, "ik = −j");
const T = Q.table(), want = [["1", "i", "j", "k"], ["i", "−1", "k", "−j"], ["j", "−k", "−1", "i"], ["k", "j", "−i", "−1"]];
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) ok(T[r][c] === want[r][c], "table " + r + "," + c + " = " + want[r][c] + " (got " + T[r][c] + ")");
qnear(Q.word("ijk"), m1, 0, "word ijk"); qnear(Q.word("ijkijk"), ONE, 0, "(ijk)² = +1"); qnear(Q.word("iiii"), ONE, 0, "i⁴ = 1"); qnear(Q.word("-1 i"), Q.neg(I), 0, "−1·i");
ok(Q.basisName([0, 0, 0, -1]) === "−k", "basisName −k"); ok(Q.basisName([0.5, 0.5, 0.5, 0.5]) === null, "basisName of a general q is null");
/* associativity, norm is multiplicative, conjugate of a product */
for (let t = 0; t < 200; t++) { const a = Q.scale(rq(), 1 + rnd()), b = Q.scale(rq(), 0.5 + rnd()), c = rq();
	if (t < 50) { qnear(Q.mul(Q.mul(a, b), c), Q.mul(a, Q.mul(b, c)), 1e-12, "associative " + t); near(Q.norm(Q.mul(a, b)), Q.norm(a) * Q.norm(b), 1e-12, "|ab| = |a||b| " + t);
		qnear(Q.conj(Q.mul(a, b)), Q.mul(Q.conj(b), Q.conj(a)), 1e-12, "(ab)* = b*a* " + t); qnear(Q.mul(a, Q.inv(a)), ONE, 1e-12, "a·a⁻¹ = 1 " + t); } }
ok(Q.inv([0, 0, 0, 0]) === null, "zero has no inverse");

/* --- half-turns: i, j, k are 180° turns about x, y, z --- */
qnear(Q.fromAxisAngle([1, 0, 0], Math.PI), I, 1e-15, "half-turn about x = i");
qnear(Q.fromAxisAngle([0, 1, 0], Math.PI), J, 1e-15, "half-turn about y = j");
qnear(Q.fromAxisAngle([0, 0, 1], Math.PI), K, 1e-15, "half-turn about z = k");
qnear(Q.fromAxisAngle([0, 0, 1], 2 * Math.PI), m1, 1e-15, "360° = −1"); qnear(Q.fromAxisAngle([0.3, 0.2, 0.9], 4 * Math.PI), ONE, 1e-15, "720° = +1");
vnear(Q.rotate(I, [0, 1, 0]), [0, -1, 0], 1e-15, "i turns y to −y"); vnear(Q.rotate(K, [1, 0, 0]), [-1, 0, 0], 1e-15, "k turns x to −x");
vnear(Q.rotate(Q.fromAxisAngle([0, 0, 1], Math.PI / 2), [1, 0, 0]), [0, 1, 0], 1e-15, "90° about z: x -> y (right hand)");
vnear(Q.rotate(Q.fromAxisAngle([1, 1, 1], 2 * Math.PI / 3), [1, 0, 0]), [0, 1, 0], 1e-12, "120° about (1,1,1) cycles x -> y");
/* right-multiplying = turning about the body's own axes: (i then body j) looks like k */
mnear(Q.toMatrix(Q.mul(I, J)), Q.toMatrix(K), 1e-12, "i·j looks like a half-turn about z");
mnear(Q.toMatrix(Q.mul(J, I)), Q.toMatrix(K), 1e-12, "j·i looks the same as i·j (only the sign differs)");
ok(Q.sameRotation(Q.mul(I, J), Q.mul(J, I)), "ij and ji are the same rotation"); ok(!Q.near(Q.mul(I, J), Q.mul(J, I)), "but not the same quaternion");
mnear(Q.toMatrix(Q.word("ijk")), Q.toMatrix(ONE), 1e-12, "ijk looks like no turn at all");
/* body-frame composition matches the matrix product */
for (let t = 0; t < 30; t++) { const a = rq(), b = rq(); mnear(Q.toMatrix(Q.mul(a, b)), Q.matMul(Q.toMatrix(a), Q.toMatrix(b)), 1e-12, "R(ab) = R(a)R(b) " + t); }

/* --- conversions round-trip --- */
for (let t = 0; t < 300; t++) {
	const a = rq(), R = Q.toMatrix(a);
	if (t < 40) { const ck = Q.matCheck(R); ok(ck.isRotation && Math.abs(ck.det - 1) < 1e-12, "toMatrix is a rotation " + t);
		const b = Q.fromMatrix(R); ok(Q.sameRotation(a, b, 1e-12) && b[0] >= 0, "matrix -> quaternion round trip " + t);
		const v = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]; vnear(Q.rotate(a, v), Q.matVec(R, v), 1e-12, "q v q* = R v " + t);
		vnear(Q.rotate(Q.neg(a), v), Q.rotate(a, v), 1e-12, "−q turns v the same way " + t);
		const aa = Q.toAxisAngle(a), b2 = Q.fromAxisAngle(aa.axis, aa.angle); qnear(b2, a, 1e-12, "axis-angle round trip (spinor form keeps the sign) " + t);
		const rr = Q.toAxisAngle(a, { reduce: true }); ok(rr.angle <= Math.PI + 1e-12 && Q.sameRotation(Q.fromAxisAngle(rr.axis, rr.angle), a), "reduced axis-angle <= 180° " + t);
		const st = Q.rotateSteps(a, v); vnear(st.v, Q.rotate(a, v), 1e-12, "rotateSteps " + t); near(st.qpq[0], 0, 1e-12, "q v q* has no real part " + t); }
	const o = Q.ORDERS[t % 6], e = Q.toEuler(a, o); ok(!e.gimbal, "random q is not at gimbal lock " + t);
	ok(Q.sameRotation(Q.fromEuler(e.angles, o), a, 1e-10), "Euler " + o + " round trip " + t);
	if (t < 60) mnear(Q.eulerToMatrix(e.angles, o), R, 1e-10, "Euler matrix " + o + " " + t);
	if (t < 60) ok(Math.abs(e.angles[1]) <= Math.PI / 2 + 1e-12, "middle angle in [−90°, 90°] " + o);
}
/* Euler orders: the meaning of "XYZ" and "ZYX" */
mnear(Q.eulerToMatrix([0.3, 0.4, 0.5], "XYZ"), Q.matMul(Q.matMul(Q.rotAxis(0, 0.3), Q.rotAxis(1, 0.4)), Q.rotAxis(2, 0.5)), 1e-14, "XYZ = Rx Ry Rz");
mnear(Q.eulerToMatrix([0.3, 0.4, 0.5], "ZYX"), Q.matMul(Q.matMul(Q.rotAxis(2, 0.3), Q.rotAxis(1, 0.4)), Q.rotAxis(0, 0.5)), 1e-14, "ZYX = Rz Ry Rx");
ok(Q.sameRotation(Q.fromEuler([0.3, 0.4, 0.5], "ZYX"), Q.fromMatrix(Q.eulerToMatrix([0.3, 0.4, 0.5], "ZYX")), 1e-12), "fromEuler = eulerToMatrix");
/* a known one: yaw 90° then pitch 90° (ZYX) sends the nose (x) straight down */
vnear(Q.rotate(Q.fromEuler([90 * D, 90 * D, 0], "ZYX"), [1, 0, 0]), [0, 0, -1], 1e-12, "yaw 90 pitch 90: nose down");
/* same rotation, different orders give different numbers */
{ const a = Q.fromEuler([20 * D, 30 * D, 40 * D], "XYZ"), z = Q.toEuler(a, "ZYX").angles; ok(Math.abs(z[0] - 40 * D) > 1e-3, "orders differ"); ok(Q.sameRotation(Q.fromEuler(z, "ZYX"), a, 1e-12), "but describe the same turn"); }

/* --- gimbal lock --- */
for (const o of Q.ORDERS) {
	const a = Q.fromEuler([0.7, Math.PI / 2, -0.4], o), e = Q.toEuler(a, o);
	ok(e.gimbal, "gimbal lock detected at middle 90°, " + o); near(Math.abs(e.angles[1]), Math.PI / 2, 1e-6, "middle 90° " + o);
	ok(Q.sameRotation(Q.fromEuler(e.angles, o), a, 1e-9), "locked decomposition still describes the turn " + o);
	/* at the lock only a ± c matters: shifting a and c together (one way or the other) gives the very same rotation */
	const up = Q.fromEuler([1.2, Math.PI / 2, 0.1], o), dn = Q.fromEuler([1.2, Math.PI / 2, -0.9], o);
	ok(Q.sameRotation(a, up, 1e-12) !== Q.sameRotation(a, dn, 1e-12), "first and last axes line up at the lock (one lost degree of freedom) " + o);
	const f = Q.toEuler(Q.fromEuler([0.7, 80 * D, -0.4], o), o); ok(!f.gimbal, "80° is not locked " + o); near(f.angles[0], 0.7, 1e-9, "80° keeps angles " + o);
}
near(Q.gimbalCloseness([0, Math.PI / 2, 0]), 1, 1e-12, "closeness 1 at 90°"); near(Q.gimbalCloseness([0, 0, 0]), 0, 1e-12, "closeness 0 at 0");

/* --- SLERP --- */
for (let t = 0; t < 40; t++) {
	const a = rq(), b = rq();
	qnear(Q.slerp(a, b, 0), a, 1e-12, "slerp(0) = q0 " + t);
	ok(Q.sameRotation(Q.slerp(a, b, 1), b, 1e-12), "slerp(1) = q1 (up to sign) " + t);
	near(Q.norm(Q.slerp(a, b, 0.37)), 1, 1e-12, "slerp stays unit " + t);
	const th = Q.angleBetween(a, b), sp = Q.angularSpeeds(u => Q.slerp(a, b, u), 64);
	ok(th <= Math.PI + 1e-12, "shortest path at most 180° " + t);
	ok(sp.every(s => Math.abs(s - th) < 1e-6), "constant angular speed " + t);
	near(Q.angleBetween(a, Q.slerp(a, b, 0.25)), 0.25 * th, 1e-9, "a quarter of the way = a quarter of the angle " + t);
	const d = Q.delta(a, b); ok(Q.sameRotation(Q.mul(d.q, a), b, 1e-12), "Δq·q0 = q1 " + t); near(d.aa.angle, th, 1e-9, "Δq angle = shortest angle " + t);
	/* the slerp path is one fixed axis: Δq(u) = Δq^u */
	const half = Q.slerp(a, b, 0.5), dh = Q.delta(a, half); vnear(dh.aa.axis, d.aa.axis, 1e-6, "slerp turns about one fixed axis " + t);
}
/* shortest path: q1 and −q1 give the same path; without it, the long way */
{ const a = Q.fromAxisAngle([0, 0, 1], 0), b = Q.neg(Q.fromAxisAngle([0, 0, 1], 60 * D));
  near(Q.angleBetween(a, Q.slerp(a, b, 1)), 60 * D, 1e-9, "shortest: 60° not 300°");
  { const lw = Q.toAxisAngle(Q.slerp(a, b, 0.5, false)); near(lw.angle, 150 * D, 1e-9, "long way: halfway is 150°"); near(lw.axis[2], -1, 1e-9, "turning the other way round"); }
  ok(Q.sameRotation(Q.slerp(a, b, 0.5), Q.fromAxisAngle([0, 0, 1], 30 * D), 1e-12), "shortest midpoint 30°"); }
{ const a = rq(), b = Q.slerp(a, rq(), 1e-5); near(Q.norm(Q.slerp(a, b, 0.5)), 1, 1e-12, "slerp of nearly equal quaternions stays unit"); }

/* --- Euler interpolation wobbles, SLERP does not --- */
{ const P = Q.POSES.find(p => p.id === "wrap"), e0 = P.A.e.map(x => x * D), e1 = P.B.e.map(x => x * D), q0 = Q.poseQ(P.A), q1 = Q.poseQ(P.B);
  const Le = Q.pathLength(u => Q.eulerLerp(e0, e1, u, "ZYX"), 400), Ls = Q.pathLength(u => Q.slerp(q0, q1, u), 400);
  near(Ls, Q.angleBetween(q0, q1), 1e-6, "slerp path length = shortest angle"); ok(Le > 5 * Ls, "Euler goes the long way round on 170 -> −170 (" + (Le / D).toFixed(0) + "° vs " + (Ls / D).toFixed(0) + "°)"); }
{ const P = Q.POSES.find(p => p.id === "lock"), e0 = P.A.e.map(x => x * D), e1 = P.B.e.map(x => x * D), q0 = Q.poseQ(P.A), q1 = Q.poseQ(P.B);
  const sp = Q.angularSpeeds(u => Q.eulerLerp(e0, e1, u, "ZYX"), 200), mx = Math.max(...sp), mn = Math.min(...sp);
  ok(Q.angleBetween(q0, q1) < 50 * D, "near the lock the two poses are close (" + (Q.angleBetween(q0, q1) / D).toFixed(1) + "°)");
  ok(Q.pathLength(u => Q.eulerLerp(e0, e1, u, "ZYX"), 400) > 3 * Q.angleBetween(q0, q1), "but Euler interpolation sweeps far more"); near(mx, mn, 1e-6, "(at a fixed pitch its speed happens to be constant)"); }
{ const P = Q.POSES.find(p => p.id === "pick"), e0 = P.A.e.map(x => x * D), e1 = P.B.e.map(x => x * D), sp = Q.angularSpeeds(u => Q.eulerLerp(e0, e1, u, "ZYX"), 200);
  ok(Math.max(...sp) > 2 * Math.min(...sp), "pick and place: Euler speed varies more than 2x"); }
for (const P of Q.POSES) { const e0 = P.A.e.map(x => x * D), e1 = P.B.e.map(x => x * D);
	ok(Q.sameRotation(Q.eulerLerp(e0, e1, 0, "ZYX"), Q.poseQ(P.A), 1e-12) && Q.sameRotation(Q.eulerLerp(e0, e1, 1, "ZYX"), Q.poseQ(P.B), 1e-12), "Euler lerp endpoints " + P.id);
	for (const end of [P.A, P.B]) { const ik = Q.armIK(end.p, Q.toMatrix(Q.poseQ(end)), Q.ARM); ok(ik.reach, "pose reachable " + P.id);
		const g = Q.ARM, dE = Math.hypot(ik.E[0] - ik.S[0], ik.E[1] - ik.S[1], ik.E[2] - ik.S[2]), dW = Math.hypot(ik.W[0] - ik.E[0], ik.W[1] - ik.E[1], ik.W[2] - ik.E[2]);
		near(dE, g.L1, 1e-9, "upper arm length " + P.id); near(dW, g.L2, 1e-9, "forearm length " + P.id); vnear(ik.W, ik.Wc, 1e-9, "IK reaches the wrist centre " + P.id); } }
/* wrist: roll-pitch-roll decomposition */
for (let t = 0; t < 30; t++) { const R = Q.toMatrix(rq()), w = Q.wristXYX(R); const M = Q.matMul(Q.matMul(Q.rotAxis(0, w.angles[0]), Q.rotAxis(1, w.angles[1])), Q.rotAxis(0, w.angles[2])); mnear(M, R, 1e-9, "wrist XYX " + t); }
ok(Q.wristXYX(Q.rotAxis(0, 0.7)).lock, "wrist locks when the tool lines up with the forearm");

/* --- the 720° spinor --- */
{ const z = [0, 0, 1];
  ok(Q.spinorAt(2 * Math.PI, z).matrixBack, "matrix is back at 360°"); ok(!Q.spinorAt(2 * Math.PI, z).quatBack, "quaternion is not back at 360°");
  near(Q.spinorAt(2 * Math.PI, z).w, -1, 1e-12, "w = −1 at 360°"); ok(Q.spinorAt(4 * Math.PI, z).quatBack, "back at 720°");
  near(Q.spinorAt(Math.PI, z).m[0][0], -1, 1e-12, "matrix entry cos θ = −1 at 180°");
  for (let th = 0; th <= 4 * Math.PI; th += 0.1) { const s = Q.spinorAt(th, [1, 2, 2]); near(s.w, Math.cos(th / 2), 1e-12, "w = cos(θ/2)"); near(s.m[0][0] + s.m[1][1] + s.m[2][2], 1 + 2 * Math.cos(th), 1e-12, "trace = 1 + 2cos θ"); }
  near(Q.beltTwist(2 * Math.PI), 2 * Math.PI, 1e-12, "belt cannot relax a 360° twist"); near(Q.beltTwist(4 * Math.PI), 0, 1e-12, "belt relaxes a 720° twist");
  near(Q.beltTwist(3 * Math.PI), Math.PI, 1e-9, "540° relaxes to 180°");
  near(Q.halfAngle(m1), Math.PI, 1e-15, "dial for −1 points at 180°"); near(Q.halfAngle(I), Math.PI / 2, 1e-15, "dial for i at 90°"); }
/* the ribbon: its far end always matches the object (up to sign); the relaxed one twists least */
for (let th = 0; th <= 6 * Math.PI; th += 0.37) for (const mode of ["relax", "all"]) {
	const z = [0.3, -0.4, 0.8]; ok(Q.sameRotation(Q.beltFrame(th, z, 1, mode), Q.fromAxisAngle(z, th), 1e-9), "ribbon end matches the object " + mode + " " + th.toFixed(2));
	qnear(Q.beltFrame(th, z, 0, mode), ONE, 1e-12, "ribbon starts flat at the wall " + mode); }
near(Q.toAxisAngle(Q.beltFrame(2 * Math.PI, [1, 0, 0], 1, "relax")).angle, 2 * Math.PI, 1e-9, "relaxed ribbon at 360° still has a full twist");
qnear(Q.beltFrame(4 * Math.PI, [1, 0, 0], 0.5, "relax"), ONE, 1e-9, "relaxed ribbon at 720° is flat");
/* formatting */
ok(Q.qString(Q.word("ij")) === "k", "qString k"); ok(Q.qString([0.5, -0.5, 0.5, 0.5], 2) === "0.50 − 0.50i + 0.50j + 0.50k", "qString general: " + Q.qString([0.5, -0.5, 0.5, 0.5], 2));

console.log(pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
