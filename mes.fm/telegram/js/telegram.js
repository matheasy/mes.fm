/* MES Telegram Archive helpers (mes.fm/telegram). window.MESTg in the browser, module.exports in node.
 * - parsePage(html): posts of one https://t.me/s/meslinks page (the public web preview), oldest first.
 * - buildData(posts): the chunk files + index written by update_telegram_archive.py (through cli.js).
 * - page helpers: categories, link sites, search / filter / sort, safe text rendering.
 * A byte-identical copy lives at mes.fm/api/_tg-lib.js (used by api/tg-latest.js): after editing run
 *   cp tool_apps_src/telegram/lib.js mes.fm/api/_tg-lib.js
 * (node tool_apps_src/telegram-tests.js checks it).
 *
 * Post shape (compact keys, every field but i/d optional):
 *   i id, d unix seconds, t text (plain; links that are not their own URL are written [label](https://...)),
 *   m media: p photo, v video, d document, o poll, a audio / voice, s sticker, l location; n number of media in an album (>1),
 *   dt document title / poll question, v views, f forwarded-from name, fu its link, r reply-to id (this channel),
 *   pv link preview {u, s site, t title}, th 1 = mes.fm/telegram/thumbs/<id>.webp exists, img live CDN picture (runtime only, never stored),
 *   c category bit mask (written by buildData; the page recomputes it for runtime posts).
 */
