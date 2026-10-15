/* MES Body Fat Calculator -- pure maths (no DOM). Browser global `BF`; node: require('./tool_apps_src/body-fat-calculator/lib.js'); tests: node tool_apps_src/body-fat-calculator-tests.js
 * Everything is stored in kg and cm; pounds / inches are conversions of those. */
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
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; } function inToCm(i) { return i * IN; } function cmToIn(c) { return c / IN; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }
	function bmi(kg, cm) { var m = cm / 100; return kg / (m * m); }

	/* ---------- methods: all return body-fat percent, or null when the inputs make no sense ---------- */
	// U.S. Navy (Hodgdon & Beckett, 1984), metric form. Tape measurements in cm.
	function navy(sex, cm, neck, waist, hip) {
		var v;
		if (sex === "m") { if (!(waist > neck) || !(cm > 0) || !(neck > 0)) return null; v = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(cm)) - 450; }
		else { if (!(hip > 0) || !(waist + hip > neck) || !(neck > 0) || !(cm > 0)) return null; v = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(cm)) - 450; }
		return isFinite(v) && v > 0 ? v : null;
	}
	// Deurenberg et al. (1991) adult formula from BMI, age and sex
	function fromBmi(sex, kg, cm, age) {
		if (!(kg > 0) || !(cm > 0) || !(age >= 15)) return null;
		var v = 1.2 * bmi(kg, cm) + 0.23 * age - 10.8 * (sex === "m" ? 1 : 0) - 5.4; return v > 0 ? v : null;
	}
	// Waist-to-height ratio is a risk marker, not a body-fat formula
	function whtr(waist, cm) { return waist > 0 && cm > 0 ? waist / cm : null; }
	function whr(waist, hip) { return waist > 0 && hip > 0 ? waist / hip : null; }

	/* ---------- categories (American Council on Exercise) ---------- */
	var CATS = {
		m: [[2, "Below essential", "low"], [6, "Essential fat", "ess"], [14, "Athletes", "ath"], [18, "Fitness", "fit"], [25, "Average", "avg"], [Infinity, "Obese", "obese"]],
		f: [[10, "Below essential", "low"], [14, "Essential fat", "ess"], [21, "Athletes", "ath"], [25, "Fitness", "fit"], [32, "Average", "avg"], [Infinity, "Obese", "obese"]]
	};
	function category(sex, pct) { var L = CATS[sex] || CATS.m; for (var i = 0; i < L.length; i++) if (pct < L[i][0]) return { name: L[i][1], key: L[i][2], index: i }; return { name: L[L.length - 1][1], key: L[L.length - 1][2], index: L.length - 1 }; }
	function masses(kg, pct) { var fat = kg * pct / 100; return { fat: fat, lean: kg - fat }; }
	// weight at a different body-fat %, keeping the lean mass the same
	function weightAt(kg, pct, target) { var lean = kg * (1 - pct / 100); return lean / (1 - target / 100); }
	// fat-free mass index and fat mass index (kg per m^2)
	function ffmi(kg, cm, pct) { var m = cm / 100; return kg * (1 - pct / 100) / (m * m); }
	function fmi(kg, cm, pct) { var m = cm / 100; return kg * pct / 100 / (m * m); }
	// average of the methods that returned a number
	function mean(list) { var a = list.filter(function (x) { return x != null; }); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

	var BF = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, inToCm: inToCm, cmToIn: cmToIn, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, bmi: bmi, navy: navy, fromBmi: fromBmi, whtr: whtr, whr: whr,
		CATS: CATS, category: category, masses: masses, weightAt: weightAt, ffmi: ffmi, fmi: fmi, mean: mean };
	if (typeof module !== "undefined" && module.exports) module.exports = BF; else root.BF = BF;
})(typeof window !== "undefined" ? window : this);
