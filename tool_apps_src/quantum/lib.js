/* MES Quantum Lab core (MESQ): constants, complex FFT (1D / 2D), phase colours, number formatting, canvas helpers and the tab registry.
   Each simulator adds its pure physics in lib-<name>.js (MESQ.<name> = {...}, node-testable) and its UI in ui-<name>.js (MESQ.reg("<tab>", {init, show, hide})).
   Node: var Q = require("./tool_apps_src/quantum/lib.js"); then require each lib-*.js (they attach to the same object). */
(function (root) {
	"use strict";
	var Q = root.MESQ || {};
	/* CODATA 2018 exact / recommended values, SI */
	Q.C = { h: 6.62607015e-34, hbar: 1.054571817e-34, c: 299792458, e: 1.602176634e-19, me: 9.1093837015e-31, mp: 1.67262192369e-27, mn: 1.67492749804e-27,
		kB: 1.380649e-23, eps0: 8.8541878128e-12, a0: 5.29177210903e-11, Ry: 13.605693122994, alpha: 7.2973525693e-3, NA: 6.02214076e23, u: 1.66053906660e-27 };
	Q.eV = Q.C.e;

	/* ---------- complex FFT on split re / im Float64Arrays (length a power of 2), in place. inv = true -> inverse incl. 1/n ---------- */
	var twc = {};
	function tw(n) { if (twc[n]) return twc[n]; var c = new Float64Array(n / 2), s = new Float64Array(n / 2); for (var i = 0; i < n / 2; i++) { c[i] = Math.cos(2 * Math.PI * i / n); s[i] = Math.sin(2 * Math.PI * i / n); } return (twc[n] = { c: c, s: s }); }
	Q.isPow2 = function (n) { return n > 0 && (n & (n - 1)) === 0; };
	Q.fft = function (re, im, inv, off, stride, n) {
		off = off || 0; stride = stride || 1; n = n || re.length;
		var T = tw(n), j = 0, i, k, len, t;
		for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var a = off + i * stride, b = off + j * stride; t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
		var sg = inv ? 1 : -1;
		for (len = 2; len <= n; len <<= 1) {
			var half = len >> 1, step = n / len;
			for (i = 0; i < n; i += len) for (k = 0; k < half; k++) {
				var wr = T.c[k * step], wi = sg * T.s[k * step], p = off + (i + k) * stride, q = off + (i + k + half) * stride;
				var xr = re[q] * wr - im[q] * wi, xi = re[q] * wi + im[q] * wr;
				re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
			}
		}
		if (inv) for (i = 0; i < n; i++) { re[off + i * stride] /= n; im[off + i * stride] /= n; }
	};
	/* 2D FFT of an nx * ny grid stored row-major (index = y * nx + x) */
	Q.fft2 = function (re, im, nx, ny, inv) { var y, x; for (y = 0; y < ny; y++) Q.fft(re, im, inv, y * nx, 1, nx); for (x = 0; x < nx; x++) Q.fft(re, im, inv, x, nx, ny); };
	/* angular wavenumbers of the FFT bins for a grid of n points spaced dx */
	Q.kgrid = function (n, dx) { var k = new Float64Array(n); for (var i = 0; i < n; i++) k[i] = 2 * Math.PI * (i < n / 2 ? i : i - n) / (n * dx); return k; };

	/* ---------- colours ---------- */
	/* phase (radians) -> [r,g,b] on a bright colour wheel (red = 0, yellow, green, cyan, blue, magenta) */
	Q.phaseRGB = function (ph, bright) {
		var h = ((ph / (2 * Math.PI)) % 1 + 1) % 1 * 6, i = Math.floor(h), f = h - i, v = bright == null ? 1 : bright, p = 0, q = v * (1 - f), t = v * f;
		var r = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
		return [Math.round(r[0] * 255), Math.round(r[1] * 255), Math.round(r[2] * 255)];
	};
	/* 0..1 -> a perceptual dark-to-bright ramp (inferno-like) */
	var INF = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
	Q.heat = function (v) { v = v < 0 ? 0 : v > 1 ? 1 : v; var x = v * (INF.length - 1), i = Math.min(INF.length - 2, Math.floor(x)), f = x - i, a = INF[i], b = INF[i + 1]; return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)]; };

	/* ---------- numbers ---------- */
	var SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
	Q.sup = function (s) { return String(s).replace(/[-0-9]/g, function (c) { return SUP[c]; }); };
	/* 1.23 × 10⁻³⁴ style; plain for 0.001 <= |x| < 1e5 */
	Q.fmt = function (x, sig) {
		sig = sig || 3; if (!isFinite(x)) return x > 0 ? "∞" : x < 0 ? "−∞" : "–"; if (x === 0) return "0";
		var a = Math.abs(x), neg = x < 0 ? "−" : "";
		if (a >= 1e-3 && a < 1e5) { var d = Math.max(0, sig - 1 - Math.floor(Math.log10(a))); return neg + Number(a.toFixed(Math.min(10, d))).toLocaleString("en-US", { maximumFractionDigits: Math.min(10, d) }); }
		var e = Math.floor(Math.log10(a)), m = a / Math.pow(10, e); if (Number(m.toFixed(sig - 1)) >= 10) { m /= 10; e++; }
		return neg + m.toFixed(sig - 1) + " × 10" + Q.sup(e);
	};
	/* SI prefix: Q.si(3.2e-9, "m") -> "3.2 nm" */
	var PFX = [[1e24, "Y"], [1e21, "Z"], [1e18, "E"], [1e15, "P"], [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"], [1e-18, "a"], [1e-21, "z"], [1e-24, "y"]];
	Q.si = function (x, unit, sig) {
		sig = sig || 3; if (!isFinite(x)) return "–"; if (x === 0) return "0 " + unit;
		var a = Math.abs(x); for (var i = 0; i < PFX.length; i++) if (a >= PFX[i][0] * 0.9995) { var v = x / PFX[i][0]; return Number(v.toPrecision(sig)) + " " + PFX[i][1] + unit; }
		return Q.fmt(x, sig) + " " + unit;
	};
	Q.clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };

	/* seeded random (mulberry32) so runs can be repeated */
	Q.rng = function (seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
	Q.gauss = function (r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

	/* ---------- tab registry (browser) ---------- */
	Q.ui = Q.ui || {};
	Q.reg = function (tab, obj) { Q.ui[tab] = obj; };

	if (typeof module !== "undefined" && module.exports) module.exports = Q;
	root.MESQ = Q;
})(typeof window !== "undefined" ? window : globalThis);
