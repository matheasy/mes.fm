// node tool_apps_src/ai-tests.js -- MES AI: pricing / payment rules (tool_apps_src/ai/lib.js) and mes.fm/api/ai.js
// end to end against a fake Redis, a fake Hive account history and fake Anthropic / OpenAI answers. No network.
const fs = require("fs");
const path = require("path");
const A = require("./ai/lib.js");
const { makeHandler } = require("../mes.fm/api/ai.js");

let n = 0, f = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, "\n  got ", JSON.stringify(a), "\n  want", JSON.stringify(b)); } }
function ok(c, m) { eq(!!c, true, m); }

/* ---------- the copy for the server must be identical ---------- */
eq(fs.readFileSync(path.join(__dirname, "ai/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_ai-lib.js"), "utf8"), true,
  "mes.fm/api/_ai-lib.js is a byte copy of tool_apps_src/ai/lib.js (cp it)");

/* ---------- prices ---------- */
eq(A.MARGIN, 1.5, "margin");
eq(A.hbdFromUsd(0), 0.001, "minimum 0.001 HBD");
eq(A.hbdFromUsd(0.0000001), 0.001, "tiny cost -> minimum");
eq(A.hbdFromUsd(0.032), 0.048, "0.032 x 1.5 = 0.048 exactly, not rounded up to 0.049");
eq(A.hbdFromUsd(0.0321), 0.049, "rounds UP to 0.001");
eq(A.fmtHbd(0.048), "0.048", "format");
// Sonnet, 1,000 input tokens, medium (5,000): (1000*2 + 5000*10)/1e6 = 0.052 USD -> x1.5 = 0.078
let q = A.chatQuote("sonnet", 1000, "medium");
eq([q.maxOut, q.price, q.modelId], [5000, "0.078", "claude-sonnet-5-5"], "sonnet medium quote");
// Opus long 30,000 out: (2000*4 + 30000*20)/1e6 = 0.608 -> 0.912
q = A.chatQuote("opus", 2000, "long");
eq([q.maxOut, q.price], [30000, "0.912"], "opus long quote");
ok(A.chatQuote("sonnet", 10, "short").hbd >= A.chatQuote("sonnet", 10, "short").costUsd * 1.5 - 1e-12, "price >= cost x margin");
// the quote is never below cost x margin, over many sizes
let bad = 0;
for (const k of Object.keys(A.MODELS)) for (const len of Object.keys(A.LENGTHS)) for (let t = 0; t < 200000; t += 997) {
  const x = A.chatQuote(k, t, len);
  if (x.hbd + 1e-9 < x.costUsd * A.MARGIN / A.HBD_USD) bad++;
  if (Math.round(x.hbd * 1000) !== x.hbd * 1000 && Math.abs(Math.round(x.hbd * 1000) - x.hbd * 1000) > 1e-6) bad++;
}
eq(bad, 0, "every chat quote covers cost x margin and is a whole 0.001 HBD");
eq(A.imageQuote("medium", "1024x1024", 40).price, A.fmtHbd(A.hbdFromUsd(0.053 + 40 * 5 / 1e6)), "image quote");
eq(A.imageQuote("low", "1536x1024", 0).price, "0.008", "low landscape 0.005 x 1.5 = 0.0075 -> 0.008");
let threw = false; try { A.chatQuote("gpt9", 1, "short"); } catch (e) { threw = true; } eq(threw, true, "unknown model throws");
threw = false; try { A.chatQuote("sonnet", 1, "huge"); } catch (e) { threw = true; } eq(threw, true, "unknown length throws");
ok(A.estimateChatTokens([{ role: "user", content: "hello there" }]) > A.estimateTokens(A.SYSTEM), "estimate includes the system prompt");

/* ---------- ids, memos, names ---------- */
const id = A.newId((k) => Buffer.from("0123456789abcdef".slice(0, k)));
eq(id.length, 16, "id is 16 hex");
ok(A.validId(id), "valid id");
ok(!A.validId("xyz"), "bad id");
eq(A.memoFor("00112233aabbccdd"), "mesai:00112233aabbccdd", "memo");
eq(A.idFromMemo(" mesai:00112233aabbccdd "), "00112233aabbccdd", "id from memo");
eq(A.idFromMemo("mesai:00112233aabbccd"), null, "short id in memo");
ok(A.validName("mes") && A.validName("mes-truth") && !A.validName("Mes") && !A.validName("ab"), "names");

