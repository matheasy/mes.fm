/* MES Days Between Dates -- pure date maths (no DOM), prepended to app.js by build_tool_apps.py (after the calendar's holiday engine,
 * see `lib_from` in build_tool_apps.py). Also runs in node: require() it to test.
 * Everything works on "naive" wall-clock milliseconds (Date.UTC of the typed date + time), so there is no daylight-saving or
 * time-zone drift in the calendar breakdown; actual elapsed time across a DST change is reported separately. */
var DC = (function () {
	'use strict';
	var DAY = 86400000, HOUR = 3600000, MIN = 60000;
	function utcMs(y, m, d, h, mi, s) { var dt = new Date(0); dt.setUTCFullYear(y, m, d); dt.setUTCHours(h || 0, mi || 0, s || 0, 0); return dt.getTime(); }
	function parts(ms) { var dt = new Date(ms); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds(), dow: dt.getUTCDay() }; }
	function dim(y, m) { var dt = new Date(0); dt.setUTCFullYear(y, m + 1, 0); return dt.getUTCDate(); }
	function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
	function addMonths(ms, n) {                 // keeps the time of day; Jan 31 + 1 month = Feb 28/29
		var p = parts(ms), tot = p.y * 12 + p.m + n, y = Math.floor(tot / 12), m = tot - y * 12;
		return utcMs(y, m, Math.min(p.d, dim(y, m)), p.h, p.mi, p.s);
	}
	function wholeMonths(a, b) {                // most whole months that fit between a and b (a <= b)
		var pa = parts(a), pb = parts(b), M = (pb.y - pa.y) * 12 + (pb.m - pa.m);
		while (M > 0 && addMonths(a, M) > b) M--;
		while (addMonths(a, M + 1) <= b) M++;
		return M;
	}
	function parseISO(s) {                      // "2026-10-01" -> {y,m,d} or null
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim()); if (!m) return null;
		var y = +m[1], mo = +m[2] - 1, d = +m[3]; if (mo < 0 || mo > 11 || d < 1 || d > dim(y, mo)) return null;
		return { y: y, m: mo, d: d };
	}
	function parseTime(s) { var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(s || '').trim()); if (!m) return { h: 0, mi: 0, s: 0 }; return { h: Math.min(23, +m[1]), mi: Math.min(59, +m[2]), s: Math.min(59, +(m[3] || 0)) }; }
	function iso(ms) { var p = parts(ms), y = p.y; return (y < 1000 ? ('000' + y).slice(-4) : y) + '-' + ('0' + (p.m + 1)).slice(-2) + '-' + ('0' + p.d).slice(-2); }
	function dayOfYear(ms) { var p = parts(ms); return Math.round((Date.UTC(p.y, p.m, p.d) - utcMs(p.y, 0, 1)) / DAY) + 1; }
	function isoWeek(ms) {
		var p = parts(ms), day = utcMs(p.y, p.m, p.d), dn = (p.dow + 6) % 7, thu = day - dn * DAY + 3 * DAY, ty = parts(thu).y;
		return { year: ty, week: Math.ceil(((thu - utcMs(ty, 0, 1)) / DAY + 1) / 7) };
	}

	var ORDER = ['y', 'm', 'w', 'd', 'h', 'n', 's'], SIZES = { w: 7 * DAY, d: DAY, h: HOUR, n: MIN, s: 1000 };
	var LABEL = { y: ['year', 'years'], m: ['month', 'months'], w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'], n: ['minute', 'minutes'], s: ['second', 'seconds'] };
	function num(v) { var r = Math.round(v * 100) / 100; return r.toLocaleString('en-US', { maximumFractionDigits: 2 }); }

	// Express the span a..b (a <= b, naive ms) in exactly the chosen units, largest first; the smallest chosen unit absorbs the remainder as a decimal.
	function breakdown(a, b, sel) {
		var chosen = ORDER.filter(function (u) { return sel[u]; }); if (!chosen.length) { chosen = ['d']; sel = { d: true }; }
		var vals = {}, base = a;
		if (sel.y || sel.m) {
			var M = wholeMonths(a, b);
			if (sel.y && sel.m) { vals.y = Math.floor(M / 12); vals.m = M % 12; base = addMonths(a, M); }
			else if (sel.y) { vals.y = Math.floor(M / 12); base = addMonths(a, vals.y * 12); }
			else { vals.m = M; base = addMonths(a, M); }
		}
		var rem = b - base;
		['w', 'd', 'h', 'n', 's'].forEach(function (u) { if (sel[u]) { var q = Math.floor(rem / SIZES[u]); vals[u] = q; rem -= q * SIZES[u]; } });
		var last = chosen[chosen.length - 1];
		if (rem > 0) {
			var size = last === 'm' ? addMonths(base, 1) - base : last === 'y' ? addMonths(base, 12) - base : SIZES[last];
			vals[last] += rem / size;
		}
		var out = [];
		// leading zero units are dropped (no "0 years"), but once the first non-zero one appears every ticked unit is shown, zeros included ("6 days, 0 hours, 0 minutes")
		chosen.forEach(function (u) { var v = vals[u]; if (v > 0 || out.length || u === last) out.push({ u: u, v: v, text: num(v) + ' ' + LABEL[u][Math.round(v * 100) / 100 === 1 ? 0 : 1] }); });
		return { parts: out, text: out.map(function (p) { return p.text; }).join(', ') };
	}

	function weekdayCounts(startDay, n) {       // how many of each weekday (0=Sun) in n days starting at day number startDay
		var c = [0, 0, 0, 0, 0, 0, 0], dow0 = parts(startDay * DAY).dow, q = Math.floor(n / 7), r = n % 7, i;
		for (i = 0; i < 7; i++) c[i] = q; for (i = 0; i < r; i++) c[(dow0 + i) % 7]++;
		return c;
	}
	// days startDay .. startDay+n-1 split into working / weekend / holiday. weekend = array of weekday numbers (0=Sun). holidays = {dayNumber: true}
	function workCount(startDay, n, weekend, holidays) {
		var wc = weekdayCounts(startDay, n), weekendDays = 0, i;
		weekend.forEach(function (d) { weekendDays += wc[d]; });
		var hol = [];
		for (var k in holidays) { var dn = +k; if (dn >= startDay && dn < startDay + n && weekend.indexOf(parts(dn * DAY).dow) < 0) hol.push(dn); }
		hol.sort(function (x, y) { return x - y; });
		return { work: n - weekendDays - hol.length, weekend: weekendDays, holidays: hol };
	}

	// zone helpers, used only for the "actual elapsed time" tile
	function offsetAt(utc, zone) {
		var f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }), o = {};
		f.formatToParts(new Date(utc)).forEach(function (p) { o[p.type] = +p.value; });
		return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(utc / 1000) * 1000;
	}
	function wallToUtc(naive, zone) {
		if (!zone || zone === 'local') { var p = parts(naive); return new Date(p.y, p.m, p.d, p.h, p.mi, p.s).getTime(); }
		var u = naive - offsetAt(naive, zone); u = naive - offsetAt(u, zone); return u;
	}

	return { DAY: DAY, utcMs: utcMs, parts: parts, dim: dim, isLeap: isLeap, addMonths: addMonths, wholeMonths: wholeMonths, parseISO: parseISO, parseTime: parseTime, iso: iso,
		dayOfYear: dayOfYear, isoWeek: isoWeek, breakdown: breakdown, weekdayCounts: weekdayCounts, workCount: workCount, wallToUtc: wallToUtc, num: num, LABEL: LABEL };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DC;
