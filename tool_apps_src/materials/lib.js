/* MESMech: mechanics-of-materials maths for mes.fm/materials, /youngs-modulus-calculator, /tensile-test-simulator and /shear-stress-calculator.
 * Pure functions, no DOM; runs in node too (require('./tool_apps_src/materials/lib.js'); tests: node tool_apps_src/materials-tests.js).
 * SI inside: N, m, Pa, rad, K, kg/m³, W. Material values are TYPICAL room-temperature values: they vary with alloy, temper, size and supplier. */
(function (root) {
	"use strict";
	var PI = Math.PI, IN = 0.0254, LBF = 4.4482216152605, PSI = LBF / (IN * IN), LB = 0.45359237;

	/* ---------- units: [name, size in SI] in the order the selects show them ---------- */
	var UNITS = {
		force: [["N", 1], ["kN", 1e3], ["MN", 1e6], ["lbf", LBF], ["kip", LBF * 1e3]],
		len: [["mm", 1e-3], ["cm", 1e-2], ["m", 1], ["in", IN], ["ft", 0.3048]],
		area: [["mm²", 1e-6], ["cm²", 1e-4], ["m²", 1], ["in²", IN * IN], ["ft²", 0.3048 * 0.3048]],
		stress: [["Pa", 1], ["kPa", 1e3], ["MPa", 1e6], ["GPa", 1e9], ["psi", PSI], ["ksi", PSI * 1e3], ["Msi", PSI * 1e6]],
		strain: [["mm/mm", 1], ["%", 0.01], ["µε", 1e-6]],
		torque: [["N·m", 1], ["kN·m", 1e3], ["N·mm", 1e-3], ["lbf·in", LBF * IN], ["lbf·ft", LBF * 0.3048], ["kip·in", LBF * IN * 1e3]],
		angle: [["rad", 1], ["°", PI / 180], ["mrad", 1e-3]],
		power: [["W", 1], ["kW", 1e3], ["MW", 1e6], ["hp", 745.69987158227022]],
		speed: [["rpm", 2 * PI / 60], ["rad/s", 1], ["Hz", 2 * PI]],
		dtemp: [["°C", 1], ["K", 1], ["°F", 5 / 9]],
		alpha: [["µm/m·°C", 1e-6], ["µin/in·°F", 1.8e-6], ["1/°C", 1]],
		density: [["kg/m³", 1], ["g/cm³", 1000], ["lb/ft³", LB / Math.pow(0.3048, 3)], ["lb/in³", LB / Math.pow(IN, 3)]],
		energy: [["J/m³", 1], ["kJ/m³", 1e3], ["MJ/m³", 1e6], ["in·lbf/in³", PSI]],
		inertia: [["mm⁴", 1e-12], ["cm⁴", 1e-8], ["m⁴", 1], ["in⁴", Math.pow(IN, 4)]]
	};
	var EXTRA = {   /* typed spellings -> unit name (after norm()) */
		force: { n: "N", newton: "N", newtons: "N", kilonewton: "kN", kilonewtons: "kN", lb: "lbf", lbs: "lbf", pound: "lbf", pounds: "lbf", kips: "kip", klbf: "kip" },
		len: { millimeter: "mm", millimetre: "mm", millimeters: "mm", millimetres: "mm", meter: "m", metre: "m", meters: "m", metres: "m", inch: "in", inches: "in", "\"": "in", foot: "ft", feet: "ft", "'": "ft" },
		area: { mm2: "mm²", sqmm: "mm²", cm2: "cm²", m2: "m²", in2: "in²", sqin: "in²", ft2: "ft²", sqft: "ft²" },
		stress: { "n/mm2": "MPa", nmm2: "MPa", "kn/mm2": "GPa", "lb/in2": "psi", "lbf/in2": "psi", "n/m2": "Pa" },
		strain: { "": "mm/mm", "-": "mm/mm", "m/m": "mm/mm", "in/in": "mm/mm", ue: "µε", "uε": "µε", microstrain: "µε", "με": "µε", percent: "%" },
		torque: { nm: "N·m", "n-m": "N·m", knm: "kN·m", nmm: "N·mm", lbin: "lbf·in", inlb: "lbf·in", inlbf: "lbf·in", lbfin: "lbf·in", lbft: "lbf·ft", ftlb: "lbf·ft", ftlbf: "lbf·ft", lbfft: "lbf·ft", kipin: "kip·in", inkip: "kip·in" },
		angle: { deg: "°", degree: "°", degrees: "°", radian: "rad", radians: "rad" },
		power: { watt: "W", watts: "W", kilowatt: "kW", kilowatts: "kW", bhp: "hp", horsepower: "hp" },
		speed: { "r/min": "rpm", revmin: "rpm", rads: "rad/s", hertz: "Hz", rps: "Hz", "rev/s": "Hz" },
		dtemp: { c: "°C", degc: "°C", celsius: "°C", f: "°F", degf: "°F", fahrenheit: "°F", kelvin: "K" },
		alpha: { "um/m°c": "µm/m·°C", "um/mc": "µm/m·°C", "um/mk": "µm/m·°C", "ppm/°c": "µm/m·°C", "ppm/c": "µm/m·°C", "ppm/k": "µm/m·°C", "uin/in°f": "µin/in·°F", "uin/inf": "µin/in·°F", "ppm/°f": "µin/in·°F", "ppm/f": "µin/in·°F", "/°c": "1/°C", "/c": "1/°C", "1/k": "1/°C", "/k": "1/°C" },
		density: { kgm3: "kg/m³", "kg/m3": "kg/m³", "g/cm3": "g/cm³", gcc: "g/cm³", "lb/ft3": "lb/ft³", pcf: "lb/ft³", "lb/in3": "lb/in³" },
		energy: { "j/m3": "J/m³", "kj/m3": "kJ/m³", "mj/m3": "MJ/m³", "inlb/in3": "in·lbf/in³", "inlbf/in3": "in·lbf/in³" },
		inertia: { mm4: "mm⁴", cm4: "cm⁴", m4: "m⁴", in4: "in⁴" }
	};
	function norm(s) { return String(s).toLowerCase().replace(/\s+/g, "").replace(/²/g, "2").replace(/³/g, "3").replace(/⁴/g, "4").replace(/\^/g, "").replace(/[μµ]/g, "u").replace(/[·*]/g, "").replace(/deg/g, "°").replace(/°°/g, "°"); }
	var ALIAS = {};
	Object.keys(UNITS).forEach(function (k) {
		var m = {}; UNITS[k].forEach(function (u) { m[norm(u[0])] = u[0]; m[u[0]] = u[0]; });
		Object.keys(EXTRA[k] || {}).forEach(function (a) { m[norm(a)] = EXTRA[k][a]; m[a] = EXTRA[k][a]; });
		ALIAS[k] = m;
	});
	function factor(kind, name) { var l = UNITS[kind]; for (var i = 0; i < l.length; i++) if (l[i][0] === name) return l[i][1]; return NaN; }
	function toSI(kind, v, name) { return v * factor(kind, name); }
	function fromSI(kind, v, name) { return v / factor(kind, name); }
	function conv(kind, v, from, to) { return v * factor(kind, from) / factor(kind, to); }
	function unitOf(kind, typed) { if (typed == null) return null; var m = ALIAS[kind] || {}; var t = String(typed).trim(); if (m[t]) return m[t]; var n = norm(t), n2 = n.replace(/-/g, ""); return m[n] || m[n.replace(/s$/, "")] || m[n2] || m[n2.replace(/s$/, "")] || null; }

	/* ---------- numbers ---------- */
	function parseNum(s) {
		s = String(s == null ? "" : s).trim().replace(/[−–]/g, "-").replace(/\s+/g, "");
		if (s === "" || s === "-" || s === "+") return NaN;
		if (/^[-+]?\d{1,3}(,\d{3})+(\.\d*)?(e[-+]?\d+)?$/i.test(s)) s = s.replace(/,/g, "");      /* 1,234.5 */
		else if (/^[-+]?\d*,\d+$/.test(s)) s = s.replace(",", ".");                               /* 12,5 (decimal comma) */
		if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
		return Number(s);
	}
	/* "50 kN", "10mm", "2.5e-3", "0.2 %" -> {v, unit} (unit = null when none was typed or it is not a unit of this kind) */
	function parseQty(text, kind) {
		var t = String(text == null ? "" : text).trim().replace(/[−–]/g, "-");
		var m = /^([-+]?[\d.,]*\d(?:[eE][-+]?\d+)?)\s*(.*)$/.exec(t);
		if (!m) return { v: NaN, unit: null };
		var v = parseNum(m[1]), u = m[2].trim();
		if (u === "") return { v: v, unit: null };
		var un = unitOf(kind, u);
		return un ? { v: v, unit: un } : { v: NaN, unit: null };
	}
	function sig(x, n) {   /* input-friendly: 4 significant figures, trailing zeros dropped, e-notation for very big / small */
		if (x == null || !isFinite(x)) return ""; if (x === 0) return "0"; n = n || 4;
		var a = Math.abs(x);
		if (a >= 1e9 || a < 1e-4) return x.toExponential(n - 1).replace(/\.?0+e/, "e").replace("e+", "e");
		var d = Math.max(0, n - 1 - Math.floor(Math.log10(a) + 1e-12)), s = x.toFixed(Math.min(d, 12));
		if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
		return s;
	}
	var SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
	function pretty(x, n) {   /* for reading: thousands separators, × 10ⁿ */
		if (x == null || !isFinite(x)) return "–";
		var s = sig(x, n);
		var e = /^(-?[\d.]+)e([-+]?\d+)$/.exec(s);
		if (e) return e[1].replace("-", "−") + " × 10" + String(+e[2]).split("").map(function (c) { return SUP[c] || c; }).join("");
		var p = s.split("."), neg = p[0].charAt(0) === "-"; if (neg) p[0] = p[0].slice(1);
		if (p[0].length > 4) p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		return (neg ? "−" : "") + p[0] + (p[1] ? "." + p[1] : "");
	}

	/* ---------- cross-sections (all dims in m) ---------- */
	var SHAPES = [["round", "Round bar"], ["tube", "Round tube"], ["rect", "Rectangle / flat bar"], ["rtube", "Rectangular tube"], ["area", "I know the area"]];
	function section(sh, d) {
		var r = { A: NaN, I: NaN, err: "" };
		function bad(m) { r.err = m; return r; }
		if (sh === "round") { if (!(d.d > 0)) return bad("Type the bar's diameter."); r.A = PI * d.d * d.d / 4; r.I = PI * Math.pow(d.d, 4) / 64; r.J = 2 * r.I; return r; }
		if (sh === "tube") {
			if (!(d.D > 0)) return bad("Type the tube's outside diameter."); if (!(d.t > 0)) return bad("Type the wall thickness.");
			if (2 * d.t >= d.D) { r.A = PI * d.D * d.D / 4; r.I = PI * Math.pow(d.D, 4) / 64; r.J = 2 * r.I; r.note = "The wall is half the diameter or more, so this is a solid bar."; return r; }
			var di = d.D - 2 * d.t; r.A = PI * (d.D * d.D - di * di) / 4; r.I = PI * (Math.pow(d.D, 4) - Math.pow(di, 4)) / 64; r.J = 2 * r.I; return r;
		}
		if (sh === "rect") { if (!(d.b > 0) || !(d.h > 0)) return bad("Type the width and the height."); r.A = d.b * d.h; r.I = Math.min(d.b * Math.pow(d.h, 3), d.h * Math.pow(d.b, 3)) / 12; return r; }
		if (sh === "rtube") {
			if (!(d.B > 0) || !(d.H > 0)) return bad("Type the outside width and height."); if (!(d.t > 0)) return bad("Type the wall thickness.");
			if (2 * d.t >= Math.min(d.B, d.H)) { r.A = d.B * d.H; r.I = Math.min(d.B * Math.pow(d.H, 3), d.H * Math.pow(d.B, 3)) / 12; r.note = "The wall fills the whole tube, so this is a solid bar."; return r; }
			var bi = d.B - 2 * d.t, hi = d.H - 2 * d.t; r.A = d.B * d.H - bi * hi;
			r.I = Math.min(d.B * Math.pow(d.H, 3) - bi * Math.pow(hi, 3), d.H * Math.pow(d.B, 3) - hi * Math.pow(bi, 3)) / 12; return r;
		}
		if (sh === "area") { if (!(d.A > 0)) return bad("Type the cross-section area."); r.A = d.A; return r; }
		return bad("Pick a cross-section.");
	}
	/* the shape's main size that gives area A (the others kept): round -> d, tube -> D (wall kept), rect -> h (width kept), rtube -> B and H (wall and B:H kept) */
	function sizeFor(sh, d, A) {
		var o = {}; for (var k in d) o[k] = d[k];
		if (!(A > 0)) return null;
		if (sh === "round") { o.d = Math.sqrt(4 * A / PI); return o; }
		if (sh === "tube") { if (!(d.t > 0)) return null; o.D = A / (PI * d.t) + d.t; return o; }
		if (sh === "rect") { if (!(d.b > 0)) return null; o.h = A / d.b; return o; }
		if (sh === "rtube") { if (!(d.t > 0) || !(d.B > 0) || !(d.H > 0)) return null; var r = d.B / d.H, H = (A + 4 * d.t * d.t) / (2 * d.t * (1 + r)); if (r * H <= 2 * d.t || H <= 2 * d.t) return null; o.H = H; o.B = r * H; return o; }
		if (sh === "area") { o.A = A; return o; }
		return null;
	}

	/* ---------- axial loading: sigma = F/A, eps = dL/L, E = sigma/eps (any 4 independent values give the other 3) ---------- */
	var AX = ["F", "A", "L", "dL", "s", "e", "E"];
	var AX_EQ = [["s", "F", "A"], ["e", "dL", "L"], ["E", "s", "e"]];   /* q = a / b */
	function axialPropagate(k) {
		var v = {}; AX.forEach(function (n) { if (k[n] != null && isFinite(k[n])) v[n] = k[n]; });
		for (var pass = 0; pass < 6; pass++) {
			var changed = false;
			AX_EQ.forEach(function (eq) {
				var q = eq[0], a = eq[1], b = eq[2], x;
				if (v[q] == null && v[a] != null && v[b] != null && v[b] !== 0) { x = v[a] / v[b]; if (isFinite(x)) { v[q] = x; changed = true; } }
				else if (v[a] == null && v[q] != null && v[b] != null) { x = v[q] * v[b]; if (isFinite(x)) { v[a] = x; changed = true; } }
				else if (v[b] == null && v[q] != null && v[a] != null && v[q] !== 0) { x = v[a] / v[q]; if (isFinite(x)) { v[b] = x; changed = true; } }
			});
			if (!changed) break;
		}
		return v;
	}
	/* givens: [[name, value], ...] NEWEST FIRST. A value the newer ones already fix is dropped (worked out instead), so the last thing typed always wins. */
	function axialSolve(givens) {
		var k = {}, used = [], dropped = [];
		givens.forEach(function (g) {
			if (AX.indexOf(g[0]) < 0 || g[1] == null || !isFinite(g[1])) return;
			if (k[g[0]] != null) return;
			var cur = axialPropagate(k);
			if (cur[g[0]] != null) { dropped.push(g[0]); return; }
			k[g[0]] = g[1]; used.push(g[0]);
		});
		var v = axialPropagate(k), missing = AX.filter(function (n) { return v[n] == null; }), oneMore = [];
		if (missing.length) missing.forEach(function (m) { var t = {}; for (var x in k) t[x] = k[x]; t[m] = 1; var w = axialPropagate(t); if (AX.every(function (n) { return w[n] != null; })) oneMore.push(m); });
		var err = "";
		if (v.A != null && !(v.A > 0)) err = "These numbers give a cross-section area of zero or less: check the signs (a pull is +, a push is −).";
		else if (v.L != null && !(v.L > 0)) err = "These numbers give a length of zero or less: check the signs (stretching is +, shortening is −).";
		else if (v.E != null && !(v.E > 0)) err = "These numbers give a Young's modulus of zero or less: stress and strain must have the same sign.";
		return { v: v, used: used, dropped: dropped, missing: missing, oneMore: oneMore, err: err };
	}
	function euler(E, I, L, K) { return PI * PI * E * I / Math.pow((K || 1) * L, 2); }

	/* ---------- shear, torsion, elastic constants, 3D Hooke, thermal ---------- */
	function shearPin(V, d, planes) { var A = PI * d * d / 4, n = planes || 1; return { A: A, At: A * n, tau: V / (A * n) }; }
	function pinSize(V, tauAllow, planes) { return Math.sqrt(4 * V / ((planes || 1) * PI * tauAllow)); }
	function gFrom(E, nu) { return E / (2 * (1 + nu)); }
	function kFrom(E, nu) { return E / (3 * (1 - 2 * nu)); }
	function torsion(T, D, di, L, G) {
		di = di > 0 ? di : 0;
		var J = PI * (Math.pow(D, 4) - Math.pow(di, 4)) / 32, tau = T * (D / 2) / J;
		return { J: J, tau: tau, tauIn: T * (di / 2) / J, theta: (L > 0 && G > 0) ? T * L / (G * J) : NaN, gamma: G > 0 ? tau / G : NaN, A: PI * (D * D - di * di) / 4 };
	}
	function shaftSize(T, tauAllow, ratio) { var r = ratio > 0 && ratio < 1 ? ratio : 0; return Math.pow(16 * Math.abs(T) / (PI * tauAllow * (1 - Math.pow(r, 4))), 1 / 3); }
	function torqueFromPower(P, w) { return P / w; }
	/* any two of E, G, nu, K -> all of them (+ Lame's lambda, P-wave modulus M) */
	function elastic(kind, a, b) {
		var E, G, nu, K;
		if (kind === "E,nu") { E = a; nu = b; }
		else if (kind === "E,G") { E = a; G = b; nu = E / (2 * G) - 1; }
		else if (kind === "E,K") { E = a; K = b; nu = (3 * K - E) / (6 * K); }
		else if (kind === "G,K") { G = a; K = b; E = 9 * K * G / (3 * K + G); nu = (3 * K - 2 * G) / (2 * (3 * K + G)); }
		else if (kind === "G,nu") { G = a; nu = b; E = 2 * G * (1 + nu); }
		else if (kind === "K,nu") { K = a; nu = b; E = 3 * K * (1 - 2 * nu); }
		else return { err: "Pick two values you know." };
		if (!(E > 0) || !isFinite(nu)) return { err: "Type two positive values." };
		if (!(nu > -1 && nu < 0.5)) return { err: "These give a Poisson's ratio of " + sig(nu, 4) + ": a stable material needs −1 < ν < 0.5 (so G must be more than E/3, and K more than E/9)." };
		G = E / (2 * (1 + nu)); K = E / (3 * (1 - 2 * nu));
		var lam = E * nu / ((1 + nu) * (1 - 2 * nu));
		return { E: E, G: G, nu: nu, K: K, lam: lam, M: lam + 2 * G, err: "" };
	}
	/* s = [sx, sy, sz, txy, tyz, tzx] -> strains [ex, ey, ez, gxy, gyz, gzx] (engineering shear strains) */
	function hooke(s, E, nu) {
		var G = E / (2 * (1 + nu));
		var ex = (s[0] - nu * (s[1] + s[2])) / E, ey = (s[1] - nu * (s[0] + s[2])) / E, ez = (s[2] - nu * (s[0] + s[1])) / E;
		return { eps: [ex, ey, ez, s[3] / G, s[4] / G, s[5] / G], vol: ex + ey + ez, G: G };
	}
	function hookeInv(e, E, nu) {
		var G = E / (2 * (1 + nu)), lam = E * nu / ((1 + nu) * (1 - 2 * nu)), tr = e[0] + e[1] + e[2];
		return { sig: [lam * tr + 2 * G * e[0], lam * tr + 2 * G * e[1], lam * tr + 2 * G * e[2], G * e[3], G * e[4], G * e[5]], vol: tr, G: G, lam: lam };
	}
	/* uniaxial bar: axial strain e, Poisson nu, diameter d, length L */
	function poissonBar(e, nu, d, L) {
		var el = -nu * e, vol = (1 + e) * (1 + el) * (1 + el) - 1;
		return { lat: el, dd: el * d, dL: e * L, d1: d * (1 + el), L1: L * (1 + e), vol: vol, volLin: e * (1 - 2 * nu) };
	}
	/* cond: "free" | "held" (rigid walls) | "gap" (walls with a gap g). dT in K, a in 1/K, L in m, E in Pa */
	function thermal(a, dT, L, E, cond, g) {
		var free = a * dT * L, r = { free: free, eps: a * dT, sigma: 0, dL: free, gapLeft: NaN, dTclose: NaN, touching: false };
		if (cond === "held") { r.sigma = -E * a * dT; r.dL = 0; r.touching = true; }
		else if (cond === "gap") {
			g = g > 0 ? g : 0; r.dTclose = a > 0 ? g / (a * L) : NaN;
			if (free > g) { r.sigma = -E * (free - g) / L; r.dL = g; r.gapLeft = 0; r.touching = true; }
			else { r.gapLeft = g - free; }
		}
		return r;
	}
	/* the temperature changes at which a heated (or cooled) bar reaches a given stress s (Pa, > 0): for "held" ±s/(E a), for "gap" (heating only)
	   the closing rise g/(a L) plus s/(E a). null when that can't happen (free bar; a gap bar being cooled pulls away from the wall). */
	function thermalDT(a, L, E, cond, g, s) {
		if (!(a > 0) || !(E > 0) || !(s >= 0)) return null;
		if (cond === "held") return { up: s / (E * a), down: -s / (E * a) };
		if (cond === "gap") return { up: (g > 0 ? g : 0) / (a * L) + s / (E * a), down: null };
		return null;
	}
	/* Euler buckling of a round bar of diameter d and length L held between walls: stress = pi^2 E (d/4)^2 / (K L)^2, K = 1 pinned ends, 0.5 clamped ends */
	function bucklingStress(E, d, L, K) { if (!(E > 0) || !(d > 0) || !(L > 0)) return NaN; var r = d / 4, kl = (K || 1) * L; return PI * PI * E * r * r / (kl * kl); }
	/* stress-against-temperature curve for the chart: n + 1 points from lo to hi (K) */
	function thermalSeries(a, L, E, cond, g, lo, hi, n) { var out = [], i, dT; n = n || 60; for (i = 0; i <= n; i++) { dT = lo + (hi - lo) * i / n; out.push([dT, thermal(a, dT, L, E, cond, g).sigma]); } return out; }
	/* state of a heated bar: "ok", "yield" (|sigma| past the strength) or "buckle" (compression past the buckling stress, checked first only if it comes before yield) */
	function thermalState(sigma, strength, sBuckle) {
		var c = Math.abs(sigma); if (!(c > 0)) return "ok";
		if (sigma < 0 && sBuckle > 0 && c >= sBuckle && (!(strength > 0) || sBuckle <= strength)) return "buckle";
		if (strength > 0 && c >= strength) return "yield";
		if (sigma < 0 && sBuckle > 0 && c >= sBuckle) return "buckle";
		return "ok";
	}
	/* colour of the bar: t = -1 (cold) .. 0 .. +1 (hot) -> [r, g, b] from blue through grey to red */
	function heatRGB(t) {
		t = t < -1 ? -1 : t > 1 ? 1 : t; var a = [148, 163, 184], c = t >= 0 ? [220, 38, 38] : [37, 99, 235], u = Math.abs(t);
		return [0, 1, 2].map(function (i) { return Math.round(a[i] + (c[i] - a[i]) * u); });
	}
	function resilience(sy, E) { return sy * sy / (2 * E); }

	/* ---------- materials: TYPICAL values. E, G in GPa; strengths in MPa; el = elongation at break %; ra = reduction of area % (rough; shapes the neck);
	   rho kg/m³; a = thermal expansion in µm/m·°C (10⁻⁶/K). c = curve model: duct | luders | brittle | polymer | rubber. sc = compressive strength. ---------- */
	var FAMS = [["metal", "Metals"], ["polymer", "Plastics"], ["elastomer", "Rubber"], ["ceramic", "Concrete, stone & ceramics"], ["wood", "Wood"], ["composite", "Composites"], ["bio", "Bone"]];
	var MATS = [
		{ id: "a36", name: "Structural steel A36", fam: "metal", E: 200, G: 79.3, nu: 0.26, sy: 250, su: 400, el: 23, ra: 55, rho: 7850, a: 11.7, c: "luders", x: { uy: 1.12, eL: 0.016 }, note: "Yield and tensile strength are the ASTM A36 minimums; real plate is often 10 to 20% stronger. Mild steel has a yield point: the stress drops a little and the bar stretches at constant stress (Lüders bands) before it hardens." },
		{ id: "s1020", name: "Carbon steel 1020, hot rolled", fam: "metal", E: 200, G: 77.5, nu: 0.29, sy: 210, su: 380, el: 25, ra: 50, rho: 7870, a: 11.7, c: "luders", x: { uy: 1.1, eL: 0.02 } },
		{ id: "s4140", name: "Alloy steel 4140, annealed", fam: "metal", E: 205, G: 80, nu: 0.29, sy: 417, su: 655, el: 25.7, ra: 56.9, rho: 7850, a: 12.3, c: "duct", note: "Quenched and tempered 4140 is two to three times stronger, with less elongation." },
		{ id: "ss304", name: "Stainless steel 304, annealed", fam: "metal", E: 193, G: 75, nu: 0.29, sy: 215, su: 505, el: 60, ra: 65, rho: 8000, a: 17.3, c: "duct" },
		{ id: "ss316", name: "Stainless steel 316, annealed", fam: "metal", E: 193, G: 75, nu: 0.29, sy: 290, su: 580, el: 50, ra: 65, rho: 8000, a: 16.0, c: "duct" },
		{ id: "al6061", name: "Aluminium 6061-T6", fam: "metal", E: 68.9, G: 26, nu: 0.33, sy: 276, su: 310, el: 12, ra: 40, rho: 2700, a: 23.6, c: "duct" },
		{ id: "al2014", name: "Aluminium 2014-T6", fam: "metal", E: 73.1, G: 27, nu: 0.35, sy: 414, su: 469, el: 10, ra: 25, rho: 2790, a: 23, c: "duct", note: "Hibbeler's textbook values (also: ultimate shear strength 290 MPa)." },
		{ id: "al2024", name: "Aluminium 2024-T3", fam: "metal", E: 73.1, G: 28, nu: 0.33, sy: 345, su: 483, el: 18, ra: 25, rho: 2780, a: 23.2, c: "duct" },
		{ id: "al7075", name: "Aluminium 7075-T6", fam: "metal", E: 71.7, G: 26.9, nu: 0.33, sy: 503, su: 572, el: 11, ra: 25, rho: 2810, a: 23.4, c: "duct" },
		{ id: "ti64", name: "Titanium Ti-6Al-4V (grade 5)", fam: "metal", E: 113.8, G: 44, nu: 0.342, sy: 880, su: 950, el: 14, ra: 36, rho: 4430, a: 8.6, c: "duct" },
		{ id: "cu", name: "Copper C11000, annealed", fam: "metal", E: 115, G: 44, nu: 0.31, sy: 69, su: 220, el: 50, ra: 75, rho: 8890, a: 17.0, c: "duct", note: "Annealed copper has no sharp yield point; the 0.2% offset rule gives the yield strength." },
		{ id: "brass", name: "Brass C36000, half hard", fam: "metal", E: 97, G: 37, nu: 0.31, sy: 310, su: 400, el: 25, ra: 50, rho: 8500, a: 20.5, c: "duct", note: "Free-cutting brass bar; strength depends a lot on the bar size and temper." },
		{ id: "bronze", name: "Bronze C93200 (bearing bronze)", fam: "metal", E: 100, G: 37, nu: 0.34, sy: 130, su: 240, el: 20, ra: 20, rho: 8930, a: 18.0, c: "duct", note: "Cast bearing bronze (SAE 660); continuous-cast bar is a little stronger than sand castings." },
		{ id: "iron", name: "Grey cast iron, class 30", fam: "metal", E: 100, G: 40, nu: 0.26, sy: null, su: 214, sc: 752, el: 0.6, ra: 0, rho: 7150, a: 10.8, c: "brittle", note: "Brittle in tension: no yield point, breaks at well under 1% strain. About 3.5 times stronger in compression (752 MPa). E falls as the stress rises." },
		{ id: "mg", name: "Magnesium AZ31B-H24", fam: "metal", E: 45, G: 17, nu: 0.35, sy: 200, su: 270, el: 8, ra: 15, rho: 1770, a: 26.0, c: "duct" },
		{ id: "ni", name: "Nickel 200, annealed", fam: "metal", E: 204, G: 79, nu: 0.31, sy: 150, su: 460, el: 45, ra: 70, rho: 8890, a: 13.3, c: "duct" },
		{ id: "in718", name: "Inconel 718, aged", fam: "metal", E: 200, G: 77.2, nu: 0.29, sy: 1100, su: 1375, el: 20, ra: 30, rho: 8190, a: 13.0, c: "duct", note: "Nickel superalloy; keeps most of its strength up to about 650 °C." },
		{ id: "w", name: "Tungsten, pure", fam: "metal", E: 411, G: 161, nu: 0.28, sy: null, su: 980, el: 0.4, ra: 0, rho: 19250, a: 4.5, c: "brittle", note: "Brittle at room temperature (it turns ductile above a few hundred °C). Strength depends hugely on how it was made: soft wire 550 MPa, drawn wire over 1,900 MPa." },
		{ id: "pb", name: "Lead, pure", fam: "metal", E: 16, G: 5.6, nu: 0.44, sy: 5.5, su: 17, el: 50, ra: 90, rho: 11340, a: 28.9, c: "duct", note: "Lead creeps at room temperature: under a steady load it keeps stretching slowly. Its yield and tensile strengths vary a lot with purity and grain size (tensile about 12 to 18 MPa)." },
		{ id: "au", name: "Gold, pure, annealed", fam: "metal", E: 79, G: 27, nu: 0.42, sy: 30, su: 125, el: 45, ra: 85, rho: 19300, a: 14.2, c: "duct", note: "Annealed pure gold starts to yield at a very low stress; the yield figure is a rough one. Jewellery alloys (18 carat and below) are several times stronger." },
		{ id: "ag", name: "Silver, pure, annealed", fam: "metal", E: 83, G: 30, nu: 0.37, sy: 55, su: 170, el: 50, ra: 80, rho: 10490, a: 18.9, c: "duct", note: "Soft pure silver; the yield figure is a rough one. Sterling silver (92.5%) is about twice as strong." },
		{ id: "oak", name: "Red oak, along the grain", fam: "wood", aniso: true, E: 12.5, G: 1.1, nu: 0.35, sy: null, su: 100, el: 0.85, ra: 0, rho: 700, a: 4.0, c: "brittle", note: "Small clear pieces at 12% moisture. Real lumber with knots is much weaker, and across the grain wood is about 20 times softer." },
		{ id: "pine", name: "Southern yellow pine, along the grain", fam: "wood", aniso: true, E: 12.3, G: 1.0, nu: 0.33, sy: null, su: 85, el: 0.75, ra: 0, rho: 570, a: 4.0, c: "brittle", note: "Small clear pieces at 12% moisture. Grade lumber is much weaker." },
		{ id: "oakx", name: "Red oak, across the grain", fam: "wood", aniso: true, E: 1.0, G: 0.4, nu: 0.35, sy: null, su: 5.5, sc: 7.0, el: null, ra: 0, rho: 700, a: 35, c: "brittle", note: "Pulled across the grain (tangential direction), small clear pieces at 12% moisture: about 12 times softer and nearly 20 times weaker than along the grain. Wood splits easily this way, which is why bolts near an end can tear out. Across the grain wood also swells and shrinks with moisture far more than with temperature." },
		{ id: "dfir", name: "Douglas fir (coast), along the grain", fam: "wood", aniso: true, E: 13.4, G: 0.9, nu: 0.29, sy: null, su: 105, sc: 50, el: 0.85, ra: 0, rho: 480, a: 3.5, c: "brittle", note: "Small clear pieces at 12% moisture (Wood Handbook). The main North American framing and glulam timber; graded lumber has a much lower design strength because of knots and slope of grain." },
		{ id: "dfirx", name: "Douglas fir (coast), across the grain", fam: "wood", aniso: true, E: 0.9, G: 0.08, nu: 0.37, sy: null, su: 2.3, sc: 5.5, el: null, ra: 0, rho: 480, a: 27, c: "brittle", note: "Across the grain (radial direction): about 15 times softer and 45 times weaker in tension than along it. Design codes give almost no tension strength across the grain." },
		{ id: "spruce", name: "Sitka spruce, along the grain", fam: "wood", aniso: true, E: 10.8, G: 0.7, nu: 0.37, sy: null, su: 75, sc: 38.7, el: 0.75, ra: 0, rho: 400, a: 3.5, c: "brittle", note: "Light and stiff for its weight: used for aircraft spars, ladders, masts and the tops of guitars and violins. Small clear pieces at 12% moisture." },
		{ id: "maple", name: "Sugar maple (hard maple), along the grain", fam: "wood", aniso: true, E: 12.6, G: 0.85, nu: 0.42, sy: null, su: 108, sc: 54, el: 0.9, ra: 0, rho: 700, a: 4.0, c: "brittle", note: "Hard, dense and tough: floors, workbenches, bowling pins, bats. Small clear pieces at 12% moisture." },
		{ id: "birch", name: "Yellow birch, along the grain", fam: "wood", aniso: true, E: 13.9, G: 0.95, nu: 0.43, sy: null, su: 110, sc: 56, el: 0.85, ra: 0, rho: 690, a: 4.0, c: "brittle", note: "Small clear pieces at 12% moisture. Birch is also the usual wood of good-quality plywood." },
		{ id: "teak", name: "Teak, along the grain", fam: "wood", aniso: true, E: 12.3, G: 0.8, nu: 0.35, sy: null, su: 95, sc: 58, el: 0.8, ra: 0, rho: 650, a: 4.0, c: "brittle", note: "Plantation and old-growth teak differ a lot; the natural oils make it rot- and water-resistant (boat decks, garden furniture)." },
		{ id: "cedar", name: "Western red cedar, along the grain", fam: "wood", aniso: true, E: 7.7, G: 0.5, nu: 0.38, sy: null, su: 45, sc: 31, el: 0.6, ra: 0, rho: 370, a: 3.5, c: "brittle", note: "Light, soft and weather-resistant (siding, decks, shingles) but not very strong. Small clear pieces at 12% moisture." },
		{ id: "balsa", name: "Balsa, along the grain", fam: "wood", aniso: true, E: 3.4, G: 0.15, nu: 0.23, sy: null, su: 20, sc: 12, el: 0.6, ra: 0, rho: 160, a: 4.0, c: "brittle", note: "Medium-density balsa. Its stiffness and strength scale roughly with density (it ranges from about 100 to 250 kg/m³); used as the core of sandwich panels in wind turbine blades and boats." },
		{ id: "plywood", name: "Plywood, softwood, along the face grain", fam: "wood", aniso: true, E: 8.0, G: 0.5, nu: 0.3, sy: null, su: 30, sc: 25, el: 0.4, ra: 0, rho: 550, a: 5.0, c: "brittle", note: "Cross-laminated veneers, so it is similar along and across the panel (across the face grain about 60 to 80% of these values). Whole-panel values, including the plies that run the other way." },
		{ id: "concrete", name: "Concrete, normal (30 MPa)", fam: "ceramic", E: 30, G: 12.5, nu: 0.2, sy: null, su: 3, sc: 30, el: 0.01, ra: 0, rho: 2400, a: 10.0, c: "brittle", note: "Strong in compression (30 MPa here), weak in tension (about a tenth of that): that is why it is reinforced with steel. E is 25 to 35 GPa depending on the mix." },
		{ id: "glass", name: "Glass, soda-lime (window)", fam: "ceramic", E: 72, G: 29.5, nu: 0.22, sy: null, su: 45, sc: 1000, el: null, ra: 0, rho: 2500, a: 9.0, c: "brittle", note: "Perfectly elastic up to the break. The tensile strength depends on surface scratches: design values are much lower (about 7 to 20 MPa for long-term loads)." },
		{ id: "concrete20", name: "Concrete, low strength (20 MPa)", fam: "ceramic", E: 21, G: 8.75, nu: 0.2, sy: null, su: 2.2, sc: 20, el: null, ra: 0, rho: 2400, a: 10.0, c: "brittle", note: "Footings, slabs on ground, driveways. E from the ACI formula 4,700 √f′c (MPa); tension strength about a tenth of the compressive strength." },
		{ id: "concrete40", name: "Concrete, 40 MPa (structural)", fam: "ceramic", E: 33, G: 13.75, nu: 0.2, sy: null, su: 3.5, sc: 40, el: null, ra: 0, rho: 2400, a: 10.0, c: "brittle", note: "Eurocode 2 class C40/50: mean tensile strength 3.5 MPa, E about 35 GPa with quartzite aggregate (limestone aggregate gives about 10% less). Columns, bridges, precast beams." },
		{ id: "concrete60", name: "Concrete, high strength (60 MPa)", fam: "ceramic", E: 38, G: 15.8, nu: 0.2, sy: null, su: 4.4, sc: 60, el: null, ra: 0, rho: 2450, a: 10.0, c: "brittle", note: "Eurocode 2 class C60/75: tall-building columns, long bridges. Stronger concrete is also more brittle: it cracks more suddenly." },
		{ id: "uhpc", name: "Ultra-high-performance concrete (UHPC, 150 MPa)", fam: "ceramic", E: 50, G: 20.8, nu: 0.2, sy: null, su: 8, sc: 150, el: null, ra: 0, rho: 2500, a: 11.0, c: "brittle", note: "Very fine dense mix with steel fibres. The fibres keep carrying load after the first crack (not modelled here: the curve stops at first cracking, about 8 MPa)." },
		{ id: "lwconcrete", name: "Lightweight concrete (25 MPa)", fam: "ceramic", E: 15, G: 6.25, nu: 0.2, sy: null, su: 2.0, sc: 25, el: null, ra: 0, rho: 1800, a: 8.0, c: "brittle", note: "Made with expanded clay or shale instead of gravel: about a quarter lighter, but softer (E roughly halves) for the same strength." },
		{ id: "mortar", name: "Mortar (cement-lime, type N)", fam: "ceramic", E: 10, G: 4.2, nu: 0.2, sy: null, su: 1.0, sc: 10, el: null, ra: 0, rho: 2000, a: 10.0, c: "brittle", note: "The joint mortar of brick and block walls. Deliberately weaker than the bricks, so cracks go through the joints, which are easy to repoint. Type M or S mortar is 2 to 3 times stronger." },
		{ id: "brick", name: "Clay brick, solid", fam: "ceramic", E: 15, G: 6.25, nu: 0.2, sy: null, su: 3.0, sc: 50, el: null, ra: 0, rho: 1900, a: 6.0, c: "brittle", note: "Fired clay brick; values range widely (compressive strength about 10 to 100 MPa). A brick wall is much weaker than one brick, because of the mortar joints." },
		{ id: "granite", name: "Granite", fam: "ceramic", E: 50, G: 20, nu: 0.25, sy: null, su: 10, sc: 200, el: null, ra: 0, rho: 2700, a: 8.0, c: "brittle", note: "Intact rock tested in the lab. Rock in the ground is far weaker in bulk because of joints and cracks." },
		{ id: "limestone", name: "Limestone", fam: "ceramic", E: 40, G: 16, nu: 0.25, sy: null, su: 6, sc: 80, el: null, ra: 0, rho: 2500, a: 6.0, c: "brittle", note: "Dense building limestone; porous limestones can be 3 to 5 times weaker and softer." },
		{ id: "marble", name: "Marble", fam: "ceramic", E: 55, G: 22, nu: 0.25, sy: null, su: 8, sc: 120, el: null, ra: 0, rho: 2700, a: 7.0, c: "brittle", note: "Calcite marble. It expands differently along its crystal directions, so thin slabs left in the sun can bow over the years." },
		{ id: "sandstone", name: "Sandstone", fam: "ceramic", E: 15, G: 6.25, nu: 0.2, sy: null, su: 4, sc: 60, el: null, ra: 0, rho: 2300, a: 11.0, c: "brittle", note: "Values range very widely with porosity and the cement between the grains (compressive strength about 20 to 170 MPa)." },
		{ id: "asphalt", name: "Asphalt concrete (road surface, 20 °C)", fam: "ceramic", E: 3.0, G: 1.1, nu: 0.35, sy: null, su: 1.2, sc: 4, el: null, ra: 0, rho: 2350, a: 25, c: "brittle", note: "Asphalt is viscoelastic: these are values for a quick load at about 20 °C. In summer heat E falls to a few hundred MPa and it flows; in winter it rises above 10 GPa and it cracks. The curve here is a simple brittle one." },
		{ id: "glasstemp", name: "Glass, tempered (toughened)", fam: "ceramic", E: 72, G: 29.5, nu: 0.22, sy: null, su: 120, sc: 1000, el: null, ra: 0, rho: 2500, a: 9.0, c: "brittle", note: "Heat-treated so the surface is squeezed (about 100 MPa): a crack must first overcome that, so it is about 4 times stronger than plain glass, and it breaks into small blunt pieces. It cannot be cut or drilled after tempering." },
		{ id: "borosilicate", name: "Glass, borosilicate (Pyrex type)", fam: "ceramic", E: 64, G: 26.7, nu: 0.2, sy: null, su: 40, sc: 1000, el: null, ra: 0, rho: 2230, a: 3.3, c: "brittle", note: "Low thermal expansion (a third of window glass), so it survives sudden temperature changes: lab glassware, oven dishes." },
		{ id: "silica", name: "Fused silica (quartz glass)", fam: "ceramic", E: 73, G: 31.2, nu: 0.17, sy: null, su: 50, sc: 1100, el: null, ra: 0, rho: 2200, a: 0.55, c: "brittle", note: "Almost no thermal expansion: it can be heated red-hot and dropped in water. Optical fibres and lamp envelopes." },
		{ id: "porcelain", name: "Porcelain (electrical / tableware)", fam: "ceramic", E: 70, G: 28.7, nu: 0.22, sy: null, su: 40, sc: 500, el: null, ra: 0, rho: 2400, a: 6.0, c: "brittle" },
		{ id: "alumina", name: "Alumina ceramic (99.5% Al₂O₃)", fam: "ceramic", E: 370, G: 152, nu: 0.22, sy: null, su: 260, sc: 2600, el: null, ra: 0, rho: 3890, a: 8.1, c: "brittle", note: "Very hard and stiff, keeps its strength at high temperature: cutting tools, wear parts, spark-plug insulators. Bending strength about 380 MPa." },
		{ id: "sic", name: "Silicon carbide, sintered", fam: "ceramic", E: 410, G: 180, nu: 0.14, sy: null, su: 300, sc: 3900, el: null, ra: 0, rho: 3100, a: 4.0, c: "brittle", note: "Extremely hard and stiff: armour plates, pump seals, brake discs. Bending strength about 450 MPa." },
		{ id: "si3n4", name: "Silicon nitride", fam: "ceramic", E: 310, G: 122, nu: 0.27, sy: null, su: 500, sc: 3000, el: null, ra: 0, rho: 3200, a: 3.3, c: "brittle", note: "The toughest of the common engineering ceramics: hybrid ball bearings, turbocharger rotors. Bending strength about 800 MPa." },
		{ id: "zirconia", name: "Zirconia (yttria-stabilised, Y-TZP)", fam: "ceramic", E: 205, G: 78, nu: 0.31, sy: null, su: 500, sc: 2500, el: null, ra: 0, rho: 6050, a: 10.5, c: "brittle", note: "Strong and comparatively tough for a ceramic (a crack turns its crystals into a bigger form, which squeezes the crack shut): dental crowns, knives. Bending strength about 1,000 MPa." },
		{ id: "nylon", name: "Nylon 6/6, dry", fam: "polymer", E: 2.9, G: 1.04, nu: 0.39, sy: 82, su: 82, el: 60, ra: null, rho: 1140, a: 80, c: "polymer", x: { ey: 0.05, dr: 0.85, ed: 0.45, brk: 80 }, note: "Nylon absorbs water: conditioned nylon is softer and stretches much more." },
		{ id: "pvc", name: "PVC, rigid (uPVC)", fam: "polymer", E: 3.0, G: 1.1, nu: 0.38, sy: 50, su: 50, el: 40, ra: null, rho: 1400, a: 70, c: "polymer", x: { ey: 0.035, dr: 0.8, ed: 0.3, brk: 45 } },
		{ id: "hdpe", name: "HDPE (high-density polyethylene)", fam: "polymer", E: 1.0, G: 0.35, nu: 0.42, sy: 26, su: 30, el: 600, ra: null, rho: 955, a: 150, c: "polymer", x: { ey: 0.1, dr: 0.7, ed: 4.0, brk: 30 }, note: "After yield a neck forms and travels along the bar (cold drawing) until the whole piece is drawn out." },
		{ id: "rubber", name: "Natural rubber (vulcanised)", fam: "elastomer", E: 0.002, G: 0.00067, nu: 0.4998, sy: null, su: 20, el: 600, ra: null, rho: 930, a: 220, c: "rubber", note: "E here is the starting slope (2 MPa); rubber stiffens a lot as it stretches. Almost incompressible: ν is very close to 0.5." },
		{ id: "sbr", name: "SBR rubber (styrene-butadiene, tyre tread)", fam: "elastomer", E: 0.003, G: 0.001, nu: 0.4997, sy: null, su: 18, el: 450, ra: null, rho: 1150, a: 220, c: "rubber", note: "The most-used synthetic rubber, mostly in tyres. Reinforced with carbon black; without it SBR is very weak (about 2 MPa)." },
		{ id: "nbr", name: "Nitrile rubber (NBR, 70 Shore A)", fam: "elastomer", E: 0.006, G: 0.002, nu: 0.4995, sy: null, su: 15, el: 400, ra: null, rho: 1250, a: 230, c: "rubber", note: "Oil- and fuel-resistant: the usual O-ring, hose and glove rubber. 70 Shore A is a medium-hard grade." },
		{ id: "epdm", name: "EPDM rubber (70 Shore A)", fam: "elastomer", E: 0.0055, G: 0.00183, nu: 0.4995, sy: null, su: 12, el: 350, ra: null, rho: 1150, a: 160, c: "rubber", note: "Weather-, ozone- and hot-water-resistant: roofing membranes, car door seals, radiator hoses. Swells badly in oil." },
		{ id: "neoprene", name: "Neoprene (chloroprene, 60 Shore A)", fam: "elastomer", E: 0.0035, G: 0.00117, nu: 0.4996, sy: null, su: 17, el: 450, ra: null, rho: 1240, a: 240, c: "rubber", note: "Tough all-round rubber: wetsuits (as foam), bridge bearings, belts, gaskets." },
		{ id: "silicone", name: "Silicone rubber (50 Shore A)", fam: "elastomer", E: 0.0018, G: 0.0006, nu: 0.4998, sy: null, su: 8, el: 500, ra: null, rho: 1150, a: 300, c: "rubber", note: "Keeps its stretch from about −60 to +230 °C and is food-safe: bakeware, medical tubing, seals. Weaker and tears more easily than most rubbers." },
		{ id: "fkm", name: "Fluoroelastomer (FKM / Viton, 75 Shore A)", fam: "elastomer", E: 0.007, G: 0.00233, nu: 0.4995, sy: null, su: 14, el: 250, ra: null, rho: 1850, a: 160, c: "rubber", note: "Resists fuels, oils and heat up to about 200 °C: engine and chemical-plant seals. Heavy and expensive." },
		{ id: "pur", name: "Polyurethane elastomer (85 Shore A)", fam: "elastomer", E: 0.012, G: 0.004, nu: 0.4993, sy: null, su: 35, el: 500, ra: null, rho: 1200, a: 150, c: "rubber", note: "Very strong and wear-resistant for a rubber: skateboard and forklift wheels, conveyor rollers, scraper blades. Harder grades (90 to 95 Shore A) are stiffer still." },
		{ id: "cfrp", name: "Carbon fibre / epoxy, along the fibres", fam: "composite", aniso: true, E: 135, G: 5.0, nu: 0.3, sy: null, su: 1500, sc: 1200, el: null, ra: 0, rho: 1600, a: -0.3, c: "brittle", note: "One-direction (unidirectional) laminate, about 60% fibre. Across the fibres it is only about 10 GPa and 50 MPa; woven or quasi-isotropic laminates are about 50 to 70 GPa." },
		{ id: "cfrpqi", name: "Carbon fibre / epoxy, quasi-isotropic laminate", fam: "composite", E: 55, G: 21, nu: 0.3, sy: null, su: 600, sc: 550, el: null, ra: 0, rho: 1600, a: 2.0, c: "brittle", note: "Plies laid at 0, 45, 90 and -45 degrees, so the panel is about equally stiff in every direction of its plane (bike frames, aircraft skins). Much weaker through the thickness." },
		{ id: "cfrpw", name: "Carbon fibre / epoxy, woven fabric (0/90)", fam: "composite", aniso: true, E: 70, G: 5.0, nu: 0.05, sy: null, su: 600, sc: 570, el: null, ra: 0, rho: 1550, a: 2.1, c: "brittle", note: "Plain or twill weave, along either fibre direction. At 45 degrees to the fibres it is only about 20 GPa." },
		{ id: "cfrphm", name: "Carbon fibre / epoxy, high-modulus fibre, along the fibres", fam: "composite", aniso: true, E: 230, G: 5.0, nu: 0.3, sy: null, su: 2000, sc: 1100, el: null, ra: 0, rho: 1650, a: -0.5, c: "brittle", note: "High-modulus fibre (M40J type), unidirectional, about 60% fibre: stiffer than steel at a fifth of the weight. Satellite and racing parts." },
		{ id: "gfrp", name: "Glass fibre / epoxy, along the fibres", fam: "composite", aniso: true, E: 40, G: 4.0, nu: 0.28, sy: null, su: 1000, sc: 600, el: null, ra: 0, rho: 2000, a: 6.0, c: "brittle", note: "E-glass, unidirectional, about 55% fibre (wind turbine spar caps, leaf springs). Across the fibres about 10 GPa and 40 MPa." },
		{ id: "grp", name: "Fibreglass (chopped strand mat / polyester)", fam: "composite", E: 8, G: 3.0, nu: 0.3, sy: null, su: 100, sc: 150, el: null, ra: 0, rho: 1500, a: 25, c: "brittle", note: "Hand-laid GRP as in boat hulls, tanks and car panels: random short fibres, about 30% glass, so the same in every direction of the sheet. 7 to 10 GPa." },
		{ id: "kevlar", name: "Aramid (Kevlar 49) / epoxy, along the fibres", fam: "composite", aniso: true, E: 76, G: 2.1, nu: 0.34, sy: null, su: 1380, sc: 280, el: null, ra: 0, rho: 1380, a: -2.0, c: "brittle", note: "Very strong in tension but weak in compression (the fibres kink): good for pressure vessels and impact protection, poor for columns." },
		{ id: "basalt", name: "Basalt fibre / epoxy, along the fibres", fam: "composite", aniso: true, E: 45, G: 4.5, nu: 0.3, sy: null, su: 1100, sc: 600, el: null, ra: 0, rho: 2000, a: 6.0, c: "brittle", note: "Similar to glass fibre, a little stiffer; also used as rebar that does not rust." },
		{ id: "pagf", name: "Glass-filled nylon (PA66, 30% glass), dry", fam: "composite", E: 9.5, G: 3.5, nu: 0.35, sy: null, su: 190, sc: 230, el: null, ra: 0, rho: 1370, a: 25, c: "brittle", note: "Injection-moulded short-fibre composite (power-tool housings, car engine parts). Breaks at about 3% strain; when it has absorbed water about 7 GPa and 130 MPa. Stiffer along the flow direction." },
		{ id: "bone", name: "Bone, cortical, along the axis", fam: "bio", aniso: true, E: 18, G: 3.3, nu: 0.3, sy: 105, su: 130, sc: 190, el: 2.5, ra: 0, rho: 1900, a: null, c: "duct", note: "Human thigh bone (femur) from healthy adults; values spread widely between people and with age." }
	];
	function mat(id) { for (var i = 0; i < MATS.length; i++) if (MATS[i].id === id) return MATS[i]; return null; }

	/* ---------- the stress-strain model ----------
	   Metals: Ramberg-Osgood / Hollomon in true terms, eps_true = sigma/E + (sigma/K)^(1/n), with K and n fitted so the 0.2% offset yield is sy and the
	   maximum engineering stress (Considere: d sigma / d eps = sigma, i.e. true plastic strain = n(1 - sigma/E) ~ n) is su. Necking from there to the
	   elongation at break. Mild steel: elastic to an upper yield point, drop to the lower yield (= sy), Luders plateau, then the same hardening law.
	   A metal whose break comes before the Considere point (bone, cast magnesium...) is fitted so the curve reaches su exactly at the break. */
	function roPoint(sig, E, K, n) { var ep = sig > 0 ? Math.pow(sig / K, 1 / n) : 0, et = sig / E + ep, e = Math.exp(et) - 1; return { e: e, s: sig / (1 + e), t: sig, et: et, ep: ep }; }
	function neckOf(E, K, n) { var sg = K * Math.pow(n, n); for (var i = 0; i < 40; i++) sg = K * Math.pow(Math.max(1e-9, n * (1 - sg / E)), n); return roPoint(sg, E, K, n); }
	function offsetRO(E, K, n, hi) {   /* engineering stress where the curve meets s = E (e - 0.002) */
		var lo = 0; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2, p = roPoint(m, E, K, n); if (p.s - E * (p.e - 0.002) > 0) lo = m; else hi = m; }
		return roPoint((lo + hi) / 2, E, K, n);
	}
	function kForUts(E, n, su) { var K = su / (Math.pow(n, n) * Math.exp(-n)); for (var i = 0; i < 8; i++) K *= su / neckOf(E, K, n).s; return K; }
	function fitDuct(E, sy, su) {
		var lo = 0.003, hi = 0.9, K, n;
		for (var i = 0; i < 70; i++) { n = (lo + hi) / 2; K = kForUts(E, n, su); var y = offsetRO(E, K, n, neckOf(E, K, n).t).s; if (y > sy) lo = n; else hi = n; }
		n = (lo + hi) / 2; return { n: n, K: kForUts(E, n, su) };
	}
	function fitNonneck(E, sy, su, ef) {   /* the curve passes through (ef, su): the break is the highest point */
		var tf = su * (1 + ef), epf = Math.log(1 + ef) - tf / E; if (!(epf > 0.0021)) return null;
		var lo = 0.002, hi = 1.5, n, K;
		for (var i = 0; i < 70; i++) { n = (lo + hi) / 2; K = tf / Math.pow(epf, n); var y = offsetRO(E, K, n, tf).s; if (y > sy) lo = n; else hi = n; }
		n = (lo + hi) / 2; return { n: n, K: tf / Math.pow(epf, n), tf: tf };
	}
	/* mild steel after the Luders plateau: Swift law sigma = K (e0 + ep - epL)^n, continuous with the plateau (K e0^n = plateau true stress), necking near
	   the target uniform elongation euT and the highest engineering stress exactly su (n found by bisection; e0 follows from the necking condition) */
	function swiftLaw(f) { return { f: function (ep) { return f.K * Math.pow(f.e0 + ep - f.epL, f.n); }, d: function (ep) { return f.K * f.n * Math.pow(f.e0 + ep - f.epL, f.n - 1); } }; }
	function neckLaw(L, E, lo, hi) {   /* Considere with elastic strain: d sigma / d ep = sigma / (1 - sigma / E) */
		for (var i = 0; i < 90; i++) { var m = (lo + hi) / 2, t = L.f(m); if (L.d(m) - t / (1 - t / E) > 0) lo = m; else hi = m; }
		var ep = (lo + hi) / 2, tt = L.f(ep), et = tt / E + ep, e = Math.exp(et) - 1; return { ep: ep, t: tt, et: et, e: e, s: tt / (1 + e) };
	}
	function fitLuders(E, sly, su, eL, euT) {
		var tL = sly * (1 + eL), epL = Math.log(1 + eL) - tL / E, tu = su * (1 + euT), xu = Math.max(0.001, Math.log(1 + euT) - tu / E - epL), k0 = 1 - tu / E;
		function mk(n) { var e0 = n * k0 - xu; return e0 > 1e-7 ? { n: n, K: tL / Math.pow(e0, n), e0: e0, epL: epL, tL: tL } : null; }
		var lo = xu / k0 * 1.000001, hi = 10, f;
		for (var i = 0; i < 90; i++) { var n = (lo + hi) / 2; f = mk(n); if (!f || neckLaw(swiftLaw(f), E, epL, epL + 6).s > su) lo = n; else hi = n; }
		f = mk((lo + hi) / 2) || mk(hi); return f;
	}
	function lin(a, b, k) { return a + (b - a) * k; }
	/* p = {E (Pa), sy, su (Pa), el (%), ra (%), c, x}; returns the curve: arrays e, s (engineering), t (true stress), et (true strain), ph (phase), and key points */
	function curve(m) {
		var E = m.E * 1e9, sy = m.sy != null ? m.sy * 1e6 : null, su = m.su * 1e6, ef = m.el != null ? m.el / 100 : null, ra = m.ra != null ? m.ra / 100 : null;
		var c = { type: m.c, E: E, e: [], s: [], t: [], et: [], ph: [], name: m.name, id: m.id, warn: "" };
		function add(e, s, t, et, ph) { c.e.push(e); c.s.push(s); c.t.push(t != null ? t : s * (1 + e)); c.et.push(et != null ? et : Math.log(1 + e)); c.ph.push(ph); }
		var type = m.c, fit, i, N;
		if ((type === "duct" || type === "luders") && !(sy > 0 && su > sy * 1.0005)) type = sy > 0 ? "duct" : "brittle";
		if ((type === "duct" || type === "luders") && ef == null) ef = 0.2;
		var fitL = null;
		if (type === "luders") { fitL = fitLuders(E, sy, su, (m.x && m.x.eL) || 0.015, (m.x && m.x.eu) || 0.7 * ef); if (!fitL || !(fitL.epL > 1e-4) || !(fitL.K > 0) || !isFinite(fitL.K)) { fitL = null; type = "duct"; c.warn = "no plateau"; } }
		if (type === "brittle") {
			if (ef == null || ef < su / E) ef = su / E;
			var mm = Math.max(1, E * ef / su); c.mExp = mm;
			for (i = 0; i <= 160; i++) { var e = i === 160 ? ef : ef * i / 160; add(e, su * (1 - Math.pow(Math.max(0, 1 - e / ef), mm)), null, null, "el"); }
			c.yieldKind = "none"; c.sy = null; c.su = su; c.eu = ef; c.ef = ef; c.sf = su; c.brittle = true;
		} else if (type === "rubber") {
			var G = E / 3, lb = 1 + ef, A0 = G * (lb - 1 / (lb * lb)), I1 = lb * lb + 2 / lb - 3, Jm = su > A0 ? su * I1 / (su - A0) : 1e9;
			if (!(su > A0)) {   /* too stiff to reach that stretch below su: it snaps earlier, where the neo-Hookean stress reaches su */
				var lo2 = 1, hi2 = lb; for (var it = 0; it < 80; it++) { var mid = (lo2 + hi2) / 2; if (G * (mid - 1 / (mid * mid)) < su) lo2 = mid; else hi2 = mid; }
				ef = (lo2 + hi2) / 2 - 1; Jm = 1e12; c.warn = "breaks earlier than the elongation you typed: rubber with this E reaches its strength at " + sig(ef * 100, 3) + "%";
			}
			c.Jm = Jm; c.G = G;
			for (i = 0; i <= 240; i++) { var l = 1 + ef * Math.pow(i / 240, 1.5), I = l * l + 2 / l - 3, s = G * (l - 1 / (l * l)) * Jm / (Jm - I); add(l - 1, s, s * l, Math.log(l), "el"); }
			c.yieldKind = "none"; c.sy = null; c.su = c.s[c.s.length - 1]; c.eu = ef; c.ef = ef; c.sf = c.su; c.elastic = true;
		} else if (type === "polymer") {
			var x = m.x || {}, ey = x.ey || 0.05, sd = (x.dr || 0.8) * sy, ed = x.ed || ef * 0.7, sb = (x.brk || sy / 1e6 * 0.95) * 1e6, mp = Math.max(1, E * ey / sy), e2 = ey * 1.4;
			if (ed >= ef) ed = ef * 0.8;
			for (i = 0; i <= 70; i++) { var ee = i === 70 ? ey : ey * i / 70; add(ee, sy * (1 - Math.pow(Math.max(0, 1 - ee / ey), mp)), null, null, "el"); }
			for (i = 1; i <= 20; i++) { var k = i / 20; add(lin(ey, e2, k), sd + (sy - sd) * (1 + Math.cos(PI * k)) / 2, null, null, "draw"); }
			for (i = 1; i <= 40; i++) add(lin(e2, ed, i / 40), sd, null, null, "draw");
			for (i = 1; i <= 60; i++) { var kk = i / 60; add(lin(ed, ef, kk), sd + (sb - sd) * Math.pow(kk, 1.5), null, null, "hard"); }
			c.yieldKind = "peak"; c.sy = sy; c.ey = ey; c.ed = ed; c.e2 = e2; c.sd = sd; c.su = Math.max(sy, sb); c.eu = sb > sy ? ef : ey; c.ef = ef; c.sf = sb;
		} else {
			var nn = null;
			if (type === "luders") {
				var uy = (m.x && m.x.uy) || 1.1, eL = (m.x && m.x.eL) || 0.015; fit = fitL;
				var suy = uy * sy, e1 = suy / E, law = swiftLaw(fit);
				for (i = 0; i <= 40; i++) add(e1 * i / 40, suy * i / 40, null, null, "el");
				for (i = 1; i <= 6; i++) add(e1 + 0.0004 * i / 6, lin(suy, sy, i / 6), null, null, "yp");
				for (i = 1; i <= 40; i++) add(lin(e1 + 0.0004, eL, i / 40), sy, null, null, "lud");
				c.suy = suy; c.eL = eL; c.yieldKind = "luders"; c.sy = sy;
				var nk = neckLaw(law, E, fit.epL, fit.epL + 6);
				for (i = 1; i <= 220; i++) { var ep = lin(fit.epL, nk.ep, Math.pow(i / 220, 1.6)), sg = law.f(ep), et = sg / E + ep, eE = Math.exp(et) - 1; add(eE, sg / (1 + eE), sg, et, "pl"); }
				nn = nk; c.law = law.f; c.e0 = fit.e0;
			} else {
				fit = fitDuct(E, sy, su); var nk2 = neckOf(E, fit.K, fit.n);
				if (ef != null && nk2.e >= ef) { var f2 = fitNonneck(E, sy, su, ef); if (f2) { fit = f2; nk2 = null; c.noNeck = true; } }
				var top = nk2 ? nk2.t : fit.tf, yp = offsetRO(E, fit.K, fit.n, top), sL = 0.6 * yp.t;
				for (i = 0; i <= 40; i++) { var p = roPoint(sL * i / 40, E, fit.K, fit.n); add(p.e, p.s, p.t, p.et, "el"); }
				var ep0 = roPoint(sL, E, fit.K, fit.n).ep, ep1 = nk2 ? nk2.ep : Math.log(1 + ef) - fit.tf / E;
				var lg0 = Math.log(Math.max(ep0, 1e-9)), lg1 = Math.log(ep1);
				for (i = 1; i <= 240; i++) {
					var epi = Math.exp(lin(lg0, lg1, i / 240)); if (i === 240) epi = ep1;
					var sgi = fit.K * Math.pow(epi, fit.n);
					if (!nk2 && i === 240) sgi = fit.tf;
					var eti = sgi / E + epi, ei = Math.exp(eti) - 1; if (!nk2 && i === 240) ei = ef;
					add(ei, sgi / (1 + ei), sgi, eti, epi < 0.002 * 0.5 ? "el" : "pl");
				}
				c.yieldKind = "offset"; c.sy = sy; nn = nk2; c.law = (function (K, n) { return function (ep) { return K * Math.pow(ep, n); }; })(fit.K, fit.n);
			}
			c.n = fit.n; c.K = fit.K;
			if (type === "duct" && !c.noNeck) { var ck = offsetRO(E, fit.K, fit.n, neckOf(E, fit.K, fit.n).t).s; if (Math.abs(ck - sy) > 0.03 * sy) c.warn = "fit"; }
			if (nn) {
				c.eu = nn.e; c.su = nn.s; c.etu = nn.et;
				if (ef == null || ef <= nn.e * 1.0001) { c.ef = nn.e; c.sf = nn.s; c.warn = "breaks at the top of the curve"; }
				else {
					var RA = ra != null && ra > 0 ? ra : 0.35, etf = Math.max(-Math.log(1 - Math.min(RA, 0.97)), nn.et * 1.05);
					var tfN = c.law(Math.max(etf - nn.t / E, nn.ep)), sf = tfN * (1 - Math.min(RA, 0.97));
					sf = Math.min(0.95 * nn.s, Math.max(0.55 * nn.s, sf));
					for (i = 1; i <= 120; i++) { var u = i / 120, eN = lin(nn.e, ef, u), sN = nn.s - (nn.s - sf) * u * u, etN = lin(nn.et, etf, u), tN = c.law(Math.max(etN - nn.t / E, nn.ep)); add(eN, sN, tN, etN, "neck"); }
					c.ef = ef; c.sf = sf; c.raUsed = RA; c.raGuess = !(ra != null && ra > 0); c.etf = etf;
				}
			} else { c.eu = ef; c.su = c.s[c.s.length - 1]; c.ef = ef; c.sf = c.su; }
		}
		c.ra = ra; c.res = c.sy && type !== "polymer" ? resilience(c.sy, E) : null;   /* plastics bend before their yield peak, so sigma_y^2/2E would not be their stored energy */
		var tough = 0; for (i = 1; i < c.e.length; i++) tough += (c.e[i] - c.e[i - 1]) * (c.s[i] + c.s[i - 1]) / 2; c.tough = tough;
		var sm = 0, im = 0; for (i = 0; i < c.s.length; i++) if (c.s[i] > sm) { sm = c.s[i]; im = i; } c.smax = sm; c.emax = c.e[im];
		return c;
	}
	/* the tensile model needs numbers in the range real materials have; a typed material outside it is clamped (and told why) before curve() */
	function saneCurveMat(m) {
		var o = JSON.parse(JSON.stringify(m)), notes = [], k = o.c;
		function cl(key, lo, hi, why) { var v = o[key]; if (v == null || !isFinite(v)) return; var w = Math.min(hi, Math.max(lo, v)); if (Math.abs(w - v) > 1e-12 * Math.abs(v)) { o[key] = w; notes.push(why); } }
		if (k === "rubber") { cl("E", 0.0002, 0.1, "rubber's E is between 0.2 and 100 MPa"); cl("su", 0.5, 80, "rubber breaks at 0.5 to 80 MPa"); cl("el", 20, 1500, "rubber stretches 20 to 1500%"); }
		else if (k === "polymer") { cl("E", 0.05, 20, "plastics have E between 0.05 and 20 GPa"); if (o.sy != null) { var ys = o.sy / (o.E * 1e3); if (ys < 0.004 || ys > 0.15) { o.sy = Math.min(0.15, Math.max(0.004, ys)) * o.E * 1e3; notes.push("a plastic yields at 0.4% to 15% strain"); } } cl("el", 2, 1500, "elongation between 2 and 1500%"); }
		else {
			cl("E", 1, 1000, "metals and ceramics have E between 1 and 1000 GPa"); cl("el", 0.005, 100, "elongation between 0.005% and 100%");
			if (o.sy != null && k !== "brittle") { var yst = o.sy / (o.E * 1e3); if (yst > 0.015) { o.sy = 0.015 * o.E * 1e3; notes.push("a metal yields at under 1.5% strain (check the units of E and the yield strength)"); } if (yst < 2e-5) { o.sy = 2e-5 * o.E * 1e3; notes.push("yield strength too low for this E"); } }
			if (o.sy != null && o.su > 4 * o.sy && k !== "brittle") { o.su = 4 * o.sy; notes.push("tensile strength is at most 4 times the yield strength here"); }
			if (k === "brittle" && o.su / (o.E * 1e3) > 0.05) { o.su = 0.05 * o.E * 1e3; notes.push("a brittle material breaks below 5% strain"); }
			if (k === "brittle" && o.el != null && o.el / 100 > 5 * o.su / (o.E * 1e3)) { o.el = 500 * o.su / (o.E * 1e3); notes.push("a brittle material breaks soon after its straight part, at about " + sig(o.el, 2) + "% here"); }
		}
		return { m: o, notes: notes };
	}
	function idxAt(c, e) { var lo = 0, hi = c.e.length - 1; if (e <= c.e[0]) return 0; if (e >= c.e[hi]) return hi; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (c.e[m] <= e) lo = m; else hi = m; } return lo; }
	function stressAt(c, e) { var i = idxAt(c, e), j = Math.min(i + 1, c.e.length - 1); if (j === i || c.e[j] === c.e[i]) return c.s[i]; return lin(c.s[i], c.s[j], (e - c.e[i]) / (c.e[j] - c.e[i])); }
	/* what a lab would read off the curve */
	function measure(c) {
		var E = c.E, i, r = {};
		var xs = [], ys = [], lim = Math.min((c.sy || c.su) * 0.05, E * 0.005);
		for (i = 0; i < c.e.length && c.s[i] <= lim; i++) { xs.push(c.e[i]); ys.push(c.s[i]); }
		if (xs.length < 3) { xs = [0, c.e[1]]; ys = [0, c.s[1]]; }
		var sxy = 0, sxx = 0; for (i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; } r.E = sxy / sxx;   /* line through the origin */
		r.offset = null;
		for (i = 1; i < c.e.length; i++) { var f0 = c.s[i - 1] - E * (c.e[i - 1] - 0.002), f1 = c.s[i] - E * (c.e[i] - 0.002); if (f0 > 0 && f1 <= 0) { var k = f0 / (f0 - f1); r.offset = { e: lin(c.e[i - 1], c.e[i], k), s: lin(c.s[i - 1], c.s[i], k) }; break; } }
		r.uts = c.smax; r.eu = c.emax; r.ef = c.e[c.e.length - 1]; r.sf = c.s[c.s.length - 1];
		if (c.type === "polymer") { var pk = 0, pe = 0; for (i = 0; i < c.e.length && c.ph[i] === "el"; i++) if (c.s[i] > pk) { pk = c.s[i]; pe = c.e[i]; } r.peak = { e: pe, s: pk }; }
		return r;
	}
	function permanentSet(c, e, s) { return c.elastic ? 0 : Math.max(0, e - s / c.E); }

	var api = { UNITS: UNITS, factor: factor, toSI: toSI, fromSI: fromSI, conv: conv, unitOf: unitOf, parseNum: parseNum, parseQty: parseQty, sig: sig, pretty: pretty,
		SHAPES: SHAPES, section: section, sizeFor: sizeFor, AX: AX, axialPropagate: axialPropagate, axialSolve: axialSolve, euler: euler,
		shearPin: shearPin, pinSize: pinSize, gFrom: gFrom, kFrom: kFrom, torsion: torsion, shaftSize: shaftSize, torqueFromPower: torqueFromPower,
		elastic: elastic, hooke: hooke, hookeInv: hookeInv, poissonBar: poissonBar, thermal: thermal, thermalDT: thermalDT, bucklingStress: bucklingStress, thermalSeries: thermalSeries, thermalState: thermalState, heatRGB: heatRGB, resilience: resilience,
		FAMS: FAMS, MATS: MATS, mat: mat, curve: curve, saneCurveMat: saneCurveMat, stressAt: stressAt, idxAt: idxAt, measure: measure, permanentSet: permanentSet, roPoint: roPoint, neckOf: neckOf };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESMech = api;
})(this);
