// MES GTA 6 community map (mes.fm/gta-6-map): pins people drop on the map (secrets, animals, fishing spots ...) and up / down votes.
// Same Upstash Redis as api/poll.js / api/fav.js (UPSTASH_REDIS_REST_URL / _TOKEN). Optional env GTA_MAP_ADMIN_KEY (32+ characters) lets the
// owner delete any pin: POST {act:"del", id, admin}.
//
// GET  (no query)                                  -> {pins:[{id,x,y,cat,title,desc,region,clip,m,c,up,dn}], now}   visible pins only
// POST {act:"new", x, y, cat, title, desc, region, clip, vid, t, hp}   -> {id, key, pin}   (key = the maker's delete key; only its SHA-256 is stored)
// POST {act:"vote", id, vid, v: 1 | -1 | 0, t, hp}  -> {up, dn, mine}
// POST {act:"report", id, vid}                     -> {ok}
// POST {act:"del", id, key}                        -> {ok}
// POST {act:"hpin", acct, trx, vid}                -> {id, key, pin}   a pin signed on Hive (custom_json id mes_gtamap, see below)
// POST {act:"hvote", acct, trx, vid}               -> {up, dn, hup, hdn, mine}   a vote signed on Hive (counts HIVE_W = 2)
//
// Hive: the page signs one custom_json (id "mes_gtamap", posting key, Keychain or HiveAuth) = MESGTA.MAP.hivePinJson / hiveVoteJson,
// then sends only the account + transaction id. The server reads the account's recent history from a Hive node, finds that
// operation (posting authority of that account only), runs the same checks as for a guest pin, and refuses a transaction id used
// before and operations older than 2 hours. Pins show "@account"; Hive votes are kept per account (gtam:hv:<id>), counted in
// gtam:hup / gtam:hdn, and replace that browser's guest vote on the pin so nobody counts twice.
//
// Validation (title / description / links / region / clip) is MESGTA.MAP.cleanPin in _gta-lib.js (byte-identical to tool_apps_src/gta/lib.js).
// Abuse limits: JSON only, <= 3 KB, Origin https://mes.fm in production, per salted IP hash per hour: 8 new pins, 300 votes, 30 reports, 40 deletes;
// one vote per browser per pin (browser id stored only as a hash), at most IP_PIN browsers per network per pin, the maker can't vote on their own pin.
// A pin is hidden when its score is -5 or lower, or when REPORTS different networks report it. MAX_PINS pins at most.
const crypto = require('crypto');
const G = require('./_gta-lib.js');
const MAP = G.MAP;

const IP_PIN = 4, REPORTS = 3, MAX_PINS = 5000;
const LIM = { n: 8, v: 300, r: 30, d: 40, h: 120 };
const ACCT_RE = /^[a-z][a-z0-9.-]{2,15}$/;
const TRX_RE = /^[0-9a-f]{40}$/;
const HIVE_NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network'];
const OP_MAX_AGE = 2 * 3600 * 1000;
const MIN_MS = { n: 4000, v: 800 };       // ms on the page before a new pin / a vote counts
const ID_RE = /^[a-z0-9]{8}$/;
const HEX_RE = /^[a-f0-9]{32}$/;
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;
const ID_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const P = 'gtam:';

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const salt = () => process.env.RATING_SALT || sha('mes-gtamap|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function newId() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ID_ABC[b[i] % ID_ABC.length]; return s; }
function hmap(r) {
  const o = {};
  if (Array.isArray(r)) for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = r[i + 1];
  else if (r && typeof r === 'object') Object.assign(o, r);
  return o;
}
/** what anyone may see of a pin */
function pub(id, p, n) {
  const o = { id, x: p.x, y: p.y, cat: p.cat, title: p.title, desc: p.desc, region: p.region, clip: p.clip, m: p.m, c: p.c, up: n.up || 0, dn: n.dn || 0 };
  if (n.hup || n.hdn) { o.hup = n.hup || 0; o.hdn = n.hdn || 0; }
  if (p.ha) { o.ha = p.ha; o.trx = p.trx; }
  return o;
}
function visible(n, rp) { return MAP.scoreOf(n) > -5 && rp < REPORTS; }
async function history(acct) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_account_history', params: [acct, -1, 200, 262144, 0] });
  for (const node of HIVE_NODES) {
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 6000);
      const r = await fetch(node, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ac.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && Array.isArray(j.result)) return MAP.parseHistory(j.result, acct);
    } catch (e) { /* next node */ }
  }
  return null;
}
/** the signed record of transaction trx by acct, or {code, error} */
async function signedOp(acct, trx) {
  if (!ACCT_RE.test(acct)) return { code: 400, error: 'bad Hive account' };
  if (!TRX_RE.test(trx)) return { code: 400, error: 'bad transaction id' };
  const ops = await history(acct);
  if (!ops) return { code: 502, error: 'no Hive node answered, try again' };
  const op = ops.find((o) => o.trx === trx);
  if (!op) return { code: 404, error: 'that operation is not on the chain yet, wait a few seconds' };
  const now = Date.now();
  if (op.ts && (now - op.ts > OP_MAX_AGE || op.ts - now > 5 * 60000)) return { code: 422, error: 'that operation is too old' };
  return { op };
}

