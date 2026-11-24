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
		]
	};

	var api = {
		G: G, TAU: TAU, DEG: DEG, BODIES: BODIES, PRESETS: PRESETS, body: body,
		v: { add: add, sub: sub, mul: mul, dot: dot, cross: cross, norm: norm, unit: unit }, qmul: qmul, qaxis: qaxis, qnorm: qnorm, rot: rot, rotInv: rotInv, qTilt: qTilt, e3of: e3of, tiltOf: tiltOf, aziOf: aziOf,
		I1p: I1p, steadyPrecession: steadyPrecession, fastTopPrecession: fastTopPrecession, nutationRate: nutationRate, nutationDip: nutationDip, sleepSpin: sleepSpin, rpm: rpm, radps: radps,
		pivotState: pivotState, pivotStep: pivotStep, pivotInfo: pivotInfo, pivotDeriv: pivotDeriv,
		floorState: floorState, floorStep: floorStep, floorInfo: floorInfo, floorDeriv: floorDeriv,
		iceState: iceState, iceStep: iceStep, iceCOM: iceCOM, iceEnergy: iceEnergy, iceForce: iceForce, iceCriticalSpin: iceCriticalSpin, iceCircle: iceCircle, iceMass: iceMass
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESGyro = api;
})(this);