/* ---------- message checks ---------- */
eq(A.checkMessages([]), "Write a message first.", "empty chat");
eq(A.checkMessages([{ role: "user", content: "hi" }]), null, "one message ok");
eq(A.checkMessages([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]), "The last message must be yours.", "last must be user");
eq(A.checkMessages([{ role: "user", content: "a" }, { role: "user", content: "b" }]), "Messages must take turns (you, then the AI).", "turns");
ok(A.checkMessages([{ role: "user", content: "x".repeat(60001) }]), "message too long");
ok(A.checkMessages([{ role: "system", content: "x" }]), "no system role from the page");
eq(A.checkImage("a cat", "medium", "1024x1024"), null, "image ok");
ok(A.checkImage("a cat", "ultra", "1024x1024"), "bad quality");
ok(A.checkImage("a cat", "low", "2048x2048"), "bad size");

/* ---------- finding the payment ---------- */
const T0 = Date.parse("2026-11-18T10:00:00Z");
function tr(i, from, to, amount, memo, secs, trx) { return [i, { trx_id: trx || "t" + i, timestamp: new Date(T0 + secs * 1000).toISOString().slice(0, 19), op: ["transfer", { from, to, amount, memo }] }]; }
const memo = "mesai:00112233aabbccdd";
const hist = [
  tr(1, "alice", "mes", "0.078 HBD", "mesai:ffffffffffffffff", 10),
  tr(2, "alice", "bob", "0.078 HBD", memo, 20),
  tr(3, "alice", "mes", "0.078 HIVE", memo, 30),
  tr(4, "alice", "mes", "0.077 HBD", memo, 40),
];
eq(A.findPayment(hist, { from: "alice", memo, price: "0.078", since: T0 }), null, "no matching transfer (other memo / other receiver / HIVE / too little)");
hist.push(tr(5, "alice", "mes", "0.078 HBD", memo, 50, "abc"));
eq(A.findPayment(hist, { from: "alice", memo, price: "0.078", since: T0 }), { trx: "abc", at: new Date(T0 + 50000).toISOString(), amount: "0.078" }, "found");
eq(A.findPayment(hist, { from: "alice", memo, price: "0.078", since: T0 + 60000 }), null, "older than the quote does not count");
eq(A.findPayment([[9, { timestamp: "2026-11-18T10:01:00", op: ["transfer", { from: "alice", to: "mes", amount: { amount: "100", precision: 3, nai: "@@000000013" }, memo }] }]],
  { from: "alice", memo, price: 0.078, since: T0 }) !== null, true, "object amount (nai) is read, overpaying is fine");

/* ---------- stream parsing ---------- */
let s = A.sseSplit('event: message_start\ndata: {"type":"message_start"}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\nevent: con');
eq([s.events.length, s.rest], [2, "event: con"], "split keeps the unfinished event");
eq(A.streamPiece(s.events[1]), { t: "text", v: "Hi" }, "text delta");
eq(A.streamPiece({ event: "content_block_start", data: { type: "content_block_start", content_block: { type: "thinking" } } }), { t: "think" }, "thinking start");
eq(A.streamPiece({ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } } }), { t: "stop", stop: "end_turn", usage: { output_tokens: 9 } }, "stop");
eq(A.streamPiece({ event: "error", data: { type: "error", error: { message: "Overloaded" } } }), { t: "error", msg: "Overloaded" }, "error event");

/* ---------- video prices ---------- */
eq(A.videoQuote("best", 10, "720p").price, A.fmtHbd(A.hbdFromUsd(0.08 * 10 * A.VIDEO.RES_X["720p"])), "video: per second x length x resolution guess");
eq(A.videoQuote("lite", 5, "480p").price, "0.150", "lite 5 s 480p = 0.10 USD -> 0.150 HBD");
threw = false; try { A.videoQuote("std", 8, "1080p"); } catch (e) { threw = true; } eq(threw, true, "standard stops at 720p");
threw = false; try { A.videoQuote("best", 7, "480p"); } catch (e) { threw = true; } eq(threw, true, "only the offered lengths");
ok(A.checkVideo("", "best", 8, "720p"), "video needs a description");
eq(A.checkVideo("a cat surfing", "best", 8, "1080p"), null, "video ok");
ok(A.okVideoUrl("https://vidgen.x.ai/abc/video.mp4") && !A.okVideoUrl("http://x/y") && !A.okVideoUrl("file:///etc"), "only https video links are passed on");

