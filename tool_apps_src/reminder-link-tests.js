// node tool_apps_src/reminder-link-tests.js  -- runs mes.fm/api/reminder-link.js with a fake Redis
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), ttls = new Map(), counters = new Map();
global.fetch = async (url, opts) => { const cmds = JSON.parse(opts.body), out = cmds.map(c => { const [op, k, v] = c;
  if (op === "SET") { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, v); const i = c.indexOf("EX"); if (i > 0) ttls.set(k, c[i + 1]); return { result: "OK" }; }
  if (op === "GET") return { result: store.get(k) || null };
  if (op === "EXPIRE") { if (!c.includes("GT") || v > (ttls.get(k) || 0)) ttls.set(k, v); return { result: 1 }; }
  if (op === "INCR") { counters.set(k, (counters.get(k) || 0) + 1); return { result: counters.get(k) }; } return { result: 1 }; }); return { json: async () => out }; };
const h = require("../mes.fm/api/reminder-link.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
let ip = 1;
function mk(method, o) { const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req: Object.assign({ method, query: {}, headers: { "x-forwarded-for": "1.1.1." + (ip++ % 200) }, body: null }, o), res }; }
const yr = new Date().getUTCFullYear() + 1;
const EV = { title: "MES Livestream 143: 9/11 Spooky Halloween Special + AI Vibe Coding", t: yr + "-10-28T10:00", tz: "America/Vancouver", u: "/livestream-143-911-spooks", len: 180 };
async function post(body, extra) { const { req, res } = mk("POST", Object.assign({ body }, extra || {})); await h(req, res); return res; }
async function get(id) { const { req, res } = mk("GET", { query: { id } }); await h(req, res); return res; }
(async () => {
  let r = await post(EV); eq(r.code, 200, "create"); const id = r.body.id;
  eq(/^[a-z0-9]{7}$/.test(id), true, "id shape");
  r = await get(id); eq(r.code, 200, "read");
  eq(r.body, { title: EV.title, t: EV.t, tz: EV.tz, u: EV.u, d: "", r: "", len: 180 }, "fields back, defaults filled");
  eq(/s-maxage/.test(r.headers["Cache-Control"]), true, "one-off answer is cacheable");
  r = await post(Object.assign({}, EV)); eq(r.body.id, id, "same event -> same id");
  r = await post(Object.assign({}, EV, { title: EV.title + "!" })); eq(r.body.id !== id, true, "other event -> other id");
  r = await post(Object.assign({}, EV, { title: "  MES   Livestream 143: 9/11 Spooky Halloween Special + AI Vibe Coding " })); eq(r.body.id, id, "spaces normalised -> same id");
  // expiry: a year after the event; weekly: two years
  const ttl = ttls.get("rml:" + id), want = (Date.parse(EV.t + ":00Z") - Date.now()) / 1000 + 31536000;
  eq(Math.abs(ttl - want) < 2 * 86400, true, "one-off kept ~1 year after the event");
  r = await post(Object.assign({}, EV, { r: "weekly" })); eq(ttls.get("rml:" + r.body.id), 2 * 31536000, "weekly kept 2 years");
  const wid = r.body.id; ttls.set("rml:" + wid, 5); r = await get(wid); eq(ttls.get("rml:" + wid), 2 * 31536000, "weekly renewed on read"); eq(r.headers["Cache-Control"], "no-store", "weekly read not cached");
  // hash clash: a different event already holds the id -> next id
  store.set("rml:" + h.hashId(JSON.stringify({ title: "Clash", t: yr + "-01-01T10:00", tz: "UTC", u: "", d: "", r: "", len: 60 })), "{\"other\":1}");
  r = await post({ title: "Clash", t: yr + "-01-01T10:00", tz: "UTC" }); eq(r.code, 200, "clash still saves"); eq(r.body.id !== h.hashId(JSON.stringify({ title: "Clash", t: yr + "-01-01T10:00", tz: "UTC", u: "", d: "", r: "", len: 60 })), true, "clash gets another id");
  // accepted forms
  for (const ok of [{ t: yr + "-03-01T09:30Z" }, { t: yr + "-03-01T09:30+05:30" }, { t: yr + "-03-01T09:30", tz: "UTC" }, { t: yr + "-03-01T09:30", tz: "Asia/Ho_Chi_Minh" },
    { t: yr + "-03-01T09:30", tz: "UTC", u: "https://youtube.com/live/abc?x=1" }, { t: yr + "-03-01T09:30", tz: "UTC", u: "http://example.com" }, { t: yr + "-03-01T09:30", tz: "UTC", len: "90" }, { t: yr + "-03-01T09:30", tz: "UTC", d: "Line 1\nLine 2" }]) {
    r = await post(Object.assign({ title: "OK" }, ok)); eq(r.code, 200, "accepts " + JSON.stringify(ok));
  }
  // refused
  const bad = [
    [{ t: "tomorrow", tz: "UTC" }, "free-text time"], [{ t: yr + "-13-01T10:00", tz: "UTC" }, "month 13"], [{ t: yr + "-01-01T25:00", tz: "UTC" }, "hour 25"],
    [{ t: yr + "-01-01T10:00", tz: "Mars/Olympus" }, "unknown zone"], [{ t: yr + "-01-01T10:00", tz: "../../etc" }, "zone path"],
    [{ t: yr + "-01-01T10:00", tz: "UTC", u: "javascript:alert(1)" }, "javascript link"], [{ t: yr + "-01-01T10:00", tz: "UTC", u: "data:text/html,x" }, "data link"],
    [{ t: yr + "-01-01T10:00", tz: "UTC", u: "//evil.com" }, "protocol-relative"], [{ t: yr + "-01-01T10:00", tz: "UTC", u: "/a/../b" }, "dot-dot path"],
    [{ t: yr + "-01-01T10:00", tz: "UTC", u: "https://user:pw@evil.com" }, "userinfo"], [{ t: yr + "-01-01T10:00", tz: "UTC", u: "https://localhost" }, "dotless host"],
    [{ t: yr + "-01-01T10:00", tz: "UTC", r: "daily" }, "r=daily"], [{ t: yr + "-01-01T10:00", tz: "UTC", len: 2 }, "len too short"], [{ t: yr + "-01-01T10:00", tz: "UTC", len: 99999 }, "len too long"],
    [{ t: yr + "-01-01T10:00", tz: "UTC", len: 1.5 }, "len not whole"], [{ t: yr + "-01-01T10:00", tz: "UTC", title: "x".repeat(121) }, "title too long"],
    [{ t: yr + "-01-01T10:00", tz: "UTC", d: "x".repeat(601) }, "notes too long"], [{ t: yr + "-01-01T10:00", tz: "UTC", extra: "1" }, "unknown field"],
    [{ t: yr + "-01-01T10:00", tz: "UTC", title: ["a"] }, "title not a string"], [{ t: "2001-01-01T10:00", tz: "UTC" }, "long past"], [{ t: (yr + 20) + "-01-01T10:00", tz: "UTC" }, "far future"]];
  for (const [b, m] of bad) { r = await post(Object.assign({ title: "X" }, b)); eq(r.code, 400, "refuses " + m); }
  r = await post("not json"); eq(r.code, 400, "bad json");
  r = await get("../x"); eq(r.code, 404, "bad id"); r = await get("zzzzzzz"); eq(r.code, 404, "unknown id");
  r = await get(""); eq(r.code, 404, "no id");
  { const { req, res } = mk("PUT", {}); await h(req, res); eq(res.code, 405, "method"); }
  // title cleaning
  r = await post({ title: "A\u0001B\tC", t: yr + "-01-02T10:00", tz: "UTC" }); r = await get(r.body.id); eq(r.body.title, "A B C", "control characters become spaces");
  // rate limit per IP
  for (let i = 0; i < 32; i++) { r = await post(Object.assign({}, EV, { title: "rl " + i }), { headers: { "x-forwarded-for": "9.9.9.9" } }); if (i === 31) eq(r.code, 429, "rate limit"); }
  r = await post(Object.assign({}, EV, { title: "other ip" }), { headers: { "x-forwarded-for": "5.5.5.5" } }); eq(r.code, 200, "other IPs unaffected");
  // not configured
  delete process.env.UPSTASH_REDIS_REST_URL; r = await post(EV); eq(r.code, 503, "503 without Redis");
  console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
})();
