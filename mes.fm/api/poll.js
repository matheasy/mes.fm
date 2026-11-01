// MES Polls (mes.fm/polls; a poll's public address is mes.fm/v/<id>, rewritten to /polls?p=<id>).
// Same Upstash Redis as api/fav.js / api/rating.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
//
// GET  ?id=<id>                                   -> poll + results when everyone may see them (cached a few seconds while open)
// POST {act:"new", q, d, o:[..], m, cl, sh, ch}    -> {id, key}   (key = the creator's edit key; only its SHA-256 is stored)
// POST {act:"vote", id, vid, picks:[i,..], t, hp} -> {ok, mine, poll}   (vid = random 32-hex browser id; only a hash of it is stored)
// POST {act:"peek", id, vid?, key?}                -> {poll, mine}   (results for a voter of an "after you vote" poll, or for the creator)
// POST {act:"close", id, key}  /  {act:"del", id, key}
//
// Poll fields: q question (<= 200), d description (<= 600), o 2-20 options (<= 100 each, no duplicates), m = most picks a voter may make
// (1 = single choice), cl = closing time in ms (0 = open until the creator closes it; such polls close by themselves after a year),
// sh = who sees the results: "always" | "voted" (after voting) | "closed" (only after it closes), ch = voters may change their vote.
// Abuse limits: JSON only, <= 6 KB, Origin https://mes.fm in production, per salted IP hash: 12 new polls and 40 close / delete per hour,
// 120 votes per hour, 1,500 peeks per hour; one vote per browser per poll and at most IP_POLL browsers per IP per poll.
// Data is kept until 60 days after the poll closes, then Redis expires every key of it.
const crypto = require('crypto');

const IP_POLL = 4;
const LIM = { w: 40, n: 12, v: 120, p: 1500 };
const KEEP = 60 * 86400 * 1000;           // after closing
const MAX_OPEN = 366 * 86400 * 1000;      // a poll can be open at most this long
const MIN_OPEN = 60 * 1000;
const MIN_MS = 1200;                      // ms on the page before a vote counts
const ID_RE = /^[a-z0-9]{8}$/;
const HEX_RE = /^[a-f0-9]{32}$/;
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;
const ID_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const SH = ['always', 'voted', 'closed'];

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const salt = () => process.env.RATING_SALT || sha('mes-poll|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }
function newId() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ID_ABC[b[i] % ID_ABC.length]; return s; }

/** plain text: no control characters (new lines kept where allowed), spaces squeezed, trimmed */
function text(v, max, lines) {
  if (typeof v !== 'string') return null;
  let s = v.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').replace(/[​-‏‪-‮⁦-⁩]/g, '');
  s = lines ? s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : null;
}

/** validate a new poll; returns {poll} or {error} */
function cleanPoll(b, now) {
  const allowed = ['act', 'q', 'd', 'o', 'm', 'cl', 'sh', 'ch'];
  for (const k of Object.keys(b)) if (!allowed.includes(k)) return { error: 'unknown field ' + k.slice(0, 20) };
  const q = text(b.q, 200, false);
  if (!q) return { error: q === '' ? 'type a question' : 'the question is too long (200 characters at most)' };
  const d = b.d === undefined || b.d === '' ? '' : text(b.d, 600, true);
  if (d === null) return { error: 'the description is too long (600 characters at most)' };
  if (!Array.isArray(b.o)) return { error: 'options missing' };
  const o = [], seen = new Set();
  for (const raw of b.o) {
    const s = text(raw, 100, false);
    if (s === null) return { error: 'an option is too long (100 characters at most)' };
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) return { error: 'two options are the same: ' + s };
    seen.add(k); o.push(s);
  }
  if (o.length < 2) return { error: 'add at least two options' };
  if (o.length > 20) return { error: '20 options at most' };
  const m = b.m === undefined ? 1 : b.m;
  if (!Number.isInteger(m) || m < 1 || m > o.length) return { error: 'bad number of picks' };
  const cl = b.cl === undefined ? 0 : b.cl;
  if (!Number.isInteger(cl) || (cl !== 0 && (cl < now + MIN_OPEN || cl > now + MAX_OPEN))) return { error: 'the closing time must be between a minute and a year from now' };
  const sh = b.sh === undefined ? 'always' : b.sh;
  if (!SH.includes(sh)) return { error: 'bad results setting' };
  if (b.ch !== undefined && typeof b.ch !== 'boolean') return { error: 'bad change setting' };
  return { poll: { q, d, o, m, cl, sh, ch: !!b.ch, c: now, x: 0 } };
}

