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

/* MES Age Calculator -- pure age maths (no DOM). build_tool_apps.py puts the Days Between Dates library (DC: calendar-month maths,
 * end-of-month clamping, zone helpers) in front of this file via lib_from. Also runs in node: require() it to test
 * (tool_apps_src/age-calculator-tests.js).
 * Dates are whole day numbers (days since 1970-01-01, from Date.UTC), so counts never drift across daylight-saving changes.
 * A birthday that does not exist in a month (the 29th-31st, above all 29 February) follows `rule`:
 *   "end"  = the last day of that month (Feb 28 in a common year)      -- the usual calculator convention
 *   "next" = the first day of the next month (Mar 1 in a common year) */
var AG = (function () {
	'use strict';
	var D = (typeof DC !== 'undefined') ? DC : require('../days-between-dates-calculator/lib.js');
	var DAY = 86400000;
	var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	function dayNum(y, m, d) { return Math.round(D.utcMs(y, m, d) / DAY); }          // m 0-11 (D.utcMs handles years < 100 correctly)
	function fromDay(n) { var p = D.parts(n * DAY); return { y: p.y, m: p.m, d: p.d, dow: p.dow }; }
	function valid(y, m, d) { return y >= 1 && y <= 9999 && m >= 0 && m <= 11 && d >= 1 && d <= D.dim(y, m); }
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function iso(n) { var p = fromDay(n), y = String(p.y); while (y.length < 4) y = '0' + y; return y + '-' + pad(p.m + 1) + '-' + pad(p.d); }
	function text(n, short) { var p = fromDay(n); return (short ? DAYS[p.dow].slice(0, 3) : DAYS[p.dow]) + ', ' + (short ? MONTHS[p.m].slice(0, 3) : MONTHS[p.m]) + ' ' + p.d + ', ' + p.y; }
	function plain(n) { var p = fromDay(n); return MONTHS[p.m] + ' ' + p.d + ', ' + p.y; }

	/* ---------- typed dates ---------- */
	var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
	function monthOf(w) { w = String(w || '').toLowerCase().replace(/\.$/, ''); if (MON[w] != null) return MON[w]; for (var i = 0; i < 12; i++) if (w.length >= 3 && MONTHS[i].toLowerCase().indexOf(w) === 0) return i; return null; }
	function year2(y, nowY) { if (y >= 100) return y; var c = nowY % 100; return (y <= c ? nowY - c : nowY - c - 100) + y; }   // 2-digit year: never in the future
	// "1990-03-15", "15/03/1990", "3/15/90", "15.03.1990", "19900315", "March 15, 1990", "15 Mar 1990", "15-Mar-1990", "the 15th of March 1990"
	// order = "mdy" | "dmy" decides 03/04/1990 when both numbers are 12 or less. -> {y, m, d, n, ambiguous, note} or null
	function parseDate(s, order, nowY) {
		s = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
		nowY = nowY || new Date().getUTCFullYear(); order = order === 'dmy' ? 'dmy' : 'mdy';
		if (!s) return null;
		s = s.replace(/^(born|on|the)\s+/g, '').replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/, '').replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/\bof\b/g, ' ').replace(/\s+/g, ' ').trim();
		var m, y, mo, d, amb = false, note = '';
		if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
		else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
		else if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/.exec(s))) {
			var a = +m[1], b = +m[2]; y = m[3].length === 2 ? year2(+m[3], nowY) : +m[3];
			if (m[3].length === 2) note = 'Two-digit year read as ' + y + '.';
			if (s.indexOf('.') > 0 && a <= 31) { d = a; mo = b - 1; }              // 15.03.1990 is day-first everywhere it is used
			else if (a > 12 && b <= 12) { d = a; mo = b - 1; }
			else if (b > 12 && a <= 12) { mo = a - 1; d = b; }
			else { amb = a !== b; if (order === 'dmy') { d = a; mo = b - 1; } else { mo = a - 1; d = b; } }
		}
		else {
			var t = s.replace(/[,]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
			if (t.length === 3) {
				var i0 = monthOf(t[0]), i1 = monthOf(t[1]);
				if (i0 != null && /^\d{1,2}$/.test(t[1]) && /^\d{2,4}$/.test(t[2])) { mo = i0; d = +t[1]; y = +t[2]; }
				else if (i1 != null && /^\d{1,2}$/.test(t[0]) && /^\d{2,4}$/.test(t[2])) { mo = i1; d = +t[0]; y = +t[2]; }
				else if (/^\d{4}$/.test(t[0]) && monthOf(t[1]) != null && /^\d{1,2}$/.test(t[2])) { y = +t[0]; mo = monthOf(t[1]); d = +t[2]; }
				else return null;
				if (y < 100 && String(t[2]).length === 2) { y = year2(y, nowY); note = 'Two-digit year read as ' + y + '.'; }
			} else return null;
		}
		if (!valid(y, mo, d)) return null;
		return { y: y, m: mo, d: d, n: dayNum(y, mo, d), ambiguous: amb, note: note };
	}
	function parseTime(s) {                      // "18:30", "6:30 pm", "6pm", "0630" -> minutes after midnight, or null
		s = String(s || '').trim().toLowerCase().replace(/\s+/g, ''); if (!s) return null;
		var m = /^(\d{1,2})(?::?(\d{2}))?(?::(\d{2}))?(am|pm|a|p)?$/.exec(s); if (!m) return null;
		var h = +m[1], mi = +(m[2] || 0); if (m[4]) { if (h < 1 || h > 12) return null; h = h % 12 + (m[4][0] === 'p' ? 12 : 0); }
		if (h > 23 || mi > 59) return null; return h * 60 + mi;
	}

	/* ---------- the age itself ---------- */
	// the date of the k-th month-anniversary of birth day number b (k = 12 -> 1st birthday)
	function monthAnniv(b, k, rule) {
		var p = fromDay(b), t = p.y * 12 + p.m + k, y = Math.floor(t / 12), m = t - y * 12, dim = D.dim(y, m);
		if (p.d <= dim) return dayNum(y, m, p.d);
		return rule === 'next' ? dayNum(y, m, dim) + 1 : dayNum(y, m, dim);
	}
	function birthdayIn(b, year, rule) { return monthAnniv(b, (year - fromDay(b).y) * 12, rule); }
	// exact age on day `on` (on >= b): {years, months, days, totalMonths, last (day of the last month-anniversary)}
	function age(b, on, rule) {
		if (on < b) return null;
		var pb = fromDay(b), po = fromDay(on), k = (po.y - pb.y) * 12 + (po.m - pb.m) + 1;
		while (k > 0 && monthAnniv(b, k, rule) > on) k--;
		var last = monthAnniv(b, k, rule);
		return { years: Math.floor(k / 12), months: k % 12, days: on - last, totalMonths: k, totalDays: on - b, weeks: Math.floor((on - b) / 7), weekDays: (on - b) % 7, last: last };
	}
	function ymdText(a) {
		if (!a) return '';
		function u(v, s) { return v + ' ' + s + (v === 1 ? '' : 's'); }
		return u(a.years, 'year') + ', ' + u(a.months, 'month') + ', ' + u(a.days, 'day');
	}
	function nextBirthday(b, on, rule) {        // the first birthday on or after `on` (today counts)
		var y = fromDay(on).y, n = birthdayIn(b, y, rule);
		if (n < on) { y++; n = birthdayIn(b, y, rule); }
		if (y <= fromDay(b).y) { y = fromDay(b).y + 1; n = birthdayIn(b, y, rule); }
		return { n: n, days: n - on, turning: y - fromDay(b).y, dow: fromDay(n).dow, today: n === on };
	}
	function nextHalfBirthday(b, on, rule) {
		var a = age(b, on, rule), k = a ? a.years * 12 + 6 : 6, n = monthAnniv(b, k, rule);
		if (n < on) { k += 12; n = monthAnniv(b, k, rule); }
		return { n: n, days: n - on, age: (k - 6) / 12 + 0.5 };
	}
	function isFeb29(b) { var p = fromDay(b); return p.m === 1 && p.d === 29; }
	function leapBirthdays(b, on) {             // real 29 Februaries lived through (not counting the birth day)
		var p = fromDay(b), q = fromDay(on), c = 0;
		for (var y = p.y + 1; y <= q.y; y++) if (D.isLeap(y) && dayNum(y, 1, 29) <= on) c++;
		return c;
	}
	function ageInYear(b, Y, rule) {            // how old in year Y: turning N on its birthday
		var py = fromDay(b).y; if (Y <= py) return null;
		var bd = birthdayIn(b, Y, rule);
		return { turning: Y - py, birthday: bd, jan1: Y - py - 1, dec31: Y - py };
	}

	/* ---------- milestones ---------- */
	var MILESTONES = [
		['d', 1000], ['d', 5000], ['d', 10000], ['d', 12345], ['d', 15000], ['d', 20000], ['d', 25000], ['d', 30000], ['d', 35000],
		['w', 1000], ['w', 2000], ['w', 3000], ['w', 4000], ['w', 5000],
		['m', 100], ['m', 250], ['m', 500], ['m', 750], ['m', 1000],
		['h', 100000], ['h', 250000], ['h', 500000], ['h', 750000],
		['n', 1e7], ['n', 2e7], ['n', 3e7], ['n', 4e7],
		['s', 1e9], ['s', 1.5e9], ['s', 2e9], ['s', 2.5e9], ['s', 3e9]
	];
	var UNIT = { d: ['day', 'days'], w: ['week', 'weeks'], m: ['month', 'months'], h: ['hour', 'hours'], n: ['minute', 'minutes'], s: ['second', 'seconds'] };
	function bigNum(v) {
		if (v >= 1e9 && v % 1e8 === 0) return (v / 1e9).toLocaleString('en-US') + ' billion';
		if (v >= 1e6 && v % 1e5 === 0) return (v / 1e6).toLocaleString('en-US') + ' million';
		return v.toLocaleString('en-US');
	}
	// birthMs = the birth instant (UTC ms) or the naive midnight of the birth day; -> [{key, label, n (day number), ms, unit}] sorted by date
	function milestones(b, rule, birthMs) {
		if (birthMs == null) birthMs = b * DAY;
		return MILESTONES.map(function (x) {
			var u = x[0], v = x[1], n, ms = null;
			if (u === 'd') n = b + v; else if (u === 'w') n = b + v * 7; else if (u === 'm') n = monthAnniv(b, v, rule);
			else { ms = birthMs + v * (u === 'h' ? 3600000 : u === 'n' ? 60000 : 1000); n = Math.floor(ms / DAY); }
			return { key: u + v, label: bigNum(v) + ' ' + UNIT[u][1], n: n, ms: ms, unit: u };
		}).sort(function (a, c) { return a.n - c.n || (a.ms || 0) - (c.ms || 0); });
	}

	/* ---------- other units ---------- */
	var PLANETS = [   // sidereal orbital period in Earth days
		['Mercury', 87.969], ['Venus', 224.701], ['Earth', 365.256], ['Mars', 686.980], ['Jupiter', 4332.59], ['Saturn', 10759.22], ['Uranus', 30688.5], ['Neptune', 60182]
	];
	function planetAges(days, b) {
		return PLANETS.map(function (p) { var a = days / p[1], k = Math.floor(a) + 1; return { name: p[0], period: p[1], age: a, next: b + Math.ceil(k * p[1]), nextAge: k }; });
	}
	var YEAR = 365.2425;
	function dogFromHuman(h) { return Math.exp((h - 31) / 16); }                  // inverse of Wang et al. 2019: human = 16 ln(dog) + 31
	function humanFromDog(dog) { return dog > 0 ? 16 * Math.log(dog) + 31 : null; }

	var SIGNS = [   // [name, glyph, start month 0-11, start day] (the usual newspaper dates; the exact change moves by a day in some years)
		['Capricorn', '♑', 11, 22], ['Aquarius', '♒', 0, 20], ['Pisces', '♓', 1, 19], ['Aries', '♈', 2, 21], ['Taurus', '♉', 3, 20], ['Gemini', '♊', 4, 21],
		['Cancer', '♋', 5, 21], ['Leo', '♌', 6, 23], ['Virgo', '♍', 7, 23], ['Libra', '♎', 8, 23], ['Scorpio', '♏', 9, 23], ['Sagittarius', '♐', 10, 22]
	];
	function sunSign(m, d) {
		var md = m * 100 + d, best = SIGNS[0];
		for (var i = 1; i < SIGNS.length; i++) if (md >= SIGNS[i][2] * 100 + SIGNS[i][3]) best = SIGNS[i];
		if (md >= 1122) best = SIGNS[0];
		var cusp = SIGNS.some(function (s) { var sd = s[2] * 100 + s[3]; return md === sd || md === sd - 1; });
		return { name: best[0], glyph: best[1], cusp: cusp };
	}
	// Chinese New Year (first day of the first lunar month) 1900-2100, as days after 21 January ('A' = Jan 21); made from Intl's "chinese" calendar
	var CNY = 'K^SI[OEXMBUJ]QFYNCVL_SH[PDXMCUJ\\QFYODVK^SGZPEXMBUI\\QGYODWK]SHZPEXMATJ\\QGZNCVK]RH[PEXM_TI\\QGZOCUK^RH[PDWLBTI]RFYNCUK^SH[PEWLBUI\\RFXMCVK^SHZODWLBUJ\\QFYMCVL^SHZODWMATI\\PFYNCVK^RGZPDWMBTI\\QFYNDUJ]RGZPEWLAT';
	var ANIMALS = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
	var ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
	function lunarNewYear(y) { if (y < 1900 || y > 2100) return null; return dayNum(y, 0, 21 + CNY.charCodeAt(y - 1900) - 65); }
	function chinese(b) {
		var p = fromDay(b), lny = lunarNewYear(p.y), cy = p.y, known = lny != null;
		if (known && b < lny) cy--;
		var i = ((cy - 4) % 60 + 60) % 60;
		return { animal: ANIMALS[i % 12], element: ELEMENTS[Math.floor(i / 2) % 5], year: cy, lny: known ? lunarNewYear(cy) : null, exact: known, beforeLny: known && b < lny };
	}
	var GENERATIONS = [[1901, 1927, 'the Greatest Generation'], [1928, 1945, 'the Silent Generation'], [1946, 1964, 'the Baby Boomers'], [1965, 1980, 'Generation X'],
		[1981, 1996, 'Millennials (Generation Y)'], [1997, 2012, 'Generation Z'], [2013, 2024, 'Generation Alpha'], [2025, 2039, 'Generation Beta']];
	function generation(y) { for (var i = 0; i < GENERATIONS.length; i++) if (y >= GENERATIONS[i][0] && y <= GENERATIONS[i][1]) return GENERATIONS[i]; return null; }

	/* ---------- two people ---------- */
	// a, b = day numbers of birth. -> who is older, the gap as y-m-d, and when the older one is exactly 2x / 3x / 1.5x the younger's age
	function difference(a, b, rule) {
		var older = a <= b ? 'a' : 'b', o = Math.min(a, b), y = Math.max(a, b), gap = age(o, y, rule);
		function ratio(r) { return Math.round((r * y - o) / (r - 1)); }              // day t where (t - o) = r (t - y)
		return { older: older, same: a === b, gap: gap, days: y - o, twice: ratio(2), thrice: ratio(3), half: ratio(1.5),
			together: function (years) { return Math.round((years * YEAR + o + y) / 2); } };   // combined age = years
	}

	/* ---------- links ---------- */
	function toQuery(o) {
		var q = [];
		if (o.d != null) q.push('d=' + iso(o.d));
		if (o.on != null) q.push('on=' + iso(o.on));
		if (o.t != null) q.push('t=' + pad(Math.floor(o.t / 60)) + ':' + pad(o.t % 60));
		if (o.t != null && o.tz) q.push('tz=' + encodeURIComponent(o.tz));
		if (o.rule === 'next') q.push('r=next');
		return q.length ? '?' + q.join('&') : '';
	}
	function fromQuery(search) {
		var o = {}, p = {};
		String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i); try { p[k] = decodeURIComponent((i < 0 ? '' : kv.slice(i + 1)).replace(/\+/g, ' ')); } catch (e) {} });
		function day(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m && valid(+m[1], +m[2] - 1, +m[3]) ? dayNum(+m[1], +m[2] - 1, +m[3]) : null; }
		var d = day(p.d), on = day(p.on);
		if (d != null) o.d = d; if (on != null) o.on = on;
		var t = parseTime(p.t); if (t != null) o.t = t;
		if (p.tz && /^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$|^UTC$/.test(p.tz)) o.tz = p.tz;
		if (p.r === 'next') o.rule = 'next';
		return o;
	}

	return { DAY: DAY, MONTHS: MONTHS, DAYS: DAYS, dayNum: dayNum, fromDay: fromDay, valid: valid, iso: iso, text: text, plain: plain, parseDate: parseDate, parseTime: parseTime,
		monthAnniv: monthAnniv, birthdayIn: birthdayIn, age: age, ymdText: ymdText, nextBirthday: nextBirthday, nextHalfBirthday: nextHalfBirthday, isFeb29: isFeb29,
		leapBirthdays: leapBirthdays, ageInYear: ageInYear, milestones: milestones, bigNum: bigNum, PLANETS: PLANETS, planetAges: planetAges, YEAR: YEAR,
		dogFromHuman: dogFromHuman, humanFromDog: humanFromDog, sunSign: sunSign, lunarNewYear: lunarNewYear, chinese: chinese, generation: generation,
		difference: difference, toQuery: toQuery, fromQuery: fromQuery, wallToUtc: D.wallToUtc, utcMs: D.utcMs, pad: pad };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AG;

