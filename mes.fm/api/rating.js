// "Rate this page" stars for every public mes.fm page (main_js/rating.js) and the ranking on mes.fm/ratings.
// Same Upstash Redis as api/share.js / api/fav.js (UPSTASH_REDIS_REST_URL / _TOKEN); no new environment variable.
//
// POST {path, stars 1-5, id, t, hp}  -> {ok, count, avg|null, hist|null, mine}
//   path  = the page as the stats / search index write it ("/", "/percentagecalculator"); must be in api/_rating-pages.json
//           (written by build_rating_pages.py from the search index), so only real public pages can collect votes.
//   id    = a random 32-hex browser id kept in localStorage; only its SHA-256 is stored. One vote per browser per page:
//           voting again replaces the old vote (the server knows the old stars, the client cannot fake them).
//   t     = ms the page has been open (must be >= 4000), hp = honeypot field (must be empty).
// GET ?path=<path> -> {count, avg|null, hist|null}   (average and histogram only once a page has MIN ratings)
// GET ?top=1       -> {min, prior, pages:[{p, n, b, avg?, h?}], recent:[{p, t}]}   (b = Bayesian average used for the ranking)
//
// Abuse limits: JSON only, <= 1 KB, Origin must be https://mes.fm in production, 60 votes per IP per hour,
// at most IP_PAGE different browsers per IP per page per 30 days (a school or office shares one address),
// IPs are only ever kept as a salted SHA-256 (salt derived from the Redis token, or RATING_SALT if set).
// No free text is accepted or stored: written feedback goes by the visitor's own email or the contact form.
const crypto = require('crypto');
const PAGES = new Set(require('./_rating-pages.json').p);

const MIN = 5;            // ratings before an average is shown / a page enters "Top rated"
const PRIOR_MEAN = 4;     // Bayesian prior: every page starts as if it had PRIOR_N ratings of PRIOR_MEAN stars
const PRIOR_N = 5;
const PER_HOUR = 60;
const IP_PAGE = 3;
const IP_TTL = 30 * 86400;
const VOTE_TTL = 2 * 365 * 86400;
const MIN_MS = 4000;
const PATH_RE = /^\/(?!\/)[A-Za-z0-9\-_.~%\/]{0,150}$/;
const ID_RE = /^[a-f0-9]{32}$/;
const ORIGINS = /^https:\/\/(www\.)?mes\.fm$/;

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const salt = () => process.env.RATING_SALT || sha('mes-rating|' + process.env.UPSTASH_REDIS_REST_TOKEN);
function clientIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim().slice(0, 64); }

function validPath(p) { return typeof p === 'string' && PATH_RE.test(p) && !p.includes('..') && PAGES.has(p); }

