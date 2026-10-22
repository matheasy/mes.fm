/* MES Site Traffic & Rank: helpers that turn the /api/site-traffic answer into plain-language findings (pure; node-testable). Exposed as MESTraffic.
   Everything here is about RANK (a position in a list), never visits: no function in this file estimates a visit count. */
var MESTraffic = (function () {
	'use strict';
	var TIERS = [
		[1000, 'Top 1,000', 'one of the most visited sites on the whole Internet'],
		[10000, 'Top 10,000', 'a very popular site, known to a large share of Internet users'],
		[100000, 'Top 100,000', 'a popular site with a large regular audience'],
		[1000000, 'Top 1 million', 'a well-established site with a real audience'],
		[5000000, 'Top 5 million', 'a smaller site that still ranks above most of the web'],
		[Infinity, 'Outside the list', 'too small to appear in public popularity lists']
	];
	function tier(rank) { for (var i = 0; i < TIERS.length; i++) if (rank <= TIERS[i][0]) return { max: TIERS[i][0], label: TIERS[i][1], text: TIERS[i][2], i: i }; }
	function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
	function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n); }
	/* history = [{date, rank}] oldest first. change > 0 means the site climbed (a smaller rank number is better). */
	function trend(history) {
		if (!history || history.length < 2) return null;
		var first = history[0], last = history[history.length - 1], best = history[0], worst = history[0];
		history.forEach(function (h) { if (h.rank < best.rank) best = h; if (h.rank > worst.rank) worst = h; });
		var change = first.rank - last.rank, pct = first.rank ? change / first.rank * 100 : 0;
		var dir = Math.abs(pct) < 3 ? 'steady' : pct > 0 ? 'rising' : 'falling';
		return { first: first, last: last, best: best, worst: worst, change: change, pct: pct, dir: dir, days: history.length };
	}
	function trendText(t) {
		if (!t) return 'Not enough history to show a trend.';
		var span = t.days + ' days';
		if (t.dir === 'steady') return 'Steady over the last ' + span + ' (rank moved by less than 3%).';
		return (t.dir === 'rising' ? 'Climbing' : 'Dropping') + ': from #' + fmt(t.first.rank) + ' to #' + fmt(t.last.rank) + ' over ' + span + ' (' + (t.pct > 0 ? '+' : '') + t.pct.toFixed(0) + '% in rank terms).';
	}
	/* the chart puts rank 1 at the top: y grows with the rank number */
	function spark(history, w, h, pad) {
		pad = pad == null ? 6 : pad; if (!history || history.length < 2) return null;
		var lo = Infinity, hi = -Infinity; history.forEach(function (p) { lo = Math.min(lo, p.rank); hi = Math.max(hi, p.rank); });
		if (hi === lo) { hi = lo + 1; }
		var pts = history.map(function (p, i) { return { x: pad + (w - 2 * pad) * i / (history.length - 1), y: pad + (h - 2 * pad) * (p.rank - lo) / (hi - lo), rank: p.rank, date: p.date }; });
		return { pts: pts, path: pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' '), lo: lo, hi: hi };
	}
	/* "2003 to 2026" with the years that have no capture listed */
	function yearsText(years) {
		if (!years || !years.length) return '';
		var a = years[0], b = years[years.length - 1], miss = [];
		for (var y = a; y <= b; y++) if (years.indexOf(y) < 0) miss.push(y);
		return a + (b > a ? ' to ' + b : '') + (miss.length ? ' (no capture in ' + (miss.length > 4 ? miss.length + ' of those years' : miss.join(', ')) + ')' : '');
	}
	/* Signals shown at the top. level: good | info | warn. d = {api answer, domain: lookup answer or null} */
	function signals(api, domainLookup, now) {
		var s = [], r = api && api.rank;
		if (api && api.shared) s.push({ level: 'warn', text: api.apex + ' is a shared platform: its rank is the whole platform, not this page or account. A site under it is usually far smaller.' });
		else if (api && api.subdomain) s.push({ level: 'info', text: 'Public rank lists work on whole domains, so the rank below is for ' + api.apex + ', not for the subdomain ' + api.domain + '.' });
		if (r && r.ranked) { var t = tier(r.rank); s.push({ level: t.i <= 3 ? 'good' : 'info', text: 'Ranked #' + fmt(r.rank) + ' on the ' + r.date + ' Tranco list: ' + t.text + '.' }); }
		else if (r && r.unavailable) s.push({ level: 'warn', text: 'The rank service did not answer. Try again in a minute.' });
		else s.push({ level: 'info', text: 'Not in the Tranco list (it ranks roughly the few million most visited domains). That means a small or new site, not necessarily a bad one.' });
		var tr = r && r.ranked ? trend(r.history) : null;
		if (tr && tr.dir !== 'steady') s.push({ level: tr.dir === 'rising' ? 'good' : 'info', text: trendText(tr) });
		if (domainLookup && domainLookup.rdap && domainLookup.rdap.created) {
			var days = Math.floor(((now || Date.now()) - new Date(domainLookup.rdap.created)) / 86400000);
			if (days < 90) s.push({ level: 'warn', text: 'The domain was registered only ' + days + ' days ago, so a high rank for it would be unusual.' });
		}
		return s;
	}
	function links(domain) {
		var d = encodeURIComponent(domain);
		return [
			['Similarweb', 'https://www.similarweb.com/website/' + d + '/', 'Visit estimates from its own panel (free tier limited, sign-in for more)'],
			['Cloudflare Radar', 'https://radar.cloudflare.com/domains/domain/' + d, 'Cloudflare\'s own popularity ranking and DNS traffic data'],
			['Tranco', 'https://tranco-list.eu/query_rank?domain=' + d, 'The list this page uses, with its full 30-day history'],
			['Majestic', 'https://majestic.com/reports/site-explorer?q=' + d, 'Backlinks: how many other sites link here'],
			['Chrome UX Report', 'https://developer.chrome.com/docs/crux/', 'Real Chrome speed data and popularity buckets (needs the API)'],
			['Google PageSpeed', 'https://pagespeed.web.dev/analysis?url=https%3A%2F%2F' + d, 'Speed and real-user Core Web Vitals'],
			['Internet Archive', 'https://web.archive.org/web/*/' + d, 'Every saved copy of the site'],
			['Domain Lookup', '/domain-lookup?d=' + d, 'Owner records, DNS and hosting in more depth']
		];
	}
	return { tier: tier, fmt: fmt, compact: compact, trend: trend, trendText: trendText, spark: spark, yearsText: yearsText, signals: signals, links: links, TIERS: TIERS };
})();
if (typeof module !== 'undefined') module.exports = MESTraffic;
