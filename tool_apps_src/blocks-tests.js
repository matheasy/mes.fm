// node tool_apps_src/blocks-tests.js  -- MES Falling Blocks: rules (lib.js) + the leaderboard / race API (mes.fm/api/blocks.js) with a fake Redis and Hive node
"use strict";
const fs = require("fs"), path = require("path");
const B = require("./blocks/lib.js");
let f = 0, n = 0;
function ok(c, m) { n++; if (!c) { f++; console.log("FAIL", m); } }
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }

// the server copy must be the same file
eq(fs.readFileSync(path.join(__dirname, "blocks/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_blocks-lib.js"), "utf8"), true, "api/_blocks-lib.js is a byte-identical copy (cp tool_apps_src/blocks/lib.js mes.fm/api/_blocks-lib.js)");

// shapes: 4 cells, 4 distinct rotations for T J L, O never changes, rotating 4 times returns
"IOTSZJL".split("").forEach((p) => {
  const st = B.SHAPES[p];
  eq(st.length, 4, p + " has 4 states");
  st.forEach((s) => eq(s.length, 4, p + " 4 cells"));
  eq(JSON.stringify(st[0]), JSON.stringify(B.SHAPES[p][0]), p + " stable");
});
eq(B.SHAPES.O[1], B.SHAPES.O[0], "O does not rotate");
eq(B.SHAPES.T[1].map((c) => c.join()).sort(), ["1,0", "1,1", "1,2", "2,1"], "T state R points right");
eq(B.SHAPES.I[1].every((c) => c[0] === 2), true, "I state R sits in column 2 of its box (SRS)");

// 7-bag: every 7 pieces from the start are a permutation
const seq = B.sequence("bagtest", 700);
let bagOk = true;
for (let i = 0; i < 700; i += 7) if (seq.slice(i, i + 7).sort().join("") !== "IJLOSTZ") bagOk = false;
ok(bagOk, "7-bag: each group of 7 has every piece once");
eq(B.sequence("abc", 14), B.sequence("abc", 14), "same seed, same pieces");
ok(B.sequence("abc", 14).join("") !== B.sequence("abd", 14).join(""), "different seed, different pieces");

// gravity table
eq(B.gravUs(1), 1000000, "level 1 = 1 row a second"); eq(B.gravUs(20), 455, "level 20 ≈ 20G"); eq(B.gravUs(1, true), 50000, "soft drop 20x");

// spawn: box at x 3, drops one row at once
let g = new B.Game({ seed: "s1", mode: "m" });
eq([g.cur.x, g.cur.y], [3, 3], "spawn at x 3, y 3 (2 + the immediate drop)");
const first = g.cur.p;
eq(first, B.sequence("s1", 1)[0], "first piece = first of the bag");

// SRS: I rotation and a wall kick
g = new B.Game({ seed: "k" });
g.cur = { p: "I", r: 0, x: 3, y: 5 }; g.rotate(1);
eq(g.cells(g.cur).map((c) => c[0]), [5, 5, 5, 5], "I turns into column 5");
g.cur = { p: "I", r: 1, x: -2, y: 5 }; ok(g.fits("I", 1, -2, 5), "vertical I at the left wall");
ok(g.rotate(1), "turning against the wall works (kick)"); eq([g.cur.r, g.cur.x], [2, 0], "kicked 2 to the right (SRS I R->2 test 3)");
g.cur = { p: "T", r: 0, x: 3, y: 10 }; ok(g.rotate(2), "180 rotation"); eq(g.cur.r, 2, "state 2 after 180");

// T-spin double, 3-corner rule
function boardFrom(rows) { const b = new Uint8Array(B.W * B.H); rows.forEach((r, i) => { const y = B.H - rows.length + i; for (let x = 0; x < 10; x++) if (r[x] === "#") b[y * 10 + x] = 8; }); return b; }
g = new B.Game({ seed: "ts" });
g.board = boardFrom(["...#......", "###...####", "####.#####"]);
g.cur = { p: "T", r: 2, x: 3, y: 21 }; g.lastRot = true; g.lastKick = 0; g.ev = [];
ok(g.fits("T", 2, 3, 21), "T fits the slot");
g.hardDrop();
let lockEv = g.ev.find((e) => e.k === "lock");
eq([lockEv.n, lockEv.ts], [2, "full"], "T-spin double detected");
eq(g.score, 1200, "TSD = 1200 x level 1");
eq(lockEv.atk, 4, "TSD sends 4 lines");
// same slot without a rotation = no T-spin
g = new B.Game({ seed: "ts" });
g.board = boardFrom(["...#......", "###...####", "####.#####"]);
g.cur = { p: "T", r: 2, x: 3, y: 21 }; g.lastRot = false; g.ev = []; g.hardDrop();
eq(g.ev.find((e) => e.k === "lock").ts, "", "no rotation = no T-spin");
eq(g.score, 300, "plain double = 300");

