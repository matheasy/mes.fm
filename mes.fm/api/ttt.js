// MES Tic-Tac-Toe online games (mes.fm/tic-tac-toe, "Play online" tab). Guest play, no account.
// Same Upstash Redis as api/fav.js / api/poll.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
// The rules come from _ttt-lib.js, a byte-identical copy of tool_apps_src/tic-tac-toe/lib.js (cp after editing; the tests check).
//
// GET  ?id=<id>                         -> {g}            the game (no keys)
// GET  ?lobby=1                         -> {open:[...]}   public games waiting for a player (newest first, <= 30)
// POST {act:"new", v, name, pub, first} -> {g, key, seat} first = "host" | "guest" | "random" (who plays first, i.e. seat 0)
// POST {act:"join", id, name}           -> {g, key, seat}
// POST {act:"move", id, key, n, m}      -> {g}            n = number of moves the client had (stops double sends), m = move string
// POST {act:"resign"|"leave"|"claim"|"rematch"|"cancel", id, key}
//
// A game: {id, v (game code), names [2], tok [2 sha256 of the seat keys], moves [], status "wait"|"play"|"over", win {p, why}|null,
// round, pub, first, created, at (last activity)}. Kept 6 hours after the last activity (Redis EX). "claim" wins when the other
// player has not moved for CLAIM_MS on their turn. "rematch" swaps the seats (the other player goes first) and starts again.
// Abuse limits: JSON only, <= 2 KB, Origin https://mes.fm in production, per salted IP hash per hour: 30 new games, 120 joins,
// 1,500 moves / actions.
const crypto = require('crypto');
const T = require('./_ttt-lib.js');