/** when a poll stops taking votes (ms) */
function closesAt(p) { return p.x || p.cl || p.c + MAX_OPEN; }
function isOpen(p, now) { return !p.x && now < (p.cl || p.c + MAX_OPEN); }
function expiresSec(p) { return Math.ceil((closesAt(p) + KEEP) / 1000); }

/** counts hash -> {n:[per option], v voters} */
function counts(r, len) {
  const o = {};
  if (Array.isArray(r)) for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = Number(r[i + 1]) || 0;
  else if (r && typeof r === 'object') for (const k of Object.keys(r)) o[k] = Number(r[k]) || 0;
  const n = [];
  for (let i = 0; i < len; i++) n.push(Math.max(0, o['o' + i] || 0));
  return { n, v: Math.max(0, o.v || 0) };
}
/** what anyone may see; results only when allowed (show = true forces them, for a voter / the creator) */
function publicPoll(id, p, cnt, now, show) {
  const open = isOpen(p, now);
  const vis = show || p.sh === 'always' || !open;
  const out = { id, q: p.q, d: p.d, o: p.o, m: p.m, cl: p.cl, sh: p.sh, ch: p.ch, c: p.c, x: p.x, open, closes: closesAt(p), now, v: cnt.v };
  if (vis) out.n = cnt.n;
  return out;
}
function parsePicks(picks, p) {
  if (!Array.isArray(picks) || !picks.length || picks.length > p.m) return null;
  const s = new Set();
  for (const i of picks) { if (!Number.isInteger(i) || i < 0 || i >= p.o.length || s.has(i)) return null; s.add(i); }
  return Array.from(s).sort((a, b) => a - b);
}

