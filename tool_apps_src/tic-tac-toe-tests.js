// node tool_apps_src/tic-tac-toe-tests.js  -- rules + computer opponent of mes.fm/tic-tac-toe
"use strict";
const T = require("./tic-tac-toe/lib.js");
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL:", msg); } }
function play(code, moves) { return T.replay(T.parseCode(code), moves.map(String)); }

// codes round trip, every preset parses
for (const p of T.PRESETS) { const c = T.parseCode(p.code); ok(c && T.cfgCode(c) === p.code, "code " + p.code); }
ok(T.parseCode("L2x2k2") === null, "too small refused");
ok(T.parseCode("L3x3k5") === null, "k bigger than board refused");
ok(T.parseCode("L20x3k3") === null, "too wide refused");
ok(T.parseCode("L4x4x4k4g") === null, "3D + gravity refused");
ok(T.parseCode("nonsense") === null, "junk refused");
ok(T.mstr(T.mparse("12o")) === "12o" && T.mstr(T.mparse("4-7")) === "4-7" && T.mparse("x") === null, "move strings");

// classic: row, column, diagonal, draw, no move after the end
let s = play("L3x3k3", [0, 3, 1, 4, 2]);
ok(s.win && s.win.p === 0 && s.win.line.join() === "0,1,2", "row win");
s = play("L3x3k3", [4, 0, 8, 3, 1, 6]);
ok(s.win && s.win.p === 1 && s.win.line.join() === "0,3,6", "column win for O");
s = play("L3x3k3", [0, 1, 2, 4, 3, 5, 7, 6, 8]);
ok(s.win && s.win.p === -1, "draw");
ok(play("L3x3k3", [0, 3, 1, 4, 2, 5]) === null, "no move after a win");
ok(play("L3x3k3", [0, 0]) === null, "occupied cell refused");

// misere: completing a line loses
s = play("L3x3k3m", [0, 3, 1, 4, 2]);
ok(s.win && s.win.p === 1 && s.win.why === "line-lose", "misere line loses");
// wild: either symbol, mover wins
s = play("L3x3k3w", ["0o", "1o", "2o"]);
ok(s.win && s.win.p === 0, "wild: the player who completes the line wins");
// gravity: pieces fall
let g = T.create(T.parseCode("L7x6k4g"));
ok(T.legal(g).length === 7 && T.legal(g)[3].c === 38, "gravity drops to the bottom row");
s = play("L7x6k4g", [35, 28, 36, 29, 37, 30, 38]);
ok(s.win && s.win.p === 0, "gravity four in a row");
ok(play("L7x6k4g", [0]) === null, "gravity: floating piece refused");
// gomoku 5 in a row, 6 also counts (freestyle)
s = play("L15x15k5", [0, 100, 1, 120, 2, 140, 3, 160, 5, 182, 4]);
ok(s.win && s.win.p === 0 && s.win.line.length === 6, "gomoku six counts");
// 3D: straight down through the layers and a space diagonal
s = play("L4x4x4k4", [0, 1, 16, 2, 32, 3, 48]);
ok(s.win && s.win.p === 0, "3D vertical line");
s = play("L4x4x4k4", [0, 1, 21, 2, 42, 3, 63]);
ok(s.win && s.win.p === 0, "3D space diagonal");
ok(T.geo(T.parseCode("L4x4x4k4")).wins.length === 76, "Qubic has 76 lines");
ok(T.geo(T.parseCode("L3x3k3")).wins.length === 8, "classic has 8 lines");

// ultimate: send to board, sub win, free move when the target board is decided
let u = T.create({ t: "ult" });
T.apply(u, { c: 4 });                     // board 0 cell 4 -> next board 4
ok(u.next === 4 && T.legal(u).every(m => (m.c / 9 | 0) === 4), "ultimate sends to the board of the cell");
u = play("U", [0, 1, 9, 2, 18]);          // X: board0 c0, board1 c0, board2 c0
ok(u.next === 0, "ultimate next");
s = play("U", [40, 36, 4, 37, 13, 39, 31]);   // X takes board 4 cells 4,... check sub win
ok(s, "ultimate sequence legal");
// win a sub board: X already has b4 c0 + c4, plays c8
let st = T.create({ t: "ult" }); st.cells[36] = 0; st.cells[40] = 0; st.cells[0] = 1; st.cells[1] = 1; st.next = 4;
ok(T.isLegal(st, { c: 44 }), "ultimate move in the target board");
T.apply(st, { c: 44 });
ok(st.sub[4] === 0 && st.next === 8, "ultimate small board won, sent to board 8");
st.cells[72] = 1; st.turn = 1; T.apply(st, { c: 76 });   // O plays b8 c4 -> would send to board 4, which is decided
ok(st.next === -1 && T.legal(st).every(m => (m.c / 9 | 0) !== 4), "ultimate: sent to a decided board -> free choice elsewhere");

