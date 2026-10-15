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


	/* ---------- projections and charts ---------- */
	// Weight week by week while eating `intake` kcal a day. The maintenance figure is recomputed as the weight changes (smaller body = lower BMR),
	// so a fixed deficit slows down over time. Lean-mass equations keep the lean mass fixed and let fat change. Returns kg at week 0..weeks.
	function project(p, intake, actId, id, weeks) {
		var mult = activity(actId).mult, kg = p.kg, lean = validBf(p.bf) ? p.kg * (1 - p.bf / 100) : null, out = [kg], w, d;
		for (w = 1; w <= weeks; w++) {
			for (d = 0; d < 7; d++) {
				var q = { sex: p.sex, kg: kg, cm: p.cm, age: p.age, bf: lean != null ? Math.max(3, Math.min(60, (1 - lean / kg) * 100)) : null };
				var b = bmr(id, q); if (b == null) return out;
				kg += (intake - b * mult) / KCAL_PER_KG; if (kg < 25) kg = 25;
			}
			out.push(kg);
		}
		return out;
	}
	// first week at which the projected weight reaches the target (null if it never does within the list)
	function weekReached(weights, target) {
		var down = target < weights[0];
		for (var i = 0; i < weights.length; i++) if (down ? weights[i] <= target : weights[i] >= target) return i;
		return null;
	}
	// BMR at every age from..to for the same sex / weight / height (lean-mass equations keep the body-fat % fixed)
	function bmrByAge(id, p, from, to) {
		var o = []; for (var a = from; a <= to; a++) { var v = bmr(id, { sex: p.sex, kg: p.kg, cm: p.cm, age: a, bf: p.bf }); if (v != null) o.push([a, v]); } return o;
	}
	// typical share of resting energy by tissue for an adult (Elia, 1992)
	var ORGANS = [["Skeletal muscle", 22], ["Liver", 21], ["Brain", 20], ["Heart", 9], ["Kidneys", 8], ["Everything else", 20]];
	// rough split of a day's burn: resting, digesting food (about 10% of the total) and movement (the rest)
	function energySplit(b, t) { var tef = t * 0.1, rest = b; return { rest: rest, food: tef, move: Math.max(0, t - rest - tef) }; }

	/* ---------- sharing ---------- */
	function qs(st) {
		var a = ["kg=" + trim(st.kg, 2), "cm=" + trim(st.cm, 1), "age=" + trim(st.age, 0), "sex=" + st.sex, "act=" + st.act];
		if (validBf(st.bf)) a.push("bf=" + trim(st.bf, 1));
		if (st.f && st.f !== "mifflin") a.push("f=" + st.f);
		if (st.intake > 0) a.push("kcal=" + trim(st.intake, 0));
		return a.join("&");
	}

	var BR = { num: num, fix: fix, trim: trim, group: group, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, kcalToKj: kcalToKj, FORMULAS: FORMULAS, ORDER: ORDER, leanMass: leanMass,
		valid: valid, validBf: validBf, bmr: bmr, all: all, ACTIVITY: ACTIVITY, activity: activity, tdee: tdee, kcalForRate: kcalForRate, floor: floor, goalRows: goalRows, weeksTo: weeksTo, bmiOf: bmiOf, qs: qs, project: project, weekReached: weekReached, bmrByAge: bmrByAge, ORGANS: ORGANS, energySplit: energySplit };
	if (typeof module !== "undefined" && module.exports) module.exports = BR; else root.BR = BR;
})(typeof window !== "undefined" ? window : this);

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

