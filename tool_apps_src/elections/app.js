/* MES Elections UI. Data = /api/elections (one aggregator, edge-cached 5 min); data tables and maths = MESElect (lib.js). ?mock=1 (and local
   previews) read the committed sample mes.fm/elections/data/sample.json instead. Neutral: no forecast of our own anywhere. */
(function () {
	'use strict';
	var E = window.MESElect, $ = function (id) { return document.getElementById(id); }, root = $('el');
	if (!E || !root) return;
	var KEY = 'mes-elections:v1', st = { tab: 'us', ch: 'S', base: 'market', shift: 0, ind: '', picks: { H: {}, S: {}, G: {} }, sort: 'close', ca: 'ca2025', bc: 'bc2026', calg: 'all', pr: 'dhondt', thr: 0, coal: {} };
	var SKEYS = ['tab', 'ch', 'base', 'shift', 'ind', 'picks', 'sort', 'ca', 'bc', 'calg', 'pr', 'thr'];
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); SKEYS.forEach(function (k) { if (sv[k] != null) st[k] = sv[k]; }); } catch (e) {}
	['H', 'S', 'G'].forEach(function (k) { if (!st.picks[k] || typeof st.picks[k] !== 'object') st.picks[k] = {}; });
	var qs = new URLSearchParams(location.search), MOCK = qs.get('mock') === '1' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	if (qs.get('tab')) st.tab = qs.get('tab');
	if (/^[HSG]$/.test(qs.get('ch') || '')) st.ch = qs.get('ch');
	if (qs.get('sh') && isFinite(+qs.get('sh'))) st.shift = Math.max(-25, Math.min(25, +qs.get('sh')));
	if (qs.get('o') != null) { var dp = E.decodePicks(qs.get('o')); st.picks = { H: {}, S: {}, G: {} }; Object.keys(dp).forEach(function (k) { st.picks[k[0]][k] = dp[k]; }); }
	if (qs.get('base') === 'blank') st.base = 'blank';
	if (/^[DR]?$/.test(qs.get('ind') || '') && qs.get('ind') != null) st.ind = qs.get('ind');
	function save() { try { var o = {}; SKEYS.forEach(function (k) { o[k] = st[k]; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function q(k) { var g = E.GLOSSARY[k]; return g ? '<button type="button" class="el-q" data-g="' + k + '" aria-label="' + esc('What is ' + g[0] + '?') + '">?</button>' : ''; }
	function src(n) { return data && data.sources[n] && data.sources[n].ok ? data.sources[n].data : null; }
	var data = null, loading = false;
	var PN = { D: 'Democratic', R: 'Republican', I: 'Independent / other', U: 'Not chosen', O: 'Other' };
	var PS = { D: 'D', R: 'R', I: 'I', U: '?', O: 'O' };
	function dlong(ymd) { var d = new Date(E.calTime(ymd)); var s = String(ymd); return isNaN(d) ? s : d.toLocaleDateString(undefined, /^\d{4}$/.test(s) ? { year: 'numeric', timeZone: 'UTC' } : /^\d{4}-\d\d$/.test(s) ? { year: 'numeric', month: 'long', timeZone: 'UTC' } : { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); }

	// ---------- tabs ----------
	var TABS = ['us', 'ca', 'bc', 'cal'];
	if (TABS.indexOf(st.tab) < 0) st.tab = 'us';
	function showTab(t, focus) {
		st.tab = t; save();
		[].forEach.call($('el-tabs').querySelectorAll('[role=tab]'), function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		TABS.forEach(function (x) { $('el-p-' + x).hidden = x !== t; });
		drawTab(t);
	}
	$('el-tabs').addEventListener('click', function (e) { var b = e.target.closest('[role=tab]'); if (b) showTab(b.getAttribute('data-tab')); });
	$('el-tabs').addEventListener('keydown', function (e) { var i = TABS.indexOf(st.tab); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); showTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true); } });

	// ---------- glossary popover + tooltip ----------
	var pop = $('el-pop'), popFor = null, tip = $('el-tip');
	function closePop() { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; }
	root.addEventListener('click', function (e) {
		var b = e.target.closest('.el-q');
		if (b) {
			e.preventDefault(); e.stopPropagation();
			if (popFor === b) return closePop();
			var g = E.GLOSSARY[b.getAttribute('data-g')]; if (!g) return;
			closePop(); popFor = b; b.setAttribute('aria-expanded', 'true');
			pop.querySelector('.el-pop__t').textContent = g[0]; pop.querySelector('.el-pop__p').textContent = g[1]; pop.hidden = false;
			var r = b.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24), left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
			pop.style.width = w + 'px'; pop.style.left = left + 'px';
			var h = pop.offsetHeight, top = r.bottom + 8; if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
			pop.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
			return;
		}
		if (!pop.hidden && !e.target.closest('.el-pop')) closePop();
	});
	pop.querySelector('.el-pop__x').onclick = closePop;
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { var b = popFor; closePop(); if (b) b.focus(); } });
	window.addEventListener('scroll', function () { if (!pop.hidden) closePop(); hideTip(); }, { passive: true });
	function showTip(html, x, y) {
		tip.innerHTML = html; tip.hidden = false;
		var w = tip.offsetWidth, h = tip.offsetHeight;
		tip.style.left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8) + 'px';
		tip.style.top = (y - h - 12 > 8 ? y - h - 12 : y + 18) + 'px';
	}
	function hideTip() { tip.hidden = true; }

	// ---------- countdown hero ----------
	function hero() {
		var now = Date.now(), cd = $('el-cd'), t;
		if (now < E.US_START) t = '<span class="el-cdn">' + esc(E.countdown(E.US_START - now)) + '</span> <span class="el-cdl">until Election Day</span>';
		else if (now < E.US_FIRST_CLOSE) t = '<span class="el-cdn">Voting today</span> <span class="el-cdl">first polls close in ' + esc(E.countdown(E.US_FIRST_CLOSE - now)) + ' (6 pm Eastern)</span>';
		else if (now < E.US_FIRST_CLOSE + 2 * 864e5) t = '<span class="el-cdn">Counting</span> <span class="el-cdl">polls are closed or closing; official results come from each state</span>';
		else t = '<span class="el-cdn">Held 3 Nov 2026</span> <span class="el-cdl">states certify results in the following weeks</span>';
		cd.innerHTML = t;
		var up = E.upcoming(now).filter(function (r) { return r[0] !== E.US_DAY; })[0];
		if (up) { var dd = Math.ceil((E.calTime(up[0]) - now) / 864e5); $('el-next').innerHTML = 'Next on the calendar: <b>' + esc(up[3]) + '</b>, ' + esc(up[4].replace(/\s*\(.*$/, '')) + ' &middot; ' + esc(dlong(up[0])) + (dd > 0 ? ' (in ' + dd + ' day' + (dd === 1 ? '' : 's') + ')' : dd === 0 ? ' (today)' : ''); }
	}
	hero(); setInterval(hero, 1000);

	// hemicycle point (unit box 0..1 x 0..0.5) -> SVG coordinates in a 600 x 330 box with a margin, radius in px
	var AW = 600, AH = 330, AP = 12;
	function axy(p) { var k = AW - 2 * AP; return { x: (AP + p.x * k).toFixed(1), y: (AP + p.y * k).toFixed(1), r: (p.r * k * 0.98).toFixed(2) }; }

	// ---------- data ----------
	function load(force) {
		if (loading) return; loading = true;
		var url = MOCK ? '/elections/data/sample.json' : '/api/elections' + (force ? '?t=' + Date.now() : '');
		fetch(url, { cache: force ? 'reload' : 'default' }).then(function (r) { if (!r.ok && r.status !== 502) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
			loading = false; data = j; status(''); drawAll();
		}).catch(function (e) {
			loading = false;
			if (!MOCK) { MOCK = true; return load(); }
			status('Could not load live data (' + e.message + '). The Canada, BC and calendar tabs still work.', true); drawAll();
		});
	}
	function status(t, bad) { var s = $('el-status'); s.hidden = !t; s.textContent = t; s.classList.toggle('err', !!bad); }
	$('el-refresh').onclick = function () { load(true); };

	function races(k) { var r = src('races'); return r ? r.races[k] || [] : []; }
	function info(k, st0) { var a = k === 'S' ? E.SENATE_2026 : k === 'G' ? E.GOV_2026 : []; for (var i = 0; i < a.length; i++) if (a[i][0] === st0) return a[i]; return null; }
	function cur() {
		var rs = races(st.ch), o = E.outcome(rs, { picks: st.picks[st.ch], base: st.base, shift: -st.shift }), expect = st.ch === 'H' ? 435 : st.ch === 'S' ? 35 : 36;
		return { rs: rs, o: o, t: E.chamber(st.ch, o.n, st.ind, Math.max(0, expect - rs.length)) };
	}

	// ---------- US: summary cards ----------
	function oddsRow(label, d, r, url, extra) {
		if (d == null && r == null) return '';
		return '<a class="el-odds" href="' + esc(url) + '" target="_blank" rel="noopener"><span class="el-odds__l">' + label + '</span><span class="el-odds__bar" aria-hidden="true"><i class="el-bg-D" style="width:' + (d || 0) + '%"></i><i class="el-bg-R" style="width:' + (r || 0) + '%"></i></span><span class="el-odds__v"><b class="el-tx-D">D ' + E.pct(d) + '</b> <b class="el-tx-R">R ' + E.pct(r) + '</b></span>' + (extra ? '<small>' + extra + '</small>' : '') + '</a>';
	}
	function pmCtl(id) { var ov = src('races'), e = ov && ov.overview[id]; if (!e) return null; var o = { url: e.url, vol: e.vol }; e.oc.forEach(function (x) { if (/democrat/i.test(x.l)) o.D = x.p; if (/republican/i.test(x.l)) o.R = x.p; }); return o; }
	function usCards() {
		var H = E.HOUSE.now, S = E.SENATE.now, G = E.GOV.now, out = [];
		function card(title, g, nowBar, facts, odds) {
			return '<div class="tu-card el-ucard"><h3>' + title + ' ' + q(g) + '</h3>' + nowBar + '<ul class="el-facts">' + facts.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' + (odds ? '<div class="el-oddsbox"><span class="el-ctrl__l">Who wins control, as markets price it</span>' + odds + '</div>' : '') + '</div>';
		}
		function bar(parts, total, maj) {
			var x = 0, h = parts.map(function (p) { var w = p[1] / total * 100, s = '<i class="el-bg-' + p[0] + '" style="left:' + x + '%;width:' + w + '%" title="' + esc(PN[p[0]] || p[2]) + ': ' + p[1] + '"></i>'; x += w; return s; }).join('');
			return '<div class="el-nowbar" role="img" aria-label="' + esc(parts.map(function (p) { return (p[2] || PN[p[0]]) + ' ' + p[1]; }).join(', ')) + '">' + h + (maj ? '<b class="el-maj" style="left:' + (maj / total * 100) + '%"></b>' : '') + '</div><div class="el-nowlab">' + parts.map(function (p) { return '<span><i class="el-sw el-bg-' + p[0] + '"></i>' + esc(p[2] || PN[p[0]]) + ' ' + p[1] + '</span>'; }).join('') + '</div>';
		}
		var kh = src('kalshiH'), ks = src('kalshiS'), ph = pmCtl('house'), ps = pmCtl('senate');
		out.push(card('House', 'house', bar([['D', H.D], ['I', H.I, 'Independent'], ['U', H.V, 'Vacant'], ['R', H.R]], 435, 218),
			['All <b>435</b> seats on the ballot', '<b>218</b> for a majority', 'Now: R ' + H.R + ', D ' + H.D + ', I ' + H.I + ', ' + H.V + ' vacant'],
			(ph ? oddsRow('Polymarket', ph.D, ph.R, ph.url, '$' + E.fmt(ph.vol / 1e6, 1) + 'M traded') : '') + (kh ? oddsRow('Kalshi', kh.D, kh.R, kh.url, E.fmt(kh.contracts / 1e6, 1) + 'M contracts') : '')));
		out.push(card('Senate', 'senate', bar([['D', S.D], ['I', S.I, 'Independent (caucus D)'], ['R', S.R]], 100, 51),
			['<b>35</b> seats on the ballot (2 specials ' + q('special') + ')', '<b>51</b> for a majority, or 50 + Vice President (R) ' + q('tiebreak'), 'Not on the ballot: R ' + E.SENATE.hold.R + ', D ' + E.SENATE.hold.D + ', I ' + E.SENATE.hold.I],
			(ps ? oddsRow('Polymarket', ps.D, ps.R, ps.url, '$' + E.fmt(ps.vol / 1e6, 1) + 'M traded') : '') + (ks ? oddsRow('Kalshi', ks.D, ks.R, ks.url, E.fmt(ks.contracts / 1e6, 1) + 'M contracts') : '')));
		out.push(card('Governors', 'governor', bar([['D', G.D], ['R', G.R]], 50, 0),
			['<b>36</b> races', 'Now: R ' + G.R + ', D ' + G.D, 'Not on the ballot: R ' + E.GOV.hold.R + ', D ' + E.GOV.hold.D], ''));
		$('el-us-cards').innerHTML = out.join('');
	}

	// ---------- US: builder ----------
	function segSet(id, v) { [].forEach.call($(id).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === String(v))); }); }
	function segOn(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) fn(b.getAttribute('data-v')); }); }
	segOn('el-ch', function (v) { st.ch = v; st.find = ''; $('el-find').value = ''; shown = 30; save(); drawBuild(); });
	segOn('el-base', function (v) { st.base = v; save(); drawBuild(); });
	segOn('el-sort', function (v) { st.sort = v; shown = 30; save(); drawList(); });
	$('el-shift').addEventListener('input', function () { st.shift = +this.value; save(); drawBuild(true); });
	$('el-ind').addEventListener('change', function () { st.ind = this.value; save(); drawBuild(); });
	$('el-reset').onclick = function () { st.picks[st.ch] = {}; st.shift = 0; st.base = 'market'; st.ind = ''; save(); drawBuild(); };
	$('el-share').onclick = function () {
		var u = new URL(location.href.split('?')[0]); u.searchParams.set('tab', 'us'); u.searchParams.set('ch', st.ch);
		var p = E.encodePicks(st.picks[st.ch]); if (p) u.searchParams.set('o', p);
		if (st.shift) u.searchParams.set('sh', st.shift); if (st.base === 'blank') u.searchParams.set('base', 'blank'); if (st.ind) u.searchParams.set('ind', st.ind);
		var b = this, done = function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = 'Copy link'; }, 1600); };
		if (navigator.clipboard) navigator.clipboard.writeText(u.toString()).then(done, function () { prompt('Copy this link', u.toString()); }); else prompt('Copy this link', u.toString());
	};
	var CYCLE = ['D', 'R', 'I', 'U'];
	function cyclePick(key) {
		var c = cur(), now = c.o.by[key], p = st.picks[st.ch], nx = CYCLE[(CYCLE.indexOf(now) + 1) % CYCLE.length];
		var r = c.rs.filter(function (x) { return x.key === key; })[0];
		if (!r) return;
		// back to the market's side = no override
		var mk = st.base === 'blank' && !r.res ? 'U' : E.favourite(r, -st.shift);
		if (nx === mk) delete p[key]; else p[key] = nx;
		save(); drawBuild();
	}
	function setPick(key, v) {
		var p = st.picks[st.ch];
		if (v === 'M') delete p[key]; else p[key] = v;
		save(); drawBuild();
	}
	function lean(r) { if (!r || r.res) return false; var s = E.shifted(r.pD, r.pR, -st.shift), m = Math.max(s.D, s.R, r.pO || 0); return m < 65; }
	function verdict(t) {
		var who = t.ctl === 'D' ? 'Democrats' : t.ctl === 'R' ? 'Republicans' : null, k = st.ch;
		if (k === 'G') return '<b>' + (t.D > t.R ? 'More Democratic governors' : t.R > t.D ? 'More Republican governors' : 'Tied') + '</b>: D ' + t.D + ', R ' + t.R + (t.I ? ', I ' + t.I : '') + (t.U ? ', ' + t.U + ' not chosen' : '');
		if (!who) return '<b>No majority yet</b>: Democrats need ' + t.need.D + ' more, Republicans ' + t.need.R + ' more' + (k === 'S' ? ' (50 is enough for Republicans, with the Vice President)' : '') + '.';
		return '<b>' + who + ' control the ' + (k === 'H' ? 'House' : 'Senate') + '</b>' + (t.note ? ' (' + esc(t.note) + ')' : '') + '.';
	}
	function drawResult(c) {
		var t = c.t, k = st.ch, tot = t.total, segs = [['D', t.Dcaucus - (k === 'S' ? t.Ihold : 0) - (st.ind === 'D' ? t.I : 0)], ['Ih', k === 'S' ? t.Ihold : 0], ['I', t.I], ['U', t.U], ['R', t.R]];
		var x = 0, h = segs.map(function (s) { if (!s[1]) return ''; var w = s[1] / tot * 100, cl = s[0] === 'Ih' ? 'I' : s[0], o = '<i class="el-bg-' + cl + (s[0] === 'Ih' ? ' el-hatch' : '') + '" style="left:' + x + '%;width:' + w + '%"></i><span class="el-rb__n" style="left:' + (x + w / 2) + '%">' + (w > 4 ? s[1] : '') + '</span>'; x += w; return o; }).join('');
		var lab = k === 'S' ? 'Senate seats (all 100)' : k === 'H' ? 'House seats' : 'Governors (all 50)';
		$('el-result').innerHTML = '<div class="el-rb" role="img" aria-label="' + esc(lab + ': D ' + t.Dcaucus + ', R ' + t.Rcaucus) + '">' + h + (k !== 'G' ? '<b class="el-maj" style="left:' + (t.majority / tot * 100) + '%"><span>' + t.majority + '</span></b>' : '<b class="el-maj el-maj--half" style="left:50%"></b>') + '</div>' +
			'<div class="el-verdict">' + verdict(t) + '</div><div class="el-rnums"><span class="el-tx-D">D ' + (k === 'S' ? t.D + ' + ' + t.Ihold + ' I' : t.D) + '</span>' + (t.I ? '<span class="el-tx-I">New I ' + t.I + '</span>' : '') + (t.U ? '<span class="el-tx-U">Not chosen ' + t.U + '</span>' : '') + '<span class="el-tx-R">R ' + t.R + '</span>' +
			(k === 'S' ? '<span class="el-tx-U">(includes ' + (E.SENATE.hold.D + E.SENATE.hold.R + E.SENATE.hold.I) + ' seats not on the ballot)</span>' : k === 'G' ? '<span class="el-tx-U">(includes 14 not on the ballot)</span>' : '') + '</div>';
	}
	// parliament arc of every seat (Senate: the 65 not on the ballot first, greyed); click a dot to flip that race
	function drawArc(c) {
		var k = st.ch, box = $('el-arc');
		if (k === 'G') { $('el-arcwrap').hidden = true; return; }
		$('el-arcwrap').hidden = false;
		var seats = [], ord = { D: 0, I: 2, U: 3, R: 5 };
		c.rs.forEach(function (r) { var o = c.o.by[r.key], s = E.shifted(r.pD, r.pR, -st.shift); seats.push({ r: r, o: o, sort: ord[o] + (o === 'D' ? 1 - s.D / 100 : o === 'R' ? s.D / 100 : 0.5) }); });
		if (k === 'S') {
			for (var i = 0; i < E.SENATE.hold.D; i++) seats.push({ o: 'D', hold: 1, sort: -1 });
			for (i = 0; i < E.SENATE.hold.I; i++) seats.push({ o: 'I', hold: 1, sort: ord[st.ind === 'R' ? 'R' : 'D'] + 0.95, hi: 1 });
			for (i = 0; i < E.SENATE.hold.R; i++) seats.push({ o: 'R', hold: 1, sort: 7 });
		}
		var miss = (k === 'H' ? 435 : 0) - (k === 'H' ? c.rs.length : 0); for (i = 0; i < miss; i++) seats.push({ o: 'U', sort: 3.5 });
		if (st.ind === 'D') seats.forEach(function (s) { if (s.o === 'I' && !s.hold) s.sort = 1.5; }); else if (st.ind === 'R') seats.forEach(function (s) { if (s.o === 'I' && !s.hold) s.sort = 4.5; });
		seats.sort(function (a, b) { return a.sort - b.sort; });
		var pts = E.hemicycle(seats.length), W = AW, H = AH, out = [];
		pts.forEach(function (p, j) {
			var s = seats[j], r = s.r, cls = 'el-dot el-fl-' + (s.hi ? 'I' : s.o) + (s.hold ? ' el-hold' : '') + (r && st.picks[k][r.key] ? ' el-mine' : '') + (r && r.res ? ' el-settled' : '') + (r && lean(r) && !st.picks[k][r.key] && s.o !== 'U' ? ' el-lean' : '');
			var q2 = axy(p); out.push('<circle class="' + cls + '" cx="' + q2.x + '" cy="' + q2.y + '" r="' + q2.r + '"' + (r ? ' data-k="' + r.key + '" tabindex="-1"' : '') + '></circle>');
		});
		var t = c.t;
		out.push('<text class="el-arcn" x="' + W / 2 + '" y="' + (H - 58) + '" text-anchor="middle">' + (t.ctl ? (t.ctl === 'D' ? 'D' : 'R') + ' control' : 'No majority') + '</text><text class="el-arcs" x="' + W / 2 + '" y="' + (H - 34) + '" text-anchor="middle">' + t.Dcaucus + ' – ' + t.Rcaucus + '  ·  ' + t.majority + ' needed</text>');
		box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc((k === 'H' ? 'House' : 'Senate') + ' seats, ' + t.Dcaucus + ' D side, ' + t.Rcaucus + ' R side') + '">' + out.join('') + '</svg>';
	}
	function raceTip(r, o) {
		var i = info(r.kind, r.st), c = r.c.map(function (x) { return '<span class="el-tx-' + (x.pt === 'O' ? 'I' : x.pt) + '">' + esc(x.n) + (x.pt !== 'O' && !/Party$/.test(x.n) ? ' (' + x.pt + ')' : '') + ' ' + E.pct(x.p, 0) + '</span>'; }).join('<br>');
		return '<b>' + esc(E.raceLabel(r)) + (r.kind === 'S' ? ' Senate' : r.kind === 'G' ? ' Governor' : '') + '</b>' + (i ? '<br><small>Now: ' + esc(i[1]) + ' (' + i[2] + '), ' + esc(i[3].toLowerCase()) + '</small>' : '') + '<br>' + c + (r.res ? '<br><b>Market settled: ' + PN[r.res] + '</b>' : '') + '<br><small>Your map: ' + PN[o] + (st.picks[r.kind][r.key] ? ' (your choice)' : '') + '. Click to change.</small>';
	}
	$('el-arc').addEventListener('click', function (e) { var d = e.target.closest('[data-k]'); if (d) { cyclePick(d.getAttribute('data-k')); } });
	function tipFrom(e) {
		var d = e.target.closest && e.target.closest('[data-k]'); if (!d || !root.contains(d)) return hideTip();
		var c = cur(), key = d.getAttribute('data-k'), r = c.rs.filter(function (x) { return x.key === key; })[0];
		if (r) showTip(raceTip(r, c.o.by[key]), e.clientX, e.clientY);
		else if (d.getAttribute('data-st')) showTip(stateTip(d.getAttribute('data-st')), e.clientX, e.clientY);
	}
	['el-arc', 'el-map'].forEach(function (id) { $(id).addEventListener('pointermove', tipFrom); $(id).addEventListener('pointerleave', hideTip); });
	// tile map: Senate / governor = one race per state (click flips it); House = the state's districts as a split bar (click lists them)
	function stateTip(s) {
		var c = cur(), rs = c.rs.filter(function (r) { return r.st === s; }), n = { D: 0, R: 0, I: 0, U: 0 };
		rs.forEach(function (r) { n[c.o.by[r.key]]++; });
		return '<b>' + esc(E.STATES[s]) + '</b><br>' + rs.length + ' House seat' + (rs.length === 1 ? '' : 's') + ': D ' + n.D + ', R ' + n.R + (n.I ? ', I ' + n.I : '') + (n.U ? ', not chosen ' + n.U : '') + '<br><small>Click to list its races.</small>';
	}
	function drawMap(c) {
		var k = st.ch, by = {}, out = [];
		c.rs.forEach(function (r) { (by[r.st] = by[r.st] || []).push(r); });
		Object.keys(E.TILES).forEach(function (s) {
			var p = E.TILES[s], rs = by[s] || [], pos = 'grid-column:' + (p[0] + 1) + ';grid-row:' + (p[1] + 1);
			if (k === 'H') {
				if (s === 'DC') { out.push('<span class="el-tile el-tile--off" style="' + pos + '" title="DC has a non-voting delegate">DC</span>'); return; }
				var n = { D: 0, R: 0, I: 0, U: 0 }; rs.forEach(function (r) { n[c.o.by[r.key]]++; }); var t = rs.length || 1;
				out.push('<button type="button" class="el-tile el-tile--h' + (st.find === s ? ' el-tile--sel' : '') + '" style="' + pos + '" data-st="' + s + '" data-k="" aria-label="' + esc(E.STATES[s] + ': D ' + n.D + ', R ' + n.R) + '"><span class="el-tile__s">' + s + '</span><span class="el-tile__b"><i class="el-bg-D" style="width:' + n.D / t * 100 + '%"></i><i class="el-bg-I" style="width:' + n.I / t * 100 + '%"></i><i class="el-bg-U" style="width:' + n.U / t * 100 + '%"></i><i class="el-bg-R" style="width:' + n.R / t * 100 + '%"></i></span><span class="el-tile__n">' + (rs.length > 1 ? n.D + '–' + n.R : '') + '</span></button>');
				return;
			}
			var r = rs[0];
			if (!r) { out.push('<span class="el-tile el-tile--off" style="' + pos + '" title="' + esc((E.STATES[s] || s) + ': no race in 2026') + '">' + s + '</span>'); return; }
			var o = c.o.by[r.key];
			out.push('<button type="button" class="el-tile el-fl-' + o + (lean(r) && !st.picks[k][r.key] && o !== 'U' ? ' el-lean' : '') + (st.picks[k][r.key] ? ' el-mine' : '') + (r.res ? ' el-settled' : '') + '" style="' + pos + '" data-k="' + r.key + '" aria-label="' + esc(E.STATES[s] + ': ' + PN[o] + '. Click to change.') + '"><span class="el-tile__s">' + s + '</span><span class="el-tile__n">' + (o === 'U' ? '?' : o) + '</span></button>');
		});
		$('el-map').innerHTML = out.join('');
		$('el-maplegend').innerHTML = k === 'H' ? 'Each state shows its House seats split by party in your map. Click a state to list its races; click again to show all.' : 'Grey: no ' + (k === 'S' ? 'Senate' : 'governor') + ' race this year. Click a state to change its winner (D, R, independent, not chosen).';
	}
	$('el-map').addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		if (st.ch === 'H') { var s = b.getAttribute('data-st'); st.find = st.find === s ? '' : s; $('el-find').value = st.find ? E.STATES[s] : ''; shown = 60; drawMap(cur()); drawList(); return; }
		cyclePick(b.getAttribute('data-k'));
	});
	function legend() {
		$('el-legend').innerHTML = '<span><i class="el-sw el-bg-D"></i>Democratic</span><span><i class="el-sw el-bg-R"></i>Republican</span><span><i class="el-sw el-bg-I"></i>Independent / other</span><span><i class="el-sw el-bg-U"></i>Not chosen</span><span><i class="el-sw el-bg-D el-lean"></i>Paler: market favourite under 65%</span><span><i class="el-sw el-ring"></i>Ringed: your choice</span>' + (st.ch === 'S' ? '<span><i class="el-sw el-bg-U el-holdsw"></i>Faded: not on the ballot</span>' : '');
	}
	var shown = 30;
	function drawList() {
		var c = cur(), k = st.ch, f = String($('el-find').value || '').trim().toLowerCase(), rs = c.rs.slice();
		if (st.find && f === String(E.STATES[st.find] || '').toLowerCase()) rs = rs.filter(function (r) { return r.st === st.find; });
		else if (f) rs = rs.filter(function (r) { var i = info(r.kind, r.st); return (E.raceLabel(r) + ' ' + E.STATES[r.st] + ' ' + r.st + '-' + (r.dist || '') + ' ' + r.c.map(function (x) { return x.n; }).join(' ') + ' ' + (i ? i[1] : '')).toLowerCase().indexOf(f) >= 0; });
		if (st.sort === 'mine') rs = rs.filter(function (r) { return st.picks[k][r.key]; });
		rs.sort(st.sort === 'close' ? function (a, b) { var s1 = E.shifted(a.pD, a.pR, -st.shift), s2 = E.shifted(b.pD, b.pR, -st.shift); return (a.res ? 999 : Math.abs(s1.D - s1.R)) - (b.res ? 999 : Math.abs(s2.D - s2.R)); } : function (a, b) { return E.raceLabel(a) < E.raceLabel(b) ? -1 : 1; });
		var total = rs.length, list = rs.slice(0, shown);
		$('el-list').innerHTML = list.length ? list.map(function (r) {
			var o = c.o.by[r.key], i = info(r.kind, r.st), s = E.shifted(r.pD, r.pR, -st.shift), mine = st.picks[k][r.key];
			var names = r.c.filter(function (x) { return x.p >= 1 || /Party$/.test(x.n); }).slice(0, 3).map(function (x) { var pt = x.pt === 'O' ? 'I' : x.pt; return '<span class="el-cand el-tx-' + pt + '">' + esc(x.n) + (x.pt !== 'O' && !/Party$/.test(x.n) ? ' <small>(' + x.pt + ')</small>' : '') + ' <b>' + E.pct(x.p, 0) + '</b></span>'; }).join('');
			var btn = function (v, l) { return '<button type="button" class="el-pk el-pk-' + v + '" data-pk="' + v + '" aria-pressed="' + (v === 'M' ? String(!mine) : String(mine === v)) + '">' + l + '</button>'; };
			return '<div class="el-row' + (mine ? ' el-row--mine' : '') + '" data-k="' + r.key + '"><div class="el-row__h"><span class="el-chip el-bg-' + o + '">' + PS[o] + '</span><b>' + esc(E.raceLabel(r)) + '</b>' + (i ? '<small class="el-inc">Now ' + esc(i[1]) + ' (' + i[2] + ') · ' + esc(i[3]) + (i[4] ? ' · special' : '') + '</small>' : '') + (r.res ? '<small class="el-settledtag">Market settled: ' + PN[r.res] + '</small>' : '') + '<a class="el-mk" href="' + esc(r.url) + '" target="_blank" rel="noopener" title="Open this market on Polymarket">market &#8599;</a></div>' +
				'<div class="el-row__b"><span class="el-split" title="Normalised market shares' + (st.shift ? ' after your shift' : '') + '"><i class="el-bg-D" style="width:' + s.D + '%"></i><i class="el-bg-I" style="width:' + (r.pO || 0) + '%"></i><i class="el-bg-R" style="width:' + s.R + '%"></i></span><span class="el-cands">' + names + '</span></div>' +
				'<div class="el-row__p" role="group" aria-label="Choose the winner">' + btn('M', 'Market') + btn('D', 'D') + btn('R', 'R') + btn('I', 'I') + btn('U', '?') + '</div></div>';
		}).join('') : '<p class="tu-note">' + (st.sort === 'mine' ? 'You have not changed any race yet. Click a seat, a state or a race.' : rs.length || !races(k).length ? 'No race matches.' : 'No race markets loaded.') + '</p>';
		$('el-more').innerHTML = total > shown ? '<button type="button" class="tu-btn tu-btn--ghost" id="el-morebtn">Show ' + Math.min(60, total - shown) + ' more (' + (total - shown) + ' left)</button>' : (total ? '<span class="tu-note">' + total + ' race' + (total === 1 ? '' : 's') + '</span>' : '');
	}
	$('el-more').addEventListener('click', function (e) { if (e.target.id === 'el-morebtn') { shown += 60; drawList(); } });
	$('el-find').addEventListener('input', function () { st.find = ''; shown = 30; drawList(); drawMap(cur()); });
	$('el-list').addEventListener('click', function (e) { var b = e.target.closest('[data-pk]'); if (!b) return; setPick(b.closest('[data-k]').getAttribute('data-k'), b.getAttribute('data-pk')); });
	function drawBuild(fromSlider) {
		segSet('el-ch', st.ch); segSet('el-base', st.base); segSet('el-sort', st.sort);
		$('el-shift').value = st.shift; $('el-ind').value = st.ind;
		$('el-shiftv').textContent = st.shift ? Math.abs(st.shift) + ' pts toward ' + (st.shift < 0 ? 'D' : 'R') : 'none';
		var c = cur();
		// the slider runs D (left) to R (right); internally + = toward D
		if (!c.rs.length) { $('el-result').innerHTML = '<p class="tu-note">Race markets did not load. Try Refresh.</p>'; }
		drawResult(c); drawArc(c); drawMap(c); legend();
		if (!fromSlider || st.sort === 'close') drawList(); else drawList();
		var sm = E.sumShares(c.rs), ex = st.ch === 'S' ? ' (+' + (E.SENATE.hold.D + E.SENATE.hold.I) + ' D/I and ' + E.SENATE.hold.R + ' R not on the ballot)' : st.ch === 'G' ? ' (+' + E.GOV.hold.D + ' D and ' + E.GOV.hold.R + ' R not on the ballot)' : '';
		$('el-sumnote').innerHTML = c.rs.length ? 'Adding up each race&rsquo;s market share ' + q('sum') + ': D &asymp; ' + sm.D + ', R &asymp; ' + sm.R + (sm.O ? ', others &asymp; ' + sm.O : '') + ' of the ' + c.rs.length + ' races' + ex + '. Prices: Polymarket ' + q('shares') + '.' : '';
	}

	// ---------- US: overview markets, results links, context ----------
	function drawOverview() {
		var ov = src('races') ? src('races').overview : {}, out = [];
		function block(id, title, note) {
			var e = ov[id]; if (!e) return;
			var mx = Math.max.apply(null, e.oc.map(function (o) { return o.p; }));
			out.push('<div class="el-ovb"><a href="' + esc(e.url) + '" target="_blank" rel="noopener"><b>' + esc(title || e.title) + '</b> &#8599;</a><small>Polymarket · $' + E.fmt(e.vol / 1e6, 1) + 'M traded' + (note ? ' · ' + note : '') + '</small><ul>' + e.oc.map(function (o) {
				var cl = /^d |democrat/i.test(o.l) ? 'D' : /^r |republican/i.test(o.l) ? 'R' : 'N';
				return '<li><span class="el-ovl">' + esc(o.l) + '</span><span class="el-ovbar"><i class="el-bg-' + (cl === 'N' ? 'N' : cl) + '" style="width:' + (o.p / Math.max(mx, 1) * 100) + '%"></i></span><b>' + E.pct(o.p) + '</b></li>';
			}).join('') + '</ul></div>');
		}
		block('balance', 'Balance of power after the midterms');
		block('rsenseats', 'Republican Senate seats after the midterms', 'each bracket priced separately');
		block('rgovs', 'Republican governors after the midterms', 'each bracket priced separately');
		$('el-ovgrid').innerHTML = out.join('') || '<p class="tu-note">These markets did not load right now.</p>';
	}
	function drawLinks() {
		var f = String($('el-sfind').value || '').toLowerCase();
		$('el-slinks').innerHTML = Object.keys(E.RESULTS_URLS).filter(function (s) { return !f || (E.STATES[s] + ' ' + s).toLowerCase().indexOf(f) >= 0; }).sort(function (a, b) { return E.STATES[a] < E.STATES[b] ? -1 : 1; }).map(function (s) {
			return '<a href="' + esc(E.RESULTS_URLS[s]) + '" target="_blank" rel="noopener"><b>' + s + '</b> ' + esc(E.STATES[s]) + '</a>';
		}).join('');
	}
	$('el-sfind').addEventListener('input', drawLinks);
	function drawCtx() {
		var H = E.HOUSE.now;
		$('el-now').innerHTML = '<ul class="el-ul"><li>House: R ' + H.R + ', D ' + H.D + ', I ' + H.I + ' (Kevin Kiley, CA-03), ' + H.V + ' vacant (FL-20, TX-23).</li><li>Senate: R ' + E.SENATE.now.R + ', D ' + E.SENATE.now.D + ', I ' + E.SENATE.now.I + ' (Bernie Sanders, Angus King; both caucus with the Democrats). Vice President: ' + E.SENATE.vpName + ' (R).</li><li>Governors: R ' + E.GOV.now.R + ', D ' + E.GOV.now.D + '.</li><li>Open Senate seats ' + q('open') + ': ' + E.SENATE_2026.filter(function (x) { return !/^Running/.test(x[3]); }).map(function (x) { return x[0]; }).join(', ') + '.</li></ul>';
		$('el-redis').innerHTML = E.REDISTRICT.map(function (r) { return '<li><b>' + esc(E.STATES[r[0]]) + '</b>: ' + esc(r[1]) + '</li>'; }).join('') + '<li>Missouri and Virginia: new maps were blocked for 2026.</li>';
		$('el-ussrc').innerHTML = 'Checked ' + esc(E.CHECKED) + ': ' + E.SOURCES_US.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + '</a>'; }).join(' · ');
	}

	// ---------- Canada / BC: parliament renderer ----------
	function arcFor(parties, total, majority, opts) {
		opts = opts || {}; var seats = [];
		parties.forEach(function (p) { for (var i = 0; i < (p.s || 0); i++) seats.push(p); });
		while (seats.length < total) seats.push({ k: 'VAC', n: 'Vacant', col: '#c4c9d0' });
		var pts = E.hemicycle(total), W = AW, H = AH, out = [];
		pts.forEach(function (pt, j) { var p = seats[j], q2 = axy(pt); out.push('<circle cx="' + q2.x + '" cy="' + q2.y + '" r="' + q2.r + '" fill="' + p.col + '" data-p="' + esc(p.k) + '"' + (opts.dim && opts.dim[p.k] ? ' opacity="0.25"' : '') + '></circle>'); });
		out.push('<text class="el-arcn" x="' + W / 2 + '" y="' + (H - 58) + '" text-anchor="middle">' + total + ' seats</text><text class="el-arcs" x="' + W / 2 + '" y="' + (H - 34) + '" text-anchor="middle">' + majority + ' for a majority</text>');
		return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(parties.filter(function (p) { return p.s; }).map(function (p) { return p.n + ' ' + p.s; }).join(', ')) + '">' + out.join('') + '</svg>';
	}
	function sw(col) { return '<i class="el-sw" style="background:' + col + '"></i>'; }
	function partyTable(D) {
		var mx = Math.max.apply(null, D.parties.map(function (p) { return Math.max(p.pc, p.s / D.seats * 100); }));
		return '<div class="el-ptab" role="table"><div class="el-ptr el-pth" role="row"><span role="columnheader">Party</span><span role="columnheader">Seats</span><span role="columnheader">' + (D.noVotes ? '' : 'Votes ' + q('popvote')) + '</span><span role="columnheader">' + (D.noVotes ? 'Seat share' : 'Seat share vs vote share') + '</span></div>' +
			D.parties.map(function (p) { var ss = p.s / D.seats * 100; return '<div class="el-ptr" role="row"><span role="cell">' + sw(p.col) + esc(p.n) + (p.only ? ' <small>' + esc(p.only) + '</small>' : '') + '</span><span role="cell"><b>' + p.s + '</b></span><span role="cell">' + (p.v ? E.fmt(p.v) + ' <small>' + E.fmt(p.pc, 2) + '%</small>' : '–') + '</span><span role="cell" class="el-sv"><span class="el-svb"><i style="width:' + (ss / mx * 100) + '%;background:' + p.col + '"></i></span>' + (D.noVotes ? '' : '<span class="el-svb el-svb--v"><i style="width:' + (p.pc / mx * 100) + '%;background:' + p.col + '"></i></span>') + '<small>' + E.fmt(ss, 1) + '% of seats' + (D.noVotes ? '' : ' · ' + E.fmt(p.pc, 1) + '% of votes') + '</small></span></div>'; }).join('') + '</div>';
	}
	function drawParl(boxId, D, extra) {
		var big = D.parties.slice().sort(function (a, b) { return b.s - a.s; })[0], maj = big.s >= D.majority;
		var head = '<div class="tu-card el-parl" id="' + boxId + '-card"><div class="el-chead"><h2>' + esc(D.title) + '</h2></div>' +
			'<p class="tu-note">' + esc(D.status) + (D.prelim ? ' <b>Numbers may change.</b>' : '') + ' ' + q(D.prelim ? 'initial' : 'fptp') + '</p>' +
			'<div class="el-pres"><div class="el-parlarc">' + arcFor(D.parties, D.seats, D.majority) + '</div><div class="el-pside"><div class="el-big">' + esc(big.n) + ': ' + big.s + ' of ' + D.seats + '</div><p>' + (maj ? 'A majority ' + q('majgov') + ' (' + D.majority + ' needed).' : 'Short of a majority by ' + (D.majority - big.s) + ' ' + q('mingov') + '.') + '</p>' +
			(D.turnout ? '<p class="tu-note">Turnout ' + q('turnout') + ': ' + E.fmt(D.turnout, 2) + '%' + (D.votes ? ' · ' + E.fmt(D.votes) + ' valid votes' : '') + '</p>' : '') + '</div></div>' + partyTable(D) +
			(D.notes ? '<ul class="el-ul el-notes">' + D.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
			(D.sources ? '<p class="tu-note">Sources: ' + D.sources.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + '</a>'; }).join(' · ') + '</p>' : '') + '</div>';
		$(boxId).innerHTML = head + (extra === false ? '' : whatIf(D, boxId) + coalCard(D, boxId));
		addPanels();
	}
	// what if seats followed the vote
	function whatIf(D, id) {
		var pr = E.proportional(D.parties, D.seats, st.pr, st.thr), ps = D.parties.map(function (p) { return { k: p.k, n: p.n, col: p.col, s: pr[p.k] || 0, v: p.v, pc: p.pc }; });
		var prMaj = ps.filter(function (p) { return p.s >= D.majority; })[0];
		return '<div class="tu-card el-whatif" id="' + id + '-wi"><div class="el-chead"><h2>What if seats followed the vote? ' + q('pr') + '</h2></div>' +
			'<div class="el-ctrls"><div class="el-ctrl"><span class="el-ctrl__l">Method</span><div class="tu-seg el-prm" data-v="' + st.pr + '"><button type="button" data-v="dhondt" aria-pressed="' + (st.pr === 'dhondt') + '">D&rsquo;Hondt</button><button type="button" data-v="sl" aria-pressed="' + (st.pr === 'sl') + '">Sainte-Lagu&euml;</button><button type="button" data-v="hare" aria-pressed="' + (st.pr === 'hare') + '">Largest remainder</button></div> ' + q(st.pr === 'sl' ? 'sl' : st.pr === 'hare' ? 'hare' : 'dhondt') + '</div>' +
			'<div class="el-ctrl el-ctrl--shift"><label class="el-ctrl__l">Threshold ' + q('threshold') + '</label><div class="el-shiftrow"><input type="range" class="el-thr" min="0" max="10" step="0.5" value="' + st.thr + '" aria-label="Threshold in percent"><output>' + E.fmt(st.thr, 1) + '%</output><button type="button" class="tu-btn tu-btn--ghost el-thr0">Reset</button></div></div></div>' +
			'<div class="el-pres"><div class="el-parlarc">' + arcFor(ps, D.seats, D.majority) + '</div><div class="el-pside"><ul class="el-cmp">' + D.parties.map(function (p) { var a = pr[p.k] || 0, d = a - p.s; return '<li>' + sw(p.col) + '<span>' + esc(p.n) + '</span><b>' + a + '</b><small>' + (d ? (d > 0 ? '+' : '') + d + ' vs actual' : 'same') + '</small></li>'; }).join('') + '</ul><p>' + (prMaj ? esc(prMaj.n) + ' would still have a majority.' : 'No party would have a majority.') + '</p></div></div>' +
			'<p class="tu-note">The same votes, shared out across ' + (D.id === 'ca2025' ? 'the whole country' : 'the whole province') + ' with this formula. Only a comparison: under another system parties would campaign and people might vote differently.' + (D.id === 'ca2025' ? ' The Bloc Québécois runs only in Quebec, so a nationwide count understates how its votes work regionally.' : '') + '</p></div>';
	}
	function coalCard(D, id) {
		var sel = st.coal[D.id] || {}, sum = 0, parts = D.parties.filter(function (p) { return p.s > 0; });
		parts.forEach(function (p) { if (sel[p.k]) sum += p.s; });
		var mins = E.coalitions(D.parties, D.majority);
		return '<div class="tu-card el-coal" id="' + id + '-co"><div class="el-chead"><h2>Who could make a majority? ' + q('coalition') + '</h2></div><p class="tu-note">Tap parties to add them together.</p>' +
			'<div class="el-coalchips">' + parts.map(function (p) { return '<button type="button" class="el-cchip" data-co="' + esc(p.k) + '" data-d="' + D.id + '" aria-pressed="' + (!!sel[p.k]) + '" style="--pc:' + p.col + '">' + sw(p.col) + esc(p.n) + ' <b>' + p.s + '</b></button>'; }).join('') + '<button type="button" class="tu-btn tu-btn--ghost el-co0" data-d="' + D.id + '">Clear</button></div>' +
			'<div class="el-rb el-rb--co" role="img" aria-label="' + sum + ' of ' + D.seats + ' seats">' + (function () { var x = 0; return parts.filter(function (p) { return sel[p.k]; }).map(function (p) { var w = p.s / D.seats * 100, s = '<i style="left:' + x + '%;width:' + w + '%;background:' + p.col + '"></i>'; x += w; return s; }).join(''); })() + '<b class="el-maj" style="left:' + (D.majority / D.seats * 100) + '%"><span>' + D.majority + '</span></b></div>' +
			'<div class="el-verdict">' + (sum ? '<b>' + sum + ' seats</b>: ' + (sum >= D.majority ? 'a majority (' + (sum - D.majority + 1) + ' to spare).' : (D.majority - sum) + ' short of a majority.') : 'Nothing chosen yet.') + '</div>' +
			'<p class="tu-note">Smallest groups that reach ' + D.majority + ': ' + (mins.length ? mins.map(function (m) { return esc(m.ks.map(function (k) { return D.parties.filter(function (p) { return p.k === k; })[0].n; }).join(' + ')) + ' (' + m.s + ')'; }).join('; ') : 'none') + '. Arithmetic only, not a prediction of any agreement.</p></div>';
	}
	root.addEventListener('click', function (e) {
		var b = e.target.closest('.el-prm button'); if (b) { st.pr = b.getAttribute('data-v'); save(); drawTab(st.tab); return; }
		b = e.target.closest('.el-thr0'); if (b) { st.thr = 0; save(); drawTab(st.tab); return; }
		b = e.target.closest('.el-cchip'); if (b) { var d = b.getAttribute('data-d'), k = b.getAttribute('data-co'); st.coal[d] = st.coal[d] || {}; st.coal[d][k] = !st.coal[d][k]; drawTab(st.tab); return; }
		b = e.target.closest('.el-co0'); if (b) { st.coal[b.getAttribute('data-d')] = {}; drawTab(st.tab); }
	});
	root.addEventListener('input', function (e) { if (e.target.classList && e.target.classList.contains('el-thr')) { st.thr = +e.target.value; save(); var y = window.scrollY; drawTab(st.tab); window.scrollTo(0, y); var t = root.querySelector('#el-p-' + st.tab + ' .el-thr'); if (t) t.focus(); } });
	segOn('el-casel', function (v) { st.ca = v; save(); drawCa(); });
	segOn('el-bcsel', function (v) { st.bc = v; save(); drawBc(); });
	function drawCa() {
		segSet('el-casel', st.ca);
		if (st.ca === 'now') {
			var c = src('commons'), base = E.CA2025;
			if (!c) { $('el-ca').innerHTML = '<div class="tu-card"><p>The House of Commons standings did not load right now. <a href="https://www.ourcommons.ca/members/en/party-standings" target="_blank" rel="noopener">See them on ourcommons.ca</a>.</p></div>'; return; }
			var ps = base.parties.filter(function (p) { return p.k !== 'PPC' && p.k !== 'OTH'; }).map(function (p) { var name = Object.keys(E.COMMONS_KEYS).filter(function (n) { return E.COMMONS_KEYS[n] === p.k; })[0]; return { k: p.k, n: p.n, col: p.col, s: c.by[name] || 0, v: 0, pc: 0 }; });
			if (c.by.Independent) ps.push({ k: 'IND', n: 'Independent', col: '#8a8f98', s: c.by.Independent, v: 0, pc: 0 });
			if (c.by.Vacant) ps.push({ k: 'VAC', n: 'Vacant', col: '#c4c9d0', s: c.by.Vacant, v: 0, pc: 0 });
			var known = {}; Object.keys(E.COMMONS_KEYS).forEach(function (n) { known[n] = 1; });
			Object.keys(c.by).forEach(function (n) { if (!known[n]) ps.push({ k: n, n: n, col: '#9aa3ad', s: c.by[n], v: 0, pc: 0 }); });
			var D = { id: 'canow', noVotes: 1, title: 'House of Commons today', seats: c.total, majority: Math.floor(c.total / 2) + 1, parties: ps, status: 'Live party standings from the House of Commons (members change party, resign or are elected in by-elections between general elections). A majority is counted out of all 343 seats.', sources: [['House of Commons: party standings', 'https://www.ourcommons.ca/members/en/party-standings'], ['Changes in membership', 'https://www.ourcommons.ca/members/en/party-standings/changes-in-membership']] };
			D.majority = 172;
			drawParl('el-ca', D, false);
			$('el-ca').insertAdjacentHTML('beforeend', coalCard(D, 'el-ca'));
			var diff = ps.map(function (p) { var b0 = base.parties.filter(function (x) { return x.k === p.k; })[0]; return b0 && b0.s !== p.s ? esc(p.n) + ' ' + (p.s - b0.s > 0 ? '+' : '') + (p.s - b0.s) : null; }).filter(Boolean);
			if (diff.length) $('el-ca-card').insertAdjacentHTML('beforeend', '<p class="tu-note">Since the 2025 election: ' + diff.join(', ') + '.</p>');
			return;
		}
		drawParl('el-ca', E.CA2025);
	}
	function bcLive() {
		var b = src('bcenr'), D = JSON.parse(JSON.stringify(E.BC2026)); if (!b || !b.parties || !b.parties.length) return D;
		var by = {}, oth = { s: 0, v: 0, pc: 0 };
		b.parties.forEach(function (p) { if (p.k) by[p.k] = p; else { oth.s += p.s; oth.v += p.v; oth.pc += p.pc; } });
		D.parties.forEach(function (p) { if (by[p.k]) { p.s = by[p.k].s; p.v = by[p.k].v; p.pc = by[p.k].pc; } else if (p.k === 'OTH') { p.s = oth.s; p.v = oth.v; p.pc = E.round(oth.pc, 2); } });
		D.parties.sort(function (a, c) { return c.s - a.s || c.v - a.v; });
		if (b.turnout) D.turnout = b.turnout; if (b.votes) D.votes = b.votes;
		var fin = b.final === 'Complete';
		D.prelim = !fin;
		D.status = (fin ? 'Final count complete' : 'Initial count' + (b.initial ? ' ' + b.initial.toLowerCase() : '') + '; final count ' + (b.final ? 'scheduled for ' + b.final : 'to come') + '. Mail-in and absentee ballots are counted at the final count.') + (b.asOf ? ' Elections BC, as of ' + b.asOf + '.' : '');
		return D;
	}
	function drawBc() {
		segSet('el-bcsel', st.bc);
		if (st.bc === 'bc2024') return drawParl('el-bc', E.BC2024);
		var D = bcLive();
		if (st.bc === 'bc2026') return drawParl('el-bc', D);
		// compare 2024 -> 2026
		var a = E.BC2024, keys = ['CON', 'NDP', 'GRN'], rows = keys.map(function (k) { var x = a.parties.filter(function (p) { return p.k === k; })[0], y = D.parties.filter(function (p) { return p.k === k; })[0]; return { n: y.n, col: y.col, s0: x.s, s1: y.s, v0: x.pc, v1: y.pc }; });
		var W = 600, H = 260, pad = 70, mx = 70, out = [];
		[0, 20, 40, 60].forEach(function (v) { var y = H - 30 - v / mx * (H - 60); out.push('<line class="el-grid" x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y + '" y2="' + y + '"></line><text class="el-ax" x="' + (pad - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>'); });
		var my = H - 30 - 47 / mx * (H - 60); out.push('<line class="el-majl" x1="' + pad + '" x2="' + (W - pad) + '" y1="' + my + '" y2="' + my + '"></line><text class="el-ax" x="' + (W - pad + 6) + '" y="' + (my + 4) + '">47</text>');
		rows.forEach(function (r) { var y0 = H - 30 - r.s0 / mx * (H - 60), y1 = H - 30 - r.s1 / mx * (H - 60); out.push('<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y0 + '" y2="' + y1 + '" stroke="' + r.col + '" stroke-width="4"></line><circle cx="' + pad + '" cy="' + y0 + '" r="7" fill="' + r.col + '"></circle><circle cx="' + (W - pad) + '" cy="' + y1 + '" r="7" fill="' + r.col + '"></circle><text class="el-ax el-axb" x="' + (pad + 12) + '" y="' + (y0 - 9) + '">' + r.s0 + '</text><text class="el-ax el-axb" x="' + (W - pad - 12) + '" y="' + (y1 - 9) + '" text-anchor="end">' + r.s1 + '</text>'); });
		out.push('<text class="el-ax el-axb" x="' + pad + '" y="' + (H - 8) + '" text-anchor="middle">2024</text><text class="el-ax el-axb" x="' + (W - pad) + '" y="' + (H - 8) + '" text-anchor="middle">2026' + (D.prelim ? ' (initial)' : '') + '</text>');
		$('el-bc').innerHTML = '<div class="tu-card el-parl" id="el-bc-card"><div class="el-chead"><h2>British Columbia: 2024 to 2026</h2></div><div class="el-slope"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Seats in 2024 and 2026">' + out.join('') + '</svg></div>' +
			'<div class="el-ptab"><div class="el-ptr el-pth"><span>Party</span><span>Seats 2024 &rarr; 2026</span><span>Vote 2024 &rarr; 2026</span><span>Change</span></div>' + rows.map(function (r) { return '<div class="el-ptr"><span>' + sw(r.col) + esc(r.n) + '</span><span><b>' + r.s0 + ' &rarr; ' + r.s1 + '</b></span><span>' + E.fmt(r.v0, 2) + '% &rarr; ' + E.fmt(r.v1, 2) + '%</span><span>' + (r.s1 - r.s0 > 0 ? '+' : '') + (r.s1 - r.s0) + ' seats, ' + (r.v1 - r.v0 > 0 ? '+' : '') + E.fmt(r.v1 - r.v0, 1) + ' pts</span></div>'; }).join('') + '</div>' +
			'<p class="tu-note">' + esc(D.status) + ' 2024: final results. In 2024 BC United (formerly the BC Liberals) stepped aside before the vote; CentreBC and OneBC first ran in 2026.</p></div>';
		addPanels();
	}

	// ---------- calendar ----------
	segOn('el-calg', function (v) { st.calg = v; save(); drawCal(); });
	$('el-calfind').addEventListener('input', drawCal);
	function drawCal() {
		segSet('el-calg', st.calg); $('el-calchk').textContent = E.CHECKED;
		var now = Date.now(), f = String($('el-calfind').value || '').toLowerCase();
		var rows = E.upcoming(now, st.calg).filter(function (r) { return !f || (r[3] + ' ' + r[4]).toLowerCase().indexOf(f) >= 0; });
		var G = { ca: 'Canada', us: 'United States', world: 'World' };
		$('el-cal').innerHTML = rows.map(function (r) {
			var t = E.calTime(r[0]), d = Math.ceil((t - now) / 864e5), exact = /^\d{4}-\d\d-\d\d$/.test(r[0]) && !r[1];
			var when = d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 60 ? 'in ' + d + ' days' : d < 730 ? 'in ' + Math.round(d / 30.4) + ' months' : 'in ' + (d / 365.25).toFixed(1) + ' years';
			return '<div class="el-crow el-g-' + r[2] + '"><div class="el-cdate"><b>' + esc(dlong(r[0])) + '</b>' + (r[1] ? '<small>' + esc(r[1]) + '</small>' : '') + '<span class="el-cwhen' + (d <= 7 ? ' el-soon' : '') + '">' + (exact || d > 30 ? when : 'about ' + when) + '</span></div><div class="el-cwhat"><b>' + esc(r[3]) + '</b> <span class="el-gtag">' + G[r[2]] + '</span><span>' + esc(r[4]) + '</span><small>' + esc(r[5]) + ' · <a href="' + esc(r[6]) + '" target="_blank" rel="noopener">source</a></small></div></div>';
		}).join('') || '<p class="tu-note">Nothing matches.</p>';
		$('el-recent').innerHTML = E.RECENT.filter(function (r) { return (st.calg === 'all' || r[1] === st.calg) && (!f || (r[2] + ' ' + r[3]).toLowerCase().indexOf(f) >= 0); }).sort(function (a, b) { return a[0] < b[0] ? 1 : -1; }).map(function (r) {
			return '<div class="el-crow"><div class="el-cdate"><b>' + esc(dlong(r[0])) + '</b></div><div class="el-cwhat"><b>' + esc(r[2]) + '</b> <span class="el-gtag">' + G[r[1]] + '</span><span>' + esc(r[3]) + ': ' + esc(r[4]) + '</span><small><a href="' + esc(r[5]) + '" target="_blank" rel="noopener">source</a></small></div></div>';
		}).join('') || '<p class="tu-note">Nothing matches.</p>';
	}

	// ---------- panels (Fill window / Full screen) ----------
	function addPanels() {
		if (!window.MESPanel) return;
		[['el-build', '.el-chead'], ['el-ca-card', '.el-chead'], ['el-bc-card', '.el-chead'], ['el-ca-wi', '.el-chead'], ['el-bc-wi', '.el-chead']].forEach(function (x) { var s = $(x[0]); if (s) window.MESPanel.add(s, { bar: s.querySelector(x[1]) }); });
	}

	// ---------- footer ----------
	var SRCN = { races: 'Polymarket: every midterm race and the big-question markets', kalshiH: 'Kalshi: House control', kalshiS: 'Kalshi: Senate control', commons: 'House of Commons: party standings', bcenr: 'Elections BC: 2026 results' };
	function foot() {
		if (!data) { $('el-updated').textContent = ''; return; }
		var g = Date.parse(data.generated), ago = Math.max(0, Math.round((Date.now() - g) / 60000));
		$('el-updated').textContent = (MOCK ? 'Sample data saved ' : 'Updated ') + (ago < 1 ? 'just now' : ago < 120 ? ago + ' min ago' : new Date(g).toLocaleString());
		$('el-srcs').innerHTML = Object.keys(SRCN).map(function (k) { var s = data.sources[k]; return '<li><span class="el-dotok ' + (s && s.ok ? 'ok' : 'bad') + '"></span>' + esc(SRCN[k]) + (s && !s.ok ? ' <small>(' + esc(s.error) + ')</small>' : '') + '</li>'; }).join('');
	}

	function drawTab(t) {
		if (t === 'us') { usCards(); drawBuild(); drawOverview(); drawLinks(); drawCtx(); }
		else if (t === 'ca') drawCa();
		else if (t === 'bc') drawBc();
		else drawCal();
		addPanels();
	}
	function drawAll() { drawTab(st.tab); foot(); }
	window.addEventListener('resize', function () { /* SVGs scale with their viewBox */ });
	if (window.MESPanel) addPanels(); else document.addEventListener('DOMContentLoaded', addPanels);
	showTab(st.tab);
	load();
	setInterval(function () { if (!document.hidden && !MOCK) load(); }, 5 * 60 * 1000);
})();
