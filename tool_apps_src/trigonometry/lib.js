/* MES Trigonometry Calculator -- pure maths (no DOM). Browser global `TR`; node: require('./tool_apps_src/trigonometry/lib.js'); tests: node tool_apps_src/trigonometry-tests.js
 * Angles are degrees unless a name says otherwise. */
(function (root) {
	"use strict";
	var R = Math.PI / 180;
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { var s = fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); return s === "-0" ? "0" : s; }
	function norm360(d) { var r = ((d % 360) + 360) % 360; return Math.abs(r - 360) < 1e-9 ? 0 : r; }
	function snap(v) { return Math.abs(v) < 1e-12 ? 0 : Math.abs(v - Math.round(v)) < 1e-12 ? Math.round(v) : v; }

	/* ---- reading angles: "45", "45°", "pi/3", "3pi/4", "2π", "0.5 pi", "1.2 rad", "50 grad" ---- */
	function parseAngle(str, unit) {
		var t = String(str == null ? "" : str).trim().toLowerCase().replace(/\s+/g, "").replace(/π/g, "pi").replace(/°/g, "deg").replace(/,/g, "."); if (!t) return null;
		var u = unit || "deg", m = /(deg|degrees?|rad|radians?|grad|gon)$/.exec(t); if (m) { u = /^deg/.test(m[1]) ? "deg" : /^rad/.test(m[1]) ? "rad" : "grad"; t = t.slice(0, -m[1].length); }
		if (!t) return null; var neg = false; if (t[0] === "-" || t[0] === "−") { neg = true; t = t.slice(1); } else if (t[0] === "+") t = t.slice(1);
		var val = null, mm;
		if ((mm = /^(\d*\.?\d*)\*?pi(?:\/(\d*\.?\d+))?$/.exec(t))) { var k = mm[1] === "" ? 1 : parseFloat(mm[1]), dnm = mm[2] ? parseFloat(mm[2]) : 1; if (!isFinite(k) || !dnm) return null; val = k * Math.PI / dnm; u = "rad"; }
		else if ((mm = /^(\d*\.?\d+)\/(\d*\.?\d+)pi$/.exec(t))) { val = parseFloat(mm[1]) / parseFloat(mm[2]) * Math.PI; u = "rad"; }
		else if ((mm = /^(\d*\.?\d+)\/(\d*\.?\d+)$/.exec(t))) { if (!parseFloat(mm[2])) return null; val = parseFloat(mm[1]) / parseFloat(mm[2]); }
		else if (/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t)) val = parseFloat(t);
		if (val == null || !isFinite(val)) return null; if (neg) val = -val;
		return u === "rad" ? val / R : u === "grad" ? val * 0.9 : val;
	}
	function fmtAngle(deg, unit) { return unit === "rad" ? trim(deg * R, 6) + " rad" : unit === "grad" ? trim(deg / 0.9, 4) + " grad" : trim(deg, 4) + "°"; }
	function gcd(a, b) { return b ? gcd(b, a % b) : a; }
	function piFraction(deg) { if (Math.abs(deg - Math.round(deg)) > 1e-9) return ""; var d = Math.round(deg), g = gcd(Math.abs(d), 180); if (d === 0) return "0"; var n = d / g, m = 180 / g; return (n === 1 ? "" : n === -1 ? "−" : String(n)) + "π" + (m === 1 ? "" : "/" + m); }

	/* ---- the six functions ---- */
	function trig(deg) {
		var r = deg * R, s = snap(Math.sin(r)), c = snap(Math.cos(r)), out = { sin: s, cos: c, tan: null, csc: null, sec: null, cot: null };
		if (Math.abs(c) > 1e-12) out.tan = snap(s / c); if (Math.abs(s) > 1e-12) { out.csc = snap(1 / s); if (Math.abs(c) > 1e-12 || true) out.cot = snap(c / s); } if (Math.abs(c) > 1e-12) out.sec = snap(1 / c);
		return out;
	}
	function quadrant(deg) { var d = norm360(deg); if (d === 0 || d === 90 || d === 180 || d === 270) return 0; return d < 90 ? 1 : d < 180 ? 2 : d < 270 ? 3 : 4; }
	function referenceAngle(deg) { var d = norm360(deg); return d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d; }

	/* ---- exact values for multiples of 15 degrees (sin, cos, tan) and of 18 degrees (sin, cos) ---- */
	var S15 = { 0: "0", 15: "(√6−√2)/4", 30: "1/2", 45: "√2/2", 60: "√3/2", 75: "(√6+√2)/4", 90: "1" }, C15 = { 0: "1", 15: "(√6+√2)/4", 30: "√3/2", 45: "√2/2", 60: "1/2", 75: "(√6−√2)/4", 90: "0" }, T15 = { 0: "0", 15: "2−√3", 30: "√3/3", 45: "1", 60: "√3", 75: "2+√3", 90: null };
	var S18 = { 18: "(√5−1)/4", 36: "√(10−2√5)/4", 54: "(√5+1)/4", 72: "√(10+2√5)/4" }, C18 = { 18: "√(10+2√5)/4", 36: "(√5+1)/4", 54: "√(10−2√5)/4", 72: "(√5−1)/4" };
	function neg(s) { return s === "0" || s == null ? s : s[0] === "−" ? s.slice(1) : /^\d+[−+]/.test(s) ? "−(" + s + ")" : "−" + s; }
	function exact(deg) {
		if (Math.abs(deg - Math.round(deg)) > 1e-9) return null; var d = Math.round(norm360(deg)), ref = Math.round(referenceAngle(d)), q = quadrant(d), sS, cS, tS;
		var sgnS = (d > 180 && d < 360) ? -1 : 1, sgnC = (d > 90 && d < 270) ? -1 : 1;
		if (ref % 15 === 0) { sS = S15[ref]; cS = C15[ref]; tS = T15[ref]; } else if (S18[ref]) { sS = S18[ref]; cS = C18[ref]; tS = null; } else return null;
		var o = { sin: sgnS < 0 ? neg(sS) : sS, cos: sgnC < 0 ? neg(cS) : cS, tan: null };
		if (tS != null && (d !== 90 && d !== 270)) o.tan = (sgnS * sgnC < 0) ? neg(tS) : tS; else if (d === 90 || d === 270) o.tan = "undefined"; else o.tan = null;
		return o;
	}

	/* ---- inverse functions: every solution in [0, 360) ---- */
	function inverse(fn, v) {
		var p, sol, gen;
		if (fn === "sin" || fn === "csc") { var x = fn === "csc" ? (v === 0 ? NaN : 1 / v) : v; if (!(Math.abs(x) <= 1 + 1e-12)) return null; p = Math.asin(Math.max(-1, Math.min(1, x))) / R; sol = [p, 180 - p]; gen = "x = " + trim(p, 4) + "° + 360°k  or  x = " + trim(180 - p, 4) + "° + 360°k"; }
		else if (fn === "cos" || fn === "sec") { var y = fn === "sec" ? (v === 0 ? NaN : 1 / v) : v; if (!(Math.abs(y) <= 1 + 1e-12)) return null; p = Math.acos(Math.max(-1, Math.min(1, y))) / R; sol = [p, 360 - p]; gen = "x = ±" + trim(p, 4) + "° + 360°k"; }
		else { var z = fn === "cot" ? (v === 0 ? 90 / R * 0 : 1 / v) : v; if (fn === "cot" && v === 0) { p = 90; } else { if (!isFinite(z)) return null; p = Math.atan(z) / R; } sol = [p, p + 180]; gen = "x = " + trim(p, 4) + "° + 180°k"; }
		var set = []; sol.forEach(function (s) { var n = norm360(s); if (!set.some(function (q) { return Math.abs(q - n) < 1e-9; })) set.push(n); }); set.sort(function (a, b) { return a - b; });
		// principal value in the usual range of each inverse function
		var pr = fn === "sin" || fn === "csc" ? p : fn === "cos" || fn === "sec" ? p : p; if (fn === "cot") pr = v === 0 ? 90 : (Math.atan(1 / v) / R); if (fn === "cot" && pr < 0) pr += 180;
		return { principal: pr, solutions: set, general: gen };
	}

	/* ---- solving triangles ---- (a opposite A, b opposite B, c opposite C) */
	function clampAcos(x) { return Math.acos(Math.max(-1, Math.min(1, x))) / R; }
	function fill(t) { t.area = 0.5 * t.a * t.b * Math.sin(t.C * R); t.perimeter = t.a + t.b + t.c; return t; }
	function solveTriangle(k) {
		var sides = ["a", "b", "c"].filter(function (x) { return k[x] > 0; }), angs = ["A", "B", "C"].filter(function (x) { return k[x] > 0; }), opp = { a: "A", b: "B", c: "C", A: "a", B: "b", C: "c" };
		if (sides.length + angs.length !== 3) return { ok: false, error: "Enter exactly three values (at least one a side)." };
		if (!sides.length) return { ok: false, error: "Three angles alone do not fix the size: give at least one side. (They give similar triangles of any size.)" };
		for (var i = 0; i < angs.length; i++) if (k[angs[i]] >= 180) return { ok: false, error: "An angle of a triangle must be less than 180°." };
		var sols = [], note = "", cs;
		if (sides.length === 3) {
			var a = k.a, b = k.b, c = k.c; if (a + b <= c || a + c <= b || b + c <= a) return { ok: false, error: "No triangle: each side must be shorter than the other two together." };
			cs = "SSS"; note = "Law of cosines for each angle: cos A = (b² + c² − a²) / 2bc.";
			var A = clampAcos((b * b + c * c - a * a) / (2 * b * c)), B = clampAcos((a * a + c * c - b * b) / (2 * a * c)); sols.push(fill({ a: a, b: b, c: c, A: A, B: B, C: 180 - A - B }));
		} else if (sides.length === 2) {
			var s1 = sides[0], s2 = sides[1], an = angs[0], third = ["a", "b", "c"].filter(function (x) { return x !== s1 && x !== s2; })[0];
			if (opp[an] === third) {   // SAS: the angle is between the two sides
				cs = "SAS"; var tv = Math.sqrt(k[s1] * k[s1] + k[s2] * k[s2] - 2 * k[s1] * k[s2] * Math.cos(k[an] * R)); note = "Law of cosines for the third side: " + third + "² = " + s1 + "² + " + s2 + "² − 2·" + s1 + "·" + s2 + "·cos " + an + ". Then the law of sines for another angle.";
				var t = {}; t[s1] = k[s1]; t[s2] = k[s2]; t[third] = tv; t[an] = k[an];
				var angS1 = clampAcos((k[s2] * k[s2] + tv * tv - k[s1] * k[s1]) / (2 * k[s2] * tv));   // the angle opposite s1 by the law of cosines (no ambiguity)
				t[opp[s1]] = angS1; t[opp[s2]] = 180 - k[an] - angS1; sols.push(fill(t));
			} else {   // SSA: the angle is opposite one of the sides
				cs = "SSA"; var known = angs[0], sk = opp[known], so = sides.filter(function (x) { return x !== sk; })[0], ratio = k[so] * Math.sin(k[known] * R) / k[sk];   // sin(opposite so) = so sin(known) / sk
				note = "Law of sines: sin " + opp[so] + " = " + so + " · sin " + known + " / " + sk + " = " + trim(ratio, 5) + ". ";
				if (ratio > 1 + 1e-9) return { ok: false, error: "No triangle: sin " + opp[so] + " would be " + trim(ratio, 4) + ", which is more than 1 (the side " + sk + " is too short to reach).", ratio: ratio };
				var base = Math.asin(Math.min(1, ratio)) / R, cand = Math.abs(ratio - 1) < 1e-9 ? [90] : [base, 180 - base];
				cand.forEach(function (bAng) { var third3 = 180 - k[known] - bAng; if (third3 > 1e-9) { var t = {}; t[sk] = k[sk]; t[so] = k[so]; t[known] = k[known]; t[opp[so]] = bAng; var thirdAng = ["A", "B", "C"].filter(function (x) { return x !== known && x !== opp[so]; })[0]; t[thirdAng] = third3; t[opp[thirdAng]] = k[sk] * Math.sin(third3 * R) / Math.sin(k[known] * R); sols.push(fill(t)); } });
				if (!sols.length) return { ok: false, error: "No triangle fits these values." };
				note += sols.length === 2 ? "This is the ambiguous case: two different triangles fit." : "Exactly one triangle fits.";
			}
		} else {
			var sum = angs.reduce(function (s, x) { return s + k[x]; }, 0); if (sum >= 180) return { ok: false, error: "Two angles must add to less than 180°." };
			cs = "ASA/AAS"; var thirdA = ["A", "B", "C"].filter(function (x) { return angs.indexOf(x) < 0; })[0], t2 = {}; t2[thirdA] = 180 - sum; angs.forEach(function (x) { t2[x] = k[x]; }); var sd = sides[0], f = k[sd] / Math.sin(t2[opp[sd]] * R);
			["A", "B", "C"].forEach(function (x) { t2[opp[x]] = f * Math.sin(t2[x] * R); }); note = "Third angle = 180° − " + trim(sum, 4) + "° = " + trim(t2[thirdA], 4) + "°. Law of sines: a / sin A = b / sin B = c / sin C = " + trim(f, 5) + ".";
			sols.push(fill(t2));
		}
		return { ok: true, case: cs, note: note, solutions: sols };
	}

	/* ---- sinusoids: y = A f(B (x - C)) + D ---- */
	function sinusoid(fn, p) {
		var B = Math.abs(p.B) || 1e-9, per = (fn === "tan" ? 180 : 360) / B;
		return { amplitude: fn === "tan" ? null : Math.abs(p.A), period: per, phase: p.C, midline: p.D, min: fn === "tan" ? null : p.D - Math.abs(p.A), max: fn === "tan" ? null : p.D + Math.abs(p.A), frequency: 1 / per };
	}
	function evalSinusoid(fn, p, xDeg) { var a = p.B * (xDeg - p.C) * R, v = fn === "sin" ? Math.sin(a) : fn === "cos" ? Math.cos(a) : Math.tan(a); return p.A * v + p.D; }

	/* ---- identities, for the checker ---- */
	var S = function (d) { return Math.sin(d * R); }, C = function (d) { return Math.cos(d * R); }, Tn = function (d) { return Math.tan(d * R); };
	var IDENTITIES = [
		{ id: "pyth", group: "Pythagorean", name: "sin²x + cos²x = 1", l: function (x) { return S(x) * S(x) + C(x) * C(x); }, r: function () { return 1; } },
		{ id: "pyth2", group: "Pythagorean", name: "1 + tan²x = sec²x", l: function (x) { return 1 + Tn(x) * Tn(x); }, r: function (x) { return 1 / (C(x) * C(x)); } },
		{ id: "pyth3", group: "Pythagorean", name: "1 + cot²x = csc²x", l: function (x) { return 1 + 1 / (Tn(x) * Tn(x)); }, r: function (x) { return 1 / (S(x) * S(x)); } },
		{ id: "tanq", group: "Quotient", name: "tan x = sin x / cos x", l: function (x) { return Tn(x); }, r: function (x) { return S(x) / C(x); } },
		{ id: "negs", group: "Even / odd", name: "sin(−x) = −sin x", l: function (x) { return S(-x); }, r: function (x) { return -S(x); } },
		{ id: "negc", group: "Even / odd", name: "cos(−x) = cos x", l: function (x) { return C(-x); }, r: function (x) { return C(x); } },
		{ id: "cof", group: "Cofunction", name: "sin(90° − x) = cos x", l: function (x) { return S(90 - x); }, r: function (x) { return C(x); } },
		{ id: "sinsum", group: "Sum and difference", name: "sin(x + y) = sin x cos y + cos x sin y", two: true, l: function (x, y) { return S(x + y); }, r: function (x, y) { return S(x) * C(y) + C(x) * S(y); } },
		{ id: "sindif", group: "Sum and difference", name: "sin(x − y) = sin x cos y − cos x sin y", two: true, l: function (x, y) { return S(x - y); }, r: function (x, y) { return S(x) * C(y) - C(x) * S(y); } },
		{ id: "cossum", group: "Sum and difference", name: "cos(x + y) = cos x cos y − sin x sin y", two: true, l: function (x, y) { return C(x + y); }, r: function (x, y) { return C(x) * C(y) - S(x) * S(y); } },
		{ id: "tansum", group: "Sum and difference", name: "tan(x + y) = (tan x + tan y) / (1 − tan x tan y)", two: true, l: function (x, y) { return Tn(x + y); }, r: function (x, y) { return (Tn(x) + Tn(y)) / (1 - Tn(x) * Tn(y)); } },
		{ id: "sin2", group: "Double angle", name: "sin 2x = 2 sin x cos x", l: function (x) { return S(2 * x); }, r: function (x) { return 2 * S(x) * C(x); } },
		{ id: "cos2", group: "Double angle", name: "cos 2x = cos²x − sin²x", l: function (x) { return C(2 * x); }, r: function (x) { return C(x) * C(x) - S(x) * S(x); } },
		{ id: "cos2b", group: "Double angle", name: "cos 2x = 1 − 2 sin²x", l: function (x) { return C(2 * x); }, r: function (x) { return 1 - 2 * S(x) * S(x); } },
		{ id: "tan2", group: "Double angle", name: "tan 2x = 2 tan x / (1 − tan²x)", l: function (x) { return Tn(2 * x); }, r: function (x) { return 2 * Tn(x) / (1 - Tn(x) * Tn(x)); } },
		{ id: "half", group: "Half angle", name: "sin²(x/2) = (1 − cos x) / 2", l: function (x) { return S(x / 2) * S(x / 2); }, r: function (x) { return (1 - C(x)) / 2; } },
		{ id: "prodsum", group: "Product to sum", name: "sin x cos y = ½[sin(x + y) + sin(x − y)]", two: true, l: function (x, y) { return S(x) * C(y); }, r: function (x, y) { return 0.5 * (S(x + y) + S(x - y)); } },
		{ id: "sumprod", group: "Sum to product", name: "sin x + sin y = 2 sin((x + y)/2) cos((x − y)/2)", two: true, l: function (x, y) { return S(x) + S(y); }, r: function (x, y) { return 2 * S((x + y) / 2) * C((x - y) / 2); } },
		{ id: "cube", group: "Triple angle", name: "sin 3x = 3 sin x − 4 sin³x", l: function (x) { return S(3 * x); }, r: function (x) { return 3 * S(x) - 4 * Math.pow(S(x), 3); } }
	];
	var TR = { fix: fix, trim: trim, norm360: norm360, parseAngle: parseAngle, fmtAngle: fmtAngle, piFraction: piFraction, trig: trig, quadrant: quadrant, referenceAngle: referenceAngle, exact: exact, inverse: inverse, solveTriangle: solveTriangle, sinusoid: sinusoid, evalSinusoid: evalSinusoid, IDENTITIES: IDENTITIES, R: R };
	if (typeof module !== "undefined" && module.exports) module.exports = TR; else root.TR = TR;
})(typeof window !== "undefined" ? window : this);
