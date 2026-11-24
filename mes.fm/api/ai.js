// MES AI (mes.fm/ai): AI chat and pictures, paid per prompt in HBD on Hive. No balance, no account here.
//
// Flow (the page: tool_apps_src/ai/app.js; shared rules + prices: _ai-lib.js = tool_apps_src/ai/lib.js, byte-identical):
//   GET  ?op=status                 -> {chat, image, margin, checked, models, image prices}   (chat/image false = key not set yet)
//   POST {op:"quote", acct, kind:"chat", model, len, messages}  or  {op:"quote", acct, kind:"image", prompt, quality, size, refs?}
//        (refs = reference pictures [{mt, data base64}]: picture edits / combining (OpenAI and xAI /v1/images/edits) or a video's first frame)
//        -> counts the input tokens (Anthropic count_tokens, exact), prices it (cost x MARGIN, up to 0.001 HBD), keeps the
//           whole request in Upstash for 1 hour under a random id -> {id, memo:"mesai:<id>", price, usd, inTokens, maxOut}
//   (the page sends `price` HBD to @mes with that memo through Hive Keychain / HiveAuth)
//   POST {op:"run", id, acct}       -> looks for the transfer in the payer's own account history (from acct, to @mes, HBD,
//        exact memo, >= price, after the quote); 402 {pending} while it is not in a block yet; marks the id used
//        (SET NX, so one payment = one answer), then calls the model with output capped at what was paid for:
//        chat = NDJSON stream {t:"text",v} / {t:"think"} / {t:"done",stop} / {t:"error",msg,retry}; image = JSON {t:"image",b64,mime}.
//        If the model call fails after payment, a one-use retry is kept for 24 h ("ai:retry:<id>"): the next run of the same
//        id is free. No refunds (said on the page).
//
// Calls go straight to the HTTP APIs with fetch (no SDK: the mes.fm Vercel project has no package manager, like every
// other function here). Video (Grok Imagine, xAI): run starts a job (POST /v1/videos/generations), POST {op:"vstatus", id, acct}
// checks it (GET /v1/videos/<request_id>), GET ?op=vfile&id=&acct= passes the finished file on (xAI's link is temporary).
// Models per company (MODELS / IMAGES in the lib, each with prov): chat = Anthropic Claude (messages API) or OpenAI GPT (Chat Completions,
// input counted with /v1/responses/input_tokens); pictures = OpenAI gpt-image-2 or xAI Grok Imagine (/v1/images/generations).
// OpenAI video (Sora 2) is not offered: OpenAI shut the Videos API down on 2026-09-24.
// OpenRouter (2026-11-23): cheap pictures (FLUX 3 Klein, Recraft V4.1 Flash, Seedream 5.0 Flash; POST /api/v1/images) and videos
// (Seedance 2.0 Mini, Veo 3.1 Lite; POST /api/v1/videos + GET /api/v1/videos/<id>, the file fetched with our key), and the free daily
// pictures (op "freepic", Recraft's free copy). Key OPENROUTER_API_KEY; AI_FREE_PICS=0 switches the free pictures off.
// Keys: Vercel env ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY (plain project-level vars), never sent out.
// Limits per hour: 300 quotes per IP hash, 60 answers per Hive account, 100 per IP hash. Tests: node tool_apps_src/ai-tests.js

const crypto = require('crypto');
const APP_ORIGINS = /^(capacitor:\/\/localhost|https:\/\/localhost)$/;
const A = require('./_ai-lib.js');

const QUOTE_TTL = 3600;
const LIM = { quoteIp: 300, runAcct: 60, runIp: 100 };
const HIST_FILTER_LOW = 4; // get_account_history operation filter: transfer (op 2)

