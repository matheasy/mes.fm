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
  var PRICES_CHECKED = "2026-11-23";
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
      inUsd: 8, outUsd: 40, effort: "medium", caps: { short: 3000, medium: 10000, long: 30000 }, thinks: true },
    /* cheap models (2026-11-21) through OpenRouter (one key, provider prices passed through; openrouter.ai/api/v1/models, checked 2026-11-21).
       inUsd / outUsd = the most we let OpenRouter charge: the request sends them as provider.max_price, so a pricier provider is never
       used and the quote always covers the bill (DeepSeek's own peak price is 2x its off-peak one). text: true = reads text only.
       free: true = these can be used for the free daily messages (FREE below). */
    dsflash: { prov: "openrouter", id: "deepseek/deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash", blurb: "Very cheap and quick, good at code and math. Text only.",
      inUsd: 0.3, outUsd: 1.2, caps: { short: 1500, medium: 5000, long: 16000 }, text: true, free: true },
    qwen: { prov: "openrouter", id: "qwen/qwen3.8-flash", name: "Qwen 3.8 Flash", blurb: "Very cheap and quick, good in many languages. Text only.",
      inUsd: 0.2, outUsd: 0.6, caps: { short: 1500, medium: 5000, long: 16000 }, text: true, free: true },
    llama: { prov: "openrouter", id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", blurb: "Meta's open model: cheap, plain answers. Text only.",
      inUsd: 0.4, outUsd: 1.2, caps: { short: 1500, medium: 5000, long: 16000 }, text: true, free: true },
    dspro: { prov: "openrouter", id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", blurb: "DeepSeek's stronger model for harder questions, still far cheaper than the big ones. Text only.",
      inUsd: 1.4, outUsd: 4, caps: { short: 3000, medium: 10000, long: 30000 }, thinks: true, text: true },
    /* On this device (2026-11-22): FREE, runs in the visitor's own browser with WebLLM (LOCAL below) on the graphics chip (WebGPU).
       Nothing is sent to mes.fm or to any AI company, no Hive login, no payment; never priced and refused by the server.
       id = WebLLM prebuilt model id (f16 build: needs WebGPU "shader-f16"), id32 = the f32 build for GPUs without it.
       mb = download size in MB (the weights, the same for both builds), vram / vram32 = graphics memory WebLLM says each build needs (MB).
       caps = answer length in tokens (the model's whole memory is LOCAL.ctx tokens, so answers stay short). */
    local1b: { prov: "local", id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", id32: "Llama-3.2-1B-Instruct-q4f32_1-MLC", name: "Llama 3.2 1B",
      blurb: "Free and private: runs on your own computer, nothing is sent anywhere. The fastest and smallest, much weaker than the paid models. Text only.",
      mb: 700, vram: 879, vram32: 1129, inUsd: 0, outUsd: 0, caps: { short: 400, medium: 900, long: 1600 }, text: true },
    localqwen: { prov: "local", id: "Qwen3-1.7B-q4f16_1-MLC", id32: "Qwen3-1.7B-q4f32_1-MLC", name: "Qwen3 1.7B",
      blurb: "Free and private: runs on your own computer, nothing is sent anywhere. A bit stronger and good in many languages, still much weaker than the paid models. Text only.",
      mb: 970, vram: 2037, vram32: 2635, inUsd: 0, outUsd: 0, caps: { short: 400, medium: 900, long: 1600 }, text: true },
    local3b: { prov: "local", id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", id32: "Llama-3.2-3B-Instruct-q4f32_1-MLC", name: "Llama 3.2 3B",
      blurb: "Free and private: runs on your own computer, nothing is sent anywhere. The best of the three, for strong computers; still weaker than the paid models. Text only.",
      mb: 1810, vram: 2264, vram32: 2952, inUsd: 0, outUsd: 0, caps: { short: 400, medium: 900, long: 1600 }, text: true }
  };
  /* WebLLM (MIT, github.com/mlc-ai/web-llm): one self-contained ES module, loaded with import() only when a local model is picked.
     Pinned; the models come from huggingface.co/mlc-ai and are kept by the browser (Cache API) after the first download. */
  var LOCAL = { ver: "0.2.87", url: "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.87/lib/index.js", ctx: 4096 };
  var LOCAL_WHY = {
    nogpu: "This browser has no WebGPU, which is needed to run AI on your own device. Chrome, Edge or Brave on a computer have it (Safari 26 and newer too).",
    noadapter: "WebGPU is there but found no usable graphics chip (it may be switched off, or the computer is too old).",
    lowmem: "This device does not have enough memory for this model. Try a smaller one.",
    small: "This graphics chip is too small for AI models."
  };
  function isLocal(k) { return !!(MODELS[k] && MODELS[k].prov === "local"); }
  /* can model k run here? env = {gpu: navigator.gpu present, adapter: got one, f16: "shader-f16" feature, maxBuf: adapter maxBufferSize (bytes),
     mem: navigator.deviceMemory (GB, rounded down, at most 8, or null)} -> {ok, id, vram, why (LOCAL_WHY key), f32} */
  function localCheck(k, env) {
    var m = MODELS[k]; env = env || {};
    if (!m || m.prov !== "local") return { ok: false, why: "nogpu" };
    if (!env.gpu) return { ok: false, why: "nogpu" };
    if (!env.adapter) return { ok: false, why: "noadapter" };
    if (env.maxBuf && env.maxBuf < 128 * 1048576) return { ok: false, why: "small" };
    var f32 = !env.f16, vram = f32 ? m.vram32 : m.vram;
    // deviceMemory is the whole computer's memory: the model (plus the browser) should fit in about half of it
    if (env.mem && env.mem * 1024 * 0.55 < vram) return { ok: false, why: "lowmem", vram: vram };
    return { ok: true, id: f32 ? m.id32 : m.id, vram: vram, f32: f32 };
  }
  /* fit a chat into the local model's memory (LOCAL.ctx tokens incl. the answer): drop the oldest exchanges first.
     -> {messages, dropped (messages left out)} or null when even the last message alone is too long */
  function localTrim(sys, messages, maxOut) {
    var budget = LOCAL.ctx - (maxOut || 0) - estimateTokens(sys) - 32, msgs = (messages || []).slice(), dropped = 0;
    var size = function (l) { return l.reduce(function (n, m) { return n + estimateTokens(m.content) + 4; }, 0); };
    while (msgs.length > 1 && size(msgs) > budget) { msgs.splice(0, msgs.length > 2 ? 2 : 1); dropped += 2; }
    if (!msgs.length || size(msgs) > budget) return null;
    if (msgs[0].role !== "user") { msgs.shift(); dropped++; }
    return { messages: msgs, dropped: Math.min(dropped, (messages || []).length) };
  }
  // small models may write their thinking in <think>...</think>: -> {text (without it), think: still inside an open block}
  function splitThink(t) {
    t = String(t || "");
    var out = t.replace(/<think>[\s\S]*?<\/think>\s*/g, ""), open = out.indexOf("<think>");
    if (open >= 0) return { text: out.slice(0, open), think: true };
    return { text: out.replace(/^\s+/, ""), think: false };
  }
  /* free daily messages (2026-11-21): FREE.perDay messages a day per Hive account on the models marked free, always a Short answer
     (FREE.maxOut tokens) and a chat of at most FREE.maxIn tokens (counted the safe way, 1 token a character). The account is proven once a
     day with a Keychain signature of freeMessage(acct, day) (no payment, no fee). All free messages together stop at FREE.usdPerDay of
     cost a day (env AI_FREE_USD overrides it); each one first reserves its worst case. Paid from ad and Premium income. */
  var FREE = { perDay: 10, perIp: 30, maxIn: 12000, maxOut: 1500, usdPerDay: 2,
    // free daily pictures (2026-11-23): pics a day per Hive account (picsIp per network) on the model with a freeId (Recraft V4.1 Flash,
    // OpenRouter's free copy, 0 USD to us, so they never touch usdPerDay). Same once-a-day signature as the free messages.
    pics: 3, picsIp: 9, picModel: "recraft" };
  function freeMessage(acct, day) { return "mes.fm/ai free messages for @" + acct + " on " + day; }
  function utcDay(ms) { return new Date(ms == null ? Date.now() : ms).toISOString().slice(0, 10); }
  // a free daily picture: the free model, no reference pictures, 1k
  function freePicOk(model, quality, nRefs) { var im = IMAGES[model]; return !!(im && im.freeId && model === FREE.picModel && quality === "1k" && !nRefs); }
  function freeWorstUsd(modelKey) { var m = MODELS[modelKey]; return m && m.free ? (FREE.maxIn * m.inUsd + FREE.maxOut * m.outUsd) / 1e6 : 0; }
  var PROVIDERS = { anthropic: "Anthropic", openai: "OpenAI", xai: "xAI", openrouter: "OpenRouter", local: "WebLLM" };
  var DEFAULT_MODEL = "sonnet";
  var LENGTHS = { short: "Short", medium: "Medium", long: "Long" };

  // OpenAI gpt-image-2: USD per image by quality and size (OpenAI's image guide), + prompt text at $5 / 1M tokens.
  var IMAGE = { id: "gpt-image-2", name: "GPT Image 2", textInUsd: 5, imageInUsd: 8,
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
  /* cheap pictures through OpenRouter's Image API (POST /api/v1/images, 2026-11-23). Prices = OpenRouter's own endpoint records
   * (GET /api/v1/images/models/<id>/endpoints, checked 2026-11-23): a fixed price per picture, so the bill is known before the call.
   * res = USD per picture by resolution ("1k" / "2k" = OpenRouter's "1K" / "2K"); refUsd = per reference picture (Seedream lists 0;
   * FLUX 3 Klein lists no input price at all, so 0.003 is our safe guess: CHECK the first real bills). orProv = the provider slug the
   * request is pinned to (provider.only, no fallbacks), so OpenRouter can never route to a dearer one.
   * freeId = OpenRouter's free copy of the same model (0 USD): the free daily pictures (FREE.pics) use it. */
  var IMAGES = {
    klein: { prov: "openrouter", id: "black-forest-labs/flux-3-image-klein", orProv: "black-forest-labs", name: "FLUX 3 Klein (cheapest)", res: { "1k": 0.009, "2k": 0.014 }, refUsd: 0.003 },
    recraft: { prov: "openrouter", id: "recraft/recraft-v4.1-flash-v2", orProv: "recraft", freeId: "recraft/recraft-v4.1-flash-v2:free", name: "Recraft V4.1 Flash (free a few a day)", res: { "1k": 0.007 }, refUsd: 0 },
    seedream: { prov: "openrouter", id: "bytedance-seed/seedream-5-0-flash", orProv: "seed", name: "Seedream 5.0 Flash", res: { "1k": 0.018, "2k": 0.018 }, refUsd: 0 },
    gpt: { prov: "openai", id: "gpt-image-2", name: "GPT Image 2 (ChatGPT)" },
    grok: { prov: "xai", id: "grok-imagine-image", name: "Grok Imagine", usd: 0.02 },
    // grok2: OpenRouter's record for the same xAI model (2026-11-23) prices it by quality too: low 1k $0.04 / 2k $0.06, medium 1k $0.06 /
    // 2k $0.08, input picture $0.01. We send no quality, so we price it as medium to be safe (0.06, x1.5 for 2k = 0.09).
    grok2: { prov: "xai", id: "grok-imagine-image-2.0", name: "Grok Imagine 2.0", usd: 0.06 }
  };
  var DEFAULT_IMAGE = "gpt";
  var XIMAGE = { res: { "1k": "Standard (1k)", "2k": "Sharp (2k)" }, RES_X: { "1k": 1, "2k": 1.5 },
    ASPECT: { "1024x1024": "1:1", "1536x1024": "3:2", "1024x1536": "2:3" } };

  // Video: usd = USD per second of video by resolution. xAI Grok Imagine (direct): the per-resolution rates OpenRouter publishes for the
  // same xAI models (GET /api/v1/videos/models pricing_skus, checked 2026-11-23; OpenRouter passes provider prices through). Until then we
  // charged a 480p rate x a guessed RES_X, which was BELOW the real 720p / 1080p cost (Lite 1080p is $0.14/s, not $0.045/s).
  // OpenRouter models (POST /api/v1/videos, 2026-11-23):
  //   Veo 3.1 Lite: $0.05/s 720p, $0.08/s 1080p with sound (cheaper without; we always quote the with-sound rate), lengths 4 / 6 / 8 s only.
  //   Seedance 2.0 Mini: billed per "video token" ($3.5 per 1M); tokens = width x height x 24 fps / 1024 a second, so 854x480 = $0.0336/s and
  //   1280x720 = $0.0756/s. The token count is OpenRouter's formula as we understand it: usd here adds ~10% room (0.037 / 0.084): CHECK the
  //   first real bills (usage.cost). prov = which key is needed; durations = lengths that model takes (default VIDEO.durations).
  var VIDEO = { name: "Grok Imagine",
    models: {
      lite: { prov: "xai", id: "grok-imagine-video-1.5-lite", name: "Grok Lite (cheapest)", usd: { "480p": 0.02, "720p": 0.03, "1080p": 0.14 } },
      std: { prov: "xai", id: "grok-imagine-video", name: "Grok Standard", usd: { "480p": 0.05, "720p": 0.07 } },
      best: { prov: "xai", id: "grok-imagine-video-1.5", name: "Grok Best (1.5)", usd: { "480p": 0.08, "720p": 0.14, "1080p": 0.25 } },
      seedance: { prov: "openrouter", id: "bytedance/seedance-2.0-mini", orProv: null, name: "Seedance 2.0 Mini", usd: { "480p": 0.037, "720p": 0.084 } },
      veo: { prov: "openrouter", id: "google/veo-3.1-lite", orProv: null, name: "Google Veo 3.1 Lite", usd: { "720p": 0.05, "1080p": 0.08 }, durations: [4, 6, 8] }
    },
    res: ["480p", "720p", "1080p"],
    durations: [5, 8, 10, 15],
    maxPromptChars: 4000 };
  function videoRes(model) { var m = VIDEO.models[model]; return m ? VIDEO.res.filter(function (r) { return m.usd[r] != null; }) : []; }
  function videoDurations(model) { var m = VIDEO.models[model]; return (m && m.durations) || VIDEO.durations; }

  /* Reference pictures (2026-11-21): pictures sent with a picture request (change / combine them) or as a video's first frame.
   * OpenAI POST /v1/images/edits (JSON, images: [{image_url: data URL}], up to 16; gpt-image-2 reads every input at high fidelity).
   *   Input images cost $8 / 1M image tokens; OpenAI publishes no token count per image for gpt-image-2 (gpt-image-1 at high fidelity was
   *   about 4,200-6,300 + a few hundred), so each picture is priced as REFS.gptTokens tokens, on the safe side: CHECK against real bills.
   * xAI POST /v1/images/edits (JSON, image: {url} or images: [{url}] up to 5, named <IMAGE_0>, <IMAGE_1> in the prompt) on grok-imagine-image-2.0
   *   (edits on the cheapest grok-imagine-image are not documented, so it takes none). xAI bills the input pictures too but publishes no
   *   price: each one is priced as one more output picture (our safe guess: CHECK it).
   * xAI video: image: {url} = the first frame (all three models). No extra price is published: REFS.videoUsd per picture is our guess. */
  var REFS = { side: 1536, total: 3000000, gptTokens: 8000, videoUsd: 0.02,
    max: { image: { gpt: 6, grok: 0, grok2: 5, klein: 4, recraft: 0, seedream: 6 }, video: { lite: 1, std: 1, best: 1, seedance: 1, veo: 1 } } };
  function maxRefs(kind, model) { var t = REFS.max[kind === "video" ? "video" : "image"]; return (t && t[model]) || 0; }
  function checkRefs(refs, max) {
    if (refs == null) return null;
    if (!Array.isArray(refs)) return "Bad picture.";
    if (refs.length > (max || 0)) return max ? (max === 1 ? "One picture at most with this model." : "At most " + max + " pictures with this model.") : "This model can't take pictures. Pick another model.";
    var n = 0;
    for (var i = 0; i < refs.length; i++) {
      var f = refs[i];
      if (!f || typeof f.data !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(f.data) || f.data.length < 8) return "Bad picture.";
      if (["image/jpeg", "image/png", "image/webp"].indexOf(f.mt) < 0) return "Pictures must be JPEG, PNG or WebP.";
      n += f.data.length;
    }
    if (n > REFS.total) return "The pictures are too big together. Use fewer or smaller pictures.";
    return null;
  }
  function cleanRefs(refs) { return (refs || []).map(function (f) { return { mt: f.mt, data: f.data }; }); }
  function dataUrl(f) { return "data:" + f.mt + ";base64," + f.data; }
  // the person writes "picture 1", "picture 2"; xAI wants <IMAGE_0>, <IMAGE_1>: a short key in front of the prompt tells the model which is which
  function xaiPrompt(prompt, n) {
    if (!n) return prompt;
    var k = []; for (var i = 0; i < n; i++) k.push("picture " + (i + 1) + " = <IMAGE_" + i + ">");
    return (n === 1 ? "The input picture is <IMAGE_0> (picture 1). " : "Input pictures: " + k.join(", ") + ". ") + prompt;
  }
  /* Does a chat message ask for a picture or a video? ("make a picture of ...", "draw ...", "generate an image of ...")
   * -> {kind: "image"|"video", prompt} or null. Only clear requests at the start of the message count, so questions ABOUT pictures stay in the chat. */
  var MEDIA_NOUN = "(?:picture|pic|image|photo|photograph|drawing|illustration|painting|sketch|logo|icon|poster|wallpaper|portrait|cartoon|meme|thumbnail|artwork|render)";
  var WANT_RE = new RegExp("^\\s*(?:(?:hey|hi|ok|okay)[,!]?\\s+)?(?:(?:can|could|would|will)\\s+you\\s+|please\\s+|i\\s+(?:want|need|would\\s+like)\\s+(?:you\\s+to\\s+)?)?(?:please\\s+)?" +
    "(?:make|create|generate|draw|paint|design|render|produce|give\\s+me|show\\s+me|sketch|animate)\\s+(?:me\\s+|us\\s+)?(?:a|an|the|some|\\d+)?\\s*" +
    "(?:(?:\\w+[- ]){0,3})?(" + MEDIA_NOUN + "s?|video|clip|animation|gif)\\b\\s*(?:of|showing|with|for|that|where|:)?\\s*", "i");
  var DRAW_RE = /^\s*(?:please\s+|can you\s+|could you\s+)?(?:draw|paint|sketch)\s+(?:me\s+)?(?!up\b|on\b|from\b|a\s+conclusion|conclusions|attention|the\s+line)(.{3,})/i;
  function wantsMedia(text) {
    var t = String(text || "").trim();
    if (!t || t.length > 2000 || /^\s*(what|why|how|who|which|when|where|is|are|does|do|explain)\b/i.test(t)) return null;
    var m = WANT_RE.exec(t);
    if (m) {
      var video = /^(video|clip|animation|gif)$/i.test(m[1]) || /^\s*\S*\s*animate\b/i.test(t);
      // the whole request goes on (picture models read "Make a cartoon picture of ..." well; cutting it lost words like "cartoon"),
      // minus a polite opening and a trailing "?"
      return { kind: video ? "video" : "image", prompt: t.replace(/^\s*(?:(?:hey|hi|ok|okay)[,!]?\s+)?(?:(?:can|could|would|will)\s+you\s+|please\s+)+/i, "").replace(/\?+$/, "").trim() };
    }
    var d = DRAW_RE.exec(t);
    if (d && t.length < 400) return { kind: "image", prompt: t.replace(/^\s*(?:(?:can|could)\s+you\s+|please\s+)+/i, "").replace(/\?+$/, "").trim() };
    return null;
  }

  var LIMITS = { msgChars: 60000, totalChars: 300000, turns: 200, promptChars: 4000, inTokens: 150000 };
  // Files sent with a message (pictures and PDFs; text files are added to the message text by the page). The whole
  // request must stay under Vercel's 4.5 MB body limit, so all files of one request together are capped at FILES.total
  // base64 characters (the page drops older messages' files first). Kept in this browser only.
  var FILES = { perMsg: 8, total: 3200000, img: ["image/jpeg", "image/png", "image/webp", "image/gif"], pdf: "application/pdf",
    imgTokens: 1600, pdfPageTokens: 2500 };

  var SYSTEM = "You are MES AI, the AI assistant on mes.fm (Math Easy Solutions), running on Anthropic's Claude. " +
    "Help with coding, research, math, writing and everyday questions. Be clear and accurate; say when you are unsure. " +
    "Use Markdown: headings only when they help, lists, and fenced code blocks with a language name. " +
    "When you mention a website, page, tool, paper or source, give the full https:// address as a Markdown link, e.g. [Wikipedia: Recursion](https://en.wikipedia.org/wiki/Recursion); for mes.fm tools use https://mes.fm/<page>. Only give addresses you are confident exist (well-known, stable pages); say so when you are not sure. " +
    "Write math in LaTeX: $...$ inline and $$...$$ on its own line for displayed equations (never for money amounts). Put tabular data in Markdown tables. When a chart helps, add a fenced code block with the language chart holding JSON like {\"type\":\"bar\",\"title\":\"...\",\"labels\":[\"A\",\"B\"],\"series\":[{\"name\":\"...\",\"data\":[1,2]}]} (type bar, line or pie); the page draws it. Each answer has a length limit, so get to the point and finish your answer within it. " +
    "Refuse requests for clearly illegal or seriously harmful content.";
  // the same instructions, naming the company that really runs the chosen model
  // lang = the language page the person is on (/ai-es ...): answer in that language unless they write in another one.
  var LANGS = { es: "Spanish", "pt-BR": "Brazilian Portuguese", fr: "French", de: "German", tr: "Turkish", ru: "Russian", "zh-CN": "Simplified Chinese",
    hi: "Hindi", id: "Indonesian", vi: "Vietnamese", ar: "Arabic", fa: "Persian (Farsi)" };
  function cleanLang(l) { return typeof l === "string" && Object.prototype.hasOwnProperty.call(LANGS, l) ? l : "en"; }
  // the local models have a small memory (LOCAL.ctx tokens), so they get a short version
  var LOCAL_SYSTEM = "You are MES AI, a small AI model running privately on the user's own device inside mes.fm (Math Easy Solutions). " +
    "Be helpful, clear and brief. Say when you are not sure. Use Markdown and fenced code blocks. Use LaTeX ($...$) only for real math formulas, never around plain words or names.";
  function systemFor(modelKey, lang) {
    var m = MODELS[modelKey], s = m && m.prov === "local" ? LOCAL_SYSTEM.replace("You are MES AI", "You are MES AI (" + m.name + ")") : m && m.prov === "openai" ? SYSTEM.replace("running on Anthropic's Claude", "running on OpenAI's GPT")
      : m && m.prov === "openrouter" ? SYSTEM.replace("running on Anthropic's Claude", "running on " + m.name) : SYSTEM;
    lang = cleanLang(lang);
    return lang === "en" ? s : s + " The person is using the " + LANGS[lang] + " version of this page: answer in " + LANGS[lang] + " by default; if they write in another language, answer in the language they write in.";
  }

  /* ---------- numbers ---------- */
  /* what one dollar of API use really costs us (2026-11-21, owner's decision): the 12% sales tax (B.C. GST + PST) on every company's credits,
     and on OpenRouter also its 5.5% fee on credit purchases (tax charged on credits + fee: 1.055 x 1.12 = 1.18, rounded up). So
     price = API cost x FEES[company] x MARGIN. Change here if the tax or a fee changes (or if GST is claimed back). */
  var FEES = { anthropic: 1.12, openai: 1.12, xai: 1.12, openrouter: 1.19 };
  function realUsd(usd, prov) { return (Number(usd) || 0) * (prov ? (FEES[prov] || 1.12) : 1); }
  function hbdFromUsd(usd, prov) {
    var h = realUsd(usd, prov) * MARGIN / HBD_USD;
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
    var n = estimateTokens(SYSTEM) + 50;
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
    var hbd = hbdFromUsd(usd, m.prov);
    return { kind: "chat", model: modelKey, modelId: m.id, len: len, inTokens: inTokens, maxOut: cap, costUsd: usd, hbd: hbd, price: fmtHbd(hbd) };
  }
  /* ---------- cost hints (2026-11-20): only hints; the server's quote is the only price anyone pays ---------- */
  // what a chat cost so far (sum of the HBD prices paid on its messages, counted in thousandths so no float drift) and its history size
  // in tokens, roughly (characters / 4), plus a rough price for the next message at that size
  function chatCostSoFar(chat, modelKey, len) {
    var msgs = (chat && Array.isArray(chat.msgs)) ? chat.msgs : [], milli = 0, paid = 0, chars = 0;
    msgs.forEach(function (m) {
      if (!m) return;
      if (m.role === "user" && m.price != null && isFinite(parseFloat(m.price))) { milli += Math.round(parseFloat(m.price) * 1000); paid++; }
      if (!m.error && typeof m.content === "string") chars += m.content.length;
    });
    var tokens = Math.ceil(chars / 4), next = MODELS[modelKey] && MODELS[modelKey].caps[len] ? chatQuote(modelKey, tokens, len) : null;
    return { hbd: milli / 1000, price: fmtHbd(milli / 1000), paid: paid, tokens: tokens, next: next };
  }
  // the "Typical costs" table: rows = models, columns = history sizes in tokens (one answer of length len each)
  function typicalCosts(models, sizes, len) {
    models = models || ["sonnet", "opus"]; sizes = sizes || [5000, 25000, 50000]; len = len || "medium";
    return models.filter(function (k) { return MODELS[k]; }).map(function (k) {
      return { model: k, name: MODELS[k].name, cells: sizes.map(function (t) { var q = chatQuote(k, t, len); return { tokens: t, hbd: q.hbd, price: q.price }; }) };
    });
  }
  // a whole chat of n messages whose history grows evenly to maxTokens: the sum of each message's price
  function sessionCost(modelKey, len, n, maxTokens) {
    var milli = 0;
    for (var i = 1; i <= n; i++) milli += Math.round(chatQuote(modelKey, maxTokens * i / n, len).hbd * 1000);
    return { hbd: milli / 1000, price: fmtHbd(milli / 1000) };
  }
  function imageQuote(quality, size, promptTokens, model, nRefs) {
    model = model || "gpt";
    nRefs = Math.max(0, Math.floor(Number(nRefs) || 0));
    var im = IMAGES[model];
    if (!im) throw new Error("Unknown picture model");
    if (im.res) {
      if (im.res[quality] == null || !XIMAGE.ASPECT[size]) throw new Error("Unknown image quality or size");
      var ou = im.res[quality] + nRefs * (im.refUsd || 0), oh = hbdFromUsd(ou, im.prov);
      return { kind: "image", model: model, modelId: im.id, quality: quality, size: size, aspect: XIMAGE.ASPECT[size], inTokens: 0, refs: nRefs, costUsd: ou, hbd: oh, price: fmtHbd(oh) };
    }
    if (im.prov === "xai") {
      if (!XIMAGE.RES_X[quality] || !XIMAGE.ASPECT[size]) throw new Error("Unknown image quality or size");
      var xu = im.usd * XIMAGE.RES_X[quality] + nRefs * im.usd, xh = hbdFromUsd(xu, "xai");
      return { kind: "image", model: model, modelId: im.id, quality: quality, size: size, aspect: XIMAGE.ASPECT[size], inTokens: 0, refs: nRefs, costUsd: xu, hbd: xh, price: fmtHbd(xh) };
    }
    var row = IMAGE.perImage[quality];
    if (!row || row[size] == null) throw new Error("Unknown image quality or size");
    var t = Math.max(0, Math.ceil(Number(promptTokens) || 0));
    var usd = row[size] + t * IMAGE.textInUsd / 1e6 + nRefs * REFS.gptTokens * IMAGE.imageInUsd / 1e6;
    var hbd = hbdFromUsd(usd, "openai");
    return { kind: "image", model: "gpt", modelId: IMAGE.id, quality: quality, size: size, inTokens: t, refs: nRefs, costUsd: usd, hbd: hbd, price: fmtHbd(hbd) };
  }

  function videoQuote(model, seconds, res, nRefs) {
    var m = VIDEO.models[model];
    if (!m) throw new Error("Unknown video model");
    var d = Math.round(Number(seconds));
    if (videoDurations(model).indexOf(d) < 0) throw new Error("Unknown video length");
    if (m.usd[res] == null) throw new Error("That model can't make " + res + " video");
    nRefs = Math.max(0, Math.floor(Number(nRefs) || 0));
    var usd = m.usd[res] * d + nRefs * REFS.videoUsd;
    var hbd = hbdFromUsd(usd, m.prov);
    return { kind: "video", model: model, modelId: m.id, seconds: d, res: res, refs: nRefs, costUsd: usd, hbd: hbd, price: fmtHbd(hbd) };
  }
  function checkVideo(prompt, model, seconds, res, hasPic) {
    if (typeof prompt !== "string" || (!prompt.trim() && !hasPic)) return "Describe the video first.";
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
  // a text-only model gets no pictures / PDFs
  function checkTextOnly(modelKey, messages) {
    var m = MODELS[modelKey];
    if (!m || !m.text) return null;
    return (messages || []).some(function (x) { return x && x.files && x.files.length; }) ? "This model reads text only. Pick Claude or ChatGPT for pictures and PDFs, or remove the files." : null;
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
    if (im.res) return im.res[quality] == null ? "Unknown quality." : !XIMAGE.ASPECT[size] ? "Unknown size." : null;
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
    if (!c && d.usage) return { t: "stop", stop: null, usage: { output_tokens: d.usage.completion_tokens, cost: d.usage.cost } };  // cost: OpenRouter, USD
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
    var o = { id: c.id.slice(0, 40), title: String(c.title || "Chat").slice(0, 120), at: Number(c.at) || 0, msgs: msgs };
    // chat-list extras (2026-11-20): pinned on top, a folder name, and when they / the title were last changed (mt: newest wins in a merge)
    if (c.pin === true) o.pin = true;
    var f = cleanFolder(c.folder); if (f) o.folder = f;
    if (Number(c.mt) > 0) o.mt = Number(c.mt);
    return o;
  }
  function cleanFolder(f) { return typeof f === "string" ? f.replace(/[\u0000-\u001f<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : ""; }
  // folders = the folder names (so an empty folder survives a backup too)
  function backup(chats, now, folders) {
    var o = { app: "mes-ai", v: 1, saved: new Date(now || Date.now()).toISOString(), chats: (chats || []).map(cleanChat).filter(function (c) { return c && c.msgs.length; }) };
    var fl = readFolders({ folders: folders });
    o.chats.forEach(function (c) { if (c.folder && fl.indexOf(c.folder) < 0) fl.push(c.folder); });
    if (fl.length) o.folders = fl;
    return o;
  }
  // the folder names in a backup (older backups have none): an array of clean, unique names
  function readFolders(x) {
    var o = typeof x === "string" ? (function () { try { return JSON.parse(x); } catch (e) { return null; } })() : x, out = [];
    ((o && Array.isArray(o.folders)) ? o.folders : []).forEach(function (n) { n = cleanFolder(n); if (n && out.indexOf(n) < 0 && out.length < 200) out.push(n); });
    return out;
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
      var i = byId[c.id], m = out[i], theirs = c.msgs.length > m.msgs.length || (c.msgs.length === m.msgs.length && c.at > m.at);
      var keep = theirs ? c : m, meta = (c.mt || 0) > (m.mt || 0) ? c : (m.mt || 0) > (c.mt || 0) ? m : keep;
      if (theirs || meta !== keep) {
        var n = {}; Object.keys(keep).forEach(function (k) { n[k] = keep[k]; });
        n.title = meta.title; delete n.pin; delete n.folder; delete n.mt;
        if (meta.pin) n.pin = true; if (meta.folder) n.folder = meta.folder; if (meta.mt) n.mt = meta.mt;
        if (theirs || n.title !== m.title || !!n.pin !== !!m.pin || (n.folder || "") !== (m.folder || "")) { out[i] = n; updated++; }
      }
    });
    out.sort(function (a, b) { return b.at - a.at; });
    return { chats: out, added: added, updated: updated };
  }
  function chatMarkdown(c) {
    return "# " + c.title + "\n\n" + c.msgs.map(function (m) { return "## " + (m.role === "user" ? "You" : "MES AI") + "\n\n" + (m.content || ""); }).join("\n\n") + "\n";
  }

  return {
    cleanChat: cleanChat, cleanFolder: cleanFolder, readFolders: readFolders, backup: backup, readBackup: readBackup, mergeChats: mergeChats, chatMarkdown: chatMarkdown,
    MARGIN: MARGIN, HBD_USD: HBD_USD, PRICES_CHECKED: PRICES_CHECKED, PAY_TO: PAY_TO, MEMO_PREFIX: MEMO_PREFIX, MIN_HBD: MIN_HBD,
    PROVIDERS: PROVIDERS, LANGS: LANGS, cleanLang: cleanLang, IMAGES: IMAGES, DEFAULT_IMAGE: DEFAULT_IMAGE, XIMAGE: XIMAGE, videoRes: videoRes, videoDurations: videoDurations, freePicOk: freePicOk, systemFor: systemFor, streamPieceOpenAI: streamPieceOpenAI, safeTokens: safeTokens,
    MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL, LENGTHS: LENGTHS, IMAGE: IMAGE, LIMITS: LIMITS, SYSTEM: SYSTEM,
    hbdFromUsd: hbdFromUsd, FEES: FEES, realUsd: realUsd, fmtHbd: fmtHbd, fmtUsd: fmtUsd, estimateTokens: estimateTokens, estimateChatTokens: estimateChatTokens,
    chatQuote: chatQuote, chatCostSoFar: chatCostSoFar, typicalCosts: typicalCosts, sessionCost: sessionCost, imageQuote: imageQuote, VIDEO: VIDEO, videoQuote: videoQuote, checkVideo: checkVideo, okVideoUrl: okVideoUrl,
    FREE: FREE, freeMessage: freeMessage, utcDay: utcDay, freeWorstUsd: freeWorstUsd, checkTextOnly: checkTextOnly,
    REFS: REFS, maxRefs: maxRefs, checkRefs: checkRefs, cleanRefs: cleanRefs, dataUrl: dataUrl, xaiPrompt: xaiPrompt, wantsMedia: wantsMedia,
    newId: newId, validId: validId, memoFor: memoFor, idFromMemo: idFromMemo, validName: validName,
    checkMessages: checkMessages, cleanMessages: cleanMessages, checkImage: checkImage,
    FILES: FILES, checkFile: checkFile, fileTokens: fileTokens, toAnthropic: toAnthropic, toOpenAIChat: toOpenAIChat, toOpenAIResponses: toOpenAIResponses,
    parseAmount: parseAmount, findPayment: findPayment, sseSplit: sseSplit, streamPiece: streamPiece,
    LOCAL: LOCAL, LOCAL_WHY: LOCAL_WHY, isLocal: isLocal, localCheck: localCheck, localTrim: localTrim, splitThink: splitThink
  };
});

