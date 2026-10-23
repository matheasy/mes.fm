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
