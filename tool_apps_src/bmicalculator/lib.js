/* MES BMI Calculator -- pure maths + share encoding (no DOM). Browser global `BM`; node: require('./tool_apps_src/bmicalculator/lib.js'); tests: node tool_apps_src/bmi-tests.js
 * Everything is stored in kilograms and centimetres; pounds / feet / inches are conversions of those. */
(function (root) {
	"use strict";
	var LB = 0.45359237, IN = 2.54;
	function num(v) {
		if (v == null) return null;
		var t = String(v).trim().replace(/\s+/g, "");
		if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
		var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }

	/* ---------- conversions ---------- */
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }

	/* ---------- BMI ---------- */
	function bmi(kg, cm) { if (!(kg > 0) || !(cm > 0)) return null; var m = cm / 100; return kg / (m * m); }
	function weightAt(b, cm) { var m = cm / 100; return b * m * m; }   // kg that gives BMI b at that height

	// WHO adult cut-offs, or the WHO Asia-Pacific cut-offs ("asia": 23 and 27.5)
	var SCALES = {
		who: { name: "WHO standard", cuts: [[16, "Severe thinness", "under"], [17, "Moderate thinness", "under"], [18.5, "Mild thinness", "under"], [25, "Normal weight", "normal"], [30, "Overweight", "over"], [35, "Obese (class I)", "obese"], [40, "Obese (class II)", "obese"], [Infinity, "Obese (class III)", "obese"]], lo: 18.5, hi: 25 },
		asia: { name: "Asian (WHO Asia-Pacific)", cuts: [[16, "Severe thinness", "under"], [17, "Moderate thinness", "under"], [18.5, "Mild thinness", "under"], [23, "Normal weight", "normal"], [27.5, "Overweight", "over"], [Infinity, "Obese", "obese"]], lo: 18.5, hi: 23 }
	};
	// the BMI is rounded to 1 decimal first (as the old calculator did): 24.95 -> 25.0 counts as overweight
	function category(b, scale) {
		var S = SCALES[scale] || SCALES.who, r = Math.round(b * 10) / 10;
		for (var i = 0; i < S.cuts.length; i++) if (r < S.cuts[i][0] - 1e-9) return { name: S.cuts[i][1], group: S.cuts[i][2], index: i };
		var L = S.cuts[S.cuts.length - 1]; return { name: L[1], group: L[2], index: S.cuts.length - 1 };
	}
	// healthy weight range for a height: BMI 18.5 up to the highest BMI still shown as normal (24.9 WHO / 22.9 Asian)
	function healthyRange(cm, scale) {
		var S = SCALES[scale] || SCALES.who, top = Math.round((S.hi - 0.1) * 10) / 10;
		return { lo: weightAt(S.lo, cm), hi: weightAt(top, cm), loBmi: S.lo, hiBmi: top };
	}
	// how much to gain / lose (kg, positive numbers) to reach the healthy range; both ends given
	function toNormal(kg, cm, scale) {
		var R = healthyRange(cm, scale);
		if (kg < R.lo) return { dir: "gain", min: R.lo - kg, max: R.hi - kg };
		if (kg > R.hi) return { dir: "lose", min: kg - R.hi, max: kg - R.lo };
		return { dir: "none", min: 0, max: 0 };
	}
	function prime(b, scale) { var S = SCALES[scale] || SCALES.who; return b / (S.hi); }   // BMI Prime = BMI / upper normal limit
	function ponderal(kg, cm) { var m = cm / 100; return kg / (m * m * m); }

	/* ---------- history entries ---------- */
	// entry = { d: "YYYY-MM-DD", kg, cm, n (note) }
	function sortEntries(list) { return list.slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }); }
	function cleanEntry(e) {
		var kg = num(e && e.kg), cm = num(e && e.cm), d = String((e && e.d) || "");
		if (!(kg > 0 && kg < 700) || !(cm > 30 && cm < 280) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
		return { d: d, kg: Math.round(kg * 100) / 100, cm: Math.round(cm * 10) / 10, n: String((e && e.n) || "").slice(0, 60) };
	}

	/* ---------- sharing ---------- */
	function b64e(str) { var b = typeof Buffer !== "undefined" ? Buffer.from(str, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(str))); return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
	function b64d(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s))); }
	function encode(st) { return "1" + b64e(JSON.stringify([st.kg || "", st.cm || "", st.scale === "asia" ? 1 : 0, sortEntries(st.history || []).map(function (e) { return [e.d, e.kg, e.cm, e.n || ""]; })])); }
	function decode(s) {
		try {
			s = String(s || ""); if (s.charAt(0) !== "1") return null;
			var j = JSON.parse(b64d(s.slice(1))); if (!Array.isArray(j)) return null;
			var h = (Array.isArray(j[3]) ? j[3] : []).slice(0, 400).map(function (a) { return cleanEntry({ d: a[0], kg: a[1], cm: a[2], n: a[3] }); }).filter(Boolean);
			return { kg: String(j[0] || "").slice(0, 8), cm: String(j[1] || "").slice(0, 8), scale: j[2] ? "asia" : "who", history: h };
		} catch (e) { return null; }
	}
	// the 2013-2025 /bmicalculator/s/<id> links: { weight (kg), height (cm) }
	function fromOldShare(d) {
		if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return null; } }
		if (!d || !(d.weight > 0) || !(d.height > 0)) return null;
		return { kg: String(Math.round(d.weight * 100) / 100), cm: String(Math.round(d.height * 10) / 10) };
	}

	var BM = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, bmi: bmi, weightAt: weightAt, SCALES: SCALES, category: category, healthyRange: healthyRange, toNormal: toNormal,
		prime: prime, ponderal: ponderal, sortEntries: sortEntries, cleanEntry: cleanEntry, encode: encode, decode: decode, fromOldShare: fromOldShare };
	if (typeof module !== "undefined" && module.exports) module.exports = BM; else root.BM = BM;
})(typeof window !== "undefined" ? window : globalThis);
