/* MES BMR Calculator -- mes.fm/bmr-calculator (UI; maths in lib.js, global BR).
 * Weight / height are kept in kg / cm; localStorage "mes-bmr-calculator:v1" = { sex, age, kg, cm, act, f, bf, tgt }.
 * Links: ?kg=&cm=&age=&sex=m|f&act=sed|light|mod|very|extra&bf=&f=mifflin|harris|katch|cunningham
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("br");
	if (!root || !window.BR) return;
	var KEY = "mes-bmr-calculator:v1";
	var EXAMPLES = [["Man, 30, 80 kg, 180 cm", { sex: "m", age: "30", kg: "80", cm: "180", act: "mod" }], ["Woman, 30, 60 kg, 165 cm", { sex: "f", age: "30", kg: "60", cm: "165", act: "light" }], ["Woman, 45, 150 lb, 5 ft 6 in", { sex: "f", age: "45", kg: "68.04", cm: "167.64", act: "sed" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
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
		if (q.get("act")) s.act = q.get("act"); if (q.get("bf")) s.bf = q.get("bf"); if (q.get("f")) s.f = q.get("f");
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
	$("br-tgt").addEventListener("input", function () { st.tgt = this.value; save(); updateTarget(); });
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
		$("br-hero").innerHTML = stat("Your BMR", BR.group(b) + " <small>kcal/day</small>", BR.group(BR.kcalToKj(b)) + " kJ/day &middot; " + BR.trim(b / 24, 0) + " kcal per hour", "tu-stat--hero") +
			stat("Maintenance calories (TDEE)", BR.group(t) + " <small>kcal/day</small>", esc(A.name) + " &times; " + A.mult + " &middot; " + BR.group(BR.kcalToKj(t)) + " kJ") +
			stat("Equation", esc(F.name.split(" (")[0]), esc(F.note));
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
		$("br-cmp").innerHTML = "<thead><tr><th>Equation</th><th>BMR kcal/day</th><th>TDEE kcal/day</th></tr></thead><tbody>" + BR.ORDER.map(function (k) {
			var x = all[k]; return "<tr" + (k === id ? ' class="is-on"' : "") + "><td>" + esc(BR.FORMULAS[k].name) + "</td><td>" + (x == null ? '<span class="br-small">needs body fat %</span>' : BR.group(x)) + "</td><td>" + (x == null ? "&ndash;" : BR.group(BR.tdee(x, st.act))) + "</td></tr>";
		}).join("") + "</tbody>";
		$("br-acts").innerHTML = "<thead><tr><th>Activity level</th><th>Calories / day</th><th>kJ / day</th></tr></thead><tbody>" + BR.ACTIVITY.map(function (a) {
			return "<tr" + (a.id === st.act ? ' class="is-on"' : "") + "><td>" + esc(a.name) + " (&times;" + a.mult + ")</td><td>" + BR.group(b * a.mult) + "</td><td>" + BR.group(BR.kcalToKj(b * a.mult)) + "</td></tr>";
		}).join("") + "</tbody>";
		updateTarget();
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

	/* ---------- links ---------- */
	function shareUrl() { return location.origin + "/bmr-calculator?" + BR.qs({ kg: BR.num(st.kg), cm: BR.num(st.cm), age: BR.num(st.age), sex: st.sex, act: st.act, bf: BR.num(st.bf), f: st.f }); }
	$("br-link").onclick = function () { copy(shareUrl(), "Link copied"); };
	$("br-copy").onclick = function () { if (!cur) return; copy("BMR " + BR.group(cur.bmr) + " kcal/day, maintenance (TDEE) " + BR.group(cur.tdee) + " kcal/day (" + BR.activity(st.act).name + ", " + BR.FORMULAS[cur.id].name + "). " + shareUrl(), "Summary copied"); };
	$("br-print").onclick = function () { window.print(); };

	load(); var fromLink = fromUrl(); if (fromLink) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
