/* MES Ideal Weight Calculator -- pure maths (no DOM). Browser global `IW`; node: require('./tool_apps_src/ideal-weight-calculator/lib.js'); tests: node tool_apps_src/ideal-weight-calculator-tests.js
 * Height in cm, weight in kg. The classic formulas are written for inches over 5 feet. */
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
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }
	function over(cm) { return cm / IN - 60; }   // inches over 5 feet (negative below)
	var FORMULAS = {
		devine: { name: "Devine (1974)", note: "Written for dosing drugs; still the most quoted.", f: function (s, cm) { return (s === "m" ? 50 : 45.5) + 2.3 * over(cm); } },
		robinson: { name: "Robinson (1983)", note: "A revision of Devine with smaller steps per inch.", f: function (s, cm) { return s === "m" ? 52 + 1.9 * over(cm) : 49 + 1.7 * over(cm); } },
		miller: { name: "Miller (1983)", note: "The lowest of the four for taller people.", f: function (s, cm) { return s === "m" ? 56.2 + 1.41 * over(cm) : 53.1 + 1.36 * over(cm); } },
		hamwi: { name: "Hamwi (1964)", note: "The oldest; the highest of the four.", f: function (s, cm) { return s === "m" ? 48 + 2.7 * over(cm) : 45.4 + 2.2 * over(cm); } }
	};
	var ORDER = ["devine", "robinson", "miller", "hamwi"];
	function valid(s, cm) { return (s === "m" || s === "f") && cm >= 120 && cm <= 230; }
	function value(id, s, cm) { if (!valid(s, cm) || !FORMULAS[id]) return null; var v = FORMULAS[id].f(s, cm); return v > 0 ? v : null; }
	function all(s, cm) { var o = {}; ORDER.forEach(function (id) { o[id] = value(id, s, cm); }); return o; }
	function bmiRange(cm) { var m = cm / 100; return { lo: 18.5 * m * m, hi: 24.9 * m * m }; }
	function mean(s, cm) { var v = ORDER.map(function (id) { return value(id, s, cm); }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }
	function span(s, cm) { var v = ORDER.map(function (id) { return value(id, s, cm); }); return { lo: Math.min.apply(null, v), hi: Math.max.apply(null, v) }; }
	function bmi(kg, cm) { var m = cm / 100; return kg / (m * m); }
	var IW = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, FORMULAS: FORMULAS, ORDER: ORDER, valid: valid, value: value, all: all, bmiRange: bmiRange, mean: mean, span: span, bmi: bmi };
	if (typeof module !== "undefined" && module.exports) module.exports = IW; else root.IW = IW;
})(typeof window !== "undefined" ? window : this);

