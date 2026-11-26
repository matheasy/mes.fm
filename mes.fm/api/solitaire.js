// MES Solitaire leaderboard (mes.fm/solitaire, "Leaderboard" tab). Only wins saved on the Hive blockchain are listed, and only after
// this function has read the operation back from a Hive node and replayed every move with the shared rules.
// Same Upstash Redis as api/mines.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
// The rules come from _solitaire-lib.js, a byte-identical copy of tool_apps_src/solitaire/lib.js (cp after editing; the tests check).
//
// GET  ?board=<key>&n=<1-100>   -> {top:[{acct, t, c, sc, u, trx, ts}], count}   key = "d:YYYY-MM-DD:<k1|s1|f4>" (daily deal, per UTC
//                                   day) or "a:<variant>" (any deal of that game, all time)
// GET  ?daily=YYYY-MM-DD        -> {k1, s1, f4}   players with a verified time on that day's deals
// POST {act:"submit", acct, trx} -> {board, rank, count, best}
//   The server reads acct's recent account history (custom_json only), finds the mes_solitaire operation of transaction trx signed
//   with acct's posting authority and runs MESSolitaire.verify() on it: every move legal on that deal, the game won, the time equal to
//   the sum of the move times and not faster than a person can play. Daily deals: the date must be today or yesterday (UTC), the
//   operation from that day, and the deal the canonical one (worked out once per day and cached). Ranking = time, then moves.
//   An exact copy of someone else's moves is refused. One entry per account per board: the best stays.
// Abuse limits: JSON only, <= 512 bytes, Origin https://mes.fm in production, per salted IP hash per hour 60 submits, 3,000 reads.
const crypto = require('crypto');
const M = require('./_solitaire-lib.js');

const LIM = { s: 60, r: 3000 };
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;
const ACCT_RE = /^[a-z][a-z0-9.-]{2,15}$/;
const TRX_RE = /^[0-9a-f]{40}$/;
const BOARD_RE = /^(d:\d{4}-\d\d-\d\d:(k1|s1|f4)|a:(k1|k3|k3p|s1|s2|s4|f4|f3|f2))$/;
const DAY = 86400000;
const KEEP_DAILY = 400 * 86400;
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
const salt = () => process.env.RATING_SALT || sha('mes-solitaire|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function send(res, code, obj, cache) { res.setHeader('Cache-Control', cache || 'no-store'); res.status(code).json(obj); }
async function limit(ip, kind) {
  const k = `sol:rl:${kind}:${sha(salt() + ip).slice(0, 24)}`;
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
      if (j && Array.isArray(j.result)) return M.parseHistory(j.result, acct);
    } catch (e) { /* next node */ }
  }
  return null;
}
/** the canonical deal of a day (the Klondike solver runs once, then it is cached) */
async function dailySeed(d, v) {
  const k = `sol:ds:${d}:${v}`;
  const r = await redis([['GET', k]]);
  const s = r[0] && r[0].result;
  if (s != null) return String(s);
  const c = M.dailyCanon(d, v);
  await redis([['SET', k, c.seed, 'EX', KEEP_DAILY]]);
  return c.seed;
}
function parseRow(s) { try { return JSON.parse(s); } catch (e) { return null; } }
// rank = time, then moves: score = ms * 1000 + moves (moves are < 1000 in practice)
const rankScore = (t, c) => t * 1000 + Math.min(c, 999);

