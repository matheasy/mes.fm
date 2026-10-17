/* MES Body Fat Calculator -- pure maths (no DOM). Browser global `BF`; node: require('./tool_apps_src/body-fat-calculator/lib.js'); tests: node tool_apps_src/body-fat-calculator-tests.js
 * Everything is stored in kg and cm; pounds / inches are conversions of those. */
(function (root) {
	"use strict";
	var LB = 0.45359237, IN = 2.54;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; } function inToCm(i) { return i * IN; } function cmToIn(c) { return c / IN; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }
	function bmi(kg, cm) { var m = cm / 100; return kg / (m * m); }

	/* ---------- methods: all return body-fat percent, or null when the inputs make no sense ---------- */
	// U.S. Navy (Hodgdon & Beckett, 1984), metric form. Tape measurements in cm.
	function navy(sex, cm, neck, waist, hip) {
		var v;
		if (sex === "m") { if (!(waist > neck) || !(cm > 0) || !(neck > 0)) return null; v = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(cm)) - 450; }
		else { if (!(hip > 0) || !(waist + hip > neck) || !(neck > 0) || !(cm > 0)) return null; v = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(cm)) - 450; }
		return isFinite(v) && v > 0 ? v : null;
	}
	// Deurenberg et al. (1991) adult formula from BMI, age and sex
	function fromBmi(sex, kg, cm, age) {
		if (!(kg > 0) || !(cm > 0) || !(age >= 15)) return null;
		var v = 1.2 * bmi(kg, cm) + 0.23 * age - 10.8 * (sex === "m" ? 1 : 0) - 5.4; return v > 0 ? v : null;
	}
	// Waist-to-height ratio is a risk marker, not a body-fat formula
	function whtr(waist, cm) { return waist > 0 && cm > 0 ? waist / cm : null; }
	function whr(waist, hip) { return waist > 0 && hip > 0 ? waist / hip : null; }

	/* ---------- categories (American Council on Exercise) ---------- */
	var CATS = {
		m: [[2, "Below essential", "low"], [6, "Essential fat", "ess"], [14, "Athletes", "ath"], [18, "Fitness", "fit"], [25, "Average", "avg"], [Infinity, "Obese", "obese"]],
		f: [[10, "Below essential", "low"], [14, "Essential fat", "ess"], [21, "Athletes", "ath"], [25, "Fitness", "fit"], [32, "Average", "avg"], [Infinity, "Obese", "obese"]]
	};
	function category(sex, pct) { var L = CATS[sex] || CATS.m; for (var i = 0; i < L.length; i++) if (pct < L[i][0]) return { name: L[i][1], key: L[i][2], index: i }; return { name: L[L.length - 1][1], key: L[L.length - 1][2], index: L.length - 1 }; }
	function masses(kg, pct) { var fat = kg * pct / 100; return { fat: fat, lean: kg - fat }; }
	// weight at a different body-fat %, keeping the lean mass the same
	function weightAt(kg, pct, target) { var lean = kg * (1 - pct / 100); return lean / (1 - target / 100); }
	// fat-free mass index and fat mass index (kg per m^2)
	function ffmi(kg, cm, pct) { var m = cm / 100; return kg * (1 - pct / 100) / (m * m); }
	function fmi(kg, cm, pct) { var m = cm / 100; return kg * pct / 100 / (m * m); }
	// average of the methods that returned a number
	function mean(list) { var a = list.filter(function (x) { return x != null; }); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

	var BF = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, inToCm: inToCm, cmToIn: cmToIn, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, bmi: bmi, navy: navy, fromBmi: fromBmi, whtr: whtr, whr: whr,
		CATS: CATS, category: category, masses: masses, weightAt: weightAt, ffmi: ffmi, fmi: fmi, mean: mean };
	if (typeof module !== "undefined" && module.exports) module.exports = BF; else root.BF = BF;
})(typeof window !== "undefined" ? window : this);

