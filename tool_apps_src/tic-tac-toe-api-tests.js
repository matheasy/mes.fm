// node tool_apps_src/tic-tac-toe-api-tests.js  -- runs mes.fm/api/ttt.js (online games) with a fake Redis
"use strict";
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), z = new Map();
global.fetch = async (url, opts) => {
  const out = JSON.parse(opts.body).map((c) => {
    const [op, k, v] = c;
    if (op === "SET") { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, v); return { result: "OK" }; }
    if (op === "GET") return { result: store.has(k) ? store.get(k) : null };
    if (op === "MGET") return { result: c.slice(1).map((x) => (store.has(x) ? store.get(x) : null)) };
    if (op === "DEL") { store.delete(k); return { result: 1 }; }
    if (op === "INCR") { const n = (+store.get(k) || 0) + 1; store.set(k, String(n)); return { result: n }; }
    if (op === "ZADD") { z.set(c[3], +v); return { result: 1 }; }
    if (op === "ZREM") { c.slice(2).forEach((x) => z.delete(x)); return { result: 1 }; }
    if (op === "ZREVRANGE") return { result: [...z.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]) };
    return { result: 1 };
  });
  return { json: async () => out };
};
const h = require("../mes.fm/api/ttt.js");
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
  let r = await post({ act: "new", v: "L3x3k3", name: "Alice<b>", pub: true, first: "host" });
  eq(r.code, 200, "new"); const id = r.body.g.id, ka = r.body.key;
  eq(r.body.seat, 0, "host goes first"); eq(r.body.g.names[0], "Aliceb", "name cleaned"); eq(r.body.g.tok, undefined, "token hashes never sent");
  eq((await post({ act: "new", v: "L2x2k2", name: "x" })).code, 400, "bad game code refused");
  r = await call("GET", { query: { lobby: "1" } });
  eq(r.body.open.length === 1 && r.body.open[0].id === id && r.body.open[0].name === "Aliceb", true, "listed in lobby");
  // move before anyone joined
  eq((await post({ act: "move", id, key: ka, n: 0, m: "4" })).code, 409, "no moves while waiting");
  // join
  r = await post({ act: "join", id, name: "Bob" }, "2.2.2.2"); eq(r.code, 200, "join"); const kb = r.body.key;
  eq(r.body.seat, 1, "joiner gets the free seat"); eq(r.body.g.status, "play", "playing");
  eq((await post({ act: "join", id, name: "Carl" }, "3.3.3.3")).code, 409, "third player refused");
  eq((await call("GET", { query: { lobby: "1" } })).body.open.length, 0, "gone from lobby");
  // turns, legality, double sends
  eq((await post({ act: "move", id, key: kb, n: 0, m: "4" })).code, 409, "not your turn");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "9" })).code, 400, "illegal cell");
  eq((await post({ act: "move", id, key: "x".repeat(32), n: 0, m: "4" })).code, 403, "unknown key");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "0" })).code, 200, "X plays 0");
  eq((await post({ act: "move", id, key: ka, n: 0, m: "1" })).code, 409, "stale move number refused");
  eq((await post({ act: "move", id, key: kb, n: 1, m: "0" })).code, 400, "occupied refused");
  for (const [k, nn, m] of [[kb, 1, "3"], [ka, 2, "1"], [kb, 3, "4"]]) eq((await post({ act: "move", id, key: k, n: nn, m })).code, 200, "move " + m);
  r = await post({ act: "move", id, key: ka, n: 4, m: "2" });
  eq([r.body.g.status, r.body.g.win], ["over", { p: 0, why: "line" }], "X wins on the server");
  eq((await post({ act: "move", id, key: kb, n: 5, m: "5" })).code, 409, "no moves after the end");
  // rematch swaps seats
  r = await post({ act: "rematch", id, key: kb }, "2.2.2.2");
  eq([r.body.g.status, r.body.g.round, r.body.g.names], ["play", 1, ["Bob", "Aliceb"]], "rematch swaps seats");
  eq((await post({ act: "rematch", id, key: ka })).code, 200, "second rematch click is harmless");
  eq((await post({ act: "move", id, key: kb, n: 0, m: "4" })).code, 200, "Bob goes first in the rematch");
  // claim too early, then after 3 minutes
  eq((await post({ act: "claim", id, key: kb }, "2.2.2.2")).code, 409, "claim too early");
  const g = JSON.parse(store.get("ttt:g:" + id)); g.at -= 200000; store.set("ttt:g:" + id, JSON.stringify(g));
  eq((await post({ act: "claim", id, key: ka })).code, 409, "can't claim on your own turn");
  r = await post({ act: "claim", id, key: kb }, "2.2.2.2"); eq(r.body.g.win, { p: 0, why: "timeout" }, "claim after 3 minutes");
  // resign
  await post({ act: "rematch", id, key: ka });
  r = await post({ act: "resign", id, key: ka }); eq(r.body.g.win.why, "resign", "resign");
  // cancel a waiting game
  r = await post({ act: "new", v: "U", name: "Dee", pub: false, first: "guest" });
  eq(r.body.seat, 1, "host second"); const id2 = r.body.g.id;
  eq((await call("GET", { query: { lobby: "1" } })).body.open.length, 0, "private game not listed");
  eq((await post({ act: "cancel", id: id2, key: r.body.key })).code, 200, "cancel");
  eq((await call("GET", { query: { id: id2 } })).code, 404, "cancelled game gone");
  eq((await call("GET", { query: { id: "../etc" } })).code, 400, "bad id");
  eq((await call("PUT", {})).code, 405, "method");
  eq((await call("POST", { body: { act: "new", v: "U" }, headers: { "content-type": "text/plain" } })).code, 415, "json only");
  for (let i = 0; i < 31; i++) r = await post({ act: "new", v: "U", name: "spam" }, "9.9.9.9");
  eq(r.code, 429, "rate limit on new games");
  console.log((n - f) + " passed, " + f + " failed");
  process.exit(f ? 1 : 0);
})();
