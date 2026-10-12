/* MES Mandelbrot Explorer -- pure maths (browser + node: require('./lib.js')).
 * compute(p) fills a band of rows with smooth escape counts (Float32; -1 = never escaped = inside). It has no outside references so it can be sent to a Web Worker
 * as source text (MESMandel.WORKER_SRC). Fractals: 0 Mandelbrot z^2 + c, 1 Burning Ship, 2 Tricorn (conjugate), 3 Multibrot z^3 + c, 4 Multibrot z^4 + c; every one has a Julia version
 * (c fixed, z0 = the pixel). Double precision: the picture breaks down below a width of about 1e-13 (MESMandel.MINSPAN).
 */
(function (root) {
	"use strict";
	var M = {};
	M.MINSPAN = 4e-14;
	M.TYPES = [
		{ id: 0, name: "Mandelbrot  z² + c", power: 2, home: { x: -0.5, y: 0, span: 3.4 }, julia: { x: 0, y: 0, span: 3.2 } },
		{ id: 1, name: "Burning Ship", power: 2, home: { x: -0.45, y: -0.5, span: 3.6 }, julia: { x: 0, y: 0, span: 3.4 } },
		{ id: 2, name: "Tricorn  (z̄)² + c", power: 2, home: { x: -0.2, y: 0, span: 3.6 }, julia: { x: 0, y: 0, span: 3.2 } },
		{ id: 3, name: "Multibrot  z³ + c", power: 3, home: { x: 0, y: 0, span: 3.0 }, julia: { x: 0, y: 0, span: 3.0 } },
		{ id: 4, name: "Multibrot  z⁴ + c", power: 4, home: { x: -0.1, y: 0, span: 2.8 }, julia: { x: 0, y: 0, span: 2.8 } }
	];

	function compute(p) {
		var w = p.w, r0 = p.r0, r1 = p.r1, out = new Float32Array((r1 - r0) * w), type = p.type, jul = !!p.julia, maxIter = p.maxIter, cxj = p.jx, cyj = p.jy;
		var pw = type >= 3 ? type : 2, lnp = Math.log(pw), lnR = Math.log(256), tol = Math.min(1e-13, p.dx * 1e-3), isM2 = type === 0 && !jul;
		for (var j = r0; j < r1; j++) {
			var py = p.y0 - (j + 0.5) * p.dx;
			for (var i = 0; i < w; i++) {
				var px = p.x0 + (i + 0.5) * p.dx, o = (j - r0) * w + i, cx, cy, x, y;
				if (jul) { cx = cxj; cy = cyj; x = px; y = py; } else { cx = px; cy = py; x = 0; y = 0; }
				if (isM2) {   /* main cardioid and the period-2 bulb are inside for sure */
					var q = (px - 0.25) * (px - 0.25) + py * py;
					if (q * (q + (px - 0.25)) < 0.25 * py * py || (px + 1) * (px + 1) + py * py < 0.0625) { out[o] = -1; continue; }
				}
				var n = 0, x2 = x * x, y2 = y * y, esc = false, sx = x, sy = y, cnt = 0, lim = 8, nx, ny, ax, ay;
				while (n < maxIter) {
					if (x2 + y2 > 65536) { esc = true; break; }
					if (type === 0) { ny = 2 * x * y + cy; nx = x2 - y2 + cx; }
					else if (type === 1) { ax = x < 0 ? -x : x; ay = y < 0 ? -y : y; nx = ax * ax - ay * ay + cx; ny = 2 * ax * ay + cy; }
					else if (type === 2) { nx = x2 - y2 + cx; ny = -2 * x * y + cy; }
					else if (type === 3) { nx = x * (x2 - 3 * y2) + cx; ny = y * (3 * x2 - y2) + cy; }
					else { nx = x2 * x2 - 6 * x2 * y2 + y2 * y2 + cx; ny = 4 * x * y * (x2 - y2) + cy; }
					x = nx; y = ny; x2 = x * x; y2 = y * y; n++;
					if (++cnt >= lim) { sx = x; sy = y; cnt = 0; lim *= 2; } else if ((x - sx < tol && sx - x < tol) && (y - sy < tol && sy - y < tol)) break;   /* came back to a saved point: a cycle */
				}
				if (esc) { var r = Math.sqrt(x2 + y2); out[o] = n + 1 - Math.log(Math.log(r) / lnR) / lnp; if (!(out[o] >= 0)) out[o] = n; }
				else out[o] = -1;
			}
		}
		return out;
	}
	M.compute = compute;
	M.WORKER_SRC = "self.onmessage=function(e){var d=e.data;var buf=(" + compute.toString() + ")(d);self.postMessage({id:d.id,r0:d.r0,r1:d.r1,buf:buf},[buf.buffer]);};";

	/* one point: orbit z0, z1, ... until escape (or n steps); jul = Julia version (c = jc, z0 = the point) */
	M.step = function (type, x, y, cx, cy) {
		var x2 = x * x, y2 = y * y;
		if (type === 0) return [x2 - y2 + cx, 2 * x * y + cy];
		if (type === 1) { var ax = Math.abs(x), ay = Math.abs(y); return [ax * ax - ay * ay + cx, 2 * ax * ay + cy]; }
		if (type === 2) return [x2 - y2 + cx, -2 * x * y + cy];
		if (type === 3) return [x * (x2 - 3 * y2) + cx, y * (3 * x2 - y2) + cy];
		return [x2 * x2 - 6 * x2 * y2 + y2 * y2 + cx, 4 * x * y * (x2 - y2) + cy];
	};
	M.orbit = function (type, julia, jx, jy, px, py, n) {
		var pts = [], x = julia ? px : 0, y = julia ? py : 0, cx = julia ? jx : px, cy = julia ? jy : py;
		pts.push([x, y]);
		for (var i = 0; i < n; i++) { var s = M.step(type, x, y, cx, cy); x = s[0]; y = s[1]; pts.push([x, y]); if (x * x + y * y > 1e6) break; }
		return pts;
	};
	/* classify one point: {inside, n (steps to escape), period (of the cycle it falls into, 0 if unknown), smooth} */
	M.classify = function (type, julia, jx, jy, px, py, maxIter) {
		var band = compute({ w: 1, r0: 0, r1: 1, x0: px - 0.5e-12, y0: py + 0.5e-12, dx: 1e-12, type: type, julia: julia, jx: jx, jy: jy, maxIter: maxIter }), s = band[0];
		var res = { inside: s < 0, smooth: s, n: s < 0 ? maxIter : Math.floor(s), period: 0 };
		if (s < 0) {
			var x = julia ? px : 0, y = julia ? py : 0, cx = julia ? jx : px, cy = julia ? jy : py, hist = [];
			for (var i = 0; i < Math.max(2000, maxIter); i++) { var st = M.step(type, x, y, cx, cy); x = st[0]; y = st[1]; if (i > 1500) hist.push([x, y]); }
			for (var p = 1; p <= 64 && !res.period; p++) { var a = hist[hist.length - 1], b = hist[hist.length - 1 - p]; if (b && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) res.period = p; }
		}
		return res;
	};
	M.autoIter = function (span) { return Math.max(120, Math.min(6000, Math.round(130 + 70 * Math.log2(Math.max(1, 3.4 / span))))); };

	/* ---------- colours ---------- */
	var STOPS = {
		classic: [[0, 7, 100], [32, 107, 203], [237, 255, 255], [255, 170, 0], [0, 2, 0]],
		fire: [[0, 0, 0], [140, 10, 0], [255, 90, 0], [255, 220, 40], [255, 255, 235], [90, 0, 0]],
		ocean: [[2, 8, 40], [10, 70, 130], [40, 190, 200], [220, 250, 255], [20, 120, 170]],
		electric: [[10, 0, 40], [90, 20, 200], [0, 220, 255], [255, 255, 255], [255, 40, 180]],
		forest: [[5, 20, 10], [20, 100, 40], [180, 220, 90], [255, 250, 200], [60, 130, 60]],
		gray: [[0, 0, 0], [255, 255, 255], [0, 0, 0]]
	};
	M.PALETTES = [{ id: "classic", name: "Classic blue and gold" }, { id: "fire", name: "Fire" }, { id: "ocean", name: "Ocean" }, { id: "electric", name: "Electric" }, { id: "forest", name: "Forest" }, { id: "rainbow", name: "Rainbow" }, { id: "gray", name: "Greyscale" }];
	M.lut = function (id) {
		var N = 1024, out = new Uint8Array(N * 3), i;
		if (id === "rainbow") {
			for (i = 0; i < N; i++) { var h = i / N * 6, f = h - Math.floor(h), k = Math.floor(h) % 6, v = 235, p2 = 0, q2 = 235 * (1 - f), t2 = 235 * f, rgb = [[v, t2, p2], [q2, v, p2], [p2, v, t2], [p2, q2, v], [t2, p2, v], [v, p2, q2]][k]; out[i * 3] = rgb[0]; out[i * 3 + 1] = rgb[1]; out[i * 3 + 2] = rgb[2]; }
			return out;
		}
		var st = STOPS[id] || STOPS.classic, m = st.length;
		for (i = 0; i < N; i++) {
			var u = i / N * m, a = Math.floor(u) % m, b = (a + 1) % m, f2 = u - Math.floor(u), s = f2 * f2 * (3 - 2 * f2);
			for (var c = 0; c < 3; c++) out[i * 3 + c] = st[a][c] + (st[b][c] - st[a][c]) * s;
		}
		return out;
	};

	/* ---------- places worth visiting ---------- */
	M.PLACES = {
		0: [{ name: "The whole set", x: -0.5, y: 0, span: 3.4 }, { name: "Seahorse valley", x: -0.7436438870371587, y: 0.13182590420531197, span: 2.5e-3 }, { name: "Spiral", x: -0.761574, y: -0.0847596, span: 2.2e-3 },
			{ name: "Triple spiral valley", x: -0.088, y: 0.654, span: 0.02 }, { name: "Mini Mandelbrot (period 3)", x: -1.7548776662466927, y: 0, span: 0.03 }, { name: "Starfish", x: -0.374004139, y: 0.659792175, span: 4e-3 },
			{ name: "Elephant valley", x: 0.2845, y: 0.0112, span: 0.015 }, { name: "Deep zoom (1e-12)", x: -0.743643135, y: 0.131825963, span: 4e-9 }],
		1: [{ name: "The whole ship", x: -0.45, y: -0.5, span: 3.6 }, { name: "The ship's hull", x: -1.762, y: -0.028, span: 0.06 }, { name: "Mini ship", x: -1.7443, y: -0.0173, span: 0.01 }],
		2: [{ name: "The whole tricorn", x: -0.2, y: 0, span: 3.6 }, { name: "Left tip", x: -1.9, y: 0, span: 0.3 }],
		3: [{ name: "The whole set", x: 0, y: 0, span: 3.0 }, { name: "Outer arm", x: -0.9, y: 0.35, span: 0.3 }],
		4: [{ name: "The whole set", x: -0.1, y: 0, span: 2.8 }, { name: "Arm", x: 0.6, y: 0.6, span: 0.3 }]
	};
	M.JULIAS = [
		{ name: "Douady's rabbit", x: -0.123, y: 0.745 }, { name: "Dendrite", x: 0, y: 1 }, { name: "San Marco", x: -0.75, y: 0 }, { name: "Siegel disk", x: -0.391, y: -0.587 },
		{ name: "Fatou dust", x: 0.285, y: 0.01 }, { name: "Spiral galaxy", x: -0.8, y: 0.156 }, { name: "Circle (c = 0)", x: 0, y: 0 }, { name: "Basilica", x: -1, y: 0 }
	];
	M.fmt = function (x) { var a = Math.abs(x); if (a !== 0 && (a < 1e-4 || a >= 1e6)) return x.toExponential(6); return String(+x.toPrecision(Math.max(6, Math.min(16, 6 + Math.ceil(-Math.log10(Math.max(a, 1e-300))) )))); };
	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESMandel = M;
})(typeof window !== "undefined" ? window : this);
