// Leaderboard for mes.fm/typing-test (daily, weekly and all-time boards).
//
// Same Upstash Redis as api/share.js and api/track.js (UPSTASH_REDIS_REST_URL / _TOKEN). One sorted set per
// board + period, member = the player's random id, score = wpm*10 * 1000 + accuracy*10 (so ties on speed are
// broken by accuracy and one number decodes to both). Names live in a hash, id -> name.
//
//   Device: a submit may carry d = "k" (keyboard), "p" (phone) or "t" (tablet). Rows return d ("" for scores posted before this existed); GET ?dev=k|p|t keeps one kind (ranks renumbered).
//   GET  ?summary=1&period=day|week|all                        -> { counts:{ board: players } } (only boards that have scores)
//   GET  ?mine=<id>&board=all|<board>&period=day|week|all     -> { rows:[{t,b,w,a,pb?}] } the player's own posted results, newest first (pb = best on that test)
//   GET  ?board=time-30-medium|all&period=day|week|all[&me=<id>] -> { rows:[{r,n,w,a,b,me?}], total, you:{r,w,a}|null, resets }   (board=all merges every board)
//   POST { a:"start" }                                        -> { t: <one-time token> }  (when a test starts)
//   POST { a:"submit", t, pid, name, board, wpm, acc, secs }   -> { ok, ranks:{day,week,all} }
//   POST { a:"remove", key, pid }  (needs env TYPING_ADMIN_KEY; unset = disabled) -> { ok }
//
// Honest limit: the browser reports its own result, so a determined cheater can still fake a score. What stops
// casual cheating: a one-time token issued when the test started (a score is refused unless about as much
// real time has passed as the test claims to have lasted), a speed ceiling, an accuracy floor, a per-IP rate
// limit, and only the best score per player id per board counts.
//
// Transcription boards (mes.fm/typing-test-transcribe): tr-<pace wpm 80..180>-<short|medium|long>; board=tr-all merges them, kept apart from the typing boards.
// Boards: time 15/30/60/120 s, words 10/25/50/100, passage short/medium/long; time and words per difficulty.
const crypto = require('crypto');

const TR_PACES = [80, 100, 120, 140, 160, 180];
const DIFFS = ['beginner', 'easy', 'medium', 'hard', 'expert'];
const LENS = { time: [15, 30, 60, 120], words: [10, 25, 50, 100], passage: ['short', 'medium', 'long'] };
const MAX_WPM = 350;       // the fastest verified typists are ~300 for a burst
const MIN_ACC = 90;        // percent; a leaderboard of 400 WPM mashing is no use to anyone
const TOP = 100;           // rows returned (the page shows 25 at a time and sorts / filters them)
const TOP_PER_BOARD = 50;  // taken from each board when merging "all tests"
const HIST = 100;          // posted results remembered per player ("Only mine")
const KEEP = 500;          // rows kept per board
const TOKEN_TTL = 1800;    // seconds a test token stays valid
const RATE_PER_HOUR = 40;  // submissions per IP per hour
const NAME_RE = /^[\p{L}\p{N} _.\-]{1,16}$/u;
// Light filter, not a moderation system: the admin "remove" action is the real backstop.
const BAD = /(f+u+c+k|sh[i1]+t|c[u]+nt|n[i1]gg|f[a4]gg|b[i1]tch|wh[o0]re|p[e3]n[i1]s|d[i1]ck|cock|pussy|rape|nazi|hitler|slut)/i;

async function redis(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const out = await res.json();
  if (!Array.isArray(out)) throw new Error('redis');
  return out;
}

function parseBoard(b) {
  const p = String(b || '').split('-');
  if (p[0] === 'tr') { const pace = Number(p[1]); return p.length === 3 && TR_PACES.includes(pace) && LENS.passage.includes(p[2]) ? { mode: 'tr', len: p[2], diff: null, pace } : null; }
  if (p[0] === 'passage') return p.length === 2 && LENS.passage.includes(p[1]) ? { mode: 'passage', len: p[1], diff: null } : null;
  if ((p[0] === 'time' || p[0] === 'words') && p.length === 3) {
    const len = Number(p[1]);
    if (LENS[p[0]].includes(len) && DIFFS.includes(p[2])) return { mode: p[0], len, diff: p[2] };
  }
  return null;
}

