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
	function resilience(sy, E) { return sy * sy / (2 * E); }

	/* ---------- materials: TYPICAL values. E, G in GPa; strengths in MPa; el = elongation at break %; ra = reduction of area % (rough; shapes the neck);
	   rho kg/m³; a = thermal expansion in µm/m·°C (10⁻⁶/K). c = curve model: duct | luders | brittle | polymer | rubber. sc = compressive strength. ---------- */
	var FAMS = [["metal", "Metals"], ["polymer", "Plastics"], ["elastomer", "Rubber"], ["ceramic", "Concrete & glass"], ["wood", "Wood"], ["composite", "Composites"], ["bio", "Bone"]];
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
		{ id: "concrete", name: "Concrete, normal (30 MPa)", fam: "ceramic", E: 30, G: 12.5, nu: 0.2, sy: null, su: 3, sc: 30, el: 0.01, ra: 0, rho: 2400, a: 10.0, c: "brittle", note: "Strong in compression (30 MPa here), weak in tension (about a tenth of that): that is why it is reinforced with steel. E is 25 to 35 GPa depending on the mix." },
		{ id: "glass", name: "Glass, soda-lime (window)", fam: "ceramic", E: 72, G: 29.5, nu: 0.22, sy: null, su: 45, sc: 1000, el: null, ra: 0, rho: 2500, a: 9.0, c: "brittle", note: "Perfectly elastic up to the break. The tensile strength depends on surface scratches: design values are much lower (about 7 to 20 MPa for long-term loads)." },
		{ id: "nylon", name: "Nylon 6/6, dry", fam: "polymer", E: 2.9, G: 1.04, nu: 0.39, sy: 82, su: 82, el: 60, ra: null, rho: 1140, a: 80, c: "polymer", x: { ey: 0.05, dr: 0.85, ed: 0.45, brk: 80 }, note: "Nylon absorbs water: conditioned nylon is softer and stretches much more." },
		{ id: "pvc", name: "PVC, rigid (uPVC)", fam: "polymer", E: 3.0, G: 1.1, nu: 0.38, sy: 50, su: 50, el: 40, ra: null, rho: 1400, a: 70, c: "polymer", x: { ey: 0.035, dr: 0.8, ed: 0.3, brk: 45 } },
		{ id: "hdpe", name: "HDPE (high-density polyethylene)", fam: "polymer", E: 1.0, G: 0.35, nu: 0.42, sy: 26, su: 30, el: 600, ra: null, rho: 955, a: 150, c: "polymer", x: { ey: 0.1, dr: 0.7, ed: 4.0, brk: 30 }, note: "After yield a neck forms and travels along the bar (cold drawing) until the whole piece is drawn out." },
		{ id: "rubber", name: "Natural rubber (vulcanised)", fam: "elastomer", E: 0.002, G: 0.00067, nu: 0.4998, sy: null, su: 20, el: 600, ra: null, rho: 930, a: 220, c: "rubber", note: "E here is the starting slope (2 MPa); rubber stiffens a lot as it stretches. Almost incompressible: ν is very close to 0.5." },
		{ id: "cfrp", name: "Carbon fibre / epoxy, along the fibres", fam: "composite", aniso: true, E: 135, G: 5.0, nu: 0.3, sy: null, su: 1500, sc: 1200, el: null, ra: 0, rho: 1600, a: -0.3, c: "brittle", note: "One-direction (unidirectional) laminate, about 60% fibre. Across the fibres it is only about 10 GPa and 50 MPa; woven or quasi-isotropic laminates are about 50 to 70 GPa." },
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
		elastic: elastic, hooke: hooke, hookeInv: hookeInv, poissonBar: poissonBar, thermal: thermal, resilience: resilience,
		FAMS: FAMS, MATS: MATS, mat: mat, curve: curve, saneCurveMat: saneCurveMat, stressAt: stressAt, idxAt: idxAt, measure: measure, permanentSet: permanentSet, roPoint: roPoint, neckOf: neckOf };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESMech = api;
})(this);

/* MES Mechanics of Materials UI (mes.fm/materials, /youngs-modulus-calculator, /tensile-test-simulator, /shear-stress-calculator). The maths is MESMech in lib.js
 * (prepended above). One script for four pages: <div id="mt" data-views="axial,tensile,..."> says which tabs a page shows. Every picture is drawn from the same
 * numbers as the readouts. State: localStorage mes-materials:v1 (shared by the four pages); share links are plain query strings. */
