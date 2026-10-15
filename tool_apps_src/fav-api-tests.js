// node tool_apps_src/fav-api-tests.js  -- runs mes.fm/api/fav.js with a fake Redis
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), counters = new Map();
global.fetch = async (url, opts) => { const cmds = JSON.parse(opts.body), out = cmds.map(c => { const [op, k, v, a, b] = c;
  if (op === "SET") { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, v); return { result: "OK" }; }
  if (op === "GET") return { result: store.get(k) || null }; if (op === "DEL") { store.delete(k); return { result: 1 }; }
  if (op === "INCR") { counters.set(k, (counters.get(k) || 0) + 1); return { result: counters.get(k) }; } return { result: 1 }; }); return { json: async () => out }; };
const h = require("../mes.fm/api/fav.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
function mk(method, o) { const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req: Object.assign({ method, query: {}, headers: { "x-forwarded-for": "1.1.1.1" }, body: null }, o), res }; }
const G = [["Math", ["/cubic-formula", "/timer"]], ["Other", ["/moon"]]];
(async () => {
  let { req, res } = mk("POST", { body: { g: G } }); await h(req, res); eq(res.code, 200, "create"); const { id, key } = res.body;
  eq(/^[a-z0-9]{9}$/.test(id) && /^[a-f0-9]{32}$/.test(key), true, "id and key shapes");
  ({ req, res } = mk("GET", { query: { id } })); await h(req, res); eq(res.body.g, G, "read back"); eq(res.body.h, undefined, "hash never returned");
  ({ req, res } = mk("POST", { body: { id, key, g: [["Only", ["/moon"]]] } })); await h(req, res); eq(res.code, 200, "update with key");
  ({ req, res } = mk("GET", { query: { id } })); await h(req, res); eq(res.body.g, [["Only", ["/moon"]]], "updated");
  ({ req, res } = mk("POST", { body: { id, key: "0".repeat(32), g: G } })); await h(req, res); eq(res.code, 403, "wrong key refused");
  ({ req, res } = mk("POST", { body: { id, g: G } })); await h(req, res); eq(res.code, 403, "no key refused");
  for (const bad of ["//evil.com", "https://evil.com", "/a/../b", "javascript:alert(1)", "/a b", "x", "/" + "a".repeat(200)]) { ({ req, res } = mk("POST", { body: { g: [["X", [bad]]] } })); await h(req, res); eq(res.code, 400, "rejects path " + bad); }
  ({ req, res } = mk("POST", { body: { g: [] } })); await h(req, res); eq(res.code, 400, "empty list");
  ({ req, res } = mk("POST", { body: { g: [["<b>x</b>\u0001", ["/ok"]]] } })); await h(req, res); eq(res.code, 200, "name is cleaned, not refused"); const id2 = res.body.id;
  ({ req, res } = mk("GET", { query: { id: id2 } })); await h(req, res); eq(res.body.g[0][0], "bx/b", "tags and control characters stripped");
  ({ req, res } = mk("GET", { query: { id: "../x" } })); await h(req, res); eq(res.code, 404, "bad id");
  ({ req, res } = mk("GET", { query: { id: "a".repeat(9) } })); await h(req, res); eq(res.code, 404, "unknown id");
  ({ req, res } = mk("POST", { body: { id, key, del: true } })); await h(req, res); eq(res.code, 200, "delete");
  ({ req, res } = mk("GET", { query: { id } })); await h(req, res); eq(res.code, 404, "gone after delete");
  ({ req, res } = mk("PUT", {})); await h(req, res); eq(res.code, 405, "method");
  for (let i = 0; i < 35; i++) { ({ req, res } = mk("POST", { body: { g: G }, headers: { "x-forwarded-for": "9.9.9.9" } })); await h(req, res); if (i === 34) eq(res.code, 429, "rate limit"); }
  ({ req, res } = mk("POST", { body: { g: G }, headers: { "x-forwarded-for": "5.5.5.5" } })); await h(req, res); eq(res.code, 200, "other IPs unaffected");
  console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
})();
