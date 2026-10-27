// Leaderboard for mes.fm/nba-picks (MES NBA Picks): people post their predicted final standings (15 teams per conference) for the
// current season and everyone is scored against the live standings, server side, on every read.
//
// Same Upstash Redis as api/fav.js / api/share.js (UPSTASH_REDIS_REST_URL / _TOKEN). One hash per season: nbap:<season>:e, field = entry id,
// value = JSON { n name, E [15 ids] | null, W [15 ids] | null, h sha256(edit key), c created ms, t picks last changed ms, gp {E,W} average games
// played in that conference when the picks were last changed (0 = before the season started; more = "picked late", shown on the board) }.
// The edit key is random, kept only in the person's browser; only its SHA-256 is stored.
//
//   GET  ?board=E|W|both&m=w3|w2|w1|exact|tier|top10|pts|close|rho|dist -> { season, seasonName, gp, board, m, total, rows:[{r,id,n,v,share,m,gp,t,E,W}] }
//         (top 300, computed against the cached standings; picks come back as "phi.bos..." so the page can compare them)
//   GET  ?id=<id>                                       -> { id, n, E, W, t, gp }
//   POST { a:"submit", name, E?, W?, season? }          -> { id, key }        (at least one conference; each must be 15 distinct teams of it)
//   POST { a:"update", id, key, name?, E?, W? }         -> { id }             (E / W: a list replaces, null removes; one must remain)
//   POST { a:"delete", id, key }                         -> { ok:true }
//   POST { a:"remove", admin, id } (env NBA_PICKS_ADMIN_KEY; unset = disabled) -> { ok:true }
// Limits: 20 writes per IP per hour (IP stored only as a salted hash in the rate-limit key), 5,000 entries per season, names 1-24 letters /
// numbers / space . _ ' - with a light rude-word filter (the admin remove is the real backstop). The season's hash expires 400 days after its last write.
const crypto = require('crypto');
const L = require('./_nba-lib.js');
const S = require('./nba-standings.js');

