// MES Falling Blocks (mes.fm/blocks): the Hive-verified leaderboard and live two-player races.
// Same Upstash Redis as api/mines.js / api/c4.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
// The rules come from _blocks-lib.js, a byte-identical copy of tool_apps_src/blocks/lib.js (cp after editing; the tests check).
//
// Leaderboard (only games saved on Hive, replayed here action by action):
// GET  ?board=<key>&n=<1-100>    -> {top:[{acct, t, sc, l, pc, trx, ts}], count}
//        key = "s" (Sprint 40, fastest time), "u" (Ultra 2 min, best score), "m" (Marathon from level 1, best score),
//        "d:YYYY-MM-DD" (the daily Sprint 40 on that day's seed, fastest time)
// GET  ?daily=YYYY-MM-DD         -> {count}
// POST {act:"submit", acct, trx} -> {board, rank, count, best} | {board:null, note}
//   Reads acct's recent account history (custom_json only), finds the mes_blocks operation of transaction trx signed with acct's
//   posting authority and runs MESBlocks.verify() on it: the seed + every recorded action must give exactly the claimed time,
//   lines, score and pieces, and at most 12 pieces a second. Daily: today or yesterday (UTC), op not older than that day.
//   An exact copy of someone else's actions is refused. One entry per account per board: the best stays.
//
// Races (guest play, no account; 6 hours after the last activity):
// GET  ?id=<id>                  -> {g}
// GET  ?lobby=1                  -> {open:[{id, name, age}]}
// POST {act:"new", name, pub}    -> {g, key, seat}
// POST {act:"join", id, name}    -> {g, key, seat}       the race starts 4 s later, both players get the same new seed
// POST {act:"up", id, key, round, st:{l, s, p, b, o, d, t}} -> {g}   my lines, garbage sent, pieces, board (200 digits),
//        topped out, reached 40 lines, game ms. o = 1 -> the other player wins; d = 1 first -> I win.
// POST {act:"leave"|"claim"|"rematch"|"cancel", id, key, round}
//   claim: the other player has sent nothing for 20 s during a race. rematch: a new seed, a new countdown.
// Abuse limits: JSON only, <= 1 KB, Origin https://mes.fm in production, per salted IP hash per hour:
// 60 submits, 3,000 reads, 30 new races, 120 joins, 8,000 race updates.
const crypto = require('crypto');
const B = require('./_blocks-lib.js');

const LIM = { s: 60, r: 3000, n: 30, j: 120, a: 8000 };
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;
const ACCT_RE = /^[a-z][a-z0-9.-]{2,15}$/;
const TRX_RE = /^[0-9a-f]{40}$/;
const BOARD_RE = /^(s|u|m|d:\d{4}-\d\d-\d\d)$/;
const ID_RE = /^[a-z0-9]{8}$/;
const KEY_RE = /^[A-Za-z0-9_-]{20,64}$/;
const ID_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const DAY = 86400000;
const KEEP_DAILY = 400 * 86400;
const TTL = 6 * 3600;
const COUNTDOWN = 4000;
const CLAIM_MS = 20000;
const LOBBY_MAX_AGE = 30 * 60 * 1000;
const HIVE_NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network'];

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const salt = () => process.env.RATING_SALT || sha('mes-blocks|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function send(res, code, obj, cache) { res.setHeader('Cache-Control', cache || 'no-store'); res.status(code).json(obj); }
function parseJ(s) { try { return JSON.parse(s); } catch (e) { return null; } }
async function limit(ip, kind) {
  const k = `blk:rl:${kind}:${sha(salt() + ip).slice(0, 24)}`;
  const r = await redis([['INCR', k], ['EXPIRE', k, 3600, 'NX']]);
  return (r[0] && r[0].result) > LIM[kind];
}
async function history(acct) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_account_history', params: [acct, -1, 200, 262144, 0] });
  for (const node of HIVE_NODES) {
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 6000);
      const r = await fetch(node, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ac.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && Array.isArray(j.result)) return B.parseHistory(j.result, acct);
    } catch (e) { /* next node */ }
  }
  return null;
}

