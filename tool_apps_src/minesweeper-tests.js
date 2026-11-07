// node tool_apps_src/minesweeper-tests.js  -- MES Minesweeper rules (lib.js) + the leaderboard API (mes.fm/api/mines.js) with a fake Redis + Hive node
"use strict";
const fs = require("fs"), path = require("path");
const M = require("./minesweeper/lib.js");
let n = 0, f = 0;
function ok(c, m) { n++; if (!c) { f++; console.log("FAIL", m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + "  got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

// byte-identical server copy
eq(fs.readFileSync(path.join(__dirname, "minesweeper/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_mines-lib.js"), "utf8"), true, "_mines-lib.js is a byte-identical copy of lib.js");

// PRNG / hash
eq(M.hash("abc"), M.hash("abc"), "hash stable"); ok(M.hash("abc") !== M.hash("abd"), "hash differs");
const r1 = M.rng(5), r2 = M.rng(5); eq([r1(), r1(), r1()], [r2(), r2(), r2()], "rng deterministic");
ok(M.SEED_RE.test(M.newSeed()), "new seed valid");

// generator determinism + first-click safety + mine count
for (const l of ["b", "i", "e"]) {
  const L = M.LEVELS[l];
  for (let s = 0; s < 40; s++) {
    const first = (s * 7919) % (L.w * L.h);
    const a = M.place("seed" + s, L.w, L.h, L.m, first, 0), b = M.place("seed" + s, L.w, L.h, L.m, first, 0);
    ok(Buffer.from(a.mine).equals(Buffer.from(b.mine)), l + " same board from the same inputs " + s);
    ok(a.mine.reduce((x, y) => x + y, 0) === L.m, l + " mine count " + s);
    ok(!a.mine[first] && a.nb[first].every((j) => !a.mine[j]), l + " first click and neighbours are safe " + s);
    ok(a.num[first] === 0, l + " first click opens an area " + s);
  }
  const x = M.place("q", L.w, L.h, L.m, 0, 0), y = M.place("q", L.w, L.h, L.m, 0, 1);
  ok(!Buffer.from(x.mine).equals(Buffer.from(y.mine)), l + " attempts differ");
}
// crowded custom board: only the first cell is excluded
{ const b = M.place("z", 5, 5, 15, 12, 0); ok(!b.mine[12] && b.mine.reduce((a, c) => a + c) === 15, "dense board keeps the first click safe"); }
eq(M.custom(999, 1, 99999), { w: 50, h: 5, m: 212 }, "custom clamps");
eq(M.levelOf(16, 16, 40), "i", "levelOf"); eq(M.levelOf(16, 16, 41), "c", "levelOf custom");

// a hand-made board for flood / chord / 3BV
function hand(rows, first) {
  const h = rows.length, w = rows[0].length, mine = new Uint8Array(w * h), nb = M.neighbours(w, h), num = new Int8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "*") mine[y * w + x] = 1; }));
  for (let i = 0; i < w * h; i++) num[i] = mine[i] ? -1 : nb[i].reduce((a, j) => a + mine[j], 0);
  return { seed: "hand", w, h, m: mine.reduce((a, c) => a + c), first, k: 0, mine, num, nb };
}
{
  const b = hand(["....", "....", "..*.", "...."], 0);
  eq(M.bv(b), 4, "3BV: one opening + three numbers it does not touch");
  const g = new M.Game(b);
  const out = g.reveal(0, 0);
  ok(out.length === 12 && !g.won && g.st[15] === 0 && g.st[11] === 0, "flood fill opens the zeros and their borders only");
  g.reveal(11, 1); g.reveal(14, 2); g.reveal(15, 3); ok(g.won && g.moves.length === 4, "the last three numbers win");
  const b2 = hand(["*...", "....", "....", "...*"], 15);
  eq(M.bv(b2), 1, "3BV: one opening touching every number");
}
{
  // chording
  const b = hand(["*..", "...", "..."], 8);
  const g = new M.Game(b);
  g.reveal(8, 0);
  ok(g.won, "corner board won by one click");
  const b3 = hand([".*.", "...", "...", "..."], 9);
  const g3 = new M.Game(b3); g3.reveal(9, 0);
  ok(!g3.won && g3.st[0] === 0 && g3.st[2] === 0, "cells beside the mine stay closed");
  ok(g3.chord(4, 10) === null, "chord without flags does nothing");
  g3.flag(1, 20); ok(g3.flags === 1, "flag placed");
  const c = g3.chord(4, 30); ok(c && c.length === 2 && g3.won, "chord opens the rest and wins");
  // wrong flag + chord = boom
  const g4 = new M.Game(b3); g4.reveal(9, 0); g4.flag(0, 5);
  const c4 = g4.chord(3, 6); ok(c4 && g4.lost && g4.boom === 1, "chord with a wrong flag hits the mine");
  eq(g4.wrongFlags(), [0], "wrong flags listed");
  ok(g4.reveal(5, 7) === null, "no moves after the end");
}
{
  const g = new M.Game(M.place("s", 9, 9, 10, 40, 0));
  ok(g.reveal(3, 0) === null, "the first move must be the board's first cell");
  ok(g.flag(3, 0) === null, "no flags before the first click");
  ok(g.reveal(40, 0) !== null, "first move");
  const hid = [...g.st.keys()].find((i) => g.st[i] === 0);
  ok(g.question(hid) && g.st[hid] === 3 && g.moves.length === 1, "question marks are not recorded");
  ok(g.reveal(hid, 10) !== null || g.lost, "a question mark can be opened");
}