function upstash(env, fetchImpl) {
  return async function redis(commands) {
    const r = await fetchImpl(`${env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!r.ok) throw new Error('redis ' + r.status);
    return (await r.json()).map((x) => (x ? x.result : null));
  };
}

function ipOf(req) {
  const h = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '';
  return String(h).split(',')[0].trim() || 'unknown';
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let s = '';
  for await (const c of req) { s += c; if (s.length > 4.6e6) throw new Error('too big'); }
  return s ? JSON.parse(s) : {};
}

/* ---------- Hive signature check (Keychain requestSignBuffer: a recoverable secp256k1 signature of sha256(message), 65 bytes hex =
   recovery byte + r + s) against a public key "STM..." (base58 of the 33-byte compressed point + 4-byte checksum). Node's crypto does
   the ECDSA; the point is uncompressed here (y^2 = x^3 + 7 mod p). No packages. ---------- */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(str) {
  let n = 0n;
  for (const c of str) { const i = B58.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  const lead = (str.match(/^1*/) || [''])[0].length;
  return Buffer.concat([Buffer.alloc(lead), Buffer.from(n ? hex : '', 'hex')]);
}
const P = 2n ** 256n - 2n ** 32n - 977n;
function modpow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
function pubKeyObject(stm) {
  if (typeof stm !== 'string' || !/^(STM|TST)/.test(stm)) return null;
  const raw = b58decode(stm.slice(3));
  if (!raw || raw.length !== 37 || (raw[0] !== 2 && raw[0] !== 3)) return null;
  const x = BigInt('0x' + raw.subarray(1, 33).toString('hex'));
  let y = modpow((x * x * x + 7n) % P, (P + 1n) / 4n, P);
  if ((y & 1n) !== BigInt(raw[0] & 1)) y = P - y;
  const b64 = (v) => Buffer.from(v.toString(16).padStart(64, '0'), 'hex').toString('base64url');
  try { return crypto.createPublicKey({ key: { kty: 'EC', crv: 'secp256k1', x: b64(x), y: b64(y) }, format: 'jwk' }); } catch (e) { return null; }
}
function hiveVerify(message, sigHex, stm) {
  try {
    const key = pubKeyObject(stm); if (!key || !/^[0-9a-f]{130}$/i.test(sigHex)) return false;
    return crypto.verify('sha256', Buffer.from(message, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sigHex.slice(2), 'hex'));
  } catch (e) { return false; }
}

function makeHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now || Date.now;
  const redis = deps.redis || upstash(env, fetchImpl);
  const rpc = deps.rpc || ((m, p) => require('./premium').rpc(m, p, fetchImpl));
  const salt = env.AI_SALT || env.UPSTASH_REDIS_REST_TOKEN || 'mes-ai';

  async function overLimit(key, max) {
    const hour = Math.floor(now() / 3600e3);
    const k = `ai:rl:${key}:${hour}`;
    const [n] = await redis([['INCR', k], ['EXPIRE', k, '3700']]);
    return Number(n) > max;
  }

  function anthropicHeaders(extraBeta) {
    const h = { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    if (extraBeta) h['anthropic-beta'] = extraBeta;
    return h;
  }

  async function countTokens(model, messages, system) {
    let last;
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetchImpl('https://api.anthropic.com/v1/messages/count_tokens', {
          method: 'POST', headers: anthropicHeaders(), body: JSON.stringify({ model, system: system || A.SYSTEM, messages }),
        });
        const j = await r.json();
        if (r.ok && Number.isFinite(j.input_tokens)) return j.input_tokens;
        last = new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      } catch (e) { last = e; }
    }
    throw last;
  }

  const keyOf = (prov) => (prov === 'openai' ? env.OPENAI_API_KEY : prov === 'xai' ? env.XAI_API_KEY : prov === 'openrouter' ? env.OPENROUTER_API_KEY : env.ANTHROPIC_API_KEY);

  // OpenAI's own count (Responses input_tokens) + a little room for the Chat Completions wrapper; if it does not answer,
  // a count that can only be too high (1 token per character), so the quote still covers the bill
  async function countOpenAI(modelKey, messages, lang) {
    const sys = A.systemFor(modelKey, lang);
    try {
      const r = await fetchImpl('https://api.openai.com/v1/responses/input_tokens', {
        method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: A.MODELS[modelKey].id, instructions: sys, input: A.toOpenAIResponses(messages) }),
      });
      const j = await r.json();
      if (r.ok && Number.isFinite(j.input_tokens)) return Math.ceil(j.input_tokens * 1.05) + 8 + 4 * messages.length;
    } catch (e) {}
    return A.safeTokens(sys, messages);
  }

  async function quote(req, res, b) {
    const acct = String(b.acct || '').trim().replace(/^@/, '').toLowerCase();
    if (!A.validName(acct)) return send(res, 400, { error: 'Log in with your Hive account first.' });
    const iph = sha(ipOf(req) + salt).slice(0, 24);
    if (await overLimit('q:' + iph, LIM.quoteIp)) return send(res, 429, { error: 'Too many requests from this network. Try again in an hour.' });
    let q, stored;
    if (b.kind === 'video') {
      const vm = A.VIDEO.models[b.model];
      if (!vm) return send(res, 400, { error: 'Pick a video model.' });
      if (!keyOf(vm.prov)) return send(res, 503, { off: true, error: 'Videos are coming soon.' });
      const refs = b.refs == null ? [] : b.refs;
      const err = A.checkVideo(b.prompt, b.model, b.seconds, b.res, Array.isArray(refs) && refs.length > 0) || A.checkRefs(refs, A.maxRefs('video', b.model));
      if (err) return send(res, 400, { error: err });
      q = A.videoQuote(b.model, b.seconds, b.res, refs.length);
      stored = { kind: 'video', prompt: String(b.prompt || ''), model: b.model, seconds: q.seconds, res: b.res, audio: b.audio !== false, refs: A.cleanRefs(refs) };
    } else if (b.kind === 'image') {
      const model = b.model || 'gpt';
      const im = A.IMAGES[model];
      if (!im) return send(res, 400, { error: 'Pick a picture model.' });
      if (!keyOf(im.prov)) return send(res, 503, { off: true, error: im.name + ' pictures are coming soon.' });
      const refs = b.refs == null ? [] : b.refs;
      const err = A.checkImage(b.prompt, b.quality, b.size, model) || A.checkRefs(refs, A.maxRefs('image', model));
      if (err) return send(res, 400, { error: err });
      // prompt tokens estimated on the safe side (2 characters a token); a few cents of a cent at most. Reference pictures: A.REFS
      q = A.imageQuote(b.quality, b.size, Math.ceil(b.prompt.length / 2) + 8, model, refs.length);
      stored = { kind: 'image', model, prompt: b.prompt, quality: b.quality, size: b.size, refs: A.cleanRefs(refs) };
    } else {
      const m = A.MODELS[b.model];
      if (!m) return send(res, 400, { error: 'Pick a model.' });
      if (m.prov === 'local') return send(res, 400, { error: 'This model runs on your own device: nothing is sent to mes.fm.' });
      if (!keyOf(m.prov)) return send(res, 503, { off: true, error: m.name + ' is coming soon.' });
      if (!m.caps[b.len]) return send(res, 400, { error: 'Pick an answer length.' });
      const err = A.checkMessages(b.messages) || A.checkTextOnly(b.model, b.messages);
      if (err) return send(res, 400, { error: err });
      const messages = A.cleanMessages(b.messages);
      const lang = A.cleanLang(b.lang);
      let inTok;
      // OpenRouter has no counting endpoint: the safe count (1 token a character) can only be too high
      try { inTok = m.prov === 'openrouter' ? A.safeTokens(A.systemFor(b.model, lang), messages) : m.prov === 'openai' ? await countOpenAI(b.model, messages, lang) : await countTokens(m.id, A.toAnthropic(messages), A.systemFor(b.model, lang)); } catch (e) { return send(res, 502, { error: 'Could not price this message right now. Try again in a moment.' }); }
      if (inTok > A.LIMITS.inTokens) return send(res, 400, { error: 'This chat is too long (' + inTok.toLocaleString('en-US') + ' tokens). Start a new chat.' });
      q = A.chatQuote(b.model, inTok, b.len);
      stored = { kind: 'chat', model: b.model, len: b.len, lang, messages };
    }
    const id = A.newId((n) => crypto.randomBytes(n));
    const rec = Object.assign(stored, { acct, price: q.price, maxOut: q.maxOut || 0, created: now() });
    await saveRec(id, rec);
    return send(res, 200, { id, memo: A.memoFor(id), to: A.PAY_TO, price: q.price, usd: q.hbd * A.HBD_USD, inTokens: q.inTokens, maxOut: q.maxOut || 0, kind: q.kind });
  }

  // A quote with files can be a few MB: it is kept in pieces of 700 KB (one Upstash command each stays small);
  // 'ai:q:<id>' is then {parts: n} and the pieces are 'ai:q:<id>:<i>'.
  const PART = 700000;
  async function saveRec(id, rec) {
    const json = JSON.stringify(rec), ttl = String(QUOTE_TTL);
    if (json.length <= PART) return redis([['SET', 'ai:q:' + id, json, 'EX', ttl]]);
    const n = Math.ceil(json.length / PART);
    for (let i = 0; i < n; i++) await redis([['SET', 'ai:q:' + id + ':' + i, json.slice(i * PART, (i + 1) * PART), 'EX', ttl]]);
    return redis([['SET', 'ai:q:' + id, JSON.stringify({ parts: n }), 'EX', ttl]]);
  }
  async function loadRec(id) {
    const [raw] = await redis([['GET', 'ai:q:' + id]]);
    let rec = raw ? JSON.parse(raw) : null;
    if (rec && rec.parts) {
      const keys = []; for (let i = 0; i < rec.parts; i++) keys.push('ai:q:' + id + ':' + i);
      const [vals] = await redis([['MGET', ...keys]]);
      if (!Array.isArray(vals) || vals.some((v) => v == null)) return null;
      rec = JSON.parse(vals.join(''));
    }
    return rec;
  }

  async function paid(rec, id) {
    const hist = await rpc('condenser_api.get_account_history', [rec.acct, -1, 300, HIST_FILTER_LOW, 0]);
    return A.findPayment(hist, { from: rec.acct, memo: A.memoFor(id), price: rec.price, since: rec.created - 120e3 });
  }

  async function run(req, res, b) {
    const id = String(b.id || '');
    if (!A.validId(id)) return send(res, 400, { error: 'Bad request id.' });
    const rec = await loadRec(id);
    if (!rec) return send(res, 404, { error: 'This price ran out (prices are kept for 1 hour). If you already paid, contact us with the memo mesai:' + id + '.' });
    const acct = String(b.acct || '').trim().replace(/^@/, '').toLowerCase();
    if (acct !== rec.acct) return send(res, 403, { error: 'This request belongs to another Hive account.' });

    const [retry] = await redis([['GETDEL', 'ai:retry:' + id]]);
    const isRetry = retry === '1';
    if (!isRetry) {
      const [used] = await redis([['EXISTS', 'ai:paid:' + id]]);
      if (Number(used)) return send(res, 409, { error: 'This payment was already used for an answer.' });
      let pay;
      try { pay = await paid(rec, id); } catch (e) { return send(res, 502, { pending: true, error: 'The Hive nodes did not answer. Trying again…' }); }
      if (!pay) return send(res, 402, { pending: true, error: 'The payment is not on the blockchain yet.' });
      const [ok] = await redis([['SET', 'ai:paid:' + id, JSON.stringify(pay), 'NX', 'EX', String(30 * 86400)]]);
      if (ok !== 'OK') return send(res, 409, { error: 'This payment was already used for an answer.' });
      const iph = sha(ipOf(req) + salt).slice(0, 24);
      // the limits count paid answers, so a paying abuser is slowed, never charged twice: a refused run keeps a free retry
      if ((await overLimit('ra:' + rec.acct, LIM.runAcct)) || (await overLimit('ri:' + iph, LIM.runIp))) {
        await redis([['SET', 'ai:retry:' + id, '1', 'EX', '86400']]);
        return send(res, 429, { retry: true, error: 'Too many answers this hour. Your payment is kept: press Try again later (within 24 hours).' });
      }
    }
    const failed = async (res2, msg, streaming) => {
      if (!isRetry) await redis([['SET', 'ai:retry:' + id, '1', 'EX', '86400']]).catch(() => {});
      const out = { t: 'error', msg, retry: !isRetry };
      if (streaming) { res2.write(JSON.stringify(out) + '\n'); res2.end(); } else send(res2, 502, out);
    };
    const who = sha('acct:' + rec.acct + salt).slice(0, 32);
    if (rec.kind === 'image') return image(res, rec, who, failed);
    if (rec.kind === 'video') return videoStart(res, rec, id, isRetry, failed);
    return chat(res, rec, who, failed);
  }

  // cheap models through OpenRouter (OpenAI-style Chat Completions). provider.max_price = the prices we quoted with, so OpenRouter never
  // routes to a dearer provider; usage.include returns the real cost (usage.cost, USD) in the last piece.
  function openrouterCall(rec, who, maxOut) {
    const m = A.MODELS[rec.model];
    return fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://mes.fm/ai', 'X-Title': 'MES AI' },
      body: JSON.stringify({ model: m.id, messages: [{ role: 'system', content: A.systemFor(rec.model, rec.lang) }].concat(A.toOpenAIChat(rec.messages)), stream: true,
        max_tokens: maxOut, user: who, usage: { include: true }, provider: { max_price: { prompt: m.inUsd, completion: m.outUsd }, data_collection: 'deny' } }),
    });
  }
  async function chat(res, rec, who, failed) {
    const m = A.MODELS[rec.model];
    if (m.prov === 'openrouter') {
      let r;
      try { r = await openrouterCall(rec, who, rec.maxOut); } catch (e) { return failed(res, 'Could not reach the AI service. Your payment is kept: press Try again.', false); }
      return pump(res, r, A.streamPieceOpenAI, failed);
    }
    if (m.prov === 'openai') {
      // OpenAI Chat Completions; max_completion_tokens caps the reasoning tokens too, so the bill stays inside the quote
      const body = {
        model: m.id, messages: [{ role: 'system', content: A.systemFor(rec.model, rec.lang) }].concat(A.toOpenAIChat(rec.messages)), stream: true,
        stream_options: { include_usage: true }, max_completion_tokens: rec.maxOut, reasoning_effort: m.effort, safety_identifier: who,
      };
      let r;
      try {
        r = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } catch (e) { return failed(res, 'Could not reach the AI service. Your payment is kept: press Try again.', false); }
      return pump(res, r, A.streamPieceOpenAI, failed);
    }
    const body = {
      model: m.id, max_tokens: rec.maxOut, system: A.systemFor(rec.model, rec.lang), messages: A.toAnthropic(rec.messages), stream: true,
      output_config: { effort: m.effort }, metadata: { user_id: who },
    };
    if (m.fallback) body.fallbacks = [{ model: m.fallback }];
    let r;
    try {
      r = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: anthropicHeaders(m.fallback ? 'server-side-fallback-2026-07-01' : null), body: JSON.stringify(body),
      });
    } catch (e) { return failed(res, 'Could not reach the AI service. Your payment is kept: press Try again.', false); }
    return pump(res, r, A.streamPiece, failed);
  }

  // passes a provider's server-sent events on to the page as NDJSON pieces; resolves to {ok, usage} (free messages read the real cost)
  async function pump(res, r, piece, failed) {
    if (!r.ok) {
      let msg = 'The AI service answered ' + r.status + '.';
      try { const j = await r.json(); if (j.error && j.error.message) msg += ' ' + j.error.message; } catch (e) {}
      await failed(res, msg + ' Your payment is kept: press Try again.', false);
      return { ok: false };
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    let buf = '', stop = null, gotText = false, err = null, usage = null;
    const dec = new TextDecoder();
    const handle = (txt) => {
      const s = A.sseSplit(buf + txt);
      buf = s.rest;
      for (const ev of s.events) {
        const p = piece(ev);
        if (!p) continue;
        if (p.t === 'text') { if (p.v) { gotText = true; res.write(JSON.stringify(p) + '\n'); } }
        else if (p.t === 'think') res.write('{"t":"think"}\n');
        else if (p.t === 'stop') { if (p.stop) stop = p.stop; if (p.usage) usage = p.usage; }
        else if (p.t === 'error') err = p.msg;
      }
    };
    try {
      if (r.body && r.body.getReader) {
        const rd = r.body.getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; handle(dec.decode(value, { stream: true })); }
      } else {
        for await (const c of r.body) handle(typeof c === 'string' ? c : dec.decode(c, { stream: true }));
      }
      handle('\n\n');
    } catch (e) { err = err || 'The answer was cut off.'; }
    if (err) {
      // a refused or broken answer after text has started: still give the free retry (the provider may have billed us; fine)
      await failed(res, err + ' Your payment is kept: press Try again.', true);
      return { ok: false, usage };
    }
    res.write(JSON.stringify({ t: 'done', stop, out: usage && (usage.output_tokens || usage.completion_tokens) }) + '\n');
    res.end();
    return { ok: true, usage };
  }

  /* ---------- free daily messages (A.FREE): proof of the Hive account = a Keychain signature of A.freeMessage(acct, day) with a posting key ---------- */
  const freeUsdCap = () => { const v = Number(env.AI_FREE_USD); return Number.isFinite(v) && v >= 0 ? v : A.FREE.usdPerDay; };
  const freeOn = () => !!env.OPENROUTER_API_KEY && freeUsdCap() > 0;
  async function freeLeft(acct, day) {
    const [n] = await redis([['GET', 'ai:free:' + day + ':' + acct]]);
    return Math.max(0, A.FREE.perDay - (Number(n) || 0));
  }
  async function signedBy(acct, day, sig) {
    const k = 'ai:fsig:' + sha(acct + '|' + day + '|' + sig).slice(0, 32);
    const [hit] = await redis([['GET', k]]);
    if (hit === '1') return true;
    let accts;
    try { accts = await rpc('condenser_api.get_accounts', [[acct]]); } catch (e) { throw new Error('nodes'); }
    const a = Array.isArray(accts) && accts[0];
    if (!a || a.name !== acct || !a.posting) return false;
    const msg = A.freeMessage(acct, day);
    const ok = (a.posting.key_auths || []).some((ka) => hiveVerify(msg, sig, ka[0]));
    if (ok) await redis([['SET', k, '1', 'EX', String(2 * 86400)]]);
    return ok;
  }
  async function free(req, res, b) {
    if (!freeOn()) return send(res, 503, { off: true, error: 'Free messages are not switched on yet.' });
    const acct = String(b.acct || '').trim().replace(/^@/, '').toLowerCase();
    if (!A.validName(acct)) return send(res, 400, { error: 'Log in with your Hive account first.' });
    const today = A.utcDay(now()), day = String(b.day || '');
    if (day !== today) return send(res, 400, { error: 'resign', resign: true });
    if (typeof b.sig !== 'string' || !/^[0-9a-f]{130}$/i.test(b.sig)) return send(res, 400, { error: 'resign', resign: true });
    const m = A.MODELS[b.model];
    if (!m || !m.free) return send(res, 400, { error: 'Free messages work with the cheap models only.' });
    const err = A.checkMessages(b.messages) || A.checkTextOnly(b.model, b.messages);
    if (err) return send(res, 400, { error: err });
    const messages = A.cleanMessages(b.messages), lang = A.cleanLang(b.lang);
    if (A.safeTokens(A.systemFor(b.model, lang), messages) > A.FREE.maxIn) return send(res, 400, { long: true, error: 'This chat is too long for a free message. Start a new chat, or pay for this one.' });
    let ok;
    try { ok = await signedBy(acct, day, b.sig.toLowerCase()); } catch (e) { return send(res, 502, { error: 'The Hive nodes did not answer. Try again in a moment.' }); }
    if (!ok) return send(res, 403, { error: 'resign', resign: true });
    const iph = sha(ipOf(req) + salt).slice(0, 24), worst = Math.ceil(A.freeWorstUsd(b.model) * 1e6), cap = Math.round(freeUsdCap() * 1e6);
    const ka = 'ai:free:' + day + ':' + acct, ki = 'ai:freeip:' + day + ':' + iph, kb = 'ai:freeusd:' + day;
    const [na, , ni, , spent] = await redis([['INCR', ka], ['EXPIRE', ka, '90000'], ['INCR', ki], ['EXPIRE', ki, '90000'], ['INCRBY', kb, String(worst)], ['EXPIRE', kb, '90000']]);
    const undo = () => redis([['DECR', ka], ['DECR', ki], ['DECRBY', kb, String(worst)]]).catch(() => {});
    if (Number(na) > A.FREE.perDay) { await undo(); return send(res, 429, { left: 0, error: 'You have used today\'s free messages. They come back at 00:00 UTC; paid messages work now.' }); }
    if (Number(ni) > A.FREE.perIp) { await undo(); return send(res, 429, { error: 'Too many free messages from this network today. Paid messages work now.' }); }
    if (Number(spent) > cap) { await undo(); return send(res, 429, { budget: true, error: 'Today\'s free messages for everyone are used up. They come back at 00:00 UTC; paid messages work now.' }); }
    const left = Math.max(0, A.FREE.perDay - Number(na));
    let r;
    try { r = await openrouterCall({ model: b.model, lang, messages }, sha('acct:' + acct + salt).slice(0, 32), A.FREE.maxOut); } catch (e) { await undo(); return send(res, 502, { error: 'Could not reach the AI service. Your free message was not used.' }); }
    const gave = (res2, msg, streaming) => {
      undo();
      const out = { t: 'error', msg: msg.replace(/ Your payment is kept: press Try again\./, ' Your free message was not used: send it again.'), retry: false, free: true };
      if (streaming) { res2.write(JSON.stringify(out) + '\n'); res2.end(); } else send(res2, 502, out);
    };
    if (r.ok) { res.setHeader('X-Free-Left', String(left)); }
    const done = await pump(res, r, A.streamPieceOpenAI, gave);
    // put back what the worst case reserved beyond the real cost (OpenRouter reports usage.cost in USD)
    if (done && done.ok && done.usage && Number.isFinite(Number(done.usage.cost))) {
      const back = worst - Math.ceil(Number(done.usage.cost) * 1e6);
      if (back > 0) await redis([['DECRBY', kb, String(back)]]).catch(() => {});
    }
  }

  /* ---------- Grok Imagine video: a job that takes minutes. run starts it; the page then asks "vstatus" every few seconds and
     fetches the finished file through "vfile" (xAI's link is temporary and may not allow other sites to read it). ---------- */
  const xaiHeaders = () => ({ Authorization: 'Bearer ' + env.XAI_API_KEY, 'Content-Type': 'application/json' });
  async function videoStart(res, rec, id, isRetry, failed) {
    const m = A.VIDEO.models[rec.model];
    if (m.prov === 'openrouter') return orVideoStart(res, rec, id, isRetry, failed, m);
    let r, j;
    try {
      r = await fetchImpl('https://api.x.ai/v1/videos/generations', {
        method: 'POST', headers: xaiHeaders(),
        body: JSON.stringify(Object.assign({ model: m.id, duration: rec.seconds, resolution: rec.res, generate_audio: !!rec.audio },
          rec.prompt ? { prompt: rec.prompt } : {}, rec.refs && rec.refs.length ? { image: { url: A.dataUrl(rec.refs[0]) } } : {})),
      });
      j = await r.json();
    } catch (e) { return failed(res, 'Could not reach the video service. Your payment is kept: press Try again.', false); }
    if (!r.ok || !j || !j.request_id) {
      return failed(res, 'The video service answered ' + r.status + '.' + (j && j.error ? ' ' + (j.error.message || j.error) : '') + ' Your payment is kept: press Try again.', false);
    }
    await redis([['SET', 'ai:vjob:' + id, JSON.stringify({ rid: String(j.request_id), acct: rec.acct, retried: isRetry, at: now() }), 'EX', '86400']]);
    return send(res, 200, { t: 'video', job: id });
  }
  async function vjob(b) {
    const id = String(b.id || '');
    if (!A.validId(id)) return { code: 400, err: 'Bad request id.' };
    const [raw] = await redis([['GET', 'ai:vjob:' + id]]);
    const job = raw ? JSON.parse(raw) : null;
    if (!job) return { code: 404, err: 'This video job is no longer known (videos are kept for 24 hours).' };
    if (String(b.acct || '').toLowerCase() !== job.acct) return { code: 403, err: 'This video belongs to another Hive account.' };
    return { id, job };
  }
  async function vstatus(req, res, b) {
    const v = await vjob(b);
    if (v.err) return send(res, v.code, { error: v.err });
    const { id, job } = v;
    if (job.url) return send(res, 200, { status: 'done', duration: job.duration || null });
    if (job.prov === 'openrouter') return orVideoStatus(res, id, job);
    let r, j;
    try { r = await fetchImpl('https://api.x.ai/v1/videos/' + encodeURIComponent(job.rid), { headers: xaiHeaders() }); j = await r.json(); }
    catch (e) { return send(res, 200, { status: 'pending', note: 'Could not ask the video service; trying again.' }); }
    const st = j && j.status;
    if (r.ok && st === 'done' && j.video && A.okVideoUrl(j.video.url)) {
      job.url = j.video.url; job.duration = j.video.duration || null;
      await redis([['SET', 'ai:vjob:' + id, JSON.stringify(job), 'EX', '86400']]);
      return send(res, 200, { status: 'done', duration: job.duration });
    }
    if (st === 'failed' || (!r.ok && r.status !== 429 && r.status < 500)) {
      if (!job.retried) await redis([['SET', 'ai:retry:' + id, '1', 'EX', '86400'], ['DEL', 'ai:vjob:' + id]]);
      return send(res, 200, { status: 'failed', retry: !job.retried, msg: 'The video service could not make this video' + (j && j.error ? ' (' + (j.error.message || j.error) + ')' : '') + '.' });
    }
    return send(res, 200, { status: 'pending' });
  }
  async function vfile(req, res, q) {
    const v = await vjob(q);
    if (v.err) return send(res, v.code, { error: v.err });
    if (!v.job.url) return send(res, 409, { error: 'The video is not ready yet.' });
    let r;
    const auth = v.job.prov === 'openrouter' && /^https:\/\/openrouter\.ai\//.test(v.job.url) ? { headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY } } : undefined;
    try { r = await fetchImpl(v.job.url, auth); } catch (e) { return send(res, 502, { error: 'Could not fetch the video.' }); }
    if (!r.ok || !r.body) return send(res, 502, { error: 'The video link answered ' + r.status + ' (it may have run out).' });
    res.statusCode = 200;
    const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    res.setHeader('Content-Type', /^video\//.test(ct) ? ct : 'video/mp4');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="mes-ai-' + v.id + '.mp4"');
    if (r.body.getReader) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; res.write(Buffer.from(value)); } }
    else for await (const c of r.body) res.write(c);
    res.end();
  }

  async function image(res, rec, who, failed) {
    const im = A.IMAGES[rec.model || 'gpt'];
    if (im.prov === 'xai') return ximage(res, rec, im, failed);
    if (im.prov === 'openrouter') return orimage(res, rec, im, failed, false);
    let r, j;
    // with reference pictures: POST /v1/images/edits (JSON, images: [{image_url: data URL}], gpt-image-2 reads them at high fidelity)
    const edit = rec.refs && rec.refs.length;
    const body = { model: A.IMAGE.id, prompt: rec.prompt, size: rec.size, quality: rec.quality, n: 1,
      output_format: 'webp', output_compression: 88, moderation: 'auto', safety_identifier: who };
    if (edit) body.images = rec.refs.map((f) => ({ image_url: A.dataUrl(f) }));
    try {
      r = await fetchImpl('https://api.openai.com/v1/images/' + (edit ? 'edits' : 'generations'), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      j = await r.json();
    } catch (e) { return failed(res, 'Could not reach the picture service. Your payment is kept: press Try again.', false); }
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!r.ok || !b64) {
      const code = j && j.error && j.error.code;
      const msg = code === 'moderation_blocked' ? 'The picture service refused this description (its safety rules). Change the words and press Try again.'
        : 'The picture service answered ' + r.status + '.' + (j && j.error && j.error.message ? ' ' + j.error.message : '') + ' Your payment is kept: press Try again.';
      return failed(res, msg, false);
    }
    return send(res, 200, { t: 'image', b64, mime: 'image/webp' });
  }

  // xAI Grok Imagine pictures: POST /v1/images/generations {model, prompt, n, response_format, aspect_ratio, resolution};
  // with reference pictures POST /v1/images/edits with image: {url} (one) or images: [{url}] (several, <IMAGE_0>... in the prompt)
  async function ximage(res, rec, im, failed) {
    let r, j;
    const refs = rec.refs || [];
    const body = { model: im.id, prompt: A.xaiPrompt(rec.prompt, refs.length), n: 1, response_format: 'b64_json',
      aspect_ratio: A.XIMAGE.ASPECT[rec.size], resolution: rec.quality };
    if (refs.length === 1) body.image = { url: A.dataUrl(refs[0]) };
    else if (refs.length > 1) body.images = refs.map((f) => ({ url: A.dataUrl(f) }));
    try {
      r = await fetchImpl('https://api.x.ai/v1/images/' + (refs.length ? 'edits' : 'generations'), {
        method: 'POST', headers: xaiHeaders(),
        body: JSON.stringify(body),
      });
      j = await r.json();
    } catch (e) { return failed(res, 'Could not reach the picture service. Your payment is kept: press Try again.', false); }
    const d = j && j.data && j.data[0];
    if (!r.ok || !d || !d.b64_json) {
      const em = j && j.error ? (j.error.message || j.error) : '';
      return failed(res, 'The picture service answered ' + r.status + '.' + (em ? ' ' + em : '') + ' Your payment is kept: press Try again.', false);
    }
    const mime = /^image\/(png|jpeg|webp)$/.test(d.mime_type || '') ? d.mime_type : 'image/jpeg';
    return send(res, 200, { t: 'image', b64: String(d.b64_json).replace(/^data:[^,]*,/, ''), mime });
  }

  /* ---------- OpenRouter pictures (POST /api/v1/images) and videos (POST /api/v1/videos), 2026-11-23 ----------
     Pictures: a fixed price per picture (A.IMAGES[..].res), pinned to one provider (provider.only, no fallbacks) so the bill is what was quoted.
     free = the free daily picture: the model's freeId copy (0 USD). Videos: a job like xAI's; the finished file is fetched with our key. */
  const orHeaders = () => ({ Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://mes.fm/ai', 'X-Title': 'MES AI' });
  async function orimage(res, rec, im, failed, free) {
    let r, j;
    const refs = rec.refs || [];
    const body = { model: free ? im.freeId : im.id, prompt: rec.prompt, n: 1, aspect_ratio: A.XIMAGE.ASPECT[rec.size], response_format: 'b64_json' };
    if (Object.keys(im.res).length > 1) body.resolution = String(rec.quality).toUpperCase();
    if (refs.length) body.input_references = refs.map((f) => ({ type: 'image_url', image_url: { url: A.dataUrl(f) } }));
    if (!free && im.orProv) body.provider = { only: [im.orProv], allow_fallbacks: false, data_collection: 'deny' };
    try {
      r = await fetchImpl('https://openrouter.ai/api/v1/images', { method: 'POST', headers: orHeaders(), body: JSON.stringify(body) });
      j = await r.json();
    } catch (e) { return failed(res, 'Could not reach the picture service. Your payment is kept: press Try again.', false); }
    const d = j && j.data && j.data[0];
    if (!r.ok || !d || !d.b64_json) {
      const em = j && j.error ? (j.error.message || j.error) : '';
      return failed(res, 'The picture service answered ' + r.status + '.' + (em ? ' ' + em : '') + ' Your payment is kept: press Try again.', false);
    }
    const mime = /^image\/(png|jpeg|webp)$/.test(d.media_type || '') ? d.media_type : 'image/png';
    return send(res, 200, { t: 'image', b64: String(d.b64_json).replace(/^data:[^,]*,/, ''), mime });
  }
  async function orVideoStart(res, rec, id, isRetry, failed, m) {
    let r, j;
    const body = { model: m.id, duration: rec.seconds, resolution: rec.res, aspect_ratio: '16:9', generate_audio: !!rec.audio };
    if (rec.prompt) body.prompt = rec.prompt;
    if (rec.refs && rec.refs.length) body.frame_images = [{ type: 'image_url', image_url: { url: A.dataUrl(rec.refs[0]) }, frame_type: 'first_frame' }];
    if (m.orProv) body.provider = { only: [m.orProv] };
    try {
      r = await fetchImpl('https://openrouter.ai/api/v1/videos', { method: 'POST', headers: orHeaders(), body: JSON.stringify(body) });
      j = await r.json();
    } catch (e) { return failed(res, 'Could not reach the video service. Your payment is kept: press Try again.', false); }
    if (!r.ok || !j || !j.id) {
      return failed(res, 'The video service answered ' + r.status + '.' + (j && j.error ? ' ' + (j.error.message || j.error) : '') + ' Your payment is kept: press Try again.', false);
    }
    await redis([['SET', 'ai:vjob:' + id, JSON.stringify({ prov: 'openrouter', rid: String(j.id), acct: rec.acct, retried: isRetry, at: now() }), 'EX', '86400']]);
    return send(res, 200, { t: 'video', job: id });
  }
  async function orVideoStatus(res, id, job) {
    let r, j;
    try { r = await fetchImpl('https://openrouter.ai/api/v1/videos/' + encodeURIComponent(job.rid), { headers: orHeaders() }); j = await r.json(); }
    catch (e) { return send(res, 200, { status: 'pending', note: 'Could not ask the video service; trying again.' }); }
    const st = j && j.status;
    const url = j && ((Array.isArray(j.unsigned_urls) && j.unsigned_urls[0]) || (Array.isArray(j.urls) && j.urls[0]));
    if (r.ok && st === 'completed' && A.okVideoUrl(url)) {
      job.url = url; job.duration = null;
      await redis([['SET', 'ai:vjob:' + id, JSON.stringify(job), 'EX', '86400']]);
      return send(res, 200, { status: 'done', duration: null });
    }
    if (st === 'failed' || st === 'cancelled' || st === 'expired' || (!r.ok && r.status !== 429 && r.status < 500)) {
      if (!job.retried) await redis([['SET', 'ai:retry:' + id, '1', 'EX', '86400'], ['DEL', 'ai:vjob:' + id]]);
      return send(res, 200, { status: 'failed', retry: !job.retried, msg: 'The video service could not make this video' + (j && j.error ? ' (' + (j.error.message || j.error) + ')' : '') + '.' });
    }
    return send(res, 200, { status: 'pending' });
  }

  /* free daily pictures (A.FREE.pics): the same once-a-day Keychain signature as the free messages; OpenRouter's free copy of Recraft
     costs us nothing, so only the per-account / per-network counts limit them. AI_FREE_PICS=0 in Vercel switches them off. */
  const picsOn = () => !!env.OPENROUTER_API_KEY && String(env.AI_FREE_PICS || '') !== '0';
  async function picsLeft(acct, day) {
    const [n] = await redis([['GET', 'ai:fpic:' + day + ':' + acct]]);
    return Math.max(0, A.FREE.pics - (Number(n) || 0));
  }
  async function freepic(req, res, b) {
    if (!picsOn()) return send(res, 503, { off: true, error: 'Free pictures are not switched on yet.' });
    const acct = String(b.acct || '').trim().replace(/^@/, '').toLowerCase();
    if (!A.validName(acct)) return send(res, 400, { error: 'Log in with your Hive account first.' });
    const today = A.utcDay(now()), day = String(b.day || '');
    if (day !== today) return send(res, 400, { error: 'resign', resign: true });
    if (typeof b.sig !== 'string' || !/^[0-9a-f]{130}$/i.test(b.sig)) return send(res, 400, { error: 'resign', resign: true });
    const model = A.FREE.picModel;
    if (!A.freePicOk(b.model, b.quality, (b.refs || []).length)) return send(res, 400, { error: 'Free pictures use ' + A.IMAGES[model].name.replace(/ \(.*\)$/, '') + ' at 1k, without pictures added.' });
    const err = A.checkImage(b.prompt, b.quality, b.size, model);
    if (err) return send(res, 400, { error: err });
    let ok;
    try { ok = await signedBy(acct, day, b.sig.toLowerCase()); } catch (e) { return send(res, 502, { error: 'The Hive nodes did not answer. Try again in a moment.' }); }
    if (!ok) return send(res, 403, { error: 'resign', resign: true });
    const iph = sha(ipOf(req) + salt).slice(0, 24);
    const ka = 'ai:fpic:' + day + ':' + acct, ki = 'ai:fpicip:' + day + ':' + iph;
    const [na, , ni] = await redis([['INCR', ka], ['EXPIRE', ka, '90000'], ['INCR', ki], ['EXPIRE', ki, '90000']]);
    const undo = () => redis([['DECR', ka], ['DECR', ki]]).catch(() => {});
    if (Number(na) > A.FREE.pics) { await undo(); return send(res, 429, { left: 0, error: 'You have used today\'s free pictures. They come back at 00:00 UTC; paid pictures work now.' }); }
    if (Number(ni) > A.FREE.picsIp) { await undo(); return send(res, 429, { error: 'Too many free pictures from this network today. Paid pictures work now.' }); }
    const gave = async (res2, msg) => { await undo(); send(res2, 502, { t: 'error', msg: msg.replace(/ Your payment is kept: press Try again\./, ' Your free picture was not used: try again.'), retry: false, free: true }); };
    res.setHeader('X-Free-Left', String(Math.max(0, A.FREE.pics - Number(na))));
    return orimage(res, { prompt: b.prompt, quality: b.quality, size: b.size, refs: [] }, A.IMAGES[model], gave, true);
  }

  return async function handler(req, res) {
    try {
      // the MES AI iPhone / Android app (Capacitor: capacitor://localhost on iOS, https://localhost on Android) may use the
      // status / free-message / free-picture calls only: paid ops stay website-only (store rules on paying with crypto)
      const aorigin = String((req.headers && req.headers.origin) || '');
      const fromApp = APP_ORIGINS.test(aorigin);
      if (fromApp) {
        res.setHeader('Access-Control-Allow-Origin', aorigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Expose-Headers', 'X-Free-Left');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      if (req.method === 'OPTIONS') { res.statusCode = fromApp ? 204 : 405; return res.end(); }
      if (req.method === 'GET') {
        const qs = req.query && Object.keys(req.query).length ? req.query : Object.fromEntries(new URL(req.url, 'https://mes.fm').searchParams);
        const op = qs.op;
        if (op === 'vfile') return await vfile(req, res, qs);
        if (op === 'free') {
          const acct = String(qs.acct || '').replace(/^@/, '').toLowerCase();
          if (!A.validName(acct)) return send(res, 400, { error: 'Bad account.' });
          const dd = A.utcDay(now());
          return send(res, 200, { on: freeOn(), perDay: A.FREE.perDay, left: freeOn() ? await freeLeft(acct, dd) : 0, day: dd,
            pics: { on: picsOn(), perDay: A.FREE.pics, left: picsOn() ? await picsLeft(acct, dd) : 0 } });
        }
        if (op !== 'status') return send(res, 400, { error: 'Unknown op' });
        return send(res, 200, {
          chat: !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.OPENROUTER_API_KEY), image: !!(env.OPENAI_API_KEY || env.XAI_API_KEY || env.OPENROUTER_API_KEY), video: !!(env.XAI_API_KEY || env.OPENROUTER_API_KEY),
          prov: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, xai: !!env.XAI_API_KEY, openrouter: !!env.OPENROUTER_API_KEY },
          free: { on: freeOn(), perDay: A.FREE.perDay, pics: picsOn(), picsPerDay: A.FREE.pics },
          margin: A.MARGIN, checked: A.PRICES_CHECKED,
          models: Object.keys(A.MODELS).filter((k) => A.MODELS[k].prov !== 'local').map((k) => ({ key: k, prov: A.MODELS[k].prov, id: A.MODELS[k].id, name: A.MODELS[k].name, inUsd: A.MODELS[k].inUsd, outUsd: A.MODELS[k].outUsd, caps: A.MODELS[k].caps })),
          imagePrices: { id: A.IMAGE.id, perImage: A.IMAGE.perImage },
        });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      const origin = req.headers && req.headers.origin;
      if (env.VERCEL_ENV === 'production' && origin && origin !== 'https://mes.fm' && !fromApp) return send(res, 403, { error: 'Bad origin' });
      let b;
      try { b = await readBody(req); } catch (e) { return send(res, 400, { error: 'Bad JSON' }); }
      if (fromApp && b.op !== 'free' && b.op !== 'freepic') return send(res, 403, { error: 'Paid models are on mes.fm/ai.' });
      if (b.op === 'quote') return await quote(req, res, b);
      if (b.op === 'run') return await run(req, res, b);
      if (b.op === 'vstatus') return await vstatus(req, res, b);
      if (b.op === 'free') return await free(req, res, b);
      if (b.op === 'freepic') return await freepic(req, res, b);
      return send(res, 400, { error: 'Unknown op' });
    } catch (e) {
      if (!res.headersSent) return send(res, 500, { error: 'Something went wrong on our side. Try again.' });
      try { res.end(); } catch (e2) {}
    }
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
module.exports.hiveVerify = hiveVerify;