/* ---------- races ---------- */
function newId() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ID_ABC[b[i] % ID_ABC.length]; return s; }
function newKey() { return crypto.randomBytes(24).toString('base64url'); }
function newSeed() { return 'r' + crypto.randomBytes(6).toString('hex'); }
function name(v) {
  if (typeof v !== 'string') return 'Guest';
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return s || 'Guest';
}
function blank() { return { l: 0, s: 0, p: 0, b: '', o: 0, d: 0, t: 0, at: 0 }; }
function pub(g, now) {
  return { id: g.id, names: g.names, st: g.st.map((x) => ({ l: x.l, s: x.s, p: x.p, b: x.b, o: x.o, d: x.d, t: x.t })), status: g.status, start: g.start,
    seed: g.seed, win: g.win, round: g.round, pub: g.pub, now, idle: now - g.at };
}
async function load(id) { const r = await redis([['GET', `blk:g:${id}`]]); const v = r[0] && r[0].result; return v ? parseJ(v) : null; }
function store(g) { return ['SET', `blk:g:${g.id}`, JSON.stringify(g), 'EX', TTL]; }
function cleanSt(st) {
  if (!st || typeof st !== 'object') return null;
  const n = (v, max) => { v = Math.floor(+v); return isFinite(v) && v >= 0 && v <= max ? v : null; };
  const o = { l: n(st.l, 999), s: n(st.s, 9999), p: n(st.p, 99999), t: n(st.t, 36e5), o: st.o ? 1 : 0, d: st.d ? 1 : 0, b: typeof st.b === 'string' && /^[0-8]{200}$/.test(st.b) ? st.b : '' };
  if (o.l == null || o.s == null || o.p == null || o.t == null) return null;
  return o;
}

async function race(req, res, b, now, ip) {
  if (b.act === 'new') {
    if (await limit(ip, 'n')) return send(res, 429, { error: 'Too many new races from your network: try again in an hour.' });
    const key = newKey(), id = newId();
    const g = { id, names: [name(b.name), null], tok: [sha(key), null], st: [blank(), blank()], status: 'wait', start: 0, seed: newSeed(), win: null, round: 0, pub: b.pub !== false, created: now, at: now };
    const cmds = [['SET', `blk:g:${id}`, JSON.stringify(g), 'EX', TTL, 'NX']];
    if (g.pub) cmds.push(['ZADD', 'blk:lobby', now, id], ['ZREMRANGEBYSCORE', 'blk:lobby', 0, now - LOBBY_MAX_AGE]);
    const r = await redis(cmds);
    if (!r[0] || r[0].result !== 'OK') return send(res, 500, { error: 'Could not make the race: try again.' });
    return send(res, 200, { g: pub(g, now), key, seat: 0 });
  }
  if (!ID_RE.test(String(b.id || ''))) return send(res, 400, { error: 'Bad race id.' });
  if (b.act === 'join') {
    if (await limit(ip, 'j')) return send(res, 429, { error: 'Too many joins from your network: try again later.' });
    const g = await load(b.id);
    if (!g) return send(res, 404, { error: 'Race not found (it may have expired).' });
    if (g.status !== 'wait') return send(res, 409, { error: 'Someone else already joined that race.' });
    const lock = await redis([['SET', `blk:join:${g.id}`, '1', 'NX', 'EX', TTL]]);
    if (!lock[0] || lock[0].result !== 'OK') return send(res, 409, { error: 'Someone else already joined that race.' });
    const key = newKey();
    g.tok[1] = sha(key); g.names[1] = name(b.name); g.status = 'play'; g.start = now + COUNTDOWN; g.seed = newSeed(); g.at = now;
    g.st = [blank(), blank()]; g.st[0].at = g.st[1].at = g.start;
    await redis([store(g), ['ZREM', 'blk:lobby', g.id]]);
    return send(res, 200, { g: pub(g, now), key, seat: 1 });
  }
  if (await limit(ip, 'a')) return send(res, 429, { error: 'Too many requests from your network: slow down a little.' });
  if (!KEY_RE.test(String(b.key || ''))) return send(res, 403, { error: "That isn't your race." });
  const g = await load(b.id);
  if (!g) return send(res, 404, { error: 'Race not found (it may have expired).' });
  const seat = g.tok.indexOf(sha(b.key));
  if (seat < 0) return send(res, 403, { error: "That isn't your race." });
  const stale = b.round != null && +b.round !== g.round;

  if (b.act === 'up') {
    if (stale || g.status !== 'play') return send(res, 200, { g: pub(g, now) });
    const st = cleanSt(b.st);
    if (!st) return send(res, 400, { error: 'Bad state.' });
    if (now < g.start - 1000) return send(res, 200, { g: pub(g, now) });
    st.at = now; g.st[seat] = st; g.at = now;
    if (!g.win) {
      if (st.o) g.win = { p: 1 - seat, why: 'topout' };
      else if (st.d) g.win = { p: seat, why: 'lines' };
      if (g.win) g.status = 'over';
    }
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'leave') {
    if (g.status === 'play' && !stale) { g.status = 'over'; g.win = { p: 1 - seat, why: 'left' }; }
    else if (g.status === 'wait') { await redis([['DEL', `blk:g:${g.id}`], ['ZREM', 'blk:lobby', g.id]]); return send(res, 200, { ok: true }); }
    g.at = now; await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'claim') {
    const other = g.st[1 - seat];
    if (stale || g.status !== 'play' || now - Math.max(other.at || 0, g.start) < CLAIM_MS) return send(res, 409, { error: 'You can claim the win only after the other player has been silent for 20 seconds.', g: pub(g, now) });
    g.status = 'over'; g.win = { p: seat, why: 'timeout' }; g.at = now;
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'rematch') {
    if (stale) return send(res, 200, { g: pub(g, now) });   // the other player was quicker: the new round is already there
    if (g.status !== 'over') return send(res, 409, { error: 'Finish this race first.', g: pub(g, now) });
    if (!g.tok[0] || !g.tok[1]) return send(res, 409, { error: 'The other player has left.', g: pub(g, now) });
    g.round++; g.status = 'play'; g.win = null; g.seed = newSeed(); g.start = now + COUNTDOWN; g.at = now;
    g.st = [blank(), blank()]; g.st[0].at = g.st[1].at = g.start;
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'cancel') {
    if (g.status !== 'wait') return send(res, 409, { error: 'The race has started.' });
    await redis([['DEL', `blk:g:${g.id}`], ['ZREM', 'blk:lobby', g.id]]);
    return send(res, 200, { ok: true });
  }
  return send(res, 400, { error: 'Unknown action.' });
}

