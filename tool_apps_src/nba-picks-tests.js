// Tests for MES Picks (NBA, NFL, MLB, NHL, La Liga, Premier League): node tool_apps_src/nba-picks-tests.js
// lib.js (leagues, team tables from ESPN, name parser, normalisers, scoring, playoffs, links), the standings function with a mocked fetch and the
// leaderboard function with a fake Redis. Fixtures in tool_apps_src/nba-picks/fixtures were recorded from ESPN on 2026-10-26 / 2026-10-27.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const N = require('./nba-picks/lib.js');
let pass = 0;
function t(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; }, (e) => { console.error('FAIL', name, '\n ', e && e.stack || e); process.exitCode = 1; }); }
const fx = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'nba-picks', 'fixtures', f), 'utf8'));
const FIX = fx('espn-2026-10-26.json');
const BRO = '1 76ers\n2 Celtics\n3 Knicks\n4 Raptors\n5 Cavaliers\n6 Pistons\n7 Pacers\n8 Hawks\n9 Heat\n10 Magic\n11 Hornets\n12 Wizards\n13 Bulls\n14 Bucks\n15 Nets';

(async () => {
  await t('lib is byte-identical to the API copy', () => {
    assert.strictEqual(fs.readFileSync(path.join(__dirname, 'nba-picks', 'lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'api', '_nba-lib.js'), 'utf8'));
  });
  await t('six leagues, each with a page slug, sport path and tiers that cover the table', () => {
    assert.deepStrictEqual(N.LEAGUE_ORDER, ['nba', 'nfl', 'mlb', 'nhl', 'laliga', 'epl']);
    N.LEAGUE_ORDER.forEach((id) => {
      const lg = N.league(id); assert(lg.slug && lg.sport && lg.games, id);
      ['conf', 'div', 'league'].forEach((ty) => { const tt = lg.tiers[ty]; if (!tt) return; for (let i = 1; i < tt.length; i++) assert.strictEqual(tt[i].from, tt[i - 1].to + 1, id + ' ' + ty); });
      if (lg.po) { const ps = N.poStages(lg); assert.strictEqual(ps.length, 4, id); assert(ps[3].champ); assert.strictEqual(N.poMax(lg), 32, id); }
    });
    assert.strictEqual(N.poMax(N.league('nba')), 8 * 1 + 4 * 2 + 2 * 4 + 1 * 8);
  });
  // ---- NBA (the first version's behaviour must not change) ----
  const nbaCtx = N.makeCtx('nba', null);
  await t('NBA: 30 teams, 15 per conference, colours valid, first version API kept', () => {
    assert.strictEqual(N.ORDER.length, 30); assert.strictEqual(N.CONF.E.length, 15); assert.strictEqual(N.CONF.W.length, 15);
    N.ORDER.forEach((id) => { const x = N.TEAMS[id]; assert(/^#[0-9a-f]{6}$/.test(x.c1) && /^#[0-9a-f]{6}$/.test(x.c2), id); assert(['#111111', '#ffffff'].includes(N.textOn(x.c1))); });
    assert.strictEqual(N.TEAMS.LAC.full, 'LA Clippers');
    assert.strictEqual(nbaCtx.groups.L.length, 30);
  });
  await t('NBA team names: nicknames, cities, short forms, typos', () => {
    const cases = { '76ers': 'PHI', Sixers: 'PHI', Philly: 'PHI', 'Philadelphia 76ers': 'PHI', celtics: 'BOS', Celitcs: 'BOS', NY: 'NYK', Knicks: 'NYK', 'New York': 'NYK',
      Raps: 'TOR', Cavs: 'CLE', Clevland: 'CLE', Bukcs: 'MIL', Nets: 'BKN', BKN: 'BKN', Brooklyn: 'BKN', Wizzards: 'WAS', WSH: 'WAS', Hornets: 'CHA', 'The Magic': 'ORL',
      Dubs: 'GSW', GS: 'GSW', 'Golden State Warriors': 'GSW', 'Trail Blazers': 'POR', Blazers: 'POR', 'T-Wolves': 'MIN', Wolves: 'MIN', OKC: 'OKC', 'Oklahoma City': 'OKC',
      Pels: 'NOP', 'New Orleans': 'NOP', 'San Antonio': 'SAS', SA: 'SAS', Jazz: 'UTA', UTAH: 'UTA', Lakers: 'LAL', 'LA Clippers': 'LAC', Clips: 'LAC', Mavs: 'DAL', Grizz: 'MEM', Suns: 'PHX', Kings: 'SAC' };
    Object.keys(cases).forEach((k) => { const r = N.parseTeam(nbaCtx, k); assert(r && r.id === cases[k], k + ' -> ' + JSON.stringify(r)); });
    assert.deepStrictEqual(N.parseTeam(nbaCtx, 'LA').amb.sort(), ['LAC', 'LAL']);
    assert.strictEqual(N.parseTeam(nbaCtx, 'xyzzy'), null);
    assert.strictEqual(N.parseTeam(nbaCtx, ''), null);
  });
  await t('NBA pasted lists: numbered, commas, abbreviations, records, dupes, other conference', () => {
    const E = nbaCtx.groups.E, W = nbaCtx.groups.W;
    const r = N.parseList(nbaCtx, BRO, E);
    assert.strictEqual(r.ids.join(' '), 'PHI BOS NYK TOR CLE DET IND ATL MIA ORL CHA WAS CHI MIL BKN'); assert(!r.unknown.length && !r.missing.length);
    assert.deepStrictEqual(N.parseList(nbaCtx, 'PHI, BOS; NYK', E).ids, ['PHI', 'BOS', 'NYK']);
    assert.deepStrictEqual(N.parseList(nbaCtx, '1. Sixers\nCeltics, Knicks', E).ids, ['PHI', 'BOS', 'NYK']);
    assert.deepStrictEqual(N.parseList(nbaCtx, 'PHI BOS NYK TOR', E).ids, ['PHI', 'BOS', 'NYK', 'TOR']);
    assert.deepStrictEqual(N.parseList(nbaCtx, '1. Thunder (60-22)\n2) Nuggets - 55 wins\n#3 LA Lakers\n4: Spurs 50-32', W).ids, ['OKC', 'DEN', 'LAL', 'SAS']);
    const d = N.parseList(nbaCtx, 'Celtics\nBoston\nLakers\nfoo', E);
    assert.deepStrictEqual(d.dupes, ['BOS']); assert.deepStrictEqual(d.other, ['LAL']); assert.deepStrictEqual(d.unknown, ['foo']);
    const c = N.completeList(['BOS', 'LAL'], E);
    assert(N.validList(c, E)); assert.strictEqual(c[0], 'BOS');
    assert(N.validPicks(N.CONF.E.slice(), 'E')); assert(!N.validPicks(N.CONF.E.slice(), 'W'));
    const x = N.CONF.E.slice(); x[1] = x[0]; assert(!N.validPicks(x, 'E'));
  });
  const st = N.normEspn('nba', FIX);
  await t('NBA ESPN normaliser (first-version fixture, no divisions)', () => {
    assert(N.okStandings(st, 'nba')); assert.strictEqual(st.season, 2027); assert.strictEqual(N.seasonLabel(st.season, 'nba'), '2026-27');
    assert.strictEqual(st.groups.E.map((r) => r.id).join(' '), 'DET PHI CHA ATL TOR IND BOS CLE WAS ORL CHI NYK MIL BKN MIA');
    assert.strictEqual(st.groups.W[0].id, 'HOU'); assert.strictEqual(st.groups.E[0].w, 3); assert.strictEqual(st.groups.E[14].l, 4);
    assert.strictEqual(st.groups.L.length, 30); assert(st.groups.L[0].pct >= st.groups.L[29].pct);
    assert(Math.abs(N.gamesPlayed(st.groups.E) - 3.33) < 0.01);
    assert(st.started && !st.over);
    assert(!N.okStandings(N.normEspn('nba', {}), 'nba'));
    const ctx = N.makeCtx('nba', st); assert.deepStrictEqual(N.views(ctx).map((v) => v.k), ['E', 'W', 'L', 'P']);
  });
  await t('tie-aware positions', () => {
    const P = N.positions(st.groups.E, true);
    assert.deepStrictEqual([P.ATL.lo, P.ATL.hi], [4, 8]); assert.deepStrictEqual([P.PHI.lo, P.PHI.hi], [2, 3]); assert.deepStrictEqual([P.DET.lo, P.DET.hi], [1, 1]);
    assert.deepStrictEqual([P.NYK.lo, P.NYK.hi], [12, 14]); assert.deepStrictEqual([P.MIA.lo, P.MIA.hi], [15, 15]);
    const Q = N.positions(st.groups.E, false); assert.deepStrictEqual([Q.ATL.lo, Q.ATL.hi], [4, 4]);
    const zero = st.groups.E.map((r) => Object.assign({}, r, { w: 0, l: 0, gp: 0 }));
    const Z = N.positions(zero, true); assert.strictEqual(Z.DET.hi, 1);
  });
  const conf = (o) => Object.assign({ lg: N.league('nba'), type: 'conf' }, o);
  await t('the brother\'s East picks against the 2026-10-26 evening standings', () => {
    const picks = N.parseList(nbaCtx, BRO, nbaCtx.groups.E).ids;
    const a = N.scoreGroup(picks, st.groups.E, conf({ ties: true })).m, b = N.scoreGroup(picks, st.groups.E, conf({ ties: false })).m;
    assert.deepStrictEqual([a.exact, a.w1, a.w2, a.w3, a.tier, a.cut], [6, 8, 10, 11, 11, 11]);
    assert.deepStrictEqual([b.exact, b.w1, b.w2, b.w3, b.tier, b.cut], [1, 6, 7, 9, 7, 11]);
    assert.strictEqual(b.dist, 50); assert.strictEqual(b.pts, 1 * 3 + 5 * 2 + 1);
  });
  await t('the brother\'s East picks against the 2026-10-26 morning standings (before that day\'s games)', () => {
    const rec = { DET: [3, 0], PHI: [3, 1], CHA: [2, 1], WAS: [2, 1], ATL: [2, 1], TOR: [2, 1], IND: [2, 1], CLE: [1, 1], BOS: [1, 1], ORL: [1, 2], CHI: [1, 2], NYK: [0, 3], MIL: [0, 3], BKN: [0, 3], MIA: [0, 3] };
    const rows = Object.keys(rec).map((id) => ({ id, w: rec[id][0], l: rec[id][1] }));
    const m = N.scoreGroup(N.parseList(nbaCtx, BRO, nbaCtx.groups.E).ids, rows, conf({ ties: true })).m;
    assert.strictEqual(m.w3, 10); assert.strictEqual(m.cut, 11);
  });
  await t('perfect, reversed and metric shares (15 and 30 teams)', () => {
    [[st.groups.E, 'conf'], [st.groups.L, 'league']].forEach(([rows, type]) => {
      const ids = rows.map((r) => r.id), n = ids.length;
      const p = N.scoreGroup(ids, rows, { lg: N.league('nba'), type, ties: false }).m;
      assert.deepStrictEqual([p.exact, p.dist, p.pts], [n, 0, 3 * n]); assert(Math.abs(p.rho - 1) < 1e-9); assert.strictEqual(p.close, 1); assert.strictEqual(p.pairs, p.pairsOf);
      const r = N.scoreGroup(ids.slice().reverse(), rows, { lg: N.league('nba'), type, ties: false }).m;
      assert.strictEqual(r.dist, N.maxDist(n)); assert(Math.abs(r.rho + 1) < 1e-9); assert.strictEqual(r.close, 0); assert.strictEqual(r.pairs, 0);
      N.METRICS.forEach((d) => { const s = N.metricShare(p, d.k); assert(s >= 0.999 && s <= 1, d.k); assert(N.metricShare(r, d.k) <= 0.5, d.k); });
    });
    assert.strictEqual(N.maxDist(15), 112); assert.strictEqual(N.maxDist(16), 128); assert.strictEqual(N.maxDist(4), 8);
  });
  await t('scoreLists: one table, both conferences, invalid lists', () => {
    const lists = { E: st.groups.E.map((r) => r.id), W: st.groups.W.map((r) => r.id), L: st.groups.L.map((r) => r.id) };
    const ctx = N.makeCtx('nba', st);
    assert.strictEqual(N.scoreLists(ctx, lists, st, ['E', 'W'], { ties: false }).m.exact, 30);
    assert.strictEqual(N.scoreLists(ctx, lists, st, ['L'], { ties: false }).m.exact, 30);
    assert.strictEqual(N.scoreLists(ctx, { E: lists.E }, st, ['E', 'W']).m, null);
  });
  await t('first-version share links still decode', () => {
    const e = N.parseList(nbaCtx, BRO, nbaCtx.groups.E).ids, s = N.encodeList(e);
    assert.strictEqual(s, 'phi.bos.nyk.tor.cle.det.ind.atl.mia.orl.cha.was.chi.mil.bkn');
    assert.deepStrictEqual(N.decodeList(s, nbaCtx.groups.E), e); assert.strictEqual(N.decodeList(s, nbaCtx.groups.W), null); assert.strictEqual(N.decodeList('phi.bos', nbaCtx.groups.E), null);
    assert.strictEqual(N.cleanName(' <b>Bro</b>\u0007 '), 'bBro/b'); assert.strictEqual(N.cleanName('x'.repeat(40)).length, 24);
  });

  // ---- NFL: conferences, divisions, whole league, colours, logos ----
  const nfl = N.normEspn('nfl', fx('nfl-standings.json'), fx('nfl-level3.json'), fx('nfl-teams.json'));
  const nflCtx = N.makeCtx('nfl', nfl);
  await t('NFL normaliser: AFC / NFC seeded, eight divisions, 32-team league, colours and logos', () => {
    assert(N.okStandings(nfl, 'nfl'));
    assert.strictEqual(nfl.groups.AFC.length, 16); assert.strictEqual(nfl.groups.NFC.length, 16); assert.strictEqual(nfl.groups.L.length, 32);
    assert.deepStrictEqual(nfl.groups.AFC.slice(0, 4).map((r) => r.seed), [1, 2, 3, 4]);
    assert.deepStrictEqual(N.divKeys(nflCtx), ['AFCE', 'AFCN', 'AFCS', 'AFCW', 'NFCE', 'NFCN', 'NFCS', 'NFCW']);
    N.divKeys(nflCtx).forEach((k) => assert.strictEqual(nfl.groups[k].length, 4, k));
    assert.deepStrictEqual(nflCtx.groups.AFCE.slice().sort(), ['BUF', 'MIA', 'NE', 'NYJ']);
    // division order follows the conference seeding
    const afc = nfl.groups.AFC.map((r) => r.id); assert(afc.indexOf(nfl.groups.AFCW[0].id) < afc.indexOf(nfl.groups.AFCW[1].id));
    assert.strictEqual(nflCtx.teams.KC.c1, '#e31837'); assert(/^https:\/\/a\.espncdn\.com\/.+\.png$/.test(nflCtx.teams.KC.logo));
    assert(/combiner\/i\?img=\/i\/teamlogos\/nfl\/500\/kc\.png&w=40&h=40$/.test(N.logoUrl(nflCtx.teams.KC.logo, 40)));
    assert.strictEqual(N.logoUrl('https://evil.example/x.png'), '');
    assert.deepStrictEqual(N.views(nflCtx).map((v) => v.k), ['AFC', 'NFC', 'L', 'D', 'P']);
    assert.strictEqual(N.seasonLabel(2026, 'nfl'), '2026');
    assert.strictEqual(N.cutFor(nflCtx.lg, 'conf', 16).n, 7);
  });
  await t('NFL names: nicknames, cities, ambiguous LA / New York settled by the table', () => {
    const cases = { Niners: 'SF', '49ers': 'SF', Pats: 'NE', 'New England': 'NE', Bucs: 'TB', Chiefs: 'KC', 'Kansas City': 'KC', Packers: 'GB', 'Green Bay': 'GB', Commanders: 'WSH', Jags: 'JAX', Raiders: 'LV', Vegas: 'LV', Seahwaks: 'SEA', Cowboys: 'DAL', Steelers: 'PIT' };
    Object.keys(cases).forEach((k) => { const r = N.parseTeam(nflCtx, k); assert(r && r.id === cases[k], k + ' -> ' + JSON.stringify(r)); });
    assert.deepStrictEqual(N.parseTeam(nflCtx, 'LA').amb.sort(), ['LAC', 'LAR']);
    assert.strictEqual(N.parseTeam(nflCtx, 'LA', nflCtx.groups.NFC).id, 'LAR');
    assert.strictEqual(N.parseTeam(nflCtx, 'New York', nflCtx.groups.AFC).id, 'NYJ');
    assert.strictEqual(N.parseTeam(nflCtx, 'Giants').id, 'NYG');
  });
  await t('NFL scoring: tiers (division winners / wild cards / out), divisions summed', () => {
    const afc = nfl.groups.AFC.map((r) => r.id);
    const sc = N.scoreGroup(afc, nfl.groups.AFC, { lg: nflCtx.lg, type: 'conf', ties: false });
    assert.strictEqual(sc.m.exact, 16); assert.deepStrictEqual(sc.tiers.map((x) => x.name), ['Division winners', 'Wild cards', 'Out']);
    const lists = {}; N.divKeys(nflCtx).forEach((k) => { lists[k] = nfl.groups[k].map((r) => r.id); });
    const all = N.scoreLists(nflCtx, lists, nfl, N.divKeys(nflCtx), { ties: false });
    assert.strictEqual(all.m.n, 32); assert.strictEqual(all.m.exact, 32); assert.strictEqual(all.m.maxd, 8 * 8);
    const rev = {}; Object.keys(lists).forEach((k) => { rev[k] = lists[k].slice().reverse(); });
    assert.strictEqual(N.scoreLists(nflCtx, rev, nfl, N.divKeys(nflCtx), { ties: false }).m.close, 0);
  });
  // ---- MLB: season over ----
  const mlb = N.normEspn('mlb', fx('mlb-standings.json'), fx('mlb-level3.json'), null);
  const mlbCtx = N.makeCtx('mlb', mlb);
  await t('MLB normaliser: AL / NL sorted by seed, divisions, the season is over', () => {
    assert(N.okStandings(mlb, 'mlb'));
    assert.strictEqual(mlb.groups.AL[0].id, 'TB'); assert.strictEqual(mlb.groups.AL[0].seed, 1);
    assert.strictEqual(N.divKeys(mlbCtx).length, 6);
    assert.strictEqual(mlb.over, true); assert.strictEqual(mlb.started, true);
    assert.strictEqual(mlb.groups.L[0].id, 'MIL');
    assert.strictEqual(N.parseTeam(mlbCtx, 'Yanks').id, 'NYY'); assert.strictEqual(N.parseTeam(mlbCtx, 'Red Sox').id, 'BOS');
    assert.deepStrictEqual(N.parseTeam(mlbCtx, 'Sox').amb.sort(), ['BOS', 'CHW']); assert.strictEqual(N.parseTeam(mlbCtx, 'Sox', mlbCtx.groups.AL).amb.length, 2);
    assert.strictEqual(N.parseTeam(mlbCtx, "A's").id, 'ATH'); assert.strictEqual(N.parseTeam(mlbCtx, 'Dbacks').id, 'ARI');
    assert(!N.okStandings({ groups: { L: [] } }, 'mlb'));
  });
  // ---- NHL: points ----
  const nhl = N.normEspn('nhl', fx('nhl-standings.json'), null, null);
  await t('NHL: whole league by points, ties = same points after the same games, record text', () => {
    const L = nhl.groups.L; assert.strictEqual(L.length, 32);
    for (let i = 1; i < L.length; i++) assert(L[i - 1].pts > L[i].pts || (L[i - 1].pts === L[i].pts && L[i - 1].gp <= L[i].gp), i);
    const lg = N.league('nhl'), r = L[0];
    assert(/^\d+-\d+-\d+, \d+ pts$/.test(N.recText(lg, r)));
    assert.strictEqual(N.recKey(lg, { pts: 10, gp: 8, w: 5 }), N.recKey(lg, { pts: 10, gp: 8, w: 4 }));
    assert.notStrictEqual(N.recKey(lg, { pts: 10, gp: 8 }), N.recKey(lg, { pts: 10, gp: 9 }));
    assert.strictEqual(N.seasonLabel(2027, 'nhl'), '2026-27');
    const ctx = N.makeCtx('nhl', nhl);
    assert.strictEqual(N.parseTeam(ctx, 'Habs').id, 'MTL'); assert.strictEqual(N.parseTeam(ctx, 'Leafs').id, 'TOR'); assert.strictEqual(N.parseTeam(ctx, 'LA').id, 'LA');
  });
  // ---- La Liga: one table, clubs from ESPN ----
  const lal = N.normEspn('laliga', fx('laliga-standings.json'), null, null);
  const lalCtx = N.makeCtx('laliga', lal);
  await t('La Liga: one 20-club table, zones, names, a club that left is completed', () => {
    assert(N.okStandings(lal, 'laliga')); assert.strictEqual(lal.groups.L.length, 20);
    assert.deepStrictEqual(N.views(lalCtx).map((v) => v.k), ['L']);
    assert.strictEqual(lal.groups.L[0].id, 'BAR'); assert.strictEqual(lal.groups.L[0].pts, 27);
    assert.strictEqual(N.recText(lalCtx.lg, lal.groups.L[0]), '27 pts (9-0-1)');
    assert.strictEqual(N.seasonLabel(2026, 'laliga'), '2026-27');
    const cases = { Barca: 'BAR', 'Atleti': 'ATM', 'Real Madrid': 'RMA', Betis: 'BET', 'Real Sociedad': 'RSO', Bilbao: 'ATH', Villareal: 'VIL', Alaves: 'ALA', 'Celta Vigo': 'CEL', Malaga: 'MCF' };
    Object.keys(cases).forEach((k) => { const r = N.parseTeam(lalCtx, k); assert(r && r.id === cases[k], k + ' -> ' + JSON.stringify(r)); });
    assert.deepStrictEqual(N.parseTeam(lalCtx, 'Madrid').amb.sort(), ['ATM', 'RMA']);
    const sc = N.scoreGroup(lal.groups.L.map((r) => r.id), lal.groups.L, { lg: lalCtx.lg, type: 'league', ties: false });
    assert.deepStrictEqual(sc.tiers.map((x) => x.to), [4, 7, 17, 20]); assert.strictEqual(sc.cut.n, 4);
    // a saved list with a relegated club (GIR) keeps the others in order and adds the new clubs
    const old = ['GIR'].concat(lalCtx.groups.L.slice(0, 19));
    const done = N.completeList(old, lalCtx.groups.L); assert(N.validList(done, lalCtx.groups.L)); assert.strictEqual(done[0], lalCtx.groups.L[0]);
  });
  await t('Premier League alias table: Man City / Man Utd / Spurs', () => {
    const fake = { lg: 'epl', season: 2026, teams: [['MNC', 'Manchester City'], ['MAN', 'Manchester United'], ['TOT', 'Tottenham Hotspur'], ['NFO', 'Nottingham Forest'], ['WHU', 'West Ham United']].map(([id, full]) => ({ id, full, name: full, short: full, city: full })), groups: {} };
    const ctx = N.makeCtx('epl', fake);
    assert.strictEqual(N.parseTeam(ctx, 'Man City').id, 'MNC'); assert.strictEqual(N.parseTeam(ctx, 'Man Utd').id, 'MAN'); assert.strictEqual(N.parseTeam(ctx, 'Spurs').id, 'TOT');
    assert.strictEqual(N.parseTeam(ctx, 'Forest').id, 'NFO'); assert.strictEqual(N.parseTeam(ctx, 'West Ham').id, 'WHU'); assert.deepStrictEqual(N.parseTeam(ctx, 'Manchester').amb.sort(), ['MAN', 'MNC']);
  });

  // ---- playoffs ----
  const nba26 = N.makeCtx('nba', st);
  const res26 = N.poResults(nba26, fx('po-nba-2026.json').events);
  await t('NBA 2026 playoffs from the scoreboard: rounds reached, champion, play-in ignored', () => {
    assert(res26.started && res26.done); assert.strictEqual(res26.champ, 'NYK');
    assert.strictEqual(res26.reached.r1.length, 16); assert.strictEqual(res26.reached.r2.length, 8); assert.strictEqual(res26.reached.cf.length, 4);
    assert.deepStrictEqual(res26.reached.f.slice().sort(), ['NYK', 'SAS']); assert.deepStrictEqual(res26.reached.ch, ['NYK']);
    assert.strictEqual(res26.out.length, 29); assert(res26.out.indexOf('NYK') < 0);
    const fin = res26.series.filter((s) => s.stage === 'f')[0]; assert.strictEqual(fin.winner, 'NYK'); assert.deepStrictEqual([fin.wa + fin.wb], [5]);
  });
  await t('playoff picks: clean, score, fill from table picks, link round trip', () => {
    const lg = nba26.lg;
    const po = { r2: ['NYK', 'CLE', 'DET', 'BOS', 'OKC', 'SAS', 'LAL', 'DEN'], cf: ['NYK', 'CLE', 'OKC', 'SAS'], f: ['NYK', 'OKC'], ch: ['OKC'] };
    const c = N.cleanPo(nba26, po); assert.deepStrictEqual(c, po);
    // a West team in an East slot, a dupe, a later pick not sent through: all dropped
    const bad = N.cleanPo(nba26, { r2: ['OKC', 'NYK', 'NYK', 'xx'], cf: ['CLE'], f: [], ch: ['NYK'] });
    assert.deepStrictEqual(bad.r2.slice(0, 4), ['', 'NYK', '', '']); assert.deepStrictEqual(bad.cf, ['', '', '', '']); assert.deepStrictEqual(bad.ch, ['']);
    const sc = N.scorePo(nba26, po, res26);
    // r2: NYK CLE DET OKC SAS LAL hit (6), BOS DEN miss; cf: NYK CLE OKC SAS = 4 hits x2; f: NYK hit x4; ch: OKC miss
    assert.deepStrictEqual(sc.stages.map((s) => s.hit), [6, 4, 1, 0]);
    assert.strictEqual(sc.pts, 6 + 8 + 4); assert.strictEqual(sc.max, 32); assert.strictEqual(sc.possible, sc.pts);
    const none = N.scorePo(nba26, po, null); assert.strictEqual(none.pts, 0); assert.strictEqual(none.possible, 32);
    const s = N.encodePo(lg, po); assert.strictEqual(s.split('_').length, 4); assert.deepStrictEqual(N.decodePo(nba26, s), po);
    assert.deepStrictEqual(N.decodePo(nba26, 'nyk.-.-.-.-.-.-.-'), Object.assign(N.emptyPo(lg), { r2: ['NYK', '', '', '', '', '', '', ''] }));
    const lists = { E: st.groups.E.map((r) => r.id), W: st.groups.W.map((r) => r.id) };
    const auto = N.poFromLists(nba26, lists);
    assert.deepStrictEqual(auto.r2, lists.E.slice(0, 4).concat(lists.W.slice(0, 4))); assert.deepStrictEqual(auto.f, [lists.E[0], lists.W[0]]); assert.strictEqual(auto.ch[0], lists.E[0]);
    assert.deepStrictEqual(N.cleanPo(nba26, auto), auto);
    assert.strictEqual(N.poFilled(auto), 15);
  });
  await t('MLB 2026 postseason in progress (World Series not decided)', () => {
    const r = N.poResults(mlbCtx, fx('po-mlb-2026.json').events);
    assert(r.started && !r.done); assert.strictEqual(r.champ, '');
    assert.deepStrictEqual(r.reached.ws.slice().sort(), ['MIL', 'TB']); assert.strictEqual(r.reached.ds.length, 8); assert.strictEqual(r.reached.cs.length, 4);
    assert(r.out.indexOf('MIL') < 0 && r.out.indexOf('TB') < 0); assert.strictEqual(r.out.length, 28);
    const sc = N.scorePo(mlbCtx, { ds: ['', '', '', '', '', '', '', ''], cs: ['', '', '', ''], ws: ['TB', 'MIL'], ch: ['MIL'] }, r);
    assert.strictEqual(sc.pts, 0, 'ws picks need their cs picks first'); // cleanPo drops ws picks not sent through the round before
    const p2 = { ds: ['TB', '', '', '', 'MIL', '', '', ''], cs: ['TB', '', 'MIL', ''], ws: ['TB', 'MIL'], ch: ['MIL'] };
    const s2 = N.scorePo(mlbCtx, p2, r);
    assert.strictEqual(s2.stages[3].picks[0].st, 'open'); assert.strictEqual(s2.pts, 2 + 4 + 8); assert.strictEqual(s2.possible, 2 + 4 + 8 + 8);
  });
  await t('NFL 2025 playoffs: single games, byes, Pro Bowl ignored', () => {
    const ctx = N.makeCtx('nfl', nfl);
    const r = N.poResults(ctx, fx('po-nfl-2025.json').events);
    assert(r.done); assert.strictEqual(r.champ, 'SEA'); assert.strictEqual(r.reached.wc.length, 12); assert.strictEqual(r.reached.dv.length, 8);
    assert.deepStrictEqual(r.reached.sb.slice().sort(), ['NE', 'SEA']); assert.strictEqual(r.out.length, 31);
  });

  // ---- standings function (fetch mocked) ----
  const apiDir = path.join(__dirname, '..', 'mes.fm', 'api');
  const S = require(path.join(apiDir, 'nba-standings.js'));
  function mockRes() { const r = { headers: {}, code: 0, body: null }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; }
  const realFetch = global.fetch;
  const espnMock = (u) => {
    if (/football\/nfl\/standings\?level=3|football\/nfl\/standings\?season=\d+&level=3/.test(u)) return fx('nfl-level3.json');
    if (/football\/nfl\/standings/.test(u)) return fx('nfl-standings.json');
    if (/football\/nfl\/teams/.test(u)) return fx('nfl-teams.json');
    if (/basketball\/nba\/standings\?season=2026/.test(u)) { const c = JSON.parse(JSON.stringify(FIX)); c.children.forEach((x) => { x.standings.season = 2026; }); return c; }
    if (/basketball\/nba\/standings/.test(u)) return FIX;
    if (/basketball\/nba\/scoreboard\?dates=2026/.test(u)) return fx('po-nba-2026.json');
    if (/scoreboard/.test(u)) return { events: [] };
    if (/teams/.test(u)) return { sports: [] };
    return null;
  };
  await t('standings function: leagues, caching, season param, playoffs by month, errors', async () => {
    const calls = [];
    global.fetch = async (u, o) => { calls.push(u); assert(!/https?:/.test(o.headers['user-agent']), 'no URL in the user agent'); if (/fail/.test(global.__mode || '')) return { ok: false, status: 500 }; const j = espnMock(u); return j ? { ok: true, json: async () => j } : { ok: false, status: 404 }; };
    S._reset();
    const res = mockRes(); await S({ query: {} }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.body)); assert.strictEqual(res.body.lg, 'nba'); assert.strictEqual(res.body.groups.E.length, 15); assert.strictEqual(res.body.season, 2027); assert.strictEqual(res.body.v, 2);
    assert.strictEqual(res.body.po, null, 'the 2027 playoffs have not started');
    assert(/s-maxage=600/.test(res.headers['cache-control']));
    const n0 = calls.length; await S({ query: {} }, mockRes()); assert.strictEqual(calls.length, n0, 'second call cached');
    const r2 = mockRes(); await S({ query: { season: '2026' } }, r2);
    assert(calls.some((u) => /standings\?season=2026$/.test(u)));
    assert(calls.some((u) => /scoreboard\?dates=202604&limit=1000/.test(u)) && calls.some((u) => /dates=202606/.test(u)));
    assert.strictEqual(r2.body.po.champ, 'NYK');
    const r3 = mockRes(); await S({ query: { lg: 'nfl' } }, r3);
    assert.strictEqual(r3.code, 200); assert.strictEqual(r3.body.groups.AFCE.length, 4); assert.strictEqual(r3.body.teams.filter((x) => x.id === 'KC')[0].c1, '#e31837');
    const r4 = mockRes(); await S({ query: { lg: 'cricket' } }, r4); assert.strictEqual(r4.code, 400);
    assert.strictEqual(S.seasonParam('abc'), null); assert.strictEqual(S.seasonParam('2027'), 2027); assert.strictEqual(S.lgParam('EPL'), 'epl');
    assert.deepStrictEqual(S.poDates(N.league('mlb'), 2026, new Date('2026-10-05T00:00:00Z')), ['20260928', '20260929', '20260930', '202610']);
    assert.deepStrictEqual(S.poDates(N.league('nfl'), 2026, new Date('2026-10-27T00:00:00Z')), []);
    S._reset(); global.__mode = 'fail';
    const bad = mockRes(); await S({ query: {} }, bad); assert.strictEqual(bad.code, 502); assert.strictEqual(bad.headers['cache-control'], 'no-store');
    global.__mode = '';
  });

  // ---- leaderboard function (fake Redis + mocked ESPN) ----
  await t('leaderboard: submit, update, delete, scoring, validation, limits, first-version entries and posts', async () => {
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
      const j = espnMock(u); return j ? { ok: true, json: async () => j } : { ok: false, status: 404 };
    };
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io'; process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    S._reset();
    const P = require(path.join(apiDir, 'nba-picks.js'));
    const req = (method, body, query) => ({ method, body, query: query || {}, headers: { 'x-forwarded-for': '1.2.3.4' }, socket: {} });
    const call = async (m, b, q) => { const r = mockRes(); await P(req(m, b, q), r); return r; };
    const bro = N.parseList(nbaCtx, BRO, nbaCtx.groups.E).ids, perfect = st.groups.E.map((r) => r.id), perfW = st.groups.W.map((x) => x.id), perfL = st.groups.L.map((x) => x.id);
    // a first-version post (top-level E)
    let r = await call('POST', { a: 'submit', name: 'Brother', E: bro });
    assert.strictEqual(r.code, 200, JSON.stringify(r.body)); const bid = r.body.id, bkey = r.body.key;
    assert(/^[a-z0-9]{10}$/.test(bid) && /^[a-f0-9]{32}$/.test(bkey));
    const stored = JSON.parse(hashes['nbap:2027:e'][bid]); assert.notStrictEqual(stored.h, bkey); assert.strictEqual(stored.gp.E, 3.3); assert.strictEqual(stored.L.W, undefined);
    // a first-version entry already in Redis (E / W at the top) is read too
    hashes['nbap:2027:e'].oldentry01 = JSON.stringify({ n: 'Old', E: perfect, W: null, h: 'x', c: 1, t: 1, gp: { E: 0 } });
    r = await call('POST', { a: 'submit', name: 'Me', L: { E: perfect, W: perfW, L: perfL }, P: { r2: perfect.slice(0, 4).concat(perfW.slice(0, 4)), cf: [], f: [], ch: [] } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.body)); const mid = r.body.id;
    assert.deepStrictEqual(JSON.parse(hashes['nbap:2027:e'][mid]).P.r2, perfect.slice(0, 4).concat(perfW.slice(0, 4)));
    // bad input
    assert.strictEqual((await call('POST', { a: 'submit', name: 'X', E: bro.slice(0, 14) })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'X', L: { E: bro.map(() => 'PHI') } })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'X', W: bro })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'X', L: { Q: bro } })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: '<script>', E: bro })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'shithead', E: bro })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'Ok' })).code, 400);
    assert.strictEqual((await call('POST', { a: 'submit', name: 'Ok', E: bro, season: 2026 })).code, 409);
    assert.strictEqual((await call('POST', { lg: 'cricket', a: 'submit', name: 'Ok', E: bro })).code, 400);
    // boards
    r = await call('GET', null, { board: 'E', m: 'w3' });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.total, 3);
    assert.strictEqual(r.body.rows[0].m.w3, 15); assert.strictEqual(r.body.rows[2].n, 'Brother'); assert.strictEqual(r.body.rows[2].m.w3, 11); assert.strictEqual(r.body.rows[2].L.E, N.encodeList(bro));
    assert.strictEqual((await call('GET', null, { board: 'both' })).body.total, 1, 'both = all conferences');
    assert.strictEqual((await call('GET', null, { board: 'L', m: 'exact' })).body.rows[0].m.exact, 30);
    assert.strictEqual((await call('GET', null, { board: 'W', m: 'bogus' })).body.m, 'w3');
    assert.strictEqual((await call('GET', null, { board: 'E', m: 'top10' })).body.m, 'cut');
    const pb = await call('GET', null, { board: 'P' }); assert.strictEqual(pb.body.total, 1); assert.strictEqual(pb.body.rows[0].m.max, 32); assert.strictEqual(pb.body.rows[0].m.pts, 0);
    // a tie goes to the earlier pick
    r = await call('GET', null, { board: 'E', m: 'exact' }); assert.deepStrictEqual(r.body.rows.slice(0, 2).map((x) => [x.n, x.r]), [['Old', 1], ['Me', 1]]);
    // update / delete need the key
    assert.strictEqual((await call('POST', { a: 'update', id: bid, key: 'f'.repeat(32), name: 'Hacked' })).code, 403);
    assert.strictEqual((await call('POST', { a: 'delete', id: bid, key: 'f'.repeat(32) })).code, 403);
    r = await call('POST', { a: 'update', id: bid, key: bkey, name: 'Bro', L: { E: perfect, L: perfL } }); assert.strictEqual(r.code, 200);
    const up = JSON.parse(hashes['nbap:2027:e'][bid]); assert.strictEqual(up.n, 'Bro'); assert.deepStrictEqual(Object.keys(up.L).sort(), ['E', 'L']);
    assert.strictEqual((await call('POST', { a: 'update', id: bid, key: bkey, L: { E: null, L: null } })).code, 400, 'cannot remove everything');
    r = await call('GET', null, { id: bid }); assert.strictEqual(r.body.n, 'Bro'); assert.strictEqual(r.body.L.E, N.encodeList(perfect));
    assert.strictEqual((await call('POST', { a: 'delete', id: bid, key: bkey })).code, 200);
    assert.strictEqual((await call('GET', null, { id: bid })).code, 404);
    assert.strictEqual((await call('POST', { a: 'remove', admin: 'x', id: mid })).code, 403, 'admin disabled without env');
    // another league uses its own key
    r = await call('POST', { lg: 'nfl', a: 'submit', name: 'Gridiron', L: { AFCE: ['BUF', 'NE', 'MIA', 'NYJ'] } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.body)); assert(hashes['picks:nfl:2026:e'][r.body.id]);
    assert.strictEqual((await call('GET', null, { lg: 'nfl', board: 'D' })).body.total, 0, 'one division is not all divisions');
    assert.strictEqual((await call('GET', null, { lg: 'nfl', board: 'AFC' })).body.board, 'AFC');
    // rate limit: 20 writes per hour per IP
    let last; for (let i = 0; i < 10; i++) last = await call('POST', { a: 'submit', name: 'Spam' + i, E: bro });
    assert.strictEqual(last.code, 429);
    delete process.env.UPSTASH_REDIS_REST_URL;
    assert.strictEqual((await call('GET', null, {})).code, 503);
  });
  await t('leaderboard: a finished season closes the tables, started playoffs close playoff picks', async () => {
    const hashes = {};
    global.fetch = async (u, o) => {
      if (/upstash/.test(u)) { const cmds = JSON.parse(o.body); return { json: async () => cmds.map(([cmd, k, a, b]) => ({ result: cmd === 'INCR' ? 1 : cmd === 'HLEN' ? 0 : cmd === 'HSETNX' ? ((hashes[a] = b), 1) : cmd === 'HGETALL' ? [] : 1 })) }; }
      if (/baseball\/mlb\/standings\?level=3/.test(u)) return { ok: true, json: async () => fx('mlb-level3.json') };
      if (/baseball\/mlb\/standings/.test(u)) return { ok: true, json: async () => fx('mlb-standings.json') };
      if (/baseball\/mlb\/scoreboard/.test(u)) return { ok: true, json: async () => (/dates=202610/.test(u) ? fx('po-mlb-2026.json') : { events: [] }) };
      return { ok: false, status: 404 };
    };
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    S._reset();
    const P = require(path.join(apiDir, 'nba-picks.js'));
    const call = async (b) => { const r = mockRes(); await P({ method: 'POST', body: b, query: {}, headers: {}, socket: {} }, r); return r; };
    const al = mlbCtx.groups.AL.slice();
    let r = await call({ lg: 'mlb', a: 'submit', name: 'Late', L: { AL: al } }); assert.strictEqual(r.code, 409); assert(/over/.test(r.body.error));
    r = await call({ lg: 'mlb', a: 'submit', name: 'Late', P: { ds: ['TB', '', '', '', '', '', '', ''] } }); assert.strictEqual(r.code, 409); assert(/playoffs have started/.test(r.body.error));
  });
  global.fetch = realFetch;
  console.log(process.exitCode ? 'some tests FAILED' : 'all ' + pass + ' test groups passed');
})();
