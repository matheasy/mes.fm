/* MES Waist-to-Hip Ratio Calculator -- pure maths (no DOM). Browser global `WH`; node: require('./tool_apps_src/waist-to-hip-ratio-calculator/lib.js'); tests: node tool_apps_src/waist-to-hip-ratio-calculator-tests.js
 * Lengths are stored in cm. */
(function (root) {
	"use strict";
	var IN = 2.54;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function inToCm(i) { return i * IN; } function cmToIn(c) { return c / IN; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }
	function whr(waist, hip) { return waist > 0 && hip > 0 ? waist / hip : null; }
	function whtr(waist, cm) { return waist > 0 && cm > 0 ? waist / cm : null; }
	/* ---------- bands (WHO 2008 for WHR and waist, Ashwell for WHtR) ---------- */
	var WHR_BANDS = { m: [[0.90, "Low risk", "low"], [1.00, "Moderate risk", "mid"], [Infinity, "High risk", "high"]], f: [[0.80, "Low risk", "low"], [0.85, "Moderate risk", "mid"], [Infinity, "High risk", "high"]] };
	var WHTR_BANDS = [[0.40, "Very slim: take care", "under"], [0.50, "Healthy", "low"], [0.60, "Increased risk", "mid"], [Infinity, "High risk", "high"]];
	var WAIST_BANDS = { m: [[94, "Low risk", "low"], [102, "Increased risk", "mid"], [Infinity, "Substantially increased", "high"]], f: [[80, "Low risk", "low"], [88, "Increased risk", "mid"], [Infinity, "Substantially increased", "high"]] };
	function band(list, v) { for (var i = 0; i < list.length; i++) if (v < list[i][0] - 1e-9) return { name: list[i][1], key: list[i][2], index: i }; var l = list[list.length - 1]; return { name: l[1], key: l[2], index: list.length - 1 }; }
	function whrBand(sex, v) { return band(WHR_BANDS[sex] || WHR_BANDS.m, Math.round(v * 100) / 100); }
	function whtrBand(v) { return band(WHTR_BANDS, Math.round(v * 100) / 100); }
	function waistBand(sex, cm) { return band(WAIST_BANDS[sex] || WAIST_BANDS.m, cm); }
	// "apple" = carries weight around the middle, "pear" = around the hips
	function shape(sex, v) { return v >= (sex === "f" ? 0.85 : 0.95) ? "apple" : "pear"; }
	// waist circumference that gives a target ratio
	function waistFor(targetRatio, base) { return targetRatio * base; }
	var WH = { num: num, fix: fix, trim: trim, inToCm: inToCm, cmToIn: cmToIn, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, whr: whr, whtr: whtr, WHR_BANDS: WHR_BANDS, WHTR_BANDS: WHTR_BANDS, WAIST_BANDS: WAIST_BANDS, whrBand: whrBand, whtrBand: whtrBand, waistBand: waistBand, shape: shape, waistFor: waistFor };
	if (typeof module !== "undefined" && module.exports) module.exports = WH; else root.WH = WH;
})(typeof window !== "undefined" ? window : this);
