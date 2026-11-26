/* MES Solitaire rules (mes.fm/solitaire). Pure and deterministic: the same variant + seed always deals the same cards, and a list
   of moves always gives the same result, so a game saved on Hive can be checked by replaying it (mes.fm/api/solitaire.js).
   A byte-identical copy lives at mes.fm/api/_solitaire-lib.js (cp after editing; the tests check).

   Cards: 0..51 = suit * 13 + (rank - 1), suits 0 spades, 1 hearts, 2 diamonds, 3 clubs (1 and 2 are red). Spider uses 104 cards,
   id = group * 13 + (rank - 1) with 8 groups whose suit depends on the number of suits. In a pile a face-down card is stored as ~id.

   Piles (one flat list per game):
     Klondike  0 stock, 1 waste, 2-5 foundations (suit 0-3), 6-12 tableau
     Spider    0 stock, 1-8 completed runs, 9-18 tableau
     FreeCell  0-3 free cells, 4-7 foundations (suit 0-3), 8-15 tableau
   A move is [from, n, to] (n = number of cards); [0, 0, 0] is the stock action (draw / recycle in Klondike, deal a row in Spider).

   Variants: k1 Klondike draw 1, k3 draw 3, k3p draw 3 with 3 passes; s1 / s2 / s4 Spider with that many suits; f4 / f3 / f2
   FreeCell with that many free cells. FreeCell seeds are Microsoft deal numbers (1 - 1,000,000), the classic numbering. */