(function () {
	"use strict";
	var M = window.MESMech, root = document.getElementById("mt"); if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); }, KEY = "mes-materials:v1", PI = Math.PI;
	var VIEWS = (root.getAttribute("data-views") || "axial").split(","), PAGE = root.getAttribute("data-page") || "materials";
	/* display units per quantity class: [SI, US] */
	var DU = { force: ["kN", "kip"], len: ["m", "in"], small: ["mm", "in"], area: ["mm²", "in²"], stress: ["MPa", "ksi"], modulus: ["GPa", "ksi"], strain: ["mm/mm", "mm/mm"], pct: ["%", "%"], ustrain: ["µε", "µε"], ratio: ["mm/mm", "mm/mm"],
		torque: ["N·m", "lbf·ft"], power: ["kW", "hp"], speed: ["rpm", "rpm"], angle: ["°", "°"], dtemp: ["°C", "°F"], alpha: ["µm/m·°C", "µin/in·°F"], density: ["kg/m³", "lb/in³"], energy: ["MJ/m³", "in·lbf/in³"], inertia: ["mm⁴", "in⁴"] };
	var KIND = { small: "len", modulus: "stress", pct: "strain", ustrain: "strain", ratio: "strain" };
	function kindOf(d) { return KIND[d] || d; }
	var DEF = {
		si: { "ax-F": "10", "ax-L": "1", "ax-d": "10", "ax-D": "40", "ax-t": "3", "ax-b": "20", "ax-h": "10", "ax-B": "40", "ax-H": "20", "sh-V": "10", "sh-d": "10", "sh-A": "500", "sh-hd": "20", "sh-t": "6",
			"to-T": "1000", "to-P": "7.5", "to-n": "1450", "to-D": "50", "to-di": "40", "to-L": "1", "po-s": "100", "po-e": "0.001", "po-d": "20", "po-L": "1",
			"p3-sx": "80", "p3-sy": "-30", "p3-sz": "0", "p3-txy": "20", "p3-tyz": "0", "p3-tzx": "0", "p3-ex": "500", "p3-ey": "-150", "p3-ez": "-150", "p3-gxy": "0", "p3-gyz": "0", "p3-gzx": "0",
			"ec-E": "200", "ec-G": "76.92", "ec-K": "166.7", "ec-nu": "0.3", "th-dT": "40", "th-L": "10", "th-g": "2" },
		us: { "ax-F": "2", "ax-L": "40", "ax-d": "0.5", "ax-D": "1.5", "ax-t": "0.12", "ax-b": "1", "ax-h": "0.5", "ax-B": "2", "ax-H": "1", "sh-V": "2", "sh-d": "0.5", "sh-A": "1", "sh-hd": "0.75", "sh-t": "0.25",
			"to-T": "750", "to-P": "10", "to-n": "1750", "to-D": "2", "to-di": "1.5", "to-L": "40", "po-s": "15", "po-e": "0.001", "po-d": "0.75", "po-L": "40",
			"p3-sx": "12", "p3-sy": "-4", "p3-sz": "0", "p3-txy": "3", "p3-tyz": "0", "p3-tzx": "0", "p3-ex": "500", "p3-ey": "-150", "p3-ez": "-150", "p3-gxy": "0", "p3-gyz": "0", "p3-gzx": "0",
			"ec-E": "29000", "ec-G": "11150", "ec-K": "24170", "ec-nu": "0.3", "th-dT": "70", "th-L": "400", "th-g": "0.08" }
	};
	var MATF = ["ax-E", "sh-G", "to-G", "po-E", "po-nu", "p3-E", "p3-nu", "th-a", "th-E"];   /* filled from the material unless typed */
	function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;"); }
	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function r1(x) { return Math.round(x * 10) / 10; }
	function num(s) { return M.parseNum(s); }

	/* ---------- state ---------- */
	var S = { sys: "", mat: "a36", tabs: {}, f: {}, ax: { ord: ["F", "A", "L", "E"], shape: "round", dir: "t", sf: "2" }, tt: { c2: "", c3: "", zoom: "follow", tr: false, ar: true, sp: "1" },
		sh: { mode: "pin", n: "1", ratio: "0.75", sf: "2" }, to: { src: "T", hol: "0", sf: "2" }, po: { mode: "bar", by: "s", dir: "s", pair: "E,nu" }, th: { cond: "free" },
		tb: { q: "", fam: "", sort: "", dir: 1, x: "rho", y: "E" }, cu: null, lab: {} };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv && typeof sv === "object") for (var k0 in S) { if (sv[k0] == null) continue; if (S[k0] && typeof S[k0] === "object" && !Array.isArray(S[k0])) { for (var j0 in sv[k0]) S[k0][j0] = sv[k0][j0]; } else S[k0] = sv[k0]; } } catch (e) { /* ignore */ }
	if (S.tt.zv !== 1) { S.tt.zoom = "follow"; S.tt.zv = 1; }   /* 2026-10-21: "Follow the test" became the default chart view */
	if (S.sys !== "si" && S.sys !== "us") { var lng = (navigator.language || "") + ""; S.sys = /^en-(US|LR)$|^my/i.test(lng) ? "us" : "si"; }
	if (!Array.isArray(S.ax.ord)) S.ax.ord = ["F", "A", "L", "E"]; S.ax.ord = S.ax.ord.filter(function (v, i, a) { return M.AX.indexOf(v) >= 0 && a.indexOf(v) === i; });
	if (S.mat !== "custom" && !M.mat(S.mat)) S.mat = "a36"; if (S.mat === "custom" && !S.cu) S.mat = "a36";
	var svT; function save() { clearTimeout(svT); svT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }, 200); }
	function toast(m) { var t = $("mt-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function copy(text, ok) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(ok); } catch (e) { toast("Copy this: " + text); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(ok); }, fb); else fb();
	}
	function U(d) { return DU[d][S.sys === "us" ? 1 : 0]; }
	function UO(d) { return DU[d][S.sys === "us" ? 0 : 1]; }
	function fmtIn(si, d, u, n) { if (si == null || !isFinite(si)) return "–"; if (!u && d === "modulus" && Math.abs(si) < 1e8 && si !== 0) u = S.sys === "us" ? "psi" : "MPa"; u = u || U(d); return M.pretty(M.fromSI(kindOf(d), si, u), n || 4) + (u === "mm/mm" ? "" : (u === "%" || u === "°" ? "" : " ") + u); }
	function fmt(si, d, n) { return fmtIn(si, d, null, n); }
	function fmtO(si, d) { return U(d) === UO(d) ? "" : "= " + fmtIn(si, d, UO(d)); }
	function strainTxt(e) { if (e == null || !isFinite(e)) return "–"; return M.pretty(e * 100, 4) + "%"; }
	function sym(html) { return String(html).replace(/([α-ωΑ-Ω]+)/g, "<span class='mt-sym'>$1</span>"); }
	/* subscripts: σx, τxy, τmax, εlat, εt, δT ... are written as plain text and turned into real subscripts here (HTML <sub>, SVG tspans) */
	var SUBRE = /([σετγδ])(xy|yz|zx|max|lat|x|y|z|t|p|T|b|u)(?![A-Za-zα-ω])/g;
	function subH(h) { return String(h).replace(SUBRE, "$1<sub>$2</sub>"); }
	function subS(h) {
		var re = new RegExp(SUBRE.source, "g"), out = "", last = 0, up = false, m;
		function seg(t) { if (!t) return ""; if (up) { up = false; return "<tspan dy='-0.225em'>" + t + "</tspan>"; } return t; }
		while ((m = re.exec(h))) { out += seg(h.slice(last, m.index) + m[1]) + "<tspan dy='0.3em' font-size='75%'>" + m[2] + "</tspan>"; up = true; last = re.lastIndex; }
		return out + seg(h.slice(last));
	}
	function tile(label, val, sub, cls) { return "<div class='tu-stat" + (cls ? " " + cls : "") + "'><div class='tu-stat__label'>" + sym(subH(label)) + "</div><div class='tu-stat__value'>" + val + "</div><div class='tu-stat__sub'>" + subH(sub || "") + "</div></div>"; }
	function tx(x, y, s, cls, anchor, extra) { return "<text x='" + r1(x) + "' y='" + r1(y) + "' class='" + (cls || "mt-t") + "'" + (anchor ? " text-anchor='" + anchor + "'" : "") + (extra || "") + ">" + subS(esc(s)) + "</text>"; }
	function svgPt(svg, ev) { var p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; var m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
	var MARK = "<marker id='@' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'><path d='M0,0 L10,5 L0,10 z' class='mt-dimar'/></marker>";
	function dimV(x, y1, y2, mk) { return "<line x1='" + r1(x) + "' y1='" + r1(y1) + "' x2='" + r1(x) + "' y2='" + r1(y2) + "' class='mt-dim' marker-start='url(#" + mk + ")' marker-end='url(#" + mk + ")'/>"; }
	function dimH(y, x1, x2, mk) { return "<line x1='" + r1(x1) + "' y1='" + r1(y) + "' x2='" + r1(x2) + "' y2='" + r1(y) + "' class='mt-dim' marker-start='url(#" + mk + ")' marker-end='url(#" + mk + ")'/>"; }
	function line(x1, y1, x2, y2, cls) { return "<line x1='" + r1(x1) + "' y1='" + r1(y1) + "' x2='" + r1(x2) + "' y2='" + r1(y2) + "' class='" + cls + "'/>"; }
	function exag(e, target) { var a = Math.abs(e); if (!(a > 0)) return 1; var k = (target || 0.16) / a; if (k <= 1) return 1; var p = Math.pow(10, Math.floor(Math.log10(k))), m = k / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; }
	function kTxt(k) { return k >= 1e4 ? M.pretty(k, 3) : String(k); }
	/* a label the reader can drag out of the way: id = "<svg id>:<name>", offsets in S.lab (saved), "Reset labels" in the figure's bar puts them back */
	if (!S.lab || typeof S.lab !== "object" || Array.isArray(S.lab)) S.lab = {};
	function lab(id, x, y, s, cls, anchor, extra) { var o = S.lab[id], t = o && (o[0] || o[1]) ? " transform='translate(" + r1(o[0]) + " " + r1(o[1]) + ")'" : ""; return "<g class='mt-lab' data-lab='" + id + "'" + t + "><title>Drag to move this label</title>" + tx(x, y, s, cls, anchor, extra) + "</g>"; }

	var LINKF = { axial: ["ax-F", "ax-L", "ax-d", "ax-D", "ax-t", "ax-b", "ax-h", "ax-B", "ax-H", "ax-A", "ax-dL", "ax-s", "ax-e", "ax-E"], shear: ["sh-V", "sh-d", "sh-A", "sh-hd", "sh-t", "sh-G"], torsion: ["to-T", "to-P", "to-n", "to-D", "to-di", "to-L", "to-G"],
		poisson: ["po-s", "po-e", "po-d", "po-L", "po-E", "po-nu", "p3-sx", "p3-sy", "p3-sz", "p3-txy", "p3-tyz", "p3-tzx", "p3-ex", "p3-ey", "p3-ez", "p3-gxy", "p3-gyz", "p3-gzx", "p3-E", "p3-nu", "ec-E", "ec-G", "ec-K", "ec-nu"], thermal: ["th-dT", "th-L", "th-g", "th-d", "th-a", "th-E"], tensile: [], table: [] };
	function pkey(id) { var p = id.split("-"); return (p[0] === "p3" ? "3" : p[0] === "ec" ? "c" : "") + p[1]; }
	var qtab = loadQuery();
	/* ---------- fields: label + input + unit select (+ clear) built from <div class="mt-f" data-f data-k data-d data-l> ---------- */
	var FL = {};
	[].forEach.call(root.querySelectorAll(".mt-f"), function (div) {
		var id = div.getAttribute("data-f"), d = div.getAttribute("data-d"), k = kindOf(d), lab = div.getAttribute("data-l"), x = div.hasAttribute("data-x"), sgn = div.hasAttribute("data-sg");
		div.className += " tu-field mt-q";
		div.innerHTML = "<label for='mt-" + id + "'>" + sym(subH(esc(lab))) + "</label><div class='mt-qin'><input id='mt-" + id + "' class='tu-input' type='text' inputmode='" + (sgn ? "text" : "decimal") + "' autocomplete='off' spellcheck='false'>" +
			(d === "ratio" ? "" : "<select class='tu-select mt-u' aria-label='Unit for " + esc(lab) + "'>" + M.UNITS[k].map(function (u) { return "<option>" + u[0] + "</option>"; }).join("") + "</select>") +
			(x ? "<button type='button' class='mt-x' title='Clear this box' aria-label='Clear " + esc(lab) + "'>×</button>" : "") + "</div><span class='mt-qs'></span>";
		var f = { id: id, d: d, k: k, div: div, inp: div.querySelector("input"), sel: div.querySelector("select"), st: div.querySelector(".mt-qs"), x: div.querySelector(".mt-x") };
		var su = S.f[id] && S.f[id].u; f.u = su && M.factor(k, su) > 0 ? su : DU[d][S.sys === "us" ? 1 : 0];
		if (f.sel) f.sel.value = f.u;
		var t = S.f[id] && S.f[id].t; if (t == null && MATF.indexOf(id) < 0) t = DEF[S.sys][id];
		if (t != null) { var q0 = M.parseQty(t, k); if (q0.unit && isFinite(q0.v) && f.sel) { f.u = q0.unit; f.sel.value = f.u; t = M.sig(q0.v, 6); } f.inp.value = t; S.f[id] = { t: t, u: f.u }; }
		FL[id] = f;
		f.inp.addEventListener("input", function () { setT(f, f.inp.value); onField(f); });
		f.inp.addEventListener("change", function () { var q = M.parseQty(f.inp.value, f.k); if (q.unit && f.sel && isFinite(q.v)) { f.sel.value = q.unit; f.u = q.unit; f.inp.value = M.sig(q.v, 6); setT(f, f.inp.value); onField(f); } });
		if (f.sel) f.sel.addEventListener("change", function () {
			var typed = !!(S.f[id] && S.f[id].t), si = exactSI(f);
			if (isFinite(si)) setExact(f, si, f.sel.value);
			f.u = f.sel.value; S.f[id] = { t: typed ? f.inp.value : (S.f[id] ? S.f[id].t : undefined), u: f.u }; save(); onField(f, true);
		});
		if (f.x) f.x.addEventListener("click", function () { f.inp.value = ""; setT(f, ""); onField(f); f.inp.focus(); });
	});
	function setT(f, t) { S.f[f.id] = { t: t, u: f.u }; save(); }
	function typed(id) { return !!(S.f[id] && S.f[id].t != null && String(S.f[id].t).trim() !== ""); }
	function fval(f) { if (typeof f === "string") f = FL[f]; return exactSI(f); }
	/* the exact SI value behind a box's text, so switching units back and forth never drifts by rounding */
	function exactSI(f) { if (f.ex && f.ex.t === f.inp.value) return f.ex.si; var q = M.parseQty(f.inp.value, f.k); return isFinite(q.v) ? M.toSI(f.k, q.v, q.unit || f.u) : NaN; }
	function setExact(f, si, unit) { f.inp.value = M.sig(M.fromSI(f.k, si, unit || f.u), 6); f.ex = { t: f.inp.value, si: si }; }
	function fshow(f, si) { if (typeof f === "string") f = FL[f]; if (document.activeElement === f.inp && f.div.getAttribute("data-s") === "typed") return; if (si != null && isFinite(si)) { f.inp.value = M.sig(M.fromSI(f.k, si, f.u), 5); f.ex = { t: f.inp.value, si: si }; } else f.inp.value = ""; }
	function stat(f, s, text) { if (typeof f === "string") f = FL[f]; f.div.setAttribute("data-s", s); f.st.textContent = text || ""; }
	function setField(id, v, unit) { var f = FL[id]; setExact(f, M.toSI(f.k, v, unit)); setT(f, f.inp.value); }
	function setFieldSI(id, si) { var f = FL[id]; setExact(f, si); setT(f, f.inp.value); }
	function setSys(sys) {
		if (sys === S.sys) return; S.sys = sys;
		Object.keys(FL).forEach(function (id) {
			var f = FL[id], nu = DU[f.d][sys === "us" ? 1 : 0]; if (!f.sel || nu === f.u) return;
			var si = exactSI(f); if (isFinite(si)) setExact(f, si, nu);
			f.u = nu; f.sel.value = nu; S.f[id] = { t: typed(id) ? f.inp.value : undefined, u: nu };
		});
		paintSeg("mt-sys", sys); save(); renderAll();
	}
	function paintSeg(id, v) { [].forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(v))); }); }
	function seg(id, get, set) { paintSeg(id, get()); $(id).addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; set(b.getAttribute("data-v")); paintSeg(id, get()); save(); }); }
	function chipRow(id, list, fn) { var el = $(id); if (!el) return; el.innerHTML = list.map(function (p, i) { return "<button type='button' class='tu-chip' data-i='" + i + "'>" + esc(p[0]) + "</button>"; }).join(""); el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { fn(list[+b.getAttribute("data-i")][1]); toast("Example: " + list[+b.getAttribute("data-i")][0]); } }); }

	/* ---------- material ---------- */
	var matSel = $("mt-mat");
	matSel.innerHTML = M.FAMS.map(function (fm) { var ms = M.MATS.filter(function (m) { return m.fam === fm[0]; }); return ms.length ? "<optgroup label='" + esc(fm[1]) + "'>" + ms.map(function (m) { return "<option value='" + m.id + "'>" + esc(m.name) + "</option>"; }).join("") + "</optgroup>" : ""; }).join("") + "<option value='custom'>Your own material…</option>";
	/* searchable picker over a <select> (with optgroups): the select stays the source of truth and fires its own change event */
	function searchSel(sel) {
		var wrap = document.createElement("div"), lab = root.querySelector("label[for='" + sel.id + "']"), act = -1, items = [];
		wrap.className = "mt-ss"; sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); sel.className += " mt-ss__sel"; sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
		wrap.insertAdjacentHTML("beforeend", "<button type='button' class='tu-select mt-ss__btn' id='" + sel.id + "-b' aria-haspopup='listbox' aria-expanded='false'></button><div class='mt-ss__pop' hidden><input type='search' class='tu-input mt-ss__q' placeholder='Search: steel, 2014, plastic…' autocomplete='off' spellcheck='false' aria-label='Search the list'><ul class='mt-ss__list' role='listbox'></ul></div>");
		var btn = wrap.querySelector(".mt-ss__btn"), pop = wrap.querySelector(".mt-ss__pop"), q = wrap.querySelector(".mt-ss__q"), ul = wrap.querySelector(".mt-ss__list");
		if (lab) lab.htmlFor = btn.id;
		function sync() { var o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.text : ""; }
		function norm(t) { return t.toLowerCase().replace(/aluminum/g, "aluminium"); }
		function list() {
			var words = norm(q.value).trim().split(/\s+/).filter(Boolean), h = [], n = 0; items = [];
			[].forEach.call(sel.children, function (g) {
				var opts = g.tagName === "OPTGROUP" ? [].slice.call(g.children) : [g], gl = g.tagName === "OPTGROUP" ? g.label : "";
				var hit = opts.filter(function (o) { var t = norm(o.text + " " + gl); return words.every(function (w) { return t.indexOf(w) >= 0; }); });
				if (!hit.length) return; if (gl) h.push("<li class='mt-ss__g' role='presentation'>" + esc(gl) + "</li>");
				hit.forEach(function (o) { items.push(o.value); h.push("<li role='option' class='mt-ss__o' data-i='" + n + "' aria-selected='" + (o.value === sel.value) + "'>" + esc(o.text) + "</li>"); n++; });
			});
			ul.innerHTML = h.join("") || "<li class='mt-ss__g'>Nothing matches.</li>";
			act = Math.max(0, items.indexOf(sel.value)); if (words.length) act = 0; hl();
		}
		function hl() { [].forEach.call(ul.querySelectorAll(".mt-ss__o"), function (li) { var on = +li.getAttribute("data-i") === act; li.classList.toggle("mt-ss__o--act", on); if (on) li.scrollIntoView({ block: "nearest" }); }); }
		function open() { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); q.value = ""; list(); q.focus(); }
		function close(back) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); if (back) btn.focus(); }
		function pick(i) { if (items[i] == null) return; close(true); if (sel.value !== items[i]) { sel.value = items[i]; sel.dispatchEvent(new Event("change")); } sync(); }
		btn.addEventListener("click", function () { if (pop.hidden) open(); else close(); });
		btn.addEventListener("keydown", function (e) { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); } });
		q.addEventListener("input", list);
		q.addEventListener("keydown", function (e) {
			if (e.key === "ArrowDown") { e.preventDefault(); act = Math.min(items.length - 1, act + 1); hl(); } else if (e.key === "ArrowUp") { e.preventDefault(); act = Math.max(0, act - 1); hl(); }
			else if (e.key === "Enter") { e.preventDefault(); pick(act); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); } else if (e.key === "Tab") close();
		});
		ul.addEventListener("mousedown", function (e) { e.preventDefault(); });
		ul.addEventListener("click", function (e) { var li = e.target.closest(".mt-ss__o"); if (li) pick(+li.getAttribute("data-i")); });
		document.addEventListener("pointerdown", function (e) { if (!pop.hidden && !wrap.contains(e.target)) close(); });
		sel._ssSync = sync; sync();
	}
	function ssSync() { ["mt-mat", "mt-tt-c2", "mt-tt-c3"].forEach(function (id) { var el = $(id); if (el && el._ssSync) el._ssSync(); }); }
	function matRec() { return S.mat === "custom" && S.cu ? S.cu : (M.mat(S.mat) || M.MATS[0]); }
	function mv() { var m = matRec(); return { E: m.E * 1e9, G: m.G * 1e9, nu: m.nu, sy: m.sy ? m.sy * 1e6 : null, su: m.su * 1e6, sc: m.sc ? m.sc * 1e6 : null, a: m.a != null ? m.a * 1e-6 : null, rho: m.rho, name: m.name, short: m.id === "custom" ? "your material" : m.name, m: m }; }
	function custFrom(m) { return { id: "custom", name: "Your material", fam: m.fam === "elastomer" || m.fam === "polymer" ? m.fam : "metal", E: m.E, G: m.G, nu: m.nu, sy: m.sy, su: m.su, el: m.el != null ? m.el : (m.su / m.E / 10), ra: m.ra, rho: m.rho, a: m.a, c: m.c, x: m.x ? JSON.parse(JSON.stringify(m.x)) : null }; }
	function setMat(id, quiet) {
		if (id === "custom" && !S.cu) S.cu = custFrom(matRec());
		if (id === "custom") custFill();
		S.mat = id; matSel.value = id;
		MATF.forEach(function (fid) { if (FL[fid]) { S.f[fid] = { t: "", u: FL[fid].u }; FL[fid].inp.value = ""; } });
		S.ax.ord = ["E"].concat(S.ax.ord.filter(function (v) { return v !== "E"; }));
		TT.unl = []; TT.p = 0; TT.play = false; TT.c = null;
		$("mt-custom").hidden = id !== "custom";
		save(); matNote(); if (!quiet) renderAll();
	}
	function matNote() {
		ssSync();
		var m = matRec(), sy = m.sy ? fmt(m.sy * 1e6, "stress") : "none (brittle)", parts = ["E " + fmt(m.E * 1e9, "modulus"), "yield " + sy, "tensile strength " + fmt(m.su * 1e6, "stress"), "ν " + M.sig(m.nu, 3)];
		$("mt-matnote").innerHTML = "<strong>" + esc(m.name) + ":</strong> " + esc(parts.join(" · ")) + ". Typical values." + (m.note ? " " + esc(m.note) : "");
	}
	matSel.addEventListener("change", function () { setMat(matSel.value); });
	/* own material */
	var CUMSG = "", CUDEF = "Your material is used in every tool on this page. Yield is not used for brittle materials or rubber.";
	var CU = [["cu-E", "E", 1e9], ["cu-nu", "nu", 1], ["cu-sy", "sy", 1e6], ["cu-su", "su", 1e6], ["cu-el", "el", 0.01], ["cu-ra", "ra", 0.01], ["cu-rho", "rho", 1], ["cu-a", "a", 1e-6]];
	function custFill() { var c = S.cu; CU.forEach(function (p) { var v = c[p[1]]; if (v == null) { FL[p[0]].inp.value = ""; } else fshow(FL[p[0]], v * p[2]); stat(FL[p[0]], "", ""); }); $("mt-cu-c").value = c.c; }
	function custRead() {
		var c = S.cu, msg = [];
		CU.forEach(function (p) { var v = fval(FL[p[0]]); c[p[1]] = isFinite(v) ? v / p[2] : (p[1] === "sy" || p[1] === "ra" || p[1] === "a" ? null : c[p[1]]); });
		c.c = $("mt-cu-c").value;
		if (!(c.E > 0)) { c.E = 200; msg.push("E must be above zero."); } if (!(c.su > 0)) { c.su = 400; msg.push("The tensile strength must be above zero."); }
		if (!(c.nu > -1 && c.nu < 0.5)) { c.nu = 0.3; msg.push("Poisson's ratio must be between −1 and 0.5."); }
		if ((c.c === "duct" || c.c === "luders" || c.c === "polymer") && !(c.sy > 0 && c.sy < c.su)) msg.push("For a ductile material the yield strength must be below the tensile strength (otherwise it is treated as brittle).");
		if (!(c.el > 0)) c.el = c.su / c.E / 10;
		c.G = c.E / (2 * (1 + c.nu));
		if (c.c === "polymer" && c.sy == null) c.sy = c.su;
		c.fam = c.c === "rubber" ? "elastomer" : c.c === "polymer" ? "polymer" : "metal";
		CUMSG = msg.join(" "); $("mt-cu-msg").textContent = CUMSG || CUDEF;
	}
	$("mt-cu-c").addEventListener("change", function () { custRead(); save(); TT.c = null; renderAll(); });

	/* ---------- tabs ---------- */
	var tabBtns = [].slice.call(root.querySelectorAll(".mt-tabs [data-tab]")), panels = [].slice.call(root.querySelectorAll("[data-panel]")), CUR = VIEWS[0];
	tabBtns.forEach(function (b) { var t = b.getAttribute("data-tab"); if (VIEWS.indexOf(t) < 0) b.hidden = true; b.addEventListener("click", function () { showTab(t, true); }); });
	root.querySelector(".mt-tabs").addEventListener("keydown", function (e) { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; var i = VIEWS.indexOf(CUR) + (e.key === "ArrowRight" ? 1 : -1); i = (i + VIEWS.length) % VIEWS.length; showTab(VIEWS[i], true); var b = root.querySelector(".mt-tabs [data-tab='" + VIEWS[i] + "']"); if (b) b.focus(); });
	if (VIEWS.length < 2) root.querySelector(".mt-tabs").hidden = true;
	function showTab(t, user) {
		if (VIEWS.indexOf(t) < 0) t = VIEWS[0]; CUR = t; S.tabs[PAGE] = t; save();
		tabBtns.forEach(function (b) { var on = b.getAttribute("data-tab") === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
		panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
		if (user && VIEWS.length > 1) try { history.replaceState(null, "", location.pathname + (t === VIEWS[0] ? "" : "?tab=" + t)); } catch (e) { /* ignore */ }
		if (t !== "tensile") TT.play = false;
		renderTab(t);
	}
	function renderTab(t) { ({ axial: axCompute, tensile: ttShow, shear: shCompute, torsion: toCompute, poisson: poCompute, thermal: thCompute, table: tbRender })[t](); }
	function renderAll() { matNote(); renderTab(CUR); }
	function onField(f, unitOnly) {
		var p = f.id.split("-")[0];
		if (p === "ax") axInput(f, unitOnly); else if (p === "sh") shCompute(); else if (p === "to") toCompute(); else if (p === "po" || p === "p3" || p === "ec") poCompute(); else if (p === "th") thCompute();
		else if (p === "cu") { custRead(); save(); TT.c = null; matNote(); renderTab(CUR); }
	}

	/* =========================== 1. AXIAL =========================== */
	var AXV = { F: "ax-F", L: "ax-L", dL: "ax-dL", s: "ax-s", e: "ax-e", E: "ax-E", A: "ax-A" }, DIMS = [["d", "ax-d"], ["D", "ax-D"], ["t", "ax-t"], ["b", "ax-b"], ["h", "ax-h"], ["B", "ax-B"], ["H", "ax-H"]];
	var NAMES = { F: "the force", A: "the cross-section", L: "the length", dL: "the change in length", s: "the stress", e: "the strain", E: "Young's modulus" };
	var AX = { r: null, giv: [], sec: null }, AXD = { k: 1, lock: false, drag: false, Fmax: 0, FmaxNow: 0, a0: 26, aMax: 118, g: null };
	var shapeSel = $("mt-ax-shape"); shapeSel.innerHTML = M.SHAPES.map(function (o) { return "<option value='" + o[0] + "'>" + o[1] + "</option>"; }).join("");
	if (!M.SHAPES.some(function (o) { return o[0] === S.ax.shape; })) S.ax.shape = "round"; shapeSel.value = S.ax.shape;
	shapeSel.addEventListener("change", function () { S.ax.shape = shapeSel.value; bump("A"); axShapeFields(); save(); axCompute(); });
	function axShapeFields() { DIMS.forEach(function (p) { var f = FL[p[1]]; f.div.hidden = f.div.getAttribute("data-sh").split(" ").indexOf(S.ax.shape) < 0; }); }
	function bump(v) { S.ax.ord = [v].concat(S.ax.ord.filter(function (x) { return x !== v; })); save(); }
	function unbump(v) { S.ax.ord = S.ax.ord.filter(function (x) { return x !== v; }); save(); }
	seg("mt-ax-dir", function () { return S.ax.dir; }, function (v) { S.ax.dir = v; axCompute(); });
	function axInput(f, unitOnly) {
		if (unitOnly) { axCompute(); return; }
		var v = null, id = f.id, empty = f.inp.value.trim() === ""; for (var k in AXV) if (AXV[k] === id) v = k;
		if (DIMS.some(function (p) { return p[1] === id; })) bump("A");
		else if (v === "A") { if (S.ax.shape !== "area") { S.ax.shape = "area"; shapeSel.value = "area"; axShapeFields(); } if (empty) unbump("A"); else bump("A"); }
		else if (v === "E") bump("E");
		else if (v) { if (empty) unbump(v); else bump(v); }
		axCompute();
	}
	function axDims() { var d = {}; DIMS.forEach(function (p) { d[p[0]] = fval(FL[p[1]]); }); d.A = fval(FL["ax-A"]); return d; }
	function axValues() {
		var sg = S.ax.dir === "c" ? -1 : 1, dims = axDims(), sh = S.ax.shape, m = mv();
		var sec = sh === "area" ? { A: dims.A, I: NaN, err: dims.A > 0 ? "" : "Type the cross-section area." } : M.section(sh, dims);
		var Et = typed("ax-E") ? fval(FL["ax-E"]) : NaN;
		return { sg: sg, dims: dims, sec: sec, Et: Et, m: m, val: { F: sg * Math.abs(fval(FL["ax-F"])), A: sec.A > 0 ? sec.A : NaN, L: fval(FL["ax-L"]), dL: sg * Math.abs(fval(FL["ax-dL"])), s: sg * Math.abs(fval(FL["ax-s"])), e: sg * Math.abs(fval(FL["ax-e"])), E: isFinite(Et) ? Et : m.E } };
	}
	function axSolveWith(F) { var x = axValues(), giv = S.ax.ord.filter(function (v) { return v !== "F" && isFinite(x.val[v]); }).map(function (v) { return [v, x.val[v]]; }); return M.axialSolve([["F", x.sg * F]].concat(giv)); }
	function axState(sig, m, comp) { if (!isFinite(sig)) return "el"; var a = Math.abs(sig); if (comp && !m.sy) return m.sc && a >= m.sc ? "break" : "el"; if (a >= (comp && m.sc && !m.sy ? m.sc : m.su)) return comp ? "yield" : "break"; if (m.sy && a > m.sy) return "yield"; return "el"; }
	function axCompute() {
		var x = axValues(), m = x.m, val = x.val, sh = S.ax.shape, comp = x.sg < 0;
		var giv = S.ax.ord.filter(function (v) { return isFinite(val[v]); }).map(function (v) { return [v, val[v]]; });
		var r = M.axialSolve(giv); AX.r = r; AX.sec = x.sec; AX.x = x;
		["F", "L", "dL", "s", "e", "E"].forEach(function (v) {
			var f = FL[AXV[v]], used = r.used.indexOf(v) >= 0, has = r.v[v] != null;
			if (used) { if (v === "E" && !isFinite(x.Et)) { fshow(f, m.E); stat(f, "mat", "from " + m.short); } else stat(f, "typed", ""); }
			else if (has) { fshow(f, v === "E" || v === "L" ? r.v[v] : Math.abs(r.v[v])); stat(f, "calc", "worked out"); if (typed(f.id)) setT(f, f.inp.value); }
			else { var txt = f.inp.value.trim(); if (txt !== "" && S.ax.ord.indexOf(v) >= 0 && !isFinite(val[v])) stat(f, "bad", "not a number"); else { if (document.activeElement !== f.inp) f.inp.value = ""; stat(f, "miss", r.oneMore.indexOf(v) >= 0 ? (r.oneMore.length > 1 ? "type this or " + r.oneMore.filter(function (o) { return o !== v; }).map(function (o) { return NAMES[o]; }).join(" or ") : "needed") : ""); } }
		});
		/* area + the shape's sizes */
		var fA = FL["ax-A"], usedA = r.used.indexOf("A") >= 0, hasA = r.v.A != null;
		DIMS.forEach(function (p) { if (FL[p[1]].div.getAttribute("data-s") === "calc") stat(FL[p[1]], "", ""); });
		if (sh === "area") { if (usedA) stat(fA, "typed", ""); else if (hasA) { fshow(fA, r.v.A); stat(fA, "calc", "worked out"); if (typed("ax-A")) setT(fA, fA.inp.value); } else stat(fA, "miss", ""); }
		else {
			if (usedA) { fshow(fA, x.sec.A); stat(fA, "shape", "from the shape"); }
			else if (hasA) {
				fshow(fA, r.v.A); stat(fA, "calc", "worked out");
				var nd = M.sizeFor(sh, x.dims, r.v.A), main = { round: ["d"], tube: ["D"], rect: ["h"], rtube: ["B", "H"] }[sh] || [];
				if (nd) main.forEach(function (key) { var fid = "ax-" + key; if (document.activeElement !== FL[fid].inp) setExact(FL[fid], nd[key]); setT(FL[fid], FL[fid].inp.value); stat(FL[fid], "calc", "size needed"); });
				x.dims = axDims();
			} else { fA.inp.value = isFinite(x.sec.A) ? M.sig(M.fromSI("area", x.sec.A, fA.u), 5) : ""; stat(fA, "miss", ""); }
		}
		/* message */
		var msg = "";
		if (r.err) msg = r.err;
		else if (x.sec.err && !hasA && S.ax.ord.indexOf("A") >= 0) msg = x.sec.err;
		else if (r.missing.length) { msg = r.oneMore.length ? "Type one more: " + r.oneMore.map(function (v) { return NAMES[v]; }).join(" or ") + "." : "Type " + (4 - r.used.length > 1 ? (4 - r.used.length) + " more values" : "one more value") + " from: " + r.missing.map(function (v) { return NAMES[v]; }).join(", ") + "."; }
		else if (r.dropped.length) msg = "Worked out again from your newer numbers: " + r.dropped.map(function (v) { return NAMES[v]; }).join(", ") + ".";
		if (x.sec.note) msg += (msg ? " " : "") + x.sec.note;
		$("mt-ax-msg").textContent = msg; $("mt-ax-msg").className = "mt-msg" + (r.err ? " mt-msg--err" : "");
		/* tiles */
		var v = r.v, sig = v.s, st = axState(sig, m, comp), h = [];
		var dirw = comp ? "compression" : "tension";
		h.push(tile("Stress σ", isFinite(sig) ? fmt(Math.abs(sig), "stress") : "–", isFinite(sig) ? dirw + " " + fmtO(Math.abs(sig), "stress") : "", "tu-stat--hero"));
		h.push(tile("Strain ε", v.e != null ? M.pretty(Math.abs(v.e), 4) : "–", v.e != null ? strainTxt(Math.abs(v.e)) + " · " + M.pretty(Math.abs(v.e) * 1e6, 4) + " µε" : ""));
		h.push(tile("Change in length ΔL", v.dL != null ? fmt(Math.abs(v.dL), "small") : "–", v.dL != null ? (st === "el" ? (comp ? "shorter" : "longer") + " " + fmtO(Math.abs(v.dL), "small") : "the elastic part only: past yield it " + (comp ? "squashes" : "stretches") + " much more") : ""));
		var esub = ""; if (v.E != null) { if (r.used.indexOf("E") < 0) { esub = m.short + " is typically " + fmt(m.E, "modulus"); var best = null; M.MATS.forEach(function (q) { var d = Math.abs(Math.log(q.E * 1e9 / v.E)); if (!best || d < best.d) best = { d: d, m: q }; }); if (best && Math.abs(Math.log(m.E / v.E)) > 0.15 && best.d < 0.15) esub += "; closest in the table: " + esc(best.m.name) + " (" + fmt(best.m.E * 1e9, "modulus") + ")"; } else if (isFinite(x.Et)) esub = "you typed it; " + m.short + " ≈ " + fmt(m.E, "modulus"); else esub = "from " + m.short; }
		h.push(tile("Young's modulus E", v.E != null ? fmt(v.E, "modulus") : "–", esub));
		var str = comp && !m.sy ? (m.sc || m.su) : (m.sy || m.su), sf = isFinite(sig) && sig !== 0 ? str / Math.abs(sig) : NaN;
		var sfSub = (m.sy ? "against yield (" + fmt(m.sy, "stress") + ")" : comp && m.sc ? "against crushing (" + fmt(m.sc, "stress") + ")" : "against breaking (" + fmt(m.su, "stress") + ")") + " of " + m.short;
		h.push(tile("Safety factor", isFinite(sf) ? M.pretty(sf, 3) : "–", sfSub, isFinite(sf) && sf < 1 ? "mt-bad" : isFinite(sf) && sf < 1.5 ? "mt-warn" : ""));
		if (v.A != null) h.push(tile(m.sy ? "Force to start yielding" : "Force to break it", fmt(str * v.A, "force"), "= strength × A " + fmtO(str * v.A, "force")));
		var Ipc = sh !== "area" && x.sec.I > 0 && r.used.indexOf("A") >= 0 ? x.sec.I : NaN, pcr = NaN;
		if (comp && isFinite(Ipc) && v.L != null && v.E != null) { pcr = M.euler(v.E, Ipc, v.L); h.push(tile("Buckling load (pinned ends)", fmt(pcr, "force"), v.F != null ? (Math.abs(v.F) > pcr ? "<strong>it buckles first:</strong> your load is " + M.pretty(Math.abs(v.F) / pcr * 100, 3) + "% of it" : "your load is " + M.pretty(Math.abs(v.F) / pcr * 100, 3) + "% of it") : "", v.F != null && Math.abs(v.F) > pcr ? "mt-bad" : "")); }
		$("mt-ax-stats").innerHTML = h.join("");
		/* caption */
		var cap = "";
		if (!isFinite(sig)) cap = "Type enough values to see the bar stretch.";
		else if (st === "break") cap = comp && !m.sy ? "Above the crushing strength of " + m.short + ": it fails." : "Above the tensile strength of " + m.short + " (" + fmt(m.su, "stress") + "): the bar breaks. Hooke's law does not apply any more.";
		else if (st === "yield") cap = "Past the yield strength (" + fmt(m.sy || m.su, "stress") + "): the bar would stay " + (comp ? "shorter" : "longer") + " when the load is taken off, and ΔL = FL/(AE) gives only the springy (elastic) part." + (comp ? "" : " Watch it in the tensile test.");
		else cap = "Elastic: take the force away and the bar springs back to its original length." + (comp ? " A long thin bar in compression can buckle sideways long before the stress gets high: see the buckling load." : "");
		if (comp && isFinite(pcr) && v.F != null && Math.abs(v.F) > pcr && st !== "break") cap = "It buckles: the push (" + fmt(Math.abs(v.F), "force") + ") is more than the buckling load of this bar with pinned ends (" + fmt(pcr, "force") + "), so it bows out sideways" + (st === "el" ? " even though the stress is below yield" : "") + ". Use a thicker section or a shorter bar.";
		$("mt-ax-cap").textContent = cap;
		/* formula lines */
		function q(si, d) { return fmt(si, d); }
		$("mt-ax-v1").textContent = v.s != null && v.F != null && v.A != null ? "= " + q(Math.abs(v.F), "force") + " ÷ " + q(v.A, "area") + " = " + q(Math.abs(v.s), "stress") : "";
		$("mt-ax-v2").textContent = v.e != null && v.dL != null && v.L != null ? "= " + q(Math.abs(v.dL), "small") + " ÷ " + q(v.L, "len") + " = " + M.pretty(Math.abs(v.e), 4) : "";
		$("mt-ax-v3").textContent = v.E != null && v.s != null && v.e != null ? "= " + q(Math.abs(v.s), "stress") + " ÷ " + M.pretty(Math.abs(v.e), 4) + " = " + q(v.E, "modulus") : "";
		$("mt-ax-v4").textContent = v.dL != null && v.F != null && v.L != null && v.A != null && v.E != null ? "= " + q(Math.abs(v.F), "force") + " × " + q(v.L, "len") + " ÷ (" + q(v.A, "area") + " × " + q(v.E, "modulus") + ") = " + q(Math.abs(v.dL), "small") : "";
		x.buckle = comp && isFinite(pcr) && v.F != null && Math.abs(v.F) > pcr; drawAxial(r, x, st);
		var Fm = AXD.lock ? AXD.Fmax : axFmax(v, m); AXD.FmaxNow = Fm;
		var sl = $("mt-ax-fs"); if (!AXD.lock && Fm > 0 && v.F != null) sl.value = String(Math.round(clamp(Math.abs(v.F) / Fm, 0, 1) * 1000));
		$("mt-ax-fsv").textContent = v.F != null ? fmt(Math.abs(v.F), "force") : "–";
	}
	function axFmax(v, m) { var str = m.sy || m.su; if (v.A > 0 && str) return 1.6 * str * v.A; if (v.F != null && v.F !== 0) return 2 * Math.abs(v.F); return 1e4; }
	function drawAxial(r, x, st) {
		var svg = $("mt-ax-svg"), v = r.v, m = x.m, sg = x.sg, e = v.e != null ? v.e : 0;
		if (!AXD.lock) AXD.k = exag(e);
		var k = AXD.k, de = clamp(e * k, -0.3, 0.35), x0 = 170, y0 = 64, Ld = 260, rw = 40;
		var Ls = Ld * (1 + de), yE = y0 + Ls, ws = rw * clamp(1 - m.nu * de, 0.5, 1.6), yb = yE + 10;
		var Fm = AXD.lock ? AXD.Fmax : axFmax(v, m), Fa = v.F != null ? Math.abs(v.F) : NaN;
		var aLen = isFinite(Fa) && Fm > 0 ? AXD.a0 + (AXD.aMax - AXD.a0) * clamp(Fa / Fm, 0, 1) : AXD.a0;
		AXD.g = { y0: y0, Ld: Ld };
		var h = ["<title>A rod hanging from a fixed support, stretched by a force at its end</title><defs>" + MARK.replace("@", "mt-ax-mk") + "<linearGradient id='mt-ax-gr' x1='0' x2='1'><stop offset='0' class='mt-g1'/><stop offset='0.42' class='mt-g2'/><stop offset='1' class='mt-g3'/></linearGradient></defs>"];
		h.push("<rect x='" + (x0 - 120) + "' y='" + (y0 - 20) + "' width='240' height='20' class='mt-sup'/>");
		for (var i = 0; i < 13; i++) h.push(line(x0 - 116 + i * 19, y0 - 20, x0 - 130 + i * 19, y0 - 36, "mt-hatch"));
		h.push(lab("mt-ax-svg:n1", x0, y0 - 42, "fixed support", "mt-t mt-ts", "middle"));
		if (Math.abs(de) > 0.004) h.push("<rect x='" + r1(x0 - rw / 2) + "' y='" + y0 + "' width='" + rw + "' height='" + Ld + "' class='mt-ghost'/>");
		h.push("<rect x='" + r1(x0 - ws / 2) + "' y='" + y0 + "' width='" + r1(ws) + "' height='" + r1(Ls) + "' rx='2' class='mt-rod mt-rod--" + st + "' fill='url(#mt-ax-gr)'/>");
		if (x.buckle) { var bow = 46; h.push("<path d='M" + (x0 - ws / 2) + "," + y0 + " Q" + r1(x0 - ws / 2 + 2 * bow) + "," + r1(y0 + Ls / 2) + " " + (x0 - ws / 2) + "," + r1(yE) + " M" + (x0 + ws / 2) + "," + y0 + " Q" + r1(x0 + ws / 2 + 2 * bow) + "," + r1(y0 + Ls / 2) + " " + (x0 + ws / 2) + "," + r1(yE) + "' class='mt-buckle'/>", lab("mt-ax-svg:n2", x0 + ws / 2 + bow + 10, y0 + Ls * 0.62, "buckles", "mt-t mt-b mt-red", "start")); }
		if (st === "break") { var yc = y0 + Ls * 0.55; h.push("<polyline points='" + [[x0 - ws / 2 - 4, yc], [x0 - 8, yc - 7], [x0, yc + 4], [x0 + 8, yc - 6], [x0 + ws / 2 + 4, yc + 2]].map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" ") + "' class='mt-crack'/>"); }
		h.push("<rect x='" + r1(x0 - ws / 2 - 8) + "' y='" + r1(yE) + "' width='" + r1(ws + 16) + "' height='10' rx='2' class='mt-endp'/>");
		/* force arrow (drag it) */
		function arrowV(cx, y1, y2) { var d = y2 > y1 ? 1 : -1, hl = Math.min(22, Math.abs(y2 - y1) * 0.6), yh = y2 - d * hl; return "M" + (cx - 4) + "," + r1(y1) + " L" + (cx + 4) + "," + r1(y1) + " L" + (cx + 4) + "," + r1(yh) + " L" + (cx + 13) + "," + r1(yh) + " L" + cx + "," + r1(y2) + " L" + (cx - 13) + "," + r1(yh) + " L" + (cx - 4) + "," + r1(yh) + " Z"; }
		var ap = sg > 0 ? arrowV(x0, yb, yb + aLen) : arrowV(x0, yb + aLen, yb);
		h.push("<g class='mt-drag' data-drag='F' tabindex='-1'><path d='" + ap + "' class='mt-farrow'/><circle cx='" + x0 + "' cy='" + r1(yb + aLen) + "' r='14' class='mt-handle'/><path d='M" + (x0 - 5) + "," + r1(yb + aLen - 4) + " l5,-6 l5,6 M" + (x0 - 5) + "," + r1(yb + aLen + 4) + " l5,6 l5,-6' class='mt-hgrip'/></g>");
		var fl = "F = " + (isFinite(Fa) ? fmt(Fa, "force") : "?"); if (yb + aLen + 42 < 512) h.push(lab("mt-ax-svg:n3", x0, yb + aLen + 40, fl, "mt-t mt-tf mt-b", "middle")); else h.push(lab("mt-ax-svg:n4", x0 - 24, yb + aLen - 4, fl, "mt-t mt-tf mt-b", "end"));
		/* L and ΔL */
		var xL = x0 - rw / 2 - 46;
		h.push(line(xL - 8, y0, x0 - rw / 2 - 4, y0, "mt-ext"), line(xL - 8, y0 + Ld, x0 - Math.max(rw, ws) / 2 - 4, y0 + Ld, "mt-ext"), dimV(xL, y0, y0 + Ld, "mt-ax-mk"));
		h.push(lab("mt-ax-svg:n5", xL - 10, y0 + Ld / 2 - 6, "L", "mt-t mt-b", "end"), lab("mt-ax-svg:n6", xL - 10, y0 + Ld / 2 + 16, v.L != null ? fmt(v.L, "len") : "?", "mt-t", "end"));
		var xD = x0 + rw / 2 + 52;
		h.push(line(x0 + Math.max(ws, rw) / 2 + 2, y0 + Ld, xD + 10, y0 + Ld, "mt-dash"));
		if (Math.abs(yE - (y0 + Ld)) > 3) h.push(line(x0 + ws / 2 + 10, yE, xD + 10, yE, "mt-ext"), dimV(xD, y0 + Ld, yE, "mt-ax-mk"));
		var gapY = Math.abs(yE - (y0 + Ld)), ly = gapY > 46 ? (y0 + Ld + yE) / 2 - 6 : sg > 0 ? yE + 26 : y0 + Ld + 46;
		h.push(lab("mt-ax-svg:n7", xD + 14, ly, "ΔL", "mt-t mt-b", "start"), lab("mt-ax-svg:n8", xD + 14, ly + 21, v.dL != null ? (comp(sg) + fmt(Math.abs(v.dL), "small")) : "?", "mt-t", "start"));
		h.push(lab("mt-ax-svg:n9", xD + 14, y0 + Ld + (sg > 0 ? -8 : 20), "original end", "mt-t mt-ts", "start"));
		/* cross-section callout */
		var cx = 420, cy = 150, R = 70;
		h.push(line(x0 + ws / 2 + 2, cy, cx - R, cy, "mt-dash"), "<circle cx='" + cx + "' cy='" + cy + "' r='" + R + "' class='mt-callc'/>");
		h.push(secShape(S.ax.shape, x.dims, cx, cy));
		h.push(lab("mt-ax-svg:n10", cx, cy - R - 12, "Cross-section", "mt-t mt-b", "middle"), lab("mt-ax-svg:n11", cx, cy + R + 24, "A = " + (v.A != null ? fmt(v.A, "area") : "?"), "mt-t mt-b", "middle"));
		var dimTxt = secDimTxt(S.ax.shape, x.dims, r); if (dimTxt) h.push(lab("mt-ax-svg:n12", cx, cy + R + 46, dimTxt, "mt-t mt-ts", "middle"));
		h.push(lab("mt-ax-svg:n13", 512, 532, k > 1 ? (sg > 0 ? "Stretch" : "Shortening") + " drawn " + kTxt(k) + "× larger than real" : "Drawn to true scale", "mt-t mt-ts", "end"));
		if (k > 1) h.push(lab("mt-ax-svg:n14", 512, 554, "(the width changes too: Poisson's ratio)", "mt-t mt-ts", "end"));
		svg.innerHTML = h.join("");
		function comp(s) { return s < 0 ? "−" : "+"; }
	}
	function secShape(sh, d, cx, cy) {
		if (sh === "round") return "<circle cx='" + cx + "' cy='" + cy + "' r='44' class='mt-secf'/>";
		if (sh === "tube") { var ri = d.D > 0 && d.t > 0 ? 48 * Math.max(0, d.D - 2 * d.t) / d.D : 34; return "<circle cx='" + cx + "' cy='" + cy + "' r='48' class='mt-secf'/>" + (ri > 0 ? "<circle cx='" + cx + "' cy='" + cy + "' r='" + r1(ri) + "' class='mt-hole'/>" : ""); }
		if (sh === "rect" || sh === "rtube") {
			var b = sh === "rect" ? d.b : d.B, hh = sh === "rect" ? d.h : d.H; if (!(b > 0 && hh > 0)) { b = 2; hh = 1; }
			var W = b >= hh ? 90 : 90 * b / hh, H = b >= hh ? 90 * hh / b : 90; W = Math.max(W, 8); H = Math.max(H, 8);
			var s = "<rect x='" + r1(cx - W / 2) + "' y='" + r1(cy - H / 2) + "' width='" + r1(W) + "' height='" + r1(H) + "' class='mt-secf'/>";
			if (sh === "rtube" && d.t > 0) { var tw = Math.max(2, d.t / b * W); if (2 * tw < Math.min(W, H)) s += "<rect x='" + r1(cx - W / 2 + tw) + "' y='" + r1(cy - H / 2 + tw) + "' width='" + r1(W - 2 * tw) + "' height='" + r1(H - 2 * tw) + "' class='mt-hole'/>"; }
			return s;
		}
		return "<rect x='" + (cx - 42) + "' y='" + (cy - 42) + "' width='84' height='84' rx='14' class='mt-secf'/>" + tx(cx, cy + 9, "A", "mt-t mt-b mt-tbig", "middle");
	}
	function secDimTxt(sh, d) {
		function f(x) { return fmt(x, "small"); }
		if (sh === "round" && d.d > 0) return "diameter d = " + f(d.d);
		if (sh === "tube" && d.D > 0 && d.t > 0) return "D = " + f(d.D) + ", wall t = " + f(d.t);
		if (sh === "rect" && d.b > 0 && d.h > 0) return "b × h = " + f(d.b) + " × " + f(d.h);
		if (sh === "rtube" && d.B > 0 && d.H > 0) return f(d.B) + " × " + f(d.H) + ", wall " + f(d.t);
		return "";
	}
	(function () {
		var svg = $("mt-ax-svg");
		function to(ev) {
			var p = svgPt(svg, ev), g = AXD.g; if (!g) return;
			function tip(F) { var r = axSolveWith(F), e = r.v.e != null ? r.v.e : 0, de = clamp(e * AXD.k, -0.3, 0.35); return g.y0 + g.Ld * (1 + de) + 10 + AXD.a0 + (AXD.aMax - AXD.a0) * F / AXD.Fmax; }
			var lo = 0, hi = AXD.Fmax; if (tip(lo) >= p.y) { setForce(0); return; } if (tip(hi) <= p.y) { setForce(hi); return; }
			for (var i = 0; i < 40; i++) { var mdl = (lo + hi) / 2; if (tip(mdl) < p.y) lo = mdl; else hi = mdl; }
			setForce((lo + hi) / 2);
		}
		svg.addEventListener("pointerdown", function (ev) { if (!ev.target.closest("[data-drag]")) return; ev.preventDefault(); AXD.drag = true; AXD.lock = true; AXD.Fmax = AXD.FmaxNow; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } to(ev); });
		svg.addEventListener("pointermove", function (ev) { if (AXD.drag) to(ev); });
		function end() { if (!AXD.drag) return; AXD.drag = false; AXD.lock = false; axCompute(); }
		svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
		var sl = $("mt-ax-fs");
		sl.addEventListener("input", function () { if (!AXD.lock) { AXD.lock = true; AXD.Fmax = AXD.FmaxNow; } setForce(AXD.Fmax * (+sl.value) / 1000); });
		sl.addEventListener("change", function () { AXD.lock = false; axCompute(); });
	})();
	function setForce(F) { var f = FL["ax-F"]; f.inp.value = M.sig(M.fromSI("force", F, f.u), 4); setT(f, f.inp.value); bump("F"); axCompute(); }
	$("mt-ax-size").addEventListener("click", function () {
		var sf = num($("mt-ax-sfv").value), m = mv(), comp = S.ax.dir === "c"; S.ax.sf = $("mt-ax-sfv").value;
		if (!(sf > 0)) { toast("Type a safety factor above zero, e.g. 2."); return; }
		var str = comp && !m.sy ? (m.sc || m.su) : (m.sy || m.su), sa = str / sf;
		setFieldSI("ax-s", sa); bump("s"); axCompute();
		var r = AX.r; toast("Stress set to " + fmt(sa, "stress") + " (" + (m.sy ? "yield" : "strength") + " ÷ " + M.sig(sf, 3) + ")" + (r.dropped.indexOf("A") >= 0 || r.used.indexOf("A") < 0 ? ": the size is worked out." : ": the force it can take is worked out."));
	});
	function axDefaults() { S.ax.ord = ["F", "A", "L", "E"]; S.ax.shape = "round"; shapeSel.value = "round"; S.ax.dir = "t"; paintSeg("mt-ax-dir", "t"); ["ax-F", "ax-L", "ax-d", "ax-D", "ax-t", "ax-b", "ax-h", "ax-B", "ax-H"].forEach(function (id) { var f = FL[id]; f.u = U(f.d); f.sel.value = f.u; f.inp.value = DEF[S.sys][id]; setT(f, f.inp.value); }); ["ax-A", "ax-dL", "ax-s", "ax-e", "ax-E"].forEach(function (id) { FL[id].inp.value = ""; setT(FL[id], ""); }); axShapeFields(); }
	$("mt-ax-reset").addEventListener("click", function () { axDefaults(); axCompute(); });
	chipRow("mt-ax-ex", [
		["Steel rod pulled with 10 kN", function () { setMat("a36", true); axDefaults(); setField("ax-F", 10, "kN"); setField("ax-d", 10, "mm"); setField("ax-L", 1, "m"); axCompute(); }],
		["10 mm rod, 50 kN (too much)", function () { setMat("a36", true); axDefaults(); setField("ax-F", 50, "kN"); setField("ax-d", 10, "mm"); setField("ax-L", 1, "m"); axCompute(); }],
		["Find E from a test", function () { axDefaults(); setField("ax-d", 12.5, "mm"); setField("ax-L", 50, "mm"); setField("ax-F", 12, "kN"); setField("ax-dL", 0.0245, "mm"); S.ax.ord = ["dL", "F", "A", "L", "E"]; axCompute(); }],
		["Size a hanger rod (25 kN, safety factor 2)", function () { setMat("a36", true); axDefaults(); setField("ax-F", 25, "kN"); setField("ax-L", 2, "m"); $("mt-ax-sfv").value = "2"; $("mt-ax-size").click(); }],
		["Aluminium tube pushed with 20 kN", function () { setMat("al6061", true); axDefaults(); S.ax.shape = "tube"; shapeSel.value = "tube"; axShapeFields(); setField("ax-D", 40, "mm"); setField("ax-t", 2, "mm"); setField("ax-L", 1.5, "m"); setField("ax-F", 20, "kN"); S.ax.dir = "c"; paintSeg("mt-ax-dir", "c"); axCompute(); }]
	], function (fn) { fn(); });

	/* =========================== 2. TENSILE TEST =========================== */
	var TT = { c: null, cmp: [], P: [], cum: [], total: 0, p: 0, play: false, last: 0, unl: [], stops: [], hx: null };
	function spD() { return S.sys === "us" ? 0.0127 : 0.0125; } function spL() { return S.sys === "us" ? 0.0508 : 0.05; }
	var TC = ["#2563eb", "#d9480f", "#0f9d58"];
	var X0 = 74, X1 = 704, Y0 = 18, Y1 = 440;
	function cmpOpts(sel, val) { sel.innerHTML = "<option value=''>(nothing)</option>" + M.FAMS.map(function (fm) { var ms = M.MATS.filter(function (m) { return m.fam === fm[0]; }); return ms.length ? "<optgroup label='" + esc(fm[1]) + "'>" + ms.map(function (m) { return "<option value='" + m.id + "'>" + esc(m.name) + "</option>"; }).join("") + "</optgroup>" : ""; }).join(""); sel.value = M.mat(val) ? val : ""; if (sel._ssSync) sel._ssSync(); }
	cmpOpts($("mt-tt-c2"), S.tt.c2); cmpOpts($("mt-tt-c3"), S.tt.c3); searchSel(matSel); searchSel($("mt-tt-c2")); searchSel($("mt-tt-c3"));
	$("mt-tt-c2").addEventListener("change", function () { S.tt.c2 = this.value; save(); if (TT.c) { ttBuildCmp(); ttStatic(); ttRender(); ttStats(); } });
	$("mt-tt-c3").addEventListener("change", function () { S.tt.c3 = this.value; save(); if (TT.c) { ttBuildCmp(); ttStatic(); ttRender(); ttStats(); } });
	seg("mt-tt-zoom", function () { return S.tt.zoom; }, function (v) { S.tt.zoom = v; ttStatic(); ttRender(); });
	$("mt-tt-true").checked = !!S.tt.tr; $("mt-tt-areas").checked = S.tt.ar !== false;
	$("mt-tt-true").addEventListener("change", function () { S.tt.tr = this.checked; save(); ttStatic(); ttRender(); });
	$("mt-tt-areas").addEventListener("change", function () { S.tt.ar = this.checked; save(); ttRender(); });
	$("mt-tt-speed").value = S.tt.sp || "1"; $("mt-tt-speed").addEventListener("change", function () { S.tt.sp = this.value; save(); });
	function ttBuildCmp() { TT.cmp = [S.tt.c2, S.tt.c3].filter(function (id) { return id && M.mat(id); }).map(function (id) { return M.curve(M.mat(id)); }); }
	function curveRec() {   /* the material for the tensile model; your own material is clamped to the ranges real materials have */
		var m = matRec(); if (m.id !== "custom") return { m: m, notes: [] };
		var r = M.saneCurveMat(m), o = r.m;
		if (o.c === "luders") o.x = { uy: 1.1, eL: Math.min(0.02, o.el / 100 * 0.3) };
		if (o.c === "polymer") { if (o.sy == null) o.sy = o.su; o.x = { ey: Math.max(1.2 * o.sy / (o.E * 1e3), 0.02), dr: 0.8, ed: o.el / 100 * 0.7, brk: o.su }; }
		return r;
	}
	function ttBuild() {
		var cr = curveRec(); TT.c = M.curve(cr.m); TT.meas = M.measure(TT.c); TT.unl = []; TT.p = 0; TT.play = false; ttBuildCmp(); ttPath();
		if (S.mat === "custom") { var w = cr.notes.slice(); if (TT.c.warn === "fit") w.push("these numbers do not fit the usual shape of a metal's curve, so the closest one is drawn"); else if (TT.c.warn && TT.c.warn !== "no plateau") w.push(TT.c.warn); $("mt-cu-msg").textContent = (CUMSG ? CUMSG + " " : "") + (w.length ? "For the tensile test: " + w.join("; ") + "." : CUMSG ? "" : CUDEF); }
	}
	function ptOf(c, i) { return { e: c.e[i], s: c.s[i], t: c.t[i], et: c.et[i], ph: c.ph[i] }; }
	function ptAt(c, e) { var i = M.idxAt(c, e), j = Math.min(i + 1, c.e.length - 1), f = j > i && c.e[j] > c.e[i] ? (e - c.e[i]) / (c.e[j] - c.e[i]) : 0; function L(a) { return a[i] + (a[j] - a[i]) * f; } return { e: e, s: L(c.s), t: L(c.t), et: L(c.et), ph: c.ph[j] }; }
	function ttPath() {
		var c = TT.c, P = [], unl = TT.unl.slice().sort(function (a, b) { return a - b; }), ui = 0, stops = [], i, j;
		function push(o, kind) { P.push({ e: o.e, s: o.s, t: o.t, et: o.et, ph: o.ph, k: kind }); }
		for (i = 0; i < c.e.length; i++) {
			while (ui < unl.length && unl[ui] <= c.e[i]) {
				var u = unl[ui++], at = ptAt(c, u); push(at, "c");
				if (c.elastic) { for (j = M.idxAt(c, u); j >= 0; j--) push(ptOf(c, j), "u"); stops.push(P.length - 1); for (j = 1; j <= M.idxAt(c, u); j++) push(ptOf(c, j), "r"); push(at, "r"); }
				else {
					var set = M.permanentSet(c, at.e, at.s);
					for (j = 1; j <= 24; j++) { var f = j / 24, ee = at.e + (set - at.e) * f, ss = at.s * (1 - f); push({ e: ee, s: ss, t: ss * (1 + ee), et: Math.log(1 + ee), ph: "u" }, "u"); }
					stops.push(P.length - 1);
					for (j = 1; j <= 24; j++) { var g = j / 24, e2 = set + (at.e - set) * g, s2 = at.s * g; push({ e: e2, s: s2, t: s2 * (1 + e2), et: Math.log(1 + e2), ph: "r" }, "r"); }
				}
			}
			push(ptOf(c, i), "c");
		}
		var xm = c.ef || 1, ym = c.smax || 1, cum = [0];
		for (i = 1; i < P.length; i++) { var dx = 1.6 * (P[i].e - P[i - 1].e) / xm, dy = (P[i].s - P[i - 1].s) / ym; cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy)); }
		TT.P = P; TT.cum = cum; TT.total = cum[cum.length - 1]; TT.stops = stops.map(function (k) { return cum[k]; });
	}
	function ttState() {
		var P = TT.P, cum = TT.cum, p = clamp(TT.p, 0, TT.total), lo = 0, hi = cum.length - 1;
		while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cum[m] <= p) lo = m; else hi = m; }
		var a = P[lo], b = P[hi], f = cum[hi] > cum[lo] ? (p - cum[lo]) / (cum[hi] - cum[lo]) : 0;
		function L(k) { return a[k] + (b[k] - a[k]) * f; }
		var st = { e: L("e"), s: L("s"), t: L("t"), et: L("et"), k: f > 0 ? b.k : a.k, i: lo, f: f, ph: f > 0 ? b.ph : a.ph };
		var em = 0; for (var i = 0; i <= lo; i++) if (P[i].k === "c" && P[i].e > em) em = P[i].e; if (st.k === "c" && st.e > em) em = st.e; st.emax = em;
		st.broken = p >= TT.total - 1e-9; return st;
	}
	function ttShow() { if (!TT.c) ttBuild(); ttStatic(); ttRender(); ttStats(); }
	/* --- chart --- */
	function stepOf(range, n) { var raw = range / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
	function elX(c) { if (c.brittle) return c.ef * 1.04; if (c.elastic) return Math.min(c.ef, 0.6); if (c.type === "polymer") return Math.min(c.ef, c.ey * 1.8); return Math.min(c.ef * 1.02, Math.max(0.006, 3 * (c.suy || c.sy) / c.E + 0.004)); }
	function ttScale() {
		var c = TT.c, tr = !!S.tt.tr, all = [c].concat(TT.cmp), xm = 0, ym = 0;
		if (S.tt.zoom === "follow") {   /* zoomed in on the start, widening as the bar stretches (never wider than the whole curve) */
			var full = 0; all.forEach(function (o) { full = Math.max(full, tr ? o.et[o.et.length - 1] : o.ef); }); full *= 1.04;
			var st0 = TT.P.length ? ttState() : null, em = st0 ? st0.emax : 0;
			xm = Math.min(full, Math.max(elX(c) * 0.55, em * 1.3));
			all.forEach(function (o) { for (var i = 0; i < o.e.length; i++) { if (o.e[i] <= xm) ym = Math.max(ym, o.s[i]); if (tr && o.et[i] <= xm) ym = Math.max(ym, o.t[i]); } });
			ym *= 1.15;
		} else if (S.tt.zoom === "el") {
			xm = elX(c);
			all.forEach(function (o) { for (var i = 0; i < o.e.length; i++) { if (o.e[i] <= xm) ym = Math.max(ym, o.s[i]); if (tr && o.et[i] <= xm) ym = Math.max(ym, o.t[i]); } });
			ym *= 1.15;
		} else {
			all.forEach(function (o) { xm = Math.max(xm, tr ? o.et[o.et.length - 1] : o.ef); ym = Math.max(ym, o.smax); if (tr) for (var i = 0; i < o.t.length; i++) ym = Math.max(ym, o.t[i]); });
			xm *= 1.04; ym *= 1.1;
		}
		if (!(xm > 0)) xm = 0.01; if (!(ym > 0)) ym = 1e6;
		return { xm: xm, ym: ym, x: function (e) { return X0 + (X1 - X0) * e / xm; }, y: function (s) { return Y1 - (Y1 - Y0) * s / ym; } };
	}
	function ttStatic(sc0) {
		if (!TT.c) return; var sc = sc0 || ttScale(); TT.sc = sc;
		var h = ["<defs><clipPath id='mt-tt-clip'><rect x='" + X0 + "' y='" + (Y0 - 4) + "' width='" + (X1 - X0 + 4) + "' height='" + (Y1 - Y0 + 4) + "'/></clipPath></defs>"];
		var su = U("stress"), xs = stepOf(sc.xm * 100, 6), ys = stepOf(M.fromSI("stress", sc.ym, su), 6), v;
		for (v = 0; v <= sc.xm * 100 + 1e-9; v += xs) { var X = sc.x(v / 100); h.push(line(X, Y0, X, Y1, "mt-grid"), tx(X, Y1 + 20, M.sig(v, 4), "mt-t mt-ts", "middle")); }
		for (v = 0; M.toSI("stress", v, su) <= sc.ym * 1.0001; v += ys) { var Y = sc.y(M.toSI("stress", v, su)); h.push(line(X0, Y, X1, Y, "mt-grid"), tx(X0 - 8, Y + 5, M.sig(v, 4), "mt-t mt-ts", "end")); }
		h.push(line(X0, Y1, X1, Y1, "mt-axis"), line(X0, Y0, X0, Y1, "mt-axis"));
		h.push(tx((X0 + X1) / 2, Y1 + 46, S.tt.tr ? "Strain (%): engineering ε, or true εt for the true curves" : "Strain ε (%)", "mt-t mt-b", "middle"), tx(18, (Y0 + Y1) / 2, "Stress σ (" + su + ")", "mt-t mt-b", "middle", " transform='rotate(-90 18 " + r1((Y0 + Y1) / 2) + ")'"));
		TT.cmp.forEach(function (o, i) { h.push("<polyline clip-path='url(#mt-tt-clip)' points='" + polyPts(o.e, o.s, sc) + "' class='mt-tt-cmp' stroke='" + TC[i + 1] + "'/>"); if (S.tt.tr) h.push("<polyline clip-path='url(#mt-tt-clip)' points='" + polyPts(o.et, o.t, sc) + "' class='mt-tt-cmp mt-tt-cmpt' stroke='" + TC[i + 1] + "'/>"); });
		var lg = [[TT.c.name, TC[0]]].concat(TT.cmp.map(function (o, i) { return [o.name, TC[i + 1]]; }));
		if (S.tt.tr) lg.push(["true stress (dashed after necking)", "var(--mt-true)"]);
		var lx = X1 - 12, ly = Y1 - 14 - (lg.length - 1) * 21;
		if (lg.length > 1) { h.push("<rect x='" + (lx - 300) + "' y='" + (ly - 17) + "' width='304' height='" + (lg.length * 21 + 6) + "' rx='6' class='mt-tt-lgb'/>"); lg.forEach(function (l, i) { h.push(line(lx - 292, ly + i * 21 - 5, lx - 266, ly + i * 21 - 5, "mt-tt-lg' style='stroke:" + l[1]), tx(lx - 258, ly + i * 21, l[0], "mt-t mt-ts", "start")); }); }
		h.push("<g id='mt-tt-dy'></g><g id='mt-tt-hv'></g><rect x='" + X0 + "' y='" + Y0 + "' width='" + (X1 - X0) + "' height='" + (Y1 - Y0) + "' class='mt-tt-hit'/>");
		$("mt-tt-chart").innerHTML = h.join("");
	}
	function polyPts(xa, ya, sc) { var s = []; for (var i = 0; i < xa.length; i++) s.push(r1(sc.x(xa[i])) + "," + r1(sc.y(ya[i]))); return s.join(" "); }
	function ttRender() {
		if (!TT.c || !TT.sc) return;
		if (S.tt.zoom === "follow") { var ns = ttScale(); if (Math.abs(ns.xm / TT.sc.xm - 1) > 0.002 || Math.abs(ns.ym / TT.sc.ym - 1) > 0.002) ttStatic(ns); }
		var c = TT.c, sc = TT.sc, st = ttState(), P = TT.P, h = [], i, mm = TT.meas, tr = !!S.tt.tr;
		var upto = st.i, pts = [], tp = [], tpN = [];
		for (i = 0; i <= upto; i++) pts.push([P[i].e, P[i].s]); pts.push([st.e, st.s]);
		if (S.tt.ar !== false) {
			if (c.sy && (c.yieldKind === "offset" || c.yieldKind === "luders") && st.emax >= c.sy / c.E) h.push("<polygon clip-path='url(#mt-tt-clip)' points='" + [[0, 0], [c.sy / c.E, c.sy], [c.sy / c.E, 0]].map(function (p) { return r1(sc.x(p[0])) + "," + r1(sc.y(p[1])); }).join(" ") + "' class='mt-tt-res'/>");
			var env = [[0, 0]]; for (i = 0; i <= upto; i++) if (P[i].k === "c" && P[i].e <= st.emax) env.push([P[i].e, P[i].s]); var top = ptAt(c, st.emax); env.push([st.emax, top.s], [st.emax, 0]);
			if (st.emax > 0) h.push("<polygon clip-path='url(#mt-tt-clip)' points='" + env.map(function (p) { return r1(sc.x(p[0])) + "," + r1(sc.y(p[1])); }).join(" ") + "' class='mt-tt-tgh'/>");
		}
		var mk = mm.offset;
		if ((c.yieldKind === "offset" || c.yieldKind === "luders") && mk && st.emax >= mk.e * 0.7) h.push(line(sc.x(0.002), sc.y(0), sc.x(mk.e + (mk.e - 0.002) * 0.25), sc.y(mk.s * 1.25), "mt-tt-off' clip-path='url(#mt-tt-clip)"), tx(sc.x(0.002) + 6, Y1 - 8, "0.2%", "mt-t mt-ts mt-tt-offt", "start"));
		h.push("<polyline clip-path='url(#mt-tt-clip)' points='" + pts.map(function (p) { return r1(sc.x(p[0])) + "," + r1(sc.y(p[1])); }).join(" ") + "' class='mt-tt-main'/>");
		if (tr) {
			for (i = 0; i <= upto; i++) { if (P[i].k !== "c") continue; (P[i].ph === "neck" ? tpN : tp).push([P[i].et, P[i].t]); }
			if (st.k === "c") (st.ph === "neck" ? tpN : tp).push([st.et, st.t]);
			if (tpN.length && tp.length) tpN.unshift(tp[tp.length - 1]);
			h.push("<polyline clip-path='url(#mt-tt-clip)' points='" + tp.map(function (p) { return r1(sc.x(p[0])) + "," + r1(sc.y(p[1])); }).join(" ") + "' class='mt-tt-true'/>");
			if (tpN.length > 1) h.push("<polyline clip-path='url(#mt-tt-clip)' points='" + tpN.map(function (p) { return r1(sc.x(p[0])) + "," + r1(sc.y(p[1])); }).join(" ") + "' class='mt-tt-true mt-tt-trueN'/>");
		}
		function dot(e, s, label, anchor, dy) { var X = sc.x(e), Y = sc.y(s); if (X > X1 + 2 || Y < Y0 - 2) return; h.push("<circle cx='" + r1(X) + "' cy='" + r1(Y) + "' r='5' class='mt-tt-mk'/>", tx(X + (anchor === "end" ? -9 : 9), Y + (dy || -9), label, "mt-t mt-ts mt-tt-lab", anchor || "start")); }
		var su = function (s) { return fmt(s, "stress", 3); };
		if (c.yieldKind === "luders") { if (st.emax >= c.suy / c.E) dot(c.suy / c.E, c.suy, "upper yield " + su(c.suy), "start", -10); if (st.emax >= c.eL * 0.6) dot(c.eL * 0.6, c.sy, "lower yield " + su(c.sy), "start", 20); }
		else if (c.yieldKind === "offset" && mk && st.emax >= mk.e) dot(mk.e, mk.s, "yield " + su(mk.s), "start", 20);
		else if (c.yieldKind === "peak" && mm.peak && st.emax >= mm.peak.e) dot(mm.peak.e, mm.peak.s, "yield " + su(mm.peak.s), "start", -10);
		if (!c.brittle && !c.elastic && st.emax >= c.emax && c.emax < c.ef * 0.999) dot(c.emax, c.smax, "UTS " + su(c.smax) + ": necking starts", sc.x(c.emax) > X1 - 220 ? "end" : "start", -12);
		if (st.broken) { var Xb = sc.x(c.ef), Yb = sc.y(c.sf); h.push(line(Xb, Yb, Xb, sc.y(0), "mt-tt-brk' clip-path='url(#mt-tt-clip)"), "<path d='M" + r1(Xb - 7) + "," + r1(Yb - 7) + " l14,14 m0,-14 l-14,14' class='mt-tt-x'/>", tx(Xb + (Xb > X1 - 120 ? -10 : 10), Yb - 12, "break " + strainTxt(c.ef), "mt-t mt-ts mt-tt-lab", Xb > X1 - 120 ? "end" : "start")); }
		var stopNow = TT.stops.some(function (s) { return Math.abs(s - TT.p) < 1e-9; });
		if (stopNow && st.k === "u") { var set = st.e, top2 = ttUnloadTop(); if (top2) { var Ys = Y1 + 2; h.push(line(sc.x(0), Ys - 6, sc.x(set), Ys - 6, "mt-tt-set"), line(sc.x(set), Ys - 6, sc.x(top2.e), Ys - 6, "mt-tt-rec")); } }
		h.push("<circle cx='" + r1(sc.x(st.e)) + "' cy='" + r1(sc.y(st.s)) + "' r='6.5' class='mt-tt-dot'/>");
		$("mt-tt-dy").innerHTML = h.join("");
		ttSpec(st); ttLive(st); ttCtl(st);
		$("mt-tt-scrub").value = String(Math.round(TT.total > 0 ? TT.p / TT.total * 1000 : 0));
	}
	function ttUnloadTop() { var P = TT.P, i = ttState().i; while (i > 0 && P[i].k === "u") i--; return P[i] && P[i].k === "c" ? P[i] : null; }
	function ttLive(st) {
		var A0 = PI * spD() * spD() / 4, L0 = spL(), F = st.s * A0, dL = st.e * L0, w = [];
		w.push("<span><b>Force</b> " + fmt(F, "force") + "</span>", "<span><b>Stretch</b> " + fmt(dL, "small") + "</span>", "<span><b>Stress</b> " + fmt(st.s, "stress") + "</span>", "<span><b>Strain</b> " + strainTxt(st.e) + "</span>");
		if (S.tt.tr) w.push("<span><b>True stress</b> " + fmt(st.t, "stress") + "</span>");
		$("mt-tt-live").innerHTML = w.join("");
	}
	function ttCtl(st) {
		var pb = $("mt-tt-play"); pb.textContent = TT.play ? "❚❚ Pause" : st.broken ? "↺ Test again" : TT.p > 0 ? "▶ Play" : "▶ Start the test";
		$("mt-tt-unload").disabled = st.broken || st.k !== "c" || st.e <= 0;
		var c = TT.c, msg = "";
		var stopNow = TT.stops.some(function (s) { return Math.abs(s - TT.p) < 1e-9; });
		if (st.broken) msg = (c.brittle ? "Broke with almost no warning at " + strainTxt(c.ef) + ": a brittle material does not yield or neck." : c.elastic ? "Snapped at " + strainTxt(c.ef) + ": the pieces spring back almost to their old length." : "Broke at " + strainTxt(c.ef) + " strain. After the break the elastic part (" + strainTxt(c.sf / c.E) + ") springs back, so the pieces fitted together are " + strainTxt(c.ef - c.sf / c.E) + " longer than at the start.");
		else if (stopNow && st.k === "u") { var top = ttUnloadTop(); if (top) {
			if (c.elastic) msg = "Rubber gives all of the stretch back: no permanent set.";
			else if (st.e < 1e-5) msg = "Back to zero: below the yield point everything springs back (elastic).";
			else { msg = "Unloaded from " + strainTxt(top.e) + ": " + strainTxt(top.e - st.e) + " sprang back (slope E) and " + strainTxt(st.e) + " stays (permanent set). Press Play to load it again.";
				if ((c.yieldKind === "offset" || c.yieldKind === "luders") && top.s > c.sy * 1.01) msg += " It now stays elastic up to " + fmt(top.s, "stress") + ", higher than the first yield (" + fmt(c.sy, "stress") + "): that is strain hardening.";
				else if (c.brittle) msg += " A brittle material's curve is not quite straight, so even it keeps a small set.";
				else if (c.type === "polymer") msg += " Plastics also creep back slowly over minutes to hours, which this model leaves out."; }
		} }
		else if (st.k === "u") msg = "Taking the load off: the line comes down with the same slope E as the start.";
		else if (st.k === "r") msg = "Loading again: straight up the same line until it meets the curve.";
		else if (st.ph === "neck") msg = "Necking: the bar gets thinner in one place, so the force it takes falls even though the metal there keeps getting stronger (see the true stress).";
		else if (st.ph === "lud") msg = "Lüders plateau: bands of yielded steel travel along the bar at an almost constant force.";
		else if (st.ph === "draw") msg = "Cold drawing: a neck forms and travels along the bar while the force stays about the same.";
		else if (st.ph === "pl" || st.ph === "hard") msg = "Plastic: the bar stays longer when unloaded, and it gets stronger as it stretches (strain hardening).";
		else if (TT.p > 0 && c.type === "polymer") msg = st.e < c.ey ? "Before the yield peak the curve already bends: plastics creep and relax (they are viscoelastic), so the start is only roughly straight." : "Strain hardening: the drawn-out chains line up and the plastic gets stiffer until it breaks.";
		else if (TT.p > 0) msg = c.brittle ? "Elastic, then it breaks: there is no yield point." : c.elastic ? "Rubber: soft at first, then stiffer as the chains straighten out." : "Elastic: stress and strain rise in a straight line with slope E.";
		else msg = "Press Start to pull the bar. Drag the slider to go back and forth. Press Unload here at any point to take the load off.";
		$("mt-tt-msg").textContent = msg;
	}
	function ttStats() {
		var c = TT.c, mm = TT.meas, h = [];
		h.push(tile("Young's modulus E", fmt(mm.E, "modulus", 3), "slope of the straight start " + fmtO(mm.E, "modulus")));
		var yv = "–", ys = "";
		if (c.yieldKind === "luders") { yv = fmt(c.sy, "stress"); ys = "lower yield; upper yield " + fmt(c.suy, "stress"); }
		else if (c.yieldKind === "offset") { yv = fmt(mm.offset ? mm.offset.s : c.sy, "stress"); ys = "0.2% offset " + fmtO(c.sy, "stress"); }
		else if (c.yieldKind === "peak") { yv = fmt(mm.peak.s, "stress"); ys = "the peak (plastics)"; }
		else { yv = "none"; ys = c.elastic ? "rubber stays elastic" : "brittle: breaks first"; }
		h.push(tile("Yield strength", yv, ys));
		h.push(tile("Tensile strength (UTS)", fmt(c.smax, "stress"), "highest stress, at " + strainTxt(c.emax) + " strain", "tu-stat--hero"));
		h.push(tile("Elongation at break", strainTxt(c.ef), c.yieldKind === "offset" || c.yieldKind === "luders" ? (c.noNeck ? "breaks before it can neck" : "even stretching up to " + strainTxt(c.emax) + ", then the neck") : ""));
		h.push(tile("Reduction of area", c.raUsed && !c.brittle && !c.noNeck && c.type !== "polymer" && !c.elastic ? "≈ " + M.pretty(c.raUsed * 100, 3) + "%" : "–", c.raGuess ? "estimated" : c.raUsed ? "at the neck (rough figure)" : "no neck"));
		h.push(tile("Resilience", c.res ? fmtIn(c.res, "energy", null, 3) : "–", c.res ? "energy stored up to yield, σy²/2E" : "no yield point"));
		h.push(tile("Toughness", fmtIn(c.tough, "energy", null, 3), "energy to break, area under the curve"));
		if (c.n) h.push(tile("Strain hardening", "n = " + M.pretty(c.n, 3), "K = " + fmt(c.K, "stress", 3) + (c.e0 ? " (Swift law after the plateau)" : " (σt = K εpⁿ)")));
		$("mt-tt-stats").innerHTML = h.join("");
		var w = $("mt-tt-cmpw"); w.hidden = !TT.cmp.length;
		if (TT.cmp.length) {
			var rows = [c].concat(TT.cmp);
			$("mt-tt-cmpt").innerHTML = "<thead><tr><th>Material</th><th>E</th><th>Yield</th><th>UTS</th><th>Elongation</th><th>Toughness</th></tr></thead><tbody>" + rows.map(function (o, i) { var me = M.measure(o), y = o.yieldKind === "none" ? "–" : fmt(o.yieldKind === "peak" ? me.peak.s : o.sy, "stress", 3); return "<tr><td><span class='mt-sw' style='background:" + TC[i] + "'></span>" + esc(o.name) + "</td><td>" + fmt(me.E, "modulus", 3) + "</td><td>" + y + "</td><td>" + fmt(o.smax, "stress", 3) + "</td><td>" + strainTxt(o.ef) + "</td><td>" + fmtIn(o.tough, "energy", null, 3) + "</td></tr>"; }).join("") + "</tbody>";
		}
	}
	/* --- specimen --- */
	function ttSpec(st) {
		var c = TT.c, fam = matRec().fam, cx = 120, yb = 610, Rg = 25, r0 = 15, FH = 20, GH = 56;
		var G0 = Math.min(200, 360 / (1 + c.ef)), broken = st.broken, eb = c.ef;
		function rad(u, em, e) {
			if (c.elastic) return r0 / Math.sqrt(1 + e);
			if (c.brittle) return r0;
			if (c.type === "polymer") { var ld = 1 + c.ed, rd = r0 / Math.sqrt(ld); if (em <= c.ey) return r0 / Math.sqrt(1 + em); if (em < c.ed) { var f = clamp((em - c.ey) / (c.ed - c.ey), 0, 1), half = f * ld / (1 + em) / 2, dz = Math.abs(u - 0.5) - half, s = 1 / (1 + Math.exp(dz / 0.02)); return r0 / Math.sqrt(1 + c.ey) - (r0 / Math.sqrt(1 + c.ey) - rd) * s; } return rd * Math.sqrt(ld / (1 + em)); }
			var ru = r0 / Math.sqrt(1 + Math.min(em, c.eu));
			if (em <= c.eu || !(c.ef > c.eu)) return ru;
			var w = clamp((em - c.eu) / (c.ef - c.eu), 0, 1), RA = c.raUsed || 0.35, rf = r0 * Math.sqrt(1 - RA), a = Math.pow(w, 1.5) * (1 - rf / ru), z = (u - 0.5) / 0.085;
			return ru * (1 - a * Math.exp(-z * z));
		}
		function side(y1, y2, rf, n) { var p = []; for (var i = 0; i <= n; i++) { var u = i / n; p.push([y1 + (y2 - y1) * u, rf(u)]); } return p; }
		function piece(yBot, Gc, u0, u1, em, e, botGrip, cut, cutUp) {
			/* outline points (y, r) from the bottom of this piece to its top */
			var pts = [], y = yBot;
			if (botGrip) { pts.push([y + 6, Rg], [y - GH, Rg]); y -= GH; var rs = rad(0, em, e); for (var i = 1; i <= 8; i++) { var k = i / 8; pts.push([y - FH * k, Rg - (Rg - rs) * (1 - Math.cos(PI * k)) / 2]); } y -= FH; }
			var n = 60, Lg = Gc * (u1 - u0); for (var j = 0; j <= n; j++) { var u = u0 + (u1 - u0) * j / n; pts.push([y - Lg * j / n, rad(u, em, e)]); } y -= Lg;
			if (!cut) { var re = rad(1, em, e); for (var q = 1; q <= 8; q++) { var kk = q / 8; pts.push([y - FH * kk, re + (Rg - re) * (1 - Math.cos(PI * kk)) / 2]); } y -= FH; pts.push([y - GH - 6, Rg]); y -= GH; }
			return { pts: pts, top: y };
		}
		function polyOf(pts, cutTop, cutBot, ductile) {
			var L = pts.map(function (p) { return [cx - p[1], p[0]]; }), R = pts.slice().reverse().map(function (p) { return [cx + p[1], p[0]]; }), s = [];
			if (cutTop) { var t = pts[pts.length - 1]; L.push.apply(L, ductile ? [[cx - t[1] * 0.45, t[0] - 4], [cx, t[0] - 7], [cx + t[1] * 0.45, t[0] - 4]] : [[cx - t[1] * 0.3, t[0] - 2], [cx + t[1] * 0.2, t[0] + 2]]); }
			s = L.concat(R);
			if (cutBot) { var b = pts[0]; s.push.apply(s, ductile ? [[cx + b[1] * 0.45, b[0] - 3], [cx, b[0] - 6], [cx - b[1] * 0.45, b[0] - 3]] : [[cx + b[1] * 0.2, b[0] + 2], [cx - b[1] * 0.3, b[0] - 2]]); }
			return s.map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" ");
		}
		var cls = "mt-sp mt-sp--" + fam, h = [], topY, ductile = !c.brittle && !c.elastic;
		h.push("<defs><linearGradient id='mt-sp-gr' x1='0' x2='1'><stop offset='0' class='mt-s1'/><stop offset='0.45' class='mt-s2'/><stop offset='1' class='mt-s3'/></linearGradient></defs>");
		h.push("<rect x='8' y='16' width='14' height='620' rx='3' class='mt-frame'/><rect x='218' y='16' width='14' height='620' rx='3' class='mt-frame'/>");
		if (!broken) {
			var Gc = G0 * (1 + st.e), pc = piece(yb, Gc, 0, 1, st.emax, st.e, true, false);
			h.push("<polygon points='" + polyOf(pc.pts) + "' class='" + cls + "' fill='url(#mt-sp-gr)'/>"); topY = pc.top;
			var y1 = yb - GH - FH, y2 = y1 - Gc, xm = cx + Rg + 10;
			h.push(line(cx - 4, y1, xm + 8, y1, "mt-gauge"), line(cx - 4, y2, xm + 8, y2, "mt-gauge"), dimV(xm + 4, y1, y2, "mt-sp-mk"));
			h.push(tx(xm + 22, (y1 + y2) / 2, (st.e > 0 ? "L = " : "L₀ = ") + fmt(spL() * (1 + st.e), "small", 4), "mt-t mt-ts", "middle", " transform='rotate(-90 " + r1(xm + 22) + " " + r1((y1 + y2) / 2) + ")'"));
		} else {
			var Gb = G0 * (1 + eb), ub = c.brittle ? 0.42 : 0.5, rub = c.elastic, gap = 10;
			var lowG = rub ? G0 : Gb, upG = rub ? G0 : Gb;
			var lo = piece(yb, lowG, 0, ub, rub ? 0 : eb, rub ? 0 : eb, true, true);
			var crossTop = yb - 2 * (GH + FH) - Gb - gap, upBot = crossTop + GH + FH + upG * (1 - ub);
			var hi = piece(upBot, upG, ub, 1, rub ? 0 : eb, rub ? 0 : eb, false, false);
			h.push("<polygon points='" + polyOf(lo.pts, true, false, ductile) + "' class='" + cls + "' fill='url(#mt-sp-gr)'/>", "<polygon points='" + polyOf(hi.pts, false, true, ductile) + "' class='" + cls + "' fill='url(#mt-sp-gr)'/>");
			topY = hi.top;
		}
		h.push("<defs>" + MARK.replace("@", "mt-sp-mk") + "</defs>");
		h.push("<rect x='22' y='" + r1(topY - 8) + "' width='196' height='" + (GH + 14) + "' rx='4' class='mt-grip'/>", tx(cx, topY + 18, "moving crosshead", "mt-t mt-ts mt-tgrip", "middle"));
		h.push("<rect x='22' y='" + (yb - GH + 8) + "' width='196' height='" + (GH + 14) + "' rx='4' class='mt-grip'/>", tx(cx, yb - GH + 40, "fixed grip", "mt-t mt-ts mt-tgrip", "middle"));
		h.push("<path d='M" + cx + "," + r1(topY - 12) + " v-26 m-9,10 l9,-12 l9,12' class='mt-pull'/>");
		var vy = Math.max(0, Math.floor(yb - 2 * (GH + FH) - G0 * (1 + c.ef) - 10 - 64)), sv = $("mt-tt-spec");   /* crop the empty frame above the highest crosshead position of this test */
		sv.setAttribute("viewBox", "0 " + vy + " 240 " + (640 - vy)); sv.innerHTML = h.join("");
	}
	/* --- play / unload / scrub --- */
	function ttTick(ts) {
		if (!TT.play) return;
		var dt = TT.last ? Math.min(0.05, (ts - TT.last) / 1000) : 0; TT.last = ts;
		var np = TT.p + dt * TT.total / 12 * (+S.tt.sp || 1);
		var stop = null; TT.stops.forEach(function (s) { if (s > TT.p + 1e-12 && s <= np && stop === null) stop = s; });
		if (stop !== null) { np = stop; TT.play = false; }
		if (np >= TT.total) { np = TT.total; TT.play = false; }
		TT.p = np; ttRender();
		if (TT.play) requestAnimationFrame(ttTick);
	}
	function ttPlay() { if (TT.play) { TT.play = false; ttRender(); return; } if (ttState().broken) { TT.unl = []; ttPath(); TT.p = 0; } TT.play = true; TT.last = 0; ttRender(); requestAnimationFrame(ttTick); }
	$("mt-tt-play").addEventListener("click", ttPlay);
	$("mt-tt-reset").addEventListener("click", function () { TT.play = false; TT.unl = []; ttPath(); TT.p = 0; ttRender(); });
	$("mt-tt-unload").addEventListener("click", function () {
		var st = ttState(); if (st.broken || st.k !== "c" || !(st.e > 0)) return;
		var e = st.e; TT.unl.push(e); ttPath();
		for (var i = 1; i < TT.P.length; i++) if (TT.P[i].k === "u" && Math.abs(TT.P[i - 1].e - e) < 1e-12) { TT.p = TT.cum[i - 1]; break; }
		TT.play = true; TT.last = 0; ttRender(); requestAnimationFrame(ttTick);
	});
	$("mt-tt-scrub").addEventListener("input", function () { TT.play = false; TT.p = TT.total * (+this.value) / 1000; ttRender(); });
	$("mt-tt-full").addEventListener("click", function () { var el = $("mt-tt"); if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(function () { toast("Full screen is not available here."); }); else toast("Full screen is not available here: use Fill window."); });
	/* Fill window: the test box covers the browser window (more practical than full screen on a big monitor); Esc or Close leaves */
	function ttWin(on) { TT.win = on; $("mt-tt").classList.toggle("mt-tt--win", on); document.documentElement.classList.toggle("mt-noscroll", on); $("mt-tt-win").textContent = on ? "✕ Close" : "⤢ Fill window"; $("mt-tt-win").title = on ? "Back to the page (Esc)" : "Fill the browser window (Esc to close)"; }
	$("mt-tt-win").addEventListener("click", function () { ttWin(!TT.win); });
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && TT.win && !document.fullscreenElement && !e.defaultPrevented) ttWin(false); });
	(function () {
		var ch = $("mt-tt-chart");
		ch.addEventListener("pointermove", function (ev) {
			if (!TT.sc) return; var p = svgPt(ch, ev), g = $("mt-tt-hv"); if (!g) return;
			if (p.x < X0 || p.x > X1 || p.y < Y0 || p.y > Y1) { g.innerHTML = ""; return; }
			var sc = TT.sc, e = (p.x - X0) / (X1 - X0) * sc.xm, rows = [], all = [TT.c].concat(TT.cmp), tr = !!S.tt.tr;
			all.forEach(function (o, i) { if (e <= o.ef) rows.push([o.name, M.stressAt(o, e), TC[i]]); });
			var hh = [line(p.x, Y0, p.x, Y1, "mt-tt-hl")], bx = p.x > (X0 + X1) / 2 ? p.x - 12 : p.x + 12, an = p.x > (X0 + X1) / 2 ? "end" : "start";
			hh.push(tx(bx, Y0 + 18, "ε = " + strainTxt(e), "mt-t mt-ts mt-b mt-tt-hvt", an));
			rows.forEach(function (rw, i) { hh.push(tx(bx, Y0 + 38 + i * 19, (all.length > 1 ? rw[0] + ": " : "σ = ") + fmt(rw[1], "stress", 4), "mt-t mt-ts mt-tt-hvt", an, " style='fill:" + rw[2] + "'")); hh.push("<circle cx='" + r1(p.x) + "' cy='" + r1(sc.y(rw[1])) + "' r='3.5' fill='" + rw[2] + "'/>"); });
			if (!tr || true) g.innerHTML = hh.join("");
		});
		ch.addEventListener("pointerleave", function () { var g = $("mt-tt-hv"); if (g) g.innerHTML = ""; });
	})();

	/* =========================== 3. SHEAR =========================== */
	seg("mt-sh-mode", function () { return S.sh.mode; }, function (v) { S.sh.mode = v; shCompute(); });
	seg("mt-sh-n", function () { return S.sh.n; }, function (v) { S.sh.n = v; shCompute(); });
	$("mt-sh-ratio").value = S.sh.ratio; $("mt-sh-sf").value = S.sh.sf;
	$("mt-sh-ratio").addEventListener("input", function () { S.sh.ratio = this.value; save(); shCompute(); });
	$("mt-sh-sf").addEventListener("input", function () { S.sh.sf = this.value; save(); shCompute(); });
	function modeVis(panel, test) { [].forEach.call(root.querySelectorAll("[data-panel='" + panel + "'] [data-m]"), function (el) { el.hidden = !test(el.getAttribute("data-m").split(" ")); }); }
	function shCompute() {
		var m = mv(), md = S.sh.mode, n = +S.sh.n || 1, h = [], msg = "";
		modeVis("shear", function (a) { return a.indexOf(md) >= 0; });
		var G = mfield("sh-G", m.G), V = fval("sh-V"), d = fval("sh-d"), A = fval("sh-A"), hd = fval("sh-hd"), t = fval("sh-t"), sf = num(S.sh.sf), tauY = m.sy ? 0.577 * m.sy : null, tauU = (num(S.sh.ratio) > 0 ? num(S.sh.ratio) : 0.75) * m.su;
		var gG = M.gFrom(m.E, m.nu), res = {};
		if (md === "pin" || md === "area") {
			var Ash = md === "pin" ? (d > 0 ? PI * d * d / 4 : NaN) : A, planes = md === "pin" ? n : 1;
			if (!(V >= 0)) msg = "Type the shear force."; else if (!(Ash > 0)) msg = md === "pin" ? "Type the pin or bolt diameter." : "Type the area that carries the shear.";
			var tau = V / (planes * Ash), gam = G > 0 ? tau / G : NaN, sfa = tauY ? tauY / tau : (0.6 * m.su) / tau;
			res = { tau: tau, gam: gam, A: Ash, planes: planes };
			h.push(tile("Shear stress τ", isFinite(tau) ? fmt(tau, "stress") : "–", isFinite(tau) ? (planes === 2 ? "double shear: the force is shared by two planes " : "") + fmtO(tau, "stress") : "", "tu-stat--hero"));
			h.push(tile("Shear strain γ", isFinite(gam) ? M.pretty(gam, 4) + " rad" : "–", isFinite(gam) ? "= " + M.pretty(gam * 180 / PI, 4) + "° · τ ÷ G" : ""));
			h.push(tile(md === "pin" ? "Area per shear plane" : "Area in shear", isFinite(Ash) ? fmt(Ash, "area") : "–", md === "pin" && isFinite(Ash) ? "π d² ÷ 4 " + fmtO(Ash, "area") : fmtO(Ash, "area")));
			h.push(tile("Safety factor", isFinite(sfa) ? M.pretty(sfa, 3) : "–", (tauY ? "against shear yield ≈ 0.577 × " + fmt(m.sy, "stress") + " = " + fmt(tauY, "stress") : "against shear strength ≈ 0.6 × tensile strength") + " of " + m.short + (md === "area" ? ". A glue is usually far weaker than the metal (epoxy about 15 to 30 MPa in shear): compare τ with the glue's data sheet." : ""), isFinite(sfa) && sfa < 1 ? "mt-bad" : isFinite(sfa) && sfa < 1.5 ? "mt-warn" : ""));
			if (md === "pin" && t > 0 && d > 0 && V >= 0) { var sb = V / (d * t); h.push(tile("Bearing stress on the plate", fmt(sb, "stress"), "V ÷ (d t): the pin pressing on the hole " + fmtO(sb, "stress"))); }
			if (md === "pin" && isFinite(sf) && sf > 0 && V > 0) { var dn = M.pinSize(V, (tauY || 0.6 * m.su) / sf, n); h.push(tile("Pin size for safety factor " + M.sig(sf, 3), fmt(dn, "small"), "smallest diameter " + fmtO(dn, "small"))); res.dNeed = dn; }
		} else {
			if (!(hd > 0)) msg = "Type the hole diameter."; else if (!(t > 0)) msg = "Type the plate thickness.";
			var Ap = PI * hd * t, Fp = tauU * Ap, sp = Fp / (PI * hd * hd / 4);
			res = { F: Fp, A: Ap };
			h.push(tile("Force to punch the hole", isFinite(Fp) ? fmt(Fp, "force") : "–", isFinite(Fp) ? fmtO(Fp, "force") + " (≈ " + M.pretty(Fp / 9806.65, 3) + " tonnes-force)" : "", "tu-stat--hero"));
			h.push(tile("Area sheared", isFinite(Ap) ? fmt(Ap, "area") : "–", "the wall of the hole: π d t"));
			h.push(tile("Shear strength used", fmt(tauU, "stress"), M.sig(num(S.sh.ratio) > 0 ? num(S.sh.ratio) : 0.75, 3) + " × tensile strength of " + m.short));
			h.push(tile("Stress on the punch", isFinite(sp) ? fmt(sp, "stress") : "–", isFinite(sp) && sp > 2000e6 ? "<strong>too high:</strong> a punch thinner than the plate breaks" : "hardened tool steel takes about 2,000 MPa", isFinite(sp) && sp > 2000e6 ? "mt-bad" : ""));
		}
		h.push(tile("G from E and ν", fmt(gG, "modulus", 3), "E ÷ 2(1 + ν) for " + m.short + (matRec().aniso ? " (not isotropic: use the table's G)" : "")));
		$("mt-sh-stats").innerHTML = h.join(""); $("mt-sh-msg").textContent = msg;
		/* what the picture shows: elastic, yielding (past the shear yield) or cut through (past the shear strength, about 0.6 x the tensile strength) */
		var tauUlt = 0.6 * m.su; res.state = !(res.tau > 0) || md === "area" ? "el" : res.tau >= tauUlt ? "break" : tauY && res.tau >= tauY ? "yield" : "el";
		shSliders(md, res, { V: V, d: d, t: t, A: A, hd: hd }, tauUlt, tauY);
		drawShear(md, n, res, { V: V, d: d, t: t, hd: hd });
	}
	$("mt-sh-size").addEventListener("click", function () { var m = mv(), V = fval("sh-V"), sf = num(S.sh.sf); if (!(V > 0) || !(sf > 0)) { toast("Type the force and a safety factor first."); return; } var dn = M.pinSize(V, (m.sy ? 0.577 * m.sy : 0.6 * m.su) / sf, +S.sh.n || 1); setFieldSI("sh-d", dn); shCompute(); toast("Diameter set to " + fmt(dn, "small") + ". Round up to the next standard size."); });
	/* sliders under the shear picture: they write into the boxes (and the boxes move them). While one is dragged the ranges and the drawing scale stay put, so the
	   plates visibly slide, the bolt leans, yields (orange) and is finally cut through as the force goes up. */
	var SHD = { lock: false, k: 1 };
	function shSliders(md, res, v, tauUlt, tauY) {
		var big = S.sys === "us", specs = [];
		function lenS(id, label, val, fb) { return { key: id, label: label, keep: true, min: 0, max: isFinite(val) && val > 0 ? 3 * val : fb, v: val, show: function (x) { return fmt(x, "small"); }, set: function (x) { setFieldSI(id, Math.max(x, 1e-6)); shCompute(); } }; }
		if (md !== "punch") {
			var cap = res.A > 0 && res.planes ? 1.15 * (md === "pin" ? tauUlt : (tauY || tauUlt)) * res.A * res.planes : NaN;
			specs.push({ key: "sh-V", label: "Shear force V", min: 0, max: md === "pin" && isFinite(cap) ? cap : Math.max(isFinite(v.V) ? 2.5 * v.V : 0, big ? 17.8e3 : 20e3), v: v.V, show: function (x) { return fmt(x, "force"); }, set: function (x) { setFieldSI("sh-V", x); shCompute(); } });
			if (md === "pin") specs.push(lenS("sh-d", "Pin / bolt diameter d", v.d, 0.04), lenS("sh-t", "Plate thickness t", v.t, 0.03));
			else specs.push({ key: "sh-A", label: "Area in shear A", keep: true, min: 0, max: isFinite(v.A) && v.A > 0 ? 3 * v.A : 2e-3, v: v.A, show: function (x) { return fmt(x, "area"); }, set: function (x) { setFieldSI("sh-A", Math.max(x, 1e-9)); shCompute(); } });
		} else specs.push(lenS("sh-hd", "Hole diameter d", v.hd, 0.05), lenS("sh-t", "Plate thickness t", v.t, 0.03));
		sliders("mt-sh-sl", specs, { lock: function (on) { SHD.lock = on; }, done: shCompute });
	}
	function drawShear(md, n, res, v) {
		var P = "mt-sh-svg:" + (md === "pin" ? "pin" + n : md) + ":", h = ["<defs>" + MARK.replace("@", "mt-sh-mk") + "</defs>"];
		if (!SHD.lock) SHD.k = exag(res.gam || 0, 0.3); var k = SHD.k;
		var g = clamp((res.gam || 0) * k, 0, 0.9), st = res.state || "el", brk = st === "break";
		var s = md === "punch" ? 0 : clamp(g * 30, 0, 22) + (brk ? 14 : 0), a = -s / 2, b = s / 2;   /* how far the plates have slid (drawn), each half of it */
		var bcls = "mt-bolt" + (st === "yield" ? " mt-bolt--yield" : brk ? " mt-bolt--break" : "");
		function plate(x, y, w, hh, cls) { return "<rect x='" + r1(x) + "' y='" + r1(y) + "' width='" + r1(w) + "' height='" + r1(hh) + "' rx='3' class='" + (cls || "mt-plate") + "'/>"; }
		function arrowH(x1, x2, y) { var d = x2 > x1 ? 1 : -1; return "<path d='M" + r1(x1) + "," + (y - 4) + " L" + r1(x2 - d * 18) + "," + (y - 4) + " L" + r1(x2 - d * 18) + "," + (y - 12) + " L" + r1(x2) + "," + y + " L" + r1(x2 - d * 18) + "," + (y + 12) + " L" + r1(x2 - d * 18) + "," + (y + 4) + " L" + r1(x1) + "," + (y + 4) + " Z' class='mt-farrow'/>"; }
		function poly(pts, cls) { return "<polygon points='" + pts.map(function (q) { return r1(q[0]) + "," + r1(q[1]); }).join(" ") + "' class='" + cls + "'/>"; }
		/* a bolt cut into pieces by the shear planes ys[]; piece i is shifted by off[i]; it leans across each plane (or is cut through when it breaks) */
		function bolt(ys, off, top, bot) {
			var x0 = 244, x1 = 276, out = [], y0 = top + 16, R = [], Lf = [], i, ya, yb;
			out.push(poly([[228 + off[0], top], [292 + off[0], top], [292 + off[0], top + 18], [228 + off[0], top + 18]], bcls));
			for (i = 0; i <= ys.length; i++) {
				ya = i === 0 ? y0 : ys[i - 1] + (brk ? 3 : 5); yb = i === ys.length ? bot : ys[i] - (brk ? 3 : 5);
				if (brk) out.push(poly([[x0 + off[i], ya], [x1 + off[i], ya], [x1 + off[i], yb], [x0 + off[i], yb]], bcls));
				else { R.push([x1 + off[i], ya], [x1 + off[i], yb]); Lf.push([x0 + off[i], ya], [x0 + off[i], yb]); }
			}
			if (!brk) out.push(poly(R.concat(Lf.reverse()), bcls));   /* one shank that leans across each plane */
			var ol = off[off.length - 1]; out.push(poly([[230 + ol, bot - 2], [290 + ol, bot - 2], [290 + ol, bot + 16], [230 + ol, bot + 16]], bcls));
			return out.join("");
		}
		var Vt = isFinite(v.V) ? fmt(v.V, "force") : "V";
		if (md === "pin" && n === 1) {
			h.push(plate(150 + a, 150, 200, 40), plate(170 + b, 190, 200, 40));
			h.push(bolt([190], [a, b], 112, 262));
			h.push(line(220 + a, 190, 300 + b, 190, "mt-shplane"), line(304, 138, 284 + b * 0.3, 186, "mt-lead"));
			h.push(lab(P + "pl", 304, 132, brk ? "cut through here" : "shear plane", "mt-t mt-ts mt-red", "start"));
			h.push(arrowH(146 + a, 46 + a, 170), lab(P + "V", 96, 214, "V = " + Vt, "mt-t mt-b mt-tf", "middle"));
			h.push(arrowH(374 + b, 474 + b, 210), lab(P + "V2", 424, 190, "V", "mt-t mt-b mt-tf", "middle"));
		} else if (md === "pin") {
			h.push(plate(150 + a, 136, 200, 30), plate(150 + a, 214, 200, 30), plate(170 + b, 166, 200, 48));
			h.push(bolt([166, 214], [a, b, a], 98, 276));
			h.push(line(220 + a, 166, 300 + b, 166, "mt-shplane"), line(220 + a, 214, 300 + b, 214, "mt-shplane"), line(304, 124, 284 + b * 0.3, 162, "mt-lead"));
			h.push(lab(P + "pl", 304, 118, brk ? "cut through at both planes" : "two shear planes", "mt-t mt-ts mt-red", "start"));
			h.push(arrowH(146 + a, 46 + a, 151), lab(P + "V1", 96, 131, "V/2", "mt-t mt-b mt-tf", "middle"));
			h.push(arrowH(146 + a, 46 + a, 229), lab(P + "V3", 96, 266, "V/2", "mt-t mt-b mt-tf", "middle"));
			h.push(arrowH(374 + b, 474 + b, 190), lab(P + "V", 424, 228, "V = " + Vt, "mt-t mt-b mt-tf", "middle"));
		} else if (md === "area") {
			h.push(plate(120 + a, 150, 220, 36), poly([[180 + a, 186], [340 + a, 186], [340 + b, 195], [180 + b, 195]], "mt-glue"), plate(180 + b, 195, 220, 36));
			h.push(lab(P + "A", 260, 262, "glued or welded area A", "mt-t mt-ts mt-red", "middle"));
			h.push(arrowH(116 + a, 30 + a, 168), lab(P + "V", 73, 212, "V = " + Vt, "mt-t mt-b mt-tf", "middle"));
			h.push(arrowH(404 + b, 500 + b, 213), lab(P + "V2", 452, 192, "V", "mt-t mt-b mt-tf", "middle"));
		} else {
			h.push(plate(50, 176, 420, 34), "<rect x='50' y='210' width='170' height='56' class='mt-die'/><rect x='300' y='210' width='170' height='56' class='mt-die'/>");
			h.push("<rect x='222' y='52' width='76' height='124' rx='3' class='mt-bolt'/>", line(222, 176, 222, 210, "mt-shplane"), line(298, 176, 298, 210, "mt-shplane"));
			h.push("<path d='M260,8 L260,36 M250,26 L260,40 L270,26' class='mt-pull mt-pullr'/>", lab(P + "F", 278, 30, "punch force F", "mt-t mt-b mt-tf", "start"), lab(P + "pu", 310, 120, "punch", "mt-t mt-ts", "start"), lab(P + "pl", 474, 164, "plate", "mt-t mt-ts", "end"));
			h.push(lab(P + "w", 260, 296, "the wall of the hole (π d t) is sheared", "mt-t mt-ts mt-red", "middle"), lab(P + "d1", 135, 244, "die", "mt-t mt-ts", "middle"), lab(P + "d2", 385, 244, "die", "mt-t mt-ts", "middle"));
			if (isFinite(res.F)) h.push(lab(P + "Fv", 260, 344, "F = τu π d t = " + fmt(res.F, "force"), "mt-t mt-b mt-red", "middle"), lab(P + "Fa", 260, 370, "sheared area π d t = " + fmt(res.A, "area"), "mt-t mt-ts", "middle"));
		}
		if (md !== "punch") {
			var gx = 60, gy = 318, sz = 64, off = sz * Math.tan(g);
			h.push("<rect x='" + gx + "' y='" + gy + "' width='" + sz + "' height='" + sz + "' class='mt-ghost'/>", poly([[gx, gy + sz], [gx + sz, gy + sz], [gx + sz + off, gy], [gx + off, gy]], "mt-elem"));
			h.push(lab(P + "g1", 232, gy + 24, "shear strain γ", "mt-t mt-ts mt-b", "start"), lab(P + "g2", 232, gy + 48, "the square slants (angle ×" + kTxt(k) + ")", "mt-t mt-ts", "start"));
			if (st !== "el") h.push(lab(P + "st", 232, gy + 72, brk ? "past the shear strength: cut through" : "past the shear yield: bent for good", "mt-t mt-ts mt-b mt-red", "start"));
		}
		if (md !== "punch" && isFinite(res.tau)) h.push(lab(P + "tau", 506, 34, "τ = V/" + (res.planes === 2 ? "2A" : "A") + " = " + fmt(res.tau, "stress"), "mt-t mt-b mt-red", "end"), lab(P + "gam", 506, 58, "γ = τ/G" + (isFinite(res.gam) ? " = " + M.pretty(res.gam, 3) + " rad" : ""), "mt-t mt-ts", "end"));
		$("mt-sh-svg").innerHTML = h.join("");
		$("mt-sh-cap").textContent = (md === "pin" ? (n === 2 ? "Double shear: the pin is cut across in two places, so each plane carries half the force." : "Single shear: the bolt would be cut across at the one plane where the plates meet.") : md === "area" ? "Lap joint: the glue or weld area slides in shear." : "Punching: the punch shears a ring of metal (the wall of the hole) out of the plate.") + (md === "pin" ? " Drag the force slider: the plates slide (drawn larger than real) and the bolt leans, yields and is finally cut." : md === "area" ? " Drag the force slider: the joint slides (drawn larger than real)." : "");
	}
	chipRow("mt-sh-ex", [
		["M10 bolt, single shear, 10 kN", function () { S.sh.mode = "pin"; S.sh.n = "1"; paintSeg("mt-sh-mode", "pin"); paintSeg("mt-sh-n", "1"); setField("sh-V", 10, "kN"); setField("sh-d", 10, "mm"); setField("sh-t", 6, "mm"); setMat("s4140", true); shCompute(); }],
		["Clevis pin, double shear, 30 kN", function () { S.sh.mode = "pin"; S.sh.n = "2"; paintSeg("mt-sh-mode", "pin"); paintSeg("mt-sh-n", "2"); setField("sh-V", 30, "kN"); setField("sh-d", 16, "mm"); setField("sh-t", 12, "mm"); setMat("a36", true); shCompute(); }],
		["Punch a 20 mm hole in 3 mm steel", function () { S.sh.mode = "punch"; paintSeg("mt-sh-mode", "punch"); setField("sh-hd", 20, "mm"); setField("sh-t", 3, "mm"); $("mt-sh-ratio").value = "0.75"; S.sh.ratio = "0.75"; setMat("a36", true); shCompute(); }],
		["Glued lap joint, 2 kN on 25 × 20 mm", function () { S.sh.mode = "area"; paintSeg("mt-sh-mode", "area"); setField("sh-V", 2, "kN"); setField("sh-A", 500, "mm²"); shCompute(); }]
	], function (fn) { fn(); matNote(); });
	/* material-backed field: typed value wins, else the material's */
	function mfield(id, si) { var f = FL[id]; if (typed(id) && isFinite(fval(f))) { stat(f, "typed", "your value"); return fval(f); } if (si == null || !isFinite(si)) { fshow(f, NaN); stat(f, "miss", "not in the table"); return NaN; } fshow(f, si); stat(f, "mat", "from " + mv().short); return si; }

	/* =========================== 4. TORSION =========================== */
	var TOD = { lock: false, Tmax: 0 };
	seg("mt-to-src", function () { return S.to.src; }, function (v) { S.to.src = v; toCompute(); });
	seg("mt-to-hol", function () { return S.to.hol; }, function (v) { S.to.hol = v; toCompute(); });
	$("mt-to-sf").value = S.to.sf; $("mt-to-sf").addEventListener("input", function () { S.to.sf = this.value; save(); toCompute(); });
	function toTorque() { var w = fval("to-n"); if (S.to.src === "P") { var P = fval("to-P"); return w > 0 ? M.torqueFromPower(P, w) : NaN; } return fval("to-T"); }
	function toCompute() {
		var m = mv(), hol = S.to.hol === "1", h = [], msg = "";
		modeVis("torsion", function (a) { return a.indexOf(S.to.src) >= 0 || (a.indexOf("hollow") >= 0 && hol); });
		var G = mfield("to-G", m.G), T = toTorque(), D = fval("to-D"), di = hol ? fval("to-di") : 0, L = fval("to-L"), w = fval("to-n"), sf = num(S.to.sf);
		if (S.to.src === "P" && !(w > 0)) msg = "Type the speed to turn power into torque."; else if (!isFinite(T)) msg = "Type the torque."; else if (!(D > 0)) msg = "Type the shaft diameter."; else if (hol && !(di >= 0 && di < D)) msg = "The inside diameter must be smaller than the outside.";
		var ok = isFinite(T) && D > 0 && (!hol || (di >= 0 && di < D)), r = ok ? M.torsion(Math.abs(T), D, hol ? di : 0, L, G) : null;
		var tauY = m.sy ? 0.577 * m.sy : 0.6 * m.su;
		if (r) {
			var sfa = tauY / r.tau;
			h.push(tile("Max shear stress τmax", fmt(r.tau, "stress"), "at the outside surface " + fmtO(r.tau, "stress"), "tu-stat--hero"));
			h.push(tile("Angle of twist θ", isFinite(r.theta) ? M.pretty(r.theta * 180 / PI, 4) + "°" : "–", isFinite(r.theta) ? M.pretty(r.theta, 4) + " rad" + (L > 0 ? " · " + M.pretty(r.theta * 180 / PI / M.fromSI("len", L, U("len")), 3) + "° per " + U("len") : "") : "type the length"));
			h.push(tile("Safety factor", M.pretty(sfa, 3), (m.sy ? "against shear yield ≈ 0.577 × " : "against shear strength ≈ 0.6 × ") + fmt(m.sy || m.su, "stress") + " of " + m.short, sfa < 1 ? "mt-bad" : sfa < 1.5 ? "mt-warn" : ""));
			h.push(tile("Polar moment J", fmtIn(r.J, "inertia", null, 4), hol ? "π (D⁴ − d⁴) ÷ 32" : "π D⁴ ÷ 32"));
			if (hol) h.push(tile("Stress at the inside", fmt(r.tauIn, "stress"), "τ grows straight out from the middle"));
			h.push(tile("Shear strain γmax", M.pretty(r.gamma, 4) + " rad", "τmax ÷ G"));
			if (w > 0) { var P = Math.abs(T) * w; h.push(tile(S.to.src === "P" ? "Torque from the power" : "Power at this speed", S.to.src === "P" ? fmt(Math.abs(T), "torque") : fmt(P, "power"), S.to.src === "P" ? "T = P ÷ ω " + fmtO(Math.abs(T), "torque") : "P = T ω " + fmtO(P, "power"))); }
			if (sf > 0) { var Dn = M.shaftSize(T, tauY / sf, hol && D > 0 ? di / D : 0); h.push(tile("Shaft size for safety factor " + M.sig(sf, 3), fmt(Dn, "small"), hol ? "outside diameter, same d/D ratio" : "solid shaft diameter")); }
		}
		$("mt-to-stats").innerHTML = h.join(""); $("mt-to-msg").textContent = msg;
		var Tm = TOD.lock ? TOD.Tmax : (D > 0 ? 1.6 * tauY * M.torsion(1, D, hol ? di : 0, 1, 1).J / (D / 2) : 2 * Math.abs(T || 1)); TOD.TmaxNow = Tm;
		if (!TOD.lock && isFinite(T) && Tm > 0) $("mt-to-ts").value = String(Math.round(clamp(Math.abs(T) / Tm, 0, 1) * 1000));
		$("mt-to-tsv").textContent = isFinite(T) ? fmt(Math.abs(T), "torque") : "–";
		drawTorsion(r, hol, D, di, m, tauY);
	}
	function drawTorsion(r, hol, D, di, m, tauY) {
		var h = [], x1 = 70, x2 = 400, yc = 150, R = 52, ex = 16, th = r && isFinite(r.theta) ? r.theta : 0;
		if (!TOD.lock) TOD.k = exag(th, 0.9); var k = TOD.k, tk = clamp(th * k, 0, PI * 0.9);
		var over = r && r.tau > tauY;
		h.push("<rect x='30' y='70' width='40' height='160' class='mt-sup'/>"); for (var i = 0; i < 9; i++) h.push(line(30, 78 + i * 18, 14, 90 + i * 18, "mt-hatch"));
		h.push("<rect x='" + x1 + "' y='" + (yc - R) + "' width='" + (x2 - x1) + "' height='" + 2 * R + "' class='mt-shaft" + (over ? " mt-shaft--over" : "") + "'/>");
		h.push("<ellipse cx='" + x2 + "' cy='" + yc + "' rx='" + ex + "' ry='" + R + "' class='mt-shaftend" + (over ? " mt-shaft--over" : "") + "'/>");
		if (hol && D > 0) h.push("<ellipse cx='" + x2 + "' cy='" + yc + "' rx='" + r1(ex * di / D) + "' ry='" + r1(R * di / D) + "' class='mt-hole'/>");
		[-60, -20, 20, 60].forEach(function (deg) {
			var p = []; for (var j = 0; j <= 30; j++) { var u = j / 30, ph = deg * PI / 180 + tk * u; if (Math.cos(ph) < 0) { p.push(null); continue; } p.push([x1 + (x2 - x1) * u, yc - R * Math.sin(ph)]); }
			var seg2 = [], cur = []; p.forEach(function (q) { if (q) cur.push(q); else if (cur.length) { seg2.push(cur); cur = []; } }); if (cur.length) seg2.push(cur);
			seg2.forEach(function (sg) { if (sg.length > 1) h.push("<polyline points='" + sg.map(function (q) { return r1(q[0]) + "," + r1(q[1]); }).join(" ") + "' class='mt-twl'/>"); });
		});
		var a0 = -PI / 2, a1 = a0 + tk; h.push(line(x2, yc, x2 + ex * 0.0, yc - R, "mt-ghostl"), line(x2, yc, r1(x2 + ex * Math.sin(tk)), r1(yc - R * Math.cos(tk)), "mt-twr"));
		h.push("<path d='M" + (x2 + 30) + "," + (yc - R - 18) + " A40,70 0 0 1 " + (x2 + 30) + "," + (yc + R + 18) + "' class='mt-tq'/><path d='M" + (x2 + 18) + "," + (yc + R + 10) + " L" + (x2 + 30) + "," + (yc + R + 22) + " L" + (x2 + 40) + "," + (yc + R + 6) + "' class='mt-tq'/>");
		h.push(lab("mt-to-svg:n1", x2 + 82, yc + 10, "T", "mt-t mt-b mt-tf mt-tbig", "start"));
		h.push(lab("mt-to-svg:n2", (x1 + x2) / 2, yc + R + 30, th > 0 ? "twist drawn ×" + kTxt(k) + " (θ = " + M.pretty(th * 180 / PI, 3) + "°)" : "type the length and G to see the twist", "mt-t mt-ts", "middle"));
		/* stress across the shaft: grows straight out from the middle (only in the wall of a hollow shaft) */
		var bx = 110, bw = 280, by = 312, bh = 46, ri = hol && D > 0 ? di / D : 0, mx = function (xr) { return bx + bw * (xr + 1) / 2; };
		h.push(line(bx - 12, by, bx + bw + 12, by, "mt-axis"), lab("mt-to-svg:n3", bx + bw / 2, by + bh + 34, "Shear stress across the shaft", "mt-t mt-ts", "middle"));
		h.push("<polygon points='" + r1(mx(ri)) + "," + by + " " + r1(mx(ri)) + "," + r1(by - bh * ri) + " " + r1(mx(1)) + "," + r1(by - bh) + " " + r1(mx(1)) + "," + by + "' class='mt-tdistf'/>", "<polygon points='" + r1(mx(-ri)) + "," + by + " " + r1(mx(-ri)) + "," + r1(by + bh * ri) + " " + r1(mx(-1)) + "," + r1(by + bh) + " " + r1(mx(-1)) + "," + by + "' class='mt-tdistf'/>");
		if (ri > 0) h.push(line(mx(ri), by, mx(ri), by - bh * ri, "mt-tdist"), line(mx(-ri), by, mx(-ri), by + bh * ri, "mt-tdist"));
		h.push(line(mx(ri), by - bh * ri, mx(1), by - bh, "mt-tdist"), line(mx(-ri), by + bh * ri, mx(-1), by + bh, "mt-tdist"));
		for (var a = -1; a <= 1.0001; a += 0.2) if (Math.abs(a) >= ri - 1e-9 && Math.abs(a) > 0.05) h.push(line(mx(a), by, mx(a), by - bh * a, "mt-tdistl"));
		h.push(lab("mt-to-svg:n4", bx - 16, by + 5, "surface", "mt-t mt-ts", "end"), lab("mt-to-svg:n5", bx + bw + 16, by + 5, "surface", "mt-t mt-ts", "start"), lab("mt-to-svg:n6", mx(0) - 8, by - 8, ri > 0 ? "hole" : "middle: 0", "mt-t mt-ts", "end"));
		if (r) h.push(lab("mt-to-svg:n7", mx(1) + 8, by - bh + 5, "τmax " + fmt(r.tau, "stress", 3), "mt-t mt-ts mt-b", "start"));
		$("mt-to-svg").innerHTML = h.join("");
		$("mt-to-cap").textContent = !r ? "" : over ? "Above the shear yield strength: the shaft would stay twisted (and could fail)." : "Elastic: the twist goes away when the torque is removed. A hollow shaft saves weight because the middle of a solid shaft carries little stress.";
	}
	(function () { var sl = $("mt-to-ts"); sl.addEventListener("input", function () { if (!TOD.lock) { TOD.lock = true; TOD.Tmax = TOD.TmaxNow; } var T = TOD.Tmax * (+sl.value) / 1000; if (S.to.src === "P") { S.to.src = "T"; paintSeg("mt-to-src", "T"); } setFieldSI("to-T", T); toCompute(); }); sl.addEventListener("change", function () { TOD.lock = false; toCompute(); }); })();
	$("mt-to-size").addEventListener("click", function () { var m = mv(), T = toTorque(), sf = num(S.to.sf), hol = S.to.hol === "1", D = fval("to-D"), di = fval("to-di"); if (!isFinite(T) || !(sf > 0)) { toast("Type the torque (or power and speed) and a safety factor first."); return; } var tauY = m.sy ? 0.577 * m.sy : 0.6 * m.su, ratio = hol && D > 0 && di > 0 ? di / D : 0, Dn = M.shaftSize(T, tauY / sf, ratio); setFieldSI("to-D", Dn); if (hol && ratio > 0) setFieldSI("to-di", Dn * ratio); toCompute(); toast("Diameter set to " + fmt(Dn, "small") + ". Round up to a standard size."); });
	chipRow("mt-to-ex", [
		["Motor shaft: 7.5 kW at 1450 rpm", function () { S.to.src = "P"; S.to.hol = "0"; paintSeg("mt-to-src", "P"); paintSeg("mt-to-hol", "0"); setField("to-P", 7.5, "kW"); setField("to-n", 1450, "rpm"); setField("to-D", 30, "mm"); setField("to-L", 0.5, "m"); setMat("s1020", true); toCompute(); }],
		["Hollow drive shaft, 1.5 kN·m", function () { S.to.src = "T"; S.to.hol = "1"; paintSeg("mt-to-src", "T"); paintSeg("mt-to-hol", "1"); setField("to-T", 1500, "N·m"); FL["to-n"].inp.value = ""; setT(FL["to-n"], ""); setField("to-D", 60, "mm"); setField("to-di", 52, "mm"); setField("to-L", 1.4, "m"); setMat("s4140", true); toCompute(); }],
		["50 mm solid shaft, 1 kN·m", function () { S.to.src = "T"; S.to.hol = "0"; paintSeg("mt-to-src", "T"); paintSeg("mt-to-hol", "0"); setField("to-T", 1000, "N·m"); FL["to-n"].inp.value = ""; setT(FL["to-n"], ""); setField("to-D", 50, "mm"); setField("to-L", 1, "m"); toCompute(); }]
	], function (fn) { fn(); matNote(); });

	/* =========================== 5. POISSON / 3D HOOKE / CONSTANTS =========================== */
	seg("mt-po-mode", function () { return S.po.mode; }, function (v) { S.po.mode = v; poCompute(); });
	seg("mt-po-by", function () { return S.po.by; }, function (v) { S.po.by = v; poCompute(); });
	seg("mt-p3-dir", function () { return S.po.dir; }, function (v) { S.po.dir = v; poCompute(); });
	$("mt-ec-pair").value = S.po.pair; $("mt-ec-pair").addEventListener("change", function () { S.po.pair = this.value; save(); poCompute(); });
	function poCompute() {
		var md = S.po.mode;
		[].forEach.call(root.querySelectorAll("[data-panel='poisson'] [data-pm]"), function (el) { el.hidden = el.getAttribute("data-pm") !== md; });
		if (md === "bar") poBar(); else if (md === "3d") po3d(); else poConst();
	}
	function poBar() {
		var m = mv(), E = mfield("po-E", m.E), nu = mfield("po-nu", m.nu), by = S.po.by, d = fval("po-d"), L = fval("po-L"), h = [], msg = "";
		FL["po-s"].div.hidden = by !== "s"; FL["po-e"].div.hidden = by !== "e";
		var s = by === "s" ? fval("po-s") : NaN, e = by === "e" ? fval("po-e") : NaN;
		if (by === "s") e = E > 0 ? s / E : NaN; else s = E * e;
		if (!(nu > -1 && nu < 0.5)) msg = "Poisson's ratio must be between −1 and 0.5.";
		else if (!isFinite(e)) msg = by === "s" ? "Type the stress and Young's modulus." : "Type the strain.";
		var r = isFinite(e) && d > 0 && L > 0 && !msg ? M.poissonBar(e, nu, d, L) : null;
		if (r) {
			h.push(tile("Lateral strain εlat", M.pretty(r.lat, 4), "= −ν ε · " + M.pretty(r.lat * 1e6, 4) + " µε", "tu-stat--hero"));
			h.push(tile("Change in diameter Δd", fmt(r.dd, "small"), (r.dd < 0 ? "thinner" : "thicker") + ": " + fmt(d, "small", 7) + " → " + fmt(r.d1, "small", 7)));
			h.push(tile("Change in length ΔL", fmt(r.dL, "small"), fmt(L, "len") + " → " + fmt(r.L1, "len", 7)));
			var V0 = PI * d * d / 4 * L, dV = r.vol * V0;
			h.push(tile("Change in volume", M.pretty(r.vol * 100, 4) + "%", "ΔV = " + (S.sys === "us" ? M.pretty(dV / Math.pow(0.0254, 3), 4) + " in³" : M.pretty(dV * 1e9, 4) + " mm³") + " · about ε (1 − 2ν)"));
			h.push(tile("Bulk modulus K", nu < 0.5 ? fmt(M.kFrom(E, nu), "modulus", 4) : "–", "E ÷ 3(1 − 2ν): resistance to squeezing"));
			h.push(tile("Shear modulus G", fmt(M.gFrom(E, nu), "modulus", 4), "E ÷ 2(1 + ν)"));
			if (m.sy && Math.abs(s) > m.sy) msg = "Past the yield strength of " + m.short + ": in the plastic range ν is about 0.5 (the volume stays the same), not the elastic value.";
			else if (m.sy == null && Math.abs(s) > m.su) msg = "Above the tensile strength of " + m.short + ".";
		}
		$("mt-po-stats").innerHTML = h.join(""); $("mt-po-msg").textContent = msg;
		/* sliders: the load (stress or strain) and ν; their ranges stay put while one is dragged */
		var R = 1.25 * (m.sy || m.su), Re = E > 0 ? R / E : 0.005;
		sliders("mt-po-sl", [
			by === "s" ? { key: "s", label: "Axial stress σ", min: -R, max: R, v: s, show: function (v) { return fmt(v, "stress"); }, set: function (v) { setFieldSI("po-s", v); poCompute(); } }
				: { key: "e", label: "Axial strain ε", min: -Re, max: Re, v: e, show: function (v) { return M.pretty(v * 1e6, 3) + " µε"; }, set: function (v) { setFieldSI("po-e", v); poCompute(); } },
			{ key: "nu", label: "Poisson's ratio ν", min: 0, max: 0.5, v: nu, show: function (v) { return M.sig(v, 3); }, set: function (v) { setField("po-nu", Math.round(v * 1000) / 1000, "mm/mm"); poCompute(); } }
		]);
		var svg = $("mt-po-svg"), g = [], ee = isFinite(e) ? e : 0;
		if (!PO.lock) PO.k = exag(ee, 0.18);
		var k = PO.k, de = clamp(ee * k, -0.4, 0.25), ld = clamp(-(isFinite(nu) ? nu : 0) * de, -0.6, 0.6), x1 = 50, w0 = 330, h0 = 90, yc = 160;
		PO.g = { x1: x1, w0: w0, E: E, by: by };
		g.push("<defs>" + MARK.replace("@", "mt-po-mk") + "<linearGradient id='mt-po-gr' x1='0' x2='0' y1='0' y2='1'><stop offset='0' class='mt-g1'/><stop offset='0.42' class='mt-g2'/><stop offset='1' class='mt-g3'/></linearGradient></defs>");
		g.push("<rect x='" + x1 + "' y='" + (yc - h0 / 2) + "' width='" + w0 + "' height='" + h0 + "' class='mt-ghost'/>");
		var w1 = w0 * (1 + de), h1 = h0 * (1 + ld), xe = x1 + w1;
		g.push("<rect x='" + x1 + "' y='" + r1(yc - h1 / 2) + "' width='" + r1(w1) + "' height='" + r1(h1) + "' class='mt-rod' fill='url(#mt-po-gr)'/>");
		var dirT = ee >= 0;
		if (Math.abs(ee) > 0) g.push(arrowSimple(xe + (dirT ? 22 : 62), yc, xe + (dirT ? 62 : 22), yc), arrowSimple(x1 - (dirT ? 6 : 46), yc, x1 - (dirT ? 46 : 6), yc));
		/* original and new length, original and new diameter */
		var P = "mt-po-svg:";
		g.push(line(x1, yc - h0 / 2 - 6, x1, 62, "mt-ext"), line(x1 + w0, yc - h0 / 2 - 6, x1 + w0, 62, "mt-ext"), dimH(68, x1, x1 + w0, "mt-po-mk"), lab(P + "L0", x1 + w0 / 2, 56, "L₀ = " + (L > 0 ? fmt(L, "len") : "?"), "mt-t mt-ts", "middle"));
		if (Math.abs(de) > 0.004) g.push(line(xe, yc + h1 / 2 + 4, xe, 262, "mt-ext"), line(x1, yc + Math.max(h0, h1) / 2 + 4, x1, 262, "mt-ext"), dimH(256, x1, xe, "mt-po-mk"), lab(P + "L", x1 + w1 / 2, 282, "L = " + (r ? fmt(r.L1, "len", 7) : "?"), "mt-t mt-ts", "middle"));
		/* the diameter: a dimension line inside the bar with only "d" beside it; the numbers sit under the picture, never on the bar */
		var xd = x1 + 34;
		g.push(dimV(xd, yc - h1 / 2, yc + h1 / 2, "mt-po-mk"), lab(P + "d", xd + 10, yc + 7, "d", "mt-t mt-b", "start"));
		g.push(lab(P + "dd", 260, 318, "d₀ = " + (d > 0 ? fmt(d, "small") : "?") + "  →  d = " + (r ? fmt(r.d1, "small", 6) : "?"), "mt-t mt-ts mt-b", "middle"));
		if (r) g.push(lab(P + "lat", 260, 342, "εlat = −ν ε = " + M.pretty(r.lat, 3), "mt-t mt-ts", "middle"));
		/* the handle: drag the right end of the bar */
		g.push("<g class='mt-dragx' data-drag='po' tabindex='-1'><circle cx='" + r1(xe) + "' cy='" + yc + "' r='13' class='mt-handle'/><path d='M" + r1(xe - 4) + "," + (yc - 5) + " l-5,5 l5,5 M" + r1(xe + 4) + "," + (yc - 5) + " l5,5 l-5,5' class='mt-hgrip'/></g>");
		g.push(lab(P + "note", 260, 370, "Dashed: before loading" + (k > 1 ? " (drawn " + kTxt(k) + "× larger)" : "") + ". Drag the right end.", "mt-t mt-ts", "middle"));
		svg.innerHTML = g.join("");
		$("mt-po-cap").textContent = isFinite(nu) ? (nu > 0.45 ? "ν close to 0.5: the volume hardly changes (rubber, or any metal once it yields)." : ee < 0 ? "Pushed shorter, the bar gets fatter by ν times the squash strain." : "Pulled longer, the bar gets thinner by ν times the stretch strain.") : "";
	}
	var PO = { lock: false, k: 1, drag: false, g: null }, P3 = { lock: false, k: 1, kg: 1 };
	(function () {
		var svg = $("mt-po-svg");
		function to(ev) {
			var g = PO.g; if (!g) return; var p = svgPt(svg, ev), de = clamp((p.x - g.x1) / g.w0 - 1, -0.4, 0.25), e = de / PO.k;
			if (g.by === "s") setFieldSI("po-s", e * g.E); else setFieldSI("po-e", e); poCompute();
		}
		svg.addEventListener("pointerdown", function (ev) { if (!ev.target.closest("[data-drag]")) return; ev.preventDefault(); PO.drag = PO.lock = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } to(ev); });
		svg.addEventListener("pointermove", function (ev) { if (PO.drag) to(ev); });
		function end() { if (!PO.drag) return; PO.drag = PO.lock = false; poCompute(); }
		svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
	})();
	/* a set of sliders under a figure: spec = {key, label, min, max, v (SI), show(v), set(v)}. Built once per set of keys; while one is dragged the
	   ranges and the figure's exaggeration stay fixed (the box's lock), so the picture does not jump. */
	function sliders(boxId, specs, opt) {
		var box = $(boxId), sig = specs.map(function (o) { return o.key; }).join(",");
		box._opt = opt || { lock: function (on) { PO.lock = P3.lock = on; }, done: poCompute };   /* lock(on): freeze the drawing scale while dragging; done(): redraw after */
		if (box._sig !== sig) {
			box._sig = sig;
			box.innerHTML = specs.map(function (o, i) { return "<div class='mt-slide'><label for='" + boxId + "-" + i + "'>" + sym(subH(esc(o.label))) + "</label><input type='range' id='" + boxId + "-" + i + "' min='0' max='1000' step='1'><output for='" + boxId + "-" + i + "'></output></div>"; }).join("");
			[].forEach.call(box.querySelectorAll("input"), function (inp, i) {
				inp.addEventListener("input", function () { if (!box._lock) { box._lock = box._specs.map(function (o) { return [o.min, o.max]; }); box._opt.lock(true); } var o = box._specs[i], r = box._lock[i]; o.set(r[0] + (r[1] - r[0]) * (+inp.value) / 1000); });
				inp.addEventListener("change", function () { box._lock = null; box._opt.lock(false); box._opt.done(); });
			});
		}
		box._specs = specs;
		specs.forEach(function (o, i) {
			if (o.keep && !box._lock) {   /* keep: the range stays where it was while the value is inside it (so a thumb does not jump back to the middle after every drag) */
				var kr = (box._kr = box._kr || {})[o.key];
				if (kr && isFinite(o.v) && o.v >= kr[0] && o.v <= kr[1] && kr[1] > kr[0] && o.v > kr[1] * 0.04) { o.min = kr[0]; o.max = kr[1]; }
				box._kr[o.key] = [o.min, o.max];
			}
			var inp = box.querySelector("#" + boxId + "-" + i), out = inp.nextElementSibling, r = box._lock ? box._lock[i] : [o.min, o.max];
			if (!box._lock && isFinite(o.v)) { if (o.v < o.min) r[0] = o.min = o.v; if (o.v > o.max) r[1] = o.max = o.v; }
			if (isFinite(o.v) && r[1] > r[0] && document.activeElement !== inp) inp.value = String(Math.round(clamp((o.v - r[0]) / (r[1] - r[0]), 0, 1) * 1000));
			out.textContent = isFinite(o.v) ? o.show(o.v) : "–";
		});
	}
	function arrowSimple(x1, y1, x2, y2) { var a = Math.atan2(y2 - y1, x2 - x1), hl = 12; return "<line x1='" + r1(x1) + "' y1='" + r1(y1) + "' x2='" + r1(x2 - Math.cos(a) * hl * 0.6) + "' y2='" + r1(y2 - Math.sin(a) * hl * 0.6) + "' class='mt-farl'/><path d='M" + r1(x2) + "," + r1(y2) + " L" + r1(x2 - hl * Math.cos(a - 0.45)) + "," + r1(y2 - hl * Math.sin(a - 0.45)) + " L" + r1(x2 - hl * Math.cos(a + 0.45)) + "," + r1(y2 - hl * Math.sin(a + 0.45)) + " Z' class='mt-farrow'/>"; }
	var P3S = ["p3-sx", "p3-sy", "p3-sz", "p3-txy", "p3-tyz", "p3-tzx"], P3E = ["p3-ex", "p3-ey", "p3-ez", "p3-gxy", "p3-gyz", "p3-gzx"], P3N = ["x", "y", "z", "xy", "yz", "zx"];
	function po3d() {
		var m = mv(), E = mfield("p3-E", m.E), nu = mfield("p3-nu", m.nu), dir = S.po.dir, msg = "", out = "";
		[].forEach.call(root.querySelectorAll("[data-d3]"), function (el) { el.hidden = el.getAttribute("data-d3") !== dir; });
		var src = (dir === "s" ? P3S : P3E).map(function (id) { var v = fval(id); return isFinite(v) ? v : (FL[id].inp.value.trim() === "" ? 0 : NaN); });
		if (src.some(function (v) { return !isFinite(v); })) msg = "One of the boxes is not a number.";
		else if (!(E > 0) || !(nu > -1 && nu < 0.5)) msg = "Young's modulus must be above zero and Poisson's ratio between −1 and 0.5.";
		var sig, eps, G = E / (2 * (1 + nu));
		if (!msg) {
			if (dir === "s") { var r = M.hooke(src, E, nu); sig = src; eps = r.eps; } else { var q = M.hookeInv(src, E, nu); sig = q.sig; eps = src; }
			var vol = eps[0] + eps[1] + eps[2], mean = (sig[0] + sig[1] + sig[2]) / 3;
			var rows = P3N.map(function (n, i) { return "<tr" + (i === 3 ? " class='mt-trsep'" : "") + "><td>" + subH((i < 3 ? "ε" : "γ") + n) + "</td><td>" + M.pretty(eps[i], 4) + "</td><td>" + M.pretty(eps[i] * 1e6, 4) + " µε</td><td>" + subH((i < 3 ? "σ" : "τ") + n) + " = " + fmt(sig[i], "stress") + "</td></tr>"; });
			out = "<thead><tr><th>Strain</th><th>Value</th><th>Micro-strain</th><th>Stress</th></tr></thead><tbody>" + rows.join("") + "<tr class='is-active'><td>Volume change ΔV/V</td><td>" + M.pretty(vol, 4) + "</td><td>" + M.pretty(vol * 1e6, 4) + " µε</td><td>mean stress " + fmt(mean, "stress") + "</td></tr></tbody>";
			var vm = Math.sqrt(0.5 * (Math.pow(sig[0] - sig[1], 2) + Math.pow(sig[1] - sig[2], 2) + Math.pow(sig[2] - sig[0], 2)) + 3 * (sig[3] * sig[3] + sig[4] * sig[4] + sig[5] * sig[5]));
			if (m.sy) msg = "Von Mises stress " + fmt(vm, "stress") + (vm > m.sy ? ": above the yield strength of " + m.short + ", so these elastic formulas no longer hold." : ": below the yield strength of " + m.short + " (" + fmt(m.sy, "stress") + "), so the material is still elastic.");
		}
		$("mt-p3-out").innerHTML = out; $("mt-p3-msg").textContent = msg;
		var R = 1.25 * (m.sy || m.su), Re = E > 0 ? R / E : 0.002, ids = dir === "s" ? P3S : P3E;
		sliders("mt-p3-sl", ids.map(function (id, i) {
			var v = dir === "s" ? (sig ? sig[i] : NaN) : (eps ? eps[i] : NaN), shear = i >= 3, f = shear ? (dir === "s" ? 0.6 : 1.5) : 1;
			return { key: id, label: (dir === "s" ? (shear ? "τ" : "σ") : (shear ? "γ" : "ε")) + P3N[i], min: -(dir === "s" ? R : Re) * f, max: (dir === "s" ? R : Re) * f, v: v,
				show: function (x) { return dir === "s" ? fmt(x, "stress") : M.pretty(x * 1e6, 3) + " µε"; }, set: function (x) { setFieldSI(id, x); poCompute(); } };
		}));
		drawCube(sig, eps);
	}
	function drawCube(sig, eps) {
		var svg = $("mt-p3-svg"), h = ["<defs>" + MARK.replace("@", "mt-p3-mk") + "</defs>"], s = 140, ox = 150, oy = 300, dx = 72, dy = -56, ab = [1, 1, 1], gs = [0, 0, 0];
		var mx = 0, mg = 0; if (eps) for (var i = 0; i < 3; i++) { mx = Math.max(mx, Math.abs(eps[i])); mg = Math.max(mg, Math.abs(eps[i + 3])); }
		if (!P3.lock) { P3.k = exag(mx, 0.15); P3.kg = exag(mg, 0.3); } var k = P3.k, kg = P3.kg;
		if (eps) gs = [clamp(eps[3] * kg, -0.5, 0.5), clamp(eps[4] * kg, -0.5, 0.5), clamp(eps[5] * kg, -0.5, 0.5)];
		/* small-strain shape: x' = x + γxy y/2 + γzx z/2, y' = y + γxy x/2 + γyz z/2, z' = z + γyz y/2 + γzx x/2, then the oblique projection */
		function Pg(x, y, z, g) { var X = x + g[0] * y / 2 + g[2] * z / 2, Y = y + g[0] * x / 2 + g[1] * z / 2, Z = z + g[1] * y / 2 + g[2] * x / 2; return [ox + X * s + Z * dx, oy - Y * s + Z * dy]; }
		function face(pts, cls) { return "<polygon points='" + pts.map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" ") + "' class='" + cls + "'/>"; }
		function cube(a, b, c, cls, g) { function P(x, y, z) { return Pg(x, y, z, g); } return face([P(0, 0, 0), P(a, 0, 0), P(a, b, 0), P(0, b, 0)], cls) + face([P(a, 0, 0), P(a, 0, c), P(a, b, c), P(a, b, 0)], cls + " mt-cs") + face([P(0, b, 0), P(a, b, 0), P(a, b, c), P(0, b, c)], cls + " mt-ct"); }
		h.push(cube(1, 1, 1, "mt-cube0", [0, 0, 0]));
		if (eps) { ab = [1 + clamp(eps[0] * k, -0.4, 0.4), 1 + clamp(eps[1] * k, -0.4, 0.4), 1 + clamp(eps[2] * k, -0.4, 0.4)]; h.push(cube(ab[0], ab[1], ab[2], "mt-cube1", gs)); }
		if (sig) {
			var smax = Math.max(1, Math.abs(sig[0]), Math.abs(sig[1]), Math.abs(sig[2]), Math.abs(sig[3]), Math.abs(sig[4]), Math.abs(sig[5]));
			var P = function (x, y, z) { return Pg(x, y, z, gs); };
			var arr = function (c0, dir, v, lb) { if (Math.abs(v) < smax * 0.02) return; var L = 25 + 55 * Math.abs(v) / smax, out = v > 0, p1 = out ? c0 : [c0[0] + dir[0] * L, c0[1] + dir[1] * L], p2 = out ? [c0[0] + dir[0] * L, c0[1] + dir[1] * L] : c0; h.push(arrowSimple(p1[0], p1[1], p2[0], p2[1]), lab("mt-p3-svg:a" + lb, c0[0] + dir[0] * (L + 18), c0[1] + dir[1] * (L + 18) + 5, lb, "mt-t mt-ts mt-b", "middle")); };
			/* shear: an arrow along the face, centred on a point of it (positive = towards +axis on a positive face) */
			var sh = function (c0, dir, v, lb, lo) { if (Math.abs(v) < smax * 0.02) return; var L = 22 + 40 * Math.abs(v) / smax, sg = v > 0 ? 1 : -1, p1 = [c0[0] - dir[0] * sg * L / 2, c0[1] - dir[1] * sg * L / 2], p2 = [c0[0] + dir[0] * sg * L / 2, c0[1] + dir[1] * sg * L / 2]; h.push(arrowSimple(p1[0], p1[1], p2[0], p2[1]), lab("mt-p3-svg:s" + lb + lo[0], c0[0] + lo[0], c0[1] + lo[1], lb, "mt-t mt-ts mt-b", "middle")); };
			arr(P(ab[0], ab[1] / 2, ab[2] / 2), [1, 0], sig[0], "σx"); arr(P(ab[0] / 2, ab[1], ab[2] / 2), [0, -1], sig[1], "σy"); arr(P(ab[0] / 2, ab[1] / 2, 0), [-0.79, 0.62], sig[2], "σz");
			sh(P(ab[0], ab[1] * 0.8, ab[2] * 0.85), [0, -1], sig[3], "τxy", [22, 5]); sh(P(ab[0] * 0.3, ab[1], ab[2] * 0.15), [1, 0], sig[3], "τxy", [0, -14]);
			sh(P(ab[0] * 0.75, ab[1], ab[2] * 0.35), [0.79, -0.62], sig[4], "τyz", [24, -4]); sh(P(ab[0], ab[1] * 0.25, ab[2] * 0.4), [0.79, -0.62], sig[5], "τzx", [28, 14]);
		}
		h.push(lab("mt-p3-svg:n1", 260, 392, "Arrows out: pulling. Arrows in: pushing. Along a face: shear.", "mt-t mt-ts", "middle"), lab("mt-p3-svg:n2", 260, 412, "Shaded: after loading. Stretch drawn " + kTxt(k) + "×" + (mg > 0 ? ", shear " + kTxt(kg) + "×" : "") + " larger.", "mt-t mt-ts", "middle"));
		svg.innerHTML = h.join("");
	}
	chipRow("mt-p3-ex", [["Pulled one way (uniaxial)", [100, 0, 0, 0, 0, 0]], ["Equal pull both ways (thin pressure vessel wall, 2:1)", [100, 50, 0, 0, 0, 0]], ["Squeezed equally from all sides (deep water)", [-100, -100, -100, 0, 0, 0]], ["Pure shear", [0, 0, 0, 60, 0, 0]]], function (v) { S.po.dir = "s"; paintSeg("mt-p3-dir", "s"); P3S.forEach(function (id, i) { setField(id, S.sys === "us" ? v[i] * 0.145 : v[i], S.sys === "us" ? "ksi" : "MPa"); }); poCompute(); });
	function poConst() {
		var pair = S.po.pair.split(","), msg = "", out = "";
		[].forEach.call(root.querySelectorAll("[data-ec]"), function (el) { el.hidden = pair.indexOf(el.getAttribute("data-ec")) < 0; });
		var vals = { E: fval("ec-E"), G: fval("ec-G"), K: fval("ec-K"), nu: fval("ec-nu") }, a = vals[pair[0]], b = vals[pair[1]];
		var r = isFinite(a) && isFinite(b) ? M.elastic(S.po.pair, a, b) : { err: "Type the two values." };
		if (r.err) msg = r.err;
		else out = "<thead><tr><th>Constant</th><th>Value</th><th>Formula</th></tr></thead><tbody>" + [["Young's modulus E", fmt(r.E, "modulus", 5), "stiffness in tension"], ["Shear modulus G", fmt(r.G, "modulus", 5), "E ÷ 2(1 + ν)"], ["Poisson's ratio ν", M.pretty(r.nu, 5), "−lateral ÷ axial strain"], ["Bulk modulus K", fmt(r.K, "modulus", 5), "E ÷ 3(1 − 2ν)"], ["Lamé's λ", fmt(r.lam, "modulus", 5), "E ν ÷ (1 + ν)(1 − 2ν)"], ["P-wave modulus M", fmt(r.M, "modulus", 5), "λ + 2G (sound waves in a solid)"]].map(function (rw) { return "<tr><td>" + rw[0] + "</td><td>" + rw[1] + "</td><td>" + rw[2] + "</td></tr>"; }).join("") + "</tbody>";
		$("mt-ec-out").innerHTML = out; $("mt-ec-msg").textContent = msg;
	}

	/* =========================== 6. THERMAL =========================== */
	seg("mt-th-cond", function () { return S.th.cond; }, function (v) { S.th.cond = v; thCompute(); });
	function thCompute() {
		var m = mv(), cond = S.th.cond, h = [], msg = "";
		modeVis("thermal", function (a) { return a.indexOf(cond) >= 0; });
		var a = mfield("th-a", m.a), E = mfield("th-E", m.E), dT = fval("th-dT"), L = fval("th-L"), g = fval("th-g"), d = fval("th-d");
		if (!isFinite(dT)) msg = "Type the temperature change (negative for cooling)."; else if (!(L > 0)) msg = "Type the length."; else if (!isFinite(a)) msg = "Type the thermal expansion α."; else if (cond === "gap" && !(g >= 0)) msg = "Type the gap.";
		var r = msg ? null : M.thermal(a, dT, L, E, cond, g);
		if (r) {
			h.push(tile(cond === "free" ? "Change in length" : "Stress in the bar", cond === "free" ? fmt(Math.abs(r.free), "small") : (r.sigma === 0 ? "0" : fmt(Math.abs(r.sigma), "stress")), cond === "free" ? (r.free >= 0 ? "longer" : "shorter") + " " + fmtO(Math.abs(r.free), "small") : r.sigma < 0 ? "compression (the walls push back) " + fmtO(-r.sigma, "stress") : r.sigma > 0 ? "tension (the walls hold it stretched) " + fmtO(r.sigma, "stress") : "the gap did not close", "tu-stat--hero"));
			h.push(tile("Thermal strain α ΔT", M.pretty(r.eps, 4), M.pretty(r.eps * 1e6, 4) + " µε"));
			if (cond !== "free") h.push(tile("Free expansion would be", fmt(Math.abs(r.free), "small"), "α ΔT L, if nothing held it"));
			if (cond === "gap") h.push(tile(r.touching ? "Gap" : "Gap left", r.touching ? "closed" : fmt(r.gapLeft, "small"), isFinite(r.dTclose) ? "closes after a rise of " + fmtIn(r.dTclose, "dtemp") : ""));
			if (r.sigma !== 0) {
				var comp = r.sigma < 0, str = comp && !m.sy ? (m.sc || m.su) : (m.sy || m.su), sfa = str / Math.abs(r.sigma);
				h.push(tile("Safety factor", M.pretty(sfa, 3), "against " + (m.sy ? "yield" : comp && m.sc ? "crushing" : "breaking") + " (" + fmt(str, "stress") + ") of " + m.short, sfa < 1 ? "mt-bad" : sfa < 1.5 ? "mt-warn" : ""));
				if (d > 0) { var A = PI * d * d / 4, F = Math.abs(r.sigma) * A; h.push(tile("Force on the walls", fmt(F, "force"), "σ × A for a " + fmt(d, "small") + " bar")); if (comp) { var pcr = M.euler(E, PI * Math.pow(d, 4) / 64, L); h.push(tile("Buckling load (pinned ends)", fmt(pcr, "force"), F > pcr ? "<strong>it buckles sideways</strong> before this stress is reached" : "your force is " + M.pretty(F / pcr * 100, 3) + "% of it", F > pcr ? "mt-bad" : "")); } }
			}
		}
		$("mt-th-stats").innerHTML = h.join(""); $("mt-th-msg").textContent = msg;
		drawThermal(r, cond, dT);
		if (r && r.sigma !== 0) { var mm2 = mv(), cmp = r.sigma < 0, str2 = cmp && !mm2.sy ? (mm2.sc || mm2.su) : (mm2.sy || mm2.su); if (Math.abs(r.sigma) > str2) $("mt-th-cap").textContent += " This is more than " + mm2.short + " can take: it would " + (mm2.sy ? "yield" : cmp ? "crush" : "crack") + ". That is why long slabs, rails and pipes get expansion joints or loops."; }
	}
	function drawThermal(r, cond, dT) {
		var h = ["<defs>" + MARK.replace("@", "mt-th-mk") + "</defs>"], x1 = 70, w0 = 340, yc = 140, hh = 44, hot = dT > 0;
		var k = exag(r ? r.eps : 0, 0.12), de = r ? clamp(r.eps * k, -0.25, 0.3) : 0;
		var gapPx = cond === "gap" && r ? clamp((fval("th-g") / (fval("th-L") || 1)) * k * w0, 4, 80) : 0;
		var wFree = w0 * (1 + de), wBar = cond === "free" ? wFree : cond === "held" ? w0 : Math.min(wFree, w0 + gapPx);
		if (cond !== "free") { h.push("<rect x='" + (x1 - 26) + "' y='60' width='26' height='160' class='mt-sup'/>", "<rect x='" + r1(x1 + w0 + gapPx) + "' y='60' width='26' height='160' class='mt-sup'/>"); }
		h.push("<rect x='" + x1 + "' y='" + (yc - hh / 2) + "' width='" + w0 + "' height='" + hh + "' class='mt-ghost'/>");
		h.push("<rect x='" + x1 + "' y='" + (yc - hh / 2) + "' width='" + r1(wBar) + "' height='" + hh + "' class='mt-rod mt-heat" + (dT > 0 ? " mt-heat--hot" : dT < 0 ? " mt-heat--cold" : "") + "'/>");
		if (r && r.sigma < 0) h.push(arrowSimple(x1 + 46, yc, x1 + 6, yc), arrowSimple(x1 + wBar - 46, yc, x1 + wBar - 6, yc), lab("mt-th-svg:n1", x1 + wBar / 2, yc + 6, "pushes on the walls", "mt-t mt-ts mt-b", "middle"));
		if (r && r.sigma > 0) h.push(arrowSimple(x1 + 6, yc, x1 + 46, yc), arrowSimple(x1 + wBar - 6, yc, x1 + wBar - 46, yc), lab("mt-th-svg:n2", x1 + wBar / 2, yc + 6, "pulls on the walls", "mt-t mt-ts mt-b", "middle"));
		if (cond === "free" && r) h.push(dimH(yc + hh / 2 + 22, x1 + w0, x1 + wFree, "mt-th-mk"), lab("mt-th-svg:n3", x1 + w0, yc + hh / 2 + 46, "δT = " + fmt(Math.abs(r.free), "small"), "mt-t mt-ts mt-b", "middle"));
		h.push(lab("mt-th-svg:n4", 260, 262, k > 1 ? "Change drawn " + kTxt(k) + "× larger than real." : "Drawn to true scale.", "mt-t mt-ts", "middle"), lab("mt-th-svg:n5", 260, 284, "Dashed: the bar before the temperature change.", "mt-t mt-ts", "middle"));
		$("mt-th-svg").innerHTML = h.join("");
		$("mt-th-cap").textContent = !r ? "" : cond === "free" ? (hot ? "Heated, the bar grows; nothing stops it, so there is no stress." : "Cooled, the bar shrinks; nothing stops it, so there is no stress.") : cond === "held" ? "The walls stop the bar changing length, so all of the thermal strain turns into stress: σ = −E α ΔT." : r.touching ? "The bar grew until it closed the gap; only the rest of the growth turns into stress." : "The gap has not closed yet, so there is no stress.";
	}
	chipRow("mt-th-ex", [
		["Steel rail, +40 °C, 10 m, held", function () { setMat("a36", true); S.th.cond = "held"; paintSeg("mt-th-cond", "held"); setField("th-dT", 40, "°C"); setField("th-L", 10, "m"); FL["th-d"].inp.value = ""; setT(FL["th-d"], ""); thCompute(); }],
		["Aluminium bar, 2 mm gap, +60 °C", function () { setMat("al6061", true); S.th.cond = "gap"; paintSeg("mt-th-cond", "gap"); setField("th-dT", 60, "°C"); setField("th-L", 1, "m"); setField("th-g", 0.5, "mm"); setField("th-d", 20, "mm"); thCompute(); }],
		["Concrete slab cooling 30 °C", function () { setMat("concrete", true); S.th.cond = "held"; paintSeg("mt-th-cond", "held"); setField("th-dT", -30, "°C"); setField("th-L", 6, "m"); FL["th-d"].inp.value = ""; setT(FL["th-d"], ""); thCompute(); }]
	], function (fn) { fn(); matNote(); });

	/* =========================== 7. TABLE + ASHBY CHART =========================== */
	var COLS = [["name", "Material"], ["E", "E", "modulus", 1e9], ["G", "G", "modulus", 1e9], ["nu", "ν"], ["sy", "Yield", "stress", 1e6], ["su", "UTS", "stress", 1e6], ["el", "Elong."], ["rho", "Density", "density", 1], ["a", "α", "alpha", 1e-6]];
	var FAMC = { metal: "#2563eb", polymer: "#d9480f", elastomer: "#6b7280", ceramic: "#7c3aed", wood: "#a16207", composite: "#0f766e", bio: "#be185d" };
	var TBU = { modulus: ["GPa", "Msi"], stress: ["MPa", "ksi"], density: ["kg/m³", "lb/in³"], alpha: ["µm/m·°C", "µin/in·°F"] };
	function tbUnit(d) { return TBU[d][S.sys === "us" ? 1 : 0]; }
	var famEl = $("mt-tb-fam");
	famEl.innerHTML = "<button type='button' class='tu-chip' data-f=''>All</button>" + M.FAMS.map(function (f) { return "<button type='button' class='tu-chip' data-f='" + f[0] + "'><span class='mt-sw' style='background:" + FAMC[f[0]] + "'></span>" + esc(f[1]) + "</button>"; }).join("");
	famEl.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.tb.fam = b.getAttribute("data-f"); save(); tbRender(); });
	$("mt-tb-q").value = S.tb.q || ""; $("mt-tb-q").addEventListener("input", function () { S.tb.q = this.value; save(); tbRender(); });
	var AXO = [["E", "Young's modulus E"], ["G", "Shear modulus G"], ["sy", "Yield strength"], ["su", "Tensile strength"], ["rho", "Density"], ["a", "Thermal expansion α"], ["Er", "Stiffness per weight E/ρ"], ["sr", "Strength per weight UTS/ρ"]];
	["mt-as-x", "mt-as-y"].forEach(function (id) { $(id).innerHTML = AXO.map(function (o) { return "<option value='" + o[0] + "'>" + o[1] + "</option>"; }).join(""); });
	$("mt-as-x").value = S.tb.x; $("mt-as-y").value = S.tb.y;
	$("mt-as-x").addEventListener("change", function () { S.tb.x = this.value; save(); ashby(); }); $("mt-as-y").addEventListener("change", function () { S.tb.y = this.value; save(); ashby(); });
	function tbVal(m, key) { var v = m[key]; if (v == null) return NaN; return v; }
	function tbList() {
		var q = (S.tb.q || "").toLowerCase().trim().split(/\s+/).filter(Boolean), list = M.MATS.filter(function (m) { if (S.tb.fam && m.fam !== S.tb.fam) return false; var t = (m.name + " " + m.fam + " " + (M.FAMS.filter(function (f) { return f[0] === m.fam; })[0] || ["", ""])[1]).toLowerCase(); return q.every(function (w) { return t.indexOf(w) >= 0 || (w === "aluminum" && t.indexOf("aluminium") >= 0); }); });
		if (S.tb.sort) { var k = S.tb.sort, d = S.tb.dir || 1; list = list.slice().sort(function (a, b) { if (k === "name") return d * a.name.localeCompare(b.name); var x = tbVal(a, k), y = tbVal(b, k); if (isNaN(x)) return 1; if (isNaN(y)) return -1; return d * (x - y); }); }
		return list;
	}
	function tbCell(m, c) {
		var v = m[c[0]];
		if (c[0] === "name") return "<td><span class='mt-sw' style='background:" + FAMC[m.fam] + "'></span>" + esc(m.name) + "</td>";
		if (c[0] === "el") { var ev = v != null ? v : (m.su / m.E / 10); return "<td>" + (ev < 1 ? M.sig(ev, 2) : M.sig(ev, 3)) + "</td>"; }
		if (v == null) return "<td class='mt-na'>" + (c[0] === "sy" ? "none" : "–") + "</td>";
		if (c[0] === "nu") return "<td>" + M.sig(v, 3) + "</td>";
		return "<td>" + M.pretty(M.fromSI(kindOf(c[2]), v * c[3], tbUnit(c[2])), c[0] === "rho" ? 4 : 3) + "</td>";
	}
	function tbRender() {
		[].forEach.call(famEl.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === (S.tb.fam || ""))); });
		var list = tbList(), cur = S.mat;
		var head = "<thead><tr>" + COLS.map(function (c) { var u = c[2] ? " (" + tbUnit(c[2]) + ")" : c[0] === "el" ? " (%)" : ""; var ar = S.tb.sort === c[0] ? (S.tb.dir > 0 ? " ▲" : " ▼") : ""; return "<th><button type='button' class='mt-sort' data-k='" + c[0] + "' aria-label='Sort by " + esc(c[1]) + "'>" + sym(esc(c[1])) + "<span class='mt-thu'>" + esc(u) + "</span>" + ar + "</button></th>"; }).join("") + "</tr></thead>";
		var body = list.map(function (m) { return "<tr data-id='" + m.id + "' tabindex='0'" + (m.id === cur ? " class='is-active'" : "") + ">" + COLS.map(function (c) { return tbCell(m, c); }).join("") + "</tr>"; }).join("");
		$("mt-tb").innerHTML = head + "<tbody>" + (body || "<tr><td colspan='9'>No material matches.</td></tr>") + "</tbody>";
		ashby();
	}
	$("mt-tb").addEventListener("click", function (e) {
		var s = e.target.closest(".mt-sort"); if (s) { var k = s.getAttribute("data-k"); if (S.tb.sort === k) S.tb.dir = -(S.tb.dir || 1); else { S.tb.sort = k; S.tb.dir = k === "name" ? 1 : -1; } save(); tbRender(); return; }
		var tr = e.target.closest("tr[data-id]"); if (tr) { setMat(tr.getAttribute("data-id")); toast(matRec().name + " is now used in every tool."); }
	});
	$("mt-tb").addEventListener("keydown", function (e) { if (e.key !== "Enter") return; var tr = e.target.closest("tr[data-id]"); if (tr) { setMat(tr.getAttribute("data-id")); toast(matRec().name + " is now used in every tool."); } });
	function axVal(m, key) { if (key === "Er") return m.E * 1e9 / m.rho; if (key === "sr") return m.su * 1e6 / m.rho; var v = m[key]; if (v == null) return NaN; return v * ({ E: 1e9, G: 1e9, sy: 1e6, su: 1e6, rho: 1, a: 1e-6 })[key]; }
	function axFmt(key, v) { if (key === "Er" || key === "sr") return M.pretty(v / 1e6, 3) + " MJ/kg"; var d = { E: "modulus", G: "modulus", sy: "stress", su: "stress", rho: "density", a: "alpha" }[key]; return M.pretty(M.fromSI(kindOf(d), v, tbUnit(d)), 3) + " " + tbUnit(d); }
	function axUnit(key) { if (key === "Er" || key === "sr") return "MJ/kg"; return tbUnit({ E: "modulus", G: "modulus", sy: "stress", su: "stress", rho: "density", a: "alpha" }[key]); }
	function axShow(key, v) { if (key === "Er" || key === "sr") return v / 1e6; var d = { E: "modulus", G: "modulus", sy: "stress", su: "stress", rho: "density", a: "alpha" }[key]; return M.fromSI(kindOf(d), v, tbUnit(d)); }
	function ashby() {
		var svg = $("mt-as");
		if (!WIN || WIN._svg !== svg) { var cw = svg.parentNode.clientWidth; svg.setAttribute("viewBox", "0 0 " + (cw > 0 && cw < 600 ? 560 : 720) + " 480"); }   /* a narrower drawing on phones, so its text is not shrunk to nothing */
		var vb = svg.getAttribute("viewBox").split(/[ ,]+/).map(Number), W = vb[2] > 0 ? vb[2] : 720, kx = S.tb.x, ky = S.tb.y, eqLines = kx === "rho" && ky === "E";
		var list = M.MATS.filter(function (m) { return !S.tb.fam || m.fam === S.tb.fam; }), L = 80, R = W - (eqLines ? 96 : 20), T = eqLines ? 30 : 20, B = 420, h = [], skipped = [];
		var pts = list.map(function (m) { return { m: m, x: axShow(kx, axVal(m, kx)), y: axShow(ky, axVal(m, ky)) }; }).filter(function (p) { var ok = p.x > 0 && p.y > 0; if (!ok) skipped.push(p.m.name); return ok; });
		ashLegend(eqLines);
		if (!pts.length) { svg.innerHTML = tx(W / 2, 240, "Nothing to show for this choice.", "mt-t", "middle"); return; }
		function rng(a) { var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a); var l0 = Math.floor(Math.log10(lo) - 0.15), l1 = Math.ceil(Math.log10(hi) + 0.15); if (l1 - l0 < 2) { l0--; l1++; } return [l0, l1]; }
		var rx = rng(pts.map(function (p) { return p.x; })), ry = rng(pts.map(function (p) { return p.y; }));
		function X(v) { return L + (R - L) * (Math.log10(v) - rx[0]) / (rx[1] - rx[0]); } function Y(v) { return B - (B - T) * (Math.log10(v) - ry[0]) / (ry[1] - ry[0]); }
		for (var dd = rx[0]; dd <= rx[1]; dd++) { h.push(line(X(Math.pow(10, dd)), T, X(Math.pow(10, dd)), B, "mt-grid"), tx(X(Math.pow(10, dd)), B + 20, M.pretty(Math.pow(10, dd), 3), "mt-t mt-ts", dd === rx[1] ? "end" : dd === rx[0] ? "start" : "middle")); }
		for (var ee = ry[0]; ee <= ry[1]; ee++) { h.push(line(L, Y(Math.pow(10, ee)), R, Y(Math.pow(10, ee)), "mt-grid"), tx(L - 8, Y(Math.pow(10, ee)) + 5, M.pretty(Math.pow(10, ee), 3), "mt-t mt-ts", "end")); }
		h.push(line(L, B, R, B, "mt-axis"), line(L, T, L, B, "mt-axis"));
		var nx = AXO.filter(function (o) { return o[0] === kx; })[0][1], ny = AXO.filter(function (o) { return o[0] === ky; })[0][1];
		h.push(tx((L + R) / 2, B + 46, nx + " (" + axUnit(kx) + ")", "mt-t mt-b", "middle"), tx(20, (T + B) / 2, ny + " (" + axUnit(ky) + ")", "mt-t mt-b", "middle", " transform='rotate(-90 20 " + (T + B) / 2 + ")'"));
		if (eqLines) {   /* lines of equal E/rho: E = c rho (in display units); each is labelled where it leaves the plot (right margin or above the top), never on the dots */
			[[1e5, 0], [1e6, 0], [2.55e7, 1], [1e8, 0]].forEach(function (cl) {
				var c = cl[0], ex = Math.pow(10, rx[0]), ex2 = Math.pow(10, rx[1]);
				function yAt(xv) { return Y(M.fromSI("stress", c * M.toSI("density", xv, tbUnit("density")), tbUnit("modulus"))); }
				var p0 = [X(ex), yAt(ex)], p1 = [X(ex2), yAt(ex2)];
				h.push("<line x1='" + r1(p0[0]) + "' y1='" + r1(p0[1]) + "' x2='" + r1(p1[0]) + "' y2='" + r1(p1[1]) + "' class='mt-asl" + (cl[1] ? " mt-asl--hi" : "") + "' clip-path='url(#mt-as-clip)'/>");
				var lab0 = M.pretty(c / 1e6, 3) + " MJ/kg", cls = "mt-t mt-ts mt-asll mt-aslab" + (cl[1] ? " mt-asll--hi" : "");
				if (p1[1] >= T && p1[1] <= B) h.push(tx(R + 6, p1[1] + 5, lab0, cls, "start"));
				else if (p1[1] < T && p1[1] !== p0[1]) { var xT = p0[0] + (p1[0] - p0[0]) * (T - p0[1]) / (p1[1] - p0[1]); if (xT >= L + 20 && xT <= R) h.push(tx(Math.min(xT, R - 30), T - 9, lab0, cls, "middle")); }
			});
		}
		var cur = S.mat;
		pts.sort(function (a, b) { return (a.m.id === cur) - (b.m.id === cur); }).forEach(function (p) {
			var on = p.m.id === cur, cxx = X(p.x), cyy = Y(p.y);
			h.push("<g class='mt-asp" + (on ? " mt-asp--on" : "") + "' data-id='" + p.m.id + "' tabindex='0' role='button' aria-label='" + esc(p.m.name + ": " + axFmt(kx, axVal(p.m, kx)) + ", " + axFmt(ky, axVal(p.m, ky))) + "'><title>" + esc(p.m.name + "\n" + nx + ": " + axFmt(kx, axVal(p.m, kx)) + "\n" + ny + ": " + axFmt(ky, axVal(p.m, ky))) + "</title><circle cx='" + r1(cxx) + "' cy='" + r1(cyy) + "' r='" + (on ? 9 : 6.5) + "' fill='" + FAMC[p.m.fam] + "'/>" + (on ? tx(cxx + (cxx > R - 160 ? -14 : 14), cyy + 5, p.m.name, "mt-t mt-ts mt-b mt-aslab", cxx > R - 160 ? "end" : "start") : "") + "</g>");
		});
		svg.innerHTML = "<defs><clipPath id='mt-as-clip'><rect x='" + L + "' y='" + T + "' width='" + (R - L) + "' height='" + (B - T) + "'/></clipPath></defs>" + h.join("");
		$("mt-as-note").textContent = "Both scales are logarithmic (each step is ten times the last). Click a dot to use that material; hover or focus a dot for its numbers." + (eqLines ? " Dashed lines join materials with the same stiffness per kilogram (E/ρ): steel, aluminium and titanium sit on almost the same line." : "") + (skipped.length ? " Not shown (no value, or zero or below on a log scale): " + skipped.join(", ") + "." : "");
	}
	/* the chart's legend is HTML under the picture (it used to sit inside the plot, on top of the dots): one button per kind of material, which also filters the table */
	function ashLegend(eqLines) {
		var el = $("mt-as-lg"); if (!el) return;
		var have = M.FAMS.filter(function (f) { return M.MATS.some(function (m) { return m.fam === f[0]; }); });
		el.innerHTML = have.map(function (f) { var on = S.tb.fam === f[0]; return "<button type='button' class='mt-as-li' data-f='" + f[0] + "' aria-pressed='" + on + "'" + (S.tb.fam && !on ? " data-off='1'" : "") + "><span class='mt-sw' style='background:" + FAMC[f[0]] + "'></span>" + esc(f[1]) + "</button>"; }).join("") +
			(eqLines ? "<span class='mt-as-li mt-as-li--line'><span class='mt-as-dash'></span>E/ρ ≈ 25 MJ/kg: steel, aluminium, titanium</span>" : "");
	}
	$("mt-as-lg").addEventListener("click", function (e) { var b = e.target.closest("button[data-f]"); if (!b) return; var f = b.getAttribute("data-f"); S.tb.fam = S.tb.fam === f ? "" : f; save(); tbRender(); if (WIN) winFit(); });
	$("mt-as").addEventListener("click", function (e) { var g = e.target.closest("[data-id]"); if (g) { setMat(g.getAttribute("data-id")); toast(matRec().name + " is now used in every tool."); } });
	$("mt-as").addEventListener("keydown", function (e) { if (e.key !== "Enter" && e.key !== " ") return; var g = e.target.closest("[data-id]"); if (g) { e.preventDefault(); setMat(g.getAttribute("data-id")); } });

	/* =========================== links =========================== */
	function shareUrl() {
		var t = CUR, q = ["tab=" + t, "m=" + encodeURIComponent(S.mat), "u=" + S.sys];
		if (S.mat === "custom" && S.cu) q.push("cu=" + encodeURIComponent([S.cu.c, S.cu.E, S.cu.nu, S.cu.sy == null ? "" : S.cu.sy, S.cu.su, S.cu.el, S.cu.ra == null ? "" : S.cu.ra, S.cu.rho, S.cu.a == null ? "" : S.cu.a].join("~")));
		(LINKF[t] || []).forEach(function (id) { if (!typed(id) || FL[id].div.hidden || FL[id].div.closest("[hidden]")) return; var f = FL[id], v = f.inp.value.trim(); if (v) q.push(pkey(id) + "=" + encodeURIComponent(v + (f.sel ? f.u : ""))); });
		if (t === "axial") q.push("o=" + S.ax.ord.join(","), "sh=" + S.ax.shape, "dir=" + S.ax.dir);
		if (t === "tensile") { if (S.tt.c2) q.push("c2=" + S.tt.c2); if (S.tt.c3) q.push("c3=" + S.tt.c3); if (S.tt.tr) q.push("tr=1"); if (S.tt.zoom !== "follow") q.push("z=" + S.tt.zoom); }
		if (t === "shear") q.push("md=" + S.sh.mode, "n=" + S.sh.n, "sf=" + encodeURIComponent(S.sh.sf), "rt=" + encodeURIComponent(S.sh.ratio));
		if (t === "torsion") q.push("src=" + S.to.src, "hol=" + S.to.hol, "sf=" + encodeURIComponent(S.to.sf));
		if (t === "poisson") q.push("md=" + S.po.mode, "by=" + S.po.by, "dir=" + S.po.dir, "pair=" + encodeURIComponent(S.po.pair));
		if (t === "thermal") q.push("cond=" + S.th.cond);
		return location.origin + location.pathname + "?" + q.join("&");
	}
	$("mt-link").addEventListener("click", function () { copy(shareUrl(), "Link copied: it opens this tab with your numbers."); });
	function loadQuery() {
		var p; try { p = new URLSearchParams(location.search); } catch (e) { return null; }
		var tab = p.get("tab"); if (!tab && !p.get("m")) return null;
		if (p.get("m") == null) return tab;   /* a plain ?tab= link (the family nav): just open that tab */
		if (p.get("u") === "si" || p.get("u") === "us") S.sys = p.get("u");
		var cu = p.get("cu"); if (cu) { var a = cu.split("~"), n = function (x) { return x === "" || x == null ? null : num(x); }; S.cu = { id: "custom", name: "Your material", fam: "metal", c: a[0] || "duct", E: n(a[1]) || 200, nu: n(a[2]) != null ? n(a[2]) : 0.3, sy: n(a[3]), su: n(a[4]) || 400, el: n(a[5]) || 20, ra: n(a[6]), rho: n(a[7]) || 7850, a: n(a[8]) }; S.cu.G = S.cu.E / (2 * (1 + S.cu.nu)); }
		var m = p.get("m"); if (m && (M.mat(m) || (m === "custom" && S.cu))) S.mat = m;
		var t = tab || VIEWS[0];
		(LINKF[t] || []).forEach(function (id) { var v = p.get(pkey(id)); if (v != null) S.f[id] = { t: v, u: S.f[id] && S.f[id].u }; else if (MATF.indexOf(id) >= 0) S.f[id] = { t: "", u: S.f[id] && S.f[id].u }; });
		if (t === "axial") { if (p.get("o")) S.ax.ord = p.get("o").split(",").filter(function (v) { return M.AX.indexOf(v) >= 0; }); if (p.get("sh")) S.ax.shape = p.get("sh"); if (p.get("dir")) S.ax.dir = p.get("dir") === "c" ? "c" : "t"; }
		if (t === "tensile") { S.tt.c2 = M.mat(p.get("c2")) ? p.get("c2") : ""; S.tt.c3 = M.mat(p.get("c3")) ? p.get("c3") : ""; S.tt.tr = p.get("tr") === "1"; S.tt.zoom = p.get("z") === "el" ? "el" : p.get("z") === "all" ? "all" : "follow"; }
		if (t === "shear") { if (p.get("md")) S.sh.mode = p.get("md"); if (p.get("n")) S.sh.n = p.get("n") === "2" ? "2" : "1"; if (p.get("sf")) S.sh.sf = p.get("sf"); if (p.get("rt")) S.sh.ratio = p.get("rt"); }
		if (t === "torsion") { if (p.get("src")) S.to.src = p.get("src") === "P" ? "P" : "T"; if (p.get("hol")) S.to.hol = p.get("hol") === "1" ? "1" : "0"; if (p.get("sf")) S.to.sf = p.get("sf"); }
		if (t === "poisson") { if (p.get("md")) S.po.mode = p.get("md"); if (p.get("by")) S.po.by = p.get("by") === "e" ? "e" : "s"; if (p.get("dir")) S.po.dir = p.get("dir") === "e" ? "e" : "s"; if (p.get("pair")) S.po.pair = p.get("pair"); }
		if (t === "thermal" && p.get("cond")) S.th.cond = p.get("cond");
		return t;
	}

	/* =========================== start =========================== */
	if (qtab) {   /* a share link was applied to S before the fields were built: tidy the address */
		var effTab = VIEWS.indexOf(qtab) >= 0 ? qtab : VIEWS[0];
		try { history.replaceState(null, "", location.pathname + (VIEWS.length > 1 && effTab !== VIEWS[0] ? "?tab=" + effTab : "")); } catch (e) { /* ignore */ }
		save();
	}
	["mt-sh-mode", "mt-sh-n", "mt-to-src", "mt-to-hol", "mt-po-mode", "mt-po-by", "mt-p3-dir", "mt-th-cond", "mt-ax-dir"].forEach(function (id) { var map = { "mt-sh-mode": S.sh.mode, "mt-sh-n": S.sh.n, "mt-to-src": S.to.src, "mt-to-hol": S.to.hol, "mt-po-mode": S.po.mode, "mt-po-by": S.po.by, "mt-p3-dir": S.po.dir, "mt-th-cond": S.th.cond, "mt-ax-dir": S.ax.dir }; paintSeg(id, map[id]); });
	$("mt-sh-ratio").value = S.sh.ratio; $("mt-sh-sf").value = S.sh.sf; $("mt-to-sf").value = S.to.sf; $("mt-ec-pair").value = S.po.pair; $("mt-ax-sfv").value = S.ax.sf || "2"; shapeSel.value = S.ax.shape;
	cmpOpts($("mt-tt-c2"), S.tt.c2); cmpOpts($("mt-tt-c3"), S.tt.c3); paintSeg("mt-tt-zoom", S.tt.zoom); $("mt-tt-true").checked = !!S.tt.tr;
	seg("mt-sys", function () { return S.sys; }, function (v) { setSys(v === "us" ? "us" : "si"); });
	matSel.value = S.mat; $("mt-custom").hidden = S.mat !== "custom"; if (S.mat === "custom") custFill();
	axShapeFields();
	matNote();
	/* =========================== figures: Fill window / Full screen / Reset labels, draggable labels, equation layout =========================== */
	var FIGT = { "mt-ax-svg": "Stress and strain", "mt-sh-svg": "Shear", "mt-to-svg": "Torsion", "mt-po-svg": "Poisson's ratio", "mt-p3-svg": "3D Hooke's law", "mt-th-svg": "Thermal stress", "mt-as": "" }, WIN = null, figs = [];
	function figInit(card) {
		var svg = card.querySelector(".mt-svg"); if (!svg || card._bar) return;
		var bar = document.createElement("div"); bar.className = "mt-figbar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "View of the picture");
		bar.innerHTML = "<span class='mt-figt'>" + esc(FIGT[svg.id] || "") + "</span><button type='button' data-a='lab' hidden title='Put every label you dragged back in its own place'>↺ Reset labels</button>" +
			"<button type='button' data-a='win' title='Fill the browser window with this picture (Esc leaves)'>⤢ Fill window</button>" +
			(document.fullscreenEnabled ? "<button type='button' data-a='fs' title='Use the whole screen'>⛶ Full screen</button>" : "") + "<button type='button' data-a='close' hidden>✕ Close (Esc)</button>";
		card.insertBefore(bar, card.firstChild); card._svg = svg; card._bar = bar; figs.push(card);
		bar.addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return; var a = b.getAttribute("data-a");
			if (a === "win") winOn(card);
			else if (a === "close") { if (document.fullscreenElement === card) document.exitFullscreen(); else winOff(); }
			else if (a === "fs") { if (document.fullscreenElement) { document.exitFullscreen(); return; } card._fromWin = WIN === card; winOn(card); if (card.requestFullscreen) card.requestFullscreen().catch(function () { if (!card._fromWin) winOff(); }); }
			else if (a === "lab") labReset(svg.id);
		});
	}
	function figBtns(card) {
		var fs = document.fullscreenElement === card, on = WIN === card, q = function (a) { return card._bar.querySelector("[data-a='" + a + "']"); };
		q("win").hidden = on; q("close").hidden = !on || fs; if (q("fs")) q("fs").textContent = fs ? "✕ Leave full screen" : "⛶ Full screen";
	}
	function winOn(card) {
		if (WIN && WIN !== card) winOff();
		WIN = card; card.classList.add("mt-win"); root.classList.add("mt-winon"); document.documentElement.classList.add("mt-noscroll");
		figBtns(card); winFit(); setTimeout(winFit, 60);
	}
	function winOff() {
		var card = WIN; if (!card) return; WIN = null;
		card.classList.remove("mt-win"); root.classList.remove("mt-winon"); if (!TT.win) document.documentElement.classList.remove("mt-noscroll");
		card._svg.style.height = "";
		if (card._svg.id === "mt-as") { card._svg.setAttribute("viewBox", "0 0 720 480"); ashby(); }
		figBtns(card);
	}
	/* the picture takes the window height that the bar, sliders and caption leave free; the materials chart is redrawn for the window's shape instead of being letterboxed */
	function winFit() {
		var card = WIN; if (!card) return; var svg = card._svg, cs = getComputedStyle(card), extra = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
		[].forEach.call(card.children, function (k) { if (k === svg) return; var c = getComputedStyle(k); if (c.display === "none" || c.position === "absolute" || c.position === "fixed") return; extra += k.offsetHeight + parseFloat(c.marginTop) + parseFloat(c.marginBottom); });
		var H = Math.max(220, (window.innerHeight || 600) - extra - 6);
		if (svg.id === "mt-as") { var w = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); svg.setAttribute("viewBox", "0 0 " + Math.round(clamp(480 * w / H, 560, 1500)) + " 480"); ashby(); }
		svg.style.height = H + "px";
	}
	document.addEventListener("fullscreenchange", function () {
		figs.forEach(function (card) { if (document.fullscreenElement === card) { if (WIN !== card) winOn(card); } else if (WIN === card && card._fs && !card._fromWin) winOff(); card._fs = document.fullscreenElement === card; if (card._bar) figBtns(card); });
		setTimeout(winFit, 80);
	});
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && WIN && !document.fullscreenElement) winOff(); });
	var wfT; window.addEventListener("resize", function () { clearTimeout(wfT); wfT = setTimeout(function () { if (WIN) winFit(); else if (CUR === "table") ashby(); }, 60); });
	function labBtns() { figs.forEach(function (card) { var id = card._svg.id + ":", b = card._bar.querySelector("[data-a='lab']"); b.hidden = !Object.keys(S.lab).some(function (k) { return k.indexOf(id) === 0; }); }); }
	function labReset(svgId) { Object.keys(S.lab).forEach(function (k) { if (k.indexOf(svgId + ":") === 0) delete S.lab[k]; }); save(); labBtns(); renderTab(CUR); }
	/* drag a label: pointer events in the picture's own coordinates; the offset is saved when it is dropped */
	var LD = null;
	root.addEventListener("pointerdown", function (ev) {
		var g = ev.target.closest && ev.target.closest(".mt-lab"); if (!g || (ev.button && ev.button > 0)) return; var svg = g.ownerSVGElement; if (!svg) return;
		ev.preventDefault(); ev.stopPropagation();
		var id = g.getAttribute("data-lab"), o = S.lab[id] || [0, 0];
		LD = { g: g, id: id, o: [+o[0] || 0, +o[1] || 0], p0: svgPt(svg, ev), svg: svg }; g.classList.add("mt-lab--drag");
		try { g.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
	}, true);
	document.addEventListener("pointermove", function (ev) { if (!LD) return; var p = svgPt(LD.svg, ev); LD.d = [r1(clamp(LD.o[0] + p.x - LD.p0.x, -700, 700)), r1(clamp(LD.o[1] + p.y - LD.p0.y, -700, 700))]; LD.g.setAttribute("transform", "translate(" + LD.d[0] + " " + LD.d[1] + ")"); });
	function ldEnd() { if (!LD) return; if (LD.d) { S.lab[LD.id] = LD.d; save(); labBtns(); } LD.g.classList.remove("mt-lab--drag"); LD = null; }
	document.addEventListener("pointerup", ldEnd); document.addEventListener("pointercancel", ldEnd);
	[].forEach.call(root.querySelectorAll(".mt-fig, .mt-ascard"), figInit); labBtns();
	/* equation boxes: each box asks for the width of its own formula, so short ones share a row and a long one gets a row to itself; a formula a little too wide for its row
	   is scaled down (to 80% at most) and only a formula wider than that scrolls (a thin bar, phones only in practice) */
	function eqFit() {
		[].forEach.call(root.querySelectorAll(".mt-eqb"), function (bx) {
			var fs = [].slice.call(bx.querySelectorAll(".mt-eqb__f")), ws = [], gap = parseFloat(getComputedStyle(bx).columnGap) || 0;
			for (var i = 0; i < fs.length; i++) {
				var svg = fs[i].querySelector("mjx-container svg"); if (!svg) return;
				if (!svg._w) { svg.style.width = ""; svg.style.height = ""; var rc = svg.getBoundingClientRect(); if (!(rc.width > 0)) return; svg._w = rc.width; svg._h = rc.height; }
				ws.push(svg);
			}
			if (!ws.length) return;
			var n = bx.querySelector(".mt-eqb__n"), sum = ws.reduce(function (t, v) { return t + v._w + 4; }, 0) + gap * (ws.length - 1);
			bx.style.flexBasis = Math.ceil(Math.max(sum, n ? n.scrollWidth : 0)) + "px";   /* the parts of one formula sit side by side when there is room, else they wrap */
			var avail = bx.clientWidth; if (!(avail > 0)) return;
			ws.forEach(function (svg, j) {
				var sc = svg._w > avail ? Math.max(0.8, avail / svg._w) : 1;
				svg.style.width = sc < 1 ? r1(svg._w * sc) + "px" : ""; svg.style.height = sc < 1 ? r1(svg._h * sc) + "px" : "";
				fs[j].classList.toggle("mt-eqb__f--scroll", svg._w * sc > avail + 1);
			});
		});
	}
	(function () {
		var eqT, run = function () { clearTimeout(eqT); eqT = setTimeout(eqFit, 40); };
		if (window.ResizeObserver) { var ro = new ResizeObserver(run); [].forEach.call(root.querySelectorAll(".mt-eq"), function (c) { ro.observe(c); }); }
		window.addEventListener("resize", run);
		var tries = 0, iv = setInterval(function () { if (root.querySelector(".mt-eqb .mes-tex--done") || ++tries > 120) { clearInterval(iv); run(); } }, 250);   /* MathJax loads after the page */
		document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".mt-tabs")) run(); });
	})();
	showTab(qtab || S.tabs[PAGE] || VIEWS[0], false);
	document.addEventListener("visibilitychange", function () { if (document.hidden && TT.play) { TT.play = false; ttRender(); } });
})();
