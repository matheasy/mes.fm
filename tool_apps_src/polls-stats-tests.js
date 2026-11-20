// node tool_apps_src/polls-stats-tests.js -- mes.fm/api/polls-admin.js (+ the poll:all index in api/poll.js) against a fake Redis,
// and the owner page's pure helpers (tool_apps_src/polls-stats/lib.js).
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map();
function glob(pat) { return new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"); }
global.fetch = async (url, opts) => {
  const cmds = JSON.parse(opts.body);
  const hash = (k) => { if (!store.has(k)) store.set(k, new Map()); return store.get(k); };
  const out = cmds.map((c) => {
    const [op, k, a, b] = c;
    switch (op) {
      case "SET": { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, a); return { result: "OK" }; }
      case "GET": return { result: typeof store.get(k) === "string" ? store.get(k) : null };
      case "INCR": { const v = (Number(store.get(k)) || 0) + 1; store.set(k, String(v)); return { result: v }; }
      case "EXPIRE": case "EXPIREAT": return { result: 1 };
      case "HGET": { const h = store.get(k); return { result: h instanceof Map && h.has(a) ? h.get(a) : null }; }
      case "HSET": hash(k).set(a, String(b)); return { result: 1 };
      case "HSETNX": { const h = hash(k); if (h.has(a)) return { result: 0 }; h.set(a, String(b)); return { result: 1 }; }
      case "HINCRBY": { const h = hash(k); const v = (Number(h.get(a)) || 0) + Number(b); h.set(a, String(v)); return { result: v }; }
      case "HGETALL": { const h = store.get(k); const r = []; if (h instanceof Map) for (const [x, y] of h) r.push(x, y); return { result: r }; }
      case "HLEN": { const h = store.get(k); return { result: h instanceof Map ? h.size : 0 }; }
      case "ZADD": { const z = hash(k); for (let i = 2; i + 1 < c.length; i += 2) z.set(String(c[i + 1]), String(c[i])); return { result: 1 }; }
      case "ZINCRBY": { const z = hash(k); const v = (Number(z.get(b)) || 0) + Number(a); z.set(b, String(v)); return { result: String(v) }; }
      case "ZREM": { const z = store.get(k); let n = 0; if (z instanceof Map) for (const m of c.slice(2)) if (z.delete(m)) n++; return { result: n }; }
      case "ZRANGE": case "ZREVRANGE": {
        const z = store.get(k); const r = [];
        if (z instanceof Map) { let arr = [...z].sort((x, y) => x[1] - y[1]); if (op === "ZREVRANGE") arr.reverse(); const end = Number(b) < 0 ? arr.length : Number(b) + 1; arr.slice(Number(a), end).forEach(([m, sc]) => { r.push(m); if (c.includes("WITHSCORES")) r.push(sc); }); }
        return { result: r };
      }
      case "SCAN": {   // one key per call, so the cursor loop is exercised
        const re = glob(c[3]); const keys = [...store.keys()].sort(); const i = Number(k);
        if (i >= keys.length) return { result: ["0", []] };
        return { result: [i + 1 >= keys.length ? "0" : String(i + 1), re.test(keys[i]) ? [keys[i]] : []] };
      }
      case "DEL": { let n = 0; for (const x of c.slice(1)) if (store.delete(x)) n++; return { result: n }; }
      default: throw new Error("fake redis: " + op);
    }
  });
  return { json: async () => out };
};
const poll = require("../mes.fm/api/poll.js");
const admin = require("../mes.fm/api/polls-admin.js");
const L = require("./polls-stats/lib.js");
let f = 0, n = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
let ipn = 1;
function mk(method, o) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, end() { return this; } };
  const headers = Object.assign({ "x-forwarded-for": "10.1.0." + (ipn++ % 250), "content-type": "application/json" }, (o && o.headers) || {});
  return { req: Object.assign({ method, query: {}, body: null }, o, { headers }), res };
}
async function call(h, method, body, extra) { const { req, res } = mk(method, Object.assign({ body }, extra || {})); await h(req, res); return res; }
const vid = (i) => ("abcdef0123456789".repeat(4) + i.toString(16)).slice(-32);

