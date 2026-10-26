// Aggregator for mes.fm/debt-clock (MES Debt Clock). Informational only.
//
// GET /api/debt -> { v:1, generated, ms, sources: { <name>: { ok, data | error, ms } } }
//
// Every source runs in parallel with its own timeout and try/catch, so one slow or broken publisher only blanks its own part of the page
// (the page then falls back to the committed snapshot mes.fm/debt-clock/data/sample.json for that part and says so).
// Keyless public sources only. The client sends no input: the query string is ignored.
// Parsing lives in _debt-lib.js = a byte-identical copy of tool_apps_src/debt-clock/lib.js (the page uses the same code).
// Edge-cached: s-maxage=3600, stale-while-revalidate=86400. Endpoints verified 2026-10-25.
//
//   penny     Treasury Debt to the Penny (daily total, held by the public, intragovernmental), last ~400 days
//   history   Treasury Historical Debt Outstanding (fiscal-year ends since 1790)
//   interest  Treasury Interest Expense, last 13 months (public issues + government account series)
//   interestFy Treasury Interest Expense, September rows (= whole fiscal years since FY2010)
//   avgRate   Treasury Average Interest Rates ("Total Interest-bearing Debt", monthly since 2001)
//   mts       Monthly Treasury Statement table 1 (receipts, outlays, deficit, fiscal year to date)
//   fred      FRED GDP (quarterly, annual rate), POPTHM (population), TTLHH (households), GFDEGDQ188S (debt % of GDP since 1966)
//   imf       IMF DataMapper GGXWDG_NGDP + NGDPD + LP + country names (no CORS, so server side), three years kept
//   canada    Statistics Canada table 10-10-0002-01 (federal debt, gross liabilities), population v1, nominal GDP v62305783
//   fx        Bank of Canada Valet FXUSDCAD (for the USD / CAD switch)
const L = require('./_debt-lib.js');

const UA = 'mes.fm-debt/1.0 (+https://mes.fm/debt-clock)';
const TD = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
const SC = 'https://www150.statcan.gc.ca/t1/wds/rest/';
const IMF = 'https://www.imf.org/external/datamapper/api/v1/';
const daysAgo = (n) => L.ymd(Date.now() - n * 864e5);

