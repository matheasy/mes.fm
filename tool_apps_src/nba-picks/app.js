/* MES Picks page script (NBA, NFL, MLB, NHL, La Liga, Premier League: the league is <div id="np" data-lg>). lib.js = MESNBA is prepended by build_tool_apps.py.
   Standings: /api/nba-standings?lg= (edge-cached ESPN + playoff results), else ESPN directly (CORS-open, no playoffs), else the committed sample (local previews, ?mock=1).
   State: localStorage mes-nba-picks:v1 (NBA, the first version's key) / mes-<lg>-picks:v1. Share links ?n=&<group key>=&p= (no server). Leaderboard: /api/nba-picks?lg=. */
(function () {
	'use strict';
	var N = window.MESNBA, root = document.getElementById('np');
	if (!N || !root) return;
	var LGID = root.getAttribute('data-lg') || 'nba', LG = N.league(LGID);
	if (!LG) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = LGID === 'nba' ? 'mes-nba-picks:v1' : 'mes-' + LGID + '-picks:v1';
	var ESPN = 'https://site.api.espn.com/apis/';
	var qs = new URLSearchParams(location.search), LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname), MOCK = qs.get('mock') === '1';
	var EXAMPLE = LGID === 'nba' ? '1 76ers\n2 Celtics\n3 Knicks\n4 Raptors\n5 Cavaliers\n6 Pistons\n7 Pacers\n8 Hawks\n9 Heat\n10 Magic\n11 Hornets\n12 Wizards\n13 Bulls\n14 Bucks\n15 Nets' : '';

	var CTX = N.makeCtx(LGID, null), VIEWS = [], ST = null, CUR_SEASON = 0, CUR_ST = null;
	function uid() { return Math.random().toString(36).slice(2, 10); }
	var S = { sets: [], cur: '', cmp: '', view: '', k: 'w3', ties: true, season: 0, lbB: '', lbM: 'w3', who: 'a', vizAll: false };
	try {
		var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
		if (saved && Array.isArray(saved.sets)) S = Object.assign(S, saved);
	} catch (e) {}
	// the first version's NBA sets kept E / W at the top
	S.sets = (S.sets || []).filter(function (s) { return s && s.id; }).map(function (s) {
		if (!s.lists) s.lists = {};
		if (s.E && !s.lists.E) s.lists.E = s.E; if (s.W && !s.lists.W) s.lists.W = s.W;
		delete s.E; delete s.W;
		if (!s.po) s.po = N.emptyPo(LG);
		return s;
	});
	if (S.conf && !S.view) S.view = S.conf; delete S.conf;
	if (S.lbB === 'both') S.lbB = 'all';
	if (S.lbM === 'top10') S.lbM = 'cut';
	if (['exact', 'w1', 'w2', 'w3', 'tier'].indexOf(S.k) < 0) S.k = 'w3';
	if (!S.sets.length) { var first = { id: uid(), name: 'My picks', lists: {}, po: N.emptyPo(LG) }; S.sets.push(first); S.cur = first.id; }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function setById(id) { for (var i = 0; i < S.sets.length; i++) if (S.sets[i].id === id) return S.sets[i]; return null; }
	function cur() { return setById(S.cur) || (S.cur = S.sets[0].id, S.sets[0]); }
	function cmp() { var c = setById(S.cmp); return c && c.id !== S.cur ? c : null; }
	function az(k) { return (CTX.groups[k] || []).slice(); }
	function isAZ(list, k) { return !list || list.join() === az(k).join(); }
	// every set gets every table (A-Z where missing); lists that no longer fit (a club promoted in soccer) are completed
	function fixSets() {
		S.sets.forEach(function (s) {
			Object.keys(CTX.groups).forEach(function (k) {
				var g = CTX.groups[k];
				if (!N.validList(s.lists[k], g)) s.lists[k] = s.lists[k] ? N.completeList(s.lists[k], g) : g.slice();
			});
			s.po = N.cleanPo(CTX, s.po);
		});
	}
	function view() { for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].k === S.view) return VIEWS[i]; return VIEWS[0]; }

	function toast(t) { var el = $('np-toast'); el.textContent = t; el.classList.add('tu-toast--show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('tu-toast--show'); }, 2600); }
	function status(t, err) { var el = $('np-status'); el.hidden = !t; el.textContent = t || ''; el.classList.toggle('err', !!err); }
	function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
	function pct(x) { return Math.round(x * 100) + '%'; }
	function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
	function team(id) { return CTX.teams[id] || { id: id, name: id, full: id, short: id, c1: '#64748b', c2: '#cbd5e1' }; }
	function short(id) { var t = team(id), n = t.short || t.name || id; return n.replace('Trail Blazers', 'Blazers').replace('Timberwolves', 'Wolves'); }
	// a team mark: the ESPN logo on a white chip when there is one, else the colour badge with the short id
	function badge(id, small) {
		var t = team(id), lg = N.logoUrl(t.logo, small ? 40 : 64);
		if (lg && !badge.off) {
			var w = el('span', 'np-logo' + (small ? ' np-logo--s' : '')), img = el('img');
			img.src = lg; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = img.height = small ? 20 : 26;
			img.onerror = function () { w.replaceWith(colorBadge(id, small)); };
			w.appendChild(img); w.title = t.full; return w;
		}
		return colorBadge(id, small);
	}
	function colorBadge(id, small) {
		var t = team(id), b = el('span', 'np-badge' + (small ? ' np-badge--s' : ''), id);
		b.style.background = t.c1; b.style.color = N.textOn(t.c1); b.style.borderColor = t.c2;
		return b;
	}
	function gname(k) { var m = N.groupMeta(CTX, k); return m ? m.short : k; }
	function vname(v) { return v.k === 'L' ? (LG.confs ? 'whole-league' : 'table') : v.k === 'D' ? 'division' : gname(v.k); }

	// ---------- standings ----------
	function getJson(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
	function direct(season) {
		var q = season ? '?season=' + season : '', base = ESPN + 'v2/sports/' + LG.sport + '/standings';
		return Promise.all([getJson(base + q), LG.divs ? getJson(base + (q ? q + '&' : '?') + 'level=3').catch(function () { return null; }) : null, getJson(ESPN + 'site/v2/sports/' + LG.sport + '/teams?limit=100').catch(function () { return null; })])
			.then(function (a) {
				var s = N.normEspn(LGID, a[0], a[1], a[2]);
				if (!N.okStandings(s, LGID)) throw new Error('bad shape');
				s.source = 'ESPN'; s.generated = new Date().toISOString(); s.seasonName = N.seasonLabel(s.season, LGID); s.po = null; s.direct = true;
				return s;
			});
	}
	function sample() { return getJson('/' + LG.slug + '/data/sample.json').then(function (j) { j.sample = true; return j; }); }
	function loadStandings(season) {
		var q = '?lg=' + LGID + (season ? '&season=' + season : '');
		if (MOCK) return sample();
		return (LOCAL ? Promise.reject(new Error('local')) : getJson('/api/nba-standings' + q).then(function (j) { if (!N.okStandings(j, LGID)) throw new Error('bad'); return j; }))
			.catch(function () { return direct(season); })
			.catch(function (e) { if (season && season !== CUR_SEASON) throw e; return sample(); });
	}
	function useStandings(st) {
		ST = st;
		CTX = N.makeCtx(LGID, st);
		VIEWS = N.views(CTX);
		if (!view() || VIEWS.every(function (v) { return v.k !== S.view; })) S.view = VIEWS[0].k;
		var wanted = qs.get('v'); if (wanted && VIEWS.some(function (v) { return v.k === wanted; })) { S.view = wanted; useStandings.keep = true; qs.delete('v'); }
		fixSets();
	}
	function showStandings(season) {
		status('Loading the standings…');
		return loadStandings(season).then(function (st) {
			if (!CUR_SEASON || !season) { CUR_SEASON = st.season; CUR_ST = st; }
			useStandings(st); status('');
			S.season = st.season === CUR_SEASON ? 0 : st.season;
			fromLink(); render();
			if (st.sample) status('Showing a saved copy of the standings (' + new Date(st.generated).toLocaleString() + '): the live ones could not be loaded here.');
		}).catch(function () { status('Could not load those standings. Check your connection and press Refresh.', true); });
	}
	function fillSeasons() {
		var sel = $('np-season'); sel.innerHTML = '';
		for (var y = CUR_SEASON; y > CUR_SEASON - 4; y--) {
			var o = el('option', null, N.seasonLabel(y, LGID) + (y === CUR_SEASON ? (CUR_ST && CUR_ST.over ? ' (final)' : ' (now)') : ' (final)')); o.value = y === CUR_SEASON ? '0' : String(y); sel.appendChild(o);
		}
		sel.value = String(S.season || 0);
		var v = view(), gp = ST.gp ? (v.po ? ST.gp.L : ST.gp[v.groups[0]]) : 0, t = new Date(ST.generated);
		$('np-upd').textContent = (gp ? 'about ' + Math.round(gp) + ' games played' : 'no games played yet') + ' · ' + t.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}
	function banner() {
		var b = $('np-banner'), msg = '';
		if (!ST) { b.hidden = true; return; }
		var next = LG.season === 'single' ? String(ST.season + 1) : N.seasonLabel(ST.season + 1, LGID);
		if (S.season) msg = 'You are looking at the final ' + N.seasonLabel(ST.season, LGID) + ' standings. The leaderboard is for the current season.';
		else if (ST.over) msg = 'The ' + ST.seasonName + ' regular season is over: these are the final standings, so the table scores are final and the board is closed.' +
			(ST.po && ST.po.started && !ST.po.done ? ' The playoffs are on: see how your playoff picks are doing on the Playoffs tab.' : ST.po && ST.po.done ? ' ' + team(ST.po.champ).full + ' won it all.' : '') +
			' You can already make and save picks for ' + next + ' here; they are scored once its first games are played.';
		else if (!ST.started) msg = 'No games played yet in ' + ST.seasonName + ': make your picks now, and the scores start with the first games.';
		b.hidden = !msg; b.textContent = msg;
	}

	// ---------- scoring helpers ----------
	function scoreView(set, v, st) {
		st = st || ST;
		if (!st || !set) return null;
		var r = N.scoreLists(CTX, set.lists, st, v.groups, { ties: S.ties });
		return r.m ? r : null;
	}
	function fmtMetric(m, k) {
		if (k === 'pts') return m.pts + ' / ' + 3 * m.n;
		if (k === 'close') return pct(m.close);
		if (k === 'rho') return (m.rho >= 0 ? '' : '−') + Math.abs(m.rho).toFixed(2);
		if (k === 'dist') return m.dist + ' (' + (m.dist / m.n).toFixed(1) + ' a team)';
		return m[k] + ' / ' + m.n;
	}
	var K_LABEL = { exact: 'in the exact spot', w1: 'within 1 spot', w2: 'within 2 spots', w3: 'within 3 spots', tier: 'in the right tier', cut: 'on the right side of the line' };
	function posLabel(t) { return t.lo === t.hi ? ord(t.pos) : S.ties ? 'T' + t.lo + '–' + t.hi : ord(t.pos); }
	function tierText(k) {
		var tiers = N.tiersFor(LG, N.groupType(CTX, k), (CTX.groups[k] || []).length), cut = N.cutFor(LG, N.groupType(CTX, k), (CTX.groups[k] || []).length);
		return { tiers: tiers.map(function (t) { return t.name + ' ' + (t.from === t.to ? t.from : t.from + '-' + t.to); }).join(', '), cut: cut.label };
	}

	// ---------- render ----------
	function render() {
		if (!ST) return;
		var set = cur(), v = view();
		var tabs = $('np-tabs'); tabs.innerHTML = '';
		VIEWS.forEach(function (x) {
			var b = el('button', null, x.name); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.view = x.k; b.setAttribute('aria-selected', String(x.k === v.k));
			b.tabIndex = x.k === v.k ? 0 : -1; tabs.appendChild(b);
		});
		var ss = $('np-set'); ss.innerHTML = '';
		S.sets.forEach(function (s) { var o = el('option', null, s.name); o.value = s.id; ss.appendChild(o); });
		ss.value = set.id;
		var cs = $('np-cmp'); cs.innerHTML = ''; var o0 = el('option', null, 'nobody'); o0.value = ''; cs.appendChild(o0);
		S.sets.forEach(function (s) { if (s.id !== set.id) { var o = el('option', null, s.name); o.value = s.id; cs.appendChild(o); } });
		cs.value = cmp() ? S.cmp : '';
		$('np-del').disabled = S.sets.length < 2;
		root.classList.toggle('np-pomode', !!v.po);
		Array.prototype.forEach.call($('np-k').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === S.k)); });
		$('np-ties').checked = S.ties;
		fillSeasons(); banner();
		if (v.po) { renderPo(); renderPoScore(); renderPoResults(); }
		else { renderLists(); renderScore(); renderViz(); renderTable(); }
		renderCompare(); renderShare(); renderPost();
		save();
	}

	// --- editor: one list per table of the tab (divisions = several short lists) ---
	function renderLists() {
		var set = cur(), v = view(), box = $('np-lists'), sc = scoreView(set, v), byId = {};
		if (sc) Object.keys(sc.parts).forEach(function (k) { sc.parts[k].teams.forEach(function (t) { byId[t.id] = t; }); });
		$('np-edit-title').textContent = set.name + ': ' + (v.k === 'D' ? 'division' : v.k === 'L' ? (LG.confs ? 'whole-league' : LG.name) : v.name) + ' picks';
		box.innerHTML = '';
		box.classList.toggle('np-lists--multi', v.groups.length > 1);
		v.groups.forEach(function (k) {
			var list = set.lists[k], n = list.length, wrap = el('div', 'np-listwrap');
			if (v.groups.length > 1) wrap.appendChild(el('h3', 'np-lh', N.groupMeta(CTX, k).name));
			var ol = el('ol', 'np-list'); ol.dataset.g = k; ol.setAttribute('aria-label', 'Your predicted ' + N.groupMeta(CTX, k).name + ' order, first to last');
			var tiers = N.tiersFor(LG, N.groupType(CTX, k), n), cuts = tiers.slice(0, -1).map(function (t) { return t.to; });
			list.forEach(function (id, i) {
				var t = team(id), li = el('li', 'np-row'); li.dataset.id = id;
				if (cuts.indexOf(i + 1) >= 0) li.classList.add('np-cutafter');
				var rk = el('select', 'np-rank'); rk.setAttribute('aria-label', 'Spot for ' + t.full);
				for (var p = 1; p <= n; p++) { var o = el('option', null, String(p)); o.value = String(p); rk.appendChild(o); }
				rk.value = String(i + 1);
				var g = el('button', 'np-grip'); g.type = 'button'; g.setAttribute('aria-label', 'Move ' + t.full + ', now picked ' + ord(i + 1)); g.innerHTML = '<span aria-hidden="true">⠇⠇</span>';
				li.appendChild(rk); li.appendChild(g); li.appendChild(badge(id));
				var nm = el('span', 'np-tname'); nm.appendChild(el('b', null, short(id)));
				if (t.city && t.city !== t.name && LG.recType !== 'soc') nm.appendChild(el('small', null, ' ' + t.city));
				li.appendChild(nm);
				var s = byId[id];
				if (s && ST.started) {
					var chip = el('span', 'np-now', posLabel(s)); chip.style.borderColor = N.distColor(s.d);
					chip.title = 'Now ' + posLabel(s) + ' (' + N.recText(LG, s.row) + '): ' + (s.d ? s.d + ' spot' + (s.d > 1 ? 's' : '') + ' off' : 'right spot');
					var dot = el('i', 'np-dot'); dot.style.background = N.distColor(s.d); chip.insertBefore(dot, chip.firstChild);
					li.appendChild(chip);
				}
				var up = el('button', 'np-mv', '▲'), dn = el('button', 'np-mv', '▼');
				up.type = dn.type = 'button'; up.dataset.mv = '-1'; dn.dataset.mv = '1';
				up.setAttribute('aria-label', 'Move ' + t.name + ' up'); dn.setAttribute('aria-label', 'Move ' + t.name + ' down');
				up.disabled = i === 0; dn.disabled = i === n - 1;
				li.appendChild(up); li.appendChild(dn);
				ol.appendChild(li);
			});
			wrap.appendChild(ol); box.appendChild(wrap);
		});
		var anyAZ = v.groups.some(function (k) { return isAZ(set.lists[k], k); });
		$('np-hint').textContent = anyAZ ? 'A list still in A-Z order: drag each team (by its handle, on a phone too) to where you think it will finish, use the arrows, pick a spot from the number, or paste a list.'
			: 'Drag a team by its handle, use the arrows, or tap the number to send it to another spot. The chip on the right is where the team is now, coloured by how far off you are.';
		var fromC = $('np-fromconf');
		fromC.hidden = !(LG.confs && (v.k === 'L' || v.k === 'D'));
		fromC.textContent = v.k === 'L' ? 'Merge my conference lists' : 'Order from my conference lists';
		if (LGID === 'mlb') fromC.textContent = v.k === 'L' ? 'Merge my AL + NL lists' : 'Order from my AL / NL lists';
		$('np-example').hidden = !EXAMPLE;
		$('np-paste-lab').textContent = 'One team per line, numbered or not, or separated by commas. Nicknames, cities, short forms and small typos are fine.' + (v.groups.length > 1 ? ' On this tab, paste into one table at a time: ' : '');
		var pt = $('np-paste-g'); pt.innerHTML = ''; pt.hidden = v.groups.length < 2;
		v.groups.forEach(function (k) { var o = el('option', null, N.groupMeta(CTX, k).name); o.value = k; pt.appendChild(o); });
	}

	function renderScore() {
		var set = cur(), v = view(), sc = scoreView(set, v), hero = $('np-hero'), box = $('np-metrics');
		hero.innerHTML = ''; box.innerHTML = '';
		$('np-score-title').textContent = 'How these ' + (v.k === 'L' ? (LG.confs ? 'whole-league' : LG.name) : v.k === 'D' ? 'division' : v.name) + ' picks are doing';
		$('np-kpick').hidden = false;
		var tt = v.groups.length === 1 ? tierText(v.groups[0]) : null;
		$('np-tiers').textContent = tt ? 'Tiers: ' + tt.tiers + '. Line: ' + tt.cut + '.' : 'Each division is scored on its own and the scores are added up. Tier = division winner or not.';
		if (!sc) { hero.textContent = 'Loading…'; $('np-both').textContent = ''; return; }
		var m = sc.m, val = m[S.k];
		var big = el('div', 'np-big'); big.appendChild(el('b', null, String(val))); big.appendChild(el('span', null, '/ ' + m.n));
		hero.appendChild(big);
		var side = el('div', 'np-heros');
		side.appendChild(el('div', 'np-herol', 'teams ' + K_LABEL[S.k]));
		side.appendChild(el('div', 'np-herop', ST.started ? pct(val / m.n) + ' accuracy' : 'no games played yet'));
		var bar = el('div', 'np-bar'), fill = el('i'); fill.style.width = (val / m.n * 100) + '%'; bar.appendChild(fill); side.appendChild(bar);
		hero.appendChild(side);
		var tbl = el('table', 'np-mt');
		N.METRICS.forEach(function (d) {
			var tr = el('tr'); if (d.k === S.k) tr.className = 'on';
			tr.appendChild(el('th', null, d.k === 'cut' && tt ? tt.cut : d.k === 'tier' && v.k === 'D' ? 'Division winner or not' : d.label));
			tr.appendChild(el('td', 'np-mv2', fmtMetric(m, d.k)));
			var td = el('td', 'np-mb'), b = el('span', 'np-bar np-bar--s'), f = el('i'); f.style.width = (N.metricShare(m, d.k) * 100) + '%'; b.appendChild(f); td.appendChild(b); tr.appendChild(td);
			tbl.appendChild(tr);
		});
		box.appendChild(tbl);
		// a one-line summary across every table
		var bits = [];
		VIEWS.forEach(function (x) {
			if (x.po || x.k === v.k) return;
			if (x.groups.some(function (k) { return isAZ(set.lists[k], k); })) return;
			var s = scoreView(set, x); if (s) bits.push(x.name + ' ' + s.m[S.k] + '/' + s.m.n);
		});
		$('np-both').textContent = bits.length ? 'Your other tables, ' + K_LABEL[S.k] + ': ' + bits.join(' · ') + '.' : '';
	}

	// --- the picture: your order on the left, the standings on the right, a line per team coloured by how far off ---
	function vizSet() { var b = cmp(); return S.who === 'b' && b ? b : cur(); }
	function renderViz() {
		var box = $('np-viz'), set = vizSet(), v = view(), sc = scoreView(set, v);
		var who = $('np-who'), b = cmp();
		who.hidden = !b;
		if (b) {
			who.innerHTML = '';
			[['a', cur().name], ['b', b.name]].forEach(function (x) { var bt = el('button', null, x[1]); bt.type = 'button'; bt.dataset.who = x[0]; bt.setAttribute('aria-pressed', String((S.who === 'b' ? 'b' : 'a') === x[0])); who.appendChild(bt); });
		}
		$('np-viz-title').textContent = set.name + '’s ' + vname(v) + ' order vs the standings now';
		var lg = $('np-legend'); lg.innerHTML = '';
		[['right spot', 0], ['1 off', 1], ['2 off', 2], ['3 off', 3], ['4+ off', 4]].forEach(function (x) { var s = el('span'), i = el('i'); i.style.background = N.distColor(x[1]); s.appendChild(i); s.appendChild(document.createTextNode(x[0])); lg.appendChild(s); });
		box.innerHTML = '';
		box.classList.toggle('np-viz--grid', v.groups.length > 1);
		if (!sc) return;
		box._sc = sc;
		v.groups.forEach(function (k) {
			var part = sc.parts[k], holder = el('div', 'np-vizpart');
			if (v.groups.length > 1) holder.appendChild(el('div', 'np-vizh', N.groupMeta(CTX, k).name + ': ' + part.m[S.k] + '/' + part.m.n));
			box.appendChild(holder);
			drawPicture(holder, part, k, v.groups.length > 1);
		});
		var svgs = box.querySelectorAll('svg');
		Array.prototype.forEach.call(svgs, function (svg) { svg.addEventListener('pointerover', vizHover); svg.addEventListener('click', vizHover); svg.addEventListener('pointerleave', function () { vizFocus(null); }); });
	}
	function drawPicture(holder, sc, k, small) {
		var n = sc.n, card = $('np-vizcard');
		var fill = root.classList.contains('np-fillmode') && card.classList.contains('np-expanded') || document.fullscreenElement === card;
		var W = Math.max(280, holder.clientWidth || $('np-viz').clientWidth || 600);
		var rowH = fill && !small ? Math.max(20, Math.min(60, (window.innerHeight - 150) / (n + 0.6))) : (small ? 30 : n > 20 ? (W < 480 ? 26 : 28) : (W < 480 ? 30 : 34));
		var top = 28, H = top + rowH * n + 6, colW = Math.min(W * 0.38, 260), xL = 0, xR = W - colW, fs = Math.min(15, Math.max(10.5, rowH * 0.42));
		var showCity = colW > 170;
		var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'np-svg');
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', N.groupMeta(CTX, k).name + ': ' + sc.m[S.k] + ' of ' + sc.m.n + ' ' + K_LABEL[S.k] + '. ' + sc.teams.map(function (t) { return team(t.id).name + ' picked ' + ord(t.pred) + ', now ' + posLabel(t); }).join('; '));
		var mk = function (tag, a, txt, parent) { var e = document.createElementNS(ns, tag); for (var q in a) e.setAttribute(q, a[q]); if (txt != null) e.textContent = txt; (parent || svg).appendChild(e); return e; };
		var y = function (p) { return top + (p - 1) * rowH; };
		sc.tiers.forEach(function (t, i) {
			mk('rect', { x: 0, y: y(t.from), width: W, height: rowH * (t.to - t.from + 1), class: 'np-band np-band' + Math.min(i, 3) });
			mk('text', { x: W / 2, y: y(t.from) + 13, class: 'np-bandl', 'text-anchor': 'middle' }, (W - 2 * colW > 170 ? t.name + ' (' + (t.from === t.to ? t.from : t.from + '–' + t.to) + ')' : W - 2 * colW > 70 ? t.name : ''));
		});
		mk('text', { x: xL + 4, y: 18, class: 'np-colh' }, 'Picked');
		mk('text', { x: W - 4, y: 18, class: 'np-colh', 'text-anchor': 'end' }, 'Now');
		var lines = mk('g', { class: 'np-lines' }), rowsG = mk('g', {}), byPos = {};
		sc.teams.forEach(function (t) { byPos[t.pos] = t; });
		if (S.ties) {
			for (var p = 1; p <= n; p++) {
				var t0 = byPos[p]; if (!t0 || t0.lo !== p || t0.hi === t0.lo) continue;
				mk('path', { d: 'M' + (xR - 5) + ' ' + (y(t0.lo) + 5) + ' h-4 V' + (y(t0.hi) + rowH - 5) + ' h4', class: 'np-tie' }, null, rowsG);
			}
		}
		function teamCell(t, x, right, p) {
			var g = mk('g', { class: 'np-cell' }, null, rowsG); g.dataset.id = t.id;
			var tm = team(t.id), cy = y(p) + rowH / 2, bw = fs * 3.2, bh = rowH - 8;
			mk('rect', { x: x, y: y(p) + 2, width: colW, height: rowH - 4, rx: 6, class: 'np-cellbg' }, null, g);
			mk('text', { x: right ? x + colW - 6 : x + 6, y: cy + fs * 0.36, class: 'np-num', 'text-anchor': right ? 'end' : 'start' }, right ? (S.ties && t.lo !== t.hi ? 'T' + t.lo : String(p)) : String(p), g);
			var bx = right ? x + colW - 6 - fs * 1.9 - bw : x + 6 + fs * 1.6, lgo = N.logoUrl(tm.logo, 40);
			if (lgo && !badge.off) {
				var sz = Math.min(bh, fs * 1.7), lx = right ? bx + bw - sz : bx;
				mk('rect', { x: lx - 1, y: cy - sz / 2 - 1, width: sz + 2, height: sz + 2, rx: 4, class: 'np-logobg' }, null, g);
				var im = mk('image', { x: lx, y: cy - sz / 2, width: sz, height: sz, href: lgo }, null, g);
				im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', lgo);
				bw = sz; bx = lx;
			} else {
				mk('rect', { x: bx, y: cy - bh / 2, width: bw, height: bh, rx: 4, fill: tm.c1, stroke: tm.c2, 'stroke-width': 2 }, null, g);
				mk('text', { x: bx + bw / 2, y: cy + fs * 0.34, 'text-anchor': 'middle', class: 'np-btxt', fill: N.textOn(tm.c1), 'font-size': fs * 0.82 }, t.id, g);
			}
			var label = short(t.id) + (right && showCity ? ' ' + N.recShort(LG, t.row) : '');
			if (!showCity && right) label = N.recShort(LG, t.row);
			if (!showCity && !right && label.length > 11) label = label.slice(0, 10) + '…';
			mk('text', { x: right ? bx - 6 : bx + bw + 6, y: cy + fs * 0.34, class: 'np-tn', 'text-anchor': right ? 'end' : 'start', 'font-size': fs }, label, g);
		}
		sc.teams.forEach(function (t) {
			teamCell(t, xL, false, t.pred);
			teamCell(t, xR, true, t.pos);
			var x1 = xL + colW, x2 = xR, y1 = y(t.pred) + rowH / 2, y2 = y(t.pos) + rowH / 2, mx = (x1 + x2) / 2;
			var path = mk('path', { d: 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2, stroke: N.distColor(t.d), class: 'np-line', 'stroke-width': t.d === 0 ? 4 : 3 }, null, lines);
			path.dataset.id = t.id;
		});
		holder.appendChild(svg);
	}
	function vizFocus(id) {
		var svgs = $('np-viz').querySelectorAll('svg');
		Array.prototype.forEach.call(svgs, function (svg) {
			svg.classList.toggle('np-hl', !!id);
			Array.prototype.forEach.call(svg.querySelectorAll('[data-id]'), function (e) { e.classList.toggle('on', e.dataset.id === id); });
		});
		var info = $('np-vizinfo'), sc = $('np-viz')._sc;
		if (!id || !sc) { info.textContent = 'Tap or hover a team to follow its line.'; return; }
		var t = null; Object.keys(sc.parts).forEach(function (k) { sc.parts[k].teams.forEach(function (x) { if (x.id === id) t = x; }); });
		if (!t) return;
		info.textContent = team(id).full + ': picked ' + ord(t.pred) + ', now ' + posLabel(t) + ' at ' + N.recText(LG, t.row) + (t.row.gb && LG.recType === 'wl' ? ', ' + t.row.gb + ' games back' : '') + '. ' +
			(t.d === 0 ? 'Right spot.' : t.d + ' spot' + (t.d > 1 ? 's' : '') + ' ' + (t.signed < 0 ? 'lower than you picked' : 'higher than you picked') + '.') + (t.tierOk ? ' Right tier.' : ' Different tier.');
	}
	function vizHover(e) { var g = e.target.closest && e.target.closest('[data-id]'); if (g) vizFocus(g.dataset.id); }

	// --- the standings table of the tab, with your pick next to each team ---
	function renderTable() {
		var v = view(), box = $('np-tables'), set = cur(), sc = scoreView(set, v), byId = {};
		if (sc) Object.keys(sc.parts).forEach(function (k) { sc.parts[k].teams.forEach(function (t) { byId[t.id] = t; }); });
		$('np-table-title').textContent = (v.k === 'D' ? 'Division' : v.k === 'L' ? (LG.confs ? 'Whole-league' : LG.name) : v.long) + ' standings' + (S.season ? ' (' + N.seasonLabel(ST.season, LGID) + ')' : '');
		box.innerHTML = '';
		box.classList.toggle('np-tables--multi', v.groups.length > 1);
		v.groups.forEach(function (k) {
			var rows = ST.groups[k] || [], wrap = el('div', 'tu-table-wrap np-stwrap'), tbl = el('table', 'tu-table np-st');
			if (v.groups.length > 1) wrap.appendChild(el('div', 'np-vizh', N.groupMeta(CTX, k).name));
			var tiers = N.tiersFor(LG, N.groupType(CTX, k), rows.length), cuts = tiers.slice(0, -1).map(function (t) { return t.to; });
			var h = el('tr'), cols = ['#', 'Team', LG.recType === 'soc' ? 'Pts' : LG.recType === 'nhl' ? 'Pts' : 'W-L', LG.recType === 'soc' ? 'W-D-L' : LG.recType === 'nhl' ? 'W-L-OT' : (k === 'L' || N.groupType(CTX, k) === 'div' ? 'Win %' : 'GB'), 'GP', 'Your pick'];
			if (LG.recType === 'soc') cols.splice(4, 0, 'GD');
			cols.forEach(function (c) { h.appendChild(el('th', null, c)); });
			var thead = el('thead'); thead.appendChild(h); tbl.appendChild(thead);
			var tb = el('tbody');
			rows.forEach(function (r, i) {
				var tr = el('tr'); if (cuts.indexOf(i + 1) >= 0) tr.className = 'np-cutrow';
				var s = byId[r.id];
				tr.appendChild(el('td', 'np-r', s && S.ties && s.lo !== s.hi ? 'T' + s.lo : String(i + 1)));
				var tdT = el('td'), tc = el('span', 'np-tcell'); tc.appendChild(badge(r.id, true)); tc.appendChild(el('span', null, short(r.id))); tdT.appendChild(tc); tr.appendChild(tdT);
				if (LG.recType === 'soc') { tr.appendChild(el('td', 'np-b', String(r.pts || 0))); tr.appendChild(el('td', null, r.w + '-' + (r.d || 0) + '-' + r.l)); tr.appendChild(el('td', null, (r.gd > 0 ? '+' : '') + (r.gd || 0))); }
				else if (LG.recType === 'nhl') { tr.appendChild(el('td', 'np-b', String(r.pts || 0))); tr.appendChild(el('td', null, r.w + '-' + r.l + '-' + (r.otl || 0))); }
				else { tr.appendChild(el('td', 'np-b', N.recShort(LG, r))); tr.appendChild(el('td', null, k === 'L' || N.groupType(CTX, k) === 'div' ? r.pct.toFixed(3).replace(/^0/, '') : (r.gb ? String(r.gb) : '–'))); }
				tr.appendChild(el('td', null, String(r.gp)));
				var pk = el('td', 'np-off');
				if (s) { var dt = el('i', 'np-dot'); dt.style.background = N.distColor(s.d); pk.appendChild(dt); pk.appendChild(document.createTextNode(ord(s.pred) + (s.d ? ' (' + s.d + ' off)' : ' ✓'))); }
				tr.appendChild(pk);
				tb.appendChild(tr);
			});
			tbl.appendChild(tb); wrap.appendChild(tbl); box.appendChild(wrap);
		});
	}

	// --- playoffs ---
	function poTeamsFor(s, si, conf) {
		var set = cur(), stages = N.poStages(LG);
		if (si === 0) {
			var base = conf ? (ST.groups[conf] || []).map(function (r) { return r.id; }) : CTX.ids.slice();
			return base;
		}
		var prev = stages[si - 1], arr = set.po[prev.k];
		if (s.champ) return arr.filter(Boolean);
		var ci = LG.confs.map(function (c) { return c.k; }).indexOf(conf);
		return arr.slice(ci * prev.slots, (ci + 1) * prev.slots).filter(Boolean);
	}
	function renderPo() {
		var set = cur(), box = $('np-po'), stages = N.poStages(LG), res = ST.po, sc = N.scorePo(CTX, set.po, res);
		$('np-po-title').textContent = set.name + ': playoff picks' + (S.season ? ' (' + N.seasonLabel(ST.season, LGID) + ')' : '');
		box.innerHTML = '';
		stages.forEach(function (s, si) {
			var col = el('div', 'np-postage'), row = sc.stages[si];
			var hd = el('div', 'np-posh'); hd.appendChild(el('b', null, s.name)); hd.appendChild(el('small', null, ' ' + row.w + ' pt' + (row.w > 1 ? 's' : '') + ' each'));
			col.appendChild(hd);
			var groupsC = s.champ ? [null] : LG.confs.map(function (c) { return c.k; });
			groupsC.forEach(function (conf, ci) {
				var sub = el('div', 'np-poconf');
				if (conf) sub.appendChild(el('div', 'np-pocl', gname(conf)));
				var opts = poTeamsFor(s, si, conf), n = s.champ ? 1 : s.slots;
				for (var i = 0; i < n; i++) {
					var idx = s.champ ? 0 : ci * s.slots + i, val = set.po[s.k][idx] || '', pk = row.picks[idx];
					var slot = el('label', 'np-slot' + (pk && pk.st !== 'none' ? ' np-slot--' + pk.st : ''));
					var mark = val ? badge(val, true) : el('span', 'np-slotempty', '?');
					slot.appendChild(mark);
					var sel = el('select'); sel.dataset.stage = s.k; sel.dataset.idx = String(idx);
					sel.setAttribute('aria-label', s.name + (conf ? ', ' + gname(conf) : '') + ', pick ' + (i + 1));
					var o0 = el('option', null, opts.length ? 'Pick a team…' : (si ? 'Fill the round before first' : 'Pick a team…')); o0.value = ''; sel.appendChild(o0);
					var taken = set.po[s.k].filter(function (x, j) { return x && j !== idx; });
					opts.forEach(function (id) { if (taken.indexOf(id) >= 0) return; var o = el('option', null, team(id).full); o.value = id; sel.appendChild(o); });
					sel.value = val;
					slot.appendChild(sel);
					if (pk && pk.st === 'hit') slot.appendChild(el('span', 'np-slotst', '✓'));
					else if (pk && pk.st === 'miss') slot.appendChild(el('span', 'np-slotst', '✗'));
					sub.appendChild(slot);
				}
				col.appendChild(sub);
			});
			box.appendChild(col);
		});
		var closed = res && res.started;
		$('np-po-note').textContent = closed ? 'The playoffs have started: you can still change these picks here, but the playoff leaderboard only takes picks made before the first game.'
			: 'Pick who gets to each round. A later round only offers the teams you sent through the round before. ' + (res ? '' : 'Picks are scored once the playoffs start.');
		$('np-po-fill').textContent = 'Fill from my ' + LG.confs.map(function (c) { return c.short; }).join(' / ') + ' picks';
	}
	function renderPoScore() {
		var set = cur(), res = ST.po, sc = N.scorePo(CTX, set.po, res), hero = $('np-hero'), box = $('np-metrics');
		hero.innerHTML = ''; box.innerHTML = '';
		$('np-score-title').textContent = 'How these playoff picks are doing';
		$('np-kpick').hidden = true; $('np-tiers').textContent = ''; $('np-both').textContent = '';
		var big = el('div', 'np-big'); big.appendChild(el('b', null, String(sc.pts))); big.appendChild(el('span', null, '/ ' + sc.max));
		hero.appendChild(big);
		var side = el('div', 'np-heros');
		side.appendChild(el('div', 'np-herol', 'playoff points'));
		side.appendChild(el('div', 'np-herop', !res || !res.started ? 'the playoffs have not started' : res.done ? 'final: ' + team(res.champ).full + ' won' : 'still possible: ' + sc.possible + ' of ' + sc.max));
		var bar = el('div', 'np-bar'), fill = el('i'); fill.style.width = (sc.max ? sc.pts / sc.max * 100 : 0) + '%'; bar.appendChild(fill); side.appendChild(bar);
		hero.appendChild(side);
		var tbl = el('table', 'np-mt');
		sc.stages.forEach(function (r) {
			var tr = el('tr');
			tr.appendChild(el('th', null, r.name));
			tr.appendChild(el('td', 'np-mv2', r.n ? r.hit + ' of ' + r.n + ' right' + (r.n < r.picks.length ? ' (' + (r.picks.length - r.n) + ' empty)' : '') : 'not picked'));
			tr.appendChild(el('td', 'np-mv2', r.hit * r.w + ' pts'));
			tbl.appendChild(tr);
		});
		box.appendChild(tbl);
		box.appendChild(el('p', 'np-small', 'Points double each round: ' + N.poStages(LG).map(function (s) { return s.short + ' ' + N.stageWeight(LG, s.k); }).join(', ') + '. A pick counts when that team reaches that round.'));
	}
	function renderPoResults() {
		var res = ST.po, box = $('np-pores'), set = cur(), mine = {};
		N.poStages(LG).forEach(function (s) { (set.po[s.k] || []).forEach(function (id) { if (id) mine[id] = 1; }); });
		box.innerHTML = '';
		$('np-pores-title').textContent = 'Playoff results' + (ST.season ? ' ' + N.seasonLabel(ST.season, LGID) : '');
		if (!res || !res.started) {
			var when = LG.po.months(ST.season)[0], y = when.slice(0, 4), mo = +when.slice(4, 6);
			box.appendChild(el('p', 'np-small', 'No playoff games yet. They are due to start around ' + new Date(Date.UTC(+y, mo - 1, 15)).toLocaleString([], { month: 'long', year: 'numeric', timeZone: 'UTC' }) + '; results show here as they come in (from ESPN).'));
			return;
		}
		if (res.champ) { var ch = el('div', 'np-champ'); ch.appendChild(badge(res.champ)); ch.appendChild(el('b', null, team(res.champ).full + ' are the champions')); box.appendChild(ch); }
		LG.po.stages.filter(function (s) { return !s.champ; }).forEach(function (s) {
			var list = res.series.filter(function (x) { return x.stage === s.k; });
			if (!list.length) return;
			var sec = el('div', 'np-rsec'); sec.appendChild(el('h3', 'np-lh', s.name));
			list.forEach(function (x) {
				var r = el('div', 'np-series');
				[[x.a, x.wa], [x.b, x.wb]].forEach(function (p, i) {
					var t = el('span', 'np-sside' + (x.winner === p[0] ? ' np-sw' : x.done ? ' np-sl' : '') + (mine[p[0]] ? ' np-mine' : ''));
					t.appendChild(badge(p[0], true)); t.appendChild(el('span', null, short(p[0])));
					if (s.bo > 1) t.appendChild(el('b', 'np-sws', String(p[1])));
					r.appendChild(t);
					if (!i) r.appendChild(el('span', 'np-vs', s.bo > 1 ? '–' : 'vs'));
				});
				r.appendChild(el('small', 'np-sst', x.done ? (s.bo > 1 ? short(x.winner) + ' won' : short(x.winner) + ' won') : 'in progress'));
				sec.appendChild(r);
			});
			box.appendChild(sec);
		});
		box.appendChild(el('p', 'np-small', 'Teams you picked anywhere in your bracket are outlined.'));
	}
	$('np-po').addEventListener('change', function (e) {
		var sel = e.target.closest('select'); if (!sel) return;
		var set = cur(); set.po[sel.dataset.stage][+sel.dataset.idx] = sel.value;
		set.po = N.cleanPo(CTX, set.po);
		render();
	});
	$('np-po-fill').onclick = function () { var set = cur(); set.po = N.poFromLists(CTX, set.lists); render(); toast('Bracket filled from your table picks: the higher pick wins every round'); };
	$('np-po-clear').onclick = function () { if (!N.poFilled(cur().po) || confirm('Clear all your playoff picks?')) { cur().po = N.emptyPo(LG); render(); } };

	function renderCompare() {
		var a = cur(), b = cmp(), box = $('np-compare'), v = view();
		box.hidden = !b || !ST;
		if (!b || !ST) return;
		var ct = $('np-ct'), tt = $('np-tt');
		$('np-cmp-title').textContent = 'Head to head (' + v.name + '): ' + a.name + ' vs ' + b.name;
		ct.innerHTML = ''; tt.innerHTML = '';
		var h = el('tr'); h.appendChild(el('th', null, '')); h.appendChild(el('th', null, a.name)); h.appendChild(el('th', null, b.name)); ct.appendChild(h);
		if (v.po) {
			var A = N.scorePo(CTX, a.po, ST.po), B = N.scorePo(CTX, b.po, ST.po);
			[['Points', 'pts'], ['Still possible', 'possible'], ['Right picks', 'hits']].forEach(function (x) {
				var tr = el('tr'); tr.appendChild(el('th', null, x[0]));
				var ta = el('td', null, String(A[x[1]])), tb = el('td', null, String(B[x[1]]));
				if (A[x[1]] > B[x[1]]) ta.className = 'np-win'; else if (B[x[1]] > A[x[1]]) tb.className = 'np-win';
				tr.appendChild(ta); tr.appendChild(tb); ct.appendChild(tr);
			});
			var hh = el('tr'); ['Round', a.name, b.name].forEach(function (x) { hh.appendChild(el('th', null, x)); }); tt.appendChild(hh);
			A.stages.forEach(function (r, i) {
				var tr = el('tr'); tr.appendChild(el('td', null, r.short || r.name));
				[r, B.stages[i]].forEach(function (x) { tr.appendChild(el('td', 'np-off', x.picks.filter(function (p) { return p.id; }).map(function (p) { return short(p.id) + (p.st === 'hit' ? ' ✓' : p.st === 'miss' ? ' ✗' : ''); }).join(', ') || '–')); });
				tt.appendChild(tr);
			});
			return;
		}
		var SA = scoreView(a, v), SB = scoreView(b, v);
		if (!SA || !SB) { box.hidden = true; return; }
		var wa = 0, wb = 0;
		N.METRICS.forEach(function (d) {
			var va = N.metricValue(SA.m, d.k), vb = N.metricValue(SB.m, d.k), tr = el('tr');
			tr.appendChild(el('th', null, d.label));
			var ta = el('td', null, fmtMetric(SA.m, d.k)), tb = el('td', null, fmtMetric(SB.m, d.k));
			if (va > vb + 1e-9) { ta.className = 'np-win'; wa++; } else if (vb > va + 1e-9) { tb.className = 'np-win'; wb++; }
			tr.appendChild(ta); tr.appendChild(tb); ct.appendChild(tr);
		});
		var cap = el('caption', null, wa === wb ? 'Level: ' + wa + ' scores each.' : (wa > wb ? a.name : b.name) + ' leads on ' + Math.max(wa, wb) + ' of ' + N.METRICS.length + ' scores.');
		ct.insertBefore(cap, ct.firstChild);
		var hh2 = el('tr'); ['Team', 'Now', a.name, b.name].forEach(function (x) { hh2.appendChild(el('th', null, x)); }); tt.appendChild(hh2);
		var all = [], bm = {};
		Object.keys(SB.parts).forEach(function (k) { SB.parts[k].teams.forEach(function (t) { bm[t.id] = t; }); });
		Object.keys(SA.parts).forEach(function (k) { all = all.concat(SA.parts[k].teams.slice().sort(function (x, y) { return x.pos - y.pos; })); });
		all.forEach(function (t) {
			var tr = el('tr'), td = el('td'); td.appendChild(badge(t.id, true)); td.appendChild(document.createTextNode(' ' + short(t.id))); tr.appendChild(td);
			tr.appendChild(el('td', null, posLabel(t)));
			[t, bm[t.id]].forEach(function (x) { if (!x) { tr.appendChild(el('td')); return; } var c2 = el('td', 'np-off', ord(x.pred) + (x.d ? ' (' + x.d + ' off)' : ' ✓')); var dt = el('i', 'np-dot'); dt.style.background = N.distColor(x.d); c2.insertBefore(dt, c2.firstChild); tr.appendChild(c2); });
			tt.appendChild(tr);
		});
	}

	// ---------- share links: ?n=Name&<group key lowercase>=ids...&p=playoffs (NBA's first links used e / w: the same keys) ----------
	function shareUrl(set, onlyView) {
		var u = new URL('/' + LG.slug, location.origin), v = view();
		u.searchParams.set('n', set.name);
		Object.keys(CTX.groups).forEach(function (k) {
			if (onlyView && v.groups.indexOf(k) < 0) return;
			if (!isAZ(set.lists[k], k)) u.searchParams.set(k.toLowerCase(), N.encodeList(set.lists[k]));
		});
		if (N.poFilled(set.po) && (!onlyView || v.po)) u.searchParams.set('p', N.encodePo(LG, set.po));
		if (onlyView) u.searchParams.set('v', v.k);
		return u.toString();
	}
	function renderShare() {
		var set = cur(), only = $('np-share-only').checked;
		$('np-link').value = shareUrl(set, only);
		var parts = [];
		VIEWS.forEach(function (x) {
			if (only && x.k !== view().k) return;
			if (x.po ? N.poFilled(set.po) : x.groups.every(function (k) { return !isAZ(set.lists[k], k); })) parts.push(x.name);
		});
		$('np-share-what').textContent = parts.length ? 'The link carries: ' + parts.join(', ') + '.' : 'Nothing picked yet: the link opens the page with this name only.';
		$("np-share-only-t").textContent = ' Only this tab (' + view().name + ')';
	}
	var linked = false;
	function fromLink() {
		if (linked) return; linked = true;
		var got = {}, any = false;
		Object.keys(CTX.groups).forEach(function (k) { var d = N.decodeList(qs.get(k.toLowerCase()), CTX.groups[k]); if (d) { got[k] = d; any = true; } });
		var po = qs.get('p') ? N.decodePo(CTX, qs.get('p')) : null;
		if (po && N.poFilled(po)) any = true; else po = null;
		if (!any) { try { if (location.search) history.replaceState(null, '', location.pathname + location.hash); } catch (x) {} return; }
		var name = N.cleanName(qs.get('n')) || 'Shared picks';
		var same = S.sets.filter(function (s) { return Object.keys(got).every(function (k) { return s.lists[k] && s.lists[k].join() === got[k].join(); }) && (!po || N.encodePo(LG, s.po) === N.encodePo(LG, po)); })[0];
		if (same) { S.cur = same.id; toast('These picks are already saved here as "' + same.name + '"'); }
		else {
			var s = { id: uid(), name: uniqueName(name), lists: {}, po: po || N.emptyPo(LG) };
			Object.keys(CTX.groups).forEach(function (k) { s.lists[k] = got[k] || az(k); });
			S.sets.push(s);
			var prev = S.cur; S.cur = s.id; if (prev && prev !== s.id) S.cmp = prev;
			toast('Loaded ' + s.name + '’s picks from the link');
		}
		var first = VIEWS.filter(function (x) { return x.po ? !!po : x.groups.every(function (k) { return got[k]; }); })[0];
		if (first && !useStandings.keep) S.view = first.k;
		try { history.replaceState(null, '', location.pathname + location.hash); } catch (x) {}
	}

	// ---------- editing ----------
	function listOf(g) { return cur().lists[g]; }
	function move(g, id, delta, abs) {
		var a = listOf(g), i = a.indexOf(id); if (i < 0) return;
		var j = abs != null ? abs : Math.max(0, Math.min(a.length - 1, i + delta));
		if (j === i) return;
		a.splice(i, 1); a.splice(j, 0, id);
		render();
		var gEl = $('np-lists').querySelector('.np-list[data-g="' + g + '"] [data-id="' + id + '"] .np-grip'); if (gEl) gEl.focus({ preventScroll: abs != null });
	}
	var lists = $('np-lists'), drag = null;
	lists.addEventListener('click', function (e) {
		var b = e.target.closest('.np-mv'); if (!b) return;
		var row = b.closest('.np-row'), g = row.parentNode.dataset.g, id = row.dataset.id; move(g, id, +b.dataset.mv);
		var again = lists.querySelector('.np-list[data-g="' + g + '"] [data-id="' + id + '"] [data-mv="' + b.dataset.mv + '"]'); if (again && !again.disabled) again.focus();
	});
	lists.addEventListener('change', function (e) {
		var s = e.target.closest('.np-rank'); if (!s) return;
		var row = s.closest('.np-row'); move(row.parentNode.dataset.g, row.dataset.id, 0, +s.value - 1);
		toast(team(row.dataset.id).name + ' moved to ' + ord(+s.value));
	});
	lists.addEventListener('keydown', function (e) {
		var g = e.target.closest('.np-grip'); if (!g) return;
		var row = g.closest('.np-row'), gk = row.parentNode.dataset.g, id = row.dataset.id, k = e.key, n = listOf(gk).length;
		if (k === 'ArrowUp') move(gk, id, -1); else if (k === 'ArrowDown') move(gk, id, 1); else if (k === 'Home') move(gk, id, 0, 0); else if (k === 'End') move(gk, id, 0, n - 1); else return;
		e.preventDefault();
	});
	lists.addEventListener('pointerdown', function (e) {
		var row = e.target.closest('.np-row'); if (!row || e.button) return;
		var grip = e.target.closest('.np-grip');
		if (!grip && (e.pointerType !== 'mouse' || e.target.closest('button, select'))) return;
		e.preventDefault();
		var r = row.getBoundingClientRect(), ol = row.parentNode;
		drag = { row: row, ol: ol, id: row.dataset.id, y0: e.clientY, off: e.clientY - r.top, moved: false, pid: e.pointerId };
		try { ol.setPointerCapture(e.pointerId); } catch (x) {}
	});
	function rowsTop(ol) { var m = new Map(); Array.prototype.forEach.call(ol.children, function (r) { m.set(r, r.getBoundingClientRect().top); }); return m; }
	var scrollT = 0;
	lists.addEventListener('pointermove', function (e) {
		if (!drag || e.pointerId !== drag.pid) return;
		if (!drag.moved && Math.abs(e.clientY - drag.y0) < 5) return;
		if (!drag.moved) { drag.moved = true; drag.row.classList.add('np-dragging'); drag.ol.classList.add('np-isdrag'); if (navigator.vibrate) try { navigator.vibrate(8); } catch (x) {} }
		var row = drag.row, ol = drag.ol, y = e.clientY, before = null;
		var rows = Array.prototype.filter.call(ol.children, function (r) { return r !== row; });
		for (var i = 0; i < rows.length; i++) { var b = rows[i].getBoundingClientRect(); if (y < b.top + b.height / 2) { before = rows[i]; break; } }
		if ((before && row.nextSibling !== before) || (!before && ol.lastChild !== row)) {
			var t0 = rowsTop(ol);
			row.style.transform = '';
			ol.insertBefore(row, before);
			Array.prototype.forEach.call(ol.children, function (r) {
				if (r === row) return;
				var d = t0.get(r) - r.getBoundingClientRect().top;
				if (d) { r.style.transition = 'none'; r.style.transform = 'translateY(' + d + 'px)'; r.getBoundingClientRect(); r.style.transition = ''; r.style.transform = ''; }
			});
			Array.prototype.forEach.call(ol.children, function (r, k) { var s = r.querySelector('.np-rank'); if (s) s.value = String(k + 1); });
		}
		row.style.transform = '';
		var nat = row.getBoundingClientRect().top;
		row.style.transform = 'translateY(' + (y - drag.off - nat) + 'px)';
		// keep scrolling while the finger / pointer sits near the top or bottom of the window
		cancelAnimationFrame(scrollT);
		var edge = y < 80 ? -1 : y > window.innerHeight - 80 ? 1 : 0;
		if (edge) { var step = function () { if (!drag) return; window.scrollBy(0, edge * 10); scrollT = requestAnimationFrame(step); }; scrollT = requestAnimationFrame(step); }
	});
	function endDrag() {
		cancelAnimationFrame(scrollT);
		if (!drag) return;
		var d = drag; drag = null;
		d.ol.classList.remove('np-isdrag');
		d.row.classList.remove('np-dragging'); d.row.style.transform = '';
		if (!d.moved) return;
		var g = d.ol.dataset.g, order = Array.prototype.map.call(d.ol.children, function (r) { return r.dataset.id; });
		if (N.validList(order, CTX.groups[g])) cur().lists[g] = order;
		render();
		var gr = lists.querySelector('.np-list[data-g="' + g + '"] [data-id="' + d.id + '"] .np-grip'); if (gr) gr.focus({ preventScroll: true });
	}
	lists.addEventListener('pointerup', endDrag); lists.addEventListener('pointercancel', endDrag);
	lists.addEventListener('lostpointercapture', endDrag);

	// paste a list
	function pasteOpen(on) { $('np-paste').hidden = !on; $('np-paste-open').setAttribute('aria-expanded', String(on)); if (on) $('np-paste-t').focus(); $('np-paste-msg').textContent = ''; }
	$('np-paste-open').onclick = function () { pasteOpen($('np-paste').hidden); };
	$('np-paste-x').onclick = function () { pasteOpen(false); };
	$('np-example').onclick = function () { if (S.view !== 'E') { S.view = 'E'; render(); } pasteOpen(true); $('np-paste-t').value = EXAMPLE; $('np-paste-msg').textContent = 'An East example, as someone sent it to us. Press "Use this list".'; };
	$('np-paste-go').onclick = function () {
		var v = view(), g = v.groups.length > 1 ? $('np-paste-g').value : v.groups[0], within = CTX.groups[g], gn = N.groupMeta(CTX, g).name;
		var r = N.parseList(CTX, $('np-paste-t').value, within), msg = [];
		if (!r.ids.length) { $('np-paste-msg').textContent = 'No team names found in that text.'; return; }
		var other = r.other.map(function (id) { return team(id).name; });
		cur().lists[g] = N.completeList(r.ids, within, cur().lists[g]);
		var got = r.ids.filter(function (id) { return within.indexOf(id) >= 0; }).length, n = within.length;
		msg.push('Read ' + got + ' of ' + n + ' teams.');
		if (r.unknown.length) msg.push('Not recognised: ' + r.unknown.join(', ') + '.');
		if (r.dupes.length) msg.push('Listed twice (second one ignored): ' + r.dupes.map(function (id) { return team(id).name; }).join(', ') + '.');
		if (other.length) msg.push('Not in the ' + gn + ' (left out): ' + other.join(', ') + '.');
		if (got < n) msg.push('The ' + (n - got) + ' missing team' + (n - got > 1 ? 's were' : ' was') + ' added at the end in your previous order: drag ' + (n - got > 1 ? 'them' : 'it') + ' into place.');
		var fz = r.items.filter(function (x) { return x.fuzzy && x.id; }).map(function (x) { return '"' + x.text + '" = ' + team(x.id).name; });
		if (fz.length) msg.push('Guessed: ' + fz.join(', ') + '.');
		render();
		$('np-paste-msg').textContent = msg.join(' ');
		if (got === n && !r.unknown.length && !r.dupes.length) { pasteOpen(false); toast('Picks updated from your list'); }
	};
	$('np-fill').onclick = function () { if (!ST) return; view().groups.forEach(function (k) { cur().lists[k] = (ST.groups[k] || []).map(function (r) { return r.id; }); }); render(); toast('Copied the current standings: now change what you disagree with'); };
	$('np-az').onclick = function () { view().groups.forEach(function (k) { cur().lists[k] = az(k); }); render(); };
	$('np-fromconf').onclick = function () {
		var set = cur(), v = view(), ck = N.confKeys(CTX);
		if (v.k === 'L') {   // interleave: 1st of each conference, then 2nd ...
			var out = [], max = Math.max.apply(null, ck.map(function (k) { return set.lists[k].length; }));
			for (var i = 0; i < max; i++) ck.forEach(function (k) { if (set.lists[k][i]) out.push(set.lists[k][i]); });
			set.lists.L = out;
		} else v.groups.forEach(function (d) { var c = N.groupMeta(CTX, d).conf; set.lists[d] = set.lists[c].filter(function (id) { return CTX.groups[d].indexOf(id) >= 0; }); });
		render(); toast(v.k === 'L' ? 'Merged: 1st of each conference first, then the 2nds, and so on' : 'Each division now follows your conference order');
	};

	// sets
	function uniqueName(n) { var base = N.cleanName(n) || 'Picks', name = base, i = 2; while (S.sets.some(function (s) { return s.name === name; })) name = base + ' ' + i++; return name; }
	function blankSet(name) { var s = { id: uid(), name: name, lists: {}, po: N.emptyPo(LG) }; Object.keys(CTX.groups).forEach(function (k) { s.lists[k] = az(k); }); return s; }
	$('np-set').onchange = function () { S.cur = this.value; if (S.cmp === S.cur) S.cmp = ''; S.who = 'a'; render(); };
	$('np-cmp').onchange = function () { S.cmp = this.value; S.who = 'a'; render(); };
	$('np-new').onclick = function () { var n = prompt('Name for the new set of picks (e.g. a person):', uniqueName('Picks')); if (n == null) return; var s = blankSet(uniqueName(n)); S.sets.push(s); S.cur = s.id; render(); };
	$('np-rename').onclick = function () { var s = cur(), n = prompt('New name:', s.name); if (n == null || !N.cleanName(n)) return; s.name = N.cleanName(n) === s.name ? s.name : uniqueName(n); render(); };
	$('np-dup').onclick = function () { var s = cur(), c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.name = uniqueName(s.name + ' copy'); delete c.lb; delete c.from; delete c.lbName; S.sets.push(c); S.cur = c.id; render(); toast('Copied: change this one, the original stays as it was'); };
	$('np-del').onclick = function () {
		if (S.sets.length < 2) return;
		var s = cur(); if (!confirm('Delete "' + s.name + '"? This cannot be undone.' + (s.lb ? ' (It stays on the leaderboard unless you remove it there first.)' : ''))) return;
		S.sets = S.sets.filter(function (x) { return x.id !== s.id; }); S.cur = S.sets[0].id; if (S.cmp === s.id) S.cmp = ''; render();
	};
	$('np-export').onclick = function () {
		var blob = new Blob([JSON.stringify({ app: 'mes-picks', lg: LGID, v: 2, sets: S.sets.map(function (s) { var c = JSON.parse(JSON.stringify(s)); delete c.lb; return c; }) }, null, 1)], { type: 'application/json' });
		var a = el('a'); a.href = URL.createObjectURL(blob); a.download = LG.slug + '-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	};
	$('np-import').onclick = function () { $('np-importf').click(); };
	$('np-importf').onchange = function () {
		var f = this.files && this.files[0]; this.value = ''; if (!f) return;
		f.text().then(function (t) {
			var j = JSON.parse(t), n = 0;
			if (!j || j.app !== 'mes-picks' || j.lg !== LGID || !Array.isArray(j.sets)) throw new Error('That file is not a ' + LG.name + ' picks backup.');
			j.sets.forEach(function (s) {
				if (!s || !s.lists) return;
				var c = blankSet(uniqueName(N.cleanName(s.name) || 'Picks'));
				Object.keys(CTX.groups).forEach(function (k) { if (N.validList(s.lists[k], CTX.groups[k])) c.lists[k] = s.lists[k].slice(); });
				c.po = N.cleanPo(CTX, s.po); S.sets.push(c); n++;
			});
			render(); toast(n ? 'Restored ' + n + ' set' + (n > 1 ? 's' : '') : 'No picks found in that file');
		}).catch(function (e) { toast(e.message || 'Could not read that file'); });
	};
	$('np-tabs').onclick = function (e) { var b = e.target.closest('[data-view]'); if (!b) return; S.view = b.dataset.view; render(); };
	$('np-tabs').onkeydown = function (e) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		var i = VIEWS.map(function (v) { return v.k; }).indexOf(view().k), n = VIEWS.length;
		S.view = VIEWS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n].k; render();
		$('np-tabs').querySelector('[data-view="' + S.view + '"]').focus();
	};
	$('np-k').onclick = function (e) { var b = e.target.closest('[data-k]'); if (!b) return; S.k = b.dataset.k; render(); };
	$('np-ties').onchange = function () { S.ties = this.checked; render(); };
	$('np-ties-q').onclick = function () { var n = $('np-ties-note'); n.hidden = !n.hidden; this.setAttribute('aria-expanded', String(!n.hidden)); };
	$('np-who').onclick = function (e) { var b = e.target.closest('[data-who]'); if (!b) return; S.who = b.dataset.who; renderViz(); };
	$('np-season').onchange = function () { var y = +this.value; showStandings(y || null).then(renderLb); };
	$('np-refresh').onclick = function () { showStandings(S.season || null).then(renderLb); };
	$('np-share-only').onchange = renderShare;
	$('np-copy').onclick = function () {
		var v = $('np-link').value;
		(navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Link copied'); }, function () { $('np-link').select(); document.execCommand('copy'); toast('Link copied'); });
	};
	$('np-native').hidden = !navigator.share;
	$('np-native').onclick = function () { navigator.share({ title: cur().name + '’s ' + LG.name + ' picks', text: 'My ' + LG.name + ' predictions on MES Picks:', url: $('np-link').value }).catch(function () {}); };
	$('np-copytext').onclick = function () {
		var set = cur(), v = view(), lines = [cur().name + '’s ' + LG.name + ' picks: ' + v.long];
		if (v.po) N.poStages(LG).forEach(function (s) { lines.push(s.name + ': ' + set.po[s.k].filter(Boolean).map(short).join(', ')); });
		else v.groups.forEach(function (k) { if (v.groups.length > 1) lines.push(N.groupMeta(CTX, k).name); set.lists[k].forEach(function (id, i) { lines.push((i + 1) + '. ' + team(id).full); }); });
		lines.push($('np-link').value);
		var t = lines.join('\n');
		(navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('List copied as text'); }, function () { toast('Copy did not work in this browser'); });
	};

	// fill window / full screen for the picture, the standings table and the playoff results
	function expander(card, redraw) {
		var bar = card.querySelector('.np-xbtns'); if (!bar) return;
		var bf = el('button', 'tu-btn tu-btn--ghost', '⤢ Fill window'), bs = el('button', 'tu-btn tu-btn--ghost', '⛶ Full screen'), bx = el('button', 'tu-btn tu-btn--ghost np-only-fill', 'Close (Esc)');
		[bf, bs, bx].forEach(function (b) { b.type = 'button'; bar.appendChild(b); });
		function setFill(on) {
			Array.prototype.forEach.call(root.querySelectorAll('.np-expanded'), function (c) { if (c !== card) c.classList.remove('np-expanded'); });
			card.classList.toggle('np-expanded', on); root.classList.toggle('np-fillmode', on); document.documentElement.classList.toggle('np-noscroll', on);
			if (redraw) redraw();
		}
		bf.onclick = function () { setFill(!card.classList.contains('np-expanded')); };
		bx.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); setFill(false); };
		bs.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (card.requestFullscreen) card.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); };
		card._fill = setFill;
	}
	expander($('np-vizcard'), function () { renderViz(); });
	expander($('np-tablecard'));
	expander($('np-porescard'));
	document.addEventListener('fullscreenchange', function () {
		var fs = document.fullscreenElement;
		Array.prototype.forEach.call(root.querySelectorAll('.tu-card'), function (c) { c.classList.toggle('np-fscard', c === fs); });
		root.classList.toggle('np-fsmode', !!(fs && root.contains(fs)));
		setTimeout(function () { if (!view().po) renderViz(); }, 50);
	});
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('np-fillmode')) { var c = root.querySelector('.np-expanded'); if (c && c._fill) c._fill(false); } });
	function wide() { root.classList.toggle('np-wide', root.clientWidth >= 820); }
	wide(); if (window.ResizeObserver) new ResizeObserver(wide).observe(root);
	var rw = 0;
	if (window.ResizeObserver) new ResizeObserver(function () { var w = $('np-viz').clientWidth; if (Math.abs(w - rw) > 4 && ST && !view().po) { rw = w; renderViz(); } }).observe($('np-viz'));
	window.addEventListener('resize', function () { if ((root.classList.contains('np-fillmode') || document.fullscreenElement) && ST && !view().po) renderViz(); });

	// ---------- leaderboard ----------
	var LB = { rows: null };
	var mSel = $('np-lb-m');
	N.METRICS.forEach(function (d) { var o = el('option', null, 'Rank by: ' + d.label); o.value = d.k; mSel.appendChild(o); });
	function boards() {
		var b = [];
		N.confKeys(CTX).forEach(function (k) { b.push([k, gname(k)]); });
		if (N.confKeys(CTX).length) b.push(['all', 'Both']);
		b.push(['L', LG.confs ? 'League' : 'Table']);
		if (N.divKeys(CTX).length) b.push(['D', 'Divisions']);
		if (LG.po) b.push(['P', 'Playoffs']);
		return b;
	}
	function boardName(k) { var b = boards().filter(function (x) { return x[0] === k; })[0]; return b ? b[1] : k; }
	function renderLb() {
		if (!ST) return;
		var bs = boards(); if (!bs.some(function (x) { return x[0] === S.lbB; })) S.lbB = bs[0][0];
		var seg = $('np-lb-board'); seg.innerHTML = '';
		bs.forEach(function (x) { var b = el('button', null, x[1]); b.type = 'button'; b.dataset.b = x[0]; b.setAttribute('aria-pressed', String(x[0] === S.lbB)); seg.appendChild(b); });
		mSel.value = S.lbM; mSel.hidden = S.lbB === 'P';
		$('np-lb-season').textContent = CUR_SEASON ? N.seasonLabel(CUR_SEASON, LGID) : '';
		var tbl = $('np-lbt'), more = $('np-lb-more'); tbl.innerHTML = ''; more.textContent = '';
		if (S.season) { more.textContent = 'The leaderboard is for the ' + N.seasonLabel(CUR_SEASON, LGID) + ' season: switch the standings back to it to see the board.'; return; }
		if (LOCAL || MOCK) { more.textContent = 'The leaderboard works on mes.fm itself (this local preview has no server).'; return; }
		more.textContent = 'Loading the leaderboard…';
		getJson('/api/nba-picks?lg=' + LGID + '&board=' + S.lbB + '&m=' + S.lbM).then(function (j) {
			more.textContent = '';
			LB.rows = j.rows || [];
			if (!LB.rows.length) { more.textContent = 'No picks posted yet for ' + boardName(S.lbB) + '. Be the first!'; return; }
			var mine = S.sets.map(function (s) { return s.lb && s.lb.id; }).filter(Boolean), isP = S.lbB === 'P', d = N.metric(S.lbM);
			var h = el('tr'); (isP ? ['#', 'Name', 'Points', 'Still possible', 'Right', 'Picked', ''] : ['#', 'Name', d.short, 'Accuracy', 'Exact', 'Picked', '']).forEach(function (x) { h.appendChild(el('th', null, x)); }); tbl.appendChild(h);
			LB.rows.forEach(function (r) {
				var tr = el('tr'); if (mine.indexOf(r.id) >= 0) tr.className = 'np-me';
				tr.appendChild(el('td', 'np-r', String(r.r)));
				var nm = el('td', null, r.n); if (mine.indexOf(r.id) >= 0) nm.appendChild(el('span', 'np-you', 'you')); tr.appendChild(nm);
				if (isP) {
					tr.appendChild(el('td', 'np-sv', r.m.pts + ' / ' + r.m.max)); tr.appendChild(el('td', null, String(r.m.possible))); tr.appendChild(el('td', null, r.m.hits + '/' + r.m.picks));
					tr.appendChild(el('td', 'np-pk', r.pg ? 'after ' + r.pg + ' playoff games' : 'before the playoffs'));
				} else {
					tr.appendChild(el('td', 'np-sv', fmtMetric(r.m, S.lbM)));
					tr.appendChild(el('td', null, pct(r.share)));
					tr.appendChild(el('td', null, r.m.exact + '/' + r.m.n));
					var keys = S.lbB === 'all' ? N.confKeys(CTX) : S.lbB === 'D' ? N.divKeys(CTX) : [S.lbB];
					var gp = Math.max.apply(null, keys.map(function (k) { return (r.gp && r.gp[k]) || 0; }));
					var pk = el('td', 'np-pk', gp ? 'after ' + Math.round(gp) + ' game' + (Math.round(gp) === 1 ? '' : 's') : 'before the season'); if (gp) pk.classList.add('np-late');
					pk.title = new Date(r.t).toLocaleString(); tr.appendChild(pk);
				}
				var td = el('td'), b = el('button', 'np-link', 'Compare'); b.type = 'button'; b.dataset.lb = r.id; td.appendChild(b); tr.appendChild(td);
				tbl.appendChild(tr);
			});
			if (j.total > LB.rows.length) more.textContent = 'Top ' + LB.rows.length + ' of ' + j.total + ' shown.';
		}).catch(function () { more.textContent = 'The leaderboard could not be loaded right now.'; });
	}
	$('np-lb-board').onclick = function (e) { var b = e.target.closest('[data-b]'); if (!b) return; S.lbB = b.dataset.b; save(); renderLb(); };
	mSel.onchange = function () { S.lbM = this.value; save(); renderLb(); };
	$('np-lbt').onclick = function (e) {
		var b = e.target.closest('[data-lb]'); if (!b || !LB.rows) return;
		var r = LB.rows.filter(function (x) { return x.id === b.dataset.lb; })[0]; if (!r) return;
		var ex = S.sets.filter(function (s) { return s.from === r.id || (s.lb && s.lb.id === r.id); })[0];
		var s = ex || blankSet(uniqueName(r.n + ' (board)'));
		if (!ex) s.from = r.id;
		Object.keys(r.L || {}).forEach(function (k) { var d = CTX.groups[k] && N.decodeList(r.L[k], CTX.groups[k]); if (d) s.lists[k] = d; });
		if (r.P) s.po = N.decodePo(CTX, r.P);
		if (!ex) S.sets.push(s);
		if (s.id === S.cur) { toast('That is the set you are looking at'); return; }
		S.cmp = s.id;
		if (S.lbB === 'P') S.view = 'P'; else if (S.lbB !== 'all') S.view = S.lbB;
		render();
		$('np-compare').scrollIntoView({ behavior: 'smooth', block: 'start' });
		toast('Comparing with ' + r.n);
	};
	// what a post would include: every table that is not still A-Z (while the season is on), and the playoff picks (before the playoffs)
	function postParts(s) {
		var st = CUR_ST || ST, L = {}, names = [];
		if (!st.over) Object.keys(CTX.groups).forEach(function (k) { if (!isAZ(s.lists[k], k)) L[k] = s.lists[k]; });
		VIEWS.forEach(function (v) { if (!v.po && v.groups.every(function (k) { return L[k]; })) names.push(v.name); });
		var poOpen = !(st.po && st.po.started), P = poOpen && N.poFilled(s.po) ? s.po : undefined;
		if (P) names.push('Playoffs');
		return { L: L, P: P, names: names, poOpen: poOpen };
	}
	function renderPost() {
		var s = cur(), posted = s.lb && s.lb.season === CUR_SEASON, pp = postParts(s), st = CUR_ST || ST;
		if (document.activeElement !== $('np-lb-name')) $('np-lb-name').value = s.lbName || s.name;
		$('np-lb-post').textContent = posted ? 'Update my entry' : 'Post these picks';
		$('np-lb-del').hidden = !posted;
		$('np-post').hidden = !!S.season || !!s.from || (st.over && !pp.poOpen && !posted);
		$('np-lb-what').textContent = pp.names.length ? 'Posts: ' + pp.names.join(', ') + '.' + (st.over ? ' (Tables are closed: the regular season is over.)' : '') + (!pp.poOpen ? ' (Playoff picks are closed: the playoffs have started.)' : '')
			: 'Nothing to post yet: put at least one table in order' + (pp.poOpen && LG.po ? ' or make some playoff picks' : '') + '.';
	}
	function lbMsg(t, err) { var m = $('np-lb-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
	function post(body) {
		body.lg = LGID;
		return fetch('/api/nba-picks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
			.then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; }); });
	}
	$('np-lb-post').onclick = function () {
		if (LOCAL || MOCK) { lbMsg('Posting works on mes.fm itself (this local preview has no server).', true); return; }
		var s = cur(), name = N.cleanName($('np-lb-name').value), pp = postParts(s);
		if (!name) { lbMsg('Type a name for the board.', true); return; }
		var posted = s.lb && s.lb.season === CUR_SEASON;
		if (!posted && !Object.keys(pp.L).length && !pp.P) { lbMsg('Put at least one table in order first' + (LG.po ? ', or make some playoff picks' : '') + '.', true); return; }
		var body = { a: posted ? 'update' : 'submit', name: name, L: pp.L, season: CUR_SEASON };
		if (pp.P) body.P = pp.P;
		if (posted) { body.id = s.lb.id; body.key = s.lb.key; }
		lbMsg('Saving…');
		post(body).then(function (j) {
			if (!posted) s.lb = { id: j.id, key: j.key, season: CUR_SEASON };
			s.lbName = name; save(); renderPost();
			lbMsg(posted ? 'Your entry is updated.' : 'Posted! This browser keeps a private key so you can update or remove it later.');
			renderLb();
		}).catch(function (err) { lbMsg(err.message, true); });
	};
	$('np-lb-del').onclick = function () {
		var s = cur(); if (!s.lb || !confirm('Remove "' + (s.lbName || s.name) + '" from the leaderboard?')) return;
		post({ a: 'delete', id: s.lb.id, key: s.lb.key }).then(function () { delete s.lb; save(); renderPost(); lbMsg('Removed from the leaderboard.'); renderLb(); })
			.catch(function (err) { if (/not on this season/.test(err.message)) { delete s.lb; save(); renderPost(); } lbMsg(err.message, true); });
	};
	// a logo that will not load (blocked third-party images) switches every badge to the colour version
	var probe = new Image(); probe.onerror = function () { badge.off = true; if (ST) render(); }; probe.src = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + (LG.recType === 'soc' ? 'soccer/500/83' : LG.id + '/500/' + (LGID === 'nhl' ? 'bos' : LGID === 'nfl' ? 'kc' : LGID === 'mlb' ? 'nyy' : 'bos')) + '.png&w=16&h=16';

	showStandings(null).then(renderLb);
})();
