/* MES Spin-1/2 Lab -- pure maths (no DOM). Browser global `MESHalf`; node: require('./tool_apps_src/spin-half/lib.js');
 * tests: node tool_apps_src/spin-half-tests.js
 * Quaternions are arrays [w, x, y, z]; a rotation by angle a about the unit axis n is q = [cos a/2, sin a/2 n].
 * q1 * q2 means "do q2 first, then q1". Angles in radians.
 *
 * The belt (Dirac plate) trick. A ball sits at r = 0, a far wall at r = 1; every spherical shell at radius r is turned by a rotation F(r).
 * F(1) must be the identity (the wall is fixed) and F(0) is the ball's rotation. Three families are used:
 *   twist      F(r, th) = R_n(th (1 - r))                        the naive picture: the ribbons just wind up
 *   untangle   G(r, s)  = R_m(s)(2 pi (1 - r)) R_n(2 pi (1 - r))  s = 0 is the twist at 720 deg, s = 1 is every shell back home,
 *                                                                  and the ball (r = 0) stays put the whole time: R_m(2 pi) R_n(2 pi) = (-1)(-1) = 1
 *   antitwist  A(r, th) = R_m(r)(th / 2) R_n(th / 2)              the ball turns for ever and the ribbons never tangle (period 720 deg)
 * where m(x) = cos(pi x) n + sin(pi x) p swings the axis from n to -n through a perpendicular p.
 * Lifting a family to quaternions continuously from q = +1 at the wall gives the ball q = cos(th/2) + sin(th/2) n: -1 after 360 deg (cannot be undone
 * without turning the ball), +1 after 720 deg (can). */