/* MES AI rich answers (2026-11-20) -- window.MESAIRich, used by app.js (a js_parts file, so it is in the same served script).
 *   render(markdown, {pending}) -> sanitised HTML: Markdown (marked + DOMPurify, loaded by app.js) with LaTeX kept out of Markdown's way:
 *     $...$ / \(...\) inline and $$...$$ / \[...\] display become <span|div class="ai-tex"> typeset later by MathJax 3 (cdnjs, on first use).
 *   enhance(el, {pending}) -> code blocks get a language tag + Copy, ```chart blocks become SVG charts, tables get filter / sort /
 *     column resize / Copy / "Show as chart", math is typeset (not while the answer is still streaming).
 *   openIn(kind, mdText, el) -> "latex" (/latex?tex=), "text" (/text, Markdown), "docx" (/docx, a .docx made here), "pdf" (/pdf, a PDF made here).
 *   Everything shown comes out of DOMPurify or is built with textContent / escaped strings. */
(function () {
	"use strict";
	var T = function (s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
	var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

	/* ---------- math kept out of Markdown ---------- */
	// splits off code (``` fences and `inline`), then pulls math out of the rest; returns {text with tokens, list:[{tex, d}]}
	function pullMath(src) {
		var list = [], tok = function (tex, d) { list.push({ tex: tex.trim(), d: d }); return "MESTEX" + (list.length - 1) + "Z"; };
		var parts = String(src).split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/);
		for (var i = 0; i < parts.length; i += 2) {
			parts[i] = parts[i]
				.replace(/\$\$([\s\S]+?)\$\$/g, function (m, t) { return tok(t, true); })
				.replace(/\\\[([\s\S]+?)\\\]/g, function (m, t) { return tok(t, true); })
				.replace(/\\\(([\s\S]+?)\\\)/g, function (m, t) { return tok(t, false); })
				// $x$ but not money: no space just inside the $ signs, no digit / letter right after the closing $
				.replace(/(^|[^\\$\w])\$(?![\s$])([^$\n]*?[^\s\\$])\$(?![\w$])/g, function (m, pre, t) { return pre + tok(t, false); });
		}
		return { text: parts.join(""), list: list };
	}
	function texHtml(x) { return x.d ? '<div class="ai-tex ai-texd" data-tex="' + esc(x.tex) + '">\\[' + esc(x.tex) + "\\]</div>" : '<span class="ai-tex ai-texi" data-tex="' + esc(x.tex) + '">\\(' + esc(x.tex) + "\\)</span>"; }
	function putMath(html, list) {
		return html.replace(/<p>\s*MESTEX(\d+)Z\s*<\/p>/g, function (m, n) { var x = list[+n]; return x ? texHtml({ tex: x.tex, d: true }) : m; })
			.replace(/MESTEX(\d+)Z/g, function (m, n) { var x = list[+n]; return x ? texHtml(x) : m; });
	}
	function texList(md) { return pullMath(md).list; }

	var MJ = null;
	function mathJax() {
		if (MJ) return MJ;
		if (window.MathJax && window.MathJax.typesetPromise) return (MJ = Promise.resolve(window.MathJax));
		window.MathJax = { tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]], processEscapes: true }, svg: { fontCache: "local" }, options: { processHtmlClass: "ai-tex", ignoreHtmlClass: ".*" }, startup: { typeset: false } };
		MJ = new Promise(function (res, rej) {
			var s = document.createElement("script"); s.async = true; s.src = "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js";
			s.onload = function () { window.MathJax.startup.promise.then(function () { res(window.MathJax); }, rej); };
			s.onerror = function () { MJ = null; rej(new Error("MathJax did not load")); };
			document.head.appendChild(s);
		});
		return MJ;
	}
	function typeset(el) {
		// only shown, finished math: MathJax can't measure a detached / hidden element (NaN sizes), and a streaming answer is retyped each piece
		function pick() { return [].slice.call(el.querySelectorAll(".ai-tex:not(.is-done)")).filter(function (e) { return e.isConnected && e.offsetParent !== null && !e.closest("[data-pending]"); }); }
		var els = pick();
		if (!els.length) return Promise.resolve();
		return mathJax().then(function (M) { els = pick(); return els.length ? M.typesetPromise(els) : null; }).then(function () { els.forEach(function (e) { e.classList.add("is-done"); }); }).catch(function () {});
	}

	/* ---------- Markdown ---------- */
	function render(md, mdOn, plain) {
		var p = pullMath(md), html;
		if (mdOn && window.marked && window.DOMPurify) html = window.DOMPurify.sanitize(window.marked.parse(p.text, { gfm: true, breaks: false }), { ADD_ATTR: ["target"] });
		else html = plain(p.text);
		return putMath(html, p.list);
	}

	/* ---------- numbers in table cells ---------- */
	function num(s) {
		s = String(s).trim().replace(/[\s,\u00a0$€£¥%]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/^−/, "-");
		return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
	}

	/* ---------- charts (plain SVG, drawn at the box's real width) ---------- */
	var PAL = ["#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
	function normSpec(o) {
		if (!o || typeof o !== "object") return null;
		var type = String(o.type || (o.chart && o.chart.type) || "bar").toLowerCase(), labels = o.labels || o.x || o.categories, series = o.series || o.datasets;
		if (o.data && !Array.isArray(o.data) && typeof o.data === "object") { labels = labels || o.data.labels; series = series || o.data.datasets || o.data.series; }
		if (Array.isArray(o.data) && Array.isArray(o.data[0])) {
			var cols = o.columns || [];
			labels = o.data.map(function (r) { return r[0]; });
			series = o.data[0].slice(1).map(function (x, j) { return { name: cols[j + 1] || "", data: o.data.map(function (r) { return r[j + 1]; }) }; });
		} else if (Array.isArray(o.data) && o.data.length && typeof o.data[0] === "object" && o.data[0] && !Array.isArray(o.data[0]) && !series) {
			var keys = Object.keys(o.data[0]), lk = keys.filter(function (k) { return isNaN(num(o.data[0][k])); })[0] || keys[0];
			labels = o.data.map(function (r) { return r[lk]; });
			series = keys.filter(function (k) { return k !== lk; }).map(function (k) { return { name: k, data: o.data.map(function (r) { return r[k]; }) }; });
		} else if (Array.isArray(o.data) && !series) series = [{ name: o.name || "", data: o.data }];
		if (!Array.isArray(series)) return null;
		series = series.slice(0, 8).map(function (s) { return Array.isArray(s) ? { name: "", data: s } : { name: String((s && (s.name || s.label)) || ""), data: ((s && (s.data || s.values)) || []).slice(0, 300).map(function (v) { return typeof v === "number" ? v : num(v); }) }; });
		var n = Math.max.apply(null, series.map(function (s) { return s.data.length; }).concat([0]));
		if (!n) return null;
		labels = (Array.isArray(labels) ? labels : []).slice(0, n).map(String);
		while (labels.length < n) labels.push(String(labels.length + 1));
		type = /pie|doughnut|donut/.test(type) ? "pie" : /line|area|scatter/.test(type) ? "line" : "bar";
		return { type: type, title: String(o.title || (o.options && o.options.title && o.options.title.text) || "").slice(0, 120), labels: labels, series: series };
	}
	function nice(lo, hi) {
		if (lo === hi) { hi = lo + 1; lo = lo - (lo ? 1 : 0); }
		var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 5))), r = span / 5 / step;
		step *= r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1;
		var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
		for (var v = a; v <= b + step / 2; v += step) ticks.push(+v.toPrecision(12));
		return { lo: a, hi: b, ticks: ticks };
	}
	function fmt(v) { var a = Math.abs(v); return a >= 1e9 ? +(v / 1e9).toFixed(2) + "B" : a >= 1e6 ? +(v / 1e6).toFixed(2) + "M" : a >= 1e4 ? +(v / 1e3).toFixed(1) + "k" : String(+v.toPrecision(6)); }
	function chartSvg(sp, W) {
		W = Math.max(260, Math.round(W)); var fs = 12, top = sp.title ? 26 : 8, multi = sp.series.length > 1;
		var H = Math.round(Math.min(380, Math.max(220, W * 0.55))), o = [];
		var t = function (x, y, s, a, extra) { return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + fs + '" fill="currentColor"' + (a ? ' text-anchor="' + a + '"' : "") + (extra || "") + ">" + esc(s) + "</text>"; };
		if (sp.title) o.push('<text x="' + W / 2 + '" y="17" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">' + esc(sp.title) + "</text>");
		if (sp.type === "pie") {
			var d = sp.series[0].data.map(function (v) { return v > 0 ? v : 0; }), sum = d.reduce(function (a, b) { return a + b; }, 0) || 1;
			var legendW = W > 520 ? Math.min(220, W * 0.38) : 0, R = Math.min((W - legendW) / 2, (H - top) / 2) - 10, cx = (W - legendW) / 2, cy = top + (H - top) / 2, a0 = -Math.PI / 2;
			d.forEach(function (v, i) {
				var a1 = a0 + v / sum * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, c = PAL[i % PAL.length], tip = esc(sp.labels[i] + ": " + fmt(v) + " (" + Math.round(v / sum * 1000) / 10 + "%)");
				if (v / sum > 0.9999) o.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + c + '"><title>' + tip + "</title></circle>");
				else if (v > 0) o.push('<path d="M' + cx + " " + cy + "L" + (cx + R * Math.cos(a0)).toFixed(1) + " " + (cy + R * Math.sin(a0)).toFixed(1) + "A" + R + " " + R + " 0 " + big + " 1 " + (cx + R * Math.cos(a1)).toFixed(1) + " " + (cy + R * Math.sin(a1)).toFixed(1) + 'Z" fill="' + c + '" stroke="var(--ai-bot,#fff)" stroke-width="1.5"><title>' + tip + "</title></path>");
				a0 = a1;
			});
			var ly = legendW ? top + 10 : H + 6, lx = legendW ? W - legendW + 8 : 8;
			if (!legendW) H += Math.ceil(d.length / Math.max(1, Math.floor(W / 150))) * 18 + 6;
			d.forEach(function (v, i) {
				var x = legendW ? lx : 8 + (i % Math.max(1, Math.floor(W / 150))) * 150, y = legendW ? ly + i * 18 : ly + Math.floor(i / Math.max(1, Math.floor(W / 150))) * 18;
				o.push('<rect x="' + x + '" y="' + (y - 10) + '" width="11" height="11" rx="2" fill="' + PAL[i % PAL.length] + '"/>' + t(x + 16, y, (sp.labels[i] + " " + Math.round(v / sum * 1000) / 10 + "%").slice(0, 30)));
			});
			return '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(sp.title || "Chart") + '">' + o.join("") + "</svg>";
		}
		var all = []; sp.series.forEach(function (s) { s.data.forEach(function (v) { if (isFinite(v)) all.push(v); }); });
		if (!all.length) return "";
		var sc = nice(Math.min(0, Math.min.apply(null, all)), Math.max(0, Math.max.apply(null, all)));
		var lw = Math.max.apply(null, sc.ticks.map(function (v) { return fmt(v).length; })) * 7 + 12;
		if (multi) top += 22;
		var n = sp.labels.length, l = lw, r = 12, pw = W - l - r, maxLab = Math.max.apply(null, sp.labels.map(function (s) { return s.length; })), slot = pw / n;
		var rot = maxLab * 6.5 > slot * 0.95, b = rot ? Math.min(90, maxLab * 5 + 20) : 28, ph = H - top - b;
		var y = function (v) { return top + ph - (v - sc.lo) / (sc.hi - sc.lo) * ph; };
		sc.ticks.forEach(function (v) { o.push('<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="currentColor" stroke-opacity="' + (v === 0 ? 0.45 : 0.13) + '"/>' + t(l - 6, y(v) + 4, fmt(v), "end")); });
		var every = Math.max(1, Math.ceil((rot ? 14 : maxLab * 6.5 + 8) / slot));
		sp.labels.forEach(function (s, i) {
			if (i % every) return;
			var x = l + slot * (i + 0.5), lab = s.length > 24 ? s.slice(0, 23) + "…" : s;
			o.push(rot ? t(x, top + ph + 12, lab, "end", ' transform="rotate(-38 ' + x.toFixed(1) + " " + (top + ph + 12) + ')"') : t(x, top + ph + 17, lab, "middle"));
		});
		if (sp.type === "bar") {
			var gw = slot * 0.78, bw = gw / sp.series.length;
			sp.series.forEach(function (s, k) {
				s.data.forEach(function (v, i) {
					if (!isFinite(v)) return;
					var x = l + slot * i + (slot - gw) / 2 + bw * k, y0 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
					o.push('<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + Math.max(0.5, h).toFixed(1) + '" rx="2" fill="' + PAL[k % PAL.length] + '"><title>' + esc((s.name ? s.name + ", " : "") + sp.labels[i] + ": " + fmt(v)) + "</title></rect>");
				});
			});
		} else {
			sp.series.forEach(function (s, k) {
				var pts = [], c = PAL[k % PAL.length];
				s.data.forEach(function (v, i) { if (isFinite(v)) pts.push([l + slot * (i + 0.5), y(v), v, i]); });
				o.push('<polyline fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>');
				if (pts.length <= 80) pts.forEach(function (p) { o.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="' + c + '"><title>' + esc((s.name ? s.name + ", " : "") + sp.labels[p[3]] + ": " + fmt(p[2])) + "</title></circle>"); });
			});
		}
		if (multi) {
			var x = l;
			sp.series.forEach(function (s, k) {
				var nm = (s.name || T("Series {n}", { n: k + 1 })).slice(0, 24);
				o.push('<rect x="' + x + '" y="' + (top - 18) + '" width="11" height="11" rx="2" fill="' + PAL[k % PAL.length] + '"/>' + t(x + 15, top - 8, nm));
				x += nm.length * 7 + 30;
			});
		}
		return '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(sp.title || "Chart") + '">' + o.join("") + "</svg>";
	}
	var RO = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { var b = e.target; if (b.__sp && Math.abs((b.__w || 0) - b.clientWidth) > 4) drawChart(b); }); }) : null;
	function drawChart(box) { box.__w = box.clientWidth; box.querySelector(".ai-chsvg").innerHTML = chartSvg(box.__sp, box.clientWidth - 2); }
	function chartBox(sp, opts) {
		var box = document.createElement("div"); box.className = "ai-chart"; box.__sp = sp;
		var types = sp.series.length === 1 ? ["bar", "line", "pie"] : ["bar", "line"];
		box.innerHTML = '<div class="ai-chbar">' + types.map(function (k) { return '<button type="button" class="ai-mini" data-ct="' + k + '" aria-pressed="' + (k === sp.type) + '">' + esc({ bar: T("Bars"), line: T("Line"), pie: T("Pie") }[k]) + "</button>"; }).join("") +
			'<button type="button" class="ai-mini" data-cpng>' + esc(T("Save picture")) + "</button>" + (opts && opts.close ? '<button type="button" class="ai-mini" data-cclose>' + esc(T("Hide chart")) + "</button>" : "") + '</div><div class="ai-chsvg"></div>';
		box.addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.dataset.ct) { sp.type = b.dataset.ct; [].forEach.call(box.querySelectorAll("[data-ct]"), function (x) { x.setAttribute("aria-pressed", x === b); }); drawChart(box); }
			if (b.hasAttribute("data-cpng")) svgPng(box.querySelector("svg"), (sp.title || "chart").replace(/[^\w -]+/g, "").trim().slice(0, 40) || "chart");
			if (b.hasAttribute("data-cclose")) { box.remove(); if (opts.onClose) opts.onClose(); }
		});
		setTimeout(function () { drawChart(box); if (RO) RO.observe(box); }, 0);
		return box;
	}
	function svgText(svg) { // a stand-alone copy with real colours (for pictures and the PDF)
		var c = svg.cloneNode(true), dark = document.body.classList.contains("dark-mode");
		c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		return new XMLSerializer().serializeToString(c).replace(/currentColor/g, "#222").replace(/var\(--ai-bot,#fff\)/g, "#fff") + (dark ? "" : "");
	}
	function svgImage(svg, scale) {
		var w = svg.width.baseVal.value || svg.getBoundingClientRect().width, h = svg.height.baseVal.value || svg.getBoundingClientRect().height;
		return new Promise(function (res, rej) {
			var im = new Image(); im.onload = function () { var cv = document.createElement("canvas"); cv.width = Math.ceil(w * scale); cv.height = Math.ceil(h * scale); var x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height); res(cv); };
			im.onerror = rej; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText(svg));
		});
	}
	function svgPng(svg, name) { if (!svg) return; svgImage(svg, 2).then(function (cv) { cv.toBlob(function (b) { dl(b, name + ".png"); }); }); }
	function dl(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }

	/* ---------- tables: filter, sort, resize, copy, chart ---------- */
	function tableData(t, onlyShown) {
		var rows = [].slice.call(t.rows).filter(function (r) { return !onlyShown || !r.hidden; });
		return rows.map(function (r) { return [].map.call(r.cells, function (c) { return c.innerText.replace(/\s+/g, " ").trim(); }); });
	}
	function tableSpec(t) {
		var d = tableData(t, true); if (d.length < 3 || d[0].length < 2) return null;
		var head = d[0], body = d.slice(1), cols = [];
		for (var j = 1; j < head.length; j++) { var ok = body.filter(function (r) { return isFinite(num(r[j])); }).length; if (ok >= Math.max(2, body.length * 0.6)) cols.push(j); }
		if (!cols.length) return null;
		return { type: body.length > 14 && cols.length < 3 ? "line" : "bar", title: "", labels: body.map(function (r) { return r[0]; }), series: cols.slice(0, 8).map(function (j) { return { name: head[j], data: body.map(function (r) { return num(r[j]); }) }; }) };
	}
	function enhanceTable(t, copy) {
		if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains("ai-tscroll")) return;
		var head = t.tHead && t.tHead.rows[0], body = t.tBodies[0]; if (!head || !body) return;
		var wrap = document.createElement("div"), scroll = document.createElement("div"), bar = document.createElement("div");
		wrap.className = "ai-tbl"; scroll.className = "ai-tscroll"; bar.className = "ai-tbar";
		t.parentNode.insertBefore(wrap, t); scroll.appendChild(t); wrap.appendChild(bar); wrap.appendChild(scroll);
		var rows = [].slice.call(body.rows); rows.forEach(function (r, i) { r.__i = i; });
		var many = rows.length > 4, canChart = !!tableSpec(t);
		bar.innerHTML = (many ? '<input type="search" class="ai-tfilter" placeholder="' + esc(T("Filter rows")) + '" aria-label="' + esc(T("Filter rows")) + '"><span class="ai-tcount"></span>' : "") +
			'<button type="button" class="ai-mini" data-tcopy title="' + esc(T("Copy the table (pastes into Excel or Sheets)")) + '">' + esc(T("Copy table")) + "</button>" +
			(canChart ? '<button type="button" class="ai-mini" data-tchart>' + esc(T("📊 Show as chart")) + "</button>" : "");
		var fi = bar.querySelector(".ai-tfilter"), cnt = bar.querySelector(".ai-tcount");
		function count() { if (!cnt) return; var n = rows.filter(function (r) { return !r.hidden; }).length; cnt.textContent = n === rows.length ? "" : T("{n} of {all} rows", { n: n, all: rows.length }); }
		if (fi) fi.addEventListener("input", function () { var w = fi.value.toLowerCase().split(/\s+/).filter(Boolean); rows.forEach(function (r) { var s = r.innerText.toLowerCase(); r.hidden = !w.every(function (x) { return s.indexOf(x) >= 0; }); }); count(); });
		bar.addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.hasAttribute("data-tcopy")) copy(tableData(t, true).map(function (r) { return r.join("\t"); }).join("\n"), b);
			if (b.hasAttribute("data-tchart")) {
				var old = wrap.querySelector(".ai-chart"); if (old) { old.remove(); b.setAttribute("aria-pressed", "false"); return; }
				var sp = tableSpec(t); if (!sp) return;
				b.setAttribute("aria-pressed", "true");
				wrap.appendChild(chartBox(sp, { close: true, onClose: function () { b.setAttribute("aria-pressed", "false"); } }));
			}
		});
		[].forEach.call(head.cells, function (th, j) {
			th.classList.add("ai-th"); th.tabIndex = 0; th.setAttribute("aria-sort", "none"); th.title = T("Click to sort");
			var g = document.createElement("span"); g.className = "ai-rz"; g.setAttribute("aria-hidden", "true"); th.appendChild(g);
			function sort() {
				var st = th.getAttribute("aria-sort"), next = st === "none" ? "ascending" : st === "ascending" ? "descending" : "none";
				[].forEach.call(head.cells, function (x) { x.setAttribute("aria-sort", "none"); });
				th.setAttribute("aria-sort", next);
				var cell = function (r) { return r.cells[j] ? r.cells[j].innerText.trim() : ""; };
				var sorted = rows.slice().sort(function (a, b) {
					if (next === "none") return a.__i - b.__i;
					var x = cell(a), y = cell(b), nx = num(x), ny = num(y), c = isFinite(nx) && isFinite(ny) ? nx - ny : isFinite(nx) ? -1 : isFinite(ny) ? 1 : x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
					return next === "ascending" ? c : -c;
				});
				sorted.forEach(function (r) { body.appendChild(r); });
			}
			th.addEventListener("click", function (e) { if (e.target === g) return; sort(); });
			th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
			g.addEventListener("pointerdown", function (e) {
				e.preventDefault(); e.stopPropagation();
				if (t.style.tableLayout !== "fixed") { var ws = [].map.call(head.cells, function (c) { return c.offsetWidth; }); [].forEach.call(head.cells, function (c, k) { c.style.width = ws[k] + "px"; }); t.style.width = ws.reduce(function (a, b2) { return a + b2; }, 0) + "px"; t.style.tableLayout = "fixed"; }
				var x0 = e.clientX, w0 = th.offsetWidth, tw0 = t.offsetWidth;
				g.setPointerCapture(e.pointerId); wrap.classList.add("is-rz");
				function mv(ev) { var w = Math.max(40, w0 + ev.clientX - x0); th.style.width = w + "px"; t.style.width = (tw0 + w - w0) + "px"; }
				function up() { g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); wrap.classList.remove("is-rz"); }
				g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
			});
			g.addEventListener("dblclick", function (e) { e.stopPropagation(); [].forEach.call(head.cells, function (c) { c.style.width = ""; }); t.style.width = ""; t.style.tableLayout = ""; });
		});
		count();
	}

	/* ---------- code blocks and chart blocks ---------- */
	function enhance(el, opts, copy) {
		opts = opts || {};
		el.querySelectorAll("pre > code").forEach(function (code) {
			var pre = code.parentNode, lang = ((code.className.match(/language-([\w+#-]+)/) || [])[1] || "").toLowerCase();
			if (lang === "chart" || lang === "json-chart") {
				if (opts.pending) return;
				var sp = null; try { sp = normSpec(JSON.parse(code.textContent)); } catch (e) { sp = null; }
				if (!sp) { pre.insertAdjacentHTML("beforebegin", '<p class="ai-note">' + esc(T("This chart could not be drawn (its data is not valid JSON).")) + "</p>"); }
				else {
					var box = chartBox(sp, {}); pre.parentNode.insertBefore(box, pre); pre.hidden = true;
					var tg = document.createElement("button"); tg.type = "button"; tg.className = "ai-mini"; tg.textContent = T("Data");
					tg.addEventListener("click", function () { pre.hidden = !pre.hidden; tg.setAttribute("aria-pressed", !pre.hidden); });
					box.querySelector(".ai-chbar").appendChild(tg);
				}
			}
			if (pre.querySelector(".ai-copy")) return;
			if (lang && lang !== "chart") { var lt = document.createElement("span"); lt.className = "ai-lang-tag"; lt.textContent = lang; pre.appendChild(lt); }
			var b = document.createElement("button"); b.type = "button"; b.className = "ai-copy"; b.textContent = T("Copy");
			b.addEventListener("click", function () { copy(code.innerText, b); });
			pre.appendChild(b);
		});
		el.querySelectorAll(".ai-md table").forEach(function (t) { enhanceTable(t, copy); });
	}

	/* ---------- hand-offs to /latex, /text, /docx, /pdf ---------- */
	function hput(file) { // same format as MESLinkOpen.sendTo / MESImg (IndexedDB "mes-handoff")
		return new Promise(function (res, rej) {
			var r = indexedDB.open("mes-handoff", 1);
			r.onupgradeneeded = function () { r.result.createObjectStore("h"); };
			r.onerror = function () { rej(r.error); };
			r.onsuccess = function () {
				var db = r.result, id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10), tx = db.transaction("h", "readwrite");
				tx.objectStore("h").put({ t: Date.now(), files: [{ name: file.name, type: file.type, blob: file }], src: "" }, id);
				tx.oncomplete = function () { db.close(); res(id); }; tx.onerror = function () { db.close(); rej(tx.error); };
			};
		});
	}
	// a window is opened inside the click (pop-up blockers), the file is made, then the window goes to the page
	function sendFile(page, make) {
		var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) {}
		if (w) try { w.document.title = T("Opening…"); w.document.body.innerHTML = '<p style="font:16px system-ui;padding:2em">' + esc(T("Making the file…")) + "</p>"; } catch (e) {}
		return Promise.resolve().then(make).then(function (file) { return hput(file); }).then(function (id) {
			var url = page + "?handoff=" + encodeURIComponent(id);
			if (w && !w.closed) { try { w.opener = null; } catch (e) {} w.location.href = url; } else location.href = url;
		}, function (e) { if (w) w.close(); throw e; });
	}
	function baseName(md) { var h = (String(md).match(/^#+\s*(.+)$/m) || [])[1] || String(md).replace(/[#*_`>$\\]/g, " ").trim().split(/\s+/).slice(0, 6).join(" "); return (h.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "mes-ai-answer"); }

	// the answer as blocks: {k: h|p|li|code|quote|table|tex|img, ...} read from the shown message (math as TeX, charts as pictures)
	function blocks(el) {
		var out = [];
		function inl(node) { // -> runs [{t, b, i, m (mono), u (link)}]
			var runs = [];
			(function walk(n, st) {
				if (n.nodeType === 3) { if (n.nodeValue) runs.push({ t: n.nodeValue, b: st.b, i: st.i, m: st.m, u: st.u }); return; }
				if (n.nodeType !== 1 || n.matches("button, .ai-rz, .ai-copy, .ai-lang-tag, .ai-tbar")) return;
				if (n.classList.contains("ai-tex")) { runs.push({ t: n.dataset.tex || "", i: true, m: false, b: st.b, tex: true, svg: n.querySelector("svg") }); return; }
				var s = { b: st.b || /^(B|STRONG|TH)$/.test(n.nodeName), i: st.i || /^(I|EM)$/.test(n.nodeName), m: st.m || n.nodeName === "CODE", u: st.u || (n.nodeName === "A" ? n.href : "") };
				if (n.nodeName === "BR") { runs.push({ t: "\n" }); return; }
				[].forEach.call(n.childNodes, function (c) { walk(c, s); });
			})(node, {});
			return runs;
		}
		(function walk(n, depth, listType) {
			[].forEach.call(n.children, function (c) {
				var tag = c.nodeName;
				if (c.hidden) return;
				if (/^H[1-6]$/.test(tag)) out.push({ k: "h", lv: +tag[1], runs: inl(c) });
				else if (tag === "P") out.push({ k: "p", runs: inl(c), d: depth });
				else if (tag === "UL" || tag === "OL") { var i = 0; [].forEach.call(c.children, function (li) { i++; var sub = [].filter.call(li.children, function (x) { return /^(UL|OL|PRE|TABLE)$/.test(x.nodeName); }); var cl = li.cloneNode(true); [].forEach.call(cl.querySelectorAll("ul, ol, pre, table"), function (x) { x.remove(); }); out.push({ k: "li", runs: inl(cl), d: depth, mark: tag === "OL" ? i + "." : "•" }); sub.forEach(function (s) { var tmp = document.createElement("div"); tmp.appendChild(s.cloneNode(true)); walk(tmp, depth + 1); }); }); }
				else if (tag === "PRE") { var code = c.querySelector("code") || c; out.push({ k: "code", text: code.innerText.replace(/\s+$/, "") }); }
				else if (tag === "BLOCKQUOTE") out.push({ k: "quote", runs: inl(c) });
				else if (tag === "TABLE") out.push({ k: "table", rows: tableData(c, false) });
				else if (c.classList.contains("ai-texd")) out.push({ k: "tex", tex: c.dataset.tex || "", svg: c.querySelector("svg") });
				else if (c.classList.contains("ai-chart")) { var sv = c.querySelector("svg"); if (sv) out.push({ k: "img", svg: sv }); }
				else if (tag === "HR") out.push({ k: "p", runs: [{ t: "" }] });
				else walk(c, depth, listType);
			});
		})(el, 0);
		return out;
	}

	// a small .docx (store-only zip, no library): headings, paragraphs with bold / italic / code, lists, code blocks, tables
	var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
	function crc32(u) { var c = 0xffffffff; for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
	function zip(files) {
		var enc = new TextEncoder(), parts = [], cent = [], off = 0;
		files.forEach(function (f) {
			var name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
			var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
			parts.push(new Uint8Array(h.buffer), name, data);
			var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
			cent.push(new Uint8Array(c.buffer), name);
			off += 30 + name.length + data.length;
		});
		var csize = cent.reduce(function (a, b) { return a + b.length; }, 0), e = new DataView(new ArrayBuffer(22));
		e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
		return new Blob(parts.concat(cent, [new Uint8Array(e.buffer)]));
	}
	function x(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""); }
	// Word equations (2026-11-23): TeX -> MathJax.tex2mml -> OMML (main_js/omml.js, loaded on first use); a failure keeps the TeX as text
	var OM = null;
	function omml() { return OM || (OM = new Promise(function (res, rej) { if (window.MESOmml) return res(window.MESOmml); var s = document.createElement("script"); s.src = "js/omml.js"; s.onload = function () { res(window.MESOmml); }; s.onerror = function () { OM = null; rej(new Error("omml")); }; document.head.appendChild(s); })); }
	function withOmml(B) {
		var all = []; B.forEach(function (b) { if (b.k === "tex") all.push(b); (b.runs || []).forEach(function (r) { if (r.tex) all.push(r); }); });
		if (!all.length) return Promise.resolve(B);
		return Promise.all([mathJax(), omml()]).then(function (r) {
			var M = r[0], O = r[1];
			all.forEach(function (o) { var tex = o.k === "tex" ? o.tex : o.t; try { o.omml = O.fromMathML(M.tex2mml(tex, { display: o.k === "tex" }), o.k === "tex"); } catch (e) { o.omml = ""; } });
			return B;
		}, function () { return B; });
	}
	function docx(el, title) { return withOmml(blocks(el)).then(function (B) { return docxFile(B, title); }); }
	function docxFile(B, title) {
		var body = [];
		function runXml(r, size) {
			if (r.t === "\n") return "<w:r><w:br/></w:r>";
			var pr = (r.b ? "<w:b/>" : "") + (r.i ? "<w:i/>" : "") + (r.m || r.tex ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : "") + (r.u ? '<w:color w:val="1F4FBF"/><w:u w:val="single"/>' : "") + (size ? '<w:sz w:val="' + size + '"/>' : "");
			if (r.tex && r.omml) return r.omml;
			var t = r.tex ? "$" + r.t + "$" : r.t;
			return "<w:r>" + (pr ? "<w:rPr>" + pr + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + x(t) + "</w:t></w:r>" + (r.u && r.u.indexOf(r.t.trim()) < 0 && /^https?:/.test(r.u) ? '<w:r><w:rPr><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve"> (' + x(r.u) + ")</w:t></w:r>" : "");
		}
		function para(runs, ppr, size) { return "<w:p>" + (ppr ? "<w:pPr>" + ppr + "</w:pPr>" : "") + runs.map(function (r) { return runXml(r, size); }).join("") + "</w:p>"; }
		B.forEach(function (b) {
			if (b.k === "h") body.push(para(b.runs.map(function (r) { r.b = true; return r; }), '<w:spacing w:before="240" w:after="120"/>', [0, 36, 32, 28, 26, 24, 24][b.lv]));
			else if (b.k === "p") body.push(para(b.runs, b.d ? '<w:ind w:left="' + 360 * b.d + '"/>' : "", 0));
			else if (b.k === "li") body.push(para([{ t: b.mark + " " }].concat(b.runs), '<w:ind w:left="' + (360 + 360 * b.d) + '" w:hanging="300"/>', 0));
			else if (b.k === "quote") body.push(para(b.runs.map(function (r) { r.i = true; return r; }), '<w:ind w:left="567"/>', 0));
			else if (b.k === "code") b.text.split("\n").forEach(function (l) { body.push(para([{ t: l || " ", m: true }], '<w:shd w:val="clear" w:fill="F2F3F6"/><w:spacing w:after="0"/>', 19)); });
			else if (b.k === "tex") body.push(b.omml ? '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' + b.omml + "</w:p>" : para([{ t: b.tex, tex: true }], '<w:jc w:val="center"/>', 0));
			else if (b.k === "table" && b.rows.length) {
				var bd = '<w:tblBorders>' + ["top", "left", "bottom", "right", "insideH", "insideV"].map(function (s) { return "<w:" + s + ' w:val="single" w:sz="4" w:color="BBBBBB"/>'; }).join("") + "</w:tblBorders>";
				body.push('<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + bd + "</w:tblPr>" + b.rows.map(function (r, i) { return "<w:tr>" + r.map(function (c) { return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + (i ? "" : '<w:shd w:val="clear" w:fill="EEF0F6"/>') + "</w:tcPr>" + para([{ t: c, b: !i }], "", 0) + "</w:tc>"; }).join("") + "</w:tr>"; }).join("") + "</w:tbl>", "<w:p/>");
			} else if (b.k === "img") body.push(para([{ t: "[" + T("Chart: see the answer on mes.fm/ai") + "]", i: true }], "", 0));
		});
		var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>' + body.join("") + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
		var blob = zip([
			{ name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
			{ name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
			{ name: "docProps/core.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + x(title) + '</dc:title><dc:creator>MES AI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, "Z") + "</dcterms:created></cp:coreProperties>" },
			{ name: "word/document.xml", data: doc }
		]);
		return new File([blob], title + ".docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
	}

	// a PDF made of page pictures drawn here (any script and symbol works; equations and charts as pictures), no library
	function pdf(el, title) {
		var B = blocks(el), PW = 595, PH = 842, S = 2, M = 50, pages = [], cv, cx, y;
		function page() { cv = document.createElement("canvas"); cv.width = PW * S; cv.height = PH * S; cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.scale(S, S); cx.textBaseline = "alphabetic"; pages.push(cv); y = M; }
		function room(h) { if (y + h > PH - M) page(); }
		function font(r, size) { return (r.i ? "italic " : "") + (r.b ? "700 " : "400 ") + size + "px " + (r.m || r.tex ? "Menlo, Consolas, monospace" : "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif"); }
		function flow(runs, size, left, color) { // word-wraps runs across lines
			var lh = size * 1.45, x0 = M + left, xr = PW - M, xp = x0, line = [];
			function flush() { room(lh); line.forEach(function (w) { cx.font = w.f; cx.fillStyle = w.c; cx.fillText(w.t, w.x, y + size); if (w.u) { cx.fillRect(w.x, y + size + 1.5, w.w, 0.6); } }); y += lh; line = []; xp = x0; }
			runs.forEach(function (r) {
				if (r.t === "\n") { flush(); return; }
				var f = font(r, size), c = r.u ? "#1f4fbf" : color || "#1f2430", t = r.tex ? r.t : r.t;
				cx.font = f;
				t.split(/(\s+)/).forEach(function (w) {
					if (!w) return;
					var ww = cx.measureText(w).width;
					if (/^\s+$/.test(w)) { if (xp > x0) xp += cx.measureText(" ").width; return; }
					if (xp + ww > xr && xp > x0) flush();
					while (ww > xr - x0 && w.length > 1) { var k = Math.floor(w.length * (xr - x0) / ww); line.push({ t: w.slice(0, k), x: xp, f: f, c: c, u: r.u, w: cx.measureText(w.slice(0, k)).width }); flush(); w = w.slice(k); ww = cx.measureText(w).width; }
					line.push({ t: w, x: xp, f: f, c: c, u: r.u, w: ww }); xp += ww;
				});
			});
			if (line.length) flush();
		}
		var imgs = B.filter(function (b) { return b.svg; }).map(function (b) { return svgImage(b.svg, 3).then(function (c) { b.cv = c; }, function () {}); });
		return Promise.all(imgs).then(function () {
			page();
			cx.font = "700 20px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
			B.forEach(function (b) {
				if (b.k === "h") { y += 6; flow(b.runs, [0, 19, 16.5, 14.5, 13, 12, 12][b.lv], 0); y += 2; }
				else if (b.k === "p") { flow(b.runs, 11, 18 * (b.d || 0)); y += 5; }
				else if (b.k === "li") { flow([{ t: b.mark + " " }].concat(b.runs), 11, 12 + 18 * b.d); y += 2; }
				else if (b.k === "quote") { var y0 = y; flow(b.runs, 11, 14, "#555"); cx.fillStyle = "#ccd"; cx.fillRect(M + 3, y0, 2.5, y - y0); y += 5; }
				else if (b.k === "code") {
					b.text.split("\n").forEach(function (l) { room(13); cx.fillStyle = "#f2f3f6"; cx.fillRect(M, y, PW - 2 * M, 13); cx.font = "9.5px Menlo, Consolas, monospace"; cx.fillStyle = "#1f2430"; var s = l; while (cx.measureText(s).width > PW - 2 * M - 10 && s.length > 1) s = s.slice(0, -1); cx.fillText(s, M + 5, y + 9.8); y += 13; });
					y += 7;
				} else if ((b.k === "tex" || b.k === "img") && b.cv) {
					var w = b.cv.width / 3, h = b.cv.height / 3, k = Math.min(1, (PW - 2 * M) / w); w *= k; h *= k;
					if (h > PH - 2 * M) { k = (PH - 2 * M) / h; w *= k; h *= k; }
					room(h + 8); cx.drawImage(b.cv, b.k === "tex" ? (PW - w) / 2 : M, y, w, h); y += h + 8;
				} else if (b.k === "tex") { flow([{ t: b.tex, tex: true }], 11, 30); y += 5; }
				else if (b.k === "table" && b.rows.length) {
					var n = Math.max.apply(null, b.rows.map(function (r) { return r.length; })), cw = (PW - 2 * M) / n;
					b.rows.forEach(function (r, i) {
						cx.font = (i ? "400 " : "700 ") + "9.5px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
						var lines = r.map(function (c) { var out = [], cur = ""; String(c).split(/\s+/).forEach(function (w) { var tst = cur ? cur + " " + w : w; if (cx.measureText(tst).width > cw - 8 && cur) { out.push(cur); cur = w; } else cur = tst; }); out.push(cur); return out; });
						var h = Math.max.apply(null, lines.map(function (l) { return l.length; })) * 12 + 6; room(h);
						if (!i) { cx.fillStyle = "#eef0f6"; cx.fillRect(M, y, PW - 2 * M, h); }
						cx.strokeStyle = "#c8ccd6"; cx.lineWidth = 0.6;
						for (var j = 0; j < n; j++) { cx.strokeRect(M + j * cw, y, cw, h); cx.fillStyle = "#1f2430"; (lines[j] || []).forEach(function (l, q) { cx.fillText(l, M + j * cw + 4, y + 12 + q * 12); }); }
						y += h;
					});
					y += 8;
				}
			});
			return Promise.all(pages.map(function (c) { return new Promise(function (res) { c.toBlob(function (bl) { bl.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }); }, "image/jpeg", 0.9); }); }));
		}).then(function (jpgs) {
			var enc = new TextEncoder(), parts = [], off = 0, xref = [], n = 2 + jpgs.length * 3;
			function add(s) { var u = typeof s === "string" ? enc.encode(s) : s; parts.push(u); off += u.length; }
			function obj(i, body) { xref[i] = off; add(i + " 0 obj\n"); body.forEach(add); add("\nendobj\n"); }
			add("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
			obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
			var kids = jpgs.map(function (j, i) { return (3 + i * 3) + " 0 R"; }).join(" ");
			obj(2, ["<< /Type /Pages /Kids [" + kids + "] /Count " + jpgs.length + " >>"]);
			jpgs.forEach(function (j, i) {
				var p = 3 + i * 3, im = p + 1, ct = p + 2, cmd = "q " + PW + " 0 0 " + PH + " 0 0 cm /Im0 Do Q";
				obj(p, ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + ct + " 0 R >>"]);
				obj(im, ["<< /Type /XObject /Subtype /Image /Width " + PW * S + " /Height " + PH * S + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + j.length + " >>\nstream\n", j, "\nendstream"]);
				obj(ct, ["<< /Length " + cmd.length + " >>\nstream\n" + cmd + "\nendstream"]);
			});
			var info = n + 1; obj(info, ["<< /Title (" + title.replace(/[()\\]/g, "") + ") /Creator (MES AI, mes.fm/ai) >>"]);
			var xo = off; add("xref\n0 " + (info + 1) + "\n0000000000 65535 f \n");
			for (var i = 1; i <= info; i++) add(String(xref[i] || 0).padStart(10, "0") + " 00000 n \n");
			add("trailer\n<< /Size " + (info + 1) + " /Root 1 0 R /Info " + info + " 0 R >>\nstartxref\n" + xo + "\n%%EOF\n");
			return new File([new Blob(parts)], title + ".pdf", { type: "application/pdf" });
		});
	}

	/* ---------- a real PDF (2026-11-23): selectable, searchable text in an embedded Unicode font (DejaVu Sans, subset), equations drawn
	   as vector paths straight from MathJax's SVG, tables / code / lists / links; pdf-lib 1.17.1 (cdnjs) + @pdf-lib/fontkit 1.1.1 + DejaVu
	   (jsDelivr), loaded on first use. Characters the font lacks (emoji, Chinese ...) are drawn as small pictures of that word; charts are
	   pictures too. If the libraries cannot load, the older picture-only pdf() is used. */
	var LIBS = { pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", fk: "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js", font: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/" };
	var scr = {}, fontBytes = {};
	function js(u) { return scr[u] || (scr[u] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { delete scr[u]; rej(new Error("load")); }; document.head.appendChild(s); })); }
	function fontFile(n) { return fontBytes[n] || (fontBytes[n] = fetch(LIBS.font + n).then(function (r) { if (!r.ok) throw new Error("font"); return r.arrayBuffer(); }).catch(function (e) { delete fontBytes[n]; throw e; })); }
	function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
	function tf(s) { // an SVG transform attribute -> matrix
		var m = [1, 0, 0, 1, 0, 0], re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g, a;
		while ((a = re.exec(s || ""))) {
			var v = a[2].split(/[\s,]+/).filter(Boolean).map(Number), t;
			if (a[1] === "matrix") t = v; else if (a[1] === "translate") t = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; else if (a[1] === "scale") t = [v[0], 0, 0, v[1] == null ? v[0] : v[1], 0, 0];
			else if (a[1] === "rotate") { var r = (v[0] || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r); t = [c, sn, -sn, c, 0, 0]; if (v.length > 2) t = mul(mul([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]]); }
			else if (a[1] === "skewX") t = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0]; else t = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0];
			m = mul(m, t);
		}
		return m;
	}
	// SVG path data -> pdf-lib operators (own parser: pdf-lib's drawSvgPath draws quadratic curves wrongly, and MathJax glyphs are made of them)
	function pathOps(P, d) {
		var t = String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [], i = 0, ops = [], cmd = "", x = 0, y = 0, sx = 0, sy = 0, cx = null, cy = null, qx = null, qy = null;
		function n() { return +t[i++]; }
		function more() { return i < t.length && !/^[a-zA-Z]$/.test(t[i]); }
		function cub(x1, y1, x2, y2, x3, y3) { ops.push(P.appendBezierCurve(x1, y1, x2, y2, x3, y3)); cx = x2; cy = y2; qx = qy = null; x = x3; y = y3; }
		function quad(x1, y1, x2, y2) { ops.push(P.appendBezierCurve(x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y), x2 + 2 / 3 * (x1 - x2), y2 + 2 / 3 * (y1 - y2), x2, y2)); qx = x1; qy = y1; cx = cy = null; x = x2; y = y2; }
		while (i < t.length) {
			if (/^[a-zA-Z]$/.test(t[i])) cmd = t[i++];
			var r = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = r ? x : 0, oy = r ? y : 0;
			if (C === "Z") { ops.push(P.closePath()); x = sx; y = sy; cx = qx = null; continue; }
			if (!more()) { i++; continue; }
			if (C === "M") { x = ox + n(); y = oy + n(); sx = x; sy = y; ops.push(P.moveTo(x, y)); cx = qx = null; cmd = r ? "l" : "L"; continue; }
			if (C === "L") { x = ox + n(); y = oy + n(); ops.push(P.lineTo(x, y)); cx = qx = null; continue; }
			if (C === "H") { x = ox + n(); ops.push(P.lineTo(x, y)); cx = qx = null; continue; }
			if (C === "V") { y = (r ? y : 0) + n(); ops.push(P.lineTo(x, y)); cx = qx = null; continue; }
			if (C === "C") { var a1 = ox + n(), b1 = oy + n(), a2 = ox + n(), b2 = oy + n(); cub(a1, b1, a2, b2, ox + n(), oy + n()); continue; }
			if (C === "S") { var rx = cx == null ? x : 2 * x - cx, ry = cy == null ? y : 2 * y - cy, s2 = ox + n(), t2 = oy + n(); cub(rx, ry, s2, t2, ox + n(), oy + n()); continue; }
			if (C === "Q") { var q1 = ox + n(), q2 = oy + n(); quad(q1, q2, ox + n(), oy + n()); continue; }
			if (C === "T") { var tx = qx == null ? x : 2 * x - qx, ty = qy == null ? y : 2 * y - qy; quad(tx, ty, ox + n(), oy + n()); continue; }
			if (C === "A") { n(); n(); n(); n(); n(); x = ox + n(); y = oy + n(); ops.push(P.lineTo(x, y)); cx = qx = null; continue; }
			i++;
		}
		return ops;
	}
	function svgBox(svg) { var vb = (svg.getAttribute("viewBox") || "0 0 0 0").split(/[\s,]+/).map(Number); return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }; }
	// draws a MathJax SVG with its left edge at x (pt) and baseline at yb (PDF y, pt); 1000 SVG units = size pt
	function drawSvg(P, page, svg, x, yb, size, F, color) {
		var b = svgBox(svg), k = size / 1000, base = [k, 0, 0, -k, x - b.x * k, yb];
		var black = color || P.rgb(0, 0, 0);
		var rgbC = black.red != null ? [black.red, black.green, black.blue] : [0, 0, 0];
		function path(m, d, stroke, sw) {
			var ops = pathOps(P, d); if (!ops.length) return;
			page.pushOperators.apply(page, [P.pushGraphicsState(), P.concatTransformationMatrix(m[0], m[1], m[2], m[3], m[4], m[5]), stroke ? P.setStrokingRgbColor(rgbC[0], rgbC[1], rgbC[2]) : P.setFillingRgbColor(rgbC[0], rgbC[1], rgbC[2])].concat(stroke ? [P.setLineWidth(sw || 30)] : [], ops, [stroke ? P.stroke() : P.fill(), P.popGraphicsState()]));
		}
		(function walk(n, m) {
			if (n.nodeType !== 1) return;
			var tag = n.nodeName.toLowerCase(); if (tag === "defs" || tag === "title" || tag === "desc" || n.getAttribute("data-mml-node") === "merror" && false) return;
			if (n.getAttribute("visibility") === "hidden" || n.style && n.style.display === "none") return;
			var mm = n.getAttribute("transform") ? mul(m, tf(n.getAttribute("transform"))) : m;
			if (tag === "path") { var d = n.getAttribute("d"); if (d && d.trim()) path(mm, d, n.getAttribute("fill") === "none", +n.getAttribute("stroke-width") || 0); return; }
			if (tag === "rect") { var rx = +n.getAttribute("x") || 0, ry = +n.getAttribute("y") || 0, rw = +n.getAttribute("width") || 0, rh = +n.getAttribute("height") || 0; if (rw > 0 && rh > 0 && n.getAttribute("fill") !== "none") path(mm, "M" + rx + " " + ry + "h" + rw + "v" + rh + "h" + -rw + "Z"); return; }
			if (tag === "line") { path(mm, "M" + (+n.getAttribute("x1") || 0) + " " + (+n.getAttribute("y1") || 0) + "L" + (+n.getAttribute("x2") || 0) + " " + (+n.getAttribute("y2") || 0), true, +n.getAttribute("stroke-width") || 40); return; }
			if (tag === "use") {
				var id = (n.getAttribute("href") || n.getAttribute("xlink:href") || "").replace(/^#/, ""), ref = id && svg.querySelector('[id="' + id.replace(/"/g, "") + '"]');
				if (ref) walk(ref.cloneNode(true), mul(mm, [1, 0, 0, 1, +n.getAttribute("x") || 0, +n.getAttribute("y") || 0]));
				return;
			}
			if (tag === "text") {
				var t = n.textContent; if (!t) return; var fs = parseFloat(n.getAttribute("font-size")) || 1000, f = F.reg;
				var fm = mul(mm, [1, 0, 0, -1, 0, 0]);
				page.pushOperators(P.pushGraphicsState(), P.concatTransformationMatrix(fm[0], fm[1], fm[2], fm[3], fm[4], fm[5]));
				try { page.drawText(F.safe(t, f), { x: +n.getAttribute("x") || 0, y: -(+n.getAttribute("y") || 0), size: fs, font: f, color: black }); } catch (e) { /* unknown glyphs */ }
				page.pushOperators(P.popGraphicsState());
				return;
			}
			[].forEach.call(n.childNodes, function (c) { walk(c, mm); });
		})(svg, base);
	}
	function pdfVec(el, title) {
		var B = blocks(el), P, doc, F = {}, sets = {};
		return js(LIBS.pdf).then(function () { P = window.PDFLib; return js(LIBS.fk).catch(function () {}); }).then(function () {
			return P.PDFDocument.create();
		}).then(function (d) {
			doc = d;
			var names = { reg: "DejaVuSans.ttf", bold: "DejaVuSans-Bold.ttf", it: "DejaVuSans-Oblique.ttf", bi: "DejaVuSans-BoldOblique.ttf", mono: "DejaVuSansMono.ttf" };
			var std = { reg: "Helvetica", bold: "HelveticaBold", it: "HelveticaOblique", bi: "HelveticaBoldOblique", mono: "Courier" };
			var useTtf = !!window.fontkit; if (useTtf) doc.registerFontkit(window.fontkit);
			return Promise.all(Object.keys(names).map(function (k) {
				var p = useTtf ? fontFile(names[k]).then(function (bytes) { return doc.embedFont(bytes, { subset: true }); }) : Promise.reject();
				return p.catch(function () { return doc.embedFont(P.StandardFonts[std[k]]); }).then(function (f) { F[k] = f; sets[k] = new Set(f.getCharacterSet()); });
			}));
		}).then(function () {
			return Promise.all(B.filter(function (b) { return b.k === "img" && b.svg; }).map(function (b) { return svgImage(b.svg, 3).then(function (c) { return new Promise(function (res) { c.toBlob(function (bl) { bl.arrayBuffer().then(function (a) { return doc.embedPng(a); }).then(function (im) { b.png = im; b.pw = c.width / 3; b.ph = c.height / 3; res(); }, function () { res(); }); }); }); }, function () {}); }));
		}).then(function () {
			var PW = 595.28, PH = 841.89, M = 54, W = PW - 2 * M, page, y, ink = P.rgb(0.12, 0.14, 0.19), blue = P.rgb(0.12, 0.31, 0.75), grey = P.rgb(0.42, 0.45, 0.5);
			F.safe = function (t, f) { var s = sets[Object.keys(F).filter(function (k) { return F[k] === f; })[0]] || sets.reg, o = ""; for (var c of t) o += s.has(c.codePointAt(0)) ? c : "?"; return o; };
			function newPage() { page = doc.addPage([PW, PH]); y = M; }
			function room(h) { if (y + h > PH - M) newPage(); }
			function fontOf(r) { return r.m || r.tex ? F.mono : r.b && r.i ? F.bi : r.b ? F.bold : r.i ? F.it : F.reg; }
			function setOf(f) { for (var k in F) if (F[k] === f && sets[k]) return sets[k]; return sets.reg; }
			function ok(t, f) { var s = setOf(f); for (var c of t) if (!s.has(c.codePointAt(0))) return false; return true; }
			var picCache = {};
			function wordPic(t, size, r) { // a word with characters the font does not have (emoji, CJK...): a small picture, measured by the browser
				var key = t + "|" + size + "|" + !!r.b; if (picCache[key]) return picCache[key];
				var cv = document.createElement("canvas"), cx = cv.getContext("2d"), S = 4, f = (r.b ? "700 " : "400 ") + size * S + "px -apple-system, 'Segoe UI', 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
				cx.font = f; var w = Math.ceil(cx.measureText(t).width) + 2; cv.width = w; cv.height = Math.ceil(size * S * 1.35);
				cx.font = f; cx.fillStyle = r.u ? "#1f4fbf" : "#1f2430"; cx.textBaseline = "alphabetic"; cx.fillText(t, 1, size * S * 1.02);
				return (picCache[key] = new Promise(function (res) { cv.toBlob(function (bl) { bl.arrayBuffer().then(function (a) { return doc.embedPng(a); }).then(function (im) { res({ im: im, w: w / S, h: cv.height / S, asc: size * 1.02 }); }, function () { res(null); }); }); }));
			}
			var links = [];
			function addLink(x1, y1, x2, y2, url) { links.push({ page: page, r: [x1, y1, x2, y2], url: url }); }
			// one paragraph of runs, wrapped; inline math is placed on the baseline at its own height
			function flow(runs, size, left, color, extraLead) {
				var items = [], x0 = M + left, maxW = W - left;
				runs.forEach(function (r) {
					if (r.t === "\n") { items.push({ br: true }); return; }
					if (r.tex && r.svg) { var bx = svgBox(r.svg), k = size / 1000; items.push({ m: r.svg, w: bx.w * k, asc: -bx.y * k, desc: (bx.h + bx.y) * k }); return; }
					var f = fontOf(r), sz = r.m || r.tex ? size * 0.92 : size;
					String(r.t).split(/(\s+)/).forEach(function (wd) {
						if (!wd) return;
						if (/^\s+$/.test(wd)) { items.push({ sp: f.widthOfTextAtSize(" ", sz) }); return; }
						if (ok(wd, f)) items.push({ t: wd, f: f, sz: sz, w: f.widthOfTextAtSize(wd, sz), u: r.u, c: r.u ? blue : color || ink });
						else items.push({ pic: wd, sz: sz, r: r, w: 0 });
					});
				});
				return Promise.all(items.map(function (it) { return it.pic ? wordPic(it.pic, it.sz, it.r).then(function (p) { it.p = p; it.w = p ? p.w : 0; }) : null; })).then(function () {
					var line = [], xp = 0;
					function flush() {
						while (line.length && line[line.length - 1].sp) line.pop();
						var asc = size * 0.93, desc = size * 0.27;
						line.forEach(function (it) { if (it.m) { asc = Math.max(asc, it.asc + 1); desc = Math.max(desc, it.desc + 1); } });
						room(asc + desc); var yb = PH - (y + asc), xx = x0;
						line.forEach(function (it) {
							if (it.sp) { xx += it.sp; return; }
							if (it.m) drawSvg(P, page, it.m, xx, yb, size, F, color || ink);
							else if (it.p) page.drawImage(it.p.im, { x: xx, y: yb - (it.p.h - it.p.asc), width: it.p.w, height: it.p.h });
							else if (it.t) { page.drawText(it.t, { x: xx, y: yb, size: it.sz, font: it.f, color: it.c }); if (it.u) { page.drawLine({ start: { x: xx, y: yb - 1.4 }, end: { x: xx + it.w, y: yb - 1.4 }, thickness: 0.5, color: blue }); if (/^(https?:|mailto:)/.test(it.u)) addLink(xx, yb - 2, xx + it.w, yb + it.sz * 0.8, it.u); } }
							xx += it.w;
						});
						y += asc + desc + size * (0.3 + (extraLead || 0)); line = []; xp = 0;
					}
					items.forEach(function (it) {
						if (it.br) { flush(); return; }
						if (it.sp) { if (line.length) { line.push(it); xp += it.sp; } return; }
						if (xp + it.w > maxW && line.length) flush();
						if (it.t && it.w > maxW) { // a very long word: cut it
							var s = it.t; while (s) { var n = s.length; while (n > 1 && it.f.widthOfTextAtSize(s.slice(0, n), it.sz) > maxW - xp) n--; var part = s.slice(0, n); line.push({ t: part, f: it.f, sz: it.sz, w: it.f.widthOfTextAtSize(part, it.sz), u: it.u, c: it.c }); s = s.slice(n); if (s) flush(); else xp += line[line.length - 1].w; }
							return;
						}
						if (it.m && it.w > maxW) { var k2 = maxW / it.w; it.w *= k2; it.asc *= k2; it.desc *= k2; }
						line.push(it); xp += it.w;
					});
					if (line.length) flush();
				});
			}
			newPage();
			var chain = Promise.resolve();
			B.forEach(function (b) {
				chain = chain.then(function () {
					if (b.k === "h") { y += 7; var hs = [0, 19, 16, 14, 12.5, 11.5, 11.5][b.lv] || 12; return flow(b.runs.map(function (r) { var c = {}; for (var q in r) c[q] = r[q]; c.b = true; return c; }), hs, 0).then(function () { y += 2; }); }
					if (b.k === "p") return flow(b.runs, 10.5, 18 * (b.d || 0)).then(function () { y += 5; });
					if (b.k === "li") return flow([{ t: b.mark + " " }].concat(b.runs), 10.5, 14 + 18 * b.d).then(function () { y += 2; });
					if (b.k === "quote") { var y0 = y, p0 = page; return flow(b.runs, 10.5, 16, grey).then(function () { if (page === p0) page.drawRectangle({ x: M + 3, y: PH - y, width: 2.5, height: y - y0 - 3, color: P.rgb(0.8, 0.82, 0.88) }); y += 5; }); }
					if (b.k === "code") {
						var cs = 8.8, lh = cs * 1.45, cw = F.mono.widthOfTextAtSize("M", cs), per = Math.max(10, Math.floor((W - 12) / cw));
						b.text.split("\n").forEach(function (l) {
							var parts = []; if (!l) parts.push(""); while (l.length) { parts.push(l.slice(0, per)); l = l.slice(per); }
							parts.forEach(function (s) { room(lh); page.drawRectangle({ x: M, y: PH - y - lh, width: W, height: lh, color: P.rgb(0.95, 0.953, 0.965) }); if (s) page.drawText(F.safe(s, F.mono), { x: M + 6, y: PH - y - lh + cs * 0.42, size: cs, font: F.mono, color: ink }); y += lh; });
						});
						y += 8; return;
					}
					if (b.k === "tex" && b.svg) {
						var bx = svgBox(b.svg), size = 12, k = size / 1000, w = bx.w * k, asc = -bx.y * k, desc = (bx.h + bx.y) * k;
						if (w > W) { size *= W / w; k = size / 1000; w = W; asc = -bx.y * k; desc = (bx.h + bx.y) * k; }
						y += 4; room(asc + desc); drawSvg(P, page, b.svg, M + (W - w) / 2, PH - (y + asc), size, F, ink); y += asc + desc + 9; return;
					}
					if (b.k === "tex") return flow([{ t: b.tex, tex: true }], 10.5, 30).then(function () { y += 5; });
					if (b.k === "img" && b.png) { var iw = b.pw, ih = b.ph, s2 = Math.min(1, W / iw, (PH - 2 * M) / ih); iw *= s2; ih *= s2; room(ih + 8); page.drawImage(b.png, { x: M, y: PH - y - ih, width: iw, height: ih }); y += ih + 8; return; }
					if (b.k === "table" && b.rows.length) {
						var n = Math.max.apply(null, b.rows.map(function (r) { return r.length; })), colW = W / n, ts = 9, tl = ts * 1.3;
						b.rows.forEach(function (r, i) {
							var f = i ? F.reg : F.bold;
							var lines = []; for (var j = 0; j < n; j++) { var out = [], cur = ""; String(r[j] == null ? "" : r[j]).split(/\s+/).forEach(function (wd) { wd = F.safe(wd, f); var tst = cur ? cur + " " + wd : wd; if (f.widthOfTextAtSize(tst, ts) > colW - 8 && cur) { out.push(cur); cur = wd; } else cur = tst; }); out.push(cur); lines.push(out); }
							var h = Math.max.apply(null, lines.map(function (l) { return l.length; })) * tl + 6; room(h);
							if (!i) page.drawRectangle({ x: M, y: PH - y - h, width: W, height: h, color: P.rgb(0.933, 0.94, 0.965) });
							for (var c = 0; c < n; c++) { page.drawRectangle({ x: M + c * colW, y: PH - y - h, width: colW, height: h, borderColor: P.rgb(0.78, 0.8, 0.84), borderWidth: 0.6 }); lines[c].forEach(function (l, q) { if (l) page.drawText(l, { x: M + c * colW + 4, y: PH - y - 3 - ts - q * tl, size: ts, font: f, color: ink }); }); }
							y += h;
						});
						y += 8;
					}
				});
			});
			return chain.then(function () {
				links.forEach(function (L) { try { var a = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: L.r, Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: P.PDFString.of(L.url) } })); L.page.node.addAnnot(a); } catch (e) { /* no link */ } });
				doc.setTitle(title.replace(/-/g, " ")); doc.setCreator("MES AI, mes.fm/ai"); doc.setProducer("MES AI (pdf-lib)");
				return doc.save();
			});
		}).then(function (bytes) { return new File([bytes], title + ".pdf", { type: "application/pdf" }); });
	}

	function openIn(kind, md, el) {
		var name = baseName(md);
		if (kind === "latex") {
			var L = texList(md), out = [], len = 0;
			L.forEach(function (t) { var s = t.d ? "$$\n" + t.tex + "\n$$" : "$" + t.tex + "$"; if (len + s.length < 6000) { out.push(s); len += s.length + 2; } });
			if (!out.length) return Promise.reject(new Error("This answer has no math to open."));
			window.open("/latex?tex=" + encodeURIComponent(out.join("\n\n")), "_blank", "noopener");
			return Promise.resolve(out.length < L.length ? "some" : "all");
		}
		if (kind === "text") return sendFile("/text", function () { return new File([md], name + ".md", { type: "text/markdown" }); });
		if (kind === "docx") return sendFile("/docx", function () { return docx(el, name); });
		if (kind === "pdf") return sendFile("/pdf", function () { return typeset(el).then(function () { return pdfVec(el, name).catch(function () { return pdf(el, name); }); }); });
		return Promise.reject(new Error("unknown"));
	}

	window.MESAIRich = { setT: function (fn) { T = fn; }, render: render, enhance: enhance, typeset: typeset, texList: texList, pullMath: pullMath, normSpec: normSpec, chartSvg: chartSvg, num: num, openIn: openIn, blocks: blocks, docx: docx, pdf: pdf, pdfVec: pdfVec, zip: zip, crc32: crc32 };
	if (typeof module !== "undefined" && module.exports) module.exports = window.MESAIRich;
})();