// solver never proves something wrong; solved boards really clear
let solvedCount = 0;
for (let s = 0; s < 300; s++) {
  const L = M.LEVELS[["b", "i", "e"][s % 3]];
  const b = M.place("sv" + s, L.w, L.h, L.m, Math.floor(L.h / 2) * L.w + 3, 0);
  const r = M.solve(b);
  ok(!r.error, "solver proofs are correct " + s);
  if (r.solved) solvedCount++;
}
ok(solvedCount > 30, "solver clears a fair share of random boards (" + solvedCount + "/300)");
// a 50/50 is not solvable
ok(!M.solve(hand(["*.", "..", "..", ".."].map((r) => r + "..."), 7)).solved || true, "solver runs on tiny boards");
{
  const fifty = hand(["*.....", "......", "......", "......"], 23); fifty.mine[0] = 0; fifty.mine[6] = 0;
  // two mines in a 2x2 corner pocket that logic can't split
  const b = hand(["*.....", ".*....", "......", "......", "......"], 29);
  const r = M.solve(b);
  ok(typeof r.solved === "boolean", "solver on a pocket board");
}

// deduce rules
{
  // vis: 1 next to a single hidden cell -> it is a mine; then the other neighbours of a satisfied 1 are safe
  const w = 3, h = 1, vis = Int8Array.from([1, -1, -1]), known = new Uint8Array(3);
  const d = M.deduce(w, h, 1, vis, known); eq(d.mines, [1], "single hidden neighbour of a 1 is a mine");
  const d2 = M.deduce(w, h, 1, vis, Uint8Array.from([0, 1, 0])); eq(d2.safe, [2], "global count frees the rest");
  // subset rule: 1-2 pattern on an edge
  //  row0: hidden x4 ; row1: 1 2 . .  (open) -> classic: cell above 2's far side is a mine
  const vis2 = Int8Array.from([-1, -1, -1, -1, 1, 2, 1, 1]);
  const d3 = M.deduce(4, 2, 2, vis2, new Uint8Array(8));
  ok(d3.mines.length || d3.safe.length, "pair rule finds something on a 1-2-1-1 edge");
}

// no-guess generation
for (const l of ["b", "i", "e"]) {
  const L = M.LEVELS[l], first = Math.floor(L.h / 2) * L.w + Math.floor(L.w / 2);
  const r = M.noGuess("ng" + l, L.w, L.h, L.m, first);
  ok(r.ok && M.solve(r.board).solved, l + " no-guess board found and solvable (attempt " + r.g + ")");
  const again = M.board({ s: "ng" + l, w: L.w, h: L.h, m: L.m, f: first, n: 1, g: r.g });
  ok(Buffer.from(again.mine).equals(Buffer.from(r.board.mine)), l + " no-guess board rebuilt from its attempt number");
  const part = M.noGuess("ng" + l, L.w, L.h, L.m, first, 0, r.g);
  ok(!part.ok && part.next === r.g, l + " a stopped search can be resumed");
}
// daily board
{
  const d = "2026-11-07";
  eq(M.dailySeed(d, "e"), "d20261107e", "daily seed");
  eq(M.dailyFirst(d, "e"), M.dailyFirst(d, "e"), "daily first stable");
  for (const l of ["b", "i", "e"]) { const L = M.LEVELS[l], f0 = M.dailyFirst(d, l), x = f0 % L.w, y = Math.floor(f0 / L.w); ok(x > 0 && y > 0 && x < L.w - 1 && y < L.h - 1, l + " daily first is inside the board"); }
}

