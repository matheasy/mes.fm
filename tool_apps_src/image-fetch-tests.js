// node tool_apps_src/image-fetch-tests.js -- link checks of mes.fm/api/image-fetch.js (_url-guard.js) with a fake DNS and a fake fetch
"use strict";
const path = require("path");
const G = require(path.join(__dirname, "../mes.fm/api/_url-guard.js"));
const F = require(path.join(__dirname, "../mes.fm/api/image-fetch.js"));
let n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL " + msg); } }

// ---- URL shape ----
const good = ["https://upload.wikimedia.org/a/b.jpg", "http://example.org.uk/x.png?x=1#frag", "https://cdn.site.com:443/p.webp", "HTTPS://Images.Site.COM/A.PNG"];
good.forEach((u) => ok(G.checkUrl(u).ok, "accept " + u));
ok(G.checkUrl("https://a.site.com/p.png#x").url === "https://a.site.com/p.png", "hash dropped");
const refuse = ["data:image/png;base64,AAAA", "blob:https://mes.fm/1234", "file:///etc/passwd", "ftp://site.com/a.png", "javascript:alert(1)", "https://user:pw@site.com/a.png",
  "https://site.com:8080/a.png", "http://site.com:443/a.png", "http://127.0.0.1/a.png", "http://[::1]/a.png", "http://2130706433/a.png", "http://0x7f000001/a.png", "http://localhost/a.png",
  "http://printer.local/a.png", "http://metadata.google.internal/x", "http://intranet/x.png", "", "   ", "not a link", "https://" + "a".repeat(2100) + ".com/x", "http://10.0.0.1/a.png", "http://foo.test/a.png"];
refuse.forEach((u) => ok(!G.checkUrl(u).ok, "refuse " + JSON.stringify(u.slice(0, 60))));

