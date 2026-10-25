// Short links for mes.fm/reminder (MES Event Reminder).
//
// A reminder link holds the whole event in its query string, which is too long for a video description. This stores the
// same fields under a short id, so the link is mes.fm/r/<id> (vercel.json rewrites /r/:id to /reminder?r=:id; the page
// reads the id from either form and calls GET here).
// Same Upstash Redis as api/share.js and api/fav.js (UPSTASH_REDIS_REST_URL / _TOKEN).
//
// POST {title, t, tz, u?, d?, r?, len?}  -> { id }       (the same event always gets the same id)
// GET  ?id=<id>                          -> { title, t, tz, u, d, r, len }
// Only these fields are accepted, each checked strictly: title <= 120 chars (control characters removed), t = wall time
// "2026-10-28T10:00" with a real IANA zone (or an absolute time ending in Z / +hh:mm), u = an http(s) address or a mes.fm path
// ("/page"), d <= 600 chars, r = "" or "weekly", len = 5-1440 minutes. 30 new links per IP per hour.
// Kept for one year after the event; weekly events for two years, renewed whenever the link is opened.
const crypto = require('crypto');

const YEAR = 31536000;
const PER_HOUR = 30;
const ID_RE = /^[a-z0-9]{7}$/;
const PATH_RE = /^\/(?!\/)[A-Za-z0-9\-_.~%\/]{0,150}$/;
const FIELDS = ['title', 't', 'tz', 'u', 'd', 'r', 'len'];

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

function validZone(tz) {
  if (tz === 'UTC') return true;
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){1,2}$/.test(tz)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}
// wall time in tz -> UTC ms (only needs to be close: used for the expiry and the date range check)
function wallMs(m, tz) {
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  try {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).forEach((x) => { p[x.type] = x.value; });
    const asIf = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    return guess - (asIf - guess);
  } catch (e) { return guess; }
}
function safeLink(u) {
  if (PATH_RE.test(u) && !u.includes('..')) return u;
  if (u.length > 600 || /[\s<>"\u0000-\u001f]/.test(u)) return null;
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol) || x.username || x.password || x.hostname.indexOf('.') <= 0) return null;
    return x.href;
  } catch (e) { return null; }
}
// the event, cleaned, plus its start time; null if anything is wrong or anything extra was sent
function cleanEvent(b, now) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  for (const k of Object.keys(b)) if (!FIELDS.includes(k)) return null;
  for (const k of ['title', 't', 'tz', 'u', 'd', 'r']) if (b[k] !== undefined && typeof b[k] !== 'string') return null;
  const title = (b.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (title.length > 120) return null;
  const t = (b.t || '').trim(), tz = (b.tz || '').trim() || 'UTC';
  let ms;
  const wall = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t);
  if (wall) {
    if (+wall[2] < 1 || +wall[2] > 12 || +wall[3] < 1 || +wall[3] > 31 || +wall[4] > 23 || +wall[5] > 59) return null;
    if (tz.length > 60 || !validZone(tz)) return null;
    ms = wallMs(wall, tz);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(t)) {
    ms = Date.parse(t);
    if (isNaN(ms) || (b.tz && !validZone(tz))) return null;
  } else return null;
  if (ms < now - YEAR * 1000 || ms > now + 5 * YEAR * 1000) return null;
  let u = '';
  if (b.u) { u = safeLink(b.u.trim()); if (!u) return null; }
  const d = (b.d || '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  if (d.length > 600) return null;
  if (b.r && b.r !== 'weekly') return null;
  let len = 60;
  if (b.len !== undefined && b.len !== '') {
    len = Number(b.len);
    if (!Number.isInteger(len) || len < 5 || len > 1440) return null;
  }
  return { ev: { title: title || 'Reminder', t, tz, u, d, r: b.r || '', len }, ms };
}
function ttlFor(ev, ms, now) { return ev.r === 'weekly' ? 2 * YEAR : Math.max(86400, Math.ceil((ms - now) / 1000) + YEAR); }
// id from the event's own contents, so the same event gives the same short link (base 36 of the hash)
function hashId(json, salt) {
  const h = sha(json + (salt || ''));
  let n = BigInt('0x' + h.slice(0, 15)), s = '';
  for (let i = 0; i < 7; i++) { s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Number(n % 36n)]; n /= 36n; }
  return s;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  try {
    if (req.method === 'GET') {
      const id = String((req.query && req.query.id) || '');
      if (!ID_RE.test(id)) { res.status(404).json({ error: 'not found' }); return; }
      const [row] = await redis([['GET', `rml:${id}`]]);
      if (!row || !row.result) { res.status(404).json({ error: 'not found' }); return; }
      const ev = JSON.parse(row.result);
      if (ev.r === 'weekly') await redis([['EXPIRE', `rml:${id}`, 2 * YEAR]]);
      else res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');    // a one-off link never changes
      res.status(200).json(ev);
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    let body = req.body;
    if (typeof body === 'string') { if (body.length > 4000) body = null; else { try { body = JSON.parse(body); } catch (e) { body = null; } } }
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 4000) { res.status(400).json({ error: 'bad request' }); return; }
    const now = Date.now(), c = cleanEvent(body, now);
    if (!c) { res.status(400).json({ error: 'bad event' }); return; }
    const hour = Math.floor(now / 3600000), rl = `rml:rl:${sha(clientIp(req)).slice(0, 16)}:${hour}`;
    const [cnt] = await redis([['INCR', rl], ['EXPIRE', rl, 4000]]);
    if (cnt && cnt.result > PER_HOUR) { res.status(429).json({ error: 'too many requests, try again later' }); return; }
    const json = JSON.stringify(c.ev), ttl = ttlFor(c.ev, c.ms, now);
    for (let tries = 0; tries < 4; tries++) {
      const id = hashId(json, tries ? String(tries) : '');
      const out = await redis([['SET', `rml:${id}`, json, 'EX', ttl, 'NX'], ['GET', `rml:${id}`]]);
      if (out && out[0] && out[0].result === 'OK') { res.status(200).json({ id }); return; }
      if (out && out[1] && out[1].result === json) {     // the same event was saved before: same id, keep it at least as long as now asked
        await redis([['EXPIRE', `rml:${id}`, ttl, 'GT']]);
        res.status(200).json({ id }); return;
      }
      // a different event already has this id (hash clash): try the next one
    }
    res.status(502).json({ error: 'could not save' });
  } catch (e) {
    res.status(500).json({ error: 'error' });
  }
};
module.exports.cleanEvent = cleanEvent;
module.exports.hashId = hashId;