(function (root) {
	"use strict";
	var PI = Math.PI, TAU = 2 * PI;

	/* ---------- vectors ---------- */
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function len(a) { return Math.sqrt(dot(a, a)); }
	function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
	function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
	function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
	/* a unit vector perpendicular to n (the same choice every time, so the families are smooth) */
	function perp(n) { n = norm(n); var t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; var p = cross(n, t); p = norm(p); return cross(p, n); }

	/* ---------- quaternions ---------- */
	function qmul(a, b) {
		return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
			a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
			a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
			a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
	}
	function qconj(q) { return [q[0], -q[1], -q[2], -q[3]]; }
	function qdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; }
	function qneg(q) { return [-q[0], -q[1], -q[2], -q[3]]; }
	function qaxis(n, a) { n = norm(n); var s = Math.sin(a / 2); return [Math.cos(a / 2), n[0] * s, n[1] * s, n[2] * s]; }
	function qrot(q, v) { var r = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q)); return [r[1], r[2], r[3]]; }
	function qToMat(q) {
		var w = q[0], x = q[1], y = q[2], z = q[3];
		return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
			[2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
			[2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
	}
	/* rotation matrix -> one of the two quaternions (the sign is lost: SO(3) cannot tell q from -q) */
	function matToQ(m) {
		var t = m[0][0] + m[1][1] + m[2][2], w, x, y, z, s;
		if (t > 0) { s = Math.sqrt(t + 1) * 2; w = 0.25 * s; x = (m[2][1] - m[1][2]) / s; y = (m[0][2] - m[2][0]) / s; z = (m[1][0] - m[0][1]) / s; }
		else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; w = (m[2][1] - m[1][2]) / s; x = 0.25 * s; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s; }
		else if (m[1][1] > m[2][2]) { s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = 0.25 * s; z = (m[1][2] + m[2][1]) / s; }
		else { s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = 0.25 * s; }
		var l = Math.sqrt(w * w + x * x + y * y + z * z); return [w / l, x / l, y / l, z / l];
	}
	/* the rotation angle (0..pi) between two orientations, from the quaternion or the matrix */
	function qangle(a, b) { return 2 * Math.acos(Math.min(1, Math.abs(qdot(a, b)))); }
	function matDist(a, b) { var s = 0; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) s += Math.pow(a[i][j] - b[i][j], 2); return Math.sqrt(s); }

	/* ---------- the belt trick families ---------- */
	function axisM(x, n, p) { return add(scale(n, Math.cos(PI * x)), scale(p, Math.sin(PI * x))); }
	function twist(r, th, n) { return qaxis(n, th * (1 - r)); }
	function untangle(r, s, n, p, half) { var k = half ? PI : TAU; /* half = an attempt at 360 deg: then the ball cannot stay put */
		return qmul(qaxis(axisM(s, n, p), k * (1 - r)), qaxis(n, k * (1 - r))); }
	function antitwist(r, th, n, p) { return qmul(qaxis(axisM(r, n, p), th / 2), qaxis(n, th / 2)); }
	/* the shell rotation for a belt state {mode: 'twist'|'untangle'|'anti', th, s, half} */
	function belt(r, st, n, p) {
		p = p || perp(n);
		if (st.mode === "anti") return antitwist(r, st.th, n, p);
		if (st.mode === "untangle") return untangle(r, st.s, n, p, st.half);
		return twist(r, st.th, n);
	}
	/* lift a chain of rotation matrices (ordered from the wall to the ball) to quaternions, continuously, starting from +1 at the wall.
	   The last quaternion tells the class: +1 = the ribbons can be undone with the ball held still, -1 = they cannot. */
	function liftChain(mats) {
		var out = [], prev = [1, 0, 0, 0];
		for (var i = 0; i < mats.length; i++) { var q = matToQ(mats[i]); if (i === 0) { if (q[0] < 0) q = qneg(q); } else if (qdot(q, prev) < 0) q = qneg(q); out.push(q); prev = q; }
		return out;
	}
	function liftBall(st, n, steps) {
		steps = steps || 200; var p = perp(n), mats = [];
		for (var i = 0; i <= steps; i++) { var r = 1 - i / steps; mats.push(qToMat(belt(r, st, n, p))); }
		var L = liftChain(mats); return L[L.length - 1];
	}
	/* how far the shells are turned, end to end (the length of the path in rotation space), in full turns */
	function turnsStored(st, n, steps) {
		steps = steps || 200; var p = perp(n), sum = 0, prev = belt(0, st, n, p);
		for (var i = 1; i <= steps; i++) { var q = belt(i / steps, st, n, p); sum += qangle(prev, q); prev = q; }
		return sum / TAU;
	}
	/* the largest jump between neighbouring shells (to check continuity) */
	function maxJump(st, n, steps) { steps = steps || 400; var p = perp(n), m = 0, prev = belt(0, st, n, p); for (var i = 1; i <= steps; i++) { var q = belt(i / steps, st, n, p); m = Math.max(m, qangle(prev, q)); prev = q; } return m; }

	/* ribbon anchor directions (unit vectors from the ball to the wall) */
	function fib(k) { var out = [], g = PI * (3 - Math.sqrt(5)); for (var i = 0; i < k; i++) { var z = 1 - 2 * (i + 0.5) / k, r = Math.sqrt(1 - z * z), a = i * g; out.push([r * Math.cos(a), r * Math.sin(a), z]); } return out; }
	function ribbonDirs(count) {
		if (count === 1) return [[1, 0, 0]];
		if (count === 2) return [[1, 0, 0], [-1, 0, 0]];
		if (count === 4) return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
		if (count === 6) return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
		return fib(count);
	}
	/* a strand: centre line and width vector at each sample r (0 = ball surface, 1 = wall) */
	function strand(d, st, n, o) {
		o = o || {}; var K = o.steps || 40, rb = o.rBall || 1, rw = o.rWall || 4, p = perp(n), dn = dot(d, n), w = Math.abs(dn) > 0.95 ? norm(cross(d, p)) : norm([n[0] - dn * d[0], n[1] - dn * d[1], n[2] - dn * d[2]]), pts = [];
		for (var i = 0; i <= K; i++) { var r = i / K, q = belt(r, st, n, p), rho = rb + r * (rw - rb); pts.push({ r: r, c: scale(qrot(q, d), rho), w: qrot(q, w) }); }
		return pts;
	}

	/* ---------- the angle story: the core turns by th, the medium half-way out by th / 2 ---------- */
	function compare(th) { return { core: Math.cos(th), medium: Math.cos(th / 2), same: Math.abs(Math.cos(th / 2) - 1) < 1e-9 }; }
	/* five pictures of "two laps to close" */
	/* 3. a vector carried round the centre line of a Mobius band: after t laps its angle to the band's normal at the start is pi t (laps 1 -> flipped, 2 -> home) */
	function mobius(u, v, R, w) { /* u = 0..2 pi round the band, v = -1..1 across it */
		var a = u / 2, x = (R + w * v * Math.cos(a)) * Math.cos(u), y = (R + w * v * Math.cos(a)) * Math.sin(u), z = w * v * Math.sin(a); return [x, y, z]; }
	function mobiusNormal(u) { /* the across-the-band direction at u: turns by half a turn per lap */
		var a = u / 2; return [Math.cos(a) * Math.cos(u), Math.cos(a) * Math.sin(u), Math.sin(a)]; }
	/* 4. a ring of beads whose arrows turn at half the ring's speed: a bead's arrow after the ring turns by th */
	function beadArrow(phi0, th) { return (phi0 + th) / 2; }
	/* 5. an elastic medium: the rotation angle of the material at distance rho (core radius a, fixed edge at R) for a core angle th */
	function profile(rho, a, R, kind) {
		if (rho <= a) return 1; if (rho >= R) return 0;
		var x = (rho - a) / (R - a);
		if (kind === "inv2") { var f = (a * a) / (rho * rho), fe = (a * a) / (R * R); return (f - fe) / (1 - fe); } /* 1/rho^2 shifted so the edge is fixed */
		if (kind === "linear") return 1 - x;
		return 0.5 * (1 + Math.cos(PI * x)); /* smooth */
	}
	/* the normalized distance r (0 at the core, 1 at the edge) that gives a profile value f: r = 1 - f */
	/* deform a point of the medium: the shells use the untangling-ready family A(r, th) with r = 1 - profile, or the naive twist */
	function deform(P, th, n, a, R, kind, naive, p) {
		var rho = len(P), f = profile(rho, a, R, kind), r = 1 - f; p = p || perp(n);
		var q = naive ? twist(r, th, n) : antitwist(r, th, n, p);
		return qrot(q, P);
	}
	function sheetFlatness(th, n, a, R, kind, naive, N, p) { /* the largest height of a flat sheet (z = 0) after deforming, as a fraction of R */
		N = N || 40; var m = 0;
		for (var i = 0; i <= N; i++) for (var j = 0; j <= N; j++) { var x = -R + 2 * R * i / N, y = -R + 2 * R * j / N; if (x * x + y * y > R * R) continue; var Q = deform([x, y, 0], th, n, a, R, kind, naive, p); m = Math.max(m, Math.abs(Q[2])); }
		return m / R;
	}

	/* ---------- torus: core turns u, the tube turns v = k u ---------- */
	function torus(u, v, R, a) { return [(R + a * Math.cos(v)) * Math.cos(u), (R + a * Math.cos(v)) * Math.sin(u), a * Math.sin(v)]; }
	/* windings: lane = how many times round the tube while the core makes `laps` turns; the colour phase a*v - b*u is continuous on the torus
	   because a and b are whole numbers */
	var WINDINGS = { half: { name: "Spin ½: once round the tube per 2 core turns", tube: 1, laps: 2 }, one: { name: "Spin 1: once round the tube per core turn", tube: 1, laps: 1 },
		threehalf: { name: "Spin 3/2: three times round the tube per 2 core turns", tube: 3, laps: 2 } };
	function torusPhase(u, v, w) { return w.laps * v - w.tube * u; } /* constant along the marked lines v = (tube / laps) u + c */
	function torusPathV(u, w) { return u * w.tube / w.laps; }
	function closesAfter(w) { return w.laps; } /* full core turns before the marked line closes */

	/* formatting a quaternion the way the page shows it */
	function qText(q, d) { d = d == null ? 3 : d; function f(x) { var s = Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x; return (s < 0 ? "−" : "+") + Math.abs(s).toFixed(d); }
		return f(q[0]).replace(/^\+/, "") + " " + f(q[1]).replace(/^([+−])/, "$1 ") + "i " + f(q[2]).replace(/^([+−])/, "$1 ") + "j " + f(q[3]).replace(/^([+−])/, "$1 ") + "k"; }
	function wrap720(deg) { return ((deg % 720) + 720) % 720; }

	var AXES = { z: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0], tilt: norm([1, 1, 1]) };
	var api = {
		dot: dot, cross: cross, norm: norm, len: len, perp: perp, qmul: qmul, qconj: qconj, qdot: qdot, qaxis: qaxis, qrot: qrot, qToMat: qToMat, matToQ: matToQ,
		qangle: qangle, matDist: matDist, axisM: axisM, twist: twist, untangle: untangle, antitwist: antitwist, belt: belt, liftChain: liftChain, liftBall: liftBall,
		turnsStored: turnsStored, maxJump: maxJump, ribbonDirs: ribbonDirs, fib: fib, strand: strand, compare: compare, mobius: mobius, mobiusNormal: mobiusNormal,
		beadArrow: beadArrow, profile: profile, deform: deform, sheetFlatness: sheetFlatness, torus: torus, WINDINGS: WINDINGS, torusPhase: torusPhase,
		torusPathV: torusPathV, closesAfter: closesAfter, qText: qText, wrap720: wrap720, AXES: AXES
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESHalf = api;
})(this);
