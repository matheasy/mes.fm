/* MES Time Calculator maths (global TC; node: require('./tool_apps_src/time-calculator/lib.js')). Pure: durations are whole or
 * fractional seconds, times of day are seconds after midnight, dates are "YYYY-MM-DD" read as plain calendar days (no time zone,
 * so a daylight-saving change is not counted: said on the page).
 */
(function (root) {
	"use strict";
	var TC = {};
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	function num(s) {
		if (typeof s === "number") return s;
		var t = String(s == null ? "" : s).trim().replace(/\s/g, "");
		if (!t) return NaN;
		if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
		t = t.replace(/,/g, "");
		return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : NaN;
	}
	TC.num = num;

	var UNIT = { d: 86400, day: 86400, days: 86400, w: 604800, wk: 604800, week: 604800, weeks: 604800,
		h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
		m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
		s: 1, sec: 1, secs: 1, second: 1, seconds: 1, ms: 0.001 };
	/* "1:30" (h:mm), "1:30:15", "1h 30m", "1h30", "90 min", "1.5 h", "2 hours and 15 minutes", "-0:45", "45s"; a bare number is read in
	 * bareUnit ("h" by default, "m" or "s" allowed). Returns seconds, or null when the text is not a duration. */
	TC.parseDuration = function (text, bareUnit) {
		var t = String(text == null ? "" : text).trim().toLowerCase();
		if (!t) return null;
		var sign = 1;
		if (/^[-−]/.test(t)) { sign = -1; t = t.replace(/^[-−]\s*/, ""); } else if (/^\+/.test(t)) t = t.slice(1).trim();
		var m = /^(\d+):([0-5]?\d)(?::([0-5]?\d(?:\.\d+)?))?$/.exec(t);
		if (m) return sign * (+m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0));
		m = /^(\d+)h(\d{1,2})$/.exec(t.replace(/\s/g, ""));  // "1h30"
		if (m && +m[2] < 60) return sign * (+m[1] * 3600 + +m[2] * 60);
		var bare = /\s/.test(t) ? NaN : num(t);
		if (!isNaN(bare)) return sign * bare * (UNIT[bareUnit || "h"] || 3600);
		var s = t.replace(/,/g, " ").replace(/\band\b/g, " ").replace(/(\d)\s+(?=[a-z])/g, "$1"), total = 0, any = false, re = /(\d+(?:\.\d+)?|\.\d+)([a-z]+)/g, x, rest = s;
		while ((x = re.exec(s))) {
			var u = UNIT[x[2]]; if (u == null) return null;
			total += parseFloat(x[1]) * u; any = true; rest = rest.replace(x[0], "");
		}
		if (!any || rest.trim()) return null;
		return sign * total;
	};
	// "18:30" / "6:30 pm" / "noon" -> seconds after midnight, or null
	TC.parseClock = function (text) {
		var t = String(text == null ? "" : text).trim().toLowerCase().replace(/\s+/g, " ");
		if (!t) return null;
		if (/^(noon|midday)$/.test(t)) return 43200;
		if (t === "midnight") return 0;
		var m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(?:[:.](\d{2}))?\s*(a|p|am|pm|a\.m\.|p\.m\.)?$/.exec(t);
		if (!m) { var c = /^(\d{3,4})\s*(a|p|am|pm)?$/.exec(t); if (c) { var q = c[1].length === 3 ? "0" + c[1] : c[1]; m = [t, q.slice(0, 2), q.slice(2), null, c[2]]; } }
		if (!m) return null;
		var h = +m[1], mi = m[2] ? +m[2] : 0, se = m[3] ? +m[3] : 0, ap = m[4] ? m[4].charAt(0) : "";
		if (mi > 59 || se > 59) return null;
		if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (ap === "p" ? 12 : 0); } else if (h > 23) return null;
		return h * 3600 + mi * 60 + se;
	};
	// "2026-10-23" -> day number (days since 1970-01-01), or null
	TC.dayNum = function (s) {
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim()); if (!m) return null;
		var ms = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(ms);
		if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
		return Math.round(ms / 86400000);
	};
	TC.dayStr = function (n) { var d = new Date(n * 86400000); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); };

	/* time between start and end (seconds of the day). With dates, the real span; without, an end before the start means the next day.
	 * breakSec is taken off. Returns {sec, gross, overnight, days, error}. */
	TC.between = function (start, end, opt) {
		opt = opt || {};
		var r = { sec: 0, gross: 0, overnight: false, days: 0, error: "" };
		if (start == null || end == null) { r.error = "need"; return r; }
		var sd = opt.startDate != null ? opt.startDate : null, ed = opt.endDate != null ? opt.endDate : null;
		var g;
		if (sd != null || ed != null) {
			if (sd == null) sd = ed; if (ed == null) ed = sd;
			g = (ed - sd) * 86400 + end - start;
			r.days = ed - sd;
			if (g < 0) { r.error = "before"; return r; }
		} else {
			g = end - start;
			if (g < 0) { g += 86400; r.overnight = true; }
			if (g === 0 && opt.fullDay) g = 86400;
		}
		r.gross = g;
		var b = Math.max(0, opt.breakSec || 0);
		if (b > g) { r.error = "break"; return r; }
		r.sec = g - b;
		return r;
	};
	// time of day + delta -> {clock (seconds of day), days (day offset, may be negative)}
	TC.addClock = function (clock, delta) {
		var t = clock + delta, days = Math.floor(t / 86400);
		return { clock: t - days * 86400, days: days };
	};

	/* formatting */
	// seconds -> "4:06:15" (withSec) or "4:06" (rounded to the minute); negative keeps a minus sign
	TC.hms = function (sec, withSec) {
		if (sec == null || isNaN(sec)) return "";
		var neg = sec < 0, a = Math.abs(sec);
		a = withSec ? Math.round(a) : Math.round(a / 60) * 60;
		var h = Math.floor(a / 3600), m = Math.floor(a % 3600 / 60), s = a % 60;
		return (neg && a ? "-" : "") + h + ":" + pad(m) + (withSec ? ":" + pad(s) : "");
	};
	// seconds -> "2 h 15 min" (words), seconds shown only when there are some
	TC.words = function (sec) {
		if (sec == null || isNaN(sec)) return "";
		var neg = sec < 0, a = Math.round(Math.abs(sec)), d = Math.floor(a / 86400), h = Math.floor(a % 86400 / 3600), m = Math.floor(a % 3600 / 60), s = a % 60, p = [];
		if (d) p.push(d + (d === 1 ? " day" : " days"));
		if (h) p.push(h + " h"); if (m) p.push(m + " min"); if (s) p.push(s + " s");
		return (neg && a ? "minus " : "") + (p.length ? p.join(" ") : "0 min");
	};
	// round half away from zero to dp decimals
	TC.round = function (x, dp) { var f = Math.pow(10, dp || 0), v = Math.round(Math.abs(x) * f + 1e-9) / f; return x < 0 ? -v : v; };
	TC.decimalHours = function (sec, dp) { return TC.round(sec / 3600, dp == null ? 2 : dp); };
	TC.fixed = function (x, dp) {
		var v = TC.round(x, dp).toFixed(dp);
		var parts = v.split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		return parts.join(".");
	};
	// trims trailing zeros: 7.50 -> "7.5"
	TC.trim = function (x, dp) { return String(TC.round(x, dp == null ? 4 : dp)); };
	// seconds of the day -> "18:05" or "6:05 PM" (+ seconds)
	TC.clock = function (sec, h24, withSec) {
		var a = Math.round(sec) % 86400; if (a < 0) a += 86400;
		var h = Math.floor(a / 3600), m = Math.floor(a % 3600 / 60), s = a % 60, ss = withSec ? ":" + pad(s) : "";
		return h24 ? pad(h) + ":" + pad(m) + ss : (h % 12 || 12) + ":" + pad(m) + ss + (h < 12 ? " AM" : " PM");
	};
	TC.hhmm = function (sec) { var a = Math.round(sec) % 86400; if (a < 0) a += 86400; return pad(Math.floor(a / 3600)) + ":" + pad(Math.floor(a % 3600 / 60)); };
	// round seconds to the nearest step (minutes); 0 = no rounding
	TC.roundTo = function (sec, stepMin) { if (!stepMin) return sec; var q = stepMin * 60; return Math.round(sec / q) * q; };

	/* convert: one value in any unit -> all forms */
	TC.convert = function (sec) {
		return { hms: TC.hms(sec, true), hm: TC.hms(sec, false), hours: sec / 3600, minutes: sec / 60, seconds: sec, days: sec / 86400, words: TC.words(sec) };
	};

	/* timesheet: rows [{in, out, brk (seconds), date?}] (in / out seconds of the day, null = empty row).
	 * opt: {dayOT: hours (0 = off), weekOT: hours (0 = off), rate, otMult (1.5), round: minutes}. Daily overtime first, then weekly
	 * overtime from the remaining regular hours over the weekly limit (counted in row order). */
	TC.timesheet = function (rows, opt) {
		opt = opt || {};
		var dayLim = opt.dayOT > 0 ? opt.dayOT * 3600 : 0, weekLim = opt.weekOT > 0 ? opt.weekOT * 3600 : 0, mult = opt.otMult > 0 ? opt.otMult : 1.5;
		var out = { rows: [], total: 0, regular: 0, ot: 0, brk: 0, days: 0, errors: 0, pay: null, regPay: null, otPay: null };
		var regRun = 0;
		rows.forEach(function (r) {
			var o = { worked: 0, regular: 0, ot: 0, overnight: false, error: "", empty: false };
			if (r.in == null && r.out == null) { o.empty = true; out.rows.push(o); return; }
			if (r.in == null || r.out == null) { o.error = "need"; out.errors++; out.rows.push(o); return; }
			var b = TC.between(r.in, r.out, { breakSec: r.brk || 0 });
			if (b.error) { o.error = b.error; out.errors++; out.rows.push(o); return; }
			var w = TC.roundTo(b.sec, opt.round || 0);
			o.worked = w; o.overnight = b.overnight;
			var reg = w, ot = 0;
			if (dayLim && reg > dayLim) { ot = reg - dayLim; reg = dayLim; }
			if (weekLim) {
				if (regRun >= weekLim) { ot += reg; reg = 0; }
				else if (regRun + reg > weekLim) { var x = regRun + reg - weekLim; ot += x; reg -= x; }
			}
			regRun += reg;
			o.regular = reg; o.ot = ot;
			out.total += w; out.regular += reg; out.ot += ot; out.brk += r.brk || 0; out.days++;
			out.rows.push(o);
		});
		if (opt.rate > 0) {
			out.regPay = TC.round(out.regular / 3600 * opt.rate, 2);
			out.otPay = TC.round(out.ot / 3600 * opt.rate * mult, 2);
			out.pay = TC.round(out.regPay + out.otPay, 2);
		}
		return out;
	};

	if (typeof module !== "undefined" && module.exports) module.exports = TC; else root.TC = TC;
})(typeof window !== "undefined" ? window : globalThis);

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
