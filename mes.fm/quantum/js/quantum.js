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

/* lib-tunnel (MESQ.tunnel): pure physics for the "Tunnelling" and "Wells & energy levels" tabs. No DOM.
   Tunnelling: 1D time-dependent Schrödinger equation (Crank-Nicolson finite differences; see T.Sim), absorbing edges (a per-step
   mask whose removed probability is counted per side), exact transmission T(E) by the transfer matrix.
   Units of the tunnelling solver: energies in eV, time in fs, lengths in "u" where hbar^2/(2m u^2) = C0 = 0.0381 eV, i.e. 1 u = 1 nm
   for an electron and 1 nm * sqrt(m_e/m) for a particle of mass m (the same picture, scaled: lenUnit(m) gives u in nm).
   Wells: stationary states of a 1D potential by finite differences (symmetric tridiagonal), eigenvalues by Sturm-sequence bisection,
   eigenvectors by inverse iteration. Lengths there are real nm and c = C0 * m_e / m. */
(function (root) {
	"use strict";
	var Q = root.MESQ || (typeof require !== "undefined" ? require("./lib.js") : {});
	var T = {};
	var C = Q.C;
	T.C0 = C.hbar * C.hbar / (2 * C.me) / (C.e * 1e-18);   // hbar^2 / (2 m_e) in eV nm^2 = 0.0380998
	T.HBAR = C.hbar / C.e * 1e15;                            // hbar in eV fs = 0.6582
	T.H = 2 * Math.PI * T.HBAR;                              // h in eV fs
	T.lenUnit = function (mass) { return Math.sqrt(1 / mass); };   // nm per u for a particle of mass (in electron masses)
	T.MASSES = { electron: 1, proton: C.mp / C.me, neutron: C.mn / C.me, alpha: 6.6446573357e-27 / C.me, muon: 206.7682830 };

	/* ---------------- potentials for the tunnelling tab ----------------
	   type: rect | stepup | stepdown | double | well | tri | alpha.  p = {V (eV), a (u), g (u, double-barrier gap)}
	   returns {V(x), xa, xb, VL, kind, pieces (exact constant segments, or null), labels} */
	T.shape = function (type, p) {
		var V = +p.V, a = Math.max(0.02, +p.a), g = Math.max(0.05, +(p.g == null ? 1 : p.g));
		var s = { type: type, V0: V, a: a, g: g, VL: 0, pieces: null, labels: ["Reflected", "Inside", "Transmitted"] };
		if (type === "rect") { s.xa = -a / 2; s.xb = a / 2; s.pieces = [{ V: V, d: a }]; s.f = function (x) { return x >= -a / 2 && x < a / 2 ? V : 0; }; }
		else if (type === "stepup" || type === "stepdown") { var h = type === "stepup" ? V : -V; s.xa = 0; s.xb = 0; s.pieces = []; s.VR = h; s.f = function (x) { return x >= 0 ? h : 0; }; s.labels = ["Reflected", "At the step", "Transmitted"]; }
		else if (type === "double") { s.xa = -g / 2 - a; s.xb = g / 2 + a; s.pieces = [{ V: V, d: a }, { V: 0, d: g }, { V: V, d: a }]; s.f = function (x) { var q = Math.abs(x); return q >= g / 2 && q < g / 2 + a ? V : 0; }; s.labels = ["Reflected", "Between / inside", "Transmitted"]; }
		else if (type === "well") { s.xa = -a / 2; s.xb = a / 2; s.pieces = [{ V: -V, d: a }]; s.f = function (x) { return x >= -a / 2 && x < a / 2 ? -V : 0; }; s.labels = ["Reflected", "Over the well", "Transmitted"]; }
		else if (type === "tri") { s.xa = 0; s.xb = a; s.f = function (x) { return x >= 0 && x < a ? V * (1 - x / a) : 0; }; }
		else if (type === "alpha") {
			/* a nucleus-like well [-W, 0] (floor -Vd, hard wall left of it) and a Coulomb-like tail V*r0/(x + r0) outside */
			var W = Math.max(4, +(p.W || 10)), Vd = Math.max(0.2, +(p.Vd == null ? V * 0.5 : p.Vd)), r0 = a, Vw = Math.max(10, 3 * V);
			s.W = W; s.Vd = Vd; s.xa = -W; s.xb = 0; s.VL = -Vd; s.wall = -W; s.Vwall = Vw;
			s.f = function (x) { return x < -W ? Vw : x < 0 ? -Vd : V * r0 / (x + r0); };
			s.labels = ["(wall)", "Still inside the nucleus", "Escaped"];
		}
		else return T.shape("rect", p);
		return s;
	};

	/* ---------------- transfer matrix ----------------
	   segs = [{V, d}] in order, left lead at VL, right lead at VR. Returns T = (kR/kL)|t|^2 (0 if E is below either lead).
	   Uses the real 2x2 matrices that carry (psi, psi') across a constant region; only the boundary vectors are complex. */
	T.trans = function (E, segs, VL, VR, c) {
		c = c || T.C0; VL = VL || 0; VR = VR == null ? VL : VR;
		if (!(E > VL) || !(E > VR)) return 0;
		var kL = Math.sqrt((E - VL) / c), kR = Math.sqrt((E - VR) / c);
		/* start at the right edge with psi = 1, psi' = i kR; go leftwards */
		var pr = 1, pi = 0, dr = 0, di = kR;
		for (var j = segs.length - 1; j >= 0; j--) {
			var d = segs[j].d; if (!(d > 0)) continue;
			var q = (E - segs[j].V) / c, A, B, Cc, D; // backward: [[cos, -sin/k],[k sin, cos]]
			if (q > 1e-14) { var k = Math.sqrt(q), cs = Math.cos(k * d), sn = Math.sin(k * d); A = cs; B = -sn / k; Cc = k * sn; D = cs; }
			else if (q < -1e-14) { var kk = Math.sqrt(-q), x = kk * d; if (x > 700) return 0; var ch = Math.cosh(x), sh = Math.sinh(x); A = ch; B = -sh / kk; Cc = -kk * sh; D = ch; }
			else { A = 1; B = -d; Cc = 0; D = 1; }
			var npr = A * pr + B * dr, npi = A * pi + B * di, ndr = Cc * pr + D * dr, ndi = Cc * pi + D * di;
			pr = npr; pi = npi; dr = ndr; di = ndi;
		}
		/* psi = A + B, psi' = i kL (A - B) -> A = (psi + psi'/(i kL)) / 2 ; psi'/(i kL) = (di - i dr)/kL */
		var ar = (pr + di / kL) / 2, ai = (pi - dr / kL) / 2, a2 = ar * ar + ai * ai;
		if (!(a2 > 0) || !isFinite(a2)) return 0;
		return Math.min(1, (kR / kL) / a2);
	};
	/* closed form for a rectangular barrier of height V and width a (tests) */
	T.rectT = function (E, V, a, c) {
		c = c || T.C0; if (E <= 0) return 0;
		if (Math.abs(E - V) < 1e-12) return 1 / (1 + V * a * a / (4 * c));
		if (E < V) { var k = Math.sqrt((V - E) / c), s = Math.sinh(k * a); return 1 / (1 + V * V * s * s / (4 * E * (V - E))); }
		var kp = Math.sqrt((E - V) / c), sn = Math.sin(kp * a); return 1 / (1 + V * V * sn * sn / (4 * E * (E - V)));
	};
	/* segments of a shape: exact pieces where they exist, else n slices of the smooth part (alpha tail up to xEnd) */
	T.segs = function (s, xEnd, n) {
		if (s.pieces) return { segs: s.pieces, VL: s.VL || 0, VR: s.VR == null ? (s.VL || 0) : s.VR };
		n = n || 600; var x0 = s.type === "alpha" ? 0 : s.xa, x1 = s.type === "alpha" ? xEnd : s.xb, d = (x1 - x0) / n, out = [];
		for (var i = 0; i < n; i++) out.push({ V: s.f(x0 + (i + 0.5) * d), d: d });
		return { segs: out, VL: s.VL || 0, VR: s.type === "alpha" ? s.f(xEnd) : 0 };
	};
	T.TofE = function (s, E, xEnd, c) { var g = T.segs(s, xEnd); return T.trans(E, g.segs, g.VL, g.VR, c); };
	/* transmission averaged over a Gaussian packet's momentum spread: |psi|^2 has width sigma, |phi(k)|^2 width 1/(2 sigma). */
	T.tAvg = function (s, E, sigma, xEnd, c) {
		c = c || T.C0; var VL = s.VL || 0, k0 = Math.sqrt(Math.max(0, E - VL) / c), sk = 1 / (2 * sigma), sum = 0, w = 0, n = 241;
		var g = T.segs(s, xEnd);
		for (var i = 0; i < n; i++) {
			var k = k0 + sk * (-5 + 10 * i / (n - 1)), wt = Math.exp(-(k - k0) * (k - k0) / (2 * sk * sk));
			w += wt; if (k > 0) sum += wt * T.trans(VL + c * k * k, g.segs, g.VL, g.VR, c);
		}
		return sum / w;
	};
	T.kappa = function (V, E, c) { c = c || T.C0; return V > E ? Math.sqrt((V - E) / c) : 0; };

	/* ---------------- TDSE solver ----------------
	   Crank-Nicolson on a finite-difference grid: (1 + i H dt/2hbar) psi(t+dt) = (1 - i H dt/2hbar) psi(t), solved by the Thomas algorithm.
	   It is exactly unitary and maps each eigenstate of the grid Hamiltonian onto itself, so sharp potential edges are handled cleanly.
	   (A split-operator FFT step was tried first: its splitting error at a sudden potential jump sprays a little of the wave into very
	   high momenta, which is harmless for big transmissions but doubled tiny ones such as an STM gap.) The kinetic energy check uses Q.fft.
	   Absorbing edges: after each step the wave is multiplied by exp(-G0 u^2 dt) in the outer 12% on each side; what that removes is
	   counted as reflected (left) or transmitted (right).
	   opt = {shape, E, sigma, x0 (optional), N, L (domain length, u)} */
	T.Sim = function (opt) { this.set(opt); };
	T.Sim.prototype.set = function (o) {
		var N = o.N || 2048, L = o.L || 120, s = o.shape; this.N = N; this.L = L; this.s = s; this.E = o.E; this.sigma = o.sigma;
		var dx = L / N; this.dx = dx; this.x = new Float64Array(N);
		for (var i = 0; i < N; i++) this.x[i] = -L / 2 + i * dx;
		var lab = 0.12 * L; this.xL = -L / 2 + lab; this.xR = L / 2 - lab; this.lab = lab;
		var V = new Float64Array(N), vmax = 0;
		/* each grid value is the average of V over its cell (16 samples), so a barrier keeps its true area even when its edges fall between points */
		for (i = 0; i < N; i++) { var acc = 0; for (var q = 0; q < 16; q++) { var xx = Math.min(Math.max(this.x[i] + dx * ((q + 0.5) / 16 - 0.5), this.xL), this.xR); acc += s.f(xx); } V[i] = acc / 16; vmax = Math.max(vmax, Math.abs(V[i])); }
		this.V = V;
		var VL = s.VL || 0; if (o.x0 != null) this.x0 = o.x0;
		else if (s.type === "alpha") this.x0 = -s.W / 2;
		else this.x0 = Math.max(this.xL + 4 * o.sigma + 1, s.xa - 4 * o.sigma - 1.5);
		var ke = Math.max(0.002, o.E - VL);
		var dt = Math.min(0.05, 0.25 * T.HBAR / Math.max(vmax, o.E, ke, 0.5));
		this.dt = dt;
		this.re = new Float64Array(N); this.im = new Float64Array(N); this.rr = new Float64Array(N); this.ri = new Float64Array(N);
		this.mask = new Float64Array(N);
		/* A = 1 + i al H with al = dt/(2 hbar): diag 1 + i al (2c/dx^2 + V), off-diagonal i al (-c/dx^2) = i be.
		   Thomas: cp_i = b / den_i, den_i = a_i - b cp_{i-1}; store 1/den (complex) and cp (complex). */
		var al = dt / (2 * T.HBAR), cdx = T.C0 / (dx * dx), be = -al * cdx; this.al = al; this.cdx = cdx; this.be = be;
		var cpr = new Float64Array(N), cpi = new Float64Array(N), idr = new Float64Array(N), idi = new Float64Array(N), pr = 0, pi = 0;
		for (i = 0; i < N; i++) {
			var ar = 1, ai = al * (2 * cdx + V[i]);
			/* den = a - b * cp_{i-1}, b = i be */
			var dr = ar - (-be * pi), di = ai - (be * pr);
			var m = dr * dr + di * di; idr[i] = dr / m; idi[i] = -di / m;
			/* cp = b / den = (i be) * (1/den) */
			pr = -be * idi[i]; pi = be * idr[i]; cpr[i] = pr; cpi[i] = pi;
		}
		this.cpr = cpr; this.cpi = cpi; this.idr = idr; this.idi = idi;
		var G0 = 1.2;  // absorber strength 1/fs at the outer edge
		for (i = 0; i < N; i++) { var u = this.x[i] < this.xL ? (this.xL - this.x[i]) / lab : this.x[i] > this.xR ? (this.x[i] - this.xR) / lab : 0; this.mask[i] = Math.exp(-G0 * u * u * dt); }
		/* wavenumber whose grid energy 2c(1 - cos k dx)/dx^2 is exactly the kinetic energy asked for */
		var cq = 1 - ke * dx * dx / (2 * T.C0); this.k0 = cq > -1 ? Math.acos(cq) / dx : Math.PI / dx;
		this.reset();
	};
	T.Sim.prototype.reset = function () {
		var N = this.N, s2 = 4 * this.sigma * this.sigma, nrm = 0, i;
		for (i = 0; i < N; i++) { var d = this.x[i] - this.x0, a = Math.exp(-d * d / s2); this.re[i] = a * Math.cos(this.k0 * this.x[i]); this.im[i] = a * Math.sin(this.k0 * this.x[i]); nrm += a * a; }
		nrm = Math.sqrt(nrm * this.dx); for (i = 0; i < N; i++) { this.re[i] /= nrm; this.im[i] /= nrm; }
		this.t = 0; this.absL = 0; this.absR = 0; this.nsteps = 0;
		this.E0 = this.energy();
	};
	T.Sim.prototype.step = function (n) {
		var N = this.N, re = this.re, im = this.im, rr = this.rr, ri = this.ri, V = this.V, al = this.al, cdx = this.cdx, be = this.be,
			cpr = this.cpr, cpi = this.cpi, idr = this.idr, idi = this.idi, m = this.mask, dx = this.dx, i;
		n = n || 1;
		for (var s = 0; s < n; s++) {
			/* rhs = (1 - i al H) psi ; H psi_i = (2c/dx^2 + V_i) psi_i - c/dx^2 (psi_{i-1} + psi_{i+1}) */
			for (i = 0; i < N; i++) {
				var lr = i > 0 ? re[i - 1] : 0, li = i > 0 ? im[i - 1] : 0, ur = i < N - 1 ? re[i + 1] : 0, ui = i < N - 1 ? im[i + 1] : 0;
				var hr = (2 * cdx + V[i]) * re[i] - cdx * (lr + ur), hi = (2 * cdx + V[i]) * im[i] - cdx * (li + ui);
				rr[i] = re[i] + al * hi; ri[i] = im[i] - al * hr;
			}
			/* forward sweep: d'_i = (r_i - b d'_{i-1}) / den_i with b = i be */
			var pr = 0, pi = 0;
			for (i = 0; i < N; i++) {
				var xr = rr[i] - (-be * pi), xi = ri[i] - (be * pr);
				pr = xr * idr[i] - xi * idi[i]; pi = xr * idi[i] + xi * idr[i];
				rr[i] = pr; ri[i] = pi;
			}
			/* back substitution: psi_i = d'_i - cp_i psi_{i+1} */
			var nr = rr[N - 1], ni = ri[N - 1]; re[N - 1] = nr; im[N - 1] = ni;
			for (i = N - 2; i >= 0; i--) { var a2 = rr[i] - (cpr[i] * nr - cpi[i] * ni), b2 = ri[i] - (cpr[i] * ni + cpi[i] * nr); re[i] = a2; im[i] = b2; nr = a2; ni = b2; }
			/* absorbing edges */
			for (i = 0; i < N; i++) {
				var mm = m[i]; if (mm >= 1) continue;
				var p0 = re[i] * re[i] + im[i] * im[i]; re[i] *= mm; im[i] *= mm;
				var lost = p0 * (1 - mm * mm) * dx; if (i < N / 2) this.absL += lost; else this.absR += lost;
			}
			this.t += this.dt; this.nsteps++;
		}
	};
	T.Sim.prototype.stats = function () {
		var pL = 0, pI = 0, pR = 0, N = this.N, xa = this.s.xa, xb = this.s.xb, sx = 0, i;
		for (i = 0; i < N; i++) { var p = (this.re[i] * this.re[i] + this.im[i] * this.im[i]) * this.dx, x = this.x[i]; if (x < xa) pL += p; else if (x < xb) pI += p; else pR += p; sx += p * x; }
		var tot = pL + pI + pR;
		return { left: pL + this.absL, inside: pI, right: pR + this.absR, onGrid: tot, absL: this.absL, absR: this.absR, t: this.t, xm: tot > 1e-9 ? sx / tot : NaN };
	};
	T.Sim.prototype.norm = function () { var s = 0; for (var i = 0; i < this.N; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i]; return s * this.dx; };
	/* <H> of what is on the grid, with the same finite-difference kinetic energy the solver uses, divided by the norm */
	T.Sim.prototype.energy = function () {
		var N = this.N, ek = 0, ev = 0, nn = 0, i;
		for (i = 0; i < N; i++) { var p = this.re[i] * this.re[i] + this.im[i] * this.im[i]; ev += p * this.V[i]; nn += p; if (i < N - 1) { var dr = this.re[i + 1] - this.re[i], di = this.im[i + 1] - this.im[i]; ek += dr * dr + di * di; } }
		return (T.C0 * ek / (this.dx * this.dx) + ev) / nn;
	};
	/* kinetic energy from the momentum distribution (FFT): the continuum value, for comparison */
	T.Sim.prototype.kineticFFT = function () {
		var N = this.N, re = Float64Array.from(this.re), im = Float64Array.from(this.im), kg = Q.kgrid(N, this.dx), ek = 0, nk = 0;
		Q.fft(re, im, false);
		for (var i = 0; i < N; i++) { var q = re[i] * re[i] + im[i] * im[i]; ek += q * T.C0 * kg[i] * kg[i]; nk += q; }
		return ek / nk;
	};

	/* ================= wells: stationary states ================= */
	/* number of eigenvalues below lam of the symmetric tridiagonal matrix (diag d, off-diagonal e[i] between i and i+1) */
	T.sturm = function (d, e, lam) {
		var n = d.length, cnt = 0, q = d[0] - lam;
		if (q < 0) cnt++;
		for (var i = 1; i < n; i++) { if (q === 0) q = 1e-300; q = d[i] - lam - e[i - 1] * e[i - 1] / q; if (q < 0) cnt++; }
		return cnt;
	};
	/* lowest K eigenpairs. Returns {E: [...], vec: [Float64Array]} with sum(vec^2) = 1 */
	T.eig = function (d, e, K) {
		var n = d.length, lo = Infinity, hi = -Infinity, i;
		for (i = 0; i < n; i++) { var r = (i > 0 ? Math.abs(e[i - 1]) : 0) + (i < n - 1 ? Math.abs(e[i]) : 0); lo = Math.min(lo, d[i] - r); hi = Math.max(hi, d[i] + r); }
		K = Math.min(K, n); var E = [], vec = [];
		for (var k = 0; k < K; k++) {
			var a = lo, b = hi;
			for (var it = 0; it < 200; it++) { var m = 0.5 * (a + b); if (T.sturm(d, e, m) > k) b = m; else a = m; if (b - a <= 1e-13 * Math.max(1, Math.abs(m))) break; }
			E.push(0.5 * (a + b));
		}
		for (k = 0; k < K; k++) vec.push(T.invIter(d, e, E[k], k > 0 ? E[k] - E[k - 1] : 1));
		return { E: E, vec: vec };
	};
	/* inverse iteration with the Thomas algorithm (partial pivoting not needed for a tiny shift off the eigenvalue) */
	T.invIter = function (d, e, lam, gap) {
		var n = d.length, x = new Float64Array(n), cp = new Float64Array(n), dp = new Float64Array(n), i, it;
		var sh = lam + Math.max(1e-10, Math.abs(gap) * 1e-7) * 1e-3;
		for (i = 0; i < n; i++) x[i] = 1 + 0.1 * Math.sin(1.7 * i);
		for (it = 0; it < 3; it++) {
			var b0 = d[0] - sh; if (b0 === 0) b0 = 1e-300;
			cp[0] = (n > 1 ? e[0] : 0) / b0; dp[0] = x[0] / b0;
			for (i = 1; i < n; i++) { var den = d[i] - sh - e[i - 1] * cp[i - 1]; if (den === 0) den = 1e-300; cp[i] = i < n - 1 ? e[i] / den : 0; dp[i] = (x[i] - e[i - 1] * dp[i - 1]) / den; }
			x[n - 1] = dp[n - 1]; for (i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
			var s = 0; for (i = 0; i < n; i++) s += x[i] * x[i]; s = Math.sqrt(s); for (i = 0; i < n; i++) x[i] /= s;
		}
		/* sign: the first clearly non-zero lobe from the left is positive */
		var mx = 0; for (i = 0; i < n; i++) mx = Math.max(mx, Math.abs(x[i]));
		for (i = 0; i < n; i++) if (Math.abs(x[i]) > 0.05 * mx) { if (x[i] < 0) for (var j = 0; j < n; j++) x[j] = -x[j]; break; }
		return x;
	};

	/* well potentials. p by type (lengths nm, energies eV):
	   inf {L} ; fin {a, V} ; ho {w = hbar*omega} ; dw {V, b} ; morse {D, a (1/nm), re} ; lin {F (eV/nm)} ; custom {L, pts: [eV...]} */
	T.WELLS = ["inf", "fin", "ho", "dw", "morse", "lin", "custom"];
	T.well = function (type, p, c) {
		c = c || T.C0; var w = { type: type, c: c, bound: Infinity };
		if (type === "inf") { var L = +p.L; w.x0 = 0; w.x1 = L; w.f = function () { return 0; }; w.top = 1.2 * 16 * Math.PI * Math.PI * c / (L * L); }
		else if (type === "fin") { var a = +p.a, V = +p.V, m = a / 2 + Math.max(0.6 * a, 7 * Math.sqrt(c / V)); w.x0 = -m; w.x1 = m; w.f = function (x) { return Math.abs(x) < a / 2 ? 0 : V; }; w.bound = V; w.top = V * 1.25; }
		else if (type === "ho") { var hw = +p.w, X = 1.5 * 2 * Math.sqrt(c * 16 * hw) / hw; w.x0 = -X; w.x1 = X; w.f = function (x) { return hw * hw * x * x / (4 * c); }; w.top = 10.5 * hw; }
		else if (type === "dw") { var V0 = +p.V, b = +p.b; w.x0 = -2.3 * b; w.x1 = 2.3 * b; w.f = function (x) { var q = x * x / (b * b) - 1; return V0 * q * q; }; w.top = 2.2 * V0; }
		else if (type === "morse") { var D = +p.D, al = +p.a, re = +p.re; w.x0 = Math.max(re - 1.15 / al, re * 0.05); w.x1 = re + 6.5 / al; w.f = function (x) { var q = 1 - Math.exp(-al * (x - re)); return D * q * q; }; w.bound = D; w.top = D * 1.15; }
		else if (type === "lin") { var F = +p.F, e1 = Math.cbrt(c * F * F), X2 = 1.35 * 12.83 * e1 / F; w.x0 = 0; w.x1 = X2; w.f = function (x) { return F * x; }; w.top = 10.5 * e1; w.e1 = e1; }
		else { var Lc = +p.L, pts = p.pts || [1, 0.5, 0, 0.2, 0.6, 0.2, 0, 0.5, 1], n = pts.length; w.x0 = -Lc / 2; w.x1 = Lc / 2;
			w.f = function (x) { var u = (x - w.x0) / (w.x1 - w.x0) * (n - 1), i = Math.max(0, Math.min(n - 2, Math.floor(u))), t = u - i; return pts[i] * (1 - t) + pts[i + 1] * t; };
			var vm = 0; for (var j = 0; j < n; j++) vm = Math.max(vm, pts[j]); w.top = Math.max(vm * 1.25, 0.2); }
		return w;
	};
	/* solve: hard walls (psi = 0) at x0 and x1, N interior points. K levels (only those below w.bound are kept). */
	T.solveWell = function (w, N, K) {
		N = N || 1000; K = K || 12;
		var dx = (w.x1 - w.x0) / (N + 1), d = new Float64Array(N), e = new Float64Array(N - 1), x = new Float64Array(N), V = new Float64Array(N), c = w.c, i;
		for (i = 0; i < N; i++) { x[i] = w.x0 + (i + 1) * dx; V[i] = w.f(x[i]); d[i] = 2 * c / (dx * dx) + V[i]; }
		for (i = 0; i < N - 1; i++) e[i] = -c / (dx * dx);
		var r = T.eig(d, e, K), keep = [], vecs = [];
		for (i = 0; i < r.E.length; i++) if (r.E[i] < w.bound) {
			var v = r.vec[i], s = 1 / Math.sqrt(dx); for (var j = 0; j < N; j++) v[j] *= s;   // now sum(v^2) dx = 1
			keep.push(r.E[i]); vecs.push(v);
		}
		return { E: keep, psi: vecs, x: x, V: V, dx: dx, N: N };
	};
	/* expectation of x for state n, and between superposition helpers */
	T.expX = function (sol, n) { var s = 0, v = sol.psi[n]; for (var i = 0; i < sol.N; i++) s += v[i] * v[i] * sol.x[i]; return s * sol.dx; };
	/* superposition sum_n a_n psi_n exp(-i E_n t / hbar): writes re, im (Float64Array N); amps = [{n, a}] with sum a^2 = 1 */
	T.superpose = function (sol, amps, t, re, im) {
		re.fill(0); im.fill(0);
		for (var j = 0; j < amps.length; j++) {
			var n = amps[j].n, a = amps[j].a, ph = -sol.E[n] * t / T.HBAR, cr = a * Math.cos(ph), ci = a * Math.sin(ph), v = sol.psi[n];
			for (var i = 0; i < sol.N; i++) { re[i] += cr * v[i]; im[i] += ci * v[i]; }
		}
	};
	/* bound-state count of a finite square well (width a, depth V): ceil(z0 * 2 / pi) with z0 = (a/2) sqrt(V/c) */
	T.finCount = function (a, V, c) { c = c || T.C0; return Math.ceil((a / 2) * Math.sqrt(V / c) * 2 / Math.PI); };
	T.morseE = function (n, D, a, c) { c = c || T.C0; var hw = 2 * a * Math.sqrt(D * c), v = n + 0.5; return hw * v - hw * hw * v * v / (4 * D); };
	T.AIRY = [2.33810741, 4.08794944, 5.52055983, 6.78670809, 7.94413359, 9.02265085, 10.04017434, 11.00852430, 11.93601556, 12.82877675];

	Q.tunnel = T;
	if (typeof module !== "undefined" && module.exports) module.exports = Q;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Quantum Lab: double slit (MESQ.slit) and uncertainty (MESQ.uncert). Pure maths, no DOM, node-testable.
   slit:   de Broglie wavelengths of real particles, the exact Fraunhofer pattern of N slits (with partial which-path information),
           a sampler for single-particle arrivals, and a 2D split-operator Schrodinger solver with de Broglie-Bohm tracers.
   uncert: 1D wave packets, their momentum distribution (FFT), Δx and Δp, and exact free spreading. Units: ħ = m = 1 in the solvers. */
(function (root) {
	"use strict";
	var Q = root.MESQ || (typeof require !== "undefined" ? require("./lib.js") : {});
	var C = Q.C, TAU = 2 * Math.PI;

	/* ===================================================== MESQ.slit ===================================================== */
	var S = {};
	/* particles: mass (kg; 0 = photon), energy slider range (eV, log), default energy, typical slits (m) and screen distance (m) */
	S.PARTICLES = {
		electron: { name: "Electron", m: C.me, Emin: 10, Emax: 3e5, E: 5e4, a: 0.3e-6, d: 1.5e-6, L: 1, note: "Electron microscope energies (tens of keV). Jönsson (1961) made real slits for electrons; Tonomura's team (1989) recorded single electrons building up the stripes." },
		neutron: { name: "Neutron", m: C.mn, Emin: 1e-5, Emax: 1, E: 2.4e-4, a: 22e-6, d: 125e-6, L: 5, note: "Slow (cold) neutrons with a wavelength of about 2 nm, as used in the neutron double-slit work of Zeilinger and colleagues (1988)." },
		c60: { name: "C₆₀ buckyball", m: 720 * C.u, Emin: 0.005, Emax: 5, E: 0.18, a: 50e-9, d: 100e-9, L: 1.25, note: "Buckyballs (60 carbon atoms) at about 220 m/s through a grating of 100 nm period: Arndt, Zeilinger and colleagues (1999). λ ≈ 2.5 pm, far smaller than the molecule." },
		photon: { name: "Photon (light)", m: 0, Emin: 1.0, Emax: 4.0, E: 1.96, a: 40e-6, d: 250e-6, L: 2, note: "Visible light: Young's experiment (around 1801). 1.96 eV is the red helium-neon laser line (633 nm)." }
	};
	/* kinetic energy (eV) -> {lambda (m), p (kg m/s), v (m/s)}, relativistic */
	S.debroglie = function (key, EeV) {
		var P = typeof key === "string" ? S.PARTICLES[key] : key, E = EeV * C.e, p, v;
		if (!P.m) { p = E / C.c; v = C.c; }
		else { var mc2 = P.m * C.c * C.c; p = Math.sqrt(E * E + 2 * E * mc2) / C.c; v = p * C.c * C.c / (E + mc2); }
		return { lambda: C.h / p, p: p, v: v };
	};
	/* inverse: wavelength -> kinetic energy (eV) */
	S.energyFor = function (key, lambda) {
		var P = typeof key === "string" ? S.PARTICLES[key] : key, p = C.h / lambda;
		if (!P.m) return p * C.c / C.e;
		var mc2 = P.m * C.c * C.c; return (Math.sqrt(p * p * C.c * C.c + mc2 * mc2) - mc2) / C.e;
	};
	function sinc(x) { return Math.abs(x) < 1e-8 ? 1 - x * x / 6 : Math.sin(x) / x; }
	S.sinc = sinc;
	/* relative intensity at angle sin(theta): o = {a, d, n, lambda, V (fringe visibility 0..1, default 1)}. Peak (centre) = 1.
	   Coherent N slits: sinc²(β)·[sin(Nγ)/(N sin γ)]², β = π a sinθ / λ, γ = π d sinθ / λ.
	   With which-path information: (V)·coherent + (1-V)·incoherent, incoherent = sinc²(β)/N (the separate single-slit patterns added). */
	S.grating = function (g, n) {
		if (n <= 1) return 1;
		var s = Math.sin(g);
		if (Math.abs(s) < 1e-9) return 1;
		var r = Math.sin(n * g) / (n * s); return r * r;
	};
	S.intensity = function (sn, o) {
		var n = o.n || 1, V = o.V == null ? 1 : o.V, b = Math.PI * o.a * sn / o.lambda, env = sinc(b); env *= env;
		if (n <= 1) return env;
		var g = Math.PI * o.d * sn / o.lambda, coh = S.grating(g, n);
		/* normalise so that the centre is 1 in both limits: coherent centre = 1, incoherent centre = 1/n -> scale */
		var mix = V * coh + (1 - V) / n, centre = V + (1 - V) / n;
		return env * mix / centre;
	};
	/* fringe visibility from which-path distinguishability D (0 = no information, 1 = full): V = sqrt(1 - D²) */
	S.visibility = function (D) { D = Q.clamp(D, 0, 1); return Math.sqrt(1 - D * D); };
	/* angular positions: envelope zeros sinθ = mλ/a, double-slit dark fringes sinθ = (m+½)λ/d, bright fringes mλ/d */
	S.envZero = function (m, o) { return m * o.lambda / o.a; };
	S.darkFringe = function (m, o) { return (m + 0.5) * o.lambda / o.d; };
	S.brightFringe = function (m, o) { return m * o.lambda / o.d; };
	/* tabulated cumulative distribution over theta in [-thMax, thMax] (probability per unit angle ∝ I) */
	S.cdf = function (o, thMax, M) {
		M = M || 4096;
		var th = new Float64Array(M + 1), I = new Float64Array(M + 1), c = new Float64Array(M + 1), i;
		for (i = 0; i <= M; i++) { th[i] = -thMax + 2 * thMax * i / M; I[i] = S.intensity(Math.sin(th[i]), o); }
		c[0] = 0; for (i = 1; i <= M; i++) c[i] = c[i - 1] + 0.5 * (I[i] + I[i - 1]);
		var tot = c[M]; for (i = 0; i <= M; i++) c[i] /= tot;
		return { th: th, I: I, c: c, M: M, thMax: thMax };
	};
	/* one arrival angle from a uniform random number u */
	S.sample = function (T, u) {
		var lo = 0, hi = T.M; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (T.c[mid] < u) lo = mid; else hi = mid; }
		var dc = T.c[hi] - T.c[lo], f = dc > 0 ? (u - T.c[lo]) / dc : 0.5;
		return T.th[lo] + f * (T.th[hi] - T.th[lo]);
	};
	/* screen geometry: fringe spacing (small angles), central envelope full width, etc. */
	S.geometry = function (o, L) {
		return { fringe: o.lambda * L / o.d, envelope: 2 * o.lambda * L / o.a, angle: o.lambda / o.d, perEnvelope: 2 * o.d / o.a };
	};
	/* centres of n slits spaced d about c */
	S.centres = function (n, d, c) { var r = []; for (var j = 0; j < n; j++) r.push(c + (j - (n - 1) / 2) * d); return r; };

	/* fast square 2D FFT for the solver: contiguous rows, columns done on a transposed copy, cached bit-reversal + twiddles.
	   Same convention as Q.fft2 (forward e^{-ikx}, inverse divides by n²). */
	var F2 = {};
	function plan(n) {
		if (F2[n]) return F2[n];
		var br = new Int32Array(n), bits = Math.round(Math.log2(n)), c = new Float64Array(n / 2), s = new Float64Array(n / 2), i;
		for (i = 0; i < n; i++) { var r = 0, x = i; for (var b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } br[i] = r; }
		for (i = 0; i < n / 2; i++) { c[i] = Math.cos(TAU * i / n); s[i] = Math.sin(TAU * i / n); }
		return (F2[n] = { br: br, c: c, s: s, tr: new Float64Array(n * n), ti: new Float64Array(n * n) });
	}
	function rows(re, im, n, inv, P) {
		var br = P.br, C = P.c, Sn = P.s, sg = inv ? 1 : -1;
		for (var o = 0; o < n * n; o += n) {
			for (var i = 0; i < n; i++) { var j = br[i]; if (i < j) { var a = o + i, b = o + j, t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
			for (var len = 2; len <= n; len <<= 1) {
				var half = len >> 1, step = n / len;
				for (var st = 0; st < n; st += len) for (var k = 0, w = 0; k < half; k++, w += step) {
					var wr = C[w], wi = sg * Sn[w], p = o + st + k, q = p + half;
					var xr = re[q] * wr - im[q] * wi, xi = re[q] * wi + im[q] * wr;
					re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
				}
			}
		}
	}
	function transpose(a, b, n) { for (var y = 0; y < n; y++) { var o = y * n; for (var x = 0; x < n; x++) b[x * n + y] = a[o + x]; } }
	S.fft2 = function (re, im, n, inv) {
		var P = plan(n), tr = P.tr, ti = P.ti;
		rows(re, im, n, inv, P); transpose(re, tr, n); transpose(im, ti, n);
		rows(tr, ti, n, inv, P); transpose(tr, re, n); transpose(ti, im, n);
		if (inv) { var f = 1 / (n * n); for (var i = 0; i < n * n; i++) { re[i] *= f; im[i] *= f; } }
	};

	/* ---------- 2D solver: iħ ∂ψ/∂t = -ħ²/2m ∇²ψ + Vψ with ħ = m = 1, split operator, absorbing borders ----------
	   o = {n (grid, power of 2), L (box size), dt, k0, wallX, wallW, V0, slits: [[y0, y1], ...] (open intervals in y), x0, y0, sx, sy, absorb (width), eta} */
	function Sim(o) {
		var n = this.n = o.n || 128, L = this.L = o.L || 256, dx = this.dx = L / n, N = n * n, i, ix, iy;
		this.dt = o.dt || 0.6; this.t = 0; this.o = o;
		this.re = new Float64Array(N); this.im = new Float64Array(N);
		var k = Q.kgrid(n, dx), kc = this.kc = new Float64Array(N), ks = this.ks = new Float64Array(N), dt = this.dt;
		for (iy = 0; iy < n; iy++) for (ix = 0; ix < n; ix++) { var ph = -0.5 * (k[ix] * k[ix] + k[iy] * k[iy]) * dt; kc[iy * n + ix] = Math.cos(ph); ks[iy * n + ix] = Math.sin(ph); }
		/* wall cells */
		var wall = [], solid = this.solid = new Uint8Array(N), V0 = o.V0 == null ? 3 : o.V0;
		var x1 = o.wallX, x2 = o.wallX + (o.wallW || 4), sl = o.slits || [];
		for (iy = 0; iy < n; iy++) {
			var y = (iy + 0.5) * dx, open = false;
			for (i = 0; i < sl.length; i++) if (y >= sl[i][0] && y < sl[i][1]) { open = true; break; }
			if (open) continue;
			for (ix = 0; ix < n; ix++) { var x = (ix + 0.5) * dx; if (x >= x1 && x < x2) { wall.push(iy * n + ix); solid[iy * n + ix] = 1; } }
		}
		this.wall = Int32Array.from(wall);
		this.vc = Math.cos(-V0 * dt / 2); this.vs = Math.sin(-V0 * dt / 2);
		/* absorbing border: multiply by exp(-eta dt s²) each step, s = depth into the border (0..1) */
		var w = o.absorb || L * 0.08, eta = o.eta || 1.2, bi = [], bf = [];
		for (iy = 0; iy < n; iy++) for (ix = 0; ix < n; ix++) {
			var px = (ix + 0.5) * dx, py = (iy + 0.5) * dx, dist = Math.min(px, L - px, py, L - py);
			if (dist < w) { var s = (w - dist) / w; bi.push(iy * n + ix); bf.push(Math.exp(-eta * dt * s * s)); }
		}
		this.bi = Int32Array.from(bi); this.bf = Float64Array.from(bf);
		this.packet(o);
	}
	Sim.prototype.packet = function (o) {
		var n = this.n, dx = this.dx, re = this.re, im = this.im, ix, iy, sum = 0;
		var x0 = o.x0, y0 = o.y0, sx = o.sx, sy = o.sy, k0 = o.k0;
		for (iy = 0; iy < n; iy++) {
			var y = (iy + 0.5) * dx, gy = (y - y0) * (y - y0) / (4 * sy * sy);
			for (ix = 0; ix < n; ix++) {
				var x = (ix + 0.5) * dx, a = Math.exp(-(x - x0) * (x - x0) / (4 * sx * sx) - gy), j = iy * n + ix;
				if (this.solid[j]) a = 0;
				re[j] = a * Math.cos(k0 * x); im[j] = a * Math.sin(k0 * x); sum += a * a;
			}
		}
		var s = 1 / Math.sqrt(sum * dx * dx); for (ix = 0; ix < re.length; ix++) { re[ix] *= s; im[ix] *= s; }
		this.t = 0;
	};
	Sim.prototype.halfV = function () {
		var w = this.wall, re = this.re, im = this.im, c = this.vc, s = this.vs;
		for (var i = 0; i < w.length; i++) { var j = w[i], r = re[j], m = im[j]; re[j] = r * c - m * s; im[j] = r * s + m * c; }
	};
	Sim.prototype.step = function (steps) {
		steps = steps || 1;
		var n = this.n, re = this.re, im = this.im, kc = this.kc, ks = this.ks, N = n * n, bi = this.bi, bf = this.bf, i;
		for (var s = 0; s < steps; s++) {
			this.halfV();
			S.fft2(re, im, n, false);
			for (i = 0; i < N; i++) { var r = re[i], m = im[i]; re[i] = r * kc[i] - m * ks[i]; im[i] = r * ks[i] + m * kc[i]; }
			S.fft2(re, im, n, true);
			this.halfV();
			for (i = 0; i < bi.length; i++) { re[bi[i]] *= bf[i]; im[bi[i]] *= bf[i]; }
			this.t += this.dt;
		}
	};
	Sim.prototype.norm = function () { var s = 0, re = this.re, im = this.im; for (var i = 0; i < re.length; i++) s += re[i] * re[i] + im[i] * im[i]; return s * this.dx * this.dx; };
	/* probability that is behind (x > xb) the wall */
	Sim.prototype.normBeyond = function (xb) {
		var n = this.n, dx = this.dx, s = 0, i0 = Math.ceil(xb / dx - 0.5);
		for (var iy = 0; iy < n; iy++) for (var ix = Math.max(0, i0); ix < n; ix++) { var j = iy * n + ix; s += this.re[j] * this.re[j] + this.im[j] * this.im[j]; }
		return s * dx * dx;
	};
	Sim.prototype.meanX = function () {
		var n = this.n, dx = this.dx, s = 0, w = 0;
		for (var iy = 0; iy < n; iy++) for (var ix = 0; ix < n; ix++) { var j = iy * n + ix, p = this.re[j] * this.re[j] + this.im[j] * this.im[j]; s += p * (ix + 0.5) * dx; w += p; }
		return s / w;
	};
	/* local velocity from the phase difference of neighbours (exact for a plane wave on the grid), times ρ, and ρ, at node (ix, iy) */
	Sim.prototype.node = function (ix, iy, out) {
		var n = this.n, re = this.re, im = this.im, dx = this.dx;
		ix = ix < 1 ? 1 : ix > n - 2 ? n - 2 : ix; iy = iy < 1 ? 1 : iy > n - 2 ? n - 2 : iy;
		var j = iy * n + ix, rho = re[j] * re[j] + im[j] * im[j];
		/* arg(ψ_{j+1} ψ*_{j-1}) / 2dx */
		var a = j + 1, b = j - 1, vx = Math.atan2(im[a] * re[b] - re[a] * im[b], re[a] * re[b] + im[a] * im[b]) / (2 * dx);
		a = j + n; b = j - n; var vy = Math.atan2(im[a] * re[b] - re[a] * im[b], re[a] * re[b] + im[a] * im[b]) / (2 * dx);
		out[0] = rho * vx; out[1] = rho * vy; out[2] = rho;
	};
	/* de Broglie-Bohm guidance velocity v = (ħ/m) Im(∇ψ/ψ) at a point, bilinear in J and ρ. Returns [vx, vy, rho] */
	var tmp = [0, 0, 0];
	Sim.prototype.velocity = function (x, y, out) {
		var dx = this.dx, fx = x / dx - 0.5, fy = y / dx - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
		var jx = 0, jy = 0, rho = 0;
		for (var c = 0; c < 4; c++) {
			var cx = ix + (c & 1), cy = iy + (c >> 1), w = ((c & 1) ? ax : 1 - ax) * ((c >> 1) ? ay : 1 - ay);
			this.node(cx, cy, tmp); jx += w * tmp[0]; jy += w * tmp[1]; rho += w * tmp[2];
		}
		out = out || [0, 0, 0];
		out[0] = rho > 0 ? jx / rho : 0; out[1] = rho > 0 ? jy / rho : 0; out[2] = rho; return out;
	};
	/* move tracers (arrays tx, ty, alive) by one step dt with a midpoint rule, speed capped at vmax */
	Sim.prototype.moveTracers = function (tr, dt, vmax) {
		var v = [0, 0, 0], L = this.L, rmin = tr.rmin || 1e-9;
		for (var i = 0; i < tr.x.length; i++) {
			if (!tr.alive[i]) continue;
			var x = tr.x[i], y = tr.y[i];
			this.velocity(x, y, v); if (v[2] < rmin) { tr.alive[i] = 2; continue; }
			var vx = Q.clamp(v[0], -vmax, vmax), vy = Q.clamp(v[1], -vmax, vmax);
			this.velocity(x + vx * dt / 2, y + vy * dt / 2, v);
			vx = Q.clamp(v[0], -vmax, vmax); vy = Q.clamp(v[1], -vmax, vmax);
			x += vx * dt; y += vy * dt;
			if (x < 1 || y < 1 || x > L - 1 || y > L - 1) { tr.alive[i] = 0; continue; }
			var cell = Math.floor(y / this.dx) * this.n + Math.floor(x / this.dx);
			if (this.solid[cell]) { tr.alive[i] = 2; continue; }
			tr.x[i] = x; tr.y[i] = y;
		}
	};
	/* tracers drawn from the initial Gaussian |ψ|² (standard deviations sx, sy), skipping any that start inside the wall */
	S.tracers = function (o, count, seed) {
		var r = Q.rng(seed || 7), x = new Float64Array(count), y = new Float64Array(count), alive = new Uint8Array(count);
		for (var i = 0; i < count; i++) { x[i] = o.x0 + o.sx * Q.gauss(r); y[i] = o.y0 + o.sy * Q.gauss(r); alive[i] = 1; }
		return { x: x, y: y, alive: alive };
	};
	S.Sim = Sim;
	Q.slit = S;

	/* ===================================================== MESQ.uncert ===================================================== */
	var U = {};
	U.SHAPES = { gauss: "Gaussian", flat: "Flat-top (square with soft edges)", two: "Two humps", tri: "Triangle" };
	/* grid: n points over [-Lx/2, Lx/2) */
	U.grid = function (n, Lx) { var dx = Lx / n, x = new Float64Array(n); for (var i = 0; i < n; i++) x[i] = -Lx / 2 + i * dx; return { n: n, Lx: Lx, dx: dx, x: x, k: Q.kgrid(n, dx) }; };
	/* real wave packet of "size" w (for the Gaussian, Δx = w), times e^{i k0 x}, normalised */
	U.make = function (G, shape, w, k0) {
		var n = G.n, re = new Float64Array(n), im = new Float64Array(n), s = 0, i;
		for (i = 0; i < n; i++) {
			var x = G.x[i], a;
			if (shape === "flat") { var u = x / (1.6 * w); a = Math.exp(-Math.pow(u * u, 4)); }
			else if (shape === "two") { var b = 1.6 * w, sg = 0.45 * w; a = Math.exp(-(x - b) * (x - b) / (4 * sg * sg)) + Math.exp(-(x + b) * (x + b) / (4 * sg * sg)); }
			else if (shape === "tri") { var h = 2.5 * w; a = Math.max(0, 1 - Math.abs(x) / h); }
			else a = Math.exp(-x * x / (4 * w * w));
			re[i] = a; im[i] = 0;
		}
		/* the triangle's corners are rounded a little (Gaussian blur, σ = 4% of its half-width), otherwise its slowly falling
		   momentum tail reaches the edge of the momentum grid and the fastest parts wrap around the periodic box */
		if (shape === "tri") { Q.fft(re, im, false); var sb = 0.1 * w; for (i = 0; i < n; i++) { var f = Math.exp(-0.5 * G.k[i] * G.k[i] * sb * sb); re[i] *= f; im[i] *= f; } Q.fft(re, im, true); }
		for (i = 0; i < n; i++) { var r0 = re[i], x0 = G.x[i]; re[i] = r0 * Math.cos(k0 * x0); im[i] = r0 * Math.sin(k0 * x0); s += r0 * r0; }
		s = 1 / Math.sqrt(s * G.dx); for (i = 0; i < n; i++) { re[i] *= s; im[i] *= s; }
		return { re: re, im: im };
	};
	/* mean and spread of a distribution p[i] over coordinate q[i] */
	U.moments = function (p, q) {
		var w = 0, m = 0, m2 = 0; for (var i = 0; i < p.length; i++) { w += p[i]; m += p[i] * q[i]; m2 += p[i] * q[i] * q[i]; }
		m /= w; return { mean: m, sd: Math.sqrt(Math.max(0, m2 / w - m * m)) };
	};
	/* momentum-space amplitude (FFT; bins in the order of G.k) */
	U.toK = function (psi) { var re = Float64Array.from(psi.re), im = Float64Array.from(psi.im); Q.fft(re, im, false); return { re: re, im: im }; };
	U.stats = function (G, psi, phi) {
		phi = phi || U.toK(psi);
		var px = new Float64Array(G.n), pk = new Float64Array(G.n);
		for (var i = 0; i < G.n; i++) { px[i] = psi.re[i] * psi.re[i] + psi.im[i] * psi.im[i]; pk[i] = phi.re[i] * phi.re[i] + phi.im[i] * phi.im[i]; }
		var mx = U.moments(px, G.x), mk = U.moments(pk, G.k);
		return { x: mx.mean, dx: mx.sd, k: mk.mean, dk: mk.sd, product: mx.sd * mk.sd, px: px, pk: pk, phi: phi };
	};
	/* free evolution for time t (ħ = m = 1, or general hbar/m via the ratio r = ħ/m): exact in momentum space */
	U.evolve = function (G, phi, t, r) {
		r = r == null ? 1 : r;
		var n = G.n, re = new Float64Array(n), im = new Float64Array(n);
		for (var i = 0; i < n; i++) { var ph = -0.5 * r * G.k[i] * G.k[i] * t, c = Math.cos(ph), s = Math.sin(ph); re[i] = phi.re[i] * c - phi.im[i] * s; im[i] = phi.re[i] * s + phi.im[i] * c; }
		Q.fft(re, im, true); return { re: re, im: im };
	};
	/* spreading laws: for any packet whose envelope is real (times e^{ik0x}): Δx(t)² = Δx0² + (Δp t / m)²; Gaussian: Δp = ħ/(2Δx0) */
	U.spread = function (dx0, dp, t, m) { m = m || 1; return Math.sqrt(dx0 * dx0 + Math.pow(dp * t / m, 2)); };
	U.gaussSpread = function (dx0, t, hbar, m) { hbar = hbar || 1; m = m || 1; var q = hbar * t / (2 * m * dx0 * dx0); return dx0 * Math.sqrt(1 + q * q); };
	/* smallest momentum spread allowed: Δp >= ħ / (2Δx) */
	U.minDp = function (dx) { return C.hbar / (2 * dx); };
	/* real-world examples for the calculator: mass (kg), confinement Δx (m) */
	U.EXAMPLES = [
		{ id: "atom", name: "Electron in an atom", m: C.me, dx: 1e-10 },
		{ id: "nucleus", name: "Proton in a nucleus", m: C.mp, dx: 2e-15 },
		{ id: "dust", name: "Dust grain (1 µm, ~1 pg)", m: 1e-15, dx: 1e-6 },
		{ id: "baseball", name: "Baseball (145 g) known to 1 mm", m: 0.145, dx: 1e-3 }
	];
	Q.uncert = U;

	if (typeof module !== "undefined" && module.exports) module.exports = Q;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Quantum Lab: entanglement (Bell / CHSH test) and Stern-Gerlach chains. Pure maths, no DOM.
   MESQ.ent: angles in RADIANS. Two pair types:
     "ph" photons in (|HH> + |VV>)/sqrt2, polarizer angle from horizontal:  E(a,b) = cos 2(a - b)
     "el" spin-1/2 singlet (|ud> - |du>)/sqrt2, magnet angle from z:          E(a,b) = -cos(a - b)
   Written as E = s cos(k d) with (k, s) = (2, +1) for photons and (1, -1) for the singlet, d = a - b.
   Models: "q" quantum (joint probabilities sampled exactly), and two LOCAL hidden-variable models where each side's answer
   depends only on its own setting and a shared hidden angle lambda:
     "bell"  Bell 1964 deterministic sign model: A = sign cos k(a - lam), B = s sign cos k(b - lam)  ->  E = s (1 - 2|kd|/pi) (linear, the best a local model does at the CHSH angles)
     "malus" shared polarization / spin direction, each side answers at random with Malus's law  ->  E = (s/2) cos(kd)
   MESQ.sg: Stern-Gerlach chains for spin 1/2 or spin 1, all magnets in the x-z plane (theta from +z towards +x), real Wigner d-matrices.
   Node: var Q = require("./lib.js"); require("./lib-ent.js"); */
(function (root) {
	"use strict";
	var Q = root.MESQ || (typeof require !== "undefined" ? require("./lib.js") : {});
	var PI = Math.PI, SQ2 = Math.SQRT2;

	/* ======================= entanglement ======================= */
	function ks(type) { return type === "el" ? { k: 1, s: -1 } : { k: 2, s: 1 }; }
	/* wrap x into (-pi, pi] */
	function wrap(x) { x = ((x + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; return x === -PI ? PI : x; }
	function sgn(x) { return x >= 0 ? 1 : -1; }

	var ent = {};
	ent.MODELS = { q: "Quantum mechanics", bell: "Bell 1964 hidden angle (local)", malus: "Shared polarization + Malus's law (local)" };
	ent.TYPES = { ph: "Photon pairs (polarization)", el: "Electron pairs (spin singlet)" };
	ent.ks = ks; ent.wrap = wrap;
	/* correlation E(a, b) = <A B> for a model */
	ent.E = function (type, model, a, b) {
		var p = ks(type), x = p.k * (a - b);
		if (model === "bell") return p.s * (1 - 2 * Math.abs(wrap(x)) / PI);
		if (model === "malus") return p.s * 0.5 * Math.cos(x);
		return p.s * Math.cos(x);
	};
	/* quantum joint probabilities [P(++), P(+-), P(-+), P(--)]; each side alone is always 1/2 */
	ent.joint = function (type, a, b) {
		var E = ent.E(type, "q", a, b), same = (1 + E) / 4, diff = (1 - E) / 4;
		return [same, diff, diff, same];
	};
	/* one pair: returns [A, B] in {+1, -1}. r = Q.rng(...). For the local models a fresh hidden angle is drawn per pair and
	   A is computed from (a, lam) only, B from (b, lam) only. */
	ent.pair = function (type, model, a, b, r) {
		var p = ks(type), lam, A, B;
		if (model === "bell") {
			lam = r() * 2 * PI;
			A = sgn(Math.cos(p.k * (a - lam))); B = p.s * sgn(Math.cos(p.k * (b - lam)));
			return [A, B];
		}
		if (model === "malus") {
			lam = r() * 2 * PI;
			var pa = 0.5 * (1 + Math.cos(p.k * (a - lam))), pb = 0.5 * (1 + p.s * Math.cos(p.k * (b - lam)));
			A = r() < pa ? 1 : -1; B = r() < pb ? 1 : -1;
			return [A, B];
		}
		var J = ent.joint(type, a, b), u = r();
		if (u < J[0]) return [1, 1];
		if (u < J[0] + J[1]) return [1, -1];
		if (u < J[0] + J[1] + J[2]) return [-1, 1];
		return [-1, -1];
	};
	/* deterministic answer of the Bell model for a given hidden angle (used by the exhaustive test) */
	ent.bellAnswers = function (type, set, lam) {
		var p = ks(type);
		return { A: set.slice(0, 2).map(function (a) { return sgn(Math.cos(p.k * (a - lam))); }),
			B: set.slice(2).map(function (b) { return p.s * sgn(Math.cos(p.k * (b - lam))); }) };
	};
	/* the standard optimal CHSH settings [a, a', b, b'] (radians) for each pair type */
	ent.optimal = function (type) {
		var d = PI / 180;
		return type === "el" ? [0, 90 * d, 45 * d, 135 * d] : [0, 45 * d, 22.5 * d, 67.5 * d];
	};
	/* CHSH combination from four correlations ordered (a,b), (a,b'), (a',b), (a',b') */
	ent.Sof = function (E) { return Math.abs(E[0] - E[1] + E[2] + E[3]); };
	ent.Stheory = function (type, model, set) {
		var a = set[0], ap = set[1], b = set[2], bp = set[3];
		return ent.Sof([ent.E(type, model, a, b), ent.E(type, model, a, bp), ent.E(type, model, ap, b), ent.E(type, model, ap, bp)]);
	};
	ent.TSIRELSON = 2 * SQ2;
	/* counts: cell i (0..3 = ab, ab', a'b, a'b') -> {n, pp, pm, mp, mm}. Returns E per cell, its standard error, S and the error of S */
	ent.newCounts = function () { var c = []; for (var i = 0; i < 4; i++) c.push({ n: 0, pp: 0, pm: 0, mp: 0, mm: 0 }); return c; };
	ent.add = function (cell, A, B) { cell.n++; if (A > 0) { if (B > 0) cell.pp++; else cell.pm++; } else { if (B > 0) cell.mp++; else cell.mm++; } };
	ent.cellE = function (c) { return c.n ? (c.pp + c.mm - c.pm - c.mp) / c.n : NaN; };
	ent.cellErr = function (c) { if (c.n < 2) return NaN; var E = ent.cellE(c); return Math.sqrt(Math.max(1e-12, 1 - E * E) / c.n); };
	ent.stats = function (counts) {
		var E = counts.map(ent.cellE), err = counts.map(ent.cellErr), ok = counts.every(function (c) { return c.n >= 2; });
		var S = ok ? ent.Sof(E) : NaN, dS = ok ? Math.sqrt(err.reduce(function (s, e) { return s + e * e; }, 0)) : NaN;
		return { E: E, err: err, S: S, dS: dS, n: counts.reduce(function (s, c) { return s + c.n; }, 0), sigma: ok && dS > 0 ? (S - 2) / dS : NaN };
	};
	/* run a whole CHSH test of n pairs, settings chosen at random per pair. Returns {counts, marg} where marg[x][y] = [n, A+ , B+] by Alice's / Bob's choice */
	ent.chsh = function (type, model, set, n, r) {
		var counts = ent.newCounts(), marg = { A: [[0, 0], [0, 0]], B: [[0, 0], [0, 0]] };
		for (var i = 0; i < n; i++) {
			var x = r() < 0.5 ? 0 : 1, y = r() < 0.5 ? 0 : 1, ab = ent.pair(type, model, set[x], set[2 + y], r);
			ent.add(counts[x * 2 + y], ab[0], ab[1]);
			marg.A[x][0]++; if (ab[0] > 0) marg.A[x][1]++;
			marg.B[x][0]++; if (ab[1] > 0) marg.B[x][1]++;   // Bob's +1 rate split by ALICE's choice: the no-signalling check
		}
		return { counts: counts, marg: marg };
	};

	/* ======================= Stern-Gerlach ======================= */
	var sg = {};
	/* Wigner small d-matrix d^j(theta) as rows m' = j..-j, columns m = j..-j. Column m = the state "m along theta" written in the z basis. */
	sg.d = function (j2, th) {
		if (j2 === 1) { var c = Math.cos(th / 2), s = Math.sin(th / 2); return [[c, -s], [s, c]]; }
		var C = Math.cos(th), S = Math.sin(th);
		return [[(1 + C) / 2, -S / SQ2, (1 - C) / 2], [S / SQ2, C, -S / SQ2], [(1 - C) / 2, S / SQ2, (1 + C) / 2]];
	};
	sg.dim = function (j2) { return j2 === 1 ? 2 : 3; };
	sg.labels = function (j2) { return j2 === 1 ? ["+½", "−½"] : ["+1", "0", "−1"]; };
	sg.basis = function (j2, th, m) { var D = sg.d(j2, th); return D.map(function (row) { return row[m]; }); };
	function dot(u, v) { var s = 0; for (var i = 0; i < u.length; i++) s += u[i] * v[i]; return s; }
	/* source: "oven" (unpolarized), "z" (prepared m = +j along z), "x" (prepared m = +j along x) */
	sg.sourceRho = function (j2, src) {
		var n = sg.dim(j2), i, k, rho = [];
		for (i = 0; i < n; i++) { rho.push([]); for (k = 0; k < n; k++) rho[i].push(src === "oven" ? (i === k ? 1 / n : 0) : 0); }
		if (src !== "oven") { var v = sg.basis(j2, src === "x" ? PI / 2 : 0, 0); for (i = 0; i < n; i++) for (k = 0; k < n; k++) rho[i][k] = v[i] * v[k]; }
		return rho;
	};
	function proj(rho, v) { var n = v.length, i, k, w = 0; for (i = 0; i < n; i++) for (k = 0; k < n; k++) w += v[i] * rho[i][k] * v[k]; return w; }
	function outer(v, w) { return v.map(function (a) { return v.map(function (b) { return a * b * w; }); }); }
	function addM(A, B) { return A.map(function (r, i) { return r.map(function (x, k) { return x + B[i][k]; }); }); }
	function zeroM(n) { var z = []; for (var i = 0; i < n; i++) { z.push([]); for (var k = 0; k < n; k++) z[i].push(0); } return z; }
	/* spin expectation <S>/j in the x-z plane: {x, z, len}. For spin 1/2 this is the Bloch vector. */
	sg.spinVec = function (j2, rho) {
		var tr = 0, i; for (i = 0; i < rho.length; i++) tr += rho[i][i];
		if (tr <= 0) return { x: 0, z: 0, len: 0 };
		var x, z;
		if (j2 === 1) { z = (rho[0][0] - rho[1][1]) / tr; x = 2 * rho[0][1] / tr; }
		else { z = (rho[0][0] - rho[2][2]) / tr; x = SQ2 * (rho[0][1] + rho[1][2]) / tr; }   // <Sx> = sqrt2 (rho_{1,0} + rho_{0,-1}), divided by j = 1
		return { x: x, z: z, len: Math.sqrt(x * x + z * z) };
	};
	/* pass option of a magnet: an outcome index 0..n-1 (that output goes on, the others are blocked), "coh" (all outputs recombined, nothing recorded)
	   or "peek" (recombined, but a detector notes which path each atom took). The LAST magnet always sends every output to the screen.
	   theory(): per stage {arrive (fraction of the source), p (outcome probabilities given arrival), vec (spin of the arriving beam), amp (amplitudes if pure)}
	   and screen = fraction of all source atoms landing in each final spot. */
	sg.theory = function (j2, src, mags) {
		var n = sg.dim(j2), rho = sg.sourceRho(j2, src), arrive = 1, stages = [], k, m;
		for (k = 0; k < mags.length; k++) {
			var th = mags[k].th, vecs = [], p = [];
			for (m = 0; m < n; m++) { vecs.push(sg.basis(j2, th, m)); p.push(proj(rho, vecs[m])); }
			var tot = p.reduce(function (s, x) { return s + x; }, 0) || 1;
			var vec = sg.spinVec(j2, rho), pure = Math.abs(vec.len - 1) < 1e-9 || (j2 === 2 && isPure(rho)), amp = null;
			if (pure) { var psi = pureVec(rho); amp = vecs.map(function (v) { return dot(v, psi); }); }
			stages.push({ arrive: arrive, p: p.map(function (x) { return x / tot; }), vec: vec, amp: amp });
			if (k === mags.length - 1) break;
			var pass = mags[k].pass;
			if (pass === "coh") { /* unchanged */ }
			else if (pass === "peek") { var r2 = zeroM(n); for (m = 0; m < n; m++) r2 = addM(r2, outer(vecs[m], p[m])); rho = r2; }
			else { m = +pass; arrive *= p[m] / tot; rho = p[m] > 1e-15 ? outer(vecs[m], 1) : zeroM(n); if (p[m] <= 1e-15) arrive = 0; }
			// keep rho normalized (trace 1) so the next stage's probabilities are conditional
			var t = 0; for (m = 0; m < n; m++) t += rho[m][m]; if (t > 0) rho = rho.map(function (r) { return r.map(function (x) { return x / t; }); });
		}
		var last = stages[stages.length - 1], screen = last.p.map(function (x) { return x * last.arrive; });
		return { stages: stages, screen: screen, through: screen.reduce(function (s, x) { return s + x; }, 0), rho: rho };
	};
	function isPure(rho) { var n = rho.length, t2 = 0, t = 0, i, k; for (i = 0; i < n; i++) { t += rho[i][i]; for (k = 0; k < n; k++) t2 += rho[i][k] * rho[k][i]; } return t > 0 && Math.abs(t2 / (t * t) - 1) < 1e-9; }
	function pureVec(rho) {   // rho = v v^T: take the column with the biggest diagonal
		var n = rho.length, b = 0, i; for (i = 1; i < n; i++) if (rho[i][i] > rho[b][b]) b = i;
		var s = Math.sqrt(rho[b][b]) || 1, v = []; for (i = 0; i < n; i++) v.push(rho[i][b] / s); return v;
	}
	/* one atom through the chain. Returns {out: [outcome or "coh" per stage], block: stage index where it was stopped or -1, spot: final outcome or -1} */
	sg.sample = function (j2, src, mags, r) {
		var n = sg.dim(j2), psi, k, m, out = [];
		if (src === "oven") { psi = []; var pick = Math.floor(r() * n); for (m = 0; m < n; m++) psi.push(m === pick ? 1 : 0); }
		else psi = sg.basis(j2, src === "x" ? PI / 2 : 0, 0);
		for (k = 0; k < mags.length; k++) {
			var th = mags[k].th, last = k === mags.length - 1, pass = mags[k].pass;
			if (!last && pass === "coh") { out.push("coh"); continue; }
			var vecs = [], u = r(), acc = 0, pick2 = n - 1;
			for (m = 0; m < n; m++) vecs.push(sg.basis(j2, th, m));
			for (m = 0; m < n; m++) { var a = dot(vecs[m], psi); acc += a * a; if (u < acc) { pick2 = m; break; } }
			out.push(pick2); psi = vecs[pick2];
			if (last) return { out: out, block: -1, spot: pick2 };
			if (pass !== "peek" && +pass !== pick2) return { out: out, block: k, spot: -1 };
		}
		return { out: out, block: -1, spot: -1 };
	};
	/* classical expectation for one magnet: moment pointing in a random 3D direction -> deflection proportional to cos(polar angle), uniform on [-1, 1] */
	sg.classical = function (r) { return 2 * r() - 1; };

	Q.ent = ent; Q.sg = sg;
	if (typeof module !== "undefined" && module.exports) module.exports = Q;
})(typeof window !== "undefined" ? window : globalThis);

/* lib-atom: MESQ.atom (exact hydrogen-like wavefunctions, energy levels, spectral lines) and MESQ.calc (unit parser + small quantum calculators).
   Pure maths, no DOM. Lengths in the atom part are in Bohr radii a0 unless a name says otherwise; the calculators work in SI.
   Node: var Q = require("./lib.js"); require("./lib-atom.js"); */
(function (root) {
	"use strict";
	var Q = root.MESQ || (typeof require !== "undefined" ? require("./lib.js") : {});
	var C = Q.C, PI = Math.PI;

	function fact(n) { var f = 1; for (var i = 2; i <= n; i++) f *= i; return f; }
	/* generalized Laguerre polynomial L_k^a(x) by the three-term recurrence */
	function laguerre(k, a, x) {
		if (k === 0) return 1;
		var l0 = 1, l1 = 1 + a - x;
		for (var j = 1; j < k; j++) { var l2 = ((2 * j + 1 + a - x) * l1 - (j + a) * l0) / (j + 1); l0 = l1; l1 = l2; }
		return l1;
	}
	/* associated Legendre P_l^m(x), m >= 0, WITHOUT the Condon-Shortley (-1)^m (so p_x has its + lobe on +x, as chemists draw it) */
	function legendre(l, m, x) {
		var s = Math.sqrt(Math.max(0, 1 - x * x)), pmm = 1;
		for (var i = 1; i <= m; i++) pmm *= (2 * i - 1) * s;
		if (l === m) return pmm;
		var p1 = x * (2 * m + 1) * pmm;
		if (l === m + 1) return p1;
		var p0 = pmm, pl = p1;
		for (var ll = m + 2; ll <= l; ll++) { pl = (x * (2 * ll - 1) * p1 - (ll + m - 1) * p0) / (ll - m); p0 = p1; p1 = pl; }
		return pl;
	}

	var LET = "spdfghik";
	var REAL = {
		"1,1": "x", "1,-1": "y", "1,0": "z",
		"2,0": "z²", "2,1": "xz", "2,-1": "yz", "2,2": "x²−y²", "2,-2": "xy",
		"3,0": "z³", "3,1": "xz²", "3,-1": "yz²", "3,2": "z(x²−y²)", "3,-2": "xyz", "3,3": "x(x²−3y²)", "3,-3": "y(3x²−y²)"
	};
	var A = {
		NMAX: 7,
		laguerre: laguerre, legendre: legendre, fact: fact,
		letter: function (l) { return LET.charAt(l) || "l" + l; },
		/* "3d" + subscript part, e.g. name(3,2,-2,false) -> "3d xy", complex -> "3d (m = −2)" */
		name: function (n, l, m, cplx) {
			var b = n + A.letter(l);
			if (l === 0) return b;
			if (cplx) return b + " (m = " + (m < 0 ? "−" + (-m) : m) + ")";
			var s = REAL[l + "," + m]; return s ? b + " " + s : b + " (m = " + (m < 0 ? "−" + (-m) : m) + ")";
		},
		valid: function (n, l, m) { return n >= 1 && n <= A.NMAX && l >= 0 && l < n && Math.abs(m) <= l && n === Math.round(n) && l === Math.round(l) && m === Math.round(m); },
		radialNorm: function (n, l, Z) { Z = Z || 1; return Math.sqrt(Math.pow(2 * Z / n, 3) * fact(n - l - 1) / (2 * n * fact(n + l))); },
		/* R_nl(r), r in a0, units a0^(-3/2); integral of R^2 r^2 dr = 1 */
		R: function (n, l, r, Z) { Z = Z || 1; var rho = 2 * Z * r / n; return A.radialNorm(n, l, Z) * Math.exp(-rho / 2) * Math.pow(rho, l) * laguerre(n - l - 1, 2 * l + 1, rho); },
		/* radial probability density P(r) = r^2 R^2 (per a0) */
		P: function (n, l, r, Z) { var v = A.R(n, l, r, Z); return r * r * v * v; },
		ylmNorm: function (l, m) { m = Math.abs(m); return Math.sqrt((2 * l + 1) / (4 * PI) * fact(l - m) / fact(l + m)); },
		/* real spherical harmonic (chemists' orbitals) */
		Yreal: function (l, m, ct, ph) {
			var am = Math.abs(m), v = A.ylmNorm(l, m) * legendre(l, am, ct);
			if (m === 0) return v;
			return Math.SQRT2 * v * (m > 0 ? Math.cos(am * ph) : Math.sin(am * ph));
		},
		/* complex Y_lm with the Condon-Shortley phase; returns [re, im] */
		Ycplx: function (l, m, ct, ph) {
			var am = Math.abs(m), v = A.ylmNorm(l, m) * legendre(l, am, ct);
			if (m > 0 && (am & 1)) v = -v; /* (-1)^m for m > 0; for m < 0, Y_l,-m = (-1)^m conj(Y_lm) cancels it */
			return [v * Math.cos(m * ph), v * Math.sin(m * ph)];
		},
		/* fast evaluator: returns f(x, y, z, out) writing out[0] = Re psi, out[1] = Im psi (a0^(-3/2)) */
		psiFn: function (n, l, m, cplx, Z) {
			Z = Z || 1;
			var N = A.radialNorm(n, l, Z), YN = A.ylmNorm(l, m), am = Math.abs(m), k = n - l - 1, al = 2 * l + 1;
			var sgn = cplx && m > 0 && (am & 1) ? -1 : 1;
			return function (x, y, z, out) {
				var r = Math.sqrt(x * x + y * y + z * z), rho = 2 * Z * r / n;
				var rad = N * Math.exp(-rho / 2) * (l ? Math.pow(rho, l) : 1) * laguerre(k, al, rho);
				var ct = r > 0 ? z / r : 1, ph = Math.atan2(y, x), ang = YN * legendre(l, am, ct);
				if (!cplx) {
					if (m !== 0) ang *= Math.SQRT2 * (m > 0 ? Math.cos(am * ph) : Math.sin(am * ph));
					out[0] = rad * ang; out[1] = 0;
				} else {
					var v = rad * ang * sgn; out[0] = v * Math.cos(m * ph); out[1] = v * Math.sin(m * ph);
				}
				return out;
			};
		},
		nodes: function (n, l) { return { radial: n - l - 1, angular: l, total: n - 1 }; },
		/* <r> = a0 (3n^2 - l(l+1)) / (2Z) */
		meanR: function (n, l, Z) { return (3 * n * n - l * (l + 1)) / (2 * (Z || 1)); },
		/* <r^2> = a0^2 n^2 (5n^2 + 1 - 3l(l+1)) / (2 Z^2) */
		meanR2: function (n, l, Z) { Z = Z || 1; return n * n * (5 * n * n + 1 - 3 * l * (l + 1)) / (2 * Z * Z); },
		rMax: function (n, Z) { return (2 * n * n + 14 * n + 12) / (Z || 1); },
		/* most likely radius (global maximum of r^2 R^2), refined by golden-section search */
		mostLikely: function (n, l, Z) {
			var rm = A.rMax(n, Z), best = 0, bv = -1, steps = 2000, i;
			for (i = 1; i <= steps; i++) { var r = rm * i / steps, v = A.P(n, l, r, Z); if (v > bv) { bv = v; best = r; } }
			var a = best - rm / steps, b = best + rm / steps, g = (Math.sqrt(5) - 1) / 2;
			for (i = 0; i < 60; i++) { var c = b - g * (b - a), d = a + g * (b - a); if (A.P(n, l, c, Z) > A.P(n, l, d, Z)) b = d; else a = c; }
			return (a + b) / 2;
		},
		/* radius containing a fraction q of the probability (numeric) */
		radiusFor: function (n, l, q, Z) {
			var rm = A.rMax(n, Z), N = 4000, h = rm / N, s = 0, prev = 0;
			for (var i = 1; i <= N; i++) { var r = i * h, v = A.P(n, l, r, Z); s += (prev + v) * h / 2; prev = v; if (s >= q) return r; }
			return rm;
		},
		/* probability of finding the electron inside radius r */
		inside: function (n, l, r, Z) {
			var N = Math.max(200, Math.ceil(r * 60)), h = r / N, s = 0, prev = 0;
			for (var i = 1; i <= N; i++) { var v = A.P(n, l, i * h, Z); s += (prev + v) * h / 2; prev = v; }
			return s;
		},
		/* positions of the radial nodes (zeros of R for r > 0) */
		radialNodes: function (n, l, Z) {
			var out = [], rm = A.rMax(n, Z), N = 4000, prev = A.R(n, l, 1e-6, Z);
			for (var i = 1; i <= N; i++) {
				var r = rm * (i - 0.3819) / N, v = A.R(n, l, r, Z);
				if (prev * v < 0) { var a = rm * (i - 1.3819) / N, b = r; for (var k = 0; k < 50; k++) { var c = (a + b) / 2; if (A.R(n, l, a, Z) * A.R(n, l, c, Z) <= 0) b = c; else a = c; } out.push((a + b) / 2); }
				prev = v;
			}
			return out;
		},
		/* exact sampling from |psi|^2: r from the radial CDF, direction by rejection from |Y|^2. Returns {x,y,z: Float32Array, s: Float32Array} (s = sign +-1 for real orbitals, phase for complex) */
		sample: function (n, l, m, cplx, N, seed, Z) {
			Z = Z || 1;
			var rnd = Q.rng(seed || 1), rm = A.rMax(n, Z), K = 3000, cdf = new Float64Array(K + 1), i, s = 0, prev = 0, h = rm / K;
			for (i = 1; i <= K; i++) { var v = A.P(n, l, i * h, Z); s += (prev + v) * h / 2; prev = v; cdf[i] = s; }
			for (i = 1; i <= K; i++) cdf[i] /= s;
			var ang = function (ct, ph) { if (!cplx) { var y = A.Yreal(l, m, ct, ph); return y * y; } var c = A.Ycplx(l, m, ct, ph); return c[0] * c[0] + c[1] * c[1]; };
			var ymax = 0; for (var a = 0; a <= 90; a++) for (var b = 0; b < 180; b++) { var w = ang(Math.cos(PI * a / 90), 2 * PI * b / 180); if (w > ymax) ymax = w; }
			ymax *= 1.12;
			var X = new Float32Array(N), Y = new Float32Array(N), Zs = new Float32Array(N), S = new Float32Array(N), f = A.psiFn(n, l, m, cplx, Z), o = [0, 0];
			for (i = 0; i < N; i++) {
				var u = rnd(), lo = 0, hi = K; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid; else hi = mid; }
				var r = h * (lo + (u - cdf[lo]) / Math.max(1e-300, cdf[hi] - cdf[lo]));
				var ct, ph, tries = 0;
				do { ct = 2 * rnd() - 1; ph = 2 * PI * rnd(); tries++; } while (rnd() * ymax > ang(ct, ph) && tries < 5000);
				var st = Math.sqrt(1 - ct * ct), x = r * st * Math.cos(ph), y = r * st * Math.sin(ph), z = r * ct;
				X[i] = x; Y[i] = y; Zs[i] = z; f(x, y, z, o);
				S[i] = cplx ? Math.atan2(o[1], o[0]) : (o[0] >= 0 ? 1 : -1);
			}
			return { x: X, y: Y, z: Zs, s: S };
		},

		/* ---------- energy levels and spectral lines ---------- */
		MASS: { inf: Infinity, H: C.mp, D: 3.3435837724e-27, He: 6.6446573357e-27, Li: 1.16503e-26 },
		/* reduced-mass factor mu / me for a nucleus of mass M (kg); Infinity -> 1 */
		muFactor: function (M) { return isFinite(M) ? M / (M + C.me) : 1; },
		/* E_n in eV (negative), hydrogen-like ion of charge Z, nucleus mass M (kg, Infinity = fixed nucleus) */
		energy: function (n, Z, M) { Z = Z || 1; return -C.Ry * Z * Z / (n * n) * A.muFactor(M == null ? Infinity : M); },
		SERIES: ["", "Lyman", "Balmer", "Paschen", "Brackett", "Pfund", "Humphreys"],
		seriesName: function (nl) { return A.SERIES[nl] || ("n = " + nl + " series"); },
		/* refractive index of standard air (Morton 2000 / IAU formula) for a vacuum wavelength in metres */
		airIndex: function (lv) { var s = 1e-6 / lv, s2 = s * s; return 1 + 8.34254e-5 + 2.406147e-2 / (130 - s2) + 1.5998e-4 / (38.9 - s2); },
		toAir: function (lv) { return lv >= 2e-7 ? lv / A.airIndex(lv) : lv; },
		/* transition from n1 to n2: {dE eV (>0), lamVac m, lamAir m, f Hz, emit (true if n1 > n2), series, band} */
		transition: function (n1, n2, Z, M) {
			var e1 = A.energy(n1, Z, M), e2 = A.energy(n2, Z, M), dE = Math.abs(e2 - e1);
			var lv = C.h * C.c / (dE * C.e), nl = Math.min(n1, n2);
			return { dE: dE, lamVac: lv, lamAir: A.toAir(lv), f: dE * C.e / C.h, emit: n1 > n2, series: A.seriesName(nl), lower: nl, upper: Math.max(n1, n2), band: A.band(lv) };
		},
		band: function (lam) { var nm = lam * 1e9; return nm < 10 ? "X-ray" : nm < 380 ? "ultraviolet" : nm <= 750 ? "visible" : nm < 1e6 ? "infrared" : "microwave / radio"; },
		/* visible colour of a wavelength (nm), Bruton's approximation with dimming at the ends; null outside 380-780 nm */
		wavelengthRGB: function (nm) {
			if (nm < 380 || nm > 780) return null;
			var r = 0, g = 0, b = 0;
			if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
			else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else r = 1;
			var f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
			var gm = function (c) { return Math.round(255 * Math.pow(c * f, 0.8)); };
			return [gm(r), gm(g), gm(b)];
		},
		/* every line of a series with upper level up to nmax, plus its limit */
		lines: function (nl, nmax, Z, M) { var out = []; for (var u = nl + 1; u <= nmax; u++) out.push(A.transition(u, nl, Z, M)); return out; },
		seriesLimit: function (nl, Z, M) { var e = -A.energy(nl, Z, M); return C.h * C.c / (e * C.e); }
	};
	Q.atom = A;

	/* ======================= calculators ======================= */
	var U = {
		length: { m: 1, km: 1e3, cm: 1e-2, mm: 1e-3, um: 1e-6, "µm": 1e-6, "μm": 1e-6, micron: 1e-6, nm: 1e-9, pm: 1e-12, fm: 1e-15, "Å": 1e-10, A: 1e-10, angstrom: 1e-10, a0: C.a0, in: 0.0254, ft: 0.3048 },
		energy: { J: 1, kJ: 1e3, eV: C.e, meV: 1e-3 * C.e, keV: 1e3 * C.e, MeV: 1e6 * C.e, GeV: 1e9 * C.e, "kJ/mol": 1e3 / C.NA, "kcal/mol": 4184 / C.NA, Ha: 2 * C.Ry * C.e, Ry: C.Ry * C.e },
		freq: { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9, THz: 1e12, PHz: 1e15, EHz: 1e18 },
		wavenumber: { "cm-1": 100, "cm^-1": 100, "/cm": 100, "m-1": 1, "m^-1": 1, "/m": 1 },
		mass: { kg: 1, g: 1e-3, mg: 1e-6, u: C.u, Da: C.u, amu: C.u, me: C.me, mp: C.mp },
		speed: { "m/s": 1, "km/s": 1e3, "km/h": 1 / 3.6, mph: 0.44704, c: C.c },
		time: { s: 1, ms: 1e-3, us: 1e-6, "µs": 1e-6, "μs": 1e-6, ns: 1e-9, ps: 1e-12, fs: 1e-15, as: 1e-18, min: 60, h: 3600 },
		voltage: { V: 1, mV: 1e-3, kV: 1e3, MV: 1e6 },
		angle: { deg: PI / 180, "°": PI / 180, rad: 1 },
		area: { "m²": 1, m2: 1, "m^2": 1, "cm²": 1e-4, cm2: 1e-4, "cm^2": 1e-4, "mm²": 1e-6, mm2: 1e-6, "mm^2": 1e-6 },
		density: { "m-3": 1, "m^-3": 1, "/m3": 1, "/m³": 1, "cm-3": 1e6, "cm^-3": 1e6, "/cm3": 1e6, "/cm³": 1e6 },
		temp: { K: 1, "°C": 1, C: 1, degC: 1, "°F": 1, F: 1 },
		count: { "": 1 }
	};
	function toTemp(v, u) { if (u === "°C" || u === "C" || u === "degC") return v + 273.15; if (u === "°F" || u === "F") return (v - 32) * 5 / 9 + 273.15; return v; }
	var K = {
		UNITS: U,
		/* parse "500 nm", "2 eV", "1e-10 m", "1.5×10^-3 s", "0.5c", "25 °C". dims = allowed dimension names; def = unit used when none is typed.
		   returns {v (SI), dim, unit} or {err: "..."} */
		parse: function (str, dims, def) {
			if (typeof dims === "string") dims = [dims];
			var s = String(str == null ? "" : str).trim().replace(/−/g, "-").replace(/,/g, "");
			if (!s) return { err: "empty" };
			s = s.replace(/\s*[×x*]\s*10\s*\^?\s*([-+]?\d+)/i, "e$1").replace(/10\s*\^\s*([-+]?\d+)/, "1e$1");
			var mt = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(.*)$/i);
			if (!mt) return { err: "not a number" };
			var v = parseFloat(mt[1]), u = mt[2].trim().replace(/\s+/g, "");
			if (!isFinite(v)) return { err: "not a number" };
			if (!u) u = def || "";
			if (u === "" && dims.indexOf("count") >= 0) return { v: v, dim: "count", unit: "" };
			for (var pass = 0; pass < 2; pass++) for (var i = 0; i < dims.length; i++) {
				var tb = U[dims[i]]; if (!tb) continue;
				for (var key in tb) if (pass === 0 ? key === u : key.toLowerCase() === u.toLowerCase()) {
					if (dims[i] === "temp") { var T = toTemp(v, key); return T < 0 ? { err: "below absolute zero" } : { v: T, dim: "temp", unit: key }; }
					return { v: v * tb[key], dim: dims[i], unit: key };
				}
			}
			return { err: u ? "unknown unit “" + u + "”" : "add a unit" };
		},
		/* de Broglie: m (kg), and one of {v (m/s)} or {K (J)}. Relativistic throughout. */
		deBroglie: function (m, o) {
			var mc2 = m * C.c * C.c, p, v, Kin, g;
			if (o.v != null) { v = o.v; if (v >= C.c) return { err: "faster than light" }; g = 1 / Math.sqrt(1 - v * v / (C.c * C.c)); p = g * m * v; Kin = (g - 1) * mc2; }
			else { Kin = o.K; g = 1 + Kin / mc2; p = Math.sqrt(Kin * Kin + 2 * Kin * mc2) / C.c; v = p * C.c * C.c / (Kin + mc2); }
			var lnr = o.v != null ? C.h / (m * o.v) : C.h / Math.sqrt(2 * m * Kin);
			return { lambda: C.h / p, p: p, v: v, K: Kin, gamma: g, lambdaNR: lnr, relDiff: Math.abs(lnr / (C.h / p) - 1) };
		},
		/* photon from any of: wavelength (m), energy (J), frequency (Hz), wavenumber (1/m) */
		photon: function (val, dim) {
			var f = dim === "length" ? C.c / val : dim === "energy" ? val / C.h : dim === "freq" ? val : dim === "wavenumber" ? val * C.c : NaN;
			var E = C.h * f, lam = C.c / f;
			return { f: f, E: E, eV: E / C.e, lambda: lam, wavenumber: 1 / lam, p: E / C.c, band: A.band(lam), rgb: A.wavelengthRGB(lam * 1e9) };
		},
		/* Heisenberg: minimum momentum / speed spread for a position spread dx, and energy spread for a time dt */
		uncertainty: function (dx, m) { var dp = C.hbar / (2 * dx); return { dp: dp, dv: dp / m }; },
		energyTime: function (dt) { var dE = C.hbar / (2 * dt); return { dE: dE, eV: dE / C.e, df: dE / C.h }; },
		/* rectangular barrier height V (J), width a (m), particle energy E (J), mass m: exact transmission + approximations */
		tunnel: function (E, V, a, m) {
			var hb = C.hbar, T, kap = NaN, k2;
			if (E <= 0) return { err: "energy must be above zero" };
			if (Math.abs(E - V) < 1e-12 * Math.max(E, V)) { T = 1 / (1 + m * a * a * V / (2 * hb * hb)); kap = 0; }
			else if (E < V) {
				kap = Math.sqrt(2 * m * (V - E)) / hb; var ka = kap * a;
				if (ka > 350) T = 16 * E * (V - E) / (V * V) * Math.exp(-2 * ka);
				else { var sh = Math.sinh(ka); T = 1 / (1 + V * V * sh * sh / (4 * E * (V - E))); }
			} else {
				k2 = Math.sqrt(2 * m * (E - V)) / hb; var sn = Math.sin(k2 * a);
				T = 1 / (1 + V * V * sn * sn / (4 * E * (E - V)));
			}
			var wkb = E < V ? Math.exp(-2 * kap * a) : 1, thick = E < V ? 16 * E * (V - E) / (V * V) * Math.exp(-2 * kap * a) : NaN;
			return { T: T, R: 1 - T, kappa: kap, depth: kap > 0 ? 1 / kap : Infinity, wkb: wkb, thick: thick, above: E > V, k2: k2 };
		},
		/* infinite square well: E_n = n^2 h^2 / (8 m L^2) */
		box: function (n, L, m) { return n * n * C.h * C.h / (8 * m * L * L); },
		/* free-electron model of a conjugated chain: N pi electrons in a box of length L -> HOMO, LUMO, absorption wavelength */
		dye: function (N, L) {
			var homo = Math.ceil(N / 2), lumo = homo + 1, dE = K.box(lumo, L, C.me) - K.box(homo, L, C.me);
			return { homo: homo, lumo: lumo, dE: dE, lambda: C.h * C.c / dE };
		},
		/* Bohr model, nucleus charge Z, nucleus mass M (kg, Infinity = fixed) */
		bohr: function (n, Z, M) {
			var mu = A.muFactor(M), r = n * n * C.a0 / (Z * mu), v = Z * C.alpha * C.c / n, E = -C.Ry * Z * Z / (n * n) * mu * C.e;
			return { r: r, v: v, beta: v / C.c, E: E, eV: E / C.e, T: 2 * PI * r / v, L: n * C.hbar, ion: -E / C.e };
		},
		Rinf: 10973731.568160,
		/* Rydberg formula: vacuum wavelength of n2 -> n1 (n2 > n1) */
		rydberg: function (n1, n2, Z, M) { var inv = K.Rinf * A.muFactor(M) * Z * Z * (1 / (n1 * n1) - 1 / (n2 * n2)); return 1 / inv; },
		/* nearest hydrogen-like lines to a wavelength (vacuum, m) */
		findLines: function (lam, Z, M, nmax, k, air) {
			nmax = nmax || 12; k = k || 5; var out = [];
			for (var a = 1; a < nmax; a++) for (var b = a + 1; b <= nmax; b++) {
				var lv = K.rydberg(a, b, Z, M), l = air ? A.toAir(lv) : lv;
				out.push({ n1: a, n2: b, lambda: l, series: A.seriesName(a), off: (l - lam) / lam });
			}
			out.sort(function (x, y) { return Math.abs(x.off) - Math.abs(y.off); });
			return out.slice(0, k);
		},
		/* Compton scattering off a particle of mass m, angle th (rad) */
		compton: function (lam, th, m) {
			m = m || C.me; var lc = C.h / (m * C.c), d = lc * (1 - Math.cos(th)), l2 = lam + d;
			var E1 = C.h * C.c / lam, E2 = C.h * C.c / l2;
			return { lc: lc, dl: d, lambda2: l2, E1: E1, E2: E2, Ke: E1 - E2 };
		},
		wienB: 2.897771955e-3, sigma: 5.670374419e-8,
		blackbody: function (T) { return { peak: K.wienB / T, fpeak: 5.878925757e10 * T, flux: K.sigma * Math.pow(T, 4) }; },
		/* Planck spectral radiance per wavelength, W / (m^2 sr m) */
		planck: function (lam, T) { var x = C.h * C.c / (lam * C.kB * T); return 2 * C.h * C.c * C.c / Math.pow(lam, 5) / (x > 700 ? Infinity : Math.expm1(x)); },
		/* thermal de Broglie wavelength h / sqrt(2 pi m kB T) */
		thermal: function (m, T) { return C.h / Math.sqrt(2 * PI * m * C.kB * T); },
		/* particles for the menus: [id, name, mass kg, charge in e] */
		PARTICLES: [["e", "Electron", C.me, -1], ["p", "Proton", C.mp, 1], ["n", "Neutron", C.mn, 0], ["mu", "Muon", 1.883531627e-28, -1], ["alpha", "Alpha particle", 6.6446573357e-27, 2],
			["H", "Hydrogen atom", 1.00782503207 * C.u, 0], ["He", "Helium-4 atom", 4.00260325413 * C.u, 0], ["Rb", "Rubidium-87 atom", 86.909180527 * C.u, 0],
			["C60", "Buckyball C₆₀", 720.0 * C.u, 0], ["dust", "Dust grain (1 µg)", 1e-9, 0], ["ball", "Baseball (145 g)", 0.145, 0]]
	};
	Q.calc = K;

	if (typeof module !== "undefined" && module.exports) module.exports = Q;
})(typeof window !== "undefined" ? window : globalThis);

/* ui-tunnel: the "Tunnelling" tab. Wave packet vs barrier (MESQ.tunnel.Sim), drag handles on the barrier, exact T(E) chart. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var T = Q.tunnel;
	var MASS = { electron: 1, gaas: 0.067, muon: 206.768, proton: T.MASSES.proton };
	var NAMES = { electron: "Electron", gaas: "Electron in GaAs", muon: "Muon", proton: "Proton", custom: "Particle" };
	var PRESETS = {
		thin: { type: "rect", V: 1, a: 0.3, E: 0.5, s: 2.5, mass: "electron" },
		thick: { type: "rect", V: 1, a: 1.4, E: 0.5, s: 2.5, mass: "electron" },
		above: { type: "rect", V: 0.5, a: 1, E: 0.75, s: 3.5, mass: "electron" },
		res: { type: "double", V: 0.6, a: 0.45, g: 2.5, E: -2, s: 10, mass: "electron" },
		alpha: { type: "alpha", V: 2, a: 1.5, E: 1.35, s: 1.8, mass: "electron" },
		stm: { type: "rect", V: 5, a: 0.4, E: 1, s: 2.5, mass: "electron" },
		field: { type: "tri", V: 3, a: 1.2, E: 1, s: 2.5, mass: "electron" },
		step: { type: "stepup", V: 1, a: 1, E: 1.3, s: 3, mass: "electron" },
		well: { type: "well", V: 1, a: 1.5, E: 0.25, s: 3, mass: "electron" },
		proton: { type: "rect", V: 1, a: 0.3 / T.lenUnit(T.MASSES.proton), E: 0.5, s: 2.5, mass: "proton" }
	};
	var DEF = { type: "rect", V: 1, a: 0.3, g: 2, E: 0.5, s: 2.5, mass: "electron", mc: 1, view: "fill", sp: 40, ball: true, mag: true, log: false, p: "thin" };
	var AMIN = 0.05, AMAX = 16;

	var api, st, el = {}, sim = null, shape = null, playing = false, raf = 0, done = false, ball = null, drag = null, peak0 = 1, layout = null, tlay = null, texact = 0, ro, visible = false;

	function $(id) { return document.getElementById(id); }
	function mass() { return st.mass === "custom" ? Math.max(0.01, +st.mc || 1) : MASS[st.mass] || 1; }
	function lu() { return T.lenUnit(mass()); }            // nm per simulation length unit
	function len(u, sig) { return Q.si(u * lu() * 1e-9, "m", sig || 3); }
	function eV(x) { return (Math.abs(x) < 0.1 && x !== 0 ? Q.fmt(x * 1000, 3) + " meV" : Q.fmt(x, 3) + " eV"); }
	function pct(p) { p = Math.max(0, p); if (p >= 0.001) return (p * 100).toFixed(p >= 0.1 ? 1 : 2) + "%"; if (p < 1e-12) return "0%"; return Q.fmt(p * 100, 2) + "%"; }
	function aToSl(a) { return Math.round(1000 * Math.log(a / AMIN) / Math.log(AMAX / AMIN)); }
	function slToA(v) { return AMIN * Math.pow(AMAX / AMIN, v / 1000); }
	function spFactor() { return Math.pow(10, (st.sp - 40) / 40); }

	/* energy of the nth transmission resonance (T close to 1) below the barrier top */
	function resonance(s, nth) {
		var n = 0, pp = 0, pr = 0, dE = s.V0 / 6000, found = s.V0 * 0.5;
		for (var E = 0.002; E < s.V0; E += dE) { var t = T.TofE(s, E); if (pp < pr && pr > t && pr > 0.5) { found = E - dE; if (++n >= nth) return found; } pp = pr; pr = t; }
		return found;
	}

	/* ---------- build the simulation from the settings ---------- */
	function build() {
		shape = T.shape(st.type, { V: st.V, a: st.a, g: st.g, W: 12, Vd: 1 });
		var VL = shape.VL || 0, E = Math.max(VL + 0.02, st.E), sig = st.s;
		if (st.type === "alpha") sig = Math.min(sig, 2);
		var ext = Math.max(Math.abs(shape.xa), Math.abs(shape.xb));
		var L = st.type === "alpha" ? 110 : Math.max(80, Math.ceil((ext + 9 * sig + 10) * 2 / 0.76));
		var vmin = 0; for (var x = shape.xa - 1; x <= shape.xb + 1; x += 0.05) vmin = Math.min(vmin, shape.f(x));
		var vtop = 0; for (x = shape.xa - 1; x <= shape.xb + 1; x += 0.05) vtop = Math.max(vtop, Math.min(shape.f(x), 12));
		var kmax = Math.max(Math.sqrt(Math.max(E - vmin, E) / T.C0) + 5 / (2 * sig), Math.sqrt(Math.max(0, vtop - E) / T.C0));
		var dxT = Math.min(0.06, 0.25 / kmax), phone = window.innerWidth < 700, nmax = phone ? 2048 : 4096, N = 1024;
		while (N < L / dxT && N < nmax) N *= 2;
		sim = new T.Sim({ shape: shape, E: E, sigma: sig, N: N, L: L });
		var mx = 0; for (var i = 0; i < sim.N; i++) mx = Math.max(mx, sim.re[i] * sim.re[i] + sim.im[i] * sim.im[i]);
		peak0 = mx || 1; done = false;
		texact = st.type === "alpha" ? T.TofE(shape, E, sim.xR) : T.tAvg(shape, E, sig, sim.xR);
		resetBall();
	}
	function resetBall() { ball = { x: sim.x0, dir: 1, gone: false, bounced: false }; }
	function stepBall(dt) {
		if (!ball || ball.gone) return;
		var E = sim.E0, s = 0, h = 0.02, left = Math.abs(dt);
		while (left > 0 && s < 4000) {
			var V = shape.f(ball.x), ke = E - V; if (ke <= 0) ke = 1e-6;
			var v = 2 * Math.sqrt(T.C0 * ke) / T.HBAR, step = Math.min(left, h / v), nx = ball.x + ball.dir * v * step;
			if (shape.f(nx) >= E) { ball.dir = -ball.dir; ball.bounced = true; nx = ball.x; }
			ball.x = nx; left -= step; s++;
			if (shape.type === "alpha" && ball.x < shape.xa + 0.05) { ball.dir = 1; ball.x = shape.xa + 0.05; }
			if (ball.x < sim.xL || ball.x > sim.xR) { ball.gone = true; break; }
		}
	}

	/* ---------- canvas sizing ---------- */
	function sizeStage(stage, cv, ratio, minH, maxH) {
		var w = stage.clientWidth || stage.parentNode.clientWidth || 600, wrap = stage.parentNode, fs = document.fullscreenElement === wrap;
		var h = Math.max(minH, Math.min(maxH, w * ratio)); if (w < 520) h = Math.max(minH, w * (ratio + 0.25));
		if (window.MESStage && MESStage.sh) h = MESStage.sh(stage, h);
		if (fs) { var other = 0; Array.prototype.forEach.call(wrap.children, function (c) { if (c !== stage) other += c.offsetHeight; }); h = Math.max(200, window.innerHeight - other); }
		stage.style.height = Math.round(h) + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
		return { w: w, h: h, dpr: dpr };
	}

	/* ---------- main drawing ---------- */
	function draw() {
		if (!sim) return;
		var S = sizeStage(el.stage, el.cv, 0.5, W0() < 520 ? 400 : 280, 560), ctx = el.cv.getContext("2d"), W = S.w, H = S.h;
		ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
		ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var padL = 46, padR = 12, padT = 34, padB = 30, phone = W < 520;
		if (phone) { padT = 30; padB = 108; padL = 40; }
		var half = Math.max(Math.abs(sim.x0) + 3.5 * sim.sigma, shape.xb + 4 * sim.sigma, 6), xmin = Math.max(sim.xL - 0.3 * sim.lab, -half), xmax = Math.min(sim.xR + 0.3 * sim.lab, half);
		if (shape.type === "alpha") { xmin = shape.xa - 2; xmax = Math.min(sim.xR, 22); }
		var E0 = sim.E0, vmax = 0, vmin = 0;
		for (var i = 0; i < sim.N; i++) { var x = sim.x[i]; if (x < xmin || x > xmax) continue; var V = sim.V[i]; if (V > vmax && V < 9) vmax = V; vmin = Math.min(vmin, V); }
		if (shape.type === "alpha") vmax = Math.max(vmax, shape.V0);
		var emax = Math.max(vmax, E0) * 1.3 + 0.05, emin = Math.min(vmin, 0) - 0.12 * (emax - Math.min(vmin, 0));
		/* while a handle is dragged the axes stay as they were, so the handle follows the pointer */
		if (drag && drag.view) { xmin = drag.view[0]; xmax = drag.view[1]; emin = drag.view[2]; emax = drag.view[3]; }
		var X = function (x) { return padL + (x - xmin) / (xmax - xmin) * (W - padL - padR); };
		var XI = function (px) { return xmin + (px - padL) / (W - padL - padR) * (xmax - xmin); };
		var Y = function (e) { return padT + (emax - e) / (emax - emin) * (H - padT - padB); };
		layout = { X: X, XI: XI, Y: Y, W: W, H: H, padT: padT, padB: padB, emin: emin, emax: emax, view: [xmin, xmax, emin, emax] };
		/* absorbing edges */
		ctx.fillStyle = "rgba(148,163,184,0.08)";
		if (sim.xL > xmin) ctx.fillRect(X(xmin), padT, X(sim.xL) - X(xmin), H - padT - padB);
		if (sim.xR < xmax) ctx.fillRect(X(sim.xR), padT, X(xmax) - X(sim.xR), H - padT - padB);
		/* axes: energy ticks */
		ctx.font = "11px system-ui, sans-serif"; ctx.textBaseline = "middle"; ctx.fillStyle = "#9aa6c0"; ctx.strokeStyle = "rgba(148,163,184,0.12)"; ctx.lineWidth = 1;
		var et = niceStep((emax - emin) / 5);
		for (var e = Math.ceil(emin / et) * et; e <= emax; e += et) { var y = Y(e); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(+e.toFixed(3) + "", padL - 5, y); }
		ctx.save(); ctx.translate(11, (padT + H - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("energy (eV)", 0, 0); ctx.restore();
		/* x ticks in real units */
		var span = (xmax - xmin) * lu(), unit = span > 3e3 ? 1e3 : span > 3 ? 1 : span > 3e-3 ? 1e-3 : 1e-6, uname = unit === 1e3 ? "µm" : unit === 1 ? "nm" : unit === 1e-3 ? "pm" : "fm";
		var xt = niceStep(span / unit / (phone ? 4 : 8)) * unit / lu();
		ctx.textAlign = "center"; ctx.textBaseline = "top";
		for (var xx = Math.ceil(xmin / xt) * xt; xx <= xmax; xx += xt) { var px = X(xx); ctx.fillText(+(xx * lu() / unit).toFixed(4) + "", px, H - padB + 4); ctx.beginPath(); ctx.moveTo(px, H - padB); ctx.lineTo(px, H - padB + 3); ctx.stroke(); }
		ctx.textAlign = "right"; ctx.fillText(uname, W - padR, H - padB + 16);
		/* potential (clipped to the plot) */
		ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, W - padL - padR, H - padT - padB); ctx.clip();
		ctx.beginPath(); ctx.moveTo(X(xmin), Y(emin));
		var Vat = function (x) { return shape.f(Math.min(Math.max(x, sim.xL), sim.xR)); };
		var steps = Math.max(400, W), last = 0;
		for (var k = 0; k <= steps; k++) { var xv = xmin + (xmax - xmin) * k / steps, vv = Math.min(Vat(xv), emax + 1); ctx.lineTo(X(xv), Y(vv)); last = vv; }
		ctx.lineTo(X(xmax), Y(emin)); ctx.closePath();
		var gr = ctx.createLinearGradient(0, padT, 0, H - padB); gr.addColorStop(0, "rgba(95,111,147,0.55)"); gr.addColorStop(1, "rgba(95,111,147,0.18)"); ctx.fillStyle = gr; ctx.fill();
		ctx.beginPath(); for (k = 0; k <= steps; k++) { xv = xmin + (xmax - xmin) * k / steps; vv = Math.min(Vat(xv), emax + 1); if (k) ctx.lineTo(X(xv), Y(vv)); else ctx.moveTo(X(xv), Y(vv)); }
		ctx.strokeStyle = "#8ea0c8"; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
		/* zero line */
		ctx.strokeStyle = "rgba(148,163,184,0.35)"; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke(); ctx.setLineDash([]);
		/* energy line */
		var yE = Y(E0);
		ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1.3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(padL, yE); ctx.lineTo(W - padR, yE); ctx.stroke(); ctx.setLineDash([]);
		/* wave */
		drawWave(ctx, X, yE, W, H, padL, padR, padT, xmin, xmax);
		/* handles */
		drawHandles(ctx, X, Y);
		/* labels */
		ctx.textBaseline = "bottom"; ctx.textAlign = "left"; ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#facc15";
		ctx.fillText("⟨E⟩ = " + eV(E0), padL + 6, yE - 3);
		/* classical ball */
		if (st.ball && ball && !ball.gone) {
			ctx.beginPath(); ctx.arc(X(ball.x), yE, 6, 0, 7); ctx.fillStyle = "#f97316"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
		}
		/* scale text */
		ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#9aa6c0"; ctx.textAlign = "right"; ctx.textBaseline = "top";

	}
	function W0() { return el.stage.clientWidth || 600; }
	function niceStep(r) { var p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

	function drawWave(ctx, X, yE, W, H, padL, padR, padT, xmin, xmax) {
		/* the packet's starting peak fills ~45% of the room above the energy line, so the interference fringes in front of a
		   barrier (up to 4x the incoming density) still mostly fit; anything taller is cut at the top of the picture */
		var N = sim.N, re = sim.re, im = sim.im, amp = Math.max(30, (yE - padT - 4) * 0.45), sc = amp / peak0, view = st.view, room = yE - padT + 2;
		/* magnify the far side */
		var mag = 1, xb = shape.type === "alpha" ? 0 : shape.xb, pl = 0, pr = 0, i;
		if (st.mag) {
			for (i = 0; i < N; i++) { var p = re[i] * re[i] + im[i] * im[i], x = sim.x[i]; if (x > xb + 0.3 && x < sim.xR) pr = Math.max(pr, p); else if (x < xb) pl = Math.max(pl, p); }
			if (pr > 0 && pr < peak0 * 0.02) { mag = Math.pow(10, Math.floor(Math.log10(peak0 * 0.3 / pr))); mag = Math.min(mag, 1e8); if (mag < 10) mag = 1; }
		}
		var cols = Math.round(W - padL - padR), px0 = padL, x0 = sim.x[0], dx = sim.dx;
		function idx(px) { var x = xmin + (px - px0) / cols * (xmax - xmin); return Math.max(0, Math.min(N - 1, Math.round((x - x0) / dx))); }
		function magAt(px) { var x = xmin + (px - px0) / cols * (xmax - xmin); return x > xb + 0.3 ? mag : 1; }
		if (view === "phase") {
			for (var c = 0; c < cols; c++) {
				var j = idx(px0 + c), d = (re[j] * re[j] + im[j] * im[j]) * sc * magAt(px0 + c); if (d < 0.4) continue;
				var rgb = Q.phaseRGB(Math.atan2(im[j], re[j]), 1); ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
				ctx.fillRect(px0 + c, yE - Math.min(d, room), 1.2, Math.min(d, room));
			}
		} else {
			ctx.beginPath(); ctx.moveTo(px0, yE);
			for (c = 0; c <= cols; c++) { j = idx(px0 + c); d = (re[j] * re[j] + im[j] * im[j]) * sc * magAt(px0 + c); ctx.lineTo(px0 + c, yE - Math.min(d, room)); }
			ctx.lineTo(px0 + cols, yE); ctx.closePath();
			ctx.fillStyle = view === "reim" ? "rgba(139,123,255,0.28)" : "rgba(139,123,255,0.62)"; ctx.fill();
			ctx.strokeStyle = "#b9adff"; ctx.lineWidth = 1.2; ctx.stroke();
			if (view === "reim") {
				var asc = amp * 0.55 / Math.sqrt(peak0);
				[["#22d3ee", re], ["#f472b6", im]].forEach(function (pair) {
					ctx.beginPath();
					for (var c2 = 0; c2 <= cols; c2++) { var j2 = idx(px0 + c2), v = pair[1][j2] * asc * Math.sqrt(magAt(px0 + c2)); v = Math.max(-(H - yE - 4), Math.min(room, v)); if (c2) ctx.lineTo(px0 + c2, yE - v); else ctx.moveTo(px0 + c2, yE - v); }
					ctx.strokeStyle = pair[0]; ctx.lineWidth = 1.1; ctx.stroke();
				});
			}
		}
		if (mag > 1) {
			var bx = X(xb + 0.3);
			ctx.strokeStyle = "rgba(244,114,182,0.6)"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(bx, padT); ctx.lineTo(bx, yE); ctx.stroke(); ctx.setLineDash([]);
			ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#f472b6"; ctx.textAlign = "left"; ctx.textBaseline = "top";
			ctx.fillText("× " + Q.fmt(mag, 1) + " (magnified)", bx + 5, padT + 2);
		}
	}

	/* handles: [kind, x, y] in canvas px */
	function handles() {
		if (!layout) return [];
		var X = layout.X, Y = layout.Y, s = shape, out = [], t = s.type, V = s.V0;
		if (t === "rect") { out.push(["h", X(0), Y(V)]); out.push(["w", X(s.xb), Y(V / 2)]); }
		else if (t === "double") { out.push(["h", X(s.g / 2 + s.a / 2), Y(V)]); out.push(["w", X(s.xb), Y(V / 2)]); out.push(["g", X(s.g / 2), Y(V / 2)]); }
		else if (t === "well") { out.push(["h", X(0), Y(-V)]); out.push(["w", X(s.xb), Y(-V / 2)]); }
		else if (t === "tri") { out.push(["h", X(0), Y(V)]); out.push(["w", X(s.xb), Y(0)]); }
		else if (t === "stepup") out.push(["h", X(Math.min(6, sim.xR / 3)), Y(V)]);
		else if (t === "stepdown") out.push(["h", X(Math.min(6, sim.xR / 3)), Y(-V)]);
		else if (t === "alpha") { out.push(["h", X(0), Y(V)]); out.push(["w", X(s.a), Y(V / 2)]); }
		return out;
	}
	function drawHandles(ctx, X, Y) {
		handles().forEach(function (h) {
			ctx.beginPath();
			if (h[0] === "h") ctx.arc(h[1], h[2], 7, 0, 7); else ctx.rect(h[1] - 6, h[2] - 6, 12, 12);
			ctx.fillStyle = drag && drag.k === h[0] ? "#ffffff" : "#c7d2fe"; ctx.fill(); ctx.strokeStyle = "#5b3fd6"; ctx.lineWidth = 2; ctx.stroke();
		});
	}
	function hit(px, py) { var hs = handles(), best = null, bd = 22; hs.forEach(function (h) { var d = Math.hypot(px - h[1], py - h[2]); if (d < bd) { bd = d; best = h; } }); return best; }
	function evPos(e, cv) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function onDown(e) {
		var p = evPos(e, el.cv), h = hit(p.x, p.y); if (!h) return;
		drag = { k: h[0], id: e.pointerId, view: layout.view.slice() }; el.cv.setPointerCapture(e.pointerId); e.preventDefault(); draw();
	}
	function onMove(e) {
		var p = evPos(e, el.cv);
		if (!drag) { el.cv.style.cursor = hit(p.x, p.y) ? "grab" : "default"; return; }
		if (e.pointerId !== drag.id) return;
		var x = layout.XI(p.x), en = layout.emax - (p.y - layout.padT) / (layout.H - layout.padT - layout.padB) * (layout.emax - layout.emin), t = st.type;
		if (drag.k === "h") st.V = Q.clamp(+(t === "well" || t === "stepdown" ? -en : en).toFixed(2), 0.05, 6);
		else if (drag.k === "w") {
			var a = t === "rect" || t === "well" ? 2 * x : t === "double" ? x - st.g / 2 : x;
			st.a = Q.clamp(+a.toFixed(3), AMIN, AMAX);
		} else if (drag.k === "g") st.g = Q.clamp(+(2 * x).toFixed(2), 0.5, 8);
		st.p = null; syncInputs(); rebuild(true);
	}
	function onUp(e) { if (drag && e.pointerId === drag.id) { drag = null; api.save(); draw(); } }

	/* ---------- T(E) chart ---------- */
	function drawT() {
		if (!sim) return;
		var S = sizeStage(el.tstage, el.tcv, 0.3, W0() < 520 ? 280 : 190, 320), ctx = el.tcv.getContext("2d"), W = S.w, H = S.h;
		ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var padL = 50, padR = 14, padT = 34, padB = W < 520 ? 70 : 30, VL = shape.VL || 0;
		var emax = Math.max(shape.V0 * 2.2, sim.E0 * 1.5, 0.3), emin = Math.max(VL, 0) + 0.002;
		if (shape.type === "alpha") emin = 0.01;
		var lg = st.log, tmin = lg ? 1e-8 : 0;
		var X = function (e) { return padL + (e - emin) / (emax - emin) * (W - padL - padR); };
		var Y = function (t) { if (lg) t = Math.log10(Math.max(t, tmin)); var a = lg ? -8 : 0, b = lg ? 0 : 1; return padT + (b - t) / (b - a) * (H - padT - padB); };
		tlay = { X: X, emin: emin, emax: emax, padL: padL, padR: padR, W: W };
		ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#9aa6c0"; ctx.strokeStyle = "rgba(148,163,184,0.12)"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
		var ticks = lg ? [1, 1e-2, 1e-4, 1e-6, 1e-8] : [0, 0.25, 0.5, 0.75, 1];
		ticks.forEach(function (t) { var y = Y(t); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(lg ? (t === 1 ? "1" : "10" + Q.sup(Math.round(Math.log10(t)))) : String(t), padL - 5, y); });
		var et = niceStep((emax - emin) / 6); ctx.textAlign = "center"; ctx.textBaseline = "top";
		for (var e = Math.ceil(emin / et) * et; e <= emax; e += et) ctx.fillText(+e.toFixed(3) + "", X(e), H - padB + 4);
		ctx.textAlign = "right"; ctx.fillText("E (eV)", W - padR, H - padB + 16);
		/* packet energy spread (gaussian band) */
		var k0 = sim.k0, sk = 1 / (2 * sim.sigma), E0 = sim.E0;
		for (var px = padL; px < W - padR; px++) {
			var en = emin + (px - padL) / (W - padL - padR) * (emax - emin), kk = Math.sqrt(Math.max(0, en - VL) / T.C0), wgt = Math.exp(-(kk - k0) * (kk - k0) / (2 * sk * sk));
			if (wgt < 0.02) continue; ctx.fillStyle = "rgba(250,204,21," + (0.42 * wgt).toFixed(3) + ")"; ctx.fillRect(px, padT, 1, H - padT - padB);
		}
		/* barrier top line */
		if (shape.V0 > emin && shape.V0 < emax && shape.type !== "well") { ctx.strokeStyle = "rgba(142,160,200,0.6)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(shape.V0), padT); ctx.lineTo(X(shape.V0), H - padB); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = "#8ea0c8"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("V₀", X(shape.V0) + 3, padT + 2); }
		/* curve */
		var g = T.segs(shape, sim.xR), n = Math.min(700, Math.round(W - padL - padR));
		ctx.beginPath();
		for (var i = 0; i <= n; i++) { var E = emin + (emax - emin) * i / n, t = T.trans(E, g.segs, g.VL, g.VR); var y = Y(t); if (i) ctx.lineTo(X(E), y); else ctx.moveTo(X(E), y); }
		ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.8; ctx.stroke();
		/* exact average ring + simulated dot */
		var ex = texact, sx = X(E0);
		ctx.beginPath(); ctx.arc(sx, Y(ex), 7, 0, 7); ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 2; ctx.stroke();
		var s = sim.stats(), simT = shape.type === "alpha" ? null : s.right, fin = settled(s);
		if (simT != null && fin) { ctx.beginPath(); ctx.arc(sx, Y(simT), 4, 0, 7); ctx.fillStyle = "#f472b6"; ctx.fill(); }
		ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#f9a8d4"; ctx.textBaseline = "bottom";
		var lbl = shape.type === "alpha" ? "T(E) per hit on the barrier = " + Q.fmt(ex, 2) : "exact ⟨T⟩ = " + pct(ex) + (simT != null && fin ? "   simulated " + pct(simT) : "");
		ctx.textAlign = sx > W * 0.6 ? "right" : "left"; ctx.fillText(lbl, sx + (sx > W * 0.6 ? -10 : 10), Math.max(padT + 26, Y(ex) - 8));
	}

	/* the collision is over: nothing left near the barrier and the packet's slow tail has had time to arrive */
	function settled(s) {
		if (done) return true;
		var v = 2 * T.C0 * Math.max(sim.k0, 0.05) / T.HBAR, slow = Math.max(0.3 * v, v - 4 * 2 * T.C0 / (2 * sim.sigma) / T.HBAR);
		return s.inside < 2e-3 && sim.t > (Math.abs(shape.xb - sim.x0) + 4 * sim.sigma) / slow;
	}
	/* ---------- readouts ---------- */
	function readouts() {
		var s = sim.stats(), lab = shape.labels, alpha = shape.type === "alpha";
		el.lr.textContent = alpha ? "Round trip in the nucleus" : lab[0]; el.li.textContent = lab[1]; el.lt.textContent = lab[2];
		el.rr.textContent = alpha ? Q.si(2 * shape.W / (2 * T.C0 * sim.k0 / T.HBAR) * 1e-15, "s") : pct(s.left); el.ri.textContent = pct(alpha ? s.inside + s.left : s.inside); el.rt.textContent = pct(s.right);
		el.rx.textContent = alpha ? pct(texact) + " per hit" : pct(texact);
		el.lx.textContent = alpha ? "Escape chance per hit (exact)" : "Exact T for this packet";
		el.re.textContent = eV(sim.E0); el.rv.textContent = shape.type === "well" ? "−" + eV(shape.V0) + " (a dip)" : shape.type === "stepdown" ? "−" + eV(shape.V0) : eV(shape.V0);
		var top = shape.type === "well" || shape.type === "stepdown" ? 0 : shape.V0, kap = T.kappa(top, sim.E0);
		el.rk.textContent = kap > 0 ? len(1 / kap) : "none (E above the top)";
		el.rtime.textContent = Q.si(sim.t * 1e-15, "s");
		el.rc.textContent = !st.ball ? "hidden" : alpha ? "trapped forever" : sim.E0 < top ? "bounces back (100%)" : "goes over (100%)";
	}
	function scaleNote() {
		var m = mass(), u = lu(), name = st.mass === "custom" ? m + " mₑ" : NAMES[st.mass];
		el.badge.textContent = name + " · x in " + (u >= 0.9995 ? "nm" : u > 9e-4 ? "pm" : "fm") + " · E in eV · t in fs";
		var txt = "Lengths for " + (st.mass === "custom" ? "a particle of " + Q.fmt(m, 3) + " electron masses" : NAMES[st.mass].toLowerCase()) + ". ";
		if (Math.abs(m - 1) > 1e-9) txt += "The picture is the electron one with every length multiplied by √(mₑ/m) = " + Q.fmt(u, 3) + ": a heavier particle needs a much thinner barrier to tunnel as much. ";
		txt += "Grid: " + sim.N + " points, " + len(sim.dx) + " apart; time step " + Q.fmt(sim.dt, 2) + " fs.";
		if (shape.type === "alpha") txt += " Alpha decay preset: the Gamow picture (a particle rattling in a nucleus, leaking a little at each hit) at electron scale; real alpha decay has MeV energies and femtometre sizes, and lifetimes from microseconds to billions of years for the same reason as here: T is exponentially sensitive to the barrier.";
		if (shape.type === "rect" && st.p === "stm") { var k = T.kappa(shape.V0, sim.E0); txt += " STM: every extra 0.1 nm of gap divides the current by e^(2κ·0.1 nm) ≈ " + Q.fmt(Math.exp(2 * k * 0.1 / lu()), 2) + ", which is why the microscope can feel single atoms."; }
		el.scale.textContent = txt;
	}

	/* ---------- inputs ---------- */
	function syncInputs() {
		el.type.value = st.type; el.mass.value = st.mass; el.mcf.hidden = st.mass !== "custom"; el.mc.value = st.mc;
		el.E.value = st.E; el.Ev.textContent = eV(st.E);
		el.V.value = st.V; el.Vv.textContent = eV(st.V);
		el.a.value = aToSl(st.a); el.av.textContent = len(st.a);
		el.g.value = st.g; el.gv.textContent = len(st.g);
		el.s.value = st.s; el.sv.textContent = len(st.s);
		el.sp.value = st.sp; el.spv.textContent = "×" + Q.fmt(spFactor(), 2);
		el.view.value = st.view; el.ball.checked = !!st.ball; el.mag.checked = !!st.mag; el.log.setAttribute("aria-pressed", st.log ? "true" : "false");
		var t = st.type;
		el.gf.hidden = t !== "double"; el.af.hidden = t === "stepup" || t === "stepdown";
		el.al.textContent = t === "well" ? "Well width" : t === "alpha" ? "Coulomb tail length r₀" : t === "tri" ? "Barrier length" : t === "double" ? "Each barrier's width" : "Barrier width";
		el.E.min = t === "alpha" ? 0.1 : 0.02;
		Array.prototype.forEach.call(el.presets.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === st.p ? "true" : "false"); });
	}
	var rbT = 0;
	function rebuild(quick) {
		build(); scaleNote(); readouts(); draw(); drawT();
		clearTimeout(rbT); rbT = setTimeout(function () { api.save(); }, 250);
	}
	function linkUrl() {
		var u = new URL(location.href);
		["tu_t", "tu_E", "tu_V", "tu_a", "tu_g", "tu_s", "tu_m", "tu_mc"].forEach(function (k) { u.searchParams.delete(k); });
		u.searchParams.set("tab", "tunnel"); u.searchParams.set("tu_t", st.type); u.searchParams.set("tu_E", st.E); u.searchParams.set("tu_V", st.V); u.searchParams.set("tu_a", +st.a.toFixed(4));
		if (st.type === "double") u.searchParams.set("tu_g", st.g);
		u.searchParams.set("tu_s", st.s); u.searchParams.set("tu_m", st.mass); if (st.mass === "custom") u.searchParams.set("tu_mc", st.mc);
		return u.toString();
	}
	function applyPreset(id) {
		var p = PRESETS[id]; if (!p) return;
		st.type = p.type; st.V = p.V; st.a = p.a; st.s = p.s; st.mass = p.mass; if (p.g) st.g = p.g; st.p = id;
		if (p.E < 0) st.E = +resonance(T.shape(p.type, { V: p.V, a: p.a, g: p.g }), -p.E).toFixed(4); else st.E = p.E;
		st.mag = true; syncInputs(); rebuild(); st.log = texact < 0.02 && p.type !== "alpha"; syncInputs(); drawT(); setPlay(true);
	}
	function readQuery(q) {
		if (!q.get("tu_t")) return;
		var num = function (k, lo, hi, d) { var v = parseFloat(q.get(k)); return isFinite(v) ? Q.clamp(v, lo, hi) : d; };
		var t = q.get("tu_t"); if (["rect", "double", "stepup", "stepdown", "well", "tri", "alpha"].indexOf(t) >= 0) st.type = t;
		st.E = num("tu_E", 0.02, 5, st.E); st.V = num("tu_V", 0.05, 6, st.V); st.a = num("tu_a", AMIN, AMAX, st.a); st.g = num("tu_g", 0.5, 8, st.g); st.s = num("tu_s", 0.8, 10, st.s);
		var m = q.get("tu_m"); if (MASS[m] || m === "custom") st.mass = m; st.mc = num("tu_mc", 0.01, 100000, st.mc); st.p = null;
	}

	/* ---------- animation ---------- */
	function setPlay(on) {
		playing = !!on; el.play.textContent = playing ? "Pause" : "Play"; el.play.setAttribute("aria-pressed", playing ? "true" : "false");
		if (playing && done) { sim.reset(); resetBall(); done = false; }
		if (playing && visible && !raf) raf = requestAnimationFrame(frame);
	}
	function stepsPerFrame() {
		var v = 2 * T.C0 * Math.max(sim.k0, 0.3) / T.HBAR, D = sim.xR - sim.x0, tc = D / v;
		if (shape.type === "alpha") tc = 60 / v * 8;
		return Math.max(1, Math.round(tc / 6 / 60 / sim.dt * spFactor()));
	}
	function advance(n) {
		var t0 = performance.now(), want = n, done2 = 0, chunk = Math.max(1, Math.min(want, 20));
		while (done2 < want) { sim.step(chunk); done2 += chunk; if (performance.now() - t0 > 8) break; }
		stepBall(done2 * sim.dt);
		var s = sim.stats();
		if (shape.type !== "alpha" && s.onGrid < 0.002) { done = true; setPlay(false); }
		if (shape.type === "alpha" && s.inside + s.left < 0.003) { done = true; setPlay(false); }
	}
	function frame() {
		raf = 0; if (!playing || !visible) return;
		advance(stepsPerFrame()); draw(); readouts();
		frame.n = (frame.n || 0) + 1; if (frame.n % 6 === 0 || done) drawT();
		if (playing) raf = requestAnimationFrame(frame);
	}

	function fullscreen(wrap) { if (document.fullscreenElement === wrap) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); }

	Q.reg("tunnel", {
		init: function (panel, a) {
			api = a; st = api.st;
			Object.keys(DEF).forEach(function (k) { if (st[k] == null) st[k] = DEF[k]; });
			readQuery(api.query);
			["wrap", "stage", "cv", "badge", "play", "step", "reset", "view", "fs", "twrap", "tstage", "tcv", "log", "tfs", "type", "mass", "mcf", "mc", "E", "Ev", "V", "Vv", "a", "av", "al", "af", "g", "gv", "gf", "s", "sv", "sp", "spv", "ball", "mag", "link", "scale", "presets",
				"lr", "li", "lt", "lx", "rr", "ri", "rt", "rx", "re", "rv", "rk", "rtime", "rc"].forEach(function (k) { el[k] = $("qm-tu-" + k); });
			el.presets.addEventListener("click", function (e) { var b = e.target.closest("button[data-p]"); if (b) applyPreset(b.dataset.p); });
			el.play.addEventListener("click", function () { setPlay(!playing); });
			el.step.addEventListener("click", function () { setPlay(false); if (done) { sim.reset(); resetBall(); done = false; } advance(stepsPerFrame() * 10); draw(); readouts(); drawT(); });
			el.reset.addEventListener("click", function () { sim.reset(); resetBall(); done = false; draw(); readouts(); drawT(); });
			el.view.addEventListener("change", function () { st.view = el.view.value; api.save(); draw(); });
			el.fs.addEventListener("click", function () { fullscreen(el.wrap); });
			el.tfs.addEventListener("click", function () { fullscreen(el.twrap); });
			el.log.addEventListener("click", function () { st.log = !st.log; syncInputs(); api.save(); drawT(); });
			function inp(id, fn) { el[id].addEventListener("input", function () { fn(el[id].value); st.p = null; syncInputs(); rebuild(true); }); }
			inp("E", function (v) { st.E = +v; }); inp("V", function (v) { st.V = +v; }); inp("a", function (v) { st.a = +slToA(+v).toFixed(4); });
			inp("g", function (v) { st.g = +v; }); inp("s", function (v) { st.s = +v; });
			el.sp.addEventListener("input", function () { st.sp = +el.sp.value; syncInputs(); api.save(); });
			el.type.addEventListener("change", function () { st.type = el.type.value; st.p = null; if (st.type === "alpha") { st.E = Math.min(st.E, st.V * 0.8); st.a = Math.min(Math.max(st.a, 0.5), 4); } syncInputs(); rebuild(); });
			el.mass.addEventListener("change", function () { st.mass = el.mass.value; st.p = null; syncInputs(); rebuild(); });
			el.mc.addEventListener("change", function () { st.mc = Q.clamp(+el.mc.value || 1, 0.01, 100000); syncInputs(); rebuild(); });
			el.ball.addEventListener("change", function () { st.ball = el.ball.checked; api.save(); draw(); readouts(); });
			el.mag.addEventListener("change", function () { st.mag = el.mag.checked; api.save(); draw(); });
			el.link.addEventListener("click", function () { api.copy(linkUrl(), "Link copied"); });
			el.cv.addEventListener("pointerdown", onDown); el.cv.addEventListener("pointermove", onMove); el.cv.addEventListener("pointerup", onUp); el.cv.addEventListener("pointercancel", onUp);
			el.cv.addEventListener("touchstart", function (e) { var t = e.touches[0]; if (!t) return; var r = el.cv.getBoundingClientRect(); if (hit(t.clientX - r.left, t.clientY - r.top)) e.preventDefault(); }, { passive: false });
			el.cv.addEventListener("keydown", function (e) {
				if (e.key === " ") { e.preventDefault(); setPlay(!playing); }
				else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); st.V = Q.clamp(+(st.V + (e.key === "ArrowUp" ? 0.05 : -0.05)).toFixed(2), 0.05, 6); st.p = null; syncInputs(); rebuild(); }
				else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); st.a = Q.clamp(st.a * (e.key === "ArrowRight" ? 1.06 : 1 / 1.06), AMIN, AMAX); st.p = null; syncInputs(); rebuild(); }
			});
			el.tcv.addEventListener("click", function (e) { if (!tlay) return; var p = evPos(e, el.tcv), en = tlay.emin + (p.x - tlay.padL) / (tlay.W - tlay.padL - tlay.padR) * (tlay.emax - tlay.emin); st.E = Q.clamp(+en.toFixed(3), 0.02, 5); st.p = null; syncInputs(); rebuild(); });
			if (window.ResizeObserver) { ro = new ResizeObserver(function () { if (visible) { draw(); drawT(); } }); ro.observe(el.stage); ro.observe(el.tstage); }
			window.addEventListener("resize", function () { if (visible) { draw(); drawT(); } });
			document.addEventListener("fullscreenchange", function () { if (visible) setTimeout(function () { draw(); drawT(); }, 60); });
			syncInputs(); build(); scaleNote(); readouts();
			window.MESQuantumDebug_tunnel = { get sim() { return sim; }, get shape() { return shape; }, st: st, step: function (n) { sim.step(n || 100); stepBall((n || 100) * sim.dt); draw(); readouts(); drawT(); return sim.stats(); }, toTime: function (fs) { var t0 = sim.t; while (sim.t < fs) sim.step(50); stepBall(sim.t - t0); draw(); readouts(); drawT(); return sim.stats(); }, run: function (fs) { while (!done && fs-- > 0) advance(stepsPerFrame()); draw(); readouts(); drawT(); return sim.stats(); }, preset: applyPreset, handles: handles, draw: function () { draw(); drawT(); } };
		},
		show: function () { visible = true; draw(); drawT(); readouts(); if (playing && !raf) raf = requestAnimationFrame(frame); },
		hide: function () { visible = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
	});
})();

/* ui-box: the "Wells & energy levels" tab. Stationary states by MESQ.tunnel.solveWell, click levels to build a superposition that moves. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var T = Q.tunnel;
	var MASS = { electron: 1, gaas: 0.067, muon: 206.768, proton: T.MASSES.proton, h2: T.MASSES.proton / 2 };
	var NAMES = { electron: "Electron", gaas: "Electron in GaAs", muon: "Muon", proton: "Proton", h2: "H₂ vibration (μ = mₚ/2)", custom: "Particle" };
	/* parameter sliders per potential: key, label, min, max, log?, unit */
	var PARAMS = {
		inf: [["L", "Box width L", 0.1, 5, true, "nm"]],
		fin: [["a", "Well width", 0.1, 5, true, "nm"], ["V", "Well depth V₀", 0.02, 5, false, "eV"]],
		ho: [["w", "Spring ħω", 0.005, 1, true, "eV"]],
		dw: [["V", "Barrier between the wells", 0.1, 4, false, "eV"], ["b", "Distance of each well from the middle", 0.2, 2, false, "nm"]],
		morse: [["D", "Bond energy D", 0.5, 10, false, "eV"], ["a", "Width parameter a", 5, 40, false, "/nm"], ["re", "Bond length", 0.03, 0.3, false, "nm"]],
		lin: [["F", "Force (slope)", 0.05, 20, true, "eV/nm"]],
		custom: [["L", "Width", 0.3, 5, true, "nm"], ["vmax", "Height scale", 0.05, 5, true, "eV"]]
	};
	var DEFP = { inf: { L: 1 }, fin: { a: 1, V: 2 }, ho: { w: 0.2 }, dw: { V: 1, b: 1 }, morse: { D: 4.75, a: 19.43, re: 0.0741 }, lin: { F: 2 }, custom: { L: 2, vmax: 1, pts: [1, 0.4, 0.1, 0.25, 0.7, 0.25, 0.1, 0.4, 1] } };
	var PRESETS = {
		inf: { type: "inf", mass: "electron", sel: [0, 1] }, fin: { type: "fin", mass: "electron", sel: [0] }, ho: { type: "ho", mass: "electron", sel: [0, 1] },
		dw: { type: "dw", mass: "electron", sel: [0, 1] }, morse: { type: "morse", mass: "h2", sel: [0] }, lin: { type: "lin", mass: "electron", sel: [0, 1] },
		custom: { type: "custom", mass: "electron", sel: [0] }, slosh: { type: "ho", mass: "electron", sel: [0, 1, 2, 3, 4, 5, 6, 7], coh: 1.6 }
	};
	var COL = ["#22d3ee", "#a3e635", "#facc15", "#fb923c", "#f472b6", "#c084fc", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#e879f9", "#38bdf8"];

	var api, st, el = {}, sol = null, well = null, playing = false, raf = 0, visible = false, t = 0, lastTs = 0, re, im, amps = [], scaleP = 1, lay = null, drag = null, trail = [];

	function $(id) { return document.getElementById(id); }
	function mass() { return st.mass === "custom" ? Math.max(0.01, +st.mc || 1) : MASS[st.mass] || 1; }
	function cc() { return T.C0 / mass(); }
	function eV(x) { var a = Math.abs(x); return a !== 0 && a < 0.1 ? (a < 1e-4 ? Q.fmt(x * 1e6, 3) + " µeV" : Q.fmt(x * 1000, 3) + " meV") : Q.fmt(x, 4) + " eV"; }
	function nm(x) { return Q.si(x * 1e-9, "m"); }
	function P() { st.p_ = st.p_ || {}; if (!st.p_[st.type]) st.p_[st.type] = JSON.parse(JSON.stringify(DEFP[st.type])); return st.p_[st.type]; }
	function spF() { return Math.pow(10, (st.sp - 50) / 35); }
	function n0() { return st.type === "ho" || st.type === "morse" ? 0 : 1; }
	function lname(n) { return (st.type === "morse" ? "v = " : "n = ") + (n + n0()); }

	/* ---------- solve ---------- */
	function solve() {
		var p = P(), q = JSON.parse(JSON.stringify(p));
		if (st.type === "custom") q.pts = (p.pts || DEFP.custom.pts).map(function (v) { return v * p.vmax; });
		well = T.well(st.type, q, cc());
		var phone = window.innerWidth < 700, N = st.type === "morse" ? (phone ? 1400 : 2400) : (phone ? 700 : 1200);
		sol = T.solveWell(well, N, st.type === "morse" ? 26 : 14);
		re = new Float64Array(sol.N); im = new Float64Array(sol.N);
		st.sel = (st.sel || []).filter(function (n) { return n < sol.E.length; });
		mix();
	}
	function mix() {
		var sel = st.sel.slice().sort(function (a, b) { return a - b; });
		if (st.coh > 0 && st.type === "ho") {
			var a = st.coh, w = sel.map(function (n) { var f = 1; for (var k = 2; k <= n; k++) f *= k; return Math.pow(a, n) / Math.sqrt(f); }), s = Math.sqrt(w.reduce(function (x, y) { return x + y * y; }, 0));
			amps = sel.map(function (n, i) { return { n: n, a: w[i] / s }; });
		} else amps = sel.map(function (n) { return { n: n, a: 1 / Math.sqrt(sel.length) }; });
		/* density scale: the biggest |Psi|^2 over a few moments */
		scaleP = 1e-9; var Tb = period() || 1;
		for (var k = 0; k < 9; k++) { T.superpose(sol, amps, Tb * k / 9, re, im); for (var i = 0; i < sol.N; i++) scaleP = Math.max(scaleP, re[i] * re[i] + im[i] * im[i]); }
		trail = [];
	}
	function period() {
		if (amps.length < 2) return amps.length ? T.H / Math.max(1e-12, Math.abs(sol.E[amps[0].n])) : 0;
		var g = Infinity; for (var i = 0; i < amps.length; i++) for (var j = i + 1; j < amps.length; j++) g = Math.min(g, Math.abs(sol.E[amps[j].n] - sol.E[amps[i].n]));
		/* for evenly spaced levels the whole pattern repeats after h / (smallest gap) */
		return T.H / g;
	}

	/* ---------- drawing ---------- */
	function size() {
		var stage = el.stage, w = stage.clientWidth || 600, wrap = el.wrap, fs = document.fullscreenElement === wrap;
		var h = Math.max(320, Math.min(620, w * 0.58)); if (w < 520) h = Math.max(520, w * 1.45);
		if (window.MESStage && MESStage.sh) h = MESStage.sh(stage, h);
		if (fs) { var o = 0; Array.prototype.forEach.call(wrap.children, function (c) { if (c !== stage) o += c.offsetHeight; }); h = Math.max(240, window.innerHeight - o); }
		stage.style.height = Math.round(h) + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (el.cv.width !== Math.round(w * dpr) || el.cv.height !== Math.round(h * dpr)) { el.cv.width = Math.round(w * dpr); el.cv.height = Math.round(h * dpr); }
		return { w: w, h: h, dpr: dpr };
	}
	function topE() {
		var E = sol.E, top = well.top;
		if (st.type === "inf") top = E.length ? E[Math.min(5, E.length - 1)] * 1.12 : top;
		if (st.type === "custom") top = Math.max(top, E.length > 3 ? E[3] * 1.08 : top);
		if (st.type === "lin" || st.type === "ho") top = Math.min(top, E.length ? E[E.length - 1] * 1.04 : top);
		return top;
	}
	function draw() {
		if (!sol) return;
		var S = size(), ctx = el.cv.getContext("2d"), W = S.w, H = S.h, phone = W < 520;
		ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var padL = phone ? 40 : 52, padR = phone ? 64 : 104, padT = 34, strip = amps.length ? Math.round(H * (phone ? 0.27 : 0.25)) : 0, padB = 26 + strip + (phone ? 96 : 0);
		var x0 = well.x0, x1 = well.x1, top = topE(), vmin = 0;
		for (var i = 0; i < sol.N; i += 4) vmin = Math.min(vmin, sol.V[i]);
		var emin = vmin - 0.06 * (top - vmin);
		var X = function (x) { return padL + (x - x0) / (x1 - x0) * (W - padL - padR); };
		var XI = function (px) { return x0 + (px - padL) / (W - padL - padR) * (x1 - x0); };
		var Y = function (e) { return padT + (top - e) / (top - emin) * (H - padT - padB); };
		var YI = function (py) { return top - (py - padT) / (H - padT - padB) * (top - emin); };
		lay = { X: X, XI: XI, Y: Y, YI: YI, W: W, H: H, padT: padT, padB: padB, padL: padL, padR: padR };
		/* grid + axis */
		ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#9aa6c0"; ctx.strokeStyle = "rgba(148,163,184,0.1)"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
		var es = nice((top - emin) / 6);
		for (var e = Math.ceil(emin / es) * es; e <= top; e += es) { var y = Y(e); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(+e.toFixed(4) + "", padL - 5, y); }
		ctx.save(); ctx.translate(11, (padT + H - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("energy (eV)", 0, 0); ctx.restore();
		var xs = nice((x1 - x0) / (phone ? 4 : 7)), unit = (x1 - x0) < 0.9 ? 1e-3 : 1, un = unit === 1 ? "nm" : "pm";
		xs = nice((x1 - x0) / unit / (phone ? 4 : 7)) * unit;
		ctx.textAlign = "center"; ctx.textBaseline = "top";
		var yb = H - padB;
		for (var xx = Math.ceil(x0 / xs) * xs; xx <= x1 + 1e-12; xx += xs) ctx.fillText(+(xx / unit).toFixed(3) + "", X(xx), yb + 4);
		ctx.textAlign = "right"; ctx.fillText(un, W - padR, yb + 15);
		/* potential */
		var clipV = function (v) { return Math.min(v, top + (top - emin)); };
		var stepI = Math.max(1, Math.floor(sol.N / (W * 1.5)));
		/* shade under the potential curve */
		ctx.beginPath(); ctx.moveTo(X(x0), yb);
		for (i = 0; i < sol.N; i += stepI) ctx.lineTo(X(sol.x[i]), Math.max(padT, Y(clipV(sol.V[i]))));
		ctx.lineTo(X(x1), yb); ctx.closePath();
		var gr = ctx.createLinearGradient(0, padT, 0, yb); gr.addColorStop(0, "rgba(95,111,147,0.5)"); gr.addColorStop(1, "rgba(95,111,147,0.12)"); ctx.fillStyle = gr; ctx.fill();
		if (st.type === "inf" || st.type === "lin" || st.type === "custom") { ctx.fillStyle = "rgba(95,111,147,0.55)"; ctx.fillRect(X(x0) - 6, padT, 6, yb - padT); if (st.type !== "lin") ctx.fillRect(X(x1), padT, 6, yb - padT); }
		var py;
		ctx.strokeStyle = "#8ea0c8"; ctx.lineWidth = 2; ctx.save(); ctx.beginPath(); ctx.rect(padL - 8, padT, W - padL - padR + 16, yb - padT); ctx.clip();
		ctx.beginPath(); for (i = 0; i < sol.N; i += stepI) { py = Y(clipV(sol.V[i])); if (i) ctx.lineTo(X(sol.x[i]), py); else ctx.moveTo(X(sol.x[i]), py); } ctx.stroke();
		/* levels */
		var E = sol.E, show = st.show, sel = st.sel;
		for (var n = 0; n < E.length; n++) {
			if (E[n] > top) break;
			var yE = Y(E[n]), c = COL[n % COL.length], picked = sel.indexOf(n) >= 0;
			/* room for the wave: the gap to the nearest clearly different level (a near-degenerate pair, as in the double well, shares its room) */
			var tiny = 0.03 * (top - emin), gup = Infinity, gdn = Infinity, q2;
			for (q2 = n + 1; q2 < E.length; q2++) if (E[q2] - E[n] > tiny) { gup = E[q2] - E[n]; break; }
			for (q2 = n - 1; q2 >= 0; q2--) if (E[n] - E[q2] > tiny) { gdn = E[n] - E[q2]; break; }
			var gap = Math.min(gup, gdn); if (!isFinite(gap)) gap = (top - emin) * 0.3;
			/* classically allowed range */
			var ia = -1, ib = -1; for (i = 0; i < sol.N; i++) if (sol.V[i] <= E[n]) { if (ia < 0) ia = i; ib = i; }
			if (ia < 0) { ia = 0; ib = sol.N - 1; }
			ctx.strokeStyle = c; ctx.globalAlpha = picked ? 1 : sel.length ? 0.45 : 0.8; ctx.lineWidth = picked ? 2.4 : 1.2;
			ctx.setLineDash(picked ? [] : [5, 4]); ctx.beginPath(); ctx.moveTo(X(sol.x[ia]), yE); ctx.lineTo(X(sol.x[ib]), yE); ctx.stroke(); ctx.setLineDash([]);
			if (show !== "none") {
				var v = sol.psi[n], mx = 0; for (i = 0; i < sol.N; i++) mx = Math.max(mx, show === "prob" ? v[i] * v[i] : Math.abs(v[i]));
				var A = Math.min(0.46 * Math.abs(Y(E[n]) - Y(E[n] + gap)), (H - padT - padB) * 0.18) / mx;
				ctx.beginPath();
				for (i = 0; i < sol.N; i += stepI) { var val = show === "prob" ? v[i] * v[i] : v[i]; var yy = yE - val * A; if (i) ctx.lineTo(X(sol.x[i]), yy); else ctx.moveTo(X(sol.x[i]), yy); }
				ctx.lineWidth = picked ? 2 : 1.3; ctx.stroke();
			}
			ctx.globalAlpha = 1;
		}
		ctx.restore();
		/* level labels on the right */
		ctx.font = (phone ? "10px" : "11px") + " system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; var lastY = 1e9;
		for (n = 0; n < E.length; n++) { if (E[n] > top) break; yE = Y(E[n]); if (lastY - yE < 11) continue; lastY = yE; ctx.fillStyle = COL[n % COL.length]; ctx.globalAlpha = sel.indexOf(n) >= 0 || !sel.length ? 1 : 0.6; ctx.fillText((phone ? (n + n0()) : lname(n)) + "  " + eV(E[n]).replace(" eV", phone ? "" : " eV"), W - padR + 6, yE); }
		ctx.globalAlpha = 1;
		/* custom handles */
		if (st.type === "custom") handles().forEach(function (h, k) { ctx.beginPath(); ctx.arc(h[0], h[1], 7, 0, 7); ctx.fillStyle = drag && drag.k === k ? "#fff" : "#c7d2fe"; ctx.fill(); ctx.strokeStyle = "#5b3fd6"; ctx.lineWidth = 2; ctx.stroke(); });
		/* superposition strip */
		if (amps.length) {
			var sy0 = H - strip - (phone ? 92 : 6), sh = strip - 12, base = sy0 + sh;
			ctx.fillStyle = "#0c1020"; ctx.fillRect(padL, sy0 - 4, W - padL - padR, sh + 8);
			ctx.fillStyle = "#9aa6c0"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("|Ψ(x,t)|² of the picked levels", padL + 6, sy0);
			T.superpose(sol, amps, t, re, im);
			var cols = Math.round(W - padL - padR), sxm = 0, sn = 0;
			for (i = 0; i < sol.N; i++) { var pp = re[i] * re[i] + im[i] * im[i]; sxm += pp * sol.x[i]; sn += pp; }
			var xm = sxm / sn;
			for (var cI = 0; cI < cols; cI++) {
				var xq = XI(padL + cI), j = Math.max(0, Math.min(sol.N - 1, Math.round((xq - sol.x[0]) / sol.dx))), d = (re[j] * re[j] + im[j] * im[j]) / scaleP * (sh - 14);
				if (d < 0.3) continue; var rgb = Q.phaseRGB(Math.atan2(im[j], re[j]), 1);
				ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")"; ctx.fillRect(padL + cI, base - d, 1.2, d);
			}
			ctx.strokeStyle = "rgba(148,163,184,0.4)"; ctx.beginPath(); ctx.moveTo(padL, base + 0.5); ctx.lineTo(W - padR, base + 0.5); ctx.stroke();
			/* <x> line through both panels + trail */
			var px = X(xm); trail.push(px); if (trail.length > 60) trail.shift();
			ctx.strokeStyle = "rgba(250,204,21,0.9)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, base); ctx.stroke(); ctx.setLineDash([]);
			for (var q = 0; q < trail.length; q++) { ctx.fillStyle = "rgba(250,204,21," + (0.05 + 0.6 * q / trail.length).toFixed(2) + ")"; ctx.fillRect(trail[q] - 1.5, base + 3, 3, 3); }
			ctx.fillStyle = "#facc15"; ctx.textAlign = px > W - padR - 70 ? "right" : "left"; ctx.textBaseline = "top"; ctx.fillText("⟨x⟩", px + (px > W - padR - 70 ? -4 : 4), padT + 2);
			el.r6.textContent = Math.abs(xm) < 1e-5 * (x1 - x0) ? "0 nm" : nm(xm);
		}
		if (!amps.length) { ctx.fillStyle = "#9aa6c0"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(phone ? "Tap a level to pick it" : "Click a level to pick it; pick two or more to see them move", (padL + W - padR) / 2, Math.min(H - 6, yb + 34)); }
	}
	function nice(r) { var p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
	function handles() {
		if (!lay || st.type !== "custom") return [];
		var p = P(), pts = p.pts, n = pts.length;
		return pts.map(function (v, k) { return [lay.X(well.x0 + (well.x1 - well.x0) * k / (n - 1)), lay.Y(v * p.vmax)]; });
	}

	/* ---------- readouts, table, note ---------- */
	function readouts() {
		var E = sol.E;
		el.r1.textContent = E.length ? eV(E[0]) : "none";
		el.r2.textContent = E.length > 1 ? eV(E[1] - E[0]) : "–";
		el.l3.textContent = well.bound < Infinity ? "Bound states" : "Levels shown";
		el.r3.textContent = well.bound < Infinity ? String(E.length) : "∞ (" + E.filter(function (e) { return e <= topE(); }).length + " shown)";
		el.r4.textContent = st.sel.length ? (st.type === "morse" ? "v = " : "n = ") + st.sel.slice().sort(function (a, b) { return a - b; }).map(function (n) { return n + n0(); }).join(", ") + (st.coh > 0 && st.type === "ho" ? " (coherent mix)" : "") : "none";
		el.r5.textContent = amps.length ? eV(amps.reduce(function (s, a) { return s + a.a * a.a * E[a.n]; }, 0)) : "–";
		if (!amps.length) el.r6.textContent = "–";
		el.l7.textContent = st.type === "dw" && amps.length === 2 && amps[0].n === 0 && amps[1].n === 1 ? "Tunnelling period h/ΔE" : amps.length > 1 ? "Repeats every h/ΔE" : "Phase turns every h/E";
		el.r7.textContent = amps.length ? Q.si(period() * 1e-15, "s") : "–";
		el.r8.textContent = Q.si(t * 1e-15, "s");
	}
	function table() {
		var E = sol.E, tb = el.table.tBodies[0], h = "", unitE = st.type === "ho" ? P().w : E[0];
		el.th4.textContent = st.type === "ho" ? "E / ħω" : "E / E₁";
		for (var n = 0; n < E.length; n++) {
			var on = st.sel.indexOf(n) >= 0;
			h += '<tr><td><input type="checkbox" data-n="' + n + '"' + (on ? " checked" : "") + ' aria-label="Pick level ' + (n + n0()) + '"></td><td style="color:' + "inherit" + '"><span style="display:inline-block;width:0.7em;height:0.7em;border-radius:50%;margin-right:0.4em;background:' + COL[n % COL.length] + '"></span>' + lname(n) + "</td><td>" + eV(E[n]) + "</td><td>" + Q.fmt(E[n] / unitE, 4) + "</td><td>" + (n + 1 < E.length ? eV(E[n + 1] - E[n]) : (well.bound < Infinity ? "top of the well: " + eV(well.bound) : "–")) + "</td></tr>";
		}
		tb.innerHTML = h;
	}
	function note() {
		var m = mass(), E = sol.E, p = P(), txt = (st.mass === "custom" ? "Mass " + Q.fmt(m, 3) + " mₑ" : NAMES[st.mass]) + ". ";
		if (st.type === "inf") txt += "Exact: E₁ = π²ħ²/(2mL²) = " + eV(Math.PI * Math.PI * cc() / (p.L * p.L)) + "; the levels go 1, 4, 9, 16 … times that.";
		else if (st.type === "fin") txt += "A well this size holds " + T.finCount(p.a, p.V, cc()) + " bound state" + (T.finCount(p.a, p.V, cc()) > 1 ? "s" : "") + " (formula: the integer above a·√(2mV₀)/(πħ)). Look at the walls: every wave leaks into them.";
		else if (st.type === "ho") txt += "Exact: E = (n + ½) ħω with ħω = " + eV(p.w) + ". The ground state keeps ½ħω: the zero-point energy.";
		else if (st.type === "dw" && E.length > 1) txt += "The two lowest levels are split by only ΔE = " + eV(E[1] - E[0]) + ". Picked together, the particle starts in the left well and is in the right one after half of h/ΔE = " + Q.si(T.H / (E[1] - E[0]) * 1e-15 / 2, "s") + ". Raise the middle barrier and watch the splitting (and the tunnelling) shrink exponentially.";
		else if (st.type === "morse") txt += "Morse curve V = D(1 − e^(−a(x − rₑ)))². The level gaps shrink as the bond stretches, and the levels stop at D: above it the molecule falls apart.";
		else if (st.type === "lin") txt += "Exact: Eₙ = (ħ²F²/2m)^⅓ × the zeros of the Airy function (2.338, 4.088, 5.521 …) = " + E.slice(0, 3).map(function (e) { return Q.fmt(e, 3); }).join(", ") + " eV. Neutrons bouncing on a mirror in Earth’s gravity show these levels (in pico-electronvolts).";
		else if (st.type === "custom") txt += "Drag the round handles to draw any well; the levels follow. Hard walls at both ends.";
		txt += " Grid: " + sol.N + " points.";
		el.note.textContent = txt;
		el.badge.textContent = (st.mass === "custom" ? Q.fmt(m, 3) + " mₑ" : NAMES[st.mass]) + " · x in " + ((well.x1 - well.x0) < 0.9 ? "pm" : "nm") + " · E in eV";
	}

	/* ---------- params UI ---------- */
	function paramsUI() {
		var p = P(), h = "";
		PARAMS[st.type].forEach(function (d) {
			h += '<div class="tu-field"><label class="tu-label" for="qm-bx-p-' + d[0] + '">' + d[1] + ' <span class="qm-val" id="qm-bx-pv-' + d[0] + '"></span></label><input type="range" id="qm-bx-p-' + d[0] + '" data-k="' + d[0] + '" min="0" max="1000" step="1"></div>';
		});
		el.params.innerHTML = h; syncParams();
	}
	function toSl(d, v) { return Math.round(1000 * (d[4] ? Math.log(v / d[2]) / Math.log(d[3] / d[2]) : (v - d[2]) / (d[3] - d[2]))); }
	function fromSl(d, s) { var f = s / 1000; return d[4] ? d[2] * Math.pow(d[3] / d[2], f) : d[2] + f * (d[3] - d[2]); }
	function fmtP(d, v) { return d[5] === "nm" ? nm(v) : d[5] === "eV" ? eV(v) : Q.fmt(v, 3) + " " + d[5]; }
	function syncParams() { var p = P(); PARAMS[st.type].forEach(function (d) { var s = $("qm-bx-p-" + d[0]); if (s) { s.value = toSl(d, p[d[0]]); $("qm-bx-pv-" + d[0]).textContent = fmtP(d, p[d[0]]); } }); }
	function syncInputs() {
		el.type.value = st.type; el.mass.value = st.mass; el.mcf.hidden = st.mass !== "custom"; el.mc.value = st.mc; el.show.value = st.show;
		el.sp.value = st.sp; el.spv.textContent = "×" + Q.fmt(spF(), 2);
		Array.prototype.forEach.call(el.presets.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === st.preset ? "true" : "false"); });
	}
	function refresh(keepT) { solve(); if (!keepT) t = 0; readouts(); table(); note(); draw(); clearTimeout(refresh.tm); refresh.tm = setTimeout(api.save, 250); }
	function toggle(n) {
		var i = st.sel.indexOf(n); if (i >= 0) st.sel.splice(i, 1); else st.sel.push(n);
		st.coh = 0; st.preset = null; mix(); t = 0; syncInputs(); readouts(); table(); draw(); api.save();
		if (st.sel.length >= 1 && !playing) setPlay(true);
	}
	function applyPreset(id) {
		var p = PRESETS[id]; st.type = p.type; st.mass = p.mass; st.sel = p.sel.slice(); st.coh = p.coh || 0; st.preset = id;
		st.p_ = st.p_ || {}; st.p_[p.type] = JSON.parse(JSON.stringify(DEFP[p.type]));
		syncInputs(); paramsUI(); refresh(); setPlay(true);
	}
	function linkUrl() {
		var u = new URL(location.href), p = P();
		Array.from(u.searchParams.keys()).forEach(function (k) { if (k.indexOf("bx_") === 0) u.searchParams.delete(k); });
		u.searchParams.set("tab", "box"); u.searchParams.set("bx_t", st.type); u.searchParams.set("bx_m", st.mass); if (st.mass === "custom") u.searchParams.set("bx_mc", st.mc);
		PARAMS[st.type].forEach(function (d) { u.searchParams.set("bx_" + d[0], +(+p[d[0]]).toPrecision(5)); });
		if (st.type === "custom") u.searchParams.set("bx_pts", p.pts.map(function (v) { return +v.toFixed(3); }).join("_"));
		if (st.sel.length) u.searchParams.set("bx_sel", st.sel.join("_")); if (st.coh) u.searchParams.set("bx_coh", st.coh);
		return u.toString();
	}
	function readQuery(q) {
		var tp = q.get("bx_t"); if (!tp || !PARAMS[tp]) return;
		st.type = tp; var m = q.get("bx_m"); if (MASS[m] || m === "custom") st.mass = m;
		var mc = parseFloat(q.get("bx_mc")); if (isFinite(mc)) st.mc = Q.clamp(mc, 0.01, 1e5);
		var p = P(); PARAMS[tp].forEach(function (d) { var v = parseFloat(q.get("bx_" + d[0])); if (isFinite(v)) p[d[0]] = Q.clamp(v, d[2], d[3]); });
		if (tp === "custom" && q.get("bx_pts")) { var pts = q.get("bx_pts").split("_").map(Number).filter(isFinite).map(function (v) { return Q.clamp(v, 0, 1.2); }); if (pts.length >= 3 && pts.length <= 20) p.pts = pts; }
		st.sel = (q.get("bx_sel") || "").split("_").map(Number).filter(function (n) { return isFinite(n) && n >= 0 && n < 30; });
		st.coh = Q.clamp(parseFloat(q.get("bx_coh")) || 0, 0, 3); st.preset = null;
	}

	/* ---------- animation ---------- */
	function setPlay(on) { playing = !!on; el.play.textContent = playing ? "Pause" : "Play"; el.play.setAttribute("aria-pressed", playing ? "true" : "false"); lastTs = 0; if (playing && visible && !raf) raf = requestAnimationFrame(frame); }
	function frame(ts) {
		raf = 0; if (!playing || !visible) return;
		var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
		var Pd = period(); if (Pd) t += dt * Pd / (amps.length > 1 ? 5 : 3) * spF();
		draw(); el.r8.textContent = Q.si(t * 1e-15, "s");
		raf = requestAnimationFrame(frame);
	}

	/* ---------- pointer ---------- */
	function pos(e) { var r = el.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function hitHandle(p) { var hs = handles(), b = -1, bd = 20; hs.forEach(function (h, k) { var d = Math.hypot(h[0] - p.x, h[1] - p.y); if (d < bd) { bd = d; b = k; } }); return b; }
	function hitLevel(p) {
		if (!lay) return -1; var b = -1, bd = 10, top = topE();
		sol.E.forEach(function (E, n) { if (E > top) return; var d = Math.abs(lay.Y(E) - p.y); if (d < bd) { bd = d; b = n; } });
		return b;
	}
	function down(e) {
		var p = pos(e), k = hitHandle(p);
		if (k >= 0) { drag = { k: k, id: e.pointerId }; el.cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
		var n = hitLevel(p); if (n >= 0) toggle(n);
	}
	function move(e) {
		var p = pos(e);
		if (!drag) { el.cv.style.cursor = hitHandle(p) >= 0 ? "grab" : hitLevel(p) >= 0 ? "pointer" : "default"; return; }
		var pr = P(); pr.pts[drag.k] = Q.clamp(+(lay.YI(p.y) / pr.vmax).toFixed(3), 0, 1.2); st.preset = null; refresh(true);
	}
	function up(e) { if (drag && e.pointerId === drag.id) { drag = null; api.save(); draw(); } }

	Q.reg("box", {
		init: function (panel, a) {
			api = a; st = api.st;
			if (!st.type || !PARAMS[st.type]) st.type = "dw";
			if (!st.mass) st.mass = "electron"; if (!st.mc) st.mc = 1; if (!st.show) st.show = "psi"; if (st.sp == null) st.sp = 50; if (!st.sel) st.sel = [0, 1]; if (st.coh == null) st.coh = 0;
			if (st.preset === undefined) st.preset = "dw";
			readQuery(api.query);
			["wrap", "stage", "cv", "badge", "play", "clear", "show", "fs", "type", "mass", "mcf", "mc", "params", "sp", "spv", "link", "note", "table", "th4", "presets",
				"r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "l3", "l7"].forEach(function (k) { el[k] = $("qm-bx-" + k); });
			el.presets.addEventListener("click", function (e) { var b = e.target.closest("button[data-p]"); if (b) applyPreset(b.dataset.p); });
			el.play.addEventListener("click", function () { setPlay(!playing); });
			el.clear.addEventListener("click", function () { st.sel = []; st.coh = 0; st.preset = null; mix(); t = 0; syncInputs(); readouts(); table(); draw(); api.save(); });
			el.show.addEventListener("change", function () { st.show = el.show.value; api.save(); draw(); });
			el.fs.addEventListener("click", function () { if (document.fullscreenElement === el.wrap) document.exitFullscreen(); else if (el.wrap.requestFullscreen) el.wrap.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); });
			el.type.addEventListener("change", function () { st.type = el.type.value; st.preset = null; st.coh = 0; st.sel = [0, 1]; syncInputs(); paramsUI(); refresh(); });
			el.mass.addEventListener("change", function () { st.mass = el.mass.value; st.preset = null; syncInputs(); refresh(); });
			el.mc.addEventListener("change", function () { st.mc = Q.clamp(+el.mc.value || 1, 0.01, 1e5); syncInputs(); refresh(); });
			el.params.addEventListener("input", function (e) { var k = e.target.dataset.k; if (!k) return; var d = PARAMS[st.type].filter(function (x) { return x[0] === k; })[0]; P()[k] = +fromSl(d, +e.target.value).toPrecision(5); st.preset = null; syncParams(); syncInputs(); refresh(true); });
			el.sp.addEventListener("input", function () { st.sp = +el.sp.value; syncInputs(); api.save(); });
			el.link.addEventListener("click", function () { api.copy(linkUrl(), "Link copied"); });
			el.table.addEventListener("change", function (e) { var n = e.target.dataset && e.target.dataset.n; if (n != null) toggle(+n); });
			el.cv.addEventListener("pointerdown", down); el.cv.addEventListener("pointermove", move); el.cv.addEventListener("pointerup", up); el.cv.addEventListener("pointercancel", up);
			el.cv.addEventListener("touchstart", function (e) { var tt = e.touches[0]; if (tt && st.type === "custom") { var r = el.cv.getBoundingClientRect(); if (hitHandle({ x: tt.clientX - r.left, y: tt.clientY - r.top }) >= 0) e.preventDefault(); } }, { passive: false });
			el.cv.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); setPlay(!playing); } else if (/^[0-9]$/.test(e.key)) { var n = (+e.key + 9) % 10; if (n < sol.E.length) toggle(n); } });
			if (window.ResizeObserver) new ResizeObserver(function () { if (visible) draw(); }).observe(el.stage);
			window.addEventListener("resize", function () { if (visible) draw(); });
			document.addEventListener("fullscreenchange", function () { if (visible) setTimeout(draw, 60); });
			syncInputs(); paramsUI(); solve(); readouts(); table(); note();
			window.MESQuantumDebug_box = { get sol() { return sol; }, st: st, preset: applyPreset, toggle: toggle, handles: handles, lay: function () { return lay; }, setT: function (x) { t = x; draw(); readouts(); }, period: period, draw: draw };
		},
		show: function () { visible = true; draw(); readouts(); if (playing && !raf) raf = requestAnimationFrame(frame); },
		hide: function () { visible = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
	});
})();

/* MES Quantum Lab: Double slit tab (wave picture from MESQ.slit.Sim + single arrivals on a far screen from the exact Fraunhofer pattern) */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var S = Q.slit;
	var BOX = 256, LAM0 = 8, K0 = 2 * Math.PI / LAM0, WALLX = 96, WALLW = 4, X0 = 50, SX = 16, SY = 46, TMAX = 330;

	Q.reg("slit", {
		init: function (panel, api) {
			var $ = function (id) { return document.getElementById(id); };
			var st = api.st, q = api.query;
			var phone = Math.min(screen.width, window.innerWidth) < 700 || (window.matchMedia && matchMedia("(pointer:coarse)").matches);
			/* ---------- settings ---------- */
			var D0 = { p: "electron", E: S.PARTICLES.electron.E, n: 2, a: S.PARTICLES.electron.a, d: S.PARTICLES.electron.d, L: 1, rate: 30, view: "wide",
				wp: false, D: 1, col: "phase", spd: 2, res: phone ? 128 : 256, bohm: false, who: "slits", curve: true };
			Object.keys(D0).forEach(function (k) { if (st[k] == null) st[k] = D0[k]; });
			function qn(k) { var v = q.get(k); return v == null || v === "" ? null : Number(v); }
			if (q.get("ds_p") && S.PARTICLES[q.get("ds_p")]) st.p = q.get("ds_p");
			[["ds_E", "E"], ["ds_n", "n"], ["ds_a", "a"], ["ds_d", "d"], ["ds_L", "L"], ["ds_r", "rate"], ["ds_D", "D"]].forEach(function (m) { var v = qn(m[0]); if (v != null && isFinite(v) && v > 0 || (m[1] === "D" && v === 0)) st[m[1]] = v; });
			if (q.get("ds_wp")) st.wp = q.get("ds_wp") === "1";
			st.n = Q.clamp(Math.round(st.n), 1, 8);

			var wrap = $("qm-ds-wrap"), stage = $("qm-ds-stage"), cv = $("qm-ds-cv"), ctx = cv.getContext("2d"), hit = $("qm-ds-hit"), badge = $("qm-ds-badge");
			var running = true, raf = 0, shown = false, sim = null, sim1 = null, dirty = true, geomT = 0;
			var img = null, imgCv = document.createElement("canvas"), imgCtx = imgCv.getContext("2d");
			var pic = null; /* picture geometry */
			var tracers = null, trails = [], maxR = 1e-12, maxL = 1e-12;
			/* screen */
			var T = null, hist = null, bins = 120, count = 0, arrY = new Float32Array(60000), arrU = new Float32Array(60000), arrN = 0, flashes = [];
			var dotsCv = document.createElement("canvas"), dotsCtx = dotsCv.getContext("2d"), dotsKey = "";
			var rng = Q.rng(Date.now() & 0xffffff), acc = 0, lastT = 0, L = {};
			var audio = null;

			/* ---------- derived physics ---------- */
			function phys() {
				var P = S.PARTICLES[st.p], db = S.debroglie(st.p, st.E), n = st.n;
				var a = st.a, d = Math.max(st.d, a * 1.05);
				var V = st.wp && n === 2 ? S.visibility(st.D) : 1;
				return { P: P, db: db, lam: db.lambda, a: a, d: d, n: n, V: V, L: st.L };
			}
			function thMax(ph) {
				var s;
				if (st.view === "zoom") s = (ph.n > 1 ? 3.2 * ph.lam / ph.d : 0.8 * ph.lam / ph.a);
				else if (st.view === "mid") s = 1.15 * ph.lam / ph.a;
				else s = 2.6 * ph.lam / ph.a;
				return Math.asin(Math.min(0.985, s));
			}
			function rebuildScreen() {
				var ph = phys(), tm = thMax(ph);
				T = S.cdf({ a: ph.a, d: ph.d, n: ph.n, lambda: ph.lam, V: ph.V }, tm, 6000);
				var fringes = ph.n > 1 ? 2 * Math.sin(tm) * ph.d / ph.lam : 4;
				bins = Math.round(Q.clamp(fringes * 7, 60, 360));
				hist = new Float64Array(bins); count = 0; arrN = 0; flashes = []; dotsKey = "";
				$("qm-ds-r-n").textContent = "0";
			}
			/* picture: same shape (a : d, number of slits), wavelength enlarged when needed */
			function rebuildPicture() {
				var ph = phys(), n = ph.n, Ra = ph.a / ph.lam, Rd = ph.d / ph.lam;
				var dmax = n > 1 ? Math.min(60, 150 / (n - 1)) : 1e9, amax = n > 1 ? 40 : 44;
				var f = Math.min(1, n > 1 ? dmax / (Rd * LAM0) : 1, amax / (Ra * LAM0));
				var aU = Ra * LAM0 * f, dU = Rd * LAM0 * f, widened = false;
				if (aU < 3) { aU = 3; widened = true; }
				if (n > 1 && dU < aU + 3) dU = aU + 3;
				var cs = S.centres(n, dU, BOX / 2);
				pic = { f: f, aU: aU, dU: dU, cs: cs, widened: widened };
				var who = st.wp && n === 2 ? st.D : 0;
				var base = { n: st.res, L: BOX, dt: 0.6, k0: K0, wallX: WALLX, wallW: WALLW, V0: 3, x0: X0, y0: BOX / 2, sx: SX, sy: SY, absorb: 18, eta: 1.2 };
				var sl = cs.map(function (c) { return [c - aU / 2, c + aU / 2]; });
				sim = who < 1 ? new S.Sim(Object.assign({}, base, { slits: sl })) : null;
				sim1 = who > 0 ? new S.Sim(Object.assign({}, base, { slits: [sl[0]] })) : null;
				img = imgCtx.createImageData(st.res, st.res); imgCv.width = imgCv.height = st.res;
				maxR = maxL = 1e-12; newTracers();
				var txt = [];
				if (f < 0.999) txt.push("Wave picture: λ drawn " + (1 / f >= 100 ? Q.fmt(1 / f, 2) : Number((1 / f).toPrecision(2))) + "× larger than real");
				if (widened) txt.push("slits drawn wider than real so they show");
				if (st.wp && n === 2) txt.push(st.D >= 1 ? "which-path detector on: brightness only" : "partly marked paths");
				badge.textContent = txt.join(" · ");
				dirty = true;
			}
			function newTracers() {
				trails = []; tracers = null;
				var s = sim; if (!st.bohm || !s) return;
				var cnt = phone ? 140 : 260, o = { x0: X0, y0: BOX / 2, sx: SX, sy: SY };
				tracers = S.tracers(o, cnt * (st.who === "slits" ? 12 : 1), (Math.random() * 1e9) | 0);
				if (st.who === "slits") {
					var keepX = [], keepY = [];
					for (var i = 0; i < tracers.x.length && keepX.length < cnt; i++) {
						var y = tracers.y[i], ok = false;
						for (var j = 0; j < pic.cs.length; j++) if (Math.abs(y - pic.cs[j]) < pic.aU / 2 * 0.95) ok = true;
						if (ok) { keepX.push(tracers.x[i]); keepY.push(tracers.y[i]); }
					}
					tracers = { x: Float64Array.from(keepX), y: Float64Array.from(keepY), alive: new Uint8Array(keepX.length).fill(1) };
				}
				tracers.rmin = 1e-6 / (2 * Math.PI * SX * SY);
				for (var k = 0; k < tracers.x.length; k++) trails.push([tracers.x[k], tracers.y[k]]);
			}
			function restartWave() { if (sim) sim.packet(sim.o); if (sim1) sim1.packet(sim1.o); maxR = maxL = 1e-12; newTracers(); dirty = true; }

			/* ---------- UI binding ---------- */
			function logE(P, v) { return P.Emin * Math.pow(P.Emax / P.Emin, v / 1000); }
			function eSlider(P, E) { return Math.round(1000 * Math.log(E / P.Emin) / Math.log(P.Emax / P.Emin)); }
			function fmtE(E) { return E >= 1e3 ? Q.si(E, "eV") : E >= 0.01 ? Number(E.toPrecision(3)) + " eV" : Q.si(E, "eV"); }
			function syncInputs() {
				var P = S.PARTICLES[st.p];
				st.E = Q.clamp(st.E, P.Emin, P.Emax);
				$("qm-ds-part").value = st.p; $("qm-ds-E").value = eSlider(P, st.E);
				$("qm-ds-n").value = st.n; $("qm-ds-a").value = Math.log10(st.a) * 10; $("qm-ds-d").value = Math.log10(st.d) * 10;
				$("qm-ds-L").value = Math.log10(st.L); $("qm-ds-rate").value = Math.log10(st.rate); $("qm-ds-view").value = st.view;
				$("qm-ds-wp").checked = st.wp; $("qm-ds-D").value = st.D; $("qm-ds-col").value = st.col; $("qm-ds-spd").value = String(st.spd);
				$("qm-ds-res").value = String(st.res); $("qm-ds-who").value = st.who; $("qm-ds-curve").checked = st.curve;
				$("qm-ds-bohm").setAttribute("aria-pressed", st.bohm ? "true" : "false");
				labels();
			}
			function labels() {
				var ph = phys(), g = S.geometry({ a: ph.a, d: ph.d, lambda: ph.lam }, ph.L);
				$("qm-ds-Ev").textContent = fmtE(st.E) + (ph.P.m ? "" : " (" + Q.si(ph.lam, "m") + ")");
				$("qm-ds-nv").textContent = st.n; $("qm-ds-av").textContent = Q.si(ph.a, "m"); $("qm-ds-dv").textContent = Q.si(ph.d, "m") + (st.d < ph.d ? " (min)" : "");
				$("qm-ds-Lv").textContent = Q.si(st.L, "m"); $("qm-ds-ratev").textContent = st.rate >= 100 ? Math.round(st.rate).toLocaleString("en-US") : Number(st.rate.toPrecision(2));
				$("qm-ds-Dv").textContent = st.D.toFixed(2);
				$("qm-ds-d").disabled = st.n < 2; $("qm-ds-wp").disabled = st.n !== 2; $("qm-ds-D").disabled = st.n !== 2 || !st.wp;
				$("qm-ds-r-lam").textContent = Q.si(ph.lam, "m");
				$("qm-ds-r-v").textContent = ph.P.m ? (ph.db.v > 0.01 * Q.C.c ? Q.si(ph.db.v, "m/s") + " (" + (ph.db.v / Q.C.c).toFixed(2) + " c)" : Q.si(ph.db.v, "m/s")) : "c (light)";
				$("qm-ds-r-fr").textContent = st.n > 1 ? Q.si(g.fringe, "m") : "– (one slit)";
				$("qm-ds-r-env").textContent = ph.a > ph.lam ? Q.si(g.envelope, "m") : "fills the screen (a < λ)";
				$("qm-ds-r-per").textContent = st.n > 1 ? Number((2 * ph.d / ph.a).toPrecision(3)) : "–";
				$("qm-ds-r-vis").textContent = st.n > 1 ? Math.round(ph.V * 100) + "%" : "–";
				var notes = [ph.P.note];
				if (st.n > 1 && ph.d < ph.lam) notes.push("The slits are closer than one wavelength: no stripes can form.");
				if (ph.a < ph.lam) notes.push("The slit is narrower than the wavelength, so even one slit spreads the wave over the whole screen.");
				if (Math.asin(Math.min(1, 2.6 * ph.lam / ph.a)) > 0.3) notes.push("Wide angles: the far-field formula is a good guide, but a real screen this close would also show near-field effects.");
				$("qm-ds-note").textContent = notes.join(" ");
				$("qm-ds-wpnote").hidden = st.n !== 2;
			}
			var linkT = 0;
			function pushLink() {
				clearTimeout(linkT);
				linkT = setTimeout(function () {
					var P = S.PARTICLES[st.p];
					api.setQuery({ ds_p: st.p, ds_E: Number(st.E.toPrecision(4)), ds_n: st.n, ds_a: Number(st.a.toPrecision(3)), ds_d: st.n > 1 ? Number(st.d.toPrecision(3)) : null,
						ds_L: Number(st.L.toPrecision(3)), ds_r: Number(st.rate.toPrecision(3)), ds_wp: st.wp ? "1" : null, ds_D: st.wp ? st.D : null });
					void P;
				}, 400);
			}
			function changed(geom) {
				api.save(); labels(); rebuildScreen(); pushLink();
				if (geom) { clearTimeout(geomT); geomT = setTimeout(rebuildPicture, 120); }
				clearPresets(); dirty = true;
			}
			function clearPresets() { Array.prototype.forEach.call($("qm-ds-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", "false"); }); }
			$("qm-ds-part").addEventListener("change", function () {
				st.p = this.value; var P = S.PARTICLES[st.p]; st.E = P.E; st.a = P.a; st.d = P.d; st.L = P.L; syncInputs(); changed(true);
			});
			$("qm-ds-E").addEventListener("input", function () { st.E = logE(S.PARTICLES[st.p], +this.value); changed(true); });
			$("qm-ds-n").addEventListener("input", function () { st.n = +this.value; changed(true); });
			$("qm-ds-a").addEventListener("input", function () { st.a = Math.pow(10, this.value / 10); if (st.n > 1 && st.d < st.a * 1.05) { st.d = st.a * 1.05; $("qm-ds-d").value = Math.log10(st.d) * 10; } changed(true); });
			$("qm-ds-d").addEventListener("input", function () { st.d = Math.pow(10, this.value / 10); changed(true); });
			$("qm-ds-L").addEventListener("input", function () { st.L = Math.pow(10, +this.value); changed(false); });
			$("qm-ds-rate").addEventListener("input", function () { st.rate = Math.pow(10, +this.value); api.save(); labels(); pushLink(); });
			$("qm-ds-view").addEventListener("change", function () { st.view = this.value; changed(false); });
			$("qm-ds-wp").addEventListener("change", function () { st.wp = this.checked; changed(true); });
			$("qm-ds-D").addEventListener("input", function () { st.D = +this.value; changed(true); });
			$("qm-ds-col").addEventListener("change", function () { st.col = this.value; api.save(); dirty = true; });
			$("qm-ds-spd").addEventListener("change", function () { st.spd = +this.value; api.save(); });
			$("qm-ds-res").addEventListener("change", function () { st.res = +this.value; api.save(); rebuildPicture(); });
			$("qm-ds-who").addEventListener("change", function () { st.who = this.value; api.save(); newTracers(); dirty = true; });
			$("qm-ds-curve").addEventListener("change", function () { st.curve = this.checked; api.save(); dirty = true; });
			$("qm-ds-one").addEventListener("click", function () { arrive(1); dirty = true; });
			$("qm-ds-clear").addEventListener("click", function () { rebuildScreen(); dirty = true; });
			$("qm-ds-link").addEventListener("click", function () { pushLink(); setTimeout(function () { api.copy(location.href, "Link copied"); }, 450); });
			$("qm-ds-play").addEventListener("click", function () { running = !running; this.textContent = running ? "Pause" : "Play"; this.setAttribute("aria-pressed", running ? "true" : "false"); if (running) loop(); });
			$("qm-ds-again").addEventListener("click", restartWave);
			$("qm-ds-bohm").addEventListener("click", function () { st.bohm = !st.bohm; api.save(); this.setAttribute("aria-pressed", st.bohm ? "true" : "false"); newTracers(); if (st.bohm && !sim) api.toast("Paths need the undisturbed wave: switch the which-path detector off"); dirty = true; });
			$("qm-ds-fs").addEventListener("click", function () {
				if (document.fullscreenElement) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
			});
			document.addEventListener("fullscreenchange", function () { $("qm-ds-fs").textContent = document.fullscreenElement === wrap ? "Exit full screen" : "Full screen"; size(); });
			var sound = $("qm-ds-sound");
			/* presets */
			var PRE = {
				electron: { p: "electron", E: 5e4, n: 2, a: 0.3e-6, d: 1.5e-6, L: 1, rate: 300, wp: false, view: "wide" },
				oneatatime: { p: "electron", E: 5e4, n: 2, a: 0.3e-6, d: 1.5e-6, L: 1, rate: 3, wp: false, view: "mid" },
				neutron: { p: "neutron", E: 2.4e-4, n: 2, a: 22e-6, d: 125e-6, L: 5, rate: 200, wp: false, view: "mid" },
				c60: { p: "c60", E: 0.18, n: 5, a: 50e-9, d: 100e-9, L: 1.25, rate: 300, wp: false, view: "wide" },
				light: { p: "photon", E: 1.96, n: 2, a: 40e-6, d: 250e-6, L: 2, rate: 1000, wp: false, view: "mid" },
				single: { n: 1, rate: 500, wp: false, view: "wide" },
				grating: { n: 5, rate: 1000, wp: false, view: "wide" },
				which: { n: 2, wp: true, D: 1, rate: 500, view: "wide" },
				bohm: { n: 2, wp: false, bohm: true, who: "slits" }
			};
			$("qm-ds-pre").addEventListener("click", function (e) {
				var b = e.target.closest("button[data-p]"); if (!b) return; var p = PRE[b.dataset.p]; if (!p) return;
				Object.keys(p).forEach(function (k) { st[k] = p[k]; });
				if (b.dataset.p === "single" || b.dataset.p === "grating" || b.dataset.p === "which" || b.dataset.p === "bohm") { if (st.d < st.a * 1.5) st.d = st.a * 5; }
				syncInputs(); changed(true);
				b.setAttribute("aria-pressed", "true");
				if (!running) $("qm-ds-play").click();
			});

			/* ---------- arrivals ---------- */
			function arrive(k) {
				if (!T) return;
				var ph = phys(), Ymax = ph.L * Math.tan(T.thMax);
				for (var i = 0; i < k; i++) {
					var th = S.sample(T, rng()), y = ph.L * Math.tan(th), b = Math.floor((y + Ymax) / (2 * Ymax) * bins);
					if (b >= 0 && b < bins) hist[b]++;
					count++;
					var u = rng();
					if (arrN < arrY.length) { arrY[arrN] = y / Ymax; arrU[arrN] = u; arrN++; plotDot(y / Ymax, u); }
					if (k < 30 && st.rate < 60) flashes.push({ y: y / Ymax, u: u, t: performance.now() });
				}
				if (flashes.length > 40) flashes.splice(0, flashes.length - 40);
				$("qm-ds-r-n").textContent = count.toLocaleString("en-US");
				if (sound.checked && k > 0 && k < 6) click();
			}
			function click() {
				try {
					audio = audio || new (window.AudioContext || window.webkitAudioContext)();
					var o = audio.createOscillator(), g = audio.createGain(); o.type = "square"; o.frequency.value = 1800; g.gain.value = 0.04;
					o.connect(g); g.connect(audio.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.03); o.stop(audio.currentTime + 0.04);
				} catch (e) {}
			}
			function plotDot(yn, u) {
				if (!L.dw) return;
				var x = 2 + u * (L.dw - 4), y = L.top + (1 - (yn + 1) / 2) * L.sh;
				dotsCtx.fillRect(x * L.dpr - 0.8 * L.dpr, (y - L.top) * L.dpr - 0.8 * L.dpr, 1.7 * L.dpr, 1.7 * L.dpr);
			}
			function redrawDots() {
				dotsCv.width = Math.max(1, Math.round(L.dw * L.dpr)); dotsCv.height = Math.max(1, Math.round(L.sh * L.dpr));
				dotsCtx.clearRect(0, 0, dotsCv.width, dotsCv.height);
				dotsCtx.fillStyle = arrN > 8000 ? "rgba(250,204,21,0.45)" : "rgba(250,204,21,0.9)";
				for (var i = 0; i < arrN; i++) plotDot(arrY[i], arrU[i]);
				dotsKey = L.key;
			}

			/* ---------- layout + drawing ---------- */
			function size() {
				var W = stage.parentNode.clientWidth || 600, narrow = W <= 600, band = narrow ? 50 : 0;
				var nat = Math.round(narrow ? W * 0.62 + band : Q.clamp(W * 0.6, 220, 760)), H = nat;
				if (document.fullscreenElement === wrap) H = Math.max(240, window.innerHeight - wrap.querySelector(".qm-legend").offsetHeight - wrap.querySelector(".qm-readouts").offsetHeight);
				else if (window.MESStage) H = MESStage.sh(stage, nat);
				stage.style.height = H + "px"; stage.style.width = "100%";
				var dpr = Math.min(2, window.devicePixelRatio || 1);
				cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				var Sq = Math.min(H - band, W * 0.64), wx = 0, wy = (H - band - Sq) / 2, sx0 = Sq + Math.max(6, W * 0.015), sw = W - sx0 - 4;
				var top = narrow ? 8 : 46, sh = H - band - top - 18;
				L = { W: W, H: H, dpr: dpr, S: Sq, wx: wx, wy: wy, sx0: sx0, sw: sw, dw: sw * 0.5, top: top, sh: sh, narrow: narrow };
				L.key = [W, H, dpr].join("x");
				/* wall hit strip */
				var wpx = wx + (WALLX + WALLW / 2) / BOX * Sq;
				hit.style.left = (wpx - 14) + "px"; hit.style.top = wy + "px"; hit.style.width = "28px"; hit.style.height = Sq + "px";
				dotsKey = ""; dirty = true;
			}
			var ro = new ResizeObserver(function () { size(); if (!running) draw(); }); ro.observe(stage.parentNode);
			window.addEventListener("resize", function () { if (shown) size(); });

			function render() {
				var n = st.res, d = img.data, mixed = !!sim1, useHeat = st.col === "heat" || mixed, wallCol = Math.round((WALLX + WALLW) / BOX * n);
				var s0 = sim || sim1, re = s0.re, im = s0.im, ph = phys(), V = ph.V;
				var r1 = sim1 && sim1.re, i1 = sim1 && sim1.im, solid = s0.solid;
				/* densities: left and right of the wall, separate auto-brightness (right is dimmer) */
				var curL = 1e-14, curR = 1e-14, x, y, j, rho;
				var dens = render.buf && render.buf.length === n * n ? render.buf : (render.buf = new Float32Array(n * n));
				for (y = 0; y < n; y++) {
					var ym = (n - 1 - y) * n;
					for (x = 0; x < n; x++) {
						j = y * n + x;
						if (!mixed) rho = re[j] * re[j] + im[j] * im[j];
						else {
							var a1 = r1[j] * r1[j] + i1[j] * i1[j];
							if (x < wallCol) rho = sim ? re[j] * re[j] + im[j] * im[j] : a1;
							else { var jm = ym + x, a2 = r1[jm] * r1[jm] + i1[jm] * i1[jm]; rho = (1 - V) * (a1 + a2) + (sim ? V * (re[j] * re[j] + im[j] * im[j]) : 0); }
						}
						dens[j] = rho;
						if (x < wallCol) { if (rho > curL) curL = rho; } else if (rho > curR) curR = rho;
					}
				}
				maxL = Math.max(curL, maxL * 0.97); maxR = Math.max(curR, maxR * 0.97);
				for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
					j = y * n + x; var p = j * 4;
					if (solid[j]) { d[p] = 120; d[p + 1] = 130; d[p + 2] = 150; d[p + 3] = 255; continue; }
					var b = Math.pow(dens[j] / (x < wallCol ? maxL : maxR), 0.36); b = b > 1 ? 1 : b;
					var cr, cg, cb;
					if (useHeat) { var hh = Q.heat(b); cr = hh[0]; cg = hh[1]; cb = hh[2]; }
					else {
						var phs = Math.atan2(im[j], re[j]), h = (phs / (2 * Math.PI) + 1) % 1 * 6, k = h | 0, f = h - k, v = b * 255;
						var qv = v * (1 - f), tv = v * f;
						if (k === 0) { cr = v; cg = tv; cb = 0; } else if (k === 1) { cr = qv; cg = v; cb = 0; } else if (k === 2) { cr = 0; cg = v; cb = tv; }
						else if (k === 3) { cr = 0; cg = qv; cb = v; } else if (k === 4) { cr = tv; cg = 0; cb = v; } else { cr = v; cg = 0; cb = qv; }
					}
					d[p] = cr; d[p + 1] = cg; d[p + 2] = cb; d[p + 3] = 255;
				}
				imgCtx.putImageData(img, 0, 0);
				render.gain = maxL / maxR;
			}
			function draw() {
				if (!L.W || !img) return;
				var g = ctx, dpr = L.dpr, Sq = L.S;
				g.setTransform(dpr, 0, 0, dpr, 0, 0);
				g.fillStyle = "#070a14"; g.fillRect(0, 0, L.W, L.H);
				render();
				g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
				g.drawImage(imgCv, L.wx, L.wy, Sq, Sq);
				var sc = Sq / BOX;
				/* absorbing border hint */
				g.strokeStyle = "rgba(154,166,192,0.25)"; g.setLineDash([4, 4]); g.strokeRect(L.wx + 18 * sc, L.wy + 18 * sc, (BOX - 36) * sc, (BOX - 36) * sc); g.setLineDash([]);
				/* slit handles */
				if (pic) {
					g.fillStyle = "rgba(250,204,21,0.9)";
					pic.cs.forEach(function (c) {
						var xw = L.wx + (WALLX + WALLW / 2) * sc;
						[c - pic.aU / 2, c + pic.aU / 2].forEach(function (yy) { g.fillRect(xw - 6, L.wy + yy * sc - 1, 12, 2); });
					});
				}
				/* tracers */
				if (tracers && sim) {
					g.lineWidth = 1;
					for (var i = 0; i < trails.length; i++) {
						var tr = trails[i]; if (tr.length < 4) continue;
						var hue = (i * 47) % 360, dead = tracers.alive[i] !== 1;
						g.strokeStyle = "hsla(" + hue + ",90%,70%," + (dead ? 0.35 : 0.85) + ")";
						g.beginPath(); g.moveTo(L.wx + tr[0] * sc, L.wy + tr[1] * sc);
						for (var k = 2; k < tr.length; k += 2) g.lineTo(L.wx + tr[k] * sc, L.wy + tr[k + 1] * sc);
						g.stroke();
						if (!dead) { g.fillStyle = "#fff"; g.fillRect(L.wx + tr[tr.length - 2] * sc - 1.5, L.wy + tr[tr.length - 1] * sc - 1.5, 3, 3); }
					}
				}
				g.font = "11px system-ui, sans-serif"; g.fillStyle = "rgba(231,235,246,0.85)"; g.textBaseline = "alphabetic";
				var gain = render.gain || 1;
				g.fillText(gain > 1.5 ? "brightened ×" + Q.fmt(gain, 2) : "", L.wx + (WALLX + 8) * sc, L.wy + (L.narrow ? Sq - 6 : 30 * sc));
				drawScreen(g);
			}
			function drawScreen(g) {
				var ph = phys(), x0 = L.sx0, top = L.top, sh = L.sh, dw = L.dw, hw = L.sw - dw - 4, hx = x0 + dw + 4;
				g.fillStyle = "#03050b"; g.fillRect(x0, top, dw, sh);
				g.strokeStyle = "#273049"; g.strokeRect(x0 + 0.5, top + 0.5, dw - 1, sh - 1);
				if (dotsKey !== L.key) redrawDots();
				g.drawImage(dotsCv, x0, top, dw, sh);
				var now = performance.now();
				for (var i = 0; i < flashes.length; i++) {
					var fl = flashes[i], age = (now - fl.t) / 700; if (age > 1) continue;
					g.fillStyle = "rgba(255,255,220," + (1 - age) + ")"; g.beginPath();
					g.arc(x0 + 2 + fl.u * (dw - 4), top + (1 - (fl.y + 1) / 2) * sh, 1.5 + 4 * (1 - age), 0, 7); g.fill();
				}
				/* histogram */
				var mx = 0; for (i = 0; i < bins; i++) if (hist[i] > mx) mx = hist[i];
				var bh = sh / bins;
				g.fillStyle = "rgba(34,211,238,0.75)";
				if (mx > 0) for (i = 0; i < bins; i++) { var w = hist[i] / mx * hw; if (w > 0) g.fillRect(hx, top + sh - (i + 1) * bh, w, Math.max(1, bh - (bh > 3 ? 0.5 : 0))); }
				/* prediction (expected counts per bin, scaled to the histogram) */
				if (st.curve && T) {
					var Ymax = ph.L * Math.tan(T.thMax), o = { a: ph.a, d: ph.d, n: ph.n, lambda: ph.lam, V: ph.V }, pmax = 0, pts = [], M = Math.min(900, Math.round(sh * 1.5));
					for (i = 0; i <= M; i++) {
						var yr = -Ymax + 2 * Ymax * i / M, th = Math.atan(yr / ph.L), p = S.intensity(Math.sin(th), o) * Math.pow(Math.cos(th), 2);
						pts.push(p); if (p > pmax) pmax = p;
					}
					/* when there are counts, scale to the expected peak count, else to the full width */
					var expPeak = count > 0 ? count * pmax / sumIntegral(pts) * (M / bins) : 0, scale = count > 20 && mx > 0 ? expPeak / mx : 1;
					g.strokeStyle = "rgba(244,114,182,0.95)"; g.lineWidth = 1.4; g.beginPath();
					for (i = 0; i <= M; i++) { var X = hx + Math.min(1.1, pts[i] / pmax * scale) * hw, Y = top + sh - i / M * sh; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
					g.stroke();
				}
				/* labels */
				g.fillStyle = "rgba(231,235,246,0.9)"; g.font = "11px system-ui, sans-serif"; g.textBaseline = "alphabetic";
								var Ym = ph.L * Math.tan(T ? T.thMax : 0.1);
				g.fillStyle = "rgba(154,166,192,0.95)";
				g.fillText("+" + Q.si(Ym, "m"), hx + 2, top + 11); g.fillText("−" + Q.si(Ym, "m"), hx + 2, top + sh - 3);
				g.fillText((count ? count.toLocaleString("en-US") + " hits" : "no hits yet") + (L.narrow ? "" : " · screen " + Q.si(ph.L, "m") + " away"), x0, top + sh + 12);
				/* centre tick */
				g.strokeStyle = "rgba(154,166,192,0.5)"; g.beginPath(); g.moveTo(x0 - 4, top + sh / 2); g.lineTo(x0, top + sh / 2); g.stroke();
			}
			function sumIntegral(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

			/* ---------- simulation loop ---------- */
			var stepMs = 4;
			function advance(steps) {
				var t0 = performance.now();
				for (var s = 0; s < steps; s++) {
					if (sim) sim.step(1); if (sim1) sim1.step(1);
					if (tracers && sim) {
						sim.moveTracers(tracers, sim.dt, 4 * K0);
						for (var i = 0; i < tracers.x.length; i++) if (tracers.alive[i] === 1 && (((sim.t / sim.dt) | 0) % 2 === 0)) trails[i].push(tracers.x[i], tracers.y[i]);
					}
				}
				stepMs = 0.8 * stepMs + 0.2 * (performance.now() - t0) / Math.max(1, steps);
				var s0 = sim || sim1; if (s0.t > TMAX) restartWave();
			}
			function loop() {
				cancelAnimationFrame(raf);
				if (!shown || !running) return;
				raf = requestAnimationFrame(function (now) {
					var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
					var steps = Math.max(1, Math.min(st.spd, Math.floor(11 / Math.max(0.5, stepMs))));
					advance(steps);
					acc += st.rate * dt; var k = Math.floor(acc); acc -= k; if (k > 0) arrive(Math.min(k, 3000));
					draw(); loop();
				});
			}

			/* ---------- drag the slits ---------- */
			var drag = null;
			function picY(e) { var r = stage.getBoundingClientRect(); return (e.clientY - r.top - L.wy) / L.S * BOX; }
			hit.addEventListener("pointerdown", function (e) {
				if (!pic) return; var y = picY(e), best = null;
				pic.cs.forEach(function (c, i) {
					[-1, 1].forEach(function (s) { var dd = Math.abs(y - (c + s * pic.aU / 2)); if (dd < 4 && (!best || dd < best.dd)) best = { kind: "a", c: c, dd: dd }; });
					if (Math.abs(y - c) < pic.aU / 2 && (!best || best.kind !== "a")) best = { kind: st.n > 1 ? "d" : "a", c: c, dd: 0 };
				});
				if (!best) return;
				e.preventDefault(); hit.setPointerCapture(e.pointerId);
				drag = { kind: best.kind, c: best.c, y0: y, a0: st.a, d0: st.d, aU: pic.aU, dU: pic.dU, off: best.c - BOX / 2 };
			});
			hit.addEventListener("pointermove", function (e) {
				var y = picY(e);
				if (!drag) {
					var near = false; if (pic) pic.cs.forEach(function (c) { if (Math.abs(Math.abs(y - c) - pic.aU / 2) < 4) near = true; });
					hit.style.cursor = near ? "ns-resize" : "grab"; return;
				}
				if (drag.kind === "a") {
					var half = Math.max(1.5, Math.abs(y - drag.c)), fa = 2 * half / drag.aU;
					st.a = Q.clamp(drag.a0 * fa, 1e-9, 3e-3); if (st.n > 1 && st.d < st.a * 1.05) st.d = st.a * 1.05;
				} else if (Math.abs(drag.off) > 0.5) {
					var fd = Math.abs((y - BOX / 2) / drag.off); st.d = Q.clamp(drag.d0 * Math.max(0.05, fd), st.a * 1.05, 1e-2);
				}
				syncInputs(); changed(true);
			});
			function endDrag() { drag = null; }
			hit.addEventListener("pointerup", endDrag); hit.addEventListener("pointercancel", endDrag);

			/* ---------- start ---------- */
			syncInputs(); size(); rebuildScreen(); rebuildPicture();
			this._go = function () { shown = true; lastT = 0; size(); loop(); };
			this._stop = function () { shown = false; cancelAnimationFrame(raf); lastT = 0; };
			window.MESQuantumDebug_slit = {
				step: function (n) { advance(n || 1); draw(); }, arrive: function (n) { arrive(n || 1); draw(); }, draw: draw,
				state: function () { return { st: st, count: count, hist: hist, pic: pic, sim: sim, sim1: sim1, tracers: tracers, T: T }; }
			};
		},
		show: function () { if (this._go) this._go(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();

/* MES Quantum Lab: Uncertainty tab (wave packet <-> momentum distribution via FFT, free spreading, single slit, real-scale calculator) */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var U = Q.uncert, S = Q.slit, C = Q.C;

	Q.reg("uncert", {
		init: function (panel, api) {
			var $ = function (id) { return document.getElementById(id); };
			var st = api.st, q = api.query;
			var D0 = { shape: "gauss", w: 1, k: 0, spd: 0, reim: false, sa: -7, sE: 2, ex: "atom", m: C.me, x: 1e-10 };
			Object.keys(D0).forEach(function (k) { if (st[k] == null) st[k] = D0[k]; });
			if (q.get("un_s") && U.SHAPES[q.get("un_s")]) st.shape = q.get("un_s");
			var qw = Number(q.get("un_w")); if (q.get("un_w") && qw > 0) st.w = Q.clamp(qw, 0.32, 7);
			var qk = Number(q.get("un_k")); if (q.get("un_k") && isFinite(qk)) st.k = Q.clamp(qk, -3, 3);

			var G = U.grid(2048, 400), psi0, s0, phi0, cur, t = 0, playing = false, raf = 0, lastT = 0, shown = false, hist = [], XR = 24, PR = 5;
			var wrap = $("qm-un-wrap"), stage = $("qm-un-stage"), cv = $("qm-un-cv"), ctx = cv.getContext("2d"), L = {};

			function build() {
				psi0 = U.make(G, st.shape, st.w, st.k); s0 = U.stats(G, psi0); phi0 = s0.phi; cur = s0; t = 0; hist = [[0, s0.dx]]; XR = 24; PR = 5;
				if (playing) toggle(false);
				readouts(); draw();
			}
			function at(time) { t = time; cur = time === 0 ? s0 : U.stats(G, U.evolve(G, phi0, time)); }
			function readouts() {
				$("qm-un-r-dx").textContent = Q.fmt(cur.dx, 3) + " u";
				$("qm-un-r-dp").textContent = Q.fmt(cur.dk, 3) + " ħ/u";
				$("qm-un-r-pr").textContent = Q.fmt(cur.dx * cur.dk, 4) + " ħ";
				var r = cur.dx * cur.dk / 0.5;
				$("qm-un-r-ratio").textContent = r < 1.0005 ? "1.000 × ħ/2 (the minimum)" : r.toFixed(3) + " × ħ/2" + (t > 0 ? " (Δx grows, Δp stays)" : "");
				$("qm-un-r-t").textContent = Q.fmt(t, 3);
				$("qm-un-r-f").textContent = Q.fmt(U.spread(s0.dx, s0.dk, t), 3) + " u";
				$("qm-un-wv").textContent = st.w.toFixed(2) + " u"; $("qm-un-kv").textContent = st.k.toFixed(2) + " ħ/u";
				$("qm-un-spdv").textContent = Number(Math.pow(10, st.spd).toPrecision(2)) + "×";
			}
			function sync() {
				$("qm-un-w").value = Math.log10(st.w); $("qm-un-k").value = st.k; $("qm-un-spd").value = st.spd; $("qm-un-reim").checked = st.reim;
				Array.prototype.forEach.call($("qm-un-shape").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.s === st.shape ? "true" : "false"); });
			}
			var linkT = 0;
			function link() { clearTimeout(linkT); linkT = setTimeout(function () { api.setQuery({ un_s: st.shape === "gauss" ? null : st.shape, un_w: Number(st.w.toPrecision(3)), un_k: st.k ? st.k : null }); }, 400); }
			function changed() { api.save(); link(); build(); }
			$("qm-un-shape").addEventListener("click", function (e) { var b = e.target.closest("button[data-s]"); if (!b) return; st.shape = b.dataset.s; sync(); changed(); });
			$("qm-un-w").addEventListener("input", function () { st.w = Math.pow(10, +this.value); changed(); });
			$("qm-un-k").addEventListener("input", function () { st.k = +this.value; changed(); });
			$("qm-un-spd").addEventListener("input", function () { st.spd = +this.value; api.save(); readouts(); });
			$("qm-un-reim").addEventListener("change", function () { st.reim = this.checked; api.save(); draw(); });
			$("qm-un-link").addEventListener("click", function () { link(); setTimeout(function () { api.copy(location.href, "Link copied"); }, 450); });
			$("qm-un-go").addEventListener("click", function () { toggle(!playing); });
			$("qm-un-reset").addEventListener("click", build);
			$("qm-un-fs").addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {}); });
			document.addEventListener("fullscreenchange", function () { $("qm-un-fs").textContent = document.fullscreenElement === wrap ? "Exit full screen" : "Full screen"; size(); draw(); });
			function toggle(on) {
				playing = on; var b = $("qm-un-go"); b.textContent = on ? "Pause" : (t > 0 ? "Continue" : "Let it go"); b.setAttribute("aria-pressed", on ? "true" : "false");
				lastT = 0; if (on) loop(); else cancelAnimationFrame(raf);
			}
			function loop() {
				cancelAnimationFrame(raf); if (!shown || !playing) return;
				raf = requestAnimationFrame(function (now) {
					var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
					stepTime(dt * 3 * Math.pow(10, st.spd)); loop();
				});
			}
			function stepTime(dt) {
				at(t + dt);
				if (!hist.length || t - hist[hist.length - 1][0] > 0.02 * Math.max(1, t)) hist.push([t, cur.dx]);
				var need = Math.abs(cur.x) + 3.3 * cur.dx;
				if (need > XR) XR = Math.min(190, need * 1.25);
				if (Math.abs(cur.x) + 4 * cur.dx > 180) toggle(false); /* stop before the packet wraps around the box */
				readouts(); draw();
			}

			/* ---------- drawing ---------- */
			function size() {
				var W = stage.parentNode.clientWidth || 600, phone = W < 560, nat = Math.round(phone ? W * 1.3 + 46 : Q.clamp(W * 0.48, 300, 600)), H = nat;
				if (document.fullscreenElement === wrap) H = Math.max(260, window.innerHeight - wrap.querySelector(".qm-legend").offsetHeight - wrap.querySelector(".qm-readouts").offsetHeight);
				else if (window.MESStage) H = MESStage.sh(stage, nat);
				stage.style.height = H + "px";
				var dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				var pad = 8, gap = 10;
				if (phone) { var Hb = H - 46, h1 = (Hb - 3 * gap) * 0.36, h3 = Hb - 3 * gap - 2 * h1; L = { x: [pad, gap, W - 2 * pad, h1], p: [pad, 2 * gap + h1, W - 2 * pad, h1], c: [pad, 3 * gap + 2 * h1, W - 2 * pad, h3 - 4] }; }
				else { var top = (H - 2 * gap) * 0.62, half = (W - 2 * pad - gap) / 2; L = { x: [pad, gap, half, top], p: [pad + half + gap, gap, half, top], c: [pad, 2 * gap + top, W - 2 * pad, H - 3 * gap - top] }; }
				L.W = W; L.H = H; L.dpr = dpr;
			}
			new ResizeObserver(function () { size(); draw(); }).observe(stage.parentNode);
			function frame(g, r, title) {
				g.fillStyle = "#0c1020"; g.fillRect(r[0], r[1], r[2], r[3]);
				g.strokeStyle = "#273049"; g.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
				g.fillStyle = "rgba(231,235,246,0.9)"; g.font = "12px system-ui, sans-serif"; g.textBaseline = "top"; g.fillText(title, r[0] + 8, r[1] + 6);
			}
			function curve(g, r, xs, ys, lo, hi, col, fill) {
				var ax = r[0] + 6, aw = r[2] - 12, base = r[1] + r[3] - 18, ah = r[3] - 60, mx = 0, i;
				for (i = 0; i < ys.length; i++) if (ys[i] > mx) mx = ys[i];
				if (!mx) return;
				g.beginPath(); g.moveTo(ax + (xs[0] - lo) / (hi - lo) * aw, base);
				for (i = 0; i < xs.length; i++) g.lineTo(ax + (xs[i] - lo) / (hi - lo) * aw, base - ys[i] / mx * ah);
				g.lineTo(ax + (xs[xs.length - 1] - lo) / (hi - lo) * aw, base);
				if (fill) { g.fillStyle = fill; g.fill(); }
				g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
			}
			function axis(g, r, lo, hi, unit) {
				var ax = r[0] + 6, aw = r[2] - 12, base = r[1] + r[3] - 18, span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 4))), m = span / step;
				if (m > 20) step *= 5; else if (m > 8) step *= 2;
				g.strokeStyle = "#3a4562"; g.beginPath(); g.moveTo(ax, base); g.lineTo(ax + aw, base); g.stroke();
				g.fillStyle = "rgba(154,166,192,0.95)"; g.font = "10px system-ui, sans-serif"; g.textBaseline = "top"; g.textAlign = "center";
				for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) { var X = ax + (v - lo) / span * aw; g.fillRect(X, base, 1, 3); g.fillText(Number(v.toPrecision(3)) + "", X, base + 4); }
				g.textAlign = "right"; g.fillText(unit, ax + aw, r[1] + 7); g.textAlign = "left";
			}
			function spread(g, r, mean, sd, lo, hi, label) {
				var ax = r[0] + 6, aw = r[2] - 12, base = r[1] + r[3] - 18, y = r[1] + 44, x1 = ax + (mean - sd - lo) / (hi - lo) * aw, x2 = ax + (mean + sd - lo) / (hi - lo) * aw;
				g.strokeStyle = "rgba(250,204,21,0.9)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x1, y); g.lineTo(x1, base); g.moveTo(x2, y); g.lineTo(x2, base); g.stroke(); g.setLineDash([]);
				g.beginPath(); g.moveTo(x1, y + 4); g.lineTo(x2, y + 4); g.stroke();
				g.fillStyle = "#facc15"; g.font = "11px system-ui, sans-serif"; g.textBaseline = "bottom"; g.textAlign = "center";
				g.fillText(label, Q.clamp((x1 + x2) / 2, ax + 40, ax + aw - 40), y + 2); g.textAlign = "left";
			}
			function draw() {
				if (!L.W || !cur) return;
				var g = ctx; g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.fillStyle = "#070a14"; g.fillRect(0, 0, L.W, L.H);
				var i, xs = [], ys = [], rs = [], psi = t === 0 ? psi0 : U.evolve(G, phi0, t), lo = -XR, hi = XR;
				var i0 = Math.max(0, Math.floor((lo + 200) / G.dx)), i1 = Math.min(G.n - 1, Math.ceil((hi + 200) / G.dx)), stp = Math.max(1, Math.round((i1 - i0) / 900));
				for (i = i0; i <= i1; i += stp) { xs.push(G.x[i]); ys.push(cur.px[i]); rs.push(psi.re[i]); }
				frame(g, L.x, "Position  |ψ(x)|²"); axis(g, L.x, lo, hi, "x (u)");
				if (st.reim) {
					var mx = 0; for (i = 0; i < ys.length; i++) mx = Math.max(mx, ys[i]);
					var ax = L.x[0] + 6, aw = L.x[2] - 12, base = L.x[1] + L.x[3] - 18, ah = L.x[3] - 60, sq = Math.sqrt(mx);
					g.strokeStyle = "rgba(167,139,250,0.85)"; g.lineWidth = 1; g.beginPath();
					for (i = 0; i < xs.length; i++) { var X = ax + (xs[i] - lo) / (hi - lo) * aw, Y = base - ah / 2 - rs[i] / sq * ah / 2; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
					g.stroke();
				}
				curve(g, L.x, xs, ys, lo, hi, "#22d3ee", "rgba(34,211,238,0.22)");
				spread(g, L.x, cur.x, cur.dx, lo, hi, "Δx = " + Q.fmt(cur.dx, 3));
				/* momentum: FFT bins sorted */
				var ks = [], kp = [], n = G.n, plo = cur.k - PR, phi = PR + cur.k;
				plo = Math.min(-PR, st.k - PR); phi = Math.max(PR, st.k + PR);
				for (i = n / 2; i < n; i++) if (G.k[i] >= plo) { ks.push(G.k[i]); kp.push(cur.pk[i]); }
				for (i = 0; i < n / 2; i++) if (G.k[i] <= phi) { ks.push(G.k[i]); kp.push(cur.pk[i]); }
				frame(g, L.p, "Momentum  |φ(p)|²"); axis(g, L.p, plo, phi, "p (ħ/u)");
				curve(g, L.p, ks, kp, plo, phi, "#f472b6", "rgba(244,114,182,0.22)");
				spread(g, L.p, cur.k, cur.dk, plo, phi, "Δp = " + Q.fmt(cur.dk, 3));
				/* Δx(t) chart */
				var r = L.c; frame(g, r, "Spreading: Δx(t)");
				var tmax = Math.max(4, t * 1.15), xmax = Math.max(U.spread(s0.dx, s0.dk, tmax), s0.dx * 1.5) * 1.1, cx = r[0] + 44, cw = r[2] - 56, cb = r[1] + r[3] - 18, ch = r[3] - 40;
				g.strokeStyle = "#3a4562"; g.beginPath(); g.moveTo(cx, r[1] + 22); g.lineTo(cx, cb); g.lineTo(cx + cw, cb); g.stroke();
				g.fillStyle = "rgba(154,166,192,0.95)"; g.font = "10px system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "right";
				g.fillText(Q.fmt(xmax, 2), cx - 4, r[1] + 26); g.fillText("0", cx - 4, cb); g.textAlign = "left"; g.textBaseline = "top";
				g.fillText("t = " + Q.fmt(tmax, 2), cx + cw - 60, cb + 4);
				g.strokeStyle = "#a3e635"; g.lineWidth = 1.5; g.beginPath();
				for (i = 0; i <= 120; i++) { var tt = tmax * i / 120, X2 = cx + tt / tmax * cw, Y2 = cb - U.spread(s0.dx, s0.dk, tt) / xmax * ch; if (i) g.lineTo(X2, Y2); else g.moveTo(X2, Y2); }
				g.stroke();
				g.fillStyle = "#facc15";
				for (i = 0; i < hist.length; i++) { g.beginPath(); g.arc(cx + hist[i][0] / tmax * cw, cb - hist[i][1] / xmax * ch, 2.4, 0, 7); g.fill(); }
				g.fillStyle = "rgba(231,235,246,0.85)"; g.font = "11px system-ui, sans-serif";
				g.fillText(t > 0 ? "simulation (dots) vs formula √(Δx₀² + (Δp t/m)²) (line)" : "press “Let it go” to release the packet", cx + 8, r[1] + 24);
			}
			/* drag sideways on the position plot: change the width */
			var drag = null;
			cv.addEventListener("pointerdown", function (e) {
				var rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, b = L.x;
				if (!b || x < b[0] || x > b[0] + b[2] || y < b[1] || y > b[1] + b[3]) return;
				drag = { x: e.clientX, w: st.w }; cv.setPointerCapture(e.pointerId);
			});
			cv.addEventListener("pointermove", function (e) { if (!drag) return; var f = Math.exp((e.clientX - drag.x) / 160); st.w = Q.clamp(drag.w * f, 0.32, 7); sync(); changed(); });
			cv.addEventListener("pointerup", function () { drag = null; }); cv.addEventListener("pointercancel", function () { drag = null; });

			/* ---------- single slit ---------- */
			var scv = $("qm-un-slitcv"), sctx = scv.getContext("2d");
			function slit() {
				var a = Math.pow(10, st.sa), E = Math.pow(10, st.sE), db = S.debroglie("electron", E), lam = db.lambda, s = lam / a, th = Math.asin(Math.min(1, s));
				$("qm-un-sav").textContent = Q.si(a, "m"); $("qm-un-sEv").textContent = E >= 1000 ? Q.si(E, "eV") : Number(E.toPrecision(3)) + " eV";
				$("qm-un-s-lam").textContent = Q.si(lam, "m");
				$("qm-un-s-th").textContent = s >= 1 ? "no dark fringe (λ > a): spreads to 90°" : (th * 180 / Math.PI < 0.01 ? Q.fmt(th, 3) + " rad" : Number((th * 180 / Math.PI).toPrecision(3)) + "°");
				var dp = C.hbar / (2 * a / Math.sqrt(12));
				$("qm-un-s-dp").textContent = Q.fmt(dp, 3) + " kg·m/s (" + Number((dp / db.p * 100).toPrecision(2)) + "% of p)";
				$("qm-un-s-w").textContent = s >= 1 ? "whole screen" : Q.si(2 * Math.tan(th), "m");
				var W = scv.clientWidth || 300, H = 150, dpr = Math.min(2, window.devicePixelRatio || 1); scv.width = W * dpr; scv.height = H * dpr;
				var g = sctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#070a14"; g.fillRect(0, 0, W, H);
				var sx = W * 0.3, cy = H / 2, gapPx = Q.clamp(10 + (st.sa + 10) * 12, 8, 70), shown = Math.min(1.45, Math.max(th, 0.035));
				g.fillStyle = "rgba(34,211,238,0.25)"; g.fillRect(8, cy - gapPx * 1.6, sx - 8, gapPx * 3.2);
				var len = W - sx - 10;
				var grd = g.createLinearGradient(sx, 0, W, 0); grd.addColorStop(0, "rgba(34,211,238,0.55)"); grd.addColorStop(1, "rgba(34,211,238,0.08)");
				g.fillStyle = grd; g.beginPath(); g.moveTo(sx, cy - gapPx / 2); g.lineTo(sx + len, cy - gapPx / 2 - len * Math.tan(shown)); g.lineTo(sx + len, cy + gapPx / 2 + len * Math.tan(shown)); g.lineTo(sx, cy + gapPx / 2); g.fill();
				g.fillStyle = "#9aa6c0"; g.fillRect(sx - 3, 0, 6, cy - gapPx / 2); g.fillRect(sx - 3, cy + gapPx / 2, 6, H);
				g.fillStyle = "rgba(231,235,246,0.9)"; g.font = "11px system-ui, sans-serif"; g.textBaseline = "top";
				g.fillText("a = " + Q.si(a, "m"), sx + 8, 6); g.fillText("electrons " + (E >= 1000 ? Q.si(E, "eV") : Number(E.toPrecision(3)) + " eV"), 10, 6);
				if (th < 0.035) g.fillText("angle drawn bigger than real", sx + 8, H - 18);
			}
			$("qm-un-sa").value = st.sa; $("qm-un-sE").value = st.sE;
			$("qm-un-sa").addEventListener("input", function () { st.sa = +this.value; api.save(); slit(); });
			$("qm-un-sE").addEventListener("input", function () { st.sE = +this.value; api.save(); slit(); });
			new ResizeObserver(function () { slit(); }).observe(scv);

			/* ---------- real-scale calculator ---------- */
			var exBox = $("qm-un-ex");
			exBox.innerHTML = U.EXAMPLES.map(function (e) { return '<button type="button" data-e="' + e.id + '">' + e.name + "</button>"; }).join("");
			function num(s) { s = String(s).replace(/\s/g, "").replace(/[×x]10\^?/i, "e").replace(/−/g, "-"); var v = Number(s); return isFinite(v) && v > 0 ? v : NaN; }
			function calc() {
				var m = num($("qm-un-m").value), dx = num($("qm-un-x").value), tb = $("qm-un-tab").tBodies[0];
				Array.prototype.forEach.call(exBox.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.e === st.ex ? "true" : "false"); });
				if (!(m > 0) || !(dx > 0)) { tb.innerHTML = "<tr><td>Type a mass and a length above (for example 9.11e-31 and 1e-10).</td></tr>"; $("qm-un-say").textContent = ""; return; }
				var dp = U.minDp(dx), dv = dp / m, tdbl = 2 * Math.sqrt(3) * m * dx * dx / C.hbar;
				var rows = [["Smallest momentum spread Δp = ħ/(2Δx)", Q.fmt(dp, 3) + " kg·m/s"], ["Smallest speed spread Δv = Δp/m", Q.si(dv, "m/s")],
					["Extra position spread after 1 s (Δv × 1 s)", Q.si(dv, "m")], ["Time for a Gaussian packet to double in width", tdbl < 1e7 ? Q.si(tdbl, "s") : Q.fmt(tdbl / 3.156e7, 3) + " years"]];
				tb.innerHTML = rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("");
				var say = dv > 1e5 ? "Huge: the particle cannot sit still in so small a space. This is why electrons in atoms move at hundreds of km/s and do not fall into the nucleus." :
					dv > 1 ? "Large enough to matter: quantum effects are part of everyday physics at this scale." :
					dv > 1e-9 ? "Small but not zero: careful experiments can see it." : "Far too small to ever notice: big objects behave classically because their mass makes Δv tiny.";
				$("qm-un-say").textContent = say;
			}
			function setEx(id) { var e = U.EXAMPLES.filter(function (x) { return x.id === id; })[0]; if (!e) return; st.ex = id; st.m = e.m; st.x = e.dx; $("qm-un-m").value = e.m < 1e-3 ? e.m.toExponential(3) : String(e.m); $("qm-un-x").value = String(e.dx); api.save(); calc(); }
			exBox.addEventListener("click", function (e) { var b = e.target.closest("button[data-e]"); if (b) setEx(b.dataset.e); });
			$("qm-un-m").addEventListener("input", function () { st.ex = ""; st.m = num(this.value) || st.m; api.save(); calc(); });
			$("qm-un-x").addEventListener("input", function () { st.ex = ""; st.x = num(this.value) || st.x; api.save(); calc(); });
			$("qm-un-m").value = st.m < 1e-3 ? Number(st.m).toExponential(3) : String(st.m); $("qm-un-x").value = String(st.x);

			sync(); size(); build(); slit(); calc();
			this._go = function () { shown = true; size(); draw(); if (playing) loop(); };
			this._stop = function () { shown = false; cancelAnimationFrame(raf); lastT = 0; };
			window.MESQuantumDebug_uncert = { advance: function (dt) { stepTime(dt); }, state: function () { return { st: st, t: t, cur: cur, s0: s0, hist: hist }; } };
		},
		show: function () { if (this._go) this._go(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();

/* MES Quantum Lab, tab "ent": entangled pairs, Alice and Bob's dials, a live CHSH test against local hidden-variable models,
   the correlation curve and the no-signalling check. Physics in lib-ent.js (MESQ.ent). Link params: en_t, en_m, en_mode, en_a, en_ap, en_b, en_bp. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var D = Math.PI / 180, TRAVEL = 0.9;

	Q.reg("ent", {
		init: function (panel, api) {
			var E = Q.ent, st = api.st, $ = function (id) { return document.getElementById(id); };
			/* ---------- settings ---------- */
			if (!st.type) st.type = "ph";
			if (!st.model) st.model = "q";
			if (!st.mode) st.mode = "chsh";
			if (!st.set || st.set.length !== 4) st.set = E.optimal(st.type).map(function (x) { return x / D; });
			if (st.rate == null) st.rate = 40;
			if (st.fly == null) st.fly = true;
			var q = api.query;
			if (q.get("en_t") === "ph" || q.get("en_t") === "el") st.type = q.get("en_t");
			if (E.MODELS[q.get("en_m")]) st.model = q.get("en_m");
			if (q.get("en_mode") === "free" || q.get("en_mode") === "chsh") st.mode = q.get("en_mode");
			["en_a", "en_ap", "en_b", "en_bp"].forEach(function (k, i) { var v = parseFloat(q.get(k)); if (isFinite(v)) st.set[i] = v; });

			var cv = $("qm-en-cv"), ctx = cv.getContext("2d"), stage = $("qm-en-stage"), wrap = $("qm-en-wrap");
			var pcv = $("qm-en-plot"), pctx = pcv.getContext("2d"), pstage = $("qm-en-pstage"), pwrap = $("qm-en-pwrap");
			var W = 600, H = 360, PW = 600, PH = 300, dpr = 1;
			var running = false, playing = true, raf = 0, last = 0, carry = 0, seed = (Date.now() % 1e9) | 0, rnd = Q.rng(seed);
			var flights = [], pulse = 0, dirtyUI = true, uiT = 0;
			/* data */
			var cells, free, bins, marg, margFree, tot, hist, lamp;
			function resetData(keepBins) {
				cells = E.newCounts(); free = E.newCounts()[0]; marg = [[0, 0, 0], [0, 0, 0]]; margFree = {};
				tot = { n: 0, ap: 0, bp: 0, same: 0 }; hist = []; flights = [];
				lamp = { A: { v: 0, t: -9, idx: 0 }, B: { v: 0, t: -9, idx: 0 } };
				if (!keepBins) bins = {};
				dirtyUI = true;
			}
			resetData();
			function period() { return st.type === "el" ? 360 : 180; }
			function rad(i) { return st.set[i] * D; }
			function rate() { return st.rate <= 0 ? 0.5 : 0.5 * Math.pow(10, st.rate / 25); }

			/* ---------- one pair ---------- */
			function measure(now) {
				var x, y, a, b;
				if (st.mode === "chsh") { x = rnd() < 0.5 ? 0 : 1; y = rnd() < 0.5 ? 0 : 1; if (drag) { if (drag.side === "A") x = drag.idx; else y = drag.idx; } a = rad(x); b = rad(2 + y); }
				else { x = 0; y = 0; a = rad(0); b = rad(2); }
				var r = E.pair(st.type, st.model, a, b, rnd), A = r[0], B = r[1];
				if (st.mode === "chsh") { E.add(cells[x * 2 + y], A, B); var m = marg[x]; m[0]++; if (B > 0) m[1]++; if (A > 0) m[2]++; }
				else {
					E.add(free, A, B); var key = (Math.round(st.set[0] * 2) / 2).toString(), mf = margFree[key] || (margFree[key] = [0, 0, 0, st.set[0]]);
					mf[0]++; if (B > 0) mf[1]++; if (A > 0) mf[2]++;
				}
				var dd = Math.round(E.wrap((b - a)) / D * 2) / 2; if (st.type === "ph") { dd = ((dd + 90) % 180 + 180) % 180 - 90; }
				var bc = bins[dd] || (bins[dd] = { n: 0, pp: 0, pm: 0, mp: 0, mm: 0 }); E.add(bc, A, B);
				tot.n++; if (A > 0) tot.ap++; if (B > 0) tot.bp++; if (A === B) tot.same++;
				hist.push([A, B, x, y]); if (hist.length > 24) hist.shift();
				if (now != null) { lamp.A = { v: A, t: now, idx: x }; lamp.B = { v: B, t: now, idx: y }; }
				dirtyUI = true;
			}
			function burst(n) { for (var i = 0; i < n; i++) measure(null); var h = hist[hist.length - 1]; if (h) { var t = performance.now() / 1000; lamp.A = { v: h[0], t: t, idx: h[2] }; lamp.B = { v: h[1], t: t, idx: h[3] }; } }

			/* ---------- layout ---------- */
			function runPad(stg) { var r = stg.querySelector(".qm-run"); if (!r) return [0, 0]; var cs = getComputedStyle(r), h = r.offsetHeight + 8; return cs.top === "auto" || parseFloat(cs.top) > stg.clientHeight / 2 ? [0, h] : [0, 0]; }
			var PAD = [0, 0];
			function natH(w) { return Math.round(Q.clamp(w * 0.46, 300, 460)); }
			function sizeOf(st0, wr, nat) {
				var w = st0.clientWidth || 600, h;
				if (document.fullscreenElement === wr) { var other = 0; Array.prototype.forEach.call(wr.children, function (c) { if (c !== st0) other += c.offsetHeight; }); h = Math.max(240, window.innerHeight - other); }
				else h = window.MESStage ? window.MESStage.sh(st0, nat(w)) : nat(w);
				return [w, Math.round(h)];
			}
			function layout() {
				dpr = Math.min(2, window.devicePixelRatio || 1);
				PAD = runPad(stage); var s = sizeOf(stage, wrap, function (w) { return natH(w) + PAD[0] + PAD[1]; }); W = s[0]; H = s[1]; stage.style.height = H + "px";
				cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				s = sizeOf(pstage, pwrap, function (w) { return Math.round(Q.clamp(w * 0.42, 230, 380)); }); PW = s[0]; PH = s[1]; pstage.style.height = PH + "px";
				pcv.width = Math.round(PW * dpr); pcv.height = Math.round(PH * dpr);
				draw(performance.now() / 1000); drawPlot();
			}
			function geo() {
				var h = H - PAD[0] - PAD[1], R = Math.max(22, Math.min(h * 0.15, W * 0.1)), yc = PAD[0] + h * 0.4;
				return { R: R, yc: yc, bot: H - PAD[1], xA: Math.max(R + 14, W * 0.15), xB: Math.min(W - R - 14, W * 0.85), xS: W / 2 };
			}

			/* ---------- drawing ---------- */
			function lineAt(g, x, y, ang, len, w, col) {   // ang = setting in degrees; photons: axis from horizontal, spins: arrow from up
				var dx, dy; if (st.type === "ph") { dx = Math.cos(ang * D); dy = -Math.sin(ang * D); } else { dx = Math.sin(ang * D); dy = -Math.cos(ang * D); }
				g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.beginPath();
				if (st.type === "ph") { g.moveTo(x - dx * len, y - dy * len); g.lineTo(x + dx * len, y + dy * len); g.stroke(); }
				else {
					g.moveTo(x - dx * len * 0.55, y - dy * len * 0.55); g.lineTo(x + dx * len, y + dy * len); g.stroke();
					var hx = x + dx * len, hy = y + dy * len, px = -dy, py = dx, s = Math.max(6, len * 0.22);
					g.fillStyle = col; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - dx * s + px * s * 0.55, hy - dy * s + py * s * 0.55); g.lineTo(hx - dx * s - px * s * 0.55, hy - dy * s - py * s * 0.55); g.closePath(); g.fill();
				}
			}
			function station(g, side, G, now) {
				var x = side === "A" ? G.xA : G.xB, y = G.yc, R = G.R, i0 = side === "A" ? 0 : 2, L = lamp[side], age = now - L.t;
				var cur = st.mode === "chsh" ? (drag && drag.side === side ? drag.idx : L.idx) : 0, fs = Math.max(11, Math.min(15, R * 0.36));
				// dial
				var gr = g.createRadialGradient(x, y, R * 0.2, x, y, R * 1.1); gr.addColorStop(0, "#1a2140"); gr.addColorStop(1, "#0d1226");
				g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 2 * Math.PI); g.fill();
				g.strokeStyle = hover === side ? "#a5b4fc" : "#3a4466"; g.lineWidth = hover === side ? 2.5 : 1.5; g.stroke();
				g.strokeStyle = "#4b567a"; g.lineWidth = 1;
				for (var t = 0; t < 360; t += 15) { var c = Math.cos(t * D), s = Math.sin(t * D), k = t % 45 === 0 ? 0.82 : 0.9; g.beginPath(); g.moveTo(x + c * R * k, y + s * R * k); g.lineTo(x + c * R, y + s * R); g.stroke(); }
				// settings
				if (st.mode === "chsh") lineAt(g, x, y, st.set[i0 + 1 - cur], R * 0.86, 2, "rgba(165,180,252,0.35)");
				lineAt(g, x, y, st.set[i0 + cur], R * 0.86, 4, "#c7d2fe");
				g.fillStyle = "#e7ebf6"; g.beginPath(); g.arc(x, y, 3.5, 0, 2 * Math.PI); g.fill();
				// labels
				g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = "#e7ebf6"; g.font = "700 " + Math.round(fs * 1.15) + "px system-ui, sans-serif";
				g.fillText(side === "A" ? "Alice" : "Bob", x, y - R - fs * 1.75);
				g.font = Math.round(fs) + "px system-ui, sans-serif"; g.fillStyle = "#a5b4fc";
				var nm = (side === "A" ? "a" : "b") + (st.mode === "chsh" && cur ? "′" : "");
				g.fillText(nm + " = " + fmtA(st.set[i0 + cur]), x, y - R - fs * 0.5);
				g.fillStyle = "#9aa6c0"; g.font = Math.round(fs * 0.85) + "px system-ui, sans-serif";
				g.fillText(st.type === "ph" ? "polarizer" : "Stern-Gerlach magnet", x, y + R + fs * 1.2);
				// lamps
				var ly = y + R + fs * 3.0, lr = Math.max(9, Math.min(15, R * 0.34)), glow = Math.max(0, 1 - age / 0.45);
				[[1, "+1", "#4ade80", -1], [-1, "−1", "#f87171", 1]].forEach(function (Lp) {
					var lx = x + Lp[3] * lr * 1.6, on = L.v === Lp[0] ? glow : 0;
					if (on > 0) { g.fillStyle = Lp[2]; g.globalAlpha = on * 0.35; g.beginPath(); g.arc(lx, ly, lr * 2, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1; }
					g.fillStyle = on > 0 ? Lp[2] : "#1b2238"; g.beginPath(); g.arc(lx, ly, lr, 0, 2 * Math.PI); g.fill();
					g.strokeStyle = Lp[2]; g.lineWidth = 1.5; g.stroke();
					g.fillStyle = on > 0.3 ? "#08101e" : Lp[2]; g.font = "700 " + Math.round(lr * 0.95) + "px system-ui, sans-serif"; g.textBaseline = "middle"; g.fillText(Lp[1], lx, ly + 0.5);
				});
				g.textBaseline = "alphabetic";
			}
			function fmtA(v) { return (Math.round(v * 10) / 10).toString().replace("-", "−") + "°"; }
			function draw(now) {
				var g = ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
				var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#090d1c"); bg.addColorStop(1, "#05070f"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
				var G = geo();
				g.setLineDash([4, 6]); g.strokeStyle = "#273049"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(G.xA + G.R, G.yc); g.lineTo(G.xB - G.R, G.yc); g.stroke(); g.setLineDash([]);
				// source
				var pr = Math.max(14, G.R * 0.45), pg = Math.max(0, 1 - (now - pulse) / 0.35);
				var sg2 = g.createRadialGradient(G.xS, G.yc, 2, G.xS, G.yc, pr * (1.8 + pg)); sg2.addColorStop(0, "rgba(167,139,250," + (0.6 + 0.4 * pg) + ")"); sg2.addColorStop(1, "rgba(167,139,250,0)");
				g.fillStyle = sg2; g.beginPath(); g.arc(G.xS, G.yc, pr * (1.8 + pg), 0, 2 * Math.PI); g.fill();
				g.fillStyle = "#ede9fe"; g.beginPath(); g.arc(G.xS, G.yc, pr * 0.42, 0, 2 * Math.PI); g.fill();
				var fs = Math.max(11, Math.min(14, G.R * 0.34));
				g.fillStyle = "#c4b5fd"; g.font = "600 " + Math.round(fs) + "px system-ui, sans-serif"; g.textAlign = "center";
				g.fillText(st.model === "q" ? "entangled source" : "hidden-variable source", G.xS, G.yc - pr * 2.2);
				// flights
				for (var i = 0; i < flights.length; i++) {
					var f = flights[i], u = (now - f.t0) / TRAVEL; if (u < 0 || u > 1) continue;
					var dxA = G.xS + (G.xA - G.xS) * u, dxB = G.xS + (G.xB - G.xS) * u, col = "hsl(" + f.hue + ",90%,70%)";
					[dxA, dxB].forEach(function (px) { g.fillStyle = col; g.globalAlpha = 0.25; g.beginPath(); g.arc(px, G.yc, 7, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1; g.beginPath(); g.arc(px, G.yc, 3, 0, 2 * Math.PI); g.fill(); });
				}
				station(g, "A", G, now); station(g, "B", G, now);
				// last pair
				var h = hist[hist.length - 1], by = G.bot - Math.max(12, fs * 1.1);
				g.font = Math.round(fs) + "px system-ui, sans-serif"; g.fillStyle = "#9aa6c0";
				if (h) {
					var txt = "Last pair: Alice " + (h[0] > 0 ? "+1" : "−1") + ", Bob " + (h[1] > 0 ? "+1" : "−1") + (h[0] === h[1] ? "  (same)" : "  (different)");
					g.fillText(W < 420 ? txt.replace("Last pair: ", "") : txt, W / 2, by);
				} else g.fillText(W < 420 ? "Drag a dial to turn it" : "Press play, or drag a dial to turn it", W / 2, by);
			}

			/* ---------- correlation plot ---------- */
			function drawPlot() {
				var g = pctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#070a14"; g.fillRect(0, 0, PW, PH);
				var span = st.type === "ph" ? 90 : 180, ml = 44, mr = 14, mt = 16, mb = 36, w = PW - ml - mr, h = PH - mt - mb;
				var X = function (d) { return ml + (d + span) / (2 * span) * w; }, Y = function (e) { return mt + (1 - e) / 2 * h; };
				var fs = PW < 420 ? 10 : 12;
				g.font = fs + "px system-ui, sans-serif"; g.fillStyle = "#9aa6c0"; g.strokeStyle = "#1e2640"; g.lineWidth = 1; g.textAlign = "right"; g.textBaseline = "middle";
				[-1, -0.5, 0, 0.5, 1].forEach(function (e) { g.beginPath(); g.moveTo(ml, Y(e)); g.lineTo(ml + w, Y(e)); g.stroke(); g.fillText(e.toString().replace("-", "−"), ml - 6, Y(e)); });
				g.textAlign = "center"; g.textBaseline = "top"; var stp = span === 90 ? 22.5 : 45;
				for (var d = -span; d <= span + 1e-9; d += stp) { g.beginPath(); g.moveTo(X(d), mt); g.lineTo(X(d), mt + h); g.stroke(); if (PW >= 420 || d % (2 * stp) === 0) g.fillText(fmtA(d), X(d), mt + h + 5); }
				g.fillText("angle between the dials, b − a", ml + w / 2, mt + h + 5 + fs * 1.4);
				g.save(); g.translate(12, mt + h / 2); g.rotate(-Math.PI / 2); g.textBaseline = "middle"; g.fillText("correlation E", 0, 0); g.restore();
				// curves (E depends only on b - a)
				[["bell", "#facc15"], ["malus", "#f472b6"], ["q", "#22d3ee"]].forEach(function (c) {
					g.strokeStyle = c[1]; g.lineWidth = st.model === c[0] ? 3 : 1.5; g.globalAlpha = st.model === c[0] ? 1 : 0.75; g.beginPath();
					for (var i = 0; i <= 360; i++) { var dd = -span + 2 * span * i / 360, e = E.E(st.type, c[0], 0, dd * D); if (i) g.lineTo(X(dd), Y(e)); else g.moveTo(X(dd), Y(e)); }
					g.stroke(); g.globalAlpha = 1;
				});
				// CHSH angle markers
				if (st.mode === "chsh") {
					g.fillStyle = "rgba(165,180,252,0.18)";
					[[0, 2], [0, 3], [1, 2], [1, 3]].forEach(function (p) { var dd = norm(st.set[p[1]] - st.set[p[0]]); g.fillRect(X(dd) - 1.5, mt, 3, h); });
				}
				// measured points
				Object.keys(bins).forEach(function (k) {
					var c = bins[k]; if (c.n < 10) return; var e = E.cellE(c), er = E.cellErr(c), x = X(+k);
					g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, Y(Math.min(1, e + er))); g.lineTo(x, Y(Math.max(-1, e - er))); g.stroke();
					g.fillStyle = "#fff"; g.beginPath(); g.arc(x, Y(e), 3.2, 0, 2 * Math.PI); g.fill();
				});
			}
			function norm(dd) { var p = period(), hp = p / 2; dd = ((dd + hp) % p + p) % p - hp; return dd; }

			/* ---------- HTML readouts ---------- */
			function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "–"; }
			function f3(x) { return isFinite(x) ? x.toFixed(3).replace("-", "−") : "–"; }
			function updUI() {
				$("qm-en-n").textContent = tot.n.toLocaleString("en-US");
				var S = E.stats(cells), few = cells.some(function (c) { return c.n < 10; }); if (few) { S.S = NaN; S.sigma = NaN; } var Sth = E.Stheory(st.type, st.model, st.set.map(function (x) { return x * D; }));
				if (st.mode === "chsh") {
					$("qm-en-s").textContent = isFinite(S.S) ? f3(S.S) + " ± " + S.dS.toFixed(3) : tot.n ? "needs 10+ per setting" : "–";
					var sg = $("qm-en-sig");
					if (!isFinite(S.sigma)) sg.textContent = "–";
					else if (S.S > 2) sg.textContent = (S.sigma >= 0 ? S.sigma.toFixed(1) : "0") + " σ above 2" + (S.sigma > 5 ? ": Bell broken" : "");
					else sg.textContent = "≤ 2: no violation";
					$("qm-en-st").textContent = f3(Sth) + (st.model === "q" && Math.abs(Sth - E.TSIRELSON) < 1e-6 ? " = 2√2" : "");
				} else { $("qm-en-s").textContent = "CHSH mode only"; $("qm-en-sig").textContent = "–"; $("qm-en-st").textContent = f3(Sth); }
				$("qm-en-m").textContent = pct(tot.ap, tot.n) + " / " + pct(tot.bp, tot.n);
				$("qm-en-same").textContent = pct(tot.same, tot.n);
				// meter
				var fill = $("qm-en-mfill"), er = $("qm-en-merr");
				if (st.mode === "chsh" && isFinite(S.S)) {
					fill.style.width = Q.clamp(S.S / 4 * 100, 0, 100) + "%"; fill.className = S.S > 2 ? "qm-en-meter__over" : "";
					er.style.left = Q.clamp((S.S - S.dS) / 4 * 100, 0, 100) + "%"; er.style.width = Q.clamp(2 * S.dS / 4 * 100, 0, 100) + "%"; er.hidden = false;
				} else { fill.style.width = "0"; er.hidden = true; }
				// table
				var names = [["a", "b"], ["a", "b′"], ["a′", "b"], ["a′", "b′"]], idx = [[0, 2], [0, 3], [1, 2], [1, 3]], rows = "";
				if (st.mode === "chsh") {
					for (var i = 0; i < 4; i++) {
						var c = cells[i], a = st.set[idx[i][0]], b = st.set[idx[i][1]];
						rows += "<tr><td>" + names[i][0] + " = " + fmtA(a) + ", " + names[i][1] + " = " + fmtA(b) + "</td><td>" + fmtA(norm(b - a)) + "</td><td>" + c.n.toLocaleString("en-US") +
							"</td><td>" + [c.pp, c.pm, c.mp, c.mm].join(" / ") + "</td><td>" + (c.n ? f3(E.cellE(c)) + (c.n > 1 ? " ± " + E.cellErr(c).toFixed(3) : "") : "–") +
							"</td><td>" + f3(E.E(st.type, st.model, a * D, b * D)) + "</td></tr>";
					}
				} else {
					var a0 = st.set[0], b0 = st.set[2];
					rows = "<tr><td>a = " + fmtA(a0) + ", b = " + fmtA(b0) + "</td><td>" + fmtA(norm(b0 - a0)) + "</td><td>" + free.n.toLocaleString("en-US") + "</td><td>" + [free.pp, free.pm, free.mp, free.mm].join(" / ") +
						"</td><td>" + (free.n ? f3(E.cellE(free)) + (free.n > 1 ? " ± " + E.cellErr(free).toFixed(3) : "") : "–") + "</td><td>" + f3(E.E(st.type, st.model, a0 * D, b0 * D)) + "</td></tr>";
				}
				$("qm-en-tbl").tBodies[0].innerHTML = rows;
				// no-signalling
				var nr = "";
				if (st.mode === "chsh") [0, 1].forEach(function (x) { var m = marg[x]; nr += "<tr><td>Alice chose " + (x ? "a′ = " : "a = ") + fmtA(st.set[x]) + "</td><td>" + m[0].toLocaleString("en-US") + "</td><td><b>" + pct(m[1], m[0]) + "</b></td><td>" + pct(m[2], m[0]) + "</td></tr>"; });
				else Object.keys(margFree).map(function (k) { return margFree[k]; }).sort(function (u, v) { return u[3] - v[3]; }).slice(-8).forEach(function (m) {
					nr += "<tr><td>Alice&rsquo;s dial at " + fmtA(m[3]) + "</td><td>" + m[0].toLocaleString("en-US") + "</td><td><b>" + pct(m[1], m[0]) + "</b></td><td>" + pct(m[2], m[0]) + "</td></tr>";
				});
				$("qm-en-nst").tBodies[0].innerHTML = nr || '<tr><td colspan="4">No pairs yet</td></tr>';
				var la = "", lb = "", lc = "", sub = st.mode === "chsh";
				hist.forEach(function (h) { la += (h[0] > 0 ? "+" : "−") + (sub ? (h[2] ? "′" : " ") : "") + " "; lb += (h[1] > 0 ? "+" : "−") + (sub ? (h[3] ? "′" : " ") : "") + " "; lc += (h[0] === h[1] ? "=" : "≠") + (sub ? " " : "") + " "; });
				$("qm-en-la").textContent = la || " "; $("qm-en-lb").textContent = lb || " "; $("qm-en-lc").textContent = lc || " ";
				$("qm-en-badge").textContent = (st.type === "ph" ? "Photons" : "Electron spins") + " · " + (st.model === "q" ? "quantum" : st.model === "bell" ? "Bell 1964 hidden variables" : "shared polarization (local)") + " · " + (st.mode === "chsh" ? "CHSH test" : "fixed dials");
				drawPlot(); dirtyUI = false;
			}

			/* ---------- controls ---------- */
			var angIds = ["a0", "a1", "b0", "b1"];
			function syncControls() {
				$("qm-en-type").value = st.type; $("qm-en-model").value = st.model; $("qm-en-mode").value = st.mode; $("qm-en-rate").value = st.rate; $("qm-en-fly").checked = !!st.fly;
				var r = rate(); $("qm-en-ratev").textContent = r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString("en-US");
				angIds.forEach(function (id, i) { var rr = $("qm-en-" + id + "r"); rr.max = period(); rr.value = ((st.set[i] % period()) + period()) % period(); $("qm-en-" + id).value = Math.round(st.set[i] * 10) / 10; });
				$("qm-en-angles").classList.toggle("qm-en-free", st.mode !== "chsh");
				$("qm-en-qf").textContent = st.type === "ph" ? "cos 2(b − a)" : "−cos(b − a)";
				var o = E.optimal(st.type).map(function (x) { return fmtA(x / D); });
				$("qm-en-angnote").textContent = st.mode === "chsh"
					? "Best angles for " + (st.type === "ph" ? "photons" : "electron spins") + ": a = " + o[0] + ", a′ = " + o[1] + ", b = " + o[2] + ", b′ = " + o[3] + ". " + (st.type === "ph" ? "Polarizer angles repeat every 180°." : "Spin directions repeat every 360°.")
					: "Fixed dials: every pair is measured at a and b. Turn a dial to add points to the correlation curve below.";
			}
			function setAngle(i, v, quiet) {
				v = Math.round(v * 2) / 2; st.set[i] = v;
				if (st.mode === "chsh") { cells = E.newCounts(); marg = [[0, 0, 0], [0, 0, 0]]; } else free = E.newCounts()[0];
				if (!quiet) { syncControls(); api.save(); }
				dirtyUI = true;
			}
			angIds.forEach(function (id, i) {
				$("qm-en-" + id + "r").addEventListener("input", function () { setAngle(i, +this.value); });
				$("qm-en-" + id).addEventListener("change", function () { var v = parseFloat(this.value); if (isFinite(v)) setAngle(i, v); else syncControls(); });
			});
			function setPressed(p) { Array.prototype.forEach.call($("qm-en-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === p ? "true" : "false"); }); }
			$("qm-en-type").addEventListener("change", function () { st.type = this.value; st.set = E.optimal(st.type).map(function (x) { return x / D; }); resetData(); syncControls(); setPressed(""); api.save(); });
			$("qm-en-model").addEventListener("change", function () { st.model = this.value; resetData(); syncControls(); setPressed(""); api.save(); });
			$("qm-en-mode").addEventListener("change", function () { st.mode = this.value; resetData(true); syncControls(); setPressed(""); api.save(); });
			$("qm-en-rate").addEventListener("input", function () { st.rate = +this.value; syncControls(); api.save(); });
			$("qm-en-fly").addEventListener("change", function () { st.fly = this.checked; api.save(); });
			$("qm-en-opt").addEventListener("click", function () { st.set = E.optimal(st.type).map(function (x) { return x / D; }); if (st.mode !== "chsh") st.mode = "chsh"; resetData(true); syncControls(); api.save(); });
			$("qm-en-link").addEventListener("click", function () {
				var u = new URL(location.href); u.search = "";
				var p = { tab: "ent", en_t: st.type, en_m: st.model, en_mode: st.mode, en_a: st.set[0], en_ap: st.set[1], en_b: st.set[2], en_bp: st.set[3] };
				if (document.getElementById("qm").getAttribute("data-views").split(",")[0] === "ent") delete p.tab;
				Object.keys(p).forEach(function (k) { u.searchParams.set(k, p[k]); });
				api.copy(u.toString(), "Link copied");
			});
			$("qm-en-pre").addEventListener("click", function (e) {
				var b = e.target.closest("button"); if (!b) return; var p = b.dataset.p;
				if (p === "chsh") { st.model = "q"; st.mode = "chsh"; st.set = E.optimal(st.type).map(function (x) { return x / D; }); }
				else if (p === "same") { st.model = "q"; st.type = "ph"; st.mode = "free"; st.set = [30, 75, 30, 52.5]; }
				else if (p === "perp") { st.model = "q"; st.type = "ph"; st.mode = "free"; st.set = [0, 45, 90, 67.5]; }
				else if (p === "bell" || p === "malus") { st.model = p; st.mode = "chsh"; st.set = E.optimal(st.type).map(function (x) { return x / D; }); }
				else if (p === "el") { st.type = "el"; st.model = "q"; st.mode = "chsh"; st.set = E.optimal("el").map(function (x) { return x / D; }); }
				if (st.rate < 40) st.rate = 40;
				resetData(); syncControls(); setPressed(p); api.save(); setPlaying(true);
				if (p !== "same" && p !== "perp") burst(2000);
			});
			function setPlaying(v) { playing = v; var b = $("qm-en-play"); b.textContent = v ? "Pause" : "Play"; b.setAttribute("aria-pressed", v ? "true" : "false"); if (v) loop(); }
			$("qm-en-play").addEventListener("click", function () { setPlaying(!playing); });
			$("qm-en-one").addEventListener("click", function () { launch(performance.now() / 1000, true); if (!raf) loop(); });
			$("qm-en-burst").addEventListener("click", function () { burst(10000); updUI(); draw(performance.now() / 1000); });
			$("qm-en-reset").addEventListener("click", function () { resetData(); updUI(); draw(performance.now() / 1000); });
			function fs(wr) { if (document.fullscreenElement === wr) document.exitFullscreen(); else if (wr.requestFullscreen) wr.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); }
			$("qm-en-fs").addEventListener("click", function () { fs(wrap); });
			$("qm-en-pfs").addEventListener("click", function () { fs(pwrap); });
			document.addEventListener("fullscreenchange", function () { setTimeout(layout, 50); });

			/* ---------- dial dragging ---------- */
			var drag = null, hover = null;
			function sideAt(px, py) { var G = geo(); if (Math.hypot(px - G.xA, py - G.yc) < G.R * 1.35) return "A"; if (Math.hypot(px - G.xB, py - G.yc) < G.R * 1.35) return "B"; return null; }
			function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
			function angleFrom(side, px, py) {
				var G = geo(), x = side === "A" ? G.xA : G.xB, dx = px - x, dy = py - G.yc, a;
				if (st.type === "ph") { a = Math.atan2(-dy, dx) / D; a = ((a % 180) + 180) % 180; } else { a = Math.atan2(dx, -dy) / D; a = ((a % 360) + 360) % 360; }
				var snap = Math.round(a / 22.5) * 22.5; if (Math.abs(a - snap) < 2.5) a = snap;
				return a % period();
			}
			cv.addEventListener("touchstart", function (e) { var t = e.touches[0], p = pos(t); if (sideAt(p[0], p[1])) e.preventDefault(); }, { passive: false });
			cv.addEventListener("pointerdown", function (e) {
				var p = pos(e), s = sideAt(p[0], p[1]); if (!s) return;
				drag = { side: s, idx: st.mode === "chsh" ? lamp[s].idx : 0 }; cv.setPointerCapture(e.pointerId); e.preventDefault();
				setAngle((s === "A" ? 0 : 2) + drag.idx, angleFrom(s, p[0], p[1]), true); draw(performance.now() / 1000);
			});
			cv.addEventListener("pointermove", function (e) {
				var p = pos(e);
				if (!drag) { var h = sideAt(p[0], p[1]); if (h !== hover) { hover = h; cv.style.cursor = h ? "grab" : ""; if (!running || !playing) draw(performance.now() / 1000); } return; }
				setAngle((drag.side === "A" ? 0 : 2) + drag.idx, angleFrom(drag.side, p[0], p[1]), true); if (!playing) draw(performance.now() / 1000);
			});
			function endDrag() { if (!drag) return; drag = null; syncControls(); api.save(); dirtyUI = true; }
			cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
			cv.addEventListener("keydown", function (e) {   // arrows turn Alice's dial, Shift+arrows Bob's
				if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault();
				var i = e.shiftKey ? 2 : 0, d = (e.key === "ArrowRight" || e.key === "ArrowUp") ? 2.5 : -2.5; setAngle(i + (st.mode === "chsh" ? lamp[e.shiftKey ? "B" : "A"].idx : 0), st.set[i] + d);
				draw(performance.now() / 1000);
			});

			/* ---------- animation ---------- */
			function launch(now, force) { pulse = now; if (st.fly || force) flights.push({ t0: now, hue: Math.floor(rnd() * 360) }); else measure(now); }
			function frame(ts) {
				raf = 0; if (!running) return;
				var now = ts / 1000, dt = last ? Math.min(0.1, now - last) : 0; last = now;
				if (playing) {
					var r = rate(); carry += r * dt; var n = Math.floor(carry); carry -= n; n = Math.min(n, 4000);
					if (n > 0) {
						var animate = st.fly && r <= 40, k;
						if (animate) for (k = 0; k < n; k++) launch(now);
						else { for (k = 0; k < n - (st.fly ? 1 : 0); k++) measure(now); if (st.fly) launch(now); pulse = now; }
					}
				}
				for (var i = flights.length - 1; i >= 0; i--) if (now - flights[i].t0 >= TRAVEL) { flights.splice(i, 1); measure(now); }
				draw(now);
				if (dirtyUI && now - uiT > 0.15) { uiT = now; updUI(); }
				if (playing || flights.length || now - Math.max(lamp.A.t, pulse) < 0.6) raf = requestAnimationFrame(frame);
			}
			function loop() { if (running && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
			this._start = function () { running = true; layout(); updUI(); loop(); };
			this._stop = function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
			if (window.ResizeObserver) { new ResizeObserver(function () { if (running) layout(); }).observe(stage); new ResizeObserver(function () { if (running) layout(); }).observe(pstage); }
			window.addEventListener("resize", function () { if (running) layout(); });

			syncControls();
			window.MESQuantumDebug_ent = { run: function (n) { burst(n || 1000); updUI(); draw(performance.now() / 1000); return E.stats(cells); }, state: st,
				stats: function () { return { S: E.stats(cells), tot: tot, marg: marg }; }, frame: function (t) { running = true; frame(t || performance.now()); } };
		},
		show: function () { if (this._start) this._start(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();

/* MES Quantum Lab, tab "sg": a chain of up to four Stern-Gerlach magnets. Atoms are fired one by one (paths sampled from the exact
   quantum probabilities, MESQ.sg in lib-ent.js), hits pile up on a screen, the beam's spin is drawn under every gap.
   Link params: sg_s (1 = spin 1/2, 2 = spin 1), sg_src (oven | z | x), sg_m ("0:0,90:c,0:-": angle:pass, pass = output index, c = recombined, w = recombined + watched). */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var D = Math.PI / 180;

	Q.reg("sg", {
		init: function (panel, api) {
			var G = Q.sg, st = api.st, $ = function (id) { return document.getElementById(id); };
			function dflt() { st.spin = 1; st.src = "oven"; st.mags = [{ th: 0, pass: 0 }, { th: 90, pass: 0 }]; }
			if (!st.mags || !st.mags.length) dflt();
			if (st.rate == null) st.rate = 40;
			var q = api.query;
			if (q.get("sg_s") === "1" || q.get("sg_s") === "2") st.spin = +q.get("sg_s");
			if (/^(oven|z|x)$/.test(q.get("sg_src") || "")) st.src = q.get("sg_src");
			if (q.get("sg_m")) {
				var mm = q.get("sg_m").split(",").slice(0, 4).map(function (s) { var p = s.split(":"), th = parseFloat(p[0]); return { th: isFinite(th) ? th : 0, pass: p[1] === "c" ? "coh" : p[1] === "w" ? "peek" : (parseInt(p[1], 10) || 0) }; });
				if (mm.length) st.mags = mm;
			}
			function fixPass() { var n = G.dim(st.spin); st.mags.forEach(function (m) { if (typeof m.pass === "number" && (m.pass < 0 || m.pass >= n)) m.pass = 0; }); }
			fixPass();

			var cv = $("qm-sg-cv"), ctx = cv.getContext("2d"), stage = $("qm-sg-stage"), wrap = $("qm-sg-wrap");
			var W = 700, H = 380, dpr = 1, running = false, raf = 0, last = 0, carry = 0, beam = false, rnd = Q.rng((Date.now() % 1e9) | 7);
			var atoms = [], hits = [], cnt, theory, sel = 0, dirty = true, uiT = 0;
			function resetCounts() { cnt = { fired: 0, spots: [0, 0, 0], blocked: 0, block: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], cl: 0 }; hits = []; atoms = []; dirty = true; }
			resetCounts();
			function mags() { return st.mags.map(function (m) { return { th: m.th * D, pass: m.pass }; }); }
			function classical() { return st.cl && st.mags.length === 1; }
			function recompute() { theory = G.theory(st.spin, st.src, mags()); }
			recompute();
			function rate() { return st.rate <= 0 ? 0.5 : 0.5 * Math.pow(10, st.rate / 25); }

			/* ---------- geometry ---------- */
			function runPad(stg) { var r = stg.querySelector(".qm-run"); if (!r) return [0, 0]; var cs = getComputedStyle(r), h = r.offsetHeight + 8; return cs.top === "auto" || parseFloat(cs.top) > stg.clientHeight / 2 ? [0, h] : [0, 0]; }
			var PAD = [0, 0];
			function geo() {
				var n = st.mags.length, xSrc = Math.max(34, W * 0.06), xScr = W - Math.max(22, W * 0.035), x0 = xSrc + Math.max(30, W * 0.06), x1 = xScr - Math.max(56, W * 0.13);
				var cell = (x1 - x0) / n, mw = Math.min(120, cell * 0.5), xs = [];
				for (var k = 0; k < n; k++) xs.push(x0 + (k + 0.5) * cell);
				var t0 = PAD[0], h = H - PAD[0] - PAD[1], yc = t0 + h * 0.52, dy = h * 0.08, wide = W > 600;
				return { n: n, xSrc: xSrc, xScr: xScr, xs: xs, mw: mw, cell: cell, yc: yc, dy: dy, yd: t0 + Math.max(wide ? 82 : 46, h * (wide ? 0.21 : 0.13)), rd: Math.max(13, Math.min(24, h * 0.065, mw * 0.4)), yb: t0 + h - Math.max(30, h * 0.11), rb: Math.max(11, Math.min(20, h * 0.055, cell * 0.17)) };
			}
			function off(g, m) { var n = G.dim(st.spin); return n === 2 ? (m === 0 ? -g.dy : g.dy) : (m - 1) * g.dy; }
			function gapEnd(g, k) { return k + 1 < g.n ? g.xs[k + 1] - g.mw / 2 : g.xScr; }

			/* ---------- tracks ---------- */
			function buildTrack(res, clU) {
				var g = geo(), legs = [], k, x = g.xSrc + 16, ndim = G.dim(st.spin), ms;
				legs.push({ x0: x, x1: g.xs[0] - g.mw / 2, paths: [[[x, g.yc], [g.xs[0] - g.mw / 2, g.yc]]] });
				for (k = 0; k < g.n; k++) {
					var xin = g.xs[k] - g.mw / 2, xe = g.xs[k] + g.mw / 2, o = res.out[k], lastM = k === g.n - 1, xn = gapEnd(g, k), gap = xn - xe;
					if (lastM) {
						var oy = clU != null ? clU * Math.abs(off(g, 0)) * (ndim === 3 ? 1 : 1) : off(g, o);
						legs.push({ x0: xin, x1: g.xScr, paths: [[[xin, g.yc], [xe, g.yc + oy], [g.xScr, g.yc + oy * 2.2]]] });
						return { legs: legs, xEnd: g.xScr, spot: res.spot, cl: clU };
					}
					if (o === "coh") {
						var ps = []; for (ms = 0; ms < ndim; ms++) { var oo = off(g, ms); ps.push([[xin, g.yc], [xe, g.yc + oo], [xe + gap * 0.3, g.yc + oo], [xe + gap * 0.62, g.yc], [xn, g.yc]]); }
						legs.push({ x0: xin, x1: xn, paths: ps, ghost: true }); continue;
					}
					var oy2 = off(g, o);
					if (res.block === k) { legs.push({ x0: xin, x1: xe + gap * 0.22, paths: [[[xin, g.yc], [xe, g.yc + oy2], [xe + gap * 0.22, g.yc + oy2]]] }); return { legs: legs, xEnd: xe + gap * 0.22, block: k, o: o }; }
					legs.push({ x0: xin, x1: xn, paths: [[[xin, g.yc], [xe, g.yc + oy2], [xe + gap * 0.3, g.yc + oy2], [xe + gap * 0.62, g.yc], [xn, g.yc]]] });
				}
				return { legs: legs, xEnd: x };
			}
			function yAt(pts, x) { for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i], u = b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 1; return a[1] + (b[1] - a[1]) * u; } return pts[pts.length - 1][1]; }
			function sampleOne() {
				if (classical()) { var u = G.classical(rnd); return { res: { out: [0], block: -1, spot: -1 }, cl: u }; }
				return { res: G.sample(st.spin, st.src, mags(), rnd), cl: null };
			}
			function land(res, cl) {
				if (cl != null) { cnt.cl++; hits.push({ cl: cl, jx: Q.gauss(rnd), jy: Q.gauss(rnd) }); }
				else if (res.spot >= 0) { cnt.spots[res.spot]++; hits.push({ m: res.spot, jx: Q.gauss(rnd), jy: Q.gauss(rnd) }); }
				else if (res.block >= 0) { cnt.blocked++; cnt.block[res.block][res.out[res.block]]++; }
				if (hits.length > 5000) hits.splice(0, hits.length - 5000);
				dirty = true;
			}
			function fireAnimated() { var s = sampleOne(); cnt.fired++; var tr = buildTrack(s.res, s.cl); atoms.push({ x: tr.legs[0].x0, tr: tr, res: s.res, cl: s.cl, seed: rnd() }); dirty = true; }
			function fireInstant(n) { for (var i = 0; i < n; i++) { var s = sampleOne(); cnt.fired++; land(s.res, s.cl); } }

			/* ---------- drawing ---------- */
			function angTxt(th) { th = ((Math.round(th * 10) / 10) % 360 + 360) % 360; return th === 0 ? "Z" : th === 90 ? "X" : th === 180 ? "−Z" : th === 270 ? "−X" : th + "°"; }
			function draw() {
				var g = ctx, P = geo(), ndim = G.dim(st.spin), labels = G.labels(st.spin), k, m;
				g.setTransform(dpr, 0, 0, dpr, 0, 0);
				var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#090d1c"); bg.addColorStop(1, "#05070f"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
				var fs = Math.max(10, Math.min(13, H * 0.035, P.cell * 0.11));
				g.font = fs + "px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
				// oven
				g.fillStyle = "#3b2414"; g.strokeStyle = "#f97316"; g.lineWidth = 1.5; var ow = Math.max(22, P.xSrc * 0.7), oh = Math.max(30, H * 0.12);
				g.fillRect(P.xSrc - ow / 2, P.yc - oh / 2, ow, oh); g.strokeRect(P.xSrc - ow / 2, P.yc - oh / 2, ow, oh);
				g.fillStyle = "#fdba74"; g.fillText(st.src === "oven" ? "oven" : "prep.", P.xSrc, P.yc + oh / 2 + fs);
				if (st.src !== "oven") g.fillText(st.src === "z" ? "↑ Z" : "→ X", P.xSrc, P.yc - oh / 2 - fs);
				// static beam guides (theory: faint where atoms can go)
				var T = theory, beamCol = "rgba(148,163,184,";
				g.lineWidth = 2;
				for (k = 0; k < P.n; k++) {
					var xin = P.xs[k] - P.mw / 2, xe = P.xs[k] + P.mw / 2, xn = gapEnd(P, k), gap = xn - xe, sk = T.stages[k], lastM = k === P.n - 1, pass = st.mags[k].pass;
					var xprev = k ? P.xs[k - 1] + P.mw / 2 : P.xSrc + ow / 2;
					if (sk.arrive > 1e-9) { g.strokeStyle = beamCol + "0.35)"; g.beginPath(); g.moveTo(k ? xprev + (xin - xprev) * 0.62 : xprev, P.yc); g.lineTo(xin, P.yc); g.stroke(); }
					for (m = 0; m < ndim; m++) {
						var oy = off(P, m), alive = sk.arrive * sk.p[m] > 1e-9; if (classical()) alive = false;
						g.strokeStyle = beamCol + (alive ? "0.35)" : "0.08)");
						g.beginPath(); g.moveTo(xin, P.yc); g.lineTo(xe, P.yc + oy);
						if (lastM) g.lineTo(P.xScr, P.yc + oy * 2.2);
						else if (pass === "coh" || pass === "peek" || pass === m) { g.lineTo(xe + gap * 0.3, P.yc + oy); g.lineTo(xe + gap * 0.62, P.yc); }
						else g.lineTo(xe + gap * 0.22, P.yc + oy);
						g.stroke();
						if (!lastM && typeof pass === "number" && pass !== m) {   // blocker
							var bx = xe + gap * 0.22, bh = Math.max(10, P.dy * 0.55);
							g.fillStyle = "#3f1d1d"; g.fillRect(bx, P.yc + oy - bh / 2, 6, bh); g.fillStyle = "#f87171"; g.fillRect(bx, P.yc + oy - bh / 2, 2, bh);
							var nb = cnt.block[k][m]; if (nb) { g.fillStyle = "#fca5a5"; g.textAlign = "left"; g.fillText(nb.toLocaleString("en-US"), bx + 9, P.yc + oy); g.textAlign = "center"; }
						}
						if (!lastM && P.mw > 34) { g.fillStyle = "#94a3b8"; g.fillText(labels[m].replace("½", ""), xe + Math.max(9, gap * 0.08), P.yc + oy - fs * 0.9); }
					}
					if (!lastM && (pass === "coh" || pass === "peek")) {   // recombiner
						var rx = xe + gap * 0.46; g.strokeStyle = "#64748b"; g.lineWidth = 1; g.strokeRect(rx - gap * 0.16, P.yc - P.dy * 1.25, gap * 0.32, P.dy * 2.5); g.lineWidth = 2;
						g.fillStyle = pass === "peek" ? "#fbbf24" : "#94a3b8"; g.fillText(pass === "peek" ? "watched" : "recombine", rx, P.yc - P.dy * 1.25 - fs * 0.8);
						if (pass === "peek") { g.strokeStyle = "#fbbf24"; g.beginPath(); g.ellipse(rx, P.yc + P.dy * 1.25 + fs * 0.9, fs * 0.75, fs * 0.42, 0, 0, 2 * Math.PI); g.stroke(); g.beginPath(); g.arc(rx, P.yc + P.dy * 1.25 + fs * 0.9, fs * 0.2, 0, 2 * Math.PI); g.fill(); }
					}
				}
				// magnets
				for (k = 0; k < P.n; k++) {
					var x = P.xs[k], mh = P.dy * 2 + Math.max(24, H * 0.1), th = st.mags[k].th;
					var mg = g.createLinearGradient(0, P.yc - mh / 2, 0, P.yc + mh / 2); mg.addColorStop(0, "#7f1d1d"); mg.addColorStop(0.42, "#2b3350"); mg.addColorStop(0.58, "#2b3350"); mg.addColorStop(1, "#1e3a8a");
					g.globalAlpha = 0.85; g.fillStyle = mg; g.fillRect(x - P.mw / 2, P.yc - mh / 2, P.mw, mh); g.globalAlpha = 1;
					g.strokeStyle = k === sel ? "#a5b4fc" : "#475569"; g.lineWidth = k === sel ? 2 : 1; g.strokeRect(x - P.mw / 2, P.yc - mh / 2, P.mw, mh);
					g.fillStyle = "#e2e8f0"; g.fillText((P.mw > 60 ? "magnet " : "") + (k + 1), x, P.yc + mh / 2 + fs);
					// dial
					var yd = P.yd, rd = P.rd;
					g.fillStyle = "#0f1530"; g.beginPath(); g.arc(x, yd, rd, 0, 2 * Math.PI); g.fill(); g.strokeStyle = hover === k ? "#a5b4fc" : "#3a4466"; g.lineWidth = hover === k ? 2.5 : 1.5; g.stroke();
					var dx = Math.sin(th * D), dyy = -Math.cos(th * D);
					g.strokeStyle = "#c7d2fe"; g.lineWidth = 3; g.lineCap = "round"; g.beginPath(); g.moveTo(x - dx * rd * 0.55, yd - dyy * rd * 0.55); g.lineTo(x + dx * rd * 0.8, yd + dyy * rd * 0.8); g.stroke();
					g.fillStyle = "#c7d2fe"; g.beginPath(); var hx = x + dx * rd * 0.95, hy = yd + dyy * rd * 0.95, s2 = rd * 0.3; g.moveTo(hx, hy); g.lineTo(hx - dx * s2 - dyy * s2 * 0.6, hy - dyy * s2 + dx * s2 * 0.6); g.lineTo(hx - dx * s2 + dyy * s2 * 0.6, hy - dyy * s2 - dx * s2 * 0.6); g.closePath(); g.fill();
					g.fillStyle = "#e7ebf6"; g.font = "700 " + Math.round(fs * 1.05) + "px system-ui, sans-serif"; g.fillText(angTxt(th), x, yd - rd - fs * 0.9); g.font = fs + "px system-ui, sans-serif";
				}
				// spin of the beam arriving at each magnet
				for (k = 0; k < P.n; k++) {
					var bx2 = P.xs[k] - P.mw / 2 - Math.min(P.cell * 0.25, Math.max(P.rb + 4, (P.cell - P.mw) * 0.5)), by = P.yb, rb = P.rb, sk2 = T.stages[k];
					if (k === 0) bx2 = Math.max(rb + 4, (P.xSrc + ow / 2 + P.xs[0] - P.mw / 2) / 2);
					g.strokeStyle = "#334155"; g.lineWidth = 1; g.beginPath(); g.arc(bx2, by, rb, 0, 2 * Math.PI); g.stroke();
					g.beginPath(); g.moveTo(bx2, by - rb); g.lineTo(bx2, by + rb); g.moveTo(bx2 - rb, by); g.lineTo(bx2 + rb, by); g.strokeStyle = "#1e293b"; g.stroke();
					if (sk2.arrive < 1e-9) { g.fillStyle = "#64748b"; g.fillText("none", bx2, by); continue; }
					var v = sk2.vec;
					if (v.len < 0.02) { g.fillStyle = "#facc15"; g.beginPath(); g.arc(bx2, by, 3, 0, 2 * Math.PI); g.fill(); g.fillStyle = "#94a3b8"; g.fillText(sk2.amp ? "no net spin" : "mixed", bx2, by + rb + fs * 0.9); }
					else {
						var ex = bx2 + v.x * rb, ey = by - v.z * rb; g.strokeStyle = "#facc15"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(bx2, by); g.lineTo(ex, ey); g.stroke();
						g.fillStyle = "#facc15"; g.beginPath(); g.arc(ex, ey, 3, 0, 2 * Math.PI); g.fill();
						if (!sk2.amp) { g.fillStyle = "#94a3b8"; g.fillText("partly mixed", bx2, by + rb + fs * 0.9); }
					}
				}
				// screen
				var sw = Math.max(8, W * 0.012); g.fillStyle = "#11172b"; g.fillRect(P.xScr - sw / 2, P.yc - P.dy * 3.2, sw, P.dy * 6.4); g.strokeStyle = "#475569"; g.lineWidth = 1; g.strokeRect(P.xScr - sw / 2, P.yc - P.dy * 3.2, sw, P.dy * 6.4);
				if (classical()) { g.fillStyle = "rgba(244,114,182,0.12)"; g.fillRect(P.xScr - sw * 1.6, P.yc - Math.abs(off(P, 0)) * 2.2, sw * 3.2, Math.abs(off(P, 0)) * 4.4); }
				var sig = Math.max(1.5, P.dy * 0.16), alpha = Math.max(0.25, Math.min(0.9, 400 / (hits.length + 1)));
				g.fillStyle = "rgba(226,232,240," + alpha + ")";
				for (var i = 0; i < hits.length; i++) { var h = hits[i], yy = h.cl != null ? P.yc + h.cl * Math.abs(off(P, 0)) * 2.2 + h.jy * sig * 0.4 : P.yc + off(P, h.m) * 2.2 + h.jy * sig; g.fillRect(P.xScr + h.jx * sw * 0.22 - 1, yy - 1, 2, 2); }
				// spot counts
				var done = cnt.spots[0] + cnt.spots[1] + cnt.spots[2];
				g.textAlign = "right"; g.fillStyle = "#e2e8f0";
				if (!classical()) for (m = 0; m < ndim; m++) {
					var yy2 = P.yc + off(P, m) * 2.2, txt = cnt.spots[m].toLocaleString("en-US") + (done ? " (" + (100 * cnt.spots[m] / done).toFixed(1) + "%)" : "");
					g.fillText(txt, P.xScr - sw - 6, yy2 + (ndim === 3 && m === 1 ? fs * 1.1 : (off(P, m) < 0 ? -fs * 1.1 : fs * 1.1)));
				}
				else if (cnt.cl) { g.fillText(cnt.cl.toLocaleString("en-US") + " atoms: a smear", P.xScr - sw - 6, P.yc - P.dy * 3.2 - fs * 0.2); }
				g.textAlign = "center";
				// atoms in flight
				for (i = 0; i < atoms.length; i++) {
					var a = atoms[i], leg = null; for (var L = 0; L < a.tr.legs.length; L++) if (a.x <= a.tr.legs[L].x1) { leg = a.tr.legs[L]; break; }
					if (!leg) continue;
					leg.paths.forEach(function (pts) {
						var y = yAt(pts, a.x), r = leg.ghost ? 3.2 : 3.5; g.globalAlpha = leg.ghost ? 0.5 : 1;
						g.fillStyle = "rgba(226,232,240,0.25)"; g.beginPath(); g.arc(a.x, y, r * 2.2, 0, 2 * Math.PI); g.fill();
						g.fillStyle = leg.ghost ? "#c4b5fd" : "#f1f5f9"; g.beginPath(); g.arc(a.x, y, r, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;
					});
				}
			}

			/* ---------- HTML ---------- */
			function pc(x) { return (100 * x).toFixed(x < 0.0995 && x > 0 ? 2 : 1).replace(/\.0+$/, "") + "%"; }
			function updUI() {
				var T = theory, ndim = G.dim(st.spin), labels = G.labels(st.spin), done = cnt.spots[0] + cnt.spots[1] + cnt.spots[2] + cnt.blocked;
				$("qm-sg-n").textContent = cnt.fired.toLocaleString("en-US");
				if (classical()) {
					$("qm-sg-thr").textContent = cnt.cl ? "100%" : "–"; $("qm-sg-thrt").textContent = "100%";
					$("qm-sg-spots").textContent = cnt.cl ? "a continuous smear" : "–"; $("qm-sg-spotst").textContent = "classical: a smear (real atoms: 2 spots)";
				} else {
					var reach = cnt.spots[0] + cnt.spots[1] + cnt.spots[2];
					$("qm-sg-thr").textContent = done ? reach.toLocaleString("en-US") + " (" + pc(reach / done) + ")" : "–";
					$("qm-sg-thrt").textContent = pc(T.through) + " of all atoms";
					var a = [], b = []; for (var m = 0; m < ndim; m++) { a.push(labels[m] + " " + (reach ? pc(cnt.spots[m] / reach) : "–")); b.push(labels[m] + " " + (T.through > 1e-12 ? pc(T.screen[m] / T.through) : "–")); }
					$("qm-sg-spots").textContent = a.join(" · "); $("qm-sg-spotst").textContent = b.join(" · ");
				}
				var rows = "";
				T.stages.forEach(function (s, k) {
					var mg = st.mags[k], beamTxt = s.arrive < 1e-12 ? "none" : !s.amp ? (s.vec.len < 0.02 ? "unpolarized mixture" : "partly mixed") : (s.vec.len < 0.02 ? "pure, no net spin" : "pure, spin at " + angTxt(Math.round(((Math.atan2(s.vec.x, s.vec.z) / D) % 360 + 360) % 360 * 10) / 10));
					var amp = s.amp ? s.amp.map(function (x, m) { return labels[m] + ": " + Q.fmt(Math.abs(x) < 1e-12 ? 0 : x, 3).replace("-", "−"); }).join(", ") : "–";
					var pr = s.arrive < 1e-12 ? "–" : s.p.map(function (x, m) { return labels[m] + ": " + pc(x); }).join(", ");
					rows += "<tr><td>" + (k + 1) + "</td><td>" + angTxt(mg.th) + "</td><td>" + beamTxt + "</td><td>" + amp + "</td><td>" + pr + "</td><td>" + pc(s.arrive) + "</td></tr>";
				});
				$("qm-sg-tbl").tBodies[0].innerHTML = rows;
				$("qm-sg-badge").textContent = (st.spin === 1 ? "Spin ½" : "Spin 1") + " · " + (st.src === "oven" ? "hot oven" : st.src === "z" ? "prepared ↑ Z" : "prepared → X") + (classical() ? " · classical prediction" : "");
				dirty = false;
			}
			function passLabel(p, ndim) { var L = G.labels(st.spin); return typeof p === "number" ? "Let " + L[p] + " through" + (ndim === 2 ? " (block " + L[1 - p] + ")" : "") : p === "coh" ? "Recombine all (nothing records the path)" : "Recombine, but watch which path"; }
			function buildRows() {
				var box = $("qm-sg-mags"), ndim = G.dim(st.spin), h = "";
				st.mags.forEach(function (mg, k) {
					var last = k === st.mags.length - 1, opts = "";
					if (!last) { for (var m = 0; m < ndim; m++) opts += '<option value="' + m + '">' + passLabel(m, ndim) + "</option>"; opts += '<option value="coh">' + passLabel("coh") + '</option><option value="peek">' + passLabel("peek") + "</option>"; }
					else opts = "<option>All outputs go to the screen</option>";
					h += '<div class="qm-sg-mrow"><b>Magnet ' + (k + 1) + '</b><input type="range" min="0" max="360" step="1" data-k="' + k + '" class="qm-sg-ang" aria-label="Magnet ' + (k + 1) + ' angle"><input type="number" step="1" data-k="' + k + '" class="qm-sg-angn tu-input" aria-label="Magnet ' + (k + 1) + ' angle in degrees"><span>&deg;</span>' +
						'<select data-k="' + k + '" class="qm-sg-pass tu-input" aria-label="Magnet ' + (k + 1) + ' outputs"' + (last ? " disabled" : "") + ">" + opts + "</select></div>";
				});
				box.innerHTML = h; syncControls();
			}
			function syncControls() {
				$("qm-sg-spin").value = st.spin; $("qm-sg-src").value = st.src; $("qm-sg-rate").value = st.rate; $("qm-sg-cnt").textContent = st.mags.length; $("qm-sg-cl").checked = !!st.cl;
				$("qm-sg-cl").disabled = st.mags.length !== 1; $("qm-sg-clwrap").style.opacity = st.mags.length === 1 ? "" : "0.55";
				var r = rate(); $("qm-sg-ratev").textContent = r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString("en-US");
				st.mags.forEach(function (mg, k) {
					var a = panel.querySelector('.qm-sg-ang[data-k="' + k + '"]'), n = panel.querySelector('.qm-sg-angn[data-k="' + k + '"]'), s = panel.querySelector('.qm-sg-pass[data-k="' + k + '"]');
					if (a) a.value = mg.th; if (n && document.activeElement !== n) n.value = mg.th; if (s && k < st.mags.length - 1) s.value = String(mg.pass);
				});
				$("qm-sg-beam").textContent = beam ? "Beam off" : "Beam on"; $("qm-sg-beam").setAttribute("aria-pressed", beam ? "true" : "false");
			}
			function changed(rows) { fixPass(); recompute(); resetCounts(); if (rows) buildRows(); else syncControls(); api.save(); updUI(); draw(); setPressed(null); }
			function setPressed(p) { Array.prototype.forEach.call($("qm-sg-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === p ? "true" : "false"); }); }
			function setAngle(k, v) { v = Math.round(v); v = ((v % 360) + 360) % 360; if (st.mags[k].th === v) return; st.mags[k].th = v; fixPass(); recompute(); resetCounts(); syncControls(); dirty = true; draw(); }
			$("qm-sg-mags").addEventListener("input", function (e) { var t = e.target, k = +t.dataset.k; if (t.classList.contains("qm-sg-ang")) { sel = k; setAngle(k, +t.value); api.save(); } });
			$("qm-sg-mags").addEventListener("change", function (e) {
				var t = e.target, k = +t.dataset.k;
				if (t.classList.contains("qm-sg-angn")) { var v = parseFloat(t.value); if (isFinite(v)) { setAngle(k, v); api.save(); updUI(); } }
				if (t.classList.contains("qm-sg-pass")) { st.mags[k].pass = t.value === "coh" || t.value === "peek" ? t.value : +t.value; changed(false); }
			});
			$("qm-sg-spin").addEventListener("change", function () { st.spin = +this.value; changed(true); });
			$("qm-sg-src").addEventListener("change", function () { st.src = this.value; changed(false); });
			$("qm-sg-rate").addEventListener("input", function () { st.rate = +this.value; syncControls(); api.save(); });
			$("qm-sg-cl").addEventListener("change", function () { st.cl = this.checked; changed(false); });
			$("qm-sg-plus").addEventListener("click", function () { if (st.mags.length >= 4) { api.toast("Up to four magnets"); return; } var lastM = st.mags[st.mags.length - 1]; lastM.pass = lastM.pass == null ? 0 : lastM.pass; st.mags.push({ th: 0, pass: 0 }); changed(true); });
			$("qm-sg-minus").addEventListener("click", function () { if (st.mags.length <= 1) return; st.mags.pop(); changed(true); });
			$("qm-sg-link").addEventListener("click", function () {
				var u = new URL(location.href); u.search = "";
				if ($("qm").getAttribute("data-views").split(",")[0] !== "sg") u.searchParams.set("tab", "sg");
				u.searchParams.set("sg_s", st.spin); u.searchParams.set("sg_src", st.src);
				u.searchParams.set("sg_m", st.mags.map(function (m) { return m.th + ":" + (m.pass === "coh" ? "c" : m.pass === "peek" ? "w" : m.pass); }).join(","));
				api.copy(u.toString(), "Link copied");
			});
			var PRE = {
				"1922": { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }] }, zz: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 0, pass: 0 }] },
				zx: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: 0 }] }, zxz: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: 0 }, { th: 0, pass: 0 }] },
				coh: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: "coh" }, { th: 0, pass: 0 }] }, peek: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: "peek" }, { th: 0, pass: 0 }] },
				z60: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 60, pass: 0 }] }, s1: { spin: 2, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: 0 }] }
			};
			$("qm-sg-pre").addEventListener("click", function (e) {
				var b = e.target.closest("button"); if (!b) return; var p = PRE[b.dataset.p]; if (!p) return;
				st.spin = p.spin; st.src = p.src; st.mags = JSON.parse(JSON.stringify(p.mags)); st.cl = false; sel = 0;
				changed(true); setPressed(b.dataset.p); setBeam(true);
			});
			function setBeam(v) { beam = v; syncControls(); if (v) loop(); }
			$("qm-sg-beam").addEventListener("click", function () { setBeam(!beam); });
			$("qm-sg-one").addEventListener("click", function () { fireAnimated(); loop(); });
			$("qm-sg-k").addEventListener("click", function () { fireInstant(1000); updUI(); draw(); });
			$("qm-sg-reset").addEventListener("click", function () { resetCounts(); updUI(); draw(); });
			$("qm-sg-fs").addEventListener("click", function () { if (document.fullscreenElement === wrap) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); });
			document.addEventListener("fullscreenchange", function () { setTimeout(layout, 50); });

			/* ---------- pointer: dials and outputs ---------- */
			var drag = null, hover = null;
			function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
			function dialAt(px, py) { var P = geo(); for (var k = 0; k < P.n; k++) if (Math.hypot(px - P.xs[k], py - P.yd) < P.rd * 1.5) return k; return -1; }
			function outputAt(px, py) {
				var P = geo(), ndim = G.dim(st.spin);
				for (var k = 0; k < P.n - 1; k++) { var xe = P.xs[k] + P.mw / 2, gap = gapEnd(P, k) - xe; if (px < xe - 4 || px > xe + gap * 0.4) continue; for (var m = 0; m < ndim; m++) if (Math.abs(py - (P.yc + off(P, m))) < Math.max(10, P.dy * 0.45)) return [k, m]; }
				return null;
			}
			function angleAt(k, px, py) { var P = geo(), a = Math.atan2(px - P.xs[k], -(py - P.yd)) / D; a = ((a % 360) + 360) % 360; var sn = Math.round(a / 15) * 15; if (Math.abs(a - sn) < 3) a = sn; return a; }
			cv.addEventListener("touchstart", function (e) { var p = pos(e.touches[0]); if (dialAt(p[0], p[1]) >= 0) e.preventDefault(); }, { passive: false });
			cv.addEventListener("pointerdown", function (e) {
				var p = pos(e), k = dialAt(p[0], p[1]);
				if (k >= 0) { drag = k; sel = k; cv.setPointerCapture(e.pointerId); e.preventDefault(); setAngle(k, angleAt(k, p[0], p[1])); return; }
				var o = outputAt(p[0], p[1]);
				if (o) { var mg = st.mags[o[0]]; mg.pass = mg.pass === o[1] ? "coh" : o[1]; sel = o[0]; changed(false); }
			});
			cv.addEventListener("pointermove", function (e) {
				var p = pos(e);
				if (drag != null) { setAngle(drag, angleAt(drag, p[0], p[1])); return; }
				var k = dialAt(p[0], p[1]), o = k < 0 ? outputAt(p[0], p[1]) : null, h = k >= 0 ? k : null;
				cv.style.cursor = k >= 0 ? "grab" : o ? "pointer" : "";
				if (h !== hover) { hover = h; if (!raf) draw(); }
			});
			function endDrag() { if (drag == null) return; drag = null; api.save(); updUI(); }
			cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
			cv.addEventListener("keydown", function (e) {
				if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setAngle(sel, st.mags[sel].th + (e.key === "ArrowRight" ? 5 : -5)); api.save(); updUI(); }
				else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : st.mags.length - 1)) % st.mags.length; draw(); }
				else if (e.key === " " || e.key === "Enter") { e.preventDefault(); fireAnimated(); loop(); }
			});

			/* ---------- layout + loop ---------- */
			function layout() {
				dpr = Math.min(2, window.devicePixelRatio || 1); W = stage.clientWidth || 700;
				PAD = runPad(stage); var nat = Math.round(Q.clamp(W * 0.5, 320, 470)) + PAD[0] + PAD[1];
				if (document.fullscreenElement === wrap) { var other = 0; Array.prototype.forEach.call(wrap.children, function (c) { if (c !== stage) other += c.offsetHeight; }); H = Math.max(260, window.innerHeight - other); }
				else H = Math.round(window.MESStage ? window.MESStage.sh(stage, nat) : nat);
				stage.style.height = H + "px"; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				atoms.forEach(function (a) { var f = (a.x - a.tr.legs[0].x0) / Math.max(1, a.tr.xEnd - a.tr.legs[0].x0); a.tr = buildTrack(a.res, a.cl); a.x = a.tr.legs[0].x0 + f * (a.tr.xEnd - a.tr.legs[0].x0); });
				draw();
			}
			function frame(ts) {
				raf = 0; if (!running) return;
				var now = ts / 1000, dt = last ? Math.min(0.1, now - last) : 0; last = now;
				if (beam) {
					var r = rate(); carry += r * dt; var n = Math.min(4000, Math.floor(carry)); carry -= n;
					if (n > 0) { if (r <= 30 && atoms.length < 80) { for (var i = 0; i < n; i++) fireAnimated(); } else { fireInstant(n - 1); fireAnimated(); } }
				}
				var v = W / 1.7;
				for (var j = atoms.length - 1; j >= 0; j--) { var a = atoms[j]; a.x += v * dt; if (a.x >= a.tr.xEnd) { atoms.splice(j, 1); land(a.res, a.cl); } }
				draw();
				if (dirty && now - uiT > 0.15) { uiT = now; updUI(); }
				if (beam || atoms.length) raf = requestAnimationFrame(frame); else if (dirty) updUI();
			}
			function loop() { if (running && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
			this._start = function () { running = true; layout(); updUI(); loop(); };
			this._stop = function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
			if (window.ResizeObserver) new ResizeObserver(function () { if (running) layout(); }).observe(stage);
			window.addEventListener("resize", function () { if (running) layout(); });
			buildRows();
			window.MESQuantumDebug_sg = { fire: function (n) { fireInstant(n || 1000); updUI(); draw(); return { cnt: cnt, theory: theory }; }, state: st, theory: function () { return theory; },
				step: function (sec) { var t = performance.now(); running = true; last = t; frame(t + (sec || 0.1) * 1000); } };
		},
		show: function () { if (this._start) this._start(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();

/* ui-atom: the "Hydrogen atom" tab (orbital slice / 3D cloud / radial probability, energy levels with electron jumps and the spectrum). Physics in lib-atom.js (MESQ.atom). */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var A, api, P, st, cv, ctx, stage, wrap, lcv, lctx, lstage, lwrap, raf = 0, on = false;
	var S = { n: 3, l: 2, m: 0, cplx: false, Z: 1, view: "slice", plane: "xz", zoom: 1, off: 0, gam: 0.5, pts: 12000, spin: true, nodes: true, showR: false, air: true, red: true, lev: 2 };
	var cache = { key: "", img: null, max: 1 }, cloud = null, cloudKey = "", yaw = 0.6, pitch = 0.35, dragging = null, hov = null, seed = 1;
	var jump = null, lastT = 0, lastJ = null, lastAB = null, W = 0, H = 0, LW = 0, LH = 0, dpr = 1;
	function $(id) { return document.getElementById(id); }
	function M() { return S.red ? A.MASS[["", "H", "He", "Li"][S.Z]] : Infinity; }
	function ext() { return A.radiusFor(S.n, S.l, 0.992, S.Z) * 1.08 / S.zoom; }

	/* ---------- controls ---------- */
	function fillSel(sel, lo, hi, val, fmt) { var h = ""; for (var i = lo; i <= hi; i++) h += '<option value="' + i + '"' + (i === val ? " selected" : "") + ">" + (fmt ? fmt(i) : i) + "</option>"; sel.innerHTML = h; }
	function syncSel() {
		fillSel($("qm-at-n"), 1, A.NMAX, S.n);
		fillSel($("qm-at-l"), 0, S.n - 1, S.l, function (l) { return l + " (" + A.letter(l) + ")"; });
		fillSel($("qm-at-m"), -S.l, S.l, S.m, function (m) { return m < 0 ? "−" + (-m) : String(m); });
		$("qm-at-cplx").checked = S.cplx; $("qm-at-z").value = String(S.Z);
		Array.prototype.forEach.call(P.querySelectorAll("#qm-at-chips button"), function (b) { var o = b.dataset.o.split(",").map(Number); b.setAttribute("aria-pressed", o[0] === S.n && o[1] === S.l && o[2] === S.m && !S.cplx ? "true" : "false"); });
	}
	function setOrb(n, l, m) {
		n = Q.clamp(n | 0, 1, A.NMAX); l = Q.clamp(l | 0, 0, n - 1); m = Q.clamp(m | 0, -l, l);
		S.n = n; S.l = l; S.m = m; syncSel(); changed();
	}
	function changed() {
		cache.key = ""; info(); persist(); draw();
	}
	function persist() {
		Object.keys(S).forEach(function (k) { st[k] = S[k]; }); api.save();
	}
	function info() {
		var nm = A.name(S.n, S.l, S.m, S.cplx), nd = A.nodes(S.n, S.l), E = A.energy(S.n, S.Z, M());
		var rmp = A.mostLikely(S.n, S.l, S.Z), rav = A.meanR(S.n, S.l, S.Z);
		$("qm-at-name").innerHTML = "<b>" + nm + "</b> &nbsp;·&nbsp; n = " + S.n + ", l = " + S.l + ", m = " + (S.m < 0 ? "−" + (-S.m) : S.m) + (S.Z > 1 ? " &nbsp;·&nbsp; Z = " + S.Z : "") +
			" &nbsp;·&nbsp; " + nd.radial + " radial + " + nd.angular + " angular = " + nd.total + " node" + (nd.total === 1 ? "" : "s");
		$("qm-at-ro-e").textContent = E.toFixed(4) + " eV";
		$("qm-at-ro-rmp").textContent = rmp.toFixed(3) + " a₀ = " + Q.si(rmp * Q.C.a0, "m");
		$("qm-at-ro-rav").textContent = rav.toFixed(2) + " a₀ = " + Q.si(rav * Q.C.a0, "m");
		$("qm-at-ro-rn").textContent = nd.radial + (nd.radial ? " (spheres)" : "");
		$("qm-at-ro-an").textContent = nd.angular + (nd.angular ? (S.cplx && S.m !== 0 && S.l === Math.abs(S.m) ? " (z axis)" : " (planes / cones)") : "");
		var v = S.view;
		Array.prototype.forEach.call(P.querySelectorAll("#qm-at-stage .qm-run [data-v]"), function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); });
		$("qm-at-plane").hidden = v !== "slice";
		Array.prototype.forEach.call(P.querySelectorAll(".qm-at-only-slice"), function (e) { e.hidden = v !== "slice"; });
		Array.prototype.forEach.call(P.querySelectorAll(".qm-at-only-cloud"), function (e) { e.hidden = v !== "cloud"; });
		Array.prototype.forEach.call(P.querySelectorAll(".qm-at-only-radial"), function (e) { e.hidden = v !== "radial"; });
		$("qm-at-resample").hidden = v !== "cloud";
		cv.style.touchAction = v === "cloud" ? "none" : "pan-y";
		var L = ext();
		$("qm-at-zoom-v").textContent = "view " + (2 * L).toFixed(1) + " a₀ wide";
		$("qm-at-off-v").textContent = (S.off * L).toFixed(1) + " a₀";
		$("qm-at-gam-v").textContent = S.gam <= 0.3 ? "high" : S.gam >= 0.9 ? "true |ψ|²" : S.gam.toFixed(2);
		$("qm-at-pts-v").textContent = S.pts.toLocaleString("en-US");
		var leg = S.cplx ? '<span><i style="background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"></i>phase of ψ (colour wheel)</span>' :
			'<span><i style="background:#ff9a3c"></i>ψ positive</span><span><i style="background:#4a9bff"></i>ψ negative</span>';
		if (v === "slice") leg += '<span>brightness = |ψ|² (contrast ' + S.gam.toFixed(2) + ')</span>' + (S.nodes && !S.cplx ? '<span><i style="background:#fff"></i>node, ψ = 0</span>' : "");
		if (v === "cloud") leg = leg + "<span>each dot = one place the electron could be found · drag to turn</span>";
		if (v === "radial") leg = '<span><i style="background:#22d3ee"></i>P(r) = r²R²</span><span><i style="background:#facc15"></i>most likely r</span><span><i style="background:#f472b6"></i>average ⟨r⟩</span><span><i style="background:#a3e635"></i>Bohr orbit n²a₀/Z</span>' + (S.showR ? '<span><i style="background:#c4b5fd"></i>R(r)</span>' : "");
		$("qm-at-legend").innerHTML = leg;
		$("qm-at-hint").textContent = v === "slice" ? (S.l > 0 && S.plane === "xy" && S.m === 0 && !S.cplx && (S.l & 1) ? "This orbital has a node in the x-y plane, so this slice is dark: try the x-z plane or move the slice." : "Tip: a p_z orbital has nothing in the x-y plane (it is a node). Move the slice to see the lobes appear.")
			: v === "cloud" ? "Drag to turn the cloud (on a phone: one finger). Every dot is drawn at random with probability |ψ|², so dense regions are where the electron is most often found."
				: "Hover the curve to read the chance of finding the electron inside that radius.";
	}

	/* ---------- sizing ---------- */
	function full(w) { return document.fullscreenElement === w || w.classList.contains("mes-fill"); }
	function size() {
		dpr = Math.min(2, window.devicePixelRatio || 1);
		var w = wrap.clientWidth || 600, nat = w < 600 ? Math.max(320, w) : Math.max(300, Math.min(w * 0.66, 640)), h = full(wrap) ? (window.MESStage && MESStage.fillH ? MESStage.fillH(wrap) : innerHeight - 140) : (window.MESStage ? MESStage.sh(stage, nat) : nat);
		h = Math.round(h); stage.style.height = h + "px";
		if (W !== w || H !== h) { W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cache.key = ""; }
		var lw = lwrap.clientWidth || 600, lnat = lw < 600 ? 470 : Math.max(380, Math.min(lw * 0.5, 520)), lh = full(lwrap) ? (window.MESStage && MESStage.fillH ? MESStage.fillH(lwrap) : innerHeight - 140) : (window.MESStage ? MESStage.sh(lstage, lnat) : lnat);
		lh = Math.round(lh); lstage.style.height = lh + "px";
		if (LW !== lw || LH !== lh) { LW = lw; LH = lh; lcv.width = Math.round(lw * dpr); lcv.height = Math.round(lh * dpr); }
	}

	/* ---------- slice ---------- */
	function planeMap(u, v, o) { /* screen (u right, v up) + offset -> x, y, z */
		return S.plane === "xz" ? [u, o, v] : S.plane === "xy" ? [u, v, o] : [o, u, v];
	}
	var AX = { xz: ["x", "z", "y"], xy: ["x", "y", "z"], yz: ["y", "z", "x"] };
	function renderSlice() {
		var L = ext(), key = [S.n, S.l, S.m, S.cplx, S.Z, S.plane, S.zoom, S.off, S.gam, S.nodes, W, H].join("|");
		if (cache.key !== key) {
			var gk = [S.n, S.l, S.m, S.cplx, S.Z].join("|");
			if (cache.gk !== gk) { cache.gk = gk; cache.gmax = globalMax(); }
			var cell = Math.max(1, Math.ceil(Math.max(W, H) / 300)), gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
			var sc = L / (Math.min(W, H) / 2) * cell, f = A.psiFn(S.n, S.l, S.m, S.cplx, S.Z), o = [0, 0], off = S.off * L;
			var re = new Float32Array(gw * gh), im = new Float32Array(gw * gh), mx = 0, i, j, k;
			for (j = 0; j < gh; j++) { var vv = (gh / 2 - j - 0.5) * sc; for (i = 0; i < gw; i++) { var p = planeMap((i + 0.5 - gw / 2) * sc, vv, off); f(p[0], p[1], p[2], o); k = j * gw + i; re[k] = o[0]; im[k] = o[1]; var d = o[0] * o[0] + o[1] * o[1]; if (d > mx) mx = d; } }
			var isNode = mx < 1e-9 * cache.gmax; if (isNode) mx = cache.gmax;
			var oc = cache.oc || (cache.oc = document.createElement("canvas")); oc.width = gw; oc.height = gh;
			var octx = oc.getContext("2d"), id = octx.createImageData(gw, gh), px = id.data;
			for (k = 0; k < gw * gh; k++) {
				var dd = (re[k] * re[k] + im[k] * im[k]) / (mx || 1), b = Math.pow(dd, S.gam), c;
				if (S.cplx) c = Q.phaseRGB(Math.atan2(im[k], re[k]), b);
				else c = re[k] >= 0 ? [255 * b, 154 * b, 60 * b] : [74 * b, 155 * b, 255 * b];
				px[4 * k] = c[0]; px[4 * k + 1] = c[1]; px[4 * k + 2] = c[2]; px[4 * k + 3] = 255;
			}
			if (S.nodes && !S.cplx) for (j = 0; j < gh - 1; j++) for (i = 0; i < gw - 1; i++) { k = j * gw + i; if (re[k] * re[k + 1] < 0 || re[k] * re[k + gw] < 0) { px[4 * k] = Math.max(px[4 * k], 150); px[4 * k + 1] = Math.max(px[4 * k + 1], 150); px[4 * k + 2] = Math.max(px[4 * k + 2], 150); } }
			octx.putImageData(id, 0, 0);
			cache.key = key; cache.max = mx; cache.node = isNode; cache.gw = gw; cache.gh = gh; cache.cell = cell;
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, cv.width, cv.height);
		ctx.imageSmoothingEnabled = true; ctx.drawImage(cache.oc, 0, 0, cache.gw * cache.cell * dpr, cache.gh * cache.cell * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var ax = AX[S.plane], s = (Math.min(W, H) / 2) / L;
		ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
		ctx.fillStyle = "rgba(231,235,246,0.85)"; ctx.font = "13px system-ui,sans-serif"; ctx.fillText(ax[0] + " →", W - 34, H / 2 - 6); ctx.fillText("↑ " + ax[1], W / 2 + 6, 46);
		scaleBar(s);
		if (cache.node) { ctx.fillStyle = "#e7ebf6"; ctx.font = "15px system-ui,sans-serif"; var msg = "ψ = 0 everywhere in this plane: it is a node.", msg2 = "Move the slice or pick another plane."; ctx.fillText(msg, W / 2 - ctx.measureText(msg).width / 2, H / 2 - 30); ctx.fillText(msg2, W / 2 - ctx.measureText(msg2).width / 2, H / 2 - 10); }
		else { ctx.fillStyle = "rgba(231,235,246,0.7)"; ctx.font = "11px system-ui,sans-serif"; var pc = "brightest point here = " + Math.max(0.1, 100 * cache.max / cache.gmax).toFixed(cache.max / cache.gmax < 0.1 ? 1 : 0) + "% of the atom's peak"; ctx.fillText(pc, W - ctx.measureText(pc).width - 10, W < 600 ? 70 : H - 14); }
		$("qm-at-badge").textContent = A.name(S.n, S.l, S.m, S.cplx) + " · slice " + ax[0] + "-" + ax[1] + (S.off ? " at " + ax[2] + " = " + (S.off * L).toFixed(1) + " a₀" : " through the nucleus");
		if (hov) {
			var u = (hov.x - W / 2) / s, v = (H / 2 - hov.y) / s, pp = planeMap(u, v, S.off * L), o2 = A.psiFn(S.n, S.l, S.m, S.cplx, S.Z)(pp[0], pp[1], pp[2], [0, 0]);
			var d2 = o2[0] * o2[0] + o2[1] * o2[1];
			$("qm-at-ro-hov").textContent = ax[0] + " = " + u.toFixed(1) + ", " + ax[1] + " = " + v.toFixed(1) + " a₀ · |ψ|² " + (100 * d2 / (cache.max || 1)).toFixed(0) + "% of max" + (S.cplx ? "" : (o2[0] >= 0 ? " (+)" : " (−)"));
		}
	}
	/* largest |psi|^2 anywhere (coarse 3D grid + refinement around the best point), so a slice can say how bright it is compared with the whole atom */
	function globalMax() {
		var f = A.psiFn(S.n, S.l, S.m, S.cplx, S.Z), o = [0, 0], L = A.radiusFor(S.n, S.l, 0.99, S.Z), N = 28, best = 0, bx = 0, by = 0, bz = 0, h = 2 * L / N, i, j, k;
		for (i = 0; i <= N; i++) for (j = 0; j <= N; j++) for (k = 0; k <= N; k++) { var x = -L + i * h, y = -L + j * h, z = -L + k * h; f(x, y, z, o); var d = o[0] * o[0] + o[1] * o[1]; if (d > best) { best = d; bx = x; by = y; bz = z; } }
		for (var it = 0; it < 30; it++) { h *= 0.7; var nb = best, nx = bx, ny = by, nz = bz; for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) for (k = -1; k <= 1; k++) { f(bx + i * h, by + j * h, bz + k * h, o); var d2 = o[0] * o[0] + o[1] * o[1]; if (d2 > nb) { nb = d2; nx = bx + i * h; ny = by + j * h; nz = bz + k * h; } } best = nb; bx = nx; by = ny; bz = nz; }
		return best;
	}
	function scaleBar(s) {
		var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200], target = W * 0.18 / s, len = nice[0];
		nice.forEach(function (v) { if (v <= target) len = v; });
		var px = len * s, x = 14, y = W < 600 ? H - 58 : H - 18;
		ctx.strokeStyle = "#e7ebf6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + px, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4); ctx.stroke();
		ctx.fillStyle = "#e7ebf6"; ctx.font = "12px system-ui,sans-serif"; ctx.fillText(len + " a₀ = " + Q.si(len * Q.C.a0, "m"), x, y - 8);
	}

	/* ---------- 3D cloud ---------- */
	function ensureCloud() {
		var key = [S.n, S.l, S.m, S.cplx, S.Z, S.pts, seed].join("|");
		if (cloudKey !== key) { cloud = A.sample(S.n, S.l, S.m, S.cplx, S.pts, seed, S.Z); cloudKey = key; }
	}
	function renderCloud() {
		ensureCloud();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var L = ext() * 0.95, s = (Math.min(W, H) / 2) / L, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), N = cloud.x.length;
		/* axes */
		var axes = [[1, 0, 0, "x"], [0, 1, 0, "y"], [0, 0, 1, "z"]];
		function proj(x, y, z) { var X = x * cy - y * sy, Y = x * sy + y * cy; var Zs = z * cp - Y * sp, D = z * sp + Y * cp; return [W / 2 + X * s, H / 2 - Zs * s, D]; }
		ctx.lineWidth = 1; ctx.font = "13px system-ui,sans-serif";
		axes.forEach(function (a) { var p0 = proj(-a[0] * L * 0.9, -a[1] * L * 0.9, -a[2] * L * 0.9), p1 = proj(a[0] * L * 0.9, a[1] * L * 0.9, a[2] * L * 0.9); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.fillStyle = "rgba(231,235,246,0.8)"; ctx.fillText(a[3], p1[0] + 4, p1[1]); });
		ctx.globalCompositeOperation = "lighter";
		var ds = Math.max(1.2, Math.min(2.6, 2.4 * Math.sqrt(12000 / N) * Math.min(W, H) / 600)), al = Math.max(0.18, Math.min(0.75, 0.55 * Math.sqrt(12000 / N)));
		var bins = S.cplx ? 12 : 2, groups = [];
		for (var b = 0; b < bins; b++) groups.push([]);
		for (var i = 0; i < N; i++) { var g = S.cplx ? Math.floor(((cloud.s[i] / (2 * Math.PI)) % 1 + 1) % 1 * 12) % 12 : (cloud.s[i] > 0 ? 0 : 1); groups[g].push(i); }
		for (b = 0; b < bins; b++) {
			var c = S.cplx ? Q.phaseRGB((b + 0.5) / 12 * 2 * Math.PI, 1) : b === 0 ? [255, 154, 60] : [74, 155, 255];
			var arr = groups[b];
			for (var t = 0; t < arr.length; t++) {
				var k = arr[t], p = proj(cloud.x[k], cloud.y[k], cloud.z[k]), dep = 0.55 + 0.45 * Q.clamp(0.5 - p[2] / (2 * L), 0, 1);
				ctx.fillStyle = "rgba(" + Math.round(c[0] * dep) + "," + Math.round(c[1] * dep) + "," + Math.round(c[2] * dep) + "," + al + ")";
				ctx.fillRect(p[0] - ds / 2, p[1] - ds / 2, ds, ds);
			}
		}
		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(W / 2, H / 2, 2.2, 0, 7); ctx.fill();
		scaleBar(s);
		$("qm-at-badge").textContent = A.name(S.n, S.l, S.m, S.cplx) + " · " + N.toLocaleString("en-US") + " random positions";
	}

	/* ---------- radial ---------- */
	function renderRadial() {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var rmax = A.radiusFor(S.n, S.l, 0.999, S.Z) * 1.05 / S.zoom, pl = 56, pr = 18, pt = 74, pb = W < 600 ? 92 : 46, gw = W - pl - pr, gh = H - pt - pb, N = 600, i, pmax = 0, rr = [];
		for (i = 0; i <= N; i++) { var r = rmax * i / N, p = A.P(S.n, S.l, r, S.Z); rr.push(p); if (p > pmax) pmax = p; }
		var rmp = A.mostLikely(S.n, S.l, S.Z); pmax = Math.max(pmax, A.P(S.n, S.l, rmp, S.Z)) * 1.12;
		var X = function (r) { return pl + r / rmax * gw; }, Y = function (p) { return pt + gh - p / pmax * gh; };
		/* grid + ticks */
		ctx.strokeStyle = "#273049"; ctx.fillStyle = "#9aa6c0"; ctx.font = "12px system-ui,sans-serif"; ctx.lineWidth = 1;
		var step = [0.5, 1, 2, 5, 10, 20, 50, 100].filter(function (v) { return rmax / v <= 10; })[0] || 100;
		for (var t = 0; t <= rmax + 1e-9; t += step) { var x = X(t); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + gh); ctx.stroke(); ctx.fillText(String(+t.toFixed(1)), x - 6, pt + gh + 16); }
		ctx.fillText("r (a₀ = " + Q.si(Q.C.a0, "m") + ")", pl + gw / 2 - 40, pt + gh + 34);
		ctx.save(); ctx.translate(16, pt + gh / 2 + 40); ctx.rotate(-Math.PI / 2); ctx.fillText("P(r)  per a₀", 0, 0); ctx.restore();
		ctx.strokeStyle = "#5a6588"; ctx.beginPath(); ctx.moveTo(pl, pt); ctx.lineTo(pl, pt + gh); ctx.lineTo(pl + gw, pt + gh); ctx.stroke();
		/* filled curve, inside-r shading when hovering */
		var hr = hov ? Q.clamp((hov.x - pl) / gw * rmax, 0, rmax) : -1;
		ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (i = 0; i <= N; i++) ctx.lineTo(X(rmax * i / N), Y(rr[i])); ctx.lineTo(X(rmax), Y(0)); ctx.closePath();
		ctx.fillStyle = "rgba(34,211,238,0.14)"; ctx.fill();
		if (hr >= 0) { ctx.save(); ctx.beginPath(); ctx.rect(pl, pt, X(hr) - pl, gh); ctx.clip(); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (i = 0; i <= N; i++) ctx.lineTo(X(rmax * i / N), Y(rr[i])); ctx.lineTo(X(rmax), Y(0)); ctx.fillStyle = "rgba(34,211,238,0.38)"; ctx.fill(); ctx.restore(); }
		ctx.beginPath(); for (i = 0; i <= N; i++) { var xx = X(rmax * i / N), yy = Y(rr[i]); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2.2; ctx.stroke();
		if (S.showR) {
			var rv = [], rmx = 0; for (i = 0; i <= N; i++) { var v = A.R(S.n, S.l, Math.max(rmax * i / N, 1e-9), S.Z); rv.push(v); rmx = Math.max(rmx, Math.abs(v)); }
			ctx.beginPath(); for (i = 0; i <= N; i++) { var y2 = pt + gh / 2 - rv[i] / rmx * gh * 0.45; if (i) ctx.lineTo(X(rmax * i / N), y2); else ctx.moveTo(X(0), y2); }
			ctx.setLineDash([5, 4]); ctx.strokeStyle = "#c4b5fd"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
			ctx.strokeStyle = "rgba(196,181,253,0.3)"; ctx.beginPath(); ctx.moveTo(pl, pt + gh / 2); ctx.lineTo(pl + gw, pt + gh / 2); ctx.stroke();
		}
		function vline(r, col, label, row) { if (r > rmax) return; var x = X(r); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + gh); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.font = "12px system-ui,sans-serif"; var tw = ctx.measureText(label).width; ctx.fillText(label, Math.max(4, Math.min(x + 4, W - pr - tw)), pt - 36 + 14 * row); }
		var rav = A.meanR(S.n, S.l, S.Z), bo = S.n * S.n / S.Z;
		var same = Math.abs(bo - rmp) < 1e-3 * bo;
		vline(rmp, "#facc15", "most likely " + rmp.toFixed(2) + (same ? " a₀ = Bohr's n²a₀/Z" : ""), 0);
		vline(rav, "#f472b6", "⟨r⟩ " + rav.toFixed(2), 1);
		if (!same) vline(bo, "#a3e635", "Bohr " + +bo.toFixed(2), 2);
		A.radialNodes(S.n, S.l, S.Z).forEach(function (r) { if (r <= rmax) { ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(X(r), Y(0), 3.5, 0, 7); ctx.fill(); } });
		$("qm-at-badge").textContent = A.name(S.n, S.l, S.m, S.cplx) + " · radial probability (white dots: radial nodes)";
		if (hr >= 0) {
			ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(X(hr), pt); ctx.lineTo(X(hr), pt + gh); ctx.stroke();
			$("qm-at-ro-hov").textContent = "r = " + hr.toFixed(2) + " a₀: inside " + (100 * A.inside(S.n, S.l, hr, S.Z)).toFixed(1) + "%";
		}
	}

	function draw() {
		if (!cv) return;
		if (S.view === "slice") renderSlice(); else if (S.view === "cloud") renderCloud(); else renderRadial();
		drawLevels();
	}

	/* ---------- energy levels ---------- */
	var NL = 7;
	function lv() {
		var top = 30, specH = Math.max(130, Math.min(180, LH * 0.36)), bot = LH - specH - 18, left = 70, right = Math.min(LW * 0.55, LW - 150);
		if (LW < 520) right = LW - 120;
		return { top: top, bot: bot, left: left, right: right, specH: specH, E1: A.energy(1, S.Z, M()) };
	}
	function yOf(E, g) { return g.top + Math.sqrt(Math.max(0, E / g.E1)) * (g.bot - g.top); } /* E = 0 at top, E1 at bottom; square-root scale so the upper levels do not pile up */
	function drawLevels() {
		if (!lctx) return;
		var g = lv(), c = lctx, i;
		c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#070a14"; c.fillRect(0, 0, LW, LH);
		c.font = "12px system-ui,sans-serif";
		/* ionization line */
		c.strokeStyle = "rgba(231,235,246,0.35)"; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(g.left, g.top); c.lineTo(g.right, g.top); c.stroke(); c.setLineDash([]);
		c.fillStyle = "#9aa6c0"; c.fillText("n = ∞   0 eV (free electron)", g.left + 4, g.top - 6);
		for (i = 1; i <= NL; i++) {
			var E = A.energy(i, S.Z, M()), y = yOf(E, g), sel = i === S.lev;
			c.strokeStyle = sel ? "#facc15" : "#7b88ad"; c.lineWidth = sel ? 3 : 1.6; c.beginPath(); c.moveTo(g.left, y); c.lineTo(g.right, y); c.stroke();
			if (i === 1 || yOf(A.energy(i - 1, S.Z, M()), g) - y > 15) { c.fillStyle = sel ? "#facc15" : "#e7ebf6"; c.fillText("n = " + i, 10, y + 4); c.fillStyle = "#9aa6c0"; var lab = E.toFixed(2) + " eV"; c.fillText(lab, g.right - c.measureText(lab).width, y - 5); }
		}
		/* electron + jump animation */
		var ex = g.left + (g.right - g.left) * 0.42, ey = yOf(S.lev ? A.energy(S.lev, S.Z, M()) : 0, g);
		if (jump) {
			var t = Q.clamp(jump.t, 0, 1), ya = yOf(jump.a ? A.energy(jump.a, S.Z, M()) : 0, g), yb = yOf(jump.b ? A.energy(jump.b, S.Z, M()) : 0, g);
			var te = Q.clamp(t / 0.35, 0, 1); ey = ya + (yb - ya) * (te * te * (3 - 2 * te));
			c.strokeStyle = "rgba(250,204,21,0.5)"; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(ex, ya); c.lineTo(ex, yb); c.stroke(); c.setLineDash([]);
			/* photon */
			var col = photonCol(jump.tr.lamVac), y0 = (ya + yb) / 2, x0 = ex + 14, x1 = LW - 20, lam = Math.max(6, Math.min(26, Math.log10(jump.tr.lamVac * 1e9) * 7 - 8));
			var head = jump.tr.emit ? x0 + (x1 - x0) * Q.clamp((t - 0.15) / 0.85, 0, 1) : x1 - (x1 - x0) * Q.clamp(t / 0.35, 0, 1);
			var tail = jump.tr.emit ? Math.max(x0, head - 140) : Math.min(x1, head + 140);
			if (jump.tr.emit ? t > 0.15 : t < 0.35) {
				c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath();
				for (var x = Math.min(head, tail); x <= Math.max(head, tail); x += 1.5) { var yy = y0 + 9 * Math.sin((x - head) / lam * 2 * Math.PI); if (x === Math.min(head, tail)) c.moveTo(x, yy); else c.lineTo(x, yy); }
				c.stroke();
				c.fillStyle = col; c.font = "bold 13px system-ui,sans-serif"; c.fillText((jump.tr.emit ? "photon out: " : "photon in: ") + lamText(jump.tr), Math.max(x0, Math.min(Math.max(head, tail) - 120, LW - 200)), y0 + 28);
			}
		}
		c.fillStyle = "#facc15"; c.beginPath(); c.arc(ex, ey, 6, 0, 7); c.fill(); c.strokeStyle = "#070a14"; c.lineWidth = 1.5; c.stroke();
		c.fillStyle = "#9aa6c0"; c.font = "11px system-ui,sans-serif"; c.fillText("spacing on a square-root scale", 10, g.top + 14); c.font = "12px system-ui,sans-serif"; c.fillText("click a level: the electron jumps there", g.left, g.bot + 18 > LH - g.specH - 4 ? g.bot - 8 : g.bot + 16);
		drawSpectrum(g);
	}
	function photonCol(lv) { var rgb = A.wavelengthRGB(lv * 1e9); return rgb ? "rgb(" + rgb.join(",") + ")" : lv < 380e-9 ? "#c4b5fd" : "#fb923c"; }
	function lamText(tr) { var l = S.air ? tr.lamAir : tr.lamVac; return (l * 1e9 >= 1000 ? (l * 1e6).toFixed(3) + " µm" : (l * 1e9).toFixed(2) + " nm"); }
	function drawSpectrum(g) {
		var c = lctx, y0 = LH - g.specH, h1 = g.specH * 0.42, x0 = 12, x1 = LW - 12, lo = Math.log10(80), hi = Math.log10(4200);
		var X = function (nm) { return x0 + (Math.log10(nm) - lo) / (hi - lo) * (x1 - x0); };
		c.fillStyle = "#0c1020"; c.fillRect(0, y0 - 8, LW, g.specH + 8);
		c.font = "11px system-ui,sans-serif"; c.fillStyle = "#9aa6c0";
		c.fillText("Whole spectrum (log scale): ultraviolet · visible · infrared", x0, y0 + 6);
		var yb = y0 + 12;
		/* visible band on log strip */
		for (var nm = 380; nm <= 750; nm += 2) { var rgb = A.wavelengthRGB(nm); c.fillStyle = "rgba(" + rgb.join(",") + ",0.35)"; c.fillRect(X(nm), yb, X(nm + 2) - X(nm) + 0.5, h1); }
		c.strokeStyle = "#273049"; c.strokeRect(x0, yb, x1 - x0, h1);
		[100, 200, 500, 1000, 2000, 4000].forEach(function (t) { c.fillStyle = "#9aa6c0"; c.fillText(t >= 1000 ? t / 1000 + " µm" : t + " nm", X(t) - 12, yb + h1 + 12); });
		var sel = jump ? jump.tr : lastJ, Z = S.Z, Mm = M();
		for (var nl = 1; nl <= 4; nl++) for (var up = nl + 1; up <= 9; up++) {
			var tr = A.transition(up, nl, Z, Mm), l = (S.air ? tr.lamAir : tr.lamVac) * 1e9; if (l < 80 || l > 4200) continue;
			var hit = sel && sel.lower === nl && sel.upper === up;
			c.strokeStyle = hit ? "#ffffff" : nl === 1 ? "#a78bfa" : nl === 2 ? photonCol(tr.lamVac) : nl === 3 ? "#fb923c" : "#f87171"; c.lineWidth = hit ? 3 : 1.4;
			c.beginPath(); c.moveTo(X(l), yb + 2); c.lineTo(X(l), yb + h1 - 2); c.stroke();
		}
		[["Lyman", 1], ["Balmer", 2], ["Paschen", 3], ["Brackett", 4]].forEach(function (s) { var a = A.transition(s[1] + 1, s[1], Z, Mm).lamVac * 1e9, b = A.seriesLimit(s[1], Z, Mm) * 1e9; var xm = X(Math.sqrt(a * b)); c.fillStyle = "#e7ebf6"; c.font = "11px system-ui,sans-serif"; var tw = c.measureText(s[0]).width; if (xm - tw / 2 > x0 && xm + tw / 2 < x1) c.fillText(s[0], xm - tw / 2, yb + h1 - 4); });
		/* visible spectroscope strip */
		var y2 = yb + h1 + 34, h2 = Math.max(22, g.specH - h1 - 48), v0 = 380, v1 = 750, XV = function (nm) { return x0 + (nm - v0) / (v1 - v0) * (x1 - x0); };
		c.fillStyle = "#000"; c.fillRect(x0, y2, x1 - x0, h2);
		for (var k = 3; k <= 9; k++) {
			var tb = A.transition(k, 2, Z, Mm);
			var lb = (S.air ? tb.lamAir : tb.lamVac) * 1e9; if (lb < v0 || lb > v1) continue;
			var rgb2 = A.wavelengthRGB(lb), hit2 = sel && sel.lower === 2 && sel.upper === k;
			c.fillStyle = "rgb(" + rgb2.join(",") + ")"; c.shadowColor = c.fillStyle; c.shadowBlur = hit2 ? 14 : 6; c.fillRect(XV(lb) - (hit2 ? 2.5 : 1.5), y2 + 2, hit2 ? 5 : 3, h2 - 4); c.shadowBlur = 0;
			if (k <= 6 || hit2) { c.fillStyle = "#e7ebf6"; c.font = "11px system-ui,sans-serif"; var t2 = lb.toFixed(1); c.fillText(t2, Math.min(XV(lb) + 4, x1 - 34), y2 + h2 - 4); }
		}
		c.fillStyle = "#9aa6c0"; c.font = "11px system-ui,sans-serif"; c.fillText("What a spectroscope shows: the visible (Balmer) lines of " + (Z === 1 ? "hydrogen" : Z === 2 ? "He⁺" : "Li²⁺"), x0, y2 - 4);
	}
	function doJump(a, b) {
		if (a === b) return;
		var tr = trOf(a, b);
		jump = { a: a, b: b, t: 0, tr: tr }; lastJ = tr; lastAB = [a, b]; S.lev = a; showJump(tr, a, b);
		if (!raf && on) loop();
	}
	function trOf(a, b) { return b === 0 ? ionTr(a) : A.transition(a, b, S.Z, M()); }
	function ionTr(a) { var e = -A.energy(a, S.Z, M()), lv2 = Q.C.h * Q.C.c / (e * Q.C.e); return { dE: e, lamVac: lv2, lamAir: A.toAir(lv2), f: e * Q.C.e / Q.C.h, emit: false, series: A.seriesName(a) + " limit (ionization)", lower: a, upper: 99, band: A.band(lv2) }; }
	function showJump(tr, a, b) {
		$("qm-at-ro-j").textContent = (a) + " → " + (b === 0 ? "∞" : b) + (tr.emit ? " (emits)" : " (absorbs)");
		$("qm-at-ro-de").textContent = tr.dE.toFixed(4) + " eV";
		$("qm-at-ro-lam").innerHTML = lamText(tr) + ' <i class="qm-at-sw" style="background:' + photonCol(tr.lamVac) + '"></i>' + (S.air && tr.lamVac >= 2e-7 ? " air" : " vacuum");
		$("qm-at-ro-f").textContent = Q.si(tr.f, "Hz");
		$("qm-at-ro-ser").textContent = tr.series + " · " + tr.band;
		Array.prototype.forEach.call(P.querySelectorAll("#qm-at-jchips button"), function (bt) { bt.setAttribute("aria-pressed", bt.dataset.j === a + "," + b ? "true" : "false"); });
	}
	function levelAt(y) {
		var g = lv(); if (Math.abs(y - g.top) < 10) return 0;
		var best = -1, bd = 14; for (var i = 1; i <= NL; i++) { var d = Math.abs(y - yOf(A.energy(i, S.Z, M()), g)); if (d < bd) { bd = d; best = i; } }
		return best;
	}

	/* ---------- animation ---------- */
	function loop(t) {
		raf = 0; if (!on) return;
		var dt = lastT && t ? Math.min(0.05, (t - lastT) / 1000) : 0.016; lastT = t || 0;
		var need = false;
		if (S.view === "cloud" && S.spin && !dragging) { yaw += dt * 0.35; need = true; }
		if (jump) { jump.t += dt / 2.2; need = true; if (jump.t >= 1) { S.lev = jump.b; jump = null; persist(); } }
		if (need) { if (S.view === "cloud") renderCloud(); drawLevels(); raf = requestAnimationFrame(loop); }
	}
	function kick() { if (on && !raf) raf = requestAnimationFrame(loop); }

	/* ---------- link ---------- */
	function linkObj() { return { at_n: S.n, at_l: S.l, at_m: S.m, at_c: S.cplx ? 1 : null, at_z: S.Z > 1 ? S.Z : null, at_v: S.view === "slice" ? null : S.view, at_p: S.plane === "xz" ? null : S.plane }; }

	function fsBtn(btn, w) { btn.addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); }); }

	Q.reg("atom", {
		init: function (panel, a) {
			api = a; P = panel; st = a.st; A = Q.atom;
			Object.keys(S).forEach(function (k) { if (st[k] != null && typeof st[k] === typeof S[k]) S[k] = st[k]; });
			var q = a.query, gi = function (k) { var v = q.get(k); return v == null ? null : parseInt(v, 10); };
			if (gi("at_n") != null) { S.n = gi("at_n"); S.l = gi("at_l") || 0; S.m = gi("at_m") || 0; S.cplx = q.get("at_c") === "1"; }
			if (gi("at_z")) S.Z = Q.clamp(gi("at_z"), 1, 3);
			if (q.get("at_v") && /^(slice|cloud|radial)$/.test(q.get("at_v"))) S.view = q.get("at_v");
			if (q.get("at_p") && /^(xz|xy|yz)$/.test(q.get("at_p"))) S.plane = q.get("at_p");
			if (!A.valid(S.n, S.l, S.m)) { S.n = 3; S.l = 2; S.m = 0; }
			S.lev = Q.clamp(S.lev | 0, 1, NL);
			cv = $("qm-at-cv"); ctx = cv.getContext("2d"); stage = $("qm-at-stage"); wrap = $("qm-at-wrap");
			lcv = $("qm-at-lcv"); lctx = lcv.getContext("2d"); lstage = $("qm-at-lstage"); lwrap = $("qm-at-lwrap");
			syncSel();
			$("qm-at-n").onchange = function () { setOrb(+this.value, S.l, S.m); };
			$("qm-at-l").onchange = function () { setOrb(S.n, +this.value, S.m); };
			$("qm-at-m").onchange = function () { setOrb(S.n, S.l, +this.value); };
			$("qm-at-cplx").onchange = function () { S.cplx = this.checked; syncSel(); changed(); };
			$("qm-at-z").onchange = function () { S.Z = +this.value; changed(); };
			P.querySelector("#qm-at-chips").addEventListener("click", function (e) { var b = e.target.closest("[data-o]"); if (!b) return; var o = b.dataset.o.split(",").map(Number); S.cplx = false; setOrb(o[0], o[1], o[2]); });
			P.querySelector("#qm-at-stage .qm-run").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; S.view = b.dataset.v; hov = null; $("qm-at-ro-hov").textContent = "–"; changed(); kick(); });
			$("qm-at-plane").value = S.plane; $("qm-at-plane").onchange = function () { S.plane = this.value; changed(); };
			[["zoom", "zoom"], ["off", "off"], ["gam", "gam"], ["pts", "pts"]].forEach(function (p) { var el = $("qm-at-" + p[0]); el.value = S[p[1]]; el.addEventListener("input", function () { S[p[1]] = +el.value; changed(); }); });
			[["spinon", "spin"], ["nodes", "nodes"], ["showR", "showR"], ["air", "air"], ["red", "red"]].forEach(function (p) { var el = $("qm-at-" + p[0]); el.checked = S[p[1]]; el.addEventListener("change", function () { S[p[1]] = el.checked; if (lastAB) { lastJ = trOf(lastAB[0], lastAB[1]); showJump(lastJ, lastAB[0], lastAB[1]); } changed(); kick(); }); });
			$("qm-at-resample").onclick = function () { seed = (seed * 7919 + 13) % 100000 + 1; draw(); };
			$("qm-at-link").onclick = function () { a.setQuery(linkObj()); a.copy(location.href, "Link copied"); };
			fsBtn($("qm-at-fs"), wrap); fsBtn($("qm-at-lfs"), lwrap);
			/* pointer on the orbital canvas */
			cv.addEventListener("pointerdown", function (e) { if (S.view !== "cloud") return; dragging = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
			cv.addEventListener("pointermove", function (e) {
				var r = cv.getBoundingClientRect();
				if (dragging) { yaw = dragging.yaw + (e.clientX - dragging.x) * 0.01; pitch = Q.clamp(dragging.pitch + (e.clientY - dragging.y) * 0.01, -1.55, 1.55); renderCloud(); return; }
				if (S.view !== "cloud") { hov = { x: e.clientX - r.left, y: e.clientY - r.top }; if (S.view === "slice") renderSlice(); else renderRadial(); }
			});
			var end = function () { if (dragging) { dragging = null; kick(); } };
			cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
			cv.addEventListener("pointerleave", function () { if (!dragging && hov) { hov = null; draw(); } });
			/* levels canvas */
			lcv.addEventListener("click", function (e) { var r = lcv.getBoundingClientRect(), y = e.clientY - r.top, L = levelAt(y); if (L < 0 || jump) return; if (L === S.lev) return; doJump(S.lev, L); });
			lcv.addEventListener("keydown", function (e) { if (jump) return; if (e.key === "ArrowUp" && S.lev < NL) { e.preventDefault(); doJump(S.lev, S.lev + 1); } else if (e.key === "ArrowDown" && S.lev > 1) { e.preventDefault(); doJump(S.lev, S.lev - 1); } });
			P.querySelector("#qm-at-jchips").addEventListener("click", function (e) { var b = e.target.closest("[data-j]"); if (!b) return; var j = b.dataset.j.split(",").map(Number); if (jump) jump = null; S.lev = j[0]; doJump(j[0], j[1]); });
			window.addEventListener("resize", function () { if (on) { size(); draw(); } });
			if (window.ResizeObserver) new ResizeObserver(function () { if (on) { size(); draw(); } }).observe(wrap);
			if (window.ResizeObserver) new ResizeObserver(function () { if (on) { size(); drawLevels(); } }).observe(lwrap);
			document.addEventListener("fullscreenchange", function () { if (on) setTimeout(function () { size(); draw(); }, 60); });
			a.onTheme(function () { if (on) draw(); });
			info();
			window.MESQuantumDebug_atom = { S: S, set: setOrb, draw: function () { size(); draw(); }, jump: doJump, step: function (n) { for (var i = 0; i < (n || 1); i++) { if (jump) { jump.t += 0.1; if (jump.t >= 1) { S.lev = jump.b; jump = null; } } yaw += 0.05; } draw(); }, state: function () { return { lev: S.lev, jump: jump, last: lastJ }; } };
		},
		show: function () { on = true; size(); info(); draw(); kick(); },
		hide: function () { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; lastT = 0; }
	});
})();

/* ui-calc: the "Calculators" tab. Ten small live cards; every input accepts a typed unit ("500 nm", "2 eV") or the unit picked from its menu.
   Maths in lib-atom.js (MESQ.calc, MESQ.atom). Values are saved per card in api.st.v; links carry ca=<card> and ca_<card>_<field>=<text>. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var K, A, C, api, P, st, cards = {}, on = false;
	function $(s, r) { return (r || document).querySelector(s); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var f4 = function (x) { return Q.fmt(x, 4); }, f3 = function (x) { return Q.fmt(x, 3); };
	function partOpts(withCustom) { var o = K.PARTICLES.map(function (p) { return [p[0], p[1]]; }); if (withCustom) o.push(["custom", "Custom mass…"]); return o; }
	function partOf(id) { for (var i = 0; i < K.PARTICLES.length; i++) if (K.PARTICLES[i][0] === id) return K.PARTICLES[i]; return K.PARTICLES[0]; }
	var NUCS = [["inf", "Fixed nucleus (infinite mass)"], ["H", "Hydrogen-1 (proton)"], ["D", "Deuterium"], ["He", "Helium-4"], ["Li", "Lithium-7"]];
	var UNITS = {
		length: ["nm", "pm", "µm", "mm", "m", "Å", "fm"], energy: ["eV", "meV", "keV", "MeV", "J", "kJ/mol"], freq: ["THz", "GHz", "Hz", "PHz"], speed: ["m/s", "km/s", "c"],
		voltage: ["V", "kV", "MV"], mass: ["kg", "u", "g", "me"], time: ["ns", "fs", "ps", "µs", "ms", "s"], temp: ["K", "°C", "°F"], angle: ["deg", "rad"], area: ["m2", "cm2", "mm2"],
		density: ["/m3", "/cm3"], xray: ["pm", "nm", "Å", "keV", "eV", "MeV", "J"], photon: ["nm", "µm", "m", "eV", "J", "THz", "Hz", "cm-1"]
	};
	var PHOTON_DIMS = ["length", "energy", "freq", "wavenumber"];
	function lenTxt(x) { return Q.si(x, "m", 4); }
	function eTxt(J) { var eV = J / C.e; return Math.abs(eV) >= 1e-3 && Math.abs(eV) < 1e7 ? Q.si(eV, "eV", 4) : f4(eV) + " eV"; }
	function swatch(lam) { var rgb = A.wavelengthRGB(lam * 1e9); return rgb ? '<i class="qm-ca-sw" style="background:rgb(' + rgb.join(",") + ')" title="approximate colour"></i>' : ""; }
	function lamComp(l) {
		var tbl = [[1e-15, "a proton"], [1e-12, "an atomic nucleus is ~10× smaller"], [1e-10, "an atom"], [1e-8, "a small molecule cluster"], [4e-7, "visible light"], [1e-5, "a bacterium"], [1e-3, "a grain of sand"]];
		if (l < 1e-17) return "far smaller than a proton (10⁻¹⁵ m): no experiment could ever see this wave";
		if (l < 3e-15) return "about the size of a proton";
		if (l < 3e-13) return "about the size of an atomic nucleus";
		if (l < 5e-12) return "much smaller than an atom (10⁻¹⁰ m): like X-ray wavelengths";
		if (l < 5e-10) return "about the size of an atom: such waves diffract off crystals";
		if (l < 3.8e-7) return "between atoms and visible light";
		if (l < 7.5e-7) return "in the range of visible light";
		return "longer than visible light";
	}

	/* ---------- card definitions: fields + compute(v) -> {rows:[[label, html]], plug, say, chart?} ---------- */
	var DEF = {
		db: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(true); }, def: "e" },
				{ k: "mass", t: "q", label: "Mass", dims: ["mass"], units: "mass", def: "1 u", show: function (v) { return v.part === "custom"; } },
				{ k: "mode", t: "sel", label: "I know its", opts: [["V", "accelerating voltage"], ["K", "kinetic energy"], ["v", "speed"]], def: "V" },
				{ k: "val", t: "q", label: function (v) { return v.mode === "V" ? "Voltage" : v.mode === "K" ? "Kinetic energy" : "Speed"; }, dims: function (v) { return v.mode === "V" ? ["voltage"] : v.mode === "K" ? ["energy"] : ["speed"]; }, units: function (v) { return v.mode === "V" ? "voltage" : v.mode === "K" ? "energy" : "speed"; }, def: "100 V" }],
			calc: function (v, g) {
				var p = partOf(v.part), m = v.part === "custom" ? g("mass").v : p[2], q = v.part === "custom" ? 1 : Math.abs(p[3]), val = g("val");
				var r;
				if (v.mode === "V") { if (!q) throw { k: "val", m: "a neutral " + p[1].toLowerCase() + " is not sped up by a voltage: give its energy or speed" }; r = K.deBroglie(m, { K: q * C.e * val.v }); }
				else if (v.mode === "K") r = K.deBroglie(m, { K: val.v }); else r = K.deBroglie(m, { v: val.v });
				if (r.err) throw { k: "val", m: r.err };
				var rows = [["Wavelength λ", "<b>" + lenTxt(r.lambda) + "</b>"], ["Momentum p", f4(r.p) + " kg·m/s"], ["Speed v", (r.v > 1e-3 * C.c ? f4(r.v / C.c) + " c = " : "") + Q.si(r.v, "m/s", 4)], ["Kinetic energy", eTxt(r.K)], ["Lorentz factor γ", r.gamma < 1 + 1e-9 ? "1.000000000" : Q.fmt(r.gamma, 6)]];
				var plug = "λ = h / p = 6.626 × 10⁻³⁴ J·s ÷ " + f4(r.p) + " kg·m/s = " + lenTxt(r.lambda);
				var say = "The wave that goes with this " + (v.part === "custom" ? "particle" : p[1].toLowerCase()) + " is " + lamComp(r.lambda) + ".";
				if (r.relDiff > 0.005) say += " Relativity matters here: the non-relativistic formula would give " + lenTxt(r.lambdaNR) + " (" + (100 * r.relDiff).toFixed(1) + "% off).";
				else say += " At this speed the simple formula λ = h/(mv) is fine (relativity changes it by " + (r.relDiff < 1e-6 ? "less than a millionth" : (100 * r.relDiff).toPrecision(2) + "%") + ").";
				return { rows: rows, plug: plug, say: say };
			}
		},
		ph: {
			fields: [{ k: "val", t: "q", label: "Wavelength, energy or frequency", dims: PHOTON_DIMS, units: "photon", def: "500 nm" }],
			calc: function (v, g) {
				var x = g("val"), r = K.photon(x.v, x.dim);
				var rows = [["Wavelength", "<b>" + lenTxt(r.lambda) + "</b> " + swatch(r.lambda)], ["Energy", "<b>" + Q.si(r.eV, "eV", 4) + "</b>"], ["Energy (J)", f4(r.E) + " J"], ["Frequency", Q.si(r.f, "Hz", 4)], ["Wavenumber", f4(r.wavenumber / 100) + " cm⁻¹"], ["Momentum", f4(r.p) + " kg·m/s"], ["Band", r.band]];
				var plug = "E = hc / λ = (6.626 × 10⁻³⁴ × 2.998 × 10⁸) ÷ " + f4(r.lambda) + " m = " + f4(r.E) + " J = " + Q.si(r.eV, "eV", 4);
				var say = r.band === "visible" ? "Visible light: one photon of this colour carries " + Q.fmt(r.eV, 3) + " eV, about the energy that a chemical bond or your eye's retinal molecule works with." :
					r.lambda < 3.8e-7 ? "Ultraviolet or shorter: each photon has enough energy (" + Q.si(r.eV, "eV", 3) + ") to break chemical bonds, which is why it damages skin and DNA." :
						"Infrared or longer: each photon has only " + Q.si(r.eV, "eV", 3) + ", enough to make molecules vibrate (warmth) but not to break bonds.";
				return { rows: rows, plug: plug, say: say };
			}
		},
		un: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "e" },
				{ k: "dx", t: "q", label: "Position spread Δx", dims: ["length"], units: "length", def: "0.1 nm" },
				{ k: "dt", t: "q", label: "Time window Δt (for ΔE)", dims: ["time"], units: "time", def: "1 ns" }],
			calc: function (v, g) {
				var p = partOf(v.part), dx = g("dx").v, dt = g("dt").v, u = K.uncertainty(dx, p[2]), e = K.energyTime(dt);
				var rows = [["Minimum Δp", "<b>" + f4(u.dp) + " kg·m/s</b>"], ["Minimum Δv", "<b>" + Q.si(u.dv, "m/s", 4) + "</b>" + (u.dv > 0.1 * C.c ? " (relativistic: treat as rough)" : "")], ["Minimum ΔE", eTxt(e.dE)], ["Line width Δf = ΔE/h", Q.si(e.df, "Hz", 3)]];
				var plug = "Δp ≥ ħ / (2Δx) = 1.0546 × 10⁻³⁴ ÷ (2 × " + f4(dx) + " m) = " + f4(u.dp) + " kg·m/s;  Δv = Δp / m = " + Q.si(u.dv, "m/s", 4);
				var say = "Squeeze a " + p[1].toLowerCase() + " into " + lenTxt(dx) + " and its speed cannot be known better than ±" + Q.si(u.dv / 2, "m/s", 2) + " or so" +
					(u.dv > 1e4 ? ": it can never sit still, which is why atoms do not collapse." : u.dv > 1e-3 ? "." : ": far too small to ever notice, which is why everyday objects look perfectly classical.") +
					" A state that lives only " + Q.si(dt, "s") + " has an energy blurred by at least " + eTxt(e.dE) + ".";
				return { rows: rows, plug: plug, say: say };
			}
		},
		tu: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "e" },
				{ k: "E", t: "q", label: "Particle energy E", dims: ["energy"], units: "energy", def: "1 eV" },
				{ k: "V", t: "q", label: "Barrier height V", dims: ["energy"], units: "energy", def: "2 eV" },
				{ k: "a", t: "q", label: "Barrier width a", dims: ["length"], units: "length", def: "0.5 nm" }],
			calc: function (v, g) {
				var p = partOf(v.part), E = g("E").v, V = g("V").v, a = g("a").v, r = K.tunnel(E, V, a, p[2]);
				if (r.err) throw { k: "E", m: r.err };
				var pc = function (x) { return x >= 1e-4 ? (100 * x).toPrecision(4) + "%" : f3(x); };
				var rows = [["Transmission T (exact)", "<b>" + pc(r.T) + "</b>"], ["Reflection R", pc(r.R)]];
				var plug, say;
				if (!r.above) {
					rows.push(["Decay constant κ", Q.si(r.kappa * 1e-9, "/nm", 4).replace(" /nm", " nm⁻¹")], ["Penetration depth 1/κ", lenTxt(r.depth)], ["Thick-barrier formula", pc(r.thick)], ["WKB  e^(−2κa)", pc(r.wkb)]);
					plug = "κ = √(2m(V−E))/ħ = " + f4(r.kappa) + " m⁻¹;  κa = " + Q.fmt(r.kappa * a, 4) + ";  T = 1 / [1 + V² sinh²(κa) / (4E(V−E))] = " + f3(r.T);
					var ka = r.kappa * a;
					say = ka < 1 ? "The barrier is thin compared with the decay length, so a big part of the wave gets through. The thick-barrier and WKB shortcuts are poor here: use the exact value." :
						"Inside the barrier the wave dies away like e^(−κx). Each extra " + lenTxt(Math.LN2 / (2 * r.kappa)) + " of width halves the chance of getting through" + (ka > 3 ? "; with κa = " + ka.toFixed(1) + " the thick-barrier formula is within a few per cent." : ".");
				} else {
					plug = "E > V: k′ = √(2m(E−V))/ħ = " + f4(r.k2) + " m⁻¹;  T = 1 / [1 + V² sin²(k′a) / (4E(E−V))] = " + f3(r.T);
					say = "The particle has enough energy to go over, yet quantum mechanically part of the wave still reflects. T reaches exactly 100% when the barrier fits a whole number of half wavelengths (k′a = nπ).";
				}
				return { rows: rows, plug: plug, say: say, chart: { E: E, V: V, a: a, m: p[2] } };
			},
			draw: function (c, W, H, d, dark) {
				var pl = 46, pr = 10, pt = 10, pb = 28, gw = W - pl - pr, gh = H - pt - pb, amax = d.a * 3, lo = -12, hi = 0;
				var Tv = [], N = 160, i;
				for (i = 0; i <= N; i++) { var a = amax * i / N, r = K.tunnel(d.E, d.V, Math.max(a, 1e-30), d.m); Tv.push([Math.log10(Math.max(r.T, 1e-300)), d.E < d.V ? Math.log10(Math.max(r.thick, 1e-300)) : NaN]); lo = Math.min(lo, Tv[i][0]); }
				lo = Math.max(-40, Math.floor(lo)); if (lo > -2) lo = -2;
				var X = function (a) { return pl + a / amax * gw; }, Y = function (l) { return pt + (hi - l) / (hi - lo) * gh; };
				axes(c, W, H, pl, pr, pt, pb, dark);
				c.fillStyle = dark ? "#b3b0cc" : "#5b5875"; c.font = "11px system-ui,sans-serif";
				var stp = Math.max(1, Math.ceil((hi - lo) / 5));
				for (var e = 0; e >= lo; e -= stp) { c.fillText(e === 0 ? "1" : "10" + Q.sup(e), 4, Y(e) + 4); }
				c.fillText("barrier width →  (your width at the dot, scale to " + lenTxt(amax) + ")", pl, H - 8);
				line(c, Tv.map(function (t, i) { return [X(amax * i / N), Y(Q.clamp(t[0], lo, hi))]; }), "#5b3fd6", 2.2);
				if (d.E < d.V) line(c, Tv.map(function (t, i) { return [X(amax * i / N), Y(Q.clamp(t[1], lo, hi))]; }), "#db2777", 1.5, [5, 4]);
				var rr = K.tunnel(d.E, d.V, d.a, d.m); c.fillStyle = "#5b3fd6"; c.beginPath(); c.arc(X(d.a), Y(Q.clamp(Math.log10(rr.T), lo, hi)), 4.5, 0, 7); c.fill();
				legend(c, W - pr, pt + 12, [["#5b3fd6", "exact T"], ["#db2777", d.E < d.V ? "thick-barrier formula" : ""]], dark);
			}
		},
		bx: {
			fields: [{ k: "mode", t: "sel", label: "Mode", opts: [["lv", "Jump between two levels"], ["dye", "Dye molecule: N π electrons"]], def: "lv" },
				{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "e", show: function (v) { return v.mode === "lv"; } },
				{ k: "L", t: "q", label: "Box length L", dims: ["length"], units: "length", def: "1 nm" },
				{ k: "n1", t: "int", label: "From level n", min: 1, max: 50, def: "1", show: function (v) { return v.mode === "lv"; } },
				{ k: "n2", t: "int", label: "To level n", min: 1, max: 50, def: "2", show: function (v) { return v.mode === "lv"; } },
				{ k: "N", t: "int", label: "π electrons N (even)", min: 2, max: 40, def: "6", show: function (v) { return v.mode === "dye"; } }],
			calc: function (v, g) {
				var L = g("L").v, rows, plug, say, chart, lam;
				if (v.mode === "dye") {
					var N = g("N").v; if (N % 2) throw { k: "N", m: "use an even number (two electrons per level)" };
					var d = K.dye(N, L); lam = d.lambda;
					rows = [["HOMO → LUMO", "n = " + d.homo + " → " + d.lumo], ["Gap ΔE", "<b>" + eTxt(d.dE) + "</b>"], ["Absorbed wavelength", "<b>" + lenTxt(lam) + "</b> " + swatch(lam)], ["Band", A.band(lam)]];
					plug = "ΔE = h²(N+1) / (8 mₑ L²) = (6.626 × 10⁻³⁴)² × " + (N + 1) + " ÷ (8 × 9.109 × 10⁻³¹ × (" + f4(L) + ")²) = " + eTxt(d.dE) + ";  λ = hc/ΔE = " + lenTxt(lam);
					say = "The " + N + " π electrons fill the lowest " + d.homo + " levels, two per level. Light is absorbed when one jumps to the first empty level. Longer chains = bigger box = smaller gap = longer wavelength, which is why longer dyes absorb redder light. (For butadiene, L = 0.578 nm, this simple model gives 220 nm; the measured absorption peak is about 217 nm.)";
					chart = { levels: 6 > d.lumo + 1 ? 6 : d.lumo + 1, filled: d.homo, from: d.homo, to: d.lumo, lam: lam };
				} else {
					var p = partOf(v.part), n1 = g("n1").v, n2 = g("n2").v, E1 = K.box(n1, L, p[2]), E2 = K.box(n2, L, p[2]), dE = Math.abs(E2 - E1);
					lam = dE ? C.h * C.c / dE : Infinity;
					rows = [["Energy at n = " + n1, eTxt(E1)], ["Energy at n = " + n2, eTxt(E2)], ["Gap ΔE", "<b>" + eTxt(dE) + "</b>"], ["Photon wavelength", dE ? "<b>" + lenTxt(lam) + "</b> " + swatch(lam) : "–"], ["Ground state E₁", eTxt(K.box(1, L, p[2]))]];
					plug = "Eₙ = n²h² / (8mL²): E₁ = (6.626 × 10⁻³⁴)² ÷ (8 × " + f4(p[2]) + " × (" + f4(L) + ")²) = " + eTxt(K.box(1, L, p[2])) + ";  ΔE = |" + n2 + "² − " + n1 + "²| E₁ = " + eTxt(dE);
					say = "A trapped particle can only have these energies, growing as n². Even the lowest level is not zero: confinement always costs energy (the uncertainty principle again). Halve the box and every level goes up 4×.";
					chart = { levels: Math.max(5, Math.min(12, Math.max(n1, n2) + 1)), filled: 0, from: n1, to: n2, lam: lam };
				}
				return { rows: rows, plug: plug, say: say, chart: chart };
			},
			draw: function (c, W, H, d, dark) {
				var nmax = d.levels, x0 = 70, x1 = Math.min(W - 20, 320), top = 10, bot = H - 14, Y = function (n) { return bot - (n * n) / (nmax * nmax) * (bot - top); };
				c.strokeStyle = dark ? "#b3b0cc" : "#5b5875"; c.lineWidth = 2; c.beginPath(); c.moveTo(x0 - 6, top); c.lineTo(x0 - 6, bot); c.lineTo(x1 + 6, bot); c.lineTo(x1 + 6, top); c.stroke();
				c.font = "11px system-ui,sans-serif";
				for (var n = 1; n <= nmax; n++) {
					var y = Y(n); c.strokeStyle = n === d.from || n === d.to ? "#5b3fd6" : dark ? "#6b6a90" : "#b5b2d6"; c.lineWidth = n === d.from || n === d.to ? 2.4 : 1.2;
					c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
					if (nmax <= 12 && (Y(n - 1) - y > 11 || n === nmax)) { c.fillStyle = dark ? "#e6e4f7" : "#1f1b3a"; c.fillText("n = " + n, 8, y + 4); }
					if (n <= d.filled) { c.fillStyle = "#db2777"; c.beginPath(); c.arc((x0 + x1) / 2 - 8, y, 3.5, 0, 7); c.arc((x0 + x1) / 2 + 8, y, 3.5, 0, 7); c.fill(); }
				}
				if (d.from !== d.to) {
					var rgb = A.wavelengthRGB(d.lam * 1e9), col = rgb ? "rgb(" + rgb.join(",") + ")" : "#f59e0b", ax = x1 - 30, ya = Y(d.from), yb = Y(d.to);
					c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ax, ya); c.lineTo(ax, yb); c.stroke();
					c.beginPath(); var dir = yb < ya ? 1 : -1; c.moveTo(ax, yb); c.lineTo(ax - 5, yb + 8 * dir); c.lineTo(ax + 5, yb + 8 * dir); c.fill();
				}
				if (x1 + 30 < W) { c.fillStyle = dark ? "#b3b0cc" : "#5b5875"; c.fillText("levels grow as n²", x1 + 16, top + 12); }
			}
		},
		bo: {
			fields: [{ k: "n", t: "int", label: "Level n", min: 1, max: 1000, def: "1" }, { k: "Z", t: "int", label: "Nuclear charge Z", min: 1, max: 118, def: "1" },
				{ k: "nuc", t: "sel", label: "Nucleus mass", opts: NUCS, def: "inf" }],
			calc: function (v, g) {
				var n = g("n").v, Z = g("Z").v, Mm = A.MASS[v.nuc], b = K.bohr(n, Z, Mm);
				var rows = [["Orbit radius rₙ", "<b>" + lenTxt(b.r) + "</b> = " + Q.fmt(b.r / C.a0, 5) + " a₀"], ["Speed vₙ", Q.si(b.v, "m/s", 4) + " = " + Q.fmt(b.beta, 4) + " c"], ["Energy Eₙ", "<b>" + Q.fmt(b.eV, 6) + " eV</b>"], ["Ionization energy", Q.fmt(b.ion, 6) + " eV"], ["Orbit period", Q.si(b.T, "s", 4)], ["Angular momentum", n + "ħ = " + f4(b.L) + " J·s"]];
				var plug = "rₙ = n²a₀/Z = " + n + "² × 52.918 pm ÷ " + Z + (isFinite(Mm) ? " × (1 + mₑ/M)" : "") + " = " + lenTxt(b.r) + ";  Eₙ = −13.6057 eV × " + Z + "² ÷ " + n + "²" + (isFinite(Mm) ? " × μ/mₑ" : "") + " = " + Q.fmt(b.eV, 6) + " eV";
				var say = "Bohr's 1913 model gets the energies of one-electron atoms right" + (b.beta > 0.1 ? ", but here the electron would move at " + (100 * b.beta).toFixed(0) + "% of light speed, so relativity (Dirac's equation) shifts the levels noticeably" : "") + ". The circular orbit itself is not real: quantum mechanically the electron is a cloud, and rₙ is only its typical size (see the Hydrogen atom tab).";
				if (Z > 1 && v.nuc === "H") say += " Note: you picked a hydrogen nucleus mass with Z > 1.";
				return { rows: rows, plug: plug, say: say };
			}
		},
		ry: {
			fields: [{ k: "Z", t: "int", label: "Nuclear charge Z", min: 1, max: 10, def: "1" }, { k: "nuc", t: "sel", label: "Nucleus mass", opts: NUCS, def: "H" },
				{ k: "n1", t: "int", label: "Lower level n₁", min: 1, max: 30, def: "2" }, { k: "n2", t: "int", label: "Upper level n₂", min: 2, max: 60, def: "3" },
				{ k: "air", t: "sel", label: "Wavelengths", opts: [["air", "in air (lab tables)"], ["vac", "in vacuum"]], def: "air" },
				{ k: "find", t: "q", label: "Find the line nearest to", dims: ["length"], units: "length", def: "486 nm" }],
			calc: function (v, g) {
				var Z = g("Z").v, Mm = A.MASS[v.nuc], n1 = g("n1").v, n2 = g("n2").v, air = v.air === "air";
				if (n2 <= n1) throw { k: "n2", m: "the upper level must be above n₁" };
				var lv = K.rydberg(n1, n2, Z, Mm), l = air ? A.toAir(lv) : lv, E = C.h * C.c / lv / C.e;
				var rows = [["Wavelength", "<b>" + lenTxt(l) + "</b> " + swatch(lv) + (air && lv >= 2e-7 ? " (air)" : " (vacuum)")], ["Photon energy", Q.fmt(E, 6) + " eV"], ["Wavenumber", Q.fmt(1 / lv / 100, 7) + " cm⁻¹"], ["Series", A.seriesName(n1) + " · " + A.band(lv)], ["Series limit (n₂ → ∞)", lenTxt(air ? A.toAir(A.seriesLimit(n1, Z, Mm)) : A.seriesLimit(n1, Z, Mm))]];
				var fnd = g("find"), list = K.findLines(fnd.v, Z, Mm, 12, 5, air);
				var tb = '<div class="qm-tablewrap"><table class="qm-table qm-ca-lines"><tr><th>Line</th><th>Series</th><th>λ</th><th>Off by</th></tr>' + list.map(function (x) { return "<tr><td>" + x.n2 + " → " + x.n1 + "</td><td>" + x.series + "</td><td>" + lenTxt(x.lambda) + " " + swatch(x.lambda) + "</td><td>" + (x.off >= 0 ? "+" : "−") + Math.abs(100 * x.off).toFixed(Math.abs(x.off) < 0.001 ? 3 : 2) + "%</td></tr>"; }).join("") + "</table></div>";
				var plug = "1/λ = 10 973 731.568 m⁻¹" + (isFinite(Mm) ? " × μ/mₑ" : "") + " × " + Z + "² × (1/" + n1 + "² − 1/" + n2 + "²) → λ = " + lenTxt(lv) + " (vacuum)";
				return { rows: rows, plug: plug, say: "Nearest hydrogen-like lines to " + lenTxt(fnd.v) + (Z > 1 ? " for Z = " + Z : "") + ":", extra: tb };
			}
		},
		co: {
			fields: [{ k: "val", t: "q", label: "Incoming photon (wavelength or energy)", dims: ["length", "energy"], units: "xray", def: "71.1 pm" },
				{ k: "th", t: "q", label: "Scattering angle θ", dims: ["angle"], units: "angle", def: "90 deg" },
				{ k: "tg", t: "sel", label: "Scattered off", opts: [["e", "a free electron"], ["p", "a proton"]], def: "e" }],
			calc: function (v, g) {
				var x = g("val"), lam = x.dim === "length" ? x.v : C.h * C.c / x.v, th = g("th").v, m = v.tg === "p" ? C.mp : C.me, r = K.compton(lam, th, m);
				var rows = [["Compton wavelength h/mc", lenTxt(r.lc)], ["Shift Δλ", "<b>" + lenTxt(r.dl) + "</b>"], ["Scattered λ′", lenTxt(r.lambda2)], ["Photon energy before → after", eTxt(r.E1) + " → " + eTxt(r.E2)], ["Recoil energy given to the " + (v.tg === "p" ? "proton" : "electron"), eTxt(r.Ke)]];
				var plug = "Δλ = h/(mc)(1 − cos θ) = " + lenTxt(r.lc) + " × (1 − cos " + (th * 180 / Math.PI).toFixed(1) + "°) = " + lenTxt(r.dl);
				var say = "The shift does not depend on the wavelength, only on the angle, so it is easy to see with X-rays (Compton used molybdenum Kα at 71 pm in 1923) and invisible with light: for 500 nm light it is only " + (100 * r.dl / 5e-7).toPrecision(2) + "% of the wavelength. Light bouncing like a billiard ball off an electron is direct evidence that photons carry momentum.";
				return { rows: rows, plug: plug, say: say };
			}
		},
		bb: {
			fields: [{ k: "T", t: "q", label: "Temperature", dims: ["temp"], units: "temp", def: "5772 K" }, { k: "A", t: "q", label: "Surface area", dims: ["area"], units: "area", def: "1 m2" }],
			calc: function (v, g) {
				var T = g("T").v, Ar = g("A").v, r = K.blackbody(T);
				var rows = [["Peak wavelength (Wien)", "<b>" + lenTxt(r.peak) + "</b> " + swatch(r.peak)], ["Peak frequency", Q.si(r.fpeak, "Hz", 4)], ["Radiated per m² (σT⁴)", Q.si(r.flux, "W/m²", 4).replace("W/m²", "W/m²")], ["Radiated by the area", Q.si(r.flux * Ar, "W", 4)], ["Peak is in the", A.band(r.peak)]];
				var plug = "λpeak = 2.898 × 10⁻³ m·K ÷ " + Q.fmt(T, 5) + " K = " + lenTxt(r.peak) + ";  σT⁴ = 5.670 × 10⁻⁸ × " + Q.fmt(T, 5) + "⁴ = " + Q.si(r.flux, "W/m²", 4);
				var say = r.peak < 3.8e-7 ? "Hotter than any star surface: the glow peaks in the ultraviolet and looks blue-white." : r.peak < 7.5e-7 ? "The glow peaks in visible light. Planck explained this curve in 1900 by assuming light energy comes in packets hf: the start of quantum physics." : r.peak < 1e-5 ? "The peak is in the infrared: it glows warm, and only the short-wavelength tail is visible (red-orange) if it is hot enough." : "Far infrared or microwaves: nothing visible at all, but thermal cameras (or radio telescopes, for the CMB) see it.";
				return { rows: rows, plug: plug, say: say, chart: { T: T, peak: r.peak } };
			},
			draw: function (c, W, H, d, dark) {
				var pl = 14, pr = 10, pt = 10, pb = 26, gw = W - pl - pr, gh = H - pt - pb, l0 = d.peak * 0.12, l1 = d.peak * 6, N = 240, mx = K.planck(d.peak, d.T), i;
				var X = function (l) { return pl + (Math.log(l) - Math.log(l0)) / (Math.log(l1) - Math.log(l0)) * gw; };
				for (var nm = 380; nm < 750; nm += 3) { var x = X(nm * 1e-9), x2 = X((nm + 3) * 1e-9); if (x2 < pl || x > W - pr) continue; var rgb = A.wavelengthRGB(nm); c.fillStyle = "rgba(" + rgb.join(",") + ",0.45)"; c.fillRect(Math.max(pl, x), pt, Math.min(x2, W - pr) - Math.max(pl, x) + 0.6, gh); }
				axes(c, W, H, pl, pr, pt, pb, dark);
				var pts = []; for (i = 0; i <= N; i++) { var l = l0 * Math.pow(l1 / l0, i / N); pts.push([X(l), pt + gh - K.planck(l, d.T) / mx * gh * 0.95]); }
				c.beginPath(); c.moveTo(pts[0][0], pt + gh); pts.forEach(function (p) { c.lineTo(p[0], p[1]); }); c.lineTo(pts[N][0], pt + gh); c.closePath(); c.fillStyle = "rgba(91,63,214,0.15)"; c.fill();
				line(c, pts, "#5b3fd6", 2.2);
				c.strokeStyle = "#db2777"; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(X(d.peak), pt); c.lineTo(X(d.peak), pt + gh); c.stroke(); c.setLineDash([]);
				c.fillStyle = dark ? "#b3b0cc" : "#5b5875"; c.font = "11px system-ui,sans-serif";
				[l0 * 1.4, d.peak, l1 / 1.6].forEach(function (l) { var t = lenTxt(l).replace(/(\.\d)\d+/, "$1"); c.fillText(t, Math.min(X(l) - 14, W - pr - 50), H - 8); });
			}
		},
		th: {
			fields: [{ k: "part", t: "sel", label: "Particle", opts: function () { return partOpts(false); }, def: "He" },
				{ k: "T", t: "q", label: "Temperature", dims: ["temp"], units: "temp", def: "300 K" },
				{ k: "n", t: "q", label: "Number density n", dims: ["density"], units: "density", def: "2.45e25 /m3" }],
			calc: function (v, g) {
				var p = partOf(v.part), T = g("T").v, n = g("n").v, l = K.thermal(p[2], T), d = Math.pow(n, -1 / 3), D = n * l * l * l;
				var rows = [["Thermal wavelength λth", "<b>" + lenTxt(l) + "</b>"], ["Typical spacing n^(−1/3)", lenTxt(d)], ["Degeneracy n λth³", "<b>" + Q.fmt(D, 3) + "</b>"]];
				var plug = "λth = h / √(2π m kB T) = 6.626 × 10⁻³⁴ ÷ √(2π × " + f4(p[2]) + " × 1.381 × 10⁻²³ × " + Q.fmt(T, 4) + ") = " + lenTxt(l);
				var say = D < 0.01 ? "The waves are much smaller than the gaps between particles, so they behave like tiny classical balls: an ordinary gas." :
					D < 1 ? "Getting close: the waves begin to overlap, and quantum statistics starts to change the gas's behaviour." :
						(p[3] !== 0 && p[0] === "e" ? "The waves overlap strongly: a degenerate Fermi gas. This is why the electrons in a metal fill energy levels up to the Fermi energy and barely care about temperature." :
							"The waves overlap: a quantum gas. For bosons like rubidium-87 a Bose-Einstein condensate forms when nλth³ passes about 2.612.");
				return { rows: rows, plug: plug, say: say };
			}
		}
	};

	/* ---------- tiny chart helpers ---------- */
	function axes(c, W, H, pl, pr, pt, pb, dark) { c.strokeStyle = dark ? "#6b6a90" : "#b5b2d6"; c.lineWidth = 1; c.beginPath(); c.moveTo(pl, pt); c.lineTo(pl, H - pb); c.lineTo(W - pr, H - pb); c.stroke(); }
	function line(c, pts, col, w, dash) { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); var st0 = false; pts.forEach(function (p) { if (!isFinite(p[1])) { st0 = false; return; } if (st0) c.lineTo(p[0], p[1]); else { c.moveTo(p[0], p[1]); st0 = true; } }); c.stroke(); c.setLineDash([]); }
	function legend(c, x, y, items, dark) { c.font = "11px system-ui,sans-serif"; items.forEach(function (it, i) { if (!it[1]) return; var tw = c.measureText(it[1]).width; c.fillStyle = it[0]; c.fillRect(x - tw - 22, y + i * 15 - 4, 14, 3); c.fillStyle = dark ? "#e6e4f7" : "#1f1b3a"; c.fillText(it[1], x - tw, y + i * 15); }); }

	/* ---------- generic card engine ---------- */
	function val(f, v) { return typeof f === "function" ? f(v) : f; }
	function build(id) {
		var el = document.getElementById("qm-ca-" + id), D = DEF[id], box = $(".qm-ca-fields", el), vals = Object.assign({}, st.v[id] || {});
		D.fields.forEach(function (f) { if (vals[f.k] == null) vals[f.k] = f.def; });
		var card = cards[id] = { el: el, D: D, vals: vals, box: box, out: $(".qm-ca-out", el), cv: $(".qm-ca-cv", el), last: null };
		box.innerHTML = '<div class="qm-grid qm-ca-g">' + D.fields.map(function (f) {
			var iid = "qm-ca-" + id + "-" + f.k, h = '<div class="tu-field" data-f="' + f.k + '"><label class="tu-label" for="' + iid + '"></label>';
			if (f.t === "sel") h += '<select id="' + iid + '" data-k="' + f.k + '"></select>';
			else if (f.t === "int") h += '<input id="' + iid + '" data-k="' + f.k + '" type="number" inputmode="numeric" min="' + f.min + '" max="' + f.max + '" step="1">';
			else h += '<div class="qm-ca-in"><input id="' + iid + '" data-k="' + f.k + '" type="text" inputmode="text" autocomplete="off" spellcheck="false"><select data-u="' + f.k + '" aria-label="Unit"></select></div>';
			return h + '<small class="qm-ca-rd" data-r="' + f.k + '"></small></div>';
		}).join("") + "</div>" + '<div class="qm-row"><button type="button" class="tu-btn qm-ca-link">Copy link to this card</button><button type="button" class="tu-btn qm-ca-reset">Reset</button></div>';
		D.fields.forEach(function (f) {
			var inp = $('[data-k="' + f.k + '"]', box);
			if (f.t === "sel") inp.innerHTML = val(f.opts, vals).map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("");
			inp.value = vals[f.k];
			if (f.t === "sel" && inp.value !== vals[f.k]) { inp.value = f.def; vals[f.k] = f.def; }
		});
		box.addEventListener("input", function (e) { var k = e.target.dataset.k; if (!k) return; vals[k] = e.target.value; if (D.fields.some(function (f) { return f.k === k && f.t === "sel"; })) refreshDyn(id); run(id, true); });
		box.addEventListener("change", function (e) {
			var u = e.target.dataset.u; if (!u) return;
			/* picking a unit rewrites the number in that unit */
			var f = fieldOf(D, u), inp = $('[data-k="' + u + '"]', box), dims = val(f.dims, vals), p = K.parse(inp.value, dims, e.target.dataset.prev);
			var unit = e.target.value, dim = dimOfUnit(unit, dims);
			if (!p.err && dim === p.dim && dim !== "temp") { var fac = K.UNITS[dim][unit]; inp.value = +(p.v / fac).toPrecision(6) + " " + unit; }
			else if (!p.err && dim === "temp") { var Tk = p.v, tv = unit === "K" ? Tk : unit === "°C" ? Tk - 273.15 : (Tk - 273.15) * 9 / 5 + 32; inp.value = +tv.toPrecision(6) + " " + unit; }
			else { var num = (inp.value.match(/^[-+]?[\d.]+(e[-+]?\d+)?/i) || ["1"])[0]; inp.value = num + " " + unit; }
			e.target.dataset.prev = unit; vals[u] = inp.value; run(id, true);
		});
		$(".qm-ca-link", el).addEventListener("click", function () {
			var o = { ca: id }; Object.keys(cards).forEach(function (c) { DEF[c].fields.forEach(function (f) { o["ca_" + c + "_" + f.k] = null; }); });
			D.fields.forEach(function (f) { if (String(vals[f.k]) !== String(f.def)) o["ca_" + id + "_" + f.k] = vals[f.k]; });
			api.setQuery(o); api.copy(location.href, "Link to this calculator copied");
		});
		$(".qm-ca-reset", el).addEventListener("click", function () { D.fields.forEach(function (f) { vals[f.k] = f.def; }); setVals(id, vals); });
		var pre = $(".qm-ca-pre", el);
		if (pre) pre.addEventListener("click", function (e) { var b = e.target.closest("[data-p]"); if (!b) return; var o = JSON.parse(b.dataset.p); Object.keys(o).forEach(function (k) { vals[k] = o[k]; }); setVals(id, vals); Array.prototype.forEach.call(pre.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
		refreshDyn(id);
	}
	function setVals(id, vals) { var c = cards[id]; c.D.fields.forEach(function (f) { var inp = $('[data-k="' + f.k + '"]', c.box); if (f.t === "sel") refreshDyn(id); inp.value = vals[f.k]; }); refreshDyn(id); run(id, true); }
	function fieldOf(D, k) { for (var i = 0; i < D.fields.length; i++) if (D.fields[i].k === k) return D.fields[i]; }
	function dimOfUnit(u, dims) { for (var i = 0; i < dims.length; i++) if (K.UNITS[dims[i]] && K.UNITS[dims[i]][u] != null) return dims[i]; return null; }
	function refreshDyn(id) {
		var c = cards[id], vals = c.vals;
		c.D.fields.forEach(function (f) {
			var wrapF = $('[data-f="' + f.k + '"]', c.box); wrapF.hidden = f.show ? !f.show(vals) : false;
			$("label", wrapF).textContent = val(f.label, vals);
			var us = $('[data-u="' + f.k + '"]', c.box);
			if (us) { var list = UNITS[val(f.units, vals)] || [], key = list.join("|"); if (us.dataset.key !== key) { us.innerHTML = list.map(function (u) { return '<option value="' + esc(u) + '">' + esc(u === "m2" ? "m²" : u === "cm2" ? "cm²" : u === "mm2" ? "mm²" : u === "/m3" ? "per m³" : u === "/cm3" ? "per cm³" : u === "cm-1" ? "cm⁻¹" : u) + "</option>"; }).join(""); us.dataset.key = key; us.value = list[0]; us.dataset.prev = list[0]; } }
		});
	}
	function run(id, save) {
		var c = cards[id], vals = c.vals, errs = {};
		c.D.fields.forEach(function (f) { var r = $('[data-r="' + f.k + '"]', c.box); if (r) { r.textContent = ""; r.classList.remove("qm-ca-bad"); } });
		var g = function (k) {
			var f = fieldOf(c.D, k), raw = vals[k];
			if (f.t === "int") { var n = parseInt(raw, 10); if (!isFinite(n) || n < f.min || n > f.max) throw { k: k, m: "whole number from " + f.min + " to " + f.max }; return { v: n }; }
			var dims = val(f.dims, vals), us = $('[data-u="' + k + '"]', c.box), p = K.parse(raw, dims, us && us.dataset.prev);
			if (p.err) throw { k: k, m: p.err };
			if (p.dim === "angle" ? p.v < 0 : !(p.v > 0)) throw { k: k, m: "must be above zero" };
			if (us && p.unit && us.value !== p.unit && K.UNITS[p.dim] && (UNITS[val(f.units, vals)] || []).indexOf(p.unit) >= 0) { us.value = p.unit; us.dataset.prev = p.unit; }
			var r = $('[data-r="' + k + '"]', c.box);
			if (r && p.dim !== "count") r.textContent = "= " + readSI(p);
			return p;
		};
		var res;
		try { res = c.D.calc(vals, g); }
		catch (e) {
			if (e && e.k) { var r = $('[data-r="' + e.k + '"]', c.box); if (r) { r.textContent = e.m; r.classList.add("qm-ca-bad"); } c.out.classList.add("qm-ca-stale"); return; }
			console.error(e); return;
		}
		c.out.classList.remove("qm-ca-stale");
		c.out.innerHTML = '<div class="qm-ca-res">' + res.rows.map(function (r) { return '<div class="qm-ca-ro"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("") + "</div>" +
			'<p class="qm-ca-plug"><span>Plugged in:</span> ' + esc(res.plug) + "</p>" + '<p class="qm-ca-say">' + esc(res.say) + "</p>" + (res.extra || "");
		c.last = res;
		if (c.cv && res.chart) drawChart(id);
		if (save) { st.v[id] = Object.assign({}, vals); api.save(); }
	}
	function readSI(p) {
		var u = { length: "m", energy: "J", freq: "Hz", wavenumber: "m⁻¹", mass: "kg", speed: "m/s", time: "s", voltage: "V", angle: "rad", area: "m²", density: "m⁻³", temp: "K" }[p.dim] || "";
		if (p.dim === "energy") return Q.fmt(p.v, 4) + " J = " + Q.fmt(p.v / C.e, 4) + " eV";
		if (p.dim === "angle") return (p.v * 180 / Math.PI).toFixed(2) + "°";
		if (p.dim === "temp") return Q.fmt(p.v, 5) + " K";
		return Q.fmt(p.v, 4) + " " + u;
	}
	function drawChart(id) {
		var c = cards[id], cv = c.cv; if (!cv || !c.last || !c.last.chart || !cv.offsetParent) return;
		var dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.parentNode.clientWidth, H = cv.parentNode.clientHeight || 170;
		cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
		var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
		c.D.draw(ctx, W, H, c.last.chart, api.dark());
	}
	function redrawAll() { Object.keys(cards).forEach(drawChart); }

	Q.reg("calc", {
		init: function (panel, a) {
			api = a; P = panel; st = a.st; K = Q.calc; A = Q.atom; C = Q.C;
			st.v = st.v || {};
			/* link parameters ca_<card>_<field> override saved values */
			a.query.forEach(function (v2, k) { var m = /^ca_([a-z]+)_([A-Za-z0-9]+)$/.exec(k); if (m && DEF[m[1]]) { st.v[m[1]] = st.v[m[1]] || {}; st.v[m[1]][m[2]] = v2; } });
			Object.keys(DEF).forEach(build);
			Object.keys(DEF).forEach(function (id) { run(id, false); });
			$("#qm-ca-jump", P).addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; var t = document.getElementById("qm-ca-" + b.dataset.c); if (t) { t.scrollIntoView({ behavior: "smooth", block: "start" }); var i = t.querySelector("input,select"); if (i) setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (x) {} }, 400); } });
			var want = a.query.get("ca");
			if (want && DEF[want]) setTimeout(function () { var t = document.getElementById("qm-ca-" + want); if (t) t.scrollIntoView({ block: "start" }); }, 300);
			window.addEventListener("resize", function () { if (on) redrawAll(); });
			if (window.ResizeObserver) new ResizeObserver(function () { if (on) redrawAll(); }).observe(P);
			a.onTheme(function () { if (on) redrawAll(); });
			window.MESQuantumDebug_calc = { cards: cards, set: function (id, k, v2) { cards[id].vals[k] = v2; setVals(id, cards[id].vals); return cards[id].last; }, result: function (id) { return cards[id].last; } };
		},
		show: function () { on = true; setTimeout(redrawAll, 0); },
		hide: function () { on = false; }
	});
})();

/* MES Quantum Lab page shell: tabs from data-views, ?tab=, shared saved state, lazy init of each simulator (MESQ.ui[tab] from ui-*.js).
   Each UI gets api = {root, panel, st (its own saved object), save(), toast(msg), copy(text, msg), setQuery(obj), dark(), onTheme(fn)} and must stop its animation in hide(). */
(function () {
	"use strict";
	var Q = window.MESQ, root = document.getElementById("qm"); if (!root || !Q) return;
	var KEY = "mes-quantum:v1", all = {};
	try { all = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
	var saveT = 0;
	function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {} }, 300); }
	var toastT;
	function toast(msg) { var t = document.getElementById("qm-toast"); if (!t) { t = document.createElement("div"); t.id = "qm-toast"; t.className = "tu-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copy(s, msg) { var done = function () { toast(msg || "Copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, function () { prompt("Copy:", s); }); else prompt("Copy:", s); }
	function dark() { return document.body.classList.contains("dark-mode"); }
	var themeFns = [];
	new MutationObserver(function () { themeFns.forEach(function (f) { try { f(dark()); } catch (e) {} }); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	var views = (root.getAttribute("data-views") || "").split(",").filter(Boolean);
	var tabs = root.querySelectorAll(".qm-tabs [data-tab]");
	Array.prototype.forEach.call(tabs, function (b) { if (views.indexOf(b.dataset.tab) < 0) b.remove(); });
	Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { if (views.indexOf(p.dataset.panel) < 0) p.remove(); });
	if (views.length < 2) { var tb = root.querySelector(".qm-tabs"); if (tb) tb.hidden = true; }

	var q = new URLSearchParams(location.search), page = root.getAttribute("data-page") || "quantum";
	var started = {}, cur = null;
	function setQuery(o) {
		var u = new URL(location.href);
		Object.keys(o || {}).forEach(function (k) { if (o[k] == null || o[k] === "") u.searchParams.delete(k); else u.searchParams.set(k, o[k]); });
		history.replaceState(null, "", u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash);
	}
	function api(tab, panel) {
		all[tab] = all[tab] || {};
		return { root: root, panel: panel, st: all[tab], save: save, toast: toast, copy: copy, setQuery: setQuery, dark: dark, query: q,
			onTheme: function (f) { themeFns.push(f); }, show: function (t) { setTab(t); } };
	}
	function setTab(t, quiet) {
		if (views.indexOf(t) < 0) t = views[0];
		if (cur === t) return;
		if (cur && Q.ui[cur] && started[cur] && Q.ui[cur].hide) try { Q.ui[cur].hide(); } catch (e) { console.error(e); }
		cur = t;
		Array.prototype.forEach.call(root.querySelectorAll(".qm-tabs [data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); b.tabIndex = b.dataset.tab === t ? 0 : -1; });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		var panel = root.querySelector('[data-panel="' + t + '"]'), ui = Q.ui[t];
		if (ui && panel) {
			try {
				if (!started[t]) { started[t] = true; ui.init(panel, api(t, panel)); }
				if (ui.show) ui.show();
			} catch (e) { console.error(e); }
		}
		all.tab = all.tab || {}; all.tab[page] = t; save();
		if (!quiet) setQuery({ tab: t === views[0] ? null : t });
		window.dispatchEvent(new Event("resize"));
	}
	var bar = root.querySelector(".qm-tabs");
	if (bar) {
		bar.addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
		bar.addEventListener("keydown", function (e) {
			var list = Array.prototype.slice.call(bar.querySelectorAll("[data-tab]")), i = list.indexOf(document.activeElement); if (i < 0) return;
			var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
			if (n < 0 && e.key !== "ArrowLeft") return; e.preventDefault(); n = (n + list.length) % list.length; list[n].focus(); setTab(list[n].dataset.tab);
		});
	}
	document.addEventListener("visibilitychange", function () { var ui = Q.ui[cur]; if (!ui || !started[cur]) return; try { if (document.hidden) { if (ui.hide) ui.hide(); } else if (ui.show) ui.show(); } catch (e) {} });
	var want = q.get("tab") || (all.tab && all.tab[page]) || views[0];
	setTab(want, !q.get("tab"));
	window.MESQuantumDebug = { setTab: setTab, state: all, cur: function () { return cur; } };
})();
