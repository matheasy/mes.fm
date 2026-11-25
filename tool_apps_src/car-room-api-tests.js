/* node tool_apps_src/car-room-api-tests.js : mes.fm/api/car-room.js (Car Sandbox WebRTC signalling) against a fake Upstash */
"use strict";
process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
var DB = new Map(), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL:", m); } }
function run(c) {
  var k = c[1], op = c[0];
  if (op === "GET") return DB.has(k) ? DB.get(k) : null;
  if (op === "SET") { if (c.indexOf("NX") > 0 && DB.has(k)) return null; DB.set(k, c[2]); return "OK"; }
  if (op === "DEL") { DB.delete(k); return 1; }
  if (op === "INCR") { var v = (+DB.get(k) || 0) + 1; DB.set(k, String(v)); return v; }
  if (op === "EXPIRE") return 1;
  if (op === "RPUSH") { var l = DB.get(k) || []; l.push(c[2]); DB.set(k, l); return l.length; }
  if (op === "LTRIM") { var l2 = DB.get(k) || []; DB.set(k, l2.slice(c[2])); return "OK"; }
  if (op === "LPOP") { var l3 = DB.get(k); if (!l3 || !l3.length) return null; var out = l3.splice(0, c[2]); return out; }
  throw new Error("cmd " + op);
}
global.fetch = async function (url, opts) { var cmds = JSON.parse(opts.body); return { json: async function () { return cmds.map(function (c) { return { result: run(c) }; }); } }; };
var api = require("../mes.fm/api/car-room.js");
function call(method, body, query, ip) {
  return new Promise(function (resolve) {
    var res = { code: 0, h: {}, setHeader: function (a, b) { this.h[a] = b; }, status: function (c) { this.code = c; return this; }, json: function (o) { resolve({ code: this.code, body: o }); } };
    api({ method: method, body: body, query: query || {}, headers: { "content-type": "application/json", "x-forwarded-for": ip || "1.2.3.4", origin: "https://mes.fm" }, socket: {} }, res);
  });
}
var SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=candidate:1 1 udp 1 10.0.0.1 5000 typ host\r\n";
(async function () {
  var H = "HostPeer0001", J = "JoinPeer0001", X = "OtherPeer001";
  var r = await call("POST", { act: "new", peer: H, name: "Host <x>", room: { w: "mars", g: 3.71, map: "abc_-", wx: "dust" } });
  ok(r.code === 200 && /^[a-hj-km-np-z2-9]{6}$/.test(r.body.code), "room made " + JSON.stringify(r.body));
  var code = r.body.code;
  r = await call("GET", null, { code: code }); ok(r.code === 200 && r.body.host === H && r.body.name === "Host x" && r.body.room.w === "mars" && r.body.room.map === "abc_-", "room info");
  ok((await call("GET", null, { code: "zzzzzz" })).code === 404, "no such room");
  ok((await call("GET", null, { code: "ABC" })).code === 400, "bad code");
  ok((await call("POST", { act: "new", peer: H, room: { w: "pluto" } })).code === 400, "unknown world refused");
  ok((await call("POST", { act: "new", peer: "short", room: { w: "earth" } })).code === 400, "bad peer refused");
  // joiner -> host offer
  r = await call("POST", { act: "send", code: code, from: J, to: H, kind: "offer", sdp: SDP, name: "Jo" }); ok(r.code === 200, "offer sent");
  ok((await call("POST", { act: "send", code: code, from: J, to: X, kind: "offer", sdp: SDP })).code === 403, "joiner can't write to another joiner");
  ok((await call("POST", { act: "send", code: code, from: J, to: H, kind: "answer", sdp: SDP })).code === 403, "joiner can't answer");
  ok((await call("POST", { act: "send", code: code, from: J, to: H, kind: "offer", sdp: "<script>" })).code === 400, "junk SDP refused");
  ok((await call("POST", { act: "send", code: code, from: J, to: H, kind: "offer", sdp: SDP + "\u0000" })).code === 400, "control characters refused");
  ok((await call("POST", { act: "send", code: code, from: J, to: H, kind: "evil", sdp: SDP })).code === 400, "unknown kind refused");
  r = await call("POST", { act: "recv", code: code, peer: H }); ok(r.body.alive && r.body.msgs.length === 1 && r.body.msgs[0].from === J && r.body.msgs[0].sdp === SDP && r.body.msgs[0].name === "Jo", "host gets the offer");
  r = await call("POST", { act: "recv", code: code, peer: H }); ok(r.body.msgs.length === 0, "mailbox emptied");
  r = await call("POST", { act: "send", code: code, from: H, to: J, kind: "answer", sdp: SDP }); ok(r.code === 200, "answer sent");
  r = await call("POST", { act: "recv", code: code, peer: J }); ok(r.body.msgs.length === 1 && r.body.msgs[0].kind === "answer", "joiner gets the answer");
  // room settings + close
  ok((await call("POST", { act: "room", code: code, peer: J, room: { w: "earth" } })).code === 403, "only the host changes the room");
  ok((await call("POST", { act: "room", code: code, peer: H, room: { w: "moon", g: 1.62 } })).code === 200, "host changes the room");
  ok((await call("GET", null, { code: code })).body.room.w === "moon", "room changed");
  ok((await call("POST", { act: "close", code: code, peer: J })).code === 403, "only the host closes");
  ok((await call("POST", { act: "close", code: code, peer: H })).code === 200, "host closes");
  r = await call("POST", { act: "recv", code: code, peer: J }); ok(r.body.alive === false, "closed room seen as gone");
  ok((await call("POST", { act: "send", code: code, from: J, to: H, kind: "offer", sdp: SDP })).code === 404, "no sending to a closed room");
  // limits
  var lim = 0; for (var i = 0; i < 25; i++) { var q = await call("POST", { act: "new", peer: H, room: { w: "earth" } }, null, "9.9.9.9"); if (q.code === 429) lim++; }
  ok(lim === 5, "20 rooms an hour per network (" + lim + " refused)");
  process.env.VERCEL_ENV = "production";
  var bo = await new Promise(function (resolve) { var res = { setHeader: function () {}, status: function (c) { this.code = c; return this; }, json: function (o) { resolve(this.code); } }; api({ method: "POST", body: { act: "new", peer: H, room: { w: "earth" } }, query: {}, headers: { "content-type": "application/json", origin: "https://evil.example" }, socket: {} }, res); });
  ok(bo === 403, "other sites refused in production");
  console.log(bad ? bad + " of " + n + " checks failed" : "all " + n + " checks passed"); process.exit(bad ? 1 : 0);
})();
