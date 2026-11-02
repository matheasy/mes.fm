/* MES Light & Metamaterials Lab -- pure maths (no DOM). Browser global `MESMeta`; node: require('./tool_apps_src/negative-index/lib.js');
 * tests: node tool_apps_src/negative-index-tests.js
 * Contents: complex numbers; Snell's law with signed indices (n < 0 = negative refraction); the Veselago flat lens (ray paths, paraxial foci);
 * the slab transfer function for the "perfect lens" (Pendry 2000); Drude permittivity / permeability; a 2D TMz FDTD solver with Drude epsilon AND mu
 * (auxiliary-differential-equation currents), so a medium with both negative at the source frequency is causal and stable; Fraunhofer diffraction
 * (slit, double slit, grating); and the small formulas of the "properties of light" demos (Malus, Cauchy dispersion, slow light, a transformation-optics cloak). */
(function (root) {
	"use strict";
	var M = {}, PI = Math.PI, DEG = PI / 180;
	M.C = 299792458;

	/* ---------- complex numbers [re, im] ---------- */
	function cx(a, b) { return [a, b || 0]; }
	function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
	function mul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
	function div(a, b) { var d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
	function csqrt(a) { var r = Math.hypot(a[0], a[1]), re = Math.sqrt(Math.max(0, (r + a[0]) / 2)), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); if (a[1] < 0) im = -im; return [re, im]; }  // principal root (Im >= 0 when the input's Im >= 0)
	function cexp(a) { var e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; }
	function ccos(a) { return [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])]; }
	function csin(a) { return [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])]; }
	function cabs(a) { return Math.hypot(a[0], a[1]); }
	M.cx = { c: cx, add: add, sub: sub, mul: mul, div: div, sqrt: csqrt, exp: cexp, cos: ccos, sin: csin, abs: cabs };

	/* ---------- refraction with signed indices ----------
	 * Angles are measured from the surface normal. A negative refracted angle means the ray comes out on the SAME side of the normal as the incoming ray:
	 * that is what n < 0 does (sin t2 = n1 sin t1 / n2 has the opposite sign). Returns null when there is no refracted ray (total internal reflection). */
	M.snell = function (n1, n2, t1deg) {
		var s = n1 * Math.sin(t1deg * DEG) / n2; if (!isFinite(s) || Math.abs(s) > 1) return null; return Math.asin(s) / DEG;
	};
	M.critical = function (n1, n2) { var a = Math.abs(n1), b = Math.abs(n2); return a > b ? Math.asin(b / a) / DEG : null; };
	M.reflectance = function (n1, n2, t1deg) {   // Fresnel power reflectance, unpolarised, for ordinary (positive, non-magnetic) media
		var t1 = t1deg * DEG, s2 = n1 * Math.sin(t1) / n2; if (Math.abs(s2) > 1) return 1;
		var c1 = Math.cos(t1), c2 = Math.sqrt(1 - s2 * s2), rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2), rp = (n2 * c1 - n1 * c2) / (n2 * c1 + n1 * c2);
		return (rs * rs + rp * rp) / 2;
	};
	/* Rays from a point at x = 0, y = 0 through a flat slab (faces x = a and x = a + d) of index n, in a medium of index 1, out to x = xEnd.
	 * Returns { rays: [[x0,y0,x1,y1,...], ...], foci: {inside, outside} } with the paraxial foci (null when there are none). */
	M.slabRays = function (n, a, d, xEnd, angles) {
		var rays = [], ang = angles || [-40, -30, -20, -10, -5, 5, 10, 20, 30, 40];
		ang.forEach(function (deg) {
			var t1 = deg * DEG, y1 = a * Math.tan(t1), pts = [0, 0, a, y1], t2deg = M.snell(1, n, deg);
			if (t2deg === null) { pts.push(0, 2 * y1); rays.push({ deg: deg, pts: pts, tir: true }); return; }   // reflected straight back
			var y2 = y1 + d * Math.tan(t2deg * DEG); pts.push(a + d, y2);
			var t3 = M.snell(n, 1, t2deg); if (t3 === null) { rays.push({ deg: deg, pts: pts, tir: true }); return; }
			pts.push(xEnd, y2 + (xEnd - a - d) * Math.tan(t3 * DEG)); rays.push({ deg: deg, pts: pts });
		});
		return { rays: rays, foci: M.slabFoci(n, a, d) };
	};
	M.slabFoci = function (n, a, d) {   // paraxial; distances measured from the source. Exact (every angle) only for n = -1.
		if (n >= 0) return { inside: null, outside: null };
		var an = Math.abs(n), sIn = an * a, inside = sIn <= d ? a + sIn : null, u = d / an - a, outside = u >= 0 ? a + d + u : null;
		return { inside: inside, outside: outside };
	};
	/* how far a ray at angle deg misses the paraxial outside focus (aberration); 0 for every angle when n = -1 */
	M.slabMiss = function (n, a, d, deg) {
		var f = M.slabFoci(n, a, d); if (f.outside == null) return null; var r = M.slabRays(n, a, d, f.outside, [deg]).rays[0];
		return r.tir ? null : r.pts[r.pts.length - 1];
	};

	/* ---------- the perfect lens: slab transfer function ----------
	 * One plane-wave component exp(i kx x + i kz z) of the object's field, kx in units of k0 = 2 pi / lambda. Slab of eps, mu (complex) and thickness d (in wavelengths),
	 * object a distance a in front, image plane a distance (d - a) behind it (the Veselago image of an n = -1 slab). TE: field = E_y, impedance factor p = kz / mu.
	 * t = 1 / (cos k2 d - (i/2)(eta + 1/eta) sin k2 d), eta = p2 / p1: even in k2, so the square-root branch does not matter.
	 * T(kx) = image field / object field = exp(i kz0 a) t exp(i kz0 (d - a)) = t exp(i kz0 d). |T| = 1 means that detail is copied perfectly. */
	M.slabT = function (q, eps, mu, d) {
		var k0 = 2 * PI, kx2 = q * q * k0 * k0, kz0 = csqrt(cx(k0 * k0 - kx2, 1e-30)), k2 = csqrt(sub(mul(mul(eps, mu), cx(k0 * k0)), cx(kx2))), D = cx(d);
		var p1 = kz0, p2 = div(k2, mu), eta = div(p2, p1), s = add(eta, div(cx(1), eta));
		var den = sub(ccos(mul(k2, D)), mul(cx(0, 0.5), mul(s, csin(mul(k2, D))))), t = div(cx(1), den);
		return mul(t, cexp(mul(cx(0, 1), mul(kz0, D))));
	};
	M.freeT = function (q, d) { var k0 = 2 * PI, kz0 = csqrt(cx(k0 * k0 * (1 - q * q), 1e-30)); return cexp(mul(cx(0, 1), mul(kz0, cx(d)))); };   // same path with no slab: evanescent detail decays
	/* the largest kx (in k0) still copied with |T| between 0.5 and 2; the finest resolvable period is lambda / that */
	M.resolution = function (eps, mu, d, qMax) {
		qMax = qMax || 12; var last = 0;
		for (var q = 0; q <= qMax; q += 0.01) { var a = cabs(M.slabT(q, eps, mu, d)); if (a >= 0.5 && a <= 2) last = q; else if (q > 1.05) break; }
		return last;
	};

	/* ---------- Drude model ----------  eps(w) = 1 - wp^2 / (w (w + i g)), time dependence exp(-i w t). Same form for mu with wm. */
	M.drude = function (w, wp, g) { return sub(cx(1), div(cx(wp * wp), mul(cx(w), cx(w, g)))); };
	M.drudeWp = function (w, target) { return w * Math.sqrt(1 - target); };   // plasma frequency that gives Re eps = target (< 1) at w when there is no loss
	M.indexFrom = function (eps, mu) {   // n = sqrt(eps) sqrt(mu) with each root's Im >= 0: picks the negative branch when both are negative (Veselago 1968)
		var n = mul(csqrt(eps), csqrt(mu)); return n;
	};

	/* ---------- 2D TMz FDTD with Drude eps and mu ----------
	 * Units: c = 1, cell = 1, eps0 = mu0 = 1, time step dt = 0.5 (2D Courant limit 0.707). Fields Ez (integer nodes), Hx (y + 1/2), Hy (x + 1/2).
	 * Cell kinds: 0 vacuum, 1 dielectric (static eps_r), 2 Drude electric only, 3 Drude electric + magnetic, 4 perfect conductor.
	 * ADE (auxiliary differential equation) currents: dJ/dt = -g J + wp^2 E (in Ez), dM/dt = -g M + wm^2 H (in Hx, Hy), leapfrogged with the fields.
	 * Edges: a graded conducting sponge with matched electric and magnetic conductivity (no reflection at normal incidence for the continuum). */
	function Yee(w, h, opt) {
		opt = opt || {}; this.w = w; this.h = h; this.dt = opt.dt || 0.5; var N = w * h;
		this.Ez = new Float32Array(N); this.Hx = new Float32Array(N); this.Hy = new Float32Array(N); this.Jz = new Float32Array(N); this.Mx = new Float32Array(N); this.My = new Float32Array(N);
		this.kind = new Uint8Array(N); this.er = new Float32Array(N).fill(1); this.sg = new Float32Array(N); this.I = new Float32Array(N);
		this.wp = 0; this.wm = 0; this.g = 0; this.t = 0; this.src = []; this.wl = opt.wl || 20; this.ramp = opt.ramp || 8; this.amp = 1; this.S = opt.sponge || 22;
		this.edges();
	}
	M.Yee = Yee;
	Yee.prototype.edges = function () {
		var w = this.w, h = this.h, S = this.S;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var d = Math.min(x, y, w - 1 - x, h - 1 - y), s = 0; if (d < S) { var q = (S - d) / S; s = 0.45 * q * q * q; } this.sg[y * w + x] = s; }
	};
	Yee.prototype.omega = function () { return 2 * PI / this.wl; };
	/* set the Drude material so that at the source frequency eps = epsT and mu = muT (real parts, before loss), with loss rate g = loss * omega */
	Yee.prototype.material = function (epsT, muT, loss) {
		var om = this.omega(); this.wp = M.drudeWp(om, epsT); this.wm = M.drudeWp(om, muT); this.g = (loss || 0) * om;
	};
	Yee.prototype.paint = function (fn) { /* fn(x, y) -> null (leave) or {kind, er} */
		for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) { var v = fn(x, y); if (v) { var i = y * this.w + x; this.kind[i] = v.kind; this.er[i] = v.er || 1; } }
	};
	Yee.prototype.clearFields = function () { [this.Ez, this.Hx, this.Hy, this.Jz, this.Mx, this.My, this.I].forEach(function (a) { a.fill(0); }); this.t = 0; };
	Yee.prototype.drive = function () { var om = this.omega(), T = this.wl, r = Math.min(1, this.t * this.dt / (this.ramp * T)); r = r * r * (3 - 2 * r); return Math.sin(om * this.t * this.dt) * r; };
	Yee.prototype.step = function () {
		var w = this.w, h = this.h, dt = this.dt, Ez = this.Ez, Hx = this.Hx, Hy = this.Hy, Jz = this.Jz, Mx = this.Mx, My = this.My, kind = this.kind, er = this.er, sg = this.sg;
		var g = this.g, ca = (1 - g * dt / 2) / (1 + g * dt / 2), cbE = dt * this.wp * this.wp / (1 + g * dt / 2), cbH = dt * this.wm * this.wm / (1 + g * dt / 2), x, y, i, k, s, cE;
		/* H at n+1/2 from E at n and M at n */
		for (y = 0; y < h - 1; y++) for (x = 0, i = y * w; x < w - 1; x++, i++) {
			k = kind[i]; if (k === 4) { Hx[i] = 0; Hy[i] = 0; continue; }
			s = sg[i] * dt / 2;
			var cex = Ez[i + w] - Ez[i], cey = Ez[i + 1] - Ez[i];
			if (k === 3) { Hx[i] = (Hx[i] * (1 - s) - dt * (cex + Mx[i])) / (1 + s); Hy[i] = (Hy[i] * (1 - s) + dt * (cey - My[i])) / (1 + s); Mx[i] = ca * Mx[i] + cbH * Hx[i]; My[i] = ca * My[i] + cbH * Hy[i]; }
			else { Hx[i] = (Hx[i] * (1 - s) - dt * cex) / (1 + s); Hy[i] = (Hy[i] * (1 - s) + dt * cey) / (1 + s); }
		}
		/* J at n+1/2 from E at n, then E at n+1 */
		for (y = 1; y < h - 1; y++) for (x = 1, i = y * w + 1; x < w - 1; x++, i++) {
			k = kind[i]; if (k === 4) { Ez[i] = 0; continue; }
			s = sg[i] * dt / 2; var curl = (Hy[i] - Hy[i - 1]) - (Hx[i] - Hx[i - w]);
			if (k === 2 || k === 3) { Jz[i] = ca * Jz[i] + cbE * Ez[i]; Ez[i] = (Ez[i] * (1 - s) + dt * (curl - Jz[i])) / (1 + s); }
			else { cE = dt / er[i]; Ez[i] = (Ez[i] * (1 - s) + cE * curl) / (1 + s); }
		}
		this.t++;
		var src = this.src; for (var q = 0; q < src.length; q++) { var p = src[q]; Ez[p.i] += p.a * this.phased(p); }
		var I = this.I; for (i = 0; i < I.length; i++) I[i] = I[i] * 0.99 + Ez[i] * Ez[i] * 0.01;
	};
	Yee.prototype.phased = function (p) { var om = this.omega(), T = this.wl, r = Math.min(1, this.t * this.dt / (this.ramp * T)); r = r * r * (3 - 2 * r); return Math.sin(om * this.t * this.dt - (p.ph || 0)) * r * this.amp; };
	Yee.prototype.pointSource = function (x, y, a) { this.src = [{ i: (y | 0) * this.w + (x | 0), a: a || 0.5 }]; };
	/* a soft line source across the beam, emitters in phase along a line tilted so the beam leaves at `deg` (0 = +x, y down), Gaussian amplitude profile */
	Yee.prototype.beamSource = function (x, y, deg, width, a) {
		var src = [], t = deg * DEG, px = -Math.sin(t), py = Math.cos(t), n = Math.round(width * 1.6), seen = {};
		for (var k = 0; k <= n; k++) {
			var s = (k / n - 0.5) * width * 1.6, xx = Math.round(x + px * s), yy = Math.round(y + py * s); if (xx < 1 || yy < 1 || xx >= this.w - 1 || yy >= this.h - 1) continue;
			var i = yy * this.w + xx; if (seen[i]) continue; seen[i] = 1;
			var e = Math.exp(-Math.pow(s / (width * 0.45), 2)), q = this.wl / 4, x2 = Math.round(xx + q * Math.cos(t)), y2 = Math.round(yy + q * Math.sin(t));
			/* two rows a quarter wavelength apart, a quarter period apart in time: their waves add forward and cancel backward (a one-way line source) */
			src.push({ i: i, a: (a || 0.16) * e, ph: 0 }); if (x2 > 0 && y2 > 0 && x2 < this.w - 1 && y2 < this.h - 1) src.push({ i: y2 * this.w + x2, a: (a || 0.16) * e, ph: Math.PI / 2 });
		}
		this.src = src;
	};
	Yee.prototype.energy = function () { var e = 0, Ez = this.Ez, Hx = this.Hx, Hy = this.Hy; for (var i = 0; i < Ez.length; i++) e += Ez[i] * Ez[i] + Hx[i] * Hx[i] + Hy[i] * Hy[i]; return e; };

	/* ---------- Fraunhofer diffraction ----------
	 * N slits of width a, centre spacing d (same length unit as lambda). I(theta) / I(0) = sinc^2(beta) * [sin(N alpha) / (N sin alpha)]^2,
	 * beta = pi a sin(theta) / lambda, alpha = pi d sin(theta) / lambda. */
	function sinc(x) { return Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x; }
	M.fraunhofer = function (sinT, lam, a, d, N) {
		var b = PI * a * sinT / lam, env = sinc(b); env *= env; if (!(N > 1)) return env;
		var al = PI * d * sinT / lam, s = Math.sin(al), arr;
		if (Math.abs(s) < 1e-9) arr = 1; else { arr = Math.sin(N * al) / (N * s); arr *= arr; }
		return env * arr;
	};
	M.slitMinima = function (lam, a, maxM) { var out = []; for (var m = 1; m <= (maxM || 5); m++) { var s = m * lam / a; if (s > 1) break; out.push({ m: m, deg: Math.asin(s) / DEG }); } return out; };
	M.orders = function (lam, d, a, maxM) {   // grating / double-slit principal maxima m lambda = d sin theta; flags orders that fall on a single-slit zero (missing orders)
		var out = []; for (var m = 0; m <= (maxM || 20); m++) { var s = m * lam / d; if (s > 1) break; var miss = a > 0 && m > 0 && Math.abs((m * a / d) - Math.round(m * a / d)) < 1e-6 && Math.round(m * a / d) >= 1; out.push({ m: m, deg: Math.asin(s) / DEG, missing: miss }); } return out;
	};
	M.resolvingPower = function (N, m) { return N * m; };
	M.screenY = function (deg, L) { return L * Math.tan(deg * DEG); };

	/* ---------- properties-of-light helpers ---------- */
	M.malus = function (I0, deg) { var c = Math.cos(deg * DEG); return I0 * c * c; };
	M.cauchyBK7 = function (nm) { var um = nm / 1000; return 1.5046 + 0.00420 / (um * um); };   // BK7 crown glass, Cauchy fit (n_D = 1.5168 at 589 nm)
	M.prismDeviation = function (n, apexDeg, inDeg) {   // ray through a prism: deviation in degrees, or null (internal reflection)
		var A = apexDeg * DEG, i1 = inDeg * DEG, r1 = Math.asin(Math.sin(i1) / n), r2 = A - r1, s = n * Math.sin(r2); if (Math.abs(s) > 1) return null;
		return (i1 + Math.asin(s) - A) / DEG;
	};
	M.groupSpeed = function (ng) { return M.C / ng; };
	M.twoSource = function (x, y, sep, lam) {   // intensity of two in-phase point sources at (0, +-sep/2) seen at (x, y)
		var r1 = Math.hypot(x, y - sep / 2), r2 = Math.hypot(x, y + sep / 2), ph = 2 * PI * (r1 - r2) / lam; return 2 + 2 * Math.cos(ph);
	};
	/* Pendry cylindrical cloak (2006): the physical point of radius r' = R1 + r (R2 - R1) / R2 (for r < R2) shows what the empty-space point r would.
	 * A ray that is a straight line in empty space is mapped point by point: inside the shell it bends around the hidden core (r' < R1 is never reached). */
	M.cloakMap = function (x, y, R1, R2) { var r = Math.hypot(x, y); if (r >= R2 || r === 0) return [x, y]; var rp = R1 + r * (R2 - R1) / R2, k = rp / r; return [x * k, y * k]; };
	M.cloakRay = function (y0, R1, R2, xMin, xMax, steps) {
		var pts = [], n = steps || 400; for (var i = 0; i <= n; i++) { var x = xMin + (xMax - xMin) * i / n, p = M.cloakMap(x, y0, R1, R2); pts.push(p[0], p[1]); } return pts;
	};

	/* ---------- light and colour ---------- */
	M.wlToRgb = function (nm) {   // Bruton's approximation, 380-780 nm
		var r = 0, g = 0, b = 0, w = nm;
		if (w >= 380 && w < 440) { r = -(w - 440) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = -(w - 510) / 20; }
		else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = -(w - 645) / 65; } else if (w <= 780) { r = 1; }
		var f = w >= 380 && w < 420 ? 0.3 + 0.7 * (w - 380) / 40 : w > 700 && w <= 780 ? 0.3 + 0.7 * (780 - w) / 80 : w >= 420 && w <= 700 ? 1 : 0;
		if (w < 380 || w > 780) return [0, 0, 0];
		function c(x) { return Math.round(255 * Math.pow(Math.max(0, x * f), 0.8)); }
		return [c(r), c(g), c(b)];
	};
	M.sig = function (x, n) { if (!isFinite(x)) return String(x); if (x === 0) return "0"; var a = Math.abs(x); if (a >= 1e6 || a < 1e-3) { var e = x.toExponential(Math.max(0, (n || 3) - 1)); var m = /^(-?[\d.]+)e([+-]?\d+)$/.exec(e); return m ? m[1] + " × 10^" + (+m[2]) : e; } return String(parseFloat(x.toPrecision(n || 4))); };

	/* diffraction presets (lengths in micrometres, lambda in nm) */
	M.DIFF_PRESETS = [
		{ id: "slit", name: "Single slit", lam: 633, a: 20, d: 0, N: 1, L: 2, note: "One gap 20 µm wide lit by a red He-Ne laser. The central bright band is twice as wide as the others; dark bands sit where a sin θ = m λ." },
		{ id: "young", name: "Double slit (Young)", lam: 532, a: 20, d: 100, N: 2, L: 2, note: "Two 20 µm slits 100 µm apart, green laser. Fine fringes from the two slits (spacing λL/d) inside the wide single-slit envelope." },
		{ id: "missing", name: "Double slit, missing orders", lam: 633, a: 25, d: 75, N: 2, L: 1.5, note: "d = 3a, so every 3rd interference maximum lands exactly on a single-slit zero and disappears." },
		{ id: "grating", name: "Grating, 600 lines/mm", lam: 589, a: 0.8, d: 1.667, N: 40, L: 0.5, note: "A teaching grating. With many slits the maxima become sharp lines at d sin θ = m λ: this is how spectrometers spread light into colours. (Only 40 slits are drawn so the lines keep some width.)" },
		{ id: "cd", name: "CD track (1.6 µm)", lam: 650, a: 0.6, d: 1.6, N: 30, L: 0.3, note: "The spiral track of a CD is 1.6 µm apart, so it acts as a reflection grating: that is the rainbow on a CD." },
		{ id: "hair", name: "A hair (about 70 µm)", lam: 650, a: 70, d: 0, N: 1, L: 3, note: "By Babinet's principle, a thin hair makes the same pattern as a slit of the same width. Measure the dark-band spacing to find the hair's thickness." }
	];

	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESMeta = M;
})(typeof window !== "undefined" ? window : this);

