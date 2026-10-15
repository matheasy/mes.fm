/* MES BMR Calculator -- pure maths (no DOM). Browser global `BR`; node: require('./tool_apps_src/bmr-calculator/lib.js'); tests: node tool_apps_src/bmr-calculator-tests.js
 * Weight is kept in kg, height in cm, energy in kcal per day (kJ = kcal x 4.184). */
(function (root) {
	"use strict";
	var LB = 0.45359237, IN = 2.54, KJ = 4.184;
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
	function group(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }
	function kcalToKj(k) { return k * KJ; }

	/* ---------- the equations (kcal / day) ---------- */
	// p = { sex: "m"|"f", kg, cm, age (years), bf (body-fat %, optional) }
	var FORMULAS = {
		mifflin: { name: "Mifflin-St Jeor (1990)", needsBf: false, note: "The most accurate of the age-and-size equations for most adults; the usual first choice.",
			f: function (p) { return 10 * p.kg + 6.25 * p.cm - 5 * p.age + (p.sex === "m" ? 5 : -161); } },
		harris: { name: "Revised Harris-Benedict (Roza & Shizgal, 1984)", needsBf: false, note: "The classic 1919 equation, updated in 1984. Tends to run a little higher than Mifflin-St Jeor.",
			f: function (p) { return p.sex === "m" ? 88.362 + 13.397 * p.kg + 4.799 * p.cm - 5.677 * p.age : 447.593 + 9.247 * p.kg + 3.098 * p.cm - 4.330 * p.age; } },
		katch: { name: "Katch-McArdle", needsBf: true, note: "Uses lean body mass, so it suits people who know their body-fat % (muscular or very lean people especially).",
			f: function (p) { return 370 + 21.6 * leanMass(p.kg, p.bf); } },
		cunningham: { name: "Cunningham", needsBf: true, note: "Also lean-mass based, with a higher figure; developed for athletes.",
			f: function (p) { return 500 + 22 * leanMass(p.kg, p.bf); } }
	};
	var ORDER = ["mifflin", "harris", "katch", "cunningham"];
	function leanMass(kg, bf) { return kg * (1 - bf / 100); }
	function valid(p) {
		return !!p && (p.sex === "m" || p.sex === "f") && p.kg >= 20 && p.kg <= 400 && p.cm >= 90 && p.cm <= 250 && p.age >= 15 && p.age <= 110;
	}
	function validBf(bf) { return bf != null && bf >= 3 && bf <= 60; }
	function bmr(id, p) {
		var F = FORMULAS[id]; if (!F || !valid(p)) return null;
		if (F.needsBf && !validBf(p.bf)) return null;
		var v = F.f(p); return v > 0 ? v : null;
	}
	function all(p) { var o = {}; ORDER.forEach(function (id) { o[id] = bmr(id, p); }); return o; }

	/* ---------- activity ---------- */
	var ACTIVITY = [
		{ id: "sed", name: "Sedentary", mult: 1.2, desc: "Little or no exercise, desk job" },
		{ id: "light", name: "Lightly active", mult: 1.375, desc: "Light exercise 1-3 days a week" },
		{ id: "mod", name: "Moderately active", mult: 1.55, desc: "Moderate exercise 3-5 days a week" },
		{ id: "very", name: "Very active", mult: 1.725, desc: "Hard exercise 6-7 days a week" },
		{ id: "extra", name: "Extra active", mult: 1.9, desc: "Very hard exercise, or a physical job plus training" }
	];
	function activity(id) { for (var i = 0; i < ACTIVITY.length; i++) if (ACTIVITY[i].id === id) return ACTIVITY[i]; return ACTIVITY[0]; }
	function tdee(bmrKcal, actId) { return bmrKcal == null ? null : bmrKcal * activity(actId).mult; }

	/* ---------- goals: ~7,700 kcal per kg of body weight (about 3,500 kcal per lb) ---------- */
	var KCAL_PER_KG = 7700;
	function kcalForRate(kgPerWeek) { return kgPerWeek * KCAL_PER_KG / 7; }
	// lowest intake the page will show without a warning: never under BMR, and the common 1,200 (women) / 1,500 (men) floor
	function floor(sex, bmrKcal) { return Math.max(sex === "m" ? 1500 : 1200, bmrKcal || 0); }
	function goalRows(t, p, bmrKcal) {
		var rates = [-1, -0.5, -0.25, 0, 0.25, 0.5], fl = floor(p.sex, bmrKcal);
		return rates.map(function (r) {
			var cal = t + kcalForRate(r);
			return { rate: r, kcal: cal, low: r < 0 && cal < fl };
		});
	}
	// weeks to move from kg to target at a steady daily difference (null when it would never get there)
	function weeksTo(kgNow, kgTarget, rateKgPerWeek) {
		var d = kgTarget - kgNow; if (d === 0) return 0;
		if (rateKgPerWeek === 0 || (d > 0) !== (rateKgPerWeek > 0)) return null;
		return d / rateKgPerWeek;
	}
	function bmiOf(kg, cm) { var m = cm / 100; return kg / (m * m); }

	/* ---------- sharing ---------- */
	function qs(st) {
		var a = ["kg=" + trim(st.kg, 2), "cm=" + trim(st.cm, 1), "age=" + trim(st.age, 0), "sex=" + st.sex, "act=" + st.act];
		if (validBf(st.bf)) a.push("bf=" + trim(st.bf, 1));
		if (st.f && st.f !== "mifflin") a.push("f=" + st.f);
		return a.join("&");
	}

	var BR = { num: num, fix: fix, trim: trim, group: group, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, kcalToKj: kcalToKj, FORMULAS: FORMULAS, ORDER: ORDER, leanMass: leanMass,
		valid: valid, validBf: validBf, bmr: bmr, all: all, ACTIVITY: ACTIVITY, activity: activity, tdee: tdee, kcalForRate: kcalForRate, floor: floor, goalRows: goalRows, weeksTo: weeksTo, bmiOf: bmiOf, qs: qs };
	if (typeof module !== "undefined" && module.exports) module.exports = BR; else root.BR = BR;
})(typeof window !== "undefined" ? window : this);
