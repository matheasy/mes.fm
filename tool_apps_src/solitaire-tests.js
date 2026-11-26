// node tool_apps_src/solitaire-tests.js  (MES Solitaire rules, solver, records, the leaderboard API with a fake Redis + Hive node)
const fs = require("fs"), path = require("path");
const M = require("./solitaire/lib.js");
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL:", msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

// the served copy for the API must be identical
eq(fs.readFileSync(path.join(__dirname, "solitaire/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_solitaire-lib.js"), "utf8"), true, "api/_solitaire-lib.js is a copy of lib.js");

// Microsoft FreeCell deal #1 starts JD 2D 9H JC 5D 7H 7C 5H, and #617 starts 7D AD 5C 3S 5S 8C 2D AH
eq(M.msDeal(1).map((c) => M.name(c[0])).join(" "), "J♦ 2♦ 9♥ J♣ 5♦ 7♥ 7♣ 5♥", "MS deal 1 first row");
eq(M.msDeal(617).map((c) => M.name(c[0])).join(" "), "7♦ A♦ 5♣ 3♠ 5♠ 8♣ 2♦ A♥", "MS deal 617 first row");
eq(M.msDeal(1).map((c) => c.length), [7, 7, 7, 7, 6, 6, 6, 6], "MS columns");

// deals: every card once, right layout, same seed = same deal
function cards(g) { const all = []; g.p.forEach((a) => a.forEach((c) => all.push(c < 0 ? ~c : c))); return all.sort((a, b) => a - b); }
const k = M.newGame("k1", "abc");
eq(cards(k), Array.from({ length: 52 }, (_, i) => i), "Klondike has 52 different cards");
eq(k.p.slice(6).map((a) => a.length), [1, 2, 3, 4, 5, 6, 7], "Klondike columns");
eq(k.p[0].length, 24, "Klondike stock");
ok(k.p.slice(6).every((a) => a[a.length - 1] >= 0 && a.slice(0, -1).every((c) => c < 0)), "only the top card is face up");
eq(M.newGame("k1", "abc").p, k.p, "same seed, same deal");
ok(JSON.stringify(M.newGame("k1", "abd").p) !== JSON.stringify(k.p), "another seed, another deal");
const s4 = M.newGame("s4", "x"), s1 = M.newGame("s1", "x");
eq(cards(s4), Array.from({ length: 104 }, (_, i) => i), "Spider has 104 cards");
eq(s4.p.slice(9).map((a) => a.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], "Spider columns");
eq(s4.p[0].length, 50, "Spider stock");
ok([0, 1, 2, 3].every((su) => s4.p.flat().filter((c) => s4.suitOf(c < 0 ? ~c : c) === su).length === 26), "Spider 4 suits: 26 of each");
ok(s1.p.flat().every((c) => s1.suitOf(c < 0 ? ~c : c) === 0), "Spider 1 suit: all spades");
const f = M.newGame("f4", "1");
eq(f.p.slice(8), M.msDeal(1), "FreeCell seed 1 = MS deal 1");
eq(M.fcNumber("hello") >= 1 && M.fcNumber("hello") <= 1000000, true, "word seeds map to a deal number");

// Klondike moves
{
	const g = M.newGame("k1", "abc");
	ok(g.legal(0, 0, 0), "draw is legal");
	g.move(0, 0, 0);
	eq([g.p[0].length, g.p[1].length, g.p[1][0] >= 0], [23, 1, true], "draw 1 turns one card face up");
	for (let i = 0; i < 23; i++) g.move(0, 0, 0);
	eq(g.p[0].length, 0, "stock used up");
	const firstDrawn = g.p[1][0];
	g.move(0, 0, 0);
	eq([g.p[0].length, g.passes, g.p[1].length], [24, 1, 0], "recycle puts the waste back");
	ok(g.p[0].every((c) => c < 0), "recycled stock is face down");
	g.move(0, 0, 0);
	eq(g.top(1), firstDrawn, "after a recycle the first card drawn comes up first again");
	const g3 = M.newGame("k3p", "abc");
	for (let i = 0; i < 8; i++) g3.move(0, 0, 0);
	eq(g3.p[1].length, 24, "draw 3: eight draws empty the stock");
	ok(g3.move(0, 0, 0) && g3.passes === 1, "first recycle");
	for (let i = 0; i < 8; i++) g3.move(0, 0, 0);
	ok(g3.move(0, 0, 0) && g3.passes === 2, "second recycle");
	for (let i = 0; i < 8; i++) g3.move(0, 0, 0);
	ok(!g3.legal(0, 0, 0), "three passes: no third recycle");
}
// a hand-made Klondike position
{
	const g = M.newGame("k1", "abc");
	g.p = g.p.map(() => []);
	const C = (r, s) => s * 13 + r - 1;
	g.p[6] = [~C(5, 0), C(13, 0)];      // K spades over a face-down card
	g.p[7] = [C(12, 1)];               // Q hearts
	g.p[8] = [C(1, 2)];                // A diamonds
	ok(!g.legal(6, 1, 7), "K cannot go on a Q");
	ok(g.legal(7, 1, 6), "red Q on black K");
	ok(!g.legal(8, 1, 3), "ace only to its own suit");
	ok(g.legal(8, 1, 4), "ace of diamonds to the diamonds foundation");
	g.move(8, 1, 4);
	eq(g.score, 10, "foundation +10");
	ok(g.legal(6, 1, 8), "a King can go into an empty column");
	g.move(6, 1, 8);
	eq([g.p[6][0], g.score], [C(5, 0), 15], "the card under turns face up (+5)");
	ok(!g.legal(7, 1, 12) || g.p[12].length === 0, "Q not into an empty column");
	ok(!g.legal(7, 1, 12), "Klondike: only a King into an empty column");
}

