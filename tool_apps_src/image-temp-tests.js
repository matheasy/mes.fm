// node tool_apps_src/image-temp-tests.js  -- runs mes.fm/api/image-temp.js with a fake Redis and fake req / res
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
const store = new Map(), counters = new Map();
global.fetch = async (url, opts) => { const cmds = JSON.parse(opts.body), out = cmds.map(c => { const [op, k, v] = c; if (op === "SET") { store.set(k, v); return { result: "OK" }; } if (op === "GET") return { result: store.get(k) || null }; if (op === "INCR") { counters.set(k, (counters.get(k) || 0) + 1); return { result: counters.get(k) }; } if (op === "EXPIRE") return { result: 1 }; return { result: null }; }); return { json: async () => out }; };
const h = require("../mes.fm/api/image-temp.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
function mk(method, o) { const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { this.body = b === undefined ? this.body : b; return this; } }; const req = Object.assign({ method, headers: { host: "mes.fm", "x-forwarded-for": "1.2.3.4" }, query: {}, body: null }, o); return { req, res }; }
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake jpeg bytes".repeat(20))]);
(async () => {
  let { req, res } = mk("POST", { body: jpg }); await h(req, res); eq(res.code, 200, "upload ok"); const id = res.body.id; eq(/^[A-Za-z0-9_-]{22}$/.test(id), true, "22-char url-safe id"); eq(res.body.url, "https://mes.fm/ri/" + id + ".jpg", "public url"); eq(res.headers["Cache-Control"], "no-store", "no-store on upload");
  ({ req, res } = mk("GET", { query: { id: id + ".jpg" } })); await h(req, res); eq(res.code, 200, "get ok"); eq(Buffer.compare(res.body, jpg), 0, "same bytes back"); eq(res.headers["Content-Type"], "image/jpeg", "type"); eq(/noindex/.test(res.headers["X-Robots-Tag"]), true, "noindex");
  ({ req, res } = mk("GET", { query: { id } })); await h(req, res); eq(res.code, 200, "get without extension");
  ({ req, res } = mk("GET", { query: { id: "A".repeat(22) } })); await h(req, res); eq(res.code, 404, "unknown id");
  ({ req, res } = mk("GET", { query: { id: "../../etc/passwd" } })); await h(req, res); eq(res.code, 404, "bad id");
  ({ req, res } = mk("POST", { body: Buffer.from("<html>not an image</html>") })); await h(req, res); eq(res.code, 415, "rejects non-JPEG");
  ({ req, res } = mk("POST", { body: Buffer.concat([jpg, Buffer.alloc(700001)]) })); await h(req, res); eq(res.code, 413, "rejects over 700 KB");
  ({ req, res } = mk("PUT", { body: jpg })); await h(req, res); eq(res.code, 405, "method");
  for (let i = 0; i < 45; i++) { ({ req, res } = mk("POST", { body: jpg, headers: { host: "mes.fm", "x-forwarded-for": "9.9.9.9" } })); await h(req, res); if (i === 39) eq(res.code, 200, "40th upload ok"); if (i === 40) eq(res.code, 429, "41st upload rate limited"); }
  ({ req, res } = mk("POST", { body: jpg, headers: { host: "mes.fm", "x-forwarded-for": "5.5.5.5" } })); await h(req, res); eq(res.code, 200, "other IPs unaffected");
  console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
})();
