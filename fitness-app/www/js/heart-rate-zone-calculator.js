/* MES Heart Rate Zone Calculator -- pure maths (no DOM). Browser global `HR`; node: require('./tool_apps_src/heart-rate-zone-calculator/lib.js'); tests: node tool_apps_src/heart-rate-zone-calculator-tests.js */
(function (root) {
	"use strict";
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	/* ---------- maximum heart rate estimates (beats per minute) ---------- */
	var METHODS = {
		tanaka: { name: "Tanaka (2001)", f: function (a) { return 208 - 0.7 * a; }, note: "208 - 0.7 x age. From a review of 351 studies; the usual best choice for adults." },
		fox: { name: "Fox (220 - age)", f: function (a) { return 220 - a; }, note: "The old rule of thumb. Simple, but too low for older adults and too high for the young." },
		gellish: { name: "Gellish (2007)", f: function (a) { return 207 - 0.7 * a; }, note: "207 - 0.7 x age, from a large group of fit adults." },
		hunt: { name: "HUNT (2013)", f: function (a) { return 211 - 0.64 * a; }, note: "211 - 0.64 x age, from 3,320 healthy Norwegians." },
		inbar: { name: "Inbar (1994)", f: function (a) { return 205.8 - 0.685 * a; }, note: "205.8 - 0.685 x age, from treadmill tests of 1,424 people." }
	};
	var ORDER = ["tanaka", "fox", "gellish", "hunt", "inbar"];
	function validAge(a) { return a >= 10 && a <= 100; }
	function maxHr(id, age) { if (!validAge(age) || !METHODS[id]) return null; return METHODS[id].f(age); }
	/* ---------- zones ---------- */
	var ZONES = [
		{ n: 1, name: "Recovery", lo: 0.50, hi: 0.60, rpe: "1-2 of 10", talk: "Chat easily, even sing", use: "Warm-up, cool-down, active recovery. Builds the habit with little stress.", mins: "Any length" },
		{ n: 2, name: "Endurance (fat burning)", lo: 0.60, hi: 0.70, rpe: "3-4 of 10", talk: "Full sentences, comfortable", use: "The base of aerobic fitness. Most of your training time, long steady sessions.", mins: "30 min to several hours" },
		{ n: 3, name: "Aerobic (tempo)", lo: 0.70, hi: 0.80, rpe: "5-6 of 10", talk: "Short sentences", use: "Improves aerobic power and efficiency. Brisk, steady effort.", mins: "20-60 min" },
		{ n: 4, name: "Threshold", lo: 0.80, hi: 0.90, rpe: "7-8 of 10", talk: "A few words at a time", use: "Raises the pace you can hold for a long time. Hard but controlled.", mins: "10-30 min total, in blocks" },
		{ n: 5, name: "Maximum (VO2 max)", lo: 0.90, hi: 1.00, rpe: "9-10 of 10", talk: "Cannot talk", use: "Short, very hard intervals. Builds top-end speed and power.", mins: "30 sec to 4 min, with rests" }
	];
	// bpm range of a zone: percent of max, or Karvonen (heart-rate reserve) when a resting rate is given
	function zoneBpm(z, max, rest) {
		if (rest != null && rest > 0 && rest < max) return { lo: rest + z.lo * (max - rest), hi: rest + z.hi * (max - rest) };
		return { lo: z.lo * max, hi: z.hi * max };
	}
	function zones(max, rest) { return ZONES.map(function (z) { var b = zoneBpm(z, max, rest); return { n: z.n, name: z.name, lo: z.lo, hi: z.hi, rpe: z.rpe, talk: z.talk, use: z.use, mins: z.mins, bpmLo: Math.round(b.lo), bpmHi: Math.round(b.hi) }; }); }
	// zone number for a heart rate (0 = under zone 1, 6 = above max)
	function zoneOf(bpm, max, rest) {
		var z = zones(max, rest); if (bpm > z[4].bpmHi) return 6; for (var i = 4; i >= 0; i--) if (bpm >= z[i].bpmLo) return z[i].n; return 0;
	}
	function percentOfMax(bpm, max) { return bpm / max * 100; }
	function percentOfReserve(bpm, max, rest) { return rest != null && max > rest ? (bpm - rest) / (max - rest) * 100 : null; }
	// beats counted in a short window -> beats per minute
	function fromCount(beats, seconds) { return beats > 0 && seconds > 0 ? beats * 60 / seconds : null; }
	// resting heart rate bands (adults)
	function restingBand(r) { return r < 40 ? "very low (athletes, or see a doctor if you feel unwell)" : r < 60 ? "low: typical of fit people" : r <= 80 ? "normal" : r <= 100 ? "high-normal" : "high (above 100 at rest: ask a doctor)"; }
	var HR = { num: num, fix: fix, trim: trim, METHODS: METHODS, ORDER: ORDER, maxHr: maxHr, validAge: validAge, ZONES: ZONES, zones: zones, zoneOf: zoneOf, percentOfMax: percentOfMax, percentOfReserve: percentOfReserve, fromCount: fromCount, restingBand: restingBand };
	if (typeof module !== "undefined" && module.exports) module.exports = HR; else root.HR = HR;
})(typeof window !== "undefined" ? window : this);

