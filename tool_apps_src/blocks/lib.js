/* MES Falling Blocks: the rules, randomiser, rotation system, scoring, garbage, move recording and replay check (window.MESBlocks).
   Pure code: runs in the page, in node (tool_apps_src/blocks-tests.js) and on the server: a byte-identical copy lives at
   mes.fm/api/_blocks-lib.js (it replays Hive-saved games for the leaderboard). cp after editing; the tests check.

   Deterministic on purpose: a game is (seed, mode, start level) + a list of actions with their times in ms. The same list always
   gives the same board, score and lines, in any browser and on the server, because the engine only uses integers:
     - pieces come from a 7-bag shuffled by mulberry32 seeded from the seed string (xmur3); garbage holes from a second stream;
     - time runs in microseconds; gravity intervals per level are a fixed integer table (the guideline curve, precomputed);
     - lock delay 500 ms with up to 15 move / rotate resets (reset counter cleared when the piece reaches a new lowest row).
   Board: 10 columns x 24 rows, row 0 at the top, rows 0-3 hidden above the 20 visible rows. cell = y * 10 + x, 0 = empty,
   1-7 = piece colour (I O T S Z J L), 8 = garbage. Pieces spawn with their box at x 3, y 2 and drop one row straight away.
   Rotation = SRS with the standard wall kicks (y down here, so the table's y is negated); 180 degrees with a small kick list.
   T-spins: 3-corner rule; mini unless both front corners are filled or the 5th kick was used.
   Scoring = the guideline table x level, back-to-back x1.5, combo 50 x combo x level, perfect clear bonus, soft drop 1 / hard 2 per cell.
   Actions (recorded only when they change something): 0 left, 1 right, 2 rotate right, 3 rotate left, 4 rotate 180, 5 hold,
   6 hard drop, 7 soft drop on, 8 soft drop off, 9 slide to the left wall, 10 slide to the right wall, 11 drop to the floor (no lock).
   encMoves(): varints of (dt << 4 | action), dt = ms since the previous action, base64url.
   Hive record (custom_json id "mes_blocks"): {v:1, md:"s"|"u"|"m", s:seed, lv:start level, t:ms, l:lines, sc:score, pc:pieces,
   mv:actions, d?:"YYYY-MM-DD" (daily sprint)}. */
