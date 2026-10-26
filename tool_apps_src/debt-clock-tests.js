// Tests for MES Debt Clock: node tool_apps_src/debt-clock-tests.js
// Pure lib checks on recorded answers (tool_apps_src/debt-clock/fixtures/, captured 2026-10-25 by `node mes.fm/api/debt.js --fixtures`)
// + the aggregator mes.fm/api/debt.js with a mocked fetch (all answer, one down, all down).
const fs = require('fs'), path = require('path'), assert = require('assert');
const D = require('./debt-clock/lib.js');
const FX = path.join(__dirname, 'debt-clock', 'fixtures'), fx = (f) => fs.readFileSync(path.join(FX, f), 'utf8'), fj = (f) => JSON.parse(fx(f));
let n = 0, fail = 0;
async function t(name, fn) { try { await fn(); n++; } catch (e) { fail++; console.log('FAIL', name, '\n  ', e && e.stack || e); } }
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

(async () => {
	await t('api copy of the lib is byte-identical', () => assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'api', '_debt-lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, 'debt-clock', 'lib.js'), 'utf8'), 'run: cp tool_apps_src/debt-clock/lib.js mes.fm/api/_debt-lib.js'));

	await t('Debt to the Penny', () => {
		const r = D.parsePenny(fj('penny.json'));
		assert(r.length > 300); assert(r[0][0] < r[r.length - 1][0], 'oldest first');
		const l = r[r.length - 1]; assert(l[1] > 3e13 && l[1] < 1e14, 'total in tens of trillions');
		near(l[2] + l[3], l[1], 5, 'public + intragovernmental = total');
		assert.throws(() => D.parsePenny({}));
		assert.throws(() => D.parsePenny({ data: [] }));
	});

	await t('history since 1790', () => {
		const h = D.parseHistory(fj('history.json'));
		assert.strictEqual(h[0][0], '1790-01-01'); near(h[0][1], 71060508.5, 1); assert(h.length > 200);
		assert(h[h.length - 1][1] > 3e13);
	});

	await t('interest expense', () => {
		const i = D.parseInterest(fj('interest.json'));
		assert(i.nMonths === 12 || i.nMonths === 13 || i.nMonths <= 12); assert(i.ttmPublic > 5e11 && i.ttmPublic < 3e12); assert(i.ttmTotal > i.ttmPublic);
		assert.strictEqual(D.fiscalYear(i.asOf), i.fyOfLast);
		const fy = D.parseInterestFy(fj('interestFy.json'));
		assert(fy.length >= 10); assert(fy[0][0] >= 2010); assert(fy.every((r) => r[2] >= r[1]));
		// whole-fiscal-year public interest at September equals the September fytd of the recent query
		const last = fy[fy.length - 1]; if (i.asOf.slice(5, 7) === '09' && +i.asOf.slice(0, 4) === last[0]) near(last[1], i.fytdPublic, 2);
	});

	await t('fiscal year', () => { assert.strictEqual(D.fiscalYear('2026-09-30'), 2026); assert.strictEqual(D.fiscalYear('2026-10-01'), 2027); });

	await t('average interest rate', () => { const a = D.parseAvgRates(fj('avgRate.json')); assert(a.latest[1] > 0.5 && a.latest[1] < 10); assert(a.series[0][0] < a.latest[0]); });

	await t('Monthly Treasury Statement', () => {
		const m = D.parseMts(fj('mts.json'));
		assert(m.fy >= 2026); assert(m.ytd.deficit > 0 && m.ytd.deficit < 1e13); assert(m.monthsIn >= 1 && m.monthsIn <= 12);
		const sum = m.months.reduce((s, x) => s + x.deficit, 0); near(sum, m.ytd.deficit, 1e6, 'months add up to year-to-date');
		near(m.ytd.outly - m.ytd.rcpt, m.ytd.deficit, 1e6, 'deficit = outlays - receipts');
		assert(m.prev && m.prev.fy === m.fy - 1);
	});

	await t('FRED csv', () => {
		const g = D.parseFredCsv(fx('fred_GDP.csv')); assert(g.length >= 4 && g[g.length - 1][1] > 20000);
		const p = D.parseFredCsv(fx('fred_POPTHM.csv')); assert(p[p.length - 1][1] > 300000 && p[p.length - 1][1] < 400000, 'population in thousands');
		const r = D.parseFredCsv(fx('fred_GFDEGDQ188S.csv')); assert(r[0][0] === '1966-01-01'); assert(r[r.length - 1][1] > 50);
		assert.deepStrictEqual(D.parseFredCsv('observation_date,X\n2026-01-01,.\n2026-01-02,1.5\n'), [['2026-01-02', 1.5]]);
		assert.throws(() => D.parseFredCsv('<html>'));
	});

	await t('rate over a window (extrapolation maths)', () => {
		const rows = [['2026-01-01', 100], ['2026-01-02', 110], ['2026-01-05', 130], ['2026-01-11', 160]];
		const r = D.rateOver(rows, 7);
		assert.deepStrictEqual(r.from, ['2026-01-02', 110], 'last day on or before latest - 7 days'); assert.strictEqual(r.days, 9); near(r.perDay, 50 / 9, 1e-9);
		near(r.perSec * 86400, r.perDay, 1e-9); near(r.perMs * 864e5, r.perDay, 1e-9);
		const all = D.rateOver(rows, 1000); assert.deepStrictEqual(all.from, ['2026-01-01', 100], 'window longer than the data uses the first point');
		assert.strictEqual(D.rateOver([['2026-01-01', 1]], 30), null);
		// estimate: one day after t0 at 50/9 per day
		const t0 = D.asOfMs('2026-01-11'); near(D.estimate(160, t0, r.perMs, t0 + 864e5), 160 + 50 / 9, 1e-9);
		near(D.estimate(160, t0, r.perMs, t0), 160, 0);
		// reach a target: 160 -> 170 at 50/9 a day = 1.8 days
		near((D.reachAt(160, t0, r.perMs, 170) - t0) / 864e5, 1.8, 1e-9);
		assert.strictEqual(D.reachAt(160, t0, -1, 170), null, 'falling debt never reaches a higher target');
		assert.strictEqual(D.nextMilestone(40.44e12, 1e12), 41e12); assert.strictEqual(D.nextMilestone(41e12, 1e12), 42e12);
		// on the real data: windows give positive rates, the 365-day window starts about a year back
		const p = D.parsePenny(fj('penny.json')), y = D.rateOver(p, 365);
		assert(y.days >= 362 && y.days <= 369); assert(y.perDay > 0); near(y.perDay * y.days, y.to[1] - y.from[1], 1);
		const pub = D.rateOver(p, 90, 2); assert(pub.to[1] === p[p.length - 1][2]);
	});

	await t('per person / household / taxpayer', () => {
		const h = D.perHead(1e12, { people: 4e8, households: 1e8, taxpayers: D.TAXPAYERS });
		assert.strictEqual(h.people, 2500); assert.strictEqual(h.households, 10000); near(h.taxpayers, 6250, 1e-9);
		assert.strictEqual(D.perHead(1, { people: 0 }).people, null);
		assert(/IRS/.test(D.TAXPAYERS_NOTE));
		// real counts from FRED: POPTHM and TTLHH are in thousands
		const pop = D.last(D.parseFredCsv(fx('fred_POPTHM.csv')))[1] * 1000, hh = D.last(D.parseFredCsv(fx('fred_TTLHH.csv')))[1] * 1000;
		const per = D.perHead(D.parsePenny(fj('penny.json')).pop()[1], { people: pop, households: hh, taxpayers: D.TAXPAYERS });
		assert(per.people > 80000 && per.people < 200000, 'about $118k per person in 2026'); assert(per.households > per.people * 2);
	});

	await t('IMF table and world total', () => {
		const years = ['2024', '2025', '2026', '2027'];
		const imf = D.parseImf(fj('imf_GGXWDG_NGDP.json'), fj('imf_NGDPD.json'), fj('imf_LP.json'), fj('imf_countries.json'), years);
		assert(imf.rows.length >= 50); assert(imf.groups.WEOWORLD && imf.groups.WEOWORLD.name === 'World');
		assert(!imf.rows.some((r) => r.code === 'WEOWORLD'), 'groups are not countries');
		const tab = D.countryTable(imf, 2025), us = tab.find((r) => r.code === 'USA'), ca = tab.find((r) => r.code === 'CAN');
		assert(us && ca); near(us.debt, us.pct / 100 * us.gdp, 1); assert(us.debt > 2e13); assert(us.perPerson > 50000);
		assert(ca.pct > 60 && ca.pct < 150);
		const w = D.worldTotal(imf, 2025); assert(w.viaRatio > 5e13, 'world debt ~ $100+ trillion'); assert(w.n >= 50 && w.sum > 0);
		assert(w.worldPct > 50 && w.worldPct < 150);
		// parse with the full country list vs no labels: unnamed codes are dropped
		assert.throws(() => D.parseImf(fj('imf_GGXWDG_NGDP.json'), fj('imf_NGDPD.json'), null, { countries: {} }, years));
		assert.throws(() => D.parseImf({}, {}, null, {}, years));
	});

	await t('year line between two annual estimates', () => {
		const l = D.yearLine(100, 112, 2025, 2026);
		near(l.perDay * 365, 12, 1e-9); near(D.estimate(l.base, l.t0, l.perMs, l.t0 - 365 * 864e5), 100, 1e-9);
	});

	await t('Statistics Canada + Bank of Canada', () => {
		const sc = fj('statcan_debt.json'), fed = D.parseStatcan(sc[0]);
		assert(fed.length > 24); assert(fed[fed.length - 1][1] > 5e11 && fed[fed.length - 1][1] < 5e12, 'federal debt in CAD, scaled from millions');
		assert(fed.every((p) => p[1] !== null), 'missing months dropped');
		const c = D.canadaClock(fed, 12); assert(c.date === D.monthEnd(fed[fed.length - 1][0])); assert(c.rate.days > 300);
		assert.strictEqual(D.monthEnd('2026-02-01'), '2026-02-28'); assert.strictEqual(D.monthEnd('2024-02-01'), '2024-02-29'); assert.strictEqual(D.monthEnd('2026-12-01'), '2026-12-31');
		const v = fj('statcan_vec.json'), pop = D.last(D.parseStatcan(v[0])), gdp = D.last(D.parseStatcan(v[1]));
		assert(pop[1] > 3e7 && pop[1] < 6e7); assert(gdp[1] > 1e12, 'nominal GDP x 10^6');
		assert.throws(() => D.parseStatcan({ status: 'FAILED' }));
		const fx2 = D.parseValet(fj('valet_fx.json'), 'FXUSDCAD'); assert(fx2[fx2.length - 1][1] > 1 && fx2[fx2.length - 1][1] < 2);
		near(D.convert(100, 'USD', 'CAD', 1.4), 140, 1e-9); near(D.convert(140, 'CAD', 'USD', 1.4), 100, 1e-9); assert.strictEqual(D.convert(5, 'USD', 'USD', 1.4), 5);
	});

	await t('formatting', () => {
		assert.strictEqual(D.full(40444342709389.15), '$40,444,342,709,389');
		assert.strictEqual(D.full(1234.5, 'CAD', 2), 'C$1,234.50');
		assert.strictEqual(D.full(-5), '−$5');
		assert.strictEqual(D.big(40.444e12), '$40.44 trillion'); assert.strictEqual(D.big(1.07e12, 'USD', 1), '$1.1 trillion');
		assert.strictEqual(D.big(9.75e8), '$975.00 million'); assert.strictEqual(D.big(118000), '$118,000');
		assert.strictEqual(D.short(4.04e13), '40T'); assert.strictEqual(D.short(5e11), '500B'); assert.strictEqual(D.short(1.5e9), '1.5B');
		assert.strictEqual(D.pct(122.5939), '122.6%'); assert.strictEqual(D.pct(null), '–');
		assert.strictEqual(D.commas(1234567.891, 2), '1,234,567.89');
	});

	await t('glossary covers every data-g / q() key used by the page', () => {
		const html = fs.readFileSync(path.join(__dirname, 'debt-clock', 'content.html'), 'utf8') + fs.readFileSync(path.join(__dirname, 'debt-clock', 'app.js'), 'utf8');
		const keys = new Set(); let m; const re = /data-g="(\w+)"|\bq\('(\w+)'\)/g;
		while ((m = re.exec(html))) keys.add(m[1] || m[2]);
		assert(keys.size >= 8, 'page uses the glossary'); keys.forEach((k) => assert(D.GLOSSARY[k], 'no glossary entry for ' + k));
	});

	// ---------- the aggregator with a mocked fetch ----------
	const realFetch = global.fetch;
	function mock(down) {
		global.fetch = async (url, opts) => {
			const u = String(url), body = opts && opts.body ? String(opts.body) : '';
			const ok = (x, isText) => ({ ok: true, status: 200, json: async () => (isText ? JSON.parse(x) : x), text: async () => (isText ? x : JSON.stringify(x)) });
			const pick = () => {
				if (u.includes('debt_to_penny')) return ['penny', fj('penny.json')];
				if (u.includes('debt_outstanding')) return ['history', fj('history.json')];
				if (u.includes('interest_expense') && u.includes('record_calendar_month')) return ['interestFy', fj('interestFy.json')];
				if (u.includes('interest_expense')) return ['interest', fj('interest.json')];
				if (u.includes('avg_interest_rates')) return ['avgRate', fj('avgRate.json')];
				if (u.includes('mts_table_1')) return ['mts', fj('mts.json')];
				if (u.includes('fredgraph')) { const id = /id=(\w+)/.exec(u)[1]; return ['fred', fx('fred_' + id + '.csv'), true]; }
				if (u.includes('datamapper')) { const id = u.split('/').pop(); return ['imf', fj(id === 'countries' ? 'imf_countries.json' : 'imf_' + id + '.json')]; }
				if (u.includes('statcan')) return ['canada', body.includes('productId') ? fj('statcan_debt.json') : fj('statcan_vec.json')];
				if (u.includes('bankofcanada')) return ['fx', fj('valet_fx.json')];
				return [null];
			};
			const [k, x, isText] = pick();
			if (!k || down === 'all' || (down && down.includes(k))) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
			return isText ? { ok: true, status: 200, text: async () => x, json: async () => { throw new Error('csv'); } } : ok(x);
		};
	}
	const api = require('../mes.fm/api/debt.js');
	function res() { const r = { headers: {}, code: 0, body: null, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; }

	await t('aggregator: every source answers', async () => {
		mock(null); const r = res(); await api({ query: { anything: 'ignored' } }, r);
		assert.strictEqual(r.code, 200); assert(/s-maxage=3600/.test(r.headers['Cache-Control']));
		const s = r.body.sources; Object.keys(api.JOBS).forEach((k) => assert(s[k] && s[k].ok, k + ' ' + (s[k] && s[k].error)));
		assert(s.penny.data.latest.total > 3e13); assert(s.canada.data.clock && s.canada.data.pop); assert(s.fred.data.gdp && s.fred.data.ratio);
		assert(s.imf.data.rows.length >= 50); assert(s.fx.data.usdcad > 1);
	});
	await t('aggregator: one publisher down only blanks its own part', async () => {
		mock(['imf', 'fred']); const r = res(); await api({}, r);
		assert.strictEqual(r.code, 200); assert(!r.body.sources.imf.ok && /503/.test(r.body.sources.imf.error)); assert(!r.body.sources.fred.ok);
		assert(r.body.sources.penny.ok && r.body.sources.canada.ok);
	});
	await t('aggregator: everything down -> 502, not cached', async () => {
		mock('all'); const r = res(); await api({}, r);
		assert.strictEqual(r.code, 502); assert.strictEqual(r.headers['Cache-Control'], 'no-store');
		Object.values(r.body.sources).forEach((s) => assert(!s.ok && s.error));
	});
	await t('aggregator: a hanging source times out', async () => {
		global.fetch = (url, opts) => new Promise((resolve, reject) => { opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }); });
		const job = api.JOBS.fx(), t0 = Date.now();
		await assert.rejects(job, /timed out/); assert(Date.now() - t0 < 12000);
	});
	global.fetch = realFetch;

	await t('committed snapshot has the shape the page expects', () => {
		const o = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'debt-clock', 'data', 'sample.json'), 'utf8'));
		assert.strictEqual(o.v, 1); ['penny', 'history', 'interest', 'mts', 'fred', 'imf', 'canada', 'fx'].forEach((k) => assert(o.sources[k] && o.sources[k].ok, 'sample lacks ' + k));
		assert(fs.statSync(path.join(__dirname, '..', 'mes.fm', 'debt-clock', 'data', 'sample.json')).size < 400000, 'sample stays small');
	});

	console.log(fail ? fail + ' FAILED, ' + n + ' passed' : 'all ' + n + ' passed');
	process.exit(fail ? 1 : 0);
})();
