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

	/* ---------- Hive games ----------
	   Every action is a custom_json operation with id "mes_ttt", signed with the player's posting key. Nothing else decides the game:
	   both browsers read both players' account histories and run build() on the same operations, so they always agree.
	     {"a":"open","g":"<8 chars>","v":"<game code>","f":"host|guest|random"[,"to":"account"][,"re":"host/gid"]}   by the host
	     {"a":"join","h":"<host>","g":"<gid>"}                                                                         by the guest
	     {"a":"mv","h":"<host>","g":"<gid>","n":<move number from 0>,"m":"<move string>"}
	     {"a":"res","h","g"}  resign   ·   {"a":"claim","h","g"}  win when the other player has not acted for CLAIM_S on their turn
	     {"a":"cancel","h","g"}  the host withdraws an open game nobody has joined
	   Order = block number, then position in the block (account-history "i" breaks ties for one account; operations of two accounts
	   in the same block are ordered by trx id, which both sides see the same). First valid join wins the seat. "random" first player:
	   parity of the first hex digit of sha-free mix of the two transaction ids (charCode sum), the same for both sides. */
	var H = T.hive = { ID: "mes_ttt", CLAIM_S: 300, OPEN_S: 3600, GID_RE: /^[a-z0-9]{8}$/, ACCT_RE: /^[a-z][a-z0-9.-]{2,15}$/ };
	/** account-history entries -> our operations [{a, g, h, ..., acct, trx, block, ts (ms), i}] (anything else is skipped) */
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
	/** keep only well-formed operations, with only the known fields */
	H.clean = function (j) {
		if (!j || typeof j !== "object" || !H.GID_RE.test(String(j.g))) return null;
		var a = j.a, o = { a: a, g: j.g };
		if (a === "open") {
			if (!T.parseCode(j.v)) return null;
			o.v = j.v; o.f = ["host", "guest", "random"].indexOf(j.f) >= 0 ? j.f : "host";
			if (j.to !== undefined) { if (!H.ACCT_RE.test(String(j.to))) return null; o.to = j.to; }
			if (j.re !== undefined && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(String(j.re))) o.re = j.re;
			return o;
		}
		if (!H.ACCT_RE.test(String(j.h))) return null;
		o.h = j.h;
		if (a === "join" || a === "res" || a === "claim" || a === "cancel") return o;
		if (a === "mv") {
			if (typeof j.n !== "number" || j.n < 0 || j.n > 400 || (j.n | 0) !== j.n || !T.mparse(j.m)) return null;
			o.n = j.n; o.m = String(j.m);
			return o;
		}
		return null;
	};
	H.json = function (o) { var c = {}; for (var k in o) if (["a", "g", "v", "f", "to", "re", "h", "n", "m"].indexOf(k) >= 0) c[k] = o[k]; return JSON.stringify(c); };
	H.newGid = function (r) { var A = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; r = r || Math.random; for (var i = 0; i < 8; i++) s += A[(r() * A.length) | 0]; return s; };
	function order(a, b) { return (a.block || Infinity) - (b.block || Infinity) || (a.acct === b.acct ? a.i - b.i : a.trx < b.trx ? -1 : a.trx > b.trx ? 1 : 0) || (a.ts - b.ts); }
	H.order = order;
	/** who plays first (seat 0) for a "random" game: the same answer on both sides */
	H.coin = function (trxA, trxB) { var s = String(trxA) + String(trxB), n = 0; for (var i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 2; };
	/**
	 * Work out a Hive game from operations (any accounts, any games: only this game's are used).
	 * host, gid: the game; ops: parsed operations of the host + guest (+ other joiners); now: ms (for "can claim").
	 * -> {ok, open, host, guest, players: [seat0, seat1], s (rules state), status "none|wait|play|over|cancelled", win, lastTs, turnAcct, canClaimAt}
	 */
	H.build = function (host, gid, ops, now) {
		var mine = ops.filter(function (o) { return o.g === gid && (o.a === "open" ? o.acct === host : o.h === host); }).sort(order);
		var R = { host: host, gid: gid, open: null, guest: null, players: [null, null], s: null, status: "none", win: null, lastTs: 0, turnAcct: null, canClaimAt: 0, why: "" };
		for (var i = 0; i < mine.length; i++) {
			var o = mine[i];
			if (!R.open) {
				if (o.a === "open") { R.open = o; R.cfg = T.parseCode(o.v); R.s = T.create(R.cfg); R.status = "wait"; R.lastTs = o.ts; }
				continue;
			}
			if (o.a === "open") continue;                 // a second open with the same id: ignored
			if (R.status === "wait") {
				if (o.a === "cancel" && o.acct === host) { R.status = "cancelled"; R.lastTs = o.ts; continue; }
				if (o.a === "join" && o.acct !== host && (!R.open.to || R.open.to === o.acct)) {
					R.guest = o.acct; R.join = o;
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
				var m = T.mparse(o.m);
				if (!T.isLegal(R.s, m)) continue;
				T.apply(R.s, m); R.lastTs = o.ts;
				if (R.s.win) { R.status = "over"; R.win = { p: R.s.win.p, why: R.s.win.why }; }
			} else if (o.a === "res") {
				R.status = "over"; R.win = { p: 1 - seat, why: "resign" }; R.s.win = { p: 1 - seat, line: null, why: "resign" };
			} else if (o.a === "claim") {
				if (R.s.turn !== seat && o.ts - R.lastTs >= H.CLAIM_S * 1000) {
					R.status = "over"; R.win = { p: seat, why: "timeout" }; R.s.win = { p: seat, line: null, why: "timeout" };
				}
			}
		}
		if (R.status === "wait" && now && R.open && now - R.open.ts > H.OPEN_S * 1000) R.status = "expired";
		if (R.status === "play") { R.turnAcct = R.players[R.s.turn]; R.canClaimAt = R.lastTs + H.CLAIM_S * 1000; }
		R.ok = R.status !== "none";
		return R;
	};
	/** the games an account opened or joined, newest first: [{host, gid, role, v?, ts}] */
	H.myGames = function (acct, ops) {
		var seen = {}, out = [];
		ops.filter(function (o) { return o.acct === acct && (o.a === "open" || o.a === "join"); }).sort(order).reverse().forEach(function (o) {
			var host = o.a === "open" ? acct : o.h, k = host + "/" + o.g;
			if (seen[k]) return; seen[k] = 1;
			out.push({ host: host, gid: o.g, role: o.a === "open" ? "host" : "guest", v: o.v, to: o.to, re: o.re, ts: o.ts });
		});
		return out;
	};

	if (typeof module !== "undefined" && module.exports) module.exports = T;
	root.MESTTT = T;
})(typeof self !== "undefined" ? self : this);

/* MES Tic-Tac-Toe: the page (setup, board, computer, replay, online games via /api/ttt, statistics, rules).
   The same served file is also started as a Web Worker that runs the computer's thinking (see the top).
   Online: /api/ttt on mes.fm; on localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in kept in
   localStorage "mes-ttt:mock" is used instead, so two tabs of the page can play each other. */