/* MES Pregnancy & Breastfeeding Calorie Calculator -- mes.fm/pregnancy-calorie-calculator (UI; maths in lib.js `PG` on top of the BMR calculator's `BR`).
 * Stored in kg / cm; localStorage "mes-pregnancy-calorie-calculator:v1" = { mode, age, kg, cm, act, wk, now, twins, mo, feed }. Links: ?m=&age=&kg=&cm=&act=&wk=&now=&twins=1&mo=&feed= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pg"); if (!root || !window.PG || !window.BR) return;
	var KEY = "mes-pregnancy-calorie-calculator:v1";
	var EXAMPLES = [["Week 20, 65 kg, 165 cm", { mode: "preg", age: "30", kg: "65", cm: "165", act: "light", wk: 20, now: "", twins: false }], ["Week 32, 80 kg, 170 cm", { mode: "preg", age: "34", kg: "80", cm: "170", act: "sed", wk: 32, now: "88", twins: false }], ["Breastfeeding, 4 months", { mode: "bf", age: "31", kg: "68", cm: "168", act: "light", mo: 4, feed: "ex" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { mode: "preg", age: "", kg: "", cm: "", act: "light", wk: 20, now: "", twins: false, mo: 3, feed: "ex" };
	function clean(s) { return { mode: s.mode === "bf" ? "bf" : "preg", age: String(s.age || "").replace(/\D/g, "").slice(0, 2), kg: String(s.kg || "").slice(0, 8), cm: String(s.cm || "").slice(0, 8), act: BR.ACTIVITY.some(function (a) { return a.id === s.act; }) ? s.act : "light", wk: Math.max(1, Math.min(42, Math.round(+s.wk || 20))), now: String(s.now || "").slice(0, 8), twins: s.twins === true, mo: Math.max(0, Math.min(24, Math.round(+s.mo || 0))), feed: s.feed === "part" ? "part" : "ex" }; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("kg") && !q.has("cm")) return false; st = clean({ mode: q.get("m"), age: q.get("age"), kg: q.get("kg"), cm: q.get("cm"), act: q.get("act") || st.act, wk: q.get("wk") || st.wk, now: q.get("now"), twins: q.get("twins") === "1", mo: q.get("mo") || st.mo, feed: q.get("feed") }); return true; }
	function toast(msg) { var t = $("pg-toast"); if (!t) { t = document.createElement("div"); t.id = "pg-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	$("pg-act").innerHTML = BR.ACTIVITY.slice(0, 4).map(function (a) { return '<option value="' + a.id + '">' + esc(a.name + " (×" + a.mult + ")") + "</option>"; }).join("");
	function fill(except) { var kg = BR.num(st.kg), cm = BR.num(st.cm); if (except !== "m") { $("pg-kg").value = kg > 0 ? BR.trim(kg, 2) : ""; $("pg-cm").value = cm > 0 ? BR.trim(cm, 1) : ""; } if (except !== "i") { $("pg-lb").value = kg > 0 ? BR.trim(BR.kgToLb(kg), 1) : ""; if (cm > 0) { var f = BR.cmToFtIn(cm); $("pg-ft").value = String(f.ft); $("pg-in").value = BR.trim(f.inch, 1); } else { $("pg-ft").value = ""; $("pg-in").value = ""; } } }
	function syncAll() { fill(); $("pg-age").value = st.age; $("pg-act").value = st.act; $("pg-wk").value = st.wk; $("pg-mo").value = st.mo; $("pg-feed").value = st.feed; $("pg-twins").checked = st.twins; $("pg-now").value = st.now; var b = st.mode === "bf"; $("pg-pregopts").hidden = b; $("pg-bfopts").hidden = !b; $("pg-kgl").textContent = b ? "Your weight" : "Weight before pregnancy"; [].forEach.call($("pg-mode").children, function (x) { x.setAttribute("aria-pressed", String(x.dataset.m === st.mode)); }); $("pg-wko").textContent = st.wk + " weeks (trimester " + PG.trimester(st.wk) + ")"; $("pg-moo").textContent = st.mo === 0 ? "newborn" : st.mo + (st.mo === 1 ? " month" : " months"); }
	$("pg-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.mode = b.dataset.m; save(); syncAll(); update(); });
	["pg-kg", "pg-cm"].forEach(function (id) { $(id).addEventListener("input", function () { var kg = BR.num($("pg-kg").value), cm = BR.num($("pg-cm").value); st.kg = kg > 0 ? String(kg) : ""; st.cm = cm > 0 ? String(cm) : ""; fill("m"); save(); update(); }); });
	["pg-lb", "pg-ft", "pg-in"].forEach(function (id) { $(id).addEventListener("input", function () { var lb = BR.num($("pg-lb").value), ft = BR.num($("pg-ft").value), inch = BR.num($("pg-in").value); st.kg = lb > 0 ? String(Math.round(BR.lbToKg(lb) * 1000) / 1000) : ""; st.cm = (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(BR.ftInToCm(ft, inch) * 100) / 100) : ""; fill("i"); save(); update(); }); });
	$("pg-age").addEventListener("input", function () { st.age = this.value.replace(/\D/g, "").slice(0, 2); save(); update(); }); $("pg-act").addEventListener("change", function () { st.act = this.value; save(); update(); });
	$("pg-wk").addEventListener("input", function () { st.wk = +this.value; $("pg-wko").textContent = st.wk + " weeks (trimester " + PG.trimester(st.wk) + ")"; save(); update(); }); $("pg-mo").addEventListener("input", function () { st.mo = +this.value; syncAll(); save(); update(); });
	$("pg-feed").addEventListener("change", function () { st.feed = this.value; save(); update(); }); $("pg-twins").addEventListener("change", function () { st.twins = this.checked; save(); update(); }); $("pg-now").addEventListener("input", function () { st.now = this.value; save(); update(); });
	$("pg-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("pg-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(Object.assign({}, st, { now: "", twins: false }, EXAMPLES[+b.dataset.i][1])); save(); syncAll(); update(); });
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	function wk(kg) { return BR.trim(kg, 1) + " kg (" + BR.trim(BR.kgToLb(kg), 1) + " lb)"; }
	function parseW(s) { var t = String(s || "").trim(), lb = /lbs?$/i.test(t), v = BR.num(t.replace(/\s*(kg|lbs?)$/i, "")); return v > 0 ? (lb ? BR.lbToKg(v) : v) : null; }
	var cur = null;
	function update() {
		var kg = BR.num(st.kg), cm = BR.num(st.cm), age = BR.num(st.age), P = { sex: "f", kg: kg, cm: cm, age: age }, ok = BR.valid(P) && age >= 14 && age <= 55; $("pg-empty").hidden = ok; $("pg-out").hidden = !ok; cur = null; if (!ok) return;
		var bmr = BR.bmr("mifflin", P), tdee = BR.tdee(bmr, st.act), bmi = BR.bmiOf(kg, cm), cat = PG.bmiCat(bmi), bf = st.mode === "bf", twins = st.twins && !bf;
		var extra = bf ? PG.extraBreastfeeding(st.mo, st.feed === "ex") : PG.extraPregnancy(st.wk, twins), total = tdee + extra, low = total < PG.floor(bmr); cur = { bmr: bmr, tdee: tdee, extra: extra, total: total, cat: cat, bmi: bmi, bf: bf };
		$("pg-calbox").hidden = false; $("pg-gainbox").hidden = bf;
		$("pg-hero").innerHTML = stat(bf ? "Calories while breastfeeding" : "Calories a day now", BR.group(total) + " <small>kcal</small>", bf ? "maintenance + " + extra + " for milk" : (st.wk < 14 ? "first trimester: no extra needed" : "maintenance + " + extra + " (trimester " + PG.trimester(st.wk) + ")"), "tu-stat--hero") + stat("Your usual maintenance", BR.group(tdee) + " <small>kcal</small>", "BMR " + BR.group(bmr) + " &times; " + BR.activity(st.act).mult) + stat("Extra for you now", "+" + extra + " <small>kcal</small>", extra === 0 ? "nothing extra yet" : "about " + (extra >= 400 ? "a sandwich and a yogurt" : "a snack and a piece of fruit")) + (bf ? stat("Water", "3.8 <small>L</small>", "all fluids, a day") : stat("Pre-pregnancy BMI", BR.fix(bmi, 1), PG.CATS[cat]));
		var v = bf ? "While breastfeeding a baby of <b>" + (st.mo === 0 ? "a few days" : st.mo + (st.mo === 1 ? " month" : " months")) + "</b>, aim for about <b>" + BR.group(total) + " kcal a day</b>: your usual " + BR.group(tdee) + " plus about " + extra + " for milk. Hunger is a good guide, and you should drink to thirst plus a glass with each feed." : (st.wk < 14 ? "In the <b>first trimester</b> you do not need extra calories: about <b>" + BR.group(tdee) + " kcal a day</b> is your usual amount. The extra starts around week 14." : "At <b>" + st.wk + " weeks</b> (trimester " + PG.trimester(st.wk) + ") aim for about <b>" + BR.group(total) + " kcal a day</b>: your usual " + BR.group(tdee) + " plus " + extra + (twins ? " (an estimate for twins; ask your provider)" : "") + ".");
		if (low) v += ' <span class="pg-warn">That is below about ' + BR.group(PG.floor(bmr)) + " kcal, which is too low while " + (bf ? "breastfeeding" : "pregnant") + ": eat more and ask your provider.</span>"; $("pg-verdict").innerHTML = v + '<br><small class="pg-small">A guide for healthy adults, not medical advice. Not for weight loss.</small>';
		cal(); if (!bf) gain(); foods(); nutrients(); refs();
	}
	function cal() {
		var rows = bfRows(), W = 640, rowH = 34, H = 14 + rows.length * rowH + 10, L = 150, R = 70, mx = Math.max.apply(null, rows.map(function (r) { return r.t; })) * 1.05, X = function (v) { return L + v / mx * (W - L - R); }, s = "";
		rows.forEach(function (r, i) { var y = 8 + i * rowH; s += '<text class="pg-lbl" x="' + (L - 8) + '" y="' + (y + 18) + '" text-anchor="end">' + esc(r.n) + '</text><rect class="pg-b1" x="' + L + '" y="' + y + '" width="' + (X(cur.tdee) - L) + '" height="24" rx="4" style="opacity:' + (r.on ? 1 : 0.6) + '"><title>usual ' + BR.group(cur.tdee) + ' kcal</title></rect><rect class="pg-xtra" x="' + X(cur.tdee) + '" y="' + y + '" width="' + Math.max(0, X(r.t) - X(cur.tdee)) + '" height="24" rx="4" style="opacity:' + (r.on ? 1 : 0.6) + '"><title>extra ' + r.e + ' kcal</title></rect><text class="pg-val" x="' + (X(r.t) + 6) + '" y="' + (y + 17) + '">' + BR.group(r.t) + "</text>"; });
		$("pg-cal").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		$("pg-caltable").innerHTML = "<thead><tr><th></th><th>Extra</th><th>Calories a day</th></tr></thead><tbody>" + rows.map(function (r) { return "<tr" + (r.on ? ' class="is-on"' : "") + "><td>" + esc(r.n) + "</td><td>" + (r.e ? "+" + r.e : "none") + "</td><td>" + BR.group(r.t) + "</td></tr>"; }).join("") + "</tbody>";
	}
	function bfRows() {
		var tw = st.twins && !cur.bf; if (cur.bf) { var ex = st.feed === "ex"; return [{ n: "Months 0–6", e: PG.extraBreastfeeding(0, ex), on: st.mo < 6 }, { n: "Months 7–12", e: PG.extraBreastfeeding(8, ex), on: st.mo >= 6 && st.mo < 12 }, { n: "After 12 months", e: PG.extraBreastfeeding(14, ex), on: st.mo >= 12 }].map(function (r) { r.t = cur.tdee + r.e; return r; }); }
		return [{ n: "1st trimester (to wk 13)", e: 0, on: st.wk < 14 }, { n: "2nd trimester (wk 14–27)", e: PG.extraPregnancy(20, tw), on: st.wk >= 14 && st.wk < 28 }, { n: "3rd trimester (wk 28+)", e: PG.extraPregnancy(30, tw), on: st.wk >= 28 }].map(function (r) { r.t = cur.tdee + r.e; return r; });
	}
	function gain() {
		var cat = cur.cat, tw = st.twins, g = PG.gainRange(cat, tw), rate = PG.weeklyRate(cat, tw), W = 640, H = 250, L = 46, R = 14, T = 14, B = 32, kg = BR.num(st.kg), nowW = parseW(st.now), hi = Math.ceil(g[1] + 3), X = function (w) { return L + w / 40 * (W - L - R); }, Y = function (v) { return T + (hi - v) / (hi + 2) * (H - T - B); }, s = "";
		for (var y = 0; y <= hi; y += 2) s += '<line class="pg-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y) + '" y2="' + Y(y) + '"/><text class="pg-ct" x="' + (L - 5) + '" y="' + (Y(y) + 4) + '" text-anchor="end">' + y + "</text>";
		for (var wv = 0; wv <= 40; wv += 4) s += '<text class="pg-ct" x="' + X(wv) + '" y="' + (H - 12) + '" text-anchor="middle">' + wv + "</text>";
		var up = [], dn = []; for (var q = 0; q <= 40; q += 1) { var c = PG.corridor(q, cat, tw); up.push(X(q) + "," + Y(c.hi)); dn.push(X(q) + "," + Y(c.lo)); } s += '<polygon class="pg-band" points="' + up.join(" ") + " " + dn.slice().reverse().join(" ") + '"/><polyline class="pg-bandl" points="' + up.join(" ") + '"/><polyline class="pg-bandl" points="' + dn.join(" ") + '"/>';
		s += '<line class="pg-cur" x1="' + X(st.wk) + '" x2="' + X(st.wk) + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="pg-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">weeks of pregnancy → kg gained</text>';
		var c0 = PG.corridor(st.wk, cat, tw), txt = "At <b>week " + st.wk + "</b> the recommended gain is about <b>" + wk(c0.lo) + " to " + wk(c0.hi) + "</b> (" + PG.CATS[cat].toLowerCase() + " BMI" + (tw ? ", twins" : "") + "). By the end the total range is <b>" + wk(g[0]) + " to " + wk(g[1]) + "</b>, at roughly " + BR.trim(rate[0], 2) + "–" + BR.trim(rate[1], 2) + " kg (" + BR.trim(BR.kgToLb(rate[0]), 1) + "–" + BR.trim(BR.kgToLb(rate[1]), 1) + " lb) a week in the second and third trimesters.";
		if (nowW > 0 && st.wk >= 1) { var gn = nowW - kg, stt = PG.status(gn, st.wk, cat, tw); s += '<circle class="pg-me" cx="' + X(st.wk) + '" cy="' + Y(Math.max(-1, Math.min(hi + 1, gn))) + '" r="6"><title>you: ' + BR.trim(gn, 1) + ' kg gained</title></circle>'; txt += "<br>You have gained <b>" + wk(gn) + "</b>: " + (stt === "within" ? '<span class="pg-ok">inside the recommended range for this week.</span>' : stt === "below" ? '<span class="pg-warn">a little below the range. Mention it at your next check-up.</span>' : '<span class="pg-warn">a little above the range. Mention it at your next check-up.</span>'); }
		$("pg-gain").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>"; $("pg-gaintxt").innerHTML = txt;
	}
	function foods() {
		var e = cur.extra; $("pg-xt").textContent = e || (cur.bf ? 330 : 340); var n = e || (cur.bf ? 330 : 340);
		var opts = n >= 400 ? [["a cheese and tomato sandwich on wholegrain bread plus a banana", 430], ["Greek yogurt (170 g) with berries and 2 tbsp granola, plus a handful of almonds", 420], ["a bowl of oatmeal with milk and a sliced banana, plus a hard-boiled egg", 440], ["hummus (4 tbsp) with wholegrain pitta and carrot sticks, plus a glass of milk", 430]] : [["a slice of wholegrain toast with peanut butter and a banana", 340], ["Greek yogurt (170 g) with berries and a handful of nuts", 330], ["a small bowl of cereal with milk and a piece of fruit", 340], ["a cheese stick, an apple and a handful of almonds", 330], ["hummus (3 tbsp) with veggie sticks and a wholegrain cracker or two", 320]];
		$("pg-foods").innerHTML = (e === 0 && !cur.bf ? "<li>No extra calories are needed yet. Focus on food quality: vegetables, fruit, protein, wholegrains and a prenatal vitamin.</li>" : "") + opts.map(function (o) { return "<li>" + esc(o[0]) + " &asymp; " + o[1] + " kcal</li>"; }).join("");
	}
	function nutrients() { var b = cur.bf; $("pg-nut").innerHTML = "<thead><tr><th>Nutrient</th><th>" + (b ? "Breastfeeding" : "Pregnancy") + "</th><th>Where to get it</th></tr></thead><tbody>" + PG.NUTRIENTS.map(function (n) { return "<tr><td><b>" + esc(n[0]) + "</b></td><td>" + esc(b ? n[2] : n[1]) + "</td><td>" + esc(n[3]) + "</td></tr>"; }).join("") + "</tbody>"; }
	function refs() { var rows = ["under", "normal", "over", "obese"]; $("pg-ref").innerHTML = "<thead><tr><th>Pre-pregnancy BMI</th><th>Singleton: total gain</th><th>Per week (2nd and 3rd trimester)</th><th>Twins: total gain</th></tr></thead><tbody>" + rows.map(function (c) { var g = PG.gainRange(c, false), r = PG.weeklyRate(c, false), t = PG.gainRange(c, true); return "<tr" + (cur && cur.cat === c ? ' class="is-on"' : "") + "><td>" + PG.CATS[c] + " (" + (c === "under" ? "under 18.5" : c === "normal" ? "18.5–24.9" : c === "over" ? "25–29.9" : "30+") + ")</td><td>" + g[0] + "–" + g[1] + " kg (" + BR.trim(BR.kgToLb(g[0]), 0) + "–" + BR.trim(BR.kgToLb(g[1]), 0) + " lb)</td><td>" + r[0] + "–" + r[1] + " kg</td><td>" + (c === "under" ? "no guidance" : t[0] + "–" + t[1] + " kg") + "</td></tr>"; }).join("") + "</tbody>"; }
	$("pg-link").onclick = function () { if (cur) copy(location.origin + "/pregnancy-calorie-calculator?m=" + st.mode + "&age=" + st.age + "&kg=" + BR.trim(BR.num(st.kg), 2) + "&cm=" + BR.trim(BR.num(st.cm), 1) + "&act=" + st.act + (st.mode === "preg" ? "&wk=" + st.wk + (st.twins ? "&twins=1" : "") + (parseW(st.now) > 0 ? "&now=" + BR.trim(parseW(st.now), 1) : "") : "&mo=" + st.mo + "&feed=" + st.feed), "Link copied"); }; $("pg-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