// FreeCell multi-card moves
{
	const g = M.newGame("f4", "1");
	g.p = g.p.map(() => []);
	const C = (r, s) => s * 13 + r - 1;
	g.p[8] = [C(9, 0), C(8, 1), C(7, 0), C(6, 1), C(5, 0), C(4, 1)];
	g.p[9] = [C(10, 2)];
	for (let i = 10; i < 16; i++) g.p[i] = [C(13, 3)];
	eq(g.movable(8), 6, "a run of six can be picked up");
	eq(g.fcMax(-1), 5, "4 free cells, no empty column: 5 cards");
	ok(!g.legal(8, 6, 9), "six is too many");
	g.p[0] = [C(2, 3)];
	eq(g.fcMax(-1), 4, "3 free cells: 4 cards");
	g.p[0] = [];
	g.p[15] = [];
	eq(g.fcMax(-1), 10, "an empty column doubles it");
	ok(g.legal(8, 6, 9), "six fits with an empty column");
	eq(g.fcMax(15), 5, "moving INTO the empty column does not count it");
	const g2 = M.newGame("f2", "1");
	ok(!g2.isCell(2) && g2.isCell(1), "2-cell FreeCell has cells 0 and 1 only");
	g2.p[0] = []; g2.p[1] = [];
	ok(g2.legal(8, 1, 1) && !g2.legal(8, 1, 2), "no card into a missing cell");
}

// Spider: runs go up by themselves, dealing needs every column filled
{
	const g = M.newGame("s1", "x");
	const run = []; for (let r = 13; r >= 2; r--) run.push(r - 1);   // K..2 of group 0 (spades)
	g.p[9] = [~20, ...run];
	g.p[10] = [0 + 13];  // ace from group 1 (also spades in 1-suit spider)
	ok(g.legal(10, 1, 9), "ace onto the 2");
	g.move(10, 1, 9);
	eq([g.runs, g.p[1].length, g.p[9].length, g.p[9][0]], [1, 13, 1, 20], "complete run removed, card under turned over");
	ok(!g.legal(0, 0, 0), "cannot deal with an empty column");
	const g4 = M.newGame("s4", "x");
	g4.p[9] = [26 + 4, 13 + 3]; // 5 of group 2 (diamonds), 4 of group 1 (hearts): different suits
	eq(g4.movable(9), 1, "different suits do not move together in Spider");
	ok(g4.legal(0, 0, 0), "deal with every column filled");
	g4.move(0, 0, 0);
	eq([g4.p[0].length, g4.p.slice(9).every((a) => a[a.length - 1] >= 0)], [40, true], "a dealt row is face up");
	eq(g4.score, 499, "spider: each action costs a point");
}

// hint and auto-finish
{
	const g = M.newGame("k1", "abc");
	const h = g.hint();
	ok(h && g.legal(h[0], h[1], h[2]), "the hint is a legal move");
	const f2 = M.newGame("f4", "1");
	ok(f2.hint(), "FreeCell has a hint");
	const end = M.newGame("k1", "abc");
	end.p = end.p.map(() => []);
	for (let s = 0; s < 4; s++) { for (let r = 1; r <= 11; r++) end.p[2 + s].push(s * 13 + r - 1); }
	end.p[6] = [12, 11]; end.p[7] = [25, 24]; end.p[8] = [38, 37]; end.p[9] = [51, 50];
	const fin = M.autoFinish(end);
	ok(fin && fin.length === 8, "auto-finish clears a face-up board");
}

