// MES Free Kicks & Penalties online games (mes.fm/free-kick, "Play online" tab). Guest play, no account. Cloned from api/c4.js
// (own Redis prefixes fk: / fkh:). Same Upstash Redis as api/fav.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
// The physics + rules come from _free-kick-lib.js, a byte-identical copy of tool_apps_src/free-kick/lib.js (cp after editing; the tests check).
//
// GET  ?id=<id>                         -> {g}            the game (the pending kick / dive are hidden: only whether they are in)
// GET  ?lobby=1                         -> {open:[...]}   public games waiting for a player
// POST {act:"new", v, name, pub, first} -> {g, key, seat} v = "P" (penalty shootout) | "F" (free-kick match); seat 0 kicks first
// POST {act:"join", id, name}           -> {g, key, seat}
// POST {act:"kick", id, key, n, s}      the kicker's intended shot for kick n (shot string)
// POST {act:"keep", id, key, n, a}      the keeper's dive for kick n (act string), chosen without seeing the shot
// When both are in, the server adds the aim spread (from a secret seed), simulates the kick and adds it to g.kicks.
// POST {act:"resign"|"leave"|"claim"|"rematch"|"cancel", id, key}
//
// Hive games live on the chain (lib.js B.hive, custom_json id mes_fk); this is only an index so players can find each other:
// GET ?hlobby=1, ?hg=<host>/<gid>, ?hrecent=1; POST hopen / hjoin / hcancel {host, g[, acct]}, hrec {acct, g} (a self-reported result
// that replays correctly), hres {host, g} (a finished Hive match: both histories are read and the match is replayed here).
// Abuse limits: JSON only, <= 2 KB, Origin https://mes.fm in production, per salted IP hash per hour: 30 new, 120 joins, 1,500 actions.
const crypto = require('crypto');
const T = require('./_free-kick-lib.js');

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
const salt = () => process.env.RATING_SALT || sha('mes-fk|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function newId() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ID_ABC[b[i] % ID_ABC.length]; return s; }
function newKey() { return crypto.randomBytes(24).toString('base64url'); }
function name(v) {
  if (typeof v !== 'string') return 'Guest';
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/[​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return s || 'Guest';
}
function pub(g, now) {
  return { id: g.id, v: g.v, names: g.names, kicks: g.kicks, pend: { s: !!g.pend.s, a: !!g.pend.a }, status: g.status, win: g.win, round: g.round, pub: g.pub, first: g.first, idle: now - g.at };
}
// the match state (the free-kick spots come from the public id + round, the aim spread from the secret seed)
function stateOf(g) { return T.replay(g.v, g.id + 'r' + g.round, g.kicks.map((k) => k.shot + '/' + k.act)); }
function send(res, code, obj) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(obj); }

async function limit(ip, kind) {
  const k = `fk:rl:${kind}:${sha(salt() + ip).slice(0, 24)}`;
  const r = await redis([['INCR', k], ['EXPIRE', k, 3600, 'NX']]);
  return (r[0] && r[0].result) > LIM[kind];
}
async function load(id) {
  const r = await redis([['GET', `fk:g:${id}`]]);
  const v = r[0] && r[0].result;
  return v ? JSON.parse(v) : null;
}
function store(g) { return ['SET', `fk:g:${g.id}`, JSON.stringify(g), 'EX', TTL]; }

const HIVE_NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network'];
const ACCT_RE = /^[a-z][a-z0-9.-]{2,15}$/;
async function hiveOps(acct) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_account_history', params: [acct, -1, 200, 262144, 0] });
  for (const node of HIVE_NODES) {
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 6000);
      const r = await fetch(node, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ac.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && Array.isArray(j.result)) return T.hive.parse(j.result, acct);
    } catch (e) { /* next node */ }
  }
  return null;
}
async function hiveRec(res, b, now, ip) {
  if (!ACCT_RE.test(String(b.acct || '')) || !T.hive.GID_RE.test(String(b.g || ''))) return send(res, 400, { error: 'Bad Hive result.' });
  if (await limit(ip, 'j')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
  const ops = await hiveOps(b.acct);
  if (!ops) return send(res, 502, { error: 'No Hive node answered: try again.' });
  const rec = T.hive.records(ops).find((o) => o.g === b.g);
  if (!rec) return send(res, 404, { error: 'That operation is not on the chain yet: wait a few seconds.' });
  const item = { acct: rec.acct, g: rec.g, v: rec.v, res: (rec.w < 0 ? 'draw ' : rec.o === 'local' ? 'player ' + (rec.w + 1) + ' won ' : (rec.result === 'w' ? 'won ' : 'lost ') ) + rec.score.join('-') + (rec.o === 'local' ? '' : ' vs ' + rec.o + ' computer'), trx: rec.trx, ts: rec.ts };
  await redis([['ZADD', 'fkh:recs', rec.ts || now, JSON.stringify(item)], ['ZREMRANGEBYRANK', 'fkh:recs', 0, -41]]);
  return send(res, 200, { ok: true });
}
async function hiveRes(res, b, now, ip) {
  if (!ACCT_RE.test(String(b.host || '')) || !T.hive.GID_RE.test(String(b.g || ''))) return send(res, 400, { error: 'Bad Hive game.' });
  if (await limit(ip, 'j')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
  const cur = await redis([['GET', `fkh:g:${b.host}/${b.g}`]]);
  const idx = cur[0] && cur[0].result ? JSON.parse(cur[0].result) : null;
  if (!idx || !idx.joiners.length) return send(res, 404, { error: 'Game not listed.' });
  const a = await hiveOps(b.host), c = await hiveOps(idx.joiners[0]);
  if (!a || !c) return send(res, 502, { error: 'No Hive node answered: try again.' });
  const R = T.hive.build(b.host, b.g, a.concat(c), now);
  if (R.status !== 'over' || !R.win) return send(res, 409, { error: 'That match is not finished on the chain yet.' });
  const item = { host: b.host, guest: R.guest, players: R.players, g: b.g, v: idx.v, score: R.s.score, w: R.win.p, why: R.win.why, trx: R.trx.end };
  await redis([['ZADD', 'fkh:done', now, JSON.stringify(item)], ['ZREMRANGEBYRANK', 'fkh:done', 0, -41]]);
  return send(res, 200, { ok: true, score: R.s.score, win: R.win });
}
async function hiveHandler(req, res, b, now, ip) {
  if (!ACCT_RE.test(String(b.host || '')) || !T.hive.GID_RE.test(String(b.g || ''))) return send(res, 400, { error: 'Bad Hive game.' });
  if (await limit(ip, b.act === 'hopen' ? 'n' : 'j')) return send(res, 429, { error: 'Too many requests from your network: try again later.' });
  const key = `fkh:g:${b.host}/${b.g}`;
  const who = b.act === 'hjoin' ? String(b.acct || '') : b.host;
  if (!ACCT_RE.test(who)) return send(res, 400, { error: 'Bad account.' });
  const ops = await hiveOps(who);
  if (!ops) return send(res, 502, { error: 'No Hive node answered: try again.' });
  const want = b.act === 'hopen' ? 'open' : b.act === 'hjoin' ? 'join' : 'cancel';
  const op = ops.find((o) => o.a === want && o.g === b.g && (want === 'open' || o.h === b.host));
  if (!op) return send(res, 404, { error: 'That operation is not on the chain yet: wait a few seconds.' });
  const cur = await redis([['GET', key]]);
  let g = cur[0] && cur[0].result ? JSON.parse(cur[0].result) : null;
  if (want === 'open') {
    if (now - op.ts > T.hive.OPEN_S * 1000) return send(res, 409, { error: 'That game is too old.' });
    if (!g) g = { host: b.host, g: b.g, v: op.v, f: op.f, to: op.to || null, ts: op.ts, joiners: [], cancelled: false };
    const cmds = [['SET', key, JSON.stringify(g), 'EX', 6 * 3600]];
    if (!g.to && !g.joiners.length && !g.cancelled) cmds.push(['ZADD', 'fkh:lobby', op.ts, `${b.host}/${b.g}`], ['ZREMRANGEBYSCORE', 'fkh:lobby', 0, now - T.hive.OPEN_S * 1000]);
    await redis(cmds);
    return send(res, 200, { ok: true });
  }
  if (!g) return send(res, 404, { error: 'Game not listed.' });
  const cmds = [];
  if (want === 'join') {
    if (g.joiners.indexOf(who) < 0 && g.joiners.length < 5 && who !== g.host && (!g.to || g.to === who)) {
      g.joiners.push(who);
      if (g.joiners.length === 1) cmds.push(['ZADD', 'fkh:recent', op.ts || now, JSON.stringify({ host: g.host, g: g.g, v: g.v, guest: who })], ['ZREMRANGEBYRANK', 'fkh:recent', 0, -41]);
    }
  } else g.cancelled = true;
  await redis([['SET', key, JSON.stringify(g), 'EX', 6 * 3600], ['ZREM', 'fkh:lobby', `${b.host}/${b.g}`], ...cmds]);
  return send(res, 200, { ok: true, joiners: g.joiners });
}

async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL) return send(res, 503, { error: 'Online games are not set up yet.' });
  const now = Date.now();
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.hlobby) {
      const r = await redis([['ZREVRANGE', 'fkh:lobby', 0, 39]]);
      const ids = (r[0] && r[0].result) || [];
      if (!ids.length) return send(res, 200, { open: [] });
      const got = await redis([['MGET', ...ids.map((i) => `fkh:g:${i}`)]]);
      const open = [], stale = [];
      ((got[0] && got[0].result) || []).forEach((v, i) => {
        const g = v && JSON.parse(v);
        if (!g || g.joiners.length || g.cancelled || now - g.ts > T.hive.OPEN_S * 1000) { stale.push(ids[i]); return; }
        open.push({ host: g.host, g: g.g, v: g.v, f: g.f, age: now - g.ts });
      });
      if (stale.length) await redis([['ZREM', 'fkh:lobby', ...stale]]);
      return send(res, 200, { open });
    }
    if (q.hrecent) {
      const r = await redis([['ZREVRANGE', 'fkh:recent', 0, 14, 'WITHSCORES'], ['ZREVRANGE', 'fkh:recs', 0, 14, 'WITHSCORES'], ['ZREVRANGE', 'fkh:done', 0, 14, 'WITHSCORES']]);
      const pairs = (a) => { const out = []; for (let i = 0; i + 1 < (a || []).length; i += 2) { try { out.push([JSON.parse(a[i]), +a[i + 1]]); } catch (e) { /* skip */ } } return out; };
      const games = pairs(r[0] && r[0].result).map(([g, ts]) => ({ host: g.host, guest: g.guest, g: g.g, v: g.v, age: now - ts }));
      const recs = pairs(r[1] && r[1].result).map(([o, ts]) => ({ acct: o.acct, v: o.v, res: o.res, trx: o.trx, age: now - ts }));
      const done = pairs(r[2] && r[2].result).map(([o, ts]) => ({ host: o.host, guest: o.guest, players: o.players, v: o.v, score: o.score, w: o.w, why: o.why, trx: o.trx, age: now - ts }));
      res.setHeader('Cache-Control', 'public, s-maxage=20');
      return res.status(200).json({ games, recs, done });
    }
    if (q.hg) {
      const m = /^([a-z][a-z0-9.-]{2,15})\/([a-z0-9]{8})$/.exec(String(q.hg));
      if (!m) return send(res, 400, { error: 'Bad Hive game.' });
      const r = await redis([['GET', `fkh:g:${m[1]}/${m[2]}`]]);
      const g = r[0] && r[0].result ? JSON.parse(r[0].result) : null;
      return send(res, 200, { joiners: g ? g.joiners : [], listed: !!g });
    }
    if (q.lobby) {
      const r = await redis([['ZREVRANGE', 'fk:lobby', 0, 59]]);
      const ids = (r[0] && r[0].result) || [];
      if (!ids.length) return send(res, 200, { open: [] });
      const got = await redis([['MGET', ...ids.map((i) => `fk:g:${i}`)]]);
      const vals = (got[0] && got[0].result) || [];
      const open = [], stale = [];
      vals.forEach((v, i) => {
        const g = v && JSON.parse(v);
        if (!g || g.status !== 'wait' || !g.pub || now - g.created > LOBBY_MAX_AGE) { stale.push(ids[i]); return; }
        if (open.length < 30) open.push({ id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, age: now - g.created });
      });
      if (stale.length) await redis([['ZREM', 'fk:lobby', ...stale]]);
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
  if (b.act === 'hopen' || b.act === 'hjoin' || b.act === 'hcancel') return hiveHandler(req, res, b, now, ip);
  if (b.act === 'hrec') return hiveRec(res, b, now, ip);
  if (b.act === 'hres') return hiveRes(res, b, now, ip);

  if (b.act === 'new') {
    if (await limit(ip, 'n')) return send(res, 429, { error: 'Too many new games from your network: try again in an hour.' });
    if (!T.onlineMode(b.v)) return send(res, 400, { error: 'Unknown game.' });
    const first = ['host', 'guest', 'random'].includes(b.first) ? b.first : 'host';
    const seat = first === 'guest' ? 1 : first === 'random' ? crypto.randomInt(2) : 0;
    const key = newKey(), names = [null, null], tok = [null, null];
    names[seat] = name(b.name); tok[seat] = sha(key);
    let id = newId();
    const g = { id, v: b.v, names, tok, seed: crypto.randomBytes(12).toString('hex'), kicks: [], pend: { s: null, a: null }, status: 'wait', win: null, round: 0, pub: b.pub !== false, first, created: now, at: now };
    const cmds = [['SET', `fk:g:${id}`, JSON.stringify(g), 'EX', TTL, 'NX']];
    if (g.pub) cmds.push(['ZADD', 'fk:lobby', now, id], ['ZREMRANGEBYSCORE', 'fk:lobby', 0, now - LOBBY_MAX_AGE]);
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
    const lock = await redis([['SET', `fk:join:${g.id}`, '1', 'NX', 'EX', TTL]]);
    if (!lock[0] || lock[0].result !== 'OK') return send(res, 409, { error: 'Someone else already joined that game.' });
    const seat = g.tok[0] ? 1 : 0, key = newKey();
    g.tok[seat] = sha(key); g.names[seat] = name(b.name); g.status = 'play'; g.at = now;
    await redis([store(g), ['ZREM', 'fk:lobby', g.id]]);
    return send(res, 200, { g: pub(g, now), key, seat });
  }

  if (await limit(ip, 'a')) return send(res, 429, { error: 'Too many requests from your network: slow down a little.' });
  if (!KEY_RE.test(String(b.key || ''))) return send(res, 403, { error: "That isn't your game." });
  const g = await load(b.id);
  if (!g) return send(res, 404, { error: 'Game not found (it may have expired).' });
  const seat = g.tok.indexOf(sha(b.key));
  if (seat < 0) return send(res, 403, { error: "That isn't your game." });

  if (b.act === 'kick' || b.act === 'keep') {
    if (g.status !== 'play') return send(res, 409, { error: "The game isn't running.", g: pub(g, now) });
    if (b.n !== g.kicks.length) return send(res, 409, { error: 'Out of step: the game was refreshed.', g: pub(g, now) });
    const s = stateOf(g);
    if (!s || s.win) return send(res, 409, { error: "The game isn't running.", g: pub(g, now) });
    const ks = T.kicker(s);
    if (b.act === 'kick') {
      if (seat !== ks) return send(res, 409, { error: "You're the keeper for this kick.", g: pub(g, now) });
      if (g.pend.s) return send(res, 409, { error: 'You already kicked.', g: pub(g, now) });
      const sh = T.shotParse(b.s);
      if (!sh) return send(res, 400, { error: "That shot isn't allowed.", g: pub(g, now) });
      g.pend.s = T.shotStr(sh);
    } else {
      if (seat === ks) return send(res, 409, { error: "You're the kicker for this kick.", g: pub(g, now) });
      if (g.pend.a) return send(res, 409, { error: 'You already chose your dive.', g: pub(g, now) });
      const a = T.actParse(b.a);
      if (!a) return send(res, 400, { error: "That dive isn't allowed.", g: pub(g, now) });
      g.pend.a = T.actStr(a);
    }
    g.at = now;
    if (g.pend.s && g.pend.a) {
      // one result per kick: a second request for the same kick number loses
      const lock = await redis([['SET', `fk:mv:${g.id}:${g.round}:${g.kicks.length}`, '1', 'NX', 'EX', TTL]]);
      if (!lock[0] || lock[0].result !== 'OK') return send(res, 409, { error: 'Out of step: the game was refreshed.', g: pub(g, now) });
      const aim = T.shotParse(g.pend.s), shot = T.applyError(aim, g.seed + '|' + g.round, g.kicks.length, 1);
      T.apply(s, shot, T.actParse(g.pend.a));
      const k = s.kicks[s.kicks.length - 1];
      k.aim = g.pend.s;
      g.kicks.push(k);
      g.pend = { s: null, a: null };
      if (s.win) { g.status = 'over'; g.win = { p: s.win.p, why: s.win.why }; }
    }
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
    const s = stateOf(g), ks = s ? T.kicker(s) : 0;
    const mineIn = seat === ks ? !!g.pend.s : !!g.pend.a, theirsIn = seat === ks ? !!g.pend.a : !!g.pend.s;
    if (g.status !== 'play' || !s || !mineIn || theirsIn || now - g.at < CLAIM_MS) return send(res, 409, { error: 'You can claim the win only after the other player has been away for 3 minutes on their turn.', g: pub(g, now) });
    g.status = 'over'; g.win = { p: seat, why: 'timeout' }; g.at = now;
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'rematch') {
    if (g.status === 'play' && !g.kicks.length && g.round > 0) return send(res, 200, { g: pub(g, now) });  // the other player was quicker
    if (g.status !== 'over') return send(res, 409, { error: 'Finish this game first.', g: pub(g, now) });
    if (!g.tok[0] || !g.tok[1]) return send(res, 409, { error: 'The other player has left.', g: pub(g, now) });
    g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]];
    g.kicks = []; g.pend = { s: null, a: null }; g.seed = crypto.randomBytes(12).toString('hex'); g.status = 'play'; g.win = null; g.round++; g.at = now;
    await redis([store(g)]);
    return send(res, 200, { g: pub(g, now) });
  }
  if (b.act === 'cancel') {
    if (g.status !== 'wait') return send(res, 409, { error: 'The game has started.' });
    await redis([['DEL', `fk:g:${g.id}`], ['ZREM', 'fk:lobby', g.id]]);
    return send(res, 200, { ok: true });
  }
  return send(res, 400, { error: 'Unknown action.' });
}
module.exports = handler;
module.exports._test = { pub, name, CLAIM_MS, stateOf };