// a quad, then back-to-back quad x1.5 and a combo
g = new B.Game({ seed: "q" });
g.board = boardFrom(["#########.", "#########.", "#########.", "#########.", "#########.", "#########.", "#########.", "#########."]);
g.cur = { p: "I", r: 1, x: 7, y: 4 }; g.ev = []; g.score = 0; g.hardDrop();
eq(g.lines, 4, "quad clears 4"); eq(g.stats.quads, 1, "quad counted");
const s1 = g.score;
g.cur = { p: "I", r: 1, x: 7, y: 4 }; g.ev = []; g.hardDrop();
lockEv = g.ev.find((e) => e.k === "lock");
eq(lockEv.b2b, 1, "back-to-back"); eq(lockEv.combo, 1, "combo 1");
ok(lockEv.pc === true, "perfect clear (the board is empty)");
eq(g.score - s1 > 1200 * 1, true, "b2b quad scores more");

// garbage: pending lines come in when a piece clears nothing; cleared lines cancel pending first
g = new B.Game({ seed: "gb", mode: "r" });
g.addGarbage(3); eq(g.pending, 3, "pending");
g.act(6, 100);
let filled = 0; for (let x = 0; x < 10; x++) if (g.board[(B.H - 1) * 10 + x] === 8) filled++;
eq(filled, 9, "garbage row has one hole"); eq(g.recv, 3, "3 rows received"); eq(g.pending, 0, "none pending");

// lock delay: a grounded piece locks 500 ms later; moving resets it (up to 15 times)
g = new B.Game({ seed: "ld", mode: "m" });
g.act(6, 0);     // first piece down, the next spawns at t = 0
let p2 = g.pieces;
g.act(11, 10);   // drop to the floor without locking
g.tick(400); eq(g.pieces, p2, "not locked after 390 ms on the floor");
g.tick(520); eq(g.pieces, p2 + 1, "locked after 500 ms");

// ultra ends at exactly 2 minutes; zen never tops out
g = new B.Game({ seed: "u", mode: "u" }); g.tick(130000); eq([g.over === "done" || g.over === "top", g.endMs <= 120000], [true, true], "ultra ends by 2:00");
g = new B.Game({ seed: "z", mode: "z", lv: 1 });
for (let i = 0; i < 60; i++) g.act(6, i * 10);
eq(g.over, "", "zen never ends"); ok(g.pieces >= 60, "zen keeps going after the stack fills");

// move encoding round trip
const log = [[0, 0], [1, 5], [6, 5], [2, 130], [11, 70000], [10, 70001], [5, 900000]].map((x, i, a) => x);
eq(B.decMoves(B.encMoves(log)), log, "encode / decode actions");
eq(B.decMoves("!!"), null, "bad characters refused");

