/* MES Sleep Calculator -- pure maths (no DOM). Browser global `SL`; node: require('./tool_apps_src/sleep-calculator/lib.js'); tests: node tool_apps_src/sleep-calculator-tests.js
 * Times are minutes after midnight (0-1439). */
(function (root) {
	"use strict";
	var DAY = 1440;
	function mod(n) { return ((n % DAY) + DAY) % DAY; }
	function parse(s) { var m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); if (!m || +m[1] > 23 || +m[2] > 59) return null; return +m[1] * 60 + +m[2]; }
	function fmt(t, h24) {
		t = mod(Math.round(t)); var h = Math.floor(t / 60), m = t % 60, mm = (m < 10 ? "0" : "") + m;
		if (h24) return (h < 10 ? "0" : "") + h + ":" + mm; return (h % 12 === 0 ? 12 : h % 12) + ":" + mm + " " + (h < 12 ? "AM" : "PM");
	}
	function dur(min) { var h = Math.floor(min / 60), m = Math.round(min - h * 60); return h + " h" + (m ? " " + m + " min" : ""); }
	/* ---------- the cycle maths ---------- */
	// go to bed at `bed`: it takes `latency` minutes to fall asleep, then each cycle is `cycle` minutes
	function wakeTimes(bed, latency, cycle, counts) { return counts.map(function (n) { return { cycles: n, time: mod(bed + latency + n * cycle), asleep: n * cycle }; }); }
	// wake at `wake`: go to bed one of these times
	function bedTimes(wake, latency, cycle, counts) { return counts.map(function (n) { return { cycles: n, time: mod(wake - n * cycle - latency), asleep: n * cycle }; }); }
	/* ---------- how much sleep (AASM / National Sleep Foundation, hours per 24 h) ---------- */
	var NEED = [
		{ id: "inf", name: "Infant (4-12 months)", lo: 12, hi: 16, note: "including naps" }, { id: "tod", name: "Toddler (1-2 years)", lo: 11, hi: 14, note: "including naps" }, { id: "pre", name: "Preschool (3-5)", lo: 10, hi: 13, note: "including naps" },
		{ id: "sch", name: "School age (6-12)", lo: 9, hi: 12, note: "" }, { id: "teen", name: "Teen (13-17)", lo: 8, hi: 10, note: "" }, { id: "adult", name: "Adult (18-64)", lo: 7, hi: 9, note: "" }, { id: "senior", name: "Older adult (65+)", lo: 7, hi: 8, note: "" }
	];
	function need(id) { for (var i = 0; i < NEED.length; i++) if (NEED[i].id === id) return NEED[i]; return NEED[5]; }
	function status(asleepMin, nd) { var h = asleepMin / 60; return h + 1e-9 >= nd.lo && h <= nd.hi + 1e-9 ? "good" : h > nd.hi ? "long" : h >= nd.lo - 1.5 ? "short" : "veryshort"; }
	/* ---------- a typical night: stage layout per cycle (deep sleep early, REM late) ---------- */
	function cycleStages(k, cycle) {
		var n3 = Math.max(0.04, 0.26 - 0.07 * k), rem = Math.min(0.42, 0.12 + 0.07 * k), n1 = 0.05, n2 = 1 - n3 - rem - n1;
		return [["N1", n1], ["N2", n2 * 0.55], ["N3", n3], ["N2", n2 * 0.45], ["REM", rem]].map(function (s) { return { stage: s[0], dur: s[1] * cycle }; });
	}
	function hypnogram(cycles, cycle, latency) {
		var out = [], t = 0; if (latency > 0) { out.push({ stage: "W", start: 0, dur: latency }); t = latency; }
		for (var k = 0; k < cycles; k++) cycleStages(k, cycle).forEach(function (s) { out.push({ stage: s.stage, start: t, dur: s.dur }); t += s.dur; });
		return out;
	}
	function stageTotals(h) { var o = { N1: 0, N2: 0, N3: 0, REM: 0 }; h.forEach(function (s) { if (o[s.stage] != null) o[s.stage] += s.dur; }); return o; }
	/* ---------- evening plan ---------- */
	function evening(bed) { return { caffeine: mod(bed - 360), meal: mod(bed - 180), alcohol: mod(bed - 240), screens: mod(bed - 60), winddown: mod(bed - 30) }; }
	/* ---------- naps ---------- */
	var NAPS = [{ min: 10, name: "Power nap (10 min)", note: "Quick alertness boost, no grogginess." }, { min: 20, name: "Short nap (20 min)", note: "The classic: refreshed without deep sleep." }, { min: 30, name: "30 minutes", note: "Can leave you groggy for a while (sleep inertia)." }, { min: 90, name: "Full cycle (90 min)", note: "A whole sleep cycle: wake from light sleep, good for creativity and memory." }];
	function napWake(start, napMin, latency) { return mod(start + latency + napMin); }
	/* ---------- weekly sleep debt ---------- */
	function debt(needH, slept) {
		var vals = slept.filter(function (v) { return v != null && v >= 0; }); if (!vals.length) return null;
		var total = vals.reduce(function (a, b) { return a + b; }, 0), d = 0, extra = 0; vals.forEach(function (v) { if (v < needH) d += needH - v; else extra += v - needH; });
		return { nights: vals.length, avg: total / vals.length, debt: d, extra: extra, net: Math.max(0, d - extra) };
	}
	function parseHours(s) { if (s == null) return null; s = String(s).trim(); if (!s) return null; var m = s.match(/^(\d{1,2})(?:[:h.,](\d{1,2}))?$/); if (!m) return null; var h = +m[1], mi = m[2] == null ? 0 : (String(m[2]).length === 1 && /[.,]/.test(s) ? +m[2] * 6 : +m[2]); if (/[.,]/.test(s) && m[2] != null) mi = Math.round(parseFloat("0." + m[2]) * 60); if (h > 24 || mi > 59) return null; return h + mi / 60; }
	function trimH(h) { return (Math.round(h * 10) / 10).toString(); }
	var SL = { trimH: trimH, mod: mod, parse: parse, fmt: fmt, dur: dur, wakeTimes: wakeTimes, bedTimes: bedTimes, NEED: NEED, need: need, status: status, cycleStages: cycleStages, hypnogram: hypnogram, stageTotals: stageTotals, evening: evening, NAPS: NAPS, napWake: napWake, debt: debt, parseHours: parseHours };
	if (typeof module !== "undefined" && module.exports) module.exports = SL; else root.SL = SL;
})(typeof window !== "undefined" ? window : this);

