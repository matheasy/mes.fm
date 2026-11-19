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
  var PRICES_CHECKED = "2026-11-19";
  var PAY_TO = "mes";
  var MEMO_PREFIX = "mesai:";
  var MIN_HBD = 0.001;

  // USD per 1M tokens (each company's own standard prices; OpenAI's from developers.openai.com/api/docs/pricing, checked 2026-11-19).
  // caps = max_tokens / max_completion_tokens per answer length (includes thinking / reasoning tokens).
  // prov = which company runs it (anthropic | openai): its key must be set in Vercel for the model to be offered.
  var MODELS = {
    sonnet: { prov: "anthropic", id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", blurb: "Fast and clever: everyday questions, writing, coding.",
      inUsd: 2, outUsd: 10, effort: "low", caps: { short: 1200, medium: 5000, long: 16000 },
      // server-side refusal fallback: Claude Sonnet 5 has the same prices, so the quote still holds
      fallback: "claude-sonnet-5" },
    opus: { prov: "anthropic", id: "claude-opus-5-5", name: "Claude Opus 5.5", blurb: "The strongest: hard coding, research, long careful answers. Thinks first.",
      inUsd: 4, outUsd: 20, effort: "medium", caps: { short: 3000, medium: 10000, long: 30000 }, thinks: true,
      fallback: null },  // no fallback: Claude Opus 4.8 costs more ($5 / $25), which could go over the quote
    gpt: { prov: "openai", id: "gpt-6.2-sol", name: "ChatGPT: GPT-6.2 Sol", blurb: "OpenAI's balanced model (the one behind ChatGPT): fast, good at everyday questions and code.",
      inUsd: 2, outUsd: 10, effort: "low", caps: { short: 1200, medium: 5000, long: 16000 }, thinks: true },
    gptpro: { prov: "openai", id: "gpt-6.2-astra", name: "ChatGPT: GPT-6.2 Astra", blurb: "OpenAI's flagship for complex reasoning and coding. Thinks first, so it costs more.",
      inUsd: 8, outUsd: 40, effort: "medium", caps: { short: 3000, medium: 10000, long: 30000 }, thinks: true }
  };
  var PROVIDERS = { anthropic: "Anthropic", openai: "OpenAI", xai: "xAI" };
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

  // every picture model the page offers. gpt = OpenAI (quality low/medium/high, size = pixels).
  // Grok Imagine = xAI (docs.x.ai/developers/pricing, checked 2026-11-19): a flat price per picture; quality = resolution 1k / 2k.
  // xAI lists no extra price for 2k, so RES_X is our own safe guess like the video one: CHECK it against the first real bills.
  // The page's shapes (pixel sizes) map to xAI aspect ratios through ASPECT.
  var IMAGES = {
    gpt: { prov: "openai", id: "gpt-image-2", name: "GPT Image 2 (ChatGPT)" },
    grok: { prov: "xai", id: "grok-imagine-image", name: "Grok Imagine (cheapest)", usd: 0.02 },
    grok2: { prov: "xai", id: "grok-imagine-image-2.0", name: "Grok Imagine 2.0", usd: 0.04 }
  };
  var XIMAGE = { res: { "1k": "Standard (1k)", "2k": "Sharp (2k)" }, RES_X: { "1k": 1, "2k": 1.5 },
    ASPECT: { "1024x1024": "1:1", "1536x1024": "3:2", "1024x1536": "2:3" } };

  // xAI Grok Imagine video: USD per second of video (docs.x.ai pricing, checked 2026-11-18). xAI says resolution changes the price too
  // but publishes no rate for it, so RES_X is our own safe guess (x the per-second price): CHECK it against the first real bills and lower it.
  var VIDEO = { name: "Grok Imagine",
    models: {
      lite: { id: "grok-imagine-video-1.5-lite", name: "Lite (cheapest)", usdSec: 0.02, maxRes: "1080p" },
      std: { id: "grok-imagine-video", name: "Standard", usdSec: 0.05, maxRes: "720p" },
      best: { id: "grok-imagine-video-1.5", name: "Best (1.5)", usdSec: 0.08, maxRes: "1080p" }
    },
    res: ["480p", "720p", "1080p"],
    RES_X: { "480p": 1, "720p": 1.5, "1080p": 2.25 },
    durations: [5, 8, 10, 15],
    maxPromptChars: 4000 };

  var LIMITS = { msgChars: 60000, totalChars: 300000, turns: 200, promptChars: 4000, inTokens: 150000 };
  // Files sent with a message (pictures and PDFs; text files are added to the message text by the page). The whole
  // request must stay under Vercel's 4.5 MB body limit, so all files of one request together are capped at FILES.total
  // base64 characters (the page drops older messages' files first). Kept in this browser only.
  var FILES = { perMsg: 8, total: 3200000, img: ["image/jpeg", "image/png", "image/webp", "image/gif"], pdf: "application/pdf",
    imgTokens: 1600, pdfPageTokens: 2500 };

  var SYSTEM = "You are MES AI, the AI assistant on mes.fm (Math Easy Solutions), running on Anthropic's Claude. " +
    "Help with coding, research, math, writing and everyday questions. Be clear and accurate; say when you are unsure. " +
    "Use Markdown: headings only when they help, lists, and fenced code blocks with a language name. " +
    "Write math with plain symbols or inline code, not LaTeX. Each answer has a length limit, so get to the point and finish your answer within it. " +
    "Refuse requests for clearly illegal or seriously harmful content.";
  // the same instructions, naming the company that really runs the chosen model
  function systemFor(modelKey) {
    var m = MODELS[modelKey];
    return m && m.prov === "openai" ? SYSTEM.replace("running on Anthropic's Claude", "running on OpenAI's GPT") : SYSTEM;
  }

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
  // a file's tokens for the price preview (the server counts them exactly): a picture ~1,600, a PDF ~2,500 a page
  function fileTokens(f) {
    if (!f) return 0;
    if (f.t === "pdf") return (f.pages || Math.max(1, Math.ceil(String(f.data || "").length / 60000))) * FILES.pdfPageTokens;
    return FILES.imgTokens;
  }
  function estimateChatTokens(messages) {
    var n = estimateTokens(SYSTEM) + 10;
    (messages || []).forEach(function (m) { n += estimateTokens(m && m.content) + 4; (m && m.files || []).forEach(function (f) { n += fileTokens(f); }); });
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
  function imageQuote(quality, size, promptTokens, model) {
    model = model || "gpt";
    var im = IMAGES[model];
    if (!im) throw new Error("Unknown picture model");
    if (im.prov === "xai") {
      if (!XIMAGE.RES_X[quality] || !XIMAGE.ASPECT[size]) throw new Error("Unknown image quality or size");
      var xu = im.usd * XIMAGE.RES_X[quality], xh = hbdFromUsd(xu);
      return { kind: "image", model: model, modelId: im.id, quality: quality, size: size, aspect: XIMAGE.ASPECT[size], inTokens: 0, costUsd: xu, hbd: xh, price: fmtHbd(xh) };
    }
    var row = IMAGE.perImage[quality];
    if (!row || row[size] == null) throw new Error("Unknown image quality or size");
    var t = Math.max(0, Math.ceil(Number(promptTokens) || 0));
    var usd = row[size] + t * IMAGE.textInUsd / 1e6;
    var hbd = hbdFromUsd(usd);
    return { kind: "image", model: "gpt", modelId: IMAGE.id, quality: quality, size: size, inTokens: t, costUsd: usd, hbd: hbd, price: fmtHbd(hbd) };
  }

  function videoQuote(model, seconds, res) {
    var m = VIDEO.models[model];
    if (!m) throw new Error("Unknown video model");
    var d = Math.round(Number(seconds));
    if (VIDEO.durations.indexOf(d) < 0) throw new Error("Unknown video length");
    var ri = VIDEO.res.indexOf(res);
    if (ri < 0 || ri > VIDEO.res.indexOf(m.maxRes)) throw new Error("That model can't make " + res + " video");
    var usd = m.usdSec * d * VIDEO.RES_X[res];
    var hbd = hbdFromUsd(usd);
    return { kind: "video", model: model, modelId: m.id, seconds: d, res: res, costUsd: usd, hbd: hbd, price: fmtHbd(hbd) };
  }
  function checkVideo(prompt, model, seconds, res) {
    if (typeof prompt !== "string" || !prompt.trim()) return "Describe the video first.";
    if (prompt.length > VIDEO.maxPromptChars) return "The description is too long (" + VIDEO.maxPromptChars + " characters at most).";
    try { videoQuote(model, seconds, res); } catch (e) { return e.message + "."; }
    return null;
  }
  // the finished video's address from xAI must be a plain https link (it is handed to our server to pass the file on)
  function okVideoUrl(u) { return typeof u === "string" && /^https:\/\/[a-z0-9.-]+(:443)?\/[^\s]*$/i.test(u) && u.length < 2000; }

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
    var total = 0, fileChars = 0;
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return "Bad message.";
      if (m.role !== (i % 2 === 0 ? "user" : "assistant")) return "Messages must take turns (you, then the AI).";
      if (m.files != null) {
        if (m.role !== "user" || !Array.isArray(m.files)) return "Bad file.";
        if (m.files.length > FILES.perMsg) return "At most " + FILES.perMsg + " files in one message.";
        for (var j = 0; j < m.files.length; j++) {
          var e = checkFile(m.files[j]); if (e) return e;
          fileChars += m.files[j].data.length;
        }
      }
      if (!m.content.trim() && !(m.files && m.files.length)) return "Empty message.";
      if (m.content.length > LIMITS.msgChars) return "One message is too long (" + LIMITS.msgChars.toLocaleString("en-US") + " characters at most).";
      total += m.content.length;
    }
    if (messages[messages.length - 1].role !== "user") return "The last message must be yours.";
    if (total > LIMITS.totalChars) return "This chat is too long to send. Start a new chat (or remove old messages).";
    if (fileChars > FILES.total) return "The files are too big together (about " + Math.round(FILES.total * 0.75 / 1e6 * 10) / 10 + " MB at most). Send fewer or smaller files.";
    return null;
  }
  function checkFile(f) {
    if (!f || typeof f.data !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(f.data) || f.data.length < 8) return "Bad file.";
    if (f.t === "img") { if (FILES.img.indexOf(f.mt) < 0) return "Pictures must be JPEG, PNG, WebP or GIF."; }
    else if (f.t === "pdf") { if (f.mt !== FILES.pdf) return "Bad PDF."; }
    else return "Only pictures and PDFs can be sent as files.";
    if (f.name != null && (typeof f.name !== "string" || f.name.length > 200)) return "Bad file name.";
    return null;
  }
  function cleanFile(f) {
    var o = { t: f.t, mt: f.mt, data: f.data };
    if (f.name) o.name = String(f.name).replace(/[\u0000-\u001f]/g, "").slice(0, 120);
    if (f.pages) o.pages = Math.min(2000, Math.max(1, Math.floor(Number(f.pages)) || 1));
    return o;
  }
  // provider formats: Anthropic messages (image / document blocks), OpenAI Chat Completions, OpenAI Responses (token count)
  function toAnthropic(messages) {
    return (messages || []).map(function (m) {
      if (!m.files || !m.files.length) return { role: m.role, content: m.content };
      var c = m.files.map(function (f) {
        return f.t === "pdf" ? { type: "document", source: { type: "base64", media_type: f.mt, data: f.data }, title: f.name || undefined }
          : { type: "image", source: { type: "base64", media_type: f.mt, data: f.data } };
      });
      if (m.content.trim()) c.push({ type: "text", text: m.content });
      return { role: m.role, content: c };
    });
  }
  function toOpenAIChat(messages) {
    return (messages || []).map(function (m) {
      if (!m.files || !m.files.length) return { role: m.role, content: m.content };
      var c = m.files.map(function (f) {
        var url = "data:" + f.mt + ";base64," + f.data;
        return f.t === "pdf" ? { type: "file", file: { filename: f.name || "file.pdf", file_data: url } } : { type: "image_url", image_url: { url: url } };
      });
      if (m.content.trim()) c.push({ type: "text", text: m.content });
      return { role: m.role, content: c };
    });
  }
  function toOpenAIResponses(messages) {
    return (messages || []).map(function (m) {
      if (!m.files || !m.files.length) return { role: m.role, content: m.content };
      var c = m.files.map(function (f) {
        var url = "data:" + f.mt + ";base64," + f.data;
        return f.t === "pdf" ? { type: "input_file", filename: f.name || "file.pdf", file_data: url } : { type: "input_image", image_url: url };
      });
      if (m.content.trim()) c.push({ type: "input_text", text: m.content });
      return { role: m.role, content: c };
    });
  }
  function cleanMessages(messages) {
    return (messages || []).map(function (m) {
      var o = { role: m.role, content: String(m.content) };
      if (m.role === "user" && Array.isArray(m.files) && m.files.length) o.files = m.files.map(cleanFile);
      return o;
    });
  }
  function checkImage(prompt, quality, size, model) {
    if (typeof prompt !== "string" || !prompt.trim()) return "Describe the picture first.";
    if (prompt.length > LIMITS.promptChars) return "The description is too long (" + LIMITS.promptChars + " characters at most).";
    var im = IMAGES[model || "gpt"];
    if (!im) return "Unknown picture model.";
    if (im.prov === "xai") return !XIMAGE.res[quality] ? "Unknown quality." : !XIMAGE.ASPECT[size] ? "Unknown size." : null;
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
  // one OpenAI Chat Completions stream event (data: {choices:[{delta:{content}, finish_reason}], usage}) -> the same pieces as streamPiece.
  // finish reasons are named like Anthropic's so the page needs one set: length -> max_tokens, content_filter -> refusal.
  var OAI_STOP = { length: "max_tokens", content_filter: "refusal", stop: "end_turn" };
  function streamPieceOpenAI(ev) {
    var d = ev && ev.data;
    if (!d) return null;                                   // "data: [DONE]" is not JSON
    if (d.error) return { t: "error", msg: d.error.message || "The model stopped with an error." };
    var c = d.choices && d.choices[0];
    if (c && c.finish_reason) return { t: "stop", stop: OAI_STOP[c.finish_reason] || c.finish_reason, usage: d.usage || null };
    if (c && c.delta && typeof c.delta.content === "string" && c.delta.content) return { t: "text", v: c.delta.content };
    if (!c && d.usage) return { t: "stop", stop: null, usage: { output_tokens: d.usage.completion_tokens } };
    return null;
  }
  // a token count that is never too low, for when OpenAI's counting endpoint does not answer: 1 token per character
  // (real English is ~4 characters a token) + room for each message's wrapper
  function safeTokens(sys, messages) {
    var n = String(sys || "").length + 16;
    (messages || []).forEach(function (m) {
      n += String(m && m.content || "").length + 8;
      // a count that can only be too high: a picture 3,000 tokens, a PDF 4,000 a page (or 1 token per 15 base64 characters)
      (m && m.files || []).forEach(function (f) { n += f.t === "pdf" ? Math.max((f.pages || 1) * 4000, Math.ceil(f.data.length / 15)) : 3000; });
    });
    return n;
  }

  /* ---------- saving chats (cloud file, Hive backup, file backup) ---------- */
  // a chat = {id, title, at, msgs:[{role, content, ...}]}; only finished messages are kept in a backup
  function cleanChat(c) {
    if (!c || typeof c.id !== "string" || !Array.isArray(c.msgs)) return null;
    var msgs = c.msgs.filter(function (m) { return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && !m.pending; })
      .map(function (m) { var o = { role: m.role, content: m.content }; ["at", "price", "memo", "model", "len", "stop", "acct"].forEach(function (k) { if (m[k] != null) o[k] = m[k]; }); return o; });
    return { id: c.id.slice(0, 40), title: String(c.title || "Chat").slice(0, 120), at: Number(c.at) || 0, msgs: msgs };
  }
  function backup(chats, now) {
    return { app: "mes-ai", v: 1, saved: new Date(now || Date.now()).toISOString(), chats: (chats || []).map(cleanChat).filter(function (c) { return c && c.msgs.length; }) };
  }
  // accepts a backup object / its JSON text -> chats array, or throws
  function readBackup(x) {
    var o = typeof x === "string" ? JSON.parse(x) : x;
    if (!o || o.app !== "mes-ai" || !Array.isArray(o.chats)) throw new Error("That is not a MES AI backup.");
    return o.chats.map(cleanChat).filter(Boolean);
  }
  // merge theirs into mine: a chat both have keeps the copy with more messages (newer on a tie); nothing is deleted
  function mergeChats(mine, theirs) {
    var out = (mine || []).slice(), byId = {}, added = 0, updated = 0;
    out.forEach(function (c, i) { byId[c.id] = i; });
    (theirs || []).forEach(function (c) {
      c = cleanChat(c); if (!c || !c.msgs.length) return;
      if (!(c.id in byId)) { byId[c.id] = out.length; out.push(c); added++; return; }
      var i = byId[c.id], m = out[i];
      if (c.msgs.length > m.msgs.length || (c.msgs.length === m.msgs.length && c.at > m.at)) { out[i] = c; updated++; }
    });
    out.sort(function (a, b) { return b.at - a.at; });
    return { chats: out, added: added, updated: updated };
  }
  function chatMarkdown(c) {
    return "# " + c.title + "\n\n" + c.msgs.map(function (m) { return "## " + (m.role === "user" ? "You" : "MES AI") + "\n\n" + (m.content || ""); }).join("\n\n") + "\n";
  }

  return {
    cleanChat: cleanChat, backup: backup, readBackup: readBackup, mergeChats: mergeChats, chatMarkdown: chatMarkdown,
    MARGIN: MARGIN, HBD_USD: HBD_USD, PRICES_CHECKED: PRICES_CHECKED, PAY_TO: PAY_TO, MEMO_PREFIX: MEMO_PREFIX, MIN_HBD: MIN_HBD,
    PROVIDERS: PROVIDERS, IMAGES: IMAGES, XIMAGE: XIMAGE, systemFor: systemFor, streamPieceOpenAI: streamPieceOpenAI, safeTokens: safeTokens,
    MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL, LENGTHS: LENGTHS, IMAGE: IMAGE, LIMITS: LIMITS, SYSTEM: SYSTEM,
    hbdFromUsd: hbdFromUsd, fmtHbd: fmtHbd, fmtUsd: fmtUsd, estimateTokens: estimateTokens, estimateChatTokens: estimateChatTokens,
    chatQuote: chatQuote, imageQuote: imageQuote, VIDEO: VIDEO, videoQuote: videoQuote, checkVideo: checkVideo, okVideoUrl: okVideoUrl,
    newId: newId, validId: validId, memoFor: memoFor, idFromMemo: idFromMemo, validName: validName,
    checkMessages: checkMessages, cleanMessages: cleanMessages, checkImage: checkImage,
    FILES: FILES, checkFile: checkFile, fileTokens: fileTokens, toAnthropic: toAnthropic, toOpenAIChat: toOpenAIChat, toOpenAIResponses: toOpenAIResponses,
    parseAmount: parseAmount, findPayment: findPayment, sseSplit: sseSplit, streamPiece: streamPiece
  };
});
