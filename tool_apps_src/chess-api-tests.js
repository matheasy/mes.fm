// node tool_apps_src/chess-api-tests.js  -- runs mes.fm/api/chess.js (online games + Hive index) with a fake Redis and a fake Hive node
"use strict";
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), zs = new Map();
const Z = (k) => { if (!zs.has(k)) zs.set(k, new Map()); return zs.get(k); };
const chain = {};   // account -> account-history entries (fake Hive node)
global.fetch = async (url, opts) => {
  if (!/redis\.test/.test(url)) {
    const q = JSON.parse(opts.body);
    return { json: async () => ({ result: chain[q.params[0]] || [] }) };
  }
  const out = JSON.parse(opts.body).map((c) => {
    const [op, k, v] = c;
    if (op === "SET") { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, v); return { result: "OK" }; }
    if (op === "GET") return { result: store.has(k) ? store.get(k) : null };
    if (op === "MGET") return { result: c.slice(1).map((x) => (store.has(x) ? store.get(x) : null)) };
    if (op === "DEL") { store.delete(k); return { result: 1 }; }
    if (op === "INCR") { const n = (+store.get(k) || 0) + 1; store.set(k, String(n)); return { result: n }; }
    if (op === "ZADD") { Z(k).set(c[3], +v); return { result: 1 }; }
    if (op === "ZREM") { c.slice(2).forEach((x) => Z(k).delete(x)); return { result: 1 }; }
    if (op === "ZREVRANGE") { const e = [...Z(k).entries()].sort((a, b) => b[1] - a[1]).slice(+c[2], +c[3] + 1); return { result: c[4] === "WITHSCORES" ? e.flatMap((x) => [x[0], String(x[1])]) : e.map((x) => x[0]) }; }
    return { result: 1 };
  });
  return { json: async () => out };
};
const h = require("../mes.fm/api/chess.js");
let f = 0, n = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
function mk(method, o) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return { req: Object.assign({ method, query: {}, headers: { "x-forwarded-for": "1.1.1.1", "content-type": "application/json" }, body: null }, o), res };
}
async function call(method, o) { const { req, res } = mk(method, o); await h(req, res); return res; }
const post = (body, ip) => call("POST", { body, headers: { "x-forwarded-for": ip || "1.1.1.1", "content-type": "application/json" } });