/* MES Light & Metamaterials Lab (mes.fm/negative-index). Maths in lib.js (MESMeta). Four tabs:
 * neg  = ray picture of negative refraction (one surface, Veselago flat lens) + the perfect-lens transfer function;
 * wave = live 2D FDTD with Drude eps and mu (flat lens, angled beam);
 * diff = Fraunhofer diffraction calculator (slit, double slit, grating, white light);
 * light = ten small live demos of what light does. State: localStorage mes-negative-index:v1; links ?tab= */
(function () {
	"use strict";
	var M = window.MESMeta, root = document.getElementById("ni"); if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); }, KEY = "mes-negative-index:v1", DEG = Math.PI / 180, TAU = Math.PI * 2;
	var DEF = { tab: "neg", r: { mode: "iface", n: -1, ang: 35, d: 2, s: 1, pd: 0.25, pl: -2 }, w: { scene: "lens", mat: "nim1", loss: 0.02, br: 1.4, speed: 5, view: "field", sx: 80, sy: 90 },
		d: { pre: "young", lam: 532, a: "20", d: "100", N: 2, L: "2", white: false, ax: "y", z: -1 }, l: { demo: "refl", p: {} } };
	var S = JSON.parse(JSON.stringify(DEF));
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in DEF) { if (typeof DEF[k] === "object") { for (var j in DEF[k]) if (sv[k] && sv[k][j] != null) S[k][j] = sv[k][j]; } else if (sv[k] != null) S[k] = sv[k]; } } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
	function num(s) { var v = Number(String(s == null ? "" : s).trim().replace(/,/g, ".")); return v; }
	var fmt = M.sig;
	function fitCanvas(c, aspect, minH, maxH) {
		var w = Math.max(260, c.parentNode.clientWidth || 600), h = Math.round(w * aspect); h = Math.max(minH || 200, Math.min(maxH || 9999, h));
		var d = window.devicePixelRatio || 1;
		if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.height = h + "px"; }
		var x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return { x: x, w: w, h: h };
	}
	function text(x, t, px, py, size, col, al, base) { x.font = (size || 13) + "px system-ui,Helvetica,Arial,sans-serif"; x.fillStyle = col || "#cfd6e6"; x.textAlign = al || "left"; x.textBaseline = base || "middle"; x.fillText(t, px, py); }
	function line(x, x0, y0, x1, y1, col, wd, dash) { x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.strokeStyle = col; x.lineWidth = wd || 1.5; x.setLineDash(dash || []); x.stroke(); x.setLineDash([]); }
	function arrow(x, x0, y0, x1, y1, col, wd) { line(x, x0, y0, x1, y1, col, wd); var a = Math.atan2(y1 - y0, x1 - x0), s = 8; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x1 - s * Math.cos(a - 0.4), y1 - s * Math.sin(a - 0.4)); x.lineTo(x1 - s * Math.cos(a + 0.4), y1 - s * Math.sin(a + 0.4)); x.closePath(); x.fillStyle = col; x.fill(); }
	function maxH() { return Math.round(window.innerHeight * 0.72); }
	function card(h, big, small, cls) { return "<div class='ni-card'><h4>" + h + "</h4><span class='ni-big" + (cls ? " " + cls : "") + "'>" + big + "</span>" + (small ? "<small>" + small + "</small>" : "") + "</div>"; }
	function segInit(id, get, set) {
		var el = $(id); function paint() { [].forEach.call(el.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(get()) === b.getAttribute("data-v") ? "true" : "false"); }); }
		paint(); el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; set(b.getAttribute("data-v")); paint(); save(); });
		return paint;
	}
	function ptr(c, e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	var COL = { ray: "#ffd166", refl: "rgba(255,209,102,0.35)", pos: "#5ec8ff", neg: "#ff6fb5", norm: "rgba(220,226,240,0.45)", txt: "#dfe5f2", mut: "#9aa6bb" };

	/* ---------- tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll(".ni-tabs button")), panels = [].slice.call(root.querySelectorAll("[data-panel]"));
	function showTab(t, keep) {
		if (["neg", "wave", "diff", "light"].indexOf(t) < 0) t = "neg";
		S.tab = t; tabs.forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
		if (!keep) save(); redraw();
	}
	tabs.forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });

	/* =========================== shared: one surface =========================== */
	function drawIface(x, w, h, n, angDeg, opt) {
		opt = opt || {}; var cy = h * 0.5, ox = w * 0.5, L = Math.min(w, h) * 0.46, neg = n < 0, mc = neg ? COL.neg : COL.pos;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		var gr = x.createLinearGradient(0, cy, 0, h); gr.addColorStop(0, neg ? "rgba(255,111,181,0.28)" : "rgba(94,200,255,0.22)"); gr.addColorStop(1, neg ? "rgba(255,111,181,0.08)" : "rgba(94,200,255,0.06)");
		x.fillStyle = gr; x.fillRect(0, cy, w, h - cy);
		line(x, 0, cy, w, cy, "rgba(230,235,245,0.7)", 1.5);
		line(x, ox, cy - L * 1.05, ox, cy + L * 1.05, COL.norm, 1.2, [6, 5]);
		text(x, "n₁ = " + fmt(opt.n1 || 1, 3), 12, 18, 13, COL.txt); text(x, "n₂ = " + fmt(n, 3) + (neg ? "  (negative index)" : ""), 12, h - 16, 13, mc);
		var n1 = opt.n1 || 1, t = angDeg * DEG, ix = ox - L * Math.sin(t), iy = cy - L * Math.cos(t);
		arrow(x, ix, iy, ox - L * 0.45 * Math.sin(t), cy - L * 0.45 * Math.cos(t), COL.ray, 3); line(x, ox - L * 0.47 * Math.sin(t), cy - L * 0.47 * Math.cos(t), ox, cy, COL.ray, 3);
		var R = n > 0 ? M.reflectance(n1, n, angDeg) : 0.05, t2 = Math.abs(n) < 1e-6 ? null : M.snell(n1, n, angDeg);
		if (t2 === null) R = 1;
		x.globalAlpha = 0.25 + 0.75 * Math.min(1, R * 3); arrow(x, ox, cy, ox + L * 0.8 * Math.sin(t), cy - L * 0.8 * Math.cos(t), "#ffd166", 2); x.globalAlpha = 1;
		x.beginPath(); x.arc(ox, cy, 38, -Math.PI / 2 - t, -Math.PI / 2); x.strokeStyle = COL.ray; x.lineWidth = 1.2; x.stroke(); text(x, "θ₁ = " + fmt(angDeg, 3) + "°", ox - 44 - 40 * Math.sin(t / 2), cy - 52, 12, COL.ray, "right");
		if (t2 !== null) {
			var u = t2 * DEG, ex = ox + L * Math.sin(u), ey = cy + L * Math.cos(u);
			arrow(x, ox, cy, ex, ey, mc, 3);
			x.beginPath(); if (u >= 0) x.arc(ox, cy, 44, Math.PI / 2 - u, Math.PI / 2); else x.arc(ox, cy, 44, Math.PI / 2, Math.PI / 2 - u); x.strokeStyle = mc; x.lineWidth = 1.2; x.stroke();
			text(x, "θ₂ = " + fmt(t2, 3) + "°", ox + (u >= 0 ? 52 : -52), cy + 62, 12, mc, u >= 0 ? "left" : "right");
			if (opt.arrows !== false) {   // energy flow vs wave vector inside the material
				var mx = ox + L * 0.62 * Math.sin(u), my = cy + L * 0.62 * Math.cos(u), px = Math.cos(u), py = -Math.sin(u), off = 16;
				arrow(x, mx + px * off, my + py * off, mx + px * off + 28 * Math.sin(u), my + py * off + 28 * Math.cos(u), "#e9eef8", 1.6); text(x, "energy", mx + px * (off + 6) + 32 * Math.sin(u), my + py * (off + 6) + 32 * Math.cos(u), 11, "#e9eef8");
				var sg = neg ? -1 : 1; arrow(x, mx - px * off, my - py * off, mx - px * off + sg * 28 * Math.sin(u), my - py * off + sg * 28 * Math.cos(u), "#9ef0a8", 1.6); text(x, neg ? "wavefronts (backward)" : "wavefronts", mx - px * (off + 8) + sg * 30 * Math.sin(u), my - py * (off + 8) + sg * 30 * Math.cos(u), 11, "#9ef0a8", "right");
			}
		} else text(x, "no refracted ray: all of it reflects", ox + 14, cy + 30, 13, COL.ray);
		return { t2: t2, R: R };
	}

	/* =========================== 1. NEGATIVE REFRACTION =========================== */
	var RR = S.r, rc = $("ni-r"), rHint = $("ni-r-hint");
	var NCH = [["−2", -2], ["−1", -1], ["−0.5", -0.5], ["+1 (air)", 1], ["+1.33 (water)", 1.33], ["+1.5 (glass)", 1.5], ["+2.42 (diamond)", 2.42]];
	$("ni-r-nch").innerHTML = NCH.map(function (c) { return "<button type='button' data-v='" + c[1] + "'>n = " + c[0] + "</button>"; }).join("");
	$("ni-r-nch").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; RR.n = +b.getAttribute("data-v"); $("ni-r-n").value = RR.n; rUpdate(); });
	var paintMode = segInit("ni-r-mode", function () { return RR.mode; }, function (v) { RR.mode = v; rUpdate(); });
	[["ni-r-n", "n"], ["ni-r-a", "ang"], ["ni-r-d", "d"], ["ni-r-s", "s"]].forEach(function (p) { var el = $(p[0]); el.value = RR[p[1]]; el.addEventListener("input", function () { RR[p[1]] = +el.value; rUpdate(); }); });
	var lensGeo = null;
	function rDraw() {
		var f = fitCanvas(rc, RR.mode === "lens" ? 0.5 : 0.58, 240, maxH()), x = f.x, w = f.w, h = f.h, n = Math.abs(RR.n) < 0.005 ? 0.005 : RR.n;
		if (RR.mode === "iface") { drawIface(x, w, h, n, RR.ang); rHint.textContent = "Drag above the surface to aim the ray"; return; }
		rHint.textContent = "Drag the source left and right";
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		var span = Math.max(8, RR.s + RR.d * 2.2 + 1.5), k = w / span, sx0 = (RR.s + 0.6) * k, cy = h / 2, sl = sx0, sr = sx0 + RR.d * k, neg = n < 0, mc = neg ? COL.neg : COL.pos;
		x.fillStyle = neg ? "rgba(255,111,181,0.22)" : "rgba(94,200,255,0.18)"; x.fillRect(sl, 0, sr - sl, h); line(x, sl, 0, sl, h, mc, 1.2); line(x, sr, 0, sr, h, mc, 1.2);
		text(x, "n = " + fmt(n, 3), (sl + sr) / 2, 16, 13, mc, "center"); line(x, 0, cy, w, cy, COL.norm, 1, [4, 6]);
		var srcX = sx0 - RR.s * k, res = M.slabRays(n, RR.s, RR.d, span, [-56, -48, -40, -32, -24, -16, -8, -3, 3, 8, 16, 24, 32, 40, 48, 56]);
		x.save(); x.beginPath(); x.rect(0, 0, w, h); x.clip();
		res.rays.forEach(function (r) {
			x.beginPath(); for (var i = 0; i < r.pts.length; i += 2) { var px = srcX + r.pts[i] * k, py = cy + r.pts[i + 1] * k; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
			x.strokeStyle = r.tir ? "rgba(255,209,102,0.35)" : "rgba(255,209,102,0.85)"; x.lineWidth = 1.4; x.stroke();
		});
		x.restore();
		x.beginPath(); x.arc(srcX, cy, 7, 0, TAU); x.fillStyle = "#fff4c2"; x.fill(); text(x, "source", srcX, cy - 16, 12, COL.txt, "center");
		var fo = res.foci;
		[["image 1 (inside)", fo.inside], ["image 2", fo.outside]].forEach(function (q) { if (q[1] == null) return; var px = srcX + q[1] * k; if (px > w) return; x.beginPath(); x.arc(px, cy, 9, 0, TAU); x.strokeStyle = "#9ef0a8"; x.lineWidth = 2; x.setLineDash([3, 3]); x.stroke(); x.setLineDash([]); text(x, q[0], px, cy + 22, 12, "#9ef0a8", "center"); });
		lensGeo = { k: k, sx0: sx0 };
	}
	function rUpdate() {
		$("ni-r-n-v").textContent = fmt(RR.n, 3) + (RR.n < 0 ? " (negative)" : ""); $("ni-r-a-v").textContent = fmt(RR.ang, 3) + "°"; $("ni-r-d-v").textContent = fmt(RR.d, 3) + " units"; $("ni-r-s-v").textContent = fmt(RR.s, 3) + " units";
		$("ni-r-n").value = RR.n; $("ni-r-a").value = RR.ang; $("ni-r-s").value = RR.s;
		[].forEach.call(root.querySelectorAll("[data-only]"), function (el) { el.hidden = el.getAttribute("data-only") !== RR.mode; });
		[].forEach.call($("ni-r-nch").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-v") === RR.n ? "true" : "false"); });
		paintMode(); rDraw();
		var n = Math.abs(RR.n) < 0.005 ? 0.005 : RR.n, cards = $("ni-r-cards"), res = $("ni-r-res");
		if (RR.mode === "iface") {
			var t2 = M.snell(1, n, RR.ang), cr = M.critical(1, n);
			cards.innerHTML = card("Incoming angle θ₁", fmt(RR.ang, 4) + "°") + card("Refracted angle θ₂", t2 === null ? "none" : fmt(t2, 4) + "°", t2 === null ? "total internal reflection" : t2 < 0 ? "same side of the normal" : "other side of the normal", t2 !== null && t2 < 0 ? "ni-neg" : "ni-pos") +
				card("Speed of the wavefronts", "c / " + fmt(Math.abs(n), 3), n < 0 ? "they run backward, toward the surface" : "forward") + card("Critical angle", cr == null ? "none" : fmt(cr, 4) + "°", cr == null ? "light can always enter" : "above this nothing gets in");
			res.innerHTML = "<p class='tu-note'>Snell's law: 1 × sin " + fmt(RR.ang, 4) + "° = " + fmt(n, 4) + " × sin θ₂, so sin θ₂ = " + fmt(Math.sin(RR.ang * DEG) / n, 4) + ". " +
				(n < 0 ? "A negative index gives a negative angle: the ray leaves on the <b>same side</b> of the normal it arrived from. Inside, the wavefronts move backward (toward the surface, green arrow) while the energy moves away from it (white arrow): the wave vector and the energy flow point in opposite directions. That is why such materials are also called <b>left-handed</b>." : "An ordinary material: the ray crosses to the other side of the normal and bends toward it when n &gt; 1.") + "</p>";
		} else {
			var fo = M.slabFoci(n, RR.s, RR.d), miss = M.slabMiss(n, RR.s, RR.d, 40);
			cards.innerHTML = card("Image inside the slab", fo.inside == null ? "none" : fmt(fo.inside - RR.s, 4) + " units in", n < 0 ? "from the front face" : "a positive slab never focuses") +
				card("Image behind the slab", fo.outside == null ? "none" : fmt(fo.outside - RR.s - RR.d, 4) + " units out", fo.outside == null && n < 0 ? "the source is too far: d/|n| < a" : "from the back face") +
				card("Blur of a 40° ray", miss == null ? "–" : (Math.abs(miss) < 1e-9 ? "0" : fmt(Math.abs(miss), 3)) + " units", Math.abs(RR.n + 1) < 0.005 ? "n = −1 focuses every ray" : "paraxial focus vs a steep ray");
			res.innerHTML = "<p class='tu-note'>Veselago's flat lens (1968): a slab with n = −1 bends every ray back toward the axis, so all rays from the source meet again <b>inside</b> the slab (as far in as the source is in front) and again <b>behind</b> it (at d − a). Unlike a glass lens it has no axis and no focal length: move the source sideways and the image follows. It only images objects closer than the slab is thick. With any other negative index the rays no longer meet at one point (the blur number above), and with a positive index nothing focuses at all.</p>";
		}
		save();
	}
	function rPointer(e) {
		var p = ptr(rc, e), w = rc.clientWidth, h = rc.clientHeight;
		if (RR.mode === "iface") { var dx = p.x - w / 2, dy = h / 2 - p.y; if (dy < 4) return; RR.ang = Math.round(Math.min(85, Math.max(0, Math.abs(Math.atan2(dx, dy)) / DEG)) * 2) / 2; }
		else if (lensGeo) { var s = (lensGeo.sx0 - p.x) / lensGeo.k; RR.s = Math.round(Math.max(0.1, Math.min(4, s)) * 20) / 20; }
		rUpdate();
	}
	var rDrag = false;
	rc.addEventListener("pointerdown", function (e) { rDrag = true; rc.setPointerCapture(e.pointerId); rPointer(e); });
	rc.addEventListener("pointermove", function (e) { if (rDrag) rPointer(e); });
	rc.addEventListener("pointerup", function () { rDrag = false; }); rc.addEventListener("pointercancel", function () { rDrag = false; });
	rc.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { var s = e.key === "ArrowLeft" ? -1 : 1; if (RR.mode === "iface") RR.ang = Math.max(0, Math.min(85, RR.ang + s)); else RR.s = Math.max(0.1, Math.min(4, RR.s - s * 0.05)); rUpdate(); e.preventDefault(); } });

	/* perfect lens transfer function */
	var pc = $("ni-p");
	[["ni-p-d", "pd"], ["ni-p-l", "pl"]].forEach(function (p) { var el = $(p[0]); el.value = RR[p[1]]; el.addEventListener("input", function () { RR[p[1]] = +el.value; pUpdate(); }); });
	function pUpdate() {
		var d = RR.pd, del = Math.pow(10, RR.pl); $("ni-p-d-v").textContent = fmt(d, 3) + " λ"; $("ni-p-l-v").textContent = fmt(del, 2);
		var f = fitCanvas(pc, 0.42, 220, 420), x = f.x, w = f.w, h = f.h, L = 46, Rm = 14, T = 16, B = 34, qMax = 6, yMin = -3, yMax = 2;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		function X(q) { return L + (w - L - Rm) * q / qMax; } function Y(v) { var l = Math.log10(Math.max(1e-6, v)); return T + (h - T - B) * (yMax - Math.max(yMin, Math.min(yMax, l))) / (yMax - yMin); }
		for (var e = yMin; e <= yMax; e++) { line(x, L, Y(Math.pow(10, e)), w - Rm, Y(Math.pow(10, e)), "rgba(255,255,255,0.08)", 1); text(x, e === 0 ? "1" : "10" + (e < 0 ? "⁻" : "") + "⁰¹²³"[Math.abs(e)], L - 6, Y(Math.pow(10, e)), 11, COL.mut, "right"); }
		for (var q = 0; q <= qMax; q++) { line(x, X(q), T, X(q), h - B, "rgba(255,255,255,0.06)", 1); text(x, String(q), X(q), h - B + 12, 11, COL.mut, "center"); }
		text(x, "detail finer than this needs evanescent waves →", X(1) + 6, T + 8, 11, "#ffd166"); line(x, X(1), T, X(1), h - B, "rgba(255,209,102,0.6)", 1.2, [4, 4]);
		text(x, "fineness of detail kₓ / k₀  (period = λ / that)", (L + w) / 2, h - 8, 11, COL.mut, "center");
		function curve(fn, col, wd, dash) { x.beginPath(); for (var i = 0; i <= 400; i++) { var qq = qMax * i / 400, v = fn(qq), px = X(qq), py = Y(v); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.strokeStyle = col; x.lineWidth = wd; x.setLineDash(dash || []); x.stroke(); x.setLineDash([]); }
		curve(function (qq) { return M.cx.abs(M.freeT(qq, d)); }, "#9aa6bb", 2, [5, 4]);
		curve(function (qq) { return M.cx.abs(M.slabT(qq, [-1, del], [-1, del], d)); }, "#ff6fb5", 2.6);
		curve(function (qq) { return M.cx.abs(M.slabT(qq, [-1, 1e-12], [-1, 1e-12], d)); }, "#9ef0a8", 2, [7, 5]);
		var lx = w - Rm - 8; text(x, "no lens (same distance)", lx, T + 26, 11, "#c9d1df", "right"); text(x, "lossless n = −1 slab", lx, T + 42, 11, "#9ef0a8", "right"); text(x, "slab with your loss", lx, T + 58, 11, "#ff6fb5", "right");
		var q1 = M.resolution([-1, del], [-1, del], d, 40), q0 = 1;
		$("ni-p-res").innerHTML = "<p>With loss " + fmt(del, 2) + " and a slab " + fmt(d, 3) + " λ thick, detail is copied up to k<sub>x</sub> ≈ <b>" + fmt(q1, 3) + " k₀</b>, i.e. features down to a period of about <b>λ / " + fmt(q1, 3) + "</b> (an ordinary lens stops at λ, kₓ = k₀: " + fmt(q1 / q0, 3) + "× finer). Pendry's rule of thumb: the limit grows only like ln(1/loss) / thickness, so halving the loss buys little and a thin slab helps most.</p>";
		save();
	}

	/* =========================== 2. WAVE SIMULATION =========================== */
	var W = 300, H = 180, WL = 20, Wv = S.w, wc = $("ni-w"), yee = null, img = null, off = document.createElement("canvas"), peak = 0.05, running = true;
	off.width = W; off.height = H; var octx = off.getContext("2d");
	var MATS = [
		{ id: "nim1", name: "Metamaterial: ε = μ = −1 (n = −1)", eps: -1, mu: -1, kind: 3 },
		{ id: "nim2", name: "Metamaterial: ε = μ = −2 (n = −2)", eps: -2, mu: -2, kind: 3 },
		{ id: "eneg", name: "Only ε negative (like a metal): ε = −1, μ = +1", eps: -1, mu: 1, kind: 2 },
		{ id: "glass", name: "Ordinary glass: n = +1.5", eps: 2.25, mu: 1, kind: 1 },
		{ id: "none", name: "Nothing (empty space)", eps: 1, mu: 1, kind: 0 }];
	$("ni-w-mat").innerHTML = MATS.map(function (m) { return "<option value='" + m.id + "'>" + esc(m.name) + "</option>"; }).join("");
	function matOf() { return MATS.filter(function (m) { return m.id === Wv.mat; })[0] || MATS[0]; }
	function slabX0() { return Wv.scene === "lens" ? 110 : 150; } function slabX1() { return Wv.scene === "lens" ? 170 : W; }
	function wBuild() {
		var m = matOf(); yee = new M.Yee(W, H, { wl: WL }); yee.material(m.kind >= 2 ? m.eps : 1, m.kind === 3 ? m.mu : 1, Wv.loss);
		var x0 = slabX0(), x1 = slabX1(); if (m.kind) yee.paint(function (x) { return x >= x0 && x < x1 ? { kind: m.kind, er: m.eps } : null; });
		wSource(); peak = 0.05; wCards();
	}
	function wSource() { if (!yee) return; if (Wv.scene === "lens") { Wv.sx = Math.max(28, Math.min(slabX0() - 4, Wv.sx)); Wv.sy = Math.max(28, Math.min(H - 28, Wv.sy)); yee.pointSource(Wv.sx, Wv.sy, 1); } else yee.beamSource(50, 40, 30, 22, 0.2); }
	function nReal(m) { var om = yee ? yee.omega() : TAU / WL; if (m.kind === 1) return Math.sqrt(m.eps); if (m.kind === 0) return 1; var e = m.kind >= 2 ? M.drude(om, M.drudeWp(om, m.eps), Wv.loss * om) : [1, 0], u = m.kind === 3 ? M.drude(om, M.drudeWp(om, m.mu), Wv.loss * om) : [1, 0]; return { e: e, u: u, n: M.indexFrom(e, u) }; }
	function cfmt(z) { return fmt(z[0], 3) + (Math.abs(z[1]) > 5e-4 ? (z[1] >= 0 ? " + " : " − ") + fmt(Math.abs(z[1]), 2) + "i" : ""); }
	function wCards() {
		var m = matOf(), r = nReal(m), cards = $("ni-w-cards"), per = yee ? yee.t * yee.dt / WL : 0, nn = typeof r === "number" ? r : r.n[0];
		cards.innerHTML = (typeof r === "number" ? card("Refractive index", fmt(r, 3), m.kind === 1 ? "a plain dielectric, ε = " + fmt(m.eps, 3) : "vacuum") :
			card("ε at the source frequency", cfmt(r.e), "Drude model") + card("μ at the source frequency", cfmt(r.u), m.kind === 3 ? "Drude model" : "ordinary (not magnetic)") + card("Index n = √ε √μ", cfmt(r.n), Math.abs(r.n[0]) < 0.05 ? "imaginary: the wave cannot travel in it" : r.n[0] < 0 ? "negative: backward phase" : "")) +
			card("Time", "<span id='ni-w-t'>" + fmt(per, 3) + "</span>", "wave periods") +
			(Wv.scene === "lens" && m.kind === 3 && nn < 0 ? (function () { var a = slabX0() - Wv.sx, dd = slabX1() - slabX0(), f1 = Math.abs(nn) * a, f2 = dd / Math.abs(nn) - a;
				return card("Predicted images (ray optics)", (f1 <= dd ? fmt(f1 / WL, 3) + " λ inside" : "none inside") + " · " + (f2 >= 0 ? fmt(f2 / WL, 3) + " λ behind" : "none behind"), "dashed rings; source " + fmt(a / WL, 3) + " λ in front"); })() : "");
	}
	var wvBtns = [].slice.call(root.querySelectorAll(".ni-views [data-view]"));
	function paintViews() { wvBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === Wv.view ? "true" : "false"); }); }
	wvBtns.forEach(function (b) { b.addEventListener("click", function () { Wv.view = b.getAttribute("data-view"); paintViews(); save(); wDraw(); }); });
	$("ni-w-scene").value = Wv.scene; $("ni-w-mat").value = Wv.mat; $("ni-w-loss").value = Wv.loss; $("ni-w-br").value = Wv.br; $("ni-w-speed").value = Wv.speed;
	$("ni-w-scene").addEventListener("change", function () { Wv.scene = this.value; save(); wBuild(); wDraw(); });
	$("ni-w-mat").addEventListener("change", function () { Wv.mat = this.value; save(); wBuild(); wDraw(); });
	$("ni-w-loss").addEventListener("input", function () { Wv.loss = +this.value; $("ni-w-loss-v").textContent = fmt(Wv.loss, 3) + " of the frequency"; save(); var m = matOf(); if (yee) { yee.material(m.kind >= 2 ? m.eps : 1, m.kind === 3 ? m.mu : 1, Wv.loss); wCards(); } });
	$("ni-w-br").addEventListener("input", function () { Wv.br = +this.value; $("ni-w-br-v").textContent = fmt(Wv.br, 3) + "×"; save(); wDraw(); });
	$("ni-w-speed").addEventListener("change", function () { Wv.speed = +this.value; save(); });
	$("ni-w-loss-v").textContent = fmt(Wv.loss, 3) + " of the frequency"; $("ni-w-br-v").textContent = fmt(Wv.br, 3) + "×";
	$("ni-w-play").addEventListener("click", function () { running = !running; this.textContent = running ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", String(running)); });
	$("ni-w-step").addEventListener("click", function () { for (var i = 0; i < 20; i++) yee.step(); wDraw(); });
	$("ni-w-reset").addEventListener("click", function () { wBuild(); wDraw(); });
	$("ni-w-full").addEventListener("click", function () { var st = wc.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen(); });
	function wDraw() {
		if (!yee) return; var f = fitCanvas(wc, H / W, 200, maxH()), x = f.x, w = f.w, h = f.h, Ez = yee.Ez, I = yee.I, kind = yee.kind, N = W * H, i;
		if (!img) img = octx.createImageData(W, H); var d = img.data, intv = Wv.view === "int", mx = 0;
		for (i = 0; i < N; i++) { var xx = i % W, yy = (i / W) | 0; if (xx < 24 || yy < 24 || xx > W - 25 || yy > H - 25) continue; var a = intv ? I[i] : Math.abs(Ez[i]); var sI = yee.src.length === 1 ? Math.abs(xx - Wv.sx) + Math.abs(yy - Wv.sy) : 99; if (sI > 6 && a > mx) mx = a; }
		peak = Math.max(peak * 0.97, mx, 1e-6); var sc = Wv.br / peak;
		for (i = 0; i < N; i++) {
			var k = kind[i], br = 0, bg = 0, bb = 0;
			if (k === 3) { br = 52; bg = 14; bb = 40; } else if (k === 2) { br = 40; bg = 40; bb = 46; } else if (k === 1) { br = 10; bg = 34; bb = 50; } else { br = 8; bg = 10; bb = 20; }
			var r = br, g = bg, b = bb;
			if (intv) { var v = Math.min(1, Math.sqrt(I[i] * sc)); r += 255 * v; g += 235 * v; b += 170 * v; }
			else { var u = Ez[i] * sc; u = Math.max(-1, Math.min(1, u)); if (u > 0) { r += 255 * u; g += 150 * u; b += 30 * u; } else { r -= 30 * u; g -= 140 * u; b -= 255 * u; } }
			var j = i * 4; d[j] = r > 255 ? 255 : r; d[j + 1] = g > 255 ? 255 : g; d[j + 2] = b > 255 ? 255 : b; d[j + 3] = 255;
		}
		octx.putImageData(img, 0, 0); x.imageSmoothingEnabled = true; x.drawImage(off, 0, 0, w, h);
		var s = w / W, m = matOf(), r0 = nReal(m), nn = typeof r0 === "number" ? r0 : r0.n[0];
		if (m.kind) { line(x, slabX0() * s, 0, slabX0() * s, h, "rgba(255,255,255,0.35)", 1); if (slabX1() < W) line(x, slabX1() * s, 0, slabX1() * s, h, "rgba(255,255,255,0.35)", 1); }
		if (Wv.scene === "lens") {
			x.beginPath(); x.arc(Wv.sx * s, Wv.sy * s, 5, 0, TAU); x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.stroke();
			if (m.kind === 3 && nn < 0) { var a = slabX0() - Wv.sx, dd = slabX1() - slabX0(), f1 = slabX0() + Math.abs(nn) * a, f2 = slabX1() + dd / Math.abs(nn) - a; [f1, f2].forEach(function (fx, q) { if ((q === 0 && fx > slabX1()) || (q === 1 && fx < slabX1())) return; x.beginPath(); x.arc(fx * s, Wv.sy * s, 9 * s / 1.5, 0, TAU); x.strokeStyle = "#9ef0a8"; x.setLineDash([3, 3]); x.lineWidth = 1.5; x.stroke(); x.setLineDash([]); }); }
		} else {   // ray-optics prediction of the beam direction
			var t = 30 * DEG, hy = 40 + (150 - 50) * Math.tan(t); line(x, 50 * s, 40 * s, 150 * s, hy * s, "rgba(255,255,255,0.4)", 1, [5, 5]);
			if (m.kind && Math.abs(nn) > 0.05) { var t2 = M.snell(1, nn, 30); if (t2 !== null) { var u = t2 * DEG, L2 = 120; line(x, 150 * s, hy * s, (150 + L2 * Math.cos(u)) * s, (hy + L2 * Math.sin(u)) * s, "#9ef0a8", 1.4, [5, 5]); text(x, "ray optics: " + fmt(t2, 3) + "°", (150 + 12) * s, (hy + (u < 0 ? 24 : -18)) * s, 12, "#9ef0a8"); } }
		}
		text(x, m.kind ? m.name.split(":")[0] : "", (slabX0() + 4) * s, h - 12, 12, "#e9eef8");
		var te = $("ni-w-t"); if (te) te.textContent = fmt(yee.t * yee.dt / WL, 3);
	}
	var wDragOn = false;
	function wPtr(e) { if (Wv.scene !== "lens") return; var p = ptr(wc, e), s = wc.clientWidth / W; Wv.sx = Math.round(p.x / s); Wv.sy = Math.round(p.y / s); wSource(); wCards(); wDraw(); }
	wc.addEventListener("pointerdown", function (e) { wDragOn = true; wc.setPointerCapture(e.pointerId); wPtr(e); });
	wc.addEventListener("pointermove", function (e) { if (wDragOn) wPtr(e); }); wc.addEventListener("pointerup", function () { if (wDragOn) save(); wDragOn = false; });
	paintViews();

	/* =========================== 3. DIFFRACTION =========================== */
	var Dd = S.d, dc = $("ni-d"), dHover = null;
	$("ni-d-pre").innerHTML = M.DIFF_PRESETS.map(function (p) { return "<button type='button' data-id='" + p.id + "'>" + esc(p.name) + "</button>"; }).join("");
	function loadPre(id) { var p = M.DIFF_PRESETS.filter(function (q) { return q.id === id; })[0]; if (!p) return; Dd.pre = id; Dd.lam = p.lam; Dd.a = String(p.a); Dd.d = String(p.d || ""); Dd.N = p.N; Dd.L = String(p.L); Dd.z = autoZoom(); dSync(); dUpdate(); }
	$("ni-d-pre").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) loadPre(b.getAttribute("data-id")); });
	function dVals() { var a = num(Dd.a), d = num(Dd.d), N = Math.max(1, Math.round(+Dd.N || 1)), L = num(Dd.L); return { lam: Dd.lam * 1e-3, a: a, d: N > 1 ? d : 0, N: N, L: L }; }   // micrometres
	function autoZoom() { var v = dVals(), s = v.N > 1 && v.d > 0 ? (v.d < 3 * v.a ? 2.6 * v.lam / v.d : 2.6 * v.lam / v.a) : 3.5 * v.lam / v.a; var deg = Math.asin(Math.min(1, s)) / DEG; return Math.max(-2, Math.min(0, Math.log10(Math.max(0.9, deg) / 90))); }
	function dSync() { $("ni-d-lam").value = Dd.lam; $("ni-d-a").value = Dd.a; $("ni-d-d").value = Dd.d; $("ni-d-N").value = Dd.N; $("ni-d-L").value = Dd.L; $("ni-d-white").checked = !!Dd.white; $("ni-d-z").value = Dd.z; paintAx(); [].forEach.call($("ni-d-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-id") === Dd.pre ? "true" : "false"); }); }
	var paintAx = segInit("ni-d-ax", function () { return Dd.ax; }, function (v) { Dd.ax = v; dUpdate(); });
	$("ni-d-lam").addEventListener("input", function () { Dd.lam = +this.value; dUpdate(); });
	$("ni-d-white").addEventListener("change", function () { Dd.white = this.checked; dUpdate(); });
	$("ni-d-z").addEventListener("input", function () { Dd.z = +this.value; dUpdate(); });
	[["ni-d-a", "a"], ["ni-d-d", "d"], ["ni-d-N", "N"], ["ni-d-L", "L"]].forEach(function (p) { $(p[0]).addEventListener("input", function () { Dd[p[1]] = this.value; Dd.pre = ""; [].forEach.call($("ni-d-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", "false"); }); dUpdate(); }); });
	function dIntensity(sinT, v, lamUm) { return M.fraunhofer(sinT, lamUm, v.a, v.d, v.N); }
	function dUpdate() {
		var v = dVals(), err = "";
		if (!(v.a > 0)) err = "Type a slit width bigger than 0."; else if (v.N > 1 && !(v.d > 0)) err = "Type the slit spacing d (centre to centre)."; else if (v.N > 1 && v.d < v.a) err = "The spacing d must be at least the slit width a (the slits would overlap)."; else if (!(v.L > 0)) err = "Type a screen distance bigger than 0.";
		var thMax = Math.min(Dd.ax === "y" ? 80 : 90, 90 * Math.pow(10, Dd.z));
		$("ni-d-lam-v").textContent = Dd.white ? "white (400-700 nm)" : Dd.lam + " nm"; $("ni-d-z-v").textContent = "±" + fmt(thMax, 3) + "°";
		$("ni-d-lpm").textContent = v.N > 1 && v.d > 0 ? fmt(1000 / v.d, 4) + " lines per mm" : "";
		var p = M.DIFF_PRESETS.filter(function (q) { return q.id === Dd.pre; })[0]; $("ni-d-note").textContent = p ? p.note : "";
		var f = fitCanvas(dc, 0.42, 240, 460), x = f.x, w = f.w, h = f.h, L = 14, Rm = 14, band = 54, T = band + 22, B = 34;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		if (err) { text(x, err, w / 2, h / 2, 14, "#fca5a5", "center"); $("ni-d-res").innerHTML = "<p class='ni-neg'>" + esc(err) + "</p>"; save(); return; }
		var PW = w - L - Rm, xs = new Float32Array(PW + 1), cols = [], Lmm = v.L * 1000, yMax = Lmm * Math.tan(thMax * DEG);
		function sinAt(px) { var u = (px / PW) * 2 - 1; if (Dd.ax === "y") { var y = u * yMax; return y / Math.hypot(y, Lmm); } return Math.sin(u * thMax * DEG); }
		var lams = Dd.white ? [] : [Dd.lam]; if (Dd.white) for (var l = 400; l <= 700; l += 6) lams.push(l);
		var rgbs = lams.map(function (l) { return M.wlToRgb(l); }), sub = v.N > 4 ? 6 : 2, colMax = 1e-9, R = [], G = [], Bc = [];
		for (var px = 0; px <= PW; px++) {
			var I = 0, cr = 0, cg = 0, cb = 0;
			for (var li = 0; li < lams.length; li++) { var acc = 0; for (var s = 0; s < sub; s++) acc += dIntensity(sinAt(px + (s + 0.5) / sub - 0.5), v, lams[li] * 1e-3); acc /= sub; I += acc; cr += acc * rgbs[li][0]; cg += acc * rgbs[li][1]; cb += acc * rgbs[li][2]; }
			I /= lams.length; xs[px] = I; R.push(cr); G.push(cg); Bc.push(cb); colMax = Math.max(colMax, cr, cg, cb);
		}
		for (px = 0; px <= PW; px++) { var g = 1 / colMax; x.fillStyle = "rgb(" + Math.round(255 * Math.pow(R[px] * g, 0.6)) + "," + Math.round(255 * Math.pow(G[px] * g, 0.6)) + "," + Math.round(255 * Math.pow(Bc[px] * g, 0.6)) + ")"; x.fillRect(L + px, 8, 1.2, band); }
		text(x, "the screen", L + 4, band + 15, 11, COL.mut);
		var Ymax = 0; for (px = 0; px <= PW; px++) Ymax = Math.max(Ymax, xs[px]); Ymax = Math.max(Ymax, 1e-9);
		function Y(I) { return h - B - (h - B - T) * I / Ymax; }
		line(x, L, h - B, w - Rm, h - B, "rgba(255,255,255,0.25)", 1);
		var ticks = 6; for (var t = -ticks; t <= ticks; t += 2) { var tx = L + PW * (t / ticks + 1) / 2, lab = Dd.ax === "y" ? fmt(yMax * t / ticks, 3) : fmt(thMax * t / ticks, 3); line(x, tx, h - B, tx, h - B + 4, "rgba(255,255,255,0.4)", 1); text(x, lab, tx, h - B + 13, 11, COL.mut, "center"); }
		text(x, Dd.ax === "y" ? "position on the screen (mm)" : "angle θ (degrees)", w / 2, h - 8, 11, COL.mut, "center");
		if (v.N > 1) { x.beginPath(); for (px = 0; px <= PW; px++) { var e = M.fraunhofer(sinAt(px), (Dd.white ? 550 : Dd.lam) * 1e-3, v.a, 0, 1); var yy = Y(e * (Dd.white ? 1 : 1)); if (px) x.lineTo(L + px, yy); else x.moveTo(L + px, yy); } x.strokeStyle = "rgba(255,255,255,0.35)"; x.setLineDash([4, 4]); x.lineWidth = 1; x.stroke(); x.setLineDash([]); }
		var c0 = Dd.white ? [255, 255, 255] : M.wlToRgb(Dd.lam); x.beginPath(); for (px = 0; px <= PW; px++) { var yy2 = Y(xs[px]); if (px) x.lineTo(L + px, yy2); else x.moveTo(L + px, yy2); }
		x.strokeStyle = "rgb(" + Math.max(120, c0[0]) + "," + Math.max(120, c0[1]) + "," + Math.max(120, c0[2]) + ")"; x.lineWidth = 2; x.stroke();
		if (dHover != null && dHover >= 0 && dHover <= PW) { var hs = sinAt(dHover), th = Math.asin(hs) / DEG; line(x, L + dHover, T - 8, L + dHover, h - B, "rgba(255,255,255,0.5)", 1); text(x, "θ = " + fmt(th, 4) + "°, y = " + fmt(Lmm * Math.tan(th * DEG), 4) + " mm, I = " + fmt(xs[dHover] / Ymax, 3), Math.min(w - 10, Math.max(10, L + dHover + 8)), T - 6, 12, "#fff", L + dHover > w * 0.6 ? "right" : "left"); }
		dc._PW = PW; dc._L = L;
		/* results */
		var lam = (Dd.white ? 550 : Dd.lam) * 1e-3, mins = M.slitMinima(lam, v.a, 4), ords = v.N > 1 ? M.orders(lam, v.d, v.a, 8) : [], rows = "";
		rows += "<tr><th>Central bright band (between the first dark bands)</th><td>" + (mins.length ? fmt(2 * mins[0].deg, 4) + "° wide = " + fmt(2 * Lmm * Math.tan(mins[0].deg * DEG), 4) + " mm on the screen" : "fills the whole half-space (slit narrower than λ)") + "</td></tr>";
		rows += "<tr><th>Single-slit dark bands, a sin θ = m λ</th><td>" + (mins.length ? mins.map(function (q) { return "m=" + q.m + ": " + fmt(q.deg, 4) + "°"; }).join(" · ") : "none") + "</td></tr>";
		if (v.N > 1) {
			rows += "<tr><th>Bright maxima, d sin θ = m λ</th><td>" + ords.map(function (q) { return "m=" + q.m + ": " + fmt(q.deg, 4) + "°" + (q.missing ? " <i>(missing: on a slit zero)</i>" : ""); }).join(" · ") + "</td></tr>";
			rows += "<tr><th>Fringe spacing on the screen (small angles), λL/d</th><td>" + fmt(lam * v.L * 1000 / v.d, 4) + " mm</td></tr>";
			rows += "<tr><th>Resolving power, N × m (first order)</th><td>" + fmt(v.N, 4) + ": separates two colours " + fmt(lam * 1000 / v.N, 3) + " nm apart near " + fmt(lam * 1000, 4) + " nm</td></tr>";
		}
		$("ni-d-res").innerHTML = "<h3>The numbers" + (Dd.white ? " (at 550 nm)" : "") + "</h3><div class='ni-tw'><table class='ni-table'><tbody>" + rows + "</tbody></table></div><p class='tu-note'>Fraunhofer (far-field) formula: valid when L is much bigger than (slit size)² / λ. The brightness curve is normalised to its own maximum.</p>";
		save();
	}
	dc.addEventListener("pointermove", function (e) { var p = ptr(dc, e); dHover = Math.round(p.x - (dc._L || 14)); dUpdate(); });
	dc.addEventListener("pointerleave", function () { dHover = null; dUpdate(); });

	/* =========================== 4. WHAT LIGHT CAN DO =========================== */
	var lc = $("ni-l"), Ld = S.l, lt = 0;
	function refractVec(dx, dy, nx, ny, n1, n2) {   // unit direction d, unit normal n pointing against d; returns refracted unit vector or null (total internal reflection)
		var c1 = -(dx * nx + dy * ny), r = n1 / n2, k = 1 - r * r * (1 - c1 * c1); if (k < 0) return null; var c2 = Math.sqrt(k); return [r * dx + (r * c1 - c2) * nx, r * dy + (r * c1 - c2) * ny];
	}
	function segHit(px, py, dx, dy, ax, ay, bx, by) { var ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) return null; var t = ((ax - px) * ey - (ay - py) * ex) / den, u = ((ax - px) * dy - (ay - py) * dx) / den; return t > 1e-6 && u >= 0 && u <= 1 ? t : null; }
	var DEMOS = [
		{ id: "refl", name: "Reflection", ctl: [["a", "Angle of the incoming ray", 0, 85, 1, 40, "°"]], text: "A mirror sends light back at the same angle it arrived: angle of incidence = angle of reflection, both measured from the normal (dashed).",
			draw: function (x, w, h, p) { x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var cy = h * 0.72, ox = w / 2, L = Math.min(w, h) * 0.6, t = p.a * DEG; x.fillStyle = "#3b4252"; x.fillRect(0, cy, w, 10); line(x, ox, cy, ox, cy - L, COL.norm, 1.2, [6, 5]); arrow(x, ox - L * Math.sin(t), cy - L * Math.cos(t), ox, cy, COL.ray, 3); arrow(x, ox, cy, ox + L * Math.sin(t), cy - L * Math.cos(t), COL.ray, 3); text(x, "θᵢ = " + p.a + "°", ox - 20, cy - 30, 13, COL.ray, "right"); text(x, "θᵣ = " + p.a + "°", ox + 20, cy - 30, 13, COL.ray); },
			cards: function (p) { return card("Angle in", p.a + "°") + card("Angle out", p.a + "°", "always equal"); } },
		{ id: "refr", name: "Refraction", ctl: [["n1", "Top medium n₁", 1, 2.5, 0.01, 1, ""], ["n2", "Bottom medium n₂", 1, 2.5, 0.01, 1.5, ""], ["a", "Angle of the incoming ray", 0, 85, 1, 40, "°"]], text: "Light changes speed when it enters a new medium (speed c/n), and a ray that arrives at an angle turns: n₁ sin θ₁ = n₂ sin θ₂. Some light is also reflected (Fresnel), more at grazing angles.",
			draw: function (x, w, h, p) { drawIface(x, w, h, p.n2, p.a, { n1: p.n1, arrows: false }); },
			cards: function (p) { var t2 = M.snell(p.n1, p.n2, p.a), R = M.reflectance(p.n1, p.n2, p.a); return card("Refracted angle", t2 === null ? "none" : fmt(t2, 4) + "°") + card("Reflected", (R < 1e-9 ? "0" : fmt(100 * R, 3)) + " %", "of the light (unpolarised)") + card("Speeds", "c/" + fmt(p.n1, 3) + " → c/" + fmt(p.n2, 3)); } },
		{ id: "tir", name: "Total internal reflection", ctl: [["n1", "Index of the glass", 1.2, 2.5, 0.01, 1.5, ""], ["a", "Angle inside the glass", 0, 85, 0.5, 35, "°"]], text: "Going from a dense medium into a thinner one, the ray bends away from the normal. Past the critical angle (sin θc = n₂/n₁) there is no refracted ray at all and 100% reflects. Optical fibre works this way.",
			draw: function (x, w, h, p) { var cy = h * 0.4, ox = w / 2, L = Math.min(w, h) * 0.5, t = p.a * DEG; x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); x.fillStyle = "rgba(94,200,255,0.22)"; x.fillRect(0, cy, w, h - cy); line(x, 0, cy, w, cy, "#dfe5f2", 1.5); line(x, ox, cy - L, ox, cy + L, COL.norm, 1.2, [6, 5]); text(x, "air n = 1", 12, 18, 13, COL.txt); text(x, "glass n = " + fmt(p.n1, 3), 12, h - 16, 13, COL.pos);
				arrow(x, ox - L * Math.sin(t), cy + L * Math.cos(t), ox, cy, COL.ray, 3); var t2 = M.snell(p.n1, 1, p.a), R = M.reflectance(p.n1, 1, p.a); x.globalAlpha = Math.max(0.2, R); arrow(x, ox, cy, ox + L * Math.sin(t), cy + L * Math.cos(t), COL.ray, 3); x.globalAlpha = 1; if (t2 !== null) arrow(x, ox, cy, ox + L * Math.sin(t2 * DEG), cy - L * Math.cos(t2 * DEG), COL.ray, 2.5); else text(x, "100% reflected", ox + 16, cy - 20, 14, "#ffd166");
				var cr = M.critical(p.n1, 1); line(x, ox, cy, ox - L * Math.sin(cr * DEG), cy + L * Math.cos(cr * DEG), "rgba(158,240,168,0.6)", 1.2, [3, 4]); text(x, "critical " + fmt(cr, 3) + "°", ox - L * Math.sin(cr * DEG) - 6, cy + L * Math.cos(cr * DEG), 12, "#9ef0a8", "right"); },
			cards: function (p) { var cr = M.critical(p.n1, 1), t2 = M.snell(p.n1, 1, p.a); return card("Critical angle", fmt(cr, 4) + "°") + card("Now", t2 === null ? "all reflected" : "escapes at " + fmt(t2, 3) + "°", t2 === null ? "total internal reflection" : fmt(100 * M.reflectance(p.n1, 1, p.a), 3) + " % reflected"); } },
		{ id: "disp", name: "Dispersion", ctl: [["i", "Angle the white light hits the prism", 20, 80, 0.5, 48, "°"], ["k", "Spread drawn bigger by", 1, 15, 0.5, 5, "×"]], text: "Glass slows blue light a little more than red (n depends on wavelength), so a prism bends blue more and white light fans out into a spectrum. BK7 glass: n = 1.514 for red, 1.522 for blue (Cauchy fit). The fan is drawn bigger than life by the factor you choose; the numbers are true.",
			draw: function (x, w, h, p) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var s = Math.min(w * 0.42, h * 0.8), cx = w * 0.42, cy = h * 0.55, A = [cx, cy - s * 0.55], Bv = [cx - s * 0.5, cy + s * 0.32], Cv = [cx + s * 0.5, cy + s * 0.32];
				x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(Bv[0], Bv[1]); x.lineTo(Cv[0], Cv[1]); x.closePath(); x.fillStyle = "rgba(160,200,255,0.16)"; x.fill(); x.strokeStyle = "rgba(200,220,255,0.6)"; x.lineWidth = 1.5; x.stroke();
				var hx = (A[0] + Bv[0]) / 2, hy = (A[1] + Bv[1]) / 2, ex = Bv[0] - A[0], ey = Bv[1] - A[1], el = Math.hypot(ex, ey), nx = -ey / el, ny = ex / el;   // outward normal of the left face
				var ang = Math.atan2(-ny, -nx) - p.i * DEG, dx = Math.cos(ang), dy = Math.sin(ang), sx = hx - dx * s * 0.8, sy = hy - dy * s * 0.8; line(x, sx, sy, hx, hy, "#ffffff", 4);
				var nD = M.cauchyBK7(589);
				for (var l = 410; l <= 690; l += 20) {
					var n = nD + p.k * (M.cauchyBK7(l) - nD), r1 = refractVec(dx, dy, nx, ny, 1, n); if (!r1) continue; var c = M.wlToRgb(l), col = "rgb(" + c.join(",") + ")";
					var t = segHit(hx, hy, r1[0], r1[1], A[0], A[1], Cv[0], Cv[1]), hit = 0; if (t === null) { t = segHit(hx, hy, r1[0], r1[1], Bv[0], Bv[1], Cv[0], Cv[1]); hit = 1; } if (t === null) continue;
					var qx = hx + r1[0] * t, qy = hy + r1[1] * t; line(x, hx, hy, qx, qy, col, 1.2);
					var fx = hit ? Cv[0] - Bv[0] : Cv[0] - A[0], fy = hit ? Cv[1] - Bv[1] : Cv[1] - A[1], fl = Math.hypot(fx, fy), mx = fy / fl, my = -fx / fl; if (mx * r1[0] + my * r1[1] < 0) { mx = -mx; my = -my; }
					var r2 = refractVec(r1[0], r1[1], -mx, -my, n, 1); if (r2) line(x, qx, qy, qx + r2[0] * w, qy + r2[1] * w, col, 2);
				}
			},
			cards: function (p) { var nr = M.cauchyBK7(656), nb = M.cauchyBK7(486), dr = M.prismDeviation(nr, 60, p.i), db = M.prismDeviation(nb, 60, p.i); return card("n for red 656 nm", fmt(nr, 5)) + card("n for blue 486 nm", fmt(nb, 5)) + card("Deviation red / blue", dr == null || db == null ? "–" : fmt(dr, 4) + "° / " + fmt(db, 4) + "°", "60° BK7 prism") + card("True spread", dr == null || db == null ? "–" : fmt(db - dr, 3) + "°", "drawn " + p.k + "× bigger"); } },
		{ id: "diff", name: "Diffraction", ctl: [["a", "Slit width, in wavelengths", 1, 12, 0.1, 3, " λ"]], text: "A wave squeezed through a gap spreads out, and the narrower the gap the wider it spreads: the first dark band sits at sin θ = λ / a. The Diffraction tab has the full calculator (double slits, gratings, white light).",
			draw: function (x, w, h, p) { x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var Lp = 20, PW = w - 40, cy = h * 0.58; x.beginPath(); for (var px = 0; px <= PW; px++) { var th = (px / PW * 2 - 1) * 90 * DEG, I = M.fraunhofer(Math.sin(th), 1, p.a, 0, 1), yy = cy - (cy - 30) * I; if (px) x.lineTo(Lp + px, yy); else x.moveTo(Lp + px, yy); var c = Math.round(255 * Math.sqrt(I)); x.fillStyle = "rgb(" + c + "," + Math.round(c * 0.3) + "," + Math.round(c * 0.2) + ")"; x.fillRect(Lp + px, h - 50, 1.2, 30); } x.strokeStyle = "#ff8f70"; x.lineWidth = 2; x.stroke(); text(x, "−90°", Lp, cy + 14, 11, COL.mut); text(x, "+90°", Lp + PW, cy + 14, 11, COL.mut, "right"); text(x, "0°", Lp + PW / 2, cy + 14, 11, COL.mut, "center"); },
			cards: function (p) { var m = M.slitMinima(1, p.a, 1); return card("First dark band", m.length ? "± " + fmt(m[0].deg, 4) + "°" : "none", "sin θ = λ/a") + "<div class='ni-card'><h4>More</h4><button type='button' class='tu-btn tu-btn--ghost' data-goto='diff'>Open the Diffraction tab</button></div>"; } },
		{ id: "intf", name: "Interference", ctl: [["s", "Distance between the two sources", 1, 10, 0.1, 4, " λ"]], text: "Two sources in step make waves that add where crests meet crests (bright) and cancel where crests meet troughs (dark). Bright lines point along sin θ = m λ / s.",
			draw: function (x, w, h, p) {
				var gw = 200, gh = Math.round(gw * h / w), id = x.createImageData(gw, gh), span = 30;
				for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) { var X = i / gw * span + 0.5, Yv = (j / gh - 0.5) * span * gh / gw, I = M.twoSource(X, Yv, p.s, 1) / 4, k = (j * gw + i) * 4, fall = 1 / (1 + X * 0.03); id.data[k] = 255 * I * fall; id.data[k + 1] = 200 * I * fall; id.data[k + 2] = 90 * I * fall; id.data[k + 3] = 255; }
				var oc = document.createElement("canvas"); oc.width = gw; oc.height = gh; oc.getContext("2d").putImageData(id, 0, 0); x.imageSmoothingEnabled = true; x.drawImage(oc, 0, 0, w, h);
				[-1, 1].forEach(function (sg) { var py = h / 2 + sg * p.s / 2 * w / span; x.beginPath(); x.arc(0.5 * w / span, py, 5, 0, TAU); x.fillStyle = "#fff"; x.fill(); });
			},
			cards: function (p) { var o = M.orders(1, p.s, 0, 12); return card("Bright directions", o.length - 1 > 0 ? (o.length - 1) + " each side" : "only straight ahead", o.slice(0, 4).map(function (q) { return fmt(q.deg, 3) + "°"; }).join(", ")) + card("Wider spacing", "more fringes", "fringe angle ≈ λ / s"); } },
		{ id: "pol", name: "Polarization (Malus)", ctl: [["a", "First polarizer angle", 0, 180, 1, 0, "°"], ["m", "Middle polarizer (0 = none, 1 = in)", 0, 1, 1, 0, ""], ["b", "Middle polarizer angle", 0, 180, 1, 45, "°"], ["c", "Last polarizer angle", 0, 180, 1, 90, "°"]], text: "Light is a sideways wave, and a polarizer only passes the part that vibrates along its axis. Unpolarised light loses half at the first one; after that each polarizer passes cos² of the angle between it and the light (Malus's law). Two crossed polarizers block everything, yet slipping a third one at 45° between them lets 1/8 through.",
			draw: function (x, w, h, p) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var cy = h / 2, list = [p.a].concat(p.m ? [p.b] : []).concat([p.c]), n = list.length, xs = [], I = 1, pol = null, segs = [];
				for (var i = 0; i < n; i++) xs.push(w * (0.22 + 0.6 * i / (n - 1)));
				var x0 = 20; segs.push([x0, xs[0], 1, null]); I = 0.5; pol = list[0];
				for (i = 0; i < n; i++) { var I2 = i === 0 ? 0.5 : I * Math.pow(Math.cos((list[i] - pol) * DEG), 2); if (i > 0) pol = list[i]; I = I2; segs.push([xs[i], i + 1 < n ? xs[i + 1] : w - 20, I, pol]); }
				segs.forEach(function (s) { x.fillStyle = "rgba(255,230,150," + (0.15 + 0.85 * s[2]) + ")"; x.fillRect(s[0], cy - 10 * Math.max(0.15, s[2] * 2), s[1] - s[0], 20 * Math.max(0.15, s[2] * 2)); var mid = (s[0] + s[1]) / 2; if (s[3] == null) { [0, 45, 90, 135].forEach(function (a) { line(x, mid - 22 * Math.cos(a * DEG), cy - 22 * Math.sin(a * DEG), mid + 22 * Math.cos(a * DEG), cy + 22 * Math.sin(a * DEG), "#fff", 1.4); }); } else if (s[2] > 1e-4) { var r = 26 * Math.sqrt(s[2] * 2); line(x, mid - r * Math.cos(s[3] * DEG), cy - r * Math.sin(s[3] * DEG), mid + r * Math.cos(s[3] * DEG), cy + r * Math.sin(s[3] * DEG), "#fff", 2.4); } text(x, fmt(100 * s[2], 3) + " %", mid, cy + 46, 12, COL.txt, "center"); });
				list.forEach(function (a, i) { x.save(); x.translate(xs[i], cy); x.beginPath(); x.ellipse(0, 0, 10, 46, 0, 0, TAU); x.fillStyle = "rgba(120,160,220,0.35)"; x.fill(); x.strokeStyle = "#9ab8e8"; x.stroke(); x.restore(); line(x, xs[i] - 40 * Math.cos(a * DEG) * 0.2, cy - 40 * Math.sin(a * DEG), xs[i] + 40 * Math.cos(a * DEG) * 0.2, cy + 40 * Math.sin(a * DEG), "#ffd166", 2); text(x, a + "°", xs[i], cy - 60, 12, "#ffd166", "center"); });
			},
			cards: function (p) { var I = 0.5, pol = p.a, list = p.m ? [p.b, p.c] : [p.c]; list.forEach(function (a) { I *= Math.pow(Math.cos((a - pol) * DEG), 2); pol = a; }); return card("After the first", "50 %", "unpolarised in") + card("Out at the end", fmt(100 * I, 4) + " %", p.m ? "three polarizers" : "I₀/2 · cos²(" + Math.abs(p.c - p.a) + "°)"); } },
		{ id: "slow", name: "Slow light", ctl: [["g", "Group index (log scale)", 0, 7.5, 0.05, 1.2, ""]], text: "A pulse of light travels at the group speed c/n_g. In glass n_g ≈ 1.5; in an ultra-cold cloud of sodium atoms using electromagnetically induced transparency, Lene Hau's team slowed a pulse to 17 m/s (1999), a group index of about 18 million. The pulse is also squeezed shorter by the same factor while it is inside. Drawn speed is capped so you can see it; the numbers are true.",
			anim: true, draw: function (x, w, h, p, t) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var ng = Math.pow(10, p.g), vis = Math.min(ng, 25), m0 = w * 0.35, m1 = w * 0.65, top = h * 0.32, bot = h * 0.7, period = 6, ph = (t % period) / period, L = w - 40;
				x.fillStyle = "rgba(94,200,255,0.18)"; x.fillRect(m0, bot - 28, m1 - m0, 56); text(x, "medium", (m0 + m1) / 2, bot + 42, 12, COL.pos, "center"); text(x, "in vacuum", 12, top - 30, 12, COL.txt); text(x, "through the medium", 12, bot - 40, 12, COL.txt);
				function pulse(px, yy, width, col) { var g = x.createLinearGradient(px - width, 0, px + width, 0); g.addColorStop(0, "rgba(255,209,102,0)"); g.addColorStop(0.5, col); g.addColorStop(1, "rgba(255,209,102,0)"); x.fillStyle = g; x.fillRect(px - width, yy - 12, 2 * width, 24); }
				var s = 20 + ph * L * 1.6; pulse(s % (L + 60), top, 30, "rgba(255,209,102,1)");
				var dist = ph * L * 1.6, pos; var d0 = m0 - 20, inLen = (m1 - m0) * vis; if (dist < d0) pos = 20 + dist; else if (dist < d0 + inLen) pos = m0 + (dist - d0) / vis; else pos = m1 + (dist - d0 - inLen);
				pulse(pos, bot, pos > m0 && pos < m1 ? Math.max(3, 30 / vis) : 30, "rgba(255,209,102,1)");
			},
			cards: function (p) { var ng = Math.pow(10, p.g), v = M.groupSpeed(ng); return card("Group index n_g", fmt(ng, 3)) + card("Speed of the pulse", v > 1e5 ? fmt(v / 1000, 4) + " km/s" : fmt(v, 4) + " m/s", v < 1e3 ? fmt(v * 3.6, 3) + " km/h" : "") + card("Delay through 1 cm", fmt((ng - 1) * 0.01 / M.C * 1e9, 3) + " ns", "compared with vacuum"); } },
		{ id: "neg", name: "Negative refraction", ctl: [["n", "Index of the material", -2.5, 2.5, 0.01, -1, ""], ["a", "Angle of the incoming ray", 0, 85, 1, 35, "°"]], text: "With a negative index the ray stays on the same side of the normal. The first tab has the full picture, the flat lens and the perfect-lens limit, and the Wave tab simulates it with Maxwell's equations.",
			draw: function (x, w, h, p) { drawIface(x, w, h, Math.abs(p.n) < 0.01 ? 0.01 : p.n, p.a); },
			cards: function (p) { var t2 = M.snell(1, p.n, p.a); return card("Refracted angle", t2 === null ? "none" : fmt(t2, 4) + "°", t2 !== null && t2 < 0 ? "same side" : "") + "<div class='ni-card'><h4>More</h4><button type='button' class='tu-btn tu-btn--ghost' data-goto='neg'>Open the full tab</button></div>"; } },
		{ id: "cloak", name: "Cloaking (transformation optics)", ctl: [["on", "Cloak (0 = off, 1 = on)", 0, 1, 1, 1, ""], ["r1", "Hidden core radius", 0.1, 0.8, 0.01, 0.35, ""], ["r2", "Cloak outer radius", 0.4, 1.4, 0.01, 1, ""]], text: "Pendry, Schurig and Smith (2006): squeeze the space inside a circle into a ring, r′ = R₁ + r (R₂ − R₁)/R₂. A material whose ε and μ copy that squeeze steers light around the core and lets it out exactly where it would have gone, so whatever sits inside is invisible. The rays here follow the exact coordinate map (ray optics, one colour). The required material is strongly anisotropic and, at the inner edge, needs ε and μ near zero and infinity.",
			draw: function (x, w, h, p) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var R2 = Math.max(p.r2, p.r1 + 0.05), R1 = p.r1, k = Math.min(w, h) * 0.32, cx = w / 2, cy = h / 2;
				if (p.on) { x.beginPath(); x.arc(cx, cy, R2 * k, 0, TAU); x.arc(cx, cy, R1 * k, 0, TAU, true); x.fillStyle = "rgba(255,111,181,0.18)"; x.fill("evenodd"); }
				x.beginPath(); x.arc(cx, cy, R1 * k, 0, TAU); x.fillStyle = "#5b6577"; x.fill(); text(x, "hidden", cx, cy, 12, "#fff", "center");
				for (var i = -7; i <= 7; i++) {
					if (i === 0) continue;   // the ray straight at the centre is the one singular ray of the ideal cloak
					var y0 = i / 7 * Math.min(1.45, h / 2 / k - 0.05), xMin = -w / 2 / k, xMax = w / 2 / k;
					if (p.on) { var pts = M.cloakRay(y0, R1, R2, xMin, xMax, 500); x.beginPath(); for (var q = 0; q < pts.length; q += 2) { var px = cx + pts[q] * k, py = cy + pts[q + 1] * k; if (q) x.lineTo(px, py); else x.moveTo(px, py); } x.strokeStyle = COL.ray; x.lineWidth = 1.4; x.stroke(); }
					else { var hit = Math.abs(y0) < R1, xe = hit ? -Math.sqrt(R1 * R1 - y0 * y0) : xMax; line(x, cx + xMin * k, cy + y0 * k, cx + xe * k, cy + y0 * k, COL.ray, 1.4); }
				}
				text(x, p.on ? "rays bend around the core and leave undisturbed" : "without a cloak the object blocks light and casts a shadow", 12, h - 14, 12, COL.txt);
			},
			cards: function (p) { var R2 = Math.max(p.r2, p.r1 + 0.05); return card("Squeeze at the outer edge", "×" + fmt((R2 - p.r1) / R2, 3), "radial scale dr′/dr") + card("Behind the object", p.on ? "no shadow" : "shadow", p.on ? "every ray exits on its original line" : ""); } }
	];
	var lList = $("ni-l-list");
	lList.innerHTML = DEMOS.map(function (d) { return "<button type='button' role='tab' data-id='" + d.id + "'>" + esc(d.name) + "</button>"; }).join("");
	lList.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; Ld.demo = b.getAttribute("data-id"); lBuild(); });
	function demo() { return DEMOS.filter(function (d) { return d.id === Ld.demo; })[0] || DEMOS[0]; }
	function lParams() { var d = demo(), p = {}, saved = Ld.p[d.id] || {}; d.ctl.forEach(function (c) { p[c[0]] = saved[c[0]] != null ? saved[c[0]] : c[5]; }); return p; }
	function lBuild() {
		var d = demo(), p = lParams();
		[].forEach.call(lList.querySelectorAll("button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-id") === d.id ? "true" : "false"); });
		$("ni-l-title").textContent = d.name; $("ni-l-text").textContent = d.text;
		$("ni-l-ctl").innerHTML = d.ctl.map(function (c) { return "<div class='tu-field'><span class='tu-label' id='ni-lc-" + c[0] + "-l'>" + esc(c[1]) + ": <b id='ni-lc-" + c[0] + "-v'></b></span><input type='range' data-k='" + c[0] + "' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + p[c[0]] + "' aria-labelledby='ni-lc-" + c[0] + "-l'></div>"; }).join("");
		lUpdate(); save();
	}
	$("ni-l-ctl").addEventListener("input", function (e) { var el = e.target; if (!el.getAttribute("data-k")) return; var d = demo(); Ld.p[d.id] = Ld.p[d.id] || {}; Ld.p[d.id][el.getAttribute("data-k")] = +el.value; lUpdate(); save(); });
	root.addEventListener("click", function (e) { var b = e.target.closest("[data-goto]"); if (b) { showTab(b.getAttribute("data-goto")); root.scrollIntoView({ behavior: "smooth", block: "start" }); } });
	function lUpdate() {
		var d = demo(), p = lParams();
		d.ctl.forEach(function (c) { var el = $("ni-lc-" + c[0] + "-v"); if (el) el.textContent = c[0] === "g" ? "10^" + fmt(p.g, 3) + " = " + fmt(Math.pow(10, p.g), 3) : (c[3] === 1 && c[2] === 0 && c[4] === 1 ? (p[c[0]] ? "on" : "off") : fmt(p[c[0]], 4) + c[6]); });
		lDraw(); $("ni-l-cards").innerHTML = d.cards(p);
	}
	function lDraw() { var d = demo(), f = fitCanvas(lc, 0.5, 240, maxH()); d.draw(f.x, f.w, f.h, lParams(), lt); }

	/* ---------- main loop ---------- */
	function redraw() { if (S.tab === "neg") { rUpdate(); pUpdate(); } else if (S.tab === "wave") wDraw(); else if (S.tab === "diff") dUpdate(); else lUpdate(); }
	var last = 0;
	function frame(ts) {
		requestAnimationFrame(frame); if (document.hidden) return; var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
		if (S.tab === "wave" && yee && running) { for (var i = 0; i < Wv.speed; i++) yee.step(); wDraw(); }
		else if (S.tab === "light" && demo().anim) { lt += dt; lDraw(); }
	}
	var rto = null; window.addEventListener("resize", function () { clearTimeout(rto); rto = setTimeout(redraw, 120); });
	if (window.ResizeObserver) { var ro = new ResizeObserver(function () { clearTimeout(rto); rto = setTimeout(redraw, 80); }); ro.observe(root); }
	try { var q = new URLSearchParams(location.search); if (q.get("tab")) S.tab = q.get("tab"); if (q.get("demo") && DEMOS.some(function (d) { return d.id === q.get("demo"); })) { S.tab = "light"; Ld.demo = q.get("demo"); } if (q.get("n") && isFinite(+q.get("n"))) RR.n = Math.max(-3, Math.min(3, +q.get("n"))); } catch (e) { /* ignore */ }
	window.MESMetaLab = { step: function (k) { for (var i = 0; i < (k || 1); i++) yee.step(); wDraw(); }, yee: function () { return yee; } };
	dSync(); wBuild(); lBuild(); showTab(S.tab, true); requestAnimationFrame(frame);
})();