(function (root) {
	"use strict";
	var B = {};
	B.V = 1;
	B.ID = "mes_blocks";
	B.W = 10; B.H = 24; B.HID = 4;
	B.MV_MAX = 7000;            /* characters of encoded actions; Hive's custom_json limit is 8,192 bytes */
	B.MAX_PPS = 12;             /* pieces per second above this is not a person (the 40-line record is about 7) */
	B.LOCK_US = 500000; B.LOCK_RESETS = 15;
	B.SPRINT_LINES = 40; B.MARATHON_LINES = 150; B.ULTRA_MS = 120000;
	B.MODES = {
		m: { name: "Marathon", desc: "Clear 150 lines while the speed goes up every 10 lines. Highest score wins." },
		s: { name: "Sprint 40", desc: "Clear 40 lines as fast as you can." },
		u: { name: "Ultra 2 min", desc: "As many points as you can in two minutes." },
		z: { name: "Zen", desc: "No speed-up, no end. Just play." },
		r: { name: "Race", desc: "Two players, the same pieces, lines you clear are sent to the other player." }
	};
	B.PIECES = "IOTSZJL";
	B.COLORS = ["", "#22b8cf", "#fcc419", "#9c36b5", "#40c057", "#f03e3e", "#1c7ed6", "#fd7e14", "#868e96"];
	/* microseconds per row at levels 1-20: (0.8 - (level - 1) * 0.007) ^ (level - 1) seconds */
	B.GRAV = [1000000, 793000, 617796, 472729, 355197, 262004, 189677, 134735, 93882, 64152, 42976, 28218, 18153, 11439, 7059, 4264, 2520, 1457, 824, 455];
	B.gravUs = function (level, soft) {
		var g = B.GRAV[Math.max(1, Math.min(20, level)) - 1];
		return soft ? Math.max(1, Math.floor(g / 20)) : g;
	};

	/* ---------- shapes (state 0, y down) ---------- */
	var BASE = {
		I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
		S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]]
	};
	B.SHAPES = {};   /* SHAPES[p][r] = [[x, y] x 4] */
	"IOTSZJL".split("").forEach(function (p) {
		var n = p === "I" || p === "O" ? 4 : 3, st = [BASE[p]];
		for (var r = 1; r < 4; r++) st.push(p === "O" ? BASE.O : st[r - 1].map(function (c) { return [n - 1 - c[1], c[0]]; }));
		B.SHAPES[p] = st;
	});
	/* SRS kicks as [x, y-up] per "from>to"; converted to y down when used */
	var K_JLSTZ = {
		"0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
		"1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
		"2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
		"3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
	};
	var K_I = {
		"0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
		"1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
		"2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
		"3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
	};
	var K_180 = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]];
	B.kicks = function (p, from, to) {
		if (p === "O") return [[0, 0]];
		if ((from + 2) % 4 === to) return K_180;
		return (p === "I" ? K_I : K_JLSTZ)[from + ">" + to];
	};

	/* ---------- seeded random ---------- */
	function xmur3(str) {
		var h = 1779033703 ^ str.length;
		for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
		return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
	}
	function mulberry(a) {
		return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0); };
	}
	B.rng = function (seed) { return mulberry(xmur3(String(seed))()); };
	/** the first n pieces of a seed (for tests and previews) */
	B.sequence = function (seed, n) {
		var r = B.rng(seed), bag = [], out = [];
		while (out.length < n) { if (!bag.length) bag = shuffle(r); out.push(bag.shift()); }
		return out;
	};
	function shuffle(r) {
		var a = B.PIECES.split("");
		for (var i = a.length - 1; i > 0; i--) { var j = r() % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
		return a;
	}
	B.randomSeed = function () {
		var s = "", abc = "abcdefghjkmnpqrstuvwxyz23456789";
		var a = new Uint8Array(10);
		if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < 10; i++) a[i] = Math.floor(Math.random() * 256);
		for (var k = 0; k < 10; k++) s += abc[a[k] % abc.length];
		return s;
	};
	B.utcDate = function (ms) { return new Date(ms == null ? Date.now() : ms).toISOString().slice(0, 10); };
	B.dailySeed = function (d) { return "daily-" + d; };

	/* ---------- scoring ---------- */
	B.LINE_PTS = [0, 100, 300, 500, 800];
	B.TS_PTS = [400, 800, 1200, 1600];          /* T-spin with 0-3 lines */
	B.MINI_PTS = [100, 200, 400];               /* mini T-spin with 0-2 lines */
	B.PC_PTS = [0, 800, 1200, 1800, 2000];
	B.ATTACK = [0, 0, 1, 2, 4];
	B.TS_ATTACK = [0, 2, 4, 6];
	B.COMBO_ATTACK = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
	B.clearName = function (n, ts) {
		var w = ["", "Single", "Double", "Triple", "Quad"][n] || "";
		if (ts === "full") return "T-Spin" + (w ? " " + w : "");
		if (ts === "mini") return "Mini T-Spin" + (w ? " " + w : "");
		return w;
	};

	/* ---------- the game ---------- */
	function Game(o) {
		o = o || {};
		this.seed = String(o.seed == null ? "x" : o.seed);
		this.mode = B.MODES[o.mode] ? o.mode : "m";
		this.lv0 = Math.max(1, Math.min(20, o.lv | 0 || 1));
		this.board = new Uint8Array(B.W * B.H);
		this.r = B.rng(this.seed);
		this.gr = B.rng(this.seed + "|garbage");
		this.bag = []; this.queue = [];
		this.now = 0;            /* µs */
		this.ms = 0;             /* last action time in ms */
		this.score = 0; this.lines = 0; this.level = this.lv0; this.pieces = 0;
		this.combo = -1; this.b2b = 0; this.over = ""; this.endMs = 0;
		this.hold = ""; this.holdUsed = false; this.sd = false;
		this.cur = null; this.nd = 0; this.lt = -1; this.lr = 0; this.low = 0;
		this.lastRot = false; this.lastKick = 0;
		this.pending = 0; this.sent = 0; this.attack = 0; this.recv = 0;
		this.stats = { quads: 0, tspins: 0, minis: 0, pcs: 0, maxCombo: 0, maxB2b: 0, sd: 0, hd: 0 };
		this.log = []; this.ev = []; this.rev = 0;
		this.fill();
		this.spawn(this.next());
	}
	B.Game = Game;
	var P = Game.prototype;
	P.fill = function () { while (this.queue.length < 7) { if (!this.bag.length) this.bag = shuffle(this.r); this.queue.push(this.bag.shift()); } };
	P.next = function () { var p = this.queue.shift(); this.fill(); return p; };
	P.cells = function (pc) { var s = B.SHAPES[pc.p][pc.r], out = []; for (var i = 0; i < 4; i++) out.push([pc.x + s[i][0], pc.y + s[i][1]]); return out; };
	P.fits = function (p, r, x, y) {
		var s = B.SHAPES[p][r], b = this.board;
		for (var i = 0; i < 4; i++) {
			var cx = x + s[i][0], cy = y + s[i][1];
			if (cx < 0 || cx >= B.W || cy < 0 || cy >= B.H || b[cy * B.W + cx]) return false;
		}
		return true;
	};
	P.grounded = function () { var c = this.cur; return !!c && !this.fits(c.p, c.r, c.x, c.y + 1); };
	P.ghostY = function () { var c = this.cur; if (!c) return 0; var y = c.y; while (this.fits(c.p, c.r, c.x, y + 1)) y++; return y; };
	P.iv = function () { return B.gravUs(this.mode === "z" ? this.lv0 : this.level, this.sd); };
	P.spawn = function (p) {
		var c = { p: p, r: 0, x: 3, y: 2 };
		if (!this.fits(p, 0, 3, 2)) { this.cur = null; this.end("top"); return false; }
		if (this.fits(p, 0, 3, 3)) c.y = 3;
		this.cur = c; this.lt = -1; this.lr = 0; this.low = c.y; this.lastRot = false; this.lastKick = 0;
		this.nd = this.now + this.iv();
		if (this.grounded()) this.lt = this.now + B.LOCK_US;
		this.rev++;
		return true;
	};
	P.end = function (why) {
		if (this.over) return;
		if (this.mode === "z" && why === "top") {   /* Zen never ends: the board is cleared and play goes on */
			this.board = new Uint8Array(B.W * B.H); this.pending = 0; this.ev.push({ k: "zenclear" }); this.rev++;
			this.spawn(this.next()); return;
		}
		this.over = why; this.endMs = Math.round(this.now / 1000); this.cur = null;
		this.ev.push({ k: why === "top" ? "topout" : "done" });
		this.rev++;
	};
	/** after a successful move / rotate: lock-delay bookkeeping */
	P.moved = function () {
		var c = this.cur;
		if (c.y > this.low) { this.low = c.y; this.lr = 0; }
		if (this.grounded()) {
			if (this.lr < B.LOCK_RESETS) { this.lt = this.now + B.LOCK_US; this.lr++; }
			else if (this.lt < 0) this.lt = this.now;
		} else this.lt = -1;
		this.rev++;
	};
	P.shift = function (dx) {
		var c = this.cur; if (!c || !this.fits(c.p, c.r, c.x + dx, c.y)) return false;
		c.x += dx; this.lastRot = false; this.moved(); return true;
	};
	P.slide = function (dx) { var ok = false; while (this.shift(dx)) ok = true; return ok; };
	P.rotate = function (dir) {
		var c = this.cur; if (!c) return false;
		var to = (c.r + dir + 4) % 4, ks = B.kicks(c.p, c.r, to);
		for (var i = 0; i < ks.length; i++) {
			var nx = c.x + ks[i][0], ny = c.y - ks[i][1];
			if (this.fits(c.p, to, nx, ny)) {
				c.x = nx; c.y = ny; c.r = to; this.lastRot = true; this.lastKick = i;
				this.moved(); return true;
			}
		}
		return false;
	};
	P.doHold = function () {
		if (!this.cur || this.holdUsed) return false;
		var p = this.cur.p, h = this.hold;
		this.hold = p; this.holdUsed = true;
		this.ev.push({ k: "hold" });
		this.spawn(h || this.next());
		return true;
	};
	P.fall = function () {
		var c = this.cur; if (!c || !this.fits(c.p, c.r, c.x, c.y + 1)) return false;
		c.y++; this.lastRot = false;
		if (c.y > this.low) { this.low = c.y; this.lr = 0; }
		if (this.grounded()) this.lt = this.now + B.LOCK_US;
		this.rev++;
		return true;
	};
	P.hardDrop = function () {
		var c = this.cur; if (!c) return false;
		var n = 0; while (this.fits(c.p, c.r, c.x, c.y + 1)) { c.y++; n++; }
		if (n) this.lastRot = false;
		this.score += 2 * n; this.stats.hd += 2 * n;
		this.ev.push({ k: "hard", n: n });
		this.lock();
		return true;
	};
	P.sonic = function () {
		var c = this.cur; if (!c) return false;
		var n = 0; while (this.fits(c.p, c.r, c.x, c.y + 1)) { c.y++; n++; }
		if (!n) return false;
		this.lastRot = false; this.score += n; this.stats.sd += n;
		this.low = c.y; this.lr = 0; this.lt = this.now + B.LOCK_US; this.rev++;
		return true;
	};
	/** 3-corner T-spin test: "" | "mini" | "full" */
	P.tspin = function () {
		var c = this.cur;
		if (!c || c.p !== "T" || !this.lastRot) return "";
		var corners = [[0, 0], [2, 0], [2, 2], [0, 2]], filled = [], n = 0;
		for (var i = 0; i < 4; i++) {
			var x = c.x + corners[i][0], y = c.y + corners[i][1];
			var f = x < 0 || x >= B.W || y >= B.H || y < 0 || !!this.board[y * B.W + x];
			filled.push(f); if (f) n++;
		}
		if (n < 3) return "";
		var front = [[0, 1], [1, 2], [2, 3], [3, 0]][c.r];
		if ((filled[front[0]] && filled[front[1]]) || this.lastKick === 4) return "full";
		return "mini";
	};
	P.lock = function () {
		var c = this.cur; if (!c) return;
		var ts = this.tspin(), cells = this.cells(c), above = true, b = this.board, col = B.PIECES.indexOf(c.p) + 1;
		for (var i = 0; i < 4; i++) { b[cells[i][1] * B.W + cells[i][0]] = col; if (cells[i][1] >= B.HID) above = false; }
		this.cur = null; this.pieces++; this.holdUsed = false; this.lt = -1;
		var full = [];
		for (var y = 0; y < B.H; y++) { var k = 0; for (var x = 0; x < B.W; x++) if (b[y * B.W + x]) k++; if (k === B.W) full.push(y); }
		var n = full.length;
		if (n) {
			var nb = new Uint8Array(B.W * B.H), dst = B.H - 1;
			for (var sy = B.H - 1; sy >= 0; sy--) { if (full.indexOf(sy) >= 0) continue; nb.set(b.subarray(sy * B.W, sy * B.W + B.W), dst * B.W); dst--; }
			this.board = b = nb;
		}
		var lvl = this.level, pts = 0, atk = 0, hard = false, e = { k: "lock", n: n, ts: ts, rows: full };
		if (ts === "full") { pts = B.TS_PTS[n] || 1600; atk = B.TS_ATTACK[n] || 6; if (n) hard = true; this.stats.tspins++; }
		else if (ts === "mini") { pts = B.MINI_PTS[n] || 400; atk = n ? n - 1 : 0; if (n) hard = true; this.stats.minis++; }
		else { pts = B.LINE_PTS[n]; atk = B.ATTACK[n]; if (n === 4) { hard = true; this.stats.quads++; } }
		if (n) {
			if (hard) { if (this.b2b > 0) { pts = Math.floor(pts * 3 / 2); atk += 1; e.b2b = this.b2b; } this.b2b++; }
			else this.b2b = 0;
			this.combo++;
			if (this.combo > 0) { pts += 50 * this.combo; atk += B.COMBO_ATTACK[Math.min(this.combo, 12)]; e.combo = this.combo; }
			var empty = true; for (var q = 0; q < b.length; q++) if (b[q]) { empty = false; break; }
			if (empty) { pts += (n === 4 && e.b2b ? 3200 : B.PC_PTS[n]); atk += 10; e.pc = true; this.stats.pcs++; }
		} else {
			this.combo = -1;
			if (ts) this.ev.push({ k: "tsnone", ts: ts });
		}
		this.score += pts * lvl;
		this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
		this.stats.maxB2b = Math.max(this.stats.maxB2b, this.b2b - 1);
		e.pts = pts * lvl; e.atk = atk;
		this.lines += n;
		var oldLv = this.level;
		if (this.mode !== "z") this.level = Math.min(20, Math.max(this.lv0, Math.floor(this.lines / 10) + 1));
		if (this.level > oldLv) this.ev.push({ k: "level", lv: this.level });
		this.ev.push(e);
		// garbage: lines cancel what is coming first, the rest is sent; a piece with no lines lets the pending garbage in
		if (atk) { this.attack += atk; var cancel = Math.min(atk, this.pending); this.pending -= cancel; this.sent += atk - cancel; }
		if (!n && this.pending) { var g = this.pending; this.pending = 0; if (!this.raise(g)) { this.rev++; return; } }
		this.rev++;
		if (above && !n) { this.end("top"); return; }
		if ((this.mode === "s" || this.mode === "r") && this.lines >= B.SPRINT_LINES) { this.end("done"); return; }
		if (this.mode === "m" && this.lines >= B.MARATHON_LINES) { this.end("done"); return; }
		this.spawn(this.next());
	};
	/** push n garbage rows in from the bottom (one hole column per batch); false when the stack goes off the top */
	P.raise = function (n) {
		n = Math.min(n, B.H);
		var b = this.board, out = false;
		for (var i = 0; i < n * B.W; i++) if (b[i]) { out = true; break; }
		var hole = this.gr() % B.W, nb = new Uint8Array(B.W * B.H);
		nb.set(b.subarray(n * B.W), 0);
		for (var y = B.H - n; y < B.H; y++) for (var x = 0; x < B.W; x++) nb[y * B.W + x] = x === hole ? 0 : 8;
		this.board = nb; this.recv += n;
		this.ev.push({ k: "garbage", n: n });
		if (out) { this.end("top"); return false; }
		return true;
	};
	/** race only (not part of a recorded solo game): queue garbage sent by the other player */
	P.addGarbage = function (n) { if (n > 0 && !this.over) { this.pending += n; this.rev++; } };
	/** run gravity and lock delay up to time ms (whole ms) */
	P.tick = function (ms) {
		var to = Math.max(this.now, ms * 1000);
		if (this.mode === "u") to = Math.min(to, B.ULTRA_MS * 1000);
		while (!this.over && this.cur) {
			var gr = this.grounded(), e = gr ? (this.lt >= 0 ? this.lt : Infinity) : this.nd;
			if (e > to) break;
			this.now = e;
			if (gr) this.lock();
			else { this.fall(); if (this.sd) { this.score++; this.stats.sd++; } this.nd = this.now + this.iv(); }
		}
		if (!this.over) this.now = to;
		if (this.mode === "u" && !this.over && this.now >= B.ULTRA_MS * 1000) this.end("done");
	};
	/** apply an action at time ms; it is recorded only if it changed something. Returns true if it did. */
	P.act = function (a, ms) {
		if (this.over) return false;
		ms = Math.max(this.ms, Math.round(ms), Math.ceil(this.now / 1000));
		this.tick(ms);
		if (this.over || !this.cur) return false;
		var ok = false;
		switch (a) {
			case 0: ok = this.shift(-1); break;
			case 1: ok = this.shift(1); break;
			case 2: ok = this.rotate(1); break;
			case 3: ok = this.rotate(-1); break;
			case 4: ok = this.rotate(2); break;
			case 5: ok = this.doHold(); break;
			case 6: ok = this.hardDrop(); break;
			case 7: if (!this.sd) { this.sd = true; this.nd = this.now + this.iv(); ok = true; } break;
			case 8: if (this.sd) { this.sd = false; this.nd = this.now + this.iv(); ok = true; } break;
			case 9: ok = this.slide(-1); break;
			case 10: ok = this.slide(1); break;
			case 11: ok = this.sonic(); break;
		}
		if (ok) { this.log.push([a, ms]); this.ms = ms; if (a <= 4 || a >= 9) this.ev.push({ k: a >= 2 && a <= 4 ? "rotate" : "move" }); }
		return ok;
	};
	/** visible board (20 rows) as a 200-character string, with the falling piece drawn in (race view) */
	P.boardStr = function () {
		var b = this.board.slice(), c = this.cur;
		if (c) this.cells(c).forEach(function (q) { if (q[1] >= 0) b[q[1] * B.W + q[0]] = B.PIECES.indexOf(c.p) + 1; });
		var s = "";
		for (var i = B.HID * B.W; i < b.length; i++) s += b[i];
		return s;
	};
	P.timeMs = function () { return this.over ? this.endMs : Math.round(this.now / 1000); };
	P.pps = function () { var t = this.timeMs(); return t > 0 ? this.pieces / (t / 1000) : 0; };

	/* ---------- a simple computer player (race opponent, demo, tests) ---------- */
	/** best spot for the falling piece: {r, x, score}; heuristic = lines, holes, height, bumpiness (skill 0-1 adds mistakes) */
	B.plan = function (g, skill, rnd) {
		var c = g.cur; if (!c) return null;
		var best = null, W = B.W, H = B.H;
		for (var r = 0; r < (c.p === "O" ? 1 : 4); r++) {
			for (var x = -2; x < W; x++) {
				if (!g.fits(c.p, r, x, c.y) && !g.fits(c.p, r, x, 2)) continue;
				var y = g.fits(c.p, r, x, c.y) ? c.y : 2;
				if (!g.fits(c.p, r, x, y)) continue;
				while (g.fits(c.p, r, x, y + 1)) y++;
				var b = g.board.slice(), s = B.SHAPES[c.p][r];
				for (var i = 0; i < 4; i++) b[(y + s[i][1]) * W + x + s[i][0]] = 9;
				var lines = 0, h = [], holes = 0, agg = 0, bump = 0;
				for (var yy = 0; yy < H; yy++) { var k = 0; for (var xx = 0; xx < W; xx++) if (b[yy * W + xx]) k++; if (k === W) lines++; }
				for (var cx = 0; cx < W; cx++) {
					var top = H, seen = false;
					for (var cy = 0; cy < H; cy++) { if (b[cy * W + cx]) { if (!seen) { top = cy; seen = true; } } else if (seen) holes++; }
					h.push(H - top); agg += H - top;
				}
				for (var q = 0; q < W - 1; q++) bump += Math.abs(h[q] - h[q + 1]);
				var sc = 0.76 * lines - 0.51 * agg - 0.36 * holes * 2 - 0.18 * bump;
				if (skill != null && skill < 1 && rnd) sc += ((rnd() % 1000) / 1000) * (1 - skill) * 6;
				if (!best || sc > best.score) best = { r: r, x: x, score: sc };
			}
		}
		return best;
	};
	/** the actions that take the falling piece to plan p (rotation first, then sideways); the last one is the hard drop */
	B.planActions = function (g, p) {
		var c = g.cur, out = [];
		if (!c || !p) return out;
		var turns = (p.r - c.r + 4) % 4;
		if (turns === 1) out.push(2); else if (turns === 2) out.push(4); else if (turns === 3) out.push(3);
		out.push("x" + p.x);
		out.push(6);
		return out;
	};

	/* ---------- move encoding ---------- */
	var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	function b64(bytes) {
		var s = "", i;
		for (i = 0; i + 2 < bytes.length; i += 3) { var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; s += ABC[n >> 18 & 63] + ABC[n >> 12 & 63] + ABC[n >> 6 & 63] + ABC[n & 63]; }
		var r = bytes.length - i;
		if (r === 1) { var a = bytes[i] << 16; s += ABC[a >> 18 & 63] + ABC[a >> 12 & 63]; }
		else if (r === 2) { var c = (bytes[i] << 16) | (bytes[i + 1] << 8); s += ABC[c >> 18 & 63] + ABC[c >> 12 & 63] + ABC[c >> 6 & 63]; }
		return s;
	}
	function unb64(s) {
		var out = [], buf = 0, bits = 0;
		for (var i = 0; i < s.length; i++) {
			var v = ABC.indexOf(s[i]); if (v < 0) return null;
			buf = (buf << 6) | v; bits += 6;
			if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
		}
		return out;
	}
	B.encMoves = function (log) {
		var bytes = [], prev = 0;
		for (var i = 0; i < log.length; i++) {
			var v = (Math.max(0, log[i][1] - prev) * 16) + log[i][0];
			prev = log[i][1];
			while (v >= 128) { bytes.push((v % 128) | 128); v = Math.floor(v / 128); }
			bytes.push(v);
		}
		return b64(bytes);
	};
	B.decMoves = function (s) {
		if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
		var bytes = unb64(s); if (!bytes) return null;
		var out = [], t = 0, v = 0, mul = 1;
		for (var i = 0; i < bytes.length; i++) {
			v += (bytes[i] & 127) * mul;
			if (bytes[i] & 128) { mul *= 128; if (mul > 1e12) return null; continue; }
			var a = v % 16; if (a > 11) return null;
			t += Math.floor(v / 16); out.push([a, t]); v = 0; mul = 1;
		}
		return mul === 1 ? out : null;
	};

	/* ---------- records, replay, verification ---------- */
	B.replay = function (seed, mode, lv, log, endMs) {
		var g = new Game({ seed: seed, mode: mode, lv: lv });
		for (var i = 0; i < log.length && !g.over; i++) g.act(log[i][0], log[i][1]);
		if (endMs != null && !g.over) g.tick(endMs);
		return g;
	};
	/** the Hive record of a finished game (null for Zen / race / unfinished) */
	B.record = function (g, daily) {
		if (!g.over || (g.mode !== "s" && g.mode !== "u" && g.mode !== "m")) return null;
		var r = { v: 1, md: g.mode, s: g.seed, lv: g.lv0, t: g.endMs, l: g.lines, sc: g.score, pc: g.pieces };
		var mv = B.encMoves(g.log);
		if (mv.length <= B.MV_MAX) r.mv = mv;
		if (daily) r.d = daily;
		return r;
	};
	B.json = function (rec) { return JSON.stringify(rec); };
	/** leaderboard key of a record, or null when it is not ranked */
	B.boardKey = function (r) {
		if (r.d) return "d:" + r.d;
		if (r.md === "s") return "s";
		if (r.md === "u") return "u";
		if (r.md === "m" && r.lv === 1) return "m";
		return null;
	};
	/** {ok, t, l, sc, pc, board, rank} rank = number the leaderboard sorts on (lower = better) | {ok:false, why} */
	B.verify = function (r) {
		function no(w) { return { ok: false, why: w }; }
		if (!r || typeof r !== "object" || r.v !== 1) return no("Not a game record.");
		if (["s", "u", "m"].indexOf(r.md) < 0) return no("Unknown mode.");
		if (typeof r.s !== "string" || !/^[A-Za-z0-9_.:-]{1,40}$/.test(r.s)) return no("Bad seed.");
		var lv = r.lv | 0; if (lv < 1 || lv > 20 || lv !== r.lv) return no("Bad start level.");
		if (r.d !== undefined) {
			if (r.md !== "s" || typeof r.d !== "string" || !/^\d{4}-\d\d-\d\d$/.test(r.d)) return no("Bad daily record.");
			if (r.s !== B.dailySeed(r.d)) return no("That is not the daily seed of " + r.d + ".");
		}
		if (typeof r.mv !== "string") return no("This game has no moves saved, so it can't be checked.");
		var log = B.decMoves(r.mv); if (!log) return no("The moves could not be read.");
		var t = r.t; if (typeof t !== "number" || t !== Math.floor(t) || t < 1000 || t > 4 * 3600000) return no("Bad time.");
		if (log.length && log[log.length - 1][1] > t) return no("Moves after the end of the game.");
		var g = B.replay(r.s, r.md, lv, log, r.md === "u" ? B.ULTRA_MS : t + 1);
		if (!g.over) return no("The game did not end the way the record says.");
		if (g.log.length !== log.length) return no("Some moves did nothing: not a real game.");
		if (g.endMs !== t) return no("The time does not match the moves.");
		if (r.md === "s" && g.over !== "done") return no("The 40 lines were not cleared.");
		if (r.md === "u" && g.over === "done" && t !== B.ULTRA_MS) return no("Bad Ultra time.");
		if (g.lines !== r.l || g.score !== r.sc || g.pieces !== r.pc) return no("Lines, score or pieces do not match the moves.");
		if (g.pieces / (t / 1000) > B.MAX_PPS) return no("Too fast to be played by hand.");
		var key = B.boardKey(r);
		return { ok: true, t: t, l: g.lines, sc: g.score, pc: g.pieces, board: key, rank: r.md === "s" ? t : -g.score };
	};
	/* ---------- account history -> our records ---------- */
	B.parseHistory = function (entries, acct) {
		var out = [];
		(entries || []).forEach(function (e) {
			var x = e && e[1] || {}, op = x.op;
			if (!op || op[0] !== "custom_json" || !op[1] || op[1].id !== B.ID) return;
			var auths = op[1].required_posting_auths || [];
			if (auths.length !== 1 || auths[0] !== acct || (op[1].required_auths || []).length) return;
			var j;
			try { j = typeof op[1].json === "string" ? JSON.parse(op[1].json) : op[1].json; } catch (er) { return; }
			if (!j || typeof j !== "object") return;
			out.push({ trx: x.trx_id || "", block: x.block || 0, ts: Date.parse(String(x.timestamp || "") + (/Z$/.test(x.timestamp || "") ? "" : "Z")) || 0, acct: acct, rec: j });
		});
		return out;
	};
	B.fmtTime = function (ms) {
		if (ms == null || !isFinite(ms)) return "—";
		var m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
		return m ? m + ":" + (s < 10 ? "0" : "") + s.toFixed(2) : s.toFixed(2) + " s";
	};
	B.fmtNum = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };

	if (typeof module !== "undefined" && module.exports) module.exports = B;
	root.MESBlocks = B;
})(typeof self !== "undefined" ? self : this);