async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return send(res, 503, { error: 'The leaderboard is not set up yet.' });
  const ip = clientIp(req);
  if (req.method === 'GET') {
    const q = req.query || {};
    if (await limit(ip, 'r')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
    if (q.daily) {
      if (!/^\d{4}-\d\d-\d\d$/.test(String(q.daily))) return send(res, 400, { error: 'Bad date.' });
      const r = await redis(M.DAILY.map((v) => ['ZCARD', `sol:lb:d:${q.daily}:${v}`]));
      const out = {};
      M.DAILY.forEach((v, i) => { out[v] = (r[i] && r[i].result) | 0; });
      return send(res, 200, out, 'public, s-maxage=30');
    }
    const key = String(q.board || '');
    if (!BOARD_RE.test(key)) return send(res, 400, { error: 'Bad board.' });
    const n = Math.max(1, Math.min(100, parseInt(q.n, 10) || 25));
    const r = await redis([['ZRANGE', `sol:lb:${key}`, 0, n - 1], ['ZCARD', `sol:lb:${key}`]]);
    const accts = (r[0] && r[0].result) || [];
    let top = [];
    if (accts.length) {
      const d = await redis([['HMGET', `sol:r:${key}`, ...accts]]);
      const rows = (d[0] && d[0].result) || [];
      top = accts.map((a, i) => { const x = parseRow(rows[i]) || {}; return { acct: a, t: x.t, c: x.c, sc: x.sc, u: x.u, trx: x.trx, ts: x.ts }; }).filter((x) => typeof x.t === 'number');
    }
    return send(res, 200, { top, count: (r[1] && r[1].result) | 0 }, 'public, s-maxage=15');
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only.' });
  if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(String(req.headers.origin || ''))) return send(res, 403, { error: 'Not allowed from here.' });
  if (!/application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only.' });
  const b = typeof req.body === 'string' ? parseRow(req.body) : req.body;
  if (!b || typeof b !== 'object' || JSON.stringify(b).length > 512 || b.act !== 'submit') return send(res, 400, { error: 'Bad request.' });
  const acct = String(b.acct || ''), trx = String(b.trx || '').toLowerCase();
  if (!ACCT_RE.test(acct)) return send(res, 400, { error: 'Bad account.' });
  if (!TRX_RE.test(trx)) return send(res, 400, { error: 'Bad transaction id.' });
  if (await limit(ip, 's')) return send(res, 429, { error: 'Too many saves from your network: try again in an hour.' });

  const ops = await history(acct);
  if (!ops) return send(res, 502, { error: 'No Hive node answered: try again.' });
  const op = ops.find((o) => o.trx === trx);
  if (!op) return send(res, 404, { error: 'That operation is not on the chain yet: wait a few seconds.' });
  const rec = op.rec, now = Date.now();
  let ds = null;
  if (rec && rec.d !== undefined) {
    const d = String(rec.d), day = Date.parse(d + 'T00:00:00Z');
    if (!/^\d{4}-\d\d-\d\d$/.test(d) || !isFinite(day) || M.DAILY.indexOf(rec.k) < 0) return send(res, 422, { error: 'Bad daily date.' });
    const today = Date.parse(M.utcDate(now) + 'T00:00:00Z');
    if (day > today || day < today - DAY) return send(res, 422, { error: 'Daily deals can only be ranked on their day (or the day after).' });
    if (op.ts && (op.ts < day || op.ts > day + 2 * DAY)) return send(res, 422, { error: 'That save is not from the day of the deal.' });
    ds = await dailySeed(d, rec.k);
  }
  const v = M.verify(rec, { dailySeed: ds });
  if (!v.ok) return send(res, 422, { error: v.why });

  const mvKey = `sol:mv:${sha(rec.k + '|' + rec.s + '|' + rec.mv).slice(0, 32)}`;
  const own = await redis([['SET', mvKey, acct, 'NX', 'EX', KEEP_DAILY], ['GET', mvKey]]);
  const owner = own[1] && own[1].result;
  if (owner && owner !== acct) return send(res, 409, { error: 'Those exact moves were already saved by @' + owner + '.' });

  const key = v.board, zk = `sol:lb:${key}`, hk = `sol:r:${key}`, score = rankScore(v.t, v.c);
  const cur = await redis([['ZSCORE', zk, acct]]);
  const old = cur[0] && cur[0].result != null ? +cur[0].result : null;
  const best = old == null || score < old;
  if (best) {
    const row = JSON.stringify({ t: v.t, c: v.c, sc: v.sc, u: rec.u | 0, trx, ts: op.ts || now });
    const cmds = [['ZADD', zk, score, acct], ['HSET', hk, acct, row]];
    if (key[0] === 'd') cmds.push(['EXPIRE', zk, KEEP_DAILY], ['EXPIRE', hk, KEEP_DAILY]);
    await redis(cmds);
  }
  const r = await redis([['ZRANK', zk, acct], ['ZCARD', zk]]);
  return send(res, 200, { ok: true, board: key, rank: ((r[0] && r[0].result) | 0) + 1, count: (r[1] && r[1].result) | 0, best, t: v.t });
}
module.exports = handler;
