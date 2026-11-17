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
	// ---------- language: the page sets S.L = window.SG_I18N ({s: {English: translation}, g: glossary}) on the translated pages.
	// S.T(english, {name: value}) = the translation (or the English) with {name} filled in. The API never sets S.L, so it stays English.
	// S.dfmt(ymd) = how dates inside sentences are written (the page swaps in its own locale-aware one).
	S.L = null;
	S.T = function (s, v) { var L = S.L, t = L && L.s && L.s[s]; if (typeof t !== 'string' || !t) t = s; return v ? t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : t; };
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
		// Valet sends `?recent=N` newest first; everything downstream (policy(), charts) wants oldest first
		out.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
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
	// Feeds with no picture in the feed itself (NPR, Al Jazeera, DW, CNBC: see `og` in NEWS_FEEDS): the server reads the start of the
	// article page and takes its og:image / twitter:image, still only from that feed's image hosts (imgOk), and never a site-wide
	// default picture (NPR's "facebook-default", logos). ogOk(link, feed) = may this article page be read (its host is the feed's own site).
	S.ogImage = function (html, hosts) {
		var tags = String(html || '').match(/<meta\b[^>]*>/gi) || [], best = { 'og:image': null, 'og:image:url': null, 'og:image:secure_url': null, 'twitter:image': null, 'twitter:image:src': null };
		for (var i = 0; i < tags.length; i++) {
			var t = tags[i], k = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(t), c = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(t);
			if (!k || !c) continue;
			k = k[1].toLowerCase();
			if (k in best && !best[k]) best[k] = unent(c[1]).trim();
		}
		var order = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
		for (var j = 0; j < order.length; j++) {
			var u = best[order[j]];
			if (u && S.imgOk(u, hosts) && !/default|placeholder|\/logos?\b|\blogo[-_.]/i.test(u)) return S.smallImg(u);
		}
		return null;
	};
	// card-sized copy where the image host resizes by URL (og:images are often 1600-1920 px wide)
	S.smallImg = function (u) {
		if (/^https:\/\/image\.cnbcfm\.com\//.test(u)) return u.replace(/([?&])w=\d+/, '$1w=640').replace(/([?&])h=\d+/, '$1h=360');
		if (/^https:\/\/(www\.)?aljazeera\.com\/wp-content\//.test(u)) return u.replace(/([?&])resize=[^&]*/, '$1resize=640%2C425');
		return u;
	};
	S.ogOk = function (link, feed) {
		if (!feed || !feed.og || !/^https:\/\//i.test(link || '')) return false;
		var h = S.hostOf(link);
		return feed.og.some(function (x) { return h === x || h.slice(-x.length - 1) === '.' + x; });
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
	// The news feeds (all keyless; each checked from a server 2026-10-25). sec = News tab section; img = the hosts its thumbnails may come from;
	// og = the feed has no pictures, so the server reads its article pages (on these hosts only) for og:image (checked 2026-11-01).
	S.NEWS_SECTIONS = [['crypto', 'Crypto'], ['markets', 'Stocks & markets'], ['world', 'World'], ['fed', 'Federal Reserve (monetary policy)']];
	S.NEWS_FEEDS = [
		{ id: 'coindesk', name: 'CoinDesk', sec: 'crypto', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', img: ['cdn.sanity.io', 'coindesk.com'] },
		{ id: 'cointelegraph', name: 'Cointelegraph', sec: 'crypto', url: 'https://cointelegraph.com/rss', img: ['ctmedia.io', 'cointelegraph.com'] },
		{ id: 'cnbc', name: 'CNBC', sec: 'markets', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', img: ['cnbcfm.com'], og: ['cnbc.com'] },
		{ id: 'marketwatch', name: 'MarketWatch', sec: 'markets', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', img: ['mktw.net'] },
		{ id: 'bbcbiz', name: 'BBC Business', sec: 'markets', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbcworld', name: 'BBC World', sec: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'aljazeera', name: 'Al Jazeera', sec: 'world', url: 'https://www.aljazeera.com/xml/rss/all.xml', img: ['aljazeera.com'], og: ['aljazeera.com'] },
		{ id: 'npr', name: 'NPR World', sec: 'world', url: 'https://feeds.npr.org/1004/rss.xml', img: ['media.npr.org'], og: ['npr.org'] },
		{ id: 'guardian', name: 'The Guardian', sec: 'world', url: 'https://www.theguardian.com/world/rss', img: ['guim.co.uk'] },
		{ id: 'dw', name: 'DW', sec: 'world', url: 'https://rss.dw.com/rdf/rss-en-world', img: ['dw.com'], og: ['dw.com'] }];
	// News in the translated pages' own languages (job lnews; shown first on the News tab of /signals-<code>). Keyless RSS, checked 2026-11-17.
	S.LANG_FEEDS = [
		{ id: 'bbcfa', lang: 'fa', name: 'BBC فارسی', url: 'https://feeds.bbci.co.uk/persian/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'dwfa', lang: 'fa', name: 'DW فارسی', url: 'https://rss.dw.com/xml/rss-per-all', img: ['dw.com'] },
		{ id: 'bbcar', lang: 'ar', name: 'BBC عربي', url: 'https://feeds.bbci.co.uk/arabic/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'dwar', lang: 'ar', name: 'DW عربية', url: 'https://rss.dw.com/xml/rss-ar-all', img: ['dw.com'] },
		{ id: 'bbces', lang: 'es', name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbcpt', lang: 'pt-BR', name: 'BBC News Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbctr', lang: 'tr', name: 'BBC Türkçe', url: 'https://feeds.bbci.co.uk/turkce/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbcru', lang: 'ru', name: 'BBC Русская служба', url: 'https://feeds.bbci.co.uk/russian/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbczh', lang: 'zh-CN', name: 'BBC 中文', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbchi', lang: 'hi', name: 'BBC हिंदी', url: 'https://feeds.bbci.co.uk/hindi/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbcid', lang: 'id', name: 'BBC News Indonesia', url: 'https://feeds.bbci.co.uk/indonesia/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'bbcvi', lang: 'vi', name: 'BBC Tiếng Việt', url: 'https://feeds.bbci.co.uk/vietnamese/rss.xml', img: ['bbci.co.uk'] },
		{ id: 'dwde', lang: 'de', name: 'DW Deutsch', url: 'https://rss.dw.com/xml/rss-de-all', img: ['dw.com'] },
		{ id: 'f24fr', lang: 'fr', name: 'France 24', url: 'https://www.france24.com/fr/rss', img: ['france24.com'] }];
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
			// leave out events that are over in all but name: past their end date (still settling), or one answer already at ~100%
			var tEnd = Date.parse(e.endDate || ''), tNow = opt && opt.now != null ? opt.now : Date.now();
			if (isFinite(tEnd) && tEnd < tNow) return;
			if (!dated && oc[0].p >= 99.5) return;
			var o = { id: 'pm' + e.id, src: 'Polymarket', cat: cat || '', title: String(e.title || '').slice(0, 160), url: 'https://polymarket.com/event/' + encodeURIComponent(e.slug), vol24: round(num(e.volume24hr), 0), vol: round(num(e.volume), 0), end: e.endDate || null, outcomes: oc.slice(0, dated ? 6 : 5), more: Math.max(0, oc.length - (dated ? 6 : 5)) };
			if (dated) o.dated = true;
			if (ms.length === 1 && oc.some(function (x) { return /^yes$/i.test(x.label); })) o.binary = true;
			out.push(o);
		});
		return out;
	};
	// ---------- perps (Hyperliquid metaAndAssetCtxs) ----------
	// [meta, ctxs] -> [{sym, px, ch24, funding (per hour, %), apr (%/yr), oi (USD), vol (24h USD), lean}], in PERP_SYMS order.
	// Hyperliquid pays funding every hour; its baseline (interest part, no premium) is 0.00125%/h = ~11%/yr paid by longs, so "lean"
	// compares with that, not with zero. Description only: crowded positioning, not a forecast.
	S.PERP_SYMS = ['BTC', 'ETH', 'SOL', 'XRP', 'HYPE', 'PAXG'];
	S.PERP_BASE = 0.00125;
	S.fundingLean = function (fh) {
		if (fh == null || !isFinite(fh)) return '';
		if (fh < 0) return 'shorts paying';
		if (fh < S.PERP_BASE * 0.6) return 'below normal';
		if (fh <= S.PERP_BASE * 1.6) return 'normal';
		return fh > S.PERP_BASE * 4 ? 'longs very crowded' : 'longs paying more';
	};
	S.parseHlPerps = function (j, syms) {
		if (!Array.isArray(j) || j.length < 2 || !j[0] || !Array.isArray(j[0].universe) || !Array.isArray(j[1])) throw new Error('not a Hyperliquid meta answer');
		var u = j[0].universe, c = j[1], want = syms || S.PERP_SYMS, by = {};
		u.forEach(function (a, i) { if (a && c[i] && !a.isDelisted) by[a.name] = c[i]; });
		var out = [];
		want.forEach(function (sym) {
			var x = by[sym]; if (!x) return;
			var px = num(x.markPx), prev = num(x.prevDayPx), f = num(x.funding), oi = num(x.openInterest), vol = num(x.dayNtlVlm);
			if (px === null) return;
			var fh = f === null ? null : f * 100;
			out.push({ sym: sym, px: px, ch24: prev ? round((px / prev - 1) * 100, 2) : null, funding: fh === null ? null : round(fh, 5), apr: fh === null ? null : round(fh * 24 * 365, 1),
				oi: oi === null ? null : round(oi * px, 0), vol: vol === null ? null : round(vol, 0), lean: S.fundingLean(fh) });
		});
		if (!out.length) throw new Error('no perps found');
		return out;
	};
	// ---------- overview: market mood by sector ----------
	// Fixed rules turn the page's own numbers into one row per sector (what the data shows + a mood word). Descriptive only:
	// the words say how things ARE (fearful, falling, tightening ...), never where they are going. Every rule is listed in
	// S.MOOD_RULES (shown under the table) and tested. d = {sourceName: data|null}; now = ms.
	S.MOOD_RULES = [
		['Fear & Greed', 'below 25 extreme fear, 25-44 fear, 45-55 neutral, 56-75 greed, above 75 extreme greed (same scale as the gauges)'],
		['Price trend', 'change over the period shown: below -5% falling, -5% to -1.5% slipping, -1.5% to +1.5% flat, +1.5% to +5% rising, above +5% climbing (crypto uses 7 days, the rest 3 months)'],
		['Oil, gold, dollar', 'the same trend words, but over 3 months, where -/+3% is flat for gold and the dollar and -/+8% for oil; oil above +20% is surging'],
		['Fed', 'tightening when the last change of the target range was a rise, easing when it was a cut'],
		['Yield curve', '10-year minus 2-year: below 0 inverted, 0 to +0.25 points flat, above that normal'],
		['Inflation', 'US CPI over the last year: above 3% high, 2-3% near target, below 2% low; rising or falling compared with 6 months earlier'],
		['Recession odds', 'Kalshi chance of a US recession next year: below 15% low, 15-35% elevated, above 35% high'],
		['Perps funding', 'compared with Hyperliquid\'s normal 0.00125% an hour (see the Crypto tab)'],
		['Geopolitics', 'Doomsday Clock under 100 seconds = very high tension; plus the busiest conflict market\'s price']
	];
	S.trendWord = function (pct, flat) {
		if (pct == null || !isFinite(pct)) return null; flat = flat || 1.5;
		var big = Math.max(5, flat * 2.5);
		return pct < -big ? 'Falling' : pct < -flat ? 'Slipping' : pct <= flat ? 'Flat' : pct <= big ? 'Rising' : 'Climbing';
	};
	// tone: -2 .. +2 for colour only (red = stressed / falling, green = calm / rising); 0 = neutral
	function trendTone(w) { return { Falling: -2, Slipping: -1, Flat: 0, Rising: 1, Climbing: 2, Surging: 2 }[w] || 0; }
	function fgTone(v) { return v < 25 ? -2 : v < 45 ? -1 : v <= 55 ? 0 : v <= 75 ? 1 : 2; }
	function spanPct(sp) { var a = (sp || []).filter(function (x) { return x && x[1] != null; }); return a.length > 1 ? (a[a.length - 1][1] / a[0][1] - 1) * 100 : null; }
	function vals(sp) { return (sp || []).map(function (x) { return Array.isArray(x) ? x[1] : x; }).filter(function (v) { return v != null && isFinite(v); }); }
	var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	S.humanDate = function (s) { var m = /^(\d{4})-(\d\d)(?:-(\d\d))?/.exec(String(s || '')); return m ? MN[+m[2] - 1] + ' ' + (m[3] ? +m[3] + ', ' : '') + m[1] : String(s || ''); };
	S.dfmt = function (s) { return S.humanDate(s); };
	S.sectorMood = function (d, now) {
		d = d || {}; now = now == null ? Date.now() : now;
		var rows = [], coins = d.coins || [], by = {}, perps = {}, mk = d.markets || {};
		coins.forEach(function (c) { by[c.sym] = c; });
		(d.perps || []).forEach(function (p) { perps[p.sym] = p; });
		function pf(sym) { var p = perps[sym]; return p && p.lean ? S.T('funding {x}', { x: S.T(p.lean) }) : null; }
		if (d.fng) {
			var g = d.global, v = d.fng.now.v, h = d.fng.hist || [], wk = h.length > 7 ? h[h.length - 8][1] : null;
			rows.push({ key: 'crypto', tab: 'crypto', name: 'Crypto market', mood: S.fgLabel(v), tone: fgTone(v), meter: { v: v, min: 0, max: 100, kind: 'fg' },
				facts: [wk != null ? S.T('Fear & Greed {v} ({d} in a week)', { v: v, d: (v - wk >= 0 ? '+' : '−') + Math.abs(v - wk) }) : S.T('Fear & Greed {v}', { v: v })].concat(g ? [S.T('market cap {m} ({p} 24h)', { m: S.money(g.mcap, 'big'), p: S.pct(g.mcapCh24, 1) }), S.T('BTC dominance {p}', { p: S.fmt(g.btcDom, 1) + '%' })] : []),
				spark: vals(h.slice(-30)) });
		}
		[['BTC', 'bitcoin', 'Bitcoin'], ['ETH', 'ethereum', 'Ethereum']].forEach(function (x) {
			var c = by[x[0]]; if (!c) return; var w = S.trendWord(c.ch7);
			rows.push({ key: x[1], tab: 'crypto', name: x[2], mood: w, tone: trendTone(w), meter: { v: c.ch7, min: -15, max: 15, kind: 'pct' },
				facts: [S.T('{p}, {c} in 7 days', { p: S.money(c.price), c: S.pct(c.ch7, 1) }), S.T('{c} from its high', { c: S.pct(c.athPct, 0) })].concat(pf(x[0]) ? [pf(x[0])] : []), spark: vals(c.spark) });
		});
		var alts = ['SOL', 'XRP'].map(function (k) { return by[k]; }).filter(Boolean);
		if (alts.length) {
			var avg = alts.reduce(function (a, c) { return a + c.ch7; }, 0) / alts.length, wa = S.trendWord(avg);
			rows.push({ key: 'alts', tab: 'crypto', name: 'Large altcoins (SOL, XRP)', mood: wa, tone: trendTone(wa), meter: { v: avg, min: -15, max: 15, kind: 'pct' },
				facts: alts.map(function (c) { return S.T('{s} {c} (7d), {a} from high', { s: c.sym, c: S.pct(c.ch7, 1), a: S.pct(c.athPct, 0) }); }).concat(pf('SOL') ? ['SOL ' + pf('SOL')] : []), spark: vals((by.SOL || alts[0]).spark) });
		}
		if (d.stables) rows.push({ key: 'stables', tab: 'crypto', name: 'Stablecoins', mood: 'Info', tone: 0, facts: [S.T('supply {m}', { m: S.money(d.stables.total, 'big') }), d.stables.top.slice(0, 2).map(function (t) { return t[0] + ' ' + S.money(t[1], 'big'); }).join(', ')] });
		if (d.stockfg || mk.spx) {
			var sf = d.stockfg, spx = mk.spx, s3 = spx ? spanPct(spx.spark) : null;
			rows.push({ key: 'stocks', tab: 'mkts', name: 'US stocks', mood: sf ? S.fgLabel(sf.score) : S.trendWord(s3), tone: sf ? fgTone(sf.score) : trendTone(S.trendWord(s3)), meter: sf ? { v: sf.score, min: 0, max: 100, kind: 'fg' } : null,
				facts: (sf ? [S.T('MES Stock F&G {v}', { v: sf.score })] : []).concat(spx ? [S.T('S&P 500 {p} ({d} day, {m} 3 months)', { p: S.fmt(spx.price, 0), d: S.pct(spx.chPct, 1), m: S.pct(s3, 1) })] : []).concat(mk.nasdaq ? [S.T('Nasdaq {m} 3 months', { m: S.pct(spanPct(mk.nasdaq.spark), 1) })] : []),
				spark: spx ? vals(spx.spark) : [] });
		}
		[['gold', 'Gold', 3, ''], ['oil', 'Oil (WTI)', 8, 'surge'], ['dxy', 'US dollar (DXY)', 3, '']].forEach(function (x) {
			var q = mk[x[0]]; if (!q) return; var c3 = spanPct(q.spark), w = S.trendWord(c3, x[2]);
			if (x[3] && c3 > 20) w = 'Surging';
			rows.push({ key: x[0], tab: 'mkts', name: x[1], mood: w, tone: x[0] === 'oil' ? -Math.abs(trendTone(w)) : trendTone(w), meter: { v: c3, min: -30, max: 30, kind: 'pct' },
				facts: [S.T('{p}, {c} in 3 months', { p: x[0] === 'dxy' ? S.fmt(q.price, 2) : S.money(q.price), c: S.pct(c3, 1) }), S.T('{c} last day', { c: S.pct(q.chPct, 1) })], spark: vals(q.spark) });
		});
		if (d.rates && d.rates.target) {
			var t = d.rates.target, lo = d.rates.lower, up = t.prev != null && t.rate > t.prev, dn = t.prev != null && t.rate < t.prev, l = d.rates.latest || {};
			var mf = up ? 'Tightening' : dn ? 'Easing' : 'On hold';
			var dec = (d.poly || []).filter(function (e) { return /^Fed Decision in/i.test(e.title); })[0];
			rows.push({ key: 'fed', tab: 'rates', name: 'Fed and US rates', mood: mf, tone: up ? -1 : dn ? 1 : 0,
				facts: [S.T(up ? 'target {r} (raised {d})' : dn ? 'target {r} (cut {d})' : 'target {r} (set {d})', { r: (lo ? S.fmt(lo[1], 2) + '–' : '') + S.fmt(t.rate, 2) + '%', d: S.dfmt(t.since) })].concat(l.dgs10 ? [d.rates.yearAgo && d.rates.yearAgo.dgs10 ? S.T('10-year {r} ({b} bp in a year)', { r: S.fmt(l.dgs10[1], 2) + '%', b: (l.dgs10[1] >= d.rates.yearAgo.dgs10[1] ? '+' : '−') + Math.round(Math.abs(l.dgs10[1] - d.rates.yearAgo.dgs10[1]) * 100) }) : S.T('10-year {r}', { r: S.fmt(l.dgs10[1], 2) + '%' })] : []).concat(dec && dec.outcomes[0] ? [dec.title.replace(/\?$/, '') + ': ' + dec.outcomes[0].label + ' ' + Math.round(dec.outcomes[0].p) + '% (Polymarket)'] : []) });
			if (l.spread) { var spd = l.spread[1], cw = spd < 0 ? 'Inverted' : spd <= 0.25 ? 'Flat' : 'Normal'; rows.push({ key: 'curve', tab: 'rates', name: 'Yield curve', mood: cw, tone: spd < 0 ? -2 : spd <= 0.25 ? -1 : 0, meter: { v: spd, min: -1.5, max: 1.5, kind: 'pp' }, facts: [S.T('10y − 2y {b} bp', { b: (spd >= 0 ? '+' : '−') + Math.round(Math.abs(spd) * 100) })] }); }
		}
		if (d.cpi && d.cpi.latest) {
			var cv = d.cpi.latest[1], y = d.cpi.yoy || [], six = y.length > 6 ? y[y.length - 7][1] : null, iw = cv > 3 ? 'High' : cv >= 2 ? 'Near target' : 'Low';
			var dir = six == null ? '' : cv > six + 0.2 ? ', rising' : cv < six - 0.2 ? ', falling' : ', steady';
			rows.push({ key: 'cpi', tab: 'rates', name: 'US inflation', mood: iw + dir, tone: cv > 3 ? -1 - (dir === ', rising' ? 1 : 0) : 0, meter: { v: cv, min: 0, max: 8, kind: 'cpi' },
				facts: [S.T('CPI {p} a year ({d})', { p: S.fmt(cv, 1) + '%', d: S.dfmt(d.cpi.latest[0]) })].concat(six != null ? [S.T('6 months earlier {p}', { p: S.fmt(six, 1) + '%' })] : []), spark: vals(y.slice(-24)) });
		}
		var rec = (d.kalshi || []).filter(function (e) { return /recession in \d{4}/i.test(e.title); })[0];
		if (rec && rec.outcomes[0]) { var rp = rec.outcomes[0].p; rows.push({ key: 'rec', tab: 'pred', name: 'US recession odds', mood: rp < 15 ? 'Low' : rp <= 35 ? 'Elevated' : 'High', tone: rp < 15 ? 0 : rp <= 35 ? -1 : -2, meter: { v: rp, min: 0, max: 100, kind: 'odds' }, facts: [rec.title.replace(/\?$/, '') + ': ' + Math.round(rp) + '% (Kalshi)'] }); }
		if (S.DOOMSDAY_LATEST) {
			var cs = S.DOOMSDAY_LATEST.seconds, top = S.conflictOdds(S.geoMarkets([d.geo, d.geok]), 1)[0];
			rows.push({ key: 'geo', tab: 'geo', name: 'Geopolitics', mood: cs < 100 ? 'Very high tension' : cs < 180 ? 'High tension' : 'Tense', tone: cs < 100 ? -2 : -1,
				facts: [S.T('Doomsday Clock {t} to midnight', { t: S.clockText(cs) })].concat(top ? [top.title.replace(/\?$/, '').slice(0, 70) + ': ' + S.T('Yes') + ' ' + Math.round(top.yes) + '%'] : []).concat(mk.oil ? [S.T('oil {p}', { p: S.money(mk.oil.price) })] : []) });
		}
		return rows;
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

	// ---------- Bitcoin ETF flows (BGeometrics bitcoin-data.com, keyless, 15 requests a day per address: the API caches it in Upstash) ----------
	// daily closes from a Yahoo v8 chart -> [[ymd, close]]
	S.yahooCloses = function (j) {
		var r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r) throw new Error('no chart');
		var ts = r.timestamp || [], cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [], out = [], i;
		for (i = 0; i < ts.length; i++) if (cl[i] != null) out.push([S.ymd(ts[i] * 1000), round(cl[i], 2)]);
		return out;
	};
	// rows [{d, etfFlow (BTC)}] + optional BTC closes -> {days: [[ymd, btc, usd|null]], held (BTC, running total), last, sum7, sum30, ...}
	// US dollars = each day's BTC flow x that day's Bitcoin close (an estimate: issuers report at their own net asset value)
	S.parseEtfFlows = function (rows, closes) {
		if (!Array.isArray(rows) || !rows.length) throw new Error('no ETF flow data');
		var px = {}, pd = [], days = [], held = 0;
		(closes || []).forEach(function (p) { px[p[0]] = p[1]; pd.push(p[0]); });
		pd.sort();
		var priceOn = function (d) { if (px[d] != null) return px[d]; var lo = 0, hi = pd.length - 1, best = null; while (lo <= hi) { var m = (lo + hi) >> 1; if (pd[m] <= d) { best = pd[m]; lo = m + 1; } else hi = m - 1; } return best && S.addDays(best, 5) >= d ? px[best] : null; };
		rows.map(function (r) { return [String(r.d || '').slice(0, 10), num(r.etfFlow)]; }).filter(function (r) { return /^\d{4}-\d\d-\d\d$/.test(r[0]) && r[1] !== null; })
			.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; })
			.forEach(function (r) { var p = priceOn(r[0]); held += r[1]; days.push([r[0], round(r[1], 2), p ? Math.round(r[1] * p) : null]); });
		if (!days.length) throw new Error('no ETF flow rows');
		var sum = function (n, k) { var a = days.slice(-n), t = 0, ok = 0; a.forEach(function (d) { if (d[k] !== null) { t += d[k]; ok++; } }); return ok ? round(t, k === 1 ? 1 : 0) : null; };
		var streak = 0, sign = Math.sign(days[days.length - 1][1]), i;
		for (i = days.length - 1; i >= 0 && Math.sign(days[i][1]) === sign && sign !== 0; i--) streak++;
		var lp = closes && closes.length ? closes[closes.length - 1][1] : null;
		return { days: days, held: Math.round(held), heldUsd: lp ? Math.round(held * lp) : null, last: days[days.length - 1], streak: streak * (sign || 0),
			sum7: { btc: sum(7, 1), usd: sum(7, 2) }, sum30: { btc: sum(30, 1), usd: sum(30, 2) }, first: days[0][0], usd: !!lp };
	};

	// ---------- MES Smart Money / Dumb Money (CFTC Commitments of Traders, our own composite) ----------
	S.COT_MARKETS = { '13874A': 'E-mini S&P 500', '209742': 'E-mini Nasdaq-100', '124603': 'E-mini Dow ($5)', '239742': 'E-mini Russell 2000' };
	S.SMART_DUMB_METHOD = 'Made from the CFTC’s weekly Commitments of Traders report (legacy, futures only) for four US stock-index futures: E-mini S&P 500, Nasdaq-100, Dow and Russell 2000. ' +
		'Smart money = commercial traders (banks, dealers and big institutions that use futures to hedge). Dumb money = non-reportable positions (traders too small to have to report, mostly individuals). ' +
		'For each market we take each group’s net position (long minus short) as a share of open interest and rank it against the last 156 weeks (3 years): 0 = the most bearish that group has been in 3 years, 100 = the most bullish. ' +
		'The four markets are averaged. Positions are as of Tuesday and published the following Friday, so it is always a few days old. Our own composite, not SentimenTrader’s (theirs is proprietary and uses other inputs).';
	// running total of the daily flows = bitcoin held by the funds -> [[ymd, BTC]]
	S.etfHeld = function (days) { var h = 0; return (days || []).map(function (d) { h += d[1]; return [d[0], Math.round(h)]; }); };
	S.sdLabel = function (v) { return v < 20 ? 'Very bearish' : v < 40 ? 'Bearish' : v <= 60 ? 'Neutral' : v <= 80 ? 'Bullish' : 'Very bullish'; };
	// Socrata rows -> {date, smart, dumb, label, parts, hist: [[ymd, smart, dumb]]}
	S.smartDumb = function (rows, win, keep) {
		win = win || 156;
		var by = {};
		(rows || []).forEach(function (r) {
			var c = String(r.cftc_contract_market_code || '').trim(), d = String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10), oi = num(r.open_interest_all);
			if (!S.COT_MARKETS[c] || !/^\d{4}-\d\d-\d\d$/.test(d) || !oi) return;
			var cn = num(r.comm_positions_long_all) - num(r.comm_positions_short_all), nn = num(r.nonrept_positions_long_all) - num(r.nonrept_positions_short_all);
			if (!isFinite(cn) || !isFinite(nn)) return;
			(by[c] = by[c] || {})[d] = [cn / oi * 100, nn / oi * 100];
		});
		var codes = Object.keys(by); if (!codes.length) throw new Error('no COT rows');
		var scored = {}, dates = {};
		codes.forEach(function (c) {
			var ds = Object.keys(by[c]).sort(), sm = ds.map(function (d) { return by[c][d][0]; }), dm = ds.map(function (d) { return by[c][d][1]; });
			scored[c] = {};
			for (var i = 51; i < ds.length; i++) {
				var lo = Math.max(0, i - win + 1);
				scored[c][ds[i]] = [S.pctRank(sm.slice(lo, i + 1), sm[i]), S.pctRank(dm.slice(lo, i + 1), dm[i]), sm[i], dm[i]];
				dates[ds[i]] = 1;
			}
		});
		var hist = [];
		Object.keys(dates).sort().forEach(function (d) {
			var a = codes.map(function (c) { return scored[c][d]; }).filter(Boolean);
			if (a.length < Math.min(3, codes.length)) return;
			var s = 0, m = 0; a.forEach(function (x) { s += x[0]; m += x[1]; });
			hist.push([d, Math.round(s / a.length), Math.round(m / a.length)]);
		});
		if (!hist.length) throw new Error('not enough COT history');
		var lastD = hist[hist.length - 1][0];
		var parts = codes.filter(function (c) { return scored[c][lastD]; }).map(function (c) { var x = scored[c][lastD]; return { code: c, name: S.COT_MARKETS[c], smart: Math.round(x[0]), dumb: Math.round(x[1]), smartNet: round(x[2], 1), dumbNet: round(x[3], 1) }; });
		var n = hist[hist.length - 1], gap = n[1] - n[2];
		return { date: n[0], smart: n[1], dumb: n[2], gap: gap, smartLabel: S.sdLabel(n[1]), dumbLabel: S.sdLabel(n[2]), parts: parts, hist: keep ? hist.slice(-keep) : hist,
			reading: gap >= 40 ? 'Smart money much more bullish than the crowd' : gap >= 15 ? 'Smart money more bullish than the crowd' : gap <= -40 ? 'The crowd much more bullish than smart money' : gap <= -15 ? 'The crowd more bullish than smart money' : 'Both groups about as bullish' };
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
		if (ms <= 0) return S.T('now');
		var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
		return d > 0 ? S.T('{d}d {h}h', { d: d, h: h }) : h > 0 ? S.T('{h}h {m}m', { h: h, m: m }) : S.T('{m}m', { m: m });
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
	S.clockText = function (sec) { return sec >= 120 ? S.T('{n} minutes', { n: sec % 60 ? (sec / 60).toFixed(1) : String(sec / 60) }) : S.T('{n} seconds', { n: sec }); };
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
		if (opt === 'big' || a >= 1e9) { var u = a >= 1e12 ? ['T', 1e12] : a >= 1e9 ? ['B', 1e9] : a >= 1e6 ? ['M', 1e6] : a >= 1e3 ? ['K', 1e3] : ['', 1]; return '$' + (v / u[1]).toFixed(a / u[1] >= 100 ? 0 : a / u[1] >= 10 ? 1 : 2) + u[0]; }
		var d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
		return '$' + v.toLocaleString('en-US', { minimumFractionDigits: a >= 1000 ? 0 : d, maximumFractionDigits: d });
	};
	S.fmt = function (v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; return v.toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
	S.pct = function (v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 2 : d) + '%'; };
	S.bp = function (pts) { return Math.round(pts * 100) + ' bp'; };
	S.ago = function (ms) { var m = Math.round(ms / 60e3); if (m < 60) return S.T('{n} min', { n: m }); var h = Math.round(m / 60); if (h < 48) return S.T('{n} h', { n: h }); return S.T('{n} days', { n: Math.round(h / 24) }); };

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
			var txt = s[1] === 'pct' ? S.pct(d, 1) : s[1] === 'rate' ? (d >= 0 ? '+' : '−') + Math.round(Math.abs(d) * 100) + ' bp' : S.T('{n} pts', { n: (d >= 0 ? '+' : '−') + Math.abs(Math.round(d)) });
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
		mood: ['Market mood by sector', 'One line per area of the markets, worked out from this page\u2019s own numbers with fixed rules (listed under the table): fear and greed readings for crypto and stocks, the recent price trend for coins, gold, oil and the dollar, the direction of the Fed, the shape of the yield curve, inflation, the recession odds markets give, and how tense the world is. Red = stressed or falling, green = calm or rising, grey = neutral. It describes now; it is not a forecast. Click a row to see the details on its tab.'],
		funding: ['Funding rate', 'On perpetual futures (perps) the two sides pay each other every hour so the perp price stays near the real price. Positive funding = traders betting on a rise (longs) pay those betting on a fall (shorts). On Hyperliquid the normal level is 0.00125% an hour (about 11% a year, paid by longs); well above that means many people are leaning the same way with borrowed money, negative means shorts are the crowded side. Crowded positioning can unwind sharply in either direction; it is not a price forecast.'],
		oi: ['Open interest', 'The total value of perp positions still open (counted once, not long plus short). Rising open interest with rising prices means new leveraged money is coming in; a sudden drop means positions were closed or liquidated.'],
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
		etf: ['Spot Bitcoin ETF flows', 'US exchange-traded funds that hold real bitcoin (BlackRock IBIT, Fidelity FBTC, Grayscale GBTC and others, trading since January 11, 2024). An inflow means investors bought new fund shares, so the funds bought bitcoin; an outflow means shares were cashed in and bitcoin was sold. Totals for all US spot funds, counted in bitcoin by BGeometrics; the dollar figure is that day\u2019s bitcoin amount times the Bitcoin closing price, so it can differ a little from the funds\u2019 own reports. Big flows show what large investors are doing; they follow the price as often as they lead it.'],
		etfheld: ['Bitcoin held by US spot ETFs', 'The running total of every day\u2019s net flow since the funds opened: about how many bitcoins all US spot ETFs hold together. It starts at zero on January 11, 2024, so the bitcoin Grayscale already held in its trust before it became an ETF is not counted.'],
		smartdumb: ['MES Smart Money / Dumb Money', 'Two 0 to 100 scores for how bullish two groups of stock-futures traders are compared with the last three years. The idea, made popular by SentimenTrader, is that hedgers (\u201csmart money\u201d) tend to buy when prices have fallen and sell into rallies, while small traders (\u201cdumb money\u201d) tend to chase the trend, so the two often point opposite ways at turning points. It describes positioning, not what happens next; there are long stretches where it says little. How it is worked out: '],
		cot: ['Commitments of Traders (COT)', 'A weekly report by the US Commodity Futures Trading Commission listing how many futures contracts each type of trader holds long and short, as of Tuesday, published Friday afternoon. \u201cCommercials\u201d use futures to hedge their business; \u201cnon-reportable\u201d positions belong to traders below the reporting size, mostly individuals.'],
		feargauges: ['Markets’ fear gauges', 'Prices that often jump when people get scared: oil (supply worries, especially around the Strait of Hormuz, where about a fifth of the world’s oil passes), gold (a traditional safe haven), the VIX (expected stock-market swings) and the US dollar. They react to many things besides conflict, so a move is a hint, not proof.']
	};
	S.GLOSSARY.sfg[1] += S.STOCK_FG_METHOD;
	S.GLOSSARY.smartdumb[1] += S.SMART_DUMB_METHOD;

	if (typeof module !== 'undefined' && module.exports) module.exports = S;
	else root.MESSig = S;
})(typeof window !== 'undefined' ? window : this);

/* MES Market Signals UI. Data = /api/signals (one aggregator, edge-cached 5 min); maths and parsing = MESSig (lib.js). ?mock=1 (and local
   previews) read the committed sample mes.fm/signals/data/sample.json instead. Informational only: no recommendations anywhere. */
(function () {
	'use strict';
	var S = window.MESSig, $ = function (id) { return document.getElementById(id); }, root = $('sg');
	if (!S || !root) return;
	// translated pages (/signals-fa, /signals-es ...) load signals/js/i18n-<code>.js first: window.SG_I18N = {code, locale, dir, s: {English: translation}, g: glossary}
	var I18 = window.SG_I18N || null, T = S.T, N = function (x) { return x; }, LOC = I18 && I18.locale || undefined;
	if (I18) { S.L = I18; if (I18.g) Object.keys(I18.g).forEach(function (k) { if (S.GLOSSARY[k]) S.GLOSSARY[k] = I18.g[k]; }); }
	S.dfmt = function (s) { return dshort(s); };
	var KEY = 'mes-signals:v1', st = { tab: 'over', cxd: 30, fg: 90, rates: 1100, curve: 9999, qk: 'spx', pcat: N('All'), nview: 'cards', ncols: 'auto', nshow: 10, nclosed: {}, nsrc: {}, gconf: 1, etf: 90, sd: 156 }, data = null, snaps = null, loading = false;
	var SKEYS = ['tab', 'cxd', 'fg', 'rates', 'curve', 'qk', 'pcat', 'nview', 'ncols', 'nshow', 'nclosed', 'nsrc', 'gconf', 'etf', 'sd'];
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); SKEYS.forEach(function (k) { if (sv[k] != null) st[k] = sv[k]; }); } catch (e) {}
	var qs = new URLSearchParams(location.search), MOCK = qs.get('mock') === '1' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	if (qs.get('tab')) st.tab = qs.get('tab');
	function save() { try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); SKEYS.forEach(function (k) { o[k] = st[k]; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function q(k) { var g = S.GLOSSARY[k]; return g ? '<button type="button" class="sg-q" data-g="' + k + '" aria-label="' + esc(T('What is {x}?', { x: g[0] })) + '">?</button>' : ''; }
	function src(n) { return data && data.sources[n] && data.sources[n].ok ? data.sources[n].data : null; }
	function err(n) { var s = data && data.sources[n]; return '<p class="tu-note sg-err">' + T('Could not load this right now{e}. It will try again on the next refresh.', { e: s && s.error ? ' (' + esc(s.error) + ')' : '' }) + '</p>'; }
	function cls(v) { return v > 0 ? 'up' : v < 0 ? 'dn' : ''; }
	function chg(v, d) { return '<span class="sg-ch ' + cls(v) + '">' + (v > 0 ? '&#9650; ' : v < 0 ? '&#9660; ' : '') + esc(S.pct(v, d)) + '</span>'; }
	function dshort(s) { if (!s) return ''; var d = new Date(s.length === 7 ? s + '-01T00:00:00Z' : s.length === 10 ? s + 'T00:00:00Z' : s); return isNaN(d) ? s : d.toLocaleDateString(LOC, s.length === 7 ? { year: 'numeric', month: 'short', timeZone: 'UTC' } : { year: 'numeric', month: 'short', day: 'numeric', timeZone: s.length === 10 ? 'UTC' : undefined }); }
	function ago(iso) { var ms = Date.now() - Date.parse(iso); return isFinite(ms) ? T('{t} ago', { t: S.ago(Math.max(0, ms)) }) : ''; }

	// ---------- tabs ----------
	var TABS = ['over', 'sent', 'crypto', 'mkts', 'rates', 'pred', 'geo', 'news'];
	if (TABS.indexOf(st.tab) < 0) st.tab = 'over';
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
		if (!all.length) { box.innerHTML = '<p class="tu-note">' + T('No data.') + '</p>'; return; }
		var x0 = Math.min.apply(null, all.map(function (p) { return p[0]; })), x1 = Math.max.apply(null, all.map(function (p) { return p[0]; })), y0 = o.yMin != null ? o.yMin : Math.min.apply(null, all.map(function (p) { return p[1]; })), y1 = o.yMax != null ? o.yMax : Math.max.apply(null, all.map(function (p) { return p[1]; }));
		if (o.yMin == null || o.yMax == null) { var pad = (y1 - y0) * 0.08 || 1; if (o.yMin == null) y0 -= pad; if (o.yMax == null) y1 += pad; }
		if (o.zero && y0 > 0) y0 = Math.min(y0, 0);
		var X = function (t) { return pl + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - pl - pr); }, Y = function (v) { return pt + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pt - pb); }, out = [];
		(o.xBands || []).forEach(function (b) { var a = Math.max(x0, tms(b[0]) - 15 * 864e5), z = Math.min(x1, tms(b[1]) + 15 * 864e5); if (z > a) out.push('<rect class="sg-xband" x="' + X(a).toFixed(1) + '" y="' + pt + '" width="' + Math.max(1, X(z) - X(a)).toFixed(1) + '" height="' + (H - pt - pb) + '"></rect>'); });
		(o.bands || []).forEach(function (b) { var a = Math.max(y0, b[0]), z = Math.min(y1, b[1]); if (z > a) out.push('<rect class="' + b[2] + '" x="' + pl + '" y="' + Y(z).toFixed(1) + '" width="' + (W - pl - pr) + '" height="' + (Y(a) - Y(z)).toFixed(1) + '"></rect>'); });
		var ticks = o.yTicks || (function () { var n = 4, st2 = (y1 - y0) / n, m = Math.pow(10, Math.floor(Math.log10(st2 || 1))), s2 = [1, 2, 2.5, 5, 10].map(function (k) { return k * m; }).find(function (k) { return k >= st2; }) || st2, r = [], v; for (v = Math.ceil(y0 / s2) * s2; v <= y1 + 1e-9; v += s2) r.push(+v.toFixed(6)); return r; })();
		ticks.forEach(function (v) { if (v < y0 || v > y1) return; out.push('<line class="sg-grid' + (v === 0 ? ' sg-zero' : '') + '" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"></line><text class="sg-ax" x="' + (pl - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc((o.fy || String)(v)) + '</text>'); });
		var span = x1 - x0, nx = W < 500 ? 3 : 5;
		for (var i = 0; i <= nx; i++) { var t = x0 + span * i / nx, d = new Date(t); out.push('<text class="sg-ax" x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === nx ? 'end' : 'middle') + '">' + esc(span > 5 * 365 * 864e5 ? d.getUTCFullYear() : d.toLocaleDateString(LOC, span > 200 * 864e5 ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' })) + '</text>'); }
		o.series.forEach(function (s) {
			if (!s.p.length) return;
			var d = s.p.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('');
			if (s.negFill) { var zy = Y(Math.max(y0, Math.min(y1, 0))).toFixed(1); out.push('<clipPath id="' + box.id + '-neg"><rect x="0" y="' + zy + '" width="' + W + '" height="' + H + '"></rect></clipPath><path class="sg-negfill" clip-path="url(#' + box.id + '-neg)" d="' + d + 'L' + X(s.p[s.p.length - 1][0]).toFixed(1) + ' ' + zy + 'L' + X(s.p[0][0]).toFixed(1) + ' ' + zy + 'Z"></path>'); }
			if (s.bars) { var bw = Math.max(1, Math.min(14, (W - pl - pr) / Math.max(1, s.p.length) * 0.78)), zy0 = Y(Math.max(y0, Math.min(y1, 0))); s.p.forEach(function (p) { var yy = Y(p[1]); out.push('<rect class="sg-vbar ' + (p[1] < 0 ? 'n' : 'p') + '" x="' + (X(p[0]) - bw / 2).toFixed(1) + '" y="' + Math.min(yy, zy0).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.6, Math.abs(zy0 - yy)).toFixed(1) + '"></rect>'); }); return; }
			if (s.fill) out.push('<path class="sg-fill ' + s.cls + '" d="' + d + 'L' + X(s.p[s.p.length - 1][0]).toFixed(1) + ' ' + (H - pb) + 'L' + X(s.p[0][0]).toFixed(1) + ' ' + (H - pb) + 'Z"></path>');
			out.push('<path class="sg-line ' + s.cls + '"' + (s.step ? ' stroke-linejoin="miter"' : '') + ' d="' + d + '"></path>');
		});
		out.push('<line class="sg-cross" id="' + box.id + '-x" x1="-9" x2="-9" y1="' + pt + '" y2="' + (H - pb) + '"></line>');
		o.series.forEach(function (s, k) { out.push('<circle class="sg-dot ' + s.cls + '" id="' + box.id + '-d' + k + '" r="4" cx="-9" cy="-9"></circle>'); });
		box.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(T(o.label || 'Chart')) + '">' + out.join('') + '</svg>';
		var svg = box.firstChild, cross = $(box.id + '-x');
		function at(ev) {
			var r = svg.getBoundingClientRect(), mx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, tt = x0 + (mx - pl) / (W - pl - pr) * span, lines = [], best = null;
			o.series.forEach(function (s, k) {
				var dot = $(box.id + '-d' + k), p = null, bd = Infinity;
				s.p.forEach(function (q2) { var dd = Math.abs(q2[0] - tt); if (dd < bd) { bd = dd; p = q2; } });
				if (!p || bd > span / 20 + 40 * 864e5) { dot.setAttribute('cx', -9); return; }
				dot.setAttribute('cx', X(p[0])); dot.setAttribute('cy', Y(p[1])); if (!best) best = p;
				lines.push((o.series.length > 1 ? T(s.name) + ': ' : '') + (o.fv || o.fy || String)(p[1], p[2]));
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
		return '<svg class="sg-gauge" viewBox="0 0 200 112" role="img" aria-label="' + esc(T('Gauge at {v} of 100', { v: v })) + '">' + out + '<line class="sg-needle" x1="' + cx + '" y1="' + cy + '" x2="' + n[0].toFixed(1) + '" y2="' + n[1].toFixed(1) + '"></line><circle class="sg-hub" cx="' + cx + '" cy="' + cy + '" r="6"></circle><text class="sg-gtx" x="14" y="110">0</text><text class="sg-gtx" x="186" y="110" text-anchor="end">100</text></svg>';
	}
	function rangeBtns() {
		[].forEach.call(root.querySelectorAll('.sg-range'), function (g) { var k = g.getAttribute('data-chart'); [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-r') === +st[k])); }); });
	}
	root.addEventListener('click', function (e) { var b = e.target.closest('.sg-range button'); if (!b) return; st[b.parentNode.getAttribute('data-chart')] = +b.getAttribute('data-r'); save(); rangeBtns(); drawTab(st.tab); });

	// ---------- summary strip ----------
	function stripItem(tab, label, val, sub, k, extra) { return '<button type="button" class="sg-si' + (extra || '') + '" data-tab="' + tab + '"' + (k ? ' data-k="' + k + '"' : '') + '><span class="sg-si__l">' + label + '</span><span class="sg-si__v">' + val + '</span>' + (sub ? '<span class="sg-si__s">' + sub + '</span>' : '') + '</button>'; }
	function strip() {
		var o = [], f = src('fng'), sf = src('stockfg'), c = src('coins'), m = src('markets'), r = src('rates'), fo = S.nextFomc(Date.now());
		if (f) o.push(stripItem('sent', T('Crypto F&amp;G'), f.now.v, '<i class="sg-dotc sg-' + S.fgClass(f.now.v) + '"></i>' + esc(T(S.fgLabel(f.now.v))), 'cfg'));
		if (sf) o.push(stripItem('sent', T('Stock F&amp;G'), sf.score, '<i class="sg-dotc sg-' + S.fgClass(sf.score) + '"></i>' + esc(T(sf.label)), 'sfg'));
		(c || []).forEach(function (x) { if (x.id === 'bitcoin') o.push(stripItem('crypto', T('Bitcoin'), esc(S.money(x.price)), chg(x.ch24, 1), 'btc')); });
		if (m && m.spx) o.push(stripItem('mkts', 'S&amp;P 500', esc(S.fmt(m.spx.price, 0)), chg(m.spx.chPct, 1), 'spx'));
		if (m && m.gold) o.push(stripItem('mkts', T('Gold'), esc(S.money(m.gold.price)), chg(m.gold.chPct, 1), 'gold'));
		if (r) {
			o.push(stripItem('rates', T('Fed funds'), esc(S.fmt(r.lower[1], 2) + '–' + S.fmt(r.target.rate, 2) + '%'), T('target range'), 'dff'));
			o.push(stripItem('rates', T('10-yr yield'), esc(S.fmt(r.latest.dgs10[1], 2) + '%'), '', 't10'));
			var sp = r.latest.spread[1]; o.push(stripItem('rates', N('10y − 2y'), (sp < 0 ? '<span class="sg-neg">' : '<span>') + esc((sp > 0 ? '+' : '') + Math.round(sp * 100) + ' bp') + '</span>', sp < 0 ? T('inverted') : T('normal'), 'spread'));
		}
		var odds = S.conflictOdds(S.geoMarkets([(src('geo') || []).concat(src('geok') || [])]), 1)[0];
		o.push(stripItem('geo', T('Doomsday Clock'), esc(T('{n} s', { n: S.DOOMSDAY_LATEST.seconds })), T('to midnight')));
		if (odds) o.push(stripItem('geo', T('Top conflict market'), esc((odds.yes < 1 ? '<1' : S.fmt(odds.yes, 0)) + '%'), '<span class="sg-si__q" title="' + esc(odds.title) + '">' + esc(odds.title.replace(/\?$/, '').slice(0, 28)) + (odds.title.length > 29 ? '…' : '') + '</span>'));
		if (fo) o.push(stripItem('rates', T('Next FOMC'), '<span id="sg-fomc-cd">' + esc(fo.live ? T('this week') : S.countdown(fo.at - Date.now())) + '</span>', esc(dshort(fo.end)) + (fo.sep ? ' · ' + T('dot plot') : '')));
		$('sg-strip').innerHTML = o.join('') || '<span class="sg-loading">' + T('No data right now.') + '</span>';
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
		box.innerHTML = '<b>' + esc(T('Since your last visit ({t} ago):', { t: S.ago(Date.now() - snaps.t) })) + '</b> ' + (big.length ? big.map(function (c) { return '<span class="sg-cc ' + (c.up ? 'up' : 'dn') + '">' + esc(T(c.name)) + ' ' + esc(c.text) + '</span>'; }).join('') : '<span class="tu-note">' + T('no big moves') + '</span>') +
			'<details class="sg-cmore"><summary>' + T('All changes') + '</summary>' + snaps.list.map(function (c) { return '<span class="sg-cc' + (c.big ? ' ' + (c.up ? 'up' : 'dn') : '') + '">' + esc(T(c.name)) + ' ' + esc(c.text) + '</span>'; }).join('') + '</details><button type="button" class="sg-chx" aria-label="' + esc(T('Hide')) + '">&times;</button>';
		box.querySelector('.sg-chx').onclick = function () { box.hidden = true; };
	}
	function markChanged() {
		if (!snaps) return;
		snaps.list.forEach(function (c) { if (!c.big) return; var el = $('sg-strip').querySelector('[data-k="' + c.key + '"]'); if (el) { el.classList.add('sg-moved'); el.title = T('Changed {x} since your last visit', { x: c.text }); } });
	}

	// ---------- panels ----------
	function drawSent() {
		var f = src('fng'), s = src('stockfg'), h;
		if (f) {
			var back = function (n) { var p = f.hist[f.hist.length - 1 - n]; return p ? p[1] : null; };
			h = '<div class="sg-gh"><b>' + T('Crypto Fear &amp; Greed') + '</b> ' + q('cfg') + '</div>' + gauge(f.now.v) + '<div class="sg-gv sg-' + S.fgClass(f.now.v) + 't">' + f.now.v + '<small>' + esc(T(S.fgLabel(f.now.v))) + '</small></div>' +
				'<div class="sg-ago">' + [[N('Yesterday'), 1], [N('Last week'), 7], [N('Last month'), 30]].map(function (x) { var v = back(x[1]); return v == null ? '' : '<span>' + T(x[0]) + '<b class="sg-' + S.fgClass(v) + 't">' + v + '</b></span>'; }).join('') + '</div><p class="tu-note">' + T('Daily, by {a}, {d}.', { a: '<a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener">alternative.me</a>', d: esc(dshort(f.now.date)) }) + '</p>';
			$('sg-cfg').innerHTML = h;
		} else $('sg-cfg').innerHTML = '<div class="sg-gh"><b>' + T('Crypto Fear &amp; Greed') + '</b></div>' + err('fng');
		if (s) {
			h = '<div class="sg-gh"><b>' + T('MES Stock Fear &amp; Greed') + '</b> ' + q('sfg') + '</div>' + gauge(s.score) + '<div class="sg-gv sg-' + S.fgClass(s.score) + 't">' + s.score + '<small>' + esc(T(s.label)) + '</small></div>' +
				'<ul class="sg-parts">' + s.parts.map(function (p) { return '<li><span>' + esc(T(p.name)) + ' ' + q(p.key) + '<small>' + esc(S.fmt(p.value, 2) + p.unit) + '</small></span><span class="sg-bar"><i class="sg-' + S.fgClass(p.score) + '" style="width:' + Math.max(2, p.score) + '%"></i></span><b>' + p.score + '</b></li>'; }).join('') + '</ul>' +
				'<details class="sg-method"><summary>' + T('How this is worked out') + '</summary><p>' + esc(T(S.STOCK_FG_METHOD)) + '</p><p>' + T('Our own composite, not CNN&rsquo;s Fear &amp; Greed Index. Trading day {d}.', { d: esc(dshort(s.date)) }) + '</p></details>';
			$('sg-sfg').innerHTML = h;
		} else $('sg-sfg').innerHTML = '<div class="sg-gh"><b>' + T('MES Stock Fear &amp; Greed') + '</b></div>' + err('stockfg');
		var since = S.ymd(Date.now() - st.fg * 864e5), ser = [];
		if (f) ser.push({ name: N('Crypto'), cls: 's1', pts: S.sinceDate(f.hist, since) });
		if (s) ser.push({ name: N('Stocks (MES)'), cls: 's2', pts: S.sinceDate(s.hist, since) });
		$('sg-fg-legend').innerHTML = ser.map(function (x) { return '<span><i class="sg-sw ' + x.cls + '"></i>' + T(x.name) + '</span>'; }).join('') + '<span><i class="sg-sw sg-sw--xf"></i>' + T('Extreme fear') + '</span><span><i class="sg-sw sg-sw--xg"></i>' + T('Extreme greed') + '</span>';
		if (ser.length) chart($('sg-fg-chart'), { series: ser, yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100], bands: [[0, 25, 'sg-band-xf'], [75, 100, 'sg-band-xg']], label: N('Fear and Greed history'), fv: function (v) { return v + ' (' + T(S.fgLabel(v)) + ')'; } });
		else $('sg-fg-chart').innerHTML = '';
		drawSmartDumb();
	}
	// signed amounts for flows: +$655M / −$467M, +1,234 BTC
	function sMoney(v) { return v == null ? '—' : !v ? '$0' : (v > 0 ? '+' : v < 0 ? '−' : '') + S.money(Math.abs(v), 'big'); }
	function sBtc(v) { return v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + S.fmt(Math.abs(v), 0) + ' BTC'; }
	function drawEtf() {
		var e = src('etf'), box = $('sg-etf');
		if (!e) { box.innerHTML = '<b>' + T('Bitcoin ETF flows') + '</b>' + err('etf'); return; }
		var u = e.usd, L = e.last, flow = function (b, d) { return u && d != null ? sMoney(d) : sBtc(b); }, sub = function (b, d) { return u && d != null ? esc(sBtc(b)) : ''; }, cl = function (v) { return v > 0 ? 'up' : v < 0 ? 'dn' : ''; };
		var st2 = e.streak ? T(Math.abs(e.streak) === 1 ? (e.streak > 0 ? '1 trading day of inflows' : '1 trading day of outflows') : (e.streak > 0 ? '{n} trading days of inflows in a row' : '{n} trading days of outflows in a row'), { n: Math.abs(e.streak) }) : '';
		box.innerHTML = '<div class="sg-chead"><b>' + T('US spot Bitcoin ETF flows') + ' ' + q('etf') + '</b><div class="tu-seg sg-range" data-chart="etf"><button type="button" data-r="30">' + T('30 days') + '</button><button type="button" data-r="90">' + T('90 days') + '</button><button type="button" data-r="365">' + T('1 year') + '</button><button type="button" data-r="9999">' + T('All') + '</button></div></div>' +
			'<div class="tu-stats sg-etfstats">' +
			'<div class="tu-stat"><div class="tu-stat__label">' + esc(T('Last day ({d})', { d: dshort(L[0]) })) + '</div><div class="tu-stat__value sg-ch ' + cl(L[1]) + '">' + esc(flow(L[1], L[2])) + '</div><div class="tu-stat__sub">' + sub(L[1], L[2]) + '</div></div>' +
			'<div class="tu-stat"><div class="tu-stat__label">' + T('Last 7 trading days') + '</div><div class="tu-stat__value sg-ch ' + cl(e.sum7.btc) + '">' + esc(flow(e.sum7.btc, e.sum7.usd)) + '</div><div class="tu-stat__sub">' + sub(e.sum7.btc, e.sum7.usd) + '</div></div>' +
			'<div class="tu-stat"><div class="tu-stat__label">' + T('Last 30 trading days') + '</div><div class="tu-stat__value sg-ch ' + cl(e.sum30.btc) + '">' + esc(flow(e.sum30.btc, e.sum30.usd)) + '</div><div class="tu-stat__sub">' + sub(e.sum30.btc, e.sum30.usd) + '</div></div>' +
			'<div class="tu-stat"><div class="tu-stat__label">' + T('Held by the funds') + ' ' + q('etfheld') + '</div><div class="tu-stat__value">' + esc(S.fmt(e.held, 0)) + ' BTC</div><div class="tu-stat__sub">' + (e.heldUsd ? T('about {m} at today&rsquo;s price', { m: esc(S.money(e.heldUsd, 'big')) }) : '') + '</div></div></div>' +
			(st2 ? '<p class="sg-etfrun ' + cl(e.streak) + '">' + esc(st2) + '</p>' : '') +
			'<div class="sg-legend"><span><i class="sg-sw sg-sw--in"></i>' + T('Inflow (funds bought)') + '</span><span><i class="sg-sw sg-sw--out"></i>' + T('Outflow (funds sold)') + '</span></div>' +
			'<div class="sg-chart" id="sg-etf-chart"></div><div class="sg-chead sg-chead--sub"><b>' + T('Bitcoin held by US spot ETFs') + '</b></div><div class="sg-chart" id="sg-etf-held"></div>' +
			'<p class="tu-note">' + T('Net flow of all US spot Bitcoin funds together, per trading day, in bitcoin by {a}', { a: '<a href="https://charts.bgeometrics.com/etf_dark.html" target="_blank" rel="noopener">BGeometrics</a>' }) + (u ? T('; dollars = bitcoin &times; that day&rsquo;s closing price (Yahoo Finance), an estimate') : '') + '. ' + T('Updated once a day after the US close.') + ' ' +
			(e.note ? esc(e.note) + '. ' : '') + (e.stale ? T('Showing the copy from {t} (the source did not answer).', { t: esc(ago(e.stale)) }) + ' ' : '') + T('Per-fund numbers: {a}.', { a: '<a href="https://farside.co.uk/btc/" target="_blank" rel="noopener nofollow">Farside Investors</a>' }) + ' ' + T('Ether ETF flows have no free data feed we can use yet.') + '</p>';
		var since = st.etf > 5000 ? '0000' : S.ymd(Date.now() - st.etf * 864e5), btcBy = {};
		e.days.forEach(function (d) { btcBy[d[0]] = d[1]; });
		var pts = e.days.filter(function (d) { return d[0] >= since; }).map(function (d) { return [d[0], u && d[2] != null ? d[2] : d[1]]; });
		chart($('sg-etf-chart'), { series: [{ name: N('Net flow'), cls: 's1', pts: pts, bars: true }], zero: true, label: N('Daily net flow of US spot Bitcoin ETFs'),
			fy: function (v) { return u ? sMoney(v).replace('+', '') : (v / 1000).toFixed(0) + 'k'; }, fv: function (v, d) { return (u ? sMoney(v) + ' (' + sBtc(btcBy[d]) + ')' : sBtc(v)) + ' ' + (v >= 0 ? T('in') : T('out')); } });
		chart($('sg-etf-held'), { series: [{ name: N('Held'), cls: 's3', pts: S.etfHeld(e.days).filter(function (d) { return d[0] >= since; }), fill: true }], h: 150, label: N('Bitcoin held by US spot ETFs'),
			fy: function (v) { return Math.round(v / 1000) + 'k'; }, fv: function (v) { return S.fmt(v, 0) + ' BTC'; } });
	}
	function drawSmartDumb() {
		var c = src('cot'), box = $('sg-sd');
		if (!c) { box.innerHTML = '<b>' + T('MES Smart Money / Dumb Money') + '</b>' + err('cot'); return; }
		var cell = function (lab, v, word, cls) { return '<div class="sg-sdv"><span class="sg-sdv__l"><i class="sg-sw ' + cls + '"></i>' + lab + '</span><b>' + v + '</b><span class="sg-sdv__w">' + esc(T(word)) + '</span><span class="sg-bar"><i class="' + cls + 'b" style="width:' + Math.max(2, v) + '%"></i></span></div>'; };
		box.innerHTML = '<div class="sg-chead"><b>' + T('MES Smart Money / Dumb Money') + ' ' + q('smartdumb') + '</b><div class="tu-seg sg-range" data-chart="sd"><button type="button" data-r="52">' + T('1 year') + '</button><button type="button" data-r="156">' + T('3 years') + '</button><button type="button" data-r="260">' + T('5 years') + '</button></div></div>' +
			'<div class="sg-sdtop">' + cell(T('Smart money'), c.smart, c.smartLabel, 's1') + cell(T('Dumb money'), c.dumb, c.dumbLabel, 's2') + '</div>' +
			'<p class="sg-sdread"><b>' + esc(T(c.reading)) + '</b> <span class="tu-note">(' + esc(T('positions as of {d}', { d: dshort(c.date) })) + ' ' + q('cot') + ')</span></p>' +
			'<div class="sg-legend"><span><i class="sg-sw s1"></i>' + T('Smart money (commercial hedgers)') + '</span><span><i class="sg-sw s2"></i>' + T('Dumb money (small traders)') + '</span><span><i class="sg-sw sg-sw--xg"></i>' + T('Very bullish') + '</span><span><i class="sg-sw sg-sw--xf"></i>' + T('Very bearish') + '</span></div>' +
			'<div class="sg-chart" id="sg-sd-chart"></div>' +
			'<details class="sg-method"><summary>' + T('By market and how this is worked out') + '</summary><div class="sg-tw"><table class="tu-table sg-sdt"><thead><tr><th>' + T('Futures market') + '</th><th class="r">' + T('Smart money') + '</th><th class="r">' + T('Dumb money') + '</th><th class="r">' + T('Hedgers&rsquo; net') + '</th><th class="r">' + T('Small traders&rsquo; net') + '</th></tr></thead><tbody>' +
			c.parts.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td class="r">' + p.smart + '</td><td class="r">' + p.dumb + '</td><td class="r">' + esc((p.smartNet > 0 ? '+' : '') + S.fmt(p.smartNet, 1)) + '%</td><td class="r">' + esc((p.dumbNet > 0 ? '+' : '') + S.fmt(p.dumbNet, 1)) + '%</td></tr>'; }).join('') +
			'</tbody></table></div><p class="tu-note">' + T('Net = long minus short contracts as a share of open interest.') + '</p><p>' + esc(T(S.SMART_DUMB_METHOD)) + '</p><p>' + T('Data: {a}.', { a: '<a href="https://publicreporting.cftc.gov" target="_blank" rel="noopener">CFTC Public Reporting</a>' }) + ' ' + (c.stale ? T('Showing the copy from {t}.', { t: esc(ago(c.stale)) }) + ' ' : '') + T('It describes positioning, not a forecast.') + '</p></details>';
		var since = S.ymd(Date.now() - st.sd * 7 * 864e5), h = c.hist.filter(function (p) { return p[0] >= since; });
		chart($('sg-sd-chart'), { series: [{ name: 'Smart money', cls: 's1', pts: h.map(function (p) { return [p[0], p[1]]; }) }, { name: 'Dumb money', cls: 's2', pts: h.map(function (p) { return [p[0], p[2]]; }) }],
			yMin: 0, yMax: 100, yTicks: [0, 20, 50, 80, 100], bands: [[0, 20, 'sg-band-xf'], [80, 100, 'sg-band-xg']], label: N('Smart money and dumb money confidence'), fv: function (v) { return v + ' (' + T(S.sdLabel(v)) + ')'; } });
	}
	function drawCrypto() {
		var c = src('coins'), g = src('global'), sb = src('stables'), hv = src('halving');
		$('sg-coins').innerHTML = c ? c.map(function (x) {
			return '<div class="sg-coin sg-coin--x" role="button" tabindex="0" data-cx="' + esc(x.id) + '" aria-label="' + esc(T('Bigger chart and links for {x}', { x: x.name })) + '"><div class="sg-coin__h"><b>' + esc(x.name) + '</b><span>' + esc(x.sym) + (x.rank ? ' · #' + x.rank : '') + '</span></div><div class="sg-coin__p">' + esc(S.money(x.price)) + '</div>' +
				'<div class="sg-coin__c"><span>24h ' + chg(x.ch24, 1) + '</span><span>7d ' + chg(x.ch7, 1) + '</span></div>' + spark(x.spark, 150, 36) + '<div class="tu-note">' + (x.athPct != null ? esc(T('{p} from its all-time high', { p: S.pct(x.athPct, 0) })) : '') + '</div></div>';
		}).join('') + '<p class="tu-note sg-wide">' + T('Click a coin for a bigger chart (24 hours to 1 year) and links to CoinGecko, CoinMarketCap, TradingView and Hyperliquid.') + ' ' + T('7-day sparklines') + ' ' + q('spark') + ' · ' + T('prices by {a}, in US dollars.', { a: '<a href="https://www.coingecko.com" target="_blank" rel="noopener">CoinGecko</a>' }) + '</p>' : err('coins');
		var o = '';
		if (g) o += stat(T('Total crypto market cap') + ' ' + q('mcap'), S.money(g.mcap, 'big'), '24h ' + chg(g.mcapCh24, 1), true) + stat(T('Bitcoin dominance') + ' ' + q('dominance'), S.fmt(g.btcDom, 1) + '%', T('Ether') + ' ' + S.fmt(g.ethDom, 1) + '%') + stat(T('24h trading volume'), S.money(g.vol, 'big'), esc(T('{n} coins tracked', { n: S.fmt(g.coins, 0) })));
		else o += stat(T('Total crypto market cap'), '—', T('not available right now'));
		if (sb) o += stat(T('Stablecoin supply') + ' ' + q('stablecoin'), S.money(sb.total, 'big'), sb.top.slice(0, 3).map(function (t) { return esc(t[0]) + ' ' + esc(S.money(t[1], 'big')); }).join(' · '));
		$('sg-cstats').innerHTML = o;
		drawEtf();
		var pp = src('perps');
		if (pp) {
			var fMax = Math.max(S.PERP_BASE * 4, Math.max.apply(null, pp.map(function (x) { return Math.abs(x.funding || 0); }))), oMax = Math.max.apply(null, pp.map(function (x) { return x.oi || 0; })), vMax = Math.max.apply(null, pp.map(function (x) { return x.vol || 0; }));
			var fbar = function (f) { if (f == null) return ''; var w = Math.min(50, Math.abs(f) / fMax * 50), base = S.PERP_BASE / fMax * 50; return '<span class="sg-dbar" aria-hidden="true"><i class="sg-dbar__b' + (f < 0 ? ' neg' : f > S.PERP_BASE * 1.6 ? ' hot' : '') + '" style="' + (f < 0 ? 'right:50%' : 'left:50%') + ';width:' + w.toFixed(1) + '%"></i><i class="sg-dbar__base" style="left:' + (50 + base).toFixed(1) + '%"></i></span>'; };
			var hbar = function (v, m, c) { return v == null || !m ? '' : '<span class="sg-hbar ' + (c || '') + '" aria-hidden="true"><i style="width:' + Math.max(2, v / m * 100).toFixed(1) + '%"></i></span>'; };
			$('sg-perps').innerHTML = '<div class="sg-chead"><b>' + T('Perps: funding and open interest') + ' ' + q('funding') + '</b><span class="tu-note">' + T('Hyperliquid, live') + '</span></div><div class="sg-tw"><table class="tu-table sg-ptbl"><thead><tr><th>' + T('Market') + '</th><th class="r">' + T('Price · 24h') + '</th><th>' + T('Funding (per hour · per year)') + '</th><th>' + T('Reading') + '</th><th>' + T('Open interest') + ' ' + q('oi') + '</th><th>' + T('24h volume') + '</th></tr></thead><tbody>' +
				pp.map(function (x) {
					var lc = /shorts/.test(x.lean) ? 'neg' : /crowded|more/.test(x.lean) ? 'hot' : /below/.test(x.lean) ? 'low' : 'ok';
					return '<tr><td><b>' + esc(x.sym === 'PAXG' ? T('PAXG (gold)') : x.sym) + '</b></td><td class="r">' + esc(S.money(x.px)) + '<br>' + chg(x.ch24, 1) + '</td>' +
						'<td>' + fbar(x.funding) + '<span class="sg-cellv">' + (x.funding == null ? '—' : esc(x.funding.toFixed(5) + '%') + ' · ' + esc(T('{p}/yr', { p: S.fmt(x.apr, 1) + '%' }))) + '</span></td>' +
						'<td><span class="sg-lean ' + lc + '">' + esc(T(x.lean)) + '</span></td>' +
						'<td>' + hbar(x.oi, oMax) + '<span class="sg-cellv">' + esc(S.money(x.oi, 'big')) + '</span></td><td>' + hbar(x.vol, vMax, 'v') + '<span class="sg-cellv">' + esc(S.money(x.vol, 'big')) + '</span></td></tr>';
				}).join('') + '</tbody></table></div><p class="tu-note">' + T('Funding bar: centre line = zero, thin mark = Hyperliquid&rsquo;s normal 0.00125% an hour (about 11% a year, paid by longs). Longer to the right = the bet-on-a-rise side is more crowded; to the left = shorts are paying. Bars for open interest and volume compare the markets with each other.') + ' ' + T('Data: {a} public API.', { a: '<a href="https://app.hyperliquid.xyz" target="_blank" rel="noopener nofollow">Hyperliquid</a>' }) + '</p>';
		} else $('sg-perps').innerHTML = '<b>' + T('Perps: funding and open interest') + '</b>' + err('perps');
		if (hv) {
			var left = hv.eta - Date.now();
			$('sg-halving').innerHTML = '<div class="sg-chead"><b>' + T('Next Bitcoin halving') + ' ' + q('halving') + '</b><span class="tu-note">' + esc(T('block {n}', { n: S.fmt(hv.target, 0) })) + '</span></div><div class="sg-hv"><div class="sg-hv__big">' + esc(T('{n} days', { n: Math.floor(left / 864e5) })) + '</div><div>' + T('about {d}', { d: '<b>' + esc(new Date(hv.eta).toLocaleDateString(LOC, { year: 'numeric', month: 'long', day: 'numeric' })) + '</b>' }) + '<br><span class="tu-note">' + esc(T('{n} blocks to go at {m} min per block (recent average)', { n: S.fmt(hv.left, 0), m: (hv.avgSec / 60).toFixed(1) })) + '</span></div></div>' +
				'<div class="sg-prog" role="img" aria-label="' + esc(T('{p}% of this halving period done', { p: hv.epochPct })) + '"><i style="width:' + hv.epochPct + '%"></i></div><p class="tu-note">' + esc(T('{p}% of the way through this four-year period. Block reward {r} BTC now, {n} BTC after. Current block {h}', { p: hv.epochPct, r: hv.reward, n: hv.next, h: S.fmt(hv.height, 0) })) + ' (<a href="https://mempool.space" target="_blank" rel="noopener">mempool.space</a>).</p>';
		} else $('sg-halving').innerHTML = '<b>' + T('Next Bitcoin halving') + '</b>' + err('halving');
	}
	function stat(lab, val, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + lab + '</div><div class="tu-stat__value">' + val + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	var QG = { spx: 'sp500', nasdaq: 'nasdaq', dow: 'dow', gold: 'gold', oil: 'oil', dxy: 'dxy' };
	function drawMkts() {
		var m = src('markets');
		if (!m) { $('sg-quotes').innerHTML = err('markets'); $('sg-q-chart').innerHTML = ''; return; }
		var keys = Object.keys(QG).filter(function (k) { return m[k]; }); if (!m[st.qk]) st.qk = keys[0];
		$('sg-quotes').innerHTML = keys.map(function (k) {
			var x = m[k], money = k === 'gold' || k === 'oil';
			return '<div class="sg-quote" role="button" tabindex="0" data-q="' + k + '" aria-pressed="' + (k === st.qk) + '"><span class="sg-coin__h"><b>' + esc(T(x.name)) + '</b>' + q(QG[k]) + '</span><span class="sg-coin__p">' + esc(money ? S.money(x.price) : S.fmt(x.price, 2)) + '</span><span class="sg-coin__c">' + chg(x.chPct, 2) + '</span>' + spark(x.spark.map(function (p) { return p[1]; }), 150, 32) + '</div>';
		}).join('') + (m._missing ? '<p class="tu-note sg-wide">' + esc(T('Not available right now: {x}.', { x: m._missing.map(function (s) { return s.split(':')[0]; }).join(', ') })) + '</p>' : '');
		var x = m[st.qk];
		$('sg-qtitle').textContent = T('{x}, last 3 months', { x: T(x.name) });
		chart($('sg-q-chart'), { series: [{ name: x.name, cls: 's1', pts: x.spark, fill: true }], label: T('{x} price', { x: T(x.name) }), fy: function (v) { return v >= 1000 ? S.fmt(v / 1000, 1) + 'k' : S.fmt(v, v < 10 ? 2 : 0); }, fv: function (v) { return S.fmt(v, 2); } });
		$('sg-qsrc').innerHTML = esc(T('Source: {s}{n}. Last price {d}.', { s: x.src, n: x.note ? ' (' + T(x.note) + ')' : '', d: x.date ? dshort(x.date) : '' }) + ' ' + T('Futures prices for gold and oil; indexes are not directly tradable. Markets that are closed show their last price.'));
	}
	function pickQ(e) { if (e.target.closest('.sg-q')) return; var b = e.target.closest('.sg-quote'); if (b) { st.qk = b.getAttribute('data-q'); save(); drawMkts(); var nb = $('sg-quotes').querySelector('[data-q="' + st.qk + '"]'); if (nb && e.type === 'keydown') nb.focus(); } }
	$('sg-quotes').addEventListener('click', pickQ); $('sg-quotes').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sg-quote')) { e.preventDefault(); pickQ(e); } });
	function drawRates() {
		var r = src('rates'), cu = src('curve'), cpi = src('cpi');
		drawFomc();
		var o = '';
		if (r) {
			var ya = function (k) { var p = r.yearAgo[k]; return p ? T('a year ago {p}', { p: S.fmt(p[1], 2) + '%' }) : ''; };
			o += stat(T('Fed target range') + ' ' + q('fedfunds'), S.fmt(r.lower[1], 2) + '–' + S.fmt(r.target.rate, 2) + '%', esc(T('since {d}', { d: dshort(r.target.since) })) + (r.target.prev != null ? ' (' + esc(T(r.target.rate > r.target.prev ? 'raised {b}' : 'cut {b}', { b: S.bp(Math.abs(r.target.rate - r.target.prev)) })) + ' ' + q('bps') + ')' : ''), true) +
				stat(T('Effective fed funds'), S.fmt(r.latest.dff[1], 2) + '%', esc(ya('dff'))) + stat(T('2-year Treasury'), S.fmt(r.latest.dgs2[1], 2) + '%', esc(ya('dgs2'))) + stat(T('10-year Treasury'), S.fmt(r.latest.dgs10[1], 2) + '%', esc(ya('dgs10'))) +
				stat(T('10-year minus 2-year') + ' ' + q('inversion'), (r.latest.spread[1] > 0 ? '+' : '') + Math.round(r.latest.spread[1] * 100) + ' bp', r.latest.spread[1] < 0 ? '<span class="sg-neg">' + T('inverted') + '</span>' : T('normal (not inverted)'));
		}
		if (cpi) o += stat(T('US inflation (CPI)') + ' ' + q('cpi'), S.fmt(cpi.latest[1], 1) + '%', esc(T('year over year, {d}', { d: dshort(cpi.latest[0]) })));
		$('sg-rstats').innerHTML = o || err('rates');
		if (r) {
			var since = S.ymd(Date.now() - st.rates * 864e5), ser = [{ name: N('Fed funds (effective)'), cls: 's3', pts: S.sinceDate(r.dff, since) }, { name: N('2-year'), cls: 's2', pts: S.sinceDate(r.dgs2, since) }, { name: N('10-year'), cls: 's1', pts: S.sinceDate(r.dgs10, since) }];
			$('sg-rates-legend').innerHTML = ser.map(function (x) { return '<span><i class="sg-sw ' + x.cls + '"></i>' + T(x.name) + '</span>'; }).join('');
			chart($('sg-rates-chart'), { series: ser, label: N('US interest rates'), fy: function (v) { return S.fmt(v, 1) + '%'; }, fv: function (v) { return S.fmt(v, 2) + '%'; } });
		} else $('sg-rates-chart').innerHTML = err('rates');
		if (cu) {
			var c0 = st.curve > 1000 ? '0000' : S.ymd(Date.now() - st.curve * 30.44 * 864e5).slice(0, 7), pts = cu.m.filter(function (p) { return p[0] >= c0; });
			var daily = r ? S.sinceDate(r.spread, S.ymd(Date.now() - 40 * 864e5)) : [];
			chart($('sg-curve-chart'), { series: [{ name: N('10y − 2y'), cls: 's1', pts: pts, negFill: true }], zero: true, xBands: cu.rec, label: N('10-year minus 2-year Treasury spread'), fy: function (v) { return (v > 0 ? '+' : '') + S.fmt(v, 1); }, fv: function (v) { return (v > 0 ? '+' : '') + Math.round(v * 100) + ' bp'; } });
			var last = cu.inv[cu.inv.length - 1];
			$('sg-curve-note').innerHTML = T('Monthly averages, percentage points (FRED T10Y2Y; grey = NBER recessions, FRED USREC).') + ' ' + (daily.length && daily[daily.length - 1][1] < 0 ? '<b>' + T('The curve is inverted now.') + '</b> ' : '') +
				(last ? esc(T('The last inversion ran from {a} to {b} (deepest {n} bp).', { a: dshort(last[0]), b: dshort(last[1]), n: Math.round(last[2] * 100) })) + ' ' : '') + T('An inversion has come before every US recession since the 1970s, with a delay of months to two years, and has had false alarms: a warning light, not a forecast.');
		} else $('sg-curve-chart').innerHTML = err('curve');
		if (cpi) chart($('sg-cpi-chart'), { series: [{ name: N('CPI inflation'), cls: 's2', pts: cpi.yoy }], bands: [[1.9, 2.1, 'sg-band-target']], zero: true, label: N('US CPI inflation, year over year'), fy: function (v) { return S.fmt(v, 0) + '%'; }, fv: function (v) { return T('{p} (Fed aim: about 2%)', { p: S.fmt(v, 1) + '%' }); } });
		else $('sg-cpi-chart').innerHTML = err('cpi');
		var cb = [['boc', N('Bank of Canada'), N('overnight rate target')], ['ecb', N('European Central Bank'), N('deposit facility rate')], ['boe', N('Bank of England'), N('Bank Rate')]];
		$('sg-cbanks').innerHTML = cb.map(function (b) { var x = src(b[0]); return x ? stat(T(b[1]), S.fmt(x.rate, 2) + '%', esc(T(b[2]) + ', ' + T('since {d}', { d: dshort(x.since) }) + (x.prev != null ? ' (' + T('was {p}', { p: S.fmt(x.prev, 2) + '%' }) + ')' : ''))) : stat(T(b[1]), '—', T('not available right now')); }).join('');
		news($('sg-fed'), src('fed'), 'fed');
	}
	function drawFomc() {
		var fo = S.nextFomc(Date.now()), el = $('sg-fomc');
		if (!fo) { el.innerHTML = '<b>' + T('Next FOMC meeting') + '</b><p class="tu-note">' + T('The 2028 schedule is not on this page yet. See {a}.', { a: '<a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noopener">' + T('the Fed&rsquo;s calendar') + '</a>' }) + '</p>'; return; }
		var rest = S.FOMC.slice(fo.idx + 1, fo.idx + 6);
		el.innerHTML = '<div class="sg-chead"><b>' + T('Next Fed meeting (FOMC)') + ' ' + q('fomc') + '</b><span class="tu-note">' + esc(dshort(fo.start)) + ' – ' + esc(dshort(fo.end)) + '</span></div>' +
			'<div class="sg-hv"><div class="sg-hv__big" id="sg-fomc-big">' + esc(fo.live ? T('This week') : S.countdown(fo.at - Date.now())) + '</div><div>' + T('Decision at {t} your time (2:00 pm Eastern), press conference 30 minutes later.', { t: '<b>' + esc(new Date(fo.at).toLocaleString(LOC, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</b>' }) +
			(fo.sep ? '<br><b>' + T('With projections and the dot plot') + '</b> ' + q('dotplot') : '') + '</div></div>' +
			'<div class="sg-later"><span class="tu-note">' + T('After that:') + '</span> ' + rest.map(function (f) { return '<span>' + esc(dshort(f[1])) + (f[2] ? ' &#9679;' : '') + '</span>'; }).join('') + ' <span class="tu-note">(&#9679; = ' + T('dot plot') + ')</span></div>' +
			'<p class="tu-note">' + T('Schedule from {a}, checked {d}.', { a: '<a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noopener">federalreserve.gov</a>', d: esc(dshort(S.FOMC_CHECKED)) }) + ' ' + T('Kalshi and Polymarket odds for this meeting are on the Prediction markets tab.') + '</p>';
	}
	// one prediction-market card (Prediction markets tab and Geopolitics tab)
	function mkCard(m) {
		var rows = m.outcomes;
		if (m.ladder) { var near = m.outcomes.map(function (o, i) { return [Math.abs(o.p - 50), i]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, 6).map(function (x) { return x[1]; }).sort(function (a, b) { return a - b; }); rows = near.map(function (i) { return m.outcomes[i]; }); }
		var vol = m.vol24 && m.src !== N('Kalshi') ? '<span class="tu-note">' + esc(T('{m} traded in 24h', { m: S.money(m.vol24, 'big') })) + ' ' + q('vol') + '</span>' : '';
		if (m.geo) vol = (m.vol ? '<span class="tu-note">' + esc(T('{m} traded in total', { m: S.money(m.vol, 'big') })) + '</span>' : '') + (m.contracts ? '<span class="tu-note">' + esc(T('{n} contracts traded', { n: S.fmt(m.contracts, 0) })) + ' ' + q('contracts') + '</span>' : '');
		return '<article class="sg-mk"><div class="sg-mk__h"><span class="sg-src sg-src--' + (m.src === N('Kalshi') ? 'k' : 'p') + '">' + esc(m.src) + '</span><span class="tu-note">' + esc(m.dated ? T('by date, earliest first') : T(m.cat)) + '</span></div><h3>' + esc(m.title) + (m.sub ? ' <small>' + esc(m.sub) + '</small>' : '') + '</h3>' +
			(m.likely ? '<p class="sg-likely">' + T('Most likely range:') + ' <b>' + esc(m.likely.label) + '</b> (' + esc(S.fmt(m.likely.p, 0)) + '%)</p>' : '') +
			'<ul class="sg-oc">' + rows.map(function (o) { return '<li><span class="sg-oc__l" title="' + esc(o.label) + '">' + esc(o.label) + '</span><span class="sg-bar"><i style="width:' + Math.max(1, o.p) + '%"></i></span><b>' + esc(o.p < 1 ? '<1' : S.fmt(o.p, 0)) + '%</b></li>'; }).join('') + '</ul>' +
			'<div class="sg-mk__f">' + (m.more ? '<span class="tu-note">' + esc(T('+{n} more answers', { n: m.more })) + '</span>' : '') + vol + (m.ladder ? '<span class="tu-note">' + esc(T('{n} levels, showing the 6 nearest 50%', { n: m.outcomes.length })) + '</span>' : '') + (m.end ? '<span class="tu-note">' + esc(T('ends {d}', { d: dshort(m.end.slice(0, 10)) })) + '</span>' : '') + '<a href="' + esc(m.url) + '" target="_blank" rel="noopener nofollow">' + esc(T('Open on {x}', { x: m.src })) + ' &#8599;</a></div></article>';
	}
	function drawPred() {
		var pm = src('poly') || [], ks = src('kalshi') || [], all = ks.concat(pm), cats = [N('All')];
		all.forEach(function (m) { if (m.cat && cats.indexOf(m.cat) < 0) cats.push(m.cat); });
		if (cats.indexOf(st.pcat) < 0) st.pcat = N('All');
		$('sg-pcats').innerHTML = cats.map(function (c) { var n = c === N('All') ? all.length : all.filter(function (m) { return m.cat === c; }).length; return '<button type="button" class="tu-chip" data-c="' + esc(c) + '" aria-pressed="' + (c === st.pcat) + '">' + esc(T(c)) + ' (' + n + ')</button>'; }).join('');
		var ORD = [N('Fed'), N('Economy'), N('Crypto'), N('Politics')], rank = function (m) { var i = ORD.indexOf(m.cat); return i < 0 ? 9 : i; };
		all = all.map(function (m, i) { return [m, i]; }).sort(function (a, b) { return rank(a[0]) - rank(b[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; });
		var list = all.filter(function (m) { return st.pcat === N('All') || m.cat === st.pcat; });
		if (!all.length) { $('sg-markets').innerHTML = err('poly'); return; }
		$('sg-markets').innerHTML = list.map(mkCard).join('') + ((src('poly') && src('kalshi')) ? '' : '<p class="tu-note">' + T('{x} did not answer this time.', { x: !src('poly') ? N('Polymarket') : N('Kalshi') }) + '</p>') +
			'<p class="tu-note sg-wide">' + T('War, ceasefire and invasion markets are on the {a} tab.', { a: '<a href="?tab=geo" data-goto="geo">' + T('Geopolitics') + '</a>' }) + '</p>';
	}
	$('sg-pcats').addEventListener('click', function (e) { var b = e.target.closest('.tu-chip'); if (b) { st.pcat = b.getAttribute('data-c'); save(); drawPred(); } });
	root.addEventListener('click', function (e) { var a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); showTab(a.getAttribute('data-goto')); $('sg-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
	function news(el, items, n) { el.innerHTML = items ? items.map(function (i) { return '<li><a href="' + esc(i.link) + '" target="_blank" rel="noopener nofollow">' + esc(i.title) + '</a><span class="tu-note">' + (i.src ? esc(i.src) + ' · ' : '') + esc(i.date ? ago(i.date) : '') + '</span></li>'; }).join('') : '<li>' + err(n) + '</li>'; }

	// ---------- News tab: collapsible sections, Cards | List | Compact, columns, how many, source chips (all saved in localStorage) ----------
	var SECSRC = { crypto: 'news', markets: 'mnews', world: 'wnews', fed: 'fed' };
	function secItems(sec) {
		var d = src(SECSRC[sec]);
		if (sec === 'fed') return d ? d.map(function (i) { return Object.assign({ src: T('Federal Reserve'), sid: 'fed' }, i); }) : null;
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
			body += list.length ? '<ul class="sg-nlist sg-nlist--' + st.nview + '" data-cols="' + esc(st.nview === 'compact' && st.ncols === 'auto' ? '1' : st.ncols) + '">' + list.map(newsItem).join('') + '</ul>' : '<p class="tu-note">' + T('Nothing to show with these sources switched off.') + '</p>';
			if (shown.length > list.length) body += '<button type="button" class="tu-btn tu-btn--ghost sg-nmore" data-nset-more="1">' + esc(T('Show all {n}', { n: shown.length })) + '</button>';
			var miss = src(SECSRC[key]) && src(SECSRC[key]).missing; if (miss) body += '<p class="tu-note">' + esc(T('Not available right now: {x}.', { x: miss.map(function (m) { return m.split(':')[0]; }).join(', ') })) + '</p>';
		}
		return '<section class="sg-nsec' + (closed ? ' is-closed' : '') + '">' + head + '<div class="sg-nsec__b"' + (closed ? ' hidden' : '') + '>' + body + '</div></section>';
	}
	// news in the page's own language (BBC World Service / DW / France 24 feeds, job lnews): shown first on the News tab of a translated page
	function langNews() {
		var code = I18 && I18.code; if (!code || code === 'en') return '';
		var d = src('lnews'), items = d && d[code] ? d[code] : null;
		if (!d) return '';
		return newsSection('lang', T('News in {lang}', { lang: I18.name || code }), items, 'lnews');
	}
	function drawNews() {
		$('sg-nsecs').innerHTML = langNews() + S.NEWS_SECTIONS.map(function (s) { return newsSection(s[0], T(s[1]), secItems(s[0]), SECSRC[s[0]]); }).join('');
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
		if (f) { var shut = f.getAttribute('data-fold') === 'close'; S.NEWS_SECTIONS.concat([['lang']]).forEach(function (s) { if (shut) st.nclosed[s[0]] = 1; else delete st.nclosed[s[0]]; }); save(); drawNews(); return; }
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
		$('sg-godds').innerHTML = '<div class="sg-chead"><b>' + T('Conflict odds, as the markets price them') + ' ' + q('geoodds') + '</b><span class="tu-note">' + T('the market&rsquo;s own &ldquo;Yes&rdquo; price, biggest markets first') + '</span></div>' +
			(odds.length ? '<ul class="sg-gol">' + odds.map(function (o) { return '<li><a href="' + esc(o.url) + '" target="_blank" rel="noopener nofollow">' + esc(o.title) + '</a><span class="sg-bar"><i style="width:' + Math.max(1, o.yes) + '%"></i></span><b>' + esc(o.yes < 1 ? '<1' : S.fmt(o.yes, 0)) + '%</b><span class="tu-note">' + esc(o.src + (o.vol ? ' · ' + T('{m} traded', { m: S.money(o.vol, 'big') }) : '') + (o.end ? ' · ' + T('ends {d}', { d: dshort(o.end.slice(0, 10)) }) : '')) + '</span></li>'; }).join('') + '</ul>' +
				'<p class="tu-note">' + T('Traders&rsquo; prices, not facts or forecasts by MES; nothing is averaged or added. Thin markets move on rumours: open the market to read exactly how it resolves.') + '</p>' : err('geo'));
		drawClock();
		drawGauges();
		$('sg-gmarkets').innerHTML = all.length ? all.slice(0, 18).map(mkCard).join('') + (src('geo') && src('geok') ? '' : '<p class="tu-note sg-wide">' + T('{x} did not answer this time.', { x: !src('geo') ? N('Polymarket') : N('Kalshi') }) + '</p>') : err('geo');
		drawWarCost();
		drawGeoNews();
	}
	function clockFace(sec) {
		var a = -sec / 3600 * 2 * Math.PI, cx = 60, cy = 60, r = 52, mh = [cx + 44 * Math.sin(a), cy - 44 * Math.cos(a)], ticks = '';
		for (var i = 0; i < 12; i++) { var t = i / 12 * 2 * Math.PI; ticks += '<line class="sg-ck__t" x1="' + (cx + 46 * Math.sin(t)).toFixed(1) + '" y1="' + (cy - 46 * Math.cos(t)).toFixed(1) + '" x2="' + (cx + 51 * Math.sin(t)).toFixed(1) + '" y2="' + (cy - 51 * Math.cos(t)).toFixed(1) + '"></line>'; }
		var wedge = 'M' + cx + ' ' + cy + ' L' + mh[0].toFixed(2) + ' ' + mh[1].toFixed(2) + ' A44 44 0 0 1 ' + cx + ' ' + (cy - 44) + ' Z';
		return '<svg class="sg-ck" viewBox="0 0 120 120" role="img" aria-label="' + esc(T('Clock face with the minute hand {t} before midnight', { t: S.clockText(sec) })) + '"><circle class="sg-ck__f" cx="60" cy="60" r="' + r + '"></circle>' + ticks + '<path class="sg-ck__w" d="' + wedge + '"></path><line class="sg-ck__h" x1="60" y1="60" x2="60" y2="30"></line><line class="sg-ck__m" x1="60" y1="60" x2="' + mh[0].toFixed(2) + '" y2="' + mh[1].toFixed(2) + '"></line><circle class="sg-ck__c" cx="60" cy="60" r="3.5"></circle></svg>';
	}
	function drawClock() {
		var ds = S.doomsdayStats(), L0 = S.DOOMSDAY_LATEST, mv = ds.lastMove;
		$('sg-dclock').innerHTML = '<div class="sg-gh"><b>' + T('Doomsday Clock') + '</b> ' + q('doomsday') + '</div><div class="sg-ckw">' + clockFace(L0.seconds) + '<div><div class="sg-hv__big sg-dc__v">' + esc(S.clockText(L0.seconds)) + '</div><div>' + esc(T('to midnight, set {d}', { d: dshort(L0.announced) })) + '</div>' +
			(mv ? '<div class="tu-note">' + esc(T('Moved from {a} in {y}. The closest it has ever been; the farthest was {b} in {z}.', { a: S.clockText(mv.from), y: mv.year, b: S.clockText(ds.farthest[1]), z: ds.farthest[0] })) + '</div>' : '') + '</div></div>' +
			'<p class="tu-note">' + T('Set once a year by the {a}, usually in late January: an expert judgment, not a probability. The next setting is usually announced in January.', { a: '<a href="' + esc(L0.url) + '" target="_blank" rel="noopener">' + T('Bulletin of the Atomic Scientists') + '</a>' }) + ' ' + T('Settings entered by hand from {a}, checked {d}.', { a: '<a href="' + esc(S.DOOMSDAY_SRC) + '" target="_blank" rel="noopener">' + T('the Bulletin&rsquo;s timeline') + '</a>', d: esc(dshort(S.DOOMSDAY_CHECKED)) }) + '</p>';
		chart($('sg-dc-chart'), { series: [{ name: N('Minutes to midnight'), cls: 's2', pts: S.doomsdaySteps(S.ymd(Date.now())), fill: true }], yMin: 0, yMax: 18, yTicks: [0, 3, 6, 9, 12, 15, 18], label: N('Doomsday Clock, minutes to midnight, 1947 to today'), fy: function (v) { return T('{n} min', { n: v }); }, fv: function (v) { return T('{t} to midnight', { t: S.clockText(Math.round(v * 60)) }); } });
		$('sg-dctable').innerHTML = '<table class="tu-table"><thead><tr><th>' + T('Year') + '</th><th>' + T('Setting') + '</th></tr></thead><tbody>' + S.DOOMSDAY.slice().reverse().map(function (x, i, a) { var nx = a[i + 1], ch = nx ? (x[1] < nx[1] ? ' <span class="sg-neg">&#9650; ' + T('closer') + '</span>' : x[1] > nx[1] ? ' <span class="sg-ch up">&#9660; ' + T('farther') + '</span>' : ' <span class="tu-note">' + T('unchanged') + '</span>') : ' <span class="tu-note">' + T('first setting') + '</span>'; return '<tr><td>' + x[0] + '</td><td>' + esc(S.clockText(x[1])) + ch + '</td></tr>'; }).join('') + '</tbody></table>';
	}
	function drawGauges() {
		var m = src('markets') || {}, sf = src('stockfg'), vix = sf && sf.parts.filter(function (p) { return p.key === 'vix'; })[0], o = [];
		[['oil', N('Oil (WTI)'), true], ['gold', 'Gold', true], ['dxy', N('US dollar index'), false]].forEach(function (k) { var x = m[k[0]]; if (x) o.push('<div class="sg-quote sg-gq"><span class="sg-coin__h"><b>' + esc(T(k[1])) + '</b></span><span class="sg-coin__p">' + esc(k[2] ? S.money(x.price) : S.fmt(x.price, 2)) + '</span><span class="sg-coin__c">' + chg(x.chPct, 2) + '<span>' + T('day') + '</span></span>' + spark(x.spark.map(function (p) { return p[1]; }), 150, 30) + '</div>'); });
		if (vix) o.push('<div class="sg-quote sg-gq"><span class="sg-coin__h"><b>VIX</b>' + q('vix') + '</span><span class="sg-coin__p">' + esc(S.fmt(vix.value, 2)) + '</span><span class="sg-coin__c"><span>' + esc(T(vix.value >= 30 ? 'fearful' : vix.value >= 20 ? 'nervous' : 'calm')) + ' · ' + esc(dshort(sf.date)) + '</span></span></div>');
		$('sg-gauges').innerHTML = '<div class="sg-gh"><b>' + T('Markets&rsquo; fear gauges') + '</b> ' + q('feargauges') + '</div>' + (o.length ? '<div class="sg-gqs">' + o.join('') + '</div><p class="tu-note">' + T('Day change and 3-month line. These move for many reasons besides conflict.') + ' ' + T('More on the {a} tab.', { a: '<a href="?tab=mkts" data-goto="mkts">' + T('Stocks &amp; commodities') + '</a>' }) + '</p>' : err('markets'));
	}
	function drawWarCost() {
		var W = S.WAR_COSTS, max = Math.max.apply(null, W.map(function (w) { return w[1]; })), days = Math.floor((Date.now() - Date.parse(S.WAR_START + 'T00:00:00Z')) / 864e5);
		$('sg-warcost').innerHTML = '<div class="sg-chead"><b>' + T('What the Iran war has cost the US: published estimates') + ' ' + q('warcost') + '</b><span class="tu-note">' + T('US dollars, as stated on each date') + '</span></div>' +
			'<ul class="sg-wc">' + W.map(function (w) { return '<li><span class="sg-wc__d">' + esc(dshort(w[0])) + '</span><span class="sg-wc__v">' + esc('$' + S.fmt(w[1], w[1] % 1 ? 1 : 0) + 'B') + '</span><span class="sg-bar"><i style="width:' + (w[1] / max * 100).toFixed(1) + '%"></i></span><span class="sg-wc__w"><b>' + esc(T(w[2])) + '.</b> ' + esc(T(w[3])) + ' <a href="' + esc(w[4]) + '" target="_blank" rel="noopener nofollow">' + T('Source') + ' &#8599;</a></span></li>'; }).join('') + '</ul>' +
			'<p class="tu-note">' + esc(T('Strikes began on {d} ({n} days ago).', { d: dshort(S.WAR_START), n: days })) + ' ' + T('<b>Why there is no live counter:</b> the only published daily rate (CSIS, about $891 million a day) covers the first 100 hours; the Pentagon totals are cumulative figures given on a date, they count different things, and there were ceasefires in between, so any running number would be our own guess. Wider studies (veterans&rsquo; care, interest on borrowing) put the full cost much higher.') + ' ' + esc(T('Figures entered by hand, checked {d}.', { d: dshort(S.WAR_COSTS_CHECKED) })) + '</p>';
	}
	function drawGeoNews() {
		var items = secItems('world'), filt = st.gconf ? function (i) { return S.CONFLICT_RE.test(i.title + ' ' + (i.sum || '')); } : null;
		$('sg-gnews').innerHTML = '<div class="tu-chips"><button type="button" class="tu-chip" data-gconf="1" aria-pressed="' + !!st.gconf + '">' + T('Only war, ceasefire &amp; security stories') + '</button></div>' + newsSection('geoworld', T('World headlines'), items, 'wnews', filt) +
			'<p class="tu-note">' + T('View, columns and how many to show follow the {a} tab&rsquo;s settings.', { a: '<a href="?tab=news" data-goto="news">' + T('News') + '</a>' }) + '</p>';
	}
	// ---------- overview: market mood by sector (rules in lib S.sectorMood / S.MOOD_RULES) ----------
	function allSrc() { var d = {}; if (data) Object.keys(data.sources).forEach(function (k) { d[k] = src(k); }); return d; }
	function meter(m) {
		if (!m || m.v == null || !isFinite(m.v)) return '<span class="sg-mt sg-mt--none"></span>';
		var p = Math.max(0, Math.min(100, (m.v - m.min) / (m.max - m.min) * 100));
		if (m.kind === 'fg') return '<span class="sg-mt sg-mt--fg" title="' + esc(T('{v} of 100', { v: m.v })) + '"><i class="sg-mt__pin" style="left:' + p.toFixed(1) + '%"></i></span>';
		if (m.kind === 'pct' || m.kind === 'pp') { var z = (0 - m.min) / (m.max - m.min) * 100, a = Math.min(p, z), w = Math.abs(p - z); return '<span class="sg-mt sg-mt--c" title="' + esc(m.kind === 'pct' ? S.pct(m.v, 1) : (m.v >= 0 ? '+' : '') + Math.round(m.v * 100) + ' bp') + '"><i class="sg-mt__z" style="left:' + z.toFixed(1) + '%"></i><i class="sg-mt__b ' + (m.v < 0 ? 'dn' : 'up') + '" style="left:' + a.toFixed(1) + '%;width:' + Math.max(1.5, w).toFixed(1) + '%"></i></span>'; }
		return '<span class="sg-mt sg-mt--f ' + m.kind + '" title="' + esc(S.fmt(m.v, 1) + '%') + '"><i style="width:' + Math.max(2, p).toFixed(1) + '%"></i>' + (m.kind === 'cpi' ? '<i class="sg-mt__tg" style="left:' + (2 / m.max * 100).toFixed(1) + '%"></i>' : '') + '</span>';
	}
	var TAB_NAMES = { crypto: N('Crypto'), mkts: N('Stocks & commodities'), rates: N('Rates & the Fed'), pred: N('Prediction markets'), geo: N('Geopolitics') };
	function drawOver() {
		var rows = S.sectorMood(allSrc()), counts = { s: 0, c: 0 };
		rows.forEach(function (r) { if (r.tone < 0) counts.s++; else if (r.tone > 0) counts.c++; });
		$('sg-over').innerHTML = '<div class="sg-chead"><b>' + T('Market mood by sector') + ' ' + q('mood') + '</b><span class="tu-note">' + esc(T('{n} sectors · {s} stressed or falling · {c} calm or rising', { n: rows.length, s: counts.s, c: counts.c })) + '</span></div>' +
			'<div class="sg-ov" role="list">' + rows.map(function (r) {
				return '<div class="sg-ov__r t' + r.tone + '" role="listitem"><button type="button" class="sg-ov__go" data-goto="' + r.tab + '" title="' + esc(T('Open the {x} tab', { x: T(TAB_NAMES[r.tab]) })) + '">' +
					'<span class="sg-ov__n">' + esc(T(r.name)) + '</span><span class="sg-mood t' + r.tone + '">' + esc(T(r.mood)) + '</span>' +
					'<span class="sg-ov__v">' + meter(r.meter) + (r.spark && r.spark.length > 1 ? spark(r.spark, 96, 26) : '') + '</span>' +
					'<span class="sg-ov__f">' + r.facts.map(esc).join(' <span class="sg-sep">·</span> ') + '</span><span class="sg-ov__arr" aria-hidden="true">&#8250;</span></button></div>';
			}).join('') + '</div>' +
			'<details class="sg-rules"><summary>' + T('How the mood words are worked out') + '</summary><ul>' + S.MOOD_RULES.map(function (r) { return '<li><b>' + esc(T(r[0])) + ':</b> ' + esc(T(r[1])) + '</li>'; }).join('') + '</ul><p class="tu-note">' + T('Fixed rules applied to the numbers on this page, recalculated on every refresh. The words describe how things are now; they are not forecasts and say nothing about what to buy or sell.') + '</p></details>';
	}

	// ---------- coin window: bigger chart + links ----------
	var CX = { bitcoin: { cmc: 'bitcoin', tv: 'BITSTAMP:BTCUSD', hl: 'BTC' }, ethereum: { cmc: 'ethereum', tv: 'BITSTAMP:ETHUSD', hl: 'ETH' }, ripple: { cmc: 'xrp', tv: 'BITSTAMP:XRPUSD', hl: 'XRP' }, solana: { cmc: 'solana', tv: 'COINBASE:SOLUSD', hl: 'SOL' }, hive: { cmc: 'hive-blockchain', tv: 'BINANCE:HIVEUSDT', hl: null } };
	var cxCache = {}, cxId = null, cxLast = null;
	function cxCoin(id) { return (src('coins') || []).filter(function (c) { return c.id === id; })[0]; }
	function openCx(id, from) {
		var c = cxCoin(id); if (!c) return; cxId = id; if (from) cxLast = from;
		var box = $('sg-cx'), m = CX[id] || {}, pp = (src('perps') || []).filter(function (p) { return p.sym === m.hl; })[0];
		box.hidden = false; document.documentElement.classList.add('sg-cx-open');
		$('sg-cx-t').innerHTML = '<b>' + esc(c.name) + '</b> <span class="tu-note">' + esc(c.sym) + (c.rank ? ' · #' + c.rank : '') + '</span>';
		$('sg-cx-sub').innerHTML = '<span class="sg-cx__p">' + esc(S.money(c.price)) + '</span><span>24h ' + chg(c.ch24, 1) + '</span><span>7d ' + chg(c.ch7, 1) + '</span>';
		var stats = [[N('Market cap'), S.money(c.mcap, 'big')], [N('All-time high'), S.money(c.high) + ' (' + T('{p} from it', { p: S.pct(c.athPct, 0) }) + ')']];
		if (pp) stats.push([N('Perp funding (Hyperliquid)'), pp.funding.toFixed(5) + '%/h · ' + T(pp.lean)], [N('Perp open interest'), S.money(pp.oi, 'big')]);
		$('sg-cx-stats').innerHTML = stats.map(function (x) { return '<div><span>' + esc(T(x[0])) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('');
		var L = [['CoinGecko', 'https://www.coingecko.com/en/coins/' + id], m.cmc && ['CoinMarketCap', 'https://coinmarketcap.com/currencies/' + m.cmc + '/'], m.tv && [T('TradingView chart'), 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(m.tv)], m.hl && ['Hyperliquid', 'https://app.hyperliquid.xyz/trade/' + m.hl]].filter(Boolean);
		$('sg-cx-links').innerHTML = '<span class="tu-note">' + T('Open on:') + '</span> ' + L.map(function (x) { return '<a class="tu-chip" href="' + esc(x[1]) + '" target="_blank" rel="noopener nofollow">' + esc(x[0]) + ' &#8599;</a>'; }).join(' ');
		cxDraw(); setTimeout(function () { $('sg-cx-x').focus(); }, 0);
	}
	function cxH() { var b = $('sg-cx-chart'); return Math.max(200, Math.min(620, window.innerHeight - b.getBoundingClientRect().top - 150)); }
	function cxDraw() {
		var id = cxId, days = st.cxd || 30, c = cxCoin(id), box = $('sg-cx-chart'), k = id + ':' + days;
		[].forEach.call($('sg-cx-rng').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-d') === days)); });
		var draw = function (pts, note) {
			if (cxId !== id) return;
			var first = pts[0] && pts[0][1], last = pts.length && pts[pts.length - 1][1], up = last >= first;
			chart(box, { series: [{ name: c.name, cls: up ? 's1' : 's2', pts: pts, fill: true }], h: cxH(), label: T('{x} price', { x: c.name }), fy: function (v) { return S.money(v); } });
			$('sg-cx-note').innerHTML = (pts.length > 1 ? T('Over this range:') + ' ' + chg((last / first - 1) * 100, 1) + ' · ' : '') + note;
		};
		var CGN = T('Prices by {a}, US dollars.', { a: '<a href="https://www.coingecko.com" target="_blank" rel="noopener">CoinGecko</a>' });
		if (cxCache[k]) return draw(cxCache[k], CGN);
		var sp = (c.spark || []).map(function (v, i, a) { return [new Date(Date.now() - (a.length - 1 - i) * 3 * 3600e3).toISOString(), v]; });
		box.innerHTML = '<p class="tu-note">' + T('Loading the chart&hellip;') + '</p>';
		fetch('https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(id) + '/market_chart?vs_currency=usd&days=' + days).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
			var p = (j && j.prices) || [], step = Math.max(1, Math.ceil(p.length / 260)), pts = [];
			p.forEach(function (x, i) { if (i % step === 0 || i === p.length - 1) pts.push([new Date(x[0]).toISOString(), x[1]]); });
			if (pts.length < 2) throw new Error('empty');
			cxCache[k] = pts; draw(pts, CGN);
		}).catch(function () { draw(sp, T('Could not load the longer history right now (CoinGecko limits free requests); showing the last 7 days.')); });
	}
	function closeCx() { var b = $('sg-cx'); if (b.hidden) return; if (document.fullscreenElement === b) document.exitFullscreen().catch(function () {}); b.hidden = true; cxId = null; document.documentElement.classList.remove('sg-cx-open'); if (cxLast) cxLast.focus(); }
	$('sg-coins').addEventListener('click', function (e) { if (e.target.closest('.sg-q, a')) return; var b = e.target.closest('[data-cx]'); if (b) openCx(b.getAttribute('data-cx'), b); });
	$('sg-coins').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-cx]')) { e.preventDefault(); openCx(e.target.getAttribute('data-cx'), e.target); } });
	$('sg-cx-rng').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.cxd = +b.getAttribute('data-d'); save(); cxDraw(); });
	$('sg-cx-x').onclick = closeCx;
	$('sg-cx').addEventListener('click', function (e) { if (e.target === $('sg-cx')) closeCx(); var n = e.target.closest('[data-cxnav]'); if (n) { var ids = (src('coins') || []).map(function (c) { return c.id; }), i = ids.indexOf(cxId); openCx(ids[(i + +n.getAttribute('data-cxnav') + ids.length) % ids.length]); } });
	$('sg-cx-fs').onclick = function () { var b = $('sg-cx'); if (document.fullscreenElement) document.exitFullscreen(); else if (b.requestFullscreen) b.requestFullscreen().then(function () { setTimeout(cxDraw, 120); }).catch(function () {}); };
	if (!document.documentElement.requestFullscreen) $('sg-cx-fs').hidden = true;
	document.addEventListener('fullscreenchange', function () { $('sg-cx-fs').innerHTML = document.fullscreenElement ? '&#10005; ' + T('Exit full screen') : '&#9974; ' + T('Full screen'); if (cxId) setTimeout(cxDraw, 120); });
	document.addEventListener('keydown', function (e) {
		if ($('sg-cx').hidden) return;
		if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); closeCx(); }
		else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input, textarea')) { var ids = (src('coins') || []).map(function (c) { return c.id; }), i = ids.indexOf(cxId); openCx(ids[(i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]); }
	});
	function drawTab(t) { ({ over: drawOver, sent: drawSent, crypto: drawCrypto, mkts: drawMkts, rates: drawRates, pred: drawPred, geo: drawGeo, news: drawNews })[t](); rangeBtns(); }

	// ---------- footer + loading ----------
	var NAMES = { fng: N('Crypto Fear & Greed (alternative.me)'), coins: N('Crypto prices (CoinGecko)'), global: N('Crypto market (CoinGecko)'), stables: N('Stablecoins (CoinGecko)'), halving: N('Bitcoin blocks (mempool.space)'), perps: N('Perps funding and open interest (Hyperliquid)'), markets: N('Stocks, gold, oil, dollar (Yahoo Finance, FRED backup)'), stockfg: N('Stock Fear & Greed inputs (FRED)'), rates: N('US rates (FRED)'), curve: N('Yield curve + recessions (FRED)'), cpi: N('CPI (FRED)'), boc: N('Bank of Canada (Valet)'), ecb: N('ECB'), boe: N('Bank of England'), fed: N('Fed press releases (RSS)'), poly: N('Polymarket'), kalshi: N('Kalshi'), news: N('Crypto news: CoinDesk, Cointelegraph (RSS)'), mnews: N('Markets news: CNBC, MarketWatch, BBC Business (RSS)'), wnews: N('World news: BBC, Al Jazeera, NPR, The Guardian, DW (RSS)'), geo: N('Conflict markets (Polymarket)'), geok: N('Conflict markets (Kalshi)'), etf: N('Bitcoin ETF flows (BGeometrics)'), cot: N('Smart / Dumb Money (CFTC Commitments of Traders)'), lnews: N('News in other languages (BBC World Service, DW, France 24, RSS)') };
	function foot() {
		$('sg-updated').innerHTML = esc(T(MOCK ? 'Sample data saved {t}' : 'Updated {t}', { t: ago(data.generated) })) + ' · ' + T('refreshes every 5 minutes');
		$('sg-srcs').innerHTML = Object.keys(NAMES).filter(function (k) { return data.sources[k] || k !== 'lnews'; }).map(function (k) { var s = data.sources[k]; return '<li class="' + (s && s.ok ? 'ok' : 'bad') + '">' + (s && s.ok ? '&#10003; ' : '&#10007; ') + esc(T(NAMES[k])) + (s && !s.ok ? ' <span class="tu-note">' + esc(s.error) + '</span>' : '') + '</li>'; }).join('');
	}
	function status(m, bad) { var s = $('sg-status'); s.hidden = !m; s.className = 'sg-status' + (bad ? ' err' : ''); s.innerHTML = m || ''; }
	/* Loading: render the last answer this browser saw at once (localStorage, up to 12 h old) so the page is never blank while /api/signals
	   answers; draw the strip + the open tab first and leave the footer, the "since your last visit" box and the other tabs for idle time
	   (other tabs are drawn only when opened). */
	var LAST = KEY + ':last', fresh = false, stale = false;
	var idle = window.requestIdleCallback ? function (f) { requestIdleCallback(f, { timeout: 1200 }); } : function (f) { setTimeout(f, 60); };
	function busy(on) { ['sg-refresh', 'sg-refresh2'].forEach(function (id) { var b = $(id); if (!b) return; b.disabled = on; b.classList.toggle('is-busy', on); }); paintAgo(); }
	function paintAgo() {
		var el = $('sg-ago'); if (!el) return;
		if (!data) { el.innerHTML = loading ? '<span class="sg-spin" aria-hidden="true"></span>' + T('Loading market data&hellip;') : T('No data yet'); return; }
		var old = Date.now() - Date.parse(data.generated) > 15 * 60e3;
		el.classList.toggle('is-old', old && !loading);
		el.innerHTML = (loading ? '<span class="sg-spin" aria-hidden="true"></span>' : '') + esc(T(MOCK ? 'Sample data saved {t}' : stale ? 'Showing the numbers from {t}' : 'Updated {t}', { t: ago(data.generated) })) + (loading ? ' &middot; ' + T('updating&hellip;') : '');
	}
	function render(j) {
		data = j; root.classList.remove('sg-wait');
		strip(); drawTab(st.tab); paintAgo();
		idle(function () { if (data !== j) return; foot(); if (fresh && !j._seen) { j._seen = 1; visitDiff(); markChanged(); } });
	}
	function load(manual) {
		if (loading) return; loading = true; busy(true);
		fetch(MOCK ? '/signals/data/sample.json' : '/api/signals', manual && !MOCK ? { cache: 'reload' } : {}).then(function (r) { if (!r.ok && r.status !== 502) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (txt) {
			var j = JSON.parse(txt);
			loading = false;
			if (!j || !j.sources) throw new Error('bad answer');
			fresh = true; stale = false;
			status(MOCK ? T('Showing <b>sample data</b> saved {d} (preview mode). The live page loads fresh numbers.', { d: esc(dshort(j.generated)) }) : '');
			render(j); busy(false);
			if (!MOCK) idle(function () { try { localStorage.setItem(LAST, txt); } catch (e) {} });
		}).catch(function () {
			loading = false; busy(false);
			if (!data) { $('sg-strip').innerHTML = ''; root.classList.remove('sg-wait'); status(T('Could not load the signals. Check your connection and press Refresh.'), true); }
			else status(esc(T('Refresh failed; showing the numbers from {t}.', { t: ago(data.generated) })), true);
		});
	}
	$('sg-refresh').onclick = function () { load(true); };
	$('sg-refresh2').onclick = function () { load(true); };
	setInterval(paintAgo, 30000);
	setInterval(function () {
		var fo = S.nextFomc(Date.now()); if (fo) { var t = fo.live ? T('this week') : S.countdown(fo.at - Date.now()); if ($('sg-fomc-cd')) $('sg-fomc-cd').textContent = t; if ($('sg-fomc-big')) $('sg-fomc-big').textContent = fo.live ? T('This week') : t; }
	}, 30000);
	setInterval(function () { if (!document.hidden && data && fresh && Date.now() - Date.parse(data.generated) > 5 * 60e3) load(); }, 60000);
	var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (cxId) cxDraw(); [].forEach.call(root.querySelectorAll('.sg-chart'), function (b) { if (b._redraw && b.offsetParent) b._redraw(); }); }, 150); });
	if (window.ResizeObserver) { var lastW = root.clientWidth; new ResizeObserver(function () { if (Math.abs(root.clientWidth - lastW) > 4) { lastW = root.clientWidth; clearTimeout(rz); rz = setTimeout(function () { if (data) drawTab(st.tab); }, 120); } }).observe(root); }
	showTab(st.tab); rangeBtns();
	if (!MOCK) { try { var c = JSON.parse(localStorage.getItem(LAST) || 'null'); if (c && c.sources && Date.now() - Date.parse(c.generated) < 12 * 3600e3) { stale = true; render(c); } } catch (e) {} }
	load();
})();
