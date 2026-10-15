// Short links for mes.fm/fav (MES Favourites).
//
// A person's favourites (group names + mes.fm page paths, nothing else) can be saved here under a short id, so the link to
// move them to another browser is mes.fm/f/<id> instead of a very long address. The page keeps a private edit key in the
// browser's localStorage; only the SHA-256 of it is stored, and it is needed to update or delete the list.
// Same Upstash Redis as api/share.js (UPSTASH_REDIS_REST_URL / _TOKEN).
//
// POST {g:[[name,[path,...]],...]}                -> { id, key }           (new list)
// POST {id, key, g:[...]}                         -> { id }                (update, key must match)
// POST {id, key, del:true}                        -> { ok:true }           (delete)
// GET  ?id=<id>  (mes.fm/f/<id> is rewritten to the page, which calls this) -> { g:[[name,[path,...]],...] }
// Only names (<= 60 chars, no control characters) and site-relative paths ("/page", never "//host") are accepted, so the store
// cannot be used to keep or redirect to arbitrary links. Limits: 40 groups, 400 pages, 24 KB, 30 writes per IP per hour; two-year expiry,
// renewed whenever the list is read or updated.
const crypto = require('crypto');

const TTL = 63072000;
const PER_HOUR = 30;
const ID_RE = /^[a-z0-9]{9}$/;
const KEY_RE = /^[a-f0-9]{32}$/;
const PATH_RE = /^\/(?!\/)[A-Za-z0-9\-_.~%\/]{0,150}$/;

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }

function cleanGroups(g) {
  if (!Array.isArray(g) || !g.length || g.length > 40) return null;
  let total = 0;
  const out = [];
  for (const row of g) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !Array.isArray(row[1])) return null;
    const name = row[0].replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60) || 'Group';
    const seen = new Set(), items = [];
    for (const p of row[1]) {
      if (typeof p !== 'string' || !PATH_RE.test(p) || p.includes('..') || seen.has(p)) return null;
      seen.add(p); items.push(p); total++;
    }
    out.push([name, items]);
  }
  return total > 400 ? null : out;
}
function newId() { const a = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.randomBytes(9); let s = ''; for (let i = 0; i < 9; i++) s += a[b[i] % 36]; return s; }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      if (!ID_RE.test(id)) { res.status(404).json({ error: 'not found' }); return; }
      const [row] = await redis([['GET', `fav:${id}`], ['EXPIRE', `fav:${id}`, TTL]]);
      if (!row || !row.result) { res.status(404).json({ error: 'not found' }); return; }
      const d = JSON.parse(row.result);
      res.status(200).json({ g: d.g });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 24000) { res.status(400).json({ error: 'bad request' }); return; }
    const hour = Math.floor(Date.now() / 3600000), rl = `fav:rl:${sha(clientIp(req)).slice(0, 16)}:${hour}`;
    const [cnt] = await redis([['INCR', rl], ['EXPIRE', rl, 4000]]);
    if (cnt && cnt.result > PER_HOUR) { res.status(429).json({ error: 'too many requests, try again later' }); return; }

    if (body.id !== undefined) {
      if (!ID_RE.test(String(body.id)) || !KEY_RE.test(String(body.key || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
      const [row] = await redis([['GET', `fav:${body.id}`]]);
      const cur = row && row.result ? JSON.parse(row.result) : null;
      if (!cur || cur.h !== sha(body.key)) { res.status(403).json({ error: 'not allowed' }); return; }
      if (body.del) { await redis([['DEL', `fav:${body.id}`]]); res.status(200).json({ ok: true }); return; }
      const g = cleanGroups(body.g);
      if (!g) { res.status(400).json({ error: 'bad list' }); return; }
      const out = await redis([['SET', `fav:${body.id}`, JSON.stringify({ h: cur.h, g, u: Date.now() }), 'EX', TTL]]);
      if (!out || !out[0] || out[0].result !== 'OK') { res.status(502).json({ error: 'could not save' }); return; }
      res.status(200).json({ id: body.id });
      return;
    }
    const g = cleanGroups(body.g);
    if (!g) { res.status(400).json({ error: 'bad list' }); return; }
    const key = crypto.randomBytes(16).toString('hex');
    for (let tries = 0; tries < 3; tries++) {
      const id = newId();
      const out = await redis([['SET', `fav:${id}`, JSON.stringify({ h: sha(key), g, u: Date.now() }), 'EX', TTL, 'NX']]);
      if (out && out[0] && out[0].result === 'OK') { res.status(200).json({ id, key }); return; }
    }
    res.status(502).json({ error: 'could not save' });
  } catch (e) {
    res.status(500).json({ error: 'error' });
  }
};