/* MES Sleep Calculator -- mes.fm/sleep-calculator (UI; maths in lib.js, global SL).
 * localStorage "mes-sleep-calculator:v1" = { mode, time, age, h24, lat, cyc, nap, week: [7 x hours text] }. Links: ?m=wake|bed|now&t=07:00&age=adult&lat=15&cyc=90 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sl"); if (!root || !window.SL) return;
	var KEY = "mes-sleep-calculator:v1", DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { mode: "wake", time: "07:00", age: "adult", h24: false, lat: 15, cyc: 90, nap: "", week: ["", "", "", "", "", "", ""], sel: 5 };
	function clean(s) {
		var o = { mode: s.mode === "bed" || s.mode === "now" ? s.mode : "wake", time: SL.parse(s.time) != null ? s.time : "07:00", age: SL.NEED.some(function (n) { return n.id === s.age; }) ? s.age : "adult", h24: s.h24 === true, lat: Math.max(0, Math.min(60, Math.round(+s.lat / 5) * 5 || 0)), cyc: Math.max(80, Math.min(110, Math.round(+s.cyc / 5) * 5 || 90)), nap: SL.parse(s.nap) != null ? s.nap : "", sel: Math.max(2, Math.min(7, +s.sel || 5)) };
		o.week = (Array.isArray(s.week) ? s.week : []).concat(["", "", "", "", "", "", ""]).slice(0, 7).map(function (x) { return String(x == null ? "" : x).slice(0, 6); }); return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("t") && !q.has("m")) return false; var w = st.week; st = clean({ mode: q.get("m") || "wake", time: q.get("t") || st.time, age: q.get("age") || st.age, h24: st.h24, lat: q.has("lat") ? q.get("lat") : st.lat, cyc: q.has("cyc") ? q.get("cyc") : st.cyc, nap: st.nap, week: w, sel: q.get("sel") || st.sel }); return true; }
	function toast(msg) { var t = $("sl-toast"); if (!t) { t = document.createElement("div"); t.id = "sl-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	function T(t) { return SL.fmt(t, st.h24); }
	function nowStr() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getHours()) + ":" + p(d.getMinutes()); }

	$("sl-age").innerHTML = SL.NEED.map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + "</option>"; }).join("");
	$("sl-ref").innerHTML = "<thead><tr><th>Age</th><th>Hours of sleep</th><th></th></tr></thead><tbody>" + SL.NEED.map(function (n) { return '<tr id="sl-ref-' + n.id + '"><td>' + esc(n.name) + "</td><td>" + n.lo + "&ndash;" + n.hi + " hours</td><td class=\"sl-small\">" + esc(n.note) + "</td></tr>"; }).join("") + "</tbody>";
	function syncAll() {
		$("sl-time").value = st.mode === "now" ? nowStr() : st.time; $("sl-age").value = st.age; $("sl-lat").value = st.lat; $("sl-cyc").value = st.cyc;
		[].forEach.call($("sl-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === st.mode)); }); [].forEach.call($("sl-fmt").children, function (b) { b.setAttribute("aria-pressed", String((b.dataset.f === "24") === st.h24)); });
		$("sl-timel").textContent = st.mode === "wake" ? "Wake-up time" : st.mode === "bed" ? "Bedtime" : "Going to bed at"; $("sl-time").disabled = false; $("sl-nap").value = st.nap || nowStr();
		$("sl-lato").textContent = st.lat + " min"; $("sl-cyco").textContent = st.cyc + " min";
	}
	$("sl-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.mode = b.dataset.m; if (st.mode === "now") { st.time = nowStr(); } else if (st.mode === "wake" && st.time === nowStr()) st.time = "07:00"; save(); syncAll(); update(); });
	$("sl-time").addEventListener("input", function () { if (SL.parse(this.value) != null) { st.time = this.value; save(); update(); } });
	$("sl-age").addEventListener("change", function () { st.age = this.value; save(); update(); });
	$("sl-fmt").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.h24 = b.dataset.f === "24"; save(); syncAll(); update(); });
	$("sl-lat").addEventListener("input", function () { st.lat = +this.value; $("sl-lato").textContent = st.lat + " min"; save(); update(); }); $("sl-cyc").addEventListener("input", function () { st.cyc = +this.value; $("sl-cyco").textContent = st.cyc + " min"; save(); update(); });
	$("sl-nap").addEventListener("input", function () { st.nap = this.value; save(); naps(); }); $("sl-napnow").onclick = function () { st.nap = nowStr(); $("sl-nap").value = st.nap; save(); naps(); };
	var cur = null, COUNTS = [6, 5, 4, 3];
	function update() {
		var t = SL.parse(st.time); if (t == null) return; var nd = SL.need(st.age), wake = st.mode === "wake", rows = wake ? SL.bedTimes(t, st.lat, st.cyc, COUNTS) : SL.wakeTimes(t, st.lat, st.cyc, COUNTS), best = rows.reduce(function (a, r) { return Math.abs(r.asleep / 60 - (nd.lo + nd.hi) / 2) < Math.abs(a.asleep / 60 - (nd.lo + nd.hi) / 2) ? r : a; }, rows[0]);
		if (!rows.some(function (r) { return r.cycles === st.sel; })) st.sel = best.cycles; var sel = rows.filter(function (r) { return r.cycles === st.sel; })[0];
		$("sl-h1").textContent = wake ? "Go to bed at one of these times" : "Set your alarm for one of these times"; $("sl-lead").textContent = wake ? "To wake up at " + T(t) + " feeling refreshed, be in bed at:" : "If you go to bed at " + T(t) + " and fall asleep in about " + st.lat + " minutes, wake at the end of a cycle:";
		$("sl-cards").innerHTML = rows.map(function (r) { var s = SL.status(r.asleep, nd), lab = { good: "Recommended", short: "A bit short", veryshort: "Too short", long: "Longer than needed" }[s]; return '<button type="button" class="sl-card' + (r.cycles === st.sel ? " is-sel" : "") + '" data-c="' + r.cycles + '" role="listitem" aria-pressed="' + (r.cycles === st.sel) + '"><span class="sl-time">' + T(r.time) + '</span><span class="sl-sub">' + SL.dur(r.asleep) + " of sleep &middot; " + r.cycles + ' cycles</span><span class="sl-badge sl-badge--' + s + '">' + lab + "</span></button>"; }).join("");
		var bed = wake ? sel.time : t, wk = wake ? t : sel.time, ss = SL.status(sel.asleep, nd);
		$("sl-verdict").innerHTML = (wake ? "Bed at <b>" + T(bed) + "</b>, " : "Asleep around <b>" + T(SL.mod(bed + st.lat)) + "</b>, wake at <b>" + T(wk) + "</b>, ") + "that is <b>" + SL.dur(sel.asleep) + "</b> of sleep in <b>" + sel.cycles + " cycles</b>" + (wake ? " before " + T(wk) : "") + ". " + (ss === "good" ? "That is inside the " + nd.lo + "&ndash;" + nd.hi + " hours recommended for " + esc(nd.name.toLowerCase()) + "." : ss === "long" ? "That is more than the " + nd.lo + "&ndash;" + nd.hi + " hours usually needed." : "That is under the " + nd.lo + "&ndash;" + nd.hi + " hours recommended for " + esc(nd.name.toLowerCase()) + ".") + '<br><small class="sl-small">Allowing ' + st.lat + " minutes to fall asleep and " + st.cyc + "-minute cycles. Tap another time above to see it.</small>";
		cur = { bed: bed, wake: wk, sel: sel, rows: rows }; hyp(); plan(); naps(); [].forEach.call(document.querySelectorAll("#sl-ref tr"), function (r) { r.classList.remove("is-on"); }); var rr = $("sl-ref-" + st.age); if (rr) rr.classList.add("is-on"); debt();
	}
	$("sl-cards").addEventListener("click", function (e) { var b = e.target.closest(".sl-card"); if (!b) return; st.sel = +b.dataset.c; save(); update(); });
	function hyp() {
		var H = SL.hypnogram(cur.sel.cycles, st.cyc, st.lat), W = 640, Ht = 220, L = 46, R = 12, Tp = 10, B = 34, total = H[H.length - 1].start + H[H.length - 1].dur, X = function (m) { return L + m / total * (W - L - R); }, lv = { W: 0, REM: 1, N1: 2, N2: 3, N3: 4 }, rowH = (Ht - Tp - B) / 5, s = "", names = [["W", "Awake"], ["REM", "REM"], ["N1", "N1"], ["N2", "N2"], ["N3", "Deep"]];
		names.forEach(function (n, i) { s += '<line class="sl-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + (Tp + i * rowH + rowH / 2) + '" y2="' + (Tp + i * rowH + rowH / 2) + '"/><text class="sl-yl" x="' + (L - 6) + '" y="' + (Tp + i * rowH + rowH / 2 + 4) + '" text-anchor="end">' + n[1] + "</text>"; });
		H.forEach(function (b) { var y = Tp + lv[b.stage] * rowH + rowH * 0.15; s += '<rect class="sl-s-' + b.stage + '" x="' + X(b.start) + '" y="' + y + '" width="' + Math.max(1, X(b.start + b.dur) - X(b.start)) + '" height="' + rowH * 0.7 + '" rx="2"><title>' + b.stage + ": " + Math.round(b.dur) + " min</title></rect>"; });
		var step = total > 360 ? 120 : 60, start = cur.bed; for (var m = 0; m <= total; m += step) s += '<text class="sl-ct" x="' + X(m) + '" y="' + (Ht - 14) + '" text-anchor="middle">' + T(start + m) + "</text>"; s += '<text class="sl-ct" x="' + (W - R) + '" y="' + (Ht - 1) + '" text-anchor="end">clock time (a typical night)</text>';
		$("sl-hyp").innerHTML = '<svg viewBox="0 0 ' + W + " " + Ht + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		var tt = SL.stageTotals(H), sl = tt.N1 + tt.N2 + tt.N3 + tt.REM; $("sl-hleg").innerHTML = [["N3", "Deep sleep (N3)"], ["REM", "REM sleep"], ["N2", "Light sleep (N2)"], ["N1", "Drifting off (N1)"]].map(function (x) { return '<li><i class="sl-s-' + x[0] + '"></i><span>' + x[1] + "</span><b>" + SL.dur(tt[x[0]]) + " (" + Math.round(tt[x[0]] / sl * 100) + "%)</b></li>"; }).join("");
	}
	function plan() {
		var e = SL.evening(cur.bed), steps = [[e.caffeine, "Last coffee, tea, cola or energy drink (caffeine lingers 5&ndash;6 hours)."], [e.meal, "Finish your last big meal (lying down on a full stomach hurts sleep)."], [e.alcohol, "Last alcoholic drink: it helps you drop off but fragments the second half of the night."], [e.screens, "Screens down, lights low. Bright light tells your brain it is still day."], [e.winddown, "Wind down: wash up, read, stretch, or breathe slowly."], [cur.bed, "In bed. Lights out; you should be asleep about " + st.lat + " minutes later."], [cur.wake, "Wake up. Open the curtains: morning light sets tomorrow's body clock."]];
		steps.sort(function (a, b) { var x = SL.mod(a[0] - cur.bed + 600), y = SL.mod(b[0] - cur.bed + 600); return x - y; }); $("sl-plan").innerHTML = steps.map(function (x) { return '<div class="sl-step"><b>' + T(x[0]) + "</b><span>" + x[1] + "</span></div>"; }).join("");
	}
	function naps() {
		var s = SL.parse(st.nap || nowStr()); if (s == null) return; $("sl-naps").innerHTML = "<thead><tr><th>Nap</th><th>Wake at</th><th>Good for</th></tr></thead><tbody>" + SL.NAPS.map(function (n) { return "<tr><td>" + esc(n.name) + "</td><td><b>" + T(SL.napWake(s, n.min, Math.min(st.lat, 10))) + "</b></td><td>" + esc(n.note) + "</td></tr>"; }).join("") + "</tbody>";
	}
	/* ---------- weekly debt ---------- */
	$("sl-week").innerHTML = DAYS.map(function (d, i) { return '<div class="sl-day"><label for="sl-d' + i + '">' + d + '</label><input id="sl-d' + i + '" class="tu-input" type="text" inputmode="decimal" autocomplete="off" placeholder="hours" data-i="' + i + '"></div>'; }).join("");
	[].forEach.call($("sl-week").querySelectorAll("input"), function (el) { el.addEventListener("input", function () { st.week[+el.dataset.i] = el.value; save(); debt(); }); });
	$("sl-clearweek").onclick = function () { st.week = ["", "", "", "", "", "", ""]; [].forEach.call($("sl-week").querySelectorAll("input"), function (el) { el.value = ""; }); save(); debt(); };
	function debt() {
		var nd = SL.need(st.age), need = (nd.lo + nd.hi) / 2, vals = st.week.map(SL.parseHours); [].forEach.call($("sl-week").querySelectorAll("input"), function (el) { if (document.activeElement !== el) el.value = st.week[+el.dataset.i]; });
		var d = SL.debt(nd.lo, vals), W = 640, H = 190, L = 40, R = 12, Tp = 12, B = 28, mx = Math.max(10, Math.ceil(Math.max.apply(null, vals.map(function (v) { return v || 0; }).concat([nd.hi])) + 1)), bw = (W - L - R) / 7, Y = function (v) { return Tp + (mx - v) / mx * (H - Tp - B); }, s = "";
		for (var g = 0; g <= mx; g += 2) s += '<line class="sl-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="sl-ct" x="' + (L - 5) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + "</text>";
		DAYS.forEach(function (dn, i) {
			var v = vals[i], x = L + i * bw + bw * 0.18;
			if (v != null) s += '<rect class="sl-bar' + (v < nd.lo ? " is-short" : "") + '" x="' + x + '" y="' + Y(v) + '" width="' + bw * 0.64 + '" height="' + (Y(0) - Y(v)) + '" rx="4"><title>' + dn + ": " + SL.dur(v * 60) + '</title></rect><text class="sl-yl" x="' + (x + bw * 0.32) + '" y="' + (Y(v) - 4) + '" text-anchor="middle">' + SL.trimH(v) + "</text>";
			s += '<text class="sl-ct" x="' + (x + bw * 0.32) + '" y="' + (H - 10) + '" text-anchor="middle">' + dn + "</text>";
		});
		s += '<line class="sl-need" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(nd.lo) + '" y2="' + Y(nd.lo) + '"/><text class="sl-ct" x="' + (W - R) + '" y="' + (Y(nd.lo) - 4) + '" text-anchor="end">' + nd.lo + " h minimum for your age</text>";
		$("sl-debt").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		$("sl-debtt").innerHTML = !d ? "" : "Average <b>" + SL.dur(d.avg * 60) + "</b> a night over " + d.nights + (d.nights === 1 ? " night" : " nights") + ". " + (d.net < 0.25 ? "No sleep debt against the " + nd.lo + "-hour minimum: well done." : "You are about <b>" + SL.dur(d.net * 60) + "</b> short of the " + nd.lo + " hours a night." + (d.net >= 3 ? " Try going to bed 30&ndash;60 minutes earlier for the next few nights to recover." : " An earlier night or two will cover it."));
	}
	$("sl-link").onclick = function () { if (cur) copy(location.origin + "/sleep-calculator?m=" + st.mode + "&t=" + st.time + "&age=" + st.age + "&lat=" + st.lat + "&cyc=" + st.cyc + "&sel=" + st.sel, "Link copied"); }; $("sl-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} } if (st.mode === "now") st.time = nowStr();
	syncAll(); update();
})();
