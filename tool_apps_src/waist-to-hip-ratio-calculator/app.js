/* MES Waist-to-Hip Ratio Calculator -- mes.fm/waist-to-hip-ratio-calculator (UI; maths in lib.js, global WH).
 * Lengths stored in cm; localStorage "mes-waist-to-hip-ratio-calculator:v1" = { sex, u, waist, hip, h }. Links: ?sex=&waist=&hip=&h= (cm) */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("wh"); if (!root || !window.WH) return;
	var KEY = "mes-waist-to-hip-ratio-calculator:v1";
	var EXAMPLES = [["Woman: waist 78, hips 100, 165 cm", { sex: "f", waist: "78", hip: "100", h: "165" }], ["Man: waist 98, hips 100, 178 cm", { sex: "m", waist: "98", hip: "100", h: "178" }], ["Man: waist 84, hips 98, 180 cm", { sex: "m", waist: "84", hip: "98", h: "180" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { sex: "", u: "m", waist: "", hip: "", h: "" };
	function clean(s) { var o = { sex: s.sex === "m" || s.sex === "f" ? s.sex : "", u: s.u === "i" ? "i" : "m" }; ["waist", "hip", "h"].forEach(function (k) { o[k] = String(s[k] == null ? "" : s[k]).slice(0, 8); }); return o; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("waist")) return false; st = clean({ sex: q.get("sex") || st.sex, u: st.u, waist: q.get("waist"), hip: q.get("hip"), h: q.get("h") }); return true; }
	function toast(msg) { var t = $("wh-toast"); if (!t) { t = document.createElement("div"); t.id = "wh-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	var us = function () { return st.u === "i"; };
	function L(cm) { return us() ? WH.cmToIn(cm) : cm; }   // cm -> shown unit
	function Lu() { return us() ? "in" : "cm"; }
	function show() {
		[].forEach.call(root.querySelectorAll(".wh-lu"), function (e) { e.textContent = Lu(); });
		["waist", "hip", "h"].forEach(function (k) { var v = WH.num(st[k]); $("wh-" + k).value = v > 0 ? WH.trim(L(v), 1) : ""; });
		[].forEach.call($("wh-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); }); [].forEach.call($("wh-u").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.u)); });
	}
	["waist", "hip", "h"].forEach(function (k) { $("wh-" + k).addEventListener("input", function () { var v = WH.num(this.value); st[k] = v > 0 ? String(Math.round((us() ? WH.inToCm(v) : v) * 100) / 100) : ""; save(); update(); }); });
	$("wh-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); show(); update(); });
	$("wh-u").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.u = b.dataset.u; save(); show(); update(); });
	$("wh-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("wh-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(Object.assign({ u: st.u }, EXAMPLES[+b.dataset.i][1])); save(); show(); update(); });
	function refTable() {
		function r(l, b, u) { return "<tr><td>" + l + "</td>" + [0, 1, 2].map(function (i) { var lo = i === 0 ? null : b[i - 1][0], hi = b[i][0]; return "<td>" + (i === 0 ? "under " + hi : hi === Infinity ? lo + " or more" : lo + " &ndash; " + (Math.round((hi - 0.01) * 100) / 100)) + "</td>"; }).join("") + "</tr>"; }
		$("wh-ref").innerHTML = "<thead><tr><th>Sex</th><th>Low risk</th><th>Moderate risk</th><th>High risk</th></tr></thead><tbody>" + r("Men", WH.WHR_BANDS.m) + r("Women", WH.WHR_BANDS.f) + "</tbody>";
	}
	refTable();
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	function gauge(title, sub, value, bands, min, max, dp) {
		var prev = min, h = '<div class="wh-g"><div class="wh-gt">' + title + "<span>" + sub + '</span></div><div class="wh-gauge"><div class="wh-bar">';
		bands.forEach(function (b) { var to = Math.min(b[0], max); h += '<span class="wh-band wh-band--' + b[2] + '" style="width:' + ((to - prev) / (max - min) * 100) + '%"></span>'; prev = to; });
		h += '</div><div class="wh-pin" style="left:' + Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) + '%"><span>' + WH.fix(value, dp) + '</span></div><div class="wh-ticks">';
		bands.slice(0, -1).forEach(function (b) { h += '<span style="left:' + ((b[0] - min) / (max - min) * 100) + '%">' + b[0] + "</span>"; }); return h + "</div></div></div>";
	}
	function update() {
		var waist = WH.num(st.waist), hip = WH.num(st.hip), h = WH.num(st.h), ok = (st.sex === "m" || st.sex === "f") && waist >= 40 && waist <= 250 && hip >= 50 && hip <= 250;
		$("wh-empty").hidden = ok; $("wh-out").hidden = !ok; cur = null; if (!ok) return; cur = { waist: waist, hip: hip, h: h > 100 ? h : null };
		var r = WH.whr(waist, hip), B = WH.whrBand(st.sex, r), WB = WH.waistBand(st.sex, waist), t = cur.h ? WH.whtr(waist, cur.h) : null, TB = t != null ? WH.whtrBand(t) : null, sh = WH.shape(st.sex, r);
		$("wh-hero").innerHTML = stat("Waist-to-hip ratio", WH.fix(r, 2), esc(B.name), "tu-stat--hero") + stat("Waist size", WH.trim(L(waist), 1) + " <small>" + Lu() + "</small>", esc(WB.name)) + (t != null ? stat("Waist-to-height", WH.fix(t, 2), esc(TB.name)) : stat("Waist-to-height", "&ndash;", "add your height")) + stat("Body shape", sh === "apple" ? "Apple" : "Pear", sh === "apple" ? "weight mostly around the middle" : "weight mostly on the hips and thighs");
		var worst = [B.key, WB.key, TB ? TB.key : "low"].reduce(function (a, k) { return ["low", "under", "mid", "high"].indexOf(k) > ["low", "under", "mid", "high"].indexOf(a) ? k : a; }, "low"); if (worst === "under") worst = "low";
		var v = "Your waist-to-hip ratio is <b>" + WH.fix(r, 2) + "</b>: <b>" + B.name.toLowerCase() + "</b> for " + (st.sex === "m" ? "men" : "women") + ". Your waist is <b>" + WH.trim(L(waist), 1) + " " + Lu() + "</b> (" + WB.name.toLowerCase() + ")" + (t != null ? " and your waist-to-height ratio is <b>" + WH.fix(t, 2) + "</b> (" + TB.name.toLowerCase() + ")." : ".");
		if (t != null && t >= 0.5) v += " To get under 0.5 your waist would be about <b>" + WH.trim(L(WH.waistFor(0.499, cur.h)), 1) + " " + Lu() + "</b>, i.e. " + WH.trim(L(waist - WH.waistFor(0.499, cur.h)), 1) + " " + Lu() + " smaller.";
		$("wh-verdict").className = "tu-card wh-verdict is-" + worst; $("wh-verdict").innerHTML = v + '<br><small class="wh-small">A risk indicator for adults, not a diagnosis. Talk to a doctor about your results if you are concerned.</small>';
		var g = gauge("Waist-to-hip ratio", st.sex === "m" ? "men: 0.90 / 1.00" : "women: 0.80 / 0.85", r, WH.WHR_BANDS[st.sex], 0.6, 1.2, 2) + gauge("Waist circumference", (st.sex === "m" ? "men: 94 / 102 cm" : "women: 80 / 88 cm") + " (" + (us() ? "gauge in cm" : "cm") + ")", waist, WH.WAIST_BANDS[st.sex], st.sex === "m" ? 60 : 55, st.sex === "m" ? 140 : 130, 0);
		if (t != null) g += gauge("Waist-to-height ratio", "healthy under 0.5", t, WH.WHTR_BANDS, 0.3, 0.7, 2); $("wh-gauges").innerHTML = g;
		var sl = $("wh-slide"); sl.min = Math.round(waist * 0.7); sl.max = Math.round(waist * 1.25); sl.step = 0.5; if (sl._for !== waist) { sl.value = waist; sl._for = waist; } what(); 
	}
	function what() {
		if (!cur) return; var w = +$("wh-slide").value, r = WH.whr(w, cur.hip), B = WH.whrBand(st.sex, r), t = cur.h ? WH.whtr(w, cur.h) : null, d = w - cur.waist;
		$("wh-slideo").textContent = WH.trim(L(w), 1) + " " + Lu() + (Math.abs(d) > 0.1 ? " (" + (d > 0 ? "+" : "−") + WH.trim(Math.abs(L(d)), 1) + ")" : "");
		$("wh-what").innerHTML = "With a waist of <b>" + WH.trim(L(w), 1) + " " + Lu() + "</b> your waist-to-hip ratio would be <b>" + WH.fix(r, 2) + "</b> (" + B.name.toLowerCase() + ")" + (t != null ? " and waist-to-height <b>" + WH.fix(t, 2) + "</b> (" + WH.whtrBand(t).name.toLowerCase() + ")" : "") + ".";
		var Wd = 640, H = 200, Lm = 44, R = 12, T = 12, Bm = 30, w0 = Math.round(cur.waist * 0.7), w1 = Math.round(cur.waist * 1.25), y0 = 0.6, y1 = 1.2, X = function (v) { return Lm + (v - w0) / (w1 - w0) * (Wd - Lm - R); }, Y = function (v) { return T + (y1 - v) / (y1 - y0) * (H - T - Bm); }, s = "", bs = WH.WHR_BANDS[st.sex], prev = y0;
		bs.forEach(function (b) { var to = Math.min(b[0], y1); s += '<rect class="wh-bd--' + b[2] + '" x="' + Lm + '" y="' + Y(to) + '" width="' + (Wd - Lm - R) + '" height="' + (Y(prev) - Y(to)) + '"/>'; prev = to; });
		for (var g = 0.6; g <= 1.21; g += 0.2) s += '<line class="wh-gl" x1="' + Lm + '" x2="' + (Wd - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="wh-ct" x="' + (Lm - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g.toFixed(1) + "</text>";
		var step = (w1 - w0) > 60 ? 10 : 5; for (var a = Math.ceil(w0 / step) * step; a <= w1; a += step) s += '<text class="wh-ct" x="' + X(a) + '" y="' + (H - 10) + '" text-anchor="middle">' + Math.round(L(a)) + "</text>";
		s += '<polyline class="wh-line" points="' + [w0, w1].map(function (v) { return X(v) + "," + Y(v / cur.hip); }).join(" ") + '"/><circle class="wh-dot" cx="' + X(cur.waist) + '" cy="' + Y(cur.waist / cur.hip) + '" r="5"><title>now</title></circle><circle class="wh-dot" style="fill:#1e2733" cx="' + X(w) + '" cy="' + Y(r) + '" r="6"/><text class="wh-ct" x="' + (Wd - R) + '" y="' + (H - 1) + '" text-anchor="end">waist (' + Lu() + ') &rarr; ratio</text>';
		$("wh-chart").innerHTML = '<svg viewBox="0 0 ' + Wd + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	$("wh-slide").addEventListener("input", what);
	$("wh-link").onclick = function () { if (cur) copy(location.origin + "/waist-to-hip-ratio-calculator?sex=" + st.sex + "&waist=" + WH.trim(cur.waist, 1) + "&hip=" + WH.trim(cur.hip, 1) + (cur.h ? "&h=" + WH.trim(cur.h, 1) : ""), "Link copied"); };
	$("wh-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	show(); update();
})();
