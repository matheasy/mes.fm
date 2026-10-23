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
