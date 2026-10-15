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