// a computer-played sprint: record -> verify; tampering is caught
function bot(seed, mode, maxPieces, dt) {
  const gg = new B.Game({ seed, mode, lv: 1 }); let t = 0;
  while (!gg.over && gg.pieces < maxPieces) {
    const p = B.plan(gg);
    for (const a of B.planActions(gg, p)) {
      t += dt;
      if (typeof a === "string") { const x = +a.slice(1); let k = 0; while (gg.cur && gg.cur.x !== x && k++ < 12) { if (!gg.act(gg.cur.x < x ? 1 : 0, t)) break; t += dt; } }
      else gg.act(a, t);
      if (gg.over) break;
    }
  }
  return gg;
}
const sp = bot("sprint-seed", "s", 400, 60);
eq(sp.over, "done", "the bot clears 40 lines"); ok(sp.lines >= 40, "at least 40");
const rec = B.record(sp);
ok(rec && rec.mv && rec.mv.length < B.MV_MAX, "record fits a custom_json");
let v = B.verify(rec);
eq([v.ok, v.board, v.t, v.l], [true, "s", sp.endMs, sp.lines], "sprint verifies");
eq(B.verify(Object.assign({}, rec, { t: rec.t - 1 })).ok, false, "a faster claimed time is refused");
eq(B.verify(Object.assign({}, rec, { sc: rec.sc + 100 })).ok, false, "a higher claimed score is refused");
eq(B.verify(Object.assign({}, rec, { s: "other-seed" })).ok, false, "the moves don't work on another seed");
eq(B.verify(Object.assign({}, rec, { mv: undefined })).ok, false, "no moves, no check");
// too fast: squeeze the times
const fastLog = sp.log.map((x) => [x[0], Math.floor(x[1] / 20)]);
const fast = B.replay(sp.seed, "s", 1, fastLog);
if (fast.over === "done") eq(B.verify(B.record(fast)).ok, false, "superhuman speed refused");
// daily
const day = "2026-11-20";
const dg = bot(B.dailySeed(day), "s", 400, 60);
const drec = B.record(dg, day);
v = B.verify(drec); eq([v.ok, v.board], [true, "d:" + day], "daily verifies onto its own board");
eq(B.verify(Object.assign({}, rec, { d: day })).ok, false, "a random-seed game is not a daily");
// ultra
const ul = bot("ultra-seed", "u", 2000, 45);
if (!ul.over) ul.tick(B.ULTRA_MS);
const ur = B.record(ul); v = B.verify(ur);
eq([v.ok, v.board, v.rank], [true, "u", -ul.score], "ultra verifies, ranked by score");
// marathon from level 5 is checked but not ranked
const mr = new B.Game({ seed: "m5", mode: "m", lv: 5 }); for (let i = 0; i < 400 && !mr.over; i++) mr.act(6, i * 400);
v = B.verify(B.record(mr)); eq([v.ok, v.board], [true, null], "marathon from level 5: real but unranked");

// determinism of the whole engine across a long random game
const rg = new B.Game({ seed: "rand", mode: "m" }); const rr = B.rng("acts"); let tt = 0;
while (!rg.over && tt < 600000) { tt += rr() % 120; rg.act(rr() % 12, tt); }
const rep = B.replay("rand", "m", 1, rg.log, rg.over ? rg.endMs + 1 : tt);
eq([rep.score, rep.lines, rep.pieces, rep.boardStr()], [rg.score, rg.lines, rg.pieces, rg.boardStr()], "random play replays exactly");

// Hive history parsing
const hist = [[1, { trx_id: "a".repeat(40), block: 5, timestamp: "2026-11-20T10:00:00", op: ["custom_json", { id: "mes_blocks", required_posting_auths: ["alice"], required_auths: [], json: JSON.stringify(rec) }] }],
  [2, { trx_id: "b".repeat(40), op: ["custom_json", { id: "mes_blocks", required_posting_auths: ["bob"], required_auths: [], json: "{}" }] }],
  [3, { trx_id: "c".repeat(40), op: ["custom_json", { id: "other", required_posting_auths: ["alice"], required_auths: [], json: "{}" }] }]];
const parsed = B.parseHistory(hist, "alice");
eq(parsed.length, 1, "only alice's mes_blocks op"); eq(parsed[0].rec.t, rec.t, "record read back");

