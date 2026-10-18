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

/* MES Trigonometry Calculator -- mes.fm/trigonometry (UI; maths in lib.js, global TR). localStorage "mes-trigonometry:v1". Links: ?tab=circle|calc|tri|graph|tables&a=45 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tg"); if (!root || !window.TR) return;
	var KEY = "mes-trigonometry:v1", T = TR.trim, R = Math.PI / 180;
	var st = { tab: "circle", ang: 45, cu: "deg", snap: false, rec: false, au: "deg", aIn: "30", ifn: "sin", iv: "0.5", tmode: "right", fn: "sin", g: { A: 1, B: 1, C: 0, D: 0 }, par: true, tr: 15, ts: 360, td: 4, tx: true, id: "pyth", ix: "25", iy: "40" }, ts = {};
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) Object.keys(st).forEach(function (k) { if (s[k] != null && typeof s[k] === typeof st[k]) st[k] = s[k]; }); if (s && s.g && typeof s.g === "object") ["A", "B", "C", "D"].forEach(function (k) { if (typeof s.g[k] === "number") st.g[k] = s.g[k]; }); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + (s || "") + "</div></div>"; }
	function num(v, d) { return v == null ? "undefined" : T(v, d == null ? 6 : d); }
	function parseVal(str) {
		var t = String(str || "").toLowerCase().replace(/,/g, ".").replace(/π/g, "pi").replace(/√\(/g, "sqrt(").replace(/√\s*(\d+(\.\d+)?)/g, "sqrt($1)").replace(/\s+/g, ""); if (!t || !/^[0-9a-z+\-*\/().]+$/.test(t)) return null;
		var chk = t.replace(/sqrt/g, "").replace(/pi/g, ""); if (/[a-z]/.test(chk)) return null; t = t.replace(/(\d|\))(sqrt|pi|\()/g, "$1*$2").replace(/(pi)(\d|\()/g, "$1*$2").replace(/sqrt/g, "Math.sqrt").replace(/pi/g, "Math.PI");
		try { var v = Function('"use strict";return (' + t + ")")(); return typeof v === "number" && isFinite(v) ? v : null; } catch (e) { return null; }
	}
	function toast(msg) { var t = $("tg-toast"); if (!t) { t = document.createElement("div"); t.id = "tg-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1600); }
	function svgPoint(svg, e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; var m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
	function fmtU(deg, u) { return u === "rad" ? T(deg * R, 4) + " rad" : T(deg, 2) + "°"; }

	/* ================= UNIT CIRCLE ================= */
	var C0 = [250, 200], RC = 140, FN = { sin: "#d64545", cos: "#2f6fd0", tan: "#1f9a56", csc: "#8e55c7", sec: "#e08a1e", cot: "#16a3a3" };
	var PRE = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];
	function setAngle(d, fromInput) {
		d = Math.max(-1440, Math.min(1440, d)); if (st.snap) d = Math.round(d / 15) * 15; st.ang = Math.round(d * 1e4) / 1e4; save();
		if (!fromInput) $("tg-c-in").value = st.cu === "rad" ? (TR.piFraction(st.ang) || T(st.ang * R, 5)).replace("−", "-") : T(st.ang, 3); rCircle();
	}
	$("tg-c-pre").innerHTML = PRE.map(function (d) { return '<button type="button" class="tu-chip" data-d="' + d + '">' + d + "°</button>"; }).join("");
	$("tg-c-pre").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setAngle(+b.dataset.d); });
	$("tg-c-in").addEventListener("input", function () { var v = TR.parseAngle(this.value, st.cu); if (v != null) { st.ang = Math.round(v * 1e6) / 1e6; save(); rCircle(); } });
	$("tg-c-unit").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.cu = b.dataset.u; save(); syncC(); setAngle(st.ang); });
	$("tg-c-snap").addEventListener("change", function () { st.snap = this.checked; save(); if (st.snap) setAngle(st.ang); });
	$("tg-c-rec").addEventListener("change", function () { st.rec = this.checked; save(); rCircle(); });
	function syncC() { [].forEach.call($("tg-c-unit").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.cu)); }); $("tg-c-snap").checked = st.snap; $("tg-c-rec").checked = st.rec; }
	function cl(v) { return Math.max(-9999, Math.min(9999, v)); }
	function rCircle() {
		var d = st.ang, t = TR.trig(d), r = d * R, cx = C0[0], cy = C0[1], px = cx + RC * Math.cos(r), py = cy - RC * Math.sin(r), s = "", i;
		for (i = -1; i <= 1; i += 0.5) { s += '<line class="t-gr" x1="' + (cx + i * RC) + '" y1="20" x2="' + (cx + i * RC) + '" y2="380"/><line class="t-gr" x1="' + (cx - 190) + '" y1="' + (cy + i * RC) + '" x2="' + (cx + 190) + '" y2="' + (cy + i * RC) + '"/>'; }
		s += '<line class="t-ax" x1="' + (cx - 195) + '" y1="' + cy + '" x2="' + (cx + 195) + '" y2="' + cy + '"/><line class="t-ax" x1="' + cx + '" y1="12" x2="' + cx + '" y2="388"/><circle class="t-cir" cx="' + cx + '" cy="' + cy + '" r="' + RC + '"/>';
		s += '<text class="t-tx" x="' + (cx + RC + 4) + '" y="' + (cy + 14) + '">1</text><text class="t-tx" x="' + (cx - RC - 14) + '" y="' + (cy + 14) + '">−1</text><text class="t-tx" x="' + (cx + 6) + '" y="' + (cy - RC - 4) + '">1</text><text class="t-tx" x="' + (cx + 6) + '" y="' + (cy + RC + 12) + '">−1</text>';
		// tangent line at (1,0)
		s += '<line class="t-ax" x1="' + (cx + RC) + '" y1="12" x2="' + (cx + RC) + '" y2="388" style="stroke-dasharray:4 4"/>';
		var arcR = 36, a0 = 0, sp = ((d % 360) + 360) % 360; if (d < 0) { sp = -(((-d) % 360)); }
		var spa = d, endx = cx + arcR * Math.cos(r), endy = cy - arcR * Math.sin(r), big = Math.abs(spa % 360) > 180 ? 1 : 0, sweep = spa >= 0 ? 0 : 1; if (Math.abs(spa) >= 360) { s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + arcR + '" fill="none" stroke="#e08a1e" stroke-width="2.5" stroke-dasharray="3 3"/>'; } else s += '<path d="M' + (cx + arcR) + "," + cy + " A" + arcR + "," + arcR + " 0 " + big + " " + sweep + " " + endx.toFixed(1) + "," + endy.toFixed(1) + '" fill="none" stroke="#e08a1e" stroke-width="3"/>';
		s += '<text class="t-tx" style="fill:#e08a1e;font-weight:700" x="' + (cx + 50 * Math.cos(r / 2)) + '" y="' + (cy - 50 * Math.sin(r / 2) + 4) + '" text-anchor="middle">θ</text>';
		s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + px + '" y2="' + py + '" stroke="#2c3e55" stroke-width="2.4"/>';
		s += '<line class="t-ln" style="stroke:' + FN.cos + '" x1="' + cx + '" y1="' + cy + '" x2="' + px + '" y2="' + cy + '"/><line class="t-ln" style="stroke:' + FN.sin + '" x1="' + px + '" y1="' + cy + '" x2="' + px + '" y2="' + py + '"/>';
		if (t.tan != null) { var ty = cy - RC * Math.max(-3, Math.min(3, t.tan)); s += '<line class="t-ln" style="stroke:' + FN.tan + '" x1="' + (cx + RC) + '" y1="' + cy + '" x2="' + (cx + RC) + '" y2="' + ty + '"/><line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + RC) + '" y2="' + (cy - RC * t.tan) + '" stroke="' + FN.tan + '" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.7"/>'; }
		if (st.rec) {
			if (t.sec != null) s += '<line class="t-ln" style="stroke:' + FN.sec + ';stroke-width:2.4" x1="' + cx + '" y1="' + cy + '" x2="' + (cx + RC * Math.max(-3, Math.min(3, t.sec))) + '" y2="' + cy + '" opacity="0.85"/>';
			if (t.csc != null) s += '<line class="t-ln" style="stroke:' + FN.csc + ';stroke-width:2.4" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - RC * Math.max(-3, Math.min(3, t.csc))) + '" opacity="0.85"/>';
			if (t.cot != null) s += '<line class="t-ln" style="stroke:' + FN.cot + ';stroke-width:2.4" x1="' + cx + '" y1="' + (cy - RC) + '" x2="' + (cx + RC * Math.max(-3, Math.min(3, t.cot))) + '" y2="' + (cy - RC) + '" opacity="0.85"/>';
		}
		s += '<circle class="t-h" data-h="1" tabindex="0" role="slider" aria-label="Angle point" aria-valuenow="' + T(d, 1) + '" cx="' + px + '" cy="' + py + '" r="11"/>';
		var ly = 34; [["sin", t.sin], ["cos", t.cos], ["tan", t.tan]].concat(st.rec ? [["csc", t.csc], ["sec", t.sec], ["cot", t.cot]] : []).forEach(function (f) { s += '<text class="t-lb" x="470" y="' + ly + '" style="fill:' + FN[f[0]] + '">' + f[0] + " θ = " + num(f[1], 4) + "</text>"; ly += 26; });
		s += '<text class="t-lb" x="470" y="' + (ly + 10) + '" style="fill:#e08a1e">θ = ' + T(d, 2) + "°</text>" + '<text class="t-tx" x="470" y="' + (ly + 30) + '">= ' + T(d * R, 4) + " rad" + (TR.piFraction(d) ? " = " + TR.piFraction(d) : "") + "</text>";
		var h = $("tg-svg-c"); var had = document.activeElement && h.contains(document.activeElement); h.innerHTML = s; if (had) h.querySelector("[data-h]").focus({ preventScroll: true });
		// wave strip
		var w = "", W0 = 44, W1 = 620, YM = 95, YA = 70, X = function (dd) { return W0 + (((dd % 360) + 360) % 360) / 360 * (W1 - W0); };
		for (i = 0; i <= 4; i++) { var xx = W0 + i * (W1 - W0) / 4; w += '<line class="t-gr" x1="' + xx + '" y1="14" x2="' + xx + '" y2="176"/><text class="t-tx" x="' + xx + '" y="188" text-anchor="middle">' + i * 90 + "°</text>"; }
		w += '<line class="t-ax" x1="' + W0 + '" y1="' + YM + '" x2="' + W1 + '" y2="' + YM + '"/>'; ["sin", "cos"].forEach(function (f) { var p = []; for (var q = 0; q <= 360; q += 3) p.push((W0 + q / 360 * (W1 - W0)).toFixed(1) + "," + (YM - YA * (f === "sin" ? Math.sin(q * R) : Math.cos(q * R))).toFixed(1)); w += '<polyline points="' + p.join(" ") + '" fill="none" stroke="' + FN[f] + '" stroke-width="2.6"/>'; });
		var mx = X(d); w += '<line x1="' + mx + '" y1="14" x2="' + mx + '" y2="176" stroke="#e08a1e" stroke-width="2" stroke-dasharray="4 3"/><circle cx="' + mx + '" cy="' + (YM - YA * t.sin) + '" r="5.5" fill="' + FN.sin + '"/><circle cx="' + mx + '" cy="' + (YM - YA * t.cos) + '" r="5.5" fill="' + FN.cos + '"/><text class="t-tx" x="50" y="20" style="fill:' + FN.sin + ';font-weight:700">sin</text><text class="t-tx" x="78" y="20" style="fill:' + FN.cos + ';font-weight:700">cos</text><text class="t-tx" x="' + (W0 - 6) + '" y="' + (YM - YA + 4) + '" text-anchor="end">1</text><text class="t-tx" x="' + (W0 - 6) + '" y="' + (YM + YA + 4) + '" text-anchor="end">−1</text>';
		$("tg-svg-w").innerHTML = w;
		var ex = TR.exact(d), q = TR.quadrant(d), ref = TR.referenceAngle(d), qn = q ? "Quadrant " + ["I", "II", "III", "IV"][q - 1] : "On an axis";
		var sg = q ? { 1: "all positive", 2: "only sin positive", 3: "only tan positive", 4: "only cos positive" }[q] : "";
		$("tg-c-stats").innerHTML = stat("sin θ", num(t.sin, 6), ex ? "= " + esc(ex.sin) : "", "tu-stat--hero") + stat("cos θ", num(t.cos, 6), ex ? "= " + esc(ex.cos) : "", "tu-stat--hero") + stat("tan θ", num(t.tan, 6), ex && ex.tan ? "= " + esc(ex.tan) : t.tan == null ? "vertical line: no value" : "") + stat("csc θ", num(t.csc, 6), "1 / sin θ") + stat("sec θ", num(t.sec, 6), "1 / cos θ") + stat("cot θ", num(t.cot, 6), "1 / tan θ") + stat("Quadrant", qn, sg) + stat("Reference angle", T(ref, 3) + "°", "the acute angle to the x-axis");
		var cf = []; cf.push("<b>Pythagoras on the unit circle:</b> sin²θ + cos²θ = " + T(t.sin * t.sin, 4) + " + " + T(t.cos * t.cos, 4) + " = <span class=\"tg-ok\">" + T(t.sin * t.sin + t.cos * t.cos, 6) + "</span>.");
		if (q) cf.push("<b>Reading the sign (ASTC):</b> in quadrant " + ["I", "II", "III", "IV"][q - 1] + ", " + sg + ". Reference angle " + T(ref, 3) + "°, so |sin θ| = sin " + T(ref, 3) + "° = " + T(Math.sin(ref * R), 6) + " and |cos θ| = " + T(Math.cos(ref * R), 6) + ".");
		if (Math.abs(d) >= 360 || d < 0) cf.push("<b>Coterminal angle:</b> " + T(d, 3) + "° points the same way as " + T(TR.norm360(d), 3) + "° (add or subtract full turns of 360°), so every function value is the same.");
		if (t.tan != null) cf.push("<b>tan θ = sin θ ÷ cos θ</b> = " + T(t.sin, 4) + " ÷ " + T(t.cos, 4) + " = " + T(t.tan, 5) + ": the slope of the radius, and the length cut off on the tangent line at x = 1.");
		$("tg-c-facts").innerHTML = '<h3 style="margin-top:0;">What is going on?</h3><ul style="margin:0;padding-left:1.2em;line-height:1.55;"><li>' + cf.join("</li><li>") + "</li></ul>";
	}
	(function () {
		var svg = $("tg-svg-c"), on = false;
		svg.addEventListener("pointerdown", function (e) { if (e.target.closest("[data-h]")) { on = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); } });
		svg.addEventListener("pointermove", function (e) { if (!on) return; var p = svgPoint(svg, e), a = Math.atan2(C0[1] - p.y, p.x - C0[0]) / R; if (a < 0) a += 360; var old = ((st.ang % 360) + 360) % 360, base = st.ang - old, dl = a - old; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; setAngle(st.ang + dl); });
		var end = function () { on = false; }; svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
		svg.addEventListener("keydown", function (e) { var dd = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key]; if (!dd) return; e.preventDefault(); setAngle(st.ang + dd * (e.shiftKey ? 15 : 1)); });
	})();

	/* ================= CALCULATOR ================= */
	function rCalc() {
		var d = TR.parseAngle($("tg-a-in").value, st.au), tab = $("tg-a-tab"), note = $("tg-a-note");
		if (d == null) { tab.innerHTML = ""; note.textContent = $("tg-a-in").value.trim() ? "Could not read that angle. Try 45, 45°, pi/4, 0.785 rad or 50 grad." : "Enter an angle."; return; }
		var t = TR.trig(d), ex = TR.exact(d), rows = [["sin", t.sin, ex && ex.sin, ""], ["cos", t.cos, ex && ex.cos, ""], ["tan", t.tan, ex && ex.tan, ""], ["csc", t.csc, null, "1 / sin"], ["sec", t.sec, null, "1 / cos"], ["cot", t.cot, null, "1 / tan"]];
		tab.innerHTML = "<thead><tr><th>Function</th><th>Value</th><th>Exact</th></tr></thead><tbody>" + rows.map(function (r) { return "<tr><td><b>" + r[0] + "</b> " + T(d, 4) + "°</td><td>" + (r[1] == null ? "undefined" : esc(T(r[1], 10))) + "</td><td>" + (r[2] ? esc(r[2]) : r[3] ? esc(r[3]) : "") + "</td></tr>"; }).join("") + "</tbody>";
		note.innerHTML = "Angle: <b>" + T(d, 6) + "°</b> = <b>" + T(d * R, 8) + " rad</b>" + (TR.piFraction(d) ? " = " + TR.piFraction(d) : "") + " = " + T(d / 0.9, 5) + " grad. Quadrant " + (TR.quadrant(d) ? ["I", "II", "III", "IV"][TR.quadrant(d) - 1] : "boundary") + ", reference angle " + T(TR.referenceAngle(d), 4) + "°.";
	}
	$("tg-a-in").addEventListener("input", function () { st.aIn = this.value; save(); rCalc(); });
	$("tg-a-unit").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.au = b.dataset.u; save(); [].forEach.call($("tg-a-unit").children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); rCalc(); });
	function rInv() {
		var v = parseVal($("tg-i-v").value), fn = $("tg-i-fn").value, out = $("tg-i-out"); st.ifn = fn; st.iv = $("tg-i-v").value; save();
		if (v == null) { out.innerHTML = $("tg-i-v").value.trim() ? '<span class="tg-bad">Could not read that value.</span>' : ""; return; }
		var r = TR.inverse(fn, v); if (!r) { out.innerHTML = '<span class="tg-bad">No angle has ' + fn + " = " + esc(T(v, 6)) + "</span>" + (fn === "sin" || fn === "cos" ? ": sin and cos only take values from −1 to 1." : fn === "csc" || fn === "sec" ? ": csc and sec are never between −1 and 1." : "."); return; }
		out.innerHTML = fn + "⁻¹(" + esc(T(v, 6)) + ") <b>= " + esc(T(r.principal, 6)) + "°</b> = " + T(r.principal * R, 6) + " rad (principal value).<br>Every solution from 0° to 360°: <b>" + r.solutions.map(function (x) { return T(x, 6) + "°"; }).join(", ") + "</b>.<br>All solutions: <b>" + esc(r.general.replace(/x/g, "θ")) + "</b> where k is any whole number.";
	}
	$("tg-i-fn").addEventListener("change", rInv); $("tg-i-v").addEventListener("input", rInv);

	/* ================= TRIANGLES ================= */
	var FIELDS = { right: [["a", "a (opposite A)"], ["b", "b (adjacent to A)"], ["c", "c (hypotenuse)"], ["A", "Angle A (°)"], ["B", "Angle B (°)"]], any: [["a", "side a"], ["b", "side b"], ["c", "side c"], ["A", "Angle A (°)"], ["B", "Angle B (°)"], ["C", "Angle C (°)"]] };
	var EX = [["Right: legs 3 & 4", "right", { a: "3", b: "4" }], ["Right: hypotenuse 13, A = 30°", "right", { c: "13", A: "30" }], ["SSS: 7, 8, 9", "any", { a: "7", b: "8", c: "9" }], ["SAS: b 5, c 7, A 49°", "any", { b: "5", c: "7", A: "49" }], ["ASA: A 40°, B 60°, c 10", "any", { A: "40", B: "60", c: "10" }], ["SSA (two triangles): a 6, b 8, A 30°", "any", { a: "6", b: "8", A: "30" }]];
	$("tg-t-ex").innerHTML = EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("tg-t-ex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EX[+b.dataset.i]; st.tmode = x[1]; ts = Object.assign({}, x[2]); save(); buildT(); rTri(); });
	$("tg-t-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.tmode = b.dataset.m; ts = {}; save(); buildT(); rTri(); });
	$("tg-t-clear").addEventListener("click", function () { ts = {}; buildT(); rTri(); });
	function buildT() {
		[].forEach.call($("tg-t-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === st.tmode)); });
		$("tg-t-help").innerHTML = st.tmode === "right" ? "C is the right angle (90°). Fill in <b>any two</b> values (at least one side); the rest is worked out." : "Fill in <b>any three</b> values, at least one a side. Side a is opposite angle A, and so on.";
		$("tg-t-fields").innerHTML = FIELDS[st.tmode].map(function (f) { return '<div class="tu-field"><label for="tg-t-' + f[0] + '">' + esc(f[1]) + '</label><input id="tg-t-' + f[0] + '" data-k="' + f[0] + '" class="tu-input" type="text" inputmode="decimal" autocomplete="off" value="' + esc(ts[f[0]] || "") + '"></div>'; }).join("");
	}
	$("tg-t-fields").addEventListener("input", function (e) { var k = e.target.dataset.k; if (k) { ts[k] = e.target.value; rTri(); } });
	function figure(s) {
		var A = [0, 0], B = [s.c, 0], C = [s.b * Math.cos(s.A * R), s.b * Math.sin(s.A * R)], xs = [A[0], B[0], C[0]], ys = [0, 0, C[1]], w = Math.max.apply(null, xs) - Math.min.apply(null, xs), h = Math.max.apply(null, ys) - Math.min.apply(null, ys), k = Math.min(210 / w, 120 / h), ox = 30 - Math.min.apply(null, xs) * k, oy = 150;
		function P(p) { return [ox + p[0] * k, oy - p[1] * k]; } var pa = P(A), pb = P(B), pc = P(C), cen = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3];
		function lab(p, q, txt) { var m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], dx = m[0] - cen[0], dy = m[1] - cen[1], n = Math.hypot(dx, dy) || 1; return '<text class="t-lbl" x="' + (m[0] + dx / n * 17).toFixed(1) + '" y="' + (m[1] + dy / n * 15 + 4).toFixed(1) + '">' + txt + "</text>"; }
		function vl(p, nm, v) { var dx = p[0] - cen[0], dy = p[1] - cen[1], n = Math.hypot(dx, dy) || 1; return '<text class="t-lbl" style="fill:#d64545" x="' + (p[0] + dx / n * 24).toFixed(1) + '" y="' + (p[1] + dy / n * 20 + 4).toFixed(1) + '">' + nm + " " + T(v, 1) + "°</text>"; }
		var g = '<polygon class="t-fg" points="' + [pa, pb, pc].map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>' + lab(pb, pc, "a = " + T(s.a, 3)) + lab(pc, pa, "b = " + T(s.b, 3)) + lab(pa, pb, "c = " + T(s.c, 3)) + vl(pa, "A", s.A) + vl(pb, "B", s.B) + vl(pc, "C", s.C);
		return '<svg viewBox="0 0 290 180" role="img" aria-label="The triangle">' + g + "</svg>";
	}
	function rTri() {
		var out = $("tg-t-out"), ks = {}, n = 0, need = st.tmode === "right" ? 2 : 3; FIELDS[st.tmode].forEach(function (f) { var raw = (ts[f[0]] || "").trim(); if (raw) { var v = TR.parseAngle(raw, "deg"); if (f[0] > "Z" || true) { var nn = parseFloat(raw.replace(",", ".")); ks[f[0]] = nn; n++; } } });
		var bad = Object.keys(ks).filter(function (k) { return !(ks[k] > 0) || !isFinite(ks[k]); }); if (bad.length) { out.innerHTML = '<div class="tu-card"><span class="tg-bad">Values must be positive numbers (' + bad.join(", ") + ").</span></div>"; return; }
		if (n < need) { out.innerHTML = '<div class="tu-card tu-card--tint">Enter ' + (need - n) + " more value" + (need - n === 1 ? "" : "s") + " to solve the triangle.</div>"; return; }
		if (n > need) { out.innerHTML = '<div class="tu-card"><span class="tg-bad">Too many values: leave exactly ' + need + " filled in (the others are calculated).</span></div>"; return; }
		var known = Object.assign({}, ks); if (st.tmode === "right") known.C = 90; var res = TR.solveTriangle(known);
		if (!res.ok) { out.innerHTML = '<div class="tu-card"><span class="tg-bad">' + esc(res.error) + "</span></div>"; return; }
		out.innerHTML = '<div class="tu-card tu-card--tint"><b>' + esc(res.case) + ":</b> " + esc(res.note) + "</div>" + res.solutions.map(function (s, i) {
			return '<div class="tu-card tg-sol"><h3>' + (res.solutions.length > 1 ? "Triangle " + (i + 1) : "Solution") + '</h3><div class="tg-fig">' + figure(s) + '</div><div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Side</th><th>Length</th><th>Angle</th><th>Size</th></tr></thead><tbody>' + ["a", "b", "c"].map(function (k, j) { var A = ["A", "B", "C"][j]; return "<tr><td>" + k + "</td><td>" + T(s[k], 6) + "</td><td>" + A + "</td><td>" + T(s[A], 5) + "° (" + T(s[A] * R, 5) + " rad)</td></tr>"; }).join("") + "</tbody></table></div><p style=\"margin:0.6em 0 0;\">Area = ½ab sin C = <b>" + T(s.area, 6) + "</b> · Perimeter = <b>" + T(s.perimeter, 6) + "</b></p></div>";
		}).join("");
	}

	/* ================= GRAPHS ================= */
	var GS = [["A", "Amplitude A", -3, 3, 0.1], ["B", "Frequency B", 0.25, 4, 0.05], ["C", "Phase shift C (°)", -180, 180, 5], ["D", "Midline D", -3, 3, 0.1]], GW = 640, GH = 330, GL = 44, GR = 12, GT = 12, GB = 26, X0 = -180, X1 = 540, YM = 5;
	$("tg-g-sl").innerHTML = GS.map(function (s) { return '<div><label for="tg-g-' + s[0] + '">' + s[1] + ' = <b id="tg-g-' + s[0] + 'o"></b></label><input type="range" id="tg-g-' + s[0] + '" data-k="' + s[0] + '" min="' + s[2] + '" max="' + s[3] + '" step="' + s[4] + '"></div>'; }).join("");
	$("tg-g-sl").addEventListener("input", function (e) { var k = e.target.dataset.k; if (k) { st.g[k] = +e.target.value; save(); rGraph(); } });
	$("tg-g-fn").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.fn = b.dataset.f; save(); rGraph(); } });
	$("tg-g-par").addEventListener("change", function () { st.par = this.checked; save(); rGraph(); });
	$("tg-g-reset").addEventListener("click", function () { st.g = { A: 1, B: 1, C: 0, D: 0 }; save(); rGraph(); });
	function gx(x) { return GL + (x - X0) / (X1 - X0) * (GW - GL - GR); } function gy(y) { return GT + (YM - y) / (2 * YM) * (GH - GT - GB); }
	function path(fn, p) { var segs = [], cur = [], prev = null; for (var x = X0; x <= X1; x += 0.5) { var y = TR.evalSinusoid(fn, p, x); if (!isFinite(y) || Math.abs(y) > 50 || (prev != null && Math.abs(y - prev) > 8 && fn === "tan")) { if (cur.length > 1) segs.push(cur); cur = []; prev = null; continue; } cur.push(gx(x).toFixed(1) + "," + gy(Math.max(-YM - 1, Math.min(YM + 1, y))).toFixed(1)); prev = y; } if (cur.length > 1) segs.push(cur); return segs; }
	function rGraph() {
		var fn = st.fn, p = st.g, s = "", i; [].forEach.call($("tg-g-fn").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.f === fn)); }); GS.forEach(function (q) { $("tg-g-" + q[0]).value = p[q[0]]; $("tg-g-" + q[0] + "o").textContent = T(p[q[0]], 2); });
		for (i = -4; i <= 4; i++) s += '<line class="t-gr" x1="' + GL + '" y1="' + gy(i) + '" x2="' + (GW - GR) + '" y2="' + gy(i) + '"/><text class="t-tx" x="' + (GL - 6) + '" y="' + (gy(i) + 4) + '" text-anchor="end">' + i + "</text>";
		for (i = -180; i <= 540; i += 90) s += '<line class="t-gr" x1="' + gx(i) + '" y1="' + GT + '" x2="' + gx(i) + '" y2="' + (GH - GB) + '"/><text class="t-tx" x="' + gx(i) + '" y="' + (GH - 8) + '" text-anchor="middle">' + i + "°</text>";
		s += '<line class="t-ax" x1="' + GL + '" y1="' + gy(0) + '" x2="' + (GW - GR) + '" y2="' + gy(0) + '"/><line class="t-ax" x1="' + gx(0) + '" y1="' + GT + '" x2="' + gx(0) + '" y2="' + (GH - GB) + '"/>';
		var info = TR.sinusoid(fn, p);
		if (p.D !== 0) s += '<line x1="' + GL + '" y1="' + gy(p.D) + '" x2="' + (GW - GR) + '" y2="' + gy(p.D) + '" stroke="#8a93a0" stroke-width="1.4" stroke-dasharray="6 4"/>';
		if (st.par) path(fn, { A: 1, B: 1, C: 0, D: 0 }).forEach(function (sg) { s += '<polyline points="' + sg.join(" ") + '" fill="none" stroke="#9aa5b4" stroke-width="2" stroke-dasharray="6 5"/>'; });
		path(fn, p).forEach(function (sg) { s += '<polyline points="' + sg.join(" ") + '" fill="none" stroke="' + FN[fn] + '" stroke-width="3.2" stroke-linejoin="round"/>'; });
		if (fn === "tan") for (var k = -3; k <= 6; k++) { var ax = (90 + 180 * k) / p.B + p.C; if (ax > X0 && ax < X1) s += '<line x1="' + gx(ax) + '" y1="' + GT + '" x2="' + gx(ax) + '" y2="' + (GH - GB) + '" stroke="#c0392b" stroke-width="1" stroke-dasharray="3 5" opacity="0.5"/>'; }
		s += '<g id="tg-g-cur"></g>'; $("tg-svg-g").innerHTML = s;
		var ph = p.C ? " (x " + (p.C > 0 ? "− " : "+ ") + T(Math.abs(p.C), 1) + "°)" : "";
		var eq = "y = " + (p.A === 1 ? "" : p.A === -1 ? "−" : T(p.A, 2) + " ") + fn + (p.B === 1 && !p.C ? " x" : "(" + (p.B === 1 ? "" : T(p.B, 2)) + (p.C ? (p.B === 1 ? "" : "") + "(x" + (p.C > 0 ? " − " : " + ") + T(Math.abs(p.C), 1) + "°)" : "x") + ")") + (p.D ? (p.D > 0 ? " + " : " − ") + T(Math.abs(p.D), 2) : ""); $("tg-g-eq").textContent = eq;
		$("tg-g-stats").innerHTML = (fn === "tan" ? stat("Amplitude", "none", "tan grows without limit") : stat("Amplitude", T(info.amplitude, 3), "|A|, half the height from min to max")) + stat("Period", T(info.period, 3) + "°", T(info.period * R, 4) + " rad · " + (fn === "tan" ? "180°" : "360°") + " ÷ |B|") + stat("Phase shift", T(p.C, 2) + "°", p.C > 0 ? "shifted right" : p.C < 0 ? "shifted left" : "none") + stat("Midline", "y = " + T(p.D, 2), "vertical shift D") + (fn === "tan" ? stat("Asymptotes", "x = " + T(90 / p.B + p.C, 2) + "° + k·" + T(info.period, 2) + "°", "where the function is undefined") : stat("Range", T(info.min, 2) + " to " + T(info.max, 2), "Frequency " + T(info.frequency * 360, 3) + " cycles per 360°"));
	}
	$("tg-svg-g").addEventListener("pointermove", function (e) {
		var svg = this, q = svgPoint(svg, e), x = X0 + (q.x - GL) / (GW - GL - GR) * (X1 - X0); if (x < X0 || x > X1) return; var y = TR.evalSinusoid(st.fn, st.g, x), c = svg.querySelector("#tg-g-cur"); if (!c) return;
		c.innerHTML = isFinite(y) && Math.abs(y) < YM + 1 ? '<line x1="' + gx(x) + '" y1="' + GT + '" x2="' + gx(x) + '" y2="' + (GH - GB) + '" stroke="#e08a1e" stroke-width="1.5"/><circle cx="' + gx(x) + '" cy="' + gy(y) + '" r="5" fill="#e08a1e"/>' : ""; $("tg-g-trace").textContent = "x = " + T(x, 1) + "° (" + T(x * R, 3) + " rad), y = " + (isFinite(y) ? T(y, 4) : "undefined");
	});

	/* ================= TABLES & IDENTITIES ================= */
	function rTable() {
		var max = +$("tg-tb-r").value, step = +$("tg-tb-s").value, dc = +$("tg-tb-d").value, ex = $("tg-tb-x").checked, rows = "", hasEx = false, d;
		st.tr = step; st.ts = max; st.td = dc; st.tx = ex; save(); var cnt = 0;
		for (d = 0; d <= max + 1e-9; d += step) { var t = TR.trig(d), e = ex ? TR.exact(d) : null; if (e) hasEx = true; rows += "<tr><td><b>" + d + "°</b></td><td>" + (TR.piFraction(d) || T(d * R, 4)) + "</td><td>" + num(t.sin, dc) + "</td><td>" + num(t.cos, dc) + "</td><td>" + num(t.tan, dc) + "</td>" + (ex ? "<td>" + (e ? esc(e.sin) : "") + "</td><td>" + (e ? esc(e.cos) : "") + "</td><td>" + (e && e.tan ? esc(e.tan) : "") + "</td>" : "") + "</tr>"; if (++cnt > 400) break; }
		$("tg-tb").innerHTML = "<thead><tr><th>Angle</th><th>Radians</th><th>sin</th><th>cos</th><th>tan</th>" + (ex ? "<th>sin exact</th><th>cos exact</th><th>tan exact</th>" : "") + "</tr></thead><tbody>" + rows + "</tbody>";
	}
	["tg-tb-r", "tg-tb-s", "tg-tb-d", "tg-tb-x"].forEach(function (id) { $(id).addEventListener("change", rTable); });
	$("tg-id-s").innerHTML = TR.IDENTITIES.map(function (i) { return '<option value="' + i.id + '">' + esc(i.group + ": " + i.name) + "</option>"; }).join("");
	function rIdent() {
		var id = TR.IDENTITIES.filter(function (i) { return i.id === $("tg-id-s").value; })[0] || TR.IDENTITIES[0], x = parseFloat($("tg-id-x").value.replace(",", ".")), y = parseFloat($("tg-id-y").value.replace(",", ".")); st.id = id.id; st.ix = $("tg-id-x").value; st.iy = $("tg-id-y").value; save(); $("tg-id-yf").hidden = !id.two;
		if (!isFinite(x) || (id.two && !isFinite(y))) { $("tg-id-out").textContent = "Enter the angle(s) in degrees."; return; }
		var l = id.l(x, y), r = id.r(x, y); if (!isFinite(l) || !isFinite(r)) { $("tg-id-out").innerHTML = '<span class="tg-bad">This identity is not defined at these angles</span> (a tan, cot, sec or csc blows up). Try other values.'; return; }
		var ok = Math.abs(l - r) < 1e-9 * Math.max(1, Math.abs(l)); $("tg-id-out").innerHTML = "<b>" + esc(id.name) + "</b><br>at x = " + T(x, 4) + "°" + (id.two ? ", y = " + T(y, 4) + "°" : "") + ":<br>Left side = <b>" + T(l, 10) + "</b><br>Right side = <b>" + T(r, 10) + "</b><br>" + (ok ? '<span class="tg-ok">Equal ✓ (difference ' + (Math.abs(l - r) < 1e-12 ? "0" : (l - r).toExponential(1)) + ")</span>" : '<span class="tg-bad">Not equal: difference ' + T(l - r, 8) + "</span>");
	}
	["tg-id-s", "tg-id-x", "tg-id-y"].forEach(function (id) { $(id).addEventListener("input", rIdent); });
	(function () { var g = "", s = ""; TR.IDENTITIES.forEach(function (i) { if (i.group !== g) { g = i.group; s += '<tr><td colspan="1"><b>' + esc(g) + "</b></td></tr>"; } s += "<tr><td>&nbsp;&nbsp;" + esc(i.name) + "</td></tr>"; }); $("tg-id-ref").innerHTML = s; })();

	/* ================= tabs ================= */
	function show(tab) {
		st.tab = tab; save(); [].forEach.call($("tg-tabs").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === tab)); b.setAttribute("aria-selected", String(b.dataset.t === tab)); }); [].forEach.call(root.querySelectorAll("section[data-p]"), function (s) { s.hidden = s.dataset.p !== tab; });
		if (tab === "circle") { syncC(); setAngle(st.ang); } else if (tab === "calc") { $("tg-a-in").value = st.aIn; [].forEach.call($("tg-a-unit").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.au)); }); $("tg-i-fn").value = st.ifn; $("tg-i-v").value = st.iv; rCalc(); rInv(); } else if (tab === "tri") { buildT(); rTri(); } else if (tab === "graph") rGraph(); else { $("tg-tb-r").value = st.ts; $("tg-tb-s").value = st.tr; $("tg-tb-d").value = st.td; $("tg-tb-x").checked = st.tx; $("tg-id-s").value = st.id; $("tg-id-x").value = st.ix; $("tg-id-y").value = st.iy; rTable(); rIdent(); }
	}
	$("tg-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { show(b.dataset.t); try { history.replaceState(null, "", "?tab=" + b.dataset.t); } catch (x) {} } });
	load(); var qp = new URLSearchParams(location.search), tq = qp.get("tab"); if (tq && /^(circle|calc|tri|graph|tables)$/.test(tq)) st.tab = tq; var aq = qp.get("a"); if (aq) { var av = TR.parseAngle(aq, "deg"); if (av != null) { st.ang = av; st.aIn = aq; } }
	show(st.tab);
})();
