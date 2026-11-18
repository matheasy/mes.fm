// MES Stream Chat: relay for the "show this message on screen" click (mes.fm/stream-chat, /stream-chat/dock -> /stream-chat/overlay).
//
// The dock and the overlay used to talk only through BroadcastChannel / localStorage, which works only when both run in the
// same browser (OBS). With a pairing code they can be anywhere: the page / dock POSTs the featured message here, the overlay
// (?room=<code>) asks for it every ~1.5 s. Same Upstash Redis as api/fav.js.
//
// POST {room, m}        -> {ok, at}    (m = one chat message, or null to take it off screen)
// GET  ?room=<code>     -> {m, at}     (m null when nothing is on screen)
// The room code is a random 10-character string made by the browser; messages are cut down to the fields the overlay draws
// (text and image links only: image links are checked again by the overlay), kept 6 hours. 600 writes per IP per hour.
const crypto = require('crypto');

const TTL = 21600;
const PER_HOUR = 600;
const ROOM_RE = /^[a-z0-9]{10}$/;
const PFS = ['yt', 'tw', 'od', 'rm', 'ts'];

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : undefined);

function cleanMsg(m) {
  if (m === null) return null;
  if (!m || typeof m !== 'object' || PFS.indexOf(m.p) < 0) return undefined;
  const o = { id: str(m.id, 120) || 'x', p: m.p };
  ['kind', 'amount', 'color'].forEach((k) => { const v = str(m[k], 40); if (v) o[k] = v; });
  const name = str(m.name, 80); if (name) o.name = name;
  const note = str(m.note, 300); if (note) o.note = note;
  const av = str(m.avatar, 400); if (av && /^https:\/\//.test(av)) o.avatar = av;
  ['owner', 'mod', 'member'].forEach((k) => { if (m[k]) o[k] = true; });
  if (typeof m.ts === 'number' && isFinite(m.ts)) o.ts = m.ts;
  if (Array.isArray(m.parts)) {
    o.parts = [];
    let total = 0;
    for (const x of m.parts.slice(0, 120)) {
      if (!x || typeof x !== 'object') continue;
      const part = {};
      const t = str(x.t, 600); if (t != null) { part.t = t; total += t.length; }
      const img = str(x.img, 400); if (img && /^https:\/\//.test(img)) part.img = img;
      const alt = str(x.alt, 60); if (alt) part.alt = alt;
      if (Object.keys(part).length) o.parts.push(part);
      if (total > 1500) break;
    }
  }
  return o;
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
      const room = String((req.query && req.query.room) || '');
      if (!ROOM_RE.test(room)) { res.status(400).json({ error: 'bad room' }); return; }
      const r = await redis([['GET', 'scf:' + room]]);
      const v = r && r[0] && r[0].result;
      res.status(200).json(v ? JSON.parse(v) : { m: null, at: 0 });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
    let b = req.body;
    if (typeof b === 'string') { if (b.length > 20000) { res.status(413).json({ error: 'too big' }); return; } try { b = JSON.parse(b); } catch (e) { b = null; } }
    if (!b || !ROOM_RE.test(String(b.room || ''))) { res.status(400).json({ error: 'bad room' }); return; }
    const m = cleanMsg(b.m);
    if (m === undefined) { res.status(400).json({ error: 'bad message' }); return; }
    const ipKey = 'scf:ip:' + crypto.createHash('sha256').update('scf|' + clientIp(req)).digest('hex').slice(0, 24) + ':' + Math.floor(Date.now() / 3600000);
    const lim = await redis([['INCR', ipKey], ['EXPIRE', ipKey, 3700]]);
    if (lim && lim[0] && lim[0].result > PER_HOUR) { res.status(429).json({ error: 'slow down' }); return; }
    const at = Date.now();
    await redis([['SET', 'scf:' + b.room, JSON.stringify({ m, at }), 'EX', TTL]]);
    res.status(200).json({ ok: true, at });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
};
module.exports.cleanMsg = cleanMsg;
