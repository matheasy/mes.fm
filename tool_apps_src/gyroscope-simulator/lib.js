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
