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

/* ---------- free models on this device (WebLLM, prov "local") ---------- */
const LOCALS = Object.keys(A.MODELS).filter((k) => A.isLocal(k));
eq(LOCALS, ["local1b", "localqwen", "local3b"], "three local models, smallest first");
LOCALS.forEach((k) => {
  const m = A.MODELS[k];
  ok(/-q4f16_1-MLC$/.test(m.id) && m.id32 === m.id.replace("q4f16_1", "q4f32_1"), k + ": WebLLM prebuilt ids (f16 + f32 build)");
  ok(m.text && !m.free && m.inUsd === 0 && m.outUsd === 0, k + ": text only, not a free-message model, no price");
  ok(m.mb > 500 && m.vram > 0 && m.vram32 > m.vram, k + ": download size + memory");
  ok(Object.keys(A.LENGTHS).every((l) => m.caps[l] > 0 && m.caps[l] < A.LOCAL.ctx / 2), k + ": answers fit the small memory");
  ok(A.systemFor(k).length < 400 && A.systemFor(k).indexOf(m.name) > 0, k + ": short system prompt naming the model");
});
ok(LOCALS.every((k, i) => i === 0 || A.MODELS[k].mb > A.MODELS[LOCALS[i - 1]].mb), "sizes grow");
ok(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@mlc-ai\/web-llm@\d+\.\d+\.\d+\/lib\/index\.js$/.test(A.LOCAL.url) && A.LOCAL.url.indexOf(A.LOCAL.ver) > 0, "WebLLM pinned to an exact version");
eq(A.localCheck("local1b", {}).why, "nogpu", "no WebGPU");
eq(A.localCheck("local1b", { gpu: true }).why, "noadapter", "WebGPU but no adapter");
eq(A.localCheck("local1b", { gpu: true, adapter: true, f16: true, maxBuf: 64 * 1048576 }).why, "small", "tiny GPU buffer");
let lc = A.localCheck("local1b", { gpu: true, adapter: true, f16: true, mem: 8 });
eq([lc.ok, lc.id, lc.f32], [true, "Llama-3.2-1B-Instruct-q4f16_1-MLC", false], "f16 build when shader-f16 exists");
lc = A.localCheck("localqwen", { gpu: true, adapter: true, f16: false, mem: null });
eq([lc.ok, lc.id, lc.f32], [true, "Qwen3-1.7B-q4f32_1-MLC", true], "f32 build without shader-f16; unknown memory is not a no");
eq(A.localCheck("local3b", { gpu: true, adapter: true, f16: true, mem: 4 }).why, "lowmem", "3B needs more than a 4 GB device");
eq(A.localCheck("local1b", { gpu: true, adapter: true, f16: true, mem: 2 }).ok, true, "1B runs on a 2 GB device");
eq(A.localCheck("sonnet", { gpu: true, adapter: true }).ok, false, "not a local model");
ok(Object.keys(A.LOCAL_WHY).length === 4, "every reason has a text");
const longMsgs = []; for (let i = 0; i < 40; i++) longMsgs.push({ role: i % 2 ? "assistant" : "user", content: "word ".repeat(300) });
longMsgs.push({ role: "user", content: "last question" });
const ltr = A.localTrim("sys", longMsgs, 900);
ok(ltr && ltr.messages[0].role === "user" && ltr.messages[ltr.messages.length - 1].content === "last question" && ltr.dropped > 0, "trim drops the oldest exchanges, keeps the last question");
ok(ltr.messages.reduce((t, m) => t + A.estimateTokens(m.content) + 4, 0) + A.estimateTokens("sys") + 900 <= A.LOCAL.ctx, "trimmed chat fits the model's memory");
eq(A.localTrim("sys", [{ role: "user", content: "hi" }], 400), { messages: [{ role: "user", content: "hi" }], dropped: 0 }, "short chat unchanged");
eq(A.localTrim("sys", [{ role: "user", content: "x".repeat(20000) }], 400), null, "one message too long -> null");
eq(A.splitThink("<think>let me see</think>\n\nHello"), { text: "Hello", think: false }, "finished thinking is hidden");
eq(A.splitThink("<think>still going"), { text: "", think: true }, "open thinking block");
eq(A.splitThink("Plain answer"), { text: "Plain answer", think: false }, "no thinking");