/* MES Age Calculator UI. Maths = AG (lib.js) on top of the Days Between Dates library DC (prepended by build_tool_apps.py). */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-age-calculator:v1', DAY = AG.DAY;
	var st = { dob: '', order: '', rule: 'end', time: '', tz: '', live: false, people: [], pa: '', pb: '' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in st) st[k] = sv[k]; } catch (e) {}
	if (!Array.isArray(st.people)) st.people = [];
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	if (!st.order) { var lang = (navigator.language || 'en-US'); st.order = /^en-(US|PH)|^en$/i.test(lang) || /-(US|FM|PW|MH)$/i.test(lang) ? 'mdy' : 'dmy'; }
	var localTz = 'UTC'; try { localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}

	var toastT;
	function toast(msg, act) {
		var t = $('ag-toast'); t.innerHTML = esc(msg) + (act ? ' <button type="button" class="ag-undo">' + esc(act[0]) + '</button>' : ''); t.classList.add('tu-toast--show');
		if (act) { t.style.pointerEvents = 'auto'; t.querySelector('button').onclick = function () { act[1](); t.classList.remove('tu-toast--show'); }; }
		clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); t.style.pointerEvents = ''; }, act ? 5000 : 1600);
	}
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
	}
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function stat(label, value, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	function n0(v) { return Math.floor(v).toLocaleString('en-US'); }
	function n2(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
	function pl(v, w) { return n0(v) + ' ' + w + (v === 1 ? '' : 's'); }
	function today() { var d = new Date(); return AG.dayNum(d.getFullYear(), d.getMonth(), d.getDate()); }
	function inDays(k) { return k === 0 ? 'today' : k === 1 ? 'tomorrow' : k === -1 ? 'yesterday' : k > 0 ? 'in ' + pl(k, 'day') : pl(-k, 'day') + ' ago'; }

	/* ---------- typed dates ---------- */
	function parse(s) {
		var r = AG.parseDate(s, st.order);
		if (r) return r;
		if (window.MESWhen && String(s || '').trim()) {          // words: "yesterday", "last friday", "Oct 28" ...
			try { var w = MESWhen.parse(s, { futureOnly: false, order: st.order }); if (w && w.ok && w.date) { r = AG.parseDate(w.date); if (r) return r; } } catch (e) {}
		}
		return null;
	}
	function showParsed(inp, out, r, emptyMsg) {
		var t = inp.value.trim();
		inp.classList.toggle('ag-bad', !!t && !r);
		inp.setAttribute('aria-invalid', t && !r ? 'true' : 'false');
		if (!t) { out.innerHTML = emptyMsg || ''; return; }
		if (!r) { out.innerHTML = '<span class="ag-err">Could not read that date. Try 1990-03-15 or March 15, 1990.</span>'; return; }
		out.innerHTML = '= <strong>' + esc(AG.text(r.n)) + '</strong>' + (r.ambiguous ? ' <span class="ag-warn">(read as ' + (st.order === 'dmy' ? 'day/month' : 'month/day') + ': change it below)</span>' : '') + (r.note ? ' <span class="tu-note">' + esc(r.note) + '</span>' : '');
	}
	function wirePick(inp, pick, after) {
		var btn = pick.previousElementSibling;
		pick.addEventListener('click', function () { try { if (pick.showPicker) pick.showPicker(); } catch (e) {} });
		pick.addEventListener('change', function () { if (pick.value) { var r = AG.parseDate(pick.value); if (r) { inp.value = AG.plain(r.n); after(); } } });
		void btn;
	}

	/* ---------- zones ---------- */
	var zones = [localTz]; try { if (Intl.supportedValuesOf) zones = zones.concat(Intl.supportedValuesOf('timeZone').filter(function (z) { return z !== localTz; })); } catch (e) {}
	if (zones.indexOf('UTC') < 0) zones.push('UTC');
	$('ag-tz').innerHTML = zones.map(function (z, i) { return '<option value="' + esc(z) + '">' + esc(z.replace(/_/g, ' ')) + (i === 0 ? ' (your time zone)' : '') + '</option>'; }).join('');

	/* ---------- current inputs ---------- */
	var Q = AG.fromQuery(location.search), onDay = null;
	if (Q.d != null) { st.dob = AG.iso(Q.d); }
	if (Q.t != null) { st.time = AG.pad(Math.floor(Q.t / 60)) + ':' + AG.pad(Q.t % 60); st.tz = Q.tz || st.tz; }
	if (Q.rule) st.rule = Q.rule;
	if (Q.on != null) onDay = Q.on;
	$('ag-order').value = st.order;
	if (st.dob) { var r0 = AG.parseDate(st.dob) || parse(st.dob); $('ag-dob').value = r0 ? AG.plain(r0.n) : st.dob; }
	if (onDay != null) $('ag-on').value = AG.plain(onDay);
	if (st.time) { $('ag-time').value = st.time; $('ag-timebox').open = true; }
	if (st.tz && zones.indexOf(st.tz) >= 0) $('ag-tz').value = st.tz;
	$('ag-live').checked = !!st.live;
	$('ag-pa').value = st.pa || ''; $('ag-pb').value = st.pb || '';

	function birthInstant(b) {                                   // UTC ms of the birth (time + zone), or local midnight of the birth day
		var p = AG.fromDay(b), t = AG.parseTime($('ag-time').value);
		if (t != null) return { ms: AG.wallToUtc(AG.utcMs(p.y, p.m, p.d, Math.floor(t / 60), t % 60, 0), $('ag-tz').value || localTz), exact: true, t: t };
		return { ms: new Date(p.y, p.m, p.d).getTime(), exact: false, t: null };
	}

	/* ---------- render ---------- */
	var cur = null, liveTimer = 0, showAllMiles = false;
	function render() {
		var dr = parse($('ag-dob').value), onT = $('ag-on').value.trim(), or = onT ? parse(onT) : null, td = today();
		showParsed($('ag-dob'), $('ag-dob-out'), dr);
		showParsed($('ag-on'), $('ag-on-out'), or, 'Today, <strong>' + esc(AG.text(td)) + '</strong>');
		var on = or ? or.n : td, isToday = on === td;
		$('ag-rulebox').hidden = !(dr && dr.d >= 29);
		[].forEach.call($('ag-rule').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-r') === st.rule)); });
		if (dr) { st.dob = AG.iso(dr.n); save(); }
		$('ag-empty').hidden = !!dr; $('ag-res').hidden = !dr;
		if (!dr) { cur = null; stopLive(); return; }
		var b = dr.n, rule = st.rule, a = AG.age(b, on, rule);
		cur = { b: b, on: on, isToday: isToday, rule: rule };
		var p = AG.fromDay(b);
		if (!a) {           // the "age on" date is before the birth
			$('ag-lead').textContent = 'Not born yet on that date';
			$('ag-big').textContent = AG.ymdText(AG.age(on, b, rule)) + ' to go';
			$('ag-sub').innerHTML = 'Born ' + esc(AG.text(b)) + '; the "Age on" date is ' + esc(AG.text(on)) + '.';
			['ag-totals', 'ag-bdays', 'ag-born'].forEach(function (id) { $(id).innerHTML = ''; });
			$('ag-leap').hidden = true; stopLive(); renderDiff(); renderPeople(); return;
		}
		$('ag-lead').textContent = isToday ? 'You are' : (on < td ? 'On ' + AG.plain(on) + ' you were' : 'On ' + AG.plain(on) + ' you will be');
		$('ag-big').innerHTML = '<span class="ag-y">' + pl(a.years, 'year') + '</span> <span class="ag-md">' + pl(a.months, 'month') + ', ' + pl(a.days, 'day') + '</span>';
		var nb = AG.nextBirthday(b, on, rule);
		$('ag-sub').innerHTML = 'Born on a <strong>' + AG.DAYS[p.dow] + '</strong>, ' + esc(AG.plain(b)) + '. ' + (nb.today ? '<strong>Happy birthday!</strong> ' + (isToday ? 'Today' : 'That day') + ' is birthday number ' + nb.turning + '.' : 'Next birthday ' + inDays(nb.days) + ', on a ' + AG.DAYS[nb.dow] + '.');
		renderLeap(b, on, rule);
		renderTotals();
		renderBirthdays(b, on, rule, a, nb);
		renderBorn(b, dr);
		renderMiles(b, on, rule);
		renderYear(); renderUnits(b, on, a);
		renderDiff(); renderPeople();
		history.replaceState(null, '', location.pathname + AG.toQuery({ d: b, on: isToday ? null : on, t: birthInstant(b).t, tz: $('ag-tz').value, rule: rule }) + location.hash);
		if ($('ag-live').checked && isToday) startLive(); else stopLive();
	}
	function renderLeap(b, on, rule) {
		var box = $('ag-leap'), p = AG.fromDay(b);
		if (!AG.isFeb29(b)) {
			if (p.d >= 29) { box.hidden = false; box.innerHTML = 'Born on the ' + p.d + 'th: in months with fewer days your month-birthday counts on <strong>' + (rule === 'next' ? 'the 1st of the next month' : 'the last day of the month') + '</strong> (you can switch that above). Your yearly birthday is not affected' + (p.m === 1 || [3, 5, 8, 10].indexOf(p.m) >= 0 ? '' : '') + '.'; }
			else box.hidden = true;
			return;
		}
		var y = AG.fromDay(on).y, ny = AG.nextBirthday(b, on, rule), real = AG.leapBirthdays(b, on), nextLeap = y; while (!DC.isLeap(nextLeap) || AG.dayNum(nextLeap, 1, 29) < on) nextLeap++;
		var e = AG.birthdayIn(b, AG.fromDay(ny.n).y, 'end'), x = AG.birthdayIn(b, AG.fromDay(ny.n).y, 'next');
		box.hidden = false;
		box.innerHTML = '<strong>A leap-day birthday.</strong> You have had <strong>' + pl(real, 'real 29 February') + '</strong> so far (a "leap age" of ' + real + '). ' +
			(e === x ? 'Your next birthday is a real 29 February: <strong>' + esc(AG.text(e)) + '</strong>.' :
				'Your next birthday is in a common year, so it is either <strong>' + esc(AG.text(e)) + '</strong> (last day of February) or <strong>' + esc(AG.text(x)) + '</strong> (the day after 28 February). Laws differ: Hong Kong, for example, counts 1 March; rules that count to the last day of the month give 28 February. The next real 29 February is ' + esc(AG.plain(AG.dayNum(nextLeap, 1, 29))) + '.') +
			' The ages here use <strong>' + (rule === 'next' ? '1 March' : '28 February') + '</strong>.';
	}
	function totalsAt() {                                        // elapsed ms for the hours / minutes / seconds tiles
		var bi = birthInstant(cur.b), end;
		if (cur.isToday) end = Date.now();
		else { var p = AG.fromDay(cur.on), t = bi.t || 0; end = bi.exact ? AG.wallToUtc(AG.utcMs(p.y, p.m, p.d, Math.floor(t / 60), t % 60, 0), $('ag-tz').value || localTz) : new Date(p.y, p.m, p.d).getTime(); }
		return { ms: Math.max(0, end - bi.ms), exact: bi.exact };
	}
	function renderTotals() {
		if (!cur) return;
		var a = AG.age(cur.b, cur.on, cur.rule); if (!a) return;
		var T = totalsAt(), s = T.ms / 1000, yrs = a.totalDays / AG.YEAR;
		$('ag-totals').innerHTML =
			stat('Years', n2(yrs), pl(a.years, 'whole year'), true) +
			stat('Months', n0(a.totalMonths), a.days ? 'and ' + pl(a.days, 'day') : 'exactly') +
			stat('Weeks', n0(a.weeks), a.weekDays ? 'and ' + pl(a.weekDays, 'day') : 'exactly') +
			stat('Days', n0(a.totalDays), 'counting ' + (cur.isToday ? 'to today' : 'to ' + AG.plain(cur.on))) +
			stat('Hours', n0(s / 3600), T.exact ? 'from your time of birth' : 'from midnight on your birth day') +
			stat('Minutes', n0(s / 60), '') +
			'<div class="tu-stat"><div class="tu-stat__label">Seconds</div><div class="tu-stat__value" id="ag-secs">' + n0(s) + '</div><div class="tu-stat__sub">about ' + n2(s / 1e9) + ' billion</div></div>';
		$('ag-tnote').textContent = T.exact ? 'Hours, minutes and seconds count real time from ' + $('ag-time').value + ' in ' + ($('ag-tz').value || localTz).replace(/_/g, ' ') + ', daylight saving included.'
			: 'Add your time of birth (above) for exact hours, minutes and seconds; for now they count from midnight at the start of your birth day in your time zone.';
		$('ag-live').parentNode.hidden = !cur.isToday;
	}
	function startLive() {
		if (liveTimer) return;
		liveTimer = setInterval(function () { if (!cur || document.hidden) return; var el = $('ag-secs'); if (el) el.textContent = n0(totalsAt().ms / 1000); }, 1000);
	}
	function stopLive() { clearInterval(liveTimer); liveTimer = 0; }
	function renderBirthdays(b, on, rule, a, nb) {
		var hb = AG.nextHalfBirthday(b, on, rule), last = AG.birthdayIn(b, AG.fromDay(nb.n).y - 1, rule);
		if (nb.today) last = nb.n;
		$('ag-bdays').innerHTML =
			stat('Next birthday', nb.today ? 'Today!' : pl(nb.days, 'day'), (nb.today ? 'Birthday number ' : 'Turning ') + nb.turning + ' on <strong>' + AG.DAYS[nb.dow] + '</strong>, ' + esc(AG.plain(nb.n)) + (nb.today ? '' : ' (' + pl(Math.floor(nb.days / 7), 'week') + ', ' + pl(nb.days % 7, 'day') + ')'), true) +
			stat('Half birthday', hb.days === 0 ? 'Today' : pl(hb.days, 'day'), n2(hb.age, 1) + ' on ' + AG.DAYS[AG.fromDay(hb.n).dow] + ', ' + esc(AG.plain(hb.n))) +
			stat('Birthdays so far', n0(a.years), 'plus the day you were born');
		var span = nb.today ? 1 : nb.n - last, done = nb.today ? 1 : (on - last) / span;
		$('ag-barfill').style.width = (done * 100).toFixed(1) + '%';
		$('ag-bar').setAttribute('aria-label', Math.round(done * 100) + '% of the way to the next birthday');
		$('ag-barnote').textContent = nb.today ? 'It is your birthday!' : Math.round(done * 100) + '% of the way from your last birthday (' + AG.plain(last) + ') to the next one.';
	}
	function renderBorn(b, dr) {
		var p = AG.fromDay(b), sg = AG.sunSign(p.m, p.d), cn = AG.chinese(b), gen = AG.generation(p.y), doy = b - AG.dayNum(p.y, 0, 1) + 1, yl = DC.isLeap(p.y) ? 366 : 365;
		$('ag-born').innerHTML =
			stat('Weekday', AG.DAYS[p.dow], 'Day ' + doy + ' of ' + yl + ' in ' + p.y + (DC.isLeap(p.y) ? ' (a leap year)' : '')) +
			stat('Star sign', '<span class="ag-glyph">' + sg.glyph + '︎</span> ' + sg.name, sg.cusp ? 'On the change between two signs: the exact sign depends on the year and time (see the birth chart).' : 'Western (tropical) zodiac, usual dates') +
			stat('Chinese zodiac', cn.element + ' ' + cn.animal, cn.exact ? (cn.beforeLny ? 'Born before Chinese New Year ' + p.y + ', so the animal of ' + cn.year : 'Year began ' + esc(AG.plain(cn.lny))) : 'By year only (New Year dates are known for 1900-2100)') +
			(gen ? stat('Generation', gen[2], gen[0] + '&ndash;' + gen[1] + ' (Pew Research ranges; others differ by a few years)') : '');
		var md = AG.pad(p.m + 1) + '-' + AG.pad(p.d);
		$('ag-bornlinks').innerHTML = '<a href="/zodiac?d=' + AG.iso(b) + '">Full birth chart</a><a href="/birthday-personality?m=' + (p.m + 1) + '&amp;d=' + p.d + '&amp;y=' + p.y + '">Birthday personality</a><a href="/birthday?d=' + md + '">Famous people born on ' + AG.MONTHS[p.m] + ' ' + p.d + '</a>';
		void dr;
	}
	function msText(ms) { var d = new Date(ms); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
	function renderMiles(b, on, rule) {
		var bi = birthInstant(b), L = AG.milestones(b, rule, bi.ms), td = today();
		var nextI = -1; L.forEach(function (m, i) { var dn = m.ms != null ? localDay(m.ms) : m.n; m.dn = dn; if (nextI < 0 && dn >= on) nextI = i; });
		var rows = L.map(function (m, i) {
			var show = showAllMiles || (i >= nextI - 2 && i < nextI + 6) || (nextI < 0 && i >= L.length - 4);
			if (!show) return '';
			var date = m.ms != null ? (bi.exact ? msText(m.ms) : AG.text(m.dn, true) + ' (around)') : AG.text(m.n, true);
			return '<tr' + (i === nextI ? ' class="is-active"' : '') + (m.dn < on ? ' class="ag-past"' : '') + '><td>' + esc(m.label) + '</td><td>' + esc(date) + '</td><td>' + (m.dn - td === 0 ? '<strong>today!</strong>' : inDays(m.dn - td)) + '</td></tr>';
		}).join('');
		$('ag-miles').querySelector('tbody').innerHTML = rows;
		$('ag-miles-all').textContent = showAllMiles ? 'Show fewer' : 'Show all ' + L.length + ' milestones';
		$('ag-miles-all').setAttribute('aria-expanded', String(showAllMiles));
	}
	function localDay(ms) { var d = new Date(ms); return AG.dayNum(d.getFullYear(), d.getMonth(), d.getDate()); }
	function renderYear() {
		if (!cur) return;
		var py = AG.fromDay(cur.b).y, ty = AG.fromDay(today()).y, v = $('ag-year').value.trim(), Y = /^\d{4}$/.test(v) ? +v : null;
		$('ag-years').innerHTML = [ty + 1, ty + 5, ty + 10, 2050, 2100].filter(function (y, i, a) { return y > py && a.indexOf(y) === i; }).map(function (y) { return '<button type="button" class="tu-chip" data-y="' + y + '">' + y + '</button>'; }).join('');
		if (Y == null) { $('ag-yearout').innerHTML = '<span class="tu-note">Type a year to see your age then.</span>'; return; }
		var r = AG.ageInYear(cur.b, Y, cur.rule);
		if (!r) { $('ag-yearout').textContent = Y === py ? 'That is the year you were born.' : 'That is before you were born.'; return; }
		var past = r.birthday < today();
		$('ag-yearout').innerHTML = 'In ' + Y + ' you ' + (past ? 'turned' : 'turn') + ' <strong>' + r.turning + '</strong> on ' + esc(AG.text(r.birthday)) + '. You ' + (past ? 'were' : 'will be') + ' ' + r.jan1 + ' on 1 January and ' + r.dec31 + ' on 31 December.';
	}
	function renderUnits(b, on, a) {
		var days = a.totalDays, yrs = days / AG.YEAR, td = today();
		$('ag-planets').querySelector('tbody').innerHTML = AG.planetAges(days, b).map(function (p) {
			var per = p.period < 1000 ? n2(p.period, 0) + ' Earth days' : n2(p.period / 365.25, 1) + ' Earth years';
			return '<tr' + (p.name === 'Earth' ? ' class="is-active"' : '') + '><td>' + p.name + '</td><td>' + per + '</td><td>' + n2(p.age, p.age < 10 ? 2 : 1) + '</td><td>' + (p.nextAge + ' on ' + esc(AG.plain(p.next))) + (p.next - td < 36600 ? ' <span class="tu-note">(' + inDays(p.next - td) + ')</span>' : '') + '</td></tr>';
		}).join('');
		var dog = yrs >= 31 ? AG.dogFromHuman(yrs) : null;
		$('ag-dog').innerHTML = '<p style="margin-top:0;">Old rule of thumb (1 dog year = 7 human years): a dog as "old" as you would be <strong>' + n2(yrs / 7, 1) + '</strong> years old.' +
			(dog ? ' With the newer formula <em>human age = 16 &times; ln(dog age) + 31</em> (Wang et al., 2019, fitted on Labradors, approximate) it would be about <strong>' + n2(dog, 1) + '</strong>.' : ' The newer formula (<em>human age = 16 &times; ln(dog age) + 31</em>) starts at 31 "human years" for a one-year-old dog, so it does not apply to ages under 31.') + '</p>';
		renderDog();
		void on;
	}
	function renderDog() {
		var v = parseFloat(String($('ag-dogage').value).replace(',', '.'));
		if (!(v > 0) || v > 40) { $('ag-dogout').innerHTML = '<span class="tu-note">Type your dog\'s age to convert it.</span>'; return; }
		var h = AG.humanFromDog(v);
		$('ag-dogout').innerHTML = v < 1 ? 'Under one year the formula is not reliable (puppies grow up very fast). Old rule: about <strong>' + n2(v * 7, 1) + '</strong> human years.' :
			'About <strong>' + n2(h, 0) + '</strong> in human years by the formula (16 &times; ln(' + n2(v, v % 1 ? 1 : 0) + ') + 31), or ' + n2(v * 7, 0) + ' by the old &times;7 rule.';
	}

	/* ---------- two people ---------- */
	function renderDiff() {
		var ra = parse($('ag-pa').value), rb = parse($('ag-pb').value), out = $('ag-diffout');
		showParsed($('ag-pa'), $('ag-pa-out'), ra); showParsed($('ag-pb'), $('ag-pb-out'), rb);
		st.pa = $('ag-pa').value; st.pb = $('ag-pb').value; save();
		if (!ra || !rb) { out.innerHTML = '<p class="tu-note">Enter two dates of birth (the first is filled in from yours when empty).' + (st.people.length ? ' Or press "Compare" next to someone in My people.' : '') + '</p>'; return; }
		var d = AG.difference(ra.n, rb.n, st.rule), td = today();
		if (d.same) { out.innerHTML = '<p class="ag-diffbig">Same birthday: exactly the same age.</p>'; return; }
		var who = d.older === 'a' ? 'The first person' : 'The second person';
		function row(label, n, extra) { return '<tr><td>' + label + '</td><td>' + esc(AG.text(n, true)) + '</td><td>' + inDays(n - td) + '</td><td>' + extra + '</td></tr>'; }
		var o = Math.min(ra.n, rb.n), y = Math.max(ra.n, rb.n);
		function ages(n) { var ao = AG.age(o, n, st.rule), ay = AG.age(y, n, st.rule); return ao.years + ' and ' + ay.years; }
		out.innerHTML = '<p class="ag-diffbig">' + who + ' is older by <strong>' + esc(AG.ymdText(d.gap)) + '</strong></p>' +
			'<p>That is ' + n0(d.days) + ' days, or ' + n0(Math.floor(d.days / 7)) + ' weeks and ' + pl(d.days % 7, 'day') + '. Together you have lived ' + n0((td - o) + Math.max(0, td - y)) + ' days.</p>' +
			'<div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Moment</th><th>Date</th><th>When</th><th>Ages then</th></tr></thead><tbody>' +
			row('Older one is 3&times; the younger\'s age', d.thrice, ages(d.thrice)) +
			row('Older one is twice the younger\'s age', d.twice, ages(d.twice)) +
			row('Older one is 1.5&times; the younger\'s age', d.half, ages(d.half)) +
			row('Combined age 100 years', d.together(100), ages(d.together(100))) +
			'</tbody></table></div><p class="tu-note">Ages are whole years on that day; "twice the age" is exact to the day.</p>';
	}

	/* ---------- my people ---------- */
	function renderPeople() {
		var td = today(), on = cur ? cur.on : td, tb = $('ag-ptable').querySelector('tbody');
		var list = st.people.map(function (p, i) { var r = AG.parseDate(p.d); return r ? { i: i, name: p.name, b: r.n } : null; }).filter(Boolean);
		list.forEach(function (p) { p.nb = AG.nextBirthday(p.b, td, st.rule); p.a = AG.age(p.b, on, st.rule); });
		list.sort(function (x, y) { return x.nb.days - y.nb.days; });
		$('ag-pempty').hidden = list.length > 0; $('ag-ptable').hidden = !list.length;
		tb.innerHTML = list.map(function (p) {
			return '<tr><td><strong>' + esc(p.name || 'No name') + '</strong></td><td>' + esc(AG.plain(p.b)) + '</td><td>' + (p.a ? esc(AG.ymdText(p.a)) : 'not born yet') + '</td><td>' + (p.nb.today ? '<strong>Today! (' + p.nb.turning + ')</strong>' : inDays(p.nb.days) + ', turning ' + p.nb.turning) + '</td>' +
				'<td class="ag-pact"><button type="button" class="tu-btn tu-btn--ghost" data-open="' + p.i + '">Open</button><button type="button" class="tu-btn tu-btn--ghost" data-cmp="' + p.i + '">Compare</button><button type="button" class="tu-btn tu-btn--ghost" data-del="' + p.i + '" aria-label="Delete ' + esc(p.name || 'this person') + '">&times;</button></td></tr>';
		}).join('');
	}
	function addPerson(name, r) {
		st.people.push({ name: String(name || '').trim().slice(0, 40), d: AG.iso(r.n) }); save(); renderPeople();
		toast('Saved ' + (name || 'this date'));
	}
	$('ag-padd').addEventListener('click', function () {
		var r = parse($('ag-pdob').value);
		if (!r) { showParsed($('ag-pdob'), $('ag-pdob-out'), r); $('ag-pdob').focus(); return; }
		addPerson($('ag-pname').value, r); $('ag-pname').value = ''; $('ag-pdob').value = ''; $('ag-pdob-out').innerHTML = ''; $('ag-pname').focus();
	});
	$('ag-pdob').addEventListener('input', function () { showParsed($('ag-pdob'), $('ag-pdob-out'), parse(this.value)); });
	[$('ag-pname'), $('ag-pdob')].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('ag-padd').click(); }); });
	$('ag-ptable').addEventListener('click', function (e) {
		var t = e.target.closest('button'); if (!t) return;
		if (t.hasAttribute('data-open')) { var p = st.people[+t.getAttribute('data-open')]; var r = AG.parseDate(p.d); $('ag-dob').value = AG.plain(r.n); render(); $('ag-res').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
		else if (t.hasAttribute('data-cmp')) { var q = st.people[+t.getAttribute('data-cmp')]; var r2 = AG.parseDate(q.d); if (!$('ag-pa').value.trim() && cur) $('ag-pa').value = AG.plain(cur.b); if ($('ag-pa').value.trim()) $('ag-pb').value = AG.plain(r2.n); else $('ag-pa').value = AG.plain(r2.n); renderDiff(); $('ag-diff').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
		else if (t.hasAttribute('data-del')) {
			var i = +t.getAttribute('data-del'), gone = st.people.splice(i, 1)[0]; save(); renderPeople();
			toast('Deleted ' + (gone.name || 'entry'), ['Undo', function () { st.people.splice(i, 0, gone); save(); renderPeople(); }]);
		}
	});

	/* ---------- events ---------- */
	var EX = [['March 15, 1990', 'March 15, 1990'], ['29 Feb 2000', 'Born on a leap day'], ['1/31/1985', 'Born Jan 31'], ['2000-01-01', 'Y2K baby']];
	$('ag-examples').innerHTML = EX.map(function (x) { return '<button type="button" class="tu-chip" data-ex="' + esc(x[0]) + '">' + esc(x[1]) + '</button>'; }).join('');
	$('ag-examples').addEventListener('click', function (e) { var t = e.target.closest('[data-ex]'); if (!t) return; var r = AG.parseDate(t.getAttribute('data-ex'), 'mdy'); $('ag-dob').value = AG.plain(r.n); render(); });
	var deb = 0; function soon() { clearTimeout(deb); deb = setTimeout(render, 180); }
	['ag-dob', 'ag-on'].forEach(function (id) { $(id).addEventListener('input', soon); $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(deb); render(); } }); $(id).addEventListener('blur', function () { var r = parse(this.value); if (r) this.value = AG.plain(r.n); }); });
	wirePick($('ag-dob'), $('ag-dob-pick'), render); wirePick($('ag-on'), $('ag-on-pick'), render);
	$('ag-dob-pick').addEventListener('focus', function () { var r = parse($('ag-dob').value); if (r) this.value = AG.iso(r.n); });
	$('ag-on-pick').addEventListener('focus', function () { var r = parse($('ag-on').value); this.value = AG.iso(r ? r.n : today()); });
	$('ag-today').addEventListener('click', function () { $('ag-on').value = ''; render(); });
	$('ag-order').addEventListener('change', function () { st.order = this.value; save(); render(); });
	$('ag-rule').addEventListener('click', function (e) { var t = e.target.closest('[data-r]'); if (!t) return; st.rule = t.getAttribute('data-r'); save(); render(); });
	function timeChanged() { st.time = $('ag-time').value; st.tz = $('ag-tz').value; save(); render(); }
	$('ag-time').addEventListener('change', timeChanged); $('ag-time').addEventListener('input', timeChanged); $('ag-tz').addEventListener('change', timeChanged);
	$('ag-time-clear').addEventListener('click', function () { $('ag-time').value = ''; timeChanged(); });
	$('ag-live').addEventListener('change', function () { st.live = this.checked; save(); if (this.checked && cur && cur.isToday) startLive(); else stopLive(); });
	$('ag-miles-all').addEventListener('click', function () { showAllMiles = !showAllMiles; if (cur) renderMiles(cur.b, cur.on, cur.rule); });
	$('ag-year').addEventListener('input', renderYear);
	$('ag-years').addEventListener('click', function (e) { var t = e.target.closest('[data-y]'); if (!t) return; $('ag-year').value = t.getAttribute('data-y'); renderYear(); });
	$('ag-dogage').addEventListener('input', renderDog);
	['ag-pa', 'ag-pb'].forEach(function (id) { $(id).addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(renderDiff, 180); }); $(id).addEventListener('blur', function () { var r = parse(this.value); if (r) this.value = AG.plain(r.n); }); });
	$('ag-pa').addEventListener('focus', function () { if (!this.value.trim() && cur) { this.value = AG.plain(cur.b); renderDiff(); this.select(); } });
	$('ag-copy').addEventListener('click', function () {
		if (!cur) return; var a = AG.age(cur.b, cur.on, cur.rule); if (!a) return; var nb = AG.nextBirthday(cur.b, cur.on, cur.rule);
		copy('Born ' + AG.text(cur.b) + '. Age' + (cur.isToday ? '' : ' on ' + AG.plain(cur.on)) + ': ' + AG.ymdText(a) + ' (' + n0(a.totalDays) + ' days, ' + n0(a.weeks) + ' weeks, ' + n0(a.totalMonths) + ' months). Next birthday: ' + AG.text(nb.n) + ', turning ' + nb.turning + '.', 'Result copied');
	});
	$('ag-link').addEventListener('click', function () { copy(location.href, 'Link copied'); });
	$('ag-save').addEventListener('click', function () {
		if (!cur) return; var name = ''; try { name = prompt('Name for this birthday (optional):', '') || ''; } catch (e) {}
		addPerson(name, { n: cur.b });
	});
	document.addEventListener('visibilitychange', function () { if (!document.hidden && cur) renderTotals(); });

	render();
})();
