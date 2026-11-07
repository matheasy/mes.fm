/* MES Tic-Tac-Toe: rules of every variant + the computer opponent.
   Pure code: runs in the page, in a Web Worker (the computer's thinking), in node (tool_apps_src/tic-tac-toe-tests.js)
   and on the server (a byte-identical copy at mes.fm/api/_ttt-lib.js checks online moves: cp after editing).

   A game is described by a config:
     {t:"line", w, h, d, k, mis, grav, wild}   k in a row on a w x h (x d layers) board; mis = misere (a line loses),
                                               grav = pieces drop to the lowest empty cell of a column, wild = each turn
                                               you choose X or O (a line of either wins for whoever made it)
     {t:"ult"}                                 ultimate tic-tac-toe (9 boards in one)
     {t:"notakto", nb}                         both players play X on nb boards; whoever kills the last board loses
     {t:"num"}                                 numerical: odd vs even numbers, make a line that adds up to 15
     {t:"oc"}                                  Order & Chaos 6x6: Order wants five in a row of one symbol, Chaos a full board
   Configs travel as short codes (cfgCode / parseCode): "L3x3k3", "L7x6k4g", "L4x4x4k4", "L3x3k3m", "U", "N3", "Q", "OC".
   Moves travel as strings: "4" (cell), "12o" (cell + symbol, wild / Order & Chaos), "4-7" (cell - number, numerical). */
