// MES Polls owner data (mes.fm/polls-stats). Behind the middleware.js password like /ads and /search-console, so there is no key here.
// Same Upstash Redis as api/poll.js (UPSTASH_REDIS_REST_URL / _TOKEN).
//
// GET                                   -> {now, polls:[..], scanned}   every poll still kept (polls expire 60 days after closing),
//                                          with its counts, reports and report reasons; never the creator's key hash.
// POST {act:"mod", id, do}              -> same as api/poll.js moderation: do = hide | unhide | ok (keep it, clear reports) | del
// POST {act:"rescan"}                   -> find every poll:<id> key again with SCAN and add it to the index
//
// The index is the sorted set poll:all (score = created ms), written by api/poll.js on every new poll. Polls made before it
// existed are found once by a SCAN of poll:* keys (the flag poll:allscan records that it ran). Ids whose poll has expired are
// dropped from the index as they are found.
const poll = require('./poll.js');

const ID_RE = /^[a-z0-9]{8}$/;
const NOT_IDS = new Set(['reported', 'allscan']);   // other 8-letter keys under poll:
const MAX = 5000;
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;

const redis = (cmds) => poll._redis(cmds);

/** pairs list / object from HGETALL -> plain object */
function hobj(r) {
  const o = {};
  if (Array.isArray(r)) for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = r[i + 1];
  else if (r && typeof r === 'object') Object.assign(o, r);
  return o;
}

/** SCAN every poll:<8 letters> key into poll:all; returns how many were found */
async function scanAll() {
  let cursor = '0', found = 0, rounds = 0;
  do {
    const [r] = await redis([['SCAN', cursor, 'MATCH', 'poll:????????', 'COUNT', 1000]]);
    const v = (r && r.result) || ['0', []];
    cursor = String(v[0]);
    const ids = (v[1] || []).map((k) => String(k).slice(5)).filter((id) => ID_RE.test(id) && !NOT_IDS.has(id));
    if (ids.length) {
      const rows = await redis(ids.map((id) => ['GET', 'poll:' + id]));
      const add = [];
      ids.forEach((id, i) => {
        const raw = rows[i] && rows[i].result;
        if (!raw) return;
        let c = 0;
        try { c = Number(JSON.parse(raw).c) || 0; } catch (e) { return; }
        add.push(c, id);
      });
      if (add.length) { await redis([['ZADD', 'poll:all', ...add]]); found += add.length / 2; }
    }
  } while (cursor !== '0' && ++rounds < 500);
  await redis([['SET', 'poll:allscan', String(Date.now())]]);
  return found;
}

/** one poll row for the owner page */
function row(id, raw, cnt, rep, nets, now) {
  let p;
  try { p = JSON.parse(raw); } catch (e) { return null; }
  if (!p || !Array.isArray(p.o)) return null;
  const c = poll._test.counts(cnt, p.o.length);
  const why = {};
  const ro = hobj(rep);
  Object.keys(ro).forEach((k) => { why[ro[k]] = (why[ro[k]] || 0) + 1; });
  return {
    id, q: p.q, d: p.d || '', o: p.o, m: p.m, cl: p.cl || 0, sh: p.sh, ch: !!p.ch, c: p.c, x: p.x || 0, hid: p.hid || 0,
    n: c.n, v: c.v, r: Object.keys(ro).length, nets: Number(nets) || 0, why,
    open: poll._test.isOpen(p, now), closes: poll._test.closesAt(p),
  };
}

async function listAll(now) {
  const [flag] = await redis([['GET', 'poll:allscan']]);
  let scanned = null;
  if (!flag || !flag.result) scanned = await scanAll();
  const [z, rz] = await redis([['ZREVRANGE', 'poll:all', 0, MAX - 1], ['ZRANGE', 'poll:reported', 0, -1]]);
  const ids = Array.from(new Set([].concat((z && z.result) || [], (rz && rz.result) || []))).filter((id) => ID_RE.test(id));
  const polls = [], gone = [];
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const cmds = [];
    part.forEach((id) => { const K = 'poll:' + id; cmds.push(['GET', K], ['HGETALL', K + ':n'], ['HGETALL', K + ':r'], ['HLEN', K + ':rip']); });
    const out = await redis(cmds);
    part.forEach((id, j) => {
      const g = (k) => out[j * 4 + k] && out[j * 4 + k].result;
      const raw = g(0);
      if (!raw) { gone.push(id); return; }
      const rr = row(id, raw, g(1), g(2), g(3), now);
      if (rr) polls.push(rr);
    });
  }
  if (gone.length) await redis([['ZREM', 'poll:all', ...gone], ['ZREM', 'poll:reported', ...gone]]);
  polls.sort((a, b) => b.c - a.c);
  return { now, polls, scanned, gone: gone.length };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  try {
    const now = Date.now();
    if (req.method === 'GET') { res.status(200).json(await listAll(now)); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) { res.status(415).json({ error: 'json only' }); return; }
    if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(String(req.headers.origin || ''))) { res.status(403).json({ error: 'not allowed' }); return; }
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
    if (!b || typeof b !== 'object' || Array.isArray(b)) { res.status(400).json({ error: 'bad request' }); return; }
    if (b.act === 'mod') {
      if (!['hide', 'unhide', 'ok', 'del'].includes(b.do)) { res.status(400).json({ error: 'bad moderation action' }); return; }
      const r = await poll.moderate(String(b.id || ''), b.do, now);
      res.status(r.status).json(r.body);
      return;
    }
    if (b.act === 'rescan') { const found = await scanAll(); res.status(200).json({ ok: true, found }); return; }
    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'error' });
  }
};
module.exports._test = { row, scanAll, listAll, hobj };
