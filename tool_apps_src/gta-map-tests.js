// node tool_apps_src/gta-map-tests.js  -- the GTA 6 community map: MESGTA.MAP (tool_apps_src/gta/lib.js) and mes.fm/api/gta-map.js against a fake Redis
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const fs = require("fs"), path = require("path");
const store = new Map();
global.fetch = async (url, opts) => {
  const cmds = JSON.parse(opts.body);
  const hash = (k) => { if (!store.has(k)) store.set(k, new Map()); return store.get(k); };
  const out = cmds.map((c) => {
    const [op, k, a, b] = c;
    switch (op) {
      case "INCR": { const v = (Number(store.get(k)) || 0) + 1; store.set(k, String(v)); return { result: v }; }
      case "EXPIRE": return { result: 1 };
      case "HGET": { const h = store.get(k); return { result: h instanceof Map && h.has(a) ? h.get(a) : null }; }
      case "HSET": hash(k).set(a, String(b)); return { result: 1 };
      case "HSETNX": { const h = hash(k); if (h.has(a)) return { result: 0 }; h.set(a, String(b)); return { result: 1 }; }
      case "HINCRBY": { const h = hash(k); const v = (Number(h.get(a)) || 0) + Number(b); h.set(a, String(v)); return { result: v }; }
      case "HGETALL": { const h = store.get(k); const r = []; if (h instanceof Map) for (const [x, y] of h) r.push(x, y); return { result: r }; }
      case "HLEN": { const h = store.get(k); return { result: h instanceof Map ? h.size : 0 }; }
      case "HDEL": { const h = store.get(k); return { result: h instanceof Map && h.delete(a) ? 1 : 0 }; }
      case "SADD": { if (!store.has(k)) store.set(k, new Set()); const s = store.get(k); const had = s.has(a); s.add(a); return { result: had ? 0 : 1 }; }
      case "DEL": { let n = 0; for (const x of c.slice(1)) if (store.delete(x)) n++; return { result: n }; }
      default: throw new Error("fake redis: " + op);
    }
  });
  return { json: async () => out };
};
const M = require("./gta/lib.js").MAP;
const h = require("../mes.fm/api/gta-map.js");
let f = 0, n = 0;
function ok(c, m) { n++; if (!c) { f++; console.log("FAIL", m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); }
let ipn = 1;
function mk(method, o, ip) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; } };
  const headers = Object.assign({ "x-forwarded-for": ip || "10.1.0." + (ipn++ % 250), "content-type": "application/json" }, (o && o.headers) || {});
  return { req: Object.assign({ method, query: {}, body: null }, o, { headers }), res };
}
async function post(body, ip) { const { req, res } = mk("POST", { body }, ip); await h(req, res); return res; }
async function list() { const { req, res } = mk("GET", {}); await h(req, res); return res; }
const vid = (i) => ("abcdef0123456789".repeat(2) + i.toString(16)).slice(-32);
const NEW = { act: "new", x: 812.34, y: 745, cat: "secret", title: "  Rooftop   view ", desc: "Fire escape\n\n\n\nbehind the hotel", region: "Vice City", clip: "https://youtu.be/dQw4w9WgXcQ", vid: vid(1), t: 9000 };

