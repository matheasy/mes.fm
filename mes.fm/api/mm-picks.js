// Leaderboard for mes.fm/march-madness (MES March Madness): people post a full bracket for one tournament (men's or women's, one year)
// and everyone is scored against the real results, server side, on every read.
//
// Same Upstash Redis as api/fav.js / api/nba-picks.js (UPSTASH_REDIS_REST_URL / _TOKEN). One hash per tournament: mmb:<g>:<year>:e,
// field = entry id, value = JSON { n name, p picks (lib encodePicks, 2 bits per game), h sha256(edit key), c created ms, t picks last changed ms,
// late true when the picks were last changed after the first Round of 64 game tipped off (a "replay" entry: shown apart, never ranked with the on-time ones) }.
// The edit key is random, kept only in the person's browser; only its SHA-256 is stored.
//
//   GET  ?g=m|w&y=2026[&s=espn|simple|seed][&late=1]  -> { g, year, status, lock, s, total, rows:[{r,id,n,pts,max,correct,champ,late,t}] }  (top 300)
//   GET  ?g=&y=&id=<id>                               -> { id, n, p, t, late }
//   POST { a:"submit", g, y, name, p }                 -> { id, key, late }   (p must be a complete bracket of that field)
//   POST { a:"update", g, y, id, key, name?, p? }      -> { id, late }
//   POST { a:"delete", g, y, id, key }                 -> { ok:true }
//   POST { a:"remove", g, y, admin, id } (env MM_PICKS_ADMIN_KEY; unset = disabled) -> { ok:true }
// Limits: 20 writes per IP per hour (IP only as a salted hash in the rate-limit key), 10,000 entries per tournament, names 1-24 letters /
// numbers / space . _ ' - with a light rude-word filter. A tournament's hash expires 400 days after its last write.
const crypto = require('crypto');
const L = require('./_mm-lib.js');
const B = require('./mm-bracket.js');

const TTL = 400 * 86400;
const PER_HOUR = 20;
const MAX_ENTRIES = 10000;
const TOP = 300;
const ID_RE = /^[a-z0-9]{10}$/;
const KEY_RE = /^[a-f0-9]{32}$/;
const BAD = /(f+u+c+k|sh[i1]+t|c[u]+nt|n[i1]gg|f[a4]gg|b[i1]tch|wh[o0]re|p[e3]n[i1]s|d[i1]ck|cock|pussy|rape|nazi|hitler|slut)/i;

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const out = await res.json();
  if (!Array.isArray(out)) throw new Error('redis');
  return out;
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function newId() { const a = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.randomBytes(10); let s = ''; for (let i = 0; i < 10; i++) s += a[b[i] % 36]; return s; }
const hashKey = (g, y) => `mmb:${g}:${y}:e`;