async function getPoll(id) {
  const [row, cnt] = await redis([['GET', 'poll:' + id], ['HGETALL', 'poll:' + id + ':n']]);
  if (!row || !row.result) return null;
  const p = JSON.parse(row.result);
  return { p, cnt: counts(cnt && cnt.result, p.o.length) };
}
async function limited(kind, ipH) {
  const rl = `poll:rl:${kind}:${ipH}:${Math.floor(Date.now() / 3600000)}`;
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
    if (req.method === 'GET') {
      const id = String((req.query || {}).id || '');
      if (!ID_RE.test(id)) { res.status(404).json({ error: 'poll not found' }); return; }
      const g = await getPoll(id);
      if (!g) { res.setHeader('Cache-Control', 'public, s-maxage=10'); res.status(404).json({ error: 'poll not found' }); return; }
      const out = publicPoll(id, g.p, g.cnt, now, false);
      res.setHeader('Cache-Control', out.open ? 'public, max-age=0, s-maxage=3, stale-while-revalidate=10' : 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
      res.status(200).json(out);
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) { res.status(415).json({ error: 'json only' }); return; }
    if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(String(req.headers.origin || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
    let b = req.body;
    if (typeof b === 'string') { if (b.length > 6000) b = null; else { try { b = JSON.parse(b); } catch (e) { b = null; } } }
    if (!b || typeof b !== 'object' || Array.isArray(b) || JSON.stringify(b).length > 6000) { res.status(400).json({ error: 'bad request' }); return; }
    const ipH = sha(salt() + '|' + clientIp(req)).slice(0, 32);
    const act = b.act;

    if (act === 'new') {
      const c = cleanPoll(b, now);
      if (c.error) { res.status(400).json({ error: c.error }); return; }
      if (await limited('n', ipH)) { res.status(429).json({ error: 'too many new polls from your network, try again in an hour' }); return; }
      const key = crypto.randomBytes(16).toString('hex');
      const p = Object.assign(c.poll, { h: sha('k|' + key) });
      for (let tries = 0; tries < 4; tries++) {
        const id = newId();
        const out = await redis([['SET', 'poll:' + id, JSON.stringify(p), 'EXAT', expiresSec(p), 'NX']]);
        if (out && out[0] && out[0].result === 'OK') { res.status(200).json({ id, key, poll: publicPoll(id, p, { n: p.o.map(() => 0), v: 0 }, now, true) }); return; }
      }
      res.status(502).json({ error: 'could not save, try again' });
      return;
    }

    const id = String(b.id || '');
    if (!ID_RE.test(id)) { res.status(404).json({ error: 'poll not found' }); return; }

    if (act === 'vote') {
      if (b.hp) { res.status(200).json({ ok: true }); return; }           // honeypot: pretend it worked
      const vid = String(b.vid || '');
      if (!HEX_RE.test(vid)) { res.status(400).json({ error: 'bad browser id' }); return; }
      if (!(Number(b.t) >= MIN_MS)) { res.status(400).json({ error: 'too fast, try again' }); return; }
      const g = await getPoll(id);
      if (!g) { res.status(404).json({ error: 'poll not found' }); return; }
      const p = g.p;
      if (!isOpen(p, now)) { res.status(409).json({ error: 'this poll is closed', poll: publicPoll(id, p, g.cnt, now, false) }); return; }
      const picks = parsePicks(b.picks, p);
      if (!picks) { res.status(400).json({ error: p.m === 1 ? 'pick one option' : 'pick 1 to ' + p.m + ' options' }); return; }
      if (await limited('v', ipH)) { res.status(429).json({ error: 'too many votes from your network, try again later' }); return; }
      const bid = sha('pv|' + vid).slice(0, 32), K = 'poll:' + id, exp = expiresSec(p);
      const [prevR, ipR] = await redis([['HGET', K + ':b', bid], ['HGET', K + ':ip', ipH]]);
      const prev = prevR && prevR.result ? String(prevR.result).split(',').map(Number) : null;
      const val = picks.join(',');
      const cmds = [];
      if (prev) {
        if (!p.ch) { res.status(409).json({ error: 'you already voted in this poll', mine: prev, poll: publicPoll(id, p, g.cnt, now, p.sh === 'voted') }); return; }
        if (prev.join(',') !== val) {
          cmds.push(['HSET', K + ':b', bid, val]);
          for (const i of prev) if (!picks.includes(i)) cmds.push(['HINCRBY', K + ':n', 'o' + i, -1]);
          for (const i of picks) if (!prev.includes(i)) cmds.push(['HINCRBY', K + ':n', 'o' + i, 1]);
        }
      } else {
        if ((Number(ipR && ipR.result) || 0) >= IP_POLL) { res.status(409).json({ error: 'this poll already has ' + IP_POLL + ' votes from your network (school, office or phone network)' }); return; }
        const [nx] = await redis([['HSETNX', K + ':b', bid, val]]);
        if (!nx || nx.result !== 1) { res.status(409).json({ error: 'you already voted in this poll' }); return; }
        for (const i of picks) cmds.push(['HINCRBY', K + ':n', 'o' + i, 1]);
        cmds.push(['HINCRBY', K + ':n', 'v', 1], ['HINCRBY', K + ':ip', ipH, 1]);
      }
      cmds.push(['EXPIREAT', K + ':n', exp], ['EXPIREAT', K + ':b', exp], ['EXPIREAT', K + ':ip', exp], ['HGETALL', K + ':n']);
      const out = await redis(cmds);
      const cnt = counts(out[out.length - 1] && out[out.length - 1].result, p.o.length);
      res.status(200).json({ ok: true, mine: picks, changed: !!prev, poll: publicPoll(id, p, cnt, now, p.sh !== 'closed') });
      return;
    }

    if (act === 'peek') {
      if (await limited('p', ipH)) { res.status(429).json({ error: 'too many requests, try again later' }); return; }
      const g = await getPoll(id);
      if (!g) { res.status(404).json({ error: 'poll not found' }); return; }
      const owner = HEX_RE.test(String(b.key || '')) && sha('k|' + b.key) === g.p.h;
      let mine = null;
      if (HEX_RE.test(String(b.vid || ''))) {
        const [r] = await redis([['HGET', 'poll:' + id + ':b', sha('pv|' + b.vid).slice(0, 32)]]);
        if (r && r.result) mine = String(r.result).split(',').map(Number);
      }
      const show = owner || (!!mine && g.p.sh === 'voted');
      res.status(200).json({ poll: publicPoll(id, g.p, g.cnt, now, show), mine, owner });
      return;
    }

    if (act === 'close' || act === 'del') {
      if (!HEX_RE.test(String(b.key || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
      if (await limited('w', ipH)) { res.status(429).json({ error: 'too many requests, try again later' }); return; }
      const g = await getPoll(id);
      if (!g) { res.status(404).json({ error: 'poll not found' }); return; }
      if (sha('k|' + b.key) !== g.p.h) { res.status(403).json({ error: 'only the person who made this poll can do that' }); return; }
      const K = 'poll:' + id;
      if (act === 'del') { await redis([['DEL', K, K + ':n', K + ':b', K + ':ip']]); res.status(200).json({ ok: true }); return; }
      const p = g.p;
      if (!p.x) p.x = Math.min(now, closesAt(p));
      const exp = expiresSec(p);
      await redis([['SET', K, JSON.stringify(p), 'EXAT', exp], ['EXPIREAT', K + ':n', exp], ['EXPIREAT', K + ':b', exp], ['EXPIREAT', K + ':ip', exp]]);
      res.status(200).json({ ok: true, poll: publicPoll(id, p, g.cnt, now, true) });
      return;
    }
    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'error' });
  }
};

module.exports._test = { cleanPoll, counts, publicPoll, parsePicks, isOpen, closesAt, text, IP_POLL, LIM, KEEP, MAX_OPEN };
