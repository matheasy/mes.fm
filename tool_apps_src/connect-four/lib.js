/* MES Connect Four: rules of every variant + the computer opponent + the Hive game protocol.
   Pure code: runs in the page, in a Web Worker (the computer's thinking), in node (tool_apps_src/connect-four-tests.js)
   and on the server (a byte-identical copy at mes.fm/api/_c4-lib.js checks online moves: cp after editing).

   A game is described by a config {w, h, k, pop, mis, np}:
     w x h board (columns x rows), k in a row wins, pop = Pop Out (you may pop one of your own discs out of the bottom row
     instead of dropping one), mis = misere (making a line LOSES), np = 2 or 3 players.
   Configs travel as short codes (cfgCode / parseCode): "C7x6k4", "C7x6k4p" (Pop Out), "C7x6k4m" (misere), "C9x7k4t" (three players).
   Moves travel as strings: "3" = drop in column 3 (0-based), "p3" = pop the bottom disc of column 3.
   Cells: index y * w + x with y = 0 the TOP row; -1 = empty, else the player (0 = red, 1 = yellow, 2 = green). */
(function (root) {
	"use strict";
	var C = {};

	/* ---------- variants ---------- */
	C.PRESETS = [
		{ id: "classic", code: "C7x6k4", name: "Classic Connect Four (7 × 6)", group: "Classic", desc: "Drop discs into the 7 columns; the first to get four in a row across, up and down or diagonally wins." },
		{ id: "popout", code: "C7x6k4p", name: "Pop Out", group: "Classic", desc: "On your turn either drop a disc or pop one of your own discs out of the bottom row; everything above it falls down one row." },
		{ id: "misere", code: "C7x6k4m", name: "Misère (avoid four)", group: "Classic", desc: "The reverse game: whoever makes four in a row of their own colour LOSES." },
		{ id: "c3", code: "C5x4k3", name: "Connect 3 (5 × 4)", group: "Other lines", desc: "A small, quick game for beginners: three in a row on a 5 × 4 board." },
		{ id: "c5", code: "C9x6k5", name: "Connect 5 (9 × 6)", group: "Other lines", desc: "Five in a row on a wider 9 × 6 board: more room for double threats." },
		{ id: "c6", code: "C12x10k6", name: "Connect 6 (12 × 10)", group: "Other lines", desc: "Six in a row on a big 12 × 10 board. Long games with lots of planning." },
		{ id: "6x5", code: "C6x5k4", name: "Four in a row, 6 × 5", group: "Board sizes", desc: "A smaller board: fewer columns, faster games." },
		{ id: "8x7", code: "C8x7k4", name: "Four in a row, 8 × 7", group: "Board sizes", desc: "One column and one row more than the classic board." },
		{ id: "9x7", code: "C9x7k4", name: "Four in a row, 9 × 7", group: "Board sizes", desc: "A wide board where the classic tricks no longer work the same way." },
		{ id: "10x8", code: "C10x8k4", name: "Four in a row, 10 × 8", group: "Board sizes", desc: "A big board for long games of four in a row." },
		{ id: "three", code: "C9x7k4t", name: "Three players (9 × 7)", group: "Three players", desc: "Red, yellow and green take turns on a 9 × 7 board; four in a row wins. Pass and play on one device." }
	];
	C.preset = function (id) { for (var i = 0; i < C.PRESETS.length; i++) if (C.PRESETS[i].id === id) return C.PRESETS[i]; return null; };
	C.presetByCode = function (code) { for (var i = 0; i < C.PRESETS.length; i++) if (C.PRESETS[i].code === code) return C.PRESETS[i]; return null; };
	C.LIMITS = { w: [4, 12], h: [4, 10], k: [3, 7] };
	C.MAX_POP_MOVES = 300;           // Pop Out: a game this long is a draw (and so is the same position three times)

	C.cfgCode = function (c) { return "C" + c.w + "x" + c.h + "k" + c.k + (c.pop ? "p" : "") + (c.mis ? "m" : "") + (c.np === 3 ? "t" : ""); };
	/** short code (or a preset id) -> config, or null when it is not a valid game */
	C.parseCode = function (s) {
		s = String(s || "");
		var p = C.preset(s);
		if (p) s = p.code;
		var m = /^C(\d{1,2})x(\d{1,2})k(\d)(p?)(m?)(t?)$/.exec(s);
		if (!m) return null;
		var c = { w: +m[1], h: +m[2], k: +m[3], pop: !!m[4], mis: !!m[5], np: m[6] ? 3 : 2 };
		var L = C.LIMITS;
		if (c.w < L.w[0] || c.w > L.w[1] || c.h < L.h[0] || c.h > L.h[1] || c.k < L.k[0] || c.k > L.k[1]) return null;
		if (c.k > Math.max(c.w, c.h)) return null;
		if (c.np === 3 && (c.pop || c.mis)) return null;
		if (c.pop && c.mis) return null;
		return c;
	};
	C.describe = function (c) {
		var p = C.presetByCode(C.cfgCode(c));
		if (p) return p.name;
		var x = [];
		if (c.pop) x.push("Pop Out");
		if (c.mis) x.push("misère");
		if (c.np === 3) x.push("3 players");
		return c.w + " × " + c.h + ", " + c.k + " in a row" + (x.length ? " (" + x.join(", ") + ")" : "");
	};
	C.COLORS = ["Red", "Yellow", "Green"];
	C.playerName = function (c, p) { return C.COLORS[p] || "?"; };

	/* ---------- geometry ---------- */
	var geoCache = {};
	/** every winning window of a board (cells listed in order along the line) */
	function geo(c) {
		var key = c.w + "x" + c.h + "k" + c.k;
		if (geoCache[key]) return geoCache[key];
		var w = c.w, h = c.h, k = c.k, dirs = [[1, 0], [0, 1], [1, 1], [1, -1]], wins = [], cellWins = [], N = w * h;
		for (var i = 0; i < N; i++) cellWins.push([]);
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) for (var q = 0; q < 4; q++) {
			var D = dirs[q], ex = x + D[0] * (k - 1), ey = y + D[1] * (k - 1);
			if (ex < 0 || ex >= w || ey < 0 || ey >= h) continue;
			var win = [];
			for (var j = 0; j < k; j++) win.push((y + D[1] * j) * w + x + D[0] * j);
			for (j = 0; j < k; j++) cellWins[win[j]].push(wins.length);
			wins.push(win);
		}
		var flat = new Int16Array(wins.length * k);
		for (var a = 0; a < wins.length; a++) for (var b = 0; b < k; b++) flat[a * k + b] = wins[a][b];
		// columns from the middle out (good move order for the search)
		var order = [];
		for (var e = 0; e < w; e++) order.push(e);
		order.sort(function (a, b) { return Math.abs(a - (w - 1) / 2) - Math.abs(b - (w - 1) / 2) || a - b; });
		return (geoCache[key] = { w: w, h: h, k: k, N: N, wins: wins, flat: flat, cellWins: cellWins, order: order });
	}
	C.geo = geo;
	var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
	/** the longest run of player v through cell i if it is at least k long (cells in order), else null */
	function runThrough(cells, c, i, v) {
		var best = null, x0 = i % c.w, y0 = (i / c.w) | 0;
		for (var q = 0; q < 4; q++) {
			var D = DIRS[q], run = [i];
			for (var sgn = -1; sgn <= 1; sgn += 2) {
				var x = x0, y = y0;
				for (;;) {
					x += D[0] * sgn; y += D[1] * sgn;
					if (x < 0 || x >= c.w || y < 0 || y >= c.h) break;
					var j = y * c.w + x;
					if (cells[j] !== v) break;
					if (sgn < 0) run.unshift(j); else run.push(j);
				}
			}
			if (run.length >= c.k && (!best || run.length > best.length)) best = run;
		}
		return best;
	}
	C.runThrough = runThrough;

	/* ---------- state ---------- */
	/** new game. State: cells, hts (discs per column), turn, hist (move strings), win {p (-1 draw), line, lines, why}, last (cell or -1) */
	C.create = function (c) {
		var s = { c: c, cells: [], hts: [], turn: 0, hist: [], win: null, last: -1, lastPop: -1 };
		for (var i = 0; i < c.w * c.h; i++) s.cells.push(-1);
		for (var x = 0; x < c.w; x++) s.hts.push(0);
		if (c.pop) s.rep = {};
		return s;
	};
	C.clone = function (s) {
		var r = { c: s.c, cells: s.cells.slice(), hts: s.hts.slice(), turn: s.turn, hist: s.hist.slice(), win: s.win, last: s.last, lastPop: s.lastPop };
		if (s.rep) { r.rep = {}; for (var k in s.rep) r.rep[k] = s.rep[k]; }
		return r;
	};

	/* ---------- moves ---------- */
	C.mstr = function (m) { return (m.t === "p" ? "p" : "") + m.x; };
	C.mparse = function (str) { var r = /^(p?)(\d{1,2})$/.exec(String(str)); return r ? { t: r[1] ? "p" : "d", x: +r[2] } : null; };
	/** the cell a disc dropped in column x lands on (-1 when the column is full) */
	C.dropCell = function (s, x) { var c = s.c; return s.hts[x] >= c.h ? -1 : (c.h - 1 - s.hts[x]) * c.w + x; };
	C.canPop = function (s, x) { var c = s.c; return !!c.pop && s.hts[x] > 0 && s.cells[(c.h - 1) * c.w + x] === s.turn; };
	/** every legal move of the player to move */
	C.legal = function (s) {
		if (s.win) return [];
		var c = s.c, out = [], x;
		for (x = 0; x < c.w; x++) if (s.hts[x] < c.h) out.push({ t: "d", x: x });
		if (c.pop) for (x = 0; x < c.w; x++) if (C.canPop(s, x)) out.push({ t: "p", x: x });
		return out;
	};
	C.isLegal = function (s, m) {
		if (!m || s.win || m.x < 0 || m.x >= s.c.w) return false;
		return m.t === "p" ? C.canPop(s, m.x) : s.hts[m.x] < s.c.h;
	};
	function full(s) { for (var x = 0; x < s.c.w; x++) if (s.hts[x] < s.c.h) return false; return true; }
	function repKey(s) { return s.turn + ":" + s.cells.join(""); }

	/** play move m on s IN PLACE (no legality check); sets s.win when the game ends */
	C.apply = function (s, m) {
		var c = s.c, p = s.turn, x = m.x, i, ln;
		s.hist.push(C.mstr(m));
		if (m.t !== "p") {
			i = (c.h - 1 - s.hts[x]) * c.w + x;
			s.cells[i] = p; s.hts[x]++; s.last = i; s.lastPop = -1;
			ln = runThrough(s.cells, c, i, p);
			if (ln) s.win = c.mis ? { p: 1 - p, line: ln, lines: [ln], why: "line-lose", by: p } : { p: p, line: ln, lines: [ln], why: "line" };
		} else {
			for (var y = c.h - 1; y > 0; y--) s.cells[y * c.w + x] = s.cells[(y - 1) * c.w + x];
			s.cells[x] = -1; s.hts[x]--; s.last = -1; s.lastPop = x;
			// a pop moves a whole column: look for lines through every disc of it, for both players
			var lines = [[], []];
			for (var yy = c.h - s.hts[x]; yy < c.h; yy++) {
				var j = yy * c.w + x, v = s.cells[j], r = runThrough(s.cells, c, j, v);
				if (r && !lines[v].some(function (l) { return l.join() === r.join(); })) lines[v].push(r);
			}
			if (lines[p].length) s.win = { p: p, line: lines[p][0], lines: lines[p].concat(lines[1 - p]), why: lines[1 - p].length ? "pop-both" : "line" };
			else if (lines[1 - p].length) s.win = { p: 1 - p, line: lines[1 - p][0], lines: lines[1 - p], why: "pop-gift" };
		}
		s.turn = (p + 1) % c.np;
		if (!s.win) {
			if (!c.pop) { if (full(s)) s.win = { p: -1, line: null, lines: [], why: "full" }; }
			else {
				var key = repKey(s);
				s.rep[key] = (s.rep[key] || 0) + 1;
				if (s.rep[key] >= 3) s.win = { p: -1, line: null, lines: [], why: "repeat" };
				else if (s.hist.length >= C.MAX_POP_MOVES) s.win = { p: -1, line: null, lines: [], why: "long" };
				else if (!C.legal(s).length) s.win = { p: -1, line: null, lines: [], why: "stuck" };
			}
		}
		return s;
	};
	C.play = function (s, m) { return C.apply(C.clone(s), m); };
	/** replay move strings from a fresh game; null if any move is illegal */
	C.replay = function (c, moves) {
		var s = C.create(c);
		for (var i = 0; i < moves.length; i++) {
			var m = C.mparse(moves[i]);
			if (!C.isLegal(s, m)) return null;
			C.apply(s, m);
		}
		return s;
	};

	/* ---------- random numbers (seedable, so tests repeat) ---------- */
	function rng(seed) {
		if (seed === undefined) return Math.random;
		var a = seed >>> 0;
		return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}
	C.rng = rng;
	function now() { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }

	/* ---------- the search engine ----------
	   A fast in-place copy of the position (typed arrays, Zobrist hash, transposition table). Values are from the point of view of
	   one player ("me"): the computer's turns maximise, everybody else's minimise (with three players that is "paranoid" search:
	   it assumes the other two play against it). WIN - ply = a win found ply moves from the root. */
	var WIN = 1000000;
	C.WIN = WIN;
	var ZB = {};
	function zobrist(n) {
		if (ZB[n]) return ZB[n];
		var r = rng(0xC4C4 + n), a = new Int32Array(n * 2), t = new Int32Array(6);
		for (var i = 0; i < a.length; i++) a[i] = (r() * 4294967296) | 0;
		for (i = 0; i < 6; i++) t[i] = (r() * 4294967296) | 0;
		return (ZB[n] = { a: a, b: new Int32Array(a.length).map(function () { return (r() * 4294967296) | 0; }), t: t });
	}
	var TT_BITS = 19, TT_N = 1 << TT_BITS, TT_MASK = TT_N - 1, ttCache = null;
	function newTT() {
		if (!ttCache) ttCache = { chk: new Int32Array(TT_N), val: new Int32Array(TT_N), dep: new Int8Array(TT_N), flg: new Int8Array(TT_N), mv: new Int8Array(TT_N) };
		ttCache.flg.fill(0);
		return ttCache;
	}
	function Engine(s) {
		var c = s.c, g = geo(c);
		this.c = c; this.g = g; this.w = c.w; this.h = c.h; this.k = c.k; this.np = c.np;
		this.b = new Int8Array(s.cells); this.hts = new Int8Array(s.hts); this.turn = s.turn;
		this.z = zobrist(c.w * c.h * 3);
		this.lo = 0; this.hi = 0;
		for (var i = 0; i < this.b.length; i++) if (this.b[i] >= 0) this.xorCell(i, this.b[i]);
		this.lo ^= this.z.t[this.turn]; this.hi ^= this.z.t[this.turn + 3];
		this.nodes = 0;
	}
	Engine.prototype.xorCell = function (i, v) { var k = i * 3 + v; this.lo ^= this.z.a[k]; this.hi ^= this.z.b[k]; };
	Engine.prototype.nextTurn = function (t) { this.lo ^= this.z.t[this.turn]; this.hi ^= this.z.t[this.turn + 3]; this.turn = t; this.lo ^= this.z.t[t]; this.hi ^= this.z.t[t + 3]; };
	/** does player v have k in a row through cell i? */
	Engine.prototype.lineAt = function (i, v) {
		var w = this.w, h = this.h, k = this.k, b = this.b, x0 = i % w, y0 = (i / w) | 0;
		for (var q = 0; q < 4; q++) {
			var dx = DIRS[q][0], dy = DIRS[q][1], n = 1, x = x0 + dx, y = y0 + dy;
			while (x >= 0 && x < w && y >= 0 && y < h && b[y * w + x] === v) { n++; x += dx; y += dy; }
			x = x0 - dx; y = y0 - dy;
			while (x >= 0 && x < w && y >= 0 && y < h && b[y * w + x] === v) { n++; x -= dx; y -= dy; }
			if (n >= k) return true;
		}
		return false;
	};
	/** play a move; returns the outcome code: -2 nothing, -1 draw, else the winner. undo info is pushed on this.stack */
	Engine.prototype.make = function (t, x) {
		var w = this.w, h = this.h, p = this.turn, res = -2, i;
		if (t === 0) {
			i = (h - 1 - this.hts[x]) * w + x;
			this.b[i] = p; this.hts[x]++; this.xorCell(i, p);
			if (this.lineAt(i, p)) res = this.c.mis ? 1 - p : p;
			this.nextTurn((p + 1) % this.np);
			if (res === -2 && !this.c.pop && this.isFull()) res = -1;
			return res;
		}
		// pop: remember the column, shift it down, look for lines of both players
		var col = [], y;
		for (y = 0; y < h; y++) { col.push(this.b[y * w + x]); if (this.b[y * w + x] >= 0) this.xorCell(y * w + x, this.b[y * w + x]); }
		(this.popStack || (this.popStack = [])).push(col);
		for (y = h - 1; y > 0; y--) this.b[y * w + x] = this.b[(y - 1) * w + x];
		this.b[x] = -1; this.hts[x]--;
		var mine = false, theirs = false;
		for (y = h - this.hts[x]; y < h; y++) { i = y * w + x; var v = this.b[i]; this.xorCell(i, v); if (this.lineAt(i, v)) { if (v === p) mine = true; else theirs = true; } }
		this.nextTurn((p + 1) % this.np);
		return mine ? p : theirs ? 1 - p : -2;
	};
	Engine.prototype.unmake = function (t, x, prevTurn) {
		var w = this.w, h = this.h, y, i;
		this.nextTurn(prevTurn);
		if (t === 0) {
			this.hts[x]--; i = (h - 1 - this.hts[x]) * w + x;
			this.xorCell(i, this.b[i]); this.b[i] = -1;
			return;
		}
		var col = this.popStack.pop();
		for (y = 0; y < h; y++) { i = y * w + x; if (this.b[i] >= 0) this.xorCell(i, this.b[i]); this.b[i] = col[y]; if (col[y] >= 0) this.xorCell(i, col[y]); }
		this.hts[x]++;
	};
	Engine.prototype.isFull = function () { for (var x = 0; x < this.w; x++) if (this.hts[x] < this.h) return false; return true; };
	/** legal moves as numbers: column x = drop, 100 + x = pop; middle columns first */
	Engine.prototype.moves = function () {
		var out = [], o = this.g.order, x, h = this.h, w = this.w;
		for (var j = 0; j < o.length; j++) { x = o[j]; if (this.hts[x] < h) out.push(x); }
		if (this.c.pop) for (j = 0; j < o.length; j++) { x = o[j]; if (this.hts[x] > 0 && this.b[(h - 1) * w + x] === this.turn) out.push(100 + x); }
		return out;
	};
	/** static value of the position for player me */
	Engine.prototype.evaluate = function (me) {
		var g = this.g, f = g.flat, k = this.k, b = this.b, np = this.np, sc = 0, w = this.w, h = this.h, nw = g.wins.length;
		var cnt = [0, 0, 0], par = np === 2 && !this.c.pop && !this.c.mis;
		for (var q = 0; q < nw; q++) {
			cnt[0] = cnt[1] = cnt[2] = 0;
			var base = q * k, empty = -1;
			for (var j = 0; j < k; j++) { var v = b[f[base + j]]; if (v >= 0) cnt[v]++; else empty = f[base + j]; }
			var who = -1, n = 0, many = 0;
			for (var p = 0; p < np; p++) if (cnt[p]) { many++; who = p; n = cnt[p]; }
			if (many !== 1) continue;
			var val = n === k - 1 ? 60 : n === k - 2 ? 10 : 2;
			if (n === k - 1 && par) {
				// threat on an odd row (counted from the bottom) helps the first player, on an even row the second (Allis)
				var row = h - ((empty / w) | 0);
				if ((row % 2 === 1) === (who === 0)) val += 40;
			}
			sc += who === me ? val : -val;
		}
		// a little for discs in the middle columns
		var mid = (w - 1) / 2;
		for (var i = 0; i < b.length; i++) if (b[i] >= 0) { var cv = 3 - Math.min(3, Math.abs((i % w) - mid)) ; sc += b[i] === me ? cv : -cv; }
		return this.c.mis ? -sc : sc;
	};

	/** alpha-beta from me's point of view; throws "time" when the budget runs out */
	function ab(E, depth, alpha, beta, ply, me, ctx) {
		if ((++E.nodes & 1023) === 0 && now() > ctx.stop) throw "time";
		var tt = ctx.tt, idx = E.lo & TT_MASK, a0 = alpha, b0 = beta, best = -1, tv;
		if (tt.flg[idx] && tt.chk[idx] === E.hi) {
			best = tt.mv[idx];
			if (tt.dep[idx] >= depth) {
				tv = tt.val[idx];
				if (tv > WIN - 1000) tv -= ply; else if (tv < -WIN + 1000) tv += ply;
				var fl = tt.flg[idx];
				if (fl === 1) return tv;
				if (fl === 2 && tv >= beta) return tv;
				if (fl === 3 && tv <= alpha) return tv;
			}
		}
		if (depth <= 0) return E.evaluate(me);
		var M = E.moves();
		if (!M.length) return 0;
		var maxi = E.turn === me, pt = E.turn, val = maxi ? -Infinity : Infinity, bestM = M[0];
		// quick win: a drop that wins at once for the player to move (not in misere / pop, where it is less simple)
		if (!E.c.mis) for (var a = 0; a < M.length; a++) {
			var mv0 = M[a]; if (mv0 >= 100) continue;
			var i0 = (E.h - 1 - E.hts[mv0]) * E.w + mv0;
			E.b[i0] = pt; var wn = E.lineAt(i0, pt); E.b[i0] = -1;
			if (wn) return pt === me ? WIN - ply - 1 : -(WIN - ply - 1);
		}
		if (best >= 0) { var bi = M.indexOf(best); if (bi > 0) { M.splice(bi, 1); M.unshift(best); } }
		var kl = ctx.killer[ply];
		if (kl !== undefined && kl !== best) { var ki = M.indexOf(kl); if (ki > 0) { M.splice(ki, 1); M.splice(best >= 0 ? 1 : 0, 0, kl); } }
		for (var m = 0; m < M.length; m++) {
			var mv = M[m], t = mv >= 100 ? 1 : 0, x = mv % 100, v;
			var res = E.make(t, x);
			if (res === -2) v = ab(E, depth - 1, alpha, beta, ply + 1, me, ctx);
			else v = res === -1 ? 0 : res === me ? WIN - ply - 1 : -(WIN - ply - 1);
			E.unmake(t, x, pt);
			if (maxi) { if (v > val) { val = v; bestM = mv; } if (val > alpha) alpha = val; }
			else { if (v < val) { val = v; bestM = mv; } if (val < beta) beta = val; }
			if (alpha >= beta) { ctx.killer[ply] = mv; break; }
		}
		// store (mate scores relative to this node)
		var sv = val; if (sv > WIN - 1000) sv += ply; else if (sv < -WIN + 1000) sv -= ply;
		tt.chk[idx] = E.hi; tt.val[idx] = sv; tt.dep[idx] = depth; tt.mv[idx] = bestM;
		tt.flg[idx] = val <= a0 ? 3 : val >= b0 ? 2 : 1;
		return val;
	}
	/** values of every root move by iterative deepening. opts: {ms, maxDepth, full (exact value of every move, for analysis)} */
	function rootSearch(s, opts) {
		var E = new Engine(s), me = s.turn, ctx = { stop: now() + (opts.ms || 1000), tt: newTT(), killer: [] };
		var M = E.moves(), done = null, depth, maxD = opts.maxDepth || 99;
		var empty = 0; for (var i = 0; i < E.b.length; i++) if (E.b[i] < 0) empty++;
		var limit = s.c.pop ? 60 : empty;
		try {
			for (depth = 1; depth <= Math.min(maxD, limit); depth++) {
				var vals = [], alpha = -Infinity;
				for (var j = 0; j < M.length; j++) {
					var mv = M[j], t = mv >= 100 ? 1 : 0, x = mv % 100, v;
					var res = E.make(t, x);
					if (res === -2) {
						v = ab(E, depth - 1, opts.full ? -Infinity : alpha, Infinity, 1, me, ctx);
						if (!opts.full && j > 0 && v <= alpha) v -= 0.5;     // only an upper bound: never tie with the best move
					} else v = res === -1 ? 0 : res === me ? WIN - 1 : -(WIN - 1);
					E.unmake(t, x, me);
					vals.push({ mv: mv, v: v });
					if (v > alpha) alpha = v;
				}
				// without "full", moves after the best only have an upper bound: keep the order stable for those
				vals.sort(function (a, b) { return b.v - a.v; });
				done = { vals: vals, depth: depth };
				M = vals.map(function (o) { return o.mv; });
				if (vals[0].v > WIN - 1000) break;                                       // a forced win found
				if (!opts.full && vals.every(function (o, n) { return n === 0 || o.v < -WIN + 1000; })) break;   // only one move doesn't lose
				if (opts.full && vals.every(function (o) { return Math.abs(o.v) > WIN - 1000; })) break;
			}
		} catch (e) { if (e !== "time") throw e; }
		if (!done) done = { vals: M.map(function (mv) { return { mv: mv, v: 0 }; }), depth: 0 };
		return { vals: done.vals, depth: done.depth, nodes: E.nodes };
	}
	C._Engine = Engine;      // for the tests
	function toMove(mv) { return mv >= 100 ? { t: "p", x: mv - 100 } : { t: "d", x: mv }; }
	C.toMove = toMove;

	/** immediate wins for the player to move / moves after which the next player can win at once (2 players) */
	function winsNow(s, m) { var t = C.play(s, m); return !!(t.win && t.win.p === s.turn); }
	function losesNow(s, m) { var t = C.play(s, m); return !!(t.win && t.win.p >= 0 && t.win.p !== s.turn); }
	function givesWin(s, m) {
		var t = C.play(s, m);
		if (t.win) return false;
		var L = C.legal(t);
		for (var i = 0; i < L.length; i++) { var u = C.play(t, L[i]); if (u.win && u.win.p === t.turn) return true; }
		return false;
	}
	C.LEVELS = { easy: { ms: 0 }, medium: { ms: 300, depth: 4 }, hard: { ms: 1000 }, expert: { ms: 3000 } };
	/** the computer's move. level: easy | medium | hard | expert; opts {ms, seed}. Returns {m, how, v?, depth?} */
	C.think = function (s, level, opts) {
		opts = opts || {};
		var r = rng(opts.seed), L = C.legal(s), i;
		if (!L.length) return null;
		if (L.length === 1) return { m: L[0], how: "only" };
		var wins = L.filter(function (m) { return winsNow(s, m); });
		var safe = L.filter(function (m) { return !losesNow(s, m) && !givesWin(s, m); });
		var g = geo(s.c);
		function centred(list) {
			// weight the middle columns more
			var tot = 0, wts = list.map(function (m) { var d = Math.abs(m.x - (g.w - 1) / 2); var wt = (g.w - d) * (m.t === "p" ? 0.3 : 1); tot += wt; return wt; });
			var x = r() * tot;
			for (var j = 0; j < list.length; j++) { x -= wts[j]; if (x <= 0) return list[j]; }
			return list[list.length - 1];
		}
		if (level === "easy") {
			if (wins.length && r() < 0.6) return { m: wins[0], how: "win" };
			if (s.c.np === 2 && r() < 0.35) {
				// sometimes block the other player's immediate win
				var t0 = C.clone(s); t0.turn = 1 - s.turn;
				var block = C.legal(t0).filter(function (m) { return m.t === "d" && winsNow(t0, m); });
				if (block.length) return { m: block[0], how: "block" };
			}
			return { m: centred(L), how: "random" };
		}
		if (wins.length) return { m: wins[(r() * wins.length) | 0], how: "win" };
		var lv = C.LEVELS[level] || C.LEVELS.hard;
		var res = rootSearch(s, { ms: opts.ms || lv.ms, maxDepth: lv.depth, full: level === "medium" });
		var vals = res.vals.map(function (o) { return { m: toMove(o.mv), v: o.v }; });
		if (level === "medium") {
			// a good move, but not always the best: anything within a margin of the best that doesn't lose at once
			var top = vals[0].v, pool = vals.filter(function (o) { return o.v >= top - 25 && o.v > -WIN + 1000; });
			pool = pool.filter(function (o) { return safe.some(function (m) { return m.t === o.m.t && m.x === o.m.x; }); });
			if (!pool.length) pool = vals.slice(0, 1);
			return { m: pool[(r() * pool.length) | 0].m, how: "search", depth: res.depth, v: top };
		}
		// hard / expert: the best move; break exact ties at random so games differ
		var ties = vals.filter(function (o) { return o.v === vals[0].v; });
		var pick = ties[(r() * ties.length) | 0];
		return { m: pick.m, how: "search", depth: res.depth, v: pick.v, nodes: res.nodes };
	};
	/** the computer's opinion of every move (for learning): [{m, v, ply}] from the point of view of the player to move */
	C.analyze = function (s, ms) {
		if (s.win) return { vals: [], depth: 0 };
		var res = rootSearch(s, { ms: ms || 1500, full: true });
		return { depth: res.depth, vals: res.vals.map(function (o) { var a = Math.abs(o.v); return { m: toMove(o.mv), v: o.v, ply: a > WIN - 1000 ? WIN - a : 0 }; }) };
	};
	/** a short label for an analysis value */
	C.valueLabel = function (v, ply) {
		if (ply) { var n = Math.ceil(ply / 2); return v > 0 ? "Win in " + n : "Lose in " + n; }
		if (v === 0) return "Even";
		return (v > 0 ? "+" : "") + Math.round(v / 10);
	};

	/* ---------- Hive games ----------
	   Every action is a custom_json operation with id "mes_c4", signed with the player's posting key. Nothing else decides the game:
	   both browsers read both players' account histories and run build() on the same operations, so they always agree.
	     {"a":"open","g":"<8 chars>","v":"<game code>","f":"host|guest|random"[,"to":"account"][,"re":"host/gid"]}   by the host (2 players only)
	     {"a":"join","h":"<host>","g":"<gid>"}                                                                         by the guest
	     {"a":"mv","h":"<host>","g":"<gid>","n":<move number from 0>,"m":"<move string>"}
	     {"a":"res","h","g"}  resign   ·   {"a":"claim","h","g"}  win when the other player has not acted for CLAIM_S on their turn
	     {"a":"cancel","h","g"}  the host withdraws an open game nobody has joined
	     {"a":"rec","g","v","m":"3.3.4...","o":"easy|medium|hard|expert|local","s":<my seat, -1 = pass and play>,"w":<winner -1..2>}
	        a SELF-REPORTED result of a game played against the computer or on one device; records() replays it and keeps it only
	        when the moves are legal, the game is finished and "w" is the real winner. Nothing proves the moves were really played.
	   Order = block number, then position (account-history index for one account, trx id between two accounts). First valid join wins
	   the seat. "random" first player: parity of the char-code sum of the two transaction ids, the same for both sides. */
	var H = C.hive = { ID: "mes_c4", CLAIM_S: 300, OPEN_S: 3600, GID_RE: /^[a-z0-9]{8}$/, ACCT_RE: /^[a-z][a-z0-9.-]{2,15}$/, OPP: ["easy", "medium", "hard", "expert", "local"] };
	H.parse = function (entries, acct) {
		var out = [];
		(entries || []).forEach(function (e) {
			var idx = e[0], x = e[1] || {}, op = x.op;
			if (!op || op[0] !== "custom_json" || !op[1] || op[1].id !== H.ID) return;
			var auths = op[1].required_posting_auths || [];
			if (auths.length !== 1 || (acct && auths[0] !== acct)) return;
			var j;
			try { j = typeof op[1].json === "string" ? JSON.parse(op[1].json) : op[1].json; } catch (er) { return; }
			var o = H.clean(j);
			if (!o) return;
			o.acct = auths[0]; o.trx = x.trx_id || ""; o.block = x.block || 0; o.i = idx;
			o.ts = Date.parse(String(x.timestamp || "") + (/Z$/.test(x.timestamp || "") ? "" : "Z")) || 0;
			out.push(o);
		});
		return out;
	};
	H.clean = function (j) {
		if (!j || typeof j !== "object" || !H.GID_RE.test(String(j.g))) return null;
		var a = j.a, o = { a: a, g: j.g }, c;
		if (a === "open") {
			c = C.parseCode(j.v);
			if (!c || c.np !== 2 || C.preset(j.v)) return null;
			o.v = j.v; o.f = ["host", "guest", "random"].indexOf(j.f) >= 0 ? j.f : "host";
			if (j.to !== undefined) { if (!H.ACCT_RE.test(String(j.to))) return null; o.to = j.to; }
			if (j.re !== undefined && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(String(j.re))) o.re = j.re;
			return o;
		}
		if (a === "rec") {
			c = C.parseCode(j.v);
			if (!c || C.preset(j.v) || typeof j.m !== "string" || j.m.length > 1500 || !/^(p?\d{1,2})(\.p?\d{1,2})*$/.test(j.m)) return null;
			if (H.OPP.indexOf(j.o) < 0 || [-1, 0, 1, 2].indexOf(j.s) < 0 || [-1, 0, 1, 2].indexOf(j.w) < 0) return null;
			o.v = j.v; o.m = j.m; o.o = j.o; o.s = j.s; o.w = j.w;
			return o;
		}
		if (!H.ACCT_RE.test(String(j.h))) return null;
		o.h = j.h;
		if (a === "join" || a === "res" || a === "claim" || a === "cancel") return o;
		if (a === "mv") {
			if (typeof j.n !== "number" || j.n < 0 || j.n > 600 || (j.n | 0) !== j.n || !C.mparse(j.m)) return null;
			o.n = j.n; o.m = String(j.m);
			return o;
		}
		return null;
	};
	H.json = function (o) { var c = {}; for (var k in o) if (["a", "g", "v", "f", "to", "re", "h", "n", "m", "o", "s", "w"].indexOf(k) >= 0) c[k] = o[k]; return JSON.stringify(c); };
	H.newGid = function (r) { var A = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; r = r || Math.random; for (var i = 0; i < 8; i++) s += A[(r() * A.length) | 0]; return s; };
	function order(a, b) { return (a.block || Infinity) - (b.block || Infinity) || (a.acct === b.acct ? a.i - b.i : a.trx < b.trx ? -1 : a.trx > b.trx ? 1 : 0) || (a.ts - b.ts); }
	H.order = order;
	H.coin = function (trxA, trxB) { var s = String(trxA) + String(trxB), n = 0; for (var i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 2; };
	/**
	 * Work out a Hive game from operations. host, gid: the game; ops: parsed operations of the host + guest (+ others); now: ms.
	 * -> {ok, open, host, guest, players, s, status "none|wait|play|over|cancelled|expired", win, lastTs, turnAcct, canClaimAt, trx: {open, join, end, moves: [trx]}}
	 */
	H.build = function (host, gid, ops, now) {
		var mine = ops.filter(function (o) { return o.g === gid && o.a !== "rec" && (o.a === "open" ? o.acct === host : o.h === host); }).sort(order);
		var R = { host: host, gid: gid, open: null, guest: null, players: [null, null], s: null, status: "none", win: null, lastTs: 0, turnAcct: null, canClaimAt: 0, trx: { open: "", join: "", end: "", moves: [] } };
		for (var i = 0; i < mine.length; i++) {
			var o = mine[i];
			if (!R.open) {
				if (o.a === "open") { R.open = o; R.cfg = C.parseCode(o.v); R.s = C.create(R.cfg); R.status = "wait"; R.lastTs = o.ts; R.trx.open = o.trx; }
				continue;
			}
			if (o.a === "open") continue;
			if (R.status === "wait") {
				if (o.a === "cancel" && o.acct === host) { R.status = "cancelled"; R.lastTs = o.ts; R.trx.end = o.trx; continue; }
				if (o.a === "join" && o.acct !== host && (!R.open.to || R.open.to === o.acct)) {
					R.guest = o.acct; R.join = o; R.trx.join = o.trx;
					var hostFirst = R.open.f === "host" ? true : R.open.f === "guest" ? false : H.coin(R.open.trx, o.trx) === 0;
					R.players = hostFirst ? [host, o.acct] : [o.acct, host];
					R.status = "play"; R.lastTs = o.ts;
				}
				continue;
			}
			if (R.status !== "play") continue;
			var seat = R.players.indexOf(o.acct);
			if (seat < 0) continue;
			if (o.a === "mv") {
				if (o.n !== R.s.hist.length || R.s.turn !== seat) continue;
				var m = C.mparse(o.m);
				if (!C.isLegal(R.s, m)) continue;
				C.apply(R.s, m); R.lastTs = o.ts; R.trx.moves.push(o.trx);
				if (R.s.win) { R.status = "over"; R.win = { p: R.s.win.p, why: R.s.win.why }; R.trx.end = o.trx; }
			} else if (o.a === "res") {
				R.status = "over"; R.win = { p: 1 - seat, why: "resign" }; R.s.win = { p: 1 - seat, line: null, lines: [], why: "resign" }; R.trx.end = o.trx;
			} else if (o.a === "claim") {
				if (R.s.turn !== seat && o.ts - R.lastTs >= H.CLAIM_S * 1000) {
					R.status = "over"; R.win = { p: seat, why: "timeout" }; R.s.win = { p: seat, line: null, lines: [], why: "timeout" }; R.trx.end = o.trx;
				}
			}
		}
		if (R.status === "wait" && now && R.open && now - R.open.ts > H.OPEN_S * 1000) R.status = "expired";
		if (R.status === "play") { R.turnAcct = R.players[R.s.turn]; R.canClaimAt = R.lastTs + H.CLAIM_S * 1000; }
		R.ok = R.status !== "none";
		return R;
	};
	/** the games an account opened or joined, newest first: [{host, gid, role, v?, to?, re?, ts, trx}] */
	H.myGames = function (acct, ops) {
		var seen = {}, out = [];
		ops.filter(function (o) { return o.acct === acct && (o.a === "open" || o.a === "join"); }).sort(order).reverse().forEach(function (o) {
			var host = o.a === "open" ? acct : o.h, k = host + "/" + o.g;
			if (seen[k]) return; seen[k] = 1;
			out.push({ host: host, gid: o.g, role: o.a === "open" ? "host" : "guest", v: o.v, to: o.to, re: o.re, ts: o.ts, trx: o.trx });
		});
		return out;
	};
	/** self-reported results ("rec") that check out, newest first: [{acct, g, v, moves, o, s, w, result "w|l|d" for s >= 0, ts, trx}] */
	H.records = function (ops) {
		var seen = {};
		return ops.filter(function (o) { return o.a === "rec"; }).sort(order).reverse().filter(function (o) {
			var k = o.acct + "/" + o.g; if (seen[k]) return false; seen[k] = 1;
			var c = C.parseCode(o.v), st = c && C.replay(c, o.m.split("."));
			if (!st || !st.win || st.win.p !== o.w || o.s >= c.np) return false;
			if (o.o === "local" ? o.s !== -1 : (o.s < 0 || c.np !== 2)) return false;
			return true;
		}).map(function (o) {
			return { acct: o.acct, g: o.g, v: o.v, moves: o.m.split("."), o: o.o, s: o.s, w: o.w, result: o.s < 0 ? "" : o.w < 0 ? "d" : o.w === o.s ? "w" : "l", ts: o.ts, trx: o.trx };
		});
	};

	if (typeof module !== "undefined" && module.exports) module.exports = C;
	root.MESC4 = C;
})(typeof self !== "undefined" ? self : this);
