// node tool_apps_src/chess-tests.js  -- MES Chess rules (perft), variants, SAN / PGN / FEN, the computer, the Hive protocol
"use strict";
const fs = require("fs"), path = require("path");
const C = require("./chess/lib.js");
let f = 0, n = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
const X = (fen) => C.parseCode("X" + fen.replace(/ /g, "_"));

// the server copy must be the same file
eq(fs.readFileSync(path.join(__dirname, "chess/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_chess-lib.js"), "utf8"), true, "mes.fm/api/_chess-lib.js is a byte-identical copy (cp after editing)");

// move generation: perft against the published numbers (start, Kiwipete, positions 3 and 5, two Chess960 positions)
[[C.START, [20, 400, 8902]], ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039]], ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812]],
	["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486]], ["bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9", [21, 528]], ["r1k1r2q/p1ppp1pp/8/8/8/8/P1PPP1PP/R1K1R2Q w KQkq - 0 1", [23, 522]]]
	.forEach(([fen, want]) => { const s = C.create(X(fen)); eq(want.map((_, i) => C.perft(s, i + 1)), want, "perft " + fen); });

// codes
eq(C.parseCode("S"), { v: "S" }, "standard code"); eq(C.parseCode("F518"), { v: "F", n: 518 }, "960 code"); eq(C.parseCode("F960"), null, "960 range"); eq(C.parseCode("F05"), null, "no leading zero");
eq(C.parseCode("chess960"), { v: "F", n: 518 }, "preset id"); eq(C.parseCode("Q"), null, "unknown code");
eq(C.pos960(518).join(""), "RNBQKBNR", "960 #518 is the normal start"); eq(C.pos960(0).join(""), "BBQNNRKR", "960 #0");
const all960 = new Set(); for (let i = 0; i < 960; i++) all960.add(C.pos960(i).join("")); eq(all960.size, 960, "960 different starts");
eq(C.onlineCode("X8/8/8/8/8/8/8/K6k_w_-_-_0_1"), null, "no typed positions online"); eq(!!C.parseCode("X8/8/8/8/8/8/8/K6k_w_-_-_0_1"), true, "typed position code");
eq(C.validateFen("8/8/8/8/8/8/8/K7 w - - 0 1"), "Each side needs exactly one king.", "FEN check");

// game ends
let s = C.replay({ v: "S" }, ["f2f3", "e7e5", "g2g4", "d8h4"]); eq([s.win.p, s.win.why, s.sans[3]], [1, "mate", "Qh4#"], "fool's mate");
s = C.create(X("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")); eq(s.win.why, "stalemate", "stalemate");
s = C.create(X("8/8/8/4k3/8/8/2B5/4K3 w - - 0 1")); eq(s.win.why, "material", "K+B v K is a draw");
s = C.create(X("8/8/8/4k3/8/8/2N5/4K3 w - - 99 80")); C.apply(s, "c2b4"); eq(s.win && s.win.why, "material", "K+N v K");
s = C.create(X("r3k3/8/8/8/8/8/8/4K2R w - - 99 80")); C.apply(s, "h1h2"); eq(s.win && s.win.why, "fifty", "50-move rule");
s = C.replay({ v: "S" }, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]); eq(s.win && s.win.why, "repeat", "threefold repetition");
s = C.replay({ v: "K" }, ["e2e4", "d7d5", "e1e2", "d5e4", "e2e3", "a7a6", "e3e4"]); eq(s.win && [s.win.p, s.win.why], [0, "hill"], "king of the hill");
s = C.replay({ v: "T" }, ["e2e4", "e7e5", "f1c4", "a7a6", "c4f7", "e8f7", "d1h5", "g7g6"]);
eq(s.checks, [2, 0], "two checks counted"); eq(s.win, null, "two checks: still playing");
s = C.replay({ v: "T" }, ["e2e3", "f7f6", "d1h5", "g7g6", "h5g6", "h7g6", "f1d3", "a7a6", "d3g6"]);
eq(s.win && [s.win.p, s.win.why], [0, "checks"], "three-check: the third check wins");

