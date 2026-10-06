/* MES Clock -- pure helpers (no DOM). Browser global `CK`; node: require('./tool_apps_src/clock/lib.js'); tests: node tool_apps_src/clock-tests.js */
(function (root) {
	"use strict";
	var FMT = {};
	function fmt(tz) {
		if (!FMT[tz]) FMT[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
		return FMT[tz];
	}
	function valid(tz) { try { fmt(tz); return true; } catch (e) { return false; } }
	var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	// wall-clock parts of `date` in time zone `tz` ("" / null = the browser's own zone)
	function partsIn(date, tz) {
		var o = {}, ms = ((date.getTime() % 1000) + 1000) % 1000;
		var f = tz ? fmt(tz) : fmt(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
		f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
		var h = +o.hour; if (h === 24) h = 0;
		return { y: +o.year, mo: +o.month, d: +o.day, h: h, m: +o.minute, s: +o.second, ms: ms, wd: WD[o.weekday] };
	}
	// UTC offset in minutes (east positive), from the wall clock vs the real instant
	function offsetMin(date, tz) {
		var p = partsIn(date, tz), asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m, p.s);
		return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
	}
	function offsetLabel(min) { var sign = min < 0 ? "-" : "+", a = Math.abs(min), h = Math.floor(a / 60), m = a % 60; return "UTC" + sign + h + (m ? ":" + (m < 10 ? "0" : "") + m : ""); }
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	// "3:45:07 PM" / "15:45:07" / "3:45 PM"
	function timeText(p, h12, sec) {
		var h = p.h, suffix = "";
		if (h12) { suffix = h >= 12 ? " PM" : " AM"; h = h % 12; if (h === 0) h = 12; }
		return (h12 ? h : pad(h)) + ":" + pad(p.m) + (sec ? ":" + pad(p.s) : "") + suffix;
	}
	function angles(p, smooth) {
		var s = p.s + (smooth ? p.ms / 1000 : 0), m = p.m + s / 60, h = (p.h % 12) + m / 60;
		return { hour: h * 30, min: m * 6, sec: s * 6 };
	}
	function dayOfYear(y, mo, d) { return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 86400000); }
	function isoWeek(y, mo, d) {
		var t = new Date(Date.UTC(y, mo - 1, d)), dow = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dow);
		return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
	}
	function city(tz) { return String(tz || "").split("/").pop().replace(/_/g, " "); }
	// "3 h ahead of", "5 h 30 min behind", "same time as"
	function diffText(minOther, minMain) {
		var d = minOther - minMain; if (d === 0) return "same time as";
		var a = Math.abs(d), h = Math.floor(a / 60), m = a % 60, s = (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
		return s + (d > 0 ? " ahead of" : " behind");
	}
	function isDay(p) { return p.h >= 6 && p.h < 18; }
	var POPULAR = ["America/Vancouver", "America/Los_Angeles", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Africa/Cairo", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
	var CK = { valid: valid, partsIn: partsIn, offsetMin: offsetMin, offsetLabel: offsetLabel, timeText: timeText, angles: angles, dayOfYear: dayOfYear, isoWeek: isoWeek, city: city, diffText: diffText, isDay: isDay, pad: pad, POPULAR: POPULAR };
	if (typeof module !== "undefined" && module.exports) module.exports = CK; else root.CK = CK;
})(typeof window !== "undefined" ? window : globalThis);
