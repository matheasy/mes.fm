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