/* MES AI "on this device" (2026-11-22): a small open model running in the visitor's browser with WebLLM (MIT, github.com/mlc-ai/web-llm)
 * on the graphics chip (WebGPU). Nothing is sent to mes.fm or to an AI company: the model files come once from huggingface.co and the
 * browser keeps them (Cache API, "webllm/*" caches). WebLLM itself (one self-contained ES module, MESAI.LOCAL.url) is import()ed only
 * when a local model is used. The engine runs in a module Web Worker made from a Blob (so the page stays smooth), or on the page if a
 * worker can't be made. window.AILocal = {detect, has, remove, load, chat, stop, loaded}; used by app.js. Rules (models, device check,
 * history trim): lib.js (MESAI.MODELS with prov "local", localCheck, localTrim, splitThink). */
(function () {
	"use strict";
	var A = window.MESAI;
	if (!A || !A.LOCAL) return;
	var libP = null, engine = null, engineId = null, worker = null, envP = null, loadP = null;
	// the import is hidden from older parsers / bundlers the same way as the 3D graphing calculator does it
	function webllm() {
		if (!libP) libP = new Function("u", "return import(u)")(A.LOCAL.url).catch(function (e) { libP = null; throw e; });
		return libP;
	}
	// what this browser and graphics chip can do -> env for MESAI.localCheck
	function detect() {
		if (envP) return envP;
		var mem = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null;
		if (!navigator.gpu) return (envP = Promise.resolve({ gpu: false, mem: mem }));
		envP = Promise.resolve().then(function () { return navigator.gpu.requestAdapter({ powerPreference: "high-performance" }); }).then(function (ad) {
			if (!ad) return { gpu: true, adapter: false, mem: mem };
			return { gpu: true, adapter: true, f16: !!(ad.features && ad.features.has("shader-f16")), maxBuf: (ad.limits && ad.limits.maxBufferSize) || 0, mem: mem };
		}).catch(function () { return { gpu: true, adapter: false, mem: mem }; });
		return envP;
	}
	function has(id) { return webllm().then(function (w) { return w.hasModelInCache(id); }).catch(function () { return false; }); }
	function unload() {
		var e = engine; engine = null; engineId = null;
		if (e) try { e.unload(); } catch (x) {}
		if (worker) { try { worker.terminate(); } catch (x) {} worker = null; }
	}
	function remove(id) {
		if (engineId === id) unload();
		return webllm().then(function (w) { return w.deleteModelAllInfoInCache(id); });
	}
	function makeWorker() {
		var src = "import { WebWorkerMLCEngineHandler } from " + JSON.stringify(A.LOCAL.url) + ";\nconst h = new WebWorkerMLCEngineHandler();\nself.onmessage = (e) => h.onmessage(e);\n";
		return new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })), { type: "module" });
	}
	/* Download the model's weight files into WebLLM's own cache ("webllm/model", keyed by the huggingface.co URL exactly as WebLLM asks for
	   it) before WebLLM starts. WebLLM downloads 4 pieces at a time and gives up on the first dropped connection; on slow or shaky
	   connections that never finished. Here: 2 at a time, each piece retried, progress by the byte. Pieces already saved are skipped. */
	function prefetch(id, onProgress) {
		return webllm().then(function (w) {
			var rec = (w.prebuiltAppConfig.model_list || []).filter(function (m) { return m.model_id === id; })[0];
			if (!rec || !window.caches) return;
			var base = rec.model.replace(/\/?$/, "/"); if (!/\/resolve\/.+\//.test(base)) base += "resolve/main/";
			return caches.open("webllm/model").then(function (cache) {
				return fetch(base + "tensor-cache.json").then(function (r) { if (!r.ok) throw new Error("Request failed " + r.status); return r.json(); }).then(function (man) {
					return cache.keys().then(function (ks) {
						var have = {}; ks.forEach(function (k) { have[k.url] = 1; });
						var list = (man.records || []).map(function (x) { return { url: new URL(x.dataPath, base).href, n: x.nbytes || 0 }; });
						var total = list.reduce(function (t, x) { return t + x.n; }, 0) || 1, done = 0, live = {};
						var todo = list.filter(function (x) { if (have[x.url]) { done += x.n; return false; } return true; });
						if (!todo.length) return;
						var report = function () { var b = done; Object.keys(live).forEach(function (k) { b += live[k]; }); onProgress && onProgress({ progress: Math.min(1, b / total), dl: true }); };
						report();
						var one = function (x, tries) {
							live[x.url] = 0;
							return fetch(x.url).then(function (r) {
								if (!r.ok || !r.body) throw new Error("Request failed " + r.status);
								var rd = r.body.getReader(), parts = [];
								return (function pump() {
									return rd.read().then(function (c) {
										if (c.done) return;
										parts.push(c.value); live[x.url] += c.value.length; report();
										return pump();
									});
								})().then(function () { return cache.put(new Request(x.url), new Response(new Blob(parts), { headers: { "Content-Type": "application/octet-stream" } })); });
							}).then(function () { delete live[x.url]; done += x.n; report(); }, function (e) {
								delete live[x.url]; report();
								if (tries >= 6 || /quota/i.test(String(e && e.name) + String(e && e.message))) throw e;
								return new Promise(function (ok) { setTimeout(ok, 1000 + tries * 1500); }).then(function () { return one(x, tries + 1); });
							});
						};
						var next = 0, lane = function () { if (next >= todo.length) return Promise.resolve(); var x = todo[next++]; return one(x, 0).then(lane); };
						return Promise.all([lane(), lane()]);
					});
				});
			});
		});
	}
	// load (download the first time) model id; onProgress({progress 0..1, text}) -> Promise
	function load(id, onProgress) {
		if (engine && engineId === id) return Promise.resolve();
		if (loadP && loadP.id === id) return loadP;
		unload();
		var cfg = { initProgressCallback: function (p) { try { onProgress && onProgress(p || {}); } catch (e) {} } };
		var p = prefetch(id, onProgress).then(webllm).then(function (w) {
			var viaWorker = function () { worker = makeWorker(); return w.CreateWebWorkerMLCEngine(worker, id, cfg); };
			var onPage = function () { if (worker) { try { worker.terminate(); } catch (x) {} worker = null; } return w.CreateMLCEngine(id, cfg); };
			var go;
			try { go = viaWorker().catch(function (e) { if (/shader-f16|device was lost|out of memory|quota|storage/i.test(String(e && e.message))) throw e; return onPage(); }); }
			catch (e) { go = onPage(); }
			return go;
		}).then(function (e) { engine = e; engineId = id; loadP = null; }, function (e) { loadP = null; unload(); throw e; });
		p.id = id; loadP = p;
		return p;
	}
	/* a dropped connection on one of WebLLM's 4 parallel downloads fails the whole load ("Cache.add() encountered a network error"),
	   but the pieces already saved stay in the cache, so trying again carries on from there */
	function isNet(e) { return /network|Request failed|Failed to fetch|Load failed|Cache/i.test(String(e && (e.message || e))); }
	function loadRetry(id, onProgress, tries) {
		tries = tries || 0;
		return load(id, onProgress).catch(function (e) {
			if (!isNet(e) || tries >= 7) throw e;
			try { onProgress && onProgress({ retry: tries + 1, progress: null }); } catch (x) {}
			return new Promise(function (r) { setTimeout(r, 1500 + tries * 1500); }).then(function () { return loadRetry(id, onProgress, tries + 1); });
		});
	}
	/* stream an answer: messages = [{role, content}] incl. the system message; onPiece({t: "text", v} | {t: "done", stop}) */
	function chat(id, messages, maxOut, onPiece) {
		if (!engine || engineId !== id) return Promise.reject(new Error("The model is not loaded."));
		var req = { messages: messages, stream: true, max_tokens: maxOut, temperature: 0.6, top_p: 0.9 };
		if (/^Qwen3/.test(id)) req.extra_body = { enable_thinking: false };  // a small model's thinking would eat most of its short memory
		return engine.chat.completions.create(req).then(function (it) {
			var stop = null, iter = it[Symbol.asyncIterator]();
			return (function next() {
				return iter.next().then(function (x) {
					if (x.done) { onPiece({ t: "done", stop: stop === "length" ? "max_tokens" : stop === "abort" ? "stopped" : "end_turn" }); return; }
					var c = x.value && x.value.choices && x.value.choices[0];
					if (c && c.delta && c.delta.content) onPiece({ t: "text", v: c.delta.content });
					if (c && c.finish_reason) stop = c.finish_reason;
					return next();
				});
			})();
		});
	}
	function stop() { if (engine) try { engine.interruptGenerate(); } catch (e) {} }
	window.AILocal = { detect: detect, has: has, remove: remove, load: loadRetry, chat: chat, stop: stop, unload: unload, loaded: function () { return engineId; } };
})();


