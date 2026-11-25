/* MES Gyroscope & Spinning Top Simulator -- pure physics (no DOM). Browser global `MESGyro`; node: require('./tool_apps_src/gyroscope-simulator/lib.js');
 * tests: node tool_apps_src/gyroscope-simulator-tests.js
 * SI units, z up, gravity -g z. Quaternions [w, x, y, z] turn body axes into world axes; body axis 3 = the symmetry (spin) axis.
 * 1. Pivot: a symmetric top or gyroscope on a fixed point. Euler's equations about the pivot, I w' = -w x I w + torque, RK4.
 *    Torques: gravity, an optional constant magnetic pull on a point of the axis, spin friction and precession friction
 *    (both measured relative to the holder, which can be turned while the top runs: that is how "moving the holder" is modelled).
 * 2. Floor: a top with a round tip of radius a on a flat floor (6 degrees of freedom, contact kept by solving for the normal force),
 *    Coulomb sliding friction at the contact (smoothed near zero slip). This is the textbook model of a rising top (sliding friction at a round tip).
 * 3. Ice block: a gyroscope on a pivot stand that sits on a block on ice. Lagrange's equations in (X, Y, theta, phi, psi) with the
 *    mass matrix built exactly; the block sticks until the force it needs is more than static friction, then slides with kinetic friction. */
