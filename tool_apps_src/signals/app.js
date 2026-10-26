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