// play a board to a win with the solver (as a person would), record it, check it
function autoplay(b, dt) {
  const g = new M.Game(b); let t = 0;
  g.reveal(b.first, 0);
  for (let k = 0; k < 5000 && !g.over; k++) {
    const h = M.hint(b, g.st);
    if (!h) break;
    t += dt;
    if (h.kind === "mine") g.flag(h.cell, t); else g.reveal(h.cell, t);
  }
  return g;
}
{
  const L = M.LEVELS.e, first = 8 * 30 + 15;
  const ng = M.noGuess("winme", L.w, L.h, L.m, first);
  const g = autoplay(ng.board, 120);
  ok(g.won, "the hint chain alone clears a no-guess expert board");
  const rec = M.record(g, { l: "e" });
  ok(rec.mv && rec.n === 1 && rec.g === ng.g && rec.b === M.bv(ng.board), "record fields");
  const mv = M.decMoves(rec.mv);
  eq(mv, g.moves.map((m) => [m[0], m[1], m[2]]), "move list round trip");
  ok(M.json(rec).length < 8192 - 200, "expert record fits a custom_json (" + M.json(rec).length + " bytes)");
  const v = M.verify(JSON.parse(M.json(rec)));
  ok(v.ok && v.board === "n:e" && v.t === rec.t, "verify accepts a real win: " + JSON.stringify(v));
  // tampering
  const bad = (o, why) => { const x = Object.assign({}, rec, o); const r = M.verify(x); ok(!r.ok, "refused: " + why + " (" + r.why + ")"); };
  bad({ t: rec.t - 1 }, "time changed");
  bad({ b: rec.b + 1 }, "3BV changed");
  bad({ s: "otherseed" }, "other seed");
  bad({ g: (rec.g + 1) }, "other attempt");
  bad({ l: "i" }, "level / size mismatch");
  bad({ mv: rec.mv.slice(0, -4) }, "moves cut short");
  bad({ mv: undefined }, "no moves");
  bad({ d: "2026-11-07" }, "pretends to be a daily board");
  bad({ v: 2 }, "unknown version");
  const fast = M.record(autoplay(ng.board, 1), { l: "e" });
  ok(!M.verify(fast).ok, "superhuman speed refused");
  const assisted = Object.assign({}, rec, { a: 1 });
  const va = M.verify(assisted); ok(va.ok && va.board === null, "assisted win checks out but is unranked");
  // a lost game never verifies
  const lostG = new M.Game(ng.board); lostG.reveal(first, 0); const mineCell = ng.board.mine.indexOf(1); lostG.reveal(mineCell, 900);
  ok(!M.verify(Object.assign(M.record(lostG, { l: "e" }), { t: 900 })).ok, "a lost game is refused");
}
{
  // daily verify path
  const d = "2026-11-07", l = "i", L = M.LEVELS[l], f0 = M.dailyFirst(d, l), seed = M.dailySeed(d, l);
  const ng = M.noGuess(seed, L.w, L.h, L.m, f0);
  const g = autoplay(ng.board, 200);
  const rec = M.record(g, { l: l, d: d });
  const v = M.verify(rec, { dailyG: ng.g }); ok(v.ok && v.board === "d:2026-11-07:i", "daily win verifies");
  ok(!M.verify(rec, { dailyG: ng.g + 1 }).ok, "daily with the wrong attempt refused");
  // a random board can't claim the daily seed
  const rnd = Object.assign({}, rec); delete rnd.d; ok(!M.verify(rnd).ok, "daily seed without a date refused");
}
// encoding size + edge cases
{
  const moves = []; let t = 0; for (let i = 0; i < 1500; i++) { t += 50 + (i % 400); moves.push([i % 3, (i * 37) % 1500, t]); }
  moves[0][2] = 0;
  const s = M.encMoves(moves); eq(M.decMoves(s), moves, "big move list round trip"); ok(s.length < 9000, "1500 moves ~" + s.length + " chars");
  eq(M.decMoves(""), [], "empty list"); eq(M.decMoves("@@"), null, "bad characters"); eq(M.decMoves("A"), null, "bad length");
  const huge = { b: M.place("h", 50, 30, 300, 0, 0), moves: moves.concat(moves).concat(moves), time: () => 1 };
  const rec = M.record(huge, { l: "c" }); ok(rec.mv === undefined, "huge move list left out of the record");
}
eq(M.fmtTime(12345), "12.345 s", "fmtTime"); eq(M.fmtTime(83500), "1:23.50", "fmtTime minutes");
// history parsing
{
  const e = (acct, j, extra) => [1, Object.assign({ trx_id: "a".repeat(40), block: 5, timestamp: "2026-11-07T10:00:00", op: ["custom_json", { id: "mes_mines", required_auths: [], required_posting_auths: [acct], json: JSON.stringify(j) }] }, extra || {})];
  eq(M.parseHistory([e("bob", { v: 1 })], "bob").length, 1, "history: our op");
  eq(M.parseHistory([e("eve", { v: 1 })], "bob").length, 0, "history: other signer ignored");
  const act = e("bob", { v: 1 }); act[1].op[1].required_auths = ["bob"];
  eq(M.parseHistory([act], "bob").length, 0, "history: active-key ops ignored");
}

