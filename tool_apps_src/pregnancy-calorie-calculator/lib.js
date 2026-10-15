/* MES Pregnancy & Breastfeeding Calorie Calculator -- pure maths (no DOM). Browser global `PG`; needs the BMR calculator's lib (global `BR`, loaded first via lib_from).
 * node: require('./tool_apps_src/pregnancy-calorie-calculator/lib.js'); tests: node tool_apps_src/pregnancy-calorie-calculator-tests.js
 * Weight gain guidance: Institute of Medicine (2009) / ACOG. Extra calories: IOM / Dietary Guidelines for Americans. Weights in kg. */
(function (root) {
	"use strict";
	var BR = root.BR || (typeof require !== "undefined" ? require("../bmr-calculator/lib.js") : null);
	function bmiCat(bmi) { return bmi < 18.5 ? "under" : bmi < 25 ? "normal" : bmi < 30 ? "over" : "obese"; }
	var CATS = { under: "Underweight", normal: "Normal weight", over: "Overweight", obese: "Obesity" };
	// total recommended gain over a whole pregnancy, kg [low, high]; twins have no underweight guidance (the normal range is used)
	var GAIN = { single: { under: [12.5, 18], normal: [11.5, 16], over: [7, 11.5], obese: [5, 9] }, twins: { under: [16.8, 24.5], normal: [16.8, 24.5], over: [14.1, 22.7], obese: [11.3, 19.1] } };
	// weekly gain in the 2nd and 3rd trimesters, kg per week [low, high] (singleton)
	var RATE = { under: [0.44, 0.58], normal: [0.35, 0.50], over: [0.23, 0.33], obese: [0.17, 0.27] };
	function gainRange(cat, twins) { return (twins ? GAIN.twins : GAIN.single)[cat] || GAIN.single.normal; }
	function weeklyRate(cat, twins) { var r = RATE[cat] || RATE.normal; return twins ? [r[0] * 1.35, r[1] * 1.35] : r; }
	// gain corridor at a week: 0.5-2 kg by the end of week 13, then a straight line to the total range at week 40
	function corridor(week, cat, twins) {
		var g = gainRange(cat, twins), w = Math.max(0, Math.min(42, week));
		if (w <= 13) { var f = w / 13; return { lo: 0.5 * f, hi: 2 * f }; }
		var t = Math.min(1, (w - 13) / 27); return { lo: 0.5 + (g[0] - 0.5) * t, hi: 2 + (g[1] - 2) * t };
	}
	function status(gain, week, cat, twins) { var c = corridor(week, cat, twins); return gain < c.lo - 0.2 ? "below" : gain > c.hi + 0.2 ? "above" : "within"; }
	/* ---------- calories ---------- */
	// extra calories a day: none in the 1st trimester, +340 in the 2nd, +452 in the 3rd (IOM); twins about +600 from week 14 (an estimate)
	function extraPregnancy(week, twins) { if (week < 14) return 0; if (twins) return week < 28 ? 600 : 750; return week < 28 ? 340 : 452; }
	// breastfeeding: +330 in months 0-6 and +400 in months 7-12 for exclusive feeding; about half for partial feeding
	function extraBreastfeeding(months, exclusive) { var base = months < 6 ? 330 : months < 12 ? 400 : 400; return exclusive ? base : Math.round(base / 2); }
	function trimester(week) { return week < 14 ? 1 : week < 28 ? 2 : 3; }
	function weeksFromDue(dueMs, nowMs) { return 40 - (dueMs - nowMs) / (7 * 864e5); }
	function dueFromWeeks(weeks, nowMs) { return nowMs + (40 - weeks) * 7 * 864e5; }
	// the lowest daily calories this page will call reasonable while breastfeeding or pregnant
	function floor(bmr) { return Math.max(1800, bmr * 1.2); }
	// nutrient targets (RDA / AI for adults 19-50; teens need more calcium and iron)
	var NUTRIENTS = [
		["Protein", "71 g", "71 g", "About 1.1 g per kg of body weight."], ["Folate (folic acid)", "600 mcg DFE", "500 mcg DFE", "Take a prenatal vitamin with 400-800 mcg from before conception."], ["Iron", "27 mg", "9 mg", "Doubles in pregnancy: red meat, beans, fortified cereals with vitamin C."],
		["Calcium", "1,000 mg", "1,000 mg", "1,300 mg for ages 14-18. Dairy, fortified soy milk, tofu, greens."], ["Choline", "450 mg", "550 mg", "Eggs, meat, soy, peanuts."], ["Iodine", "220 mcg", "290 mcg", "Iodised salt, dairy, seafood."], ["Vitamin D", "15 mcg (600 IU)", "15 mcg (600 IU)", "Sunlight, fortified foods, supplement as advised."],
		["DHA (omega-3)", "200-300 mg", "200-300 mg", "Low-mercury fish twice a week, or an algae supplement."], ["Fluids", "about 3.0 L", "about 3.8 L", "All drinks and foods together."], ["Fibre", "28 g", "29 g", "Eases constipation."]
	];
	var PG = { bmiCat: bmiCat, CATS: CATS, GAIN: GAIN, RATE: RATE, gainRange: gainRange, weeklyRate: weeklyRate, corridor: corridor, status: status, extraPregnancy: extraPregnancy, extraBreastfeeding: extraBreastfeeding, trimester: trimester, weeksFromDue: weeksFromDue, dueFromWeeks: dueFromWeeks, floor: floor, NUTRIENTS: NUTRIENTS };
	if (typeof module !== "undefined" && module.exports) module.exports = PG; else root.PG = PG;
})(typeof window !== "undefined" ? window : this);