/* ---------- saving chats ---------- */
const c1 = { id: "a", title: "One", at: 10, msgs: [{ role: "user", content: "hi", price: "0.010" }, { role: "assistant", content: "hello" }, { role: "assistant", content: "", pending: true }] };
const bk = A.backup([c1, { id: "e", title: "empty", at: 1, msgs: [] }], T0);
eq([bk.app, bk.v, bk.chats.length, bk.chats[0].msgs.length, bk.chats[0].msgs[0].price], ["mes-ai", 1, 1, 2, "0.010"], "backup drops empty chats and unfinished answers");
eq(A.readBackup(JSON.stringify(bk))[0].title, "One", "read a backup back");
threw = false; try { A.readBackup('{"chats":[]}'); } catch (e) { threw = true; } eq(threw, true, "not a MES AI backup");
let mg = A.mergeChats([A.cleanChat(c1)], [{ id: "a", title: "One", at: 20, msgs: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "user", content: "more" }, { role: "assistant", content: "sure" }] }, { id: "b", title: "Two", at: 5, msgs: [{ role: "user", content: "x" }] }]);
eq([mg.chats.length, mg.added, mg.updated, mg.chats[0].id, mg.chats[0].msgs.length], [2, 1, 1, "a", 4], "merge: longer copy wins, new chat added, newest first");
mg = A.mergeChats(mg.chats, [{ id: "a", title: "One", at: 99, msgs: [{ role: "user", content: "hi" }] }]);
eq([mg.updated, mg.chats[0].msgs.length], [0, 4], "merge never drops messages");
ok(A.chatMarkdown(A.cleanChat(c1)).indexOf("## MES AI\n\nhello") > 0, "markdown export");

/* ---------- the server, end to end ---------- */
function fakeRedis() {
  const st = new Map();
  const fn = async (cmds) => cmds.map((c) => {
    const [op, k, v] = c;
    switch (op) {
      case "SET": if (c.includes("NX") && st.has(k)) return null; st.set(k, v); return "OK";
      case "GET": return st.has(k) ? st.get(k) : null;
      case "MGET": return c.slice(1).map((x) => st.has(x) ? st.get(x) : null);
      case "GETDEL": { const x = st.has(k) ? st.get(k) : null; st.delete(k); return x; }
      case "EXISTS": return st.has(k) ? 1 : 0;
      case "DEL": return st.delete(k) ? 1 : 0;
      case "INCR": { const x = (Number(st.get(k)) || 0) + 1; st.set(k, String(x)); return x; }
      case "EXPIRE": return 1;
      default: throw new Error("fake redis " + op);
    }
  });
  fn.st = st;
  return fn;
}
function sse(events) { return events.map((e) => "event: " + e.type + "\ndata: " + JSON.stringify(e) + "\n\n").join(""); }
function streamBody(text) { // a few chunks, split mid-event on purpose
  const chunks = [text.slice(0, 37), text.slice(37, 90), text.slice(90)];
  return { getReader() { let i = 0; return { read: async () => i < chunks.length ? { done: false, value: new TextEncoder().encode(chunks[i++]) } : { done: true } }; } };
}
const ANSWER = sse([
  { type: "message_start", message: {} },
  { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
  { type: "content_block_start", index: 1, content_block: { type: "text" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello " } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hive!" } },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } },
  { type: "message_stop" },
]);
function setup(opts) {
  const o = Object.assign({ chat: true, image: true }, opts);
  const redis = fakeRedis();
  const env = { UPSTASH_REDIS_REST_TOKEN: "x" };
  if (o.chat) env.ANTHROPIC_API_KEY = "sk-test";
  if (o.image) env.OPENAI_API_KEY = "sk-img";
  const calls = [];
  let chain = [];
  let modelMode = "ok";
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
    if (/count_tokens/.test(url)) return { ok: true, status: 200, json: async () => ({ input_tokens: 1000 }) };
    if (/api\.anthropic\.com\/v1\/messages$/.test(url)) {
      if (modelMode === "down") return { ok: false, status: 529, json: async () => ({ error: { message: "Overloaded" } }) };
      if (modelMode === "midway") return { ok: true, status: 200, body: streamBody(sse([{ type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } }, { type: "error", error: { message: "Overloaded" } }])) };
      return { ok: true, status: 200, body: streamBody(ANSWER) };
    }
    if (/images\/generations/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: "UklGRg==" }] }) };
    throw new Error("unexpected fetch " + url);
  };
  let now = T0;
  const h = makeHandler({ env, redis, fetch: fetchImpl, now: () => now, rpc: async (m, p) => { calls.push({ rpc: m, p }); return chain; } });
  return { h, redis, calls, setChain: (c) => { chain = c; }, setModel: (m) => { modelMode = m; }, tick: (ms) => { now += ms; }, env };
}
function mk(method, body, query) {
  const res = { statusCode: 200, headers: {}, out: "", headersSent: false, setHeader(k, v) { this.headers[k] = v; }, write(x) { this.headersSent = true; this.out += x; }, end(x) { if (x) this.out += x; this.ended = true; } };
  return { req: { method, body, query: query || {}, headers: { "x-forwarded-for": "10.1.1.1", origin: "https://mes.fm" } }, res };
}
const J = (res) => JSON.parse(res.out);
const lines = (res) => res.out.trim().split("\n").map((l) => JSON.parse(l));

