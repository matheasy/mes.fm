/* MES BMI Calculator 2.0 -- mes.fm/bmicalculator (UI; maths + share encoding in lib.js, global BM).
 * Weight / height are kept in kg / cm; localStorage "mes-bmicalculator:v1" = { kg, cm, units, scale, history }.
 * Strings: i18n.js (global BM_I18N), one entry per language; translated pages (data-lang != "en") also keep { units, scale, options } in "mes-bmicalculator:v1:<lang>".
 * Links: ?kg=&cm= (or ?lb=&ft=&in=) for one result, ?s=<encoded> with the history; old /bmicalculator/s/<id> links resolve via /api/share?calc=bmi.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bm");
	if (!root || !window.BM) return;
	var KEY = "mes-bmicalculator:v1", memOnly = false;
	/* ---------- language (i18n.js, global BM_I18N): the page's <div id="bm" data-lang=".."> picks the strings, number format and defaults ---------- */
	var I = window.BM_I18N, LANG = root.getAttribute("data-lang") || "en", EN = I.table.en, T = I.table[LANG] || EN, LOC = T.locale, EN_PAGE = LANG === "en";
	var PKEY = KEY + ":" + LANG;      // translated pages keep their own units / scale / options choice; the measurements (KEY) are shared with every language
	var HAS_INDIA = !!t("scaleIndia");     // the India (2009 guideline) scale is offered on the English and Hindi pages only
	function okScale(s) { return s === "asia" || (s === "india" && HAS_INDIA) ? s : s === "who" ? "who" : null; }
	var PATH = T.path, RTL = T.dir === "rtl", COMMA = T.dec === ",", PL = window.Intl && Intl.PluralRules ? new Intl.PluralRules(LOC) : null;
	function t(k, v) { var s = T[k] != null ? T[k] : EN[k]; return v ? String(s).replace(/\{(\w+)\}/g, function (m, x) { return v[x] != null ? v[x] : m; }) : s; }
	function plural(k, n) { var o = T[k] || EN[k], f = PL ? PL.select(n) : (n === 1 ? "one" : "other"); return (o[f] || o.other).replace("{n}", n); }
	function nf(n, lo, hi) { return new Intl.NumberFormat(LOC, { minimumFractionDigits: lo, maximumFractionDigits: hi, useGrouping: false }).format(n); }
	function fx(n, d) { return EN_PAGE ? BM.fix(n, d) : (n == null || !isFinite(n) ? "" : nf(Math.round(n * Math.pow(10, d)) / Math.pow(10, d), d, d)); }   // fixed decimals
	function tr(n, d) { return EN_PAGE ? BM.trim(n, d) : (n == null || !isFinite(n) ? "" : nf(Math.round(n * Math.pow(10, d)) / Math.pow(10, d), 0, d)); }   // up to d decimals
	function pn(v) { return EN_PAGE ? BM.num(v) : BM.numLoc(v, COMMA); }      // typed numbers: "68,5" and "68.5" both work on a decimal-comma page
	function dt(d) { if (EN_PAGE) return d; var x = new Date(d + "T00:00:00"); return isNaN(x) ? d : x.toLocaleDateString(LOC); }
	function catName(c) { return (T.cats && T.cats[c]) || c; }
	function lowerFirst(s) { return s.charAt(0).toLocaleLowerCase(LOC) + s.slice(1); }
	var EXAMPLES = (T.examples || EN.examples).map(function (x) { return [x[0], { kg: x[1], cm: x[2] }]; });
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { kg: "", cm: "", units: T.defUnits || "b", scale: T.defScale || "who", oh: false, history: [] };
	if (!EN_PAGE) st.imp = !!T.defImp;     // (kept out of the English page's saved object)
	function load() {
		if (!EN_PAGE) return loadShared();
		try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { st.kg = String(s.kg || ""); st.cm = String(s.cm || ""); st.units = s.ru === "m" || s.ru === "i" ? s.ru : "b"; st.scale = okScale(s.scale) || "who"; st.oh = s.oh === true; st.history = (Array.isArray(s.history) ? s.history : []).map(BM.cleanEntry).filter(Boolean); } } catch (e) { memOnly = true; }
	}
	// translated pages: weight, height and the measurements live in the English page's object (so every language shares them); units / scale / options in PKEY
	function loadShared() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { st.kg = String(s.kg || ""); st.cm = String(s.cm || ""); st.history = (Array.isArray(s.history) ? s.history : []).map(BM.cleanEntry).filter(Boolean); }
			var p = JSON.parse(localStorage.getItem(PKEY) || "null"); if (p) { st.units = p.ru === "b" || p.ru === "i" || p.ru === "m" ? p.ru : st.units; st.scale = okScale(p.scale) || st.scale; st.oh = p.oh === true; st.imp = p.imp === true; }
		} catch (e) { memOnly = true; }
	}
	function save() {
		try {
			if (EN_PAGE) localStorage.setItem(KEY, JSON.stringify(Object.assign({ ru: st.units }, st)));
			else {
				var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (x) { s = {}; }
				s.kg = st.kg; s.cm = st.cm; s.history = st.history; localStorage.setItem(KEY, JSON.stringify(s));
				localStorage.setItem(PKEY, JSON.stringify({ ru: st.units, scale: st.scale, oh: st.oh, imp: st.imp }));
			}
			memOnly = false;
		} catch (e) { memOnly = true; }
		$("bm-store-note").textContent = memOnly ? t("storeBlocked") : plural("saved", st.history.length);
	}
	function toast(msg) {
		var t = $("bm-toast"); if (!t) { t = document.createElement("div"); t.id = "bm-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function flash(btn) {
		if (!btn) return; if (btn._o == null) btn._o = btn.textContent; btn.textContent = t("copiedBtn"); btn.classList.add("bm-copied");
		clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = btn._o; btn._o = null; btn.classList.remove("bm-copied"); }, 1600);
	}
	function copy(text, msg, btn) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); flash(btn); } catch (e) { toast(t("copyFailed")); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); flash(btn); }, fb); else fb();
	}
	function notice(h) { var n = $("bm-notice"); n.innerHTML = h || ""; n.hidden = !h; }

	/* ---------- inputs: kg / cm are the truth, the other unit system mirrors them ---------- */
	function fillOthers(except) {
		var kg = BM.num(st.kg), cm = BM.num(st.cm);
		if (except !== "m") { $("bm-kg").value = kg > 0 ? tr(kg, 2) : ""; $("bm-cm").value = cm > 0 ? tr(cm, 1) : ""; }
		if (except !== "i") {
			$("bm-lb").value = kg > 0 ? tr(BM.kgToLb(kg), 1) : "";
			if (cm > 0) { var f = BM.cmToFtIn(cm); $("bm-ft").value = String(f.ft); $("bm-in").value = tr(f.inch, 1); } else { $("bm-ft").value = ""; $("bm-in").value = ""; }
		}
	}
	function fromMetric() { var kg = pn($("bm-kg").value), cm = pn($("bm-cm").value); st.kg = kg > 0 ? String(kg) : ""; st.cm = cm > 0 ? String(cm) : ""; fillOthers("m"); }
	function fromImperial() {
		var lb = pn($("bm-lb").value), ft = pn($("bm-ft").value), inch = pn($("bm-in").value);
		st.kg = lb > 0 ? String(Math.round(BM.lbToKg(lb) * 1000) / 1000) : "";
		st.cm = (ft > 0 || inch > 0) && (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(BM.ftInToCm(ft, inch) * 100) / 100) : "";
		fillOthers("i");
	}
	["bm-kg", "bm-cm"].forEach(function (id) { $(id).addEventListener("input", function () { fromMetric(); save(); update(); }); });
	["bm-lb", "bm-ft", "bm-in"].forEach(function (id) { $(id).addEventListener("input", function () { fromImperial(); save(); update(); }); });
	$("bm-units").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.units = b.dataset.u; save(); showUnits(); showOpts(); update(); });
	$("bm-scale").addEventListener("change", function () { st.scale = this.value; save(); showOpts(); update(); });
	function showOpts() {
		var h = st.oh, sum = $("bm-optsum");
		$("bm-opts").hidden = h; sum.hidden = !h;
		sum.textContent = t("sumResults", { u: t(st.units === "i" ? "unitsUS" : st.units === "m" ? "unitsMetric" : "unitsBoth"), s: t(st.scale === "asia" ? "scaleShortAsia" : st.scale === "india" ? "scaleShortIndia" : "scaleShortWho") });
		$("bm-opttoggle").textContent = h ? t("options") : t("hideOptions"); $("bm-opttoggle").setAttribute("aria-expanded", String(!h));
	}
	$("bm-opttoggle").addEventListener("click", function () { st.oh = !st.oh; save(); showOpts(); });
	// pounds / feet / inches: always shown on the English page, behind a toggle on the translated (kg / cm) pages
	function showImp() {
		if (EN_PAGE) return;
		var b = $("bm-imptoggle"); b.hidden = false; $("bm-imperial").hidden = !st.imp;
		b.textContent = st.imp ? t("impHide") : t("impShow"); b.setAttribute("aria-expanded", String(st.imp));
	}
	$("bm-imptoggle").addEventListener("click", function () { st.imp = !st.imp; save(); showImp(); });
	function showUnits() {
		[].forEach.call($("bm-units").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.units)); });
	}

	$("bm-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("bm-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EXAMPLES[+b.dataset.i][1]; st.kg = x.kg; st.cm = x.cm; fillOthers(); save(); update(); });

	/* ---------- result ---------- */
	function wt(kg) { var lb = tr(BM.kgToLb(kg), 1) + " lb", k = tr(kg, 1) + " kg", w = st.units === "i" ? lb : st.units === "m" ? k : lb + " (" + k + ")"; return RTL ? "\u2066" + w + "\u2069" : w; }   // RTL pages: isolate "53.5 kg" so the bidi algorithm keeps number and unit together
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	var GAUGE = { min: 14, max: 42 };
	var BANDS = { who: [18.5, 25, 30], asia: [18.5, 23, 27.5], india: [18, 23, 25] };      // where under / normal / over / obese start, per scale
	function bandColors(scale) { var c = BANDS[scale] || BANDS.who; return [[c[0], "under"], [c[1], "normal"], [c[2], "over"], [GAUGE.max, "obese"]]; }
	function update() {
		var kg = BM.num(st.kg), cm = BM.num(st.cm), b = BM.bmi(kg, cm);
		cur = b == null ? null : { kg: kg, cm: cm, bmi: b };
		$("bm-empty").hidden = b != null; $("bm-out").hidden = b == null;
		renderHistory();
		if (b == null) return;
		var S = st.scale, cat = BM.category(b, S), R = BM.healthyRange(cm, S), N = BM.toNormal(kg, cm, S), r1 = Math.round(b * 10) / 10;
		var cls = cat.group === "normal" ? "tu-stat--hero" : "";
		var cn = catName(cat.name);
		$("bm-hero").innerHTML = stat(t("yourBmi"), fx(b, 1), esc(cn), cls || "tu-stat--hero") +
			stat(t("healthyWeight"), wt(R.lo) + " &ndash; " + wt(R.hi), t("bmiRange", { lo: tr(R.loBmi, 1), hi: tr(R.hiBmi, 1) })) +
			stat(t("bmiPrime"), fx(BM.prime(b, S), 2), t("primeSub", { hi: tr(BM.SCALES[S].hi, 1) })) +
			stat(t("ponderal"), fx(BM.ponderal(kg, cm), 1), t("ponderalSub"));
		var v, vv = { cat: esc(cn), catl: esc(lowerFirst(cn)), min: wt(N.min), max: wt(N.max), lo: wt(R.lo), hi: wt(R.hi) };
		v = t(N.dir === "none" ? "verdictNormal" : N.dir === "gain" ? "verdictGain" : "verdictLose", vv);
		$("bm-verdict").innerHTML = v + '<br><small class="bm-small">' + t("verdictSmall") + "</small>";
		$("bm-verdict").className = "tu-card bm-verdict is-" + cat.group;
		// gauge
		var bands = bandColors(S), prev = GAUGE.min, h = '<div class="bm-bar">';
		bands.forEach(function (x) { h += '<span class="bm-band bm-band--' + x[1] + '" style="width:' + ((x[0] - prev) / (GAUGE.max - GAUGE.min) * 100) + '%"></span>'; prev = x[0]; });
		var pos = Math.max(0, Math.min(100, (b - GAUGE.min) / (GAUGE.max - GAUGE.min) * 100));
		h += '</div><div class="bm-pin" style="left:' + pos + '%"><span>' + fx(b, 1) + '</span></div><div class="bm-ticks">';
		bands.slice(0, -1).forEach(function (x) { h += '<span style="left:' + ((x[0] - GAUGE.min) / (GAUGE.max - GAUGE.min) * 100) + '%">' + tr(x[0], 1) + "</span>"; });
		$("bm-gauge").innerHTML = h + "</div>";
		var cats = BM.SCALES[S].cuts, lo = 0, items = "";
		cats.forEach(function (c, i) { var from = i === 0 ? null : cats[i - 1][0], to = c[0]; items += '<li class="bm-cat bm-cat--' + c[2] + (i === cat.index ? " is-on" : "") + '"><span>' + esc(catName(c[1])) + "</span><span>" + (from == null ? "&lt; " + tr(to, 1) : to === Infinity ? "&ge; " + tr(from, 1) : tr(from, 1) + " &ndash; " + tr(Math.round((to - 0.1) * 10) / 10, 1)) + "</span></li>"; });
		$("bm-cats").innerHTML = items;
	}

	/* ---------- history ---------- */
	function today() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
	$("bm-save").onclick = function () { $("bm-hist-card").hidden = false; $("bm-addrow").hidden = false; $("bm-date").value = today(); $("bm-note").value = ""; $("bm-hist-card").scrollIntoView({ behavior: "smooth", block: "center" }); $("bm-note").focus(); };
	$("bm-addcancel").onclick = function () { $("bm-addrow").hidden = true; renderHistory(); };
	$("bm-add").onclick = function () {
		if (!cur) { toast(t("enterFirst")); return; }
		var e = BM.cleanEntry({ d: $("bm-date").value, kg: cur.kg, cm: cur.cm, n: $("bm-note").value });
		if (!e) { toast(t("pickDate")); return; }
		st.history = st.history.filter(function (x) { return !(x.d === e.d && x.n === e.n); }); st.history.push(e); st.history = BM.sortEntries(st.history);
		$("bm-addrow").hidden = true; save(); renderHistory(); toast(t("savedOn", { d: dt(e.d) }));
	};
	function renderHistory() {
		var card = $("bm-hist-card"), list = BM.sortEntries(st.history);
		card.hidden = !list.length && $("bm-addrow").hidden; if (card.hidden) return;
		var rows = list.slice().reverse().map(function (e, i) {
			var b = BM.bmi(e.kg, e.cm), c = BM.category(b, st.scale);
			return '<tr><td>' + esc(dt(e.d)) + "</td><td>" + wt(e.kg) + "</td><td>" + fx(b, 1) + "</td><td>" + esc(catName(c.name)) + "</td><td>" + esc(e.n) + '</td><td><button type="button" class="bm-del" data-d="' + esc(e.d) + '" data-n="' + esc(e.n) + '" aria-label="' + esc(t("deleteAria", { d: dt(e.d) })) + '">✕</button></td></tr>';
		}).join("");
		$("bm-table").innerHTML = list.length ? "<thead><tr><th>" + t("thDate") + "</th><th>" + t("thWeight") + "</th><th>" + t("thBmi") + "</th><th>" + t("thCategory") + "</th><th>" + t("thNote") + "</th><th></th></tr></thead><tbody>" + rows + "</tbody>" : "";
		$("bm-chart").innerHTML = list.length > 1 ? chart(list) : (list.length ? '<p class="tu-note">' + t("chartMore") + "</p>" : "");
		$("bm-csv").disabled = $("bm-link-all").disabled = !list.length;
	}
	$("bm-table").addEventListener("click", function (e) {
		var b = e.target.closest(".bm-del"); if (!b) return;
		var snap = st.history.slice(); st.history = st.history.filter(function (x) { return !(x.d === b.dataset.d && (x.n || "") === b.dataset.n); }); save(); renderHistory();
		notice(t("entryDeleted") + ' <button type="button" class="tu-chip" id="bm-undo">' + t("undo") + "</button>"); $("bm-undo").onclick = function () { st.history = snap; save(); renderHistory(); notice(""); };
	});
	function chart(list) {
		var W = 640, H = 240, L = 40, R = 14, T = 12, B = 30, bm = list.map(function (e) { return BM.bmi(e.kg, e.cm); });
		var lo = Math.min(15, Math.floor(Math.min.apply(null, bm)) - 1), hi = Math.max(32, Math.ceil(Math.max.apply(null, bm)) + 1);
		var t0 = Date.parse(list[0].d), t1 = Date.parse(list[list.length - 1].d) || t0 + 1; if (t1 === t0) t1 = t0 + 864e5;
		var X = function (d) { return L + (Date.parse(d) - t0) / (t1 - t0) * (W - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
		var cuts = BANDS[st.scale] || BANDS.who, cls = ["under", "normal", "over", "obese"], edges = [lo].concat(cuts.filter(function (c) { return c > lo && c < hi; }), [hi]), s = "";
		var allCuts = [lo].concat(cuts, [hi]);
		for (var i = 0; i < 4; i++) { var a = Math.max(lo, allCuts[i]), z = Math.min(hi, allCuts[i + 1]); if (z > a) s += '<rect class="bm-cb bm-cb--' + cls[i] + '" x="' + L + '" y="' + Y(z) + '" width="' + (W - L - R) + '" height="' + (Y(a) - Y(z)) + '"/>'; }
		for (var g = Math.ceil(lo / 5) * 5; g <= hi; g += 5) s += '<text class="bm-ct" x="' + (L - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + '</text><line class="bm-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/>';
		var pts = list.map(function (e, i) { return X(e.d) + "," + Y(bm[i]); });
		s += '<polyline class="bm-line" points="' + pts.join(" ") + '"/>';
		list.forEach(function (e, i) { s += '<circle class="bm-dot" cx="' + X(e.d) + '" cy="' + Y(bm[i]) + '" r="4"><title>' + esc(t("dotTitle", { d: dt(e.d), b: fx(bm[i], 1), w: wt(e.kg) })) + '</title></circle>'; });
		s += '<text class="bm-ct" x="' + L + '" y="' + (H - 8) + '">' + esc(dt(list[0].d)) + '</text><text class="bm-ct" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(dt(list[list.length - 1].d)) + "</text>";
		return '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	$("bm-csv").onclick = function () { var l = [t("csvHeader")]; BM.sortEntries(st.history).forEach(function (e) { l.push([e.d, tr(e.kg, 2), tr(e.cm, 1), fx(BM.bmi(e.kg, e.cm), 1), e.n].join("\t")); }); copy(l.join("\n"), t("csvCopied")); };

	/* ---------- links ---------- */
	function shareUrl(withHistory) { return location.origin + PATH + "?" + (withHistory ? "s=" + BM.encode(st) : "kg=" + encodeURIComponent(BM.trim(BM.num(st.kg), 2)) + "&cm=" + encodeURIComponent(BM.trim(BM.num(st.cm), 1)) + (st.scale !== "who" ? "&scale=" + st.scale : "")); }
	$("bm-link").onclick = function () { copy(shareUrl(false), t("linkCopied"), this); };
	$("bm-link-top").onclick = function () { copy(shareUrl(false), t("linkCopied"), this); };
	$("bm-link-all").onclick = function () { copy(shareUrl(true), t("linkCopiedAll"), this); };
	document.querySelector("#bm .bm-print").onclick = function () { window.print(); };

	function loadOld(id) {
		notice(t("loadingOld"));
		var f = window.fetch ? window.fetch("/api/share?calc=bmi&id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }) : Promise.reject(new Error("no fetch"));
		return f.then(function (d) { var o = BM.fromOldShare(d); if (!o) throw new Error("bad"); st.kg = o.kg; st.cm = o.cm; fillOthers(); save(); update(); notice(""); history.replaceState(null, "", "/bmicalculator"); toast(t("sharedLoaded")); })
			.catch(function () { notice(t("oldFailed")); });
	}

	/* ---------- init ---------- */
	load();
	var q = new URLSearchParams(location.search), m = location.pathname.match(/^\/bmicalculator\/s\/([A-Za-z0-9]+)\/?$/);
	if (q.get("s")) { var d = BM.decode(q.get("s")); if (d) { st.kg = d.kg; st.cm = d.cm; st.scale = okScale(d.scale) || "who"; var have = {}; st.history.forEach(function (e) { have[e.d + "|" + e.n + "|" + e.kg] = 1; }); d.history.forEach(function (e) { if (!have[e.d + "|" + e.n + "|" + e.kg]) st.history.push(e); }); st.history = BM.sortEntries(st.history); notice(t("openedShared")); } else notice(t("linkUnreadable")); history.replaceState(null, "", location.pathname); }
	else if (q.get("kg") || q.get("cm") || q.get("lb") || q.get("ft") || q.get("in")) {
		if (q.get("kg") || q.get("cm")) { st.kg = String(BM.num(q.get("kg")) || ""); st.cm = String(BM.num(q.get("cm")) || ""); }
		else { var lb = BM.num(q.get("lb")), ft = BM.num(q.get("ft")), inch = BM.num(q.get("in")); st.kg = lb > 0 ? String(Math.round(BM.lbToKg(lb) * 1000) / 1000) : ""; st.cm = ((ft || 0) * 12 + (inch || 0)) > 0 ? String(Math.round(BM.ftInToCm(ft, inch) * 100) / 100) : ""; }
		if (okScale(q.get("scale"))) st.scale = okScale(q.get("scale")); history.replaceState(null, "", location.pathname);
	}
	$("bm-scale").value = st.scale; showUnits(); showOpts(); showImp(); fillOthers(); save(); update();
	if (m && !q.get("s")) loadOld(m[1]);
	// the reference table
	(function () { var ref = $("bm-ref"); if (!ref) return;
		var rg = function (a, b) { return tr(a, 1) + " &ndash; " + tr(b, 1); }, ov = function (n) { return t("refAndOver", { n: tr(n, 1) }); };
		var h = "<thead><tr><th>" + t("refCategory") + "</th><th>" + t("refWho") + "</th><th>" + t("refAsian") + "</th></tr></thead><tbody>"; [["Severe thinness", "&lt; 16", "&lt; 16"], ["Moderate thinness", rg(16, 16.9), rg(16, 16.9)], ["Mild thinness", rg(17, 18.4), rg(17, 18.4)], ["Normal weight", rg(18.5, 24.9), rg(18.5, 22.9)], ["Overweight", rg(25, 29.9), rg(23, 27.4)], ["Obese", ov(30), ov(27.5)]].forEach(function (r) { h += "<tr><td>" + esc(catName(r[0])) + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }); ref.innerHTML = h + "</tbody>"; var nt = document.createElement("p"); nt.className = "tu-note"; nt.textContent = t("refClasses"); ref.parentNode.insertAdjacentElement("afterend", nt);
		if (HAS_INDIA) {      // the India guideline has its own bands (one underweight band, obese from 25), so it gets its own small table
			var w = document.createElement("div"), ih = "<caption>" + t("refIndia") + "</caption><thead><tr><th>" + t("refCategory") + "</th><th>BMI</th></tr></thead><tbody>";
			[["Underweight", "&lt; " + tr(18, 1)], ["Normal weight", rg(18, 22.9)], ["Overweight", rg(23, 24.9)], ["Obese", ov(25)]].forEach(function (r) { ih += "<tr><td>" + esc(catName(r[0])) + "</td><td>" + r[1] + "</td></tr>"; });
			w.className = "tu-table-wrap"; w.innerHTML = '<table class="tu-table bm-ref-india" id="bm-ref-india">' + ih + "</tbody></table>"; nt.insertAdjacentElement("afterend", w);
		}
	})();
	window.addEventListener("storage", function (e) { if ((e.key !== KEY && e.key !== PKEY) || (document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) return; try { var s = JSON.parse(e.newValue); if (s) { load(); $("bm-scale").value = st.scale; showUnits(); showOpts(); showImp(); fillOthers(); update(); } } catch (x) {} });
})();