const TTL = 6 * 3600;
const CLAIM_MS = 180 * 1000;
const LOBBY_MAX_AGE = 30 * 60 * 1000;
const LIM = { n: 30, j: 120, a: 1500 };
const ID_RE = /^[a-z0-9]{8}$/;
const KEY_RE = /^[A-Za-z0-9_-]{20,64}$/;
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;
const ID_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const salt = () => process.env.RATING_SALT || sha('mes-ttt|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function newId() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ID_ABC[b[i] % ID_ABC.length]; return s; }
function newKey() { return crypto.randomBytes(24).toString('base64url'); }
function name(v) {
  if (typeof v !== 'string') return 'Guest';
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/[​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return s || 'Guest';
}
function pub(g, now) {
  return { id: g.id, v: g.v, names: g.names, moves: g.moves, status: g.status, win: g.win, round: g.round, pub: g.pub, first: g.first, idle: now - g.at };
}
function send(res, code, obj) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(obj); }

async function limit(ip, kind) {
  const k = `ttt:rl:${kind}:${sha(salt() + ip).slice(0, 24)}`;
  const r = await redis([['INCR', k], ['EXPIRE', k, 3600, 'NX']]);
  return (r[0] && r[0].result) > LIM[kind];
}
async function load(id) {
  const r = await redis([['GET', `ttt:g:${id}`]]);
  const v = r[0] && r[0].result;
  return v ? JSON.parse(v) : null;
}
function store(g) { return ['SET', `ttt:g:${g.id}`, JSON.stringify(g), 'EX', TTL]; }

async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return send(res, 503, { error: 'Online games are not set up yet.' });
  const now = Date.now();
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.lobby) {
      const r = await redis([['ZREVRANGE', 'ttt:lobby', 0, 59]]);
      const ids = (r[0] && r[0].result) || [];
      if (!ids.length) return send(res, 200, { open: [] });
      const got = await redis([['MGET', ...ids.map((i) => `ttt:g:${i}`)]]);
      const vals = (got[0] && got[0].result) || [];
      const open = [], stale = [];
      vals.forEach((v, i) => {
        const g = v && JSON.parse(v);
        if (!g || g.status !== 'wait' || !g.pub || now - g.created > LOBBY_MAX_AGE) { stale.push(ids[i]); return; }
        if (open.length < 30) open.push({ id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, age: now - g.created });
      });
      if (stale.length) await redis([['ZREM', 'ttt:lobby', ...stale]]);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ open });
    }
    if (!ID_RE.test(String(q.id || ''))) return send(res, 400, { error: 'Bad game id.' });
    const g = await load(q.id);
    if (!g) return send(res, 404, { error: 'Game not found (it may have expired).' });
    return send(res, 200, { g: pub(g, now) });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only.' });
  const origin = req.headers.origin || '';
  if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(origin)) return send(res, 403, { error: 'Not allowed from here.' });
  if (!/application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only.' });
  const b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return null; } })() : req.body;
  if (!b || typeof b !== 'object' || JSON.stringify(b).length > 2048) return send(res, 400, { error: 'Bad request.' });
  const ip = clientIp(req);

  if (b.act === 'new') {
    if (await limit(ip, 'n')) return send(res, 429, { error: 'Too many new games from your network: try again in an hour.' });
    const c = T.parseCode(b.v);
    if (!c) return send(res, 400, { error: 'Unknown game.' });
    const first = ['host', 'guest', 'random'].includes(b.first) ? b.first : 'host';
    const seat = first === 'guest' ? 1 : first === 'random' ? crypto.randomInt(2) : 0;
    const key = newKey(), names = [null, null], tok = [null, null];
    names[seat] = name(b.name); tok[seat] = sha(key);
    let id = newId();
    const g = { id, v: T.cfgCode(c), names, tok, moves: [], status: 'wait', win: null, round: 0, pub: b.pub !== false, first, created: now, at: now };
    const cmds = [['SET', `ttt:g:${id}`, JSON.stringify(g), 'EX', TTL, 'NX']];
    if (g.pub) cmds.push(['ZADD', 'ttt:lobby', now, id], ['ZREMRANGEBYSCORE', 'ttt:lobby', 0, now - LOBBY_MAX_AGE]);
    const r = await redis(cmds);
    if (!r[0] || r[0].result !== 'OK') return send(res, 500, { error: 'Could not make the game: try again.' });
    return send(res, 200, { g: pub(g, now), key, seat });
  }

  if (!ID_RE.test(String(b.id || ''))) return send(res, 400, { error: 'Bad game id.' });
  if (b.act === 'join') {
    if (await limit(ip, 'j')) return send(res, 429, { error: 'Too many joins from your network: try again later.' });
    const g = await load(b.id);
    if (!g) return send(res, 404, { error: 'Game not found (it may have expired).' });
    if (g.status !== 'wait') return send(res, 409, { error: 'Someone else already joined that game.' });
    // only one joiner can take the seat
    const lock = await redis([['SET', `ttt:join:${g.id}`, '1', 'NX', 'EX', TTL]]);
    if (!lock[0] || lock[0].result !== 'OK') return send(res, 409, { error: 'Someone else already joined that game.' });
    const seat = g.tok[0] ? 1 : 0, key = newKey();
    g.tok[seat] = sha(key); g.names[seat] = name(b.name); g.status = 'play'; g.at = now;
    await redis([store(g), ['ZREM', 'ttt:lobby', g.id]]);
    return send(res, 200, { g: pub(g, now), key, seat });
  }

  if (await limit(ip, 'a')) return send(res, 429, { error: 'Too many requests from your network: slow down a little.' });
  if (!KEY_RE.test(String(b.key || ''))) return send(res, 403, { error: "That isn't your game." });
  const g = await load(b.id);
  if (!g) return send(res, 404, { error: 'Game not found (it may have expired).' });
  const seat = g.tok.indexOf(sha(b.key));
  if (seat < 0) return send(res, 403, { error: "That isn't your game." });

  if (b.act === 'move') {
    if (g.status !== 'play') return send(res, 409, { error: "The game isn't running.", g: pub(g, now) });
    if (b.n !== g.moves.length) return send(res, 409, { error: 'Out of step: the board was refreshed.', g: pub(g, now) });
    const s = T.replay(T.parseCode(g.v), g.moves);
    if (!s || s.turn !== seat) return send(res, 409, { error: "It's not your turn.", g: pub(g, now) });
    const m = T.mparse(b.m);
    if (!T.isLegal(s, m)) return send(res, 400, { error: "That move isn't allowed.", g: pub(g, now) });
    // one move per position: a second request for the same move number loses
    const lock = await redis([['SET', `ttt:mv:${g.id}:${g.round}:${g.moves.length}`, '1', 'NX', 'EX', TTL]]);
    if (!lock[0] || lock[0].result !== 'OK') return send(res, 409, { error: 'Out of step: the board was refreshed.', g: pub(g, now) });
    T.apply(s, m);
    g.moves.push(T.mstr(m)); g.at = now;
    if (s.win) { g.status = 'over'; g.win = { p: s.win.p, why: s.win.why }; }
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'resign' || b.act === 'leave') {
    if (g.status === 'play') { g.status = 'over'; g.win = { p: 1 - seat, why: b.act === 'leave' ? 'left' : 'resign' }; }
    g.at = now;
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'claim') {
    const s = T.replay(T.parseCode(g.v), g.moves);
    if (g.status !== 'play' || !s || s.turn === seat || now - g.at < CLAIM_MS) return send(res, 409, { error: 'You can claim the win only after the other player has been away for 3 minutes on their turn.', g: pub(g, now) });
    g.status = 'over'; g.win = { p: seat, why: 'timeout' }; g.at = now;
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'rematch') {
    if (g.status === 'play' && !g.moves.length && g.round > 0) return send(res, 200, { g: pub(g, now) });  // the other player was quicker
    if (g.status !== 'over') return send(res, 409, { error: 'Finish this game first.', g: pub(g, now) });
    if (!g.tok[0] || !g.tok[1]) return send(res, 409, { error: 'The other player has left.', g: pub(g, now) });
    g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]];
    g.moves = []; g.status = 'play'; g.win = null; g.round++; g.at = now;
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'cancel') {
    if (g.status !== 'wait') return send(res, 409, { error: 'The game has started.' });
    await redis([['DEL', `ttt:g:${g.id}`], ['ZREM', 'ttt:lobby', g.id]]);
    return send(res, 200, { ok: true });
  }
  return send(res, 400, { error: 'Unknown action.' });
}
module.exports = handler;
module.exports._test = { pub, name, CLAIM_MS };
