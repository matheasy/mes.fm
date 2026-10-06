// node tool_apps_src/typing-leaderboard-tests.js -- exercises mes.fm/api/typing-leaderboard.js against an in-memory fake of the Upstash pipeline.
const assert = require('assert');
const kv = new Map(); // key -> {t:'s'|'z'|'h'|'n', v}
function cmd(a) {
  const [c, k, ...r] = a; const C = c.toUpperCase();
  const z = () => { if (!kv.has(k)) kv.set(k, new Map()); return kv.get(k); };
  const sorted = () => [...(kv.get(k) || new Map()).entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1));
  switch (C) {
    case 'SET': kv.set(k, r[0]); return 'OK';
    case 'GETDEL': { const v = kv.get(k); kv.delete(k); return v === undefined ? null : v; }
    case 'INCR': kv.set(k, (Number(kv.get(k)) || 0) + 1); return kv.get(k);
    case 'EXPIRE': return 1;
    case 'LPUSH': { if (!Array.isArray(kv.get(k))) kv.set(k, []); kv.get(k).unshift(r[0]); return kv.get(k).length; }
    case 'LTRIM': { const l = kv.get(k) || []; kv.set(k, l.slice(Number(r[0]), Number(r[1]) + 1)); return 'OK'; }
    case 'LRANGE': return (kv.get(k) || []).slice(Number(r[0]), Number(r[1]) + 1);
    case 'DEL': kv.delete(k); return 1;
    case 'HSET': { if (!kv.has(k)) kv.set(k, new Map()); kv.get(k).set(r[0], r[1]); return 1; }
    case 'HDEL': (kv.get(k) || new Map()).delete(r[0]); return 1;
    case 'HMGET': return r.map((f) => (kv.get(k) || new Map()).get(f) ?? null);
    case 'ZADD': { const m = z(); const [flag, s, id] = r; const sc = Number(s); if (flag === 'GT' && m.has(id) && m.get(id) >= sc) return 0; m.set(id, sc); return 1; }
    case 'ZREM': (kv.get(k) || new Map()).delete(r[0]); return 1;
    case 'ZCARD': return (kv.get(k) || new Map()).size;
    case 'ZSCORE': { const m = kv.get(k); return m && m.has(r[0]) ? String(m.get(r[0])) : null; }
    case 'ZREVRANK': { const i = sorted().findIndex((e) => e[0] === r[0]); return i < 0 ? null : i; }
    case 'ZREVRANGE': return sorted().slice(Number(r[0]), Number(r[1]) + 1).flatMap(([id, s]) => [id, String(s)]);
    case 'ZREMRANGEBYRANK': { const s = sorted(), n = s.length, lo = Number(r[0]), hi = Number(r[1]); const stop = hi < 0 ? n + hi : hi; // ranks are ascending here
      const asc = s.slice().reverse(); asc.slice(lo, stop + 1).forEach(([id]) => kv.get(k).delete(id)); return 1; }
  }
  throw new Error('fake redis: ' + C);
}
global.fetch = async (url, o) => ({ json: async () => JSON.parse(o.body).map((a) => { try { return { result: cmd(a) }; } catch (e) { return { error: e.message }; } }) });
process.env.UPSTASH_REDIS_REST_URL = 'x'; process.env.UPSTASH_REDIS_REST_TOKEN = 'y';
const h = require('../mes.fm/api/typing-leaderboard.js');
const T = h._test;
function call(method, q, body, ip) {
  return new Promise((ok) => { const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, json(b) { ok({ c: this.c, b, h: this.h }); }, end() { ok({ c: this.c }); } };
    h({ method, query: q || {}, body, headers: { 'x-forwarded-for': ip || '1.1.1.1' } }, res); });
}
(async () => {
  assert.deepStrictEqual(T.parseBoard('time-30-medium'), { mode: 'time', len: 30, diff: 'medium' });
  assert.deepStrictEqual(T.parseBoard('tr-120-long'), { mode: 'tr', len: 'long', diff: null, pace: 120 }); assert.strictEqual(T.parseBoard('tr-121-long'), null); assert.strictEqual(T.parseBoard('tr-120-huge'), null);
  assert.strictEqual(T.parseBoard('time-31-medium'), null); assert.strictEqual(T.parseBoard('passage-long').len, 'long'); assert.strictEqual(T.parseBoard('x'), null);
  assert.strictEqual(T.weekLabel(new Date('2026-10-05T12:00:00Z')), '2026-W41'); assert.strictEqual(T.weekLabel(new Date('2026-01-01T00:00:00Z')), '2026-W01'); assert.strictEqual(T.weekLabel(new Date('2024-12-30T00:00:00Z')), '2025-W01');
  assert.deepStrictEqual(T.decode(T.encode(87.4, 96.3)), { w: 87.4, a: 96.3, d: 'k' });
  assert.deepStrictEqual(T.decode(T.encode(122, 100)), { w: 122, a: 100, d: 'k' }); assert.deepStrictEqual(T.decode(T.encode(122, 99.9)), { w: 122, a: 99.9, d: 'k' }); assert(T.encode(122, 100) > T.encode(122, 99.9) && T.encode(122, 100) < T.encode(122.1, 90));
  assert.deepStrictEqual(T.decode(T.encode(122, 100, 'p')), { w: 122, a: 100, d: 'p' }); assert.deepStrictEqual(T.decode(T.encode(80.4, 97.3, 'k')), { w: 80.4, a: 97.3, d: 'k' }); assert.deepStrictEqual(T.decode(T.encode(80.4, 99.9, 'p')), { w: 80.4, a: 99.9, d: 'p' }); assert.deepStrictEqual(T.decode(T.encode(80.4, 100, 't')), { w: 80.4, a: 100, d: 't' }); assert.deepStrictEqual(T.decode(T.encode(80.4, 96.2, 't')), { w: 80.4, a: 96.2, d: 't' });
  assert.strictEqual(T.decode(T.encode(80, 97)).d, 'k'); assert(T.encode(80, 100, 'k') > T.encode(80, 99.9, 'p'));
  assert(T.encode(80, 99) > T.encode(80, 95) && T.encode(81, 90) > T.encode(80, 100));
  const realNow = Date.now; let fake = Math.floor(realNow() / 3600000) * 3600000 + 1000; // start of an hour: the rate-limit bucket must not roll over mid-test
  Date.now = () => fake;
  const pid = 'a1b2c3d4e5f60718', pid2 = '0123456789abcdef';
  const tok = async () => (await call('POST', {}, { a: 'start' })).b.t;
  const sub = async (o, t) => call('POST', {}, Object.assign({ a: 'submit', pid, name: 'Joe', board: 'time-30-medium', wpm: 80, acc: 97, secs: 30, t: t || await tok() }, o));
  // too fast: token younger than the test
  let r = await sub({}); assert.strictEqual(r.c, 400, 'refused without enough elapsed time');
  const t1 = await tok(); fake += 31000;
  r = await sub({}, t1); assert.strictEqual(r.c, 200, JSON.stringify(r.b)); assert.strictEqual(r.b.ranks.all, 1);
  r = await sub({}, t1); assert.strictEqual(r.c, 400, 'token is single use');
  const bad = async (o) => { const t = await tok(); fake += 31000; return (await sub(o, t)).c; };
  assert.strictEqual(await bad({ wpm: 900 }), 400); assert.strictEqual(await bad({ acc: 80 }), 400); assert.strictEqual(await bad({ name: 'x<script>' }), 400);
  assert.strictEqual(await bad({ name: 'f u c k' }), 400); assert.strictEqual(await bad({ board: 'time-31-medium' }), 400); assert.strictEqual(await bad({ secs: 12 }), 400);
  // second player, and a lower re-post by the first must not replace the best
  let t = await tok(); fake += 31000; r = await sub({ pid: pid2, name: 'Ana', wpm: 95, acc: 99 }, t); assert.strictEqual(r.b.ranks.all, 1);
  t = await tok(); fake += 31000; r = await sub({ wpm: 60 }, t);
  const g = await call('GET', { board: 'time-30-medium', period: 'all' });
  assert.strictEqual(g.b.rows.length, 2); assert.deepStrictEqual(g.b.rows.map((x) => [x.r, x.n, x.w, x.a]), [[1, 'Ana', 95, 99], [2, 'Joe', 80, 97]]);
  assert.strictEqual(g.b.total, 2); assert.strictEqual(g.b.resets, null);
  for (const p of ['day', 'week']) assert.strictEqual((await call('GET', { board: 'time-30-medium', period: p })).b.rows.length, 2);
  assert.strictEqual((await call('GET', { board: 'time-30-hard', period: 'all' })).b.rows.length, 0);
  const me = await call('GET', { board: 'time-30-medium', period: 'all', me: pid }); assert.strictEqual(me.b.you.r, 2); assert.strictEqual(me.b.rows[1].me, 1); assert.strictEqual(me.h['Cache-Control'], 'no-store');
  assert.strictEqual((await call('GET', { board: 'nope', period: 'all' })).c, 400);
  const al = await call('GET', { board: 'all', period: 'all', me: pid }); assert.strictEqual(al.c, 200);
  assert.deepStrictEqual(al.b.rows.map((x) => [x.n, x.w, x.b]), [['Ana', 95, 'time-30-medium'], ['Joe', 80, 'time-30-medium']]); assert.strictEqual(al.b.rows[1].me, 1);
  const sm = await call('GET', { summary: '1', period: 'all' }); assert.deepStrictEqual(sm.b.counts, { 'time-30-medium': 2 });
  assert.strictEqual(T.allBoards().length, 43); assert.strictEqual((await call('GET', { summary: '1', period: 'x' })).c, 400);
  // "Only mine": every posted result is remembered, newest first, with a star on the best per test
  const mine = await call('GET', { mine: pid, board: 'all', period: 'all' });
  assert.deepStrictEqual(mine.b.rows.map((x) => [x.w, x.pb]), [[60, undefined], [80, 1]], JSON.stringify(mine.b));
  assert.strictEqual((await call('GET', { mine: pid, board: 'time-30-hard', period: 'all' })).b.rows.length, 0);
  assert.strictEqual((await call('GET', { mine: pid, board: 'all', period: 'day' })).b.rows.length, 2);
  assert.strictEqual((await call('GET', { mine: 'nope', period: 'all' })).c, 400);
  // device: icon data + filter (ranks renumbered inside the filter)
  t = await tok(); fake += 31000; r = await sub({ board: 'time-30-hard', pid: pid2, name: 'Ana', wpm: 70, acc: 97, d: 'p' }, t); assert.strictEqual(r.c, 200);
  t = await tok(); fake += 31000; r = await sub({ board: 'time-30-hard', pid, name: 'Joe', wpm: 90, acc: 96, d: 'k' }, t); assert.strictEqual(r.c, 200);
  let dv = await call('GET', { board: 'time-30-hard', period: 'all' }); assert.deepStrictEqual(dv.b.rows.map((x) => [x.n, x.d]), [['Joe', 'k'], ['Ana', 'p']]);
  dv = await call('GET', { board: 'time-30-hard', period: 'all', dev: 'p' }); assert.deepStrictEqual(dv.b.rows.map((x) => [x.r, x.n, x.d]), [[1, 'Ana', 'p']]); assert.strictEqual(dv.b.total, 1);
  t = await tok(); fake += 31000; r = await sub({ board: 'time-30-hard', pid: 'ffffffffffffffff', name: 'Pad', wpm: 50, acc: 95, d: 't' }, t); assert.strictEqual(r.c, 200);
  dv = await call('GET', { board: 'time-30-hard', period: 'all', dev: 't' }); assert.deepStrictEqual(dv.b.rows.map((x) => [x.n, x.d]), [['Pad', 't']]);
  dv = await call('GET', { board: 'all', period: 'all', dev: 'k' }); assert(dv.b.rows.length >= 1 && dv.b.rows.every((x) => x.d === 'k')); assert.strictEqual(dv.b.rows[0].r, 1);
  assert.strictEqual((await call('GET', { mine: pid, board: 'time-30-hard', period: 'all' })).b.rows[0].d, 'k');
  // transcription boards stay apart from the typing boards
  t = await tok(); fake += 31000; r = await sub({ board: 'tr-120-medium', secs: 30, pid: pid2, name: 'Ana', wpm: 70, acc: 97 }, t); assert.strictEqual(r.c, 200, JSON.stringify(r.b));
  assert.strictEqual((await call('GET', { board: 'tr-all', period: 'all' })).b.rows.length, 1); assert.strictEqual((await call('GET', { board: 'tr-120-medium', period: 'all' })).b.rows[0].n, 'Ana');
  assert.strictEqual((await call('GET', { board: 'all', period: 'all' })).b.rows.every((x) => !x.b.startsWith('tr-')), true);
  assert.deepStrictEqual((await call('GET', { summary: '1', period: 'all', set: 'tr' })).b.counts, { 'tr-120-medium': 1 });
  assert.strictEqual((await call('GET', { mine: pid2, board: 'tr-all', period: 'all' })).b.rows.length, 1); assert.strictEqual((await call('GET', { mine: pid2, board: 'all', period: 'all' })).b.rows.length, 2);
  // remove needs the admin key
  assert.strictEqual((await call('POST', {}, { a: 'remove', key: 'k', pid })).c, 403);
  process.env.TYPING_ADMIN_KEY = 'secret'; assert.strictEqual((await call('POST', {}, { a: 'remove', key: 'wrong!', pid })).c, 403);
  assert.strictEqual((await call('POST', {}, { a: 'remove', key: 'secret', pid })).c, 200);
  assert.strictEqual((await call('GET', { board: 'time-30-medium', period: 'all' })).b.rows.length, 1);
  // rate limit
  for (let i = 0; i < 45; i++) { const tk = await tok(); fake += 31000; r = await sub({ wpm: 50 + i % 3 }, tk); }
  assert.strictEqual(r.c, 429);
  Date.now = realNow;
  console.log('typing leaderboard: all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
