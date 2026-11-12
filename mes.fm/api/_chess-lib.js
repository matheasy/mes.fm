/* MES Chess: the rules of every variant + the computer opponent + PGN / FEN / SAN + the Hive game protocol.
   Pure code: runs in the page, in a Web Worker (the computer's thinking), in node (tool_apps_src/chess-tests.js)
   and on the server (a byte-identical copy at mes.fm/api/_chess-lib.js checks online moves: cp after editing).

   A game is described by a config {v, n, fen} that travels as a short code (cfgCode / parseCode):
     "S" standard, "K" King of the Hill, "T" Three-check, "F<n>" Chess960 start position n (0-959, 518 = the normal start),
     "X<fen with _ for spaces>" a position typed in or loaded from a PGN (computer / pass-and-play only, never online).
   Squares are 0..63 with a1 = 0, h1 = 7, a8 = 56. Moves travel as UCI strings: "e2e4", "e7e8q"; castling is written as the king
   moving onto its own rook ("e1h1"), which also works for Chess960 (the plain king move "e1g1" is accepted too when it isn't ambiguous).
   API moves are objects {f, t, pr} (pr = "q" | "r" | "b" | "n" | ""), plus c: true and k (the king's real target) for castling. */
(function (root) {
	"use strict";
	var C = {};

	/* ---------- pieces + squares (inside: 0x88 board, sq = rank * 16 + file) ---------- */
	var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6, BL = 8;
	var CH = ".PNBRQK..pnbrqk";
	var FILES = "abcdefgh";
	function to64(s) { return (s >> 4) * 8 + (s & 7); }
	function to88(i) { return (i >> 3) * 16 + (i & 7); }
	function alg88(s) { return FILES[s & 7] + ((s >> 4) + 1); }
	C.sqName = function (i) { return FILES[i & 7] + ((i >> 3) + 1); };
	C.sqIndex = function (n) { var m = /^([a-h])([1-8])$/.exec(n || ""); return m ? (+m[2] - 1) * 8 + FILES.indexOf(m[1]) : -1; };
	var N_OFF = [33, 31, 18, 14, -33, -31, -18, -14], K_OFF = [1, -1, 16, -16, 15, 17, -15, -17], B_OFF = [15, 17, -15, -17], R_OFF = [1, -1, 16, -16];
	var VAL = [0, 100, 320, 330, 500, 900, 0];

	/* ---------- variants ---------- */
	C.PRESETS = [
		{ id: "standard", code: "S", name: "Standard chess", group: "Chess", desc: "The normal game: checkmate the other king. Draws by stalemate, threefold repetition, the 50-move rule and too little material." },
		{ id: "chess960", code: "F", name: "Chess960 (Fischer Random)", group: "Variants", desc: "The pieces on the back rank are shuffled (bishops on opposite colours, the king between the rooks): 960 different starts, so opening books don't help. Castling still puts the king on g1 / c1." },
		{ id: "koth", code: "K", name: "King of the Hill", group: "Variants", desc: "Normal chess, but you also win by walking your king onto one of the four centre squares (d4, e4, d5, e5)." },
		{ id: "threecheck", code: "T", name: "Three-check", group: "Variants", desc: "Normal chess, but giving check three times also wins. Every check counts, so keep your king covered." }
	];
	C.preset = function (id) { for (var i = 0; i < C.PRESETS.length; i++) if (C.PRESETS[i].id === id) return C.PRESETS[i]; return null; };
	C.presetByCode = function (code) {
		var v = String(code || "").charAt(0);
		for (var i = 0; i < C.PRESETS.length; i++) if (C.PRESETS[i].code === v && v !== "X") return C.PRESETS[i];
		return null;
	};
	C.START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
	C.cfgCode = function (c) { return c.v === "F" ? "F" + c.n : c.v === "X" ? "X" + c.fen.replace(/ /g, "_") : c.v; };
	/** short code (or a preset id; "chess960" alone gives position 518) -> config, or null */
	C.parseCode = function (s) {
		s = String(s || "");
		var p = C.preset(s);
		if (p) s = p.code === "F" ? "F518" : p.code;
		if (s === "S" || s === "K" || s === "T") return { v: s };
		var m = /^F(\d{1,3})$/.exec(s);
		if (m) { var n = +m[1]; return n < 960 && String(n) === m[1] ? { v: "F", n: n } : null; }
		if (/^X[A-Za-z0-9\/_-]{15,100}$/.test(s)) {
			var fen = s.slice(1).replace(/_/g, " ");
			var st = parseFen(fen);
			return st && !st.err ? { v: "X", fen: fenOf(st) } : null;
		}
		return null;
	};
	C.describe = function (c) {
		if (c.v === "S") return "Standard chess";
		if (c.v === "K") return "King of the Hill";
		if (c.v === "T") return "Three-check";
		if (c.v === "F") return c.n === 518 ? "Chess960 (the normal start)" : "Chess960 #" + c.n + " (" + pos960(c.n).join("") + ")";
		return "From a position";
	};
	C.COLORS = ["White", "Black"];
	C.playerName = function (c, p) { return C.COLORS[p] || "?"; };
	C.random960 = function (r) { return Math.floor((r || Math.random)() * 960); };
	/** the back rank of Chess960 start n (Scharnagl numbering) as letters a..h */
	function pos960(n) {
		var r = [null, null, null, null, null, null, null, null], i;
		r[(n % 4) * 2 + 1] = "B"; n = (n / 4) | 0;
		r[(n % 4) * 2] = "B"; n = (n / 4) | 0;
		var q = n % 6; n = (n / 6) | 0;
		for (i = 0; i < 8; i++) if (!r[i]) { if (q === 0) { r[i] = "Q"; break; } q--; }
		var rest = ["NNRKR", "NRNKR", "NRKNR", "NRKRN", "RNNKR", "RNKNR", "RNKRN", "RKNNR", "RKNRN", "RKRNN"][n], k = 0;
		for (i = 0; i < 8; i++) if (!r[i]) r[i] = rest[k++];
		return r;
	}
	C.pos960 = pos960;
	function startFen(c) {
		if (c.v === "X") return c.fen;
		if (c.v === "F") {
			var r = pos960(c.n).join("");
			if (r === "RNBQKBNR") return C.START;
			var files = [];
			for (var i = 0; i < 8; i++) if (r[i] === "R") files.push(FILES[i]);
			var cs = files[1].toUpperCase() + files[0].toUpperCase() + files[1] + files[0];
			return r.toLowerCase() + "/pppppppp/8/8/8/8/PPPPPPPP/" + r + " w " + cs + " - 0 1";
		}
		return C.START;
	}
	C.startFen = startFen;

	/* ---------- zobrist keys (two 32-bit halves) ---------- */
	var ZL = new Int32Array(15 * 128), ZH = new Int32Array(15 * 128), ZCL = new Int32Array(4 * 128), ZCH = new Int32Array(4 * 128), ZEL = new Int32Array(8), ZEH = new Int32Array(8), ZTL, ZTH;
	(function () {
		var x = 0x2545f491;
		function rnd() { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; }
		for (var i = 0; i < ZL.length; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
		for (i = 0; i < ZCL.length; i++) { ZCL[i] = rnd(); ZCH[i] = rnd(); }
		for (i = 0; i < 8; i++) { ZEL[i] = rnd(); ZEH[i] = rnd(); }
		ZTL = rnd(); ZTH = rnd();
	})();

	/* ---------- FEN ---------- */
	/** FEN -> a bare position {b, turn, cr, ep, half, full, checks} or {err} */
	function parseFen(fen) {
		var parts = String(fen || "").trim().split(/\s+/);
		if (parts.length < 2) return { err: "A FEN needs at least the board and whose turn it is." };
		var rows = parts[0].split("/");
		if (rows.length !== 8) return { err: "The board part needs 8 ranks separated by /." };
		var b = new Int8Array(128), kings = [0, 0], kp = [-1, -1];
		for (var r = 0; r < 8; r++) {
			var f = 0, row = rows[7 - r];
			for (var i = 0; i < row.length; i++) {
				var ch = row[i];
				if (/[1-8]/.test(ch)) { f += +ch; continue; }
				var pc = CH.indexOf(ch);
				if (pc <= 0 || ch === ".") return { err: "Unknown piece letter " + ch + "." };
				if (f > 7) return { err: "Rank " + (r + 1) + " has more than 8 squares." };
				var sq = r * 16 + f;
				b[sq] = pc;
				if ((pc & 7) === KING) { kings[pc >> 3]++; kp[pc >> 3] = sq; }
				if ((pc & 7) === PAWN && (r === 0 || r === 7)) return { err: "A pawn can't stand on the first or last rank." };
				f++;
			}
			if (f !== 8) return { err: "Rank " + (r + 1) + " doesn't have 8 squares." };
		}
		if (kings[0] !== 1 || kings[1] !== 1) return { err: "Each side needs exactly one king." };
		var turn = parts[1] === "b" ? 1 : parts[1] === "w" ? 0 : -1;
		if (turn < 0) return { err: "Whose turn: w or b." };
		var cr = [-1, -1, -1, -1], cs = parts[2] || "-";
		if (cs !== "-") for (i = 0; i < cs.length; i++) {
			var c = cs[i], side = c === c.toUpperCase() ? 0 : 1, base = side * 7 * 16, ksq = kp[side];
			if ((ksq >> 4) !== side * 7) continue;
			var lc = c.toLowerCase(), rs = -1, x;
			if (lc === "k") { for (x = 7; x > (ksq & 7); x--) if (b[base + x] === (ROOK | side * BL)) { rs = base + x; break; } if (rs >= 0) cr[side * 2 + 1] = rs; }
			else if (lc === "q") { for (x = 0; x < (ksq & 7); x++) if (b[base + x] === (ROOK | side * BL)) { rs = base + x; break; } if (rs >= 0) cr[side * 2] = rs; }
			else if (lc >= "a" && lc <= "h") { x = FILES.indexOf(lc); if (b[base + x] === (ROOK | side * BL)) cr[side * 2 + (x > (ksq & 7) ? 1 : 0)] = base + x; }
		}
		var ep = -1;
		if (parts[3] && parts[3] !== "-") { var e = C.sqIndex(parts[3]); if (e >= 0) ep = to88(e); }
		var st = { b: b, turn: turn, cr: cr, ep: ep, half: Math.max(0, parseInt(parts[4], 10) || 0), full: Math.max(1, parseInt(parts[5], 10) || 1), kp: kp, checks: [0, 0] };
		// three-check counters as the lichess "+N+M" field, if any
		var m3 = /\+(\d)\+(\d)/.exec(parts.slice(6).join(" ") || "");
		if (m3) st.checks = [+m3[1], +m3[2]];
		if (ep >= 0 && !epPossible(st, ep)) st.ep = -1;
		if (attacked(st.b, kp[1 - turn], turn)) return { err: "The side that is not to move is in check." };
		return st;
	}
	function epPossible(st, ep) {
		var us = st.turn, pawn = PAWN | (us ? BL : 0), dir = us ? 16 : -16;
		var a = ep + dir - 1, c = ep + dir + 1;
		return (!(a & 0x88) && st.b[a] === pawn) || (!(c & 0x88) && st.b[c] === pawn);
	}
	function fenOf(st, opts) {
		var out = [], r, f;
		for (r = 7; r >= 0; r--) {
			var row = "", e = 0;
			for (f = 0; f < 8; f++) { var p = st.b[r * 16 + f]; if (!p) e++; else { if (e) { row += e; e = 0; } row += CH[p]; } }
			if (e) row += e;
			out.push(row);
		}
		var cs = "", std = true;
		[[0, 1], [0, 0], [1, 1], [1, 0]].forEach(function (q) { var rs = st.cr[q[0] * 2 + q[1]]; if (rs >= 0 && ((rs & 7) !== (q[1] ? 7 : 0) || (st.kp[q[0]] & 7) !== 4)) std = false; });
		[[0, 1, "K"], [0, 0, "Q"], [1, 1, "k"], [1, 0, "q"]].forEach(function (q) {
			var rs = st.cr[q[0] * 2 + q[1]];
			if (rs < 0) return;
			cs += std ? q[2] : (q[0] ? FILES[rs & 7] : FILES[rs & 7].toUpperCase());
		});
		var s = out.join("/") + " " + (st.turn ? "b" : "w") + " " + (cs || "-") + " " + (st.ep >= 0 ? alg88(st.ep) : "-") + " " + st.half + " " + st.full;
		if (opts && opts.checks) s += " +" + st.checks[0] + "+" + st.checks[1];
		return s;
	}
	C.validateFen = function (fen) { var st = parseFen(fen); return st.err || ""; };

	/* ---------- the core: attack test, move generation, make / unmake ---------- */
	function attacked(b, sq, by) {   // is square sq attacked by side `by`?
		var i, t, p, add = by ? BL : 0;
		var pd = by ? 16 : -16;           // white pawns attack from below (sq - 15, sq - 17)
		t = sq + pd - 1; if (!(t & 0x88) && b[t] === (PAWN | add)) return true;
		t = sq + pd + 1; if (!(t & 0x88) && b[t] === (PAWN | add)) return true;
		for (i = 0; i < 8; i++) { t = sq + N_OFF[i]; if (!(t & 0x88) && b[t] === (KNIGHT | add)) return true; }
		for (i = 0; i < 8; i++) { t = sq + K_OFF[i]; if (!(t & 0x88) && b[t] === (KING | add)) return true; }
		for (i = 0; i < 4; i++) {
			var d = B_OFF[i]; t = sq + d;
			while (!(t & 0x88)) { p = b[t]; if (p) { if (p === (BISHOP | add) || p === (QUEEN | add)) return true; break; } t += d; }
			d = R_OFF[i]; t = sq + d;
			while (!(t & 0x88)) { p = b[t]; if (p) { if (p === (ROOK | add) || p === (QUEEN | add)) return true; break; } t += d; }
		}
		return false;
	}
	// move number: from | to << 7 | promo << 14 | flags << 17 (1 castle, 2 en passant, 4 double push)
	function MV(f, t, pr, fl) { return f | (t << 7) | (pr << 14) | (fl << 17); }
	function mF(m) { return m & 127; }
	function mT(m) { return (m >> 7) & 127; }
	function mP(m) { return (m >> 14) & 7; }
	function mFl(m) { return (m >> 17) & 7; }
	/** pseudo-legal moves (own king may be left in check) into list; caps = captures + promotions only */
	function gen(st, list, caps) {
		var b = st.b, us = st.turn, add = us ? BL : 0, n = 0, sq, p, t, i, d, q;
		for (sq = 0; sq < 120; sq++) {
			if (sq & 0x88) { sq += 7; continue; }
			p = b[sq];
			if (!p || (p & BL) !== add) continue;
			var type = p & 7;
			if (type === PAWN) {
				var dir = us ? -16 : 16, r = sq >> 4, last = us ? 0 : 7, start = us ? 6 : 1;
				t = sq + dir;
				if (!b[t]) {
					if ((t >> 4) === last) { for (q = QUEEN; q >= KNIGHT; q--) list[n++] = MV(sq, t, q, 0); }
					else if (!caps) {
						list[n++] = MV(sq, t, 0, 0);
						if (r === start && !b[t + dir]) list[n++] = MV(sq, t + dir, 0, 4);
					}
				}
				for (i = -1; i <= 1; i += 2) {
					t = sq + dir + i;
					if (t & 0x88) continue;
					if (b[t] && (b[t] & BL) !== add) {
						if ((t >> 4) === last) { for (q = QUEEN; q >= KNIGHT; q--) list[n++] = MV(sq, t, q, 0); }
						else list[n++] = MV(sq, t, 0, 0);
					} else if (t === st.ep) list[n++] = MV(sq, t, 0, 2);
				}
			} else if (type === KNIGHT || type === KING) {
				var offs = type === KNIGHT ? N_OFF : K_OFF;
				for (i = 0; i < 8; i++) {
					t = sq + offs[i];
					if (t & 0x88) continue;
					if (!b[t]) { if (!caps) list[n++] = MV(sq, t, 0, 0); }
					else if ((b[t] & BL) !== add) list[n++] = MV(sq, t, 0, 0);
				}
			} else {
				var dirs = type === BISHOP ? B_OFF : type === ROOK ? R_OFF : K_OFF;
				for (i = 0; i < dirs.length; i++) {
					d = dirs[i]; t = sq + d;
					while (!(t & 0x88)) {
						if (!b[t]) { if (!caps) list[n++] = MV(sq, t, 0, 0); }
						else { if ((b[t] & BL) !== add) list[n++] = MV(sq, t, 0, 0); break; }
						t += d;
					}
				}
			}
		}
		if (!caps) n = genCastle(st, list, n);
		return n;
	}
	function genCastle(st, list, n) {
		var us = st.turn, ks = st.kp[us], b = st.b, base = us * 7 * 16;
		if ((ks >> 4) !== us * 7) return n;
		for (var side = 0; side < 2; side++) {
			var rs = st.cr[us * 2 + side];
			if (rs < 0 || b[rs] !== (ROOK | (us ? BL : 0))) continue;
			var kd = base + (side ? 6 : 2), rd = base + (side ? 5 : 3);
			var lo = Math.min(ks, kd, rs, rd), hi = Math.max(ks, kd, rs, rd), ok = true, x;
			for (x = lo; x <= hi; x++) if (x !== ks && x !== rs && b[x]) { ok = false; break; }
			if (!ok) continue;
			var a = Math.min(ks, kd), z = Math.max(ks, kd);
			for (x = a; x <= z; x++) if (attacked(b, x, 1 - us)) { ok = false; break; }
			if (ok) list[n++] = MV(ks, rs, 0, 1);
		}
		return n;
	}
	function inCheck(st) { return attacked(st.b, st.kp[st.turn], 1 - st.turn); }
	/** make a move number on a state; pushes an undo record onto st.u */
	function make(st, m) {
		var b = st.b, f = mF(m), t = mT(m), fl = mFl(m), us = st.turn, add = us ? BL : 0, p = b[f], cap = 0, capSq = t;
		var u = { m: m, cap: 0, capSq: t, cr0: st.cr[0], cr1: st.cr[1], cr2: st.cr[2], cr3: st.cr[3], ep: st.ep, half: st.half, zl: st.zl, zh: st.zh, k0: st.kp[0], k1: st.kp[1], ch: st.checks[0] * 16 + st.checks[1] };
		var zl = st.zl, zh = st.zh, i;
		if (st.ep >= 0) { zl ^= ZEL[st.ep & 7]; zh ^= ZEH[st.ep & 7]; }
		for (i = 0; i < 4; i++) if (st.cr[i] >= 0) { zl ^= ZCL[i * 128 + st.cr[i]]; zh ^= ZCH[i * 128 + st.cr[i]]; }
		st.ep = -1;
		if (fl & 1) {   // castling: king f -> g/c, rook t -> f/d
			var side = t > f ? 1 : 0, base = us * 112, kd = base + (side ? 6 : 2), rd = base + (side ? 5 : 3), rook = ROOK | add;
			b[f] = 0; b[t] = 0; b[kd] = p; b[rd] = rook;
			zl ^= ZL[p * 128 + f] ^ ZL[p * 128 + kd] ^ ZL[rook * 128 + t] ^ ZL[rook * 128 + rd];
			zh ^= ZH[p * 128 + f] ^ ZH[p * 128 + kd] ^ ZH[rook * 128 + t] ^ ZH[rook * 128 + rd];
			st.kp[us] = kd;
			st.cr[us * 2] = -1; st.cr[us * 2 + 1] = -1;
			st.half++;
		} else {
			if (fl & 2) capSq = t + (us ? 16 : -16);
			cap = b[capSq];
			if (cap) { b[capSq] = 0; zl ^= ZL[cap * 128 + capSq]; zh ^= ZH[cap * 128 + capSq]; }
			b[f] = 0;
			var np = mP(m) ? (mP(m) | add) : p;
			b[t] = np;
			zl ^= ZL[p * 128 + f] ^ ZL[np * 128 + t]; zh ^= ZH[p * 128 + f] ^ ZH[np * 128 + t];
			if ((p & 7) === KING) { st.kp[us] = t; st.cr[us * 2] = -1; st.cr[us * 2 + 1] = -1; }
			for (i = 0; i < 4; i++) if (st.cr[i] === f || st.cr[i] === t) st.cr[i] = -1;
			if (fl & 4) { var e = (f + t) >> 1; st.turn = 1 - us; if (epPossible(st, e)) st.ep = e; st.turn = us; }
			st.half = (p & 7) === PAWN || cap ? 0 : st.half + 1;
		}
		u.cap = cap; u.capSq = capSq;
		if (st.ep >= 0) { zl ^= ZEL[st.ep & 7]; zh ^= ZEH[st.ep & 7]; }
		for (i = 0; i < 4; i++) if (st.cr[i] >= 0) { zl ^= ZCL[i * 128 + st.cr[i]]; zh ^= ZCH[i * 128 + st.cr[i]]; }
		zl ^= ZTL; zh ^= ZTH;
		st.zl = zl; st.zh = zh;
		if (us) st.full++;
		st.turn = 1 - us;
		st.u.push(u);
		st.kl.push(zl); st.kh.push(zh);
		return u;
	}
	function unmake(st) {
		var u = st.u.pop(), m = u.m, b = st.b, f = mF(m), t = mT(m), fl = mFl(m);
		st.kl.pop(); st.kh.pop();
		st.turn = 1 - st.turn;
		var us = st.turn, add = us ? BL : 0;
		if (us) st.full--;
		if (fl & 1) {
			var side = t > f ? 1 : 0, base = us * 112, kd = base + (side ? 6 : 2), rd = base + (side ? 5 : 3);
			b[kd] = 0; b[rd] = 0; b[f] = KING | add; b[t] = ROOK | add;
		} else {
			var p = b[t];
			if (mP(m)) p = PAWN | add;
			b[t] = 0; b[f] = p;
			if (u.cap) b[u.capSq] = u.cap;
		}
		st.cr[0] = u.cr0; st.cr[1] = u.cr1; st.cr[2] = u.cr2; st.cr[3] = u.cr3;
		st.ep = u.ep; st.half = u.half; st.zl = u.zl; st.zh = u.zh; st.kp[0] = u.k0; st.kp[1] = u.k1;
		st.checks[0] = u.ch >> 4; st.checks[1] = u.ch & 15;
	}
	function makeNull(st) {
		var u = { m: -1, ep: st.ep, zl: st.zl, zh: st.zh, half: st.half };
		if (st.ep >= 0) { st.zl ^= ZEL[st.ep & 7]; st.zh ^= ZEH[st.ep & 7]; }
		st.ep = -1; st.zl ^= ZTL; st.zh ^= ZTH; st.turn = 1 - st.turn; st.half++;
		st.u.push(u); st.kl.push(st.zl); st.kh.push(st.zh);
	}
	function unmakeNull(st) { var u = st.u.pop(); st.kl.pop(); st.kh.pop(); st.turn = 1 - st.turn; st.ep = u.ep; st.zl = u.zl; st.zh = u.zh; st.half = u.half; }
	function hashOf(st) {
		var zl = 0, zh = 0, sq, i;
		for (sq = 0; sq < 120; sq++) { if (sq & 0x88) { sq += 7; continue; } var p = st.b[sq]; if (p) { zl ^= ZL[p * 128 + sq]; zh ^= ZH[p * 128 + sq]; } }
		for (i = 0; i < 4; i++) if (st.cr[i] >= 0) { zl ^= ZCL[i * 128 + st.cr[i]]; zh ^= ZCH[i * 128 + st.cr[i]]; }
		if (st.ep >= 0) { zl ^= ZEL[st.ep & 7]; zh ^= ZEH[st.ep & 7]; }
		if (st.turn) { zl ^= ZTL; zh ^= ZTH; }
		st.zl = zl; st.zh = zh;
	}
	/** legal move numbers */
	var tmp = new Int32Array(256);
	function legalNums(st) {
		var n = gen(st, tmp, false), out = [], us = st.turn;
		for (var i = 0; i < n; i++) {
			var m = tmp[i];
			make(st, m);
			if (!attacked(st.b, st.kp[us], 1 - us)) out.push(m);
			unmake(st);
		}
		return out;
	}
	/** after a move was made: add a check for three-check */
	function countCheck(st) { if (inCheck(st)) st.checks[1 - st.turn]++; }

	/* ---------- the game state ---------- */
	function newState(cfg, pos) {
		var st = { cfg: cfg, b: pos.b, turn: pos.turn, cr: pos.cr, ep: pos.ep, half: pos.half, full: pos.full, kp: pos.kp, checks: pos.checks || [0, 0],
			u: [], kl: [], kh: [], hist: [], sans: [], win: null, last: null, zl: 0, zh: 0, fen0: "" };
		hashOf(st);
		st.kl.push(st.zl); st.kh.push(st.zh);
		st.fen0 = fenOf(st);
		st.win = status(st);
		return st;
	}
	C.create = function (cfg) {
		var pos = parseFen(startFen(cfg));
		if (pos.err) return null;
		return newState(cfg, pos);
	};
	function toObj(st, m) {
		var o = { f: to64(mF(m)), t: to64(mT(m)), pr: mP(m) ? "nbrq"[mP(m) - 2] : "", n: m };
		if (mFl(m) & 1) { o.c = true; var side = mT(m) > mF(m) ? 1 : 0; o.k = to64(st.turn * 112 + (side ? 6 : 2)); }
		return o;
	}
	C.legal = function (st) { if (st.win) return []; return legalNums(st).map(function (m) { return toObj(st, m); }); };
	C.mstr = function (m) { return m ? C.sqName(m.f) + C.sqName(m.t) + (m.pr || "") : ""; };
	C.mparse = function (s) {
		var x = /^([a-h][1-8])([a-h][1-8])([qrbn]?)$/.exec(String(s || ""));
		if (!x) return null;
		return { f: C.sqIndex(x[1]), t: C.sqIndex(x[2]), pr: x[3] };
	};
	/** the legal move a move object / string stands for, or null */
	function find(st, m) {
		if (typeof m === "string") m = C.mparse(m);
		if (!m || st.win) return null;
		var L = C.legal(st), i, alias = null;
		for (i = 0; i < L.length; i++) {
			var o = L[i];
			if (o.f !== m.f) continue;
			if (o.t === m.t && (o.pr || "") === (m.pr || "")) return o;
			if (o.c && o.k === m.t && !m.pr) alias = o;
		}
		if (alias) { for (i = 0; i < L.length; i++) if (L[i].f === m.f && L[i].t === m.t) return L[i]; return alias; }
		return null;
	}
	C.find = find;
	C.isLegal = function (st, m) { return !!find(st, m); };
	/** does moving piece f to t need a promotion choice? */
	C.needsPromo = function (st, f, t) {
		return C.legal(st).some(function (o) { return o.f === f && o.t === t && o.pr; });
	};
	C.apply = function (st, m) {
		var o = find(st, m);
		if (!o) return false;
		var san = sanOf(st, o.n);
		var from = mF(o.n), cap = !!st.b[mT(o.n)] && !(mFl(o.n) & 1);
		make(st, o.n);
		countCheck(st);
		st.hist.push(C.mstr(o));
		st.sans.push(san);
		st.last = { f: o.f, t: o.c ? o.k : o.t, c: !!o.c, rf: o.c ? o.t : -1, rt: o.c ? to64((from & 0x70) + (o.t > o.f ? 5 : 3)) : -1, cap: cap || (mFl(o.n) & 2) > 0 };
		st.win = status(st);
		return true;
	};
	C.replay = function (cfg, moves) {
		var st = C.create(cfg);
		if (!st) return null;
		for (var i = 0; i < moves.length; i++) if (!C.apply(st, moves[i])) return null;
		return st;
	};
	C.clone = function (st) { return C.replay(st.cfg, st.hist); };
	C.inCheck = function (st) { return inCheck(st); };
	C.turnOf = function (st) { return st.turn; };
	C.fen = function (st) { return fenOf(st, { checks: st.cfg.v === "T" }); };
	/** board as 64 letters ("" for empty), a1 first */
	C.board64 = function (st) { var a = []; for (var i = 0; i < 64; i++) { var p = st.b[to88(i)]; a.push(p ? CH[p] : ""); } return a; };
	C.kingSq = function (st, side) { return to64(st.kp[side]); };
	var HILL = [0x33, 0x34, 0x43, 0x44];
	function insufficient(st) {
		var minors = [0, 0], bishops = [], sq;
		for (sq = 0; sq < 120; sq++) {
			if (sq & 0x88) { sq += 7; continue; }
			var p = st.b[sq], t = p & 7;
			if (!p || t === KING) continue;
			if (t === PAWN || t === ROOK || t === QUEEN) return false;
			minors[p >> 3]++;
			if (t === BISHOP) bishops.push(((sq >> 4) + (sq & 7)) & 1); else bishops.push(-1);
		}
		var n = minors[0] + minors[1];
		if (n <= 1) return true;
		if (bishops.every(function (x) { return x === bishops[0] && x >= 0; })) return true;   // only bishops, all on one colour
		return false;
	}
	function repCount(st) {
		var n = st.kl.length - 1, c = 1, zl = st.zl, zh = st.zh;
		for (var i = n - 2; i >= 0 && i >= n - st.half; i -= 2) if (st.kl[i] === zl && st.kh[i] === zh) c++;
		return c;
	}
	/** is the game over? -> {p (-1 draw), why, line, lines} or null */
	function status(st) {
		var v = st.cfg.v, mover = 1 - st.turn;
		if (st.hist.length || st.u.length) {
			if (v === "K" && HILL.indexOf(st.kp[mover]) >= 0) return { p: mover, why: "hill", line: null, lines: [] };
			if (v === "T" && st.checks[mover] >= 3) return { p: mover, why: "checks", line: null, lines: [] };
		}
		if (v === "K" && HILL.indexOf(st.kp[st.turn]) >= 0) return { p: st.turn, why: "hill", line: null, lines: [] };
		var L = legalNums(st);
		if (!L.length) return inCheck(st) ? { p: mover, why: "mate", line: null, lines: [] } : { p: -1, why: "stalemate", line: null, lines: [] };
		if (st.half >= 100) return { p: -1, why: "fifty", line: null, lines: [] };
		if (repCount(st) >= 3) return { p: -1, why: "repeat", line: null, lines: [] };
		if ((v === "S" || v === "F" || v === "X") && insufficient(st)) return { p: -1, why: "material", line: null, lines: [] };
		return null;
	}
	C.status = status;
	C.material = function (st) {   // captured pieces + material balance, for the board edges
		var have = [{}, {}], sq, start = { P: 8, N: 2, B: 2, R: 2, Q: 1 }, pts = [0, 0];
		for (sq = 0; sq < 120; sq++) { if (sq & 0x88) { sq += 7; continue; } var p = st.b[sq]; if (!p || (p & 7) === KING) continue; var L = CH[p].toUpperCase(); have[p >> 3][L] = (have[p >> 3][L] || 0) + 1; pts[p >> 3] += VAL[p & 7] / 100 | 0; }
		var lost = [[], []];
		[0, 1].forEach(function (s) { "QRBNP".split("").forEach(function (L) { var k = (start[L] - (have[s][L] || 0)); for (var i = 0; i < k; i++) lost[s].push(L); }); });
		var pv = { P: 1, N: 3, B: 3, R: 5, Q: 9 }, sc = [0, 0];
		[0, 1].forEach(function (s) { Object.keys(have[s]).forEach(function (L) { sc[s] += pv[L] * have[s][L]; }); });
		return { lost: lost, diff: sc[0] - sc[1] };
	};

	/* ---------- SAN ---------- */
	function sanOf(st, m) {
		var f = mF(m), t = mT(m), fl = mFl(m), p = st.b[f], type = p & 7, s;
		if (fl & 1) s = t > f ? "O-O" : "O-O-O";
		else {
			var cap = st.b[t] || (fl & 2);
			if (type === PAWN) s = (cap ? FILES[f & 7] + "x" : "") + alg88(t) + (mP(m) ? "=" + "NBRQ"[mP(m) - 2] : "");
			else {
				s = "NBRQK"[type - 2];
				var L = legalNums(st), sameF = false, sameR = false, other = false;
				L.forEach(function (o) {
					if (o === m || mT(o) !== t || mF(o) === f || st.b[mF(o)] !== p || (mFl(o) & 1)) return;
					other = true;
					if ((mF(o) & 7) === (f & 7)) sameF = true;
					if ((mF(o) >> 4) === (f >> 4)) sameR = true;
				});
				if (other) s += !sameF ? FILES[f & 7] : !sameR ? String((f >> 4) + 1) : alg88(f);
				s += (cap ? "x" : "") + alg88(t);
			}
		}
		make(st, m);
		if (inCheck(st)) s += legalNums(st).length ? "+" : "#";
		unmake(st);
		return s;
	}
	C.san = function (st, m) { var o = find(st, m); return o ? sanOf(st, o.n) : ""; };
	/** SAN (or UCI) text -> legal move object, or null */
	C.parseSan = function (st, text) {
		var raw = String(text || "").trim().replace(/[+#!?]+$/g, "").replace(/e\.p\.?$/, "").replace(/0/g, "O");
		if (!raw) return null;
		var u = find(st, raw.toLowerCase());
		if (u) return u;
		var norm = function (x) { return x.replace(/[x=+#:\-]/g, ""); };
		var want = norm(raw), L = C.legal(st), hit = null;
		if (/^O-?O(-?O)?$/i.test(raw)) {
			var long = /^O-?O-?O$/i.test(raw);
			L.forEach(function (o) { if (o.c && (o.t > o.f) === !long) hit = o; });
			return hit;
		}
		var found = [];
		L.forEach(function (o) {
			if (o.c) return;
			var m = o.n, f = mF(m), t = mT(m), type = st.b[f] & 7, letter = type === PAWN ? "" : "NBRQK"[type - 2], to = alg88(t), pr = mP(m) ? "NBRQ"[mP(m) - 2] : "";
			var cands = [letter + to + pr, letter + FILES[f & 7] + to + pr, letter + ((f >> 4) + 1) + to + pr, letter + alg88(f) + to + pr];
			if (type === PAWN) cands.push(FILES[f & 7] + to + pr, FILES[f & 7] + to.slice(0, 1) + pr);
			if (cands.indexOf(want) >= 0 || cands.indexOf(want.replace(/^([a-h]\d?[a-h]\d)([nbrq])$/, function (a, b2, c) { return b2 + c.toUpperCase(); })) >= 0) found.push(o);
		});
		if (found.length === 1) return found[0];
		// pawn captures written without the rank ("exd") can still be unique
		return null;
	};
	/** the moves as SAN with move numbers */
	C.moveText = function (st, upto) {
		var out = [], n = upto === undefined ? st.sans.length : upto, startBlack = /\sb\s/.test(st.fen0), full = parseInt(st.fen0.split(" ")[5], 10) || 1;
		for (var i = 0; i < n; i++) {
			var ply = i + (startBlack ? 1 : 0);
			if (ply % 2 === 0) out.push((full + ply / 2) + ". " + st.sans[i]);
			else if (i === 0) out.push(full + "... " + st.sans[i]);
			else out.push(st.sans[i]);
		}
		return out.join(" ");
	};

	/* ---------- PGN ---------- */
	C.resultText = function (st) { return !st.win ? "*" : st.win.p < 0 ? "1/2-1/2" : st.win.p === 0 ? "1-0" : "0-1"; };
	C.pgn = function (st, h) {
		h = h || {};
		var c = st.cfg, tags = [["Event", h.event || "MES Chess game"], ["Site", h.site || "https://mes.fm/chess"], ["Date", h.date || new Date().toISOString().slice(0, 10).replace(/-/g, ".")],
			["Round", "-"], ["White", h.white || "?"], ["Black", h.black || "?"], ["Result", C.resultText(st)]];
		if (c.v === "F") tags.push(["Variant", "Chess960"]);
		if (c.v === "K") tags.push(["Variant", "King of the Hill"]);
		if (c.v === "T") tags.push(["Variant", "Three-check"]);
		if (st.fen0 !== C.START) { tags.push(["SetUp", "1"]); tags.push(["FEN", st.fen0]); }
		if (st.win) tags.push(["Termination", { mate: "Checkmate", stalemate: "Stalemate", fifty: "50-move rule", repeat: "Threefold repetition", material: "Insufficient material", hill: "King of the Hill", checks: "Three checks", resign: "Resignation", timeout: "Abandoned", left: "Abandoned", flag: "Time forfeit", agreed: "Draw agreed" }[st.win.why] || st.win.why]);
		var body = C.moveText(st) + " " + C.resultText(st), lines = [], line = "";
		body.split(" ").forEach(function (w) { if ((line + " " + w).length > 79) { lines.push(line); line = w; } else line = line ? line + " " + w : w; });
		if (line) lines.push(line);
		return tags.map(function (t) { return "[" + t[0] + ' "' + String(t[1]).replace(/"/g, "'") + '"]'; }).join("\n") + "\n\n" + lines.join("\n") + "\n";
	};
	/** PGN text (first game) -> {cfg, moves (UCI), headers, error} */
	C.parsePgn = function (text) {
		text = String(text || "");
		var headers = {}, m, re = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g;
		while ((m = re.exec(text))) headers[m[1]] = m[2];
		var body = text.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
		var depth = 0, b2 = "";
		for (var i = 0; i < body.length; i++) { var ch = body[i]; if (ch === "(") depth++; else if (ch === ")") depth = Math.max(0, depth - 1); else if (!depth) b2 += ch; }
		var toks = b2.replace(/\$\d+/g, " ").replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(function (t) { return t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t); });
		var variant = (headers.Variant || "").toLowerCase(), cfg;
		if (headers.FEN) {
			var fen = headers.FEN;
			if (C.validateFen(fen)) return { error: "The FEN in the PGN is not valid: " + C.validateFen(fen) };
			var st0 = parseFen(fen);
			cfg = fenOf(st0) === C.START && !/hill|three/.test(variant) ? { v: "S" } : { v: "X", fen: fenOf(st0) };
		} else cfg = { v: /hill/.test(variant) ? "K" : /three/.test(variant) ? "T" : "S" };
		var st = C.create(cfg), moves = [];
		for (i = 0; i < toks.length; i++) {
			var o = C.parseSan(st, toks[i]);
			if (!o) return { cfg: cfg, moves: moves, headers: headers, error: "Move " + (Math.floor(moves.length / 2) + 1) + ' ("' + toks[i] + '") is not legal or not understood; the game was loaded up to there.' };
			C.apply(st, o); moves.push(C.mstr(o));
			if (st.win) break;
		}
		return { cfg: cfg, moves: moves, headers: headers, error: "" };
	};

	/* ===================================================================== the computer ===================================================================== */
	// piece-square tables from White's side, a8 first (rank 8 written first, as you look at the board)
	var PST_MG = {
		1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 22, 22, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -22, -22, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
		2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
		3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
		4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 3, 0, 0],
		5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
		6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]
	};
	var PST_EG = {
		1: [0, 0, 0, 0, 0, 0, 0, 0, 90, 90, 90, 90, 90, 90, 90, 90, 50, 50, 50, 50, 50, 50, 50, 50, 30, 30, 30, 30, 30, 30, 30, 30, 15, 15, 15, 15, 15, 15, 15, 15, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		6: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
	};
	// per piece and square (0x88), for white (index sq) and black (mirrored), mg and eg
	var TMG = new Int16Array(15 * 128), TEG = new Int16Array(15 * 128);
	(function () {
		for (var t = 1; t <= 6; t++) for (var i = 0; i < 64; i++) {
			var r = i >> 3, f = i & 7, idxW = (7 - r) * 8 + f, idxB = r * 8 + f;   // tables are a8 first
			var mg = PST_MG[t], eg = PST_EG[t] || PST_MG[t];
			TMG[t * 128 + to88(i)] = VAL[t] + mg[idxW]; TEG[t * 128 + to88(i)] = VAL[t] + eg[idxW] + (t === PAWN ? 0 : 0);
			TMG[(t | BL) * 128 + to88(i)] = VAL[t] + mg[idxB]; TEG[(t | BL) * 128 + to88(i)] = VAL[t] + eg[idxB];
		}
	})();
	var PHASE = [0, 0, 1, 1, 2, 4, 0];
	function evaluate(st) {   // from the point of view of the side to move
		var b = st.b, mg = 0, eg = 0, phase = 0, sq, p, bish = [0, 0], pawnsF = [new Int8Array(10), new Int8Array(10)], v = st.cfg.v;
		for (sq = 0; sq < 120; sq++) {
			if (sq & 0x88) { sq += 7; continue; }
			p = b[sq]; if (!p) continue;
			var s = p >> 3 ? -1 : 1, t = p & 7;
			mg += s * TMG[p * 128 + sq]; eg += s * TEG[p * 128 + sq];
			phase += PHASE[t];
			if (t === BISHOP) bish[p >> 3]++;
			else if (t === PAWN) pawnsF[p >> 3][(sq & 7) + 1]++;
		}
		var ex = 0;
		if (bish[0] >= 2) ex += 30; if (bish[1] >= 2) ex -= 30;
		// pawn structure: doubled, isolated, passed
		var pe = 0;
		for (sq = 0; sq < 120; sq++) {
			if (sq & 0x88) { sq += 7; continue; }
			p = b[sq]; if ((p & 7) !== PAWN) continue;
			var side = p >> 3, f = (sq & 7) + 1, r = sq >> 4, sgn = side ? -1 : 1, own = pawnsF[side], opp = pawnsF[1 - side];
			if (own[f] > 1) ex -= sgn * 10;
			if (!own[f - 1] && !own[f + 1]) ex -= sgn * 12;
			// passed: no enemy pawn ahead on this or neighbouring files
			var passed = true, dir = side ? -16 : 16;
			for (var t2 = sq + dir; !(t2 & 0x88) && passed; t2 += dir) {
				if (b[t2] === (PAWN | ((1 - side) * BL))) passed = false;
				var l = t2 - 1, rr = t2 + 1;
				if (!(l & 0x88) && b[l] === (PAWN | ((1 - side) * BL))) passed = false;
				if (!(rr & 0x88) && b[rr] === (PAWN | ((1 - side) * BL))) passed = false;
			}
			if (passed) { var adv = side ? 7 - r : r; pe += sgn * [0, 5, 10, 20, 35, 60, 100, 0][adv]; }
		}
		if (phase > 24) phase = 24;
		var score = ((mg * phase + eg * (24 - phase)) / 24) + ex + pe * (24 - phase) / 24 + pe / 3;
		if (v === "K") {   // the king wants the hill, more as pieces come off
			for (var side2 = 0; side2 < 2; side2++) {
				var k = st.kp[side2], d = 9;
				for (var h = 0; h < 4; h++) { var hd = Math.max(Math.abs((k & 7) - (HILL[h] & 7)), Math.abs((k >> 4) - (HILL[h] >> 4))); if (hd < d) d = hd; }
				score += (side2 ? -1 : 1) * (4 - Math.min(4, d)) * (25 + (24 - phase) * 3);
			}
		}
		if (v === "T") score += [0, 60, 220, 1000][Math.min(3, st.checks[0])] - [0, 60, 220, 1000][Math.min(3, st.checks[1])];
		score = score | 0;
		return (st.turn ? -score : score) + 10;   // a small bonus for the side to move
	}

	// transposition table
	var TTN = 1 << 19, TT_LO = new Int32Array(TTN), TT_HI = new Int32Array(TTN), TT_MV = new Int32Array(TTN), TT_SC = new Int32Array(TTN), TT_D = new Int8Array(TTN), TT_F = new Int8Array(TTN);
	var MATE = 30000, INF = 32000;
	var killers = new Int32Array(128 * 2), hist = new Int32Array(15 * 128);
	var S = { nodes: 0, stop: false, deadline: 0, check: 0 };
	function timeUp() { if ((++S.check & 1023) === 0 && Date.now() > S.deadline) S.stop = true; return S.stop; }
	function variantLost(st) {   // the player who just moved has won by a variant rule -> side to move lost
		var v = st.cfg.v, mover = 1 - st.turn;
		if (v === "K" && HILL.indexOf(st.kp[mover]) >= 0) return true;
		if (v === "T" && st.checks[mover] >= 3) return true;
		return false;
	}
	function scoreMoves(st, list, n, scores, ttm, ply) {
		for (var i = 0; i < n; i++) {
			var m = list[i], s = 0, cap = st.b[mT(m)];
			if (m === ttm) s = 1e7;
			else if (cap) s = 1e6 + VAL[cap & 7] * 10 - VAL[st.b[mF(m)] & 7] / 10;
			else if (mP(m)) s = 9e5 + mP(m);
			else if (killers[ply * 2] === m) s = 8e5;
			else if (killers[ply * 2 + 1] === m) s = 7e5;
			else s = hist[st.b[mF(m)] * 128 + mT(m)];
			scores[i] = s;
		}
	}
	function pickNext(list, scores, n, i) {
		var bi = i, bs = scores[i];
		for (var j = i + 1; j < n; j++) if (scores[j] > bs) { bs = scores[j]; bi = j; }
		if (bi !== i) { var t = list[i]; list[i] = list[bi]; list[bi] = t; t = scores[i]; scores[i] = scores[bi]; scores[bi] = t; }
		return list[i];
	}
	var LISTS = [], SCORES = [];
	for (var li = 0; li < 130; li++) { LISTS.push(new Int32Array(256)); SCORES.push(new Float64Array(256)); }
	function quiesce(st, alpha, beta, ply) {
		S.nodes++;
		if (timeUp()) return 0;
		if (variantLost(st)) return -MATE + ply;
		var stand = evaluate(st);
		if (stand >= beta) return stand;
		if (stand > alpha) alpha = stand;
		if (ply > 120) return stand;
		var list = LISTS[ply], scores = SCORES[ply], n = gen(st, list, true), us = st.turn;
		scoreMoves(st, list, n, scores, 0, ply);
		for (var i = 0; i < n; i++) {
			var m = pickNext(list, scores, n, i);
			if (!mP(m) && stand + VAL[st.b[mT(m)] & 7] + 200 < alpha) continue;   // delta pruning
			make(st, m);
			if (attacked(st.b, st.kp[us], 1 - us)) { unmake(st); continue; }
			if (st.cfg.v === "T") countCheck(st);
			var sc = -quiesce(st, -beta, -alpha, ply + 1);
			unmake(st);
			if (S.stop) return 0;
			if (sc >= beta) return sc;
			if (sc > alpha) alpha = sc;
		}
		return alpha;
	}
	function isRep(st) {
		var n = st.kl.length - 1;
		for (var i = n - 4; i >= 0 && i >= n - st.half; i -= 2) if (st.kl[i] === st.zl && st.kh[i] === st.zh) return true;
		return false;
	}
	function hasPieces(st, side) {
		for (var sq = 0; sq < 120; sq++) { if (sq & 0x88) { sq += 7; continue; } var p = st.b[sq]; if (p && (p >> 3) === side && (p & 7) > PAWN && (p & 7) < KING) return true; }
		return false;
	}
	function search(st, depth, alpha, beta, ply, nullOk) {
		if (ply && (isRep(st) || st.half >= 100)) return 0;
		if (variantLost(st)) return -MATE + ply;
		var chk = inCheck(st);
		if (chk) depth++;
		if (depth <= 0) return quiesce(st, alpha, beta, ply);
		S.nodes++;
		if (timeUp()) return 0;
		if (ply > 120) return evaluate(st);
		var idx = st.zl & (TTN - 1), ttm = 0, a0 = alpha;
		if (TT_LO[idx] === st.zl && TT_HI[idx] === st.zh) {
			ttm = TT_MV[idx];
			if (TT_D[idx] >= depth && ply) {
				var ts = TT_SC[idx];
				if (ts > MATE - 200) ts -= ply; else if (ts < -MATE + 200) ts += ply;
				var fl = TT_F[idx];
				if (fl === 0 || (fl === 1 && ts >= beta) || (fl === 2 && ts <= alpha)) return ts;
			}
		}
		var pv = beta - alpha > 1;
		if (nullOk && !chk && !pv && depth >= 3 && ply && hasPieces(st, st.turn) && st.cfg.v !== "T") {
			makeNull(st);
			var ns = -search(st, depth - 3, -beta, -beta + 1, ply + 1, false);
			unmakeNull(st);
			if (S.stop) return 0;
			if (ns >= beta) return beta;
		}
		var list = LISTS[ply], scores = SCORES[ply], n = gen(st, list, false), us = st.turn, best = -INF, bestM = 0, legal = 0;
		scoreMoves(st, list, n, scores, ttm, ply);
		for (var i = 0; i < n; i++) {
			var m = pickNext(list, scores, n, i), cap = st.b[mT(m)];
			make(st, m);
			if (attacked(st.b, st.kp[us], 1 - us)) { unmake(st); continue; }
			if (st.cfg.v === "T") countCheck(st);
			legal++;
			var sc;
			if (legal === 1) sc = -search(st, depth - 1, -beta, -alpha, ply + 1, true);
			else {
				var red = 0;
				if (depth >= 3 && legal > 4 && !cap && !mP(m) && !chk && m !== killers[ply * 2]) red = legal > 10 ? 2 : 1;
				sc = -search(st, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
				if (sc > alpha && (red || pv)) sc = -search(st, depth - 1, -beta, -alpha, ply + 1, true);
			}
			unmake(st);
			if (S.stop) return 0;
			if (sc > best) { best = sc; bestM = m; }
			if (sc > alpha) {
				alpha = sc;
				if (sc >= beta) {
					if (!cap) { if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; } hist[st.b[mF(m)] * 128 + mT(m)] += depth * depth; }
					break;
				}
			}
		}
		if (!legal) return chk ? -MATE + ply : 0;
		var store = best;
		if (store > MATE - 200) store += ply; else if (store < -MATE + 200) store -= ply;
		TT_LO[idx] = st.zl; TT_HI[idx] = st.zh; TT_MV[idx] = bestM; TT_SC[idx] = store; TT_D[idx] = depth; TT_F[idx] = best >= beta ? 1 : best <= a0 ? 2 : 0;
		return best;
	}
	function workState(st) {   // a private copy the search may change
		var c = { cfg: st.cfg, b: new Int8Array(st.b), turn: st.turn, cr: st.cr.slice(), ep: st.ep, half: st.half, full: st.full, kp: st.kp.slice(), checks: st.checks.slice(), u: [], kl: st.kl.slice(), kh: st.kh.slice(), zl: st.zl, zh: st.zh };
		return c;
	}
	function pvLine(st, first, max) {
		var w = workState(st), out = [], m = first;
		for (var i = 0; i < max && m; i++) {
			var L = legalNums(w);
			if (L.indexOf(m) < 0) break;
			out.push(C.mstr(toObj(w, m)));
			make(w, m);
			var idx = w.zl & (TTN - 1);
			m = TT_LO[idx] === w.zl && TT_HI[idx] === w.zh ? TT_MV[idx] : 0;
		}
		return out;
	}
	/** search every root move (full = exact score for each, for analysis / weaker levels) */
	function rootSearch(st, opts) {
		var w = workState(st), L = legalNums(w);
		S.nodes = 0; S.stop = false; S.check = 0; S.deadline = Date.now() + (opts.ms || 1000);
		killers.fill(0); for (var h = 0; h < hist.length; h++) hist[h] >>= 2;
		var vals = L.map(function (m) { return { mv: m, v: 0 }; }), done = 0, maxD = opts.maxDepth || 64, us = w.turn;
		for (var depth = 1; depth <= maxD; depth++) {
			var alpha = -INF, beta = INF, cur = [];
			for (var i = 0; i < vals.length; i++) {
				var m = vals[i].mv;
				make(w, m);
				if (w.cfg.v === "T") countCheck(w);
				var sc, ex = true;
				if (opts.full || i === 0) sc = -search(w, depth - 1, opts.full ? -INF : -beta, opts.full ? INF : -alpha, 1, true);
				else {   // the other moves only need to be shown worse than the best (their score is then just a bound)
					sc = -search(w, depth - 1, -alpha - 1, -alpha, 1, true);
					if (sc > alpha && !S.stop) sc = -search(w, depth - 1, -beta, -alpha, 1, true); else ex = false;
				}
				unmake(w);
				if (S.stop) break;
				cur.push({ mv: m, v: ex ? sc : Math.min(sc, alpha) - 1, ex: ex });
				if (sc > alpha) alpha = sc;
			}
			if (S.stop && depth > 1) break;
			if (S.stop && !cur.length) break;
			// keep the moves not searched this round behind, in the old order
			var seen = {}; cur.forEach(function (o) { seen[o.mv] = 1; });
			vals.forEach(function (o) { if (!seen[o.mv]) cur.push({ mv: o.mv, v: -INF + 1, ex: false }); });
			cur.sort(function (a, b) { return b.v - a.v; });
			vals = cur; done = depth;
			// remember the best move at the root for the PV
			var idx = w.zl & (TTN - 1); TT_LO[idx] = w.zl; TT_HI[idx] = w.zh; TT_MV[idx] = vals[0].mv; TT_D[idx] = depth; TT_SC[idx] = vals[0].v; TT_F[idx] = 0;
			if (Math.abs(vals[0].v) > MATE - 200 && !opts.full) break;
			if (S.stop) break;
		}
		return { vals: vals, depth: done, nodes: S.nodes, us: us, w: w };
	}
	C.LEVELS = {
		easy: { ms: 120, depth: 1, noise: 220, name: "Easy", elo: "beginner" },
		medium: { ms: 350, depth: 3, noise: 45, name: "Medium", elo: "club player" },
		hard: { ms: 1200, depth: 64, noise: 0, name: "Hard", elo: "strong club player" },
		expert: { ms: 3500, depth: 64, noise: 0, name: "Expert", elo: "expert" }
	};
	// a few popular openings so games against the computer don't always start the same way (standard chess only)
	var BOOK = {
		"": ["e2e4", "e2e4", "d2d4", "d2d4", "c2c4", "g1f3"],
		"e2e4": ["e7e5", "e7e5", "c7c5", "c7c5", "e7e6", "c7c6", "d7d5"], "d2d4": ["d7d5", "g8f6", "g8f6", "e7e6"], "c2c4": ["e7e5", "g8f6", "c7c5"], "g1f3": ["d7d5", "g8f6", "c7c5"],
		"e2e4.e7e5": ["g1f3", "g1f3", "f1c4", "b1c3"], "e2e4.c7c5": ["g1f3", "b1c3", "c2c3"], "e2e4.e7e6": ["d2d4"], "e2e4.c7c6": ["d2d4"], "e2e4.d7d5": ["e4d5"],
		"d2d4.d7d5": ["c2c4", "g1f3", "c1f4"], "d2d4.g8f6": ["c2c4", "g1f3"], "e2e4.e7e5.g1f3": ["b8c6", "b8c6", "g8f6"], "e2e4.c7c5.g1f3": ["d7d6", "b8c6", "e7e6"],
		"e2e4.e7e5.g1f3.b8c6": ["f1b5", "f1c4", "d2d4"], "d2d4.d7d5.c2c4": ["e7e6", "c7c6", "d5c4"], "d2d4.g8f6.c2c4": ["e7e6", "g7g6", "c7c5"]
	};
	/** the computer's move: level easy | medium | hard | expert; opts {ms, r (random 0..1 function)} -> {m, how, depth, v} */
	C.think = function (st, level, opts) {
		opts = opts || {};
		var r = opts.r || Math.random, lv = C.LEVELS[level] || C.LEVELS.hard;
		var L = C.legal(st);
		if (!L.length) return null;
		if (L.length === 1) return { m: L[0], how: "only", depth: 0, v: 0 };
		if ((st.cfg.v === "S") && st.fen0 === C.START) {
			var bk = BOOK[st.hist.join(".")];
			if (bk) { var pick = find(st, bk[(r() * bk.length) | 0]); if (pick) return { m: pick, how: "book", depth: 0, v: 0 }; }
		}
		var full = lv.noise > 0;
		var res = rootSearch(st, { ms: opts.ms || lv.ms, maxDepth: lv.depth, full: full });
		var vals = res.vals.map(function (o) { return { m: toObj(st, o.mv), v: o.v }; });
		if (full) {
			// the weaker levels: add noise to every score, but never miss a mate in one or a free win of a piece by much
			var noisy = vals.map(function (o) { return { m: o.m, v: o.v + (Math.abs(o.v) > MATE - 200 ? 0 : (r() * 2 - 1) * lv.noise) }; });
			noisy.sort(function (a, b) { return b.v - a.v; });
			return { m: noisy[0].m, how: "search", depth: res.depth, v: vals[0].v };
		}
		var pickT = vals[0];
		return { m: pickT.m, how: "search", depth: res.depth, v: pickT.v, nodes: res.nodes, pv: pvLine(st, pickT.m.n, 10) };
	};
	/** the engine's opinion of the position: {v (centipawns for the side to move), mate (moves, + = side to move mates), best, pv (UCI), depth, top: [{m, v}]} */
	C.analyze = function (st, ms) {
		if (st.win) return { v: 0, best: null, pv: [], depth: 0, top: [] };
		var res = rootSearch(st, { ms: ms || 1500 });
		var b = res.vals[0], v = b.v, mate = 0;
		if (Math.abs(v) > MATE - 200) { var ply = MATE - Math.abs(v); mate = (v > 0 ? 1 : -1) * Math.ceil(ply / 2); }
		return { v: v, mate: mate, best: C.mstr(toObj(st, b.mv)), pv: pvLine(st, b.mv, 12), depth: res.depth, nodes: res.nodes,
			top: res.vals.slice(0, 5).filter(function (o) { return o.ex; }).map(function (o) { return { m: C.mstr(toObj(st, o.mv)), v: o.v }; }) };
	};
	C.MATE = MATE;
	/** a short label for a score from White's side: "+1.3", "#3", "-#2" */
	C.evalLabel = function (vWhite, mateWhite) {
		if (mateWhite) return (mateWhite > 0 ? "#" : "-#") + Math.abs(mateWhite);
		var x = vWhite / 100;
		return (x > 0 ? "+" : "") + x.toFixed(1);
	};
	C.perft = function (st, depth) {
		var w = workState(st);
		function p(d) { if (!d) return 1; var L = legalNums(w), n = 0; if (d === 1) return L.length; for (var i = 0; i < L.length; i++) { make(w, L[i]); n += p(d - 1); unmake(w); } return n; }
		return p(depth);
	};

	/* ---------- Hive games ----------
	   Every action is a custom_json operation with id "mes_chess", signed with the player's posting key. Nothing else decides the game:
	   both browsers read both players' account histories and run build() on the same operations, so they always agree.
	     {"a":"open","g":"<8 chars>","v":"<game code>","f":"host|guest|random","t":<minutes a player may take per move>[,"to":"account"][,"re":"host/gid"]}
	     {"a":"join","h":"<host>","g":"<gid>"}                                   by the guest
	     {"a":"mv","h","g","n":<move number from 0>,"m":"e2e4"}
	     {"a":"dro","h","g","n":<number of moves on the board>}   offer a draw  ·  {"a":"dra","h","g"}  accept the other player's offer
	     {"a":"res","h","g"}  resign   ·   {"a":"claim","h","g"}  win when the other player has taken longer than "t" minutes on their move
	     {"a":"cancel","h","g"}  the host withdraws an open game nobody has joined
	     {"a":"rec","g","v","m":"e2e4.e7e5...","o":"easy|medium|hard|expert|local","s":<my colour, -1 = pass and play>,"w":<winner -1..1>}
	        a SELF-REPORTED result of a game against the computer or on one device; records() replays it and keeps it only when the moves
	        are legal, the game ended on the board and "w" is the real winner. Nothing proves the moves were really played.
	   "random" colours: parity of the char-code sum of the two transaction ids, the same for both sides. White = seat 0. */
	var H = C.hive = { ID: "mes_chess", CLAIM_S: 300, OPEN_S: 3600, T_OK: [5, 15, 60, 1440, 4320], GID_RE: /^[a-z0-9]{8}$/, ACCT_RE: /^[a-z][a-z0-9.-]{2,15}$/, OPP: ["easy", "medium", "hard", "expert", "local"],
		MOVES_RE: /^[a-h][1-8][a-h][1-8][qrbn]?(\.[a-h][1-8][a-h][1-8][qrbn]?)*$/ };
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
	function onlineCode(v) { var c = C.parseCode(v); return c && c.v !== "X" && !C.preset(v) ? c : null; }
	C.onlineCode = onlineCode;
	H.clean = function (j) {
		if (!j || typeof j !== "object" || !H.GID_RE.test(String(j.g))) return null;
		var a = j.a, o = { a: a, g: j.g }, c;
		if (a === "open") {
			c = onlineCode(j.v);
			if (!c) return null;
			o.v = j.v; o.f = ["host", "guest", "random"].indexOf(j.f) >= 0 ? j.f : "host";
			o.t = H.T_OK.indexOf(j.t) >= 0 ? j.t : 5;
			if (j.to !== undefined) { if (!H.ACCT_RE.test(String(j.to))) return null; o.to = j.to; }
			if (j.re !== undefined && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(String(j.re))) o.re = j.re;
			return o;
		}
		if (a === "rec") {
			c = C.parseCode(j.v);
			if (!c || C.preset(j.v) || typeof j.m !== "string" || j.m.length > 3000 || !H.MOVES_RE.test(j.m)) return null;
			if (H.OPP.indexOf(j.o) < 0 || [-1, 0, 1].indexOf(j.s) < 0 || [-1, 0, 1].indexOf(j.w) < 0) return null;
			o.v = j.v; o.m = j.m; o.o = j.o; o.s = j.s; o.w = j.w;
			return o;
		}
		if (!H.ACCT_RE.test(String(j.h))) return null;
		o.h = j.h;
		if (a === "join" || a === "res" || a === "claim" || a === "cancel" || a === "dra") return o;
		if (a === "mv" || a === "dro") {
			if (typeof j.n !== "number" || j.n < 0 || j.n > 1000 || (j.n | 0) !== j.n) return null;
			o.n = j.n;
			if (a === "mv") { if (!C.mparse(j.m)) return null; o.m = String(j.m); }
			return o;
		}
		return null;
	};
	H.json = function (o) { var c = {}; for (var k in o) if (["a", "g", "v", "f", "t", "to", "re", "h", "n", "m", "o", "s", "w"].indexOf(k) >= 0) c[k] = o[k]; return JSON.stringify(c); };
	H.newGid = function (r) { var A = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; r = r || Math.random; for (var i = 0; i < 8; i++) s += A[(r() * A.length) | 0]; return s; };
	function order(a, b) { return (a.block || Infinity) - (b.block || Infinity) || (a.acct === b.acct ? a.i - b.i : a.trx < b.trx ? -1 : a.trx > b.trx ? 1 : 0) || (a.ts - b.ts); }
	H.order = order;
	H.coin = function (trxA, trxB) { var s = String(trxA) + String(trxB), n = 0; for (var i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 2; };
	/**
	 * Work out a Hive game from operations. host, gid: the game; ops: parsed operations of the host + guest (+ others); now: ms.
	 * -> {ok, open, host, guest, players [white, black], s, status "none|wait|play|over|cancelled|expired", win, offer {seat, n}|null, lastTs, turnAcct, canClaimAt, trx}
	 */
	H.build = function (host, gid, ops, now) {
		var mine = ops.filter(function (o) { return o.g === gid && o.a !== "rec" && (o.a === "open" ? o.acct === host : o.h === host); }).sort(order);
		var R = { host: host, gid: gid, open: null, guest: null, players: [null, null], s: null, status: "none", win: null, offer: null, lastTs: 0, turnAcct: null, canClaimAt: 0, trx: { open: "", join: "", end: "", moves: [] } };
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
			var lim = (R.open.t || 5) * 60000;
			if (o.a === "mv") {
				if (o.n !== R.s.hist.length || R.s.turn !== seat) continue;
				if (!C.apply(R.s, o.m)) continue;
				R.lastTs = o.ts; R.trx.moves.push(o.trx);
				if (R.offer && R.s.hist.length > R.offer.n + 1) R.offer = null;
				if (R.s.win) { R.status = "over"; R.win = { p: R.s.win.p, why: R.s.win.why }; R.trx.end = o.trx; }
			} else if (o.a === "dro") {
				if (o.n === R.s.hist.length) R.offer = { seat: seat, n: o.n };
			} else if (o.a === "dra") {
				if (R.offer && R.offer.seat !== seat && R.s.hist.length <= R.offer.n + 1) {
					R.status = "over"; R.win = { p: -1, why: "agreed" }; R.s.win = { p: -1, line: null, lines: [], why: "agreed" }; R.trx.end = o.trx;
				}
			} else if (o.a === "res") {
				R.status = "over"; R.win = { p: 1 - seat, why: "resign" }; R.s.win = { p: 1 - seat, line: null, lines: [], why: "resign" }; R.trx.end = o.trx;
			} else if (o.a === "claim") {
				if (R.s.turn !== seat && o.ts - R.lastTs >= lim) {
					R.status = "over"; R.win = { p: seat, why: "timeout" }; R.s.win = { p: seat, line: null, lines: [], why: "timeout" }; R.trx.end = o.trx;
				}
			}
		}
		if (R.status === "wait" && now && R.open && now - R.open.ts > H.OPEN_S * 1000) R.status = "expired";
		if (R.status === "play") { R.turnAcct = R.players[R.s.turn]; R.canClaimAt = R.lastTs + (R.open.t || 5) * 60000; }
		R.ok = R.status !== "none";
		return R;
	};
	/** the games an account opened or joined, newest first: [{host, gid, role, v?, t?, to?, re?, ts, trx}] */
	H.myGames = function (acct, ops) {
		var seen = {}, out = [];
		ops.filter(function (o) { return o.acct === acct && (o.a === "open" || o.a === "join"); }).sort(order).reverse().forEach(function (o) {
			var host = o.a === "open" ? acct : o.h, k = host + "/" + o.g;
			if (seen[k]) return; seen[k] = 1;
			out.push({ host: host, gid: o.g, role: o.a === "open" ? "host" : "guest", v: o.v, t: o.t, to: o.to, re: o.re, ts: o.ts, trx: o.trx });
		});
		return out;
	};
	/** self-reported results ("rec") that check out, newest first */
	H.records = function (ops) {
		var seen = {};
		return ops.filter(function (o) { return o.a === "rec"; }).sort(order).reverse().filter(function (o) {
			var k = o.acct + "/" + o.g; if (seen[k]) return false; seen[k] = 1;
			var c = C.parseCode(o.v), st = c && C.replay(c, o.m.split("."));
			if (!st || !st.win || st.win.p !== o.w) return false;
			if (o.o === "local" ? o.s !== -1 : o.s < 0) return false;
			return true;
		}).map(function (o) {
			return { acct: o.acct, g: o.g, v: o.v, moves: o.m.split("."), o: o.o, s: o.s, w: o.w, result: o.s < 0 ? "" : o.w < 0 ? "d" : o.w === o.s ? "w" : "l", ts: o.ts, trx: o.trx };
		});
	};

	if (typeof module !== "undefined" && module.exports) module.exports = C;
	root.MESChess = C;
})(typeof self !== "undefined" ? self : this);