/* MES Heart Rate Zone Calculator -- mes.fm/heart-rate-zone-calculator (UI; maths in lib.js, global HR).
 * localStorage "mes-heart-rate-zone-calculator:v1" = { age, rest, method, max }. Links: ?age=&rest=&m=&max= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("hr"); if (!root || !window.HR) return;
	var KEY = "mes-heart-rate-zone-calculator:v1";
	var EXAMPLES = [["Age 25", { age: "25", rest: "", method: "tanaka", max: "" }], ["Age 40, resting 60", { age: "40", rest: "60", method: "tanaka", max: "" }], ["Age 60, resting 55", { age: "60", rest: "55", method: "tanaka", max: "" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { age: "", rest: "", method: "tanaka", max: "" };
	function clean(s) { return { age: String(s.age || "").replace(/\D/g, "").slice(0, 3), rest: String(s.rest || "").replace(/\D/g, "").slice(0, 3), method: HR.METHODS[s.method] ? s.method : "tanaka", max: String(s.max || "").replace(/\D/g, "").slice(0, 3) }; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("age")) return false; st = clean({ age: q.get("age"), rest: q.get("rest"), method: q.get("m") || "tanaka", max: q.get("max") }); return true; }
	function toast(msg) { var t = $("hr-toast"); if (!t) { t = document.createElement("div"); t.id = "hr-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	$("hr-method").innerHTML = HR.ORDER.map(function (id) { return '<option value="' + id + '">' + esc(HR.METHODS[id].name) + "</option>"; }).join("");
	function syncAll() { $("hr-age").value = st.age; $("hr-rest").value = st.rest; $("hr-method").value = st.method; $("hr-max").value = st.max; if (st.max) $("hr-ownbox").open = true; }
	[["hr-age", "age"], ["hr-rest", "rest"], ["hr-max", "max"]].forEach(function (p) { $(p[0]).addEventListener("input", function () { st[p[1]] = this.value.replace(/\D/g, "").slice(0, 3); save(); update(); }); });
	$("hr-method").addEventListener("change", function () { st.method = this.value; save(); update(); });
	$("hr-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("hr-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st = clean(EXAMPLES[+b.dataset.i][1]); save(); syncAll(); update(); });
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	function update() {
		var age = HR.num(st.age), own = HR.num(st.max), rest = HR.num(st.rest), est = HR.maxHr(st.method, age);
		var max = own >= 120 && own <= 230 ? own : est, ok = max != null && HR.validAge(age); $("hr-empty").hidden = ok; $("hr-out").hidden = !ok; cur = null; if (!ok) return;
		if (!(rest >= 30 && rest < max - 20)) rest = null; var Z = HR.zones(max, rest); cur = { age: age, max: max, rest: rest, Z: Z };
		$("hr-hero").innerHTML = stat("Maximum heart rate", Math.round(max) + " <small>bpm</small>", own >= 120 ? "your measured max" : esc(HR.METHODS[st.method].name), "tu-stat--hero") + stat("Zone 2 (base)", Z[1].bpmLo + "&ndash;" + Z[1].bpmHi + " <small>bpm</small>", "easy, all-day aerobic work") + stat("Zone 4 (threshold)", Z[3].bpmLo + "&ndash;" + Z[3].bpmHi + " <small>bpm</small>", "hard but controlled") + (rest ? stat("Heart-rate reserve", Math.round(max - rest) + " <small>bpm</small>", "resting " + rest + " &middot; " + esc(HR.restingBand(rest))) : stat("Method", "% of max", "add a resting rate for Karvonen zones"));
		bands(); table(); ageChart(); compare(); now();
	}
	function bands() {
		var Z = cur.Z, W = 640, H = 150, L = 12, R = 12, lo = Math.floor((Z[0].bpmLo - 10) / 10) * 10, hi = Math.ceil((Z[4].bpmHi + 6) / 10) * 10, X = function (v) { return L + (v - lo) / (hi - lo) * (W - L - R); }, s = "";
		Z.forEach(function (z, i) { var x0 = X(z.bpmLo), x1 = X(z.bpmHi); s += '<rect class="hr-z' + z.n + '" x="' + x0 + '" y="40" width="' + (x1 - x0) + '" height="54" rx="' + (i === 0 || i === 4 ? 8 : 0) + '"><title>Zone ' + z.n + " " + esc(z.name) + ": " + z.bpmLo + "-" + z.bpmHi + " bpm</title></rect><text class=\"hr-zl\" x=\"" + ((x0 + x1) / 2) + '" y="64" text-anchor="middle">Z' + z.n + '</text><text class="hr-zl" x="' + ((x0 + x1) / 2) + '" y="82" text-anchor="middle" style="font-size:10px;font-weight:600">' + z.bpmLo + "&ndash;" + z.bpmHi + "</text>"; });
		var step = hi - lo > 100 ? 20 : 10; for (var g = Math.ceil(lo / step) * step; g <= hi; g += step) s += '<line class="hr-gl" x1="' + X(g) + '" x2="' + X(g) + '" y1="94" y2="100"/><text class="hr-ct" x="' + X(g) + '" y="114" text-anchor="middle">' + g + "</text>";
		s += '<text class="hr-ct" x="' + (W - R) + '" y="140" text-anchor="end">beats per minute</text><g id="hr-pinbox" hidden><line class="hr-pin" y1="30" y2="100"/><text class="hr-pint" y="24" text-anchor="middle"></text></g>';
		$("hr-bands").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>"; cur.X = X; cur.lo = lo; cur.hi = hi;
	}
	function table() {
		var Z = cur.Z; $("hr-table").innerHTML = "<thead><tr><th>Zone</th><th>Heart rate</th><th>% of " + (cur.rest ? "reserve" : "max") + "</th><th>Effort</th><th>What it is for</th></tr></thead><tbody>" + Z.map(function (z) { return '<tr id="hr-row' + z.n + '"><td><span class="hr-zb hr-z' + z.n + '">' + z.n + "</span><br>" + esc(z.name) + "</td><td><b>" + z.bpmLo + "&ndash;" + z.bpmHi + "</b> bpm</td><td>" + Math.round(z.lo * 100) + "&ndash;" + Math.round(z.hi * 100) + "%</td><td>" + esc(z.rpe) + "<br><span class=\"hr-small\">" + esc(z.talk) + "</span></td><td>" + esc(z.use) + '<br><span class="hr-small">' + esc(z.mins) + "</span></td></tr>"; }).join("") + "</tbody>";
	}
	function ageChart() {
		var W = 640, H = 230, L = 40, R = 12, T = 10, B = 30, a0 = 15, a1 = 80, maxes = []; for (var a = a0; a <= a1; a++) maxes.push(HR.maxHr(st.method, a));
		var top = Math.ceil(maxes[0] / 10) * 10, bot = Math.floor(maxes[maxes.length - 1] * 0.5 / 10) * 10, X = function (a) { return L + (a - a0) / (a1 - a0) * (W - L - R); }, Y = function (v) { return T + (top - v) / (top - bot) * (H - T - B); }, s = "", own = HR.num(st.max) >= 120;
		for (var g = Math.ceil(bot / 20) * 20; g <= top; g += 20) s += '<line class="hr-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="hr-ct" x="' + (L - 5) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + "</text>";
		for (var k = 4; k >= 0; k--) { var zz = HR.ZONES[k], up = [], dn = []; for (var q = a0; q <= a1; q++) { var m = HR.maxHr(st.method, q), b = HR.zones(m, cur.rest)[k]; up.push(X(q) + "," + Y(b.bpmHi)); dn.push(X(q) + "," + Y(b.bpmLo)); } s += '<polygon class="hr-z' + zz.n + '" points="' + up.join(" ") + " " + dn.reverse().join(" ") + '" opacity="0.9"><title>Zone ' + zz.n + "</title></polygon>"; }
		for (var t = 20; t <= 80; t += 10) s += '<text class="hr-ct" x="' + X(t) + '" y="' + (H - 10) + '" text-anchor="middle">' + t + "</text>";
		var xa = X(Math.max(a0, Math.min(a1, cur.age))); s += '<line class="hr-ageline" x1="' + xa + '" x2="' + xa + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="hr-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">age</text><text class="hr-ct" x="6" y="12">bpm</text>';
		$("hr-age-chart").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	function compare() {
		var age = cur.age, vs = HR.ORDER.map(function (id) { return HR.maxHr(id, age); }), mx = Math.max.apply(null, vs), mn = Math.min.apply(null, vs);
		$("hr-cmp").innerHTML = "<thead><tr><th>Formula</th><th>Max heart rate</th><th></th><th>About</th></tr></thead><tbody>" + HR.ORDER.map(function (id, i) { return "<tr" + (id === st.method && !(HR.num(st.max) >= 120) ? ' class="is-on"' : "") + "><td>" + esc(HR.METHODS[id].name) + "</td><td>" + Math.round(vs[i]) + ' bpm</td><td class="hr-barcell"><span class="hr-bar" style="width:' + (40 + (vs[i] - mn) / Math.max(1, mx - mn) * 60) + '%"></span></td><td class="hr-small">' + esc(HR.METHODS[id].note) + "</td></tr>"; }).join("") + "</tbody>";
	}
	function now() {
		var v = HR.num($("hr-now").value), pin = $("hr-pinbox"), t = $("hr-nowtxt"); if (!cur || !(v > 20 && v < 260)) { if (pin) pin.hidden = true; t.textContent = ""; document.querySelectorAll("#hr-table tr.is-on").forEach(function (r) { r.classList.remove("is-on"); }); return; }
		var z = HR.zoneOf(v, cur.max, cur.rest), pm = HR.percentOfMax(v, cur.max), pr = HR.percentOfReserve(v, cur.max, cur.rest);
		t.innerHTML = "<b>" + Math.round(v) + " bpm</b> = " + Math.round(pm) + "% of max" + (pr != null ? ", " + Math.round(pr) + "% of reserve" : "") + ": " + (z === 0 ? "below zone 1 (very easy)" : z === 6 ? '<span style="color:#c0392b">above your estimated max: test your formula</span>' : "<b>zone " + z + "</b> (" + esc(HR.ZONES[z - 1].name) + ")");
		if (pin && cur.X) { var x = cur.X(Math.max(cur.lo, Math.min(cur.hi, v))); pin.hidden = false; pin.querySelector("line").setAttribute("x1", x); pin.querySelector("line").setAttribute("x2", x); var tx = pin.querySelector("text"); tx.setAttribute("x", Math.max(20, Math.min(620, x))); tx.textContent = Math.round(v); }
		document.querySelectorAll("#hr-table tr.is-on").forEach(function (r) { r.classList.remove("is-on"); }); if (z >= 1 && z <= 5) $("hr-row" + z).classList.add("is-on");
	}
	$("hr-now").addEventListener("input", now);
	function counter() { var b = HR.num($("hr-beats").value), s = +$("hr-sec").value, v = HR.fromCount(b, s); $("hr-counted").innerHTML = v ? "= <b>" + Math.round(v) + " bpm</b>" : ""; if (v) { $("hr-now").value = Math.round(v); now(); } }
	$("hr-beats").addEventListener("input", counter); $("hr-sec").addEventListener("change", counter);
	$("hr-link").onclick = function () { if (cur) copy("https://mes.fm" + "/heart-rate-zone-calculator?age=" + st.age + (st.rest ? "&rest=" + st.rest : "") + (st.method !== "tanaka" ? "&m=" + st.method : "") + (st.max ? "&max=" + st.max : ""), "Link copied"); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
