/* MES Telegram Archive page (mes.fm/telegram). Data: /telegram/data/index.json + c<k>.json (update_telegram_archive.py);
 * newest posts after the snapshot: /api/tg-latest. Helpers: MESTg (lib.js). */
(function () {
	'use strict';
	var T = window.MESTg, root = document.getElementById('tga');
	if (!T || !root) return;
	function $(id) { return document.getElementById(id); }
	var esc = T.esc, KEY = 'mes-telegram:v1', LKEY = 'mes-telegram:latest', PER = { grid: 36, list: 60 };
	var idx = null, chunks = {}, posts = [], allLoaded = false, loading = null, fresh = [], st = T.parseQuery(location.search), shown = [], open = {};
	try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); if (!/[?&]view=/.test(location.search) && saved.view) st.view = saved.view; } catch (e) { }
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
		try { localStorage.setItem(KEY, JSON.stringify({ view: st.view })); } catch (e) { }
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
		if (p._new) h += '<span class="tga-badge">New</span> ';
		if (p.f) h += '<div class="tga-fw">Forwarded from ' + (p.fu ? '<a href="' + esc(p.fu) + '" target="_blank" rel="noopener nofollow">' + esc(p.f) + '</a>' : esc(p.f)) + '</div>';
		if (p.dt) h += '<div class="tga-dt">' + (p.m === 'o' ? '📊 ' : '📄 ') + esc(p.dt) + '</div>';
		if (p.t) {
			var long = p.t.length > max + 20, full = open[p.i];
			h += '<div class="tga-text">' + T.textHtml(p.t, long && !full ? max : 0) + '</div>';
			if (long) h += '<button type="button" class="tga-more" data-i="' + p.i + '">' + (full ? 'Show less' : 'Show more') + '</button>';
		} else if (!p.dt) h += '<div class="tga-text tga-empty">' + esc(MEDIA_NAME[p.m] || 'Post') + ' without text</div>';
		if (p.pv && (p.pv.t || p.pv.s)) h += '<a class="tga-pv" href="' + esc(p.pv.u) + '" target="_blank" rel="noopener nofollow ugc">' + (p.pv.s ? '<b>' + esc(p.pv.s) + '</b>' : '') + (p.pv.t ? '<span>' + esc(p.pv.t) + '</span>' : '') + '</a>';
		return h;
	}
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
		else h = '<div class="tga-' + st.view + '">' + items.map(function (p) {
			return '<article class="tga-item' + (p._new ? ' tga-item--new' : '') + '">' + thumb(p) + '<div class="tga-body"><div class="tga-meta">' + meta(p) + '</div>' + body(p) + '<div class="tga-pls">' + pills(p) + '</div></div></article>';
		}).join('') + '</div>';
		$('tga-res').innerHTML = h;
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