// solver: a solution replays to a won game
{
	let wins = 0, checked = 0;
	for (let i = 0; i < 12; i++) {
		const r = M.solve("k1", "t" + i);
		if (!r.win) continue;
		wins++;
		const rp = M.replay("k1", "t" + i, r.moves);
		ok(rp.ok, "solver moves are legal (t" + i + ")");
		const fin = rp.game.won() ? [] : M.autoFinish(rp.game);
		ok(rp.game.won() || (fin && fin.length), "solver result finishes (t" + i + ")");
		checked++;
	}
	ok(wins >= 6, "the solver wins most Klondike deals (" + wins + "/12)");
	eq(M.solve("f4", "11982").win, false, "FreeCell 11982 is the famous lost deal");
	eq(M.solve("f4", "1").win, true, "FreeCell 1 can be won");
}

// daily deals
{
	const a = M.dailyCanon("2026-11-25", "k1"), b = M.dailyCanon("2026-11-25", "k1");
	eq(a, b, "daily canonical deal is the same every time");
	ok(M.solve("k1", a.seed).win, "daily Klondike is winnable");
	ok(M.dailySeed("2026-11-25", "s1") !== M.dailySeed("2026-11-26", "s1"), "new deal every day");
	ok(/^\d+$/.test(M.dailySeed("2026-11-25", "f4")), "daily FreeCell is a deal number");
}

// moves as text, records and their check
{
	const list = [[0, 0, 0, 1200], [6, 13, 12, 845], [1, 1, 5, 99999]];
	eq(M.decMoves(M.encMoves(list)), list, "moves round trip");
	eq(M.decMoves("zz"), null, "bad move text");
	// a real win: solver moves with human-like timing
	const seed = "t0";
	const r = M.solve("k1", seed);
	let mv = r.moves.slice();
	let rp = M.replay("k1", seed, mv);
	if (!rp.game.won()) mv = mv.concat(M.autoFinish(rp.game));
	const list2 = mv.map((m) => [m[0], m[1], m[2], 900]);
	const rec = M.record("k1", seed, list2, { u: 2 });
	eq([rec.c, rec.t, rec.u], [list2.length, list2.length * 900, 2], "record fields");
	const v = M.verify(JSON.parse(M.json(rec)));
	ok(v.ok && v.board === "a:k1", "a real win checks out: " + v.why);
	eq(M.verify(Object.assign({}, rec, { t: rec.t + 1 })).ok, false, "time must match the moves");
	eq(M.verify(Object.assign({}, rec, { sc: rec.sc + 5 })).ok, false, "score must match");
	eq(M.verify(Object.assign({}, rec, { s: "t1" })).ok, false, "another deal fails");
	const fast = M.record("k1", seed, mv.map((m) => [m[0], m[1], m[2], 20]));
	eq(M.verify(fast).ok, false, "too fast");
	const notWon = M.record("k1", seed, list2.slice(0, -3));
	eq(M.verify(notWon).why, "That game was not won.", "an unfinished game is not a win");
	const drec = Object.assign({}, rec, { d: "2026-11-25" });
	eq(M.verify(drec, { dailySeed: "something else" }).ok, false, "daily: must be that day's deal");
	eq(M.verify(drec, { dailySeed: seed }).board, "d:2026-11-25:k1", "daily board key");
	ok(M.json(rec).length < 8192, "fits in one custom_json");
}

// Hive history parsing
{
	const ops = [
		[1, { trx_id: "aa", block: 5, timestamp: "2026-11-25T10:00:00", op: ["custom_json", { id: "mes_solitaire", required_posting_auths: ["bob"], required_auths: [], json: '{"v":1}' }] }],
		[2, { trx_id: "bb", op: ["custom_json", { id: "mes_solitaire", required_posting_auths: ["eve"], required_auths: [], json: '{"v":1}' }] }],
		[3, { trx_id: "cc", op: ["custom_json", { id: "other", required_posting_auths: ["bob"], required_auths: [], json: "{}" }] }]
	];
	const out = M.parseHistory(ops, "bob");
	eq(out.map((o) => o.trx), ["aa"], "only bob's own mes_solitaire ops");
	eq(out[0].ts, Date.parse("2026-11-25T10:00:00Z"), "timestamp read as UTC");
}

