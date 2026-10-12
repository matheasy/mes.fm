/* MES Light in a Medium -- pure maths (browser + node: require('./lib.js')).
 * Light in a medium of refractive index n moves at c/n. Two views of the same medium:
 *   Wave: finite-difference solution of u_tt = (1/n^2) * lap(u) on a grid (units: cells and steps, vacuum speed c = COURANT cells per step).
 *   Rays: the eikonal equation d/ds (n dr/ds) = grad n, integrated with a midpoint step.
 * The medium is a Float32Array n (>= 1) plus a Uint8Array mask (1 = perfect mirror wall).
 */
(function (root) {
	"use strict";
	var L = {};
	var COURANT = 0.6; /* cells per step in vacuum; the 2D stability limit is 1/sqrt(2) = 0.707 and n >= 1 only slows light */
	L.COURANT = COURANT; L.NMAX = 4; L.SPONGE = 18;

	/* ---------- medium helpers ---------- */
	function Medium(w, h) { this.w = w; this.h = h; this.n = new Float32Array(w * h).fill(1); this.m = new Uint8Array(w * h); }
	L.Medium = Medium;
	Medium.prototype.fill = function (fn) { /* fn(x, y) -> n or 0 (leave) */
		for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) { var v = fn(x, y); if (v > 0) this.n[y * this.w + x] = v; }
	};
	Medium.prototype.wall = function (fn) { for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) if (fn(x, y)) { this.m[y * this.w + x] = 1; this.n[y * this.w + x] = 1; } };
	Medium.prototype.disc = function (cx, cy, r, val, edge) { /* soft-edged brush; val = n, or 0 = erase to vacuum, or -1 = wall, -2 = erase wall */
		var r2 = (r + 1) * (r + 1), x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(this.w - 1, Math.ceil(cx + r + 1)), y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
		for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
			var d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (d2 > r2) continue;
			var i = y * this.w + x;
			if (val === -1) { this.m[i] = 1; this.n[i] = 1; }
			else if (val === -2) { this.m[i] = 0; }
			else if (!this.m[i]) {
				var t = edge ? Math.max(0, Math.min(1, (r + 0.5 - Math.sqrt(d2)) / Math.max(1, r * 0.35))) : 1;
				var target = val === 0 ? 1 : val;
				this.n[i] = val === 0 ? 1 : this.n[i] + (target - this.n[i]) * t;
			}
		}
	};
	Medium.prototype.nAt = function (x, y) { /* bilinear */
		var w = this.w, h = this.h; x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y));
		var i = x | 0, j = y | 0, fx = x - i, fy = y - j, n = this.n, k = j * w + i;
		return (n[k] * (1 - fx) + n[k + 1] * fx) * (1 - fy) + (n[k + w] * (1 - fx) + n[k + w + 1] * fx) * fy;
	};
	Medium.prototype.copy = function () { var c = new Medium(this.w, this.h); c.n.set(this.n); c.m.set(this.m); return c; };

	/* ---------- wave solver ---------- */
	function Wave(med) {
		this.med = med; var N = med.w * med.h;
		this.u = new Float32Array(N); this.p = new Float32Array(N); this.I = new Float32Array(N);
		this.g = new Float32Array(N); this.c2 = new Float32Array(N); this.t = 0; this.sources = []; this.wl = 14; this.mode = "cw"; this.pulseAt = -1; this.amp = 1;
		this.refresh();
	}
	L.Wave = Wave;
	Wave.prototype.refresh = function () { /* after the medium changed */
		var m = this.med, w = m.w, h = m.h, S = L.SPONGE;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var i = y * w + x, nn = m.n[i], c = COURANT / nn; this.c2[i] = c * c;
			var d = Math.min(x, y, w - 1 - x, h - 1 - y), g = 0; if (d < S) { var s = (S - d) / S; g = 0.2 * s * s; }
			this.g[i] = g;
		}
	};
	Wave.prototype.reset = function () { this.u.fill(0); this.p.fill(0); this.I.fill(0); this.t = 0; this.pulseAt = this.mode === "pulse" ? 0 : -1; };
	Wave.prototype.omega = function () { return 2 * Math.PI * COURANT / this.wl; };
	Wave.prototype.drive = function () { /* source time function at the current step */
		var om = this.omega(), T = 2 * Math.PI / om;
		if (this.mode === "cw") { var ramp = Math.min(1, this.t / (2.5 * T)); return Math.sin(om * this.t) * ramp; }
		if (this.pulseAt < 0) return 0;
		var t = this.t - this.pulseAt, c = 2.2 * T, s = 0.75 * T; if (t > 2 * c) { return 0; }
		return Math.sin(om * (t - c)) * Math.exp(-((t - c) * (t - c)) / (2 * s * s));
	};
	Wave.prototype.pulse = function () { this.mode = "pulse"; this.pulseAt = this.t; };
	Wave.prototype.step = function () {
		var m = this.med, w = m.w, h = m.h, u = this.u, p = this.p, c2 = this.c2, g = this.g, mask = m.m, I = this.I, x, y, i, lap, nx;
		for (y = 1; y < h - 1; y++) for (x = 1, i = y * w + 1; x < w - 1; x++, i++) {
			if (mask[i]) { p[i] = 0; continue; }
			lap = u[i - 1] + u[i + 1] + u[i - w] + u[i + w] - 4 * u[i];
			nx = (2 * u[i] - (1 - g[i]) * p[i] + c2[i] * lap) / (1 + g[i]);
			p[i] = nx;
		}
		var tmp = this.u; this.u = this.p; this.p = tmp; u = this.u;
		var s = this.drive(), srcs = this.sources;
		if (s !== 0) for (var k = 0; k < srcs.length; k++) { var q = srcs[k]; var j = (q.y | 0) * w + (q.x | 0); if (!mask[j]) u[j] += this.amp * q.a * s; }
		for (i = 0; i < u.length; i++) I[i] = I[i] * 0.985 + u[i] * u[i] * 0.015;
		this.t++;
	};
	/* a source list: a point, or a tilted line of emitters (plane-wave beam with a soft Gaussian edge) */
	L.pointSource = function (x, y) { return [{ x: x, y: y, a: 0.5 }]; };
	L.beamSource = function (x, y, angle, width) { /* beam travels along `angle` (radians, 0 = +x, y down); emitters lie across it */
		var out = [], px = -Math.sin(angle), py = Math.cos(angle), n = Math.max(3, Math.round(width));
		for (var k = 0; k < n; k++) { var s = (k - (n - 1) / 2), e = Math.exp(-Math.pow(s / (width * 0.42), 4)); out.push({ x: x + px * s, y: y + py * s, a: 0.12 * e }); }
		return out;
	};

	/* ---------- ray tracer ---------- */
	L.trace = function (med, x, y, ang, maxSteps, ds) {
		ds = ds || 0.5; maxSteps = maxSteps || 3000;
		var n = med.nAt(x, y), px = Math.cos(ang) * n, py = Math.sin(ang) * n, pts = [x, y], w = med.w, h = med.h, e = 0.5;
		function grad(x, y) { return [(med.nAt(x + e, y) - med.nAt(x - e, y)) / (2 * e), (med.nAt(x, y + e) - med.nAt(x, y - e)) / (2 * e)]; }
		for (var s = 0; s < maxSteps; s++) {
			var nn = med.nAt(x, y), g = grad(x, y);
			var mx = x + px / nn * ds / 2, my = y + py / nn * ds / 2, mp = px + g[0] * ds / 2, mq = py + g[1] * ds / 2, mn = med.nAt(mx, my), g2 = grad(mx, my);
			var nxp = x + mp / mn * ds, nyp = y + mq / mn * ds;
			if (nxp < 0 || nyp < 0 || nxp > w - 1 || nyp > h - 1) { pts.push(Math.max(0, Math.min(w - 1, nxp)), Math.max(0, Math.min(h - 1, nyp))); break; }
			var mi = (Math.round(nyp)) * w + Math.round(nxp);
			if (med.m[mi]) { pts.push(nxp, nyp); break; }
			px += g2[0] * ds; py += g2[1] * ds; x = nxp; y = nyp;
			if (s % 2 === 1) pts.push(x, y);
		}
		return pts;
	};
	L.rayFan = function (med, src, count, spread, ang0) { /* rays from a point or along a beam */
		var out = [], i;
		if (src.type === "point") for (i = 0; i < count; i++) { var a = (i / count) * Math.PI * 2; out.push(L.trace(med, src.x, src.y, a)); }
		else { var h = src.width, px = -Math.sin(src.angle), py = Math.cos(src.angle); for (i = 0; i < count; i++) { var s = (i / (count - 1) - 0.5) * h * 0.8; out.push(L.trace(med, src.x + px * s, src.y + py * s, src.angle)); } }
		return out;
	};

	/* ---------- scenarios ---------- */
	function slab(m, x0, x1, n) { m.fill(function (x) { return x >= x0 && x <= x1 ? n : 0; }); }
	L.PRESETS = [
		{ id: "empty", name: "Empty space (draw your own)", note: "Plain vacuum. Pick the Glass brush and paint a medium, then watch the wavefronts bend and slow down inside it.",
			build: function (m, w, h) { return { type: "point", x: w * 0.3, y: h * 0.5 }; } },
		{ id: "slab", name: "Glass slab: Snell's law", note: "A beam hits a block of glass (n = 1.5) at an angle. Inside, light travels at 2/3 of c, the wavelength shrinks and the beam bends towards the normal: sin θ₁ = n sin θ₂.",
			build: function (m, w, h) { m.fill(function (x, y) { return x > w * 0.5 && x < w * 0.78 ? 1.5 : 0; }); return { type: "beam", x: w * 0.12, y: h * 0.28, angle: 0.62, width: 30 }; } },
		{ id: "lens", name: "Convex lens", note: "A glass lens (n = 1.5) is thicker in the middle, so the centre of each wavefront is delayed more than its edges. The flat wave curls into a converging one and comes to a focus.",
			build: function (m, w, h) { var R = h * 1.0, cx1 = w * 0.42 + R - h * 0.09, cx2 = w * 0.42 - R + h * 0.09, cy = h / 2; m.fill(function (x, y) { return (x - cx1) * (x - cx1) + (y - cy) * (y - cy) < R * R && (x - cx2) * (x - cx2) + (y - cy) * (y - cy) < R * R ? 1.5 : 0; }); return { type: "beam", x: w * 0.1, y: h * 0.5, angle: 0, width: h * 0.4 }; } },
		{ id: "prism", name: "Prism", note: "Light slows down in the glass and the beam turns towards the thick end. (Real glass slows blue light more than red, which is why a prism makes a rainbow; this simulator uses one colour.)",
			build: function (m, w, h) { var cx = w * 0.5, cy = h * 0.55, s = h * 0.42; m.fill(function (x, y) { var dy = y - (cy - s * 0.8); if (dy < 0) return 0; var half = dy * 0.58; return Math.abs(x - cx) < half && dy < s * 1.6 ? 1.6 : 0; }); return { type: "beam", x: w * 0.12, y: h * 0.62, angle: -0.12, width: 20 }; } },
		{ id: "tir", name: "Total internal reflection", note: "Light inside glass hitting the surface at a shallow angle cannot get out: above the critical angle (about 42° for n = 1.5) there is no refracted wave and everything reflects. This is how optical fibre works.",
			build: function (m, w, h) { m.fill(function (x, y) { return y > h * 0.5 ? 1.5 : 0; }); return { type: "beam", x: w * 0.22, y: h * 0.78, angle: -0.95, width: 22 }; } },
		{ id: "fibre", name: "Optical fibre", note: "A core of n = 1.5 inside a cladding of n = 1.3. Light that enters at a shallow angle keeps bouncing off the core wall (total internal reflection) and follows the bend-free strip.",
			build: function (m, w, h) { m.fill(function (x, y) { var d = Math.abs(y - h * 0.5); return d < h * 0.1 ? 1.5 : (d < h * 0.2 ? 1.3 : 0); }); return { type: "point", x: w * 0.12, y: h * 0.5 }; } },
		{ id: "mirage", name: "Mirage: a gradient of speed", note: "Hot air near the ground is thinner, so light is faster there (lower n). A wave front tilts towards the slower side, so a beam sent slightly downwards curves back up. Nothing here has an edge, only a smooth slope of n.",
			build: function (m, w, h) { m.fill(function (x, y) { return 1 + 0.9 * (1 - y / h) * (1 - y / h) ; }); return { type: "beam", x: w * 0.1, y: h * 0.62, angle: 0.18, width: 20 }; } },
		{ id: "gravity", name: "Gravity-lens analogue", note: "A heavy mass slows light nearby, as seen from far away. Here n = 1 + k/r around a mass, so passing waves bend towards it and cross behind it. A real lens in space bends light twice as much because space itself is curved; this shows only the 'slow light' half.",
			build: function (m, w, h) { var cx = w * 0.55, cy = h * 0.5; m.fill(function (x, y) { var r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)); return Math.min(3.2, 1 + 14 / (r + 5)); }); return { type: "beam", x: w * 0.1, y: h * 0.5, angle: 0, width: h * 0.55 }; } },
		{ id: "slits", name: "Double slit (a wall)", note: "A mirror wall with two gaps. Each gap sends out its own circular wave and the two overlap, giving bright and dark fans: interference. Draw the Wall brush to add your own barriers.",
			build: function (m, w, h) { var gap = h * 0.07, sep = h * 0.16, wx = w * 0.38; m.wall(function (x, y) { return Math.abs(x - wx) < 2 && Math.abs(Math.abs(y - h / 2) - sep) > gap; }); return { type: "beam", x: w * 0.12, y: h * 0.5, angle: 0, width: h * 0.55 }; } },
		{ id: "cloud", name: "Slow-light cloud", note: "A dense blob where light crawls at one third of c (n = 3). Waves entering it pile up, shorten and ring inside; some leak out. This is how 'slow light' experiments in cold atom clouds work.",
			build: function (m, w, h) { var cx = w * 0.55, cy = h * 0.5, R = h * 0.2; m.fill(function (x, y) { var r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)); return r < R ? 3 : (r < R + 3 ? 1 + 2 * (R + 3 - r) / 3 : 0); }); return { type: "point", x: w * 0.2, y: h * 0.5 }; } }
	];
	L.BYID = {}; L.PRESETS.forEach(function (p) { L.BYID[p.id] = p; });
	L.sourceList = function (s) { return s.type === "point" ? L.pointSource(s.x, s.y) : L.beamSource(s.x, s.y, s.angle, s.width); };

	/* ---------- formatting ---------- */
	L.speedOf = function (n) { return 1 / n; };
	L.critical = function (n1, n2) { return n1 > n2 ? Math.asin(n2 / n1) * 180 / Math.PI : null; };
	if (typeof module !== "undefined" && module.exports) module.exports = L; else root.MESLight = L;
})(typeof window !== "undefined" ? window : this);
