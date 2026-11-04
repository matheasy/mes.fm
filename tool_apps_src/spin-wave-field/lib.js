/* MES Spin Wave Field -- pure maths (no DOM). Browser global `MESSpinWave`; node: require('./tool_apps_src/spin-wave-field/lib.js');
 * tests: node tool_apps_src/spin-wave-field-tests.js
 * Geometry (all tabs): the wave travels along +x, the barrier with the slits stands at x = 0 across y, z is up. Lengths in metres
 * (the "crowd" is a field of people about a metre apart), angles in radians unless a name ends in Deg.
 * 1. Double slit by Huygens' principle: every point of each slit re-radiates a 2D cylindrical wavelet
 *    psi(P) = sum_s psi_inc(s) * ds * sqrt(1 / (lambda r)) * e^{i (k r - pi/4)} * (1 + cos theta) / 2   (Kirchhoff-Fresnel in 2D),
 *    so the far-field maxima sit at d sin(theta) = m lambda and the single-slit minima at a sin(theta) = m lambda.
 * 2. A "spin flipper" in slit 1 multiplies that slit's wave by e^{i s alpha}: s = 1/2 for a spin-1/2 particle (360 degrees gives -1,
 *    the fringes move by half a fringe; 720 degrees gives +1 again), s = 1 for an ordinary vector (360 degrees changes nothing).
 * 3. A driven 2D wave equation u_tt = c^2 lap u (leapfrog, absorbing sponge at the edges, walls with slits), with the energy flux
 *    S = -c^2 u_t grad u that carries tracer particles. */
