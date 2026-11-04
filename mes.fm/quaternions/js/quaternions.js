/* MES Quaternion Lab -- pure maths (no DOM). Browser global `MESQuat`; node: require('./tool_apps_src/quaternions/lib.js');
 * tests: node tool_apps_src/quaternions-tests.js
 * A quaternion is an array [w, x, y, z] = w + x i + y j + z k (Hamilton: i² = j² = k² = ijk = −1).
 * A unit quaternion q turns a vector v as v' = q v q* (active rotation, right-handed). Turning by θ about the unit axis n is
 * q = cos(θ/2) + n sin(θ/2), so q and −q give the same turn and a full 360° turn gives q = −1 (720° gives +1).
 * Matrices are 3x3 arrays of rows, m[r][c]; they turn column vectors (v' = M v).
 * Euler angles: order "XYZ" means M = Rx(a) · Ry(b) · Rz(c), i.e. turn about X, then about the body's new Y, then about its new Z
 * (intrinsic; the same as extrinsic Z, Y, X). "ZYX" = yaw (Z), pitch (Y), roll (X): the aircraft / robot convention. Angles in radians. */
(function (root) {
	"use strict";
	var TAU = 2 * Math.PI, EPS = 1e-12;
	var AX = { X: 0, Y: 1, Z: 2 };
	var ORDERS = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];

	/* ---------------- basics ---------------- */
	function q(w, x, y, z) { return [w, x, y, z]; }
	var ONE = [1, 0, 0, 0], I = [0, 1, 0, 0], J = [0, 0, 1, 0], K = [0, 0, 0, 1];
	function mul(a, b) {                                   // Hamilton product a·b
		return [
			a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
			a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
			a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
			a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
		];
	}
	function mulAll(list) { return list.reduce(function (p, x) { return mul(p, x); }, ONE.slice()); }
	function conj(a) { return [a[0], -a[1], -a[2], -a[3]]; }
	function neg(a) { return [-a[0], -a[1], -a[2], -a[3]]; }
	function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]]; }
	function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s, a[3] * s]; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; }
	function norm(a) { return Math.sqrt(dot(a, a)); }
	function normalize(a) { var n = norm(a); return n < EPS ? ONE.slice() : scale(a, 1 / n); }
	function inv(a) { var n2 = dot(a, a); if (n2 < EPS) return null; return scale(conj(a), 1 / n2); }
	function near(a, b, tol) { tol = tol == null ? 1e-9 : tol; for (var i = 0; i < 4; i++) if (Math.abs(a[i] - b[i]) > tol) return false; return true; }
	function sameRotation(a, b, tol) { tol = tol == null ? 1e-9 : tol; var na = normalize(a), nb = normalize(b); return Math.abs(Math.abs(dot(na, nb)) - 1) < tol; }

	/* ---------------- vectors ---------------- */
	function vnorm(v) { return Math.hypot(v[0], v[1], v[2]); }
	function vunit(v) { var n = vnorm(v); return n < EPS ? [0, 0, 1] : [v[0] / n, v[1] / n, v[2] / n]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

	/* ---------------- axis-angle ---------------- */
	function fromAxisAngle(axis, ang) { var n = vunit(axis), s = Math.sin(ang / 2); return [Math.cos(ang / 2), n[0] * s, n[1] * s, n[2] * s]; }
	/* angle in [0, 2π]: the half-angle comes straight from w, so −1 reads as a 360° turn (the spinor view);
	   use opts.reduce to get the smallest equivalent turn in [0, π] (the axis flips if needed) */
	function toAxisAngle(a, opts) {
		var u = normalize(a), s = Math.hypot(u[1], u[2], u[3]);
		if (opts && opts.reduce && u[0] < 0) u = neg(u);
		var ang = 2 * Math.atan2(s, u[0]);
		if (s < 1e-12) return { axis: [0, 0, 1], angle: ang };
		return { axis: [u[1] / s, u[2] / s, u[3] / s], angle: ang };
	}
	function halfAngle(a) { var u = normalize(a); return Math.atan2(Math.hypot(u[1], u[2], u[3]), u[0]); }   // 0 .. π: where the spinor dial points
	function angleBetween(a, b) { var d = Math.abs(dot(normalize(a), normalize(b))); return 2 * Math.acos(Math.min(1, d)); }   // smallest turn from a to b

	/* ---------------- turning vectors ---------------- */
	function rotate(a, v) { var p = mul(mul(a, [0, v[0], v[1], v[2]]), conj(a)); var n2 = dot(a, a) || 1; return [p[1] / n2, p[2] / n2, p[3] / n2]; }
	/* the same thing written out, step by step (for the calculator page) */
	function rotateSteps(a, v) { var u = normalize(a), p = [0, v[0], v[1], v[2]], s1 = mul(u, p), s2 = mul(s1, conj(u)); return { q: u, p: p, qp: s1, qpq: s2, v: [s2[1], s2[2], s2[3]] }; }

	/* ---------------- matrices ---------------- */
	function toMatrix(a) {
		var u = normalize(a), w = u[0], x = u[1], y = u[2], z = u[3];
		return [
			[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
			[2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
			[2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
		];
	}
	function matMul(A, B) { var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) for (var k = 0; k < 3; k++) C[r][c] += A[r][k] * B[k][c]; return C; }
	function matT(A) { return [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]]; }
	function matVec(A, v) { return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]]; }
	function det(A) { return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]); }
	/* how far a matrix is from a rotation: max |MᵀM − I| and the determinant (a rotation has det +1) */
	function matCheck(A) { var P = matMul(matT(A), A), e = 0; for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) e = Math.max(e, Math.abs(P[r][c] - (r === c ? 1 : 0))); return { orthoErr: e, det: det(A), isRotation: e < 1e-3 && Math.abs(det(A) - 1) < 1e-3 }; }
	/* Shepperd's method: always uses the largest of 4w², 4x², 4y², 4z², so it never divides by a small number. Result has w >= 0. */
	function fromMatrix(m) {
		var t = m[0][0] + m[1][1] + m[2][2], r;
		if (t > 0) { var s = Math.sqrt(t + 1) * 2; r = [0.25 * s, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s]; }
		else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { var s1 = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; r = [(m[2][1] - m[1][2]) / s1, 0.25 * s1, (m[0][1] + m[1][0]) / s1, (m[0][2] + m[2][0]) / s1]; }
		else if (m[1][1] > m[2][2]) { var s2 = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; r = [(m[0][2] - m[2][0]) / s2, (m[0][1] + m[1][0]) / s2, 0.25 * s2, (m[1][2] + m[2][1]) / s2]; }
		else { var s3 = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; r = [(m[1][0] - m[0][1]) / s3, (m[0][2] + m[2][0]) / s3, (m[1][2] + m[2][1]) / s3, 0.25 * s3]; }
		r = normalize(r); if (r[0] < 0) r = neg(r); return r;
	}
	function rotAxis(i, ang) { var c = Math.cos(ang), s = Math.sin(ang); if (i === 0) return [[1, 0, 0], [0, c, -s], [0, s, c]]; if (i === 1) return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }

	/* ---------------- Euler angles (all six Tait-Bryan orders) ---------------- */
	function orderIdx(order) { order = String(order || "XYZ").toUpperCase(); if (ORDERS.indexOf(order) < 0) order = "XYZ"; return [AX[order[0]], AX[order[1]], AX[order[2]]]; }
	function parity(o) { return ((o[1] - o[0] + 3) % 3 === 1) ? 1 : -1; }   // +1 for XYZ, YZX, ZXY
	function eulerToMatrix(e, order) { var o = orderIdx(order); return matMul(matMul(rotAxis(o[0], e[0]), rotAxis(o[1], e[1])), rotAxis(o[2], e[2])); }
	function fromEuler(e, order) { var o = orderIdx(order); return mulAll([fromAxisAngle(unitAxis(o[0]), e[0]), fromAxisAngle(unitAxis(o[1]), e[1]), fromAxisAngle(unitAxis(o[2]), e[2])]); }
	function unitAxis(i) { return i === 0 ? [1, 0, 0] : i === 1 ? [0, 1, 0] : [0, 0, 1]; }
	/* matrix -> Euler; the middle angle is in [−π/2, π/2]. At gimbal lock (|cos b| ~ 0) only a ± c is defined: c is set to 0 and gimbal = true. */
	function matrixToEuler(m, order, lockTol) {
		var o = orderIdx(order), i = o[0], j = o[1], k = o[2], s = parity(o), tol = lockTol == null ? 1e-6 : lockTol;
		var sb = Math.max(-1, Math.min(1, s * m[i][k])), b = Math.asin(sb), a, c, lock = Math.abs(sb) > 1 - tol;
		if (!lock) { a = Math.atan2(-s * m[j][k], m[k][k]); c = Math.atan2(-s * m[i][j], m[i][i]); }
		else { a = Math.atan2(s * m[k][j], m[j][j]); c = 0; }
		return { angles: [a, b, c], gimbal: lock, middle: b };
	}
	function toEuler(qq, order, lockTol) { return matrixToEuler(toMatrix(qq), order, lockTol); }
	/* how close a set of Euler angles is to gimbal lock: 0 = far, 1 = locked (|cos(middle)| -> 0) */
	function gimbalCloseness(e) { return 1 - Math.abs(Math.cos(e[1])); }

	/* ---------------- interpolation ---------------- */
	/* spherical linear interpolation; shortest = true takes the short way round (flips q1 if q0·q1 < 0) */
	function slerp(a, b, u, shortest) {
		var q0 = normalize(a), q1 = normalize(b), d = dot(q0, q1);
		if (shortest !== false && d < 0) { q1 = neg(q1); d = -d; }
		d = Math.max(-1, Math.min(1, d));
		if (d > 0.9995) return normalize(add(scale(q0, 1 - u), scale(q1, u)));   // nearly the same: nlerp is exact enough and stable
		var th = Math.acos(d), s = Math.sin(th);
		return add(scale(q0, Math.sin((1 - u) * th) / s), scale(q1, Math.sin(u * th) / s));
	}
	function nlerp(a, b, u) { var q0 = normalize(a), q1 = normalize(b); if (dot(q0, q1) < 0) q1 = neg(q1); return normalize(add(scale(q0, 1 - u), scale(q1, u))); }
	/* the single turn that takes a to b: Δq = b·a⁻¹ (in the room's frame) -> axis and angle */
	function delta(a, b) { var d = mul(normalize(b), conj(normalize(a))); if (d[0] < 0) d = neg(d); return { q: d, aa: toAxisAngle(d) }; }
	/* naive: interpolate the three Euler angles one by one (what many controllers and animation tools do) */
	function eulerLerp(e0, e1, u, order) { return fromEuler([e0[0] + (e1[0] - e0[0]) * u, e0[1] + (e1[1] - e0[1]) * u, e0[2] + (e1[2] - e0[2]) * u], order); }
	/* angular speed along a path q(u), u in [0, 1]: angle turned per unit u, sampled at n+1 points */
	function angularSpeeds(fn, n) { var out = [], prev = fn(0); for (var i = 1; i <= n; i++) { var cur = fn(i / n); out.push(angleBetween(prev, cur) * n); prev = cur; } return out; }
	function pathLength(fn, n) { return angularSpeeds(fn, n).reduce(function (s, x) { return s + x; }, 0) / n; }

	/* ---------------- the unit basis: names and the multiplication table ---------------- */
	var BASIS = { "1": ONE, i: I, j: J, k: K };
	/* name a quaternion that is (±) one of 1, i, j, k, else null */
	function basisName(a, tol) {
		tol = tol == null ? 1e-9 : tol; var names = ["1", "i", "j", "k"];
		for (var n = 0; n < 4; n++) { var b = BASIS[names[n]]; if (near(a, b, tol)) return names[n]; if (near(a, neg(b), tol)) return "−" + names[n]; }
		return null;
	}
	function table() { var names = ["1", "i", "j", "k"]; return names.map(function (r) { return names.map(function (c) { return basisName(mul(BASIS[r], BASIS[c])); }); }); }
	/* multiply a word like "ijk", "i i", "-1 i j" (letters 1 i j k, optional minus signs) */
	function word(s) {
		var p = ONE.slice(), sgn = 1; String(s).replace(/[−-]/g, "-").replace(/[^-1ijk]/gi, "").toLowerCase().split("").forEach(function (ch) { if (ch === "-") sgn = -sgn; else if (ch !== "1") p = mul(p, BASIS[ch]); });
		return sgn < 0 ? neg(p) : p;
	}

	/* ---------------- spinor: the 720° story ---------------- */
	/* turning continuously by θ about n: the quaternion has w = cos(θ/2), the matrix has (for the n axis) entries cos θ */
	function spinorAt(theta, axis) { var qq = fromAxisAngle(axis || [0, 0, 1], theta); return { q: qq, w: qq[0], m: toMatrix(qq), matrixBack: Math.abs(Math.cos(theta) - 1) < 1e-9, quatBack: Math.abs(qq[0] - 1) < 1e-9, sign: qq[0] < 0 ? -1 : 1 }; }
	/* the least twist a belt / ribbon tied to the object can be relaxed to: 2·acos|…| in [0, 2π] with a turn direction (continuous in θ) */
	function beltTwist(theta) { var h = ((theta / 2) % TAU + TAU) % TAU, w = Math.cos(h); return 2 * Math.acos(Math.max(-1, Math.min(1, w))); }

	/* the ribbon's frame at a fraction s (0 = wall, 1 = object) after the object has turned θ about n:
	   "relax" = the shortest path in SU(2) from 1 to q (the least twist, beltTwist), "all" = every turn kept (θ·s). At exactly 360° (mod 720°) both senses are equally short; we pick the reverse. */
	function beltFrame(theta, axis, s, mode) {
		if (mode === "all") return fromAxisAngle(axis, theta * s);
		var h = ((theta / 2) % TAU + TAU) % TAU, phi = beltTwist(theta), n = vunit(axis), sgn = h < Math.PI - 1e-12 ? 1 : -1;
		return fromAxisAngle([n[0] * sgn, n[1] * sgn, n[2] * sgn], phi * s);
	}
	/* ---------------- a small robot arm (for the "at work" tab) ---------------- */
	/* base column h0, upper arm L1, forearm L2, tool length d (wrist centre to tool point along the tool's x axis).
	   Elbow up. Returns joint positions, angles and whether the point is reachable. */
	function armIK(P, R, geo) {
		var g = geo || ARM, x = [R[0][0], R[1][0], R[2][0]], Wc = [P[0] - g.d * x[0], P[1] - g.d * x[1], P[2] - g.d * x[2]];
		var base = Math.atan2(Wc[1], Wc[0]), r = Math.hypot(Wc[0], Wc[1]), z = Wc[2] - g.h0, D = (r * r + z * z - g.L1 * g.L1 - g.L2 * g.L2) / (2 * g.L1 * g.L2);
		var reach = D >= -1 && D <= 1; D = Math.max(-1, Math.min(1, D));
		var el = Math.acos(D), sh = Math.atan2(z, r) + Math.atan2(g.L2 * Math.sin(el), g.L1 + g.L2 * Math.cos(el));
		var er = [Math.cos(base), Math.sin(base), 0], S = [0, 0, g.h0], E = [S[0] + g.L1 * Math.cos(sh) * er[0], S[1] + g.L1 * Math.cos(sh) * er[1], S[2] + g.L1 * Math.sin(sh)];
		var fa = sh - el, Wr = [E[0] + g.L2 * Math.cos(fa) * er[0], E[1] + g.L2 * Math.cos(fa) * er[1], E[2] + g.L2 * Math.sin(fa)];
		/* forearm frame: x along the forearm, y horizontal (sideways), z completes it; the wrist turns from there to the tool */
		var fx = vunit([Wr[0] - E[0], Wr[1] - E[1], Wr[2] - E[2]]), fy = [-Math.sin(base), Math.cos(base), 0], fz = cross(fx, fy);
		var F = [[fx[0], fy[0], fz[0]], [fx[1], fy[1], fz[1]], [fx[2], fy[2], fz[2]]], Wm = matMul(matT(F), R), we = wristXYX(Wm);
		return { S: S, E: E, W: Wr, Wc: Wc, P: P, base: base, shoulder: sh, elbow: el, wrist: we.angles, wristLock: we.lock, wristBend: we.angles[1], reach: reach };
	}
	/* a roll-pitch-roll wrist: M = Rx(a) Ry(b) Rx(c). It locks (wrist singularity) when b = 0: the tool lines up with the forearm, so the two roll joints turn about the same line. */
	function wristXYX(m, tol) {
		var cb = Math.max(-1, Math.min(1, m[0][0])), b = Math.acos(cb), sb = Math.sin(b), lock = sb < (tol == null ? 1e-3 : tol);
		if (!lock) return { angles: [Math.atan2(m[1][0], -m[2][0]), b, Math.atan2(m[0][1], m[0][2])], lock: false };
		return { angles: [Math.atan2(m[2][1], m[1][1]), b, 0], lock: true };
	}
	var ARM = { h0: 1.1, L1: 1.7, L2: 1.5, d: 0.75 };
	/* the poses for the robot demo: positions in metres-ish units, orientations as ZYX (yaw, pitch, roll) in degrees */
	var POSES = [
		{ id: "pick", name: "Pick and place", A: { p: [2.1, -1.1, 0.55], e: [-30, 90, 0] }, B: { p: [0.9, 2.0, 1.4], e: [120, 25, 150] } },
		{ id: "flip", name: "Big flip", A: { p: [2.2, -0.6, 1.0], e: [0, 0, 0] }, B: { p: [1.6, 1.4, 1.4], e: [180, 0, 180] } },
		{ id: "wrap", name: "Yaw 170° to −170°", A: { p: [2.0, -0.9, 1.2], e: [170, 20, 0] }, B: { p: [2.0, 0.9, 1.2], e: [-170, 20, 0] } },
		{ id: "lock", name: "Through gimbal lock", A: { p: [2.0, -1.0, 0.7], e: [-80, 88, 80] }, B: { p: [1.8, 1.0, 0.7], e: [80, 88, -80] } },
		{ id: "small", name: "Small tilt", A: { p: [2.1, -0.4, 1.0], e: [0, 30, 0] }, B: { p: [2.1, 0.6, 1.2], e: [40, 50, 20] } }
	];
	var DEG = Math.PI / 180;
	function poseQ(pose) { return fromEuler([pose.e[0] * DEG, pose.e[1] * DEG, pose.e[2] * DEG], "ZYX"); }

	/* ---------------- formatting ---------------- */
	function fmt(x, d) { d = d == null ? 3 : d; if (Math.abs(x) < 0.5 * Math.pow(10, -d)) x = 0; return x.toFixed(d).replace(/-/g, "−"); }
	function qString(a, d) {
		d = d == null ? 3 : d; var nm = basisName(a, 1e-9); if (nm) return nm;
		var s = fmt(a[0], d), L = ["i", "j", "k"];
		for (var t = 1; t < 4; t++) { var v = a[t]; if (Math.abs(v) < 0.5 * Math.pow(10, -d)) continue; s += (v < 0 ? " − " : " + ") + Math.abs(v).toFixed(d) + L[t - 1]; }
		return s;
	}

	var api = {
		TAU: TAU, DEG: DEG, ORDERS: ORDERS, ONE: ONE, I: I, J: J, K: K, BASIS: BASIS,
		q: q, mul: mul, mulAll: mulAll, conj: conj, neg: neg, add: add, scale: scale, dot: dot, norm: norm, normalize: normalize, inv: inv, near: near, sameRotation: sameRotation,
		vnorm: vnorm, vunit: vunit, cross: cross, vdot: vdot,
		fromAxisAngle: fromAxisAngle, toAxisAngle: toAxisAngle, halfAngle: halfAngle, angleBetween: angleBetween, rotate: rotate, rotateSteps: rotateSteps,
		toMatrix: toMatrix, fromMatrix: fromMatrix, matMul: matMul, matT: matT, matVec: matVec, det: det, matCheck: matCheck, rotAxis: rotAxis,
		eulerToMatrix: eulerToMatrix, fromEuler: fromEuler, matrixToEuler: matrixToEuler, toEuler: toEuler, gimbalCloseness: gimbalCloseness,
		slerp: slerp, nlerp: nlerp, delta: delta, eulerLerp: eulerLerp, angularSpeeds: angularSpeeds, pathLength: pathLength,
		basisName: basisName, table: table, word: word, spinorAt: spinorAt, beltTwist: beltTwist, beltFrame: beltFrame,
		wristXYX: wristXYX, ARM: ARM, POSES: POSES, poseQ: poseQ, armIK: armIK, fmt: fmt, qString: qString
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESQuat = api;
})(this);