// special moves
s = C.replay({ v: "S" }, ["e2e4", "a7a6", "e4e5", "d7d5"]); eq(C.isLegal(s, "e5d6"), true, "en passant allowed right away"); C.apply(s, "e5d6"); eq(s.sans[4], "exd6", "en passant SAN"); eq(C.board64(s)[C.sqIndex("d5")], "", "captured pawn removed");
s = C.replay({ v: "S" }, ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"]);
eq(C.isLegal(s, "e1g1") && C.isLegal(s, "e1h1"), true, "castling as e1g1 or e1h1"); C.apply(s, "e1g1"); eq([s.hist[6], s.sans[6], C.board64(s)[5], C.board64(s)[6]], ["e1h1", "O-O", "R", "K"], "castled");
s = C.create(X("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1")); eq(C.needsPromo(s, C.sqIndex("b7"), C.sqIndex("b8")), true, "promotion needs a choice");
eq(C.isLegal(s, "b7b8"), false, "no promotion piece = not legal"); C.apply(s, "b7b8n"); eq([C.board64(s)[57], s.sans[0]], ["N", "b8=N"], "under-promotion");
s = C.create(X("r3k2r/8/8/8/8/8/8/R3K1r1 w Qkq - 0 1")); eq(C.isLegal(s, "e1c1"), false, "can't castle out of check? (rook on g1 gives check)");
// Chess960 castling where the king doesn't move (king on g1, rook on h1)
s = C.create(X("4k3/8/8/8/8/8/8/R5KR w HA - 0 1")); eq(C.isLegal(s, "g1h1"), true, "960 castle with the king already on g"); C.apply(s, "g1h1"); eq([C.board64(s)[6], C.board64(s)[5]], ["K", "R"], "960 kingside castle result");
s = C.create(X("4k3/8/8/8/8/8/8/1R4KR w HB - 0 1")); C.apply(s, "g1b1"); eq([C.board64(s)[2], C.board64(s)[3], C.board64(s)[1]], ["K", "R", ""], "960 queenside castle");

// SAN + PGN
s = C.create(X("4k3/8/8/8/8/8/4K3/R6R w - - 0 1")); eq(C.san(s, "a1d1"), "Rad1", "file disambiguation");
s = C.create(X("4k3/R7/8/8/8/8/8/R3K3 w - - 0 1")); eq(C.san(s, "a1a4"), "R1a4", "rank disambiguation");
s = C.replay({ v: "S" }, []); eq(C.mstr(C.parseSan(s, "Nf3")), "g1f3", "parse Nf3"); eq(C.mstr(C.parseSan(s, "e4")), "e2e4", "parse e4"); eq(C.parseSan(s, "e5"), null, "illegal SAN");
const pg = C.parsePgn('[Event "x"]\n[White "A"]\n\n1. e4 e5 2. Nf3 {a comment} Nc6 (2... d6 3. d4) 3. Bb5 a6 $1 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 1/2-1/2');
eq([pg.error, pg.moves.length, pg.moves[8], pg.headers.White], ["", 14, "e1h1", "A"], "PGN with comments, variations, NAGs, castling");
s = C.replay(pg.cfg, pg.moves); const back = C.parsePgn(C.pgn(s, { white: "A", black: "B" })); eq(back.moves, pg.moves, "PGN round trip");
const pf = C.parsePgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1"]\n\n1... Kd7 2. e4');
eq([pf.cfg.v, pf.moves], ["X", ["e8d7", "e2e4"]], "PGN from a FEN, Black first"); eq(C.moveText(C.replay(pf.cfg, pf.moves)), "1... Kd7 2. e4", "move numbers from Black");
eq(C.fen(C.replay({ v: "S" }, ["e2e4"])), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "FEN (no e.p. square when no capture is possible)");
eq(C.fen(C.create({ v: "F", n: 0 })), "bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1", "Chess960 FEN");

// the computer: mate in one, avoids a hanging queen, every level and variant moves legally
s = C.replay({ v: "S" }, ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6"]); eq(C.mstr(C.think(s, "hard", { ms: 400 }).m), "h5f7", "finds Scholar's mate");
s = C.create(X("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1")); eq(C.mstr(C.think(s, "medium").m), "d1d8", "back-rank mate");
s = C.create(X("k7/8/8/8/3q4/8/8/3RK3 b - - 0 1")); const mv = C.mstr(C.think(s, "hard", { ms: 300 }).m); eq(mv.slice(0, 2) === "d4" && mv !== "d4d1", true, "queen leaves the attack: " + mv);
["S", "F100", "K", "T"].forEach((c) => ["easy", "medium", "hard"].forEach((lv) => { const g = C.create(C.parseCode(c)); const r = C.think(g, lv, { ms: 120 }); eq(!!r && C.isLegal(g, r.m), true, "legal move " + c + " " + lv); }));
s = C.replay({ v: "S" }, ["e2e4"]); const a = C.analyze(s, 300); eq(typeof a.v === "number" && C.isLegal(s, a.best) && a.pv[0] === a.best, true, "analysis gives a best move and a line");
// a short computer-vs-computer game stays legal
s = C.create({ v: "S" });
for (let i = 0; i < 30 && !s.win; i++) { const r = C.think(s, i % 2 ? "medium" : "easy", { ms: 30 }); if (!C.apply(s, r.m)) { eq(false, true, "self-play move " + i); break; } }
eq(s.hist.length > 0, true, "self-play");

// Hive protocol
const H = C.hive, ts = Date.parse("2026-11-12T10:00:00Z");
const op = (acct, j, b, sec) => [b, { trx_id: acct + b, block: b, timestamp: new Date(ts + (sec || b) * 1000).toISOString().slice(0, 19), op: ["custom_json", { id: "mes_chess", required_auths: [], required_posting_auths: [acct], json: JSON.stringify(j) }] }];
const A = [op("alice", { a: "open", g: "game2345", v: "S", f: "host", t: 15 }, 1)], B = [op("bob", { a: "join", h: "alice", g: "game2345" }, 2)];
const mvs = ["e2e4", "e7e5", "g1f3", "b8c6"];
mvs.forEach((m, i) => (i % 2 ? B : A).push(op(i % 2 ? "bob" : "alice", { a: "mv", h: "alice", g: "game2345", n: i, m }, 3 + i)));
let ops = H.parse(A, "alice").concat(H.parse(B, "bob"));
let R = H.build("alice", "game2345", ops, ts + 60000);
eq([R.status, R.players, R.s.hist, R.turnAcct], ["play", ["alice", "bob"], mvs, "alice"], "Hive game built from both histories");
eq(R.canClaimAt, R.lastTs + 15 * 60000, "claim time follows the time per move");
// a move out of turn or illegal is ignored
ops = ops.concat(H.parse([op("bob", { a: "mv", h: "alice", g: "game2345", n: 4, m: "a7a6" }, 20)], "bob"), H.parse([op("alice", { a: "mv", h: "alice", g: "game2345", n: 4, m: "e1e3" }, 21)], "alice"));
eq(H.build("alice", "game2345", ops, ts).s.hist.length, 4, "out-of-turn and illegal moves ignored");
// draw offer + accept
let ops2 = ops.concat(H.parse([op("alice", { a: "dro", h: "alice", g: "game2345", n: 4 }, 30)], "alice"), H.parse([op("bob", { a: "dra", h: "alice", g: "game2345" }, 31)], "bob"));
R = H.build("alice", "game2345", ops2, ts); eq([R.status, R.win], ["over", { p: -1, why: "agreed" }], "draw agreed on Hive");
ops2 = ops.concat(H.parse([op("alice", { a: "dra", h: "alice", g: "game2345" }, 30)], "alice"));
eq(H.build("alice", "game2345", ops2, ts).status, "play", "accepting without an offer does nothing");
// claim needs the time per move to have run out
ops2 = ops.concat(H.parse([op("bob", { a: "claim", h: "alice", g: "game2345" }, 40, 60)], "bob"));
eq(H.build("alice", "game2345", ops2, ts).status, "play", "claim too early ignored");
ops2 = ops.concat(H.parse([op("bob", { a: "claim", h: "alice", g: "game2345" }, 40, 7 + 16 * 60)], "bob"));
eq(H.build("alice", "game2345", ops2, ts).win, { p: 1, why: "timeout" }, "claim after the time per move");
// bad ops refused
eq(H.clean({ a: "open", g: "game2345", v: "X8/8/8/8/8/8/8/K6k_w_-_-_0_1" }), null, "no typed positions in Hive games");
eq(H.clean({ a: "open", g: "game2345", v: "S", t: 7 }).t, 5, "odd time per move falls back to 5 minutes");
eq(H.clean({ a: "mv", h: "alice", g: "game2345", n: 1, m: "e2e9" }), null, "bad move string");
// self-reported results
const recs = H.records(H.parse([op("dan", { a: "rec", g: "rec22222", v: "S", m: "f2f3.e7e5.g2g4.d8h4", o: "expert", s: 1, w: 1 }, 50), op("dan", { a: "rec", g: "rec33333", v: "S", m: "f2f3.e7e5", o: "easy", s: 0, w: 0 }, 51)], "dan"));
eq(recs.map((r2) => r2.g + ":" + r2.result), ["rec22222:w"], "only finished, correct results are kept");

console.log((n - f) + " passed, " + f + " failed");
process.exit(f ? 1 : 0);
