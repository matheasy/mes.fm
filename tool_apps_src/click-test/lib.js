/* MES Click Speed Test maths (pure; browser + node: require('./tool_apps_src/click-test/lib.js')).
   A test = a list of click times in ms since the first click (the first click starts the clock, so times[0] = 0)
   and the test length in ms. */
var MESClick = (function () {
	'use strict';
	var MODES = [1, 5, 10, 30, 60, 100];
	var KINDS = { mouse: 'Mouse', touch: 'One finger', multi: 'Several fingers', key: 'Keyboard' };
	function num(x) { return typeof x === 'number' && isFinite(x); }
	function clampSecs(v) { v = Number(v); if (!num(v)) return 10; return Math.min(600, Math.max(1, Math.round(v))); }

	/* clicks inside a sliding window: most clicks in any `win` ms. two-pointer over sorted times */
	function peak(times, win) {
		var best = 0, j = 0;
		for (var i = 0; i < times.length; i++) {
			while (times[i] - times[j] >= win) j++;
			if (i - j + 1 > best) best = i - j + 1;
		}
		return best;
	}
	/* summary of one finished test */
	function stats(times, durMs) {
		times = (times || []).filter(num).slice().sort(function (a, b) { return a - b; });
		var n = times.length, dur = num(durMs) && durMs > 0 ? durMs : 1000, gaps = [];
		for (var i = 1; i < n; i++) gaps.push(times[i] - times[i - 1]);
		var gsum = 0; gaps.forEach(function (g) { gsum += g; });
		var gavg = gaps.length ? gsum / gaps.length : null, gsd = null, cv = null;
		if (gaps.length > 1) {
			var v = 0; gaps.forEach(function (g) { v += (g - gavg) * (g - gavg); });
			gsd = Math.sqrt(v / gaps.length); cv = gavg > 0 ? gsd / gavg : null;
		}
		var p1 = dur >= 1000 ? peak(times, 1000) : n;
		return { clicks: n, secs: dur / 1000, cps: n / (dur / 1000), peak1s: p1,
			gapAvg: gavg, gapMin: gaps.length ? Math.min.apply(null, gaps) : null, gapSd: gsd,
			/* consistency 0-100: 100 = perfectly even rhythm */
			consistency: cv == null ? null : Math.max(0, Math.round(100 - cv * 100)) };
	}
	/* CPS over time: clicks in the 1 s before each sample point, every `step` ms from 0 to dur.
	   Before 1 s has passed the window is the time so far (scaled), so the line starts sensibly. */
	function series(times, durMs, step) {
		step = step || 100; var out = [], j = 0, i = 0;
		times = (times || []).slice().sort(function (a, b) { return a - b; });
		for (var t = step; t <= durMs + 1e-6; t += step) {
			while (i < times.length && times[i] < t) i++;
			var from = t - 1000; while (j < i && times[j] < from) j++;
			var w = Math.min(1000, t);
			out.push({ t: t, cps: (i - j) / (w / 1000) });
		}
		return out;
	}
	/* clicks per whole second (bars): [n in 0-1 s, n in 1-2 s, ...] */
	function perSecond(times, durMs) {
		var k = Math.max(1, Math.ceil(durMs / 1000 - 1e-9)), out = [];
		for (var i = 0; i < k; i++) out.push(0);
		(times || []).forEach(function (t) { var b = Math.min(k - 1, Math.floor(t / 1000)); if (b >= 0) out[b]++; });
		return out;
	}
	/* approximate speed bands (community figures, not measured records) */
	var TIERS = [
		[0, 'Warming up', 'Slower than most people. Relax your hand and try again.'],
		[4, 'Normal', 'A normal clicking speed.'],
		[6.5, 'Quick', 'Faster than most people with plain clicking.'],
		[8.5, 'Fast', 'Very fast for normal clicking. Jitter clicking usually starts here.'],
		[11, 'Very fast', 'Jitter or butterfly speed.'],
		[14, 'Butterfly', 'Two-finger (butterfly) speed.'],
		[20, 'Drag clicking', 'This speed usually means drag clicking, several fingers or an auto-clicker.']
	];
	function tier(cps) { var t = TIERS[0]; TIERS.forEach(function (x) { if (cps >= x[0]) t = x; }); return { name: t[1], text: t[2] }; }
	/* comparisons. ok = verified figure; approx = rough community figure */
	var REFS = [
		{ id: 'avg', label: 'Typical person (approximate)', cps: 6.5, approx: true },
		{ id: 'jitter', label: 'Jitter clicking (approximate)', cps: 11, approx: true },
		{ id: 'gwr', label: 'Guinness record: 760 clicks in 60 s (Yiğit Arslan, 2026)', cps: 760 / 60, approx: false },
		{ id: 'butterfly', label: 'Butterfly clicking (approximate)', cps: 16, approx: true },
		{ id: 'drag', label: 'Drag clicking (approximate)', cps: 25, approx: true }
	];
	function key(secs, kind) { return clampSecs(secs) + '|' + (KINDS[kind] ? kind : 'mouse'); }
	/* best scores: {key: {clicks, cps, peak1s, d}}; returns {bests, best: bool, prev} */
	function addBest(bests, k, res, when) {
		var b = Object.assign({}, bests || {}), prev = b[k] || null, isBest = !prev || res.clicks > prev.clicks;
		if (isBest && res.clicks > 0) b[k] = { clicks: res.clicks, cps: Math.round(res.cps * 100) / 100, peak1s: res.peak1s, d: when || 0 };
		return { bests: b, best: isBest && res.clicks > 0, prev: prev };
	}
	/* how far ahead / behind a best run you are at elapsed ms (straight-line pace) */
	function pace(clicksNow, elapsedMs, best, durMs) {
		if (!best || !best.clicks || !durMs) return null;
		return clicksNow - best.clicks * Math.min(1, elapsedMs / durMs);
	}
	function fmt(x, d) { if (!num(x)) return '–'; d = d == null ? 2 : d; return x.toFixed(d); }
	function fmtSecs(s) { return s >= 60 && s % 60 === 0 ? (s / 60) + ' min' : s + ' s'; }
	function niceMax(v) { if (!(v > 0)) return 5; var s = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100]; for (var i = 0; i < s.length; i++) if (v <= s[i]) return s[i]; return Math.ceil(v / 50) * 50; }
	function shareText(res, kind) {
		return 'I clicked ' + res.clicks + ' times in ' + fmtSecs(res.secs) + ' (' + fmt(res.cps) + ' clicks per second, ' +
			(KINDS[kind] || 'Mouse').toLowerCase() + ') on the MES Click Speed Test: https://mes.fm/click-test?t=' + res.secs;
	}
	return { MODES: MODES, KINDS: KINDS, clampSecs: clampSecs, peak: peak, stats: stats, series: series, perSecond: perSecond,
		TIERS: TIERS, tier: tier, REFS: REFS, key: key, addBest: addBest, pace: pace, fmt: fmt, fmtSecs: fmtSecs, niceMax: niceMax, shareText: shareText };
})();
if (typeof module !== 'undefined') module.exports = MESClick;
