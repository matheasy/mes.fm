// Tests for MES Elections (tool_apps_src/elections/lib.js + mes.fm/api/elections.js). Run: node tool_apps_src/elections-tests.js
// Fixtures in tool_apps_src/elections/fixtures were recorded on 2026-10-27 (Polymarket events trimmed to the fields we read).
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const DIR = path.join(__dirname, 'elections'), API = path.join(__dirname, '..', 'mes.fm', 'api');
const E = require(path.join(DIR, 'lib.js'));
const fx = (n) => fs.readFileSync(path.join(DIR, 'fixtures', n), 'utf8');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; } };

t('api lib is a byte-identical copy', () => assert.strictEqual(fs.readFileSync(path.join(API, '_elections-lib.js'), 'utf8'), fs.readFileSync(path.join(DIR, 'lib.js'), 'utf8'), 'run: cp tool_apps_src/elections/lib.js mes.fm/api/_elections-lib.js'));

const ev = JSON.parse(fx('polymarket_midterms.json'));
const R = E.parseRaces(ev);
t('race kinds from titles', () => {
	assert.deepStrictEqual(E.raceKind('AZ-01 House Election Winner'), { kind: 'H', st: 'AZ', dist: '01', key: 'H-AZ-01' });
	assert.deepStrictEqual(E.raceKind('CA-40 House Election Winner (Individual)').key, 'H-CA-40');
	assert.strictEqual(E.raceKind('AK-AL House Election Winner').dist, 'AL');
	assert.strictEqual(E.raceKind('Nebraska Senate Election Winner  ').key, 'S-NE');
	assert.strictEqual(E.raceKind('Georgia Lieutenant Governor Election Winner'), null);
	assert.strictEqual(E.raceKind('Nevada Governor Election: Turnout'), null);
	assert.strictEqual(E.raceKind('ZZ-01 House Election Winner'), null);
});
t('parseRaces on the recorded fixture', () => {
	assert.deepStrictEqual(R.H.map((r) => r.key), ['H-AK-AL', 'H-AZ-01', 'H-CA-40', 'H-ME-02', 'H-NC-13']);
	assert.deepStrictEqual(R.S.map((r) => r.key), ['S-AK', 'S-GA', 'S-ME', 'S-NE']);
	assert.deepStrictEqual(R.G.map((r) => r.key), ['G-AK', 'G-AZ', 'G-CA']);
	const az = R.H[1]; assert.strictEqual(az.pD, 79.5); assert.strictEqual(az.pR, 20.5); assert.strictEqual(az.c[0].n, 'Amish Shah');
	const ca40 = R.H[2]; assert.strictEqual(ca40.pR, 100, 'two Republicans (hand table)');
	const ak = R.H[0]; assert.strictEqual(ak.c[1].n, 'Bill Hill'); assert.strictEqual(ak.c[1].pt, 'I'); assert.ok(ak.pO > 20);
	const ne = R.S[3]; assert.strictEqual(ne.c[1].pt, 'I'); assert.strictEqual(ne.oP, 'I');
	const aks = R.S[0]; assert.strictEqual(aks.c[0].pt, 'D'); assert.strictEqual(aks.c[1].n, 'Dan Sullivan');
	[].concat(R.H, R.S, R.G).forEach((r) => assert.ok(Math.abs(r.pD + r.pR + r.pO - 100) < 0.3, r.key + ' shares sum to 100'));
});
t('settled race (closed market at 1) is marked with the winning party', () => {
	const e = JSON.parse(JSON.stringify(ev.find((x) => x.slug === 'az-01-house-election-winner')));
	e.markets.forEach((m) => { m.closed = true; if (/Republican/.test(m.question)) m.outcomePrices = '["1","0"]'; else if (m.outcomePrices) m.outcomePrices = '["0","1"]'; });
	const r = E.raceFromEvent(e); assert.strictEqual(r.res, 'R'); assert.strictEqual(E.favourite(r, 40), 'R', 'a settled race ignores the shift');
	const both = E.parseRaces([ev.find((x) => x.slug === 'az-01-house-election-winner'), e]); assert.strictEqual(both.H[0].res, 'R', 'settled event wins over the open one');
});
t('overview markets', () => {
	const o = E.parseOverview(ev);
	assert.deepStrictEqual(Object.keys(o).sort(), ['balance', 'house', 'rgovs', 'rsenseats', 'senate']);
	assert.strictEqual(o.house.oc[0].l, 'Democratic Party'); assert.strictEqual(o.rsenseats.oc[0].l, '≤47');
	assert.ok(!o.balance.oc.some((x) => /^other$/i.test(x.l) && x.p < 0.2));
});
t('kalshi control', () => {
	const h = E.parseKalshiControl(JSON.parse(fx('kalshi_controlh.json'))), s = E.parseKalshiControl(JSON.parse(fx('kalshi_controls.json')));
	assert.ok(h.D > 50 && h.R < 50 && h.contracts > 0); assert.strictEqual(h.url, 'https://kalshi.com/markets/controlh'); assert.ok(s.D != null && s.R != null);
	assert.throws(() => E.parseKalshiControl({ events: [] }));
});
t('shift on the log-odds scale', () => {
	assert.deepStrictEqual(E.shifted(50, 50, 0), { D: 50, R: 50 });
	assert.strictEqual(E.shifted(50, 50, 10).D, 60);
	assert.strictEqual(E.shifted(50, 50, -10).R, 60);
	assert.ok(E.shifted(95, 5, -10).D > 90, 'a lopsided race barely moves');
	const s = E.shifted(70, 20, 5); assert.ok(Math.abs(s.D + s.R - 90) < 0.2, 'keeps the D+R total');
});
t('chamber control rules', () => {
	// Senate: 35 races; holdovers D 32 + I 2, R 31; VP is R
	let c = E.chamber('S', { D: 17, R: 18, I: 0, U: 0 }, ''); assert.strictEqual(c.Dcaucus, 51); assert.strictEqual(c.ctl, 'D');
	c = E.chamber('S', { D: 16, R: 19, I: 0, U: 0 }, ''); assert.strictEqual(c.Rcaucus, 50); assert.strictEqual(c.ctl, 'R'); assert.ok(/Vice President/.test(c.note));
	c = E.chamber('S', { D: 16, R: 18, I: 1, U: 0 }, ''); assert.strictEqual(c.ctl, null, 'an uncommitted independent leaves it open');
	c = E.chamber('S', { D: 16, R: 18, I: 1, U: 0 }, 'D'); assert.strictEqual(c.ctl, 'D', 'with D: 51');
	c = E.chamber('S', { D: 16, R: 18, I: 1, U: 0 }, 'R'); assert.strictEqual(c.ctl, 'R');
	c = E.chamber('H', { D: 218, R: 217, I: 0, U: 0 }, ''); assert.strictEqual(c.ctl, 'D');
	c = E.chamber('H', { D: 217, R: 217, I: 1, U: 0 }, ''); assert.strictEqual(c.ctl, null); assert.strictEqual(c.need.D, 1);
	c = E.chamber('H', { D: 200, R: 200, I: 0, U: 0 }, '', 35); assert.strictEqual(c.U, 35);
	c = E.chamber('G', { D: 18, R: 18, I: 0, U: 0 }, ''); assert.strictEqual(c.D, 24); assert.strictEqual(c.R, 26);
});
t('seat facts add up', () => {
	assert.strictEqual(E.SENATE_2026.length, 35); assert.strictEqual(E.GOV_2026.length, 36);
	const up = { D: 0, R: 0 }; E.SENATE_2026.forEach((x) => up[x[2]]++);
	assert.strictEqual(up.D + E.SENATE.hold.D, E.SENATE.now.D); assert.strictEqual(up.R + E.SENATE.hold.R, E.SENATE.now.R);
	const g = { D: 0, R: 0 }; E.GOV_2026.forEach((x) => g[x[2]]++);
	assert.strictEqual(g.D + E.GOV.hold.D, E.GOV.now.D); assert.strictEqual(g.R + E.GOV.hold.R, E.GOV.now.R);
	assert.strictEqual(Object.values(E.APPORTION).reduce((a, b) => a + b, 0), 435);
	const H = E.HOUSE.now; assert.strictEqual(H.R + H.D + H.I + H.V, 435);
	Object.keys(E.STATES).forEach((s) => { assert.ok(E.TILES[s], 'tile for ' + s); assert.ok(E.RESULTS_URLS[s], 'results link for ' + s); });
	const pos = {}; Object.values(E.TILES).forEach((p) => { const k = p.join(','); assert.ok(!pos[k], 'two tiles at ' + k); pos[k] = 1; });
});
t('outcome + picks', () => {
	const o = E.outcome(R.S, {}); assert.strictEqual(o.n.D + o.n.R + o.n.I + o.n.U, R.S.length);
	const o2 = E.outcome(R.S, { picks: { 'S-GA': 'R' } }); assert.strictEqual(o2.by['S-GA'], 'R');
	const o3 = E.outcome(R.S, { base: 'blank' }); assert.strictEqual(o3.n.U, R.S.length);
	assert.strictEqual(E.encodePicks({ 'S-GA': 'R', 'H-AZ-01': 'D' }), 'H-AZ-01:D,S-GA:R');
	assert.deepStrictEqual(E.decodePicks('H-AZ-01:D,S-GA:R,bad:X,H-AK-AL:I,<x>:D'), { 'H-AZ-01': 'D', 'S-GA': 'R', 'H-AK-AL': 'I' });
	const sm = E.sumShares(R.S); assert.ok(Math.abs(sm.D + sm.R + sm.O - R.S.length) < 0.05);
});
t('hemicycle has n points inside the box', () => {
	[35, 93, 100, 343, 435].forEach((k) => { const p = E.hemicycle(k); assert.strictEqual(p.length, k); p.forEach((q) => assert.ok(q.x - q.r > -0.01 && q.x + q.r < 1.01 && q.y >= -0.01 && q.y <= 0.51)); });
});
t('Canada and BC tables', () => {
	[E.CA2025, E.BC2024, E.BC2026].forEach((D) => {
		assert.strictEqual(D.parties.reduce((a, p) => a + p.s, 0), D.seats, D.id + ' seats add up');
		assert.ok(Math.abs(D.parties.reduce((a, p) => a + p.pc, 0) - 100) < 0.3, D.id + ' vote shares add to 100');
		assert.strictEqual(D.majority, Math.floor(D.seats / 2) + 1);
	});
	assert.strictEqual(E.CA2025.parties[0].s, 169); assert.strictEqual(E.BC2024.parties[0].s, 47); assert.strictEqual(E.BC2026.parties[0].s, 63);
});
t('proportional allocation', () => {
	const ps = [{ k: 'A', v: 340000, pc: 34 }, { k: 'B', v: 280000, pc: 28 }, { k: 'C', v: 160000, pc: 16 }, { k: 'D', v: 60000, pc: 6 }, { k: 'E', v: 150000, pc: 15 }, { k: 'F', v: 10000, pc: 1 }];
	// textbook example: 10 seats, D'Hondt
	assert.deepStrictEqual(E.proportional(ps, 10, 'dhondt', 0), { A: 4, B: 3, C: 2, D: 0, E: 1, F: 0 });
	['dhondt', 'sl', 'hare'].forEach((m) => { const r = E.proportional(E.CA2025.parties, 343, m, 0); assert.strictEqual(Object.values(r).reduce((a, b) => a + b, 0), 343, m); });
	assert.strictEqual(E.proportional(E.CA2025.parties, 343, 'sl', 5).GPC, 0, 'threshold drops small parties');
	assert.strictEqual(E.proportional(E.CA2025.parties, 343, 'hare', 0).OTH, 0, 'others never get seats');
});
t('coalitions are minimal and reach the majority', () => {
	const c = E.coalitions(E.CA2025.parties, 172);
	assert.deepStrictEqual(c.map((x) => x.ks.join('+')), ['LPC+CPC', 'LPC+BQ', 'LPC+NDP', 'CPC+BQ+NDP']);
	assert.strictEqual(E.coalitions(E.BC2026.parties, 47)[0].ks.join(), 'CON');
});
t('Elections BC results page', () => {
	const b = E.parseBcEnr(fx('bc_enr.html'));
	const by = {}; b.parties.forEach((p) => { by[p.k || p.n] = p; });
	assert.strictEqual(by.CON.s, 63); assert.strictEqual(by.NDP.s, 28); assert.strictEqual(by.GRN.s, 2); assert.strictEqual(by.CON.v, 862688);
	assert.strictEqual(b.parties.reduce((a, p) => a + p.s, 0), 93);
	assert.strictEqual(b.turnout, 48.14); assert.strictEqual(b.initial, 'Complete'); assert.strictEqual(b.final, 'November 6, 2026'); assert.ok(/October 26, 2026/.test(b.asOf));
	assert.throws(() => E.parseBcEnr('<html>nothing</html>'));
});
t('House of Commons standings csv', () => {
	const c = E.parseCommonsCsv(fx('commons_standings.csv'));
	assert.strictEqual(c.total, 343); assert.ok(c.by.Liberal > 150 && c.by.Conservative > 100);
	assert.throws(() => E.parseCommonsCsv('a,b,c\n1,2,3'));
});
t('calendar rows are well formed and in order', () => {
	let prev = 0;
	E.CALENDAR.forEach((r) => {
		assert.ok(/^\d{4}(-\d\d(-\d\d)?)?$/.test(r[0]), r[0]); assert.ok(['ca', 'us', 'world'].indexOf(r[2]) >= 0); assert.ok(/^https:\/\//.test(r[6]), r[3]);
		const tm = E.calTime(r[0]); assert.ok(isFinite(tm)); assert.ok(tm >= prev, 'sorted at ' + r[3]); prev = tm;
		if (r[1]) assert.ok(!/^\d{4}-\d\d-\d\d$/.test(r[0]) || /before|ends|expected/i.test(r[1]), 'approx text for ' + r[3]);
	});
	E.RECENT.forEach((r) => { assert.ok(/^https:\/\//.test(r[5])); assert.ok(/^2026-/.test(r[0])); });
	assert.ok(E.upcoming(Date.UTC(2026, 10, 2), 'us').some((r) => r[0] === '2026-11-03'));
	assert.ok(!E.upcoming(Date.UTC(2026, 10, 5), 'us').some((r) => r[0] === '2026-11-03'));
});
t('every glossary key used on the page exists', () => {
	const src = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'content.html'), 'utf8');
	const keys = new Set(); let m; const re = /data-g="([a-z0-9]+)"|\bq\('([a-z0-9]+)'\)/g;
	while ((m = re.exec(src))) keys.add(m[1] || m[2]);
	keys.forEach((k) => assert.ok(E.GLOSSARY[k], 'glossary entry for ' + k));
});
t('neutral wording: no rating words in the hand-written text', () => {
	const txt = JSON.stringify([E.GLOSSARY, E.CALENDAR, E.RECENT, E.CA2025, E.BC2024, E.BC2026, E.REDISTRICT]) + fs.readFileSync(path.join(DIR, 'content.html'), 'utf8');
	['landslide', 'stunning', 'crushing', 'radical', 'extreme', 'far-left', 'far-right', 'disastrous', 'triumph', 'humiliat', 'wave election', 'safe seat', 'likely D', 'likely R', 'lean D', 'lean R'].forEach((w) => assert.ok(txt.toLowerCase().indexOf(w.toLowerCase()) < 0, 'found "' + w + '"'));
});

// aggregator with a mocked fetch
const realFetch = global.fetch;
function mockFetch(fail) {
	return async (url) => {
		const u = String(url), ok = (body, text) => ({ ok: true, status: 200, json: async () => body, text: async () => (text != null ? text : JSON.stringify(body)) });
		if (fail && fail.test(u)) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
		if (/gamma-api\.polymarket\.com/.test(u)) { const off = +(/offset=(\d+)/.exec(u) || [0, 0])[1]; return ok(/closed=true/.test(u) || off > 0 ? [] : ev); }
		if (/CONTROLH/.test(u)) return ok(JSON.parse(fx('kalshi_controlh.json')));
		if (/CONTROLS/.test(u)) return ok(JSON.parse(fx('kalshi_controls.json')));
		if (/ourcommons/.test(u)) return ok(null, fx('commons_standings.csv'));
		if (/elections\.bc\.ca/.test(u)) return ok(null, fx('bc_enr.html'));
		throw new Error('unexpected ' + u);
	};
}
(async () => {
	const api = require(path.join(API, 'elections.js'));
	try {
		global.fetch = mockFetch();
		let o = await api.collect();
		t('aggregator: every source ok', () => { Object.entries(o.sources).forEach(([k, s]) => assert.ok(s.ok, k + ': ' + s.error)); assert.strictEqual(o.sources.races.data.races.S.length, 4); assert.strictEqual(o.sources.bcenr.data.parties.length, 12); });
		global.fetch = mockFetch(/kalshi/);
		o = await api.collect();
		t('aggregator: one source down blanks only its card', () => { assert.ok(!o.sources.kalshiH.ok && o.sources.races.ok && o.sources.commons.ok); });
		global.fetch = mockFetch(/./);
		let code = 0, hdr = {}; const res = { setHeader: (k, v) => { hdr[k] = v; }, status: (c) => { code = c; return { json: () => {} }; } };
		await api({ query: {} }, res);
		t('aggregator: everything down -> 502, not cached', () => { assert.strictEqual(code, 502); assert.strictEqual(hdr['Cache-Control'], 'no-store'); });
		global.fetch = mockFetch(); code = 0; hdr = {};
		await api({ query: { x: 'ignored' } }, res);
		t('aggregator: ok -> 200 with edge cache', () => { assert.strictEqual(code, 200); assert.ok(/s-maxage=300/.test(hdr['Cache-Control'])); });
	} finally { global.fetch = realFetch; }
	t('sample.json is present and parses', () => { const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'elections', 'data', 'sample.json'), 'utf8')); assert.ok(s.sources.races.ok); assert.ok(s.sources.races.data.races.H.length > 400); });
	console.log(process.exitCode ? 'elections tests FAILED' : 'elections tests: ' + n + ' passed');
})();