(async () => {
  /* ---- the shared lib */
  ok(fs.readFileSync(path.join(__dirname, "gta/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_gta-lib.js"), "utf8"), "api/_gta-lib.js is a byte-identical copy of gta/lib.js");
  let c = M.cleanPin({ x: 1, y: 2, cat: "animal", title: "White deer", desc: "", region: "", clip: "" }); eq(c.pin && c.pin.title, "White deer", "plain pin");
  const bad = [[{ x: -1 }, "x below 0"], [{ x: 1001 }, "x above 1000"], [{ y: "5" }, "y not a number"], [{ cat: "gun" }, "unknown type"], [{ title: "ab" }, "short title"], [{ title: "x".repeat(71) }, "long title"],
    [{ desc: "x".repeat(601) }, "long description"], [{ title: "visit www.spam.example" }, "www link"], [{ desc: "see https://x.y" }, "http link"], [{ desc: "go to freevbucks.gg now" }, "bare domain"],
    [{ region: "Liberty City" }, "unknown region"], [{ clip: "https://evil.example/x" }, "bad clip"], [{ extra: 1 }, "unknown field"], [{ title: "you retards" }, "slur"]];
  for (const [o, m] of bad) ok(!!M.cleanPin(Object.assign({ x: 5, y: 5, cat: "gem", title: "A fine spot" }, o)).error, "refused: " + m);
  ok(!M.cleanPin({ x: 5, y: 5, cat: "gem", title: "Grassrivers airboat at 3.5 km", desc: "Mr. Smith says 2.0 is out" }).error, "dots in normal text are fine");
  eq(M.clipId("dQw4w9WgXcQ"), "dQw4w9WgXcQ", "bare id"); eq(M.clipId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=20"), "dQw4w9WgXcQ", "watch link"); eq(M.clipId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ", "shorts link"); eq(M.clipId(""), "", "empty clip");
  eq(M.pinStatus(0, 0), "new", "no votes = new"); eq(M.pinStatus(6, 1), "verified", "verified"); eq(M.pinStatus(5, 2), "", "+3 is not verified"); eq(M.pinStatus(3, 3), "disputed", "disputed"); eq(M.pinStatus(0, 5), "fake", "fake at -5");
  ok(M.pinRank(10, 0) > M.pinRank(1, 0), "ten up votes rank above one"); ok(M.pinRank(50, 10) > M.pinRank(3, 0), "many mostly-up votes beat a few");
  const L = [{ id: "a", title: "White deer", desc: "", region: "Ambrosia", cat: "animal", c: 1, up: 1, dn: 0 }, { id: "b", title: "Tarpon", desc: "big fish", region: "Leonida Keys", cat: "fishing", c: 3, up: 9, dn: 1 }, { id: "c", title: "Fake ufo", desc: "", region: "", cat: "secret", c: 2, up: 3, dn: 3 }];
  eq(M.sortPins(L, "top").map((p) => p.id), ["b", "a", "c"], "top order"); eq(M.sortPins(L, "new").map((p) => p.id), ["b", "c", "a"], "newest first"); eq(M.sortPins(L, "disputed")[0].id, "c", "disputed first");
  eq(M.filterPins(L, { q: "fish" }).map((p) => p.id), ["b"], "search finds the type name"); eq(M.filterPins(L, { cats: ["animal"] }).map((p) => p.id), ["a"], "type filter"); eq(M.filterPins(L, { verified: true }).map((p) => p.id), ["b"], "verified only");

  /* ---- the API */
  let r = await list(); eq(r.code, 200, "empty list"); eq(r.body.pins, [], "no pins yet"); ok(/s-maxage=8/.test(r.headers["Cache-Control"]), "list cached a few seconds");
  r = await post(Object.assign({}, NEW, { t: 1000 })); eq(r.code, 400, "too fast after loading the page");
  r = await post(Object.assign({}, NEW, { title: "see www.x.com" })); eq(r.code, 400, "server refuses links");
  r = await post(NEW, "10.9.9.1"); eq(r.code, 200, "new pin"); const id = r.body.id, key = r.body.key;
  ok(/^[a-z0-9]{8}$/.test(id) && /^[a-f0-9]{32}$/.test(key), "id and key shapes");
  const saved = JSON.parse(store.get("gtam:p").get(id));
  eq([saved.title, saved.desc, saved.x, saved.clip], ["Rooftop view", "Fire escape\n\nbehind the hotel", 812.3, "dQw4w9WgXcQ"], "stored cleaned");
  ok(!JSON.stringify(saved).includes(key) && !JSON.stringify(saved).includes(NEW.vid), "key and browser id never stored");
  r = await list(); eq(r.body.pins.length, 1, "listed"); ok(!("h" in r.body.pins[0]) && !("vh" in r.body.pins[0]), "list never shows the hashes");
  r = await post({ act: "new", x: 1, y: 1, cat: "gem", title: "Honeypot", hp: "x", vid: vid(9), t: 9000 }); eq(r.code, 200, "honeypot pretends"); eq(store.get("gtam:p").size, 1, "honeypot saved nothing");

  // votes
  r = await post({ act: "vote", id, vid: NEW.vid, v: 1, t: 2000 }); eq(r.code, 409, "maker can't vote on their own pin");
  r = await post({ act: "vote", id, vid: vid(2), v: 1, t: 2000 }); eq([r.body.up, r.body.dn], [1, 0], "up vote");
  r = await post({ act: "vote", id, vid: vid(2), v: 1, t: 2000 }); eq([r.body.up, r.body.dn], [1, 0], "same vote twice counts once");
  r = await post({ act: "vote", id, vid: vid(2), v: -1, t: 2000 }); eq([r.body.up, r.body.dn], [0, 1], "change to down");
  r = await post({ act: "vote", id, vid: vid(2), v: 0, t: 2000 }); eq([r.body.up, r.body.dn], [0, 0], "take the vote back");
  r = await post({ act: "vote", id, vid: vid(3), v: 2, t: 2000 }); eq(r.code, 400, "bad vote value");
  r = await post({ act: "vote", id, vid: vid(3), v: 1, t: 100 }); eq(r.code, 400, "vote too fast");
  for (let i = 0; i < 4; i++) { r = await post({ act: "vote", id, vid: vid(20 + i), v: 1, t: 2000 }, "10.7.7.7"); }
  eq(r.code, 200, "4 browsers on one network"); r = await post({ act: "vote", id, vid: vid(30), v: 1, t: 2000 }, "10.7.7.7"); eq(r.code, 409, "5th browser on the same network refused");
  // hidden at -5
  for (let i = 0; i < 9; i++) await post({ act: "vote", id, vid: vid(40 + i), v: -1, t: 2000 });
  r = await list(); eq(r.body.pins.length, 0, "a pin at -5 or lower is hidden");
  for (let i = 0; i < 9; i++) await post({ act: "vote", id, vid: vid(40 + i), v: 0, t: 2000 });
  r = await list(); eq(r.body.pins.length, 1, "back when the down votes are taken back");
  // reports
  await post({ act: "report", id, vid: vid(5) }, "10.5.5.5"); await post({ act: "report", id, vid: vid(6) }, "10.5.5.5"); await post({ act: "report", id, vid: vid(7) }, "10.5.5.6");
  r = await list(); eq(r.body.pins.length, 1, "two networks reporting is not enough");
  await post({ act: "report", id, vid: vid(8) }, "10.5.5.7"); r = await list(); eq(r.body.pins.length, 0, "three networks hide it");
  // delete
  r = await post({ act: "del", id, key: "0".repeat(32) }); eq(r.code, 403, "wrong key");
  r = await post({ act: "del", id, key }); eq(r.code, 200, "maker deletes"); ok(!store.get("gtam:p").has(id) && !store.has("gtam:v:" + id), "pin and its votes gone");
  r = await post({ act: "del", id, key }); eq(r.code, 404, "already gone");
  // rate limit on new pins
  let last; for (let i = 0; i < 9; i++) last = await post(Object.assign({}, NEW, { vid: vid(60 + i), title: "Spot number " + i }), "10.3.3.3");
  eq(last.code, 429, "9th new pin in an hour from one network refused");
  // admin delete
  process.env.GTA_MAP_ADMIN_KEY = "a".repeat(40);
  const any = Array.from(store.get("gtam:p").keys())[0];
  r = await post({ act: "del", id: any, admin: "b".repeat(40) }); eq(r.code, 403, "wrong admin key");
  r = await post({ act: "del", id: any, admin: "a".repeat(40) }); eq(r.code, 200, "admin deletes any pin");
  // production origin check
  process.env.VERCEL_ENV = "production";
  { const { req, res } = mk("POST", { body: NEW, headers: { origin: "https://evil.example" } }); await h(req, res); eq(res.code, 403, "other sites can't post"); }
  delete process.env.VERCEL_ENV;
  { const { req, res } = mk("POST", { body: "x=1", headers: { "content-type": "application/x-www-form-urlencoded" } }); await h(req, res); eq(res.code, 415, "json only"); }
  console.log(f ? "gta-map-tests: " + f + " of " + n + " FAILED" : "gta-map-tests: " + n + " checks passed");
  process.exit(f ? 1 : 0);
})();