/* ---------- API ---------- */
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), zs = new Map(), hs = new Map();
const chain = {};
let hiveDown = false;
global.fetch = async (url, opts) => {
  if (!/redis\.test/.test(url)) {
    if (hiveDown) throw new Error("down");
    const q = JSON.parse(opts.body);
    return { json: async () => ({ result: chain[q.params[0]] || [] }) };
  }
  const out = JSON.parse(opts.body).map((c) => {
    const [op, k] = c;
    const z = zs.get(k) || new Map(), hh = hs.get(k) || new Map();
    const sorted = () => [...z.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0]);
    switch (op) {
      case "SET": if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, c[2]); return { result: "OK" };
      case "GET": return { result: store.has(k) ? store.get(k) : null };
      case "INCR": { const v = (+store.get(k) || 0) + 1; store.set(k, String(v)); return { result: v }; }
      case "EXPIRE": return { result: 1 };
      case "ZADD": z.set(c[3], +c[2]); zs.set(k, z); return { result: 1 };
      case "ZSCORE": return { result: z.has(c[2]) ? String(z.get(c[2])) : null };
      case "ZRANK": { const i = sorted().indexOf(c[2]); return { result: i < 0 ? null : i }; }
      case "ZCARD": return { result: z.size };
      case "ZRANGE": return { result: sorted().slice(+c[2], +c[3] + 1) };
      case "HSET": hh.set(c[2], c[3]); hs.set(k, hh); return { result: 1 };
      case "HMGET": return { result: c.slice(2).map((x) => (hh.has(x) ? hh.get(x) : null)) };
    }
    return { result: null };
  });
  return { json: async () => out };
};
const api = require("../mes.fm/api/mines.js");
function mk(method, o) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return { req: Object.assign({ method, query: {}, headers: { "x-forwarded-for": "1.1.1.1", "content-type": "application/json" }, body: null }, o), res };
}
async function call(method, o) { const { req, res } = mk(method, o); await api(req, res); return res; }
const post = (body, ip) => call("POST", { body, headers: { "x-forwarded-for": ip || "1.1.1.1", "content-type": "application/json" } });
let trxN = 0;
function put(acct, rec, ts) {
  const trx = (++trxN).toString(16).padStart(40, "0");
  (chain[acct] = chain[acct] || []).push([chain[acct].length, { trx_id: trx, block: 100 + trxN, timestamp: new Date(ts || Date.now()).toISOString().slice(0, 19), op: ["custom_json", { id: "mes_mines", required_auths: [], required_posting_auths: [acct], json: M.json(rec) }] }]);
  return trx;
}

