/* MESSEO: pure on-page SEO parsing + scoring for mes.fm/seo (browser and node, no DOM needed).
 * THE SAME FILE lives in two places: tool_apps_src/seo/lib.js (built into the page by build_tool_apps.py) and mes.fm/api/_seo-lib.js
 * (required by the Vercel function mes.fm/api/seo.js; api files starting with _ are not routes). Edit tool_apps_src/seo/lib.js, then
 * `cp tool_apps_src/seo/lib.js mes.fm/api/_seo-lib.js`; node tool_apps_src/seo-tests.js fails while the two copies differ.
 *   extract(html, pageUrl)            facts about one HTML page (title, meta, headings, links, images, JSON-LD ...)
 *   parseRobots(text) / robotsCheck() a small robots.txt matcher (User-agent groups, Allow / Disallow, * and $, longest rule wins)
 *   parseSitemap(xml), sameUrl()      sitemap <loc> lists and URL comparison
 *   checks(report) / score(list)      plain-English Pass / Warning / Fail checks and a 0-100 score
 *   serp(), pxWidth(), truncatePx()   Google-style result preview with pixel-width truncation
 */
(function (root) {
	'use strict';
	var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', aacute: 'á', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', times: '×', deg: '°' };
	function decode(s) {
		return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, function (m, e) {
			if (e[0] === '#') { var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; } catch (x) { return m; } }
			var k = e.toLowerCase(); return Object.prototype.hasOwnProperty.call(ENT, k) ? ENT[k] : m;
		});
	}
	function squash(s) { return String(s || '').replace(/[\s ]+/g, ' ').trim(); }
	function text(html) { return squash(decode(String(html || '').replace(/<[^>]*>/g, ' '))); }
	function attrs(s) {
		var out = {}, re = /([^\s=\/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, m;
		while ((m = re.exec(s || ''))) { var k = m[1].toLowerCase(); if (!(k in out)) out[k] = decode(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : ''); }
		return out;
	}
	function abs(href, base) { if (href == null) return null; href = squash(href); if (!href) return null; try { return new URL(href, base || undefined).toString(); } catch (e) { return null; } }
	function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
	function bareHost(h) { return String(h || '').toLowerCase().replace(/^www\./, ''); }

	// ---------- input ----------
	function normalizeInput(s) {
		s = String(s == null ? '' : s).trim();
		if (!s) return { error: 'Type a web address first, like example.com/page' };
		if (s.length > 2000) return { error: 'That address is too long.' };
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s) || /^[a-z0-9.-]+:\d+(\/|$)/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
		var u; try { u = new URL(s); } catch (e) { return { error: 'That does not look like a web address.' }; }
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Only http:// and https:// addresses can be checked.' };
		if (u.username || u.password) return { error: 'Addresses with a user name or password are not checked.' };
		if (u.port) return { error: 'Only the normal web ports are checked (no :' + u.port + ').' };
		var h = u.hostname.toLowerCase().replace(/\.$/, '');
		if (!h || h.indexOf('.') < 0) return { error: 'Use a full domain name such as example.com.' };
		if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.indexOf(':') >= 0 || h[0] === '[' || /^\d+$/.test(h.replace(/\./g, ''))) return { error: 'IP addresses are not checked. Use the site’s domain name.' };
		if (/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa)$/.test(h)) return { error: 'That is a private or reserved name, not a public website.' };
		if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return { error: 'That domain name has characters that are not allowed.' };
		u.hash = ''; u.hostname = h;
		return { url: u.toString(), host: h };
	}

	// ---------- page facts ----------
	function extract(html, pageUrl) {
		html = String(html || ''); var raw = html, base = pageUrl || null;
		var noCom = html.replace(/<!--[\s\S]*?-->/g, ' ');
		var ld = [], lre = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, m;
		while ((m = lre.exec(noCom))) {
			var sa = attrs(m[1]);
			if (/^application\/ld\+json$/i.test(squash(sa.type || ''))) {
				var item = { ok: false, types: [] };
				try { var j = JSON.parse(m[2].trim()); item.ok = true; collectTypes(j, item.types, 0); } catch (e) { item.error = String(e && e.message || e).slice(0, 120); }
				ld.push(item);
			}
		}
		// strip things whose contents are not markup, so tag scanning cannot be fooled by "<" inside scripts or styles
		var markup = noCom.replace(/<(script|style|noscript|template|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, function (all, t) { return t.toLowerCase() === 'noscript' ? all.replace(/<\/?noscript[^>]*>/gi, ' ') : '<' + t + '></' + t + '>'; });
		var tags = [], tre = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^<>]*?)?\/?>/g;
		while ((m = tre.exec(markup))) tags.push({ n: m[1].toLowerCase(), a: attrs(m[2] || ''), i: m.index });
		var baseTag = tags.filter(function (t) { return t.n === 'base' && t.a.href; })[0];
		if (baseTag) base = abs(baseTag.a.href, pageUrl) || base;
		var f = { url: pageUrl || null, htmlBytes: utf8Len(raw) };
		var htmlTag = tags.filter(function (t) { return t.n === 'html'; })[0];
		f.lang = htmlTag && htmlTag.a.lang ? htmlTag.a.lang.trim() : null;
		var titles = []; var titre = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi;
		var headPart = markup.split(/<body\b/i)[0], svgless = markup.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, ' ');
		while ((m = titre.exec(headPart.length < markup.length ? headPart : svgless))) titles.push(text(m[1]));
		f.title = titles.length ? titles[0] : null; f.titleCount = titles.length;
		var metas = tags.filter(function (t) { return t.n === 'meta'; });
		function metaBy(key, val) { return metas.filter(function (t) { return (t.a[key] || '').toLowerCase().trim() === val; }); }
		function metaContent(key, val) { var x = metaBy(key, val)[0]; return x && x.a.content != null ? squash(x.a.content) : null; }
		var descs = metaBy('name', 'description');
		f.description = descs.length && descs[0].a.content != null ? squash(descs[0].a.content) : null; f.descriptionCount = descs.length;
		f.robotsMeta = metaContent('name', 'robots'); f.googlebotMeta = metaContent('name', 'googlebot');
		f.viewport = metaContent('name', 'viewport');
		var cs = metas.filter(function (t) { return t.a.charset; })[0], ce = metaBy('http-equiv', 'content-type')[0];
		f.charset = cs ? cs.a.charset.trim().toLowerCase() : ce && /charset=([\w-]+)/i.test(ce.a.content || '') ? RegExp.$1.toLowerCase() : null;
		var refresh = metaBy('http-equiv', 'refresh')[0]; f.metaRefresh = refresh ? squash(refresh.a.content || '') : null;
		f.generator = metaContent('name', 'generator');
		var links = tags.filter(function (t) { return t.n === 'link'; });
		function rel(t) { return (' ' + (t.a.rel || '').toLowerCase().replace(/\s+/g, ' ') + ' '); }
		var canons = links.filter(function (t) { return rel(t).indexOf(' canonical ') >= 0; });
		f.canonicalCount = canons.length; f.canonicalRaw = canons.length ? squash(canons[0].a.href || '') : null;
		f.canonical = f.canonicalRaw ? abs(f.canonicalRaw, base) : null;
		f.canonicalRelative = !!(f.canonicalRaw && !/^https?:\/\//i.test(f.canonicalRaw));
		f.hreflang = links.filter(function (t) { return rel(t).indexOf(' alternate ') >= 0 && t.a.hreflang; }).slice(0, 60).map(function (t) { return { lang: t.a.hreflang.trim(), href: abs(t.a.href, base) }; });
		var icon = links.filter(function (t) { return /\sicon\s|\sshortcut\s|apple-touch-icon/.test(rel(t)) && t.a.href; })[0];
		f.favicon = icon ? abs(icon.a.href, base) : null;
		f.ampLink = (links.filter(function (t) { return rel(t).indexOf(' amphtml ') >= 0; })[0] || { a: {} }).a.href || null;
		var og = {}, tw = {};
		metas.forEach(function (t) {
			var p = (t.a.property || t.a.name || '').toLowerCase().trim(), c = t.a.content != null ? squash(t.a.content) : null;
			if (c == null) return;
			if (p.indexOf('og:') === 0 && !(p.slice(3) in og)) og[p.slice(3)] = c;
			if (p.indexOf('twitter:') === 0 && !(p.slice(8) in tw)) tw[p.slice(8)] = c;
		});
		f.og = og; f.twitter = tw;
		f.ogImage = og.image || og['image:url'] || og['image:secure_url'] ? abs(og.image || og['image:url'] || og['image:secure_url'], base) : null;
		f.ogImageRelative = !!(og.image && !/^https?:\/\//i.test(og.image));
		f.jsonld = ld; f.microdata = tags.filter(function (t) { return t.a.itemtype; }).length;
		// headings (text from the markup, svg removed)
		var hs = [], counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, hre = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
		while ((m = hre.exec(svgless))) { var lv = +m[1]; counts[lv]++; if (hs.length < 120) hs.push({ level: lv, text: text(m[2]).slice(0, 160) }); }
		f.headings = hs; f.headingCounts = counts;
		var skip = null; for (var i = 1, prev = 0; i < hs.length + 1; i++) { var L = hs[i - 1].level; if (prev && L > prev + 1 && !skip) skip = { from: prev, to: L, text: hs[i - 1].text }; prev = L; }
		f.headingSkip = skip;
		// images
		var imgs = tags.filter(function (t) { return t.n === 'img'; }), noAlt = [];
		imgs.forEach(function (t) { if (!('alt' in t.a)) noAlt.push(t.a.src || t.a['data-src'] || ''); });
		f.images = { count: imgs.length, missingAlt: noAlt.length, emptyAlt: imgs.filter(function (t) { return 'alt' in t.a && !t.a.alt.trim(); }).length, noSize: imgs.filter(function (t) { return !(t.a.width && t.a.height); }).length, lazy: imgs.filter(function (t) { return (t.a.loading || '').toLowerCase() === 'lazy'; }).length, missingAltList: noAlt.slice(0, 25).map(function (s) { return abs(s, base) || s || '(no src)'; }) };
		// links
		var ph = bareHost(hostOf(base || '')), A = { total: 0, internal: 0, external: 0, nofollow: 0, nofollowInternal: 0, ugcSponsored: 0, emptyText: 0, broken: 0, externalHosts: {} };
		var are = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
		while ((m = are.exec(svgless))) {
			var aa = attrs(m[1]), href = squash(aa.href || '');
			if (!href || href[0] === '#' || /^(javascript|mailto|tel|sms|data):/i.test(href)) continue;
			var u = abs(href, base); if (!u || !/^https?:/i.test(u)) { A.broken++; continue; }
			A.total++; var r = (aa.rel || '').toLowerCase(), internal = !ph || bareHost(hostOf(u)) === ph;
			if (internal) A.internal++; else { A.external++; var eh = bareHost(hostOf(u)); A.externalHosts[eh] = (A.externalHosts[eh] || 0) + 1; }
			if (/\bnofollow\b/.test(r)) { A.nofollow++; if (internal) A.nofollowInternal++; }
			if (/\b(ugc|sponsored)\b/.test(r)) A.ugcSponsored++;
			if (!text(m[2]) && !/<img\b[^>]*\balt\s*=\s*["'][^"']+/i.test(m[2]) && !aa['aria-label'] && !aa.title) A.emptyText++;
		}
		A.topExternal = Object.keys(A.externalHosts).sort(function (a, b) { return A.externalHosts[b] - A.externalHosts[a]; }).slice(0, 8).map(function (h) { return [h, A.externalHosts[h]]; });
		delete A.externalHosts; f.links = A;
		// visible text
		var body = (svgless.match(/<body\b[^>]*>([\s\S]*)/i) || [null, svgless])[1].replace(/<(script|style|template|textarea|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
		var vis = text(body); f.words = vis ? vis.split(' ').filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length : 0;
		f.textBytes = utf8Len(vis); f.textRatio = f.htmlBytes ? Math.round(f.textBytes / f.htmlBytes * 1000) / 10 : 0;
		f.firstText = vis.slice(0, 320);
		return f;
	}
	function collectTypes(j, out, d) {
		if (!j || d > 6 || out.length > 30) return;
		if (Array.isArray(j)) { j.forEach(function (x) { collectTypes(x, out, d + 1); }); return; }
		if (typeof j !== 'object') return;
		var t = j['@type']; (Array.isArray(t) ? t : t ? [t] : []).forEach(function (x) { x = String(x).replace(/^https?:\/\/schema\.org\//, ''); if (out.indexOf(x) < 0) out.push(x); });
		Object.keys(j).forEach(function (k) { if (k !== '@context' && j[k] && typeof j[k] === 'object') collectTypes(j[k], out, d + 1); });
	}
	function utf8Len(s) { s = String(s || ''); var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; } return n; }

	// ---------- robots.txt ----------
	function parseRobots(txt) {
		var groups = [], cur = null, lastWasAgent = false, sitemaps = [];
		String(txt || '').replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach(function (line) {
			line = line.replace(/#.*/, '').trim(); if (!line) return;
			var m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) return;
			var k = m[1].toLowerCase(), v = m[2].trim();
			if (k === 'sitemap') { if (v && sitemaps.length < 20) sitemaps.push(v); return; }
			if (k === 'user-agent') { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; return; }
			lastWasAgent = false;
			if (!cur) return;
			if (k === 'allow' || k === 'disallow') cur.rules.push({ allow: k === 'allow', path: v });
		});
		return { groups: groups, sitemaps: sitemaps };
	}
	function ruleRe(p) {
		var end = /\$$/.test(p); if (end) p = p.slice(0, -1);
		return new RegExp('^' + p.split('*').map(function (s) { return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }).join('.*') + (end ? '$' : ''));
	}
	// agent = a crawler's product token, e.g. "googlebot"; the most specific group wins (exact token, else "*"); rules of every group naming that agent are merged.
	function robotsCheck(parsed, url, agent) {
		agent = String(agent || '*').toLowerCase();
		var path; try { var u = new URL(url); path = u.pathname + u.search; } catch (e) { path = String(url || '/'); }
		if (path === '/robots.txt') return { allowed: true, agent: null, rule: null };
		var gs = parsed.groups.filter(function (g) { return agent !== '*' && g.agents.indexOf(agent) >= 0; }), used = agent;
		if (!gs.length) { gs = parsed.groups.filter(function (g) { return g.agents.indexOf('*') >= 0; }); used = '*'; }
		if (!gs.length) return { allowed: true, agent: null, rule: null };
		var best = null;
		gs.forEach(function (g) { g.rules.forEach(function (r) {
			if (!r.path) return;                                                     // "Disallow:" with nothing = allow everything
			var pth = r.path; try { pth = decodeURIComponent(pth); } catch (e) {}
			var pp = path; try { pp = decodeURIComponent(path); } catch (e) {}
			if (!ruleRe(pth).test(pp)) return;
			var len = r.path.length;
			if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { len: len, allow: r.allow, path: r.path };
		}); });
		return { allowed: !best || best.allow, agent: used, rule: best ? (best.allow ? 'Allow: ' : 'Disallow: ') + best.path : null };
	}

	// ---------- sitemaps ----------
	function parseSitemap(body) {
		var s = String(body || ''), locs = [], m, re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
		var isIndex = /<sitemapindex\b/i.test(s), isSet = /<urlset\b/i.test(s);
		while ((m = re.exec(s)) && locs.length < 200000) locs.push(decode(m[1]));
		if (!isIndex && !isSet && !locs.length) {                                    // plain-text sitemap: one URL per line
			s.split(/\r?\n/).forEach(function (l) { l = l.trim(); if (/^https?:\/\/\S+$/.test(l)) locs.push(l); });
			return { type: locs.length ? 'text' : 'unknown', locs: locs };
		}
		return { type: isIndex ? 'index' : 'urlset', locs: locs };
	}
	function normUrl(u, loose) {
		try {
			var x = new URL(u); x.hash = '';
			var host = x.hostname.toLowerCase(), path = x.pathname.replace(/\/index\.html?$/i, '/');
			if (path.length > 1) path = path.replace(/\/+$/, '');
			if (loose) host = host.replace(/^www\./, '');
			return (loose ? '' : x.protocol) + '//' + host + path + x.search;
		} catch (e) { return String(u || ''); }
	}
	function sameUrl(a, b, loose) { return !!a && !!b && normUrl(a, loose) === normUrl(b, loose); }
	// put the child sitemaps most likely to hold this URL first (shared path words), keep the rest in their order
	function rankChildren(locs, url) {
		var words = []; try { words = new URL(url).pathname.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; }); } catch (e) {}
		return locs.map(function (l, i) { var s = 0, ll = l.toLowerCase(); words.forEach(function (w) { if (ll.indexOf(w) >= 0) s++; }); if (/page/.test(ll)) s += 0.5; return { l: l, s: s, i: i }; })
			.sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return x.l; });
	}

	// ---------- pixel widths (Arial-like, units of 1/1000 em) ----------
	var W = {}; (function () {
		var g = [[278, ' !,.:;Iijl|\'` '], [333, '()-[]frt{}°'], [355, '"'], [500, 'Jcksvxyz?*^_'], [556, '0123456789#$Labdeghnopqu~éèáöüä'], [584, '+<=>'], [611, 'FTZ'], [667, 'ABEKPSVXY&'], [722, 'CDHNRUw'], [778, 'GOQ'], [833, 'Mm'], [889, '%'], [944, 'W'], [1000, '@—…']];
		g.forEach(function (x) { x[1].split('').forEach(function (c) { W[c] = x[0]; }); });
	})();
	function pxWidth(s, size) { var t = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) { var c = s[i]; t += W[c] != null ? W[c] : c.charCodeAt(0) > 0x2e7f ? 1000 : 556; } return t * (size || 16) / 1000; }
	function truncatePx(s, max, size) {
		s = squash(s); var px = pxWidth(s, size); if (px <= max) return { text: s, cut: false, px: Math.round(px) };
		var ell = pxWidth(' …', size), out = '', t = 0;
		for (var i = 0; i < s.length; i++) { var w = pxWidth(s[i], size); if (t + w + ell > max) break; t += w; out += s[i]; }
		var sp = out.lastIndexOf(' '); if (sp > out.length * 0.6) out = out.slice(0, sp);
		return { text: out.replace(/[\s,.;:\-–—|]+$/, '') + ' …', cut: true, px: Math.round(px) };
	}
	var TITLE_PX = 580, DESC_PX = 920, TITLE_SIZE = 20, DESC_SIZE = 14;
	function breadcrumb(url) {
		try { var u = new URL(url), parts = u.pathname.split('/').filter(Boolean).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } }); return { site: u.hostname.replace(/^www\./, ''), crumbs: (u.protocol + '//' + u.hostname) + (parts.length ? ' › ' + parts.slice(0, 3).join(' › ') + (parts.length > 3 ? ' › …' : '') : '') }; }
		catch (e) { return { site: '', crumbs: String(url || '') }; }
	}
	function serp(f, url) {
		var title = f.title || (f.headings.filter(function (h) { return h.level === 1; })[0] || {}).text || (url ? breadcrumb(url).site : 'Untitled');
		var d = f.description || f.firstText || '';
		return { title: truncatePx(title, TITLE_PX, TITLE_SIZE), desc: truncatePx(d, DESC_PX, DESC_SIZE), descFromPage: !f.description, titleFromH1: !f.title, url: breadcrumb(f.finalUrl || url || f.url) };
	}

	// ---------- checks ----------
	var GROUPS = [['index', 'Crawling and indexing'], ['serp', 'Search result: title and description'], ['content', 'Content and structure'], ['speed', 'Mobile, speed and security'], ['social', 'Social cards and rich results'], ['basics', 'Basics']];
	function noindexOf(f, headers) {
		var bits = [(f && f.robotsMeta) || '', (f && f.googlebotMeta) || '', (headers && headers['x-robots-tag']) || ''].join(',').toLowerCase();
		return { noindex: /\b(noindex|none)\b/.test(bits), nofollow: /\b(nofollow|none)\b/.test(bits), nosnippet: /\bnosnippet\b/.test(bits), raw: bits.replace(/^,+|,+$/g, '') };
	}
	function plural(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }
	function fmtBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' bytes'; }
	// r = { finalUrl, status, chain:[{url,status}], ms, bytes, truncated, contentType, headers:{}, https, page: extract(), robots:{found, status, google:{allowed,rule}, any:{...}, sitemaps}, sitemap:{found, inSitemap, checked:[], urls} }
	function checks(r) {
		var out = [], f = r.page, h = r.headers || {};
		function add(g, id, w, level, title, why, fix) { out.push({ group: g, id: id, w: w, level: level, title: title, why: why || '', fix: fix || '' }); }
		var st = r.status || 0;
		if (st >= 200 && st < 300) add('index', 'status', 10, 'pass', 'The page loads (HTTP ' + st + ')', 'Search engines can only list pages that answer with a 200-type status.');
		else add('index', 'status', 10, 'fail', 'The page answers with HTTP ' + st, st === 404 || st === 410 ? 'This address says the page does not exist, so search engines drop it.' : st >= 500 ? 'A server error: search engines retry for a while, then drop the page.' : st === 403 || st === 401 ? 'The server refuses visitors without a login, so search engines cannot read it.' : 'Search engines only list pages that answer with a 200-type status.', 'Fix the address or the server so the page loads normally, or redirect it to the right page.');
		var hops = (r.chain || []).length - 1;
		if (hops <= 0) add('index', 'redirects', 3, 'pass', 'No redirects', 'The address you checked is the final address.');
		else if (hops === 1) add('index', 'redirects', 3, 'pass', 'One redirect', 'The address redirects once (' + r.chain[0].status + ') to ' + r.finalUrl + '. That is fine; link to the final address where you can.');
		else add('index', 'redirects', 3, 'warn', 'A chain of ' + hops + ' redirects', 'Each hop slows visitors and crawlers, and long chains may not be followed to the end.', 'Point the first address straight at the final one, and update your own links.');
		if (!f) {
			add('index', 'html', 10, 'fail', 'Not an HTML page', 'The address returned ' + (r.contentType || 'no content type') + ', not a web page, so there is nothing to check on it.', 'Check the address, or make the server send the page as text/html.');
			return out;
		}
		var ni = noindexOf(f, h);
		if (ni.noindex) add('index', 'noindex', 12, 'fail', 'The page asks not to be indexed', 'It says "' + ni.raw + '" (in a robots meta tag or the X-Robots-Tag header), so Google and Bing will not list it.', 'Remove "noindex" if you want this page in search results.');
		else add('index', 'noindex', 12, 'pass', 'Indexing is allowed', ni.raw ? 'Robots instructions: "' + ni.raw + '".' : 'No robots meta tag or X-Robots-Tag header blocks it.');
		if (ni.nofollow && !ni.noindex) add('index', 'nofollow', 3, 'warn', 'Links on this page are "nofollow"', 'Search engines are asked not to follow any link on this page, so the pages it links to get no help from it.', 'Remove "nofollow" from the robots meta tag unless that is on purpose.');
		var rb = r.robots;
		if (rb && rb.found && rb.google && !rb.google.allowed) add('index', 'robots', 12, 'fail', 'robots.txt blocks Googlebot from this page', 'The rule "' + rb.google.rule + '" in robots.txt stops Google from reading the page. It can still appear as a bare link without a description.', 'Remove or narrow that rule in /robots.txt.');
		else if (rb && rb.found && rb.any && !rb.any.allowed) add('index', 'robots', 12, 'warn', 'robots.txt blocks some crawlers', 'Googlebot may read it, but the rule "' + rb.any.rule + '" blocks crawlers that follow the * group (Bing among them unless it has its own group).', 'Check that the rule is meant for this page.');
		else if (rb && rb.found) add('index', 'robots', 12, 'pass', 'robots.txt allows this page', rb.google && rb.google.rule ? 'Matching rule: ' + rb.google.rule : 'No rule in robots.txt matches this address.');
		else if (rb && rb.status && rb.status >= 500) add('index', 'robots', 12, 'warn', 'robots.txt gives a server error', 'When robots.txt answers with a 5xx error, Google may stop crawling the whole site for a while.', 'Make /robots.txt load (even an empty file is fine).');
		else if (rb) add('index', 'robots', 12, 'pass', 'No robots.txt (everything may be crawled)', 'That is allowed. A robots.txt is only needed to block parts of a site or to name the sitemap.');
		var sm = r.sitemap;
		if (sm && sm.inSitemap) add('index', 'sitemap', 5, 'pass', 'Listed in the sitemap', 'Found in ' + sm.where + (sm.matched && r.finalUrl && !sameUrl(sm.matched, r.finalUrl) ? ' (as its canonical address ' + sm.matched + ')' : '') + '.');
		else if (sm && sm.found && sm.inSitemap === false) add('index', 'sitemap', 5, 'warn', 'Not found in the sitemap', (sm.partial ? 'The sitemap files that were checked (' + sm.checked.length + ' of ' + sm.children + ') do' : 'The sitemap does') + ' not list this exact address' + (sm.loose ? ' (a version with a different http/https or www was found: ' + sm.loose + ')' : '') + '. Sitemaps help search engines find and re-check pages.', 'Add the page’s final address (the one in its canonical tag) to the sitemap.');
		else if (sm && !sm.found) add('index', 'sitemap', 5, 'warn', 'No sitemap found', 'Neither robots.txt nor /sitemap.xml points to a sitemap. Small sites do fine without one, but it helps new pages get found.', 'Publish /sitemap.xml and add a "Sitemap:" line to robots.txt.');
		var cu = f.canonical, fu = r.finalUrl;
		if (f.canonicalCount > 1) add('index', 'canonical', 8, 'fail', plural(f.canonicalCount, 'canonical tag') + ' on the page', 'With more than one, search engines may ignore all of them.', 'Keep exactly one <link rel="canonical">.');
		else if (!cu) add('index', 'canonical', 8, 'warn', 'No canonical tag', 'A canonical tag tells search engines which address is the main one, so copies with ?tracking= parameters or www / non-www are counted as one page.', 'Add <link rel="canonical" href="' + (fu || 'https://example.com/page') + '"> to the <head>.');
		else if (!sameUrl(cu, fu)) add('index', 'canonical', 8, 'warn', 'The canonical points to another address', 'It names ' + cu + ' as the main version, so search engines will usually list that address instead of this one.', 'Fine if this page is a copy. Otherwise make the canonical match the page’s own address.');
		else if (f.canonicalRelative) add('index', 'canonical', 8, 'warn', 'The canonical is a relative address', '"' + f.canonicalRaw + '" works, but Google recommends a full address starting with https://.', 'Write the canonical as a complete URL.');
		else add('index', 'canonical', 8, 'pass', 'Canonical points to this page', cu);
		// title
		if (!f.title) add('serp', 'title', 10, 'fail', 'No <title>', 'The title is the blue headline in search results. Without one, search engines make one up.', 'Add a <title> of about 30-60 characters that says what the page is.');
		else {
			var tp = pxWidth(f.title, TITLE_SIZE), tl = f.title.length;
			if (tl < 15) add('serp', 'title', 10, 'warn', 'Title is very short (' + tl + ' characters)', '"' + f.title + '" gives searchers little to go on.', 'Aim for about 30-60 characters with the main topic first.');
			else if (tp > TITLE_PX) add('serp', 'title', 10, 'warn', 'Title will be cut off (' + tl + ' characters, about ' + Math.round(tp) + ' px)', 'Google shows roughly ' + TITLE_PX + ' pixels on a computer; the rest becomes "…".', 'Put the important words first, or shorten it to about 60 characters.');
			else add('serp', 'title', 10, 'pass', 'Title length is good (' + tl + ' characters)', '"' + f.title + '"');
			if (f.titleCount > 1) add('serp', 'title2', 2, 'warn', plural(f.titleCount, '<title> tag'), 'Browsers and search engines use the first one only.', 'Keep one <title>.');
		}
		if (!f.description) add('serp', 'desc', 8, 'fail', 'No meta description', 'Search engines then pick a random piece of the page as the grey text under the title, which is often less inviting.', 'Add <meta name="description" content="..."> of about 120-160 characters.');
		else {
			var dl = f.description.length, dp = pxWidth(f.description, DESC_SIZE);
			if (dl < 70) add('serp', 'desc', 8, 'warn', 'Description is short (' + dl + ' characters)', 'There is room for more: a fuller description gets more clicks.', 'Aim for about 120-160 characters.');
			else if (dp > DESC_PX || dl > 170) add('serp', 'desc', 8, 'warn', 'Description will be cut off (' + dl + ' characters)', 'Google shows about ' + DESC_PX + ' pixels (roughly 155-160 characters) on a computer and less on phones.', 'Keep the key message in the first 150 characters.');
			else add('serp', 'desc', 8, 'pass', 'Description length is good (' + dl + ' characters)', f.description);
			if (f.descriptionCount > 1) add('serp', 'desc2', 2, 'warn', plural(f.descriptionCount, 'meta description'), 'Only one is used.', 'Remove the extra ones.');
			if (f.title && f.description && squash(f.title).toLowerCase() === squash(f.description).toLowerCase()) add('serp', 'descsame', 2, 'warn', 'Description repeats the title', 'Searchers see the same words twice.', 'Use the description to add detail.');
		}
		// content
		var h1 = f.headingCounts[1];
		if (!h1) add('content', 'h1', 8, 'fail', 'No <h1> heading', 'The main heading tells readers and search engines what the page is about.', 'Give the page one <h1> with its main topic.');
		else if (h1 > 1) add('content', 'h1', 8, 'warn', plural(h1, '<h1> heading'), 'Several h1 headings blur what the page is mainly about (Google copes, but one is clearer).', 'Keep one <h1> and turn the others into <h2>.');
		else add('content', 'h1', 8, 'pass', 'One <h1> heading', (f.headings.filter(function (x) { return x.level === 1; })[0] || {}).text || '');
		if (f.headingSkip) add('content', 'hskip', 2, 'warn', 'Heading levels skip (h' + f.headingSkip.from + ' to h' + f.headingSkip.to + ')', '"' + f.headingSkip.text + '" jumps a level. Screen readers use the levels as an outline.', 'Use the levels in order: h1, then h2, then h3.');
		else if (f.headings.length > 1) add('content', 'hskip', 2, 'pass', 'Headings are in order', plural(f.headings.length, 'heading') + ' found.');
		if (f.words < 150) add('content', 'words', 5, 'warn', 'Little text (' + f.words + ' words)', 'Pages with very little text are hard for search engines to understand and rank ("thin content").', 'Add a few paragraphs that explain the page: what it is, who it is for, common questions.');
		else add('content', 'words', 5, 'pass', 'Enough text (' + f.words.toLocaleString('en-US') + ' words)', '');
		var im = f.images;
		if (im.count && im.missingAlt) add('content', 'alt', 5, im.missingAlt / im.count > 0.5 ? 'fail' : 'warn', plural(im.missingAlt, 'image') + ' without alt text (of ' + im.count + ')', 'Alt text describes a picture for blind visitors and for image search.', 'Add alt="..." to each image; use alt="" for purely decorative ones.');
		else if (im.count) add('content', 'alt', 5, 'pass', 'Every image has alt text (' + im.count + ')', im.emptyAlt ? im.emptyAlt + ' marked as decorative (alt="").' : '');
		if (!f.links.internal) add('content', 'internal', 3, 'warn', 'No links to other pages of the site', 'Internal links help search engines find your other pages and understand how they connect.', 'Link to related pages on your site.');
		else add('content', 'internal', 3, 'pass', plural(f.links.internal, 'internal link') + ', ' + plural(f.links.external, 'external link'), f.links.nofollow ? f.links.nofollow + ' marked nofollow.' : '');
		if (f.links.nofollowInternal > 0) add('content', 'nfint', 1, 'warn', plural(f.links.nofollowInternal, 'internal link') + ' marked nofollow', 'Nofollow on your own links stops them helping your own pages.', 'Remove rel="nofollow" from links to your own site.');
		if (f.links.emptyText > 0) add('content', 'emptylinks', 2, 'warn', plural(f.links.emptyText, 'link') + ' without text', 'A link with no words (or an image without alt) tells nobody where it goes.', 'Give each link text, an image alt or an aria-label.');
		if (f.metaRefresh) add('content', 'refresh', 3, 'warn', 'The page refreshes or redirects itself', 'A meta refresh ("' + f.metaRefresh + '") is slower and less clear to search engines than a server redirect.', 'Use a 301 redirect on the server instead.');
		// speed / mobile / security
		if (!f.viewport) add('speed', 'viewport', 8, 'fail', 'No mobile viewport tag', 'Without it, phones show a tiny zoomed-out desktop page; Google ranks with the phone view.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
		else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(f.viewport)) add('speed', 'viewport', 8, 'warn', 'The page blocks zooming on phones', '"' + f.viewport + '" stops people with poor eyesight from zooming in.', 'Remove user-scalable=no and maximum-scale=1.');
		else add('speed', 'viewport', 8, 'pass', 'Mobile viewport is set', f.viewport);
		if (r.https) add('speed', 'https', 8, 'pass', 'Served over HTTPS', 'The connection is encrypted; browsers show it as secure.');
		else add('speed', 'https', 8, 'fail', 'Not served over HTTPS', 'Browsers mark plain http pages "Not secure", and Google prefers https.', 'Get a free certificate (for example Let’s Encrypt) and redirect http to https.');
		if (r.https) add('speed', 'hsts', 1, h['strict-transport-security'] ? 'pass' : 'warn', h['strict-transport-security'] ? 'HSTS is on' : 'No HSTS header', 'HSTS tells browsers to always use https for the site.', h['strict-transport-security'] ? '' : 'Send Strict-Transport-Security: max-age=31536000 once https works everywhere.');
		var ms = r.ms || 0;
		if (ms) add('speed', 'ttfb', 5, ms < 800 ? 'pass' : ms < 1800 ? 'warn' : 'fail', 'Server answered in ' + (ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s'), 'Time until the HTML started arriving at our server (not a full speed test). Under 0.8 s is good.', ms < 800 ? '' : 'Use caching or a CDN, and check slow server code. Run PageSpeed Insights for the full picture.');
		var b = r.bytes || f.htmlBytes;
		add('speed', 'size', 5, r.truncated || b > 1500000 ? 'fail' : b > 500000 ? 'warn' : 'pass', 'HTML size ' + fmtBytes(b) + (r.truncated ? ' (stopped reading here)' : ''), 'This is the HTML only, without images, scripts and styles. Google reads at most the first 15 MB, and big HTML is slow on phones.', b > 500000 ? 'Move inline data, styles and scripts into separate files.' : '');
		var enc = (h['content-encoding'] || '').toLowerCase();
		if (b > 10000) add('speed', 'gzip', 3, /gzip|br|zstd|deflate/.test(enc) ? 'pass' : 'warn', /gzip|br|zstd|deflate/.test(enc) ? 'Compressed (' + enc + ')' : 'Not compressed', 'Compression usually makes HTML 3-5 times smaller to download.', /gzip|br|zstd|deflate/.test(enc) ? '' : 'Turn on gzip or Brotli on the server.');
		// social
		var og = f.og || {}, miss = ['title', 'description', 'image'].filter(function (k) { return !og[k]; });
		if (!miss.length) add('social', 'og', 5, f.ogImageRelative ? 'warn' : 'pass', f.ogImageRelative ? 'og:image is a relative address' : 'Open Graph tags are complete', f.ogImageRelative ? 'Facebook, LinkedIn and others need a full https:// address for the picture.' : 'Shared links show a title, description and picture.', f.ogImageRelative ? 'Write og:image as a complete URL.' : '');
		else add('social', 'og', 5, miss.length === 3 ? 'fail' : 'warn', miss.length === 3 ? 'No Open Graph tags' : 'Open Graph is missing og:' + miss.join(', og:'), 'These tags decide the picture and text when the page is shared on Facebook, LinkedIn, WhatsApp, Telegram and others.', 'Add og:title, og:description and og:image (1200 x 630 pixels works everywhere).');
		var tw = f.twitter || {};
		add('social', 'twitter', 1, tw.card ? 'pass' : 'warn', tw.card ? 'X (Twitter) card: ' + tw.card : 'No twitter:card tag', 'X falls back to Open Graph, but without twitter:card it shows a small card.', tw.card ? '' : 'Add <meta name="twitter:card" content="summary_large_image">.');
		var bad = f.jsonld.filter(function (x) { return !x.ok; }), types = [];
		f.jsonld.forEach(function (x) { x.types.forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); }); });
		if (bad.length) add('social', 'jsonld', 4, 'fail', plural(bad.length, 'structured-data block') + ' cannot be read', 'A JSON-LD block has a syntax error (' + (bad[0].error || 'invalid JSON') + '), so search engines ignore it.', 'Fix the JSON and test it with the Rich Results Test.');
		else if (types.length) add('social', 'jsonld', 4, 'pass', 'Structured data found: ' + types.slice(0, 8).join(', '), 'Structured data can earn rich results (stars, FAQs, breadcrumbs, how-tos).');
		else add('social', 'jsonld', 4, f.microdata ? 'pass' : 'warn', f.microdata ? 'Microdata found (' + f.microdata + ' items)' : 'No structured data', 'Structured data (JSON-LD) tells search engines what the page is, for example an Article, Product or FAQ, and can earn rich results.', f.microdata ? '' : 'Add a JSON-LD block that fits the page (schema.org).');
		// basics
		add('basics', 'lang', 3, f.lang ? 'pass' : 'warn', f.lang ? 'Language is set (' + f.lang + ')' : 'No lang attribute', 'The language helps screen readers pronounce the text and search engines show the page to the right people.', f.lang ? '' : 'Add lang="en" (or your language) to the <html> tag.');
		var ctCharset = /charset=([\w-]+)/i.test(r.contentType || '') ? RegExp.$1.toLowerCase() : null;
		add('basics', 'charset', 2, f.charset || ctCharset ? 'pass' : 'warn', f.charset || ctCharset ? 'Character set: ' + (f.charset || ctCharset) : 'No character set', 'Without it some browsers show accents and symbols as garbage.', f.charset || ctCharset ? '' : 'Add <meta charset="utf-8"> as the first thing in <head>.');
		add('basics', 'favicon', 2, f.favicon ? 'pass' : 'warn', f.favicon ? 'Favicon found' : 'No favicon link', 'Google shows the site icon next to results on phones and in some desktop results.', f.favicon ? '' : 'Add <link rel="icon" href="/favicon.png"> (at least 48 x 48 pixels).');
		if (f.hreflang.length) {
			var self = f.hreflang.some(function (x) { return sameUrl(x.href, fu) || sameUrl(x.href, cu); }), xd = f.hreflang.some(function (x) { return x.lang.toLowerCase() === 'x-default'; });
			add('basics', 'hreflang', 2, self ? 'pass' : 'warn', plural(f.hreflang.length, 'language version') + ' linked (hreflang)', self ? (xd ? 'Includes this page and an x-default.' : 'Includes this page; an x-default entry is optional.') : 'The hreflang list does not include this page itself; Google expects every version to list all versions, itself included.', self ? '' : 'Add a hreflang entry pointing at this page.');
		}
		return out;
	}
	function score(list, r) {
		var tot = 0, got = 0; list.forEach(function (c) { if (c.level === 'info') return; tot += c.w; got += c.level === 'pass' ? c.w : c.level === 'warn' ? c.w * 0.5 : 0; });
		var s = tot ? Math.round(got / tot * 100) : 0, cap = null;
		var crit = list.filter(function (c) { return c.level === 'fail' && (c.id === 'status' || c.id === 'noindex' || c.id === 'html' || (c.id === 'robots')); });
		if (crit.length && s > 30) { s = 30; cap = crit[0].title; }
		return { score: s, cap: cap, pass: list.filter(function (c) { return c.level === 'pass'; }).length, warn: list.filter(function (c) { return c.level === 'warn'; }).length, fail: list.filter(function (c) { return c.level === 'fail'; }).length, grade: s >= 90 ? 'Excellent' : s >= 75 ? 'Good' : s >= 55 ? 'Needs work' : 'Poor' };
	}
	function reportText(r, list, sc) {
		var L = ['SEO check of ' + (r.finalUrl || r.input), 'Score: ' + sc.score + '/100 (' + sc.grade + ')' + (sc.cap ? ' - capped because: ' + sc.cap : ''), sc.pass + ' passed, ' + sc.warn + ' warnings, ' + sc.fail + ' failed', ''];
		var ICON = { pass: '[ok]  ', warn: '[warn]', fail: '[FAIL]', info: '[info]' };
		GROUPS.forEach(function (g) {
			var cs = list.filter(function (c) { return c.group === g[0]; }); if (!cs.length) return;
			L.push(g[1]); cs.forEach(function (c) { L.push('  ' + ICON[c.level] + ' ' + c.title + (c.level !== 'pass' && c.fix ? '\n          Fix: ' + c.fix : '')); }); L.push('');
		});
		L.push('Checked with https://mes.fm/seo' + (r.checkedAt ? ' on ' + r.checkedAt.slice(0, 10) : ''));
		return L.join('\n');
	}
	function toolLinks(url) {
		var e = encodeURIComponent(url), noScheme = String(url || '').replace(/^https?:\/\//i, '').replace(/\/$/, ''), host = hostOf(url), origin = '';
		try { origin = new URL(url).origin; } catch (x) {}
		return [
			['Google: is it indexed?', 'https://www.google.com/search?q=' + encodeURIComponent('site:' + noScheme), 'A site: search for this address'],
			['Bing: is it indexed?', 'https://www.bing.com/search?q=' + encodeURIComponent('site:' + noScheme), 'A site: search on Bing'],
			['Google Search Console', 'https://search.google.com/search-console/inspect?resource_id=' + encodeURIComponent('sc-domain:' + bareHost(host)) + '&id=' + e, 'URL inspection (for sites you own)'],
			['Bing Webmaster Tools', 'https://www.bing.com/webmasters/urlinspection?siteUrl=' + encodeURIComponent(origin + '/') + '&url=' + e, 'URL inspection (for sites you own)'],
			['PageSpeed Insights', 'https://pagespeed.web.dev/report?url=' + e, 'Full speed test and Core Web Vitals'],
			['Rich Results Test', 'https://search.google.com/test/rich-results?url=' + e, 'Which rich results Google can show'],
			['Schema Markup Validator', 'https://validator.schema.org/#url=' + e, 'Checks every schema.org item'],
			['Facebook Sharing Debugger', 'https://developers.facebook.com/tools/debug/?q=' + e, 'Refresh how the link looks when shared'],
			['W3C HTML validator', 'https://validator.w3.org/nu/?doc=' + e, 'Markup errors']
		];
	}

	var DEMO_URL = 'https://demo.mes.fm/blog/best-hiking-trails-near-vancouver';
	var DEMO_HTML = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">\n<title>Best Hiking Trails Near Vancouver for Beginners and Families: 25 Easy Walks With Views, Waterfalls and Lakes</title>\n' +
		'<meta name="description" content="Easy hikes near Vancouver.">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<link rel="canonical" href="/blog/best-hiking-trails-near-vancouver">\n' +
		'<meta property="og:title" content="Best Hiking Trails Near Vancouver">\n<meta property="og:image" content="https://mes.fm/img/seo-logo.png">\n<link rel="icon" href="/favicon.png">\n' +
		'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Best Hiking Trails Near Vancouver","author":{"@type":"Person","name":"Sam"}}</script>\n' +
		'<script type="application/ld+json">{"@type": "FAQPage", oops}</script>\n</head><body>\n<header><a href="/">Home</a> <a href="/blog">Blog</a> <a href="https://twitter.com/x" rel="nofollow"><img src="/x.svg"></a></header>\n' +
		'<h1>Best hiking trails near Vancouver</h1><p>Vancouver has mountains, forests and ocean views a short drive or bus ride from downtown. These trails are easy enough for beginners and children, with good paths and places to rest.</p>\n' +
		'<h3>Lynn Canyon</h3><p>A suspension bridge, a swimming hole and a loop of about 1 hour. Free to visit, with a cafe by the parking lot.</p><img src="/img/lynn.jpg">\n' +
		'<h2>Quarry Rock</h2><p>A short climb in Deep Cove that ends on a rock with views over Indian Arm. Go early on weekends: parking fills by 9 am.</p><img src="/img/quarry.jpg" alt="View from Quarry Rock">\n' +
		'<h2>Rice Lake</h2><p>A flat loop around a lake in the Lynn Headwaters park, good for strollers. <a href="/blog/what-to-bring-hiking">What to bring</a>.</p><img src="/img/rice.jpg" alt="">\n' +
		'<h1>More trails</h1><p>See also <a href="https://www.alltrails.com/canada/british-columbia">AllTrails</a> and <a href="/blog/winter-walks">winter walks</a>.</p>\n</body></html>';
	var DEMO_REPORT = { input: DEMO_URL, finalUrl: DEMO_URL, status: 200, chain: [{ url: 'http://demo.mes.fm/blog/best-hiking-trails-near-vancouver', status: 301 }, { url: DEMO_URL, status: 200 }], ms: 420, contentType: 'text/html; charset=utf-8', https: true,
		headers: { 'content-encoding': 'br', 'cache-control': 'public, max-age=600' }, robots: { found: true, status: 200, google: { allowed: true, rule: null, agent: '*' }, any: { allowed: true, rule: null }, sitemaps: ['https://demo.mes.fm/sitemap.xml'] },
		sitemap: { found: true, inSitemap: false, checked: ['https://demo.mes.fm/sitemap.xml'], children: 1, urls: 42 }, demo: true };

	var api = { decode: decode, attrs: attrs, text: text, normalizeInput: normalizeInput, extract: extract, parseRobots: parseRobots, robotsCheck: robotsCheck, parseSitemap: parseSitemap, sameUrl: sameUrl, normUrl: normUrl, rankChildren: rankChildren,
		pxWidth: pxWidth, truncatePx: truncatePx, serp: serp, breadcrumb: breadcrumb, checks: checks, score: score, reportText: reportText, toolLinks: toolLinks, noindexOf: noindexOf, fmtBytes: fmtBytes, utf8Len: utf8Len,
		GROUPS: GROUPS, TITLE_PX: TITLE_PX, DESC_PX: DESC_PX, DEMO_URL: DEMO_URL, DEMO_HTML: DEMO_HTML, DEMO_REPORT: DEMO_REPORT };
	if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MESSEO = api;
})(typeof window !== 'undefined' ? window : this);

