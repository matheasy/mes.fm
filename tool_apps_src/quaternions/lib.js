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
