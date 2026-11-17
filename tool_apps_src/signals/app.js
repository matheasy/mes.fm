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