/* ---------- the API ---------- */
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), zs = new Map(), hs = new Map();
const Z = (k) => { if (!zs.has(k)) zs.set(k, new Map()); return zs.get(k); };
const Hh = (k) => { if (!hs.has(k)) hs.set(k, new Map()); return hs.get(k); };
const chain = {};
global.fetch = async (url, opts) => {
  if (!/redis\.test/.test(url)) { const q = JSON.parse(opts.body); return { json: async () => ({ result: chain[q.params[0]] || [] }) }; }
  const out = JSON.parse(opts.body).map((c) => {
    const [op, k, v] = c;
    if (op === "SET") { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, v); return { result: "OK" }; }
    if (op === "GET") return { result: store.has(k) ? store.get(k) : null };
    if (op === "MGET") return { result: c.slice(1).map((x) => (store.has(x) ? store.get(x) : null)) };
    if (op === "DEL") { store.delete(k); return { result: 1 }; }
    if (op === "INCR") { const nn = (+store.get(k) || 0) + 1; store.set(k, String(nn)); return { result: nn }; }
    if (op === "ZADD") { Z(k).set(c[3], +v); return { result: 1 }; }
    if (op === "ZREM") { c.slice(2).forEach((x) => Z(k).delete(x)); return { result: 1 }; }
    if (op === "ZSCORE") { const s = Z(k).get(v); return { result: s == null ? null : String(s) }; }
    if (op === "ZCARD") return { result: Z(k).size };
    if (op === "ZRANK") { const e = [...Z(k).entries()].sort((a, b) => a[1] - b[1]).map((x) => x[0]); const i = e.indexOf(v); return { result: i < 0 ? null : i }; }
    if (op === "ZRANGE") { const e = [...Z(k).entries()].sort((a, b) => a[1] - b[1]).slice(+c[2], +c[3] + 1); return { result: e.map((x) => x[0]) }; }
    if (op === "ZREVRANGE") { const e = [...Z(k).entries()].sort((a, b) => b[1] - a[1]).slice(+c[2], +c[3] + 1); return { result: e.map((x) => x[0]) }; }
    if (op === "HSET") { Hh(k).set(c[2], c[3]); return { result: 1 }; }
    if (op === "HMGET") return { result: c.slice(2).map((x) => Hh(k).get(x) || null) };
    return { result: 1 };
  });
  return { json: async () => out };
};
const h = require("../mes.fm/api/blocks.js");
function mk(method, o) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, vv) { this.headers[k] = vv; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return { req: Object.assign({ method, query: {}, headers: { "x-forwarded-for": "1.1.1.1", "content-type": "application/json" }, body: null }, o), res };
}
async function call(method, o) { const { req, res } = mk(method, o); await h(req, res); return res; }
const post = (body, ip) => call("POST", { body, headers: { "x-forwarded-for": ip || "1.1.1.1", "content-type": "application/json" } });
const op = (acct, trx, r, ts) => [9, { trx_id: trx, block: 1, timestamp: (ts || new Date().toISOString()).replace(/\.\d+Z$/, ""), op: ["custom_json", { id: "mes_blocks", required_posting_auths: [acct], required_auths: [], json: JSON.stringify(r) }] }];