(function (root) {
	"use strict";
	var M = {};
	M.V = 1;
	M.ID = "mes_solitaire";
	M.VARIANTS = {
		k1: { g: "k", name: "Klondike, draw 1", short: "Klondike 1", draw: 1, passes: 0, level: "Easy" },
		k3: { g: "k", name: "Klondike, draw 3", short: "Klondike 3", draw: 3, passes: 0, level: "Medium" },
		k3p: { g: "k", name: "Klondike, draw 3, three passes", short: "Klondike 3 (3 passes)", draw: 3, passes: 3, level: "Hard" },
		s1: { g: "s", name: "Spider, 1 suit", short: "Spider 1", suits: 1, level: "Easy" },
		s2: { g: "s", name: "Spider, 2 suits", short: "Spider 2", suits: 2, level: "Medium" },
		s4: { g: "s", name: "Spider, 4 suits", short: "Spider 4", suits: 4, level: "Hard" },
		f4: { g: "f", name: "FreeCell, 4 free cells", short: "FreeCell", cells: 4, level: "Easy" },
		f3: { g: "f", name: "FreeCell, 3 free cells", short: "FreeCell 3 cells", cells: 3, level: "Medium" },
		f2: { g: "f", name: "FreeCell, 2 free cells", short: "FreeCell 2 cells", cells: 2, level: "Hard" }
	};
	M.GAMES = { k: "Klondike", s: "Spider", f: "FreeCell" };
	M.DAILY = ["k1", "s1", "f4"];
	M.SUITS = ["♠", "♥", "♦", "♣"];
	M.SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
	M.RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
	// The FreeCell deals of the first million that cannot be won (with 4 free cells).
	M.FC_UNSOLVABLE = [11982, 146692, 186216, 455889, 495505, 512118, 517776, 781948];
	M.SOLVE_BUDGET = 60000;
	M.MAX_RATE = 8; // moves per second, on average, that a person can make

	/* ---------- random numbers ---------- */
	function xmur3(str) {
		var h = 1779033703 ^ str.length;
		for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
		return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
	}
	function mulberry32(a) {
		return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}
	M.rng = function (seed) { return mulberry32(xmur3(String(seed))()); };
	M.shuffle = function (arr, rnd) {
		for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
		return arr;
	};
	M.hashInt = function (s, mod) { return xmur3(String(s))() % mod; };

	/* ---------- cards ---------- */
	M.rank = function (id) { return (id % 13) + 1; };
	M.suit = function (id) { return Math.floor((id % 52) / 13); };
	M.red = function (s) { return s === 1 || s === 2; };
	M.name = function (id, suitOf) { var s = suitOf ? suitOf(id) : M.suit(id); return M.RANKS[M.rank(id)] + M.SUITS[s]; };
	var SPIDER_SUITS = { 1: [0, 0, 0, 0, 0, 0, 0, 0], 2: [0, 1, 0, 1, 0, 1, 0, 1], 4: [0, 1, 2, 3, 0, 1, 2, 3] };

	/** Microsoft FreeCell deal n -> 8 columns of card ids (our numbering) */
	M.msDeal = function (n) {
		var seed = n >>> 0, cards = [], i, deal = [];
		for (i = 0; i < 52; i++) cards.push(i);
		var left = 52;
		for (i = 0; i < 52; i++) {
			seed = (seed * 214013 + 2531011) % 2147483648;
			var j = (seed >>> 16) % left;
			deal.push(cards[j]); cards[j] = cards[--left];
		}
		var cols = [[], [], [], [], [], [], [], []];
		// MS card index: rank = i >> 2 (0 = ace), suit = i & 3 (clubs, diamonds, hearts, spades)
		var MAP = [3, 2, 1, 0];
		for (i = 0; i < 52; i++) { var c = deal[i]; cols[i % 8].push(MAP[c & 3] * 13 + (c >> 2)); }
		return cols;
	};
	M.fcNumber = function (seed) {
		var n = parseInt(seed, 10);
		if (String(n) === String(seed) && n >= 1 && n <= 1000000) return n;
		return 1 + M.hashInt("fc|" + seed, 1000000);
	};

	/* ---------- games ---------- */
	function Game(variant, seed) {
		var V = M.VARIANTS[variant];
		if (!V) throw new Error("Unknown variant " + variant);
		this.v = variant; this.V = V; this.g = V.g; this.seed = String(seed);
		this.score = this.g === "s" ? 500 : 0; this.moves = 0; this.passes = 0; this.runs = 0;
		var p = [], i, j;
		if (this.g === "k") {
			var deck = M.shuffle(range(52), M.rng("k|" + seed));
			for (i = 0; i < 13; i++) p.push([]);
			for (i = 0; i < 7; i++) for (j = i; j < 7; j++) { var c = deck.pop(); p[6 + j].push(j === i ? c : ~c); }
			while (deck.length) p[0].push(~deck.pop());
		} else if (this.g === "s") {
			var suits = SPIDER_SUITS[V.suits];
			this.suitOf = function (id) { return suits[Math.floor(id / 13)]; };
			var d2 = M.shuffle(range(104), M.rng("s|" + V.suits + "|" + seed));
			for (i = 0; i < 19; i++) p.push([]);
			for (i = 0; i < 54; i++) p[9 + (i % 10)].push(~d2.pop());
			for (i = 9; i < 19; i++) p[i][p[i].length - 1] = ~p[i][p[i].length - 1];
			while (d2.length) p[0].push(~d2.pop());
		} else {
			var cols = M.msDeal(M.fcNumber(seed));
			for (i = 0; i < 8; i++) p.push([]);
			for (i = 0; i < 8; i++) p.push(cols[i].slice());
		}
		this.p = p;
	}
	function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
	Game.prototype.suitOf = function (id) { return M.suit(id); };
	Game.prototype.clone = function () {
		var g = Object.create(Game.prototype);
		for (var k in this) if (Object.prototype.hasOwnProperty.call(this, k)) g[k] = this[k];
		g.p = this.p.map(function (x) { return x.slice(); });
		return g;
	};
	Game.prototype.tab = function () { return this.g === "k" ? [6, 13] : this.g === "s" ? [9, 19] : [8, 16]; };
	Game.prototype.isTab = function (i) { var t = this.tab(); return i >= t[0] && i < t[1]; };
	Game.prototype.isFound = function (i) { return this.g === "k" ? i >= 2 && i <= 5 : this.g === "s" ? i >= 1 && i <= 8 : i >= 4 && i <= 7; };
	Game.prototype.isCell = function (i) { return this.g === "f" && i >= 0 && i < this.V.cells; };
	Game.prototype.foundSuit = function (i) { return this.g === "k" ? i - 2 : i - 4; };
	Game.prototype.top = function (i) { var a = this.p[i]; return a.length ? a[a.length - 1] : null; };
	Game.prototype.kind = function (i) {
		if (this.isTab(i)) return "tab";
		if (this.isFound(i)) return "found";
		if (this.g === "k") return i === 0 ? "stock" : "waste";
		if (this.g === "s") return "stock";
		return i < this.V.cells ? "cell" : "none";
	};
	/** can cards a (lower in the pile) and b (on top of it) sit together in a tableau run? */
	Game.prototype.links = function (a, b) {
		if (a < 0 || b < 0 || M.rank(a) !== M.rank(b) + 1) return false;
		if (this.g === "s") return this.suitOf(a) === this.suitOf(b);
		return M.red(this.suitOf(a)) !== M.red(this.suitOf(b));
	};
	/** how many cards at the top of pile i can be picked up together */
	Game.prototype.movable = function (i) {
		var a = this.p[i], k = this.kind(i);
		if (!a.length) return 0;
		if (k === "tab") {
			var n = 1;
			while (n < a.length && this.links(a[a.length - n - 1], a[a.length - n])) n++;
			return a[a.length - 1] < 0 ? 0 : n;
		}
		if (k === "waste" || k === "cell") return 1;
		if (k === "found") return this.g === "s" ? 0 : 1;
		return 0;
	};
	Game.prototype.fcMax = function (to) {
		var cells = 0, empty = 0, t = this.tab();
		for (var i = 0; i < this.V.cells; i++) if (!this.p[i].length) cells++;
		for (i = t[0]; i < t[1]; i++) if (!this.p[i].length && i !== to) empty++;
		return (cells + 1) * Math.pow(2, empty);
	};
	/** is [from, n, to] allowed? returns "" when it is, else why not */
	Game.prototype.why = function (f, n, t) {
		var P = this.p;
		if (f === 0 && n === 0 && t === 0 && this.g !== "f") {
			if (this.g === "k") {
				if (P[0].length) return "";
				if (!P[1].length) return "The stock is empty.";
				if (this.V.passes && this.passes >= this.V.passes - 1) return "No passes left.";
				return "";
			}
			if (!P[0].length) return "No more rows to deal.";
			for (var i = 9; i < 19; i++) if (!P[i].length) return "Fill every empty column before dealing.";
			return "";
		}
		if (!(f >= 0 && f < P.length && t >= 0 && t < P.length) || f === t || !(n >= 1)) return "Not a move.";
		if (n > this.movable(f)) return "Those cards cannot be moved together.";
		var a = P[f], c = a[a.length - n], tk = this.kind(t), tt = this.top(t);
		if (tk === "found") {
			if (this.g === "s") return "Complete runs go up by themselves.";
			if (n !== 1) return "One card at a time to a foundation.";
			if (this.suitOf(c) !== this.foundSuit(t)) return "Wrong suit for that foundation.";
			if (M.rank(c) !== P[t].length + 1) return "That card does not go there yet.";
			return "";
		}
		if (tk === "cell") {
			if (n !== 1 || P[t].length) return "A free cell holds one card.";
			return "";
		}
		if (tk === "tab") {
			if (this.g === "f" && n > this.fcMax(P[t].length ? -1 : t)) return "Not enough free cells and empty columns to move " + n + " cards.";
			if (tt === null) return this.g === "k" && M.rank(c) !== 13 ? "Only a King can go into an empty column." : "";
			if (tt < 0) return "Not a move.";
			if (M.rank(tt) !== M.rank(c) + 1) return "Cards go one rank lower.";
			if (this.g !== "s" && M.red(this.suitOf(tt)) === M.red(this.suitOf(c))) return "Colours must alternate (red on black).";
			return "";
		}
		return "Cards cannot go there.";
	};
	Game.prototype.legal = function (f, n, t) { return this.why(f, n, t) === ""; };
	/** do the move (checked). Returns false if it is not allowed. */
	Game.prototype.move = function (f, n, t) {
		if (!this.legal(f, n, t)) return false;
		var P = this.p, i;
		this.moves++;
		if (f === 0 && n === 0 && t === 0) {
			if (this.g === "k") {
				if (P[0].length) { for (i = 0; i < this.V.draw && P[0].length; i++) P[1].push(~P[0].pop()); }
				else {
					while (P[1].length) P[0].push(~P[1].pop());
					this.passes++;
					this.score = Math.max(0, this.score - (this.V.draw === 1 ? 100 : 20));
				}
			} else {
				for (i = 9; i < 19; i++) P[i].push(~P[0].pop());
				this.score--;
				this.spiderRuns();
			}
			return true;
		}
		var moving = P[f].splice(P[f].length - n, n);
		for (i = 0; i < moving.length; i++) P[t].push(moving[i]);
		if (this.g === "k") {
			var fk = this.kind(f), tk = this.kind(t);
			if (tk === "found") this.score += 10;
			else if (fk === "waste" && tk === "tab") this.score += 5;
			else if (fk === "found" && tk === "tab") this.score = Math.max(0, this.score - 15);
		}
		if (this.g === "s") this.score--;
		this.flip(f);
		if (this.g === "s") this.spiderRuns();
		return true;
	};
	Game.prototype.flip = function (i) {
		var a = this.p[i];
		if (this.isTab(i) && a.length && a[a.length - 1] < 0) { a[a.length - 1] = ~a[a.length - 1]; if (this.g === "k") this.score += 5; }
	};
	Game.prototype.spiderRuns = function () {
		for (var i = 9; i < 19; i++) {
			var a = this.p[i];
			if (a.length < 13) continue;
			var ok = true;
			for (var k = 0; k < 13; k++) {
				var c = a[a.length - 1 - k];
				if (c < 0 || M.rank(c) !== k + 1 || (k && this.suitOf(c) !== this.suitOf(a[a.length - 1]))) { ok = false; break; }
			}
			if (!ok) continue;
			var run = a.splice(a.length - 13, 13);
			this.p[1 + this.runs] = run; this.runs++;
			this.score += 100;
			this.flip(i);
		}
	};
	Game.prototype.won = function () {
		if (this.g === "s") return this.runs === 8;
		var f = this.g === "k" ? 2 : 4, s = 0;
		for (var i = 0; i < 4; i++) s += this.p[f + i].length;
		return s === 52;
	};
	Game.prototype.found = function () {
		if (this.g === "s") return this.runs * 13;
		var f = this.g === "k" ? 2 : 4, s = 0;
		for (var i = 0; i < 4; i++) s += this.p[f + i].length;
		return s;
	};
	/** safe move to a foundation (no card that could still be needed in the tableau): Klondike and FreeCell */
	Game.prototype.safeAuto = function () {
		if (this.g === "s") return null;
		var fb = this.g === "k" ? 2 : 4, i, lo = [99, 99];
		for (i = 0; i < 4; i++) { var len = this.p[fb + i].length, r = M.red(i) ? 1 : 0; if (len < lo[r]) lo[r] = len; }
		var src = this.sources();
		for (i = 0; i < src.length; i++) {
			var s = src[i], c = this.top(s);
			if (c === null || c < 0) continue;
			var r2 = M.rank(c), col = M.red(this.suitOf(c)) ? 1 : 0;
			if (r2 <= 2 || lo[1 - col] >= r2 - 1) { var t = fb + this.suitOf(c); if (this.legal(s, 1, t)) return [s, 1, t]; }
		}
		return null;
	};
	Game.prototype.sources = function () {
		var t = this.tab(), out = [], i;
		if (this.g === "k") out.push(1);
		if (this.g === "f") for (i = 0; i < this.V.cells; i++) out.push(i);
		for (i = t[0]; i < t[1]; i++) out.push(i);
		return out;
	};
	/** every legal move (the stock action included) */
	Game.prototype.allMoves = function () {
		var out = [], src = this.sources(), i, j, n;
		if (this.g !== "f" && this.legal(0, 0, 0)) out.push([0, 0, 0]);
		var dests = [];
		for (i = 0; i < this.p.length; i++) if (this.kind(i) === "tab" || this.kind(i) === "cell" || (this.kind(i) === "found" && this.g !== "s")) dests.push(i);
		if (this.g !== "s") { var fb = this.g === "k" ? 2 : 4; for (i = fb; i < fb + 4; i++) if (this.p[i].length) src.push(i); }
		for (i = 0; i < src.length; i++) {
			var m = this.movable(src[i]);
			for (n = 1; n <= m; n++) for (j = 0; j < dests.length; j++) if (this.legal(src[i], n, dests[j])) out.push([src[i], n, dests[j]]);
		}
		return out;
	};
	/** a sensible next move for the Hint button, or null. Prefers foundations, then moves that turn a card over or empty a column. */
	Game.prototype.hint = function () {
		var all = this.allMoves(), self = this, best = null, bs = -1e9;
		all.forEach(function (mv) {
			var s = self.scoreMove(mv);
			if (s > bs) { bs = s; best = mv; }
		});
		return bs > -1000 ? best : null;
	};
	Game.prototype.scoreMove = function (mv) {
		var f = mv[0], n = mv[1], t = mv[2], P = this.p, fk = this.kind(f), tk = this.kind(t);
		if (f === 0 && n === 0 && t === 0) return this.g === "k" && !P[0].length && !P[1].length ? -2000 : 1;
		var a = P[f], below = a.length > n ? a[a.length - n - 1] : null, c = a[a.length - n];
		if (tk === "found") return fk === "found" ? -2000 : 100 + (fk === "tab" && below !== null && below < 0 ? 30 : 0);
		if (fk === "found") return -1500;
		var s = 0;
		if (fk === "tab") {
			if (below !== null && below < 0) s += 60;               // turns a card over
			else if (below === null) s += P[t].length ? 40 : -1200;   // empties a column (pointless onto an empty column)
			else if (this.links(below, c)) s -= 1200;                 // breaks a run for nothing
			else if (this.g === "s") s += 15;                         // spider: joins a different-suit card onto its own suit later
			else s -= 300;
			if (this.g === "s" && P[t].length && this.suitOf(P[t][P[t].length - 1]) === this.suitOf(c)) s += 25;
			if (this.g === "k" && !P[t].length && below === null) s -= 1000;
		}
		if (fk === "waste") s += 20;
		if (tk === "cell") s -= 200 + (fk === "cell" ? 2000 : 0);
		if (fk === "cell" && tk === "tab") s += 30;
		if (tk === "tab" && !P[t].length && this.g !== "k") s -= 100;
		return s;
	};

	M.newGame = function (variant, seed) { return new Game(variant, seed); };
	M.Game = Game;

	/* ---------- moves as text (for saving and for Hive) ---------- */
	var B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
	/** [[f, n, t, dtMs], ...] -> "f n t dt." tokens (each pile / n one base-36 character, then the time since the last move) */
	M.encMoves = function (list) {
		return list.map(function (m) { return B36[m[0]] + B36[m[1]] + B36[m[2]] + Math.max(0, Math.round(m[3] || 0)).toString(36); }).join(".");
	};
	M.decMoves = function (s) {
		if (!s) return [];
		var out = [], parts = String(s).split(".");
		for (var i = 0; i < parts.length; i++) {
			var p = parts[i];
			if (!/^[0-9a-z]{4,10}$/.test(p)) return null;
			out.push([B36.indexOf(p[0]), B36.indexOf(p[1]), B36.indexOf(p[2]), parseInt(p.slice(3), 36)]);
		}
		return out;
	};
	/** replay moves on a fresh deal; returns {game, ok, at (first bad move)} */
	M.replay = function (variant, seed, moves) {
		var g = M.newGame(variant, seed);
		for (var i = 0; i < moves.length; i++) if (!g.move(moves[i][0], moves[i][1], moves[i][2])) return { game: g, ok: false, at: i };
		return { game: g, ok: true, at: -1 };
	};

	/* ---------- daily deals ---------- */
	M.utcDate = function (ms) { return new Date(ms == null ? Date.now() : ms).toISOString().slice(0, 10); };
	M.dailyBase = function (date, variant) { return "d" + date + variant; };
	/** the seed of a daily deal; k = how many deals were skipped to reach a winnable one (Klondike / FreeCell) */
	M.dailySeed = function (date, variant, k) {
		if (M.VARIANTS[variant].g === "f") {
			var n = 1 + M.hashInt("fc|" + M.dailyBase(date, variant) + "|" + (k || 0), 1000000);
			return String(n);
		}
		return M.dailyBase(date, variant) + (k ? "~" + k : "");
	};
	/** first winnable daily deal: Klondike by the solver (fixed budget, so everyone finds the same one), FreeCell skips known lost deals */
	M.dailyCanon = function (date, variant) {
		var V = M.VARIANTS[variant];
		for (var k = 0; k < 40; k++) {
			var s = M.dailySeed(date, variant, k);
			if (V.g === "s") return { k: k, seed: s };
			if (V.g === "f") { if (V.cells < 4 || M.FC_UNSOLVABLE.indexOf(+s) < 0) return { k: k, seed: s }; continue; }
			if (M.solve(variant, s, M.SOLVE_BUDGET).win) return { k: k, seed: s };
		}
		return { k: 0, seed: M.dailySeed(date, variant, 0) };
	};

	/* ---------- Klondike solver (knows every card; used for "winnable deals only") ---------- */
	/** depth-first search with the usual pruning. {win, nodes, moves (when won)}. budget = most positions to look at. */
	M.solve = function (variant, seed, budget) {
		var V = M.VARIANTS[variant];
		if (V.g === "f") return { win: V.cells < 4 ? null : M.FC_UNSOLVABLE.indexOf(M.fcNumber(seed)) < 0, nodes: 0 };
		if (V.g !== "k") return { win: null, nodes: 0 };
		budget = budget || M.SOLVE_BUDGET;
		var start = M.newGame(variant, seed), seen = {}, nodes = 0;
		var stack = [{ g: start, ms: null, i: 0, mv: null, auto: [] }];
		function key(g) {
			var tabs = [];
			for (var i = 6; i < 13; i++) tabs.push(g.p[i].map(ch).join(""));
			tabs.sort();
			return tabs.join("|") + "/" + g.p[0].map(ch).join("") + "/" + g.p[1].map(ch).join("") + "/" + g.p[2].length + g.p[3].length + "," + g.p[4].length + "," + g.p[5].length + (V.passes ? "/" + g.passes : "");
		}
		function ch(c) { return String.fromCharCode(c < 0 ? 100 + ~c : 40 + c); }
		function settle(g, path) {
			var m;
			while ((m = g.safeAuto())) { g.move(m[0], m[1], m[2]); path.push(m); }
		}
		function done(g) {
			if (g.won()) return true;
			if (g.p[0].length || g.p[1].length) return false;
			for (var i = 6; i < 13; i++) for (var j = 0; j < g.p[i].length; j++) if (g.p[i][j] < 0) return false;
			return true;
		}
		function gen(g) {
			var out = [], i, j, t;
			for (i = 6; i < 13; i++) { var c = g.top(i); if (c !== null && c >= 0 && g.legal(i, 1, 2 + M.suit(c))) out.push([i, 1, 2 + M.suit(c)]); }
			var w = g.top(1);
			if (w !== null && g.legal(1, 1, 2 + M.suit(w))) out.push([1, 1, 2 + M.suit(w)]);
			for (i = 6; i < 13; i++) {
				var a = g.p[i], n = g.movable(i);
				if (!n) continue;
				var reveals = a.length > n;
				for (t = 6; t < 13; t++) {
					if (t === i || !g.legal(i, n, t)) continue;
					if (!g.p[t].length && !reveals) continue;          // king stack from an empty-bottom column to another empty column
					out.push([i, n, t]);
					if (!g.p[t].length) break;                          // one empty column is as good as another
				}
				// part of a run, when the card under it can then go to a foundation
				for (j = 1; j < n; j++) {
					var under = a[a.length - j - 1];
					if (under >= 0 && M.rank(under) === g.p[2 + M.suit(under)].length + 1) {
						for (t = 6; t < 13; t++) if (t !== i && g.p[t].length && g.legal(i, j, t)) { out.push([i, j, t]); break; }
					}
				}
			}
			if (w !== null) for (t = 6; t < 13; t++) if (g.legal(1, 1, t)) { out.push([1, 1, t]); if (!g.p[t].length) break; }
			if (g.legal(0, 0, 0)) out.push([0, 0, 0]);
			return out;
		}
		function pathOf(extra) {
			var out = [];
			for (var i = 0; i < stack.length; i++) { if (stack[i].mv) out.push(stack[i].mv); out.push.apply(out, stack[i].auto); }
			return extra ? out.concat(extra) : out;
		}
		settle(start, stack[0].auto = []);
		if (done(start)) return { win: true, nodes: 0, moves: pathOf() };
		seen[key(start)] = 1;
		while (stack.length) {
			var top = stack[stack.length - 1];
			if (!top.ms) top.ms = gen(top.g);
			if (top.i >= top.ms.length) { stack.pop(); continue; }
			var mv = top.ms[top.i++], g2 = top.g.clone(), auto = [];
			g2.move(mv[0], mv[1], mv[2]);
			settle(g2, auto);
			if (done(g2)) return { win: true, nodes: nodes, moves: pathOf([mv].concat(auto)) };
			var k = key(g2);
			if (seen[k]) continue;
			seen[k] = 1;
			if (++nodes > budget) return { win: false, nodes: nodes, gaveUp: true };
			stack.push({ g: g2, ms: null, i: 0, mv: mv, auto: auto });
		}
		return { win: false, nodes: nodes };
	};
	/** finish a game whose cards are all face up (Klondike / FreeCell with everything showing): the moves, or null */
	M.autoFinish = function (game) {
		if (game.g === "s") return null;
		var g = game.clone(), out = [], guard = 0, i;
		for (i = 0; i < g.p.length; i++) for (var j = 0; j < g.p[i].length; j++) if (g.p[i][j] < 0 && g.kind(i) === "tab") return null;
		while (!g.won() && guard++ < 400) {
			var did = false, src = g.sources(), fb = g.g === "k" ? 2 : 4;
			for (i = 0; i < src.length && !did; i++) {
				var c = g.top(src[i]);
				if (c !== null && c >= 0 && g.legal(src[i], 1, fb + g.suitOf(c))) { out.push([src[i], 1, fb + g.suitOf(c)]); g.move(src[i], 1, fb + g.suitOf(c)); did = true; }
			}
			if (!did && g.g === "k" && g.legal(0, 0, 0)) { out.push([0, 0, 0]); g.move(0, 0, 0); did = true; }
			if (!did) return null;
		}
		return g.won() ? out : null;
	};

	/* ---------- records (saved to Hive) and their check ---------- */
	/** what a finished game sends to Hive. game = the won Game, list = [[f, n, t, dt], ...], o = {d (daily date), u (undos), h (hints)} */
	M.record = function (variant, seed, list, o) {
		o = o || {};
		var g = M.replay(variant, seed, list).game, t = 0;
		list.forEach(function (m) { t += Math.max(0, Math.round(m[3] || 0)); });
		var r = { v: M.V, k: variant, s: String(seed), t: t, c: list.length, sc: g.score, mv: M.encMoves(list) };
		if (o.d) r.d = o.d;
		if (o.u) r.u = o.u | 0;
		if (o.h) r.h = o.h | 0;
		return r;
	};
	M.json = function (rec) { return JSON.stringify(rec); };
	M.MV_MAX = 7600;
	/** check a record by replaying it. opt.dailySeed = the canonical seed of that day's deal (from the server's cache). */
	M.verify = function (r, opt) {
		opt = opt || {};
		function no(why) { return { ok: false, why: why }; }
		if (!r || typeof r !== "object" || r.v !== M.V) return no("Not a solitaire record.");
		var V = M.VARIANTS[r.k];
		if (!V) return no("Unknown game.");
		if (typeof r.s !== "string" || r.s.length < 1 || r.s.length > 40) return no("Bad deal.");
		if (typeof r.mv !== "string" || r.mv.length > M.MV_MAX) return no("Bad moves.");
		var list = M.decMoves(r.mv);
		if (!list || list.length !== r.c || !list.length) return no("The move count does not match.");
		var rp = M.replay(r.k, r.s, list);
		if (!rp.ok) return no("Move " + (rp.at + 1) + " is not allowed.");
		if (!rp.game.won()) return no("That game was not won.");
		var t = 0;
		list.forEach(function (m) { t += m[3]; });
		if (t !== r.t) return no("The time does not match the moves.");
		if (t < list.length * 1000 / M.MAX_RATE || t < 5000) return no("Too fast to be played by hand.");
		if (rp.game.score !== r.sc) return no("The score does not match.");
		var key = "a:" + r.k;
		if (r.d !== undefined) {
			if (!/^\d{4}-\d\d-\d\d$/.test(String(r.d)) || M.DAILY.indexOf(r.k) < 0) return no("Bad daily date.");
			if (opt.dailySeed != null && r.s !== opt.dailySeed) return no("That is not the deal of that day.");
			key = "d:" + r.d + ":" + r.k;
		}
		return { ok: true, t: t, c: list.length, sc: rp.game.score, board: key };
	};

	/** condenser_api.get_account_history entries -> [{trx, block, ts, acct, rec}] of mes_solitaire ops signed (posting) by acct */
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

	M.fmtTime = function (ms) {
		if (ms == null || !isFinite(ms)) return "—";
		var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
	};

	if (typeof module !== "undefined" && module.exports) module.exports = M;
	root.MESSolitaire = M;
})(typeof self !== "undefined" ? self : this);
