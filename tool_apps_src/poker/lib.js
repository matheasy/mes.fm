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
