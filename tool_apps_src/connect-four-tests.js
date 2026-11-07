// node tool_apps_src/connect-four-tests.js  -- rules, computer opponent and Hive protocol of mes.fm/connect-four
"use strict";
const C = require("./connect-four/lib.js");
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL:", msg); } }
function play(code, moves) { return C.replay(C.parseCode(code), moves.map(String)); }
const idx = (c, x, yFromBottom) => (c.h - 1 - yFromBottom) * c.w + x;

// ---------- codes ----------
for (const p of C.PRESETS) { const c = C.parseCode(p.code); ok(c && C.cfgCode(c) === p.code, "preset code " + p.code); ok(C.parseCode(p.id) && C.cfgCode(C.parseCode(p.id)) === p.code, "preset id " + p.id); }
ok(C.parseCode("C4x4k3") && C.parseCode("C12x10k7"), "limits accepted");
for (const bad of ["C3x6k3", "C13x6k4", "C7x3k3", "C7x11k4", "C7x6k2", "C7x6k8", "C4x4k5", "C7x6k4pm", "C7x6k4pt", "C7x6k4mt", "nonsense", "L7x6k4g", ""]) ok(C.parseCode(bad) === null, "refused " + bad);
ok(C.parseCode("C7x6k4t").np === 3 && C.parseCode("C7x6k4p").pop && C.parseCode("C7x6k4m").mis, "flags");
ok(C.describe(C.parseCode("C8x5k4p")) === "8 × 5, 4 in a row (Pop Out)" && C.describe(C.parseCode("C7x6k4")).indexOf("Classic") === 0, "describe");
ok(C.mstr(C.mparse("p3")) === "p3" && C.mstr(C.mparse("11")) === "11" && C.mparse("x3") === null && C.mparse("p") === null, "move strings");
ok(C.geo(C.parseCode("C7x6k4")).wins.length === 69, "classic board has 69 lines");
ok(C.geo(C.parseCode("C7x6k4")).order.join() === "3,2,4,1,5,0,6", "middle-out column order");

