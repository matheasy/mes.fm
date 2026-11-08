/* MES Site Rank: pure helpers shared by the popup and the service worker (node-testable: tool_apps_src/site-traffic-ext-tests.js). Exposed as MESST. Visits = a rough range estimated from the rank (same curve as tool_apps_src/site-traffic/lib.js: change both). */
var MESST = (function () {
	'use strict';
	var API = 'https://mes.fm/api/site-traffic?d=', REPORT = 'https://mes.fm/site-traffic?d=';
	var TIERS = [[1000, 'Top 1,000', '#15803d'], [10000, 'Top 10,000', '#15803d'], [100000, 'Top 100,000', '#0f766e'], [1000000, 'Top 1 million', '#1d4ed8'], [5000000, 'Top 5 million', '#6d28d9'], [Infinity, 'Outside the list', '#64748b']];
	/* only the host name of a normal web page is ever looked up: never the full address, never IPs / local names / browser pages */
	function hostFromUrl(url) {
		var u; try { u = new URL(url); } catch (e) { return null; }
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
		var h = u.hostname.toLowerCase().replace(/\.$/, '');
		if (!h || h.indexOf('.') < 0 || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.indexOf(':') >= 0 || h.charAt(0) === '[') return null;
		if (/(^|\.)(localhost|local|internal|test|invalid|example|onion|lan|home|corp)$/.test(h)) return null;
		return h;
	}
	var CURVE = [[1, 5e10], [10, 1e10], [30, 1.6e9], [250, 4e8], [2500, 6e7], [22000, 1.5e7], [175000, 1.5e6], [1e6, 1.5e5], [5e6, 1e4]];
	function round2(n) { if (!(n > 0)) return 0; var p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }
	function estimate(rank) {
		if (!(rank >= 1)) return null; var lr = Math.log10(rank), c = CURVE, lv;
		if (rank >= c[c.length - 1][0]) lv = Math.log10(c[c.length - 1][1]);
		else for (var i = 1; i < c.length; i++) if (rank <= c[i][0]) { var a = c[i - 1], b = c[i], t = (lr - Math.log10(a[0])) / (Math.log10(b[0]) - Math.log10(a[0])); lv = Math.log10(a[1]) + t * (Math.log10(b[1]) - Math.log10(a[1])); break; }
		var mid = Math.pow(10, lv), f = rank > 100000 ? 4 : 3; return { mid: round2(mid), low: round2(mid / f), high: round2(mid * f) };
	}
	function big(n) { return n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B' : compact(n); }
	function estText(e) { return e ? big(e.low) + ' to ' + big(e.high) : ''; }
	function tier(rank) { for (var i = 0; i < TIERS.length; i++) if (rank <= TIERS[i][0]) return { label: TIERS[i][1], color: TIERS[i][2], i: i }; }
	function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n); }
	function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
	/* badge = {text (max 4 chars shown), color, title}; unranked -> a dash, unavailable -> null (leave the badge empty) */
	function badge(res) {
		if (!res || !res.rank || res.rank.unavailable) return null;
		if (!res.rank.ranked) return { text: '-', color: '#64748b', title: res.apex + ' is not in the Tranco list' };
		var t = tier(res.rank.rank); return { text: compact(res.rank.rank), color: t.color, title: res.apex + ': rank #' + fmt(res.rank.rank) + ' (' + t.label + ')' };
	}
	function trend(h) {
		if (!h || h.length < 2) return null; var a = h[0].rank, b = h[h.length - 1].rank, pct = a ? (a - b) / a * 100 : 0;
		return { pct: pct, dir: Math.abs(pct) < 3 ? 'steady' : pct > 0 ? 'rising' : 'falling', days: h.length };
	}
	function spark(h, w, ht, pad) {
		if (!h || h.length < 2) return ''; var lo = Infinity, hi = -Infinity; h.forEach(function (p) { lo = Math.min(lo, p.rank); hi = Math.max(hi, p.rank); }); if (hi === lo) hi = lo + 1;
		return h.map(function (p, i) { return (i ? 'L' : 'M') + (pad + (w - 2 * pad) * i / (h.length - 1)).toFixed(1) + ' ' + (pad + (ht - 2 * pad) * (p.rank - lo) / (hi - lo)).toFixed(1); }).join(' ');
	}
	return { CURVE: CURVE, estimate: estimate, big: big, estText: estText, API: API, REPORT: REPORT, hostFromUrl: hostFromUrl, tier: tier, compact: compact, fmt: fmt, badge: badge, trend: trend, spark: spark };
})();
if (typeof module !== 'undefined') module.exports = MESST;
