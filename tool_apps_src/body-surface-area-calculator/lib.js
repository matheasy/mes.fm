/* MES Body Surface Area Calculator -- pure maths (no DOM). Browser global `BS`; node: require('./tool_apps_src/body-surface-area-calculator/lib.js'); tests: node tool_apps_src/body-surface-area-calculator-tests.js
 * Height in cm, weight in kg, area in square metres. */
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
	/* ---------- formulas: f(height cm, weight kg, sex, age) -> m^2 ---------- */
	var FORMULAS = {
		mosteller: { name: "Mosteller (1987)", f: function (h, w) { return Math.sqrt(h * w / 3600); }, note: "sqrt(height x weight / 3600). The simplest and most used in medicine today.", cite: "Mosteller RD. N Engl J Med 1987" },
		dubois: { name: "Du Bois & Du Bois (1916)", f: function (h, w) { return 0.007184 * Math.pow(w, 0.425) * Math.pow(h, 0.725); }, note: "The classic, from nine adults measured by wrapping the body in paper.", cite: "Arch Intern Med 1916" },
		haycock: { name: "Haycock (1978)", f: function (h, w) { return 0.024265 * Math.pow(w, 0.5378) * Math.pow(h, 0.3964); }, note: "Fitted on infants, children and adults; good for children.", cite: "J Pediatr 1978" },
		gehan: { name: "Gehan & George (1970)", f: function (h, w) { return 0.0235 * Math.pow(w, 0.51456) * Math.pow(h, 0.42246); }, note: "Fitted on children; used in paediatric oncology.", cite: "Cancer Chemother Rep 1970" },
		boyd: { name: "Boyd (1935)", f: function (h, w) { var g = w * 1000; return 0.0003207 * Math.pow(h, 0.3) * Math.pow(g, 0.7285 - 0.0188 * Math.log10(g)); }, note: "From a large set of measurements of children and adults.", cite: "Boyd E, 1935" },
		fujimoto: { name: "Fujimoto (1968)", f: function (h, w) { return 0.008883 * Math.pow(w, 0.444) * Math.pow(h, 0.663); }, note: "Fitted on Japanese adults.", cite: "Jpn J Hyg 1968" },
		takahira: { name: "Takahira (1925)", f: function (h, w) { return 0.007241 * Math.pow(w, 0.425) * Math.pow(h, 0.725); }, note: "Du Bois exponents with a constant fitted on Japanese adults.", cite: "Takahira H, 1925" },
		shuter: { name: "Shuter & Aslani (2000)", f: function (h, w) { return 0.00949 * Math.pow(w, 0.441) * Math.pow(h, 0.655); }, note: "Fitted on a modern adult sample.", cite: "Eur J Appl Physiol 2000" },
		schlich: { name: "Schlich (2010)", f: function (h, w, s) { return s === "f" ? 0.000975482 * Math.pow(w, 0.46) * Math.pow(h, 1.08) : 0.000579479 * Math.pow(w, 0.38) * Math.pow(h, 1.24); }, note: "Separate equations for men and women.", sex: true, cite: "Schlich E et al., 2010" },
		costeff: { name: "Costeff (1966)", f: function (h, w) { return (4 * w + 7) / (w + 90); }, note: "Weight only; designed for children (not height-based).", cite: "Costeff H, 1966" }
	};
	var ORDER = ["mosteller", "dubois", "haycock", "gehan", "boyd", "fujimoto", "takahira", "shuter", "schlich", "costeff"];
	function valid(h, w) { return h >= 40 && h <= 250 && w >= 2 && w <= 400; }
	function bsa(id, h, w, sex) { var F = FORMULAS[id]; if (!F || !valid(h, w)) return null; var v = F.f(h, w, sex === "f" ? "f" : "m"); return v > 0 && isFinite(v) ? v : null; }
	function all(h, w, sex) { var o = {}; ORDER.forEach(function (id) { o[id] = bsa(id, h, w, sex); }); return o; }
	function mean(h, w, sex) { var v = ORDER.map(function (id) { return bsa(id, h, w, sex); }).filter(function (x) { return x != null; }); return v.reduce(function (a, b) { return a + b; }, 0) / v.length; }
	/* ---------- uses ---------- */
	function dose(perM2, area, cap) { var a = cap > 0 ? Math.min(area, cap) : area; return perM2 * a; }
	function indexed(value, area) { return area > 0 ? value / area : null; }                // e.g. cardiac index = output / BSA
	function deindexGfr(egfr, area) { return egfr * area / 1.73; }                          // mL/min/1.73 m2 -> mL/min
	function indexGfr(gfr, area) { return gfr * 1.73 / area; }
	function pediatricDose(adult, area) { return adult * area / 1.73; }                    // BSA ratio method (adult standard 1.73 m2)
	// typical adult reference values
	var REFERENCE = { m: 1.9, f: 1.6, adult: 1.73 };
	function category(a) { return a < 1.0 ? "child-sized" : a < 1.5 ? "small" : a < 1.9 ? "average" : a < 2.2 ? "larger than average" : "large"; }
	var BS = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, FORMULAS: FORMULAS, ORDER: ORDER, valid: valid, bsa: bsa, all: all, mean: mean, dose: dose, indexed: indexed, deindexGfr: deindexGfr, indexGfr: indexGfr, pediatricDose: pediatricDose, REFERENCE: REFERENCE, category: category };
	if (typeof module !== "undefined" && module.exports) module.exports = BS; else root.BS = BS;
})(typeof window !== "undefined" ? window : this);