(function (root) {
	"use strict";
	var G = 9.81, TAU = Math.PI * 2, DEG = Math.PI / 180;

	/* ---------- small vector / quaternion helpers ---------- */
	function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function norm(a) { return Math.sqrt(dot(a, a)); }
	function unit(a) { var n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
	function qmul(a, b) { return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]]; }
	function qnorm(q) { var n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; }
	function qaxis(ax, ang) { var u = unit(ax), s = Math.sin(ang / 2); return [Math.cos(ang / 2), u[0] * s, u[1] * s, u[2] * s]; }
	function rot(q, v) { var p = qmul(qmul(q, [0, v[0], v[1], v[2]]), [q[0], -q[1], -q[2], -q[3]]); return [p[1], p[2], p[3]]; }
	function rotInv(q, v) { return rot([q[0], -q[1], -q[2], -q[3]], v); }
	/* the orientation with the spin axis tilted theta from vertical, toward azimuth phi (axis = (sin t cos p, sin t sin p, cos t)) */
	function qTilt(theta, phi) { return qmul(qaxis([0, 0, 1], phi), qaxis([0, 1, 0], theta)); }
	function e3of(q) { return rot(q, [0, 0, 1]); }
	function tiltOf(q) { var e = e3of(q); return Math.acos(Math.max(-1, Math.min(1, e[2]))); }
	function aziOf(q) { var e = e3of(q); return Math.atan2(e[1], e[0]); }

	/* ---------- the tops ---------- */
	/* m kg; I1 (across the axis) and I3 (about the axis) about the centre of mass, kg m^2; l = centre of mass to the pivot / tip point (m);
	   a = tip radius (floor model); r = rotor radius, h = height, for drawing */
	var BODIES = {
		top:      { name: "Wooden spinning top", m: 0.060, I1: 1.6e-5, I3: 2.2e-5, l: 0.022, a: 0.004, r: 0.027, h: 0.055, kind: "top" },
		gyro:     { name: "Toy gyroscope (rotor in a frame)", m: 0.140, I1: 6.5e-5, I3: 1.05e-4, l: 0.040, a: 0.0012, r: 0.032, h: 0.085, kind: "gyro" },
		gyrotop:  { name: "Gyrotop-style magnetic top (sharp tip)", m: 0.030, I1: 4.0e-6, I3: 6.0e-6, l: 0.012, a: 0.0003, r: 0.020, h: 0.030, kind: "top" },
		heavy:    { name: "Heavy flywheel gyroscope", m: 2.0, I1: 2.6e-3, I3: 4.5e-3, l: 0.090, a: 0.003, r: 0.075, h: 0.20, kind: "gyro" },
		tippe:    { name: "Tippe top (ball with a stem)", m: 0.015, I1: 1.31e-6, I3: 1.45e-6, l: 0.011, a: 0.014, r: 0.014, h: 0.032, kind: "tippe" }
	};
	function body(id, over) { var b = {}, s = BODIES[id] || BODIES.top, k; for (k in s) b[k] = s[k]; if (over) for (k in over) b[k] = over[k]; b.id = id; return b; }

	/* ---------- textbook formulas (symmetric top on a fixed pivot) ---------- */
	function I1p(b) { return b.I1 + b.m * b.l * b.l; }
	/* steady precession rates at tilt theta and spin component w3: I1p cos(t) W^2 - I3 w3 W + m g l = 0. slow and fast roots (rad/s) */
	function steadyPrecession(b, w3, theta, g) {
		g = g == null ? G : g; var A = I1p(b) * Math.cos(theta), B = b.I3 * w3, C = b.m * g * b.l;
		if (Math.abs(A) < 1e-14) return { slow: C / B, fast: Infinity, ok: true };
		var D = B * B - 4 * A * C; if (D < 0) return { slow: NaN, fast: NaN, ok: false };
		var r = Math.sqrt(D), slow = 2 * C / (B + (B >= 0 ? r : -r));      // stable form of the small root
		return { slow: slow, fast: C / (A * slow), ok: true };
	}
	function fastTopPrecession(b, w3, g) { return b.m * (g == null ? G : g) * b.l / (b.I3 * w3); }          // W = m g l / L, the usual gyroscope formula
	function nutationRate(b, w3) { return b.I3 * Math.abs(w3) / I1p(b); }                                    // fast-top nutation, rad/s
	/* released from rest at tilt theta: the axis dips by about 2 I1p m g l sin(t) / (I3 w3)^2 (cusped nutation) */
	function nutationDip(b, w3, theta, g) { var L = b.I3 * w3; return 2 * I1p(b) * b.m * (g == null ? G : g) * b.l * Math.sin(theta) / (L * L); }
	/* a vertical top on a pivot "sleeps" (stays up) when w3^2 > 4 I1p m g l / I3^2 (Maiyevsky / Klein-Sommerfeld) */
	function sleepSpin(b, g) { return b.l <= 0 ? 0 : Math.sqrt(4 * I1p(b) * b.m * (g == null ? G : g) * b.l) / b.I3; }
	function rpm(w) { return w * 60 / TAU; }
	function radps(r) { return r * TAU / 60; }

	/* =============================================== 1. top on a pivot =============================================== */
	/* state {q, w (body, rad/s), t}. opt: {g, ks (spin friction, N m s), kp (precession friction, N m s), kair (air drag on every turn, N m s),
	   wh (holder's angular velocity, world, rad/s), mag {F: world force vector (N), d: distance of the magnet from the pivot along the axis (m)}} */
	/* w3 = the whole angular velocity component along the axis (what the steady-precession formula calls w3) */
	function pivotState(theta, phi, w3, prec, nut) {
		var q = qTilt(theta, phi || 0), e3 = e3of(q);
		/* world angular velocity: precession about z + the rest along e3 (so w . e3 = w3) + optional tilt rate along the "down the slope" axis */
		var wv = add(mul(e3, w3 - (prec || 0) * e3[2]), [0, 0, prec || 0]);
		if (nut) { var horiz = unit(cross([0, 0, 1], e3)); wv = add(wv, mul(horiz, nut)); }
		var wb = rotInv(q, wv);
		return { q: q, w: wb, t: 0 };
	}
	function pivotDeriv(b, s, o) {
		var I1 = I1p(b), I3 = b.I3, q = s.q, w = s.w, g = o.g == null ? G : o.g;
		var e3 = e3of(q);
		var tw = cross(mul(e3, b.l), [0, 0, -b.m * g]);                                  // gravity torque, world
		if (o.mag && o.mag.F) tw = add(tw, cross(mul(e3, o.mag.d), o.mag.F));
		var ww = rot(q, w), wh = o.wh || [0, 0, 0], wr = sub(ww, wh);                   // angular velocity relative to the holder
		var spin = dot(wr, e3), perp = sub(wr, mul(e3, spin));
		if (o.ks) tw = sub(tw, mul(e3, o.ks * spin));
		if (o.kp) tw = sub(tw, mul(perp, o.kp));
		if (o.kair) tw = sub(tw, mul(ww, o.kair));
		if (o.push) { var pr = ww[2] - spin * e3[2]; tw = add(tw, [0, 0, pr >= 0 ? o.push : -o.push]); }   // a torque that hurries the precession
		var tb = rotInv(q, tw);
		var L = [I1 * w[0], I1 * w[1], I3 * w[2]], c = cross(w, L);
		var dw = [(tb[0] - c[0]) / I1, (tb[1] - c[1]) / I1, (tb[2] - c[2]) / I3];
		var dq = qmul(q, [0, w[0] / 2, w[1] / 2, w[2] / 2]);
		return { dq: dq, dw: dw };
	}
	function pivotStep(b, s, o, dt) {
		function mk(s0, d, h) { return { q: [s0.q[0] + d.dq[0] * h, s0.q[1] + d.dq[1] * h, s0.q[2] + d.dq[2] * h, s0.q[3] + d.dq[3] * h], w: add(s0.w, mul(d.dw, h)) }; }
		var k1 = pivotDeriv(b, s, o), k2 = pivotDeriv(b, mk(s, k1, dt / 2), o), k3 = pivotDeriv(b, mk(s, k2, dt / 2), o), k4 = pivotDeriv(b, mk(s, k3, dt), o);
		var q = [], i; for (i = 0; i < 4; i++) q[i] = s.q[i] + dt / 6 * (k1.dq[i] + 2 * k2.dq[i] + 2 * k3.dq[i] + k4.dq[i]);
		var w = []; for (i = 0; i < 3; i++) w[i] = s.w[i] + dt / 6 * (k1.dw[i] + 2 * k2.dw[i] + 2 * k3.dw[i] + k4.dw[i]);
		return { q: qnorm(q), w: w, t: s.t + dt };
	}
	function pivotInfo(b, s, o) {
		o = o || {}; var g = o.g == null ? G : o.g, I1 = I1p(b), w = s.w, q = s.q, e3 = e3of(q);
		var Lb = [I1 * w[0], I1 * w[1], b.I3 * w[2]], Lw = rot(q, Lb), ww = rot(q, w);
		var KE = 0.5 * (I1 * (w[0] * w[0] + w[1] * w[1]) + b.I3 * w[2] * w[2]), PE = b.m * g * b.l * e3[2];
		var th = Math.acos(Math.max(-1, Math.min(1, e3[2]))), s2 = Math.max(1e-9, 1 - e3[2] * e3[2]);
		var prec = (ww[2] - w[2] * e3[2]) / s2;                                          // phi-dot from the angular velocity (Euler angles)
		var nut = dot(ww, unit(cross([0, 0, 1], e3)));                                   // theta-dot (sign: positive = falling)
		return { e3: e3, L: Lw, Lmag: norm(Lw), spin: w[2], tilt: th, prec: prec, nut: nut, KE: KE, PE: PE, E: KE + PE, Lz: Lw[2], w: ww };
	}

	/* =============================================== 2. top on a floor =============================================== */
	/* state {p (centre of mass), v, q, w (body), t}. The tip is a ball of radius a whose centre sits s = l - a below the centre of mass on the axis
	   (tippe top: s < 0, the centre of mass is below the ball's centre). opt {g, mu (sliding friction), crr (rolling resistance, as a fraction of N times the tip radius), kair, eps (slip speed below which friction is smoothed)} */
	function floorState(b, theta, phi, w3, prec) {
		var q = qTilt(theta, phi || 0), e3 = e3of(q), sd = b.l - b.a;
		var c = [0, 0, b.a], p = add(c, mul(e3, sd));                                     // tip ball centre at height a
		var wv = add(mul(e3, w3 - (prec || 0) * e3[2]), [0, 0, prec || 0]);
		/* let go by hand: the centre of mass starts with no sideways speed (so the tip slides at first);
		   vertical speed that keeps the contact on the floor */
		var v = [0, 0, -sd * dot(cross(wv, e3), [0, 0, 1])];
		return { p: p, v: v, q: q, w: rotInv(q, wv), t: 0 };
	}
	function floorDeriv(b, s, o) {
		var g = o.g == null ? G : o.g, mu = o.mu || 0, eps = o.eps || 0.003, m = b.m, sd = b.l - b.a, I1 = b.I1, I3 = b.I3;
		var q = s.q, w = s.w, e3 = e3of(q), ww = rot(q, w);
		var r = sub(sub([0, 0, 0], mul(e3, sd)), [0, 0, b.a]);                          // centre of mass -> contact point
		var vP = add(s.v, cross(ww, r)), u = [vP[0], vP[1], 0], us = Math.sqrt(u[0] * u[0] + u[1] * u[1] + eps * eps);
		var d = [-u[0] / us, -u[1] / us, 0];                                             // friction direction (smoothed Coulomb)
		var fdir = add([0, 0, 1], mul(d, mu));                                           // contact force per newton of normal force
		var tairB = o.kair ? mul(w, -o.kair) : [0, 0, 0];
		/* rolling resistance: a torque c_rr N a against the turning of the ball parallel to the floor (the floor and tip flatten a little) */
		var wh = [ww[0], ww[1], 0], whs = Math.sqrt(wh[0] * wh[0] + wh[1] * wh[1] + 1e-4), crr = o.crr || 0;
		var trrPerN = [-crr * b.a * wh[0] / whs, -crr * b.a * wh[1] / whs, 0];
		function alphaFor(torqueWorld) { var tb = add(rotInv(q, torqueWorld), tairB), L = [I1 * w[0], I1 * w[1], I3 * w[2]], c = cross(w, L); return [(tb[0] - c[0]) / I1, (tb[1] - c[1]) / I1, (tb[2] - c[2]) / I3]; }
		var a0b = alphaFor([0, 0, 0]);
		var t1 = add(cross(r, fdir), trrPerN), a1b = (function () { var tb = rotInv(q, t1); return [tb[0] / I1, tb[1] / I1, tb[2] / I3]; })();
		var a0 = rot(q, a0b), a1 = rot(q, a1b);
		/* keep the ball centre at height a: zc = z - sd e3z, zc'' = -2 zeta w0 zc' - w0^2 (zc - a) (holds the contact against drift) */
		var e3dot = cross(ww, e3), zc = s.p[2] - sd * e3[2], zcd = s.v[2] - sd * e3dot[2];
		var w0 = 300, want = -2 * w0 * zcd - w0 * w0 * (zc - b.a);
		var cen = cross(ww, e3dot);                                                      // w x (w x e3)
		/* z'' = N/m - g;  zc'' = z'' - sd (alpha x e3 + cen)_z */
		var A = 1 / m - sd * cross(a1, e3)[2], Bv = -g - sd * (cross(a0, e3)[2] + cen[2]);
		var N = (want - Bv) / A; if (!(N > 0)) N = 0;
		var F = mul(fdir, N), acc = add(mul(F, 1 / m), [0, 0, -g]);
		if (o.kdrag) acc = sub(acc, mul(s.v, o.kdrag / m));
		var dwb = add(a0b, mul(a1b, N));
		return { dp: s.v, dv: acc, dq: qmul(q, [0, w[0] / 2, w[1] / 2, w[2] / 2]), dw: dwb, N: N, slip: Math.sqrt(u[0] * u[0] + u[1] * u[1]), F: F };
	}
	function floorStep(b, s, o, dt) {
		function mk(s0, d, h) { return { p: add(s0.p, mul(d.dp, h)), v: add(s0.v, mul(d.dv, h)), q: [s0.q[0] + d.dq[0] * h, s0.q[1] + d.dq[1] * h, s0.q[2] + d.dq[2] * h, s0.q[3] + d.dq[3] * h], w: add(s0.w, mul(d.dw, h)) }; }
		var k1 = floorDeriv(b, s, o), k2 = floorDeriv(b, mk(s, k1, dt / 2), o), k3 = floorDeriv(b, mk(s, k2, dt / 2), o), k4 = floorDeriv(b, mk(s, k3, dt), o);
		function comb(a, b2, c, d2, e) { var out = []; for (var i = 0; i < a.length; i++) out[i] = a[i] + dt / 6 * (b2[i] + 2 * c[i] + 2 * d2[i] + e[i]); return out; }
		var n = { p: comb(s.p, k1.dp, k2.dp, k3.dp, k4.dp), v: comb(s.v, k1.dv, k2.dv, k3.dv, k4.dv), q: qnorm(comb(s.q, k1.dq, k2.dq, k3.dq, k4.dq)), w: comb(s.w, k1.dw, k2.dw, k3.dw, k4.dw), t: s.t + dt };
		n.N = k1.N; n.slip = k1.slip;
		return n;
	}
	function floorInfo(b, s, o) {
		o = o || {}; var g = o.g == null ? G : o.g, w = s.w, q = s.q, e3 = e3of(q), ww = rot(q, w);
		var KE = 0.5 * b.m * dot(s.v, s.v) + 0.5 * (b.I1 * (w[0] * w[0] + w[1] * w[1]) + b.I3 * w[2] * w[2]), PE = b.m * g * s.p[2];
		var s2 = Math.max(1e-9, 1 - e3[2] * e3[2]);
		var sd = b.l - b.a, contact = sub(sub(s.p, mul(e3, sd)), [0, 0, b.a]);
		var Lw = add(rot(q, [b.I1 * w[0], b.I1 * w[1], b.I3 * w[2]]), [0, 0, 0]);
		return { e3: e3, tilt: Math.acos(Math.max(-1, Math.min(1, e3[2]))), spin: w[2], prec: (ww[2] - w[2] * e3[2]) / s2, KE: KE, PE: PE, E: KE + PE, h: s.p[2], contact: contact, L: Lw, Lmag: norm(Lw), w: ww };
	}

	/* =============================================== 3. gyroscope on an ice block =============================================== */
	/* generalized coordinates x = [X, Y, theta, phi, psi] (block position; gyroscope axis tilt from vertical, azimuth, spin angle).
	   Gyroscope: mass m, I1 (about its centre of mass), I3, centre of mass at distance l from the pivot on the stand. Block + stand mass mb.
	   T = 1/2 mb |V|^2 + 1/2 m |V + d(l e3)/dt|^2 + 1/2 I1 (th'^2 + s^2 ph'^2) + 1/2 I3 (ps' + c ph')^2,  V = m g l cos(theta). */
	function iceMass(p, th, ph) {
		var s = Math.sin(th), c = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph), m = p.m, l = p.l, M = [];
		for (var i = 0; i < 5; i++) M.push([0, 0, 0, 0, 0]);
		M[0][0] = M[1][1] = p.mb + m;
		M[0][2] = M[2][0] = m * l * c * cp; M[0][3] = M[3][0] = -m * l * s * sp;
		M[1][2] = M[2][1] = m * l * c * sp; M[1][3] = M[3][1] = m * l * s * cp;
		M[2][2] = p.I1 + m * l * l;
		M[3][3] = (p.I1 + m * l * l) * s * s + p.I3 * c * c; M[3][4] = M[4][3] = p.I3 * c; M[4][4] = p.I3;
		return M;
	}
	/* centre of mass of the gyroscope relative to the pivot: l (sin t cos p, sin t sin p, cos t) -- same convention as qTilt */
	function solve(A, bv) {
		var n = bv.length, M = A.map(function (r, i) { return r.slice(0, n).concat([bv[i]]); }), i, j, k;
		for (i = 0; i < n; i++) {
			var piv = i; for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
			var t = M[i]; M[i] = M[piv]; M[piv] = t;
			for (j = i + 1; j < n; j++) { var f = M[j][i] / M[i][i]; for (k = i; k <= n; k++) M[j][k] -= f * M[i][k]; }
		}
		var x = new Array(n); for (i = n - 1; i >= 0; i--) { var s = M[i][n]; for (j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
		return x;
	}
	/* h = (dM/dt) x' - dT/dx + dV/dx - Q(friction on the gyro); the block friction is handled by the caller */
	function iceRest(p, x, v) {
		var e = 1e-6, g = p.g == null ? G : p.g, n = 5, i, j;
		var Mt1 = iceMass(p, x[2] + e, x[3]), Mt0 = iceMass(p, x[2] - e, x[3]), Mp1 = iceMass(p, x[2], x[3] + e), Mp0 = iceMass(p, x[2], x[3] - e);
		var dMt = [], dMp = [];
		for (i = 0; i < n; i++) { dMt.push([]); dMp.push([]); for (j = 0; j < n; j++) { dMt[i][j] = (Mt1[i][j] - Mt0[i][j]) / (2 * e); dMp[i][j] = (Mp1[i][j] - Mp0[i][j]) / (2 * e); } }
		var h = [0, 0, 0, 0, 0];
		for (i = 0; i < n; i++) { var s = 0; for (j = 0; j < n; j++) s += (dMt[i][j] * v[2] + dMp[i][j] * v[3]) * v[j]; h[i] = s; }
		var qt = 0, qp = 0; for (i = 0; i < n; i++) for (j = 0; j < n; j++) { qt += 0.5 * v[i] * dMt[i][j] * v[j]; qp += 0.5 * v[i] * dMp[i][j] * v[j]; }
		h[2] -= qt; h[3] -= qp;
		h[2] += -p.m * g * p.l * Math.sin(x[2]);                                          // dV/dtheta
		h[2] += (p.kn || 0) * v[2]; h[3] += (p.kp || 0) * v[3]; h[4] += (p.ks || 0) * v[4];
		return h;
	}
	function iceNormal(p, x, v, a) { var g = p.g == null ? G : p.g, s = Math.sin(x[2]), c = Math.cos(x[2]); return (p.mb + p.m) * g + p.m * p.l * (-s * a[2] - c * v[2] * v[2]); }
	/* accelerations with the block held (stick) or sliding with kinetic friction; returns {a, F (friction force on the block, N), N, stuck} */
	function iceAccel(p, x, v, stuck) {
		var M = iceMass(p, x[2], x[3]), h = iceRest(p, x, v), a, F;
		if (stuck) {
			var Ms = [[M[2][2], M[2][3], M[2][4]], [M[3][2], M[3][3], M[3][4]], [M[4][2], M[4][3], M[4][4]]];
			var r = solve(Ms, [-h[2], -h[3], -h[4]]); a = [0, 0, r[0], r[1], r[2]];
			F = [M[0][2] * a[2] + M[0][3] * a[3] + h[0], M[1][2] * a[2] + M[1][3] * a[3] + h[1]];   // force the ice must give the block
			return { a: a, F: F, N: iceNormal(p, x, v, a), stuck: true };
		}
		var sp = Math.sqrt(v[0] * v[0] + v[1] * v[1]), N0 = (p.mb + p.m) * (p.g == null ? G : p.g), it, N = N0;
		for (it = 0; it < 3; it++) {                                                       // normal force depends on the tilt acceleration: two fixed-point passes
			var fk = Math.min(p.muk == null ? (p.mus || 0) : p.muk, p.mus || 0) * Math.max(0, N), d = sp > 1e-9 ? [-v[0] / sp, -v[1] / sp] : [0, 0];
			F = [fk * d[0], fk * d[1]];
			a = solve(M, [F[0] - h[0], F[1] - h[1], -h[2], -h[3], -h[4]]);
			N = iceNormal(p, x, v, a);
		}
		return { a: a, F: F, N: N, stuck: false };
	}
	/* starts with the gyroscope's axis along +x. On ice that grips, the block starts at rest. On frictionless ice the block starts with the speed
	   that makes the total sideways momentum zero (everything at rest as a whole), as when it is let go gently. */
	function iceState(p, theta, w3, prec) {
		var pr = prec || 0, v = [0, 0, 0, pr, w3 - pr * Math.cos(theta)];
		if (!(p.mus > 0)) v[1] = -p.m * p.l * Math.sin(theta) * pr / (p.mb + p.m);
		return { x: [0, 0, theta, 0, 0], v: v, t: 0, stuck: p.mus > 0, slid: 0, maxF: 0 };
	}
	/* one RK4 step with the stick / slide mode chosen at the start of the step */
	function iceStep(p, s, dt) {
		var stuck = s.stuck;
		if (stuck) { var chk = iceAccel(p, s.x, s.v, true); if (Math.hypot(chk.F[0], chk.F[1]) > (p.mus || 0) * Math.max(0, chk.N)) stuck = false; }
		function f(x, v) { return iceAccel(p, x, v, stuck).a; }
		function ad(x, d, h) { return x.map(function (xi, i) { return xi + d[i] * h; }); }
		var a1 = f(s.x, s.v), x2 = ad(s.x, s.v, dt / 2), v2 = ad(s.v, a1, dt / 2), a2 = f(x2, v2), x3 = ad(s.x, v2, dt / 2), v3 = ad(s.v, a2, dt / 2), a3 = f(x3, v3), x4 = ad(s.x, v3, dt), v4 = ad(s.v, a3, dt), a4 = f(x4, v4);
		var x = s.x.map(function (xi, i) { return xi + dt / 6 * (s.v[i] + 2 * v2[i] + 2 * v3[i] + v4[i]); });
		var v = s.v.map(function (vi, i) { return vi + dt / 6 * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]); });
		var slid = s.slid;
		if (!stuck) {
			/* sliding: if kinetic friction reverses the block's motion within the step, stop it and stick again */
			var oldV = [s.v[0], s.v[1]];
			if (oldV[0] * v[0] + oldV[1] * v[1] < 0 || Math.hypot(v[0], v[1]) < 1e-5) {
				var t2 = iceAccel(p, x, [0, 0, v[2], v[3], v[4]], true);
				if (Math.hypot(t2.F[0], t2.F[1]) <= (p.mus || 0) * Math.max(0, t2.N)) { v[0] = 0; v[1] = 0; stuck = true; }
			}
			slid += Math.hypot(x[0] - s.x[0], x[1] - s.x[1]);
		}
		var info = iceAccel(p, x, v, stuck);
		return { x: x, v: v, t: s.t + dt, stuck: stuck, slid: slid, F: info.F, N: info.N, maxF: Math.max(s.maxF || 0, stuck ? Math.hypot(info.F[0], info.F[1]) : 0) };
	}
	/* centre of mass of block + gyroscope, horizontal (m) */
	function iceCOM(p, s) { var x = s.x, k = p.m / (p.mb + p.m); return [x[0] + k * p.l * Math.sin(x[2]) * Math.cos(x[3]), x[1] + k * p.l * Math.sin(x[2]) * Math.sin(x[3])]; }
	function iceEnergy(p, s) {
		var M = iceMass(p, s.x[2], s.x[3]), v = s.v, T = 0; for (var i = 0; i < 5; i++) for (var j = 0; j < 5; j++) T += 0.5 * v[i] * M[i][j] * v[j];
		return T + p.m * (p.g == null ? G : p.g) * p.l * Math.cos(s.x[2]);
	}
	/* textbook: steady precession of a horizontal gyroscope needs a sideways (centripetal) force F = m l W^2 on the pivot, W = m g l / (I3 w).
	   The block stays put while F < mu_s N. Spin below which the block must slide: */
	function iceForce(p, w3, theta) { var W = p.m * (p.g == null ? G : p.g) * p.l / (p.I3 * w3); return p.m * p.l * Math.sin(theta == null ? Math.PI / 2 : theta) * W * W; }
	function iceCriticalSpin(p, theta) {
		var g = p.g == null ? G : p.g, s = Math.sin(theta == null ? Math.PI / 2 : theta), N = (p.mb + p.m) * g;
		if (!(p.mus > 0)) return Infinity;
		return p.m * g * p.l / p.I3 * Math.sqrt(p.m * p.l * s / (p.mus * N));
	}
	/* frictionless ice: the whole system's centre of mass stays still, so the pivot (and block) circles with radius m l sin(t) / (mb + m) */
	function iceCircle(p, theta) { return p.m * p.l * Math.sin(theta == null ? Math.PI / 2 : theta) / (p.mb + p.m); }

	/* =============================================== 4. MES's real setups: gyro on an ice cube, gyro hanging on a string =============================================== */
	/* One model for both. Generalized coordinates q = [X, Y, theta, phi, psi]: X, Y = horizontal position of the pivot (the foot of the gyro);
	   theta, phi, psi = the gyro's tilt from vertical, azimuth of its axis, spin angle (same convention as qTilt).
	   cube:   the foot sits in a dimple on top of a small ice cube of mass mb; the cube slides on a wet tray (pivot height constant).
	   string: the foot (axle nut) hangs from a massless string of length L from a ceiling point at the origin: Z = -sqrt(L^2 - X^2 - Y^2).
	   T = 1/2 mb |P'|^2 + 1/2 m |P' + l e3'|^2 + 1/2 I1 (th'^2 + s^2 ph'^2) + 1/2 I3 (ps' + c ph')^2, V = (mb + m) g Z + m g l cos(theta).
	   Mass matrix written out exactly; its derivatives (for the velocity terms) by central differences.
	   Friction: Rayleigh terms ks (spin, at the rotor bearings: makes the spin decay over minutes), kn (nutation damping at the foot, on theta'),
	   kp (foot friction on the precession, on phi'), cair (air drag on the pivot's motion), and for the cube Coulomb stick / slip (mus, muk) +
	   an optional water-film drag cw (N s/m) on the cube. p = {type, m, I1, I3, l, mb, L, g, ks, kc (constant spin friction torque), kn, kp, cair, mus, muk, cw} */
	function hgZ(p, X, Y) { if (p.type !== "string") return [0, 0, 0]; var S = Math.sqrt(Math.max(1e-12, p.L * p.L - X * X - Y * Y)); return [-S, X / S, Y / S]; }
	function hgMass(p, X, Y, th, ph, out) {
		var z = hgZ(p, X, Y), zX = z[1], zY = z[2], A = p.mb + p.m, ml = p.m * p.l, s = Math.sin(th), c = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph), I1p = p.I1 + p.m * p.l * p.l;
		out[0] = A * (1 + zX * zX); out[1] = out[5] = A * zX * zY; out[6] = A * (1 + zY * zY);
		out[2] = out[10] = ml * (c * cp - zX * s); out[3] = out[15] = -ml * s * sp;
		out[7] = out[11] = ml * (c * sp - zY * s); out[8] = out[16] = ml * s * cp;
		out[4] = out[20] = out[9] = out[21] = 0;
		out[12] = I1p; out[13] = out[17] = 0; out[14] = out[22] = 0;
		out[18] = I1p * s * s + p.I3 * c * c; out[19] = out[23] = p.I3 * c; out[24] = p.I3;
		return out;
	}
	var _M = new Float64Array(25), _Ma = new Float64Array(25), _Mb = new Float64Array(25);
	function qf(Mx, v) { var t = 0; for (var i = 0; i < 5; i++) { var r = 0; for (var j = 0; j < 5; j++) r += Mx[i * 5 + j] * v[j]; t += v[i] * r; } return t; }
	/* h = M' v - dT/dq + dV/dq + friction (everything except the cube's Coulomb force); also returns the mass matrix in _M */
	function hgRest(p, x, v, h) {
		var e = 1e-6, g = p.g == null ? G : p.g, i, j, k;
		hgMass(p, x[0], x[1], x[2], x[3], _M);
		/* M' v: derivative of M along the velocity (M does not depend on psi) */
		hgMass(p, x[0] + e * v[0], x[1] + e * v[1], x[2] + e * v[2], x[3] + e * v[3], _Ma); hgMass(p, x[0] - e * v[0], x[1] - e * v[1], x[2] - e * v[2], x[3] - e * v[3], _Mb);
		for (i = 0; i < 5; i++) { var s = 0; for (j = 0; j < 5; j++) s += (_Ma[i * 5 + j] - _Mb[i * 5 + j]) * v[j]; h[i] = s / (2 * e); }
		/* - dT/dq_k = - 1/2 v^T dM/dq_k v */
		for (k = (p.type === "string" ? 0 : 2); k < 4; k++) {
			var xa = [x[0], x[1], x[2], x[3]], xb = [x[0], x[1], x[2], x[3]]; xa[k] += e; xb[k] -= e;
			hgMass(p, xa[0], xa[1], xa[2], xa[3], _Ma); hgMass(p, xb[0], xb[1], xb[2], xb[3], _Mb);
			h[k] -= 0.5 * (qf(_Ma, v) - qf(_Mb, v)) / (2 * e);
		}
		/* gravity */
		var z = hgZ(p, x[0], x[1]); h[0] += (p.mb + p.m) * g * z[1]; h[1] += (p.mb + p.m) * g * z[2]; h[2] += -p.m * g * p.l * Math.sin(x[2]);
		/* friction at the foot, at the bearings, air */
		h[2] += (p.kn || 0) * v[2]; h[3] += (p.kp || 0) * v[3];
		h[4] += (p.ks || 0) * v[4] + (p.kc ? p.kc * Math.tanh(v[4] / 0.5) : 0);
		var cd = (p.cair || 0) + (p.type === "cube" ? (p.cw || 0) : 0); if (cd) { h[0] += cd * v[0]; h[1] += cd * v[1]; }
		return h;
	}
	function solveFlat(Mx, b, n, idx) {          /* Gaussian elimination on the rows / columns listed in idx */
		var A = [], i, j, k; for (i = 0; i < n; i++) { A.push([]); for (j = 0; j < n; j++) A[i].push(Mx[idx[i] * 5 + idx[j]]); A[i].push(b[i]); }
		for (i = 0; i < n; i++) {
			var piv = i; for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j;
			var t = A[i]; A[i] = A[piv]; A[piv] = t;
			for (j = i + 1; j < n; j++) { var f = A[j][i] / A[i][i]; for (k = i; k <= n; k++) A[j][k] -= f * A[i][k]; }
		}
		var out = new Array(n); for (i = n - 1; i >= 0; i--) { var s = A[i][n]; for (j = i + 1; j < n; j++) s -= A[i][j] * out[j]; out[i] = s / A[i][i]; }
		return out;
	}
	var _h = new Float64Array(5);
	/* normal force of the tray on the cube: weight of both + m times the vertical acceleration of the gyro's centre of mass */
	function hgNormal(p, x, v, a) { var g = p.g == null ? G : p.g; return (p.mb + p.m) * g + p.m * p.l * (-Math.sin(x[2]) * a[2] - Math.cos(x[2]) * v[2] * v[2]); }
	/* accelerations. cube held still (stuck) or sliding with kinetic friction; string: free. returns {a, F (horizontal friction on the cube), N} */
	function hgAccel(p, x, v, stuck) {
		var h = hgRest(p, x, v, _h);
		if (p.type === "cube" && stuck) {
			var r = solveFlat(_M, [-h[2], -h[3], -h[4]], 3, [2, 3, 4]), a = [0, 0, r[0], r[1], r[2]];
			var F = [_M[2] * a[2] + _M[3] * a[3] + h[0], _M[7] * a[2] + _M[8] * a[3] + h[1]];
			return { a: a, F: F, N: hgNormal(p, x, v, a) };
		}
		if (p.type !== "cube") { var a2 = solveFlat(_M, [-h[0], -h[1], -h[2], -h[3], -h[4]], 5, [0, 1, 2, 3, 4]); return { a: a2, F: [0, 0], N: 0 }; }
		var sp = Math.hypot(v[0], v[1]), N = (p.mb + p.m) * (p.g == null ? G : p.g), Fk = [0, 0], a3;
		var muk = Math.min(p.muk == null ? (p.mus || 0) : p.muk, p.mus || 0);
		for (var it = 0; it < 2; it++) {
			var fk = muk * Math.max(0, N), d = sp > 1e-12 ? [-v[0] / sp, -v[1] / sp] : [0, 0];
			Fk = [fk * d[0], fk * d[1]];
			a3 = solveFlat(_M, [Fk[0] - h[0], Fk[1] - h[1], -h[2], -h[3], -h[4]], 5, [0, 1, 2, 3, 4]);
			N = hgNormal(p, x, v, a3);
		}
		return { a: a3, F: Fk, N: N };
	}
	/* start = "rest": let go from rest by hand (axis at tilt theta toward +x, spinning, nothing else moving; string hanging straight down,
	   cube still) -- the release dip and nutation are included. start = "gentle": the hand lets go while the gyro already precesses at the
	   steady rate (cube / string still at rest), so there is almost no nutation. */
	function hgState(p, theta, w3, start) {
		var x = [0, 0, theta, 0, 0], v = [0, 0, 0, 0, w3];
		if (start === "gentle") { var sp = steadyPrecession({ m: p.m, l: p.l, I1: p.I1, I3: p.I3 }, w3, theta, p.g), W = sp.ok ? sp.slow : 0; v[3] = W; v[4] = w3 - W * Math.cos(theta); }
		return { x: x, v: v, t: 0, stuck: p.type === "cube" && p.mus > 0, slid: 0 };
	}
	function hgStep(p, s, dt) {
		var stuck = s.stuck, x0 = s.x, v0 = s.v;
		if (p.type === "cube" && stuck) { var chk = hgAccel(p, x0, v0, true); if (Math.hypot(chk.F[0], chk.F[1]) > (p.mus || 0) * Math.max(0, chk.N)) stuck = false; }
		function f(x, v) { return hgAccel(p, x, v, stuck).a; }
		var a1 = f(x0, v0), x2 = [], v2 = [], i;
		for (i = 0; i < 5; i++) { x2[i] = x0[i] + v0[i] * dt / 2; v2[i] = v0[i] + a1[i] * dt / 2; }
		var a2 = f(x2, v2), x3 = [], v3 = [];
		for (i = 0; i < 5; i++) { x3[i] = x0[i] + v2[i] * dt / 2; v3[i] = v0[i] + a2[i] * dt / 2; }
		var a3 = f(x3, v3), x4 = [], v4 = [];
		for (i = 0; i < 5; i++) { x4[i] = x0[i] + v3[i] * dt; v4[i] = v0[i] + a3[i] * dt; }
		var a4 = f(x4, v4), x = [], v = [];
		for (i = 0; i < 5; i++) { x[i] = x0[i] + dt / 6 * (v0[i] + 2 * v2[i] + 2 * v3[i] + v4[i]); v[i] = v0[i] + dt / 6 * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]); }
		var slid = s.slid || 0;
		if (p.type === "cube") {
			if (stuck) { x[0] = x0[0]; x[1] = x0[1]; v[0] = v[1] = 0; }
			else {
				/* kinetic friction can't reverse the cube within a step: if it would, or the cube is crawling slower than vst (Karnopp's
				   stick band, default 0.5 mm/s), stop it and see whether static friction can hold it */
				if (v0[0] * v[0] + v0[1] * v[1] < 0 || Math.hypot(v[0], v[1]) < (p.vst == null ? 5e-4 : p.vst)) {
					var t2 = hgAccel(p, x, [0, 0, v[2], v[3], v[4]], true);
					if (Math.hypot(t2.F[0], t2.F[1]) <= (p.mus || 0) * Math.max(0, t2.N)) { v[0] = 0; v[1] = 0; stuck = true; }
				}
				slid += Math.hypot(x[0] - x0[0], x[1] - x0[1]);
			}
		}
		x[4] = x[4] % TAU;
		return { x: x, v: v, t: s.t + dt, stuck: stuck, slid: slid };
	}
	/* quantities you can see or measure */
	function hgSpin(s) { return s.v[4] + s.v[3] * Math.cos(s.x[2]); }                        /* w3: angular velocity along the axis */
	function hgPivot(p, s) { return [s.x[0], s.x[1], hgZ(p, s.x[0], s.x[1])[0]]; }
	function hgCOM(p, s) { var x = s.x, k = p.m / (p.mb + p.m), sn = Math.sin(x[2]); return [x[0] + k * p.l * sn * Math.cos(x[3]), x[1] + k * p.l * sn * Math.sin(x[3])]; }
	function hgEnergy(p, s) {
		hgMass(p, s.x[0], s.x[1], s.x[2], s.x[3], _M); var g = p.g == null ? G : p.g;
		return 0.5 * qf(_M, s.v) + (p.mb + p.m) * g * hgZ(p, s.x[0], s.x[1])[0] + p.m * g * p.l * Math.cos(s.x[2]);
	}
	/* horizontal momentum of everything (cube + gyro) */
	function hgMomentum(p, s) {
		var x = s.x, v = s.v, c = Math.cos(x[2]), sn = Math.sin(x[2]), cp = Math.cos(x[3]), sp = Math.sin(x[3]), ml = p.m * p.l, A = p.mb + p.m;
		return [A * v[0] + ml * (c * cp * v[2] - sn * sp * v[3]), A * v[1] + ml * (c * sp * v[2] + sn * cp * v[3])];
	}
	/* vertical angular momentum about the vertical line through the origin (ceiling point / cube start): kept constant when nothing
	   twists the system about that line (no friction; Coulomb friction on the cube breaks it). Lz = p_phi + X p_Y - Y p_X with p = M v */
	function hgLz(p, s) {
		hgMass(p, s.x[0], s.x[1], s.x[2], s.x[3], _M); var q = [0, 0, 0, 0, 0], i, j;
		for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) q[i] += _M[i * 5 + j] * s.v[j];
		return q[3] + s.x[0] * q[1] - s.x[1] * q[0];
	}
	/* standard-model formulas used for the "what to expect" lines */
	function hgPrec(p, w3) { return p.m * (p.g == null ? G : p.g) * p.l / (p.I3 * w3); }                   /* fast-gyro precession, horizontal axis */
	function hgPush(p, w3) { var W = hgPrec(p, w3); return p.m * p.l * W * W; }                            /* sideways push on a still foot */
	function hgCritical(p) {                                                                               /* spin below which the cube must slip */
		if (!(p.mus > 0)) return Infinity; var g = p.g == null ? G : p.g;
		return p.m * g * p.l / p.I3 * Math.sqrt(p.m * p.l / (p.mus * (p.mb + p.m) * g));
	}
	function hgFreeCircle(p) { return p.m * p.l / (p.mb + p.m); }                                         /* frictionless tray: cube circle radius */
	/* string: steady precession at rate W, everything turning together: pivot radius r = W^2 l / (W^2 - g/L) (small swings);
	   negative = the foot is on the same side as the centre of mass. Resonance when W = sqrt(g/L), the pendulum's own rate. */
	function hgStringRadius(p, W) { var g = p.g == null ? G : p.g, w0 = g / p.L; return W * W * p.l / (W * W - w0); }
	function hgPendulum(p) { return Math.sqrt((p.g == null ? G : p.g) / p.L); }
	/* spin friction for a chosen spin-down: spin falls to 1/e in tau seconds (viscous) */
	function hgKs(p, tau) { return tau > 0 ? p.I3 / tau : 0; }

	/* plain-words summary of a finished run (used by the page and the tests). Times in s, lengths in m, angles in rad.
	   rise = how far the axis came up above where it started (positive = rose), after the first 5 s. */
	function hgSummary(p, rows, rad) {
		var n = rows.length, out = { type: p.type, end: rows[n - 1][0], spinEnd: rows[n - 1][6], rmax: 0, tmax: 0, wmax: 0, onset: null, wOnset: null, grow: null, release: 0, rise: -Infinity, sink: 0, theta0: rows[0][4] };
		var i, i3 = 0;
		for (i = 0; i < n; i++) { if (rows[i][0] <= 3) { i3 = i; out.release = Math.max(out.release, Math.hypot(rows[i][1] - rows[0][1], rows[i][2] - rows[0][2])); } }
		for (i = 0; i < n; i++) {
			if (rad[i] > out.rmax) { out.rmax = rad[i]; out.tmax = rows[i][0]; out.wmax = rows[i][6]; }
			if (rows[i][0] > 5) { var up = rows[0][4] - rows[i][4]; if (up > out.rise) out.rise = up; if (-up > out.sink) out.sink = -up; }
		}
		if (!isFinite(out.rise)) out.rise = 0;
		/* largest come-back: how far the axis rose again after having sunk lower earlier (bobbing), after the first 5 s */
		var low = -Infinity; out.back = 0; for (i = 0; i < n; i++) if (rows[i][0] > 5) { low = Math.max(low, rows[i][4]); out.back = Math.max(out.back, low - rows[i][4]); }
		out.fromRelease = rad[i3] > 0.002;
		if (!out.fromRelease) for (i = i3; i < n; i++) if (rad[i] > 0.002) { out.onset = rows[i][0]; out.wOnset = rows[i][6]; break; }
		var start = out.fromRelease ? i3 : (out.onset == null ? -1 : rows.findIndex(function (r) { return r[0] >= out.onset; }));
		if (start >= 0) {
			var top = 0, k; for (k = start; k < n; k++) top = Math.max(top, rad[k]);
			for (k = start; k < n; k++) if (rad[k] >= 0.9 * top) { out.grow = rows[k][0] - rows[start][0]; out.r90 = 0.9 * top; break; }
		}
		return out;
	}
	/* Run the whole experiment (minutes) and keep samples. Returns a runner: {step(budgetMs) -> done?, rows, s}. A row:
	   [t, X, Y, Z, theta, phi, w3, phi', stuck(0/1), F (N), N (N)] -- the page plays them back and draws the graphs. */
	function hgRunner(p, theta, w3, T, opt) {
		opt = opt || {}; var dt = opt.dt || 1e-3, every = opt.every || 0.02, s = hgState(p, theta, w3, opt.start), rows = [], next = 0, fell = false, why = "";
		function keep() {
			var r = [s.t, s.x[0], s.x[1], hgZ(p, s.x[0], s.x[1])[0], s.x[2], s.x[3], hgSpin(s), s.v[3], s.stuck ? 1 : 0, 0, 0];
			if (p.type === "cube") { var I = hgAccel(p, s.x, s.v, s.stuck); r[9] = Math.hypot(I.F[0], I.F[1]); r[10] = I.N; }
			rows.push(r);
		}
		keep(); next = every;
		var R = {
			rows: rows, get s() { return s; }, get fell() { return fell; }, get why() { return why; }, T: T,
			step: function (budgetMs, nowFn) {
				var t0 = nowFn ? nowFn() : 0, n = 0;
				while (s.t < T - 1e-9 && !fell) {
					s = hgStep(p, s, dt); n++;
					if (s.t >= next - 1e-9) { keep(); next += every; }
					var th = s.x[2];
					if (!isFinite(th) || th > 170 * DEG || th < 10 * DEG) { fell = true; why = "fell"; keep(); break; }
					if (p.type === "string" && Math.hypot(s.x[0], s.x[1]) > 0.9 * p.L) { fell = true; why = "swing"; keep(); break; }
					if (nowFn && (n & 63) === 0 && nowFn() - t0 > budgetMs) break;
				}
				return s.t >= T - 1e-9 || fell;
			}
		};
		return R;
	}
	/* The size of the circle the foot (cube / string bottom) traces: for each row, over the last full precession turn,
	   radius = average distance of the foot from the middle of its path. Also the distance from where it started. */
	function hgRadius(rows) {
		var out = new Array(rows.length), j = 0, n = rows.length, i;
		for (i = 0; i < n; i++) {
			var r = rows[i], W = Math.abs(r[7]), win = Math.min(30, Math.max(0.3, W > 1e-3 ? TAU / W : 30));
			while (j < i && rows[j][0] < r[0] - win) j++;
			var cx = 0, cy = 0, k, m = i - j + 1; for (k = j; k <= i; k++) { cx += rows[k][1]; cy += rows[k][2]; } cx /= m; cy /= m;
			var d = 0; for (k = j; k <= i; k++) d += Math.hypot(rows[k][1] - cx, rows[k][2] - cy); d /= m;
			out[i] = r[0] - rows[j][0] < 0.8 * win ? Math.min(d, Math.hypot(r[1] - rows[0][1], r[2] - rows[0][2])) : d;
		}
		return out;
	}

	/* ---------- examples ---------- */
	var PRESETS = {
		pivot: [
			{ id: "steady", name: "Smooth precession", body: "gyro", tilt: 60, rpm: 3000, start: "steady", ks: 0, kp: 0, note: "Started at exactly the steady precession speed: the axis circles without bobbing." },
			{ id: "drop", name: "Let go from rest", body: "gyro", tilt: 60, rpm: 3000, start: "rest", ks: 0, kp: 0, note: "Released with no precession: it dips, then precesses with little loops (nutation)." },
			{ id: "slow", name: "Slow spin: big nutation", body: "gyro", tilt: 60, rpm: 900, start: "rest", ks: 0, kp: 0, note: "Less spin, bigger loops: the dip grows as 1 / spin²." },
			{ id: "sleep", name: "Sleeping top", body: "top", tilt: 1.5, rpm: 3000, start: "rest", ks: 0, kp: 0, note: "Fast enough to stand up: it stays vertical." },
			{ id: "wake", name: "Top wakes up and falls", body: "top", tilt: 1.5, rpm: 3000, start: "rest", ks: 1.2e-6, kp: 0, note: "Spin friction slows it. Below the sleeping speed it starts to wobble and fall." },
			{ id: "pfric", name: "Precession friction lowers it", body: "gyro", tilt: 60, rpm: 3000, start: "steady", ks: 0, kp: 5e-4, note: "Friction that resists the precession makes the axis sink. Pushing the precession along would lift it." },
			{ id: "push", name: "Hurry the precession: it rises", body: "gyro", tilt: 70, rpm: 3000, start: "steady", ks: 0, kp: 0, push: 6e-4, note: "A torque that hurries the precession lifts the axis (Laithwaite's demonstration with a stick)." },
			{ id: "holder", name: "Turn the holder (re-alignment)", body: "gyrotop", tilt: 50, rpm: 6000, start: "steady", ks: 0, kp: 2e-6, holder: 1.5, note: "The holder turns about the vertical; friction at the pivot drags the axis into line with the holder's rotation." },
			{ id: "under", name: "Hanging below the pivot", body: "gyro", tilt: 130, rpm: 3000, start: "steady", ks: 0, kp: 0, note: "Below the pivot the precession runs the other way round." }
		],
		floor: [
			{ id: "rise", name: "A top rises (sliding friction)", body: "top", tilt: 25, rpm: 2400, mu: 0.3, note: "The round tip slides on the floor; friction there pushes the precession along, so the top stands up." },
			{ id: "nofric", name: "Same top, no friction", body: "top", tilt: 25, rpm: 2400, mu: 0, note: "No friction at the tip: it precesses but never rises." },
			{ id: "tape", name: "Tip with tape (more friction)", body: "top", tilt: 25, rpm: 2400, mu: 0.8, note: "More friction at the tip: it rises faster (MES's tape experiment)." },
			{ id: "slow", name: "Too slow: it falls", body: "top", tilt: 25, rpm: 500, mu: 0.3, note: "Below the rising speed the same friction can't hold it up." },
			{ id: "gyro", name: "Gyroscope as a top", body: "gyro", tilt: 20, rpm: 3000, mu: 0.4, note: "A toy gyroscope on its rounded foot rises like a top." },
			{ id: "tippe", name: "Tippe top flips over", body: "tippe", tilt: 8, rpm: 1500, mu: 0.3, note: "Centre of mass below the ball's centre: friction turns it upside down onto its stem." }
		],
		ice: [
			{ id: "fast", name: "Fast spin: the block stays", rpm: 3000, mus: 0.03, note: "The sideways push needed for the slow precession is less than the ice's grip." },
			{ id: "slow", name: "Slow spin: the block moves", rpm: 420, mus: 0.03, note: "Faster precession needs a bigger sideways push: more than the grip, so the block slides round. The sliding friction then holds the precession back, so the gyroscope slowly sinks." },
			{ id: "zero", name: "Ice with no friction", rpm: 3000, mus: 0, note: "No friction at all: the block circles so that the centre of mass of everything stays still (the Cambridge picture)." },
			{ id: "drop", name: "Let go from rest", rpm: 2500, mus: 0.03, start: "rest", note: "Released with no precession: the nutation wobble shakes the block a little at first." }
		],
		/* MES's own setups. Gyro numbers for a Super Precision-type toy gyroscope (150 g, rotor in a cage); friction values are guesses to
		   be replaced by measurements (tilt the tray until the cube slides: tan(angle) = mu_s). half = seconds for the spin to halve. */
		cube: [
			{ id: "mes", name: "MES's ice cube (let go from rest)", mus: 0.05, muk: 0.03, cw: 0, start: "rest", note: "15 g ice cube on a wet tray, gyro let go from rest at 6,000 rpm, spin halving every 3 minutes. Grip μs = 0.05, sliding μk = 0.03 (guesses: measure them)." },
			{ id: "gentle", name: "Same, let go gently", mus: 0.05, muk: 0.03, cw: 0, start: "gentle", note: "The hand lets go while the gyro is already precessing at the steady rate, so there is no release wobble." },
			{ id: "slippery", name: "Very slippery when sliding", mus: 0.05, muk: 0.003, cw: 0, start: "gentle", note: "Same grip, but once it slides the water film makes it very slippery (μk = 0.003)." },
			{ id: "water", name: "Water-film drag, no grip", mus: 0, muk: 0, cw: 0.3, start: "gentle", note: "No static grip at all; the water film drags the cube in proportion to its speed (0.3 N·s/m)." },
			{ id: "zero", name: "Frictionless tray", mus: 0, muk: 0, cw: 0, start: "rest", note: "No friction of any kind: the whole system's centre of mass stays still, so the cube circles at m·l/(M+m) at every spin." },
			{ id: "small", name: "Smaller ice cube (5 g)", mus: 0.05, muk: 0.03, cw: 0, mb: 5, start: "rest", note: "A 5 g cube instead of 15 g." }
		],
		string: [
			{ id: "mes", name: "MES's string (1.5 m)", L: 1.5, air: 0.003, start: "rest", note: "Hanging by its axle nut from a 1.5 m string, let go from rest with the axis level at 6,000 rpm; spin halving every 3 minutes, a little air drag." },
			{ id: "gentle", name: "Same, let go gently", L: 1.5, air: 0.003, start: "gentle", note: "Let go while already precessing at the steady rate (the string still hangs straight down)." },
			{ id: "short", name: "Short string (0.7 m)", L: 0.7, air: 0.01, start: "gentle", note: "A shorter string swings faster on its own (√(g/L) = 3.7 rad/s), so the precession takes longer to catch up with it." },
			{ id: "long", name: "Long string (6 m)", L: 6, air: 0.003, start: "gentle", note: "A long string swings slowly on its own (1.3 rad/s), slower than the precession from the start." },
			{ id: "nofric", name: "No friction: spin stays put", L: 1.5, air: 0, half: 0, start: "gentle", T: 120, note: "No bearing friction and no air: watch the spin readout stay exactly the same while the tilt and swing change." }
		]
	};

	var api = {
		G: G, TAU: TAU, DEG: DEG, BODIES: BODIES, PRESETS: PRESETS, body: body,
		v: { add: add, sub: sub, mul: mul, dot: dot, cross: cross, norm: norm, unit: unit }, qmul: qmul, qaxis: qaxis, qnorm: qnorm, rot: rot, rotInv: rotInv, qTilt: qTilt, e3of: e3of, tiltOf: tiltOf, aziOf: aziOf,
		I1p: I1p, steadyPrecession: steadyPrecession, fastTopPrecession: fastTopPrecession, nutationRate: nutationRate, nutationDip: nutationDip, sleepSpin: sleepSpin, rpm: rpm, radps: radps,
		pivotState: pivotState, pivotStep: pivotStep, pivotInfo: pivotInfo, pivotDeriv: pivotDeriv,
		floorState: floorState, floorStep: floorStep, floorInfo: floorInfo, floorDeriv: floorDeriv,
		iceState: iceState, iceStep: iceStep, iceCOM: iceCOM, iceEnergy: iceEnergy, iceForce: iceForce, iceCriticalSpin: iceCriticalSpin, iceCircle: iceCircle, iceMass: iceMass,
		hgMass: hgMass, hgState: hgState, hgStep: hgStep, hgAccel: hgAccel, hgSpin: hgSpin, hgPivot: hgPivot, hgCOM: hgCOM, hgEnergy: hgEnergy, hgMomentum: hgMomentum, hgLz: hgLz,
		hgPrec: hgPrec, hgPush: hgPush, hgCritical: hgCritical, hgFreeCircle: hgFreeCircle, hgStringRadius: hgStringRadius, hgPendulum: hgPendulum, hgKs: hgKs, hgRunner: hgRunner, hgRadius: hgRadius, hgSummary: hgSummary
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESGyro = api;
})(this);