/* MES SEO Checker UI. Tab 1: /api/seo?u= returns page facts, MESSEO (lib.js, same file as api/_seo-lib.js) turns them into checks + a score.
 * ?demo=1 analyses the bundled sample page in the browser (no network), for screenshots and local testing. Tab 2: SEO issues of every mes.fm page
 * from /site-index/pages.json (build_site_index.py). State: localStorage mes-seo:v1 (recent checks, chosen tab, "problems only"). */
(function () {
	'use strict';
	var S = MESSEO, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-seo:v1', st = { recent: [], tab: 'check', prob: false }, cur = null, busy = false;
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && typeof sv === 'object') { if (Array.isArray(sv.recent)) st.recent = sv.recent.filter(function (x) { return typeof x === 'string'; }).slice(0, 8); st.tab = sv.tab === 'site' ? 'site' : 'check'; st.prob = !!sv.prob; } } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
	var toastT; function toast(m) { var t = $('sx-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function copy(t, m) {
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(m); }, function () { toast('Copy failed'); });
		else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(m); } catch (e) { toast('Copy failed'); } ta.remove(); }
	}
	function status(msg, err) { var s = $('sx-status'); s.hidden = !msg; s.className = 'sx-status' + (err ? ' err' : ''); s.innerHTML = msg || ''; }
	function setQuery(params) { try { var q = new URLSearchParams(); Object.keys(params).forEach(function (k) { if (params[k]) q.set(k, params[k]); }); var s = q.toString(); history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) {} }

	// ---------- tabs ----------
	var tabs = [].slice.call(document.querySelectorAll('.sx-tabs [role=tab]'));
	function showTab(name, focus) {
		st.tab = name; save();
		tabs.forEach(function (b) { var on = b.getAttribute('data-tab') === name; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		$('sx-p-check').hidden = name !== 'check'; $('sx-p-site').hidden = name !== 'site';
		if (name === 'site') loadSite();
	}
	tabs.forEach(function (b, i) {
		b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); if (b.getAttribute('data-tab') === 'site') setQuery({ tab: 'site' }); else setQuery(cur && !cur.demo ? { u: cur.input } : {}); });
		b.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; showTab(tabs[j].getAttribute('data-tab'), true); } });
	});

	// ---------- check a page ----------
	function drawRecent() {
		$('sx-recent').innerHTML = st.recent.map(function (u) { return '<button type="button" class="tu-chip" data-u="' + esc(u) + '">' + esc(u.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</button>'; }).join('') + (st.recent.length ? '<button type="button" class="tu-chip" data-clear="1">Clear history</button>' : '');
	}
	$('sx-recent').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.getAttribute('data-clear')) { st.recent = []; save(); drawRecent(); return; } $('sx-q').value = b.getAttribute('data-u'); go(); });
	$('sx-go').onclick = function () { go(); }; $('sx-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
	$('sx-demo').onclick = function () { demo(); };
	$('sx-again').onclick = function () { if (cur && cur.demo) demo(); else if (cur) { $('sx-q').value = cur.input; go(true); } };
	function go(fresh) {
		var n = S.normalizeInput($('sx-q').value);
		if (n.error) return status(esc(n.error), true);
		if (busy) return;
		busy = true; $('sx-go').disabled = true; $('sx-go').textContent = 'Checking…'; $('sx-out').hidden = true;
		status('Checking <b>' + esc(n.url) + '</b>: fetching the page, robots.txt and the sitemap&hellip;');
		fetch('/api/seo?u=' + encodeURIComponent(n.url) + (fresh ? '&t=' + Math.floor(Date.now() / 600000) : '')).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: false, j: null }; }); }).then(function (x) {
			done();
			if (!x.ok || !x.j) return status(esc(x.j && x.j.error || 'The checker is not available here (it runs on mes.fm). Try the example report instead.'), true);
			if (x.j.error) return status(esc(x.j.error), true);
			status(''); st.recent = [n.url].concat(st.recent.filter(function (u) { return u !== n.url; })).slice(0, 8); save(); drawRecent();
			setQuery({ u: n.url }); render(x.j);
		}).catch(function () { done(); status('Could not reach the checker. Check your connection and try again.', true); });
	}
	function done() { busy = false; $('sx-go').disabled = false; $('sx-go').textContent = 'Check page'; }
	function demo() {
		var p = S.extract(S.DEMO_HTML, S.DEMO_URL); p.finalUrl = S.DEMO_URL;
		var r = JSON.parse(JSON.stringify(S.DEMO_REPORT)); r.page = p; r.bytes = S.utf8Len(S.DEMO_HTML); r.checkedAt = new Date().toISOString();
		$('sx-q').value = S.DEMO_URL; status('This is an <b>example report</b> of a made-up page (nothing was fetched). Type a real address above to check your own page.');
		render(r);
	}

	var ICON = { pass: '✓', warn: '!', fail: '✕', info: 'i' }, WORD = { pass: 'Pass', warn: 'Warning', fail: 'Fail', info: 'Note' };
	function render(r) {
		cur = r; var list = S.checks(r), sc = S.score(list, r), f = r.page;
		$('sx-out').hidden = false;
		var col = sc.score >= 75 ? 'good' : sc.score >= 55 ? 'mid' : 'bad', C = 2 * Math.PI * 52;
		$('sx-ring').innerHTML = '<svg viewBox="0 0 120 120" class="sx-ring--' + col + '"><circle class="sx-ring__bg" cx="60" cy="60" r="52"></circle><circle class="sx-ring__fg" cx="60" cy="60" r="52" stroke-dasharray="' + (C * sc.score / 100).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 60 60)"></circle><text x="60" y="68" text-anchor="middle">' + sc.score + '</text></svg>';
		$('sx-score').textContent = sc.score; $('sx-grade').textContent = sc.grade; $('sx-grade').className = 'sx-grade sx-grade--' + col;
		$('sx-counts').innerHTML = '<span class="sx-pill sx-pill--pass">' + sc.pass + ' passed</span><span class="sx-pill sx-pill--warn">' + sc.warn + ' warnings</span><span class="sx-pill sx-pill--fail">' + sc.fail + ' failed</span>';
		$('sx-url').innerHTML = esc(r.finalUrl || r.input) + (r.chain && r.chain.length > 1 ? ' <span class="tu-note">(after ' + (r.chain.length - 1) + ' redirect' + (r.chain.length > 2 ? 's' : '') + ' from ' + esc(r.input) + ')</span>' : '');
		$('sx-cap').hidden = !sc.cap; if (sc.cap) $('sx-cap').textContent = 'Score held at 30 because: ' + sc.cap + '. Fix that first.';
		// previews
		if (f) {
			var sp = S.serp(f, r.finalUrl);
			$('sx-serp').innerHTML = '<div class="sx-serp__site"><span class="sx-serp__fav">' + (f.favicon ? '<img src="' + esc(f.favicon) + '" alt="" width="18" height="18" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">' : '') + '</span><span><span class="sx-serp__name">' + esc((f.og && f.og.site_name) || sp.url.site) + '</span><span class="sx-serp__crumb">' + esc(sp.url.crumbs) + '</span></span></div><div class="sx-serp__title">' + esc(sp.title.text) + '</div><div class="sx-serp__desc">' + esc(sp.desc.text) + '</div>';
			$('sx-serpnote').textContent = (sp.titleFromH1 ? 'No <title>, so the main heading is shown instead. ' : '') + 'Title about ' + sp.title.px + ' px of ' + S.TITLE_PX + ' px' + (sp.title.cut ? ' (cut off)' : '') + '. ' + (sp.descFromPage ? 'No meta description, so Google picks text from the page, like this. ' : 'Description about ' + sp.desc.px + ' px of ' + S.DESC_PX + ' px' + (sp.desc.cut ? ' (cut off)' : '') + '. ') + 'Google may rewrite either one.';
			var og = f.og || {}, tw = f.twitter || {}, img = f.ogImage || (tw.image ? (function () { try { return new URL(tw.image, r.finalUrl).toString(); } catch (e) { return null; } })() : null);
			var stitle = og.title || tw.title || f.title || '', sdesc = og.description || tw.description || f.description || '';
			$('sx-social').innerHTML = '<div class="sx-social__img">' + (img ? '<img src="' + esc(img) + '" alt="Share image of the page" referrerpolicy="no-referrer" loading="lazy" onerror="this.parentNode.innerHTML=\'<span>The og:image could not be loaded</span>\'">' : '<span>No share image (og:image)</span>') + '</div><div class="sx-social__body"><div class="sx-social__host">' + esc(S.breadcrumb(r.finalUrl).site.toUpperCase()) + '</div><div class="sx-social__title">' + esc(stitle || 'No title') + '</div><div class="sx-social__desc">' + esc(sdesc.slice(0, 200)) + '</div></div>';
			$('sx-socialnote').textContent = (og.title ? 'From the Open Graph tags.' : 'No og:title, so apps fall back to the page title (some show nothing).') + ' The picture loads from the site itself.';
		} else { $('sx-serp').innerHTML = '<p class="tu-note">Not an HTML page, so there is no preview.</p>'; $('sx-social').innerHTML = ''; $('sx-serpnote').textContent = ''; $('sx-socialnote').textContent = ''; }
		drawChecks(list);
		// headings outline
		var hs = f ? f.headings : [];
		$('sx-tree').innerHTML = hs.length ? hs.map(function (h) { return '<li class="sx-tree__l' + h.level + (h.level === 1 ? ' sx-tree__h1' : '') + '"><span class="sx-tag">H' + h.level + '</span> ' + (esc(h.text) || '<i>(empty heading)</i>') + '</li>'; }).join('') : '<li class="tu-note">No headings (h1 to h6) on the page.</li>';
		$('sx-tools').innerHTML = S.toolLinks(r.finalUrl || r.input).map(function (l) { return '<li><a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + '<small>' + esc(l[2]) + '</small></a></li>'; }).join('');
		drawFacts(r);
	}
	function drawChecks(list) {
		var box = $('sx-checks'), prob = st.prob;
		[].forEach.call(document.querySelectorAll('[data-show]'), function (b) { b.setAttribute('aria-pressed', (b.getAttribute('data-show') === 'prob') === prob ? 'true' : 'false'); });
		box.innerHTML = S.GROUPS.map(function (g) {
			var cs = list.filter(function (c) { return c.group === g[0]; }), shown = cs.filter(function (c) { return !prob || c.level === 'warn' || c.level === 'fail'; });
			if (!cs.length) return '';
			var bad = cs.filter(function (c) { return c.level === 'fail'; }).length, warn = cs.filter(function (c) { return c.level === 'warn'; }).length;
			return '<div class="tu-card sx-group"><h3 class="sx-h">' + esc(g[1]) + ' <span class="sx-gsum">' + (bad ? bad + ' failed' : '') + (bad && warn ? ', ' : '') + (warn ? warn + ' warning' + (warn > 1 ? 's' : '') : '') + (!bad && !warn ? 'all good' : '') + '</span></h3>' +
				(shown.length ? '<ul class="sx-checks">' + shown.map(function (c) {
					return '<li class="sx-c sx-c--' + c.level + '"><span class="sx-ic" aria-hidden="true">' + ICON[c.level] + '</span><div><div class="sx-c__t"><span class="sx-sr">' + WORD[c.level] + ': </span>' + esc(c.title) + '</div>' + (c.why ? '<div class="sx-c__why">' + esc(c.why) + '</div>' : '') + (c.fix && c.level !== 'pass' ? '<div class="sx-c__fix"><b>How to fix:</b> ' + esc(c.fix) + '</div>' : '') + '</div></li>';
				}).join('') + '</ul>' : '<p class="tu-note">No problems here.</p>') + '</div>';
		}).join('');
	}
	[].forEach.call(document.querySelectorAll('[data-show]'), function (b) { b.onclick = function () { st.prob = b.getAttribute('data-show') === 'prob'; save(); if (cur) drawChecks(S.checks(cur)); }; });
	function row(k, v) { return '<tr><th scope="row">' + esc(k) + '</th><td>' + v + '</td></tr>'; }
	function val(s) { return s == null || s === '' ? '<span class="sx-none">none</span>' : esc(s); }
	function drawFacts(r) {
		var f = r.page, h = r.headers || {}, rb = r.robots || {}, sm = r.sitemap || {}, out = [];
		var t = '<table class="sx-kv"><tbody>';
		t += row('Final address', val(r.finalUrl)) + row('Status', esc(r.status)) + row('Redirects', r.chain && r.chain.length > 1 ? r.chain.map(function (c) { return esc(c.status) + ' ' + esc(c.url); }).join('<br>') : 'none');
		t += row('Server answer time', r.ms ? esc(r.ms) + ' ms' : val(null)) + row('HTML size', esc(S.fmtBytes(r.bytes || 0)) + (r.truncated ? ' (stopped reading at 1.5 MB)' : '')) + row('Content type', val(r.contentType));
		['content-encoding', 'cache-control', 'x-robots-tag', 'strict-transport-security', 'server', 'last-modified'].forEach(function (k) { if (h[k]) t += row(k, esc(h[k])); });
		t += row('robots.txt', rb.found ? 'found' + (rb.google ? '; Googlebot ' + (rb.google.allowed ? 'allowed' : '<b>blocked</b>') + (rb.google.rule ? ' (' + esc(rb.google.rule) + ')' : '') : '') + (rb.bing ? '; Bingbot ' + (rb.bing.allowed ? 'allowed' : '<b>blocked</b>') : '') : rb.status ? 'not found (' + esc(rb.status) + ')' : 'not found');
		t += row('Sitemaps checked', sm.checked && sm.checked.length ? sm.checked.map(esc).join('<br>') + (sm.urls ? '<br><span class="tu-note">' + fmt(sm.urls) + ' addresses read</span>' : '') : val(null));
		if (f) {
			t += row('Title', val(f.title) + (f.title ? ' <span class="tu-note">(' + f.title.length + ' characters)</span>' : '')) + row('Meta description', val(f.description) + (f.description ? ' <span class="tu-note">(' + f.description.length + ' characters)</span>' : ''));
			t += row('Canonical', val(f.canonical)) + row('Robots meta', val([f.robotsMeta, f.googlebotMeta ? 'googlebot: ' + f.googlebotMeta : ''].filter(Boolean).join('; '))) + row('Language', val(f.lang)) + row('Character set', val(f.charset)) + row('Viewport', val(f.viewport));
			t += row('hreflang', f.hreflang.length ? f.hreflang.slice(0, 20).map(function (x) { return esc(x.lang) + ' &rarr; ' + esc(x.href); }).join('<br>') + (f.hreflang.length > 20 ? '<br>&hellip;' : '') : val(null));
			var og = Object.keys(f.og || {}), tw = Object.keys(f.twitter || {});
			t += row('Open Graph', og.length ? og.slice(0, 12).map(function (k) { return '<b>og:' + esc(k) + '</b> ' + esc(String(f.og[k]).slice(0, 160)); }).join('<br>') : val(null));
			t += row('X / Twitter', tw.length ? tw.slice(0, 10).map(function (k) { return '<b>twitter:' + esc(k) + '</b> ' + esc(String(f.twitter[k]).slice(0, 160)); }).join('<br>') : val(null));
			t += row('Structured data', f.jsonld.length ? f.jsonld.map(function (x, i) { return 'Block ' + (i + 1) + ': ' + (x.ok ? esc(x.types.join(', ') || 'no @type') : '<b>cannot be read</b> (' + esc(x.error || '') + ')'); }).join('<br>') : f.microdata ? fmt(f.microdata) + ' microdata items' : val(null));
			t += row('Words', fmt(f.words) + ' <span class="tu-note">(text is ' + f.textRatio + '% of the HTML)</span>');
			t += row('Images', fmt(f.images.count) + ' (' + fmt(f.images.missingAlt) + ' without alt, ' + fmt(f.images.emptyAlt) + ' decorative, ' + fmt(f.images.noSize) + ' without width / height, ' + fmt(f.images.lazy) + ' lazy-loaded)');
			if (f.images.missingAltList.length) t += row('Images without alt', f.images.missingAltList.map(function (s) { return '<span class="sx-break">' + esc(s) + '</span>'; }).join('<br>') + (f.images.missingAlt > f.images.missingAltList.length ? '<br>&hellip; and ' + (f.images.missingAlt - f.images.missingAltList.length) + ' more' : ''));
			t += row('Links', fmt(f.links.internal) + ' internal, ' + fmt(f.links.external) + ' external, ' + fmt(f.links.nofollow) + ' nofollow' + (f.links.ugcSponsored ? ', ' + fmt(f.links.ugcSponsored) + ' ugc / sponsored' : ''));
			if (f.links.topExternal.length) t += row('Links out to', f.links.topExternal.map(function (x) { return esc(x[0]) + ' (' + x[1] + ')'; }).join(', '));
			t += row('Favicon', val(f.favicon)) + (f.generator ? row('Built with', esc(f.generator)) : '');
		}
		$('sx-facts').innerHTML = t + '</tbody></table>';
	}
	$('sx-copy').onclick = function () { if (!cur) return; var l = S.checks(cur); copy(S.reportText(cur, l, S.score(l, cur)), 'Report copied'); };
	$('sx-link').onclick = function () { if (!cur) return; copy(location.origin + location.pathname + (cur.demo ? '?demo=1' : '?u=' + encodeURIComponent(cur.input)), 'Link copied'); };

	// ---------- mes.fm site report ----------
	var SITE = null, siteLoading = false, sv2 = { q: '', sec: '', sort: 'iss', i: '', p: 1 }, PER = 50;
	var SEO_ISS = { nodesc: 'Add a meta description of about 120-160 characters.', shortdesc: 'Make the description longer (120+ characters).', longdesc: 'Cut the description to about 160 characters.', noog: 'Add og:image so shared links show a picture.', ogmiss: 'The og:image file is missing on disk: fix the path.', notw: 'Add twitter:image (or twitter:card).', nocanon: 'Add a canonical tag.', canonbad: 'The canonical points to a different address.', canonrel: 'Write the canonical as a full https:// address.', notitle: 'Add a <title>.', noh1: 'Add one <h1>.', multih1: 'Keep one <h1>, turn the others into <h2>.', nolang: 'Add lang="en" to <html>.', novp: 'Add the mobile viewport tag.', noindex: 'The page asks not to be indexed.', dupurl: 'Two files serve the same address.' };
	var EXTRA = [['longtitle', 'Title over 60 characters', 0, 'Shorten the main part of the title (before " | ") so it is not cut off.'], ['thin', 'Under 80 words', 0, 'Very little text (thin content): add a paragraph or two of explanation.']];
	function loadSite() {
		if (SITE || siteLoading) return; siteLoading = true;
		$('sx-slist').innerHTML = '<p class="tu-note">Loading the page list&hellip;</p>';
		fetch('/site-index/pages.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) { SITE = prepSite(d); drawSite(); })
			.catch(function (e) { siteLoading = false; $('sx-slist').innerHTML = '<p class="sx-status err">Could not load the page list (' + esc(e.message || e) + ').</p>'; });
	}
	function prepSite(d) {
		var C = {}; d.cols.forEach(function (c, i) { C[c] = i; });
		var iss = [], bit = {}; d.issues.forEach(function (x, i) { bit[x[0]] = 1 << i; if (SEO_ISS[x[0]]) iss.push({ id: x[0], label: x[1], hard: !!x[2], fix: SEO_ISS[x[0]] }); });
		EXTRA.forEach(function (x) { iss.push({ id: x[0], label: x[1], hard: !!x[2], fix: x[3] }); });
		var tplHttrack = -1; d.templates.forEach(function (t, i) { if (t[0] === 'httrack' || t[0] === 'redirect-stub') tplHttrack = t[0] === 'httrack' ? i : tplHttrack; });
		var secHttrack = -1; d.sections.forEach(function (s, i) { if (s[0] === 'httrack') secHttrack = i; });
		var rows = d.p.filter(function (r) { return r[C.template] !== tplHttrack && r[C.section] !== secHttrack; }).map(function (r) {
			var has = [];
			iss.forEach(function (x) {
				if (bit[x.id] != null) { if (r[C.issues] & bit[x.id]) has.push(x.id); }
				else if (x.id === 'longtitle' && (r[C.title] || '').length > 60) has.push(x.id);
				else if (x.id === 'thin' && r[C.words] < 80) has.push(x.id);
			});
			return { url: r[C.url], title: r[C.title] || '', sec: r[C.section], desc: r[C.desc_len], h1: r[C.h1], words: r[C.words], iss: has, hard: has.filter(function (id) { return iss.some(function (x) { return x.id === id && x.hard; }); }).length };
		});
		var by = {}; iss.forEach(function (x) { by[x.id] = x; });
		var opts = '<option value="">All sections</option>' + d.sections.map(function (s, i) { return i === secHttrack ? '' : '<option value="' + i + '">' + esc(s[1]) + '</option>'; }).join('');
		$('sx-ssec').innerHTML = opts; $('sx-sgen').textContent = 'data of ' + d.generated + ', ' + fmt(rows.length) + ' pages';
		return { rows: rows, iss: iss, by: by, sections: d.sections };
	}
	function siteFiltered() {
		var q = sv2.q.toLowerCase();
		var out = SITE.rows.filter(function (r) { return r.iss.length && (!sv2.i || r.iss.indexOf(sv2.i) >= 0) && (sv2.sec === '' || String(r.sec) === sv2.sec) && (!q || r.url.toLowerCase().indexOf(q) >= 0 || r.title.toLowerCase().indexOf(q) >= 0); });
		var k = sv2.sort;
		out.sort(function (a, b) { return k === 'url' ? (a.url < b.url ? -1 : 1) : k === 'desc' ? a.desc - b.desc : k === 'words' ? a.words - b.words : k === 'tlen' ? b.title.length - a.title.length : (b.hard - a.hard) || (b.iss.length - a.iss.length) || (a.url < b.url ? -1 : 1); });
		return out;
	}
	function drawSite() {
		if (!SITE) return;
		var all = SITE.rows, withI = all.filter(function (r) { return r.iss.length; }), hard = all.filter(function (r) { return r.hard; });
		$('sx-sstats').innerHTML = '<div class="tu-stat tu-stat--hero"><div class="tu-stat__label">Pages checked</div><div class="tu-stat__value">' + fmt(all.length) + '</div></div><div class="tu-stat"><div class="tu-stat__label">With an SEO issue</div><div class="tu-stat__value">' + fmt(withI.length) + '</div><div class="tu-stat__sub">' + Math.round(withI.length / Math.max(1, all.length) * 100) + '% of pages</div></div><div class="tu-stat"><div class="tu-stat__label">With a serious issue</div><div class="tu-stat__value">' + fmt(hard.length) + '</div><div class="tu-stat__sub">missing title, description, h1, canonical&hellip;</div></div>';
		$('sx-ichips').innerHTML = '<button type="button" class="tu-chip" data-i="" aria-pressed="' + (!sv2.i) + '">All issues</button>' + SITE.iss.map(function (x) { var c = all.filter(function (r) { return r.iss.indexOf(x.id) >= 0; }).length; return c ? '<button type="button" class="tu-chip' + (x.hard ? ' sx-chip--hard' : '') + '" data-i="' + x.id + '" aria-pressed="' + (sv2.i === x.id) + '" title="' + esc(x.fix) + '">' + esc(x.label) + ' <b>' + fmt(c) + '</b></button>' : ''; }).join('');
		var rows = siteFiltered(), pages = Math.max(1, Math.ceil(rows.length / PER)); if (sv2.p > pages) sv2.p = pages;
		var slice = rows.slice((sv2.p - 1) * PER, sv2.p * PER);
		$('sx-scount').textContent = fmt(rows.length) + ' page' + (rows.length === 1 ? '' : 's') + (sv2.i ? ' with “' + SITE.by[sv2.i].label + '”' : ' with at least one issue') + (sv2.i ? '. How to fix: ' + SITE.by[sv2.i].fix : '');
		$('sx-slist').innerHTML = rows.length ? '<div class="tu-table-wrap"><table class="tu-table sx-stable"><thead><tr><th scope="col">Page</th><th scope="col">Issues</th><th scope="col">Desc.</th><th scope="col">Words</th><th scope="col"><span class="sx-sr">Check</span></th></tr></thead><tbody>' + slice.map(function (r) {
			return '<tr><td data-label="Page"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.title || r.url) + '</a><div class="sx-surl">' + esc(r.url) + '</div></td><td data-label="Issues">' + r.iss.map(function (id) { var x = SITE.by[id]; return '<span class="sx-ipill' + (x.hard ? ' sx-ipill--hard' : '') + '" title="' + esc(x.fix) + '">' + esc(x.label) + '</span>'; }).join('') + '</td><td data-label="Description">' + (r.desc ? r.desc + ' ch' : '&mdash;') + '</td><td data-label="Words">' + fmt(r.words) + '</td><td><button type="button" class="tu-btn sx-scheck" data-check="' + esc(r.url) + '">Check</button></td></tr>';
		}).join('') + '</tbody></table></div>' : '<p class="tu-note">No page matches. Try another issue or clear the search.</p>';
		$('sx-pager').innerHTML = pages > 1 ? '<button type="button" class="tu-btn tu-btn--ghost" data-pg="' + (sv2.p - 1) + '"' + (sv2.p <= 1 ? ' disabled' : '') + '>&larr; Previous</button><span>Page ' + sv2.p + ' of ' + pages + '</span><button type="button" class="tu-btn tu-btn--ghost" data-pg="' + (sv2.p + 1) + '"' + (sv2.p >= pages ? ' disabled' : '') + '>Next &rarr;</button>' : '';
	}
	$('sx-ichips').addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (!b) return; sv2.i = b.getAttribute('data-i'); sv2.p = 1; drawSite(); setQuery({ tab: 'site', i: sv2.i }); });
	$('sx-sq').addEventListener('input', function () { sv2.q = this.value.trim(); sv2.p = 1; drawSite(); });
	$('sx-ssec').addEventListener('change', function () { sv2.sec = this.value; sv2.p = 1; drawSite(); });
	$('sx-ssort').addEventListener('change', function () { sv2.sort = this.value; drawSite(); });
	$('sx-pager').addEventListener('click', function (e) { var b = e.target.closest('[data-pg]'); if (!b || b.disabled) return; sv2.p = +b.getAttribute('data-pg'); drawSite(); $('sx-scount').scrollIntoView({ block: 'start' }); });
	$('sx-slist').addEventListener('click', function (e) { var b = e.target.closest('[data-check]'); if (!b) return; $('sx-q').value = 'https://mes.fm' + b.getAttribute('data-check'); showTab('check'); window.scrollTo({ top: $('sx-p-check').getBoundingClientRect().top + window.pageYOffset - 80 }); go(); });
	$('sx-scopy').onclick = function () { if (!SITE) return; var rows = siteFiltered(); copy(['Page\tTitle\tIssues\tDescription length\tWords'].concat(rows.map(function (r) { return 'https://mes.fm' + r.url + '\t' + r.title + '\t' + r.iss.map(function (id) { return SITE.by[id].label; }).join('; ') + '\t' + r.desc + '\t' + r.words; })).join('\n'), fmt(rows.length) + ' pages copied'); };

	// ---------- start ----------
	drawRecent();
	var qs = new URLSearchParams(location.search), u0 = qs.get('u') || qs.get('url');
	if (qs.get('i')) sv2.i = qs.get('i');
	if (qs.get('demo')) { showTab('check'); demo(); }
	else if (u0) { showTab('check'); $('sx-q').value = u0; go(); }
	else showTab(qs.get('tab') === 'site' ? 'site' : st.tab);
})();
