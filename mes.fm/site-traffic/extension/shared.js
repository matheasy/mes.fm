/* MES Site Rank: pure helpers shared by the popup and the service worker (node-testable: tool_apps_src/site-traffic-ext-tests.js). Exposed as MESST. Rank only, never visits. */
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
	return { API: API, REPORT: REPORT, hostFromUrl: hostFromUrl, tier: tier, compact: compact, fmt: fmt, badge: badge, trend: trend, spark: spark };
})();
if (typeof module !== 'undefined') module.exports = MESST;
