/* MES Water Intake Calculator -- mes.fm/water-intake-calculator (UI; maths in lib.js, global WI).
 * localStorage "mes-water-intake-calculator:v1" = { sex, kg, ex, cl, stt, du, wake, sleep, log:{date:[ml...]} }. Links: ?kg=&sex=&ex=&cl=&stt= (the tracker log is never in a link) */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("wi"); if (!root || !window.WI) return;
	var KEY = "mes-water-intake-calculator:v1";
	var EXAMPLES = [["Man, 80 kg, 30 min exercise", { sex: "m", kg: "80", ex: 30, cl: "temp", stt: "none" }], ["Woman, 60 kg, hot weather", { sex: "f", kg: "60", ex: 0, cl: "hot", stt: "none" }], ["Woman, 65 kg, breastfeeding", { sex: "f", kg: "65", ex: 0, cl: "temp", stt: "bf" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { sex: "", kg: "", ex: 30, cl: "temp", stt: "none", du: "ml", wake: 7, sleep: 23, log: {} };
	function clean(s, keepLog) {
		var o = { sex: s.sex === "m" || s.sex === "f" ? s.sex : "", kg: String(s.kg || "").slice(0, 8), ex: Math.max(0, Math.min(240, Math.round(+s.ex || 0))), cl: WI.CLIMATES.some(function (c) { return c.id === s.cl; }) ? s.cl : "temp", stt: WI.STATUS.some(function (c) { return c.id === s.stt; }) ? s.stt : "none", du: s.du === "oz" ? "oz" : "ml", wake: Math.max(0, Math.min(23, +s.wake || 0)), sleep: Math.max(0, Math.min(23, s.sleep == null ? 23 : +s.sleep)), log: {} };
		if (keepLog && s.log && typeof s.log === "object") Object.keys(s.log).slice(-60).forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(s.log[k])) o.log[k] = s.log[k].map(Number).filter(function (x) { return x > 0 && x < 10000; }).slice(0, 200); }); return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s, true); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("kg")) return false; var log = st.log; st = clean({ sex: q.get("sex") || st.sex, kg: q.get("kg"), ex: q.get("ex") != null ? q.get("ex") : st.ex, cl: q.get("cl") || st.cl, stt: q.get("stt") || st.stt, du: st.du, wake: st.wake, sleep: st.sleep }); st.log = log; return true; }
	function toast(msg) { var t = $("wi-toast"); if (!t) { t = document.createElement("div"); t.id = "wi-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	function today() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
	function amt(ml, small) { return st.du === "oz" ? WI.trim(WI.mlToOz(ml), small ? 0 : 0) + " fl oz" : (ml >= 1000 && !small ? WI.trim(ml / 1000, 2) + " L" : WI.group(ml) + " ml"); }
	function amtBoth(ml) { return st.du === "oz" ? WI.trim(WI.mlToOz(ml), 0) + " fl oz (" + WI.trim(ml / 1000, 1) + " L)" : WI.trim(ml / 1000, 2) + " L (" + WI.trim(WI.mlToOz(ml), 0) + " fl oz)"; }

	/* ---------- inputs ---------- */
	$("wi-cl").innerHTML = WI.CLIMATES.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
	$("wi-stt").innerHTML = WI.STATUS.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
	function hourLabel(h) { return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? " am" : " pm"); }
	var hopts = ""; for (var hh = 0; hh < 24; hh++) hopts += '<option value="' + hh + '">' + hourLabel(hh) + "</option>"; $("wi-wake").innerHTML = hopts; $("wi-sleep").innerHTML = hopts;
	function fill(except) { var kg = WI.num(st.kg); if (except !== "kg") $("wi-kg").value = kg > 0 ? WI.trim(kg, 2) : ""; if (except !== "lb") $("wi-lb").value = kg > 0 ? WI.trim(WI.kgToLb(kg), 1) : ""; }
	function syncAll() {
		fill(); $("wi-ex").value = st.ex; $("wi-cl").value = st.cl; $("wi-stt").value = st.stt; $("wi-wake").value = st.wake; $("wi-sleep").value = st.sleep; $("wi-stbox").hidden = st.sex !== "f";
		[].forEach.call($("wi-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); }); [].forEach.call($("wi-du").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.du)); });
	}
	$("wi-kg").addEventListener("input", function () { var v = WI.num(this.value); st.kg = v > 0 ? String(v) : ""; fill("kg"); save(); update(); });
	$("wi-lb").addEventListener("input", function () { var v = WI.num(this.value); st.kg = v > 0 ? String(Math.round(WI.lbToKg(v) * 1000) / 1000) : ""; fill("lb"); save(); update(); });
	$("wi-ex").addEventListener("input", function () { st.ex = +this.value; save(); update(); }); $("wi-cl").addEventListener("change", function () { st.cl = this.value; save(); update(); }); $("wi-stt").addEventListener("change", function () { st.stt = this.value; save(); update(); });
	$("wi-wake").addEventListener("change", function () { st.wake = +this.value; save(); update(); }); $("wi-sleep").addEventListener("change", function () { st.sleep = +this.value; save(); update(); });
	$("wi-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); syncAll(); update(); });
	$("wi-du").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.du = b.dataset.u; save(); syncAll(); update(); });
	$("wi-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("wi-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var log = st.log, du = st.du, wk = st.wake, sl = st.sleep; st = clean(Object.assign({}, EXAMPLES[+b.dataset.i][1], { du: du, wake: wk, sleep: sl })); st.log = log; save(); syncAll(); update(); });

	/* ---------- result ---------- */
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	function update() {
		var kg = WI.num(st.kg), P = { kg: kg, sex: st.sex, exMin: st.ex, climate: st.cl, status: st.stt }, N = WI.need(P), ok = !!N && !!st.sex;
		$("wi-exo").textContent = st.ex === 0 ? "none" : st.ex + " min"; $("wi-stbox").hidden = st.sex !== "f";
		$("wi-empty").hidden = ok; $("wi-out").hidden = !ok; cur = null; if (!ok) return; cur = { N: N, goal: Math.round(N.total / 50) * 50 };
		$("wi-hero").innerHTML = stat("Daily water target", st.du === "oz" ? WI.trim(WI.mlToOz(cur.goal), 0) + " <small>fl oz</small>" : WI.trim(cur.goal / 1000, 2) + " <small>L</small>", amtBoth(cur.goal).replace(/^.*\(/, "").replace(/\)$/, "") + " &middot; about " + WI.trim(cur.goal / 250, 0) + " glasses of 250 ml", "tu-stat--hero") +
			stat("Reasonable range", amt(Math.round(N.low / 50) * 50) + " &ndash; " + amt(Math.round(N.high / 50) * 50), "needs vary day to day") + stat("Per waking hour", amt(Math.round(cur.goal / Math.max(1, wakingHours()) / 10) * 10, true), wakingHours() + " hours awake") + stat("Bottles", WI.trim(cur.goal / 500, 1) + " &times; 500 ml", WI.trim(cur.goal / 1000, 1) + " &times; 1 L");
		$("wi-verdict").innerHTML = "Aim for about <b>" + amtBoth(cur.goal) + "</b> of drinks a day (any fluid counts, plus the water in food on top). Spread it out rather than drinking it all at once." + (st.ex ? " That includes " + amt(N.exercise) + " for " + st.ex + " minutes of exercise." : "") + '<br><small class="wi-small">An estimate for healthy adults, not medical advice. Check with a doctor if you have a kidney, heart or liver condition.</small>';
		var parts = [["Everyday need (" + WI.ML_PER_KG + " ml per kg)", N.base], ["Exercise (" + st.ex + " min)", N.exercise], ["Heat and humidity", N.climate], [st.stt === "bf" ? "Breastfeeding" : "Pregnancy", N.status]].filter(function (p) { return p[1] > 0; });
		$("wi-split").innerHTML = parts.map(function (p, i) { var w = p[1] / N.total * 100; return '<span class="wi-seg wi-c' + i + '" style="width:' + w + '%" title="' + esc(p[0]) + '">' + (w >= 10 ? Math.round(w) + "%" : "") + "</span>"; }).join("");
		$("wi-splitleg").innerHTML = parts.map(function (p, i) { return '<li><i class="wi-c' + i + '"></i><span>' + esc(p[0]) + "</span><b>" + amt(p[1]) + "</b></li>"; }).join("");
		tracker(); drawHistory(); schedule();
	}
	function wakingHours() { var n = 0; for (var t = st.wake; t !== st.sleep && n < 24; t = (t + 1) % 24) n++; return n || 16; }
	/* ---------- tracker ---------- */
	var ADDS = [250, 500, 750];
	function addButtons() { var a = st.du === "oz" ? [["+ 8 fl oz", 236.6], ["+ 16 fl oz", 473.2], ["+ 24 fl oz", 709.8]] : ADDS.map(function (v) { return ["+ " + v + " ml", v]; }); $("wi-add").innerHTML = a.map(function (x) { return '<button type="button" class="tu-btn tu-btn--ghost" data-ml="' + x[1] + '">' + x[0] + "</button>"; }).join(""); }
	function tracker() {
		addButtons(); var day = today(), tot = WI.dayTotal(st.log, day), goal = cur.goal, p = Math.min(1, tot / goal), C = 2 * Math.PI * 16;
		$("wi-ring").innerHTML = '<svg viewBox="0 0 42 42" role="presentation"><circle class="wi-trk" cx="21" cy="21" r="16"/><circle class="wi-prog" cx="21" cy="21" r="16" transform="rotate(-90 21 21)" stroke-dasharray="' + (C * p) + " " + C + '"/><text class="wi-big" x="21" y="22" text-anchor="middle">' + Math.round(tot / goal * 100) + '%</text><text class="wi-sm" x="21" y="27.5" text-anchor="middle">' + esc(amt(tot, true)) + " of " + esc(amt(goal, true)) + "</text></svg>";
		$("wi-ring").setAttribute("aria-label", "Today " + amt(tot) + " of " + amt(goal));
		var s = WI.streak(st.log, goal, day), left = Math.max(0, goal - tot); $("wi-streak").textContent = (tot >= goal ? "Target reached today. " : amt(left) + " to go today. ") + (s > 0 ? s + (s === 1 ? " day" : " days") + " in a row." : "");
	}
	function addMl(ml) { var d = today(); (st.log[d] = st.log[d] || []).push(Math.round(ml)); save(); if (cur) { tracker(); drawHistory(); } }
	$("wi-add").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) addMl(+b.dataset.ml); });
	$("wi-custadd").onclick = function () { var v = WI.num($("wi-cust").value); if (!(v > 0)) { toast("Type an amount"); return; } addMl(st.du === "oz" ? WI.ozToMl(v) : v); $("wi-cust").value = ""; };
	$("wi-cust").addEventListener("keydown", function (e) { if (e.key === "Enter") $("wi-custadd").onclick(); });
	$("wi-undo").onclick = function () { var d = today(); if (st.log[d] && st.log[d].length) { st.log[d].pop(); if (!st.log[d].length) delete st.log[d]; save(); tracker(); drawHistory(); } };
	$("wi-reset").onclick = function () { var d = today(); if (st.log[d]) { var snap = st.log[d]; delete st.log[d]; save(); tracker(); drawHistory(); toast("Today cleared"); } };
	function drawHistory() {
		var days = WI.lastDays(today(), 14), goal = cur.goal, W = 640, H = 200, L = 40, R = 10, T = 12, B = 28, vals = days.map(function (d) { return WI.dayTotal(st.log, d); }), mx = Math.max(goal * 1.25, Math.max.apply(null, vals)), bw = (W - L - R) / days.length;
		var Y = function (v) { return T + (mx - v) / mx * (H - T - B); }, s = "", step = mx > 6000 ? 2000 : mx > 3000 ? 1000 : 500;
		for (var g = 0; g <= mx; g += step) s += '<line class="wi-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="wi-ct" x="' + (L - 5) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + (st.du === "oz" ? Math.round(WI.mlToOz(g)) : g / 1000 + "L") + "</text>";
		days.forEach(function (d, i) { var v = vals[i], x = L + i * bw + bw * 0.15, h = Y(0) - Y(v); s += '<rect class="wi-bar' + (v >= goal ? " is-hit" : "") + (i === days.length - 1 ? " is-today" : "") + '" x="' + x + '" y="' + Y(v) + '" width="' + bw * 0.7 + '" height="' + Math.max(0, h) + '" rx="3"><title>' + d + ": " + amt(v) + "</title></rect>"; if (i % 2 === (days.length - 1) % 2) s += '<text class="wi-ct" x="' + (x + bw * 0.35) + '" y="' + (H - 10) + '" text-anchor="middle">' + d.slice(8) + "</text>"; });
		s += '<line class="wi-goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(goal) + '" y2="' + Y(goal) + '"/>';
		$("wi-hist").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	function schedule() {
		var sc = WI.schedule(cur.goal, st.wake, st.sleep), W = 640, H = 210, L = 40, R = 10, T = 12, B = 36; if (!sc.length) { $("wi-sched").innerHTML = ""; return; }
		var mx = cur.goal, bw = (W - L - R) / sc.length, mxe = Math.max.apply(null, sc.map(function (x) { return x.ml; })) * 1.3, Yb = function (v) { return T + (mxe - v) / mxe * (H - T - B); }, Yc = function (v) { return T + (mx - v) / mx * (H - T - B); }, s = "";
		sc.forEach(function (x, i) { var xx = L + i * bw + bw * 0.12; s += '<rect class="wi-bar" x="' + xx + '" y="' + Yb(x.ml) + '" width="' + bw * 0.76 + '" height="' + (Yb(0) - Yb(x.ml)) + '" rx="3"><title>' + hourLabel(x.hour) + ": " + amt(x.ml) + ", total " + amt(x.cum) + "</title></rect>"; if (sc.length <= 14 || i % 2 === 0) s += '<text class="wi-ct" x="' + (xx + bw * 0.38) + '" y="' + (H - 18) + '" text-anchor="middle">' + hourLabel(x.hour).replace(" ", "") + "</text>"; });
		s += '<polyline class="wi-cum" points="' + sc.map(function (x, i) { return (L + i * bw + bw / 2) + "," + Yc(x.cum); }).join(" ") + '"/>';
		s += '<text class="wi-ct" x="' + (L - 5) + '" y="' + (T + 8) + '" text-anchor="end">' + (st.du === "oz" ? Math.round(WI.mlToOz(mx)) : WI.trim(mx / 1000, 1) + "L") + '</text><text class="wi-ct" x="' + (W - R) + '" y="' + (H - 2) + '" text-anchor="end">bars = each hour, line = running total</text>';
		$("wi-sched").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
		$("wi-schednote").textContent = "About " + amt(sc[0].ml) + " every hour from " + hourLabel(st.wake) + " to " + hourLabel(st.sleep) + ". Front-load a glass after waking and stop a couple of hours before bed if night trips bother you.";
	}
	$("wi-link").onclick = function () { if (cur) copy(location.origin + "/water-intake-calculator?sex=" + st.sex + "&kg=" + WI.trim(WI.num(st.kg), 2) + "&ex=" + st.ex + "&cl=" + st.cl + (st.sex === "f" && st.stt !== "none" ? "&stt=" + st.stt : ""), "Link copied"); };
	$("wi-print").onclick = function () { window.print(); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); update();
})();
