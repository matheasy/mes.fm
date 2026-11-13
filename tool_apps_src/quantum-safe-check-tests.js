/* node tool_apps_src/quantum-safe-check-tests.js   (no network: DNS, probes and TLS are mocked) */
var P = require("../mes.fm/api/_pq-tls.js"), API = require("../mes.fm/api/pq-check.js"), fails = 0, n = 0;
function ok(c, m) { n++; if (!c) { fails++; console.log("FAIL", m); } }

// ClientHello structure
var ch = P.clientHello("example.com", P.GROUPS.X25519MLKEM768);
ok(ch[0] === 0x16 && ch.readUInt16BE(3) === ch.length - 5, "record header"); ok(ch[5] === 1, "client hello type");
ok(ch.indexOf(Buffer.from("example.com")) > 0, "sni present"); ok(ch.indexOf(P.MLKEM768_PK) > 0, "ml-kem key share present"); ok(P.MLKEM768_PK.length === 1184, "pk size");
ok(P.keyShare(P.GROUPS.X25519MLKEM768).length === 1216 && P.keyShare(P.GROUPS.X25519Kyber768Draft00).length === 1216, "share sizes");

// ServerHello / HRR / alert parsing
function serverHello(group, hrr, split) {
	var ext = Buffer.concat([Buffer.from([0x00, 0x2b, 0, 2, 3, 4]), Buffer.from([0x00, 0x33]), hrr ? Buffer.from([0, 2, group >> 8, group & 255]) : Buffer.concat([Buffer.from([0, 4 + 32, group >> 8, group & 255, 0, 32]), Buffer.alloc(32, 9)])]);
	var body = Buffer.concat([Buffer.from([3, 3]), hrr ? P.HRR_RANDOM : Buffer.alloc(32, 1), Buffer.from([32]), Buffer.alloc(32, 2), Buffer.from([0x13, 0x01, 0]), Buffer.from([ext.length >> 8, ext.length & 255]), ext]);
	var hs = Buffer.concat([Buffer.from([2, 0, body.length >> 8, body.length & 255]), body]);
	if (!split) return Buffer.concat([Buffer.from([0x16, 3, 3, hs.length >> 8, hs.length & 255]), hs]);
	var a = hs.slice(0, 20), b = hs.slice(20);
	return Buffer.concat([Buffer.from([0x16, 3, 3, 0, a.length]), a, Buffer.from([0x16, 3, 3, b.length >> 8, b.length & 255]), b]);
}
var r1 = P.parseServerReply(serverHello(0x11ec)); ok(r1.kind === "hello" && r1.group === 0x11ec && r1.tls13 && r1.groupName === "X25519MLKEM768", "pq hello");
var r2 = P.parseServerReply(serverHello(0x001d, true)); ok(r2.kind === "hrr" && r2.groupName === "X25519", "hrr x25519");
var r3 = P.parseServerReply(serverHello(0x11ec, false, true)); ok(r3 && r3.group === 0x11ec, "split records");
var full = serverHello(0x11ec); ok(P.parseServerReply(full.slice(0, 30)) === null, "needs more bytes");
ok(P.parseServerReply(Buffer.from([0x15, 3, 3, 0, 2, 2, 40])).alert === "handshake_failure", "alert");

// grades
ok(P.grade({ https: true, pq: true, kx: "X25519MLKEM768" }).grade === "A", "grade A"); ok(P.grade({ https: true, draft: true }).grade === "B", "grade B");
ok(P.grade({ https: true, tls: "TLSv1.3", kx: "X25519" }).grade === "C", "grade C"); ok(P.grade({ https: true, tls: "TLSv1.2" }).grade === "D", "grade D"); ok(P.grade({ https: false }).grade === "F", "grade F");

// handler with mocks
function res() { var o = { headers: {}, code: 0, body: null }; o.setHeader = function (k, v) { o.headers[k] = v; }; o.status = function (c) { o.code = c; return o; }; o.send = function (b) { o.body = JSON.parse(b); return o; }; return o; }
var pub = function (h, t) { return Promise.resolve(t === "A" ? ["93.184.215.14"] : []); }, priv = function (h, t) { return Promise.resolve(t === "A" ? ["10.0.0.5"] : []); };
var classicOk = function () { return Promise.resolve({ tls: "TLSv1.3", cipher: "TLS_AES_128_GCM_SHA256", kx: "X25519", certValid: true, cert: { type: "ECDSA", curve: "prime256v1", issuer: "Test CA" }, status: 301, location: "https://www.example.com/" }); };
var deps = function (resolve, probeKind) { return { resolve: resolve, rateOk: function () { return Promise.resolve(true); }, classic: classicOk, probe: function (ip, h, g) { return Promise.resolve(probeKind === "pq" && g === 0x11ec ? { kind: "hello", group: g, tls13: true } : { kind: "hrr", group: 0x1d, groupName: "X25519", tls13: true }); } }; };
(async function () {
	var a = res(); await API.handler({ method: "GET", query: { u: "example.com" }, headers: {} }, a, deps(pub, "pq")); ok(a.code === 200 && a.body.grade === "A" && a.body.pq, "api A"); ok(/s-maxage/.test(a.headers["Cache-Control"]), "cached");
	ok(a.body.redirectHost === "www.example.com", "redirect host"); ok(/\.x$/.test(a.body.ip), "ip masked");
	var b = res(); await API.handler({ method: "GET", query: { u: "https://example.com/page?x=1" }, headers: {} }, b, deps(pub, "no")); ok(b.code === 200 && b.body.grade === "C" && b.body.kx === "X25519", "api C");
	var c = res(); await API.handler({ method: "GET", query: { u: "intranet.example" }, headers: {} }, c, deps(priv, "pq")); ok(c.code === 400 || c.code === 502, "private refused " + c.code);
	var d = res(); await API.handler({ method: "GET", query: { u: "corp.lan" }, headers: {} }, d, deps(pub, "pq")); ok(d.code === 400, "lan name refused");
	var e = res(); await API.handler({ method: "GET", query: { u: "http://10.0.0.1" }, headers: {} }, e, deps(pub, "pq")); ok(e.code === 400, "ip literal refused");
	var f = res(); await API.handler({ method: "GET", query: { u: "example.com:8443" }, headers: {} }, f, deps(pub, "pq")); ok(f.code === 400, "odd port refused");
	var g = res(); await API.handler({ method: "GET", query: { u: "example.com" }, headers: {} }, g, Object.assign(deps(priv, "pq"))); ok(g.code === 502 && /public/.test(g.body.error), "private dns refused");
	var h = res(); await API.handler({ method: "POST", query: {}, headers: {} }, h, deps(pub, "pq")); ok(h.code === 405, "post refused");
	var i = res(); await API.handler({ method: "GET", query: { u: "example.com" }, headers: {} }, i, Object.assign(deps(pub, "pq"), { rateOk: function () { return Promise.resolve(false); } })); ok(i.code === 429, "rate limit");
	console.log(n + " checks, " + fails + " failed"); process.exit(fails ? 1 : 0);
})();
