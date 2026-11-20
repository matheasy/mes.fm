// MES AI (mes.fm/ai): AI chat and pictures, paid per prompt in HBD on Hive. No balance, no account here.
//
// Flow (the page: tool_apps_src/ai/app.js; shared rules + prices: _ai-lib.js = tool_apps_src/ai/lib.js, byte-identical):
//   GET  ?op=status                 -> {chat, image, margin, checked, models, image prices}   (chat/image false = key not set yet)
//   POST {op:"quote", acct, kind:"chat", model, len, messages}  or  {op:"quote", acct, kind:"image", prompt, quality, size}
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
// Keys: Vercel env ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY (plain project-level vars), never sent out.
// Limits per hour: 300 quotes per IP hash, 60 answers per Hive account, 100 per IP hash. Tests: node tool_apps_src/ai-tests.js

const crypto = require('crypto');
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
  for await (const c of req) { s += c; if (s.length > 1.2e6) throw new Error('too big'); }
  return s ? JSON.parse(s) : {};
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

  const keyOf = (prov) => (prov === 'openai' ? env.OPENAI_API_KEY : prov === 'xai' ? env.XAI_API_KEY : env.ANTHROPIC_API_KEY);

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
      if (!env.XAI_API_KEY) return send(res, 503, { off: true, error: 'Videos are coming soon.' });
      const err = A.checkVideo(b.prompt, b.model, b.seconds, b.res);
      if (err) return send(res, 400, { error: err });
      q = A.videoQuote(b.model, b.seconds, b.res);
      stored = { kind: 'video', prompt: b.prompt, model: b.model, seconds: q.seconds, res: b.res, audio: b.audio !== false };
    } else if (b.kind === 'image') {
      const model = b.model || 'gpt';
      const im = A.IMAGES[model];
      if (!im) return send(res, 400, { error: 'Pick a picture model.' });
      if (!keyOf(im.prov)) return send(res, 503, { off: true, error: im.name + ' pictures are coming soon.' });
      const err = A.checkImage(b.prompt, b.quality, b.size, model);
      if (err) return send(res, 400, { error: err });
      // prompt tokens estimated on the safe side (2 characters a token); a few cents of a cent at most
      q = A.imageQuote(b.quality, b.size, Math.ceil(b.prompt.length / 2) + 8, model);
      stored = { kind: 'image', model, prompt: b.prompt, quality: b.quality, size: b.size };
    } else {
      const m = A.MODELS[b.model];
      if (!m) return send(res, 400, { error: 'Pick a model.' });
      if (!keyOf(m.prov)) return send(res, 503, { off: true, error: m.name + ' is coming soon.' });
      if (!m.caps[b.len]) return send(res, 400, { error: 'Pick an answer length.' });
      const err = A.checkMessages(b.messages);
      if (err) return send(res, 400, { error: err });
      const messages = A.cleanMessages(b.messages);
      const lang = A.cleanLang(b.lang);
      let inTok;
      try { inTok = m.prov === 'openai' ? await countOpenAI(b.model, messages, lang) : await countTokens(m.id, A.toAnthropic(messages), A.systemFor(b.model, lang)); } catch (e) { return send(res, 502, { error: 'Could not price this message right now. Try again in a moment.' }); }
      if (inTok > A.LIMITS.inTokens) return send(res, 400, { error: 'This chat is too long (' + inTok.toLocaleString('en-US') + ' tokens). Start a new chat.' });
      q = A.chatQuote(b.model, inTok, b.len);
      stored = { kind: 'chat', model: b.model, len: b.len, lang, messages };
    }
    const id = A.newId((n) => crypto.randomBytes(n));
    const rec = Object.assign(stored, { acct, price: q.price, maxOut: q.maxOut || 0, created: now() });
    await saveRec(id, rec);
    return send(res, 200, { id, memo: A.memoFor(id), to: A.PAY_TO, price: q.price, usd: q.costUsd * A.MARGIN, inTokens: q.inTokens, maxOut: q.maxOut || 0, kind: q.kind });
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

  async function chat(res, rec, who, failed) {
    const m = A.MODELS[rec.model];
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

  // passes a provider's server-sent events on to the page as NDJSON pieces
  async function pump(res, r, piece, failed) {
    if (!r.ok) {
      let msg = 'The AI service answered ' + r.status + '.';
      try { const j = await r.json(); if (j.error && j.error.message) msg += ' ' + j.error.message; } catch (e) {}
      return failed(res, msg + ' Your payment is kept: press Try again.', false);
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
      return failed(res, err + ' Your payment is kept: press Try again.', true);
    }
    res.write(JSON.stringify({ t: 'done', stop, out: usage && usage.output_tokens }) + '\n');
    res.end();
  }

  /* ---------- Grok Imagine video: a job that takes minutes. run starts it; the page then asks "vstatus" every few seconds and
     fetches the finished file through "vfile" (xAI's link is temporary and may not allow other sites to read it). ---------- */
  const xaiHeaders = () => ({ Authorization: 'Bearer ' + env.XAI_API_KEY, 'Content-Type': 'application/json' });
  async function videoStart(res, rec, id, isRetry, failed) {
    const m = A.VIDEO.models[rec.model];
    let r, j;
    try {
      r = await fetchImpl('https://api.x.ai/v1/videos/generations', {
        method: 'POST', headers: xaiHeaders(),
        body: JSON.stringify({ model: m.id, prompt: rec.prompt, duration: rec.seconds, resolution: rec.res, generate_audio: !!rec.audio }),
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
    try { r = await fetchImpl(v.job.url); } catch (e) { return send(res, 502, { error: 'Could not fetch the video.' }); }
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
    let r, j;
    try {
      r = await fetchImpl('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: A.IMAGE.id, prompt: rec.prompt, size: rec.size, quality: rec.quality, n: 1,
          output_format: 'webp', output_compression: 88, moderation: 'auto', safety_identifier: who }),
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

  // xAI Grok Imagine pictures: POST /v1/images/generations {model, prompt, n, response_format, aspect_ratio, resolution}
  async function ximage(res, rec, im, failed) {
    let r, j;
    try {
      r = await fetchImpl('https://api.x.ai/v1/images/generations', {
        method: 'POST', headers: xaiHeaders(),
        body: JSON.stringify({ model: im.id, prompt: rec.prompt, n: 1, response_format: 'b64_json',
          aspect_ratio: A.XIMAGE.ASPECT[rec.size], resolution: rec.quality }),
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

  return async function handler(req, res) {
    try {
      if (req.method === 'GET') {
        const qs = req.query && Object.keys(req.query).length ? req.query : Object.fromEntries(new URL(req.url, 'https://mes.fm').searchParams);
        const op = qs.op;
        if (op === 'vfile') return await vfile(req, res, qs);
        if (op !== 'status') return send(res, 400, { error: 'Unknown op' });
        return send(res, 200, {
          chat: !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY), image: !!(env.OPENAI_API_KEY || env.XAI_API_KEY), video: !!env.XAI_API_KEY,
          prov: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, xai: !!env.XAI_API_KEY },
          margin: A.MARGIN, checked: A.PRICES_CHECKED,
          models: Object.keys(A.MODELS).map((k) => ({ key: k, prov: A.MODELS[k].prov, id: A.MODELS[k].id, name: A.MODELS[k].name, inUsd: A.MODELS[k].inUsd, outUsd: A.MODELS[k].outUsd, caps: A.MODELS[k].caps })),
          imagePrices: { id: A.IMAGE.id, perImage: A.IMAGE.perImage },
        });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      const origin = req.headers && req.headers.origin;
      if (env.VERCEL_ENV === 'production' && origin && origin !== 'https://mes.fm') return send(res, 403, { error: 'Bad origin' });
      let b;
      try { b = await readBody(req); } catch (e) { return send(res, 400, { error: 'Bad JSON' }); }
      if (b.op === 'quote') return await quote(req, res, b);
      if (b.op === 'run') return await run(req, res, b);
      if (b.op === 'vstatus') return await vstatus(req, res, b);
      return send(res, 400, { error: 'Unknown op' });
    } catch (e) {
      if (!res.headersSent) return send(res, 500, { error: 'Something went wrong on our side. Try again.' });
      try { res.end(); } catch (e2) {}
    }
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