(async () => {
  // a poll from before the index existed (no poll:all entry), then two new ones through api/poll.js
  const old = { q: "Old poll?", d: "", o: ["A", "B"], m: 1, cl: 0, sh: "always", ch: false, c: Date.now() - 5 * 86400000, x: 0, h: "x".repeat(64) };
  store.set("poll:oldpoll1", JSON.stringify(old));
  store.set("poll:oldpoll1:n", new Map([["o0", "3"], ["v", "3"]]));
  store.set("poll:rl:n:abc:1", "1");                // other keys under poll: must be ignored by the scan
  let r = await call(poll, "POST", { act: "new", q: "Pizza or tacos?", o: ["Pizza", "Tacos"], m: 1 }); eq(r.code, 200, "create 1");
  const id1 = r.body.id;
  r = await call(poll, "POST", { act: "new", q: "Pick colours", o: ["Red", "Blue", "Green"], m: 2, sh: "voted", ch: true }); eq(r.code, 200, "create 2");
  const id2 = r.body.id;
  eq(store.get("poll:all").has(id1) && store.get("poll:all").has(id2), true, "new polls go into poll:all");
  eq(store.get("poll:all").has("oldpoll1"), false, "old poll not indexed yet");
  r = await call(poll, "POST", { act: "vote", id: id1, vid: vid(1), picks: [0], t: 2000 }); eq(r.code, 200, "vote");
  r = await call(poll, "POST", { act: "report", id: id2, vid: vid(2), r: "spam" }); eq(r.code, 200, "report");

  // first GET: scans once, indexes the old poll, lists all three, newest first, without the key hash
  r = await call(admin, "GET");
  eq(r.code, 200, "admin list"); eq(r.body.scanned, 3, "scan indexed every poll key"); eq(r.body.polls.length, 3, "three polls");
  eq(store.get("poll:all").has("oldpoll1"), true, "old poll indexed"); eq(typeof store.get("poll:allscan"), "string", "scan flag set");
  eq(r.body.polls[r.body.polls.length - 1].id, "oldpoll1", "sorted newest first");
  eq(JSON.stringify(r.body).includes('"h"'), false, "key hash never sent");
  const p1 = r.body.polls.find((p) => p.id === id1), p2 = r.body.polls.find((p) => p.id === id2);
  eq([p1.v, p1.n], [1, [1, 0]], "counts"); eq([p2.r, p2.nets, p2.why], [1, 1, { spam: 1 }], "reports and reasons");
  eq([p2.m, p2.sh, p2.ch, p2.open], [2, "voted", true, true], "settings passed through");
  eq(r.headers["Cache-Control"], "no-store", "no-store");
  r = await call(admin, "GET"); eq(r.body.scanned, null, "no second scan");

  // an expired poll leaves the index
  store.delete("poll:oldpoll1");
  r = await call(admin, "GET"); eq(r.body.polls.length, 2, "expired poll dropped"); eq(r.body.gone, 1, "gone counted"); eq(store.get("poll:all").has("oldpoll1"), false, "zrem'd");

  // moderation
  r = await call(admin, "POST", { act: "mod", id: id2, do: "hide" }); eq([r.code, r.body.hidden], [200, true], "hide");
  eq(!!JSON.parse(store.get("poll:" + id2)).hid, true, "hid stored");
  r = await call(poll, "GET", null, { query: { id: id2 } }); eq(r.code, 410, "hidden poll answers 410");
  r = await call(admin, "POST", { act: "mod", id: id2, do: "ok" }); eq([r.code, r.body.hidden], [200, false], "keep");
  eq(store.has("poll:" + id2 + ":r"), false, "reports cleared"); eq((store.get("poll:reported") || new Map()).has(id2), false, "left the queue");
  r = await call(admin, "POST", { act: "mod", id: id2, do: "nuke" }); eq(r.code, 400, "bad action");
  r = await call(admin, "POST", { act: "mod", id: "BAD", do: "hide" }); eq(r.code, 404, "bad id");
  r = await call(admin, "POST", { act: "mod", id: id1, do: "del" }); eq(r.code, 200, "delete");
  eq([store.has("poll:" + id1), store.get("poll:all").has(id1)], [false, false], "deleted everywhere");
  r = await call(admin, "POST", { act: "rescan" }); eq([r.code, r.body.found], [200, 1], "rescan finds the one poll left");
  r = await call(admin, "POST", "x", { headers: { "content-type": "text/plain" } }); eq(r.code, 415, "json only");
  process.env.VERCEL_ENV = "production";
  r = await call(admin, "POST", { act: "rescan" }, { headers: { origin: "https://evil.example" } }); eq(r.code, 403, "origin checked in production");
  r = await call(admin, "POST", { act: "rescan" }, { headers: { origin: "https://mes.fm" } }); eq(r.code, 200, "mes.fm origin ok");
  delete process.env.VERCEL_ENV;
  r = await call(admin, "PUT"); eq(r.code, 405, "method");

  // ---- lib
  const now = Date.UTC(2026, 10, 19, 12);
  const D = 86400000;
  const mkp = (o) => Object.assign({ id: "aaaaaaaa", q: "Q", d: "", o: ["a", "b"], m: 1, cl: 0, sh: "always", ch: false, c: now - D, x: 0, hid: 0, n: [0, 0], v: 0, r: 0, nets: 0, why: {}, open: true, closes: now + D }, o);
  const ps = [mkp({ id: "a1", v: 10, n: [7, 3], m: 1 }), mkp({ id: "a2", q: "Colours please", o: ["red", "blue", "green"], m: 2, sh: "voted", ch: true, d: "x", v: 4, n: [3, 3, 2], c: now - 3 * D, cl: now + D }),
    mkp({ id: "a3", q: "Café?", hid: now, r: 3, nets: 3, open: false, c: now - 40 * D, x: now - 39 * D, cl: now - 30 * D }), mkp({ id: "a4", open: false, x: now - D / 2, c: now - 2 * D })];
  const s = L.summary(ps, now);
  eq([s.total, s.open, s.closed, s.hidden, s.reported, s.votes, s.single, s.multi, s.noVotes], [4, 2, 1, 1, 1, 14, 3, 1, 2], "summary counts");
  eq([s.sh.always, s.sh.voted, s.change, s.desc, s.last7, s.last30], [3, 1, 1, 1, 3, 3], "summary settings");
  eq(s.close, { date: 1, manual: 1, early: 1, "manual-closed": 1 }, "closing kinds");
  eq(s.opts, { 2: 3, 3: 1 }, "options count"); eq(s.top.id, "a1", "top poll"); eq(s.mdist, { 2: 1 }, "picks distribution");
  const d = L.daily(ps, 7, now);
  eq(d.length, 7, "7 days"); eq(d[6].key, "2026-11-19", "last day today"); eq([d[5].polls, d[5].votes], [1, 10], "yesterday's poll + votes"); eq(d[4].polls, 1, "two days ago");
  eq(L.viewsFor(d, { "mes.fm|/polls": { "2026-11-19": 5, "2026-11-18": 2 } }).slice(-2), [2, 5], "views lined up");
  eq(L.viewsFor(d, null).every((x) => x === 0), true, "no views = zeros");
  eq(L.filter(ps, "cafe", "all").map((p) => p.id), ["a3"], "search ignores accents");
  eq(L.filter(ps, "green", "all").map((p) => p.id), ["a2"], "search options");
  eq(L.filter(ps, "", "reported").map((p) => p.id), ["a3"], "reported filter");
  eq(L.filter(ps, "", "multi").map((p) => p.id), ["a2"], "multi filter");
  eq(L.filter(ps, "", "hidden").map((p) => p.id), ["a3"], "hidden filter");
  eq(L.filter(ps, "", "closed").map((p) => p.id), ["a4"], "closed filter (hidden excluded)");
  eq(L.filter(ps, "", "novotes").length, 2, "no-votes filter");
  eq(L.sort(ps, "v", "desc").map((p) => p.id), ["a1", "a2", "a4", "a3"], "sort by votes (ties newest first)");
  eq(L.sort(ps, "q", "asc")[0].id, "a3", "sort by question");
  eq(L.leader(ps[0]), { i: [0], n: 7, share: 0.7 }, "leader"); eq(L.leader(ps[1]).i, [0, 1], "tied leaders"); eq(L.leader(ps[3]), null, "no leader without votes");
  const csv = L.csv([mkp({ q: 'Say "hi", ok?', o: ["a", "b"] })]);
  eq(csv.split("\n")[1].includes('"Say ""hi"", ok?"'), true, "csv quoting"); eq(csv.split("\n").length, 3, "csv rows");
  const hr = L.hiveRows([{ id: 9, author: "mes", permlink: "p", question: "Q?", created: "2026-11-01T00:00:00", end_time: "2026-11-08T00:00:00", max_choices_voted: null }], [{ poll_id: 9 }, { poll_id: 9 }, { poll_id: 3 }]);
  eq([hr[0].votes, hr[0].m, hr[0].c], [2, 1, Date.UTC(2026, 10, 1)], "hive rows");
  const sm = L.sample(now);
  eq(sm.length > 20 && sm.every((p) => p.o.length >= 2 && p.n.length === p.o.length && /^[a-z0-9]{8}$/.test(p.id)), true, "sample data well formed");
  eq(new Set(sm.map((p) => p.id)).size, sm.length, "sample ids unique"); eq(sm.some((p) => p.hid) && sm.some((p) => p.r && !p.hid), true, "sample has a queue");
  eq(JSON.stringify(L.sample(now)), JSON.stringify(sm), "sample deterministic");

  console.log(n + " checks, " + f + " failed");
  process.exit(f ? 1 : 0);
})();
