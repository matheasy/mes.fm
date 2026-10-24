/* MES Market Signals: pure parsing, scoring and formatting (no DOM, no network). Used by the page (window.MESSig) AND by the
   aggregator function mes.fm/api/signals.js, which requires a byte-identical copy at mes.fm/api/_signals-lib.js (the tests check: after
   editing this file run `cp tool_apps_src/signals/lib.js mes.fm/api/_signals-lib.js`). Tests: node tool_apps_src/signals-tests.js.
   Informational only: nothing here recommends buying or selling anything. */
(function (root) {
	'use strict';
	var S = {};

	// ---------- small helpers ----------
	function num(x) { if (x === null || x === undefined || x === '' || x === '.') return null; var n = +x; return isFinite(n) ? n : null; }
	function round(x, d) { if (x === null || !isFinite(x)) return null; var k = Math.pow(10, d == null ? 2 : d); return Math.round(x * k) / k; }
	S.num = num; S.round = round;
	// keep at most n points of a [[date, v], ...] series, evenly spaced, always the last one
	S.thin = function (a, n) {
		if (!a || a.length <= n) return a ? a.slice() : [];
		var out = [], step = (a.length - 1) / (n - 1), i;
		for (i = 0; i < n; i++) out.push(a[Math.round(i * step)]);
		return out;
	};
	S.last = function (a) { for (var i = a ? a.length - 1 : -1; i >= 0; i--) if (a[i] && a[i][1] !== null) return a[i]; return null; };
	S.sinceDate = function (a, ymd) { return (a || []).filter(function (p) { return p[0] >= ymd; }); };
	S.ymd = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
	S.addDays = function (ymd, n) { return S.ymd(Date.parse(ymd + 'T00:00:00Z') + n * 864e5); };

	// ---------- parsers (server side, but pure) ----------
	// FRED "fredgraph.csv?id=X" -> [[YYYY-MM-DD, number|null], ...] (FRED writes "." or "" for a missing day)
	S.parseFredCsv = function (text) {
		var out = [], lines = String(text || '').split(/\r?\n/), i, c;
		if (!/^observation_date|^DATE/i.test(lines[0] || '')) throw new Error('not a FRED csv');
		for (i = 1; i < lines.length; i++) { c = lines[i].split(','); if (/^\d{4}-\d\d-\d\d$/.test(c[0])) out.push([c[0], num(c[1])]); }
		return out;
	};
	S.dropNull = function (a) { return (a || []).filter(function (p) { return p[1] !== null; }); };

	// alternative.me Crypto Fear & Greed -> {now, hist oldest first}
	S.parseFng = function (j) {
		var d = (j && j.data) || [], hist = [];
		d.forEach(function (x) { var v = num(x.value), t = num(x.timestamp); if (v !== null && t) hist.push([S.ymd(t * 1000), v]); });
		hist.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
		if (!hist.length) throw new Error('no Fear & Greed values');
		var n = hist[hist.length - 1];
		return { now: { v: n[1], label: S.fgLabel(n[1]), date: n[0] }, hist: hist };
	};

	// CoinGecko /coins/markets (sparkline=true) -> compact coins
	S.parseCoins = function (arr) {
		if (!Array.isArray(arr) || !arr.length) throw new Error('no coins');
		return arr.map(function (c) {
			var sp = (c.sparkline_in_7d && c.sparkline_in_7d.price) || [];
			return { id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, price: num(c.current_price), ch24: round(num(c.price_change_percentage_24h_in_currency != null ? c.price_change_percentage_24h_in_currency : c.price_change_percentage_24h), 2),
				ch7: round(num(c.price_change_percentage_7d_in_currency), 2), mcap: num(c.market_cap), rank: num(c.market_cap_rank), high: num(c.ath), athPct: round(num(c.ath_change_percentage), 1),
				spark: S.thin(sp.map(function (v, i) { return [i, round(v, v < 1 ? 5 : 2)]; }), 56).map(function (p) { return p[1]; }) };
		});
	};
	S.parseGlobal = function (j) {
		var d = j && j.data; if (!d || !d.total_market_cap) throw new Error('no global data');
		return { mcap: num(d.total_market_cap.usd), vol: num(d.total_volume && d.total_volume.usd), mcapCh24: round(num(d.market_cap_change_percentage_24h_usd), 2),
			btcDom: round(num(d.market_cap_percentage && d.market_cap_percentage.btc), 2), ethDom: round(num(d.market_cap_percentage && d.market_cap_percentage.eth), 2), coins: num(d.active_cryptocurrencies) };
	};
	S.parseStables = function (arr) {
		if (!Array.isArray(arr) || !arr.length) throw new Error('no stablecoins');
		var total = 0, top = [];
		arr.forEach(function (c) { var m = num(c.market_cap); if (m) { total += m; if (top.length < 6) top.push([String(c.symbol || '').toUpperCase(), m]); } });
		return { total: total, top: top, n: arr.length };
	};

	// Yahoo Finance v8 chart (keyless, unofficial) -> {price, prev, chPct, date, spark:[[ymd, close]]}
	S.parseYahoo = function (j) {
		var r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.meta) throw new Error('no chart');
		var ts = r.timestamp || [], cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [], sp = [], i;
		for (i = 0; i < ts.length; i++) if (cl[i] != null) sp.push([S.ymd(ts[i] * 1000), round(cl[i], 2)]);
		var price = num(r.meta.regularMarketPrice), prev = sp.length > 1 ? sp[sp.length - 2][1] : num(r.meta.chartPreviousClose);
		if (price === null) throw new Error('no price');
		if (sp.length && sp[sp.length - 1][0] === S.ymd((r.meta.regularMarketTime || 0) * 1000)) prev = sp.length > 1 ? sp[sp.length - 2][1] : prev;
		return { price: round(price, 2), prev: prev, chPct: prev ? round((price / prev - 1) * 100, 2) : null, date: r.meta.regularMarketTime ? new Date(r.meta.regularMarketTime * 1000).toISOString() : null, spark: sp, src: 'Yahoo Finance' };
	};
	// a FRED daily series as the same quote shape (the fallback when Yahoo does not answer); FRED is about a day behind
	S.quoteFromFred = function (rows) {
		var a = S.dropNull(rows); if (a.length < 2) throw new Error('no FRED values');
		var l = a[a.length - 1], p = a[a.length - 2];
		return { price: l[1], prev: p[1], chPct: round((l[1] / p[1] - 1) * 100, 2), date: l[0], spark: a.slice(-66), src: 'FRED' };
	};

	// Bank of Canada Valet observations -> [[date, v]]
	S.parseValet = function (j, key) {
		var o = (j && j.observations) || [], out = [];
		o.forEach(function (x) { var v = x[key] && num(x[key].v); if (x.d && v !== null) out.push([x.d, v]); });
		if (!out.length) throw new Error('no Valet values');
		return out;
	};
	// ECB data API csvdata (key rate "date of changes" series) -> [[date, v]]
	S.parseEcbCsv = function (text) {
		var lines = String(text || '').split(/\r?\n/), h = (lines[0] || '').split(','), ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE'), out = [];
		if (ti < 0 || vi < 0) throw new Error('not an ECB csv');
		for (var i = 1; i < lines.length; i++) { var c = lines[i].split(','); if (/^\d{4}-\d\d-\d\d$/.test(c[ti] || '')) out.push([c[ti], num(c[vi])]); }
		return S.dropNull(out);
	};
	// Bank of England IADB csv (DATE, IUDBEDR; "02 Jan 2025") -> [[date, v]]
	var MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
	S.parseBoeCsv = function (text) {
		var lines = String(text || '').split(/\r?\n/), out = [];
		if (!/^DATE/i.test(lines[0] || '')) throw new Error('not a BoE csv');
		for (var i = 1; i < lines.length; i++) { var m = /^(\d\d) (\w{3}) (\d{4}),([\d.]+)/.exec(lines[i]); if (m && MON[m[2]]) out.push([m[3] + '-' + MON[m[2]] + '-' + m[1], num(m[4])]); }
		if (!out.length) throw new Error('no BoE values');
		return out;
	};
	// latest value of a step series (policy rates) + when it last changed and from what
	S.policy = function (a) {
		a = S.dropNull(a); if (!a.length) throw new Error('empty');
		var l = a[a.length - 1], i = a.length - 1;
		while (i > 0 && a[i - 1][1] === l[1]) i--;
		return { rate: l[1], date: l[0], since: a[i][0], prev: i > 0 ? a[i - 1][1] : null };
	};

	// RSS / Atom -> [{title, link, date}] (titles and links only; tags stripped, http(s) links only)
	function decode(s) {
		return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
			.replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
	}
	S.decode = decode;
	S.parseRss = function (xml, n) {
		var items = String(xml || '').match(/<(item|entry)\b[\s\S]*?<\/\1>/g) || [], out = [];
		items.forEach(function (it) {
			var t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(it), l = /<link[^>]*>([\s\S]*?)<\/link>/.exec(it) || /<link[^>]*href="([^"]+)"/.exec(it), d = /<(pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/\1>/.exec(it);
			var link = l ? decode(l[1]) : '', title = t ? decode(t[1]) : '';
			if (!title || !/^https?:\/\//i.test(link)) return;
			var ms = d ? Date.parse(decode(d[2])) : NaN;
			out.push({ title: title.slice(0, 220), link: link, date: isFinite(ms) ? new Date(ms).toISOString() : null });
		});
		return out.slice(0, n || 8);
	};

	// Polymarket gamma /events -> [{id, title, url, vol24, end, outcomes:[{label, p}]}]
	function jsonArr(x) { if (Array.isArray(x)) return x; try { var a = JSON.parse(x); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
	S.parsePolymarket = function (events, cat) {
		if (!Array.isArray(events)) throw new Error('not a list');
		var out = [];
		events.forEach(function (e) {
			if (!e || e.closed || !e.slug) return;
			var ms = (e.markets || []).filter(function (m) { return m && m.active && !m.closed; }), oc = [];
			if (!ms.length) return;
			if (ms.length === 1) {
				var names = jsonArr(ms[0].outcomes), pr = jsonArr(ms[0].outcomePrices);
				names.forEach(function (nm, i) { var p = num(pr[i]); if (p !== null) oc.push({ label: String(nm), p: round(p * 100, 1) }); });
			} else ms.forEach(function (m) { var p = num(jsonArr(m.outcomePrices)[0]); if (p !== null) oc.push({ label: String(m.groupItemTitle || m.question || '').slice(0, 80), p: round(p * 100, 1) }); });
			oc.sort(function (a, b) { return b.p - a.p; });
			if (!oc.length) return;
			out.push({ id: 'pm' + e.id, src: 'Polymarket', cat: cat || '', title: String(e.title || '').slice(0, 160), url: 'https://polymarket.com/event/' + encodeURIComponent(e.slug), vol24: round(num(e.volume24hr), 0), vol: round(num(e.volume), 0), end: e.endDate || null, outcomes: oc.slice(0, 5), more: Math.max(0, oc.length - 5) });
		});
		return out;
	};
	// Kalshi public /events?with_nested_markets=true -> same shape. Ladder events ("Above 3.00%") get the most likely bracket too.
	S.parseKalshi = function (j, cat) {
		var ev = (j && j.events) || [], out = [];
		ev.forEach(function (e) {
			var ms = (e.markets || []).filter(function (m) { return m.status === 'active' || m.status === 'open'; }), oc = [];
			ms.forEach(function (m) {
				var b = num(m.yes_bid_dollars), a = num(m.yes_ask_dollars), l = num(m.last_price_dollars), p = (b !== null && a !== null && a > 0) ? (b + a) / 2 : l;
				if (p !== null) oc.push({ label: String(m.yes_sub_title || m.title || '').slice(0, 80), p: round(p * 100, 1) });
			});
			if (!oc.length) return;
			var series = String(e.series_ticker || e.event_ticker || '').split('-')[0].toLowerCase();
			var item = { id: 'k' + e.event_ticker, src: 'Kalshi', cat: cat || '', title: String(e.title || '').slice(0, 160), sub: e.sub_title || '', url: 'https://kalshi.com/markets/' + encodeURIComponent(series), end: (ms[0] && ms[0].close_time) || null, outcomes: oc };
			if (oc.length > 2 && oc.every(function (o) { return /^Above /.test(o.label); })) item.ladder = true;
			if (!item.ladder) { oc.sort(function (a, b) { return b.p - a.p; }); item.more = Math.max(0, oc.length - 5); item.outcomes = oc.slice(0, 5); }
			else item.likely = S.ladderBucket(oc);
			out.push(item);
		});
		return out;
	};
	// "Above X" ladder (chance falls as X rises) -> most likely bracket between two strikes
	S.ladderBucket = function (oc) {
		var a = oc.map(function (o) { return { x: num(String(o.label).replace(/[^\d.\-]/g, '')), p: o.p }; }).filter(function (o) { return o.x !== null; }).sort(function (u, v) { return u.x - v.x; });
		if (!a.length) return null;
		var pc = /%/.test(oc[0].label), dp = a.some(function (o) { return Math.round(o.x * 10) !== o.x * 10; }) ? 2 : 1, f = function (x) { return x.toFixed(dp) + (pc ? '%' : ''); };
		var best = { label: 'Below ' + f(a[0].x), p: round(100 - a[0].p, 1) }, i;
		for (i = 0; i < a.length; i++) {
			var nx = a[i + 1], p = round(a[i].p - (nx ? nx.p : 0), 1), lab = nx ? f(a[i].x) + ' to ' + f(nx.x) : 'Above ' + f(a[i].x);
			if (p > best.p) best = { label: lab, p: p };
		}
		return best;
	};

	// Bitcoin halving from the chain tip (mempool.space) -> countdown numbers
	S.halving = function (height, avgMs, now) {
		height = num(height); if (!height) throw new Error('no block height');
		var avg = num(avgMs) && avgMs > 60000 && avgMs < 3600000 ? avgMs : 600000, target = (Math.floor(height / 210000) + 1) * 210000, left = target - height, epoch = target / 210000;
		return { height: height, target: target, left: left, avgSec: Math.round(avg / 1000), eta: (now == null ? Date.now() : now) + left * avg, reward: 50 / Math.pow(2, epoch - 1), next: 50 / Math.pow(2, epoch), epochPct: round((1 - left / 210000) * 100, 1) };
	};

	// ---------- scoring ----------
	S.fgLabel = function (v) { return v < 25 ? 'Extreme fear' : v < 45 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme greed'; };
	S.fgClass = function (v) { return v < 25 ? 'xf' : v < 45 ? 'f' : v <= 55 ? 'n' : v <= 75 ? 'g' : 'xg'; };
	// percentile rank of x in the window (share below, half of the ties), 0-100
	S.pctRank = function (win, x) { var lo = 0, eq = 0; win.forEach(function (w) { if (w < x) lo++; else if (w === x) eq++; }); return win.length ? (lo + eq / 2) / win.length * 100 : null; };
	S.sma = function (vals, n) { var out = [], s = 0; for (var i = 0; i < vals.length; i++) { s += vals[i]; if (i >= n) s -= vals[i - n]; out.push(i >= n - 1 ? s / n : null); } return out; };
	// forward-fill a [[date, v]] series onto the given dates (value known on or before each date)
	S.alignTo = function (dates, series) {
		var a = S.dropNull(series), j = 0, cur = null;
		return dates.map(function (d) { while (j < a.length && a[j][0] <= d) { cur = a[j][1]; j++; } return cur; });
	};
	S.STOCK_FG_METHOD = 'Three parts, equal weight. Each is ranked against its own last 252 trading days (about a year): 0 = the most fearful reading of the year, 100 = the most greedy. ' +
		'(1) Market momentum: the S&P 500 compared with its 125-day average. (2) Volatility: the VIX (lower VIX = more greed, so its rank is flipped). ' +
		'(3) Junk-bond demand: the ICE BofA US High Yield spread over Treasuries (a narrower spread = more greed, flipped too). Data: FRED (S&P Dow Jones Indices, Cboe, ICE).';
	// MES's own stock-market fear & greed composite. sp, vix, hy = FRED rows. Returns today + a daily history of the last `days` trading days.
	S.stockFearGreed = function (sp, vix, hy, days) {
		var spx = S.dropNull(sp); if (spx.length < 125 + 252) throw new Error('not enough S&P 500 history');
		var dates = spx.map(function (p) { return p[0]; }), px = spx.map(function (p) { return p[1]; }), ma = S.sma(px, 125), v = S.alignTo(dates, vix), h = S.alignTo(dates, hy);
		var mom = px.map(function (x, i) { return ma[i] ? (x / ma[i] - 1) * 100 : null; }), hist = [], parts = null, W = 252, i, lo = Math.max(124 + W, dates.length - (days || 260));
		for (i = lo; i < dates.length; i++) {
			if (mom[i] === null || v[i] === null || h[i] === null) continue;
			var wm = mom.slice(i - W + 1, i + 1), wv = v.slice(i - W + 1, i + 1).filter(function (x) { return x !== null; }), wh = h.slice(i - W + 1, i + 1).filter(function (x) { return x !== null; });
			var a = S.pctRank(wm, mom[i]), b = 100 - S.pctRank(wv, v[i]), c = 100 - S.pctRank(wh, h[i]), sc = Math.round((a + b + c) / 3);
			hist.push([dates[i], sc]);
			parts = [{ key: 'momentum', name: 'Momentum: S&P 500 vs its 125-day average', value: round(mom[i], 2), unit: '%', score: Math.round(a) },
				{ key: 'vix', name: 'Volatility: VIX', value: v[i], unit: '', score: Math.round(b) },
				{ key: 'junk', name: 'Junk-bond spread over Treasuries', value: h[i], unit: '%', score: Math.round(c) }];
		}
		if (!hist.length) throw new Error('no overlapping data');
		var n = hist[hist.length - 1];
		return { score: n[1], label: S.fgLabel(n[1]), date: n[0], parts: parts, hist: hist, sp: px[px.length - 1], ma125: round(ma[ma.length - 1], 2) };
	};
	// monthly index -> year-over-year % (CPI inflation)
	S.yoy = function (rows) {
		var m = {}, out = []; S.dropNull(rows).forEach(function (p) { m[p[0].slice(0, 7)] = p[1]; });
		Object.keys(m).sort().forEach(function (k) { var y = +k.slice(0, 4), prev = (y - 1) + k.slice(4); if (m[prev]) out.push([k, round((m[k] / m[prev] - 1) * 100, 2)]); });
		return out;
	};
	// NBER recession months (USREC 0/1) -> [[start YYYY-MM, end YYYY-MM], ...]
	S.recessions = function (rows) {
		var out = [], cur = null; S.dropNull(rows).forEach(function (p) { var k = p[0].slice(0, 7); if (p[1] === 1) { if (!cur) cur = [k, k]; else cur[1] = k; } else if (cur) { out.push(cur); cur = null; } });
		if (cur) out.push(cur);
		return out;
	};
	// periods where a series is below zero (yield-curve inversions) -> [[start, end, min], ...]
	S.belowZero = function (rows) {
		var out = [], cur = null; S.dropNull(rows).forEach(function (p) { if (p[1] < 0) { if (!cur) cur = [p[0], p[0], p[1]]; else { cur[1] = p[0]; cur[2] = Math.min(cur[2], p[1]); } } else if (cur) { out.push(cur); cur = null; } });
		if (cur) out.push(cur);
		return out;
	};

	// ---------- the Fed's calendar (hand-entered from federalreserve.gov/monetarypolicy/fomccalendars.htm, checked 2026-10-24) ----------
	// [first day, second day (decision at 2:00 pm Eastern), Summary of Economic Projections + dot plot?]
	S.FOMC = [
		['2026-01-27', '2026-01-28', 0], ['2026-03-17', '2026-03-18', 1], ['2026-04-28', '2026-04-29', 0], ['2026-06-16', '2026-06-17', 1],
		['2026-07-28', '2026-07-29', 0], ['2026-09-15', '2026-09-16', 1], ['2026-10-27', '2026-10-28', 0], ['2026-12-08', '2026-12-09', 1],
		['2027-01-26', '2027-01-27', 0], ['2027-03-16', '2027-03-17', 1], ['2027-04-27', '2027-04-28', 0], ['2027-06-08', '2027-06-09', 1],
		['2027-07-27', '2027-07-28', 0], ['2027-09-14', '2027-09-15', 1], ['2027-10-26', '2027-10-27', 0], ['2027-12-07', '2027-12-08', 1]];
	S.FOMC_CHECKED = '2026-10-24';
	// 2:00 pm in New York on that date, as a UTC timestamp (EDT = UTC-4 from the 2nd Sunday of March to the 1st Sunday of November)
	S.nyTwoPm = function (ymd) {
		var y = +ymd.slice(0, 4), mar = new Date(Date.UTC(y, 2, 1)), nov = new Date(Date.UTC(y, 10, 1));
		var dstStart = Date.UTC(y, 2, 1 + (7 - mar.getUTCDay()) % 7 + 7), dstEnd = Date.UTC(y, 10, 1 + (7 - nov.getUTCDay()) % 7), d = Date.parse(ymd + 'T00:00:00Z');
		return d + ((d >= dstStart && d < dstEnd) ? 18 : 19) * 3600e3;
	};
	S.nextFomc = function (now) {
		now = now || Date.now();
		for (var i = 0; i < S.FOMC.length; i++) { var f = S.FOMC[i], t = S.nyTwoPm(f[1]); if (t + 2 * 3600e3 > now) return { start: f[0], end: f[1], sep: !!f[2], at: t, live: now >= Date.parse(f[0] + 'T13:00:00Z') && now < t + 2 * 3600e3, idx: i, left: S.FOMC.length - i }; }
		return null;
	};
	S.countdown = function (ms) {
		if (ms <= 0) return 'now';
		var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
		return d > 0 ? d + 'd ' + h + 'h' : h > 0 ? h + 'h ' + m + 'm' : m + 'm';
	};

	// ---------- formatting ----------
	S.money = function (v, opt) {
		if (v === null || v === undefined || !isFinite(v)) return '—';
		var a = Math.abs(v);
		if (opt === 'big' || a >= 1e9) { var u = a >= 1e12 ? ['T', 1e12] : a >= 1e9 ? ['B', 1e9] : a >= 1e6 ? ['M', 1e6] : ['', 1]; return '$' + (v / u[1]).toFixed(a / u[1] >= 100 ? 0 : a / u[1] >= 10 ? 1 : 2) + u[0]; }
		var d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
		return '$' + v.toLocaleString('en-US', { minimumFractionDigits: a >= 1000 ? 0 : d, maximumFractionDigits: d });
	};
	S.fmt = function (v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; return v.toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
	S.pct = function (v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 2 : d) + '%'; };
	S.bp = function (pts) { return Math.round(pts * 100) + ' bp'; };
	S.ago = function (ms) { var m = Math.round(ms / 60e3); if (m < 60) return m + ' min'; var h = Math.round(m / 60); if (h < 48) return h + ' h'; return Math.round(h / 24) + ' days'; };

	// ---------- "what changed since your last visit" ----------
	// the values the summary strip shows, in comparable units
	S.snapshot = function (src) {
		var g = function (k) { return src[k] && src[k].ok ? src[k].data : null; }, o = {}, c = g('coins'), m = g('markets'), r = g('rates');
		if (g('fng')) o.cfg = g('fng').now.v;
		if (g('stockfg')) o.sfg = g('stockfg').score;
		(c || []).forEach(function (x) { if (x.id === 'bitcoin') o.btc = x.price; if (x.id === 'ethereum') o.eth = x.price; });
		if (m) ['spx', 'gold', 'oil'].forEach(function (k) { if (m[k]) o[k] = m[k].price; });
		if (r) { if (r.latest.dgs10) o.t10 = r.latest.dgs10[1]; if (r.latest.spread) o.spread = r.latest.spread[1]; if (r.latest.dff) o.dff = r.latest.dff[1]; }
		return o;
	};
	// kinds: 'pts' = index points (F&G), 'pct' = price, % change, 'rate' = a percentage rate, change in bp. Threshold = when it counts as a real change.
	S.SNAP = { cfg: ['Crypto Fear & Greed', 'pts', 5], sfg: ['Stock Fear & Greed', 'pts', 5], btc: ['Bitcoin', 'pct', 2], eth: ['Ether', 'pct', 2], spx: ['S&P 500', 'pct', 1], gold: ['Gold', 'pct', 1], oil: ['Oil', 'pct', 2], t10: ['10-year yield', 'rate', 0.05], spread: ['10y − 2y', 'rate', 0.05], dff: ['Fed funds', 'rate', 0.05] };
	S.changes = function (prev, cur) {
		var out = [];
		Object.keys(S.SNAP).forEach(function (k) {
			if (prev[k] == null || cur[k] == null) return;
			var s = S.SNAP[k], d = s[1] === 'pct' ? (cur[k] / prev[k] - 1) * 100 : cur[k] - prev[k], big = Math.abs(d) >= s[2];
			var txt = s[1] === 'pct' ? S.pct(d, 1) : s[1] === 'rate' ? (d >= 0 ? '+' : '−') + Math.round(Math.abs(d) * 100) + ' bp' : (d >= 0 ? '+' : '−') + Math.abs(Math.round(d)) + ' pts';
			out.push({ key: k, name: s[0], delta: round(d, 4), text: txt, big: big, up: d > 0 });
		});
		return out;
	};

	// ---------- plain-English glossary for the "?" buttons ----------
	S.GLOSSARY = {
		cfg: ['Crypto Fear & Greed Index', 'A 0 to 100 mood score for the crypto market published daily by alternative.me. It mixes price volatility, momentum and trading volume, social media, Bitcoin dominance and Google searches. Low numbers mean people are scared; high numbers mean they are excited. Some traders read extreme fear as a sign that prices are low and extreme greed as a sign of froth, but it does not predict prices.'],
		sfg: ['MES Stock Fear & Greed (our own composite)', 'Our own 0 to 100 mood score for the US stock market, made only from free public data so you can check it. It is not CNN’s Fear & Greed Index (that one is proprietary). How it is worked out: ' ],
		fgscale: ['Reading the 0-100 scale', '0-24 extreme fear, 25-44 fear, 45-55 neutral, 56-75 greed, 76-100 extreme greed. It describes the mood right now, not what happens next.'],
		vix: ['VIX', 'The Cboe Volatility Index, often called the market’s “fear gauge”. It is worked out from S&P 500 option prices and shows how much movement traders expect over the next 30 days, as an annual percentage. Around 12-15 is calm, 20+ is nervous, 30+ is fearful, and 40+ usually only happens in a crash or crisis.'],
		momentum: ['Momentum (125-day average)', 'Compares the S&P 500 today with its average closing price over the last 125 trading days (about six months). Well above the average = prices have been rising strongly (greed); below it = falling (fear).'],
		junk: ['Junk-bond (high-yield) spread', 'How much more interest risky companies have to pay than the US government, in percentage points. When investors are relaxed they accept a small extra (a narrow spread); when they are scared they demand much more (a wide spread). Series: ICE BofA US High Yield Index option-adjusted spread.'],
		mcap: ['Market cap', 'Price times the number of coins (or shares) in existence. The total crypto market cap adds this up for every coin CoinGecko tracks.'],
		dominance: ['Bitcoin dominance', 'Bitcoin’s share of the total crypto market cap. Rising dominance usually means money is moving into Bitcoin from smaller coins (often in nervous times); falling dominance means other coins are gaining faster (sometimes called “alt season”).'],
		stablecoin: ['Stablecoins', 'Tokens designed to stay worth one US dollar (or another currency), such as USDT and USDC, backed by cash, bonds or other assets. Their total supply is a rough measure of how much dollar money is sitting inside crypto, ready to be used.'],
		halving: ['Bitcoin halving', 'Every 210,000 blocks (about every four years) the number of new bitcoins paid to miners for each block is cut in half. The 2024 halving cut it from 6.25 to 3.125 BTC. The countdown uses the current block height and the recent average time between blocks, so the date drifts a little.'],
		spark: ['Sparkline', 'A tiny chart without axes that shows the shape of the price over the last 7 days (crypto) or 3 months (markets). Green if it ended higher than it started, red if lower.'],
		sp500: ['S&P 500', 'An index of about 500 of the largest US companies, weighted by size. It is the most common yardstick for “the stock market”.'],
		nasdaq: ['Nasdaq Composite', 'Every stock listed on the Nasdaq exchange, heavy in technology companies.'],
		dow: ['Dow Jones Industrial Average', '30 large US companies, weighted by share price rather than size. The oldest of the three main US indexes.'],
		gold: ['Gold', 'Price of one troy ounce in US dollars (COMEX gold futures, front month). Often bought as a safe haven when people worry about inflation or crises.'],
		oil: ['Oil (WTI)', 'West Texas Intermediate crude oil, US dollars per barrel (NYMEX futures, front month). Oil prices feed into fuel, shipping and inflation.'],
		dxy: ['US Dollar Index (DXY)', 'The US dollar measured against six major currencies (mostly the euro, then the yen, pound, Canadian dollar, Swedish krona and Swiss franc). Up = the dollar is getting stronger.'],
		fedfunds: ['Federal funds rate', 'The interest rate US banks charge each other for overnight loans. The Fed sets a target range (for example 4.25% to 4.50%) and steers the actual rate (the “effective” rate) into it. It ripples out to mortgages, car loans, savings accounts and business borrowing.'],
		treasury: ['Treasury yields (2-year, 10-year)', 'The interest the US government pays to borrow for 2 or 10 years, as set by trading in its bonds. The 2-year mostly tracks where people expect the Fed to put rates; the 10-year also reflects long-run growth and inflation expectations, and it drives mortgage rates.'],
		yieldcurve: ['Yield curve', 'A line of interest rates for borrowing over different lengths of time. Normally long-term rates are higher than short-term ones (lenders want more to tie money up longer), so the curve slopes up. The 10-year minus 2-year difference is a simple way to measure the slope.'],
		inversion: ['Yield-curve inversion', 'When short-term rates are higher than long-term rates (10-year minus 2-year below zero). It has come before every US recession since the 1970s, usually 6 to 24 months earlier, but the timing varies a lot, and as of late 2026 the 2022-2024 inversion (the longest on record) had not been followed by an NBER-dated recession. Treat it as a warning light, not a forecast.'],
		recession: ['Recession (grey bands)', 'Periods the National Bureau of Economic Research (NBER) dates as US recessions: a significant fall in economic activity that lasts more than a few months. They are dated after the fact, often a year later.'],
		bps: ['Basis points (bp)', 'One basis point is one hundredth of a percentage point: 0.25% = 25 bp. Rate changes are usually quoted this way, so a “25 bp cut” takes 4.50% to 4.25%.'],
		fomc: ['FOMC', 'The Federal Open Market Committee: the 12 people at the Fed who vote on US interest rates (the 7 Board governors, the New York Fed president and 4 of the other 11 regional Fed presidents in rotation). It meets eight times a year; the decision is published at 2:00 pm Eastern on the second day, followed by the Chair’s press conference at 2:30.'],
		dotplot: ['Dot plot', 'At four of the eight meetings (marked with a dot here) each FOMC participant marks where they think the fed funds rate should be at the end of this year and the next few years. The chart of those dots shows the committee’s range of views. It is not a promise and often changes.'],
		cpi: ['CPI inflation', 'The Consumer Price Index tracks the price of a basket of things households buy (food, rent, fuel, clothing, services). Inflation here is the change from the same month a year earlier. The Fed aims for about 2% a year, measured with a related index (PCE).'],
		policyrate: ['Policy rate', 'The main interest rate a central bank sets. Bank of Canada: the target for the overnight rate. ECB: the deposit facility rate (what banks earn on money left with the ECB). Bank of England: Bank Rate.'],
		pred: ['Prediction markets', 'Websites where people trade contracts that pay $1 if something happens and $0 if it does not. The price of a “Yes” share, in cents, is read as the crowd’s chance: 70¢ = about 70%. They react fast to news but they can be wrong, thin markets can be moved by a few traders, and they are not available or legal everywhere.'],
		odds: ['Reading the odds', 'Polymarket shows the last trade price of “Yes”; for Kalshi we use the middle of the best bid and ask. In a market with several answers (“How many cuts?”) the chances should add up to about 100%. A “ladder” like “Above 3.00%, Above 3.25% ...” shows the chance of each level; the most likely range is the step with the biggest drop between two rungs.'],
		vol: ['24h volume', 'How much money changed hands in that market over the last 24 hours. Bigger volume usually means a price that is harder to push around.']
	};
	S.GLOSSARY.sfg[1] += S.STOCK_FG_METHOD;

	if (typeof module !== 'undefined' && module.exports) module.exports = S;
	else root.MESSig = S;
})(typeof window !== 'undefined' ? window : this);
