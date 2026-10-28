// Tests for MES March Madness: node tool_apps_src/march-madness-tests.js
// lib.js (structure, ESPN normaliser on recorded 2026 scoreboards, picks, model, scoring, encoding), the committed snapshots,
// the bracket function with a mocked fetch and the leaderboard function with a fake Redis.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = require('./march-madness/lib.js');
let pass = 0;
function t(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; }, (e) => { console.error('FAIL', name, '\n ', e && e.stack || e); process.exitCode = 1; }); }
const API = path.join(__dirname, '..', 'mes.fm', 'api'), DATA = path.join(__dirname, '..', 'mes.fm', 'march-madness', 'data');
const FIX = { m: JSON.parse(fs.readFileSync(path.join(__dirname, 'march-madness', 'fixtures', 'espn-m-2026.json'), 'utf8')), w: JSON.parse(fs.readFileSync(path.join(__dirname, 'march-madness', 'fixtures', 'espn-w-2026.json'), 'utf8')) };
const events = (g) => [].concat.apply([], Object.values(FIX[g]));
const name = (T, id) => T.teams[id] && T.teams[id].n;

// a fetch that answers ESPN scoreboard days from the fixture (and a summary with a live win probability)
function fakeFetch(g, opts) {
  return async (url) => {
    const m = /dates=(\d{8})/.exec(url);
    if (m) { const ev = JSON.parse(JSON.stringify(FIX[g][m[1]] || [])); if (opts && opts.mutate) opts.mutate(ev, m[1]); return { ok: true, json: async () => ({ events: ev }) }; }
    if (/summary\?event=/.test(url)) return { ok: true, json: async () => ({ winprobability: [{ homeWinPercentage: 0.5 }, { homeWinPercentage: 0.8 }] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

(async () => {
  await t('lib is byte-identical to the API copy', () => {
    assert.strictEqual(fs.readFileSync(path.join(__dirname, 'march-madness', 'lib.js'), 'utf8'), fs.readFileSync(path.join(API, '_mm-lib.js'), 'utf8'));
  });
  await t('bracket structure: rounds, feeders, next', () => {
    assert.strictEqual(M.TOPO.length, 67);
    [[0, 1], [31, 1], [32, 2], [47, 2], [48, 3], [56, 4], [59, 4], [60, 5], [61, 5], [62, 6], [63, 0], [66, 0]].forEach(([g, r]) => assert.strictEqual(M.roundOf(g), r, 'round of ' + g));
    assert.deepStrictEqual(M.feeders(32), [0, 1]); assert.deepStrictEqual(M.feeders(47), [30, 31]); assert.deepStrictEqual(M.feeders(56), [48, 49]);
    assert.deepStrictEqual(M.feeders(60), [56, 57]); assert.deepStrictEqual(M.feeders(61), [58, 59]); assert.deepStrictEqual(M.feeders(62), [60, 61]);
    for (let g = 0; g < 62; g++) { const n = M.next(g); assert.strictEqual(M.feeders(n.g)[n.side], g); }
    assert.strictEqual(M.next(62), null);
    assert.deepStrictEqual([0, 7, 8, 32, 36, 48, 50, 56, 59].map(M.regionOfGame), [0, 0, 1, 0, 1, 0, 1, 0, 3]);
    // each region's 16 leaves pair 1-16, 8-9, 5-12, 4-13, 6-11, 3-14, 7-10, 2-15
    for (let i = 0; i < 16; i += 2) assert.strictEqual(M.SEED_ORDER[i] + M.SEED_ORDER[i + 1], 17);
  });
  await t('Selection Sunday dates', () => {
    assert.strictEqual(M.selectionSunday(2024), '2024-03-17'); assert.strictEqual(M.selectionSunday(2025), '2025-03-16');
    assert.strictEqual(M.selectionSunday(2026), '2026-03-15'); assert.strictEqual(M.selectionSunday(2027), '2027-03-14');
    const w = M.windowDays(2026); assert.strictEqual(w[0], '20260316'); assert.strictEqual(w.length, 24); assert(w.includes('20260406'));
  });
  await t('round / region notes', () => {
    assert.strictEqual(M.roundFromNote("NCAA Men's Basketball Championship - East Region - 1st Round"), 1);
    assert.strictEqual(M.roundFromNote("Men's Basketball Championship - Midwest Region - First Four"), 0);
    assert.strictEqual(M.roundFromNote("NCAA Women's Championship - Regional 3 in Birmingham - Sweet 16"), 3);
    assert.strictEqual(M.roundFromNote("NCAA Men's Basketball Championship - South Region - Elite 8"), 4);
    assert.strictEqual(M.roundFromNote("NCAA Men's Basketball Championship - Final Four"), 5);
    assert.strictEqual(M.roundFromNote("NCAA Men's Basketball Championship - National Championship"), 6);
    assert.strictEqual(M.roundFromNote("Men's National Invitation Tournament - Championship"), null);
    assert.strictEqual(M.regionFromNote("NCAA Women's Basketball Championship - Regional 1 in Fort Worth - 1st Round"), 'Fort Worth 1');
    assert.strictEqual(M.regionFromNote("NCAA Men's Basketball Championship - West Region - 2nd Round"), 'West');
  });
  const Tm = M.normEspn(events('m'), 'm', 2026), Tw = M.normEspn(events('w'), 'w', 2026);
  await t('ESPN normaliser: 2026 men', () => {
    assert(M.okTournament(Tm)); assert.strictEqual(Tm.status, 'final'); assert.strictEqual(Tm.pairing, 'espn');
    assert.deepStrictEqual(Tm.regions, ['West', 'Midwest', 'East', 'South']);
    assert.strictEqual(Tm.ff.length, 4); assert.strictEqual(Object.keys(Tm.games).length, 67);
    assert.strictEqual(name(Tm, M.actualWinner(Tm, 62)), 'Michigan');
    assert.deepStrictEqual([56, 57, 58, 59].map((g) => name(Tm, M.actualWinner(Tm, g))), ['Arizona', 'Michigan', 'UConn', 'Illinois']);
    assert.strictEqual(name(Tm, Tm.leaves[0]), 'Arizona'); assert.strictEqual(Tm.teams[Tm.leaves[0]].seed, 1);
    assert(Tm.lock && Tm.lock.startsWith('2026-03-19'));
    // every recorded game is between the teams the bracket puts there
    M.liveGames(Tm).forEach((g) => { const x = Tm.games[g]; assert.strictEqual(x.a, M.actualEntrant(Tm, g, 0), 'a of ' + g); assert.strictEqual(x.b, M.actualEntrant(Tm, g, 1), 'b of ' + g); });
    // seeds per leaf
    for (let L = 0; L < 64; L++) { const v = Tm.leaves[L]; const seed = typeof v === 'string' && v.startsWith('ff:') ? Tm.teams[Tm.ff[+v.slice(3)].a].seed : Tm.teams[v].seed; assert.strictEqual(seed, M.SEED_ORDER[L % 16], 'leaf ' + L); }
  });
  await t('ESPN normaliser: 2026 women', () => {
    assert(M.okTournament(Tw)); assert.strictEqual(name(Tw, M.actualWinner(Tw, 62)), 'UCLA');
    assert.strictEqual(Tw.regions.length, 4); assert(/Fort Worth|Sacramento/.test(Tw.regions[0]));
  });
  await t('ESPN normaliser: before the games, without results or Final Four teams', () => {
    const pre = events('m').filter((e) => /1st Round|First Four/.test(JSON.stringify(e.competitions[0].notes))).map((e) => {
      const x = JSON.parse(JSON.stringify(e)), c = x.competitions[0];
      c.status = { type: { state: 'pre', shortDetail: '3/19 - 12:15 PM EDT' } }; c.competitors.forEach((s) => { s.winner = false; s.score = '0'; });
      // the Round of 64 slot of a First Four game is still "TBD"
      if (/1st Round/.test(JSON.stringify(c.notes)) && c.competitors.some((s) => ['UMBC', 'Howard'].includes(s.team.shortDisplayName))) c.competitors.forEach((s) => { if (['UMBC', 'Howard'].includes(s.team.shortDisplayName)) s.team = { id: '-1', shortDisplayName: 'TBD', displayName: 'TBD' }; });
      return x;
    });
    const T = M.normEspn(pre, 'm', 2026);
    assert(M.okTournament(T)); assert.strictEqual(T.status, 'upcoming'); assert.strictEqual(T.pairing, 'unknown'); assert.strictEqual(T.ff.length, 4);
    const ffHow = T.ff.filter((f) => ['UMBC', 'Howard'].includes(name(T, f.a)))[0];
    assert(ffHow && /^ff:/.test(T.leaves[ffHow.leaf]) && M.SEED_ORDER[ffHow.leaf % 16] === 16);
    const T2 = M.normEspn(pre, 'm', 2026, ['East', 'South']);
    assert.deepStrictEqual(T2.regions.slice(0, 2), ['East', 'South']); assert.strictEqual(T2.pairing, 'set');
  });
  await t('committed snapshots load and are consistent', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
    assert(idx.m.includes(2026) && idx.w.includes(2026));
    ['m', 'w'].forEach((g) => idx[g].forEach((y) => {
      const T = JSON.parse(fs.readFileSync(path.join(DATA, g + '-' + y + '.json'), 'utf8'));
      assert(M.okTournament(T), g + y); assert.strictEqual(T.status, 'final');
      const P = M.autoFill(T, M.emptyPicks(), 'results'); assert(M.complete(T, P), 'results fill ' + g + y);
      assert.strictEqual(M.score(T, P, 'espn').pts, 1920);
    }));
    const T = JSON.parse(fs.readFileSync(path.join(DATA, 'm-2026.json'), 'utf8'));
    assert.strictEqual(T.teams[M.actualWinner(T, 62)].n, 'Michigan');
  });
  await t('picks: entrants, clearing later picks, undo-safe copies', () => {
    const T = Tm; let P = M.emptyPicks();
    assert.strictEqual(M.entrant(T, P, 32, 0), null);
    const a = T.leaves[0], b = T.leaves[2];
    P = M.setPick(T, P, 0, a); P = M.setPick(T, P, 1, b);
    assert.strictEqual(M.entrant(T, P, 32, 0), a); assert.strictEqual(M.entrant(T, P, 32, 1), b);
    P = M.setPick(T, P, 32, a); P = M.setPick(T, P, 48, a);
    assert.strictEqual(M.pickedWinner(T, P, 48), a);
    // changing round 1 game 0 to the 16 seed clears a's later picks but not game 1
    const Q = M.setPick(T, P, 0, T.leaves[1]);
    assert.strictEqual(Q[32], 0); assert.strictEqual(Q[48], 0); assert.strictEqual(M.pickedWinner(T, Q, 1), b); assert.strictEqual(P[32], 1, 'original untouched');
    // changing game 1 keeps a's pick in game 32 (a is still there)
    const R = M.setPick(T, P, 1, T.leaves[3]);
    assert.strictEqual(M.pickedWinner(T, R, 32), a); assert.strictEqual(M.pickedWinner(T, R, 48), a);
    const C = M.clearPick(T, P, 32); assert.strictEqual(C[32], 0); assert.strictEqual(C[48], 0); assert.strictEqual(C[0], 1);
    // a team that is not in the game cannot be picked
    assert.deepStrictEqual(M.setPick(T, P, 33, a), P);
  });
  await t('First Four picks feed the Round of 64', () => {
    const T = Tm, k = 0, f = T.ff[k], g = f.leaf >> 1, s = f.leaf & 1;
    let P = M.emptyPicks();
    assert.strictEqual(M.entrant(T, P, g, s), null);
    P = M.setPick(T, P, 63 + k, f.b); assert.strictEqual(M.entrant(T, P, g, s), f.b);
    P = M.setPick(T, P, g, f.b);
    P = M.setPick(T, P, 63 + k, f.a); assert.strictEqual(P[g], 0, 'pick of the First Four loser cleared');
  });
  await t('auto fill: chalk, favourites, random, results', () => {
    const T = Tm;
    const C = M.autoFill(T, M.emptyPicks(), 'chalk'); assert(M.complete(T, C));
    for (let g = 0; g < 63; g++) { const w = M.pickedWinner(T, C, g), a = M.entrant(T, C, g, 0), b = M.entrant(T, C, g, 1); assert.strictEqual(T.teams[w].seed, Math.min(T.teams[a].seed, T.teams[b].seed)); }
    assert.strictEqual(M.chances(T, C, { ignoreResults: true, model: 'seed' }).upsets, 0);
    const F = M.autoFill(T, M.emptyPicks(), 'model'); assert(M.complete(T, F));
    assert.strictEqual(M.chances(T, F, { ignoreResults: true }).chalk, 100);
    const R1 = M.autoFill(T, M.emptyPicks(), 'random', { seed: 7 }), R2 = M.autoFill(T, M.emptyPicks(), 'random', { seed: 7 });
    assert.deepStrictEqual(R1, R2); assert(M.complete(T, R1));
    assert(M.chances(T, R1, { ignoreResults: true }).chalk < 100);
    // keeps existing picks unless asked to overwrite
    let P = M.setPick(T, M.emptyPicks(), 0, T.leaves[1]);
    P = M.autoFill(T, P, 'chalk'); assert.strictEqual(M.pickedWinner(T, P, 0), T.leaves[1]);
  });
  await t('model: history in round 1, monotone seeds, record nudge, women stretch', () => {
    const T = { g: 'm', teams: { a: { seed: 1, rec: '' }, b: { seed: 16, rec: '' }, c: { seed: 5, rec: '' }, d: { seed: 12, rec: '' }, e: { seed: 2, rec: '' } }, games: {} };
    assert(Math.abs(M.pModel(T, 'a', 'b', 0) - 0.9875) < 1e-9); assert(Math.abs(M.pModel(T, 'd', 'c', 3) - (1 - 0.644)) < 1e-9);
    assert(Math.abs(M.pModel(T, 'a', 'b', 0) + M.pModel(T, 'b', 'a', 0) - 1) < 1e-12);
    for (let s = 1; s < 16; s++) assert(M.SEED_R[s] > M.SEED_R[s + 1], 'seed ratings fall ' + s);
    const later = M.pModel(T, 'a', 'e', 56); assert(later > 0.5 && later < 0.7, 'a 1 seed beats a 2 seed a bit more than half the time: ' + later);
    const T2 = JSON.parse(JSON.stringify(T)); T2.teams.c.rec = '30-2'; T2.teams.d.rec = '18-14';
    assert(M.pModel(T2, 'c', 'd', 3) > M.pModel(T, 'c', 'd', 3)); assert.strictEqual(M.pModel(T2, 'c', 'd', 3, { model: 'seed' }), M.pModel(T, 'c', 'd', 3));
    const W = JSON.parse(JSON.stringify(T)); W.g = 'w'; assert(M.pModel(W, 'a', 'e', 56) > later);
    assert.strictEqual(M.parseRec('28-5'), 28 / 33); assert.strictEqual(M.parseRec(''), null);
  });
  await t('advance: probabilities add up, results and live odds respected', () => {
    const T = Tm, pre = M.advance(T, { ignoreResults: true });
    M.liveGames(T).forEach((g) => { const s = Object.values(pre[g]).reduce((a, b) => a + b, 0); assert(Math.abs(s - 1) < 1e-9, 'game ' + g + ' sums to ' + s); });
    assert.strictEqual(Object.keys(pre[62]).length, 64 + 4 - 4 + 4, 'every team can win it all (68 teams)');
    const now = M.advance(T, {}); const champ = M.actualWinner(T, 62);
    assert.strictEqual(now[62][champ], 1);
    // a live game uses the live probability
    const L = JSON.parse(JSON.stringify(T)); const g = 62, x = L.games[g]; x.st = 'in'; x.w = null; x.wp = 0.3;
    const lv = M.advance(L, {}); assert(Math.abs(lv[62][x.a] - 0.3) < 1e-9);
    M.setLive(L, g, x.home === x.a ? 0.8 : 0.2); assert(Math.abs(L.games[g].wp - 0.8) < 1e-9);
  });
  await t('chances and "1 in" text', () => {
    assert.strictEqual(M.oneIn(Math.log(0.5)), '1 in 2'); assert.strictEqual(M.oneIn(Math.log(1 / 250)), '1 in 250');
    assert.strictEqual(M.oneIn(Math.log(1 / 4.2e9)), '1 in 4.2 billion'); assert.strictEqual(M.oneIn(Math.log(1 / 9.2e18)), '1 in 9.2 quintillion');
    assert(/× 10\^2[0-9]/.test(M.oneIn(Math.log(1e-25))));
    assert.strictEqual(M.pct(0.999), '>99%'); assert.strictEqual(M.pct(0.001), '<1%'); assert.strictEqual(M.pct(0.5), '50%');
    const C = M.chances(Tm, M.autoFill(Tm, M.emptyPicks(), 'model'), { ignoreResults: true });
    assert.strictEqual(C.picked, 67); assert(C.logAll < Math.log(1e-9) && C.logAll > Math.log(1e-14), M.oneIn(C.logAll));
    const real = M.chances(Tm, M.autoFill(Tm, M.emptyPicks(), 'results'), {}); assert.strictEqual(real.logAll, 0);
  });
  await t('scoring: systems, max still possible', () => {
    assert.strictEqual(M.maxPoints('espn'), 1920); assert.strictEqual(M.maxPoints('simple'), 192);
    const T = Tm, real = M.autoFill(T, M.emptyPicks(), 'results');
    const sd = M.score(T, real, 'seed'); assert(sd.pts > 1920 && sd.correct === 63);
    const C = M.autoFill(T, M.emptyPicks(), 'chalk'), s = M.score(T, C, 'espn');
    assert.strictEqual(s.pts, s.max, 'tournament over: nothing left'); assert.strictEqual(s.correct + s.wrong, 63);
    // halfway through: a pick of a team still alive counts towards max
    const H = JSON.parse(JSON.stringify(T)); [60, 61, 62].forEach((g) => { H.games[g].st = 'pre'; H.games[g].w = null; });
    const h = M.score(H, real, 'espn'); assert.strictEqual(h.pts, 1920 - 160 * 2 - 320); assert.strictEqual(h.max, 1920);
    const FFonly = M.score(T, M.setPick(T, M.emptyPicks(), 63, T.ff[0].a), 'espn'); assert.strictEqual(FFonly.pts, 0);
  });
  await t('pick encoding round trip and garbage', () => {
    const T = Tm;
    [M.emptyPicks(), M.autoFill(T, M.emptyPicks(), 'chalk'), M.autoFill(T, M.emptyPicks(), 'random', { seed: 3 })].forEach((P) => {
      const s = M.encodePicks(P); assert(s.length <= 24 && /^1[A-Za-z0-9\-_]*$/.test(s)); assert.deepStrictEqual(M.decodePicks(s), P);
    });
    assert.strictEqual(M.decodePicks('2abc'), null); assert.strictEqual(M.decodePicks('1' + '_'.repeat(23)), null, 'value 3 is not a pick');
    assert.strictEqual(M.decodePicks('1<script>'), null); assert.strictEqual(M.decodePicks('1' + 'A'.repeat(40)), null);
    // cleanPicks drops picks whose team is not there
    const P = M.emptyPicks(); P[32] = 1; assert.strictEqual(M.cleanPicks(T, P)[32], 0);
  });
  await t('names', () => {
    ['Bob', 'Anne-Marie', "O'Neil 2", 'Łukasz'].forEach((n) => assert.strictEqual(M.cleanName(n), n));
    ['', 'a'.repeat(25), '<b>', 'x@y'].forEach((n) => assert.strictEqual(M.cleanName(n), null, n));
  });

  // ---------- the bracket function ----------
  const B = require(path.join(API, 'mm-bracket.js'));
  await t('bracket function: fetch, live odds, years', async () => {
    B._reset();
    const T = await B.fetchTournament('m', 2026, fakeFetch('m'));
    assert(M.okTournament(T)); assert.strictEqual(T.status, 'final'); assert.strictEqual(T.source, 'ESPN');
    B._reset();
    const L = await B.fetchTournament('m', 2026, fakeFetch('m', { mutate: (ev) => ev.forEach((e) => { if (/National Championship/.test(JSON.stringify(e.competitions[0].notes))) { e.competitions[0].status = { type: { state: 'in', shortDetail: '8:12 - 2nd' } }; e.competitions[0].competitors.forEach((c) => { c.winner = false; }); } }) }));
    assert.strictEqual(L.status, 'live'); assert.strictEqual(L.games[62].st, 'in');
    const home = L.games[62].home; assert(home); assert(Math.abs((L.games[62].a === home ? L.games[62].wp : 1 - L.games[62].wp) - 0.8) < 1e-9);
    assert.strictEqual(B.yearParam('2026', new Date('2026-10-27')), 2026); assert.strictEqual(B.yearParam('2028', new Date('2026-10-27')), null); assert.strictEqual(B.yearParam('x'), null);
    assert.strictEqual(B.currentYear(new Date('2026-10-27')), 2027); assert.strictEqual(B.currentYear(new Date('2027-03-20')), 2027); assert.strictEqual(B.currentYear(new Date('2027-04-30')), 2027);
  });
  await t('bracket function: handler says "pending" before Selection Sunday', async () => {
    let out = null, code = 0; const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; }, status: (c) => { code = c; return { json: (j) => { out = j; } }; } };
    await B({ query: { g: 'w' } }, res);
    // today (whenever the test runs) is either before the next Selection Sunday (pending) or a real fetch; only check the pending shape when pending
    if (out && out.pending) { assert.strictEqual(out.g, 'w'); assert(/^\d{4}-03-\d\d$/.test(out.opens)); assert.strictEqual(out.last, out.year - 1); assert.strictEqual(code, 200); }
  });
  await t('bracket function: ESPN down -> error', async () => {
    B._reset();
    await assert.rejects(B.fetchTournament('w', 2026, async () => ({ ok: false, status: 503, json: async () => ({}) })));
  });

  // ---------- the leaderboard function ----------
  const store = {};
  function fakeRedis(cmds) {
    return cmds.map(([c, k, ...a]) => {
      if (c === 'INCR') { store[k] = (+store[k] || 0) + 1; return { result: store[k] }; }
      if (c === 'EXPIRE') return { result: 1 };
      store[k] = store[k] || {};
      const h = store[k];
      if (c === 'HSETNX') { if (h[a[0]]) return { result: 0 }; h[a[0]] = a[1]; return { result: 1 }; }
      if (c === 'HSET') { h[a[0]] = a[1]; return { result: 1 }; }
      if (c === 'HGET') return { result: h[a[0]] || null };
      if (c === 'HDEL') { delete h[a[0]]; return { result: 1 }; }
      if (c === 'HLEN') return { result: Object.keys(h).length };
      if (c === 'HGETALL') return { result: [].concat.apply([], Object.entries(h)) };
      throw new Error('cmd ' + c);
    });
  }
  const realFetch = global.fetch, espn = fakeFetch('m');
  global.fetch = async (url, o) => {
    if (/upstash/.test(url)) return { json: async () => fakeRedis(JSON.parse(o.body)) };
    return espn(url, o);
  };
  process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io'; process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
  B._reset();
  const P = require(path.join(API, 'mm-picks.js'));
  async function call(method, q, body, ip) {
    let out = null, code = 0;
    const res = { setHeader() {}, status: (c) => { code = c; return { json: (j) => { out = j; }, end() {} }; } };
    await P({ method, query: q || {}, body, headers: { 'x-forwarded-for': ip || '1.2.3.4' }, socket: {} }, res);
    return { code, out };
  }
  const real = M.encodePicks(M.autoFill(Tm, M.emptyPicks(), 'results')), chalk = M.encodePicks(M.autoFill(Tm, M.emptyPicks(), 'chalk'));
  await t('leaderboard: submit, board, view, update, delete', async () => {
    let r = await call('POST', {}, { a: 'submit', g: 'm', y: 2026, name: 'Perfect', p: real });
    assert.strictEqual(r.code, 200, JSON.stringify(r.out)); assert(/^[a-z0-9]{10}$/.test(r.out.id) && /^[a-f0-9]{32}$/.test(r.out.key)); assert.strictEqual(r.out.late, true, 'after tip-off = replay');
    const me = r.out;
    r = await call('POST', {}, { a: 'submit', g: 'm', y: 2026, name: 'Chalky', p: chalk }); assert.strictEqual(r.code, 200);
    r = await call('GET', { g: 'm', y: '2026', late: '1' }); assert.strictEqual(r.code, 200);
    assert.strictEqual(r.out.total, 2); assert.strictEqual(r.out.rows[0].n, 'Perfect'); assert.strictEqual(r.out.rows[0].pts, 1920); assert.strictEqual(r.out.rows[0].r, 1);
    assert.strictEqual(Tm.teams[r.out.rows[0].champ].n, 'Michigan');
    r = await call('GET', { g: 'm', y: '2026' }); assert.strictEqual(r.out.total, 0, 'on-time board is empty');
    r = await call('GET', { g: 'm', y: '2026', s: 'simple', late: '1' }); assert.strictEqual(r.out.rows[0].pts, 192);
    r = await call('GET', { g: 'm', y: '2026', id: me.id }); assert.strictEqual(r.out.p, real); assert.strictEqual(r.out.n, 'Perfect');
    r = await call('POST', {}, { a: 'update', g: 'm', y: 2026, id: me.id, key: me.key, name: 'Perfect 2', p: chalk }); assert.strictEqual(r.code, 200);
    r = await call('GET', { g: 'm', y: '2026', id: me.id }); assert.strictEqual(r.out.n, 'Perfect 2'); assert.strictEqual(r.out.p, chalk);
    r = await call('POST', {}, { a: 'update', g: 'm', y: 2026, id: me.id, key: 'f'.repeat(32), name: 'Hacked' }); assert.strictEqual(r.code, 403);
    r = await call('POST', {}, { a: 'delete', g: 'm', y: 2026, id: me.id, key: me.key }); assert.strictEqual(r.code, 200);
    r = await call('GET', { g: 'm', y: '2026', id: me.id }); assert.strictEqual(r.code, 404);
  });
  await t('leaderboard: refuses bad input', async () => {
    let r = await call('POST', {}, { a: 'submit', g: 'm', y: 2026, name: 'Half', p: M.encodePicks(M.setPick(Tm, M.emptyPicks(), 0, Tm.leaves[0])) }); assert.strictEqual(r.code, 400);
    r = await call('POST', {}, { a: 'submit', g: 'm', y: 2026, name: 'sh1thead', p: real }); assert.strictEqual(r.code, 400);
    r = await call('POST', {}, { a: 'submit', g: 'm', y: 2026, name: '<x>', p: real }); assert.strictEqual(r.code, 400);
    r = await call('POST', {}, { a: 'submit', g: 'm', y: 1999, name: 'Old', p: real }); assert.strictEqual(r.code, 400);
    r = await call('POST', {}, { a: 'nope', g: 'm', y: 2026 }); assert.strictEqual(r.code, 400);
    r = await call('POST', {}, { a: 'remove', g: 'm', y: 2026, admin: 'x', id: 'abcdefghij' }); assert.strictEqual(r.code, 403, 'admin remove off without the env key');
    r = await call('POST', {}, 'not json'); assert.strictEqual(r.code, 400);
  });
  await t('leaderboard: on-time entries before the first tip-off', async () => {
    const T = JSON.parse(JSON.stringify(Tm)); T.lock = '2999-01-01T00:00:00Z';
    assert.strictEqual(P._test.isLate(T, Date.now()), false); assert.strictEqual(P._test.isLate(Tm, Date.now()), true);
    const rows = P._test.boardRows([['aaaaaaaaaa', JSON.stringify({ n: 'A', p: chalk, t: 1, late: false })], ['bbbbbbbbbb', JSON.stringify({ n: 'B', p: real, t: 2, late: true })]], Tm, 'espn', false);
    assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].n, 'A');
  });
  await t('leaderboard: rate limit', async () => {
    let last = 0;
    for (let i = 0; i < 22; i++) last = (await call('POST', {}, { a: 'submit', g: 'w', y: 2026, name: 'Spam ' + i, p: real }, '9.9.9.9')).code;
    assert.strictEqual(last, 429);
  });
  global.fetch = realFetch;
  console.log(pass + ' tests passed' + (process.exitCode ? ' (with failures above)' : ''));
})();
