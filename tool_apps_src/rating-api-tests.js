// node tool_apps_src/rating-api-tests.js  -- runs mes.fm/api/rating.js against a fake Redis
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const kv = new Map(), hashes = new Map(), sets = new Map(), zsets = new Map(), ttl = new Map();
let redisCalls = 0;
function cmd(c) {
  const [op, k] = c;
  switch (op) {
    case "GET": return kv.has(k) ? kv.get(k) : null;
    case "SET": if (c.includes("NX") && kv.has(k)) return null; kv.set(k, String(c[2])); return "OK";
    case "INCR": kv.set(k, String((Number(kv.get(k)) || 0) + 1)); return Number(kv.get(k));
    case "EXPIRE": ttl.set(k, c[2]); return 1;
    case "HINCRBY": { const h = hashes.get(k) || {}; h[c[2]] = (h[c[2]] || 0) + Number(c[3]); hashes.set(k, h); return h[c[2]]; }
    case "HGETALL": { const h = hashes.get(k) || {}; return Object.entries(h).flatMap(([a, b]) => [a, String(b)]); }
    case "SADD": { const s = sets.get(k) || new Set(); const had = s.has(c[2]); s.add(c[2]); sets.set(k, s); return had ? 0 : 1; }
    case "SISMEMBER": return sets.has(k) && sets.get(k).has(c[2]) ? 1 : 0;
    case "SCARD": return sets.has(k) ? sets.get(k).size : 0;
    case "SMEMBERS": return sets.has(k) ? [...sets.get(k)] : [];
    case "ZADD": { const z = zsets.get(k) || new Map(); z.set(c[3], Number(c[2])); zsets.set(k, z); return 1; }
    case "ZREMRANGEBYRANK": return 0;
    case "ZREVRANGE": { const z = zsets.get(k) || new Map(); return [...z.entries()].sort((a, b) => b[1] - a[1]).slice(c[2], c[3] + 1).flatMap(([m, s]) => [m, String(s)]); }
    default: throw new Error("fake redis: unknown " + op);
  }
}
global.fetch = async (url, opts) => { redisCalls++; const out = JSON.parse(opts.body).map((c) => ({ result: cmd(c) })); return { json: async () => out }; };
const h = require("../mes.fm/api/rating.js");
const T = h._test;
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
function mk(method, o) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  const req = Object.assign({ method, query: {}, body: null }, o);
  req.headers = Object.assign({ "x-forwarded-for": "1.1.1.1", "content-type": "application/json", origin: "https://mes.fm" }, o && o.headers);
  return { req, res };
}
const bid = (i) => (i.toString(16) + "a".repeat(32)).slice(0, 32);
async function vote(path, stars, i, extra) {
  const { req, res } = mk("POST", Object.assign({ body: Object.assign({ path, stars, id: bid(i), t: 5000, hp: "" }, extra && extra.body) }, extra && { headers: extra.headers }));
  await h(req, res); return res;
}
async function get(query) { const { req, res } = mk("GET", { query }); await h(req, res); return res; }