// UTC day (2026-10-05) and ISO week (2026-W41) labels; the keys expire on their own.
function dayLabel(d) { return d.toISOString().slice(0, 10); }
function weekLabel(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}
function keyFor(board, period, now) {
  if (period === 'day') return `ttlb:${board}:d:${dayLabel(now)}`;
  if (period === 'week') return `ttlb:${board}:w:${weekLabel(now)}`;
  return `ttlb:${board}:all`;
}
function resetsAt(period, now) {
  if (period === 'day') return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  if (period === 'week') {
    const dow = now.getUTCDay() || 7;
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - dow));
  }
  return null;
}
// Accuracy has 1001 possible values (0.0-100.0) but only 1000 slots below the speed digits, so exactly 100.0 is stored as ...999.5
// (one half above 99.9): it still sorts above 99.9 on a speed tie and older stored scores keep decoding the same.
// Device rides in the fraction too: +0.125 keyboard, +0.25 phone, +0.375 tablet (0 = unknown, i.e. scores posted before the device was recorded).
const encode = (wpm, acc, dev) => { const a = Math.round(acc * 10); return Math.round(wpm * 10) * 1000 + Math.min(999, a) + (a >= 1000 ? 0.5 : 0) + (dev === 't' ? 0.375 : dev === 'p' ? 0.25 : dev === 'k' ? 0.125 : 0); };
const decode = (s) => {
  const base = Math.floor(s / 1000) * 1000, rem = s - base, whole = Math.floor(rem), f = rem - whole, half = f >= 0.5, g = f - (half ? 0.5 : 0);
  return { w: base / 10000, a: whole === 999 && half ? 100 : whole / 10, d: g >= 0.375 ? 't' : g >= 0.25 ? 'p' : g >= 0.125 ? 'k' : '' };
};
const isTr = (b) => String(b).startsWith('tr-');
const allBoards = (tr) => {
  if (tr) { const t = []; for (const pc of TR_PACES) for (const l of LENS.passage) t.push(`tr-${pc}-${l}`); return t; }
  const o = [];
  for (const m of ['time', 'words']) for (const l of LENS[m]) for (const d of DIFFS) o.push(`${m}-${l}-${d}`);
  for (const l of LENS.passage) o.push(`passage-${l}`);
  return o;
};
const ID_RE = /^[a-f0-9]{16}$/;

function clientIp(req) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || String((req.socket && req.socket.remoteAddress) || 'unknown');
}

async function names(ids) {
  if (!ids.length) return [];
  const r = await redis([['HMGET', 'ttlb:names', ...ids]]);
  return (r[0] && r[0].result) || [];
}

async function readBoard(board, period, me, now, dev) {
  const key = keyFor(board, period, now);
  const cmds = [['ZREVRANGE', key, '0', String((dev ? KEEP : TOP) - 1), 'WITHSCORES'], ['ZCARD', key]];
  if (me) cmds.push(['ZREVRANK', key, me], ['ZSCORE', key, me]);
  const r = await redis(cmds);
  const flat = (r[0] && r[0].result) || [];
  const ids = [], scores = [];
  for (let i = 0; i < flat.length; i += 2) { ids.push(flat[i]); scores.push(Number(flat[i + 1])); }
  const keep = ids.map((id, i) => i).filter((i) => !dev || decode(scores[i]).d === dev).slice(0, TOP);
  const nm = await names(keep.map((i) => ids[i]));
  const rows = keep.map((i, k) => ({ r: k + 1, n: nm[k] || 'Anonymous', ...decode(scores[i]), b: board, me: me && ids[i] === me ? 1 : undefined }));
  let you = null;
  if (!dev && me && r[2] && r[2].result !== null && r[2].result !== undefined && r[3] && r[3].result != null) {
    you = { r: Number(r[2].result) + 1, ...decode(Number(r[3].result)) };
  }
  return { rows, total: dev ? rows.length : Number((r[1] && r[1].result) || 0), you, resets: resetsAt(period, now) };
}

