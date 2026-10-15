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

/* MES Macro Calculator -- mes.fm/macro-calculator (UI; maths in lib.js `MC` on top of the BMR calculator's `BR`).
 * Stored in kg / cm; localStorage "mes-macro-calculator:v1" = { sex, age, kg, cm, act, goal, preset, p, f, meals }.
 * Links: ?kg=&cm=&age=&sex=&act=&goal=&split=<preset id>|custom&p=&f=&meals= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("mx"); if (!root || !window.MC || !window.BR) return;
	var KEY = "mes-macro-calculator:v1";
	var EXAMPLES = [["Man, 30, 80 kg, 180 cm", { sex: "m", age: "30", kg: "80", cm: "180", act: "mod", goal: "-0.5" }], ["Woman, 30, 60 kg, 165 cm", { sex: "f", age: "30", kg: "60", cm: "165", act: "light", goal: "0" }], ["Man, 22, 70 kg, 175 cm, bulking", { sex: "m", age: "22", kg: "70", cm: "175", act: "very", goal: "0.25" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { sex: "", age: "", kg: "", cm: "", act: "light", goal: "0", preset: "balanced", p: "30", f: "30", meals: "3" };
	function clean(s) {
		var o = {}; o.sex = s.sex === "m" || s.sex === "f" ? s.sex : ""; ["age", "kg", "cm"].forEach(function (k) { o[k] = String(s[k] == null ? "" : s[k]).slice(0, 8); });
		o.act = BR.ACTIVITY.some(function (a) { return a.id === s.act; }) ? s.act : "light"; o.goal = MC.GOALS.some(function (g) { return g.id === String(s.goal); }) ? String(s.goal) : "0";
		o.preset = s.preset === "custom" || MC.PRESETS.some(function (p) { return p.id === s.preset; }) ? s.preset : "balanced"; o.p = String(s.p || 30).slice(0, 3); o.f = String(s.f || 30).slice(0, 3);
		o.meals = /^[2-6]$/.test(String(s.meals)) ? String(s.meals) : "3"; return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() {
		var q = new URLSearchParams(location.search); if (!q.has("kg") && !q.has("cm") && !q.has("age")) return false; var s = Object.assign({}, st);
		["sex", "age", "kg", "cm", "act", "goal", "p", "f", "meals"].forEach(function (k) { if (q.get(k)) s[k] = q.get(k); }); if (q.get("split")) s.preset = q.get("split"); st = clean(s); return true;
	}
	function toast(msg) { var t = $("mx-toast"); if (!t) { t = document.createElement("div"); t.id = "mx-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }

	/* ---------- inputs ---------- */
	$("mx-act").innerHTML = BR.ACTIVITY.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name + " (×" + a.mult + ")") + "</option>"; }).join("");
	$("mx-goal").innerHTML = MC.GOALS.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("");
	function fillOthers(except) {
		var kg = BR.num(st.kg), cm = BR.num(st.cm);
		if (except !== "m") { $("mx-kg").value = kg > 0 ? BR.trim(kg, 2) : ""; $("mx-cm").value = cm > 0 ? BR.trim(cm, 1) : ""; }
		if (except !== "i") { $("mx-lb").value = kg > 0 ? BR.trim(BR.kgToLb(kg), 1) : ""; if (cm > 0) { var f = BR.cmToFtIn(cm); $("mx-ft").value = String(f.ft); $("mx-in").value = BR.trim(f.inch, 1); } else { $("mx-ft").value = ""; $("mx-in").value = ""; } }
	}
	function syncAll() { fillOthers(); $("mx-age").value = st.age; $("mx-act").value = st.act; $("mx-goal").value = st.goal; $("mx-meals").value = st.meals; [].forEach.call($("mx-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); }); }
	["mx-kg", "mx-cm"].forEach(function (id) { $(id).addEventListener("input", function () { var kg = BR.num($("mx-kg").value), cm = BR.num($("mx-cm").value); st.kg = kg > 0 ? String(kg) : ""; st.cm = cm > 0 ? String(cm) : ""; fillOthers("m"); save(); update(); }); });
	["mx-lb", "mx-ft", "mx-in"].forEach(function (id) { $(id).addEventListener("input", function () { var lb = BR.num($("mx-lb").value), ft = BR.num($("mx-ft").value), inch = BR.num($("mx-in").value); st.kg = lb > 0 ? String(Math.round(BR.lbToKg(lb) * 1000) / 1000) : ""; st.cm = (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(BR.ftInToCm(ft, inch) * 100) / 100) : ""; fillOthers("i"); save(); update(); }); });
	$("mx-age").addEventListener("input", function () { st.age = this.value.replace(/\D/g, "").slice(0, 3); save(); update(); });
	$("mx-act").addEventListener("change", function () { st.act = this.value; save(); update(); }); $("mx-goal").addEventListener("change", function () { st.goal = this.value; save(); update(); }); $("mx-meals").addEventListener("change", function () { st.meals = this.value; save(); update(); });
	$("mx-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); syncAll(); update(); });
	$("mx-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("mx-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(Object.assign({}, st, EXAMPLES[+b.dataset.i][1])); save(); syncAll(); update(); });
	$("mx-presets").innerHTML = MC.PRESETS.concat([{ id: "custom", name: "Custom" }]).map(function (p) { return '<button type="button" class="tu-chip" data-id="' + p.id + '" aria-pressed="false">' + esc(p.name) + "</button>"; }).join("");
	$("mx-presets").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.preset = b.dataset.id; if (b.dataset.id === "custom" && cur) { var s = MC.pctOf(cur.g); st.p = String(Math.round(s.p)); st.f = String(Math.round(s.f)); } save(); update(); });
	function slide() { var c = MC.custom(+$("mx-sp").value, +$("mx-sf").value); st.p = String(c.p); st.f = String(c.f); save(); update(); }
	$("mx-sp").addEventListener("input", slide); $("mx-sf").addEventListener("input", slide);
	$("mx-ref").innerHTML = "<thead><tr><th>Split</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Best for</th></tr></thead><tbody>" + MC.PRESETS.map(function (p) { return "<tr><td>" + esc(p.name) + "</td><td>" + p.p + "%</td><td>" + p.c + "%</td><td>" + p.f + "%</td><td>" + esc(p.desc) + "</td></tr>"; }).join("") + "</tbody>";

	/* ---------- result ---------- */
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	function split() { if (st.preset === "custom") { var c = MC.custom(+st.p, +st.f); return { p: c.p, c: c.c, f: c.f }; } var p = MC.preset(st.preset); return { p: p.p, c: p.c, f: p.f }; }
	function update() {
		var kg = BR.num(st.kg), cm = BR.num(st.cm), age = BR.num(st.age), P = { sex: st.sex, kg: kg, cm: cm, age: age }, ok = BR.valid(P);
		$("mx-empty").hidden = ok; $("mx-out").hidden = !ok; cur = null; if (!ok) return;
		var b = BR.bmr("mifflin", P), tdee = BR.tdee(b, st.act), G = MC.goal(st.goal), kcal = MC.target(tdee, G.rate), S = split(), g = MC.grams(kcal, S.p, S.c, S.f), pm = MC.perMeal(g, +st.meals), low = kcal < BR.floor(st.sex, b);
		cur = { P: P, b: b, tdee: tdee, kcal: kcal, g: g, S: S, G: G };
		[].forEach.call($("mx-presets").children, function (c) { c.setAttribute("aria-pressed", String(c.dataset.id === st.preset)); });
		var pr = st.preset === "custom" ? null : MC.preset(st.preset); $("mx-presetnote").textContent = pr ? pr.desc : "Drag the sliders: protein and fat are yours to set, carbs fill the rest.";
		$("mx-customcard").hidden = st.preset !== "custom";
		if (st.preset === "custom") { $("mx-sp").value = S.p; $("mx-sf").value = S.f; $("mx-spo").textContent = Math.round(S.p) + "%"; $("mx-sfo").textContent = Math.round(S.f) + "%"; $("mx-scn").textContent = "Carbs: " + Math.round(S.c) + "% of calories."; }
		$("mx-hero").innerHTML = stat("Daily calories", BR.group(kcal) + " <small>kcal</small>", (G.rate === 0 ? "maintenance" : (G.rate < 0 ? "maintenance minus " : "maintenance plus ") + BR.group(Math.abs(BR.kcalForRate(G.rate))) + " kcal") + " &middot; " + BR.group(BR.kcalToKj(kcal)) + " kJ", "tu-stat--hero") +
			stat("Protein", Math.round(g.p) + " <small>g</small>", Math.round(S.p) + "% &middot; " + BR.fix(g.p / kg, 1) + " g per kg") + stat("Carbohydrate", Math.round(g.c) + " <small>g</small>", Math.round(S.c) + "% of calories") + stat("Fat", Math.round(g.f) + " <small>g</small>", Math.round(S.f) + "% of calories") +
			stat("Fibre", Math.round(MC.fibre(kcal)) + " <small>g</small>", "about 14 g per 1,000 kcal");
		donut(g, S, kcal);
		var pc = MC.proteinCheck(g.p, kg, G.rate), msg = { low: "Protein is <b>very low</b> at " + BR.fix(pc.perKg, 1) + " g/kg. Raise the protein share.", under: "Protein is <b>a little low</b> (" + BR.fix(pc.perKg, 1) + " g/kg) for your goal; aim for " + pc.lo + "&ndash;" + pc.hi + " g/kg.", good: "Protein is <b>on target</b> (" + BR.fix(pc.perKg, 1) + " g/kg; " + pc.lo + "&ndash;" + pc.hi + " is the usual range for your goal).", high: "Protein is <b>high</b> (" + BR.fix(pc.perKg, 1) + " g/kg). Fine for many people, but more than you usually need.", veryhigh: "Protein is <b>very high</b> (" + BR.fix(pc.perKg, 1) + " g/kg): more than most people need." }[pc.key];
		$("mx-check").innerHTML = msg + (low ? '<br><span class="mx-warn">' + BR.group(kcal) + " kcal is below your BMR or the usual 1,200 / 1,500 kcal minimum: choose a slower goal, or ask a doctor.</span>" : "");
		var n = +st.meals, rows = ["<thead><tr><th></th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>"];
		for (var i = 1; i <= n; i++) rows.push("<tr><td>Meal " + i + "</td><td>" + BR.group(pm.kcal) + "</td><td>" + Math.round(pm.p) + " g</td><td>" + Math.round(pm.c) + " g</td><td>" + Math.round(pm.f) + " g</td></tr>");
		rows.push('<tr class="is-total"><td>Whole day</td><td>' + BR.group(kcal) + "</td><td>" + Math.round(g.p) + " g</td><td>" + Math.round(g.c) + " g</td><td>" + Math.round(g.f) + " g</td></tr></tbody>"); $("mx-meals-t").innerHTML = rows.join("");
		var all = MC.PRESETS.map(function (p) { return { n: p.name, id: p.id, g: MC.grams(kcal, p.p, p.c, p.f), p: p }; });
		$("mx-cmp").innerHTML = "<thead><tr><th>Split</th><th>Protein</th><th>Carbs</th><th>Fat</th><th></th></tr></thead><tbody>" + all.map(function (r) { return "<tr" + (r.id === st.preset ? ' class="is-on"' : "") + "><td>" + esc(r.n) + "</td><td>" + Math.round(r.g.p) + " g</td><td>" + Math.round(r.g.c) + " g</td><td>" + Math.round(r.g.f) + ' g</td><td><span class="mx-mini"><span class="mx-c0" style="width:' + r.p.p + '%"></span><span class="mx-c2" style="width:' + r.p.c + '%"></span><span class="mx-c1" style="width:' + r.p.f + '%"></span></span></td></tr>'; }).join("") + "</tbody>";
	}
	function donut(g, S, kcal) {
		var segs = [["Protein", S.p, "mx-c0", Math.round(g.p) + " g · " + Math.round(g.p * 4) + " kcal"], ["Carbohydrate", S.c, "mx-c2", Math.round(g.c) + " g · " + Math.round(g.c * 4) + " kcal"], ["Fat", S.f, "mx-c1", Math.round(g.f) + " g · " + Math.round(g.f * 9) + " kcal"]];
		var off = 25, s = '<svg viewBox="0 0 42 42" role="presentation"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#e8ecef" stroke-width="6" class="mx-track"/>';
		segs.forEach(function (x) { var d = x[1]; s += '<circle class="mx-seg ' + x[2] + '" cx="21" cy="21" r="15.9155" stroke-dasharray="' + d + " " + (100 - d) + '" stroke-dashoffset="' + off + '"><title>' + x[0] + ": " + Math.round(d) + "%</title></circle>"; off -= d; });
		s += '<text class="mx-big" x="21" y="21.8" text-anchor="middle">' + BR.group(kcal) + '</text><text class="mx-sm" x="21" y="26.5" text-anchor="middle">kcal / day</text></svg>';
		$("mx-donut").innerHTML = s; $("mx-donut").setAttribute("aria-label", segs.map(function (x) { return x[0] + " " + Math.round(x[1]) + "%"; }).join(", "));
		$("mx-leg").innerHTML = segs.map(function (x) { return '<li><i class="' + x[2] + '"></i><span>' + x[0] + " (" + Math.round(x[1]) + "%)</span><b>" + x[3] + "</b></li>"; }).join("");
	}
	function url() { return location.origin + "/macro-calculator?sex=" + st.sex + "&age=" + st.age + "&kg=" + BR.trim(BR.num(st.kg), 2) + "&cm=" + BR.trim(BR.num(st.cm), 1) + "&act=" + st.act + "&goal=" + st.goal + "&meals=" + st.meals + "&split=" + st.preset + (st.preset === "custom" ? "&p=" + Math.round(cur.S.p) + "&f=" + Math.round(cur.S.f) : ""); }
	$("mx-link").onclick = function () { if (cur) copy(url(), "Link copied"); };
	$("mx-copy").onclick = function () { if (cur) copy(BR.group(cur.kcal) + " kcal a day: protein " + Math.round(cur.g.p) + " g, carbs " + Math.round(cur.g.c) + " g, fat " + Math.round(cur.g.f) + " g (" + Math.round(cur.S.p) + "/" + Math.round(cur.S.c) + "/" + Math.round(cur.S.f) + "). " + url(), "Summary copied"); };
	$("mx-print").onclick = function () { window.print(); };

	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
