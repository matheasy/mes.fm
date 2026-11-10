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