// the API with a fake Redis and Hive node
(async function () {
	const store = {}, z = {};
	process.env.UPSTASH_REDIS_REST_URL = "https://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
	let hiveOps = [];
	global.fetch = async (url, opt) => {
		if (String(url).startsWith("https://redis.test")) {
			const cmds = JSON.parse(opt.body);
			return { json: async () => cmds.map((c) => {
				const [op, key, ...a] = c;
				if (op === "INCR") { store[key] = (store[key] | 0) + 1; return { result: store[key] }; }
				if (op === "EXPIRE") return { result: 1 };
				if (op === "GET") return { result: store[key] == null ? null : store[key] };
				if (op === "SET") { if (a.includes("NX") && store[key] != null) return { result: null }; store[key] = a[0]; return { result: "OK" }; }
				if (op === "ZADD") { (z[key] = z[key] || {})[a[1]] = +a[0]; return { result: 1 }; }
				if (op === "ZSCORE") return { result: z[key] && z[key][a[0]] != null ? String(z[key][a[0]]) : null };
				const sorted = () => Object.entries(z[key] || {}).sort((x, y) => x[1] - y[1]).map((e) => e[0]);
				if (op === "ZRANGE") return { result: sorted().slice(+a[0], +a[1] + 1) };
				if (op === "ZRANK") return { result: sorted().indexOf(a[0]) };
				if (op === "ZCARD") return { result: Object.keys(z[key] || {}).length };
				if (op === "HSET") { (store[key] = store[key] || {})[a[0]] = a[1]; return { result: 1 }; }
				if (op === "HMGET") return { result: a.map((f) => (store[key] || {})[f] || null) };
				return { result: null };
			}) };
		}
		return { json: async () => ({ result: hiveOps }) };
	};
	const handler = require("../mes.fm/api/solitaire.js");
	function call(method, body, query) {
		return new Promise((resolve) => {
			const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
			handler({ method, body, query: query || {}, headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" } }, res);
		});
	}
	const seed = "t0", r = M.solve("k1", seed);
	let mv = r.moves.slice(); const rp = M.replay("k1", seed, mv); if (!rp.game.won()) mv = mv.concat(M.autoFinish(rp.game));
	const rec = M.record("k1", seed, mv.map((m) => [m[0], m[1], m[2], 700]));
	const trx = "a".repeat(40);
	hiveOps = [[1, { trx_id: trx, block: 9, timestamp: new Date().toISOString().slice(0, 19), op: ["custom_json", { id: "mes_solitaire", required_posting_auths: ["bob"], required_auths: [], json: M.json(rec) }] }]];
	let res = await call("POST", { act: "submit", acct: "bob", trx });
	eq([res.code, res.body.board, res.body.rank], [200, "a:k1", 1], "API ranks a verified win");
	res = await call("POST", { act: "submit", acct: "eve", trx: "b".repeat(40) });
	eq(res.code, 404, "unknown transaction");
	hiveOps = [[1, { trx_id: "c".repeat(40), block: 9, timestamp: new Date().toISOString().slice(0, 19), op: ["custom_json", { id: "mes_solitaire", required_posting_auths: ["eve"], required_auths: [], json: M.json(rec) }] }]];
	res = await call("POST", { act: "submit", acct: "eve", trx: "c".repeat(40) });
	eq(res.code, 409, "a copy of someone else's moves is refused");
	res = await call("GET", null, { board: "a:k1", n: "10" });
	eq([res.code, res.body.top.length, res.body.top[0].acct], [200, 1, "bob"], "leaderboard lists the win");
	res = await call("GET", null, { board: "nope" });
	eq(res.code, 400, "bad board key");
	// daily: the deal must be today's canonical one
	const today = M.utcDate(), canon = M.dailyCanon(today, "k1");
	const r2 = M.solve("k1", canon.seed);
	let mv2 = r2.moves.slice(); const rp2 = M.replay("k1", canon.seed, mv2); if (!rp2.game.won()) mv2 = mv2.concat(M.autoFinish(rp2.game));
	const drec = M.record("k1", canon.seed, mv2.map((m) => [m[0], m[1], m[2], 650]), { d: today });
	hiveOps = [[1, { trx_id: "d".repeat(40), block: 9, timestamp: new Date().toISOString().slice(0, 19), op: ["custom_json", { id: "mes_solitaire", required_posting_auths: ["bob"], required_auths: [], json: M.json(drec) }] }]];
	res = await call("POST", { act: "submit", acct: "bob", trx: "d".repeat(40) });
	eq([res.code, res.body.board], [200, "d:" + today + ":k1"], "daily win ranked");
	res = await call("GET", null, { daily: today });
	eq(res.body.k1, 1, "daily player count");
	console.log(pass + " passed, " + fail + " failed");
	process.exit(fail ? 1 : 0);
})();