(async () => {
  // status
  let e = setup({ chat: false, image: false });
  let r = mk("GET", null, { op: "status" });
  await e.h(r.req, r.res);
  eq([J(r.res).chat, J(r.res).image, J(r.res).margin], [false, false, 1.5], "status: off without keys");
  r = mk("POST", { op: "quote", acct: "alice", kind: "chat", model: "sonnet", len: "medium", messages: [{ role: "user", content: "Hi" }] });
  await e.h(r.req, r.res);
  eq([r.res.statusCode, J(r.res).off], [503, true], "quote without a key: not switched on yet");

  e = setup();
  r = mk("POST", { op: "quote", acct: "Alice!", kind: "chat", model: "sonnet", len: "medium", messages: [{ role: "user", content: "Hi" }] });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 400, "quote needs a valid Hive name");

  // quote
  r = mk("POST", { op: "quote", acct: "@Alice", kind: "chat", model: "sonnet", len: "medium", messages: [{ role: "user", content: "Hi" }] });
  await e.h(r.req, r.res);
  const qa = J(r.res);
  eq([r.res.statusCode, qa.price, qa.inTokens, qa.maxOut, qa.to], [200, "0.078", 1000, 5000, "mes"], "quote from counted tokens");
  ok(A.validId(qa.id) && qa.memo === "mesai:" + qa.id, "quote id + memo");
  const ct = e.calls.find((c) => /count_tokens/.test(c.url));
  eq([ct.body.model, ct.body.system === A.SYSTEM, ct.headers["x-api-key"]], ["claude-sonnet-5-5", true, "sk-test"], "count_tokens request");

  // run before paying -> 402 pending
  r = mk("POST", { op: "run", id: qa.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq([r.res.statusCode, J(r.res).pending], [402, true], "not paid yet");
  // run as another account
  r = mk("POST", { op: "run", id: qa.id, acct: "bob" });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 403, "another account cannot use the id");
  // underpaid
  e.setChain([tr(7, "alice", "mes", "0.077 HBD", qa.memo, 5)]);
  r = mk("POST", { op: "run", id: qa.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 402, "underpaid does not count");
  // paid -> streamed answer
  e.setChain([tr(8, "alice", "mes", "0.078 HBD", qa.memo, 5, "trx8")]);
  r = mk("POST", { op: "run", id: qa.id, acct: "alice" });
  await e.h(r.req, r.res);
  let ls = lines(r.res);
  eq(ls, [{ t: "think" }, { t: "text", v: "Hello " }, { t: "text", v: "Hive!" }, { t: "done", stop: "end_turn", out: 3 }], "paid -> streamed answer");
  const mc = e.calls.find((c) => /v1\/messages$/.test(c.url || ""));
  eq([mc.body.model, mc.body.max_tokens, mc.body.stream, mc.body.output_config.effort, mc.body.fallbacks[0].model, mc.headers["anthropic-beta"]],
    ["claude-sonnet-5-5", 5000, true, "low", "claude-sonnet-5", "server-side-fallback-2026-07-01"], "model call capped at what was paid for, same-price fallback");
  ok(!("thinking" in mc.body) && !("temperature" in mc.body), "no thinking / sampling params");
  ok(/^[0-9a-f]{32}$/.test(mc.body.metadata.user_id) && mc.body.metadata.user_id.indexOf("alice") < 0, "user id is a hash, not the name");
  // reuse
  r = mk("POST", { op: "run", id: qa.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 409, "one payment = one answer");

  // model down after payment -> free retry once
  r = mk("POST", { op: "quote", acct: "alice", kind: "chat", model: "opus", len: "short", messages: [{ role: "user", content: "Hard one" }] });
  await e.h(r.req, r.res);
  const qb = J(r.res);
  eq(qb.price, A.chatQuote("opus", 1000, "short").price, "opus quote");
  e.setChain([tr(9, "alice", "mes", qb.price + " HBD", qb.memo, 5)]);
  e.setModel("down");
  r = mk("POST", { op: "run", id: qb.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq([r.res.statusCode, J(r.res).retry], [502, true], "model down -> retry offered");
  e.setModel("midway");
  r = mk("POST", { op: "run", id: qb.id, acct: "alice" });
  await e.h(r.req, r.res);
  ls = lines(r.res);
  eq([ls[0], ls[ls.length - 1].t, ls[ls.length - 1].retry], [{ t: "text", v: "Hel" }, "error", false], "retry used; broken again -> no further retry");
  const oc = e.calls.filter((c) => /v1\/messages$/.test(c.url || "")).pop();
  eq([oc.body.model, oc.body.max_tokens, oc.body.output_config.effort, "fallbacks" in oc.body, oc.headers["anthropic-beta"]], ["claude-opus-5-5", 3000, "medium", false, undefined], "opus call: no fallback (would cost more)");
  r = mk("POST", { op: "run", id: qb.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 409, "after the retry the id is spent");

  // quote ran out
  r = mk("POST", { op: "run", id: "0000000000000000", acct: "alice" });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 404, "unknown / expired quote");

  // images
  r = mk("POST", { op: "quote", acct: "alice", kind: "image", prompt: "A red fox in snow", quality: "medium", size: "1024x1536" });
  await e.h(r.req, r.res);
  const qi = J(r.res);
  eq([qi.kind, qi.price], ["image", A.imageQuote("medium", "1024x1536", Math.ceil(17 / 2) + 8).price], "image quote");
  e.setChain([tr(10, "alice", "mes", qi.price + " HBD", qi.memo, 5)]);
  r = mk("POST", { op: "run", id: qi.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq([J(r.res).t, J(r.res).b64, J(r.res).mime], ["image", "UklGRg==", "image/webp"], "image answer");
  const ic = e.calls.find((c) => /images\/generations/.test(c.url || ""));
  eq([ic.body.model, ic.body.size, ic.body.quality, ic.body.n, ic.headers.Authorization], ["gpt-image-2", "1024x1536", "medium", 1, "Bearer sk-img"], "image request");

  // limits: 61st answer of an account in an hour is refused but keeps a retry
  e = setup();
  let last;
  for (let i = 0; i < 61; i++) {
    r = mk("POST", { op: "quote", acct: "carol", kind: "chat", model: "sonnet", len: "short", messages: [{ role: "user", content: "q" + i }] });
    await e.h(r.req, r.res);
    const qq = J(r.res);
    e.setChain([tr(100 + i, "carol", "mes", qq.price + " HBD", qq.memo, 5)]);
    r = mk("POST", { op: "run", id: qq.id, acct: "carol" });
    await e.h(r.req, r.res);
    last = { r, qq };
  }
  eq([last.r.res.statusCode, J(last.r.res).retry], [429, true], "61st answer this hour refused, payment kept for a retry");
  e.tick(3600e3);
  r = mk("POST", { op: "run", id: last.qq.id, acct: "carol" });
  await e.h(r.req, r.res);
  eq(lines(r.res).pop().t, "done", "retry next hour answers");

  // video: quote, pay, start the job, follow it, pass the file on; a failed job gives one free retry
  {
    const redis = fakeRedis(), calls = [];
    let vstate = "pending", chainV = [];
    const env = { XAI_API_KEY: "xai-test", UPSTASH_REDIS_REST_TOKEN: "x" };
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
      if (/videos\/generations$/.test(url)) return { ok: true, status: 200, json: async () => ({ request_id: "req-123" }) };
      if (/videos\/req-123$/.test(url)) return { ok: true, status: 200, json: async () => vstate === "done" ? { status: "done", video: { url: "https://vidgen.x.ai/out/v.mp4", duration: 8 } } : vstate === "failed" ? { status: "failed" } : { status: "pending" } };
      if (/vidgen\.x\.ai/.test(url)) return { ok: true, status: 200, headers: { get: () => "video/mp4" }, body: { getReader() { let d = false; return { read: async () => d ? { done: true } : (d = true, { done: false, value: new Uint8Array([1, 2, 3]) }) }; } } };
      throw new Error("unexpected " + url);
    };
    const hv = makeHandler({ env, redis, fetch: fetchImpl, now: () => T0, rpc: async () => chainV });
    r = mk("POST", { op: "quote", acct: "dan", kind: "chat", model: "sonnet", len: "short", messages: [{ role: "user", content: "hi" }] });
    await hv(r.req, r.res);
    eq(r.res.statusCode, 503, "chat off when only the xAI key is set");
    r = mk("POST", { op: "quote", acct: "dan", kind: "video", prompt: "A fox runs in snow", model: "best", seconds: 8, res: "720p", audio: true });
    await hv(r.req, r.res);
    const qv = J(r.res);
    eq([r.res.statusCode, qv.kind, qv.price], [200, "video", A.videoQuote("best", 8, "720p").price], "video quote");
    chainV = [tr(1, "dan", "mes", qv.price + " HBD", qv.memo, 5)];
    r = mk("POST", { op: "run", id: qv.id, acct: "dan" });
    await hv(r.req, r.res);
    eq(J(r.res), { t: "video", job: qv.id }, "paid -> video job started");
    const vc = calls.find((c) => /generations$/.test(c.url));
    eq([vc.body.model, vc.body.duration, vc.body.resolution, vc.body.generate_audio, vc.headers.Authorization], ["grok-imagine-video-1.5", 8, "720p", true, "Bearer xai-test"], "xAI request");
    r = mk("POST", { op: "vstatus", id: qv.id, acct: "dan" }); await hv(r.req, r.res);
    eq(J(r.res).status, "pending", "still making it");
    r = mk("POST", { op: "vstatus", id: qv.id, acct: "eve" }); await hv(r.req, r.res);
    eq(r.res.statusCode, 403, "another account can't follow the job");
    vstate = "done";
    r = mk("POST", { op: "vstatus", id: qv.id, acct: "dan" }); await hv(r.req, r.res);
    eq(J(r.res), { status: "done", duration: 8 }, "done");
    r = mk("GET", null, { op: "vfile", id: qv.id, acct: "dan" }); await hv(r.req, r.res);
    eq([r.res.headers["Content-Type"], r.res.out.length > 0], ["video/mp4", true], "file passed on");
    r = mk("POST", { op: "quote", acct: "dan", kind: "video", prompt: "Another", model: "lite", seconds: 5, res: "480p" }); await hv(r.req, r.res);
    const qf = J(r.res);
    chainV = [tr(2, "dan", "mes", qf.price + " HBD", qf.memo, 5)];
    r = mk("POST", { op: "run", id: qf.id, acct: "dan" }); await hv(r.req, r.res);
    vstate = "failed";
    r = mk("POST", { op: "vstatus", id: qf.id, acct: "dan" }); await hv(r.req, r.res);
    eq([J(r.res).status, J(r.res).retry], ["failed", true], "failed job -> free retry");
    r = mk("POST", { op: "run", id: qf.id, acct: "dan" }); await hv(r.req, r.res);
    eq(J(r.res).t, "video", "the retry starts a new job");
    r = mk("POST", { op: "vstatus", id: qf.id, acct: "dan" }); await hv(r.req, r.res);
    eq(J(r.res).retry, false, "only one retry");
  }

  // ChatGPT text models, Grok Imagine pictures (OpenAI + xAI keys, mocked APIs)
  {
    const redis = fakeRedis(), calls = [];
    let chainG = [], countMode = "ok";
    const env = { OPENAI_API_KEY: "sk-oai", XAI_API_KEY: "xai-k", UPSTASH_REDIS_REST_TOKEN: "x" };
    const oaiStream = sse([
      { choices: [{ index: 0, delta: { role: "assistant", content: "" } }] },
      { choices: [{ index: 0, delta: { content: "Hi " } }] },
      { choices: [{ index: 0, delta: { content: "there" } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "length" }] },
      { choices: [], usage: { completion_tokens: 1200 } },
    ]) + "data: [DONE]\n\n";
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
      if (/responses\/input_tokens$/.test(url)) return countMode === "ok" ? { ok: true, status: 200, json: async () => ({ object: "response.input_tokens", input_tokens: 100 }) } : { ok: false, status: 500, json: async () => ({}) };
      if (/v1\/chat\/completions$/.test(url)) return { ok: true, status: 200, body: streamBody(oaiStream) };
      if (/api\.x\.ai\/v1\/images\/generations$/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: "/9j/4AAQ", mime_type: "image/jpeg" }], usage: { cost_in_usd_ticks: 1 } }) };
      throw new Error("unexpected " + url);
    };
    const hg = makeHandler({ env, redis, fetch: fetchImpl, now: () => T0, rpc: async () => chainG });
    r = mk("GET", null, { op: "status" }); await hg(r.req, r.res);
    eq([J(r.res).chat, J(r.res).image, J(r.res).prov], [true, true, { anthropic: false, openai: true, xai: true }], "status per company");
    r = mk("POST", { op: "quote", acct: "gus", kind: "chat", model: "sonnet", len: "short", messages: [{ role: "user", content: "hi" }] }); await hg(r.req, r.res);
    eq(r.res.statusCode, 503, "Claude off without the Anthropic key");
    const msgs = [{ role: "user", content: "Say hi" }];
    r = mk("POST", { op: "quote", acct: "gus", kind: "chat", model: "gpt", len: "short", messages: msgs }); await hg(r.req, r.res);
    const qg = J(r.res);
    const want = Math.ceil(100 * 1.05) + 8 + 4;
    eq([r.res.statusCode, qg.inTokens, qg.price], [200, want, A.chatQuote("gpt", want, "short").price], "GPT quote from OpenAI's token count");
    const cc = calls.find((c) => /input_tokens/.test(c.url));
    eq([cc.body.model, cc.body.instructions, cc.headers.Authorization], ["gpt-6.2-sol", A.systemFor("gpt"), "Bearer sk-oai"], "token count request");
    chainG = [tr(1, "gus", "mes", qg.price + " HBD", qg.memo, 5)];
    r = mk("POST", { op: "run", id: qg.id, acct: "gus" }); await hg(r.req, r.res);
    const lg = lines(r.res);
    eq(lg, [{ t: "text", v: "Hi " }, { t: "text", v: "there" }, { t: "done", stop: "max_tokens", out: 1200 }], "GPT answer streamed, length -> max_tokens");
    const gc = calls.find((c) => /chat\/completions/.test(c.url));
    eq([gc.body.model, gc.body.max_completion_tokens, gc.body.reasoning_effort, gc.body.stream, gc.body.messages[0].role, /OpenAI's GPT/.test(gc.body.messages[0].content), gc.body.messages[1].content],
      ["gpt-6.2-sol", 1200, "low", true, "system", true, "Say hi"], "chat completions request");
    countMode = "down";
    const long = [{ role: "user", content: "x".repeat(900) }];
    r = mk("POST", { op: "quote", acct: "gus", kind: "chat", model: "gptpro", len: "medium", messages: long }); await hg(r.req, r.res);
    eq(J(r.res).inTokens, A.safeTokens(A.systemFor("gptpro"), long), "count down -> safe (high) count");
    ok(A.safeTokens(A.systemFor("gptpro"), long) > 900, "safe count is at least one token a character");
    // Grok Imagine picture
    r = mk("POST", { op: "quote", acct: "gus", kind: "image", model: "grok2", prompt: "A fox", quality: "2k", size: "1536x1024" }); await hg(r.req, r.res);
    const qx = J(r.res);
    eq([r.res.statusCode, qx.price], [200, A.imageQuote("2k", "1536x1024", 0, "grok2").price], "Grok picture quote");
    r = mk("POST", { op: "quote", acct: "gus", kind: "image", model: "grok", prompt: "A fox", quality: "medium", size: "1024x1024" }); await hg(r.req, r.res);
    eq(r.res.statusCode, 400, "Grok takes 1k / 2k, not GPT qualities");
    chainG = [tr(2, "gus", "mes", qx.price + " HBD", qx.memo, 5)];
    r = mk("POST", { op: "run", id: qx.id, acct: "gus" }); await hg(r.req, r.res);
    eq(J(r.res), { t: "image", b64: "/9j/4AAQ", mime: "image/jpeg" }, "Grok picture answer");
    const xc = calls.find((c) => /x\.ai\/v1\/images/.test(c.url));
    eq([xc.body.model, xc.body.aspect_ratio, xc.body.resolution, xc.body.response_format, xc.body.n, xc.headers.Authorization], ["grok-imagine-image-2.0", "3:2", "2k", "b64_json", 1, "Bearer xai-k"], "xAI picture request");
  }
  // lib: the new tables
  eq(A.imageQuote("1k", "1024x1024", 0, "grok").price, "0.030", "Grok 0.02 x 1.5");
  eq(A.imageQuote("2k", "1024x1536", 0, "grok2").price, "0.090", "Grok 2.0 2k: 0.04 x 1.5 (2k guess) x 1.5");
  eq(A.imageQuote("medium", "1024x1024", 40).price, A.imageQuote("medium", "1024x1024", 40, "gpt").price, "GPT picture is the default");
  eq([A.checkImage("a", "2k", "1024x1024", "grok"), A.checkImage("a", "4k", "1024x1024", "grok"), A.checkImage("a", "1k", "1024x1024", "dalle")], [null, "Unknown quality.", "Unknown picture model."], "checkImage per model");
  eq(A.streamPieceOpenAI({ data: null }), null, "[DONE] ignored");
  eq(A.streamPieceOpenAI({ data: { error: { message: "bad" } } }), { t: "error", msg: "bad" }, "OpenAI stream error");
  eq(A.streamPieceOpenAI({ data: { choices: [{ delta: {}, finish_reason: "content_filter" }] } }).stop, "refusal", "content_filter -> refusal");
  ok(A.systemFor("sonnet") === A.SYSTEM && /OpenAI/.test(A.systemFor("gpt")), "system prompt names the right company");
  Object.keys(A.MODELS).forEach((k) => ok(A.PROVIDERS[A.MODELS[k].prov], "model " + k + " has a known company"));
  Object.keys(A.IMAGES).forEach((k) => ok(A.PROVIDERS[A.IMAGES[k].prov], "picture model " + k + " has a known company"));

  // files: pictures and PDFs with a message
  const PIC = { t: "img", mt: "image/jpeg", name: "cat.jpg", data: "/9j/" + "A".repeat(40) };
  const PDF = { t: "pdf", mt: "application/pdf", name: "notes.pdf", pages: 3, data: "JVBERi0x" + "B".repeat(40) };
  eq(A.checkMessages([{ role: "user", content: "", files: [PIC] }]), null, "a message can be just a picture");
  eq(A.checkMessages([{ role: "user", content: "x", files: [{ t: "img", mt: "image/svg+xml", data: "PHN2Zz4AAAA" }] }]), "Pictures must be JPEG, PNG, WebP or GIF.", "no SVG");
  ok(A.checkMessages([{ role: "user", content: "x", files: [{ t: "exe", mt: "x", data: "AAAAAAAA" }] }]), "only pictures and PDFs");
  ok(A.checkMessages([{ role: "user", content: "x", files: [{ t: "img", mt: "image/png", data: "not base64!" }] }]), "data must be base64");
  ok(A.checkMessages([{ role: "assistant", content: "x", files: [PIC] }]), "files only on your own messages");
  ok(/too big/.test(A.checkMessages([{ role: "user", content: "x", files: [{ t: "pdf", mt: "application/pdf", data: "A".repeat(A.FILES.total + 4) }] }])), "total size cap");
  const fm = A.cleanMessages([{ role: "user", content: "What is this?", files: [PIC, PDF] }, { role: "assistant", content: "A cat." }]);
  const an = A.toAnthropic(fm);
  eq([an[0].content.length, an[0].content[0].type, an[0].content[1].type, an[0].content[2].text, an[1].content], [3, "image", "document", "What is this?", "A cat."], "Anthropic blocks: files then text");
  const oc2 = A.toOpenAIChat(fm);
  ok(oc2[0].content[0].image_url.url.indexOf("data:image/jpeg;base64,/9j/") === 0 && oc2[0].content[1].file.filename === "notes.pdf", "OpenAI chat parts");
  eq(A.toOpenAIResponses(fm)[0].content.map((x) => x.type), ["input_image", "input_file", "input_text"], "OpenAI responses parts");
  ok(A.estimateChatTokens(fm) > A.estimateChatTokens([{ role: "user", content: "What is this?" }]) + 1600 + 3 * 2500 - 1, "estimate counts files");
  e = setup();
  const big = { t: "pdf", mt: "application/pdf", name: "big.pdf", pages: 40, data: "JVBERi0x" + "C".repeat(1600000) };
  r = mk("POST", { op: "quote", acct: "alice", kind: "chat", model: "sonnet", len: "short", messages: [{ role: "user", content: "Summarize", files: [big, PIC] }] });
  await e.h(r.req, r.res);
  const qf = J(r.res);
  eq(r.res.statusCode, 200, "quote with a 1.2 MB PDF");
  const ctf = e.calls.find((c) => /count_tokens/.test(c.url));
  eq(ctf.body.messages[0].content.map((x) => x.type), ["document", "image", "text"], "count_tokens sees the files");
  ok(JSON.parse(e.redis.st.get("ai:q:" + qf.id)).parts >= 3, "big quote stored in pieces");
  e.setChain([tr(9, "alice", "mes", qf.price + " HBD", qf.memo, 5, "trx9")]);
  r = mk("POST", { op: "run", id: qf.id, acct: "alice" });
  await e.h(r.req, r.res);
  const mf = e.calls.filter((c) => /api\.anthropic\.com\/v1\/messages$/.test(c.url)).pop();
  ok(mf && mf.body.messages[0].content[0].source.data === big.data && lines(r.res).some((x) => x.t === "done"), "answer gets the whole PDF back from the pieces");

  // origin check in production
  e = setup();
  e.env.VERCEL_ENV = "production";
  r = mk("POST", { op: "quote" });
  r.req.headers.origin = "https://evil.example";
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 403, "other sites cannot call it");

  console.log(f ? f + " of " + n + " checks FAILED" : "all " + n + " checks passed");
  process.exit(f ? 1 : 0);
})();