// ---------- classic rules ----------
const K = C.parseCode("C7x6k4");
let s = C.create(K);
ok(C.legal(s).length === 7 && C.dropCell(s, 3) === idx(K, 3, 0), "empty board: 7 drops, disc lands on the bottom");
s = play("C7x6k4", [3, 3, 3]);
ok(s.cells[idx(K, 3, 2)] === 0 && s.cells[idx(K, 3, 1)] === 1 && s.hts[3] === 3, "discs stack up");
s = play("C7x6k4", [0, 1, 0, 1, 0, 1, 0]);
ok(s.win && s.win.p === 0 && s.win.line.length === 4 && s.win.why === "line", "vertical four (left edge)");
s = play("C7x6k4", [3, 3, 4, 4, 5, 5, 6]);
ok(s.win && s.win.p === 0 && s.win.line.join() === [3, 4, 5, 6].map(x => idx(K, x, 0)).join(), "horizontal four at the right edge");
// diagonal up-right: red at a1 b2 c3 d4
s = play("C7x6k4", [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
ok(s.win && s.win.p === 0, "diagonal / four");
// diagonal down-right: red at d1 c2 b3 a4
s = play("C7x6k4", [3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0]);
ok(s.win && s.win.p === 0, "diagonal \\ four");
s = play("C7x6k4", [0, 0, 1, 1, 2, 2, 4, 4, 5, 5, 3]);
ok(s.win && s.win.line.length === 6, "five or more in a row counts (whole run returned)");
ok(play("C7x6k4", [0, 1, 0, 1, 0, 1, 0, 1]) === null, "no move after a win");
ok(play("C7x6k4", [0, 0, 0, 0, 0, 0, 0]) === null, "full column refused");
ok(play("C7x6k4", [7]) === null && play("C7x6k4", ["p0"]) === null, "off-board column / pop in the classic game refused");
// full board draw: a known drawn filling
const draw = [];
for (const col of [0, 1, 2, 3, 4, 5, 6]) for (let i = 0; i < 6; i++) draw.push(col);
// columns filled one after another give a vertical win quickly; use a pattern: pairs of columns swapped every two rows
s = C.create(K);
const seq = [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 2, 3, 2, 3, 3, 2, 3, 2, 2, 3, 2, 3, 4, 5, 4, 5, 5, 4, 5, 4, 4, 5, 4, 5, 6, 6, 6, 6, 6, 6];
let drawOk = true;
for (const x of seq) { if (s.win) { drawOk = false; break; } C.apply(s, { t: "d", x }); }
ok(drawOk && s.win && s.win.p === -1 && s.win.why === "full", "full board without a line is a draw (" + JSON.stringify(s.win && s.win.why) + ")");

// ---------- other lines ----------
s = play("C5x4k3", [0, 4, 1, 4, 2]);
ok(s.win && s.win.p === 0, "Connect 3 wins with three");
s = play("C9x6k5", [0, 0, 1, 1, 2, 2, 3, 3]);
ok(!s.win, "Connect 5: four is not enough");
C.apply(s, { t: "d", x: 4 });
ok(s.win && s.win.p === 0, "Connect 5: five wins");
s = play("C12x10k6", [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
ok(s.win && s.win.p === 0 && C.parseCode("C12x10k6").w === 12, "Connect 6 on 12 × 10");

// ---------- misere ----------
s = play("C7x6k4m", [0, 0, 1, 1, 2, 2, 3]);
ok(s.win && s.win.p === 1 && s.win.why === "line-lose" && s.win.by === 0, "misere: making four loses");

// ---------- three players ----------
s = play("C9x7k4t", [0, 1, 2]);
ok(s.turn === 0 && s.cells[idx(C.parseCode("C9x7k4t"), 2, 0)] === 2, "three players take turns red, yellow, green");
s = play("C9x7k4t", [0, 1, 6, 0, 1, 6, 0, 1, 6, 8, 8, 6]);
ok(s.win && s.win.p === 2, "green wins with four in a column");
{   // seeded random games until one fills the board
	const r = C.rng(11); let drawn = null;
	for (let g = 0; g < 300 && !drawn; g++) { const st = C.create(C.parseCode("C4x4k4t")); while (!st.win) { const L = C.legal(st); C.apply(st, L[(r() * L.length) | 0]); } if (st.win.p === -1) drawn = st; }
	ok(drawn && drawn.win.why === "full" && drawn.hist.length === 16, "three players: full board draw");
}

// ---------- Pop Out ----------
const P = C.parseCode("C7x6k4p");
s = play("C7x6k4p", [0, 0]);
ok(C.legal(s).some(m => m.t === "p" && m.x === 0), "you may pop your own bottom disc");
C.apply(s, { t: "p", x: 0 });
ok(s.cells[idx(P, 0, 0)] === 1 && s.cells[idx(P, 0, 1)] === -1 && s.hts[0] === 1 && s.lastPop === 0, "pop: the column falls down one row");
C.apply(s, { t: "d", x: 1 });
ok(s.turn === 0 && !C.isLegal(s, { t: "p", x: 0 }) && !C.isLegal(s, { t: "p", x: 1 }), "you can't pop the other player's disc");
ok(play("C7x6k4p", ["p0"]) === null, "no pop from an empty column");
function popState(rows) {    // rows from the bottom: strings like "RY..." (R red, Y yellow, . empty)
	const st = C.create(P);
	rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== ".") { st.cells[idx(P, x, y)] = r[x] === "R" ? 0 : 1; st.hts[x] = Math.max(st.hts[x], y + 1); } });
	return st;
}
s = popState(["R......", "YRRR...", "R......"]);
C.apply(s, { t: "p", x: 0 });
ok(s.win && s.win.p === 0 && s.win.why === "line", "a pop that makes your line wins");
s = popState(["RYYY...", "YRRR...", "R......"]);
C.apply(s, { t: "p", x: 0 });
ok(s.win && s.win.p === 0 && s.win.why === "pop-both" && s.win.lines.length === 2, "a pop that makes lines for both: the popper wins");
s = popState(["RYYY...", "Y......"]);
C.apply(s, { t: "p", x: 0 });
ok(s.win && s.win.p === 1 && s.win.why === "pop-gift", "a pop that only makes the other player's line: they win");
// repetition: drop, drop, pop, pop four times over = the empty board with red to move three times
s = C.create(P);
for (let i = 0; i < 3; i++) for (const m of ["0", "1", "p0", "p1"]) if (!s.win) C.apply(s, C.mparse(m));
ok(s.win && s.win.p === -1 && s.win.why === "repeat" && s.hist.length === 9, "Pop Out: the same position three times is a draw (" + s.hist.length + ")");

// ---------- engine matches the rules (random games, hash restored by unmake) ----------
let engineOk = true;
for (const code of ["C7x6k4", "C7x6k4p", "C7x6k4m", "C9x7k4t", "C5x4k3"]) {
	const r = C.rng(7);
	for (let g = 0; g < 25 && engineOk; g++) {
		const st = C.create(C.parseCode(code));
		while (!st.win && engineOk) {
			const L = C.legal(st), m = L[(r() * L.length) | 0];
			const E = new C._Engine(st), lo = E.lo, hi = E.hi, turn = st.turn;
			const res = E.make(m.t === "p" ? 1 : 0, m.x);
			const after = C.play(st, m);
			const want = after.win ? (after.win.why === "repeat" || after.win.why === "long" || after.win.why === "stuck" ? -9 : after.win.p) : -2;
			if (want !== -9 && res !== want) { engineOk = false; console.log("engine outcome", code, st.hist.join("."), C.mstr(m), res, want); }
			E.unmake(m.t === "p" ? 1 : 0, m.x, turn);
			if (E.lo !== lo || E.hi !== hi || Array.from(E.b).join() !== st.cells.join()) { engineOk = false; console.log("unmake", code); }
			C.apply(st, m);
		}
	}
}
ok(engineOk, "search engine's make / unmake agree with the rules in every variant");

// ---------- the computer ----------
// red has c1 d1; playing b1 or e1 makes two threats at once
s = play("C7x6k4", [2, 2, 3, 3]);
let t = C.think(s, "hard", { seed: 1, ms: 600 });
ok(t.m.t === "d" && [1, 4].includes(t.m.x), "hard makes the double threat (played " + t.m.x + ")");
let an = C.analyze(s, 800);
const anB = an.vals.find(o => o.m.x === 1), anE = an.vals.find(o => o.m.x === 4);
ok(anB && anB.v > 0 && anB.ply && C.valueLabel(anB.v, anB.ply) === "Win in 2" && anE.ply, "analysis: b and e are 'Win in 2' (" + (anB && C.valueLabel(anB.v, anB.ply)) + ")");
const anA = an.vals.find(o => o.m.x === 0);
ok(anA && !(anA.v > C.WIN - 1000), "analysis: a does not force a win");
// yellow must block red's three
s = play("C7x6k4", [0, 6, 1, 6, 2]);
for (const lv of ["medium", "hard", "expert"]) { t = C.think(s, lv, { seed: 3, ms: 300 }); ok(t.m.t === "d" && t.m.x === 3, lv + " blocks the open three (played " + t.m.x + ")"); }
// takes an immediate win at every level above easy
s = play("C7x6k4", [3, 0, 3, 0, 3, 6]);
for (const lv of ["medium", "hard"]) ok(C.think(s, lv, { seed: 5, ms: 200 }).m.x === 3, lv + " takes the win");
s = play("C7x6k4", [1, 1, 2, 2, 3, 3]);   // red b1 c1 d1, yellow b2 c2 d2, red to move: a1 or e1 wins
t = C.think(s, "hard", { seed: 1, ms: 300 });
ok(t.how === "win" && [0, 4].indexOf(t.m.x) >= 0, "hard sees its own winning drop (" + t.m.x + ")");
// doesn't drop under the other player's threat: yellow has b2 c2 d2, so a1 / e1 would let yellow win on top
s = play("C7x6k4", [6, 1, 2, 3, 5, 1, 6, 2, 5, 3]);
for (const lv of ["medium", "hard"]) { t = C.think(s, lv, { seed: 4, ms: 300 }); ok(t.m.x !== 0 && t.m.x !== 4, lv + " doesn't play under a threat (played " + t.m.x + ")"); }
// misere: never completes its own line when it has a choice
s = play("C7x6k4m", [0, 0, 1, 1, 2, 2]);
t = C.think(s, "hard", { seed: 2, ms: 300 });
ok(t.m.x !== 3, "misere: hard does not make four (played " + t.m.x + ")");
// hard beats easy
let hw = 0;
for (let g = 0; g < 4; g++) {
	const st = C.create(K);
	while (!st.win) { const lv = st.turn === g % 2 ? "hard" : "easy"; C.apply(st, C.think(st, lv, { seed: 100 + g * 50 + st.hist.length, ms: 120 }).m); }
	if (st.win.p === g % 2) hw++;
}
ok(hw === 4, "hard beats easy every time (" + hw + "/4)");
// every variant: the computer plays legal moves to the end
for (const p of C.PRESETS.concat([{ code: "C4x4k3" }, { code: "C10x8k5p" }])) {
	const st = C.create(C.parseCode(p.code)); let legal = true;
	while (!st.win && st.hist.length < 400) { const m = C.think(st, ["easy", "medium", "hard"][st.hist.length % 3], { seed: st.hist.length, ms: 25 }).m; if (!C.isLegal(st, m)) { legal = false; break; } C.apply(st, m); }
	ok(legal && st.win, "computer finishes a game of " + p.code);
}
// hard first move on the classic board: the middle column
ok(C.think(C.create(K), "hard", { seed: 9, ms: 400 }).m.x === 3, "hard opens in the middle");

// ---------- Hive games ----------
const H = C.hive;
let blk = 1000;
function entry(acct, j, opt) { opt = opt || {}; const b = opt.block || ++blk; return [opt.i || b, { trx_id: opt.trx || ("t" + b + acct), block: b, timestamp: new Date(Date.UTC(2026, 10, 7, 12, 0, 0) + (opt.sec !== undefined ? opt.sec : (b - 1000) * 3) * 1000).toISOString().slice(0, 19),
	op: ["custom_json", { id: opt.id || "mes_c4", required_auths: [], required_posting_auths: [acct], json: JSON.stringify(j) }] }]; }
const gid = "abcd2345";
let E = [entry("alice", { a: "open", g: gid, v: "C7x6k4", f: "host" })];
E.push(entry("bob", { a: "join", h: "alice", g: gid }));
E.push(entry("carl", { a: "join", h: "alice", g: gid }));           // too late
const mv = (a, n, m, o) => E.push(entry(a, { a: "mv", h: "alice", g: gid, n, m }, o));
mv("alice", 0, "3");
mv("bob", 0, "2");             // wrong number: ignored
mv("bob", 1, "9");             // off the board: refused by clean? (9 < 12 so parsed, but illegal on 7 columns)
mv("bob", 1, "2");
mv("carl", 2, "3");            // not a player
mv("alice", 2, "3"); mv("bob", 3, "2"); mv("alice", 4, "3"); mv("bob", 5, "2");
mv("alice", 6, "3");           // four in column d
mv("bob", 7, "2");             // after the end: ignored
E.push(entry("bob", { a: "x", h: "alice", g: gid }));
E.push(entry("bob", { a: "mv", h: "alice", g: gid, n: 0, m: "4" }, { id: "mes_ttt" }));
let ops = [];
for (const a of ["alice", "bob", "carl"]) ops = ops.concat(H.parse(E.filter(e => e[1].op[1].required_posting_auths[0] === a), a));
ok(ops.length === 14, "parse keeps only mes_c4 ops with a valid shape (" + ops.length + ")");
let R = H.build("alice", gid, ops, 0);
ok(R.guest === "bob" && R.players.join() === "alice,bob", "first join gets the seat");
ok(R.status === "over" && R.win.p === 0 && R.s.hist.join() === "3,2,3,2,3,2,3", "moves validated, alice wins (" + R.s.hist.join() + ")");
ok(R.trx.open && R.trx.join && R.trx.moves.length === 7 && R.trx.end === R.trx.moves[6], "transaction ids of every step kept");
ok(H.build("alice", gid, ops.slice().reverse(), 0).s.hist.join() === R.s.hist.join(), "order comes from blocks, not input order");
// pop out over Hive
E = [entry("alice", { a: "open", g: "pppp2222", v: "C7x6k4p", f: "guest" }), entry("bob", { a: "join", h: "alice", g: "pppp2222" })];
E.push(entry("bob", { a: "mv", h: "alice", g: "pppp2222", n: 0, m: "0" }), entry("alice", { a: "mv", h: "alice", g: "pppp2222", n: 1, m: "0" }), entry("bob", { a: "mv", h: "alice", g: "pppp2222", n: 2, m: "p0" }));
R = H.build("alice", "pppp2222", H.parse(E.filter(e => e[1].op[1].required_posting_auths[0] === "alice"), "alice").concat(H.parse(E.filter(e => e[1].op[1].required_posting_auths[0] === "bob"), "bob")), 0);
ok(R.players[0] === "bob" && R.s.hist.join() === "0,0,p0" && R.status === "play" && R.turnAcct === "alice", "Pop Out on Hive (guest first, pop accepted)");
// challenge, resign, claim, cancel, coin, expiry
let E2 = [entry("alice", { a: "open", g: "zzzz2222", v: "C6x5k4", f: "guest", to: "bob" }), entry("carl", { a: "join", h: "alice", g: "zzzz2222" }), entry("bob", { a: "join", h: "alice", g: "zzzz2222" })];
let o2 = H.parse(E2.slice(0, 1), "alice").concat(H.parse(E2.slice(1, 2), "carl"), H.parse(E2.slice(2), "bob"));
R = H.build("alice", "zzzz2222", o2, 0);
ok(R.guest === "bob" && R.players[0] === "bob", "challenge: only the named account may join; guest goes first");
R = H.build("alice", "zzzz2222", o2.concat(H.parse([entry("alice", { a: "res", h: "alice", g: "zzzz2222" })], "alice")), 0);
ok(R.status === "over" && R.win.p === 0 && R.win.why === "resign", "resign: the other player wins");
ok(H.build("alice", "zzzz2222", o2.concat(H.parse([entry("alice", { a: "claim", h: "alice", g: "zzzz2222" }, { sec: 60 })], "alice")), 0).status === "play", "claim too early is ignored");
R = H.build("alice", "zzzz2222", o2.concat(H.parse([entry("alice", { a: "claim", h: "alice", g: "zzzz2222" }, { sec: 1000 })], "alice")), 0);
ok(R.status === "over" && R.win.p === 1 && R.win.why === "timeout", "claim after 5 minutes on the other player's turn");
ok(H.build("alice", "zzzz2222", o2.concat(H.parse([entry("bob", { a: "claim", h: "alice", g: "zzzz2222" }, { sec: 1000 })], "bob")), 0).status === "play", "can't claim on your own turn");
const E3 = [entry("alice", { a: "open", g: "yyyy3333", v: "C7x6k4", f: "random" }), entry("alice", { a: "cancel", h: "alice", g: "yyyy3333" }), entry("bob", { a: "join", h: "alice", g: "yyyy3333" })];
R = H.build("alice", "yyyy3333", H.parse(E3.slice(0, 2), "alice").concat(H.parse(E3.slice(2), "bob")), 0);
ok(R.status === "cancelled" && !R.guest, "cancel before a join");
ok(H.coin("aa", "bb") === H.coin("aa", "bb") && [0, 1].includes(H.coin("x", "y")), "coin is deterministic");
ok(H.build("alice", "yyyy3333", H.parse(E3.slice(0, 1), "alice"), Date.UTC(2026, 10, 7, 14)).status === "expired", "unjoined open game expires after an hour");
ok(H.clean({ a: "open", g: "abcd2345", v: "C9x7k4t" }) === null, "three-player games can't be opened on Hive");
ok(H.clean({ a: "open", g: "abcd2345", v: "classic" }) === null, "preset ids are not game codes on chain");
ok(H.clean({ a: "mv", g: "abcd2345", h: "al", n: 0, m: "1" }) === null && H.clean({ a: "mv", g: "short", h: "alice", n: 0, m: "1" }) === null && H.clean({ a: "mv", g: "abcd2345", h: "alice", n: 0, m: "x" }) === null, "malformed ops refused");
ok(JSON.parse(H.json({ a: "mv", h: "alice", g: gid, n: 3, m: "4", acct: "x", trx: "y" })).acct === undefined, "json() drops local fields");
const mg = H.myGames("bob", ops.concat(o2));
ok(mg.length === 2 && mg[0].gid === "zzzz2222" && mg[0].role === "guest" && mg[0].trx, "my games, newest first, with trx");
ok(H.ID === "mes_c4" && H.GID_RE.test(H.newGid()), "game ids");
// self-reported results
const recOk = { a: "rec", g: "rrrr2222", v: "C7x6k4", m: "0.1.0.1.0.1.0", o: "hard", s: 0, w: 0 };
const recs = H.records(H.parse([
	entry("dan", recOk),
	entry("dan", Object.assign({}, recOk, { g: "rrrr3333", w: 1 })),                    // wrong winner
	entry("dan", Object.assign({}, recOk, { g: "rrrr4444", m: "0.1.0.1" })),            // not finished
	entry("dan", Object.assign({}, recOk, { g: "rrrr5555", m: "0.0.0.0.0.0.0" })),      // illegal
	entry("dan", Object.assign({}, recOk, { g: "rrrr6666", o: "local", s: -1, v: "C9x7k4t", m: "0.1.6.0.1.6.0.1.6.8.8.6", w: 2 })),
	entry("dan", Object.assign({}, recOk, { g: "rrrr7777", o: "local", s: 0 })),        // pass and play has no seat
	entry("dan", Object.assign({}, recOk, { g: "rrrr8888", o: "god" }))                 // unknown opponent
], "dan"));
ok(recs.length === 2 && recs[1].result === "w" && recs[0].w === 2 && recs[0].result === "", "self-reported results: only the ones that replay to the claimed winner (" + recs.map(r => r.g).join() + ")");

// ---------- server copy is identical ----------
const api = path.join(__dirname, "..", "mes.fm", "api", "_c4-lib.js");
ok(fs.existsSync(api) && fs.readFileSync(api, "utf8") === fs.readFileSync(path.join(__dirname, "connect-four", "lib.js"), "utf8"), "mes.fm/api/_c4-lib.js is a byte-identical copy (cp it)");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