(async () => {
  // leaderboard
  chain.alice = [op("alice", "a".repeat(40), rec)];
  let r = await post({ act: "submit", acct: "alice", trx: "a".repeat(40) });
  eq([r.code, r.body.board, r.body.rank], [200, "s", 1], "verified sprint goes on the board");
  r = await call("GET", { query: { board: "s" } });
  eq([r.body.top.length, r.body.top[0].acct, r.body.top[0].t], [1, "alice", rec.t], "leaderboard lists it");
  chain.mallory = [op("mallory", "d".repeat(40), Object.assign({}, rec, { t: rec.t - 500 }))];
  r = await post({ act: "submit", acct: "mallory", trx: "d".repeat(40) });
  eq(r.code, 422, "tampered time refused");
  chain.copycat = [op("copycat", "e".repeat(40), rec)];
  r = await post({ act: "submit", acct: "copycat", trx: "e".repeat(40) });
  eq(r.code, 409, "someone else's exact game refused");
  eq((await post({ act: "submit", acct: "alice", trx: "f".repeat(40) })).code, 404, "unknown trx = not on chain yet");
  eq((await post({ act: "submit", acct: "Bad!", trx: "a".repeat(40) })).code, 400, "bad account name");
  // daily: today's seed only
  const today = B.utcDate();
  const dd = bot(B.dailySeed(today), "s", 400, 70), dr = B.record(dd, today);
  chain.bob = [op("bob", "b".repeat(40), dr)];
  r = await post({ act: "submit", acct: "bob", trx: "b".repeat(40) });
  eq([r.code, r.body.board], [200, "d:" + today], "today's daily ranked");
  eq((await call("GET", { query: { daily: today } })).body.count, 1, "daily count");
  chain.carl = [op("carl", "c".repeat(40), drec)];
  r = await post({ act: "submit", acct: "carl", trx: "c".repeat(40) });
  ok(r.code === 422 || today === day, "an old daily is not ranked any more");
  // ultra: ranked by score (higher first)
  chain.dora = [op("dora", "9".repeat(40), ur)];
  r = await post({ act: "submit", acct: "dora", trx: "9".repeat(40) });
  eq([r.code, r.body.board], [200, "u"], "ultra ranked");
  eq((await call("GET", { query: { board: "x" } })).code, 400, "bad board key");

  // race: new -> lobby -> join -> updates -> win -> rematch
  r = await post({ act: "new", name: "Ann<b>", pub: true });
  eq(r.code, 200, "new race"); const id = r.body.g.id, ka = r.body.key;
  eq(r.body.g.names[0], "Annb", "name cleaned"); eq(r.body.g.tok, undefined, "seat keys never sent");
  eq((await call("GET", { query: { lobby: "1" } })).body.open.map((x) => x.id), [id], "listed");
  r = await post({ act: "join", id, name: "Ben" }, "2.2.2.2"); eq([r.code, r.body.seat, r.body.g.status], [200, 1, "play"], "joined");
  const kb = r.body.key, seed1 = r.body.g.seed;
  ok(r.body.g.start > r.body.g.now, "countdown before the start");
  eq((await post({ act: "join", id, name: "Cy" }, "3.3.3.3")).code, 409, "no third player");
  eq((await call("GET", { query: { lobby: "1" } })).body.open.length, 0, "gone from the lobby");
  // pretend the countdown is over
  const gs = JSON.parse(store.get("blk:g:" + id)); gs.start = Date.now() - 10; store.set("blk:g:" + id, JSON.stringify(gs));
  const bstr = "0".repeat(190) + "8888888880";
  r = await post({ act: "up", id, key: ka, round: 0, st: { l: 3, s: 2, p: 10, b: bstr, o: 0, d: 0, t: 5000 } });
  eq(r.code, 200, "update");
  r = await post({ act: "up", id, key: kb, round: 0, st: { l: 1, s: 0, p: 9, b: "x", o: 0, d: 0, t: 5000 } }, "2.2.2.2");
  eq([r.body.g.st[0].s, r.body.g.st[0].b === bstr, r.body.g.st[1].b], [2, true, ""], "each sees the other's sent lines and board (bad board dropped)");
  eq((await post({ act: "up", id, key: "x".repeat(30), round: 0, st: { l: 1, s: 0, p: 1, t: 1 } })).code, 403, "unknown key");
  r = await post({ act: "up", id, key: kb, round: 0, st: { l: 5, s: 1, p: 20, b: bstr, o: 1, d: 0, t: 9000 } }, "2.2.2.2");
  eq([r.body.g.status, r.body.g.win], ["over", { p: 0, why: "topout" }], "topping out loses");
  r = await post({ act: "up", id, key: ka, round: 0, st: { l: 40, s: 9, p: 99, b: bstr, o: 0, d: 1, t: 9000 } });
  eq(r.body.g.win.p, 0, "the result does not change afterwards");
  r = await post({ act: "rematch", id, key: kb, round: 0 }, "2.2.2.2");
  eq([r.body.g.status, r.body.g.round, r.body.g.win], ["play", 1, null], "rematch starts round 1");
  ok(r.body.g.seed !== seed1, "with a new seed");
  r = await post({ act: "rematch", id, key: ka, round: 0 });
  eq(r.body.g.round, 1, "a late rematch press just gets the new round");
  eq((await post({ act: "claim", id, key: ka, round: 1 })).code, 409, "can't claim while the other player is active");
  r = await post({ act: "leave", id, key: kb, round: 1 }, "2.2.2.2");
  eq(r.body.g.win, { p: 0, why: "left" }, "leaving gives the win to the other player");
  // cancel a waiting race
  r = await post({ act: "new", name: "Solo", pub: false }); const id2 = r.body.g.id;
  eq((await call("GET", { query: { lobby: "1" } })).body.open.length, 0, "private races are not listed");
  eq((await post({ act: "cancel", id: id2, key: r.body.key })).code, 200, "cancel");
  eq((await call("GET", { query: { id: id2 } })).code, 404, "gone");

  console.log(f ? f + " of " + n + " checks FAILED" : "all " + n + " checks passed");
  process.exit(f ? 1 : 0);
})();