/* MES Gyroscope & Spinning Top Simulator UI. Physics: MESGyro (lib.js, node-tested: tool_apps_src/gyroscope-simulator-tests.js).
   3D: three.js 0.170.0 from jsDelivr (unpkg fallback), loaded after the page; if it fails the graphs and numbers still run.
   State: localStorage mes-gyroscope-simulator:v1; links ?tab=pivot|floor|ice|mes|calc&p=<preset id> */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("gy"); if (!root) return;
	var M = window.MESGyro, V = M.v, KEY = "mes-gyroscope-simulator:v1", D = Math.PI / 180, TAU = Math.PI * 2;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function mi(s) { return String(s).replace(/-/g, "−"); }
	function fx(x, d) { return isFinite(x) ? mi(x.toFixed(d)) : "–"; }
	function sg(x) { if (!isFinite(x)) return "–"; var a = Math.abs(x); return mi(a >= 1000 ? Math.round(x).toLocaleString("en-US") : a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : a >= 1 ? x.toFixed(2) : x.toFixed(3)); }
	var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
	function sci(x, d) { if (!isFinite(x)) return "–"; if (x === 0) return "0"; var e = Math.floor(Math.log10(Math.abs(x))); if (e >= -2 && e < 4) return sg(x); var m = x / Math.pow(10, e); return mi(m.toFixed(d == null ? 2 : d)) + "×10" + String(e).replace(/./g, function (c) { return SUP[c]; }); }
	var toastT; function toast(msg) { var t = $("gy-toast"); if (!t) { t = document.createElement("div"); t.id = "gy-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	function setPressed(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }

	/* ---------------- state ---------------- */
	var DEF = {
		tab: "pivot", spd: 0, showL: true, showT: true, trail: true, g: "tilt",
		pivot: { pre: "steady", body: "gyro", rpm: 3000, tilt: 60, start: "steady", ks: 0, kp: 0, push: 0, hold: 0, mag: 0 },
		floor: { pre: "rise", body: "top", rpm: 2400, tilt: 25, mu: 0.3, crr: 0.2, tipr: 4 },
		ice: { pre: "fast", body: "gyro", rpm: 3000, mb: 1.5, mus: 0.03, start: "steady" },
		cube: { pre: "mes", m: 150, l: 4.5, I3: 6, I1: 5, mb: 15, mus: 0.05, muk: 0.03, cw: 0, rpm: 6000, half: 184, T: 360, start: "rest", play: 10 },
		string: { pre: "mes", m: 150, l: 4.5, I3: 6, I1: 5, L: 1.5, air: 0.003, rpm: 6000, half: 184, T: 300, start: "rest", play: 10 }
	};
	var saved = sget(), S = JSON.parse(JSON.stringify(DEF));
	["tab", "spd", "showL", "showT", "trail", "g"].forEach(function (k) { if (saved[k] != null) S[k] = saved[k]; });
	["pivot", "floor", "ice", "cube", "string"].forEach(function (m) { if (saved[m]) for (var k in DEF[m]) if (saved[m][k] != null) S[m][k] = saved[m][k]; });
	var qs = new URLSearchParams(location.search);
	if (/^(pivot|floor|ice|cube|string|mes|calc)$/.test(qs.get("tab") || "")) S.tab = qs.get("tab");
	var BODY_OK = { pivot: ["gyro", "top", "gyrotop", "heavy"], floor: ["top", "gyro", "tippe", "heavy"], ice: ["gyro", "heavy"] };
	["pivot", "floor", "ice"].forEach(function (m) { if (BODY_OK[m].indexOf(S[m].body) < 0) S[m].body = BODY_OK[m][0]; });

	var LEADS = {
		pivot: "A top or gyroscope on a fixed pivot. Gravity pulls it down, yet it goes round (precesses) instead of falling. Drag the view to look around; try the examples.",
		floor: "A top standing on a round tip on a table, free to slide and roll. Friction at the tip is what makes a top stand up in the textbook account: switch it off and see.",
		cube: "MES's setup: a 150 g toy gyroscope lies with its axis level, its foot on a 15 g ice cube on a wet tray, and slows down over minutes. Does the cube move? The whole run is worked out first, then played back (with a timer like the video).",
		string: "MES's setup: the same gyroscope hangs by its axle nut from a long string from the ceiling, axis level, and slows down over minutes. How wide does the string swing, and does the gyro rise or sink?",
		ice: "A gyroscope on a pivot stand, on a heavy block resting on ice. Does the block move as the gyroscope precesses? It depends on the spin and on the ice's grip.",
		mes: "Owen Liang's Gyrotop and MES's gyroscope experiments, each set side by side with what the standard (textbook) model predicts.",
		calc: "Type in a gyroscope or top and get the textbook numbers: precession, nutation, sleeping speed and the ice-block test."
	};

	/* ---------------- slider mappings (stored values are physical) ---------------- */
	function rpmFromX(x) { return Math.round(100 * Math.pow(300, x)); }          // 100 .. 30000 rpm (log)
	function xFromRpm(r) { return clamp(Math.log(r / 100) / Math.log(300), 0, 1); }
	function bodyFor(mode) { var b = M.body(S[mode].body); if (mode === "floor" && b.kind !== "tippe") b.a = clamp(S.floor.tipr / 1000, 0.0002, 0.01); return b; }
	/* spin friction as a half-life of the spin: k = I3 ln2 / T */
	function ksFromX(x, b) { if (x < 0.005) return 0; var T = 300 * Math.pow(0.5 / 300, x); return b.I3 * Math.LN2 / T; }
	function xFromKs(k, b) { if (!(k > 0)) return 0; var T = b.I3 * Math.LN2 / k; return clamp(Math.log(T / 300) / Math.log(0.5 / 300), 0.006, 1); }
	function kpFromX(x, b) { if (x < 0.005) return 0; return b.I3 * 100 * Math.pow(10, 3 * (x - 1)) * 2; }
	function xFromKp(k, b) { if (!(k > 0)) return 0; return clamp(1 + Math.log10(k / (b.I3 * 200)) / 3, 0.006, 1); }
	function mgl(b) { return b.m * M.G * Math.abs(b.l); }
	function pushFromX(x, b) { var s = x < 0 ? -1 : 1, a = Math.abs(x); return a < 0.01 ? 0 : s * a * a * 0.05 * mgl(b); }
	function xFromPush(p, b) { if (!p) return 0; return clamp(Math.sign(p) * Math.sqrt(Math.abs(p) / (0.05 * mgl(b))), -1, 1); }

	/* ---------------- DOM ---------------- */
	var tabs = Array.prototype.slice.call(root.querySelectorAll(".gy-tabs button"));
	var simbox = $("gy-simbox"), panels = { mes: root.querySelector('[data-panel="mes"]'), calc: root.querySelector('[data-panel="calc"]') };
	function fill(sel, ids) { sel.innerHTML = ids.map(function (id) { return '<option value="' + id + '">' + esc(M.BODIES[id].name) + "</option>"; }).join(""); }
	fill($("gy-body"), BODY_OK.pivot); fill($("gy-ibody"), BODY_OK.ice);

	/* ---------------- simulation ---------------- */
	var sim = null, playing = true, H = [], P = [], lastSample = 0, warned = false, holderAng = 0, visSpin = 0, slowFlag = false;
	function pivotOpts() {
		var p = S.pivot, b = sim.b, o = { ks: p.ks, kp: p.kp, push: p.push, wh: [0, 0, p.hold] };
		if (p.mag) o.mag = { F: [0, 0, -p.mag * b.m * M.G], d: b.l };
		return o;
	}
	function icePar() { var b = M.body(S.ice.body); return { m: b.m, I1: b.I1, I3: b.I3, l: b.l, mb: S.ice.mb, mus: S.ice.mus, muk: S.ice.mus * 0.8, body: b }; }
	function reset() {
		var mode = S.tab; H = []; P = []; lastSample = 0; holderAng = 0; warned = false;
		if (mode === "pivot") {
			var p = S.pivot, b = bodyFor("pivot"), w = M.radps(p.rpm), th = p.tilt * D, pr = 0;
			if (p.start === "steady") { var sp = M.steadyPrecession(b, w, th); pr = sp.ok ? sp.slow : 0; if (!sp.ok) toast("Too slow for steady precession at this tilt: let go from rest instead."); }
			sim = { mode: mode, b: b, s: M.pivotState(th, 0, w, pr), dt: 2e-4 };
			sim.o = pivotOpts(); var i0 = M.pivotInfo(b, sim.s, sim.o); sim.E0 = i0.E; sim.KE0 = i0.KE;
		} else if (mode === "floor") {
			var f = S.floor, bf = bodyFor("floor");
			sim = { mode: mode, b: bf, s: M.floorState(bf, f.tilt * D, 0, M.radps(f.rpm), 0), dt: 1e-4, o: { mu: f.mu, crr: f.crr } };
			sim.E0 = M.floorInfo(bf, sim.s, sim.o).E;
		} else if (mode === "ice") {
			var ip = icePar(), wi = M.radps(S.ice.rpm);
			sim = { mode: mode, p: ip, b: ip.body, s: M.iceState(ip, Math.PI / 2, wi, S.ice.start === "steady" ? M.fastTopPrecession(ip, wi) : 0), dt: 2e-4 };
			sim.c0 = M.iceCOM(ip, sim.s); sim.E0 = M.iceEnergy(ip, sim.s); sim.trail = [];
		} else if (isHG(mode)) {
			var hp = hgPar(mode), hs = S[mode];
			sim = { mode: mode, hg: true, p: hp, b: hgBody(hp), run: M.hgRunner(hp, Math.PI / 2, M.radps(hs.rpm), hs.T, { dt: 1e-3, every: 0.02, start: hs.start }), cur: 0, done: false, rad: null, sum: null, s: { t: 0 } };
			sim.fell = false; if (view) view.build(); paintCmp(); hgCompute(); return;
		} else { sim = null; return; }
		sim.fell = false;
		if (view) view.build();
		sample(true);
	}
	function stepSim(simDt) {
		if (sim && sim.hg) {          /* playback of the worked-out run; simDt arrives scaled by the Time slider, which these tabs don't use */
			var e = hgEnd(); sim.cur = Math.min(e, sim.cur + (S[sim.mode].play || 1) * simDt / Math.pow(10, S.spd)); sim.s.t = sim.cur;
			if (sim.done && sim.cur >= e - 1e-9 && playing) $("gy-play").click(); return;
		}
		if (!sim || sim.fell) return;
		var n = Math.ceil(simDt / sim.dt - 1e-9), max = sim.mode === "ice" ? 1200 : sim.mode === "floor" ? 2500 : 4000;
		slowFlag = n > max; if (n > max) n = max;
		for (var i = 0; i < n; i++) {
			if (sim.mode === "pivot") sim.s = M.pivotStep(sim.b, sim.s, sim.o, sim.dt);
			else if (sim.mode === "floor") { sim.s = M.floorStep(sim.b, sim.s, sim.o, sim.dt); if (sim.s.p[2] < -0.5 || !isFinite(sim.s.p[2])) { sim.fell = true; break; } }
			else { sim.s = M.iceStep(sim.p, sim.s, sim.dt); var th = sim.s.x[2]; if (th < 4 * D || th > 176 * D) { sim.fell = true; toast("The gyroscope fell over (the ice model stops here)."); break; } }
			if (sim.s.t - lastSample >= 0.002) sample(false);
		}
		holderAng += (sim.mode === "pivot" ? S.pivot.hold : 0) * simDt;
	}
	function info() {
		if (!sim) return null;
		if (sim.hg) { var a = hgAt(sim.cur); if (!a) return null; var sn = Math.sin(a.th); return { tilt: a.th, azi: a.ph, spin: a.w3, prec: a.W, e3: [sn * Math.cos(a.ph), sn * Math.sin(a.ph), Math.cos(a.th)], a: a }; }
		if (sim.mode === "pivot") return M.pivotInfo(sim.b, sim.s, sim.o);
		if (sim.mode === "floor") return M.floorInfo(sim.b, sim.s, sim.o);
		var s = sim.s, x = s.x, v = s.v; return { tilt: x[2], azi: x[3], spin: v[4] + v[3] * Math.cos(x[2]), prec: v[3], e3: [Math.sin(x[2]) * Math.cos(x[3]), Math.sin(x[2]) * Math.sin(x[3]), Math.cos(x[2])] };
	}
	function sample(force) {
		if (sim && sim.hg) return;
		var I = info(); if (!I) return; var t = sim.s.t; lastSample = t;
		var row = { t: t, tilt: I.tilt / D, prec: I.prec, spin: M.rpm(I.spin) };
		if (sim.mode === "pivot") row.E = (I.E - sim.E0) / Math.max(1e-12, Math.abs(sim.E0) + I.KE);
		if (sim.mode === "floor") { row.h = sim.s.p[2] * 1000; row.slip = (sim.s.slip || 0) * 1000; row.E = (I.E - sim.E0) / Math.abs(sim.E0); }
		if (sim.mode === "ice") { var s = sim.s, c = M.iceCOM(sim.p, s); row.bx = s.x[0] * 1000; row.by = s.x[1] * 1000; row.cx = (c[0] - sim.c0[0]) * 1000; row.cy = (c[1] - sim.c0[1]) * 1000; row.F = s.F ? Math.hypot(s.F[0], s.F[1]) : 0; row.grip = sim.p.mus * (s.N || (sim.p.mb + sim.p.m) * M.G); row.d = Math.hypot(s.x[0], s.x[1]) * 1000; }
		var e3 = I.e3; row.px = e3[0]; row.py = e3[1];
		H.push(row); if (H.length > 9000) H.splice(0, H.length - 8000);
	}

	/* ---------------- MES's setups: gyro on an ice cube, gyro on a string (whole run worked out first, then played back) ---------------- */
	function isHG(m) { return m === "cube" || m === "string"; }
	function hgPar(mode) {
		var h = S[mode], p = { type: mode, m: h.m / 1000, l: h.l / 100, I3: h.I3 * 1e-5, I1: h.I1 * 1e-5, kn: 5e-5, kp: 0 };
		if (mode === "cube") { p.mb = h.mb / 1000; p.mus = h.mus; p.muk = Math.min(h.muk, h.mus); p.cw = h.cw; p.cair = 0; }
		else { p.mb = 0; p.L = h.L; p.cair = h.air; }
		p.ks = h.half > 0 ? M.hgKs(p, h.half / Math.LN2) : 0;
		return p;
	}
	function hgBody(p) { return { kind: "gyro", m: p.m, l: p.l, I1: p.I1, I3: p.I3, r: Math.min(0.035, Math.max(0.018, p.l * 0.68)), h: 0.08, a: 0.0015 }; }
	var hgTimer = null;
	function hgCompute() {
		clearTimeout(hgTimer); if (!sim || !sim.hg || sim.done) return;
		var now = function () { return performance.now(); };
		sim.done = sim.run.step(22, now);
		if (sim.done) {
			sim.rad = M.hgRadius(sim.run.rows); sim.sum = M.hgSummary(sim.p, sim.run.rows, sim.rad);
			paintCmp(); drawGraphs(); readouts();
		} else { if (!sim.rad || sim.run.rows.length - sim.rad.length > 400) { sim.rad = M.hgRadius(sim.run.rows); } hgTimer = setTimeout(hgCompute, 8); }
	}
	/* interpolated state at time t: {t, x, y, z, th, ph, w3, W, stuck, F, N, rad, i} */
	function hgAt(t) {
		var rows = sim.run.rows, n = rows.length; if (!n) return null;
		var ev = rows.length > 1 ? rows[1][0] - rows[0][0] : 0.02, f = clamp(t / ev, 0, n - 1), i = Math.floor(f), k = Math.min(n - 1, i + 1), a = f - i, r0 = rows[i], r1 = rows[k];
		function L(j) { return r0[j] + (r1[j] - r0[j]) * a; }
		var dph = r1[5] - r0[5]; if (dph > Math.PI) dph -= TAU; if (dph < -Math.PI) dph += TAU;
		var rad = sim.rad && sim.rad.length > i ? sim.rad[i] : 0;
		return { t: L(0), x: L(1), y: L(2), z: L(3), th: L(4), ph: r0[5] + dph * a, w3: L(6), W: L(7), stuck: r0[8], F: L(9), N: L(10), rad: rad, i: i };
	}
	function hgEnd() { var r = sim.run.rows; return r.length ? r[r.length - 1][0] : 0; }
	function clockTxt(t) { t = Math.max(0, t); var m = Math.floor(t / 60), s = Math.floor(t - m * 60); return m + ":" + (s < 10 ? "0" : "") + s; }
	function cmTxt(m) { return Math.abs(m) >= 0.01 ? fx(m * 100, 1) + " cm" : fx(m * 1000, 1) + " mm"; }
	function rpmTxt(w) { return Math.round(M.rpm(w)).toLocaleString("en-US") + " rpm"; }
	function upTxt(th) { var u = 90 - th / D; return (u >= 0 ? "+" : "−") + fx(Math.abs(u), 1) + "°"; }

	/* the comparison panel: MES's observation next to this run of the standard model */
	function paintCmp() {
		var box = $("gy-cmp"); if (!box || !sim || !sim.hg) return; var m = sim.mode, p = sim.p, h = S[m], su = sim.done ? sim.sum : null;
		var head = '<p class="gy-cmp__lead">No university textbook includes these experiments, and mainstream physics has no concept of inertia that varies with spin. ' +
			'The simulation on the right uses the standard (Newtonian) model with fixed mass and moments of inertia, set up like MES\'s own experiment. Change the numbers above to match a measured setup.</p>';
		var obs, std, decide, vids;
		if (m === "cube") {
			var wc = M.hgCritical(p), free = M.hgFreeCircle(p);
			obs = '<p>A 150 g toy gyroscope lies with its axis level, its foot on a 15 g ice cube on a wet tray, spun by string to several thousand rpm, and slows down over minutes.</p><ul>' +
				'<li>At fast spin the cube does not move at all (0 cm).</li><li>After about 3 minutes of slowing down the cube starts to move.</li>' +
				'<li>Its circle <b>grows gradually</b> as the spin drops, to about 4 cm radius at slow spin.</li><li>Smaller ice cubes give the same result.</li></ul>';
			if (!su) std = "<p>Working out the run…</p>";
			else {
				var lines = [];
				if (su.release > 0.0005) lines.push("Letting go from rest, the release wobble (nutation) needs far more sideways push than the ice can give for a moment, so the cube is nudged " + cmTxt(su.release) + " in the first second" + (su.fromRelease ? " and never grips again: it circles from the start." : ", then grips again."));
				else lines.push("The cube does not move at the release.");
				if (!su.fromRelease) {
					if (su.onset != null) lines.push("It stays still until <b>" + clockTxt(su.onset) + "</b> (spin " + rpmTxt(su.wOnset) + "). The formula μs(M+m)g = m·l·Ω² gives " + (isFinite(wc) ? rpmTxt(wc) : "–") + ".");
					else lines.push("It stays still for the whole run (the spin never falls below " + (isFinite(wc) ? rpmTxt(wc) : "–") + ").");
				}
				if (su.grow != null && su.rmax > 0.002) lines.push("Then its circle grows to " + cmTxt(su.r90) + " (90% of the largest, " + cmTxt(su.rmax) + ") in <b>" + fx(su.grow, 1) + " s</b>: " + (su.grow < 8 ? "a <b>sudden</b> start, not a gradual growth." : su.grow < 40 ? "fairly quickly." : "a <b>gradual</b> growth.") + " With no friction at all it would be " + cmTxt(free) + " at every spin.");
				if (su.sink > 3 * D) lines.push("Once the cube slides, friction drags on the circling foot and holds the precession back, so the gyro sinks: its axis drops " + fx(su.sink / D, 0) + "°" + (sim.run.fell ? " and it falls at " + clockTxt(su.end) + "." : " by the end."));
				std = "<ul><li>" + lines.join("</li><li>") + "</li></ul>";
			}
			decide = ["Tilt the wet tray with the ice cube on it until the cube slides: tan(angle) = μs. Then the spin at which the cube starts to move should be the critical spin shown here.",
				"Film the spin (a strobe or a phone app reading the rotor) at the moment the cube starts to move, and compare with the predicted critical spin.",
				"Measure the circle radius against the spin with a ruler under the tray (frame by frame).",
				"Repeat on an air table or a puck on an air-hockey table (no grip at all): the standard model says the base circles at m·l/(M+m) at every spin, fast or slow."];
			vids = '<a href="https://www.youtube.com/watch?v=j82Z1KgfRtI" target="_blank" rel="noopener">MES video: gyroscope on an ice cube</a> · <a href="/gyrotop-angular-momentum">MES article</a>';
		} else {
			var w0 = M.hgPendulum(p), wRes = p.m * M.G * p.l / (p.I3 * w0);
			obs = '<p>The same gyro hangs by its axle nut from a long string from the ceiling, axis roughly level, precessing, with a timer on screen.</p><ul>' +
				'<li>At fast spin the string and foot barely move.</li><li>As the spin drops the swing <b>gradually increases</b>, until it is extremely wide at slow spin.</li>' +
				'<li>The gyro <b>rises</b> on its own as the spin lowers (the axis lifts toward level and above).</li></ul>';
			if (!su) std = "<p>Working out the run…</p>";
			else {
				var R = sim.run.rows, rr = sim.rad, q = function (f) { var i = Math.min(R.length - 1, Math.floor(f * (R.length - 1))); return rr[i]; };
				var l2 = [];
				l2.push("The string on its own swings at √(g/L) = " + fx(w0, 2) + " rad/s. The precession speeds up as the spin falls and reaches that rate at about " + rpmTxt(wRes) + ".");
				l2.push("The swing radius goes " + [0.1, 0.3, 0.5, 0.7, 0.9].map(function (f) { return cmTxt(q(f)); }).join(" → ") + " across the run (largest " + cmTxt(su.rmax) + " at " + clockTxt(su.tmax) + ", spin " + rpmTxt(su.wmax) + "): it " + (q(0.7) > 2 * q(0.1) ? "grows as the spin falls, most steeply near that matching rate." : "stays about the same."));
				l2.push((su.rise > 0.5 * D ? "The axis does rise: up to " + fx(su.rise / D, 1) + "° above where it was let go." : "The axis does <b>not rise</b> above where it was let go.") + (su.back > 1 * D ? " It does come back up by as much as " + fx(su.back / D, 0) + "° at times after sinking, as the swing beats in and out." : ""));
				l2.push("It sinks by up to " + fx(su.sink / D, 0) + "° below level" + (sim.run.fell ? " and falls at " + clockTxt(su.end) : "") + ": with the spin falling, the precession must speed up, and keeping the vertical angular momentum the same (nothing twists the string about the vertical) tips the spin axis down; air drag on the swing holds the precession back too.");
				std = "<ul><li>" + l2.join("</li><li>") + "</li></ul>";
			}
			decide = ["Measure the string length and the precession time per turn as the spin falls: the standard model says the swing is largest when the precession turn takes 2π√(L/g).",
				"Repeat with a much longer and a much shorter string: the model moves the big swing to a different spin; an effect of spin alone would not depend on the string.",
				"Read the axis angle from the video against the clock to see whether it rises or sinks, and how that follows the swing.",
				"Hang the same gyro from a stiff rod on a ball joint (no swing): any rise left over is not due to the string's motion."];
			vids = '<a href="https://www.youtube.com/watch?v=_Opx_rkrDK4" target="_blank" rel="noopener">MES video: gyroscope hanging on a string</a> · <a href="https://youtu.be/LzOf-jwO3BY" target="_blank" rel="noopener">MES video: spin vs torque</a> · <a href="/gyrotop-angular-momentum">MES article</a>';
		}
		var spin = '<div class="gy-diff"><h4>Spin and torque: where the two views agree</h4><p>MES reports that when the gyro rises, or is twisted by hand, its spin does not slow down any extra: the force felt is inertia, not energy taken from the spin. ' +
			'The standard model agrees on the spin: for a symmetric rotor, Euler\'s equation I₃ω̇₃ = τ₃ says the spin changes only with a twist <i>along</i> the axis, so tilting it or twisting it at right angles leaves ω₃ exactly as it was (in this simulator only the bearing friction slows it; try “No friction: spin stays put” on the string tab and watch the spin readout while the tilt changes). ' +
			'Where they differ: the standard model keeps the gyro\'s inertia (mass and moments of inertia) fixed at every spin, and puts the energy for rising into the precession and swing motion and gravity, not the spin; MES reads the experiments as showing precessional inertia that changes with spin.</p></div>';
		box.innerHTML = head + '<div class="gy-cols"><div class="gy-col gy-col--obs"><h4>MES observation</h4>' + obs + '</div><div class="gy-col gy-col--std"><h4>Standard-model simulation (this run)</h4>' + std + '</div></div>' +
			'<div class="gy-diff"><h4>Measurements that would decide</h4><ul>' + decide.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + '</ul></div>' + spin +
			'<p class="tu-note">Experiments and observations: MES (Math Easy Solutions). ' + vids + '</p>';
	}

	/* ---------------- presets ---------------- */
	function applyPreset(mode, id) {
		var pr = (M.PRESETS[mode] || []).filter(function (p) { return p.id === id; })[0]; if (!pr) return;
		var st = S[mode]; st.pre = id;
		if (mode === "pivot") { st.body = pr.body; st.rpm = pr.rpm; st.tilt = pr.tilt; st.start = pr.start; st.ks = pr.ks || 0; st.kp = pr.kp || 0; st.push = pr.push || 0; st.hold = pr.holder || 0; st.mag = pr.mag || 0; }
		if (mode === "floor") { st.body = pr.body; st.rpm = pr.rpm; st.tilt = pr.tilt; st.mu = pr.mu; st.crr = pr.crr != null ? pr.crr : (pr.mu ? 0.2 : 0); st.tipr = (M.BODIES[pr.body].a * 1000); }
		if (isHG(mode)) { var D0 = DEF[mode]; for (var k in D0) if (k !== "pre" && k !== "play") st[k] = pr[k] != null ? pr[k] : D0[k]; st.pre = id; if (pr.air != null) st.air = pr.air; }
		if (mode === "ice") { st.rpm = pr.rpm; st.mus = pr.mus; st.start = pr.start || "steady"; st.body = pr.body || "gyro"; st.mb = pr.mb || 1.5; }
		$("gy-pnote").textContent = pr.note || "";
		syncUI(); reset(); sset();
	}

	/* ---------------- controls ---------------- */
	function bindRange(id, get, set, label) {
		var el = $(id); el.addEventListener("input", function () { set(Number(el.value)); label(); if (live[id]) live[id](); else reset(); clearPre(); sset(); });
		return function () { el.value = get(); label(); };
	}
	var live = {};       /* controls that change a running sim without restarting it */
	function clearPre() { var m = S.tab; if (S[m]) { S[m].pre = ""; paintChips(); $("gy-pnote").textContent = ""; } }
	var syncers = [];
	function lbl(id, txt, note) { $(id + "-v").textContent = txt; if (note != null && $(id + "-n")) $(id + "-n").textContent = note; }
	syncers.push(bindRange("gy-rpm", function () { return xFromRpm(S[S.tab === "floor" ? "floor" : "pivot"].rpm); }, function (x) { S[S.tab === "floor" ? "floor" : "pivot"].rpm = rpmFromX(x); }, function () {
		var m = S.tab === "floor" ? "floor" : "pivot", r = S[m].rpm, b = bodyFor(m), sl = M.rpm(M.sleepSpin(b));
		lbl("gy-rpm", r.toLocaleString("en-US") + " rpm (" + sg(r / 60) + " turns/s)", b.l > 0 ? "Sleeping speed for this " + (b.kind === "gyro" ? "gyroscope" : "top") + " on a pivot: " + Math.round(sl).toLocaleString("en-US") + " rpm." : "");
	}));
	syncers.push(bindRange("gy-tilt", function () { return S[S.tab === "floor" ? "floor" : "pivot"].tilt; }, function (x) { S[S.tab === "floor" ? "floor" : "pivot"].tilt = x; }, function () { lbl("gy-tilt", fx(S[S.tab === "floor" ? "floor" : "pivot"].tilt, 1) + "°" + (S.tab === "pivot" && S.pivot.tilt > 90 ? " (below the pivot)" : "")); }));
	syncers.push(bindRange("gy-ks", function () { return xFromKs(S.pivot.ks, bodyFor("pivot")); }, function (x) { S.pivot.ks = ksFromX(x, bodyFor("pivot")); }, function () { var b = bodyFor("pivot"); lbl("gy-ks", S.pivot.ks ? "spin halves in " + sg(b.I3 * Math.LN2 / S.pivot.ks) + " s" : "off"); }));
	syncers.push(bindRange("gy-kp", function () { return xFromKp(S.pivot.kp, bodyFor("pivot")); }, function (x) { S.pivot.kp = kpFromX(x, bodyFor("pivot")); }, function () { lbl("gy-kp", S.pivot.kp ? sci(S.pivot.kp) + " N·m·s" : "off"); }));
	syncers.push(bindRange("gy-push", function () { return xFromPush(S.pivot.push, bodyFor("pivot")); }, function (x) { S.pivot.push = pushFromX(x, bodyFor("pivot")); }, function () { var b = bodyFor("pivot"); lbl("gy-push", S.pivot.push ? sci(S.pivot.push) + " N·m (" + fx(100 * S.pivot.push / mgl(b), 1) + "% of m·g·l)" : "off"); }));
	syncers.push(bindRange("gy-hold", function () { return S.pivot.hold; }, function (x) { S.pivot.hold = Math.abs(x) < 0.05 ? 0 : x; }, function () { lbl("gy-hold", S.pivot.hold ? fx(S.pivot.hold, 2) + " rad/s (" + (S.pivot.hold > 0 ? "anticlockwise" : "clockwise") + " seen from above)" : "still"); }));
	syncers.push(bindRange("gy-mag", function () { return S.pivot.mag; }, function (x) { S.pivot.mag = Math.abs(x) < 0.01 ? 0 : x; }, function () { lbl("gy-mag", S.pivot.mag ? (S.pivot.mag > 0 ? "" : "lift ") + fx(Math.abs(S.pivot.mag), 2) + " × its weight" : "none"); }));
	syncers.push(bindRange("gy-mu", function () { return S.floor.mu; }, function (x) { S.floor.mu = x; }, function () { lbl("gy-mu", S.floor.mu ? fx(S.floor.mu, 2) : "none (perfectly slippery)"); }));
	syncers.push(bindRange("gy-crr", function () { return S.floor.crr; }, function (x) { S.floor.crr = x; }, function () { lbl("gy-crr", S.floor.crr ? fx(S.floor.crr, 3) : "none"); }));
	syncers.push(bindRange("gy-tipr", function () { return S.floor.tipr; }, function (x) { S.floor.tipr = x; }, function () { lbl("gy-tipr", S.floor.body === "tippe" ? "the ball (" + fx(M.BODIES.tippe.a * 1000, 0) + " mm)" : fx(S.floor.tipr, 1) + " mm"); }));
	syncers.push(bindRange("gy-irpm", function () { return xFromRpm(S.ice.rpm); }, function (x) { S.ice.rpm = Math.max(300, rpmFromX(x)); }, function () {
		var p = icePar(), wc = M.rpm(M.iceCriticalSpin(p));
		lbl("gy-irpm", S.ice.rpm.toLocaleString("en-US") + " rpm", isFinite(wc) ? "Textbook: the block starts to slide below about " + Math.round(wc).toLocaleString("en-US") + " rpm." : "No grip at all: the block always moves.");
	}));
	syncers.push(bindRange("gy-imb", function () { return S.ice.mb; }, function (x) { S.ice.mb = x; }, function () { lbl("gy-imb", fx(S.ice.mb, 2) + " kg"); }));
	syncers.push(bindRange("gy-imu", function () { return S.ice.mus; }, function (x) { S.ice.mus = x; }, function () { lbl("gy-imu", S.ice.mus ? "μ = " + fx(S.ice.mus, 3) : "none (frictionless)"); }));
	syncers.push(bindRange("gy-spd", function () { return S.spd; }, function (x) { S.spd = Math.abs(x) < 0.02 ? 0 : x; }, function () { var f = Math.pow(10, S.spd); lbl("gy-spd", f >= 0.995 && f <= 1.005 ? "real speed" : f < 1 ? (f >= 0.1 ? fx(f, 2) : fx(f, 3)) + "× (slow motion)" : fx(f, 1) + "× faster"); }));
	live["gy-spd"] = function () {};
	/* friction / holder / magnet / push change the running pivot sim without restarting */
	["gy-ks", "gy-kp", "gy-push", "gy-hold", "gy-mag"].forEach(function (id) { live[id] = function () { if (sim && sim.mode === "pivot") sim.o = pivotOpts(); }; });
	["gy-mu", "gy-crr"].forEach(function (id) { live[id] = function () { if (sim && sim.mode === "floor") { sim.o.mu = S.floor.mu; sim.o.crr = S.floor.crr; } }; });
	live["gy-imu"] = function () { if (sim && sim.mode === "ice") { sim.p.mus = S.ice.mus; sim.p.muk = S.ice.mus * 0.8; syncers.forEach(function (f) { f(); }); } };

	$("gy-body").addEventListener("change", function () { var m = S.tab === "floor" ? "floor" : "pivot"; S[m].body = this.value; if (m === "floor") S.floor.tipr = M.BODIES[this.value].a * 1000; clearPre(); syncUI(); reset(); sset(); });
	$("gy-ibody").addEventListener("change", function () { S.ice.body = this.value; clearPre(); syncUI(); reset(); sset(); });
	var stBtns = [$("gy-st-steady"), $("gy-st-rest")], istBtns = [$("gy-ist-steady"), $("gy-ist-rest")];
	stBtns.forEach(function (b) { b.onclick = function () { S.pivot.start = b === stBtns[0] ? "steady" : "rest"; setPressed(stBtns, b); clearPre(); reset(); sset(); }; });
	istBtns.forEach(function (b) { b.onclick = function () { S.ice.start = b === istBtns[0] ? "steady" : "rest"; setPressed(istBtns, b); clearPre(); reset(); sset(); }; });
	[["gy-showL", "showL"], ["gy-showT", "showT"], ["gy-trail", "trail"]].forEach(function (a) { var el = $(a[0]); el.checked = !!S[a[1]]; el.onchange = function () { S[a[1]] = el.checked; sset(); if (view) view.toggles(); }; });
	$("gy-play").onclick = function () { if (!playing && sim && sim.hg && sim.done && sim.cur >= hgEnd() - 1e-9) sim.cur = 0; playing = !playing; this.textContent = playing ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", playing ? "true" : "false"); };
	$("gy-restart").onclick = function () { if (sim && sim.hg) { sim.cur = 0; if (!playing) $("gy-play").click(); return; } reset(); };
	$("gy-step").onclick = function () { if (sim && sim.hg) { if (playing) $("gy-play").click(); sim.cur = Math.min(hgEnd(), sim.cur + 1); return; } if (playing) $("gy-play").click(); stepSim(0.01 * Math.pow(10, Math.min(0, S.spd)) + 0.002); };
	Array.prototype.forEach.call(root.querySelectorAll(".gy-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".gy-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});

	/* inputs for the two MES setups (one set, values kept per tab) */
	var HGF = [
		["m", "Gyro mass", "g", 1, "cube string"], ["l", "Foot to centre of mass", "cm", 0.1, "cube string"],
		["I3", "Rotor I₃ (about the axis)", "×10⁻⁵ kg·m²", 0.1, "cube string", "Super Precision-type rotor ≈ 6"], ["I1", "I₁ across the axis, about the centre of mass", "×10⁻⁵ kg·m²", 0.1, "cube string"],
		["mb", "Ice cube mass", "g", 1, "cube"], ["mus", "Grip: static friction μs", "", 0.005, "cube", "tilt the tray until the cube slides: μs = tan(angle)"],
		["muk", "Sliding friction μk", "", 0.001, "cube", "never more than μs"], ["cw", "Water-film drag on the cube", "N·s/m", 0.01, "cube", "force = drag × speed"],
		["L", "String length", "m", 0.1, "string"], ["air", "Air drag on the swing", "N·s/m", 0.001, "string"],
		["rpm", "Starting spin", "rpm", 100, "cube string"], ["half", "Spin halves every", "s", 1, "cube string", "0 = no slow-down"], ["T", "Run length", "s", 10, "cube string", "up to 900 s"]
	];
	var HGLIM = { m: [10, 5000], l: [0.5, 30], I3: [0.1, 1000], I1: [0.1, 1000], mb: [0.5, 5000], mus: [0, 1], muk: [0, 1], cw: [0, 20], L: [0.1, 20], air: [0, 2], rpm: [300, 30000], half: [0, 36000], T: [5, 900] };
	(function () {
		var box = $("gy-hgf"); if (!box) return;
		box.innerHTML = HGF.map(function (f) { return '<div class="tu-field" data-hgf="' + f[4] + '"><label class="tu-label" for="gy-h-' + f[0] + '">' + esc(f[1]) + (f[2] ? " (" + esc(f[2]) + ")" : "") + '</label><input class="tu-input" type="number" step="' + f[3] + '" min="' + HGLIM[f[0]][0] + '" max="' + HGLIM[f[0]][1] + '" id="gy-h-' + f[0] + '">' + (f[5] ? '<span class="tu-note">' + esc(f[5]) + "</span>" : "") + "</div>"; }).join("");
		var tmr = null;
		HGF.forEach(function (f) { var el = $("gy-h-" + f[0]); el.addEventListener("input", function () {
			var v = parseFloat(el.value); if (!isFinite(v) || !isHG(S.tab)) return; v = clamp(v, HGLIM[f[0]][0], HGLIM[f[0]][1]); S[S.tab][f[0]] = v; clearPre(); sset();
			clearTimeout(tmr); tmr = setTimeout(function () { reset(); }, 500); }); });
		var rel = [$("gy-hst-rest"), $("gy-hst-gentle")];
		rel.forEach(function (b) { b.onclick = function () { if (!isHG(S.tab)) return; S[S.tab].start = b === rel[0] ? "rest" : "gentle"; setPressed(rel, b); clearPre(); reset(); sset(); }; });
		Array.prototype.forEach.call(root.querySelectorAll("#gy-hplay button"), function (b) { b.onclick = function () { if (!isHG(S.tab)) return; S[S.tab].play = Number(b.getAttribute("data-v")); syncHG(); sset(); }; });
		$("gy-hscrub").addEventListener("input", function () { if (!sim || !sim.hg) return; if (playing) $("gy-play").click(); sim.cur = Math.min(hgEnd(), Number(this.value) * sim.run.T); });
	})();
	function syncHG() {
		var m = S.tab; if (!isHG(m)) return; var h = S[m];
		HGF.forEach(function (f) { var el = $("gy-h-" + f[0]); if (document.activeElement !== el) el.value = h[f[0]] != null ? +(+h[f[0]]).toPrecision(6) : ""; el.closest(".tu-field").hidden = f[4].split(" ").indexOf(m) < 0; });
		setPressed([$("gy-hst-rest"), $("gy-hst-gentle")], h.start === "gentle" ? $("gy-hst-gentle") : $("gy-hst-rest"));
		Array.prototype.forEach.call(root.querySelectorAll("#gy-hplay button"), function (b) { b.setAttribute("aria-pressed", Number(b.getAttribute("data-v")) === h.play ? "true" : "false"); });
	}
	function paintChips() {
		var box = $("gy-pre"), m = S.tab, list = M.PRESETS[m] || [];
		box.innerHTML = list.map(function (p) { return '<button type="button" data-p="' + p.id + '" aria-pressed="' + (S[m].pre === p.id) + '">' + esc(p.name) + "</button>"; }).join("");
		Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) { b.onclick = function () { applyPreset(m, b.getAttribute("data-p")); }; });
	}
	function syncUI() {
		var m = S.tab, sm = m === "floor" ? "floor" : "pivot";
		if (m === "pivot" || m === "floor") { fill($("gy-body"), BODY_OK[sm]); $("gy-body").value = S[sm].body; }
		$("gy-ibody").value = S.ice.body;
		setPressed(stBtns, S.pivot.start === "steady" ? stBtns[0] : stBtns[1]);
		setPressed(istBtns, S.ice.start === "steady" ? istBtns[0] : istBtns[1]);
		$("gy-tipr").disabled = S.floor.body === "tippe";
		syncers.forEach(function (f) { f(); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-for]"), function (el) { el.hidden = el.getAttribute("data-for").split(" ").indexOf(m) < 0; });
		syncHG(); paintChips(); paintGsel();
	}

	/* ---------------- tabs ---------------- */
	function showTab(t, keep) {
		S.tab = t; tabs.forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		var isSim = t === "pivot" || t === "floor" || t === "ice" || isHG(t);
		$("gy-clock").hidden = !isHG(t);
		simbox.hidden = !isSim; panels.mes.hidden = t !== "mes"; panels.calc.hidden = t !== "calc";
		$("gy-lead").textContent = LEADS[t];
		if (isSim) { var pr = (M.PRESETS[t] || []).filter(function (p) { return p.id === S[t].pre; })[0]; $("gy-pnote").textContent = pr ? pr.note : ""; }
		syncUI(); if (isSim) { reset(); fitAll(); }
		if (t === "mes") { paintExps(); drawIceChart(); }
		if (t === "calc") calc();
		if (!keep) { var u = new URL(location.href); u.searchParams.set("tab", t); u.searchParams.delete("p"); history.replaceState(null, "", u); }
		sset();
	}
	tabs.forEach(function (b) { b.onclick = function () { showTab(b.getAttribute("data-tab")); }; });

	/* ---------------- readouts ---------------- */
	function ro(items) { $("gy-ro").innerHTML = items.map(function (it) { return '<div class="gy-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function turnTime(W) { return Math.abs(W) > 1e-6 ? "one turn every " + sg(TAU / Math.abs(W)) + " s" : "not turning"; }
	function readouts() {
		if (!sim) return;
		if (sim.hg) { hgReadouts(); return; }
		var I = info(), b = sim.b;
		if (sim.mode === "pivot") {
			var sp = M.steadyPrecession(b, I.spin, I.tilt, M.G), mag = 1 + (S.pivot.mag || 0);
			if (S.pivot.mag) sp = M.steadyPrecession(b, I.spin, I.tilt, M.G * mag);
			var sl = M.sleepSpin(b, M.G * mag), avgP = avgPrec();
			ro([
				{ l: "Spin", v: Math.round(M.rpm(I.spin)).toLocaleString("en-US") + " rpm", s: fx(I.spin, 1) + " rad/s" },
				{ l: "Tilt from vertical", v: fx(I.tilt / D, 2) + "°" },
				{ l: "Precession (measured)", v: avgP == null ? "–" : fx(avgP, 3) + " rad/s", s: avgP == null ? "" : turnTime(avgP) },
				{ l: "Precession (textbook)", v: sp.ok ? fx(sp.slow, 3) + " rad/s" : "none steady", s: "m·g·l / L = " + fx(M.fastTopPrecession(b, I.spin, M.G * mag), 3) + " rad/s" },
				{ l: "Nutation", v: fx(M.nutationRate(b, I.spin) / TAU, 1) + " bobs/s", s: "dip if let go: " + fx(M.nutationDip(b, I.spin, I.tilt, M.G * mag) / D, 2) + "°" },
				{ l: "Angular momentum", v: sci(I.Lmag) + " kg·m²/s" },
				{ l: "Sleeping speed", v: b.l > 0 ? Math.round(M.rpm(sl)).toLocaleString("en-US") + " rpm" : "–", c: b.l > 0 ? (I.spin > sl ? "is-good" : "is-bad") : "", s: b.l > 0 ? (I.spin > sl ? "fast enough to stand upright" : "too slow to stand upright") : "" },
				(function () { var fr = S.pivot.ks || S.pivot.kp || S.pivot.push || S.pivot.hold, rel = (I.E - sim.E0) / Math.max(1e-12, sim.KE0); return fr ? { l: "Energy change", v: fx(100 * rel, 3) + "%", s: "of the starting kinetic energy · time " + fx(sim.s.t, 2) + " s" } : { l: "Energy drift (check)", v: sci(rel), c: Math.abs(rel) < 1e-5 ? "is-good" : "", s: "should stay ~0 with no friction · time " + fx(sim.s.t, 2) + " s" }; })()
			]);
		} else if (sim.mode === "floor") {
			var Ef = (I.E - sim.E0) / Math.abs(sim.E0);
			ro([
				{ l: "Spin", v: Math.round(M.rpm(I.spin)).toLocaleString("en-US") + " rpm" },
				{ l: "Tilt from vertical", v: fx(I.tilt / D, 2) + "°", c: I.tilt < 3 * D ? "is-good" : "" , s: I.tilt < 3 * D ? "sleeping (upright)" : ""},
				{ l: "Precession", v: avgPrec() == null ? "–" : fx(avgPrec(), 2) + " rad/s" },
				{ l: "Tip sliding at", v: fx((sim.s.slip || 0) * 1000, 1) + " mm/s", s: (sim.s.slip || 0) < 0.003 ? "rolling (hardly sliding)" : "sliding" },
				{ l: "Floor push", v: fx(sim.s.N || 0, 3) + " N", s: "weight " + fx(b.m * M.G, 3) + " N" },
				{ l: "Energy lost to friction", v: fx(-100 * Ef, 2) + "%", s: "time " + fx(sim.s.t, 2) + " s" }
			]);
		} else {
			var s = sim.s, p = sim.p, F = s.F ? Math.hypot(s.F[0], s.F[1]) : 0, grip = p.mus * (s.N || (p.mb + p.m) * M.G), c = M.iceCOM(p, s);
			var need = M.iceForce(p, Math.abs(I.spin), I.tilt), wc = M.iceCriticalSpin(p);
			ro([
				{ l: "Spin", v: Math.round(M.rpm(I.spin)).toLocaleString("en-US") + " rpm", s: isFinite(wc) ? "block slides below ~" + Math.round(M.rpm(wc)).toLocaleString("en-US") + " rpm" : "" },
				{ l: "Precession", v: fx(I.prec, 3) + " rad/s", s: turnTime(I.prec) },
				{ l: "Sideways force needed", v: fx(need * 1000, 1) + " mN", s: "m·l·Ω² (steady)" },
				{ l: "Ice's grip", v: fx(grip * 1000, 0) + " mN", s: "μs × weight" },
				{ l: "Block", v: s.stuck ? "held still" : "sliding", c: s.stuck ? "is-good" : "is-bad", s: "moved " + fx(Math.hypot(s.x[0], s.x[1]) * 1000, 2) + " mm from the start" },
				{ l: "Centre of mass of everything", v: fx(Math.hypot(c[0] - sim.c0[0], c[1] - sim.c0[1]) * 1000, 2) + " mm", s: "from where it started" },
				{ l: "Tilt", v: fx(I.tilt / D, 2) + "°", s: "time " + fx(s.t, 2) + " s" }
			]);
		}
		if (view && view.failed) return;
		var note = slowFlag ? "Running slower than the chosen speed (too many steps per frame)." : sim.fell ? "Stopped: it fell over." : "";
		$("gy-msg").hidden = !note; $("gy-msg").textContent = note;
	}
	function hgReadouts() {
		var I = info(), p = sim.p, it = []; if (!I) return; var a = I.a;
		$("gy-clock").textContent = clockTxt(a.t);
		var sc = $("gy-hscrub"); if (document.activeElement !== sc) sc.value = sim.run.T ? a.t / sim.run.T : 0;
		$("gy-hpos").textContent = clockTxt(a.t) + " of " + clockTxt(sim.run.T) + (sim.done ? (sim.run.fell ? " (stopped: it fell at " + clockTxt(hgEnd()) + ")" : "") : " · working out " + Math.round(100 * hgEnd() / sim.run.T) + "%");
		it.push({ l: "Time", v: clockTxt(a.t), s: "playback " + S[sim.mode].play + "× real speed" });
		it.push({ l: "Spin ω₃", v: rpmTxt(a.w3), s: fx(a.w3, 1) + " rad/s" });
		it.push({ l: "Precession", v: fx(a.W, 2) + " rad/s", s: turnTime(a.W) + " · formula m·g·l/(I₃ω) = " + fx(M.hgPrec(p, a.w3), 2) });
		it.push({ l: "Axis above level", v: upTxt(a.th), s: "positive = risen above level" });
		if (sim.mode === "cube") {
			var grip = p.mus * (a.N || (p.mb + p.m) * M.G), need = M.hgPush(p, a.w3);
			it.push({ l: "Cube", v: a.stuck ? "held by the ice" : "sliding", c: a.stuck ? "is-good" : "is-bad", s: "circle radius " + cmTxt(a.rad) + " · moved " + cmTxt(Math.hypot(a.x, a.y)) + " from the start" });
			it.push({ l: "Sideways push needed", v: fx(need * 1000, 1) + " mN", s: "m·l·Ω² for a still foot" });
			it.push({ l: "Ice's grip", v: fx(grip * 1000, 1) + " mN", s: "μs × weight · slips below " + (isFinite(M.hgCritical(p)) ? rpmTxt(M.hgCritical(p)) : "any spin") });
			it.push({ l: "No-friction circle", v: cmTxt(M.hgFreeCircle(p)), s: "m·l/(M+m), at every spin" });
		} else {
			var w0 = M.hgPendulum(p), pr = M.hgStringRadius(p, M.hgPrec(p, a.w3));
			it.push({ l: "Swing radius", v: cmTxt(a.rad), s: "string angle " + fx(Math.asin(Math.min(1, Math.hypot(a.x, a.y) / p.L)) / D, 1) + "°" });
			it.push({ l: "String's own swing rate", v: fx(w0, 2) + " rad/s", s: "√(g/L): one swing every " + sg(TAU / w0) + " s" });
			it.push({ l: "Steady-swing formula", v: Math.abs(pr) > 2 * p.L ? "very large (matching rates)" : cmTxt(Math.abs(pr)), s: "l·Ω²/|Ω² − g/L|" });
		}
		ro(it);
		var note = sim.done ? "" : "Working out the run… " + Math.round(100 * hgEnd() / sim.run.T) + "% (it plays as it goes).";
		if (view && view.failed) return; $("gy-msg").hidden = !note; $("gy-msg").textContent = note;
	}
	/* precession averaged over the last ~0.5 s (smooths the nutation loops) */
	function avgPrec() {
		if (H.length < 3) return null; var last = H[H.length - 1], i = H.length - 1, a = 0;
		while (i > 0 && last.t - H[i - 1].t < 0.5) i--;
		var p0 = H[i]; if (last.t - p0.t < 0.01) return null;
		for (var k = i + 1; k < H.length; k++) { var d = Math.atan2(H[k].py, H[k].px) - Math.atan2(H[k - 1].py, H[k - 1].px); if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; a += d; }
		return a / (last.t - p0.t);
	}

	/* ---------------- 2D graphs ---------------- */
	var COL = { bg: "#0a0f1a", grid: "#1e2738", axis: "#5d6a86", text: "#d6dcea", dim: "#8792aa", a: "#ffd166", b: "#4cc9f0", c: "#ff7aa2", d: "#7ee2a8" };
	function prep(stageId, cvId, hFn) {
		var stage = $(stageId), wrap = stage.parentNode, w = wrap.clientWidth || 300, dpr = Math.min(2, window.devicePixelRatio || 1), h = Math.round(hFn(w));
		stage.style.height = h + "px"; var cv = $(cvId), cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c: c, W: w, H: h };
	}
	function niceStep(range, n) { var s = range / n, p = Math.pow(10, Math.floor(Math.log10(s || 1))), f = s / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
	function txt(c, s, x, y, o) { o = o || {}; c.font = (o.b ? "600 " : "") + (o.size || 11) + "px system-ui,sans-serif"; c.fillStyle = o.col || COL.text; c.textAlign = o.al || "left"; c.textBaseline = o.bl || "alphabetic"; c.fillText(s, x, y); }
	var GQ = {
		pivot: [["tilt", "Tilt (°)"], ["prec", "Precession (rad/s)"], ["spin", "Spin (rpm)"], ["E", "Energy drift"]],
		floor: [["tilt", "Tilt (°)"], ["spin", "Spin (rpm)"], ["slip", "Tip sliding (mm/s)"], ["h", "Height of centre of mass (mm)"]],
		cube: [["rad", "Circle radius vs time"], ["radw", "Circle radius vs spin"], ["up", "Axis above level vs time"], ["spin", "Spin vs time"], ["F", "Push on the cube vs grip"]],
		string: [["rad", "Swing radius vs time"], ["radw", "Swing radius vs spin"], ["up", "Axis above level vs time"], ["spin", "Spin vs time"]],
		ice: [["d", "Block moved (mm)"], ["F", "Sideways force on block (N)"], ["tilt", "Tilt (°)"], ["prec", "Precession (rad/s)"]]
	};
	function gq() { var l = GQ[S.tab] || GQ.pivot; return l.some(function (q) { return q[0] === S.g; }) ? S.g : l[0][0]; }
	function paintGsel() {
		var box = $("gy-gsel"), l = GQ[S.tab]; if (!l) { box.innerHTML = ""; return; } var cur = gq();
		box.innerHTML = l.map(function (q) { return '<button type="button" data-g="' + q[0] + '" aria-pressed="' + (q[0] === cur) + '">' + esc(q[1]) + "</button>"; }).join("");
		Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) { b.onclick = function () { S.g = b.getAttribute("data-g"); paintGsel(); drawGraphs(); sset(); }; });
	}
	function drawGraphs() {
		if (!sim) return;
		if (sim.hg) { hgGraphs(); return; }
		/* --- seen from above --- */
		var A = prep("gy-p-stage", "gy-p", function (w) { return clamp(w * 0.62, 200, 300); }), c = A.c, W = A.W, Hh = A.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		var cx = W / 2, cy = Hh / 2 + 8, R = Math.min(W, Hh - 30) / 2 - 8;
		if (sim.mode !== "ice") {
			txt(c, "Tip of the spin axis, seen from above", 8, 15, { b: true, col: COL.dim });
			var maxr = 0.05; H.forEach(function (r) { maxr = Math.max(maxr, Math.hypot(r.px, r.py)); }); maxr = Math.min(1, maxr * 1.15);
			c.strokeStyle = COL.grid; c.lineWidth = 1; [0.25, 0.5, 0.75, 1].forEach(function (k) { c.beginPath(); c.arc(cx, cy, R * k, 0, TAU); c.stroke(); });
			c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
			var tiltLab = Math.asin(Math.min(1, maxr)) / D; txt(c, "outer ring = " + fx(tiltLab, 1) + "° tilt", W - 8, Hh - 6, { al: "right", col: COL.dim });
			var n = Math.min(H.length, 3500), st = H.length - n; c.lineWidth = 1.3;
			for (var i = st + 1; i < H.length; i++) { var a = H[i - 1], b2 = H[i], al = 0.15 + 0.85 * (i - st) / n; c.strokeStyle = "rgba(255,209,102," + al.toFixed(3) + ")"; c.beginPath(); c.moveTo(cx + a.px / maxr * R, cy - a.py / maxr * R); c.lineTo(cx + b2.px / maxr * R, cy - b2.py / maxr * R); c.stroke(); }
			if (H.length) { var L = H[H.length - 1]; c.fillStyle = COL.a; c.beginPath(); c.arc(cx + L.px / maxr * R, cy - L.py / maxr * R, 4, 0, TAU); c.fill(); }
			c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, 2.5, 0, TAU); c.fill();
		} else {
			txt(c, "Block (blue) and centre of mass of everything (pink), seen from above", 8, 15, { b: true, col: COL.dim });
			var mr = Math.max(2 * M.iceCircle(sim.p) * 1000, 0.5); H.forEach(function (r) { mr = Math.max(mr, Math.abs(r.bx), Math.abs(r.by), Math.abs(r.cx), Math.abs(r.cy)); }); mr *= 1.15;
			var st2 = niceStep(mr, 3); c.strokeStyle = COL.grid; for (var g = -Math.floor(mr / st2) * st2; g <= mr; g += st2) { c.beginPath(); c.moveTo(cx + g / mr * R, cy - R); c.lineTo(cx + g / mr * R, cy + R); c.moveTo(cx - R, cy - g / mr * R); c.lineTo(cx + R, cy - g / mr * R); c.stroke(); }
			txt(c, "grid " + sg(st2) + " mm", W - 8, Hh - 6, { al: "right", col: COL.dim });
			[["bx", "by", COL.b], ["cx", "cy", COL.c]].forEach(function (k) { c.strokeStyle = k[2]; c.lineWidth = 1.6; c.beginPath(); H.forEach(function (r, j) { var X = cx + r[k[0]] / mr * R, Y = cy - r[k[1]] / mr * R; if (j) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); var L2 = H[H.length - 1]; if (L2) { c.fillStyle = k[2]; c.beginPath(); c.arc(cx + L2[k[0]] / mr * R, cy - L2[k[1]] / mr * R, 4, 0, TAU); c.fill(); } });
		}
		/* --- over time --- */
		var B = prep("gy-t-stage", "gy-t", function (w) { return clamp(w * 0.5, 180, 260); }); c = B.c; W = B.W; Hh = B.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh); if (H.length < 2) return;
		var key = gq(), lab = (GQ[S.tab].filter(function (q) { return q[0] === key; })[0] || ["", ""])[1];
		var t1 = H[H.length - 1].t, t0 = Math.max(0, t1 - Math.max(2, Math.min(30, t1))), rows = H.filter(function (r) { return r.t >= t0; });
		var y0 = Infinity, y1 = -Infinity; rows.forEach(function (r) { var v = r[key]; if (isFinite(v)) { y0 = Math.min(y0, v); y1 = Math.max(y1, v); } });
		if (key === "F") rows.forEach(function (r) { y1 = Math.max(y1, r.grip); });
		if (!isFinite(y0)) return; if (y1 - y0 < 1e-12) { var mid = y0; y0 = mid - (Math.abs(mid) * 0.01 + 1e-9); y1 = mid + (Math.abs(mid) * 0.01 + 1e-9); } var pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
		var r0 = { x: 52, y: 22, w: W - 64, h: Hh - 46 };
		var X = function (t) { return r0.x + (t - t0) / Math.max(1e-9, t1 - t0) * r0.w; }, Y = function (v) { return r0.y + r0.h - (v - y0) / (y1 - y0) * r0.h; };
		c.font = "11px system-ui,sans-serif"; var ys = niceStep(y1 - y0, 4); c.textAlign = "right"; c.textBaseline = "middle";
		for (var v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r0.x, Y(v) + 0.5); c.lineTo(r0.x + r0.w, Y(v) + 0.5); c.stroke(); c.fillStyle = COL.dim; c.fillText(Math.abs(ys) < 1e-4 ? sci(v, 2) : mi(v.toFixed(Math.max(0, -Math.floor(Math.log10(ys) + 1e-9)))), r0.x - 4, Y(v)); }
		var xs = niceStep(t1 - t0, 5); c.textAlign = "center"; c.textBaseline = "top"; for (var tt = Math.ceil(t0 / xs) * xs; tt <= t1; tt += xs) { c.fillStyle = COL.dim; c.fillText(mi(String(+tt.toFixed(3))) + " s", X(tt), r0.y + r0.h + 4); }
		txt(c, lab, r0.x, 14, { b: true, col: COL.dim });
		if (key === "F") { c.strokeStyle = COL.d; c.setLineDash([5, 4]); c.beginPath(); rows.forEach(function (r, j) { if (j) c.lineTo(X(r.t), Y(r.grip)); else c.moveTo(X(r.t), Y(r.grip)); }); c.stroke(); c.setLineDash([]); txt(c, "ice's grip", r0.x + r0.w, 14, { al: "right", col: COL.d }); }
		c.strokeStyle = COL.a; c.lineWidth = 1.6; c.beginPath(); rows.forEach(function (r, j) { if (j) c.lineTo(X(r.t), Y(r[key])); else c.moveTo(X(r.t), Y(r[key])); }); c.stroke();
	}

	/* graphs for the MES setups: the foot from above, and the chosen quantity across the whole run (click / drag it to jump there) */
	var hgMap = null;
	function hgGraphs() {
		var rows = sim.run.rows, rad = sim.rad || [], p = sim.p, n = rows.length, a = hgAt(sim.cur); if (!n || !a) return;
		var A = prep("gy-p-stage", "gy-p", function (w) { return clamp(w * 0.62, 200, 300); }), c = A.c, W = A.W, Hh = A.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		txt(c, sim.mode === "cube" ? "Ice cube seen from above (last 2 turns)" : "Bottom of the string seen from above (last 2 turns)", 8, 15, { b: true, col: COL.dim });
		var win = Math.min(40, Math.max(4, 2 * TAU / Math.max(0.05, Math.abs(a.W)))), i1 = a.i, i0 = i1; while (i0 > 0 && rows[i0 - 1][0] > a.t - win) i0--;
		var cx0 = 0, cy0 = 0, k; for (k = i0; k <= i1; k++) { cx0 += rows[k][1]; cy0 += rows[k][2]; } cx0 /= (i1 - i0 + 1); cy0 /= (i1 - i0 + 1);
		var ref = sim.mode === "cube" ? M.hgFreeCircle(p) : Math.min(p.L * 0.5, Math.abs(M.hgStringRadius(p, M.hgPrec(p, a.w3))));
		var mr = Math.max(0.004, ref * 1.25); for (k = i0; k <= i1; k++) mr = Math.max(mr, Math.hypot(rows[k][1] - cx0, rows[k][2] - cy0) * 1.15);
		var cx = W / 2, cy = Hh / 2 + 8, R = Math.min(W, Hh - 30) / 2 - 8, sx = function (v) { return cx + (v - cx0) / mr * R; }, sy = function (v) { return cy - (v - cy0) / mr * R; };
		var st2 = niceStep(mr * 100, 3) / 100; c.strokeStyle = COL.grid; c.lineWidth = 1;
		for (var gg = -Math.floor(mr / st2) * st2; gg <= mr; gg += st2) { c.beginPath(); c.moveTo(cx + gg / mr * R, cy - R); c.lineTo(cx + gg / mr * R, cy + R); c.moveTo(cx - R, cy - gg / mr * R); c.lineTo(cx + R, cy - gg / mr * R); c.stroke(); }
		txt(c, "grid " + cmTxt(st2), W - 8, Hh - 6, { al: "right", col: COL.dim });
		if (ref > 0 && ref < mr * 1.2) { c.strokeStyle = COL.d; c.setLineDash([5, 4]); c.beginPath(); c.arc(cx, cy, ref / mr * R, 0, TAU); c.stroke(); c.setLineDash([]); txt(c, sim.mode === "cube" ? "no-friction circle" : "steady-swing formula", 8, Hh - 6, { col: COL.d }); }
		c.strokeStyle = COL.b; c.lineWidth = 1.8; c.beginPath(); for (k = i0; k <= i1; k++) { var X = sx(rows[k][1]), Y = sy(rows[k][2]); if (k > i0) c.lineTo(X, Y); else c.moveTo(X, Y); } c.stroke();
		c.fillStyle = COL.b; c.beginPath(); c.arc(sx(a.x), sy(a.y), 4.5, 0, TAU); c.fill();
		/* the gyro's axis direction from the foot */
		var ax = Math.sin(a.th) * Math.cos(a.ph), ay = Math.sin(a.th) * Math.sin(a.ph); c.strokeStyle = COL.a; c.lineWidth = 2; c.beginPath(); c.moveTo(sx(a.x), sy(a.y)); c.lineTo(sx(a.x) + ax * 28, sy(a.y) - ay * 28); c.stroke();
		txt(c, "yellow = direction of the axis", W - 8, 30, { al: "right", col: COL.a, size: 10 });

		var B = prep("gy-t-stage", "gy-t", function (w) { return clamp(w * 0.5, 190, 270); }); c = B.c; W = B.W; Hh = B.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		var key = gq(), lab = (GQ[sim.mode].filter(function (q) { return q[0] === key; })[0] || ["", ""])[1], vs = key === "radw";
		var r0 = { x: 56, y: 24, w: W - 68, h: Hh - 50 }, step = Math.max(1, Math.floor(n / 1400));
		function val(i) { var r = rows[i]; return key === "rad" || key === "radw" ? (rad[i] || 0) * 100 : key === "up" ? 90 - r[4] / D : key === "spin" ? M.rpm(r[6]) : r[9] * 1000; }
		var wTop = M.rpm(rows[0][6]), wLow = M.rpm(rows[n - 1][6]); if (sim.done === false) wLow = Math.min(wLow, wTop * 0.3);
		var x0 = vs ? wTop : 0, x1 = vs ? Math.min(wLow, wTop - 1) : sim.run.T;
		var X = function (v) { return r0.x + (v - x0) / (x1 - x0) * r0.w; };
		var y0 = Infinity, y1 = -Infinity, i; for (i = 0; i < n; i += step) { var v = val(i); if (isFinite(v)) { y0 = Math.min(y0, v); y1 = Math.max(y1, v); } }
		var refY = null;
		if (key === "rad" || key === "radw") { y0 = 0; refY = sim.mode === "cube" ? M.hgFreeCircle(p) * 100 : null; if (refY) y1 = Math.max(y1, refY * 1.1); y1 = Math.max(y1, 0.5); }
		if (key === "up") { y0 = Math.min(y0, -2); y1 = Math.max(y1, 2); }
		if (key === "spin") y0 = 0;
		var gripMax = 0; if (key === "F") { for (i = 0; i < n; i += step) gripMax = Math.max(gripMax, p.mus * rows[i][10] * 1000); y0 = 0; y1 = Math.max(y1, gripMax * 1.15); }
		if (!isFinite(y0)) return; if (y1 - y0 < 1e-9) y1 = y0 + 1; var pad = (y1 - y0) * 0.06; if (key !== "rad" && key !== "radw" && key !== "spin" && key !== "F") y0 -= pad; y1 += pad;
		var Y = function (v) { return r0.y + r0.h - (v - y0) / (y1 - y0) * r0.h; };
		c.font = "11px system-ui,sans-serif"; var ys = niceStep(y1 - y0, 4); c.textAlign = "right"; c.textBaseline = "middle";
		for (var gv = Math.ceil(y0 / ys) * ys; gv <= y1; gv += ys) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r0.x, Y(gv) + 0.5); c.lineTo(r0.x + r0.w, Y(gv) + 0.5); c.stroke(); c.fillStyle = COL.dim; c.fillText(mi(+gv.toFixed(Math.max(0, -Math.floor(Math.log10(ys))))), r0.x - 5, Y(gv)); }
		c.textAlign = "center"; c.textBaseline = "top";
		var xs = niceStep(Math.abs(x1 - x0), 5); for (var tx = Math.ceil(Math.min(x0, x1) / xs) * xs; tx <= Math.max(x0, x1); tx += xs) { c.fillStyle = COL.dim; c.fillText(vs ? (tx >= 1000 ? +(tx / 1000).toFixed(1) + "k" : String(Math.round(tx))) : clockTxt(tx), X(tx), r0.y + r0.h + 4); }
		var unit = key === "rad" || key === "radw" ? " (cm)" : key === "up" ? " (°)" : key === "spin" ? " (rpm)" : " (mN)";
		txt(c, lab + unit, r0.x, 14, { b: true, col: COL.dim }); txt(c, vs ? "spin (rpm), falling →" : "time (m:ss)", r0.x + r0.w, 14, { al: "right", col: COL.dim, size: 10 });
		/* textbook reference lines */
		c.setLineDash([5, 4]); c.lineWidth = 1.2;
		if (refY != null) { c.strokeStyle = COL.d; c.beginPath(); c.moveTo(r0.x, Y(refY)); c.lineTo(r0.x + r0.w, Y(refY)); c.stroke(); txt(c, "no friction: " + fx(refY, 2) + " cm", r0.x + 6, Y(refY) - 6, { col: COL.d, size: 10 }); }
		if (key === "up") { c.strokeStyle = COL.axis; c.beginPath(); c.moveTo(r0.x, Y(0)); c.lineTo(r0.x + r0.w, Y(0)); c.stroke(); }
		var wMark = sim.mode === "cube" ? M.hgCritical(p) : p.m * M.G * p.l / (p.I3 * M.hgPendulum(p)), wMarkR = M.rpm(wMark);
		if (isFinite(wMarkR) && wMarkR > 0) {
			var xm = null; if (vs) xm = wMarkR <= x0 && wMarkR >= x1 ? X(wMarkR) : null; else for (i = 0; i < n; i++) if (rows[i][6] <= wMark) { xm = X(rows[i][0]); break; }
			if (xm != null && key !== "spin") { c.strokeStyle = COL.c; c.beginPath(); c.moveTo(xm, r0.y); c.lineTo(xm, r0.y + r0.h); c.stroke(); txt(c, sim.mode === "cube" ? "formula: cube slips" : "precession = string's swing rate", xm + 4, r0.y + 10, { col: COL.c, size: 10 }); }
		}
		if (key === "radw" && sim.mode === "string") {      /* steady-swing formula against spin */
			c.strokeStyle = COL.d; c.beginPath(); var on = false;
			for (i = 0; i <= 200; i++) { var wr = x0 + (x1 - x0) * i / 200, rr = Math.abs(M.hgStringRadius(p, M.hgPrec(p, M.radps(wr)))) * 100; if (rr > y1) { on = false; continue; } if (on) c.lineTo(X(wr), Y(rr)); else { c.moveTo(X(wr), Y(rr)); on = true; } }
			c.stroke(); txt(c, "steady-swing formula", r0.x + 4, r0.y + 22, { col: COL.d, size: 10 });
		}
		if (key === "F") { c.strokeStyle = COL.d; c.beginPath(); for (i = 0; i < n; i += step) { var gy = Y(p.mus * rows[i][10] * 1000); if (i) c.lineTo(X(rows[i][0]), gy); else c.moveTo(X(rows[i][0]), gy); } c.stroke(); txt(c, "ice's grip μs·N", r0.x + r0.w, r0.y + 10, { al: "right", col: COL.d, size: 10 }); }
		c.setLineDash([]);
		c.strokeStyle = COL.a; c.lineWidth = 1.6; c.beginPath();
		for (i = 0; i < n; i += step) { var xx = X(vs ? M.rpm(rows[i][6]) : rows[i][0]), yy = Y(val(i)); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke();
		/* cursor */
		var cxp = X(vs ? M.rpm(a.w3) : a.t); c.strokeStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.moveTo(cxp, r0.y); c.lineTo(cxp, r0.y + r0.h); c.stroke();
		c.fillStyle = "#fff"; c.beginPath(); c.arc(cxp, Y(val(a.i)), 3.5, 0, TAU); c.fill();
		hgMap = { r0: r0, vs: vs, x0: x0, x1: x1 };
	}
	(function () {
		var cv = $("gy-t"), down = false;
		function go(e) {
			if (!sim || !sim.hg || !hgMap) return; var b = cv.getBoundingClientRect(), f = clamp((e.clientX - b.left - hgMap.r0.x) / hgMap.r0.w, 0, 1), v = hgMap.x0 + (hgMap.x1 - hgMap.x0) * f, t;
			if (hgMap.vs) { var rows = sim.run.rows, i = 0; while (i < rows.length - 1 && M.rpm(rows[i][6]) > v) i++; t = rows[i][0]; } else t = v;
			if (playing) $("gy-play").click(); sim.cur = Math.min(hgEnd(), Math.max(0, t)); drawGraphs(); readouts();
		}
		cv.addEventListener("pointerdown", function (e) { if (!sim || !sim.hg) return; down = true; try { cv.setPointerCapture(e.pointerId); } catch (er) {} go(e); });
		cv.addEventListener("pointermove", function (e) { if (down) go(e); });
		cv.addEventListener("pointerup", function () { down = false; }); cv.addEventListener("pointercancel", function () { down = false; });
	})();

	/* ---------------- 3D view (three.js) ---------------- */
	var view = null;
	function loadThree() {
		var imp = new Function("u", "return import(u)");
		return imp("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js").catch(function () { return imp("https://unpkg.com/three@0.170.0/build/three.module.min.js"); });
	}
	function makeView(THREE) {
		var cv = $("gy-c"), renderer;
		try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		var scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0f1a);
		var cam = new THREE.PerspectiveCamera(40, 1.6, 0.001, 50);
		scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f3a, 1.1));
		var sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 5, 3); scene.add(sun);
		var rootG = new THREE.Group(); scene.add(rootG);
		function W3(v) { return new THREE.Vector3(v[0], v[2], -v[1]); }                 // z-up world -> three (y up)
		function Q3(q) { return new THREE.Quaternion(q[1], q[3], -q[2], q[0]); }
		function stripeTex(c1, c2, n) {
			var cnv = document.createElement("canvas"); cnv.width = 256; cnv.height = 16; var x = cnv.getContext("2d");
			for (var i = 0; i < n; i++) { x.fillStyle = i % 2 ? c2 : c1; x.fillRect(i * 256 / n, 0, 256 / n + 1, 16); }
			var t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
		}
		var MAT = {
			wood: new THREE.MeshStandardMaterial({ map: stripeTex("#d9a066", "#b5651d", 8), roughness: 0.6 }),
			rotor: new THREE.MeshStandardMaterial({ map: stripeTex("#c8ccd6", "#3a7bd5", 6), metalness: 0.6, roughness: 0.35 }),
			metal: new THREE.MeshStandardMaterial({ color: 0xb8bec9, metalness: 0.8, roughness: 0.3 }),
			frame: new THREE.MeshStandardMaterial({ color: 0xd6a83a, metalness: 0.7, roughness: 0.35 }),
			stand: new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.6 }),
			red: new THREE.MeshStandardMaterial({ color: 0xe0464e, roughness: 0.5 }),
			block: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 }),
			ice: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.85 }),
			floor: new THREE.MeshStandardMaterial({ color: 0x2b3242, roughness: 0.9 })
		};
		/* a top / gyroscope along +y, origin at its pivot / tip point. Returns {g (whole), rotor, frame} */
		function topModel(b) {
			var g = new THREE.Group(), rotor = new THREE.Group(), frame = new THREE.Group(); g.add(frame); g.add(rotor);
			var l = b.l, r = b.r, h = b.h, a = b.a;
			if (b.kind === "top") {
				var pts = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(a * 0.9, a * 0.4), new THREE.Vector2(r * 0.25, l * 0.45), new THREE.Vector2(r, l * 0.95), new THREE.Vector2(r, l * 1.12), new THREE.Vector2(r * 0.7, l * 1.3), new THREE.Vector2(r * 0.14, l * 1.38), new THREE.Vector2(r * 0.12, h * 0.98), new THREE.Vector2(0.0001, h)];
				var m1 = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), MAT.wood); rotor.add(m1);
				var tip = new THREE.Mesh(new THREE.SphereGeometry(Math.max(a, 0.0004), 16, 10), MAT.metal); tip.position.y = Math.max(a, 0.0004); rotor.add(tip);
			} else if (b.kind === "tippe") {
				var ball = new THREE.Mesh(new THREE.SphereGeometry(a, 40, 24, 0, TAU, 0.42, Math.PI - 0.42), MAT.wood); ball.position.y = a; ball.rotation.x = Math.PI; rotor.add(ball);
				var stem = new THREE.Mesh(new THREE.CylinderGeometry(a * 0.13, a * 0.13, a * 0.9, 16), MAT.wood); stem.position.y = 2 * a + a * 0.25; rotor.add(stem);
				var cap = new THREE.Mesh(new THREE.CylinderGeometry(a * 0.6, a * 0.6, a * 0.1, 30), MAT.wood); cap.position.y = a + a * 0.9; rotor.add(cap);
			} else {
				var disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.93, r * 0.1, 48, 1, false), MAT.rotor); disc.position.y = l; rotor.add(disc);
				var rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.93, r * 0.09, 14, 56), MAT.rotor); rim.rotation.x = Math.PI / 2; rim.position.y = l; rotor.add(rim);
				var fr = r * 1.14, ax = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, 2 * fr, 12), MAT.metal); ax.position.y = l; frame.add(ax);
				[0, Math.PI / 2].forEach(function (rr) { var ring = new THREE.Mesh(new THREE.TorusGeometry(fr, r * 0.045, 10, 64), MAT.frame); ring.rotation.y = rr; ring.position.y = l; frame.add(ring); });
				var footH = Math.max(0.002, l - fr), foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.035, footH, 12), MAT.frame); foot.position.y = footH / 2; frame.add(foot);
				var ball2 = new THREE.Mesh(new THREE.SphereGeometry(Math.max(a, r * 0.05), 14, 10), MAT.metal); ball2.position.y = Math.max(a, r * 0.05); frame.add(ball2);
				var top = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 14, 10), MAT.frame); top.position.y = l + fr; frame.add(top);
			}
			return { g: g, rotor: rotor, frame: frame };
		}
		/* three r170's setFromPoints never grows a buffer, so a line whose point count changes gets a new geometry */
		function setPts(line, pts) { var a = line.geometry.getAttribute("position"); if (!a || a.count !== pts.length) { line.geometry.dispose(); line.geometry = new THREE.BufferGeometry(); } line.geometry.setFromPoints(pts); }
		function arrow(col) { var a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, col); a.line.material.linewidth = 2; return a; }
		var V3 = { root: rootG, sceneObj: [] };
		var stringLine = null, top = null, stand = null, standRot = null, block = null, arrL = arrow(0xffd166), arrT = arrow(0xff5c6a), trail = null, trailPts = [], comMark = null, blockTrail = null, blockPts = [];
		var camS = { yaw: 0.7, pitch: 0.42, dist: 1, tgt: new THREE.Vector3() }, scale = 1;
		function clear() { while (rootG.children.length) rootG.remove(rootG.children[0]); trailPts = []; blockPts = []; stringLine = null; block = null; comMark = null; blockTrail = null; standRot = null; }
		function build() {
			clear(); if (!sim) return; var b = sim.b, mode = sim.mode;
			var size = mode === "ice" || mode === "string" ? 0.45 : mode === "cube" ? 0.3 : Math.max(b.h, 2.2 * b.r) * (mode === "floor" ? 2.6 : 2.2);
			scale = 1 / size; rootG.scale.setScalar(scale);
			var gr = new THREE.GridHelper(size * 3, 30, 0x3a4560, 0x232b3c); gr.position.y = 0;
			top = topModel(b); rootG.add(top.g);
			if (mode === "pivot") {
				var Hs = (b.kind === "gyro" ? b.l + b.r * 1.3 : b.l + b.r * 0.8) + 0.004, armX = -(b.r * 1.7 + 0.01);
				gr.position.y = -Hs; rootG.add(gr);
				var fl = new THREE.Mesh(new THREE.CircleGeometry(size * 1.4, 48), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = -Hs - 0.0005; rootG.add(fl);
				standRot = new THREE.Group(); rootG.add(standRot);
				var col = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.12 + 0.002, b.r * 0.16 + 0.003, Hs, 16), MAT.stand); col.position.set(armX, -Hs / 2, 0); standRot.add(col);
				var arm = new THREE.Mesh(new THREE.BoxGeometry(-armX, b.r * 0.12 + 0.002, b.r * 0.2 + 0.003), MAT.stand); arm.position.set(armX / 2, -(b.r * 0.06 + 0.001) - 0.0015, 0); standRot.add(arm);
				var cup = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.12 + 0.002, b.r * 0.08 + 0.001, 0.003, 18), MAT.red); cup.position.y = -0.0015; standRot.add(cup);
				var baseD = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.9 + 0.01, b.r * 0.9 + 0.01, 0.004, 32), MAT.stand); baseD.position.set(armX, -Hs + 0.002, 0); standRot.add(baseD);
				camS.tgt.set(0, b.l * 0.5 * scale, 0); camS.dist = 1.35; camS.base = 1.35;
			} else if (mode === "floor") {
				rootG.add(gr); var f2 = new THREE.Mesh(new THREE.CircleGeometry(size * 1.5, 48), MAT.floor); f2.rotation.x = -Math.PI / 2; f2.position.y = -0.0003; rootG.add(f2);
				camS.dist = 1.5; camS.base = 1.5;
			} else if (mode === "cube") {
				var sc = Math.cbrt(sim.p.mb / 917);
				var tray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.01, 0.46), MAT.ice); tray.position.y = -0.005; rootG.add(tray);
				var rimM = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.5 });
				[[0, 0.23], [0, -0.23]].forEach(function (q) { var e = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.02, 0.01), rimM); e.position.set(q[0], 0.005, q[1]); rootG.add(e); });
				[[0.31, 0], [-0.31, 0]].forEach(function (q) { var e = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.46), rimM); e.position.set(q[0], 0.005, q[1]); rootG.add(e); });
				block = new THREE.Group(); rootG.add(block);
				var cubeM = new THREE.MeshStandardMaterial({ color: 0xe6f6ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.72 });
				var icec = new THREE.Mesh(new THREE.BoxGeometry(sc, sc, sc), cubeM); icec.position.y = sc / 2; block.add(icec);
				sim.standH = sc;
				comMark = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.0015, 20), new THREE.MeshBasicMaterial({ color: 0xff7aa2 })); comMark.position.y = 0.001; rootG.add(comMark);
				blockTrail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4cc9f0 })); blockTrail.frustumCulled = false; rootG.add(blockTrail);
				scale = 1 / 0.3; rootG.scale.setScalar(scale); camS.dist = 0.72; camS.base = 0.72; camS.tgt.set(0, (sc + sim.p.l * 0.4) * scale, 0);
			} else if (mode === "string") {
				var h0 = 0.3; sim.h0 = h0; rootG.add(gr);
				var fl3 = new THREE.Mesh(new THREE.CircleGeometry(0.7, 48), MAT.floor); fl3.rotation.x = -Math.PI / 2; fl3.position.y = -0.0005; rootG.add(fl3);
				stringLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2f2f2 })); stringLine.frustumCulled = false; rootG.add(stringLine);
				blockTrail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4cc9f0 })); blockTrail.frustumCulled = false; rootG.add(blockTrail);
				comMark = null; block = null;
				scale = 1 / 0.45; rootG.scale.setScalar(scale); camS.dist = 0.95; camS.base = 0.95; camS.tgt.set(0, (h0 + 0.02) * scale, 0);
			} else {
				var p = sim.p, bw = 0.26, bd = 0.18, bh = 0.05;
				var ice = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.2), MAT.ice); ice.position.y = -0.02; rootG.add(ice);
				block = new THREE.Group(); rootG.add(block);
				var bx = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), MAT.block); bx.position.y = bh / 2; block.add(bx);
				var Hs2 = b.l + b.r * 1.3 + 0.01; sim.standH = bh + Hs2;
				var post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, Hs2, 14), MAT.stand); post.position.y = bh + Hs2 / 2; block.add(post);
				var cp = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.006, 0.004, 14), MAT.red); cp.position.y = bh + Hs2 - 0.002; block.add(cp);
				comMark = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 20), new THREE.MeshBasicMaterial({ color: 0xff7aa2 })); comMark.position.y = 0.002; rootG.add(comMark);
				blockTrail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4cc9f0 })); blockTrail.frustumCulled = false; rootG.add(blockTrail);
				scale = 1 / 0.45; rootG.scale.setScalar(scale); camS.dist = 1.15; camS.base = 1.15; camS.tgt.set(0, sim.standH * 0.85 * scale, 0);
			}
			rootG.add(arrL); rootG.add(arrT);
			trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8 })); trail.frustumCulled = false; rootG.add(trail);
			toggles(); render();
		}
		function toggles() { arrL.visible = !!S.showL; arrT.visible = !!S.showT; if (trail) trail.visible = !!S.trail; if (blockTrail) blockTrail.visible = !!S.trail; }
		function setArrow(a, origin, dir, len, col) { var d = new THREE.Vector3(dir[0], dir[2], -dir[1]); if (d.lengthSq() < 1e-20 || !(len > 1e-9)) { a.visible = false; return; } d.normalize(); a.position.copy(W3(origin)); a.setDirection(d); a.setLength(len, Math.min(len * 0.3, 0.25 / scale * 0.3), Math.min(len * 0.18, 0.12 / scale * 0.3)); }
		function update(dtVis) {
			if (!sim || !top) return; var b = sim.b, I = info(), e3 = I.e3, tilt = I.tilt, azi = Math.atan2(e3[1], e3[0]);
			var spinRate = I.spin, shown = Math.sign(spinRate) * Math.min(Math.abs(spinRate), TAU * 2.5);    // draw at most 2.5 turns a second
			visSpin = (visSpin + shown * dtVis) % TAU;
			var fq = M.qTilt(tilt, azi), rq = M.qmul(fq, M.qaxis([0, 0, 1], visSpin));
			var origin = [0, 0, 0];
			if (sim.mode === "floor") { origin = V.sub(sim.s.p, V.mul(e3, b.l)); }
			var foot = null;
			if (sim.hg) {
				var ha = I.a;
				if (sim.mode === "cube") { origin = [ha.x, ha.y, sim.standH]; foot = [ha.x, ha.y, 0.002]; block.position.copy(W3([ha.x, ha.y, 0])); var kk = sim.p.m / (sim.p.mb + sim.p.m); comMark.position.copy(W3([ha.x + kk * sim.p.l * e3[0], ha.y + kk * sim.p.l * e3[1], 0.001])); }
				else { origin = [ha.x, ha.y, ha.z + sim.p.L + sim.h0]; foot = origin; if (stringLine) setPts(stringLine, [W3(origin), W3([0, 0, sim.p.L + sim.h0])]); }
			}
			if (sim.mode === "ice") { var x = sim.s.x; foot = [x[0], x[1], 0.003]; origin = [x[0], x[1], sim.standH]; block.position.copy(W3([x[0], x[1], 0])); var c = M.iceCOM(sim.p, sim.s); comMark.position.copy(W3([c[0], c[1], 0.001])); }
			top.g.position.copy(W3(origin)); top.frame.quaternion.copy(Q3(fq)); top.rotor.quaternion.copy(Q3(rq));
			if (standRot) standRot.rotation.y = holderAng;
			/* arrows: angular momentum along L, torque of gravity (horizontal) at the centre of mass */
			var Lw = sim.mode === "ice" || sim.hg ? V.mul(e3, b.I3 * I.spin) : I.L, Lm = V.norm(Lw), L0 = sim.L0 || (sim.L0 = Lm || 1);
			var sz = 1 / scale, com = V.add(origin, V.mul(e3, b.l));
			setArrow(arrL, origin, Lw, 0.45 * sz * Math.min(2, Math.max(0.15, Lm / L0)));
			var tq = V.cross(V.mul(e3, b.l), [0, 0, -1]); setArrow(arrT, com, tq, 0.28 * sz * Math.min(1.2, Math.abs(Math.sin(tilt)) + 0.05));
			arrL.visible = !!S.showL && Lm > 0; arrT.visible = !!S.showT && Math.abs(Math.sin(tilt)) > 0.02;
			/* trail of the top of the axis */
			if (S.trail) {
				if (sim.hg) {      /* rebuilt from the stored run, so jumping around the run never draws false lines */
					var rows = sim.run.rows, hi = I.a.i, lo = hi, win = Math.min(30, Math.max(3, 2 * TAU / Math.max(0.05, Math.abs(I.a.W)))); while (lo > 0 && rows[lo - 1][0] > I.a.t - win) lo--;
					var stp = Math.max(1, Math.floor((hi - lo) / 600)), tp = [], fp = [], ext = b.l + b.r * 1.22;
					for (var j = lo; j <= hi; j += stp) { var r = rows[j], sn = Math.sin(r[4]), ee = [sn * Math.cos(r[5]), sn * Math.sin(r[5]), Math.cos(r[4])];
						var o = sim.mode === "cube" ? [r[1], r[2], sim.standH] : [r[1], r[2], r[3] + sim.p.L + sim.h0]; tp.push(W3(V.add(o, V.mul(ee, ext)))); fp.push(W3(sim.mode === "cube" ? [r[1], r[2], 0.002] : o)); }
					setPts(trail, tp); if (blockTrail) setPts(blockTrail, fp); foot = null;
				} else {
				var tipP = V.add(origin, V.mul(e3, b.kind === "gyro" ? b.l + b.r * 1.22 : b.h)); trailPts.push(W3(tipP)); if (trailPts.length > 700) trailPts.shift();
				setPts(trail, trailPts);
				if (blockTrail && foot) { blockPts.push(W3(foot)); if (blockPts.length > 2000) blockPts.shift(); setPts(blockTrail, blockPts); }
				}
			}
			if (sim.mode === "floor") { var tg = W3(com).multiplyScalar(scale); camS.tgt.lerp(new THREE.Vector3(tg.x, Math.max(tg.y * 0.7, 0.15), tg.z), 0.06); }
		}
		function render() {
			var w = cv.clientWidth || 600, h = cv.clientHeight || 400; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
			var cp = Math.cos(camS.pitch), dd = camS.dist * (sim && sim.hg ? Math.max(1, 1.3 / cam.aspect) : 1); cam.position.set(camS.tgt.x + dd * cp * Math.sin(camS.yaw), camS.tgt.y + dd * Math.sin(camS.pitch), camS.tgt.z + dd * cp * Math.cos(camS.yaw)); cam.lookAt(camS.tgt);
			renderer.render(scene, cam);
		}
		/* orbit camera: drag to turn, wheel / pinch to zoom, double-click resets */
		var ptrs = {}, drag = null, pinch = null;
		cv.addEventListener("pointerdown", function (e) { ptrs[e.pointerId] = [e.clientX, e.clientY]; try { cv.setPointerCapture(e.pointerId); } catch (er) {} var ids = Object.keys(ptrs); if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, yaw: camS.yaw, pitch: camS.pitch }; else if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: camS.dist }; drag = null; } });
		cv.addEventListener("pointermove", function (e) { if (!ptrs[e.pointerId]) return; ptrs[e.pointerId] = [e.clientX, e.clientY]; var ids = Object.keys(ptrs);
			if (pinch && ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); camS.dist = clamp(pinch.dist * pinch.d / Math.max(10, d), 0.3, 8); }
			else if (drag) { camS.yaw = drag.yaw - (e.clientX - drag.x) * 0.008; camS.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.006, -0.2, 1.45); }
			if (!playing) render(); });
		function up(e) { delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null; if (!Object.keys(ptrs).length) drag = null; }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); camS.dist = clamp(camS.dist * Math.exp(e.deltaY * 0.0012), 0.3, 8); if (!playing) render(); }, { passive: false });
		function resetCam() { camS.yaw = 0.7; camS.pitch = 0.42; camS.dist = camS.base || 2.3; render(); }
		cv.addEventListener("dblclick", resetCam);
		cv.addEventListener("keydown", function (e) { var k = e.key; if (k === "ArrowLeft") camS.yaw += 0.08; else if (k === "ArrowRight") camS.yaw -= 0.08; else if (k === "ArrowUp") camS.pitch = clamp(camS.pitch + 0.06, -0.2, 1.45); else if (k === "ArrowDown") camS.pitch = clamp(camS.pitch - 0.06, -0.2, 1.45); else if (k === "+" || k === "=") camS.dist = clamp(camS.dist * 0.9, 0.3, 8); else if (k === "-") camS.dist = clamp(camS.dist / 0.9, 0.3, 8); else return; e.preventDefault(); render(); });
		$("gy-view").onclick = resetCam;
		$("gy-png").onclick = function () { render(); try { var a = document.createElement("a"); a.download = "gyroscope-simulator.png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } };
		return { build: build, update: update, render: render, toggles: toggles, legend: true };
	}
	function legend() { $("gy-legend").innerHTML = '<span><i style="background:#ffd166"></i>Angular momentum L</span><span><i style="background:#ff5c6a"></i>Gravity torque</span>'; }

	/* ---------------- stage sizing (works with the shared View bar: Small / Medium / Large, Fill window) ---------------- */
	function fitStage() {
		var stage = $("gy-stage"), wrap = stage.parentNode, w = wrap.clientWidth || 600;
		wrap.setAttribute("data-mes-free", "1");
		var h = clamp(w * 0.58, 280, 620); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		stage.style.width = w + "px"; stage.style.height = Math.max(240, Math.round(h)) + "px";
		if (view) view.render();
	}
	function fitAll() { fitStage(); drawGraphs(); }
	if (window.ResizeObserver) new ResizeObserver(function () { fitStage(); }).observe($("gy-stage").parentNode);
	window.addEventListener("resize", fitAll); document.addEventListener("fullscreenchange", function () { setTimeout(fitAll, 60); });

	/* ---------------- loop ---------------- */
	var lastT = 0, lastRO = 0, lastG = 0;
	function frame(ts) {
		requestAnimationFrame(frame);
		if (document.hidden) { lastT = ts; return; }
		var dt = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 0.016; lastT = ts;
		if (!sim || simbox.hidden) return;
		if (playing) stepSim(dt * Math.pow(10, S.spd));
		if (view) { view.update(playing ? dt : 0); view.render(); }
		if (ts - lastRO > 120) { lastRO = ts; readouts(); }
		if (ts - lastG > 90) { lastG = ts; drawGraphs(); }
	}

	/* ---------------- MES & Owen Liang tab ---------------- */
	var EXPS = [
		{ t: "The Gyrotop re-aligns itself when its holder is moved", who: "Owen Liang's Gyrotop",
		  obs: "The Gyrotop has a very sharp tip in a small magnetic seat, so it has very little room to slide or roll. Moving the holder around makes the spinning top re-align itself against gravity and against the magnet's pull; MES notes it can tilt against its own spin direction.",
		  std: "With a fixed pivot, friction in the seat acts on the top's motion relative to the holder. When the holder turns, that friction drags the spinning axis toward the holder's axis of turning (the same gyroscopic effect that lines up a damped gyrocompass with the Earth's rotation), while friction that resists the precession lowers it. The magnet's pull acts like extra weight on the top.",
		  diff: "Both describe the top re-aligning when the holder moves. The textbook explains it with angular momentum plus friction torques; MES reads it as a sign that the top behaves as if it had no angular momentum. Measuring the holder's turn rate, the spin and the axis angle over time would let the two be compared directly.",
		  run: [["pivot", "holder", "Turn the holder"], ["pivot", "pfric", "Precession friction"]] },
		{ t: "A gyroscope set on its foot rises like a spinning top", who: "MES Experiment 1",
		  obs: "A gyroscope placed as a spinning top stands up on its own, which MES takes as refuting the idea that tops rise because of sliding or rolling friction at the tip.",
		  std: "The standard model says a top (or a gyroscope used as one) rises because of friction where its rounded foot touches the table: as it spins, the foot slides sideways, the friction pushes the precession along, and hurrying the precession lifts the axis. With no friction at the foot it never rises. A gyroscope on its foot is, mechanically, a top, so the same applies.",
		  diff: "The observation (it rises) agrees with the model. They differ on the cause: the model needs friction at the foot; the article argues friction is not the explanation. A test: the same gyroscope on a near-frictionless surface (a polished, oiled glass plate) should, by the model, not rise.",
		  run: [["floor", "gyro", "Gyroscope as a top"], ["floor", "nofric", "No friction at the tip"]] },
		{ t: "Less precession friction is the key to rising", who: "MES Experiment 1",
		  obs: "Minimizing precessional friction makes the gyroscope (and so a top) rise.",
		  std: "Friction that holds the precession back makes a gyroscope's axis sink; a push that hurries the precession makes it rise. So less precession friction means less sinking, and any torque that speeds the precession up lifts it.",
		  diff: "Agree on the direction of the effect. The model adds that precession friction alone never lifts a gyroscope: something must push the precession along (at a top's foot, that is the sliding friction).",
		  run: [["pivot", "pfric", "Friction lowers it"], ["pivot", "push", "A push lifts it"]] },
		{ t: "Tape that adds spin friction makes it rise faster", who: "MES Experiment 1",
		  obs: "Adding tape to increase the spin friction can greatly increase the rate of rising.",
		  std: "Tape on the foot increases the friction coefficient at the contact. In the model, rising comes from that friction, so more of it gives faster rising, up to the point where the foot rolls instead of sliding.",
		  diff: "Agree: more friction at the foot, faster rising. The article calls it spin friction; in the model it is the friction between the foot and the table.",
		  run: [["floor", "rise", "Wood tip (μ 0.3)"], ["floor", "tape", "Tape tip (μ 0.8)"]] },
		{ t: "On an ice block, a fast gyroscope hardly moves the block", who: "MES ice-block experiments",
		  obs: "With the gyroscope on a block on ice, the block's sideways movement varies inversely with the spin: at high spin the precessing gyroscope does not even nudge the block; at slow spin it moves it, as Cambridge's frictionless-ice picture describes. MES concludes that precessional inertia varies.",
		  std: "For the axis to go round, the gyroscope's centre of mass must move in a circle, which needs a sideways force m·l·Ω² from the stand. Faster spin means slower precession Ω = m·g·l/(I₃ω), so the force falls as 1/spin². Ice is slippery but not frictionless: its grip μs(M+m)g holds the block still whenever the needed force is smaller. Cambridge's animation assumes frictionless ice, where the block always circles (radius m·l/(M+m)).",
		  diff: "Both agree that the block moves less at higher spin. They differ on why: the model keeps inertia constant and says the needed force drops below the ice's grip (see the chart below: for a toy gyroscope that happens at a few hundred rpm); MES reads it as inertia changing with spin. A test that would separate them: measure the ice's friction (tilt it until the block slides), then check the spin at which the block starts moving against the predicted critical spin; or repeat on an air table, where the model predicts the same small circle at every spin.",
		  run: [["cube", "mes", "MES's ice cube, minutes"], ["cube", "zero", "Frictionless tray"], ["ice", "slow", "Heavy block, slow spin"]] },
		{ t: "Hanging on a string: the swing grows and the gyro rises as the spin drops", who: "MES string experiment",
		  obs: "The gyro hangs by its axle nut from a long string. At fast spin the string barely moves; as the spin drops the swing gradually widens until it is extremely wide, and the gyro rises on its own.",
		  std: "The bottom of the string is a pendulum that the precession drives round. The standard model's steady swing is l·Ω²/|Ω² − g/L|: it grows as the precession speeds up and is largest when the precession matches the string's own swing rate √(g/L). Run it on the string tab to see what the model does with the tilt.",
		  diff: "Both have the swing growing as the spin drops. On rising, compare the axis-angle graph of the run with the video. Changing the string length is a test: the model moves the biggest swing to a different spin.",
		  run: [["string", "mes", "MES's string, minutes"], ["string", "short", "Short string"], ["string", "nofric", "Spin stays put"]] },
		{ t: "Laithwaite: a precessing gyroscope seems weightless", who: "Eric Laithwaite (Royal Institution, 1974)",
		  obs: "Laithwaite lifted a heavy spinning gyroscope on a rod at arm's length with ease and said a precessing gyroscope behaves as if it had no weight or inertia in precession.",
		  std: "The model says the support still carries the full weight at all times (the vertical force on the pivot equals m·g in steady precession), but no torque is needed to hold the axis up, because the torque from the weight only turns it round. That is why it feels light to lift: the hand need not resist the twisting.",
		  diff: "The model and Laithwaite agree on what is felt as a twist; they differ on the weight. A bathroom scale under a precessing gyroscope's stand (the model says: no change in average reading) would settle it.",
		  run: [["pivot", "steady", "Smooth precession"], ["pivot", "push", "Hurry it: it rises"]] }
	];
	function paintExps() {
		var box = $("gy-exps"); if (box.childElementCount) return;
		box.innerHTML = EXPS.map(function (e, i) {
			return '<article class="gy-exp"><h3>' + esc(e.t) + '</h3><p class="gy-who">' + esc(e.who) + '</p><div class="gy-cols">' +
				'<div class="gy-col gy-col--obs"><h4>Reported observation</h4><p>' + esc(e.obs) + '</p></div>' +
				'<div class="gy-col gy-col--std"><h4>Textbook prediction</h4><p>' + esc(e.std) + '</p></div></div>' +
				'<div class="gy-diff"><h4>Agree or differ?</h4><p>' + esc(e.diff) + '</p></div>' +
				'<div class="gy-runs">' + e.run.map(function (r) { return '<button type="button" class="tu-btn tu-btn--ghost" data-tab="' + r[0] + '" data-p="' + r[1] + '">▶ ' + esc(r[2]) + "</button>"; }).join("") + "</div></article>";
		}).join("");
		Array.prototype.forEach.call(box.querySelectorAll("button[data-p]"), function (b) { b.onclick = function () { var t = b.getAttribute("data-tab"); showTab(t); applyPreset(t, b.getAttribute("data-p")); root.scrollIntoView({ behavior: "smooth", block: "start" }); }; });
		box.insertAdjacentHTML("beforeend", '<p class="tu-note gy-note">Applications in the article (torque over-unity, inertial propulsion, free energy) are not modelled here: the simulator follows Newton\'s laws, which keep momentum and energy constant by construction, so it cannot test them either way.</p>');
	}
	function drawIceChart() {
		var A = prep("gy-ic-stage", "gy-ic", function (w) { return clamp(w * 0.5, 220, 340); }), c = A.c, W = A.W, Hh = A.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		var b = M.body("gyro"), p = { m: b.m, I3: b.I3, l: b.l, mb: 1.5, mus: 0.03 }, r0 = { x: 56, y: 26, w: W - 70, h: Hh - 58 };
		var lx0 = Math.log10(200), lx1 = Math.log10(20000), ly0 = -5, ly1 = 1;
		var X = function (rpm) { return r0.x + (Math.log10(rpm) - lx0) / (lx1 - lx0) * r0.w; }, Y = function (F) { return r0.y + r0.h - (Math.log10(F) - ly0) / (ly1 - ly0) * r0.h; };
		c.font = "11px system-ui,sans-serif";
		for (var e = ly0; e <= ly1; e++) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r0.x, Y(Math.pow(10, e))); c.lineTo(r0.x + r0.w, Y(Math.pow(10, e))); c.stroke(); txt(c, e >= 0 ? Math.pow(10, e) + " N" : (e >= -3 ? Math.pow(10, e + 3) + " mN" : Math.pow(10, e + 6) + " µN"), r0.x - 4, Y(Math.pow(10, e)), { al: "right", bl: "middle", col: COL.dim }); }
		[200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (r) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(X(r), r0.y); c.lineTo(X(r), r0.y + r0.h); c.stroke(); txt(c, r >= 1000 ? r / 1000 + "k" : String(r), X(r), r0.y + r0.h + 4, { al: "center", bl: "top", col: COL.dim }); });
		txt(c, "Spin (rpm)", r0.x + r0.w, Hh - 6, { al: "right", col: COL.dim });
		txt(c, "Toy gyroscope (" + Math.round(b.m * 1000) + " g) on a 1.5 kg block: sideways force needed vs the ice's grip", 8, 15, { b: true, col: COL.dim });
		c.strokeStyle = COL.a; c.lineWidth = 2; c.beginPath(); for (var i = 0; i <= 200; i++) { var rp = Math.pow(10, lx0 + (lx1 - lx0) * i / 200), F = M.iceForce(p, M.radps(rp)); if (i) c.lineTo(X(rp), Y(F)); else c.moveTo(X(rp), Y(F)); } c.stroke();
		var lines = [[0.01, "#7ee2a8"], [0.03, "#4cc9f0"], [0.1, "#c4a7ff"]], note = [];
		lines.forEach(function (L) { var grip = L[0] * (p.mb + p.m) * M.G, wc = M.rpm(M.iceCriticalSpin(Object.assign({}, p, { mus: L[0] }))); c.strokeStyle = L[1]; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(r0.x, Y(grip)); c.lineTo(r0.x + r0.w, Y(grip)); c.stroke(); c.setLineDash([]); txt(c, "grip μ=" + L[0], r0.x + r0.w - 2, Y(grip) - 4, { al: "right", col: L[1] }); if (wc > 200 && wc < 20000) { c.fillStyle = L[1]; c.beginPath(); c.arc(X(wc), Y(grip), 4, 0, TAU); c.fill(); } note.push("μ " + L[0] + ": " + Math.round(wc) + " rpm"); });
		txt(c, "force needed = m·l·Ω²", X(260), Y(M.iceForce(p, M.radps(260))) + 14, { col: COL.a });
		$("gy-icnote").textContent = "Textbook critical spins (block stays still above them): " + note.join(" · ") + ". On frictionless ice the block would circle with radius " + fx(M.iceCircle(p) * 1000, 1) + " mm at any spin.";
	}

	/* ---------------- calculator ---------------- */
	function calc() {
		function v(id) { var x = parseFloat($(id).value); return isFinite(x) ? x : NaN; }
		var m = v("gc-m"), l = v("gc-l") / 100, I3 = Number($("gc-shape").value) * v("gc-rm") * Math.pow(v("gc-rr") / 100, 2), I1 = v("gc-i1"), w = M.radps(v("gc-rpm")), th = v("gc-tilt") * D;
		var b = { m: m, l: l, I1: I1, I3: I3 }, sp = M.steadyPrecession(b, w, th), p = { m: m, l: l, I3: I3, mb: v("gc-mb"), mus: v("gc-mu") };
		var it = [
			{ l: "Spin moment of inertia I₃", v: sci(I3) + " kg·m²" },
			{ l: "Angular momentum L = I₃ω", v: sci(I3 * w) + " kg·m²/s" },
			{ l: "Gravity torque at this tilt", v: sci(m * M.G * l * Math.sin(th)) + " N·m" },
			{ l: "Precession (slow, exact)", v: sp.ok ? fx(sp.slow, 4) + " rad/s" : "no steady precession", s: sp.ok ? turnTime(sp.slow) : "spin too slow for this tilt" },
			{ l: "Precession m·g·l / L", v: fx(M.fastTopPrecession(b, w), 4) + " rad/s" },
			{ l: "Fast precession root", v: sp.ok && isFinite(sp.fast) ? fx(sp.fast, 2) + " rad/s" : "–" },
			{ l: "Nutation rate", v: fx(M.nutationRate(b, w) / TAU, 2) + " per second" },
			{ l: "Nutation dip if let go", v: fx(M.nutationDip(b, w, th) / D, 3) + "°" },
			{ l: "Sleeping speed (upright)", v: l > 0 ? Math.round(M.rpm(M.sleepSpin(b))).toLocaleString("en-US") + " rpm" : "–" },
			{ l: "Ice: sideways force needed", v: fx(M.iceForce(p, w, th) * 1000, 2) + " mN" },
			{ l: "Ice: grip", v: fx(p.mus * (p.mb + m) * M.G * 1000, 1) + " mN" },
			{ l: "Ice: block slides below", v: isFinite(M.iceCriticalSpin(p, th)) ? Math.round(M.rpm(M.iceCriticalSpin(p, th))).toLocaleString("en-US") + " rpm" : "always moves" },
			{ l: "Frictionless ice: block circle", v: fx(M.iceCircle(p, th) * 1000, 2) + " mm radius" }
		];
		$("gc-out").innerHTML = it.map(function (x) { return '<div class="gy-ro"><span>' + esc(x.l) + "</span><b>" + esc(x.v) + "</b>" + (x.s ? "<small>" + esc(x.s) + "</small>" : "") + "</div>"; }).join("");
	}
	Array.prototype.forEach.call(panels.calc.querySelectorAll("input,select"), function (el) { el.addEventListener("input", calc); });

	/* ---------------- start ---------------- */
	if (qs.get("p") && M.PRESETS[S.tab]) { var pre = qs.get("p"); showTab(S.tab, true); applyPreset(S.tab, pre); } else showTab(S.tab, true);
	legend(); requestAnimationFrame(frame);
	function startView() {
		loadThree().then(function (THREE) { view = makeView(THREE); if (!view) throw new Error("no WebGL"); view.build(); fitStage(); })
			.catch(function () { view = { failed: true, build: function () {}, update: function () {}, render: function () {}, toggles: function () {} }; var m = $("gy-msg"); m.hidden = false; m.textContent = "The 3D view could not load (no WebGL or no connection). The simulation, numbers and graphs below still run."; });
	}
	if (document.readyState === "complete") startView(); else window.addEventListener("load", startView);
	window.MESGyroDebug = { sim: function () { return sim; }, step: function (s) { stepSim(s); readouts(); drawGraphs(); if (view) { view.update(0.02); view.render(); } }, H: function () { return H; }, preset: applyPreset, tab: showTab };
})();
