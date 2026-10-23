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
