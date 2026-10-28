// Leaderboards for the MES Picks pages (mes.fm/nba-picks, nfl-picks, mlb-picks, nhl-picks, la-liga-picks, premier-league-picks): people post their
// predicted tables (conferences, divisions, whole league) and playoff picks for the current season, and everyone is scored against the live
// standings / playoff results, server side, on every read.
//
// Same Upstash Redis as api/fav.js / api/share.js (UPSTASH_REDIS_REST_URL / _TOKEN). One hash per league and season: nbap:<season>:e (NBA, the
// first version's key, kept) or picks:<lg>:<season>:e, field = entry id, value = JSON { n name, L { group key: [ids] }, P { stage: [ids] } | null,
// h sha256(edit key), c created ms, t last changed ms, gp { group key: average games played in that group when its list was last changed },
// pg playoff games already finished when the playoff picks were last changed }. NBA entries from the first version stored E / W at the top: read as L.E / L.W.
// The edit key is random, kept only in the person's browser; only its SHA-256 is stored.
//
//   GET  ?lg=&board=<conference key>|all|L|D|P&m=<metric>  -> { lg, season, seasonName, gp, board, m, total, over, rows:[{r,id,n,v,share,m,gp,t,L,P?}] }
//        (all = every conference added up, "both" is still read as all; D = every division added up; P = playoff picks, ranked by points)
//   GET  ?lg=&id=<id>                                -> { id, n, L, P, t, gp }
//   POST { lg, a:"submit", name, L:{key:[ids]}, P?, season? }   -> { id, key }
//   POST { lg, a:"update", id, key, name?, L?, P? }  (a list replaces, null removes; P null removes)  -> { id }
//   POST { lg, a:"delete", id, key }                  -> { ok:true }
//   POST { lg, a:"remove", admin, id } (env NBA_PICKS_ADMIN_KEY; unset = disabled) -> { ok:true }
//   The first version's NBA posts ({ a, name, E, W }) are still accepted.
// Rules: tables can be posted until the regular season is over; playoff picks only before the playoffs start. 20 writes per IP per hour (IP stored
// only as a salted hash in the rate-limit key), 5,000 entries per league and season, names 1-24 letters / numbers / space . _ ' - with a light
// rude-word filter (the admin remove is the real backstop). A season's hash expires 400 days after its last write.
const crypto = require('crypto');
const Lib = require('./_nba-lib.js');
const S = require('./nba-standings.js');

