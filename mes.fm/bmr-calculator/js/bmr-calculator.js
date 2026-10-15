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

/* MES BMR Calculator -- mes.fm/bmr-calculator (UI; maths in lib.js, global BR).
 * Weight / height are kept in kg / cm; localStorage "mes-bmr-calculator:v1" = { sex, age, kg, cm, act, f, bf, tgt }.
 * Links: ?kg=&cm=&age=&sex=m|f&act=sed|light|mod|very|extra&bf=&f=mifflin|harris|katch|cunningham
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("br");
	if (!root || !window.BR) return;
	var KEY = "mes-bmr-calculator:v1", TDEE = root.getAttribute("data-mode") === "tdee";
	var EXAMPLES = [["Man, 30, 80 kg, 180 cm", { sex: "m", age: "30", kg: "80", cm: "180", act: "mod" }], ["Woman, 30, 60 kg, 165 cm", { sex: "f", age: "30", kg: "60", cm: "165", act: "light" }], ["Woman, 45, 150 lb, 5 ft 6 in", { sex: "f", age: "45", kg: "68.04", cm: "167.64", act: "sed" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var urlKcal = null, slideVal = null, touched = false, sig = "";
	var st = { sex: "", age: "", kg: "", cm: "", act: "light", f: "mifflin", bf: "", tgt: "" };
	function clean(s) {
		var o = {};
		o.sex = s.sex === "m" || s.sex === "f" ? s.sex : "";
		o.age = String(s.age || "").slice(0, 3); o.kg = String(s.kg || "").slice(0, 8); o.cm = String(s.cm || "").slice(0, 8); o.bf = String(s.bf || "").slice(0, 5); o.tgt = String(s.tgt || "").slice(0, 8);
		o.act = BR.ACTIVITY.some(function (a) { return a.id === s.act; }) ? s.act : "light";
		o.f = BR.FORMULAS[s.f] ? s.f : "mifflin";
		return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() {
		var q = new URLSearchParams(location.search); if (!q.has("kg") && !q.has("lb") && !q.has("cm") && !q.has("age")) return false;
		var s = Object.assign({}, st);
		if (q.get("sex")) s.sex = q.get("sex"); if (q.get("age")) s.age = q.get("age");
		if (q.get("kg")) s.kg = q.get("kg"); else if (q.get("lb")) { var lb = BR.num(q.get("lb")); if (lb > 0) s.kg = String(Math.round(BR.lbToKg(lb) * 100) / 100); }
		if (q.get("cm")) s.cm = q.get("cm"); else if (q.get("ft") || q.get("in")) s.cm = String(Math.round(BR.ftInToCm(BR.num(q.get("ft")), BR.num(q.get("in"))) * 10) / 10);
		if (q.get("kcal")) urlKcal = BR.num(q.get("kcal"));
		if (q.get("act")) s.act = q.get("act"); s.bf = q.get("bf") || ""; s.f = q.get("f") || "mifflin";
		st = clean(s); return true;
	}
	function toast(msg) {
		var t = $("br-toast"); if (!t) { t = document.createElement("div"); t.id = "br-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}

	/* ---------- inputs ---------- */
	$("br-act").innerHTML = BR.ACTIVITY.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name + " (×" + a.mult + ") – " + a.desc) + "</option>"; }).join("");
	$("br-f").innerHTML = BR.ORDER.map(function (id) { return '<option value="' + id + '">' + esc(BR.FORMULAS[id].name + (BR.FORMULAS[id].needsBf ? " – needs body fat %" : "")) + "</option>"; }).join("");
	function fillOthers(except) {
		var kg = BR.num(st.kg), cm = BR.num(st.cm);
		if (except !== "m") { $("br-kg").value = kg > 0 ? BR.trim(kg, 2) : ""; $("br-cm").value = cm > 0 ? BR.trim(cm, 1) : ""; }
		if (except !== "i") {
			$("br-lb").value = kg > 0 ? BR.trim(BR.kgToLb(kg), 1) : "";
			if (cm > 0) { var f = BR.cmToFtIn(cm); $("br-ft").value = String(f.ft); $("br-in").value = BR.trim(f.inch, 1); } else { $("br-ft").value = ""; $("br-in").value = ""; }
		}
	}
	function syncAll() {
		fillOthers(); $("br-age").value = st.age; $("br-bf").value = st.bf; $("br-act").value = st.act; $("br-f").value = st.f; $("br-tgt").value = st.tgt;
		[].forEach.call($("br-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); });
		if (BR.validBf(BR.num(st.bf)) || st.f === "katch" || st.f === "cunningham") $("br-bfbox").open = true;
	}
	function metric() { var kg = BR.num($("br-kg").value), cm = BR.num($("br-cm").value); st.kg = kg > 0 ? String(kg) : ""; st.cm = cm > 0 ? String(cm) : ""; fillOthers("m"); }
	function imperial() {
		var lb = BR.num($("br-lb").value), ft = BR.num($("br-ft").value), inch = BR.num($("br-in").value);
		st.kg = lb > 0 ? String(Math.round(BR.lbToKg(lb) * 1000) / 1000) : "";
		st.cm = (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(BR.ftInToCm(ft, inch) * 100) / 100) : "";
		fillOthers("i");
	}
	["br-kg", "br-cm"].forEach(function (id) { $(id).addEventListener("input", function () { metric(); save(); update(); }); });
	["br-lb", "br-ft", "br-in"].forEach(function (id) { $(id).addEventListener("input", function () { imperial(); save(); update(); }); });
	$("br-age").addEventListener("input", function () { st.age = this.value.replace(/\D/g, "").slice(0, 3); save(); update(); });
	$("br-bf").addEventListener("input", function () { st.bf = this.value; save(); update(); });
	$("br-tgt").addEventListener("input", function () { st.tgt = this.value; save(); updateTarget(); if (cur) { if (!touched) slideVal = null; renderWhatIf(cur.p, cur.bmr, cur.tdee, cur.id); } });
	$("br-act").addEventListener("change", function () { st.act = this.value; save(); update(); });
	$("br-f").addEventListener("change", function () { st.f = this.value; save(); update(); });
	$("br-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); syncAll(); update(); });
	$("br-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("br-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(Object.assign({}, st, EXAMPLES[+b.dataset.i][1], { bf: "", tgt: "", f: "mifflin" })); save(); syncAll(); update(); });
	$("br-ref").innerHTML = "<thead><tr><th>Level</th><th>Multiplier</th><th>What it means</th></tr></thead><tbody>" + BR.ACTIVITY.map(function (a) { return "<tr><td>" + esc(a.name) + "</td><td>× " + a.mult + "</td><td>" + esc(a.desc) + "</td></tr>"; }).join("") + "</tbody>";

	/* ---------- result ---------- */
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	function person() { return { sex: st.sex, kg: BR.num(st.kg), cm: BR.num(st.cm), age: BR.num(st.age), bf: BR.num(st.bf) }; }
	function update() {
		var p = person(), ok = BR.valid(p);
		$("br-empty").hidden = ok; $("br-out").hidden = !ok; cur = null;
		if (!ok) return;
		var id = st.f, fell = false;
		if (BR.bmr(id, p) == null) { id = "mifflin"; fell = true; }
		var b = BR.bmr(id, p), t = BR.tdee(b, st.act), A = BR.activity(st.act), F = BR.FORMULAS[id];
		cur = { p: p, id: id, bmr: b, tdee: t };
		var sB = stat(TDEE ? "Your BMR (at rest)" : "Your BMR", BR.group(b) + " <small>kcal/day</small>", BR.group(BR.kcalToKj(b)) + " kJ/day &middot; " + BR.trim(b / 24, 0) + " kcal per hour", TDEE ? "" : "tu-stat--hero");
		var sT = stat(TDEE ? "Your TDEE (maintenance)" : "Maintenance calories (TDEE)", BR.group(t) + " <small>kcal/day</small>", esc(A.name) + " &times; " + A.mult + " &middot; " + BR.group(BR.kcalToKj(t)) + " kJ", TDEE ? "tu-stat--hero" : "");
		$("br-hero").innerHTML = (TDEE ? sT + sB : sB + sT) + stat("Equation", esc(F.name.split(" (")[0]), esc(F.note));
		var v = "At rest your body burns about <b>" + BR.group(b) + " kcal a day</b>. With a <b>" + esc(A.name.toLowerCase()) + "</b> lifestyle you burn about <b>" + BR.group(t) + " kcal a day</b>, so that is roughly what you can eat to keep your weight steady.";
		if (fell) v += '<br><span class="br-warn">Enter a body-fat % (valid range 3&ndash;60) to use ' + esc(BR.FORMULAS[st.f].name.split(" (")[0]) + "; Mifflin-St Jeor is shown instead.</span>";
		$("br-verdict").innerHTML = v + '<br><small class="br-small">An estimate for healthy adults, not medical advice. Real needs vary by 10% or more.</small>';
		// goals
		var rows = BR.goalRows(t, p, b), lbl = { "-1": "Lose weight fast", "-0.5": "Lose weight", "-0.25": "Lose weight slowly", "0": "Maintain weight", "0.25": "Gain slowly", "0.5": "Gain weight" };
		$("br-goalnote").innerHTML = "Rates assume about 7,700 kcal per kg (3,500 per lb). Figures in red are below your BMR or the usual 1,200 (women) / 1,500 (men) floor: only do that under a doctor's or dietitian's care.";
		$("br-goals").innerHTML = "<thead><tr><th>Goal</th><th>Per week</th><th>Calories / day</th><th>kJ / day</th></tr></thead><tbody>" + rows.map(function (r) {
			var wk = r.rate === 0 ? "steady" : (r.rate > 0 ? "+" : "−") + BR.trim(Math.abs(r.rate), 2) + " kg (" + BR.trim(BR.kgToLb(Math.abs(r.rate)), 1) + " lb)";
			return "<tr" + (r.rate === 0 ? ' class="is-main"' : "") + "><td>" + lbl[String(r.rate)] + "</td><td>" + wk + '</td><td class="' + (r.low ? "is-low" : "") + '">' + BR.group(r.kcal) + (r.low ? " &#9888;" : "") + "</td><td>" + BR.group(BR.kcalToKj(r.kcal)) + "</td></tr>";
		}).join("") + "</tbody>";
		// compare equations
		var all = BR.all(p);
		$("br-cmp").innerHTML = "<thead><tr><th>Equation</th><th>BMR kcal/day</th><th>TDEE kcal/day</th><th></th></tr></thead><tbody>" + BR.ORDER.map(function (k) {
			var x = all[k], mx = Math.max.apply(null, BR.ORDER.map(function (q) { return all[q] || 0; }));
			return "<tr" + (k === id ? ' class="is-on"' : "") + "><td>" + esc(BR.FORMULAS[k].name) + "</td><td>" + (x == null ? '<span class="br-small">needs body fat %</span>' : BR.group(x)) + "</td><td>" + (x == null ? "&ndash;" : BR.group(BR.tdee(x, st.act))) + "</td><td class=\"br-barcell\">" + (x == null ? "" : '<span class="br-bar" style="width:' + (x / mx * 100) + '%"></span>') + "</td></tr>";
		}).join("") + "</tbody>";
		$("br-acts").innerHTML = "<thead><tr><th>Activity level</th><th>Calories / day</th><th>kJ / day</th><th></th></tr></thead><tbody>" + BR.ACTIVITY.map(function (a) {
			return "<tr" + (a.id === st.act ? ' class="is-on"' : "") + "><td>" + esc(a.name) + " (&times;" + a.mult + ")</td><td>" + BR.group(b * a.mult) + "</td><td>" + BR.group(BR.kcalToKj(b * a.mult)) + '</td><td class="br-barcell"><span class="br-bar" style="width:' + (a.mult / 1.9 * 100) + '%"></span></td></tr>';
		}).join("") + "</tbody>";
		updateTarget(); renderVisuals(p, b, t, id);
	}
	function parseTarget() {
		var t = String($("br-tgt").value || "").trim(), lb = /lbs?$/i.test(t); var n = BR.num(t.replace(/\s*(kg|lbs?)$/i, "")); if (!(n > 0)) return null; return lb ? BR.lbToKg(n) : n;
	}
	function updateTarget() {
		var o = $("br-tgtout"); if (!o) return; if (!cur) { o.textContent = ""; return; }
		var tk = parseTarget(); if (tk == null) { o.textContent = ""; return; }
		var p = cur.p, diff = tk - p.kg;
		if (tk < 30 || tk > 300) { o.textContent = "That goal weight does not look right."; return; }
		var bm = BR.bmiOf(tk, p.cm), extra = bm < 18.5 ? ' <span class="br-warn">That is a BMI of ' + BR.fix(bm, 1) + ", under the healthy range.</span>" : "";
		if (Math.abs(diff) < 0.05) { o.innerHTML = "You are already at that weight."; return; }
		var rate = diff < 0 ? -0.5 : 0.25, w = BR.weeksTo(p.kg, tk, rate), cal = cur.tdee + BR.kcalForRate(rate), low = cal < BR.floor(p.sex, cur.bmr);
		var d = new Date(Date.now() + w * 7 * 864e5), when = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
		o.innerHTML = "To " + (diff < 0 ? "lose " : "gain ") + "<b>" + BR.trim(Math.abs(diff), 1) + " kg (" + BR.trim(BR.kgToLb(Math.abs(diff)), 1) + " lb)</b> at " + (diff < 0 ? "0.5 kg" : "0.25 kg") + " a week takes about <b>" + Math.ceil(w) + " weeks</b> (around " + esc(when) + ") eating <b>" + BR.group(cal) + " kcal a day</b>." + (low ? ' <span class="br-warn">That is below the usual minimum: choose a slower rate.</span>' : "") + extra;
	}


	/* ---------- charts ---------- */
	function pct(x, tot) { return Math.round(x / tot * 100); }
	function bar(el, leg, items, tot) {
		$(el).innerHTML = items.map(function (it, i) { var w = it[1] / tot * 100; return '<span class="br-seg br-c' + i + '" style="width:' + w + '%" title="' + esc(it[0]) + ": " + esc(it[2]) + '">' + (w >= 9 ? pct(it[1], tot) + "%" : "") + "</span>"; }).join("");
		$(el).setAttribute("aria-label", items.map(function (it) { return it[0] + " " + it[2]; }).join(", "));
		$(leg).innerHTML = items.map(function (it, i) { return '<li><i class="br-c' + i + '"></i><span>' + esc(it[0]) + "</span><b>" + esc(it[2]) + "</b></li>"; }).join("");
	}
	function niceStep(range, n) { var r = range / n, m = Math.pow(10, Math.floor(Math.log10(r))), f = r / m; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * m; }
	function axisY(lo, hi, X0, X1, Y, n) {
		var step = niceStep(hi - lo, n || 4), o = "";
		for (var g = Math.ceil(lo / step) * step; g <= hi + 1e-9; g += step) o += '<line class="br-gl" x1="' + X0 + '" x2="' + X1 + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="br-ct" x="' + (X0 - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + BR.trim(g, step < 1 ? 1 : 0) + "</text>";
		return o;
	}
	function renderVisuals(p, b, t, id) {
		var S = BR.energySplit(b, t);
		bar("br-split", "br-splitleg", [["Resting (BMR)", S.rest, BR.group(S.rest) + " kcal"], ["Digesting food", S.food, BR.group(S.food) + " kcal"], ["Movement & exercise", S.move, BR.group(S.move) + " kcal"]], t);
		var O = BR.ORGANS.map(function (o) { return [o[0], o[1], "about " + BR.group(b * o[1] / 100) + " kcal"]; });
		bar("br-organs", "br-organsleg", O, 100);
		renderWhatIf(p, b, t, id); renderAge(p, id);
	}
	var proj = null;
	function defaultIntake(t) { var tk = parseTarget(), r = 0; if (tk != null && cur) r = tk < cur.p.kg ? -0.5 : tk > cur.p.kg ? 0.25 : 0; return Math.round((t + BR.kcalForRate(r)) / 50) * 50; }
	function renderWhatIf(p, b, t, id) {
		var key = [st.sex, st.age, st.kg, st.cm, st.act, id, st.bf].join("|");
		var sl = $("br-slide"), lo = 1000, hi = Math.max(2000, Math.ceil((t + 1000) / 50) * 50);
		if (key !== sig) { sig = key; touched = false; slideVal = null; }
		if (urlKcal) { slideVal = urlKcal; touched = true; urlKcal = null; }
		if (slideVal == null) slideVal = defaultIntake(t);
		slideVal = Math.max(lo, Math.min(hi, Math.round(slideVal / 50) * 50));
		sl.min = lo; sl.max = hi; sl.value = slideVal;
		var T = Math.round(t / 50) * 50;
		$("br-slidebtns").innerHTML = [["Lose 0.5 kg/wk", Math.round((t + BR.kcalForRate(-0.5)) / 50) * 50], ["Maintain", T], ["Gain 0.25 kg/wk", Math.round((t + BR.kcalForRate(0.25)) / 50) * 50]].map(function (x) { return '<button type="button" class="tu-chip" data-v="' + x[1] + '">' + x[0] + "</button>"; }).join("");
		drawWhatIf(p, b, t, id);
	}
	function drawWhatIf(p, b, t, id) {
		var I = slideVal, diff = I - t, rate = diff * 7 / 7700, tk = parseTarget(), fl = BR.floor(p.sex, b);
		$("br-slideout").textContent = BR.group(I) + " kcal";
		var all = BR.project(p, I, st.act, id, 104), reached = tk != null ? BR.weekReached(all, tk) : null;
		var N = reached != null ? Math.min(104, Math.max(8, reached + 4)) : (tk != null ? 52 : 26), w = all.slice(0, N + 1), end = w[N];
		var txt = "Eating <b>" + BR.group(I) + " kcal</b> is " + (Math.abs(diff) < 25 ? "about your maintenance" : "<b>" + BR.group(Math.abs(diff)) + " kcal " + (diff < 0 ? "below" : "above") + "</b> it") + ".";
		if (Math.abs(diff) >= 25) txt += " That is about <b>" + (rate < 0 ? "−" : "+") + BR.trim(Math.abs(rate), 2) + " kg (" + BR.trim(BR.kgToLb(Math.abs(rate)), 1) + " lb) a week</b> at first, slowing as your weight changes.";
		txt += " In " + N + " weeks you would be about <b>" + BR.trim(end, 1) + " kg (" + BR.trim(BR.kgToLb(end), 1) + " lb)</b>.";
		if (reached != null && tk != null) { var d = new Date(Date.now() + reached * 7 * 864e5); txt += " You would reach your goal of " + BR.trim(tk, 1) + " kg in about <b>" + reached + " weeks</b> (" + d.toLocaleDateString(undefined, { month: "short", year: "numeric" }) + ")."; }
		else if (tk != null) txt += " At this intake you would not reach " + BR.trim(tk, 1) + " kg within two years.";
		if (I < fl) txt += ' <span class="br-warn">Below ' + BR.group(fl) + " kcal is not advised without medical supervision.</span>";
		$("br-whatif").innerHTML = txt;
		// chart
		var W = 640, H = 250, L = 46, R = 16, Tp = 14, B = 32, vals = w.slice(); if (tk != null) vals.push(tk);
		var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = Math.max(1, (hi - lo) * 0.15); lo -= pad; hi += pad;
		var X = function (i) { return L + i / N * (W - L - R); }, Y = function (v) { return Tp + (hi - v) / (hi - lo) * (H - Tp - B); };
		var s = axisY(lo, hi, L, W - R, Y, 4), step = N <= 12 ? 2 : N <= 30 ? 4 : N <= 60 ? 8 : 13;
		for (var i = 0; i <= N; i += step) s += '<text class="br-ct" x="' + X(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + i + "</text>";
		s += '<text class="br-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">weeks</text><text class="br-ct" x="6" y="10">kg</text>';
		if (tk != null) s += '<line class="br-target" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(tk) + '" y2="' + Y(tk) + '"/><text class="br-ct br-tt" x="' + (W - R) + '" y="' + (Y(tk) - 5) + '" text-anchor="end">goal ' + BR.trim(tk, 1) + " kg</text>";
		var pts = w.map(function (v, i) { return X(i) + "," + Y(v); });
		s += '<polygon class="br-area" points="' + L + "," + Y(lo) + " " + pts.join(" ") + " " + X(N) + "," + Y(lo) + '"/><polyline class="br-line" points="' + pts.join(" ") + '"/>';
		s += '<circle class="br-dot" cx="' + X(0) + '" cy="' + Y(w[0]) + '" r="4.5"/><circle class="br-dot" cx="' + X(N) + '" cy="' + Y(end) + '" r="4.5"/><g id="br-hov" hidden><line class="br-cross" y1="' + Tp + '" y2="' + (H - B) + '"/><circle class="br-dot" r="5"/></g>';
		$("br-proj").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		proj = { w: w, N: N, X: X, Y: Y, L: L, R: R, W: W, p: p, id: id };
		$("br-projread").textContent = "Move over the chart to read a week.";
	}
	function hover(ev) {
		if (!proj) return; var svg = $("br-proj").querySelector("svg"); if (!svg) return;
		var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * proj.W, i = Math.round((x - proj.L) / (proj.W - proj.L - proj.R) * proj.N);
		i = Math.max(0, Math.min(proj.N, i)); var v = proj.w[i], g = $("br-hov"); if (!g) return;
		g.hidden = false; g.querySelector("line").setAttribute("x1", proj.X(i)); g.querySelector("line").setAttribute("x2", proj.X(i)); var c = g.querySelector("circle"); c.setAttribute("cx", proj.X(i)); c.setAttribute("cy", proj.Y(v));
		var d = new Date(Date.now() + i * 7 * 864e5), q = { sex: proj.p.sex, kg: v, cm: proj.p.cm, age: proj.p.age, bf: proj.p.bf }, m = BR.bmr(proj.id, q);
		$("br-projread").innerHTML = "<b>Week " + i + "</b> (" + d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + "): <b>" + BR.trim(v, 1) + " kg (" + BR.trim(BR.kgToLb(v), 1) + " lb)</b>, BMI " + BR.fix(BR.bmiOf(v, proj.p.cm), 1) + (m ? ", maintenance then about " + BR.group(BR.tdee(m, st.act)) + " kcal" : "");
	}
	$("br-proj").addEventListener("mousemove", hover); $("br-proj").addEventListener("touchmove", function (e) { if (e.touches[0]) hover(e.touches[0]); }, { passive: true });
	$("br-proj").addEventListener("mouseleave", function () { var g = $("br-hov"); if (g) g.hidden = true; });
	$("br-slide").addEventListener("input", function () { slideVal = +this.value; touched = true; if (cur) drawWhatIf(cur.p, cur.bmr, cur.tdee, cur.id); });
	$("br-slidebtns").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || !cur) return; slideVal = +b.dataset.v; touched = true; $("br-slide").value = slideVal; drawWhatIf(cur.p, cur.bmr, cur.tdee, cur.id); });
	function renderAge(p, id) {
		var data = BR.bmrByAge(id, p, 18, 85), el = $("br-agechart"); if (data.length < 2) { el.innerHTML = ""; return; }
		var W = 640, H = 230, L = 46, R = 16, Tp = 22, B = 30, vs = data.map(function (d) { return d[1]; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), pd = (hi - lo) * 0.15 + 20; lo -= pd; hi += pd;
		var X = function (a) { return L + (a - 18) / 67 * (W - L - R); }, Y = function (v) { return Tp + (hi - v) / (hi - lo) * (H - Tp - B); };
		var s = axisY(lo, hi, L, W - R, Y, 4); for (var a = 20; a <= 80; a += 10) s += '<text class="br-ct" x="' + X(a) + '" y="' + (H - 10) + '" text-anchor="middle">' + a + "</text>";
		s += '<text class="br-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">age</text><text class="br-ct" x="6" y="12">kcal/day</text>';
		s += '<polyline class="br-line" points="' + data.map(function (d) { return X(d[0]) + "," + Y(d[1]); }).join(" ") + '"/>';
		var me = Math.max(18, Math.min(85, p.age)), mv = BR.bmr(id, { sex: p.sex, kg: p.kg, cm: p.cm, age: me, bf: p.bf });
		s += '<line class="br-cross" x1="' + X(me) + '" x2="' + X(me) + '" y1="' + Tp + '" y2="' + (H - B) + '"/><circle class="br-dot" cx="' + X(me) + '" cy="' + Y(mv) + '" r="5"/><text class="br-ct br-tt" x="' + Math.min(X(me) + 8, W - 90) + '" y="' + (Tp + 2) + '">you: ' + BR.group(mv) + "</text>";
		data.forEach(function (d) { if (d[0] % 5 === 0) s += '<circle class="br-pt" cx="' + X(d[0]) + '" cy="' + Y(d[1]) + '" r="7"><title>Age ' + d[0] + ": " + BR.group(d[1]) + " kcal/day</title></circle>"; });
		el.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}

	/* ---------- links ---------- */
	function shareUrl() { return location.origin + location.pathname.replace(/\/index\.html$/, "") + "?" + BR.qs({ kg: BR.num(st.kg), cm: BR.num(st.cm), age: BR.num(st.age), sex: st.sex, act: st.act, bf: BR.num(st.bf), f: st.f, intake: touched && slideVal ? slideVal : null }); }
	$("br-link").onclick = function () { copy(shareUrl(), "Link copied"); };
	$("br-copy").onclick = function () { if (!cur) return; copy("BMR " + BR.group(cur.bmr) + " kcal/day, maintenance (TDEE) " + BR.group(cur.tdee) + " kcal/day (" + BR.activity(st.act).name + ", " + BR.FORMULAS[cur.id].name + "). " + shareUrl(), "Summary copied"); };
	$("br-print").onclick = function () { window.print(); };

	load(); var fromLink = fromUrl(); if (fromLink) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
