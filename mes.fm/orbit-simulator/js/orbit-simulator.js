/* Orbit Simulator maths (pure; runs in node: require('./tool_apps_src/orbit-simulator/lib.js')).
   Newtonian N-body (O(n^2) forces, 4th-order Yoshida leapfrog with an adaptive step), orbital elements about the dominant body,
   presets in their own unit systems, and SI orbit formulas for the calculator. */
(function (root) {
	"use strict";
	var TAU = Math.PI * 2, W0 = 1.3512071919596578, W1 = -1.7024143839193153;
	var YC = [W0 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W0 / 2], YD = [W0, W1, W0];

	/* ---------- simulation ---------- */
	function Sim(G) { this.G = G; this.bodies = []; this.t = 0; this.eps2 = 0; this.collide = false; this.eta = 0.03; this.nextId = 1; this.merged = 0; }
	Sim.prototype.add = function (b) {
		b.id = this.nextId++; b.m = +b.m; b.x = +b.x; b.y = +b.y; b.vx = +b.vx || 0; b.vy = +b.vy || 0; b.ax = 0; b.ay = 0;
		if (!(b.rad > 0)) b.rad = 0; this.bodies.push(b); return b;
	};
	Sim.prototype.remove = function (id) { this.bodies = this.bodies.filter(function (b) { return b.id !== id; }); };
	Sim.prototype.accel = function () {
		var B = this.bodies, n = B.length, G = this.G, e2 = this.eps2, i, j, b, c, dx, dy, r2, f, inv;
		for (i = 0; i < n; i++) { B[i].ax = 0; B[i].ay = 0; }
		for (i = 0; i < n; i++) {
			b = B[i];
			for (j = i + 1; j < n; j++) {
				c = B[j]; dx = c.x - b.x; dy = c.y - b.y; r2 = dx * dx + dy * dy + e2; inv = 1 / (r2 * Math.sqrt(r2)); f = G * inv;
				b.ax += f * c.m * dx; b.ay += f * c.m * dy; c.ax -= f * b.m * dx; c.ay -= f * b.m * dy;
			}
		}
	};
	/* shortest dynamical time among the pairs: the step is a small fraction of it */
	Sim.prototype.timescale = function () {
		var B = this.bodies, n = B.length, G = this.G, best = Infinity, i, j, a, b, dx, dy, r2, r, dvx, dvy, v, t1, t2;
		for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
			a = B[i]; b = B[j]; dx = b.x - a.x; dy = b.y - a.y; r2 = dx * dx + dy * dy + this.eps2; r = Math.sqrt(r2);
			t1 = Math.sqrt(r2 * r / (G * (a.m + b.m)));
			dvx = b.vx - a.vx; dvy = b.vy - a.vy; v = Math.sqrt(dvx * dvx + dvy * dvy); t2 = v > 0 ? r / v : Infinity;
			if (t1 < best) best = t1; if (t2 < best) best = t2;
		}
		return best;
	};
	Sim.prototype.stepFixed = function (dt) {
		var B = this.bodies, n = B.length, k, i, b;
		for (k = 0; k < 4; k++) {
			for (i = 0; i < n; i++) { b = B[i]; b.x += YC[k] * dt * b.vx; b.y += YC[k] * dt * b.vy; }
			if (k < 3) { this.accel(); for (i = 0; i < n; i++) { b = B[i]; b.vx += YD[k] * dt * b.ax; b.vy += YD[k] * dt * b.ay; } }
		}
		this.t += dt;
		if (this.collide) this.merge();
	};
	/* advance by T (simulation time units); maxSteps bounds the work per call; returns the time actually advanced */
	Sim.prototype.advance = function (T, maxSteps) {
		var done = 0, steps = 0, ts, dt;
		maxSteps = maxSteps || 50000;
		if (this.bodies.length < 2) { this.t += T; return T; }
		while (done < T - 1e-15 && steps < maxSteps) {
			ts = this.timescale(); dt = this.eta * ts; if (!(dt > 0) || !isFinite(dt)) dt = T;
			if (dt > T - done) dt = T - done;
			this.stepFixed(dt); done += dt; steps++;
		}
		return done;
	};
	Sim.prototype.merge = function () {
		var B = this.bodies, i, j, a, b, dx, dy, M, hit = true, big, small;
		while (hit) {
			hit = false;
			for (i = 0; i < B.length && !hit; i++) for (j = i + 1; j < B.length && !hit; j++) {
				a = B[i]; b = B[j]; if (!(a.rad > 0) || !(b.rad > 0)) continue;
				dx = b.x - a.x; dy = b.y - a.y;
				if (dx * dx + dy * dy < (a.rad + b.rad) * (a.rad + b.rad)) {
					M = a.m + b.m; big = a.m >= b.m ? a : b; small = big === a ? b : a;
					big.x = (a.x * a.m + b.x * b.m) / M; big.y = (a.y * a.m + b.y * b.m) / M;
					big.vx = (a.vx * a.m + b.vx * b.m) / M; big.vy = (a.vy * a.m + b.vy * b.m) / M;
					big.rad = Math.cbrt(a.rad * a.rad * a.rad + b.rad * b.rad * b.rad); big.m = M; big.merged = true;
					B.splice(B.indexOf(small), 1); this.merged++; hit = true;
				}
			}
		}
	};
	Sim.prototype.energy = function () {
		var B = this.bodies, n = B.length, ke = 0, pe = 0, i, j, dx, dy;
		for (i = 0; i < n; i++) { ke += 0.5 * B[i].m * (B[i].vx * B[i].vx + B[i].vy * B[i].vy); for (j = i + 1; j < n; j++) { dx = B[j].x - B[i].x; dy = B[j].y - B[i].y; pe -= this.G * B[i].m * B[j].m / Math.sqrt(dx * dx + dy * dy + this.eps2); } }
		return { ke: ke, pe: pe, total: ke + pe };
	};
	Sim.prototype.angularMomentum = function () { var s = 0; this.bodies.forEach(function (b) { s += b.m * (b.x * b.vy - b.y * b.vx); }); return s; };
	Sim.prototype.momentum = function () { var px = 0, py = 0; this.bodies.forEach(function (b) { px += b.m * b.vx; py += b.m * b.vy; }); return [px, py]; };
	Sim.prototype.com = function () {
		var M = 0, x = 0, y = 0, vx = 0, vy = 0;
		this.bodies.forEach(function (b) { M += b.m; x += b.m * b.x; y += b.m * b.y; vx += b.m * b.vx; vy += b.m * b.vy; });
		return M > 0 ? { x: x / M, y: y / M, vx: vx / M, vy: vy / M, m: M } : { x: 0, y: 0, vx: 0, vy: 0, m: 0 };
	};
	/* the body that pulls hardest on b (so a moon is measured about its planet, a planet about its star) */
	Sim.prototype.primaryOf = function (b) {
		var best = null, bf = -1;
		this.bodies.forEach(function (o) { if (o === b) return; var dx = o.x - b.x, dy = o.y - b.y, f = o.m / (dx * dx + dy * dy + 1e-300); if (f > bf) { bf = f; best = o; } });
		return best;
	};
	Sim.prototype.elementsOf = function (b, p) {
		p = p || this.primaryOf(b); if (!p) return null;
		return elements(b.x - p.x, b.y - p.y, b.vx - p.vx, b.vy - p.vy, this.G * (p.m + b.m));
	};
	Sim.prototype.zeroMomentum = function () {
		var c = this.com(); this.bodies.forEach(function (b) { b.x -= c.x; b.y -= c.y; b.vx -= c.vx; b.vy -= c.vy; });
	};

	/* ---------- orbital elements from a relative state (2-body about mu = G (M + m)) ---------- */
	function elements(x, y, vx, vy, mu) {
		var r = Math.hypot(x, y), v2 = vx * vx + vy * vy, h = x * vy - y * vx, eps = v2 / 2 - mu / r, rv = x * vx + y * vy;
		var ex = ((v2 - mu / r) * x - rv * vx) / mu, ey = ((v2 - mu / r) * y - rv * vy) / mu, e = Math.hypot(ex, ey);
		var o = { r: r, v: Math.sqrt(v2), h: h, eps: eps, e: e, w: Math.atan2(ey, ex), bound: eps < 0, mu: mu, vcirc: Math.sqrt(mu / r), vesc: Math.sqrt(2 * mu / r), retro: h < 0 };
		if (eps < 0) { o.a = -mu / (2 * eps); o.T = TAU * Math.sqrt(o.a * o.a * o.a / mu); o.rp = o.a * (1 - e); o.ra = o.a * (1 + e); }
		else { o.a = eps === 0 ? Infinity : -mu / (2 * eps); o.T = Infinity; o.rp = h * h / (mu * (1 + e)); o.ra = Infinity; }
		o.nu = Math.atan2(y, x) - o.w; o.b = o.bound ? o.a * Math.sqrt(Math.max(0, 1 - e * e)) : NaN;
		return o;
	}
	/* points of the Kepler orbit with these elements, centred on the primary (for the dashed ellipse); n points, hyperbola cut at rmax */
	function orbitPath(el, n, rmax) {
		var pts = [], i, th, r, p = el.h * el.h / el.mu, sgn = el.retro ? -1 : 1, lim;
		if (!(el.e < 1)) { lim = Math.acos(Math.max(-1, Math.min(1, -(1 / el.e)))) * 0.999; if (rmax) { var c = (p / rmax - 1) / el.e; if (c > -1 && c < 1) lim = Math.min(lim, Math.acos(c)); } }
		for (i = 0; i <= n; i++) {
			th = el.e < 1 ? i / n * TAU : -lim + 2 * lim * i / n; r = p / (1 + el.e * Math.cos(th)); if (r < 0) continue;
			pts.push([r * Math.cos(el.w + sgn * th), r * Math.sin(el.w + sgn * th)]);
		}
		return pts;
	}
	function visViva(mu, r, a) { return Math.sqrt(mu * (2 / r - 1 / a)); }
	function hohmann(mu, r1, r2) {
		var at = (r1 + r2) / 2, v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2), vt1 = visViva(mu, r1, at), vt2 = visViva(mu, r2, at);
		var d1 = Math.abs(vt1 - v1), d2 = Math.abs(v2 - vt2);
		return { dv1: d1, dv2: d2, total: d1 + d2, time: Math.PI * Math.sqrt(at * at * at / mu), a: at, v1: v1, v2: v2, vt1: vt1, vt2: vt2 };
	}

	/* ---------- presets ---------- */
	var PI4 = 4 * Math.PI * Math.PI;
	function place(sim, par, name, m, a, e, phase, color, extra) {
		/* put a body on an orbit about par at its closest point, ccw (or cw with extra.retro), the closest point at angle `phase` */
		var mu = sim.G * (par.m + m), r = a * (1 - e), v = Math.sqrt(mu * (1 + e) / (a * (1 - e))), s = extra && extra.retro ? -1 : 1, c = Math.cos(phase), sn = Math.sin(phase);
		var b = { name: name, m: m, color: color, x: par.x + r * c, y: par.y + r * sn, vx: par.vx - s * v * sn, vy: par.vy + s * v * c };
		if (extra) for (var k in extra) if (k !== "retro") b[k] = extra[k];
		return sim.add(b);
	}
	var SOL = { L: "AU", T: "years", M: "solar masses", tunit: "yr", lunit: "AU", munit: "M☉", G: PI4 };
	var P = [
		{ id: "earth-sun", name: "Earth around the Sun", note: "One year, one lap. Earth's orbit is almost a circle (e = 0.017). Pause, then drag from an empty spot to launch your own planet.",
			units: SOL, speed: 0.1, width: 3.2, build: function (s) {
				var sun = s.add({ name: "Sun", m: 1, x: 0, y: 0, color: "#ffd24a", star: 1 });
				place(s, sun, "Earth", 3.003e-6, 1, 0.0167, 0, "#4a90e2"); } },
		{ id: "inner", name: "Inner planets", note: "Mercury, Venus, Earth and Mars from real orbits. Inner planets are faster: check Kepler's third law in the table (T²/a³ is the same for every planet).",
			units: SOL, speed: 0.15, width: 3.6, build: function (s) {
				var sun = s.add({ name: "Sun", m: 1, x: 0, y: 0, color: "#ffd24a", star: 1 });
				place(s, sun, "Mercury", 1.66e-7, 0.3871, 0.2056, 0.2, "#b5b5b5"); place(s, sun, "Venus", 2.447e-6, 0.7233, 0.0068, 1.9, "#e8cda0");
				place(s, sun, "Earth", 3.003e-6, 1.0, 0.0167, 3.4, "#4a90e2"); place(s, sun, "Mars", 3.227e-7, 1.5237, 0.0934, 5.0, "#d9603b"); } },
		{ id: "outer", name: "Giant planets", note: "Jupiter, Saturn, Uranus and Neptune. Neptune takes 165 years to go round once: speed the clock up.",
			units: SOL, speed: 12, width: 75, build: function (s) {
				var sun = s.add({ name: "Sun", m: 1, x: 0, y: 0, color: "#ffd24a", star: 1 });
				place(s, sun, "Jupiter", 9.546e-4, 5.2026, 0.0489, 0.4, "#d8b07a"); place(s, sun, "Saturn", 2.858e-4, 9.5549, 0.0565, 2.2, "#e6d3a0");
				place(s, sun, "Uranus", 4.366e-5, 19.2184, 0.0472, 3.9, "#7fd6e0"); place(s, sun, "Neptune", 5.151e-5, 30.11, 0.0086, 5.6, "#4a6be0"); } },
		{ id: "halley", name: "Halley's comet", note: "A very stretched orbit (e = 0.967) that runs backwards (clockwise). It races past the Sun and then crawls out beyond Neptune: equal areas in equal times.",
			units: SOL, speed: 3, width: 42, center: [-17, 0], build: function (s) {
				var sun = s.add({ name: "Sun", m: 1, x: 0, y: 0, color: "#ffd24a", star: 1 });
				place(s, sun, "Earth", 3.003e-6, 1, 0.0167, 1.2, "#4a90e2");
				place(s, sun, "Halley", 1e-16, 17.834, 0.96714, 0, "#aee8ff", { retro: true }); } },
		{ id: "trojans", name: "Jupiter's Trojans", note: "An asteroid 60° ahead of Jupiter on the same orbit stays there: one of the five Lagrange points. Follow Jupiter to see them move together.",
			units: SOL, speed: 3, width: 14, build: function (s) {
				var sun = s.add({ name: "Sun", m: 1, x: 0, y: 0, color: "#ffd24a", star: 1 });
				var j = place(s, sun, "Jupiter", 9.546e-4, 5.2026, 0, 0, "#d8b07a");
				var r = 5.2026, v = Math.sqrt(s.G * (1 + 9.546e-4) / r), ang = Math.PI / 3;
				s.add({ name: "Trojan asteroid", m: 1e-14, x: r * Math.cos(ang), y: r * Math.sin(ang), vx: -v * Math.sin(ang), vy: v * Math.cos(ang), color: "#ff8b6b" });
				s.add({ name: "Greek asteroid", m: 1e-14, x: r * Math.cos(-ang), y: r * Math.sin(-ang), vx: v * Math.sin(ang), vy: v * Math.cos(ang), color: "#9be28d" }); } },
		{ id: "earth-moon", name: "Earth and Moon", note: "Both orbit their common centre, which lies inside the Earth. The Moon takes 27.3 days. Units here: 100,000 km and days (the Earth is drawn larger than true).",
			units: { L: "100,000 km", T: "days", M: "Earth masses", tunit: "d", lunit: "×10⁵ km", munit: "M⊕", G: 2.9756 }, speed: 8, width: 11, build: function (s) {
				var e = s.add({ name: "Earth", m: 1, x: 0, y: 0, color: "#4a90e2", star: 0 });
				place(s, e, "Moon", 0.0123, 3.844, 0.0549, 0, "#cfcfcf"); } },
		{ id: "figure8", name: "Figure-eight three-body orbit", note: "Three equal masses chase each other along one figure-eight (Chenciner and Montgomery, 2000). It exists, but it is delicate: nudge a body and it falls apart.",
			units: { L: "units", T: "units", M: "units", tunit: "", lunit: "", munit: "", G: 1 }, speed: 1.2, width: 4.4, build: function (s) {
				var x = 0.97000436, y = -0.24308753, u = 0.466203685, w = 0.43236573;
				s.add({ name: "A", m: 1, x: x, y: y, vx: u, vy: w, color: "#ffb454" }); s.add({ name: "B", m: 1, x: -x, y: -y, vx: u, vy: w, color: "#7dd3fc" });
				s.add({ name: "C", m: 1, x: 0, y: 0, vx: -2 * u, vy: -2 * w, color: "#f9a8d4" }); } },
		{ id: "lagrange", name: "Three bodies in a triangle", note: "Three equal masses at the corners of a triangle that turns as a whole: Lagrange's solution of 1772. Unstable for equal masses, so tiny numerical errors slowly grow.",
			units: { L: "units", T: "units", M: "units", tunit: "", lunit: "", munit: "", G: 1 }, speed: 1.2, width: 3.4, build: function (s) {
				var R = 1, w = Math.sqrt(1 / Math.pow(Math.sqrt(3) * R, 3) * 3), cols = ["#ffb454", "#7dd3fc", "#f9a8d4"], i, a;
				for (i = 0; i < 3; i++) { a = i * TAU / 3; s.add({ name: "ABC".charAt(i), m: 1, x: R * Math.cos(a), y: R * Math.sin(a), vx: -w * R * Math.sin(a), vy: w * R * Math.cos(a), color: cols[i] }); } } },
		{ id: "pythagorean", name: "The Pythagorean problem", note: "Masses 3, 4 and 5 start at rest at the corners of a 3-4-5 right triangle. After a chaotic dance of close encounters, one is thrown out and the other two form a binary.",
			units: { L: "units", T: "units", M: "units", tunit: "", lunit: "", munit: "", G: 1 }, speed: 2, width: 9, build: function (s) {
				s.add({ name: "m = 3", m: 3, x: 1, y: 3, color: "#ffb454" }); s.add({ name: "m = 4", m: 4, x: -2, y: -1, color: "#7dd3fc" }); s.add({ name: "m = 5", m: 5, x: 1, y: -1, color: "#f9a8d4" }); s.eta = 0.012; } },
		{ id: "binary", name: "Planet around two stars", note: "Two Sun-like stars of half a solar mass circle each other while a planet orbits both from far away: a circumbinary planet, like Kepler-16b.",
			units: SOL, speed: 0.15, width: 3.6, build: function (s) {
				var d = 0.3, v = 0.5 * Math.sqrt(s.G * 1 / d);
				s.add({ name: "Star A", m: 0.5, x: d / 2, y: 0, vx: 0, vy: v, color: "#ffd24a", star: 1 }); s.add({ name: "Star B", m: 0.5, x: -d / 2, y: 0, vx: 0, vy: -v, color: "#ff9d4a", star: 1 });
				var r = 1.2, vp = Math.sqrt(s.G * 1 / r); s.add({ name: "Planet", m: 3e-6, x: r, y: 0, vx: 0, vy: vp, color: "#4a90e2" }); } },
		{ id: "slingshot", name: "Gravity assist at Jupiter", note: "A probe passes behind Jupiter and is flung out faster, by stealing a little of Jupiter's orbital energy (as Voyager 2 did). Watch its speed before and after.",
			units: SOL, speed: 0.05, width: 1.4, follow: "Jupiter", build: function (s) {
				var sun = s.add({ name: "Sun", m: 1, x: 0, y: 0, color: "#ffd24a", star: 1 });
				place(s, sun, "Jupiter", 9.546e-4, 5.2026, 0, 0, "#d8b07a");
				var r = 5.19, ph = 0.04, v = 1.565; /* tuned (see the tests): a Hohmann-like probe that Jupiter overtakes 0.03 AU from it */
				s.add({ name: "Probe", m: 1e-18, x: r * Math.cos(ph), y: r * Math.sin(ph), vx: -v * Math.sin(ph), vy: v * Math.cos(ph), color: "#ff6b9d" }); } },
		{ id: "sandbox", name: "Sandbox: just a star", note: "An empty sky with one Sun. Drag from any empty spot to launch a planet: the longer the drag, the faster it goes (a drag as long as its distance from the Sun is a circular orbit).",
			units: SOL, speed: 0.1, width: 5, build: function (s) { s.add({ name: "Sun", m: 1, x: 0, y: 0, color: "#ffd24a", star: 1 }); } }
	];
	function build(id) {
		var p = P.filter(function (q) { return q.id === id; })[0] || P[0], s = new Sim(p.units.G);
		p.build(s); if (id !== "figure8" && id !== "lagrange") s.zeroMomentum(); else s.zeroMomentum();
		return { sim: s, preset: p };
	}

	/* ---------- SI orbit formulas (calculator) ---------- */
	var G_SI = 6.6743e-11, AU = 1.495978707e11;
	var BODIES = [
		{ id: "earth", name: "Earth", M: 5.9722e24, R: 6.3781e6 }, { id: "moon", name: "Moon", M: 7.342e22, R: 1.7374e6 }, { id: "sun", name: "Sun", M: 1.98847e30, R: 6.957e8 },
		{ id: "mars", name: "Mars", M: 6.4171e23, R: 3.3895e6 }, { id: "jupiter", name: "Jupiter", M: 1.8982e27, R: 6.9911e7 }, { id: "venus", name: "Venus", M: 4.8675e24, R: 6.0518e6 },
		{ id: "mercury", name: "Mercury", M: 3.3011e23, R: 2.4397e6 }, { id: "saturn", name: "Saturn", M: 5.6834e26, R: 5.8232e7 }
	];
	function parseLen(s) {
		var m = String(s).trim().toLowerCase().replace(/,/g, "").match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(au|km|m|mi|miles?|ly|re|r_?e|rj|r_?j|rsun|r_?s)?$/);
		if (!m) return NaN; var v = parseFloat(m[1]), u = m[2] || "km", k = { au: AU, km: 1e3, m: 1, mi: 1609.344, mile: 1609.344, miles: 1609.344, ly: 9.4607e15, re: 6.3781e6, r_e: 6.3781e6, rj: 6.9911e7, r_j: 6.9911e7, rsun: 6.957e8, r_s: 6.957e8 }[u];
		return v * k;
	}
	function fmt(x, d) {
		if (!isFinite(x)) return "∞"; var a = Math.abs(x); if (a === 0) return "0"; d = d || 4;
		if (a >= 1e6 || a < 1e-3) { var e = Math.floor(Math.log10(a)), mnt = x / Math.pow(10, e); return mnt.toFixed(d - 1) + "×10" + String(e).replace(/-/g, "−").replace(/\d/g, function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]; }).replace(/^([^⁰-⁹−])/, "$1"); }
		return Number(x.toPrecision(d)).toLocaleString("en-US", { maximumFractionDigits: 6 });
	}
	function fmtTime(s) {
		if (!isFinite(s)) return "∞"; var a = Math.abs(s);
		if (a < 120) return fmt(s, 4) + " s"; if (a < 7200) return fmt(s / 60, 4) + " min"; if (a < 172800) return fmt(s / 3600, 4) + " h";
		if (a < 3.156e7 * 2) return fmt(s / 86400, 4) + " days"; return fmt(s / 3.15576e7, 4) + " years";
	}

	var api = { Sim: Sim, elements: elements, orbitPath: orbitPath, visViva: visViva, hohmann: hohmann, PRESETS: P, build: build, place: place, BODIES: BODIES, parseLen: parseLen, fmt: fmt, fmtTime: fmtTime, G_SI: G_SI, AU: AU, TAU: TAU };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESOrbit = api;
})(typeof window !== "undefined" ? window : this);

