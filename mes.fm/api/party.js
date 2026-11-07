// MES Party (mes.fm/party; an invitation's public address is mes.fm/p/<id>, rewritten to /party?e=<id>).
// Same Upstash Redis as api/poll.js / api/fav.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
// All decisions (validation, who may do what, what a viewer may see) are in _party-lib.js = a byte-identical copy of
// tool_apps_src/party/lib.js; this file only reads / writes Redis and applies the abuse limits.
//
// POST {act:"new", t, d, hn, s, e, z, l, lh, o, th, f, em, po, cap, dl, q, br, mb, gl}  -> {id, key, ...view}
// POST {act:"view", id, gid?, key?}                                                      -> view for this browser / the host
// POST {act:"rsvp", id, gid, s:"y"|"m"|"n"|"x", n, p, c, a, t, hp}                        -> view
// POST {act:"claim", id, gid, it, on}                                                    -> view
// host (key): edit / post {m} / unpost {ti} / hadd {s,n,p,c} / hedit {k,...} / hdel {k} / close {on} / cancel {on} / hclaim {it} / del
//
// Keys: party:<id> (event JSON incl. kh = SHA-256 of the host's key), party:<id>:r (guest key -> reply JSON),
// party:<id>:i (item -> who brings it), party:<id>:ip (salted IP hash -> replies). gid = a random 32-hex browser id, stored only hashed.
// Everything expires two months after the event ends. Limits per salted IP hash per hour: 10 new events, 60 replies, 150 claims,
// 200 host changes, 2,000 views; at most 12 browsers per network per event; Origin https://mes.fm in production; JSON <= 12 KB.
const crypto = require('crypto');
const L = require('./_party-lib.js');

const LIM = { n: 10, r: 60, c: 150, w: 200, v: 2000 };
const ID_RE = /^[a-z0-9]{8}$/;
const HEX_RE = /^[a-f0-9]{32}$/;
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;
const ID_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const MAX_BODY = 12000;

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const salt = () => process.env.RATING_SALT || sha('mes-party|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function newId() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ID_ABC[b[i] % ID_ABC.length]; return s; }

function hashToObj(r) {
  const o = {};
  if (Array.isArray(r)) for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = r[i + 1];
  else if (r && typeof r === 'object') Object.assign(o, r);
  return o;
}
function parseVals(o) { const out = {}; for (const k of Object.keys(o)) { try { out[k] = JSON.parse(o[k]); } catch (e) { /* skip */ } } return out; }

async function load(id) {
  const K = 'party:' + id;
  const [e, r, i, ip] = await redis([['GET', K], ['HGETALL', K + ':r'], ['HGETALL', K + ':i'], ['HGETALL', K + ':ip']]);
  if (!e || !e.result) return null;
  const ipo = hashToObj(ip && ip.result); for (const k of Object.keys(ipo)) ipo[k] = Number(ipo[k]) || 0;
  return { ev: JSON.parse(e.result), r: parseVals(hashToObj(r && r.result)), i: parseVals(hashToObj(i && i.result)), ip: ipo };
}
/** turn lib ops into Redis commands */
function commands(id, st, w) {
  const K = 'party:' + id, cmds = [];
  for (const op of w) {
    if (op[0] === 'del') { cmds.push(['DEL', K, K + ':r', K + ':i', K + ':ip']); return cmds; }
    if (op[0] === 'ev') cmds.push(['SET', K, JSON.stringify(op[1])]);
    else if (op[0] === 'r') cmds.push(op[2] ? ['HSET', K + ':r', op[1], JSON.stringify(op[2])] : ['HDEL', K + ':r', op[1]]);
    else if (op[0] === 'i') cmds.push(op[2] ? ['HSET', K + ':i', op[1], JSON.stringify(op[2])] : ['HDEL', K + ':i', op[1]]);
    else if (op[0] === 'ip') cmds.push(['HINCRBY', K + ':ip', op[1], op[2]]);
  }
  const exp = L.expiresSec(st.ev);
  cmds.push(['EXPIREAT', K, exp], ['EXPIREAT', K + ':r', exp], ['EXPIREAT', K + ':i', exp], ['EXPIREAT', K + ':ip', exp]);
  return cmds;
}
async function limited(kind, ipH) {
  const rl = `party:rl:${kind}:${ipH}:${Math.floor(Date.now() / 3600000)}`;
  const [c] = await redis([['INCR', rl], ['EXPIRE', rl, 4000]]);
  return c && c.result > LIM[kind];
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  try {
    const now = Date.now();
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) { res.status(415).json({ error: 'json only' }); return; }
    if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(String(req.headers.origin || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
    let b = req.body;
    if (typeof b === 'string') { if (b.length > MAX_BODY) b = null; else { try { b = JSON.parse(b); } catch (e) { b = null; } } }
    if (!b || typeof b !== 'object' || Array.isArray(b) || JSON.stringify(b).length > MAX_BODY) { res.status(400).json({ error: 'bad request' }); return; }
    const ipH = sha(salt() + '|' + clientIp(req)).slice(0, 32);
    const act = b.act;

    if (act === 'new') {
      const body = Object.assign({}, b); delete body.act;
      const c = L.cleanEvent(body, now, null);
      if (c.error) { res.status(400).json({ error: c.error }); return; }
      if (await limited('n', ipH)) { res.status(429).json({ error: 'too many new events from your network, try again in an hour' }); return; }
      const key = crypto.randomBytes(16).toString('hex');
      const ev = Object.assign(c.ev, { kh: sha('k|' + key) });
      for (let tries = 0; tries < 4; tries++) {
        const id = newId();
        const out = await redis([['SET', 'party:' + id, JSON.stringify(ev), 'EXAT', L.expiresSec(ev), 'NX']]);
        if (out && out[0] && out[0].result === 'OK') {
          res.status(200).json(Object.assign({ key }, L.view(id, { ev, r: {}, i: {}, ip: {} }, { now, owner: true, bid: '' })));
          return;
        }
      }
      res.status(502).json({ error: 'could not save, try again' });
      return;
    }

    const id = String(b.id || '');
    if (!ID_RE.test(id)) { res.status(404).json({ error: 'event not found' }); return; }
    const kind = act === 'view' ? 'v' : act === 'rsvp' ? 'r' : act === 'claim' ? 'c' : 'w';
    if (await limited(kind, ipH)) { res.status(429).json({ error: 'too many requests from your network, try again later' }); return; }
    const st = await load(id);
    if (!st) { res.status(404).json({ error: 'event not found' }); return; }
    const owner = HEX_RE.test(String(b.key || '')) && sha('k|' + b.key) === st.ev.kh;
    const bid = HEX_RE.test(String(b.gid || '')) ? sha('pg|' + b.gid).slice(0, 32) : '';
    const ctx = { now, owner, bid, ipH, rand: () => crypto.randomBytes(8).toString('hex') };
    const d = L.act(st, b, ctx);
    if (d.error) { res.status(d.code).json({ error: d.error, view: L.view(id, st, ctx) }); return; }
    if (d.w.length) {
      L.apply(st, d.w);
      await redis(commands(id, st.ev ? st : { ev: { s: now, e: 0 } }, d.w));
      if (!st.ev) { res.status(200).json({ ok: true, deleted: true }); return; }
    }
    res.status(200).json(Object.assign({ ok: true }, L.view(id, st, ctx)));
  } catch (e) {
    res.status(500).json({ error: 'error' });
  }
};

module.exports._test = { commands, LIM };
