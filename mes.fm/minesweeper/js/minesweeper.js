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

/* MES Minesweeper page (mes.fm/minesweeper). Rules / generator / solver / records: lib.js (window.MESMines).
   Settings + statistics: localStorage "mes-minesweeper:v1". Hive: main_js/hive.js (window.MESHive) signs one custom_json
   (id "mes_mines") per saved win; /api/mines replays it and keeps the leaderboard. On localhost (no /api) an in-browser stand-in
   (localStorage "mes-minesweeper:mocklb") replays the record itself, so the whole flow can be tried without Keychain. */
(function () {
	"use strict";
	var M = window.MESMines;
	var root = document.getElementById("ms");
	if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var LS = "mes-minesweeper:v1";
	var COARSE = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

	/* ---------- settings + stats ---------- */
	var S = { lv: "b", bd: "r", ng: false, q: false, cw: 20, ch: 12, cm: 40, cs: 0, stats: {}, daily: {}, last: null, lbk: "d", lbl: "b" };
	try { var saved = JSON.parse(localStorage.getItem(LS) || "null"); if (saved && typeof saved === "object") for (var k in S) if (saved[k] !== undefined) S[k] = saved[k]; } catch (e) {}
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
	(function fromQuery() {
		var q = new URLSearchParams(location.search);
		var l = q.get("l") || q.get("level");
		if (l && /^[bice]$/.test(l)) S.lv = l;
		if (q.get("daily") === "1") S.bd = "d";
		if (q.get("ng") === "1") S.ng = true;
	})();

	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	var toastT;
	function toast(msg) { var t = $("ms-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3400); }

	/* ---------- game state ---------- */
	var G = null;          /* the lib Game, once the first cell is opened */
	var B = null;          /* board size of the current game {w, h, m, l, daily, date, first} */
	var cells = [];        /* cell elements */
	var t0 = 0, tick = null, assisted = false, startedAt = 0, building = false, kb = -1, flagMode = false, hintT = null;
	var dailyCache = {};   /* date|l -> {board, g, ok} */
	var genToken = 0;

	function size() {
		if (S.lv === "c") { var c = M.custom(S.cw, S.ch, S.cm); return { w: c.w, h: c.h, m: c.m }; }
		var L = M.LEVELS[S.lv]; return { w: L.w, h: L.h, m: L.m };
	}
	function isDaily() { return S.bd === "d" && S.lv !== "c"; }
	function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

	var FLAG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect class="po" x="6.8" y="2" width="1.6" height="10.5"/><path class="fl" d="M8.4 2.2 L13.6 4.9 L8.4 7.7z"/><rect class="po" x="3.5" y="12.2" width="8.4" height="1.8" rx="0.4"/></svg>';
	var MINE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="mk" d="M8 1.6v12.8M1.6 8h12.8M3.5 3.5l9 9M12.5 3.5l-9 9"/><circle class="mn" cx="8" cy="8" r="4.6"/><circle class="sh" cx="6.4" cy="6.4" r="1.2"/></svg>';
	var WRONG = FLAG.replace("</svg>", '<path class="xx" d="M2.5 2.5l11 11M13.5 2.5l-11 11"/></svg>');

	/* ---------- new game ---------- */
	function newGame() {
		genToken++;
		stopTimer();
		var sz = size();
		B = { w: sz.w, h: sz.h, m: sz.m, l: S.lv === "c" ? M.levelOf(sz.w, sz.h, sz.m) : S.lv, daily: isDaily(), ng: isDaily() || S.ng };
		if (B.daily) { B.date = M.utcDate(); B.first = M.dailyFirst(B.date, B.l); }
		G = null; assisted = false; building = false; startedAt = 0;
		kb = B.daily ? B.first : Math.floor(B.h / 2) * B.w + Math.floor(B.w / 2);
		$("ms-after").hidden = true; $("ms-after").innerHTML = "";
		$("ms-face").textContent = "🙂";
		buildBoard();
		setTime(0); updateLeft();
		status(B.daily ? "Today's " + M.LEVELS[B.l].name + " board (" + B.date + ", UTC). Start on the marked cell." : (B.ng ? "No-guess board: open any cell to start." : "Open any cell to start: the first click is always safe."));
		if (B.daily) prepDaily();
		describe();
		if (B.daily) dailyPlayers();
	}
	function describe() {
		var sz = size(), txt = sz.w + " × " + sz.h + ", " + sz.m + " mines (" + Math.round(sz.m / (sz.w * sz.h) * 1000) / 10 + "% of the cells).";
		if (isDaily()) txt += " The daily board is the same for everyone today and always no-guess.";
		else if (S.ng) txt += " No-guess: logic alone can clear it from your first click.";
		var d = isDaily() && S.daily[M.utcDate() + "|" + S.lv];
		if (d && d.best) txt += " Your best on today's board: " + M.fmtTime(d.best) + ".";
		$("ms-desc").textContent = txt;
		$("ms-ng").checked = S.ng || isDaily(); $("ms-ng").disabled = isDaily();
	}
	function prepDaily() {
		var key = B.date + "|" + B.l;
		if (dailyCache[key]) return;
		var L = M.LEVELS[B.l], tok = genToken, from = 0, seed = M.dailySeed(B.date, B.l);
		(function step() {
			if (dailyCache[key]) return;
			var r = M.noGuess(seed, L.w, L.h, L.m, B.first, from, Math.min(M.NG_CAP, from + 40));
			if (r.ok) { dailyCache[key] = r; return; }
			from = r.next;
			if (from >= M.NG_CAP) { dailyCache[key] = { board: null, g: -1, ok: false }; return; }
			setTimeout(step, 0);
			void tok;
		})();
	}

	function buildBoard() {
		var b = $("ms-board"), html = "", n = B.w * B.h;
		b.style.gridTemplateColumns = "repeat(" + B.w + ", var(--cs))";
		for (var i = 0; i < n; i++) html += '<div class="ms-c" data-i="' + i + '"></div>';
		b.innerHTML = html;
		b.classList.remove("won", "lost", "busy");
		cells = Array.prototype.slice.call(b.children);
		if (B.daily) cells[B.first].classList.add("st");
		drawKb();
		fit();
	}
	function status(t, cls) { var s = $("ms-status"); s.textContent = t; s.className = "ms-status" + (cls ? " " + cls : ""); }
	function lcd(n) { var neg = n < 0; n = Math.min(999, Math.abs(n)); var s = String(n); while (s.length < 3) s = "0" + s; return neg ? "-" + s.slice(1) : s; }
	function updateLeft() { $("ms-left").textContent = lcd(B.m - (G ? G.flags : 0)); }
	function setTime(ms) { $("ms-time").textContent = lcd(Math.min(999, Math.floor(ms / 1000))); }
	function startTimer() { stopTimer(); tick = setInterval(function () { if (G && !G.over) setTime(now() - t0); }, 250); }
	function stopTimer() { if (tick) clearInterval(tick); tick = null; }
	function ms() { return Math.max(0, Math.round(now() - t0)); }

	/* ---------- drawing ---------- */
	function paint(i) {
		var el = cells[i]; if (!el) return;
		var st = G ? G.st[i] : 0, cls = "ms-c", inner = "";
		if (B.daily && i === B.first && !G) cls += " st";
		if (st === 1) {
			if (G.b.mine[i]) { cls += " o mine" + (i === G.boom ? " boom" : ""); inner = MINE; }
			else { var n = G.b.num[i]; cls += " o" + (n ? " n" + n : ""); inner = n ? String(n) : ""; }
		} else if (G && G.over && G.lost && G.b.mine[i] && st !== 2) { cls += " o mine"; inner = MINE; }
		else if (G && G.over && G.lost && st === 2 && !G.b.mine[i]) { cls += " o wrong"; inner = WRONG; }
		else if (st === 2 || (G && G.won && G.b.mine[i])) { cls += " f"; inner = FLAG; }
		else if (st === 3) { cls += " q"; inner = "?"; }
		if (i === kb) cls += " kb";
		if (el.className !== cls) el.className = cls;
		if (el.innerHTML !== inner) el.innerHTML = inner;
		el.setAttribute("aria-label", label(i));
	}
	function label(i) {
		var x = i % B.w + 1, y = Math.floor(i / B.w) + 1, st = G ? G.st[i] : 0, t = "row " + y + ", column " + x + ": ";
		if (st === 1) return t + (G.b.mine[i] ? "mine" : G.b.num[i] ? G.b.num[i] : "empty");
		return t + (st === 2 ? "flag" : st === 3 ? "question mark" : "hidden");
	}
	function paintAll() { for (var i = 0; i < cells.length; i++) paint(i); }
	function drawKb() { cells.forEach(function (c, i) { c.classList.toggle("kb", i === kb && document.activeElement === $("ms-board")); }); }

	/* ---------- cell size ---------- */
	function fit() {
		var box = $("ms-scroll"), view = $("ms-view"), cs;
		var full = view.classList.contains("mes-pfill") || document.fullscreenElement === view;
		if (S.cs) cs = S.cs;
		else {
			var avail = box.clientWidth - 8;
			cs = Math.floor(avail / B.w);
			if (full) { var ah = box.clientHeight - 8; if (ah > 100) cs = Math.min(cs, Math.floor(ah / B.h)); }
			cs = Math.max(COARSE ? 26 : 18, Math.min(full ? 64 : 40, cs));
		}
		$("ms-board").style.setProperty("--cs", cs + "px");
		$("ms-zlab").textContent = S.cs ? cs + " px" : "Fit";
	}
	function zoom(d) {
		var cur = parseInt($("ms-board").style.getPropertyValue("--cs"), 10) || 28;
		S.cs = Math.max(12, Math.min(72, cur + d)); save(); fit();
	}
	window.addEventListener("resize", function () { if (B) fit(); });

	/* ---------- actions ---------- */
	function afterMove(changed) {
		if (!changed) return;
		changed.forEach(paint);
		updateLeft();
		if (G.over) end();
	}
	function startAt(i) {
		if (building) return;
		if (B.daily && i !== B.first) { toast("Today's board starts on the marked cell (the blue ring)."); kb = B.first; drawKb(); return; }
		var w = B.w, h = B.h, m = B.m;
		function go(board, note) {
			G = new M.Game(board);
			t0 = now(); startedAt = Date.now();
			var ch = G.reveal(i, 0);
			countStart();
			startTimer();
			$("ms-face").textContent = "🙂";
			status(note || (B.daily ? "Go!" : ""));
			paintAll();
			if (G.over) end(); else updateLeft();
		}
		if (B.daily) {
			var key = B.date + "|" + B.l, c = dailyCache[key];
			if (c) {
				if (!c.ok) return toast("Today's board could not be made in this browser: try a random board.");
				return go(M.board({ s: M.dailySeed(B.date, B.l), w: w, h: h, m: m, f: B.first, n: 1, g: c.g }));
			}
			building = true; $("ms-board").classList.add("busy"); status("Getting today's board ready…");
			var waitTok = genToken;
			(function wait() {
				if (waitTok !== genToken) return;
				var c2 = dailyCache[key];
				if (!c2) return setTimeout(wait, 30);
				building = false; $("ms-board").classList.remove("busy");
				if (!c2.ok) return toast("Today's board could not be made in this browser: try a random board.");
				go(M.board({ s: M.dailySeed(B.date, B.l), w: w, h: h, m: m, f: B.first, n: 1, g: c2.g }));
			})();
			return;
		}
		var seed = M.newSeed();
		if (!B.ng) return go(M.place(seed, w, h, m, i, 0));
		building = true; $("ms-board").classList.add("busy"); status("Making a no-guess board…");
		var tok = genToken, from = 0, t1 = Date.now();
		(function step() {
			if (tok !== genToken) return;
			var r = M.noGuess(seed, w, h, m, i, from, Math.min(M.NG_CAP, from + 30));
			if (r.ok) { building = false; $("ms-board").classList.remove("busy"); return go(r.board); }
			from = r.next;
			if (from >= M.NG_CAP || Date.now() - t1 > 8000) {
				building = false; $("ms-board").classList.remove("busy"); B.ng = false;
				return go(M.place(seed, w, h, m, i, 0), "No no-guess board turned up quickly for this size, so this is a normal board (you may have to guess).");
			}
			status("Making a no-guess board… (" + from + " tried)");
			setTimeout(step, 0);
		})();
	}
	function reveal(i) {
		if (!G) return startAt(i);
		if (G.over) return;
		if (G.st[i] === 1) return chord(i);
		afterMove(G.reveal(i, ms()));
	}
	function chord(i) {
		if (!G || G.over) return;
		if (G.st[i] !== 1) return;
		afterMove(G.chord(i, ms()));
	}
	function flag(i) {
		if (!G) { if (!building) toast("Open a cell first."); return; }
		if (G.over || G.st[i] === 1) return;
		if (G.st[i] === 2 && S.q) { G.flag(i, ms()); G.question(i); paint(i); updateLeft(); return; }
		if (G.st[i] === 3) { G.question(i); paint(i); return; }
		G.flag(i, ms()); paint(i); updateLeft();
	}
	function hint() {
		if (!G || G.over) return toast(G ? "The game is over." : "Open a cell first.");
		var h = M.hint(G.b, G.st);
		if (!h) return toast("Nothing can be proved from what you see right now: you would have to guess here.");
		if (!assisted) { assisted = true; status("Hint used: this game counts as assisted."); }
		var el = cells[h.cell];
		el.classList.add(h.kind === "safe" ? "hs" : "hm");
		kb = h.cell; drawKb();
		try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
		toast(h.kind === "safe" ? "The green cell is safe to open." : "The red cell must be a mine.");
		clearTimeout(hintT);
		hintT = setTimeout(function () { el.classList.remove("hs", "hm"); }, 2600);
	}

	/* ---------- end of a game ---------- */
	function end() {
		stopTimer();
		var t = G.time();
		setTime(t);
		var board = $("ms-board");
		board.classList.remove("won", "lost"); void board.offsetWidth;
		paintAll();
		if (G.won) {
			board.classList.add("won");
			$("ms-face").textContent = "😎";
			$("ms-left").textContent = lcd(0);
			status("Cleared in " + M.fmtTime(t) + (assisted ? " (assisted)" : "") + "!", "is-win");
		} else {
			board.classList.add("lost");
			$("ms-face").textContent = "😵";
			var wf = G.wrongFlags().length;
			status("Boom. " + (wf ? wf + " flag" + (wf > 1 ? "s were" : " was") + " wrong (crossed out). " : "") + "Press the face or N for a new game.", "is-lose");
		}
		var rec = record();
		S.last = { rec: rec, won: G.won, l: B.l };
		addStats(rec);
		save();
		after(rec);
	}
	function record() {
		var r = M.record(G, { l: B.l === "c" ? "c" : B.l, d: B.daily ? B.date : null, a: assisted });
		return r;
	}
	function after(rec) {
		var box = $("ms-after"), bv = rec.b, eff = G.won ? (bv / Math.max(1, rec.t) * 1000) : 0;
		var html = '<div class="ms-nums"><span>Time <b>' + (G.won ? M.fmtTime(rec.t) : "—") + "</b></span><span>3BV <b>" + bv + "</b></span>" +
			(G.won ? "<span>3BV/s <b>" + eff.toFixed(2) + "</b></span>" : "") + "<span>Clicks <b>" + rec.c + "</b></span>" +
			(G.won ? "<span>Efficiency <b>" + Math.round(bv / rec.c * 100) + "%</b></span>" : "") + "</div>";
		var btns = '<div class="ms-hrow" style="margin-top:0.5em"><button type="button" class="tu-btn tu-btn--primary" data-a="new">New game</button><button type="button" class="tu-btn" data-a="replay">▶ Watch replay</button>';
		if (G.won) btns += '<button type="button" class="tu-btn" data-a="hive">⬢ Save to Hive</button>';
		btns += "</div>";
		html += btns;
		if (G.won) {
			if (rec.a) html += '<p class="tu-note">You used a hint, so this win is not ranked (you can still save it to Hive).</p>';
			else if (!rec.mv) html += '<p class="tu-note">This board is too big to save every click, so a Hive save could not be checked or ranked.</p>';
			else if (B.l === "c") html += '<p class="tu-note">Custom sizes are not ranked, but you can still save the win to Hive.</p>';
		}
		html += '<div id="ms-hbox"></div>';
		box.innerHTML = html;
		box.className = "ms-after" + (G.won ? " is-win" : "");
		box.hidden = false;
	}
	$("ms-after").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-a]"); if (!b) return;
		var a = b.getAttribute("data-a");
		if (a === "new") newGame();
		else if (a === "replay") replay();
		else if (a === "hive") hiveBox();
	});

	/* ---------- replay of the last game ---------- */
	var replayT = null;
	function replay() {
		if (!S.last || !S.last.rec || !S.last.rec.mv) return toast("No replay saved for this game.");
		var r = S.last.rec, mv = M.decMoves(r.mv);
		if (!mv || !mv.length) return;
		var board = M.board({ s: r.s, w: r.w, h: r.h, m: r.m, f: mv[0][1], n: r.n, g: r.g });
		genToken++; stopTimer(); clearTimeout(replayT);
		B = { w: r.w, h: r.h, m: r.m, l: r.l, daily: false, ng: !!r.n };
		G = null; buildBoard();
		var g = new M.Game(board), k = 0, start = Date.now(), tok = genToken;
		G = g; paintAll();
		status("Replay at double speed…");
		$("ms-after").hidden = true;
		(function step() {
			if (tok !== genToken) return;
			var el = (Date.now() - start) * 2;
			while (k < mv.length && mv[k][2] <= el) { g.apply(mv[k]); k++; }
			paintAll(); updateLeft(); setTime(Math.min(el, g.time()));
			if (k >= mv.length) { status("End of the replay: " + (g.won ? "cleared in " + M.fmtTime(g.time()) : "boom") + ". Press the face for a new game."); $("ms-face").textContent = g.won ? "😎" : "😵"; return; }
			replayT = setTimeout(step, 60);
		})();
	}

	/* ---------- input: mouse ---------- */
	var board = $("ms-board"), btns = 0, chordMode = false, pressCell = -1, lastTouch = 0;
	function cellOf(e) { var t = e.target && e.target.closest ? e.target.closest(".ms-c") : null; return t ? +t.getAttribute("data-i") : -1; }
	function pressPreview(i, on) {
		if (!G || G.over || i < 0) return;
		var list = chordMode ? [i].concat(G.b.nb[i]) : [i];
		list.forEach(function (c) { if (G.st[c] === 0 || G.st[c] === 3) cells[c].classList.toggle("pr", on); });
	}
	function clearPreview() { cells.forEach(function (c) { c.classList.remove("pr"); }); }
	board.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	board.addEventListener("mousedown", function (e) {
		if (Date.now() - lastTouch < 800) return;
		var i = cellOf(e); if (i < 0) return;
		e.preventDefault();
		try { board.focus({ preventScroll: true }); } catch (x) {}
		kb = i; drawKb();
		btns = e.buttons || (1 << e.button);
		if (e.button === 1 || (btns & 3) === 3) chordMode = true;
		else if (e.button === 2) { flag(i); }
		pressCell = i; clearPreview();
		if (e.button !== 2 || chordMode) pressPreview(i, true);
		if (!G || !G.over) $("ms-face").textContent = "😮";
	});
	board.addEventListener("mouseover", function (e) {
		if (!btns) return;
		var i = cellOf(e); if (i < 0 || i === pressCell) return;
		clearPreview(); pressCell = i;
		if (chordMode || (btns & 1)) pressPreview(i, true);
	});
	document.addEventListener("mouseup", function (e) {
		if (!btns) return;
		var i = pressCell, left = e.buttons || 0;
		var released = e.button;
		btns = left;
		if (G && !G.over) $("ms-face").textContent = "🙂"; else if (!G) $("ms-face").textContent = "🙂";
		if (chordMode) {
			if (!left) { chordMode = false; clearPreview(); if (i >= 0 && e.target.closest && board.contains(e.target)) chord(i); }
			return;
		}
		clearPreview();
		if (released === 0 && i >= 0 && board.contains(e.target)) { if (flagMode) { if (G && G.st[i] === 1) chord(i); else flag(i); } else reveal(i); }
		if (!left) pressCell = -1;
	});

	/* ---------- input: touch / pen (tap opens, press and hold flags; the board still scrolls) ---------- */
	var tp = null;
	board.addEventListener("pointerdown", function (e) {
		if (e.pointerType === "mouse") return;
		lastTouch = Date.now();
		var i = cellOf(e); if (i < 0) return;
		tp = { id: e.pointerId, i: i, x: e.clientX, y: e.clientY, done: false };
		var me = tp;
		tp.timer = setTimeout(function () {
			if (tp !== me) return;
			me.done = true;
			if (flagMode) reveal(i); else { if (G && G.st[i] === 1) chord(i); else flag(i); }
			if (navigator.vibrate) try { navigator.vibrate(25); } catch (x) {}
		}, 380);
	});
	board.addEventListener("pointermove", function (e) {
		if (!tp || e.pointerId !== tp.id) return;
		if (Math.abs(e.clientX - tp.x) > 9 || Math.abs(e.clientY - tp.y) > 9) { clearTimeout(tp.timer); tp = null; }
	});
	function tpEnd(e, cancel) {
		if (!tp || e.pointerId !== tp.id) return;
		lastTouch = Date.now();
		clearTimeout(tp.timer);
		var t = tp; tp = null;
		if (cancel || t.done) return;
		kb = t.i; drawKb();
		if (flagMode) { if (G && G.st[t.i] === 1) chord(t.i); else flag(t.i); }
		else reveal(t.i);
	}
	board.addEventListener("pointerup", function (e) { tpEnd(e, false); });
	board.addEventListener("pointercancel", function (e) { tpEnd(e, true); });

	/* ---------- input: keyboard ---------- */
	board.addEventListener("focus", drawKb);
	board.addEventListener("blur", drawKb);
	board.addEventListener("keydown", function (e) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		var x = kb % B.w, y = Math.floor(kb / B.w), k = e.key;
		var mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
		if (mv) {
			e.preventDefault();
			x = Math.max(0, Math.min(B.w - 1, x + mv[0])); y = Math.max(0, Math.min(B.h - 1, y + mv[1]));
			kb = y * B.w + x; drawKb();
			try { cells[kb].scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (x2) {}
			return;
		}
		if (k === " " || k === "Enter") { e.preventDefault(); if (flagMode) flag(kb); else reveal(kb); }
		else if (k === "f" || k === "F") { e.preventDefault(); flag(kb); }
		else if (k === "d" || k === "D") { e.preventDefault(); chord(kb); }
	});
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("ms-p-play").hidden) return;
		var k = e.key;
		if (k === "n" || k === "N") newGame();
		else if (k === "h" || k === "H") hint();
		else if (k === "+" || k === "=") zoom(2);
		else if (k === "-" || k === "_") zoom(-2);
		else if (k === "0") { S.cs = 0; save(); fit(); }
	});

	/* ---------- controls ---------- */
	function seg(id, val) { Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === val ? "true" : "false"); }); }
	function wireSeg(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (b) fn(b.getAttribute("data-v")); }); }
	function syncSetup() {
		seg("ms-lv", S.lv); seg("ms-bd", S.lv === "c" ? "r" : S.bd);
		$("ms-bd").querySelector('[data-v="d"]').disabled = S.lv === "c";
		$("ms-custom").hidden = S.lv !== "c";
		$("ms-q").checked = !!S.q;
		$("ms-cw").value = S.cw; $("ms-ch").value = S.ch; $("ms-cm").value = S.cm;
		var c = M.custom(S.cw, S.ch, S.cm);
		$("ms-cnote").textContent = "5 to 50 columns, 5 to 30 rows, up to " + M.maxMines(c.w, c.h) + " mines for this size.";
	}
	wireSeg("ms-lv", function (v) { S.lv = v; save(); syncSetup(); newGame(); });
	wireSeg("ms-bd", function (v) { S.bd = v; save(); syncSetup(); newGame(); });
	$("ms-ng").addEventListener("change", function () { S.ng = this.checked; save(); newGame(); });
	$("ms-q").addEventListener("change", function () { S.q = this.checked; save(); });
	["ms-cw", "ms-ch", "ms-cm"].forEach(function (id) {
		$(id).addEventListener("change", function () {
			var c = M.custom($("ms-cw").value, $("ms-ch").value, $("ms-cm").value);
			S.cw = c.w; S.ch = c.h; S.cm = c.m; save(); syncSetup(); newGame();
		});
	});
	$("ms-face").addEventListener("click", newGame);
	$("ms-hint").addEventListener("click", hint);
	$("ms-flagmode").addEventListener("click", function () {
		flagMode = !flagMode;
		this.setAttribute("aria-pressed", flagMode ? "true" : "false");
		toast(flagMode ? "Flag mode: taps place flags (press and hold opens)." : "Flag mode off: taps open cells.");
	});
	$("ms-zin").addEventListener("click", function () { zoom(2); });
	$("ms-zout").addEventListener("click", function () { zoom(-2); });
	$("ms-zfit").addEventListener("click", function () { S.cs = 0; save(); fit(); });

	/* tabs */
	$("ms-tabs").addEventListener("click", function (e) {
		var b = e.target.closest(".ms-tab"); if (!b) return;
		showTab(b.getAttribute("data-t"));
	});
	function showTab(t) {
		Array.prototype.forEach.call($("ms-tabs").children, function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
		$("ms-p-play").hidden = t !== "play"; $("ms-p-lb").hidden = t !== "lb"; $("ms-p-stats").hidden = t !== "stats";
		if (t === "lb") { renderLogin(); loadLb(); }
		if (t === "stats") renderStats();
		if (t === "play") fit();
	}

	/* fill window / full screen */
	function panelInit() {
		if (!window.MESPanel || $("ms-view").__mesPanel) return;
		window.MESPanel.add($("ms-view"), { bar: $("ms-vbar").querySelector(".ms-vbtns"), onChange: function () { setTimeout(fit, 30); } });
	}
	panelInit();
	window.addEventListener("load", panelInit);
	document.addEventListener("DOMContentLoaded", panelInit);

	/* ---------- statistics ---------- */
	function stat(l) {
		var s = S.stats[l];
		if (!s) s = S.stats[l] = { g: 0, w: 0, cur: 0, best: 0, top: [] };
		return s;
	}
	function countStart() { /* counted at the end (a game counts once a cell is opened) */ }
	function addStats(rec) {
		var s = stat(B.l === "c" ? "c" : B.l);
		s.g++;
		if (G.won) {
			s.w++; s.cur++; s.best = Math.max(s.best, s.cur);
			if (!rec.a) {
				s.top.push({ t: rec.t, b: rec.b, e: Math.round(rec.b / Math.max(1, rec.t) * 100000) / 100, d: new Date().toISOString().slice(0, 10), x: (B.daily ? "daily" : B.ng ? "no-guess" : "") + (B.l === "c" ? (B.w + "×" + B.h + "/" + B.m) : "") });
				s.top.sort(function (a, b) { return a.t - b.t; });
				s.top = s.top.slice(0, 10);
			}
		} else s.cur = 0;
		if (B.daily) {
			var k = B.date + "|" + B.l, d = S.daily[k] || (S.daily[k] = { tries: 0, best: 0 });
			d.tries++;
			if (G.won && !rec.a && (!d.best || rec.t < d.best)) d.best = rec.t;
			var ks = Object.keys(S.daily).sort();
			while (ks.length > 120) delete S.daily[ks.shift()];
		}
	}
	function renderStats() {
		var html = '<div class="ms-sgrid">';
		["b", "i", "e", "c"].forEach(function (l) {
			var s = S.stats[l] || { g: 0, w: 0, cur: 0, best: 0, top: [] };
			var name = l === "c" ? "Custom" : M.LEVELS[l].name;
			html += '<div class="ms-scard"><h3>' + name + '</h3><div class="ms-kv"><span>Games <b>' + s.g + "</b></span><span>Wins <b>" + s.w + "</b></span><span>Win rate <b>" + (s.g ? Math.round(s.w / s.g * 100) : 0) + "%</b></span><span>Streak <b>" + s.cur + "</b></span><span>Best streak <b>" + s.best + "</b></span></div>";
			if (s.top.length) {
				html += '<div class="ms-twrap"><table class="ms-tbl"><thead><tr><th>#</th><th class="r">Time</th><th class="r">3BV</th><th class="r">3BV/s</th><th>Date</th></tr></thead><tbody>';
				s.top.forEach(function (r, i) { html += "<tr><td>" + (i + 1) + '</td><td class="r">' + M.fmtTime(r.t) + '</td><td class="r">' + r.b + '</td><td class="r">' + r.e.toFixed(2) + "</td><td>" + esc(r.d) + (r.x ? " <small>" + esc(r.x) + "</small>" : "") + "</td></tr>"; });
				html += "</tbody></table></div>";
			} else html += '<p class="ms-sub">No wins yet.</p>';
			html += "</div>";
		});
		html += "</div>";
		$("ms-stats").innerHTML = html;
	}
	$("ms-sreset").addEventListener("click", function () {
		if (!confirm("Clear all your Minesweeper statistics in this browser?")) return;
		S.stats = {}; S.daily = {}; save(); renderStats(); toast("Statistics cleared.");
	});

	/* ---------- Hive ---------- */
	var HV = window.MESHive || null;
	function me() { var u = HV && HV.user && HV.user(); return u ? u.name : (MOCK ? (sessionStorage.getItem("mes-minesweeper:mockacct") || "") : ""); }
	function avatar(n) { return HV && HV.avatar ? HV.avatar(n, "small") : "https://images.hive.blog/u/" + encodeURIComponent(n) + "/avatar/small"; }
	function loginHtml() {
		var u = me();
		if (u) return '<p class="ms-who">Signed in as ' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b> <button type="button" class="tu-btn" data-h="out">Log out</button></p>';
		return '<div class="ms-hrow"><input class="tu-input" data-h="user" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" data-h="in">Log in with Hive</button></div>' +
			'<p class="tu-note">' + (MOCK ? "Test copy: any username works here and nothing is signed (no Keychain on a local copy)." : "Hive Keychain (the extension, or the Keychain phone app) proves you own the account by signing a message with your posting key. Your keys never leave Keychain.") + "</p>";
	}
	function wireLogin(box, done) {
		box.innerHTML = loginHtml();
		var out = box.querySelector('[data-h="out"]'), inb = box.querySelector('[data-h="in"]'), user = box.querySelector('[data-h="user"]');
		if (out) out.addEventListener("click", function () { if (MOCK && !(HV && HV.user && HV.user())) sessionStorage.removeItem("mes-minesweeper:mockacct"); else if (HV) HV.logout(); refreshLogins(); });
		if (inb) {
			var go = function () {
				var n = (user.value || "").trim().replace(/^@/, "").toLowerCase();
				if (MOCK) { if (!/^[a-z][a-z0-9.-]{2,15}$/.test(n)) return toast("That is not a Hive username."); sessionStorage.setItem("mes-minesweeper:mockacct", n); refreshLogins(); if (done) done(); return; }
				if (!HV) return toast("The Hive helpers did not load: reload the page.");
				inb.disabled = true; inb.textContent = "Check Keychain…";
				HV.login(n).then(function () { toast("Logged in."); refreshLogins(); if (done) done(); }, function (e) {
					inb.disabled = false; inb.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test((e.message || "") + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HV.helpHtml ? HV.helpHtml() : ""; box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			inb.addEventListener("click", go);
			user.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
		}
	}
	function renderLogin() { wireLogin($("ms-hlogin")); }
	function refreshLogins() { renderLogin(); if ($("ms-hbox") && $("ms-hbox").childNodes.length) hiveBox(); }
	if (HV && HV.onChange) HV.onChange(function () { refreshLogins(); });

	function hiveBox() {
		var box = $("ms-hbox"); if (!box || !S.last || !S.last.won) return;
		var rec = S.last.rec, u = me();
		var html = '<p class="tu-note">Saves one public, permanent message (custom_json id <code>mes_mines</code>) from your Hive account with this board\'s seed, your time, 3BV and clicks. It uses only your posting key, through Keychain, and costs no HIVE.</p>';
		box.innerHTML = html + '<div class="ms-hl"></div>';
		var hl = box.querySelector(".ms-hl");
		if (!u) { wireLogin(hl, hiveBox); return; }
		hl.innerHTML = '<p class="ms-who">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b></p><p><button type="button" class="tu-btn tu-btn--primary" data-h="send">Sign and save this win</button></p><p class="ms-sub" data-h="msg"></p>';
		hl.querySelector('[data-h="send"]').addEventListener("click", function () { sendHive(rec, u, this, hl.querySelector('[data-h="msg"]')); });
	}
	function sendHive(rec, u, btn, msg) {
		btn.disabled = true; msg.textContent = "Waiting for Keychain…";
		var json = M.json(rec);
		var p = MOCK && !(HV && HV.user && HV.user()) ? Promise.resolve({ trx: "mock" + Date.now().toString(16), mockRec: rec }) : (HV ? HV.keychain() : Promise.resolve(null)).then(function (kc) {
			if (!kc) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) {
				kc.requestCustomJson(u, M.ID, "Posting", json, "Save a Minesweeper win (" + M.fmtTime(rec.t) + ")", function (r) {
					if (r && r.success) { var x = r.result || {}; ok({ trx: x.id || x.tx_id || x.trx_id || "" }); }
					else no(new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled in Keychain"));
				});
			});
		});
		p.then(function (res) {
			msg.innerHTML = "Saved on Hive" + (res.trx && !/^mock/.test(res.trx) ? ' (<a href="https://hivehub.dev/tx/' + esc(res.trx) + '" target="_blank" rel="noopener">transaction</a>)' : "") + ". Checking it for the leaderboard…";
			S.last.trx = res.trx; save();
			submit(u, res.trx, rec, msg, 0);
		}, function (e) {
			btn.disabled = false;
			msg.textContent = (e && e.message) || "Not saved.";
			if (e && e.code === "nokeychain" && HV && HV.helpHtml) { var d = document.createElement("div"); d.innerHTML = HV.helpHtml(); msg.appendChild(d); }
		});
	}
	function submit(u, trx, rec, msg, tries) {
		api("POST", { act: "submit", acct: u, trx: trx }, null, rec).then(function (r) {
			if (r.ok) msg.innerHTML = r.board ? "On the leaderboard: <b>#" + r.rank + "</b> of " + r.count + " (" + esc(boardName(r.board)) + ")." + (r.best === false ? " Your earlier time there was faster, so it stays." : "") : "Checked and saved. " + esc(r.note || "");
			else if (r.code === 404 && tries < 8) { msg.textContent = "Waiting for the next Hive block… (" + (tries + 1) + ")"; setTimeout(function () { submit(u, trx, rec, msg, tries + 1); }, 3500); }
			else msg.textContent = "Saved on Hive, but not added to the leaderboard: " + (r.error || "unknown problem") + ".";
		});
	}
	function boardName(key) {
		var p = String(key).split(":"), l = p[p.length - 1], n = M.LEVELS[l] ? M.LEVELS[l].name : l;
		return p[0] === "d" ? "daily " + n + " " + p[1] : p[0] === "n" ? "no-guess " + n : "all-time " + n;
	}

	/* ---------- API (or the local stand-in) ---------- */
	function api(method, body, query, rec) {
		if (MOCK) return Promise.resolve(mockApi(method, body, query, rec));
		var url = "/api/mines" + (query ? "?" + new URLSearchParams(query).toString() : "");
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(url, opt).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j.code = r.status; if (!r.ok && !j.error) j.error = "HTTP " + r.status; j.ok = r.ok && j.ok !== false; return j; });
		}, function () { return { ok: false, code: 0, error: "Could not reach mes.fm" }; });
	}
	function mockLoad() { try { return JSON.parse(localStorage.getItem("mes-minesweeper:mocklb") || "{}"); } catch (e) { return {}; } }
	function mockApi(method, body, query, rec) {
		var db = mockLoad();
		if (method === "POST") {
			var v = M.verify(rec, {});
			if (!v.ok) return { ok: false, code: 422, error: v.why };
			if (!v.board) return { ok: true, note: "Not ranked (assisted or custom size)." };
			var lst = db[v.board] || (db[v.board] = []), old = lst.filter(function (x) { return x.acct === body.acct; })[0], best = true;
			if (old && old.t <= v.t) best = false;
			else { lst = db[v.board] = lst.filter(function (x) { return x.acct !== body.acct; }); lst.push({ acct: body.acct, t: v.t, b: v.b, eff: v.eff, trx: body.trx, ts: Date.now() }); }
			db[v.board].sort(function (a, b) { return a.t - b.t; });
			localStorage.setItem("mes-minesweeper:mocklb", JSON.stringify(db));
			var rank = 1 + db[v.board].findIndex(function (x) { return x.acct === body.acct; });
			return { ok: true, board: v.board, rank: rank, count: db[v.board].length, best: best };
		}
		if (query.daily) { var o = { ok: true }; ["b", "i", "e"].forEach(function (l) { o[l] = (db["d:" + query.daily + ":" + l] || []).length; }); return o; }
		var top = (db[query.board] || []).slice(0, +query.n || 25);
		return { ok: true, top: top, count: (db[query.board] || []).length };
	}

	/* ---------- leaderboard ---------- */
	function lbKey() { return S.lbk === "d" ? "d:" + M.utcDate() + ":" + S.lbl : S.lbk + ":" + S.lbl; }
	function loadLb() {
		seg("ms-lbk", S.lbk); seg("ms-lbl", S.lbl);
		var key = lbKey();
		$("ms-lbnote").textContent = (MOCK ? "Local test copy: this list is kept in this browser only. The real leaderboard works on mes.fm. " : "") +
			(S.lbk === "d" ? "Today's " + M.LEVELS[S.lbl].name + " board (" + M.utcDate() + ", UTC; a new board starts at midnight UTC)." : S.lbk === "a" ? "Random boards, " + M.LEVELS[S.lbl].name + " size, all time." : "Random no-guess boards, " + M.LEVELS[S.lbl].name + " size, all time.");
		$("ms-lb").innerHTML = '<p class="ms-sub">Loading…</p>';
		api("GET", null, { board: key, n: 50 }).then(function (r) {
			if (key !== lbKey()) return;
			if (!r.ok) { $("ms-lb").innerHTML = '<p class="ms-sub">' + esc(r.code === 404 || r.code === 0 ? "The leaderboard works on mes.fm (it could not be reached from here)." : r.error || "Could not load the leaderboard.") + "</p>"; return; }
			var top = r.top || [], u = me();
			if (!top.length) { $("ms-lb").innerHTML = '<p class="ms-sub">No times yet. Win a game, press "Save to Hive", and yours can be the first.</p>'; return; }
			var html = '<div class="ms-twrap"><table class="ms-tbl ms-lbt"><thead><tr><th>#</th><th>Player</th><th class="r">Time</th><th class="r">3BV</th><th class="r">3BV/s</th><th>Proof</th></tr></thead><tbody>';
			top.forEach(function (x, i) {
				html += '<tr class="' + (x.acct === u ? "me" : "") + '"><td>' + (i + 1) + '</td><td><img alt="" loading="lazy" src="' + esc(avatar(x.acct)) + '"><a href="https://peakd.com/@' + esc(x.acct) + '" target="_blank" rel="noopener">@' + esc(x.acct) + '</a></td><td class="r">' + M.fmtTime(x.t) + '</td><td class="r">' + x.b + '</td><td class="r">' + Number(x.eff).toFixed(2) + "</td><td>" +
					(x.trx && !/^mock/.test(x.trx) ? '<a href="https://hivehub.dev/tx/' + esc(x.trx) + '" target="_blank" rel="noopener">on Hive</a>' : "—") + "</td></tr>";
			});
			html += "</tbody></table></div>";
			if (r.count > top.length) html += '<p class="ms-sub">' + r.count + " players in all.</p>";
			$("ms-lb").innerHTML = html;
		});
	}
	wireSeg("ms-lbk", function (v) { S.lbk = v; save(); loadLb(); });
	wireSeg("ms-lbl", function (v) { S.lbl = v; save(); loadLb(); });
	$("ms-lbref").addEventListener("click", loadLb);
	function dailyPlayers() {
		var d = M.utcDate(), l = B.l;
		api("GET", null, { daily: d }).then(function (r) {
			if (!r.ok || !B || !B.daily || B.l !== l) return;
			var n = r[l] | 0;
			$("ms-desc").textContent += " " + (n ? n + (n === 1 ? " player has" : " players have") + " a verified time on today's board." : "No verified times on today's board yet.");
		});
	}

	/* ---------- start ---------- */
	syncSetup();
	newGame();
	window.MESMinesDebug = { game: function () { return G; }, B: function () { return B; }, reveal: reveal, flag: flag, chord: chord, hint: hint, newGame: newGame, cells: function () { return cells; }, S: S };
})();
