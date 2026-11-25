// MES Car Sandbox online rooms: WebRTC signalling only (mes.fm/car-sandbox, "Online with friends").
// Vercel functions can't hold a socket, so the two browsers swap their WebRTC offer / answer (each a whole SDP with every ICE
// candidate already in it: no trickle) through short mailboxes in Upstash Redis, polled about once a second while connecting.
// Once a data channel is open nothing passes through here any more: car positions, chat and laps go browser to browser.
// Same Upstash Redis as api/fav.js / api/c4.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
//
// GET  ?code=<code>                                 -> {host, name, room, age}   what a joiner is about to join (404 = no such room)
// POST {act:"new", peer, name, room}                -> {code}                    the host opens a room (room = {w, g, map?, wx?})
// POST {act:"send", code, from, to, kind, sdp?, name?} -> {ok}                    kind "offer" | "answer" | "bye"; joiners may only write to the host
// POST {act:"recv", code, peer}                     -> {msgs:[{from, kind, sdp, name, at}], alive}   empties the peer's mailbox
// POST {act:"room", code, peer, room}               -> {ok}                      the host changed the world / gravity
// POST {act:"close", code, peer}                    -> {ok}                      the host closed the room
//
// Room codes: 6 letters / digits without look-alikes (no 0 o 1 i l). A room lives 3 hours after the host last asked for mail;
// a mailbox 10 minutes. Peer ids are random 12-character strings made by the browsers.
// Abuse limits: JSON only, <= 16 KB, Origin https://mes.fm in production, per salted IP hash per hour: 20 new rooms,
// 400 sends, 6,000 mailbox checks.
const crypto = require('crypto');

