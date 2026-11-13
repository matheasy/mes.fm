/* node tool_apps_src/page-text-tests.js  -- api/page-text.js + _page-text-lib.js (article text for mes.fm/gnm) */
const T = require("../mes.fm/api/_page-text-lib.js");
const P = require("../mes.fm/api/page-text.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }

const html = '<html><head><title>Old title</title><meta property="og:title" content="A &amp; B report"><style>p{}</style><script>alert(1)</script></head><body><nav>Home Menu</nav><header>Site</header>' +
	'<article><h1>Case study</h1><p>The patient had a <b>cough</b> &mdash; then fever.</p><ul><li>one</li><li>two</li></ul><script>x()</script><p>' + "Long text. ".repeat(50) + '</p></article><footer>Copyright</footer><aside>Ads</aside></body></html>';
const e = T.extract(html);
ok(e.title === "A & B report", "og:title wins: " + e.title);
ok(/Case study:/.test(e.text) && /cough — then fever/.test(e.text), "heading line + entities");
ok(!/alert|x\(\)|Home Menu|Copyright|Ads|p\{\}/.test(e.text), "no script / style / nav / footer / aside");
ok(/• one\n• two/.test(e.text.replace(/\n\n/g, "\n")), "list items");
ok(T.decodeEntities("&#233;&#x41;&nbsp;&bogus;") === "éA &bogus;", "entities");
ok(T.charsetOf("text/html; charset=ISO-8859-1", Buffer.from("")) === "iso-8859-1" && T.charsetOf("", Buffer.from('<meta charset="windows-1252">')) === "windows-1252", "charset");
ok(T.decode(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "text/html; charset=latin1") === "café", "latin1 decode");

function res() { const r = { code: 0, h: {}, body: "" }; r.setHeader = (k, v) => { r.h[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.send = (b) => { r.body = b; return r; }; return r; }
const pub = async (h, t) => t === "A" ? ["93.184.216.34"] : [];
async function run(url, get, resolve) { const r = res(); await P.handler({ method: "GET", query: { url }, headers: {} }, r, { resolve: resolve || pub, get, rateOk: async () => true }); return { code: r.code, j: JSON.parse(r.body) }; }
(async () => {
	let r = await run("https://example.com/a", async () => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from(html) }));
	ok(r.code === 200 && /Case study/.test(r.j.text) && r.j.title === "A & B report", "html page -> text");
	r = await run("https://example.com/r", async (u) => u.endsWith("/r") ? { status: 301, headers: { location: "/final" }, body: null } : { status: 200, headers: { "content-type": "text/html" }, body: Buffer.from(html) });
	ok(r.code === 200 && r.j.url === "https://example.com/final", "redirect followed");
	r = await run("https://example.com/x.pdf", async () => ({ status: 200, headers: { "content-type": "application/pdf" }, body: null, redo: "pdf" }));
	ok(r.j.redo === "pdf", "PDF -> redo");
	r = await run("https://example.com/x", async () => ({ status: 200, headers: { "content-type": "application/octet-stream" }, body: Buffer.from("%PDF-1.7 rest of file") }));
	ok(r.j.redo === "pdf", "PDF sniffed");
	r = await run("http://127.0.0.1/", async () => { throw new Error("must not fetch"); });
	ok(r.code === 400, "bare IP refused");
	r = await run("https://evil.example/", async () => { throw new Error("must not fetch"); }, async (h, t) => t === "A" ? ["10.0.0.5"] : []);
	ok(r.code === 400, "private address refused");
	r = await run("https://example.com/", async (u) => ({ status: 302, headers: { location: "http://localhost/admin" }, body: null }));
	ok(r.code === 400, "redirect to localhost refused");
	r = await run("https://example.com/", async () => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html><body><div id=app></div></body></html>") }));
	ok(r.code === 422, "JS-only page -> helpful error");
	r = await run("https://example.com/", async () => ({ status: 200, headers: { "content-type": "image/png" }, body: null, badType: true }));
	ok(r.code === 415, "picture refused");
	console.log(pass + " passed, " + fail + " failed");
	process.exit(fail ? 1 : 0);
})();