/* Orbit Simulator UI: canvas N-body sandbox (MESOrbit.Sim) + SI orbit calculator.
   State: localStorage mes-orbit-simulator:v1; share links ?p=<preset> or ?s=<base64url of the whole system>. Maths is node-tested (tool_apps_src/orbit-simulator-tests.js). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("or"); if (!root) return;
	var O = window.MESOrbit, PI = Math.PI, KEY = "mes-orbit-simulator:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var q = new URLSearchParams(location.search), saved = sget();
	var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
	var toastT;
	function toast(msg) { var t = $("or-toast"); if (!t) { t = document.createElement("div"); t.id = "or-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copyText(url, msg) { var done = function () { toast(msg || "Link copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this:", url); }); else prompt("Copy this:", url); }
	function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
	function b64d(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }
	function sig(x, d) { return O.fmt(x, d || 3); }

	/* ---------- tabs ---------- */
	var tab = /^(sim|calc)$/.test(q.get("tab") || "") ? q.get("tab") : "sim";
	function setTab(t) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (t === "sim") setTimeout(onResize, 0);
		try { var u = new URL(location.href); u.searchParams.set("tab", t); history.replaceState(null, "", u); } catch (e) {}
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* =========================== SIMULATOR =========================== */
	var cv = $("or-c"), cx = cv.getContext("2d"), stage = $("or-stage"), W = 600, H = 400, dpr = 1, aspect = 1.6;
	var sim, preset, units, startState = null;
	var view = { S: 100, px: 0, py: 0 }; /* px/py: pan offset in frame coordinates; S: pixels per world unit */
	var ui = { play: true, mult: 0, trailN: 1, trail: true, vel: false, ell: true, area: false, lab: true, merge: false, frame: "com", mass: -5.5 };
	var sel = null, trails = {}, lastRec = 0, hover = null, drag = null, ea = null, e0 = null, tick = 0, aMax = 0;
	var TRAIL_LEN = [0, 250, 900, 3500], TRAIL_NAME = ["none", "short", "medium", "long"];
	var origin = { x: 0, y: 0 };

	function loadSystem(id, custom) {
		var B = O.build(id); sim = B.sim; preset = B.preset; units = preset.units;
		if (custom) { sim.bodies = []; sim.nextId = 1; custom.forEach(function (b) { sim.add({ name: b[0], m: b[1], x: b[2], y: b[3], vx: b[4], vy: b[5], color: b[6], rad: b[7] || 0, star: b[8] ? 1 : 0 }); }); sim.t = 0; }
		sim.collide = ui.merge; assignRadii();
		sel = null; trails = {}; ea = null; hover = null; lastRec = 0;
		startState = sim.bodies.map(function (b) { return [b.name, b.m, b.x, b.y, b.vx, b.vy, b.color, b.rad, b.star]; });
		ui.frame = "com"; if (preset.follow) { var f = sim.bodies.filter(function (b) { return b.name === preset.follow; })[0]; if (f) { sel = f.id; ui.frame = "sel"; } }
		$("or-frame").value = ui.frame;
		view.px = 0; view.py = 0; fitView(preset.width); if (preset.center) { view.px = preset.center[0]; view.py = preset.center[1]; }
		e0 = sim.energy().total; aMax = 0;
		$("or-note").textContent = preset.note; massLabel(); buildTable(); updateReadouts(true);
		Array.prototype.forEach.call($("or-pre").children, function (b) { b.classList.toggle("is-on", b.dataset.id === id); });
		var t = ui.mult; setSpeedLabel(); sset({ preset: id });
	}
	/* collision radius (only used when "merge" is on): bodies touch at a few pixels' worth of the starting view */
	function assignRadii() { var w = preset.width / 120; sim.bodies.forEach(function (b) { if (!(b.rad > 0)) b.rad = w * (b.star ? 1.2 : 0.4); }); }
	function fitView(width) {
		if (!width) { var c = sim.com(), md = []; sim.bodies.forEach(function (b) { md.push(Math.hypot(b.x - c.x, b.y - c.y)); }); md.sort(function (a, b) { return a - b; }); var med = md[md.length >> 1] || 1, mx = 0; md.forEach(function (d) { if (d < 4 * med + 1e-9 && d > mx) mx = d; }); width = Math.max(mx * 2.6, 1e-9); }
		view.S = Math.min(W, H) * 1.45 / width; if (!isFinite(view.S) || view.S <= 0) view.S = 100; view.px = 0; view.py = 0;
	}
	function massUnitName() { return units.munit || ""; }
	function newMass() { var M = 0; sim.bodies.forEach(function (b) { if (b.m > M) M = b.m; }); return M * Math.pow(10, ui.mass); }
	function massLabel() {
		var m = newMass(); $("or-ms").value = ui.mass;
		var txt = sig(m, 3) + (units.munit ? " " + units.munit : "");
		if (units.munit === "M☉") { var best = null; [["Moon", 3.69e-8], ["Mercury", 1.66e-7], ["Earth", 3.003e-6], ["Neptune", 5.15e-5], ["Jupiter", 9.546e-4], ["a red dwarf", 0.2], ["the Sun", 1]].forEach(function (p) { var r = Math.abs(Math.log(m / p[1])); if (!best || r < best.r) best = { r: r, n: p[0], v: p[1] }; }); if (best && best.r < 1) txt += " (about " + (Math.abs(m / best.v - 1) < 0.2 ? "" : sig(m / best.v, 2) + "× ") + best.n + ")"; }
		$("or-ms-v").textContent = txt;
	}
	function setSpeedLabel() {
		var sp = preset.speed * Math.pow(10, ui.mult), tu = units.T === "years" ? "year" : units.T === "days" ? "day" : "time unit";
		$("or-sp").value = ui.mult; $("or-sp-v").textContent = sig(sp, 2) + " " + (sp === 1 ? tu : tu + "s") + " per second"; $("or-spd-v").textContent = sig(sp, 2) + " " + (units.tunit || "units") + "/s";
	}
	function timeText(t) {
		if (units.T === "years") return t < 1 ? sig(t * 365.25, 3) + " days" : sig(t, 4) + " years";
		if (units.T === "days") return sig(t, 4) + " days";
		return "t = " + sig(t, 4);
	}

	/* ----- coordinates ----- */
	function setOrigin() {
		if (ui.frame === "sel") { var b = byId(sel); if (b) { origin.x = b.x; origin.y = b.y; return; } }
		var c = sim.com(); origin.x = c.x; origin.y = c.y;
	}
	function byId(id) { for (var i = 0; i < sim.bodies.length; i++) if (sim.bodies[i].id === id) return sim.bodies[i]; return null; }
	function toScr(x, y) { return [W / 2 + (x - origin.x - view.px) * view.S, H / 2 - (y - origin.y - view.py) * view.S]; }
	function toWorld(sx, sy) { return [(sx - W / 2) / view.S + origin.x + view.px, -(sy - H / 2) / view.S + origin.y + view.py]; }
	function relScr(rx, ry) { return [W / 2 + (rx - view.px) * view.S, H / 2 - (ry - view.py) * view.S]; } /* relative-to-origin point */
	function bodyPx(b) { var M = 0; sim.bodies.forEach(function (o) { if (o.m > M) M = o.m; }); return 3 + 8 * Math.cbrt(b.m / M) + (b.star ? 2 : 0); }

	/* ----- sizing ----- */
	function onResize() {
		if (tab !== "sim") return;
		var wrap = stage.parentNode, w = wrap.clientWidth || 600, h = Math.round(w / aspect); wrap.setAttribute("data-mes-free", "1"); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) { var mh = window.innerHeight - 90; if (h > mh) h = mh; }
		stage.style.width = w + "px"; stage.style.height = h + "px";
		dpr = Math.min(2, window.devicePixelRatio || 1); var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
		if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		W = w; H = h; draw();
	}

	/* ----- trails ----- */
	function recordTrails() {
		if (!ui.trail || !TRAIL_LEN[ui.trailN]) return;
		setOrigin(); var cap = TRAIL_LEN[ui.trailN];
		sim.bodies.forEach(function (b) { var a = trails[b.id] || (trails[b.id] = []); a.push(b.x - origin.x, b.y - origin.y); if (a.length > cap * 2) a.splice(0, a.length - cap * 2); });
	}
	/* ----- equal-areas bookkeeping for the selected body ----- */
	function eaUpdate() {
		if (!ui.area) { ea = null; return; }
		var b = byId(sel); if (!b) { ea = null; return; } var p = sim.primaryOf(b); if (!p) return; var el = sim.elementsOf(b, p);
		if (!el.bound) { ea = null; return; }
		if (!ea || ea.id !== b.id || Math.abs(ea.e - el.e) > 0.05 * Math.max(0.05, el.e) + 0.01 || Math.abs(ea.a / el.a - 1) > 0.05) ea = { id: b.id, pid: p.id, e: el.e, a: el.a, T: el.T, dt: el.T / 12, t0: sim.t, cur: [], sectors: [] };
		var rx = b.x - p.x, ry = b.y - p.y; ea.cur.push([rx, ry]);
		if (sim.t - ea.t0 >= ea.dt) { ea.cur.push([rx, ry]); var A = 0, pts = ea.cur; for (var i = 1; i < pts.length; i++) A += 0.5 * (pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1]); ea.sectors.push({ pts: pts, A: Math.abs(A), t: sim.t }); if (ea.sectors.length > 12) ea.sectors.shift(); ea.cur = [[rx, ry]]; ea.t0 = sim.t; }
	}

	/* ----- animation loop ----- */
	var last = 0, running = false;
	function frame(now) {
		requestAnimationFrame(frame);
		if (document.hidden || tab !== "sim") { last = now; return; }
		var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
		if (ui.play && !drag) {
			var T = preset.speed * Math.pow(10, ui.mult) * dt;
			if (T > 0 && sim.bodies.length > 1) {
				var ts = sim.timescale(), nsub = Math.max(1, Math.min(120, Math.ceil(T / (0.12 * ts)))), per = T / nsub, t0 = performance.now(), i;
				for (i = 0; i < nsub; i++) { sim.advance(per, 20000); if (ui.area) eaUpdate(); recordTrails(); if (performance.now() - t0 > 14) break; }
			} else sim.t += T;
			if (sel && !byId(sel)) sel = null;
		}
		setOrigin(); draw();
		if (++tick % 12 === 0) updateReadouts();
	}

	/* ----- drawing ----- */
	function arrow(x0, y0, x1, y1, col, wd) {
		cx.strokeStyle = col; cx.fillStyle = col; cx.lineWidth = wd || 2; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
		var a = Math.atan2(y1 - y0, x1 - x0), h = 8; cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4)); cx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4)); cx.closePath(); cx.fill();
	}
	function pathRel(pts, ox, oy) { /* ox,oy: where the relative origin sits in world coords */
		cx.beginPath(); for (var i = 0; i < pts.length; i++) { var s = toScr(ox + pts[i][0], oy + pts[i][1]); if (i) cx.lineTo(s[0], s[1]); else cx.moveTo(s[0], s[1]); }
	}
	function draw() {
		cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		/* faint stars so that motion of the camera reads */
		if (!draw.stars) { draw.stars = []; var sd = 7; for (var i = 0; i < 90; i++) { sd = (sd * 16807) % 2147483647; var a = sd / 2147483647; sd = (sd * 16807) % 2147483647; draw.stars.push([a, sd / 2147483647, 0.3 + (i % 3) * 0.2]); } }
		cx.fillStyle = "rgba(200,215,255,0.5)"; draw.stars.forEach(function (s) { cx.globalAlpha = s[2]; cx.fillRect(s[0] * W, s[1] * H, 1.2, 1.2); }); cx.globalAlpha = 1;
		var B = sim.bodies, selB = byId(sel), i, k;
		/* equal-area slices */
		if (ui.area && ea && selB) { var pr = byId(ea.pid); if (pr) { ea.sectors.forEach(function (s, idx) { cx.beginPath(); var p0 = toScr(pr.x, pr.y); cx.moveTo(p0[0], p0[1]); s.pts.forEach(function (p) { var sc = toScr(pr.x + p[0], pr.y + p[1]); cx.lineTo(sc[0], sc[1]); }); cx.closePath(); cx.fillStyle = idx % 2 ? "rgba(255,180,84,0.26)" : "rgba(125,211,252,0.26)"; cx.fill(); cx.strokeStyle = "rgba(255,255,255,0.35)"; cx.lineWidth = 1; cx.stroke(); });
			if (ea.cur.length > 1) { cx.beginPath(); var q0 = toScr(pr.x, pr.y); cx.moveTo(q0[0], q0[1]); ea.cur.forEach(function (p) { var sc = toScr(pr.x + p[0], pr.y + p[1]); cx.lineTo(sc[0], sc[1]); }); cx.closePath(); cx.fillStyle = "rgba(255,255,255,0.10)"; cx.fill(); } } }
		/* osculating orbit of the selected body */
		if (ui.ell && selB) { var pb = sim.primaryOf(selB); if (pb) { var el = sim.elementsOf(selB, pb); var pts = O.orbitPath(el, 180, Math.max(W, H) / view.S * 3); cx.setLineDash([6, 5]); cx.strokeStyle = "rgba(255,255,255,0.55)"; cx.lineWidth = 1.3; pathRel(pts, pb.x, pb.y); cx.stroke(); cx.setLineDash([]);
			var pp = toScr(pb.x + el.rp * Math.cos(el.w), pb.y + el.rp * Math.sin(el.w)); cx.fillStyle = "#7dd3fc"; cx.beginPath(); cx.arc(pp[0], pp[1], 3.2, 0, 7); cx.fill();
			if (el.bound) { var ap = toScr(pb.x - el.ra * Math.cos(el.w), pb.y - el.ra * Math.sin(el.w)); cx.fillStyle = "#ffb454"; cx.beginPath(); cx.arc(ap[0], ap[1], 3.2, 0, 7); cx.fill(); } } }
		/* trails */
		if (ui.trail && TRAIL_LEN[ui.trailN]) B.forEach(function (b) {
			var a = trails[b.id]; if (!a || a.length < 4) return; var n = a.length / 2, ch = 6, step = Math.ceil(n / ch), s0;
			cx.lineWidth = b.id === sel ? 2 : 1.4; cx.strokeStyle = b.color || "#fff";
			for (var c = 0; c < ch; c++) { var from = c * step, to = Math.min(n - 1, (c + 1) * step); if (from >= to) continue; cx.globalAlpha = 0.12 + 0.88 * (c + 1) / ch; cx.beginPath(); for (var j = from; j <= to; j++) { s0 = relScr(a[2 * j], a[2 * j + 1]); if (j === from) cx.moveTo(s0[0], s0[1]); else cx.lineTo(s0[0], s0[1]); } if (c === ch - 1) { var cs = toScr(b.x, b.y); cx.lineTo(cs[0], cs[1]); } cx.stroke(); }
			cx.globalAlpha = 1;
		});
		/* bodies */
		var vmax = 0; B.forEach(function (b) { var v = Math.hypot(b.vx - (ui.frame === "sel" && selB ? selB.vx : 0), b.vy - (ui.frame === "sel" && selB ? selB.vy : 0)); if (v > vmax) vmax = v; });
		B.slice().sort(function (a, b) { return a.m - b.m; }).forEach(function (b) {
			var s = toScr(b.x, b.y), r = bodyPx(b); if (s[0] < -50 || s[0] > W + 50 || s[1] < -50 || s[1] > H + 50) return;
			if (b.star) { var g = cx.createRadialGradient(s[0], s[1], r * 0.4, s[0], s[1], r * 3.2); g.addColorStop(0, "rgba(255,210,74,0.55)"); g.addColorStop(1, "rgba(255,210,74,0)"); cx.fillStyle = g; cx.beginPath(); cx.arc(s[0], s[1], r * 3.2, 0, 7); cx.fill(); }
			cx.fillStyle = b.color || "#fff"; cx.beginPath(); cx.arc(s[0], s[1], r, 0, 7); cx.fill();
			if (b.id === sel) { cx.strokeStyle = "#fff"; cx.lineWidth = 1.6; cx.beginPath(); cx.arc(s[0], s[1], r + 5, 0, 7); cx.stroke(); }
			else if (hover === b.id) { cx.strokeStyle = "rgba(255,255,255,0.6)"; cx.lineWidth = 1; cx.beginPath(); cx.arc(s[0], s[1], r + 4, 0, 7); cx.stroke(); }
			if (ui.vel && vmax > 0) { var vx = b.vx - (ui.frame === "sel" && selB ? selB.vx : 0), vy = b.vy - (ui.frame === "sel" && selB ? selB.vy : 0), L = 60 * Math.hypot(vx, vy) / vmax; if (L > 3) arrow(s[0], s[1], s[0] + vx / Math.hypot(vx, vy) * L, s[1] - vy / Math.hypot(vx, vy) * L, "rgba(125,211,252,0.95)", 1.6); }
			if (ui.lab && (b.id === sel || B.length < 9 || b.m > 1e-3)) { cx.fillStyle = "rgba(232,236,245,0.85)"; cx.font = "12px sans-serif"; cx.fillText(b.name, s[0] + r + 4, s[1] - r - 2); }
		});
		/* launch preview */
		if (drag && drag.kind === "launch" && drag.cur) {
			var p0 = toScr(drag.w0[0], drag.w0[1]), p1 = [drag.cur[0], drag.cur[1]]; var lv = launchVel(drag);
			cx.fillStyle = "#ff6b9d"; cx.beginPath(); cx.arc(p0[0], p0[1], 5, 0, 7); cx.fill(); arrow(p0[0], p0[1], p1[0], p1[1], "#ff6b9d", 2);
			if (lv) { var pts2 = O.orbitPath(lv.el, 160, Math.max(W, H) / view.S * 3); cx.setLineDash([4, 4]); cx.strokeStyle = "rgba(255,107,157,0.8)"; cx.lineWidth = 1.3; pathRel(pts2, lv.p.x, lv.p.y); cx.stroke(); cx.setLineDash([]);
				cx.fillStyle = "rgba(255,255,255,0.9)"; cx.font = "12px sans-serif"; var t1 = lv.k.toFixed(2) + "× circular speed · " + (lv.el.bound ? "e = " + lv.el.e.toFixed(2) + ", period " + O.fmt(lv.el.T, 3) + " " + (units.tunit || "") : "escapes (unbound)"); cx.fillText(t1, Math.min(W - 260, Math.max(8, p0[0] + 10)), Math.max(16, p0[1] - 12)); }
		}
		$("or-badge").textContent = drag ? "" : (B.length ? (hover ? "Drag to move · click to select" : "Drag from an empty spot to launch a planet") : "Empty. Pick a system below");
	}

	/* ----- launching ----- */
	function launchVel(d) {
		var w0 = d.w0, w1 = toWorld(d.cur[0], d.cur[1]), M = 0, p = null, bf = -1;
		sim.bodies.forEach(function (o) { var dx = o.x - w0[0], dy = o.y - w0[1], f = o.m / (dx * dx + dy * dy + 1e-300); if (f > bf) { bf = f; p = o; } }); if (!p) return null;
		var r = Math.hypot(w0[0] - p.x, w0[1] - p.y); if (r < 1e-12) return null;
		var vc = Math.sqrt(sim.G * (p.m + newMass()) / r), dx = w1[0] - w0[0], dy = w1[1] - w0[1], vx = dx / r * vc, vy = dy / r * vc;
		var el = O.elements(w0[0] - p.x, w0[1] - p.y, vx, vy, sim.G * (p.m + newMass()));
		return { vx: vx + p.vx, vy: vy + p.vy, p: p, el: el, k: Math.hypot(vx, vy) / vc };
	}
	var NAMES = ["Planet", "Comet", "Moon", "Probe", "Asteroid"], PCOL = ["#4a90e2", "#e8cda0", "#d9603b", "#7fd6e0", "#ff8b6b", "#9be28d", "#f9a8d4", "#ffb454", "#c4a7ff"], nCreated = 0;
	function createBody(w0, lv) {
		var b = sim.add({ name: NAMES[nCreated % NAMES.length] + " " + (nCreated + 1), m: newMass(), x: w0[0], y: w0[1], vx: lv.vx, vy: lv.vy, color: PCOL[nCreated % PCOL.length] }); nCreated++;
		b.rad = preset.width / 120 * 0.4; e0 = sim.energy().total; sel = b.id; if (!ui.play) { /* keep paused */ } buildTable(); updateReadouts(true); return b;
	}

	/* ----- pointer handling ----- */
	function pick(sx, sy) { var best = null, bd = 1e9; sim.bodies.forEach(function (b) { var s = toScr(b.x, b.y), d = Math.hypot(s[0] - sx, s[1] - sy), tol = Math.max(bodyPx(b) + 6, coarse ? 22 : 12); if (d < tol && d < bd) { bd = d; best = b; } }); return best; }
	function evPos(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; }
	var pointers = {};
	cv.addEventListener("pointerdown", function (e) {
		cv.setPointerCapture(e.pointerId); var p = evPos(e); pointers[e.pointerId] = p;
		if (Object.keys(pointers).length === 2) { var ids = Object.keys(pointers), a = pointers[ids[0]], b = pointers[ids[1]]; drag = { kind: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]), S0: view.S, c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], px0: view.px, py0: view.py }; stage.classList.add("is-pan"); return; }
		if (e.button === 2 || e.button === 1 || e.shiftKey) { drag = { kind: "pan", s0: p, px0: view.px, py0: view.py }; stage.classList.add("is-pan"); e.preventDefault(); return; }
		var b = pick(p[0], p[1]);
		if (b) { sel = b.id; ea = null; drag = { kind: "move", id: b.id, moved: false, s0: p }; buildTable(); updateReadouts(true); }
		else drag = { kind: "launch", w0: toWorld(p[0], p[1]), cur: p, s0: p, moved: false };
	});
	cv.addEventListener("pointermove", function (e) {
		var p = evPos(e); if (pointers[e.pointerId]) pointers[e.pointerId] = p;
		if (!drag) { var h = pick(p[0], p[1]); hover = h ? h.id : null; cv.style.cursor = h ? "pointer" : "crosshair"; return; }
		if (drag.kind === "pinch") { var ids = Object.keys(pointers); if (ids.length >= 2) { var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; var wb = toWorldAt(drag.c0, drag.S0, drag.px0, drag.py0); view.S = Math.max(1e-6, drag.S0 * d / Math.max(10, drag.d0)); view.px = wb[0] - (c[0] - W / 2) / view.S - origin.x; view.py = wb[1] + (c[1] - H / 2) / view.S - origin.y; } return; }
		if (drag.kind === "pan") { view.px = drag.px0 - (p[0] - drag.s0[0]) / view.S; view.py = drag.py0 + (p[1] - drag.s0[1]) / view.S; return; }
		if (drag.kind === "move") { if (Math.hypot(p[0] - drag.s0[0], p[1] - drag.s0[1]) > 3) drag.moved = true; if (drag.moved) { var b = byId(drag.id), w = toWorld(p[0], p[1]); if (b) { b.x = w[0]; b.y = w[1]; trails[b.id] = []; ea = null; } } return; }
		if (drag.kind === "launch") { drag.cur = p; if (Math.hypot(p[0] - drag.s0[0], p[1] - drag.s0[1]) > 8) drag.moved = true; }
	});
	function toWorldAt(sp, S, px, py) { return [(sp[0] - W / 2) / S + origin.x + px, -(sp[1] - H / 2) / S + origin.y + py]; }
	function endPtr(e) {
		delete pointers[e.pointerId]; var d = drag; if (!d) return;
		if (d.kind === "pinch") { if (Object.keys(pointers).length < 2) { drag = null; stage.classList.remove("is-pan"); } return; }
		drag = null; stage.classList.remove("is-pan");
		if (d.kind === "launch") { if (d.moved) { var lv = launchVel(d); if (lv) createBody(d.w0, lv); } else { sel = null; ea = null; buildTable(); updateReadouts(true); } }
		if (d.kind === "move") { startState = null; if (d.moved) e0 = sim.energy().total; }
	}
	cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", endPtr);
	cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	cv.addEventListener("wheel", function (e) {
		e.preventDefault(); var p = evPos(e), f = Math.pow(1.0015, -e.deltaY), w = toWorld(p[0], p[1]); view.S = Math.max(1e-7, view.S * f);
		view.px = w[0] - (p[0] - W / 2) / view.S - origin.x; view.py = w[1] + (p[1] - H / 2) / view.S - origin.y;
	}, { passive: false });
	cv.addEventListener("dblclick", function () { fitView(); });
	cv.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); togglePlay(); } else if (e.key === "Delete" || e.key === "Backspace") removeSel(); else if (e.key === "f" || e.key === "F") fitView(); else if (e.key === "[") nudgeSpeed(-0.1); else if (e.key === "]") nudgeSpeed(0.1); });

	/* ----- readouts and table ----- */
	function updateReadouts(force) {
		$("or-r-t").textContent = timeText(sim.t);
		var drift = Math.abs((sim.energy().total - e0) / (Math.abs(e0) || 1)); $("or-r-e").textContent = sim.merged || !isFinite(drift) ? "n/a" : drift < 1e-12 ? "< 10⁻¹²" : drift.toExponential(1); $("or-r-es").textContent = sim.merged ? "changes when bodies merge" : "relative drift since the start";
		var b = byId(sel);
		if (!b) { $("or-r-n").textContent = "–"; $("or-r-ns").textContent = "Click a body"; $("or-r-o").textContent = "–"; $("or-r-os").textContent = ""; }
		else {
			var c = sim.com(), vcm = Math.hypot(b.vx - c.vx, b.vy - c.vy), p = sim.primaryOf(b), el = p ? sim.elementsOf(b, p) : null, lu = units.lunit || "", vu = units.L ? units.lunit + "/" + (units.tunit || "") : "";
			$("or-r-n").textContent = b.name; $("or-r-ns").textContent = "speed " + sig(vcm, 3) + " " + vu + (b.m ? " · mass " + sig(b.m, 3) + " " + (units.munit || "") : "");
			if (el) { $("or-r-o").textContent = el.bound ? "e = " + el.e.toFixed(3) + ", a = " + sig(el.a, 3) + " " + lu : "escaping (e = " + el.e.toFixed(2) + ")"; $("or-r-os").textContent = "about " + p.name + (el.bound ? ": period " + (el.T < 1e12 ? sig(el.T, 4) : "∞") + " " + (units.tunit || "") + (el.retro ? ", backwards" : "") : ", " + sig(el.v / el.vesc, 2) + "× escape speed"); }
		}
		if (force || tick % 24 === 0) fillTable();
		var an = $("or-area-n"); if (ui.area && ea && ea.sectors.length) { var As = ea.sectors.map(function (s) { return s.A; }), mn = Math.min.apply(null, As), mx = Math.max.apply(null, As); an.textContent = "Equal areas: " + ea.sectors.length + " slice" + (ea.sectors.length > 1 ? "s" : "") + " of equal time, areas " + sig(mn, 4) + " to " + sig(mx, 4) + (units.lunit ? " " + units.lunit + "²" : "") + " (" + ((mx / mn - 1) * 100).toFixed(2) + "% spread, from joining sample points with straight lines)."; } else an.textContent = ui.area ? (sel ? "Select a body that is in a closed orbit to see its equal-area slices." : "Select a body to see its equal-area slices.") : "";
	}
	function buildTable() {
		var kep = units.T === "years" && units.L === "AU", head = "<tr><th>Body</th><th>Mass (" + esc(units.munit || "") + ")</th><th>Distance (" + esc(units.lunit || "") + ")</th><th>e</th><th>Period (" + esc(units.tunit || "") + ")</th>" + (kep ? "<th>T²/a³</th>" : "") + "</tr>";
		root.querySelector("#or-tbl thead").innerHTML = head; fillTable();
	}
	function fillTable() {
		var kep = units.T === "years" && units.L === "AU", rows = sim.bodies.map(function (b) {
			var p = sim.primaryOf(b), el = p ? sim.elementsOf(b, p) : null;
			return '<tr data-id="' + b.id + '" class="' + (b.id === sel ? "is-sel" : "") + '"><td><span class="or-dot" style="background:' + esc(b.color || "#fff") + '"></span>' + esc(b.name) + "</td><td>" + sig(b.m, 3) + "</td><td>" + (el ? sig(el.r, 3) : "–") + "</td><td>" + (el && el.bound ? el.e.toFixed(3) : el ? "≥ 1" : "–") + "</td><td>" + (el && el.bound ? sig(el.T, 4) : "–") + "</td>" + (kep ? "<td>" + (el && el.bound ? (el.T * el.T / (el.a * el.a * el.a)).toFixed(4) : "–") + "</td>" : "") + "</tr>";
		}); root.querySelector("#or-tbl tbody").innerHTML = rows.join("");
	}
	root.querySelector("#or-tbl tbody").addEventListener("click", function (e) { var tr = e.target.closest("tr"); if (tr) { sel = +tr.dataset.id; ea = null; fillTable(); updateReadouts(); } });

	/* ----- controls ----- */
	function togglePlay() { ui.play = !ui.play; var b = $("or-play"); b.setAttribute("aria-pressed", String(ui.play)); b.textContent = ui.play ? "❚❚ Pause" : "▶ Play"; }
	$("or-play").onclick = togglePlay;
	$("or-reset").onclick = function () { loadSystem(preset.id); };
	$("or-fit").onclick = function () { fitView(); };
	$("or-png").onclick = function () { draw(); cv.toBlob(function (bl) { if (!bl) return; var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "orbits.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); };
	$("or-full").onclick = function () { var w = stage.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	$("or-sp").oninput = function () { ui.mult = +this.value; setSpeedLabel(); sset({ mult: ui.mult }); };
	function nudgeSpeed(d) { ui.mult = Math.max(-1.6, Math.min(1.6, Math.round((ui.mult + d) * 50) / 50)); setSpeedLabel(); sset({ mult: ui.mult }); }
	$("or-slow").onclick = function () { nudgeSpeed(-0.1); }; $("or-fast").onclick = function () { nudgeSpeed(0.1); };
	$("or-ms").oninput = function () { ui.mass = +this.value; massLabel(); sset({ mass: ui.mass }); };
	$("or-tr").oninput = function () { ui.trailN = +this.value; $("or-tr-v").textContent = TRAIL_NAME[ui.trailN]; if (!ui.trailN) trails = {}; sset({ trailN: ui.trailN }); };
	[["or-o-trail", "trail"], ["or-o-vel", "vel"], ["or-o-ell", "ell"], ["or-o-area", "area"], ["or-o-lab", "lab"], ["or-o-merge", "merge"]].forEach(function (p) {
		$(p[0]).onchange = function () { ui[p[1]] = this.checked; if (p[1] === "area") { ea = null; if (this.checked) { ui.ell = true; $("or-o-ell").checked = true; } updateReadouts(true); } if (p[1] === "merge") { sim.collide = this.checked; assignRadii(); } if (p[1] === "trail" && !this.checked) trails = {}; var o = {}; o[p[1]] = this.checked; sset(o); };
	});
	$("or-frame").onchange = function () { ui.frame = this.value; trails = {}; view.px = 0; view.py = 0; };
	function removeSel() { if (sel) { sim.remove(sel); e0 = sim.energy().total; delete trails[sel]; sel = null; ea = null; buildTable(); updateReadouts(true); } }
	$("or-del").onclick = removeSel;
	$("or-clrtr").onclick = function () { trails = {}; };
	$("or-link").onclick = function () {
		var u = new URL(location.href); u.search = "";
		var data = { p: preset.id, b: sim.bodies.map(function (b) { return [b.name, +b.m.toPrecision(10), +b.x.toPrecision(10), +b.y.toPrecision(10), +b.vx.toPrecision(10), +b.vy.toPrecision(10), b.color, b.rad ? +b.rad.toPrecision(4) : 0, b.star ? 1 : 0]; }), t: +sim.t.toPrecision(10), w: +(Math.min(W, H) * 1.45 / view.S).toPrecision(5) };
		var s = b64e(JSON.stringify(data)); if (s.length > 6000) { toast("Too many bodies for a link"); return; } u.searchParams.set("s", s); copyText(u.toString(), "Link to this system copied");
	};
	function buildPresetChips() {
		var el = $("or-pre"); el.innerHTML = O.PRESETS.map(function (p) { return '<button type="button" data-id="' + p.id + '">' + esc(p.name) + "</button>"; }).join("");
		el.onclick = function (e) { var b = e.target.closest("button"); if (b) { loadSystem(b.dataset.id); } };
	}

	/* =========================== CALCULATOR =========================== */
	var cEl = { body: $("or-c-body"), m: $("or-c-m"), rad: $("or-c-rad"), mode: $("or-c-mode"), h: $("or-c-h"), T: $("or-c-T"), vr: $("or-c-vr"), va: $("or-c-va"), h1: $("or-c-h1"), h2: $("or-c-h2"), err: $("or-c-err") };
	cEl.body.innerHTML = O.BODIES.map(function (b) { return '<option value="' + b.id + '">' + b.name + "</option>"; }).join("") + '<option value="custom">Custom…</option>';
	function parseTime(s) {
		var m = String(s).trim().toLowerCase().replace(/,/g, "").match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(s|sec|secs|seconds?|min|mins|minutes?|h|hr|hrs|hours?|d|days?|yr|yrs|y|years?)?$/);
		if (!m) return NaN; var u = m[2] || "s", k = /^(s|sec)/.test(u) ? 1 : /^min/.test(u) ? 60 : /^h/.test(u) ? 3600 : /^d/.test(u) ? 86400 : 3.15576e7; return parseFloat(m[1]) * k;
	}
	function resBox(label, value, sub) { return "<div><span>" + esc(label) + "</span><b>" + esc(value) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>"; }
	function ms(v) { return O.fmt(v, 4) + " m/s (" + O.fmt(v * 3.6, 4) + " km/h)"; }
	function calcAll() {
		var body = O.BODIES.filter(function (b) { return b.id === cEl.body.value; })[0], M, R, err = "";
		if (body) { M = body.M; R = body.R; cEl.m.value = O.fmt(M, 5).replace("×10", "e").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹−]+/g, function (s) { return s.replace(/−/g, "-").replace(/[⁰-⁹]/g, function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c); }); }); cEl.rad.value = O.fmt(R / 1000, 5) + " km"; cEl.m.readOnly = true; cEl.rad.readOnly = true; }
		else { cEl.m.readOnly = false; cEl.rad.readOnly = false; M = parseFloat(cEl.m.value); R = O.parseLen(cEl.rad.value); }
		if (!(M > 0) || !(R >= 0)) err = "Enter a mass in kg and a radius.";
		var mu = O.G_SI * M, mode = cEl.mode.value;
		function rOf(str) { var x = O.parseLen(str); if (!isFinite(x)) return NaN; return mode === "alt" ? R + x : x; }
		var r = rOf(cEl.h.value), circ = $("or-c-circ"), kep = $("or-c-kep"), vis = $("or-c-vis"), hoh = $("or-c-hoh");
		if (!err && !(r > 0)) err = "Type the orbit as a distance, like 400 km.";
		if (!err && r < R && mode === "r") err = "That is inside the body (radius " + O.fmt(R / 1000, 4) + " km).";
		if (err) { cEl.err.textContent = err; circ.innerHTML = kep.innerHTML = vis.innerHTML = hoh.innerHTML = ""; return; } cEl.err.textContent = "";
		var v = Math.sqrt(mu / r), T = 2 * PI * Math.sqrt(r * r * r / mu);
		circ.innerHTML = resBox("Distance from the centre", O.fmt(r / 1000, 5) + " km", mode === "alt" ? "height " + O.fmt((r - R) / 1000, 5) + " km" : "") + resBox("Orbital speed", ms(v), "") + resBox("Period", O.fmtTime(T), O.fmt(86400 / T, 4) + " orbits per day") + resBox("Escape speed there", ms(v * Math.SQRT2), "") + resBox("Gravity there", O.fmt(mu / (r * r), 4) + " m/s²", O.fmt(mu / (r * r) / 9.80665, 3) + " g");
		var Ts = parseTime(cEl.T.value), a = Math.cbrt(mu * Ts * Ts / (4 * PI * PI));
		kep.innerHTML = isFinite(Ts) && Ts > 0 ? resBox("Semi-major axis", O.fmt(a / 1000, 5) + " km", a > R ? "height " + O.fmt((a - R) / 1000, 5) + " km above the surface" : "inside the body!") + resBox("Speed if circular", ms(Math.sqrt(mu / a)), "") : '<small class="or-err">Type a period like 90 min.</small>';
		var vrr = O.parseLen(cEl.vr.value), va = O.parseLen(cEl.va.value); if (cEl.vr.value === "") { cEl.vr.value = ""; }
		vis.innerHTML = vrr > 0 && va > 0 ? (2 / vrr - 1 / va > 0 ? resBox("Speed there", ms(O.visViva(mu, vrr, va)), "") + resBox("Period of that orbit", O.fmtTime(2 * PI * Math.sqrt(va * va * va / mu)), "") : '<small class="or-err">A distance of ' + O.fmt(vrr / 1000, 4) + " km is beyond the orbit's far point (2a).</small>") : '<small class="or-err">Give a distance and a semi-major axis.</small>';
		var r1 = rOf(cEl.h1.value), r2 = rOf(cEl.h2.value);
		if (r1 > 0 && r2 > 0 && r1 !== r2) { var g = O.hohmann(mu, r1, r2); hoh.innerHTML = resBox("First burn", ms(g.dv1), "at the lower point") + resBox("Second burn", ms(g.dv2), "to circularise") + resBox("Total delta-v", ms(g.total), "") + resBox("Transfer time", O.fmtTime(g.time), "half of the transfer ellipse") + resBox("Speeds", O.fmt(g.v1, 4) + " → " + O.fmt(g.v2, 4) + " m/s", "circular, before and after"); }
		else hoh.innerHTML = '<small class="or-err">Give two different orbits.</small>';
	}
	var CTRY = [
		{ name: "Space Station (Earth, 408 km)", b: "earth", mode: "alt", h: "408 km", T: "92.7 min", vr: "6780 km", va: "10000 km", h1: "408 km", h2: "35786 km" },
		{ name: "Geostationary (Earth)", b: "earth", mode: "alt", h: "35786 km", T: "23.934 h", vr: "42164 km", va: "42164 km", h1: "408 km", h2: "35786 km" },
		{ name: "GPS (Earth, 20,200 km)", b: "earth", mode: "alt", h: "20200 km", T: "11.97 h", vr: "26571 km", va: "26571 km", h1: "408 km", h2: "20200 km" },
		{ name: "The Moon's orbit (Earth)", b: "earth", mode: "r", h: "384400 km", T: "27.32 d", vr: "363300 km", va: "384400 km", h1: "6778 km", h2: "384400 km" },
		{ name: "Earth around the Sun", b: "sun", mode: "r", h: "1 AU", T: "1 yr", vr: "0.9833 AU", va: "1 AU", h1: "1 AU", h2: "1.5237 AU" },
		{ name: "Low Mars orbit", b: "mars", mode: "alt", h: "250 km", T: "2 h", vr: "3640 km", va: "3640 km", h1: "250 km", h2: "17000 km" }
	];
	function setCalc(c) { cEl.body.value = c.b; cEl.mode.value = c.mode; cEl.h.value = c.h; cEl.T.value = c.T; cEl.vr.value = c.vr; cEl.va.value = c.va; cEl.h1.value = c.h1; cEl.h2.value = c.h2; calcAll(); sset({ calc: c.name }); }
	function initCalc() {
		var el = $("or-c-try"); el.innerHTML = CTRY.map(function (c, i) { return '<button type="button" data-i="' + i + '">' + esc(c.name) + "</button>"; }).join("");
		el.onclick = function (e) { var b = e.target.closest("button"); if (b) setCalc(CTRY[+b.dataset.i]); };
		Array.prototype.forEach.call(root.querySelectorAll("#or-c-body, #or-c-mode"), function (e) { e.onchange = calcAll; }); Array.prototype.forEach.call(root.querySelectorAll("#or-c-m, #or-c-rad, #or-c-h, #or-c-T, #or-c-vr, #or-c-va, #or-c-h1, #or-c-h2"), function (e) { e.oninput = calcAll; });
		setCalc(CTRY[0]);
	}

	/* =========================== start =========================== */
	buildPresetChips(); initCalc();
	ui.mult = typeof saved.mult === "number" ? saved.mult : 0; ui.mass = typeof saved.mass === "number" ? saved.mass : -5.5; ui.trailN = typeof saved.trailN === "number" ? saved.trailN : 2;
	["trail", "vel", "ell", "area", "lab", "merge"].forEach(function (k) { if (typeof saved[k] === "boolean") ui[k] = saved[k]; }); ui.area = false;
	[["or-o-trail", "trail"], ["or-o-vel", "vel"], ["or-o-ell", "ell"], ["or-o-area", "area"], ["or-o-lab", "lab"], ["or-o-merge", "merge"]].forEach(function (p) { $(p[0]).checked = ui[p[1]]; });
	$("or-tr").value = ui.trailN; $("or-tr-v").textContent = TRAIL_NAME[ui.trailN];
	var initId = O.PRESETS.some(function (p) { return p.id === q.get("p"); }) ? q.get("p") : (O.PRESETS.some(function (p) { return p.id === saved.preset; }) ? saved.preset : "earth-sun"), custom = null, ctime = 0, cw = 0;
	if (q.get("s")) { try { var d = JSON.parse(b64d(q.get("s"))); if (d && Array.isArray(d.b) && d.b.length && d.b.length < 60 && O.PRESETS.some(function (p) { return p.id === d.p; })) { initId = d.p; custom = d.b.map(function (b) { return [String(b[0]).slice(0, 30), +b[1], +b[2], +b[3], +b[4], +b[5], String(b[6]).replace(/[^#\w]/g, ""), +b[7] || 0, b[8]]; }); ctime = +d.t || 0; cw = +d.w || 0; } } catch (e) {} }
	resizeInit(); loadSystem(initId, custom); if (custom) { sim.t = ctime; startState = null; if (cw) { view.S = Math.min(W, H) * 1.45 / cw; } }
	setTab(tab); requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
	function resizeInit() { var wrap = stage.parentNode; wrap.setAttribute("data-mes-free", "1"); W = wrap.clientWidth || 600; H = Math.round(W / aspect); }
	window.addEventListener("resize", onResize); if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage.parentNode); setTimeout(onResize, 0);
	var pinned = document.body.classList; new MutationObserver(function () {}).observe(document.body, { attributes: true });
	window.__orbit = { get sim() { return sim; }, get ui() { return ui; }, get view() { return view; }, load: loadSystem, draw: draw };
})();
