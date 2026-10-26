/* MES Debt Clock UI. Data = /api/debt (one aggregator, edge-cached about an hour); parsing / maths = MESDebt (lib.js).
   ?mock=1 and local previews (no /api there) read the committed snapshot mes.fm/debt-clock/data/sample.json; when one source fails
   live, that part falls back to the snapshot too and the page says so. Settings in localStorage mes-debt-clock:v1. Informational only. */
(function () {
	'use strict';
	var D = window.MESDebt, $ = function (id) { return document.getElementById(id); }, root = $('dc');
	if (!D || !root) return;
	var KEY = 'mes-debt-clock:v1', KEYS = ['tab', 'cur', 'uw', 'cw', 'hr', 'hs', 'wm', 'wsort', 'wdir', 'year', 'big'];
	var st = { tab: 'us', cur: 'native', uw: 90, cw: 12, hr: 'all', hs: 'log', wm: 'pct', wsort: 'pct', wdir: -1, year: null, big: 'us' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); KEYS.forEach(function (k) { if (sv[k] != null) st[k] = sv[k]; }); } catch (e) {}
	var qs = new URLSearchParams(location.search), MOCK = qs.get('mock') === '1' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	if (/^(us|world|ca)$/.test(qs.get('tab') || '')) st.tab = qs.get('tab');
	function save() { try { var o = {}; KEYS.forEach(function (k) { o[k] = st[k]; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function q(k) { var g = D.GLOSSARY[k]; return g ? '<button type="button" class="dc-q" data-g="' + k + '" aria-label="' + esc('What is ' + g[0] + '?') + '">?</button>' : ''; }
	var data = null, stale = {}, sample = null, opened = Date.now();
	function src(n) { return data && data.sources[n] && data.sources[n].ok ? data.sources[n].data : null; }
	function dlong(s) { if (!s) return ''; var d = new Date(s.length === 10 ? s + 'T12:00:00Z' : s); return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: s.length === 10 ? 'UTC' : undefined }); }
	function dmon(s) { var d = new Date(s.slice(0, 7) + '-15T00:00:00Z'); return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' }); }

	// ---------- currency ----------
	function fx() { var f = src('fx'); return f && f.usdcad; }
	function curOf(native) { return st.cur === 'native' || !fx() ? native : st.cur; }
	function money(v, native, kind, dg) { var c = curOf(native), x = D.convert(v, native, c, fx()); return kind === 'full' ? D.full(x, c, dg) : D.big(x, c, dg); }
	function moneySmall(v, native) { var c = curOf(native), x = D.convert(v, native, c, fx()); return D.full(x, c, Math.abs(x) < 10 ? 2 : 0); }

	// ---------- tabs ----------
	var TABS = ['us', 'world', 'ca'];
	function showTab(t, focus) {
		st.tab = t; save();
		[].forEach.call($('dc-tabs').querySelectorAll('[role=tab]'), function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		TABS.forEach(function (x) { $('dc-p-' + x).hidden = x !== t; });
		if (data) drawTab(t);
	}
	$('dc-tabs').addEventListener('click', function (e) { var b = e.target.closest('[role=tab]'); if (b) showTab(b.getAttribute('data-tab')); });
	$('dc-tabs').addEventListener('keydown', function (e) { var i = TABS.indexOf(st.tab); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); showTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3], true); } });
	$('dc-cur').value = st.cur;
	$('dc-cur').addEventListener('change', function () { st.cur = this.value; save(); buildClocks(); drawTab(st.tab); });

	// ---------- glossary popover ----------
	var pop = $('dc-pop'), popFor = null;
	function closePop() { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; }
	root.addEventListener('click', function (e) {
		var b = e.target.closest('.dc-q');
		if (b) {
			e.preventDefault(); e.stopPropagation();
			if (popFor === b) return closePop();
			var g = D.GLOSSARY[b.getAttribute('data-g')]; if (!g) return;
			closePop(); popFor = b; b.setAttribute('aria-expanded', 'true');
			pop.querySelector('.dc-pop__t').textContent = g[0]; pop.querySelector('.dc-pop__p').textContent = g[1]; pop.hidden = false;
			var r = b.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24), left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
			pop.style.width = w + 'px'; pop.style.left = left + 'px';
			var h = pop.offsetHeight, top = r.bottom + 8; if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
			pop.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
			return;
		}
		if (!pop.hidden && !e.target.closest('.dc-pop')) closePop();
	});
	pop.querySelector('.dc-pop__x').onclick = closePop;
	window.addEventListener('scroll', function () { if (!pop.hidden) closePop(); }, { passive: true });

	// ---------- segmented controls ----------
	function segs() {
		[].forEach.call(root.querySelectorAll('[data-set]'), function (g) { var k = g.getAttribute('data-set'); [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === String(st[k]))); }); });
		[].forEach.call(root.querySelectorAll('[data-win]'), function (g) { var k = g.getAttribute('data-win') === 'us' ? 'uw' : 'cw'; [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-d') === +st[k])); }); });
	}
	root.addEventListener('click', function (e) {
		var b = e.target.closest('[data-set] button');
		if (b) { st[b.parentNode.getAttribute('data-set')] = b.getAttribute('data-v'); save(); segs(); drawTab(st.tab); return; }
		b = e.target.closest('[data-win] button');
		if (b) { st[b.parentNode.getAttribute('data-win') === 'us' ? 'uw' : 'cw'] = +b.getAttribute('data-d'); save(); segs(); buildClocks(); drawTab(st.tab); return; }
		b = e.target.closest('[data-big]'); if (b) return openBig(b.getAttribute('data-big'), false);
		b = e.target.closest('[data-fs]'); if (b) return openBig(b.getAttribute('data-fs'), true);
	});

	// ---------- charts: plain SVG sized to the box, hover / touch readout ----------
	var tip = $('dc-tip');
	function niceTicks(y0, y1, n) { var st2 = (y1 - y0) / (n || 4), m = Math.pow(10, Math.floor(Math.log10(st2 || 1))), s2 = [1, 2, 2.5, 5, 10].map(function (k) { return k * m; }).find(function (k) { return k >= st2; }) || st2, r = [], v; for (v = Math.ceil(y0 / s2) * s2; v <= y1 + 1e-9 * Math.abs(y1); v += s2) r.push(+v.toPrecision(12)); return r; }
	// o: {series:[{pts:[[ms, v, label]], cls, name}], log, bars, fy (tick format), fv (value format), fx (x label), h, zero}
	function chart(box, o) {
		var W = Math.max(260, box.clientWidth || 600), H = o.h || (W < 500 ? 200 : 250), pl = W < 420 ? 40 : 50, pr = 10, pt = 12, pb = 24, all = [];
		o.series.forEach(function (s) { s.p = s.pts.filter(function (p) { return p[1] != null && (!o.log || p[1] > 0); }); all = all.concat(s.p); });
		if (!all.length) { box.innerHTML = '<p class="tu-note">No data.</p>'; return; }
		var xs = all.map(function (p) { return p[0]; }), ys = all.map(function (p) { return p[1]; });
		var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
		if (o.bars) { var bw = (x1 - x0) / Math.max(1, all.length - 1) / 2; x0 -= bw; x1 += bw; }
		var T = o.log ? function (v) { return Math.log10(v); } : function (v) { return v; };
		if (o.log) { y0 = Math.pow(10, Math.floor(Math.log10(y0))); y1 = Math.pow(10, Math.ceil(Math.log10(y1))); }
		else { if (o.zero !== false) y0 = Math.min(0, y0); var pad = (y1 - y0) * 0.06 || 1; y1 += pad; if (y0 < 0) y0 -= pad; }
		var X = function (t) { return pl + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - pl - pr); }, Y = function (v) { return pt + (1 - (T(v) - T(y0)) / (T(y1) - T(y0) || 1)) * (H - pt - pb); }, out = [];
		var ticks = []; if (o.log) { for (var e = Math.log10(y0); e <= Math.log10(y1) + 1e-9; e++) ticks.push(Math.pow(10, e)); if (ticks.length > 7) ticks = ticks.filter(function (v, i) { return i % 2 === 0; }); } else ticks = niceTicks(y0, y1, W < 500 ? 3 : 4);
		ticks.forEach(function (v) { if (v < y0 || v > y1) return; out.push('<line class="dc-grid' + (v === 0 ? ' dc-zero' : '') + '" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"></line><text class="dc-ax" x="' + (pl - 5) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc((o.fy || D.short)(v)) + '</text>'); });
		var span = x1 - x0, nx = W < 500 ? 3 : 5;
		for (var i = 0; i <= nx; i++) { var t = x0 + span * i / nx; out.push('<text class="dc-ax" x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === nx ? 'end' : 'middle') + '">' + esc((o.fx || function (ms) { var d = new Date(ms); return span > 4 * 365 * 864e5 ? String(d.getUTCFullYear()) : d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }); })(t)) + '</text>'); }
		o.series.forEach(function (s) {
			if (!s.p.length) return;
			if (o.bars) {
				var w = Math.max(1.5, (W - pl - pr) / s.p.length * 0.7), zy = Y(o.log ? y0 : 0);
				s.p.forEach(function (p) { var y = Y(p[1]); out.push('<rect class="dc-bar ' + (s.cls || '') + (p[1] < 0 ? ' dc-bar--neg' : '') + '" x="' + (X(p[0]) - w / 2).toFixed(1) + '" y="' + Math.min(y, zy).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(1, Math.abs(zy - y)).toFixed(1) + '"></rect>'); });
				return;
			}
			var d = s.p.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('');
			if (s.fill) out.push('<path class="dc-fill ' + s.cls + '" d="' + d + 'L' + X(s.p[s.p.length - 1][0]).toFixed(1) + ' ' + (H - pb) + 'L' + X(s.p[0][0]).toFixed(1) + ' ' + (H - pb) + 'Z"></path>');
			out.push('<path class="dc-line ' + (s.cls || '') + '" d="' + d + '"></path>');
		});
		out.push('<line class="dc-cross" x1="-9" x2="-9" y1="' + pt + '" y2="' + (H - pb) + '"></line><circle class="dc-dot" r="4" cx="-9" cy="-9"></circle>');
		box.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Chart') + '">' + out.join('') + '</svg>';
		var svg = box.firstChild, cross = svg.querySelector('.dc-cross'), dot = svg.querySelector('.dc-dot'), s0 = o.series[0];
		function at(ev) {
			var r = svg.getBoundingClientRect(), mx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, tt = x0 + (mx - pl) / (W - pl - pr) * span, p = null, bd = Infinity;
			s0.p.forEach(function (q2) { var dd = Math.abs(q2[0] - tt); if (dd < bd) { bd = dd; p = q2; } });
			if (!p) return hide();
			cross.setAttribute('x1', X(p[0])); cross.setAttribute('x2', X(p[0])); dot.setAttribute('cx', X(p[0])); dot.setAttribute('cy', Y(p[1]));
			tip.hidden = false; tip.innerHTML = '<b>' + esc(p[2]) + '</b><br>' + esc((o.fv || o.fy || D.short)(p[1]));
			var tw = tip.offsetWidth, x = r.left + X(p[0]); tip.style.left = Math.min(Math.max(8, x - tw / 2), window.innerWidth - tw - 8) + 'px'; tip.style.top = Math.max(8, r.top + 4 - tip.offsetHeight - 6) + 'px';
		}
		function hide() { tip.hidden = true; cross.setAttribute('x1', -9); cross.setAttribute('x2', -9); dot.setAttribute('cx', -9); }
		svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at); svg.addEventListener('pointerleave', hide);
		box._redraw = function () { chart(box, o); };
	}
	// horizontal bars (country chart)
	function hbars(box, items, fv) {
		if (!items.length) { box.innerHTML = '<p class="tu-note">No countries to show.</p>'; return; }
		var mx = Math.max.apply(null, items.map(function (x) { return x.v; })) || 1;
		box.innerHTML = '<ol class="dc-hb">' + items.map(function (x) { return '<li class="' + (x.code === 'USA' ? 'dc-hb--us' : x.code === 'CAN' ? 'dc-hb--ca' : '') + '"><span class="dc-hb__n">' + esc(x.name) + '</span><span class="dc-hb__t"><i style="width:' + Math.max(0.5, x.v / mx * 100).toFixed(1) + '%"></i></span><span class="dc-hb__v">' + esc(fv(x.v)) + '</span></li>'; }).join('') + '</ol>';
	}
	var ro = window.ResizeObserver ? new ResizeObserver(function (ents) { ents.forEach(function (en) { var b = en.target; if (b._w !== Math.round(en.contentRect.width) && b._redraw) { b._w = Math.round(en.contentRect.width); b._redraw(); } }); }) : null;
	if (ro) [].forEach.call(root.querySelectorAll('.dc-chart'), function (b) { ro.observe(b); });
	function ms(s) { return Date.parse(s.length === 4 ? s + '-07-01T00:00:00Z' : s.slice(0, 10) + 'T00:00:00Z'); }

	// ---------- the clocks (each = base value at t0 + perMs; values in the clock's own currency) ----------
	var CL = {};
	function usCounts() {
		var f = src('fred') || {}, pop = f.pop && D.last(f.pop), hh = f.hh && D.last(f.hh);
		return { people: pop ? pop[1] * 1000 : null, households: hh ? hh[1] * 1000 : null, taxpayers: D.TAXPAYERS, popDate: pop && pop[0], hhDate: hh && hh[0] };
	}
	function buildClocks() {
		CL = {};
		var p = src('penny');
		if (p) {
			var r = D.rateOver(p.rows, st.uw), rp = D.rateOver(p.rows, st.uw, 2), ri = D.rateOver(p.rows, st.uw, 3);
			if (r) CL.us = { cur: 'USD', base: p.latest.total, t0: D.asOfMs(p.latest.date), perMs: r.perMs, rate: r, date: p.latest.date, pub: [p.latest.public, rp ? rp.perMs : 0], intra: [p.latest.intragov, ri ? ri.perMs : 0], label: 'US national debt', counts: usCounts() };
		}
		var imf = src('imf');
		if (imf) {
			var y = new Date().getUTCFullYear(), a = D.worldTotal(imf, y - 1), b = D.worldTotal(imf, y);
			if (a.viaRatio && b.viaRatio) { var l = D.yearLine(a.viaRatio, b.viaRatio, y - 1, y); CL.world = { cur: 'USD', base: l.base, t0: l.t0, perMs: l.perMs, line: l, a: a, b: b, label: 'World government debt', pop: b.pop }; }
		}
		var c = src('canada');
		if (c && c.fed) {
			var cc = D.canadaClock(c.fed, st.cw);
			if (cc) CL.ca = { cur: 'CAD', base: cc.base, t0: cc.t0, perMs: cc.rate.perMs, rate: cc.rate, date: cc.date, label: 'Canada’s federal debt', pop: c.pop && c.pop[1], gdp: c.gdp && c.gdp[1] };
		}
	}
	function now(k, t) { var c = CL[k]; return c ? D.estimate(c.base, c.t0, c.perMs, t || Date.now()) : null; }
	function perSecText(c) { var v = D.convert(c.perMs * 1000, c.cur, curOf(c.cur), fx()); return (v >= 0 ? '+' : '') + D.full(v, curOf(c.cur), Math.abs(v) < 100 ? 2 : 0) + ' a second'; }

	// ticking: update visible numbers ~10 times a second (setInterval, so it keeps going where requestAnimationFrame is paused)
	function tick() {
		var t = Date.now();
		['us', 'world', 'ca'].forEach(function (k) {
			var c = CL[k], el = $('dc-' + (k === 'world' ? 'w' : k) + '-num'); if (!c || !el || el.offsetParent === null) return;
			el.textContent = money(now(k, t), c.cur, 'full');
			var so = $('dc-' + k + '-since'); if (so) so.textContent = (c.perMs >= 0 ? '+' : '') + moneySmall(c.perMs * (t - opened), c.cur);
			var pp = $('dc-' + k + '-pp'); if (pp) { var cnt = k === 'us' ? c.counts.people : c.pop; if (cnt) pp.textContent = moneySmall(now(k, t) / cnt, c.cur); }
		});
		if (!bv.hidden) bigTick(t);
	}
	setInterval(tick, 100);

	// ---------- US tab ----------
	function tile(label, val, sub, g, id) { return '<div class="tu-stat dc-tile"><span class="tu-stat__label">' + label + (g ? ' ' + q(g) : '') + '</span><span class="tu-stat__value"' + (id ? ' id="' + id + '"' : '') + '>' + val + '</span>' + (sub ? '<span class="tu-stat__sub">' + sub + '</span>' : '') + '</div>'; }
	function err(n) { var s = data && data.sources[n]; return '<p class="tu-note dc-err">Could not load this right now' + (s && s.error ? ' (' + esc(s.error) + ')' : '') + '.</p>'; }
	function staleNote(names) { var s = names.filter(function (n) { return stale[n]; }); return s.length ? ' <span class="dc-stale">Live data did not answer; showing the saved copy from ' + esc(dlong(sample && sample.generated)) + '.</span>' : ''; }
	function drawUS() {
		var c = CL.us, p = src('penny'), f = src('fred') || {};
		if (!c) { $('dc-us-num').textContent = '–'; $('dc-us-how').innerHTML = err('penny'); return; }
		$('dc-us-rate').textContent = perSecText(c) + ' · ' + money(c.perMs * 864e5, 'USD', 'big') + ' a day';
		$('dc-us-how').innerHTML = 'Treasury&rsquo;s last figure: <b>' + esc(money(c.base, 'USD', 'full')) + '</b> at the close of business on ' + esc(dlong(c.date)) + '. Since then the page adds the average change of ' + esc(money(c.rate.perDay, 'USD', 'big')) + ' a day from ' + esc(dlong(c.rate.from[0])) + ' to ' + esc(dlong(c.rate.to[0])) + ' (' + Math.round(c.rate.days) + ' days). Treasury updates once a business day.' + staleNote(['penny']);
		var cn = c.counts, est = now('us'), gdp = f.gdp && D.last(f.gdp), it = src('interest'), mts = src('mts'), o = [];
		o.push(tile('Per person', cn.people ? moneySmall(est / cn.people, 'USD') : '–', cn.people ? (cn.people / 1e6).toFixed(1) + ' million people (Census via FRED, ' + esc(dmon(cn.popDate)) + ')' : 'population did not load', 'perperson', 'dc-us-pp'));
		o.push(tile('Per household', cn.households ? moneySmall(est / cn.households, 'USD') : '–', cn.households ? (cn.households / 1e6).toFixed(1) + ' million households (Census, ' + esc(cn.hhDate.slice(0, 4)) + ')' : '', 'perperson'));
		o.push(tile('Per taxpayer', moneySmall(est / cn.taxpayers, 'USD'), esc(D.TAXPAYERS_NOTE), 'perperson'));
		if (gdp) o.push(tile('Debt-to-GDP', D.pct(est / (gdp[1] * 1e9) * 100), 'GDP ' + esc(money(gdp[1] * 1e9, 'USD', 'big')) + ' a year (' + esc(dmon(gdp[0])) + ' quarter, annual rate)', 'debtgdp'));
		o.push(tile('Added since you opened this page', '<span id="dc-us-since">$0</span>', 'at the estimated rate', 'estimate'));
		var ms1 = D.nextMilestone(est, 1e12), at = D.reachAt(c.base, c.t0, c.perMs, ms1);
		o.push(tile('Next trillion', esc(money(ms1, 'USD', 'big', 0)), at ? 'around ' + esc(new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) + ' at this rate' : 'not at the current rate (the debt is falling)'));
		if (it) {
			var ps = it.ttmPublic / D.SEC_YEAR;
			o.push(tile('Interest, per second', esc(moneySmall(ps, 'USD')), esc(money(ps * 86400, 'USD', 'big')) + ' a day · ' + esc(money(it.ttmPublic, 'USD', 'big')) + ' in the 12 months to ' + esc(dmon(it.asOf)), 'interest'));
			if (mts) {
				var all = (mts.prev ? mts.prev.months : []).concat(mts.months).slice(-12), rc = 0, df = 0; all.forEach(function (m) { rc += m.rcpt || 0; df += m.deficit || 0; });
				if (rc) o.push(tile('Interest per tax dollar', Math.round(it.ttmPublic / rc * 100) + '¢', 'of every dollar the government took in over the last 12 months', 'interest'));
				o.push(tile('Deficit, per second', esc(moneySmall(df / D.SEC_YEAR, 'USD')), esc(money(df, 'USD', 'big')) + ' over the last 12 months', 'deficit'));
			}
		}
		if (mts) o.push(tile('Deficit, fiscal year ' + mts.fy + (mts.monthsIn < 12 ? ' so far' : ''), esc(money(mts.ytd.deficit, 'USD', 'big')), mts.monthsIn < 12 ? mts.monthsIn + ' of 12 months (to ' + esc(dlong(mts.asOf)) + ')' : 'the whole year, October ' + (mts.fy - 1) + ' to September ' + mts.fy, 'deficit'));
		var ar = src('avgRate'); if (ar) o.push(tile('Average interest rate', D.pct(ar.latest[1], 2), 'on all interest-bearing debt, ' + esc(dmon(ar.latest[0])), 'avgrate'));
		$('dc-us-tiles').innerHTML = o.join('');
		// public vs intragovernmental
		var pub = c.pub[0], intra = c.intra[0], tot = pub + intra;
		$('dc-split').innerHTML = '<div class="dc-split" role="img" aria-label="' + esc('Held by the public ' + D.pct(pub / tot * 100) + ', intragovernmental ' + D.pct(intra / tot * 100)) + '"><span class="dc-split__a" style="width:' + (pub / tot * 100).toFixed(2) + '%"></span><span class="dc-split__b" style="width:' + (intra / tot * 100).toFixed(2) + '%"></span></div>' +
			'<div class="dc-legend"><span><i class="dc-sw dc-sw--a"></i>Held by the public: <b>' + esc(money(pub, 'USD', 'big')) + '</b> (' + D.pct(pub / tot * 100) + ', ' + esc(money(c.pub[1] * 864e5, 'USD', 'big')) + ' a day on average)</span><span><i class="dc-sw dc-sw--b"></i>Intragovernmental: <b>' + esc(money(intra, 'USD', 'big')) + '</b> (' + D.pct(intra / tot * 100) + ', ' + esc(money(c.intra[1] * 864e5, 'USD', 'big')) + ' a day)</span></div><p class="tu-note">As of ' + esc(dlong(c.date)) + '.</p>';
		drawUSCharts();
	}
	function conv(v, native) { return D.convert(v, native, curOf(native), fx()); }
	function fyMoney(native) { return function (v) { return D.big(v, curOf(native), 1); }; }
	function drawUSCharts() {
		var h = src('history'), p = src('penny'), f = src('fred') || {}, cur = curOf('USD');
		var fy = function (v) { return D.sym(cur) + D.short(v); };
		if (h || p) {
			var pts;
			if (st.hr === '1y' && p) pts = p.rows.filter(function (r) { return r[0] >= D.addDays(p.latest.date, -365); }).map(function (r) { return [ms(r[0]), conv(r[1], 'USD'), dlong(r[0])]; });
			else {
				pts = (h || []).filter(function (r) { return st.hr !== '1940' || r[0] >= '1940'; }).map(function (r) { return [ms(r[0]), conv(r[1], 'USD'), dlong(r[0])]; });
				if (p && (!h || p.latest.date > h[h.length - 1][0])) pts.push([ms(p.latest.date), conv(p.latest.total, 'USD'), dlong(p.latest.date)]);
			}
			$('dc-hist-title').textContent = st.hr === '1y' ? 'US debt, last 12 months (daily)' : st.hr === '1940' ? 'US debt since 1940' : 'US debt since 1790';
			chart($('dc-hist-chart'), { series: [{ pts: pts, cls: 'dc-s1', fill: st.hs === 'lin' }], log: st.hs === 'log', fy: fy, fv: function (v) { return D.full(v, cur); }, zero: st.hr !== '1y', label: 'US total public debt' });
			$('dc-hist-note').innerHTML = st.hr === '1y' ? 'Daily Debt to the Penny. The steps are real: Treasury borrows in lumps on auction days, which is why the clock uses an average.' : 'Historical Debt Outstanding (Treasury): one value per year (January 1 until 1843, then July 1 / June 30, and September 30 since 1977, when the fiscal year changed), not adjusted for inflation. ' + (st.hs === 'log' ? 'Log scale: each grid line is 10 times the one below, so equal growth rates look like equal slopes.' : 'Linear scale: switch to Log to see the early years.');
		} else $('dc-hist-chart').innerHTML = err('history');
		if (f.ratio) chart($('dc-ratio-chart'), { series: [{ pts: f.ratio.map(function (r) { return [ms(r[0]), r[1], dmon(r[0])]; }), cls: 'dc-s2', fill: true }], fy: function (v) { return v + '%'; }, fv: function (v) { return D.pct(v); }, label: 'US debt to GDP' });
		else $('dc-ratio-chart').innerHTML = err('fred');
		var fyi = src('interestFy');
		if (fyi) chart($('dc-int-chart'), { bars: true, series: [{ pts: fyi.map(function (r) { return [ms(String(r[0])), conv(r[1], 'USD'), 'Fiscal year ' + r[0]]; }), cls: 'dc-s3' }], fy: fy, fv: fyMoney('USD'), fx: function (t) { return 'FY' + new Date(t).getUTCFullYear(); }, h: 210, label: 'Interest by fiscal year' });
		else $('dc-int-chart').innerHTML = err('interestFy');
		var ar = src('avgRate');
		if (ar) chart($('dc-rate-chart'), { series: [{ pts: ar.series.map(function (r) { return [ms(r[0]), r[1], dmon(r[0])]; }), cls: 'dc-s3' }], fy: function (v) { return v + '%'; }, fv: function (v) { return D.pct(v, 3); }, h: 210, label: 'Average interest rate' });
		else $('dc-rate-chart').innerHTML = err('avgRate');
		var mts = src('mts');
		if (mts) {
			var rows = [];
			function add(blk) { blk.months.forEach(function (m, i) { var mi = ['October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September'].indexOf(m.name); if (mi < 0 || m.deficit == null) return; var yr = mi < 3 ? blk.fy - 1 : blk.fy, mo = (mi + 9) % 12 + 1; rows.push([Date.UTC(yr, mo - 1, 15), conv(m.deficit, 'USD'), m.name + ' ' + yr]); }); }
			if (mts.prev) add(mts.prev); add(mts);
			$('dc-def-sub').textContent = 'fiscal years ' + (mts.prev ? mts.prev.fy + '–' : '') + mts.fy;
			chart($('dc-def-chart'), { bars: true, series: [{ pts: rows, cls: 'dc-s1' }], fy: fy, fv: function (v) { return (v < 0 ? 'Surplus ' : 'Deficit ') + D.big(Math.abs(v), cur, 1); }, h: 210, label: 'Deficit by month' });
		} else $('dc-def-chart').innerHTML = err('mts');
	}

	// ---------- World tab ----------
	function drawWorld() {
		var imf = src('imf'), c = CL.world;
		if (!imf) { $('dc-w-num').textContent = '–'; $('dc-w-how').innerHTML = err('imf'); $('dc-w-bars').innerHTML = ''; return; }
		if (c) {
			$('dc-w-rate').textContent = perSecText(c) + ' · ' + money(c.perMs * 864e5, 'USD', 'big') + ' a day';
			$('dc-w-how').innerHTML = 'IMF estimates of world government debt: <b>' + esc(money(c.a.viaRatio, 'USD', 'big')) + '</b> for ' + c.a.year + ' and <b>' + esc(money(c.b.viaRatio, 'USD', 'big')) + '</b> for ' + c.b.year + ' (the IMF world ratio of ' + D.pct(c.a.worldPct) + ' and ' + D.pct(c.b.worldPct) + ' of world GDP). The clock draws a straight line between the two year-end figures. Adding up the ' + c.b.n + ' countries one by one gives ' + esc(money(c.b.sum, 'USD', 'big')) + ' for ' + c.b.year + '.' + staleNote(['imf']);
			var us = CL.us ? now('us') : null, o = [];
			if (c.pop) o.push(tile('Per person on Earth', '<span id="dc-world-pp">–</span>', (c.pop / 1e9).toFixed(2) + ' billion people (IMF, ' + c.b.year + ')', 'perperson'));
			o.push(tile('Share of world GDP', D.pct(c.b.worldPct), 'IMF, ' + c.b.year, 'debtgdp'));
			var usI = D.countryTable(imf, c.b.year).find(function (r) { return r.code === 'USA'; });
			if (usI && usI.debt) o.push(tile('United States&rsquo; share', D.pct(usI.debt / c.b.viaRatio * 100), 'of world government debt (IMF, ' + c.b.year + ')'));
			o.push(tile('Added since you opened this page', '<span id="dc-world-since">$0</span>', 'at the estimated rate', 'estimate'));
			$('dc-w-tiles').innerHTML = o.join('');
		}
		var ysel = $('dc-year'), yrs = imf.years, cy = String(new Date().getUTCFullYear());
		if (!st.year || yrs.indexOf(String(st.year)) < 0) st.year = yrs.indexOf(cy) >= 0 ? cy : yrs[yrs.length - 1];
		ysel.innerHTML = yrs.map(function (y) { return '<option value="' + y + '"' + (String(st.year) === y ? ' selected' : '') + '>' + y + (y > cy ? ' (projection)' : y === cy ? ' (estimate)' : '') + '</option>'; }).join('');
		drawWorldTable();
	}
	function fmtMetric(k) { var cur = curOf('USD'); return k === 'pct' ? function (v) { return D.pct(v); } : k === 'pp' || k === 'perPerson' ? function (v) { return D.full(conv(v, 'USD'), cur); } : function (v) { return D.big(conv(v, 'USD'), cur, 1); }; }
	function drawWorldTable() {
		var imf = src('imf'); if (!imf) return;
		var tab = D.countryTable(imf, st.year), f = ($('dc-find').value || '').trim().toLowerCase(), mk = st.wm === 'pp' ? 'perPerson' : st.wm;
		var ranked = tab.filter(function (r) { return r[mk] != null; }).sort(function (a, b) { return b[mk] - a[mk]; });
		ranked.forEach(function (r, i) { r.rank = i + 1; });
		var top = ranked.slice(0, 20), extra = ranked.filter(function (r) { return (r.code === 'USA' || r.code === 'CAN') && r.rank > 20; });
		hbars($('dc-w-bars'), top.concat(extra).map(function (r) { return { name: (r.rank > 20 ? r.rank + '. ' : '') + r.name, code: r.code, v: r[mk] }; }), fmtMetric(st.wm));
		$('dc-w-bars')._redraw = null;
		var k = st.wsort, dir = st.wdir;
		var rows = tab.map(function (r) { var x = ranked.find(function (z) { return z.code === r.code; }); r.rank = x ? x.rank : null; return r; })
			.filter(function (r) { return !f || r.name.toLowerCase().indexOf(f) >= 0 || r.code.toLowerCase() === f; })
			.sort(function (a, b) { var va = a[k], vb = b[k]; if (k === 'name') return dir * (va < vb ? -1 : 1); if (va == null) return 1; if (vb == null) return -1; return dir * (va - vb); });
		$('dc-wcount').textContent = rows.length + ' of ' + tab.length + ' countries · ranked by ' + ({ pct: '% of GDP', debt: 'total debt', pp: 'debt per person' })[st.wm];
		var fd = fmtMetric('debt'), fp = fmtMetric('pp');
		$('dc-wtable').querySelector('tbody').innerHTML = rows.map(function (r) {
			return '<tr class="' + (r.code === 'USA' ? 'dc-tr--us' : r.code === 'CAN' ? 'dc-tr--ca' : '') + '"><td class="num">' + (r.rank || '') + '</td><td>' + esc(r.name) + '</td><td class="num">' + D.pct(r.pct) + '</td><td class="num">' + (r.debt != null ? esc(fd(r.debt)) : '–') + '</td><td class="num">' + (r.perPerson != null ? esc(fp(r.perPerson)) : '–') + '</td><td class="num">' + (r.gdp != null ? esc(fd(r.gdp)) : '–') + '</td></tr>';
		}).join('') || '<tr><td colspan="6">No country matches.</td></tr>';
		[].forEach.call($('dc-wtable').querySelectorAll('th'), function (th) { var on = th.getAttribute('data-k') === k; th.setAttribute('aria-sort', on ? (dir > 0 ? 'ascending' : 'descending') : 'none'); th.tabIndex = 0; });
	}
	$('dc-year').addEventListener('change', function () { st.year = this.value; save(); drawWorldTable(); });
	$('dc-find').addEventListener('input', drawWorldTable);
	function sortBy(th) { var k = th.getAttribute('data-k'); if (k === 'rank') k = st.wm === 'pp' ? 'perPerson' : st.wm; if (st.wsort === k) st.wdir = -st.wdir; else { st.wsort = k; st.wdir = k === 'name' ? 1 : -1; } save(); drawWorldTable(); }
	$('dc-wtable').querySelector('thead').addEventListener('click', function (e) { var th = e.target.closest('th'); if (th) sortBy(th); });
	$('dc-wtable').querySelector('thead').addEventListener('keydown', function (e) { var th = e.target.closest('th'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortBy(th); } });

	// ---------- Canada tab ----------
	function drawCA() {
		var c = CL.ca, ca = src('canada'), imf = src('imf');
		if (!c) { $('dc-ca-num').textContent = '–'; $('dc-ca-how').innerHTML = err('canada'); return; }
		$('dc-ca-rate').textContent = perSecText(c) + ' · ' + money(c.perMs * 864e5, 'CAD', 'big') + ' a day';
		$('dc-ca-how').innerHTML = 'Statistics Canada&rsquo;s last figure: <b>' + esc(money(c.base, 'CAD', 'full')) + '</b> at the end of ' + esc(dmon(c.date)) + ' (published monthly, a few months behind). Since then the page adds the average change of ' + esc(money(c.rate.perDay, 'CAD', 'big')) + ' a day from ' + esc(dmon(c.rate.from[0])) + ' to ' + esc(dmon(c.rate.to[0])) + '. Because the data lags, this estimate can be further off than the US one.' + staleNote(['canada']);
		var est = now('ca'), o = [];
		if (c.pop) o.push(tile('Per Canadian', '<span id="dc-ca-pp">–</span>', (c.pop / 1e6).toFixed(1) + ' million people (Statistics Canada, ' + esc(dmon(ca.pop[0])) + ')', 'perperson'));
		if (c.gdp) o.push(tile('Federal debt-to-GDP', D.pct(est / c.gdp * 100), 'GDP ' + esc(money(c.gdp, 'CAD', 'big')) + ' a year (' + esc(dmon(ca.gdp[0])) + ' quarter, annual rate)', 'debtgdp'));
		if (ca.gross) o.push(tile('Gross federal liabilities', esc(money(ca.gross[1], 'CAD', 'big')), 'before subtracting assets, ' + esc(dmon(ca.gross[0])), 'cafed'));
		if (imf) { var r = D.countryTable(imf, new Date().getUTCFullYear()).find(function (x) { return x.code === 'CAN'; }); if (r) o.push(tile('All governments (IMF)', D.pct(r.pct), 'general government gross debt, % of GDP, ' + new Date().getUTCFullYear() + ' estimate', 'gross')); }
		o.push(tile('Added since you opened this page', '<span id="dc-ca-since">$0</span>', 'at the estimated rate', 'estimate'));
		var fxv = src('fx'); if (fxv) o.push(tile('Exchange rate', 'US$1 = C$' + fxv.usdcad.toFixed(4), 'Bank of Canada, ' + esc(dlong(fxv.date)) + ' (used by the currency switch)'));
		$('dc-ca-tiles').innerHTML = o.join('');
		var cur = curOf('CAD');
		chart($('dc-ca-chart'), { series: [{ pts: ca.fed.map(function (r) { return [ms(r[0]), conv(r[1], 'CAD'), dmon(r[0])]; }), cls: 'dc-s2', fill: true }], zero: false, fy: function (v) { return D.sym(cur) + D.short(v); }, fv: function (v) { return D.big(v, cur); }, label: 'Canada federal debt' });
	}
	function drawTab(t) { if (t === 'us') drawUS(); else if (t === 'world') drawWorld(); else drawCA(); tick(); }

	// ---------- big clock (fills the window; Full screen on top of that) ----------
	var bv = $('dc-bv'), bvLast = null;
	function openBig(k, fs) {
		if (!CL[k]) return;
		st.big = k; save(); bv.hidden = false; document.documentElement.classList.add('dc-bv-on'); bvLast = document.activeElement; bigPick(); bigFit(); $('dc-bv-x').focus();
		if (fs && bv.requestFullscreen) bv.requestFullscreen().catch(function () {});
	}
	function closeBig() { if (document.fullscreenElement === bv && document.exitFullscreen) document.exitFullscreen().catch(function () {}); bv.hidden = true; document.documentElement.classList.remove('dc-bv-on'); if (bvLast && bvLast.focus) bvLast.focus(); }
	function bigPick() {
		[].forEach.call($('dc-bv-pick').querySelectorAll('button'), function (b) { var k = b.getAttribute('data-c'); b.setAttribute('aria-pressed', String(k === st.big)); b.disabled = !CL[k]; });
		var c = CL[st.big]; $('dc-bv-l').textContent = c.label + ' (estimate)';
		$('dc-bv-note').textContent = st.big === 'us' ? 'Treasury figure of ' + dlong(c.date) + ' + average change over ' + Math.round(c.rate.days) + ' days · mes.fm/debt-clock' : st.big === 'ca' ? 'Statistics Canada figure for ' + dmon(c.date) + ' + average change over ' + Math.round(c.rate.days / 30.44) + ' months · mes.fm/debt-clock' : 'Straight line between IMF estimates for ' + c.line.from + ' and ' + c.line.to + ' · mes.fm/debt-clock';
		$('dc-bv-fs').textContent = document.fullscreenElement === bv ? 'Exit full screen' : '⛶ Full screen';
		bigTick(Date.now()); bv._len = 0;
	}
	function bigTick(t) {
		var k = st.big, c = CL[k]; if (!c) return;
		var v = now(k, t), n = $('dc-bv-n'), s = money(v, c.cur, 'full');
		n.textContent = s; if (s.length !== bv._len) { bv._len = s.length; bigFit(); }
		var cnt = k === 'us' ? c.counts.people : c.pop;
		$('dc-bv-s').textContent = perSecText(c) + (cnt ? ' · ' + moneySmall(v / cnt, c.cur) + ' per person' : '');
		$('dc-bv-s2').textContent = 'Added since you opened this page: ' + (c.perMs >= 0 ? '+' : '') + moneySmall(c.perMs * (t - opened), c.cur);
	}
	function bigFit() { var n = $('dc-bv-n'), w = bv.clientWidth || window.innerWidth, h = bv.clientHeight || window.innerHeight; n.style.fontSize = '100px'; var sw = n.scrollWidth || 1000; n.style.fontSize = Math.max(18, Math.min(100 * w * 0.94 / sw, h * 0.32)) + 'px'; }
	$('dc-bv-pick').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) { st.big = b.getAttribute('data-c'); save(); bigPick(); } });
	$('dc-bv-x').onclick = closeBig;
	$('dc-bv-fs').onclick = function () { if (document.fullscreenElement === bv) document.exitFullscreen().catch(function () {}); else if (bv.requestFullscreen) bv.requestFullscreen().catch(function () {}); };
	document.addEventListener('fullscreenchange', function () { if (!bv.hidden) { bigPick(); setTimeout(bigFit, 60); } });
	window.addEventListener('resize', function () { if (!bv.hidden) bigFit(); });
	document.addEventListener('keydown', function (e) {
		if (e.key !== 'Escape') return;
		if (!pop.hidden) { var b = popFor; closePop(); if (b) b.focus(); return; }
		if (!bv.hidden && document.fullscreenElement !== bv) closeBig();   // in real full screen the browser's own Esc leaves full screen first
	});
	bv.addEventListener('keydown', function (e) { if (e.key === 'Tab') { var f = [].slice.call(bv.querySelectorAll('button:not([disabled])')), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } });

	// ---------- loading ----------
	function sourceList() {
		var NAMES = { penny: 'US Treasury, Debt to the Penny (daily)', history: 'US Treasury, Historical Debt Outstanding (since 1790)', interest: 'US Treasury, Interest Expense (monthly)', interestFy: 'US Treasury, Interest Expense by fiscal year', avgRate: 'US Treasury, Average Interest Rates', mts: 'US Treasury, Monthly Treasury Statement', fred: 'FRED (St. Louis Fed): GDP, population, households, debt-to-GDP', imf: 'IMF World Economic Outlook (DataMapper)', canada: 'Statistics Canada: federal debt, population, GDP', fx: 'Bank of Canada: US dollar exchange rate' };
		$('dc-srcs').innerHTML = Object.keys(NAMES).map(function (k) { var s = data.sources[k]; return '<li><span class="dc-sd ' + (s && s.ok ? (stale[k] ? 'st' : 'ok') : 'no') + '"></span>' + esc(NAMES[k]) + ' &middot; ' + (s && s.ok ? (stale[k] ? 'saved copy' : 'live') : 'did not answer' + (s && s.error ? ': ' + esc(s.error) : '')) + '</li>'; }).join('');
		$('dc-updated').textContent = (MOCK ? 'Sample data saved ' : 'Data fetched ') + dlong(data.generated) + (MOCK ? ' (preview)' : '') + '.';
	}
	function status(msg, isErr) { var s = $('dc-status'); s.hidden = !msg; s.className = 'dc-status' + (isErr ? ' err' : ''); s.textContent = msg || ''; }
	function getSample() { return sample ? Promise.resolve(sample) : fetch('/debt-clock/data/sample.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { sample = j; return j; }); }
	function load() {
		status('');
		var p = MOCK ? getSample() : fetch('/api/debt', { cache: 'no-cache' }).then(function (r) { if (!r.ok && r.status !== 502) throw new Error('HTTP ' + r.status); return r.json(); });
		p.then(function (j) {
			if (!j || !j.sources) throw new Error('bad answer');
			var bad = Object.keys(j.sources).filter(function (k) { return !j.sources[k].ok; });
			if (!bad.length || MOCK) return j;
			return getSample().then(function (s) { bad.forEach(function (k) { if (s.sources[k] && s.sources[k].ok) { j.sources[k] = s.sources[k]; stale[k] = 1; } }); return j; }).catch(function () { return j; });
		}).catch(function () {
			return getSample().then(function (s) { Object.keys(s.sources).forEach(function (k) { stale[k] = 1; }); status('Live data could not be loaded, so this shows the saved copy from ' + dlong(s.generated) + '. The ticking estimate starts from those older figures.', true); return s; });
		}).then(function (j) {
			data = j; buildClocks(); segs(); sourceList(); showTab(st.tab);
		}).catch(function () { status('The data could not be loaded. Please try again later.', true); });
	}
	$('dc-refresh').onclick = function () { stale = {}; load(); };
	segs(); load();
})();
