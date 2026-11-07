/* MES Minesweeper: the rules, board generator, logic solver, move recording and replay check (window.MESMines).
   Pure code: runs in the page, in node (tool_apps_src/minesweeper-tests.js) and on the server: a byte-identical copy lives at
   mes.fm/api/_mines-lib.js (it replays Hive-saved games to check that they are real wins). cp after editing; the tests check.

   Boards are fully deterministic: board(seed, w, h, m, first click, no-guess attempt) always gives the same mines.
     - mines never sit on the first click or its 8 neighbours (when the board has room), so the first click opens an area;
     - a no-guess board is the first attempt k = 0, 1, 2 ... whose mines a pure logic solver can clear from the first click
       (solve()); the attempt number travels with a saved game (rec.g), so a replay never has to search;
     - the daily board: seed "d<yyyymmdd><level>", a fixed first cell (dailyFirst), always no-guess.
   Cells: index = y * w + x. Player state per cell: 0 hidden, 1 open, 2 flag, 3 question mark.
   A game is recorded as moves [type, cell, ms since the first click]: type 0 reveal, 1 flag on / off, 2 chord. Question marks are
   not recorded (they change nothing). encMoves() packs them as varints (cell * 3 + type, then the ms delta) in base64url.
   Hive record (custom_json id "mes_mines"): {v:1, l:"b"|"i"|"e"|"c", s:seed, w, h, m, n?:1 (no-guess), g?:attempt, t:ms, b:3BV,
   c:moves, mv:moves (left out when longer than MV_MAX), d?:"YYYY-MM-DD" (daily), a?:1 (hint used)}. */