// "All tests": the top entries of every board merged by score. Each row says which test it was (b); a person appears once per test.
async function readAll(period, me, now, tr, dev) {
  const boards = allBoards(tr);
  const cmds = [];
  boards.forEach((b) => { const key = keyFor(b, period, now); cmds.push(['ZREVRANGE', key, '0', String((dev ? 150 : TOP_PER_BOARD) - 1), 'WITHSCORES'], ['ZCARD', key]); });
  const r = await redis(cmds);
  const all = []; let total = 0;
  boards.forEach((b, i) => {
    const flat = (r[i * 2] && r[i * 2].result) || [];
    for (let k = 0; k < flat.length; k += 2) all.push({ id: flat[k], s: Number(flat[k + 1]), b });
    total += Number((r[i * 2 + 1] && r[i * 2 + 1].result) || 0);
  });
  all.sort((x, y) => y.s - x.s);
  const top = (dev ? all.filter((x) => decode(x.s).d === dev) : all).slice(0, TOP);
  const nm = await names([...new Set(top.map((x) => x.id))]);
  const byId = {}; [...new Set(top.map((x) => x.id))].forEach((id, i) => { byId[id] = nm[i]; });
  const rows = top.map((x, i) => ({ r: i + 1, n: byId[x.id] || 'Anonymous', ...decode(x.s), b: x.b, me: me && x.id === me ? 1 : undefined }));
  return { rows, total: dev ? rows.length : total, you: null, resets: resetsAt(period, now) };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const now = new Date();
  try {
    if (req.method === 'GET' && req.query.summary) {
      const period = String(req.query.period || 'day');
      if (!['day', 'week', 'all'].includes(period)) { res.status(400).json({ error: 'bad period' }); return; }
      const boards = allBoards(String(req.query.set) === 'tr');
      const r = await redis(boards.map((b) => ['ZCARD', keyFor(b, period, now)]));
      const counts = {};
      boards.forEach((b, i) => { const n = Number(r[i] && r[i].result) || 0; if (n) counts[b] = n; });
      res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=20, stale-while-revalidate=60');
      res.status(200).json({ counts });
      return;
    }
    if (req.method === 'GET' && req.query.mine !== undefined) {
      const pid = String(req.query.mine), period = String(req.query.period || 'all'), board = String(req.query.board || 'all');
      if (!ID_RE.test(pid) || !['day', 'week', 'all'].includes(period) || (board !== 'all' && board !== 'tr-all' && !parseBoard(board))) { res.status(400).json({ error: 'bad request' }); return; }
      const r = await redis([['LRANGE', `ttlb:h:${pid}`, '0', String(HIST - 1)]]);
      const all = (((r[0] && r[0].result) || []).map((x) => { try { return JSON.parse(x); } catch (e) { return null; } })).filter((x) => x && parseBoard(x.b));
      const best = {};
      all.forEach((x) => { if (!(best[x.b] >= x.w)) best[x.b] = x.w; });
      const label = period === 'day' ? dayLabel : weekLabel, cur = label(now);
      const rows = all.filter((x) => (board === 'all' ? !isTr(x.b) : board === 'tr-all' ? isTr(x.b) : x.b === board) && (period === 'all' || label(new Date(x.t)) === cur)).map((x) => ({ t: x.t, b: x.b, w: x.w, a: x.a, d: x.d || '', pb: x.w >= best[x.b] ? 1 : undefined }));
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ rows, total: all.length, mine: true });
      return;
    }
    if (req.method === 'GET') {
      const board = String(req.query.board || '');
      const period = String(req.query.period || 'day');
      const me = ID_RE.test(String(req.query.me || '')) ? String(req.query.me) : '';
      const dev = ['k', 'p', 't'].includes(String(req.query.dev)) ? String(req.query.dev) : '';
      if ((board !== 'all' && board !== 'tr-all' && !parseBoard(board)) || !['day', 'week', 'all'].includes(period)) { res.status(400).json({ error: 'bad board' }); return; }
      const out = (board === 'all' || board === 'tr-all') ? await readAll(period, me, now, board === 'tr-all', dev) : await readBoard(board, period, me, now, dev);
      res.setHeader('Cache-Control', me ? 'no-store' : 'public, max-age=10, s-maxage=20, stale-while-revalidate=60');
      res.status(200).json(out);
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (body.a === 'start') {
      const t = crypto.randomBytes(12).toString('hex');
      const r = await redis([['SET', `ttlb:tok:${t}`, String(Date.now()), 'EX', String(TOKEN_TTL)]]);
      if (!r[0] || r[0].error) { res.status(502).json({ error: 'storage unavailable' }); return; }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ t });
      return;
    }

    if (body.a === 'remove') {
      const admin = process.env.TYPING_ADMIN_KEY;
      const ok = admin && typeof body.key === 'string' && body.key.length === admin.length &&
        crypto.timingSafeEqual(Buffer.from(body.key), Buffer.from(admin));
      if (!ok || !ID_RE.test(String(body.pid || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
      const cmds = [];
      for (const b of allBoards(true)) cmds.push(...['day', 'week', 'all'].map((p) => ['ZREM', keyFor(b, p, now), body.pid]));
      for (const mode of ['time', 'words']) for (const len of LENS[mode]) for (const d of DIFFS) cmds.push(...['day', 'week', 'all'].map((p) => ['ZREM', keyFor(`${mode}-${len}-${d}`, p, now), body.pid]));
      for (const len of LENS.passage) cmds.push(...['day', 'week', 'all'].map((p) => ['ZREM', keyFor(`passage-${len}`, p, now), body.pid]));
      cmds.push(['HDEL', 'ttlb:names', body.pid], ['DEL', `ttlb:h:${body.pid}`]);
      await redis(cmds);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.a !== 'submit') { res.status(400).json({ error: 'bad request' }); return; }
    const cfg = parseBoard(body.board);
    const wpm = Number(body.wpm), acc = Number(body.acc), secs = Number(body.secs);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    if (!cfg || !ID_RE.test(String(body.pid || '')) || !/^[a-f0-9]{24}$/.test(String(body.t || ''))) { res.status(400).json({ error: 'bad request' }); return; }
    if (!NAME_RE.test(name) || BAD.test(name.replace(/[ _.\-]/g, ''))) { res.status(400).json({ error: 'Pick another name: 1-16 letters, numbers, spaces, . _ - (no rude words).' }); return; }
    if (![wpm, acc, secs].every(Number.isFinite) || wpm <= 0 || wpm > MAX_WPM || acc < 0 || acc > 100 || secs <= 0 || secs > 600) { res.status(400).json({ error: 'That result cannot be posted.' }); return; }
    if (acc < MIN_ACC) { res.status(400).json({ error: `Accuracy must be at least ${MIN_ACC}% to join the leaderboard.` }); return; }
    if (cfg.mode === 'time' && Math.abs(secs - cfg.len) > 1) { res.status(400).json({ error: 'That result cannot be posted.' }); return; }

    // Rate limit, then consume the one-time test token and check enough real time has passed.
    const hour = Math.floor(Date.now() / 3600000);
    const rl = await redis([['INCR', `ttlb:rl:${clientIp(req)}:${hour}`], ['EXPIRE', `ttlb:rl:${clientIp(req)}:${hour}`, '3700'], ['GETDEL', `ttlb:tok:${body.t}`]]);
    if (Number(rl[0] && rl[0].result) > RATE_PER_HOUR) { res.status(429).json({ error: 'Too many scores from this connection. Try again later.' }); return; }
    const started = Number(rl[2] && rl[2].result);
    if (!started || Date.now() - started < secs * 1000 * 0.9) { res.status(400).json({ error: 'That test could not be verified. Finish a new test and post it.' }); return; }

    const dev = ['k', 'p', 't'].includes(body.d) ? body.d : '';
    const score = encode(wpm, acc, dev);
    const cmds = [['HSET', 'ttlb:names', body.pid, name]];
    const periods = ['day', 'week', 'all'];
    for (const p of periods) {
      const key = keyFor(body.board, p, now);
      cmds.push(['ZADD', key, 'GT', String(score), body.pid]);
      cmds.push(['ZREMRANGEBYRANK', key, '0', String(-(KEEP + 1))]);
      if (p === 'day') cmds.push(['EXPIRE', key, String(3 * 86400)]);
      if (p === 'week') cmds.push(['EXPIRE', key, String(15 * 86400)]);
    }
    const hk = `ttlb:h:${body.pid}`;
    cmds.push(['LPUSH', hk, JSON.stringify({ t: Date.now(), b: body.board, w: Math.round(wpm * 10) / 10, a: Math.round(acc * 10) / 10, d: dev })], ['LTRIM', hk, '0', String(HIST - 1)], ['EXPIRE', hk, String(400 * 86400)]);
    for (const p of periods) cmds.push(['ZREVRANK', keyFor(body.board, p, now), body.pid]);
    const r = await redis(cmds);
    if (r.some((x) => x && x.error)) { res.status(502).json({ error: 'storage unavailable' }); return; }
    const ranks = {};
    periods.forEach((p, i) => { const v = r[r.length - 3 + i]; ranks[p] = v && v.result !== null && v.result !== undefined ? Number(v.result) + 1 : null; });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, ranks });
  } catch (e) {
    res.status(502).json({ error: 'storage unavailable' });
  }
};

module.exports._test = { allBoards, TR_PACES, parseBoard, weekLabel, dayLabel, encode, decode, NAME_RE, BAD };
