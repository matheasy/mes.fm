/* MES March Madness: pure logic (bracket structure, ESPN scoreboard normaliser, win-probability model, scoring, pick encoding).
   Runs in the browser (window.MESMM) and in node (require), and is copied byte-for-byte to mes.fm/api/_mm-lib.js for the
   bracket / leaderboard functions. Tests: node tool_apps_src/march-madness-tests.js

   Game numbering (67 games): 0-31 Round of 64 (game g holds leaves 2g and 2g+1), 32-47 Round of 32, 48-55 Sweet 16, 56-59 Elite 8,
   60-61 Final Four (60 = regions 0+1, 61 = regions 2+3), 62 Championship, 63-66 First Four (63 + k = T.ff[k]).
   Leaves 0-63: region r owns leaves 16r..16r+15 in bracket order of seeds SEED_ORDER (1, 16, 8, 9, 5, 12, ...).
   A pick is 0 (none), 1 (the top / first team of that game wins) or 2 (the bottom / second team wins). */
(function (root) {
	'use strict';
	var SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
	var START = [63, 0, 32, 48, 56, 60, 62, 63];    // first game of round r (r = 0 First Four, 1..6)
	var NG = 67;
	var ROUND_NAMES = ['First Four', 'Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
	var ROUND_SHORT = ['FF', 'R64', 'R32', 'S16', 'E8', 'F4', 'Final'];

	function roundOf(g) { if (g >= 63) return 0; if (g < 32) return 1; if (g < 48) return 2; if (g < 56) return 3; if (g < 60) return 4; if (g < 62) return 5; return 6; }
	function feeders(g) { var r = roundOf(g); if (r <= 1) return null; var i = g - START[r]; return [START[r - 1] + 2 * i, START[r - 1] + 2 * i + 1]; }
	function next(g) { var r = roundOf(g); if (r === 0 || r === 6) return null; var i = g - START[r]; return { g: START[r + 1] + (i >> 1), side: i & 1 }; }
	function regionOfGame(g) { var r = roundOf(g); if (r === 0 || r >= 5) return -1; var per = [0, 8, 4, 2, 1][r]; return Math.floor((g - START[r]) / per); }
	// all 67 games in an order where every game comes after the games that feed it
	var TOPO = [63, 64, 65, 66]; for (var gi = 0; gi < 63; gi++) TOPO.push(gi);
	function gamesOfRound(r) { var a = []; for (var g = START[r]; g < (r === 0 ? 67 : START[r + 1]); g++) a.push(g); return a; }

	/* ---------- the win-probability model ----------
	   First round: the historical record of each seed pairing (men 1985-2025, women 1994-2025; approximate), nudged by the two teams' season
	   win percentage. Other games: logistic on seed ratings fitted to those records and to later-round seed results, plus the same
	   win-percentage nudge. Women's favourites win more often, so their seed gaps are stretched by WOMEN_K. Everything is in logit units. */
	var HIST = {
		m: { 1: 0.9875, 2: 0.931, 3: 0.863, 4: 0.794, 5: 0.644, 6: 0.613, 7: 0.606, 8: 0.481 },
		w: { 1: 0.99, 2: 0.97, 3: 0.92, 4: 0.88, 5: 0.73, 6: 0.68, 7: 0.63, 8: 0.50 }
	};
	var SEED_R = [0, 3.60, 3.25, 2.95, 2.70, 2.50, 2.40, 2.30, 2.21, 2.17, 2.10, 2.02, 1.85, 1.40, 1.04, 0.58, 0];
	var WOMEN_K = 1.3, WP_K = 3, LIVE_W = 1;
	function logit(p) { p = Math.min(0.9999, Math.max(0.0001, p)); return Math.log(p / (1 - p)); }
	function sig(z) { return 1 / (1 + Math.exp(-z)); }
	function parseRec(s) { var m = /^(\d+)-(\d+)/.exec(String(s || '')); if (!m) return null; var w = +m[1], l = +m[2]; return w + l ? w / (w + l) : null; }
	function expWp(seed) { return 0.86 - 0.012 * (seed - 1); }
	function recAdj(t) { if (!t || !t.seed) return 0; var wp = parseRec(t.rec); return wp == null ? 0 : WP_K * (wp - expWp(t.seed)); }
	// P(team a beats team b) under the model (opts.model 'seed' = seeds only, no record nudge)
	function pModel(T, a, b, g, opts) {
		var A = T.teams[a], B = T.teams[b];
		if (!A || !B) return 0.5;
		var seedsOnly = opts && opts.model === 'seed', k = T.g === 'w' ? WOMEN_K : 1;
		var adj = seedsOnly ? 0 : recAdj(A) - recAdj(B), sa = A.seed || 8, sb = B.seed || 8;
		if (roundOf(g) === 1 && sa + sb === 17) {
			var hi = Math.min(sa, sb), base = logit((HIST[T.g] || HIST.m)[hi]);
			return sig((sa === hi ? base : -base) + adj);
		}
		return sig(k * (SEED_R[sa] - SEED_R[sb]) + adj);
	}
	// the actual game g if it is between a and b (either order)
	function actualGame(T, g, a, b) {
		var x = T.games && T.games[g];
		if (!x) return null;
		if ((x.a === a && x.b === b) || (x.a === b && x.b === a)) return x;
		return null;
	}
	// P(a beats b in game g): the real result when it is in, ESPN's live win probability while it is on, else the model
	function pGame(T, g, a, b, opts) {
		var x = actualGame(T, g, a, b);
		if (x && !(opts && opts.ignoreResults)) {
			if (x.st === 'post' && x.w) return x.w === a ? 1 : 0;
			if (x.st === 'in' && typeof x.wp === 'number') return x.a === a ? x.wp : 1 - x.wp;
		}
		return pModel(T, a, b, g, opts);
	}

	/* ---------- who is in a game ---------- */
	function leafTeam(T, leaf, winnerOf) {
		var v = T.leaves[leaf];
		if (typeof v === 'string' && v.indexOf('ff:') === 0) return winnerOf(63 + (+v.slice(3)));
		return v || null;
	}
	// entrant of game g on side s (0 / 1) when every earlier game is decided by winnerOf(g)
	function entrantBy(T, g, s, winnerOf) {
		var r = roundOf(g);
		if (r === 0) { var f = T.ff[g - 63]; return f ? (s ? f.b : f.a) : null; }
		if (r === 1) return leafTeam(T, 2 * g + s, winnerOf);
		return winnerOf(feeders(g)[s]);
	}
	function pickedWinner(T, P, g) { var s = P[g]; return s ? entrantBy(T, g, s - 1, function (x) { return pickedWinner(T, P, x); }) : null; }
	function entrant(T, P, g, s) { return entrantBy(T, g, s, function (x) { return pickedWinner(T, P, x); }); }
	function actualWinner(T, g) { var x = T.games && T.games[g]; return x && x.st === 'post' && x.w ? x.w : null; }
	function actualEntrant(T, g, s) { return entrantBy(T, g, s, function (x) { return actualWinner(T, x); }); }
	function winners(T, P) { var w = new Array(NG).fill(null); TOPO.forEach(function (g) { var s = P[g]; w[g] = s ? entrantBy(T, g, s - 1, function (x) { return w[x]; }) : null; }); return w; }
	function emptyPicks() { return new Array(NG).fill(0); }
	function hasFF(T, k) { return !!(T.ff && T.ff[k]); }
	// games that exist in this field (First Four games only when there is a First Four in that slot)
	function liveGames(T) { return TOPO.filter(function (g) { return g < 63 || hasFF(T, g - 63); }); }

	// pick `team` as the winner of game g; later picks that relied on the old winner are cleared. Returns the new picks (a copy).
	function setPick(T, P0, g, team) {
		var P = P0.slice(), before = winners(T, P);
		var s = entrant(T, P, g, 0) === team ? 1 : entrant(T, P, g, 1) === team ? 2 : 0;
		if (!s) return P;
		P[g] = s;
		// walk forward: a later pick is kept only when its winner is still the team it was
		var now = new Array(NG).fill(null);
		TOPO.forEach(function (x) {
			if (!P[x]) return;
			var w = entrantBy(T, x, P[x] - 1, function (y) { return now[y]; });
			if (x !== g && w !== before[x]) { P[x] = 0; return; }
			now[x] = w;
		});
		return P;
	}
	function clearPick(T, P0, g) {
		var P = P0.slice(), before = winners(T, P); P[g] = 0;
		var now = new Array(NG).fill(null);
		TOPO.forEach(function (x) { if (!P[x]) return; var w = entrantBy(T, x, P[x] - 1, function (y) { return now[y]; }); if (w !== before[x]) { P[x] = 0; return; } now[x] = w; });
		return P;
	}
	function complete(T, P) { var w = winners(T, P); for (var g = 0; g < 63; g++) if (!w[g]) return false; return true; }
	function countPicked(T, P) { var w = winners(T, P), n = 0; for (var g = 0; g < 63; g++) if (w[g]) n++; return n; }

	/* ---------- fill a bracket ---------- */
	function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
	// mode: 'chalk' (better seed, then model), 'model' (the favourite of each game), 'random' (draws by the model's odds), 'results' (real winners where known)
	function autoFill(T, P0, mode, opts) {
		var P = (P0 || emptyPicks()).slice(), r = rng((opts && opts.seed) || 1), keep = !(opts && opts.overwrite);
		var games = liveGames(T);
		games.forEach(function (g) {
			if (keep && P[g] && pickedWinner(T, P, g)) return;
			var a = entrant(T, P, g, 0), b = entrant(T, P, g, 1);
			if (!a || !b) { P[g] = 0; return; }
			var aw;
			if (mode === 'results') { var w = actualWinner(T, g); if (!w || (w !== a && w !== b)) { P[g] = 0; return; } aw = w === a; }
			else if (mode === 'chalk') { var A = T.teams[a].seed || 99, B = T.teams[b].seed || 99; aw = A !== B ? A < B : pModel(T, a, b, g, opts) >= 0.5; }
			else if (mode === 'random') aw = r() < pModel(T, a, b, g, opts);
			else aw = pModel(T, a, b, g, opts) >= 0.5;
			P[g] = aw ? 1 : 2;
		});
		return P;
	}

	/* ---------- chances ---------- */
	// prob[g] = { team: P(team wins game g) } taking real results and live odds into account (opts.ignoreResults = model only)
	function advance(T, opts) {
		var prob = new Array(NG).fill(null);
		function side(g, s) {
			var r = roundOf(g);
			if (r === 0) { var f = T.ff[g - 63], o = {}; if (f) o[s ? f.b : f.a] = 1; return o; }
			if (r === 1) {
				var v = T.leaves[2 * g + s];
				if (typeof v === 'string' && v.indexOf('ff:') === 0) return prob[63 + (+v.slice(3))] || {};
				var o2 = {}; if (v) o2[v] = 1; return o2;
			}
			return prob[feeders(g)[s]] || {};
		}
		liveGames(T).forEach(function (g) {
			var A = side(g, 0), B = side(g, 1), out = {};
			Object.keys(A).forEach(function (a) { Object.keys(B).forEach(function (b) {
				var pab = A[a] * B[b]; if (!pab) return;
				var p = pGame(T, g, a, b, opts);
				out[a] = (out[a] || 0) + pab * p; out[b] = (out[b] || 0) + pab * (1 - p);
			}); });
			prob[g] = out;
		});
		return prob;
	}
	// per pick: chance it comes true; plus the chance that the whole bracket (every pick made) comes true
	function chances(T, P, opts) {
		var prob = advance(T, opts), w = winners(T, P), per = new Array(NG).fill(null), logAll = 0, logFav = 0, n = 0, upsets = 0;
		liveGames(T).forEach(function (g) {
			if (!w[g]) return;
			per[g] = (prob[g] && prob[g][w[g]]) || 0;
			var a = entrant(T, P, g, 0), b = entrant(T, P, g, 1);
			if (a && b) {
				var lose = w[g] === a ? b : a, p = pGame(T, g, w[g], lose, opts);
				logAll += Math.log(Math.max(p, 1e-300)); logFav += Math.log(Math.max(p, 1 - p, 1e-300)); n++;
				var sw = T.teams[w[g]].seed, sl = T.teams[lose].seed;
				if (g < 63 && sw > sl) upsets++;
			}
		});
		// chalk 100 = every pick is the favourite of its matchup; lower = bolder (log-odds of the favourites over the log-odds of your picks)
		var chalk = n ? (logAll === 0 ? 100 : Math.max(0, Math.min(100, Math.round(100 * logFav / logAll)))) : null;
		return { per: per, prob: prob, logAll: logAll, all: Math.exp(logAll), picked: n, upsets: upsets, chalk: chalk, logFav: logFav };
	}
	// "1 in 4.2 billion"
	function oneIn(logP) {
		if (logP >= -1e-12) return '1 in 1';
		var x = -logP / Math.LN10, v = Math.pow(10, x);
		if (x < 3) return '1 in ' + (v < 10 ? (Math.round(v * 10) / 10) : Math.round(v)).toLocaleString('en-US');
		var names = [[3, 'thousand'], [6, 'million'], [9, 'billion'], [12, 'trillion'], [15, 'quadrillion'], [18, 'quintillion']];
		for (var i = names.length - 1; i >= 0; i--) if (x >= names[i][0] && x < names[i][0] + 3) { var m = Math.pow(10, x - names[i][0]); return '1 in ' + (m < 10 ? m.toFixed(1) : Math.round(m)) + ' ' + names[i][1]; }
		var e = Math.floor(x); return '1 in ' + Math.pow(10, x - e).toFixed(1) + ' × 10^' + e;
	}
	function pct(p) { if (p == null) return ''; if (p >= 0.995 && p < 1) return '>99%'; if (p > 0 && p < 0.005) return '<1%'; return Math.round(p * 100) + '%'; }

	/* ---------- scoring ---------- */
	var SYSTEMS = {
		espn: { name: 'ESPN: 10-20-40-80-160-320', pts: [0, 10, 20, 40, 80, 160, 320] },
		simple: { name: 'Doubling: 1-2-4-8-16-32', pts: [0, 1, 2, 4, 8, 16, 32] },
		seed: { name: 'Upset bonus: ESPN + winner’s seed', pts: [0, 10, 20, 40, 80, 160, 320], seed: true }
	};
	// team -> the game it lost (its round tells when it went out)
	function lostIn(T) { var out = {}; Object.keys(T.games || {}).forEach(function (g) { var x = T.games[g]; if (x.st === 'post' && x.w) { var l = x.w === x.a ? x.b : x.a; if (l) out[l] = +g; } }); return out; }
	function eliminated(T) { var out = {}; Object.keys(T.games || {}).forEach(function (g) { var x = T.games[g]; if (x.st === 'post' && x.w) { var l = x.w === x.a ? x.b : x.a; if (l) out[l] = true; } }); return out; }
	function score(T, P, sys) {
		var S = SYSTEMS[sys] || SYSTEMS.espn, w = winners(T, P), dead = eliminated(T);
		var res = { pts: 0, max: 0, correct: 0, wrong: 0, decided: 0, byRound: [0, 0, 0, 0, 0, 0, 0], rightRound: [0, 0, 0, 0, 0, 0, 0], champ: w[62] };
		for (var g = 0; g < 63; g++) {
			var r = roundOf(g), pick = w[g];
			if (!pick) continue;
			var val = S.pts[r] + (S.seed ? (T.teams[pick].seed || 0) : 0), aw = actualWinner(T, g);
			if (aw) {
				res.decided++;
				if (aw === pick) { res.pts += val; res.max += val; res.correct++; res.byRound[r] += val; res.rightRound[r]++; }
				else res.wrong++;
			} else if (!dead[pick]) res.max += val;
		}
		return res;
	}
	function maxPoints(sys) { var S = SYSTEMS[sys] || SYSTEMS.espn, t = 0; for (var r = 1; r <= 6; r++) t += S.pts[r] * [0, 32, 16, 8, 4, 2, 1][r]; return t; }

	/* ---------- share / storage encoding: 2 bits per game, base64url, "1" version prefix ---------- */
	var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
	function encodePicks(P) {
		var bits = [], out = '1';
		for (var g = 0; g < NG; g++) { var v = P[g] | 0; bits.push((v >> 1) & 1, v & 1); }
		while (bits.length % 6) bits.push(0);
		for (var i = 0; i < bits.length; i += 6) { var n = 0; for (var j = 0; j < 6; j++) n = n * 2 + bits[i + j]; out += B64[n]; }
		return out.replace(/A+$/, '');
	}
	function decodePicks(s) {
		s = String(s || '');
		if (s[0] !== '1' || s.length > 24 || /[^A-Za-z0-9\-_]/.test(s.slice(1))) return null;
		var bits = [];
		for (var i = 1; i < 24; i++) { var n = i < s.length ? B64.indexOf(s[i]) : 0; for (var j = 5; j >= 0; j--) bits.push((n >> j) & 1); }
		var P = [];
		for (var g = 0; g < NG; g++) { var v = bits[2 * g] * 2 + bits[2 * g + 1]; if (v === 3) return null; P.push(v); }
		return P;
	}
	// a decoded bracket must not name a side that has no team (keeps the server honest about what it stores)
	function cleanPicks(T, P) { if (!P || P.length !== NG) return null; var Q = emptyPicks(); TOPO.forEach(function (g) { if (!P[g]) return; if (g >= 63 && !hasFF(T, g - 63)) return; var t = entrant(T, Q, g, P[g] - 1); if (t) Q[g] = P[g]; }); return Q; }

	/* ---------- ESPN scoreboard -> tournament ---------- */
	function selectionSunday(y) {   // the Sunday 20 days before the first Saturday of April (the Final Four)
		var d = new Date(Date.UTC(y, 3, 1)); while (d.getUTCDay() !== 6) d = new Date(d.getTime() + 86400000);
		return new Date(d.getTime() - 20 * 86400000).toISOString().slice(0, 10);
	}
	function windowDays(y) { var s = Date.parse(selectionSunday(y) + 'T00:00:00Z'), out = []; for (var i = 1; i <= 24; i++) out.push(new Date(s + i * 86400000).toISOString().slice(0, 10).replace(/-/g, '')); return out; }
	function roundFromNote(h) {
		var t = String(h || '').toLowerCase();
		if (!/championship/.test(t) || !/ncaa|basketball/.test(t) || /invitation|\bnit\b|\bcbi\b/.test(t)) return null;
		var last = t.split(' - ').pop();
		if (/first four|opening round/.test(last)) return 0;
		if (/1st round|first round/.test(last)) return 1;
		if (/2nd round|second round/.test(last)) return 2;
		if (/sweet 16|sweet sixteen|regional semifinal/.test(last)) return 3;
		if (/elite 8|elite eight|regional final/.test(last)) return 4;
		if (/final four|national semifinal/.test(last)) return 5;
		if (/national championship|^championship/.test(last)) return 6;
		return null;
	}
	function regionFromNote(h) {
		var parts = String(h || '').split(' - ');
		if (parts.length < 3) return null;
		var r = parts[1].trim().replace(/ Region$/i, '');
		var m = /^Regional (\d+) in (.+)$/i.exec(r);
		return m ? m[2] + ' ' + m[1] : r;
	}
	function teamFromComp(c) {
		var t = c.team || {};
		var rank = c.curatedRank && c.curatedRank.current, seed = c.seed != null ? +c.seed : (rank && rank < 99 ? +rank : null);
		var rec = (c.records || []).filter(function (x) { return x && (x.type === 'total' || x.name === 'overall' || !x.type); })[0] || (c.records || [])[0];
		return { id: String(t.id || ''), ab: t.abbreviation || '', n: t.shortDisplayName || t.location || t.displayName || '', f: t.displayName || '', seed: seed,
			rec: rec ? rec.summary : '', c: t.color ? '#' + String(t.color).toLowerCase() : '', logo: t.logo || '' };
	}
	// events: ESPN scoreboard events (any days, duplicates fine). gender 'm' | 'w'. pairing: optional [regionA, regionB] that meet in the first semifinal.
	function normEspn(events, gender, year, pairing) {
		var seen = {}, games = [];
		(events || []).forEach(function (e) {
			if (!e || seen[e.id]) return;
			var c = (e.competitions || [])[0]; if (!c) return;
			var h = (c.notes || []).map(function (n) { return n.headline || ''; }).join(' ');
			var r = roundFromNote(h); if (r == null) return;
			seen[e.id] = 1;
			var cs = (c.competitors || []).slice().sort(function (x, y) { return (x.order || 0) - (y.order || 0); });
			var st = (c.status || e.status || {}).type || {};
			var home = cs.filter(function (x) { return x.homeAway === 'home'; })[0];
			games.push({ id: String(e.id), r: r, region: regionFromNote(h), date: e.date || c.date, st: st.state || 'pre', detail: st.shortDetail || st.detail || '',
				teams: cs.map(function (x) { var t = teamFromComp(x); return t.id && t.id !== '-1' && t.n && !/^tbd$/i.test(t.n) ? { t: t, score: x.score != null ? String(x.score) : '', win: !!x.winner, home: x === home } : null; }) });
		});
		var T = { v: 1, g: gender, year: year, regions: [], teams: {}, leaves: new Array(64).fill(null), ff: [], games: {}, lock: null, status: 'pending', pairing: 'unknown', generated: new Date().toISOString() };
		var r1 = games.filter(function (x) { return x.r === 1; });
		if (r1.length < 32) return T;
		// regions, in the order the semifinal pairing gives, else first appearance
		var regs = [];
		r1.forEach(function (x) { if (x.region && regs.indexOf(x.region) < 0) regs.push(x.region); });
		if (regs.length !== 4) return T;
		var region = {};   // team id -> region
		r1.forEach(function (x) { x.teams.forEach(function (s) { if (s) region[s.t.id] = x.region; }); });
		var sf = games.filter(function (x) { return x.r === 5 && x.teams[0] && x.teams[1]; });
		var ff0 = games.filter(function (x) { return x.r === 0; });
		ff0.forEach(function (x) { x.teams.forEach(function (s) { if (s && !region[s.t.id] && x.region) region[s.t.id] = x.region; }); });
		var pair = null;
		if (pairing && pairing.length === 2 && regs.indexOf(pairing[0]) >= 0 && regs.indexOf(pairing[1]) >= 0) { pair = pairing; T.pairing = 'set'; }
		else if (sf.length) {
			// a semifinal pairs the regions of its two teams (an E8 winner's region, found through any earlier game it played)
			var ra = region[sf[0].teams[0].t.id], rb = region[sf[0].teams[1].t.id];
			if (ra && rb && ra !== rb) { pair = [ra, rb]; T.pairing = 'espn'; }
		}
		if (pair) { var rest = regs.filter(function (x) { return pair.indexOf(x) < 0; }); regs = [pair[0], pair[1]].concat(rest); }
		T.regions = regs;
		var gid = {};   // espn id -> our game number
		// Round of 64: place each game by its better seed
		var SLOT = { 1: 0, 8: 1, 5: 2, 4: 3, 6: 4, 3: 5, 7: 6, 2: 7 };
		r1.forEach(function (x) {
			var ri = regs.indexOf(x.region), known = x.teams.filter(Boolean);
			var seeds = known.map(function (s) { return s.t.seed; }).filter(function (s) { return s; });
			var hi = seeds.length ? Math.min.apply(null, seeds) : null;
			if (hi && hi > 8) hi = 17 - hi;
			if (ri < 0 || !hi || SLOT[hi] == null) return;
			var g = ri * 8 + SLOT[hi];
			gid[x.id] = g;
			known.forEach(function (s) { var t = s.t; T.teams[t.id] = t; var leaf = 2 * g + (t.seed === hi ? 0 : 1); T.leaves[leaf] = t.id; });
		});
		// First Four: two teams with the same seed in one region; their winner fills the empty leaf of that seed (or the leaf the winner already holds)
		ff0.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id); });
		ff0.forEach(function (x) {
			var ts = x.teams.filter(Boolean); if (ts.length < 2) return;
			var seed = ts[0].t.seed || ts[1].t.seed, ri = regs.indexOf(x.region || region[ts[0].t.id] || region[ts[1].t.id]);
			var leaf = -1;
			for (var L = 0; L < 64 && leaf < 0; L++) if (T.leaves[L] && (T.leaves[L] === ts[0].t.id || T.leaves[L] === ts[1].t.id)) leaf = L;
			if (leaf < 0 && ri >= 0) for (var L2 = ri * 16; L2 < ri * 16 + 16; L2++) if (!T.leaves[L2] && SEED_ORDER[L2 % 16] === seed) { leaf = L2; break; }
			if (leaf < 0) return;
			var k = T.ff.length;
			T.ff.push({ a: ts[0].t.id, b: ts[1].t.id, leaf: leaf });
			ts.forEach(function (s) { T.teams[s.t.id] = Object.assign({}, T.teams[s.t.id] || {}, s.t, { seed: s.t.seed || seed }); });
			T.leaves[leaf] = 'ff:' + k;
			gid[x.id] = 63 + k;
		});
		// later rounds: find the game whose two feeders produced these teams
		function holder(id, r) {   // which game of round r this team is (or would be) in, from its leaf
			for (var L = 0; L < 64; L++) {
				var v = T.leaves[L], hit = v === id || (typeof v === 'string' && v.indexOf('ff:') === 0 && (T.ff[+v.slice(3)].a === id || T.ff[+v.slice(3)].b === id));
				if (hit) { var g = L >> 1; for (var k = 1; k < r; k++) g = next(g).g; return g; }
			}
			return -1;
		}
		games.filter(function (x) { return x.r >= 2; }).forEach(function (x) {
			var ts = x.teams.filter(Boolean); if (!ts.length) return;
			var g = holder(ts[0].t.id, x.r); if (g >= 0) gid[x.id] = g;
		});
		var first = null;
		games.forEach(function (x) {
			var g = gid[x.id]; if (g == null) return;
			if (x.r === 1 && (!first || x.date < first)) first = x.date;
			var a = g >= 63 ? T.ff[g - 63].a : null, b = g >= 63 ? T.ff[g - 63].b : null;
			var ts = x.teams.filter(Boolean);
			var o = { id: x.id, st: x.st, d: x.date, detail: x.detail, a: null, b: null, sa: '', sb: '', w: null };
			ts.forEach(function (s) {
				var t = s.t; if (!T.teams[t.id]) T.teams[t.id] = t;
				var side = g >= 63 ? (t.id === a ? 0 : 1) : (holderSide(g, t.id));
				if (side === 0) { o.a = t.id; o.sa = s.score; } else { o.b = t.id; o.sb = s.score; }
				if (s.win && x.st === 'post') o.w = t.id;
				if (s.home) o.home = t.id;
			});
			T.games[g] = o;
		});
		function holderSide(g, id) {   // side 0 / 1 of game g that this team comes from
			var r = roundOf(g);
			if (r === 1) { var v0 = T.leaves[2 * g]; if (v0 === id) return 0; if (typeof v0 === 'string' && v0.indexOf('ff:') === 0 && (T.ff[+v0.slice(3)].a === id || T.ff[+v0.slice(3)].b === id)) return 0; return 1; }
			var f = feeders(g); return holder(id, r - 1) === f[0] ? 0 : 1;
		}
		T.lock = first;
		var all = Object.keys(T.games).map(function (k) { return T.games[k]; });
		var fin = T.games[62];
		T.status = fin && fin.st === 'post' ? 'final' : all.some(function (x) { return x.st !== 'pre'; }) ? 'live' : 'upcoming';
		return T;
	}
	function okTournament(T) { if (!T || !T.leaves || T.leaves.length !== 64 || !T.regions || T.regions.length !== 4) return false; for (var i = 0; i < 64; i++) if (!T.leaves[i]) return false; return true; }
	// set ESPN's live win probability (home team's share) on an in-progress game
	function setLive(T, g, homeWin) { var x = T.games[g]; if (!x || x.st !== 'in' || typeof homeWin !== 'number' || !x.home) return; x.wp = Math.round((x.home === x.a ? homeWin : 1 - homeWin) * 1000) / 1000; }

	function cleanName(s) { var n = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return /^[\p{L}\p{N} _.'\-]{1,24}$/u.test(n) ? n : null; }
	function textOn(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#ffffff'; var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111111' : '#ffffff'; }

	var api = { SEED_ORDER: SEED_ORDER, START: START, NG: NG, ROUND_NAMES: ROUND_NAMES, ROUND_SHORT: ROUND_SHORT, TOPO: TOPO, HIST: HIST, SEED_R: SEED_R, WOMEN_K: WOMEN_K, WP_K: WP_K, SYSTEMS: SYSTEMS,
		roundOf: roundOf, feeders: feeders, next: next, regionOfGame: regionOfGame, gamesOfRound: gamesOfRound, liveGames: liveGames, hasFF: hasFF,
		logit: logit, sig: sig, parseRec: parseRec, expWp: expWp, recAdj: recAdj, pModel: pModel, pGame: pGame, actualGame: actualGame,
		entrant: entrant, pickedWinner: pickedWinner, actualWinner: actualWinner, actualEntrant: actualEntrant, winners: winners, emptyPicks: emptyPicks,
		setPick: setPick, clearPick: clearPick, complete: complete, countPicked: countPicked, autoFill: autoFill, rng: rng,
		advance: advance, chances: chances, oneIn: oneIn, pct: pct, eliminated: eliminated, lostIn: lostIn, score: score, maxPoints: maxPoints,
		encodePicks: encodePicks, decodePicks: decodePicks, cleanPicks: cleanPicks,
		selectionSunday: selectionSunday, windowDays: windowDays, roundFromNote: roundFromNote, regionFromNote: regionFromNote, normEspn: normEspn, okTournament: okTournament, setLive: setLive,
		cleanName: cleanName, textOn: textOn };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.MESMM = api;
})(typeof window !== 'undefined' ? window : this);

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
