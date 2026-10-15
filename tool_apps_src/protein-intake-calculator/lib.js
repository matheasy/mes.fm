/* MES Protein Intake Calculator -- pure maths (no DOM). Browser global `PI`; node: require('./tool_apps_src/protein-intake-calculator/lib.js'); tests: node tool_apps_src/protein-intake-calculator-tests.js
 * Protein in grams per day, body weight in kg. */
(function (root) {
	"use strict";
	var LB = 0.45359237;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function group(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	// g per kg of body weight: [low, target, high]
	var GOALS = [
		{ id: "rda", name: "General health (the RDA)", lo: 0.8, t: 0.8, hi: 1.0, note: "The minimum to avoid deficiency in healthy adults, not an optimum." },
		{ id: "older", name: "Adult over 65", lo: 1.0, t: 1.2, hi: 1.5, note: "Older adults need more to hold on to muscle (PROT-AGE, ESPEN)." },
		{ id: "active", name: "Active: regular exercise", lo: 1.2, t: 1.4, hi: 1.6, note: "Recreational exercisers and general fitness." },
		{ id: "endurance", name: "Endurance athlete", lo: 1.2, t: 1.5, hi: 1.8, note: "Runners, cyclists, swimmers in heavy training." },
		{ id: "muscle", name: "Build muscle", lo: 1.6, t: 1.8, hi: 2.2, note: "Strength training with enough calories." },
		{ id: "cut", name: "Lose fat, keep muscle", lo: 1.8, t: 2.2, hi: 2.4, note: "Higher protein protects muscle and fullness in a calorie deficit." },
		{ id: "preg", name: "Pregnant", lo: 1.1, t: 1.2, hi: 1.5, note: "About 25 g a day more than before pregnancy (RDA 1.1 g/kg)." },
		{ id: "bf", name: "Breastfeeding", lo: 1.3, t: 1.4, hi: 1.7, note: "RDA 1.3 g/kg while breastfeeding." }
	];
	function goal(id) { for (var i = 0; i < GOALS.length; i++) if (GOALS[i].id === id) return GOALS[i]; return GOALS[2]; }
	function valid(kg) { return kg >= 25 && kg <= 300; }
	function need(kg, id) { if (!valid(kg)) return null; var g = goal(id); return { lo: kg * g.lo, t: kg * g.t, hi: kg * g.hi, perKg: g.t }; }
	// meals: about 0.4 g/kg per meal maximises muscle building; this suggests how many meals reach the target
	function mealsNeeded(total, kg) { return Math.max(3, Math.min(6, Math.ceil(total / (0.4 * kg)))); }
	function perMeal(total, n) { return total / Math.max(1, n | 0); }
	function percentCal(g, kcal) { return kcal > 0 ? g * 4 / kcal * 100 : null; }
	// foods: [name, serving, protein g, kcal, group]
	var FOODS = [
		["Chicken breast, cooked", "100 g", 31, 165, "meat"], ["Lean beef, cooked", "100 g", 26, 250, "meat"], ["Salmon, cooked", "100 g", 22, 208, "fish"], ["Tuna, canned in water", "1 can (140 g)", 32, 140, "fish"],
		["Egg, large", "1 egg", 6, 72, "egg"], ["Egg whites", "3 whites", 11, 52, "egg"], ["Greek yogurt, plain", "170 g (3/4 cup)", 17, 100, "dairy"], ["Cottage cheese", "1 cup (225 g)", 25, 180, "dairy"], ["Milk", "1 cup (240 ml)", 8, 103, "dairy"], ["Cheddar cheese", "30 g", 7, 120, "dairy"],
		["Whey protein", "1 scoop (30 g)", 24, 120, "supp"], ["Tofu, firm", "100 g", 8, 76, "plant"], ["Tempeh", "100 g", 19, 193, "plant"], ["Lentils, cooked", "1 cup (200 g)", 18, 230, "plant"], ["Chickpeas, cooked", "1 cup (165 g)", 15, 269, "plant"], ["Black beans, cooked", "1 cup (170 g)", 15, 227, "plant"],
		["Peanut butter", "2 tbsp (32 g)", 7, 190, "plant"], ["Almonds", "30 g (a handful)", 6, 170, "plant"], ["Oats, dry", "1/2 cup (40 g)", 5, 150, "grain"], ["Quinoa, cooked", "1 cup (185 g)", 8, 222, "grain"], ["Bread, whole wheat", "1 slice", 4, 80, "grain"]
	];
	// how many servings of one food give a target amount
	function servingsFor(g, food) { return g / food[2]; }
	function dayTotal(counts) { var p = 0, k = 0; Object.keys(counts).forEach(function (i) { var f = FOODS[+i], c = counts[i]; if (f && c > 0) { p += f[2] * c; k += f[3] * c; } }); return { protein: p, kcal: k }; }
	var PI = { num: num, fix: fix, trim: trim, group: group, lbToKg: lbToKg, kgToLb: kgToLb, GOALS: GOALS, goal: goal, valid: valid, need: need, mealsNeeded: mealsNeeded, perMeal: perMeal, percentCal: percentCal, FOODS: FOODS, servingsFor: servingsFor, dayTotal: dayTotal };
	if (typeof module !== "undefined" && module.exports) module.exports = PI; else root.PI = PI;
})(typeof window !== "undefined" ? window : this);
