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

/* MES Solitaire page (mes.fm/solitaire). Rules / deals / solver / records: lib.js (window.MESSolitaire).
   Settings, statistics and the game in progress: localStorage "mes-solitaire:v1". Hive: main_js/hive.js (window.MESHive) signs one
   custom_json (id "mes_solitaire") per saved win; /api/solitaire replays it and keeps the leaderboard. On localhost (no /api) an
   in-browser stand-in (localStorage "mes-solitaire:mocklb") replays the record itself. Offline: /solitaire-sw.js (this page only). */
(function () {
	"use strict";
	var M = window.MESSolitaire;
	var root = document.getElementById("sl");
	if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var LS = "mes-solitaire:v1";
	var LEVELS = { k: ["k1", "k3", "k3p"], s: ["s1", "s2", "s4"], f: ["f4", "f3", "f2"] };

	/* ---------- settings + stats ---------- */
	var S = { v: "k1", deal: "r", win: true, auto: true, back: "b", stats: {}, daily: {}, cur: null, last: null, lbk: "d", lbv: "k1" };
	try { var saved = JSON.parse(localStorage.getItem(LS) || "null"); if (saved && typeof saved === "object") for (var k in S) if (saved[k] !== undefined) S[k] = saved[k]; } catch (e) {}
	if (!M.VARIANTS[S.v]) S.v = "k1";
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
	var urlDeal = null;
	(function fromQuery() {
		var q = new URLSearchParams(location.search);
		var v = q.get("v"), s = q.get("s");
		if (v && M.VARIANTS[v]) S.v = v;
		if (q.get("daily") === "1") S.deal = "d";
		if (s && s.length <= 24) urlDeal = s;
		if (v || s || q.get("daily")) try { history.replaceState(null, "", location.pathname); } catch (e) {}
	})();

	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	var toastT;
	function toast(msg) { var t = $("sl-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3400); }
	function status(msg) { $("sl-status").textContent = msg || ""; }
	function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

	/* ---------- game state ---------- */
	var G = null;          // lib Game
	var cur = null;        // {v, seed, d (daily date or ""), list [[f,n,t,dt]], groups [start index of each user action], u, h, carry, won}
	var lastAt = 0;        // performance time of the last move (or of resuming)
	var tick = null, busy = false, genToken = 0;
	var els = {}, slots = {}, where = {}, L = null;   // card elements by id, slot elements by pile, card id -> [pile, index], layout
	var sel = null, kbCur = null, tapMemo = null, hintT = null, finishing = false;

	function gameOf(v) { return M.VARIANTS[v].g; }
	function elapsed() {
		if (!cur) return 0;
		var t = cur.carry || 0;
		cur.list.forEach(function (m) { t += m[3]; });
		if (cur.list.length && !cur.won && lastAt) t += now() - lastAt;
		return t;
	}

	function newDeal(seed, opt) {
		opt = opt || {};
		genToken++;
		var tok = genToken, v = S.v, daily = S.deal === "d" && !opt.seed;
		if (daily && M.DAILY.indexOf(v) < 0) { v = S.v = LEVELS[gameOf(v)][0]; save(); syncSetup(); }
		if (daily) {
			var date = M.utcDate(), dk = date + "|" + v;
			var known = S.daily[dk] && S.daily[dk].seed;
			if (known) return start(v, known, date);
			showBusy("Finding today's deal…");
			setTimeout(function () { if (tok !== genToken) return; var c = M.dailyCanon(date, v); (S.daily[dk] = S.daily[dk] || {}).seed = c.seed; save(); start(v, c.seed, date); }, 30);
			return;
		}
		if (seed != null) return start(v, String(seed), "");
		var g = gameOf(v);
		function rnd() { return g === "f" ? String(1 + Math.floor(Math.random() * 1000000)) : Math.random().toString(36).slice(2, 10); }
		if (!S.win || g === "s" || (g === "f" && v !== "f4")) return start(v, rnd(), "");
		if (g === "f") { var n; do { n = rnd(); } while (M.FC_UNSOLVABLE.indexOf(+n) >= 0); return start(v, n, ""); }
		showBusy("Finding a winnable deal…");
		var tries = 0;
		(function next() {
			if (tok !== genToken) return;
			var s = rnd(), r = M.solve(v, s, 40000);
			tries++;
			if (r.win || tries >= 25) return start(v, s, "", r.win ? "" : "No winnable deal found quickly: this one may not be winnable.");
			setTimeout(next, 0);
		})();
	}
	function start(v, seed, date, note) {
		hideBusy();
		abandon();
		S.v = v;
		cur = { v: v, seed: seed, d: date || "", list: [], groups: [], u: 0, h: 0, carry: 0, won: false };
		G = M.newGame(v, seed);
		sel = null; kbCur = null; tapMemo = null; finishing = false; lastAt = 0;
		$("sl-after").hidden = true; $("sl-after").innerHTML = "";
		build(true);
		persist();
		updateInfo();
		var V = M.VARIANTS[v];
		status(note || (date ? "Today's " + V.name + " deal (" + date + ", UTC): the same cards for everyone." : V.name + ", deal " + seed + "."));
		describe();
		syncSetup();
		if (date) dailyPlayers();
	}
	/** a game left unfinished counts as a loss (it breaks the win streak) */
	function abandon() {
		if (!cur || cur.won || !cur.list.length) return;
		var st = stat(cur.v); st.cur = 0; save();
	}
	function persist() {
		if (!cur) return;
		S.cur = { v: cur.v, seed: cur.seed, d: cur.d, mv: M.encMoves(cur.list), groups: cur.groups, u: cur.u, h: cur.h, carry: cur.carry, won: cur.won };
		save();
	}
	function resume() {
		var c = S.cur;
		if (!c || c.won || !M.VARIANTS[c.v]) return false;
		if (c.d && c.d !== M.utcDate()) return false;
		var list = M.decMoves(c.mv || "");
		if (!list) return false;
		var rp = M.replay(c.v, c.seed, list);
		if (!rp.ok) return false;
		S.v = c.v; if (c.d) S.deal = "d";
		cur = { v: c.v, seed: c.seed, d: c.d || "", list: list, groups: c.groups || [], u: c.u | 0, h: c.h | 0, carry: c.carry || 0, won: false };
		G = rp.game;
		lastAt = list.length ? now() : 0;
		build(false);
		updateInfo();
		if (list.length) startTimer();
		status("Your game is back where you left it. " + (c.d ? "(Today's daily deal.)" : ""));
		describe(); syncSetup();
		return true;
	}

	/* ---------- moves ---------- */
	function apply(m, userStart) {
		if (!G.move(m[0], m[1], m[2])) return false;
		var t = now(), dt = cur.list.length ? (lastAt ? t - lastAt : 0) : 0;
		if (!cur.list.length) startTimer();
		dt += cur.carry || 0; cur.carry = 0;
		lastAt = t;
		if (userStart) cur.groups.push(cur.list.length);
		cur.list.push([m[0], m[1], m[2], Math.round(dt)]);
		return true;
	}
	function act(m) {
		if (busy || finishing || !cur || cur.won) return false;
		var why = G.why(m[0], m[1], m[2]);
		if (why) { status(why); return false; }
		apply(m, true);
		sel = null;
		autoPlay();
		after();
		return true;
	}
	function autoPlay() {
		if (!S.auto) return;
		var m, guard = 0;
		while ((m = G.safeAuto()) && guard++ < 60) apply(m, false);
	}
	function after() {
		render();
		updateInfo();
		persist();
		if (G.won()) return win();
		var fin = canFinish();
		$("sl-finish").hidden = !fin;
		if (fin && S.auto && G.g === "k" && !G.p[0].length && !G.p[1].length) finish();
	}
	function canFinish() { return G && !G.won() && G.g !== "s" && !!M.autoFinish(G); }
	function finish() {
		var moves = M.autoFinish(G);
		if (!moves || finishing) return;
		finishing = true;
		var i = 0, first = true;
		(function step() {
			if (!cur || cur.won) { finishing = false; return; }
			if (i >= moves.length) { finishing = false; after(); return; }
			apply(moves[i++], first); first = false;
			render(); updateInfo();
			setTimeout(step, 70);
		})();
	}
	function undo() {
		if (busy || finishing || !cur || cur.won || !cur.groups.length) return;
		var at = cur.groups.pop(), gone = cur.list.slice(at);
		gone.forEach(function (m) { cur.carry = (cur.carry || 0) + m[3]; });
		cur.list = cur.list.slice(0, at);
		cur.u++;
		G = M.replay(cur.v, cur.seed, cur.list).game;
		sel = null;
		status("Undone.");
		render(); updateInfo(); persist();
		$("sl-finish").hidden = !canFinish();
	}
	function restart() {
		if (!cur) return;
		if (cur.list.length && !cur.won && !confirm("Start this deal again from the beginning?")) return;
		start(cur.v, cur.seed, cur.d);
	}
	function hint() {
		if (!G || cur.won) return;
		var m = G.hint();
		clearHint();
		if (!m) { status(G.g === "f" ? "No useful moves left: undo a few moves or start a new deal." : "No useful moves: undo, or start a new deal."); return; }
		cur.h++; persist();
		if (m[0] === 0 && m[1] === 0 && m[2] === 0) { markHint([], 0); status(G.g === "s" ? "Deal a new row from the stock." : "Turn a card from the stock."); return; }
		var a = G.p[m[0]], ids = a.slice(a.length - m[1]);
		markHint(ids, m[2]);
		status("Move " + M.name(ids[0], G.suitOf.bind(G)) + (m[1] > 1 ? " (and the " + (m[1] - 1) + " card" + (m[1] > 2 ? "s" : "") + " on it)" : "") + " to " + pileName(m[2]) + ".");
	}
	function markHint(ids, pile) {
		ids.forEach(function (id) { if (els[id]) els[id].classList.add("is-hint"); });
		var top = G.top(pile);
		if (top !== null && top >= 0 && els[top] && ids.length) els[top].classList.add("is-hint");
		else if (slots[pile]) slots[pile].classList.add("is-hint");
		hintT = setTimeout(clearHint, 2200);
	}
	function clearHint() {
		clearTimeout(hintT);
		Array.prototype.forEach.call(root.querySelectorAll(".is-hint"), function (e) { e.classList.remove("is-hint"); });
	}
	function pileName(i) {
		var k = G.kind(i);
		if (k === "found") return G.g === "s" ? "the finished runs" : "the " + M.SUIT_NAMES[G.foundSuit(i)] + " foundation";
		if (k === "cell") return "a free cell";
		if (k === "waste") return "the waste";
		if (k === "stock") return "the stock";
		var t = G.tab()[0];
		return (G.p[i].length ? "column " : "the empty column ") + (i - t + 1);
	}

	/* ---------- win ---------- */
	function win() {
		cur.won = true;
		stopTimer();
		$("sl-finish").hidden = true;
		var t = elapsed(), st = stat(cur.v);
		st.w++; st.cur++; st.best = Math.max(st.best, st.cur);
		if (!st.bt || t < st.bt) st.bt = Math.round(t);
		if (!st.bm || cur.list.length < st.bm) st.bm = cur.list.length;
		if (G.g !== "f" && (st.bs == null || G.score > st.bs)) st.bs = G.score;
		if (cur.d) { var dk = cur.d + "|" + cur.v, dd = S.daily[dk] = S.daily[dk] || {}; if (!dd.best || t < dd.best) dd.best = Math.round(t); }
		var rec = M.record(cur.v, cur.seed, cur.list, { d: cur.d || undefined, u: cur.u, h: cur.h });
		S.last = { won: true, rec: rec };
		persist();
		celebrate();
		var box = $("sl-after");
		box.innerHTML = "<h3>You won!</h3><p>" + esc(M.VARIANTS[cur.v].name) + (cur.d ? " · today's daily deal" : " · deal " + esc(cur.seed)) + "</p><p>Time <b>" + M.fmtTime(t) + "</b> · " + cur.list.length + " moves" + (G.g !== "f" ? " · score <b>" + G.score + "</b>" : "") + (cur.u ? " · " + cur.u + " undo" + (cur.u > 1 ? "s" : "") : "") + "</p>" +
			'<p><button type="button" class="tu-btn tu-btn--primary" id="sl-again">Deal again</button> <button type="button" class="tu-btn" id="sl-hivego">Save to Hive</button></p><div id="sl-hbox"></div>';
		box.hidden = false;
		$("sl-again").addEventListener("click", function () { newDeal(); });
		$("sl-hivego").addEventListener("click", function () { this.hidden = true; hiveBox(); });
		status("Solved in " + M.fmtTime(t) + ".");
		renderStats();
	}
	function celebrate() {
		if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		var ids = Object.keys(els), i = 0, W = L.W, H = L.H;
		var timer = setInterval(function () {
			for (var k = 0; k < 4 && i < ids.length; k++, i++) {
				var e = els[ids[i]], x = Math.random() * (W - L.cw), y = H * 0.25 + Math.random() * H * 0.6;
				e.style.transition = "transform 0.9s cubic-bezier(.2,.7,.3,1)";
				e.style.transform = "translate(" + x + "px," + y + "px) rotate(" + (Math.random() * 60 - 30) + "deg)";
			}
			if (i >= ids.length) clearInterval(timer);
		}, 40);
	}
	function stat(v) {
		var s = S.stats[v] = S.stats[v] || {};
		["p", "w", "cur", "best"].forEach(function (k) { if (typeof s[k] !== "number") s[k] = 0; });
		return s;
	}

	/* ---------- timer + info ---------- */
	function startTimer() { if (!tick) tick = setInterval(updateInfo, 500); if (cur && cur.list.length === 1) { stat(cur.v).p++; save(); } }
	function stopTimer() { clearInterval(tick); tick = null; }
	function updateInfo() {
		$("sl-time").textContent = M.fmtTime(elapsed());
		$("sl-moves").textContent = cur ? cur.list.length : 0;
		$("sl-scorebox").hidden = !G || G.g === "f";
		if (G) $("sl-score").textContent = G.score;
		$("sl-undo").disabled = !cur || cur.won || !cur.groups.length;
	}

	/* ---------- drawing ---------- */
	function cardHtml(id) {
		var r = M.rank(id), s = G.suitOf(id), sym = M.SUITS[s] + "︎", rk = M.RANKS[r];
		var mid = r > 10 ? '<span class="mid fc">' + rk + "</span>" : '<span class="mid">' + sym + "</span>";
		return '<div class="f"><span class="c1">' + rk + "<i>" + sym + '</i></span>' + mid + '<span class="c2">' + rk + "<i>" + sym + "</i></span></div><div class=\"bk\"></div>";
	}
	function build(dealAnim) {
		var tb = $("sl-table");
		tb.innerHTML = ""; els = {}; slots = {};
		root.setAttribute("data-back", S.back);
		for (var i = 0; i < G.p.length; i++) {
			if (!showSlot(i)) continue;
			var sd = document.createElement("div");
			sd.className = "sl-slot";
			sd.setAttribute("data-pile", i);
			tb.appendChild(sd); slots[i] = sd;
		}
		var n = G.g === "s" ? 104 : 52;
		for (var id = 0; id < n; id++) {
			var e = document.createElement("div");
			e.className = "sl-card" + (M.red(G.suitOf(id)) ? " red" : "");
			e.setAttribute("data-id", id);
			e.innerHTML = cardHtml(id);
			tb.appendChild(e); els[id] = e;
		}
		layout();
		if (dealAnim && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
			var sp = stockPoint();
			Object.keys(els).forEach(function (id) { var e = els[id]; e.style.transition = "none"; e.style.transform = "translate(" + sp[0] + "px," + sp[1] + "px)"; });
			void tb.offsetWidth;
			var order = 0;
			for (var p = 0; p < G.p.length; p++) G.p[p].forEach(function (c) { var e = els[c < 0 ? ~c : c]; e.style.transition = ""; e.style.transitionDelay = G.isTab(p) ? (order++ * 12) + "ms" : "0ms"; });
			render();
			setTimeout(function () { Object.keys(els).forEach(function (id) { els[id].style.transitionDelay = ""; }); }, 1500);
		} else render();
	}
	function showSlot(i) {
		var k = G.kind(i);
		if (k === "none") return false;
		if (G.g === "s" && k === "found") return i === 1;
		return true;
	}
	function stockPoint() { return G.g === "f" ? [L.W / 2 - L.cw / 2, -L.ch * 1.4] : [colX(G.g === "s" ? 9 : 0), L.top]; }
	function colX(c) { return L.x0 + c * (L.cw + L.gap); }
	function layout() {
		var stage = $("sl-stage"), W = Math.max(280, stage.clientWidth), cols = G.g === "k" ? 7 : G.g === "s" ? 10 : 8;
		var gap = Math.max(4, Math.round(W * 0.012)), cw = Math.floor((W - gap * (cols + 1)) / cols);
		var fill = root.querySelector(".sl-view.mes-pfill") !== null || document.fullscreenElement;
		var maxCw = fill ? 200 : 128;
		var availH = fill ? stage.clientHeight : Math.max(380, Math.min(window.innerHeight - 90, 1100));
		cw = Math.min(cw, maxCw, Math.floor((availH - gap * 3) / 1.4 / 3.2));
		cw = Math.max(cw, 34);
		var ch = Math.round(cw * 1.4), used = cols * cw + (cols - 1) * gap;
		L = { W: W, cw: cw, ch: ch, gap: gap, x0: Math.round((W - used) / 2), top: gap, cols: cols, availH: availH, fill: fill };
		L.tabTop = L.top + ch + gap * 1.6;
		var fs = Math.max(10, Math.round(cw * 0.22));
		$("sl-table").style.fontSize = fs + "px";
		Object.keys(els).forEach(function (id) { var e = els[id]; e.style.width = cw + "px"; e.style.height = ch + "px"; e.style.borderRadius = Math.round(cw * 0.08) + "px"; });
		Array.prototype.forEach.call(root.querySelectorAll(".sl-card .mid"), function (m) { m.style.fontSize = (m.classList.contains("fc") ? cw * 0.42 : cw * 0.5) + "px"; });
	}
	/** where each card goes: {x, y} per pile and index; also sets the table height */
	function positions() {
		var P = G.p, pos = [], i, j, t = G.tab();
		var hMax = L.availH - L.gap;
		for (i = 0; i < P.length; i++) {
			var a = P[i], out = [], k = G.kind(i), x, y;
			if (G.isTab(i)) {
				x = colX(i - t[0]); y = L.tabTop;
				var dn = L.ch * 0.11, up = L.ch * 0.27, need = 0;
				for (j = 0; j < a.length - 1; j++) need += a[j] < 0 ? dn : up;
				var room = Math.max(L.ch * 1.2, hMax - L.tabTop - L.ch), sc = need > room ? room / need : 1;
				for (j = 0; j < a.length; j++) { out.push({ x: x, y: y }); y += (a[j] < 0 ? dn : up) * sc; }
			} else if (G.g === "k") {
				if (k === "stock") { for (j = 0; j < a.length; j++) out.push({ x: colX(0) - Math.floor(j / 8) * 1.5, y: L.top - Math.floor(j / 8) * 1.5 }); }
				else if (k === "waste") {
					var fan = G.V.draw === 3 ? L.cw * 0.24 : 0, vis = Math.min(3, a.length);
					for (j = 0; j < a.length; j++) { var off = j >= a.length - vis ? (j - (a.length - vis)) * fan : 0; out.push({ x: colX(1) + off, y: L.top }); }
				} else for (j = 0; j < a.length; j++) out.push({ x: colX(1 + i), y: L.top });   // foundations 2-5 -> columns 3-6
			} else if (G.g === "s") {
				if (k === "stock") { for (j = 0; j < a.length; j++) out.push({ x: colX(9) - Math.floor(j / 10) * L.cw * 0.18, y: L.top }); }
				else for (j = 0; j < a.length; j++) out.push({ x: colX(0) + (i - 1) * L.cw * 0.3, y: L.top });
			} else {
				for (j = 0; j < a.length; j++) out.push({ x: colX(i), y: L.top });   // cells 0-3, foundations 4-7
			}
			pos.push(out);
		}
		return pos;
	}
	function slotRect(i) {
		var t = G.tab();
		if (G.isTab(i)) return { x: colX(i - t[0]), y: L.tabTop };
		if (G.g === "k") return { x: colX(i === 0 ? 0 : i === 1 ? 1 : 1 + i), y: L.top };
		if (G.g === "s") return { x: i === 0 ? colX(9) : colX(0), y: L.top };
		return { x: colX(i), y: L.top };
	}
	function render() {
		if (!G) return;
		var pos = positions(), maxY = L.tabTop + L.ch, z = 1;
		where = {};
		for (var i = 0; i < G.p.length; i++) {
			var a = G.p[i];
			for (var j = 0; j < a.length; j++) {
				var c = a[j], id = c < 0 ? ~c : c, e = els[id], p = pos[i][j];
				where[id] = [i, j];
				e.classList.toggle("up", c >= 0);
				if (!e.classList.contains("is-drag")) e.style.transform = "translate(" + p.x + "px," + p.y + "px)";
				var zz = G.g === "s" && G.kind(i) === "found" ? 100 + i * 20 + (13 - j) : z + j;
				e.style.zIndex = e.classList.contains("is-drag") ? 5000 + j : zz;
				e.classList.toggle("can", c >= 0 && a.length - j <= G.movable(i));
				e.classList.toggle("is-pick", !!(sel && sel.pile === i && j >= a.length - sel.n));
				if (p.y + L.ch > maxY) maxY = p.y + L.ch;
			}
			z += 60;
		}
		// cards no longer on the table (none in these games, but keep hidden ones out of the way)
		Object.keys(slots).forEach(function (pi) {
			var s = slots[pi], r = slotRect(+pi), i2 = +pi, k = G.kind(i2);
			s.style.left = r.x + "px"; s.style.top = r.y + "px"; s.style.width = L.cw + "px"; s.style.height = L.ch + "px"; s.style.borderRadius = Math.round(L.cw * 0.08) + "px";
			var label = "";
			if (k === "found") label = G.g === "s" ? "K→A" : "A" + M.SUITS[G.foundSuit(i2)] + "︎";
			else if (k === "stock") label = G.g === "k" ? (G.p[1].length && !(G.V.passes && G.passes >= G.V.passes - 1) ? "↻" : "") : "";
			else if (k === "tab" && G.g === "k") label = "K";
			s.textContent = label;
			s.style.fontSize = Math.round(L.cw * (label.length > 2 ? 0.2 : 0.32)) + "px";
			s.classList.toggle("is-click", k === "stock");
			s.classList.toggle("is-cur", !!(kbCur && kbCur.pile === i2 && !G.p[i2].length));
		});
		if (kbCur) { var top = G.top(kbCur.pile), a2 = G.p[kbCur.pile]; Object.keys(els).forEach(function (id) { els[id].classList.remove("is-cur"); }); if (a2.length) { var cid = a2[Math.max(0, a2.length - kbCur.n)]; els[cid < 0 ? ~cid : cid].classList.add("is-cur"); } void top; }
		var H = Math.max(Math.ceil(maxY + L.gap), L.fill ? $("sl-stage").clientHeight : 0, Math.round(L.tabTop + L.ch * 3.4));
		L.H = H;
		$("sl-table").style.height = H + "px";
		$("sl-table").style.width = "100%";
	}

	/* ---------- pointer: drag and tap ---------- */
	var drag = null;
	$("sl-table").addEventListener("pointerdown", function (e) {
		if (e.button > 0 || busy || !G || cur.won || finishing) return;
		var ce = e.target.closest(".sl-card"), se = e.target.closest(".sl-slot");
		clearHint();
		if (!ce) {
			if (se && G.kind(+se.getAttribute("data-pile")) === "stock") { e.preventDefault(); act([0, 0, 0]); return; }
			if (se && sel) { e.preventDefault(); tryMove(sel.pile, sel.n, +se.getAttribute("data-pile")); return; }
			return;
		}
		var id = +ce.getAttribute("data-id"), w = where[id];
		if (!w) return;
		var pile = w[0], idx = w[1], a = G.p[pile], n = a.length - idx;
		if (G.kind(pile) === "stock") { e.preventDefault(); act([0, 0, 0]); return; }
		if (sel && !(sel.pile === pile)) { e.preventDefault(); tryMove(sel.pile, sel.n, pile); return; }
		if (a[idx] < 0 || n > G.movable(pile)) { ce.classList.add("shake"); setTimeout(function () { ce.classList.remove("shake"); }, 320); return; }
		e.preventDefault();
		var ids = a.slice(idx).map(function (c) { return c; });
		var rect = $("sl-table").getBoundingClientRect(), p0 = positions()[pile][idx];
		drag = { pile: pile, n: n, ids: ids, x0: e.clientX, y0: e.clientY, moved: false, pid: e.pointerId, base: positions()[pile].slice(idx), off: [e.clientX - rect.left - p0.x, e.clientY - rect.top - p0.y] };
		try { ce.setPointerCapture(e.pointerId); } catch (er) {}
	});
	$("sl-table").addEventListener("pointermove", function (e) {
		if (!drag || e.pointerId !== drag.pid) return;
		var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
		if (!drag.moved && dx * dx + dy * dy < 36) return;
		if (!drag.moved) { drag.moved = true; drag.ids.forEach(function (id) { els[id].classList.add("is-drag"); }); }
		drag.ids.forEach(function (id, k) { var e2 = els[id], b = drag.base[k]; e2.style.zIndex = 5000 + k; e2.style.transform = "translate(" + (b.x + dx) + "px," + (b.y + dy) + "px)"; });
		drag.dx = dx; drag.dy = dy;
	});
	function endDrag(e, cancel) {
		if (!drag || (e && e.pointerId !== drag.pid)) return;
		var d = drag; drag = null;
		d.ids.forEach(function (id) { els[id].classList.remove("is-drag"); });
		if (cancel) { render(); return; }
		if (!d.moved) return tap(d.pile, d.n);
		var x = d.base[0].x + d.dx, y = d.base[0].y + d.dy, best = null, bestA = 0, bestBad = null, bestBadA = 0;
		for (var i = 0; i < G.p.length; i++) {
			if (i === d.pile) continue;
			var k = G.kind(i);
			if (k === "stock" || k === "waste" || k === "none") continue;
			var r = dropRect(i), ov = Math.max(0, Math.min(x + L.cw, r.x + r.w) - Math.max(x, r.x)) * Math.max(0, Math.min(y + L.ch, r.y + r.h) - Math.max(y, r.y));
			if (ov <= 0) continue;
			if (G.legal(d.pile, d.n, i)) { if (ov > bestA) { bestA = ov; best = i; } }
			else if (ov > bestBadA) { bestBadA = ov; bestBad = i; }
		}
		if (best !== null) { act([d.pile, d.n, best]); return; }
		if (bestBad !== null) status(G.why(d.pile, d.n, bestBad));
		render();
	}
	$("sl-table").addEventListener("pointerup", function (e) { endDrag(e, false); });
	$("sl-table").addEventListener("pointercancel", function (e) { endDrag(e, true); });
	function dropRect(i) {
		var a = G.p[i], s = slotRect(i);
		if (G.isTab(i)) { var pos = positions()[i], ly = a.length ? pos[a.length - 1].y : s.y; return { x: s.x - L.gap / 2, y: s.y, w: L.cw + L.gap, h: ly - s.y + L.ch + L.ch * 0.4 }; }
		if (G.g === "s") return { x: 0, y: 0, w: 0, h: 0 };
		return { x: s.x - L.gap / 2, y: s.y - L.gap / 2, w: L.cw + L.gap, h: L.ch + L.gap };
	}
	/** tap a card: send it to the best place; tap the same card again soon to try the next place */
	function tap(pile, n) {
		var dests = destinations(pile, n);
		if (!dests.length) {
			status(G.g === "f" || n === 1 ? "That card has nowhere to go." : "Those cards have nowhere to go.");
			var a = G.p[pile], c = a[a.length - n], e = els[c < 0 ? ~c : c];
			if (e) { e.classList.add("shake"); setTimeout(function () { e.classList.remove("shake"); }, 320); }
			return;
		}
		var a2 = G.p[pile], cardId = a2[a2.length - n], nowT = Date.now();
		// tapping the card just moved again: try the next place, never straight back where it came from
		if (tapMemo && tapMemo.id === cardId && nowT - tapMemo.at < 2500) {
			var other = dests.filter(function (d) { return tapMemo.seen.indexOf(d) < 0; });
			if (other.length) dests = other;
		} else tapMemo = null;
		var to = dests[0], seen = tapMemo ? tapMemo.seen : [pile];
		if (act([pile, n, to])) { seen.push(to); tapMemo = { id: cardId, at: nowT, seen: seen }; }
	}
	function destinations(pile, n) {
		var out = [], fnd = [], tabsFull = [], tabsEmpty = [], cells = [], i;
		for (i = 0; i < G.p.length; i++) {
			if (i === pile || !G.legal(pile, n, i)) continue;
			var k = G.kind(i);
			if (k === "found") fnd.push(i);
			else if (k === "cell") cells.push(i);
			else if (k === "tab") (G.p[i].length ? tabsFull : tabsEmpty).push(i);
		}
		if (G.kind(pile) === "found") fnd = [];
		// spider: prefer columns whose top card has the same suit
		if (G.g === "s") {
			var a = G.p[pile], c = a[a.length - n];
			tabsFull.sort(function (x, y) { return sameSuit(y, c) - sameSuit(x, c); });
		}
		out = fnd.concat(tabsFull, tabsEmpty.slice(0, 1), cells.slice(0, 1));
		return out;
	}
	function sameSuit(p, c) { var t = G.top(p); return t !== null && t >= 0 && G.suitOf(t) === G.suitOf(c) ? 1 : 0; }
	function tryMove(f, n, t) {
		if (f === t) { sel = null; render(); return; }
		if (!act([f, n, t])) { sel = null; render(); }
	}

	/* ---------- keyboard ---------- */
	function kbPiles() {
		var out = [], i, t = G.tab();
		if (G.g === "k") out.push(0, 1, 2, 3, 4, 5);
		else if (G.g === "s") out.push(0);
		else { for (i = 0; i < G.V.cells; i++) out.push(i); out.push(4, 5, 6, 7); }
		for (i = t[0]; i < t[1]; i++) out.push(i);
		return out;
	}
	$("sl-table").addEventListener("keydown", function (e) {
		if (!G || e.ctrlKey || e.metaKey || e.altKey) return;
		var piles = kbPiles();
		if (!kbCur) kbCur = { pile: G.tab()[0], n: 1 };
		var idx = piles.indexOf(kbCur.pile), key = e.key, a;
		if (key === "ArrowRight" || key === "ArrowLeft") {
			idx = (idx + (key === "ArrowRight" ? 1 : piles.length - 1)) % piles.length;
			kbCur = { pile: piles[idx], n: 1 };
		} else if (key === "ArrowUp" || key === "ArrowDown") {
			a = G.p[kbCur.pile];
			var mx = Math.max(1, G.movable(kbCur.pile));
			kbCur.n = Math.max(1, Math.min(mx, kbCur.n + (key === "ArrowUp" ? 1 : -1)));
			void a;
		} else if (key === "Enter" || key === " ") {
			var k2 = G.kind(kbCur.pile);
			if (k2 === "stock") act([0, 0, 0]);
			else if (sel) { if (sel.pile === kbCur.pile) { var s0 = sel; sel = null; tap(s0.pile, s0.n); } else tryMove(sel.pile, sel.n, kbCur.pile); }
			else if (G.movable(kbCur.pile)) { sel = { pile: kbCur.pile, n: Math.min(kbCur.n, G.movable(kbCur.pile)) }; status("Picked up " + sel.n + " card" + (sel.n > 1 ? "s" : "") + ": choose where to put " + (sel.n > 1 ? "them" : "it") + " and press Enter (Enter again on the same pile = best place)."); }
		} else if (key === "Escape") { sel = null; }
		else return;
		e.preventDefault();
		render();
	});
	document.addEventListener("keydown", function (e) {
		var tag = (e.target && e.target.tagName) || "";
		if (/INPUT|TEXTAREA|SELECT/.test(tag) || $("sl-p-play").hidden) return;
		var k = e.key.toLowerCase();
		if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); undo(); return; }
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (k === "u") undo();
		else if (k === "h") hint();
		else if (k === "n") newDeal();
		else if (k === "f" && !$("sl-finish").hidden) finish();
		else if (k === "d" || k === "s") { if (G && G.g !== "f") act([0, 0, 0]); }
		else return;
		e.preventDefault();
	});

	/* ---------- busy overlay ---------- */
	function showBusy(msg) { busy = true; var b = root.querySelector(".sl-busy"); if (!b) { b = document.createElement("div"); b.className = "sl-busy"; $("sl-stage").appendChild(b); } b.textContent = msg; }
	function hideBusy() { busy = false; var b = root.querySelector(".sl-busy"); if (b) b.remove(); }

	/* ---------- setup controls ---------- */
	function seg(id, val) { Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === val ? "true" : "false"); }); }
	function wireSeg(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (b) fn(b.getAttribute("data-v")); }); }
	var LEVEL_NAMES = { k: ["Easy: draw 1", "Medium: draw 3", "Hard: 3 passes"], s: ["Easy: 1 suit", "Medium: 2 suits", "Hard: 4 suits"], f: ["Easy: 4 cells", "Medium: 3 cells", "Hard: 2 cells"] };
	function syncSetup() {
		var g = gameOf(S.v), lv = LEVELS[g].indexOf(S.v);
		seg("sl-g", g); seg("sl-lv", String(lv)); seg("sl-dl", S.deal);
		Array.prototype.forEach.call($("sl-lv").querySelectorAll("button"), function (b, i) { b.textContent = LEVEL_NAMES[g][i]; b.disabled = S.deal === "d" && i > 0; });
		$("sl-win").checked = S.win; $("sl-auto").checked = S.auto; $("sl-back").value = S.back;
		$("sl-win").disabled = S.deal === "d" || g === "s";
		$("sl-seed").placeholder = g === "f" ? "1 to 1000000" : "any number or word";
		if (cur) $("sl-seed").value = cur.d ? "" : cur.seed;
	}
	function describe() {
		var V = M.VARIANTS[S.v], g = V.g, txt = "";
		if (g === "k") txt = "Build Ace to King on the four foundations; in the columns, red on black going down. " + (V.draw === 1 ? "One card at a time from the stock." : "Three cards at a time from the stock" + (V.passes ? ", only three passes." : "."));
		else if (g === "s") txt = "Build King to Ace in one suit to clear a run. Any card goes on one rank higher, but only same-suit runs move together. " + V.suits + " suit" + (V.suits > 1 ? "s" : "") + ".";
		else txt = "Every card is face up. Use the " + V.cells + " free cells, build down in alternating colours, and send everything to the foundations.";
		if (S.deal === "d") txt += " The daily deal is the same for everyone today" + (g === "k" ? " and always winnable." : ".");
		else if (S.win && g === "k") txt += " Winnable deals only: the computer has won this deal itself first.";
		else if (S.win && g === "f" && V.cells === 4) txt += " Every FreeCell deal you get can be won.";
		else if (g === "s") txt += V.suits === 1 ? " One-suit deals can almost always be won." : " Not every " + V.suits + "-suit deal can be won.";
		var st = S.stats[S.v];
		if (st && st.w) txt += " Your best: " + M.fmtTime(st.bt) + ", " + st.w + " win" + (st.w > 1 ? "s" : "") + " of " + st.p + ".";
		var dd = S.deal === "d" && S.daily[M.utcDate() + "|" + S.v];
		if (dd && dd.best) txt += " Your best on today's deal: " + M.fmtTime(dd.best) + ".";
		$("sl-desc").textContent = txt;
	}
	function confirmLeave() { return !cur || cur.won || !cur.list.length || confirm("Leave this game? It will count as a loss."); }
	wireSeg("sl-g", function (g) { if (gameOf(S.v) === g || !confirmLeave()) return; S.v = LEVELS[g][S.deal === "d" ? 0 : Math.max(0, LEVELS[gameOf(S.v)].indexOf(S.v))]; save(); newDeal(); });
	wireSeg("sl-lv", function (i) { var v = LEVELS[gameOf(S.v)][+i]; if (v === S.v || !confirmLeave()) return; S.v = v; save(); newDeal(); });
	wireSeg("sl-dl", function (d) { if (d === S.deal || !confirmLeave()) return; S.deal = d; save(); newDeal(); });
	$("sl-win").addEventListener("change", function () { S.win = this.checked; save(); describe(); });
	$("sl-auto").addEventListener("change", function () { S.auto = this.checked; save(); if (S.auto && cur && !cur.won && cur.list.length) { autoPlay(); after(); } });
	$("sl-back").addEventListener("change", function () { S.back = this.value; save(); root.setAttribute("data-back", S.back); });
	function playSeed() {
		var s = ($("sl-seed").value || "").trim();
		if (!s) return toast("Type a deal number or word first.");
		if (gameOf(S.v) === "f" && !(/^\d+$/.test(s) && +s >= 1 && +s <= 1000000)) return toast("FreeCell deals are numbered 1 to 1,000,000.");
		if (!confirmLeave()) return;
		S.deal = "r"; save(); newDeal(s, { seed: true });
	}
	$("sl-seedgo").addEventListener("click", playSeed);
	$("sl-seed").addEventListener("keydown", function (e) { if (e.key === "Enter") playSeed(); });
	$("sl-share").addEventListener("click", function () {
		if (!cur) return;
		var url = location.origin + "/solitaire?v=" + cur.v + (cur.d ? "&daily=1" : "&s=" + encodeURIComponent(cur.seed));
		(navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link to this deal copied."); }, function () { prompt("Copy this link:", url); });
	});
	$("sl-new").addEventListener("click", function () { if (confirmLeave()) newDeal(); });
	$("sl-restart").addEventListener("click", restart);
	$("sl-undo").addEventListener("click", undo);
	$("sl-hint").addEventListener("click", hint);
	$("sl-finish").addEventListener("click", finish);

	/* tabs */
	$("sl-tabs").addEventListener("click", function (e) {
		var b = e.target.closest(".sl-tab"); if (!b) return;
		showTab(b.getAttribute("data-t"));
	});
	function showTab(t) {
		Array.prototype.forEach.call($("sl-tabs").children, function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
		["play", "lb", "stats"].forEach(function (x) { $("sl-p-" + x).hidden = x !== t; });
		if (t === "lb") { renderLogin(); loadLb(); }
		if (t === "stats") renderStats();
		if (t === "play") { layout(); render(); }
	}

	/* resize */
	var rT;
	function relayout() { if (!G) return; clearTimeout(rT); rT = setTimeout(function () { layout(); render(); }, 60); }
	window.addEventListener("resize", relayout);
	if (window.ResizeObserver) new ResizeObserver(relayout).observe($("sl-stage"));
	function wirePanel() {
		if (!window.MESPanel || $("sl-view").__mesPanel) return;
		window.MESPanel.add($("sl-view"), { bar: $("sl-vbar").querySelector(".sl-vbtns"), stage: $("sl-stage"), onChange: function () { setTimeout(function () { layout(); render(); }, 40); } });
		$("sl-view").__mesPanel = true;
	}
	if (document.readyState === "complete") wirePanel(); else window.addEventListener("load", wirePanel);
	document.addEventListener("visibilitychange", function () {
		// time away from the page is not counted
		if (!cur || cur.won || !cur.list.length) return;
		if (document.hidden) { cur.carry = (cur.carry || 0) + (now() - lastAt); lastAt = 0; persist(); }
		else lastAt = now();
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var html = '<div class="sl-sgrid">', any = false;
		Object.keys(M.VARIANTS).forEach(function (v) {
			var s = S.stats[v];
			if (!s || !s.p) return;
			any = true;
			html += '<div class="sl-sbox"><h3>' + esc(M.VARIANTS[v].name) + "</h3><dl><dt>Played</dt><dd>" + s.p + "</dd><dt>Won</dt><dd>" + (s.w | 0) + " (" + Math.round((s.w | 0) / s.p * 100) + "%)</dd><dt>Win streak</dt><dd>" + (s.cur | 0) + "</dd><dt>Best streak</dt><dd>" + (s.best | 0) + "</dd>" +
				"<dt>Fastest win</dt><dd>" + (s.bt ? M.fmtTime(s.bt) : "—") + "</dd><dt>Fewest moves</dt><dd>" + (s.bm || "—") + "</dd>" + (v[0] !== "f" ? "<dt>Best score</dt><dd>" + (s.bs != null ? s.bs : "—") + "</dd>" : "") + "</dl></div>";
		});
		html += "</div>";
		$("sl-stats").innerHTML = any ? html : '<p class="sl-sub">No games yet.</p>';
	}
	$("sl-sreset").addEventListener("click", function () {
		if (!confirm("Clear all your Solitaire statistics in this browser?")) return;
		S.stats = {}; S.daily = {}; save(); renderStats(); toast("Statistics cleared.");
	});

	/* ---------- Hive ---------- */
	var HV = window.MESHive || null;
	function me() { var u = HV && HV.user && HV.user(); return u ? u.name : (MOCK ? (sessionStorage.getItem("mes-solitaire:mockacct") || "") : ""); }
	function avatar(n) { return HV && HV.avatar ? HV.avatar(n, "small") : "https://images.hive.blog/u/" + encodeURIComponent(n) + "/avatar/small"; }
	function loginHtml() {
		var u = me();
		if (u) return '<p class="sl-who">Signed in as ' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b> <button type="button" class="tu-btn" data-h="out">Log out</button></p>';
		return '<div class="sl-hrow"><input class="tu-input" data-h="user" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" data-h="in">Log in with Hive</button></div>' +
			'<p class="tu-note">' + (MOCK ? "Test copy: any username works here and nothing is signed (no Keychain on a local copy)." : "Hive Keychain (the extension, or the Keychain phone app) proves you own the account by signing a message with your posting key. Your keys never leave Keychain.") + "</p>";
	}
	function wireLogin(box, done) {
		box.innerHTML = loginHtml();
		var out = box.querySelector('[data-h="out"]'), inb = box.querySelector('[data-h="in"]'), user = box.querySelector('[data-h="user"]');
		if (out) out.addEventListener("click", function () { if (MOCK && !(HV && HV.user && HV.user())) sessionStorage.removeItem("mes-solitaire:mockacct"); else if (HV) HV.logout(); refreshLogins(); });
		if (inb) {
			var go = function () {
				var n = (user.value || "").trim().replace(/^@/, "").toLowerCase();
				if (MOCK) { if (!/^[a-z][a-z0-9.-]{2,15}$/.test(n)) return toast("That is not a Hive username."); sessionStorage.setItem("mes-solitaire:mockacct", n); refreshLogins(); if (done) done(); return; }
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
	function renderLogin() { wireLogin($("sl-hlogin")); }
	function refreshLogins() { renderLogin(); if ($("sl-hbox") && $("sl-hbox").childNodes.length) hiveBox(); }
	if (HV && HV.onChange) HV.onChange(function () { refreshLogins(); });
	function hiveBox() {
		var box = $("sl-hbox"); if (!box || !S.last || !S.last.won) return;
		var rec = S.last.rec, u = me();
		box.innerHTML = '<p class="tu-note">Saves one public, permanent message (custom_json id <code>mes_solitaire</code>) from your Hive account with this deal, your time, moves and score and the list of your moves. It uses only your posting key, through Keychain, and costs no HIVE.</p><div class="sl-hl"></div>';
		var hl = box.querySelector(".sl-hl");
		if (!u) { wireLogin(hl, hiveBox); return; }
		hl.innerHTML = '<p class="sl-who">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b></p><p><button type="button" class="tu-btn tu-btn--primary" data-h="send">Sign and save this win</button></p><p class="sl-sub" data-h="msg"></p>';
		hl.querySelector('[data-h="send"]').addEventListener("click", function () { sendHive(rec, u, this, hl.querySelector('[data-h="msg"]')); });
	}
	function sendHive(rec, u, btn, msg) {
		var json = M.json(rec);
		if (json.length > 8000) { msg.textContent = "This game has too many moves to fit in one Hive message."; return; }
		btn.disabled = true; msg.textContent = "Waiting for Keychain…";
		var p = MOCK && !(HV && HV.user && HV.user()) ? Promise.resolve({ trx: "mock" + Date.now().toString(16) }) : (HV ? HV.keychain() : Promise.resolve(null)).then(function (kc) {
			if (!kc) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) {
				kc.requestCustomJson(u, M.ID, "Posting", json, "Save a Solitaire win (" + M.VARIANTS[rec.k].short + ", " + M.fmtTime(rec.t) + ")", function (r) {
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
			if (r.ok) msg.innerHTML = "On the leaderboard: <b>#" + r.rank + "</b> of " + r.count + " (" + esc(boardName(r.board)) + ")." + (r.best === false ? " Your earlier result there was better, so it stays." : "");
			else if (r.code === 404 && tries < 8) { msg.textContent = "Waiting for the next Hive block… (" + (tries + 1) + ")"; setTimeout(function () { submit(u, trx, rec, msg, tries + 1); }, 3500); }
			else msg.textContent = "Saved on Hive, but not added to the leaderboard: " + (r.error || "unknown problem") + ".";
		});
	}
	function boardName(key) {
		var p = String(key).split(":"), v = p[p.length - 1], n = M.VARIANTS[v] ? M.VARIANTS[v].name : v;
		return p[0] === "d" ? "daily " + n + ", " + p[1] : "all-time " + n;
	}

	/* ---------- API (or the local stand-in) ---------- */
	function api(method, body, query, rec) {
		if (MOCK) return Promise.resolve(mockApi(method, body, query, rec));
		var url = "/api/solitaire" + (query ? "?" + new URLSearchParams(query).toString() : "");
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(url, opt).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j.code = r.status; if (!r.ok && !j.error) j.error = "HTTP " + r.status; j.ok = r.ok && j.ok !== false; return j; });
		}, function () { return { ok: false, code: 0, error: "Could not reach mes.fm" }; });
	}
	function mockLoad() { try { return JSON.parse(localStorage.getItem("mes-solitaire:mocklb") || "{}"); } catch (e) { return {}; } }
	function mockApi(method, body, query, rec) {
		var db = mockLoad();
		if (method === "POST") {
			var v = M.verify(rec, {});
			if (!v.ok) return { ok: false, code: 422, error: v.why };
			var sc = function (x) { return x.t * 1000 + x.c; };
			var lst = (db[v.board] || []).filter(function (x) { return x.acct !== body.acct; }), old = (db[v.board] || []).filter(function (x) { return x.acct === body.acct; })[0], best = true;
			var row = { acct: body.acct, t: v.t, c: v.c, sc: v.sc, u: rec.u | 0, trx: body.trx, ts: Date.now() };
			if (old && sc(old) <= sc(row)) { best = false; lst.push(old); } else lst.push(row);
			lst.sort(function (a, b) { return sc(a) - sc(b); });
			db[v.board] = lst;
			localStorage.setItem("mes-solitaire:mocklb", JSON.stringify(db));
			return { ok: true, board: v.board, rank: 1 + lst.findIndex(function (x) { return x.acct === body.acct; }), count: lst.length, best: best };
		}
		if (query.daily) { var o = { ok: true }; M.DAILY.forEach(function (v2) { o[v2] = (db["d:" + query.daily + ":" + v2] || []).length; }); return o; }
		var top = (db[query.board] || []).slice(0, +query.n || 25);
		return { ok: true, top: top, count: (db[query.board] || []).length };
	}

	/* ---------- leaderboard ---------- */
	function fillLbv() {
		var sel2 = $("sl-lbv"), list = S.lbk === "d" ? M.DAILY : Object.keys(M.VARIANTS);
		if (list.indexOf(S.lbv) < 0) S.lbv = list[0];
		sel2.innerHTML = list.map(function (v) { return '<option value="' + v + '"' + (v === S.lbv ? " selected" : "") + ">" + esc(M.VARIANTS[v].name) + "</option>"; }).join("");
	}
	function lbKey() { return S.lbk === "d" ? "d:" + M.utcDate() + ":" + S.lbv : "a:" + S.lbv; }
	function loadLb() {
		seg("sl-lbk", S.lbk); fillLbv();
		var key = lbKey();
		$("sl-lbnote").textContent = (MOCK ? "Local test copy: this list is kept in this browser only. The real leaderboard works on mes.fm. " : "") +
			(S.lbk === "d" ? "Today's daily deal (" + M.utcDate() + ", UTC; a new deal starts at midnight UTC). Fastest time first, then fewest moves." : "Any deal of this game, all time. Fastest time first, then fewest moves.");
		$("sl-lb").innerHTML = '<p class="sl-sub">Loading…</p>';
		api("GET", null, { board: key, n: 50 }).then(function (r) {
			if (key !== lbKey()) return;
			if (!r.ok) { $("sl-lb").innerHTML = '<p class="sl-sub">' + esc(r.code === 404 || r.code === 0 ? "The leaderboard works on mes.fm (it could not be reached from here)." : r.error || "Could not load the leaderboard.") + "</p>"; return; }
			var top = r.top || [], u = me();
			if (!top.length) { $("sl-lb").innerHTML = '<p class="sl-sub">No wins yet. Win a game, press "Save to Hive", and yours can be the first.</p>'; return; }
			var showSc = S.lbv[0] !== "f";
			var html = '<div class="sl-twrap"><table class="sl-tbl"><thead><tr><th>#</th><th>Player</th><th class="r">Time</th><th class="r">Moves</th>' + (showSc ? '<th class="r">Score</th>' : "") + '<th class="r">Undos</th><th>Proof</th></tr></thead><tbody>';
			top.forEach(function (x, i) {
				html += '<tr class="' + (x.acct === u ? "me" : "") + '"><td>' + (i + 1) + '</td><td><img alt="" loading="lazy" src="' + esc(avatar(x.acct)) + '"><a href="https://peakd.com/@' + esc(x.acct) + '" target="_blank" rel="noopener">@' + esc(x.acct) + '</a></td><td class="r">' + M.fmtTime(x.t) + '</td><td class="r">' + x.c + "</td>" + (showSc ? '<td class="r">' + x.sc + "</td>" : "") + '<td class="r">' + (x.u | 0) + "</td><td>" +
					(x.trx && !/^mock/.test(x.trx) ? '<a href="https://hivehub.dev/tx/' + esc(x.trx) + '" target="_blank" rel="noopener">on Hive</a>' : "—") + "</td></tr>";
			});
			html += "</tbody></table></div>";
			if (r.count > top.length) html += '<p class="sl-sub">' + r.count + " players in all.</p>";
			$("sl-lb").innerHTML = html;
		});
	}
	wireSeg("sl-lbk", function (v) { S.lbk = v; save(); loadLb(); });
	$("sl-lbv").addEventListener("change", function () { S.lbv = this.value; save(); loadLb(); });
	$("sl-lbref").addEventListener("click", loadLb);
	function dailyPlayers() {
		var d = M.utcDate(), v = S.v;
		if (!navigator.onLine) return;
		api("GET", null, { daily: d }).then(function (r) {
			if (!r.ok || !cur || cur.d !== d || cur.v !== v) return;
			var n = r[v] | 0;
			$("sl-desc").textContent += " " + (n ? n + (n === 1 ? " player has" : " players have") + " a verified time on today's deal." : "No verified times on today's deal yet.");
		});
	}

	/* ---------- offline ---------- */
	function offline() {
		var note = $("sl-offline");
		if (!("serviceWorker" in navigator) || MOCK) { note.textContent = ""; return; }
		navigator.serviceWorker.register("/solitaire-sw.js", { scope: "/solitaire" }).then(function (reg) {
			var done = function () { note.textContent = "✓ Works offline: this page is saved in your browser, so you can open mes.fm/solitaire with no connection."; };
			if (reg.active) done(); else { note.textContent = "Saving the page for offline play…"; navigator.serviceWorker.ready.then(done); }
		}, function () { note.textContent = ""; });
		window.addEventListener("offline", function () { status("You are offline: the game keeps working. The leaderboard and Save to Hive need a connection."); });
	}

	/* ---------- start ---------- */
	syncSetup();
	if (urlDeal) { S.deal = "r"; newDeal(urlDeal, { seed: true }); }
	else if (!resume()) newDeal();
	offline();
	window.MESSolitaireDebug = { game: function () { return G; }, cur: function () { return cur; }, act: act, undo: undo, hint: hint, finish: finish, newDeal: newDeal, S: S, render: render };
})();
