/* MES Running Pace Calculator -- pure maths (no DOM). Browser global `PC`; node: require('./tool_apps_src/pace-calculator/lib.js'); tests: node tool_apps_src/pace-calculator-tests.js
 * Distances in metres, times in seconds, pace in seconds per km or per mile. */
(function (root) {
	"use strict";
	var MI = 1609.344, KM = 1000;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	/* ---------- times: "1:45:30", "25:10", "25.5" (minutes), "1h 45m 30s" ---------- */
	function parseTime(s) {
		if (s == null) return null; s = String(s).trim().toLowerCase(); if (!s) return null;
		var m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec)?)?$/);
		if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
		if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 60;                                  // a bare number = minutes
		var p = s.split(":"); if (p.length < 2 || p.length > 3 || !p.every(function (x) { return /^\d+(\.\d+)?$/.test(x); })) return null;
		var v = p.map(parseFloat); if (v.length === 2) return v[0] * 60 + v[1]; if (v[1] >= 60 || v[2] >= 60) return null; return v[0] * 3600 + v[1] * 60 + v[2];
	}
	function fmt(sec, tenths) {
		if (sec == null || !isFinite(sec) || sec < 0) return ""; var t = tenths ? Math.round(sec * 10) / 10 : Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t - h * 3600) / 60), s = t - h * 3600 - m * 60;
		var ss = tenths ? (s < 10 ? "0" : "") + s.toFixed(1) : (s < 10 ? "0" : "") + s; return h > 0 ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
	}
	/* ---------- distances ---------- */
	var RACES = [["1 mile", MI], ["1500 m", 1500], ["3 km", 3000], ["5 km", 5000], ["8 km", 8000], ["10 km", 10000], ["15 km", 15000], ["10 miles", 10 * MI], ["Half marathon", 21097.5], ["25 km", 25000], ["30 km", 30000], ["Marathon", 42195], ["50 km", 50000]];
	function unitM(u) { return u === "mi" ? MI : KM; }
	function toMetres(v, u) { return v * unitM(u); }
	/* ---------- the pace / time / distance triangle ---------- */
	function paceOf(sec, metres, u) { return sec / (metres / unitM(u)); }       // sec per km or mile
	function timeOf(pace, metres, u) { return pace * (metres / unitM(u)); }
	function distOf(sec, pace, u) { return sec / pace * unitM(u); }             // metres
	function speed(sec, metres) { return { kmh: metres / 1000 / (sec / 3600), mph: metres / MI / (sec / 3600) }; }
	function convertPace(p, from, to) { return p * unitM(to) / unitM(from); }
	// treadmill: speed in km/h or mph -> pace per km / per mile
	function paceFromSpeed(v, kind, u) { var mps = kind === "mph" ? v * MI / 3600 : v * 1000 / 3600; return unitM(u) / mps; }
	/* ---------- race prediction (Riegel, 1977: t2 = t1 x (d2 / d1)^1.06) ---------- */
	function riegel(t1, d1, d2, k) { return t1 * Math.pow(d2 / d1, k || 1.06); }
	/* ---------- splits ----------
	 * fade: pace change from the first split to the last as a fraction of average pace (0 = even, +0.06 = positive split (slows 6%), -0.06 = negative split).
	 * The shape is linear and is scaled so the splits add up to the total time exactly. */
	function splits(total, metres, u, fade) {
		var um = unitM(u), n = Math.max(1, Math.ceil(metres / um - 1e-9)), w = [], lens = [], i, sum = 0, f = fade || 0;
		for (i = 0; i < n; i++) { var len = Math.min(um, metres - i * um); lens.push(len); w.push(1 + f * (n > 1 ? (i / (n - 1) - 0.5) : 0)); sum += w[i] * len; }
		var k = total / sum, out = [], cum = 0;
		for (i = 0; i < n; i++) { var t = w[i] * lens[i] * k; cum += t; out.push({ n: i + 1, from: i * um, to: i * um + lens[i], len: lens[i], time: t, cum: cum, pace: w[i] * um * k }); }
		return out;
	}
	// clock time of day: start "07:30" + seconds -> "09:15" (+ days)
	function clock(start, add) { var m = String(start || "").match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; var t = +m[1] * 3600 + +m[2] * 60 + Math.round(add), d = Math.floor(t / 86400); t -= d * 86400; var h = Math.floor(t / 3600), mm = Math.floor((t - h * 3600) / 60); return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm + (d > 0 ? " (+" + d + "d)" : ""); }
	var PC = { num: num, fix: fix, trim: trim, MI: MI, KM: KM, parseTime: parseTime, fmt: fmt, RACES: RACES, unitM: unitM, toMetres: toMetres, paceOf: paceOf, timeOf: timeOf, distOf: distOf, speed: speed, convertPace: convertPace, paceFromSpeed: paceFromSpeed, riegel: riegel, splits: splits, clock: clock };
	if (typeof module !== "undefined" && module.exports) module.exports = PC; else root.PC = PC;
})(typeof window !== "undefined" ? window : this);

