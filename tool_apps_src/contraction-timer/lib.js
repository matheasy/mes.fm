/* MES Contraction Timer maths (pure; runs in the browser and in node). An entry is { s: start ms, e: end ms (null while it is still going) }. */
var MESContr = (function () {
	'use strict';
	var RULES = { '511': { label: '5-1-1', gap: 5, dur: 60, hours: 1 }, '411': { label: '4-1-1', gap: 4, dur: 60, hours: 1 }, '311': { label: '3-1-1', gap: 3, dur: 60, hours: 1 }, '5121': { label: '5-1-2 (some hospitals)', gap: 5, dur: 60, hours: 2 } };
	function sorted(list) { return list.filter(function (x) { return x && x.s; }).sort(function (a, b) { return a.s - b.s; }); }
	function dur(x, now) { return Math.max(0, Math.round(((x.e != null ? x.e : now) - x.s) / 1000)); }
	/* seconds from the start of the previous contraction to this one (null for the first) */
	function gaps(list) { var l = sorted(list); return l.map(function (x, i) { return i ? Math.round((x.s - l[i - 1].s) / 1000) : null; }); }
	function avg(a) { return a.length ? a.reduce(function (p, c) { return p + c; }, 0) / a.length : null; }
	/* summary of the contractions in the last `windowMin` minutes (finished ones only for durations) */
	function summary(list, now, windowMin) {
		var l = sorted(list), from = now - (windowMin || 60) * 60000, w = l.filter(function (x) { return x.s >= from; }), g = gaps(l).slice(l.length - w.length), d = w.filter(function (x) { return x.e != null; }).map(function (x) { return dur(x, now); });
		if (w.length && w[0] === l[0]) g = g.slice(1); else g = g.filter(function (x) { return x != null; });
		return { count: w.length, avgDur: avg(d), avgGap: avg(g), minGap: g.length ? Math.min.apply(null, g) : null, maxGap: g.length ? Math.max.apply(null, g) : null };
	}
	/* The 5-1-1 style rule: contractions every `gap` minutes or closer, each about `dur` seconds or longer, for `hours`. Looks at the unbroken run of qualifying contractions ending now. */
	function rule(list, now, key) {
		var r = RULES[key] || RULES['511'], l = sorted(list).filter(function (x) { return x.e != null; }), run = [], i, ok;
		for (i = l.length - 1; i >= 0; i--) {
			var gapSec = i ? (l[i].s - l[i - 1].s) / 1000 : null, nextGap = i < l.length - 1 ? (l[i + 1].s - l[i].s) / 1000 : (now - l[i].s) / 1000;
			ok = dur(l[i], now) >= r.dur * 0.8 && nextGap <= r.gap * 60 * 1.25;
			if (!ok) break; run.push(l[i]);
		}
		run.reverse();
		var span = run.length > 1 ? (run[run.length - 1].s - run[0].s) / 60000 : 0, need = r.hours * 60, met = run.length >= 4 && span >= need * 0.95;
		return { rule: r, met: met, run: run.length, spanMin: span, needMin: need, sinceLast: l.length ? (now - l[l.length - 1].s) / 60000 : null };
	}
	function fmtDur(sec) { sec = Math.round(sec); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
	function toCSV(list) { var l = sorted(list), g = gaps(l); return 'start,duration_seconds,seconds_since_previous_start\n' + l.map(function (x, i) { return new Date(x.s).toISOString() + ',' + (x.e != null ? dur(x, x.e) : '') + ',' + (g[i] != null ? g[i] : ''); }).join('\n'); }
	return { RULES: RULES, sorted: sorted, dur: dur, gaps: gaps, summary: summary, rule: rule, fmtDur: fmtDur, toCSV: toCSV };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESContr;
