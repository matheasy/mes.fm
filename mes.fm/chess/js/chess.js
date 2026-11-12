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

/* MES Chess: the 3D view (window.CH3D). Only drawing: rules, moves and the position come from lib.js / app.js exactly as in 2D, so a game can
   switch between 2D and 3D at any moment (online and Hive games too). three.js 0.170.0 is loaded from jsDelivr (unpkg fallback) only when 3D is
   first chosen. Units: 1 = one square. The board is 8 x 8 centred at the origin with its top at Y = 0; X = file (a = -3.5 ... h = +3.5),
   Z = rank (rank 1 at Z = +3.5, rank 8 at Z = -3.5), so White sits on the +Z side.
   API: CH3D.create(container) -> Promise<view>; view.setPosition({b, flip, last, check, sel, targets, anim}), view.pick(clientX, clientY) -> square,
   view.setRoom(id), view.setSet(id), view.setCam(mode), view.orbit(dx, dy), view.zoom(f), view.resetView(), view.size(w, h), view.render(),
   view.png(), view.setCoords(on), view.dispose(). Everything (pieces, rooms, textures) is drawn by code: no image files. */
(function () {
	"use strict";
	if (typeof document === "undefined" || typeof window === "undefined") return;     // the same file also runs as the computer's Web Worker
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE);
		if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; }, function (e) { loading = null; throw e; });
		return loading;
	}
	var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	var M = 18;    // squares per metre (a 5.5 cm square): room furniture is sized in metres * M

	var ROOMS = [{ id: "club", name: "Chess club" }, { id: "tournament", name: "Tournament hall" }, { id: "park", name: "Park table" },
		{ id: "home", name: "Living room" }, { id: "space", name: "Space" }, { id: "dark", name: "Plain (fastest)" }];
	var SETS = [{ id: "wood", name: "Wood" }, { id: "marble", name: "Marble" }, { id: "glass", name: "Glass" }, { id: "tournament", name: "Tournament" }];

	function tex(w, h, draw) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
	function std(col, rough, extra) { var o = { color: col, roughness: rough === undefined ? 0.85 : rough, metalness: 0 }; if (extra) for (var k in extra) o[k] = extra[k]; return new THREE.MeshStandardMaterial(o); }
	function box(g, w, h, d, mat, x, y, z, shadow) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } g.add(m); return m; }
	function cyl(g, rt, rb, h, mat, x, y, z, seg) { var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), mat); m.position.set(x, y, z); g.add(m); return m; }
	function disposeTree(o) { o.traverse(function (x) { if (x.geometry && !x.geometry.userData.keep) x.geometry.dispose(); if (x.material && !x.material.userData.keep) { (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
	function rng(seed) { var a = seed || 12345; return function () { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; }
	function noiseTex(base, vary, lines, seed) {   // wood grain / marble veins on a small canvas
		var r = rng(seed);
		return tex(256, 256, function (c, w, h) {
			c.fillStyle = base; c.fillRect(0, 0, w, h);
			for (var i = 0; i < lines; i++) {
				c.strokeStyle = vary[(r() * vary.length) | 0]; c.globalAlpha = 0.18 + r() * 0.35; c.lineWidth = 0.6 + r() * 2.2;
				c.beginPath(); var y = r() * h, x = 0; c.moveTo(x, y);
				while (x < w) { x += 12 + r() * 20; y += (r() - 0.5) * 9; c.lineTo(x, y); }
				c.stroke();
			}
			c.globalAlpha = 1;
		});
	}

	/* ---------- piece sets ---------- */
	function setLook(id) {
		if (id === "marble") return { light: "#e9e4dc", dark: "#3f4a4f", lightV: ["#b9b3aa", "#d3cdc4"], darkV: ["#6f7b80", "#24292c"], frame: "#2c2622", frameV: ["#46392f"], coord: "#d9d3c7",
			w: { color: "#f3efe8", roughness: 0.25, metalness: 0.05 }, b: { color: "#202426", roughness: 0.25, metalness: 0.05 }, accW: "#bdb6aa", accB: "#55606a" };
		if (id === "glass") return { light: "#c9dcea", dark: "#3e5f7a", lightV: ["#e4eff8"], darkV: ["#2d4a62"], frame: "#20303e", frameV: ["#2f4558"], coord: "#cfe4f5",
			w: { color: "#eaf6ff", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.62 }, b: { color: "#1e3a5c", roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.7 }, accW: "#9fd2ff", accB: "#79b8ff" };
		if (id === "tournament") return { light: "#eeeed2", dark: "#769656", lightV: [], darkV: [], frame: "#f5f3ea", frameV: [], coord: "#4b5d3a",
			w: { color: "#f5f1e6", roughness: 0.45, metalness: 0 }, b: { color: "#161616", roughness: 0.45, metalness: 0 }, accW: "#d8d2c0", accB: "#3a3a3a" };
		return { light: "#e6c79a", dark: "#8a5a34", lightV: ["#d4b07c", "#c79f6a"], darkV: ["#6e4424", "#a06a3e"], frame: "#5a3418", frameV: ["#3f230f", "#73441f"], coord: "#f1dcb8",
			w: { color: "#efe2c6", roughness: 0.5, metalness: 0 }, b: { color: "#2a1a10", roughness: 0.45, metalness: 0 }, accW: "#c9b48c", accB: "#5a3a22" };
	}

	/* ---------- piece geometry (built once, shared by every piece) ---------- */
	var GEO = null;
	function arc(pts, cy, r, a0, a1, n) { for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; pts.push([Math.max(0.0001, r * Math.cos(a)), cy + r * Math.sin(a)]); } }
	function lathe(pts) { var g = new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 40); g.computeVertexNormals(); g.userData.keep = true; return g; }
	function basePts(rb, top) {   // shared foot: a flat bottom, a rounded plinth and a collar
		return [[0.0001, 0], [rb, 0], [rb, 0.05], [rb - 0.02, 0.075], [rb * 0.92, 0.1], [rb * 0.78, 0.13], [rb * 0.7, top]];
	}
	function buildGeo() {
		var g = {}, p;
		p = basePts(0.3, 0.15).concat([[0.16, 0.2], [0.12, 0.3], [0.1, 0.38], [0.17, 0.4], [0.17, 0.425], [0.1, 0.44]]);
		arc(p, 0.53, 0.12, -Math.PI / 2 + 0.55, Math.PI / 2, 10); p.push([0.0001, 0.65]);
		g.P = lathe(p);
		p = basePts(0.33, 0.16).concat([[0.2, 0.22], [0.16, 0.42], [0.15, 0.56], [0.2, 0.58], [0.2, 0.61], [0.13, 0.63]]);
		arc(p, 0.74, 0.13, -Math.PI / 2 + 0.3, Math.PI / 2 - 0.5, 10); p.push([0.03, 0.87]); arc(p, 0.9, 0.035, -Math.PI / 2, Math.PI / 2, 5);
		g.B = lathe(p);
		p = basePts(0.34, 0.16).concat([[0.23, 0.22], [0.2, 0.5], [0.24, 0.55], [0.25, 0.62], [0.25, 0.7], [0.0001, 0.7]]);
		g.R = lathe(p);
		g.Rc = new THREE.BoxGeometry(0.11, 0.1, 0.1); g.Rc.userData.keep = true;
		p = basePts(0.36, 0.17).concat([[0.22, 0.24], [0.15, 0.55], [0.14, 0.72], [0.22, 0.75], [0.22, 0.78], [0.15, 0.8], [0.2, 0.92], [0.21, 0.95], [0.0001, 0.95]]);
		g.Q = lathe(p);
		g.Qb = new THREE.SphereGeometry(0.04, 12, 8); g.Qb.userData.keep = true;
		g.Qt = new THREE.SphereGeometry(0.06, 16, 10); g.Qt.userData.keep = true;
		p = basePts(0.37, 0.17).concat([[0.23, 0.24], [0.16, 0.58], [0.15, 0.76], [0.23, 0.79], [0.23, 0.82], [0.16, 0.84], [0.2, 0.98], [0.21, 1.0], [0.12, 1.03], [0.0001, 1.04]]);
		g.K = lathe(p);
		g.Kv = new THREE.BoxGeometry(0.06, 0.22, 0.06); g.Kv.userData.keep = true;
		g.Kh = new THREE.BoxGeometry(0.17, 0.06, 0.06); g.Kh.userData.keep = true;
		g.Bs = new THREE.BoxGeometry(0.2, 0.018, 0.06); g.Bs.userData.keep = true;
		g.Nb = lathe(basePts(0.33, 0.24).concat([[0.2, 0.26], [0.0001, 0.26]]));
		// the knight's head: a side silhouette (forward = +x) extruded and bevelled
		var s = new THREE.Shape(), H = [[-0.22, 0.24], [0.18, 0.24], [0.12, 0.36], [0.1, 0.47], [0.24, 0.56], [0.33, 0.64], [0.32, 0.7], [0.26, 0.74], [0.1, 0.86],
			[0.06, 0.95], [-0.01, 1.0], [-0.06, 0.92], [-0.18, 0.84], [-0.25, 0.68], [-0.27, 0.5], [-0.25, 0.36]];
		s.moveTo(H[0][0], H[0][1]); for (var i = 1; i < H.length; i++) s.lineTo(H[i][0], H[i][1]); s.closePath();
		var kn = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 6 });
		kn.translate(0, 0, -0.08); kn.computeVertexNormals(); kn.userData.keep = true;
		g.Nh = kn;
		g.Ne = new THREE.SphereGeometry(0.025, 8, 6); g.Ne.userData.keep = true;
		return g;
	}
	function makePiece(type, mats) {
		var white = type === type.toUpperCase(), t = type.toUpperCase(), mat = white ? mats.w : mats.b, acc = white ? mats.accW : mats.accB, g = new THREE.Group(), G = GEO;
		function add(geo, m, x, y, z) { var o = new THREE.Mesh(geo, m || mat); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; }
		if (t === "N") {
			add(G.Nb);
			var h = add(G.Nh, null, 0, 0.02, 0);
			h.rotation.y = Math.PI / 2;      // forward (+x of the shape) -> -z: toward Black's side
			add(G.Ne, acc, -0.105, 0.82, -0.18); add(G.Ne, acc, 0.105, 0.82, -0.18);
			if (!white) g.rotation.y = Math.PI;
		} else {
			add(G[t]);
			if (t === "R") for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3, c = add(G.Rc, null, Math.cos(a) * 0.19, 0.74, Math.sin(a) * 0.19); c.rotation.y = -a; }
			if (t === "Q") { for (var j = 0; j < 8; j++) { var b = j * Math.PI / 4; add(G.Qb, null, Math.cos(b) * 0.19, 0.97, Math.sin(b) * 0.19); } add(G.Qt, acc, 0, 1.01, 0); }
			if (t === "K") { add(G.Kv, acc, 0, 1.15, 0); add(G.Kh, acc, 0, 1.17, 0); }
			if (t === "B") { var sl = add(G.Bs, acc, 0, 0.79, 0); sl.rotation.z = 0.6; sl.rotation.y = white ? 0 : Math.PI; }
		}
		g.userData.type = type;
		return g;
	}

	/* ---------- the view ---------- */
	function create(container) {
		return load().then(function () {
			var t = document.createElement("canvas");
			if (!(t.getContext("webgl2") || t.getContext("webgl"))) throw new Error("WebGL is switched off in this browser");
			if (!GEO) GEO = buildGeo();
			return new View(container);
		});
	}
	function sqX(s) { return (s & 7) - 3.5; }
	function sqZ(s) { return 3.5 - (s >> 3); }

	function View(el) {
		this.el = el;
		var R = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
		R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
		R.domElement.className = "ch-cv3";
		R.domElement.style.width = "100%"; R.domElement.style.height = "100%"; R.domElement.style.display = "block";
		el.appendChild(R.domElement);
		this.scene = new THREE.Scene();
		this.cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 900);
		this.cur = { eye: new THREE.Vector3(0, 9, 11), look: new THREE.Vector3(0, 0, 0.3), up: new THREE.Vector3(0, 1, 0) };
		this.camMode = "auto"; this.zoomF = 1; this.free = { yaw: 0, pitch: 0 }; this.orb = { th: Math.PI / 2, ph: 0.75, d: 13 };
		this.flip = false; this.coords = true; this.setId = "wood"; this.roomName = "club";
		this.ray = new THREE.Raycaster();
		this.scene.add(new THREE.HemisphereLight("#fff6e8", "#2a2018", 0.75));
		var key = this.key = new THREE.DirectionalLight("#fff3dd", 1.7);
		key.position.set(-5, 14, 7); key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		var sc = key.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
		this.scene.add(key); this.scene.add(key.target);
		this.boardG = new THREE.Group(); this.scene.add(this.boardG);
		this.markG = new THREE.Group(); this.scene.add(this.markG);
		this.pieceG = new THREE.Group(); this.scene.add(this.pieceG);
		this.pieces = new Array(64); this.moves = []; this.pos = null;
		this.w = 300; this.h = 300; this.raf = 0; this.anims = [];
		this.buildMats(); this.buildBoard(); this.buildMarkers();
		this.setRoom("club");
	}
	View.prototype.buildMats = function () {
		var L = setLook(this.setId), keep = function (m) { m.userData.keep = true; return m; }, pc = this.pieceCols;
		if (pc) {   // the player's own piece colours (easier to see than ivory on a light board)
			L = Object.assign({}, L, { w: Object.assign({}, L.w, { color: pc[0] }), b: Object.assign({}, L.b, { color: pc[1] }) });
			if (L.w.map) delete L.w.map; if (L.b.map) delete L.b.map;
		}
		if (this.mats) ["w", "b", "accW", "accB"].forEach(function (k) { this.mats[k].dispose(); }, this);
		this.look = L;
		this.mats = { w: keep(new THREE.MeshStandardMaterial(L.w)), b: keep(new THREE.MeshStandardMaterial(L.b)), accW: keep(std(L.accW, 0.4)), accB: keep(std(L.accB, 0.4)) };
	};
	View.prototype.buildBoard = function () {
		var L = this.look, g = this.boardG, coords = this.coords;
		this.roomAnims = this.roomAnims || [];
		while (g.children.length) { var c0 = g.children.pop(); disposeTree(c0); }
		var B = 0.6, N = 8 + 2 * B, px = 1024, sq = px / N, bp = B * sq;
		var light = L.lightV.length ? noiseTex(L.light, L.lightV, 60, 3) : null, dark = L.darkV.length ? noiseTex(L.dark, L.darkV, 60, 7) : null;
		var frameT = L.frameV.length ? noiseTex(L.frame, L.frameV, 80, 11) : null;
		var t = tex(px, px, function (c, w) {
			if (frameT) { c.drawImage(frameT.image, 0, 0, w, w); c.fillStyle = "rgba(0,0,0,0.12)"; c.fillRect(0, 0, w, w); } else { c.fillStyle = L.frame; c.fillRect(0, 0, w, w); }
			for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
				var isLight = (r + f) % 2 === 1, x = bp + f * sq, y = bp + (7 - r) * sq, src = isLight ? light : dark;
				if (src) c.drawImage(src.image, (f * 37) % 128, (r * 53) % 128, 128, 128, x, y, sq + 0.5, sq + 0.5);
				else { c.fillStyle = isLight ? L.light : L.dark; c.fillRect(x, y, sq + 0.5, sq + 0.5); }
			}
			c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 3; c.strokeRect(bp, bp, 8 * sq, 8 * sq);
			if (coords) {
				c.fillStyle = L.coord; c.font = "700 " + Math.round(bp * 0.5) + "px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
				var F = "abcdefgh";
				for (var i = 0; i < 8; i++) {
					var cx = bp + (i + 0.5) * sq, cy = bp + (7 - i + 0.5) * sq;
					c.fillText(F[i], cx, w - bp / 2);
					c.fillText(String(i + 1), bp / 2, cy);
					c.save(); c.translate(cx, bp / 2); c.rotate(Math.PI); c.fillText(F[i], 0, 0); c.restore();
					c.save(); c.translate(w - bp / 2, cy); c.rotate(Math.PI); c.fillText(String(i + 1), 0, 0); c.restore();
				}
			}
		});
		[light, dark, frameT].forEach(function (x) { if (x) x.dispose(); });
		var top = new THREE.Mesh(new THREE.PlaneGeometry(N, N), std("#ffffff", this.setId === "marble" || this.setId === "glass" ? 0.3 : 0.6, { map: t }));
		top.rotation.x = -Math.PI / 2; top.receiveShadow = true; g.add(top);
		var side = std(L.frame, 0.6);
		box(g, N, 0.32, N, side, 0, -0.165, 0, true);
	};
	View.prototype.buildMarkers = function () {
		var mk = function (col, op) { var m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }); m.userData.keep = true; return m; };
		var sqG = new THREE.PlaneGeometry(1, 1); sqG.userData.keep = true;
		this.mk = {
			sq: sqG, dot: (function () { var d = new THREE.CircleGeometry(0.15, 24); d.userData.keep = true; return d; })(),
			ring: (function () { var d = new THREE.RingGeometry(0.4, 0.48, 32); d.userData.keep = true; return d; })(),
			last: mk("#f6d743", 0.42), sel: mk("#3cb371", 0.55), tgt: mk("#103a20", 0.45),
			chk: (function () {
				var t = tex(128, 128, function (c, w, h) { var gr = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(255,40,40,0.95)"); gr.addColorStop(0.6, "rgba(255,0,0,0.45)"); gr.addColorStop(1, "rgba(255,0,0,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
				var m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }); m.userData.keep = true; return m;
			})()
		};
	};
	View.prototype.markers = function (p) {
		var g = this.markG, K = this.mk;
		while (g.children.length) g.remove(g.children[g.children.length - 1]);
		function put(geo, mat, s, y) { var m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(sqX(s), y || 0.004, sqZ(s)); m.renderOrder = 2; g.add(m); return m; }
		if (p.last) { if (p.last.f >= 0) put(K.sq, K.last, p.last.f); if (p.last.t >= 0) put(K.sq, K.last, p.last.t); }
		if (p.sel >= 0) put(K.sq, K.sel, p.sel, 0.006);
		if (p.check >= 0) { var c = put(K.sq, K.chk, p.check, 0.008); c.scale.set(1.25, 1.25, 1); }
		(p.targets || []).forEach(function (s) { put(p.b[s] ? K.ring : K.dot, K.tgt, s, 0.01); });
	};

	/* position: keep the meshes that did not move, slide the one that moved */
	View.prototype.setPosition = function (p) {
		p = p || {}; var b = p.b || [], old = this.pieces, next = new Array(64), used = [], self = this, i;
		var flipChanged = !!p.flip !== this.flip; this.flip = !!p.flip;
		function take(s) { var m = old[s]; if (m && used.indexOf(m) < 0) { used.push(m); return m; } return null; }
		function placeAt(m, s) { m.position.set(sqX(s), 0, sqZ(s)); }
		this.anims = this.anims.filter(function (a) { placeAt(a.m, a.to); return false; });   // finish anything still sliding
		var A = p.anim && !REDUCED ? [[p.anim.f, p.anim.t]].concat(p.anim.rf >= 0 && p.anim.rt >= 0 && p.anim.rf !== undefined ? [[p.anim.rf, p.anim.rt]] : []) : [];
		A.forEach(function (mv) {
			var f = mv[0], t = mv[1];
			if (f < 0 || t < 0 || !b[t]) return;
			var m = old[f] && old[f].userData.type === b[t] ? take(f) : null;
			if (!m) { m = makePiece(b[t], self.mats); self.pieceG.add(m); }
			next[t] = m; placeAt(m, f);
			var knight = b[t].toUpperCase() === "N";
			self.anims.push({ m: m, from: f, to: t, t0: performance.now() + (mv === A[1] ? 60 : 0), dur: knight ? 300 : 230 + 12 * Math.hypot(sqX(t) - sqX(f), sqZ(t) - sqZ(f)), hop: knight ? 0.9 : 0 });
		});
		for (i = 0; i < 64; i++) {
			if (next[i] || !b[i]) continue;
			var m = old[i] && old[i].userData.type === b[i] ? take(i) : null;
			if (!m) { m = makePiece(b[i], this.mats); this.pieceG.add(m); }
			placeAt(m, i); next[i] = m;
		}
		old.forEach(function (m) { if (m && used.indexOf(m) < 0 && next.indexOf(m) < 0) self.pieceG.remove(m); });
		this.pieces = next; this.pos = p;
		this.markers(p);
		if (flipChanged && this.camMode !== "orbit") this.free = { yaw: 0, pitch: 0 };
		this.render();
	};
	View.prototype.rebuildPieces = function () {
		var b = this.pos ? this.pos.b : null;
		this.pieces.forEach(function (m) { if (m) this.pieceG.remove(m); }, this);
		this.pieces = new Array(64);
		if (this.pos) this.setPosition({ b: b, flip: this.flip, last: this.pos.last, check: this.pos.check, sel: this.pos.sel, targets: this.pos.targets });
	};
	View.prototype.setSet = function (id) {
		if (!SETS.some(function (s) { return s.id === id; })) id = "wood";
		this.setId = id; this.buildMats(); this.buildBoard(); this.rebuildPieces(); this.render();
	};
	/** cols = [white colour, black colour] or null for the set's own */
	View.prototype.setPieceColors = function (cols) { this.pieceCols = cols || null; this.buildMats(); this.rebuildPieces(); this.render(); };
	View.prototype.setCoords = function (on) { this.coords = on !== false; this.buildBoard(); this.render(); };

	/* ---------- camera ---------- */
	View.prototype.setCam = function (m) { this.camMode = m; this.free = { yaw: 0, pitch: 0 }; this.render(); };
	View.prototype.zoom = function (f) { this.zoomF = Math.max(0.45, Math.min(2.6, this.zoomF * f)); if (this.camMode === "orbit") this.orb.d = Math.max(5, Math.min(40, this.orb.d * f)); this.render(); };
	View.prototype.orbit = function (dx, dy) {
		if (this.camMode === "orbit") { this.orb.th -= dx * 0.008; this.orb.ph = Math.max(0.05, Math.min(1.45, this.orb.ph - dy * 0.006)); }
		else { this.free.yaw -= dx * 0.008; this.free.pitch = Math.max(-0.9, Math.min(0.9, this.free.pitch + dy * 0.006)); }
		this.render();
	};
	View.prototype.resetView = function () { this.free = { yaw: 0, pitch: 0 }; this.zoomF = 1; this.orb = { th: this.flip ? -Math.PI / 2 : Math.PI / 2, ph: 0.75, d: 13 }; this.render(); };
	View.prototype.camTarget = function () {
		var mode = this.camMode, z = this.zoomF, out = { eye: new THREE.Vector3(), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 1, 0) };
		var fov = this.cam.fov * Math.PI / 180, asp = Math.max(0.3, this.w / this.h);
		var fit = 5.4 / Math.tan(fov / 2) / Math.min(1, asp);        // distance at which the board (with frame) fits the narrow side
		if (mode === "orbit") {
			var o = this.orb;
			out.eye.set(o.d * Math.sin(o.ph) * Math.cos(o.th), o.d * Math.cos(o.ph), o.d * Math.sin(o.ph) * Math.sin(o.th));
			return out;
		}
		var th, ph, d = fit * z;
		if (mode === "top") { th = this.flip ? -Math.PI / 2 : Math.PI / 2; ph = 0.001; d = fit * 0.98 * z; }
		else if (mode === "side") { th = 0; ph = 0.95; d = fit * 1.05 * z; }
		else { var black = mode === "black" || (mode === "auto" && this.flip); th = black ? -Math.PI / 2 : Math.PI / 2; ph = 0.86; d = fit * 0.92 * z; }
		th += this.free.yaw; ph = Math.max(0.001, Math.min(1.45, ph + this.free.pitch));
		out.eye.set(d * Math.sin(ph) * Math.cos(th), d * Math.cos(ph), d * Math.sin(ph) * Math.sin(th));
		out.look.set(0, 0, 0);
		if (ph < 0.02) out.up.set(-Math.cos(th), 0, -Math.sin(th));   // straight down: keep "up" pointing away from the player
		return out;
	};
	View.prototype.size = function (w, h) {
		this.w = Math.max(1, w); this.h = Math.max(1, h);
		this.renderer.setSize(this.w, this.h, false);
		this.cam.aspect = this.w / this.h; this.cam.updateProjectionMatrix();
		this.render();
	};
	View.prototype.pick = function (cx, cy) {
		var r = this.renderer.domElement.getBoundingClientRect();
		if (!r.width || !r.height) return -1;
		var v = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		this.ray.setFromCamera(v, this.cam);
		var o = this.ray.ray.origin, d = this.ray.ray.direction;
		// first try the pieces (a tall piece covers the square behind it), then the board plane
		var hits = this.ray.intersectObjects(this.pieceG.children, true);
		if (hits.length) { var ob = hits[0].object; while (ob.parent && ob.parent !== this.pieceG) ob = ob.parent; var s0 = this.pieces.indexOf(ob); if (s0 >= 0) return s0; }
		if (Math.abs(d.y) < 1e-6) return -1;
		var t = -o.y / d.y; if (t < 0) return -1;
		var x = o.x + d.x * t, zz = o.z + d.z * t, f = Math.floor(x + 4), rk = Math.floor(4 - zz);
		return f >= 0 && f < 8 && rk >= 0 && rk < 8 ? rk * 8 + f : -1;
	};
	View.prototype.png = function () { this._draw(true); return this.renderer.domElement.toDataURL("image/png"); };
	View.prototype.render = function () {
		var self = this;
		if (this.raf || this.dead) return;
		this.raf = requestAnimationFrame(function () { self.raf = 0; self._draw(false); });
	};
	View.prototype._draw = function (instant) {
		if (this.dead) return;
		var now = performance.now(), busy = false;
		this.anims = this.anims.filter(function (a) {
			var k = Math.max(0, Math.min(1, (now - a.t0) / a.dur)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
			if (instant) e = k = 1;
			a.m.position.set(sqX(a.from) + (sqX(a.to) - sqX(a.from)) * e, a.hop * Math.sin(Math.PI * e), sqZ(a.from) + (sqZ(a.to) - sqZ(a.from)) * e);
			return k < 1;
		});
		if (this.anims.length) busy = true;
		var tg = this.camTarget(), cur = this.cur, k = instant || REDUCED ? 1 : 0.16, moving = false;
		[["eye", tg.eye], ["look", tg.look], ["up", tg.up]].forEach(function (a) { var v = cur[a[0]]; if (v.distanceTo(a[1]) > 0.002) { v.lerp(a[1], k); moving = true; } else v.copy(a[1]); });
		this.cam.position.copy(cur.eye); this.cam.up.copy(cur.up).normalize(); this.cam.lookAt(cur.look);
		if (this.roomAnims.length && !REDUCED) { var tt = now / 1000; this.roomAnims.forEach(function (f) { f(tt); }); busy = true; }
		this.renderer.render(this.scene, this.cam);
		if ((moving || busy) && !instant && !document.hidden) this.render();
	};
	View.prototype.dispose = function () {
		this.dead = true; if (this.raf) cancelAnimationFrame(this.raf);
		disposeTree(this.scene);
		this.renderer.dispose();
		if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
	};

	/* ---------- rooms ---------- */
	function signTex(text, fg, bg, w, h, font) {
		return tex(w, h, function (c) { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = font || ("800 " + Math.round(h * 0.42) + "px system-ui,sans-serif"); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, w / 2, h / 2 + 2); });
	}
	function miniBoard(g, x, y, z, s, ry) {   // a far table's board (one textured plane)
		var t = tex(64, 64, function (c) { for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { c.fillStyle = (r + f) % 2 ? "#e8d1a8" : "#7c5232"; c.fillRect(f * 8, r * 8, 8, 8); } });
		var m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), std("#ffffff", 0.7, { map: t })); m.rotation.x = -Math.PI / 2; m.rotation.z = ry || 0; m.position.set(x, y, z); g.add(m);
	}
	function table(g, top, legMat, w, d, H, round) {   // the table under the main board; its top is 0.06 below Y = 0
		var y = -0.33 - 0.06;
		if (round) { var t = cyl(g, w / 2, w / 2, 0.5, top, 0, y - 0.25, 0, 48); t.receiveShadow = true; cyl(g, 0.9, 1.6, H - 0.5, legMat, 0, y - 0.5 - (H - 0.5) / 2, 0, 24); return y - H; }
		var tt = box(g, w, 0.5, d, top, 0, y - 0.25, 0, true); tt.receiveShadow = true;
		[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(g, 0.6, H - 0.5, 0.6, legMat, s[0] * (w / 2 - 0.8), y - 0.5 - (H - 0.5) / 2, s[1] * (d / 2 - 0.8)); });
		return y - H;
	}
	function chair(g, mat, x, F, z, ry) {
		var c = new THREE.Group(); c.position.set(x, F, z); c.rotation.y = ry;
		box(c, 8, 0.8, 8, mat, 0, 8, 0); box(c, 8, 9, 0.8, mat, 0, 12.5, -3.6);
		[[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]].forEach(function (s) { box(c, 0.7, 8, 0.7, mat, s[0], 4, s[1]); });
		g.add(c);
	}
	function walls(g, X, Z, H, F, mat, floorMat) {
		var fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * X, 2 * Z), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.y = F; fl.receiveShadow = true; g.add(fl);
		[[0, -Z, 0, 2 * X], [0, Z, Math.PI, 2 * X], [-X, 0, Math.PI / 2, 2 * Z], [X, 0, -Math.PI / 2, 2 * Z]].forEach(function (w) {
			var m = new THREE.Mesh(new THREE.PlaneGeometry(w[3], H), mat); m.position.set(w[0], F + H / 2, w[1]); m.rotation.y = w[2]; g.add(m);
		});
	}
	function bookshelf(g, x, F, z, ry, seed) {
		var s = new THREE.Group(), r = rng(seed), wood = std("#5b3a22", 0.8); s.position.set(x, F, z); s.rotation.y = ry;
		box(s, 30, 40, 6, wood, 0, 20, 0);
		var cols = ["#7b2d26", "#2f4f6f", "#3d6b3d", "#c49a3a", "#4a3a6a", "#8a8a7a", "#a0522d"];
		for (var sh = 0; sh < 4; sh++) {
			box(s, 28, 0.6, 5.6, wood, 0, 3 + sh * 9.5, 3.2);
			for (var x0 = -13; x0 < 13;) { var bw = 1 + r() * 1.6, bh = 6 + r() * 2.5; box(s, bw, bh, 4.5, std(cols[(r() * cols.length) | 0], 0.9), x0 + bw / 2, 3.3 + sh * 9.5 + bh / 2, 3.4); x0 += bw + 0.15; }
		}
		g.add(s);
	}
	function plant(g, x, F, z) {
		cyl(g, 2.4, 1.8, 4.5, std("#b5683d", 0.9), x, F + 2.25, z);
		var leaf = std("#2f7d3a", 0.8);
		for (var i = 0; i < 9; i++) { var l = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), leaf); l.scale.set(0.5, 1.6, 0.5); var a = i * 0.7; l.position.set(x + Math.cos(a) * 1.6, F + 7 + (i % 3) * 1.5, z + Math.sin(a) * 1.6); l.rotation.z = Math.cos(a) * 0.5; l.rotation.x = Math.sin(a) * 0.5; g.add(l); }
	}
	function lamp(g, x, F, z, H, glow) {
		var metal = std("#2b2b2b", 0.5, { metalness: 0.6 });
		cyl(g, 1.6, 2, 0.6, metal, x, F + 0.3, z); cyl(g, 0.25, 0.25, H, metal, x, F + H / 2, z);
		var sh = cyl(g, 1.5, 3, 3, std("#f3e5c0", 0.9, { emissive: glow ? "#ffcf80" : "#000000", emissiveIntensity: 0.6, side: THREE.DoubleSide }), x, F + H, z, 24); sh.material.side = THREE.DoubleSide;
	}

	View.prototype.setRoom = function (name) {
		if (!ROOMS.some(function (r) { return r.id === name; })) name = "club";
		this.roomName = name;
		if (this.room) { this.scene.remove(this.room); disposeTree(this.room); }
		(this.roomLights || []).forEach(function (l) { this.scene.remove(l); }, this);
		var g = this.room = new THREE.Group(), lights = this.roomLights = [], anims = this.roomAnims = [], scene = this.scene, r = rng(777), self = this;
		this.scene.add(g);
		function light(l) { scene.add(l); lights.push(l); return l; }
		this.key.intensity = 1.7; this.key.color.set("#fff3dd");
		var F;
		if (name === "dark") {
			scene.background = new THREE.Color("#15171a"); scene.fog = null;
			F = table(g, std("#2d2f33", 0.8), std("#1e1f22", 0.8), 16, 16, 13.5);
		} else if (name === "club") {
			scene.background = new THREE.Color("#1d140d"); scene.fog = new THREE.Fog("#1d140d", 60, 150);
			var panel = std("#ffffff", 0.85, { map: (function () { var t = tex(256, 256, function (c, w, h) { c.fillStyle = "#4a2c17"; c.fillRect(0, 0, w, h); for (var x = 0; x < w; x += 64) { c.fillStyle = "#3a2111"; c.fillRect(x, 0, 6, h); c.strokeStyle = "rgba(255,220,170,0.08)"; c.strokeRect(x + 14, 20, 36, h - 40); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 1); return t; })() });
			var floor = std("#ffffff", 0.8, { map: (function () { var t = tex(256, 256, function (c, w, h) { for (var y = 0; y < h; y += 32) for (var x = (y / 32 % 2) * 64; x < w + 128; x += 128) { var v = 90 + Math.random() * 30; c.fillStyle = "rgb(" + v + "," + (v * 0.62) + "," + (v * 0.38) + ")"; c.fillRect(x, y, 126, 31); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t; })() });
			F = table(g, std("#3b2414", 0.6), std("#2a190d", 0.7), 18, 16, 13.5);
			walls(g, 90, 80, 60, F, panel, floor);
			var wood = std("#3b2414", 0.6);
			[[-35, -18], [35, -18], [-35, 26], [35, 26], [0, -45]].forEach(function (p, i) {
				var tg = new THREE.Group(); tg.position.set(p[0], 0, p[1]);
				box(tg, 16, 0.6, 16, wood, 0, F + 13.2, 0, true); cyl(tg, 0.8, 1.4, 13, wood, 0, F + 6.5, 0);
				miniBoard(tg, 0, F + 13.55, 0, 9, i * 0.3); g.add(tg);
				chair(g, std("#5a3a22", 0.8), p[0], F, p[1] + 13, Math.PI); chair(g, std("#5a3a22", 0.8), p[0], F, p[1] - 13, 0);
			});
			chair(g, std("#5a3a22", 0.8), 0, F, 15, Math.PI); chair(g, std("#5a3a22", 0.8), 0, F, -15, 0);
			[-60, -20, 20, 60].forEach(function (x, i) { bookshelf(g, x, F, -77, 0, 31 + i); });
			bookshelf(g, -87, F, 10, Math.PI / 2, 9); bookshelf(g, 87, F, -20, -Math.PI / 2, 13);
			lamp(g, -22, F, 6, 30, true); lamp(g, 24, F, -5, 30, true);
			var pend = std("#1b5e3b", 0.5, { metalness: 0.3, side: THREE.DoubleSide });
			var shade = new THREE.Mesh(new THREE.ConeGeometry(4, 3, 24, 1, true), pend); shade.position.set(0, 26, 0); g.add(shade);
			var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff2c8" })); bulb.position.set(0, 24.8, 0); g.add(bulb);
			cyl(g, 0.12, 0.12, 30, std("#222", 0.6), 0, 42, 0);
			var pl = light(new THREE.PointLight("#ffd9a0", 160, 70, 1.6)); pl.position.set(0, 24, 0);
			this.key.intensity = 1.3;
		} else if (name === "tournament") {
			scene.background = new THREE.Color("#0d0f14"); scene.fog = new THREE.Fog("#0d0f14", 90, 260);
			var carpet = std("#ffffff", 1, { map: (function () { var t = tex(64, 64, function (c, w, h) { c.fillStyle = "#283246"; c.fillRect(0, 0, w, h); for (var i = 0; i < 300; i++) { c.fillStyle = "rgba(255,255,255," + Math.random() * 0.06 + ")"; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); return t; })() });
			F = table(g, std("#f2f2f2", 0.5), std("#9aa3ad", 0.4, { metalness: 0.5 }), 26, 16, 13.5);
			walls(g, 160, 140, 90, F, std("#1a1e27", 0.95), carpet);
			var cloth = std("#f4f4f4", 0.7), steel = std("#9aa3ad", 0.4, { metalness: 0.5 });
			for (var row = 0; row < 3; row++) for (var col = -3; col <= 3; col++) {
				if (row === 0 && col === 0) continue;
				var tx = col * 34, tz = -row * 30 - (row ? 0 : 0);
				if (row === 0) tz = 0;
				box(g, 26, 0.6, 16, cloth, tx, F + 13.2, tz, true);
				[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(g, 0.5, 13, 0.5, steel, tx + s[0] * 12, F + 6.5, tz + s[1] * 7); });
				miniBoard(g, tx, F + 13.55, tz, 9, 0);
				var clk = box(g, 4, 2, 1.6, std("#202020", 0.5), tx + 9, F + 14.5, tz); clk.rotation.y = Math.PI / 2;
			}
			var clock = box(g, 1.6, 2.2, 4.2, std("#202020", 0.5), 9.5, F + 14.6, 0, true);
			var ct = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.4), new THREE.MeshBasicMaterial({ map: signTex("05:00  04:58", "#7CFF8A", "#0a0a0a", 256, 80, "700 34px ui-monospace,monospace") })); ct.position.set(10.35, F + 14.8, 0); ct.rotation.y = Math.PI / 2; g.add(ct);
			var scr = new THREE.Mesh(new THREE.PlaneGeometry(80, 24), new THREE.MeshBasicMaterial({ map: signTex("MES CHESS OPEN · ROUND 5", "#ffffff", "#1d3557", 1024, 300) }));
			scr.position.set(0, F + 60, -138); g.add(scr);
			// spectators behind a rope (instanced, they sway a little)
			var n = 140, bodyG = new THREE.CylinderGeometry(1.6, 2.2, 9, 8), headG = new THREE.SphereGeometry(1.6, 10, 8);
			var bodies = new THREE.InstancedMesh(bodyG, std("#ffffff", 0.9), n), heads = new THREE.InstancedMesh(headG, std("#ffffff", 0.8), n), spots = [], mt = new THREE.Matrix4(), cc = new THREE.Color();
			var shirt = ["#c0392b", "#2c3e50", "#27ae60", "#8e44ad", "#f39c12", "#7f8c8d", "#16a085", "#d35400"], skin = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
			for (var k = 0; k < n; k++) {
				var side = k % 2 ? 1 : -1, ring = (k / 2) | 0, x0 = side * (120 + (ring % 5) * 7), z0 = -110 + Math.floor(ring / 5) * 14 + r() * 3;
				spots.push([x0, z0, r() * 6]);
				bodies.setColorAt(k, cc.set(shirt[(r() * shirt.length) | 0])); heads.setColorAt(k, cc.set(skin[(r() * skin.length) | 0]));
			}
			g.add(bodies); g.add(heads);
			function place(t) { spots.forEach(function (s, k) { var sw = Math.sin(t * 0.8 + s[2]) * 0.6; mt.makeTranslation(s[0] + sw, F + 4.5, s[1]); bodies.setMatrixAt(k, mt); mt.makeTranslation(s[0] + sw * 1.3, F + 10.6, s[1]); heads.setMatrixAt(k, mt); }); bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true; }
			place(0); anims.push(place);
			var rope = std("#b71c1c", 0.6);
			[-1, 1].forEach(function (s) { box(g, 0.6, 0.6, 240, rope, s * 112, F + 8, 0); });
			[[-50, 40], [50, 40], [0, 70]].forEach(function (p) { var sp = light(new THREE.SpotLight("#ffffff", 900, 220, 0.5, 0.6, 1.2)); sp.position.set(p[0], 80, p[1]); sp.target.position.set(0, F, 0); scene.add(sp.target); lights.push(sp.target); });
			this.key.intensity = 1.5; this.key.color.set("#ffffff");
		} else if (name === "park") {
			scene.background = tex(16, 256, function (c, w, h) { var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#5aa0e6"); gr.addColorStop(0.6, "#bfe0ff"); gr.addColorStop(1, "#e8f4ff"); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
			scene.fog = new THREE.Fog("#cfe6fb", 140, 420);
			var stone = std("#ffffff", 0.9, { map: noiseTex("#9a9690", ["#7d7a75", "#b5b1aa"], 120, 5) });
			F = table(g, stone, stone, 22, 22, 13.5, true);
			var grass = new THREE.Mesh(new THREE.CircleGeometry(420, 48), std("#ffffff", 1, { map: (function () { var t = tex(128, 128, function (c, w, h) { c.fillStyle = "#4f8f3a"; c.fillRect(0, 0, w, h); for (var i = 0; i < 1500; i++) { c.fillStyle = Math.random() < 0.5 ? "#5fa046" : "#43802f"; c.fillRect(Math.random() * w, Math.random() * h, 1, 2); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); return t; })() }));
			grass.rotation.x = -Math.PI / 2; grass.position.y = F; grass.receiveShadow = true; g.add(grass);
			var path = new THREE.Mesh(new THREE.RingGeometry(18, 30, 48), std("#cdb98f", 1)); path.rotation.x = -Math.PI / 2; path.position.y = F + 0.05; g.add(path);
			[[0, 1], [0, -1]].forEach(function (s) { var st = cyl(g, 3.5, 3.5, 8, stone, 0, F + 4, s[1] * 16); st.castShadow = true; });
			var bark = std("#5b4030", 0.95), leaves = [std("#2f6f2a", 0.9), std("#3d8a33", 0.9), std("#28602a", 0.9)];
			for (var i2 = 0; i2 < 16; i2++) {
				var a = i2 / 16 * Math.PI * 2 + r() * 0.3, d = 70 + r() * 120, tx2 = Math.cos(a) * d, tz2 = Math.sin(a) * d, th2 = 30 + r() * 20;
				cyl(g, 1.6, 2.4, th2, bark, tx2, F + th2 / 2, tz2, 10);
				for (var b2 = 0; b2 < 3; b2++) { var cr = new THREE.Mesh(new THREE.SphereGeometry(10 + r() * 6, 12, 10), leaves[b2]); cr.position.set(tx2 + (r() - 0.5) * 8, F + th2 + (r() - 0.3) * 8, tz2 + (r() - 0.5) * 8); cr.castShadow = true; g.add(cr); }
			}
			var benchW = std("#7a4f2a", 0.8), iron = std("#2a2a2a", 0.6, { metalness: 0.5 });
			[[-45, 20, 0.6], [45, -25, -2.4], [10, 55, 3.4]].forEach(function (p) {
				var bg = new THREE.Group(); bg.position.set(p[0], F, p[1]); bg.rotation.y = p[2];
				for (var s2 = 0; s2 < 4; s2++) box(bg, 30, 0.6, 1.6, benchW, 0, 8, -2.4 + s2 * 1.7);
				for (s2 = 0; s2 < 3; s2++) box(bg, 30, 1.6, 0.6, benchW, 0, 11 + s2 * 2.2, -3.6);
				[-12, 12].forEach(function (x) { box(bg, 0.8, 8, 6, iron, x, 4, -1); }); g.add(bg);
			});
			var post = std("#1f2a22", 0.5, { metalness: 0.4 });
			cyl(g, 0.5, 0.8, 55, post, -26, F + 27.5, -24, 10);
			var lampHead = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 10), new THREE.MeshBasicMaterial({ color: "#fff6d8" })); lampHead.position.set(-26, F + 57, -24); g.add(lampHead);
			this.key.intensity = 2.3; this.key.color.set("#fff8ea"); this.key.position.set(-9, 18, 4);
		} else if (name === "home") {
			scene.background = new THREE.Color("#2b2620"); scene.fog = null;
			var parquet = std("#ffffff", 0.8, { map: (function () { var t = tex(256, 256, function (c, w, h) { for (var y = 0; y < h; y += 16) for (var x = (y / 16 % 2) * 32; x < w + 64; x += 64) { var v = 150 + Math.random() * 40; c.fillStyle = "rgb(" + v + "," + (v * 0.72) + "," + (v * 0.45) + ")"; c.fillRect(x, y, 63, 15); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t; })() });
			F = table(g, std("#6b4423", 0.55), std("#4a2f18", 0.7), 18, 18, 8);   // a low coffee table
			walls(g, 70, 60, 50, F, std("#d9cbb4", 0.95), parquet);
			var rug = new THREE.Mesh(new THREE.PlaneGeometry(60, 44), std("#ffffff", 1, { map: tex(256, 190, function (c, w, h) { c.fillStyle = "#6e2b2b"; c.fillRect(0, 0, w, h); c.strokeStyle = "#e2c08d"; c.lineWidth = 8; c.strokeRect(12, 12, w - 24, h - 24); c.lineWidth = 3; c.strokeRect(30, 30, w - 60, h - 60); c.beginPath(); c.ellipse(w / 2, h / 2, 40, 28, 0, 0, 7); c.stroke(); }) }));
			rug.rotation.x = -Math.PI / 2; rug.position.y = F + 0.05; rug.receiveShadow = true; g.add(rug);
			var fabric = std("#47607a", 0.95), sofa = new THREE.Group(); sofa.position.set(0, F, -30);
			box(sofa, 44, 7, 14, fabric, 0, 5, 0, true); box(sofa, 44, 12, 4, fabric, 0, 12, -6, true); box(sofa, 4, 10, 14, fabric, -22, 9, 0, true); box(sofa, 4, 10, 14, fabric, 22, 9, 0, true);
			[-11, 11].forEach(function (x) { box(sofa, 20, 3, 12, std("#557090", 0.95), x, 10, 0.5, true); }); g.add(sofa);
			var win = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshBasicMaterial({ map: tex(256, 170, function (c, w, h) {
				var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#7fb7ea"); gr.addColorStop(1, "#d8ecfb"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
				c.fillStyle = "rgba(255,255,255,0.9)"; [[60, 50, 18], [78, 46, 22], [96, 52, 16], [190, 80, 15], [204, 76, 19]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], p[2], 0, 7); c.fill(); });
				c.fillStyle = "#4b7a3a"; c.fillRect(0, h - 30, w, 30); c.strokeStyle = "#f4efe6"; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
			}) }));
			win.position.set(69.5, F + 28, 0); win.rotation.y = -Math.PI / 2; g.add(win);
			bookshelf(g, -69, F, 10, Math.PI / 2, 21); plant(g, 55, F, -48); lamp(g, -50, F, -45, 32, true);
			var pl2 = light(new THREE.PointLight("#ffe0b0", 120, 90, 1.5)); pl2.position.set(-50, F + 34, -42);
			this.key.position.set(12, 16, 3); this.key.intensity = 1.6;
		} else if (name === "space") {
			scene.background = new THREE.Color("#02030a"); scene.fog = null;
			var starG = new THREE.BufferGeometry(), pts = [];
			for (var s3 = 0; s3 < 2500; s3++) { var u = r() * 2 - 1, th3 = r() * Math.PI * 2, R3 = 300 + r() * 200, q = Math.sqrt(1 - u * u); pts.push(R3 * q * Math.cos(th3), R3 * u, R3 * q * Math.sin(th3)); }
			starG.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
			var stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: "#ffffff", size: 1.4, sizeAttenuation: false })); g.add(stars);
			var planet = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), std("#ffffff", 0.9, { map: tex(512, 256, function (c, w, h) { for (var y = 0; y < h; y += 4) { var v = Math.sin(y * 0.09) * 30 + Math.random() * 15; c.fillStyle = "rgb(" + (170 + v) + "," + (110 + v * 0.6) + "," + (70 + v * 0.3) + ")"; c.fillRect(0, y, w, 4); } }) }));
			planet.position.set(-140, -40, -220); g.add(planet);
			var ringM = new THREE.Mesh(new THREE.RingGeometry(80, 120, 64), new THREE.MeshBasicMaterial({ color: "#d9c39a", transparent: true, opacity: 0.35, side: THREE.DoubleSide })); ringM.position.copy(planet.position); ringM.rotation.x = 1.2; ringM.rotation.y = 0.3; g.add(ringM);
			var edge = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.06, 9.5), new THREE.MeshBasicMaterial({ color: "#3fa9ff", transparent: true, opacity: 0.7 })); edge.position.y = -0.36; g.add(edge);
			var glow = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: tex(128, 128, function (c, w, h) { var gr = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(63,169,255,0.5)"); gr.addColorStop(1, "rgba(63,169,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false }));
			glow.rotation.x = -Math.PI / 2; glow.position.y = -0.5; g.add(glow);
			anims.push(function (t) { stars.rotation.y = t * 0.004; planet.rotation.y = t * 0.03; edge.material.opacity = 0.5 + 0.25 * Math.sin(t * 1.5); });
			var rim = light(new THREE.PointLight("#5ab0ff", 60, 40, 1.2)); rim.position.set(6, 3, -8);
			this.key.color.set("#f0f4ff"); this.key.intensity = 2;
		}
		if (name !== "park") this.key.position.set(-5, 14, 7);
		this.render();
	};

	window.CH3D = { ROOMS: ROOMS, SETS: SETS, create: create };
})();