/* MES Running Pace Calculator -- mes.fm/pace-calculator (UI; maths in lib.js, global PC).
 * Any two of distance / time / pace give the third. localStorage "mes-pace-calculator:v1" = { d, du, t, p, pu, edits, fade, su, start }. Links: ?d=&du=&t=&p=&pu= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pc"); if (!root || !window.PC) return;
	var KEY = "mes-pace-calculator:v1";
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { d: "5", du: "km", t: "25:00", p: "", pu: "km", edits: ["d", "t"], fade: 0, su: "km", start: "" };
	function clean(s) {
		var o = { d: String(s.d == null ? "" : s.d).slice(0, 10), du: s.du === "mi" ? "mi" : "km", t: String(s.t == null ? "" : s.t).slice(0, 12), p: String(s.p == null ? "" : s.p).slice(0, 10), pu: s.pu === "mi" ? "mi" : "km", fade: Math.max(-10, Math.min(10, Math.round(+s.fade || 0))), su: s.su === "mi" ? "mi" : "km", start: /^\d{1,2}:\d{2}$/.test(s.start || "") ? s.start : "" };
		o.edits = Array.isArray(s.edits) ? s.edits.filter(function (x) { return x === "d" || x === "t" || x === "p"; }).slice(-2) : ["d", "t"]; if (o.edits.length < 2) o.edits = ["d", "t"]; if (o.edits[0] === o.edits[1]) o.edits = ["d", "t"]; return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("d") && !q.has("t") && !q.has("p")) return false; var s = { d: q.get("d") || "", du: q.get("du") || st.du, t: q.get("t") || "", p: q.get("p") || "", pu: q.get("pu") || q.get("du") || st.pu, edits: [], fade: st.fade, su: st.su, start: "" }; var f = ["d", "t", "p"].filter(function (k) { return s[k] !== ""; }); s.edits = f.slice(0, 2); if (s.edits.length < 2) return false; st = clean(s); return true; }
	function toast(msg) { var t = $("pc-toast"); if (!t) { t = document.createElement("div"); t.id = "pc-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	var U = { km: "km", mi: "mi" };

	/* ---------- inputs ---------- */
	$("pc-races").innerHTML = PC.RACES.map(function (r, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(r[0]) + "</button>"; }).join("");
	$("pc-races").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var m = PC.RACES[+b.dataset.i][1]; st.d = PC.trim(m / PC.unitM(st.du), 3); touch("d"); recompute(); });
	function touch(k) { st.edits = st.edits.filter(function (x) { return x !== k; }); st.edits.push(k); st.edits = st.edits.slice(-2); }
	function typed(k) { return function () { st[k] = this.value; if (this.value.trim() === "") { st.edits = st.edits.filter(function (x) { return x !== k; }); } else touch(k); if (st.edits.length < 2) { render(); return; } recompute(k); }; }
	$("pc-dist").addEventListener("input", typed("d")); $("pc-time").addEventListener("input", typed("t")); $("pc-pace").addEventListener("input", typed("p"));
	$("pc-du").addEventListener("change", function () { var old = st.du, v = PC.num(st.d); st.du = this.value; if (v > 0) st.d = PC.trim(v * PC.unitM(old) / PC.unitM(st.du), 3); recompute(); });
	$("pc-pu").addEventListener("change", function () { var old = st.pu, v = PC.parseTime(st.p); st.pu = this.value; if (v > 0) st.p = PC.fmt(PC.convertPace(v, old, st.pu)); recompute(); });
	$("pc-fade").addEventListener("input", function () { st.fade = +this.value; save(); drawSplits(); }); $("pc-su").addEventListener("change", function () { st.su = this.value; save(); drawSplits(); }); $("pc-start").addEventListener("input", function () { st.start = this.value; save(); drawSplits(); });
	function recompute(skip) {
		var m = PC.toMetres(PC.num(st.d), st.du), t = PC.parseTime(st.t), p = PC.parseTime(st.p), calc = ["d", "t", "p"].filter(function (k) { return st.edits.indexOf(k) < 0; })[0];
		if (st.edits.length === 2) {
			if (calc === "p" && m > 0 && t > 0) st.p = PC.fmt(PC.paceOf(t, m, st.pu), false);
			else if (calc === "t" && m > 0 && p > 0) st.t = PC.fmt(PC.timeOf(p, m, st.pu), false);
			else if (calc === "d" && t > 0 && p > 0) st.d = PC.trim(PC.distOf(t, p, st.pu) / PC.unitM(st.du), 3);
		}
		save(); render();
	}
	function render() {
		["d", "t", "p"].forEach(function (k) { var el = $({ d: "pc-dist", t: "pc-time", p: "pc-pace" }[k]); if (document.activeElement !== el) el.value = st[k]; el.parentNode.classList.toggle("pc-calc", st.edits.length === 2 && st.edits.indexOf(k) < 0); if (el.parentNode.classList.contains("pc-dist")) el.parentNode.classList.remove("pc-calc"); el.classList.toggle("pc-calc", st.edits.length === 2 && st.edits.indexOf(k) < 0); });
		$("pc-du").value = st.du; $("pc-pu").value = st.pu; $("pc-fade").value = st.fade; $("pc-su").value = st.su; $("pc-start").value = st.start;
		var m = PC.toMetres(PC.num(st.d), st.du), t = PC.parseTime(st.t), ok = m > 0 && t > 0 && m < 1e6 && t < 1e6; $("pc-out").hidden = !ok; cur = null; if (!ok) return;
		cur = { m: m, t: t, pk: PC.paceOf(t, m, "km"), pm: PC.paceOf(t, m, "mi"), sp: PC.speed(t, m) }; hero(); drawSplits(); races(); treadmill();
	}
	var cur = null;
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	function dtxt(m) { var r = PC.RACES.filter(function (x) { return Math.abs(x[1] - m) < 5; })[0]; return r ? r[0] : PC.trim(m / PC.unitM(st.du), 2) + " " + (st.du === "mi" ? "miles" : "km"); }
	function hero() {
		var a = st.pu === "mi" ? [cur.pm, "per mile", cur.pk, "per km"] : [cur.pk, "per km", cur.pm, "per mile"];
		$("pc-hero").innerHTML = stat("Pace", PC.fmt(a[0]) + " <small>" + a[1] + "</small>", PC.fmt(a[2]) + " " + a[3], "tu-stat--hero") + stat("Finish time", PC.fmt(cur.t), esc(dtxt(cur.m))) + stat("Speed", PC.trim(cur.sp.kmh, 2) + " <small>km/h</small>", PC.trim(cur.sp.mph, 2) + " mph") + stat("Distance", PC.trim(cur.m / 1000, 2) + " <small>km</small>", PC.trim(cur.m / PC.MI, 2) + " miles");
		$("pc-verdict").innerHTML = "Running <b>" + esc(dtxt(cur.m)) + "</b> in <b>" + PC.fmt(cur.t) + "</b> is a pace of <b>" + PC.fmt(cur.pk) + " per km</b> (<b>" + PC.fmt(cur.pm) + " per mile</b>), or " + PC.trim(cur.sp.kmh, 1) + " km/h (" + PC.trim(cur.sp.mph, 1) + " mph).";
	}
	function fadeText(f) { return f === 0 ? "even pace" : f < 0 ? "negative split: " + Math.abs(f) + "% faster at the end than the start" : "positive split: " + f + "% slower at the end than the start"; }
	function drawSplits() {
		if (!cur) return; var f = st.fade, S = PC.splits(cur.t, cur.m, st.su, f / 100 * 1), um = PC.unitM(st.su);
		$("pc-fadeo").textContent = f === 0 ? "even" : (f < 0 ? "negative " : "positive ") + Math.abs(f) + "%"; $("pc-fadenote").textContent = "Pacing: " + fadeText(f) + ". Average pace stays " + PC.fmt(PC.paceOf(cur.t, cur.m, st.su)) + " per " + (st.su === "mi" ? "mile" : "km") + ".";
		var avg = PC.paceOf(cur.t, cur.m, st.su), paces = S.map(function (x) { return x.len >= um * 0.999 ? x.pace : x.pace; }), mn = Math.min.apply(null, paces), mx = Math.max.apply(null, paces), lo = Math.floor(mn * 0.9), hi = Math.ceil(mx * 1.04), W = 640, H = 200, L = 46, R = 10, T = 10, B = 28, n = S.length, bw = (W - L - R) / n, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); }, s = "";
		var step = (hi - lo) > 120 ? 30 : (hi - lo) > 50 ? 15 : 5; for (var g = Math.ceil(lo / step) * step; g <= hi; g += step) s += '<line class="pc-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="pc-ct" x="' + (L - 5) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + PC.fmt(g) + "</text>";
		S.forEach(function (x, i) { var cls = x.pace < avg * 0.985 ? " is-fast" : x.pace > avg * 1.015 ? " is-slow" : "", xx = L + i * bw + bw * 0.12; s += '<rect class="pc-b' + cls + '" x="' + xx + '" y="' + Y(x.pace) + '" width="' + bw * 0.76 + '" height="' + Math.max(1, Y(lo) - Y(x.pace)) + '" rx="2"><title>Split ' + x.n + ": " + PC.fmt(x.pace) + " pace, " + PC.fmt(x.cum) + " total</title></rect>"; if (n <= 24 || i % Math.ceil(n / 14) === 0) s += '<text class="pc-ct" x="' + (xx + bw * 0.38) + '" y="' + (H - 10) + '" text-anchor="middle">' + x.n + "</text>"; });
		s += '<line class="pc-avg" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(avg) + '" y2="' + Y(avg) + '"/><text class="pc-ct" x="' + (W - R) + '" y="' + (H - 1) + '" text-anchor="end">split number (pace per ' + (st.su === "mi" ? "mile" : "km") + ", dashed = average)</text>";
		$("pc-chart").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		var useClock = /^\d{1,2}:\d{2}$/.test(st.start); $("pc-splits").innerHTML = "<thead><tr><th>" + (st.su === "mi" ? "Mile" : "Km") + "</th><th>Split time</th><th>Pace</th><th>Total time</th>" + (useClock ? "<th>Clock</th>" : "") + "</tr></thead><tbody>" + S.map(function (x) { var lab = x.len < um * 0.999 ? PC.trim(x.to / um, 2) : String(x.n); return "<tr><td>" + lab + "</td><td>" + PC.fmt(x.time, true) + "</td><td>" + PC.fmt(x.pace) + "</td><td>" + PC.fmt(x.cum) + "</td>" + (useClock ? "<td>" + PC.clock(st.start, x.cum) + "</td>" : "") + "</tr>"; }).join("") + "</tbody>";
		cur.S = S;
	}
	function races() {
		var rows = PC.RACES.concat(cur.m ? [] : []).map(function (r) { return { n: r[0], m: r[1] }; }); var isr = rows.some(function (r) { return Math.abs(r.m - cur.m) < 5; }); if (!isr) rows.push({ n: dtxt(cur.m) + " (yours)", m: cur.m }); rows.sort(function (a, b) { return a.m - b.m; });
		$("pc-races-t").innerHTML = "<thead><tr><th>Distance</th><th>At this pace</th><th>Predicted (Riegel)</th><th>Predicted pace / " + (st.pu === "mi" ? "mile" : "km") + "</th></tr></thead><tbody>" + rows.map(function (r) { var tp = cur.pk * r.m / 1000, pr = PC.riegel(cur.t, cur.m, r.m), on = Math.abs(r.m - cur.m) < 5; return "<tr" + (on ? ' class="is-on"' : "") + "><td>" + esc(r.n) + "</td><td>" + PC.fmt(tp) + "</td><td>" + PC.fmt(pr) + "</td><td>" + PC.fmt(PC.paceOf(pr, r.m, st.pu)) + "</td></tr>"; }).join("") + "</tbody>";
	}
	function treadmill() {
		var kmh = cur.sp.kmh, rows = []; [-2, -1, 0, 1, 2].forEach(function (d) { var v = Math.max(3, Math.round(kmh * 2) / 2 + d * 0.5); rows.push(v); });
		$("pc-tm").innerHTML = "<thead><tr><th>Treadmill km/h</th><th>mph</th><th>Pace per km</th><th>Pace per mile</th></tr></thead><tbody>" + rows.map(function (v) { var on = Math.abs(v - kmh) < 0.26; return "<tr" + (on ? ' class="is-on"' : "") + "><td>" + PC.trim(v, 1) + "</td><td>" + PC.trim(v / 1.609344, 2) + "</td><td>" + PC.fmt(3600 / v) + "</td><td>" + PC.fmt(3600 / v * 1.609344) + "</td></tr>"; }).join("") + "</tbody>";
	}
	$("pc-copysplits").onclick = function () { if (!cur || !cur.S) return; copy(["Split\tTime\tPace\tTotal"].concat(cur.S.map(function (x) { return [x.n, PC.fmt(x.time, true), PC.fmt(x.pace), PC.fmt(x.cum)].join("\t"); })).join("\n"), "Copied: paste it into a spreadsheet"); };
	$("pc-link").onclick = function () { if (!cur) return; copy("https://mes.fm" + "/pace-calculator?d=" + encodeURIComponent(st.d) + "&du=" + st.du + "&t=" + encodeURIComponent(PC.fmt(cur.t)), "Link copied"); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	recompute();
})();
