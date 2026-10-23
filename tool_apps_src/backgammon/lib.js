/* MES Backgammon engine (MESBG): board model, legal moves, scoring, odds and a computer opponent.
   Pure code: runs in the page, in a Web Worker and in node (tool_apps_src/backgammon-tests.js).

   Board: b = [b0, b1], one 26-slot array per side, each in that side's OWN numbering:
     a[1..24] = checkers on that side's point 1..24 (point 1 is the last point before bearing off),
     a[25]    = checkers on the bar, a[0] = checkers borne off.
   Side s's point k is the other side's point 25 - k.
   A step is [from, to, die, hit] in the mover's numbering (from 25 = bar, to 0 = off). */
(function (root) {
	"use strict";
	var BG = {};

	BG.newBoard = function () {
		var b = [];
		for (var s = 0; s < 2; s++) {
			var a = []; for (var i = 0; i < 26; i++) a.push(0);
			a[24] = 2; a[13] = 5; a[8] = 3; a[6] = 5;
			b.push(a);
		}
		return b;
	};
	BG.clone = function (b) { return [b[0].slice(), b[1].slice()]; };

	/* the 21 distinct rolls, larger die first, weight = ways out of 36 */
	BG.ROLLS = (function () {
		var r = [];
		for (var a = 1; a <= 6; a++) for (var c = a; c <= 6; c++) r.push({ d: [c, a], w: a === c ? 1 : 2 });
		return r;
	})();
	BG.diceList = function (d1, d2) { return d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]; };

	function pips(a) { var s = a[25] * 25; for (var k = 1; k <= 24; k++) s += a[k] * k; return s; }
	BG.pips = pips;

	/* where a checker on `from` goes with die d, or -1 when that is not allowed */
	function target(me, op, from, d) {
		if (me[from] <= 0) return -1;
		if (me[25] > 0 && from !== 25) return -1;            // checkers on the bar must come in first
		var to = from - d, k;
		if (to >= 1) return op[25 - to] >= 2 ? -1 : to;      // two or more of the other side = blocked
		for (k = 7; k <= 25; k++) if (me[k]) return -1;      // bearing off only with all 15 at home
		if (to === 0) return 0;
		for (k = from + 1; k <= 6; k++) if (me[k]) return -1; // a higher die only from the highest point
		return 0;
	}
	BG.target = target;

	function step(me, op, from, to) {
		me[from]--;
		if (to === 0) { me[0]++; return false; }
		var hit = false;
		if (op[25 - to] === 1) { op[25 - to] = 0; op[25]++; hit = true; }
		me[to]++;
		return hit;
	}

	/* every legal way to play the roll. canonical (used for doubles by the engine) only keeps one order of the
	   same moves: for doubles, playing from the highest point first is always possible, so nothing is lost. */
	function genAll(me, op, dice, canonical) {
		var out = [];
		function rec(m, o, ds, seq, lastFrom) {
			var any = false, seen = 0;
			for (var i = 0; i < ds.length; i++) {
				var d = ds[i];
				if (seen & (1 << d)) continue;
				seen |= 1 << d;
				var rest = ds.slice(0, i).concat(ds.slice(i + 1));
				var top = canonical ? lastFrom : 25;
				for (var from = top; from >= 1; from--) {
					if (!m[from]) continue;
					var to = target(m, o, from, d);
					if (to < 0) continue;
					any = true;
					var m2 = m.slice(), o2 = o.slice();
					var hit = step(m2, o2, from, to);
					rec(m2, o2, rest, seq.concat([[from, to, d, hit ? 1 : 0]]), from);
				}
			}
			if (!any) out.push({ s: seq, me: m, op: o });
		}
		rec(me, op, dice, [], 25);
		var max = 0, i;
		for (i = 0; i < out.length; i++) if (out[i].s.length > max) max = out[i].s.length;
		out = out.filter(function (x) { return x.s.length === max; });     // use as many dice as possible
		if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {      // only one can be played: the larger if it can
			var hi = Math.max(dice[0], dice[1]);
			if (out.some(function (x) { return x.s[0][2] === hi; })) out = out.filter(function (x) { return x.s[0][2] === hi; });
		}
		return out;
	}

	function orient(s, me, op) { return s === 0 ? [me, op] : [op, me]; }
	function key(me, op) { return me.join(",") + "/" + op.join(","); }

	/* all legal step orders (for the board UI: a step is allowed when it starts one of these) */
	BG.sequences = function (b, s, dice) {
		return genAll(b[s], b[1 - s], dice, false).map(function (x) { return x.s; });
	};
	/* distinct legal plays (different end positions) with one step order each */
	BG.plays = function (b, s, dice) {
		var all = genAll(b[s], b[1 - s], dice, dice.length === 4), seen = {}, out = [];
		for (var i = 0; i < all.length; i++) {
			var k = key(all[i].me, all[i].op);
			if (seen[k]) continue;
			seen[k] = 1;
			out.push({ s: all[i].s, b: orient(s, all[i].me, all[i].op) });
		}
		return out;
	};
	/* apply one step to a board (copy) */
	BG.applyStep = function (b, s, st) {
		var nb = BG.clone(b);
		var hit = step(nb[s], nb[1 - s], st[0], st[1]);
		return { b: nb, hit: hit };
	};
	BG.applySeq = function (b, s, seq) {
		var nb = BG.clone(b);
		for (var i = 0; i < seq.length; i++) step(nb[s], nb[1 - s], seq[i][0], seq[i][1]);
		return nb;
	};

	/* sanity check of a board: 15 each, no point shared, nothing negative */
	BG.valid = function (b) {
		for (var s = 0; s < 2; s++) {
			var t = 0;
			for (var k = 0; k < 26; k++) { if (b[s][k] < 0 || b[s][k] !== Math.floor(b[s][k])) return false; t += b[s][k]; }
			if (t !== 15) return false;
		}
		for (k = 1; k <= 24; k++) if (b[0][k] > 0 && b[1][25 - k] > 0) return false;
		return true;
	};

	/* 1 single, 2 gammon, 3 backgammon (before the cube) */
	BG.resultKind = function (b, winner) {
		var L = b[1 - winner];
		if (L[0] > 0) return 1;
		if (L[25] > 0) return 3;
		for (var k = 19; k <= 24; k++) if (L[k] > 0) return 3;       // still in the winner's home board
		return 2;
	};
	BG.winnerOf = function (b) { return b[0][0] === 15 ? 0 : b[1][0] === 15 ? 1 : -1; };

	/* "13/10 6/5*" style notation, chained moves merged (13/7, or 13/10 with a hit mark then /7), repeats counted ("8/5(2)") */
	BG.notation = function (seq) {
		if (!seq || !seq.length) return "no move";
		var mv = [];
		seq.forEach(function (st) {
			var m = null;
			for (var i = mv.length - 1; i >= 0; i--) if (mv[i].to === st[0] && mv[i].to > 0 && !mv[i].used) { m = mv[i]; break; }
			if (m) { m.path.push([st[1], st[3]]); m.to = st[1]; }
			else mv.push({ from: st[0], path: [[st[1], st[3]]], to: st[1] });
		});
		var nm = function (p) { return p === 25 ? "bar" : p === 0 ? "off" : String(p); };
		var strs = mv.map(function (m) {
			var s = nm(m.from);
			m.path.forEach(function (pt, i) {
				var last = i === m.path.length - 1;
				if (last || pt[1]) s += "/" + nm(pt[0]) + (pt[1] ? "*" : "");
			});
			return s;
		});
		var cnt = {}, order = [];
		strs.forEach(function (x) { if (!cnt[x]) { cnt[x] = 0; order.push(x); } cnt[x]++; });
		return order.map(function (x) { return x + (cnt[x] > 1 ? "(" + cnt[x] + ")" : ""); }).join(" ");
	};

	/* ---------- odds ---------- */

	/* rolls out of 36 that let `shooter` hit each blot of the other side (exact: real legal plays, blocks, the bar) */
	BG.hitOdds = function (b, shooter) {
		var tg = b[1 - shooter], blots = [], res = { any: 0, by: {} };
		for (var k = 1; k <= 24; k++) if (tg[k] === 1) { blots.push(k); res.by[k] = 0; }
		if (!blots.length) return res;
		BG.ROLLS.forEach(function (r) {
			var pl = BG.plays(b, shooter, BG.diceList(r.d[0], r.d[1])), anyHit = false;
			blots.forEach(function (k) {
				for (var i = 0; i < pl.length; i++) if (pl[i].b[1 - shooter][k] === 0) { res.by[k] += r.w; anyHit = true; return; }
			});
			if (anyHit) res.any += r.w;
		});
		return res;
	};
	/* a single checker shooting at a blot d pips away on an empty board: rolls out of 36 */
	BG.shotCount = function (d) {
		var n = 0;
		for (var a = 1; a <= 6; a++) for (var c = 1; c <= 6; c++) {
			if (a === c) { if (d % a === 0 && d / a <= 4) n++; }
			else if (d === a || d === c || d === a + c) n++;
		}
		return n;
	};
	BG.directCount = function (d) {            // only rolls that contain the number itself
		var n = 0;
		for (var a = 1; a <= 6; a++) for (var c = 1; c <= 6; c++) if (a === d || c === d) n++;
		return d <= 6 ? n : 0;
	};
	/* rolls out of 36 that bear off every checker of `a` (the other side has none on the board) */
	BG.bearOffCount = function (a) {
		var op = []; for (var i = 0; i < 26; i++) op.push(0); op[0] = 15;
		var me = a.slice(), n = 0;
		BG.ROLLS.forEach(function (r) {
			var pl = genAll(me, op, BG.diceList(r.d[0], r.d[1]), r.d[0] === r.d[1]);
			if (pl.some(function (x) { return x.me[0] === 15; })) n += r.w;
		});
		return n;
	};
	/* chance (out of 36) to bring a checker in from the bar against k closed points */
	BG.enterCount = function (k) { return 36 - k * k; };

	/* ---------- evaluation ---------- */

	var PV = [0, 1, 2, 3, 5, 7, 6, 5, 3, 2, 1.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 3, 5, 4, 2.5, 1.5, 1];
	var PRIME = [0, 0, 1, 2, 4, 7, 12];

	function homeMade(a) { var n = 0; for (var k = 1; k <= 6; k++) if (a[k] >= 2) n++; return n; }
	function backMost(a) { if (a[25]) return 25; for (var k = 24; k >= 1; k--) if (a[k]) return k; return 0; }
	function hasContact(me, op) { return backMost(me) + backMost(op) > 25; }
	BG.hasContact = function (b) { return hasContact(b[0], b[1]); };

	/* expected cost (in pips) of `me`'s blots being hit on `op`'s next roll: an approximation that counts blocks */
	function blotRisk(me, op) {
		var blots = [], k, j;
		for (k = 1; k <= 24; k++) if (me[k] === 1) blots.push(k);
		if (!blots.length) return 0;
		var sh = [];
		if (op[25] > 0) sh.push(25);
		else for (j = 24; j >= 1; j--) if (op[j]) sh.push(j);
		if (op[25] >= 2) sh = [25];
		var oh = homeMade(op), total = 0;
		function blocked(x) { return x >= 1 && x <= 24 && me[25 - x] >= 2; }
		function reach(jj, dist, a, c) {
			if (a === c) {
				if (dist % a !== 0 || dist / a > 4) return false;
				for (var i = 1; i < dist / a; i++) if (blocked(jj - a * i)) return false;
				return true;
			}
			if (dist === a || dist === c) return true;
			if (dist === a + c) return !blocked(jj - a) || !blocked(jj - c);
			return false;
		}
		for (var r = 0; r < BG.ROLLS.length; r++) {
			var a = BG.ROLLS[r].d[0], c = BG.ROLLS[r].d[1];
			if (op[25] > 0 && blocked(25 - a) && blocked(25 - c)) continue;     // the other side cannot even come in
			var best = 0;
			for (var bi = 0; bi < blots.length; bi++) {
				k = blots[bi];
				var t = 25 - k, val = (25 - k) * 0.6 + 5 + 2.5 * oh;
				if (val <= best) continue;
				for (var si = 0; si < sh.length; si++) {
					j = sh[si];
					if (j <= t) continue;
					if (reach(j, j - t, a, c)) { best = val; break; }
				}
			}
			total += best * BG.ROLLS[r].w;
		}
		return total / 36;
	}

	function primeTerm(me, op) {
		var best = 0, run = 0, lo = 0, bestLo = 0;
		for (var k = 1; k <= 24; k++) {
			if (me[k] >= 2) { if (!run) lo = k; run++; if (run > best) { best = run; bestLo = lo; } }
			else run = 0;
		}
		if (best < 2) return 0;
		var trapped = op[25];                     // the other side's checkers behind the prime
		for (var j = 1; j <= 24; j++) if (op[j] && 25 - j < bestLo) trapped += op[j];
		if (!trapped) return 0;
		return PRIME[Math.min(best, 6)] * Math.min(trapped, 3) / 2;
	}

	function sideTerm(me, op) {
		var s = 0, k;
		for (k = 1; k <= 24; k++) {
			if (me[k] >= 2) s += PV[k];
			if (me[k] > 3) s -= 0.7 * (me[k] - 3);
		}
		s += primeTerm(me, op);
		var hm = homeMade(me);
		if (op[25] > 0) { s += op[25] * (3 + 2.5 * hm); if (hm === 6) s += 15; }
		return s;
	}

	/* chance that `me` wins, with `op` to roll next */
	function evaluate(me, op) {
		if (me[0] === 15) return 1;
		if (op[0] === 15) return 0;
		var mp = pips(me), opp = pips(op);
		var sd = 0.9 * Math.sqrt(mp + opp) + 1;
		var S = opp - mp - 4, k = 1.7;
		if (hasContact(me, op)) {
			k = 1.15;                              // contact positions are less certain than a pure race
			S += sideTerm(me, op) - sideTerm(op, me);
			S -= blotRisk(me, op);
			S += 0.25 * blotRisk(op, me);
			if (me[0] === 0 && op[0] > 0) S -= 0.5 * op[0];
		} else {
			var w = 0;                             // a little for awkward stacks low in the home board
			for (var k = 1; k <= 3; k++) if (me[k] > 2) w += (me[k] - 2) * (4 - k) * 0.25;
			S -= w;
		}
		return 1 / (1 + Math.exp(-k * S / sd));
	}
	BG.evaluate = function (b, s) { return evaluate(b[s], b[1 - s]); };

	/* ---------- computer opponent ---------- */

	BG.rng = function (seed) {                     // mulberry32, for tests and repeatable games
		var t = seed >>> 0;
		return function () {
			t = (t + 0x6D2B79F5) >>> 0;
			var x = Math.imul(t ^ (t >>> 15), 1 | t);
			x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
			return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
		};
	};

	function bestStatic(pl, s) {
		var best = -1, bi = 0;
		for (var i = 0; i < pl.length; i++) {
			var v = evaluate(pl[i].b[s], pl[i].b[1 - s]);
			pl[i].v = v;
			if (v > best) { best = v; bi = i; }
		}
		return bi;
	}

	/* the value of a position for s when the other side is about to roll, looking one roll ahead */
	function onePly(b, s) {
		var o = 1 - s, tot = 0;
		if (b[s][0] === 15) return 1;
		for (var r = 0; r < BG.ROLLS.length; r++) {
			var R = BG.ROLLS[r], pl = BG.plays(b, o, BG.diceList(R.d[0], R.d[1])), best = -1;
			for (var i = 0; i < pl.length; i++) {
				var v = evaluate(pl[i].b[o], pl[i].b[s]);
				if (v > best) best = v;
				if (best >= 1) break;
			}
			tot += (1 - best) * R.w;
		}
		return tot / 36;
	}

	/* pick a play: level "easy" | "medium" | "hard" */
	BG.choosePlay = function (b, s, dice, level, rnd) {
		rnd = rnd || Math.random;
		var pl = BG.plays(b, s, dice);
		if (!pl.length || (pl.length === 1)) return pl[0] || { s: [], b: BG.clone(b) };
		if (level === "easy") {
			if (rnd() < 0.2) return pl[Math.floor(rnd() * pl.length)];
			var bi = -1, bv = -9;
			pl.forEach(function (p, i) {
				var v = evaluate(p.b[s], p.b[1 - s]) + (rnd() - 0.5) * 0.07;
				if (v > bv) { bv = v; bi = i; }
			});
			return pl[bi];
		}
		var idx = bestStatic(pl, s);
		if (level !== "hard") return pl[idx];
		if (!hasContact(pl[idx].b[s], pl[idx].b[1 - s]) && !hasContact(b[s], b[1 - s])) return pl[idx];   // a race: pips decide
		var cand = pl.slice().sort(function (x, y) { return y.v - x.v; }).slice(0, 10), top = cand[0], tv = -1;
		cand.forEach(function (p) {
			var v = onePly(p.b, s);
			p.v1 = v;
			if (v > tv) { tv = v; top = p; }
		});
		return top;
	};

	/* chance s wins when s is about to roll */
	BG.winProbOnRoll = function (b, s, level) {
		if (level === "hard") {
			var tot = 0;
			BG.ROLLS.forEach(function (R) {
				var pl = BG.plays(b, s, BG.diceList(R.d[0], R.d[1]));
				var i = bestStatic(pl, s);
				tot += (pl.length ? pl[i].v : evaluate(b[s], b[1 - s])) * R.w;
			});
			return tot / 36;
		}
		return 1 - evaluate(b[1 - s], b[s]);
	};

	/* rough chance that the side ahead wins a gammon: used only to spot "too good to double" */
	function gammonish(b, s) {
		var op = b[1 - s];
		if (op[0] > 0) return false;
		var out = op[25];
		for (var k = 7; k <= 24; k++) out += op[k];
		return out >= 4 || op[25] >= 2;
	}

	/* cube: ctx = {level, cube:{v, owner}, match:{to, score, crawford}} */
	BG.canDouble = function (s, ctx) {
		var c = ctx.cube, m = ctx.match || { to: 0 };
		if (ctx.noCube) return false;
		if (c.owner !== -1 && c.owner !== s) return false;
		if (c.v >= 64) return false;
		if (m.to > 0) {
			if (m.crawford) return false;
			if (m.score[s] + c.v >= m.to) return false;            // the cube is dead: already enough to win the match
		}
		return true;
	};
	BG.shouldDouble = function (b, s, ctx) {
		if (!BG.canDouble(s, ctx)) return false;
		var m = ctx.match || { to: 0 }, lv = ctx.level;
		if (m.to > 0 && !m.crawford && m.postCrawford && m.score[s] < m.score[1 - s]) return true;  // trailer after Crawford: double at once
		if (lv === "easy") {
			var pe = 1 - evaluate(b[1 - s], b[s]);
			return pe > 0.8 && (ctx.rnd || Math.random)() < 0.5;
		}
		var p = BG.winProbOnRoll(b, s, lv);
		if (p < 0.70) return false;            // the usual money-game doubling window starts near 70%
		if (p > 0.9 && gammonish(b, s) && m.to === 0 && !ctx.jacoby) return false;  // too good: play on for a gammon
		return true;
	};
	BG.shouldTake = function (b, taker, ctx) {
		var m = ctx.match || { to: 0 };
		if (m.to > 0 && m.postCrawford && m.score[taker] > m.score[1 - taker]) return true;
		var p = 1 - BG.winProbOnRoll(b, 1 - taker, ctx.level === "easy" ? "medium" : ctx.level);
		var need = ctx.level === "easy" ? 0.2 : 0.25;
		if (gammonish(b, 1 - taker) && p < 0.3) need += 0.04;
		return p >= need;
	};

	if (typeof module !== "undefined" && module.exports) module.exports = BG;
	root.MESBG = BG;
})(typeof self !== "undefined" ? self : this);