(async () => {
  // make + lobby
  let r = await post({ act: "new", v: "S", name: "Alice<b>", pub: true, first: "host" });
  eq(r.code, 200, "new"); const id = r.body.g.id, ka = r.body.key;
  eq(r.body.seat, 0, "host plays White"); eq(r.body.g.names[0], "Aliceb", "name cleaned"); eq(r.body.g.tok, undefined, "token hashes never sent");
  eq((await post({ act: "new", v: "C7x6k4", name: "x" })).code, 400, "bad game code refused");
  eq((await post({ act: "new", v: "X8/8/8/8/8/8/8/K6k_w_-_-_0_1", name: "x" })).code, 400, "typed-in positions are not for online play");
  eq((await post({ act: "new", v: "chess960", name: "x" })).code, 400, "a preset id is not a code");
  r = await call("GET", { query: { lobby: "1" } });
  eq(r.body.open.length === 1 && r.body.open[0].id === id && r.body.open[0].name === "Aliceb", true, "listed in lobby");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "e2e4" })).code, 409, "no moves while waiting");
  // join
  r = await post({ act: "join", id, name: "Bob" }, "2.2.2.2"); eq(r.code, 200, "join"); const kb = r.body.key;
  eq(r.body.seat, 1, "joiner gets the free seat"); eq(r.body.g.status, "play", "playing");
  eq((await post({ act: "join", id, name: "Carl" }, "3.3.3.3")).code, 409, "third player refused");
  // turns, legality, double sends
  eq((await post({ act: "move", id, key: kb, n: 0, m: "e7e5" })).code, 409, "not your turn");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "e2e5" })).code, 400, "illegal move");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "e2e4x" })).code, 400, "junk move");
  eq((await post({ act: "move", id, key: "x".repeat(32), n: 0, m: "e2e4" })).code, 403, "unknown key");
  eq((await post({ act: "offer", id, key: ka })).code, 409, "no draw offer before any move");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "f2f3" })).code, 200, "f3");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "e2e4" })).code, 409, "stale move number refused");
  for (const [k, nn, m] of [[kb, 1, "e7e5"], [ka, 2, "g2g4"]]) eq((await post({ act: "move", id, key: k, n: nn, m })).code, 200, "move " + m);
  // draw offer, cleared by a move, then offered + accepted
  r = await post({ act: "offer", id, key: ka }); eq(r.body.g.offer, 0, "White offers a draw");
  eq((await post({ act: "accept", id, key: ka })).code, 409, "can't accept your own offer");
  r = await post({ act: "move", id, key: kb, n: 3, m: "d8h4" });
  eq([r.body.g.status, r.body.g.win, r.body.g.offer], ["over", { p: 1, why: "mate" }, null], "fool's mate on the server");
  eq((await post({ act: "move", id, key: ka, n: 4, m: "a2a3" })).code, 409, "no moves after the end");
  // rematch swaps colours
  r = await post({ act: "rematch", id, key: kb }, "2.2.2.2");
  eq([r.body.g.status, r.body.g.round, r.body.g.names], ["play", 1, ["Bob", "Aliceb"]], "rematch swaps colours");
  eq((await post({ act: "rematch", id, key: ka })).code, 200, "second rematch click is harmless");
  eq((await post({ act: "move", id, key: kb, n: 0, m: "e2e4" })).code, 200, "Bob is White in the rematch");
  eq((await post({ act: "move", id, key: ka, n: 1, m: "e7e5" })).code, 200, "e5");
  r = await post({ act: "offer", id, key: kb }, "2.2.2.2"); eq(r.body.g.offer, 0, "offer");
  r = await post({ act: "accept", id, key: ka }); eq(r.body.g.win, { p: -1, why: "agreed" }, "draw agreed");
  // claim
  await post({ act: "rematch", id, key: ka });
  eq((await post({ act: "move", id, key: ka, n: 0, m: "d2d4" })).code, 200, "Alice White again");
  eq((await post({ act: "claim", id, key: ka })).code, 409, "claim too early");
  const g = JSON.parse(store.get("ch:g:" + id)); g.at -= 200000; store.set("ch:g:" + id, JSON.stringify(g));
  eq((await post({ act: "claim", id, key: kb }, "2.2.2.2")).code, 409, "can't claim on your own turn");
  r = await post({ act: "claim", id, key: ka }); eq(r.body.g.win, { p: 0, why: "timeout" }, "claim after 3 minutes");
  // castling written king-onto-rook and as the king move, Chess960 game codes
  r = await post({ act: "new", v: "F518", name: "Eve", pub: false });
  const id3 = r.body.g.id, ke = r.body.key; r = await post({ act: "join", id: id3, name: "Fay" }, "4.4.4.4"); const kf = r.body.key;
  const seq = [[ke, "e2e4"], [kf, "e7e5"], [ke, "g1f3"], [kf, "b8c6"], [ke, "f1c4"], [kf, "g8f6"], [ke, "e1g1"]];
  for (let i = 0; i < seq.length; i++) eq((await post({ act: "move", id: id3, key: seq[i][0], n: i, m: seq[i][1] }, "4.4.4." + i)).code, 200, "960 move " + seq[i][1]);
  eq(JSON.parse(store.get("ch:g:" + id3)).moves[6], "e1h1", "castling is stored as king onto rook");
  // cancel a waiting game
  r = await post({ act: "new", v: "K", name: "Dee", pub: false, first: "guest" });
  eq(r.body.seat, 1, "host plays Black"); const id2 = r.body.g.id;
  eq((await call("GET", { query: { lobby: "1" } })).body.open.length, 0, "private game not listed");
  eq((await post({ act: "cancel", id: id2, key: r.body.key })).code, 200, "cancel");
  eq((await call("GET", { query: { id: id2 } })).code, 404, "cancelled game gone");
  eq((await call("GET", { query: { id: "../etc" } })).code, 400, "bad id");
  eq((await call("PUT", {})).code, 405, "method");
  eq((await call("POST", { body: { act: "new", v: "S" }, headers: { "content-type": "text/plain" } })).code, 415, "json only");
  // Hive index
  const ts = new Date().toISOString().slice(0, 19);
  const ent = (acct, j, b) => [b, { trx_id: "x" + b, block: b, timestamp: ts, op: ["custom_json", { id: "mes_chess", required_auths: [], required_posting_auths: [acct], json: JSON.stringify(j) }] }];
  eq((await post({ act: "hopen", host: "alice", g: "abcd2345" }, "5.5.5.5")).code, 404, "hive open not on chain yet");
  chain.alice = [ent("alice", { a: "open", g: "abcd2345", v: "S", f: "host", t: 1440 }, 10)];
  eq((await post({ act: "hopen", host: "alice", g: "abcd2345" }, "5.5.5.5")).code, 200, "hive open listed");
  r = await call("GET", { query: { hlobby: "1" } });
  eq(r.body.open.map((o) => o.host + "/" + o.g + "/" + o.v + "/" + o.t), ["alice/abcd2345/S/1440"], "hive lobby with the pace");
  chain.bob = [ent("bob", { a: "join", h: "alice", g: "abcd2345" }, 11)];
  r = await post({ act: "hjoin", host: "alice", g: "abcd2345", acct: "bob" }, "5.5.5.5");
  eq(r.body.joiners, ["bob"], "hive join recorded");
  eq((await call("GET", { query: { hlobby: "1" } })).body.open.length, 0, "joined game leaves the hive lobby");
  eq((await post({ act: "hopen", host: "Al!ce", g: "abcd2345" })).code, 400, "bad account refused");
  // self-reported result: listed only when it replays correctly
  chain.dan = [ent("dan", { a: "rec", g: "rrrr2222", v: "S", m: "f2f3.e7e5.g2g4.d8h4", o: "hard", s: 0, w: 1 }, 20), ent("dan", { a: "rec", g: "rrrr3333", v: "S", m: "f2f3.e7e5.g2g4.d8h4", o: "hard", s: 0, w: 0 }, 21)];
  eq((await post({ act: "hrec", acct: "dan", g: "rrrr2222" }, "6.6.6.6")).code, 200, "result listed");
  eq((await post({ act: "hrec", acct: "dan", g: "rrrr3333" }, "6.6.6.6")).code, 404, "a result with the wrong winner is not listed");
  r = await call("GET", { query: { hrecent: "1" } });
  eq(r.body.recs.map((o) => o.acct + ":" + o.res), ["dan:lost vs hard computer"], "recent saved results");
  for (let i = 0; i < 31; i++) r = await post({ act: "new", v: "S", name: "spam" }, "9.9.9.9");
  eq(r.code, 429, "rate limit on new games");
  console.log((n - f) + " passed, " + f + " failed");
  process.exit(f ? 1 : 0);
})();