async function get(url, ms, kind, opts) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 9000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal, redirect: 'follow' }, opts || {}, { headers: Object.assign({ 'user-agent': UA, accept: kind === 'json' ? 'application/json' : '*/*' }, (opts && opts.headers) || {}) }));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return kind === 'json' ? await r.json() : await r.text();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : String(e.message || e).slice(0, 120));
  } finally { clearTimeout(t); }
}
const json = (u, ms) => get(u, ms, 'json'), text = (u, ms) => get(u, ms, 'text');
const statcan = (method, body) => get(SC + method, 10000, 'json', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const fred = (id, since) => text('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + since, 10000);
const td = (path, q) => TD + path + '?' + q;

// the raw requests, by job (also used by `--fixtures` to record test fixtures)
const URLS = {
  penny: () => td('/v2/accounting/od/debt_to_penny', 'sort=-record_date&page%5Bsize%5D=420&fields=record_date,tot_pub_debt_out_amt,debt_held_public_amt,intragov_hold_amt'),
  history: () => td('/v2/accounting/od/debt_outstanding', 'sort=record_date&page%5Bsize%5D=400&fields=record_date,debt_outstanding_amt'),
  interest: () => td('/v2/accounting/od/interest_expense', 'filter=record_date:gte:' + daysAgo(400) + '&page%5Bsize%5D=1000&fields=record_date,expense_catg_desc,month_expense_amt,fytd_expense_amt'),
  interestFy: () => td('/v2/accounting/od/interest_expense', 'filter=record_calendar_month:eq:09&page%5Bsize%5D=1500&fields=record_date,expense_catg_desc,fytd_expense_amt'),
  avgRate: () => td('/v2/accounting/od/avg_interest_rates', 'filter=security_desc:eq:Total%20Interest-bearing%20Debt&sort=-record_date&page%5Bsize%5D=400&fields=record_date,security_desc,avg_interest_rate_amt'),
  mts: () => td('/v1/accounting/mts/mts_table_1', 'sort=-record_date&page%5Bsize%5D=40&fields=record_date,classification_desc,current_month_gross_rcpt_amt,current_month_gross_outly_amt,current_month_dfct_sur_amt,line_code_nbr'),
};
const FRED_IDS = { gdp: ['GDP', 1100], pop: ['POPTHM', 500], hh: ['TTLHH', 2000], ratio: ['GFDEGDQ188S', 'all'] };
const SC_BODY = {
  debt: [{ productId: 10100002, coordinate: '1.1.0.0.0.0.0.0.0.0', latestN: 132 }, { productId: 10100002, coordinate: '1.3.0.0.0.0.0.0.0.0', latestN: 24 }],
  vec: [{ vectorId: 1, latestN: 4 }, { vectorId: 62305783, latestN: 4 }],
};
const imfYears = () => { const y = new Date().getUTCFullYear(); return [String(y - 2), String(y - 1), String(y), String(y + 1)]; };

const JOBS = {
  penny: async () => {
    const r = L.parsePenny(await json(URLS.penny())), last = r[r.length - 1];
    return { latest: { date: last[0], total: last[1], public: last[2], intragov: last[3] }, rows: r };
  },
  history: async () => L.parseHistory(await json(URLS.history())),
  interest: async () => L.parseInterest(await json(URLS.interest(), 12000)),
  interestFy: async () => L.parseInterestFy(await json(URLS.interestFy(), 12000)),
  avgRate: async () => L.parseAvgRates(await json(URLS.avgRate())),
  mts: async () => L.parseMts(await json(URLS.mts())),
  fred: async () => {
    const keys = Object.keys(FRED_IDS), got = await Promise.allSettled(keys.map((k) => fred(FRED_IDS[k][0], FRED_IDS[k][1] === 'all' ? '1966-01-01' : daysAgo(FRED_IDS[k][1])).then(L.parseFredCsv)));
    const out = {}, errs = [];
    got.forEach((g, i) => { if (g.status === 'fulfilled' && g.value.length) out[keys[i]] = keys[i] === 'ratio' ? g.value : g.value.slice(-8); else errs.push(FRED_IDS[keys[i]][0] + ': ' + (g.reason ? g.reason.message : 'empty')); });
    if (!Object.keys(out).length) throw new Error(errs.join('; '));
    if (errs.length) out._missing = errs;
    return out;
  },
  imf: async () => {
    const [d, g, p, c] = await Promise.all([json(IMF + 'GGXWDG_NGDP', 15000), json(IMF + 'NGDPD', 15000), json(IMF + 'LP', 15000).catch(() => null), json(IMF + 'countries', 15000)]);
    return L.parseImf(d, g, p, c, imfYears());
  },
  canada: async () => {
    const [deb, vec] = await Promise.all([statcan('getDataFromCubePidCoordAndLatestNPeriods', SC_BODY.debt), statcan('getDataFromVectorsAndLatestNPeriods', SC_BODY.vec)]);
    const fed = L.parseStatcan(deb[0]), out = { fed: fed, clock: L.canadaClock(fed, 12) };
    try { out.gross = L.last(L.parseStatcan(deb[1])); } catch (e) { out.gross = null; }
    try { out.pop = L.last(L.parseStatcan(vec[0])); } catch (e) { out.pop = null; }
    try { out.gdp = L.last(L.parseStatcan(vec[1])); } catch (e) { out.gdp = null; }
    return out;
  },
  fx: async () => { const a = L.parseValet(await json('https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=5'), 'FXUSDCAD'); return { usdcad: a[a.length - 1][1], date: a[a.length - 1][0] }; },
};

async function collect() {
  const t0 = Date.now(), names = Object.keys(JOBS), sources = {};
  await Promise.all(names.map(async (n) => {
    const t = Date.now();
    try { sources[n] = { ok: true, data: await JOBS[n](), ms: Date.now() - t }; }
    catch (e) { sources[n] = { ok: false, error: String(e && e.message || e).slice(0, 300), ms: Date.now() - t }; }
  }));
  return { v: 1, generated: new Date().toISOString(), ms: Date.now() - t0, sources };
}

module.exports = async (req, res) => {
  try {
    const out = await collect(), okN = Object.values(out.sources).filter((s) => s.ok).length;
    res.setHeader('Cache-Control', okN ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
    res.status(okN ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'debt failed' });
  }
};
module.exports.collect = collect;
module.exports.JOBS = JOBS;

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  // node mes.fm/api/debt.js --write  -> refreshes the page's snapshot (mes.fm/debt-clock/data/sample.json: local previews + fallback when a source fails)
  if (process.argv.includes('--write')) {
    collect().then((o) => {
      fs.writeFileSync(path.join(__dirname, '..', 'debt-clock', 'data', 'sample.json'), JSON.stringify(o));
      Object.entries(o.sources).forEach(([k, s]) => console.log(k.padEnd(10), s.ok ? 'ok' : 'FAIL ' + s.error, s.ms + 'ms'));
    });
  }
  // node mes.fm/api/debt.js --fixtures -> records raw answers into tool_apps_src/debt-clock/fixtures/ (IMF trimmed to a few countries)
  if (process.argv.includes('--fixtures')) {
    const dir = path.join(__dirname, '..', '..', 'tool_apps_src', 'debt-clock', 'fixtures'), w = (f, x) => fs.writeFileSync(path.join(dir, f), typeof x === 'string' ? x : JSON.stringify(x));
    fs.mkdirSync(dir, { recursive: true });
    (async () => {
      for (const k of Object.keys(URLS)) { w(k + '.json', await json(URLS[k](), 15000)); console.log('ok', k); }
      for (const k of Object.keys(FRED_IDS)) { w('fred_' + FRED_IDS[k][0] + '.csv', await fred(FRED_IDS[k][0], FRED_IDS[k][1] === 'all' ? '1966-01-01' : daysAgo(FRED_IDS[k][1]))); console.log('ok fred', k); }
      const keep = ['USA', 'CAN', 'JPN', 'DEU', 'GBR', 'FRA', 'ITA', 'CHN', 'IND', 'BRA', 'MEX', 'AUS', 'KOR', 'ESP', 'GRC', 'SDN', 'SGP', 'CHE', 'NOR', 'SAU', 'WEOWORLD', 'EURO', 'ADVEC'];
      const extra = await json(IMF + 'countries', 15000), codes = Object.keys(extra.countries).filter((c) => /^[A-Z]{3}$/.test(c)).slice(0, 60);
      const set = new Set(keep.concat(codes));
      for (const id of ['GGXWDG_NGDP', 'NGDPD', 'LP']) {
        const j = await json(IMF + id, 15000), v = {}; Object.keys(j.values[id]).forEach((c) => { if (set.has(c)) v[c] = j.values[id][c]; });
        w('imf_' + id + '.json', { values: { [id]: v }, api: j.api }); console.log('ok imf', id);
      }
      const c = {}; Object.keys(extra.countries).forEach((k) => { if (set.has(k)) c[k] = extra.countries[k]; }); w('imf_countries.json', { countries: c });
      w('statcan_debt.json', await statcan('getDataFromCubePidCoordAndLatestNPeriods', SC_BODY.debt));
      w('statcan_vec.json', await statcan('getDataFromVectorsAndLatestNPeriods', SC_BODY.vec));
      w('valet_fx.json', await json('https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=5'));
      console.log('done');
    })().catch((e) => { console.error(e); process.exit(1); });
  }
}