/** {n, s, h1..h5} hash (Redis HGETALL flat array or object) -> numbers */
function parseHash(r) {
  const o = {};
  if (Array.isArray(r)) for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = Number(r[i + 1]) || 0;
  else if (r && typeof r === 'object') for (const k of Object.keys(r)) o[k] = Number(r[k]) || 0;
  const h = [1, 2, 3, 4, 5].map((i) => Math.max(0, o['h' + i] || 0));
  const n = h.reduce((a, b) => a + b, 0);
  const s = h.reduce((a, b, i) => a + b * (i + 1), 0);
  return { n, s, h };
}
function bayes(n, s) { return (s + PRIOR_MEAN * PRIOR_N) / (n + PRIOR_N); }
const r2 = (x) => Math.round(x * 100) / 100;
function summary(st) {
  return { count: st.n, avg: st.n >= MIN ? r2(st.s / st.n) : null, hist: st.n >= MIN ? st.h : null };
}
/** ranking rows, best first: Bayesian average, then more ratings, then path */
function rank(rows) {
  return rows.filter((r) => r.n > 0).map((r) => {
    const o = { p: r.p, n: r.n, b: r2(bayes(r.n, r.s)) };
    if (r.n >= MIN) { o.avg = r2(r.s / r.n); o.h = r.h; }
    return o;
  }).sort((a, b) => b.b - a.b || b.n - a.n || (a.p < b.p ? -1 : 1));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { res.status(503).json({ error: 'not set up' }); return; }
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.top) {
        const [mem, rec] = await redis([['SMEMBERS', 'rt:pages'], ['ZREVRANGE', 'rt:recent', 0, 59, 'WITHSCORES']]);
        const paths = ((mem && mem.result) || []).filter((p) => PAGES.has(p)).slice(0, 2000);
        const got = paths.length ? await redis(paths.map((p) => ['HGETALL', 'rt:p:' + p])) : [];
        const rows = paths.map((p, i) => Object.assign({ p }, parseHash(got[i] && got[i].result)));
        const recent = [], rr = (rec && rec.result) || [];
        for (let i = 0; i + 1 < rr.length; i += 2) if (PAGES.has(rr[i])) recent.push({ p: rr[i], t: Number(rr[i + 1]) || 0 });
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
        res.status(200).json({ min: MIN, prior: [PRIOR_MEAN, PRIOR_N], pages: rank(rows), recent: recent.slice(0, 40) });
        return;
      }
      const p = String(q.path || '');
      if (!validPath(p)) { res.status(404).json({ error: 'not a rateable page' }); return; }
      const [row] = await redis([['HGETALL', 'rt:p:' + p]]);
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
      res.status(200).json(summary(parseHash(row && row.result)));
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

    const ct = String(req.headers['content-type'] || '');
    if (!/^application\/json\b/i.test(ct)) { res.status(415).json({ error: 'json only' }); return; }
    const origin = String(req.headers.origin || '');
    if (process.env.VERCEL_ENV === 'production' && !ORIGINS.test(origin)) { res.status(403).json({ error: 'not allowed' }); return; }
    let body = req.body;
    if (typeof body === 'string') { if (body.length > 1024) body = null; else { try { body = JSON.parse(body); } catch (e) { body = null; } } }
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 1024) { res.status(400).json({ error: 'bad request' }); return; }
    if (body.hp) { res.status(200).json({ ok: true }); return; }          // honeypot: pretend it worked, store nothing
    const stars = Number(body.stars), path = body.path, id = String(body.id || '');
    if (typeof body.stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) { res.status(400).json({ error: 'stars must be 1 to 5' }); return; }
    if (!validPath(path)) { res.status(400).json({ error: 'not a rateable page' }); return; }
    if (!ID_RE.test(id)) { res.status(400).json({ error: 'bad browser id' }); return; }
    if (!(Number(body.t) >= MIN_MS)) { res.status(400).json({ error: 'too fast' }); return; }

    const ipH = sha(salt() + '|' + clientIp(req)).slice(0, 32);
    const bid = sha('b|' + id).slice(0, 32);
    const hour = Math.floor(Date.now() / 3600000), rl = `rt:rl:${ipH}:${hour}`;
    const ipKey = 'rt:ip:' + sha(ipH + '|' + path).slice(0, 32), voteKey = `rt:v:${bid}:${path}`;
    const [cnt, prevRow, seen, nIp] = await redis([['INCR', rl], ['GET', voteKey], ['SISMEMBER', ipKey, bid], ['SCARD', ipKey]]);
    await redis([['EXPIRE', rl, 4000]]);
    if (cnt && cnt.result > PER_HOUR) { res.status(429).json({ error: 'too many ratings, try again later' }); return; }
    const prev = Number(prevRow && prevRow.result) || 0;
    if (!prev && !(seen && seen.result) && (Number(nIp && nIp.result) || 0) >= IP_PAGE) {
      res.status(409).json({ error: 'this page was already rated from your network' });
      return;
    }
    const now = Date.now(), cmds = [];
    if (prev !== stars) {
      if (prev >= 1 && prev <= 5) cmds.push(['HINCRBY', 'rt:p:' + path, 'h' + prev, -1]);
      cmds.push(['HINCRBY', 'rt:p:' + path, 'h' + stars, 1]);
    }
    cmds.push(['SET', voteKey, String(stars), 'EX', VOTE_TTL],
      ['SADD', ipKey, bid], ['EXPIRE', ipKey, IP_TTL],
      ['SADD', 'rt:pages', path],
      ['ZADD', 'rt:recent', now, path], ['ZREMRANGEBYRANK', 'rt:recent', 0, -301],
      ['HGETALL', 'rt:p:' + path]);
    const out = await redis(cmds);
    const last = out && out[out.length - 1];
    res.status(200).json(Object.assign({ ok: true, mine: stars, changed: !!prev && prev !== stars }, summary(parseHash(last && last.result))));
  } catch (e) {
    res.status(500).json({ error: 'error' });
  }
};

module.exports._test = { parseHash, bayes, rank, MIN, PRIOR_MEAN, PRIOR_N };
