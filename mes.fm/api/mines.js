// MES Minesweeper leaderboard (mes.fm/minesweeper, "Leaderboard" tab). Only wins saved on the Hive blockchain are listed, and only
// after this function has read the operation back from a Hive node and replayed every click with the shared rules.
// Same Upstash Redis as api/fav.js / api/poll.js / api/ttt.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
// The rules come from _mines-lib.js, a byte-identical copy of tool_apps_src/minesweeper/lib.js (cp after editing; the tests check).
//
// GET  ?board=<key>&n=<1-100>   -> {top:[{acct, t, b, eff, trx, ts}], count}   key = "d:YYYY-MM-DD:<b|i|e>" (daily, per UTC day),
//                                   "a:<l>" (random boards, all time), "n:<l>" (random no-guess boards, all time)
// GET  ?daily=YYYY-MM-DD        -> {b, i, e}   players with a verified time on that day's boards
// POST {act:"submit", acct, trx} -> {board, rank, count, best} | {board:null, note} (checked but unranked: custom size / hint used)
//   The server reads acct's recent account history (custom_json only), finds the mes_mines operation of transaction trx signed with
//   acct's posting authority, and runs MESMines.verify() on its record: same board from (seed, size, first click, no-guess attempt),
//   every move must do something, the game must end won, time / 3BV / click count must match, at most 20 3BV per second.
//   Daily boards: the date must be today or yesterday (UTC), the operation not older than that day, and the no-guess attempt the
//   canonical one (worked out once per board and cached). An exact copy of someone else's moves on a board is refused.
//   One entry per account per board: the best time stays.
// Abuse limits: JSON only, <= 512 bytes, Origin https://mes.fm in production, per salted IP hash per hour 60 submits, 3,000 reads.
const crypto = require('crypto');
const M = require('./_mines-lib.js');

const LIM = { s: 60, r: 3000 };
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;
const ACCT_RE = /^[a-z][a-z0-9.-]{2,15}$/;
const TRX_RE = /^[0-9a-f]{40}$/;
const BOARD_RE = /^(d:\d{4}-\d\d-\d\d:[bie]|[an]:[bie])$/;
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
const salt = () => process.env.RATING_SALT || sha('mes-mines|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function send(res, code, obj, cache) { res.setHeader('Cache-Control', cache || 'no-store'); res.status(code).json(obj); }
async function limit(ip, kind) {
  const k = `mines:rl:${kind}:${sha(salt() + ip).slice(0, 24)}`;
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
/** the canonical no-guess attempt of a daily board (worked out once, then cached in Redis) */
async function dailyG(d, l) {
  const k = `mines:dg:${d}:${l}`;
  const r = await redis([['GET', k]]);
  const v = r[0] && r[0].result;
  if (v != null) return +v;
  const L = M.LEVELS[l];
  const ng = M.noGuess(M.dailySeed(d, l), L.w, L.h, L.m, M.dailyFirst(d, l));
  await redis([['SET', k, String(ng.g), 'EX', KEEP_DAILY]]);
  return ng.g;
}
function parseRow(s) { try { return JSON.parse(s); } catch (e) { return null; } }

async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return send(res, 503, { error: 'The leaderboard is not set up yet.' });
  const ip = clientIp(req);
  if (req.method === 'GET') {
    const q = req.query || {};
    if (await limit(ip, 'r')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
    if (q.daily) {
      if (!/^\d{4}-\d\d-\d\d$/.test(String(q.daily))) return send(res, 400, { error: 'Bad date.' });
      const r = await redis(['b', 'i', 'e'].map((l) => ['ZCARD', `mines:lb:d:${q.daily}:${l}`]));
      return send(res, 200, { b: (r[0] && r[0].result) | 0, i: (r[1] && r[1].result) | 0, e: (r[2] && r[2].result) | 0 }, 'public, s-maxage=30');
    }
    const key = String(q.board || '');
    if (!BOARD_RE.test(key)) return send(res, 400, { error: 'Bad board.' });
    const n = Math.max(1, Math.min(100, parseInt(q.n, 10) || 25));
    const r = await redis([['ZRANGE', `mines:lb:${key}`, 0, n - 1], ['ZCARD', `mines:lb:${key}`]]);
    const accts = (r[0] && r[0].result) || [];
    let top = [];
    if (accts.length) {
      const d = await redis([['HMGET', `mines:r:${key}`, ...accts]]);
      const rows = (d[0] && d[0].result) || [];
      top = accts.map((a, i) => { const x = parseRow(rows[i]) || {}; return { acct: a, t: x.t, b: x.b, eff: x.eff, trx: x.trx, ts: x.ts }; }).filter((x) => typeof x.t === 'number');
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
  let dg = null;
  if (rec && rec.d !== undefined) {
    const d = String(rec.d), day = Date.parse(d + 'T00:00:00Z');
    if (!/^\d{4}-\d\d-\d\d$/.test(d) || !isFinite(day) || !M.LEVELS[rec.l]) return send(res, 422, { error: 'Bad daily date.' });
    const today = Date.parse(M.utcDate(now) + 'T00:00:00Z');
    if (day > today || day < today - DAY) return send(res, 422, { error: 'Daily boards can only be ranked on their day (or the day after).' });
    if (op.ts && (op.ts < day || op.ts > day + 2 * DAY)) return send(res, 422, { error: 'That save is not from the day of the board.' });
    dg = await dailyG(d, rec.l);
    if (dg < 0) return send(res, 422, { error: 'That daily board could not be checked.' });
  }
  const v = M.verify(rec, { dailyG: dg });
  if (!v.ok) return send(res, 422, { error: v.why });
  if (!v.board) return send(res, 200, { ok: true, board: null, note: rec.a ? 'A hint was used, so it is not ranked.' : 'Custom sizes are not ranked.' });

  // an exact copy of someone else's moves on the same board is not a new game
  const mvKey = `mines:mv:${sha(rec.s + '|' + rec.mv).slice(0, 32)}`;
  const own = await redis([['SET', mvKey, acct, 'NX', 'EX', KEEP_DAILY], ['GET', mvKey]]);
  const owner = own[1] && own[1].result;
  if (owner && owner !== acct) return send(res, 409, { error: 'Those exact moves were already saved by @' + owner + '.' });

  const key = v.board, zk = `mines:lb:${key}`, hk = `mines:r:${key}`;
  const cur = await redis([['ZSCORE', zk, acct]]);
  const old = cur[0] && cur[0].result != null ? +cur[0].result : null;
  const best = old == null || v.t < old;
  if (best) {
    const row = JSON.stringify({ t: v.t, b: v.b, eff: v.eff, trx, ts: op.ts || now });
    const cmds = [['ZADD', zk, v.t, acct], ['HSET', hk, acct, row]];
    if (key[0] === 'd') cmds.push(['EXPIRE', zk, KEEP_DAILY], ['EXPIRE', hk, KEEP_DAILY]);
    await redis(cmds);
  }
  const r = await redis([['ZRANK', zk, acct], ['ZCARD', zk]]);
  return send(res, 200, { ok: true, board: key, rank: ((r[0] && r[0].result) | 0) + 1, count: (r[1] && r[1].result) | 0, best, t: v.t });
}
module.exports = handler;