const TTL = 400 * 86400;
const PER_HOUR = 20;
const MAX_ENTRIES = 5000;
const TOP = 300;
const ID_RE = /^[a-z0-9]{10}$/;
const KEY_RE = /^[a-f0-9]{32}$/;
const NAME_RE = /^[\p{L}\p{N} _.'\-]{1,24}$/u;
const BAD = /(f+u+c+k|sh[i1]+t|c[u]+nt|n[i1]gg|f[a4]gg|b[i1]tch|wh[o0]re|p[e3]n[i1]s|d[i1]ck|cock|pussy|rape|nazi|hitler|slut)/i;
const METRIC_KEYS = L.METRICS.map((x) => x.k);

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
const hashKey = (season) => `nbap:${season}:e`;

function cleanName(s) {
  const n = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!NAME_RE.test(n) || BAD.test(n.replace(/[ _.'\-]/g, ''))) return null;
  return n;
}
// undefined = not sent, null = remove, array = must be a valid list for that conference, anything else = bad
function cleanList(v, conf) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const a = Array.isArray(v) ? v.map((x) => String(x).toUpperCase()) : typeof v === 'string' ? (L.decodeList(v, conf) || []) : [];
  return L.validPicks(a, conf) ? a : false;
}
const enc = (a) => (a ? L.encodeList(a) : null);

function boardRows(entries, st, board, m) {
  const rows = [];
  for (const [id, raw] of entries) {
    let e; try { e = JSON.parse(raw); } catch (x) { continue; }
    const picks = { E: e.E, W: e.W }, sc = L.scoreAll(picks, st, { ties: true });
    const part = board === 'both' ? sc.both : sc[board];
    if (!part) continue;
    rows.push({ id, n: e.n, v: L.metricValue(part.m, m), share: Math.round(L.metricShare(part.m, m) * 1000) / 1000, m: slim(part.m), gp: e.gp || {}, t: e.t, E: enc(e.E), W: enc(e.W) });
  }
  // best first; a tie goes to whoever picked with fewer games played, then earlier
  const late = (r) => (board === 'both' ? (r.gp.E || 0) + (r.gp.W || 0) : r.gp[board] || 0);
  rows.sort((a, b) => b.v - a.v || late(a) - late(b) || a.t - b.t);
  rows.forEach((r, i) => { r.r = i && rows[i - 1].v === r.v ? rows[i - 1].r : i + 1; });
  return rows;
}
function slim(m) {
  const o = {};
  ['n', 'exact', 'w1', 'w2', 'w3', 'tier', 'top10', 'pts', 'dist'].forEach((k) => { o[k] = m[k]; });
  o.close = Math.round(m.close * 1000) / 1000; o.rho = Math.round(m.rho * 1000) / 1000;
  return o;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  let st;
  try { st = await S.fetchStandings(null); } catch (e) { res.status(502).json({ error: 'standings unavailable' }); return; }
  const season = st.season, H = hashKey(season);
  try {
    const q = req.query || {};
    if (req.method === 'GET' && q.id !== undefined) {
      const id = String(q.id);
      if (!ID_RE.test(id)) { res.status(404).json({ error: 'not found' }); return; }
      const [row] = await redis([['HGET', H, id]]);
      if (!row || !row.result) { res.status(404).json({ error: 'not found' }); return; }
      const e = JSON.parse(row.result);
      res.status(200).json({ id, n: e.n, E: enc(e.E), W: enc(e.W), t: e.t, gp: e.gp || {}, season });
      return;
    }
    if (req.method === 'GET') {
      const board = ['E', 'W', 'both'].includes(String(q.board)) ? String(q.board) : 'E';
      const m = METRIC_KEYS.includes(String(q.m)) ? String(q.m) : 'w3';
      const [all] = await redis([['HGETALL', H]]);
      const flat = (all && all.result) || [], entries = [];
      for (let i = 0; i < flat.length; i += 2) entries.push([flat[i], flat[i + 1]]);
      const rows = boardRows(entries, st, board, m);
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.status(200).json({ season, seasonName: st.seasonName, gp: st.gp, generated: st.generated, board, m, total: rows.length, rows: rows.slice(0, TOP) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 4000) { res.status(400).json({ error: 'bad request' }); return; }
    if (process.env.VERCEL_ENV === 'production' && req.headers.origin && req.headers.origin !== 'https://mes.fm') { res.status(403).json({ error: 'not allowed' }); return; }

    if (body.a === 'remove') {
      const admin = process.env.NBA_PICKS_ADMIN_KEY;
      const ok = admin && typeof body.admin === 'string' && body.admin.length === admin.length && crypto.timingSafeEqual(Buffer.from(body.admin), Buffer.from(admin));
      if (!ok || !ID_RE.test(String(body.id || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
      await redis([['HDEL', H, body.id]]);
      res.status(200).json({ ok: true });
      return;
    }
    if (!['submit', 'update', 'delete'].includes(body.a)) { res.status(400).json({ error: 'bad request' }); return; }
    if (body.season !== undefined && Number(body.season) !== season) { res.status(409).json({ error: 'The season has changed. Reload the page.' }); return; }
    const hour = Math.floor(Date.now() / 3600000), rl = `nbap:rl:${sha('nbap|' + process.env.UPSTASH_REDIS_REST_TOKEN + '|' + clientIp(req)).slice(0, 16)}:${hour}`;
    const [cnt] = await redis([['INCR', rl], ['EXPIRE', rl, 4000]]);
    if (cnt && cnt.result > PER_HOUR) { res.status(429).json({ error: 'Too many changes from this connection. Try again in an hour.' }); return; }
    const gpNow = st.gp || { E: 0, W: 0 }, now = Date.now();

    if (body.a === 'submit') {
      const name = cleanName(body.name);
      if (!name) { res.status(400).json({ error: 'Pick another name: 1-24 letters, numbers, spaces, . _ \' - (no rude words).' }); return; }
      const E = cleanList(body.E, 'E'), W = cleanList(body.W, 'W');
      if (E === false || W === false || (!E && !W)) { res.status(400).json({ error: 'Each conference needs all 15 of its teams, each once.' }); return; }
      const [len] = await redis([['HLEN', H]]);
      if (len && len.result >= MAX_ENTRIES) { res.status(507).json({ error: 'The leaderboard is full for this season.' }); return; }
      const key = crypto.randomBytes(16).toString('hex');
      const entry = { n: name, E: E || null, W: W || null, h: sha(key), c: now, t: now, gp: { E: E ? gpNow.E : null, W: W ? gpNow.W : null } };
      for (let tries = 0; tries < 3; tries++) {
        const id = newId();
        const out = await redis([['HSETNX', H, id, JSON.stringify(entry)], ['EXPIRE', H, TTL]]);
        if (out[0] && out[0].result === 1) { res.status(200).json({ id, key, season }); return; }
      }
      res.status(502).json({ error: 'could not save' });
      return;
    }
    // update / delete: the edit key must match
    if (!ID_RE.test(String(body.id || '')) || !KEY_RE.test(String(body.key || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
    const [row] = await redis([['HGET', H, body.id]]);
    const cur = row && row.result ? JSON.parse(row.result) : null;
    if (!cur) { res.status(404).json({ error: 'That entry is not on this season’s leaderboard any more.' }); return; }
    if (cur.h !== sha(body.key)) { res.status(403).json({ error: 'not allowed' }); return; }
    if (body.a === 'delete') { await redis([['HDEL', H, body.id]]); res.status(200).json({ ok: true }); return; }
    const next = Object.assign({}, cur, { gp: Object.assign({}, cur.gp) });
    if (body.name !== undefined) { const n = cleanName(body.name); if (!n) { res.status(400).json({ error: 'Pick another name: 1-24 letters, numbers, spaces, . _ \' - (no rude words).' }); return; } next.n = n; }
    let changed = false;
    for (const c of ['E', 'W']) {
      const v = cleanList(body[c], c);
      if (v === false) { res.status(400).json({ error: 'Each conference needs all 15 of its teams, each once.' }); return; }
      if (v === undefined) continue;
      if (JSON.stringify(v) !== JSON.stringify(cur[c] || null)) { next[c] = v; next.gp[c] = v ? gpNow[c] : null; changed = true; }
    }
    if (!next.E && !next.W) { res.status(400).json({ error: 'Keep at least one conference, or remove the entry.' }); return; }
    if (changed) next.t = now;
    await redis([['HSET', H, body.id, JSON.stringify(next)], ['EXPIRE', H, TTL]]);
    res.status(200).json({ id: body.id, season });
  } catch (e) {
    res.status(502).json({ error: 'storage unavailable' });
  }
};
module.exports._test = { cleanName, cleanList, boardRows, NAME_RE, BAD };
