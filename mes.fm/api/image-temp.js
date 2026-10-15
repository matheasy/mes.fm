// Temporary picture host for mes.fm/reverse-image-search.
//
// Reverse image search sites can only open a picture on their own when they are given a link to it, so when a person presses
// Open the page uploads a resized JPEG here and hands every ticked site the link. Nothing is kept: each picture is stored as one
// Redis string with a one-hour expiry, under a random 128-bit id nobody can guess, and is only ever served as image/jpeg.
// Same Upstash Redis as api/share.js (UPSTASH_REDIS_REST_URL / _TOKEN).
//
// POST (body = the JPEG bytes, Content-Type application/octet-stream)  -> { id, url, expires }
// GET  ?id=<id>[.jpg]  (also /ri/<id>.jpg through a vercel.json rewrite) -> the JPEG, or 404 when it is gone
// Limits: 700,000 bytes per picture, 40 uploads per IP per hour. Only data starting with the JPEG signature is accepted.
const crypto = require('crypto');

const MAX_BYTES = 700000;
const TTL_SECONDS = 3600;
const PER_HOUR = 40;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}

function readBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body, 'binary'));
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BYTES + 1000) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isJpeg(b) { return b && b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; }

function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.setHeader('Cache-Control', 'no-store'); res.status(503).json({ error: 'not set up' }); return; }

  try {
    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      const buf = await readBody(req);
      if (!isJpeg(buf)) { res.status(415).json({ error: 'JPEG pictures only' }); return; }
      if (buf.length > MAX_BYTES) { res.status(413).json({ error: 'picture too large' }); return; }
      const hour = Math.floor(Date.now() / 3600000), rl = `ri:rl:${crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16)}:${hour}`;
      const [cnt] = await redis([['INCR', rl], ['EXPIRE', rl, 4000]]);
      if (cnt && cnt.result > PER_HOUR) { res.status(429).json({ error: 'too many uploads, try again later' }); return; }
      const id = crypto.randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const out = await redis([['SET', `ri:${id}`, buf.toString('base64'), 'EX', TTL_SECONDS]]);
      if (!out || !out[0] || out[0].result !== 'OK') { res.status(502).json({ error: 'could not store the picture' }); return; }
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'mes.fm').split(',')[0].trim();
      res.status(200).json({ id, url: `https://${host.replace(/^www\./, '') === 'mes.fm' ? 'mes.fm' : host}/ri/${id}.jpg`, expires: TTL_SECONDS });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).json({ error: 'method not allowed' }); return; }
    const id = String(req.query.id || '').replace(/\.jpe?g$/i, '');
    if (!ID_RE.test(id)) { res.setHeader('Cache-Control', 'no-store'); res.status(404).end('Not found'); return; }
    const [row] = await redis([['GET', `ri:${id}`]]);
    if (!row || !row.result) { res.setHeader('Cache-Control', 'no-store'); res.status(404).end('This picture has expired.'); return; }
    const img = Buffer.from(row.result, 'base64');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(img.length));
    res.setHeader('Cache-Control', 'public, max-age=3300');
    res.setHeader('X-Robots-Tag', 'noindex, noimageindex');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).end(req.method === 'HEAD' ? undefined : img);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'error' });
  }
};
