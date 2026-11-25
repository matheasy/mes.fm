// MES Galleries server glue: wires MESGal.handle (api/_galleries-lib.js) to Upstash Redis, Cloudflare R2 (presigned URLs) and Resend.
// Env (plain project-level Vercel vars):
//   UPSTASH_REDIS_REST_URL / _TOKEN (already set for the other tools)
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET   (Cloudflare R2 API token with Object Read & Write on that bucket)
//   RESEND_API_KEY, GALLERY_FROM  (e.g. "Alpine West Creative <galleries@alpinewestcreative.com>", a domain verified in Resend)
// Without R2 / Resend the functions answer {setup:false, missing:[...]} and the page explains what to set.
const crypto = require('crypto');
const G = require('./_galleries-lib.js');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();

function missing() {
  const need = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'RESEND_API_KEY', 'GALLERY_FROM'];
  return need.filter((k) => !process.env[k]);
}

async function redis(cmds) {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  const j = await r.json();
  return j.map((x) => x.result);
}
const db = {
  async get(k) { const [v] = await redis([['GET', k]]); return v == null ? null : JSON.parse(v); },
  async set(k, v, ttl) { await redis([ttl ? ['SET', k, JSON.stringify(v), 'EX', ttl] : ['SET', k, JSON.stringify(v)]]); },
  async del(k) { await redis([['DEL', k]]); },
  async incr(k, ttl) { const [n] = await redis([['INCR', k], ['EXPIRE', k, ttl || 3600, 'NX']]); return n; },
  async sadd(k, m) { await redis([['SADD', k, m]]); },
  async srem(k, m) { await redis([['SREM', k, m]]); },
  async smembers(k) { const [v] = await redis([['SMEMBERS', k]]); return v || []; },
};

/** AWS SigV4 query-string presign for R2 (region "auto", service "s3") */
function presign(method, path, expires, now) {
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const d = new Date(now || Date.now());
  const amz = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amz.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const key = `/${process.env.R2_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${process.env.R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amz, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host',
  };
  const qs = Object.keys(q).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`).join('&');
  const canon = [method, key, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n');
  let k = hmac('AWS4' + process.env.R2_SECRET_ACCESS_KEY, day);
  k = hmac(k, 'auto'); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
  return `https://${host}${key}?${qs}&X-Amz-Signature=${crypto.createHmac('sha256', k).update(sts).digest('hex')}`;
}
const blob = {
  async putUrl(p) { return presign('PUT', p, 3600 * 6); },
  async getUrl(p) { return presign('GET', p, 3600 * 3); },
  async del(p) { try { await fetch(presign('DELETE', p, 300), { method: 'DELETE' }); } catch (e) { /* best effort */ } },
};
const mail = {
  async send(m) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.GALLERY_FROM, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
    return { ok: r.ok };
  },
};

function makeHandler(owner) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (req.method === 'GET') { const m = missing(); return res.status(200).json({ setup: !m.length, missing: m }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const m = missing();
    if (m.length) return res.status(503).json({ ok: false, setup: false, missing: m, error: 'MES Galleries is not switched on yet.' });
    let b = req.body;
    if (typeof b === 'string') { if (b.length > 300000) return res.status(413).json({ error: 'too big' }); try { b = JSON.parse(b); } catch (e) { return res.status(400).json({ error: 'bad JSON' }); } }
    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'mes.fm');
    const base = /^(www\.)?(mes\.fm|alpinewestcreative\.com)$/.test(host) ? `https://${host}` : 'https://mes.fm';
    try {
      const out = await G.handle(b || {}, {
        db, blob, mail, owner, ip, base, sha, now: () => Date.now(), rand: (n) => crypto.randomBytes(n).toString('hex'),
      });
      return res.status(out.ok ? 200 : out.status || 400).json(out);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Something went wrong. Try again.' });
    }
  };
}
module.exports = { makeHandler, presign, missing };
