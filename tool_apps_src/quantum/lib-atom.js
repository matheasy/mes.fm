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
