/* Double pendulum maths (pure; node: require('./tool_apps_src/double-pendulum/lib.js')).
   Angles are measured from straight down, y is up. State = [theta1, theta2, omega1, omega2]. Fixed-step RK4. */
(function (root) {
	"use strict";
	var PI = Math.PI;
	function params(o) { o = o || {}; return { m1: o.m1 || 1, m2: o.m2 || 1, l1: o.l1 || 1, l2: o.l2 || 1, g: o.g == null ? 9.81 : o.g, c: o.c || 0 }; }
	var A1 = 0, A2 = 0; /* scratch results of acc() */
	function acc(t1, t2, w1, w2, P) {
		var d = t1 - t2, s = Math.sin(d), c = Math.cos(d), den = 2 * P.m1 + P.m2 - P.m2 * Math.cos(2 * d), M = P.m1 + P.m2;
		A1 = (-P.g * (2 * P.m1 + P.m2) * Math.sin(t1) - P.m2 * P.g * Math.sin(t1 - 2 * t2) - 2 * s * P.m2 * (w2 * w2 * P.l2 + w1 * w1 * P.l1 * c)) / (P.l1 * den) - P.c * w1;
		A2 = (2 * s * (w1 * w1 * P.l1 * M + P.g * M * Math.cos(t1) + w2 * w2 * P.l2 * P.m2 * c)) / (P.l2 * den) - P.c * w2;
	}
	/* one RK4 step of size h on the state s (array of 4), in place */
	function step(s, P, h) {
		var t1 = s[0], t2 = s[1], w1 = s[2], w2 = s[3], k1a, k1b, k2a, k2b, k3a, k3b, k4a, k4b, h2 = h / 2;
		acc(t1, t2, w1, w2, P); k1a = A1; k1b = A2;
		acc(t1 + h2 * w1, t2 + h2 * w2, w1 + h2 * k1a, w2 + h2 * k1b, P); k2a = A1; k2b = A2;
		acc(t1 + h2 * (w1 + h2 * k1a), t2 + h2 * (w2 + h2 * k1b), w1 + h2 * k2a, w2 + h2 * k2b, P); k3a = A1; k3b = A2;
		acc(t1 + h * (w1 + h2 * k2a), t2 + h * (w2 + h2 * k2b), w1 + h * k3a, w2 + h * k3b, P); k4a = A1; k4b = A2;
		var d1 = w1, d2 = w1 + h2 * k1a, d3 = w1 + h2 * k2a, d4 = w1 + h * k3a, e1 = w2, e2 = w2 + h2 * k1b, e3 = w2 + h2 * k2b, e4 = w2 + h * k3b;
		s[0] = t1 + (h / 6) * (d1 + 2 * d2 + 2 * d3 + d4); s[1] = t2 + (h / 6) * (e1 + 2 * e2 + 2 * e3 + e4);
		s[2] = w1 + (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a); s[3] = w2 + (h / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
	}
	function energy(s, P) {
		var t1 = s[0], t2 = s[1], w1 = s[2], w2 = s[3];
		var T = 0.5 * (P.m1 + P.m2) * P.l1 * P.l1 * w1 * w1 + 0.5 * P.m2 * P.l2 * P.l2 * w2 * w2 + P.m2 * P.l1 * P.l2 * w1 * w2 * Math.cos(t1 - t2);
		var V = -(P.m1 + P.m2) * P.g * P.l1 * Math.cos(t1) - P.m2 * P.g * P.l2 * Math.cos(t2);
		return { T: T, V: V, E: T + V };
	}
	function positions(s, P) { var x1 = P.l1 * Math.sin(s[0]), y1 = -P.l1 * Math.cos(s[0]); return { x1: x1, y1: y1, x2: x1 + P.l2 * Math.sin(s[1]), y2: y1 - P.l2 * Math.cos(s[1]) }; }
	function speed2(s, P) { var vx1 = P.l1 * s[2] * Math.cos(s[0]), vy1 = P.l1 * s[2] * Math.sin(s[0]), vx2 = vx1 + P.l2 * s[3] * Math.cos(s[1]), vy2 = vy1 + P.l2 * s[3] * Math.sin(s[1]); return Math.sqrt(vx2 * vx2 + vy2 * vy2); }
	/* the energy a pendulum released at rest must have to be able to turn the outer bob over the top at all (lowest possible potential with theta2 = pi) */
	function flipEnergy(P) { return -(P.m1 + P.m2) * P.g * P.l1 + P.m2 * P.g * P.l2; }
	function canFlip(t1, t2, P) { return energy([t1, t2, 0, 0], P).V >= flipEnergy(P) - 1e-12; }
	/* time at which the outer bob first passes the top (|theta2| >= pi), starting at rest; Infinity if it does not within tmax */
	function flipTime(t1, t2, P, tmax, h) {
		if (!canFlip(t1, t2, P)) return Infinity;
		var s = [t1, t2, 0, 0], n = Math.ceil(tmax / h), i, prev;
		for (i = 1; i <= n; i++) {
			prev = Math.abs(s[1]); step(s, P, h);
			if (Math.abs(s[1]) >= PI) { return (i - 1 + (PI - prev) / Math.max(1e-12, Math.abs(s[1]) - prev)) * h; }
			if (s[1] !== s[1]) return Infinity;
		}
		return Infinity;
	}
	/* small-oscillation normal modes: m1 l1 l2 w^4 - g (m1+m2)(l1+l2) w^2 + g^2 (m1+m2) = 0 (no damping) */
	function normalModes(P) {
		var a = P.m1 * P.l1 * P.l2, b = -P.g * (P.m1 + P.m2) * (P.l1 + P.l2), c = P.g * P.g * (P.m1 + P.m2), D = Math.sqrt(Math.max(0, b * b - 4 * a * c));
		var w2lo = (-b - D) / (2 * a), w2hi = (-b + D) / (2 * a), out = [];
		[w2lo, w2hi].forEach(function (w2) {
			var w = Math.sqrt(w2); /* ratio theta2/theta1 from the first equation of motion */
			var ratio = ((P.m1 + P.m2) * P.l1 * w2 - (P.m1 + P.m2) * P.g) / (-P.m2 * P.l2 * w2);
			out.push({ omega: w, period: 2 * PI / w, ratio: ratio });
		});
		return out;
	}
	var PRESETS = [
		{ id: "gentle", name: "Gentle swing", a1: 20, a2: 10, note: "Small angles: the two arms swing in a regular, repeating pattern that is easy to predict (two normal modes at once)." },
		{ id: "mode1", name: "Slow mode (in step)", a1: 10, a2: 14.7, note: "Started on the slow normal mode: both arms swing together and the motion is perfectly periodic.", mode: 0 },
		{ id: "mode2", name: "Fast mode (opposite)", a1: 10, a2: -23.7, note: "Started on the fast normal mode: the arms swing against each other, again perfectly periodic.", mode: 1 },
		{ id: "chaos", name: "Chaotic", a1: 140, a2: 110, note: "Large angles: wild, unpredictable motion. Turn on the copies below to see tiny differences blow up." },
		{ id: "horizontal", name: "Both horizontal", a1: 90, a2: 90, note: "The classic release from rest with both arms level." },
		{ id: "flip", name: "Flip!", a1: 160, a2: 120, note: "Started high: the outer arm flips over the top after about a second and a half." },
		{ id: "up", name: "Balanced upright", a1: 179.9, a2: 179.9, note: "Both arms almost exactly upright: an unstable balance that collapses after a moment. The copies show it is the tiniest push that decides how." }
	];
	var api = { params: params, step: step, acc: function (t1, t2, w1, w2, P) { acc(t1, t2, w1, w2, P); return [A1, A2]; }, energy: energy, positions: positions, speed2: speed2, flipTime: flipTime, canFlip: canFlip, flipEnergy: flipEnergy, normalModes: normalModes, PRESETS: PRESETS };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESPend = api;
})(typeof window !== "undefined" ? window : this);