/* ---------- prices ---------- */
eq(A.MARGIN, 1.5, "margin");
eq(A.hbdFromUsd(0), 0.001, "minimum 0.001 HBD");
eq(A.hbdFromUsd(0.0000001), 0.001, "tiny cost -> minimum");
eq(A.hbdFromUsd(0.032), 0.048, "0.032 x 1.5 = 0.048 exactly, not rounded up to 0.049");
eq(A.hbdFromUsd(0.0321), 0.049, "rounds UP to 0.001");
eq(A.fmtHbd(0.048), "0.048", "format");
// Sonnet, 1,000 input tokens, medium (5,000): (1000*2 + 5000*10)/1e6 = 0.052 USD -> x1.5 = 0.078
let q = A.chatQuote("sonnet", 1000, "medium");
eq([q.maxOut, q.price, q.modelId], [5000, "0.088", "claude-sonnet-5-5"], "sonnet medium quote: 0.052 x 1.12 (tax) x 1.5 = 0.08736 -> 0.088");
// Opus long 30,000 out: (2000*4 + 30000*20)/1e6 = 0.608 -> 0.912
q = A.chatQuote("opus", 2000, "long");
eq([q.maxOut, q.price], [30000, "1.022"], "opus long quote: 0.608 x 1.12 x 1.5");
ok(A.chatQuote("sonnet", 10, "short").hbd >= A.chatQuote("sonnet", 10, "short").costUsd * 1.5 - 1e-12, "price >= cost x margin");
// the quote is never below cost x margin, over many sizes
let bad = 0;
for (const k of Object.keys(A.MODELS)) for (const len of Object.keys(A.LENGTHS)) for (let t = 0; t < 200000; t += 997) {
  const x = A.chatQuote(k, t, len);
  if (x.hbd + 1e-9 < x.costUsd * A.MARGIN / A.HBD_USD) bad++;
  if (Math.round(x.hbd * 1000) !== x.hbd * 1000 && Math.abs(Math.round(x.hbd * 1000) - x.hbd * 1000) > 1e-6) bad++;
}
eq(bad, 0, "every chat quote covers cost x margin and is a whole 0.001 HBD");
eq(A.imageQuote("medium", "1024x1024", 40).price, A.fmtHbd(A.hbdFromUsd(0.053 + 40 * 5 / 1e6, "openai")), "image quote");
eq(A.imageQuote("low", "1536x1024", 0).price, "0.009", "low landscape 0.005 x 1.12 x 1.5 = 0.0084 -> 0.009");
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
eq(A.videoQuote("best", 10, "720p").price, A.fmtHbd(A.hbdFromUsd(0.14 * 10, "xai")), "video: per-second rate of that resolution x length");
eq(A.videoQuote("lite", 10, "1080p").price, A.fmtHbd(A.hbdFromUsd(0.14 * 10, "xai")), "Grok Lite 1080p = $0.14/s (OpenRouter's published xAI rate), not a 480p guess x 2.25");
eq(A.videoQuote("lite", 5, "480p").price, "0.168", "lite 5 s 480p = 0.10 USD x 1.12 x 1.5 -> 0.168 HBD");
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
// cost hints: cost so far, rough next price (characters / 4), the typical-costs table, a 30-message session
const cs = A.chatCostSoFar({ msgs: [{ role: "user", content: "x".repeat(400), price: "0.010" }, { role: "assistant", content: "y".repeat(3600) }, { role: "user", content: "z".repeat(4000), price: "0.020" }, { role: "assistant", content: "", error: "boom" }] }, "sonnet", "medium");
eq([cs.price, cs.paid, cs.tokens, cs.next.price], ["0.030", 2, 2000, A.chatQuote("sonnet", 2000, "medium").price], "cost so far sums the paid prices; history = characters / 4");
eq(A.chatCostSoFar({ msgs: [] }, "sonnet", "medium").price, "0.000", "an empty chat cost nothing");
const tc = A.typicalCosts();
eq(tc.map((r) => r.model), ["sonnet", "opus"], "typical costs: Sonnet and Opus");
eq(tc[0].cells.map((c) => c.price), [5000, 25000, 50000].map((t) => A.chatQuote("sonnet", t, "medium").price), "typical costs = real quotes at 5k / 25k / 50k");
ok(Math.abs(tc[0].cells[0].hbd - 0.09) < 0.03 && Math.abs(tc[0].cells[2].hbd - 0.22) < 0.05 && Math.abs(tc[1].cells[2].hbd - 0.6) < 0.15, "typical costs are near the published numbers");
const ss = A.sessionCost("sonnet", "medium", 30, 50000);
ok(ss.hbd >= 3.5 && ss.hbd <= 5.5, "a 30-message Sonnet chat growing to 50k tokens is about 4 to 5 HBD (" + ss.price + ")");
// chat-list extras: pin, folder, mt survive a backup; old backups without them still read; newest mt wins the title / pin / folder in a merge
const c2 = { id: "p", title: "Pinned", at: 30, pin: true, folder: " Work <b> stuff ", mt: 40, msgs: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }] };
const bk2 = A.backup([c2], T0, ["Empty one", "Work b stuff"]);
eq([bk2.chats[0].pin, bk2.chats[0].folder, bk2.chats[0].mt, bk2.folders], [true, "Work b stuff", 40, ["Empty one", "Work b stuff"]], "backup keeps pin, folder, mt and folder names");
eq([A.readFolders(JSON.stringify(bk2)), A.readFolders(JSON.stringify(bk)), A.readFolders("not json")], [["Empty one", "Work b stuff"], [], []], "folder names read back (none in old backups)");
eq(A.cleanChat({ id: "x", title: "t", at: 1, pin: "yes", folder: 5, msgs: [] }).pin, undefined, "pin must be true");
mg = A.mergeChats([A.cleanChat(c2)], [{ id: "p", title: "Renamed", at: 30, mt: 50, msgs: c2.msgs }]);
eq([mg.updated, mg.chats[0].title, mg.chats[0].pin, mg.chats[0].folder], [1, "Renamed", undefined, undefined], "newer rename / unpin / unfile wins");
mg = A.mergeChats([A.cleanChat(c2)], [{ id: "p", title: "Old name", at: 31, mt: 10, msgs: c2.msgs.concat([{ role: "user", content: "more" }]) }]);
eq([mg.chats[0].msgs.length, mg.chats[0].title, mg.chats[0].pin, mg.chats[0].folder], [3, "Pinned", true, "Work b stuff"], "longer copy wins messages, newer copy keeps its name / pin / folder");
mg = A.mergeChats([A.cleanChat(c2)], [A.cleanChat(c2)]);
eq(mg.updated, 0, "the same chat twice: nothing changes");

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
      case "DECR": { const x = (Number(st.get(k)) || 0) - 1; st.set(k, String(x)); return x; }
      case "INCRBY": { const x = (Number(st.get(k)) || 0) + Number(v); st.set(k, String(x)); return x; }
      case "DECRBY": { const x = (Number(st.get(k)) || 0) - Number(v); st.set(k, String(x)); return x; }
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
    if (/images\/(generations|edits)/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: "UklGRg==" }] }) };
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
  r = mk("POST", { op: "quote", acct: "alice", kind: "chat", model: "local1b", len: "short", messages: [{ role: "user", content: "Hi" }] });
  await setup().h(r.req, r.res);
  eq(r.res.statusCode, 400, "a local model is never quoted or sent to a company");
  r = mk("GET", null, { op: "status" }); await setup().h(r.req, r.res);
  ok(J(r.res).models.every((x) => x.prov !== "local"), "status lists only server models");

  e = setup();
  r = mk("POST", { op: "quote", acct: "Alice!", kind: "chat", model: "sonnet", len: "medium", messages: [{ role: "user", content: "Hi" }] });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 400, "quote needs a valid Hive name");

  // quote
  r = mk("POST", { op: "quote", acct: "@Alice", kind: "chat", model: "sonnet", len: "medium", messages: [{ role: "user", content: "Hi" }] });
  await e.h(r.req, r.res);
  const qa = J(r.res);
  eq([r.res.statusCode, qa.price, qa.inTokens, qa.maxOut, qa.to], [200, "0.088", 1000, 5000, "mes"], "quote from counted tokens");
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
  e.setChain([tr(7, "alice", "mes", "0.087 HBD", qa.memo, 5)]);
  r = mk("POST", { op: "run", id: qa.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 402, "underpaid does not count");
  // paid -> streamed answer
  e.setChain([tr(8, "alice", "mes", "0.088 HBD", qa.memo, 5, "trx8")]);
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
    // a video from a picture: image {url: data URL} = the first frame; the description may be left out
    const VR = { mt: "image/jpeg", data: "/9j/" + "E".repeat(50) };
    r = mk("POST", { op: "quote", acct: "dan", kind: "video", prompt: "", model: "lite", seconds: 5, res: "480p", refs: [VR] }); await hv(r.req, r.res);
    const qp = J(r.res);
    eq([r.res.statusCode, qp.price], [200, A.videoQuote("lite", 5, "480p", 1).price], "picture-to-video quote");
    chainV = [tr(3, "dan", "mes", qp.price + " HBD", qp.memo, 5)];
    const nb = calls.length;
    r = mk("POST", { op: "run", id: qp.id, acct: "dan" }); await hv(r.req, r.res);
    const pv = calls.slice(nb).find((c) => /generations$/.test(c.url));
    eq([pv.body.image && pv.body.image.url.slice(0, 23), "prompt" in pv.body], ["data:image/jpeg;base64,", false], "first frame sent, empty prompt left out");
    r = mk("POST", { op: "quote", acct: "dan", kind: "video", prompt: "x", model: "lite", seconds: 5, res: "480p", refs: [VR, VR] }); await hv(r.req, r.res);
    eq(r.res.statusCode, 400, "one start picture at most");
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
      if (/api\.x\.ai\/v1\/images\/(generations|edits)$/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: "/9j/4AAQ", mime_type: "image/jpeg" }], usage: { cost_in_usd_ticks: 1 } }) };
      throw new Error("unexpected " + url);
    };
    const hg = makeHandler({ env, redis, fetch: fetchImpl, now: () => T0, rpc: async () => chainG });
    r = mk("GET", null, { op: "status" }); await hg(r.req, r.res);
    eq([J(r.res).chat, J(r.res).image, J(r.res).prov], [true, true, { anthropic: false, openai: true, xai: true, openrouter: false }], "status per company");
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
    const XR = { mt: "image/webp", data: "UklGR" + "D".repeat(40) };
    r = mk("POST", { op: "quote", acct: "gus", kind: "image", model: "grok2", prompt: "Swap picture 1 and picture 2", quality: "1k", size: "1024x1024", refs: [XR, XR] }); await hg(r.req, r.res);
    const qxe = J(r.res);
    eq([r.res.statusCode, qxe.price], [200, A.imageQuote("1k", "1024x1024", 0, "grok2", 2).price], "Grok edit quote");
    chainG = [tr(3, "gus", "mes", qxe.price + " HBD", qxe.memo, 5)];
    r = mk("POST", { op: "run", id: qxe.id, acct: "gus" }); await hg(r.req, r.res);
    const xe = calls.find((c) => /x\.ai\/v1\/images\/edits$/.test(c.url));
    eq([!!xe, xe && xe.body.images.length, xe && xe.body.images[0].url.slice(0, 23), xe && /<IMAGE_1>/.test(xe.body.prompt), xe && xe.body.image], [true, 2, "data:image/webp;base64,", true, undefined], "xAI edit with images[] and <IMAGE_n> names");
    r = mk("POST", { op: "quote", acct: "gus", kind: "image", model: "grok", prompt: "x", quality: "1k", size: "1024x1024", refs: [XR] }); await hg(r.req, r.res);
    eq(r.res.statusCode, 400, "cheapest Grok takes no pictures");
  }
  // lib: the new tables
  eq(A.imageQuote("1k", "1024x1024", 0, "grok").price, "0.034", "Grok 0.02 x 1.12 x 1.5");
  eq(A.imageQuote("2k", "1024x1536", 0, "grok2").price, "0.152", "Grok 2.0 2k: 0.06 (medium) x 1.5 (2k) x 1.12 x 1.5, above the published $0.08");
  eq(A.imageQuote("medium", "1024x1024", 40).price, A.imageQuote("medium", "1024x1024", 40, "gpt").price, "GPT picture is the default");
  eq([A.checkImage("a", "2k", "1024x1024", "grok"), A.checkImage("a", "4k", "1024x1024", "grok"), A.checkImage("a", "1k", "1024x1024", "dalle")], [null, "Unknown quality.", "Unknown picture model."], "checkImage per model");
  eq(A.streamPieceOpenAI({ data: null }), null, "[DONE] ignored");
  eq(A.streamPieceOpenAI({ data: { error: { message: "bad" } } }), { t: "error", msg: "bad" }, "OpenAI stream error");
  eq(A.streamPieceOpenAI({ data: { choices: [{ delta: {}, finish_reason: "content_filter" }] } }).stop, "refusal", "content_filter -> refusal");
  ok(A.systemFor("sonnet") === A.SYSTEM && /OpenAI/.test(A.systemFor("gpt")), "system prompt names the right company");
  ok(A.systemFor("sonnet", "en") === A.SYSTEM && A.systemFor("sonnet", "xx") === A.SYSTEM, "English / unknown language: plain system prompt");
  ok(/answer in Spanish by default/.test(A.systemFor("sonnet", "es")) && /OpenAI/.test(A.systemFor("gpt", "fa")) && /Persian/.test(A.systemFor("gpt", "fa")), "language pages ask for answers in their language");
  ok(A.cleanLang("pt-BR") === "pt-BR" && A.cleanLang("__proto__") === "en" && A.cleanLang(5) === "en", "language whitelist");
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

  /* ---------- reference pictures (2026-11-21): edits / combining, a video's first frame, chat -> picture ---------- */
  const R1 = { mt: "image/jpeg", data: "/9j/" + "B".repeat(60) }, R2 = { mt: "image/png", data: "iVBORw0KGgo" + "C".repeat(60) };
  eq([A.maxRefs("image", "gpt"), A.maxRefs("image", "grok"), A.maxRefs("image", "grok2"), A.maxRefs("video", "lite"), A.maxRefs("video", "nope")], [6, 0, 5, 1, 0], "picture limits per model");
  eq(A.checkRefs([R1, R2], 6), null, "two pictures ok");
  eq(A.checkRefs([R1], 0), "This model can't take pictures. Pick another model.", "no pictures on the cheapest Grok");
  eq(A.checkRefs([R1, R2], 1), "One picture at most with this model.", "video: one start picture");
  eq(A.checkRefs([{ mt: "image/gif", data: R1.data }], 6), "Pictures must be JPEG, PNG or WebP.", "gif refused");
  eq(A.checkRefs([{ mt: "image/png", data: "not base64!" }], 6), "Bad picture.", "bad base64 refused");
  eq(A.checkRefs("x", 6), "Bad picture.", "not a list");
  eq(A.checkRefs([{ mt: "image/png", data: "A".repeat(A.REFS.total + 4) }], 6), "The pictures are too big together. Use fewer or smaller pictures.", "total size cap");
  // prices: GPT adds REFS.gptTokens image tokens at $8 / 1M per picture; Grok adds one output price per picture; video adds REFS.videoUsd
  eq(A.imageQuote("medium", "1024x1024", 40, "gpt", 2).price, A.fmtHbd(A.hbdFromUsd(0.053 + 40 * 5 / 1e6 + 2 * A.REFS.gptTokens * 8 / 1e6, "openai")), "GPT edit with 2 pictures");
  eq(A.imageQuote("1k", "1024x1024", 0, "grok2", 3).price, A.fmtHbd(A.hbdFromUsd(0.06 * 4, "xai")), "Grok 2.0 edit with 3 pictures = 4 pictures' price");
  eq(A.videoQuote("lite", 5, "480p", 1).price, A.fmtHbd(A.hbdFromUsd(0.1 + A.REFS.videoUsd, "xai")), "video from a picture");
  ok(A.imageQuote("high", "1024x1536", 10, "gpt", 6).hbd > A.imageQuote("high", "1024x1536", 10, "gpt", 0).hbd, "more pictures cost more");
  eq(A.checkVideo("", "lite", 5, "480p", true), null, "a video from a picture may skip the description");
  eq(A.checkVideo("", "lite", 5, "480p", false), "Describe the video first.", "a text video needs one");
  eq(A.xaiPrompt("swap them", 2), "Input pictures: picture 1 = <IMAGE_0>, picture 2 = <IMAGE_1>. swap them", "xAI picture names");
  eq(A.xaiPrompt("make it blue", 1), "The input picture is <IMAGE_0> (picture 1). make it blue", "xAI one picture");
  eq(A.xaiPrompt("plain", 0), "plain", "no pictures: prompt unchanged");
  // chat messages that ask for pictures / videos
  eq(A.wantsMedia("Make a picture of a cat on the moon"), { kind: "image", prompt: "Make a picture of a cat on the moon" }, "make a picture");
  eq(A.wantsMedia("Can you generate an image of a sunset?"), { kind: "image", prompt: "generate an image of a sunset" }, "polite opening dropped");
  eq(A.wantsMedia("make a short video of a dog surfing").kind, "video", "video request");
  eq(A.wantsMedia("Draw me a dragon over a castle").kind, "image", "draw ...");
  ["What is a picture?", "Make a list of fruits", "draw a conclusion from this", "Explain how to draw a circle", "create a function that sorts", "How do I make an image smaller in CSS?", ""].forEach((t) => eq(A.wantsMedia(t), null, "not a picture request: " + t));
  // server: GPT edit -> /v1/images/edits with images [{image_url: data URL}]
  e = setup();
  r = mk("POST", { op: "quote", acct: "alice", kind: "image", prompt: "Put the person from picture 1 in front of picture 2", quality: "medium", size: "1024x1024", refs: [R1, R2] });
  await e.h(r.req, r.res);
  const qe = J(r.res);
  eq([r.res.statusCode, qe.price], [200, A.imageQuote("medium", "1024x1024", Math.ceil(51 / 2) + 8, "gpt", 2).price], "edit quote includes the pictures");
  e.setChain([tr(40, "alice", "mes", qe.price + " HBD", qe.memo, 5)]);
  r = mk("POST", { op: "run", id: qe.id, acct: "alice" });
  await e.h(r.req, r.res);
  eq(J(r.res).t, "image", "edit answer");
  const ec = e.calls.find((c) => /images\/edits$/.test(c.url || ""));
  eq([!!ec, ec && ec.body.images.length, ec && ec.body.images[0].image_url.slice(0, 23), ec && ec.body.images[1].image_url.slice(0, 22)], [true, 2, "data:image/jpeg;base64,", "data:image/png;base64,"], "edit request to OpenAI");
  r = mk("POST", { op: "quote", acct: "alice", kind: "image", prompt: "x", quality: "medium", size: "1024x1024", refs: [R1, R1, R1, R1, R1, R1, R1] });
  await e.h(r.req, r.res);
  eq(r.res.statusCode, 400, "7 pictures refused (6 at most)");
  r = mk("POST", { op: "quote", acct: "alice", kind: "image", prompt: "x", quality: "medium", size: "1024x1024" });
  await e.h(r.req, r.res);
  e.setChain([tr(41, "alice", "mes", J(r.res).price + " HBD", J(r.res).memo, 5)]);
  const before = e.calls.length;
  r = mk("POST", { op: "run", id: J(r.res).id, acct: "alice" }); await e.h(r.req, r.res);
  ok(e.calls.slice(before).some((c) => /images\/generations$/.test(c.url || "")), "no pictures: generations, not edits");

  /* ---------- cheap models (OpenRouter) and free daily messages (2026-11-21) ---------- */
  {
    const crypto = require("crypto");
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const enc58 = (buf) => { let x = BigInt("0x" + buf.toString("hex")), o = ""; while (x > 0n) { o = B58[Number(x % 58n)] + o; x /= 58n; } return o; };
    const kp = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" }), jw = kp.publicKey.export({ format: "jwk" });
    const yb = Buffer.from(jw.y, "base64url"), STM = "STM" + enc58(Buffer.concat([Buffer.from([2 + (yb[31] & 1)]), Buffer.from(jw.x, "base64url"), Buffer.alloc(4)]));
    const signAs = (msg) => "1f" + crypto.sign("sha256", Buffer.from(msg), { key: kp.privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
    const { hiveVerify } = require("../mes.fm/api/ai.js");
    ok(hiveVerify("hello", signAs("hello"), STM) && !hiveVerify("hellO", signAs("hello"), STM) && !hiveVerify("hello", signAs("hello"), "STMxyz"), "Hive signature check (secp256k1, STM key)");
    const redis = fakeRedis(), calls = [];
    let chainF = [], orMode = "ok", day = T0;
    const env = { OPENROUTER_API_KEY: "or-k", UPSTASH_REDIS_REST_TOKEN: "x" };
    const orStream = sse([{ choices: [{ index: 0, delta: { content: "Four." } }] }, { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }, { choices: [], usage: { completion_tokens: 3, cost: 0.00002 } }]) + "data: [DONE]\n\n";
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
      if (/openrouter\.ai\/api\/v1\/chat\/completions$/.test(url)) return orMode === "down" ? { ok: false, status: 502, json: async () => ({ error: { message: "upstream" } }) } : { ok: true, status: 200, body: streamBody(orStream) };
      throw new Error("unexpected " + url);
    };
    const hf = makeHandler({ env, redis, fetch: fetchImpl, now: () => day, rpc: async (m, p) => m === "condenser_api.get_accounts" ? [{ name: p[0][0], posting: { key_auths: [[STM, 1]] } }] : chainF });
    r = mk("GET", null, { op: "status" }); await hf(r.req, r.res);
    eq([J(r.res).chat, J(r.res).prov.openrouter, J(r.res).free], [true, true, { on: true, perDay: A.FREE.perDay, pics: true, picsPerDay: A.FREE.pics }], "status: OpenRouter + free on");
    // paid cheap model: safe count, max_price = the quoted prices
    const msgs = [{ role: "user", content: "What is 2+2?" }];
    r = mk("POST", { op: "quote", acct: "hal", kind: "chat", model: "dsflash", len: "short", messages: msgs }); await hf(r.req, r.res);
    const qc = J(r.res);
    eq([r.res.statusCode, qc.inTokens, qc.price], [200, A.safeTokens(A.systemFor("dsflash"), msgs), A.chatQuote("dsflash", A.safeTokens(A.systemFor("dsflash"), msgs), "short").price], "cheap model quote (safe count)");
    chainF = [tr(1, "hal", "mes", qc.price + " HBD", qc.memo, 5)];
    r = mk("POST", { op: "run", id: qc.id, acct: "hal" }); await hf(r.req, r.res);
    eq(lines(r.res).map((x) => x.t), ["text", "done"], "cheap model answer streamed");
    const oc = calls.find((c) => /openrouter/.test(c.url));
    eq([oc.body.model, oc.body.max_tokens, oc.body.provider.max_price, oc.body.usage, oc.headers.Authorization], ["deepseek/deepseek-v4.1-flash-1017", 1500, { prompt: 0.3, completion: 1.2 }, { include: true }, "Bearer or-k"], "OpenRouter request with price cap");
    r = mk("POST", { op: "quote", acct: "hal", kind: "chat", model: "qwen", len: "short", messages: [{ role: "user", content: "What is this?", files: [{ t: "img", mt: "image/jpeg", name: "a.jpg", data: "/9j/" + "A".repeat(40) }] }] }); await hf(r.req, r.res);
    eq(r.res.statusCode, 400, "text-only model refuses pictures");
    // free messages
    const today = A.utcDay(day), sig = signAs(A.freeMessage("ivy", today));
    const freeBody = (o) => Object.assign({ op: "free", acct: "ivy", day: today, sig, model: "dsflash", messages: msgs }, o);
    r = mk("GET", null, { op: "free", acct: "ivy" }); await hf(r.req, r.res);
    eq([J(r.res).on, J(r.res).left], [true, A.FREE.perDay], "free: all left");
    r = mk("POST", freeBody({ sig: signAs("something else") })); await hf(r.req, r.res);
    eq([r.res.statusCode, J(r.res).resign], [403, true], "free: wrong signature -> sign again");
    r = mk("POST", freeBody({ day: "2020-01-01" })); await hf(r.req, r.res);
    eq(J(r.res).resign, true, "free: yesterday's signature -> sign again");
    r = mk("POST", freeBody({ model: "sonnet" })); await hf(r.req, r.res);
    eq(r.res.statusCode, 400, "free: only the cheap models");
    r = mk("POST", freeBody({ messages: [{ role: "user", content: "x".repeat(A.FREE.maxIn + 10) }] })); await hf(r.req, r.res);
    eq([r.res.statusCode, J(r.res).long], [400, true], "free: chat too long");
    r = mk("POST", freeBody()); await hf(r.req, r.res);
    eq([r.res.statusCode, r.res.headers["X-Free-Left"], lines(r.res).map((x) => x.t)], [200, String(A.FREE.perDay - 1), ["text", "done"]], "free message answered, one used");
    const fc = calls.filter((c) => /openrouter/.test(c.url)).pop();
    eq(fc.body.max_tokens, A.FREE.maxOut, "free answers are Short");
    eq(Number(redis.st.get("ai:freeusd:" + today)), Math.ceil(0.00002 * 1e6), "budget keeps the real cost, the worst case is given back");
    orMode = "down";
    r = mk("POST", freeBody()); await hf(r.req, r.res);
    eq([r.res.statusCode, J(r.res).free], [502, true], "failed free message");
    orMode = "ok";
    r = mk("GET", null, { op: "free", acct: "ivy" }); await hf(r.req, r.res);
    eq(J(r.res).left, A.FREE.perDay - 1, "a failed free message is not counted");
    for (let i = 0; i < A.FREE.perDay - 1; i++) { r = mk("POST", freeBody()); await hf(r.req, r.res); }
    r = mk("POST", freeBody()); await hf(r.req, r.res);
    eq([r.res.statusCode, J(r.res).left], [429, 0], "free: 11th message of the day refused");
    day += 86400e3;
    const sig2 = signAs(A.freeMessage("ivy", A.utcDay(day)));
    r = mk("POST", freeBody({ day: A.utcDay(day), sig: sig2 })); await hf(r.req, r.res);
    eq(r.res.statusCode, 200, "next day: free again");
    // the daily budget for everyone
    env.AI_FREE_USD = "0.000001";
    const sig3 = signAs(A.freeMessage("jon", A.utcDay(day)));
    r = mk("POST", { op: "free", acct: "jon", day: A.utcDay(day), sig: sig3, model: "qwen", messages: msgs }); await hf(r.req, r.res);
    eq([r.res.statusCode, J(r.res).budget], [429, true], "free: daily budget for everyone reached");
    env.AI_FREE_USD = "0";
    r = mk("GET", null, { op: "status" }); await hf(r.req, r.res);
    eq(J(r.res).free.on, false, "AI_FREE_USD=0 switches free messages off");
    ok(A.freeWorstUsd("dsflash") > 0 && A.freeWorstUsd("sonnet") === 0, "free worst case only for free models");
    eq([A.chatQuote("dsflash", 1000, "short").price, A.FEES.openrouter, A.realUsd(1, "anthropic")], [A.fmtHbd(A.hbdFromUsd((1000 * 0.3 + 1500 * 1.2) / 1e6, "openrouter")), 1.19, 1.12], "real cost: tax 12%, OpenRouter fee + tax 1.19");
  ok(A.chatQuote("sonnet", 5000, "medium").hbd + 1e-9 >= A.chatQuote("sonnet", 5000, "medium").costUsd * 1.12 * A.MARGIN, "price covers cost x tax x margin");
  eq(A.freeMessage("ivy", "2026-11-21"), "mes.fm/ai free messages for @ivy on 2026-11-21", "the signed text");
    Object.keys(A.MODELS).forEach((k) => { const m = A.MODELS[k]; if (m.free) ok(m.prov === "openrouter" && m.text, "free model " + k + " is a cheap text model"); });

  // OpenRouter pictures + videos + free daily pictures (2026-11-23, mocked API)
  {
    const redis = fakeRedis(), calls = [];
    let chainO = [], imgMode = "ok", vstate = "pending", day = T0;
    const env = { OPENROUTER_API_KEY: "or-k", UPSTASH_REDIS_REST_TOKEN: "x" };
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
      if (/openrouter\.ai\/api\/v1\/images$/.test(url)) return imgMode === "down" ? { ok: false, status: 502, json: async () => ({ error: { message: "upstream" } }) }
        : { ok: true, status: 200, json: async () => ({ created: 1, data: [{ b64_json: "iVBORw0K", media_type: "image/png" }], usage: { cost: 0.009 } }) };
      if (/openrouter\.ai\/api\/v1\/videos$/.test(url)) return { ok: true, status: 202, json: async () => ({ id: "vj1", polling_url: "https://openrouter.ai/api/v1/videos/vj1", status: "pending" }) };
      if (/openrouter\.ai\/api\/v1\/videos\/vj1$/.test(url)) return { ok: true, status: 200, json: async () => vstate === "done" ? { id: "vj1", status: "completed", unsigned_urls: ["https://openrouter.ai/api/v1/videos/vj1/content?index=0"], usage: { cost: 0.2 } } : vstate === "failed" ? { id: "vj1", status: "failed", error: "nope" } : { id: "vj1", status: "in_progress" } };
      if (/videos\/vj1\/content/.test(url)) return { ok: true, status: 200, headers: { get: () => "video/mp4" }, body: { getReader() { let d = false; return { read: async () => d ? { done: true } : (d = true, { done: false, value: new Uint8Array([9]) }) }; } } };
      throw new Error("unexpected " + url);
    };
    const ho = makeHandler({ env, redis, fetch: fetchImpl, now: () => day, rpc: async (m, p) => m === "condenser_api.get_accounts" ? [{ name: p[0][0], posting: { key_auths: [[STM, 1]] } }] : chainO });
    r = mk("GET", null, { op: "status" }); await ho(r.req, r.res);
    eq([J(r.res).image, J(r.res).video], [true, true], "OpenRouter key alone switches pictures + videos on");
    // prices: fixed per picture from the tables
    eq(A.imageQuote("1k", "1024x1024", 0, "klein").price, A.fmtHbd(A.hbdFromUsd(0.009, "openrouter")), "FLUX 3 Klein 1k = $0.009 x fee x margin");
    eq(A.imageQuote("2k", "1536x1024", 0, "klein", 2).price, A.fmtHbd(A.hbdFromUsd(0.014 + 2 * 0.003, "openrouter")), "Klein 2k + 2 pictures");
    eq(A.imageQuote("2k", "1024x1024", 0, "seedream", 3).price, A.fmtHbd(A.hbdFromUsd(0.018, "openrouter")), "Seedream: pictures in are free");
    eq([A.checkImage("a", "2k", "1024x1024", "recraft"), A.checkImage("a", "1k", "1024x1024", "recraft")], ["Unknown quality.", null], "Recraft: 1k only");
    eq([A.maxRefs("image", "klein"), A.maxRefs("image", "recraft"), A.maxRefs("image", "seedream"), A.maxRefs("video", "veo")], [4, 0, 6, 1], "picture limits of the new models");
    ok(A.imageQuote("1k", "1024x1024", 0, "recraft").hbd < A.imageQuote("1k", "1024x1024", 0, "grok").hbd, "Recraft is cheaper than the cheapest Grok");
    // paid picture
    r = mk("POST", { op: "quote", acct: "kim", kind: "image", model: "klein", prompt: "A red fox", quality: "2k", size: "1024x1536" }); await ho(r.req, r.res);
    const qk = J(r.res);
    eq([r.res.statusCode, qk.price], [200, A.imageQuote("2k", "1024x1536", 0, "klein").price], "Klein quote");
    chainO = [tr(1, "kim", "mes", qk.price + " HBD", qk.memo, 5)];
    r = mk("POST", { op: "run", id: qk.id, acct: "kim" }); await ho(r.req, r.res);
    eq(J(r.res), { t: "image", b64: "iVBORw0K", mime: "image/png" }, "OpenRouter picture answer");
    const ki = calls.find((c) => /v1\/images$/.test(c.url));
    eq([ki.body.model, ki.body.resolution, ki.body.aspect_ratio, ki.body.response_format, ki.body.provider, ki.headers.Authorization],
      ["black-forest-labs/flux-3-image-klein", "2K", "2:3", "b64_json", { only: ["black-forest-labs"], allow_fallbacks: false, data_collection: "deny" }, "Bearer or-k"], "Image API request pinned to the provider we priced");
    const KR = { mt: "image/png", data: "iVBORw0K" + "A".repeat(40) };
    r = mk("POST", { op: "quote", acct: "kim", kind: "image", model: "seedream", prompt: "Put picture 1 on a beach", quality: "1k", size: "1024x1024", refs: [KR] }); await ho(r.req, r.res);
    const qs2 = J(r.res);
    chainO = [tr(2, "kim", "mes", qs2.price + " HBD", qs2.memo, 5)];
    let nb = calls.length;
    r = mk("POST", { op: "run", id: qs2.id, acct: "kim" }); await ho(r.req, r.res);
    const se = calls.slice(nb).find((c) => /v1\/images$/.test(c.url));
    eq([se.body.input_references.length, se.body.input_references[0].image_url.url.slice(0, 22)], [1, "data:image/png;base64,"], "reference pictures as input_references");
    imgMode = "down";
    r = mk("POST", { op: "quote", acct: "kim", kind: "image", model: "recraft", prompt: "A cat", quality: "1k", size: "1024x1024" }); await ho(r.req, r.res);
    const qr = J(r.res); chainO = [tr(3, "kim", "mes", qr.price + " HBD", qr.memo, 5)];
    r = mk("POST", { op: "run", id: qr.id, acct: "kim" }); await ho(r.req, r.res);
    eq([r.res.statusCode, J(r.res).retry], [502, true], "failed OpenRouter picture keeps a free retry");
    imgMode = "ok";
    nb = calls.length;
    r = mk("POST", { op: "run", id: qr.id, acct: "kim" }); await ho(r.req, r.res);
    const rc = calls.slice(nb).find((c) => /v1\/images$/.test(c.url));
    eq([J(r.res).t, "resolution" in rc.body], ["image", false], "retry works; one-size model gets no resolution field");
    // video
    eq(A.videoQuote("seedance", 5, "480p").price, A.fmtHbd(A.hbdFromUsd(0.037 * 5, "openrouter")), "Seedance 2.0 Mini 480p");
    eq(A.videoQuote("veo", 8, "1080p").price, A.fmtHbd(A.hbdFromUsd(0.08 * 8, "openrouter")), "Veo 3.1 Lite 1080p with sound");
    threw = false; try { A.videoQuote("veo", 5, "720p"); } catch (e) { threw = true; } eq(threw, true, "Veo takes 4 / 6 / 8 s only");
    threw = false; try { A.videoQuote("veo", 4, "480p"); } catch (e) { threw = true; } eq(threw, true, "Veo starts at 720p");
    eq([A.videoDurations("veo"), A.videoRes("seedance"), A.videoRes("std")], [[4, 6, 8], ["480p", "720p"], ["480p", "720p"]], "per-model lengths / resolutions");
    r = mk("POST", { op: "quote", acct: "kim", kind: "video", prompt: "A fox runs", model: "veo", seconds: 6, res: "720p", audio: false, refs: [KR] }); await ho(r.req, r.res);
    const qv = J(r.res);
    eq([r.res.statusCode, qv.price], [200, A.videoQuote("veo", 6, "720p", 1).price], "Veo quote");
    chainO = [tr(4, "kim", "mes", qv.price + " HBD", qv.memo, 5)];
    r = mk("POST", { op: "run", id: qv.id, acct: "kim" }); await ho(r.req, r.res);
    eq(J(r.res), { t: "video", job: qv.id }, "OpenRouter video job started");
    const vc = calls.find((c) => /v1\/videos$/.test(c.url));
    eq([vc.body.model, vc.body.duration, vc.body.resolution, vc.body.generate_audio, vc.body.frame_images[0].frame_type], ["google/veo-3.1-lite", 6, "720p", false, "first_frame"], "Video API request");
    r = mk("POST", { op: "vstatus", id: qv.id, acct: "kim" }); await ho(r.req, r.res);
    eq(J(r.res).status, "pending", "in_progress -> pending");
    vstate = "done";
    r = mk("POST", { op: "vstatus", id: qv.id, acct: "kim" }); await ho(r.req, r.res);
    eq(J(r.res).status, "done", "completed -> done");
    nb = calls.length;
    r = mk("GET", null, { op: "vfile", id: qv.id, acct: "kim" }); await ho(r.req, r.res);
    const fc = calls.slice(nb)[0];
    eq([r.res.headers["Content-Type"], fc.headers && fc.headers.Authorization], ["video/mp4", "Bearer or-k"], "file fetched from OpenRouter with our key");
    r = mk("POST", { op: "quote", acct: "kim", kind: "video", prompt: "B", model: "seedance", seconds: 5, res: "480p" }); await ho(r.req, r.res);
    const qv2 = J(r.res); chainO = [tr(5, "kim", "mes", qv2.price + " HBD", qv2.memo, 5)];
    vstate = "failed";
    r = mk("POST", { op: "run", id: qv2.id, acct: "kim" }); await ho(r.req, r.res);
    r = mk("POST", { op: "vstatus", id: qv2.id, acct: "kim" }); await ho(r.req, r.res);
    eq([J(r.res).status, J(r.res).retry], ["failed", true], "failed OpenRouter video -> free retry");
    // free daily pictures
    const today = A.utcDay(day), sig = signAs(A.freeMessage("liv", today));
    const fp = (o) => Object.assign({ op: "freepic", acct: "liv", day: today, sig, model: "recraft", prompt: "A lighthouse", quality: "1k", size: "1536x1024" }, o);
    r = mk("GET", null, { op: "free", acct: "liv" }); await ho(r.req, r.res);
    eq(J(r.res).pics, { on: true, perDay: A.FREE.pics, left: A.FREE.pics }, "free pictures left");
    nb = calls.length;
    r = mk("POST", fp()); await ho(r.req, r.res);
    eq([r.res.statusCode, J(r.res).t, r.res.headers["X-Free-Left"]], [200, "image", String(A.FREE.pics - 1)], "free picture made");
    const fq = calls.slice(nb).find((c) => /v1\/images$/.test(c.url));
    eq([fq.body.model, "provider" in fq.body], ["recraft/recraft-v4.1-flash-v2:free", false], "free picture uses the free copy");
    r = mk("POST", fp({ model: "klein" })); await ho(r.req, r.res);
    eq(r.res.statusCode, 400, "free pictures only on the free model");
    r = mk("POST", fp({ sig: "0".repeat(130) })); await ho(r.req, r.res);
    eq(J(r.res).resign, true, "bad signature -> sign again");
    imgMode = "down";
    r = mk("POST", fp()); await ho(r.req, r.res);
    eq([r.res.statusCode, J(r.res).free], [502, true], "failed free picture");
    imgMode = "ok";
    r = mk("GET", null, { op: "free", acct: "liv" }); await ho(r.req, r.res);
    eq(J(r.res).pics.left, A.FREE.pics - 1, "a failed free picture is not counted");
    for (let i = 0; i < A.FREE.pics - 1; i++) { r = mk("POST", fp()); await ho(r.req, r.res); }
    r = mk("POST", fp()); await ho(r.req, r.res);
    eq([r.res.statusCode, J(r.res).left], [429, 0], "free pictures: one too many refused");
    env.AI_FREE_PICS = "0";
    r = mk("GET", null, { op: "status" }); await ho(r.req, r.res);
    eq(J(r.res).free.pics, false, "AI_FREE_PICS=0 switches them off");
    ok(A.freePicOk("recraft", "1k", 0) && !A.freePicOk("recraft", "1k", 1) && !A.freePicOk("klein", "1k", 0), "freePicOk");
    // every quote covers the most the provider can bill (published per-unit prices x fee x margin)
    Object.keys(A.VIDEO.models).forEach((k) => A.videoRes(k).forEach((rs) => ok(A.videoQuote(k, A.videoDurations(k)[0], rs).hbd + 1e-9 >= A.VIDEO.models[k].usd[rs] * A.videoDurations(k)[0] * A.MARGIN, "video " + k + " " + rs + " covers cost")));
  }
  }

  // 🧭 browser tasks: quote -> pay -> budget -> steps (non-streaming tool use), budget never passed, failures cost nothing
  {
    const redis = fakeRedis(), calls = [];
    let mode = "tool", inTok = 3000;
    const env = { UPSTASH_REDIS_REST_TOKEN: "x", ANTHROPIC_API_KEY: "sk-test" };
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (/count_tokens/.test(url)) return { ok: true, status: 200, json: async () => ({ input_tokens: inTok }) };
      if (mode === "down") return { ok: false, status: 529, json: async () => ({ error: { message: "Overloaded" } }) };
      const content = mode === "tool" ? [{ type: "text", text: "Opening it." }, { type: "tool_use", id: "toolu_1", name: "open_tab", input: { url: "https://example.com" } }] : [{ type: "text", text: "Done." }];
      return { ok: true, status: 200, json: async () => ({ content, stop_reason: mode === "tool" ? "tool_use" : "end_turn", usage: { input_tokens: 200, cache_creation_input_tokens: inTok - 200, cache_read_input_tokens: 0, output_tokens: 120 } }) };
    };
    let chainA = [];
    const ha = makeHandler({ env, redis, fetch: fetchImpl, now: () => T0, rpc: async () => chainA });
    let r = mk("POST", { op: "quote", acct: "alice", kind: "agent", model: "sonnet", plan: "small" }); await ha(r.req, r.res);
    const qg = J(r.res);
    eq([r.res.statusCode, qg.price, qg.steps], [200, A.agentQuote("sonnet", "small").price, 25], "agent quote = plan price");
    ok(A.agentQuote("sonnet", "small").hbd + 1e-9 >= 0.2 * A.FEES.anthropic * A.MARGIN, "agent price covers the budget x fee x margin");
    r = mk("POST", { op: "quote", acct: "alice", kind: "agent", model: "dsflash", plan: "small" }); await ha(r.req, r.res);
    eq(r.res.statusCode, 400, "only Claude for browser tasks");
    chainA = [tr(30, "alice", "mes", qg.price + " HBD", qg.memo, 5)];
    r = mk("POST", { op: "run", id: qg.id, acct: "alice" }); await ha(r.req, r.res);
    const tk = J(r.res);
    eq([r.res.statusCode, tk.task, tk.budget, tk.maxSteps], [200, qg.id, 200000, 25], "paid task gets its budget");
    const msgs = [{ role: "user", content: [{ type: "text", text: "Open example.com" }] }];
    r = mk("POST", { op: "astep", id: qg.id, acct: "alice", messages: msgs }); await ha(r.req, r.res);
    let st = J(r.res);
    const real = Math.ceil(A.agentStepCost("sonnet", { input_tokens: 200, cache_creation_input_tokens: 2800, output_tokens: 120 }) * 1e6);
    eq([r.res.statusCode, st.stop, st.steps, st.spent], [200, "tool_use", 1, real], "step charges only the real cost");
    const mc = calls.filter((c) => /v1\/messages$/.test(c.url)).pop();
    ok(mc.body.tools.length === A.AGENT_TOOLS.length && mc.body.messages[0].content[0].cache_control && mc.body.max_tokens === A.AGENT.maxOut, "tools + prompt cache + answer cap sent");
    r = mk("POST", { op: "astep", id: qg.id, acct: "bob", messages: msgs }); await ha(r.req, r.res);
    eq(r.res.statusCode, 403, "someone else's task refused");
    const bad = msgs.concat([{ role: "assistant", content: st.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_X", content: "x" }] }]);
    r = mk("POST", { op: "astep", id: qg.id, acct: "alice", messages: bad }); await ha(r.req, r.res);
    eq(r.res.statusCode, 400, "a tool result for an unknown tool step is refused");
    const good = msgs.concat([{ role: "assistant", content: st.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "{\"tab\":5}" }] }] }]);
    mode = "down";
    r = mk("POST", { op: "astep", id: qg.id, acct: "alice", messages: good }); await ha(r.req, r.res);
    eq([r.res.statusCode, Number(redis.st.get("ai:task:" + qg.id + ":spent"))], [502, real], "a failed step takes nothing from the budget");
    mode = "end";
    r = mk("POST", { op: "astep", id: qg.id, acct: "alice", messages: good }); await ha(r.req, r.res);
    eq([r.res.statusCode, J(r.res).stop, J(r.res).steps], [200, "end_turn", 2], "second step ends the task");
    inTok = 90000;   // a step whose worst case does not fit the rest of the budget
    r = mk("POST", { op: "astep", id: qg.id, acct: "alice", messages: good }); await ha(r.req, r.res);
    eq([r.res.statusCode, J(r.res).out], [402, "budget"], "budget used up -> refused, never over");
    ok(Number(redis.st.get("ai:task:" + qg.id + ":spent")) <= 200000, "spent never passes the budget");
    eq(A.checkAgentMessages([{ role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "x" }] }]) != null, true, "tool result without a tool step");
    const pics = []; for (let i = 0; i < 5; i++) pics.push({ role: "assistant", content: [{ type: "tool_use", id: "t" + i, name: "screenshot", input: {} }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t" + i, content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } }] }] });
    const trimmed = A.agentTrimImages([{ role: "user", content: "go" }].concat(pics));
    eq(trimmed.reduce((n, m) => n + (Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result" && b.content[0].type === "image").length : 0), 0), A.AGENT.maxImages, "only the newest screenshots are kept");
    ok(A.agentRisky("click", { why: "Open compose" }, "Send") && !A.agentRisky("click", { why: "Open compose" }, "Compose") && A.agentRisky("click", { confirm: true }, ""), "risky steps are asked first");
  }

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
