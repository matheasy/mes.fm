/* MES cycle maths (ovulation, fertile window, period prediction, due date). Pure: runs in the browser and in node.
   Dates are whole-day numbers (days since 1970-01-01, UTC) so daylight saving never shifts a result. */
var MESCycle = (function () {
	'use strict';
	var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	var WDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	function toDay(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }          // m = 1..12
	function parts(day) { var t = new Date(day * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() }; }
	function iso(day) { var p = parts(day); return p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2); }
	function parseISO(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; var d = toDay(+m[1], +m[2], +m[3]); return iso(d) === s ? d : null; }
	function today() { var n = new Date(); return toDay(n.getFullYear(), n.getMonth() + 1, n.getDate()); }
	function yr(p) { return p.y !== new Date().getFullYear() ? ', ' + p.y : ''; }   // short forms show the year only when it is not this year
	function fmt(day, short) { var p = parts(day); return (short ? WDAYS[p.dow].slice(0, 3) + ', ' + MONTHS[p.m - 1].slice(0, 3) : WDAYS[p.dow] + ', ' + MONTHS[p.m - 1]) + ' ' + p.d + (short ? yr(p) : ', ' + p.y); }
	function fmtShort(day) { var p = parts(day); return MONTHS[p.m - 1].slice(0, 3) + ' ' + p.d + yr(p); }

	/* ---------- ovulation ---------- */
	/* Ovulation falls `luteal` days before the NEXT period (14 by default, whatever the cycle length). The fertile window is the 5 days before
	   ovulation (sperm live up to ~5 days) plus ovulation day itself (the egg lives ~12-24 h). A positive LH test means ovulation follows in
	   about 24-36 hours, so the day after the test is used. */
	function predict(o) {
		var cycle = o.cycle || 28, luteal = o.luteal || 14, plen = o.periodLen || 5, lmp = o.lmp, ov, next;
		if (o.lh != null) { ov = o.lh + 1; next = ov + luteal; }
		else { ov = lmp + cycle - luteal; next = lmp + cycle; }
		return { lmp: lmp, cycle: cycle, luteal: luteal, ovulation: ov, fertileStart: ov - 5, fertileEnd: ov, peakStart: ov - 2, nextPeriod: next, periodEnd: next + plen - 1,
			testDay: next, earlyTest: ov + 10, periodEnd0: lmp + plen - 1, lhBased: o.lh != null };
	}
	/* Cycles that vary: earliest fertile day uses the shortest cycle, latest uses the longest (the Knaus-Ogino idea, with the chosen luteal phase). */
	function predictRange(o) {
		var luteal = o.luteal || 14, a = o.shortest, b = o.longest, lmp = o.lmp;
		return { fertileStart: lmp + a - luteal - 5, fertileEnd: lmp + b - luteal, ovEarliest: lmp + a - luteal, ovLatest: lmp + b - luteal, nextEarliest: lmp + a, nextLatest: lmp + b };
	}
	/* Next n cycles after the one starting at lmp (the first row is the cycle that starts at lmp). */
	function project(o, n) {
		var rows = [], start = o.lmp, i, p;
		for (i = 0; i < n; i++) {
			p = predict({ lmp: start, cycle: o.cycle, luteal: o.luteal, periodLen: o.periodLen, lh: i === 0 ? o.lh : null });
			rows.push({ start: start, periodEnd: start + (o.periodLen || 5) - 1, fertileStart: p.fertileStart, ovulation: p.ovulation, fertileEnd: p.fertileEnd, next: p.nextPeriod });
			start = i === 0 && o.lh != null ? p.nextPeriod : start + o.cycle;
		}
		return rows;
	}
	/* Chance of pregnancy from sex on a day relative to ovulation (Wilcox, Weinberg & Baird, NEJM 1995, 129 healthy couples, 625 cycles). */
	var WILCOX = { '-5': 0.10, '-4': 0.16, '-3': 0.14, '-2': 0.27, '-1': 0.31, '0': 0.33, '1': 0.08 };
	function chanceOn(offset) { return WILCOX[String(offset)] != null ? WILCOX[String(offset)] : 0.02; }

	/* ---------- cycle history ---------- */
	function sortStarts(a) { return a.filter(function (x, i, arr) { return x != null && arr.indexOf(x) === i; }).sort(function (x, y) { return x - y; }); }
	function stats(starts) {
		var s = sortStarts(starts), L = [], i;
		for (i = 1; i < s.length; i++) L.push(s[i] - s[i - 1]);
		if (!L.length) return null;
		var recent = L.slice(-6), sum = 0, r;
		recent.forEach(function (x) { sum += x; });
		var avg = sum / recent.length, mn = Math.min.apply(null, L), mx = Math.max.apply(null, L), v = 0;
		recent.forEach(function (x) { v += (x - avg) * (x - avg); });
		var sd = recent.length > 1 ? Math.sqrt(v / (recent.length - 1)) : 0;
		r = mx - mn;
		return { lengths: L, count: L.length, avg: avg, avgRound: Math.round(avg), min: mn, max: mx, sd: sd, range: r,
			regular: r <= 7 ? 'regular' : (r <= 20 ? 'varies' : 'irregular'), outside: L.filter(function (x) { return x < 21 || x > 38; }).length };
	}
	/* Several upcoming periods from the last logged start and the average cycle; the range uses the recent shortest / longest. */
	function futurePeriods(last, avg, n, rangeMin, rangeMax, plen) {
		var out = [], i, c = Math.round(avg);
		for (i = 1; i <= n; i++) out.push({ start: last + c * i, end: last + c * i + plen - 1, earliest: rangeMin ? last + rangeMin * i : null, latest: rangeMax ? last + rangeMax * i : null });
		return out;
	}

	/* ---------- due date ---------- */
	/* Naegele's rule: LMP + 280 days, shifted by how far the usual cycle is from 28 days. */
	function dueFromLMP(lmp, cycle) { return lmp + 280 + ((cycle || 28) - 28); }
	function dueFromConception(c) { return c + 266; }
	function dueFromTransfer(t, embryoDay) { return t + 280 - 14 - (embryoDay || 5); }          // day-5 transfer: +261, day-3: +263
	function dueFromUltrasound(scanDay, weeks, days) { return scanDay + 280 - (weeks * 7 + (days || 0)); }
	function lmpFromDue(edd) { return edd - 280; }
	function gestation(edd, on) {
		var ga = 280 - (edd - on), w = Math.floor(ga / 7);
		return { days: ga, weeks: ga < 0 ? 0 : w, rem: ga < 0 ? 0 : ga - w * 7, toGo: edd - on, trimester: ga < 14 * 7 ? 1 : (ga < 28 * 7 ? 2 : 3), pct: Math.max(0, Math.min(1, ga / 280)) };
	}
	function milestones(edd) {
		var l = lmpFromDue(edd);
		return [
			{ w: 4, label: 'Missed period: a home test can usually show positive', day: l + 28 },
			{ w: 6, label: 'Heartbeat usually visible on ultrasound from about now', day: l + 42 },
			{ w: 8, label: 'First prenatal visit is typically around now', day: l + 56 },
			{ w: 12, label: 'Dating scan / first-trimester screening window opens (weeks 11-14)', day: l + 77 },
			{ w: 14, label: 'Second trimester begins', day: l + 98 },
			{ w: 18, label: 'Anatomy (mid-pregnancy) scan window opens (weeks 18-22)', day: l + 126 },
			{ w: 24, label: 'Viability: a baby born now has a chance with intensive care', day: l + 168 },
			{ w: 28, label: 'Third trimester begins', day: l + 196 },
			{ w: 37, label: 'Early term: counted as full term from here', day: l + 259 },
			{ w: 39, label: 'Full term (weeks 39-40+6)', day: l + 273 },
			{ w: 40, label: 'Estimated due date', day: edd },
			{ w: 41, label: 'One week past the due date (induction is often discussed)', day: edd + 7 },
			{ w: 42, label: 'Two weeks past the due date', day: edd + 14 }
		];
	}
	function conceptionWindow(edd) { var c = edd - 266; return { likely: c, from: c - 5, to: c + 2 }; }

	/* ---------- calendar export (all-day events) ---------- */
	function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
	function icsDate(day) { return iso(day).replace(/-/g, ''); }
	function ics(events, name) {
		var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MES.fm//Cycle calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + icsEscape(name || 'MES calendar')], i, e;
		for (i = 0; i < events.length; i++) {
			e = events[i];
			out.push('BEGIN:VEVENT', 'UID:mes-' + icsDate(e.start) + '-' + i + '-' + (e.title || '').length + '@mes.fm', 'DTSTAMP:20260101T000000Z',
				'DTSTART;VALUE=DATE:' + icsDate(e.start), 'DTEND;VALUE=DATE:' + icsDate((e.end != null ? e.end : e.start) + 1), 'SUMMARY:' + icsEscape(e.title),
				'DESCRIPTION:' + icsEscape(e.note || 'An estimate from mes.fm. Not medical advice.'), 'TRANSP:TRANSPARENT', 'END:VEVENT');
		}
		out.push('END:VCALENDAR');
		return out.join('\r\n') + '\r\n';
	}

	return { MONTHS: MONTHS, WDAYS: WDAYS, toDay: toDay, parts: parts, iso: iso, parseISO: parseISO, today: today, fmt: fmt, fmtShort: fmtShort,
		predict: predict, predictRange: predictRange, project: project, chanceOn: chanceOn, WILCOX: WILCOX, sortStarts: sortStarts, stats: stats, futurePeriods: futurePeriods,
		dueFromLMP: dueFromLMP, dueFromConception: dueFromConception, dueFromTransfer: dueFromTransfer, dueFromUltrasound: dueFromUltrasound, lmpFromDue: lmpFromDue,
		gestation: gestation, milestones: milestones, conceptionWindow: conceptionWindow, ics: ics };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESCycle;
