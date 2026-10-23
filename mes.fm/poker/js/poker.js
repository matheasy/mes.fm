/* MESPoker: pure Texas Hold'em logic for mes.fm/poker (also runs in node: tool_apps_src/poker-tests.js).
   Cards are integers 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3 (0 spades, 1 hearts, 2 diamonds, 3 clubs).
   Everything lives inside factory() so the odds calculator can rebuild the same code in a Web Worker from factory.toString(). */
(function (root) {
	"use strict";
	function factory() {
		var RANKS = "23456789TJQKA", SUITS = "shdc", SUIT_SYM = ["♠", "♥", "♦", "♣"];
		var CATS = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];
		var RANK_NAMES = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
		var RANK_PLURAL = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];

		/* ---------- lookup tables over 13-bit rank masks ---------- */
		var POP = new Uint8Array(8192), STR = new Int8Array(8192), TOP5 = new Int32Array(8192);
		(function () {
			for (var m = 0; m < 8192; m++) {
				var c = 0, v = 0, k = 0;
				for (var r = 12; r >= 0; r--) if (m & (1 << r)) { c++; if (k < 5) { v |= r << (4 * (4 - k)); k++; } }
				POP[m] = c; TOP5[m] = v;
				var st = -1;
				for (var h = 12; h >= 4; h--) { var w = 31 << (h - 4); if ((m & w) === w) { st = h; break; } }
				if (st < 0 && (m & 0x100f) === 0x100f) st = 3;      // A-2-3-4-5, the wheel (five-high)
				STR[m] = st;
			}
		})();
		function hib(x) { return 31 - Math.clz32(x); }

		/* Evaluate the best 5-card hand among n (5..7) cards. Bigger is better.
		   value = category << 20 | ranks in 4-bit nibbles (most important first). */
		function evaluate(cs, n) {
			if (n === undefined) n = cs.length;
			var s0 = 0, s1 = 0, s2 = 0, s3 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
			for (var i = 0; i < n; i++) {
				var c = cs[i], bit = 1 << (c >> 2), s = c & 3;
				if (s === 0) s0 |= bit; else if (s === 1) s1 |= bit; else if (s === 2) s2 |= bit; else s3 |= bit;
				if (b3 & bit) b4 |= bit; else if (b2 & bit) b3 |= bit; else if (b1 & bit) b2 |= bit; else b1 |= bit;
			}
			var fm = POP[s0] >= 5 ? s0 : POP[s1] >= 5 ? s1 : POP[s2] >= 5 ? s2 : POP[s3] >= 5 ? s3 : 0;
			if (fm) { var sf = STR[fm]; if (sf >= 0) return 8 << 20 | sf << 16; }
			if (b4) { var q = hib(b4); return 7 << 20 | q << 16 | (TOP5[b1 & ~(1 << q)] >> 16) << 12; }
			if (b3) {
				var t = hib(b3), o = b2 & ~(1 << t);
				if (o) return 6 << 20 | t << 16 | hib(o) << 12;
			}
			if (fm) return 5 << 20 | TOP5[fm];
			var st = STR[b1];
			if (st >= 0) return 4 << 20 | st << 16;
			if (b3) { var t3 = hib(b3); return 3 << 20 | t3 << 16 | (TOP5[b1 & ~(1 << t3)] >> 12) << 8; }
			if (b2) {
				var p1 = hib(b2), rest = b2 & ~(1 << p1);
				if (rest) { var p2 = hib(rest); return 2 << 20 | p1 << 16 | p2 << 12 | (TOP5[b1 & ~(1 << p1) & ~(1 << p2)] >> 16) << 8; }
				return 1 << 20 | p1 << 16 | (TOP5[b1 & ~(1 << p1)] >> 8) << 4;
			}
			return TOP5[b1];
		}
		function category(v) { return v >> 20; }
		function nib(v, k) { return (v >> (16 - 4 * k)) & 15; }
		function handName(v) {
			var c = v >> 20, a = nib(v, 0), b = nib(v, 1);
			switch (c) {
				case 8: return a === 12 ? "Royal flush" : "Straight flush, " + RANK_NAMES[a] + " high";
				case 7: return "Four of a kind, " + RANK_PLURAL[a];
				case 6: return "Full house, " + RANK_PLURAL[a] + " full of " + RANK_PLURAL[b];
				case 5: return "Flush, " + RANK_NAMES[a] + " high";
				case 4: return "Straight, " + RANK_NAMES[a] + " high";
				case 3: return "Three of a kind, " + RANK_PLURAL[a];
				case 2: return "Two pair, " + RANK_PLURAL[a] + " and " + RANK_PLURAL[b];
				case 1: return "Pair of " + RANK_PLURAL[a];
				default: return "High card, " + RANK_NAMES[a];
			}
		}
		/* which 5 of the cards make the value (for highlighting): tries the 21 subsets */
		function best5(cs) {
			var n = cs.length, best = -1, pick = null, h = [0, 0, 0, 0, 0];
			if (n <= 5) return { value: evaluate(cs, n), cards: cs.slice() };
			function tryDrop(a, b) {
				var k = 0;
				for (var i = 0; i < n; i++) if (i !== a && i !== b) h[k++] = cs[i];
				var v = evaluate(h, 5);
				if (v > best) { best = v; pick = h.slice(); }
			}
			if (n === 6) for (var d = 0; d < 6; d++) tryDrop(d, -1);
			else for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) tryDrop(a, b);
			return { value: best, cards: pick };
		}

		/* ---------- cards ---------- */
		function rankOf(c) { return c >> 2; }
		function suitOf(c) { return c & 3; }
		function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
		function parseCard(s) {
			s = String(s).trim();
			var m = /^(10|[2-9tjqka])([shdc♠♥♦♣])$/i.exec(s);
			if (!m) return -1;
			var r = m[1] === "10" ? 8 : RANKS.indexOf(m[1].toUpperCase());
			var su = "shdc♠♥♦♣".indexOf(m[2].toLowerCase()) % 4;
			return r * 4 + su;
		}
		function parseCards(s) {
			if (!s) return [];
			var out = [], parts = String(s).replace(/,/g, " ").match(/(10|[2-9tjqka])[shdc♠♥♦♣]/gi) || [];
			for (var i = 0; i < parts.length; i++) { var c = parseCard(parts[i]); if (c >= 0) out.push(c); }
			return out;
		}

		/* seeded random numbers (tests, reproducible deals) */
		function rng(seed) {
			var a = seed >>> 0;
			return function () {
				a = (a + 0x6D2B79F5) >>> 0;
				var t = a;
				t = Math.imul(t ^ (t >>> 15), t | 1);
				t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};
		}
		function shuffled(r) {
			r = r || Math.random;
			var d = [];
			for (var i = 0; i < 52; i++) d.push(i);
			for (var j = 51; j > 0; j--) { var k = Math.floor(r() * (j + 1)), t = d[j]; d[j] = d[k]; d[k] = t; }
			return d;
		}

		/* ---------- starting hands: 13 x 13 grid, row/col 0 = ace ---------- */
		var GRID_RANKS = "AKQJT98765432";
		function handClass(c1, c2) {      // grid index 0..168: pair on the diagonal, suited above it, offsuit below
			var r1 = 12 - (c1 >> 2), r2 = 12 - (c2 >> 2);   // 0 = ace
			if (r1 > r2) { var t = r1; r1 = r2; r2 = t; }
			if (r1 === r2) return r1 * 13 + r1;
			return ((c1 & 3) === (c2 & 3)) ? r1 * 13 + r2 : r2 * 13 + r1;
		}
		function classLabel(i) {
			var a = Math.floor(i / 13), b = i % 13;
			if (a === b) return GRID_RANKS[a] + GRID_RANKS[a];
			return a < b ? GRID_RANKS[a] + GRID_RANKS[b] + "s" : GRID_RANKS[b] + GRID_RANKS[a] + "o";
		}
		function classCombos(i) { var a = Math.floor(i / 13), b = i % 13; return a === b ? 6 : a < b ? 4 : 12; }
		/* Pre-flop equity (x 1000, ties count half) of each starting hand against ONE random hand, in grid order.
		   Generated by tool_apps_src/poker/gen-chart.js (every opponent hand x 1,000 random boards per class, ~1.2 million showdowns each;
		   standard error about 0.05%, shown rounded to 0.1%). Re-run it with `node tool_apps_src/poker/gen-chart.js` and paste the output here. */
		var CHART = [852,671,662,654,646,628,619,610,599,599,590,581,575,653,824,634,625,617,600,583,576,566,558,549,540,533,644,615,798,603,596,577,559,544,536,528,519,510,502,635,605,581,775,576,557,540,523,506,500,491,483,474,627,598,573,552,750,540,524,506,489,472,465,457,448,608,578,553,532,515,721,507,491,474,457,439,432,424,598,560,536,515,497,481,692,480,463,446,427,408,402,589,552,518,496,479,462,451,662,453,437,418,400,382,577,542,511,479,462,445,432,422,633,431,414,396,377,576,533,501,473,443,427,415,405,400,603,414,397,379,567,524,492,462,435,406,394,385,380,382,570,386,368,558,515,482,453,426,400,375,366,361,363,351,537,359,550,505,474,444,418,390,368,346,340,343,332,323,504];
		var PCT = null;   // percentile of each class (0 = best) by equity, weighted by combos
		function classPercentile(i) {
			if (!PCT) {
				PCT = new Float64Array(169);
				var order = [];
				for (var k = 0; k < 169; k++) order.push(k);
				order.sort(function (x, y) { return CHART[y] - CHART[x]; });
				var cum = 0;
				for (var j = 0; j < 169; j++) { var id = order[j], cc = classCombos(id); PCT[id] = (cum + cc / 2) / 1326; cum += cc; }
			}
			return PCT[i];
		}
		function holePercentile(h) { return classPercentile(handClass(h[0], h[1])); }

		/* ---------- equity ---------- */
		function remainingDeck(used) {
			var u = new Uint8Array(52), out = [];
			for (var i = 0; i < used.length; i++) u[used[i]] = 1;
			for (var c = 0; c < 52; c++) if (!u[c]) out.push(c);
			return out;
		}
		function choose(n, k) { if (k < 0 || k > n) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }

		/* A chunked equity job. spec = {hands: [[c,c] | null (random)], board: [...], dead: [...]}.
		   mode "exact" when every hand is known (or one is random and the total is small), else Monte Carlo.
		   job.step(n) runs up to n deals; job.result() gives per-player win / tie / equity and hand types. */
		function equityJob(spec, opts) {
			opts = opts || {};
			var hands = spec.hands, board = (spec.board || []).slice(), dead = spec.dead || [], np = hands.length;
			var r = opts.rng || Math.random;
			var used = board.concat(dead);
			var randIdx = [];
			for (var i = 0; i < np; i++) { if (hands[i]) used = used.concat(hands[i]); else randIdx.push(i); }
			var rem = remainingDeck(used), m = rem.length, k = 5 - board.length;
			var wins = new Float64Array(np), ties = new Float64Array(np), share = new Float64Array(np), cats = [];
			for (var p = 0; p < np; p++) cats.push(new Float64Array(9));
			var done = 0, total, mode;
			var limit = opts.exactLimit || 4e6;
			if (randIdx.length === 0) { total = choose(m, k); mode = "exact"; }
			else if (randIdx.length === 1 && choose(m, 2) * choose(m - 2, k) <= limit) { total = choose(m, 2) * choose(m - 2, k); mode = "exact"; }
			else { total = Infinity; mode = "mc"; }
			if (opts.forceMC) { total = Infinity; mode = "mc"; }
			var full = new Int32Array(5), h = new Int32Array(7), vals = new Int32Array(np);
			for (var b = 0; b < board.length; b++) full[b] = board[b];
			var hh = hands.map(function (x) { return x ? x.slice() : [0, 0]; });

			function score() {
				var best = -1, nb = 0;
				for (var p = 0; p < np; p++) {
					h[0] = hh[p][0]; h[1] = hh[p][1];
					h[2] = full[0]; h[3] = full[1]; h[4] = full[2]; h[5] = full[3]; h[6] = full[4];
					var v = evaluate(h, 7);
					vals[p] = v; cats[p][v >> 20]++;
					if (v > best) { best = v; nb = 1; } else if (v === best) nb++;
				}
				for (var q = 0; q < np; q++) if (vals[q] === best) {
					if (nb === 1) wins[q]++; else { ties[q]++; share[q] += 1 / nb; }
				}
				done++;
			}
			// exact iteration state
			var pool = rem, idx = null, pairs = null, pi = 0;
			function initCombo(arr) { pool = arr; idx = []; for (var i = 0; i < k; i++) idx.push(i); }
			if (mode === "exact") {
				if (randIdx.length === 1) {
					pairs = [];
					for (var a = 0; a < m; a++) for (var c = a + 1; c < m; c++) pairs.push([rem[a], rem[c]]);
					setPair();
				} else initCombo(rem);
			}
			function setPair() {
				var pr = pairs[pi];
				hh[randIdx[0]] = pr;
				initCombo(rem.filter(function (x) { return x !== pr[0] && x !== pr[1]; }));
			}
			var finished = false;
			function nextCombo() {   // advance idx; false when the combos of this pool are exhausted
				var n = pool.length, i = k - 1;
				while (i >= 0 && idx[i] === n - k + i) i--;
				if (i < 0) return false;
				idx[i]++;
				for (var j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
				return true;
			}
			var deckCopy = rem.slice();
			function step(n) {
				var stop = done + n;
				if (mode === "exact") {
					while (!finished && done < stop) {
						for (var i = 0; i < k; i++) full[board.length + i] = pool[idx[i]];
						score();
						if (k === 0 || !nextCombo()) {
							if (pairs && ++pi < pairs.length) setPair(); else finished = true;
						}
					}
				} else {
					var need = randIdx.length * 2 + k;
					while (done < stop) {
						for (var x = 0; x < need; x++) { var j2 = x + Math.floor(r() * (m - x)), t = deckCopy[x]; deckCopy[x] = deckCopy[j2]; deckCopy[j2] = t; }
						var q = 0;
						for (var ri = 0; ri < randIdx.length; ri++) { hh[randIdx[ri]] = [deckCopy[q], deckCopy[q + 1]]; q += 2; }
						for (var bb = 0; bb < k; bb++) full[board.length + bb] = deckCopy[q++];
						score();
					}
				}
				return finished;
			}
			function result() {
				var out = { mode: mode, done: done, total: total, finished: finished || false, players: [] };
				for (var p = 0; p < np; p++) {
					var eq = done ? (wins[p] + share[p]) / done : 0;
					out.players.push({ win: done ? wins[p] / done : 0, tie: done ? ties[p] / done : 0, equity: eq,
						se: mode === "mc" && done ? Math.sqrt(eq * (1 - eq) / done) : 0,
						cats: Array.prototype.map.call(cats[p], function (x) { return done ? x / done : 0; }) });
				}
				return out;
			}
			return { step: step, result: result, mode: mode, total: total, isDone: function () { return finished; } };
		}
		function equity(spec, opts) {     // run to the end (exact) or for opts.iters deals (Monte Carlo)
			var job = equityJob(spec, opts);
			if (job.mode === "exact") job.step(Infinity); else job.step((opts && opts.iters) || 20000);
			return job.result();
		}

		/* Hero's equity against opponents whose hands are drawn from ranges (fraction 0..1 of the best starting hands). Used by the computer players. */
		var COMBOS = null;     // all 1,326 two-card hands, best first (by the chart), for drawing hands from a range
		function combos() {
			if (!COMBOS) {
				COMBOS = [];
				for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) COMBOS.push([a, b, classPercentile(handClass(a, b))]);
				COMBOS.sort(function (x, y) { return x[2] - y[2]; });
			}
			return COMBOS;
		}
		function rangeEquity(hole, board, widths, iters, r) {
			r = r || Math.random;
			var known = hole.concat(board), rem = remainingDeck(known), m = rem.length, k = 5 - board.length, n = widths.length, cmb = combos();
			var h = new Int32Array(7), full = new Int32Array(5), won = 0, used = new Uint8Array(52), opp = new Int32Array(2 * n), marks = [];
			for (var y0 = 0; y0 < board.length; y0++) full[y0] = board[y0];
			for (var u = 0; u < known.length; u++) used[known[u]] = 1;
			function take(c) { used[c] = 1; marks.push(c); return c; }
			function any() { var c; do { c = rem[Math.floor(r() * m)]; } while (used[c]); return take(c); }
			for (var it = 0; it < iters; it++) {
				for (var o = 0; o < n; o++) {
					var w = widths[o], got = false;
					if (w < 0.999) {
						var cnt = Math.max(6, Math.min(1326, Math.round(w * 1326)));
						for (var tries = 0; tries < 60 && !got; tries++) {
							var cb = cmb[Math.floor(r() * cnt)];
							if (!used[cb[0]] && !used[cb[1]]) { opp[2 * o] = take(cb[0]); opp[2 * o + 1] = take(cb[1]); got = true; }
						}
					}
					if (!got) { opp[2 * o] = any(); opp[2 * o + 1] = any(); }
				}
				for (var x = 0; x < k; x++) full[board.length + x] = any();
				h[0] = hole[0]; h[1] = hole[1];
				for (var y = 0; y < 5; y++) h[2 + y] = full[y];
				var mine = evaluate(h, 7), best = 0, nb = 0;
				for (var z = 0; z < n; z++) {
					h[0] = opp[2 * z]; h[1] = opp[2 * z + 1];
					var v = evaluate(h, 7);
					if (v > best) { best = v; nb = 1; } else if (v === best) nb++;
				}
				if (mine > best) won += 1; else if (mine === best) won += 1 / (nb + 1);
				for (var q = 0; q < marks.length; q++) used[marks[q]] = 0;
				marks.length = 0;
			}
			return won / iters;
		}

		/* Outs while playing (opponents unknown): cards that lift your hand to a better category that uses your hole cards. */
		function outsImprove(hole, board) {
			if (board.length < 3 || board.length > 4) return { cards: [], groups: [] };
			var cur = evaluate(hole.concat(board)), cc = cur >> 20, rem = remainingDeck(hole.concat(board)), cards = [], g = {};
			for (var i = 0; i < rem.length; i++) {
				var c = rem[i], nb = board.concat([c]), v = evaluate(hole.concat(nb)), cat = v >> 20;
				if (cat <= cc || cat === 0) continue;
				if (cat === 1) {      // a pair counts only when it pairs a hole card above every board card (top pair)
					var pr = (v >> 16) & 15, top = 0;
					board.forEach(function (b) { top = Math.max(top, b >> 2); });
					if (pr <= top || (hole[0] >> 2 !== pr && hole[1] >> 2 !== pr)) continue;
				}
				var boardOnly = nb.length >= 5 ? evaluate(nb) >> 20 : boardCat(nb);
				if (cat <= boardOnly) continue;            // the board alone makes it: everyone has it
				cards.push(c); (g[cat] = g[cat] || []).push(c);
			}
			var groups = Object.keys(g).map(Number).sort(function (a, b) { return b - a; }).map(function (k) { return { cat: k, name: CATS[k], cards: g[k] }; });
			return { cards: cards, groups: groups };
		}
		function boardCat(cs) {   // category of 4 or fewer cards (pairs / trips / quads only)
			var cnt = {}, mx = 0, pairs = 0;
			cs.forEach(function (c) { var r = c >> 2; cnt[r] = (cnt[r] || 0) + 1; });
			Object.keys(cnt).forEach(function (k) { mx = Math.max(mx, cnt[k]); if (cnt[k] >= 2) pairs++; });
			return mx >= 4 ? 7 : mx === 3 ? (pairs >= 2 ? 6 : 3) : pairs >= 2 ? 2 : pairs ? 1 : 0;
		}
		/* Outs against known hands: cards that make player p win (or tie) on the next card when p is behind now. */
		function outsVsKnown(hands, board, dead, p) {
			if (board.length < 3 || board.length > 4) return null;
			var used = board.concat(dead || []);
			hands.forEach(function (x) { used = used.concat(x); });
			var rem = remainingDeck(used);
			function standing(bd) {
				var vs = hands.map(function (x) { return evaluate(x.concat(bd)); }), best = Math.max.apply(null, vs);
				var nb = vs.filter(function (v) { return v === best; }).length;
				return { win: vs[p] === best && nb === 1, tie: vs[p] === best && nb > 1, v: vs[p] };
			}
			var now = standing(board);
			if (now.win) return { ahead: true, win: [], tie: [] };
			var win = [], tie = [];
			rem.forEach(function (c) {
				var s = standing(board.concat([c]));
				if (s.win) win.push({ card: c, name: handName(s.v) }); else if (s.tie && !now.tie) tie.push({ card: c, name: handName(s.v) });
			});
			return { ahead: false, tied: now.tie, win: win, tie: tie, unseen: rem.length };
		}

		/* ---------- pots ---------- */
		/* contribs[i] = chips seat i put in this hand, folded[i] true when out. Returns [{amount, eligible:[seats]}] from main pot up. */
		function buildPots(contribs, folded) {
			var n = contribs.length, levels = [];
			for (var i = 0; i < n; i++) if (!folded[i] && contribs[i] > 0 && levels.indexOf(contribs[i]) < 0) levels.push(contribs[i]);
			levels.sort(function (a, b) { return a - b; });
			var pots = [], prev = 0;
			for (var l = 0; l < levels.length; l++) {
				var L = levels[l], amt = 0, el = [];
				for (var j = 0; j < n; j++) {
					amt += Math.max(0, Math.min(contribs[j], L) - Math.min(contribs[j], prev));
					if (!folded[j] && contribs[j] >= L) el.push(j);
				}
				if (amt > 0) {
					if (pots.length && sameSet(pots[pots.length - 1].eligible, el)) pots[pots.length - 1].amount += amt;
					else pots.push({ amount: amt, eligible: el });
				}
				prev = L;
			}
			var extra = 0;      // folded chips above every live player's level (can't really happen, but never lose chips)
			for (var x = 0; x < n; x++) extra += Math.max(0, contribs[x] - Math.max(prev, 0));
			if (extra && pots.length) pots[pots.length - 1].amount += extra;
			else if (extra) pots.push({ amount: extra, eligible: [] });
			return pots;
		}
		function sameSet(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
		/* split amount between winners; odd chips go one each to the winners first to the left of the button */
		function splitPot(amount, winners, button, n) {
			var order = winners.slice().sort(function (a, b) { return ((a - button - 1 + n) % n) - ((b - button - 1 + n) % n); });
			var each = Math.floor(amount / order.length), rest = amount - each * order.length, out = {};
			order.forEach(function (w, i) { out[w] = each + (i < rest ? 1 : 0); });
			return out;
		}

		/* ---------- betting state machine ---------- */
		/* opts: {stacks: [chips | 0 for empty seat], button, sb, bb, ante, deck (optional, 52 cards in deal order), rng} */
		function startHand(opts) {
			var n = opts.stacks.length, deck = (opts.deck || shuffled(opts.rng)).slice();
			var S = { n: n, button: opts.button, sb: opts.sb, bb: opts.bb, ante: opts.ante || 0, seats: [], deck: deck, board: [], street: 0,
				toAct: -1, currentBet: 0, minRaise: opts.bb, done: false, result: null, log: [], startStacks: opts.stacks.slice(), sbSeat: -1, bbSeat: -1 };
			for (var i = 0; i < n; i++) S.seats.push({ stack: opts.stacks[i], bet: 0, total: 0, folded: !(opts.stacks[i] > 0), allIn: false, inHand: opts.stacks[i] > 0, hole: [], acted: false, faced: 0 });
			var live = liveSeats(S);
			if (live.length < 2) throw new Error("need two players");
			if (!S.seats[S.button].inHand) S.button = nextSeat(S, S.button, function (s) { return s.inHand; });
			var order = [], c = S.button;
			for (var k = 0; k < live.length; k++) { c = nextSeat(S, c, function (s) { return s.inHand; }); order.push(c); }
			for (var round = 0; round < 2; round++) order.forEach(function (sx) { S.seats[sx].hole.push(S.deck.shift()); });
			if (S.ante) order.forEach(function (sx) { var p = S.seats[sx], a = Math.min(S.ante, p.stack); p.stack -= a; p.total += a; if (!p.stack) p.allIn = true; log(S, sx, "ante", a); });
			var sbS, bbS;
			if (live.length === 2) { sbS = S.button; bbS = nextSeat(S, S.button, function (s) { return s.inHand; }); }
			else { sbS = nextSeat(S, S.button, function (s) { return s.inHand; }); bbS = nextSeat(S, sbS, function (s) { return s.inHand; }); }
			S.sbSeat = sbS; S.bbSeat = bbS;
			post(S, sbS, S.sb, "small blind"); post(S, bbS, S.bb, "big blind");
			S.currentBet = S.bb; S.minRaise = S.bb;
			S.toAct = bbS;
			advance(S);
			return S;
		}
		function post(S, i, amt, what) {
			var p = S.seats[i], a = Math.min(amt, p.stack);
			if (a <= 0) return;
			p.stack -= a; p.bet += a; p.total += a;
			if (!p.stack) p.allIn = true;
			log(S, i, what, a);
		}
		function log(S, seat, type, amount, to) { S.log.push({ street: S.street, seat: seat, type: type, amount: amount || 0, to: to || 0 }); }
		function liveSeats(S) { var o = []; S.seats.forEach(function (s, i) { if (s.inHand) o.push(i); }); return o; }
		function nextSeat(S, from, ok) { for (var k = 1; k <= S.n; k++) { var i = (from + k) % S.n; if (ok(S.seats[i], i)) return i; } return -1; }
		function inPlay(S) { var o = []; S.seats.forEach(function (s, i) { if (s.inHand && !s.folded) o.push(i); }); return o; }
		function canActSeats(S) { var o = []; S.seats.forEach(function (s, i) { if (s.inHand && !s.folded && !s.allIn) o.push(i); }); return o; }
		function potTotal(S) { var t = 0; S.seats.forEach(function (s) { t += s.total; }); return t; }
		function othersAllIn(S, i) { return S.seats.every(function (s, j) { return j === i || !s.inHand || s.folded || s.allIn; }); }
		function maxOtherBet(S, i) { var m = 0; S.seats.forEach(function (s, j) { if (j !== i && s.inHand && !s.folded) m = Math.max(m, s.bet); }); return m; }
		/* the level seat i has to match: the current bet, or less when everyone else is all-in for less (no point calling more) */
		function target(S, i) { return othersAllIn(S, i) ? Math.min(S.currentBet, maxOtherBet(S, i)) : S.currentBet; }
		function needsAct(S, i) {
			var p = S.seats[i];
			if (!p.inHand || p.folded || p.allIn) return false;
			var t = target(S, i);
			if (othersAllIn(S, i) && p.bet >= t) return false;
			return !p.acted || p.bet < t;
		}
		function legal(S) {
			if (S.done || S.toAct < 0) return null;
			var i = S.toAct, p = S.seats[i], t = target(S, i), toCall = Math.max(0, t - p.bet), callAmt = Math.min(toCall, p.stack);
			var reopened = !p.acted || (S.currentBet - p.faced >= S.minRaise);
			var canRaise = p.stack > toCall && !othersAllIn(S, i) && reopened;
			var maxTo = p.bet + p.stack, minTo = S.currentBet === 0 ? S.bb : S.currentBet + S.minRaise;
			minTo = Math.min(minTo, maxTo);
			return { seat: i, toCall: toCall, callAmt: callAmt, canCheck: toCall === 0, canCall: toCall > 0, canRaise: canRaise, minTo: minTo, maxTo: maxTo,
				isBet: S.currentBet === 0, pot: potTotal(S), allInCall: callAmt === p.stack && toCall > 0 };
		}
		/* a = {type: "fold"|"check"|"call"|"raise", to: total bet this street (raise / bet)}. Throws on an illegal action. */
		function act(S, a) {
			var L = legal(S);
			if (!L) throw new Error("no action expected");
			var i = L.seat, p = S.seats[i];
			if (a.type === "fold") { p.folded = true; log(S, i, "fold"); }
			else if (a.type === "check") { if (!L.canCheck) throw new Error("cannot check"); log(S, i, "check"); }
			else if (a.type === "call") {
				if (!L.canCall) { log(S, i, "check"); }
				else { p.stack -= L.callAmt; p.bet += L.callAmt; p.total += L.callAmt; if (!p.stack) p.allIn = true; log(S, i, "call", L.callAmt, p.bet); }
			} else if (a.type === "raise" || a.type === "bet" || a.type === "allin") {
				var to = a.type === "allin" ? L.maxTo : Math.round(a.to);
				if (!L.canRaise) {   // can't raise: an all-in request becomes a call
					if (a.type === "allin" && L.canCall) return act(S, { type: "call" });
					throw new Error("cannot raise");
				}
				if (to > L.maxTo) to = L.maxTo;
				if (to < L.minTo) throw new Error("raise too small (min " + L.minTo + ")");
				var add = to - p.bet, inc = to - S.currentBet, wasBet = S.currentBet === 0;
				p.stack -= add; p.bet = to; p.total += add; if (!p.stack) p.allIn = true;
				if (inc >= S.minRaise) S.minRaise = inc;        // a full raise sets the new minimum; a short all-in does not
				S.currentBet = Math.max(S.currentBet, to);
				log(S, i, wasBet ? "bet" : "raise", add, to);
				if (p.allIn) S.log[S.log.length - 1].allIn = true;
			} else throw new Error("unknown action " + a.type);
			if (a.type === "call" && p.allIn) S.log[S.log.length - 1].allIn = true;
			p.acted = true; p.faced = S.currentBet;
			advance(S);
			return S;
		}
		function advance(S) {
			var alive = inPlay(S);
			if (alive.length === 1) return finish(S, alive);
			var nx = nextSeat(S, S.toAct, function (s, j) { return needsAct(S, j); });
			if (nx >= 0) { S.toAct = nx; return; }
			// street over
			S.seats.forEach(function (s) { s.bet = 0; s.acted = false; s.faced = 0; });
			S.currentBet = 0; S.minRaise = S.bb;
			if (S.street === 3) return finish(S, alive);
			if (canActSeats(S).length <= 1) {     // everyone (or all but one) is all-in: run the board out
				while (S.board.length < 5) dealStreet(S);
				S.street = 3;
				return finish(S, alive);
			}
			dealStreet(S);
			S.toAct = S.button;
			var first = nextSeat(S, S.button, function (s, j) { return needsAct(S, j); });
			S.toAct = first;
			if (first < 0) return advance(S);
		}
		function dealStreet(S) {
			S.deck.shift();     // burn
			var k = S.board.length === 0 ? 3 : 1;
			for (var i = 0; i < k; i++) S.board.push(S.deck.shift());
			S.street = S.board.length === 3 ? 1 : S.board.length === 4 ? 2 : 3;
			S.log.push({ street: S.street, seat: -1, type: "deal", cards: S.board.slice() });
		}
		function finish(S, alive) {
			S.toAct = -1; S.done = true;
			var contribs = S.seats.map(function (s) { return s.total; }), folded = S.seats.map(function (s) { return s.folded || !s.inHand; });
			var pots = buildPots(contribs, folded), payouts = S.seats.map(function () { return 0; }), values = {}, showdown = alive.length > 1;
			if (showdown) alive.forEach(function (i) { var b = best5(S.seats[i].hole.concat(S.board)); values[i] = b; });
			var outPots = pots.map(function (pt) {
				var el = pt.eligible, winners;
				if (el.length <= 1) winners = el.length ? el : alive.slice(0, 1);
				else { var best = -1; el.forEach(function (i) { best = Math.max(best, values[i].value); }); winners = el.filter(function (i) { return values[i].value === best; }); }
				var shares = splitPot(pt.amount, winners, S.button, S.n);
				Object.keys(shares).forEach(function (w) { payouts[w] += shares[w]; });
				return { amount: pt.amount, eligible: el, winners: winners, shares: shares, returned: el.length === 1 && showdown, value: winners.length && values[winners[0]] ? values[winners[0]].value : 0 };
			});
			S.seats.forEach(function (s, i) { s.stack += payouts[i]; });
			S.street = showdown ? 4 : S.street;
			S.result = { showdown: showdown, pots: outPots, payouts: payouts, values: values, alive: alive };
		}
		function positionName(S, i) {
			var live = liveSeats(S), n = live.length, k = (live.indexOf(i) - live.indexOf(S.button) + n) % n;
			if (n === 2) return k === 0 ? "BTN" : "BB";
			var names = { 3: ["BTN", "SB", "BB"], 4: ["BTN", "SB", "BB", "UTG"], 5: ["BTN", "SB", "BB", "UTG", "CO"], 6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
				7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"], 8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"], 9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO"] };
			return names[n][k];
		}

		/* ---------- computer players ---------- */
		var STYLES = {
			tag: { name: "Tight-aggressive", short: "Tight", open: 0.17, raise: 0.08, aggr: 0.75, bluff: 0.10, margin: 0.05 },
			lag: { name: "Loose-aggressive", short: "Wild", open: 0.36, raise: 0.18, aggr: 0.85, bluff: 0.22, margin: 0.00 },
			lp: { name: "Loose-passive", short: "Caller", open: 0.42, raise: 0.05, aggr: 0.25, bluff: 0.04, margin: -0.04 },
			tp: { name: "Tight-passive", short: "Careful", open: 0.15, raise: 0.05, aggr: 0.35, bluff: 0.03, margin: 0.06 }
		};
		/* how wide each opponent's range probably is, from what they did this hand */
		function guessWidth(S, seat) {
			var w = 1, preRaises = 0, preCalls = 0, post = 0;
			S.log.forEach(function (e) {
				if (e.seat !== seat) return;
				if (e.street === 0) { if (e.type === "raise" || e.type === "bet") preRaises++; else if (e.type === "call") preCalls++; }
				else if (e.type === "raise" || e.type === "bet") post++;
			});
			if (preRaises >= 2) w = 0.06; else if (preRaises === 1) w = 0.22; else if (preCalls) w = 0.5;
			w *= Math.pow(0.72, post);
			return Math.max(0.03, w);
		}
		function botDecide(S, seat, styleKey, r, iters) {
			r = r || Math.random;
			var st = STYLES[styleKey] || STYLES.tag, L = legal(S), p = S.seats[seat], hole = p.hole;
			var pot = L.pot, toCall = L.callAmt, live = inPlay(S).filter(function (i) { return i !== seat; });
			var pos = positionName(S, seat), late = pos === "BTN" || pos === "CO", posF = pos === "BTN" ? 1.35 : pos === "CO" ? 1.2 : pos === "SB" ? 0.9 : 1;
			var odds = toCall > 0 ? toCall / (pot + toCall) : 0;
			function raiseTo(x) {
				x = Math.round(x / S.bb * 2) * S.bb / 2;
				x = Math.max(L.minTo, Math.min(L.maxTo, Math.round(x)));
				if (L.maxTo - x < S.bb * 2 || (x - p.bet) > 0.45 * (p.stack + p.bet)) x = L.maxTo;   // nearly all-in: just shove
				return { type: "raise", to: x };
			}
			function passive() { return L.canCheck ? { type: "check" } : { type: "fold" }; }
			var big = toCall > 0.35 * (p.stack + toCall);
			if (S.street === 0) {
				var pct = holePercentile(hole), facing = S.currentBet > S.bb, noise = (r() - 0.5) * 0.04;
				var openW = st.open * posF + noise, raiseW = st.raise * posF + noise;
				if (big || (facing && S.currentBet > 6 * S.bb)) {   // facing a big bet or shove: decide on equity
					var e0 = rangeEquity(hole, [], live.map(function (i) { return guessWidth(S, i); }), iters || 300, r);
					if (L.canRaise && e0 > 0.62 && r() < st.aggr) return { type: "allin" };
					return e0 > odds + st.margin + 0.04 ? { type: "call" } : passive();
				}
				if (facing) {
					if (pct <= raiseW * 0.45 && L.canRaise) return raiseTo(S.currentBet * 3);
					if (pct <= openW * 0.6 || (odds < 0.25 && pct <= openW)) return { type: "call" };
					if (late && L.canRaise && r() < st.bluff * 0.25) return raiseTo(S.currentBet * 3);
					return passive();
				}
				var limpers = S.seats.filter(function (s, i) { return i !== seat && s.inHand && s.bet === S.bb && !s.folded; }).length - 1;
				if (pct <= raiseW && L.canRaise) return raiseTo(S.bb * (3 + Math.max(0, limpers)));
				if (pct <= openW) return L.canCheck ? (L.canRaise && r() < st.aggr * 0.3 ? raiseTo(S.bb * 3) : { type: "check" }) : { type: "call" };
				if (late && L.canRaise && r() < st.bluff) return raiseTo(S.bb * 2.5);
				if (L.canCheck) return { type: "check" };
				if (S.seats[seat].bet > 0 && odds < 0.2 && pct < 0.6) return { type: "call" };   // small blind completing cheaply
				return { type: "fold" };
			}
			var widths = live.map(function (i) { return guessWidth(S, i); });
			var E = rangeEquity(hole, S.board, widths, iters || 350, r), nOpp = live.length;
			var valueT = 0.5 + 0.06 * (nOpp - 1), raiseT = 0.7 + 0.04 * (nOpp - 1);
			if (L.canCheck) {
				if (L.canRaise && E > valueT && r() < 0.45 + 0.5 * st.aggr) return raiseTo(pot * (0.5 + r() * 0.3));
				if (L.canRaise && nOpp <= 2 && r() < st.bluff * (late ? 1.5 : 1) * (S.street === 3 ? 0.7 : 1)) return raiseTo(pot * (0.45 + r() * 0.25));
				return { type: "check" };
			}
			if (L.canRaise && E > raiseT && r() < 0.3 + 0.6 * st.aggr) return raiseTo(S.currentBet * 2.5 + pot * 0.3);
			if (E >= odds + st.margin) return { type: "call" };
			if (L.canRaise && nOpp === 1 && !big && r() < st.bluff * 0.3) return raiseTo(S.currentBet * 2.6);
			return { type: "fold" };
		}

		return {
			RANKS: RANKS, SUITS: SUITS, SUIT_SYM: SUIT_SYM, CATS: CATS, RANK_NAMES: RANK_NAMES, GRID_RANKS: GRID_RANKS, CHART: CHART, STYLES: STYLES,
			evaluate: evaluate, category: category, handName: handName, best5: best5, rankOf: rankOf, suitOf: suitOf, cardStr: cardStr, parseCard: parseCard, parseCards: parseCards,
			rng: rng, shuffled: shuffled, handClass: handClass, classLabel: classLabel, classCombos: classCombos, classPercentile: classPercentile, holePercentile: holePercentile,
			remainingDeck: remainingDeck, choose: choose, equityJob: equityJob, equity: equity, rangeEquity: rangeEquity, outsImprove: outsImprove, outsVsKnown: outsVsKnown,
			buildPots: buildPots, splitPot: splitPot, startHand: startHand, legal: legal, act: act, potTotal: potTotal, positionName: positionName, inPlay: inPlay,
			guessWidth: guessWidth, botDecide: botDecide
		};
	}
	var api = factory();
	api._factory = factory;
	root.MESPoker = api;
	if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);