function cleanName(s) { const n = L.cleanName(s); return n && !BAD.test(n.replace(/[ _.'\-]/g, '')) ? n : null; }
// a complete bracket of this field, re-encoded from what the server itself decoded
function cleanBracket(T, p) {
  const P = L.cleanPicks(T, L.decodePicks(p));
  return P && L.complete(T, P) ? P : null;
}
const isLate = (T, now) => !!(T.lock && now >= Date.parse(T.lock));

function boardRows(entries, T, sys, wantLate) {
  const rows = [];
  for (const [id, raw] of entries) {
    let e; try { e = JSON.parse(raw); } catch (x) { continue; }
    if (!!e.late !== !!wantLate) continue;
    const P = L.cleanPicks(T, L.decodePicks(e.p)); if (!P) continue;
    const sc = L.score(T, P, sys);
    rows.push({ id, n: e.n, pts: sc.pts, max: sc.max, correct: sc.correct, champ: sc.champ, late: !!e.late, t: e.t });
  }
  // best first; then the higher maximum still possible; then whoever posted earlier
  rows.sort((a, b) => b.pts - a.pts || b.max - a.max || a.t - b.t);
  rows.forEach((r, i) => { r.r = i && rows[i - 1].pts === r.pts && rows[i - 1].max === r.max ? rows[i - 1].r : i + 1; });
  return rows;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  const q = req.query || {};
  let body = null;
  if (req.method === 'POST') {
    body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 2000) { res.status(400).json({ error: 'bad request' }); return; }
    if (process.env.VERCEL_ENV === 'production' && req.headers.origin && req.headers.origin !== 'https://mes.fm') { res.status(403).json({ error: 'not allowed' }); return; }
  }
  const src = body || q, g = src.g === 'w' ? 'w' : 'm', y = B.yearParam(src.y);
  if (!y) { res.status(400).json({ error: 'bad year' }); return; }
  let T;
  try { T = await B.fetchTournament(g, y, null, { noLive: true }); } catch (e) { res.status(502).json({ error: 'results unavailable' }); return; }
  if (!L.okTournament(T)) { res.status(409).json({ error: 'That tournament’s field is not out yet.' }); return; }
  const H = hashKey(g, y);
  try {
    if (req.method === 'GET' && q.id !== undefined) {
      const id = String(q.id);
      if (!ID_RE.test(id)) { res.status(404).json({ error: 'not found' }); return; }
      const [row] = await redis([['HGET', H, id]]);
      if (!row || !row.result) { res.status(404).json({ error: 'not found' }); return; }
      const e = JSON.parse(row.result);
      res.status(200).json({ id, n: e.n, p: e.p, t: e.t, late: !!e.late, g, year: y });
      return;
    }
    if (req.method === 'GET') {
      const s = L.SYSTEMS[String(q.s)] ? String(q.s) : 'espn', late = q.late === '1';
      const [all] = await redis([['HGETALL', H]]);
      const flat = (all && all.result) || [], entries = [];
      for (let i = 0; i < flat.length; i += 2) entries.push([flat[i], flat[i + 1]]);
      const rows = boardRows(entries, T, s, late);
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.status(200).json({ g, year: y, status: T.status, lock: T.lock, s, late, total: rows.length, rows: rows.slice(0, TOP) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

    if (body.a === 'remove') {
      const admin = process.env.MM_PICKS_ADMIN_KEY;
      const ok = admin && typeof body.admin === 'string' && body.admin.length === admin.length && crypto.timingSafeEqual(Buffer.from(body.admin), Buffer.from(admin));
      if (!ok || !ID_RE.test(String(body.id || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
      await redis([['HDEL', H, body.id]]);
      res.status(200).json({ ok: true });
      return;
    }
    if (!['submit', 'update', 'delete'].includes(body.a)) { res.status(400).json({ error: 'bad request' }); return; }
    const hour = Math.floor(Date.now() / 3600000), rl = `mmb:rl:${sha('mmb|' + process.env.UPSTASH_REDIS_REST_TOKEN + '|' + clientIp(req)).slice(0, 16)}:${hour}`;
    const [cnt] = await redis([['INCR', rl], ['EXPIRE', rl, 4000]]);
    if (cnt && cnt.result > PER_HOUR) { res.status(429).json({ error: 'Too many changes from this connection. Try again in an hour.' }); return; }
    const now = Date.now(), late = isLate(T, now);

    if (body.a === 'submit') {
      const name = cleanName(body.name);
      if (!name) { res.status(400).json({ error: 'Pick another name: 1-24 letters, numbers, spaces, . _ \' - (no rude words).' }); return; }
      const P = cleanBracket(T, body.p);
      if (!P) { res.status(400).json({ error: 'Fill in every game first (all 63, champion included).' }); return; }
      const [len] = await redis([['HLEN', H]]);
      if (len && len.result >= MAX_ENTRIES) { res.status(507).json({ error: 'The leaderboard is full for this tournament.' }); return; }
      const key = crypto.randomBytes(16).toString('hex');
      const entry = { n: name, p: L.encodePicks(P), h: sha(key), c: now, t: now, late };
      for (let tries = 0; tries < 3; tries++) {
        const id = newId();
        const out = await redis([['HSETNX', H, id, JSON.stringify(entry)], ['EXPIRE', H, TTL]]);
        if (out[0] && out[0].result === 1) { res.status(200).json({ id, key, late }); return; }
      }
      res.status(502).json({ error: 'could not save' });
      return;
    }
    if (!ID_RE.test(String(body.id || '')) || !KEY_RE.test(String(body.key || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
    const [row] = await redis([['HGET', H, body.id]]);
    const cur = row && row.result ? JSON.parse(row.result) : null;
    if (!cur) { res.status(404).json({ error: 'That bracket is not on the leaderboard any more.' }); return; }
    if (cur.h !== sha(body.key)) { res.status(403).json({ error: 'not allowed' }); return; }
    if (body.a === 'delete') { await redis([['HDEL', H, body.id]]); res.status(200).json({ ok: true }); return; }
    const next = Object.assign({}, cur);
    if (body.name !== undefined) { const n = cleanName(body.name); if (!n) { res.status(400).json({ error: 'Pick another name: 1-24 letters, numbers, spaces, . _ \' - (no rude words).' }); return; } next.n = n; }
    if (body.p !== undefined) {
      const P = cleanBracket(T, body.p);
      if (!P) { res.status(400).json({ error: 'Fill in every game first (all 63, champion included).' }); return; }
      const enc = L.encodePicks(P);
      // once the first game has tipped off a change of picks makes the entry a replay entry
      if (enc !== cur.p) { next.p = enc; next.t = now; next.late = cur.late || late; }
    }
    await redis([['HSET', H, body.id, JSON.stringify(next)], ['EXPIRE', H, TTL]]);
    res.status(200).json({ id: body.id, late: !!next.late });
  } catch (e) {
    res.status(502).json({ error: 'storage unavailable' });
  }
};
module.exports._test = { cleanName, cleanBracket, boardRows, isLate, BAD };
