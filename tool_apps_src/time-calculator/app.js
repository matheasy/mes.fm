/* MES Time Calculator -- mes.fm/time-calculator (UI; maths in lib.js, global TC). Time boxes are <input type="time"> upgraded by
 * /main_js/time-input.js (12 h / 24 h switch shared site-wide via localStorage "mes-time24").
 * State: localStorage "mes-time-calculator:v1" = { tab, b: {s, e, brk, sd, ed, full}, a: {t, op, d}, d: {a, op, b}, list, cv, cvu,
 *   sheet: {rows: [{day, in, out, brk}], rate, cur, round, dot, doth, wot, woth, mult} }.
 * Links: ?tab=between&s=09:00&e=17:30&brk=30 (+ &sd=&ed=) · ?tab=add&t=22:30&op=-&d=3h45m · ?tab=convert&v=7.75
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tc");
	if (!root || !window.TC) return;
	var KEY = "mes-time-calculator:v1", DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function h24() { try { var v = localStorage.getItem("mes-time24"); if (v === "1") return true; if (v === "0") return false; } catch (e) {} try { return new Intl.DateTimeFormat(navigator.language, { hour: "numeric" }).resolvedOptions().hour12 !== true; } catch (e) { return false; } }
	function toast(msg) { var t = $("tc-toast"); if (!t) { t = document.createElement("div"); t.id = "tc-toast"; t.className = "tu-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function stat(l, v, s, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + (s || "") + "</div></div>"; }
	function str(v, n) { return String(v == null ? "" : v).slice(0, n || 40); }
	function isHM(v) { return /^\d{2}:\d{2}(:\d{2})?$/.test(v || ""); }
	function isDate(v) { return TC.dayNum(v) != null; }
	function weekRows() { return DAYS.map(function (d) { return { day: d, in: "", out: "", brk: "" }; }); }

	var S = { tab: "between", b: { s: "", e: "", brk: "", sd: "", ed: "", full: false }, a: { t: "", op: "+", d: "" }, d: { a: "", op: "+", b: "" }, list: "", cv: "", cvu: "h",
		sheet: { rows: weekRows(), rate: "", cur: "", round: "0", dot: false, doth: "8", wot: false, woth: "40", mult: "1.5" } };
	function clean(s) {
		var o = JSON.parse(JSON.stringify(S));
		if (!s || typeof s !== "object") return o;
		if (["between", "add", "sheet", "convert"].indexOf(s.tab) >= 0) o.tab = s.tab;
		if (s.b) { o.b.s = isHM(s.b.s) ? s.b.s : ""; o.b.e = isHM(s.b.e) ? s.b.e : ""; o.b.brk = str(s.b.brk); o.b.sd = isDate(s.b.sd) ? s.b.sd : ""; o.b.ed = isDate(s.b.ed) ? s.b.ed : ""; o.b.full = !!s.b.full; }
		if (s.a) { o.a.t = isHM(s.a.t) ? s.a.t : ""; o.a.op = s.a.op === "-" ? "-" : "+"; o.a.d = str(s.a.d); }
		if (s.d) { o.d.a = str(s.d.a); o.d.op = ["+", "-", "*", "/"].indexOf(s.d.op) >= 0 ? s.d.op : "+"; o.d.b = str(s.d.b); }
		o.list = str(s.list, 4000); o.cv = str(s.cv); o.cvu = ["h", "m", "s"].indexOf(s.cvu) >= 0 ? s.cvu : "h";
		var sh = s.sheet;
		if (sh && Array.isArray(sh.rows)) {
			o.sheet.rows = sh.rows.slice(0, 31).map(function (r) { return { day: str(r && r.day, 20), in: isHM(r && r.in) ? r.in : "", out: isHM(r && r.out) ? r.out : "", brk: str(r && r.brk, 12) }; });
			if (!o.sheet.rows.length) o.sheet.rows = weekRows();
			["rate", "cur", "doth", "woth", "mult"].forEach(function (k) { if (sh[k] != null) o.sheet[k] = str(sh[k], 10); });
			o.sheet.round = ["0", "5", "6", "15"].indexOf(String(sh.round)) >= 0 ? String(sh.round) : "0";
			o.sheet.dot = !!sh.dot; o.sheet.wot = !!sh.wot;
		}
		return o;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) S = clean(s); } catch (e) {} }
	var saveT;
	function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 150); }
	load();
	(function fromUrl() {
		var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
		if (!q.toString()) return;
		var t = q.get("tab"); if (["between", "add", "sheet", "convert"].indexOf(t) >= 0) S.tab = t;
		function hm(v) { var c = TC.parseClock(v); return c == null ? "" : TC.hhmm(c) + (c % 60 ? ":" + ("0" + c % 60).slice(-2) : ""); }
		if (q.has("s") || q.has("e")) { S.b.s = hm(q.get("s")); S.b.e = hm(q.get("e")); S.b.brk = str(q.get("brk")); S.b.sd = isDate(q.get("sd")) ? q.get("sd") : ""; S.b.ed = isDate(q.get("ed")) ? q.get("ed") : ""; S.b.full = q.get("full") === "1"; if (!t) S.tab = "between"; }
		if (q.has("t")) { S.a.t = hm(q.get("t")); S.a.op = q.get("op") === "-" ? "-" : "+"; S.a.d = str(q.get("d")); if (!t) S.tab = "add"; }
		if (q.has("v")) { S.cv = str(q.get("v")); if (["h", "m", "s"].indexOf(q.get("u")) >= 0) S.cvu = q.get("u"); if (!t) S.tab = "convert"; }
		try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
	})();

	/* ---------- tabs ---------- */
	var tabs = [].slice.call($("tc-tabs").children);
	function showTab(id, focus) {
		S.tab = id; save();
		tabs.forEach(function (b) { var on = b.dataset.tab === id; b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		["between", "add", "sheet", "convert"].forEach(function (k) { $("tc-p-" + k).hidden = k !== id; });
	}
	$("tc-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });
	$("tc-tabs").addEventListener("keydown", function (e) {
		var i = tabs.findIndex(function (b) { return b.dataset.tab === S.tab; }), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
		if (!d) return; e.preventDefault(); showTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true);
	});

	function clockSec(v) { if (!isHM(v)) return null; var p = v.split(":"); return +p[0] * 3600 + +p[1] * 60 + (p[2] ? +p[2] : 0); }
	function fmtClock(sec, withSec) { return TC.clock(sec, h24(), withSec); }

	/* ---------- between ---------- */
	var lastB = null;
	function renderBetween() {
		var s = clockSec(S.b.s), e = clockSec(S.b.e), brkTxt = S.b.brk.trim(), brk = brkTxt ? TC.parseDuration(brkTxt, "m") : 0;
		$("tc-bb").classList.toggle("tc-bad", brkTxt !== "" && (brk == null || brk < 0));
		var out = $("tc-bout"), sent = $("tc-bsent");
		lastB = null;
		if (s == null || e == null) { out.innerHTML = stat("Result", "&ndash;", "Enter a start and an end time.", true); sent.textContent = ""; return; }
		if (brk == null || brk < 0) brk = 0;
		var r = TC.between(s, e, { breakSec: brk, startDate: S.b.sd ? TC.dayNum(S.b.sd) : null, endDate: S.b.ed ? TC.dayNum(S.b.ed) : null, fullDay: S.b.full });
		if (r.error) {
			out.innerHTML = stat("Result", "&ndash;", r.error === "before" ? "The end is before the start. Check the dates." : "The break is longer than the time between them.", true);
			sent.textContent = ""; return;
		}
		lastB = r;
		var dec = TC.decimalHours(r.sec, 2), mins = r.sec / 60;
		out.innerHTML = stat("Hours and minutes", TC.hms(r.sec, false), TC.words(r.sec), true) +
			stat("Decimal hours", TC.fixed(r.sec / 3600, 2), "= " + TC.trim(r.sec / 3600, 4) + " h") +
			stat("Minutes", TC.fixed(mins, mins % 1 ? 1 : 0), TC.fixed(r.sec, 0) + " seconds") +
			(brk ? stat("Before the break", TC.hms(r.gross, false), "break " + TC.words(brk)) : "");
		var dates = S.b.sd || S.b.ed;
		sent.textContent = "From " + fmtClock(s) + (dates ? " on " + (S.b.sd || S.b.ed) : "") + " to " + fmtClock(e) + (dates ? " on " + (S.b.ed || S.b.sd) : r.overnight ? " the next day" : "") +
			" is " + TC.words(r.gross) + (brk ? "; minus a " + TC.words(brk) + " break that leaves " + TC.words(r.sec) : "") + " (" + TC.fixed(dec, 2) + " decimal hours).";
	}
	function bindTime(id, get, set) {
		var el = $(id); el.value = get();
		el.addEventListener("input", function () { set(el.value); save(); render(); });
		el.addEventListener("change", function () { set(el.value); save(); render(); });
	}
	bindTime("tc-bs", function () { return S.b.s; }, function (v) { S.b.s = v; });
	bindTime("tc-be", function () { return S.b.e; }, function (v) { S.b.e = v; });
	bindTime("tc-bsd", function () { return S.b.sd; }, function (v) { S.b.sd = isDate(v) ? v : ""; });
	bindTime("tc-bed", function () { return S.b.ed; }, function (v) { S.b.ed = isDate(v) ? v : ""; });
	$("tc-bb").value = S.b.brk; $("tc-bb").addEventListener("input", function () { S.b.brk = this.value; save(); render(); });
	$("tc-bfull").checked = S.b.full; $("tc-bfull").addEventListener("change", function () { S.b.full = this.checked; save(); render(); });
	if (S.b.sd || S.b.ed) $("tc-bdates").open = true;
	$("tc-bclr").addEventListener("click", function () { S.b.sd = S.b.ed = ""; $("tc-bsd").value = ""; $("tc-bed").value = ""; save(); render(); });
	var BEX = [["9 to 5:30, 30 min lunch", "09:00", "17:30", "30"], ["Night shift 10 PM to 6:30 AM", "22:00", "06:30", "30"], ["7:15 to 3:45", "07:15", "15:45", ""], ["12-hour shift", "07:00", "19:00", "1h"]];
	$("tc-bex").innerHTML = BEX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("tc-bex").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var x = BEX[+b.dataset.i];
		S.b.s = x[1]; S.b.e = x[2]; S.b.brk = x[3]; S.b.sd = S.b.ed = "";
		$("tc-bs").value = x[1]; $("tc-be").value = x[2]; $("tc-bb").value = x[3]; $("tc-bsd").value = ""; $("tc-bed").value = ""; save(); render();
	});
	function baseUrl() { return location.origin + location.pathname; }
	$("tc-blink").addEventListener("click", function () {
		var q = new URLSearchParams(); q.set("tab", "between"); if (S.b.s) q.set("s", S.b.s); if (S.b.e) q.set("e", S.b.e); if (S.b.brk.trim()) q.set("brk", S.b.brk.trim());
		if (S.b.sd) q.set("sd", S.b.sd); if (S.b.ed) q.set("ed", S.b.ed); if (S.b.full) q.set("full", "1");
		copy(baseUrl() + "?" + q.toString(), "Link copied");
	});
	$("tc-bcopy").addEventListener("click", function () { var t = $("tc-bsent").textContent; if (t) copy(t, "Result copied"); else toast("Enter two times first"); });
	$("tc-bsheet").addEventListener("click", function () {
		if (!S.b.s || !S.b.e) { toast("Enter two times first"); return; }
		var rows = S.sheet.rows, i = rows.findIndex(function (r) { return !r.in && !r.out; });
		var row = { day: i >= 0 ? rows[i].day : "Day " + (rows.length + 1), in: S.b.s.slice(0, 5), out: S.b.e.slice(0, 5), brk: S.b.brk.trim() };
		if (i >= 0) rows[i] = row; else if (rows.length < 31) rows.push(row); else { toast("The timesheet is full (31 rows)"); return; }
		save(); buildRows(); showTab("sheet"); toast("Added to " + row.day);
	});

	/* ---------- add / subtract ---------- */
	function renderAdd() {
		var t = clockSec(S.a.t), dt = S.a.d.trim(), d = dt ? TC.parseDuration(dt, "h") : null, out = $("tc-aout");
		$("tc-ad").classList.toggle("tc-bad", dt !== "" && d == null);
		if (t == null || d == null) { out.innerHTML = stat("Result", "&ndash;", "Enter a time and a duration.", true); }
		else {
			var r = TC.addClock(t, S.a.op === "-" ? -d : d), ws = (t % 60) || (r.clock % 60);
			var dayTxt = r.days === 0 ? "the same day" : r.days === 1 ? "the next day" : r.days === -1 ? "the day before" : r.days > 0 ? r.days + " days later" : -r.days + " days earlier";
			out.innerHTML = stat("Result", fmtClock(r.clock, !!ws), dayTxt, true) + stat("24-hour", TC.clock(r.clock, true, !!ws), fmtClock(t, !!ws) + " " + (S.a.op === "-" ? "&minus; " : "+ ") + esc(TC.words(d)));
		}
		// duration op duration
		var a = TC.parseDuration(S.d.a, "h"), op = S.d.op, mul = op === "*" || op === "/", b = mul ? TC.num(S.d.b) : TC.parseDuration(S.d.b, "h");
		$("tc-d2l").textContent = mul ? "Number" : "Second duration"; $("tc-d2").placeholder = mul ? "e.g. 3" : "e.g. 1:20:45";
		$("tc-d1").classList.toggle("tc-bad", S.d.a.trim() !== "" && a == null);
		$("tc-d2").classList.toggle("tc-bad", S.d.b.trim() !== "" && (b == null || isNaN(b)));
		var o2 = $("tc-dout");
		if (a == null || b == null || isNaN(b)) o2.innerHTML = stat("Result", "&ndash;", mul ? "Enter a duration and a number." : "Enter two durations.", true);
		else if (op === "/" && b === 0) o2.innerHTML = stat("Result", "&ndash;", "Cannot divide by zero.", true);
		else {
			var r2 = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
			o2.innerHTML = stat("Result", TC.hms(r2, true), TC.words(r2), true) + stat("Decimal hours", TC.fixed(r2 / 3600, 4).replace(/\.?0+$/, "") || "0", TC.fixed(r2 / 60, 2).replace(/\.00$/, "") + " minutes") +
				(op === "/" && TC.parseDuration(S.d.b, "h") != null && /[:a-z]/i.test(S.d.b) ? stat("Times it fits", TC.trim(a / TC.parseDuration(S.d.b, "h"), 4), "first &divide; second as durations") : "");
		}
		// list
		var lines = S.list.split(/\n/), tot = 0, used = 0, badL = [];
		lines.forEach(function (ln, i) { var t2 = ln.trim(); if (!t2) return; var v = TC.parseDuration(t2, "h"); if (v == null) badL.push(i + 1); else { tot += v; used++; } });
		$("tc-lout").innerHTML = used ? stat("Total", TC.hms(tot, true), TC.words(tot), true) + stat("Decimal hours", TC.fixed(tot / 3600, 2), used + (used === 1 ? " line" : " lines")) + stat("Average", TC.hms(tot / used, true), "per line") : "";
		$("tc-lnote").textContent = badL.length ? "Not read: line " + badL.join(", ") + ". Use forms like 1:30, 45 min or 1h 30m." : "";
	}
	bindTime("tc-at", function () { return S.a.t; }, function (v) { S.a.t = v; });
	$("tc-ad").value = S.a.d; $("tc-ad").addEventListener("input", function () { S.a.d = this.value; save(); render(); });
	function syncOp() { [].forEach.call($("tc-aop").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.op === S.a.op)); }); }
	syncOp(); $("tc-aop").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.a.op = b.dataset.op; syncOp(); save(); render(); });
	var AEX = [["Now + 8h 30m", null, "+", "8h 30m"], ["22:30 + 3h 45m", "22:30", "+", "3h 45m"], ["09:00 − 90 min", "09:00", "-", "90 min"]];
	$("tc-aex").innerHTML = AEX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("tc-aex").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var x = AEX[+b.dataset.i], now = new Date();
		S.a.t = x[1] || TC.hhmm(now.getHours() * 3600 + now.getMinutes() * 60); S.a.op = x[2]; S.a.d = x[3];
		$("tc-at").value = S.a.t; $("tc-ad").value = S.a.d; syncOp(); save(); render();
	});
	[["tc-d1", "a"], ["tc-d2", "b"]].forEach(function (p) { $(p[0]).value = S.d[p[1]]; $(p[0]).addEventListener("input", function () { S.d[p[1]] = this.value; save(); render(); }); });
	$("tc-dop").value = S.d.op; $("tc-dop").addEventListener("change", function () { S.d.op = this.value; save(); render(); });
	$("tc-list").value = S.list; $("tc-list").addEventListener("input", function () { S.list = this.value; save(); render(); });

	/* ---------- timesheet ---------- */
	var tbody = $("tc-rows");
	function enhance(el) {
		if (!(window.MESTime && MESTime.enhance)) return;
		MESTime.enhance(el);
		var vis = el.parentNode && el.parentNode.querySelector(".mes-time__in");
		if (vis) { vis.setAttribute("aria-label", el.getAttribute("aria-label") || ""); vis.placeholder = el.classList.contains("tc-in") ? "In" : "Out"; }
	}
	function rowHtml(r, i) {
		return '<tr data-i="' + i + '"><td><input class="tu-input tc-day" type="text" maxlength="20" value="' + esc(r.day) + '" aria-label="Day ' + (i + 1) + '"></td>' +
			'<td class="tc-tcell"><input class="tu-input tc-in" type="time" value="' + esc(r.in) + '" aria-label="' + esc(r.day || "Row " + (i + 1)) + ' in"></td>' +
			'<td class="tc-tcell"><input class="tu-input tc-out" type="time" value="' + esc(r.out) + '" aria-label="' + esc(r.day || "Row " + (i + 1)) + ' out"></td>' +
			'<td><input class="tu-input tc-brk" type="text" maxlength="12" inputmode="text" placeholder="min" value="' + esc(r.brk) + '" aria-label="' + esc(r.day || "Row " + (i + 1)) + ' break"></td>' +
			'<td class="tc-hrs" aria-live="polite"></td><td><button type="button" class="tc-del" aria-label="Remove ' + esc(r.day || "row " + (i + 1)) + '">&times;</button></td></tr>';
	}
	function buildRows() {
		tbody.innerHTML = S.sheet.rows.map(rowHtml).join("");
		[].forEach.call(tbody.querySelectorAll('input[type="time"]'), enhance);
		renderSheet();
	}
	tbody.addEventListener("input", function (e) {
		var tr = e.target.closest("tr"); if (!tr) return; var r = S.sheet.rows[+tr.dataset.i]; if (!r) return;
		var c = e.target.classList, isT = e.target.type === "time";
		if (c.contains("tc-day")) r.day = e.target.value; else if (c.contains("tc-in") && isT) r.in = e.target.value; else if (c.contains("tc-out") && isT) r.out = e.target.value; else if (c.contains("tc-brk")) r.brk = e.target.value; else return;
		save(); renderSheet();
	});
	tbody.addEventListener("click", function (e) {
		var b = e.target.closest(".tc-del"); if (!b) return; var i = +b.closest("tr").dataset.i;
		S.sheet.rows.splice(i, 1); if (!S.sheet.rows.length) S.sheet.rows = weekRows(); save(); buildRows();
		var nb = tbody.querySelectorAll(".tc-del")[Math.min(i, S.sheet.rows.length - 1)]; if (nb) nb.focus();
	});
	$("tc-addrow").addEventListener("click", function () {
		if (S.sheet.rows.length >= 31) { toast("31 rows at most"); return; }
		var n = S.sheet.rows.length, prev = S.sheet.rows[n - 1], day = "Day " + (n + 1), k = prev ? DAYS.indexOf(prev.day) : -1;
		if (k >= 0) day = DAYS[(k + 1) % 7];
		S.sheet.rows.push({ day: day, in: "", out: "", brk: "" }); save(); buildRows();
		var last = tbody.querySelector("tr:last-child .tc-day"); if (last) last.focus();
	});
	$("tc-fill").addEventListener("click", function () {
		var src = S.sheet.rows.find(function (r) { return r.in && r.out; });
		if (!src) { toast("Fill in one day first"); return; }
		var n = 0; S.sheet.rows.forEach(function (r) { if (!r.in && !r.out && /^(Mon|Tue|Wed|Thu|Fri)/i.test(r.day)) { r.in = src.in; r.out = src.out; r.brk = src.brk; n++; } });
		save(); buildRows(); toast(n ? "Copied to " + n + (n === 1 ? " weekday" : " weekdays") : "No empty weekdays");
	});
	$("tc-clear").addEventListener("click", function () {
		var old = JSON.stringify(S.sheet.rows); S.sheet.rows.forEach(function (r) { r.in = r.out = r.brk = ""; }); save(); buildRows();
		undoToast("Times cleared", function () { S.sheet.rows = JSON.parse(old); save(); buildRows(); });
	});
	$("tc-week").addEventListener("click", function () {
		var old = JSON.stringify(S.sheet.rows); S.sheet.rows = weekRows(); save(); buildRows();
		undoToast("Reset to Mon-Sun", function () { S.sheet.rows = JSON.parse(old); save(); buildRows(); });
	});
	function undoToast(msg, fn) {
		toast(msg); var t = $("tc-toast"), b = document.createElement("button"); b.type = "button"; b.className = "tc-undo"; b.textContent = "Undo";
		b.addEventListener("click", function () { fn(); t.classList.remove("tu-toast--show"); });
		t.appendChild(document.createTextNode(" ")); t.appendChild(b); t.style.pointerEvents = "auto"; clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); t.style.pointerEvents = ""; }, 6000);
	}
	var sh = S.sheet;
	[["tc-rate", "rate"], ["tc-cur", "cur"], ["tc-doth", "doth"], ["tc-woth", "woth"], ["tc-mult", "mult"]].forEach(function (p) { $(p[0]).value = sh[p[1]]; $(p[0]).addEventListener("input", function () { S.sheet[p[1]] = this.value; save(); renderSheet(); }); });
	$("tc-round").value = sh.round; $("tc-round").addEventListener("change", function () { S.sheet.round = this.value; save(); renderSheet(); });
	$("tc-dot").checked = sh.dot; $("tc-dot").addEventListener("change", function () { S.sheet.dot = this.checked; save(); renderSheet(); });
	$("tc-wot").checked = sh.wot; $("tc-wot").addEventListener("change", function () { S.sheet.wot = this.checked; save(); renderSheet(); });
	var lastSheet = null;
	function money(x) { var c = (S.sheet.cur || "").trim() || "$"; return c + TC.fixed(x, 2); }
	function renderSheet() {
		var rows = S.sheet.rows.map(function (r) { var b = r.brk.trim() ? TC.parseDuration(r.brk, "m") : 0; return { in: clockSec(r.in), out: clockSec(r.out), brk: b == null || b < 0 ? 0 : b, badBrk: b == null || b < 0 }; });
		var rate = TC.num(S.sheet.rate), opt = { rate: rate > 0 ? rate : 0, round: +S.sheet.round, otMult: TC.num(S.sheet.mult) > 0 ? TC.num(S.sheet.mult) : 1.5,
			dayOT: S.sheet.dot && TC.num(S.sheet.doth) > 0 ? TC.num(S.sheet.doth) : 0, weekOT: S.sheet.wot && TC.num(S.sheet.woth) > 0 ? TC.num(S.sheet.woth) : 0 };
		var ts = TC.timesheet(rows, opt); lastSheet = ts;
		[].forEach.call(tbody.children, function (tr, i) {
			var o = ts.rows[i], cell = tr.querySelector(".tc-hrs"); if (!o || !cell) return;
			tr.querySelector(".tc-brk").classList.toggle("tc-bad", rows[i].badBrk);
			cell.innerHTML = o.empty ? '<span class="tc-dim">&ndash;</span>' : o.error ? '<span class="tc-err">' + (o.error === "need" ? "need in + out" : "break too long") + "</span>" :
				"<b>" + TC.hms(o.worked, false) + '</b><span class="tc-dim"> ' + TC.fixed(o.worked / 3600, 2) + "</span>" + (o.ot ? ' <span class="tc-ot" title="overtime">+' + TC.hms(o.ot, false) + " OT</span>" : "") + (o.overnight ? ' <span class="tc-dim" title="ends the next day">&#9790;</span>' : "");
		});
		var html = stat("Total worked", TC.hms(ts.total, false), TC.fixed(ts.total / 3600, 2) + " decimal hours &middot; " + ts.days + (ts.days === 1 ? " day" : " days"), true);
		if (opt.dayOT || opt.weekOT) html += stat("Regular", TC.hms(ts.regular, false), TC.fixed(ts.regular / 3600, 2) + " h") + stat("Overtime", TC.hms(ts.ot, false), TC.fixed(ts.ot / 3600, 2) + " h at &times;" + TC.trim(opt.otMult, 3));
		if (ts.brk) html += stat("Breaks", TC.hms(ts.brk, false), "not counted");
		if (ts.pay != null) html += stat("Pay", esc(money(ts.pay)), ts.ot ? esc(money(ts.regPay)) + " regular + " + esc(money(ts.otPay)) + " overtime" : "at " + esc(money(opt.rate)) + " an hour", true);
		$("tc-sout").innerHTML = html;
	}
	function sheetCells() {
		var ts = lastSheet, ot = S.sheet.dot || S.sheet.wot, head = ["Day", "In", "Out", "Break", "Hours", "Decimal"].concat(ot ? ["Overtime"] : []), body = [];
		S.sheet.rows.forEach(function (r, i) {
			var o = ts.rows[i]; if (!o || o.empty) return;
			body.push([r.day, r.in ? fmtClock(clockSec(r.in)) : "", r.out ? fmtClock(clockSec(r.out)) : "", r.brk, o.error ? "" : TC.hms(o.worked, false), o.error ? "" : TC.fixed(o.worked / 3600, 2)].concat(ot ? [o.ot ? TC.hms(o.ot, false) : ""] : []));
		});
		body.push(["Total", "", "", "", TC.hms(ts.total, false), TC.fixed(ts.total / 3600, 2)].concat(ot ? [TC.hms(ts.ot, false)] : []));
		if (ts.pay != null) body.push(["Pay", "", "", "", "", money(ts.pay)].concat(ot ? [""] : []));
		return { head: head, body: body };
	}
	$("tc-scopy").addEventListener("click", function () { var c = sheetCells(); copy([c.head].concat(c.body).map(function (r) { return r.join("\t"); }).join("\n"), "Copied: paste into a spreadsheet"); });
	$("tc-stext").addEventListener("click", function () {
		var c = sheetCells(), all = [c.head].concat(c.body), w = c.head.map(function (_, j) { return Math.max.apply(null, all.map(function (r) { return String(r[j]).length; })); });
		copy(all.map(function (r) { return r.map(function (x, j) { return (String(x) + "                    ").slice(0, w[j]); }).join("  ").replace(/\s+$/, ""); }).join("\n"), "Timesheet copied");
	});
	$("tc-sprint").addEventListener("click", function () { window.print(); });

	/* ---------- convert ---------- */
	function renderConvert() {
		var t = S.cv.trim(), v = t ? TC.parseDuration(t, S.cvu) : null, out = $("tc-cout");
		$("tc-cv").classList.toggle("tc-bad", t !== "" && v == null);
		if (v == null) { out.innerHTML = stat("Result", "&ndash;", "Type a time amount above.", true); return; }
		var c = TC.convert(v);
		out.innerHTML = stat("Hours : minutes : seconds", c.hms, c.words, true) + stat("Decimal hours", TC.trim(c.hours, 4), "rounded: " + TC.fixed(c.hours, 2) + " h") +
			stat("Minutes", TC.trim(c.minutes, 3), "") + stat("Seconds", TC.trim(c.seconds, 3), "") + stat("Days", TC.trim(c.days, 5), "") + stat("Weeks", TC.trim(c.days / 7, 5), "");
	}
	$("tc-cv").value = S.cv; $("tc-cv").addEventListener("input", function () { S.cv = this.value; save(); renderConvert(); });
	$("tc-cvu").value = S.cvu; $("tc-cvu").addEventListener("change", function () { S.cvu = this.value; save(); renderConvert(); });
	var CEX = ["7.75 h", "7:45", "465 min", "2.4", "1h 20m 30s", "10000 s"];
	$("tc-cex").innerHTML = CEX.map(function (x) { return '<button type="button" class="tu-chip">' + esc(x) + "</button>"; }).join("");
	$("tc-cex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.cv = b.textContent; $("tc-cv").value = S.cv; save(); renderConvert(); });
	var mt = "";
	for (var m = 5; m <= 60; m += 5) mt += '<div class="tc-gi"><b>' + m + " min</b><span>" + TC.fixed(m / 60, 2) + " h</span></div>";
	$("tc-mintab").innerHTML = mt;

	function render() { renderBetween(); renderAdd(); }
	window.addEventListener("storage", function (e) { if (e.key === "mes-time24") { render(); renderSheet(); } });
	root.addEventListener("click", function (e) { if (e.target.closest(".mes-time__sw")) setTimeout(function () { render(); renderSheet(); }, 0); });
	buildRows(); render(); renderConvert(); showTab(S.tab);
})();