/* ---------- leaderboard ---------- */
async function submit(res, b, now, ip) {
  const acct = String(b.acct || ''), trx = String(b.trx || '').toLowerCase();
  if (!ACCT_RE.test(acct)) return send(res, 400, { error: 'Bad account.' });
  if (!TRX_RE.test(trx)) return send(res, 400, { error: 'Bad transaction id.' });
  if (await limit(ip, 's')) return send(res, 429, { error: 'Too many saves from your network: try again in an hour.' });
  const ops = await history(acct);
  if (!ops) return send(res, 502, { error: 'No Hive node answered: try again.' });
  const op = ops.find((o) => o.trx === trx);
  if (!op) return send(res, 404, { error: 'That operation is not on the chain yet: wait a few seconds.' });
  const rec = op.rec;
  if (rec && rec.d !== undefined) {
    const d = String(rec.d), day = Date.parse(d + 'T00:00:00Z');
    if (!/^\d{4}-\d\d-\d\d$/.test(d) || !isFinite(day)) return send(res, 422, { error: 'Bad daily date.' });
    const today = Date.parse(B.utcDate(now) + 'T00:00:00Z');
    if (day > today || day < today - DAY) return send(res, 422, { error: 'The daily race can only be ranked on its day (or the day after).' });
    if (op.ts && (op.ts < day || op.ts > day + 2 * DAY)) return send(res, 422, { error: 'That save is not from the day of the race.' });
  }
  const v = B.verify(rec);
  if (!v.ok) return send(res, 422, { error: v.why });
  if (!v.board) return send(res, 200, { ok: true, board: null, note: 'Marathon games ranked only from level 1.' });
  const mvKey = `blk:mv:${sha(rec.s + '|' + rec.md + '|' + rec.mv).slice(0, 32)}`;
  const own = await redis([['SET', mvKey, acct, 'NX', 'EX', KEEP_DAILY], ['GET', mvKey]]);
  const owner = own[1] && own[1].result;
  if (owner && owner !== acct) return send(res, 409, { error: 'That exact game was already saved by @' + owner + '.' });
  const key = v.board, zk = `blk:lb:${key}`, hk = `blk:r:${key}`;
  const cur = await redis([['ZSCORE', zk, acct]]);
  const old = cur[0] && cur[0].result != null ? +cur[0].result : null;
  const best = old == null || v.rank < old;
  if (best) {
    const row = JSON.stringify({ t: v.t, sc: v.sc, l: v.l, pc: v.pc, trx, ts: op.ts || now });
    const cmds = [['ZADD', zk, v.rank, acct], ['HSET', hk, acct, row]];
    if (key[0] === 'd') cmds.push(['EXPIRE', zk, KEEP_DAILY], ['EXPIRE', hk, KEEP_DAILY]);
    await redis(cmds);
  }
  const r = await redis([['ZRANK', zk, acct], ['ZCARD', zk]]);
  return send(res, 200, { ok: true, board: key, rank: ((r[0] && r[0].result) | 0) + 1, count: (r[1] && r[1].result) | 0, best, t: v.t, sc: v.sc });
}