(function (root, factory) {
	var api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.MESTg = api;
})(typeof self !== 'undefined' ? self : this, function () {
	'use strict';
	var CHANNEL = 'meslinks', CHUNK = 2000;

	// ---------- HTML -> text ----------
	var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
	function decode(s) {
		return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
			if (e[0] === '#') { var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return m; } }
			var k = e.toLowerCase();
			return Object.prototype.hasOwnProperty.call(ENT, k) ? ENT[k] : m;
		});
	}
	function strip(s) { return decode(String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')); }
	function isHttp(u) { return /^https?:\/\/[^\s<>"']+$/i.test(u); }
	function bare(u) { return String(u).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '').toLowerCase(); }
	// Inner HTML of the element whose opening tag starts at `at` (balanced on the same tag name).
	function inner(html, at, tag) {
		var open = html.indexOf('>', at); if (open < 0) return '';
		var re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'), depth = 1, m;
		re.lastIndex = open + 1;
		while ((m = re.exec(html))) {
			if (m[1]) { if (--depth === 0) return html.slice(open + 1, m.index); }
			else if (!/\/>$/.test(m[0])) depth++;
		}
		return html.slice(open + 1);
	}
	function textOf(h) {
		h = h.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function (m, attrs, body) {
			var href = (/\bhref="([^"]*)"/i.exec(attrs) || [])[1], label = strip(body).replace(/\s+/g, ' ').trim();
			if (!href) return label;
			href = decode(href);
			if (!isHttp(href) || /^[#@$]/.test(label) || !label) return label.replace(/[\[\]]/g, '');
			var bl = bare(label).replace(/(\.\.\.|…)$/, '');
			if (bl && (bare(href) === bl || bare(href).indexOf(bl) === 0) && /[./]/.test(bl)) return href;
			return '[' + label.replace(/[\[\]]/g, '') + '](' + href.replace(/[()\s]/g, encodeURIComponent) + ')';
		});
		return strip(h).replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	}
	function views(s) {
		var m = /^([\d.,]+)\s*([KkMm]?)$/.exec(String(s).trim()); if (!m) return null;
		var n = parseFloat(m[1].replace(/,/g, '')); if (m[2]) n *= /k/i.test(m[2]) ? 1e3 : 1e6;
		return Math.round(n);
	}
	function bgUrl(h) { var m = /background-image:url\('([^']+)'\)/.exec(h || ''); return m && /^https:\/\//.test(m[1]) ? m[1] : null; }
	function cls(h, c) { return h.indexOf('class="' + c) >= 0 || new RegExp('class="[^"]*\\b' + c + '\\b').test(h); }
	function after(h, c) { var i = h.search(new RegExp('class="[^"]*\\b' + c + '\\b')); return i < 0 ? -1 : h.lastIndexOf('<', i); }

	// One message block (the part after "tgme_widget_message_wrap") -> post or null.
	function parseMessage(h, channel) {
		channel = channel || CHANNEL;
		var idm = new RegExp('data-post="' + channel + '/(\\d+)"', 'i').exec(h); if (!idm) return null;
		h = h.replace(/<svg[\s\S]*?<\/svg>/gi, '');
		var p = { i: +idm[1] };
		var tm = /<time datetime="([^"]+)"/.exec(h); if (tm) { var t = Date.parse(tm[1]); if (!isNaN(t)) p.d = Math.round(t / 1000); }
		// reply (remove its block so its text / picture are not taken for the post's own)
		var ri = after(h, 'tgme_widget_message_reply');
		if (ri >= 0) {
			var rh = /<a[^>]*href="https:\/\/t\.me\/([^/"]+)\/(\d+)/i.exec(h.slice(ri, ri + 400));
			if (rh && rh[1].toLowerCase() === channel.toLowerCase()) p.r = +rh[2];
			var rend = h.indexOf('</a>', h.indexOf('js-message_reply_text', ri)); if (rend > 0) h = h.slice(0, ri) + h.slice(rend + 4);
		}
		var fi = after(h, 'tgme_widget_message_forwarded_from');
		if (fi >= 0) {
			var fh = inner(h, fi, 'div');
			var fn = /<(a|span)\b([^>]*class="tgme_widget_message_forwarded_from_name"[^>]*)>([\s\S]*?)<\/\1>/i.exec(fh);
			var nm = fn ? strip(fn[3]).replace(/\s+/g, ' ').trim() : strip(fh).replace(/^Forwarded from\s*/i, '').trim();
			if (nm) p.f = nm.slice(0, 120);
			var fhref = fn && /\bhref="([^"]*)"/.exec(fn[2]);
			if (fhref && isHttp(decode(fhref[1]))) p.fu = decode(fhref[1]);
			var fe = h.indexOf('>', fi) + 1 + fh.length; h = h.slice(0, fi) + h.slice(h.indexOf('</div>', fe) + 6);
		}
		var ti = after(h, 'js-message_text');
		if (ti >= 0) { var tx = textOf(inner(h, ti, 'div')); if (tx) p.t = tx; }
		var photos = (h.match(/class="tgme_widget_message_photo_wrap\b/g) || []).length;
		var videos = (h.match(/class="tgme_widget_message_(?:video|roundvideo)_player\b/g) || []).length;
		var img = null;
		if (photos) { var pi = h.search(/class="tgme_widget_message_photo_wrap\b/); img = bgUrl(h.slice(pi, pi + 900)); }
		if (videos) { var vi = h.search(/tgme_widget_message_(?:video|roundvideo)_thumb/); if (!img && vi >= 0) img = bgUrl(h.slice(vi, vi + 900)); }
		if (photos || videos) { p.m = photos >= videos ? 'p' : 'v'; if (photos + videos > 1) p.n = photos + videos; if (videos && photos) p.m = videos > photos ? 'v' : 'p'; }
		else if (cls(h, 'tgme_widget_message_poll')) { p.m = 'o'; var q = /class="tgme_widget_message_poll_question"[^>]*>([\s\S]*?)<\/div>/.exec(h); if (q) p.dt = strip(q[1]).trim().slice(0, 200); }
		else if (cls(h, 'tgme_widget_message_document')) { p.m = 'd'; var dt = /class="tgme_widget_message_document_title[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(h); if (dt) p.dt = strip(dt[1]).trim().slice(0, 200); }
		else if (cls(h, 'tgme_widget_message_voice') || cls(h, 'tgme_widget_message_audio')) p.m = 'a';
		else if (cls(h, 'tgme_widget_message_sticker')) p.m = 's';
		else if (cls(h, 'tgme_widget_message_location')) p.m = 'l';
		var li = after(h, 'tgme_widget_message_link_preview');
		if (li >= 0) {
			var lh = h.slice(li, li + 4000), lu = /href="([^"]+)"/.exec(lh);
			var pv = {};
			if (lu && isHttp(decode(lu[1]))) pv.u = decode(lu[1]);
			var s1 = /class="link_preview_site_name[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(lh); if (s1) pv.s = strip(s1[1]).trim().slice(0, 60);
			var t1 = /class="link_preview_title"[^>]*>([\s\S]*?)<\/div>/.exec(lh); if (t1) pv.t = strip(t1[1]).trim().slice(0, 200);
			if (pv.u) p.pv = pv;
			if (!img) { var pim = /link_preview_(?:right_)?image"[^>]*style="[^"]*background-image:url\('([^']+)'/.exec(lh); if (pim && /^https:\/\//.test(pim[1])) img = pim[1]; }
		}
		var vm = /class="tgme_widget_message_views">([^<]*)</.exec(h); if (vm) { var vv = views(vm[1]); if (vv != null) p.v = vv; }
		if (img) p.img = img;
		return p;
	}
	// A whole https://t.me/s/<channel> page -> {posts (oldest first), before (next older page) or null}.
	function parsePage(html, channel) {
		html = String(html || '');
		var parts = html.split(/<div class="tgme_widget_message_wrap\b/), posts = [];
		for (var k = 1; k < parts.length; k++) { var p = parseMessage(parts[k], channel); if (p) posts.push(p); }
		posts.sort(function (a, b) { return a.i - b.i; });
		var bm = /class="tme_messages_more[^"]*"\s+data-before="(\d+)"/.exec(html) || /data-before="(\d+)"/.exec(html);
		return { posts: posts, before: bm ? +bm[1] : (posts.length ? posts[0].i : null) };
	}

	// ---------- links ----------
	var SITES = [
		{ k: 'mes', name: 'MES.fm', re: /^https?:\/\/([a-z0-9-]+\.)*mes\.fm(\/|$)/i },
		{ k: 'yt', name: 'YouTube', re: /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i },
		{ k: 'hive', name: 'Hive', re: /^https?:\/\/(www\.)?(peakd\.com|hive\.blog|ecency\.com|inleo\.io|leofinance\.io|3speak\.tv|3speak\.online|hive\.vote|stemgeeks\.net|liketu\.com)\//i },
		{ k: 'x', name: 'X', re: /^https?:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\//i },
		{ k: 'rum', name: 'Rumble', re: /^https?:\/\/(www\.)?rumble\.com\//i },
		{ k: 'ody', name: 'Odysee', re: /^https?:\/\/(www\.)?(odysee\.com|lbry\.tv)\//i },
		{ k: 'bc', name: 'BitChute', re: /^https?:\/\/(www\.)?bitchute\.com\//i },
		{ k: 'tg', name: 'Telegram', re: /^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i },
	];
	var MD = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)/g, URL_RE = /https?:\/\/[^\s<>"'\])]+/g;
	function trimUrl(u) { return u.replace(/[.,;:!?]+$/, ''); }
	function links(p) {
		var out = [], seen = {}, t = p.t || '', m;
		function add(u) { u = trimUrl(u); if (!isHttp(u) || seen[u]) return; seen[u] = 1; out.push(u); }
		MD.lastIndex = 0; while ((m = MD.exec(t))) add(m[2]);
		var rest = t.replace(MD, ' ');
		URL_RE.lastIndex = 0; while ((m = URL_RE.exec(rest))) add(m[0]);
		if (p.pv && p.pv.u) add(p.pv.u);
		return out;
	}
	function siteOf(u) { for (var k = 0; k < SITES.length; k++) if (SITES[k].re.test(u)) return SITES[k].k; return 'web'; }
	function sitesOf(p) { var o = {}; links(p).forEach(function (u) { var s = siteOf(u); if (s !== 'tg' || !/t\.me\/meslinks\//i.test(u)) o[s] = 1; }); return Object.keys(o); }
	function ytId(u) {
		var m = /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u) || /youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{11})/.exec(u);
		return m ? m[1] : null;
	}
	function firstYt(p) { var l = links(p); for (var k = 0; k < l.length; k++) { var id = ytId(l[k]); if (id) return id; } return null; }
	function postUrl(p) { return 'https://t.me/' + CHANNEL + '/' + p.i; }

	// ---------- topics ----------
	// Order is the bit order of p.c: append new topics at the END (the data files store the mask).
	var CATS = [
		{ id: 's911', label: '9/11 Truth', re: /9\/11|\b911\b|#?911truth|judy ?wood|wheredidthetowersgo|\bwtc\b|twin towers|towers|thermite|toasted cars|dustification|\bkeor\b/i },
		{ id: 'hut', label: 'Hutchison Effect', re: /hutchison|hathaway|ferrocell/i },
		{ id: 'math', label: 'Math', re: /\bmath|calculus|problems plus|derivative|integral|equation|algebra|geometry|trigonometr|\bstem\b|#education|theorem|polynomial|matrix|vector|q\/a \d|calculator/i },
		{ id: 'sci', label: 'Science & Free Energy', re: /physics|science|experiment|free energy|cold fusion|\blenr\b|anti-?gravity|aether|tesla|magnet|gyroscope|electromagnet|quantum|relativity|michelson|scalar|\bplasma\b|nikola/i },
		{ id: 'live', label: 'Livestreams', re: /livestream|live stream|\blive now\b|going live|youtube\.com\/live\/|premieres?\b|starting soon/i },
		{ id: 'crypto', label: 'Crypto & Hive', re: /\bhive\b|peakd|hive\.blog|ecency|inleo|leofinance|3speak|bitcoin|\bbtc\b|crypto|\bxrp\b|ripple|steem|blockchain|\beth\b|ethereum|\bnft|defi|\bleo\b/i },
		{ id: 'health', label: 'Health & COVID', re: /covid|vaccin|\bvax|mrna|pfizer|moderna|pandemic|lockdown|\bmasks?\b|virus|plandemic|\bgnm\b|german new medicine|health|cancer|fluorid/i },
		{ id: 'pol', label: 'Politics', re: /trump|biden|kamala|harris|election|\bvot(e|ing)\b|democrat|republican|trudeau|poilievre|politic|congress|senate|\bmaga\b|putin|ukraine|israel|gaza|\biran\b|netanyahu|\bwar\b/i },
		{ id: 'consp', label: 'Conspiracy & Space', re: /conspiracy|\bnasa\b|flat earth|moon landing|\bufo|\buap\b|alien|psyop|mh370|\bcia\b|\bfbi\b|epstein|pizzagate|globalist|\bwef\b|chemtrail|false flag|deep state|occult/i },
		{ id: 'spooks', label: 'Spooks & Shills', re: /greenyer|\bspook|shill|controlled opposition|gatekeep|fetzer|disinfo/i },
		{ id: 'ai', label: 'AI & Tech', re: /\bai\b|chatgpt|openai|\bgrok\b|gemini|claude|\bllm\b|elon|musk|twitter|\bx\.com|robot|software|computer|iphone|android|\bapp\b/i },
		{ id: 'meme', label: 'Memes & Fun', re: /\bmemes?\b|\blol\b|lmao|\bhaha|funny|joke|🤣|😂|🤡|😆/i },
		{ id: 'sport', label: 'Sports', re: /\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|basketball|football|soccer|hockey|olympic|lakers|warriors|curry|lebron|\bufc\b|tennis|golf/i },
		{ id: 'mesfm', label: 'MES.fm pages', test: function (p) { return sitesOf(p).indexOf('mes') >= 0; } },
	];
	function haystack(p) { return [p.t || '', p.dt || '', p.f || '', p.pv ? (p.pv.t || '') + ' ' + (p.pv.s || '') + ' ' + (p.pv.u || '') : ''].join(' \n '); }
	function catMask(p) {
		var h = haystack(p), m = 0;
		CATS.forEach(function (c, k) { if (c.test ? c.test(p) : c.re.test(h)) m |= 1 << k; });
		return m;
	}
	var MEDIA = [
		{ k: 'p', name: 'Photos' }, { k: 'v', name: 'Videos' }, { k: 'd', name: 'Files' }, { k: 'o', name: 'Polls' },
		{ k: 'a', name: 'Audio' }, { k: 's', name: 'Stickers' }, { k: 'l', name: 'Locations' }, { k: 'x', name: 'Text only' },
	];
	function mediaKey(p) { return p.m || 'x'; }
	function yearOf(p) { return p.d ? new Date(p.d * 1000).getUTCFullYear() : 0; }

	// ---------- data files ----------
	function clean(p) {
		var o = { i: p.i };
		['d', 't', 'm', 'n', 'dt', 'v', 'f', 'fu', 'r', 'pv', 'th'].forEach(function (k) { if (p[k] != null && p[k] !== '') o[k] = p[k]; });
		o.c = catMask(o);
		return o;
	}
	// posts (any order, duplicates allowed: the later one wins) -> {index, chunks: [{file, data}]}
	function buildData(posts, opt) {
		opt = opt || {};
		var by = {};
		posts.forEach(function (p) { if (p && p.i) by[p.i] = p; });
		var list = Object.keys(by).map(function (k) { return clean(by[k]); }).sort(function (a, b) { return a.i - b.i; });
		var chunks = [], idx = { v: 1, channel: CHANNEL, generated: opt.generated || new Date().toISOString(), count: list.length, newest: list.length ? list[list.length - 1].i : 0, oldest: list.length ? list[0].i : 0, chunk: CHUNK, chunks: [], years: {}, media: {}, cats: {}, sites: {} };
		list.forEach(function (p) {
			var y = yearOf(p); idx.years[y] = (idx.years[y] || 0) + 1;
			var mk = mediaKey(p); idx.media[mk] = (idx.media[mk] || 0) + 1;
			CATS.forEach(function (c, k) { if (p.c & (1 << k)) idx.cats[c.id] = (idx.cats[c.id] || 0) + 1; });
			sitesOf(p).forEach(function (s) { idx.sites[s] = (idx.sites[s] || 0) + 1; });
		});
		for (var k = 0; k * CHUNK < list.length; k++) {
			var part = list.slice(k * CHUNK, (k + 1) * CHUNK), f = 'c' + k + '.json';
			chunks.push({ file: f, data: { v: 1, posts: part } });
			idx.chunks.push({ f: f, n: part.length, a: part[0].i, b: part[part.length - 1].i, d0: part[0].d || 0, d1: part[part.length - 1].d || 0 });
		}
		return { index: idx, chunks: chunks };
	}

	// ---------- page: search / filter / sort ----------
	function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
	function searchText(p) { if (p._s == null) p._s = norm(haystack(p)); return p._s; }
	function parseQuery(search) {
		var q = {}; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='), k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)), v = i < 0 ? '' : kv.slice(i + 1); try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { } q[k] = v; });
		var st = { q: q.q || '', c: q.c || '', m: q.m || '', s: q.s || '', y: /^\d{4}$/.test(q.y || '') ? q.y : '', sort: /^(old|views)$/.test(q.sort || '') ? q.sort : 'new', view: q.view === 'list' ? 'list' : 'grid', pg: Math.max(1, parseInt(q.pg, 10) || 1) };
		return st;
	}
	function toQuery(st) {
		var a = [];
		if (st.q) a.push('q=' + encodeURIComponent(st.q));
		['c', 'm', 's', 'y'].forEach(function (k) { if (st[k]) a.push(k + '=' + encodeURIComponent(st[k])); });
		if (st.sort && st.sort !== 'new') a.push('sort=' + st.sort);
		if (st.view === 'list') a.push('view=list');
		if (st.pg > 1) a.push('pg=' + st.pg);
		return a.length ? '?' + a.join('&') : '';
	}
	// Does the filter need more than the newest chunk? (Plain newest-first browsing of the first pages does not.)
	function needsAll(st) { return !!(st.q || st.c || st.m || st.s || st.y || st.sort !== 'new'); }
	function catBit(id) { for (var k = 0; k < CATS.length; k++) if (CATS[k].id === id) return 1 << k; return 0; }
	function matcher(st, skip) {
		var words = norm(st.q).split(/\s+/).filter(Boolean), idq = /^#(\d+)$/.exec(String(st.q).trim());
		var cb = st.c && st.c !== 'other' ? catBit(st.c) : 0;
		return function (p) {
			if (idq) return p.i === +idq[1];
			if (skip !== 'c' && st.c) { if (st.c === 'other' ? p.c : !(p.c & cb)) return false; }
			if (skip !== 'm' && st.m && mediaKey(p) !== st.m) return false;
			if (skip !== 'y' && st.y && String(yearOf(p)) !== st.y) return false;
			if (skip !== 's' && st.s) { if (p._sites == null) p._sites = sitesOf(p); if (p._sites.indexOf(st.s) < 0) return false; }
			if (words.length) { var h = searchText(p); for (var k = 0; k < words.length; k++) if (h.indexOf(words[k]) < 0) return false; }
			return true;
		};
	}
	function filter(posts, st) { return posts.filter(matcher(st)); }
	function sortPosts(list, sort) {
		var a = list.slice();
		if (sort === 'old') a.sort(function (x, y) { return x.i - y.i; });
		else if (sort === 'views') a.sort(function (x, y) { return (y.v || 0) - (x.v || 0) || y.i - x.i; });
		else a.sort(function (x, y) { return y.i - x.i; });
		return a;
	}
	// Chip counts: each group counted with every other filter applied.
	function counts(posts, st) {
		var out = { c: {}, m: {}, s: {}, y: {} }, mc = matcher(st, 'c'), mm = matcher(st, 'm'), ms = matcher(st, 's'), my = matcher(st, 'y');
		posts.forEach(function (p) {
			if (mc(p)) { if (!p.c) out.c.other = (out.c.other || 0) + 1; else CATS.forEach(function (c, k) { if (p.c & (1 << k)) out.c[c.id] = (out.c[c.id] || 0) + 1; }); }
			if (mm(p)) { var mk = mediaKey(p); out.m[mk] = (out.m[mk] || 0) + 1; }
			if (ms(p)) { if (p._sites == null) p._sites = sitesOf(p); p._sites.forEach(function (s) { out.s[s] = (out.s[s] || 0) + 1; }); }
			if (my(p)) { var y = yearOf(p); out.y[y] = (out.y[y] || 0) + 1; }
		});
		return out;
	}
	function page(list, pg, per) { var pages = Math.max(1, Math.ceil(list.length / per)); pg = Math.min(Math.max(1, pg || 1), pages); return { pg: pg, pages: pages, items: list.slice((pg - 1) * per, pg * per) }; }

	// ---------- safe rendering ----------
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function a(u, label) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener nofollow ugc">' + esc(label) + '</a>'; }
	function shortUrl(u) { var b = u.replace(/^https?:\/\/(www\.)?/i, ''); return b.length > 48 ? b.slice(0, 45) + '…' : b; }
	// Text -> HTML: everything escaped; [label](https://...) and bare http(s) URLs become links; new lines kept as <br>.
	function textHtml(t, maxLen) {
		t = String(t || '');
		var cut = false;
		if (maxLen && t.length > maxLen) { t = t.slice(0, maxLen); var sp = t.lastIndexOf(' '); if (sp > maxLen - 40) t = t.slice(0, sp); cut = true; }
		var out = '', last = 0, re = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"'\])]+/g, m;
		function plain(s) { return esc(s).replace(/\n/g, '<br>'); }
		while ((m = re.exec(t))) {
			out += plain(t.slice(last, m.index));
			if (m[1]) out += a(m[2], m[1]);
			else { var u = trimUrl(m[0]); out += a(u, shortUrl(u)) + plain(m[0].slice(u.length)); }
			last = re.lastIndex;
		}
		out += plain(t.slice(last));
		return out + (cut ? '…' : '');
	}
	function fmtViews(n) { return n == null ? '' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n); }
	var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function fmtDate(d) { if (!d) return ''; var x = new Date(d * 1000); return MON[x.getUTCMonth()] + ' ' + x.getUTCDate() + ', ' + x.getUTCFullYear(); }

	return {
		CHANNEL: CHANNEL, CHUNK: CHUNK, CATS: CATS, SITES: SITES, MEDIA: MEDIA,
		decode: decode, textOf: textOf, views: views, parseMessage: parseMessage, parsePage: parsePage,
		links: links, siteOf: siteOf, sitesOf: sitesOf, ytId: ytId, firstYt: firstYt, postUrl: postUrl,
		catMask: catMask, mediaKey: mediaKey, yearOf: yearOf, clean: clean, buildData: buildData,
		norm: norm, parseQuery: parseQuery, toQuery: toQuery, needsAll: needsAll, filter: filter, sortPosts: sortPosts, counts: counts, page: page,
		esc: esc, textHtml: textHtml, shortUrl: shortUrl, fmtViews: fmtViews, fmtDate: fmtDate,
	};
});

/* MES Telegram Archive page (mes.fm/telegram). Data: /telegram/data/index.json + c<k>.json (update_telegram_archive.py);
 * newest posts after the snapshot: /api/tg-latest. Helpers: MESTg (lib.js). */
(function () {
	'use strict';
	var T = window.MESTg, root = document.getElementById('tga');
	if (!T || !root) return;
	function $(id) { return document.getElementById(id); }
	var esc = T.esc, KEY = 'mes-telegram:v1', LKEY = 'mes-telegram:latest', PER = { grid: 36, list: 60 };
	// view options (this browser only): layout, columns, card size, text, pictures, compact, per page
	var opt = { lay: 'mas', cols: 0, size: 'm', txt: 'short', pics: 1, compact: 0, per: { grid: 36, list: 60 } }, SIZE_EM = { s: 13, m: 17, l: 23 };
	var idx = null, chunks = {}, posts = [], allLoaded = false, loading = null, fresh = [], st = T.parseQuery(location.search), shown = [], open = {};
	try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); if (!/[?&]view=/.test(location.search) && saved.view) st.view = saved.view;
		if (saved.o) {
			var o = saved.o;
			if (/^(mas|rows)$/.test(o.lay)) opt.lay = o.lay;
			if (o.cols >= 0 && o.cols <= 8) opt.cols = o.cols | 0;
			if (SIZE_EM[o.size]) opt.size = o.size;
			if (/^(short|full|none)$/.test(o.txt)) opt.txt = o.txt;
			opt.pics = o.pics === 0 ? 0 : 1; opt.compact = o.compact ? 1 : 0;
			if (o.per) ['grid', 'list'].forEach(function (k) { if ([24, 36, 60, 120].indexOf(o.per[k]) >= 0) opt.per[k] = o.per[k]; });
		}
	} catch (e) { }
	PER = opt.per;
	var SITE_NAME = {}; T.SITES.forEach(function (s) { SITE_NAME[s.k] = s.name; });
	var PILLS = ['mes', 'yt', 'hive', 'x', 'rum', 'ody', 'bc'];
	var MEDIA_NAME = { p: 'Photo', v: 'Video', d: 'File', o: 'Poll', a: 'Audio', s: 'Sticker', l: 'Location' };

	function toast(msg) { var t = $('tga-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2200); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy'); } ta.remove(); }
	}
	function syncUrl(push) {
		var u = location.pathname + T.toQuery(st) + location.hash;
		if (u !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState'](null, '', u);
		try { localStorage.setItem(KEY, JSON.stringify({ view: st.view, o: opt })); } catch (e) { }
	}

	// ---------- data ----------
	function getChunk(k) {
		if (chunks[k]) return Promise.resolve(chunks[k]);
		return fetch('/telegram/data/' + idx.chunks[k].f + '?v=' + encodeURIComponent(idx.generated)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { chunks[k] = d.posts; return d.posts; });
	}
	function rebuild() {
		var list = [], have = {};
		fresh.forEach(function (p) { if (!have[p.i]) { have[p.i] = 1; list.push(p); } });
		Object.keys(chunks).forEach(function (k) { chunks[k].forEach(function (p) { if (!have[p.i]) { have[p.i] = 1; list.push(p); } }); });
		posts = list;
		allLoaded = Object.keys(chunks).length === idx.chunks.length;
	}
	// Load every chunk (newest first) with a progress bar.
	function loadAll() {
		if (allLoaded) return Promise.resolve();
		if (loading) return loading;
		var n = idx.chunks.length, done = Object.keys(chunks).length, box = $('tga-load');
		box.hidden = false;
		function step() { $('tga-barin').style.width = Math.round(done / n * 100) + '%'; $('tga-loadt').textContent = 'Loading every post… ' + Math.round(done / n * 100) + '%'; }
		step();
		var seq = Promise.resolve();
		for (var k = n - 1; k >= 0; k--) (function (k) { seq = seq.then(function () { if (chunks[k]) return; return getChunk(k).then(function () { done++; step(); }); }); })(k);
		loading = seq.then(function () { rebuild(); box.hidden = true; loading = null; }, function (e) { loading = null; $('tga-loadt').textContent = 'Could not load every post. Please reload the page.'; throw e; });
		return loading;
	}
	// Newest-first browsing only: make sure enough chunks are there for page pg.
	function loadFor(pg) {
		var per = PER[st.view], need = pg * per, have = posts.length, k = idx.chunks.length - 1;
		var seq = Promise.resolve();
		while (have < need && k >= 0) { if (!chunks[k]) { (function (k) { seq = seq.then(function () { return getChunk(k); }); })(k); have += idx.chunks[k].n; } k--; }
		return seq.then(rebuild);
	}

	// ---------- render ----------
	function chip(k, label, n, on, cls) {
		return '<button type="button" class="tu-chip' + (cls ? ' ' + cls : '') + '" data-k="' + esc(k) + '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (n === 0 && !on ? ' disabled' : '') + '>' + esc(label) + (n != null ? ' <span class="tga-n">' + n.toLocaleString('en-US') + '</span>' : '') + '</button>';
	}
	function drawChips() {
		var c;
		if (allLoaded) c = T.counts(posts, st);
		else c = { c: idx.cats, s: idx.sites, y: idx.years, m: idx.media };
		var other = allLoaded ? (c.c.other || 0) : null;
		$('tga-cats').innerHTML = T.CATS.map(function (x) { return chip(x.id, x.label, c.c[x.id] || 0, st.c === x.id); }).join('') + chip('other', 'Everything else', other, st.c === 'other');
		$('tga-sites').innerHTML = PILLS.map(function (k) { return chip(k, SITE_NAME[k], c.s[k] || 0, st.s === k, 'tga-pc tga-p-' + k); }).join('');
		var yrs = Object.keys(c.y).filter(function (y) { return +y; }).sort().reverse();
		if (st.y && yrs.indexOf(st.y) < 0) yrs.unshift(st.y);
		$('tga-yr').innerHTML = '<option value="">All years</option>' + yrs.map(function (y) { return '<option value="' + y + '"' + (y === st.y ? ' selected' : '') + '>' + y + ' (' + (c.y[y] || 0).toLocaleString('en-US') + ')</option>'; }).join('');
		$('tga-media').innerHTML = '<option value="">Everything</option>' + T.MEDIA.map(function (m) { var n = c.m[m.k] || 0; return n || st.m === m.k ? '<option value="' + m.k + '"' + (st.m === m.k ? ' selected' : '') + '>' + m.name + ' (' + n.toLocaleString('en-US') + ')</option>' : ''; }).join('');
	}
	function thumb(p) {
		var src = '', yt = null;
		if (p._new && p.img) src = p.img;
		else if (p.th) src = '/telegram/thumbs/' + p.i + '.webp';
		else if ((yt = T.firstYt(p))) src = 'https://i.ytimg.com/vi/' + yt + '/mqdefault.jpg';
		var label = MEDIA_NAME[p.m] ? MEDIA_NAME[p.m] + (p.n > 1 ? ' · ' + p.n : '') : '';
		if (!src && !label) return '';
		var inner = src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async"' + (yt ? ' width="320" height="180"' : '') + '>' : '<span class="tga-noimg">' + esc(label) + '<small>open on Telegram</small></span>';
		return '<a class="tga-th' + (yt && !p.th && !(p._new && p.img) ? ' tga-th--yt' : '') + '" href="' + esc(T.postUrl(p)) + '" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">' + inner + (src && label ? '<span class="tga-mt">' + esc(label) + '</span>' : '') + '</a>';
	}
	function pills(p) {
		var by = {};
		T.links(p).forEach(function (u) { var s = T.siteOf(u); if (PILLS.indexOf(s) >= 0 && !by[s]) by[s] = u; });
		return '<a class="tga-pl tga-p-tg" href="' + esc(T.postUrl(p)) + '" target="_blank" rel="noopener">Telegram</a>' +
			PILLS.filter(function (s) { return by[s]; }).map(function (s) { return '<a class="tga-pl tga-p-' + s + '" href="' + esc(by[s]) + '" target="_blank" rel="noopener">' + esc(SITE_NAME[s]) + '</a>'; }).join('');
	}
	function meta(p) {
		var a = ['<a href="' + esc(T.postUrl(p)) + '" target="_blank" rel="noopener">#' + p.i + '</a>'];
		if (p.d) a.push(esc(T.fmtDate(p.d)));
		if (p.v != null) a.push(esc(T.fmtViews(p.v)) + ' views');
		if (p.r) a.push('<a href="https://t.me/meslinks/' + p.r + '" target="_blank" rel="noopener">↩ reply to #' + p.r + '</a>');
		return a.join(' · ');
	}
	function body(p) {
		var max = st.view === 'list' ? 700 : 320, h = '';
		if (opt.txt === 'full') max = 1e9;
		if (p._new) h += '<span class="tga-badge">New</span> ';
		if (p.f) h += '<div class="tga-fw">Forwarded from ' + (p.fu ? '<a href="' + esc(p.fu) + '" target="_blank" rel="noopener nofollow">' + esc(p.f) + '</a>' : esc(p.f)) + '</div>';
		if (p.dt) h += '<div class="tga-dt">' + (p.m === 'o' ? '📊 ' : '📄 ') + esc(p.dt) + '</div>';
		if (p.t && opt.txt === 'none') { }
		else if (p.t) {
			var long = p.t.length > max + 20, full = open[p.i];
			h += '<div class="tga-text">' + T.textHtml(p.t, long && !full ? max : 0) + '</div>';
			if (long) h += '<button type="button" class="tga-more" data-i="' + p.i + '">' + (full ? 'Show less' : 'Show more') + '</button>';
		} else if (!p.dt && opt.txt !== 'none') h += '<div class="tga-text tga-empty">' + esc(MEDIA_NAME[p.m] || 'Post') + ' without text</div>';
		if (p.pv && (p.pv.t || p.pv.s)) h += '<a class="tga-pv" href="' + esc(p.pv.u) + '" target="_blank" rel="noopener nofollow ugc">' + (p.pv.s ? '<b>' + esc(p.pv.s) + '</b>' : '') + (p.pv.t ? '<span>' + esc(p.pv.t) + '</span>' : '') + '</a>';
		return h;
	}
	// ---------- grid layout ----------
	function colCount(W) {
		var em = parseFloat(getComputedStyle($('tga-res')).fontSize) || 16;
		var n = opt.cols || Math.floor((W + 0.9 * em) / ((SIZE_EM[opt.size] + 0.9) * em));
		return Math.max(1, Math.min(n, Math.floor(W / (10 * em)) || 1));   // never thinner than ~10em on a phone
	}
	var lastW = 0, lt = 0;
	function layout(fresh) {
		var g = $('tga-items'); if (!g || st.view !== 'grid') return;
		var W = g.clientWidth; if (!W) return;
		var n = colCount(W); lastW = W;
		g.style.setProperty('--tga-n', n);
		if (!g.classList.contains('tga-grid--mas')) { g.style.height = ''; return; }
		var gap = (parseFloat(getComputedStyle(g).fontSize) || 16) * (opt.compact ? 0.5 : 0.9);
		var cw = (W - gap * (n - 1)) / n, kids = g.children, hs = [], i, tops = [];
		for (i = 0; i < n; i++) tops.push(0);
		for (i = 0; i < kids.length; i++) kids[i].style.width = cw + 'px';
		for (i = 0; i < kids.length; i++) hs.push(kids[i].offsetHeight);   // one reflow for all
		for (i = 0; i < kids.length; i++) {
			var c = 0; for (var k = 1; k < n; k++) if (tops[k] < tops[c] - 1) c = k;   // shortest column, leftmost on ties
			kids[i].style.left = (c * (cw + gap)) + 'px'; kids[i].style.top = tops[c] + 'px';
			tops[c] += hs[i] + gap;
		}
		g.style.height = Math.max(0, Math.max.apply(null, tops) - gap) + 'px';
		if (!fresh) g.classList.add('tga-ready'); else { g.classList.remove('tga-ready'); }
	}
	function relayout() { cancelAnimationFrame(lt); lt = requestAnimationFrame(function () { layout(false); }); }
	if (window.ResizeObserver) new ResizeObserver(function () { var g = $('tga-items'); if (g && g.clientWidth !== lastW) relayout(); }).observe($('tga-res'));
	else window.addEventListener('resize', relayout);
	$('tga-res').addEventListener('load', function (e) { if (e.target.tagName === 'IMG') relayout(); }, true);
	if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', relayout);
	function drawOpts() {
		var o = $('tga-opts'); o.dataset.v = st.view; o.dataset.auto = opt.cols ? '0' : '1';
		$('tga-lay').value = opt.lay; $('tga-cols').value = String(opt.cols); $('tga-size').value = opt.size;
		$('tga-txt').value = opt.txt; $('tga-per').value = String(opt.per[st.view]); $('tga-pics').checked = !!opt.pics; $('tga-compact').checked = !!opt.compact;
	}
	function setOpt(fn) { var first = (st.pg - 1) * PER[st.view]; fn(); st.pg = Math.floor(first / PER[st.view]) + 1; update(false, true); }
	$('tga-lay').addEventListener('change', function () { var v = this.value; setOpt(function () { opt.lay = v; }); });
	$('tga-cols').addEventListener('change', function () { var v = +this.value; setOpt(function () { opt.cols = v; }); });
	$('tga-size').addEventListener('change', function () { var v = this.value; setOpt(function () { opt.size = v; }); });
	$('tga-txt').addEventListener('change', function () { var v = this.value; setOpt(function () { opt.txt = v; }); });
	$('tga-per').addEventListener('change', function () { var v = +this.value; setOpt(function () { opt.per[st.view] = v; }); });
	$('tga-pics').addEventListener('change', function () { var v = this.checked ? 1 : 0; setOpt(function () { opt.pics = v; }); });
	$('tga-compact').addEventListener('change', function () { var v = this.checked ? 1 : 0; setOpt(function () { opt.compact = v; }); });

	function render() {
		var partial = T.needsAll(st) && !allLoaded;
		var list = T.sortPosts(T.filter(posts, st), st.sort), per = PER[st.view];
		shown = list;
		var total = allLoaded || T.needsAll(st) ? list.length : idx.count + fresh.filter(function (p) { return p._new; }).length;
		var pages = Math.max(1, Math.ceil(total / per));
		st.pg = Math.min(Math.max(1, st.pg), pages);
		if (!partial && !allLoaded && st.pg * per > posts.length) { loadFor(st.pg).then(render); }
		var items = list.slice((st.pg - 1) * per, st.pg * per), h;
		if (!items.length) h = partial ? '<p class="tga-empty">Searching every post…</p>' : '<p class="tga-empty">No post matches. <button type="button" class="tu-btn tu-btn--ghost" id="tga-clear2">Clear the filters</button></p>';
		else h = '<div class="tga-' + st.view + (st.view === 'grid' && opt.lay === 'mas' ? ' tga-grid--mas' : '') + (opt.compact ? ' tga-compact' : '') + '" id="tga-items">' + items.map(function (p) {
			return '<article class="tga-item' + (p._new ? ' tga-item--new' : '') + '">' + (opt.pics ? thumb(p) : '') + '<div class="tga-body"><div class="tga-meta">' + meta(p) + '</div>' + body(p) + '<div class="tga-pls">' + pills(p) + '</div></div></article>';
		}).join('') + '</div>';
		$('tga-res').innerHTML = h;
		drawOpts(); layout(true);
		var pg = '';
		if (pages > 1) pg = '<button type="button" class="tu-btn tu-btn--ghost" data-pg="' + (st.pg - 1) + '"' + (st.pg === 1 ? ' disabled' : '') + '>‹ Previous</button><span class="tga-pgn">Page ' + st.pg.toLocaleString('en-US') + ' of ' + pages.toLocaleString('en-US') + '</span><button type="button" class="tu-btn tu-btn--ghost" data-pg="' + (st.pg + 1) + '"' + (st.pg === pages ? ' disabled' : '') + '>Next ›</button>';
		$('tga-pager').innerHTML = pg;
		var all = idx.count + fresh.filter(function (p) { return p._new; }).length;
		$('tga-sum').innerHTML = (T.needsAll(st) ? '<b>' + (partial ? '…' : total.toLocaleString('en-US')) + '</b> of ' : '<b>' + all.toLocaleString('en-US') + '</b> posts · ') +
			(T.needsAll(st) ? all.toLocaleString('en-US') + ' posts · ' : '') + 'from <a href="https://t.me/meslinks" target="_blank" rel="noopener">t.me/meslinks</a> · <span class="tga-upd">archive updated ' + esc(T.fmtDate(Date.parse(idx.generated) / 1000)) + '</span>';
		if (document.activeElement !== $('tga-q') && $('tga-q').value !== st.q) $('tga-q').value = st.q;
		$('tga-sort').value = st.sort;
		[].forEach.call($('tga-views').children, function (b) { b.setAttribute('aria-pressed', b.dataset.v === st.view ? 'true' : 'false'); });
		drawChips();
		if (partial) loadAll().then(render, function () { });
	}
	function update(push, keepPage) { if (!keepPage) st.pg = 1; syncUrl(push); render(); }

	// ---------- newer than the snapshot ----------
	function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m === 1 ? '1 min ago' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; }
	function applyLatest(d, at) {
		var have = {}; posts.forEach(function (p) { have[p.i] = p; });
		var added = 0;
		(d.posts || []).forEach(function (p) {
			if (!p || !p.i) return;
			p.c = T.catMask(p);
			if (p.i > idx.newest) { if (!have[p.i]) added++; p._new = 1; fresh = fresh.filter(function (x) { return x.i !== p.i; }); fresh.push(p); }
			else if (have[p.i] && p.v != null) have[p.i].v = Math.max(have[p.i].v || 0, p.v); // fresher view counts
		});
		rebuild();
		var n = fresh.filter(function (p) { return p._new; }).length;
		$('tga-newt').textContent = (n ? n + ' new post' + (n === 1 ? '' : 's') + ' since the archive was saved, shown at the top' : 'Up to date') + ' · checked ' + ago(at);
		return added;
	}
	function checkLatest(force) {
		var c = null;
		try { c = JSON.parse(sessionStorage.getItem(LKEY) || 'null'); } catch (e) { }
		if (c && !force && Date.now() - c.at < 10 * 60000) { applyLatest(c.d, c.at); render(); return; }
		$('tga-newt').textContent = 'Checking Telegram…';
		fetch('/api/tg-latest').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
			var at = Date.now();
			try { sessionStorage.setItem(LKEY, JSON.stringify({ at: at, d: d })); } catch (e) { }
			applyLatest(d, at); render();
		}).catch(function () { $('tga-newt').textContent = 'Could not check Telegram right now.'; });
	}

	// ---------- events ----------
	var qt;
	$('tga-q').addEventListener('input', function () { clearTimeout(qt); var v = this.value; qt = setTimeout(function () { st.q = v; update(false); }, 200); });
	$('tga-sort').addEventListener('change', function () { st.sort = this.value; update(true); });
	$('tga-yr').addEventListener('change', function () { st.y = this.value; update(true); });
	$('tga-media').addEventListener('change', function () { st.m = this.value; update(true); });
	$('tga-views').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var first = (st.pg - 1) * PER[st.view]; st.view = b.dataset.v; st.pg = Math.floor(first / PER[st.view]) + 1; update(true, true); });
	$('tga-cats').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || b.disabled) return; st.c = st.c === b.dataset.k ? '' : b.dataset.k; update(true); });
	$('tga-sites').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || b.disabled) return; st.s = st.s === b.dataset.k ? '' : b.dataset.k; update(true); });
	$('tga-share').addEventListener('click', function () { syncUrl(false); copy(location.origin + location.pathname + T.toQuery(st), 'Link to this list copied'); });
	function reset() { var v = st.view; st = T.parseQuery(''); st.view = v; $('tga-q').value = ''; update(true); }
	$('tga-reset').addEventListener('click', reset);
	$('tga-check').addEventListener('click', function () { checkLatest(true); });
	$('tga-res').addEventListener('click', function (e) {
		var m = e.target.closest('.tga-more');
		if (m) { var i = +m.dataset.i; open[i] = !open[i]; render(); return; }
		if (e.target.id === 'tga-clear2') reset();
	});
	// expired / missing pictures: drop the image, keep the "open on Telegram" box
	$('tga-res').addEventListener('error', function (e) {
		var img = e.target; if (!img || img.tagName !== 'IMG') return;
		var a = img.closest('.tga-th'); if (!a) return;
		var mt = a.querySelector('.tga-mt');
		a.innerHTML = '<span class="tga-noimg">' + (mt ? esc(mt.textContent) : 'Picture') + '<small>open on Telegram</small></span>';
		a.classList.remove('tga-th--yt');
	}, true);
	$('tga-pager').addEventListener('click', function (e) {
		var b = e.target.closest('button[data-pg]'); if (!b || b.disabled) return;
		st.pg = +b.dataset.pg; update(true, true);
		var top = $('tga-res').getBoundingClientRect().top + window.scrollY - 90;
		window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
	});
	window.addEventListener('popstate', function () { var v = st.view; st = T.parseQuery(location.search); if (!/[?&]view=/.test(location.search)) st.view = v; if (idx) render(); });
	document.addEventListener('keydown', function (e) {
		if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $('tga-q').focus(); }
	});

	$('tga-q').value = st.q;
	fetch('/telegram/data/index.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
		idx = d;
		$('tga-q').placeholder = 'Search all ' + d.count.toLocaleString('en-US') + ' posts… (press / to start typing)';
		return getChunk(d.chunks.length - 1);
	}).then(function () {
		rebuild(); render();
		var go = function () { checkLatest(false); };
		if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 800);
	}).catch(function () { $('tga-sum').textContent = 'Could not load the archive. Please reload the page.'; });
})();