(function (root) {
	"use strict";
	var TAU = 2 * Math.PI;

	/* ---------- small helpers ---------- */
	function rng(seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
	function linspace(a, b, n) { var r = []; for (var i = 0; i < n; i++) r.push(n === 1 ? a : a + (b - a) * i / (n - 1)); return r; }
	function cexp(ph) { return { re: Math.cos(ph), im: Math.sin(ph) }; }

	/* phase factor a flipper gives a path: spin-1/2 -> e^{i alpha/2}, vector -> e^{i alpha} */
	function spinFactor(alpha, s) { return cexp((s == null ? 0.5 : s) * alpha); }
	/* the two things a spin-1/2 "person" shows: the arrow turns by the full angle, the sign of the medium goes as cos(phi/2) */
	function spinLook(phi) { var a = ((phi % TAU) + TAU) % TAU; return { arrow: a, sign: Math.cos(phi / 2) >= 0 ? 1 : -1, half: Math.cos(phi / 2) }; }

	/* ====================================================== 1. Huygens double slit ====================================================== */
	/* o: lam, d (centre to centre), a (slit width), slits (1 | 2), src ('plane' | 'point'), srcX (< 0, point source position), n (points per slit),
	   alpha (flipper turn in slit 1, rad), s (0.5 spin / 1 vector) */
	function setup(o) {
		var lam = o.lam || 1, k = TAU / lam, slits = o.slits === 1 ? 1 : 2, d = o.d || 4, a = o.a || 1, n = Math.max(2, o.n || Math.ceil(a / lam * 8) + 4);
		var src = o.src === "point" ? "point" : "plane", xs = Math.min(-0.5, o.srcX == null ? -12 : o.srcX), fl = spinFactor(o.alpha || 0, o.s), pts = [];
		var centres = slits === 1 ? [0] : [d / 2, -d / 2], ds = a / n, norm = ds / Math.sqrt(lam);
		centres.forEach(function (yc, si) {
			for (var j = 0; j < n; j++) {
				var y = yc - a / 2 + (j + 0.5) * ds, inc = incident({ k: k, src: src, xs: xs }, 0, y), re = inc.re, im = inc.im;
				if (si === 0 && slits === 2) { var r2 = re * fl.re - im * fl.im; im = re * fl.im + im * fl.re; re = r2; }
				pts.push({ y: y, re: re * norm, im: im * norm, slit: si });
			}
		});
		return { lam: lam, k: k, d: d, a: a, slits: slits, src: src, xs: xs, pts: pts, centres: centres };
	}
	function incident(p, x, y) {
		if (p.src === "plane") return cexp(p.k * x);
		var r = Math.hypot(x - p.xs, y), amp = Math.sqrt(Math.abs(p.xs) / Math.max(r, 1e-6)); return { re: amp * Math.cos(p.k * r), im: amp * Math.sin(p.k * r) };
	}
	var C45 = Math.SQRT1_2;
	/* complex field at (x, y). Before the barrier: the incoming wave (the reflection is left out). Behind it: the Huygens sum. */
	function field(P, x, y) {
		if (x <= 0) return incident(P, x, y);
		var re = 0, im = 0, k = P.k, pts = P.pts;
		for (var i = 0; i < pts.length; i++) {
			var q = pts[i], dy = y - q.y, r = Math.sqrt(x * x + dy * dy), ob = 0.5 * (1 + x / r), w = ob / Math.sqrt(r), ph = k * r;
			var c = Math.cos(ph), s = Math.sin(ph), wr = (c * C45 + s * C45) * w, wi = (s * C45 - c * C45) * w;   // e^{i(kr - pi/4)}
			re += q.re * wr - q.im * wi; im += q.re * wi + q.im * wr;
		}
		return { re: re, im: im };
	}
	function intensity(P, x, y) { var f = field(P, x, y); return f.re * f.re + f.im * f.im; }
	function pattern(P, L, ys) { return ys.map(function (y) { return intensity(P, L, y); }); }
	/* local maxima / minima with a parabola through the three samples around each */
	function extrema(xs, v, kind) {
		var out = [], sg = kind === "min" ? -1 : 1;
		for (var i = 1; i < v.length - 1; i++) {
			var a = sg * v[i - 1], b = sg * v[i], c = sg * v[i + 1];
			if (b > a && b >= c) { var den = a - 2 * b + c, t = den !== 0 ? 0.5 * (a - c) / den : 0; out.push({ x: xs[i] + t * (xs[i + 1] - xs[i]), v: v[i] }); }
		}
		return out;
	}
	/* average spacing of the bright fringes nearest the middle of the screen (uses the n maxima closest to y = 0) */
	function fringeSpacing(P, L, half, nPts, nUse) {
		var ys = linspace(-half, half, nPts || 2001), I = pattern(P, L, ys), mx = extrema(ys, I, "max");
		if (mx.length < 2) return NaN;
		mx.sort(function (p, q) { return Math.abs(p.x) - Math.abs(q.x); }); var use = mx.slice(0, Math.min(nUse || 5, mx.length)).map(function (p) { return p.x; }).sort(function (p, q) { return p - q; });
		return (use[use.length - 1] - use[0]) / (use.length - 1);
	}
	/* textbook positions on a screen at distance L */
	function brightY(m, lam, d, L) { var s = m * lam / d; return Math.abs(s) >= 1 ? NaN : L * Math.tan(Math.asin(s)); }
	function singleMinY(m, lam, a, L) { var s = m * lam / a; return Math.abs(s) >= 1 ? NaN : L * Math.tan(Math.asin(s)); }
	function smallAngleSpacing(lam, d, L) { return lam * L / d; }
	/* two equal ideal slits, far away: I = cos^2(pi d sin th / lam + shift/2) * sinc^2(pi a sin th / lam) */
	function farField(th, o) {
		var s = Math.sin(th), b = Math.PI * (o.a || 0) * s / o.lam, env = Math.abs(b) < 1e-12 ? 1 : Math.pow(Math.sin(b) / b, 2);
		if (o.slits === 1) return env;
		var g = Math.PI * o.d * s / o.lam - (o.shift || 0) / 2; return env * Math.pow(Math.cos(g), 2);
	}
	/* where a fringe pattern sits relative to a reference, in fringes (0 = same, 0.5 = bright and dark swapped) */
	function fringeShift(alpha, s) { var x = ((s == null ? 0.5 : s) * alpha) / TAU; x = x - Math.floor(x); return x > 0.5 ? x - 1 : x; }

	/* sample hits (photons, people, ...) from a pattern: returns a function giving one bin index per call */
	function sampler(I, seed) {
		var cdf = new Float64Array(I.length), t = 0, r = rng(seed || 5);
		for (var i = 0; i < I.length; i++) { t += Math.max(0, I[i]); cdf[i] = t; }
		return function () { if (!(t > 0)) return -1; var u = r() * t, lo = 0, hi = I.length - 1; while (lo < hi) { var m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return lo; };
	}

	/* ====================================================== 2. a tiny 3D camera (z up) ====================================================== */
	function project(cam, x, y, z) {
		var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), x1 = x * c - y * s, y1 = x * s + y * c, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		var up = z * cp + y1 * sp, d = y1 * cp - z * sp, f = cam.F / (cam.F + d);
		return { x: cam.cx + x1 * cam.k * f, y: cam.cy - up * cam.k * f, d: d, f: f };
	}
	/* the floor point (z = 0) under a screen point, or null if the ray misses the floor */
	function unprojectFloor(cam, X, Y) {
		var a = (X - cam.cx) / cam.k, b = (cam.cy - Y) / cam.k, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), den = sp * cam.F - b * cp;
		if (Math.abs(den) < 1e-9) return null;
		var y1 = b * cam.F / den, f = cam.F / (cam.F + y1 * cp); if (!(f > 0)) return null;
		var x1 = a / f, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
		return { x: x1 * c + y1 * s, y: -x1 * s + y1 * c };
	}

	/* ====================================================== 3. driven 2D wave equation ====================================================== */
	/* nx x ny cells of size 1; o.c = wave speed (cells per unit time), o.sponge = absorbing border width (cells). Leapfrog with Courant number C = c dt <= 0.5. */
	function Wave2D(nx, ny, o) {
		o = o || {};
		var N = nx * ny, u = new Float32Array(N), up = new Float32Array(N), un = new Float32Array(N), wall = new Uint8Array(N), damp = new Float32Array(N);
		var c = o.c || 1, dt = (o.C || 0.5) / c, C2 = Math.pow(c * dt, 2), sw = o.sponge == null ? 14 : o.sponge, self = { nx: nx, ny: ny, u: u, up: up, wall: wall, c: c, dt: dt, t: 0, sources: [], omega: 0 };
		for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
			var e = Math.min(i, j, nx - 1 - i, ny - 1 - j), g = e < sw ? Math.pow((sw - e) / sw, 2) * 0.12 : 0;
			if (o.open === "left" && i < sw && j >= sw && j < ny - sw) g = Math.pow((sw - i) / sw, 2) * 0.12;
			damp[j * nx + i] = g;
		}
		self.step = function () {
			var t = self.t, s, i, j, k;
			for (j = 1; j < ny - 1; j++) for (i = 1; i < nx - 1; i++) {
				k = j * nx + i;
				if (wall[k]) { un[k] = 0; continue; }
				var lap = u[k - 1] + u[k + 1] + u[k - nx] + u[k + nx] - 4 * u[k];
				un[k] = u[k] + (u[k] - up[k]) * (1 - damp[k]) + C2 * lap;
			}
			for (s = 0; s < self.sources.length; s++) {
				var q = self.sources[s], ramp = Math.min(1, t / (q.ramp || 6)), v = q.amp * ramp * Math.sin(self.omega * t + (q.phase || 0)) * dt;
				for (var m = 0; m < q.cells.length; m++) { k = q.cells[m]; if (!wall[k]) un[k] += v; }
			}
			for (i = 0; i < nx; i++) { un[i] = 0; un[(ny - 1) * nx + i] = 0; }
			for (j = 0; j < ny; j++) { un[j * nx] = 0; un[j * nx + nx - 1] = 0; }
			var tmp = up; up = u; u = un; un = tmp; self.u = u; self.up = up; self.t += dt;
		};
		self.reset = function () { u.fill(0); up.fill(0); un.fill(0); self.t = 0; };
		/* complex amplitude estimate for a steady sinusoid: u = A cos(phi), u_t = -omega A sin(phi) */
		self.phaseAmp = function (k) { var v = (u[k] - up[k]) / dt, w = self.omega || 1; return { amp: Math.sqrt(u[k] * u[k] + v * v / (w * w)), phi: Math.atan2(-v / w, u[k]) }; };
		/* energy flux S = -c^2 u_t grad u and energy density E = (u_t^2 + c^2 |grad u|^2) / 2 at a point (bilinear) */
		self.flux = function (x, y) {
			var i = Math.floor(x), j = Math.floor(y); if (i < 1 || j < 1 || i >= nx - 2 || j >= ny - 2) return null;
			var fx = x - i, fy = y - j, Sx = 0, Sy = 0, E = 0, U = 0;
			[[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]].forEach(function (p) {
				var k = (j + p[1]) * nx + i + p[0], ut = (u[k] - up[k]) / dt, gx = (u[k + 1] - u[k - 1]) / 2, gy = (u[k + nx] - u[k - nx]) / 2;
				Sx += p[2] * -c * c * ut * gx; Sy += p[2] * -c * c * ut * gy; E += p[2] * 0.5 * (ut * ut + c * c * (gx * gx + gy * gy)); U += p[2] * u[k];
			});
			return { Sx: Sx, Sy: Sy, E: E, u: U };
		};
		self.energy = function () { var e = 0; for (var k = 0; k < N; k++) { var v = (u[k] - up[k]) / dt; e += 0.5 * v * v; if (k % nx < nx - 1) { var g = u[k + 1] - u[k]; e += 0.5 * c * c * g * g; } if (k + nx < N) { var g2 = u[k + nx] - u[k]; e += 0.5 * c * c * g2 * g2; } } return e; };
		return self;
	}
	/* wall across x = ix with openings: slits given as [centre j, width] in cells */
	function buildWall(w, ix, slits, thick) {
		w.wall.fill(0); if (ix == null) return;
		for (var t = 0; t < (thick || 2); t++) for (var j = 0; j < w.ny; j++) {
			var open = slits.some(function (s) { return Math.abs(j - s[0]) <= s[1] / 2; });
			if (!open) w.wall[j * w.nx + ix + t] = 1;
		}
	}

	var PRESETS = [
		{ id: "classic", name: "Classic double slit", lam: 2.5, d: 8, a: 1.2, slits: 2, src: "plane" },
		{ id: "wide", name: "Slits far apart (fine fringes)", lam: 2, d: 14, a: 1, slits: 2, src: "plane" },
		{ id: "close", name: "Slits close (wide fringes)", lam: 3, d: 5, a: 1, slits: 2, src: "plane" },
		{ id: "single", name: "One wide slit", lam: 2, d: 8, a: 6, slits: 1, src: "plane" },
		{ id: "point", name: "Point source (ripple tank)", lam: 2.5, d: 8, a: 1.2, slits: 2, src: "point" },
		{ id: "fat", name: "Wide slits: envelope", lam: 2, d: 9, a: 3.5, slits: 2, src: "plane" }
	];
	var SPIN_PRESETS = [
		{ id: "0", name: "No turn (0°)", deg: 0 }, { id: "180", name: "180°", deg: 180 }, { id: "360", name: "360°: one full turn", deg: 360 },
		{ id: "540", name: "540°", deg: 540 }, { id: "720", name: "720°: two full turns", deg: 720 }
	];
	var FIELD_PRESETS = [
		{ id: "dslit", name: "Plane wave + double slit", mode: "dslit" }, { id: "sslit", name: "Plane wave + single slit", mode: "sslit" },
		{ id: "one", name: "One point source", mode: "one" }, { id: "two", name: "Two point sources", mode: "two" }, { id: "two-anti", name: "Two sources, opposite phase", mode: "two", anti: true }
	];

	var api = { TAU: TAU, rng: rng, linspace: linspace, spinFactor: spinFactor, spinLook: spinLook, setup: setup, incident: incident, field: field, intensity: intensity, pattern: pattern,
		extrema: extrema, fringeSpacing: fringeSpacing, brightY: brightY, singleMinY: singleMinY, smallAngleSpacing: smallAngleSpacing, farField: farField, fringeShift: fringeShift,
		sampler: sampler, project: project, unprojectFloor: unprojectFloor, Wave2D: Wave2D, buildWall: buildWall, PRESETS: PRESETS, SPIN_PRESETS: SPIN_PRESETS, FIELD_PRESETS: FIELD_PRESETS };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESSpinWave = api;
})(this);