async function limited(kind, ipH) {
  const rl = `${P}rl:${kind}:${ipH}:${Math.floor(Date.now() / 3600000)}`;
  const [c] = await redis([['INCR', rl], ['EXPIRE', rl, 4000]]);
  return c && c.result > LIM[kind];
}
async function getPin(id) {
  const [p, u, d, r, hu, hd] = await redis([['HGET', P + 'p', id], ['HGET', P + 'up', id], ['HGET', P + 'dn', id], ['HGET', P + 'rp', id], ['HGET', P + 'hup', id], ['HGET', P + 'hdn', id]]);
  if (!p || !p.result) return null;
  const n = (x) => Math.max(0, Number(x && x.result) || 0);
  return { p: JSON.parse(p.result), up: n(u), dn: n(d), rp: n(r), hup: n(hu), hdn: n(hd) };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  try {
    const now = Date.now();
    if (req.method === 'GET') {
      const [p, u, d, r, hu, hd] = await redis([['HGETALL', P + 'p'], ['HGETALL', P + 'up'], ['HGETALL', P + 'dn'], ['HGETALL', P + 'rp'], ['HGETALL', P + 'hup'], ['HGETALL', P + 'hdn']]);
      const ps = hmap(p && p.result), us = hmap(u && u.result), ds = hmap(d && d.result), rs = hmap(r && r.result), hus = hmap(hu && hu.result), hds = hmap(hd && hd.result);
      const pins = [];
      const num = (x) => Math.max(0, Number(x) || 0);
      for (const id of Object.keys(ps)) {
        let pin; try { pin = JSON.parse(ps[id]); } catch (e) { continue; }
        const n = { up: num(us[id]), dn: num(ds[id]), hup: num(hus[id]), hdn: num(hds[id]) };
        if (visible(n, num(rs[id]))) pins.push(pub(id, pin, n));
      }
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=8, stale-while-revalidate=60');
      res.status(200).json({ pins, now, v: MAP.MAP_V });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) { res.status(415).json({ error: 'json only' }); return; }
    if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(String(req.headers.origin || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
    let b = req.body;
    if (typeof b === 'string') { if (b.length > 3000) b = null; else { try { b = JSON.parse(b); } catch (e) { b = null; } } }
    if (!b || typeof b !== 'object' || Array.isArray(b) || JSON.stringify(b).length > 3000) { res.status(400).json({ error: 'bad request' }); return; }
    const ipH = sha(salt() + '|' + clientIp(req)).slice(0, 32);
    const act = b.act, vid = String(b.vid || '');

    if (act === 'new') {
      if (b.hp) { res.status(200).json({ id: 'zzzzzzzz', key: '0'.repeat(32) }); return; }      // honeypot: pretend it worked
      if (!HEX_RE.test(vid)) { res.status(400).json({ error: 'bad browser id' }); return; }
      if (!(Number(b.t) >= MIN_MS.n)) { res.status(400).json({ error: 'too fast, try again in a moment' }); return; }
      const c = MAP.cleanPin(b);
      if (c.error) { res.status(400).json({ error: c.error }); return; }
      if (await limited('n', ipH)) { res.status(429).json({ error: 'too many new pins from your network, try again in an hour' }); return; }
      const [cnt] = await redis([['HLEN', P + 'p']]);
      if ((Number(cnt && cnt.result) || 0) >= MAX_PINS) { res.status(507).json({ error: 'the map is full for now' }); return; }
      const key = crypto.randomBytes(16).toString('hex');
      const p = Object.assign(c.pin, { c: now, h: sha('k|' + key), vh: sha('gv|' + vid).slice(0, 32) });
      for (let tries = 0; tries < 4; tries++) {
        const id = newId();
        const out = await redis([['HSETNX', P + 'p', id, JSON.stringify(p)]]);
        if (out && out[0] && out[0].result === 1) { res.status(200).json({ id, key, pin: pub(id, p, {}) }); return; }
      }
      res.status(502).json({ error: 'could not save, try again' });
      return;
    }

    if (act === 'hpin' || act === 'hvote') {
      const acct = String(b.acct || ''), trx = String(b.trx || '').toLowerCase();
      if (!HEX_RE.test(vid)) { res.status(400).json({ error: 'bad browser id' }); return; }
      if (await limited('h', ipH)) { res.status(429).json({ error: 'too many Hive saves from your network, try again later' }); return; }
      const so = await signedOp(acct, trx);
      if (so.error) { res.status(so.code).json({ error: so.error }); return; }
      const rec = so.op.rec, bid = sha('gv|' + vid).slice(0, 32);
      if (act === 'hpin') {
        const c = MAP.pinFromRecord(rec);
        if (c.error) { res.status(422).json({ error: c.error }); return; }
        const [cnt] = await redis([['HLEN', P + 'p']]);
        if ((Number(cnt && cnt.result) || 0) >= MAX_PINS) { res.status(507).json({ error: 'the map is full for now' }); return; }
        const [used] = await redis([['SET', P + 'trx:' + trx, 'pin', 'NX', 'EX', 30 * 86400]]);
        if (!used || used.result !== 'OK') { res.status(409).json({ error: 'that Hive operation was already used' }); return; }
        const key = crypto.randomBytes(16).toString('hex');
        const p = Object.assign(c.pin, { c: so.op.ts || Date.now(), h: sha('k|' + key), vh: bid, ha: acct, trx });
        for (let tries = 0; tries < 4; tries++) {
          const nid = newId();
          const out = await redis([['HSETNX', P + 'p', nid, JSON.stringify(p)]]);
          if (out && out[0] && out[0].result === 1) { res.status(200).json({ id: nid, key, pin: pub(nid, p, {}) }); return; }
        }
        res.status(502).json({ error: 'could not save, try again' });
        return;
      }
      const vt = MAP.voteFromRecord(rec);
      if (vt.error) { res.status(422).json({ error: vt.error }); return; }
      const g = await getPin(vt.id);
      if (!g) { res.status(404).json({ error: 'pin not found' }); return; }
      if (g.p.ha === acct || g.p.vh === bid) { res.status(409).json({ error: 'you can’t vote on your own pin' }); return; }
      const [used] = await redis([['SET', P + 'trx:' + trx, 'vote', 'NX', 'EX', 30 * 86400]]);
      if (!used || used.result !== 'OK') { res.status(409).json({ error: 'that Hive operation was already used' }); return; }
      const id2 = vt.id, HK = P + 'hv:' + id2;
      const [prevR, gR] = await redis([['HGET', HK, acct], ['HGET', P + 'v:' + id2, bid]]);
      const prev = Number(prevR && prevR.result) || 0, gprev = Number(gR && gR.result) || 0;
      const cmds = [];
      if (gprev === 1) cmds.push(['HINCRBY', P + 'up', id2, -1]);
      if (gprev === -1) cmds.push(['HINCRBY', P + 'dn', id2, -1]);
      if (gprev) cmds.push(['HSET', P + 'v:' + id2, bid, '0']);
      if (prev === 1) cmds.push(['HINCRBY', P + 'hup', id2, -1]);
      if (prev === -1) cmds.push(['HINCRBY', P + 'hdn', id2, -1]);
      if (vt.v === 1) cmds.push(['HINCRBY', P + 'hup', id2, 1]);
      if (vt.v === -1) cmds.push(['HINCRBY', P + 'hdn', id2, 1]);
      cmds.push(['HSET', HK, acct, String(vt.v)], ['HSET', P + 'hvb:' + id2, bid, acct]);
      cmds.push(['HGET', P + 'up', id2], ['HGET', P + 'dn', id2], ['HGET', P + 'hup', id2], ['HGET', P + 'hdn', id2]);
      const out = await redis(cmds), L = out.length, n = (x) => Math.max(0, Number(x && x.result) || 0);
      res.status(200).json({ up: n(out[L - 4]), dn: n(out[L - 3]), hup: n(out[L - 2]), hdn: n(out[L - 1]), mine: vt.v, hive: true });
      return;
    }

    const id = String(b.id || '');
    if (!ID_RE.test(id)) { res.status(404).json({ error: 'pin not found' }); return; }

    if (act === 'vote') {
      if (b.hp) { res.status(200).json({ ok: true }); return; }
      if (!HEX_RE.test(vid)) { res.status(400).json({ error: 'bad browser id' }); return; }
      if (!(Number(b.t) >= MIN_MS.v)) { res.status(400).json({ error: 'too fast, try again' }); return; }
      const v = b.v;
      if (v !== 1 && v !== -1 && v !== 0) { res.status(400).json({ error: 'bad vote' }); return; }
      const g = await getPin(id);
      if (!g) { res.status(404).json({ error: 'pin not found' }); return; }
      const bid = sha('gv|' + vid).slice(0, 32);
      if (bid === g.p.vh) { res.status(409).json({ error: 'you can’t vote on your own pin' }); return; }
      if (await limited('v', ipH)) { res.status(429).json({ error: 'too many votes from your network, try again later' }); return; }
      const VK = P + 'v:' + id, IK = P + 'vi:' + id;
      const [prevR, ipR] = await redis([['HGET', VK, bid], ['HGET', IK, ipH]]);
      const prev = Number(prevR && prevR.result) || 0;
      if (prev === v) { res.status(200).json({ up: g.up, dn: g.dn, hup: g.hup, hdn: g.hdn, mine: v }); return; }
      if ((await redis([['HEXISTS', P + 'hvb:' + id, bid]]))[0].result === 1) { res.status(409).json({ error: 'this browser already voted on this pin with Hive' }); return; }
      const cmds = [];
      if (!prevR || prevR.result === null || prevR.result === undefined) {
        if ((Number(ipR && ipR.result) || 0) >= IP_PIN) { res.status(409).json({ error: 'this pin already has ' + IP_PIN + ' votes from your network' }); return; }
        cmds.push(['HINCRBY', IK, ipH, 1]);
      }
      if (prev === 1) cmds.push(['HINCRBY', P + 'up', id, -1]);
      if (prev === -1) cmds.push(['HINCRBY', P + 'dn', id, -1]);
      if (v === 1) cmds.push(['HINCRBY', P + 'up', id, 1]);
      if (v === -1) cmds.push(['HINCRBY', P + 'dn', id, 1]);
      cmds.push(['HSET', VK, bid, String(v)], ['HGET', P + 'up', id], ['HGET', P + 'dn', id]);
      const out = await redis(cmds);
      const up = Math.max(0, Number(out[out.length - 2] && out[out.length - 2].result) || 0), dn = Math.max(0, Number(out[out.length - 1] && out[out.length - 1].result) || 0);
      res.status(200).json({ up, dn, hup: g.hup, hdn: g.hdn, mine: v });
      return;
    }

    if (act === 'report') {
      if (!HEX_RE.test(vid)) { res.status(400).json({ error: 'bad browser id' }); return; }
      if (await limited('r', ipH)) { res.status(429).json({ error: 'too many reports from your network, try again later' }); return; }
      const g = await getPin(id);
      if (!g) { res.status(404).json({ error: 'pin not found' }); return; }
      const [add] = await redis([['SADD', P + 'ri:' + id, ipH]]);
      if (add && add.result === 1) await redis([['HINCRBY', P + 'rp', id, 1]]);
      res.status(200).json({ ok: true });
      return;
    }

    if (act === 'del') {
      const admin = process.env.GTA_MAP_ADMIN_KEY;
      const isAdmin = !!admin && admin.length >= 32 && typeof b.admin === 'string' && sha(b.admin) === sha(admin);
      if (!isAdmin && !HEX_RE.test(String(b.key || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
      if (await limited('d', ipH)) { res.status(429).json({ error: 'too many requests, try again later' }); return; }
      const g = await getPin(id);
      if (!g) { res.status(404).json({ error: 'pin not found' }); return; }
      if (!isAdmin && sha('k|' + b.key) !== g.p.h) { res.status(403).json({ error: 'only the person who added this pin can delete it' }); return; }
      await redis([['HDEL', P + 'p', id], ['HDEL', P + 'up', id], ['HDEL', P + 'dn', id], ['HDEL', P + 'rp', id], ['HDEL', P + 'hup', id], ['HDEL', P + 'hdn', id], ['DEL', P + 'v:' + id, P + 'vi:' + id, P + 'ri:' + id, P + 'hv:' + id, P + 'hvb:' + id]]);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'error' });
  }
};

module.exports._test = { pub, visible, IP_PIN, REPORTS, LIM, MIN_MS, OP_MAX_AGE };
