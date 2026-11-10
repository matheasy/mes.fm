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
