/* MESAI -- shared rules of MES AI (mes.fm/ai): pay per prompt in HBD on Hive.
 * Used by the page (tool_apps_src/ai/app.js) and the server (mes.fm/api/ai.js loads the byte-identical copy
 * mes.fm/api/_ai-lib.js: after editing this file run  cp tool_apps_src/ai/lib.js mes.fm/api/_ai-lib.js ).
 * Pure: no network, no DOM. Tests: node tool_apps_src/ai-tests.js
 *
 * Price of one prompt = what the API provider charges us at most for it x MARGIN, in HBD, rounded UP to 0.001.
 * "At most": the input tokens are counted before sending (exact, Anthropic's count_tokens), and the answer is capped
 * at the chosen length (max_tokens, which also covers the model's thinking), so the real bill can never be higher
 * than the quote. A short answer costs the same as a long one of the same length setting: no balance is kept, so
 * there is nothing to refund the difference to. */
(function (root, factory) {
  var M = factory();
  if (typeof module === "object" && module.exports) module.exports = M;
  else root.MESAI = M;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MARGIN = 1.5;            // price = API cost x MARGIN (1.5 = 50% profit on cost). Change here only.
  var HBD_USD = 1;             // HBD is pegged to 1 USD; the margin covers small drifts of the peg
  var PRICES_CHECKED = "2026-11-18";
  var PAY_TO = "mes";
  var MEMO_PREFIX = "mesai:";
  var MIN_HBD = 0.001;

  // USD per 1M tokens (Anthropic first-party prices). caps = max_tokens per answer length (includes thinking).
  var MODELS = {
    sonnet: { id: "claude-sonnet-5-5", name: "Sonnet 5.5", blurb: "Fast and clever: everyday questions, writing, coding.",
      inUsd: 2, outUsd: 10, effort: "low", caps: { short: 1200, medium: 5000, long: 16000 },
      // server-side refusal fallback: Claude Sonnet 5 has the same prices, so the quote still holds
      fallback: "claude-sonnet-5" },
    opus: { id: "claude-opus-5-5", name: "Opus 5.5", blurb: "The strongest: hard coding, research, long careful answers. Thinks first.",
      inUsd: 4, outUsd: 20, effort: "medium", caps: { short: 3000, medium: 10000, long: 30000 },
      fallback: null }  // no fallback: Claude Opus 4.8 costs more ($5 / $25), which could go over the quote
  };
  var DEFAULT_MODEL = "sonnet";
  var LENGTHS = { short: "Short", medium: "Medium", long: "Long" };

  // OpenAI gpt-image-2: USD per image by quality and size (OpenAI's image guide), + prompt text at $5 / 1M tokens.
  var IMAGE = { id: "gpt-image-2", name: "GPT Image 2", textInUsd: 5,
    sizes: { "1024x1024": "Square", "1024x1536": "Portrait", "1536x1024": "Landscape" },
    perImage: {
      low: { "1024x1024": 0.006, "1024x1536": 0.005, "1536x1024": 0.005 },
      medium: { "1024x1024": 0.053, "1024x1536": 0.041, "1536x1024": 0.041 },
      high: { "1024x1024": 0.211, "1024x1536": 0.165, "1536x1024": 0.165 }
    } };

  var LIMITS = { msgChars: 60000, totalChars: 300000, turns: 200, promptChars: 4000, inTokens: 150000 };

  var SYSTEM = "You are MES AI, the AI assistant on mes.fm (Math Easy Solutions), running on Anthropic's Claude. " +
    "Help with coding, research, math, writing and everyday questions. Be clear and accurate; say when you are unsure. " +
    "Use Markdown: headings only when they help, lists, and fenced code blocks with a language name. " +
    "Write math with plain symbols or inline code, not LaTeX. Each answer has a length limit, so get to the point and finish your answer within it. " +
    "Refuse requests for clearly illegal or seriously harmful content.";

  /* ---------- numbers ---------- */
  function hbdFromUsd(usd) {
    var h = (Number(usd) || 0) * MARGIN / HBD_USD;
    var milli = Math.ceil(h * 1000 - 1e-7);          // round UP to 0.001 (tiny epsilon so 0.0480000001 stays 0.048)
    return Math.max(MIN_HBD, milli / 1000);
  }
  function fmtHbd(n) { return (Math.round(Number(n) * 1000) / 1000).toFixed(3); }
  function fmtUsd(n) { n = Number(n) || 0; return n < 0.01 ? "$" + n.toFixed(4) : "$" + n.toFixed(n < 1 ? 3 : 2); }

  // rough count used only for the "about" estimate while typing and the local preview (the server counts exactly):
  // about 3 characters per token, on the safe side for English (real text is ~4)
  function estimateTokens(s) { s = String(s || ""); return s ? Math.ceil(s.length / 3) + 4 : 0; }
  function estimateChatTokens(messages) {
    var n = estimateTokens(SYSTEM) + 10;
    (messages || []).forEach(function (m) { n += estimateTokens(m && m.content) + 4; });
    return n;
  }

  function chatQuote(modelKey, inTokens, len) {
    var m = MODELS[modelKey];
    if (!m) throw new Error("Unknown model");
    var cap = m.caps[len];
    if (!cap) throw new Error("Unknown answer length");
    inTokens = Math.max(0, Math.ceil(Number(inTokens) || 0));
    var usd = (inTokens * m.inUsd + cap * m.outUsd) / 1e6;
    var hbd = hbdFromUsd(usd);
    return { kind: "chat", model: modelKey, modelId: m.id, len: len, inTokens: inTokens, maxOut: cap, costUsd: usd, hbd: hbd, price: fmtHbd(hbd) };
  }
  function imageQuote(quality, size, promptTokens) {
    var row = IMAGE.perImage[quality];
    if (!row || row[size] == null) throw new Error("Unknown image quality or size");
    var t = Math.max(0, Math.ceil(Number(promptTokens) || 0));
    var usd = row[size] + t * IMAGE.textInUsd / 1e6;
    var hbd = hbdFromUsd(usd);
    return { kind: "image", modelId: IMAGE.id, quality: quality, size: size, inTokens: t, costUsd: usd, hbd: hbd, price: fmtHbd(hbd) };
  }

  /* ---------- request ids and memos ---------- */
  var ID_RE = /^[0-9a-f]{16}$/;
  function newId(randomBytes) {
    var b = randomBytes ? randomBytes(8) : null;
    if (!b) {
      b = new Uint8Array(8);
      var c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : null;
      if (c) c.getRandomValues(b); else for (var i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 256);
    }
    var s = "";
    for (var j = 0; j < 8; j++) s += ("0" + (b[j] & 255).toString(16)).slice(-2);
    return s;
  }
  function validId(id) { return typeof id === "string" && ID_RE.test(id); }
  function memoFor(id) { return MEMO_PREFIX + id; }
  function idFromMemo(memo) { var m = /^mesai:([0-9a-f]{16})$/.exec(String(memo || "").trim()); return m ? m[1] : null; }

  var NAME_RE = /^[a-z][a-z0-9-]{1,14}[a-z0-9](\.[a-z][a-z0-9-]{1,14}[a-z0-9])*$/;
  function validName(n) { return typeof n === "string" && n.length >= 3 && n.length <= 16 && NAME_RE.test(n); }

  /* ---------- input checks ---------- */
  function checkMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) return "Write a message first.";
    if (messages.length > LIMITS.turns) return "This chat is too long. Start a new chat.";
    var total = 0;
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return "Bad message.";
      if (m.role !== (i % 2 === 0 ? "user" : "assistant")) return "Messages must take turns (you, then the AI).";
      if (!m.content.trim()) return "Empty message.";
      if (m.content.length > LIMITS.msgChars) return "One message is too long (" + LIMITS.msgChars.toLocaleString("en-US") + " characters at most).";
      total += m.content.length;
    }
    if (messages[messages.length - 1].role !== "user") return "The last message must be yours.";
    if (total > LIMITS.totalChars) return "This chat is too long to send. Start a new chat (or remove old messages).";
    return null;
  }
  function cleanMessages(messages) {
    return (messages || []).map(function (m) { return { role: m.role, content: String(m.content) }; });
  }
  function checkImage(prompt, quality, size) {
    if (typeof prompt !== "string" || !prompt.trim()) return "Describe the picture first.";
    if (prompt.length > LIMITS.promptChars) return "The description is too long (" + LIMITS.promptChars + " characters at most).";
    if (!IMAGE.perImage[quality]) return "Unknown quality.";
    if (!IMAGE.sizes[size]) return "Unknown size.";
    return null;
  }

  /* ---------- finding the payment in a Hive account history ---------- */
  // "1.000 HBD" or {amount:"1000", precision:3, nai:"@@000000013"} -> {n, sym}
  function parseAmount(a) {
    if (a && typeof a === "object" && a.amount != null) {
      var sym = a.nai === "@@000000013" ? "HBD" : a.nai === "@@000000021" ? "HIVE" : "?";
      return { n: Number(a.amount) / Math.pow(10, a.precision || 3), sym: sym };
    }
    var m = String(a || "").trim().match(/^(\d+(?:\.\d+)?)\s+([A-Z]+)$/);
    return m ? { n: Number(m[1]), sym: m[2] === "SBD" ? "HBD" : m[2] } : { n: 0, sym: "?" };
  }
  var ts = function (s) { return Date.parse(/Z$/.test(s) ? s : s + "Z"); };

  /* history = condenser_api.get_account_history entries ([index, {op:[name, data], timestamp, trx_id}]).
   * want = {from, memo, price (HBD number or "0.034"), since (ms; transfers older than this are ignored)}
   * -> {trx, at, amount} for a transfer from `from` to @mes, in HBD, with exactly that memo and at least that amount; else null */
  function findPayment(history, want) {
    var price = Number(want.price);
    var since = want.since || 0;
    for (var i = (history || []).length - 1; i >= 0; i--) {
      var h = history[i], e = Array.isArray(h) ? h[1] : h;
      if (!e || !Array.isArray(e.op) || e.op[0] !== "transfer") continue;
      var d = e.op[1] || {};
      if (d.from !== want.from || d.to !== PAY_TO) continue;
      if (String(d.memo || "").trim() !== want.memo) continue;
      var a = parseAmount(d.amount);
      if (a.sym !== "HBD" || a.n + 1e-9 < price) continue;
      var t = ts(e.timestamp);
      if (!isFinite(t) || t < since) continue;
      return { trx: e.trx_id || null, at: new Date(t).toISOString(), amount: fmtHbd(a.n) };
    }
    return null;
  }

  /* ---------- reading Anthropic's server-sent events ---------- */
  // feed text, get back complete events [{event, data (parsed JSON or null)}] and the unfinished rest
  function sseSplit(buf) {
    var out = [], parts = String(buf).replace(/\r\n/g, "\n").split("\n\n");
    var rest = parts.pop();
    parts.forEach(function (block) {
      var ev = "message", data = [];
      block.split("\n").forEach(function (line) {
        if (line.indexOf("event:") === 0) ev = line.slice(6).trim();
        else if (line.indexOf("data:") === 0) data.push(line.slice(5).replace(/^ /, ""));
      });
      if (!data.length) return;
      var j = null;
      try { j = JSON.parse(data.join("\n")); } catch (e) {}
      out.push({ event: ev, data: j });
    });
    return { events: out, rest: rest };
  }
  // one Anthropic stream event -> what the page needs: {t:"text", v} | {t:"think"} | {t:"stop", stop, usage} | {t:"error", msg} | null
  function streamPiece(ev) {
    var d = ev && ev.data;
    if (!d) return null;
    if (d.type === "content_block_start" && d.content_block && d.content_block.type === "thinking") return { t: "think" };
    if (d.type === "content_block_delta" && d.delta && d.delta.type === "text_delta") return { t: "text", v: d.delta.text || "" };
    if (d.type === "message_delta") return { t: "stop", stop: (d.delta && d.delta.stop_reason) || null, usage: d.usage || null };
    if (d.type === "error" || ev.event === "error") return { t: "error", msg: (d.error && d.error.message) || "The model stopped with an error." };
    return null;
  }

  return {
    MARGIN: MARGIN, HBD_USD: HBD_USD, PRICES_CHECKED: PRICES_CHECKED, PAY_TO: PAY_TO, MEMO_PREFIX: MEMO_PREFIX, MIN_HBD: MIN_HBD,
    MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL, LENGTHS: LENGTHS, IMAGE: IMAGE, LIMITS: LIMITS, SYSTEM: SYSTEM,
    hbdFromUsd: hbdFromUsd, fmtHbd: fmtHbd, fmtUsd: fmtUsd, estimateTokens: estimateTokens, estimateChatTokens: estimateChatTokens,
    chatQuote: chatQuote, imageQuote: imageQuote,
    newId: newId, validId: validId, memoFor: memoFor, idFromMemo: idFromMemo, validName: validName,
    checkMessages: checkMessages, cleanMessages: cleanMessages, checkImage: checkImage,
    parseAmount: parseAmount, findPayment: findPayment, sseSplit: sseSplit, streamPiece: streamPiece
  };
});