// ---- addresses ----
["8.8.8.8", "1.1.1.1", "151.101.1.69", "100.63.0.1", "172.32.0.1"].forEach((ip) => ok(G.ipv4Public(ip), "public v4 " + ip));
["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "192.0.2.5", "198.18.0.1", "203.0.113.9", "1.2.3", "1.2.3.256", "01.2.3.4x"].forEach((ip) => ok(!G.ipv4Public(ip), "private v4 " + ip));
["2606:4700:4700::1111", "2a00:1450:4001:82a::200e", "2001:4860:4860::8888"].forEach((ip) => ok(G.ipv6Public(ip), "public v6 " + ip));
["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "64:ff9b::7f00:1", "2001:db8::1", "2001:0:4136:e378::1", "2002:7f00:1::1", "100::1", "::127.0.0.1", "3fff::1", "zz::1", "1:2:3:4:5:6:7:8:9"].forEach((ip) => ok(!G.ipv6Public(ip), "private v6 " + ip));
ok(JSON.stringify(G.v6groups("::ffff:1.2.3.4")) === JSON.stringify([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]), "v6 with dotted tail");

// ---- fake DNS ----
const DNS = {
  "img.good.com": { A: ["151.101.1.69"], AAAA: ["2606:4700::1"] },
  "only6.good.com": { A: [], AAAA: ["2606:4700::2"] },
  "rebind.evil.com": { A: ["151.101.1.69", "127.0.0.1"], AAAA: [] },
  "meta.evil.com": { A: ["169.254.169.254"], AAAA: [] },
  "v6.evil.com": { A: ["8.8.8.8"], AAAA: ["::1"] },
  "redir.good.com": { A: ["8.8.4.4"], AAAA: [] },
};
const resolve = (h, t) => Promise.resolve((DNS[h] || {})[t] || []);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1]);
const PDF = Buffer.from("%PDF-1.7\n%....\n1 0 obj");
const HTML = Buffer.from("<!doctype html><html><script>alert(1)</script>");
ok(G.sniff(PNG) === "image/png" && G.sniff(JPG) === "image/jpeg" && G.sniff(PDF) === "application/pdf" && G.sniff(HTML) === null, "sniff");
ok(G.sniff(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")) === "image/webp" && G.sniff(Buffer.from("\0\0\0\x1cftypavif\0\0")) === "image/avif" && G.sniff(Buffer.from("GIF89a......")) === "image/gif", "sniff webp/avif/gif");
ok(!G.typeAllowed("image/svg+xml") && !G.typeAllowed("text/html") && G.typeAllowed("image/png; charset=x") && G.typeAllowed("application/pdf") && G.typeAllowed(""), "typeAllowed");

// routes for the fake fetch: url -> response
const ROUTES = {
  "https://img.good.com/a.png": { status: 200, headers: { "content-type": "image/png" }, body: PNG },
  "https://img.good.com/doc": { status: 200, headers: { "content-type": "application/octet-stream" }, body: PDF },
  "https://img.good.com/page.html": { status: 200, headers: { "content-type": "image/png" }, body: HTML },
  "https://img.good.com/svg": { status: 200, headers: { "content-type": "image/svg+xml" }, body: null, badType: true },
  "https://img.good.com/big.jpg": { status: 200, headers: {}, body: null, tooBig: true },
  "https://img.good.com/404": { status: 404, headers: {}, body: null },
  "https://redir.good.com/to-good": { status: 302, headers: { location: "https://img.good.com/a.png" } },
  "https://redir.good.com/to-meta": { status: 301, headers: { location: "http://meta.evil.com/latest" } },
  "https://redir.good.com/to-local": { status: 302, headers: { location: "http://127.0.0.1/x.png" } },
  "https://redir.good.com/to-file": { status: 302, headers: { location: "file:///etc/passwd" } },
  "https://redir.good.com/loop": { status: 302, headers: { location: "/loop" } },
  "https://only6.good.com/a.jpg": { status: 200, headers: { "content-type": "image/jpeg" }, body: JPG },
};
const seen = [];
const get = (url, ip) => { seen.push(url + " @" + ip.address); const r = ROUTES[url]; return r ? Promise.resolve(r) : Promise.reject(new Error("no route " + url)); };

function fakeRes() {
  const r = { code: 0, h: {}, body: null };
  r.setHeader = (k, v) => { r.h[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
async function call(url, extra) {
  const res = fakeRes();
  await F.handler({ method: "GET", query: { url }, headers: {} }, res, Object.assign({ resolve, get, rateOk: () => Promise.resolve(true) }, extra || {}));
  return res;
}

(async () => {
  let r = await call("https://img.good.com/a.png");
  ok(r.code === 200 && r.h["content-type"] === "image/png" && r.body.equals(PNG), "png served");
  ok(r.h["cache-control"] === "no-store" && r.h["x-content-type-options"] === "nosniff" && /sandbox/.test(r.h["content-security-policy"]), "safety headers");
  r = await call("https://img.good.com/doc"); ok(r.code === 200 && r.h["content-type"] === "application/pdf", "octet-stream PDF served as PDF");
  r = await call("https://img.good.com/page.html"); ok(r.code === 415, "HTML labelled image refused");
  r = await call("https://img.good.com/svg"); ok(r.code === 415, "SVG refused");
  r = await call("https://img.good.com/big.jpg"); ok(r.code === 413, "too big");
  r = await call("https://img.good.com/404"); ok(r.code === 502, "404 passed on as 502");
  r = await call("https://redir.good.com/to-good"); ok(r.code === 200 && r.body.equals(PNG), "redirect followed");
  r = await call("https://redir.good.com/to-meta"); ok(r.code === 400, "redirect to metadata address refused");
  r = await call("https://redir.good.com/to-local"); ok(r.code === 400, "redirect to 127.0.0.1 refused");
  r = await call("https://redir.good.com/to-file"); ok(r.code === 400, "redirect to file: refused");
  r = await call("https://redir.good.com/loop"); ok(r.code === 502, "redirect loop stops");
  ok(seen.filter((s) => s.startsWith("https://redir.good.com/loop")).length === 5, "loop stops after 4 hops (5 requests)");
  r = await call("https://rebind.evil.com/a.png"); ok(r.code === 400, "mixed public + private answers refused");
  r = await call("https://meta.evil.com/a.png"); ok(r.code === 400, "metadata address refused");
  r = await call("https://v6.evil.com/a.png"); ok(r.code === 400, "private AAAA refused");
  r = await call("https://nxdomain.example.org/a.png"); ok(r.code === 400, "no address refused");
  r = await call("https://only6.good.com/a.jpg"); ok(r.code === 200 && seen[seen.length - 1].endsWith("@2606:4700::2"), "IPv6-only host connects to the checked address");
  ok(seen.some((s) => s === "https://img.good.com/a.png @151.101.1.69"), "connects to the checked IPv4 address");
  r = await call("data:image/png;base64,AAAA"); ok(r.code === 400, "data: refused");
  r = await call("blob:https://mes.fm/x"); ok(r.code === 400, "blob: refused");
  r = await call(undefined); ok(r.code === 400, "no url");
  r = await call("https://img.good.com/a.png", { rateOk: () => Promise.resolve(false) }); ok(r.code === 429, "rate limit");
  const res = fakeRes(); await F.handler({ method: "POST", query: { url: "https://img.good.com/a.png" }, headers: {} }, res, { resolve, get }); ok(res.code === 405, "POST refused");
  ok(F.MAX_BYTES <= 4500000, "fits a Vercel response");
  console.log((bad ? bad + " of " : "all ") + n + " checks " + (bad ? "FAILED" : "passed"));
  process.exit(bad ? 1 : 0);
})();