const TTL = 400 * 86400;
const PER_HOUR = 20;
const MAX_ENTRIES = 5000;
const TOP = 300;
const ID_RE = /^[a-z0-9]{10}$/;
const KEY_RE = /^[a-f0-9]{32}$/;
const NAME_RE = /^[\p{L}\p{N} _.'\-]{1,24}$/u;
const BAD = /(f+u+c+k|sh[i1]+t|c[u]+nt|n[i1]gg|f[a4]gg|b[i1]tch|wh[o0]re|p[e3]n[i1]s|d[i1]ck|cock|pussy|rape|nazi|hitler|slut)/i;
const METRIC_KEYS = Lib.METRICS.map((x) => x.k).concat(['top10']);

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
const hashKey = (lg, season) => (lg === 'nba' ? `nbap:${season}:e` : `picks:${lg}:${season}:e`);

function cleanName(s) {
  const n = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!NAME_RE.test(n) || BAD.test(n.replace(/[ _.'\-]/g, ''))) return null;
  return n;
}
// undefined = not sent, null = remove, array / "a.b.c" = must be a valid list for that group, anything else = false (bad)
function cleanList(v, within) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const a = Array.isArray(v) ? v.map((x) => String(x).toUpperCase()) : typeof v === 'string' ? (Lib.decodeList(v, within) || []) : [];
  return Lib.validList(a, within) ? a : false;
}
// an entry's lists, also for the first version's NBA entries (E / W at the top)
function listsOf(e) { const o = Object.assign({}, e.L || {}); if (e.E && !o.E) o.E = e.E; if (e.W && !o.W) o.W = e.W; return o; }
function encLists(o) { const r = {}; Object.keys(o || {}).forEach((k) => { if (o[k]) r[k] = Lib.encodeList(o[k]); }); return r; }
function boardKeys(ctx, board) {
  if (board === 'all') return Lib.confKeys(ctx);
  if (board === 'D') return Lib.divKeys(ctx);
  return [board];
}
function validBoards(ctx) {
  const b = ['L'].concat(Lib.confKeys(ctx));
  if (Lib.confKeys(ctx).length) b.push('all');
  if (Lib.divKeys(ctx).length) b.push('D');
  if (ctx.lg.po) b.push('P');
  return b;
}

function boardRows(entries, st, ctx, board, m) {
  const rows = [];
  for (const [id, raw] of entries) {
    let e; try { e = JSON.parse(raw); } catch (x) { continue; }
    const lists = listsOf(e), gp = e.gp || {};
    let v, share, mm;
    if (board === 'P') {
      if (!e.P || !Lib.poFilled(e.P)) continue;
      const sc = Lib.scorePo(ctx, e.P, st.po);
      v = sc.pts; share = sc.max ? Math.round(sc.pts / sc.max * 1000) / 1000 : 0;
      mm = { pts: sc.pts, max: sc.max, possible: sc.possible, hits: sc.hits, picks: sc.picks };
      rows.push({ id, n: e.n, v, share, m: mm, pg: e.pg || 0, late: e.pg || 0, t: e.t, P: Lib.encodePo(ctx.lg, Lib.cleanPo(ctx, e.P)) });
      continue;
    }
    const keys = boardKeys(ctx, board), sc = Lib.scoreLists(ctx, lists, st, keys, { ties: true });
    if (!sc.m) continue;
    v = Lib.metricValue(sc.m, m); share = Math.round(Lib.metricShare(sc.m, m) * 1000) / 1000;
    const late = keys.reduce((a, k) => a + (gp[k] || 0), 0);
    const sub = {}; keys.forEach((k) => { sub[k] = lists[k]; });
    rows.push({ id, n: e.n, v, share, m: slim(sc.m), gp, late, t: e.t, L: encLists(sub) });
  }
  // best first; a tie goes to whoever picked with fewer games played, then earlier
  rows.sort((a, b) => b.v - a.v || a.late - b.late || a.t - b.t);
  rows.forEach((r, i) => { r.r = i && rows[i - 1].v === r.v ? rows[i - 1].r : i + 1; delete r.late; });
  return rows;
}
function slim(m) {
  const o = {};
  ['n', 'exact', 'w1', 'w2', 'w3', 'tier', 'cut', 'pts', 'dist'].forEach((k) => { o[k] = m[k]; });
  o.top10 = m.cut;
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
  const q = req.query || {};
  let body = null;
  if (req.method === 'POST') {
    body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 6000) { res.status(400).json({ error: 'bad request' }); return; }
  }
  const lg = S.lgParam((body && body.lg) || q.lg);
  if (!lg) { res.status(400).json({ error: 'unknown league' }); return; }
  let st;
  try { st = await S.fetchStandings(lg, null); } catch (e) { res.status(502).json({ error: 'standings unavailable' }); return; }
  const ctx = Lib.makeCtx(lg, st);
  const season = st.season, H = hashKey(lg, season);
  try {
    if (req.method === 'GET' && q.id !== undefined) {
      const id = String(q.id);
      if (!ID_RE.test(id)) { res.status(404).json({ error: 'not found' }); return; }
      const [row] = await redis([['HGET', H, id]]);
      if (!row || !row.result) { res.status(404).json({ error: 'not found' }); return; }
      const e = JSON.parse(row.result);
      res.status(200).json({ id, n: e.n, L: encLists(listsOf(e)), P: e.P ? Lib.encodePo(ctx.lg, Lib.cleanPo(ctx, e.P)) : null, t: e.t, gp: e.gp || {}, season });
      return;
    }
    if (req.method === 'GET') {
      let board = String(q.board || '');
      if (board === 'both') board = 'all';
      const boards = validBoards(ctx);
      if (boards.indexOf(board) < 0) board = boards.indexOf('all') >= 0 ? Lib.confKeys(ctx)[0] : 'L';
      let m = METRIC_KEYS.includes(String(q.m)) ? String(q.m) : 'w3';
      if (m === 'top10') m = 'cut';
      const [all] = await redis([['HGETALL', H]]);
      const flat = (all && all.result) || [], entries = [];
      for (let i = 0; i < flat.length; i += 2) entries.push([flat[i], flat[i + 1]]);
      const rows = boardRows(entries, st, ctx, board, m);
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.status(200).json({ lg, season, seasonName: st.seasonName, gp: st.gp, over: !!st.over, generated: st.generated, board, m: board === 'P' ? 'pts' : m, total: rows.length, rows: rows.slice(0, TOP) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
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
    const gpNow = st.gp || {}, now = Date.now(), poGames = (st.po && st.po.games) || 0, poStarted = !!(st.po && st.po.started);
    const groupKeys = Object.keys(ctx.groups);
    // the lists sent: { key: list | null } (also the first version's top-level E / W)
    const sent = Object.assign({}, body.L && typeof body.L === 'object' && !Array.isArray(body.L) ? body.L : {});
    if (body.E !== undefined && sent.E === undefined) sent.E = body.E;
    if (body.W !== undefined && sent.W === undefined) sent.W = body.W;
    const lists = {};
    for (const k of Object.keys(sent)) {
      if (groupKeys.indexOf(k) < 0) { res.status(400).json({ error: 'Unknown table: ' + String(k).slice(0, 12) }); return; }
      const v = cleanList(sent[k], ctx.groups[k]);
      if (v === false) { res.status(400).json({ error: 'Each table needs all of its teams, each once.' }); return; }
      lists[k] = v;
    }
    let P;
    if (body.P !== undefined && body.P !== null) {
      P = Lib.cleanPo(ctx, typeof body.P === 'string' ? Lib.decodePo(ctx, body.P) : body.P);
      if (!Lib.poFilled(P)) P = null;
    } else P = body.P;
    const listsGiven = Object.keys(lists).some((k) => lists[k]);
    const OVER = 'The ' + st.seasonName + ' regular season is over, so this board is final. Picks for next season open when its standings appear.';
    const PO_CLOSED = 'The playoffs have started, so playoff picks are closed for this season.';

    if (body.a === 'submit') {
      const name = cleanName(body.name);
      if (!name) { res.status(400).json({ error: 'Pick another name: 1-24 letters, numbers, spaces, . _ \' - (no rude words).' }); return; }
      if (!listsGiven && !P) { res.status(400).json({ error: 'Post at least one full table or some playoff picks.' }); return; }
      if (listsGiven && st.over) { res.status(409).json({ error: OVER }); return; }
      if (P && poStarted) { res.status(409).json({ error: PO_CLOSED }); return; }
      const [len] = await redis([['HLEN', H]]);
      if (len && len.result >= MAX_ENTRIES) { res.status(507).json({ error: 'The leaderboard is full for this season.' }); return; }
      const key = crypto.randomBytes(16).toString('hex');
      const Ls = {}, gp = {};
      Object.keys(lists).forEach((k) => { if (lists[k]) { Ls[k] = lists[k]; gp[k] = gpNow[k] || 0; } });
      const entry = { n: name, L: Ls, P: P || null, h: sha(key), c: now, t: now, gp, pg: P ? poGames : 0 };
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
    const old = listsOf(cur);
    const next = { n: cur.n, L: Object.assign({}, old), P: cur.P || null, h: cur.h, c: cur.c, t: cur.t, gp: Object.assign({}, cur.gp), pg: cur.pg || 0 };
    if (body.name !== undefined) { const n = cleanName(body.name); if (!n) { res.status(400).json({ error: 'Pick another name: 1-24 letters, numbers, spaces, . _ \' - (no rude words).' }); return; } next.n = n; }
    let changed = false;
    for (const k of Object.keys(lists)) {
      const v = lists[k];
      if (JSON.stringify(v) === JSON.stringify(old[k] || null)) continue;
      if (st.over) { res.status(409).json({ error: OVER }); return; }
      if (v) { next.L[k] = v; next.gp[k] = gpNow[k] || 0; } else { delete next.L[k]; delete next.gp[k]; }
      changed = true;
    }
    if (P !== undefined && JSON.stringify(P || null) !== JSON.stringify(cur.P ? Lib.cleanPo(ctx, cur.P) : null)) {
      if (poStarted) { res.status(409).json({ error: PO_CLOSED }); return; }
      next.P = P || null; next.pg = P ? poGames : 0; changed = true; }
    if (!Object.keys(next.L).length && !next.P) { res.status(400).json({ error: 'Keep at least one table or your playoff picks, or remove the entry.' }); return; }
    if (changed) next.t = now;
    await redis([['HSET', H, body.id, JSON.stringify(next)], ['EXPIRE', H, TTL]]);
    res.status(200).json({ id: body.id, season });
  } catch (e) {
    res.status(502).json({ error: 'storage unavailable' });
  }
};
module.exports._test = { cleanName, cleanList, boardRows, listsOf, hashKey, NAME_RE, BAD };