// notakto: last board killed loses
s = play("N1", [0, 1, 2]);
ok(s.win && s.win.p === 1, "notakto: completing the last line loses");
s = play("N3", [0, 1, 2]);
ok(!s.win && s.dead[0] && T.legal(s).every(m => m.c >= 9), "notakto: dead board skipped");
// numerical
s = play("Q", ["0-1", "1-8", "2-5", "4-2"]);
ok(!s.win, "numerical not yet");
s = play("Q", ["0-9", "4-2", "8-3"]);   // 9+? diagonal 0,4,8 = 9+2+... no: 9+2+3=14
ok(!s.win, "numerical 14 is not 15");
s = play("Q", ["0-9", "4-2", "3-1", "8-4"]);  // 9+2+4 = 15 on 0,4,8 made by even
ok(s.win && s.win.p === 1, "numerical 15 wins for the one who completed it");
ok(play("Q", ["0-2"]) === null, "numerical: odd player can't play an even number");
ok(play("Q", ["0-1", "1-2", "2-1"]) === null, "numerical: number used twice refused");
// Order & Chaos
s = play("OC", ["0x", "1x", "2x", "3x", "4x"]);   // Chaos also placed an X: order still wins
ok(s.win && s.win.p === 0, "order & chaos: five of one symbol wins for Order");

// solver: classic is a draw; empty-board values all <= 0 for first? draw value 0 at best
const sv = T.solveMoves(T.create(T.parseCode("L3x3k3")));
ok(sv && Math.max(...sv.map(o => o.v)) === 0, "classic is a draw with perfect play");
const sv1 = T.solveMoves(T.create(T.parseCode("N1")));
ok(sv1 && Math.max(...sv1.map(o => o.v)) > 0, "one-board notakto: first player wins");
// hard never loses classic against random play
let lost = 0;
for (let gm = 0; gm < 40; gm++) {
	const r = T.rng(gm + 1), cfg = T.parseCode("L3x3k3"); let x = T.create(cfg); const comp = gm % 2;
	while (!x.win) {
		const L = T.legal(x);
		const m = x.turn === comp ? T.think(x, "hard", { seed: gm * 7 + x.hist.length }).m : L[(r() * L.length) | 0];
		T.apply(x, m);
	}
	if (x.win.p === 1 - comp) lost++;
}
ok(lost === 0, "hard never loses classic (lost " + lost + ")");
// hard always blocks / wins in one
s = play("L3x3k3", [0, 4, 1]);
ok(T.think(s, "hard", { seed: 1 }).m.c === 2, "hard blocks");
s = play("L3x3k3", [0, 4, 1, 3]);
ok(T.think(s, "medium", { seed: 1 }).m.c === 2, "medium takes the win");
// every variant: computer plays a whole game against itself at each level without crashing, legal moves only
for (const p of T.PRESETS) {
	for (const lv of ["easy", "medium", "hard"]) {
		let x = T.create(T.parseCode(p.code)), n = 0, bad = false;
		const t0 = Date.now();
		while (!x.win && n < 400) {
			const r = T.think(x, lv, { seed: n + 3, ms: 30 });
			if (!r || !T.isLegal(x, r.m)) { bad = true; break; }
			T.apply(x, r.m); n++;
			if (p.id === "gomoku" && n > 60) break;
		}
		ok(!bad, "self-play legal " + p.id + " " + lv);
		ok(Date.now() - t0 < 30000, "self-play time " + p.id + " " + lv);
	}
}
// line search finds a win-in-two (open four-ish) on 5x5 k4
s = play("L5x5k4", [6, 0, 7, 4, 8, 24]);   // X to move with 6,7,8: 5 or 9 wins
const hm = T.think(s, "hard", { seed: 2, ms: 200 }).m.c;
ok(hm === 5 || hm === 9, "hard finishes four in a row on 5x5 (played " + hm + ")");
s = play("L5x5k4", [6, 0, 7]);              // O to move: X threatens an open three; O should play next to it
const hb = T.think(s, "hard", { seed: 2, ms: 300 }).m.c;
ok([5, 8, 9].includes(hb), "hard answers an open two on a 5-wide row (played " + hb + ")");

// server copy is identical
const api = path.join(__dirname, "..", "mes.fm", "api", "_ttt-lib.js");
if (fs.existsSync(api)) ok(fs.readFileSync(api, "utf8") === fs.readFileSync(path.join(__dirname, "tic-tac-toe", "lib.js"), "utf8"), "mes.fm/api/_ttt-lib.js is a byte-identical copy (cp it)");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