/* MES Body Fat Calculator -- mes.fm/body-fat-calculator (UI; maths in lib.js, global BF).
 * Stored in kg / cm; localStorage "mes-body-fat-calculator:v1" = { sex, age, u, kg, cm, neck, waist, hip, goal }.
 * Links: ?sex=&age=&kg=&cm=&neck=&waist=&hip=  (all kg / cm; neck, waist, hip in cm)
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bf"); if (!root || !window.BF) return;
	var KEY = "mes-body-fat-calculator:v1";
	var EXAMPLES = [["Man, 35, 85 kg, 178 cm", { sex: "m", age: "35", kg: "85", cm: "178", neck: "39", waist: "92", hip: "" }], ["Woman, 30, 65 kg, 165 cm", { sex: "f", age: "30", kg: "65", cm: "165", neck: "33", waist: "78", hip: "100" }], ["Lean man, 28, 75 kg, 180 cm", { sex: "m", age: "28", kg: "75", cm: "180", neck: "38", waist: "79", hip: "" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { sex: "", age: "", u: "m", kg: "", cm: "", neck: "", waist: "", hip: "", goal: "" };
	function clean(s) { var o = {}; o.sex = s.sex === "m" || s.sex === "f" ? s.sex : ""; o.u = s.u === "i" ? "i" : "m"; ["age", "kg", "cm", "neck", "waist", "hip", "goal"].forEach(function (k) { o[k] = String(s[k] == null ? "" : s[k]).slice(0, 8); }); return o; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() {
		var q = new URLSearchParams(location.search); if (!q.has("kg") && !q.has("cm") && !q.has("waist")) return false; var s = Object.assign({}, st);
		["sex", "age", "kg", "cm", "neck", "waist", "hip"].forEach(function (k) { if (q.get(k)) s[k] = q.get(k); }); st = clean(s); return true;
	}
	function toast(msg) { var t = $("bf-toast"); if (!t) { t = document.createElement("div"); t.id = "bf-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }

	/* ---------- inputs: values are stored in kg / cm, shown in the chosen unit ---------- */
	function show() {
		var us = st.u === "i", kg = BF.num(st.kg), cm = BF.num(st.cm);
		$("bf-wu").textContent = us ? "lb" : "kg"; $("bf-hu").textContent = us ? "ft" : "cm"; $("bf-h2box").hidden = !us;
		[].forEach.call(root.querySelectorAll(".bf-lu"), function (e) { e.textContent = us ? "in" : "cm"; });
		$("bf-w").value = kg > 0 ? BF.trim(us ? BF.kgToLb(kg) : kg, 1) : "";
		if (us) { if (cm > 0) { var f = BF.cmToFtIn(cm); $("bf-h").value = String(f.ft); $("bf-h2").value = BF.trim(f.inch, 1); } else { $("bf-h").value = ""; $("bf-h2").value = ""; } } else $("bf-h").value = cm > 0 ? BF.trim(cm, 1) : "";
		["neck", "waist", "hip"].forEach(function (k) { var v = BF.num(st[k]); $("bf-" + k).value = v > 0 ? BF.trim(us ? BF.cmToIn(v) : v, 1) : ""; });
		$("bf-age").value = st.age; $("bf-hipbox").hidden = st.sex !== "f";
		$("bf-waistl").textContent = st.sex === "f" ? "Waist (narrowest)" : "Waist (at navel)";
		[].forEach.call($("bf-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); });
		[].forEach.call($("bf-units").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.u)); });
	}
	function readLen(id) { var v = BF.num($(id).value); return v > 0 ? String(Math.round((st.u === "i" ? BF.inToCm(v) : v) * 100) / 100) : ""; }
	$("bf-w").addEventListener("input", function () { var v = BF.num(this.value); st.kg = v > 0 ? String(Math.round((st.u === "i" ? BF.lbToKg(v) : v) * 1000) / 1000) : ""; save(); update(); });
	function height() { var a = BF.num($("bf-h").value), b = BF.num($("bf-h2").value); if (st.u === "i") st.cm = (a || 0) * 12 + (b || 0) > 0 ? String(Math.round(BF.ftInToCm(a, b) * 100) / 100) : ""; else st.cm = a > 0 ? String(a) : ""; save(); update(); }
	$("bf-h").addEventListener("input", height); $("bf-h2").addEventListener("input", height);
	["neck", "waist", "hip"].forEach(function (k) { $("bf-" + k).addEventListener("input", function () { st[k] = readLen("bf-" + k); save(); update(); }); });
	$("bf-age").addEventListener("input", function () { st.age = this.value.replace(/\D/g, "").slice(0, 3); save(); update(); });
	$("bf-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); show(); update(); });
	$("bf-units").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.u = b.dataset.u; save(); show(); update(); });
	$("bf-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("bf-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(Object.assign({}, st, EXAMPLES[+b.dataset.i][1], { goal: "" })); save(); show(); update(); });
	$("bf-ref").innerHTML = "<thead><tr><th>Category</th><th>Men</th><th>Women</th></tr></thead><tbody>" + [0, 1, 2, 3, 4, 5].map(function (i) { function r(L) { var lo = i === 0 ? 0 : L[i - 1][0], hi = L[i][0]; return hi === Infinity ? lo + "% +" : (i === 0 ? "under " + hi : lo + "&ndash;" + (hi - 1 + 0.9).toFixed(1)) + "%"; } return "<tr><td>" + BF.CATS.m[i][1] + "</td><td>" + r(BF.CATS.m) + "</td><td>" + r(BF.CATS.f) + "</td></tr>"; }).join("") + "</tbody>";

	/* ---------- result ---------- */
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null, GMAX = 45;
	function w(kg) { return BF.trim(kg, 1) + " kg (" + BF.trim(BF.kgToLb(kg), 1) + " lb)"; }
	function update() {
		var kg = BF.num(st.kg), cm = BF.num(st.cm), age = BF.num(st.age), sex = st.sex;
		var okb = sex && kg >= 25 && kg <= 400 && cm >= 90 && cm <= 250 && age >= 15 && age <= 110;
		$("bf-empty").hidden = okb; $("bf-out").hidden = !okb; cur = null; if (!okb) return;
		var navy = BF.navy(sex, cm, BF.num(st.neck), BF.num(st.waist), BF.num(st.hip)), bm = BF.fromBmi(sex, kg, cm, age);
		var est = navy != null ? navy : bm; if (est == null) { $("bf-out").hidden = true; $("bf-empty").hidden = false; return; }
		est = Math.max(2, Math.min(60, est)); var cat = BF.category(sex, est), M = BF.masses(kg, est);
		cur = { kg: kg, cm: cm, est: est, sex: sex, age: age, M: M };
		$("bf-hero").innerHTML = stat("Body fat", BF.fix(est, 1) + "%", esc(cat.name) + (navy != null ? " &middot; U.S. Navy method" : " &middot; BMI method"), "tu-stat--hero") +
			stat("Fat mass", w(M.fat), "the fat you carry") + stat("Lean mass", w(M.lean), "muscle, bone, organs, water") +
			stat("Fat-free mass index", BF.fix(BF.ffmi(kg, cm, est), 1), "kg of lean mass per m&sup2; (about 18&ndash;20 average, 22+ muscular)");
		var v = "Your estimated body fat is <b>" + BF.fix(est, 1) + "%</b>, in the <b>" + esc(cat.name.toLowerCase()) + "</b> range for " + (sex === "m" ? "men" : "women") + ".";
		if (navy == null) v += ' <span class="bf-small">Add your neck and waist' + (sex === "f" ? " and hips" : "") + " measurements for the more accurate tape method.</span>";
		else if (bm != null && Math.abs(navy - bm) > 6) v += " The BMI method says " + BF.fix(bm, 1) + "%: when the two disagree this much, trust the tape measurement.";
		var wh = BF.whtr(BF.num(st.waist), cm); if (wh != null) v += "<br>Waist-to-height ratio: <b>" + BF.fix(wh, 2) + "</b> " + (wh < 0.5 ? "(under 0.5, a lower health risk)" : wh < 0.6 ? "(0.5&ndash;0.6: increased risk)" : '(over 0.6: <span class="bf-warn">high risk</span>)') + ".";
		$("bf-verdict").innerHTML = v + '<br><small class="bf-small">An estimate, not a diagnosis. A DEXA scan or trained caliper reading is more accurate.</small>';
		renderGauge(); renderSplit(); renderGoal();
		$("bf-cmp").innerHTML = "<thead><tr><th>Method</th><th>Body fat</th><th>Category</th></tr></thead><tbody>" + [["U.S. Navy (tape)", navy, "needs neck + waist" + (sex === "f" ? " + hips" : "")], ["BMI-based (Deurenberg)", bm, ""]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + (r[1] == null ? '<span class="bf-small">' + r[2] + "</span>" : BF.fix(r[1], 1) + "%") + "</td><td>" + (r[1] == null ? "&ndash;" : BF.category(sex, r[1]).name) + "</td></tr>"; }).join("") + "</tbody>";
		$("bf-bmr").href = "/bmr-calculator?kg=" + BF.trim(kg, 2) + "&cm=" + BF.trim(cm, 1) + "&age=" + age + "&sex=" + sex + "&bf=" + BF.trim(est, 1) + "&f=katch";
	}
	function pos(p) { return Math.max(0, Math.min(100, p / GMAX * 100)); }
	function renderGauge() {
		var L = BF.CATS[cur.sex], prev = 0, h = '<div class="bf-bar">'; L.forEach(function (c) { var to = Math.min(c[0], GMAX); h += '<span class="bf-band bf-band--' + c[2] + '" style="width:' + ((to - prev) / GMAX * 100) + '%"></span>'; prev = to; });
		h += '</div><div class="bf-pin" style="left:' + pos(cur.est) + '%"><span>' + BF.fix(cur.est, 1) + '%</span></div><div id="bf-goalpin" class="bf-pin bf-pin--goal" style="left:0" hidden><span>goal</span></div><div class="bf-ticks">';
		L.slice(0, -1).forEach(function (c) { h += '<span style="left:' + pos(c[0]) + '%">' + c[0] + "</span>"; });
		$("bf-gauge").innerHTML = h + "</div>";
		var cat = BF.category(cur.sex, cur.est), items = "", lo = 0;
		L.forEach(function (c, i) { var hi = c[0]; items += '<li class="bf-cat bf-cat--' + c[2] + (i === cat.index ? " is-on" : "") + '"><span>' + esc(c[1]) + "</span><span>" + (i === 0 ? "&lt; " + hi : hi === Infinity ? "&ge; " + lo : lo + " &ndash; " + (hi - 0.1).toFixed(1)) + "%</span></li>"; lo = hi; });
		$("bf-cats").innerHTML = items;
	}
	function renderSplit() {
		var M = cur.M, it = [["Fat mass", M.fat, w(M.fat)], ["Lean mass", M.lean, w(M.lean)]];
		$("bf-split").innerHTML = it.map(function (x, i) { var p = x[1] / cur.kg * 100; return '<span class="bf-seg bf-c' + i + '" style="width:' + p + '%">' + (p >= 9 ? Math.round(p) + "%" : "") + "</span>"; }).join("");
		$("bf-split").setAttribute("aria-label", "Fat " + w(M.fat) + ", lean " + w(M.lean));
		$("bf-splitleg").innerHTML = it.map(function (x, i) { return '<li><i class="bf-c' + i + '"></i><span>' + x[0] + "</span><b>" + x[2] + "</b></li>"; }).join("");
	}
	function renderGoal() {
		var sl = $("bf-goal"), g = BF.num(st.goal); if (!(g >= 5 && g <= 40)) g = Math.max(5, Math.min(40, Math.round((BF.CATS[cur.sex][3][0] - 3) * 2) / 2 - 0)); // default: inside the "fitness" band
		if (g >= cur.est - 0.4 && !BF.num(st.goal)) g = Math.max(5, Math.round((cur.est - 3) * 2) / 2);
		sl.value = g; drawGoal(g);
	}
	function drawGoal(g) {
		$("bf-goalout").textContent = BF.trim(g, 1) + "%";
		var pin = $("bf-goalpin"); if (pin) { pin.hidden = false; pin.style.left = pos(g) + "%"; pin.firstChild.textContent = "goal " + BF.trim(g, 1) + "%"; }
		var t = BF.weightAt(cur.kg, cur.est, g), d = t - cur.kg, cat = BF.category(cur.sex, g), h;
		if (Math.abs(d) < 0.05) h = "You are already at that body fat.";
		else if (d < 0) h = "At <b>" + BF.trim(g, 1) + "%</b> (" + esc(cat.name.toLowerCase()) + ") you would weigh about <b>" + w(t) + "</b>: lose about <b>" + w(-d) + "</b> of fat. At 0.5 kg a week that is roughly <b>" + Math.ceil(-d / 0.5) + " weeks</b>.";
		else h = "At <b>" + BF.trim(g, 1) + "%</b> you would weigh about <b>" + w(t) + "</b>, so you would have to <i>add</i> about " + w(d) + " (that is only possible by also gaining fat: the goal is higher than your current body fat).";
		$("bf-goaltext").innerHTML = h;
	}
	$("bf-goal").addEventListener("input", function () { st.goal = this.value; save(); if (cur) drawGoal(+this.value); });
	$("bf-link").onclick = function () { if (!cur) return; copy("https://mes.fm" + "/body-fat-calculator?sex=" + st.sex + "&age=" + st.age + "&kg=" + BF.trim(cur.kg, 2) + "&cm=" + BF.trim(cur.cm, 1) + (BF.num(st.neck) ? "&neck=" + BF.trim(BF.num(st.neck), 1) : "") + (BF.num(st.waist) ? "&waist=" + BF.trim(BF.num(st.waist), 1) : "") + (BF.num(st.hip) ? "&hip=" + BF.trim(BF.num(st.hip), 1) : ""), "Link copied"); };

	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	show(); update();
})();
