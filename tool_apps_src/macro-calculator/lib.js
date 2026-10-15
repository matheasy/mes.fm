/* MES Macro Calculator -- pure maths (no DOM). Browser global `MC`; needs the BMR calculator's lib (global `BR`, loaded first via lib_from). node: require('./tool_apps_src/macro-calculator/lib.js'); tests: node tool_apps_src/macro-calculator-tests.js */
(function (root) {
	"use strict";
	var BR = root.BR || (typeof require !== "undefined" ? require("../bmr-calculator/lib.js") : null);
	var KCAL = { p: 4, c: 4, f: 9 };
	var PRESETS = [
		{ id: "balanced", name: "Balanced", p: 25, c: 50, f: 25, desc: "A middle-of-the-road split most people can follow." },
		{ id: "highprotein", name: "High protein", p: 35, c: 35, f: 30, desc: "Keeps you full and protects muscle while cutting." },
		{ id: "lowcarb", name: "Low carb", p: 30, c: 25, f: 45, desc: "Fewer carbs, more fat; popular for appetite control." },
		{ id: "keto", name: "Keto", p: 20, c: 5, f: 75, desc: "Very low carb so the body runs on fat; hard to sustain." },
		{ id: "lowfat", name: "Low fat", p: 20, c: 65, f: 15, desc: "Carb-heavy and low in fat." },
		{ id: "endurance", name: "Endurance", p: 20, c: 60, f: 20, desc: "Extra carbs to fuel long training." }
	];
	var GOALS = [
		{ id: "-1", name: "Lose weight fast (1 kg / 2.2 lb a week)", rate: -1 }, { id: "-0.5", name: "Lose weight (0.5 kg / 1.1 lb a week)", rate: -0.5 }, { id: "-0.25", name: "Lose weight slowly (0.25 kg a week)", rate: -0.25 },
		{ id: "0", name: "Maintain weight", rate: 0 }, { id: "0.25", name: "Gain weight slowly (0.25 kg a week)", rate: 0.25 }, { id: "0.5", name: "Gain weight (0.5 kg a week)", rate: 0.5 }
	];
	function goal(id) { for (var i = 0; i < GOALS.length; i++) if (GOALS[i].id === String(id)) return GOALS[i]; return GOALS[3]; }
	function preset(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return PRESETS[0]; }
	// daily calories = maintenance + the goal's surplus / deficit
	function target(tdee, rate) { return tdee + BR.kcalForRate(rate); }
	// percent split -> grams at a calorie level (percentages are normalised to 100)
	function norm(p, c, f) { var t = p + c + f; if (!(t > 0)) return { p: 25, c: 50, f: 25 }; return { p: p / t * 100, c: c / t * 100, f: f / t * 100 }; }
	function grams(kcal, p, c, f) { var n = norm(p, c, f); return { p: kcal * n.p / 100 / KCAL.p, c: kcal * n.c / 100 / KCAL.c, f: kcal * n.f / 100 / KCAL.f }; }
	function kcalOf(g) { return g.p * KCAL.p + g.c * KCAL.c + g.f * KCAL.f; }
	function perMeal(g, n) { n = Math.max(1, n | 0); return { p: g.p / n, c: g.c / n, f: g.f / n, kcal: kcalOf(g) / n }; }
	function fibre(kcal) { return 14 * kcal / 1000; }
	// protein check in g per kg of body weight
	function proteinCheck(gP, kg, rate) {
		var r = gP / kg, lo = rate < 0 ? 1.6 : 1.2, hi = rate < 0 ? 2.4 : 2.2, k = r < 0.8 ? "low" : r < lo ? "under" : r <= hi ? "good" : r <= 3 ? "high" : "veryhigh";
		return { perKg: r, key: k, lo: lo, hi: hi };
	}
	// percentages from grams
	function pctOf(g) { var t = kcalOf(g); return t > 0 ? { p: g.p * 4 / t * 100, c: g.c * 4 / t * 100, f: g.f * 9 / t * 100 } : { p: 0, c: 0, f: 0 }; }
	// set protein % and fat %, carbs take the rest (never negative: fat gives way)
	function custom(p, f) { p = Math.max(5, Math.min(70, p)); f = Math.max(5, Math.min(75, f)); if (p + f > 95) f = 95 - p; return { p: p, f: f, c: 100 - p - f }; }

	var MC = { PRESETS: PRESETS, GOALS: GOALS, goal: goal, preset: preset, target: target, norm: norm, grams: grams, kcalOf: kcalOf, perMeal: perMeal, fibre: fibre, proteinCheck: proteinCheck, pctOf: pctOf, custom: custom, KCAL: KCAL };
	if (typeof module !== "undefined" && module.exports) module.exports = MC; else root.MC = MC;
})(typeof window !== "undefined" ? window : this);
