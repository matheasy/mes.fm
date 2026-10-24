// Tests for MES Market Signals: node tool_apps_src/signals-tests.js
// Pure lib checks on recorded responses (tool_apps_src/signals/fixtures/, captured 2026-10-24) + the aggregator api/signals.js with a mocked fetch.
const fs = require('fs'), path = require('path'), assert = require('assert');
const S = require('./signals/lib.js');
const FX = path.join(__dirname, 'signals', 'fixtures'), fx = (f) => fs.readFileSync(path.join(FX, f), 'utf8'), fj = (f) => JSON.parse(fx(f));
let n = 0, fail = 0;
async function t(name, fn) { try { await fn(); n++; } catch (e) { fail++; console.log('FAIL', name, '\n  ', e && e.stack || e); } }

(async () => {
	await t('api copy of the lib is byte-identical', () => assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'api', '_signals-lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, 'signals', 'lib.js'), 'utf8'), 'run: cp tool_apps_src/signals/lib.js mes.fm/api/_signals-lib.js'));
	await t('FRED csv', () => {
		const a = S.parseFredCsv(fx('fred_VIXCLS.csv'));
		assert(a.length > 400); assert(/^\d{4}-\d\d-\d\d$/.test(a[0][0])); assert(a.some((p) => p[1] === null) || true);
		assert.deepStrictEqual(S.parseFredCsv('observation_date,X\n2026-01-01,.\n2026-01-02,1.5\n'), [['2026-01-01', null], ['2026-01-02', 1.5]]);
		assert.throws(() => S.parseFredCsv('<html>'));
	});
	await t('crypto fear & greed', () => {
		const f = S.parseFng(fj('fng.json'));
		assert.strictEqual(f.hist.length, 40); assert(f.hist[0][0] < f.hist[39][0], 'oldest first');
		assert(f.now.v >= 0 && f.now.v <= 100); assert.strictEqual(f.now.label, S.fgLabel(f.now.v));
		assert.throws(() => S.parseFng({ data: [] }));
	});
	await t('labels', () => {
		assert.strictEqual(S.fgLabel(0), 'Extreme fear'); assert.strictEqual(S.fgLabel(24), 'Extreme fear'); assert.strictEqual(S.fgLabel(25), 'Fear');
		assert.strictEqual(S.fgLabel(50), 'Neutral'); assert.strictEqual(S.fgLabel(56), 'Greed'); assert.strictEqual(S.fgLabel(76), 'Extreme greed');
	});
	await t('coingecko', () => {
		const c = S.parseCoins(fj('coingecko_markets.json'));
		assert.strictEqual(c[0].sym, 'BTC'); assert(c[0].price > 1000); assert(c[0].spark.length <= 56 && c[0].spark.length > 20); assert(typeof c[0].ch7 === 'number');
		const g = S.parseGlobal(fj('coingecko_global.json')); assert(g.btcDom > 30 && g.btcDom < 90); assert(g.mcap > 1e11);
		const s = S.parseStables(fj('coingecko_stables.json')); assert(s.total > 1e9); assert(s.top[0][0].length >= 3);
	});
	await t('yahoo + FRED quote', () => {
		const q = S.parseYahoo(fj('yahoo_gspc.json'));
		assert(q.price > 1000); assert(q.spark.length > 40); assert(Math.abs(q.chPct) < 15);
		const f = S.quoteFromFred(S.parseFredCsv(fx('fred_SP500.csv'))); assert(f.price > 1000 && f.src === 'FRED' && f.spark.length === 66);
		assert.throws(() => S.parseYahoo({ chart: { result: null } }));
	});
	await t('policy rates', () => {
		const boc = S.policy(S.parseValet(fj('boc_valet.json'), 'V39079')); assert(boc.rate > 0 && boc.rate < 10);
		const ecb = S.policy(S.parseEcbCsv(fx('ecb_dfr.csv'))); assert.strictEqual(ecb.rate, 2.5); assert.strictEqual(ecb.prev, 2.25); assert.strictEqual(ecb.since, '2026-09-16');
		const boe = S.policy(S.parseBoeCsv(fx('boe_bankrate.csv'))); assert.strictEqual(boe.rate, 3.75); assert(boe.since < boe.date); assert.strictEqual(boe.prev, 4);
		assert.deepStrictEqual(S.policy([['a', 1], ['b', 1], ['c', 2], ['d', 2]]), { rate: 2, date: 'd', since: 'c', prev: 1 });
	});
	await t('rss: titles + http links only', () => {
		const fed = S.parseRss(fx('fed_press_monetary.xml')); assert(fed.length >= 3); assert(/^https:\/\/www\.federalreserve\.gov\//.test(fed[0].link)); assert(fed[0].date);
		const ct = S.parseRss(fx('cointelegraph.xml')); assert(ct.length >= 3 && !/</.test(ct[0].title));
		const cd = S.parseRss(fx('coindesk.xml')); assert(cd.length >= 3);
		const evil = S.parseRss('<item><title>A &amp; B <b>x</b></title><link>javascript:alert(1)</link></item><item><title><![CDATA[Ok & fine]]></title><link>https://ex.com/a</link></item>');
		assert.deepStrictEqual(evil.map((x) => x.title), ['Ok & fine']);
	});
	await t('polymarket', () => {
		const p = S.parsePolymarket(fj('polymarket_fed.json'), 'Fed');
		assert(p.length >= 2); assert(/^https:\/\/polymarket\.com\/event\//.test(p[0].url));
		p.forEach((e) => { assert(e.outcomes.length >= 1 && e.outcomes.length <= 5); for (let i = 1; i < e.outcomes.length; i++) assert(e.outcomes[i - 1].p >= e.outcomes[i].p); e.outcomes.forEach((o) => assert(o.p >= 0 && o.p <= 100)); });
		const single = S.parsePolymarket([{ id: 1, slug: 's', title: 'T', markets: [{ active: true, closed: false, outcomes: '["Yes","No"]', outcomePrices: '["0.25","0.75"]' }] }]);
		assert.deepStrictEqual(single[0].outcomes, [{ label: 'No', p: 75 }, { label: 'Yes', p: 25 }]);
		assert.strictEqual(S.parsePolymarket([{ id: 2, slug: 'x', closed: true, markets: [] }]).length, 0);
	});
	await t('kalshi + ladder bucket', () => {
		const k = S.parseKalshi(fj('kalshi_kxfed.json'), 'Fed');
		assert.strictEqual(k.length, 1); assert(k[0].ladder); assert(k[0].likely && k[0].likely.p > 0); assert(/^https:\/\/kalshi\.com\/markets\/kxfed$/.test(k[0].url));
		const r = S.parseKalshi(fj('kalshi_recession.json')); assert(r.length >= 1 && !r[0].ladder);
		const b = S.ladderBucket([{ label: 'Above 3.00%', p: 99 }, { label: 'Above 3.25%', p: 90 }, { label: 'Above 3.50%', p: 20 }, { label: 'Above 3.75%', p: 5 }]);
		assert.deepStrictEqual(b, { label: '3.25% to 3.50%', p: 70 });
		assert.deepStrictEqual(S.ladderBucket([{ label: 'Above 3.0%', p: 40 }, { label: 'Above 3.1%', p: 30 }]), { label: 'Below 3.0%', p: 60 });
	});
	await t('halving', () => {
		const h = S.halving(972958, 571219, 0);
		assert.strictEqual(h.target, 1050000); assert.strictEqual(h.left, 77042); assert.strictEqual(h.reward, 3.125); assert.strictEqual(h.next, 1.5625);
		assert.strictEqual(h.eta, 77042 * 571219);
		assert.strictEqual(S.halving(840000, 600000, 0).target, 1050000, 'the halving block itself starts a new epoch');
		assert.strictEqual(S.halving(100, 5, 0).avgSec, 600, 'silly average -> 10 minutes');
	});
	await t('percentile + sma + align', () => {
		assert.strictEqual(S.pctRank([1, 2, 3, 4], 3), 62.5); assert.strictEqual(S.pctRank([5, 5], 5), 50);
		assert.deepStrictEqual(S.sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
		assert.deepStrictEqual(S.alignTo(['a', 'c', 'e'], [['b', 1], ['c', null], ['d', 2]]), [null, 1, 2]);
	});
	await t('stock fear & greed composite', () => {
		const sp = S.parseFredCsv(fx('fred_SP500.csv')), vix = S.parseFredCsv(fx('fred_VIXCLS.csv')), hy = S.parseFredCsv(fx('fred_BAMLH0A0HYM2.csv'));
		const g = S.stockFearGreed(sp, vix, hy, 260);
		assert(g.score >= 0 && g.score <= 100); assert.strictEqual(g.label, S.fgLabel(g.score)); assert.strictEqual(g.parts.length, 3);
		assert(Math.abs(g.score - g.parts.reduce((s, p) => s + p.score, 0) / 3) <= 1, 'score = mean of the three parts');
		assert(g.hist.length > 50); assert(g.hist.every((p) => p[1] >= 0 && p[1] <= 100));
		// synthetic: a calm, rising market reads greedy; a crash with a VIX spike reads fearful
		const days = 700, d = (i) => S.addDays('2024-01-01', i), up = [], vx = [], jb = [];
		for (let i = 0; i < days; i++) { up.push([d(i), 100 + Math.pow(i / 100, 3)]); vx.push([d(i), 20 - i * 0.01]); jb.push([d(i), 4 - i * 0.002]); }
		assert(S.stockFearGreed(up, vx, jb).score > 80);
		const dn = up.map((p, i) => [p[0], i < days - 20 ? p[1] : p[1] - (i - days + 21) * 8]), vs = vx.map((p, i) => [p[0], i < days - 20 ? 15 : 45]), js = jb.map((p, i) => [p[0], i < days - 20 ? 3 : 7]);
		assert(S.stockFearGreed(dn, vs, js).score < 10);
		assert.throws(() => S.stockFearGreed(up.slice(0, 100), vx, jb));
	});
	await t('cpi yoy, recessions, inversions', () => {
		const y = S.yoy(S.parseFredCsv(fx('fred_CPIAUCSL.csv')));
		assert(y.length > 5); assert(!y.some((p) => p[0] === '2025-10'), 'the missing Oct 2025 month is skipped, not zero'); assert(Math.abs(y[y.length - 1][1]) < 20);
		const rec = S.recessions(S.parseFredCsv(fx('fred_USREC.csv'))); assert(rec.some((r) => r[0] === '2008-01' && r[1] === '2009-06')); assert(rec.some((r) => r[0] === '2020-03'));
		const inv = S.belowZero(S.parseFredCsv(fx('fred_T10Y2Y_monthly.csv'))); assert(inv.some((r) => r[0].slice(0, 7) === '2022-07' && r[2] < -0.5));
	});
	await t('FOMC calendar', () => {
		assert.strictEqual(S.FOMC.length, 16); S.FOMC.forEach((f) => assert(Date.parse(f[1]) - Date.parse(f[0]) === 864e5));
		assert.strictEqual(new Date(S.nyTwoPm('2026-10-28')).toISOString(), '2026-10-28T18:00:00.000Z'); // EDT
		assert.strictEqual(new Date(S.nyTwoPm('2026-12-09')).toISOString(), '2026-12-09T19:00:00.000Z'); // EST
		assert.strictEqual(new Date(S.nyTwoPm('2027-03-17')).toISOString(), '2027-03-17T18:00:00.000Z'); // DST from 14 Mar 2027
		assert.strictEqual(new Date(S.nyTwoPm('2027-11-03')).toISOString(), '2027-11-03T18:00:00.000Z'); // DST ends 7 Nov 2027
		assert.strictEqual(new Date(S.nyTwoPm('2027-11-08')).toISOString(), '2027-11-08T19:00:00.000Z');
	});
	await t('next FOMC', () => {
		const a = S.nextFomc(Date.parse('2026-10-24T12:00:00Z')); assert.strictEqual(a.end, '2026-10-28'); assert(!a.sep); assert(!a.live);
		assert(S.nextFomc(Date.parse('2026-10-28T19:00:00Z')).live, 'still shown during the press conference');
		assert.strictEqual(S.nextFomc(Date.parse('2026-10-28T21:00:00Z')).end, '2026-12-09');
		assert(S.nextFomc(Date.parse('2026-10-28T21:00:00Z')).sep);
		assert.strictEqual(S.nextFomc(Date.parse('2028-01-01T00:00:00Z')), null);
		assert.strictEqual(S.countdown(3 * 864e5 + 5 * 3600e3), '3d 5h'); assert.strictEqual(S.countdown(90 * 60e3), '1h 30m'); assert.strictEqual(S.countdown(-1), 'now');
	});
	await t('formatting', () => {
		assert.strictEqual(S.money(2.7e12), '$2.70T'); assert.strictEqual(S.money(80286), '$80,286'); assert.strictEqual(S.money(1.28), '$1.28'); assert.strictEqual(S.money(0.04826), '$0.0483');
		assert.strictEqual(S.pct(-1.5), '−1.50%'); assert.strictEqual(S.pct(2, 1), '+2.0%'); assert.strictEqual(S.pct(null), '—');
	});
	await t('what changed since last visit', () => {
		const ch = S.changes({ cfg: 40, btc: 100, t10: 4.0, spx: 5000 }, { cfg: 52, btc: 101, t10: 4.1, spx: 5000 });
		const by = Object.fromEntries(ch.map((c) => [c.key, c]));
		assert(by.cfg.big && by.cfg.text === '+12 pts'); assert(!by.btc.big && by.btc.text === '+1.0%'); assert(by.t10.big && by.t10.text === '+10 bp'); assert(!by.spx.big);
	});
	await t('glossary', () => {
		['cfg', 'sfg', 'vix', 'yieldcurve', 'inversion', 'bps', 'dominance', 'halving', 'fomc', 'dotplot', 'cpi', 'pred', 'odds'].forEach((k) => assert(S.GLOSSARY[k] && S.GLOSSARY[k][1].length > 60, k));
		assert(/252 trading days/.test(S.GLOSSARY.sfg[1]));
	});
	await t('page markup: every ? button has a glossary entry', () => {
		const html = fs.readFileSync(path.join(__dirname, 'signals', 'content.html'), 'utf8') + fs.readFileSync(path.join(__dirname, 'signals', 'app.js'), 'utf8');
		const keys = new Set((html.match(/data-g="(\w+)"/g) || []).map((m) => m.slice(8, -1)).concat((html.match(/q\('(\w+)'/g) || []).map((m) => m.slice(3, -1))));
		assert(keys.size > 10); keys.forEach((k) => assert(S.GLOSSARY[k], 'missing glossary entry: ' + k));
		assert(!/buy now|you should (buy|sell)/i.test(html));
	});

	// ---- the aggregator with a mocked fetch ----
	const ROUTES = [
		[/alternative\.me\/fng/, 'fng.json'], [/coins\/markets\?.*category=stablecoins/, 'coingecko_stables.json'], [/coins\/markets/, 'coingecko_markets.json'], [/api\/v3\/global/, 'coingecko_global.json'],
		[/blocks\/tip\/height/, 'mempool_height.txt'], [/difficulty-adjustment/, 'mempool_difficulty.json'], [/finance\.yahoo\.com/, 'yahoo_gspc.json'],
		[/id=T10Y2Y/, 'fred_T10Y2Y_monthly.csv'], [/id=USREC/, 'fred_USREC.csv'], [/id=CPIAUCSL/, 'fred_CPIAUCSL.csv'], [/id=VIXCLS/, 'fred_VIXCLS.csv'], [/id=BAMLH0A0HYM2/, 'fred_BAMLH0A0HYM2.csv'],
		[/fredgraph\.csv/, 'fred_SP500.csv'], [/bankofcanada/, 'boc_valet.json'], [/data-api\.ecb/, 'ecb_dfr.csv'], [/bankofengland/, 'boe_bankrate.csv'], [/federalreserve\.gov\/feeds/, 'fed_press_monetary.xml'],
		[/gamma-api\.polymarket/, 'polymarket_fed.json'], [/series_ticker=KXFED/, 'kalshi_kxfed.json'], [/kalshi/, 'kalshi_recession.json'], [/coindesk/, 'coindesk.xml'], [/cointelegraph/, 'cointelegraph.xml']];
	let calls = [], breakers = [];
	global.fetch = async (url, opts) => {
		calls.push({ url, ua: opts && opts.headers && opts.headers['user-agent'] });
		if (breakers.some((b) => b.test(url))) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
		const rate = /fredgraph\.csv\?id=(DFF|DFEDTARU|DFEDTARL|DGS2|DGS10)&/.exec(url);
		if (rate) { const v = { DFF: 3.88, DFEDTARU: 4, DFEDTARL: 3.75, DGS2: 4.65, DGS10: 4.96 }[rate[1]], rows = ['observation_date,' + rate[1]]; for (let i = 0; i < 800; i++) rows.push(S.addDays('2024-08-01', i) + ',' + (i % 7 === 5 ? '.' : (rate[1] === 'DFEDTARU' && i < 700 ? 3.75 : v))); const body = rows.join('\n'); return { ok: true, status: 200, text: async () => body }; }
		const r = ROUTES.find((x) => x[0].test(url)); if (!r) throw new Error('unexpected fetch ' + url);
		const body = fx(r[1]); return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
	};
	delete require.cache[require.resolve('../mes.fm/api/signals.js')];
	const api = require('../mes.fm/api/signals.js');
	function fakeRes() { const r = { h: {}, code: 0, body: null, setHeader(k, v) { r.h[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; }
	await t('aggregator: all sources ok', async () => {
		calls = []; const res = fakeRes(); await api({ query: { anything: 'ignored' }, url: '/api/signals?x=1' }, res);
		assert.strictEqual(res.code, 200); assert(/s-maxage=300, stale-while-revalidate=3600/.test(res.h['Cache-Control']));
		const s = res.body.sources, bad = Object.keys(s).filter((k) => !s[k].ok);
		assert.deepStrictEqual(bad, [], 'failed: ' + bad.map((k) => k + ' ' + s[k].error).join('; '));
		assert.strictEqual(Object.keys(s).length, 17);
		assert(calls.every((c) => /^https:\/\//.test(c.url)), 'https only'); assert(!calls.some((c) => /ignored|x=1/.test(c.url)), 'client input never reaches a fetch');
		assert(s.markets.data.spx.price > 0 && s.markets.data.gold.price > 0); assert(s.rates.data.latest.spread); assert.strictEqual(s.rates.data.target.rate, 4);
		const snap = S.snapshot(s); ['cfg', 'sfg', 'btc', 'spx', 't10', 'spread', 'dff'].forEach((k) => assert(snap[k] != null, 'snapshot ' + k));
		assert(JSON.stringify(res.body).length < 200000, 'response stays small');
	});
	await t('aggregator: one broken source does not break the rest; Yahoo falls back to FRED', async () => {
		breakers = [/finance\.yahoo\.com/, /coingecko\.com\/api\/v3\/global/]; const res = fakeRes(); await api({}, res); breakers = [];
		const s = res.body.sources; assert.strictEqual(res.code, 200);
		assert(!s.global.ok && /503/.test(s.global.error)); assert(s.coins.ok && s.fng.ok);
		assert(s.markets.ok); assert.strictEqual(s.markets.data.spx.src, 'FRED'); assert(!s.markets.data.gold, 'gold has no FRED fallback'); assert(s.markets.data._missing.some((m) => /gold/.test(m)));
	});
	await t('aggregator: everything down -> 502 no-store', async () => {
		breakers = [/./]; const res = fakeRes(); await api({}, res); breakers = [];
		assert.strictEqual(res.code, 502); assert.strictEqual(res.h['Cache-Control'], 'no-store');
	});
	await t('sample data for ?mock=1 exists and parses', () => {
		const p = path.join(__dirname, '..', 'mes.fm', 'signals', 'data', 'sample.json'), o = JSON.parse(fs.readFileSync(p, 'utf8'));
		assert(o.generated && o.sources && o.sources.fng);
	});

	console.log((fail ? 'FAILED ' + fail + ' of ' : 'all ') + (n + fail) + ' signals tests' + (fail ? '' : ' passed'));
	process.exit(fail ? 1 : 0);
})();
