/* MES Baby Feeding Log maths (pure; node-testable). Entry: { t: 'bl' left breast | 'br' right breast | 'bt' bottle | 'pm' pump | 'wet' | 'dirty', s: start ms, e: end ms or null, ml: millilitres or null }. Exposed as MESFeed. */
var MESFeed = (function () {
	'use strict';
	var FEED = { bl: 1, br: 1, bt: 1 };
	function sorted(l) { return l.filter(function (x) { return x && x.s; }).sort(function (a, b) { return a.s - b.s; }); }
	function dur(x, now) { return Math.max(0, Math.round(((x.e != null ? x.e : now) - x.s) / 1000)); }
	/* breast sides within `gapMin` minutes of each other count as one feed (left then right is one feed) */
	function feeds(list, gapMin) {
		var l = sorted(list).filter(function (x) { return FEED[x.t]; }), out = [], cur = null, g = (gapMin || 20) * 60000;
		l.forEach(function (x) { var end = x.e != null ? x.e : x.s; if (cur && x.s - cur.end <= g && x.t !== 'bt' && cur.last !== 'bt') { cur.items.push(x); cur.end = Math.max(cur.end, end); cur.last = x.t; } else { cur = { start: x.s, end: end, items: [x], last: x.t }; out.push(cur); } });
		return out;
	}
	function nextSide(list) { var b = sorted(list).filter(function (x) { return x.t === 'bl' || x.t === 'br'; }); if (!b.length) return null; return b[b.length - 1].t === 'bl' ? 'br' : 'bl'; }
	function dayStart(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
	function between(list, a, b) { return sorted(list).filter(function (x) { return x.s >= a && x.s < b; }); }
	function summary(list, a, b, now) {
		var l = between(list, a, b), f = feeds(l, 20), breast = l.filter(function (x) { return x.t === 'bl' || x.t === 'br'; }), sec = 0, ml = 0, pump = 0, i, gaps = [];
		breast.forEach(function (x) { if (x.e != null) sec += dur(x, now); });
		l.forEach(function (x) { if (x.t === 'bt' && x.ml) ml += x.ml; if (x.t === 'pm' && x.ml) pump += x.ml; });
		for (i = 1; i < f.length; i++) gaps.push((f[i].start - f[i - 1].start) / 60000);
		return { feeds: f.length, breastSec: sec, bottleMl: ml, pumpMl: pump, wet: l.filter(function (x) { return x.t === 'wet'; }).length, dirty: l.filter(function (x) { return x.t === 'dirty'; }).length, avgGapMin: gaps.length ? gaps.reduce(function (p, c) { return p + c; }, 0) / gaps.length : null, bottles: l.filter(function (x) { return x.t === 'bt'; }).length };
	}
	function lastFeed(list) { var f = feeds(list, 20); return f.length ? f[f.length - 1] : null; }
	function mlToOz(ml) { return ml / 29.5735; } function ozToMl(oz) { return oz * 29.5735; }
	function fmtDur(sec) { sec = Math.round(sec); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
	function fmtAgo(min) { if (min < 1) return 'just now'; if (min < 60) return Math.round(min) + ' min ago'; var h = Math.floor(min / 60), m = Math.round(min % 60); return h + ' h' + (m ? ' ' + m + ' min' : '') + ' ago'; }
	function toCSV(list) { return 'type,start,duration_seconds,ml\n' + sorted(list).map(function (x) { return x.t + ',' + new Date(x.s).toISOString() + ',' + (x.e != null ? dur(x, x.e) : '') + ',' + (x.ml != null ? Math.round(x.ml) : ''); }).join('\n'); }
	return { sorted: sorted, dur: dur, feeds: feeds, nextSide: nextSide, dayStart: dayStart, between: between, summary: summary, lastFeed: lastFeed, mlToOz: mlToOz, ozToMl: ozToMl, fmtDur: fmtDur, fmtAgo: fmtAgo, toCSV: toCSV };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESFeed;