const ROOM_TTL = 3 * 3600;
const BOX_TTL = 600;
const LIM = { n: 20, s: 400, r: 6000 };
const CODE_RE = /^[a-hj-km-np-z2-9]{6}$/;
const PEER_RE = /^[A-Za-z0-9]{12}$/;
const WORLD_RE = /^(earth|moon|mars|ceres|jupiter)$/;
const MAP_RE = /^[A-Za-z0-9_-]{1,12000}$/;
const WX_RE = /^[a-z]{2,12}$/;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const salt = () => process.env.RATING_SALT || sha('mes-car-room|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function send(res, code, obj) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(obj); }
function newCode() { const b = crypto.randomBytes(6); let s = ''; for (let i = 0; i < 6; i++) s += ABC[b[i] % ABC.length]; return s; }
function name(v) {
  if (typeof v !== 'string') return 'Driver';
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/[​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s || 'Driver';
}
function cleanRoom(r) {
  if (!r || typeof r !== 'object' || !WORLD_RE.test(String(r.w))) return null;
  const g = +r.g;
  const o = { w: r.w, g: isFinite(g) && g >= 0 && g <= 300 ? g : null };
  if (typeof r.map === 'string' && MAP_RE.test(r.map)) o.map = r.map;
  if (typeof r.wx === 'string' && WX_RE.test(r.wx)) o.wx = r.wx;
  return o;
}
// an SDP is plain text lines starting with v=0; nothing else is stored
function cleanSdp(s) {
  if (typeof s !== 'string' || s.length < 20 || s.length > 12000 || !/^v=0\r?\n/.test(s)) return null;
  if (/[^\x20-\x7e\r\n]/.test(s)) return null;
  return s;
}
async function limit(ip, kind) {
  const k = `cr:rl:${kind}:${sha(salt() + ip).slice(0, 24)}`;
  const r = await redis([['INCR', k], ['EXPIRE', k, 3600, 'NX']]);
  return (r[0] && r[0].result) > LIM[kind];
}
async function loadRoom(code) {
  const r = await redis([['GET', `cr:r:${code}`]]);
  const v = r[0] && r[0].result;
  return v ? JSON.parse(v) : null;
}

async function handler(req, res) {
  const now = Date.now();
  const ip = clientIp(req);
  if (req.method === 'GET') {
    const code = String((req.query && req.query.code) || '');
    if (!CODE_RE.test(code)) return send(res, 400, { error: 'That is not a room code.' });
    if (await limit(ip, 'r')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
    const room = await loadRoom(code);
    if (!room) return send(res, 404, { error: 'No room with that code (rooms close 3 hours after the host leaves).' });
    return send(res, 200, { host: room.host, name: room.name, room: room.room, age: now - room.created });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only.' });
  const origin = req.headers.origin || '';
  if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(origin)) return send(res, 403, { error: 'Not allowed from here.' });
  if (!/application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only.' });
  let b = req.body;
  if (typeof b === 'string') { if (b.length > 16384) return send(res, 413, { error: 'Too big.' }); try { b = JSON.parse(b); } catch (e) { return send(res, 400, { error: 'Bad JSON.' }); } }
  if (!b || typeof b !== 'object') return send(res, 400, { error: 'Bad request.' });
  if (JSON.stringify(b).length > 16384) return send(res, 413, { error: 'Too big.' });

  if (b.act === 'new') {
    if (!PEER_RE.test(String(b.peer || ''))) return send(res, 400, { error: 'Bad peer id.' });
    const room = cleanRoom(b.room);
    if (!room) return send(res, 400, { error: 'Bad room settings.' });
    if (await limit(ip, 'n')) return send(res, 429, { error: 'Too many new rooms from your network: try again in an hour.' });
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      const rec = { host: b.peer, name: name(b.name), room, created: now };
      const r = await redis([['SET', `cr:r:${code}`, JSON.stringify(rec), 'EX', ROOM_TTL, 'NX']]);
      if (r[0] && r[0].result === 'OK') return send(res, 200, { code });
    }
    return send(res, 503, { error: 'Could not make a room code: try again.' });
  }

  const code = String(b.code || '');
  if (!CODE_RE.test(code)) return send(res, 400, { error: 'That is not a room code.' });

  if (b.act === 'recv') {
    const peer = String(b.peer || '');
    if (!PEER_RE.test(peer)) return send(res, 400, { error: 'Bad peer id.' });
    if (await limit(ip, 'r')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
    const box = `cr:m:${code}:${peer}`;
    const r = await redis([['LPOP', box, 30], ['GET', `cr:r:${code}`]]);
    const raw = r[0] && r[0].result;
    const room = r[1] && r[1].result ? JSON.parse(r[1].result) : null;
    if (room && room.host === peer) await redis([['EXPIRE', `cr:r:${code}`, ROOM_TTL]]);
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const msgs = [];
    for (const s of list) { try { msgs.push(JSON.parse(s)); } catch (e) { /* skip */ } }
    return send(res, 200, { msgs, alive: !!room });
  }

  if (b.act === 'send') {
    const from = String(b.from || ''), to = String(b.to || ''), kind = String(b.kind || '');
    if (!PEER_RE.test(from) || !PEER_RE.test(to) || from === to) return send(res, 400, { error: 'Bad peer id.' });
    if (['offer', 'answer', 'bye'].indexOf(kind) < 0) return send(res, 400, { error: 'Bad message.' });
    const sdp = kind === 'bye' ? null : cleanSdp(b.sdp);
    if (kind !== 'bye' && !sdp) return send(res, 400, { error: 'Bad connection data.' });
    if (await limit(ip, 's')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
    const room = await loadRoom(code);
    if (!room) return send(res, 404, { error: 'That room has closed.' });
    if (from !== room.host && to !== room.host) return send(res, 403, { error: 'Joiners can only write to the host.' });
    if (kind === 'offer' && to !== room.host) return send(res, 403, { error: 'Only joiners send offers.' });
    if (kind === 'answer' && from !== room.host) return send(res, 403, { error: 'Only the host answers.' });
    const msg = { from, kind, sdp, name: name(b.name), at: now };
    const box = `cr:m:${code}:${to}`;
    await redis([['RPUSH', box, JSON.stringify(msg)], ['LTRIM', box, -30, -1], ['EXPIRE', box, BOX_TTL]]);
    return send(res, 200, { ok: true });
  }

  if (b.act === 'room' || b.act === 'close') {
    const peer = String(b.peer || '');
    if (!PEER_RE.test(peer)) return send(res, 400, { error: 'Bad peer id.' });
    if (await limit(ip, 's')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
    const room = await loadRoom(code);
    if (!room) return send(res, 200, { ok: true });
    if (room.host !== peer) return send(res, 403, { error: 'Only the host can do that.' });
    if (b.act === 'close') { await redis([['DEL', `cr:r:${code}`]]); return send(res, 200, { ok: true }); }
    const r2 = cleanRoom(b.room);
    if (!r2) return send(res, 400, { error: 'Bad room settings.' });
    room.room = r2;
    await redis([['SET', `cr:r:${code}`, JSON.stringify(room), 'EX', ROOM_TTL]]);
    return send(res, 200, { ok: true });
  }
  return send(res, 400, { error: 'Unknown action.' });
}

module.exports = async (req, res) => {
  try { await handler(req, res); } catch (e) { send(res, 500, { error: 'Server error: try again.' }); }
};
module.exports._test = { cleanRoom, cleanSdp, name, CODE_RE };