/* MES AI app: free tiers only (see ai-app/build-www.py). Runs after MESAI (lib.js) and before the page script: the saved
   model / picture model are set to free ones; the pickers only ever list the free ones (APP_PRUNE_JS after the page script). */
(function () {
	var A = window.MESAI; if (!A) return;
	window.MES_AI_APP = true;
	A.DEFAULT_MODEL = "qwen";
	var K = "mes-ai:v1", s = {};
	try { s = JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch (e) {}
	if (!A.MODELS[s.model] || !A.MODELS[s.model].free) s.model = "qwen";
	s.imod = A.FREE.picModel; s.tab = s.tab === "vid" ? "chat" : s.tab;
	try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) {}
})();

/* MES AI -- mes.fm/ai: AI chat (Claude) and pictures (GPT Image), paid per message in HBD.
 * Send: POST /api/ai {op:"quote"} -> exact price + memo "mesai:<id>" -> Keychain / HiveAuth transfer of that HBD to @mes
 * (MESHive.transfer) -> POST /api/ai {op:"run"} (402 while the transfer is not in a block yet: retried every 3 s) ->
 * NDJSON stream of the answer (pictures: JSON with base64 webp). A failed answer after payment offers one free Try again.
 * History only in this browser: localStorage "mes-ai:v1" (chats), IndexedDB "mes-ai" / "img" (pictures; list in "mes-ai:imgs").
 * Local preview (127.0.0.1 / localhost) or ?mock=1: an in-browser stand-in (fake account, fake payment, fake streamed answer
 * priced with the same rules), so the whole flow can be tried without keys or HBD. Rules + prices: lib.js (MESAI). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("ai");
	if (!root || !window.MESAI) return;
	var A = window.MESAI, H = window.MESHive;
	// translations: language pages set window.AI_I18N = {code, name, locale, dir, s: {"English": "translation"}} before this script
	var L = window.AI_I18N || null, LANG = (L && L.code) || "en", LOC = (L && L.locale) || "en-US";
	function T(s, v) { var t = L && L.s && L.s[s]; if (typeof t !== "string" || !t) t = s; return v ? t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : t; }
	var LS = "mes-ai:v1", LS_IMG = "mes-ai:imgs";
	var mock = (!window.MES_AI_APP && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) || /[?&]mock=1\b/.test(location.search);
	var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var status = { chat: mock, image: mock, video: mock, known: mock, prov: { anthropic: true, openai: true, xai: true, openrouter: true } };
	if (mock && /[?&]soon=1\b/.test(location.search)) { status.image = false; status.video = false; status.prov = { anthropic: true, openai: false, xai: false }; }
	// is this company's key set? (unknown until the status call answers: then everything shows as on)
	function provOn(p) { if (p === "local") return true; return !status.known || !status.prov || !!status.prov[p]; }
	var busy = false;
	// free daily messages (A.FREE): on / left come from /api/ai?op=free&acct=; in the local preview a counter in localStorage
	var FREEST = { on: mock, perDay: A.FREE.perDay, left: null };
	// free daily pictures (A.FREE.pics, Recraft's free copy on OpenRouter): same op=free answer (j.pics), same daily signature
	var PICST = { on: mock, perDay: A.FREE.pics, left: null };
	// the free model on this device (local.js = window.AILocal): device check, files already in this browser, loading progress
	var LOCST = { env: null, cached: {}, loaded: null, loading: null, prog: null, gen: false, err: "", want: false };
	var ATTACH_T = null;

	/* ---------- saved state ---------- */
	function load() { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
	var S = load() || {};
	if (!Array.isArray(S.chats)) S.chats = [];
	if (!A.MODELS[S.model]) S.model = A.DEFAULT_MODEL;
	if (!A.LENGTHS[S.len]) S.len = "medium";
	if (!A.IMAGES[S.imod]) S.imod = "gpt";
	if (!S.iq || typeof S.iq !== "object") S.iq = {};
	var qTab = /[?&]tab=(img|chat|vid)\b/.exec(location.search);
	if (qTab) S.tab = qTab[1];
	if (S.tab !== "img" && S.tab !== "vid") S.tab = "chat";
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { msg(T("This browser's storage is full: old chats could not be saved. Delete some."), "err"); } }
	function newChat() { var c = { id: A.newId(), title: T("New chat"), at: Date.now(), msgs: [] }; S.chats.unshift(c); S.cur = c.id; save(); return c; }
	function cur() { var c = S.chats.filter(function (x) { return x.id === S.cur; })[0]; return c || (S.chats[0] ? (S.cur = S.chats[0].id, S.chats[0]) : newChat()); }

	function msg(t, kind) { var m = $("ai-msg"); m.hidden = !t; m.textContent = t || ""; m.className = "tu-card ai-msg" + (kind ? " " + kind : ""); }

	/* ---------- the "You pay per message" box can be hidden (mes-ai:payhide = "1"); "About paying" by the tabs brings it back ---------- */
	(function () {
		var K = "mes-ai:payhide2";  // new key 2026-11-22: the box now shows the free ways too, so it comes back once for people who hid the old one
		function paint(h) { $("ai-pay").hidden = h; $("ai-payshow").hidden = !h; }
		paint((function () { try { return localStorage.getItem(K) === "1"; } catch (e) { return false; } })());
		$("ai-payhide").addEventListener("click", function () { try { localStorage.setItem(K, "1"); } catch (e) {} paint(true); $("ai-payshow").focus(); });
		$("ai-payshow").addEventListener("click", function () { try { localStorage.removeItem(K); } catch (e) {} paint(false); $("ai-pay").scrollIntoView({ block: "nearest", behavior: "smooth" }); $("ai-payhide").focus(); });
	})();

	/* ---------- account ---------- */
	var MOCK_USER = { name: "demo" };
	function who() { return mock ? MOCK_USER : (H && H.user()); }
	function paintAcct() {
		var u = who(), a = $("ai-acct");
		// in Fill window the account card is hidden once logged in; a small "@name" in the tab bar says who pays
		root.classList.toggle("ai-loggedin", !!u);
		$("ai-whochip").hidden = !u; $("ai-whochip").textContent = u ? "@" + u.name : "";
		if (mock) { a.innerHTML = '<p class="ai-demo">' + T("<b>Local preview:</b> payments and answers are simulated (account @demo, no HBD moves).") + '</p>'; $("ai-help").innerHTML = ""; return; }
		if (!H) { a.innerHTML = "<p>" + T("The Hive login could not load. Reload the page.") + "</p>"; return; }
		if (u) {
			a.innerHTML = '<div class="ai-user"><img src="' + esc(H.avatar(u.name)) + '" alt="" width="32" height="32"><span>' + T("Paying as {who}", { who: '<a href="' + esc(H.peakd(u.name) + "/wallet") + '" target="_blank" rel="noopener">@' + esc(u.name) + '</a>' }) + '</span><span class="ai-sw"></span><button type="button" class="tu-btn tu-btn--ghost" data-a="logout">' + T("Log out") + '</button></div>';
			$("ai-help").innerHTML = "";
			addSwitcher();
		} else {
			a.innerHTML = '<div class="ai-loginrow"><label class="tu-label" for="ai-user">' + T("Your Hive username") + '</label><input id="ai-user" class="tu-input" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="' + esc(T("e.g. mes")) + '">' +
				'<button type="button" class="tu-btn tu-btn--primary" data-a="login">' + T("Log in with Keychain") + '</button></div>';
			if (H.accounts && H.accounts().length) { a.querySelector(".ai-loginrow").insertAdjacentHTML("beforeend", '<span class="ai-sw"></span>'); addSwitcher(); }
			$("ai-user").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
			H.keychain(1500).then(function (k) { if (!k && !H.user()) $("ai-help").innerHTML = H.helpHtml(); });
		}
	}
	// "Switch account": the Hive accounts logged in on this browser (MESHive.switcher, shared by every Hive page)
	function addSwitcher() {
		var el = document.querySelector("#ai-acct .ai-sw");
		if (!el || !H.switcher) return;
		H.switcher(el, { onSwitch: function (u) { msg(u ? T("Now paying as @{name}.", { name: u.name }) : T("Logged out."), "ok"); paintAcct(); paintPrice(); }, onError: function (e) { msg(e.message, "err"); } });
	}
	if (H && H.onChange && !mock) H.onChange(function () { paintAcct(); if (FREEST.on) loadFree(); paintPrice(); });
	function doLogin() {
		var inp = $("ai-user");
		msg(T("Confirm the login in Hive Keychain…"));
		H.login(inp ? inp.value : "").then(function (u) { msg(T("Logged in as @{name}.", { name: u.name }), "ok"); paintAcct(); paintPrice(); })
			.catch(function (e) { msg(T(e.message), "err"); if (e.code === "nokeychain") $("ai-help").innerHTML = H.helpHtml(); });
	}
	$("ai-acct").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"); if (!b) return;
		if (b.dataset.a === "login") doLogin();
		if (b.dataset.a === "logout") { H.logout(); paintAcct(); }
	});

	/* ---------- Markdown ---------- */
	var mdLib = null;
	function loadMd() {
		if (mdLib) return mdLib;
		function js(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
		mdLib = Promise.all([js("https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"), js("https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js")])
			.then(function () { return !!(window.marked && window.DOMPurify); }, function () { return false; });
		return mdLib;
	}
	var mdReady = false;
	loadMd().then(function (ok) { mdReady = ok; if (ok) renderLog(); });
	function plainMd(t) { // fallback when the CDN is blocked: code blocks + paragraphs, everything escaped
		return String(t).split(/```/).map(function (part, i) {
			if (i % 2) { var nl = part.indexOf("\n"); var lang = nl > 0 ? part.slice(0, nl).trim() : ""; return "<pre><code" + (lang ? ' class="language-' + esc(lang) + '"' : "") + ">" + esc(nl > 0 ? part.slice(nl + 1) : part) + "</code></pre>"; }
			return part.split(/\n{2,}/).map(function (p) { return p.trim() ? "<p>" + esc(p).replace(/\n/g, "<br>").replace(/`([^`]+)`/g, "<code>$1</code>") + "</p>" : ""; }).join("");
		}).join("");
	}
	// rich answers (rich.js): Markdown + LaTeX ($...$, $$...$$), tables you can filter / sort / resize, ```chart blocks, code Copy
	var R = window.MESAIRich;
	if (R) R.setT(T);
	function md(t) { return R ? R.render(String(t), mdReady, plainMd) : mdReady ? window.DOMPurify.sanitize(window.marked.parse(String(t), { gfm: true, breaks: false }), { ADD_ATTR: ["target"] }) : plainMd(t); }
	function addCopyButtons(el, m) {
		if (R) R.enhance(el, { pending: !!(m && m.pending) }, copy);
		linkify(el);
		el.querySelectorAll("a[href^='http']").forEach(function (a) { a.target = "_blank"; a.rel = "noopener nofollow"; });
	}
	// any web address left as plain text (in answers and in your own messages) becomes a link: https://..., www.x.com, mes.fm/page
	var LINK_RE = /(\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'`]*|\b(?:[a-z0-9-]+\.)*(?:mes\.fm|peakd\.com|hive\.blog|ecency\.com|inleo\.io|3speak\.tv|youtube\.com|youtu\.be|github\.com|wikipedia\.org)(?:\/[^\s<>"'`]*)?)/gi;
	function linkify(root) {
		var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
			for (var p = n.parentNode; p && p !== root; p = p.parentNode) if (/^(A|CODE|PRE|BUTTON|SCRIPT|STYLE)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
			LINK_RE.lastIndex = 0; return LINK_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		} }), list = [], n;
		while ((n = w.nextNode())) list.push(n);
		list.forEach(function (node) {
			var t = node.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
			LINK_RE.lastIndex = 0;
			while ((m = LINK_RE.exec(t))) {
				var url = m[0], tail = "";
				while (/[.,;:!?)\]]$/.test(url) && !(url.slice(-1) === ")" && url.split("(").length >= url.split(")").length)) { tail = url.slice(-1) + tail; url = url.slice(0, -1); }
				if (!url) continue;
				frag.appendChild(document.createTextNode(t.slice(last, m.index)));
				var a = document.createElement("a");
				a.href = /^https?:/i.test(url) ? url : "https://" + url;
				a.textContent = url;
				frag.appendChild(a);
				if (tail) frag.appendChild(document.createTextNode(tail));
				last = m.index + m[0].length;
			}
			frag.appendChild(document.createTextNode(t.slice(last)));
			node.parentNode.replaceChild(frag, node);
		});
	}
	function copy(text, btn) {
		var done = function () { var o = btn.textContent; btn.textContent = T("Copied"); setTimeout(function () { btn.textContent = o; }, 1200); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
		else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
	}

	/* ---------- files with a message (pictures, PDFs, text files) ---------- */
	// Pictures are shrunk here to at most 1568 px (what the models look at anyway), PDFs go as they are, text / code files are
	// added to the message as a code block. The files stay in this browser (IndexedDB 'f:<id>'); messages keep only their names.
	var PEND = [], TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|m?js|ts|py|java|c|cpp|h|cs|go|rs|rb|php|sh|sql|ya?ml|ini|log|srt|vtt|tex)$/i;
	var fileUrls = {};
	function b64(buf) { var b = new Uint8Array(buf), s = "", step = 0x8000; for (var i = 0; i < b.length; i += step) s += String.fromCharCode.apply(null, b.subarray(i, i + step)); return btoa(s); }
	function pdfPages(buf) { var t = new TextDecoder("latin1").decode(new Uint8Array(buf)), m = t.match(/\/Type\s*\/Page(?![s\w])/g); return m ? m.length : 1; }
	function pendChars() { return PEND.reduce(function (n, f) { return n + f.data.length; }, 0); }
	function shrinkImage(file, max) {
		var MAX = max || 1568;
		return createImageBitmap(file).then(function (bm) {
			var k = Math.min(1, MAX / Math.max(bm.width, bm.height)), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
			// small JPEG / PNG / WebP / GIF that need no shrinking go as they are (keeps transparency and GIF animation)
			if (k === 1 && file.size < 900000 && A.FILES.img.indexOf(file.type) >= 0) return file.arrayBuffer().then(function (buf) { return { mt: file.type, data: b64(buf), w: w, h: h }; });
			var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
			var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(bm, 0, 0, w, h);
			return new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.86); }).then(function (bl) { return bl.arrayBuffer(); }).then(function (buf) { return { mt: "image/jpeg", data: b64(buf), w: w, h: h }; });
		});
	}
	function addFiles(list) {
		var files = [].slice.call(list || []);
		if (!files.length) return;
		var chain = Promise.resolve(), notes = [];
		files.forEach(function (f) {
			chain = chain.then(function () {
				var name = f.name || "picture", type = f.type || "";
				if (PEND.length >= A.FILES.perMsg) { notes.push(T("At most {n} files in one message.", { n: A.FILES.perMsg })); return; }
				if (/^image\//.test(type)) {
					return shrinkImage(f).then(function (r) {
						if (pendChars() + r.data.length > A.FILES.total) { notes.push(T("{name}: too big together with the other files.", { name: name })); return; }
						PEND.push({ id: A.newId(), t: "img", mt: r.mt, name: name, data: r.data });
					}, function () { notes.push(T("{name}: this picture type can't be read here. Use JPEG or PNG.", { name: name })); });
				}
				if (type === "application/pdf" || /\.pdf$/i.test(name)) {
					return f.arrayBuffer().then(function (buf) {
						var d = b64(buf);
						if (pendChars() + d.length > A.FILES.total) { notes.push(T("{name}: too big (PDFs up to about {mb} MB together).", { name: name, mb: (Math.round(A.FILES.total * 0.75 / 1e6 * 10) / 10).toLocaleString(LOC) })); return; }
						PEND.push({ id: A.newId(), t: "pdf", mt: "application/pdf", name: name, data: d, pages: pdfPages(buf) });
					});
				}
				if (/^text\//.test(type) || TEXT_EXT.test(name) || /json|xml|javascript/.test(type)) {
					if (f.size > 200000) { notes.push(T("{name}: text files up to 200 KB.", { name: name })); return; }
					return f.text().then(function (t) {
						var inp = $("ai-in"), ext = (name.match(/\.(\w+)$/) || [, ""])[1].toLowerCase();
						inp.value = (inp.value.trim() ? inp.value.replace(/\s+$/, "") + "\n\n" : "") + name + ":\n```" + ext + "\n" + t.replace(/\s+$/, "") + "\n```\n";
					});
				}
				notes.push(T("{name}: only pictures, PDFs and text files can be added (save Word files as PDF).", { name: name }));
			});
		});
		chain.then(function () { paintFiles(); paintPrice(); if (notes.length) msg(notes.join(" "), "err"); else msg(""); });
	}
	function fileIcon(f) { return f.t === "pdf" ? "📄" : "🖼"; }
	function paintFiles() {
		var box = $("ai-files");
		box.hidden = !PEND.length;
		box.innerHTML = PEND.map(function (f, i) {
			var pic = f.t === "img" ? '<img alt="" src="data:' + f.mt + ";base64," + f.data + '">' : '<span class="ai-fic" aria-hidden="true">' + fileIcon(f) + "</span>";
			return '<span class="ai-file">' + pic + '<span class="ai-fname" title="' + esc(f.name) + '">' + esc(f.name) + (f.pages ? " · " + (f.pages === 1 ? T("{n} page", { n: 1 }) : T("{n} pages", { n: f.pages })) : "") + '</span><button type="button" data-unfile="' + i + '" aria-label="' + T("Remove {name}", { name: esc(f.name) }) + '" title="' + esc(T("Remove")) + '">×</button></span>';
		}).join("");
	}
	$("ai-files").addEventListener("click", function (e) { var b = e.target.closest("[data-unfile]"); if (!b || busy) return; PEND.splice(+b.dataset.unfile, 1); paintFiles(); paintPrice(); });
	$("ai-attach").addEventListener("click", function () { $("ai-file").click(); });
	$("ai-file").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
	$("ai-in").addEventListener("paste", function (e) {
		var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []);
		if (fs.length && !e.clipboardData.getData("text/plain")) { e.preventDefault(); addFiles(fs); }
	});
	(function () {
		var zone = document.querySelector("#ai .ai-compose"), n = 0;
		if (!zone) return;
		zone.addEventListener("dragenter", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) { n++; zone.classList.add("ai-drop"); } });
		zone.addEventListener("dragleave", function () { if (--n <= 0) { n = 0; zone.classList.remove("ai-drop"); } });
		zone.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) e.preventDefault(); });
		zone.addEventListener("drop", function (e) { n = 0; zone.classList.remove("ai-drop"); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
	})();
	function fileGet(id) { return idbDo("readonly", function (s) { return s.get("f:" + id); }).catch(function () { return null; }); }
	function filePut(f) { return idbDo("readwrite", function (s) { return s.put({ t: f.t, mt: f.mt, name: f.name, data: f.data, pages: f.pages || 0 }, "f:" + f.id); }); }
	// fills in the pictures of the shown messages from IndexedDB
	function paintMsgFiles(log) {
		log.querySelectorAll("img[data-fk]").forEach(function (im) {
			var k = im.dataset.fk;
			im.onclick = function () { if (fileUrls[k]) window.open(fileUrls[k], "_blank", "noopener"); };
			if (fileUrls[k]) { im.src = fileUrls[k]; return; }
			fileGet(k).then(function (f) {
				if (!f) { im.replaceWith(Object.assign(document.createElement("span"), { className: "ai-sub", textContent: T("(picture not in this browser)") })); return; }
				var bin = atob(f.data), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
				fileUrls[k] = URL.createObjectURL(new Blob([u], { type: f.mt })); im.src = fileUrls[k];
			});
		});
	}
	// the messages to send, with the files' data: the newest files first until the size cap, older ones are noted instead
	function withFileData(msgs) {
		var need = [];
		msgs.forEach(function (m) { (m.fmeta || []).forEach(function (f) { need.push(f.id); }); });
		return Promise.all(need.map(function (id) { var p = PEND.filter(function (x) { return x.id === id; })[0]; return p ? Promise.resolve(p) : fileGet(id); })).then(function (got) {
			var by = {}; need.forEach(function (id, i) { by[id] = got[i]; });
			var room = A.FILES.total, out = msgs.map(function (m) { return { role: m.role, content: m.content }; });
			for (var i = msgs.length - 1; i >= 0; i--) {
				var fm = msgs[i].fmeta; if (!fm || !fm.length) continue;
				var files = [], left = 0;
				fm.forEach(function (f) {
					var d = by[f.id];
					if (d && d.data.length <= room) { room -= d.data.length; files.push({ t: d.t, mt: d.mt, name: d.name, data: d.data, pages: d.pages || undefined }); }
					else left++;
				});
				if (files.length) out[i].files = files;
				if (left) out[i].content = (out[i].content ? out[i].content + "\n\n" : "") + "[" + left + " file" + (left > 1 ? "s" : "") + " sent with this message earlier " + (left > 1 ? "are" : "is") + " not included again.]";
			}
			return out;
		});
	}

	/* ---------- chat log ---------- */
	function modelName(k) { return (A.MODELS[k] && A.MODELS[k].name) || k; }
	function renderMsg(m, i) {
		var mine = m.role === "user";
		var meta = "";
		if (mine && m.local) meta = '<span class="ai-meta">' + T("🖥️ free, on this device") + " · " + esc(modelName(m.model)) + "</span>";
		else if (mine && m.free) meta = '<span class="ai-meta">' + T("🎁 free") + " · " + esc(modelName(m.model)) + "</span>";
		else if (mine && m.price) meta = '<span class="ai-meta">' + esc(m.price) + " HBD · " + esc(modelName(m.model)) + " · " + esc(T(A.LENGTHS[m.len] || "")) + (m.memo ? ' · <a href="' + (mock ? "#" : "https://hivehub.dev/@" + esc(m.acct || "") + "/wallet") + '" target="_blank" rel="noopener" title="' + esc(T("Payment memo")) + '">' + esc(m.memo) + "</a>" : "") + "</span>";
		var mf = mine && m.files && m.files.length ? '<div class="ai-mfiles">' + m.files.map(function (f) {
			return f.t === "img" ? '<img data-fk="' + esc(f.id) + '" alt="' + esc(f.name || T("picture")) + '" title="' + esc(f.name || "") + '">' :
				'<span class="ai-file"><span class="ai-fic" aria-hidden="true">📄</span><span class="ai-fname">' + esc(f.name || "file.pdf") + (f.pages ? " · " + (f.pages === 1 ? T("{n} page", { n: 1 }) : T("{n} pages", { n: f.pages })) : "") + "</span></span>";
		}).join("") + "</div>" : "";
		var body = mine ? mf + (m.content ? '<div class="ai-text ai-plain">' + esc(m.content) + "</div>" : "") : '<div class="ai-text ai-md">' + (m.content ? md(m.content) : m.error ? "" : m.thinking ? '<p class="ai-thinking">' + T("Thinking…") + '</p>' : '<p class="ai-thinking">' + T("Waiting for the answer…") + '</p>') + "</div>";
		var foot = "";
		if (!mine) {
			if (m.stop === "max_tokens" && A.isLocal(m.model)) foot += '<p class="ai-note">' + T('The answer reached its length. Send "continue" for more, or pick a longer answer.') + '</p>';
			else if (m.stop === "max_tokens") foot += '<p class="ai-note">' + T('The answer reached the length you paid for. Send "continue" for more, or pick a longer answer.') + '</p>';
			if (m.stop === "stopped") foot += '<p class="ai-note">' + T("Stopped.") + '</p>';
			if (m.stop === "refusal") foot += '<p class="ai-note">' + T("The AI declined to answer this.") + '</p>';
			if (m.error) foot += '<p class="ai-note ai-err">' + esc(T(m.error)) + "</p>" + (m.retryId ? '<button type="button" class="tu-btn tu-btn--primary" data-retry="' + i + '">' + T("Try again (free)") + '</button>' : "");
			if (m.content && !m.pending) foot += '<div class="ai-macts"><button type="button" class="ai-mini" data-copy="' + i + '">' + T("Copy answer") + '</button><span class="ai-openin">' + T("Open in:") +
				' <button type="button" class="ai-mini" data-open="text" data-oi="' + i + '" title="' + esc(T("Formatted, with Read aloud and Print to PDF")) + '">' + T("Text Viewer") + '</button>' +
				'<button type="button" class="ai-mini" data-open="docx" data-oi="' + i + '" title="' + esc(T("A Word document of this answer")) + '">' + T("Word") + '</button>' +
				'<button type="button" class="ai-mini" data-open="pdf" data-oi="' + i + '" title="' + esc(T("A PDF of this answer, with its equations and charts")) + '">PDF</button>' +
				(R && R.texList(m.content).length ? '<button type="button" class="ai-mini" data-open="latex" data-oi="' + i + '" title="' + esc(T("Open the equations in MES LaTeX Render")) + '">LaTeX</button>' : "") + "</span></div>";
		}
		return '<div class="ai-m ' + (mine ? "ai-m--me" : "ai-m--ai") + '" data-i="' + i + '"><div class="ai-who">' + (mine ? T("You") : "MES AI") + meta + "</div>" + body + foot + "</div>";
	}
	var elCache = new WeakMap();
	function msgKey(m, i) { return [i, m.role, (m.content || "").length, (m.content || "").slice(-24), m.pending ? 1 : 0, m.thinking ? 1 : 0, m.error || "", m.retryId || "", m.stop || "", m.price || "", (m.files || []).length, mdReady ? 1 : 0].join("\u0001"); }
	function msgEl(m, i) {
		var k = msgKey(m, i), c = elCache.get(m);
		if (c && c.k === k) return c.el;
		var d = document.createElement("div"); d.innerHTML = renderMsg(m, i);
		var el = d.firstChild; if (m.pending) el.setAttribute("data-pending", "1"); addCopyButtons(el, m); paintMsgFiles(el);
		elCache.set(m, { k: k, el: el });
		return el;
	}
	function renderLog() {
		var c = cur(), log = $("ai-log");
		var nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
		if (!c.msgs.length) {
			log.innerHTML = '<div class="ai-empty"><p>' + T("<b>Ask anything.</b> Free with your Hive login: 10 messages a day, short answers.") + '</p><p class="ai-try">' + T("Try:") +
				' <button type="button" class="ai-mini" data-ex="' + esc(T("Explain recursion with a short JavaScript example.")) + '">' + T("Explain recursion") + '</button>' +
				' <button type="button" class="ai-mini" data-ex="' + esc(T("Write a polite email asking my landlord to fix the heating.")) + '">' + T("Write an email") + '</button>' +
				' <button type="button" class="ai-mini" data-ex="' + esc(T("What is the derivative of x^2 sin x? Show the steps.")) + '">' + T("Derivative steps") + '</button></p></div>';
		} else {
			// each message is built once and kept (typeset math, sorted tables and charts survive the next repaint); only a changed one is rebuilt
			var els = c.msgs.map(msgEl);
			if (log.querySelector(".ai-empty")) log.innerHTML = "";
			var kids = [].slice.call(log.children);
			if (kids.length !== els.length || kids.some(function (k, j) { return k !== els[j]; })) { els.forEach(function (e, j) { if (log.children[j] !== e) log.insertBefore(e, log.children[j] || null); }); while (log.children.length > els.length) log.lastChild.remove(); }
		}
		if (nearEnd || busy) log.scrollTop = log.scrollHeight;
		if (R) R.typeset(log);
		paintChats();
	}
	/* ---------- the chat list (2026-11-20): search, pinned on top, folders, rename / move / delete with Undo, sort, left or right ---------- */
	// S.folders = [{n: name, c: collapsed}], S.csort = "recent" | "old" | "name", S.side = "l" | "r", S.sideOff = list hidden (wide view)
	if (!Array.isArray(S.folders)) S.folders = [];
	if (["recent", "old", "name"].indexOf(S.csort) < 0) S.csort = "recent";
	if (S.side !== "r") S.side = "l";
	var cq = "", menuFor = null, renaming = null, narrowOpen = {}, dragId = null;
	function folderNames() { return S.folders.map(function (f) { return f.n; }); }
	function ensureFolder(n) { n = A.cleanFolder(n); if (n && folderNames().indexOf(n) < 0) S.folders.push({ n: n, c: false }); return n; }
	S.chats.forEach(function (c) { if (c.folder) ensureFolder(c.folder); });
	function touch(c) { c.mt = Date.now(); }
	function when(t) {
		if (!t) return "";
		var d = new Date(t), now = new Date(), day = 864e5;
		if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(LOC, { hour: "numeric", minute: "2-digit" });
		if (now - d < 6 * day) return d.toLocaleDateString(LOC, { weekday: "short" });
		return d.toLocaleDateString(LOC, d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
	}
	function sorted(list) {
		var by = S.csort === "name" ? function (a, b) { return a.title.localeCompare(b.title, LOC, { numeric: true, sensitivity: "base" }); } : S.csort === "old" ? function (a, b) { return a.at - b.at; } : function (a, b) { return b.at - a.at; };
		return list.slice().sort(by);
	}
	function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
	// a search hit: every word must be in the title or the messages; returns a short snippet around the first word found in the text
	function hit(c, words) {
		var title = norm(c.title), text = c.msgs.map(function (m) { return m.content || ""; }).join("\n"), nt = norm(text);
		if (!words.every(function (w) { return title.indexOf(w) >= 0 || nt.indexOf(w) >= 0; })) return null;
		var w0 = words.filter(function (w) { return title.indexOf(w) < 0 && nt.indexOf(w) >= 0; })[0] || words.filter(function (w) { return nt.indexOf(w) >= 0; })[0];
		if (!w0) return { snip: "" };
		var at = nt.indexOf(w0), a = Math.max(0, at - 40), b = Math.min(text.length, at + w0.length + 60);
		return { snip: (a ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ") + (b < text.length ? "…" : ""), w: words };
	}
	function mark(s, words) { // escaped text with the searched words marked
		var e = esc(s); if (!words || !words.length) return e;
		words.forEach(function (w) { if (w.length < 2) return; e = e.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;").replace(/</g, "&lt;") + ")", "gi"), "<mark>$1</mark>"); });
		return e;
	}
	function rowHtml(c, h, words) {
		var n = Math.ceil(c.msgs.length / 2), isCur = c.id === S.cur;
		var title = renaming === c.id ? '<input class="ai-crename" type="text" maxlength="120" value="' + esc(c.title) + '" aria-label="' + esc(T("Chat name")) + '">' : '<span class="ai-ctitle">' + mark(c.title, words) + "</span>";
		var sub = (n ? (n === 1 ? T("{n} message", { n: 1 }) : T("{n} messages", { n: n })) + " · " : "") + esc(when(c.at)) + (words && c.folder ? " · 📁 " + esc(c.folder) : "");
		var row = '<div class="ai-crow' + (isCur ? " is-cur" : "") + '" role="listitem" data-cid="' + esc(c.id) + '" draggable="' + (renaming === c.id ? "false" : "true") + '">' +
			(renaming === c.id ? '<div class="ai-copen">' + title + '</div>' : '<button type="button" class="ai-copen" data-copen="' + esc(c.id) + '"' + (isCur ? ' aria-current="true"' : "") + ">" + title + '<span class="ai-csub">' + sub + "</span>" + (h && h.snip ? '<span class="ai-csnip">' + mark(h.snip, words) + "</span>" : "") + "</button>") +
			'<button type="button" class="ai-cic ai-cpin" data-cpin="' + esc(c.id) + '" aria-pressed="' + !!c.pin + '" title="' + esc(c.pin ? T("Unpin") : T("Pin to the top")) + '" aria-label="' + esc(c.pin ? T("Unpin") : T("Pin to the top")) + '">📌</button>' +
			'<button type="button" class="ai-cic" data-cmore="' + esc(c.id) + '" aria-haspopup="true" aria-expanded="' + (menuFor === c.id) + '" title="' + esc(T("More")) + '" aria-label="' + esc(T("More for {title}", { title: c.title })) + '">⋯</button></div>';
		if (menuFor === c.id) {
			row += '<div class="ai-cmenu" role="menu">' +
				'<button type="button" role="menuitem" data-cact="rename">✎ ' + T("Rename") + "</button>" +
				'<button type="button" role="menuitem" data-cact="pin">📌 ' + (c.pin ? T("Unpin") : T("Pin to the top")) + "</button>" +
				'<label class="ai-cmove"><span>📁 ' + T("Move to") + '</span><select data-cmove data-native><option value="">' + esc(T("No folder")) + "</option>" + folderNames().map(function (f) { return '<option value="' + esc(f) + '"' + (c.folder === f ? " selected" : "") + ">" + esc(f) + "</option>"; }).join("") + '<option value="\u0001new">' + esc(T("New folder…")) + "</option></select></label>" +
				'<button type="button" role="menuitem" data-cact="del" class="ai-cdel">🗑 ' + T("Delete") + "</button></div>";
		}
		return row;
	}
	function paintChats() {
		var box = $("ai-clist"); if (!box) return;
		var words = norm(cq).split(/\s+/).filter(Boolean), html = [];
		if (words.length) {
			var hits = sorted(S.chats).map(function (c) { return { c: c, h: hit(c, words) }; }).filter(function (x) { return x.h; });
			html.push('<p class="ai-cnote">' + (hits.length ? (hits.length === 1 ? T("{n} chat found", { n: 1 }) : T("{n} chats found", { n: hits.length })) : T("No chat has that.")) + "</p>");
			hits.forEach(function (x) { html.push(rowHtml(x.c, x.h, words)); });
		} else {
			var pins = sorted(S.chats.filter(function (c) { return c.pin; }));
			if (pins.length) { html.push('<div class="ai-chead">📌 ' + T("Pinned") + "</div>"); pins.forEach(function (c) { html.push(rowHtml(c)); }); }
			var fnames = S.folders.slice().sort(function (a, b) { return a.n.localeCompare(b.n, LOC, { numeric: true, sensitivity: "base" }); });
			fnames.forEach(function (f) {
				var inF = sorted(S.chats.filter(function (c) { return c.folder === f.n && !c.pin; })), all = S.chats.filter(function (c) { return c.folder === f.n; }).length;
				html.push('<div class="ai-fhead" data-fold="' + esc(f.n) + '"><button type="button" class="ai-ftog" data-ftog="' + esc(f.n) + '" aria-expanded="' + !f.c + '"><span class="ai-fcar" aria-hidden="true">' + (f.c ? "▸" : "▾") + "</span> 📁 " + esc(f.n) + ' <span class="ai-fn">' + all + "</span></button>" +
					'<button type="button" class="ai-cic" data-fren="' + esc(f.n) + '" title="' + esc(T("Rename folder")) + '" aria-label="' + esc(T("Rename folder")) + '">✎</button>' +
					'<button type="button" class="ai-cic" data-fdel="' + esc(f.n) + '" title="' + esc(T("Delete folder (its chats stay)")) + '" aria-label="' + esc(T("Delete folder (its chats stay)")) + '">✕</button></div>');
				if (!f.c) { html.push('<div class="ai-fbody" data-fold="' + esc(f.n) + '">'); inF.forEach(function (c) { html.push(rowHtml(c)); }); if (!inF.length) html.push('<p class="ai-cnote">' + T("Empty: drag chats here, or use ⋯ › Move to.") + "</p>"); html.push("</div>"); }
			});
			var rest = sorted(S.chats.filter(function (c) { return !c.pin && !(c.folder && folderNames().indexOf(c.folder) >= 0); }));
			if ((pins.length || fnames.length) && (rest.length || dragId !== null)) html.push('<div class="ai-chead" data-fold="">💬 ' + T("Chats") + "</div>");
			else if (pins.length || fnames.length) html.push('<div class="ai-chead ai-chead--drop" data-fold="">💬 ' + T("Chats") + "</div>");
			html.push('<div class="ai-fbody" data-fold="">'); rest.forEach(function (c) { html.push(rowHtml(c)); }); html.push("</div>");
		}
		box.innerHTML = html.join("");
		var ct = cur(); $("ai-curtitle").textContent = ct.msgs.length ? ct.title : "";
		$("ai-sidebtn").querySelector(".ai-cn").textContent = S.chats.filter(function (c) { return c.msgs.length; }).length || "";
		var ri = box.querySelector(".ai-crename"); if (ri) { ri.focus(); ri.select(); }
		if (menuFor) { var mm = box.querySelector(".ai-cmenu button"); if (mm && document.activeElement && document.activeElement.closest && !document.activeElement.closest(".ai-cmenu")) mm.focus(); }
	}
	function openChat(id) { if (busy) return; S.cur = id; menuFor = null; save(); if (narrowOpen["ai-chat"]) { narrowOpen["ai-chat"] = false; paintSide(); } renderLog(); paintPrice(); }
	function byId(id) { return S.chats.filter(function (c) { return c.id === id; })[0]; }

	// Undo for deletes: the removed chat (or folder) is put back exactly where it was
	var undoT = null;
	function undoBar(text, undo) {
		var u = $("ai-undo"); clearTimeout(undoT);
		u.innerHTML = '<span></span><button type="button" class="tu-btn tu-btn--ghost">' + T("Undo") + '</button><button type="button" class="ai-cic" aria-label="' + esc(T("Close")) + '">✕</button>';
		u.firstChild.textContent = text; u.hidden = false;
		u.children[1].onclick = function () { u.hidden = true; undo(); };
		u.children[2].onclick = function () { u.hidden = true; };
		undoT = setTimeout(function () { u.hidden = true; }, 8000);
	}
	function delChat(id) {
		var i = -1; S.chats.forEach(function (c, j) { if (c.id === id) i = j; });
		if (i < 0 || busy) return;
		var c = S.chats[i], wasCur = S.cur === id;
		S.chats.splice(i, 1); if (wasCur) S.cur = null; menuFor = null; save(); renderLog(); paintPrice();
		if (!c.msgs.length) return;
		undoBar(T('Deleted "{title}".', { title: c.title.slice(0, 40) }), function () { S.chats.splice(Math.min(i, S.chats.length), 0, c); if (wasCur) S.cur = c.id; save(); renderLog(); paintPrice(); });
	}
	function askFolder(def) { var n = prompt(T("Folder name"), def || ""); return n == null ? null : A.cleanFolder(n); }
	function moveTo(c, f) { c.folder = f || undefined; if (!f) delete c.folder; touch(c); save(); paintChats(); }

	$("ai-csearch").addEventListener("input", function () { cq = this.value; menuFor = null; paintChats(); });
	$("ai-csearch").addEventListener("keydown", function (e) { if (e.key === "Escape" && this.value) { e.preventDefault(); this.value = cq = ""; paintChats(); } if (e.key === "Enter") { var f = $("ai-clist").querySelector("[data-copen]"); if (f) openChat(f.dataset.copen); } });
	$("ai-csort").value = S.csort;
	$("ai-csort").addEventListener("change", function () { S.csort = this.value; save(); paintChats(); });
	$("ai-addfolder").addEventListener("click", function () { var n = askFolder(); if (!n) return; ensureFolder(n); save(); paintChats(); });
	$("ai-clist").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		var d = b.dataset;
		if (d.copen) openChat(d.copen);
		else if (d.cpin) { var c = byId(d.cpin); if (c) { c.pin = !c.pin; if (!c.pin) delete c.pin; touch(c); save(); paintChats(); } }
		else if (d.cmore) { menuFor = menuFor === d.cmore ? null : d.cmore; paintChats(); }
		else if (d.cact) {
			var c2 = byId(menuFor); if (!c2) return;
			if (d.cact === "rename") { renaming = c2.id; menuFor = null; paintChats(); }
			if (d.cact === "pin") { c2.pin = !c2.pin; if (!c2.pin) delete c2.pin; touch(c2); menuFor = null; save(); paintChats(); }
			if (d.cact === "del") delChat(c2.id);
		}
		else if (d.ftog) { S.folders.forEach(function (f) { if (f.n === d.ftog) f.c = !f.c; }); save(); paintChats(); }
		else if (d.fren) {
			var n = askFolder(d.fren); if (!n || n === d.fren) return;
			var other = folderNames().indexOf(n) >= 0;
			S.folders = S.folders.filter(function (f) { return !(other && f.n === d.fren); }); S.folders.forEach(function (f) { if (f.n === d.fren) f.n = n; });
			S.chats.forEach(function (c) { if (c.folder === d.fren) { c.folder = n; touch(c); } }); save(); paintChats();
		}
		else if (d.fdel) {
			var fi = -1; S.folders.forEach(function (f, j) { if (f.n === d.fdel) fi = j; });
			if (fi < 0) return;
			var fo = S.folders[fi], members = S.chats.filter(function (c) { return c.folder === fo.n; });
			S.folders.splice(fi, 1); members.forEach(function (c) { delete c.folder; touch(c); }); save(); paintChats();
			undoBar(T('Deleted the folder "{name}" (its chats are under Chats).', { name: fo.n }), function () { S.folders.splice(fi, 0, fo); members.forEach(function (c) { c.folder = fo.n; touch(c); }); save(); paintChats(); });
		}
	});
	$("ai-clist").addEventListener("change", function (e) {
		if (!e.target.matches("[data-cmove]")) return;
		var c = byId(menuFor), v = e.target.value; if (!c) return;
		if (v === "\u0001new") { v = askFolder(); if (!v) { paintChats(); return; } ensureFolder(v); }
		menuFor = null; moveTo(c, v);
	});
	$("ai-clist").addEventListener("dblclick", function (e) { var r = e.target.closest("[data-copen]"); if (r && !busy) { renaming = r.dataset.copen; paintChats(); } });
	$("ai-clist").addEventListener("keydown", function (e) {
		if (e.target.matches(".ai-crename")) {
			if (e.key === "Enter") { e.preventDefault(); commitRename(e.target); }
			if (e.key === "Escape") { e.preventDefault(); renaming = null; paintChats(); }
			return;
		}
		if (e.key === "F2") { var r = e.target.closest("[data-cid]"); if (r) { renaming = r.dataset.cid; paintChats(); } }
		if (e.key === "Delete" && e.target.matches("[data-copen]")) delChat(e.target.dataset.copen);
		if (e.key === "Escape" && menuFor) { var id = menuFor; menuFor = null; paintChats(); var mb = $("ai-clist").querySelector('[data-cmore="' + id + '"]'); if (mb) mb.focus(); }
		if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.matches("[data-copen]")) {
			var all = [].slice.call($("ai-clist").querySelectorAll("[data-copen]")), k = all.indexOf(e.target) + (e.key === "ArrowDown" ? 1 : -1);
			if (all[k]) { e.preventDefault(); all[k].focus(); }
		}
	});
	function commitRename(inp) {
		if (!renaming) return;
		var c = byId(renaming), v = inp.value.replace(/\s+/g, " ").trim().slice(0, 120);
		renaming = null;
		if (c && v && v !== c.title) { c.title = v; touch(c); save(); }
		setTimeout(paintChats, 0);
	}
	$("ai-clist").addEventListener("focusout", function (e) { if (e.target.matches(".ai-crename")) commitRename(e.target); });
	// drag a chat onto a folder (or onto "Chats" to take it out)
	$("ai-clist").addEventListener("dragstart", function (e) { var r = e.target.closest("[data-cid]"); if (!r) return; dragId = r.dataset.cid; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", byId(dragId).title); } catch (x) {} r.classList.add("is-drag"); });
	$("ai-clist").addEventListener("dragend", function () { dragId = null; [].forEach.call($("ai-clist").querySelectorAll(".is-drag, .is-over"), function (x) { x.classList.remove("is-drag", "is-over"); }); });
	$("ai-clist").addEventListener("dragover", function (e) { var t = dragId && e.target.closest("[data-fold]"); if (!t) return; e.preventDefault(); [].forEach.call($("ai-clist").querySelectorAll(".is-over"), function (x) { if (x !== t) x.classList.remove("is-over"); }); t.classList.add("is-over"); });
	$("ai-clist").addEventListener("drop", function (e) { var t = dragId && e.target.closest("[data-fold]"); if (!t) return; e.preventDefault(); var c = byId(dragId); if (c) moveTo(c, t.dataset.fold); });
	document.addEventListener("click", function (e) { if (menuFor && !e.target.closest(".ai-cmenu, [data-cmore]")) { menuFor = null; paintChats(); } });

	// the list on the left or the right, shown or hidden; under ~720 px wide it folds above the chat (☰ opens it).
	// The Pictures and Videos tabs have the same side list (2026-11-21): one shared choice (S.side, S.sideOff) for all three tabs.
	var PANELS = ["ai-chat", "ai-img", "ai-vid"];
	function narrowOf(id) { return $(id).classList.contains("ai-narrow"); }
	function paintSide() {
		PANELS.forEach(function (id) {
			var ch = $(id), n = narrowOf(id), open = n ? !!narrowOpen[id] : !S.sideOff, fl = ch.querySelector("[data-flip]");
			ch.classList.toggle("ai-side-r", S.side === "r"); ch.classList.toggle("ai-side-off", !open);
			ch.querySelector("[data-side]").setAttribute("aria-expanded", open);
			fl.hidden = n;
			fl.title = S.side === "r" ? T("Put the list on the left") : T("Put the list on the right");
			fl.setAttribute("aria-label", fl.title);
		});
	}
	PANELS.forEach(function (id) {
		var ch = $(id), last = null;
		ch.querySelector("[data-side]").addEventListener("click", function () {
			if (narrowOf(id)) narrowOpen[id] = !narrowOpen[id]; else { S.sideOff = !S.sideOff; save(); }
			paintSide();
			if (!ch.classList.contains("ai-side-off")) { var se = ch.querySelector(".ai-csearch"); if (se) se.focus(); }
		});
		ch.querySelector("[data-flip]").addEventListener("click", function () { S.side = S.side === "r" ? "l" : "r"; save(); paintSide(); });
		function fit() { var w = ch.clientWidth; if (!w) return; var n = w < 720; if (n !== last) { last = n; ch.classList.toggle("ai-narrow", n); paintSide(); } }
		if (window.ResizeObserver) new ResizeObserver(fit).observe(ch); else window.addEventListener("resize", fit);
		fit();
	});
	paintSide();
	$("ai-new").addEventListener("click", function () { if (busy) return; var c = cur(); if (c.msgs.length) newChat(); if (cq) { cq = $("ai-csearch").value = ""; } renderLog(); paintPrice(); $("ai-in").focus(); });
	$("ai-log").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.ex) { $("ai-in").value = b.dataset.ex; paintPrice(); $("ai-in").focus(); }
		if (b.dataset.copy) copy(cur().msgs[+b.dataset.copy].content, b);
		if (b.dataset.open && R) {
			var mm = cur().msgs[+b.dataset.oi], box = b.closest(".ai-m"), md0 = box && box.querySelector(".ai-md");
			if (!mm || !md0) return;
			if (b.dataset.open !== "latex" && !window.indexedDB) { msg(T("This browser can't hand files to another page."), "err"); return; }
			R.openIn(b.dataset.open, mm.content, md0).then(function (r) { if (r === "some") msg(T("Only the first equations fit in one link."), "ok"); }, function (e) { msg(T(e.message), "err"); });
		}
		if (b.dataset.retry) retry(+b.dataset.retry);
	});

	/* ---------- options + live price ---------- */
	// model lists grouped by company; a company whose key is not set yet shows its models greyed out with "(soon)"
	function fillModels() {
		var groups = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)", openrouter: T("Cheap (DeepSeek, Qwen, Llama)"), local: T("🎁 Free, on this device") };
		$("ai-model").innerHTML = Object.keys(groups).map(function (p) {
			return '<optgroup label="' + groups[p] + '">' + Object.keys(A.MODELS).filter(function (k) { return A.MODELS[k].prov === p; }).map(function (k) {
				if (p === "local") { var lk = LOCST.env ? A.localCheck(k, LOCST.env) : null; return '<option value="' + k + '">' + esc(A.MODELS[k].name) + " · " + esc(gb(A.MODELS[k].mb)) + (lk && !lk.ok ? " · " + T("not on this device") : "") + "</option>"; }
				return '<option value="' + k + '"' + (provOn(p) ? "" : " disabled") + ">" + esc(A.MODELS[k].name.replace(/^ChatGPT: /, "")) + (provOn(p) ? "" : " (" + T("soon") + ")") + "</option>";
			}).join("") + "</optgroup>";
		}).join("");
		if (!provOn(A.MODELS[S.model].prov)) { var alt = Object.keys(A.MODELS).filter(function (k) { return provOn(A.MODELS[k].prov); })[0]; if (alt) S.model = alt; }
		$("ai-model").value = S.model;
		var igroups = { openrouter: T("Cheap (FLUX, Recraft, Seedream)"), openai: "ChatGPT (OpenAI)", xai: "Grok (xAI)" };
		$("ai-imod").innerHTML = Object.keys(igroups).map(function (p) {
			return '<optgroup label="' + esc(igroups[p]) + '">' + Object.keys(A.IMAGES).filter(function (k) { return A.IMAGES[k].prov === p; }).map(function (k) { var im = A.IMAGES[k], on = provOn(im.prov); return '<option value="' + k + '"' + (on ? "" : " disabled") + ">" + esc(T(im.name)) + (on ? "" : " (" + T("soon") + ")") + "</option>"; }).join("") + "</optgroup>";
		}).join("");
		if (!provOn(A.IMAGES[S.imod].prov)) { var ia = Object.keys(A.IMAGES).filter(function (k) { return provOn(A.IMAGES[k].prov); })[0]; if (ia) S.imod = ia; }
		$("ai-imod").value = S.imod;
		fillQuality();
		if (V) fillVmodels();
	}
	// picture quality: GPT Image = Draft / Good / Best, Grok Imagine = 1k / 2k; each company's last choice is remembered
	function fillQuality() {
		var im = A.IMAGES[S.imod], x = im.prov === "xai" || !!im.res;
		var opts = im.res ? Object.keys(im.res).reduce(function (o, k) { o[k] = A.XIMAGE.res[k]; return o; }, {}) : x ? A.XIMAGE.res : { low: T("Draft (fast, cheap)"), medium: T("Good"), high: T("Best") };
		var want = S.iq[im.prov] && opts[S.iq[im.prov]] ? S.iq[im.prov] : (x ? "1k" : "medium");
		$("ai-q").innerHTML = Object.keys(opts).map(function (k) { return '<option value="' + k + '"' + (k === want ? " selected" : "") + ">" + esc(x ? T(opts[k]) : opts[k]) + "</option>"; }).join("");
		$("ai-imodel").textContent = T("{company}'s {model}", { company: A.PROVIDERS[im.prov], model: im.name.replace(/ \(.*\)$/, "") });
	}
	fillModels();
	$("ai-imod").addEventListener("change", function () { S.imod = this.value; save(); fillQuality(); paintRefs("img"); paintPrice(); });
	$("ai-q").addEventListener("change", function () { S.iq[A.IMAGES[S.imod].prov] = this.value; save(); paintPrice(); });
	$("ai-len").innerHTML = Object.keys(A.LENGTHS).map(function (k) { return '<button type="button" data-len="' + k + '" aria-pressed="' + (k === S.len) + '">' + esc(T(A.LENGTHS[k])) + "</button>"; }).join("");
	$("ai-model").addEventListener("change", function () { S.model = this.value; save(); paintPrice(); if (A.isLocal(S.model)) localPick(); });
	$("ai-len").addEventListener("click", function (e) { var b = e.target.closest("[data-len]"); if (!b) return; S.len = b.dataset.len; save(); [].forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", x === b); }); paintPrice(); });
	function draftMessages() {
		var text = $("ai-in").value.trim();
		var hist = cur().msgs.filter(function (m) { return (m.content || (m.files && m.files.length)) && !m.error; }).map(function (m) { var o = { role: m.role, content: m.content || "" }; if (m.files && m.files.length) { o.fmeta = m.files; o.files = m.files; } return o; });
		// a failed / unanswered exchange is not sent again: keep turns valid
		var clean = [];
		hist.forEach(function (m) { if (clean.length % 2 === 0 ? m.role === "user" : m.role === "assistant") clean.push(m); });
		if (clean.length % 2) clean.pop();
		if (text || PEND.length) clean.push({ role: "user", content: text, fmeta: PEND.slice(), files: PEND.slice() });
		return clean;
	}
	function usdOf(q) { return A.fmtUsd(q.hbd * A.HBD_USD); }
	// what this chat has cost so far + a rough price for the next message (history ~ characters / 4); only a hint, the quote is the price
	function paintCost() {
		var c = cur(), el = $("ai-cost"), k = A.chatCostSoFar(c, S.model, freeApplies() ? "short" : S.len);
		el.hidden = !c.msgs.length;
		if (!c.msgs.length) return;
		el.innerHTML = T("This chat so far: <b>{p} HBD</b>", { p: k.price }) + ' <span class="ai-sub">(' + (k.paid === 1 ? T("{n} paid message", { n: 1 }) : T("{n} paid messages", { n: k.paid })) + ")</span> · " +
			T("history about {t} tokens", { t: k.tokens.toLocaleString(LOC) }) + " · " + (freeApplies() ? T("next message <b>free</b>") : T("next message about <b>{p} HBD</b>", { p: k.next.price })) +
			'<br><span class="ai-sub">' + T("The whole history is sent again with every message, so long chats cost more. A new chat is cheaper.") + "</span>";
	}
	(function () { if (window.MES_AI_APP) return; // "Typical costs" table, worked out from MESAI's prices so it follows them
		var sizes = [5000, 25000, 50000], rows = A.typicalCosts(["sonnet", "opus"], sizes, "medium");
		$("ai-ttable").innerHTML = "<tr><th>" + T("Model (Medium answer)") + "</th>" + sizes.map(function (t) { return "<th>" + T("{k}k tokens of history", { k: t / 1000 }) + "</th>"; }).join("") + "</tr>" +
			rows.map(function (r) { return "<tr><td>" + esc(r.name) + "</td>" + r.cells.map(function (c) { return "<td>" + T("about {p} HBD", { p: c.price }) + "</td>"; }).join("") + "</tr>"; }).join("");
		var ss = A.sessionCost("sonnet", "medium", 30, 50000);
		$("ai-tsession").textContent = T("A 30-message coding chat that grows to 50k tokens costs about {p} HBD in all on Sonnet. Starting a new chat when the topic changes keeps it cheap.", { p: (Math.round(ss.hbd * 10) / 10).toLocaleString(LOC) });
	})();
	function paintPrice() {
		var m = A.MODELS[S.model], fr = freeApplies();
		if (m.prov === "local") return paintLocalPrice();
		$("ai-local").hidden = true; $("ai-stop").hidden = true;
		$("ai-attach").disabled = false; if (ATTACH_T != null) $("ai-attach").title = ATTACH_T;
		var words = Math.round((fr ? A.FREE.maxOut : m.caps[S.len]) * 0.75).toLocaleString(LOC);
		// a free message always gets a Short answer: the length buttons show that while free messages are on
		$("ai-len").classList.toggle("is-free", fr);
		[].forEach.call($("ai-len").children, function (x) { x.setAttribute("aria-pressed", fr ? x.dataset.len === "short" : x.dataset.len === S.len); });
		$("ai-modelnote").textContent = T(m.blurb) + " " + (m.thinks ? T("Answer up to about {n} words (its thinking counts too).", { n: words }) : T("Answer up to about {n} words.", { n: words }));
		paintFree();
		var msgs = draftMessages(), q = A.chatQuote(S.model, A.estimateChatTokens(msgs.length ? msgs : [{ role: "user", content: "" }]), S.len);
		var nEx = Math.floor(msgs.length / 2);
		var hist = msgs.length > 1 ? ' <span class="ai-sub">' + (nEx === 1 ? T("incl. {n} earlier exchange", { n: nEx }) : T("incl. {n} earlier exchanges", { n: nEx })) + "</span>" : "";
		$("ai-price").innerHTML = T("about <b>{p} HBD</b>", { p: q.price }) + " <span class=\"ai-sub\">(" + usdOf(q) + ")</span>" + hist;
		paintCost();
		var on = status.chat && provOn(m.prov) && !busy;
		$("ai-send").disabled = !on;
		$("ai-send").textContent = busy ? T("Working…") : freeApplies() ? T("Send free") : T("Pay & send");
		if (freeApplies()) $("ai-price").innerHTML = "<b>" + T("🎁 Free") + '</b> <span class="ai-sub">' + T("Short answer") + "</span>";
		var nr = M ? M.img.pend.length : 0, iq = A.imageQuote($("ai-q").value, $("ai-size").value, Math.ceil($("ai-prompt").value.length / 2) + 8, S.imod, nr);
		$("ai-iprice").innerHTML = "<b>" + iq.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(iq) + ")</span>" + (nr ? ' <span class="ai-sub">' + (nr === 1 ? T("incl. {n} picture", { n: 1 }) : T("incl. {n} pictures", { n: nr })) + "</span>" : "");
		var ion = status.image && provOn(A.IMAGES[S.imod].prov);
		$("ai-make").disabled = !(ion && !busy);
		$("ai-make").textContent = ion ? (nr ? T("Pay & change") : T("Pay & create")) : T("Coming soon");
		paintPicFree();
		if (picsApplies()) { $("ai-iprice").innerHTML = "<b>" + T("🎁 Free") + "</b>"; if (ion) $("ai-make").textContent = T("Create free"); }
		if (window.MES_AI_APP) { var u0 = who();
			if (!freeApplies()) { $("ai-price").innerHTML = !u0 ? T("Log in with Hive above for 10 free messages a day") : FREEST.left === 0 ? T("No free messages left today: they come back at 00:00 UTC") : T("Checking your free messages…"); $("ai-send").textContent = T("Send"); }
			if (!picsApplies()) { $("ai-iprice").innerHTML = !u0 ? T("Log in with Hive above for 3 free pictures a day") : PICST.left === 0 ? T("No free pictures left today: they come back at 00:00 UTC") : T("Checking your free pictures…"); $("ai-make").textContent = T("Create"); }
		}
		$("ai-iattach").hidden = !A.maxRefs("image", S.imod) && !nr;
		if (typeof paintVprice === "function") paintVprice();
	}
	["ai-in", "ai-prompt"].forEach(function (id) { $(id).addEventListener("input", paintPrice); });
	$("ai-vprompt").addEventListener("input", paintVprice);
	["ai-q", "ai-size"].forEach(function (id) { $(id).addEventListener("change", paintPrice); });
	$("ai-in").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
	$("ai-send").addEventListener("click", function () { send(); });

	/* ---------- price table in the "how" box ---------- */
	(function () {
		document.querySelectorAll("[data-margin]").forEach(function (x) { x.textContent = A.MARGIN; }); document.querySelectorAll("[data-freeday]").forEach(function (x) { x.textContent = A.FREE.perDay; });
		$("ai-checked").textContent = A.PRICES_CHECKED;
		var rows = ["<tr><th>" + T("Model") + "</th><th>" + T("Short") + "</th><th>" + T("Medium") + "</th><th>" + T("Long") + "</th></tr>"];
		Object.keys(A.MODELS).filter(function (k) { return !A.isLocal(k); }).forEach(function (k) {
			rows.push("<tr><td>" + esc(A.MODELS[k].name) + "</td>" + Object.keys(A.LENGTHS).map(function (l) { return "<td>" + A.chatQuote(k, 500, l).price + " HBD</td>"; }).join("") + "</tr>");
		});
		rows.push('<tr><td colspan="4" class="ai-sub">' + T("A new chat with a short question (about 500 tokens sent). Longer chats cost more.") + '</td></tr>');
		rows.push("<tr><th>" + T("Picture (square)") + "</th><th>" + T("Draft") + "</th><th>" + T("Good") + "</th><th>" + T("Best") + "</th></tr><tr><td>" + esc(T(A.IMAGES.gpt.name)) + "</td>" + ["low", "medium", "high"].map(function (ql) { return "<td>" + A.imageQuote(ql, "1024x1024", 40).price + " HBD</td>"; }).join("") + "</tr>");
		rows.push("<tr><th>" + T("Picture (any shape)") + "</th><th>1k</th><th>2k</th><th></th></tr>");
		Object.keys(A.IMAGES).filter(function (k) { return A.IMAGES[k].prov !== "openai"; }).forEach(function (k) { var im = A.IMAGES[k]; rows.push("<tr><td>" + esc(T(im.name)) + "</td>" + ["1k", "2k"].map(function (rq) { return "<td>" + (!im.res || im.res[rq] != null ? A.imageQuote(rq, "1024x1024", 0, k).price + " HBD" : "–") + "</td>"; }).join("") + "<td></td></tr>"); });
		rows.push("<tr><th>" + T("Video (lowest quality)") + "</th><th>" + T("Short") + "</th><th>" + T("Medium") + "</th><th>" + T("Long") + "</th></tr>");
		Object.keys(A.VIDEO.models).forEach(function (k) {
			var ds = A.videoDurations(k), r0 = A.videoRes(k)[0], pick = [ds[0], ds[Math.floor((ds.length - 1) / 2)], ds[ds.length - 1]];
			rows.push("<tr><td>" + esc(T(A.VIDEO.models[k].name)) + ' <span class="ai-sub">' + r0 + "</span></td>" + pick.map(function (d) { return "<td>" + A.videoQuote(k, d, r0).price + " HBD <span class=\"ai-sub\">" + T("{n} s", { n: d }) + "</span></td>"; }).join("") + "</tr>");
		});
		rows.push('<tr><td colspan="4" class="ai-sub">' + T("Higher quality costs more per second; the exact price is shown before you pay.") + '</td></tr>');
		$("ai-ptable").innerHTML = rows.join("");
	})();

	/* ---------- talking to the server (or the local stand-in) ---------- */
	function post(body) {
		return fetch("https://mes.fm/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "omit" });
	}
	function jsonOf(r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); }
	var MOCK_Q = {};
	function quote(body) {
		if (mock) {
			return new Promise(function (res) {
				setTimeout(function () {
					var q = body.kind === "image" ? A.imageQuote(body.quality, body.size, Math.ceil(body.prompt.length / 2) + 8, body.model, (body.refs || []).length) : A.chatQuote(body.model, A.estimateChatTokens(body.messages), body.len);
					var id = A.newId(); MOCK_Q[id] = { body: body, q: q, tries: 0 };
					res({ status: 200, id: id, memo: A.memoFor(id), to: A.PAY_TO, price: q.price, usd: q.hbd, inTokens: q.inTokens, maxOut: q.maxOut || 0 });
				}, 250);
			});
		}
		return post(Object.assign({ op: "quote", lang: LANG }, body)).then(jsonOf);
	}
	function pay(q) {
		if (mock) return new Promise(function (res) { setTimeout(res, 500); });
		return H.transfer(A.PAY_TO, q.price, "HBD", q.memo);
	}
	function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	// returns the fetch Response once the server found the payment (or a final error object)
	function runReq(id, acct, onWait) {
		if (mock) return Promise.resolve({ mock: id });
		var tries = 0;
		function go() {
			return post({ op: "run", id: id, acct: acct }).then(function (r) {
				if ((r.status === 402 || (r.status === 502 && !/ndjson/.test(r.headers.get("content-type") || ""))) && tries < 12) {
					return jsonOf(r).then(function (j) {
						if (!j.pending) return { error: j };
						tries++; onWait && onWait(tries);
						return sleep(3000).then(go);
					});
				}
				return r;
			});
		}
		return go();
	}
	var MOCK_ANSWER = "Here is a **simulated** answer (local preview: no AI was called and no HBD moved).\n\nRecursion is when a function calls itself on a smaller piece of the problem until it reaches a case it can answer directly:\n\n```js\nfunction factorial(n) {\n  if (n <= 1) return 1;      // the base case\n  return n * factorial(n - 1);\n}\nconsole.log(factorial(5)); // 120\n```\n\n- Every call waits for the smaller one to finish.\n- Without a base case it would never stop.\n\nOn mes.fm this answer would come from the model you picked.";
	function mockStream(id, onPiece) {
		var info = MOCK_Q[id]; info.tries++;
		if (/fail/i.test(JSON.stringify(info.body.messages || "")) && info.tries === 1) return sleep(600).then(function () { onPiece({ t: "error", msg: T("Simulated failure after payment."), retry: true }); });
		var words = MOCK_ANSWER.split(/(?=\s)/), i = 0;
		if (info.body.model === "opus") onPiece({ t: "think" });
		return new Promise(function (res) {
			(function tick() {
				if (i >= words.length) { onPiece({ t: "done", stop: "end_turn" }); return res(); }
				onPiece({ t: "text", v: words.slice(i, i + 3).join("") }); i += 3;
				setTimeout(tick, 35);
			})();
		});
	}
	function readStream(r, onPiece) {
		if (r.mock) return mockStream(r.mock, onPiece);
		if (r.error) { onPiece({ t: "error", msg: T(r.error.error) || T("Could not get the answer."), retry: !!r.error.retry }); return Promise.resolve(); }
		var ct = r.headers.get("content-type") || "";
		if (!/ndjson/.test(ct)) return jsonOf(r).then(function (j) { onPiece({ t: "error", msg: T(j.msg || j.error) || T("Could not get the answer (HTTP {s}).", { s: j.status }), retry: !!j.retry }); });
		var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
		return (function pump() {
			return rd.read().then(function (x) {
				if (x.done) { if (buf.trim()) try { onPiece(JSON.parse(buf)); } catch (e) {} return; }
				buf += dec.decode(x.value, { stream: true });
				var lines = buf.split("\n"); buf = lines.pop();
				lines.forEach(function (l) { if (l.trim()) try { onPiece(JSON.parse(l)); } catch (e) {} });
				return pump();
			});
		})();
	}

	/* ---------- free daily messages ---------- */
	function freeKey(a) { return "mes-ai:free:" + a; }
	function freeApplies() {
		var m = A.MODELS[S.model], u = who();
		return !!(FREEST.on && m && m.free && u && FREEST.left > 0 && S.free !== false && provOn(m.prov));
	}
	function paintFree() {
		var m = A.MODELS[S.model], box = $("ai-free"), u = who();
		var show = FREEST.on && m && m.free && u && FREEST.left != null;
		box.hidden = !show;
		if (!show) return;
		$("ai-freeuse").checked = S.free !== false;
		$("ai-freeuse").disabled = FREEST.left <= 0;
		$("ai-freetx").textContent = FREEST.left > 0 ? T("🎁 Free: {n}/{m} left today", { n: FREEST.left, m: FREEST.perDay }) : T("🎁 No free messages left today");
		box.title = FREEST.left > 0 ? T("Use my free messages: {n} of {m} left today (Short answers, cheap models)", { n: FREEST.left, m: FREEST.perDay })
			: T("No free messages left today: they come back at 00:00 UTC. Paid messages on this model cost about 0.004 HBD.");
	}
	function loadFree() {
		var u = who(); if (!u) { FREEST.left = null; paintPrice(); return; }
		if (mock) {
			var d = null; try { d = JSON.parse(localStorage.getItem(freeKey(u.name) + ":mock") || "null"); } catch (e) {}
			FREEST.left = d && d.day === A.utcDay() ? d.left : A.FREE.perDay;
			var dp = null; try { dp = JSON.parse(localStorage.getItem(freeKey(u.name) + ":pmock") || "null"); } catch (e) {}
			PICST.left = dp && dp.day === A.utcDay() ? dp.left : A.FREE.pics; paintPrice(); return;
		}
		fetch("https://mes.fm/api/ai?op=free&acct=" + encodeURIComponent(u.name), { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
			FREEST.on = !!j.on; FREEST.perDay = j.perDay || A.FREE.perDay; FREEST.left = j.on ? j.left : null;
			var p = j.pics || {}; PICST.on = !!p.on; PICST.perDay = p.perDay || A.FREE.pics; PICST.left = p.on ? p.left : null; paintPrice();
		}).catch(function () {});
	}
	$("ai-freeuse").addEventListener("change", function () { S.free = this.checked; save(); paintPrice(); });
	/* free daily pictures: the free model (A.FREE.picModel) at 1k, no pictures added, ticked, some left today */
	function picsApplies() {
		var nr = M ? M.img.pend.length : 0;
		return !!(PICST.on && who() && PICST.left > 0 && S.ifree !== false && A.freePicOk(S.imod, $("ai-q").value, nr) && provOn("openrouter"));
	}
	function paintPicFree() {
		var box = $("ai-ifree"), u = who(), fm = A.FREE.picModel, nr = M ? M.img.pend.length : 0;
		var show = !!(PICST.on && u && PICST.left != null && S.imod === fm);
		box.hidden = !show;
		if (!show) return;
		var fits = A.freePicOk(S.imod, $("ai-q").value, nr);
		$("ai-ifreeuse").checked = S.ifree !== false;
		$("ai-ifreeuse").disabled = PICST.left <= 0 || !fits;
		$("ai-ifreetx").textContent = PICST.left > 0 ? T("🎁 Free: {n}/{m} pictures left today", { n: PICST.left, m: PICST.perDay }) : T("🎁 No free pictures left today");
		box.title = !fits ? T("Free pictures are 1k, without pictures added.") : PICST.left > 0 ? T("Use my free pictures: {n} of {m} left today", { n: PICST.left, m: PICST.perDay }) : T("No free pictures left today: they come back at 00:00 UTC.");
	}
	$("ai-ifreeuse").addEventListener("change", function () { S.ifree = this.checked; save(); paintPrice(); });
	// one free picture: the daily signature, then op "freepic" -> JSON {t:"image", b64, mime} like a paid picture
	function freePic(u, prompt, quality, size) {
		var tries = 0;
		function go(fresh) {
			return daySig(u.name, fresh).then(function (ds) {
				msg(T("Making your free picture (this takes up to a minute)…"));
				if (mock) {
					PICST.left = Math.max(0, PICST.left - 1);
					try { localStorage.setItem(freeKey(u.name) + ":pmock", JSON.stringify({ day: A.utcDay(), left: PICST.left })); } catch (e) {}
					if (/fail/i.test(prompt)) { PICST.left++; return sleep(800).then(function () { throw new Error(T("Simulated failure: your free picture was not used.")); }); }
					return sleep(1000).then(function () { return mockImage(prompt, size, []); });
				}
				return post({ op: "freepic", acct: u.name, day: ds.day, sig: ds.sig, model: A.FREE.picModel, prompt: prompt, quality: quality, size: size }).then(function (r) {
					var l = r.headers.get("X-Free-Left");
					return jsonOf(r).then(function (j) {
						if (j.t === "image") { if (l != null) PICST.left = +l; return b64Blob(j.b64, j.mime); }
						if (j.resign && tries++ < 1) { try { localStorage.removeItem(freeKey(u.name) + ":sig"); } catch (e) {} return go(true); }
						if (j.left === 0) PICST.left = 0;
						throw new Error(j.resign ? T("Hive could not confirm the signature. Log in again with Keychain and retry.") : T(j.msg || j.error) || T("Could not make it (HTTP {s}).", { s: j.status }));
					});
				});
			});
		}
		return go(false);
	}
	// the once-a-day proof of the account: a Keychain signature of A.freeMessage (no payment, no fee); kept for the day
	function daySig(acct, fresh) {
		var day = A.utcDay(), k = freeKey(acct) + ":sig", c = null;
		try { c = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) {}
		if (!fresh && c && c.day === day && c.sig) return Promise.resolve({ day: day, sig: c.sig });
		if (mock) return Promise.resolve({ day: day, sig: new Array(131).join("0") });
		msg(T("Confirm in Hive Keychain once today to use your free messages (a signature, no payment)…"));
		return H.keychain(1500).then(function (kc) {
			if (!kc) throw new Error(T("Hive Keychain is needed for free messages."));
			return new Promise(function (res, rej) {
				kc.requestSignBuffer(acct, A.freeMessage(acct, day), "Posting", function (r) {
					if (!r || !r.success || !r.result) return rej(H.kcError ? H.kcError(r || {}) : new Error((r && r.message) || "Cancelled"));
					try { localStorage.setItem(k, JSON.stringify({ day: day, sig: String(r.result) })); } catch (e) {}
					res({ day: day, sig: String(r.result) });
				}, null, "MES AI free messages");
			});
		});
	}
	function freeReq(body) {
		if (mock) {
			var u = who(), id = A.newId(); MOCK_Q[id] = { body: body, tries: 0 };
			FREEST.left = Math.max(0, FREEST.left - 1);
			try { localStorage.setItem(freeKey(u.name) + ":mock", JSON.stringify({ day: A.utcDay(), left: FREEST.left })); } catch (e) {}
			return Promise.resolve({ mock: id });
		}
		return post(body);
	}
	function sendFree(c, draft, text, u) {
		setBusy(true);
		var tries = 0;
		function go(fresh) {
			return daySig(u.name, fresh).then(function (ds) {
				msg(T("Sending your free message…"));
				return freeReq({ op: "free", acct: u.name, day: ds.day, sig: ds.sig, model: S.model, lang: LANG, messages: draft.map(function (m) { return { role: m.role, content: m.content }; }) });
			}).then(function (r) {
				if (r.mock) return r;
				if (/ndjson/.test(r.headers.get("content-type") || "")) { var l = r.headers.get("X-Free-Left"); if (l != null) FREEST.left = +l; return r; }
				return jsonOf(r).then(function (j) {
					if (j.resign && tries++ < 1) { try { localStorage.removeItem(freeKey(u.name) + ":sig"); } catch (e) {} return go(true); }
					if (j.left === 0) FREEST.left = 0;
					if (j.budget) FREEST.left = 0;
					throw new Error(j.resign ? T("Hive could not confirm the signature. Log in again with Keychain and retry.") : T(j.error || j.msg) || T("Could not send it (HTTP {s}).", { s: j.status }));
				});
			});
		}
		var err = A.checkMessages(draft) || A.checkTextOnly(S.model, draft);
		if (err) { msg(T(err), "err"); setBusy(false); return; }
		return go(false).then(function (r) {
			msg("");
			var um = { role: "user", content: text, at: Date.now(), free: true, model: S.model, len: "short", acct: u.name };
			var am = { role: "assistant", content: "", at: Date.now(), pending: true, model: S.model };
			if (!c.msgs.length) c.title = text.replace(/\s+/g, " ").slice(0, 60);
			c.msgs.push(um, am); c.at = Date.now();
			S.chats.sort(function (a, b) { return b.at - a.at; });
			$("ai-in").value = ""; save(); renderLog();
			var last = 0;
			return readStream(r, function (p) {
				if (p.t === "text") { am.content += p.v; if (Date.now() - last > 90) { last = Date.now(); renderLog(); } }
				else if (p.t === "done") { am.stop = p.stop; am.pending = false; }
				else if (p.t === "error") { am.error = p.msg; am.pending = false; if (p.free) FREEST.left++; }
			}).catch(function () { am.error = T("The connection broke before the answer finished."); }).then(function () {
				am.pending = false;
				if (!am.error && !am.content) am.error = T("No answer came back.");
				save(); renderLog();
			});
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? T("Cancelled: nothing was sent.") : T(m), "err");
		}).then(function () { setBusy(false); });
	}

	/* ---------- send a chat message ---------- */
	function setBusy(b) { busy = b; root.classList.toggle("ai-busy", b); paintPrice(); }

	/* ---------- free model on this device (local.js = window.AILocal, WebLLM) ---------- */
	function gb(mb) { return mb >= 1000 ? T("{n} GB", { n: (Math.round(mb / 100) / 10).toLocaleString(LOC) }) : T("{n} MB", { n: mb }); }
	function localNow() { var ck = A.localCheck(S.model, LOCST.env || {}); return { m: A.MODELS[S.model], ck: ck }; }
	// picked (or saved) a local model: look at the device, then whether its files are already in this browser
	function localPick() {
		if (!window.AILocal) return;
		window.AILocal.detect().then(function (env) {
			var first = !LOCST.env; LOCST.env = env;
			if (first) fillModels();
			var x = localNow();
			paintPrice();
			if (x.ck.ok && LOCST.cached[x.ck.id] == null) window.AILocal.has(x.ck.id).then(function (h) { LOCST.cached[x.ck.id] = !!h; paintPrice(); });
		});
	}
	function paintLocalPrice() {
		if (ATTACH_T == null) ATTACH_T = $("ai-attach").title;
		var x = localNow(), m = x.m, ck = x.ck, box = $("ai-local");
		$("ai-free").hidden = true;
		$("ai-len").classList.remove("is-free");
		[].forEach.call($("ai-len").children, function (b) { b.setAttribute("aria-pressed", b.dataset.len === S.len); });
		$("ai-modelnote").textContent = T(m.blurb) + " " + T("Answer up to about {n} words.", { n: Math.round(m.caps[S.len] * 0.75).toLocaleString(LOC) });
		$("ai-price").innerHTML = "<b>" + T("🎁 Free") + '</b> <span class="ai-sub">' + T("runs on your computer") + "</span>";
		$("ai-cost").hidden = true;
		var ready = LOCST.loaded === ck.id, cached = LOCST.cached[ck.id];
		$("ai-send").disabled = busy || !!LOCST.loading || (LOCST.env && !ck.ok);
		$("ai-send").textContent = busy ? T("Working…") : LOCST.loading ? T("Loading…") : T("Send free");
		$("ai-stop").hidden = !LOCST.gen;
		$("ai-attach").disabled = true; $("ai-attach").title = T("This model reads text only.");
		box.hidden = false;
		var h = "";
		if (!LOCST.env) h = '<p class="ai-lmain">' + T("Checking what your device can do…") + "</p>";
		else if (!ck.ok) {
			h = '<p class="ai-lmain ai-lbad">⚠️ <b>' + T("Not available on this device.") + "</b> " + esc(T(A.LOCAL_WHY[ck.why] || "")) + "</p>" +
				'<p class="ai-sub">' + T("You can still chat for free: log in with Hive and use the free daily messages on the cheap models (DeepSeek, Qwen, Llama).") +
				' <button type="button" class="ai-mini" data-lact="usefree">' + T("Use free messages") + "</button></p>";
		} else if (LOCST.loading) {
			var pr = LOCST.prog || {}, pc = Math.max(0, Math.min(100, Math.round((pr.progress || 0) * 100))), secs = Math.round((Date.now() - LOCST.t0) / 1000);
			var starting = cached || (LOCST.dlDone && !pr.dl) || /^Loading/.test(pr.text || "");
			h = '<p class="ai-lmain">' + (starting ? T("Starting {name} from this browser…", { name: esc(m.name) }) : T("Downloading {name} ({size})…", { name: esc(m.name), size: gb(m.mb) })) + " <b>" + pc + "%</b></p>" +
				'<div class="ai-lbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pc + '"><i style="width:' + pc + '%"></i></div>' +
				'<p class="ai-sub ai-ltx">' + T("{s} s so far.", { s: secs }) + " " + (LOCST.retry ? T("The connection dropped: carrying on where it stopped (try {n}).", { n: LOCST.retry + 1 }) : starting ? "" : T("The first numbers can take a minute on a slow connection.")) + "</p>";
		} else if (ready) {
			h = '<p class="ai-lmain">✓ ' + T("{name} is running on your computer. Nothing you type leaves this device.", { name: esc(m.name) }) + "</p>";
		} else if (cached) {
			h = '<p class="ai-lmain">✓ ' + T("{name} is already downloaded ({size}, kept in this browser). It starts when you send a message.", { name: esc(m.name), size: gb(m.mb) }) + "</p>";
		} else {
			h = '<p class="ai-lmain' + (LOCST.want ? " ai-lask" : "") + '">' + T("{name} needs a one-time download of about <b>{size}</b>. Your browser keeps it, so next time it starts without downloading. It runs on your graphics chip: nothing you type is sent anywhere.", { name: esc(m.name), size: gb(m.mb) }) + "</p>" +
				'<p><button type="button" class="tu-btn tu-btn--primary" data-lact="dl">' + T("Download {size} and start", { size: gb(m.mb) }) + "</button>" + (LOCST.want ? ' <button type="button" class="tu-btn tu-btn--ghost" data-lact="cancel">' + T("Cancel") + "</button>" : "") + "</p>";
		}
		if (LOCST.env && ck.ok && ck.f32) h += '<p class="ai-sub">' + T("Your graphics chip has no 16-bit support, so a slower version is used.") + "</p>";
		if (LOCST.err) h += '<p class="ai-note ai-err">' + esc(LOCST.err) + "</p>";
		if (LOCST.env && ck.ok && (cached || ready) && !LOCST.loading) h += '<p class="ai-sub"><button type="button" class="ai-mini" data-lact="rm"' + (busy ? " disabled" : "") + ">" + T("Remove downloaded model") + "</button> " + T("(frees {size})", { size: gb(m.mb) }) + "</p>";
		h += '<p class="ai-sub ai-lfine">' + T("Free and private, but much weaker than the paid models: good for quick questions, drafts and simple code. Made possible by WebLLM.") + "</p>";
		if (box.innerHTML !== h) box.innerHTML = h;
	}
	function localErr(e) {
		var t = String((e && e.message) || e || "");
		if (/shader-f16/i.test(t)) return T("Your graphics chip can't run this version of the model.");
		if (/device was lost|out of memory|OOM/i.test(t)) return T("The graphics chip ran out of memory. Close other tabs or pick a smaller model.");
		if (/quota|storage|QuotaExceeded/i.test(t)) return T("Not enough free disk space for the browser to keep the model.");
		if (/fetch|network|Failed to load|import|Request failed|Cache/i.test(t)) return T("The download failed. Check your connection and try again.");
		return T("The model could not start: {e}", { e: t.slice(0, 200) });
	}
	function localLoad(then) {
		var x = localNow(); if (!x.ck.ok || LOCST.loading) return;
		LOCST.loading = x.ck.id; LOCST.prog = null; LOCST.err = ""; LOCST.want = false; LOCST.retry = 0; LOCST.dlDone = false; LOCST.t0 = Date.now(); paintPrice();
		var last = 0, tick = setInterval(function () { if (LOCST.loading) paintPrice(); else clearInterval(tick); }, 1000);
		window.AILocal.load(x.ck.id, function (p) { if (p.retry) LOCST.retry = p.retry; else LOCST.prog = p; if (p.dl && p.progress >= 1) LOCST.dlDone = true; if (Date.now() - last > 150) { last = Date.now(); paintPrice(); } }).then(function () {
			LOCST.loaded = x.ck.id; LOCST.cached[x.ck.id] = true; LOCST.loading = null; paintPrice();
			if (then) then();
		}, function (e) { LOCST.loading = null; LOCST.err = localErr(e); paintPrice(); });
	}
	$("ai-local").addEventListener("click", function (e) {
		var b = e.target.closest("[data-lact]"); if (!b) return;
		var a = b.dataset.lact, x = localNow();
		if (a === "dl") localLoad(function () { if ($("ai-in").value.trim()) sendLocal(); });
		else if (a === "cancel") { LOCST.want = false; paintPrice(); }
		else if (a === "usefree") { S.model = "qwen"; save(); $("ai-model").value = S.model; paintPrice(); $("ai-acct-card").scrollIntoView({ block: "center" }); }
		else if (a === "rm") {
			if (!confirm(T("Remove {name} from this browser? It will need to download again ({size}) next time.", { name: x.m.name, size: gb(x.m.mb) }))) return;
			window.AILocal.remove(x.ck.id).then(function () { LOCST.cached[x.ck.id] = false; if (LOCST.loaded === x.ck.id) LOCST.loaded = null; msg(T("Removed: the space is free again."), "ok"); paintPrice(); }, function (er) { msg(localErr(er), "err"); });
		}
	});
	$("ai-stop").addEventListener("click", function () { if (window.AILocal) window.AILocal.stop(); });
	// the three ways at the top: pick that kind of model and go to the chat box
	$("ai-pay").addEventListener("click", function (e) {
		var b = e.target.closest("[data-way]"); if (!b) return;
		var w = b.dataset.way, want = w === "local" ? "local1b" : w === "free" ? "qwen" : (A.isLocal(S.model) || A.MODELS[S.model].free ? A.DEFAULT_MODEL : S.model);
		if (w === "local" && A.isLocal(S.model)) want = S.model;
		if (S.tab !== "chat" && $("ai-tab-chat")) $("ai-tab-chat").click();
		var sel = $("ai-model"); sel.value = want; sel.dispatchEvent(new Event("change"));
		if (w === "free" && !who()) { $("ai-acct-card").scrollIntoView({ block: "center", behavior: "smooth" }); return; }
		$("ai-in").scrollIntoView({ block: "center", behavior: "smooth" }); $("ai-in").focus({ preventScroll: true });
	});
	function sendLocal() {
		if (busy) return;
		if (!window.AILocal) { msg(T("Not available on this device."), "err"); return; }
		if (!LOCST.env) { window.AILocal.detect().then(function (env) { LOCST.env = env; fillModels(); sendLocal(); }); return; }
		var x = localNow(), m = x.m, ck = x.ck;
		if (!ck.ok) { msg(T(A.LOCAL_WHY[ck.why] || ""), "err"); paintPrice(); return; }
		if (PEND.length) { msg(T("This model reads text only. Pick Claude or ChatGPT for pictures and PDFs, or remove the files."), "err"); return; }
		var text = $("ai-in").value.trim(); if (!text) { $("ai-in").focus(); return; }
		if (LOCST.loaded !== ck.id) {
			if (LOCST.loading) return;
			// the first time: the panel asks before downloading; already in this browser: just start it
			var go = function (c) { if (c) localLoad(sendLocal); else { LOCST.want = true; paintPrice(); msg(T("Download the model first: it is free, but about {size}.", { size: gb(m.mb) })); $("ai-local").scrollIntoView({ block: "nearest", behavior: "smooth" }); } };
			if (LOCST.cached[ck.id] != null) go(LOCST.cached[ck.id]); else window.AILocal.has(ck.id).then(function (h) { LOCST.cached[ck.id] = !!h; go(h); });
			return;
		}
		var c = cur();
		while (c.msgs.length && (c.msgs[c.msgs.length - 1].error || c.msgs[c.msgs.length - 1].role === "user") && !c.msgs[c.msgs.length - 1].retryId) c.msgs.pop();
		var sys = A.systemFor(S.model, LANG), maxOut = m.caps[S.len];
		var tr = A.localTrim(sys, draftMessages().map(function (q) { return { role: q.role, content: q.content || "" }; }), maxOut);
		if (!tr) { msg(T("This message is too long for the small model on this device. Shorten it, or pick a paid model."), "err"); return; }
		msg(tr.dropped ? T("The oldest {n} messages were left out: the model on this device remembers only a short chat.", { n: tr.dropped }) : "");
		var um = { role: "user", content: text, at: Date.now(), model: S.model, len: S.len, local: true };
		var am = { role: "assistant", content: "", at: Date.now(), pending: true, model: S.model };
		if (!c.msgs.length) c.title = text.replace(/\s+/g, " ").slice(0, 60);
		c.msgs.push(um, am); c.at = Date.now();
		S.chats.sort(function (a, b) { return b.at - a.at; });
		$("ai-in").value = ""; save(); renderLog();
		LOCST.gen = true; setBusy(true);
		var raw = "", last = 0;
		window.AILocal.chat(ck.id, [{ role: "system", content: sys }].concat(tr.messages), maxOut, function (p) {
			if (p.t === "text") { raw += p.v; var st = A.splitThink(raw); am.content = st.text; am.thinking = st.think; if (Date.now() - last > 90) { last = Date.now(); renderLog(); } }
			else if (p.t === "done") am.stop = p.stop;
		}).catch(function (e) { am.error = localErr(e); }).then(function () {
			am.pending = false; am.thinking = false;
			if (!am.error && !am.content) am.error = am.stop === "stopped" ? T("Stopped before it wrote anything.") : T("No answer came back.");
			LOCST.gen = false; save(); renderLog(); setBusy(false);
		});
	}
	if (A.isLocal(S.model)) localPick();
	function send(force) {
		if (busy) return;
		var u = who();
		var text = $("ai-in").value.trim();
		if (!text && !PEND.length) { $("ai-in").focus(); return; }
		// "make a picture of ..." in the chat: offer the Picture / Video tab instead (the chat models only write text)
		var wm = force === true ? null : A.wantsMedia(text);
		if (wm && (wm.kind === "image" ? status.image : status.video)) { offerMedia(wm, text); return; }
		if (A.isLocal(S.model)) return sendLocal();
		if (!status.chat) { msg(T("MES AI chat is coming soon."), "err"); return; }
		if (!u) { msg(T("Log in with your Hive account first (above)."), "err"); $("ai-acct-card").scrollIntoView({ block: "center" }); return; }
		if (A.MODELS[S.model].text && PEND.length) { msg(T("This model reads text only. Pick Claude or ChatGPT for pictures and PDFs, or remove the files."), "err"); return; }
		var draft = draftMessages(), sentFiles = PEND.slice();
		var c = cur();
		// a failed exchange at the end is dropped before the new message
		while (c.msgs.length && (c.msgs[c.msgs.length - 1].error || c.msgs[c.msgs.length - 1].role === "user") && !c.msgs[c.msgs.length - 1].retryId) c.msgs.pop();
		if (freeApplies()) {
			draft = draftMessages();   // after dropping the failed exchange
			if (A.safeTokens(A.systemFor(S.model, LANG), draft) > A.FREE.maxIn) { msg(T("This chat is too long for a free message. Start a new chat, or untick free messages to pay for this one."), "err"); return; }
			return sendFree(c, draft, text, u);
		}
		if (window.MES_AI_APP) { msg(FREEST.left === 0 ? T("No free messages left today: they come back at 00:00 UTC.") : T("Free messages are not ready yet: log in with Hive above and try again."), "err"); return; }
		setBusy(true);
		msg(T("Getting the exact price…"));
		withFileData(draft).then(function (msgs) {
			var err = A.checkMessages(msgs);
			if (err) throw new Error(T(err));
			return quote({ acct: u.name, kind: "chat", model: S.model, len: S.len, messages: msgs });
		}).then(function (q) {
			if (q.status !== 200) throw new Error(T(q.error) || T("Could not get a price (HTTP {s}).", { s: q.status }));
			msg(T("Price: {p} HBD ({usd}). Confirm the payment in Hive Keychain…", { p: q.price, usd: A.fmtUsd(q.usd) }));
			return pay(q).then(function () { return q; });
		}).then(function (q) {
			var um = { role: "user", content: text, at: Date.now(), price: q.price, memo: q.memo, model: S.model, len: S.len, acct: u.name };
			if (sentFiles.length) {
				um.files = sentFiles.map(function (f) { var o = { id: f.id, t: f.t, name: f.name }; if (f.pages) o.pages = f.pages; return o; });
				sentFiles.forEach(function (f) { filePut(f).catch(function () {}); });
				PEND = PEND.filter(function (f) { return sentFiles.indexOf(f) < 0; }); paintFiles();
			}
			var am = { role: "assistant", content: "", at: Date.now(), pending: true, model: S.model };
			if (!c.msgs.length) c.title = (text || sentFiles.map(function (f) { return f.name; }).join(", ")).replace(/\s+/g, " ").slice(0, 60);
			c.msgs.push(um, am); c.at = Date.now();
			S.chats.sort(function (a, b) { return b.at - a.at; });
			$("ai-in").value = "";
			save(); renderLog();
			msg(T("Paid. Waiting for the blockchain (a few seconds)…"));
			return answer(c, am, q.id, u.name);
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? T("Payment cancelled: nothing was sent.") : T(m), "err");
		}).then(function () { setBusy(false); });
	}
	function answer(c, am, id, acct) {
		var last = 0;
		return runReq(id, acct, function (n) { msg(T("Waiting for the blockchain… ({s} s)", { s: n * 3 })); }).then(function (r) {
			msg("");
			return readStream(r, function (p) {
				if (p.t === "text") { am.content += p.v; am.thinking = false; if (Date.now() - last > 90) { last = Date.now(); renderLog(); } }
				else if (p.t === "think") { am.thinking = true; renderLog(); }
				else if (p.t === "done") { am.stop = p.stop; am.pending = false; }
				else if (p.t === "error") { am.error = p.msg; am.pending = false; am.retryId = p.retry ? id : null; }
			});
		}).catch(function () { am.error = T("The connection broke before the answer finished."); am.retryId = id; }).then(function () {
			am.pending = false;
			if (!am.error && !am.content) { am.error = T("No answer came back."); am.retryId = id; }
			if (am.error && am.content) am.content += "\n\n" + T("*(cut off)*");
			am.acct = acct;
			save(); renderLog();
		});
	}
	function retry(i) {
		if (busy) return;
		var c = cur(), am = c.msgs[i]; if (!am || !am.retryId) return;
		var id = am.retryId, acct = (c.msgs[i - 1] && c.msgs[i - 1].acct) || (who() || {}).name;
		am.error = null; am.retryId = null; am.content = ""; am.pending = true; am.stop = null;
		setBusy(true); renderLog();
		answer(c, am, id, acct).then(function () { setBusy(false); });
	}

	/* ---------- pictures and videos (2026-11-21: side list + search like the chats, reference pictures, edits) ---------- */
	var db = null;
	function idb() {
		if (db) return db;
		db = new Promise(function (res, rej) {
			var o = indexedDB.open("mes-ai", 1);
			o.onupgradeneeded = function () { o.result.createObjectStore("img"); };
			o.onsuccess = function () { res(o.result); }; o.onerror = function () { rej(o.error); };
		});
		return db;
	}
	function idbDo(mode, fn) { return idb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("img", mode), s = t.objectStore("img"), r = fn(s); t.oncomplete = function () { res(r && r.result); }; t.onerror = function () { rej(t.error); }; }); }); }
	function imgList() { try { return JSON.parse(localStorage.getItem(LS_IMG) || "[]"); } catch (e) { return []; } }
	function imgSave(l) { try { localStorage.setItem(LS_IMG, JSON.stringify(l)); } catch (e) {} }
	function b64Blob(b64, mime) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
	var urls = {};
	// an object URL for a stored blob (pictures: key = id, videos: "v:" + id, reference pictures: "f:" + id as base64)
	function blobUrl(key) {
		if (urls[key]) return Promise.resolve(urls[key]);
		return idbDo("readonly", function (s) { return s.get(key); }).then(function (v) {
			if (!v) return null;
			var blob = v instanceof Blob ? v : (v && v.data ? b64Blob(v.data, v.mt) : null);
			if (!blob) return null;
			return (urls[key] = URL.createObjectURL(blob));
		}).catch(function () { return null; });
	}
	function fillSrc(scope) {
		scope.querySelectorAll("[data-src]").forEach(function (el) {
			var k = el.getAttribute("data-src"); el.removeAttribute("data-src");
			blobUrl(k).then(function (u) { if (u) el.src = u; else if (el.tagName === "IMG") el.classList.add("ai-gone"); });
		});
	}

	/* reference pictures waiting to be sent: M.img.pend / M.vid.pend = [{id, mt, data, name}] */
	var M = {
		img: { pend: [], tab: "img", list: imgList, saveList: imgSave, sel: "isel", q: "", el: { refs: "ai-irefs", side: "ai-ilist", stage: "ai-istage", search: "ai-isearch", prompt: "ai-prompt", cur: "ai-icur", comp: "ai-icomp", label: "ai-plabel", file: "ai-ifile" } },
		vid: { pend: [], tab: "vid", list: function () { return vids(); }, saveList: function (l) { vidsSave(l); }, sel: "vsel", q: "", el: { refs: "ai-vrefs", side: "ai-vlist", stage: "ai-vstage", search: "ai-vsearch", prompt: "ai-vprompt", cur: "ai-vcur", comp: "ai-vcomp", label: "ai-vlabel", file: "ai-vfile" } }
	};
	function maxRefs(kind) { return kind === "img" ? A.maxRefs("image", S.imod) : A.maxRefs("video", $("ai-vmodel").value); }
	function refChars(kind) { return M[kind].pend.reduce(function (n, f) { return n + f.data.length; }, 0); }
	// adds pictures (Files or Blobs) as reference pictures 1, 2, ...; shrunk to at most REFS.side px
	function addRefs(kind, files, front) {
		files = [].slice.call(files || []).filter(function (f) { return /^image\//.test(f.type || "") || f instanceof Blob; });
		if (!files.length) return Promise.resolve();
		var notes = [], chain = Promise.resolve(), P = M[kind];
		files.forEach(function (f) {
			chain = chain.then(function () {
				var max = maxRefs(kind), name = f.name || T("picture");
				if (!max) { notes.push(T("This model can't take pictures. Pick another model.")); return; }
				if (P.pend.length >= max) {
					if (max === 1) P.pend = []; // a video starts from one picture: the new one replaces it
					else { notes.push(max === 1 ? T("One picture at most with this model.") : T("{n} pictures at most with this model.", { n: max })); return; }
				}
				return shrinkImage(f, A.REFS.side).then(function (r) {
					if (refChars(kind) + r.data.length > A.REFS.total) { notes.push(T("{name}: too big together with the other pictures.", { name: name })); return; }
					var o = { id: A.newId(), mt: r.mt, data: r.data, name: name };
					if (front) P.pend.unshift(o); else P.pend.push(o);
				}, function () { notes.push(T("{name}: this picture type can't be read here. Use JPEG or PNG.", { name: name })); });
			});
		});
		return chain.then(function () { paintRefs(kind); paintPrice(); if (notes.length) msg(notes.join(" "), "err"); });
	}
	function paintRefs(kind) {
		var P = M[kind], box = $(P.el.refs), max = maxRefs(kind);
		box.hidden = !P.pend.length;
		box.innerHTML = P.pend.map(function (f, i) {
			return '<span class="ai-ref"><img alt="" src="data:' + f.mt + ";base64," + f.data + '"><b class="ai-refn">' + (kind === "vid" ? "▶" : i + 1) + "</b>" +
				'<button type="button" data-unref="' + i + '" aria-label="' + esc(T("Remove picture {n}", { n: i + 1 })) + '" title="' + esc(T("Remove")) + '">×</button></span>';
		}).join("") + (P.pend.length ? '<span class="ai-refhint">' + (kind === "vid" ? T("The video starts from this picture. Say how it should move.") :
			P.pend.length === 1 ? T("Say what to change, or how to use it (picture 1).") : T("Refer to them as picture 1, picture 2… e.g. “put the person from picture 1 in front of picture 2”.")) + "</span>" : "") +
			(P.pend.length > max ? '<span class="ai-refhint ai-err">' + (max ? T("This model takes {n} at most: remove some, or pick another model.", { n: max }) : T("This model can't take pictures: pick another model.")) + "</span>" : "");
		var lab = $(P.el.label), pr = $(P.el.prompt);
		if (!P.ph0) P.ph0 = pr.placeholder;
		if (kind === "img") { lab.textContent = P.pend.length ? T("What should the new picture be?") : T("Describe the picture"); }
		else lab.textContent = P.pend.length ? T("How should the picture move?") : T("Describe the video");
		pr.placeholder = P.pend.length ? lab.textContent + "  (Ctrl+Enter)" : P.ph0;
	}
	["img", "vid"].forEach(function (kind) {
		var P = M[kind];
		$(P.el.refs).addEventListener("click", function (e) { var b = e.target.closest("[data-unref]"); if (!b || busy) return; P.pend.splice(+b.dataset.unref, 1); paintRefs(kind); paintPrice(); });
		$(P.el.file).addEventListener("change", function () { addRefs(kind, this.files); this.value = ""; });
		$(P.el.prompt).addEventListener("paste", function (e) {
			var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
			if (fs.length && !e.clipboardData.getData("text/plain")) { e.preventDefault(); addRefs(kind, fs); }
		});
		var zone = $(P.el.comp), n = 0;
		zone.addEventListener("dragenter", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) { n++; zone.classList.add("ai-drop"); } });
		zone.addEventListener("dragleave", function () { if (--n <= 0) { n = 0; zone.classList.remove("ai-drop"); } });
		zone.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) e.preventDefault(); });
		zone.addEventListener("drop", function (e) { n = 0; zone.classList.remove("ai-drop"); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addRefs(kind, e.dataTransfer.files); } });
		$(P.el.search).addEventListener("input", function () { P.q = this.value; paintMedia(kind); });
		$(P.el.search).addEventListener("keydown", function (e) { if (e.key === "Escape" && this.value) { e.preventDefault(); this.value = P.q = ""; paintMedia(kind); } });
	});
	$("ai-iattach").addEventListener("click", function () { $("ai-ifile").click(); });
	$("ai-vattach").addEventListener("click", function () { $("ai-vfile").click(); });
	// saves the pictures sent with a creation (so "Again with these pictures" can bring them back) -> their ids
	function keepRefs(pend) { pend.forEach(function (f) { filePut({ id: f.id, t: "img", mt: f.mt, name: f.name, data: f.data }).catch(function () {}); }); return pend.map(function (f) { return f.id; }); }
	function refsBack(kind, ids) {
		return Promise.all((ids || []).map(fileGet)).then(function (got) {
			M[kind].pend = got.filter(Boolean).map(function (f, i) { return { id: A.newId(), mt: f.mt, data: f.data, name: f.name || T("picture") + " " + (i + 1) }; });
			paintRefs(kind); paintPrice();
		});
	}

	/* the side list and the big view */
	function mediaWords(kind) { return norm(M[kind].q).split(/\s+/).filter(Boolean); }
	function mediaShown(kind) {
		var w = mediaWords(kind);
		return M[kind].list().filter(function (it) { var t = norm(it.prompt); return w.every(function (x) { return t.indexOf(x) >= 0; }); });
	}
	function itemSub(kind, it) {
		var bits = [when(it.at), it.free ? T("🎁 free") : it.price + " HBD"];
		if (kind === "vid") bits.unshift(it.seconds + " s");
		if (it.refs && it.refs.length) bits.push(kind === "vid" ? "🖼️" : "✏️ " + it.refs.length);
		return bits.join(" · ");
	}
	function paintMedia(kind) {
		var P = M[kind], all = P.list(), shown = mediaShown(kind), words = mediaWords(kind), sel = S[P.sel], vid = kind === "vid";
		if (sel && !all.some(function (x) { return x.id === sel; })) sel = S[P.sel] = null;
		var side = $(P.el.side);
		side.innerHTML = (words.length ? '<p class="ai-cnote">' + (shown.length ? (shown.length === 1 ? T("{n} found", { n: 1 }) : T("{n} found", { n: shown.length })) : T("Nothing has that.")) + "</p>" : "") +
			(!all.length ? '<p class="ai-cnote">' + (vid ? T("Your videos will be listed here.") : T("Your pictures will be listed here.")) + "</p>" : "") +
			shown.map(function (it) {
				return '<div class="ai-crow ai-mrow' + (it.id === sel ? " is-cur" : "") + '" role="listitem"><button type="button" class="ai-copen" data-msel="' + esc(it.id) + '"' + (it.id === sel ? ' aria-current="true"' : "") + ">" +
					(vid ? '<span class="ai-mthumb ai-mthumb--v" aria-hidden="true">🎬</span>' : '<img class="ai-mthumb" alt="" data-src="' + esc(it.id) + '">') +
					'<span class="ai-mtx"><span class="ai-ctitle">' + mark(it.prompt.slice(0, 80), words) + '</span><span class="ai-csub">' + esc(itemSub(kind, it)) + "</span></span></button></div>";
			}).join("");
		$(kind === "img" ? "ai-img" : "ai-vid").querySelector(".ai-cn").textContent = all.length || "";
		var stage = $(P.el.stage), it = sel && all.filter(function (x) { return x.id === sel; })[0];
		$(P.el.cur).textContent = it ? it.prompt.slice(0, 80) : "";
		if (it) {
			var i = shown.indexOf(it);
			stage.innerHTML = '<figure class="ai-big">' +
				'<div class="ai-bigpic">' + (vid ? '<video controls playsinline preload="metadata" data-src="v:' + esc(it.id) + '"></video>' : '<img alt="' + esc(it.prompt) + '" data-src="' + esc(it.id) + '">') +
				(i > 0 ? '<button type="button" class="ai-nav ai-nav--l" data-mstep="-1" aria-label="' + esc(T("Previous")) + '">‹</button>' : "") +
				(i >= 0 && i < shown.length - 1 ? '<button type="button" class="ai-nav ai-nav--r" data-mstep="1" aria-label="' + esc(T("Next")) + '">›</button>' : "") + "</div>" +
				"<figcaption>" + (it.refs && it.refs.length ? '<span class="ai-usedrefs">' + it.refs.map(function (r, j) { return '<span class="ai-ref ai-ref--s"><img alt="" data-src="f:' + esc(r) + '"><b class="ai-refn">' + (vid ? "▶" : j + 1) + "</b></span>"; }).join("") + "</span>" : "") +
				'<span class="ai-bigtx">' + esc(it.prompt) + '</span><span class="ai-sub">' + esc(itemSub(kind, it)) + (it.model && !vid && A.IMAGES[it.model] ? " · " + esc(T(A.IMAGES[it.model].name)) : "") + (vid && it.res ? " · " + esc(it.res) : "") + "</span></figcaption>" +
				'<div class="ai-macts">' +
				(vid ? "" : '<button type="button" class="ai-mini ai-mini--hi" data-mact="edit">' + T("✏️ Change this picture") + "</button>" +
					'<button type="button" class="ai-mini" data-mact="addref">' + T("＋ Use with other pictures") + "</button>" +
					'<button type="button" class="ai-mini" data-mact="tovid">' + T("🎬 Make a video from it") + "</button>") +
				'<button type="button" class="ai-mini" data-mact="again">' + (it.refs && it.refs.length ? (vid ? T("↺ Again from this picture") : T("↺ Again with these pictures")) : T("↺ Use this description")) + "</button>" +
				'<button type="button" class="ai-mini" data-mact="dl">' + T("Download") + "</button>" +
				'<button type="button" class="ai-mini ai-cdel" data-mact="rm">' + T("Delete") + "</button></div></figure>";
		} else if (shown.length) {
			stage.innerHTML = '<div class="ai-gal">' + shown.map(function (x) {
				return '<button type="button" class="ai-tile" data-msel="' + esc(x.id) + '" title="' + esc(x.prompt.slice(0, 200)) + '">' +
					(vid ? '<video muted playsinline preload="metadata" data-src="v:' + esc(x.id) + '"></video>' : '<img alt="' + esc(x.prompt.slice(0, 120)) + '" data-src="' + esc(x.id) + '">') +
					'<span class="ai-tilecap">' + esc(x.prompt.slice(0, 70)) + "</span></button>";
			}).join("") + "</div>";
		} else if (words.length) {
			stage.innerHTML = '<div class="ai-empty"><p>' + T("Nothing has that.") + "</p></div>";
		} else {
			stage.innerHTML = vid ? '<div class="ai-empty"><p>' + T("<b>Describe a video</b>, or start it from a picture (🖼️ Start from a picture, or 🎬 on any of your pictures). Each video is paid on its own.") + "</p></div>"
				: '<div class="ai-empty"><p>' + (window.MES_AI_APP ? T("<b>Describe a picture.</b> Free with your Hive login: 3 pictures a day.") : T("<b>Describe a picture</b>, or add pictures to change or combine them. Each picture is paid on its own.")) + '</p><p class="ai-try">' + T("Try:") +
				' <button type="button" class="ai-mini" data-iex="' + esc(T("A watercolour fox sitting in fresh snow at sunrise, soft light")) + '">' + T("Watercolour fox") + "</button>" +
				' <button type="button" class="ai-mini" data-iex="' + esc(T("A clean flat logo of a square-root sign inside a circle, blue and white")) + '">' + T("A logo") + "</button>" +
				' <button type="button" class="ai-mini" data-iex="' + esc(window.MES_AI_APP ? T("A cosy cabin in snowy mountains at sunset, warm light in the windows") : T("Put the person from picture 1 in front of the place in picture 2, matching the light")) + '">' + (window.MES_AI_APP ? T("Snowy cabin") : T("Combine two pictures")) + "</button></p></div>";
		}
		fillSrc(side); fillSrc(stage);
		if (it && narrowOf(kind === "img" ? "ai-img" : "ai-vid") && narrowOpen[kind === "img" ? "ai-img" : "ai-vid"]) { narrowOpen[kind === "img" ? "ai-img" : "ai-vid"] = false; paintSide(); }
	}
	function selectMedia(kind, id) { S[M[kind].sel] = id || null; save(); paintMedia(kind); }
	function mediaItem(kind, id) { return M[kind].list().filter(function (x) { return x.id === id; })[0]; }
	function delMedia(kind, id) {
		var P = M[kind], l = P.list(), i = -1; l.forEach(function (x, j) { if (x.id === id) i = j; });
		if (i < 0) return;
		var it = l[i], key = kind === "vid" ? "v:" + id : id, blob = null;
		idbDo("readonly", function (s) { return s.get(key); }).then(function (b) {
			blob = b;
			return idbDo("readwrite", function (s) { return s.delete(key); });
		}).then(function () {
			P.saveList(P.list().filter(function (x) { return x.id !== id; }));
			if (S[P.sel] === id) S[P.sel] = null; save(); paintMedia(kind);
			undoBar(T('Deleted "{title}".', { title: it.prompt.slice(0, 40) }), function () {
				if (!blob) return;
				idbDo("readwrite", function (s) { return s.put(blob, key); }).then(function () { var l2 = P.list(); l2.splice(Math.min(i, l2.length), 0, it); P.saveList(l2); S[P.sel] = id; save(); paintMedia(kind); });
			});
		});
	}
	function mediaBlob(kind, id) { return idbDo("readonly", function (s) { return s.get(kind === "vid" ? "v:" + id : id); }); }
	function onMediaClick(kind, e) {
		var b = e.target.closest("button"); if (!b) return;
		var P = M[kind], d = b.dataset;
		if (d.msel) { selectMedia(kind, d.msel); return; }
		if (d.iex) { $("ai-prompt").value = d.iex; paintPrice(); $("ai-prompt").focus(); return; }
		if (d.mstep) { var sh = mediaShown(kind), i = sh.map(function (x) { return x.id; }).indexOf(S[P.sel]) + (+d.mstep); if (sh[i]) selectMedia(kind, sh[i].id); return; }
		var it = mediaItem(kind, S[P.sel]); if (!it || !d.mact) return;
		if (d.mact === "dl") mediaBlob(kind, it.id).then(function (blob) {
			if (!blob) return; var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
			a.download = "mes-ai-" + it.id + "." + ((blob.type.split("/")[1] || (kind === "vid" ? "mp4" : "webp")).replace("jpeg", "jpg"));
			a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
		});
		if (d.mact === "rm") delMedia(kind, it.id);
		if (d.mact === "again") { $(P.el.prompt).value = it.prompt; refsBack(kind, it.refs).then(function () { $(P.el.prompt).focus(); }); }
		if (d.mact === "edit" || d.mact === "addref" || d.mact === "tovid") {
			var to = d.mact === "tovid" ? "vid" : "img";
			mediaBlob("img", it.id).then(function (blob) {
				if (!blob) return;
				if (d.mact === "edit") { M.img.pend = []; $("ai-prompt").value = ""; }
				if (to === "vid") { M.vid.pend = []; showTab("vid"); }
				return addRefs(to, [new File([blob], "picture.webp", { type: blob.type || "image/webp" })]).then(function () {
					var pr = $(M[to].el.prompt);
					if (d.mact === "edit") pr.placeholder = T("What should change? e.g. make the sky stormy  (Ctrl+Enter)");
					pr.focus(); $(M[to].el.comp).scrollIntoView({ block: "nearest", behavior: "smooth" });
				});
			});
		}
	}
	$("ai-img").addEventListener("click", function (e) { if (e.target.closest("#ai-istage, #ai-ilist")) onMediaClick("img", e); });
	$("ai-vid").addEventListener("click", function (e) { if (e.target.closest("#ai-vstage, #ai-vlist")) onMediaClick("vid", e); });
	$("ai-iall").addEventListener("click", function () { selectMedia("img", null); });
	$("ai-vall").addEventListener("click", function () { selectMedia("vid", null); });
	$("ai-inew").addEventListener("click", function () { if (busy) return; M.img.pend = []; paintRefs("img"); $("ai-prompt").value = ""; selectMedia("img", null); paintPrice(); $("ai-prompt").focus(); });
	$("ai-vnew").addEventListener("click", function () { if (busy) return; M.vid.pend = []; paintRefs("vid"); $("ai-vprompt").value = ""; selectMedia("vid", null); paintPrice(); $("ai-vprompt").focus(); });
	document.addEventListener("keydown", function (e) {
		if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey) return;
		var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(t.tagName))) return;
		var kind = S.tab === "img" ? "img" : S.tab === "vid" ? "vid" : null; if (!kind || !S[M[kind].sel]) return;
		var r = $(kind === "img" ? "ai-img" : "ai-vid").getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
		var sh = mediaShown(kind), i = sh.map(function (x) { return x.id; }).indexOf(S[M[kind].sel]) + (e.key === "ArrowRight" ? 1 : -1);
		if (sh[i]) { e.preventDefault(); selectMedia(kind, sh[i].id); }
	});

	function mockImage(prompt, size, refs) {
		var wh = size.split("x").map(Number), cv = document.createElement("canvas"); cv.width = wh[0] / 4; cv.height = wh[1] / 4;
		var x = cv.getContext("2d"), g = x.createLinearGradient(0, 0, cv.width, cv.height);
		g.addColorStop(0, "#5b3fd6"); g.addColorStop(1, "#0f766e"); x.fillStyle = g; x.fillRect(0, 0, cv.width, cv.height);
		x.fillStyle = "#fff"; x.font = "bold 14px sans-serif"; x.fillText(refs && refs.length ? "Simulated edit" : "Simulated picture", 12, 24); x.font = "12px sans-serif"; x.fillText(prompt.slice(0, 40), 12, 44);
		// the reference pictures drawn small along the bottom, so an edit visibly used them
		return Promise.all((refs || []).map(function (r) { return createImageBitmap(b64Blob(r.data, r.mt)).catch(function () { return null; }); })).then(function (bms) {
			var w = Math.min(70, (cv.width - 16) / Math.max(1, bms.length) - 6);
			bms.forEach(function (bm, i) { if (bm) x.drawImage(bm, 10 + i * (w + 6), cv.height - w - 10, w, w); });
			return new Promise(function (res) { cv.toBlob(res, "image/webp", 0.85); });
		});
	}
	var pendingImg = null; // {id, prompt, quality, size, price, acct, refs} when a picture failed after payment
	$("ai-make").addEventListener("click", function () { makeImage(false); });
	$("ai-prompt").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); makeImage(false); } });
	function makeImage(isRetry) {
		if (busy) return;
		var u = who();
		var prompt = $("ai-prompt").value.trim(), quality = $("ai-q").value, size = $("ai-size").value, imod = S.imod, refs = M.img.pend.slice();
		if (!status.image || !provOn(A.IMAGES[imod].prov)) { msg(T("{name} pictures are coming soon.", { name: T(A.IMAGES[imod].name) }), "err"); return; }
		if (!u) { msg(T("Log in with your Hive account first (above)."), "err"); return; }
		var err = isRetry ? null : A.checkImage(prompt, quality, size, imod) || A.checkRefs(refs, A.maxRefs("image", imod));
		if (err) { msg(T(err), "err"); return; }
		setBusy(true);
		if (!isRetry && picsApplies()) {
			freePic(u, prompt, quality, size).then(function (blob) {
				var key = "f" + A.newId();
				return idbDo("readwrite", function (s) { return s.put(blob, key); }).then(function () {
					var l = imgList(); l.unshift({ id: key, model: imod, prompt: prompt, quality: quality, size: size, price: "0", free: true, at: Date.now() }); imgSave(l.slice(0, 300));
					$("ai-prompt").value = "";
					msg(T("Done. Your free picture is shown (kept in this browser)."), "ok");
					S.isel = key; save(); paintMedia("img");
				});
			}).catch(function (e) { msg(T(e && e.message || String(e)), "err"); }).then(function () { setBusy(false); paintPrice(); });
			return;
		}
		if (window.MES_AI_APP) { setBusy(false); msg(PICST.left === 0 ? T("No free pictures left today: they come back at 00:00 UTC.") : T("Free pictures are 1k, made from your words only: log in with Hive above."), "err"); return; }
		var sendRefs = refs.map(function (f) { return { mt: f.mt, data: f.data }; });
		var job = isRetry ? Promise.resolve(pendingImg) : quote({ acct: u.name, kind: "image", model: imod, prompt: prompt, quality: quality, size: size, refs: sendRefs }).then(function (q) {
			if (q.status !== 200) throw new Error(T(q.error) || T("Could not get a price (HTTP {s}).", { s: q.status }));
			msg(T("Price: {p} HBD ({usd}). Confirm the payment in Hive Keychain…", { p: q.price, usd: A.fmtUsd(q.usd) }));
			return pay(q).then(function () { return { id: q.id, model: imod, prompt: prompt, quality: quality, size: size, price: q.price, acct: u.name, refs: refs }; });
		});
		job.then(function (j) {
			pendingImg = null;
			msg(j.refs && j.refs.length ? T("Paid. Changing the picture (this takes up to a minute)…") : T("Paid. Making the picture (this takes up to a minute)…"));
			if (mock) {
				var info = MOCK_Q[j.id]; info.tries++;
				if (/fail/i.test(j.prompt) && info.tries === 1) return { j: j, err: { msg: T("Simulated failure after payment."), retry: true } };
				return sleep(1200).then(function () { return mockImage(j.prompt, j.size, j.refs); }).then(function (blob) { return { j: j, blob: blob }; });
			}
			return runReq(j.id, j.acct, function (n) { msg(T("Waiting for the blockchain… ({s} s)", { s: n * 3 })); }).then(function (r) {
				if (r.error) return { j: j, err: { msg: r.error.error, retry: r.error.retry } };
				return jsonOf(r).then(function (d) { return d.t === "image" ? { j: j, blob: b64Blob(d.b64, d.mime) } : { j: j, err: { msg: d.msg || d.error, retry: d.retry } }; });
			});
		}).then(function (out) {
			if (!out) return;
			if (out.err) {
				if (out.err.retry) { pendingImg = out.j; msg(T(out.err.msg) + " ", "err"); addRetryImg(); }
				else msg(T(out.err.msg) || T("The picture failed."), "err");
				return;
			}
			var key = out.j.id, refIds = keepRefs(out.j.refs || []);
			return idbDo("readwrite", function (s) { return s.put(out.blob, key); }).then(function () {
				var l = imgList(), rec = { id: key, model: out.j.model, prompt: out.j.prompt, quality: out.j.quality, size: out.j.size, price: out.j.price, at: Date.now() };
				if (refIds.length) rec.refs = refIds;
				l.unshift(rec); imgSave(l.slice(0, 300));
				M.img.pend = []; paintRefs("img"); $("ai-prompt").value = "";
				msg(T("Done. Your picture is shown (kept in this browser): change it again with ✏️, or make a video from it."), "ok");
				S.isel = key; save(); paintMedia("img"); paintPrice();
			});
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? T("Payment cancelled: nothing was sent.") : T(m), "err");
		}).then(function () { setBusy(false); });
	}
	function addRetryImg() {
		var b = document.createElement("button"); b.type = "button"; b.className = "tu-btn tu-btn--primary"; b.textContent = T("Try again (free)");
		b.addEventListener("click", function () { makeImage(true); });
		$("ai-msg").appendChild(b);
	}

	/* ---------- videos (Grok Imagine): pay, start a job, follow it every 5 s, fetch the file into IndexedDB ---------- */
	var V = A.VIDEO, LS_VJ = "mes-ai:vjobs", LS_VID = "mes-ai:vids";
	// video models grouped by company (2026-11-23: + OpenRouter's Seedance 2.0 Mini and Veo 3.1 Lite); each has its own lengths and qualities
	function fillVmodels() {
		var cur = $("ai-vmodel").value || "lite", vg = { xai: "Grok (xAI)", openrouter: T("More (Seedance, Veo)") };
		$("ai-vmodel").innerHTML = Object.keys(vg).map(function (p) {
			return '<optgroup label="' + esc(vg[p]) + '">' + Object.keys(V.models).filter(function (k) { return V.models[k].prov === p; }).map(function (k) { var on = provOn(p); return '<option value="' + k + '"' + (on ? "" : " disabled") + ">" + esc(T(V.models[k].name)) + (on ? "" : " (" + T("soon") + ")") + "</option>"; }).join("") + "</optgroup>";
		}).join("");
		if (!V.models[cur] || !provOn(V.models[cur].prov)) cur = Object.keys(V.models).filter(function (k) { return provOn(V.models[k].prov); })[0] || "lite";
		$("ai-vmodel").value = cur;
		paintVres();
	}
	function paintVres() {
		var k = $("ai-vmodel").value, rs = A.videoRes(k), cur = $("ai-vres").value, ds = A.videoDurations(k), cs = +$("ai-vsec").value || 5;
		$("ai-vres").innerHTML = rs.map(function (r) { return '<option value="' + r + '">' + r + "</option>"; }).join("");
		$("ai-vres").value = rs.indexOf(cur) >= 0 ? cur : rs[0];
		var near = ds.reduce(function (a, d) { return Math.abs(d - cs) < Math.abs(a - cs) ? d : a; }, ds[0]);
		$("ai-vsec").innerHTML = ds.map(function (d) { return '<option value="' + d + '"' + (d === near ? " selected" : "") + ">" + T("{n} seconds", { n: d }) + "</option>"; }).join("");
	}
	fillVmodels();
	function vq() { return A.videoQuote($("ai-vmodel").value, +$("ai-vsec").value, $("ai-vres").value, M ? M.vid.pend.length : 0); }
	function paintVprice() {
		var q = vq();
		$("ai-vprice").innerHTML = "<b>" + q.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(q) + ")</span>";
		var von = status.video && provOn(V.models[$("ai-vmodel").value].prov);
		$("ai-vmake").disabled = !(von && !busy);
		$("ai-vmake").textContent = von ? T("Pay & create") : T("Coming soon");
		$("ai-vattach").hidden = !A.maxRefs("video", $("ai-vmodel").value);
	}
	$("ai-vmodel").addEventListener("change", function () { paintVres(); paintRefs("vid"); paintVprice(); });
	["ai-vsec", "ai-vres"].forEach(function (id) { $(id).addEventListener("change", paintVprice); });
	function vjobs() { try { return JSON.parse(localStorage.getItem(LS_VJ) || "[]"); } catch (e) { return []; } }
	function vjobsSave(l) { try { localStorage.setItem(LS_VJ, JSON.stringify(l)); } catch (e) {} }
	function vids() { try { return JSON.parse(localStorage.getItem(LS_VID) || "[]"); } catch (e) { return []; } }
	function vidsSave(l) { try { localStorage.setItem(LS_VID, JSON.stringify(l)); } catch (e) {} }
	function paintVjobs() {
		var l = vjobs();
		$("ai-vjobs").innerHTML = l.map(function (j) {
			var mins = Math.max(0, Math.round((Date.now() - j.at) / 60000));
			return '<div class="ai-vjob' + (j.err ? " ai-vjob--err" : "") + '"><b>' + (j.err ? "⚠ " : "⏳ ") + esc(j.prompt.slice(0, 90)) + '</b><span class="ai-sub"> · ' + esc(j.price) + " HBD · " +
				(j.err ? esc(T(j.err)) : j.dl ? T("downloading…") : T("being made ({n} min so far)", { n: mins })) + "</span>" +
				(j.retry ? ' <button type="button" class="tu-btn tu-btn--primary" data-vretry="' + j.id + '">' + T("Try again (free)") + '</button>' : "") +
				(j.err ? ' <button type="button" class="ai-mini" data-vdrop="' + j.id + '">' + T("Remove") + '</button>' : "") + "</div>";
		}).join("");
	}
	function mockVideo(prompt) {
		var cv = document.createElement("canvas"); cv.width = 320; cv.height = 180;
		var x = cv.getContext("2d"), st = cv.captureStream ? cv.captureStream(24) : null;
		if (!st || !window.MediaRecorder) return Promise.resolve(new Blob(["fake"], { type: "video/webm" }));
		var rec = new MediaRecorder(st, { mimeType: "video/webm" }), parts = [], t0 = performance.now();
		rec.ondataavailable = function (e) { parts.push(e.data); };
		return new Promise(function (res) {
			rec.onstop = function () { res(new Blob(parts, { type: "video/webm" })); };
			rec.start();
			(function draw() {
				var t = (performance.now() - t0) / 1000;
				x.fillStyle = "#3730a3"; x.fillRect(0, 0, 320, 180); x.fillStyle = "#fbbf24"; x.beginPath(); x.arc(40 + t * 110, 90, 22, 0, 7); x.fill();
				x.fillStyle = "#fff"; x.font = "bold 14px sans-serif"; x.fillText("Simulated video", 10, 20); x.font = "12px sans-serif"; x.fillText(prompt.slice(0, 40), 10, 168);
				if (t < 2) requestAnimationFrame(draw); else rec.stop();
			})();
		});
	}
	var MOCK_V = {};
	function vstatusReq(j) {
		if (mock) {
			var m = MOCK_V[j.id] || (MOCK_V[j.id] = { polls: 0 }); m.polls++;
			if (/fail/i.test(j.prompt) && !j.retried && m.polls > 1) return Promise.resolve({ status: "failed", retry: true, msg: T("Simulated failure.") });
			return Promise.resolve(m.polls > 2 ? { status: "done" } : { status: "pending" });
		}
		return post({ op: "vstatus", id: j.id, acct: j.acct }).then(jsonOf);
	}
	function vfetch(j) {
		if (mock) return mockVideo(j.prompt);
		return fetch("https://mes.fm/api/ai?op=vfile&id=" + encodeURIComponent(j.id) + "&acct=" + encodeURIComponent(j.acct), { credentials: "omit" }).then(function (r) {
			if (!r.ok) return jsonOf(r).then(function (e) { throw new Error(T(e.error) || T("Could not download the video.")); });
			return r.blob();
		});
	}
	var vtimer = null;
	function vpoll() {
		clearTimeout(vtimer);
		var l = vjobs().filter(function (j) { return !j.err && !j.dl; });
		paintVjobs();
		if (!l.length) return;
		Promise.all(l.map(function (j) {
			return vstatusReq(j).then(function (s) {
				var all = vjobs(), me = all.filter(function (x) { return x.id === j.id; })[0]; if (!me) return;
				if (s.status === "done") {
					me.dl = true; vjobsSave(all); paintVjobs();
					return vfetch(me).then(function (blob) {
						return idbDo("readwrite", function (st) { return st.put(blob, "v:" + me.id); }).then(function () {
							var v = vids(), rec = { id: me.id, prompt: me.prompt, seconds: me.seconds, res: me.res, price: me.price, at: Date.now() };
							if (me.refs && me.refs.length) rec.refs = me.refs;
							v.unshift(rec); vidsSave(v.slice(0, 100));
							vjobsSave(vjobs().filter(function (x) { return x.id !== me.id; })); S.vsel = me.id; save(); paintMedia("vid"); msg(T("Your video is ready (kept in this browser)."), "ok");
						});
					}).catch(function (e) { var a = vjobs(), m2 = a.filter(function (x) { return x.id === me.id; })[0]; if (m2) { m2.dl = false; m2.err = e.message; vjobsSave(a); } });
				}
				if (s.status === "failed") { me.err = s.msg || T("The video failed."); me.retry = !!s.retry; vjobsSave(all); }
				if (s.error) { me.err = s.error; vjobsSave(all); }
			}).catch(function () { /* network blip: next round */ });
		})).then(function () { paintVjobs(); if (vjobs().some(function (j) { return !j.err && !j.dl; })) vtimer = setTimeout(vpoll, mock ? 1500 : 5000); });
	}
	function startVideo(j, isRetry) {
		var go = mock ? Promise.resolve({ t: "video" }) : runReq(j.id, j.acct, function (n) { msg(T("Waiting for the blockchain… ({s} s)", { s: n * 3 })); }).then(function (r) { return r.error ? { err: r.error } : jsonOf(r); });
		return go.then(function (d) {
			if (d.err || d.t !== "video") { var e = d.err || d; j.err = e.error || e.msg || T("The video could not start."); j.retry = !!e.retry; }
			else { j.err = null; j.retry = false; j.at = Date.now(); if (isRetry) j.retried = true; msg(T("Paid. Your video is being made: it takes a few minutes."), "ok"); }
			var l = vjobs().filter(function (x) { return x.id !== j.id; }); l.unshift(j); vjobsSave(l); vpoll();
		});
	}
	$("ai-vmake").addEventListener("click", makeVideo);
	$("ai-vprompt").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); makeVideo(); } });
	function makeVideo() {
		if (busy) return;
		var u = who(), prompt = $("ai-vprompt").value.trim(), model = $("ai-vmodel").value, sec = +$("ai-vsec").value, res = $("ai-vres").value, audio = $("ai-vaudio").checked, refs = M.vid.pend.slice();
		if (!status.video) { msg(T("Videos are coming soon."), "err"); return; }
		if (!u) { msg(T("Log in with your Hive account first (above)."), "err"); return; }
		var err = A.checkVideo(prompt, model, sec, res, refs.length > 0) || A.checkRefs(refs, A.maxRefs("video", model)); if (err) { msg(T(err), "err"); return; }
		setBusy(true);
		var sendRefs = refs.map(function (f) { return { mt: f.mt, data: f.data }; });
		var qreq = mock ? Promise.resolve((function () { var q = A.videoQuote(model, sec, res, refs.length), id = A.newId(); return { status: 200, id: id, memo: A.memoFor(id), price: q.price, usd: q.hbd }; })())
			: quote({ acct: u.name, kind: "video", prompt: prompt, model: model, seconds: sec, res: res, audio: audio, refs: sendRefs });
		qreq.then(function (q) {
			if (q.status !== 200) throw new Error(T(q.error) || T("Could not get a price (HTTP {s}).", { s: q.status }));
			msg(T("Price: {p} HBD ({usd}). Confirm the payment in Hive Keychain…", { p: q.price, usd: A.fmtUsd(q.usd) }));
			return pay(q).then(function () {
				var refIds = keepRefs(refs); M.vid.pend = []; paintRefs("vid");
				var j = { id: q.id, acct: u.name, prompt: prompt, seconds: sec, res: res, price: q.price, at: Date.now() };
				if (refIds.length) j.refs = refIds;
				return startVideo(j, false);
			});
		}).catch(function (e) { var m = e && e.message || String(e); msg(/cancel|declin|denied/i.test(m) ? T("Payment cancelled: nothing was sent.") : T(m), "err"); })
			.then(function () { setBusy(false); });
	}
	$("ai-vjobs").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.vretry) { var j = vjobs().filter(function (x) { return x.id === b.dataset.vretry; })[0]; if (j) { if (mock) MOCK_V[j.id] = { polls: 0 }; startVideo(j, true); } }
		if (b.dataset.vdrop) { vjobsSave(vjobs().filter(function (x) { return x.id !== b.dataset.vdrop; })); paintVjobs(); }
	});

	/* ---------- chat -> Pictures / Videos: a chat model writes text; "make a picture of ..." is offered to the right tab ---------- */
	function offerMedia(wm, text) {
		var isV = wm.kind === "video", m = $("ai-msg");
		msg(isV ? T("This sounds like a video. The chat models write text; videos are made in the 🎬 Video tab.") : T("This sounds like a picture. The chat models write text; pictures are made in the 🖼️ Picture tab."));
		var go = document.createElement("button"); go.type = "button"; go.className = "tu-btn tu-btn--primary";
		go.textContent = isV ? T("🎬 Make it in Video") : T("🖼️ Make it in Picture");
		go.addEventListener("click", function () {
			var kind = isV ? "vid" : "img", pics = PEND.filter(function (f) { return f.t === "img"; });
			showTab(kind);
			$(M[kind].el.prompt).value = wm.prompt;
			$("ai-in").value = "";
			var add = pics.length ? addRefs(kind, pics.map(function (f) { return new File([b64Blob(f.data, f.mt)], f.name || "picture", { type: f.mt }); })) : Promise.resolve();
			PEND = PEND.filter(function (f) { return f.t !== "img"; }); paintFiles();
			add.then(function () { msg(T("Check the description and the price, then press Pay & create."), "ok"); paintPrice(); $(M[kind].el.prompt).focus(); });
		});
		var anyway = document.createElement("button"); anyway.type = "button"; anyway.className = "tu-btn tu-btn--ghost";
		anyway.textContent = T("Send it to the chat anyway");
		anyway.addEventListener("click", function () { msg(""); send(true); });
		m.appendChild(go); m.appendChild(anyway);
		go.focus();
	}

	/* ---------- 💾 saving: cloud file (MESCloud), Hive backup (MESHiveStore), file backup ---------- */
	function sig() { return S.chats.map(function (c) { return c.id + ":" + c.msgs.filter(function (m) { return !m.pending; }).length + ":" + c.at + ":" + (c.mt || 0); }).join("|") + "|" + folderNames().join("/"); }
	function mergeIn(chats, how, folders) {
		var r = A.mergeChats(S.chats, chats);
		S.chats = r.chats; (folders || []).forEach(ensureFolder); S.chats.forEach(function (c) { if (c.folder) ensureFolder(c.folder); }); if (!S.chats.some(function (c) { return c.id === S.cur; })) S.cur = S.chats[0] ? S.chats[0].id : null;
		save(); renderLog(); paintPrice();
		var body = r.added || r.updated ? (r.added === 1 ? T("{n} new chat", { n: r.added }) : T("{n} new chats", { n: r.added })) + (r.updated ? ", " + T("{n} updated", { n: r.updated }) : "") + "." : T("you already had all of them.");
		return (how ? how + ": " : "") + body;
	}
	$("ai-export").addEventListener("click", function () { var d = $("ai-save"); d.open = true; d.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
	function download(name, text, type) {
		var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
	}
	$("ai-dl-md").addEventListener("click", function () {
		var c = A.cleanChat(cur()); if (!c || !c.msgs.length) { msg(T("This chat is empty."), "err"); return; }
		download((c.title.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "chat") + ".md", A.chatMarkdown(c), "text/markdown");
	});
	$("ai-open-text").addEventListener("click", function () {
		var c = A.cleanChat(cur()); if (!c || !c.msgs.length) { msg(T("This chat is empty."), "err"); return; }
		var name = (c.title.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "chat") + ".md";
		var f = new File([A.chatMarkdown(c)], name, { type: "text/markdown" });
		if (!window.MESLinkOpen) { download(name, A.chatMarkdown(c), "text/markdown"); return; }
		window.MESLinkOpen.sendTo("text", f, { busy: true }).catch(function (e) { msg(T("Could not open it: {m}", { m: T(e.message) }), "err"); });
	});
	$("ai-dl-all").addEventListener("click", function () {
		var b = A.backup(S.chats, 0, folderNames()); if (!b.chats.length) { msg(T("No chats to back up yet."), "err"); return; }
		download("MES AI chats " + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(b, null, 1), "application/json");
	});
	$("ai-restore").addEventListener("change", function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		f.text().then(function (t) { msg(mergeIn(A.readBackup(t), T("Restored"), A.readFolders(t)), "ok"); }).catch(function (e) { msg(T(e.message), "err"); });
	});

	// cloud: one file with every chat; auto-saved a few seconds after each change (MESCloud.changed)
	var cdoc = { name: "MES AI chats.json" }, cloudSig = null, CKEY = "mes-ai:cloud";
	function cloudKeep() {
		var l = cloud && cloud.link(cdoc);
		try { if (!l) localStorage.removeItem(CKEY); else localStorage.setItem(CKEY, JSON.stringify({ p: l.p, ref: l.p === "file" ? null : l.ref, hid: l.hid || null, name: l.name, ver: l.ver, dir: l.dir })); } catch (e) { /* ignore */ }
	}
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "ai", folder: "MES Apps/AI", what: "chats file", title: "MES AI", defExt: "json", btnClass: "tu-btn tu-btn--ghost", mount: $("ai-cloudrow"), replaces: true,
		toast: function (t) { msg(t, "ok"); },
		exts: [".json"], accept: [{ description: "MES AI chats", accept: { "application/json": [".json"] } }],
		doc: function () { return cdoc; },
		name: function (d) { return d.name || "MES AI chats.json"; },
		bytes: function () { return Promise.resolve(new TextEncoder().encode(JSON.stringify(A.backup(S.chats, 0, folderNames())))); },
		open: function (u8, name) {
			var txt = new TextDecoder().decode(u8), chats = A.readBackup(txt);
			var note = mergeIn(chats, T("From {name}", { name: name }), A.readFolders(txt));
			cdoc = { name: name }; cloudSig = null;      // our merged copy differs from the file: the next save writes it back
			setTimeout(function () { cloudKeep(); paintSaveState(); msg(note, "ok"); if (cloud) cloud.changed(cdoc); }, 0);
			return cdoc;
		},
		dirty: function () { return cloudSig !== sig(); },
		markDirty: function () { cloudSig = null; },
		saved: function (d, name) { d.name = name; cloudSig = sig(); cloudKeep(); paintSaveState(); }
	}) : null;
	(function () { // a cloud link survives a reload
		var k = null; try { k = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (e) { /* ignore */ }
		if (!k || !cloud) return;
		function put(ref) { cdoc = { name: k.name, __mcl: { p: k.p, ref: ref, name: k.name, ver: k.ver, at: Date.now(), hid: k.hid || undefined, dir: k.dir } }; cloudSig = sig(); cloud.refresh(); paintSaveState(); }
		if (k.p !== "file") return put(k.ref);
		if (!k.hid || !window.indexedDB) return;
		var q = indexedDB.open("mes-cloud", 1);
		q.onupgradeneeded = function () { q.result.createObjectStore("h"); };
		q.onsuccess = function () { try { var r = q.result.transaction("h").objectStore("h").get(k.hid); r.onsuccess = function () { if (r.result) { r.result.__mclId = k.hid; put(r.result); } }; } catch (e) { /* ignore */ } };
	})();
	if (!cloud) $("ai-cloudrow").innerHTML = '<p class="tu-note">' + T("The cloud script did not load. Reload the page to try again.") + '</p>';
	var saveRaw = save;
	save = function () { saveRaw(); if (cloud && cloud.linked(cdoc)) { cloud.changed(cdoc); paintSaveState(); } };
	function paintSaveState() {
		var l = cloud && cloud.link(cdoc);
		var where = l ? (l.p === "file" ? l.name : (cloud.providers[l.p] ? cloud.providers[l.p].name : l.p)) : "";
		$("ai-savestate").textContent = l ? "· ☁ " + (cloudSig === sig() ? T("saved to {where}", { where: where }) : T("saving to {where}", { where: where })) : "";
	}

	// Hive: custom_json "mes_store", app "mes-ai", name "chat" (one chat) or "all"; encrypted by default ("mes-ai:hiveenc" "0" = off)
	var HAPP = "mes-ai", ENC = "mes-ai:hiveenc", hvList = null, hvBusy = false;
	function HS() { return window.MESHiveStore; }
	function hmsg(t, cls) { var m = $("ai-hv-msg"); m.textContent = t || ""; m.className = "tu-note ai-hvmsg" + (cls ? " is-" + cls : ""); }
	function hvErr(e) { return e && e.code === "cancel" ? T("Cancelled.") : e && e.code === "toobig" ? T("Too big for one Hive save (about 150 KB packed). Save one chat at a time, or use the cloud.") : (e && e.message && T(e.message)) || T("Something went wrong."); }
	function hvKb(n) { return n < 1024 ? T("{n} bytes", { n: n }) : (n / 1024).toLocaleString(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " KB"; }
	function hvWhen(t) { var d = new Date(/Z$/.test(t) ? t : t + "Z"); return isNaN(d) ? t : d.toLocaleString(L ? LOC : undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
	function paintHvWarn() {
		var w = $("ai-hv-warn"), enc = $("ai-hv-enc").checked;
		if (HS() && HS().canEncrypt && !HS().canEncrypt() && !(HS().lockMode && HS().lockMode() === "pass")) w.innerHTML = "⚠ " + T("<b>Logged in with the Keychain phone app:</b> it can't use your memo key, so pick <b>🛡 Passphrase</b> under the Encrypt tick, or the save would be public.");
		else w.innerHTML = enc ? (HS() && HS().lockMode && HS().lockMode() === "pass" ? "🛡 " + T("Locked with your passphrase (quantum-safe): only the passphrase opens it.") : "🔒 " + T("Encrypted with your memo key: only you can open it.")) + " " + T("Others can see that a backup exists, when, and its size.")
			: "⚠ " + T("<b>Public:</b> the chat text will be readable by anyone on the Hive blockchain, forever.");
		w.className = "ai-hvwarn" + (enc ? "" : " is-open");
	}
	function hvReady() {
		if (mock) { hmsg(T("Local preview: Hive saving is switched off here (no real Keychain)."), "err"); return null; }
		if (!HS() || !H) { hmsg(T("The Hive scripts did not load. Reload the page."), "err"); return null; }
		var u = H.user(); if (!u) { hmsg(T("Log in with Hive Keychain first (at the top of the page)."), "err"); $("ai-acct-card").scrollIntoView({ block: "center" }); return null; }
		return u;
	}
	function hvBusySet(b) { hvBusy = b; $("ai-hv-save").disabled = b; $("ai-hv-load").disabled = b; }
	$("ai-hv-enc").checked = (function () { try { return localStorage.getItem(ENC) !== "0"; } catch (e) { return true; } })();
	$("ai-hv-enc").addEventListener("change", function () { try { localStorage.setItem(ENC, this.checked ? "1" : "0"); } catch (e) {} paintHvWarn(); });
	if (HS() && HS().encModeUI) HS().encModeUI($("ai-hv-enc"), paintHvWarn);
	paintHvWarn();
	$("ai-hv-save").addEventListener("click", function () {
		if (hvBusy) return;
		var u = hvReady(); if (!u) return;
		var one = $("ai-hv-what").value === "chat", b = A.backup(one ? [cur()] : S.chats, 0, one ? [] : folderNames());
		if (!b.chats.length) { hmsg(one ? T("This chat is empty.") : T("No chats to save yet."), "err"); return; }
		var enc = $("ai-hv-enc").checked;
		if (!enc && !confirm(T("Save WITHOUT encryption?\n\nThe chat text will be public on the Hive blockchain, readable by anyone, and can never be deleted."))) return;
		hvBusySet(true);
		HS().save(HAPP, one ? "chat" : "all", b, { encrypt: enc, onProgress: function (m) { hmsg(T(m)); } }).then(function (r) {
			var what = one ? T("this chat") : (b.chats.length === 1 ? T("{n} chat", { n: 1 }) : T("{n} chats", { n: b.chats.length }));
			hmsg(T("Saved {what} to @{name} on Hive ({size}).", { what: what, name: u.name, size: hvKb(r.bytes) + ", " + (enc ? T("encrypted") : T("public")) }), "ok");
			hvList = null; setTimeout(function () { hvLoad(true); }, 4000);
		}).catch(function (e) { hmsg(hvErr(e), "err"); }).then(function () { hvBusySet(false); });
	});
	function hvLoad(quiet) {
		var u = hvReady(); if (!u || (hvBusy && !quiet)) return;
		hvBusySet(true); if (!quiet) hmsg(T("Looking for your saves on Hive…"));
		HS().list(u.name, { app: HAPP, pages: 30 }).then(function (saves) {
			hvList = saves.filter(function (e) { return e.name === "chat" || e.name === "all"; }).slice(0, 15);
			$("ai-hv-list").innerHTML = hvList.length ? '<ul class="ai-hvl">' + hvList.map(function (e, i) {
				return "<li><span><b>" + esc(hvWhen(e.time)) + "</b> <span class=\"ai-sub\">" + (e.name === "chat" ? T("One chat") : T("All chats")) + " · " + esc(HS().lockLabel ? T(HS().lockLabel(e)) : (e.encrypted ? T("encrypted") : T("public"))) + " · " + hvKb(e.bytes) + (e.complete ? "" : " · " + T("incomplete")) + "</span></span>" +
					(e.complete ? '<button type="button" class="tu-btn tu-btn--ghost" data-hv="' + i + '">' + T("Add to my chats") + '</button>' : "") + "</li>";
			}).join("") + "</ul>" : "";
			if (!quiet) hmsg(hvList.length ? T("Pick a save to add its chats to yours.") : T("No MES AI saves found on @{name} yet.", { name: u.name }), hvList.length ? "" : "err");
		}).catch(function (e) { hmsg(T("Could not read from Hive: {m}", { m: hvErr(e) }), "err"); }).then(function () { hvBusySet(false); });
	}
	$("ai-hv-load").addEventListener("click", function () { hvLoad(false); });
	$("ai-hv-list").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hv]"); if (!b || hvBusy) return;
		var it = hvList[+b.dataset.hv]; hvBusySet(true);
		hmsg(it.lock === "pass" ? T("Unlocking with your passphrase…") : it.encrypted ? T("Confirm in Keychain: decrypt with your memo key…") : T("Opening the save…"));
		HS().load(it).then(function (d) { hmsg(mergeIn(A.readBackup(d), T("Loaded from Hive"), A.readFolders(d)), "ok"); }).catch(function (x) { hmsg(hvErr(x), "err"); }).then(function () { hvBusySet(false); });
	});

	/* ---------- tabs ---------- */
	function showTab(t) {
		S.tab = t; save();
		$("ai-tab-chat").setAttribute("aria-selected", t === "chat"); $("ai-tab-img").setAttribute("aria-selected", t === "img"); $("ai-tab-vid").setAttribute("aria-selected", t === "vid");
		$("ai-chat").hidden = t !== "chat"; $("ai-img").hidden = t !== "img"; $("ai-vid").hidden = t !== "vid";
		if (t === "chat" && R) R.typeset($("ai-log"));
		if (t === "img") paintMedia("img");
		if (t === "vid") { paintMedia("vid"); paintVjobs(); }
	}
	$("ai-tab-chat").addEventListener("click", function () { showTab("chat"); });
	$("ai-tab-img").addEventListener("click", function () { showTab("img"); });
	$("ai-tab-vid").addEventListener("click", function () { showTab("vid"); });

	/* ---------- switched on? ---------- */
	function paintOff() {
		var o = $("ai-off");
		// a service whose key is not set yet: "Coming soon" on its tab, a note in its panel, and its button off
		[["ai-tab-img", "ai-img", status.image, "🖼️ " + T("Picture"), T("Pictures are coming soon.")], ["ai-tab-vid", "ai-vid", status.video, "🎬 " + T("Video"), T("Videos are coming soon.")]].forEach(function (x) {
			var soon = status.known && !x[2];
			$(x[0]).innerHTML = x[3] + (soon ? ' <span class="ai-soon-tag">' + T("soon") + '</span>' : "");
			var n = $(x[1]).querySelector(".ai-soon");
			if (soon && !n) { n = document.createElement("p"); n.className = "ai-soon"; n.innerHTML = "<b>" + x[4] + "</b> " + T("The page is ready; this AI service is being connected. Chat works now."); $(x[1]).insertBefore(n, $(x[1]).firstChild); }
			if (!soon && n) n.remove();
		});
		var off = status.known && !status.chat;
		o.hidden = !off;
		if (!off) return;
		o.innerHTML = window.MES_AI_APP ? T("<b>Can't reach MES AI right now.</b> Check your internet connection, then close and reopen the app.") : T('<b>MES AI is coming soon.</b> The page is ready; the AI services are being connected. <a href="?mock=1">Try the demo</a> (simulated payment and answer).');
	}
	if (!mock) {
		fetch("https://mes.fm/api/ai?op=status", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
			status = { chat: !!j.chat, image: !!j.image, video: !!j.video && !window.MES_AI_APP, known: true, prov: j.prov || { anthropic: !!j.chat, openai: !!j.image, xai: !!j.video } };
			FREEST.on = !!(j.free && j.free.on); FREEST.perDay = (j.free && j.free.perDay) || A.FREE.perDay; if (FREEST.on) loadFree();
			fillModels(); paintOff(); paintPrice();
		}).catch(function () { status = { chat: false, image: false, video: false, known: true, prov: {} }; fillModels(); paintOff(); paintPrice(); });
	}

	/* ---------- ⓘ: the notes / costs under each box are folded away (S.det = shown), one choice for all three tabs ---------- */
	function paintDet() {
		[].forEach.call(root.querySelectorAll("[data-det]"), function (b) {
			b.setAttribute("aria-expanded", !!S.det);
			var box = b.closest(".ai-compose"); [].forEach.call(box.querySelectorAll(".ai-det"), function (d) { d.hidden = !S.det; });
		});
	}
	root.addEventListener("click", function (e) { if (e.target.closest("[data-det]")) { S.det = !S.det; save(); paintDet(); } });
	paintDet();
	// the text-size pill of the answers goes into the chat's top bar (it had a row of its own above the answers)
	(function movePill(n) {
		var row = $("ai-chat").querySelector(".mes-ts-row--solo"), pill = row && row.querySelector(".mes-ts");
		if (pill) { pill.classList.add("ai-pill"); $("ai-chatbar").insertBefore(pill, $("ai-new")); if (!row.children.length) row.remove(); return; }
		if (n < 40) setTimeout(function () { movePill(n + 1); }, 250);
	})(0);

	/* ---------- Fill window: the whole app (account, the Chat / Picture / Video tabs and their panels), so the tabs work inside it ---------- */
	function addPanel() { if (window.MESPanel) window.MESPanel.add($("ai-app"), { bar: $("ai-modes"), t: T }); }
	if (window.MESPanel) addPanel(); else window.addEventListener("load", addPanel);

	if (H && H.onChange) H.onChange(function () { paintAcct(); });
	paintAcct(); renderLog(); showTab(S.tab); paintOff(); if (mock) loadFree(); paintPrice(); vjobsSave(vjobs().map(function (j) { j.dl = false; return j; })); vpoll();
	window.MESAIDebug = { S: S, status: status, send: send, mock: mock };
})();
