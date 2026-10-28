/* MES March Madness: page script (lib.js = MESMM is prepended by build_tool_apps.py).
   Data: /api/mm-bracket (ESPN, edge-cached, live win probability) for the current tournament; past tournaments and local previews read the
   snapshots in /march-madness/data/<g>-<year>.json (index.json lists them). State: localStorage mes-march-madness:v1.
   Share links ?g=&y=&b=<picks>&n=<name> (no server). Leaderboard: /api/mm-picks. */
(function () {
	'use strict';
	var M = window.MESMM, root = document.getElementById('mm');
	if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-march-madness:v1', DATA = '/march-madness/data/';
	var qs = new URLSearchParams(location.search), LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname), MOCK = qs.get('mock') === '1';
	var NOAPI = LOCAL || MOCK;
	var GNAME = { m: 'Men’s', w: 'Women’s' };

	function uid() { return Math.random().toString(36).slice(2, 10); }
	var S = { brackets: [], cur: {}, g: 'm', y: 0, view: '', zoom: 1, logos: true, model: 'mes', sys: 'espn', show: {}, lbLate: {}, round: 1, region: -1, win: false, name: '' };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && Array.isArray(saved.brackets)) S = Object.assign(S, saved); } catch (e) {}
	S.brackets = S.brackets.filter(function (b) { return b && b.id && (b.g === 'm' || b.g === 'w') && b.y && typeof b.p === 'string'; });
	if (!M.SYSTEMS[S.sys]) S.sys = 'espn';
	if (S.model !== 'seed') S.model = 'mes';
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function tkey() { return S.g + '-' + S.y; }

	var T = null, IDX = { m: [], w: [] }, CURRENT = null, PENDING = null, VIEWING = null, undo = [];
	var picks = M.emptyPicks();

	function toast(t, act) {
		var el = $('mm-toast'); el.textContent = t;
		if (act) { var b = document.createElement('button'); b.type = 'button'; b.className = 'mm-link'; b.textContent = act[0]; b.onclick = function () { act[1](); el.classList.remove('tu-toast--show'); }; el.appendChild(document.createTextNode(' ')); el.appendChild(b); }
		el.classList.add('tu-toast--show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('tu-toast--show'); }, act ? 6000 : 2600);
	}
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function opts() { return { model: S.model }; }
	function showResults() { if (!T) return false; var v = S.show[tkey()]; return v == null ? T.status !== 'final' : !!v; }

	/* ---------- brackets (saved per tournament) ---------- */
	function mine() { return S.brackets.filter(function (b) { return b.g === S.g && b.y === S.y; }); }
	function curB() {
		var list = mine(), id = S.cur[tkey()], b = null;
		for (var i = 0; i < list.length; i++) if (list[i].id === id) b = list[i];
		if (!b && list.length) b = list[0];
		if (!b) { b = { id: uid(), name: 'My bracket', g: S.g, y: S.y, p: M.encodePicks(M.emptyPicks()), c: Date.now() }; S.brackets.push(b); }
		S.cur[tkey()] = b.id;
		return b;
	}
	function loadPicks() { var b = curB(); picks = (T && M.cleanPicks(T, M.decodePicks(b.p))) || M.emptyPicks(); undo = []; }
	function storePicks() { if (VIEWING) return; var b = curB(); b.p = M.encodePicks(picks); b.t = Date.now(); save(); }

	/* ---------- data ---------- */
	function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
	function loadIndex() { return getJSON(DATA + 'index.json').then(function (j) { IDX = j; }, function () {}); }
	function loadYear(g, y) {
		var snap = (IDX[g] || []).indexOf(y) >= 0 && (IDX[g + 'status'] || {})[y] === 'final';
		if (CURRENT && CURRENT.g === g && CURRENT.year === y) return Promise.resolve(CURRENT);
		if (snap || NOAPI) return getJSON(DATA + g + '-' + y + '.json');
		return getJSON('/api/mm-bracket?g=' + g + '&y=' + y).then(function (j) { if (j.pending) throw new Error('pending'); return j; });
	}
	// "now": the API says which tournament is current, or that the next field is not out yet
	function loadNow(g) {
		if (NOAPI) { PENDING = { year: 2027, opens: M.selectionSunday(2027) }; return Promise.resolve(null); }
		return getJSON('/api/mm-bracket?g=' + g).then(function (j) {
			if (j.pending) { PENDING = j; return null; }
			PENDING = null; CURRENT = j; return j;
		}, function () { PENDING = null; return null; });
	}
	function years() {
		var ys = (IDX[S.g] || []).slice();
		if (CURRENT && CURRENT.g === S.g && ys.indexOf(CURRENT.year) < 0) ys.push(CURRENT.year);
		return ys.sort(function (a, b) { return b - a; });
	}
	function start(g, y) {
		S.g = g; status('Loading…');
		return loadNow(g).then(function () {
			var ys = years();
			if (!y) y = CURRENT && CURRENT.g === g ? CURRENT.year : ys[0];
			if (ys.indexOf(y) < 0 && ys.length) y = ys[0];
			S.y = y; save();
			return loadYear(g, y);
		}).then(function (t) {
			if (!t || !M.okTournament(t)) throw new Error('no bracket');
			T = t; VIEWING = null; loadPicks(); fillYears(); banner(); render(); loadBoard(); schedule();
			status('');
		}).catch(function () { status('Could not load the bracket. Check your connection and press Refresh.', true); });
	}
	function status(t, err) { var el = $('mm-upd'); el.textContent = err ? '' : t; var bn = $('mm-banner'); if (err) { bn.hidden = false; bn.textContent = t; bn.className = 'mm-banner err'; } }
	function fillYears() {
		var sel = $('mm-year'), ys = years();
		sel.innerHTML = ys.map(function (y) { var live = CURRENT && CURRENT.year === y && CURRENT.status !== 'final'; return '<option value="' + y + '"' + (y === S.y ? ' selected' : '') + '>' + y + (live ? ' (live)' : '') + '</option>'; }).join('');
		Array.prototype.forEach.call($('mm-tabs').querySelectorAll('[role=tab]'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-g') === S.g ? 'true' : 'false'); });
		var when = T.generated ? new Date(T.generated) : null;
		$('mm-upd').textContent = T.status === 'final' ? 'Final results' : (when ? 'Updated ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
	}
	function banner() {
		var bn = $('mm-banner'), h = '';
		if (PENDING && T && T.year < PENDING.year) {
			var d = new Date(PENDING.opens + 'T12:00:00Z'), days = Math.ceil((d - Date.now()) / 86400000);
			h = '<b>The ' + PENDING.year + ' bracket opens on Selection Sunday, ' + d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + '</b>' +
				(days > 0 ? ' (in ' + days + ' days)' : '') + '. Until then, play the ' + T.year + ' tournament: pick without looking, then switch on &ldquo;Show real results&rdquo; to see how you would have done.';
		} else if (T.status === 'upcoming') {
			h = '<b>The ' + T.year + ' field is out.</b> Fill in your bracket and post it to the leaderboard before the first tip-off' + (T.lock ? ' (' + new Date(T.lock).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ')' : '') + '.';
		} else if (T.status === 'live') h = '<b>The ' + T.year + ' tournament is on.</b> Scores and live win chances update every 30 seconds.';
		if (T && T.pairing === 'unknown') h += (h ? ' ' : '') + '<span class="mm-small">Which regions meet in the Final Four is assumed until ESPN lists the semifinals.</span>';
		bn.className = 'mm-banner'; bn.hidden = !h; bn.innerHTML = h;
	}

	/* ---------- rendering ---------- */
	var CH = null, CH0 = null;   // chances with real results (now) and before tip-off (model only)
	function compute() {
		var o = opts(), sr = showResults();
		CH0 = M.chances(T, picks, { model: S.model, ignoreResults: true });
		CH = sr ? M.chances(T, picks, o) : CH0;
	}
	function logo(id) {
		var t = T.teams[id]; if (!S.logos || !t || !t.logo) return '';
		var src = t.logo.replace(/^https:\/\/a\.espncdn\.com\/(i\/teamlogos\/[^?]+)$/, 'https://a.espncdn.com/combiner/i?img=/$1&h=56&w=56');
		return '<img class="mm-lg" src="' + esc(src) + '" alt="" loading="lazy" decoding="async" width="20" height="20">';
	}
	function teamBtn(g, s) {
		var id = M.entrant(T, picks, g, s), sr = showResults();
		if (!id) {
			var r = M.roundOf(g), hint = r === 1 ? 'First Four winner' : 'Pick the game before';
			return '<button type="button" class="mm-t is-empty" disabled><span class="mm-sd"></span><span class="mm-nm">' + hint + '</span></button>';
		}
		var t = T.teams[id], won = M.pickedWinner(T, picks, g) === id, cls = 'mm-t';
		var x = sr ? M.actualGame(T, g, M.entrant(T, picks, g, 0), M.entrant(T, picks, g, 1)) : null, aw = sr ? M.actualWinner(T, g) : null;
		var lg = sr ? M.lostIn(T)[id] : undefined, dead = lg != null && M.roundOf(lg) <= M.roundOf(g) && (lg !== g || !!aw);
		if (won) cls += ' is-pick';
		if (won && aw) cls += aw === id ? ' is-right' : ' is-wrong';
		else if (dead && won) cls += ' is-wrong';
		if (dead) cls += ' is-out';
		var p = CH.prob[g] && CH.prob[g][id];
		var score = x && x.st !== 'pre' ? (x.a === id ? x.sa : x.sb) : '';
		var other = M.entrant(T, picks, g, 1 - s), up = won && other && T.teams[other] && t.seed > T.teams[other].seed && g < 63;
		var label = t.seed + ' ' + t.n + (won ? ', your pick' : '') + (p != null ? ', ' + M.pct(p) + ' to win this game' : '');
		return '<button type="button" class="' + cls + '" data-g="' + g + '" data-t="' + esc(id) + '" aria-pressed="' + (won ? 'true' : 'false') + '" aria-label="' + esc(label) + '" title="' + esc(t.f + (t.rec ? ' (' + t.rec + ')' : '')) + '">' +
			'<span class="mm-sd">' + t.seed + '</span>' + logo(id) + '<span class="mm-nm">' + esc(t.n) + (up ? '<i class="mm-up">upset</i>' : '') + '</span>' +
			(score !== '' ? '<span class="mm-sc">' + esc(score) + '</span>' : '') + (x && x.st === 'post' ? '' : '<span class="mm-pc">' + (p != null ? M.pct(p) : '') + '</span>') + '</button>';
	}
	function gameInfo(g) {
		if (!showResults()) return '';
		var x = T.games[g]; if (!x) return '';
		if (x.st === 'in') {
			var wp = typeof x.wp === 'number' ? '<span class="mm-wpbar" title="ESPN live win probability"><i style="width:' + Math.round(x.wp * 100) + '%"></i></span>' : '';
			return '<div class="mm-gi is-live"><b>LIVE</b> ' + esc(x.detail) + wp + '</div>';
		}
		if (x.st === 'pre' && x.d) return '<div class="mm-gi">' + new Date(x.d).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</div>';
		return '';
	}
	function game(g, extra) {
		return '<div class="mm-g' + (extra ? ' ' + extra : '') + '" data-game="' + g + '">' + teamBtn(g, 0) + teamBtn(g, 1) + gameInfo(g) + '</div>';
	}
	function region(ri, mirror) {
		var cols = [1, 2, 3, 4].map(function (r) {
			var per = [0, 8, 4, 2, 1][r], st = M.START[r] + ri * per, h = '';
			for (var k = 0; k < per; k++) h += game(st + k);
			return '<div class="mm-col mm-r' + r + '"><div class="mm-colh">' + M.ROUND_SHORT[r] + '</div><div class="mm-colb">' + h + '</div></div>';
		});
		if (mirror) cols.reverse();
		return '<section class="mm-reg' + (mirror ? ' mm-reg--r' : '') + '" aria-label="' + esc(T.regions[ri]) + ' region"><h3 class="mm-regh">' + esc(T.regions[ri]) + '</h3><div class="mm-cols">' + cols.join('') + '</div></section>';
	}
	function champBox() {
		var c = M.pickedWinner(T, picks, 62);
		if (!c) return '<div class="mm-champ is-empty"><span class="mm-trophy" aria-hidden="true">&#127942;</span><span>Your champion</span></div>';
		var t = T.teams[c], p = CH.prob[62] && CH.prob[62][c];
		return '<div class="mm-champ"><span class="mm-trophy" aria-hidden="true">&#127942;</span>' + logo(c).replace('width="20" height="20"', 'width="44" height="44"') + '<b>' + esc(t.n) + '</b><span class="mm-small">' + t.seed + ' seed · ' + esc(t.rec || '') + (p != null ? ' · ' + M.pct(p) + ' to win it all' : '') + '</span></div>';
	}
	function ffStrip() {
		if (!T.ff.length) return '';
		return '<div class="mm-ffs"><div class="mm-colh">First Four</div><div class="mm-ffrow">' + T.ff.map(function (f, k) {
			var ri = Math.floor(f.leaf / 16);
			return '<div class="mm-ffi"><span class="mm-small">' + esc(T.regions[ri]) + ' · ' + T.teams[f.a].seed + ' seed</span>' + game(63 + k) + '</div>';
		}).join('') + '</div></div>';
	}
	function renderBracket() {
		return ffStrip() + '<div class="mm-br" id="mm-br">' +
			'<div class="mm-half">' + region(0) + region(1) + '</div>' +
			'<div class="mm-center"><div class="mm-colh">Final Four</div>' + game(60, 'mm-semi') + champBox() + '<div class="mm-colh">Championship</div>' + game(62, 'mm-final') + game(61, 'mm-semi') + '</div>' +
			'<div class="mm-half">' + region(2, true) + region(3, true) + '</div></div>';
	}
	function roundGames(r) { return M.gamesOfRound(r).filter(function (g) { return g < 63 || M.hasFF(T, g - 63); }); }
	function renderRounds() {
		var r = S.round, games = roundGames(r);
		if (!games.length) { r = S.round = 1; games = roundGames(1); }
		var groups = {};
		games.forEach(function (g) { var ri = r === 0 ? Math.floor(T.ff[g - 63].leaf / 16) : M.regionOfGame(g); if (S.region >= 0 && ri >= 0 && ri !== S.region && r >= 1 && r <= 4) return; (groups[ri] = groups[ri] || []).push(g); });
		var h = '';
		Object.keys(groups).sort(function (a, b) { return a - b; }).forEach(function (ri) {
			h += '<h3 class="mm-regh">' + (ri >= 0 ? esc(T.regions[ri]) : M.ROUND_NAMES[r]) + '</h3><div class="mm-list">' + groups[ri].map(function (g) { return game(g, 'mm-g--big'); }).join('') + '</div>';
		});
		if (r === 6 || r === 5) h += champBox();
		var done = games.every(function (g) { return picks[g]; });
		if (done && r < 6) h += '<div class="mm-nextr"><button type="button" class="tu-btn tu-btn--primary" data-round="' + (r + 1) + '">Next: ' + M.ROUND_NAMES[r + 1] + ' &rarr;</button></div>';
		return '<div class="mm-rounds">' + h + '</div>';
	}
	function renderRoundBar() {
		var bar = $('mm-roundbar');
		bar.hidden = S.view !== 'rounds';
		if (bar.hidden) return;
		var rs = (T.ff.length ? [0] : []).concat([1, 2, 3, 4, 5, 6]);
		var h = '<div class="mm-rtabs" role="tablist" aria-label="Round">' + rs.map(function (r) {
			var gs = roundGames(r), n = gs.filter(function (g) { return picks[g] && M.pickedWinner(T, picks, g); }).length;
			return '<button type="button" role="tab" data-round="' + r + '" aria-selected="' + (r === S.round) + '">' + M.ROUND_SHORT[r] + ' <small>' + n + '/' + gs.length + '</small></button>';
		}).join('') + '</div>';
		if (S.round >= 1 && S.round <= 4) h += '<div class="mm-rchips">' + [-1, 0, 1, 2, 3].map(function (ri) { return '<button type="button" class="mm-chip" data-region="' + ri + '" aria-pressed="' + (S.region === ri) + '">' + (ri < 0 ? 'All regions' : esc(T.regions[ri])) + '</button>'; }).join('') + '</div>';
		bar.innerHTML = h;
	}
	function renderSummary() {
		var n = M.countPicked(T, picks), c = M.pickedWinner(T, picks, 62), sr = showResults(), h = '';
		h += '<div class="mm-tile"><span class="mm-tl">Champion</span><b>' + (c ? logo(c) + esc(T.teams[c].n) : '—') + '</b></div>';
		h += '<div class="mm-tile"><span class="mm-tl">Picks made</span><b>' + n + ' / 63</b>' + (n < 63 ? '<span class="mm-small">' + (63 - n) + ' to go</span>' : '<span class="mm-small mm-ok">Complete</span>') + '</div>';
		h += '<div class="mm-tile"><span class="mm-tl">Chance every pick is right</span><b>' + (CH0.picked ? M.oneIn(CH0.logAll) : '—') + '</b><span class="mm-small">before tip-off, by the model</span></div>';
		var ch = CH0.chalk == null ? 0 : CH0.chalk;
		h += '<div class="mm-tile mm-tile--meter"><span class="mm-tl">Chalk meter</span><span class="mm-meter" role="img" aria-label="Chalk ' + ch + ' of 100"><i style="left:' + ch + '%"></i></span><span class="mm-mlab"><span>Bold</span><b>' + (CH0.picked ? ch : '—') + '</b><span>Chalk</span></span><span class="mm-small">' + CH0.upsets + ' upset' + (CH0.upsets === 1 ? '' : 's') + ' picked</span></div>';
		if (sr && T.status !== 'upcoming') {
			var sc = M.score(T, picks, S.sys);
			h += '<div class="mm-tile mm-tile--score"><span class="mm-tl">Your points (' + esc(M.SYSTEMS[S.sys].name.split(':')[0]) + ')</span><b>' + sc.pts + '</b><span class="mm-small">' + sc.correct + ' of ' + sc.decided + ' right · max ' + sc.max + ' of ' + M.maxPoints(S.sys) + '</span></div>';
			var alive = CH.logAll > -690;
			h += '<div class="mm-tile"><span class="mm-tl">Still perfect?</span><b>' + (sc.wrong ? 'Busted' : alive ? M.oneIn(CH.logAll) : 'Busted') + '</b><span class="mm-small">' + (sc.wrong ? sc.wrong + ' wrong so far' : 'chance from here') + '</span></div>';
		}
		if (VIEWING) h = '<div class="mm-viewing">Viewing <b>' + esc(VIEWING.n) + '</b>&rsquo;s bracket from the leaderboard. <button type="button" class="mm-link" id="mm-vsave">Save a copy</button> <button type="button" class="mm-link" id="mm-vback">Back to mine</button></div>' + h;
		$('mm-sum').innerHTML = h;
	}
	function renderLive() {
		var box = $('mm-live');
		if (!showResults()) { box.hidden = true; return; }
		var live = Object.keys(T.games).map(Number).filter(function (g) { return T.games[g].st === 'in'; });
		if (!live.length) { box.hidden = true; return; }
		box.hidden = false;
		box.innerHTML = '<b class="mm-liveh">Live now</b>' + live.map(function (g) {
			var x = T.games[g], A = T.teams[x.a], B = T.teams[x.b], wp = typeof x.wp === 'number' ? x.wp : null;
			var mine = M.pickedWinner(T, picks, g);
			return '<div class="mm-lv"><span>' + logo(x.a) + A.seed + ' ' + esc(A.n) + ' <b>' + esc(x.sa) + '</b></span><span class="mm-small">' + esc(x.detail) + '</span><span><b>' + esc(x.sb) + '</b> ' + B.seed + ' ' + esc(B.n) + logo(x.b) + '</span>' +
				(wp != null ? '<span class="mm-wpbar mm-wpbar--big" title="ESPN live win probability"><i style="width:' + Math.round(wp * 100) + '%"></i></span><span class="mm-small">' + esc(A.n) + ' ' + M.pct(wp) + ' · ' + esc(B.n) + ' ' + M.pct(1 - wp) + '</span>' : '') +
				(mine ? '<span class="mm-small">Your pick: ' + esc(T.teams[mine].n) + '</span>' : '') + '</div>';
		}).join('');
	}
	function render() {
		if (!T) return;
		compute();
		var sel = $('mm-set'), list = mine(), cur = curB();
		sel.innerHTML = list.map(function (b) { return '<option value="' + b.id + '"' + (b.id === cur.id ? ' selected' : '') + '>' + esc(b.name) + (b.lb ? ' ★' : '') + '</option>'; }).join('');
		$('mm-show').checked = showResults();
		$('mm-logos').checked = S.logos;
		$('mm-model').value = S.model;
		$('mm-fill-res').hidden = !showResults() || T.status === 'upcoming';
		$('mm-undo').disabled = !undo.length;
		if (!S.view) S.view = matchMedia('(max-width: 760px)').matches ? 'rounds' : 'bracket';
		Array.prototype.forEach.call(root.querySelectorAll('[data-view]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === S.view ? 'true' : 'false'); });
		$('mm-zoomg').hidden = S.view !== 'bracket';
		renderRoundBar();
		var stage = $('mm-stage');
		stage.className = 'mm-stage' + (S.logos ? '' : ' no-logos') + (showResults() ? ' show-res' : '');
		stage.style.fontSize = S.view === 'bracket' ? S.zoom + 'em' : '';
		stage.innerHTML = S.view === 'bracket' ? renderBracket() : renderRounds();
		$('mm-zv').textContent = Math.round(S.zoom * 100) + '%';
		renderSummary(); renderLive(); renderBoardHead();
	}

	/* ---------- picking ---------- */
	function pick(g, team) {
		if (VIEWING) { toast('This is someone else’s bracket. Save a copy to change it.'); return; }
		var cur = M.pickedWinner(T, picks, g);
		undo.push(picks.slice()); if (undo.length > 40) undo.shift();
		picks = cur === team ? M.clearPick(T, picks, g) : M.setPick(T, picks, g, team);
		storePicks(); render();
		var btn = $('mm-stage').querySelector('[data-g="' + g + '"][data-t="' + team + '"]'); if (btn) btn.focus({ preventScroll: true });
		if (M.complete(T, picks) && !showResults() && T.status === 'final' && cur !== team && !pick.told) {
			pick.told = true;
			toast('Bracket complete! See how you would have done?', ['Show the results', function () { S.show[tkey()] = true; save(); render(); }]);
		}
	}
	root.addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b || !root.contains(b)) return;
		if (b.classList.contains('mm-t') && b.hasAttribute('data-t')) { pick(+b.getAttribute('data-g'), b.getAttribute('data-t')); return; }
		if (b.hasAttribute('data-round')) { S.round = +b.getAttribute('data-round'); save(); render(); if (b.closest('.mm-nextr')) $('mm-wrap').scrollIntoView({ block: 'start' }); return; }
		if (b.hasAttribute('data-region')) { S.region = +b.getAttribute('data-region'); save(); render(); return; }
		if (b.hasAttribute('data-view')) { S.view = b.getAttribute('data-view'); save(); render(); return; }
		if (b.hasAttribute('data-fill')) { fill(b.getAttribute('data-fill')); return; }
		if (b.hasAttribute('data-late')) { S.lbLate[tkey()] = b.getAttribute('data-late') === '1'; save(); loadBoard(); return; }
		if (b.id === 'mm-vback') { VIEWING = null; loadPicks(); render(); return; }
		if (b.id === 'mm-vsave') { var nb = { id: uid(), name: VIEWING.n + ' (copy)', g: S.g, y: S.y, p: M.encodePicks(picks), c: Date.now() }; S.brackets.push(nb); S.cur[tkey()] = nb.id; VIEWING = null; save(); loadPicks(); render(); toast('Saved to your brackets'); return; }
		if (b.hasAttribute('data-lbview')) { viewEntry(b.getAttribute('data-lbview')); return; }
	});
	function fill(mode) {
		if (VIEWING) return;
		undo.push(picks.slice());
		var any = picks.some(function (x) { return x; });
		picks = M.autoFill(T, picks, mode, { model: S.model, seed: (Date.now() & 0xffffff) | 1 });
		storePicks(); render();
		toast((any ? 'Filled the empty games' : 'Filled every game') + ' with ' + { model: 'the favourites', chalk: 'the better seeds', random: 'a random draw by the odds', results: 'the real results' }[mode] + '.', ['Undo', doUndo]);
	}
	function doUndo() { if (!undo.length) return; picks = undo.pop(); storePicks(); render(); }
	$('mm-undo').onclick = doUndo;
	$('mm-clear').onclick = function () { if (VIEWING || !picks.some(function (x) { return x; })) return; undo.push(picks.slice()); picks = M.emptyPicks(); storePicks(); render(); toast('Cleared.', ['Undo', doUndo]); };
	$('mm-show').onchange = function () { S.show[tkey()] = this.checked; save(); render(); };
	$('mm-logos').onchange = function () { S.logos = this.checked; save(); render(); };
	$('mm-model').onchange = function () { S.model = this.value === 'seed' ? 'seed' : 'mes'; save(); render(); };
	$('mm-year').onchange = function () { start(S.g, +this.value); };
	Array.prototype.forEach.call($('mm-tabs').querySelectorAll('[role=tab]'), function (b) { b.onclick = function () { if (b.getAttribute('data-g') !== S.g) start(b.getAttribute('data-g'), 0); }; });
	$('mm-refresh').onclick = function () { CURRENT = null; start(S.g, S.y); };
	$('mm-set').onchange = function () { S.cur[tkey()] = this.value; VIEWING = null; save(); loadPicks(); render(); };
	$('mm-new').onclick = function () { var b = { id: uid(), name: 'Bracket ' + (mine().length + 1), g: S.g, y: S.y, p: M.encodePicks(M.emptyPicks()), c: Date.now() }; S.brackets.push(b); S.cur[tkey()] = b.id; VIEWING = null; save(); loadPicks(); render(); toast('New empty bracket'); };
	$('mm-rename').onclick = function () { var b = curB(), n = prompt('Name this bracket', b.name); if (n && n.trim()) { b.name = n.trim().slice(0, 40); save(); render(); } };
	$('mm-dup').onclick = function () { var b = curB(), c = { id: uid(), name: b.name + ' (copy)', g: b.g, y: b.y, p: M.encodePicks(picks), c: Date.now() }; S.brackets.push(c); S.cur[tkey()] = c.id; save(); loadPicks(); render(); toast('Copied'); };
	$('mm-del').onclick = function () {
		var b = curB(), i = S.brackets.indexOf(b); if (i < 0) return;
		S.brackets.splice(i, 1); delete S.cur[tkey()]; save(); loadPicks(); render();
		toast('Deleted “' + b.name + '”.', ['Undo', function () { S.brackets.splice(i, 0, b); S.cur[tkey()] = b.id; save(); loadPicks(); render(); }]);
	};

	/* ---------- zoom, fill window, full screen ---------- */
	function setZoom(z) { S.zoom = Math.max(0.45, Math.min(1.6, Math.round(z * 100) / 100)); save(); render(); }
	$('mm-zin').onclick = function () { setZoom(S.zoom + 0.1); };
	$('mm-zout').onclick = function () { setZoom(S.zoom - 0.1); };
	$('mm-zfit').onclick = fit;
	function fit() {
		var st = $('mm-stage'), br = $('mm-br'); if (!br) return;
		var w = st.clientWidth - 8, have = br.scrollWidth;
		if (have > 0) setZoom(S.zoom * w / have);
	}
	var wrap = $('mm-wrap');
	function setWin(on) {
		wrap.classList.toggle('mm-fill', on); document.documentElement.classList.toggle('mm-noscroll', on);
		$('mm-close').hidden = !on && !document.fullscreenElement; $('mm-win').hidden = on;
		if (on && S.view === 'bracket') setTimeout(fit, 30); else render();
	}
	$('mm-win').onclick = function () { setWin(true); };
	$('mm-close').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); setWin(false); };
	$('mm-fs').onclick = function () {
		if (document.fullscreenElement) { document.exitFullscreen(); return; }
		if (wrap.requestFullscreen) wrap.requestFullscreen().then(function () { wrap.classList.add('mm-fs'); $('mm-close').hidden = false; if (S.view === 'bracket') setTimeout(fit, 60); }, function () { setWin(true); }); else setWin(true);
	};
	document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement) { wrap.classList.remove('mm-fs'); $('mm-close').hidden = !wrap.classList.contains('mm-fill'); } });
	document.addEventListener('keydown', function (e) {
		if (e.target.closest && e.target.closest('input, textarea, select')) return;
		if (e.key === 'Escape' && wrap.classList.contains('mm-fill')) { setWin(false); return; }
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === 'w' || e.key === 'W') setWin(!wrap.classList.contains('mm-fill'));
		else if (e.key === 'f' || e.key === 'F') $('mm-fs').click();
	});

	/* ---------- share, picture, print ---------- */
	function shareUrl() { var b = curB(); return location.origin + '/march-madness?g=' + S.g + '&y=' + S.y + '&b=' + M.encodePicks(picks) + '&n=' + encodeURIComponent(VIEWING ? VIEWING.n : b.name); }
	$('mm-copylink').onclick = function () {
		var u = shareUrl();
		(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Link copied'); }, function () { prompt('Copy this link', u); });
	};
	$('mm-print').onclick = function () {
		var v = S.view; S.view = 'bracket'; render();
		document.body.classList.add('mm-printing');
		setTimeout(function () { window.print(); document.body.classList.remove('mm-printing'); S.view = v; render(); }, 60);
	};
	$('mm-png').onclick = function () {
		var c = drawPng(), name = (VIEWING ? VIEWING.n : curB().name).replace(/[^\w\- ]+/g, '').trim() || 'bracket';
		c.toBlob(function (blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'march-madness-' + S.y + '-' + S.g + '-' + name.replace(/\s+/g, '-') + '.png'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }, 'image/png');
	};
	// the whole bracket on a canvas: 11 columns (4 per side + Final Four / final in the middle), no logos (other sites' images would block the download)
	function drawPng() {
		var W = 1900, H = 1120, k = 2, c = document.createElement('canvas'); c.width = W * k; c.height = H * k;
		var x = c.getContext('2d'); x.scale(k, k);
		var sr = showResults(), dead = M.eliminated(T);
		x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
		x.fillStyle = '#1b2333'; x.font = '700 30px system-ui, sans-serif'; x.textAlign = 'center';
		x.fillText(T.year + ' ' + GNAME[S.g] + ' NCAA Tournament · ' + (VIEWING ? VIEWING.n : curB().name), W / 2, 44);
		var champ = M.pickedWinner(T, picks, 62);
		x.font = '16px system-ui, sans-serif'; x.fillStyle = '#4b5565';
		x.fillText('Champion: ' + (champ ? T.teams[champ].seed + ' ' + T.teams[champ].f : '—') + '  ·  Chance every pick is right: ' + (CH0.picked ? M.oneIn(CH0.logAll) : '—') + '  ·  Chalk ' + (CH0.chalk == null ? '—' : CH0.chalk) + '  ·  mes.fm/march-madness', W / 2, 72);
		var colW = 158, boxH = 22, top = 100, regH = (H - top - 20) / 2;
		function box(g, cx, cy, w) {
			for (var s = 0; s < 2; s++) {
				var id = M.entrant(T, picks, g, s), y = cy - boxH + s * boxH, won = id && M.pickedWinner(T, picks, g) === id, aw = sr ? M.actualWinner(T, g) : null;
				x.fillStyle = won ? (aw ? (aw === id ? '#dcfce7' : '#fee2e2') : '#fff3e0') : '#f6f7f9'; x.fillRect(cx, y, w, boxH - 1);
				x.strokeStyle = '#d5d9e0'; x.strokeRect(cx + 0.5, y + 0.5, w - 1, boxH - 2);
				if (!id) continue;
				var t = T.teams[id];
				x.fillStyle = sr && dead[id] ? '#8a919c' : '#1b2333'; x.font = (won ? '700 ' : '') + '12px system-ui, sans-serif'; x.textAlign = 'left';
				x.fillText(t.seed + '  ' + t.n, cx + 6, y + 15, w - 12);
			}
		}
		function side(ri, mirror, y0) {
			[1, 2, 3, 4].forEach(function (r, ci) {
				var per = [0, 8, 4, 2, 1][r], gap = regH / per;
				var cx = mirror ? W - 20 - (ci + 1) * colW : 20 + ci * colW;
				for (var j = 0; j < per; j++) box(M.START[r] + ri * per + j, cx, y0 + gap * (j + 0.5) + boxH / 2, colW - 10);
			});
			x.fillStyle = '#c2410c'; x.font = '700 15px system-ui, sans-serif'; x.textAlign = mirror ? 'right' : 'left';
			x.fillText(T.regions[ri], mirror ? W - 24 : 24, y0 + 4);
		}
		side(0, false, top); side(1, false, top + regH); side(2, true, top); side(3, true, top + regH);
		var mx = W / 2 - 85;
		box(60, mx, top + regH - 90, 170); box(62, mx, top + regH + 10, 170); box(61, mx, top + regH + 110, 170);
		x.fillStyle = '#4b5565'; x.font = '700 13px system-ui, sans-serif'; x.textAlign = 'center';
		x.fillText('FINAL FOUR', W / 2, top + regH - 120); x.fillText('CHAMPIONSHIP', W / 2, top + regH - 20);
		return c;
	}

	/* ---------- leaderboard ---------- */
	var LB = null;
	function lbLate() { var v = S.lbLate[tkey()]; return v == null ? T.status === 'final' : !!v; }
	function renderBoardHead() {
		if (!T) return;
		$('mm-lb-title').textContent = 'Leaderboard · ' + T.year + ' ' + GNAME[S.g];
		var sel = $('mm-sys');
		if (!sel.options.length) sel.innerHTML = Object.keys(M.SYSTEMS).map(function (k) { return '<option value="' + k + '">' + esc(M.SYSTEMS[k].name) + '</option>'; }).join('');
		sel.value = S.sys;
		Array.prototype.forEach.call(root.querySelectorAll('[data-late]'), function (b) { b.setAttribute('aria-pressed', (b.getAttribute('data-late') === '1') === lbLate() ? 'true' : 'false'); });
		var lock = T.lock ? new Date(T.lock) : null, b = curB();
		$('mm-lb-note').textContent = T.status === 'upcoming' ? 'Brackets lock at the first tip-off' + (lock ? ', ' + lock.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') + '. A bracket posted or changed after that goes to the Replay board.'
			: T.status === 'final' ? 'This tournament is over: a bracket posted now goes to the Replay board (just for fun, the results are known). The On time board has brackets posted before the first tip-off.'
			: 'The tournament has started: new or changed brackets go to the Replay board.';
		$('mm-lb-del').hidden = !b.lb;
		$('mm-lb-post').textContent = b.lb ? 'Update my posted bracket' : 'Post this bracket';
		if (!$('mm-lb-name').value) $('mm-lb-name').value = S.name || '';
	}
	$('mm-sys').onchange = function () { S.sys = this.value; save(); render(); loadBoard(); };
	function loadBoard() {
		renderBoardHead();
		var t = $('mm-lbt'), msg = $('mm-lb-msg');
		if (NOAPI) { t.innerHTML = ''; msg.textContent = 'The leaderboard works on mes.fm (not in this local preview).'; return; }
		msg.textContent = 'Loading…';
		getJSON('/api/mm-picks?g=' + S.g + '&y=' + S.y + '&s=' + S.sys + (lbLate() ? '&late=1' : '')).then(function (j) { LB = j; drawBoard(); }, function () { t.innerHTML = ''; msg.textContent = 'The leaderboard is not available right now.'; });
	}
	function drawBoard() {
		var t = $('mm-lbt'), msg = $('mm-lb-msg'), my = {};
		S.brackets.forEach(function (b) { if (b.lb && b.g === S.g && b.y === S.y) my[b.lb.id] = 1; });
		msg.textContent = LB.total ? LB.total + ' bracket' + (LB.total === 1 ? '' : 's') + (LB.total > LB.rows.length ? ' (top ' + LB.rows.length + ' shown)' : '') + '. Tap a name to see the bracket.' : 'No brackets on this board yet. Be the first!';
		if (!LB.rows.length) { t.innerHTML = ''; return; }
		t.innerHTML = '<thead><tr><th>#</th><th>Name</th><th>Champion</th><th class="n">Points</th><th class="n">Max</th><th class="n">Right</th></tr></thead><tbody>' + LB.rows.map(function (r) {
			var c = r.champ && T.teams[r.champ];
			return '<tr' + (my[r.id] ? ' class="is-me"' : '') + '><td>' + r.r + '</td><td><button type="button" class="mm-link" data-lbview="' + r.id + '">' + esc(r.n) + '</button>' + (my[r.id] ? ' <small>(you)</small>' : '') + '</td><td>' + (c ? logo(r.champ) + esc(c.n) : '') + '</td><td class="n"><b>' + r.pts + '</b></td><td class="n">' + r.max + '</td><td class="n">' + r.correct + '</td></tr>';
		}).join('') + '</tbody>';
	}
	function viewEntry(id) {
		getJSON('/api/mm-picks?g=' + S.g + '&y=' + S.y + '&id=' + id).then(function (j) {
			var P = M.cleanPicks(T, M.decodePicks(j.p)); if (!P) return;
			VIEWING = { id: id, n: j.n }; picks = P; render(); $('mm-sum').scrollIntoView({ block: 'start', behavior: 'smooth' });
		}, function () { toast('Could not load that bracket.'); });
	}
	function post(body) {
		return fetch('/api/mm-picks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
			.then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not save'); return j; }); });
	}
	$('mm-lb-post').onclick = function () {
		var msg = $('mm-lb-msg'), b = curB(), name = $('mm-lb-name').value.trim();
		if (NOAPI) { msg.textContent = 'The leaderboard works on mes.fm (not in this local preview).'; return; }
		if (VIEWING) { msg.textContent = 'Save a copy first, then post your own.'; return; }
		if (!M.complete(T, picks)) { msg.textContent = 'Fill in every game first (' + (63 - M.countPicked(T, picks)) + ' to go).'; return; }
		if (!M.cleanName(name)) { msg.textContent = 'Type a name for the board (1-24 letters, numbers, spaces, . _ \' -).'; $('mm-lb-name').focus(); return; }
		S.name = name; save();
		var p = M.encodePicks(picks);
		var req = b.lb ? post({ a: 'update', g: S.g, y: S.y, id: b.lb.id, key: b.lb.key, name: name, p: p }) : post({ a: 'submit', g: S.g, y: S.y, name: name, p: p });
		msg.textContent = 'Saving…';
		req.then(function (j) {
			if (!b.lb) b.lb = { id: j.id, key: j.key };
			save(); S.lbLate[tkey()] = !!j.late; render(); loadBoard();
			toast(j.late ? 'Posted to the Replay board' : 'Posted to the leaderboard');
		}, function (e) { msg.textContent = e.message; });
	};
	$('mm-lb-del').onclick = function () {
		var b = curB(); if (!b.lb || !confirm('Remove this bracket from the leaderboard?')) return;
		post({ a: 'delete', g: S.g, y: S.y, id: b.lb.id, key: b.lb.key }).then(function () { delete b.lb; save(); render(); loadBoard(); toast('Removed from the board'); }, function (e) { $('mm-lb-msg').textContent = e.message; });
	};

	/* ---------- live refresh ---------- */
	var timer = null;
	function schedule() {
		clearTimeout(timer);
		if (NOAPI || !T || T.status === 'final' || !CURRENT || CURRENT.year !== T.year) return;
		var live = Object.keys(T.games).some(function (k) { return T.games[k].st === 'in'; });
		timer = setTimeout(function () {
			if (document.hidden) { schedule(); return; }
			getJSON('/api/mm-bracket?g=' + S.g + '&y=' + S.y).then(function (j) {
				if (j && M.okTournament(j)) { CURRENT = j; T = j; if (!VIEWING) picks = M.cleanPicks(T, picks) || picks; fillYears(); banner(); render(); }
				schedule();
			}, schedule);
		}, live ? 30000 : 300000);
	}

	/* ---------- start ---------- */
	var linkB = qs.get('b'), linkG = qs.get('g') === 'w' ? 'w' : qs.get('g') === 'm' ? 'm' : null, linkY = +qs.get('y') || 0, linkN = qs.get('n');
	if (linkB || linkG || qs.get('y')) history.replaceState(null, '', location.pathname + (MOCK ? '?mock=1' : '') + location.hash);
	loadIndex().then(function () { return start(linkG || S.g || 'm', linkY || S.y || 0); }).then(function () {
		if (!linkB || !T) return;
		var P = M.cleanPicks(T, M.decodePicks(linkB));
		if (!P) { toast('That bracket link could not be read.'); return; }
		var enc = M.encodePicks(P), same = mine().filter(function (b) { return b.p === enc; })[0];
		if (same) { S.cur[tkey()] = same.id; }
		else { var nm = (linkN || 'Shared bracket').slice(0, 40), b = { id: uid(), name: nm, g: S.g, y: S.y, p: enc, c: Date.now() }; S.brackets.push(b); S.cur[tkey()] = b.id; toast('Added “' + nm + '” to your brackets'); }
		save(); loadPicks(); render();
	});
})();
