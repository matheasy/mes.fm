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