/* MES Ideal Weight Calculator -- mes.fm/ideal-weight-calculator (UI; maths in lib.js, global IW).
 * Stored in cm / kg; localStorage "mes-ideal-weight-calculator:v1" = { sex, cm, kg }. Links: ?sex=&cm=&kg= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("iw"); if (!root || !window.IW) return;
	var KEY = "mes-ideal-weight-calculator:v1", COL = ["iw-c0", "iw-c1", "iw-c2", "iw-c3"];
	var EXAMPLES = [["Man, 180 cm, 85 kg", { sex: "m", cm: "180", kg: "85" }], ["Woman, 165 cm, 62 kg", { sex: "f", cm: "165", kg: "62" }], ["Woman, 5 ft 4 in", { sex: "f", cm: "162.56", kg: "" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { sex: "", cm: "", kg: "" };
	function clean(s) { return { sex: s.sex === "m" || s.sex === "f" ? s.sex : "", cm: String(s.cm || "").slice(0, 8), kg: String(s.kg || "").slice(0, 8) }; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("cm") && !q.has("sex")) return false; st = clean({ sex: q.get("sex") || st.sex, cm: q.get("cm") || st.cm, kg: q.get("kg") || st.kg }); return true; }
	function toast(msg) { var t = $("iw-toast"); if (!t) { t = document.createElement("div"); t.id = "iw-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }

	function fillOthers(except) {
		var kg = IW.num(st.kg), cm = IW.num(st.cm);
		if (except !== "m") { $("iw-cm").value = cm > 0 ? IW.trim(cm, 1) : ""; $("iw-kg").value = kg > 0 ? IW.trim(kg, 2) : ""; }
		if (except !== "i") { $("iw-lb").value = kg > 0 ? IW.trim(IW.kgToLb(kg), 1) : ""; if (cm > 0) { var f = IW.cmToFtIn(cm); $("iw-ft").value = String(f.ft); $("iw-in").value = IW.trim(f.inch, 1); } else { $("iw-ft").value = ""; $("iw-in").value = ""; } }
	}
	function syncAll() { fillOthers(); [].forEach.call($("iw-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); }); }
	["iw-cm", "iw-kg"].forEach(function (id) { $(id).addEventListener("input", function () { var cm = IW.num($("iw-cm").value), kg = IW.num($("iw-kg").value); st.cm = cm > 0 ? String(cm) : ""; st.kg = kg > 0 ? String(kg) : ""; fillOthers("m"); save(); update(); }); });
	["iw-ft", "iw-in", "iw-lb"].forEach(function (id) { $(id).addEventListener("input", function () { var ft = IW.num($("iw-ft").value), inch = IW.num($("iw-in").value), lb = IW.num($("iw-lb").value); st.cm = (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(IW.ftInToCm(ft, inch) * 100) / 100) : ""; st.kg = lb > 0 ? String(Math.round(IW.lbToKg(lb) * 1000) / 1000) : ""; fillOthers("i"); save(); update(); }); });
	$("iw-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); syncAll(); update(); });
	$("iw-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("iw-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(EXAMPLES[+b.dataset.i][1]); save(); syncAll(); update(); });
	$("iw-ref").innerHTML = "<thead><tr><th>Formula</th><th>Men</th><th>Women</th></tr></thead><tbody>" + [["devine", "50 kg + 2.3 kg", "45.5 kg + 2.3 kg"], ["robinson", "52 kg + 1.9 kg", "49 kg + 1.7 kg"], ["miller", "56.2 kg + 1.41 kg", "53.1 kg + 1.36 kg"], ["hamwi", "48 kg + 2.7 kg", "45.4 kg + 2.2 kg"]].map(function (r) { return "<tr><td>" + IW.FORMULAS[r[0]].name + "</td><td>" + r[1] + " per inch over 5 ft</td><td>" + r[2] + " per inch over 5 ft</td></tr>"; }).join("") + "</tbody>";

	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	function w(kg) { return IW.trim(kg, 1) + " kg (" + IW.trim(IW.kgToLb(kg), 1) + " lb)"; }
	function wl(kg) { return IW.trim(IW.kgToLb(kg), 0) + " lb"; }
	var cur = null;
	function update() {
		var cm = IW.num(st.cm), kg = IW.num(st.kg), ok = IW.valid(st.sex, cm); $("iw-empty").hidden = ok; $("iw-out").hidden = !ok; cur = null; if (!ok) return;
		var A = IW.all(st.sex, cm), sp = IW.span(st.sex, cm), avg = IW.mean(st.sex, cm), R = IW.bmiRange(cm), me = kg > 0 ? kg : null;
		cur = { cm: cm, kg: me, A: A, sp: sp, avg: avg, R: R };
		$("iw-hero").innerHTML = stat("Ideal weight (average of 4)", IW.trim(avg, 1) + " <small>kg</small>", IW.trim(IW.kgToLb(avg), 1) + " lb", "tu-stat--hero") + stat("Range of the formulas", IW.trim(sp.lo, 1) + "&ndash;" + IW.trim(sp.hi, 1) + " <small>kg</small>", wl(sp.lo) + " &ndash; " + wl(sp.hi)) + stat("Healthy BMI range", IW.trim(R.lo, 1) + "&ndash;" + IW.trim(R.hi, 1) + " <small>kg</small>", "BMI 18.5 to 24.9 &middot; " + wl(R.lo) + " &ndash; " + wl(R.hi));
		var v = "For your height the formulas suggest <b>" + w(sp.lo) + " to " + w(sp.hi) + "</b>, averaging about <b>" + w(avg) + "</b>. A healthy BMI band for your height is <b>" + w(R.lo) + " to " + w(R.hi) + "</b>.";
		if (me != null) { var b = IW.bmi(me, cm), d = me - avg; v += "<br>You weigh <b>" + w(me) + "</b> (BMI " + IW.fix(b, 1) + "), " + (me < R.lo ? "<b>below</b> the healthy band." : me > R.hi ? "<b>above</b> the healthy band." : "<b>inside</b> the healthy band.") + (Math.abs(d) >= 0.5 ? " That is " + w(Math.abs(d)) + (d > 0 ? " above" : " below") + " the formula average." : ""); }
		$("iw-verdict").innerHTML = v + '<br><small class="iw-small">Formulas ignore build, age and muscle: use them as a guide, not a target.</small>';
		range(); table(); heightChart();
	}
	function range() {
		var vals = IW.ORDER.map(function (id) { return cur.A[id]; }).concat([cur.R.lo, cur.R.hi]); if (cur.kg) vals.push(cur.kg);
		var lo = Math.floor(Math.min.apply(null, vals) - 4), hi = Math.ceil(Math.max.apply(null, vals) + 4), W = 640, H = 140, L = 16, R = 16, X = function (v) { return L + (v - lo) / (hi - lo) * (W - L - R); };
		var s = '<rect class="iw-band" x="' + X(cur.R.lo) + '" y="30" width="' + (X(cur.R.hi) - X(cur.R.lo)) + '" height="60"/><line class="iw-bandl" x1="' + X(cur.R.lo) + '" x2="' + X(cur.R.lo) + '" y1="26" y2="94"/><line class="iw-bandl" x1="' + X(cur.R.hi) + '" x2="' + X(cur.R.hi) + '" y1="26" y2="94"/>';
		s += '<text class="iw-ct" x="' + ((X(cur.R.lo) + X(cur.R.hi)) / 2) + '" y="20" text-anchor="middle">healthy BMI band</text>';
		var step = hi - lo > 60 ? 10 : 5; for (var g = Math.ceil(lo / step) * step; g <= hi; g += step) s += '<line class="iw-gl" x1="' + X(g) + '" x2="' + X(g) + '" y1="94" y2="100"/><text class="iw-ct" x="' + X(g) + '" y="114" text-anchor="middle">' + g + "</text>";
		s += '<line class="iw-gl" x1="' + L + '" x2="' + (W - R) + '" y1="94" y2="94"/><text class="iw-ct" x="' + (W - R) + '" y="132" text-anchor="end">kg</text>';
		IW.ORDER.forEach(function (id, i) { var x = X(cur.A[id]), y = 50 + (i % 2) * 18; s += '<circle class="iw-mk ' + COL[i] + '" cx="' + x + '" cy="' + y + '" r="8"><title>' + IW.FORMULAS[id].name + ": " + IW.trim(cur.A[id], 1) + " kg</title></circle>"; });
		if (cur.kg) { var xm = X(cur.kg); s += '<line class="iw-me" x1="' + xm + '" x2="' + xm + '" y1="34" y2="94"/><text class="iw-meT" x="' + Math.min(xm, W - 40) + '" y="' + 28 + '" text-anchor="middle">you ' + IW.trim(cur.kg, 1) + "</text>"; }
		$("iw-range").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		$("iw-key").innerHTML = IW.ORDER.map(function (id, i) { return '<span><i class="' + COL[i] + '"></i>' + IW.FORMULAS[id].name.split(" (")[0] + " " + IW.trim(cur.A[id], 1) + " kg</span>"; }).join("");
	}
	function table() {
		var mx = Math.max.apply(null, IW.ORDER.map(function (id) { return cur.A[id]; }));
		$("iw-table").innerHTML = "<thead><tr><th>Formula</th><th>Ideal weight</th><th>In pounds</th><th></th></tr></thead><tbody>" + IW.ORDER.map(function (id, i) { return "<tr><td><b>" + IW.FORMULAS[id].name + "</b><br><span class=\"iw-small\">" + esc(IW.FORMULAS[id].note) + "</span></td><td>" + IW.trim(cur.A[id], 1) + " kg</td><td>" + IW.trim(IW.kgToLb(cur.A[id]), 1) + ' lb</td><td class="iw-barcell"><span class="iw-bar ' + COL[i] + '" style="width:' + (cur.A[id] / mx * 100) + '%"></span></td></tr>'; }).join("") +
			"<tr><td><b>Healthy BMI range</b><br><span class=\"iw-small\">BMI 18.5 to 24.9 at your height</span></td><td>" + IW.trim(cur.R.lo, 1) + "&ndash;" + IW.trim(cur.R.hi, 1) + " kg</td><td>" + IW.trim(IW.kgToLb(cur.R.lo), 1) + "&ndash;" + IW.trim(IW.kgToLb(cur.R.hi), 1) + " lb</td><td></td></tr></tbody>";
	}
	var hc = null;
	function heightChart() {
		var hs = [], W = 640, H = 270, L = 46, R = 16, T = 14, B = 32, x0 = 140, x1 = 210;
		for (var h = x0; h <= x1; h += 2) hs.push(h);
		var all = []; hs.forEach(function (h) { IW.ORDER.forEach(function (id) { all.push(IW.value(id, st.sex, Math.max(120, h))); }); all.push(IW.bmiRange(h).lo, IW.bmiRange(h).hi); });
		var lo = Math.floor(Math.min.apply(null, all) / 5) * 5, hi = Math.ceil(Math.max.apply(null, all) / 5) * 5, X = function (h) { return L + (h - x0) / (x1 - x0) * (W - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
		var s = ""; for (var g = lo; g <= hi; g += 10) s += '<line class="iw-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="iw-ct" x="' + (L - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + "</text>";
		for (var a = 140; a <= 210; a += 10) s += '<text class="iw-ct" x="' + X(a) + '" y="' + (H - 10) + '" text-anchor="middle">' + a + "</text>";
		s += '<text class="iw-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">height (cm)</text><text class="iw-ct" x="6" y="10">kg</text>';
		s += '<polygon class="iw-band" points="' + hs.map(function (h) { return X(h) + "," + Y(IW.bmiRange(h).hi); }).join(" ") + " " + hs.slice().reverse().map(function (h) { return X(h) + "," + Y(IW.bmiRange(h).lo); }).join(" ") + '"/>';
		IW.ORDER.forEach(function (id, i) { s += '<polyline class="iw-line ' + COL[i] + '" style="fill:none" points="' + hs.map(function (h) { return X(h) + "," + Y(IW.value(id, st.sex, h)); }).join(" ") + '"/>'; });
		var xm = X(Math.max(x0, Math.min(x1, cur.cm))); s += '<line class="iw-cross" x1="' + xm + '" x2="' + xm + '" y1="' + T + '" y2="' + (H - B) + '"/>';
		if (cur.kg) s += '<circle class="iw-mk iw-c3" style="fill:#1e2733" cx="' + xm + '" cy="' + Y(cur.kg) + '" r="5"><title>you</title></circle>';
		$("iw-height").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>"; hc = { X: X, W: W, L: L, R: R, x0: x0, x1: x1 };
	}
	function hover(ev) {
		if (!hc || !cur) return; var svg = $("iw-height").querySelector("svg"); if (!svg) return; var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * hc.W, h = Math.round((hc.x0 + (x - hc.L) / (hc.W - hc.L - hc.R) * (hc.x1 - hc.x0))); h = Math.max(hc.x0, Math.min(hc.x1, h));
		var f = IW.cmToFtIn(h), R = IW.bmiRange(h); $("iw-hread").innerHTML = "<b>" + h + " cm</b> (" + f.ft + "' " + IW.trim(f.inch, 0) + '"): ' + IW.ORDER.map(function (id) { return IW.FORMULAS[id].name.split(" (")[0] + " " + IW.trim(IW.value(id, st.sex, h), 1); }).join(", ") + " kg &middot; healthy " + IW.trim(R.lo, 0) + "&ndash;" + IW.trim(R.hi, 0) + " kg";
	}
	$("iw-height").addEventListener("mousemove", hover); $("iw-height").addEventListener("touchmove", function (e) { if (e.touches[0]) hover(e.touches[0]); }, { passive: true });
	$("iw-link").onclick = function () { if (cur) copy(location.origin + "/ideal-weight-calculator?sex=" + st.sex + "&cm=" + IW.trim(cur.cm, 1) + (cur.kg ? "&kg=" + IW.trim(cur.kg, 2) : ""), "Link copied"); };
	$("iw-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