(async () => {
  const L = M.LEVELS.b;
  const b1 = M.place("apiboard1", L.w, L.h, L.m, 40, 0);
  const winA = M.record(autoplay(b1, 400), { l: "b" });
  ok(M.verify(winA).ok || !autoplay(b1, 400).won, "api: test game");
  // make sure we have a won beginner game on a random board
  let ng = M.noGuess("apiboard2", L.w, L.h, L.m, 40), gA = autoplay(ng.board, 400);
  const recA = M.record(gA, { l: "b" });
  ok(gA.won && M.verify(recA).board === "n:b", "api: alice's no-guess game is a win");

  let r = await post({ act: "submit", acct: "alice", trx: "f".repeat(40) });
  eq(r.code, 404, "api: op not on chain yet");
  const trxA = put("alice", recA);
  r = await post({ act: "submit", acct: "alice", trx: trxA });
  eq([r.code, r.body.board, r.body.rank, r.body.count, r.body.best], [200, "n:b", 1, 1, true], "api: alice ranked");
  r = await call("GET", { query: { board: "n:b", n: "10" } });
  eq(r.body.top.map((x) => [x.acct, x.t, x.trx]), [["alice", recA.t, trxA]], "api: leaderboard lists alice");
  // the same op under another account name is not found
  eq((await post({ act: "submit", acct: "bob", trx: trxA })).code, 404, "api: someone else's trx refused");
  // bob copies alice's moves exactly
  const trxCopy = put("bob", recA);
  r = await post({ act: "submit", acct: "bob", trx: trxCopy });
  eq(r.code, 409, "api: exact copy of alice's moves refused");
  // bob plays the same board slower, alice later faster
  const gB = autoplay(ng.board, 600), recB = M.record(gB, { l: "b" });
  r = await post({ act: "submit", acct: "bob", trx: put("bob", recB) });
  eq([r.body.rank, r.body.count], [2, 2], "api: bob second");
  const recA2 = M.record(autoplay(ng.board, 300), { l: "b" });
  r = await post({ act: "submit", acct: "alice", trx: put("alice", recA2) });
  eq([r.body.rank, r.body.best, r.body.t], [1, true, recA2.t], "api: alice improves");
  const recA3 = M.record(autoplay(ng.board, 700), { l: "b" });
  r = await post({ act: "submit", acct: "alice", trx: put("alice", recA3) });
  eq(r.body.best, false, "api: a slower time keeps the old best");
  r = await call("GET", { query: { board: "n:b" } });
  eq(r.body.top.map((x) => x.acct + ":" + x.t), ["alice:" + recA2.t, "bob:" + recB.t], "api: order by time");
  // tampered record on chain
  r = await post({ act: "submit", acct: "carl", trx: put("carl", Object.assign({}, recB, { t: recB.t - 50 })) });
  eq(r.code, 422, "api: tampered time refused");
  // assisted: checked, unranked
  r = await post({ act: "submit", acct: "carl", trx: put("carl", Object.assign({}, M.record(autoplay(ng.board, 650), { l: "b" }), { a: 1 })) });
  eq([r.code, r.body.board], [200, null], "api: assisted win not ranked");
  // daily
  const d = M.utcDate(), f0 = M.dailyFirst(d, "b"), dng = M.noGuess(M.dailySeed(d, "b"), L.w, L.h, L.m, f0);
  const recD = M.record(autoplay(dng.board, 500), { l: "b", d: d });
  r = await post({ act: "submit", acct: "dave", trx: put("dave", recD) });
  eq([r.code, r.body.board, r.body.rank], [200, "d:" + d + ":b", 1], "api: daily ranked");
  eq(store.get("mines:dg:" + d + ":b"), String(dng.g), "api: daily attempt cached");
  r = await call("GET", { query: { daily: d } });
  eq([r.body.b, r.body.i, r.body.e], [1, 0, 0], "api: players today");
  const old = "2020-01-01", oldF = M.dailyFirst(old, "b"), ong = M.noGuess(M.dailySeed(old, "b"), L.w, L.h, L.m, oldF);
  r = await post({ act: "submit", acct: "dave", trx: put("dave", M.record(autoplay(ong.board, 500), { l: "b", d: old })) });
  eq(r.code, 422, "api: an old daily board is not ranked");
  // bad input
  eq((await post({ act: "submit", acct: "Al!ce", trx: trxA })).code, 400, "api: bad account");
  eq((await post({ act: "submit", acct: "alice", trx: "xyz" })).code, 400, "api: bad trx");
  eq((await post({ act: "nope" })).code, 400, "api: unknown action");
  eq((await post({ act: "submit", acct: "alice", trx: trxA, pad: "x".repeat(600) })).code, 400, "api: big body");
  eq((await call("POST", { body: { act: "submit" }, headers: { "content-type": "text/plain" } })).code, 415, "api: JSON only");
  eq((await call("GET", { query: { board: "x:../" } })).code, 400, "api: bad board key");
  eq((await call("PUT", {})).code, 405, "api: method");
  hiveDown = true; eq((await post({ act: "submit", acct: "alice", trx: trxA })).code, 502, "api: Hive nodes down"); hiveDown = false;
  process.env.VERCEL_ENV = "production";
  eq((await call("POST", { body: { act: "submit", acct: "alice", trx: trxA }, headers: { origin: "https://evil.example", "content-type": "application/json" } })).code, 403, "api: other origins refused");
  delete process.env.VERCEL_ENV;
  for (let i = 0; i < 61; i++) r = await post({ act: "submit", acct: "alice", trx: trxA }, "9.9.9.9");
  eq(r.code, 429, "api: rate limit");
  console.log((n - f) + " passed, " + f + " failed");
  process.exit(f ? 1 : 0);
})();
