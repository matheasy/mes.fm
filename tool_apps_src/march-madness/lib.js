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