/* MES Poker page (mes.fm/poker): Play / Odds calculator / Hand rankings / My stats. Logic lives in lib.js (MESPoker). */
(function () {
	"use strict";
	var P = window.MESPoker, root = document.getElementById("pk");
	if (!P || !root) return;
	var KEY = "mes-poker:v1";
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
	function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + "%"; }
	var toastT = 0;
	function toast(msg) { var t = $("pk-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }

	/* ---------- saved state ---------- */
	var ST = { v: 1, settings: { speed: "normal", four: false, showOdds: false, auto: false, setup: { opps: 5, mix: "mixed", stack: 100, rise: 12, mode: "tour" } }, game: null, stats: null, calc: null };
	try { var raw = JSON.parse(localStorage.getItem(KEY) || "null"); if (raw && raw.v === 1) { ST.settings = Object.assign(ST.settings, raw.settings || {}); ST.game = raw.game || null; ST.stats = raw.stats || null; ST.calc = raw.calc || null; } } catch (e) { }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { } }
	function blankStats() { return { hands: 0, vpip: 0, pfr: 0, sd: 0, sdWon: 0, won: 0, biggest: 0, best: 0, profitBB: 0, cum: [], pos: {} }; }
	if (!ST.stats) ST.stats = blankStats();

	/* ---------- cards ---------- */
	var RD = { 8: "10" };
	function rankTxt(c) { var r = c >> 2; return RD[r] || P.RANKS[r]; }
	function cardName(c) { return P.RANK_NAMES[c >> 2] + " of " + ["spades", "hearts", "diamonds", "clubs"][c & 3]; }
	function cardHTML(c, cls) {
		if (c === "back") return '<span class="pk-card pk-back' + (cls ? " " + cls : "") + '" role="img" aria-label="face-down card"></span>';
		return '<span class="pk-card pk-cs' + (c & 3) + (cls ? " " + cls : "") + '" role="img" aria-label="' + cardName(c) + '"><span class="pk-r">' + rankTxt(c) + '</span><span class="pk-s" aria-hidden="true">' + P.SUIT_SYM[c & 3] + "</span></span>";
	}
	function mini(c) { return '<span class="pk-mini pk-cs' + (c & 3) + '" title="' + cardName(c) + '">' + rankTxt(c) + P.SUIT_SYM[c & 3] + "</span>"; }
	function minis(cs) { return cs.map(mini).join(" "); }
	function applyFour() { root.classList.toggle("pk-four", !!ST.settings.four); }
	applyFour();

	/* ---------- tabs ---------- */
	var TABS = ["play", "odds", "ranks", "stats"], tab = "play";
	function setTab(t, push) {
		if (TABS.indexOf(t) < 0) t = "play";
		tab = t;
		root.querySelectorAll(".pk-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		root.querySelectorAll("section[data-panel]").forEach(function (s) { s.hidden = s.getAttribute("data-panel") !== t; });
		if (t === "odds") ocRender(true);
		if (t === "ranks") rkRender();
		if (t === "stats") stRender();
		if (t === "play") playRender();
		if (push) { try { var u = new URL(location.href); u.search = t === "play" ? "" : "?tab=" + t; history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) { } }
	}
	root.querySelector(".pk-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-tab]"); if (b) setTab(b.getAttribute("data-tab"), true); });
	root.querySelector(".pk-tabs").addEventListener("keydown", function (e) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		var i = TABS.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1); i = (i + TABS.length) % TABS.length;
		setTab(TABS[i], true); root.querySelector('.pk-tabs button[data-tab="' + TABS[i] + '"]').focus();
	});
	function segInit(id, val, cb) {
		var el = $(id);
		function paint(v) { el.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === String(v) ? "true" : "false"); }); }
		paint(val);
		el.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; paint(b.getAttribute("data-v")); cb(b.getAttribute("data-v")); });
		return paint;
	}

	/* =====================================================================
	   PLAY
	   ===================================================================== */
	var NAMES = ["Ana", "Ben", "Chen", "Dara", "Eli", "Femi", "Gia", "Hugo", "Ines", "Jun", "Kofi", "Lena", "Milo", "Nadia", "Omar", "Priya"];
	var LEVELS = [[10, 20], [15, 30], [25, 50], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [700, 1400], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [5000, 10000]];
	var SPEED = { slow: 1500, normal: 850, fast: 380, instant: 40 };
	var G = ST.game, timer = 0, oddsCache = { key: "", html: "" };
	var su = ST.settings.setup;
	$("pk-opps").value = String(su.opps); $("pk-mix").value = su.mix; $("pk-stack").value = String(su.stack); $("pk-rise").value = String(su.rise);
	segInit("pk-mode", su.mode, function (v) { su.mode = v; save(); });
	segInit("pk-speed", ST.settings.speed, function (v) { ST.settings.speed = v; save(); });
	$("pk-showodds").checked = !!ST.settings.showOdds; $("pk-four").checked = !!ST.settings.four; $("pk-auto").checked = !!ST.settings.auto;
	$("pk-showodds").addEventListener("change", function () { ST.settings.showOdds = this.checked; save(); oddsCache.key = ""; playRender(); });
	$("pk-four").addEventListener("change", function () { ST.settings.four = this.checked; applyFour(); save(); });
	$("pk-auto").addEventListener("change", function () { ST.settings.auto = this.checked; save(); if (this.checked && G && G.hand && G.hand.done && !G.over) scheduleNext(); });
	["pk-opps", "pk-mix", "pk-stack", "pk-rise"].forEach(function (id) { $(id).addEventListener("change", function () { su.opps = +$("pk-opps").value; su.mix = $("pk-mix").value; su.stack = +$("pk-stack").value; su.rise = +$("pk-rise").value; save(); }); });

	function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
	function newGame() {
		var n = su.opps, start = su.stack * LEVELS[0][1], names = shuffleArr(NAMES.slice()), mixes = shuffleArr(["tag", "lp", "lag", "tp", "tag", "lp", "lag", "tag"]);
		var players = [{ name: "You", hero: true, stack: start, out: false, rebuys: 0 }];
		for (var i = 0; i < n; i++) players.push({ name: names[i], style: su.mix === "mixed" ? mixes[i % mixes.length] : su.mix, stack: start, out: false, rebuys: 0 });
		G = ST.game = { cfg: { n: n + 1, start: start, rise: su.rise, mode: su.mode }, players: players, button: Math.floor(Math.random() * (n + 1)), handNo: 0, over: false, finish: [], hand: null, logSeen: 0, log: [] };
		G._show = true;
		$("pk-log").innerHTML = "";
		startNextHand();
	}
	function levelOf() { return G.cfg.rise ? Math.min(LEVELS.length - 1, Math.floor((G.handNo - 1) / G.cfg.rise)) : 0; }
	function aliveIdx() { var o = []; G.players.forEach(function (p, i) { if (!p.out && p.stack > 0) o.push(i); }); return o; }
	function startNextHand() {
		clearTimeout(timer);
		if (!G || G.over) return;
		var alive = aliveIdx();
		if (alive.length < 2 || (G.cfg.mode === "tour" && G.players[0].out)) { gameOver(); return; }
		if (G.cfg.mode === "cash" && G.players[0].stack <= 0) { playRender(); return; }
		G.handNo++;
		var lv = LEVELS[levelOf()], b = G.button;
		for (var k = 1; k <= G.players.length; k++) { var i = (b + k) % G.players.length; if (alive.indexOf(i) >= 0) { b = i; break; } }
		G.button = b;
		var stacks = G.players.map(function (p) { return p.out ? 0 : p.stack; });
		G.hand = P.startHand({ stacks: stacks, button: b, sb: lv[0], bb: lv[1] });
		G.hand.level = levelOf();
		G.logSeen = 0;
		addLog("Hand #" + G.handNo + " · blinds " + fmt(lv[0]) + " / " + fmt(lv[1]), "pk-lh");
		flushLog();
		oddsCache.key = "";
		save(); playRender(); schedule();
	}
	function gameOver() {
		G.over = true; G.hand = G.hand || null;
		var alive = aliveIdx(), msg;
		if (G.cfg.mode === "tour") {
			if (!G.players[0].out && alive.length === 1) msg = "You won the tournament! Every other player is out of chips.";
			else msg = "You are out in " + ordinal(G.heroPlace || alive.length + 1) + " place of " + G.players.length + ".";
		} else msg = "Game over.";
		G.overMsg = msg; addLog(msg, "pk-lw"); save(); playRender();
	}
	function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
	function schedule() {
		clearTimeout(timer);
		var S = G && G.hand;
		if (!S || G.over) return;
		if (S.done) { if (!S._ended) endHand(); return; }
		if (S.toAct === 0) { playRender(); return; }
		var heroIn = S.seats[0].inHand && !S.seats[0].folded;
		var d = SPEED[ST.settings.speed] || 850;
		if (!heroIn) d = Math.min(d, 260);
		timer = setTimeout(function () {
			var seat = S.toAct, a;
			try { a = P.botDecide(S, seat, G.players[seat].style); } catch (e) { a = null; }
			doAct(a);
		}, d);
	}
	function doAct(a) {
		var S = G.hand, L = P.legal(S);
		if (!L) return;
		try { if (!a) throw 0; P.act(S, a); }
		catch (e) { P.act(S, L.canCheck ? { type: "check" } : { type: "fold" }); }
		flushLog(); save(); playRender(); schedule();
	}
	function heroAct(type) {
		var S = G && G.hand;
		if (!S || S.done || S.toAct !== 0) return;
		var L = P.legal(S);
		if (type === "raise") {
			if (!L.canRaise) return;
			var to = clampTo(parseAmt($("pk-amt").value), L);
			doAct({ type: "raise", to: to });
		} else if (type === "call") doAct(L.canCheck ? { type: "check" } : { type: "call" });
		else doAct({ type: "fold" });
	}
	function parseAmt(s) { var n = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
	function clampTo(x, L) { return Math.max(L.minTo, Math.min(L.maxTo, Math.round(x))); }
	function presetTo(p, L, S) {
		if (p === "min") return L.minTo;
		if (p === "all") return L.maxTo;
		var f = +p, pot = L.pot;
		return clampTo(L.isBet ? f * pot : S.currentBet + f * (pot + L.toCall), L);
	}
	$("pk-fold").addEventListener("click", function () { heroAct("fold"); });
	$("pk-call").addEventListener("click", function () { heroAct("call"); });
	$("pk-raise").addEventListener("click", function () { heroAct("raise"); });
	$("pk-presets").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-p]"), S = G && G.hand; if (!b || !S || S.toAct !== 0) return;
		var L = P.legal(S); if (!L.canRaise) return;
		setAmt(presetTo(b.getAttribute("data-p"), L, S), L);
	});
	function setAmt(to, L) {
		$("pk-amt").value = fmt(to);
		var r = $("pk-amt-r"); r.value = L.maxTo > L.minTo ? Math.round((to - L.minTo) / (L.maxTo - L.minTo) * 1000) : 1000;
		paintRaiseBtn(L, to);
	}
	$("pk-amt-r").max = 1000;
	$("pk-amt-r").addEventListener("input", function () {
		var S = G && G.hand; if (!S || S.toAct !== 0) return; var L = P.legal(S);
		var f = +this.value / 1000, to = L.minTo + f * f * (L.maxTo - L.minTo);   // squared: finer steps at the small end
		var bb = S.bb / 2; to = Math.round(to / bb) * bb;
		to = clampTo(f >= 1 ? L.maxTo : to, L);
		$("pk-amt").value = fmt(to); paintRaiseBtn(L, to);
	});
	$("pk-amt").addEventListener("input", function () { var S = G && G.hand; if (!S || S.toAct !== 0) return; var L = P.legal(S); paintRaiseBtn(L, clampTo(parseAmt(this.value), L)); });
	$("pk-amt").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); heroAct("raise"); } });
	$("pk-amt").addEventListener("blur", function () { var S = G && G.hand; if (!S || S.toAct !== 0) return; var L = P.legal(S); if (L.canRaise) setAmt(clampTo(parseAmt(this.value), L), L); });
	function paintRaiseBtn(L, to) {
		var b = $("pk-raise");
		if (!L || !L.canRaise) { b.innerHTML = "Raise <kbd>R</kbd>"; return; }
		var all = to >= L.maxTo;
		b.innerHTML = (all ? "All-in " + fmt(to) : (L.isBet ? "Bet " : "Raise to ") + fmt(to)) + " <kbd>R</kbd>";
	}
	$("pk-start").addEventListener("click", function () {
		if (G && !G.over && G.handNo > 0 && !confirm("Start a new game? The game in progress will be lost.")) return;
		newGame(); setTab("play");
		var t = $("pk-table"); if (t.scrollIntoView) t.scrollIntoView({ block: "center", behavior: "smooth" });
	});
	$("pk-continue").addEventListener("click", function () { $("pk-setup").hidden = true; $("pk-game").hidden = false; G._show = true; playRender(); if (G.hand && !G.hand.done) schedule(); else if (G.hand && G.hand.done && !G.hand._ended) endHand(); });
	$("pk-quit").addEventListener("click", function () { clearTimeout(timer); G._show = false; $("pk-game").hidden = true; $("pk-setup").hidden = false; playRender(); });
	$("pk-next").addEventListener("click", function () { if (G && G.over) newGame(); else startNextHand(); });
	$("pk-rebuy").addEventListener("click", function () { var h = G.players[0]; h.stack = G.cfg.start; h.rebuys++; addLog("You rebuy for " + fmt(G.cfg.start) + " play chips."); flushLog(); save(); startNextHand(); });
	document.addEventListener("keydown", function (e) {
		if (tab !== "play" || !G || $("pk-game").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
		var t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && t.id !== "pk-amt-r") return;
		var k = e.key.toLowerCase();
		if (k === "n" && G.hand && G.hand.done && !$("pk-nextbox").hidden && !$("pk-next").disabled) { e.preventDefault(); startNextHand(); return; }
		if (!G.hand || G.hand.toAct !== 0 || G.hand.done) return;
		if (k === "f") { e.preventDefault(); heroAct("fold"); } else if (k === "c" || k === "k") { e.preventDefault(); heroAct("call"); } else if (k === "r") { e.preventDefault(); heroAct("raise"); }
	});

	function endHand() {
		var S = G.hand; S._ended = true;
		S.seats.forEach(function (s, i) { G.players[i].stack = s.stack; });
		var r = S.result;
		r.pots.forEach(function (pt, k) {
			var label = r.pots.length > 1 ? (k === 0 ? " (main pot)" : " (side pot " + k + ")") : "";
			pt.winners.forEach(function (w) {
				var hv = r.showdown && r.values[w] ? " with " + P.handName(r.values[w].value) : "";
				if (pt.returned) addLog(G.players[w].name + " gets " + fmt(pt.shares[w]) + " back (nobody called it)");
				else addLog(G.players[w].name + (w === 0 ? " win " : " wins ") + fmt(pt.shares[w]) + label + hv, "pk-lw");
			});
		});
		if (r.showdown) r.alive.forEach(function (i) { if (i !== 0) addLog(G.players[i].name + " shows " + S.seats[i].hole.map(function (c) { return rankTxt(c) + P.SUIT_SYM[c & 3]; }).join(" ")); });
		recordStats(S);
		// busts
		G.players.forEach(function (p, i) {
			if (p.out || p.stack > 0) return;
			if (G.cfg.mode === "cash") { if (i !== 0) { p.stack = G.cfg.start; p.rebuys++; addLog(p.name + " rebuys for " + fmt(G.cfg.start) + "."); } }
			else { p.out = true; G.finish.unshift(i); if (i === 0) G.heroPlace = aliveIdx().length + 1; addLog((i === 0 ? "You are" : p.name + " is") + " out of chips."); }
		});
		flushLog();
		if (G.cfg.mode === "tour" && (G.players[0].out || aliveIdx().length < 2)) { gameOver(); return; }
		save(); playRender();
		if (ST.settings.auto && !(G.cfg.mode === "cash" && G.players[0].stack <= 0)) scheduleNext();
	}
	function scheduleNext() { clearTimeout(timer); timer = setTimeout(startNextHand, Math.max(1400, (SPEED[ST.settings.speed] || 850) * 3.2)); }

	/* ---------- log ---------- */
	function addLog(text, cls) { G.log.push([text, cls || ""]); if (G.log.length > 220) G.log.splice(0, G.log.length - 220); }
	var STREETS = ["Pre-flop", "Flop", "Turn", "River"];
	function flushLog() {
		var S = G.hand;
		if (S) {
			for (; G.logSeen < S.log.length; G.logSeen++) {
				var e = S.log[G.logSeen], nm = e.seat >= 0 ? G.players[e.seat].name : "", you = e.seat === 0, ai = e.allIn ? " (all-in)" : "";
				if (e.type === "deal") { addLog(STREETS[e.street] + ": " + e.cards.map(function (c) { return rankTxt(c) + P.SUIT_SYM[c & 3]; }).join(" "), "pk-lh"); continue; }
				var t = e.type === "small blind" || e.type === "big blind" || e.type === "ante" ? nm + (you ? " post " : " posts ") + "the " + e.type + " (" + fmt(e.amount) + ")"
					: e.type === "fold" ? nm + (you ? " fold" : " folds") : e.type === "check" ? nm + (you ? " check" : " checks")
					: e.type === "call" ? nm + (you ? " call " : " calls ") + fmt(e.amount) + ai
					: e.type === "bet" ? nm + (you ? " bet " : " bets ") + fmt(e.to) + ai : nm + (you ? " raise to " : " raises to ") + fmt(e.to) + ai;
				addLog(t);
			}
		}
		var ol = $("pk-log");
		ol.innerHTML = G.log.map(function (x) { return '<li class="' + x[1] + '">' + esc(x[0]) + "</li>"; }).join("");
		ol.scrollTop = ol.scrollHeight;
	}

	/* ---------- render ---------- */
	function seatXY(i, n, phone) {
		var a = (90 + i * 360 / n) * Math.PI / 180, rx = phone ? 37 : 42, ry = phone ? 41 : 41;
		return [50 + rx * Math.cos(a), 50 + ry * Math.sin(a), a];
	}
	function bubbleFor(S, i) {
		if (S.done) {
			var won = S.result.payouts[i];
			if (won > 0) return "Wins " + fmt(won);
			return S.seats[i].folded && S.seats[i].inHand ? "Fold" : "";
		}
		var last = null;
		S.log.forEach(function (e) { if (e.seat === i && e.street === S.street) last = e; });
		if (!last) return S.seats[i].folded && S.seats[i].inHand ? "Fold" : "";
		var m = { fold: "Fold", check: "Check", call: "Call", bet: "Bet", raise: "Raise", "small blind": "SB", "big blind": "BB", ante: "Ante" }[last.type] || "";
		return last.allIn ? "All-in" : m;
	}
	function playRender() {
		var showGame = G && (G._show || (G.handNo > 0 && $("pk-setup").hidden));
		var resumable = G && !G.over && G.handNo > 0;
		$("pk-resume").hidden = !resumable || !$("pk-game").hidden;
		if (resumable) $("pk-resume-text").textContent = "You have a game in progress: hand #" + G.handNo + ", " + aliveIdx().length + " players with chips, you have " + fmt(G.players[0].stack) + " play chips.";
		if (!G || !G._show) { $("pk-game").hidden = true; $("pk-setup").hidden = false; return; }
		$("pk-setup").hidden = true; $("pk-game").hidden = false;
		var S = G.hand, n = G.players.length, phone = window.matchMedia("(max-width: 640px)").matches;
		var lvI = S ? S.level : levelOf(), lv = LEVELS[lvI];
		var info = "Hand #" + G.handNo + " · Blinds " + fmt(lv[0]) + " / " + fmt(lv[1]);
		if (G.cfg.rise && lvI < LEVELS.length - 1) { var left = G.cfg.rise - ((G.handNo - 1) % G.cfg.rise); info += " (up in " + left + (left === 1 ? " hand)" : " hands)"); }
		info += " · " + (G.cfg.mode === "tour" ? aliveIdx().length + " of " + n + " left" : "Cash game");
		$("pk-info").textContent = info;
		var html = "", bestCards = {}, winners = {};
		if (S && S.done && S.result.showdown) {
			var mp = S.result.pots[0];
			S.result.pots.forEach(function (pt) { pt.winners.forEach(function (w) { winners[w] = 1; }); });
			mp.winners.forEach(function (w) { var b = S.result.values[w]; if (b) b.cards.forEach(function (c) { bestCards[c] = 1; }); });
		} else if (S && S.done) S.result.pots.forEach(function (pt) { pt.winners.forEach(function (w) { winners[w] = 1; }); });
		var showdown = S && S.done && S.result.showdown;
		for (var i = 0; i < n; i++) {
			var p = G.players[i], s = S ? S.seats[i] : null, xy = seatXY(i, n, phone), cls = "pk-seat";
			if (i === 0) cls += " is-hero";
			if (S && !S.done && S.toAct === i) cls += " is-turn";
			if (s && s.folded && s.inHand) cls += " is-folded";
			if (p.out || (s && !s.inHand)) cls += " is-out";
			if (winners[i]) cls += " is-winner";
			var cards = "";
			if (s && s.inHand && !(s.folded && i !== 0)) {
				var faceUp = i === 0 || (showdown && S.result.alive.indexOf(i) >= 0);
				cards = s.hole.map(function (c) { return faceUp ? cardHTML(c, showdown ? (bestCards[c] ? "is-best" : "is-dim") : "") : cardHTML("back"); }).join("");
			}
			var bub = S ? bubbleFor(S, i) : "";
			var stackTxt = p.out ? "Out" : fmt(s ? s.stack : p.stack);
			var sty = i === 0 ? (S && s && s.inHand ? P.positionName(S, i) : "") : P.STYLES[p.style].short;
			if (i !== 0 && S && s && s.inHand) sty = P.positionName(S, i) + " · " + sty;
			html += '<div class="' + cls + '" style="left:' + xy[0].toFixed(2) + "%;top:" + xy[1].toFixed(2) + '%"><div class="pk-cards">' + cards + "</div>" +
				'<div class="pk-plate">' + (bub ? '<span class="pk-bubble">' + esc(bub) + "</span>" : "") + '<span class="pk-name">' + esc(p.name) + '</span><span class="pk-stk">' + stackTxt + "</span>" + (sty ? '<span class="pk-sty">' + esc(sty) + "</span>" : "") + "</div></div>";
			var bx = 50 + (xy[0] - 50) * 0.6, by = 50 + (xy[1] - 50) * (phone ? 0.62 : 0.56);
			if (s && s.bet > 0) html += '<div class="pk-bet" style="left:' + bx.toFixed(2) + "%;top:" + by.toFixed(2) + '%"><span class="pk-chip"></span>' + fmt(s.bet) + "</div>";
			if (S && S.button === i) {
				var ang = xy[2] + (phone ? 0.3 : 0.2), dx = 50 + (phone ? 25 : 28) * Math.cos(ang), dy = 50 + (phone ? 28 : 24) * Math.sin(ang);
				html += '<div class="pk-dealer" style="left:' + dx.toFixed(2) + "%;top:" + dy.toFixed(2) + '%" title="Dealer button">D</div>';
			}
		}
		$("pk-seats").innerHTML = html;
		var board = "";
		for (var b = 0; b < 5; b++) board += S && S.board[b] !== undefined ? cardHTML(S.board[b], showdown ? (bestCards[S.board[b]] ? "is-best" : "is-dim") : "") : '<span class="pk-slot"></span>';
		$("pk-board").innerHTML = board;
		$("pk-pot").textContent = S ? "Pot " + fmt(P.potTotal(S)) : "";
		var msg = "";
		if (G.over) msg = G.overMsg || "Game over.";
		else if (S && S.done) {
			var r = S.result, w = r.pots[0].winners;
			msg = w.map(function (x) { return G.players[x].name; }).join(" and ") + (w.length > 1 ? " split the pot" : (w[0] === 0 ? " win" : " wins")) + (r.showdown && r.values[w[0]] ? " with " + P.handName(r.values[w[0]].value) : "");
			if (r.pots.length > 1 && r.pots.some(function (pt, k) { return k > 0 && !pt.returned; })) msg += " (and side pots)";
		} else if (S && S.toAct === 0) msg = "Your turn";
		else if (S && S.toAct >= 0) msg = G.players[S.toAct].name + " is thinking…";
		$("pk-msg").textContent = msg;
		renderControls(S);
		renderOdds(S);
		if (G.log.length && !$("pk-log").children.length) flushLog();
	}
	function renderControls(S) {
		var my = S && !S.done && S.toAct === 0 && !G.over, L = my ? P.legal(S) : null;
		$("pk-fold").disabled = !my; $("pk-call").disabled = !my; $("pk-raise").disabled = !my || !L.canRaise;
		$("pk-raisebox").classList.toggle("is-off", !my || !L || !L.canRaise);
		if (my) {
			$("pk-call").innerHTML = (L.canCheck ? "Check" : "Call " + fmt(L.callAmt) + (L.allInCall ? " (all-in)" : "")) + " <kbd>C</kbd>";
			if (L.canRaise) {
				var cur = parseAmt($("pk-amt").value);
				if (!$("pk-amt").dataset.k || $("pk-amt").dataset.k !== G.handNo + ":" + S.log.length) { cur = L.isBet ? presetTo("0.5", L, S) : L.minTo; $("pk-amt").dataset.k = G.handNo + ":" + S.log.length; }
				setAmt(clampTo(cur, L), L);
			} else paintRaiseBtn(null);
		} else { $("pk-call").innerHTML = "Check <kbd>C</kbd>"; paintRaiseBtn(null); }
		var done = S && S.done;
		$("pk-nextbox").hidden = !(done || G.over);
		root.querySelector(".pk-btns").hidden = !!(done || G.over); $("pk-raisebox").hidden = !!(done || G.over);
		var broke = G.cfg.mode === "cash" && G.players[0].stack <= 0;
		$("pk-rebuy").hidden = !broke || G.over; $("pk-next").disabled = broke;
		$("pk-next").innerHTML = G.over ? "Play again" : "Deal next hand <kbd>N</kbd>";
		if (my && document.activeElement === document.body) { /* keep focus where it is */ }
	}

	/* "show my odds" panel */
	function renderOdds(S) {
		var box = $("pk-odds");
		if (!ST.settings.showOdds || !S || !S.seats[0].inHand || S.seats[0].folded || G.over) { box.hidden = true; return; }
		var opp = P.inPlay(S).filter(function (i) { return i !== 0; }), hole = S.seats[0].hole, L = S.toAct === 0 && !S.done ? P.legal(S) : null;
		var key = G.handNo + ":" + S.board.length + ":" + opp.length + ":" + (L ? S.currentBet + "/" + L.toCall : "w") + ":" + S.done;
		if (oddsCache.key !== key) {
			var h = "";
			if (S.board.length >= 3) h += "<h3>You have: " + esc(P.handName(P.evaluate(hole.concat(S.board)))) + "</h3>";
			else {
				var ci = P.handClass(hole[0], hole[1]);
				h += "<h3>Your starting hand: " + P.classLabel(ci) + "</h3><p>Top " + pct(P.classPercentile(ci), 0) + " of starting hands; wins " + pct(P.CHART[ci] / 1000) + " against one random hand.</p>";
			}
			if (opp.length && !S.done) {
				var eR = P.rangeEquity(hole, S.board, opp.map(function () { return 1; }), 2500), eG = P.rangeEquity(hole, S.board, opp.map(function (i) { return P.guessWidth(S, i); }), 2500);
				h += "<p>Chance to win against " + opp.length + " random hand" + (opp.length > 1 ? "s" : "") + ": <b>" + pct(eR, 0) + "</b></p><div class=\"pk-eqbar\"><span style=\"width:" + (eR * 100).toFixed(1) + '%"></span></div>';
				h += "<p>Against the hands their betting suggests (an estimate): <b>" + pct(eG, 0) + "</b></p>";
				if (L && L.toCall > 0) {
					var need = L.callAmt / (L.pot + L.callAmt);
					h += "<p>Pot odds: call " + fmt(L.callAmt) + " to win " + fmt(L.pot) + ", so you need at least <b>" + pct(need) + "</b> equity.</p>";
					h += '<p class="pk-verdict ' + (eG >= need ? "is-good" : "is-bad") + '">' + (eG >= need ? "Calling is worth it in the long run (against that estimate)." : "Calling loses chips in the long run, unless you can win more later or make them fold.") + "</p>";
				}
			}
			if (S.board.length === 3 || S.board.length === 4) {
				var o = P.outsImprove(hole, S.board);
				if (o.cards.length) {
					var unseen = 52 - 2 - S.board.length, k = 5 - S.board.length, miss = P.choose(unseen - o.cards.length, k) / P.choose(unseen, k);
					h += "<p><b>" + o.cards.length + " out" + (o.cards.length > 1 ? "s" : "") + "</b> (cards that improve you): " + o.groups.map(function (g) { return g.name + " " + minis(g.cards); }).join("; ") + ". Chance to hit one by the river: <b>" + pct(1 - miss, 0) + "</b>.</p>";
				} else h += "<p>No clean outs to a better hand.</p>";
			}
			oddsCache = { key: key, html: h };
		}
		box.innerHTML = oddsCache.html; box.hidden = false;
	}
	window.addEventListener("resize", function () { if (tab === "play" && G && G._show) playRender(); });

	/* ---------- stats recording ---------- */
	function recordStats(S) {
		if (!S.seats[0].inHand) return;
		var st = ST.stats, pre = S.log.filter(function (e) { return e.seat === 0 && e.street === 0; }), bb = S.bb;
		var vp = pre.some(function (e) { return e.type === "call" || e.type === "raise" || e.type === "bet"; }), pr = pre.some(function (e) { return e.type === "raise" || e.type === "bet"; });
		var won = S.result.payouts[0], profit = S.seats[0].stack - S.startStacks[0], pos = P.positionName(S, 0);
		st.hands++; if (vp) st.vpip++; if (pr) st.pfr++;
		var sd = S.result.showdown && S.result.alive.indexOf(0) >= 0;
		if (sd) { st.sd++; if (won > 0) st.sdWon++; var v = S.result.values[0]; if (v && v.value > st.best) { st.best = v.value; st.bestCards = v.cards; } }
		if (profit > 0) { st.won++; st.biggest = Math.max(st.biggest, won); }
		var pb = profit / bb;
		st.profitBB += pb;
		st.cum.push(Math.round(st.profitBB * 10) / 10); if (st.cum.length > 4000) st.cum = st.cum.filter(function (x, i) { return i % 2 === 0; });
		var ps = st.pos[pos] || (st.pos[pos] = { h: 0, v: 0, p: 0, w: 0 });
		ps.h++; if (vp) ps.v++; ps.p += pb; if (profit > 0) ps.w++;
	}

	/* =====================================================================
	   ODDS CALCULATOR
	   ===================================================================== */
	var OC = ST.calc;
	function ocDefault() { return { players: [{ c: [P.parseCard("Ah"), P.parseCard("Ad")], r: false }, { c: [P.parseCard("Ks"), P.parseCard("Kc")], r: false }], board: [-1, -1, -1, -1, -1], dead: [-1, -1, -1, -1] }; }
	if (!OC || !OC.players) OC = ST.calc = ocDefault();
	var ocSel = { k: "p", i: 0, j: 0 }, ocWorker = null, ocId = 0, ocTimer = 0, ocBuilt = false;
	function ocUsed() {
		var u = {};
		OC.players.forEach(function (p) { if (!p.r) p.c.forEach(function (c) { if (c >= 0) u[c] = 1; }); });
		OC.board.forEach(function (c) { if (c >= 0) u[c] = 1; }); OC.dead.forEach(function (c) { if (c >= 0) u[c] = 1; });
		return u;
	}
	function slotHTML(c, k, i, j, label) {
		var on = ocSel.k === k && ocSel.i === i && ocSel.j === j;
		return '<button type="button" class="pk-sl' + (on ? " is-on" : "") + '" data-k="' + k + '" data-i="' + i + '" data-j="' + j + '" aria-label="' + esc(label) + (c >= 0 ? ": " + cardName(c) : ": empty") + '"' + (on ? ' aria-pressed="true"' : "") + ">" + (c >= 0 ? cardHTML(c) : "+") + "</button>";
	}
	function ocRender(full) {
		if (!ocBuilt) { ocBuildGrid(); ocBuilt = true; }
		var h = "";
		OC.players.forEach(function (p, i) {
			h += '<div class="pk-oc-p"><span class="pk-oc-lab">Player ' + (i + 1) + "</span>";
			if (p.r) h += '<span class="tu-note" style="margin:0 0.4em;">any two cards</span>';
			else h += '<span class="pk-slots">' + slotHTML(p.c[0], "p", i, 0, "Player " + (i + 1) + " card 1") + slotHTML(p.c[1], "p", i, 1, "Player " + (i + 1) + " card 2") + "</span>";
			h += '<button type="button" class="pk-oc-rnd" data-rnd="' + i + '" aria-pressed="' + (p.r ? "true" : "false") + '">Random</button>';
			if (OC.players.length > 2) h += '<button type="button" class="pk-oc-x" data-del="' + i + '" aria-label="Remove player ' + (i + 1) + '">×</button>';
			h += "</div>";
		});
		$("pk-oc-players").innerHTML = h;
		$("pk-oc-board").innerHTML = OC.board.map(function (c, j) { return slotHTML(c, "b", 0, j, ["Flop card 1", "Flop card 2", "Flop card 3", "Turn", "River"][j]); }).join("");
		$("pk-oc-dead").innerHTML = OC.dead.map(function (c, j) { return slotHTML(c, "d", 0, j, "Dead card " + (j + 1)); }).join("");
		$("pk-oc-add").disabled = OC.players.length >= 9;
		var u = ocUsed();
		$("pk-grid").querySelectorAll("button[data-c]").forEach(function (b) { b.disabled = !!u[+b.getAttribute("data-c")]; });
		if (full !== false) ocQueue();
	}
	function ocBuildGrid() {
		var h = "";
		for (var s = 0; s < 4; s++) {
			h += '<div class="pk-grow">';
			for (var r = 12; r >= 0; r--) { var c = r * 4 + s; h += '<button type="button" class="pk-gc pk-cs' + s + '" data-c="' + c + '" aria-label="' + cardName(c) + '">' + rankTxt(c) + "<br>" + P.SUIT_SYM[s] + "</button>"; }
			h += "</div>";
		}
		$("pk-grid").innerHTML = h;
	}
	function ocGet(sel) { return sel.k === "p" ? OC.players[sel.i].c[sel.j] : sel.k === "b" ? OC.board[sel.j] : OC.dead[sel.j]; }
	function ocSet(sel, c) { if (sel.k === "p") OC.players[sel.i].c[sel.j] = c; else if (sel.k === "b") OC.board[sel.j] = c; else OC.dead[sel.j] = c; }
	function ocAdvance() {   // move the selection to the next empty slot
		var list = [];
		OC.players.forEach(function (p, i) { if (!p.r) { list.push({ k: "p", i: i, j: 0 }); list.push({ k: "p", i: i, j: 1 }); } });
		for (var j = 0; j < 5; j++) list.push({ k: "b", i: 0, j: j });
		for (var d = 0; d < OC.dead.length; d++) list.push({ k: "d", i: 0, j: d });
		var at = list.findIndex(function (x) { return x.k === ocSel.k && x.i === ocSel.i && x.j === ocSel.j; });
		for (var t = 1; t <= list.length; t++) { var x = list[(at + t) % list.length]; if (ocGet(x) < 0) { ocSel = x; return; } }
	}
	root.querySelector('section[data-panel="odds"]').addEventListener("click", function (e) {
		var sl = e.target.closest(".pk-sl");
		if (sl) {
			var sel = { k: sl.getAttribute("data-k"), i: +sl.getAttribute("data-i"), j: +sl.getAttribute("data-j") };
			if (ocSel.k === sel.k && ocSel.i === sel.i && ocSel.j === sel.j && ocGet(sel) >= 0) { ocSet(sel, -1); save(); ocRender(); }
			else { ocSel = sel; ocRender(false); }
			return;
		}
		var gc = e.target.closest(".pk-gc");
		if (gc && !gc.disabled) {
			if (ocSel.k === "p" && OC.players[ocSel.i] && OC.players[ocSel.i].r) ocAdvance();
			ocSet(ocSel, +gc.getAttribute("data-c")); ocAdvance(); save(); ocRender();
			return;
		}
		var rb = e.target.closest("[data-rnd]");
		if (rb) { var p = OC.players[+rb.getAttribute("data-rnd")]; p.r = !p.r; if (p.r) p.c = [-1, -1]; else ocSel = { k: "p", i: +rb.getAttribute("data-rnd"), j: 0 }; save(); ocRender(); return; }
		var del = e.target.closest("[data-del]");
		if (del) { OC.players.splice(+del.getAttribute("data-del"), 1); ocSel = { k: "b", i: 0, j: 0 }; ocAdvance(); save(); ocRender(); }
	});
	$("pk-oc-add").addEventListener("click", function () { if (OC.players.length >= 9) return; OC.players.push({ c: [-1, -1], r: true }); save(); ocRender(); });
	$("pk-oc-clear").addEventListener("click", function () { OC.players = [{ c: [-1, -1], r: false }, { c: [-1, -1], r: true }]; OC.board = [-1, -1, -1, -1, -1]; OC.dead = [-1, -1, -1, -1]; ocSel = { k: "p", i: 0, j: 0 }; save(); ocRender(); });
	$("pk-oc-copy").addEventListener("click", function () {
		var cs = function (a) { return a.filter(function (c) { return c >= 0; }).map(P.cardStr).join(""); };
		var q = "?tab=odds&h=" + OC.players.map(function (p) { return p.r ? "r" : cs(p.c) || "r"; }).join("-") + (cs(OC.board) ? "&b=" + cs(OC.board) : "") + (cs(OC.dead) ? "&d=" + cs(OC.dead) : "");
		var url = location.origin + location.pathname + q;
		(navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", url); });
	});
	function ocSpec() {
		var hands = [], err = "";
		OC.players.forEach(function (p, i) {
			if (p.r) hands.push(null);
			else { var k = p.c.filter(function (c) { return c >= 0; }); if (k.length !== 2) err = err || "Player " + (i + 1) + " needs two cards (or tap Random)."; hands.push(k); }
		});
		var board = OC.board.filter(function (c) { return c >= 0; }), dead = OC.dead.filter(function (c) { return c >= 0; });
		if (board.length === 1 || board.length === 2) err = err || "The board needs 3 cards (the flop), 4 or 5.";
		if (!err && hands.every(function (x) { return !x; })) err = "Give at least one player two cards.";
		return { err: err, spec: { hands: hands, board: board, dead: dead } };
	}
	function ocQueue() { clearTimeout(ocTimer); ocTimer = setTimeout(ocRun, 180); }
	function workerSrc() {
		return "var MESPoker=(" + P._factory.toString() + ")();\nself.onmessage=function(e){var d=e.data,job=MESPoker.equityJob(d.spec,{}),t0=Date.now();" +
			"function loop(){var fin=job.step(job.mode==='exact'?150000:25000),r=job.result(),se=0;r.players.forEach(function(p){se=Math.max(se,p.se);});" +
			"var stop=fin||(job.mode==='mc'&&(r.done>=3e6||Date.now()-t0>d.maxMs||(r.done>=40000&&se<d.se)));self.postMessage({id:d.id,res:r,final:stop});if(!stop)setTimeout(loop,0);}loop();};";
	}
	var workerURL = null;
	function ocRun() {
		var sp = ocSpec(), st = $("pk-oc-status");
		if (ocWorker) { try { ocWorker.terminate(); } catch (e) { } ocWorker = null; }
		ocId++;
		if (sp.err) { st.textContent = sp.err; $("pk-oc-prog").hidden = true; $("pk-oc-table").innerHTML = ""; $("pk-oc-cats").innerHTML = ""; $("pk-oc-outs").innerHTML = ""; return; }
		var msg = { id: ocId, spec: sp.spec, maxMs: 5000, se: 0.0012 }, id = ocId;
		st.textContent = "Calculating…";
		var onres = function (d) { if (d.id !== id) return; ocShow(d.res, d.final, sp.spec); };
		try {
			if (!workerURL) workerURL = URL.createObjectURL(new Blob([workerSrc()], { type: "text/javascript" }));
			ocWorker = new Worker(workerURL);
			ocWorker.onmessage = function (e) { onres(e.data); };
			ocWorker.onerror = function () { ocWorker = null; mainThread(msg, onres); };
			ocWorker.postMessage(msg);
		} catch (e) { mainThread(msg, onres); }
	}
	function mainThread(d, cb) {   // fallback when Web Workers are not available: same loop in small chunks
		var job = P.equityJob(d.spec, {}), t0 = Date.now();
		(function loop() {
			if (d.id !== ocId) return;
			var fin = job.step(job.mode === "exact" ? 60000 : 8000), r = job.result(), se = 0;
			r.players.forEach(function (p) { se = Math.max(se, p.se); });
			var stop = fin || (job.mode === "mc" && (r.done >= 1e6 || Date.now() - t0 > d.maxMs || (r.done >= 40000 && se < d.se)));
			cb({ id: d.id, res: r, final: stop });
			if (!stop) setTimeout(loop, 0);
		})();
	}
	function ocShow(r, final, spec) {
		var st = $("pk-oc-status"), pr = $("pk-oc-prog");
		if (r.mode === "exact") {
			st.textContent = (final ? "Exact: " : "Working: ") + fmt(r.done) + (final ? "" : " of " + fmt(r.total)) + " possible deal" + (r.done === 1 ? "" : "s") + (final ? " counted." : "…");
			pr.hidden = final; pr.firstChild.style.width = (r.done / r.total * 100).toFixed(1) + "%";
		} else {
			var se = Math.max.apply(null, r.players.map(function (p) { return p.se; }));
			st.textContent = (final ? "Simulated " : "Simulating… ") + fmt(r.done) + " random deals · margin of error ±" + (se * 100).toFixed(2) + "% (one standard error)";
			pr.hidden = final; pr.firstChild.style.width = Math.min(100, r.done / 400000 * 100).toFixed(1) + "%";
		}
		var h = "<thead><tr><th>Player</th><th>Cards</th><th>Win</th><th>Tie</th><th class=\"pk-eqcell\">Equity</th></tr></thead><tbody>";
		r.players.forEach(function (p, i) {
			var hd = spec.hands[i];
			h += "<tr><td>Player " + (i + 1) + "</td><td>" + (hd ? minis(hd) : "random") + "</td><td>" + pct(p.win, 2) + "</td><td>" + pct(p.tie, 2) + '</td><td class="pk-eqcell"><b>' + pct(p.equity, 2) + '</b><span class="pk-bar"><i style="width:' + (p.equity * 100).toFixed(2) + '%"></i></span></td></tr>';
		});
		$("pk-oc-table").innerHTML = h + "</tbody>";
		var c = "<thead><tr><th>Hand</th>" + r.players.map(function (p, i) { return "<th>P" + (i + 1) + "</th>"; }).join("") + "</tr></thead><tbody>";
		for (var k = 8; k >= 0; k--) c += "<tr><td>" + P.CATS[k] + "</td>" + r.players.map(function (p) { var v = p.cats[k]; return "<td>" + (v ? (v < 0.001 ? "<0.1%" : pct(v)) : "–") + "</td>"; }).join("") + "</tr>";
		$("pk-oc-cats").innerHTML = c + "</tbody>";
		if (final) ocOuts(spec);
	}
	function ocOuts(spec) {
		var box = $("pk-oc-outs"), b = spec.board, h = "";
		if (b.length === 3 || b.length === 4) {
			var next = b.length === 3 ? "turn" : "river";
			if (spec.hands.every(function (x) { return x; })) {
				spec.hands.forEach(function (hd, i) {
					var o = P.outsVsKnown(spec.hands, b, spec.dead, i);
					if (!o || o.ahead) return;
					h += "<p><b>Player " + (i + 1) + "</b> is " + (o.tied ? "tied" : "behind") + " right now: " + (o.win.length ? o.win.length + " card" + (o.win.length > 1 ? "s" : "") + " on the " + next + " put them ahead: " + minis(o.win.map(function (x) { return x.card; })) : "no single " + next + " card puts them ahead") +
						(o.tie.length ? "; " + o.tie.length + " more make a tie: " + minis(o.tie.map(function (x) { return x.card; })) : "") + ".</p>";
				});
			} else {
				spec.hands.forEach(function (hd, i) {
					if (!hd) return;
					var o = P.outsImprove(hd, b);
					h += "<p><b>Player " + (i + 1) + "</b>: " + (o.cards.length ? o.cards.length + " card" + (o.cards.length > 1 ? "s" : "") + " improve the hand: " + o.groups.map(function (g) { return g.name + " " + minis(g.cards); }).join("; ") : "no cards make a better hand category") + ".</p>";
				});
			}
			if (h) h = '<div class="pk-outs"><h3 class="pk-h3" style="margin-top:0;">Outs on the ' + next + "</h3>" + h + "</div>";
		}
		box.innerHTML = h;
	}

	/* =====================================================================
	   HAND RANKINGS + CHART
	   ===================================================================== */
	var RK = [
		[8, "Royal flush", "Ah Kh Qh Jh Th", "A, K, Q, J, 10 of one suit.", "4", "0.0032%"],
		[8, "Straight flush", "9s 8s 7s 6s 5s", "Five in a row, all one suit.", "36", "0.028%"],
		[7, "Four of a kind", "Qc Qd Qh Qs 7d", "Four cards of the same rank.", "624", "0.17%"],
		[6, "Full house", "Kh Kd Ks 4c 4h", "Three of one rank plus a pair.", "3,744", "2.6%"],
		[5, "Flush", "Ad Jd 8d 6d 2d", "Any five of one suit; the highest card decides between flushes.", "5,108", "3.0%"],
		[4, "Straight", "Tc 9d 8h 7s 6c", "Five in a row, mixed suits.", "10,200", "4.6%"],
		[3, "Three of a kind", "7h 7c 7s Kd 2c", "Three cards of the same rank.", "54,912", "4.8%"],
		[2, "Two pair", "Jh Jc 5d 5s Ac", "Two different pairs.", "123,552", "23.5%"],
		[1, "One pair", "Td Th Ks 6c 3d", "Two cards of the same rank.", "1,098,240", "43.8%"],
		[0, "High card", "Ac Qd 9h 6s 3c", "Nothing else: the highest card plays.", "1,302,540", "17.4%"]
	];
	var rkBuilt = false, hmMode = "eq", hmSel = -1;
	function rkRender() {
		if (!rkBuilt) {
			rkBuilt = true;
			$("pk-rk").innerHTML = "<thead><tr><th>#</th><th>Hand</th><th>Example</th><th>5 cards</th><th>With 7 cards</th></tr></thead><tbody>" + RK.map(function (r, i) {
				return "<tr><td>" + (i + 1) + "</td><td><b>" + r[1] + "</b><br><span class=\"tu-note\">" + r[3] + '</span></td><td><span class="pk-ex">' + P.parseCards(r[2]).map(function (c) { return cardHTML(c); }).join("") + "</span></td><td>" + r[4] + "</td><td>" + r[5] + "</td></tr>";
			}).join("") + "</tbody>";
			segInit("pk-hm-mode", "eq", function (v) { hmMode = v; hmPaint(); });
			$("pk-hm").addEventListener("click", function (e) { var b = e.target.closest("button[data-i]"); if (b) { hmSel = +b.getAttribute("data-i"); hmPaint(); hmInfo(); } });
		}
		hmPaint();
	}
	function hmColor(e) {   // 0.30 .. 0.86 -> red .. yellow .. green
		var t = Math.max(0, Math.min(1, (e - 0.31) / 0.54));
		return "hsl(" + Math.round(t * 125) + ",68%," + (64 - 6 * Math.abs(t - 0.5)) + "%)";
	}
	function hmPaint() {
		var h = "";
		for (var i = 0; i < 169; i++) {
			var e = P.CHART[i] / 1000, lab = P.classLabel(i), sub = hmMode === "eq" ? (e * 100).toFixed(1) : "top " + Math.max(1, Math.round(P.classPercentile(i) * 100)) + "%";
			h += '<button type="button" role="gridcell" data-i="' + i + '" class="' + (i === hmSel ? "is-sel" : "") + '" style="background:' + hmColor(e) + '" aria-label="' + lab + ": " + (e * 100).toFixed(1) + '% against a random hand"><b>' + lab + "</b><small>" + sub + "</small></button>";
		}
		var el = $("pk-hm"); el.innerHTML = h; el.classList.toggle("is-top", hmMode === "top");
	}
	function hmInfo() {
		var i = hmSel, lab = P.classLabel(i), a = Math.floor(i / 13), b = i % 13, kind = a === b ? "a pocket pair" : a < b ? "suited" : "offsuit";
		var r1 = 12 - Math.min(a, b), r2 = 12 - Math.max(a, b), c1 = r1 * 4, c2 = a === b ? r1 * 4 + 1 : a < b ? r2 * 4 : r2 * 4 + 1;
		$("pk-hm-info").innerHTML = "<b>" + lab + "</b> (" + kind + ", " + P.classCombos(i) + " ways to be dealt it): wins <b>" + pct(P.CHART[i] / 1000) + "</b> against one random hand, in the top " + pct(P.classPercentile(i), 0) + " of starting hands. " +
			'<button type="button" class="tu-btn tu-btn--ghost pk-sm" id="pk-hm-try">Try it in the odds calculator</button>';
		$("pk-hm-try").addEventListener("click", function () {
			OC.players = [{ c: [c1, c2], r: false }, { c: [-1, -1], r: true }]; OC.board = [-1, -1, -1, -1, -1]; OC.dead = [-1, -1, -1, -1]; ocSel = { k: "b", i: 0, j: 0 }; save();
			setTab("odds", true);
		});
	}

	/* =====================================================================
	   STATS
	   ===================================================================== */
	function stRender() {
		var s = ST.stats, n = s.hands || 0, rate = function (a, b) { return b ? pct(a / b, 0) : "–"; };
		var tiles = [["Hands played", fmt(n), ""], ["Profit", (s.profitBB >= 0 ? "+" : "") + s.profitBB.toFixed(1) + " BB", n ? (s.profitBB / n * 100).toFixed(1) + " BB per 100 hands" : ""],
			["VPIP", rate(s.vpip, n), "hands you put chips in before the flop"], ["PFR", rate(s.pfr, n), "hands you raised before the flop"],
			["Won at showdown", rate(s.sdWon, s.sd), fmt(s.sd) + " showdowns"], ["Hands won", rate(s.won, n), fmt(s.won) + " hands"],
			["Biggest pot won", fmt(s.biggest), "play chips"], ["Best hand shown", s.best ? P.handName(s.best) : "–", s.bestCards ? minis(s.bestCards) : ""]];
		$("pk-st-tiles").innerHTML = tiles.map(function (t, i) { return '<div class="tu-stat' + (i === 1 ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + t[0] + '</div><div class="tu-stat__value">' + esc(t[1]) + '</div><div class="tu-stat__sub">' + t[2] + "</div></div>"; }).join("");
		// graph
		var c = [0].concat(s.cum), W = 640, H = 220, pl = 46, pr = 10, pt = 12, pb = 26;
		if (c.length < 2) $("pk-st-graph").innerHTML = '<p class="tu-note">Play a few hands to see your graph.</p>';
		else {
			var mn = Math.min.apply(null, c), mx = Math.max.apply(null, c); if (mx - mn < 10) { mx += 5; mn -= 5; }
			var X = function (i) { return pl + i / (c.length - 1) * (W - pl - pr); }, Y = function (v) { return pt + (mx - v) / (mx - mn) * (H - pt - pb); };
			var step = Math.max(1, Math.floor(c.length / 500)), d = "";
			for (var i = 0; i < c.length; i += step) d += (d ? "L" : "M") + X(i).toFixed(1) + "," + Y(c[i]).toFixed(1);
			d += "L" + X(c.length - 1).toFixed(1) + "," + Y(c[c.length - 1]).toFixed(1);
			var g = "";
			[mx, (mx + mn) / 2, mn].forEach(function (v) { g += '<line class="pk-gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Math.round(v) + "</text>"; });
			if (mn < 0 && mx > 0) g += '<line class="pk-gz" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
			g += '<text x="' + pl + '" y="' + (H - 6) + '">hand 1</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end">hand ' + fmt(s.hands) + "</text>";
			$("pk-st-graph").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Profit in big blinds over ' + s.hands + ' hands, now ' + s.profitBB.toFixed(1) + '">' + g + '<path class="pk-gp" d="' + d + '"/></svg>';
		}
		var order = ["BTN", "CO", "HJ", "LJ", "MP", "UTG+1", "UTG", "BB", "SB"], rows = "";
		order.forEach(function (k) { var p = s.pos[k]; if (!p) return; rows += "<tr><td>" + k + "</td><td>" + fmt(p.h) + "</td><td>" + pct(p.v / p.h, 0) + "</td><td>" + pct(p.w / p.h, 0) + "</td><td>" + (p.p >= 0 ? "+" : "") + p.p.toFixed(1) + "</td></tr>"; });
		$("pk-st-pos").innerHTML = rows ? "<thead><tr><th>Position</th><th>Hands</th><th>VPIP</th><th>Won</th><th>Profit (BB)</th></tr></thead><tbody>" + rows + "</tbody>" : "";
	}
	$("pk-st-reset").addEventListener("click", function () { if (!confirm("Reset all your poker stats?")) return; ST.stats = blankStats(); save(); stRender(); toast("Stats reset"); });

	/* ---------- start ---------- */
	var q = new URLSearchParams(location.search), qt = q.get("tab");
	if (q.get("h")) {   // shared odds link: ?tab=odds&h=AhAd-KsKc-r&b=2c7d9h&d=Kd
		var pl = q.get("h").split("-").slice(0, 9).map(function (x) { var cs = P.parseCards(x); return cs.length >= 2 ? { c: cs.slice(0, 2), r: false } : { c: [-1, -1], r: true }; });
		while (pl.length < 2) pl.push({ c: [-1, -1], r: true });
		var bd = P.parseCards(q.get("b") || "").slice(0, 5), dd = P.parseCards(q.get("d") || "").slice(0, 4), seen = {}, okq = true;
		pl.forEach(function (p) { p.c.forEach(function (c) { if (c >= 0) { if (seen[c]) okq = false; seen[c] = 1; } }); });
		bd.concat(dd).forEach(function (c) { if (seen[c]) okq = false; seen[c] = 1; });
		if (okq) { OC.players = pl; OC.board = [0, 1, 2, 3, 4].map(function (i) { return bd[i] !== undefined ? bd[i] : -1; }); OC.dead = [0, 1, 2, 3].map(function (i) { return dd[i] !== undefined ? dd[i] : -1; }); }
		qt = qt || "odds";
		try { history.replaceState(null, "", location.pathname + "?tab=odds"); } catch (e) { }
	}
	if (G) { G._show = false; if (G.over) G = ST.game = null; }
	setTab(qt || "play");
})();