/* MES Quaternion Lab UI: i, j, k half-turns, a robot arm with SLERP vs Euler blending, a rotation calculator, and the 720° spinor.
   Maths: MESQuat (node-tested: tool_apps_src/quaternions-tests.js). State: localStorage mes-quaternions:v1; links ?tab=ijk|robot|calc|spinor (+ w=, pre=, m=, q=, o=, ax=) */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("qn"); if (!root) return;
	var M = window.MESQuat, KEY = "mes-quaternions:v1", TAU = Math.PI * 2, DEG = Math.PI / 180;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { v = Number(v); return v !== null && isFinite(v) && v >= lo && v <= hi ? v : d; }
	function mi(s) { return String(s).replace(/-/g, "−"); }
	function f(x, d) { return M.fmt(x, d == null ? 3 : d); }
	function fd(rad, d) { return f(rad / DEG, d == null ? 1 : d) + "°"; }
	function vs(v, d) { return "(" + f(v[0], d) + ", " + f(v[1], d) + ", " + f(v[2], d) + ")"; }
	function parseNum(s) { s = String(s == null ? "" : s).trim().replace(/−/g, "-").replace(/,/g, "."); if (!s) return NaN; if (/^[-+]?\s*(\d+(\.\d*)?|\.\d+)?\s*\/\s*\d+(\.\d*)?$/.test(s)) { var p = s.split("/"); return Number(p[0] || 1) / Number(p[1]); } s = s.replace(/√\s*(\d+(\.\d+)?)/g, "Math.sqrt($1)").replace(/π|pi/gi, "Math.PI"); if (!/^[\d.\s+\-*/()eMathsqrPI]*$/.test(s)) return NaN; try { var v = Function('"use strict";return (' + s + ")")(); return typeof v === "number" ? v : NaN; } catch (e) { return NaN; } }
	var q0 = new URLSearchParams(location.search), saved = sget(), toastT;
	function toast(msg) { var t = $("qn-toast"); if (!t) { t = document.createElement("div"); t.id = "qn-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function ro(box, items) { box.innerHTML = items.map(function (it) { return '<div class="qn-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function setPressed(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }
	function png(cv, name) { try { var a = document.createElement("a"); a.download = name + ".png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } }
	function fitStage(stage, natural) {
		var wrap = stage.parentNode, w = wrap.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
		wrap.setAttribute("data-mes-free", "1");
		var h = natural(w); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(200, Math.round(h)); stage.style.width = w + "px"; stage.style.height = h + "px";
		var cv = stage.querySelector("canvas"), cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
		return { W: w, H: h, c: c, cv: cv };
	}
	Array.prototype.forEach.call(root.querySelectorAll(".qn-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".qn-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});
	var COL = { bg: "#070b14", grid: "#1c2436", axis: "#5d6a86", text: "#d6dcea", dim: "#8792aa", x: "#ff6b6b", y: "#5ee39a", z: "#6aa8ff", teal: "#2dd4bf", org: "#ff9f43", yel: "#ffd166", vio: "#c4a7ff" };
	function txt(c, s, x, y, o) { o = o || {}; c.font = (o.b ? "600 " : "") + (o.size || 12) + "px system-ui,sans-serif"; c.fillStyle = o.col || COL.text; c.textAlign = o.al || "left"; c.textBaseline = o.bl || "alphabetic"; c.fillText(s, x, y); }
	/* captions: the title sits top-left on wide stages and moves to the bottom on narrow ones (the buttons need the top); hints shrink to fit */
	function title(c, s, W, H, o, line) { o = o || {}; var y = W < 520 ? H - 30 - 18 * (line || 0) : 20 + 20 * (line || 0); if (W < 520) o.size = Math.min(o.size || 14, 13); fitTxt(c, s, 10, y, W - 20, o); }
	function hint(c, s, W, H) { fitTxt(c, s, 10, H - 10, W - 20, { col: COL.dim, size: 11 }); }
	function fitTxt(c, s, x, y, maxW, o) { var sz = o.size || 12; c.font = (o.b ? "600 " : "") + sz + "px system-ui,sans-serif"; while (sz > 8 && c.measureText(s).width > maxW) { sz -= 0.5; c.font = (o.b ? "600 " : "") + sz + "px system-ui,sans-serif"; } o.size = sz; txt(c, s, x, y, o); }
	function arrow2(c, x0, y0, x1, y1, col, w, head) { var a = Math.atan2(y1 - y0, x1 - x0), h = head || 7; c.strokeStyle = c.fillStyle = col; c.lineWidth = w || 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - Math.cos(a) * h * 0.6, y1 - Math.sin(a) * h * 0.6); c.stroke(); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); c.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); c.closePath(); c.fill(); }
	function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(Math.min(255, r * k)) + "," + Math.round(Math.min(255, g * k)) + "," + Math.round(Math.min(255, b * k)) + ")"; }

	/* =================================== a small 3D painter (z up, no library) =================================== */
	function Cam(yaw, pitch, R, t) { return { yaw: yaw, pitch: pitch, R: R, t: t || [0, 0, 0], zoom: 1, y0: yaw, p0: pitch, k: 1, cx: 0, cy: 0, F: 4 * R }; }
	function setupCam(cam, W, H) { cam.k = Math.min(W, H * 1.15) / (2.15 * cam.R) * cam.zoom; cam.cx = W / 2; cam.cy = H / 2 + 6; cam.F = 4.5 * cam.R; }
	function proj(cam, p) {
		var x = p[0] - cam.t[0], y = p[1] - cam.t[1], z = p[2] - cam.t[2], c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), x1 = x * c - y * s, y1 = x * s + y * c, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		var up = z * cp + y1 * sp, d = y1 * cp - z * sp, fz = cam.F / Math.max(cam.F * 0.15, cam.F + d);
		return { x: cam.cx + x1 * cam.k * fz, y: cam.cy - up * cam.k * fz, d: d, f: fz };
	}
	function viewDir(cam) { var cp = Math.cos(cam.pitch); return [Math.sin(cam.yaw) * cp, Math.cos(cam.yaw) * cp, -Math.sin(cam.pitch)]; }   // points away from the viewer
	var LIGHT = M.vunit([-0.35, -0.55, 0.9]);
	function Scene(cam) { this.cam = cam; this.items = []; this.labels = []; this.V = viewDir(cam); }
	Scene.prototype.face = function (pts, col, o) {
		o = o || {}; var n = o.n || M.vunit(M.cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))), facing = M.vdot(n, this.V) < 0;
		if (o.cull !== false && !facing) return;
		if (o.two) { col = facing ? o.two[0] : o.two[1]; if (!facing) n = [-n[0], -n[1], -n[2]]; }
		var P = pts.map(function (p) { return proj(this.cam, p); }, this), d = 0; P.forEach(function (p) { d += p.d; }); d /= P.length;
		var lit = 0.38 + 0.32 * Math.max(0, -M.vdot(n, this.V)) + 0.38 * Math.max(0, M.vdot(n, LIGHT));
		this.items.push({ t: "f", P: P, d: d + (o.bias || 0), fill: o.flat ? col : shade(col, lit), a: o.alpha == null ? 1 : o.alpha, edge: o.edge });
	};
	Scene.prototype.line = function (a, b, col, w, o) { o = o || {}; var p = proj(this.cam, a), r = proj(this.cam, b); this.items.push({ t: "l", p: p, r: r, d: (p.d + r.d) / 2 + (o.bias || 0), col: col, w: w || 1.5, dash: o.dash, arrow: o.arrow, a: o.alpha == null ? 1 : o.alpha }); };
	Scene.prototype.poly = function (pts, col, w, o) { for (var i = 1; i < pts.length; i++) this.line(pts[i - 1], pts[i], col, w, o); };
	Scene.prototype.ball = function (p, r, col, o) { var q = proj(this.cam, p); this.items.push({ t: "b", p: q, d: q.d + ((o && o.bias) || 0), r: r, col: col }); };
	Scene.prototype.label = function (p, s, o) { var q = proj(this.cam, p); this.labels.push({ p: q, s: s, o: o || {} }); };
	Scene.prototype.draw = function (c) {
		var cam = this.cam; this.items.sort(function (a, b) { return b.d - a.d; });
		this.items.forEach(function (it) {
			c.globalAlpha = it.a == null ? 1 : it.a;
			if (it.t === "f") { c.beginPath(); it.P.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath(); c.fillStyle = it.fill; c.fill(); c.strokeStyle = it.edge || "rgba(0,0,0,0.35)"; c.lineWidth = 0.7; c.stroke(); }
			else if (it.t === "l") { c.setLineDash(it.dash || []); if (it.arrow) arrow2(c, it.p.x, it.p.y, it.r.x, it.r.y, it.col, it.w, Math.max(6, 11 * it.r.f)); else { c.strokeStyle = it.col; c.lineWidth = it.w; c.beginPath(); c.moveTo(it.p.x, it.p.y); c.lineTo(it.r.x, it.r.y); c.stroke(); } c.setLineDash([]); }
			else if (it.t === "b") { var rr = Math.max(2, it.r * cam.k * it.p.f), g = c.createRadialGradient(it.p.x - rr * 0.35, it.p.y - rr * 0.35, rr * 0.1, it.p.x, it.p.y, rr); g.addColorStop(0, shade(it.col, 1.5)); g.addColorStop(1, shade(it.col, 0.55)); c.fillStyle = g; c.beginPath(); c.arc(it.p.x, it.p.y, rr, 0, TAU); c.fill(); }
		});
		c.globalAlpha = 1;
		this.labels.forEach(function (l) { var o = l.o; if (o.bg) { c.font = (o.b ? "600 " : "") + (o.size || 12) + "px system-ui,sans-serif"; var w = c.measureText(l.s).width; c.fillStyle = "rgba(7,11,20,0.72)"; c.fillRect(l.p.x - (o.al === "center" ? w / 2 : 0) - 3, l.p.y - (o.size || 12) - 1, w + 6, (o.size || 12) + 6); } txt(c, l.s, l.p.x, l.p.y, o); });
	};
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function addv(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
	function mulv(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
	function lerp3(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
	/* a box in a local frame (Rm = 3x3 matrix, o = origin), with a colour per side: cols = {top, bot, side, front, back} */
	function box(S, Rm, o, x0, x1, y0, y1, z0, z1, cols, opt) {
		var T = function (p) { return addv(M.matVec(Rm, p), o); }, N = function (n) { return M.matVec(Rm, n); };
		var V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(T);
		var F = [[[4, 5, 6, 7], [0, 0, 1], cols.top], [[3, 2, 1, 0], [0, 0, -1], cols.bot], [[0, 1, 5, 4], [0, -1, 0], cols.side], [[2, 3, 7, 6], [0, 1, 0], cols.side2 || cols.side], [[1, 2, 6, 5], [1, 0, 0], cols.front || cols.side], [[3, 0, 4, 7], [-1, 0, 0], cols.back || cols.side]];
		F.forEach(function (fc) { S.face(fc[0].map(function (i) { return V[i]; }), fc[2], { n: N(fc[1]), alpha: opt && opt.alpha, bias: opt && opt.bias }); });
	}
	function boxEdges(S, Rm, o, x0, x1, y0, y1, z0, z1, col, w, dash) {
		var T = function (p) { return addv(M.matVec(Rm, p), o); }, V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(T);
		[[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (e) { S.line(V[e[0]], V[e[1]], col, w, { dash: dash, bias: -50 }); });
	}
	/* the hand: palm, four fingers and a thumb (right hand, palm down, fingers along +x, thumb along +y). Top = teal, underside = orange. */
	var HC = { top: "#2fb8a6", bot: "#f08a3c", side: "#8fa3bf", front: "#a9bad2", back: "#6f819c" };
	function hand(S, q, o, sc, opt) {
		var Rm = M.toMatrix(q), s = sc || 1, P = o || [0, 0, 0], b = function (x0, x1, y0, y1, z0, z1, cols) { box(S, Rm, P, x0 * s, x1 * s, y0 * s, y1 * s, z0 * s, z1 * s, cols || HC, opt); };
		b(-0.95, 0.45, -0.55, 0.55, -0.18, 0.18);
		[[-0.42, 1.15], [-0.14, 1.32], [0.14, 1.38], [0.42, 1.28]].forEach(function (fg) { b(0.45, fg[1], fg[0] - 0.11, fg[0] + 0.11, -0.14, 0.14); });
		b(-0.25, 0.3, 0.55, 1.0, -0.13, 0.13);
		b(-0.6, -0.1, -0.2, 0.2, 0.18, 0.26, { top: "#e8fffb", bot: "#2fb8a6", side: "#bfeee6" });   /* a white "watch face" on the back of the hand */
	}
	function handGhost(S, q, col) { var Rm = M.toMatrix(q || M.ONE); boxEdges(S, Rm, [0, 0, 0], -0.95, 0.45, -0.55, 0.55, -0.18, 0.18, col || "rgba(255,255,255,0.28)", 1, [4, 4]); boxEdges(S, Rm, [0, 0, 0], 0.45, 1.38, -0.53, 0.53, -0.14, 0.14, col || "rgba(255,255,255,0.18)", 1, [4, 4]); }
	function axes(S, L, lab) {
		[[[1, 0, 0], COL.x, "x"], [[0, 1, 0], COL.y, "y"], [[0, 0, 1], COL.z, "z"]].forEach(function (a) {
			S.line(mulv(a[0], -L * 0.75), [0, 0, 0], a[1], 1.2, { alpha: 0.45, dash: [3, 4] }); S.line([0, 0, 0], mulv(a[0], L), a[1], 2, { arrow: 1 });
			if (lab !== false) S.label(mulv(a[0], L * 1.08), a[2], { col: a[1], b: 1, size: 14, al: "center" });
		});
	}
	/* drag = orbit, wheel / pinch = zoom (only on the stage; elsewhere the page scrolls) */
	function orbit(cv, cam, redraw, opt) {
		var pts = {}, base = null, pinch = null;
		function n() { return Object.keys(pts).length; }
		cv.addEventListener("pointerdown", function (e) { if (opt && opt.down && opt.down(e)) return; pts[e.pointerId] = [e.clientX, e.clientY]; try { cv.setPointerCapture(e.pointerId); } catch (er) {} base = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; if (n() === 2) { var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.zoom }; } });
		cv.addEventListener("pointermove", function (e) {
			if (!pts[e.pointerId]) return; pts[e.pointerId] = [e.clientX, e.clientY];
			if (n() >= 2 && pinch) { var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]]; cam.zoom = clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(10, pinch.d), 0.35, 4); redraw(); return; }
			if (!base) return; cam.yaw = base.yaw + (e.clientX - base.x) * 0.008; cam.pitch = clamp(base.pitch + (e.clientY - base.y) * 0.006, -1.2, 1.5); redraw();
		});
		function end(e) { delete pts[e.pointerId]; pinch = null; base = null; }
		cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.35, 4); redraw(); }, { passive: false });
		cv.addEventListener("keydown", function (e) { var k = e.key; if (k === "ArrowLeft") cam.yaw -= 0.08; else if (k === "ArrowRight") cam.yaw += 0.08; else if (k === "ArrowUp") cam.pitch = clamp(cam.pitch + 0.06, -1.2, 1.5); else if (k === "ArrowDown") cam.pitch = clamp(cam.pitch - 0.06, -1.2, 1.5); else if (k === "+" || k === "=") cam.zoom = clamp(cam.zoom * 1.12, 0.35, 4); else if (k === "-") cam.zoom = clamp(cam.zoom / 1.12, 0.35, 4); else return; e.preventDefault(); redraw(); });
		return function reset() { cam.yaw = cam.y0; cam.pitch = cam.p0; cam.zoom = 1; redraw(); };
	}
	/* ---------- a plain line plot ---------- */
	function niceStep(range, n) { var s = range / n, p = Math.pow(10, Math.floor(Math.log10(s))), fr = s / p; return (fr < 1.5 ? 1 : fr < 3.5 ? 2 : fr < 7.5 ? 5 : 10) * p; }
	function frame(c, r, o) {
		var X = function (t) { return r.x + (t - o.x0) / (o.x1 - o.x0) * r.w; }, Y = function (v) { return r.y + r.h - (v - o.y0) / (o.y1 - o.y0) * r.h; };
		c.save(); c.font = "11px system-ui,sans-serif"; c.lineWidth = 1;
		var ys = o.ys || niceStep(o.y1 - o.y0, Math.max(2, Math.floor(r.h / 30))); c.textAlign = "right"; c.textBaseline = "middle";
		for (var v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r.x, Y(v) + 0.5); c.lineTo(r.x + r.w, Y(v) + 0.5); c.stroke(); c.fillStyle = COL.dim; c.fillText(mi(String(+v.toPrecision(6))), r.x - 4, Y(v)); }
		var xs = o.xs || niceStep(o.x1 - o.x0, Math.max(2, Math.floor(r.w / 70))); c.textAlign = "center"; c.textBaseline = "top";
		for (var t = Math.ceil(o.x0 / xs - 1e-9) * xs; t <= o.x1 + 1e-9; t += xs) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(X(t) + 0.5, r.y); c.lineTo(X(t) + 0.5, r.y + r.h); c.stroke(); c.fillStyle = COL.dim; c.fillText(mi(String(+t.toPrecision(6))) + (o.xu || ""), X(t), r.y + r.h + 3); }
		c.strokeStyle = COL.axis; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
		if (o.xl) { c.textAlign = "right"; c.fillStyle = COL.dim; c.fillText(o.xl, r.x + r.w, r.y + r.h + 17); }
		if (o.yl) { c.save(); c.translate(r.x - 36, r.y + r.h / 2); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.textBaseline = "bottom"; c.fillStyle = COL.dim; c.fillText(o.yl, 0, 0); c.restore(); }
		c.restore(); if (o.title) txt(c, o.title, r.x + 6, r.y + 15, { b: 1, size: 11 });
		return { X: X, Y: Y };
	}
	function trace(c, r, fr, xs, ys, col, w, dash) { c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); c.strokeStyle = col; c.lineWidth = w || 1.6; c.setLineDash(dash || []); c.beginPath(); for (var i = 0; i < xs.length; i++) { var x = fr.X(xs[i]), y = fr.Y(ys[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); c.restore(); }
	function legend(c, r, items, y0) { c.save(); c.font = "600 11px system-ui,sans-serif"; c.textBaseline = "top"; c.textAlign = "left"; var x = r.x, y = y0 == null ? r.y + 21 : y0; items.forEach(function (it) { var wd = c.measureText(it[0]).width; if (x + wd > r.x + r.w - 4) { x = r.x + 6; y += 14; } c.fillStyle = it[1]; c.fillText(it[0], x, y); x += wd + 14; }); c.restore(); }

	/* ======================================================= tabs and links ======================================================= */
	var TABS = ["ijk", "robot", "calc", "spinor"];
	var tab = TABS.indexOf(q0.get("tab")) >= 0 ? q0.get("tab") : (TABS.indexOf(saved.tab) >= 0 ? saved.tab : "ijk");
	function setTab(t, init) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init) { sset({ tab: t }); try { var u = new URL(location.href); u.search = t === "ijk" ? "" : "?tab=" + t; history.replaceState(null, "", u); } catch (e) {} }
		setTimeout(onResize, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function linkFor() {
		var p = new URLSearchParams(); p.set("tab", tab);
		if (tab === "ijk") { if (I.toks.length) p.set("w", I.toks.map(function (t) { return t === "-1" ? "-" : t; }).join("")); if (I.left) p.set("left", "1"); }
		else if (tab === "robot") { p.set("pre", R.pre); p.set("m", R.mode); p.set("a", R.A.e.join(",")); p.set("b", R.B.e.join(",")); }
		else if (tab === "calc") { p.set("q", C.q.map(function (x) { return +x.toFixed(6); }).join(",")); p.set("o", C.order); p.set("v", C.v.join(",")); }
		else { p.set("ax", Sp.ax); p.set("th", Math.round(Sp.th)); p.set("belt", Sp.belt); }
		return location.origin + location.pathname + "?" + p.toString();
	}
	Array.prototype.forEach.call(root.querySelectorAll(".qn-link"), function (b) { b.onclick = function () { var l = linkFor(); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { toast("Link copied"); }, function () { window.prompt("Copy this link", l); }); }; });
	function slider(id, get, set, fmt) { var el = $(id), out = $(id + "-v"); el.value = get(); var show = function () { if (out) out.textContent = fmt(Number(el.value)); }; el.oninput = function () { set(Number(el.value)); show(); }; show(); return { el: el, show: show, set: function (v) { el.value = v; show(); } }; }

	/* ======================================================= 1. i, j, k HALF-TURNS ======================================================= */
	var is = saved.i || {};
	var I = { Q: M.ONE.slice(), toks: [], hist: [], anim: null, queue: [], left: q0.get("left") === "1" || !!is.left, sp: num(is.sp, 0.25, 4, 1), total: 0, prev: null, last: null };
	var FACT = { i: { q: M.I, ax: [1, 0, 0], ang: Math.PI, name: "i" }, j: { q: M.J, ax: [0, 1, 0], ang: Math.PI, name: "j" }, k: { q: M.K, ax: [0, 0, 1], ang: Math.PI, name: "k" }, "-1": { q: M.neg(M.ONE), ax: [0, 0, 1], ang: TAU, name: "(−1)" } };
	var iCam = Cam(-0.62, 0.48, 1.8), iCv = $("qn-i-c"), iStage = $("qn-i-stage"), iSz = null;
	var iReset = orbit(iCv, iCam, function () { iDraw(); });
	$("qn-i-view").onclick = iReset; $("qn-i-png").onclick = function () { png(iCv, "quaternion-ijk"); };
	function iSave() { sset({ i: { left: I.left, sp: I.sp } }); }
	function iPress(m) { if (I.anim) { I.queue.push(m); return; } iStart(m); }
	function iStart(m) {
		if (m === "|") { I.prev = { toks: I.toks.slice(), Q: I.Q.slice() }; I.Q = M.ONE.slice(); I.toks = []; I.hist = []; I.total = 0; I.anim = { pause: 0.9 / I.sp, t: 0 }; iUpdate(); return; }
		var F = FACT[m]; I.hist.push({ Q: I.Q.slice(), toks: I.toks.slice(), total: I.total });
		I.anim = { m: m, F: F, from: I.Q.slice(), t: 0, dur: (m === "-1" ? 1.7 : 1.05) / I.sp, left: I.left };
	}
	function iAnimQ() {
		var a = I.anim; if (!a || a.pause != null) return I.Q;
		var u = a.t / a.dur, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, r = M.fromAxisAngle(a.F.ax, a.F.ang * e);
		return a.left ? M.mul(r, a.from) : M.mul(a.from, r);
	}
	function iStep(dt) {
		var a = I.anim; if (!a) return; a.t += dt;
		if (a.pause != null) { if (a.t >= a.pause) { I.anim = null; iNext(); } return; }
		if (a.t >= a.dur) {
			I.Q = a.left ? M.mul(a.F.q, a.from) : M.mul(a.from, a.F.q); I.Q = I.Q.map(function (x) { return Math.round(x); });
			if (a.left) I.toks.unshift(a.m); else I.toks.push(a.m); I.total += a.F.ang; I.last = a.m; I.anim = null; iUpdate(); iNext();
		}
	}
	function iNext() { if (I.queue.length) iStart(I.queue.shift()); }
	Array.prototype.forEach.call(root.querySelectorAll("[data-m]"), function (b) { b.onclick = function () { iPress(b.dataset.m); }; });
	$("qn-i-undo").onclick = function () { if (I.anim || !I.hist.length) return; var h = I.hist.pop(); I.Q = h.Q; I.toks = h.toks; I.total = h.total; I.last = null; iUpdate(); };
	$("qn-i-reset").onclick = function () { I.queue = []; I.anim = null; I.Q = M.ONE.slice(); I.toks = []; I.hist = []; I.total = 0; I.prev = null; I.last = null; iUpdate(); };
	$("qn-i-left").checked = I.left; $("qn-i-left").onchange = function () { I.left = this.checked; iSave(); iUpdate(); };
	slider("qn-i-sp", function () { return I.sp; }, function (v) { I.sp = v; iSave(); }, function (v) { return v + "×"; });
	var TRY = [["i·i", "ii"], ["i·j·k", "ijk"], ["i·j vs j·i", "ij|ji"], ["(ijk)²", "ijkijk"], ["i⁴", "iiii"], ["j·k", "jk"], ["k·i", "ki"], ["(−1)·(−1)", "--"], ["i·j·i·j", "ijij"]];
	TRY.forEach(function (t) {
		var b = document.createElement("button"); b.type = "button"; b.textContent = t[0]; b.setAttribute("aria-pressed", "false");
		b.onclick = function () { $("qn-i-reset").onclick(); I.chip = t[0]; t[1].split("").forEach(function (ch) { iPress(ch === "-" ? "-1" : ch); }); };
		$("qn-i-try").appendChild(b);
	});
	function tokStr(toks) { return toks.length ? toks.map(function (t) { return FACT[t].name; }).join(" · ") : "1"; }
	function iUpdate() {
		var nm = M.basisName(I.Q) || M.qString(I.Q), looks = Math.abs(Math.abs(I.Q[0]) - 1) < 1e-9;
		var html = esc(tokStr(I.toks)) + " = " + esc(nm);
		if (I.prev && I.chip === "i·j vs j·i") html = esc(tokStr(I.prev.toks)) + " = " + esc(M.basisName(I.prev.Q)) + " &nbsp;but&nbsp; " + html;
		html += ' <small>' + (I.toks.length ? (looks ? (I.Q[0] > 0 ? "looks like the start, sign +1" : "looks like the start, sign −1") : "a half-turn about " + ({ i: "x", j: "y", k: "z" }[nm.replace("−", "")] || "an axis")) : "the start") + "</small>";
		$("qn-i-prod").innerHTML = html;
		var note = "";
		if (I.last) { var F = FACT[I.last]; note = "×" + F.name + ": " + (I.last === "-1" ? "a full 360° turn (about z here; any axis gives −1). The hand looks the same, but every number of q changed sign." : "a half-turn about the " + (I.left ? "room's " : "hand's own ") + ({ i: "x", j: "y", k: "z" }[I.last]) + " axis.") + " "; }
		if (I.prev && I.chip === "i·j vs j·i") note += "Both end with the hand turned half a turn about z: the pictures are the same. Only the hidden sign tells k from −k, and the order of the two turns decided it.";
		else if (looks && I.toks.length) note += I.Q[0] > 0 ? "Back to +1: the hand and the hidden sign are both as they started (after " + f(I.total / DEG, 0) + "° of turning in all)." : "q = −1: the hand is back where it started, but the quaternion says −1. One more full turn about any axis (×(−1)) brings it back to +1.";
		$("qn-i-note").textContent = note;
		Array.prototype.forEach.call($("qn-i-try").children, function (b) { b.setAttribute("aria-pressed", b.textContent === I.chip && (I.toks.length || I.prev) ? "true" : "false"); });
		$("qn-i-undo").disabled = !I.hist.length;
		iTable(); iReadouts();
	}
	function iTable() {
		var names = ["1", "i", "j", "k"], T = M.table(), hit = null;
		if (I.last && I.last !== "-1" && I.hist.length) { var prev = I.hist[I.hist.length - 1].Q, pn = M.basisName(prev); if (pn) { var neg = pn[0] === "−", pr = names.indexOf(pn.replace("−", "")), cl = names.indexOf(I.last); hit = I.left ? [cl, pr] : [pr, cl]; } }
		var h = "<tr><th>×</th>" + names.map(function (n) { return "<th>" + n + "</th>"; }).join("") + "</tr>";
		T.forEach(function (row, r) { h += "<tr><th>" + names[r] + "</th>" + row.map(function (v, c) { var cls = (v[0] === "−" ? "is-neg" : "") + (hit && hit[0] === r && hit[1] === c ? " is-hit" : ""); return '<td class="' + cls + '">' + v + "</td>"; }).join("") + "</tr>"; });
		$("qn-tbl").innerHTML = h;
	}
	function iReadouts() {
		var Q = I.Q, rr = M.toAxisAngle(Q, { reduce: true }), looks = Math.abs(Math.abs(Q[0]) - 1) < 1e-9;
		ro($("qn-i-ro"), [
			{ l: "q = w + xi + yj + zk", v: M.basisName(Q) || M.qString(Q), s: "(" + Q.map(function (x) { return f(x, 0); }).join(", ") + ")" },
			{ l: "Looks like the start?", v: looks ? "yes" : "no", s: looks ? "but the sign is " + (Q[0] > 0 ? "+1" : "−1") : "turned " + fd(rr.angle, 0) + " about " + vs(rr.axis, 0), c: looks ? (Q[0] > 0 ? "is-good" : "is-bad") : "" },
			{ l: "Turned in all", v: f(I.total / DEG, 0) + "°", s: f(I.total / TAU, 1) + " full turns" },
			{ l: "Half-angle (the dial)", v: fd(M.halfAngle(Q), 0), s: "w = cos of it" }
		]);
	}
	function iResize() { iSz = fitStage(iStage, function (w) { return w >= 700 ? Math.min(560, w * 0.56) : Math.max(330, w * 0.92); }); iDraw(); }
	function iDraw() {
		if (!iSz) return; var c = iSz.c, W = iSz.W, H = iSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H); setupCam(iCam, W, H);
		var S = new Scene(iCam), Q = iAnimQ(); axes(S, 2.1); handGhost(S, M.ONE); hand(S, Q);
		if (I.anim && I.anim.F) { var a = I.anim, axw = a.left ? a.F.ax : M.rotate(a.from, a.F.ax); S.line(mulv(axw, -2.3), mulv(axw, 2.3), COL.yel, 2, { dash: [6, 5], bias: -80 }); S.label(mulv(axw, 2.45), "turning about the " + (a.left ? "room's " : "hand's ") + ({ i: "x", j: "y", k: "z", "-1": "z" }[a.m]) + " axis", { col: COL.yel, size: 12, b: 1, al: "center", bg: 1 }); }
		/* the hand's own axes, small */
		var hx = M.rotate(Q, [1.7, 0, 0]), hy = M.rotate(Q, [0, 1.3, 0]), hz = M.rotate(Q, [0, 0, 0.9]);
		S.line([0, 0, 0], hz, "#e8fffb", 1.6, { arrow: 1, bias: -60 });
		S.draw(c);
		var qa = iAnimQ();
		title(c, "q = " + (M.basisName(qa, 1e-6) || M.qString(qa, 2)), W, H, { col: COL.teal, b: 1, size: 15 });
		hint(c, "faint outline = where it started · white arrow = back of the hand", W, H);
		dDraw(qa);
	}
	/* dial + bars */
	var dStage = $("qn-d-stage"), dSz = null;
	function dResize() { dSz = fitStage(dStage, function (w) { return w >= 460 ? 250 : 420; }); dDraw(iAnimQ()); }
	function dDraw(Q) {
		if (!dSz) return; var c = dSz.c, W = dSz.W, H = dSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H); Q = Q || I.Q;
		var wide = W >= 460, R = wide ? Math.min(H / 2 - 34, W * 0.2) : Math.min(W / 2 - 40, 110), cx = wide ? R + 34 : W / 2, cy = wide ? H / 2 + 6 : R + 34;
		c.strokeStyle = "#2a3550"; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
		c.strokeStyle = COL.dim; c.beginPath(); c.moveTo(cx - R - 6, cy); c.lineTo(cx + R + 6, cy); c.stroke();
		txt(c, "+1", cx + R + 8, cy + 4, { col: COL.teal, b: 1 }); txt(c, "−1", cx - R - 8, cy + 4, { col: COL.org, b: 1, al: "right" }); txt(c, "i, j, k", cx, cy - R - 8, { col: COL.dim, al: "center" });
		var ha = M.halfAngle(Q), ex = cx + Math.cos(ha) * R, ey = cy - Math.sin(ha) * R;
		c.strokeStyle = "rgba(255,209,102,0.35)"; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, R, -ha, 0); c.stroke();
		arrow2(c, cx, cy, ex, ey, COL.yel, 3, 11); c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, 3, 0, TAU); c.fill();
		txt(c, "half-angle " + f(ha / DEG, 0) + "°  ·  turn " + f(2 * ha / DEG, 0) + "°", cx, cy + R + 22, { col: COL.yel, b: 1, al: "center", size: 12 });
		/* bars */
		var bx = wide ? 2 * R + 90 : 30, by = wide ? 24 : 2 * R + 80, bw = W - bx - 20, bh = wide ? H - 50 : H - by - 20, n = 4, gap = 10, hb = (bh - gap * 3) / n, labs = ["w", "x", "y", "z"], cols = ["#e8ecf5", COL.x, COL.y, COL.z];
		for (var i = 0; i < n; i++) {
			var y = by + i * (hb + gap), mid = bx + bw / 2, v = Q[i];
			c.fillStyle = "#121a2b"; c.fillRect(bx, y, bw, hb); c.strokeStyle = "#2a3550"; c.beginPath(); c.moveTo(mid, y); c.lineTo(mid, y + hb); c.stroke();
			c.fillStyle = cols[i]; c.globalAlpha = 0.85; c.fillRect(v >= 0 ? mid : mid + v * bw / 2, y + 3, Math.abs(v) * bw / 2, hb - 6); c.globalAlpha = 1;
			txt(c, labs[i] + " = " + f(v, 2), bx + 6, y + hb / 2 + 4, { col: COL.text, b: 1, size: 12 });
		}
		txt(c, "−1", bx, by - 6, { col: COL.dim, size: 10 }); txt(c, "+1", bx + bw, by - 6, { col: COL.dim, size: 10, al: "right" });
	}

	/* ======================================================= 2. QUATERNIONS AT WORK ======================================================= */
	var rs = saved.r || {};
	function poseCopy(p) { return { p: p.p.slice(), e: p.e.slice() }; }
	function presetOf(id) { return M.POSES.filter(function (p) { return p.id === id; })[0] || M.POSES[0]; }
	var R = { pre: presetOf(q0.get("pre") || rs.pre).id, mode: /^(slerp|euler|both)$/.test(q0.get("m") || "") ? q0.get("m") : (rs.mode || "both"), T: num(rs.T, 1, 12, 5), rep: rs.rep !== false, tr: rs.tr !== false, u: 0, run: true, hold: 0 };
	(function () { var P = presetOf(R.pre); R.A = poseCopy(P.A); R.B = poseCopy(P.B);
		function pe(s) { var a = String(s || "").split(",").map(Number); return a.length === 3 && a.every(isFinite) ? [clamp(a[0], -180, 180), clamp(a[1], -90, 90), clamp(a[2], -180, 180)] : null; }
		var a = pe(q0.get("a")) || (rs.pre === R.pre && pe(rs.a)), b = pe(q0.get("b")) || (rs.pre === R.pre && pe(rs.b)); if (a) R.A.e = a; if (b) R.B.e = b; })();
	function rSave() { sset({ r: { pre: R.pre, mode: R.mode, T: R.T, rep: R.rep, tr: R.tr, a: R.A.e, b: R.B.e } }); }
	var rCam = Cam(-0.85, 0.36, 2.25, [1.15, 0.35, 1.3]), rCv = $("qn-r-c"), rStage = $("qn-r-stage"), rSz = null;
	var rReset = orbit(rCv, rCam, function () { rDraw(); });
	$("qn-r-view").onclick = rReset; $("qn-r-png").onclick = function () { png(rCv, "quaternion-robot-slerp"); };
	var rd = {};   /* precomputed paths */
	function eRad(e) { return [e[0] * DEG, e[1] * DEG, e[2] * DEG]; }
	function rPos(u) { var p = lerp3(R.A.p, R.B.p, u); p[2] += 0.45 * Math.sin(Math.PI * u); return p; }
	function rQs(u) { return M.slerp(rd.qa, rd.qb, u); }
	function rQe(u) { return M.eulerLerp(rd.ea, rd.eb, u, "ZYX"); }
	var MARK = [-M.ARM.d + 0.19, 0, 0.42];
	function rPrep() {
		rd.qa = M.poseQ(R.A); rd.qb = M.poseQ(R.B); rd.ea = eRad(R.A.e); rd.eb = eRad(R.B.e); rd.n = 120;
		rd.trS = []; rd.trE = []; rd.path = [];
		for (var i = 0; i <= rd.n; i++) { var u = i / rd.n, p = rPos(u); rd.path.push(p); rd.trS.push(addv(p, M.rotate(rQs(u), MARK))); rd.trE.push(addv(p, M.rotate(rQe(u), MARK))); }
		rd.spS = M.angularSpeeds(rQs, rd.n); rd.spE = M.angularSpeeds(rQe, rd.n);
		rd.th = M.angleBetween(rd.qa, rd.qb); rd.lenE = rd.spE.reduce(function (s, x) { return s + x; }, 0) / rd.n; rd.dq = M.delta(rd.qa, rd.qb);
		rd.wbS = []; rd.wbE = []; for (var j = 0; j <= rd.n; j++) { var uu = j / rd.n; rd.wbS.push(M.armIK(rPos(uu), M.toMatrix(rQs(uu))).wristBend / DEG); rd.wbE.push(M.armIK(rPos(uu), M.toMatrix(rQe(uu))).wristBend / DEG); }
	}
	var rPre = $("qn-r-pre");
	M.POSES.forEach(function (P) { var b = document.createElement("button"); b.type = "button"; b.textContent = P.name; b.setAttribute("aria-pressed", "false"); b.onclick = function () { R.pre = P.id; R.A = poseCopy(P.A); R.B = poseCopy(P.B); rSliders(); R.u = 0; R.run = true; rUpdate(); }; rPre.appendChild(b); });
	var rSl = {};
	["a0", "a1", "a2", "b0", "b1", "b2"].forEach(function (id) {
		var pose = id[0] === "a" ? "A" : "B", k = +id[1];
		rSl[id] = slider("qn-" + id, function () { return R[pose].e[k]; }, function (v) { R[pose].e[k] = v; rUpdate(); }, function (v) { return mi(String(v)) + "°"; });
	});
	function rSliders() { ["a0", "a1", "a2", "b0", "b1", "b2"].forEach(function (id) { rSl[id].set(R[id[0] === "a" ? "A" : "B"].e[+id[1]]); }); }
	var uS = slider("qn-r-u", function () { return R.u; }, function (v) { R.u = v; R.run = false; rPlayBtn(); rDraw(); gDraw(); rReadouts(); }, function (v) { return Math.round(v * 100) + "%"; });
	var rModeBtns = Array.prototype.slice.call(root.querySelectorAll("[data-rm]"));
	rModeBtns.forEach(function (b) { b.onclick = function () { R.mode = b.dataset.rm; setPressed(rModeBtns, b); rSave(); rDraw(); gDraw(); rReadouts(); }; });
	$("qn-r-rep").checked = R.rep; $("qn-r-rep").onchange = function () { R.rep = this.checked; rSave(); };
	$("qn-r-tr").checked = R.tr; $("qn-r-tr").onchange = function () { R.tr = this.checked; rSave(); rDraw(); };
	slider("qn-r-t", function () { return R.T; }, function (v) { R.T = v; rSave(); gDraw(); rReadouts(); }, function (v) { return v + " s"; });
	function rPlayBtn() { var b = $("qn-r-play"); b.textContent = R.run ? "❚❚ Pause" : "▶ Play"; b.setAttribute("aria-pressed", R.run ? "true" : "false"); }
	$("qn-r-play").onclick = function () { if (!R.run && R.u >= 1) R.u = 0; R.run = !R.run; rPlayBtn(); };
	$("qn-r-restart").onclick = function () { R.u = 0; R.hold = 0; R.run = true; rPlayBtn(); };
	function rUpdate() {
		rSave(); rPrep(); setPressed(rModeBtns, rModeBtns.filter(function (b) { return b.dataset.rm === R.mode; })[0]);
		Array.prototype.forEach.call(rPre.children, function (b, i) { var P = M.POSES[i]; b.setAttribute("aria-pressed", P.id === R.pre && P.A.e.join() === R.A.e.join() && P.B.e.join() === R.B.e.join() ? "true" : "false"); });
		var mx = Math.max.apply(null, rd.spE), mn = Math.min.apply(null, rd.spE);
		$("qn-r-note").textContent = "SLERP turns the gripper " + f(rd.th / DEG, 0) + "° about one fixed axis at a steady speed. Blending yaw, pitch and roll one by one turns it " + f(rd.lenE / DEG, 0) + "° in all" + (rd.lenE > rd.th * 1.05 ? " (" + f(rd.lenE / Math.max(rd.th, 1e-9), 1) + " times as far)" : "") + (mx > mn * 1.1 ? ", and its turning speed changes by a factor of " + f(mx / Math.max(mn, 1e-9), 1) + " along the way." : ".") + (Math.max(Math.abs(R.A.e[1]), Math.abs(R.B.e[1])) > 80 ? " Pitch near ±90° is gimbal lock: yaw and roll turn about almost the same line, so the Euler numbers swing far for a small real turn." : "");
		rDraw(); gDraw(); rReadouts();
	}
	function rStep(dt) { if (!R.run) return; if (R.u >= 1) { R.hold += dt; if (R.hold > 0.8) { R.hold = 0; if (R.rep) R.u = 0; else { R.run = false; rPlayBtn(); } } } else R.u = Math.min(1, R.u + dt / R.T); uS.set(R.u); }
	var GC = { body: "#c7d0de", dark: "#7d8aa1", acc: "#2fb8a6", ghost: "#ff9f43" };
	function gripper(S, P, q, col, alpha) {
		var Rm = M.toMatrix(q), d = M.ARM.d, o = { alpha: alpha }, c1 = { top: col, bot: shade(col, 0.6).replace(/rgb\((\d+),(\d+),(\d+)\)/, function (m, r, g, b) { return "#" + [r, g, b].map(function (x) { return (+x).toString(16).padStart(2, "0"); }).join(""); }), side: col };
		box(S, Rm, P, -d, -d + 0.1, -0.14, 0.14, -0.14, 0.14, { top: GC.dark, bot: GC.dark, side: GC.dark }, o);
		box(S, Rm, P, -d + 0.1, -d + 0.28, -0.34, 0.34, -0.09, 0.09, c1, o);
		box(S, Rm, P, -d + 0.28, 0, 0.2, 0.3, -0.06, 0.06, c1, o); box(S, Rm, P, -d + 0.28, 0, -0.3, -0.2, -0.06, 0.06, c1, o);
		box(S, Rm, P, -d + 0.12, -d + 0.26, -0.08, 0.08, 0.09, 0.42, { top: "#ffd166", bot: "#ffd166", side: "#e9b949" }, o);   /* the marker that shows which way is "up" on the gripper */
	}
	function link(S, a, b, wid, col) {
		var u = M.vunit(sub(b, a)), v = Math.abs(u[2]) > 0.95 ? [1, 0, 0] : M.vunit(M.cross([0, 0, 1], u)), w = M.cross(u, v), L = M.vnorm(sub(b, a));
		var Rm = [[u[0], v[0], w[0]], [u[1], v[1], w[1]], [u[2], v[2], w[2]]]; box(S, Rm, a, 0, L, -wid, wid, -wid, wid, { top: col, bot: col, side: col });
	}
	function rResize() { rSz = fitStage(rStage, function (w) { return w >= 700 ? Math.min(600, w * 0.58) : Math.max(360, w * 1.0); }); rDraw(); }
	function rDraw() {
		if (!rSz) return; var c = rSz.c, W = rSz.W, H = rSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H); setupCam(rCam, W, H);
		var S = new Scene(rCam), u = R.u, P = rPos(u), qs = rQs(u), qe = rQe(u), qa = R.mode === "euler" ? qe : qs, ik = M.armIK(P, M.toMatrix(qa));
		for (var gx = -1; gx <= 3.5; gx += 0.5) S.line([gx, -2.5, 0], [gx, 2.5, 0], COL.grid, 1, { bias: 400 });
		for (var gy = -2.5; gy <= 2.5; gy += 0.5) S.line([-1, gy, 0], [3.5, gy, 0], COL.grid, 1, { bias: 400 });
		S.line([0, 0, 0], [0.8, 0, 0], COL.x, 2, { arrow: 1, bias: 300 }); S.line([0, 0, 0], [0, 0.8, 0], COL.y, 2, { arrow: 1, bias: 300 }); S.label([0.95, 0, 0], "x", { col: COL.x, b: 1 }); S.label([0, 0.95, 0], "y", { col: COL.y, b: 1 });
		/* base: an octagonal column that turns */
		var ring = []; for (var k = 0; k < 8; k++) { var t = ik.base + k * TAU / 8; ring.push([0.38 * Math.cos(t), 0.38 * Math.sin(t)]); }
		for (var k2 = 0; k2 < 8; k2++) { var a = ring[k2], b = ring[(k2 + 1) % 8]; S.face([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], M.ARM.h0 - 0.1], [a[0], a[1], M.ARM.h0 - 0.1]], k2 === 0 ? "#3d5a80" : "#56647e"); }
		S.face(ring.map(function (p) { return [p[0], p[1], M.ARM.h0 - 0.1]; }), "#6b7a96");
		link(S, ik.S, ik.E, 0.13, "#8e9cb6"); link(S, ik.E, ik.W, 0.1, "#a6b3ca");
		S.ball(ik.S, 0.2, "#4f6a91"); S.ball(ik.E, 0.17, "#4f6a91"); S.ball(ik.W, 0.15, ik.wristLock ? "#d9534f" : "#4f6a91");
		gripper(S, P, qa, R.mode === "euler" ? GC.ghost : GC.acc);
		if (R.mode === "both") gripper(S, P, qe, GC.ghost, 0.45);
		/* poses A and B as outlines */
		[[R.A.p, rd.qa, "A"], [R.B.p, rd.qb, "B"]].forEach(function (pp) { var Rm = M.toMatrix(pp[1]), d = M.ARM.d; boxEdges(S, Rm, pp[0], -d + 0.1, -d + 0.28, -0.34, 0.34, -0.09, 0.09, "rgba(255,255,255,0.45)", 1, [3, 3]); boxEdges(S, Rm, pp[0], -d + 0.12, -d + 0.26, -0.08, 0.08, 0.09, 0.42, "rgba(255,209,102,0.6)", 1, [3, 3]); S.label(addv(pp[0], [0, 0, 0.62]), pp[2], { col: "#fff", b: 1, size: 14, al: "center", bg: 1 }); });
		S.poly(rd.path, "rgba(255,255,255,0.55)", 1.3, { dash: [5, 5], bias: -30 });
		if (R.tr) { if (R.mode !== "euler") S.poly(rd.trS, GC.acc, 2.2, { bias: -30 }); if (R.mode !== "slerp") S.poly(rd.trE, GC.ghost, 2.2, { bias: -30, dash: R.mode === "both" ? [4, 3] : null }); }
		/* the single equivalent axis, drawn through the gripper */
		var ax = rd.dq.aa.axis; S.line(addv(P, mulv(ax, -0.9)), addv(P, mulv(ax, 0.9)), COL.vio, 1.6, { dash: [3, 3], bias: -60 });
		S.draw(c);
		title(c, R.mode === "euler" ? "Euler angles blended" : R.mode === "slerp" ? "SLERP" : "SLERP (teal)  vs  Euler angles (orange ghost)", W, H, { col: R.mode === "euler" ? COL.org : COL.teal, b: 1, size: 14 });
		hint(c, "dashed = tool path · lines = path of the yellow marker · violet = SLERP axis", W, H);
		if (ik.wristLock || Math.abs(Math.sin(ik.wristBend)) < 0.08) title(c, "wrist near its singularity", W, H, { col: "#ff8a8a", b: 1 }, 1);
	}
	var gStage = $("qn-g-stage"), gSz = null;
	function gResize() { gSz = fitStage(gStage, function () { return 250; }); gDraw(); }
	function gDraw() {
		if (!gSz || !rd.spS) return; var c = gSz.c, W = gSz.W, H = gSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var r = { x: 56, y: 10, w: W - 72, h: H - 64 }, us = rd.spS.map(function (s, i) { return (i + 0.5) / rd.n; }), toS = function (v) { return v / DEG / R.T; };
		var ys = rd.spS.map(toS), ye = rd.spE.map(toS), mx = Math.max(Math.max.apply(null, ye), Math.max.apply(null, ys), 1) * 1.25;
		var fr = frame(c, r, { x0: 0, x1: 1, y0: 0, y1: mx, xl: "along the move (0 = A, 1 = B)", yl: "turning speed (°/s)", title: "How fast the gripper turns" });
		if (R.mode !== "euler") trace(c, r, fr, us, ys, GC.acc, 2.4); if (R.mode !== "slerp") trace(c, r, fr, us, ye, GC.ghost, 2.2);
		c.strokeStyle = "rgba(255,255,255,0.6)"; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(fr.X(R.u), r.y); c.lineTo(fr.X(R.u), r.y + r.h); c.stroke(); c.setLineDash([]);
		legend(c, r, [["SLERP: steady " + f(rd.th / DEG / R.T, 0) + "°/s", GC.acc], ["Euler angles", GC.ghost]].filter(function (it, i) { return R.mode === "both" || (R.mode === "slerp" ? i === 0 : i === 1); }), r.y + r.h + 34);
	}
	function rReadouts() {
		if (!rd.qa) return; var u = R.u, qs = rQs(u), qe = rQe(u), qa = R.mode === "euler" ? qe : qs, ik = M.armIK(rPos(u), M.toMatrix(qa)), e = M.toEuler(qa, "ZYX", 1e-4), aa = rd.dq.aa;
		ro($("qn-r-ro"), [
			{ l: "Along the move", v: Math.round(u * 100) + "%", s: f(u * R.T, 1) + " of " + R.T + " s" },
			{ l: "One turn from A to B", v: fd(aa.angle, 0), s: "about axis " + vs(aa.axis, 2) },
			{ l: "Euler blending turns", v: fd(rd.lenE, 0), s: rd.lenE > rd.th * 1.05 ? f(rd.lenE / Math.max(rd.th, 1e-9), 2) + "× the shortest" : "about the shortest" },
			{ l: "Gap SLERP vs Euler now", v: fd(M.angleBetween(qs, qe), 1), s: "how far the two grippers differ" },
			{ l: "Gripper yaw, pitch, roll", v: f(e.angles[0] / DEG, 0) + "°, " + f(e.angles[1] / DEG, 0) + "°, " + f(e.angles[2] / DEG, 0) + "°", s: e.gimbal || Math.abs(e.angles[1]) > 85 * DEG ? "near gimbal lock!" : "ZYX order", c: Math.abs(e.angles[1]) > 85 * DEG ? "is-bad" : "" },
			{ l: "Joints: base, shoulder, elbow", v: f(ik.base / DEG, 0) + "°, " + f(ik.shoulder / DEG, 0) + "°, " + f(ik.elbow / DEG, 0) + "°", s: "wrist bend " + f(ik.wristBend / DEG, 0) + "°" + (Math.abs(Math.sin(ik.wristBend)) < 0.08 ? " (singular)" : ""), c: Math.abs(Math.sin(ik.wristBend)) < 0.08 ? "is-bad" : "" }
		]);
	}

	/* ======================================================= 3. ROTATION CALCULATOR ======================================================= */
	var cs = saved.c || {};
	function pq(s) { var a = String(s || "").split(",").map(Number); return a.length === 4 && a.every(isFinite) && M.norm(a) > 1e-9 ? a : null; }
	function pv(s) { var a = String(s || "").split(",").map(Number); return a.length === 3 && a.every(isFinite) ? a : null; }
	var C = { q: pq(q0.get("q")) || pq(cs.q && cs.q.join()) || M.fromEuler([30 * DEG, 20 * DEG, 10 * DEG], "ZYX"), order: M.ORDERS.indexOf(q0.get("o")) >= 0 ? q0.get("o") : (M.ORDERS.indexOf(cs.order) >= 0 ? cs.order : "ZYX"), v: pv(q0.get("v")) || pv(cs.v && cs.v.join()) || [1, 0, 0], q1: pq(cs.q1 && cs.q1.join()) || M.I.slice(), q2: pq(cs.q2 && cs.q2.join()) || M.J.slice(), aaAng: null };
	function cSave() { sset({ c: { q: C.q, order: C.order, v: C.v, q1: C.q1, q2: C.q2 } }); }
	var cCam = Cam(-0.62, 0.45, 1.9), cCv = $("qn-c-c"), cStage = $("qn-c-stage"), cSz = null;
	var cReset = orbit(cCv, cCam, function () { cDraw(); });
	$("qn-c-view").onclick = cReset; $("qn-c-png").onclick = function () { png(cCv, "quaternion-rotation"); };
	var mBox = $("qn-m"); for (var mi_ = 0; mi_ < 9; mi_++) { var lb = document.createElement("label"); lb.innerHTML = "m" + (Math.floor(mi_ / 3) + 1) + (mi_ % 3 + 1) + '<input id="qn-m' + mi_ + '" inputmode="decimal">'; mBox.appendChild(lb); }
	var eo = $("qn-eo"); M.ORDERS.forEach(function (o) { var op = document.createElement("option"); op.value = o; op.textContent = o + " (R = R" + o[0].toLowerCase() + " · R" + o[1].toLowerCase() + " · R" + o[2].toLowerCase() + ")" + (o === "ZYX" ? ": yaw, pitch, roll" : ""); eo.appendChild(op); }); eo.value = C.order;
	function setV(id, x, d) { var el = $(id); if (document.activeElement !== el) { el.value = f(x, d == null ? 5 : d).replace(/−/g, "-").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); el.classList.remove("is-bad"); } }
	function cFill(src) {
		var u = M.normalize(C.q), nq = M.norm(C.q);
		if (src !== "q") ["w", "x", "y", "z"].forEach(function (k, i) { setV("qn-q-" + k, C.q[i]); });
		$("qn-q-n").textContent = "|q| = " + f(nq, 6) + (Math.abs(nq - 1) > 1e-6 ? ": not a unit quaternion, so it is normalised before turning anything (a non-unit q also stretches by |q|²)." : ": a unit quaternion.");
		if (src !== "aa") { var aa = M.toAxisAngle(u); if (C.aaAng != null && src === "q") {} setV("qn-aa-x", aa.axis[0]); setV("qn-aa-y", aa.axis[1]); setV("qn-aa-z", aa.axis[2]); setV("qn-aa-a", aa.angle / DEG, 4); }
		var m = M.toMatrix(u); if (src !== "m") for (var i = 0; i < 9; i++) setV("qn-m" + i, m[Math.floor(i / 3)][i % 3]);
		if (src !== "m") $("qn-m-w").textContent = "";
		var e = M.toEuler(u, C.order, 1e-6), nm = { X: "about x", Y: "about y", Z: "about z" };
		if (src !== "e") { setV("qn-e0", e.angles[0] / DEG, 4); setV("qn-e1", e.angles[1] / DEG, 4); setV("qn-e2", e.angles[2] / DEG, 4); }
		$("qn-e0-l").firstChild.textContent = C.order[0].toLowerCase() + " first (°)"; $("qn-e1-l").firstChild.textContent = "then " + C.order[1].toLowerCase() + " (°)"; $("qn-e2-l").firstChild.textContent = "then " + C.order[2].toLowerCase() + " (°)";
		$("qn-eo-n").textContent = "Turn " + nm[C.order[0]] + ", then about the new " + C.order[1].toLowerCase() + ", then the new " + C.order[2].toLowerCase() + " (same as fixed " + C.order.split("").reverse().join(", ") + "). The middle angle stays between −90° and 90°.";
		var eu = src === "e" ? [parseNum($("qn-e0").value), parseNum($("qn-e1").value), parseNum($("qn-e2").value)].map(function (x) { return x * DEG; }) : e.angles;
		var lk = M.gimbalCloseness(eu); $("qn-e-w").textContent = lk > 1 - 1e-6 || e.gimbal ? "Gimbal lock: the middle angle is ±90°, so the first and last axes line up. Only their " + (C.order[0] === C.order[2] ? "" : "sum or difference") + " matters; converting back, the first angle carries it and the last is set to 0." : lk > 0.826 ? "Close to gimbal lock (middle angle " + f(eu[1] / DEG, 1) + "°): small turns of the object swing the first and last angles a long way." : "";
		cSave(); cOps(); cVec(); cReadouts(); cDraw();
	}
	function readNums(ids) { var bad = false, out = ids.map(function (id) { var el = $(id), v = parseNum(el.value); el.classList.toggle("is-bad", !isFinite(v)); if (!isFinite(v)) bad = true; return v; }); return bad ? null : out; }
	["x", "y", "z", "a"].forEach(function (k) { $("qn-aa-" + k).addEventListener("input", function () { var v = readNums(["qn-aa-x", "qn-aa-y", "qn-aa-z", "qn-aa-a"]); if (!v) return; if (M.vnorm(v.slice(0, 3)) < 1e-12) { $("qn-aa-x").classList.add("is-bad"); return; } C.q = M.fromAxisAngle(v.slice(0, 3), v[3] * DEG); cFill("aa"); }); });
	["w", "x", "y", "z"].forEach(function (k) { $("qn-q-" + k).addEventListener("input", function () { var v = readNums(["qn-q-w", "qn-q-x", "qn-q-y", "qn-q-z"]); if (!v || M.norm(v) < 1e-12) return; C.q = v; cFill("q"); }); });
	for (var mj = 0; mj < 9; mj++) $("qn-m" + mj).addEventListener("input", function () {
		var ids = []; for (var i = 0; i < 9; i++) ids.push("qn-m" + i); var v = readNums(ids); if (!v) return;
		var m = [v.slice(0, 3), v.slice(3, 6), v.slice(6, 9)], ck = M.matCheck(m);
		$("qn-m-w").textContent = ck.isRotation ? "" : ck.det < 0 ? "This matrix has determinant " + f(ck.det, 3) + " < 0: it mirrors as well as turns, which no quaternion can do. The nearest turn is shown." : "Not quite a rotation (columns off by up to " + f(ck.orthoErr, 3) + "): the nearest turn is used.";
		C.q = M.fromMatrix(m); cFill("m");
	});
	["0", "1", "2"].forEach(function (k) { $("qn-e" + k).addEventListener("input", function () { var v = readNums(["qn-e0", "qn-e1", "qn-e2"]); if (!v) return; C.q = M.fromEuler(v.map(function (x) { return x * DEG; }), C.order); cFill("e"); }); });
	eo.onchange = function () { C.order = eo.value; cFill(); };
	$("qn-c-id").onclick = function () { C.q = M.ONE.slice(); cFill(); };
	$("qn-c-neg").onclick = function () { C.q = M.neg(C.q); cFill(); toast("q → −q: the matrix and the picture do not change"); };
	$("qn-c-nrm").onclick = function () { C.q = M.normalize(C.q); cFill(); };
	$("qn-c-rnd").onclick = function () { var v; do { v = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]; } while (M.norm(v) < 0.2 || M.norm(v) > 1); C.q = M.normalize(v); cFill(); };
	["q1", "q2"].forEach(function (nm) { ["w", "x", "y", "z"].forEach(function (k, i) { var el = $("qn-" + nm + "-" + k); el.value = f(C[nm][i], 4).replace(/−/g, "-"); el.addEventListener("input", function () { var v = readNums(["w", "x", "y", "z"].map(function (kk) { return "qn-" + nm + "-" + kk; })); if (!v) return; C[nm] = v; cSave(); cOps(); }); }); });
	function setQn(nm, v) { C[nm] = v.slice(); ["w", "x", "y", "z"].forEach(function (k, i) { var el = $("qn-" + nm + "-" + k); el.value = f(v[i], 6).replace(/−/g, "-").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); el.classList.remove("is-bad"); }); cSave(); cOps(); }
	$("qn-q1-use").onclick = function () { setQn("q1", M.normalize(C.q)); }; $("qn-q2-use").onclick = function () { setQn("q2", M.normalize(C.q)); };
	$("qn-pr-ij").onclick = function () { setQn("q1", M.I); setQn("q2", M.J); };
	$("qn-pr-sw").onclick = function () { var a = C.q1.slice(); setQn("q1", C.q2); setQn("q2", a); };
	$("qn-pr-up").onclick = function () { C.q = M.mul(C.q1, C.q2); cFill(); toast("q₁·q₂ is now the rotation above"); };
	["x", "y", "z"].forEach(function (k) { var el = $("qn-v-" + k); el.addEventListener("input", function () { var v = readNums(["qn-v-x", "qn-v-y", "qn-v-z"]); if (!v) return; C.v = v; cSave(); cVec(); cDraw(); }); });
	function qs4(a) { return M.qString(a, 4); }
	function cOps() {
		var a = C.q1, b = C.q2, ab = M.mul(a, b), ba = M.mul(b, a), ia = M.inv(a), na = M.norm(a), t = M.toAxisAngle(ab), same = M.sameRotation(ab, ba, 1e-9);
		var rows = [["q₁ · q₂", qs4(ab)], ["q₂ · q₁", qs4(ba) + (M.near(ab, ba, 1e-12) ? "  (the same: these two commute)" : same ? "  (same turn, opposite sign)" : "  (different: order matters)")],
			["q₁*  (conjugate)", qs4(M.conj(a))], ["q₁⁻¹ = q₁*/|q₁|²", ia ? qs4(ia) : "none (q₁ = 0)"], ["|q₁|, |q₂|", f(na, 6) + ", " + f(M.norm(b), 6)], ["q₁ normalised", qs4(M.normalize(a))],
			["q₁ · q₂ as a turn", fd(t.angle, 3) + " about " + vs(t.axis, 4) + (t.angle > Math.PI + 1e-9 ? " (= " + fd(TAU - t.angle, 3) + " the other way, sign −)" : "")],
			["|q₁ q₂| = |q₁| |q₂|", f(M.norm(ab), 6) + " = " + f(na * M.norm(b), 6)]];
		$("qn-ops").innerHTML = rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("");
	}
	function cVec() {
		var st = M.rotateSteps(C.q, C.v), vm = M.rotate(M.neg(C.q), C.v), mv = M.matVec(M.toMatrix(C.q), C.v);
		var rows = [["q (unit)", qs4(st.q)], ["v as a quaternion", qs4(st.p)], ["q v", qs4(st.qp)], ["q v q*", qs4(st.qpq)], ["v′", vs(st.v, 4)], ["R v (the matrix)", vs(mv, 4)], ["with −q instead", vs(vm, 4)], ["length |v| → |v′|", f(M.vnorm(C.v), 4) + " → " + f(M.vnorm(st.v), 4)]];
		$("qn-vr").innerHTML = rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("");
	}
	function cReadouts() {
		var u = M.normalize(C.q), r = M.toAxisAngle(u, { reduce: true }), e = M.toEuler(u, C.order, 1e-6);
		ro($("qn-c-ro"), [
			{ l: "Smallest turn", v: fd(r.angle, 2), s: "about " + vs(r.axis, 3) },
			{ l: "q and −q", v: qs4(u[0] >= 0 ? u : M.neg(u)), s: "or " + qs4(u[0] >= 0 ? M.neg(u) : u) + ": the same turn" },
			{ l: "Euler " + C.order, v: f(e.angles[0] / DEG, 1) + "°, " + f(e.angles[1] / DEG, 1) + "°, " + f(e.angles[2] / DEG, 1) + "°", s: e.gimbal ? "gimbal lock" : "middle angle " + f(e.angles[1] / DEG, 1) + "°", c: M.gimbalCloseness(e.angles) > 0.826 ? "is-bad" : "" },
			{ l: "v → v′", v: vs(M.rotate(u, C.v), 2), s: "from " + vs(C.v, 2) }
		]);
	}
	function cResize() { cSz = fitStage(cStage, function (w) { return w >= 700 ? Math.min(520, w * 0.5) : Math.max(320, w * 0.9); }); cDraw(); }
	function cDraw() {
		if (!cSz) return; var c = cSz.c, W = cSz.W, H = cSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H); setupCam(cCam, W, H);
		var S = new Scene(cCam), u = M.normalize(C.q), r = M.toAxisAngle(u, { reduce: true }); axes(S, 2.1); handGhost(S, M.ONE); hand(S, u, null, 0.9);
		if (r.angle > 1e-6) { S.line(mulv(r.axis, -2.4), mulv(r.axis, 2.4), COL.yel, 2, { dash: [6, 5], bias: -80 }); S.label(mulv(r.axis, 2.55), "axis, " + f(r.angle / DEG, 1) + "°", { col: COL.yel, b: 1, al: "center", bg: 1 });
			/* a little arc showing the sense of the turn */
			var a0 = Math.abs(r.axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], e1 = M.vunit(M.cross(r.axis, a0)), e2 = M.cross(r.axis, e1), ctr = mulv(r.axis, 1.95), arc = [];
			for (var t = 0; t <= 24; t++) { var ang = r.angle * t / 24; arc.push(addv(ctr, addv(mulv(e1, 0.45 * Math.cos(ang)), mulv(e2, 0.45 * Math.sin(ang))))); }
			S.poly(arc, COL.yel, 2, { bias: -80 }); S.line(arc[arc.length - 2], arc[arc.length - 1], COL.yel, 2, { arrow: 1, bias: -80 }); }
		var vn = M.vnorm(C.v); if (vn > 1e-9) { var sc = 1.8 / vn, v1 = mulv(C.v, sc), v2 = mulv(M.rotate(u, C.v), sc); S.line([0, 0, 0], v1, COL.vio, 2.4, { arrow: 1, bias: -70 }); S.line([0, 0, 0], v2, "#ff7ad9", 2.6, { arrow: 1, bias: -70 }); S.label(v1, "v", { col: COL.vio, b: 1, size: 14 }); S.label(v2, "v′", { col: "#ff7ad9", b: 1, size: 14 }); }
		S.draw(c); title(c, "q = " + M.qString(u, 3), W, H, { col: COL.teal, b: 1, size: 14 });
		hint(c, "faint outline = no turn · violet v → pink v′", W, H);
	}

	/* ======================================================= 4. 720° AND SPINORS ======================================================= */
	var ss = saved.s || {};
	var AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], t: M.vunit([1, 1, 1]) };
	var Sp = { th: num(q0.get("th"), 0, 1080, num(ss.th, 0, 1080, 0)), ax: AXES[q0.get("ax")] ? q0.get("ax") : (AXES[ss.ax] ? ss.ax : "x"), belt: /^(relax|all|off)$/.test(q0.get("belt") || "") ? q0.get("belt") : (ss.belt || "relax"), sp: num(ss.sp, 10, 240, 60), run: !q0.get("th") };
	function sSave() { sset({ s: { th: Math.round(Sp.th), ax: Sp.ax, belt: Sp.belt, sp: Sp.sp } }); }
	var sCam = Cam(-0.75, 0.4, 3.1, [-1.0, 0, 0]), sCv = $("qn-s-c"), sStage = $("qn-s-stage"), sSz = null;
	var sReset = orbit(sCv, sCam, function () { sDraw(); });
	$("qn-s-view").onclick = sReset; $("qn-s-png").onclick = function () { png(sCv, "quaternion-720-spinor"); };
	var thS = slider("qn-s-th", function () { return Sp.th; }, function (v) { Sp.th = v; Sp.run = false; sPlayBtn(); sUpdate(); }, function (v) { return Math.round(v) + "° (" + (v / 360).toFixed(2) + " turns)"; });
	slider("qn-s-sp", function () { return Sp.sp; }, function (v) { Sp.sp = v; sSave(); }, function (v) { return v + "°/s"; });
	$("qn-s-ax").value = Sp.ax; $("qn-s-ax").onchange = function () { Sp.ax = this.value; sUpdate(); };
	var beltBtns = Array.prototype.slice.call(root.querySelectorAll("[data-belt]"));
	beltBtns.forEach(function (b) { b.onclick = function () { Sp.belt = b.dataset.belt; sUpdate(); }; });
	[["0°", 0], ["180°", 180], ["360°: q = −1", 360], ["540°", 540], ["720°: q = +1", 720], ["1080°", 1080]].forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p[0]; b.onclick = function () { Sp.th = p[1]; Sp.run = false; sPlayBtn(); thS.set(Sp.th); sUpdate(); }; $("qn-s-pre").appendChild(b); });
	function sPlayBtn() { var b = $("qn-s-play"); b.textContent = Sp.run ? "❚❚ Pause" : "▶ Play"; b.setAttribute("aria-pressed", Sp.run ? "true" : "false"); }
	$("qn-s-play").onclick = function () { Sp.run = !Sp.run; sPlayBtn(); };
	$("qn-s-zero").onclick = function () { Sp.th = 0; thS.set(0); sUpdate(); };
	function sStep(dt) { if (!Sp.run) return; Sp.th += Sp.sp * dt; if (Sp.th > 1080) Sp.th = 0; thS.set(Sp.th); sUpdate(true); }
	function sUpdate(quiet) {
		if (!quiet) sSave(); setPressed(beltBtns, beltBtns.filter(function (b) { return b.dataset.belt === Sp.belt; })[0]);
		Array.prototype.forEach.call($("qn-s-pre").children, function (b) { b.setAttribute("aria-pressed", Math.abs(parseFloat(b.textContent) - Sp.th) < 0.5 ? "true" : "false"); });
		var th = Sp.th * DEG, st = M.spinorAt(th, AXES[Sp.ax]), tw = M.beltTwist(th), turns = Sp.th / 360;
		$("qn-s-note").textContent = "θ = " + Math.round(Sp.th) + "°. The matrix is " + (Math.abs(Math.cos(th) - 1) < 1e-3 ? "back to the identity" : "not the identity") + "; the quaternion is " + (st.w > 0.9995 ? "+1: back to the start" : st.w < -0.9995 ? "−1: same picture, opposite sign" : "w = " + f(st.w, 3)) + ". " + (Sp.belt === "relax" ? "The ribbon is shown with the least twist it can be relaxed to: " + Math.round(tw / DEG) + "°" + (Math.abs(tw - TAU) < 1e-3 ? " (exactly at one turn it could be drawn twisted either way round)." : ".") : Sp.belt === "all" ? "The ribbon keeps every turn: " + f(turns, 2) + " full twists." : "");
		if (!quiet || tab === "spinor") { sReadouts(); }
		sDraw(); pDraw();
	}
	function sReadouts() {
		var th = Sp.th * DEG, st = M.spinorAt(th, AXES[Sp.ax]);
		ro($("qn-s-ro"), [
			{ l: "Turned θ", v: Math.round(Sp.th) + "°", s: (Sp.th / 360).toFixed(2) + " turns" },
			{ l: "Quaternion w = cos(θ/2)", v: f(st.w, 3), s: "sign " + (st.w < 0 ? "−" : "+"), c: st.w < -0.999 ? "is-bad" : st.w > 0.999 ? "is-good" : "" },
			{ l: "Matrix entry cos θ", v: f(Math.cos(th), 3), s: "(trace − 1) / 2" },
			{ l: "Least ribbon twist", v: Math.round(M.beltTwist(th) / DEG) + "°", s: M.beltTwist(th) < 1e-3 ? "can be undone" : "cannot be undone" }
		]);
	}
	function sResize() { sSz = fitStage(sStage, function (w) { return w >= 700 ? Math.min(520, w * 0.5) : Math.max(330, w * 0.9); }); sDraw(); }
	function sDraw() {
		if (!sSz) return; var c = sSz.c, W = sSz.W, H = sSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H); setupCam(sCam, W, H);
		var S = new Scene(sCam), th = Sp.th * DEG, ax = AXES[Sp.ax], q = M.fromAxisAngle(ax, th), wallX = -3.6;
		S.face([[wallX, -1.5, -1.3], [wallX, 1.5, -1.3], [wallX, 1.5, 1.5], [wallX, -1.5, 1.5]], "#3b4458", { cull: false, alpha: 0.85, bias: 300 });
		S.line(mulv(ax, -2.2), mulv(ax, 2.4), COL.yel, 1.6, { dash: [6, 5], bias: -80 }); S.label(mulv(ax, 2.55), "axis", { col: COL.yel, b: 1, al: "center" });
		hand(S, q, null, 0.85);
		if (Sp.belt !== "off") {
			var N = 48, A = [wallX, 0, 0], att = M.rotate(q, [-0.95 * 0.85, 0, 0]), prev = null;
			for (var i = 0; i <= N; i++) {
				var s = i / N, fq = M.beltFrame(th, ax, s, Sp.belt), p = lerp3(A, att, s), wv = M.rotate(fq, [0, 0.3, 0]), cur = [addv(p, wv), sub(p, wv)];
				if (prev) S.face([prev[0], cur[0], cur[1], prev[1]], COL.teal, { cull: false, two: ["#2fb8a6", "#f08a3c"] });
				prev = cur;
			}
		}
		S.draw(c);
		var st = M.spinorAt(th, ax); title(c, "θ = " + Math.round(Sp.th) + "°   q = " + M.qString(q, 2), W, H, { col: COL.teal, b: 1, size: 14 }, 0);
		title(c, st.w < -0.999 ? "same picture, q = −1" : st.w > 0.999 && Sp.th > 1 ? "q = +1 again" : "", W, H, { col: st.w < 0 ? COL.org : COL.teal, b: 1, size: 13 }, 1);
		hint(c, "ribbon: teal side and orange side show its twist", W, H);
	}
	var pStage = $("qn-p-stage"), pSz = null;
	function pResize() { pSz = fitStage(pStage, function () { return 270; }); pDraw(); }
	function pDraw() {
		if (!pSz) return; var c = pSz.c, W = pSz.W, H = pSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var r = { x: 46, y: 12, w: W - 62, h: H - (W < 520 ? 88 : 66) }, xs = [], yw = [], yc = [], yt = [];
		for (var d = 0; d <= 1080; d += 4) { xs.push(d); yw.push(Math.cos(d * DEG / 2)); yc.push(Math.cos(d * DEG)); yt.push(M.beltTwist(d * DEG) / TAU); }
		var fr = frame(c, r, { x0: 0, x1: 1080, y0: -1.1, y1: 1.1, xs: 180, ys: 0.5, xu: "°", xl: "turned θ", title: "Quaternion vs matrix" });
		[360, 720].forEach(function (v) { c.strokeStyle = "rgba(255,255,255,0.35)"; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(fr.X(v), r.y); c.lineTo(fr.X(v), r.y + r.h); c.stroke(); c.setLineDash([]); });
		trace(c, r, fr, xs, yt, "#7d8aa1", 1.4, [3, 3]); trace(c, r, fr, xs, yc, COL.org, 2); trace(c, r, fr, xs, yw, COL.teal, 2.6);
		var x = fr.X(Sp.th); c.strokeStyle = COL.yel; c.beginPath(); c.moveTo(x, r.y); c.lineTo(x, r.y + r.h); c.stroke();
		[[Math.cos(Sp.th * DEG / 2), COL.teal], [Math.cos(Sp.th * DEG), COL.org]].forEach(function (p) { c.fillStyle = p[1]; c.beginPath(); c.arc(x, fr.Y(p[0]), 4.5, 0, TAU); c.fill(); });
		legend(c, r, [["w = cos(θ/2): back at 720°", COL.teal], ["matrix cos θ: back at 360°", COL.org], ["least ribbon twist ÷ 360°", "#9aa6bd"]], r.y + r.h + 34);
	}
	(function () { var drag = false, cv = $("qn-p-c"); function at(e) { var b = cv.getBoundingClientRect(), r = { x: 46, w: b.width - 62 }; Sp.th = clamp(Math.round((e.clientX - b.left - r.x) / r.w * 1080), 0, 1080); Sp.run = false; sPlayBtn(); thS.set(Sp.th); sUpdate(true); }
		cv.addEventListener("pointerdown", function (e) { drag = true; at(e); }); cv.addEventListener("pointermove", function (e) { if (drag) at(e); }); window.addEventListener("pointerup", function () { if (drag) { drag = false; sSave(); } }); })();

	/* ======================================================= loop / sizing ======================================================= */
	function onResize() { if (tab === "ijk") { iResize(); dResize(); } else if (tab === "robot") { rResize(); gResize(); } else if (tab === "calc") cResize(); else { sResize(); pResize(); } }
	var rT; window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(onResize, 60); });
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rT); rT = setTimeout(onResize, 60); }).observe(root);
	var last = 0, roT = 0;
	function tick(dt) {
		roT += dt;
		if (tab === "ijk") { if (I.anim) { iStep(dt); iDraw(); } }
		else if (tab === "robot") { if (R.run) { rStep(dt); rDraw(); gDraw(); if (roT > 0.15) { roT = 0; rReadouts(); } } }
		else if (tab === "spinor") { if (Sp.run) { sStep(dt); if (roT > 0.2) { roT = 0; sReadouts(); } } }
	}
	function loop(ts) { var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts; if (!document.hidden) tick(dt); requestAnimationFrame(loop); }
	/* the ijk word from a shared link plays on load */
	setTab(tab, true); iUpdate(); rUpdate(); rPlayBtn(); cFill(); sUpdate(); sPlayBtn();
	if (q0.get("w")) { String(q0.get("w")).replace(/[^ijk-]/g, "").slice(0, 16).split("").forEach(function (ch) { iPress(ch === "-" ? "-1" : ch); }); }
	requestAnimationFrame(loop);
	window.MESQuatUI = { I: I, R: R, C: C, Sp: Sp, tick: function (ms, n) { for (var i = 0; i < (n || 1); i++) tick((ms || 16) / 1000); }, setTab: setTab };
})();