(async () => {
  // pure helpers
  eq(T.bayes(0, 0), 4, "bayes with no votes = prior");
  eq(T.bayes(1, 5) < T.bayes(20, 94), true, "one 5-star vote ranks below 20 votes averaging 4.7");
  eq(T.parseHash(["h5", "2", "h1", "1"]), { n: 3, s: 11, h: [1, 0, 0, 0, 2] }, "parse flat hash");
  eq(T.parseHash({ h3: "4" }), { n: 4, s: 12, h: [0, 0, 4, 0, 0] }, "parse object hash");
  eq(T.parseHash({ h2: "-3" }).n, 0, "negative buckets clamp to 0");
  const rk = T.rank([{ p: "/a", n: 1, s: 5, h: [0, 0, 0, 0, 1] }, { p: "/b", n: 20, s: 94, h: [0, 0, 1, 4, 15] }, { p: "/c", n: 0, s: 0, h: [0, 0, 0, 0, 0] }]);
  eq(rk.map((r) => r.p), ["/b", "/a"], "ranking: Bayesian, unrated left out");
  eq([rk[0].avg, rk[1].avg], [4.7, undefined], "average only from MIN ratings");

  // validation
  let r = await vote("/percentagecalculator", 5, 1); eq(r.code, 200, "first vote"); eq([r.body.count, r.body.avg, r.body.mine], [1, null, 5], "count 1, no average yet");
  r = await vote("/no-such-page-xyz", 4, 1); eq(r.code, 400, "unknown page refused");
  for (const bad of ["//evil.com", "https://evil.com", "/a/../b", "javascript:alert(1)", "/a b", "", 5, null, "/" + "a".repeat(200)]) { r = await vote(bad, 4, 1); eq(r.code, 400, "bad path " + JSON.stringify(bad)); }
  for (const s of [0, 6, 4.5, "5", null, -1]) { r = await vote("/timer", s, 1); eq(r.code, 400, "bad stars " + JSON.stringify(s)); }
  r = await vote("/timer", 4, 1, { body: { id: "xyz" } }); eq(r.code, 400, "bad browser id");
  r = await vote("/timer", 4, 1, { body: { t: 1200 } }); eq(r.code, 400, "too soon after load");
  r = await vote("/timer", 4, 1, { body: { t: undefined } }); eq(r.code, 400, "no time on page");
  r = await vote("/timer", 4, 1, { headers: { "content-type": "text/plain" } }); eq(r.code, 415, "form posts refused");
  r = await vote("/timer", 4, 1, { body: { pad: "x".repeat(2000) } }); eq(r.code, 400, "oversize body");
  { const { req, res } = mk("POST", { body: "{" + "x".repeat(3000) }); await h(req, res); eq(res.code, 400, "oversize raw string body"); }
  { const { req, res } = mk("POST", { body: "not json" }); await h(req, res); eq(res.code, 400, "broken json"); }
  { const { req, res } = mk("POST", { body: [1, 2] }); await h(req, res); eq(res.code, 400, "array body"); }
  const before = JSON.stringify([...hashes]);
  r = await vote("/timer", 5, 2, { body: { hp: "http://spam" } }); eq([r.code, r.body.ok], [200, true], "honeypot pretends success");
  eq(JSON.stringify([...hashes]), before, "honeypot stores nothing");
  { const { req, res } = mk("PUT", {}); await h(req, res); eq(res.code, 405, "method"); }

  // origin only enforced in production
  process.env.VERCEL_ENV = "production";
  r = await vote("/timer", 4, 3, { headers: { origin: "https://evil.example" } }); eq(r.code, 403, "foreign origin refused in production");
  r = await vote("/timer", 4, 3, { headers: { origin: "" } }); eq(r.code, 403, "missing origin refused in production");
  r = await vote("/timer", 4, 3); eq(r.code, 200, "mes.fm origin fine in production");
  delete process.env.VERCEL_ENV;

  // change vote, dedupe
  r = await vote("/percentagecalculator", 3, 1); eq([r.code, r.body.count, r.body.mine, r.body.changed], [200, 1, 3, true], "changing a vote replaces it");
  r = await vote("/percentagecalculator", 3, 1); eq([r.body.count, r.body.changed], [1, false], "same vote again: still one");
  eq(hashes.get("rt:p:/percentagecalculator"), { h5: 0, h3: 1 }, "histogram moved from 5 to 3");
  r = await vote("/percentagecalculator", 5, 1, { body: { prev: 1 } }); eq(r.body.count, 1, "client 'prev' is ignored, server knows the old vote");
  eq(hashes.get("rt:p:/percentagecalculator").h1 === undefined, true, "a faked prev never decrements another bucket");

  // per-network limit: 3 browsers per IP per page, others from that IP refused, other IPs fine
  r = await vote("/moon", 5, 10, { headers: { "x-forwarded-for": "7.7.7.7" } }); eq(r.code, 200, "net 1");
  r = await vote("/moon", 5, 11, { headers: { "x-forwarded-for": "7.7.7.7" } }); eq(r.code, 200, "net 2");
  r = await vote("/moon", 5, 12, { headers: { "x-forwarded-for": "7.7.7.7" } }); eq(r.code, 200, "net 3");
  r = await vote("/moon", 5, 13, { headers: { "x-forwarded-for": "7.7.7.7" } }); eq(r.code, 409, "4th browser on the same network refused");
  r = await vote("/moon", 2, 11, { headers: { "x-forwarded-for": "7.7.7.7" } }); eq(r.code, 200, "an existing voter can still change their vote");
  r = await vote("/moon", 5, 13, { headers: { "x-forwarded-for": "8.8.8.8" } }); eq(r.code, 200, "same browser from another network is a new vote only if not voted");
  r = await vote("/timer", 5, 13, { headers: { "x-forwarded-for": "7.7.7.7" } }); eq(r.code, 200, "network limit is per page");
  eq([...ttl.entries()].some(([k, v]) => k.startsWith("rt:ip:") && v === 30 * 86400), true, "network records expire after 30 days");
  eq([...kv.keys(), ...sets.keys(), ...hashes.keys()].some((k) => k.includes("7.7.7.7")), false, "raw IP never stored");
  eq([...kv.keys()].some((k) => k.includes(bid(10))), false, "raw browser id never stored");

  // histogram + averages once MIN reached
  for (let i = 0; i < 6; i++) await vote("/clock", [5, 5, 4, 5, 3, 5][i], 100 + i, { headers: { "x-forwarded-for": "10.0.0." + i } });
  r = await get({ path: "/clock" }); eq(r.body, { count: 6, avg: 4.5, hist: [0, 0, 1, 1, 4] }, "GET summary with average + histogram");
  eq(/s-maxage=60/.test(r.headers["Cache-Control"]), true, "page summary edge-cached");
  r = await get({ path: "/moon" }); eq([r.body.count, r.body.avg, r.body.hist], [4, null, null], "under MIN: count only");
  r = await get({ path: "/evil" }); eq(r.code, 404, "GET unknown page");

  // ranking
  await new Promise((r) => setTimeout(r, 5));
  await vote("/emoji", 5, 200, { headers: { "x-forwarded-for": "11.0.0.1" } });
  r = await get({ top: "1" }); eq(r.code, 200, "top");
  const ps = r.body.pages.map((x) => x.p);
  eq(ps[0], "/clock", "6 ratings of 4.5 beat one 5-star vote");
  eq(ps.indexOf("/clock") < ps.indexOf("/emoji"), true, "single 5 below");
  eq(r.body.pages.find((x) => x.p === "/emoji").avg, undefined, "no average leaked under MIN");
  eq(r.body.recent.slice(0, 2).some((x) => x.p === "/emoji") && r.body.recent.every((x, i, a) => !i || a[i - 1].t >= x.t), true, "recently rated, newest first");
  eq([r.body.min, r.body.prior], [5, [4, 5]], "ranking parameters returned");

  // rate limit
  for (let i = 0; i < 62; i++) r = await vote("/timer", 4, 300 + i, { headers: { "x-forwarded-for": "9.9.9.9" } });
  eq(r.code === 429 || r.code === 409, true, "flood from one IP stopped");
  r = await vote("/latex", 4, 999, { headers: { "x-forwarded-for": "9.9.9.9" } }); eq(r.code, 429, "rate limit across pages");
  r = await vote("/latex", 4, 998, { headers: { "x-forwarded-for": "6.6.6.6" } }); eq(r.code, 200, "other IPs unaffected");

  // no Redis configured
  const u = process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_URL;
  r = await get({ path: "/clock" }); eq(r.code, 503, "503 without Redis"); process.env.UPSTASH_REDIS_REST_URL = u;

  // allow-list file sanity
  const list = require("../mes.fm/api/_rating-pages.json").p;
  eq(list.length > 1000, true, "allow-list has the site's pages");
  eq(list.filter((p) => /^\/(contact|privacy-policy|donate|ads|search-console)$/.test(p)), [], "private / utility pages not rateable");
  console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
})();
