/* MES BMI Calculator 2.0 -- mes.fm/bmicalculator (UI; maths + share encoding in lib.js, global BM).
 * Weight / height are kept in kg / cm; localStorage "mes-bmicalculator:v1" = { kg, cm, units, scale, history }.
 * Links: ?kg=&cm= (or ?lb=&ft=&in=) for one result, ?s=<encoded> with the history; old /bmicalculator/s/<id> links resolve via /api/share?calc=bmi.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bm");
	if (!root || !window.BM) return;
	var KEY = "mes-bmicalculator:v1", memOnly = false;
	var EXAMPLES = [["6 ft, 145 lb", { kg: "65.77", cm: "182.88" }], ["170 cm, 85 kg", { kg: "85", cm: "170" }], ["5 ft 4 in, 120 lb", { kg: "54.43", cm: "162.56" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { kg: "", cm: "", units: "b", scale: "who", history: [] };
	function load() {
		try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { st.kg = String(s.kg || ""); st.cm = String(s.cm || ""); st.units = s.ru === "m" || s.ru === "i" ? s.ru : "b"; st.scale = s.scale === "asia" ? "asia" : "who"; st.history = (Array.isArray(s.history) ? s.history : []).map(BM.cleanEntry).filter(Boolean); } } catch (e) { memOnly = true; }
	}
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(Object.assign({ ru: st.units }, st))); memOnly = false; } catch (e) { memOnly = true; }
		$("bm-store-note").textContent = memOnly ? "Your browser is blocking storage, so your measurements will be lost when you close this tab. Copy a link to keep them." : st.history.length + (st.history.length === 1 ? " measurement" : " measurements") + " saved in this browser.";
	}
	function toast(msg) {
		var t = $("bm-toast"); if (!t) { t = document.createElement("div"); t.id = "bm-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function flash(btn) {
		if (!btn) return; if (btn._o == null) btn._o = btn.textContent; btn.textContent = "Copied \u2713"; btn.classList.add("bm-copied");
		clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = btn._o; btn._o = null; btn.classList.remove("bm-copied"); }, 1600);
	}
	function copy(text, msg, btn) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); flash(btn); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); flash(btn); }, fb); else fb();
	}
	function notice(h) { var n = $("bm-notice"); n.innerHTML = h || ""; n.hidden = !h; }

	/* ---------- inputs: kg / cm are the truth, the other unit system mirrors them ---------- */
	function fillOthers(except) {
		var kg = BM.num(st.kg), cm = BM.num(st.cm);
		if (except !== "m") { $("bm-kg").value = kg > 0 ? BM.trim(kg, 2) : ""; $("bm-cm").value = cm > 0 ? BM.trim(cm, 1) : ""; }
		if (except !== "i") {
			$("bm-lb").value = kg > 0 ? BM.trim(BM.kgToLb(kg), 1) : "";
			if (cm > 0) { var f = BM.cmToFtIn(cm); $("bm-ft").value = String(f.ft); $("bm-in").value = BM.trim(f.inch, 1); } else { $("bm-ft").value = ""; $("bm-in").value = ""; }
		}
	}
	function fromMetric() { var kg = BM.num($("bm-kg").value), cm = BM.num($("bm-cm").value); st.kg = kg > 0 ? String(kg) : ""; st.cm = cm > 0 ? String(cm) : ""; fillOthers("m"); }
	function fromImperial() {
		var lb = BM.num($("bm-lb").value), ft = BM.num($("bm-ft").value), inch = BM.num($("bm-in").value);
		st.kg = lb > 0 ? String(Math.round(BM.lbToKg(lb) * 1000) / 1000) : "";
		st.cm = (ft > 0 || inch > 0) && (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(BM.ftInToCm(ft, inch) * 100) / 100) : "";
		fillOthers("i");
	}
	["bm-kg", "bm-cm"].forEach(function (id) { $(id).addEventListener("input", function () { fromMetric(); save(); update(); }); });
	["bm-lb", "bm-ft", "bm-in"].forEach(function (id) { $(id).addEventListener("input", function () { fromImperial(); save(); update(); }); });
	$("bm-units").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.units = b.dataset.u; save(); showUnits(); update(); });
	$("bm-scale").addEventListener("change", function () { st.scale = this.value; save(); update(); });
	function showUnits() {
		[].forEach.call($("bm-units").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.units)); });
	}

	$("bm-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("bm-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EXAMPLES[+b.dataset.i][1]; st.kg = x.kg; st.cm = x.cm; fillOthers(); save(); update(); });

	/* ---------- result ---------- */
	function wt(kg) { var lb = BM.trim(BM.kgToLb(kg), 1) + " lb", k = BM.trim(kg, 1) + " kg"; return st.units === "i" ? lb : st.units === "m" ? k : lb + " (" + k + ")"; }
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	var GAUGE = { min: 14, max: 42 };
	function bandColors(scale) { return scale === "asia" ? [[18.5, "under"], [23, "normal"], [27.5, "over"], [GAUGE.max, "obese"]] : [[18.5, "under"], [25, "normal"], [30, "over"], [GAUGE.max, "obese"]]; }
	function update() {
		var kg = BM.num(st.kg), cm = BM.num(st.cm), b = BM.bmi(kg, cm);
		cur = b == null ? null : { kg: kg, cm: cm, bmi: b };
		$("bm-empty").hidden = b != null; $("bm-out").hidden = b == null;
		renderHistory();
		if (b == null) return;
		var S = st.scale, cat = BM.category(b, S), R = BM.healthyRange(cm, S), N = BM.toNormal(kg, cm, S), r1 = Math.round(b * 10) / 10;
		var cls = cat.group === "normal" ? "tu-stat--hero" : "";
		$("bm-hero").innerHTML = stat("Your BMI", BM.fix(b, 1), esc(cat.name), cls || "tu-stat--hero") +
			stat("Healthy weight for your height", wt(R.lo) + " &ndash; " + wt(R.hi), "BMI " + BM.trim(R.loBmi, 1) + " to " + BM.trim(R.hiBmi, 1)) +
			stat("BMI Prime", BM.fix(BM.prime(b, S), 2), "your BMI &divide; " + BM.trim(BM.SCALES[S].hi, 1) + " (1.00 or less is in range)") +
			stat("Ponderal Index", BM.fix(BM.ponderal(kg, cm), 1), "kg per m&sup3; (an alternative that suits very tall or short people)");
		var v;
		if (N.dir === "none") v = "You have a <b>normal body weight</b>. Great job! Your healthy range at this height is " + wt(R.lo) + " to " + wt(R.hi) + ".";
		else if (N.dir === "gain") v = "You are <b>" + esc(cat.name.charAt(0).toLowerCase() + cat.name.slice(1)) + "</b>. To reach a normal body weight you would need to gain between <b>" + wt(N.min) + "</b> and <b>" + wt(N.max) + "</b>.";
		else v = "You are <b>" + esc(cat.name.charAt(0).toLowerCase() + cat.name.slice(1)) + "</b>. To reach a normal body weight you would need to lose between <b>" + wt(N.min) + "</b> and <b>" + wt(N.max) + "</b>.";
		$("bm-verdict").innerHTML = v + '<br><small class="bm-small">BMI is a screening guide, not a diagnosis. It does not account for muscle, build, age or ethnicity.</small>';
		$("bm-verdict").className = "tu-card bm-verdict is-" + cat.group;
		// gauge
		var bands = bandColors(S), prev = GAUGE.min, h = '<div class="bm-bar">';
		bands.forEach(function (x) { h += '<span class="bm-band bm-band--' + x[1] + '" style="width:' + ((x[0] - prev) / (GAUGE.max - GAUGE.min) * 100) + '%"></span>'; prev = x[0]; });
		var pos = Math.max(0, Math.min(100, (b - GAUGE.min) / (GAUGE.max - GAUGE.min) * 100));
		h += '</div><div class="bm-pin" style="left:' + pos + '%"><span>' + BM.fix(b, 1) + '</span></div><div class="bm-ticks">';
		bands.slice(0, -1).forEach(function (x) { h += '<span style="left:' + ((x[0] - GAUGE.min) / (GAUGE.max - GAUGE.min) * 100) + '%">' + BM.trim(x[0], 1) + "</span>"; });
		$("bm-gauge").innerHTML = h + "</div>";
		var cats = BM.SCALES[S].cuts, lo = 0, items = "";
		cats.forEach(function (c, i) { var from = i === 0 ? null : cats[i - 1][0], to = c[0]; items += '<li class="bm-cat bm-cat--' + c[2] + (i === cat.index ? " is-on" : "") + '"><span>' + esc(c[1]) + "</span><span>" + (from == null ? "&lt; " + BM.trim(to, 1) : to === Infinity ? "&ge; " + BM.trim(from, 1) : BM.trim(from, 1) + " &ndash; " + BM.trim(Math.round((to - 0.1) * 10) / 10, 1)) + "</span></li>"; });
		$("bm-cats").innerHTML = items;
	}

	/* ---------- history ---------- */
	function today() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
	$("bm-save").onclick = function () { $("bm-hist-card").hidden = false; $("bm-addrow").hidden = false; $("bm-date").value = today(); $("bm-note").value = ""; $("bm-hist-card").scrollIntoView({ behavior: "smooth", block: "center" }); $("bm-note").focus(); };
	$("bm-addcancel").onclick = function () { $("bm-addrow").hidden = true; renderHistory(); };
	$("bm-add").onclick = function () {
		if (!cur) { toast("Enter your weight and height first"); return; }
		var e = BM.cleanEntry({ d: $("bm-date").value, kg: cur.kg, cm: cur.cm, n: $("bm-note").value });
		if (!e) { toast("Pick a date"); return; }
		st.history = st.history.filter(function (x) { return !(x.d === e.d && x.n === e.n); }); st.history.push(e); st.history = BM.sortEntries(st.history);
		$("bm-addrow").hidden = true; save(); renderHistory(); toast("Saved " + e.d);
	};
	function renderHistory() {
		var card = $("bm-hist-card"), list = BM.sortEntries(st.history);
		card.hidden = !list.length && $("bm-addrow").hidden; if (card.hidden) return;
		var rows = list.slice().reverse().map(function (e, i) {
			var b = BM.bmi(e.kg, e.cm), c = BM.category(b, st.scale);
			return '<tr><td>' + esc(e.d) + "</td><td>" + wt(e.kg) + "</td><td>" + BM.fix(b, 1) + "</td><td>" + esc(c.name) + "</td><td>" + esc(e.n) + '</td><td><button type="button" class="bm-del" data-d="' + esc(e.d) + '" data-n="' + esc(e.n) + '" aria-label="Delete the entry of ' + esc(e.d) + '">✕</button></td></tr>';
		}).join("");
		$("bm-table").innerHTML = list.length ? "<thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Category</th><th>Note</th><th></th></tr></thead><tbody>" + rows + "</tbody>" : "";
		$("bm-chart").innerHTML = list.length > 1 ? chart(list) : (list.length ? '<p class="tu-note">Save another measurement to see your BMI over time.</p>' : "");
		$("bm-csv").disabled = $("bm-link-all").disabled = !list.length;
	}
	$("bm-table").addEventListener("click", function (e) {
		var b = e.target.closest(".bm-del"); if (!b) return;
		var snap = st.history.slice(); st.history = st.history.filter(function (x) { return !(x.d === b.dataset.d && (x.n || "") === b.dataset.n); }); save(); renderHistory();
		notice('Entry deleted. <button type="button" class="tu-chip" id="bm-undo">Undo</button>'); $("bm-undo").onclick = function () { st.history = snap; save(); renderHistory(); notice(""); };
	});
	function chart(list) {
		var W = 640, H = 240, L = 40, R = 14, T = 12, B = 30, bm = list.map(function (e) { return BM.bmi(e.kg, e.cm); });
		var lo = Math.min(15, Math.floor(Math.min.apply(null, bm)) - 1), hi = Math.max(32, Math.ceil(Math.max.apply(null, bm)) + 1);
		var t0 = Date.parse(list[0].d), t1 = Date.parse(list[list.length - 1].d) || t0 + 1; if (t1 === t0) t1 = t0 + 864e5;
		var X = function (d) { return L + (Date.parse(d) - t0) / (t1 - t0) * (W - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
		var cuts = st.scale === "asia" ? [18.5, 23, 27.5] : [18.5, 25, 30], cls = ["under", "normal", "over", "obese"], edges = [lo].concat(cuts.filter(function (c) { return c > lo && c < hi; }), [hi]), s = "";
		var allCuts = [lo].concat(cuts, [hi]);
		for (var i = 0; i < 4; i++) { var a = Math.max(lo, allCuts[i]), z = Math.min(hi, allCuts[i + 1]); if (z > a) s += '<rect class="bm-cb bm-cb--' + cls[i] + '" x="' + L + '" y="' + Y(z) + '" width="' + (W - L - R) + '" height="' + (Y(a) - Y(z)) + '"/>'; }
		for (var g = Math.ceil(lo / 5) * 5; g <= hi; g += 5) s += '<text class="bm-ct" x="' + (L - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + '</text><line class="bm-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/>';
		var pts = list.map(function (e, i) { return X(e.d) + "," + Y(bm[i]); });
		s += '<polyline class="bm-line" points="' + pts.join(" ") + '"/>';
		list.forEach(function (e, i) { s += '<circle class="bm-dot" cx="' + X(e.d) + '" cy="' + Y(bm[i]) + '" r="4"><title>' + esc(e.d) + ": BMI " + BM.fix(bm[i], 1) + ", " + esc(wt(e.kg)) + '</title></circle>'; });
		s += '<text class="bm-ct" x="' + L + '" y="' + (H - 8) + '">' + esc(list[0].d) + '</text><text class="bm-ct" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(list[list.length - 1].d) + "</text>";
		return '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	$("bm-csv").onclick = function () { var l = ["Date\tWeight (kg)\tHeight (cm)\tBMI\tNote"]; BM.sortEntries(st.history).forEach(function (e) { l.push([e.d, e.kg, e.cm, BM.fix(BM.bmi(e.kg, e.cm), 1), e.n].join("\t")); }); copy(l.join("\n"), "Copied: paste it into a spreadsheet"); };

	/* ---------- links ---------- */
	function shareUrl(withHistory) { return location.origin + "/bmicalculator?" + (withHistory ? "s=" + BM.encode(st) : "kg=" + encodeURIComponent(BM.trim(BM.num(st.kg), 2)) + "&cm=" + encodeURIComponent(BM.trim(BM.num(st.cm), 1)) + (st.scale === "asia" ? "&scale=asia" : "")); }
	$("bm-link").onclick = function () { copy(shareUrl(false), "Link copied", this); };
	$("bm-link-all").onclick = function () { copy(shareUrl(true), "Link copied: it holds your whole history", this); };
	document.querySelector("#bm .bm-print").onclick = function () { window.print(); };

	function loadOld(id) {
		notice("Loading the calculation from your shared link…");
		var f = window.fetch ? window.fetch("/api/share?calc=bmi&id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }) : Promise.reject(new Error("no fetch"));
		return f.then(function (d) { var o = BM.fromOldShare(d); if (!o) throw new Error("bad"); st.kg = o.kg; st.cm = o.cm; fillOthers(); save(); update(); notice(""); history.replaceState(null, "", "/bmicalculator"); toast("Shared result loaded"); })
			.catch(function () { notice("That old shared link could not be loaded (it may have expired). Enter your weight and height above."); });
	}

	/* ---------- init ---------- */
	load();
	var q = new URLSearchParams(location.search), m = location.pathname.match(/^\/bmicalculator\/s\/([A-Za-z0-9]+)\/?$/);
	if (q.get("s")) { var d = BM.decode(q.get("s")); if (d) { st.kg = d.kg; st.cm = d.cm; st.scale = d.scale; var have = {}; st.history.forEach(function (e) { have[e.d + "|" + e.n + "|" + e.kg] = 1; }); d.history.forEach(function (e) { if (!have[e.d + "|" + e.n + "|" + e.kg]) st.history.push(e); }); st.history = BM.sortEntries(st.history); notice("Opened a shared result. It is saved in this browser now."); } else notice("That link could not be read."); history.replaceState(null, "", location.pathname); }
	else if (q.get("kg") || q.get("cm") || q.get("lb") || q.get("ft") || q.get("in")) {
		if (q.get("kg") || q.get("cm")) { st.kg = String(BM.num(q.get("kg")) || ""); st.cm = String(BM.num(q.get("cm")) || ""); }
		else { var lb = BM.num(q.get("lb")), ft = BM.num(q.get("ft")), inch = BM.num(q.get("in")); st.kg = lb > 0 ? String(Math.round(BM.lbToKg(lb) * 1000) / 1000) : ""; st.cm = ((ft || 0) * 12 + (inch || 0)) > 0 ? String(Math.round(BM.ftInToCm(ft, inch) * 100) / 100) : ""; }
		if (q.get("scale") === "asia") st.scale = "asia"; history.replaceState(null, "", location.pathname);
	}
	$("bm-scale").value = st.scale; showUnits(); fillOthers(); save(); update();
	if (m && !q.get("s")) loadOld(m[1]);
	// the reference table
	(function () { var h = "<thead><tr><th>Category</th><th>WHO standard</th><th>Asian</th></tr></thead><tbody>"; [["Severe thinness", "&lt; 16", "&lt; 16"], ["Moderate thinness", "16 &ndash; 16.9", "16 &ndash; 16.9"], ["Mild thinness", "17 &ndash; 18.4", "17 &ndash; 18.4"], ["Normal weight", "18.5 &ndash; 24.9", "18.5 &ndash; 22.9"], ["Overweight", "25 &ndash; 29.9", "23 &ndash; 27.4"], ["Obese", "30 and over (class I 30&ndash;34.9, II 35&ndash;39.9, III 40+)", "27.5 and over"]].forEach(function (r) { h += "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }); $("bm-ref").innerHTML = h + "</tbody>"; })();
	window.addEventListener("storage", function (e) { if (e.key !== KEY || (document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) return; try { var s = JSON.parse(e.newValue); if (s) { load(); fillOthers(); update(); } } catch (x) {} });
})();