(function (root) {
	"use strict";
	var M = {};
	M.V = 1;
	M.ID = "mes_mines";
	M.MV_MAX = 6000;              /* characters of encoded moves; Hive's custom_json limit is 8,192 bytes */
	M.NG_CAP = 2500;              /* attempts before a no-guess search gives up */
	M.MAX_EFF = 20;               /* 3BV per second above this is not a person (records are around 8) */
	M.LEVELS = {
		b: { w: 9, h: 9, m: 10, name: "Beginner" },
		i: { w: 16, h: 16, m: 40, name: "Intermediate" },
		e: { w: 30, h: 16, m: 99, name: "Expert" }
	};
	M.LIM = { wmin: 5, wmax: 50, hmin: 5, hmax: 30 };
	M.maxMines = function (w, h) { return Math.max(1, Math.min(w * h - 10, Math.floor(w * h * 0.85))); };
	/** sane custom size: numbers clamped into the limits */
	M.custom = function (w, h, m) {
		w = Math.round(+w); h = Math.round(+h); m = Math.round(+m);
		if (!isFinite(w)) w = 20; if (!isFinite(h)) h = 12; if (!isFinite(m)) m = 30;
		w = Math.min(M.LIM.wmax, Math.max(M.LIM.wmin, w));
		h = Math.min(M.LIM.hmax, Math.max(M.LIM.hmin, h));
		m = Math.min(M.maxMines(w, h), Math.max(1, m));
		return { w: w, h: h, m: m };
	};
	/** which level a size is ("b" / "i" / "e"), else "c" */
	M.levelOf = function (w, h, m) {
		for (var k in M.LEVELS) { var L = M.LEVELS[k]; if (L.w === w && L.h === h && L.m === m) return k; }
		return "c";
	};

	/* ---------- random numbers ---------- */
	M.hash = function (str) {
		var h = 2166136261 >>> 0;
		str = String(str);
		for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
		h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
		return h >>> 0;
	};
	M.rng = function (seed) {
		var a = seed >>> 0;
		return function () {
			a = (a + 0x6D2B79F5) >>> 0;
			var t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	};
	var SEED_ABC = "abcdefghijkmnpqrstuvwxyz23456789";
	M.newSeed = function (r) { r = r || Math.random; var s = "r"; for (var i = 0; i < 10; i++) s += SEED_ABC[(r() * SEED_ABC.length) | 0]; return s; };
	M.SEED_RE = /^[a-z0-9]{2,24}$/;

	/* ---------- neighbours ---------- */
	var NB = {};
	M.neighbours = function (w, h) {
		var key = w + "x" + h;
		if (NB[key]) return NB[key];
		var out = new Array(w * h);
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var a = [];
			for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				var xx = x + dx, yy = y + dy;
				if (xx >= 0 && yy >= 0 && xx < w && yy < h) a.push(yy * w + xx);
			}
			out[y * w + x] = a;
		}
		return (NB[key] = out);
	};

	/* ---------- boards ---------- */
	/** mines of attempt k (no solver): never on the first click or (when there is room) its neighbours */
	M.place = function (seed, w, h, m, first, k) {
		var N = w * h, nb = M.neighbours(w, h), excl = new Uint8Array(N), i;
		excl[first] = 1;
		if (N - 1 - nb[first].length >= m) nb[first].forEach(function (j) { excl[j] = 1; });
		var cand = [];
		for (i = 0; i < N; i++) if (!excl[i]) cand.push(i);
		var r = M.rng(M.hash(seed + "|" + w + "x" + h + "x" + m + "|" + first + "|" + (k || 0)));
		var mine = new Uint8Array(N);
		for (i = 0; i < m && i < cand.length; i++) {
			var j = i + Math.floor(r() * (cand.length - i));
			var t = cand[i]; cand[i] = cand[j]; cand[j] = t;
			mine[cand[i]] = 1;
		}
		var num = new Int8Array(N);
		for (i = 0; i < N; i++) {
			if (mine[i]) { num[i] = -1; continue; }
			var c = 0, a = nb[i];
			for (var q = 0; q < a.length; q++) c += mine[a[q]];
			num[i] = c;
		}
		return { seed: seed, w: w, h: h, m: m, first: first, k: k || 0, mine: mine, num: num, nb: nb };
	};
	/** search no-guess attempts from 0: {board, g, ok}. from / to let a page spread the search over several frames */
	M.noGuess = function (seed, w, h, m, first, from, to) {
		var cap = to == null ? M.NG_CAP : to;
		for (var k = from || 0; k < cap; k++) {
			var b = M.place(seed, w, h, m, first, k);
			if (M.solve(b).solved) { b.ng = true; b.g = k; return { board: b, g: k, ok: true }; }
		}
		return { board: null, g: -1, ok: false, next: cap };
	};
	/** the board of a saved / shared game: o = {s, w, h, m, f, n, g} (g = no-guess attempt, else 0) */
	M.board = function (o) {
		var b = M.place(o.s, o.w, o.h, o.m, o.f, o.n ? (o.g | 0) : 0);
		b.ng = !!o.n; b.g = o.n ? (o.g | 0) : 0;
		return b;
	};

	/* ---------- daily board ---------- */
	M.dailySeed = function (date, l) { return "d" + String(date).replace(/-/g, "") + l; };
	M.utcDate = function (ms) { return new Date(ms == null ? Date.now() : ms).toISOString().slice(0, 10); };
	M.dailyFirst = function (date, l) {
		var L = M.LEVELS[l], r = M.rng(M.hash("first|" + M.dailySeed(date, l)));
		var x = 1 + Math.floor(r() * (L.w - 2)), y = 1 + Math.floor(r() * (L.h - 2));
		return y * L.w + x;
	};

	/* ---------- 3BV: the fewest clicks that clear the board (one per opening + every number not touching an opening) ---------- */
	M.bv = function (b) {
		var N = b.w * b.h, seen = new Uint8Array(N), n = 0, i, stack;
		for (i = 0; i < N; i++) {
			if (seen[i] || b.num[i] !== 0) continue;
			n++; stack = [i]; seen[i] = 1;
			while (stack.length) {
				var c = stack.pop(), a = b.nb[c];
				for (var q = 0; q < a.length; q++) {
					var j = a[q];
					if (seen[j] || b.mine[j]) continue;
					seen[j] = 1;
					if (b.num[j] === 0) stack.push(j);
				}
			}
		}
		for (i = 0; i < N; i++) if (!seen[i] && !b.mine[i]) n++;
		return n;
	};

	/* ---------- logic ---------- */
	/** what can be proved from what is visible. vis[i] = -1 hidden, 0..8 open number; known[i] = 1 for cells already proved mines
	    (only the solver's own proofs, never the player's flags). Returns {safe: [...], mines: [...]} (both empty = a guess is needed) */
	M.deduce = function (w, h, m, vis, known) {
		var N = w * h, nb = M.neighbours(w, h), i, q;
		var safe = {}, mines = {}, cons = [], found = false;
		function addS(c) { safe[c] = 1; found = true; }
		function addM(c) { mines[c] = 1; found = true; }
		for (i = 0; i < N; i++) {
			var v = vis[i];
			if (v <= 0) continue;
			var a = nb[i], U = [], need = v;
			for (q = 0; q < a.length; q++) {
				var j = a[q];
				if (vis[j] >= 0) continue;
				if (known[j]) need--; else U.push(j);
			}
			if (!U.length) continue;
			if (need === 0) U.forEach(addS);
			else if (need === U.length) U.forEach(addM);
			else cons.push({ c: U, n: need });
		}
		if (!found && cons.length) {
			var byCell = {};
			cons.forEach(function (C, ci) { C.c.forEach(function (c) { (byCell[c] = byCell[c] || []).push(ci); }); });
			var done = {};
			for (var ai = 0; ai < cons.length && !found; ai++) {
				var A = cons[ai];
				for (q = 0; q < A.c.length && !found; q++) {
					var lst = byCell[A.c[q]];
					for (var li = 0; li < lst.length; li++) {
						var bi = lst[li];
						if (bi === ai) continue;
						var pk = ai < bi ? ai + "," + bi : bi + "," + ai;
						if (done[pk]) continue;
						done[pk] = 1;
						var B = cons[bi], inB = {}, onlyA = [], onlyB = [];
						B.c.forEach(function (c) { inB[c] = 1; });
						var inA = {};
						A.c.forEach(function (c) { inA[c] = 1; if (!inB[c]) onlyA.push(c); });
						B.c.forEach(function (c) { if (!inA[c]) onlyB.push(c); });
						if (A.n - B.n === onlyA.length && (onlyA.length || onlyB.length)) { onlyA.forEach(addM); onlyB.forEach(addS); }
						else if (B.n - A.n === onlyB.length && (onlyA.length || onlyB.length)) { onlyB.forEach(addM); onlyA.forEach(addS); }
						if (found) break;
					}
				}
			}
		}
		if (!found) {
			var unk = [], km = 0;
			for (i = 0; i < N; i++) { if (vis[i] >= 0) continue; if (known[i]) km++; else unk.push(i); }
			if (unk.length) {
				if (m - km === 0) unk.forEach(addS);
				else if (m - km === unk.length) unk.forEach(addM);
			}
		}
		return { safe: Object.keys(safe).map(Number), mines: Object.keys(mines).map(Number) };
	};
	/** open cell i (and the area around a 0) in a vis array, using the true board */
	function flood(b, vis, i) {
		var stack = [i], n = 0;
		while (stack.length) {
			var c = stack.pop();
			if (vis[c] >= 0 || b.mine[c]) continue;
			vis[c] = b.num[c]; n++;
			if (b.num[c] === 0) { var a = b.nb[c]; for (var q = 0; q < a.length; q++) if (vis[a[q]] < 0) stack.push(a[q]); }
		}
		return n;
	}
	/** can logic alone clear board b from its first click? {solved, open} */
	M.solve = function (b) {
		var N = b.w * b.h, vis = new Int8Array(N).fill(-1), known = new Uint8Array(N), open = flood(b, vis, b.first), goal = N - b.m;
		for (var guard = 0; open < goal && guard < N * 4; guard++) {
			var d = M.deduce(b.w, b.h, b.m, vis, known);
			if (!d.safe.length && !d.mines.length) break;
			d.mines.forEach(function (c) { known[c] = 1; });
			for (var s = 0; s < d.safe.length; s++) {
				if (b.mine[d.safe[s]]) return { solved: false, open: open, error: true };   /* cannot happen: a proof was wrong */
				open += flood(b, vis, d.safe[s]);
			}
		}
		return { solved: open >= goal, open: open };
	};
	/** a hint from what the player can see: {cell, kind: "safe" | "mine"} or null when no cell can be proved */
	M.hint = function (b, st) {
		var N = b.w * b.h, vis = new Int8Array(N), known = new Uint8Array(N), i;
		for (i = 0; i < N; i++) vis[i] = st[i] === 1 ? b.num[i] : -1;
		/* chain proofs (proved mines feed the next round) until something useful for the player shows up */
		for (var round = 0; round < 50; round++) {
			var d = M.deduce(b.w, b.h, b.m, vis, known);
			if (!d.safe.length && !d.mines.length) return null;
			for (i = 0; i < d.safe.length; i++) if (st[d.safe[i]] !== 2) return { cell: d.safe[i], kind: "safe" };
			for (i = 0; i < d.mines.length; i++) if (st[d.mines[i]] !== 2) return { cell: d.mines[i], kind: "mine" };
			d.mines.forEach(function (c) { known[c] = 1; });
			if (d.safe.length) return { cell: d.safe[0], kind: "safe" };   /* safe but flagged: a wrong flag */
		}
		return null;
	};

	/* ---------- a game ---------- */
	function Game(b) {
		this.b = b;
		this.st = new Uint8Array(b.w * b.h);
		this.opened = 0; this.goal = b.w * b.h - b.m;
		this.over = false; this.won = false; this.lost = false; this.boom = -1;
		this.moves = []; this.flags = 0;
	}
	Game.prototype.openCell = function (i, out) {
		var b = this.b, st = this.st, stack = [i];
		while (stack.length) {
			var c = stack.pop();
			if (st[c] === 1 || st[c] === 2) continue;
			st[c] = 1; out.push(c);
			if (b.mine[c]) { this.lost = true; if (this.boom < 0) this.boom = c; continue; }
			this.opened++;
			if (b.num[c] === 0) { var a = b.nb[c]; for (var q = 0; q < a.length; q++) if (st[a[q]] !== 1 && st[a[q]] !== 2) stack.push(a[q]); }
		}
	};
	Game.prototype.finish = function () {
		if (this.lost) { this.over = true; return; }
		if (this.opened >= this.goal) { this.over = true; this.won = true; }
	};
	/** reveal i at time t (ms since the first click). Returns the opened cells, or null when nothing happened */
	Game.prototype.reveal = function (i, t) {
		if (this.over || i < 0 || i >= this.st.length || this.st[i] === 1 || this.st[i] === 2) return null;
		if (!this.moves.length && i !== this.b.first) return null;
		var out = [];
		this.openCell(i, out);
		this.moves.push([0, i, t | 0]);
		this.finish();
		return out;
	};
	/** flag on / off (a question mark counts as not flagged) */
	Game.prototype.flag = function (i, t) {
		if (this.over || !this.moves.length || i < 0 || i >= this.st.length || this.st[i] === 1) return null;
		if (this.st[i] === 2) { this.st[i] = 0; this.flags--; } else { this.st[i] = 2; this.flags++; }
		this.moves.push([1, i, t | 0]);
		return [i];
	};
	/** a question mark on / off: display only, not recorded */
	Game.prototype.question = function (i) {
		if (this.over || this.st[i] === 1 || this.st[i] === 2) return false;
		this.st[i] = this.st[i] === 3 ? 0 : 3;
		return true;
	};
	Game.prototype.flagsAround = function (i) {
		var a = this.b.nb[i], n = 0;
		for (var q = 0; q < a.length; q++) if (this.st[a[q]] === 2) n++;
		return n;
	};
	/** can a chord on i do something? */
	Game.prototype.canChord = function (i) {
		if (this.over || this.st[i] !== 1 || this.b.num[i] <= 0 || this.flagsAround(i) !== this.b.num[i]) return false;
		var a = this.b.nb[i];
		for (var q = 0; q < a.length; q++) if (this.st[a[q]] === 0 || this.st[a[q]] === 3) return true;
		return false;
	};
	/** open every unflagged neighbour of an open number whose flags are complete */
	Game.prototype.chord = function (i, t) {
		if (!this.canChord(i)) return null;
		var a = this.b.nb[i], out = [];
		for (var q = 0; q < a.length; q++) if (this.st[a[q]] === 0 || this.st[a[q]] === 3) this.openCell(a[q], out);
		this.moves.push([2, i, t | 0]);
		this.finish();
		return out;
	};
	/** apply a recorded move: false when it did nothing (a recording must never contain such moves) */
	Game.prototype.apply = function (mv) {
		var r = mv[0] === 0 ? this.reveal(mv[1], mv[2]) : mv[0] === 1 ? this.flag(mv[1], mv[2]) : mv[0] === 2 ? this.chord(mv[1], mv[2]) : null;
		return !!r;
	};
	Game.prototype.time = function () { return this.moves.length ? this.moves[this.moves.length - 1][2] : 0; };
	/** flags placed on cells that are not mines (shown after a loss) */
	Game.prototype.wrongFlags = function () {
		var out = [];
		for (var i = 0; i < this.st.length; i++) if (this.st[i] === 2 && !this.b.mine[i]) out.push(i);
		return out;
	};
	M.Game = Game;

	/* ---------- move list <-> text ---------- */
	var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	function varint(out, n) { n = Math.max(0, Math.floor(n)); while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); } out.push(n); }
	M.encMoves = function (moves) {
		var bytes = [], prev = 0, i;
		for (i = 0; i < moves.length; i++) {
			var mv = moves[i];
			varint(bytes, mv[1] * 3 + mv[0]);
			varint(bytes, i ? mv[2] - prev : 0);
			prev = mv[2];
		}
		var s = "";
		for (i = 0; i < bytes.length; i += 3) {
			var a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
			var n = (a << 16) | (b << 8) | c;
			s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
			if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
			if (i + 2 < bytes.length) s += B64[n & 63];
		}
		return s;
	};
	M.decMoves = function (s) {
		if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
		var bytes = [], i;
		for (i = 0; i < s.length; i += 4) {
			var n = 0, k;
			for (k = 0; k < 4; k++) n = n * 64 + (i + k < s.length ? B64.indexOf(s[i + k]) : 0);
			bytes.push((n >> 16) & 255);
			if (i + 2 < s.length) bytes.push((n >> 8) & 255);
			if (i + 3 < s.length) bytes.push(n & 255);
		}
		var nums = [], cur = 0, mul = 1, p = 0;
		for (i = 0; i < bytes.length; i++) {
			cur += (bytes[i] & 127) * mul;
			if (bytes[i] & 128) { mul *= 128; if (++p > 6) return null; }
			else { nums.push(cur); cur = 0; mul = 1; p = 0; }
		}
		if (p || nums.length % 2) return null;
		var out = [], t = 0;
		for (i = 0; i < nums.length; i += 2) {
			t += nums[i + 1];
			out.push([nums[i] % 3, Math.floor(nums[i] / 3), t]);
		}
		return out;
	};

	/* ---------- Hive record ---------- */
	/** the record of a won game. o = {l, s, n, d, a} */
	M.record = function (game, o) {
		var b = game.b, r = { v: M.V, l: o.l, s: b.seed, w: b.w, h: b.h, m: b.m };
		if (b.ng) { r.n = 1; r.g = b.g; }
		r.t = game.time(); r.b = M.bv(b); r.c = game.moves.length;
		var mv = M.encMoves(game.moves);
		if (mv.length <= M.MV_MAX) r.mv = mv;
		if (o.d) r.d = o.d;
		if (o.a) r.a = 1;
		return r;
	};
	M.json = function (r) {
		var c = {}, keys = ["v", "l", "s", "w", "h", "m", "n", "g", "t", "b", "c", "mv", "d", "a"];
		keys.forEach(function (k) { if (r[k] !== undefined) c[k] = r[k]; });
		return JSON.stringify(c);
	};
	function int(v, lo, hi) { return typeof v === "number" && (v | 0) === v && v >= lo && v <= hi; }
	/** replay a record and check it is a real win: {ok, why?, t, b, eff, board: leaderboard key or null} */
	M.verify = function (r, opt) {
		opt = opt || {};
		function no(why) { return { ok: false, why: why }; }
		if (!r || typeof r !== "object" || r.v !== 1) return no("Unknown record version.");
		if (["b", "i", "e", "c"].indexOf(r.l) < 0) return no("Unknown level.");
		if (!int(r.w, M.LIM.wmin, M.LIM.wmax) || !int(r.h, M.LIM.hmin, M.LIM.hmax) || !int(r.m, 1, M.maxMines(r.w, r.h))) return no("Bad board size.");
		if (r.l !== "c") { var L = M.LEVELS[r.l]; if (L.w !== r.w || L.h !== r.h || L.m !== r.m) return no("Size does not match the level."); }
		if (typeof r.s !== "string" || !M.SEED_RE.test(r.s)) return no("Bad seed.");
		if (!int(r.t, 1, 86400000) || !int(r.b, 1, 2000) || !int(r.c, 1, 20000)) return no("Bad numbers.");
		if (r.n !== undefined && r.n !== 1) return no("Bad no-guess flag.");
		if (r.n && !int(r.g, 0, M.NG_CAP)) return no("Bad no-guess attempt.");
		if (typeof r.mv !== "string") return no("No moves saved (the board was too big), so it cannot be checked.");
		var mv = M.decMoves(r.mv);
		if (!mv || !mv.length || mv.length !== r.c) return no("The moves do not read.");
		if (mv[0][0] !== 0 || mv[0][1] >= r.w * r.h) return no("The game must start with a reveal.");
		if (r.d !== undefined) {
			if (!/^\d{4}-\d\d-\d\d$/.test(String(r.d)) || r.l === "c") return no("Bad daily date.");
			if (r.s !== M.dailySeed(r.d, r.l) || !r.n) return no("That is not the daily board.");
			if (mv[0][1] !== M.dailyFirst(r.d, r.l)) return no("The daily board starts on its marked cell.");
			if (opt.dailyG != null && r.g !== opt.dailyG) return no("That is not the daily board.");
		} else if (/^d\d/.test(r.s)) return no("Daily seeds need a date.");
		var b = M.board({ s: r.s, w: r.w, h: r.h, m: r.m, f: mv[0][1], n: r.n, g: r.g });
		var g = new Game(b);
		for (var i = 0; i < mv.length; i++) {
			if (g.over) return no("Moves after the end of the game.");
			if (mv[i][1] >= r.w * r.h) return no("A move is off the board.");
			if (!g.apply(mv[i])) return no("A move did nothing.");
		}
		if (!g.won) return no(g.lost ? "That game hit a mine." : "That game is not finished.");
		var t = g.time();
		if (t !== r.t) return no("The time does not match the moves.");
		var bv = M.bv(b);
		if (bv !== r.b) return no("The 3BV does not match the board.");
		var eff = bv / Math.max(t, 1) * 1000;
		if (eff > M.MAX_EFF || t < 400) return no("Too fast to be played by hand.");
		var key = null;
		if (!r.a && r.l !== "c") key = r.d ? "d:" + r.d + ":" + r.l : (r.n ? "n:" : "a:") + r.l;
		return { ok: true, t: t, b: bv, eff: Math.round(eff * 100) / 100, board: key };
	};

	/* ---------- account history -> our records ---------- */
	/** condenser_api.get_account_history entries -> [{trx, block, ts, acct, rec}] of mes_mines ops signed (posting) by acct */
	M.parseHistory = function (entries, acct) {
		var out = [];
		(entries || []).forEach(function (e) {
			var x = e && e[1] || {}, op = x.op;
			if (!op || op[0] !== "custom_json" || !op[1] || op[1].id !== M.ID) return;
			var auths = op[1].required_posting_auths || [];
			if (auths.length !== 1 || auths[0] !== acct || (op[1].required_auths || []).length) return;
			var j;
			try { j = typeof op[1].json === "string" ? JSON.parse(op[1].json) : op[1].json; } catch (er) { return; }
			if (!j || typeof j !== "object") return;
			out.push({ trx: x.trx_id || "", block: x.block || 0, ts: Date.parse(String(x.timestamp || "") + (/Z$/.test(x.timestamp || "") ? "" : "Z")) || 0, acct: acct, rec: j });
		});
		return out;
	};

	/* ---------- times ---------- */
	M.fmtTime = function (ms) {
		if (ms == null || !isFinite(ms)) return "—";
		if (ms < 60000) return (ms / 1000).toFixed(3) + " s";
		var m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
		return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
	};

	if (typeof module !== "undefined" && module.exports) module.exports = M;
	root.MESMines = M;
})(typeof self !== "undefined" ? self : this);
