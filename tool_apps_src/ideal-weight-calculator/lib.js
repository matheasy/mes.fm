/* MES Ideal Weight Calculator -- pure maths (no DOM). Browser global `IW`; node: require('./tool_apps_src/ideal-weight-calculator/lib.js'); tests: node tool_apps_src/ideal-weight-calculator-tests.js
 * Height in cm, weight in kg. The classic formulas are written for inches over 5 feet. */
(function (root) {
	"use strict";
	var LB = 0.45359237, IN = 2.54;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }
	function over(cm) { return cm / IN - 60; }   // inches over 5 feet (negative below)
	var FORMULAS = {
		devine: { name: "Devine (1974)", note: "Written for dosing drugs; still the most quoted.", f: function (s, cm) { return (s === "m" ? 50 : 45.5) + 2.3 * over(cm); } },
		robinson: { name: "Robinson (1983)", note: "A revision of Devine with smaller steps per inch.", f: function (s, cm) { return s === "m" ? 52 + 1.9 * over(cm) : 49 + 1.7 * over(cm); } },
		miller: { name: "Miller (1983)", note: "The lowest of the four for taller people.", f: function (s, cm) { return s === "m" ? 56.2 + 1.41 * over(cm) : 53.1 + 1.36 * over(cm); } },
		hamwi: { name: "Hamwi (1964)", note: "The oldest; the highest of the four.", f: function (s, cm) { return s === "m" ? 48 + 2.7 * over(cm) : 45.4 + 2.2 * over(cm); } }
	};
	var ORDER = ["devine", "robinson", "miller", "hamwi"];
	function valid(s, cm) { return (s === "m" || s === "f") && cm >= 120 && cm <= 230; }
	function value(id, s, cm) { if (!valid(s, cm) || !FORMULAS[id]) return null; var v = FORMULAS[id].f(s, cm); return v > 0 ? v : null; }
	function all(s, cm) { var o = {}; ORDER.forEach(function (id) { o[id] = value(id, s, cm); }); return o; }
	function bmiRange(cm) { var m = cm / 100; return { lo: 18.5 * m * m, hi: 24.9 * m * m }; }
	function mean(s, cm) { var v = ORDER.map(function (id) { return value(id, s, cm); }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }
	function span(s, cm) { var v = ORDER.map(function (id) { return value(id, s, cm); }); return { lo: Math.min.apply(null, v), hi: Math.max.apply(null, v) }; }
	function bmi(kg, cm) { var m = cm / 100; return kg / (m * m); }
	var IW = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, FORMULAS: FORMULAS, ORDER: ORDER, valid: valid, value: value, all: all, bmiRange: bmiRange, mean: mean, span: span, bmi: bmi };
	if (typeof module !== "undefined" && module.exports) module.exports = IW; else root.IW = IW;
})(typeof window !== "undefined" ? window : this);