(function (root) {
	"use strict";
	var T = {};

	/* ---------- variants ---------- */
	T.PRESETS = [
		{ id: "classic", code: "L3x3k3", name: "Classic 3 × 3", group: "Classic", desc: "Three in a row wins. With perfect play it is always a draw." },
		{ id: "misere", code: "L3x3k3m", name: "Misère (reverse)", group: "Classic", desc: "Same board, but making three in a row LOSES. Try to force the other player to complete a line." },
		{ id: "wild", code: "L3x3k3w", name: "Wild tic-tac-toe", group: "Classic", desc: "Each turn choose X or O. Whoever completes a line of three of either symbol wins." },
		{ id: "num", code: "Q", name: "Numerical (make 15)", group: "Classic", desc: "Player one has 1, 3, 5, 7, 9; player two has 2, 4, 6, 8. Complete a line of three numbers that add up to 15." },
		{ id: "4x4k3", code: "L4x4k3", name: "4 × 4, three in a row", group: "Bigger boards", desc: "A quick, sharp game: the first player can force a win, so watch your step." },
		{ id: "4x4k4", code: "L4x4k4", name: "4 × 4, four in a row", group: "Bigger boards", desc: "You need the whole row, column or diagonal. Very hard to win: blocking is easy." },
		{ id: "5x5k4", code: "L5x5k4", name: "5 × 5, four in a row", group: "Bigger boards", desc: "Room for double threats: the classic is too small for real tactics, this is not." },
		{ id: "6x6k5", code: "L6x6k5", name: "6 × 6, five in a row", group: "Bigger boards", desc: "Five in a row on a 6 × 6 board." },
		{ id: "gomoku", code: "L15x15k5", name: "Gomoku 15 × 15", group: "Bigger boards", desc: "Five in a row on a big board (freestyle: six or more also counts)." },
		{ id: "drop4", code: "L7x6k4g", name: "Drop four (gravity)", group: "Bigger boards", desc: "Pieces fall to the lowest free spot of the column you pick. Four in a row wins." },
		{ id: "ult", code: "U", name: "Ultimate tic-tac-toe", group: "Strategy", desc: "Nine small boards in one. The cell you play decides which small board the other player must play in next. Win three small boards in a row." },
		{ id: "qubic", code: "L4x4x4k4", name: "3D 4 × 4 × 4 (Qubic)", group: "Strategy", desc: "Four layers of 4 × 4. Four in a row in any direction, also through the layers." },
		{ id: "notakto", code: "N3", name: "Notakto (3 boards)", group: "Strategy", desc: "Both players play X. A board with three in a row is dead. Whoever kills the last board loses." },
		{ id: "notakto1", code: "N1", name: "Notakto (1 board)", group: "Strategy", desc: "Both players play X on one board. Whoever completes a line loses. The first player can always win." },
		{ id: "oc", code: "OC", name: "Order & Chaos", group: "Strategy", desc: "6 × 6. Each turn place an X or an O. Order wins with five of one symbol in a row, Chaos wins if the board fills up without one." }
	];
	T.preset = function (id) { for (var i = 0; i < T.PRESETS.length; i++) if (T.PRESETS[i].id === id) return T.PRESETS[i]; return null; };
	T.presetByCode = function (code) { for (var i = 0; i < T.PRESETS.length; i++) if (T.PRESETS[i].code === code) return T.PRESETS[i]; return null; };

	T.LIMITS = { w: [3, 19], h: [3, 19], d: [1, 4], k: [3, 7], nb: [1, 5] };

	T.cfgCode = function (c) {
		if (c.t === "ult") return "U";
		if (c.t === "num") return "Q";
		if (c.t === "oc") return "OC";
		if (c.t === "notakto") return "N" + c.nb;
		return "L" + c.w + "x" + c.h + (c.d > 1 ? "x" + c.d : "") + "k" + c.k + (c.mis ? "m" : "") + (c.grav ? "g" : "") + (c.wild ? "w" : "");
	};
	/** short code -> config, or null when the code is not a valid game */
	T.parseCode = function (s) {
		s = String(s || "");
		if (s === "U") return { t: "ult" };
		if (s === "Q") return { t: "num" };
		if (s === "OC") return { t: "oc" };
		var m = /^N([1-5])$/.exec(s);
		if (m) return { t: "notakto", nb: +m[1] };
		m = /^L(\d{1,2})x(\d{1,2})(?:x(\d))?k(\d)(m?)(g?)(w?)$/.exec(s);
		if (!m) return null;
		var c = { t: "line", w: +m[1], h: +m[2], d: m[3] ? +m[3] : 1, k: +m[4], mis: !!m[5], grav: !!m[6], wild: !!m[7] };
		var L = T.LIMITS;
		if (c.w < L.w[0] || c.w > L.w[1] || c.h < L.h[0] || c.h > L.h[1] || c.d < L.d[0] || c.d > L.d[1] || c.k < L.k[0] || c.k > L.k[1]) return null;
		if (c.k > Math.max(c.w, c.h, c.d)) return null;
		if (c.d > 1 && (c.grav || c.w > 6 || c.h > 6)) return null;
		return c;
	};
	T.describe = function (c) {
		var p = T.presetByCode(T.cfgCode(c));
		if (p) return p.name;
		if (c.t !== "line") return T.cfgCode(c);
		var s = c.w + " × " + c.h + (c.d > 1 ? " × " + c.d : "") + ", " + c.k + " in a row";
		var x = [];
		if (c.grav) x.push("gravity");
		if (c.mis) x.push("misère");
		if (c.wild) x.push("wild");
		return s + (x.length ? " (" + x.join(", ") + ")" : "");
	};

	/* ---------- geometry ---------- */
	var geoCache = {};
	/** directions + every winning window of a line config */
	function geo(c) {
		var key = c.t === "line" ? c.w + "x" + c.h + "x" + c.d + "k" + c.k : c.t;
		if (geoCache[key]) return geoCache[key];
		var w, h, d, k;
		if (c.t === "line") { w = c.w; h = c.h; d = c.d; k = c.k; }
		else if (c.t === "oc") { w = 6; h = 6; d = 1; k = 5; }
		else { w = 3; h = 3; d = 1; k = 3; }
		var dirs = [];
		for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
			if (!dx && !dy && !dz) continue;
			if (d === 1 && dz) continue;
			// keep one of each opposite pair
			if (dz > 0 || (dz === 0 && (dy > 0 || (dy === 0 && dx > 0)))) dirs.push([dx, dy, dz]);
		}
		var N = w * h * d, wins = [], cellWins = [];
		for (var i = 0; i < N; i++) cellWins.push([]);
		for (var z = 0; z < d; z++) for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			for (var q = 0; q < dirs.length; q++) {
				var D = dirs[q], ex = x + D[0] * (k - 1), ey = y + D[1] * (k - 1), ez = z + D[2] * (k - 1);
				if (ex < 0 || ex >= w || ey < 0 || ey >= h || ez < 0 || ez >= d) continue;
				var win = [];
				for (var j = 0; j < k; j++) win.push((z + D[2] * j) * w * h + (y + D[1] * j) * w + (x + D[0] * j));
				var wi = wins.length;
				wins.push(win);
				for (j = 0; j < k; j++) cellWins[win[j]].push(wi);
			}
		}
		return (geoCache[key] = { w: w, h: h, d: d, k: k, N: N, dirs: dirs, wins: wins, cellWins: cellWins });
	}
	T.geo = geo;
	var L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
	T.L3 = L3;
	function line3(a, off, v) {        // a 3x3 line of value v inside a (at offset off)? returns the line or null
		for (var i = 0; i < 8; i++) { var l = L3[i]; if (a[off + l[0]] === v && a[off + l[1]] === v && a[off + l[2]] === v) return [off + l[0], off + l[1], off + l[2]]; }
		return null;
	}

	/* ---------- state ---------- */
	/** new game. State: cells (-1 empty; else 0 = X, 1 = O; numerical: the number), turn (0 = first player), hist (move strings), win */
	T.create = function (c) {
		var s = { c: c, turn: 0, hist: [], win: null, last: -1 };
		if (c.t === "line") s.cells = fill(geo(c).N);
		else if (c.t === "oc") s.cells = fill(36);
		else if (c.t === "num") { s.cells = fill(9); s.used = 0; }
		else if (c.t === "ult") { s.cells = fill(81); s.sub = fill(9); s.next = -1; }
		else if (c.t === "notakto") { s.cells = fill(9 * c.nb); s.dead = []; for (var i = 0; i < c.nb; i++) s.dead.push(false); }
		return s;
	};
	function fill(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = -1; return a; }
	T.clone = function (s) {
		var r = { c: s.c, turn: s.turn, hist: s.hist.slice(), win: s.win, last: s.last, cells: s.cells.slice() };
		if (s.sub) { r.sub = s.sub.slice(); r.next = s.next; }
		if (s.dead) r.dead = s.dead.slice();
		if (s.used !== undefined) r.used = s.used;
		return r;
	};
	/** whose symbol the player places (line games): X for the first player */
	T.numbersOf = function (p) { return p === 0 ? [1, 3, 5, 7, 9] : [2, 4, 6, 8]; };

	/* ---------- moves ---------- */
	T.mstr = function (m) { return m.n ? m.c + "-" + m.n : m.s !== undefined ? m.c + (m.s ? "o" : "x") : String(m.c); };
	T.mparse = function (str) {
		var r = /^(\d{1,3})(?:-([1-9])|([xo]))?$/.exec(String(str));
		if (!r) return null;
		var m = { c: +r[1] };
		if (r[2]) m.n = +r[2];
		if (r[3]) m.s = r[3] === "o" ? 1 : 0;
		return m;
	};

	/** gravity: the cell a piece dropped in column x lands on (-1 when full) */
	T.dropCell = function (s, x) {
		var g = geo(s.c);
		for (var y = g.h - 1; y >= 0; y--) if (s.cells[y * g.w + x] < 0) return y * g.w + x;
		return -1;
	};

	/** every legal move of the player to move */
	T.legal = function (s) {
		if (s.win) return [];
		var c = s.c, out = [], i, n = s.cells.length;
		if (c.t === "line") {
			if (c.grav) {
				var g = geo(c);
				for (var x = 0; x < g.w; x++) { var dc = T.dropCell(s, x); if (dc >= 0) pushCell(out, dc, c.wild); }
			} else for (i = 0; i < n; i++) if (s.cells[i] < 0) pushCell(out, i, c.wild);
		} else if (c.t === "oc") {
			for (i = 0; i < n; i++) if (s.cells[i] < 0) pushCell(out, i, true);
		} else if (c.t === "num") {
			var nums = T.numbersOf(s.turn).filter(function (v) { return !(s.used & (1 << v)); });
			for (i = 0; i < 9; i++) if (s.cells[i] < 0) for (var j = 0; j < nums.length; j++) out.push({ c: i, n: nums[j] });
		} else if (c.t === "ult") {
			for (var b = 0; b < 9; b++) {
				if (s.sub[b] >= 0) continue;
				if (s.next >= 0 && s.next !== b) continue;
				for (i = 0; i < 9; i++) if (s.cells[b * 9 + i] < 0) out.push({ c: b * 9 + i });
			}
		} else if (c.t === "notakto") {
			for (i = 0; i < n; i++) if (s.cells[i] < 0 && !s.dead[(i / 9) | 0]) out.push({ c: i });
		}
		return out;
	};
	function pushCell(out, i, both) { if (both) { out.push({ c: i, s: 0 }); out.push({ c: i, s: 1 }); } else out.push({ c: i }); }

	/** is m legal in s? (also used by the server) */
	T.isLegal = function (s, m) {
		if (!m || s.win) return false;
		var L = T.legal(s);
		for (var i = 0; i < L.length; i++) if (L[i].c === m.c && L[i].s === m.s && L[i].n === m.n) return true;
		return false;
	};

	/** longest run of value v through cell i (line geometry); returns the cells of the run */
	function runThrough(cells, g, i, v) {
		var best = null, x0 = i % g.w, y0 = ((i / g.w) | 0) % g.h, z0 = (i / (g.w * g.h)) | 0;
		for (var q = 0; q < g.dirs.length; q++) {
			var D = g.dirs[q], run = [i];
			for (var sgn = -1; sgn <= 1; sgn += 2) {
				var x = x0, y = y0, z = z0;
				for (;;) {
					x += D[0] * sgn; y += D[1] * sgn; z += D[2] * sgn;
					if (x < 0 || x >= g.w || y < 0 || y >= g.h || z < 0 || z >= g.d) break;
					var j = z * g.w * g.h + y * g.w + x;
					if (cells[j] !== v) break;
					if (sgn < 0) run.unshift(j); else run.push(j);
				}
			}
			if (run.length >= g.k && (!best || run.length > best.length)) best = run;
		}
		return best;
	}
	T.runThrough = runThrough;

	/** play move m on s IN PLACE (no legality check); sets s.win = {p: winner (-1 draw), line, why} when the game ends */
	T.apply = function (s, m) {
		var c = s.c, p = s.turn, i = m.c, ln, full;
		s.hist.push(T.mstr(m));
		s.last = i;
		if (c.t === "line") {
			var g = geo(c), v = c.wild ? m.s : p;
			s.cells[i] = v;
			ln = runThrough(s.cells, g, i, v);
			if (ln) s.win = { p: c.mis ? 1 - p : p, line: ln, why: c.mis ? "line-lose" : "line" };
			else if (s.hist.length >= g.N) s.win = { p: -1, line: null, why: "full" };
		} else if (c.t === "oc") {
			s.cells[i] = m.s;
			ln = runThrough(s.cells, geo(c), i, m.s);
			if (ln) s.win = { p: 0, line: ln, why: "order" };
			else if (s.hist.length >= 36) s.win = { p: 1, line: null, why: "chaos" };
		} else if (c.t === "num") {
			s.cells[i] = m.n;
			s.used |= 1 << m.n;
			for (var q = 0; q < 8 && !ln; q++) {
				var l = L3[q], a = s.cells[l[0]], b = s.cells[l[1]], d = s.cells[l[2]];
				if (a > 0 && b > 0 && d > 0 && a + b + d === 15 && (l[0] === i || l[1] === i || l[2] === i)) ln = l.slice();
			}
			if (ln) s.win = { p: p, line: ln, why: "fifteen" };
			else if (s.hist.length >= 9) s.win = { p: -1, line: null, why: "full" };
		} else if (c.t === "ult") {
			var bi = (i / 9) | 0, ci = i % 9;
			s.cells[i] = p;
			var sl = line3(s.cells, bi * 9, p);
			if (sl) s.sub[bi] = p;
			else {
				full = true;
				for (var j = 0; j < 9; j++) if (s.cells[bi * 9 + j] < 0) { full = false; break; }
				if (full) s.sub[bi] = 2;
			}
			s.next = s.sub[ci] >= 0 ? -1 : ci;
			var gl = s.sub[bi] === p ? line3(s.sub, 0, p) : null;
			if (gl) s.win = { p: p, line: gl, why: "ult", sub: true };
			else {
				var any = false;
				for (var b2 = 0; b2 < 9 && !any; b2++) if (s.sub[b2] < 0) any = true;
				if (!any) s.win = { p: -1, line: null, why: "full" };
			}
		} else if (c.t === "notakto") {
			var bn = (i / 9) | 0;
			s.cells[i] = 0;
			if (line3(s.cells, bn * 9, 0)) {
				s.dead[bn] = true;
				var alive = false;
				for (var k = 0; k < s.dead.length; k++) if (!s.dead[k]) alive = true;
				if (!alive) s.win = { p: 1 - p, line: line3(s.cells, bn * 9, 0), why: "last-board" };
			}
		}
		s.turn = 1 - p;
		return s;
	};
	T.play = function (s, m) { return T.apply(T.clone(s), m); };
	/** replay a list of move strings from a fresh game; returns null if any move is illegal */
	T.replay = function (c, moves) {
		var s = T.create(c);
		for (var i = 0; i < moves.length; i++) {
			var m = T.mparse(moves[i]);
			if (!T.isLegal(s, m)) return null;
			T.apply(s, m);
		}
		return s;
	};
	/** does the player to move win immediately with m? */
	function winsNow(s, m) { var t = T.play(s, m); return t.win && t.win.p === s.turn; }
	function losesNow(s, m) { var t = T.play(s, m); return t.win && t.win.p === 1 - s.turn; }

	/* ---------- random numbers (seedable, so tests repeat) ---------- */
	function rng(seed) {
		if (seed === undefined) return Math.random;
		var a = seed >>> 0;
		return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}
	T.rng = rng;
	function now() { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }

	/* ---------- exact solver (small games) ---------- */
	function key(s) { return s.turn + (s.next !== undefined ? "n" + s.next : "") + s.cells.join(","); }
	/** negamax value for the player to move: >0 win (bigger = sooner), <0 loss, 0 draw; throws "budget" when too big */
	function solve(s, memo, budget, depth) {
		if (s.win) return s.win.p < 0 ? 0 : (s.win.p === s.turn ? 1 : -1) * (1000 - depth);
		var kk = key(s);
		if (memo.has(kk)) { var v0 = memo.get(kk); return v0 > 0 ? v0 - depth : v0 < 0 ? v0 + depth : 0; }
		if (++budget.n > budget.max) throw "budget";
		var L = T.legal(s), best = -Infinity;
		for (var i = 0; i < L.length; i++) {
			var v = -solve(T.play(s, L[i]), memo, budget, depth + 1);
			if (v > best) best = v;
			if (best >= 1000 - depth - 1) break;     // can't do better than winning at once
		}
		// store relative to this node so it can be reused at another depth
		memo.set(kk, best > 0 ? best + depth : best < 0 ? best - depth : 0);
		return best;
	}
	/** exact values of every legal move (null when the game is too big to solve within maxNodes) */
	T.solveMoves = function (s, maxNodes) {
		var memo = new Map(), budget = { n: 0, max: maxNodes || 400000 }, L = T.legal(s), out = [];
		try {
			for (var i = 0; i < L.length; i++) out.push({ m: L[i], v: -solve(T.play(s, L[i]), memo, budget, 1) });
		} catch (e) { if (e === "budget") return null; throw e; }
		return out;
	};

	/* ---------- heuristic search for line games ---------- */
	var WSC = [0, 1, 6, 40, 300, 2500, 20000, 160000, 1e6];
	/** board value for player p: windows that only p could still fill count up, the other player's count down */
	function evalLine(s, p) {
		var g = geo(s.c), cells = s.cells, sc = 0, kk = g.k, wins = g.wins;
		for (var i = 0; i < wins.length; i++) {
			var w = wins[i], a = 0, b = 0;
			for (var j = 0; j < kk; j++) { var v = cells[w[j]]; if (v === 0) a++; else if (v === 1) b++; }
			if (a && b) continue;
			if (a) sc += WSC[Math.min(a * 8 / kk, 8) | 0] * (a === kk - 1 ? 3 : 1);
			else if (b) sc -= WSC[Math.min(b * 8 / kk, 8) | 0] * (b === kk - 1 ? 3 : 1);
		}
		if (s.c.mis) sc = -sc;
		return p === 0 ? sc : -sc;
	}
	/** how much a cell matters right now (for move ordering): open windows through it, weighted by stones in them */
	function cellValue(s, i) {
		var g = geo(s.c), cells = s.cells, ws = g.cellWins[i], sc = 0;
		for (var q = 0; q < ws.length; q++) {
			var w = g.wins[ws[q]], a = 0, b = 0;
			for (var j = 0; j < g.k; j++) { var v = cells[w[j]]; if (v === 0) a++; else if (v === 1) b++; }
			if (a && b) continue;
			sc += 1 + WSC[Math.min((a + b) * 8 / g.k, 8) | 0];
		}
		return sc;
	}
	/** candidate moves for a line game, best first (on big boards only cells near stones) */
	function candidates(s, limit) {
		var L = T.legal(s), g = geo(s.c);
		if (!s.c.grav && g.d === 1 && g.N > 49 && s.hist.length) {
			var near = {}, R = 2;
			for (var i = 0; i < g.N; i++) {
				if (s.cells[i] < 0) continue;
				var x = i % g.w, y = (i / g.w) | 0;
				for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
					var X = x + dx, Y = y + dy;
					if (X >= 0 && X < g.w && Y >= 0 && Y < g.h) near[Y * g.w + X] = 1;
				}
			}
			L = L.filter(function (m) { return near[m.c]; });
		}
		var scored = L.map(function (m) { return { m: m, v: cellValue(s, m.c) }; });
		scored.sort(function (a, b) { return b.v - a.v; });
		if (limit && scored.length > limit) scored.length = limit;
		return scored.map(function (o) { return o.m; });
	}
	function alphabeta(s, depth, alpha, beta, ctx, ply) {
		if (s.win) return s.win.p < 0 ? 0 : (s.win.p === s.turn ? 1 : -1) * (1e9 - ply);
		if (depth === 0) return evalLine(s, s.turn);
		if (now() > ctx.stop) throw "time";
		var kk = key(s) + "|" + depth, tt = ctx.tt.get(kk), a0 = alpha;
		if (tt !== undefined) return tt;
		var M = candidates(s, ctx.width), best = -Infinity;
		for (var i = 0; i < M.length; i++) {
			var v = -alphabeta(T.play(s, M[i]), depth - 1, -beta, -alpha, ctx, ply + 1);
			if (v > best) best = v;
			if (best > alpha) alpha = best;
			if (alpha >= beta) break;
		}
		if (best === -Infinity) best = 0;
		if (best > a0 && best < beta) ctx.tt.set(kk, best);     // only exact values (not cut-off bounds)
		return best;
	}
	function searchLine(s, ms, r) {
		var ctx = { stop: now() + ms, tt: new Map(), width: geo(s.c).N > 49 ? 12 : 20 };
		var root = candidates(s, geo(s.c).N > 49 ? 16 : 0), best = root[0], bestV = -Infinity, depth = 1;
		try {
			for (; depth <= 12; depth++) {
				var vals = [];
				for (var i = 0; i < root.length; i++) vals.push({ m: root[i], v: -alphabeta(T.play(s, root[i]), depth - 1, -Infinity, Infinity, ctx, 1) });
				vals.sort(function (a, b) { return b.v - a.v; });
				// break ties randomly so the computer doesn't play the same game every time
				var top = vals.filter(function (o) { return o.v === vals[0].v; });
				best = top[(r() * top.length) | 0].m; bestV = vals[0].v;
				root = vals.map(function (o) { return o.m; });
				if (Math.abs(bestV) > 1e8) break;    // a forced result was found
				if (depth >= s.cells.length - s.hist.length) break;
			}
		} catch (e) { if (e !== "time") throw e; }
		return { m: best, v: bestV, depth: depth };
	}

	/* ---------- Monte Carlo tree search (ultimate, notakto, numerical, wild, Order & Chaos) ---------- */
	function mcts(s, ms, r) {
		var me = s.turn, stop = now() + ms;
		function Node(st, m, parent) { this.s = st; this.m = m; this.p = parent; this.kids = null; this.untried = null; this.n = 0; this.w = 0; }
		var rootN = new Node(s, null, null), iters = 0;
		while (now() < stop || iters < 50) {
			var node = rootN;
			// select
			while (node.untried && node.untried.length === 0 && node.kids.length) {
				var bestK = null, bestU = -Infinity, ln = Math.log(node.n);
				for (var i = 0; i < node.kids.length; i++) {
					var k = node.kids[i], u = k.w / k.n + 1.2 * Math.sqrt(ln / k.n);
					if (u > bestU) { bestU = u; bestK = k; }
				}
				node = bestK;
			}
			// expand
			if (!node.untried) { node.untried = node.s.win ? [] : T.legal(node.s); node.kids = []; }
			if (node.untried.length) {
				var mi = (r() * node.untried.length) | 0, mv = node.untried[mi];
				node.untried[mi] = node.untried[node.untried.length - 1]; node.untried.pop();
				var child = new Node(T.play(node.s, mv), mv, node);
				node.kids.push(child); node = child;
			}
			// play out at random
			var ps = T.clone(node.s), guard = 0;
			while (!ps.win && guard++ < 400) {
				var L = T.legal(ps);
				if (!L.length) { ps.win = { p: -1 }; break; }
				T.apply(ps, L[(r() * L.length) | 0]);
			}
			var res = ps.win ? ps.win.p : -1;
			// back up: a node's w counts wins for the player who made the move into it
			for (var nd = node; nd; nd = nd.p) {
				nd.n++;
				if (nd.p) { var mover = nd.p.s.turn; nd.w += res === mover ? 1 : res < 0 ? 0.5 : 0; }
			}
			iters++;
		}
		var best = null, bn = -1;
		for (var j = 0; j < (rootN.kids || []).length; j++) if (rootN.kids[j].n > bn) { bn = rootN.kids[j].n; best = rootN.kids[j]; }
		return { m: best ? best.m : T.legal(s)[0], iters: iters, v: best ? best.w / best.n : 0.5, me: me };
	}

	/* ---------- the computer's move ---------- */
	/** level: "easy" | "medium" | "hard"; opts: {ms (time for hard), seed}. Returns {m, how} */
	T.think = function (s, level, opts) {
		opts = opts || {};
		var r = rng(opts.seed), L = T.legal(s);
		if (!L.length) return null;
		if (L.length === 1) return { m: L[0], how: "only" };
		var i, wins = [], safe = [];
		for (i = 0; i < L.length && i < 600; i++) if (winsNow(s, L[i])) wins.push(L[i]);
		if (level === "easy") {
			if (wins.length && r() < 0.6) return { m: wins[0], how: "win" };
			return { m: easyPick(s, L, r), how: "random" };
		}
		if (wins.length) return { m: wins[(r() * wins.length) | 0], how: "win" };
		// moves that don't hand the other player an immediate win (or lose at once, misere / notakto)
		var big = L.length > 120;
		for (i = 0; i < L.length; i++) {
			if (losesNow(s, L[i])) continue;
			if (!big && givesWin(T.play(s, L[i]))) continue;
			safe.push(L[i]);
		}
		var pool = safe.length ? safe : L;
		if (level === "medium") {
			if (r() < 0.45) return { m: pool[(r() * pool.length) | 0], how: "safe" };
			return deep(s, pool, r, 180, true);
		}
		return deep(s, pool, r, opts.ms || 900, false);
	};
	function easyPick(s, L, r) {
		if (s.c.t === "line" && geo(s.c).N > 49) { var C = candidates(s, 10); if (C.length) return C[(r() * C.length) | 0]; }
		return L[(r() * L.length) | 0];
	}
	/** does the player to move in t have a move that wins at once? */
	function givesWin(t) {
		if (t.win) return false;
		var L = T.legal(t);
		for (var i = 0; i < L.length; i++) if (winsNow(t, L[i])) return true;
		return false;
	}
	function deep(s, pool, r, ms, light) {
		var empties = 0;
		for (var i = 0; i < s.cells.length; i++) if (s.cells[i] < 0) empties++;
		// small enough to solve exactly?
		if (!light && (empties <= 10 || s.cells.length <= 9)) {
			var sv = T.solveMoves(s, s.c.t === "num" ? 250000 : 600000);
			if (sv) {
				var top = sv.reduce(function (a, o) { return Math.max(a, o.v); }, -Infinity);
				var best = sv.filter(function (o) { return o.v === top; });
				return { m: best[(r() * best.length) | 0].m, how: "solved", v: top };
			}
		}
		var t = s.c.t;
		if (t === "line" && !s.c.wild) {
			var res = searchLine(s, ms, r);
			var ok = pool.some(function (m) { return m.c === res.m.c; });
			return { m: ok ? res.m : pool[0], how: "search", depth: res.depth };
		}
		var mc = mcts(s, ms, r);
		return { m: mc.m, how: "mcts", iters: mc.iters };
	};

	/* ---------- statistics helpers ---------- */
	/** "x" / "o" label of a player in this config */
	T.playerName = function (c, p) {
		if (c.t === "oc") return p === 0 ? "Order" : "Chaos";
		if (c.t === "notakto") return p === 0 ? "Player 1" : "Player 2";
		if (c.t === "num") return p === 0 ? "Odd" : "Even";
		if (c.wild) return p === 0 ? "Player 1" : "Player 2";
		return p === 0 ? "X" : "O";
	};

	if (typeof module !== "undefined" && module.exports) module.exports = T;
	root.MESTTT = T;
})(typeof self !== "undefined" ? self : this);
