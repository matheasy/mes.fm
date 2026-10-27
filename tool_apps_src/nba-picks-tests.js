// Tests for MES NBA Picks: node tool_apps_src/nba-picks-tests.js
// lib.js (teams, name parser, ESPN normaliser, scoring, links), the standings function with a mocked fetch and the leaderboard function with a fake Redis.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const N = require('./nba-picks/lib.js');
let pass = 0;
function t(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; }, (e) => { console.error('FAIL', name, '\n ', e && e.stack || e); process.exitCode = 1; }); }
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'nba-picks', 'fixtures', 'espn-2026-10-26.json'), 'utf8'));
const BRO = '1 76ers\n2 Celtics\n3 Knicks\n4 Raptors\n5 Cavaliers\n6 Pistons\n7 Pacers\n8 Hawks\n9 Heat\n10 Magic\n11 Hornets\n12 Wizards\n13 Bulls\n14 Bucks\n15 Nets';

(async () => {
  await t('lib is byte-identical to the API copy', () => {
    assert.strictEqual(fs.readFileSync(path.join(__dirname, 'nba-picks', 'lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'api', '_nba-lib.js'), 'utf8'));
  });
  await t('30 teams, 15 per conference, colours valid', () => {
    assert.strictEqual(N.ORDER.length, 30); assert.strictEqual(N.CONF.E.length, 15); assert.strictEqual(N.CONF.W.length, 15);
    N.ORDER.forEach((id) => { const x = N.TEAMS[id]; assert(/^#[0-9a-f]{6}$/.test(x.c1) && /^#[0-9a-f]{6}$/.test(x.c2), id); assert(['#111111', '#ffffff'].includes(N.textOn(x.c1))); });
  });
  await t('team names: nicknames, cities, short forms, typos', () => {
    const cases = { '76ers': 'PHI', Sixers: 'PHI', Philly: 'PHI', 'Philadelphia 76ers': 'PHI', celtics: 'BOS', Celitcs: 'BOS', NY: 'NYK', Knicks: 'NYK', 'New York': 'NYK',
      Raps: 'TOR', Cavs: 'CLE', Clevland: 'CLE', Bukcs: 'MIL', Nets: 'BKN', BKN: 'BKN', Brooklyn: 'BKN', Wizzards: 'WAS', WSH: 'WAS', Hornets: 'CHA', 'The Magic': 'ORL',
      Dubs: 'GSW', GS: 'GSW', 'Golden State Warriors': 'GSW', 'Trail Blazers': 'POR', Blazers: 'POR', 'T-Wolves': 'MIN', Wolves: 'MIN', OKC: 'OKC', 'Oklahoma City': 'OKC',
      Pels: 'NOP', 'New Orleans': 'NOP', 'San Antonio': 'SAS', SA: 'SAS', Jazz: 'UTA', UTAH: 'UTA', Lakers: 'LAL', 'LA Clippers': 'LAC', Clips: 'LAC', Mavs: 'DAL', Grizz: 'MEM', Suns: 'PHX', Kings: 'SAC' };
    Object.keys(cases).forEach((k) => { const r = N.parseTeam(k); assert(r && r.id === cases[k], k + ' -> ' + JSON.stringify(r)); });
    assert.deepStrictEqual(N.parseTeam('LA').amb.sort(), ['LAC', 'LAL']);
    assert.strictEqual(N.parseTeam('xyzzy'), null);
    assert.strictEqual(N.parseTeam(''), null);
  });
  await t('pasted lists: numbered, commas, abbreviations, records, dupes, other conference', () => {
    const r = N.parseList(BRO, 'E');
    assert.strictEqual(r.ids.join(' '), 'PHI BOS NYK TOR CLE DET IND ATL MIA ORL CHA WAS CHI MIL BKN'); assert(!r.unknown.length && !r.missing.length);
    assert.deepStrictEqual(N.parseList('PHI, BOS; NYK', 'E').ids, ['PHI', 'BOS', 'NYK']);
    assert.deepStrictEqual(N.parseList('PHI BOS NYK TOR', 'E').ids, ['PHI', 'BOS', 'NYK', 'TOR']);
    assert.deepStrictEqual(N.parseList('1. Thunder (60-22)\n2) Nuggets - 55 wins\n#3 LA Lakers\n4: Spurs 50-32', 'W').ids, ['OKC', 'DEN', 'LAL', 'SAS']);
    const d = N.parseList('Celtics\nBoston\nLakers\nfoo', 'E');
    assert.deepStrictEqual(d.dupes, ['BOS']); assert.deepStrictEqual(d.other, ['LAL']); assert.deepStrictEqual(d.unknown, ['foo']);
    const c = N.completeList(['BOS', 'LAL'], 'E');
    assert(N.validPicks(c, 'E')); assert.strictEqual(c[0], 'BOS');
  });
  await t('validPicks', () => {
    assert(N.validPicks(N.CONF.E.slice(), 'E')); assert(!N.validPicks(N.CONF.E.slice(), 'W'));
    const x = N.CONF.E.slice(); x[1] = x[0]; assert(!N.validPicks(x, 'E'));
    assert(!N.validPicks(N.CONF.E.slice(0, 14), 'E')); assert(!N.validPicks('PHI', 'E'));
  });
  const st = N.normEspn(FIX);
  await t('ESPN normaliser', () => {
    assert(N.okStandings(st)); assert.strictEqual(st.season, 2027); assert.strictEqual(st.seasonName, '2026-27');
    assert.strictEqual(st.conf.E.map((r) => r.id).join(' '), 'DET PHI CHA ATL TOR IND BOS CLE WAS ORL CHI NYK MIL BKN MIA');
    assert.strictEqual(st.conf.W[0].id, 'HOU'); assert.strictEqual(st.conf.E[0].w, 3); assert.strictEqual(st.conf.E[14].l, 4);
    assert(Math.abs(N.gamesPlayed(st.conf.E) - 3.33) < 0.01);
    assert(!N.okStandings(N.normEspn({})));
  });
  await t('tie-aware positions', () => {
    const P = N.positions(st.conf.E, true);
    assert.deepStrictEqual([P.ATL.lo, P.ATL.hi], [4, 8]); assert.deepStrictEqual([P.PHI.lo, P.PHI.hi], [2, 3]); assert.deepStrictEqual([P.DET.lo, P.DET.hi], [1, 1]);
    assert.deepStrictEqual([P.NYK.lo, P.NYK.hi], [12, 14]); assert.deepStrictEqual([P.MIA.lo, P.MIA.hi], [15, 15]);
    const Q = N.positions(st.conf.E, false); assert.deepStrictEqual([Q.ATL.lo, Q.ATL.hi], [4, 4]);
    const zero = st.conf.E.map((r) => Object.assign({}, r, { w: 0, l: 0 }));
    const Z = N.positions(zero, true); assert.strictEqual(Z.DET.hi, 1);   // before tip-off nobody shares: published order
  });
  await t('the brother\'s East picks against the 2026-10-26 evening standings', () => {
    const picks = N.parseList(BRO, 'E').ids;
    const a = N.scoreConf(picks, st.conf.E, { ties: true }).m, b = N.scoreConf(picks, st.conf.E, { ties: false }).m;
    assert.deepStrictEqual([a.exact, a.w1, a.w2, a.w3, a.tier, a.top10], [6, 8, 10, 11, 11, 11]);
    assert.deepStrictEqual([b.exact, b.w1, b.w2, b.w3, b.tier, b.top10], [1, 6, 7, 9, 7, 11]);
    assert.strictEqual(b.dist, 50); assert.strictEqual(b.pts, 1 * 3 + 5 * 2 + 1);
  });
  await t('the brother\'s East picks against the 2026-10-26 morning standings (before that day\'s games)', () => {
    // records that morning: CHA, WAS 2-1; CLE, BOS 1-1; CHI 1-2; MIA 0-3 (the others as above); order among ties as published is unknown, so ties shared
    const rec = { DET: [3, 0], PHI: [3, 1], CHA: [2, 1], WAS: [2, 1], ATL: [2, 1], TOR: [2, 1], IND: [2, 1], CLE: [1, 1], BOS: [1, 1], ORL: [1, 2], CHI: [1, 2], NYK: [0, 3], MIL: [0, 3], BKN: [0, 3], MIA: [0, 3] };
    const rows = Object.keys(rec).map((id) => ({ id, w: rec[id][0], l: rec[id][1] }));
    const m = N.scoreConf(N.parseList(BRO, 'E').ids, rows, { ties: true }).m;
    assert.strictEqual(m.w3, 10);
    assert.strictEqual(m.top10, 11);
  });
  await t('perfect, reversed and metric shares', () => {
    const rows = st.conf.E, ids = rows.map((r) => r.id);
    const p = N.scoreConf(ids, rows, { ties: false }).m;
    assert.deepStrictEqual([p.exact, p.dist, p.pts], [15, 0, 45]); assert(Math.abs(p.rho - 1) < 1e-9); assert.strictEqual(p.close, 1); assert.strictEqual(p.pairs, p.pairsOf);
    const r = N.scoreConf(ids.slice().reverse(), rows, { ties: false }).m;
    assert.strictEqual(r.dist, N.MAXD); assert(Math.abs(r.rho + 1) < 1e-9); assert.strictEqual(r.close, 0); assert.strictEqual(r.pairs, 0);
    N.METRICS.forEach((d) => { const s = N.metricShare(p, d.k); assert(s >= 0.999 && s <= 1, d.k); assert(N.metricShare(r, d.k) <= 0.5, d.k); });
    assert(N.metricValue(p, 'dist') > N.metricValue(r, 'dist'));
  });
  await t('scoreAll both conferences', () => {
    const all = N.scoreAll({ E: st.conf.E.map((r) => r.id), W: st.conf.W.map((r) => r.id) }, st, { ties: false });
    assert.strictEqual(all.both.m.exact, 30); assert.strictEqual(all.both.m.n, 30);
    assert(!N.scoreAll({ E: st.conf.E.map((r) => r.id) }, st).both);
  });
  await t('share-link lists', () => {
    const e = N.parseList(BRO, 'E').ids, s = N.encodeList(e);
    assert.strictEqual(s, 'phi.bos.nyk.tor.cle.det.ind.atl.mia.orl.cha.was.chi.mil.bkn');
    assert.deepStrictEqual(N.decodeList(s, 'E'), e); assert.strictEqual(N.decodeList(s, 'W'), null); assert.strictEqual(N.decodeList('phi.bos', 'E'), null);
    assert.strictEqual(N.cleanName(' <b>Bro</b>\u0007 '), 'bBro/b'); assert.strictEqual(N.cleanName('x'.repeat(40)).length, 24);
    assert.strictEqual(N.seasonLabel(2027), '2026-27');
  });

  // ---- standings function (fetch mocked) ----
  const apiDir = path.join(__dirname, '..', 'mes.fm', 'api');
  const S = require(path.join(apiDir, 'nba-standings.js'));
  function mockRes() { const r = { headers: {}, code: 0, body: null }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; }
  const realFetch = global.fetch;
  await t('standings function: normalises ESPN, caches, season param, errors', async () => {
    let calls = 0, lastUrl = '';
    global.fetch = async (u) => { calls++; lastUrl = u; if (/fail/.test(global.__mode || '')) return { ok: false, status: 500 }; return { ok: true, json: async () => FIX }; };
    S._reset();
    const res = mockRes(); await S(({ query: {} }), res);
    assert.strictEqual(res.code, 200); assert.strictEqual(res.body.conf.E.length, 15); assert.strictEqual(res.body.season, 2027);
    assert(/s-maxage=600/.test(res.headers['cache-control']));
    await S({ query: {} }, mockRes()); assert.strictEqual(calls, 1, 'second call cached');
    await S({ query: { season: '2026' } }, mockRes()); assert(/season=2026$/.test(lastUrl));
    await S({ query: { season: '1900; drop' } }, mockRes()); assert(!/season=/.test(lastUrl) || calls === 2);
    assert.strictEqual(S.seasonParam('abc'), null); assert.strictEqual(S.seasonParam('2027'), 2027);
    S._reset(); global.__mode = 'fail';
    const bad = mockRes(); await S({ query: {} }, bad); assert.strictEqual(bad.code, 502); assert.strictEqual(bad.headers['cache-control'], 'no-store');
    global.__mode = '';
  });

  // ---- leaderboard function (fake Redis + mocked ESPN) ----
  await t('leaderboard: submit, update, delete, scoring, validation, limits', async () => {
    const db = {}, hashes = {};
    const run = (c) => {
      const [cmd, k, ...a] = c;
      switch (cmd) {
        case 'INCR': db[k] = (db[k] || 0) + 1; return db[k];
        case 'EXPIRE': return 1;
        case 'HGET': return (hashes[k] || {})[a[0]] || null;
        case 'HSET': (hashes[k] = hashes[k] || {})[a[0]] = a[1]; return 1;
        case 'HSETNX': hashes[k] = hashes[k] || {}; if (hashes[k][a[0]]) return 0; hashes[k][a[0]] = a[1]; return 1;
        case 'HDEL': if (hashes[k]) delete hashes[k][a[0]]; return 1;
        case 'HLEN': return Object.keys(hashes[k] || {}).length;
        case 'HGETALL': return Object.entries(hashes[k] || {}).flat();
        default: throw new Error('cmd ' + cmd);
      }
    };
    global.fetch = async (u, o) => {
      if (/upstash/.test(u)) { const cmds = JSON.parse(o.body); return { json: async () => cmds.map((c) => ({ result: run(c) })) }; }
      return { ok: true, json: async () => FIX };
    };
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io'; process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    S._reset();
    const P = require(path.join(apiDir, 'nba-picks.js'));
    const req = (method, body, query) => ({ method, body, query: query || {}, headers: { 'x-forwarded-for': '1.2.3.4' }, socket: {} });
    const call = async (m, b, q) => { const r = mockRes(); await P(req(m, b, q), r); return r; };
    const bro = N.parseList(BRO, 'E').ids, perfect = st.conf.E.map((r) => r.id);
    let r = await call('POST', { a: 'submit', name: 'Brother', E: bro });
    assert.strictEqual(r.code, 200, JSON.stringify(r.body)); const bid = r.body.id, bkey = r.body.key;
    assert(/^[a-z0-9]{10}$/.test(bid) && /^[a-f0-9]{32}$/.test(bkey));
    const stored = JSON.parse(hashes['nbap:2027:e'][bid]); assert.notStrictEqual(stored.h, bkey); assert.strictEqual(stored.gp.E, 3.3); assert.strictEqual(stored.W, null);
    r = await call('POST', { a: 'submit', name: 'Me', E: perfect, W: st.conf.W.map((x) => x.id) }); assert.strictEqual(r.code, 200); const mid = r.body.id, mkey = r.body.key;
    // bad input
    assert.strictEqual((await call('POST', { a: 'submit', name: 'X', E: bro.slice(0, 14) })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'X', E: bro.map(() => 'PHI') })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'X', W: bro })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: '<script>', E: bro })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'shithead', E: bro })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'Ok' })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'Ok', E: bro, season: 2026 })).code, 409);
    // board
    r = await call('GET', null, { board: 'E', m: 'w3' });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.total, 2);
    assert.strictEqual(r.body.rows[0].n, 'Me'); assert.strictEqual(r.body.rows[0].m.w3, 15); assert.strictEqual(r.body.rows[1].m.w3, 11); assert.strictEqual(r.body.rows[1].E, N.encodeList(bro));
    assert.strictEqual((await call('GET', null, { board: 'both' })).body.total, 1);
    assert.strictEqual((await call('GET', null, { board: 'W', m: 'bogus' })).body.m, 'w3');
    // a tie goes to the earlier pick
    r = await call('POST', { a: 'submit', name: 'Late', E: perfect }); const lid = r.body.id;
    r = await call('GET', null, { board: 'E', m: 'exact' }); assert.deepStrictEqual(r.body.rows.slice(0, 2).map((x) => [x.n, x.r]), [['Me', 1], ['Late', 1]]);
    // update / delete need the key
    assert.strictEqual((await call('POST', { a: 'update', id: bid, key: mkey, name: 'Hacked' })).code, 403);
    assert.strictEqual((await call('POST', { a: 'delete', id: bid, key: 'f'.repeat(32) })).code, 403);
    r = await call('POST', { a: 'update', id: bid, key: bkey, name: 'Bro', E: perfect }); assert.strictEqual(r.code, 200);
    assert.strictEqual(JSON.parse(hashes['nbap:2027:e'][bid]).n, 'Bro');
    assert.strictEqual((await call('POST', { a: 'update', id: bid, key: bkey, E: null })).code, 400, 'cannot remove the only conference');
    r = await call('GET', null, { id: bid }); assert.strictEqual(r.body.n, 'Bro'); assert.strictEqual(r.body.E, N.encodeList(perfect));
    assert.strictEqual((await call('POST', { a: 'delete', id: bid, key: bkey })).code, 200);
    assert.strictEqual((await call('GET', null, { id: bid })).code, 404);
    assert.strictEqual((await call('POST', { a: 'remove', admin: 'x', id: lid })).code, 403, 'admin disabled without env');
    // rate limit: 20 writes per hour per IP (so far 12 counted)
    let last; for (let i = 0; i < 10; i++) last = await call('POST', { a: 'submit', name: 'Spam' + i, E: bro });
    assert.strictEqual(last.code, 429);
    assert.strictEqual(mid.length, 10);
    delete process.env.UPSTASH_REDIS_REST_URL;
    assert.strictEqual((await call('GET', null, {})).code, 503);
  });
  global.fetch = realFetch;
  console.log(process.exitCode ? 'some tests FAILED' : 'all ' + pass + ' test groups passed');
})();