/* MES Chess: the page (setup, 2D board, 3D board via view3d.js, computer, clocks, analysis, replay, PGN / FEN, guest online games via /api/chess,
   Hive games, results and posts on Hive, statistics, rules). The same served file is also started as a Web Worker that runs the computer's thinking.
   Online: /api/chess on mes.fm; on localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in kept in localStorage "mes-chess:mock" is
   used instead, and Hive play uses a stand-in chain ("mes-chess:hchain") + a per-tab account, so two tabs can play. */
(function () {
	"use strict";
	var C = (typeof self !== "undefined" ? self : window).MESChess;

	function compute(q) {
		var s = C.replay(C.parseCode(q.code), q.moves);
		if (!s) return null;
		if (q.type === "analyze") return C.analyze(s, q.ms);
		var r = C.think(s, q.level, { ms: q.ms });
		return r ? { m: C.mstr(r.m), how: r.how, depth: r.depth, v: r.v } : null;
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
	var root = document.getElementById("ch");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-chess:v1";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

	/* ---------- saved settings ---------- */
	var S = { game: "standard", opp: "cpu", lv: "medium", me: "white", alt: 0, clock: "", dots: true, anal: false, autoflip: false, sound: true,
		dim: "2d", room: "club", set: "wood", cam: "auto", theme: "green", pcol: "auto", flipX: false,
		name: "", ofirst: "host", opub: true, ht: 5, cur: null, stats: {}, online: null, orec: {}, hive: null, saved: {} };
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
			worker.postMessage({ id: id, type: q.type, code: q.code, moves: q.moves, level: q.level, ms: q.ms });
		});
	}

	/* ---------- game state ---------- */
	var cfg, code, st, mode = "cpu", human = 0, vi = null, busy = false, gen = 0, sel = -1, kcur = -1, kbd = false, anim = null, hintMv = null, assisted = false;
	var score = { w: 0, d: 0, l: 0, p: [0, 0] };
	var anal = { key: "", r: null, busy: false };
	var clk = null;   // {base, inc, t: [ms, ms], on: side running or -1, last}

	function setupCfg() {
		var p = C.preset(S.game) || C.PRESETS[0];
		if (p.code === "F") return { v: "F", n: C.random960() };
		return C.parseCode(p.code);
	}
	function setGame(newCfg, moves, opts) {
		opts = opts || {};
		cfg = newCfg; code = C.cfgCode(cfg);
		st = C.replay(cfg, moves || []) || C.create(cfg);
		vi = null; busy = false; gen++; sel = -1; anim = null; hintMv = null;
		if (!opts.keepMode) mode = S.opp;
		if (opts.human !== undefined) human = opts.human;
		if (!opts.keepClock) clk = mode === "cpu" || mode === "local" ? newClock() : null;
		if (!opts.keepAssist) assisted = false;
		storeCur();
		render();
		maybeCpu();
	}
	function newClock() {
		var m = /^(\d+)\+(\d+)$/.exec(S.clock || "");
		if (!m) return null;
		var base = +m[1] * 60000;
		return { base: base, inc: +m[2] * 1000, t: [base, base], on: -1, last: 0 };
	}
	function newGame() {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first (button above the board).");
		var c = setupCfg();
		mode = S.opp;
		if (mode === "cpu") {
			if (S.me === "white") human = 0;
			else if (S.me === "black") human = 1;
			else if (S.me === "random") human = Math.random() < 0.5 ? 0 : 1;
			else { human = S.alt % 2; S.alt++; }
		} else human = 0;
		setGame(c, [], { human: human });
	}
	function storeCur() {
		if (mode === "online" || mode === "hive") return;
		S.cur = { code: code, moves: st.hist.slice(), mode: mode, human: human, done: !!st.win, clk: clk ? { base: clk.base, inc: clk.inc, t: clk.t.slice() } : null, as: assisted };
		save();
	}
	function viewState() { return vi === null ? st : C.replay(cfg, st.hist.slice(0, vi)); }
	function mySeat() {
		if (mode === "cpu") return human;
		if (mode === "online") return on.seat;
		if (mode === "hive") return hv.R ? hv.R.players.indexOf(hMe()) : -1;
		return -1;
	}
	function isHumanTurn() {
		if (mode === "local") return true;
		if (mode === "cpu") return st.turn === human;
		if (mode === "online") return on.g && on.g.status === "play" && st.turn === on.seat;
		if (mode === "hive") return hv.R && hv.R.status === "play" && hv.R.turnAcct === hMe();
		return false;
	}
	function canInput() { return !st.win && vi === null && !busy && isHumanTurn() && !(mode === "online" && on.sending) && !(mode === "hive" && (hv.busy || hv.pending.some(function (p) { return p.a === "mv"; }))); }
	/** which colour sits at the bottom of the board */
	function bottom() {
		var b = 0;
		if (mode === "cpu") b = human;
		else if (mode === "online") b = on.seat || 0;
		else if (mode === "hive") { var s = mySeat(); b = s > 0 ? 1 : 0; }
		else if (mode === "local" && S.autoflip) b = (vi === null ? st : viewState()).turn;
		return S.flipX ? 1 - b : b;
	}

	/* ---------- the computer ---------- */
	var LV_MS = { easy: 120, medium: 350, hard: 1200, expert: 3500 };
	function maybeCpu() {
		if (mode !== "cpu" || st.win || st.turn === human || busy) return;
		busy = true;
		var g = gen, t0 = Date.now();
		render();
		ask({ code: code, moves: st.hist.slice(), level: S.lv, ms: LV_MS[S.lv] }).then(function (r) {
			var wait = Math.max(0, 380 - (Date.now() - t0));
			setTimeout(function () {
				if (g !== gen) return;
				busy = false;
				var m = r && C.mparse(r.m);
				if (!m || !C.isLegal(st, m)) { var L = C.legal(st); m = L[(Math.random() * L.length) | 0]; }
				if (m) commit(m);
			}, wait);
		});
	}

	/* ---------- moves ---------- */
	function humanMove(m) {
		if (!canInput()) {
			if (vi !== null) toast("You are looking back at an earlier move: press ⏭ to return.");
			else if (!st.win && !isHumanTurn()) toast(busy ? "The computer is thinking…" : "It's not your turn.");
			return false;
		}
		var o = C.find(st, m);
		if (!o) { toast("That move isn't allowed."); return false; }
		sel = -1; hintMv = null;
		if (mode === "online") { onlineMove(o); return true; }
		if (mode === "hive") { hiveMove(o); return true; }
		commit(o);
		return true;
	}
	function commit(m) {
		var mover = st.turn;
		if (!C.apply(st, m)) return;
		vi = null;
		clockAfterMove(mover);
		animFor();
		sound();
		storeCur();
		render();
		if (st.win) finish(); else maybeCpu();
	}
	function animFor() { anim = st.last ? { n: st.hist.length, t0: Date.now(), f: st.last.f, t: st.last.t, rf: st.last.rf, rt: st.last.rt } : null; anim3n = -1; }
	function finish() {
		if (st._fin) return;
		st._fin = true;
		stopClock();
		var w = st.win, msg;
		if (mode === "local") {
			if (w.p < 0) score.d++; else score.p[w.p]++;
			msg = w.p < 0 ? "Draw." : C.playerName(cfg, w.p) + " wins!";
		} else {
			var me = mySeat(), res = w.p < 0 ? "d" : w.p === me ? "w" : "l";
			if (me < 0) { toast(w.p < 0 ? "Draw." : C.playerName(cfg, w.p) + " wins."); render(true); return; }
			score[res]++;
			var key = cfg.v + "|" + (mode === "cpu" ? S.lv : mode);
			var rec = true;
			if (mode === "online" || mode === "hive") { var tag = mode === "hive" ? "h:" + hv.host + "/" + hv.gid : on.id + ":" + (on.g ? on.g.round : 0); if (S.orec[tag]) rec = false; else S.orec[tag] = 1; pruneOrec(); }
			if (rec) { var a = S.stats[key] || [0, 0, 0]; a[res === "w" ? 0 : res === "d" ? 1 : 2]++; S.stats[key] = a; }
			msg = res === "w" ? "You win! 🎉" : res === "d" ? "Draw." : (mode === "cpu" ? "The computer wins." : "You lost this one.");
			save();
		}
		sound("end");
		toast(msg);
		render(true);
		renderStats();
	}
	function pruneOrec() { var k = Object.keys(S.orec); if (k.length > 60) k.slice(0, k.length - 60).forEach(function (x) { delete S.orec[x]; }); }
	function undo() {
		if (mode === "online" || mode === "hive" || !st.hist.length) return;
		var h = st.hist.slice();
		if (mode === "cpu") {
			h.pop();
			var t = C.replay(cfg, h);
			while (h.length && t && t.turn !== human) { h.pop(); t = C.replay(cfg, h); }
		} else h.pop();
		gen++; busy = false;
		setGame(cfg, h, { human: human, keepMode: true, keepClock: true, keepAssist: true });
		if (clk) { clk.on = st.hist.length ? st.turn : -1; clk.last = Date.now(); }
	}
	function resign() {
		if (st.win) return;
		if (mode === "online" || mode === "hive") return toast("Use Resign in the bar above the board.");
		if (!st.hist.length) return toast("No moves yet: just start a new game.");
		if (!confirm(mode === "local" ? C.playerName(cfg, st.turn) + " resigns?" : "Resign this game?")) return;
		var loser = mode === "cpu" ? human : st.turn;
		st.win = { p: 1 - loser, why: "resign", line: null, lines: [] };
		storeCur();
		finish();
	}

	/* ---------- clocks (computer + pass and play) ---------- */
	function clockAfterMove(mover) {
		if (!clk) return;
		var now = Date.now();
		if (clk.on === mover) clk.t[mover] = Math.max(0, clk.t[mover] - (now - clk.last)) + clk.inc;
		clk.on = st.win ? -1 : st.turn; clk.last = now;
	}
	function stopClock() { if (clk && clk.on >= 0) { clk.t[clk.on] = Math.max(0, clk.t[clk.on] - (Date.now() - clk.last)); clk.on = -1; } }
	function clockLeft(side) { if (!clk) return 0; return clk.on === side ? Math.max(0, clk.t[side] - (Date.now() - clk.last)) : clk.t[side]; }
	function fmtClock(ms) {
		var s = Math.ceil(ms / 1000);
		if (ms < 10000) return (ms / 1000).toFixed(1);
		var m = Math.floor(s / 60), r = s % 60;
		return m + ":" + (r < 10 ? "0" : "") + r;
	}
	setInterval(function () {
		if (!clk || clk.on < 0 || st.win) return;
		var side = clk.on;
		if (clockLeft(side) <= 0) {
			clk.t[side] = 0; clk.on = -1;
			// losing on time against a bare king is a draw
			var other = 1 - side, b = C.board64(st), hasMat = b.some(function (p) { return p && p !== (other ? "k" : "K") && (other ? p === p.toLowerCase() : p === p.toUpperCase()); });
			gen++; busy = false;
			st.win = hasMat ? { p: other, why: "flag", line: null, lines: [] } : { p: -1, why: "flag-draw", line: null, lines: [] };
			storeCur(); finish();
			return;
		}
		renderPlayers();
	}, 200);

	/* ---------- analysis + hints ---------- */
	function analysisAllowed() { return mode === "cpu" || mode === "local" || st.win; }
	function wantAnalysis() { return S.anal && analysisAllowed() && !(mode === "cpu" && st.turn !== human && !st.win && vi === null); }
	function runAnalysis() {
		var s = viewState();
		if (!wantAnalysis() || s.win) { anal.r = null; anal.key = ""; return; }
		var key = code + ":" + s.hist.join(".");
		if (anal.key === key) return;
		anal.key = key; anal.r = null; anal.busy = true;
		ask({ type: "analyze", code: code, moves: s.hist.slice(), ms: 1400 }).then(function (r) {
			if (anal.key !== key) return;
			anal.busy = false; anal.r = r; anal.turn = s.turn;
			render(true);
		});
	}
	function hint() {
		if (!(mode === "cpu" || mode === "local")) return toast("Hints are only for games against the computer or a friend here.");
		if (!canInput()) return;
		var g = gen;
		toast("Thinking…");
		ask({ code: code, moves: st.hist.slice(), level: "hard", ms: 1200 }).then(function (r) {
			if (g !== gen || !r) return;
			var m = C.mparse(r.m);
			if (!m) return;
			hintMv = m; assisted = true;
			toast("Hint: " + C.san(st, m));
			render(true);
		});
	}

	/* ---------- sounds ---------- */
	var actx = null;
	function sound(kind) {
		if (!S.sound) return;
		try {
			actx = actx || new (window.AudioContext || window.webkitAudioContext)();
			if (actx.state === "suspended") actx.resume();
			var l = st.last || {}, chk = C.inCheck(st), now = actx.currentTime;
			var tones = kind === "end" ? [[523, 0], [659, 0.12], [784, 0.24]] : chk ? [[880, 0], [660, 0.09]] : l.cap ? [[220, 0]] : [[330, 0]];
			tones.forEach(function (t) {
				var o = actx.createOscillator(), g = actx.createGain();
				o.type = kind === "end" ? "sine" : "triangle"; o.frequency.value = t[0];
				g.gain.setValueAtTime(0.0001, now + t[1]); g.gain.exponentialRampToValueAtTime(0.18, now + t[1] + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + t[1] + (kind === "end" ? 0.35 : 0.13));
				o.connect(g); g.connect(actx.destination); o.start(now + t[1]); o.stop(now + t[1] + 0.4);
			});
		} catch (e) {}
	}

	/* ---------- 2D board ---------- */
	var PIECE_PATHS = {   // original silhouettes in a 45 x 45 box
		base: "M10.5 39.5h24a1.5 1.5 0 0 0 1.5-1.5v-.5a1.5 1.5 0 0 0-1.5-1.5h-24A1.5 1.5 0 0 0 9 37.5v.5a1.5 1.5 0 0 0 1.5 1.5z",
		P: ["M13 36C14 29 17 25 19.5 21.5h6C28 25 31 29 32 36z", "M17.5 21.5h10a1.5 1.5 0 0 0 0-3h-10a1.5 1.5 0 0 0 0 3z", "c22.5,13,5"],
		R: ["M14 36l1.5-19h14l1.5 19z", "M12 17V9h4v3h3.5V9h6v3H29V9h4v8z", "M13 36h19v-2.5H13z", "l15.5,20.5,29.5,20.5"],
		B: ["c22.5,7,2.2", "M22.5 9.5C16 14 15 20 17.5 24h10C30 20 29 14 22.5 9.5z", "M16.5 24h12v3h-12z", "M17 27c0 4-2 7-3 9h17c-1-2-3-5-3-9z", "l24.6,13.4,20.6,19.2"],
		N: ["M14 36c0-6 3-9 5-12-2 0-5 1-7-.5-1.5-1.5-1-3.5.5-5C15 16 18 13 19 10l-1-3.5 3.5 2.5c1.5-.5 3-.5 4.5 0 5 2 8 8 7.5 16-.3 4-1.5 8-1.5 11z", "c20.5,13.5,1.1", "l26,10.5,30,17"],
		Q: ["c9,13,2", "c15.5,10,2", "c22.5,9,2", "c29.5,10,2", "c36,13,2", "M11 27L9 14l6 9 .5-11.5L20 22l2.5-11.5L25 22l4.5-10.5L30 23l6-9-2 13z", "M11 27c3 2 20 2 23 0l-1 4c-4 1.5-17 1.5-21 0z", "M12 31c1 2 0 4-1 5h23c-1-1-2-3-1-5z"],
		K: ["M21 3.5h3v3h3v3h-3v4h-3v-4h-3v-3h3z", "M22.5 13.5C17 13.5 13 17 13 21c0 3 2 5 3 6h13c1-1 3-3 3-6 0-4-4-7.5-9.5-7.5z", "M15.5 27h14l.5 4h-15z", "M15 31c0 2-2 4-3 5h21c-1-1-3-3-3-5z"]
	};
	var pieceCache = {};
	function pieceSvg(letter) {
		if (pieceCache[letter]) return pieceCache[letter];
		var white = letter === letter.toUpperCase(), L = letter.toUpperCase(), cls = white ? "ch-pw" : "ch-pb", out = '<g class="' + cls + '">';
		out += '<path class="ch-pf" d="' + PIECE_PATHS.base + '"/>';
		PIECE_PATHS[L].forEach(function (d) {
			if (d.charAt(0) === "c") { var c = d.slice(1).split(","); out += '<circle class="ch-pf" cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>'; }
			else if (d.charAt(0) === "l") { var q = d.slice(1).split(","); out += '<path class="ch-pd" d="M' + q[0] + " " + q[1] + "L" + q[2] + " " + q[3] + '"/>'; }
			else out += '<path class="ch-pf" d="' + d + '"/>';
		});
		out += "</g>";
		return (pieceCache[letter] = out);
	}
	var SQ = 100;
	function sqXY(i, flip) { var f = i & 7, r = i >> 3; return flip ? { x: (7 - f) * SQ, y: r * SQ } : { x: f * SQ, y: (7 - r) * SQ }; }
	function targetsFrom(s, from) {
		var out = {};
		if (from < 0) return out;
		C.legal(s).forEach(function (o) { if (o.f !== from) return; out[o.t] = 1; if (o.c) out[o.k] = 1; });
		return out;
	}
	var drag = null;   // {from, x, y, moved, wasSel}
	function drawBoard() {
		var s = viewState(), flip = bottom() === 1, b = C.board64(s), out = [], i, live = canInput() && vi === null;
		var last = s.last, chk = C.inCheck(s) && !s.win ? C.kingSq(s, s.turn) : (s.win && s.win.why === "mate" ? C.kingSq(s, s.turn) : -1);
		var tg = live && sel >= 0 ? targetsFrom(s, sel) : {};
		for (i = 0; i < 64; i++) {
			var p = sqXY(i, flip), dark = ((i & 7) + (i >> 3)) % 2 === 0;
			out.push('<rect class="ch-sq ' + (dark ? "d" : "l") + '" x="' + p.x + '" y="' + p.y + '" width="' + SQ + '" height="' + SQ + '"/>');
			if (last && (i === last.f || i === last.t)) out.push('<rect class="ch-last" x="' + p.x + '" y="' + p.y + '" width="' + SQ + '" height="' + SQ + '"/>');
			if (i === sel) out.push('<rect class="ch-sel" x="' + p.x + '" y="' + p.y + '" width="' + SQ + '" height="' + SQ + '"/>');
			if (i === chk) out.push('<circle class="ch-chk" cx="' + (p.x + 50) + '" cy="' + (p.y + 50) + '" r="52"/>');
			if (kbd && i === kcur) out.push('<rect class="ch-kc" x="' + (p.x + 3) + '" y="' + (p.y + 3) + '" width="' + (SQ - 6) + '" height="' + (SQ - 6) + '"/>');
		}
		// coordinates on the edge squares
		for (i = 0; i < 8; i++) {
			var fx = flip ? 7 - i : i, ry = flip ? i : 7 - i, botR = flip ? 7 : 0, leftF = flip ? 7 : 0;   // a label sits in the light colour on a dark square and the other way round
			out.push('<text class="ch-co ' + ((fx + botR) % 2 ? "d" : "l") + '" x="' + (i * SQ + 94) + '" y="795">' + "abcdefgh"[fx] + "</text>");
			out.push('<text class="ch-co ' + ((leftF + ry) % 2 ? "d" : "l") + '" x="5" y="' + (i * SQ + 20) + '">' + (ry + 1) + "</text>");
		}
		var el = anim ? Date.now() - anim.t0 : 1e9, doAnim = anim && vi === null && anim.n === s.hist.length && el < 280 && !REDUCED;
		for (i = 0; i < 64; i++) {
			if (!b[i]) continue;
			if (drag && drag.moved && i === drag.from) continue;
			var q = sqXY(i, flip), inner = pieceSvg(b[i]), style = "";
			if (doAnim && (i === anim.t || i === anim.rt)) {
				var from = sqXY(i === anim.t ? anim.f : anim.rf, flip);
				style = ' style="--dx:' + (from.x - q.x) + "px;--dy:" + (from.y - q.y) + "px;animation-delay:-" + el + 'ms"';
				inner = '<g class="ch-anim"' + style + ">" + inner + "</g>";
			}
			out.push('<g transform="translate(' + q.x + "," + q.y + ') scale(' + (SQ / 45) + ')">' + inner + "</g>");
		}
		Object.keys(tg).forEach(function (t) {
			t = +t; var q = sqXY(t, flip);
			if (b[t]) out.push('<circle class="ch-tc" cx="' + (q.x + 50) + '" cy="' + (q.y + 50) + '" r="44"/>');
			else if (S.dots) out.push('<circle class="ch-td" cx="' + (q.x + 50) + '" cy="' + (q.y + 50) + '" r="15"/>');
		});
		// arrows: hint, or the computer's best move when analysis is on
		var arrows = [];
		if (hintMv && vi === null) arrows.push([hintMv.f, hintMv.t, "ch-arh"]);
		if (anal.r && anal.r.best && wantAnalysis() && anal.key === code + ":" + s.hist.join(".")) { var bm = C.mparse(anal.r.best); if (bm) arrows.push([bm.f, bm.t, "ch-ara"]); }
		arrows.forEach(function (a) { out.push(arrow(sqXY(a[0], flip), sqXY(a[1], flip), a[2])); });
		if (drag && drag.moved && b[drag.from]) out.push('<g id="ch-dragp" transform="translate(' + (drag.x - 50) + "," + (drag.y - 60) + ') scale(' + (SQ / 45 * 1.12) + ')">' + pieceSvg(b[drag.from]) + "</g>");
		var bd = $("ch-board");
		bd.innerHTML = '<svg viewBox="0 0 800 800" role="img" aria-label="' + esc(boardLabel(s)) + '"><defs><marker id="ch-ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L10 5L0 10z" class="ch-ahp"/></marker></defs>' + out.join("") + "</svg>";
		bd.classList.toggle("is-live", live);
		if (doAnim) setTimeout(function () { if (anim && Date.now() - anim.t0 >= 280) drawBoard(); }, 300);
	}
	function arrow(a, b, cls) {
		var x1 = a.x + 50, y1 = a.y + 50, x2 = b.x + 50, y2 = b.y + 50, dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1;
		x2 -= dx / L * 22; y2 -= dy / L * 22;
		return '<line class="ch-arrow ' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#ch-ah)"/>';
	}
	function boardLabel(s) {
		var b = C.board64(s), parts = [];
		["K", "Q", "R", "B", "N", "P"].forEach(function (L) {
			var w = [], bl = [];
			b.forEach(function (p, i) { if (p === L) w.push(C.sqName(i)); if (p === L.toLowerCase()) bl.push(C.sqName(i)); });
			var nm = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" }[L];
			if (w.length) parts.push("White " + nm + (w.length > 1 ? "s " : " ") + w.join(" "));
			if (bl.length) parts.push("Black " + nm + (bl.length > 1 ? "s " : " ") + bl.join(" "));
		});
		return parts.join(", ") + ". " + C.playerName(cfg, s.turn) + " to move.";
	}
	var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

	/* clicks + dragging on the 2D board */
	var board = $("ch-board");
	function sqAt(e) {
		var svg = board.querySelector("svg"); if (!svg) return -1;
		var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 800, y = (e.clientY - r.top) / r.height * 800;
		if (x < 0 || y < 0 || x >= 800 || y >= 800) return -1;
		var f = Math.floor(x / SQ), rr = 7 - Math.floor(y / SQ);
		if (bottom() === 1) { f = 7 - f; rr = 7 - rr; }
		return rr * 8 + f;
	}
	function svgXY(e) { var r = board.querySelector("svg").getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 800, y: (e.clientY - r.top) / r.height * 800 }; }
	function ownPiece(i) { var p = C.board64(st)[i]; return p && (p === p.toUpperCase() ? 0 : 1) === st.turn; }
	/** a square was chosen (click / tap / keyboard / 3D pick) -> select, move or deselect; returns true when it moved */
	function chooseSquare(i) {
		if (i < 0) return false;
		if (!canInput()) {
			if (vi !== null) toast("You are looking back at an earlier move: press ⏭ to return.");
			return false;
		}
		if (sel >= 0 && i !== sel) {
			var tg = targetsFrom(st, sel);
			if (tg[i] && !(ownPiece(i) && !castleTo(sel, i))) return tryMove(sel, i);
		}
		if (ownPiece(i)) { sel = sel === i ? -1 : i; render(true); return false; }
		if (sel >= 0) { sel = -1; render(true); }
		return false;
	}
	function castleTo(f, t) { return C.legal(st).some(function (o) { return o.f === f && o.c && o.t === t; }); }
	function tryMove(f, t) {
		var L = C.legal(st).filter(function (o) { return o.f === f && (o.t === t || (o.c && o.k === t)); });
		if (!L.length) return false;
		var exact = L.filter(function (o) { return o.t === t; });
		if (exact.length) L = exact;
		if (L.some(function (o) { return o.pr; })) { askPromo(f, t); return false; }
		return humanMove(L[0]);
	}
	function askPromo(f, t) {
		var box = $("ch-promo"), white = st.turn === 0, flip = bottom() === 1, q = sqXY(t, flip);
		box.innerHTML = ["q", "r", "b", "n"].map(function (p) {
			var L = white ? p.toUpperCase() : p;
			return '<button type="button" data-pr="' + p + '" title="' + { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[p] + '"><svg viewBox="0 0 45 45">' + pieceSvg(L) + "</svg></button>";
		}).join("") + '<button type="button" data-pr="" class="ch-promox" title="Cancel">✕</button>';
		box.style.left = (q.x / 8) + "%";
		box.style.top = (q.y < 400 ? q.y / 8 : Math.max(0, q.y / 8 - 37.5)) + "%";
		box.hidden = false;
		box.dataset.f = f; box.dataset.t = t;
		var b0 = box.querySelector("button"); if (b0) b0.focus();
	}
	$("ch-promo").addEventListener("click", function (e) {
		var b = e.target.closest("[data-pr]"); if (!b) return;
		var box = $("ch-promo"), pr = b.getAttribute("data-pr");
		box.hidden = true;
		if (!pr) { sel = -1; render(true); return; }
		humanMove({ f: +box.dataset.f, t: +box.dataset.t, pr: pr });
	});
	board.addEventListener("pointerdown", function (e) {
		if (e.button !== 0) return;
		kbd = false;
		var i = sqAt(e); if (i < 0) return;
		$("ch-promo").hidden = true;
		if (canInput() && ownPiece(i) && !(sel >= 0 && sel !== i && castleTo(sel, i))) {
			var wasSel = sel === i;
			sel = i;
			var p = svgXY(e);
			drag = { from: i, x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, moved: false, wasSel: wasSel, id: e.pointerId };
			try { board.setPointerCapture(e.pointerId); } catch (er) {}
			render(true);
			e.preventDefault();
		} else chooseSquare(i);
	});
	board.addEventListener("pointermove", function (e) {
		if (!drag || e.pointerId !== drag.id) return;
		var p = svgXY(e);
		drag.x = p.x; drag.y = p.y;
		if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) { drag.moved = true; drawBoard(); return; }
		if (drag.moved) { var g = $("ch-dragp"); if (g) g.setAttribute("transform", "translate(" + (p.x - 50) + "," + (p.y - 60) + ") scale(" + (SQ / 45 * 1.12) + ")"); else drawBoard(); }
	});
	function endDrag(e) {
		if (!drag || (e && e.pointerId !== drag.id)) return;
		var d = drag; drag = null;
		if (d.moved) {
			var i = e ? sqAt(e) : -1;
			if (i >= 0 && i !== d.from && targetsFrom(st, d.from)[i]) { if (!tryMove(d.from, i)) render(true); return; }
			render(true);
		} else if (d.wasSel) { sel = -1; render(true); }
	}
	board.addEventListener("pointerup", endDrag);
	board.addEventListener("pointercancel", function () { drag = null; render(true); });
	board.addEventListener("keydown", function (e) {
		var dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
		if (dir) {
			e.preventDefault(); kbd = true;
			if (kcur < 0) kcur = sel >= 0 ? sel : (bottom() ? 52 : 12);
			var fl = bottom() === 1 ? -1 : 1, f = (kcur & 7) + dir[0] * fl, r = (kcur >> 3) + dir[1] * fl;
			if (f >= 0 && f < 8 && r >= 0 && r < 8) kcur = r * 8 + f;
			render(true);
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault(); kbd = true;
			if (kcur >= 0) chooseSquare(kcur);
		} else if (e.key === "Escape" && sel >= 0) { sel = -1; render(true); }
	});
	board.addEventListener("blur", function () { if (kbd) { kbd = false; render(true); } });
	$("ch-type").addEventListener("keydown", function (e) {
		if (e.key !== "Enter") return;
		var txt = this.value.trim(); if (!txt) return;
		if (!canInput()) { toast(vi !== null ? "Return to the current move first (⏭)." : "It's not your turn."); return; }
		var o = C.parseSan(st, txt);
		if (!o) { toast("\"" + txt + "\" isn't a legal move here (examples: e4, Nf3, exd5, O-O, e8=Q)."); return; }
		this.value = "";
		humanMove(o);
	});

	/* ---------- piece colours (2D and 3D) ---------- */
	var PCOL = { auto: null, cream: ["#f3e2bf", "#5b3a20"], red: ["#f5f5f5", "#b3261e"], blueorange: ["#ffae42", "#1f5fbf"], yellowpurple: ["#ffd84d", "#6a3fb5"], goldsilver: ["#e3b84a", "#9aa6b2"], green: ["#f5f5f5", "#1f7a3a"] };
	function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
	function applyPcol() {
		var c = PCOL[S.pcol] || null, st2 = root.style;
		["--ch-pwf", "--ch-pws", "--ch-pbf", "--ch-pbs", "--ch-pbd", "--ch-pwd"].forEach(function (k) { st2.removeProperty(k); });
		if (c) {
			st2.setProperty("--ch-pwf", c[0]); st2.setProperty("--ch-pbf", c[1]);
			st2.setProperty("--ch-pws", lum(c[0]) > 0.55 ? "#1c1c1c" : "#0b0b0b");
			st2.setProperty("--ch-pbs", lum(c[1]) > 0.55 ? "#2a2a2a" : "#0b0b0b");
			st2.setProperty("--ch-pbd", lum(c[1]) > 0.55 ? "#1c1c1c" : "#ececec");
		}
		pieceCache = {};
		if (v3 && v3.setPieceColors) v3.setPieceColors(c);
	}

	/* ---------- 3D board ---------- */
	var v3 = null, v3loading = false, anim3n = -1, box3 = $("ch-3d");
	function use3d() { return S.dim === "3d"; }
	function ensure3d() {
		if (v3 || v3loading) return;
		if (!window.CH3D) { $("ch-3dmsg").textContent = "3D isn't available here."; return; }
		v3loading = true;
		window.CH3D.create(box3).then(function (v) {
			v3 = v; v3loading = false;
			$("ch-3dmsg").hidden = true;
			v.setRoom(S.room); v.setSet(S.set); v.setCam(S.cam);
			if (PCOL[S.pcol] && v.setPieceColors) v.setPieceColors(PCOL[S.pcol]);
			size3d(); draw3d(true);
		}, function () {
			v3loading = false;
			$("ch-3dmsg").textContent = "3D needs WebGL, which this browser or device doesn't offer. Showing the 2D board.";
			setTimeout(function () { S.dim = "2d"; save(); segSet("ch-dim", "2d"); render(true); }, 2500);
		});
	}
	function size3d() { if (!v3) return; var r = box3.getBoundingClientRect(); if (r.width > 10 && r.height > 10) v3.size(Math.round(r.width), Math.round(r.height)); }
	function draw3d(noAnim) {
		if (!v3) return;
		var s = viewState(), live = canInput() && vi === null, tg = live && sel >= 0 ? targetsFrom(s, sel) : {};
		var chk = C.inCheck(s) ? C.kingSq(s, s.turn) : -1, a = null;
		if (!noAnim && anim && vi === null && anim.n === s.hist.length && anim3n !== anim.n) { a = { f: anim.f, t: anim.t, rf: anim.rf >= 0 ? anim.rf : undefined, rt: anim.rt >= 0 ? anim.rt : undefined }; anim3n = anim.n; }
		v3.setPosition({ b: C.board64(s), flip: bottom() === 1, last: s.last ? { f: s.last.f, t: s.last.t } : null, check: chk, sel: live ? sel : -1, targets: Object.keys(tg).map(Number), anim: a });
	}
	if (window.ResizeObserver) new ResizeObserver(function () { size3d(); }).observe(box3);
	var p3 = { pts: {}, drag: null };
	box3.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	box3.addEventListener("pointerdown", function (e) {
		p3.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
		try { box3.setPointerCapture(e.pointerId); } catch (er) {}
		var n = Object.keys(p3.pts).length;
		p3.drag = { x: e.clientX, y: e.clientY, look: e.button === 2 || e.shiftKey || n > 1, moved: false, d0: 0 };
		if (n === 2) { var a = Object.values(p3.pts); p3.drag.d0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
		e.preventDefault();
	});
	box3.addEventListener("pointermove", function (e) {
		if (!p3.pts[e.pointerId] || !p3.drag || !v3) return;
		var prev = p3.pts[e.pointerId]; p3.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
		var pts = Object.values(p3.pts);
		if (pts.length === 2 && p3.drag.d0) { var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); if (d > 0) { v3.zoom(p3.drag.d0 / d); p3.drag.d0 = d; } }
		if (Math.abs(e.clientX - p3.drag.x) + Math.abs(e.clientY - p3.drag.y) > 6) p3.drag.moved = true;
		if (p3.drag.look) v3.orbit((e.clientX - prev.x) / (pts.length > 1 ? 2 : 1), (e.clientY - prev.y) / (pts.length > 1 ? 2 : 1));
		else if (p3.drag.moved) v3.orbit(e.clientX - prev.x, e.clientY - prev.y);   // a plain drag looks around the board in every camera mode
	});
	function up3(e) {
		var d = p3.drag; delete p3.pts[e.pointerId];
		if (Object.keys(p3.pts).length === 0) p3.drag = null;
		if (!d || d.look || !v3 || e.type === "pointercancel") return;
		if (!d.moved) chooseSquare(v3.pick(e.clientX, e.clientY));
	}
	box3.addEventListener("pointerup", up3);
	box3.addEventListener("pointercancel", up3);
	box3.addEventListener("wheel", function (e) {
		if (!v3) return;
		var full = view.classList.contains("mes-pfill") || document.fullscreenElement;
		if (!e.ctrlKey && !full) return;
		e.preventDefault(); v3.zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08);
	}, { passive: false });
	box3.addEventListener("dblclick", function () { if (v3) v3.resetView(); });

	/* ---------- render ---------- */
	function nameOf(p) {
		var base = C.playerName(cfg, p);
		if (mode === "cpu") return p === human ? "You" : "Computer (" + C.LEVELS[S.lv].name + ")";
		if (mode === "online" && on.g) { var nm = on.g.names[p]; return p === on.seat ? "You" : nm ? esc(nm) : "waiting…"; }
		if (mode === "hive" && hv.R) { var hn = hv.R.players[p]; return hn && hn === hMe() ? "You (@" + esc(hn) + ")" : hn ? "@" + esc(hn) : "waiting…"; }
		return base;
	}
	function youAre(p) { return mySeat() === p; }
	function chip(p) { return '<span class="ch-chip p' + p + '" aria-hidden="true"></span>'; }
	function renderPlayers() {
		var s = viewState(), mat = C.material(s), bot = bottom();
		[[1 - bot, "ch-ptop"], [bot, "ch-pbot"]].forEach(function (q) {
			var p = q[0], el = $(q[1]), lostOther = mat.lost[1 - p], diff = p === 0 ? mat.diff : -mat.diff;
			var caps = lostOther.map(function (L) { return '<svg class="ch-cap" viewBox="0 0 45 45">' + pieceSvg(p === 0 ? L.toLowerCase() : L) + "</svg>"; }).join("");
			var turn = !s.win && s.turn === p, clockHtml = "";
			if (clk && (mode === "cpu" || mode === "local")) {
				var left = clockLeft(p);
				clockHtml = '<span class="ch-clock' + (clk.on === p ? " is-on" : "") + (left < 20000 && clk.on === p ? " is-low" : "") + '">' + fmtClock(left) + "</span>";
			}
			var extra = cfg.v === "T" ? '<span class="ch-checks" title="Checks given">' + s.checks[p] + "/3 checks</span>" : "";
			el.innerHTML = '<span class="ch-pname' + (turn ? " is-turn" : "") + '">' + chip(p) + nameOf(p) + "</span>" + extra + '<span class="ch-caps">' + caps + (diff > 0 ? '<b class="ch-diff">+' + diff + "</b>" : "") + "</span>" + clockHtml;
		});
	}
	function statusText(s) {
		if (mode === "online" && on.g && on.g.status === "wait") return "Waiting for someone to join…";
		if (mode === "hive") {
			if (!hv.R || !hv.R.open) return "Reading the game from Hive…";
			if (hv.R.status === "wait") return "Waiting for a player (Hive game)…";
			if (hv.busy) return "Approve it in Hive Keychain…";
			if (!s.win && hv.pending.length) return "Sent: waiting for the next Hive block…";
		}
		if (s.win) {
			var why = s.win.why, p = s.win.p;
			if (p < 0) return { stalemate: "Draw by stalemate.", fifty: "Draw: 50 moves without a capture or pawn move.", repeat: "Draw: the same position three times.", material: "Draw: not enough material to checkmate.", agreed: "Draw agreed.", "flag-draw": "Draw: time ran out, but the other side can't checkmate." }[why] || "Draw.";
			var W = function (x) { return youAre(x) ? chip(x) + "<b>You win</b>" : chip(x) + nameOf(x) + (mode === "local" || mode === "cpu" && x !== human ? " wins" : " wins"); };
			var other = function (x) { return youAre(x) ? "you" : mode === "cpu" ? "the computer" : C.playerName(cfg, x); };
			if (why === "mate") return W(p) + " by checkmate" + (youAre(p) ? "! 🎉" : ".");
			if (why === "resign") return W(p) + " (" + other(1 - p) + " resigned).";
			if (why === "timeout") return W(p) + " (" + other(1 - p) + (youAre(1 - p) ? " were" : " was") + " away too long).";
			if (why === "flag") return W(p) + " on time.";
			if (why === "left") return W(p) + " (" + other(1 - p) + " left).";
			if (why === "hill") return W(p) + ": the king reached the hill!";
			if (why === "checks") return W(p) + ": three checks!";
			return W(p) + ".";
		}
		if (vi !== null) return "Looking back: move " + vi + " of " + st.hist.length + ".";
		if (busy) return chip(s.turn) + "The computer is thinking…";
		var who = mode === "local" ? C.playerName(cfg, s.turn) : (youAre(s.turn) ? "Your move" : nameOf(s.turn) + " to move");
		return chip(s.turn) + (mode === "local" ? who + " to move" : who) + (C.inCheck(s) ? ": <b>check!</b>" : ".");
	}
	function renderMoves() {
		var ol = $("ch-moves"), h = st.hist, at = vi === null ? h.length : vi, startBlack = /\sb\s/.test(st.fen0), full = parseInt(st.fen0.split(" ")[5], 10) || 1;
		var items = [];
		for (var i = 0; i < h.length; i++) {
			var ply = i + (startBlack ? 1 : 0), num = full + Math.floor(ply / 2);
			var tx = mode === "hive" && hv.R && hv.R.trx.moves[i] ? ' title="Hive transaction ' + esc(hv.R.trx.moves[i]) + '"' : "";
			var btn = '<button type="button" data-mi="' + (i + 1) + '" class="' + (i + 1 === at ? "is-cur" : "") + '"' + tx + ">" + esc(st.sans[i]) + "</button>";
			if (ply % 2 === 0) items.push('<li><span class="ch-mn">' + num + ".</span>" + btn);
			else if (i === 0) items.push('<li><span class="ch-mn">' + num + "…</span>" + btn);
			else items[items.length - 1] += btn;
		}
		ol.innerHTML = items.map(function (x) { return x + "</li>"; }).join("") + (st.win ? '<li class="ch-res">' + C.resultText(st) + "</li>" : "");
		$("ch-rpos").textContent = h.length ? (at === h.length ? "Move " + Math.ceil(at / 2) + " (now)" : "Half-move " + at + " of " + h.length) : "No moves yet";
		var bs = root.querySelectorAll("[data-r]");
		for (i = 0; i < bs.length; i++) { var r = bs[i].getAttribute("data-r"); bs[i].disabled = r === "first" || r === "prev" ? at === 0 : at === h.length; }
		var cur = ol.querySelector(".is-cur");
		if (cur && ol.scrollHeight > ol.clientHeight) cur.scrollIntoView({ block: "nearest" });
	}
	function renderEval() {
		var bar = $("ch-evbar"), show = S.anal && analysisAllowed();
		bar.hidden = !show;
		var note = "";
		if (show) {
			var s = viewState(), r = anal.key === code + ":" + s.hist.join(".") ? anal.r : null;
			if (s.win) { $("ch-evfill").style.height = (s.win.p === 0 ? 100 : s.win.p === 1 ? 0 : 50) + "%"; $("ch-evtxt").textContent = C.resultText(s); }
			else if (r) {
				var vw = s.turn === 0 ? r.v : -r.v, mw = r.mate ? (s.turn === 0 ? r.mate : -r.mate) : 0;
				var pct = mw ? (mw > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-vw / 260)) - 1);
				$("ch-evfill").style.height = pct + "%";
				$("ch-evtxt").textContent = C.evalLabel(vw, mw);
				var st2 = C.replay(cfg, s.hist), bm = r.best && C.san(st2, r.best);
				note = "Computer: " + C.evalLabel(vw, mw) + " for White" + (bm ? " · best move " + bm : "") + (r.pv && r.pv.length > 1 ? " · line " + pvSan(st2, r.pv) : "") + " (" + r.depth + " half-moves deep).";
			} else if (!(mode === "cpu" && s.turn !== human && !s.win)) note = "The computer is looking at the position…";
		}
		$("ch-anote").textContent = note;
	}
	function pvSan(s, pv) { var w = C.replay(cfg, s.hist), out = []; pv.slice(0, 6).forEach(function (m) { if (w && C.isLegal(w, m)) { out.push(C.san(w, m)); C.apply(w, m); } }); return out.join(" "); }
	function render(keepAnal) {
		var s = viewState();
		root.classList.toggle("ch-incpu", S.opp === "cpu" && mode !== "online" && mode !== "hive");
		root.classList.toggle("ch-inlocal", mode === "local");
		root.classList.toggle("ch-3don", use3d());
		$("ch-status").innerHTML = statusText(s);
		if (!keepAnal) runAnalysis();
		board.hidden = use3d();
		box3.hidden = !use3d();
		if (use3d()) { ensure3d(); draw3d(); } else drawBoard();
		renderPlayers();
		renderMoves();
		renderEval();
		var on1 = mode === "online" || mode === "hive";
		$("ch-undo").disabled = on1 || !st.hist.length;
		$("ch-undo").hidden = on1;
		$("ch-new").hidden = on1;
		$("ch-hint").hidden = on1 || !!st.win;
		$("ch-hint").disabled = !canInput();
		$("ch-resign").hidden = on1 || !!st.win || !st.hist.length;
		var canSave = st.win && (mode === "cpu" || mode === "local") && vi === null && ["mate", "stalemate", "fifty", "repeat", "material", "hill", "checks"].indexOf(st.win.why) >= 0;
		$("ch-hsave").hidden = !canSave;
		var savedKey = code + ":" + st.hist.join(".");
		var sv = S.saved[savedKey];
		$("ch-hsave").innerHTML = sv ? "⬢ Saved on Hive" : "⬢ Save result to Hive";
		$("ch-hsave").disabled = !!sv;
		$("ch-hsaved").innerHTML = sv && canSave ? 'Saved (self-reported): <a href="https://hivehub.dev/tx/' + esc(sv) + '" target="_blank" rel="noopener">hivehub</a> · <a href="https://hiveblocks.com/tx/' + esc(sv) + '" target="_blank" rel="noopener">hiveblocks</a>' : "";
		$("ch-hpost").hidden = !(st.win && st.hist.length >= 2 && vi === null);
		renderObar();
		setupLock();
	}

	/* ---------- setup controls ---------- */
	function fillGameSelect() {
		var groups = {}, order = [];
		C.PRESETS.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
		$("ch-game").innerHTML = order.map(function (g) { return '<optgroup label="' + g + '">' + groups[g].map(function (p) { return '<option value="' + p.id + '">' + p.name + "</option>"; }).join("") + "</optgroup>"; }).join("");
		var R = window.CH3D ? window.CH3D.ROOMS : [{ id: "club", name: "Chess club" }], SE = window.CH3D ? window.CH3D.SETS : [{ id: "wood", name: "Wood" }];
		$("ch-room").innerHTML = R.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + "</option>"; }).join("");
		$("ch-set").innerHTML = SE.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + "</option>"; }).join("");
	}
	function syncSetup() {
		$("ch-game").value = C.preset(S.game) ? S.game : "standard";
		segSet("ch-opp", S.opp); segSet("ch-lv", S.lv); segSet("ch-me", S.me); segSet("ch-ofirst", S.ofirst); segSet("ch-dim", S.dim);
		$("ch-clock").value = S.clock || ""; $("ch-dots").checked = S.dots !== false; $("ch-anal").checked = !!S.anal; $("ch-autoflip").checked = !!S.autoflip; $("ch-sound").checked = S.sound !== false;
		$("ch-room").value = S.room; $("ch-set").value = S.set; $("ch-cam").value = S.cam; $("ch-theme").value = S.theme; $("ch-pcol").value = PCOL.hasOwnProperty(S.pcol) ? S.pcol : "auto";
		root.setAttribute("data-theme", S.theme);
		var p = C.preset(S.game) || C.PRESETS[0];
		$("ch-desc").textContent = p.desc + (S.opp === "cpu" ? " Computer: " + C.LEVELS[S.lv].name + " (about " + C.LEVELS[S.lv].elo + " strength)." : "");
		$("ch-ovar").textContent = p.name;
		$("ch-name").value = S.name || "";
		$("ch-opub").checked = S.opub !== false;
		$("ch-ht").value = String(S.ht || 5);
	}
	function segSet(id, v) { var bs = $(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === v ? "true" : "false"); }
	function segWire(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b || b.disabled) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); }); }
	function setupLock() {
		var lock = mode === "online" || mode === "hive", els = $("ch-setup").querySelectorAll("select, input, button");
		for (var i = 0; i < els.length; i++) if (["ch-dots", "ch-anal", "ch-sound", "ch-autoflip"].indexOf(els[i].id) < 0) els[i].disabled = lock;
	}
	fillGameSelect();
	$("ch-game").addEventListener("change", function () { S.game = this.value; save(); syncSetup(); newGame(); });
	segWire("ch-opp", function (v) { S.opp = v; save(); syncSetup(); newGame(); });
	segWire("ch-lv", function (v) { S.lv = v; save(); syncSetup(); if (mode === "cpu" && st.hist.length && !st.win) toast("The new level plays from the computer's next move."); render(true); });
	segWire("ch-me", function (v) { S.me = v; save(); newGame(); });
	segWire("ch-ofirst", function (v) { S.ofirst = v; save(); });
	segWire("ch-dim", function (v) { S.dim = v; save(); render(true); });
	$("ch-clock").addEventListener("change", function () { S.clock = this.value; save(); if (!st.hist.length || st.win) newGame(); else toast("The clock applies from the next game."); });
	$("ch-dots").addEventListener("change", function () { S.dots = this.checked; save(); render(true); });
	$("ch-anal").addEventListener("change", function () { S.anal = this.checked; save(); anal.key = ""; if (S.anal && mode === "cpu") assisted = true; render(); });
	$("ch-autoflip").addEventListener("change", function () { S.autoflip = this.checked; save(); render(true); });
	$("ch-sound").addEventListener("change", function () { S.sound = this.checked; save(); });
	$("ch-room").addEventListener("change", function () { S.room = this.value; save(); if (v3) v3.setRoom(S.room); });
	$("ch-set").addEventListener("change", function () { S.set = this.value; save(); if (v3) { v3.setSet(S.set); draw3d(true); } });
	$("ch-cam").addEventListener("change", function () { S.cam = this.value; save(); if (v3) v3.setCam(S.cam); });
	$("ch-pcol").addEventListener("change", function () { S.pcol = this.value; save(); applyPcol(); render(true); });
	$("ch-view3").addEventListener("click", function () { if (v3) v3.resetView(); });
	$("ch-theme").addEventListener("change", function () { S.theme = this.value; save(); root.setAttribute("data-theme", S.theme); });
	$("ch-flip").addEventListener("click", function () { S.flipX = !S.flipX; save(); render(true); });
	$("ch-new").addEventListener("click", newGame);
	$("ch-undo").addEventListener("click", undo);
	$("ch-hint").addEventListener("click", hint);
	$("ch-resign").addEventListener("click", resign);
	root.querySelector(".ch-rbtns").addEventListener("click", function (e) {
		var b = e.target.closest("[data-r]"); if (!b) return;
		var n = st.hist.length, at = vi === null ? n : vi, r = b.getAttribute("data-r");
		at = r === "first" ? 0 : r === "prev" ? at - 1 : r === "next" ? at + 1 : n;
		vi = at >= n ? null : Math.max(0, at); sel = -1;
		render();
	});
	$("ch-moves").addEventListener("click", function (e) {
		var b = e.target.closest("[data-mi]"); if (!b) return;
		var at = +b.getAttribute("data-mi");
		vi = at >= st.hist.length ? null : at; sel = -1;
		render();
	});
	function shareLink() {
		var at = vi === null ? st.hist.length : vi;
		return location.origin + location.pathname + "?v=" + encodeURIComponent(code) + (at ? "&m=" + st.hist.slice(0, at).join(".") : "");
	}
	$("ch-link").addEventListener("click", function () { copy(shareLink(), "Link copied: it opens this game at this move."); });
	function players() {
		var nm = function (p) { if (mode === "cpu") return p === human ? (hMe() ? "@" + hMe() : "You") : "MES Chess computer (" + C.LEVELS[S.lv].name + ")"; if (mode === "online" && on.g) return on.g.names[p] || "?"; if (mode === "hive" && hv.R) return hv.R.players[p] ? "@" + hv.R.players[p] : "?"; return C.playerName(cfg, p); };
		return { white: nm(0), black: nm(1) };
	}
	function pgnText() { var pl = players(); return C.pgn(st, { white: pl.white, black: pl.black, event: mode === "hive" ? "MES Chess on Hive" : mode === "online" ? "MES Chess online" : "MES Chess" }); }
	$("ch-pgn").addEventListener("click", function () { copy(pgnText(), "PGN copied."); });
	$("ch-dl").addEventListener("click", function () {
		var a = document.createElement("a"), blob = new Blob([pgnText()], { type: "application/x-chess-pgn" });
		a.href = URL.createObjectURL(blob); a.download = "mes-chess-" + new Date().toISOString().slice(0, 10) + ".pgn";
		document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	});
	$("ch-load").addEventListener("click", function () { var b = $("ch-loadbox"); b.hidden = !b.hidden; if (!b.hidden) $("ch-loadtxt").focus(); });
	$("ch-loadx").addEventListener("click", function () { $("ch-loadbox").hidden = true; });
	$("ch-loadfile").addEventListener("change", function () { var f = this.files && this.files[0]; if (!f) return; f.text().then(function (t) { $("ch-loadtxt").value = t; loadText(t); }); this.value = ""; });
	$("ch-loadgo").addEventListener("click", function () { loadText($("ch-loadtxt").value); });
	function loadText(t) {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		t = String(t || "").trim();
		if (!t) return toast("Paste a PGN or a FEN first.");
		var isFen = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]/.test(t), c, moves = [];
		if (isFen) {
			var err = C.validateFen(t);
			if (err) return toast("That FEN isn't valid: " + err);
			c = C.parseCode("X" + t.split(/\s+/).slice(0, 6).join("_"));
			if (!c) return toast("That position can't be used.");
		} else {
			var r = C.parsePgn(t);
			if (r.error && !r.moves.length && !r.cfg) return toast(r.error);
			c = r.cfg; moves = r.moves;
			if (r.error) toast(r.error);
		}
		$("ch-loadbox").hidden = true;
		mode = S.opp;
		var s0 = C.replay(c, moves);
		human = mode === "cpu" ? (s0 ? s0.turn : 0) : 0;
		setGame(c, moves, { human: human, keepMode: true });
		if (!/move/i.test(String((C.parsePgn(t) || {}).error || "")) || isFen) toast(isFen ? "Position loaded: " + C.playerName(c, st.turn) + " to move." : "Game loaded (" + moves.length + " half-moves).");
	}

	/* ---------- fill window / full screen (shared panel-view.js) ---------- */
	var view = $("ch-view");
	function addPanel() {
		if (window.MESPanel && !view.__mesPanel) window.MESPanel.add(view, { bar: $("ch-pbar"), stage: $("ch-stage"), onChange: function () { render(true); setTimeout(size3d, 60); } });
	}
	addPanel();
	if (!view.__mesPanel) document.addEventListener("DOMContentLoaded", addPanel);
	window.addEventListener("load", addPanel);
	function panelBtn(n) { var b = view.querySelectorAll(".mes-pbtn")[n]; if (b) b.click(); }
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("ch-p-play").hidden) return;
		var k = e.key.toLowerCase();
		if (k === "n" && mode !== "online" && mode !== "hive") newGame();
		else if (k === "u") undo();
		else if (k === "h") hint();
		else if (k === "r") { S.flipX = !S.flipX; save(); render(true); }
		else if (k === "d") { S.dim = S.dim === "3d" ? "2d" : "3d"; save(); segSet("ch-dim", S.dim); render(true); }
		else if (k === "w") panelBtn(0);
		else if (k === "f") panelBtn(1);
		else if (t !== board && (e.key === "ArrowLeft" || e.key === "ArrowRight") && st.hist.length) {
			var n = st.hist.length, at = vi === null ? n : vi;
			at += e.key === "ArrowLeft" ? -1 : 1;
			vi = at >= n ? null : Math.max(0, at); sel = -1;
			render();
		}
	});

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll(".ch-tab");
	function showTab(name, focus) {
		for (var i = 0; i < tabs.length; i++) {
			var on1 = tabs[i].getAttribute("data-t") === name;
			tabs[i].setAttribute("aria-selected", on1 ? "true" : "false");
			tabs[i].tabIndex = on1 ? 0 : -1;
			$("ch-p-" + tabs[i].getAttribute("data-t")).hidden = !on1;
			if (on1 && focus) tabs[i].focus();
		}
		if (name === "online") { loadLobby(); loadHiveLobby(); renderHiveCard(); loadRecent(); }
		if (name === "stats") renderStats();
		if (name === "play") setTimeout(size3d, 30);
		lobbyTimer(name === "online");
	}
	$("ch-tabs").addEventListener("click", function (e) { var b = e.target.closest(".ch-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("ch-tabs").addEventListener("keydown", function (e) {
		var arr = Array.prototype.slice.call(tabs), i = arr.indexOf(document.activeElement);
		if (i < 0) return;
		var j = e.key === "ArrowRight" ? (i + 1) % arr.length : e.key === "ArrowLeft" ? (i + arr.length - 1) % arr.length : e.key === "Home" ? 0 : e.key === "End" ? arr.length - 1 : -1;
		if (j >= 0) { e.preventDefault(); showTab(arr[j].getAttribute("data-t"), true); }
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var box = $("ch-stats"), keys = Object.keys(S.stats);
		if (!keys.length) { box.innerHTML = '<p class="ch-sub">No finished games yet. Play one against the computer or online and it shows up here.</p>'; return; }
		var LV = { easy: "Easy computer", medium: "Medium computer", hard: "Hard computer", expert: "Expert computer", online: "Online (guest)", hive: "On Hive" }, VN = { S: "Standard", F: "Chess960", K: "King of the Hill", T: "Three-check", X: "From a position" };
		var tot = [0, 0, 0];
		keys.sort();
		var rows = keys.map(function (k) {
			var a = S.stats[k], parts = k.split("|"), n = a[0] + a[1] + a[2];
			tot[0] += a[0]; tot[1] += a[1]; tot[2] += a[2];
			return "<tr><td>" + esc(VN[parts[0]] || parts[0]) + "</td><td>" + (LV[parts[1]] || esc(parts[1])) + "</td><td>" + n + '</td><td class="w">' + a[0] + "</td><td>" + a[1] + '</td><td class="l">' + a[2] + "</td><td>" + bar(a) + "</td></tr>";
		}).join("");
		box.innerHTML = '<div style="overflow-x:auto"><table class="ch-stbl"><thead><tr><th>Game</th><th>Against</th><th>Played</th><th>Won</th><th>Drawn</th><th>Lost</th><th></th></tr></thead><tbody>' + rows +
			'</tbody><tfoot><tr><th>All games</th><th></th><th style="text-align:right">' + (tot[0] + tot[1] + tot[2]) + '</th><th style="text-align:right">' + tot[0] + '</th><th style="text-align:right">' + tot[1] + '</th><th style="text-align:right">' + tot[2] + "</th><th>" + bar(tot) + "</th></tr></tfoot></table></div>" +
			'<p><button type="button" class="tu-btn" id="ch-sreset">Reset statistics</button></p>';
		$("ch-sreset").addEventListener("click", function () { if (confirm("Delete all your chess statistics in this browser?")) { S.stats = {}; save(); renderStats(); } });
	}
	function bar(a) { var n = a[0] + a[1] + a[2] || 1; return '<span class="ch-bar" title="' + Math.round(a[0] * 100 / n) + '% won"><i class="bw" style="width:' + a[0] * 100 / n + '%"></i><i class="bd" style="width:' + a[1] * 100 / n + '%"></i><i class="bl" style="width:' + a[2] * 100 / n + '%"></i></span>'; }

	/* ---------- rules ---------- */
	function renderRules() {
		var mv = [["K", "King", "One square in any direction. It may never move into check. Once per game it may castle: two squares towards a rook that hasn't moved, with the rook jumping to the square it crossed (not out of, through or into check, and with nothing in between)."],
			["Q", "Queen", "Any number of squares in a straight line: along ranks, files or diagonals."],
			["R", "Rook", "Any number of squares along a rank or a file."],
			["B", "Bishop", "Any number of squares diagonally, so it stays on its colour."],
			["N", "Knight", "An L shape: two squares one way and one to the side. The only piece that jumps over others."],
			["P", "Pawn", "One square forward (two from its starting square), capturing one square diagonally forward. En passant: a pawn that just moved two squares can be captured as if it had moved one. On the last rank it becomes a queen, rook, bishop or knight."]];
		$("ch-rules").innerHTML = '<div class="ch-rule"><h3>The goal</h3><p>Checkmate: attack the other king so that it can\'t escape. White moves first, then the players take turns. A player whose king is attacked (in check) must get out of check at once.</p></div>' +
			mv.map(function (r) { return '<div class="ch-rule ch-rulep"><svg viewBox="0 0 45 45" aria-hidden="true">' + pieceSvg(r[0]) + "</svg><div><h3>" + r[1] + "</h3><p>" + r[2] + "</p></div></div>"; }).join("") +
			'<div class="ch-rule"><h3>Draws</h3><p>Stalemate (the player to move has no legal move but isn\'t in check), the same position three times, 50 moves by each side with no capture and no pawn move, not enough material left to checkmate, or both players agreeing.</p></div>' +
			C.PRESETS.slice(1).map(function (p) { return '<div class="ch-rule"><h3>' + p.name + "</h3><p>" + p.desc + '</p><button type="button" class="ch-vb" data-play="' + p.id + '">Play this</button></div>'; }).join("");
	}
	$("ch-rules").addEventListener("click", function (e) {
		var b = e.target.closest("[data-play]"); if (!b) return;
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		S.game = b.getAttribute("data-play"); save(); syncSetup(); showTab("play"); newGame();
		window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
	});

	/* ---------- toast / copy ---------- */
	var toastT = null;
	function toast(msg, html) { var t = $("ch-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, html ? 6000 : 3200); }
	function copy(text, msg) {
		var done = function () { toast(msg || "Copied."); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); } ta.remove(); }
	}

	/* ===================================================================== guest online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, sending: false, timer: null, fails: 0 };
	var API = "/api/chess";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("ch-name").value || "").trim().slice(0, 24); return n || S.guest || (S.guest = "Guest " + (100 + Math.floor(Math.random() * 900))); }
	$("ch-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("ch-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("ch-ht").addEventListener("change", function () { S.ht = +this.value; save(); });
	$("ch-ochange").addEventListener("click", function () { showTab("play"); $("ch-game").focus(); });
	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.fails = 0;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online";
		setGame(C.parseCode(r.g.v), r.g.moves, { keepMode: true });
		applyServerWin();
		render();
		showTab("play");
		poll(0);
	}
	$("ch-ocreate").addEventListener("click", function () {
		if (mode === "online" || mode === "hive") return toast("You are already in an online game.");
		var c = setupCfg();
		S.name = ($("ch-name").value || "").trim().slice(0, 24); save();
		var b = this; b.disabled = true;
		api("POST", { act: "new", v: C.cfgCode(c), name: myName(), pub: $("ch-opub").checked, first: S.ofirst }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			startOnline(r);
		});
	});
	function join(id) {
		if (mode === "online" && on.id === id) { showTab("play"); return; }
		if (mode === "online" || mode === "hive") return toast("Leave your current online game first.");
		api("POST", { act: "join", id: id, name: myName() }).then(function (r) {
			if (r.error) { toast(r.error); loadLobby(); return; }
			startOnline(r);
			toast("You joined " + (r.g.names[1 - r.seat] || "the game") + ". You play " + C.playerName(cfg, r.seat) + ".");
		});
	}
	function leaveOnline() {
		clearTimeout(on.timer);
		on.id = null; on.g = null; S.online = null; save();
		mode = S.opp; newGame();
	}
	function inviteLink() { return location.origin + location.pathname + "?join=" + on.id; }
	function renderObar() {
		var box = $("ch-obar");
		if (mode === "hive") return renderHbar();
		if (mode !== "online" || !on.g) { box.hidden = true; return; }
		box.hidden = false;
		var g = on.g, other = g.names[1 - on.seat], h = "";
		if (g.status === "wait") {
			h = '<span><span class="ch-dot"></span>Waiting for a player. Send them this link:</span><span class="ch-vbtns"><button type="button" class="ch-vb ch-vb--main" data-o="copy">🔗 Copy invite link</button>' +
				(navigator.share ? '<button type="button" class="ch-vb" data-o="share">Share…</button>' : "") + '<button type="button" class="ch-vb" data-o="cancel">Cancel game</button></span>';
		} else {
			var away = g.status === "play" && st.turn !== on.seat && (g.idle || 0) > 180000;
			h = '<span><span class="ch-dot' + (on.fails > 2 ? " is-off" : "") + '"></span>Online vs <b>' + esc(other || "?") + "</b>" + (on.fails > 2 ? " (reconnecting…)" : "") + '</span><span class="ch-vbtns">';
			if (g.status === "play") {
				if (g.offer === 1 - on.seat) h += '<button type="button" class="ch-vb ch-vb--main" data-o="accept">½ Accept their draw offer</button>';
				else if (g.offer === on.seat) h += '<span class="ch-sub">Draw offered…</span>';
				else if (st.hist.length >= 2) h += '<button type="button" class="ch-vb" data-o="offer">½ Offer a draw</button>';
				if (away) h += '<button type="button" class="ch-vb ch-vb--main" data-o="claim">Claim the win (they are away)</button>';
				h += '<button type="button" class="ch-vb" data-o="resign">Resign</button>';
			} else h += '<button type="button" class="ch-vb ch-vb--main" data-o="rematch">↺ Rematch</button>';
			h += '<button type="button" class="ch-vb" data-o="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("ch-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var a = b.getAttribute("data-o");
		if (a === "copy") return copy(inviteLink(), "Invite link copied: send it to the other player.");
		if (a === "share") return navigator.share({ title: "Play chess with me", text: "Join my chess game: " + C.describe(cfg), url: inviteLink() }).catch(function () {});
		if (a === "cancel" || a === "leave") {
			if (a === "leave" && on.g && on.g.status === "play" && !confirm("Leave the game? It counts as resigning.")) return;
			api("POST", { act: a === "cancel" ? "cancel" : "leave", id: on.id, key: on.key });
			leaveOnline();
			return;
		}
		if (a === "resign" && !confirm("Resign this game?")) return;
		b.disabled = true;
		api("POST", { act: a, id: on.id, key: on.key }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			if (a === "offer") toast("Draw offered.");
			sync(r.g);
		});
	});
	function onlineMove(m) {
		var n = st.hist.length;
		on.sending = true;
		C.apply(st, m); vi = null; animFor(); sound();
		render();
		api("POST", { act: "move", id: on.id, key: on.key, n: n, m: C.mstr(m) }).then(function (r) {
			on.sending = false;
			if (r.error) { toast(r.error); refetch(); return; }
			sync(r.g);
			if (st.win) finish();
		});
	}
	function refetch() { api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) sync(r.g); }); }
	function applyServerWin() {
		var g = on.g;
		if (g && g.status === "over" && g.win && !st.win) st.win = { p: g.win.p, line: null, lines: [], why: g.win.why };
	}
	function sync(g) {
		if (!g || !on.id || g.id !== on.id) return;
		var prev = on.g, wasOver = st.win;
		on.g = g;
		if (!prev || prev.round !== g.round || g.v !== code || g.moves.length < st.hist.length || g.moves.slice(0, st.hist.length).join() !== st.hist.join()) {
			if (prev && prev.round !== g.round) { on.seat = 1 - on.seat; S.online.seat = on.seat; save(); toast("Rematch! You play " + C.playerName(cfg, on.seat) + " now."); }
			cfg = C.parseCode(g.v) || cfg; code = C.cfgCode(cfg);
			st = C.replay(cfg, g.moves) || C.create(cfg);
			wasOver = null;
		} else {
			var grew = false;
			for (var i = st.hist.length; i < g.moves.length; i++) {
				if (!C.apply(st, g.moves[i])) { st = C.replay(cfg, g.moves) || st; break; }
				grew = true;
			}
			if (grew) { animFor(); sound(); }
		}
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Someone") + " joined. " + (st.turn === on.seat ? "Your move!" : "They play White."));
		if (prev && g.offer === 1 - on.seat && prev.offer !== g.offer) toast((g.names[1 - on.seat] || "They") + " offer a draw.");
		applyServerWin();
		render();
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
		var waitingOn = g.status === "wait" || st.turn !== on.seat;
		return hidden ? 6000 : waitingOn ? 1200 : 4000;
	}
	document.addEventListener("visibilitychange", function () { if (!document.hidden && on.id) poll(50); });

	var lobT = null;
	function lobbyTimer(onTab) { clearInterval(lobT); if (onTab) lobT = setInterval(function () { if (!document.hidden) { loadLobby(); loadHiveLobby(); } }, 8000); }
	function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
	function firstText(f) { return f === "host" ? "you play Black" : f === "guest" ? "you play White" : "random colours"; }
	function codeName(v) { var c = C.parseCode(v); return c ? C.describe(c) : v; }
	function paceText(t) { return { 5: "5 min a move", 15: "15 min a move", 60: "1 hour a move", 1440: "1 day a move", 4320: "3 days a move" }[t] || ""; }
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("ch-lobby");
			if (r.error) { box.innerHTML = '<p class="ch-sub">' + esc(r.error) + "</p>"; return; }
			var list = (r.open || []).filter(function (o) { return o.id !== on.id; });
			if (!list.length) { box.innerHTML = '<p class="ch-sub">No open games right now. Make one above, it will show up here for others.</p>'; return; }
			box.innerHTML = '<ul class="ch-lob">' + list.map(function (o) {
				return '<li><span class="ch-lobn">' + esc(o.name || "Guest") + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · " + firstText(o.first) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>';
			}).join("") + "</ul>";
		});
	}
	$("ch-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) join(b.getAttribute("data-join")); });
	$("ch-orefresh").addEventListener("click", loadLobby);

	/* ===================================================================== Hive games ===================================================================== */
	var H = C.hive;
	var hv = { host: null, gid: null, R: null, pending: [], timer: null, joiners: [], busy: false, ops: {}, lastErr: 0, reOffer: null, listed: false };
	var HA = MOCK ? mockHive() : realHive();
	function realHive() {
		var M = function () { return window.MESHive || null; };
		return {
			user: function () { var u = M() && M().user(); return u ? u.name : ""; },
			login: function (n) { return M() ? M().login(n) : Promise.reject(new Error("The Hive helpers did not load: reload the page.")); },
			logout: function () { if (M()) M().logout(); },
			onChange: function (f) { if (M()) M().onChange(f); else window.addEventListener("load", function () { if (M()) M().onChange(f); }); },
			help: function () { return M() ? M().helpHtml() : ""; },
			kc: function () { return M() ? M().keychain() : Promise.resolve(null); },
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
		function chain() { try { return JSON.parse(localStorage.getItem("mes-chess:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-chess:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-chess:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-chess:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			kc: function () { return Promise.resolve(null); },
			send: function (obj) {
				var me = this.user(), c = chain(), now = Date.now(), trx = Math.random().toString(16).slice(2, 12) + Math.random().toString(16).slice(2, 12);
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19),
					op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-chess:hchain", JSON.stringify(c));
				return new Promise(function (r) { setTimeout(function () { r({ trx: trx }); }, 300); });
			},
			ops: function (acct) {
				var cut = Math.floor(Date.now() / 3000);
				return Promise.resolve(H.parse(chain().filter(function (e) { return e[1].block <= cut && e[1].op[1].required_posting_auths[0] === acct; }), acct));
			}
		};
	}
	function hMe() { return HA.user(); }
	function hLink(host, gid) { return location.origin + location.pathname + "?hive=" + host + "/" + gid; }
	function txLinks(trx) { return trx ? '<a href="https://hivehub.dev/tx/' + esc(trx) + '" target="_blank" rel="noopener">hivehub</a> · <a href="https://hiveblocks.com/tx/' + esc(trx) + '" target="_blank" rel="noopener">hiveblocks</a>' : ""; }

	function renderHiveCard() {
		var box = $("ch-hlogin"), me = hMe();
		$("ch-hmake").hidden = !me;
		$("ch-hvar").textContent = (C.preset(S.game) || C.PRESETS[0]).name;
		if (me) {
			box.innerHTML = '<p class="ch-hwho">Signed in as ' + (MOCK ? "" : '<img alt="" src="https://images.hive.blog/u/' + esc(me) + '/avatar/small">') + "<b>@" + esc(me) + '</b> <button type="button" class="tu-btn" id="ch-hlogout">Log out</button></p>';
			$("ch-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="ch-hrow"><input class="tu-input" id="ch-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="ch-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed (no Keychain on this local copy)." : "Keychain proves you own the account by signing a message with your posting key; your keys never leave Keychain and mes.fm never sees them.") + "</p>";
			var go = function () {
				var b = $("ch-hlogin-b"); b.disabled = true; b.textContent = "Check Keychain…";
				HA.login($("ch-huser").value).then(function () { toast("Logged in."); }, function (e) {
					b.disabled = false; b.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test(e.message + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			$("ch-hlogin-b").addEventListener("click", go);
			$("ch-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("ch-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(true); });

	function hiveCreate() {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode === "online" || mode === "hive") return toast("Leave the game you are in first.");
		var c = setupCfg();
		var to = ($("ch-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast(to === me ? "You can't challenge yourself." : "That isn't a Hive username.");
		var obj = { a: "open", g: H.newGid(), v: C.cfgCode(c), f: S.ofirst, t: +$("ch-ht").value || 5 };
		if (to) obj.to = to;
		var b = $("ch-hcreate"); b.disabled = true;
		HA.send(obj, to ? "Challenge @" + to + " to a game of chess" : "Open a chess game").then(function (r) {
			b.disabled = false;
			hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]);
			register("hopen", { host: hMe(), g: obj.g });
			toast(obj.to ? "Challenge sent: copy the link above the board and send it to @" + obj.to + "." : "Your game is open: it will show up under Open Hive games.");
		}, function (e) { b.disabled = false; toast(e.message); });
	}
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
		if (!me) { showTab("online"); toast("Log in with Hive first, then press Join again."); return; }
		if (host === me) return hiveEnter(host, gid, []);
		toast("Checking the game on Hive…");
		Promise.all([HA.ops(host, 0), HA.ops(me, 0)]).then(function (res) {
			var R = H.build(host, gid, res[0].concat(res[1]), Date.now());
			if (!R.open) return toast("That Hive game wasn't found (it may not be in a block yet: try again in a few seconds).");
			if (R.guest === me || R.status !== "wait") return hiveEnter(host, gid, []);
			if (R.open.to && R.open.to !== me) return toast("That game is a challenge for @" + R.open.to + ".");
			var obj = { a: "join", h: host, g: gid };
			HA.send(obj, "Join @" + host + "'s chess game").then(function (r) {
				hiveEnter(host, gid, [pend(obj, r.trx)]);
				register("hjoin", { host: host, g: gid, acct: me });
			}, function (e) { toast(e.message); });
		}, function () { toast("No Hive node answered: try again."); });
	}
	function hiveEnter(host, gid, pending) {
		clearTimeout(hv.timer);
		hv.host = host; hv.gid = gid; hv.R = null; hv.pending = pending || []; hv.joiners = []; hv.reOffer = null; hv.listed = false; hv.busy = false; hv.ops = {};
		S.hive = { host: host, gid: gid }; save();
		mode = "hive"; clk = null;
		showTab("play");
		hivePoll(0);
		render();
	}
	function hiveLeave() {
		clearTimeout(hv.timer);
		hv.host = null; hv.R = null; S.hive = null; save();
		mode = S.opp; newGame();
	}
	function hivePoll(delay) { clearTimeout(hv.timer); hv.timer = setTimeout(hiveRefresh, delay); }
	function hiveRefresh() {
		if (mode !== "hive" || !hv.host) return;
		var me = hMe(), R = hv.R, accts = [hv.host];
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
		if (R.status === "play") return R.turnAcct === hMe() ? 6000 : (R.open && R.open.t >= 1440 ? 20000 : 3000);
		return 6000;
	}
	function hiveRebuild() {
		var all = [];
		Object.keys(hv.ops).forEach(function (a) { all = all.concat(hv.ops[a]); });
		var now = Date.now();
		hv.pending = hv.pending.filter(function (p) {
			var seen = all.some(function (o) { return (p.trx && o.trx === p.trx) || (o.acct === p.acct && o.a === p.a && o.g === p.g && o.n === p.n); });
			return !seen && now - p.ts < 120000;
		});
		var R = H.build(hv.host, hv.gid, all.concat(hv.pending), now);
		var prev = hv.R;
		hv.R = R;
		if (R.cfg && (!cfg || C.cfgCode(R.cfg) !== code)) { cfg = R.cfg; code = C.cfgCode(cfg); }
		var was = st && st.win;
		var sameGame = prev && prev.open && R.open && prev.open.g === R.open.g;
		var grew = sameGame && prev.s && R.s && R.s.hist.length > prev.s.hist.length;
		st = R.s ? R.s : C.create(cfg || { v: "S" });
		if (sameGame && was) st._fin = true;
		if (grew) { animFor(); sound(); }
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined. " + (R.turnAcct === hMe() ? "Your move!" : "They play White."));
		hv.reOffer = null;
		if (R.status === "over") {
			var other = R.players[0] === hMe() ? R.players[1] : R.players[0];
			var mine = H.myGames(other, hv.ops[other] || []).filter(function (g) { return g.re === hv.host + "/" + hv.gid && g.role === "host"; });
			if (mine.length) hv.reOffer = mine[0];
		}
		render();
		if (st.win && !st._fin) finish();
	}
	function hiveSend(obj, label) {
		hv.busy = true; render(true);
		return HA.send(obj, label).then(function (r) {
			hv.busy = false;
			hv.pending.push(pend(obj, r.trx));
			hiveRebuild();
			hivePoll(2500);
		}, function (e) { hv.busy = false; render(true); toast(e.message); throw e; });
	}
	function hiveMove(o) {
		hiveSend({ a: "mv", h: hv.host, g: hv.gid, n: st.hist.length, m: C.mstr(o) }, "Chess move " + C.san(st, o) + " vs @" + hiveOther()).catch(function () {});
	}
	function hiveOther() { var R = hv.R, me = hMe(); if (!R) return ""; return R.players[0] === me ? (R.players[1] || "") : (R.players[0] || R.open && R.open.to || ""); }
	function renderHbar() {
		var box = $("ch-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h, link = '<span class="ch-chain">On Hive · game <a href="https://hivehub.dev/@' + esc(hv.host) + '" target="_blank" rel="noopener">@' + esc(hv.host) + "</a>/" + esc(hv.gid) + (R && R.open ? " · " + paceText(R.open.t) : "") + "</span>";
		if (!R || !R.open) h = '<span><span class="ch-dot is-off"></span>Reading the game from Hive…</span><span class="ch-vbtns"><button type="button" class="ch-vb" data-h="leave">Leave</button></span>';
		else if (R.status === "wait") {
			h = '<span><span class="ch-dot"></span>' + (R.open.to ? "Waiting for @" + esc(R.open.to) + " to accept" : "Waiting for someone on Hive to join") + ".</span>" + link + '<span class="ch-vbtns">' +
				(me && me !== hv.host && (!R.open.to || R.open.to === me) ? '<button type="button" class="ch-vb ch-vb--main" data-h="join">Join this game</button>' : "") +
				'<button type="button" class="ch-vb' + (me === hv.host ? " ch-vb--main" : "") + '" data-h="copy">🔗 Copy invite link</button>' + (hv.host === me ? '<button type="button" class="ch-vb" data-h="cancel">Cancel game</button>' : "") + '<button type="button" class="ch-vb" data-h="leave">Leave</button></span>';
		} else if (R.status === "cancelled" || R.status === "expired") {
			h = "<span>This Hive game was " + (R.status === "cancelled" ? "cancelled" : "never joined (open games last an hour)") + '.</span><span class="ch-vbtns"><button type="button" class="ch-vb" data-h="leave">Close</button></span>';
		} else {
			var other = hiveOther(), seat = R.players.indexOf(me), mine = seat >= 0;
			h = '<span><span class="ch-dot' + (Date.now() - hv.lastErr < 10000 ? " is-off" : "") + '"></span>' + (mine ? "Hive game vs <b>@" + esc(other) + "</b>" : "Watching <b>@" + esc(R.players[0]) + "</b> vs <b>@" + esc(R.players[1]) + "</b>") + "</span>" + link + '<span class="ch-vbtns">';
			if (R.status === "play" && mine) {
				var offerOk = R.offer && R.s.hist.length <= R.offer.n + 1;
				if (offerOk && R.offer.seat !== seat) h += '<button type="button" class="ch-vb ch-vb--main" data-h="dra">½ Accept @' + esc(other) + "'s draw offer</button>";
				else if (offerOk && R.offer.seat === seat) h += '<span class="ch-sub">Draw offered…</span>';
				else if (R.s.hist.length >= 2) h += '<button type="button" class="ch-vb" data-h="dro">½ Offer a draw</button>';
				if (R.turnAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="ch-vb ch-vb--main" data-h="claim">Claim the win (out of time)</button>';
				h += '<button type="button" class="ch-vb" data-h="resign">Resign</button>';
			} else if (R.status === "over" && mine) {
				if (hv.reOffer) h += '<button type="button" class="ch-vb ch-vb--main" data-h="accept">Accept @' + esc(other) + "'s rematch</button>";
				else h += '<button type="button" class="ch-vb ch-vb--main" data-h="rematch">↺ Offer a rematch</button>';
			}
			h += '<button type="button" class="ch-vb" data-h="leave">Leave</button></span>';
			if (R.status === "over" && R.trx) {
				h += '<details class="ch-trx"><summary>On the chain (' + (R.trx.moves.length + 2) + ' transactions)</summary><ul>' +
					"<li>Open: " + txLinks(R.trx.open) + "</li><li>Join: " + txLinks(R.trx.join) + "</li>" +
					R.trx.moves.map(function (t, i) { return "<li>Move " + (i + 1) + " (" + esc(st.sans[i] || "") + "): " + txLinks(t) + "</li>"; }).join("") +
					(R.trx.end && R.trx.moves.indexOf(R.trx.end) < 0 ? "<li>End (" + esc(R.win ? R.win.why : "") + "): " + txLinks(R.trx.end) + "</li>" : "") + "</ul></details>";
			}
		}
		box.innerHTML = h;
	}
	$("ch-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h"), R = hv.R;
		if (a === "copy") return copy(hLink(hv.host, hv.gid), "Invite link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "join") return hiveJoin(hv.host, hv.gid);
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open chess game").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive game? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign chess vs @" + hiveOther()).catch(function () {}); return; }
		if (a === "claim") return hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win: @" + hiveOther() + " ran out of time").catch(function () {});
		if (a === "dro") return hiveSend({ a: "dro", h: hv.host, g: hv.gid, n: st.hist.length }, "Offer @" + hiveOther() + " a draw").catch(function () {});
		if (a === "dra") return hiveSend({ a: "dra", h: hv.host, g: hv.gid }, "Accept @" + hiveOther() + "'s draw offer").catch(function () {});
		if (a === "accept" && hv.reOffer) return hiveJoin(hv.reOffer.host, hv.reOffer.gid);
		if (a === "rematch" && R) {
			var other = hiveOther(), iWasWhite = R.players[0] === hMe();
			var obj = { a: "open", g: H.newGid(), v: R.open.v, f: iWasWhite ? "guest" : "host", t: R.open.t || 5, to: other, re: hv.host + "/" + hv.gid };
			HA.send(obj, "Offer @" + other + " a chess rematch").then(function (r) { hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]); toast("Rematch offered: @" + other + " sees an Accept button."); }, function (e2) { toast(e2.message); });
		}
	});

	/* self-reported results of games against the computer / on one device */
	$("ch-hsave").addEventListener("click", function () {
		if (!st.win) return;
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive (Play online tab) and press Save again on the Play tab."); return; }
		var obj = { a: "rec", g: H.newGid(), v: code, m: st.hist.join("."), o: mode === "cpu" ? S.lv : "local", s: mode === "cpu" ? human : -1, w: st.win.p };
		if (!H.clean(obj)) return toast("This game can't be saved (too long, or a variant code that can't be stored).");
		var key = code + ":" + st.hist.join("."), b = this;
		b.disabled = true;
		HA.send(obj, "Save a chess result (self-reported)").then(function (r) {
			S.saved[key] = r.trx || "?";
			var ks = Object.keys(S.saved); if (ks.length > 80) delete S.saved[ks[0]];
			save(); render(true);
			if (r.trx) toast("Saved on Hive: " + txLinks(r.trx), true); else toast("Saved on Hive.");
			register("hrec", { acct: me, g: obj.g });
		}, function (e) { b.disabled = false; toast(e.message); });
	});

	/* a Hive post about the game (Chess Brothers curate #chessbrothers) */
	function postDraft() {
		var pl = players(), res = C.resultText(st), why = st.win ? st.win.why : "";
		var desc = st.win ? (st.win.p < 0 ? "a draw" : (st.win.p === 0 ? "White" : "Black") + " won" + ({ mate: " by checkmate", resign: " by resignation", flag: " on time", hill: " (King of the Hill)", checks: " (three checks)" }[why] || "")) : "";
		var opp = mode === "cpu" ? "the " + C.LEVELS[S.lv].name + " computer" : mode === "hive" ? "@" + hiveOther() : mode === "online" ? (on.g && on.g.names[1 - on.seat]) || "an online player" : "a friend";
		var title = (mode === "local" ? "A game of " : "My game against " + opp + ": ") + C.describe(cfg).replace(/ \(.*/, "") + " (" + res + ")";
		var link = location.origin + location.pathname + "?v=" + encodeURIComponent(code) + "&m=" + st.hist.join(".");
		var body = "I just played a game of " + C.describe(cfg).toLowerCase().replace(/^standard chess$/, "chess") + " on [MES Chess](https://mes.fm/chess) against " + opp + ": " + desc + " after " + Math.ceil(st.hist.length / 2) + " moves.\n\n" +
			"**[Replay the game move by move](" + link + ")**\n\n## The moves\n\n" + C.moveText(st) + " " + res + "\n\n## PGN\n\nCopy it into any chess program to analyse it:\n\n```\n" + C.pgn(st, { white: pl.white, black: pl.black, event: "MES Chess" }) + "```\n\n" +
			"What would you have played differently? Let me know in the comments.\n\n---\n\n*Played on [mes.fm/chess](https://mes.fm/chess): free chess against the computer, a friend, online or on the Hive blockchain, in 2D or 3D.*";
		var tags = ["chessbrothers", "chess", "mesfm"];
		if (cfg.v === "F") tags.push("chess960");
		if (mode === "hive") tags.push("hive");
		return { title: title, body: body, tags: tags.join(" ") };
	}
	$("ch-hpost").addEventListener("click", function () {
		var d = postDraft(), box = $("ch-postbox");
		$("ch-ptitle").value = d.title; $("ch-pbody").value = d.body; $("ch-ptags").value = d.tags;
		box.hidden = false;
		box.scrollIntoView({ behavior: "smooth", block: "start" });
	});
	$("ch-px").addEventListener("click", function () { $("ch-postbox").hidden = true; });
	$("ch-pcopy").addEventListener("click", function () { copy("# " + $("ch-ptitle").value + "\n\n" + $("ch-pbody").value + "\n\nTags: " + $("ch-ptags").value, "Post text copied."); });
	function permlink(title) { return (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chess-game") + "-" + Date.now().toString(36); }
	$("ch-pgo").addEventListener("click", function () {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive first (Play online tab), then come back to the Play tab."); return; }
		var title = $("ch-ptitle").value.trim(), body = $("ch-pbody").value.trim();
		var tags = $("ch-ptags").value.toLowerCase().split(/[\s,#]+/).filter(function (t) { return /^[a-z0-9][a-z0-9-]{0,23}$/.test(t); }).slice(0, 8);
		if (!title || !body) return toast("Give the post a title and some text.");
		if (!tags.length) tags = ["chessbrothers", "chess"];
		if (MOCK) return toast("Test mode: nothing is posted from this local copy.");
		if (!confirm("Publish this post from @" + me + "? Hive posts are public and can't be deleted.")) return;
		var b = this, pl = permlink(title), meta = JSON.stringify({ tags: tags, app: "mes.fm/chess", format: "markdown" });
		b.disabled = true; b.textContent = "Waiting for Keychain…";
		HA.kc().then(function (k) {
			if (!k) throw new Error("Hive Keychain is not installed in this browser.");
			return new Promise(function (ok, no) {
				k.requestPost(me, title, body, tags[0], "", meta, pl, "", function (r) { if (r && r.success) ok(r); else no(new Error((r && (r.message || r.error)) || "Cancelled in Keychain")); });
			});
		}).then(function () {
			b.disabled = false; b.textContent = "Publish on Hive";
			$("ch-postbox").hidden = true;
			toast('Published: <a href="https://peakd.com/@' + esc(me) + "/" + esc(pl) + '" target="_blank" rel="noopener">open it on PeakD</a>', true);
		}, function (e) { b.disabled = false; b.textContent = "Publish on Hive"; toast("Not published: " + e.message); });
	});

	/* lobby + my games + recent */
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("ch-hlobby"), me = hMe();
			if (r.error) { box.innerHTML = '<p class="ch-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			if (!list.length) { box.innerHTML = '<p class="ch-sub">No open Hive games right now.' + (me ? " Make one above." : " Log in to make one.") + "</p>"; return; }
			box.innerHTML = '<ul class="ch-lob">' + list.map(function (o) {
				return '<li><span class="ch-lobn">@' + esc(o.host) + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · " + paceText(o.t) + " · " + firstText(o.f) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>";
			}).join("") + "</ul>";
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 12), recs = H.records(ops).slice(0, 12), box = $("ch-hmine");
			$("ch-hminebox").hidden = !games.length && !recs.length;
			var OPP = { easy: "Easy computer", medium: "Medium computer", hard: "Hard computer", expert: "Expert computer", local: "pass and play" };
			box.innerHTML = (games.length ? '<ul class="ch-lob">' + games.map(function (g) {
				return '<li><span class="ch-lobn">' + (g.role === "host" ? "You opened" + (g.to ? " (challenge to @" + esc(g.to) + ")" : "") : "You joined @" + esc(g.host)) + ' <span class="ch-lobv">· ' + (g.v ? esc(codeName(g.v)) + " · " : "") + new Date(g.ts).toLocaleString() + " · " + txLinks(g.trx) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>';
			}).join("") + "</ul>" : "") +
			(recs.length ? '<h4 class="ch-h4">Saved results (self-reported)</h4><ul class="ch-lob">' + recs.map(function (o) {
				var res = o.result === "w" ? "Won" : o.result === "l" ? "Lost" : o.result === "d" ? "Draw" : (o.w < 0 ? "Draw" : C.COLORS[o.w] + " won");
				var lk = location.pathname + "?v=" + encodeURIComponent(o.v) + "&m=" + o.moves.join(".");
				return '<li><span class="ch-lobn">' + esc(res) + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · vs " + esc(OPP[o.o] || o.o) + " · " + Math.ceil(o.moves.length / 2) + " moves · " + new Date(o.ts).toLocaleString() + " · " + txLinks(o.trx) + '</span></span><a class="tu-btn" href="' + esc(lk) + '">Replay</a></li>';
			}).join("") + "</ul>" : "");
		}, function () {});
	}
	function loadRecent() {
		api("GET", null, "?hrecent=1").then(function (r) {
			var box = $("ch-hrecent");
			if (!r || r.error || (!(r.games || []).length && !(r.recs || []).length)) { box.innerHTML = '<p class="ch-sub">' + (r && r.error ? esc(r.error) : "Nothing yet.") + "</p>"; return; }
			box.innerHTML = '<ul class="ch-lob">' + (r.games || []).map(function (o) {
				return '<li><span class="ch-lobn">@' + esc(o.host) + " vs @" + esc(o.guest) + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · started " + ago(o.age) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(o.host + "/" + o.g) + '">Watch</button></li>';
			}).join("") + (r.recs || []).map(function (o) {
				return '<li><span class="ch-lobn">@' + esc(o.acct) + " saved a result" + ' <span class="ch-lobv">· ' + esc(codeName(o.v)) + " · " + esc(o.res) + " · " + ago(o.age) + " · " + txLinks(o.trx) + "</span></span></li>";
			}).join("") + "</ul>";
		});
	}
	$("ch-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		var p = b.getAttribute("data-hjoin").split("/");
		var watching = mode === "hive" && hv.host === p[0] && hv.gid === p[1];
		if (watching && !(hMe() && hv.R && hv.R.status === "wait" && hv.host !== hMe())) return showTab("play");
		if (mode === "online") return toast("Leave the guest game first.");
		if (hMe()) hiveJoin(p[0], p[1]); else hiveEnter(p[0], p[1], []);
	});
	$("ch-hcreate").addEventListener("click", hiveCreate);
	$("ch-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); loadRecent(); });

	/* in-browser stand-in for /api/chess (local testing: two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-chess:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-chess:mock", JSON.stringify(db)); };
		var pub = function (g) { return { id: g.id, v: g.v, names: g.names, moves: g.moves, status: g.status, win: g.win, offer: g.offer === undefined ? null : g.offer, round: g.round, pub: g.pub, first: g.first, idle: now - g.at }; };
		if (method === "GET" && /hlobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return !g.joiners.length && !g.cancelled && !g.to && now - g.ts < 3600000; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, f: g.f, t: g.t, age: now - g.ts }; }) };
		if (method === "GET" && /hrecent/.test(query)) return { games: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.joiners.length; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, guest: g.joiners[0], age: now - g.ts }; }), recs: (db._recs || []).map(function (o) { return { acct: o.acct, v: o.v, res: o.res, trx: o.trx, age: now - o.ts }; }) };
		if (method === "GET" && /hg=/.test(query)) { var hk = "h:" + decodeURIComponent((/hg=([^&]+)/.exec(query) || [])[1] || ""); return { joiners: db[hk] ? db[hk].joiners : [] }; }
		if (method === "POST" && b.act === "hrec") {
			return HA.ops(b.acct).then(function (ops) {
				var rec = H.records(ops).filter(function (o) { return o.g === b.g; })[0];
				if (!rec) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-chess:mock") || "{}"); } catch (e) { db2 = {}; }
				db2._recs = [{ acct: b.acct, v: rec.v, res: rec.w < 0 ? "draw" : C.COLORS[rec.w] + " won", trx: rec.trx, ts: rec.ts }].concat(db2._recs || []).slice(0, 20);
				localStorage.setItem("mes-chess:mock", JSON.stringify(db2));
				return { ok: true };
			});
		}
		if (method === "POST" && /^h(open|join|cancel)$/.test(b.act)) {
			var who = b.act === "hjoin" ? b.acct : b.host, want = b.act.slice(1);
			return HA.ops(who).then(function (ops) {
				var op = ops.filter(function (o) { return o.a === want && o.g === b.g && (want === "open" || o.h === b.host); })[0];
				if (!op) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-chess:mock") || "{}"); } catch (e) { db2 = {}; }
				var k2 = "h:" + b.host + "/" + b.g;
				if (want === "open") db2[k2] = db2[k2] || { host: b.host, g: b.g, v: op.v, f: op.f, t: op.t, to: op.to || null, ts: op.ts, joiners: [], cancelled: false };
				else if (db2[k2]) { if (want === "join" && db2[k2].joiners.indexOf(who) < 0) db2[k2].joiners.push(who); if (want === "cancel") db2[k2].cancelled = true; }
				localStorage.setItem("mes-chess:mock", JSON.stringify(db2));
				return { ok: true, joiners: db2[k2] ? db2[k2].joiners : [] };
			});
		}
		if (method === "GET") {
			if (/lobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return !/^h:|^_/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub && now - g.created < 1800000; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, age: now - g.created }; }) };
			var id = (/id=([a-z0-9]+)/.exec(query) || [])[1], g0 = db[id];
			return g0 ? { g: pub(g0) } : { error: "Game not found (it may have expired)." };
		}
		var g = db[b.id], seat = g ? g.tok.indexOf(b.key) : -1;
		if (b.act === "new") {
			var c = C.onlineCode(b.v); if (!c) return { error: "Unknown game." };
			var nid = Math.random().toString(36).slice(2, 10), key = Math.random().toString(36).slice(2), hs = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0;
			var names = [null, null], tok = [null, null]; names[hs] = b.name; tok[hs] = key;
			db[nid] = { id: nid, v: b.v, names: names, tok: tok, moves: [], status: "wait", win: null, offer: null, round: 0, pub: !!b.pub, first: b.first, created: now, at: now };
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
			var s = C.replay(C.parseCode(g.v), g.moves);
			if (s.turn !== seat) return { error: "It's not your turn." };
			if (!C.apply(s, b.m)) return { error: "That move isn't allowed." };
			g.moves.push(b.m); g.at = now; g.offer = null;
			if (s.win) { g.status = "over"; g.win = { p: s.win.p, why: s.win.why }; }
			put(); return { g: pub(g) };
		}
		if (b.act === "offer") { if (g.status === "play") g.offer = seat; put(); return { g: pub(g) }; }
		if (b.act === "accept") { if (g.status === "play" && g.offer === 1 - seat) { g.status = "over"; g.win = { p: -1, why: "agreed" }; g.offer = null; } put(); return { g: pub(g) }; }
		if (b.act === "resign" || b.act === "leave") { if (g.status === "play") { g.status = "over"; g.win = { p: 1 - seat, why: b.act === "leave" ? "left" : "resign" }; } g.at = now; put(); return { g: pub(g) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		if (b.act === "claim") { g.status = "over"; g.win = { p: seat, why: "timeout" }; put(); return { g: pub(g) }; }
		if (b.act === "rematch") {
			if (g.status !== "over") return { error: "Finish this game first." };
			g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]]; g.moves = []; g.status = "play"; g.win = null; g.offer = null; g.round++; g.at = now; put();
			return { g: pub(g) };
		}
		return { error: "Unknown action." };
	}
	if (MOCK) $("ch-p-online").insertAdjacentHTML("afterbegin", '<p class="tu-note">Test mode: online games are kept in this browser only (no server here); open the page in a second tab to play yourself.</p>');

	/* ---------- start ---------- */
	syncSetup();
	applyPcol();
	renderRules();
	var q = new URLSearchParams(location.search);
	var joinId = q.get("join"), qh = q.get("hive"), qv = q.get("v");
	if (joinId || qh || qv) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
	function blank() { cfg = { v: "S" }; code = "S"; st = C.create(cfg); mode = S.opp; render(); }
	if (qh && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(qh)) {
		blank();
		var qp = qh.split("/");
		setTimeout(function () { if (hMe()) hiveJoin(qp[0], qp[1]); else hiveEnter(qp[0], qp[1], []); }, 300);
	} else if (joinId && /^[a-z0-9]{6,12}$/.test(joinId)) {
		blank();
		if (S.online && S.online.id === joinId) api("GET", null, "?id=" + joinId).then(function (r) { if (r.g) startOnline({ g: r.g, key: S.online.key, seat: S.online.seat }); });
		else { S.online = null; join(joinId); }
	} else if (qv && C.parseCode(qv)) {
		var c0 = C.parseCode(qv), mv = (q.get("m") || "").split(".").filter(Boolean);
		var pp = C.presetByCode(qv); if (pp) S.game = pp.id;
		S.online = null; S.hive = null;
		save(); syncSetup();
		var s0 = C.replay(c0, mv);
		mode = S.opp;
		setGame(c0, s0 ? mv : [], { human: s0 ? s0.turn : 0 });
		toast(s0 && mv.length ? "Game loaded from the link: step through it with ◀ ▶, or play on from here." : "Game loaded from the link.");
	} else if (S.hive && S.hive.host) {
		blank();
		var sh = S.hive;
		setTimeout(function () { hiveEnter(sh.host, sh.gid, []); }, 0);
	} else if (S.online && S.online.id) {
		blank();
		mode = "online"; on.id = S.online.id; on.key = S.online.key; on.seat = S.online.seat;
		api("GET", null, "?id=" + on.id).then(function (r) {
			if (r.g) startOnline({ g: r.g, key: on.key, seat: on.seat });
			else { on.id = null; S.online = null; save(); mode = S.opp; resumeOrNew(); }
		});
	} else resumeOrNew();
	renderHiveCard();
	function resumeOrNew() {
		var cc = S.cur && C.parseCode(S.cur.code);
		if (cc && !S.cur.done && S.cur.moves && S.cur.moves.length && C.replay(cc, S.cur.moves)) {
			mode = S.cur.mode === "local" ? "local" : "cpu";
			S.opp = mode;
			syncSetup();
			assisted = !!S.cur.as;
			setGame(cc, S.cur.moves, { human: S.cur.human || 0, keepMode: true, keepAssist: true });
			if (S.cur.clk && clk) { clk.t = S.cur.clk.t.slice(); clk.on = st.turn; clk.last = Date.now(); }
		} else newGame();
	}
	// for testing in a hidden pane: window.MESChessDebug.state()
	window.MESChessDebug = { state: function () { return { code: code, moves: st.hist.slice(), sans: st.sans.slice(), fen: C.fen(st), win: st.win, mode: mode, turn: st.turn, busy: busy, human: human, dim: S.dim, v3: !!v3, hive: hv.R ? { status: hv.R.status, players: hv.R.players } : null }; },
		move: function (str) { return humanMove(C.mparse(str)); }, click: chooseSquare, v3: function () { return v3; } };
})();
