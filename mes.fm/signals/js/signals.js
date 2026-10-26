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

	// RSS / Atom -> [{title, link, date, host, sum?, img?}]. Headlines, links and the feed's own one-line summary only (never article text);
	// tags stripped, http(s) links only. A thumbnail is kept only when it is https AND on one of the image hosts listed for that feed
	// (opt.imgHosts, see NEWS_FEEDS), so a feed can never make the page load pictures from somewhere else.
	function decode(s) {
		return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
			.replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
	}
	S.decode = decode;
	// entity-decode only (keeps tags), so an <img> inside an escaped description can still be found
	function unent(s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&'); }
	S.hostOf = function (u) { var m = /^https?:\/\/([^\/?#:]+)/i.exec(String(u || '')); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; };
	S.imgOk = function (u, hosts) {
		if (!/^https:\/\/[^\s"'<>]+$/i.test(u || '') || !hosts || !hosts.length) return false;
		if (/pixel|tracking|spacer|1x1/i.test(u)) return false;
		var h = S.hostOf(u);
		return hosts.some(function (x) { return h === x || h.slice(-x.length - 1) === '.' + x; });
	};
	// best thumbnail of one <item>: media:thumbnail / media:content (width nearest 480) / enclosure (image) / first <img> in the description or content
	S.rssImage = function (it, hosts) {
		var c = [], re = /<(media:thumbnail|media:content|enclosure)\b([^>]*)>/g, m;
		var attr = function (a, k) { var r = new RegExp('\\b' + k + '\\s*=\\s*["\']([^"\']+)').exec(a); return r ? unent(r[1]) : null; };
		while ((m = re.exec(it))) {
			var a = m[2], u = attr(a, 'url'), ty = attr(a, 'type') || '', md = attr(a, 'medium') || '';
			if (!u) continue;
			if (m[1] !== 'media:thumbnail' && !/^image/i.test(ty) && md !== 'image' && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) continue;
			c.push({ u: u, w: num(attr(a, 'width')) });
		}
		var body = unent((/<(description|content:encoded)\b[^>]*>([\s\S]*?)<\/\1>/.exec(it) || [])[2] || ''), im = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi;
		while ((m = im.exec(body))) c.push({ u: m[1], w: null });
		c = c.filter(function (x) { return S.imgOk(x.u, hosts); });
		if (!c.length) return null;
		var sized = c.filter(function (x) { return x.w; });
		if (sized.length) return sized.sort(function (p, q) { return Math.abs(p.w - 480) - Math.abs(q.w - 480); })[0].u;
		return c[0].u;
	};
	// one-line plain-text summary: the feed's own description, tags stripped, cut at a word boundary (~200 chars); none if it only repeats the title
	S.rssSummary = function (raw, title) {
		var t = decode(unent(raw || '')).replace(/\s*(Continue reading|Read more|The post .* appeared first on)[\s\S]*$/i, '').trim();
		if (!t || t.length < 20) return '';
		if (title && t.toLowerCase().indexOf(String(title).toLowerCase().slice(0, 60)) === 0 && t.length < title.length + 20) return '';
		if (t.length > 200) { t = t.slice(0, 200); t = t.slice(0, Math.max(120, t.lastIndexOf(' '))).replace(/[\s,;:.\-–—]+$/, '') + '…'; }
		return t;
	};
	S.parseRss = function (xml, n, opt) {
		opt = opt || {};
		var items = String(xml || '').match(/<(item|entry)\b[\s\S]*?<\/\1>/g) || [], out = [];
		items.forEach(function (it) {
			var t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(it), l = /<link[^>]*>([\s\S]*?)<\/link>/.exec(it) || /<link[^>]*href="([^"]+)"/.exec(it), d = /<(pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/\1>/.exec(it);
			var link = l ? decode(l[1]) : '', title = t ? decode(t[1]) : '';
			if (!title || !/^https?:\/\//i.test(link)) return;
			var ms = d ? Date.parse(decode(d[2])) : NaN, o = { title: title.slice(0, 220), link: link, date: isFinite(ms) ? new Date(ms).toISOString() : null, host: S.hostOf(link) };
			if (opt.sum) { var ds = /<(description|summary)\b[^>]*>([\s\S]*?)<\/\1>/.exec(it), sm = S.rssSummary(ds && ds[2], title); if (sm) o.sum = sm; }
			if (opt.imgHosts) { var im = S.rssImage(it, opt.imgHosts); if (im) o.img = im; }
			out.push(o);
		});
		return out.slice(0, n || 8);
	};
	// The news feeds (all keyless; each checked from a server 2026-10-25). sec = News tab section; img = the hosts its thumbnails may come from.
	S.NEWS_SECTIONS = [['crypto', 'Crypto'], ['markets', 'Stocks & markets'], ['world', 'World'], ['fed', 'Federal Reserve (monetary policy)']];
	S.NEWS_FEEDS = [
		{ id: 'coindesk', name: 'CoinDesk', sec: 'crypto', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', img: ['cdn.sanity.io', 'coindesk.com'] },
		{ id: 'cointelegraph', name: 'Cointelegraph', sec: 'crypto', url: 'https://cointelegraph.com/rss', img: ['ctmedia.io', 'cointelegraph.com'] },
		{ id: 'cnbc', name: 'CNBC', sec: 'markets', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', img: ['cnbcfm.com'] },
		{ id: 'marketwatch', name: 'MarketWatch', sec: 'markets', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', img: ['mktw.net'] },
		{ id: 'bbcbiz', name: 'BBC Business', sec: 'markets', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbcworld', name: 'BBC World', sec: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'aljazeera', name: 'Al Jazeera', sec: 'world', url: 'https://www.aljazeera.com/xml/rss/all.xml', img: ['aljazeera.com'] },
		{ id: 'npr', name: 'NPR World', sec: 'world', url: 'https://feeds.npr.org/1004/rss.xml', img: [] },
		{ id: 'guardian', name: 'The Guardian', sec: 'world', url: 'https://www.theguardian.com/world/rss', img: ['guim.co.uk'] },
		{ id: 'dw', name: 'DW', sec: 'world', url: 'https://rss.dw.com/rdf/rss-en-world', img: ['dw.com'] }];
	// newest first, at most n per source so one busy feed cannot fill a section
	S.mergeNews = function (lists, n) {
		var out = []; lists.forEach(function (l) { out.push.apply(out, (l || []).slice(0, n || 12)); });
		return out.sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : (b.date || '') > (a.date || '') ? 1 : 0; });
	};

	// Polymarket gamma /events -> [{id, title, url, vol24, end, outcomes:[{label, p}]}]
	function jsonArr(x) { if (Array.isArray(x)) return x; try { var a = JSON.parse(x); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
	// opt.dated: a multi-answer event whose answers are dates ("Ceasefire continues through October 31 / November 30 ...") keeps
	// Polymarket's own order (groupItemThreshold = earliest first) instead of being sorted by chance, and is flagged `dated`.
	S.parsePolymarket = function (events, cat, opt) {
		if (!Array.isArray(events)) throw new Error('not a list');
		var out = [];
		events.forEach(function (e) {
			if (!e || e.closed || !e.slug) return;
			var ms = (e.markets || []).filter(function (m) { return m && m.active && !m.closed; }), oc = [], dated = false;
			if (!ms.length) return;
			if (ms.length === 1) {
				var names = jsonArr(ms[0].outcomes), pr = jsonArr(ms[0].outcomePrices);
				names.forEach(function (nm, i) { var p = num(pr[i]); if (p !== null) oc.push({ label: String(nm), p: round(p * 100, 1) }); });
			} else {
				dated = !!(opt && opt.dated) && ms.length > 1 && ms.every(function (m) { return num(m.groupItemThreshold) !== null && /^(by )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(,? \d{4})?$|^(before|by) /i.test(String(m.groupItemTitle || '').trim()); });
				if (dated) {
					// dates already passed but not yet settled (they sit at ~99% or ~1% while they resolve) are left out
					var now = opt.now == null ? Date.now() : opt.now, fut = ms.filter(function (m) { var t = Date.parse(m.endDate || ''); return !isFinite(t) || t > now; });
					if (fut.length) ms = fut;
					ms = ms.slice().sort(function (a, b) { return num(a.groupItemThreshold) - num(b.groupItemThreshold); });
				}
				ms.forEach(function (m) { var p = num(jsonArr(m.outcomePrices)[0]); if (p !== null) oc.push({ label: String(m.groupItemTitle || m.question || '').slice(0, 80), p: round(p * 100, 1) }); });
			}
			if (!dated) oc.sort(function (a, b) { return b.p - a.p; });
			if (!oc.length) return;
			var o = { id: 'pm' + e.id, src: 'Polymarket', cat: cat || '', title: String(e.title || '').slice(0, 160), url: 'https://polymarket.com/event/' + encodeURIComponent(e.slug), vol24: round(num(e.volume24hr), 0), vol: round(num(e.volume), 0), end: e.endDate || null, outcomes: oc.slice(0, dated ? 6 : 5), more: Math.max(0, oc.length - (dated ? 6 : 5)) };
			if (dated) o.dated = true;
			if (ms.length === 1 && oc.some(function (x) { return /^yes$/i.test(x.label); })) o.binary = true;
			out.push(o);
		});
		return out;
	};
	// ---------- geopolitics ----------
	// a prediction market counts as "conflict" when its title is about war, ceasefires, invasions, strikes, blockades, nuclear tests ...
	// (elections, leaders' approval and trade deals are left out). Neutral wording only: this is a filter, not a forecast.
	S.CONFLICT_RE = /\b(war|wars|ceasefire|cease-fire|truce|invade|invades|invasion|military|clash|strikes?|attack|attacks|missile|nuclear|nuke|blockade|hormuz|troops|peace (talks|deal|agreement)|annex|capture|airspace|regime fall|bomb|drone|shelling|occupation|withdraws?|hostilities|armistice|escalat\w*)\b/i;
	S.isConflict = function (title) { return S.CONFLICT_RE.test(String(title || '')) && !/\belection|\bprime minister of|\bnominee\b|\bapproval\b/i.test(String(title || '')); };
	// merge Polymarket / Kalshi lists, drop duplicates and non-conflict events, biggest total volume first
	S.geoMarkets = function (lists) {
		var seen = {}, out = [];
		lists.forEach(function (l) { (l || []).forEach(function (e) { if (seen[e.id] || !S.isConflict(e.title + ' ' + (e.sub || ''))) return; seen[e.id] = 1; out.push(e); }); });
		var size = function (m) { return m.vol || m.contracts || 0; };
		return out.sort(function (a, b) { return size(b) - size(a); });
	};
	// "MES conflict odds": the market's own Yes price for the biggest yes/no conflict questions, nothing added or averaged
	S.conflictOdds = function (markets, n) {
		return (markets || []).filter(function (m) { return m.binary; }).map(function (m) {
			var y = m.outcomes.filter(function (o) { return /^yes$/i.test(o.label); })[0];
			return { title: m.title, yes: y ? y.p : null, vol: m.vol || null, vol24: m.vol24 || null, url: m.url, src: m.src, end: m.end };
		}).filter(function (x) { return x.yes !== null; }).slice(0, n || 6);
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
			var vol = 0, v24 = 0; ms.forEach(function (m) { vol += num(m.volume_fp != null ? m.volume_fp : m.volume) || 0; v24 += num(m.volume_24h_fp != null ? m.volume_24h_fp : m.volume_24h) || 0; });
			var series = String(e.series_ticker || e.event_ticker || '').split('-')[0].toLowerCase();
			var item = { id: 'k' + e.event_ticker, src: 'Kalshi', cat: cat || '', title: String(e.title || '').slice(0, 160), sub: e.sub_title || '', url: 'https://kalshi.com/markets/' + encodeURIComponent(series), end: (ms[0] && ms[0].close_time) || null, outcomes: oc };
			// Kalshi counts contracts (each pays $1), not dollars, so these are kept apart from Polymarket's dollar volume
			if (vol) item.contracts = round(vol, 0); if (v24) item.contracts24 = round(v24, 0);
			if (oc.length > 2 && oc.every(function (o) { return /^Above /.test(o.label); })) item.ladder = true;
			var bt = function (o) { return Date.parse(String(o.label).replace(/^Before\s+/i, '')); };
			if (!item.ladder && oc.length > 1 && oc.every(function (o) { return /^Before /i.test(o.label) && isFinite(bt(o)); })) {
				item.dated = true; oc.sort(function (a, b) { return bt(a) - bt(b); }); item.more = Math.max(0, oc.length - 6); item.outcomes = oc.slice(0, 6);
			} else if (!item.ladder) { oc.sort(function (a, b) { return b.p - a.p; }); item.more = Math.max(0, oc.length - 5); item.outcomes = oc.slice(0, 5); }
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

	// ---------- the Doomsday Clock (hand-entered from the Bulletin of the Atomic Scientists' own timeline, checked 2026-10-25) ----------
	// [year of the statement, seconds to midnight]. Every setting since 1947, including the years it stayed the same ("It is still ...").
	// Source: https://thebulletin.org/doomsday-clock/timeline/ ; latest: https://thebulletin.org/doomsday-clock/ ("It is 85 seconds to midnight", 27 Jan 2026).
	S.DOOMSDAY = [[1947, 420], [1949, 180], [1953, 120], [1960, 420], [1963, 720], [1968, 420], [1969, 600], [1972, 720], [1974, 540], [1980, 420], [1981, 240],
		[1984, 180], [1988, 360], [1990, 600], [1991, 1020], [1995, 840], [1998, 540], [2002, 420], [2007, 300], [2010, 360], [2012, 300], [2015, 180], [2016, 180],
		[2017, 150], [2018, 120], [2019, 120], [2020, 100], [2021, 100], [2022, 100], [2023, 90], [2024, 90], [2025, 89], [2026, 85]];
	S.DOOMSDAY_LATEST = { seconds: 85, announced: '2026-01-27', url: 'https://thebulletin.org/doomsday-clock/' };
	S.DOOMSDAY_SRC = 'https://thebulletin.org/doomsday-clock/timeline/';
	S.DOOMSDAY_CHECKED = '2026-10-25';
	S.clockText = function (sec) { return sec >= 120 ? (sec % 60 ? (sec / 60).toFixed(1) : String(sec / 60)) + ' minutes' : sec + ' seconds'; };
	// step series for the chart: each setting holds until the next one (or `toYmd`), in minutes
	S.doomsdaySteps = function (toYmd) {
		var out = [], d = S.DOOMSDAY;
		d.forEach(function (x, i) { var m = round(x[1] / 60, 3); out.push([x[0] + '-01-15', m]); out.push([i + 1 < d.length ? (d[i + 1][0] - 1) + '-12-31' : (toYmd || x[0] + '-12-31'), m]); });
		return out;
	};
	S.doomsdayStats = function () {
		var d = S.DOOMSDAY, lo = d.reduce(function (a, x) { return x[1] < a[1] ? x : a; }), hi = d.reduce(function (a, x) { return x[1] > a[1] ? x : a; }), n = d[d.length - 1], p = null;
		for (var i = d.length - 2; i >= 0; i--) if (d[i][1] !== n[1]) { p = d[i]; break; }
		return { now: n, closest: lo, farthest: hi, lastMove: p ? { from: p[1], to: n[1], year: n[0] } : null };
	};

	// ---------- published estimates of what the 2026 Iran war has cost the US (hand-entered; each line = its source, its date) ----------
	// Deliberately NOT a running ticker: the only published daily rate (CSIS, $891.4M/day) is for the opening 100 hours, the Pentagon totals
	// are cumulative figures given on dates (one of them includes costs "anticipated" to 30 Sep), and there was a ceasefire for part of the time,
	// so extrapolating any rate to today would be our own guess. [date, US$ billions, who, what it covers, source URL]
	S.WAR_COSTS = [
		['2026-03-06', 3.7, 'CSIS (Mark Cancian, Chris Park)', 'First 100 hours, about $891.4 million a day; built from CBO unit operating costs plus munitions (about $3.5 billion of it unbudgeted). Independent think-tank estimate.', 'https://www.aljazeera.com/news/2026/3/6/cost-to-us-for-war-on-iran-is-3-7bn-in-first-100-hours-says-think-tank'],
		['2026-03-12', 11.3, 'Pentagon briefing to Congress (reported by The New York Times)', 'First six days; "more than" this, and leaves out many costs of the build-up before the strikes.', 'https://www.newarab.com/news/us-says-iran-campaign-cost-11-billion-six-days'],
		['2026-04-29', 25, 'Jules Hurst III, acting Pentagon Comptroller, House Armed Services Committee', 'To that day, about 60 days in: mostly munitions, plus operations, maintenance and equipment replacement.', 'https://www.nbcnews.com/politics/congress/iran-war-cost-25-billion-dollars-us-munitions-hegseth-armed-services-rcna342714'],
		['2026-07-21', 37.5, 'Defense Secretary Pete Hegseth, Senate Appropriations Committee', 'Includes some military pay, operations and maintenance and "other anticipated costs" through 30 Sep 2026; apparently not repairs to damaged bases.', 'https://www.airandspaceforces.com/hegseth-iran-war-cost-37-5b/'],
		['2026-08-13', 42, 'Pentagon estimate sent to the congressional defense committees (reported by The Hill)', '"Over" this; $4.5 billion more than the July figure.', 'https://thehill.com/policy/defense/6090292-pentagon-iran-war-cost-increase/']];
	S.WAR_START = '2026-02-28'; // US-Israeli strikes began on Saturday 28 Feb 2026 (Al Jazeera, 6 Mar 2026: the war "entered its seventh day on Friday")
	S.WAR_COSTS_CHECKED = '2026-10-25';

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
		vol: ['24h volume', 'How much money changed hands in that market over the last 24 hours. Bigger volume usually means a price that is harder to push around.'],
		doomsday: ['Doomsday Clock', 'A symbol, not a measurement. Since 1947 the Bulletin of the Atomic Scientists (founded by scientists from the Manhattan Project) has set the hands once a year, usually in late January, to show how close its Science and Security Board judges humanity to be to a man-made global catastrophe: nuclear war first, and since 2007 also climate change, and lately biological threats and AI. Midnight = catastrophe. It is an expert opinion, not a probability, and it is not updated when news breaks between announcements.'],
		geoodds: ['Conflict odds from prediction markets', 'The price of a “Yes” share on Polymarket or Kalshi for questions about wars, ceasefires, invasions and blockades, read as the traders’ chance. We only show the markets’ own numbers: no averaging, weighting or MES index on top. Markets about war are often thin and can be moved by a few traders or by rumours, they can be worded in surprising ways (always read the rules on the market page), and they are not open to everyone in every country.'],
		dated: ['“By ...?” and “through ...?” markets', 'Some questions are split into dates: “Ceasefire continues through October 31 / November 30 / December 31”. Each date is its own yes/no market, shown here earliest first. For “continues through” the chance usually falls the further out you go; for “happens by” it usually rises.'],
		contracts: ['Kalshi volume (contracts)', 'Kalshi reports how many contracts were traded, not dollars. Each contract pays $1 if the answer is Yes, so the dollars that changed hands are less than the contract count.'],
		warcost: ['War-cost estimates', 'Official figures come from the Pentagon (testimony or briefings to Congress) and are cumulative totals on the day they were given; what they include changes (some leave out the build-up, base repairs, veterans’ care or interest on borrowing). Think-tank estimates such as CSIS work from Congressional Budget Office unit costs. Long-run studies (for example Brown University’s Costs of War project) count far more, so different numbers can all be honest. We list each with its date and source instead of running a live counter.'],
		feargauges: ['Markets’ fear gauges', 'Prices that often jump when people get scared: oil (supply worries, especially around the Strait of Hormuz, where about a fifth of the world’s oil passes), gold (a traditional safe haven), the VIX (expected stock-market swings) and the US dollar. They react to many things besides conflict, so a move is a hint, not proof.']
	};
	S.GLOSSARY.sfg[1] += S.STOCK_FG_METHOD;

	if (typeof module !== 'undefined' && module.exports) module.exports = S;
	else root.MESSig = S;
})(typeof window !== 'undefined' ? window : this);

/* MES Market Signals UI. Data = /api/signals (one aggregator, edge-cached 5 min); maths and parsing = MESSig (lib.js). ?mock=1 (and local
   previews) read the committed sample mes.fm/signals/data/sample.json instead. Informational only: no recommendations anywhere. */
(function () {
	'use strict';
	var S = window.MESSig, $ = function (id) { return document.getElementById(id); }, root = $('sg');
	if (!S || !root) return;
	var KEY = 'mes-signals:v1', st = { tab: 'sent', fg: 90, rates: 1100, curve: 9999, qk: 'spx', pcat: 'All', nview: 'cards', ncols: 'auto', nshow: 10, nclosed: {}, nsrc: {}, gconf: 1 }, data = null, snaps = null, loading = false;
	var SKEYS = ['tab', 'fg', 'rates', 'curve', 'qk', 'pcat', 'nview', 'ncols', 'nshow', 'nclosed', 'nsrc', 'gconf'];
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); SKEYS.forEach(function (k) { if (sv[k] != null) st[k] = sv[k]; }); } catch (e) {}
	var qs = new URLSearchParams(location.search), MOCK = qs.get('mock') === '1' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	if (qs.get('tab')) st.tab = qs.get('tab');
	function save() { try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); SKEYS.forEach(function (k) { o[k] = st[k]; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function q(k) { var g = S.GLOSSARY[k]; return g ? '<button type="button" class="sg-q" data-g="' + k + '" aria-label="' + esc('What is ' + g[0] + '?') + '">?</button>' : ''; }
	function src(n) { return data && data.sources[n] && data.sources[n].ok ? data.sources[n].data : null; }
	function err(n) { var s = data && data.sources[n]; return '<p class="tu-note sg-err">Could not load this right now' + (s && s.error ? ' (' + esc(s.error) + ')' : '') + '. It will try again on the next refresh.</p>'; }
	function cls(v) { return v > 0 ? 'up' : v < 0 ? 'dn' : ''; }
	function chg(v, d) { return '<span class="sg-ch ' + cls(v) + '">' + (v > 0 ? '&#9650; ' : v < 0 ? '&#9660; ' : '') + esc(S.pct(v, d)) + '</span>'; }
	function dshort(s) { if (!s) return ''; var d = new Date(s.length === 7 ? s + '-01T00:00:00Z' : s.length === 10 ? s + 'T00:00:00Z' : s); return isNaN(d) ? s : d.toLocaleDateString(undefined, s.length === 7 ? { year: 'numeric', month: 'short', timeZone: 'UTC' } : { year: 'numeric', month: 'short', day: 'numeric', timeZone: s.length === 10 ? 'UTC' : undefined }); }
	function ago(iso) { var ms = Date.now() - Date.parse(iso); return isFinite(ms) ? S.ago(Math.max(0, ms)) + ' ago' : ''; }

	// ---------- tabs ----------
	var TABS = ['sent', 'crypto', 'mkts', 'rates', 'pred', 'geo', 'news'];
	if (TABS.indexOf(st.tab) < 0) st.tab = 'sent';
	function showTab(t, focus) {
		st.tab = t; save();
		[].forEach.call($('sg-tabs').querySelectorAll('[role=tab]'), function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		TABS.forEach(function (x) { $('sg-p-' + x).hidden = x !== t; });
		if (data) drawTab(t);
	}
	$('sg-tabs').addEventListener('click', function (e) { var b = e.target.closest('[role=tab]'); if (b) showTab(b.getAttribute('data-tab')); });
	$('sg-tabs').addEventListener('keydown', function (e) { var i = TABS.indexOf(st.tab); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); showTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true); } });

	// ---------- glossary popover ----------
	var pop = $('sg-pop'), popFor = null;
	function closePop() { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; }
	root.addEventListener('click', function (e) {
		var b = e.target.closest('.sg-q');
		if (b) {
			e.preventDefault(); e.stopPropagation();
			if (popFor === b) return closePop();
			var g = S.GLOSSARY[b.getAttribute('data-g')]; if (!g) return;
			closePop(); popFor = b; b.setAttribute('aria-expanded', 'true');
			pop.querySelector('.sg-pop__t').textContent = g[0]; pop.querySelector('.sg-pop__p').textContent = g[1]; pop.hidden = false;
			var r = b.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24), left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
			pop.style.width = w + 'px'; pop.style.left = left + 'px';
			var h = pop.offsetHeight, top = r.bottom + 8; if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
			pop.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
			return;
		}
		if (!pop.hidden && !e.target.closest('.sg-pop')) closePop();
	});
	pop.querySelector('.sg-pop__x').onclick = closePop;
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { var b = popFor; closePop(); if (b) b.focus(); } });
	window.addEventListener('scroll', function () { if (!pop.hidden) closePop(); }, { passive: true });

	// ---------- charts (plain SVG sized to the box; hover / touch shows every series at that date) ----------
	var tip = $('sg-tip');
	function tms(s) { return Date.parse(s.length === 7 ? s + '-15T00:00:00Z' : s.length === 10 ? s + 'T00:00:00Z' : s); }
	function chart(box, o) {
		var W = Math.max(260, box.clientWidth || 600), H = o.h || (W < 500 ? 190 : 240), pl = 44, pr = 10, pt = 10, pb = 24, all = [];
		o.series.forEach(function (s) { s.p = s.pts.filter(function (p) { return p[1] !== null; }).map(function (p) { return [tms(p[0]), p[1], p[0]]; }); all = all.concat(s.p); });
		if (!all.length) { box.innerHTML = '<p class="tu-note">No data.</p>'; return; }
		var x0 = Math.min.apply(null, all.map(function (p) { return p[0]; })), x1 = Math.max.apply(null, all.map(function (p) { return p[0]; })), y0 = o.yMin != null ? o.yMin : Math.min.apply(null, all.map(function (p) { return p[1]; })), y1 = o.yMax != null ? o.yMax : Math.max.apply(null, all.map(function (p) { return p[1]; }));
		if (o.yMin == null || o.yMax == null) { var pad = (y1 - y0) * 0.08 || 1; if (o.yMin == null) y0 -= pad; if (o.yMax == null) y1 += pad; }
		if (o.zero && y0 > 0) y0 = Math.min(y0, 0);
		var X = function (t) { return pl + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - pl - pr); }, Y = function (v) { return pt + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pt - pb); }, out = [];
		(o.xBands || []).forEach(function (b) { var a = Math.max(x0, tms(b[0]) - 15 * 864e5), z = Math.min(x1, tms(b[1]) + 15 * 864e5); if (z > a) out.push('<rect class="sg-xband" x="' + X(a).toFixed(1) + '" y="' + pt + '" width="' + Math.max(1, X(z) - X(a)).toFixed(1) + '" height="' + (H - pt - pb) + '"></rect>'); });
		(o.bands || []).forEach(function (b) { var a = Math.max(y0, b[0]), z = Math.min(y1, b[1]); if (z > a) out.push('<rect class="' + b[2] + '" x="' + pl + '" y="' + Y(z).toFixed(1) + '" width="' + (W - pl - pr) + '" height="' + (Y(a) - Y(z)).toFixed(1) + '"></rect>'); });
		var ticks = o.yTicks || (function () { var n = 4, st2 = (y1 - y0) / n, m = Math.pow(10, Math.floor(Math.log10(st2 || 1))), s2 = [1, 2, 2.5, 5, 10].map(function (k) { return k * m; }).find(function (k) { return k >= st2; }) || st2, r = [], v; for (v = Math.ceil(y0 / s2) * s2; v <= y1 + 1e-9; v += s2) r.push(+v.toFixed(6)); return r; })();
		ticks.forEach(function (v) { if (v < y0 || v > y1) return; out.push('<line class="sg-grid' + (v === 0 ? ' sg-zero' : '') + '" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"></line><text class="sg-ax" x="' + (pl - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc((o.fy || String)(v)) + '</text>'); });
		var span = x1 - x0, nx = W < 500 ? 3 : 5;
		for (var i = 0; i <= nx; i++) { var t = x0 + span * i / nx, d = new Date(t); out.push('<text class="sg-ax" x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === nx ? 'end' : 'middle') + '">' + esc(span > 5 * 365 * 864e5 ? d.getUTCFullYear() : d.toLocaleDateString(undefined, span > 200 * 864e5 ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' })) + '</text>'); }
		o.series.forEach(function (s) {
			if (!s.p.length) return;
			var d = s.p.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('');
			if (s.negFill) { var zy = Y(Math.max(y0, Math.min(y1, 0))).toFixed(1); out.push('<clipPath id="' + box.id + '-neg"><rect x="0" y="' + zy + '" width="' + W + '" height="' + H + '"></rect></clipPath><path class="sg-negfill" clip-path="url(#' + box.id + '-neg)" d="' + d + 'L' + X(s.p[s.p.length - 1][0]).toFixed(1) + ' ' + zy + 'L' + X(s.p[0][0]).toFixed(1) + ' ' + zy + 'Z"></path>'); }
			if (s.fill) out.push('<path class="sg-fill ' + s.cls + '" d="' + d + 'L' + X(s.p[s.p.length - 1][0]).toFixed(1) + ' ' + (H - pb) + 'L' + X(s.p[0][0]).toFixed(1) + ' ' + (H - pb) + 'Z"></path>');
			out.push('<path class="sg-line ' + s.cls + '"' + (s.step ? ' stroke-linejoin="miter"' : '') + ' d="' + d + '"></path>');
		});
		out.push('<line class="sg-cross" id="' + box.id + '-x" x1="-9" x2="-9" y1="' + pt + '" y2="' + (H - pb) + '"></line>');
		o.series.forEach(function (s, k) { out.push('<circle class="sg-dot ' + s.cls + '" id="' + box.id + '-d' + k + '" r="4" cx="-9" cy="-9"></circle>'); });
		box.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Chart') + '">' + out.join('') + '</svg>';
		var svg = box.firstChild, cross = $(box.id + '-x');
		function at(ev) {
			var r = svg.getBoundingClientRect(), mx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, tt = x0 + (mx - pl) / (W - pl - pr) * span, lines = [], best = null;
			o.series.forEach(function (s, k) {
				var dot = $(box.id + '-d' + k), p = null, bd = Infinity;
				s.p.forEach(function (q2) { var dd = Math.abs(q2[0] - tt); if (dd < bd) { bd = dd; p = q2; } });
				if (!p || bd > span / 20 + 40 * 864e5) { dot.setAttribute('cx', -9); return; }
				dot.setAttribute('cx', X(p[0])); dot.setAttribute('cy', Y(p[1])); if (!best) best = p;
				lines.push((o.series.length > 1 ? s.name + ': ' : '') + (o.fv || o.fy || String)(p[1]));
			});
			if (!best) return hide();
			cross.setAttribute('x1', X(best[0])); cross.setAttribute('x2', X(best[0]));
			tip.hidden = false; tip.innerHTML = '<b>' + esc(dshort(best[2])) + '</b><br>' + lines.map(esc).join('<br>');
			var tw = tip.offsetWidth, x = r.left + X(best[0]); tip.style.left = Math.min(Math.max(8, x - tw / 2), window.innerWidth - tw - 8) + 'px'; tip.style.top = Math.max(8, r.top + 4 - tip.offsetHeight - 6) + 'px';
		}
		function hide() { tip.hidden = true; cross.setAttribute('x1', -9); cross.setAttribute('x2', -9); o.series.forEach(function (s, k) { $(box.id + '-d' + k).setAttribute('cx', -9); }); }
		svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at); svg.addEventListener('pointerleave', hide);
		box._redraw = function () { chart(box, o); };
	}
	function spark(vals, w, h) {
		vals = (vals || []).filter(function (v) { return v != null; }); if (vals.length < 2) return '';
		var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), up = vals[vals.length - 1] >= vals[0];
		var d = vals.map(function (v, i) { return (i ? 'L' : 'M') + (i / (vals.length - 1) * w).toFixed(1) + ' ' + (h - 2 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (h - 4)).toFixed(1); }).join('');
		return '<svg class="sg-spark ' + (up ? 'up' : 'dn') + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '"></path></svg>';
	}
	function gauge(v) {
		var segs = [[0, 25, 'xf'], [25, 45, 'f'], [45, 55, 'n'], [55, 75, 'g'], [75, 100, 'xg']], R = 80, cx = 100, cy = 96, pt = function (p, r) { var a = Math.PI * (1 - p / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }, out = '';
		segs.forEach(function (s) { var a = pt(s[0] + 0.6, R), b = pt(s[1] - 0.6, R); out += '<path class="sg-arc sg-' + s[2] + '" d="M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + '"></path>'; });
		var n = pt(Math.max(0, Math.min(100, v)), R - 22);
		return '<svg class="sg-gauge" viewBox="0 0 200 112" role="img" aria-label="Gauge at ' + v + ' of 100">' + out + '<line class="sg-needle" x1="' + cx + '" y1="' + cy + '" x2="' + n[0].toFixed(1) + '" y2="' + n[1].toFixed(1) + '"></line><circle class="sg-hub" cx="' + cx + '" cy="' + cy + '" r="6"></circle><text class="sg-gtx" x="14" y="110">0</text><text class="sg-gtx" x="186" y="110" text-anchor="end">100</text></svg>';
	}
	function rangeBtns() {
		[].forEach.call(root.querySelectorAll('.sg-range'), function (g) { var k = g.getAttribute('data-chart'); [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-r') === +st[k])); }); });
	}
	root.addEventListener('click', function (e) { var b = e.target.closest('.sg-range button'); if (!b) return; st[b.parentNode.getAttribute('data-chart')] = +b.getAttribute('data-r'); save(); rangeBtns(); drawTab(st.tab); });

	// ---------- summary strip ----------
	function stripItem(tab, label, val, sub, k, extra) { return '<button type="button" class="sg-si' + (extra || '') + '" data-tab="' + tab + '"' + (k ? ' data-k="' + k + '"' : '') + '><span class="sg-si__l">' + label + '</span><span class="sg-si__v">' + val + '</span>' + (sub ? '<span class="sg-si__s">' + sub + '</span>' : '') + '</button>'; }
	function strip() {
		var o = [], f = src('fng'), sf = src('stockfg'), c = src('coins'), m = src('markets'), r = src('rates'), fo = S.nextFomc(Date.now());
		if (f) o.push(stripItem('sent', 'Crypto F&amp;G', f.now.v, '<i class="sg-dotc sg-' + S.fgClass(f.now.v) + '"></i>' + esc(f.now.label), 'cfg'));
		if (sf) o.push(stripItem('sent', 'Stock F&amp;G', sf.score, '<i class="sg-dotc sg-' + S.fgClass(sf.score) + '"></i>' + esc(sf.label), 'sfg'));
		(c || []).forEach(function (x) { if (x.id === 'bitcoin') o.push(stripItem('crypto', 'Bitcoin', esc(S.money(x.price)), chg(x.ch24, 1), 'btc')); });
		if (m && m.spx) o.push(stripItem('mkts', 'S&amp;P 500', esc(S.fmt(m.spx.price, 0)), chg(m.spx.chPct, 1), 'spx'));
		if (m && m.gold) o.push(stripItem('mkts', 'Gold', esc(S.money(m.gold.price)), chg(m.gold.chPct, 1), 'gold'));
		if (r) {
			o.push(stripItem('rates', 'Fed funds', esc(S.fmt(r.lower[1], 2) + '–' + S.fmt(r.target.rate, 2) + '%'), 'target range', 'dff'));
			o.push(stripItem('rates', '10-yr yield', esc(S.fmt(r.latest.dgs10[1], 2) + '%'), '', 't10'));
			var sp = r.latest.spread[1]; o.push(stripItem('rates', '10y − 2y', (sp < 0 ? '<span class="sg-neg">' : '<span>') + esc((sp > 0 ? '+' : '') + Math.round(sp * 100) + ' bp') + '</span>', sp < 0 ? 'inverted' : 'normal', 'spread'));
		}
		var odds = S.conflictOdds(S.geoMarkets([(src('geo') || []).concat(src('geok') || [])]), 1)[0];
		o.push(stripItem('geo', 'Doomsday Clock', esc(S.DOOMSDAY_LATEST.seconds + ' s'), 'to midnight'));
		if (odds) o.push(stripItem('geo', 'Top conflict market', esc((odds.yes < 1 ? '<1' : S.fmt(odds.yes, 0)) + '%'), '<span class="sg-si__q" title="' + esc(odds.title) + '">' + esc(odds.title.replace(/\?$/, '').slice(0, 28)) + (odds.title.length > 29 ? '…' : '') + '</span>'));
		if (fo) o.push(stripItem('rates', 'Next FOMC', '<span id="sg-fomc-cd">' + esc(fo.live ? 'this week' : S.countdown(fo.at - Date.now())) + '</span>', esc(dshort(fo.end)) + (fo.sep ? ' · dot plot' : '')));
		$('sg-strip').innerHTML = o.join('') || '<span class="sg-loading">No data right now.</span>';
		markChanged();
	}
	$('sg-strip').addEventListener('click', function (e) { var b = e.target.closest('.sg-si'); if (b) { showTab(b.getAttribute('data-tab')); var t = $('sg-tabs'); if (t.getBoundingClientRect().top < 0) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });

	// ---------- what changed since the last visit (only this browser's localStorage) ----------
	function visitDiff() {
		var now = S.snapshot(data.sources), mem = {};
		try { mem = JSON.parse(localStorage.getItem(KEY + ':snap') || '{}'); } catch (e) {}
		if (mem.cur && Date.now() - mem.cur.t > 30 * 60e3) mem.prev = mem.cur;
		mem.cur = { t: Date.now(), v: now };
		try { localStorage.setItem(KEY + ':snap', JSON.stringify(mem)); } catch (e) {}
		snaps = mem.prev ? { t: mem.prev.t, list: S.changes(mem.prev.v, now) } : null;
		var box = $('sg-changes');
		if (!snaps || !snaps.list.length) { box.hidden = true; return; }
		var big = snaps.list.filter(function (c) { return c.big; });
		box.hidden = false;
		box.innerHTML = '<b>Since your last visit (' + esc(S.ago(Date.now() - snaps.t)) + ' ago):</b> ' + (big.length ? big.map(function (c) { return '<span class="sg-cc ' + (c.up ? 'up' : 'dn') + '">' + esc(c.name) + ' ' + esc(c.text) + '</span>'; }).join('') : '<span class="tu-note">no big moves</span>') +
			'<details class="sg-cmore"><summary>All changes</summary>' + snaps.list.map(function (c) { return '<span class="sg-cc' + (c.big ? ' ' + (c.up ? 'up' : 'dn') : '') + '">' + esc(c.name) + ' ' + esc(c.text) + '</span>'; }).join('') + '</details><button type="button" class="sg-cx" aria-label="Hide">&times;</button>';
		box.querySelector('.sg-cx').onclick = function () { box.hidden = true; };
	}
	function markChanged() {
		if (!snaps) return;
		snaps.list.forEach(function (c) { if (!c.big) return; var el = $('sg-strip').querySelector('[data-k="' + c.key + '"]'); if (el) { el.classList.add('sg-moved'); el.title = 'Changed ' + c.text + ' since your last visit'; } });
	}

	// ---------- panels ----------
	function drawSent() {
		var f = src('fng'), s = src('stockfg'), h;
		if (f) {
			var back = function (n) { var p = f.hist[f.hist.length - 1 - n]; return p ? p[1] : null; };
			h = '<div class="sg-gh"><b>Crypto Fear &amp; Greed</b> ' + q('cfg') + '</div>' + gauge(f.now.v) + '<div class="sg-gv sg-' + S.fgClass(f.now.v) + 't">' + f.now.v + '<small>' + esc(f.now.label) + '</small></div>' +
				'<div class="sg-ago">' + [['Yesterday', 1], ['Last week', 7], ['Last month', 30]].map(function (x) { var v = back(x[1]); return v == null ? '' : '<span>' + x[0] + '<b class="sg-' + S.fgClass(v) + 't">' + v + '</b></span>'; }).join('') + '</div><p class="tu-note">Daily, by <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener">alternative.me</a>, ' + esc(dshort(f.now.date)) + '.</p>';
			$('sg-cfg').innerHTML = h;
		} else $('sg-cfg').innerHTML = '<div class="sg-gh"><b>Crypto Fear &amp; Greed</b></div>' + err('fng');
		if (s) {
			h = '<div class="sg-gh"><b>MES Stock Fear &amp; Greed</b> ' + q('sfg') + '</div>' + gauge(s.score) + '<div class="sg-gv sg-' + S.fgClass(s.score) + 't">' + s.score + '<small>' + esc(s.label) + '</small></div>' +
				'<ul class="sg-parts">' + s.parts.map(function (p) { return '<li><span>' + esc(p.name) + ' ' + q(p.key) + '<small>' + esc(S.fmt(p.value, 2) + p.unit) + '</small></span><span class="sg-bar"><i class="sg-' + S.fgClass(p.score) + '" style="width:' + Math.max(2, p.score) + '%"></i></span><b>' + p.score + '</b></li>'; }).join('') + '</ul>' +
				'<details class="sg-method"><summary>How this is worked out</summary><p>' + esc(S.STOCK_FG_METHOD) + '</p><p>Our own composite, not CNN&rsquo;s Fear &amp; Greed Index. Trading day ' + esc(dshort(s.date)) + '.</p></details>';
			$('sg-sfg').innerHTML = h;
		} else $('sg-sfg').innerHTML = '<div class="sg-gh"><b>MES Stock Fear &amp; Greed</b></div>' + err('stockfg');
		var since = S.ymd(Date.now() - st.fg * 864e5), ser = [];
		if (f) ser.push({ name: 'Crypto', cls: 's1', pts: S.sinceDate(f.hist, since) });
		if (s) ser.push({ name: 'Stocks (MES)', cls: 's2', pts: S.sinceDate(s.hist, since) });
		$('sg-fg-legend').innerHTML = ser.map(function (x) { return '<span><i class="sg-sw ' + x.cls + '"></i>' + x.name + '</span>'; }).join('') + '<span><i class="sg-sw sg-sw--xf"></i>Extreme fear</span><span><i class="sg-sw sg-sw--xg"></i>Extreme greed</span>';
		if (ser.length) chart($('sg-fg-chart'), { series: ser, yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100], bands: [[0, 25, 'sg-band-xf'], [75, 100, 'sg-band-xg']], label: 'Fear and Greed history', fv: function (v) { return v + ' (' + S.fgLabel(v) + ')'; } });
		else $('sg-fg-chart').innerHTML = '';
	}
	function drawCrypto() {
		var c = src('coins'), g = src('global'), sb = src('stables'), hv = src('halving');
		$('sg-coins').innerHTML = c ? c.map(function (x) {
			return '<div class="sg-coin"><div class="sg-coin__h"><b>' + esc(x.name) + '</b><span>' + esc(x.sym) + (x.rank ? ' · #' + x.rank : '') + '</span></div><div class="sg-coin__p">' + esc(S.money(x.price)) + '</div>' +
				'<div class="sg-coin__c"><span>24h ' + chg(x.ch24, 1) + '</span><span>7d ' + chg(x.ch7, 1) + '</span></div>' + spark(x.spark, 150, 36) + '<div class="tu-note">' + (x.athPct != null ? esc(S.pct(x.athPct, 0)) + ' from its all-time high' : '') + '</div></div>';
		}).join('') + '<p class="tu-note sg-wide">7-day sparklines ' + q('spark') + ' · prices by <a href="https://www.coingecko.com" target="_blank" rel="noopener">CoinGecko</a>, in US dollars.</p>' : err('coins');
		var o = '';
		if (g) o += stat('Total crypto market cap ' + q('mcap'), S.money(g.mcap, 'big'), '24h ' + chg(g.mcapCh24, 1), true) + stat('Bitcoin dominance ' + q('dominance'), S.fmt(g.btcDom, 1) + '%', 'Ether ' + S.fmt(g.ethDom, 1) + '%') + stat('24h trading volume', S.money(g.vol, 'big'), esc(S.fmt(g.coins, 0)) + ' coins tracked');
		else o += stat('Total crypto market cap', '—', 'not available right now');
		if (sb) o += stat('Stablecoin supply ' + q('stablecoin'), S.money(sb.total, 'big'), sb.top.slice(0, 3).map(function (t) { return esc(t[0]) + ' ' + esc(S.money(t[1], 'big')); }).join(' · '));
		$('sg-cstats').innerHTML = o;
		if (hv) {
			var left = hv.eta - Date.now();
			$('sg-halving').innerHTML = '<div class="sg-chead"><b>Next Bitcoin halving ' + q('halving') + '</b><span class="tu-note">block ' + esc(S.fmt(hv.target, 0)) + '</span></div><div class="sg-hv"><div class="sg-hv__big">' + esc(Math.floor(left / 864e5) + ' days') + '</div><div>about <b>' + esc(new Date(hv.eta).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) + '</b><br><span class="tu-note">' + esc(S.fmt(hv.left, 0)) + ' blocks to go at ' + esc((hv.avgSec / 60).toFixed(1)) + ' min per block (recent average)</span></div></div>' +
				'<div class="sg-prog" role="img" aria-label="' + hv.epochPct + '% of this halving period done"><i style="width:' + hv.epochPct + '%"></i></div><p class="tu-note">' + esc(hv.epochPct + '% of the way through this four-year period. Block reward ' + hv.reward + ' BTC now, ' + hv.next + ' BTC after. Current block ' + S.fmt(hv.height, 0)) + ' (<a href="https://mempool.space" target="_blank" rel="noopener">mempool.space</a>).</p>';
		} else $('sg-halving').innerHTML = '<b>Next Bitcoin halving</b>' + err('halving');
	}
	function stat(lab, val, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + lab + '</div><div class="tu-stat__value">' + val + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	var QG = { spx: 'sp500', nasdaq: 'nasdaq', dow: 'dow', gold: 'gold', oil: 'oil', dxy: 'dxy' };
	function drawMkts() {
		var m = src('markets');
		if (!m) { $('sg-quotes').innerHTML = err('markets'); $('sg-q-chart').innerHTML = ''; return; }
		var keys = Object.keys(QG).filter(function (k) { return m[k]; }); if (!m[st.qk]) st.qk = keys[0];
		$('sg-quotes').innerHTML = keys.map(function (k) {
			var x = m[k], money = k === 'gold' || k === 'oil';
			return '<div class="sg-quote" role="button" tabindex="0" data-q="' + k + '" aria-pressed="' + (k === st.qk) + '"><span class="sg-coin__h"><b>' + esc(x.name) + '</b>' + q(QG[k]) + '</span><span class="sg-coin__p">' + esc(money ? S.money(x.price) : S.fmt(x.price, 2)) + '</span><span class="sg-coin__c">' + chg(x.chPct, 2) + '</span>' + spark(x.spark.map(function (p) { return p[1]; }), 150, 32) + '</div>';
		}).join('') + (m._missing ? '<p class="tu-note sg-wide">Not available right now: ' + esc(m._missing.map(function (s) { return s.split(':')[0]; }).join(', ')) + '.</p>' : '');
		var x = m[st.qk];
		$('sg-qtitle').textContent = x.name + ', last 3 months';
		chart($('sg-q-chart'), { series: [{ name: x.name, cls: 's1', pts: x.spark, fill: true }], label: x.name + ' price', fy: function (v) { return v >= 1000 ? S.fmt(v / 1000, 1) + 'k' : S.fmt(v, v < 10 ? 2 : 0); }, fv: function (v) { return S.fmt(v, 2); } });
		$('sg-qsrc').innerHTML = esc('Source: ' + x.src + (x.note ? ' (' + x.note + ')' : '') + '. Last price ' + (x.date ? dshort(x.date) : '') + '. Futures prices for gold and oil; indexes are not directly tradable. Markets that are closed show their last price.');
	}
	function pickQ(e) { if (e.target.closest('.sg-q')) return; var b = e.target.closest('.sg-quote'); if (b) { st.qk = b.getAttribute('data-q'); save(); drawMkts(); var nb = $('sg-quotes').querySelector('[data-q="' + st.qk + '"]'); if (nb && e.type === 'keydown') nb.focus(); } }
	$('sg-quotes').addEventListener('click', pickQ); $('sg-quotes').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sg-quote')) { e.preventDefault(); pickQ(e); } });
	function drawRates() {
		var r = src('rates'), cu = src('curve'), cpi = src('cpi');
		drawFomc();
		var o = '';
		if (r) {
			var ya = function (k) { var p = r.yearAgo[k]; return p ? 'a year ago ' + S.fmt(p[1], 2) + '%' : ''; };
			o += stat('Fed target range ' + q('fedfunds'), S.fmt(r.lower[1], 2) + '–' + S.fmt(r.target.rate, 2) + '%', 'since ' + esc(dshort(r.target.since)) + (r.target.prev != null ? ' (' + (r.target.rate > r.target.prev ? 'raised' : 'cut') + ' ' + esc(S.bp(Math.abs(r.target.rate - r.target.prev))) + ' ' + q('bps') + ')' : ''), true) +
				stat('Effective fed funds', S.fmt(r.latest.dff[1], 2) + '%', esc(ya('dff'))) + stat('2-year Treasury', S.fmt(r.latest.dgs2[1], 2) + '%', esc(ya('dgs2'))) + stat('10-year Treasury', S.fmt(r.latest.dgs10[1], 2) + '%', esc(ya('dgs10'))) +
				stat('10-year minus 2-year ' + q('inversion'), (r.latest.spread[1] > 0 ? '+' : '') + Math.round(r.latest.spread[1] * 100) + ' bp', r.latest.spread[1] < 0 ? '<span class="sg-neg">inverted</span>' : 'normal (not inverted)');
		}
		if (cpi) o += stat('US inflation (CPI) ' + q('cpi'), S.fmt(cpi.latest[1], 1) + '%', 'year over year, ' + esc(dshort(cpi.latest[0])));
		$('sg-rstats').innerHTML = o || err('rates');
		if (r) {
			var since = S.ymd(Date.now() - st.rates * 864e5), ser = [{ name: 'Fed funds (effective)', cls: 's3', pts: S.sinceDate(r.dff, since) }, { name: '2-year', cls: 's2', pts: S.sinceDate(r.dgs2, since) }, { name: '10-year', cls: 's1', pts: S.sinceDate(r.dgs10, since) }];
			$('sg-rates-legend').innerHTML = ser.map(function (x) { return '<span><i class="sg-sw ' + x.cls + '"></i>' + x.name + '</span>'; }).join('');
			chart($('sg-rates-chart'), { series: ser, label: 'US interest rates', fy: function (v) { return S.fmt(v, 1) + '%'; }, fv: function (v) { return S.fmt(v, 2) + '%'; } });
		} else $('sg-rates-chart').innerHTML = err('rates');
		if (cu) {
			var c0 = st.curve > 1000 ? '0000' : S.ymd(Date.now() - st.curve * 30.44 * 864e5).slice(0, 7), pts = cu.m.filter(function (p) { return p[0] >= c0; });
			var daily = r ? S.sinceDate(r.spread, S.ymd(Date.now() - 40 * 864e5)) : [];
			chart($('sg-curve-chart'), { series: [{ name: '10y − 2y', cls: 's1', pts: pts, negFill: true }], zero: true, xBands: cu.rec, label: '10-year minus 2-year Treasury spread', fy: function (v) { return (v > 0 ? '+' : '') + S.fmt(v, 1); }, fv: function (v) { return (v > 0 ? '+' : '') + Math.round(v * 100) + ' bp'; } });
			var last = cu.inv[cu.inv.length - 1];
			$('sg-curve-note').innerHTML = 'Monthly averages, percentage points (FRED T10Y2Y; grey = NBER recessions, FRED USREC). ' + (daily.length && daily[daily.length - 1][1] < 0 ? '<b>The curve is inverted now.</b> ' : '') +
				(last ? 'The last inversion ran from ' + esc(dshort(last[0])) + ' to ' + esc(dshort(last[1])) + ' (deepest ' + Math.round(last[2] * 100) + ' bp). ' : '') + 'An inversion has come before every US recession since the 1970s, with a delay of months to two years, and has had false alarms: a warning light, not a forecast.';
		} else $('sg-curve-chart').innerHTML = err('curve');
		if (cpi) chart($('sg-cpi-chart'), { series: [{ name: 'CPI inflation', cls: 's2', pts: cpi.yoy }], bands: [[1.9, 2.1, 'sg-band-target']], zero: true, label: 'US CPI inflation, year over year', fy: function (v) { return S.fmt(v, 0) + '%'; }, fv: function (v) { return S.fmt(v, 1) + '% (Fed aim: about 2%)'; } });
		else $('sg-cpi-chart').innerHTML = err('cpi');
		var cb = [['boc', 'Bank of Canada', 'overnight rate target'], ['ecb', 'European Central Bank', 'deposit facility rate'], ['boe', 'Bank of England', 'Bank Rate']];
		$('sg-cbanks').innerHTML = cb.map(function (b) { var x = src(b[0]); return x ? stat(b[1], S.fmt(x.rate, 2) + '%', esc(b[2] + ', since ' + dshort(x.since) + (x.prev != null ? ' (was ' + S.fmt(x.prev, 2) + '%)' : ''))) : stat(b[1], '—', 'not available right now'); }).join('');
		news($('sg-fed'), src('fed'), 'fed');
	}
	function drawFomc() {
		var fo = S.nextFomc(Date.now()), el = $('sg-fomc');
		if (!fo) { el.innerHTML = '<b>Next FOMC meeting</b><p class="tu-note">The 2028 schedule is not on this page yet. See <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noopener">the Fed&rsquo;s calendar</a>.</p>'; return; }
		var rest = S.FOMC.slice(fo.idx + 1, fo.idx + 6);
		el.innerHTML = '<div class="sg-chead"><b>Next Fed meeting (FOMC) ' + q('fomc') + '</b><span class="tu-note">' + esc(dshort(fo.start)) + ' – ' + esc(dshort(fo.end)) + '</span></div>' +
			'<div class="sg-hv"><div class="sg-hv__big" id="sg-fomc-big">' + esc(fo.live ? 'This week' : S.countdown(fo.at - Date.now())) + '</div><div>Decision at <b>' + esc(new Date(fo.at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</b> your time (2:00 pm Eastern), press conference 30 minutes later.' +
			(fo.sep ? '<br><b>With projections and the dot plot</b> ' + q('dotplot') : '') + '</div></div>' +
			'<div class="sg-later"><span class="tu-note">After that:</span> ' + rest.map(function (f) { return '<span>' + esc(dshort(f[1])) + (f[2] ? ' &#9679;' : '') + '</span>'; }).join('') + ' <span class="tu-note">(&#9679; = dot plot)</span></div>' +
			'<p class="tu-note">Schedule from <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noopener">federalreserve.gov</a>, checked ' + esc(S.FOMC_CHECKED) + '. Kalshi and Polymarket odds for this meeting are on the Prediction markets tab.</p>';
	}
	// one prediction-market card (Prediction markets tab and Geopolitics tab)
	function mkCard(m) {
		var rows = m.outcomes;
		if (m.ladder) { var near = m.outcomes.map(function (o, i) { return [Math.abs(o.p - 50), i]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, 6).map(function (x) { return x[1]; }).sort(function (a, b) { return a - b; }); rows = near.map(function (i) { return m.outcomes[i]; }); }
		var vol = m.vol24 && m.src !== 'Kalshi' ? '<span class="tu-note">' + esc(S.money(m.vol24, 'big')) + ' traded in 24h ' + q('vol') + '</span>' : '';
		if (m.geo) vol = (m.vol ? '<span class="tu-note">' + esc(S.money(m.vol, 'big')) + ' traded in total</span>' : '') + (m.contracts ? '<span class="tu-note">' + esc(S.fmt(m.contracts, 0)) + ' contracts traded ' + q('contracts') + '</span>' : '');
		return '<article class="sg-mk"><div class="sg-mk__h"><span class="sg-src sg-src--' + (m.src === 'Kalshi' ? 'k' : 'p') + '">' + esc(m.src) + '</span><span class="tu-note">' + esc(m.dated ? 'by date, earliest first' : m.cat) + '</span></div><h3>' + esc(m.title) + (m.sub ? ' <small>' + esc(m.sub) + '</small>' : '') + '</h3>' +
			(m.likely ? '<p class="sg-likely">Most likely range: <b>' + esc(m.likely.label) + '</b> (' + esc(S.fmt(m.likely.p, 0)) + '%)</p>' : '') +
			'<ul class="sg-oc">' + rows.map(function (o) { return '<li><span class="sg-oc__l" title="' + esc(o.label) + '">' + esc(o.label) + '</span><span class="sg-bar"><i style="width:' + Math.max(1, o.p) + '%"></i></span><b>' + esc(o.p < 1 ? '<1' : S.fmt(o.p, 0)) + '%</b></li>'; }).join('') + '</ul>' +
			'<div class="sg-mk__f">' + (m.more ? '<span class="tu-note">+' + m.more + ' more answers</span>' : '') + vol + (m.ladder ? '<span class="tu-note">' + m.outcomes.length + ' levels, showing the 6 nearest 50%</span>' : '') + (m.end ? '<span class="tu-note">ends ' + esc(dshort(m.end.slice(0, 10))) + '</span>' : '') + '<a href="' + esc(m.url) + '" target="_blank" rel="noopener nofollow">Open on ' + esc(m.src) + ' &#8599;</a></div></article>';
	}
	function drawPred() {
		var pm = src('poly') || [], ks = src('kalshi') || [], all = ks.concat(pm), cats = ['All'];
		all.forEach(function (m) { if (m.cat && cats.indexOf(m.cat) < 0) cats.push(m.cat); });
		if (cats.indexOf(st.pcat) < 0) st.pcat = 'All';
		$('sg-pcats').innerHTML = cats.map(function (c) { var n = c === 'All' ? all.length : all.filter(function (m) { return m.cat === c; }).length; return '<button type="button" class="tu-chip" data-c="' + esc(c) + '" aria-pressed="' + (c === st.pcat) + '">' + esc(c) + ' (' + n + ')</button>'; }).join('');
		var ORD = ['Fed', 'Economy', 'Crypto', 'Politics'], rank = function (m) { var i = ORD.indexOf(m.cat); return i < 0 ? 9 : i; };
		all = all.map(function (m, i) { return [m, i]; }).sort(function (a, b) { return rank(a[0]) - rank(b[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; });
		var list = all.filter(function (m) { return st.pcat === 'All' || m.cat === st.pcat; });
		if (!all.length) { $('sg-markets').innerHTML = err('poly'); return; }
		$('sg-markets').innerHTML = list.map(mkCard).join('') + ((src('poly') && src('kalshi')) ? '' : '<p class="tu-note">' + (!src('poly') ? 'Polymarket' : 'Kalshi') + ' did not answer this time.</p>') +
			'<p class="tu-note sg-wide">War, ceasefire and invasion markets are on the <a href="?tab=geo" data-goto="geo">Geopolitics</a> tab.</p>';
	}
	$('sg-pcats').addEventListener('click', function (e) { var b = e.target.closest('.tu-chip'); if (b) { st.pcat = b.getAttribute('data-c'); save(); drawPred(); } });
	root.addEventListener('click', function (e) { var a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); showTab(a.getAttribute('data-goto')); $('sg-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
	function news(el, items, n) { el.innerHTML = items ? items.map(function (i) { return '<li><a href="' + esc(i.link) + '" target="_blank" rel="noopener nofollow">' + esc(i.title) + '</a><span class="tu-note">' + (i.src ? esc(i.src) + ' · ' : '') + esc(i.date ? ago(i.date) : '') + '</span></li>'; }).join('') : '<li>' + err(n) + '</li>'; }

	// ---------- News tab: collapsible sections, Cards | List | Compact, columns, how many, source chips (all saved in localStorage) ----------
	var SECSRC = { crypto: 'news', markets: 'mnews', world: 'wnews', fed: 'fed' };
	function secItems(sec) {
		var d = src(SECSRC[sec]);
		if (sec === 'fed') return d ? d.map(function (i) { return Object.assign({ src: 'Federal Reserve', sid: 'fed' }, i); }) : null;
		return d ? d.items : null;
	}
	function initial(name) { return esc(String(name || '?').replace(/^The /, '').charAt(0).toUpperCase()); }
	function newsItem(i) {
		var meta = '<span class="sg-nc__m"><b>' + esc(i.src || i.host) + '</b>' + (i.date ? ' · <time datetime="' + esc(i.date) + '">' + esc(ago(i.date)) + '</time>' : '') + '</span>';
		var pic = st.nview === 'cards' ? '<span class="sg-nc__img sg-nc__img--' + esc(i.sid || 'x') + '">' + (i.img ? '<img src="' + esc(i.img) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '<span class="sg-nc__ini" aria-hidden="true">' + initial(i.src) + '</span></span>' : '';
		var sum = st.nview !== 'compact' && i.sum ? '<span class="sg-nc__s">' + esc(i.sum) + '</span>' : '';
		return '<li class="sg-nc' + (i.img && st.nview === 'cards' ? ' has-img' : '') + '"><a class="sg-nc__a" href="' + esc(i.link) + '" target="_blank" rel="noopener nofollow">' + pic + '<span class="sg-nc__b"><span class="sg-nc__t">' + esc(i.title) + '</span>' + sum + meta + '</span></a></li>';
	}
	// box = container, key = section key (also the saved collapse / source-filter key), title, items, extra filter
	function newsSection(key, title, items, errName, filt) {
		var closed = !!st.nclosed[key], off = st.nsrc[key] || [], srcs = [];
		if (items) items.forEach(function (i) { if (srcs.indexOf(i.src) < 0) srcs.push(i.src); });
		var shown = items ? items.filter(function (i) { return off.indexOf(i.src) < 0 && (!filt || filt(i)); }) : [], lim = +st.nshow || shown.length, list = shown.slice(0, lim);
		var head = '<h2 class="sg-nsec__h"><button type="button" class="sg-nsec__tg" aria-expanded="' + !closed + '" data-nsec="' + esc(key) + '"><span class="sg-nsec__ar" aria-hidden="true">&#9662;</span>' + esc(title) + ' <span class="sg-nsec__n">' + (items ? shown.length : 0) + '</span></button></h2>';
		var body = '';
		if (!items) body = err(errName);
		else {
			if (srcs.length > 1) body += '<div class="tu-chips sg-nsrc">' + srcs.map(function (s) { var n = items.filter(function (i) { return i.src === s && (!filt || filt(i)); }).length; return '<button type="button" class="tu-chip" data-nsrc="' + esc(key) + '" data-s="' + esc(s) + '" aria-pressed="' + (off.indexOf(s) < 0) + '">' + esc(s) + ' (' + n + ')</button>'; }).join('') + '</div>';
			body += list.length ? '<ul class="sg-nlist sg-nlist--' + st.nview + '" data-cols="' + esc(st.nview === 'compact' && st.ncols === 'auto' ? '1' : st.ncols) + '">' + list.map(newsItem).join('') + '</ul>' : '<p class="tu-note">Nothing to show with these sources switched off.</p>';
			if (shown.length > list.length) body += '<button type="button" class="tu-btn tu-btn--ghost sg-nmore" data-nset-more="1">Show all ' + shown.length + '</button>';
			var miss = src(SECSRC[key]) && src(SECSRC[key]).missing; if (miss) body += '<p class="tu-note">Not available right now: ' + esc(miss.map(function (m) { return m.split(':')[0]; }).join(', ')) + '.</p>';
		}
		return '<section class="sg-nsec' + (closed ? ' is-closed' : '') + '">' + head + '<div class="sg-nsec__b"' + (closed ? ' hidden' : '') + '>' + body + '</div></section>';
	}
	function drawNews() {
		$('sg-nsecs').innerHTML = S.NEWS_SECTIONS.map(function (s) { return newsSection(s[0], s[1], secItems(s[0]), SECSRC[s[0]]); }).join('');
		ntools();
	}
	function ntools() {
		[].forEach.call(root.querySelectorAll('[data-nset]'), function (g) { var k = g.getAttribute('data-nset'); [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === String(st[k]))); }); });
		var ct = root.querySelector('.sg-ncols-tool'); if (ct) ct.classList.toggle('is-dim', st.nview === 'compact');
	}
	function redrawNews() { if (st.tab === 'news') drawNews(); else if (st.tab === 'geo') drawGeoNews(); }
	root.addEventListener('click', function (e) {
		var b = e.target.closest('[data-nset] button');
		if (b) { var k = b.parentNode.getAttribute('data-nset'), v = b.getAttribute('data-v'); st[k] = k === 'nshow' ? +v : v; save(); redrawNews(); return; }
		var t = e.target.closest('.sg-nsec__tg');
		if (t) {
			var key = t.getAttribute('data-nsec'), sec = t.closest('.sg-nsec'), open = t.getAttribute('aria-expanded') !== 'true';
			if (open) delete st.nclosed[key]; else st.nclosed[key] = 1; save();
			t.setAttribute('aria-expanded', String(open)); sec.classList.toggle('is-closed', !open); sec.querySelector('.sg-nsec__b').hidden = !open; return;
		}
		var f = e.target.closest('[data-fold]');
		if (f) { var shut = f.getAttribute('data-fold') === 'close'; S.NEWS_SECTIONS.forEach(function (s) { if (shut) st.nclosed[s[0]] = 1; else delete st.nclosed[s[0]]; }); save(); drawNews(); return; }
		var c = e.target.closest('[data-nsrc]');
		if (c) { var k2 = c.getAttribute('data-nsrc'), s2 = c.getAttribute('data-s'), off = (st.nsrc[k2] || []).slice(), i = off.indexOf(s2); if (i < 0) off.push(s2); else off.splice(i, 1); if (off.length) st.nsrc[k2] = off; else delete st.nsrc[k2]; save(); redrawNews(); return; }
		if (e.target.closest('[data-nset-more]')) { st.nshow = 0; save(); redrawNews(); }
		var gc = e.target.closest('[data-gconf]'); if (gc) { st.gconf = st.gconf ? 0 : 1; save(); drawGeoNews(); }
	});
	// a picture that fails to load leaves the source initial behind it
	root.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.closest('.sg-nc__img')) { var li = t.closest('.sg-nc'); t.remove(); if (li) li.classList.remove('has-img'); } }, true);

	// ---------- Geopolitics tab ----------
	function geoList() { return (src('geo') || []).concat(src('geok') || []).map(function (m) { return Object.assign({ geo: true }, m); }); }
	function drawGeo() {
		var all = S.geoMarkets([geoList()]), odds = S.conflictOdds(all, 6);
		$('sg-godds').innerHTML = '<div class="sg-chead"><b>Conflict odds, as the markets price them ' + q('geoodds') + '</b><span class="tu-note">the market&rsquo;s own &ldquo;Yes&rdquo; price, biggest markets first</span></div>' +
			(odds.length ? '<ul class="sg-gol">' + odds.map(function (o) { return '<li><a href="' + esc(o.url) + '" target="_blank" rel="noopener nofollow">' + esc(o.title) + '</a><span class="sg-bar"><i style="width:' + Math.max(1, o.yes) + '%"></i></span><b>' + esc(o.yes < 1 ? '<1' : S.fmt(o.yes, 0)) + '%</b><span class="tu-note">' + esc(o.src + (o.vol ? ' · ' + S.money(o.vol, 'big') + ' traded' : '') + (o.end ? ' · ends ' + dshort(o.end.slice(0, 10)) : '')) + '</span></li>'; }).join('') + '</ul>' +
				'<p class="tu-note">Traders&rsquo; prices, not facts or forecasts by MES; nothing is averaged or added. Thin markets move on rumours: open the market to read exactly how it resolves.</p>' : err('geo'));
		drawClock();
		drawGauges();
		$('sg-gmarkets').innerHTML = all.length ? all.slice(0, 18).map(mkCard).join('') + (src('geo') && src('geok') ? '' : '<p class="tu-note sg-wide">' + (!src('geo') ? 'Polymarket' : 'Kalshi') + ' did not answer this time.</p>') : err('geo');
		drawWarCost();
		drawGeoNews();
	}
	function clockFace(sec) {
		var a = -sec / 3600 * 2 * Math.PI, cx = 60, cy = 60, r = 52, mh = [cx + 44 * Math.sin(a), cy - 44 * Math.cos(a)], ticks = '';
		for (var i = 0; i < 12; i++) { var t = i / 12 * 2 * Math.PI; ticks += '<line class="sg-ck__t" x1="' + (cx + 46 * Math.sin(t)).toFixed(1) + '" y1="' + (cy - 46 * Math.cos(t)).toFixed(1) + '" x2="' + (cx + 51 * Math.sin(t)).toFixed(1) + '" y2="' + (cy - 51 * Math.cos(t)).toFixed(1) + '"></line>'; }
		var wedge = 'M' + cx + ' ' + cy + ' L' + mh[0].toFixed(2) + ' ' + mh[1].toFixed(2) + ' A44 44 0 0 1 ' + cx + ' ' + (cy - 44) + ' Z';
		return '<svg class="sg-ck" viewBox="0 0 120 120" role="img" aria-label="Clock face with the minute hand ' + esc(S.clockText(sec)) + ' before midnight"><circle class="sg-ck__f" cx="60" cy="60" r="' + r + '"></circle>' + ticks + '<path class="sg-ck__w" d="' + wedge + '"></path><line class="sg-ck__h" x1="60" y1="60" x2="60" y2="30"></line><line class="sg-ck__m" x1="60" y1="60" x2="' + mh[0].toFixed(2) + '" y2="' + mh[1].toFixed(2) + '"></line><circle class="sg-ck__c" cx="60" cy="60" r="3.5"></circle></svg>';
	}
	function drawClock() {
		var ds = S.doomsdayStats(), L0 = S.DOOMSDAY_LATEST, mv = ds.lastMove;
		$('sg-dclock').innerHTML = '<div class="sg-gh"><b>Doomsday Clock</b> ' + q('doomsday') + '</div><div class="sg-ckw">' + clockFace(L0.seconds) + '<div><div class="sg-hv__big sg-dc__v">' + esc(S.clockText(L0.seconds)) + '</div><div>to midnight, set ' + esc(dshort(L0.announced)) + '</div>' +
			(mv ? '<div class="tu-note">Moved from ' + esc(S.clockText(mv.from)) + ' in ' + mv.year + '. The closest it has ever been; the farthest was ' + esc(S.clockText(ds.farthest[1])) + ' in ' + ds.farthest[0] + '.</div>' : '') + '</div></div>' +
			'<p class="tu-note">Set once a year by the <a href="' + esc(L0.url) + '" target="_blank" rel="noopener">Bulletin of the Atomic Scientists</a>, usually in late January: an expert judgment, not a probability. The next setting is usually announced in January. Settings entered by hand from <a href="' + esc(S.DOOMSDAY_SRC) + '" target="_blank" rel="noopener">the Bulletin&rsquo;s timeline</a>, checked ' + esc(S.DOOMSDAY_CHECKED) + '.</p>';
		chart($('sg-dc-chart'), { series: [{ name: 'Minutes to midnight', cls: 's2', pts: S.doomsdaySteps(S.ymd(Date.now())), fill: true }], yMin: 0, yMax: 18, yTicks: [0, 3, 6, 9, 12, 15, 18], label: 'Doomsday Clock, minutes to midnight, 1947 to today', fy: function (v) { return v + ' min'; }, fv: function (v) { return S.clockText(Math.round(v * 60)) + ' to midnight'; } });
		$('sg-dctable').innerHTML = '<table class="tu-table"><thead><tr><th>Year</th><th>Setting</th></tr></thead><tbody>' + S.DOOMSDAY.slice().reverse().map(function (x, i, a) { var nx = a[i + 1], ch = nx ? (x[1] < nx[1] ? ' <span class="sg-neg">&#9650; closer</span>' : x[1] > nx[1] ? ' <span class="sg-ch up">&#9660; farther</span>' : ' <span class="tu-note">unchanged</span>') : ' <span class="tu-note">first setting</span>'; return '<tr><td>' + x[0] + '</td><td>' + esc(S.clockText(x[1])) + ch + '</td></tr>'; }).join('') + '</tbody></table>';
	}
	function drawGauges() {
		var m = src('markets') || {}, sf = src('stockfg'), vix = sf && sf.parts.filter(function (p) { return p.key === 'vix'; })[0], o = [];
		[['oil', 'Oil (WTI)', true], ['gold', 'Gold', true], ['dxy', 'US dollar index', false]].forEach(function (k) { var x = m[k[0]]; if (x) o.push('<div class="sg-quote sg-gq"><span class="sg-coin__h"><b>' + esc(k[1]) + '</b></span><span class="sg-coin__p">' + esc(k[2] ? S.money(x.price) : S.fmt(x.price, 2)) + '</span><span class="sg-coin__c">' + chg(x.chPct, 2) + '<span>day</span></span>' + spark(x.spark.map(function (p) { return p[1]; }), 150, 30) + '</div>'); });
		if (vix) o.push('<div class="sg-quote sg-gq"><span class="sg-coin__h"><b>VIX</b>' + q('vix') + '</span><span class="sg-coin__p">' + esc(S.fmt(vix.value, 2)) + '</span><span class="sg-coin__c"><span>' + esc(vix.value >= 30 ? 'fearful' : vix.value >= 20 ? 'nervous' : 'calm') + ' · ' + esc(dshort(sf.date)) + '</span></span></div>');
		$('sg-gauges').innerHTML = '<div class="sg-gh"><b>Markets&rsquo; fear gauges</b> ' + q('feargauges') + '</div>' + (o.length ? '<div class="sg-gqs">' + o.join('') + '</div><p class="tu-note">Day change and 3-month line. These move for many reasons besides conflict. More on the <a href="?tab=mkts" data-goto="mkts">Stocks &amp; commodities</a> tab.</p>' : err('markets'));
	}
	function drawWarCost() {
		var W = S.WAR_COSTS, max = Math.max.apply(null, W.map(function (w) { return w[1]; })), days = Math.floor((Date.now() - Date.parse(S.WAR_START + 'T00:00:00Z')) / 864e5);
		$('sg-warcost').innerHTML = '<div class="sg-chead"><b>What the Iran war has cost the US: published estimates ' + q('warcost') + '</b><span class="tu-note">US dollars, as stated on each date</span></div>' +
			'<ul class="sg-wc">' + W.map(function (w) { return '<li><span class="sg-wc__d">' + esc(dshort(w[0])) + '</span><span class="sg-wc__v">' + esc('$' + S.fmt(w[1], w[1] % 1 ? 1 : 0) + 'B') + '</span><span class="sg-bar"><i style="width:' + (w[1] / max * 100).toFixed(1) + '%"></i></span><span class="sg-wc__w"><b>' + esc(w[2]) + '.</b> ' + esc(w[3]) + ' <a href="' + esc(w[4]) + '" target="_blank" rel="noopener nofollow">Source &#8599;</a></span></li>'; }).join('') + '</ul>' +
			'<p class="tu-note">Strikes began on ' + esc(dshort(S.WAR_START)) + ' (' + days + ' days ago). <b>Why there is no live counter:</b> the only published daily rate (CSIS, about $891 million a day) covers the first 100 hours; the Pentagon totals are cumulative figures given on a date, they count different things, and there were ceasefires in between, so any running number would be our own guess. Wider studies (veterans&rsquo; care, interest on borrowing) put the full cost much higher. Figures entered by hand, checked ' + esc(S.WAR_COSTS_CHECKED) + '.</p>';
	}
	function drawGeoNews() {
		var items = secItems('world'), filt = st.gconf ? function (i) { return S.CONFLICT_RE.test(i.title + ' ' + (i.sum || '')); } : null;
		$('sg-gnews').innerHTML = '<div class="tu-chips"><button type="button" class="tu-chip" data-gconf="1" aria-pressed="' + !!st.gconf + '">Only war, ceasefire &amp; security stories</button></div>' + newsSection('geoworld', 'World headlines', items, 'wnews', filt) +
			'<p class="tu-note">View, columns and how many to show follow the <a href="?tab=news" data-goto="news">News</a> tab&rsquo;s settings.</p>';
	}
	function drawTab(t) { ({ sent: drawSent, crypto: drawCrypto, mkts: drawMkts, rates: drawRates, pred: drawPred, geo: drawGeo, news: drawNews })[t](); rangeBtns(); }

	// ---------- footer + loading ----------
	var NAMES = { fng: 'Crypto Fear & Greed (alternative.me)', coins: 'Crypto prices (CoinGecko)', global: 'Crypto market (CoinGecko)', stables: 'Stablecoins (CoinGecko)', halving: 'Bitcoin blocks (mempool.space)', markets: 'Stocks, gold, oil, dollar (Yahoo Finance, FRED backup)', stockfg: 'Stock Fear & Greed inputs (FRED)', rates: 'US rates (FRED)', curve: 'Yield curve + recessions (FRED)', cpi: 'CPI (FRED)', boc: 'Bank of Canada (Valet)', ecb: 'ECB', boe: 'Bank of England', fed: 'Fed press releases (RSS)', poly: 'Polymarket', kalshi: 'Kalshi', news: 'Crypto news: CoinDesk, Cointelegraph (RSS)', mnews: 'Markets news: CNBC, MarketWatch, BBC Business (RSS)', wnews: 'World news: BBC, Al Jazeera, NPR, The Guardian, DW (RSS)', geo: 'Conflict markets (Polymarket)', geok: 'Conflict markets (Kalshi)' };
	function foot() {
		$('sg-updated').innerHTML = (MOCK ? '<b>Sample data</b> saved ' : 'Updated ') + esc(ago(data.generated)) + ' · refreshes every 5 minutes';
		$('sg-srcs').innerHTML = Object.keys(NAMES).map(function (k) { var s = data.sources[k]; return '<li class="' + (s && s.ok ? 'ok' : 'bad') + '">' + (s && s.ok ? '&#10003; ' : '&#10007; ') + esc(NAMES[k]) + (s && !s.ok ? ' <span class="tu-note">' + esc(s.error) + '</span>' : '') + '</li>'; }).join('');
	}
	function status(m, bad) { var s = $('sg-status'); s.hidden = !m; s.className = 'sg-status' + (bad ? ' err' : ''); s.innerHTML = m || ''; }
	function load(manual) {
		if (loading) return; loading = true; $('sg-refresh').disabled = true;
		fetch(MOCK ? '/signals/data/sample.json' : '/api/signals', manual && !MOCK ? { cache: 'reload' } : {}).then(function (r) { if (!r.ok && r.status !== 502) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
			loading = false; $('sg-refresh').disabled = false;
			if (!j || !j.sources) throw new Error('bad answer');
			var first = !data; data = j; status(MOCK ? 'Showing <b>sample data</b> saved ' + esc(dshort(j.generated)) + ' (preview mode). The live page loads fresh numbers.' : '');
			if (first) visitDiff();
			strip(); foot(); drawTab(st.tab);
		}).catch(function () { loading = false; $('sg-refresh').disabled = false; if (!data) { $('sg-strip').innerHTML = ''; status('Could not load the signals. Check your connection and press Refresh.', true); } else status('Refresh failed; showing the numbers from ' + esc(ago(data.generated)) + '.', true); });
	}
	$('sg-refresh').onclick = function () { load(true); };
	setInterval(function () {
		var fo = S.nextFomc(Date.now()); if (fo) { var t = fo.live ? 'this week' : S.countdown(fo.at - Date.now()); if ($('sg-fomc-cd')) $('sg-fomc-cd').textContent = t; if ($('sg-fomc-big')) $('sg-fomc-big').textContent = fo.live ? 'This week' : t; }
	}, 30000);
	setInterval(function () { if (!document.hidden && data && Date.now() - Date.parse(data.generated) > 5 * 60e3) load(); }, 60000);
	var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { [].forEach.call(root.querySelectorAll('.sg-chart'), function (b) { if (b._redraw && b.offsetParent) b._redraw(); }); }, 150); });
	if (window.ResizeObserver) { var lastW = root.clientWidth; new ResizeObserver(function () { if (Math.abs(root.clientWidth - lastW) > 4) { lastW = root.clientWidth; clearTimeout(rz); rz = setTimeout(function () { if (data) drawTab(st.tab); }, 120); } }).observe(root); }
	showTab(st.tab); rangeBtns(); load();
})();