async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return send(res, 503, { error: 'Online play is not set up yet.' });
  const ip = clientIp(req), now = Date.now();
  if (req.method === 'GET') {
    const q = req.query || {};
    if (await limit(ip, 'r')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
    if (q.lobby) {
      const r = await redis([['ZREVRANGE', 'blk:lobby', 0, 59]]);
      const ids = (r[0] && r[0].result) || [];
      if (!ids.length) return send(res, 200, { open: [] });
      const got = await redis([['MGET', ...ids.map((i) => `blk:g:${i}`)]]);
      const open = [], gone = [];
      ((got[0] && got[0].result) || []).forEach((v, i) => {
        const g = v && parseJ(v);
        if (!g || g.status !== 'wait' || !g.pub || now - g.created > LOBBY_MAX_AGE) { gone.push(ids[i]); return; }
        if (open.length < 30) open.push({ id: g.id, name: g.names[0], age: now - g.created });
      });
      if (gone.length) await redis([['ZREM', 'blk:lobby', ...gone]]);
      return send(res, 200, { open });
    }
    if (q.id) {
      if (!ID_RE.test(String(q.id))) return send(res, 400, { error: 'Bad race id.' });
      const g = await load(q.id);
      if (!g) return send(res, 404, { error: 'Race not found (it may have expired).' });
      return send(res, 200, { g: pub(g, now) });
    }
    if (q.daily) {
      if (!/^\d{4}-\d\d-\d\d$/.test(String(q.daily))) return send(res, 400, { error: 'Bad date.' });
      const r = await redis([['ZCARD', `blk:lb:d:${q.daily}`]]);
      return send(res, 200, { count: (r[0] && r[0].result) | 0 }, 'public, s-maxage=30');
    }
    const key = String(q.board || '');
    if (!BOARD_RE.test(key)) return send(res, 400, { error: 'Bad board.' });
    const n = Math.max(1, Math.min(100, parseInt(q.n, 10) || 25));
    const r = await redis([['ZRANGE', `blk:lb:${key}`, 0, n - 1], ['ZCARD', `blk:lb:${key}`]]);
    const accts = (r[0] && r[0].result) || [];
    let top = [];
    if (accts.length) {
      const d = await redis([['HMGET', `blk:r:${key}`, ...accts]]);
      const rows = (d[0] && d[0].result) || [];
      top = accts.map((a, i) => { const x = parseJ(rows[i]) || {}; return { acct: a, t: x.t, sc: x.sc, l: x.l, pc: x.pc, trx: x.trx, ts: x.ts }; }).filter((x) => typeof x.t === 'number');
    }
    return send(res, 200, { top, count: (r[1] && r[1].result) | 0 }, 'public, s-maxage=15');
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only.' });
  if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(String(req.headers.origin || ''))) return send(res, 403, { error: 'Not allowed from here.' });
  if (!/application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only.' });
  const b = typeof req.body === 'string' ? parseJ(req.body) : req.body;
  if (!b || typeof b !== 'object' || JSON.stringify(b).length > 1024) return send(res, 400, { error: 'Bad request.' });
  if (b.act === 'submit') return submit(res, b, now, ip);
  return race(req, res, b, now, ip);
}
module.exports = handler;
module.exports._test = { pub, name, cleanSt, CLAIM_MS, COUNTDOWN };