(function () {
	"use strict";
	var T = (typeof self !== "undefined" ? self : window).MESTTT;

	function compute(q) {
		var s = T.replay(T.parseCode(q.code), q.moves);
		if (!s) return null;
		var r = T.think(s, q.level, { ms: q.ms });
		return r ? { m: T.mstr(r.m), how: r.how } : null;
	}
	if (typeof document === "undefined") {          // running as the Web Worker
		self.onmessage = function (e) {
			var r = null;
			try { r = compute(e.data); } catch (err) { r = null; }
			self.postMessage({ id: e.data.id, r: r });
		};
		return;
	}

	var SCRIPT = document.currentScript && document.currentScript.src;
	var root = document.getElementById("tt");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-tic-tac-toe:v1";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

	/* ---------- saved settings ---------- */
	var S = { game: "classic", custom: { w: 5, h: 5, d: 1, k: 4, g: false, m: false, x: false }, opp: "cpu", lv: "medium", me: "first", alt: 0,
		name: "", ofirst: "host", opub: true, cur: null, stats: {}, online: null, orec: {} };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var k in saved) S[k] = saved[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

	/* ---------- worker ---------- */
	var worker = null, wid = 0, waiting = {};
	try {
		if (SCRIPT && typeof Worker !== "undefined" && !/noworker/.test(location.search)) {
			worker = new Worker(SCRIPT);
			worker.onmessage = function (e) { var f = waiting[e.data.id]; if (f) { delete waiting[e.data.id]; f(e.data.r); } };
			worker.onerror = function () { worker = null; Object.keys(waiting).forEach(function (k) { var f = waiting[k]; delete waiting[k]; f(undefined); }); };
		}
	} catch (e) { worker = null; }
	function ask(q) {
		return new Promise(function (res) {
			var local = function () { setTimeout(function () { try { res(compute(q)); } catch (e) { res(null); } }, 20); };
			if (!worker) return local();
			var id = ++wid;
			waiting[id] = function (r) { if (r === undefined) local(); else res(r); };
			worker.postMessage({ id: id, code: q.code, moves: q.moves, level: q.level, ms: q.ms });
		});
	}

	/* ---------- game state ---------- */
	var cfg, code, st, mode = "cpu", human = 0, vi = null, busy = false, gen = 0, hint = null, cur = -1, kbd = false;
	var sel = { sym: 0, num: 0 };
	var score = { w: 0, d: 0, l: 0, a: 0, b: 0 };
	var LV_MS = { easy: 300, medium: 400, hard: 1100 };

	function setupCfg() {
		if (S.game === "custom") {
			var c = S.custom;
			return T.parseCode(T.cfgCode({ t: "line", w: +c.w, h: +c.h, d: +c.d || 1, k: +c.k, mis: !!c.m, grav: !!c.g, wild: !!c.x }));
		}
		var p = T.preset(S.game) || T.PRESETS[0];
		return T.parseCode(p.code);
	}
	function setGame(newCfg, moves, opts) {
		opts = opts || {};
		cfg = newCfg; code = T.cfgCode(cfg);
		st = T.replay(cfg, moves || []) || T.create(cfg);
		vi = null; hint = null; busy = false; gen++; cur = -1;
		sel.sym = 0; sel.num = 0;
		if (!opts.keepMode) mode = S.opp;
		if (opts.human !== undefined) human = opts.human;
		storeCur();
		render();
		maybeCpu();
	}
	function newGame() {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first (button above the board).");
		var c = setupCfg();
		if (!c) return toast("That board doesn't work: check the custom settings.");
		mode = S.opp;
		if (mode === "cpu") {
			if (S.me === "first") human = 0;
			else if (S.me === "second") human = 1;
			else { human = S.alt % 2; S.alt++; }
		}
		setGame(c, [], { human: human });
	}
	function storeCur() {
		if (mode === "online") return;
		S.cur = { code: code, moves: st.hist.slice(), mode: mode, human: human, done: !!st.win };
		save();
	}
	function viewState() { return vi === null ? st : T.replay(cfg, st.hist.slice(0, vi)); }
	function isHumanTurn() {
		if (mode === "local") return true;
		if (mode === "cpu") return st.turn === human;
		if (mode === "online") return on.g && on.g.status === "play" && st.turn === on.seat;
		if (mode === "hive") return hv.R && hv.R.status === "play" && hv.R.turnAcct === hMe();
		return false;
	}
	function canInput() { return !st.win && vi === null && !busy && isHumanTurn() && !(mode === "online" && on.sending) && !(mode === "hive" && (hv.busy || hv.pending.some(function (p) { return p.a === "mv"; }))); }

	/* ---------- the computer ---------- */
	function maybeCpu() {
		if (mode !== "cpu" || st.win || st.turn === human || busy) return;
		busy = true;
		var g = gen, t0 = Date.now();
		render();
		ask({ code: code, moves: st.hist.slice(), level: S.lv, ms: LV_MS[S.lv] }).then(function (r) {
			var wait = Math.max(0, (S.lv === "hard" ? 250 : 450) - (Date.now() - t0));
			setTimeout(function () {
				if (g !== gen) return;
				busy = false;
				var m = r && T.mparse(r.m);
				if (!m || !T.isLegal(st, m)) { var L = T.legal(st); m = L[(Math.random() * L.length) | 0]; }
				if (m) commit(m);
			}, wait);
		});
	}

	/* ---------- moves ---------- */
	function buildMove(i) {
		var c = cfg, m = { c: i };
		if (c.t === "line" && c.grav) { var g = T.geo(c); m.c = T.dropCell(st, i % g.w); if (m.c < 0) return null; }
		if ((c.t === "line" && c.wild) || c.t === "oc") m.s = sel.sym;
		if (c.t === "num") {
			var mine = T.numbersOf(st.turn).filter(function (v) { return !(st.used & (1 << v)); });
			if (mine.indexOf(sel.num) < 0) sel.num = mine[0];
			m.n = sel.num;
		}
		return m;
	}
	function humanMove(i) {
		if (!canInput()) {
			if (vi !== null) toast("You are looking back at an earlier move: press ⏭ to return.");
			return;
		}
		var m = buildMove(i);
		if (!m || !T.isLegal(st, m)) {
			if (cfg.t === "ult" && st.cells[i] < 0) toast(st.next >= 0 ? "You have to play in the highlighted board." : "That board is already decided.");
			else if (cfg.t === "notakto" && st.dead[(i / 9) | 0]) toast("That board is dead: play on another one.");
			else if (cfg.grav) toast("That column is full.");
			return;
		}
		if (mode === "online") return onlineMove(m);
		if (mode === "hive") return hiveMove(m);
		commit(m);
	}
	function commit(m) {
		T.apply(st, m);
		vi = null; hint = null;
		if (cfg.t === "num") sel.num = 0;
		storeCur();
		render(true);
		if (st.win) finish(); else maybeCpu();
	}
	function finish() {
		if (st._fin) return;
		st._fin = true;
		var w = st.win, msg;
		if (mode === "local") {
			if (w.p < 0) score.d++; else if (w.p === 0) score.a++; else score.b++;
			msg = w.p < 0 ? "Draw." : T.playerName(cfg, w.p) + " wins!";
		} else {
			var me = mode === "cpu" ? human : mode === "hive" ? (hv.R ? hv.R.players.indexOf(hMe()) : -1) : on.seat, res = w.p < 0 ? "d" : w.p === me ? "w" : "l";
			if (me < 0) { toast(w.p < 0 ? "Draw." : T.playerName(cfg, w.p) + " wins."); return; }
			score[res]++;
			var key = code + "|" + (mode === "cpu" ? S.lv : mode);
			var rec = true;
			if (mode === "online" || mode === "hive") { var tag = mode === "hive" ? "h:" + hv.host + "/" + hv.gid : on.id + ":" + (on.g ? on.g.round : 0); if (S.orec[tag]) rec = false; else S.orec[tag] = 1; pruneOrec(); }
			if (rec) { var a = S.stats[key] || [0, 0, 0]; a[res === "w" ? 0 : res === "d" ? 1 : 2]++; S.stats[key] = a; }
			msg = res === "w" ? "You win! 🎉" : res === "d" ? "Draw." : (mode === "cpu" ? "The computer wins." : "You lost this one.");
			save();
		}
		toast(msg);
		renderScore();
		renderStats();
	}
	function pruneOrec() { var k = Object.keys(S.orec); if (k.length > 60) k.slice(0, k.length - 60).forEach(function (x) { delete S.orec[x]; }); }
	function undo() {
		if (mode === "online" || mode === "hive" || busy || !st.hist.length) return;
		var h = st.hist.slice();
		if (mode === "cpu") {
			h.pop();
			var t = T.replay(cfg, h);
			while (h.length && t && t.turn !== human) { h.pop(); t = T.replay(cfg, h); }
			if (!t || t.turn !== human) { // the computer moved first and nothing of mine to undo
				if (!h.length && human === 1) { setGame(cfg, [], { human: human, keepMode: true }); return; }
			}
		} else h.pop();
		gen++; busy = false;
		setGame(cfg, h, { human: human, keepMode: true });
	}
	function doHint() {
		if (!canInput()) return;
		var g = gen;
		$("tt-hint").disabled = true;
		ask({ code: code, moves: st.hist.slice(), level: "hard", ms: 700 }).then(function (r) {
			$("tt-hint").disabled = false;
			if (g !== gen || !r) return;
			var m = T.mparse(r.m);
			hint = m.c;
			if (m.s !== undefined) sel.sym = m.s;
			if (m.n) sel.num = m.n;
			render();
			var desc = m.s !== undefined ? " (play " + (m.s ? "O" : "X") + ")" : m.n ? " (play " + m.n + ")" : "";
			toast("Hint: the orange cell" + desc + ".");
			setTimeout(function () { if (hint === m.c && g === gen) { hint = null; render(); } }, 3500);
		});
	}

	/* ---------- board layout ---------- */
	function wideView() { return (root.clientWidth || 800) >= 640 || $("tt-view").classList.contains("tt-fill"); }
	/** cells: [{i, x, y, s, gx, gy}] in SVG units, plus width / height and per-board frames */
	function layout() {
		var c = cfg, cells = [], frames = [], W, H, S0 = 100, i, x, y;
		if (c.t === "line" || c.t === "oc" || c.t === "num") {
			var g = T.geo(c);
			if (g.d === 1) {
				for (i = 0; i < g.N; i++) { x = i % g.w; y = (i / g.w) | 0; cells.push({ i: i, x: x * S0, y: y * S0, s: S0, gx: x, gy: y }); }
				W = g.w * S0; H = g.h * S0;
			} else {
				var cols = wideView() ? g.d : 2, gap = 50, top = 34, lw = g.w * S0, lh = g.h * S0;
				for (var z = 0; z < g.d; z++) {
					var lc = z % cols, lr = (z / cols) | 0, ox = lc * (lw + gap), oy = lr * (lh + gap + top) + top;
					frames.push({ x: ox, y: oy, w: lw, h: lh, label: "Layer " + (z + 1), lx: ox + lw / 2, ly: oy - 10 });
					for (y = 0; y < g.h; y++) for (x = 0; x < g.w; x++) {
						i = z * g.w * g.h + y * g.w + x;
						cells.push({ i: i, x: ox + x * S0, y: oy + y * S0, s: S0, gx: lc * (g.w + 1) + x, gy: lr * (g.h + 1) + y });
					}
				}
				var rows = Math.ceil(g.d / cols);
				W = cols * lw + (cols - 1) * gap; H = rows * (lh + top) + (rows - 1) * gap;
			}
		} else if (c.t === "ult") {
			var gp = 26;
			for (var b = 0; b < 9; b++) {
				var bx = (b % 3) * (3 * S0 + gp), by = ((b / 3) | 0) * (3 * S0 + gp);
				frames.push({ x: bx, y: by, w: 3 * S0, h: 3 * S0, b: b });
				for (var ci = 0; ci < 9; ci++) cells.push({ i: b * 9 + ci, x: bx + (ci % 3) * S0, y: by + ((ci / 3) | 0) * S0, s: S0, gx: (b % 3) * 3 + ci % 3, gy: ((b / 3) | 0) * 3 + ((ci / 3) | 0) });
			}
			W = H = 9 * S0 + 2 * gp;
		} else if (c.t === "notakto") {
			var nc = Math.min(c.nb, wideView() ? 5 : 3), gp2 = 50;
			for (var n = 0; n < c.nb; n++) {
				var ox2 = (n % nc) * (3 * S0 + gp2), oy2 = ((n / nc) | 0) * (3 * S0 + gp2);
				frames.push({ x: ox2, y: oy2, w: 3 * S0, h: 3 * S0, b: n });
				for (var cj = 0; cj < 9; cj++) cells.push({ i: n * 9 + cj, x: ox2 + (cj % 3) * S0, y: oy2 + ((cj / 3) | 0) * S0, s: S0, gx: (n % nc) * 4 + cj % 3, gy: ((n / nc) | 0) * 4 + ((cj / 3) | 0) });
			}
			W = nc * 3 * S0 + (nc - 1) * gp2; var nr = Math.ceil(c.nb / nc); H = nr * 3 * S0 + (nr - 1) * gp2;
		}
		var byI = {};
		cells.forEach(function (o) { byI[o.i] = o; });
		return { W: W, H: H, cells: cells, frames: frames, byI: byI };
	}
	function pieceX(o, cls) {
		var p = o.s * 0.24, a = o.x + p, b = o.y + p, e = o.x + o.s - p, f = o.y + o.s - p, sw = o.s * 0.11;
		return '<path class="' + (cls || "tt-x") + '" stroke-width="' + sw + '" d="M' + a + " " + b + "L" + e + " " + f + "M" + e + " " + b + "L" + a + " " + f + '"/>';
	}
	function pieceO(o) { return '<circle class="tt-o" stroke-width="' + o.s * 0.1 + '" cx="' + (o.x + o.s / 2) + '" cy="' + (o.y + o.s / 2) + '" r="' + o.s * 0.29 + '"/>'; }

	function drawBoard(s, popCell) {
		var c = cfg, Lo = layout(), out = [], pad = 8, live = canInput();
		var legalSet = {};
		if (live) T.legal(s).forEach(function (m) { legalSet[m.c] = 1; });
		var winSet = {};
		if (s.win && s.win.line && !s.win.sub) s.win.line.forEach(function (i) { winSet[i] = 1; });
		out.push('<rect class="tt-bgr" x="' + (-pad) + '" y="' + (-pad) + '" width="' + (Lo.W + 2 * pad) + '" height="' + (Lo.H + 2 * pad) + '" rx="12"/>');
		var gw = c.t === "line" && c.grav ? T.geo(c).w : 0, cols = {};
		Lo.cells.forEach(function (o) {
			var v = s.cells[o.i], cls = "tt-c";
			var dead = c.t === "notakto" && s.dead[(o.i / 9) | 0];
			if (dead) cls += " is-dead";
			else if (winSet[o.i]) cls += " is-win";
			else if (hint === o.i) cls += " is-hint";
			else if (o.i === s.last) cls += " is-last";
			if (!live || (v >= 0) || (!legalSet[o.i] && !gw)) cls += " is-off";
			var r = '<rect class="' + cls + '" data-i="' + o.i + '" x="' + o.x + '" y="' + o.y + '" width="' + o.s + '" height="' + o.s + '"/>';
			if (gw) { var col = o.i % gw; (cols[col] = cols[col] || []).push(r); } else out.push(r);
		});
		if (gw) Object.keys(cols).forEach(function (col) { out.push('<g class="tt-col">' + cols[col].join("") + "</g>"); });
		// frames: thick lines round small boards, the boards you may play in, won boards
		Lo.frames.forEach(function (f) {
			if (f.label) out.push('<text class="tt-lbl" x="' + f.lx + '" y="' + f.ly + '">' + f.label + "</text>");
			out.push('<rect class="tt-sub" x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" rx="4"/>');
		});
		// pieces
		Lo.cells.forEach(function (o) {
			var v = s.cells[o.i];
			if (v < 0) return;
			var pc;
			if (c.t === "num") pc = '<text class="tt-num p' + (v % 2 ? 0 : 1) + '" x="' + (o.x + o.s / 2) + '" y="' + (o.y + o.s / 2 + 2) + '" font-size="' + o.s * 0.56 + '">' + v + "</text>";
			else if (c.t === "notakto") pc = pieceX(o, "tt-xn");
			else pc = v === 0 ? pieceX(o) : pieceO(o);
			if (o.i === popCell) pc = '<g class="tt-pop">' + pc + "</g>";
			out.push(pc);
		});
		if (c.t === "ult") {
			Lo.frames.forEach(function (f) {
				var sv = s.sub[f.b];
				if (sv === 2) out.push('<rect class="tt-drawn" x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" rx="4"/>');
				else if (sv >= 0) {
					var big = { x: f.x, y: f.y, s: f.w };
					out.push('<rect class="tt-bgr" opacity="0.72" x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '"/>');
					out.push('<g class="tt-big">' + (sv === 0 ? pieceX(big) : pieceO(big)) + "</g>");
				}
				if (live && sv < 0 && (s.next < 0 || s.next === f.b)) out.push('<rect class="tt-okframe" x="' + (f.x - 4) + '" y="' + (f.y - 4) + '" width="' + (f.w + 8) + '" height="' + (f.h + 8) + '" rx="8"/>');
				if (s.win && s.win.sub && s.win.line.indexOf(f.b) >= 0) out.push('<rect class="tt-okframe" style="stroke:var(--tt-win)" x="' + (f.x - 4) + '" y="' + (f.y - 4) + '" width="' + (f.w + 8) + '" height="' + (f.h + 8) + '" rx="8"/>');
			});
		}
		// win line through the cells (flat boards)
		if (s.win && s.win.line && !s.win.sub && c.t !== "notakto") {
			var a = Lo.byI[s.win.line[0]], e = Lo.byI[s.win.line[s.win.line.length - 1]];
			var flat = cfg.t !== "line" || T.geo(cfg).d === 1;
			if (a && e && flat) {
				var d = 'x1="' + (a.x + a.s / 2) + '" y1="' + (a.y + a.s / 2) + '" x2="' + (e.x + e.s / 2) + '" y2="' + (e.y + e.s / 2) + '"';
				out.push("<line class=\"tt-wl\" " + d + "/><line class=\"tt-wl2\" " + d + "/>");
			}
		}
		if (kbd && cur >= 0 && Lo.byI[cur]) { var q = Lo.byI[cur]; out.push('<rect class="tt-cur" x="' + (q.x + 4) + '" y="' + (q.y + 4) + '" width="' + (q.s - 8) + '" height="' + (q.s - 8) + '" rx="8"/>'); }
		var bd = $("tt-board");
		bd.classList.toggle("is-wide", Lo.W > Lo.H * 1.25);
		bd.innerHTML = '<svg viewBox="' + (-pad) + " " + (-pad) + " " + (Lo.W + 2 * pad) + " " + (Lo.H + 2 * pad) + '" role="img" aria-label="' + esc(boardLabel(s)) + '">' + out.join("") + "</svg>";
		bd._lo = Lo;
	}
	function boardLabel(s) {
		var n = 0; for (var i = 0; i < s.cells.length; i++) if (s.cells[i] >= 0) n++;
		return T.describe(cfg) + " board, " + n + " pieces placed";
	}

	/* ---------- render ---------- */
	function nameOf(p) {
		var base = T.playerName(cfg, p);
		if (mode === "cpu") return (p === human ? "You" : "Computer") + " (" + base + ")";
		if (mode === "online" && on.g) { var nm = on.g.names[p] || "waiting…"; return (p === on.seat ? "You" : esc(nm)) + " (" + base + ")"; }
		if (mode === "hive" && hv.R) { var hn = hv.R.players[p]; return (hn && hn === hMe() ? "You" : hn ? "@" + esc(hn) : "waiting…") + " (" + base + ")"; }
		return base;
	}
	function youAre(p) { return (mode === "cpu" && p === human) || (mode === "online" && p === on.seat) || (mode === "hive" && hv.R && hv.R.players[p] === hMe()); }
	function sym(p) { var cls = cfg.t === "notakto" || cfg.t === "num" ? "" : (p === 0 ? "tt-sx" : "tt-so"); return '<span class="' + cls + '">' + nameOf(p) + "</span>"; }
	function statusText(s) {
		if (mode === "online" && on.g && on.g.status === "wait") return "Waiting for someone to join…";
		if (mode === "hive") {
			if (!hv.R || !hv.R.open) return "Reading the game from Hive…";
			if (hv.R.status === "wait") return "Waiting for a player (Hive game)…";
			if (hv.busy) return "Approve it in Hive Keychain…";
			if (!s.win && hv.pending.length) return "Sent: waiting for the next Hive block…";
		}
		if (s.win) {
			var lp = 1 - s.win.p, loser = youAre(lp) ? "you" : nameOf(lp).split(" (")[0];
			var why = { resign: " (" + loser + " resigned)", timeout: " (" + loser + (youAre(lp) ? " were" : " was") + " away too long)", left: " (" + loser + " left)" }[s.win.why] || "";
			if (s.win.p < 0) return s.win.why === "full" ? "Draw: the board is full." : "Draw.";
			var W = function (p) { return youAre(p) ? "<b>You win</b>" : sym(p) + " wins"; };
			if (why) return W(s.win.p) + why + ".";
			if (cfg.t === "oc") return s.win.p === 0 ? W(0) + ": five in a row!" : W(1) + ": the board filled up with no five in a row.";
			if (cfg.t === "notakto") return W(s.win.p) + ": " + (youAre(1 - s.win.p) ? "you" : mode === "cpu" ? "the computer" : "the other player") + " killed the last board.";
			if (cfg.t === "line" && cfg.mis && s.win.why === "line-lose") return W(s.win.p) + ": " + (youAre(1 - s.win.p) ? "you" : mode === "cpu" ? "the computer" : "the other player") + " made a line.";
			if (youAre(s.win.p)) return '<span class="' + (cfg.t === "notakto" || cfg.t === "num" ? "" : s.win.p === 0 ? "tt-sx" : "tt-so") + '">You win' + why + "!</span> 🎉";
			return sym(s.win.p) + " wins" + why + "!";
		}
		if (vi !== null) return "Looking back: move " + vi + " of " + st.hist.length + ".";
		if (busy) return "The computer is thinking…";
		var t = sym(s.turn) + (mode === "cpu" && !isHumanTurn() ? " is thinking…" : " to play");
		if (cfg.t === "ult") t += s.next >= 0 ? " in the green board." : " anywhere (green boards).";
		else if (cfg.t === "num") t += ": choose a number below, then a cell.";
		else if ((cfg.t === "line" && cfg.wild) || cfg.t === "oc") t += ": choose X or O, then a cell.";
		else if (cfg.grav) t += ": click a column.";
		return t;
	}
	function renderPick(s) {
		var box = $("tt-pick"), live = !s.win && vi === null;
		if ((cfg.t === "line" && cfg.wild) || cfg.t === "oc") {
			box.hidden = false;
			box.innerHTML = '<span class="tt-pl">Place:</span><button type="button" class="tt-pk tt-sx" data-sym="0" aria-pressed="' + (sel.sym === 0) + '">X</button><button type="button" class="tt-pk tt-so" data-sym="1" aria-pressed="' + (sel.sym === 1) + '">O</button>';
		} else if (cfg.t === "num") {
			box.hidden = false;
			var p = s.turn, all = T.numbersOf(p), mine = all.filter(function (v) { return !(s.used & (1 << v)); });
			if (mine.indexOf(sel.num) < 0) sel.num = mine[0] || 0;
			box.innerHTML = '<span class="tt-pl">' + (p === 0 ? "Odd" : "Even") + " numbers:</span>" + all.map(function (v) {
				var used = mine.indexOf(v) < 0;
				return '<button type="button" class="tt-pk ' + (p === 0 ? "tt-sx" : "tt-so") + '" data-num="' + v + '" aria-pressed="' + (v === sel.num && !used) + '"' + (used || !live ? " disabled" : "") + ">" + v + "</button>";
			}).join("");
		} else box.hidden = true;
	}
	function renderMoves() {
		var ol = $("tt-moves"), h = st.hist, at = vi === null ? h.length : vi;
		ol.innerHTML = h.map(function (mv, i) {
			var m = T.mparse(mv), lab = cellName(m);
			return '<li><button type="button" data-mi="' + (i + 1) + '" class="m' + (i % 2) + (i + 1 === at ? " is-cur" : "") + '">' + (i + 1) + ". " + lab + "</button></li>";
		}).join("");
		$("tt-rpos").textContent = h.length ? (at === h.length ? "Move " + at + " (now)" : "Move " + at + " of " + h.length) : "No moves yet";
		var bs = root.querySelectorAll("[data-r]");
		for (var i = 0; i < bs.length; i++) { var r = bs[i].getAttribute("data-r"); bs[i].disabled = r === "first" || r === "prev" ? at === 0 : at === h.length; }
		var li = ol.querySelector(".is-cur");
		if (li && ol.scrollHeight > ol.clientHeight) li.scrollIntoView({ block: "nearest" });
	}
	function cellName(m) {
		var c = cfg, i = m.c, s = "";
		if (c.t === "ult") s = "B" + ((i / 9 | 0) + 1) + "·" + (i % 9 + 1);
		else if (c.t === "notakto") s = (c.nb > 1 ? "B" + ((i / 9 | 0) + 1) + "·" : "") + (i % 9 + 1);
		else {
			var g = T.geo(c), x = i % g.w, y = ((i / g.w) | 0) % g.h, z = (i / (g.w * g.h)) | 0;
			s = String.fromCharCode(97 + x) + (g.h - y) + (g.d > 1 ? "·L" + (z + 1) : "");
		}
		if (m.s !== undefined) s += (m.s ? " O" : " X");
		if (m.n) s += " = " + m.n;
		return s;
	}
	function renderScore() {
		var el = $("tt-score");
		if (mode === "local") el.innerHTML = "This session: <span><b>" + score.a + "</b> " + T.playerName(cfg, 0) + "</span><span><b>" + score.b + "</b> " + T.playerName(cfg, 1) + "</span><span><b>" + score.d + "</b> draws</span>";
		else el.innerHTML = "This session: <span><b>" + score.w + "</b> won</span><span><b>" + score.d + "</b> drawn</span><span><b>" + score.l + "</b> lost</span>";
	}
	function render(pop) {
		var s = viewState();
		root.classList.toggle("tt-incpu", S.opp === "cpu");
		$("tt-status").innerHTML = statusText(s);
		renderPick(s);
		drawBoard(s, pop && vi === null ? s.last : -1);
		renderMoves();
		renderScore();
		var on1 = mode === "online" || mode === "hive";
		$("tt-undo").disabled = on1 || busy || !st.hist.length;
		$("tt-hint").disabled = !canInput() || on1;
		$("tt-undo").hidden = on1;
		$("tt-new").hidden = on1;
		$("tt-link").hidden = on1 && !st.win;
		renderObar();
		setupLock();
	}

	/* ---------- setup controls ---------- */
	function fillGameSelect() {
		var sel1 = $("tt-game"), groups = {}, order = [];
		T.PRESETS.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
		sel1.innerHTML = order.map(function (gname) {
			return '<optgroup label="' + gname + '">' + groups[gname].map(function (p) { return '<option value="' + p.id + '">' + p.name + "</option>"; }).join("") + "</optgroup>";
		}).join("") + '<optgroup label="Your own"><option value="custom">Custom board…</option></optgroup>';
		sel1.value = T.preset(S.game) || S.game === "custom" ? S.game : "classic";
	}
	function syncSetup() {
		$("tt-game").value = S.game;
		$("tt-custom").hidden = S.game !== "custom";
		var c = S.custom;
		$("tt-cw").value = c.w; $("tt-ch").value = c.h; $("tt-cd").value = c.d; $("tt-ck").value = c.k;
		$("tt-cg").checked = !!c.g; $("tt-cm").checked = !!c.m; $("tt-cx").checked = !!c.x;
		segSet("tt-opp", S.opp); segSet("tt-lv", S.lv); segSet("tt-me", S.me); segSet("tt-ofirst", S.ofirst);
		var p = T.preset(S.game), cc = setupCfg();
		$("tt-desc").textContent = p ? p.desc : cc ? "Your board: " + T.describe(cc) + "." : "";
		$("tt-cnote").textContent = S.game === "custom" && !cc ? customProblem() : "";
		$("tt-ovar").textContent = cc ? T.describe(cc) : "—";
		$("tt-name").value = S.name || "";
		$("tt-opub").checked = S.opub !== false;
	}
	function customProblem() {
		var c = S.custom;
		if (+c.k > Math.max(+c.w, +c.h, +c.d)) return "The line can't be longer than the board.";
		if (+c.d > 1 && c.g) return "Gravity only works on flat boards (1 layer).";
		if (+c.d > 1 && (+c.w > 6 || +c.h > 6)) return "3D boards can be at most 6 × 6 per layer.";
		return "Width and height 3 to 19, layers 1 to 4, line 3 to 7.";
	}
	function segSet(id, v) { var bs = $(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === v ? "true" : "false"); }
	function segWire(id, fn) {
		$(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); });
	}
	function setupLock() {
		var lock = mode === "online" || mode === "hive", els = $("tt-setup").querySelectorAll("select, input, button");
		for (var i = 0; i < els.length; i++) els[i].disabled = lock;
	}
	fillGameSelect();
	$("tt-game").addEventListener("change", function () { S.game = this.value; save(); syncSetup(); newGame(); });
	segWire("tt-opp", function (v) { S.opp = v; save(); newGame(); });
	segWire("tt-lv", function (v) { S.lv = v; save(); if (mode === "cpu" && st.hist.length && !st.win) toast("The new level plays from the computer's next move."); render(); });
	segWire("tt-me", function (v) { S.me = v; save(); newGame(); });
	segWire("tt-ofirst", function (v) { S.ofirst = v; save(); });
	var custT = null;
	["tt-cw", "tt-ch", "tt-cd", "tt-ck", "tt-cg", "tt-cm", "tt-cx"].forEach(function (id) {
		$(id).addEventListener(id === "tt-cg" || id === "tt-cm" || id === "tt-cx" ? "change" : "input", function () {
			S.custom = { w: clampN($("tt-cw").value, 3, 19, 5), h: clampN($("tt-ch").value, 3, 19, 5), d: clampN($("tt-cd").value, 1, 4, 1), k: clampN($("tt-ck").value, 3, 7, 4),
				g: $("tt-cg").checked, m: $("tt-cm").checked, x: $("tt-cx").checked };
			save();
			var cc = setupCfg();
			$("tt-cnote").textContent = cc ? "" : customProblem();
			$("tt-desc").textContent = cc ? "Your board: " + T.describe(cc) + "." : "";
			$("tt-ovar").textContent = cc ? T.describe(cc) : "—";
			clearTimeout(custT);
			if (cc) custT = setTimeout(newGame, 450);
		});
	});
	function clampN(v, a, b, d) { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(a, Math.min(b, v)); }

	/* ---------- board events ---------- */
	var board = $("tt-board");
	board.addEventListener("click", function (e) {
		var r = e.target.closest("[data-i]");
		if (!r) return;
		kbd = false;
		var i = +r.getAttribute("data-i");
		cur = i;
		humanMove(i);
	});
	board.addEventListener("keydown", function (e) {
		var Lo = board._lo; if (!Lo) return;
		var dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		if (dirs[e.key]) {
			e.preventDefault(); kbd = true;
			if (cur < 0 || !Lo.byI[cur]) { var mid = Lo.cells[(Lo.cells.length / 2) | 0]; cur = mid.i; }
			else {
				var o = Lo.byI[cur], d = dirs[e.key], best = null, bd = Infinity;
				Lo.cells.forEach(function (q) {
					var dx = q.gx - o.gx, dy = q.gy - o.gy;
					if (d[0] && (Math.sign(dx) !== d[0] || Math.abs(dy) > Math.abs(dx))) return;
					if (d[1] && (Math.sign(dy) !== d[1] || Math.abs(dx) > Math.abs(dy))) return;
					var dist = dx * dx + dy * dy * 1.01 + (d[0] ? dy * dy * 3 : dx * dx * 3);
					if (dist > 0 && dist < bd) { bd = dist; best = q; }
				});
				if (best) cur = best.i;
			}
			render();
		} else if ((e.key === "Enter" || e.key === " ") && cur >= 0) { e.preventDefault(); kbd = true; humanMove(cur); }
	});
	board.addEventListener("blur", function () { if (kbd) { kbd = false; render(); } });
	$("tt-pick").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b || b.disabled) return;
		if (b.hasAttribute("data-sym")) sel.sym = +b.getAttribute("data-sym");
		if (b.hasAttribute("data-num")) sel.num = +b.getAttribute("data-num");
		render();
	});
	$("tt-new").addEventListener("click", newGame);
	$("tt-undo").addEventListener("click", undo);
	$("tt-hint").addEventListener("click", doHint);
	root.querySelector(".tt-rbtns").addEventListener("click", function (e) {
		var b = e.target.closest("[data-r]"); if (!b) return;
		var n = st.hist.length, at = vi === null ? n : vi, r = b.getAttribute("data-r");
		at = r === "first" ? 0 : r === "prev" ? at - 1 : r === "next" ? at + 1 : n;
		vi = at >= n ? null : Math.max(0, at);
		render();
	});
	$("tt-moves").addEventListener("click", function (e) {
		var b = e.target.closest("[data-mi]"); if (!b) return;
		var at = +b.getAttribute("data-mi");
		vi = at >= st.hist.length ? null : at;
		render();
	});
	$("tt-link").addEventListener("click", function () {
		var at = vi === null ? st.hist.length : vi;
		var url = location.origin + location.pathname + "?g=" + encodeURIComponent(code) + (at ? "&m=" + st.hist.slice(0, at).join(".") : "");
		copy(url, "Link copied: it opens this game at move " + at + ".");
	});

	/* ---------- fill window / full screen ---------- */
	var view = $("tt-view");
	function setFill(on1) {
		view.classList.toggle("tt-fill", on1);
		document.body.classList.toggle("tt-filling", on1);
		$("tt-fill").setAttribute("aria-pressed", on1 ? "true" : "false");
		$("tt-fill").textContent = on1 ? "✕ Close" : "⤢ Fill window";
		if (view.__mesSide) view.__mesSide.apply();
		render();
	}
	$("tt-fill").addEventListener("click", function () { setFill(!view.classList.contains("tt-fill")); });
	/* phone held sideways / wide window: shared side panel layout from main_js/panel-view.js (controls beside the board) */
	function addSide() {
		if (!window.MESPanel || !window.MESPanel.side || view.__mesSide) return;
		window.MESPanel.side(view, { stage: $("tt-stage"),
			open: function () { return view.classList.contains("tt-fill") || document.fullscreenElement === view; },
			onChange: function () { render(); },
			close: function () { if (document.fullscreenElement) document.exitFullscreen(); else setFill(false); } });
	}
	addSide();
	if (!view.__mesSide) window.addEventListener("load", addSide);
	$("tt-fs").addEventListener("click", function () {
		if (document.fullscreenElement) document.exitFullscreen();
		else if (view.requestFullscreen) view.requestFullscreen().catch(function () { toast("Full screen isn't allowed here: try Fill window."); });
		else toast("This browser has no full screen for pages: try Fill window.");
	});
	document.addEventListener("fullscreenchange", function () { $("tt-fs").textContent = document.fullscreenElement ? "✕ Leave full screen" : "⛶ Full screen"; render(); });
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("tt-p-play").hidden) return;
		var k = e.key.toLowerCase();
		if (e.key === "Escape" && view.classList.contains("tt-fill")) { setFill(false); return; }
		if (k === "n" && mode !== "online") newGame();
		else if (k === "u") undo();
		else if (k === "h") doHint();
		else if (k === "w") setFill(!view.classList.contains("tt-fill"));
		else if (k === "f") $("tt-fs").click();
		else if (t !== board && (e.key === "ArrowLeft" || e.key === "ArrowRight") && st.hist.length) {
			var n = st.hist.length, at = vi === null ? n : vi;
			at += e.key === "ArrowLeft" ? -1 : 1;
			vi = at >= n ? null : Math.max(0, at);
			render();
		}
	});
	var rsT = null;
	window.addEventListener("resize", function () { clearTimeout(rsT); rsT = setTimeout(function () { if (cfg && (cfg.t === "notakto" || (cfg.t === "line" && cfg.d > 1))) render(); }, 200); });

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll(".tt-tab");
	function showTab(name, focus) {
		for (var i = 0; i < tabs.length; i++) {
			var on1 = tabs[i].getAttribute("data-t") === name;
			tabs[i].setAttribute("aria-selected", on1 ? "true" : "false");
			tabs[i].tabIndex = on1 ? 0 : -1;
			$("tt-p-" + tabs[i].getAttribute("data-t")).hidden = !on1;
			if (on1 && focus) tabs[i].focus();
		}
		if (name === "online") { loadLobby(); loadHiveLobby(); renderHiveCard(); }
		if (name === "stats") renderStats();
		lobbyTimer(name === "online");
	}
	$("tt-tabs").addEventListener("click", function (e) { var b = e.target.closest(".tt-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("tt-tabs").addEventListener("keydown", function (e) {
		var arr = Array.prototype.slice.call(tabs), i = arr.indexOf(document.activeElement);
		if (i < 0) return;
		var j = e.key === "ArrowRight" ? (i + 1) % arr.length : e.key === "ArrowLeft" ? (i + arr.length - 1) % arr.length : e.key === "Home" ? 0 : e.key === "End" ? arr.length - 1 : -1;
		if (j >= 0) { e.preventDefault(); showTab(arr[j].getAttribute("data-t"), true); }
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var box = $("tt-stats"), keys = Object.keys(S.stats);
		if (!keys.length) { box.innerHTML = '<p class="tt-sub">No finished games yet. Play one against the computer or online and it shows up here.</p>'; return; }
		var LV = { easy: "Easy", medium: "Medium", hard: "Hard", online: "Online (guest)", hive: "On Hive" };
		var tot = [0, 0, 0];
		keys.sort();
		var rows = keys.map(function (k) {
			var a = S.stats[k], parts = k.split("|"), c = T.parseCode(parts[0]), n = a[0] + a[1] + a[2];
			tot[0] += a[0]; tot[1] += a[1]; tot[2] += a[2];
			return "<tr><td>" + esc(c ? T.describe(c) : parts[0]) + "</td><td>" + (LV[parts[1]] || esc(parts[1])) + "</td><td>" + n + '</td><td class="w">' + a[0] + "</td><td>" + a[1] + '</td><td class="l">' + a[2] + "</td><td>" + bar(a) + "</td></tr>";
		}).join("");
		box.innerHTML = '<div style="overflow-x:auto"><table class="tt-stbl"><thead><tr><th>Game</th><th>Against</th><th>Played</th><th>Won</th><th>Drawn</th><th>Lost</th><th></th></tr></thead><tbody>' + rows +
			'</tbody><tfoot><tr><th>All games</th><th></th><th style="text-align:right">' + (tot[0] + tot[1] + tot[2]) + '</th><th style="text-align:right">' + tot[0] + '</th><th style="text-align:right">' + tot[1] + '</th><th style="text-align:right">' + tot[2] + "</th><th>" + bar(tot) + "</th></tr></tfoot></table></div>" +
			'<p><button type="button" class="tu-btn" id="tt-sreset">Reset statistics</button></p>';
		$("tt-sreset").addEventListener("click", function () { if (confirm("Delete all your tic-tac-toe statistics in this browser?")) { S.stats = {}; save(); renderStats(); } });
	}
	function bar(a) { var n = a[0] + a[1] + a[2] || 1; return '<span class="tt-bar" title="' + Math.round(a[0] * 100 / n) + '% won"><i class="bw" style="width:' + a[0] * 100 / n + '%"></i><i class="bd" style="width:' + a[1] * 100 / n + '%"></i><i class="bl" style="width:' + a[2] * 100 / n + '%"></i></span>'; }

	/* ---------- rules ---------- */
	var RULES = {
		classic: "Players take turns putting their mark (X goes first) in an empty square. Three in a row across, down or diagonally wins; a full board with no line is a draw. Good players never lose it: take the centre or a corner, always block an open two, and look for a fork (two threats at once).",
		misere: "Same moves as the classic game, but whoever completes a line of three loses. The first player should take the centre and then copy the other player's moves through the centre (mirror image): that can never lose.",
		wild: "On each turn you choose whether to place an X or an O. The player who completes three of the same symbol in a row (either symbol) wins. The first player can always force a win: start in the centre.",
		num: "The first player owns the odd numbers 1, 3, 5, 7, 9 and the second the even numbers 2, 4, 6, 8. Each number can be used once. Place one of your numbers in an empty cell; the player who completes a line of three numbers (any mix of odd and even) that adds up to exactly 15 wins.",
		"4x4k3": "Three in a row on a 4 × 4 board. There is so much room that the first player can always force a win by making two threats at once, so the second player has to be very careful from the first move.",
		"4x4k4": "You must fill a whole row, column or long diagonal. One mark in a line is enough to block it, so games between careful players are draws.",
		"5x5k4": "Four in a row on a 5 × 5 board. Look for an open three (three in a row with both ends free): it can't be blocked at both ends.",
		"6x6k5": "Five in a row on a 6 × 6 board.",
		gomoku: "Gomoku (five in a row): 15 × 15 board, X goes first, five or more in a row wins. An open four, or two open threes at once, usually decides the game.",
		drop4: "Choose a column; your piece falls to the lowest empty spot in it. Four in a row across, down or diagonally wins. The middle column is the strongest start.",
		ult: "The big board is made of nine small boards. Where you play inside a small board decides which small board the other player must play in next (top-right cell sends them to the top-right board). Win a small board with three in a row in it; win the game with three small boards in a row. If you are sent to a board that is already decided, you may play in any open board.",
		qubic: "Four layers of 4 × 4. Four in a row wins in any straight line: in one layer, straight down through the four layers, or diagonally through them, including the four long diagonals through the middle of the cube. There are 76 lines in all.",
		notakto: "Both players place X marks. A board that gets three in a row is dead: nobody may play in it any more. The player who kills the last live board loses. Keep the number of 'safe' moves in your favour.",
		notakto1: "Notakto on one board: both players play X, and whoever completes three in a row loses. The first player wins by starting in the centre and then playing a knight's move away from the other player's mark.",
		oc: "Order plays first. On each turn the player places either an X or an O in any empty cell. Order wins as soon as five of the same symbol stand in a row (rows, columns, diagonals). Chaos wins if the board fills up without that."
	};
	function renderRules() {
		$("tt-rules").innerHTML = T.PRESETS.map(function (p) {
			return '<div class="tt-rule"><h3>' + p.name + "</h3><p>" + (RULES[p.id] || p.desc) + '</p><button type="button" class="tt-vb" data-play="' + p.id + '">Play this</button></div>';
		}).join("") + '<div class="tt-rule"><h3>Your own board</h3><p>Choose "Custom board…" in the Game list: any width and height from 3 to 19, up to 4 layers for 3D (at most 6 × 6 each), a line of 3 to 7, and switch on gravity, misère or wild. The computer plays every one of them.</p><button type="button" class="tt-vb" data-play="custom">Make one</button></div>';
	}
	$("tt-rules").addEventListener("click", function (e) {
		var b = e.target.closest("[data-play]"); if (!b) return;
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		S.game = b.getAttribute("data-play"); save(); syncSetup(); showTab("play"); newGame();
		window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
	});

	/* ---------- toast / copy ---------- */
	var toastT = null;
	function toast(msg) { var t = $("tt-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3200); }
	function copy(text, msg) {
		var done = function () { toast(msg || "Copied."); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); } ta.remove(); }
	}

	/* ===================================================================== online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, sending: false, timer: null, lastSeen: 0, fails: 0 };
	var API = "/api/ttt";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("tt-name").value || "").trim().slice(0, 24); return n || S.guest || (S.guest = "Guest " + (100 + Math.floor(Math.random() * 900))); }
	$("tt-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("tt-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("tt-ochange").addEventListener("click", function () { showTab("play"); $("tt-game").focus(); });

	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.fails = 0;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online";
		var c = T.parseCode(r.g.v);
		setGame(c, r.g.moves, { keepMode: true });
		applyServerWin();
		render();
		showTab("play");
		poll(0);
	}
	$("tt-ocreate").addEventListener("click", function () {
		if (mode === "online" || mode === "hive") return toast("You are already in an online game.");
		var c = setupCfg();
		if (!c) return toast("Fix the custom board first.");
		S.name = ($("tt-name").value || "").trim().slice(0, 24); save();
		var b = this; b.disabled = true;
		api("POST", { act: "new", v: T.cfgCode(c), name: myName(), pub: $("tt-opub").checked, first: S.ofirst }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			startOnline(r);
		});
	});
	function join(id) {
		if (mode === "online" && on.id === id) { showTab("play"); return; }
		if (mode === "online") return toast("Leave your current online game first.");
		api("POST", { act: "join", id: id, name: myName() }).then(function (r) {
			if (r.error) { toast(r.error); loadLobby(); return; }
			startOnline(r);
			toast("You joined " + (r.g.names[1 - r.seat] || "the game") + ".");
		});
	}
	function leaveOnline(silent) {
		clearTimeout(on.timer);
		on.id = null; on.g = null; S.online = null; save();
		mode = S.opp;
		if (!silent) newGame(); else render();
	}
	function inviteLink() { return location.origin + location.pathname + "?join=" + on.id; }
	function renderObar() {
		var box = $("tt-obar");
		if (mode === "hive") return renderHbar();
		if (mode !== "online" || !on.g) { box.hidden = true; return; }
		box.hidden = false;
		var g = on.g, other = g.names[1 - on.seat], h = "";
		if (g.status === "wait") {
			h = '<span><span class="tt-dot"></span>Waiting for a player. Send them this link:</span><span class="tt-vbtns"><button type="button" class="tt-vb tt-vb--main" data-o="copy">🔗 Copy invite link</button>' +
				(navigator.share ? '<button type="button" class="tt-vb" data-o="share">Share…</button>' : "") + '<button type="button" class="tt-vb" data-o="cancel">Cancel game</button></span>';
		} else {
			var idle = g.idle || 0, oppTurn = g.status === "play" && st.turn !== on.seat;
			var away = oppTurn && idle > 180000;
			h = '<span><span class="tt-dot' + (on.fails > 2 ? " is-off" : "") + '"></span>Online vs <b>' + esc(other || "?") + "</b>" + (on.fails > 2 ? " (reconnecting…)" : "") + '</span><span class="tt-vbtns">';
			if (g.status === "play") {
				if (away) h += '<button type="button" class="tt-vb tt-vb--main" data-o="claim">Claim the win (they are away)</button>';
				h += '<button type="button" class="tt-vb" data-o="resign">Resign</button>';
			} else {
				h += '<button type="button" class="tt-vb tt-vb--main" data-o="rematch">↺ Rematch</button>';
			}
			h += '<button type="button" class="tt-vb" data-o="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("tt-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var a = b.getAttribute("data-o");
		if (a === "copy") return copy(inviteLink(), "Invite link copied: send it to the other player.");
		if (a === "share") return navigator.share({ title: "Play tic-tac-toe with me", text: "Join my game: " + T.describe(cfg), url: inviteLink() }).catch(function () {});
		if (a === "cancel" || a === "leave") {
			if (a === "leave" && on.g && on.g.status === "play" && !confirm("Leave the game? It counts as resigning.")) return;
			var id = on.id, key = on.key;
			api("POST", { act: a === "cancel" ? "cancel" : "leave", id: id, key: key });
			leaveOnline();
			return;
		}
		if (a === "resign" && !confirm("Resign this game?")) return;
		b.disabled = true;
		api("POST", { act: a, id: on.id, key: on.key }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			sync(r.g);
		});
	});
	function onlineMove(m) {
		var n = st.hist.length;
		on.sending = true;
		T.apply(st, m); vi = null; hint = null;
		render(true);
		api("POST", { act: "move", id: on.id, key: on.key, n: n, m: T.mstr(m) }).then(function (r) {
			on.sending = false;
			if (r.error) { toast(r.error); refetch(); return; }
			sync(r.g);
			if (st.win) finish();
		});
	}
	function refetch() { api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) sync(r.g); }); }
	function applyServerWin() {
		var g = on.g;
		if (g && g.status === "over" && g.win && !st.win) st.win = { p: g.win.p, line: null, why: g.win.why };
	}
	/** bring the board in line with the server's copy of the game */
	function sync(g) {
		if (!g || !on.id || g.id !== on.id) return;
		var prev = on.g, wasOver = st.win;
		on.g = g;
		if (!prev || prev.round !== g.round || g.moves.length < st.hist.length || g.moves.slice(0, st.hist.length).join() !== st.hist.join()) {
			// new round (rematch: seats swapped) or a different history: rebuild
			if (prev && prev.round !== g.round) { on.seat = 1 - on.seat; S.online.seat = on.seat; save(); toast("Rematch! You are " + T.playerName(cfg, on.seat) + " now."); }
			st = T.replay(cfg, g.moves) || T.create(cfg);
			wasOver = null;
		} else {
			for (var i = st.hist.length; i < g.moves.length; i++) {
				var m = T.mparse(g.moves[i]);
				if (!T.isLegal(st, m)) { st = T.replay(cfg, g.moves) || st; break; }
				T.apply(st, m);
				if (i === g.moves.length - 1) render(true);
			}
		}
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Someone") + " joined. " + (st.turn === on.seat ? "Your move!" : "They go first."));
		applyServerWin();
		render(prev && prev.moves.length !== g.moves.length);
		if (st.win && !wasOver) finish();
	}
	function poll(delay) {
		clearTimeout(on.timer);
		on.timer = setTimeout(function () {
			if (!on.id) return;
			api("GET", null, "?id=" + on.id).then(function (r) {
				if (!on.id) return;
				if (r.error) {
					on.fails++;
					if (/not found|expired/i.test(r.error)) { toast("This online game is no longer there."); leaveOnline(); return; }
					renderObar();
				} else { var wasBad = on.fails > 2; on.fails = 0; sync(r.g); if (wasBad) renderObar(); }
				poll(nextDelay());
			});
		}, delay);
	}
	function nextDelay() {
		var g = on.g, hidden = document.hidden;
		if (!g) return 3000;
		if (g.status === "over") return hidden ? 10000 : 3000;
		var waiting = g.status === "wait" || st.turn !== on.seat;
		return hidden ? 6000 : waiting ? 1200 : 4000;
	}
	document.addEventListener("visibilitychange", function () { if (!document.hidden && on.id) poll(50); });

	/* lobby */
	var lobT = null;
	function lobbyTimer(onTab) { clearInterval(lobT); if (onTab) lobT = setInterval(function () { if (!document.hidden) { loadLobby(); loadHiveLobby(); } }, 8000); }
	function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? "just now" : Math.round(s / 60) + " min ago"; }
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("tt-lobby");
			if (r.error) { box.innerHTML = '<p class="tt-sub">' + esc(r.error) + "</p>"; return; }
			var list = (r.open || []).filter(function (o) { return o.id !== on.id; });
			if (!list.length) { box.innerHTML = '<p class="tt-sub">No open games right now. Make one above, it will show up here for others.</p>'; return; }
			box.innerHTML = '<ul class="tt-lob">' + list.map(function (o) {
				var c = T.parseCode(o.v);
				return '<li><span class="tt-lobn">' + esc(o.name || "Guest") + ' <span class="tt-lobv">· ' + esc(c ? T.describe(c) : o.v) + " · " + (o.first === "host" ? "they go first" : o.first === "guest" ? "you go first" : "random start") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>';
			}).join("") + "</ul>";
		});
	}
	$("tt-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) join(b.getAttribute("data-join")); });
	$("tt-orefresh").addEventListener("click", loadLobby);


	/* ===================================================================== Hive games =====================================================================
	   Moves are custom_json operations (id mes_ttt) signed with the player's posting key through main_js/hive.js (MESHive: Keychain extension
	   or the Keychain phone app). The game is worked out from both players' account histories with MESTTT.hive.build(); /api/ttt only keeps a
	   short list of open games ("hopen" / "hjoin"). On localhost (MOCK) a stand-in chain in localStorage "mes-ttt:hchain" + a per-tab account
	   (sessionStorage "mes-ttt:hacct") let two tabs play each other with no Keychain. */
	var H = T.hive;
	var hv = { host: null, gid: null, R: null, pending: [], timer: null, joiners: [], busy: false, ops: {}, lastErr: 0, reOffer: null, listed: false };
	var HA = MOCK ? mockHive() : realHive();
	function realHive() {
		var M = function () { return window.MESHive || null; };
		return {
			user: function () { var u = M() && M().user(); return u ? u.name : ""; },
			login: function (n) { return M() ? M().login(n) : Promise.reject(new Error("The Hive helpers did not load: reload the page.")); },
			logout: function () { if (M()) M().logout(); },
			onChange: function (f) { if (M()) M().onChange(f); else document.addEventListener("DOMContentLoaded", function () { if (M()) M().onChange(f); }); },
			help: function () { return M() ? M().helpHtml() : ""; },
			send: function (obj, label) {
				var me = this.user();
				return M().keychain().then(function (k) {
					if (!k) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
					return new Promise(function (ok, no) {
						k.requestCustomJson(me, H.ID, "Posting", H.json(obj), label, function (r) {
							if (r && r.success) { var x = r.result || {}; ok({ trx: x.id || x.tx_id || x.trx_id || "" }); }
							else no(new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled in Keychain"));
						});
					});
				});
			},
			ops: function (acct, since) {
				var all = [], pages = 0;
				function page(start) {
					return M().call("condenser_api.get_account_history", [acct, start, start < 0 ? 200 : Math.min(1000, start + 1), 262144, 0]).then(function (r) {
						r = r || []; pages++;
						all = r.concat(all);
						var oldest = r.length ? r[0] : null, oldT = oldest ? Date.parse(oldest[1].timestamp + "Z") : 0;
						if (oldest && oldest[0] > 0 && oldT > since && pages < 4 && r.length >= (start < 0 ? 200 : 2)) return page(oldest[0] - 1);
						return H.parse(all, acct);
					});
				}
				return page(-1);
			}
		};
	}
	function mockHive() {
		var subs = [];
		function chain() { try { return JSON.parse(localStorage.getItem("mes-ttt:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-ttt:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-ttt:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-ttt:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			send: function (obj, label) {
				var me = this.user(), c = chain(), now = Date.now(), trx = Math.random().toString(16).slice(2, 12);
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19),
					op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-ttt:hchain", JSON.stringify(c));
				return new Promise(function (r) { setTimeout(function () { r({ trx: trx }); }, 300); });
			},
			ops: function (acct) {
				// a block is "made" every 3 seconds: operations newer than that are not visible yet
				var cut = Math.floor(Date.now() / 3000);
				return Promise.resolve(H.parse(chain().filter(function (e) { return e[1].block <= cut && e[1].op[1].required_posting_auths[0] === acct; }), acct));
			}
		};
	}
	function hMe() { return HA.user(); }
	function hLink(host, gid) { return location.origin + location.pathname + "?hive=" + host + "/" + gid; }

	/* login strip + maker */
	function renderHiveCard() {
		var box = $("tt-hlogin"), me = hMe();
		$("tt-hmake").hidden = !me;
		var cc = setupCfg();
		$("tt-hvar").textContent = cc ? T.describe(cc) : "—";
		if (me) {
			box.innerHTML = '<p class="tt-hwho">Signed in as ' + (MOCK ? "" : '<img alt="" src="https://images.hive.blog/u/' + esc(me) + '/avatar/small">') + "<b>@" + esc(me) + '</b> <button type="button" class="tu-btn" id="tt-hlogout">Log out</button></p>';
			$("tt-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="tt-hrow"><input class="tu-input" id="tt-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="tt-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed (no Keychain on this local copy)." : "Keychain proves you own the account by signing a message with your posting key; your keys never leave Keychain and mes.fm never sees them.") + "</p>";
			var go = function () {
				var b = $("tt-hlogin-b"); b.disabled = true; b.textContent = "Check Keychain…";
				HA.login($("tt-huser").value).then(function () { toast("Logged in."); }, function (e) {
					b.disabled = false; b.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test(e.message + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			$("tt-hlogin-b").addEventListener("click", go);
			$("tt-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("tt-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(); });

	function hiveCreate() {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode === "online" || mode === "hive") return toast("Leave the game you are in first.");
		var c = setupCfg(); if (!c) return toast("Fix the custom board first.");
		var to = ($("tt-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast(to === me ? "You can't challenge yourself." : "That isn't a Hive username.");
		var obj = { a: "open", g: H.newGid(), v: T.cfgCode(c), f: S.ofirst };
		if (to) obj.to = to;
		hiveOpen(obj, to ? "Challenge @" + to + " to tic-tac-toe" : "Open a tic-tac-toe game");
	}
	function hiveOpen(obj, label) {
		var b = $("tt-hcreate"); b.disabled = true;
		HA.send(obj, label).then(function (r) {
			b.disabled = false;
			hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]);
			register("hopen", { host: hMe(), g: obj.g });
			toast(obj.to ? "Challenge sent: copy the link above the board and send it to @" + obj.to + "." : "Your game is open: it will show up under Open Hive games.");
		}, function (e) { b.disabled = false; toast(e.message); });
	}
	/** tell the index about an operation (it reads it back from the chain, so retry while the block is being made) */
	function register(act, body, tries) {
		tries = tries || 0;
		body.act = act;
		api("POST", body).then(function (r) {
			if (r && r.error && /not on the chain/i.test(r.error) && tries < 6) setTimeout(function () { register(act, body, tries + 1); }, 3500);
			else if (act === "hopen" && r && r.ok) hv.listed = true;
		});
	}
	function pend(obj, trx) { var o = H.clean(JSON.parse(H.json(obj))); o.acct = hMe(); o.trx = trx || ("p" + Math.random()); o.block = 0; o.ts = Date.now(); o.i = 1e12 + hv.pending.length; o.pend = true; return o; }

	function hiveJoin(host, gid) {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive first, then press Join again."); hv.wantJoin = host + "/" + gid; return; }
		if (host === me) return hiveEnter(host, gid, []);
		toast("Checking the game on Hive…");
		Promise.all([HA.ops(host, 0), HA.ops(me, 0)]).then(function (res) {
			var R = H.build(host, gid, res[0].concat(res[1]), Date.now());
			if (!R.open) return toast("That Hive game wasn't found (it may not be in a block yet: try again in a few seconds).");
			if (R.guest === me || R.status !== "wait") return hiveEnter(host, gid, []);
			if (R.open.to && R.open.to !== me) return toast("That game is a challenge for @" + R.open.to + ".");
			var obj = { a: "join", h: host, g: gid };
			HA.send(obj, "Join @" + host + "'s tic-tac-toe game").then(function (r) {
				hiveEnter(host, gid, [pend(obj, r.trx)]);
				register("hjoin", { host: host, g: gid, acct: me });
			}, function (e) { toast(e.message); });
		}, function () { toast("No Hive node answered: try again."); });
	}
	function hiveEnter(host, gid, pending) {
		clearTimeout(hv.timer);
		hv.host = host; hv.gid = gid; hv.R = null; hv.pending = pending || []; hv.joiners = []; hv.reOffer = null; hv.listed = false; hv.busy = false;
		S.hive = { host: host, gid: gid }; save();
		mode = "hive";
		showTab("play");
		hivePoll(0);
		render();
	}
	function hiveLeave() {
		clearTimeout(hv.timer);
		hv.host = null; hv.R = null; S.hive = null; save();
		mode = S.opp; newGame();
	}
	function hivePoll(delay) {
		clearTimeout(hv.timer);
		hv.timer = setTimeout(hiveRefresh, delay);
	}
	function hiveRefresh() {
		if (mode !== "hive" || !hv.host) return;
		var me = hMe(), R = hv.R;
		var accts = [hv.host];
		if (R && R.guest) accts.push(R.guest);
		else hv.joiners.forEach(function (a) { if (accts.indexOf(a) < 0) accts.push(a); });
		if (me && accts.indexOf(me) < 0) accts.push(me);
		if (R && R.open && R.open.to && accts.indexOf(R.open.to) < 0) accts.push(R.open.to);
		var since = R && R.open ? R.open.ts - 60000 : 0;
		var jobs = accts.map(function (a) { return HA.ops(a, since).then(function (o) { hv.ops[a] = o; }, function () { hv.lastErr = Date.now(); }); });
		if (!R || R.status === "wait") jobs.push(api("GET", null, "?hg=" + hv.host + "/" + hv.gid).then(function (r) { if (r && r.joiners) hv.joiners = r.joiners.slice(0, 5); }));
		Promise.all(jobs).then(function () {
			if (mode !== "hive" || !hv.host) return;
			hiveRebuild();
			if (hv.R && hv.R.status === "wait" && hv.host === me && !hv.listed && !hv.R.open.to) register("hopen", { host: me, g: hv.gid });
			hivePoll(hiveDelay());
		});
	}
	function hiveDelay() {
		var R = hv.R;
		if (document.hidden) return 9000;
		if (!R || R.status === "wait") return 4000;
		if (R.status === "play") return R.turnAcct === hMe() ? 6000 : 3000;
		return 6000;
	}
	function hiveRebuild() {
		var all = [];
		Object.keys(hv.ops).forEach(function (a) { all = all.concat(hv.ops[a]); });
		// pending = signed by us but not yet seen in a block
		var now = Date.now();
		hv.pending = hv.pending.filter(function (p) {
			var seen = all.some(function (o) { return (p.trx && o.trx === p.trx) || (o.acct === p.acct && o.a === p.a && o.g === p.g && o.n === p.n); });
			return !seen && now - p.ts < 120000;
		});
		var R = H.build(hv.host, hv.gid, all.concat(hv.pending), now);
		var prev = hv.R;
		hv.R = R;
		if (R.cfg && (!cfg || T.cfgCode(R.cfg) !== code)) { cfg = R.cfg; code = T.cfgCode(cfg); }
		var was = st && st.win;
		var sameGame = prev && prev.open && R.open && prev.open.g === R.open.g;
		var grew = sameGame && prev.s && R.s && R.s.hist.length > prev.s.hist.length;
		st = R.s ? R.s : T.create(cfg || T.parseCode("L3x3k3"));
		if (sameGame && was) st._fin = true;
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined. " + (R.turnAcct === hMe() ? "Your move!" : "They go first."));
		// a rematch offered by the other player (a new open game that points back at this one)
		hv.reOffer = null;
		if (R.status === "over") {
			var other = R.players[0] === hMe() ? R.players[1] : R.players[0];
			var mine = H.myGames(other, hv.ops[other] || []).filter(function (g) { return g.re === hv.host + "/" + hv.gid && g.role === "host"; });
			if (mine.length) hv.reOffer = mine[0];
		}
		render(grew);
		if (st.win && !st._fin) finish();
	}
	function hiveSend(obj, label) {
		hv.busy = true; render();
		return HA.send(obj, label).then(function (r) {
			hv.busy = false;
			hv.pending.push(pend(obj, r.trx));
			hiveRebuild();
			hivePoll(2500);
		}, function (e) { hv.busy = false; render(); toast(e.message); throw e; });
	}
	function hiveMove(m) {
		hiveSend({ a: "mv", h: hv.host, g: hv.gid, n: st.hist.length, m: T.mstr(m) }, "Tic-tac-toe move " + (st.hist.length + 1) + " vs @" + hiveOther()).catch(function () {});
	}
	function hiveOther() { var R = hv.R, me = hMe(); if (!R) return ""; return R.players[0] === me ? (R.players[1] || "") : (R.players[0] || R.open && R.open.to || ""); }
	function renderHbar() {
		var box = $("tt-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h, link = '<span class="tt-chain">On Hive · game <a href="https://hivehub.dev/@' + esc(hv.host) + '" target="_blank" rel="noopener">@' + esc(hv.host) + "</a>/" + esc(hv.gid) + "</span>";
		if (!R || !R.open) h = '<span><span class="tt-dot is-off"></span>Reading the game from Hive…</span><span class="tt-vbtns"><button type="button" class="tt-vb" data-h="leave">Leave</button></span>';
		else if (R.status === "wait") {
			h = '<span><span class="tt-dot"></span>' + (R.open.to ? "Waiting for @" + esc(R.open.to) + " to accept" : "Waiting for someone on Hive to join") + ".</span>" + link + '<span class="tt-vbtns">' +
				'<button type="button" class="tt-vb tt-vb--main" data-h="copy">🔗 Copy invite link</button>' + (hv.host === me ? '<button type="button" class="tt-vb" data-h="cancel">Cancel game</button>' : "") + '<button type="button" class="tt-vb" data-h="leave">Leave</button></span>';
		} else if (R.status === "cancelled" || R.status === "expired") {
			h = "<span>This Hive game was " + (R.status === "cancelled" ? "cancelled" : "never joined (open games last an hour)") + '.</span><span class="tt-vbtns"><button type="button" class="tt-vb" data-h="leave">Close</button></span>';
		} else {
			var other = hiveOther(), mine = R.players.indexOf(me) >= 0;
			h = '<span><span class="tt-dot' + (Date.now() - hv.lastErr < 10000 ? " is-off" : "") + '"></span>' + (mine ? "Hive game vs <b>@" + esc(other) + "</b>" : "Watching <b>@" + esc(R.players[0]) + "</b> vs <b>@" + esc(R.players[1]) + "</b>") + "</span>" + link + '<span class="tt-vbtns">';
			if (R.status === "play" && mine) {
				if (R.turnAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="tt-vb tt-vb--main" data-h="claim">Claim the win (away 5 min)</button>';
				h += '<button type="button" class="tt-vb" data-h="resign">Resign</button>';
			} else if (R.status === "over" && mine) {
				if (hv.reOffer) h += '<button type="button" class="tt-vb tt-vb--main" data-h="accept">Accept @' + esc(other) + "'s rematch</button>";
				else h += '<button type="button" class="tt-vb tt-vb--main" data-h="rematch">↺ Offer a rematch</button>';
			}
			h += '<button type="button" class="tt-vb" data-h="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("tt-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h"), R = hv.R;
		if (a === "copy") return copy(hLink(hv.host, hv.gid), "Invite link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open tic-tac-toe game").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive game? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign tic-tac-toe vs @" + hiveOther()).catch(function () {}); return; }
		if (a === "claim") return hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win: @" + hiveOther() + " is away").catch(function () {});
		if (a === "accept" && hv.reOffer) return hiveJoin(hv.reOffer.host, hv.reOffer.gid);
		if (a === "rematch" && R) {
			var other = hiveOther(), iWasFirst = R.players[0] === hMe();
			var obj = { a: "open", g: H.newGid(), v: R.open.v, f: iWasFirst ? "guest" : "host", to: other, re: hv.host + "/" + hv.gid };
			HA.send(obj, "Offer @" + other + " a tic-tac-toe rematch").then(function (r) { hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]); toast("Rematch offered: @" + other + " sees an Accept button."); }, function (e2) { toast(e2.message); });
		}
	});

	/* lobby + my games */
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("tt-hlobby"), me = hMe();
			if (r.error) { box.innerHTML = '<p class="tt-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			if (!list.length) { box.innerHTML = '<p class="tt-sub">No open Hive games right now.' + (me ? " Make one above." : " Log in to make one.") + "</p>"; return; }
			box.innerHTML = '<ul class="tt-lob">' + list.map(function (o) {
				var c = T.parseCode(o.v);
				return '<li><span class="tt-lobn">@' + esc(o.host) + ' <span class="tt-lobv">· ' + esc(c ? T.describe(c) : o.v) + " · " + (o.f === "host" ? "they go first" : o.f === "guest" ? "you go first" : "random start") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>";
			}).join("") + "</ul>";
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 12), box = $("tt-hmine");
			$("tt-hminebox").hidden = !games.length;
			box.innerHTML = '<ul class="tt-lob">' + games.map(function (g) {
				var c = g.v && T.parseCode(g.v);
				return '<li><span class="tt-lobn">' + (g.role === "host" ? "You opened" + (g.to ? " (challenge to @" + esc(g.to) + ")" : "") : "You joined @" + esc(g.host)) + ' <span class="tt-lobv">· ' + (c ? esc(T.describe(c)) + " · " : "") + new Date(g.ts).toLocaleString() + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>';
			}).join("") + "</ul>";
		}, function () {});
	}
	$("tt-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		var p = b.getAttribute("data-hjoin").split("/");
		if (mode === "hive" && hv.host === p[0] && hv.gid === p[1]) return showTab("play");
		if (mode === "online") return toast("Leave the guest game first.");
		hiveJoin(p[0], p[1]);
	});
	$("tt-hcreate").addEventListener("click", hiveCreate);
	$("tt-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); });

	/* in-browser stand-in for /api/ttt (local testing: two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-ttt:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-ttt:mock", JSON.stringify(db)); };
		var pub = function (g) { return { id: g.id, v: g.v, names: g.names, moves: g.moves, status: g.status, win: g.win, round: g.round, pub: g.pub, first: g.first, idle: now - g.at }; };
		if (method === "GET" && /hlobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return !g.joiners.length && !g.cancelled && !g.to && now - g.ts < 3600000; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, f: g.f, age: now - g.ts }; }) };
		if (method === "GET" && /hg=/.test(query)) { var hk = "h:" + decodeURIComponent((/hg=([^&]+)/.exec(query) || [])[1] || ""); return { joiners: db[hk] ? db[hk].joiners : [] }; }
		if (method === "POST" && /^h(open|join|cancel)$/.test(b.act)) {
			var who = b.act === "hjoin" ? b.acct : b.host, hops = HA.ops(who), want = b.act.slice(1);
			return hops.then(function (ops) {
				var op = ops.filter(function (o) { return o.a === want && o.g === b.g && (want === "open" || o.h === b.host); })[0];
				if (!op) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-ttt:mock") || "{}"); } catch (e) { db2 = {}; }
				var k2 = "h:" + b.host + "/" + b.g;
				if (want === "open") db2[k2] = db2[k2] || { host: b.host, g: b.g, v: op.v, f: op.f, to: op.to || null, ts: op.ts, joiners: [], cancelled: false };
				else if (db2[k2]) { if (want === "join" && db2[k2].joiners.indexOf(who) < 0) db2[k2].joiners.push(who); if (want === "cancel") db2[k2].cancelled = true; }
				localStorage.setItem("mes-ttt:mock", JSON.stringify(db2));
				return { ok: true, joiners: db2[k2] ? db2[k2].joiners : [] };
			});
		}
		if (method === "GET") {
			if (/lobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return !/^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub && now - g.created < 1800000; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, age: now - g.created }; }) };
			var id = (/id=([a-z0-9]+)/.exec(query) || [])[1], g0 = db[id];
			return g0 ? { g: pub(g0) } : { error: "Game not found (it may have expired)." };
		}
		var g = db[b.id], seat = g ? g.tok.indexOf(b.key) : -1;
		if (b.act === "new") {
			var c = T.parseCode(b.v); if (!c) return { error: "Unknown game." };
			var nid = Math.random().toString(36).slice(2, 10), key = Math.random().toString(36).slice(2), hs = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0;
			var names = [null, null], tok = [null, null]; names[hs] = b.name; tok[hs] = key;
			db[nid] = { id: nid, v: b.v, names: names, tok: tok, moves: [], status: "wait", win: null, round: 0, pub: !!b.pub, first: b.first, created: now, at: now };
			put(); return { g: pub(db[nid]), key: key, seat: hs };
		}
		if (!g) return { error: "Game not found (it may have expired)." };
		if (b.act === "join") {
			if (g.status !== "wait") return { error: "Someone else already joined that game." };
			var s2 = g.tok[0] ? 1 : 0, k2 = Math.random().toString(36).slice(2);
			g.tok[s2] = k2; g.names[s2] = b.name; g.status = "play"; g.at = now; put();
			return { g: pub(g), key: k2, seat: s2 };
		}
		if (seat < 0) return { error: "That isn't your game." };
		if (b.act === "move") {
			if (g.status !== "play") return { error: "The game isn't running." };
			if (b.n !== g.moves.length) return { error: "Out of step: the board was refreshed." };
			var s = T.replay(T.parseCode(g.v), g.moves);
			if (s.turn !== seat) return { error: "It's not your turn." };
			var m = T.mparse(b.m); if (!T.isLegal(s, m)) return { error: "That move isn't allowed." };
			T.apply(s, m); g.moves.push(b.m); g.at = now;
			if (s.win) { g.status = "over"; g.win = { p: s.win.p, why: s.win.why }; }
			put(); return { g: pub(g) };
		}
		if (b.act === "resign" || b.act === "leave") { if (g.status === "play") { g.status = "over"; g.win = { p: 1 - seat, why: b.act === "leave" ? "left" : "resign" }; } g.at = now; put(); return { g: pub(g) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		if (b.act === "claim") { g.status = "over"; g.win = { p: seat, why: "timeout" }; put(); return { g: pub(g) }; }
		if (b.act === "rematch") {
			if (g.status !== "over") return { error: "Finish this game first." };
			g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]]; g.moves = []; g.status = "play"; g.win = null; g.round++; g.at = now; put();
			return { g: pub(g) };
		}
		return { error: "Unknown action." };
	}
	if (MOCK) $("tt-p-online").insertAdjacentHTML("afterbegin", '<p class="tu-note">Test mode: online games are kept in this browser only (no server here); open the page in a second tab to play yourself.</p>');

	/* ---------- start ---------- */
	syncSetup();
	renderRules();
	var q = new URLSearchParams(location.search);
	var joinId = q.get("join"), qg = q.get("g"), qh = q.get("hive"), qv = q.get("v");
	if (joinId || qg || qh || qv) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
	if (qv && T.preset(qv)) { S.game = qv; syncSetup(); }
	function blank() { cfg = setupCfg() || T.parseCode("L3x3k3"); code = T.cfgCode(cfg); st = T.create(cfg); mode = S.opp; render(); }
	if (qh && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(qh)) {
		// a Hive game link
		blank();
		var qp = qh.split("/");
		setTimeout(function () { hiveJoin(qp[0], qp[1]); }, 300);
	} else if (joinId && /^[a-z0-9]{6,12}$/.test(joinId)) {
		// a guest game invite
		blank();
		if (S.online && S.online.id === joinId) api("GET", null, "?id=" + joinId).then(function (r) { if (r.g) startOnline({ g: r.g, key: S.online.key, seat: S.online.seat }); });
		else { S.online = null; join(joinId); }
	} else if (qg && T.parseCode(qg)) {
		// a shared position
		var c = T.parseCode(qg), mv = (q.get("m") || "").split(".").filter(Boolean);
		var p = T.presetByCode(qg);
		if (p) S.game = p.id; else { S.game = "custom"; S.custom = { w: c.w, h: c.h, d: c.d, k: c.k, g: c.grav, m: c.mis, x: c.wild }; }
		S.online = null; S.hive = null;
		save(); syncSetup();
		var s0 = T.replay(c, mv);
		mode = S.opp;
		setGame(c, s0 ? mv : [], { human: s0 ? s0.turn : 0 });
		toast("Game loaded from the link.");
	} else if (S.hive && S.hive.host) {
		// back to the Hive game we were in
		blank();
		var sh = S.hive;
		setTimeout(function () { hiveEnter(sh.host, sh.gid, []); }, 0);
	} else if (S.online && S.online.id) {
		// back to the guest game we were in
		blank();
		mode = "online"; on.id = S.online.id; on.key = S.online.key; on.seat = S.online.seat;
		api("GET", null, "?id=" + on.id).then(function (r) {
			if (r.g) startOnline({ g: r.g, key: on.key, seat: on.seat });
			else { on.id = null; S.online = null; save(); mode = S.opp; resumeOrNew(); }
		});
	} else resumeOrNew();
	renderHiveCard();
	function resumeOrNew() {
		var cc = S.cur && T.parseCode(S.cur.code);
		if (cc && !S.cur.done && S.cur.moves && S.cur.moves.length && T.replay(cc, S.cur.moves)) {
			var pp = T.presetByCode(S.cur.code);
			if (pp) S.game = pp.id; else { S.game = "custom"; S.custom = { w: cc.w, h: cc.h, d: cc.d, k: cc.k, g: cc.grav, m: cc.mis, x: cc.wild }; }
			mode = S.cur.mode === "local" ? "local" : "cpu";
			S.opp = mode; syncSetup();
			setGame(cc, S.cur.moves, { human: S.cur.human || 0, keepMode: true });
		} else newGame();
	}
})();
