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
