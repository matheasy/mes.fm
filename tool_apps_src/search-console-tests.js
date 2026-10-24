// Tests for the private Search Console dashboard: node tool_apps_src/search-console-tests.js
// api/search-console-ingest.js (validation, key, storage) + api/search-console.js (aggregation, Bing parsing, key never leaked)
// + middleware.js (the page and its data API are behind the password, the ingest endpoint is not). Fake Redis, mocked fetch.
const path = require('path');
const fs = require('fs');
const API = path.join(__dirname, '..', 'mes.fm', 'api');
const ingest = require(path.join(API, 'search-console-ingest.js'));
const sc = require(path.join(API, 'search-console.js'));

let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('FAIL', msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// ---- fake Redis + Bing behind a mocked fetch
const STORE = new Map();
let bingCalls = [], bingFail = null;
const BING_KEY = 'SECRET-bing-key-123';
const msDate = (d) => '/Date(' + (Date.parse(d + 'T07:00:00Z')) + '-0700)/';
function bingJson(method, url) {
  if (method === 'GetRankAndTrafficStats') {
    const d = [];
    for (let k = 0; k < 60; k++) { const day = new Date(Date.parse('2026-10-20T12:00:00Z') - k * 864e5).toISOString().slice(0, 10); d.push({ __type: 'x', Clicks: 2, Date: msDate(day), Impressions: 10 }); }
    return { d };
  }
  if (method === 'GetQueryStats') return { d: [
    { AvgClickPosition: 3, AvgImpressionPosition: 4, Clicks: 5, Date: msDate('2026-10-17'), Impressions: 50, Query: 'bmi calculator' },
    { AvgClickPosition: 0, AvgImpressionPosition: 10, Clicks: 0, Date: msDate('2026-10-17'), Impressions: 50, Query: 'timer' },
    { AvgClickPosition: 2, AvgImpressionPosition: 6, Clicks: 3, Date: msDate('2026-09-19'), Impressions: 30, Query: 'bmi calculator' },
  ] };
  if (method === 'GetPageStats') return { d: [
    { AvgClickPosition: 3, AvgImpressionPosition: 5, Clicks: 5, Date: msDate('2026-10-17'), Impressions: 80, Query: 'https://mes.fm/bmicalculator' },
  ] };
  if (method === 'GetPageQueryStats') return { d: [
    { AvgClickPosition: 3, AvgImpressionPosition: 4, Clicks: 5, Date: msDate('2026-10-17'), Impressions: 50, Query: 'bmi calculator' },
  ] };
  return { d: [] };
}
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://redis.test/pipeline')) {
    const cmds = JSON.parse(opts.body);
    const out = cmds.map(([op, ...a]) => {
      if (op === 'SET') { STORE.set(a[0], a[1]); return { result: 'OK' }; }
      if (op === 'GET') return { result: STORE.has(a[0]) ? STORE.get(a[0]) : null };
      if (op === 'MGET') return { result: a.map((k) => (STORE.has(k) ? STORE.get(k) : null)) };
      return { result: null };
    });
    return { ok: true, json: async () => out };
  }
  if (String(url).startsWith('https://ssl.bing.com/webmaster/api.svc/json/')) {
    const method = String(url).split('/json/')[1].split('?')[0];
    bingCalls.push(method);
    if (bingFail) return { ok: false, status: 400, text: async () => JSON.stringify({ ErrorCode: 3, Message: bingFail }) };
    return { ok: true, status: 200, text: async () => JSON.stringify(bingJson(method, url)) };
  }
  throw new Error('unexpected fetch ' + url);
};
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';

function mockRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
async function call(h, req) { const res = mockRes(); await h(Object.assign({ headers: {}, query: {} }, req), res); return res; }

const days = (from, n) => { const o = {}; for (let k = 0; k < n; k++) { const d = new Date(Date.parse(from + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10); o[d] = { t: [10 + k, 100, 5.5], dev: [['MOBILE', 6, 60, 6], ['DESKTOP', 4 + k, 40, 4.75]] }; } return o; };
const sum = (start, end, extra) => Object.assign({ start, end,
  pages: [['https://mes.fm/bmicalculator', 50, 900, 4.2], ['https://mes.fm/bmicalculator/', 5, 100, 6], ['https://mes.fm/timer', 20, 400, 8]],
  queries: [['bmi calculator', 40, 700, 3.1], ['timer', 20, 400, 8]],
  countries: [['usa', 30, 600, 5], ['can', 10, 200, 4]], devices: [['MOBILE', 40, 800, 5], ['DESKTOP', 30, 500, 4]],
  pq: [['https://mes.fm/bmicalculator', 'bmi calculator', 40, 700, 3.1], ['https://mes.fm/bmicalculator/', 'bmi chart', 3, 50, 7], ['https://mes.fm/timer', 'timer', 20, 400, 8]] }, extra || {});

(async () => {
  // ---- ingest: validation
  const today = '2026-10-24';
  ok(ingest.parse(null, today).error, 'no body refused');
  ok(ingest.parse({ source: 'adsense', days: days('2026-10-01', 2) }, today).error, 'other source refused');
  ok(ingest.parse({ source: 'gsc', days: { '2026-13-45x': { t: [1, 2, 3] } } }, today).error, 'bad date refused');
  ok(ingest.parse({ source: 'gsc', days: { '2020-01-01': { t: [1, 2, 3] } } }, today).error, 'too old day refused');
  ok(ingest.parse({ source: 'gsc', days: { '2026-10-20': { t: [1, -2, 3] } } }, today).error, 'negative totals refused');
  ok(ingest.parse({ source: 'gsc', sums: { '30': { cur: sum('2026-09-20', '2026-10-19') } } }, today).error, 'unknown range refused');
  ok(ingest.parse({ source: 'gsc' }, today).error, 'empty payload refused');
  const big = { source: 'gsc', sums: { '7': { cur: sum('2026-10-14', '2026-10-20', { pq: Array(3001).fill(['a', 'b', 1, 1, 1]) }) } } };
  ok(ingest.parse(big, today).error, 'too many rows refused');
  const p = ingest.parse({ source: 'gsc', meta: { property: 'sc-domain:mes.fm' }, days: { '2026-10-20': { t: [1, 2, 3], dev: [['MOBILE', 1, 2, 3], ['bad']] } },
    sums: { '365': { cur: sum('2025-10-21', '2026-10-20'), prev: sum('2024-10-21', '2025-10-20') } } }, today);
  ok(!p.error, 'valid payload accepted (incl. a 365-day previous period ' + (p.error || '') + ')');
  eq(JSON.parse(p.days[0][1]).dev.length, 1, 'bad device row dropped');
  eq(p.sums.length, 2, 'cur + prev summaries');
  const ctl = ingest.parse({ source: 'gsc', sums: { '7': { cur: sum('2026-10-14', '2026-10-20', { queries: [['a\u0007b', 1, 1, 1]] }) } } }, today);
  eq(JSON.parse(ctl.sums[0][1]).queries[0][0], 'ab', 'control characters stripped');

  // ---- ingest: key + storage
  delete process.env.EARNINGS_INGEST_KEY;
  eq((await call(ingest, { method: 'POST', body: {} })).code, 503, 'no env key -> 503');
  process.env.EARNINGS_INGEST_KEY = 'ingest-key';
  eq((await call(ingest, { method: 'GET' })).code, 405, 'GET -> 405');
  eq((await call(ingest, { method: 'POST', headers: { 'x-ingest-key': 'nope' }, body: {} })).code, 401, 'wrong key -> 401');
  eq((await call(ingest, { method: 'POST', headers: {}, body: {} })).code, 401, 'missing key -> 401');
  const now = new Date();
  const iso = (k) => new Date(now.getTime() - k * 864e5).toISOString().slice(0, 10);
  const end = iso(3), start = iso(9), pStart = iso(16), pEnd = iso(10);
  const r1 = await call(ingest, { method: 'POST', headers: { 'x-ingest-key': 'ingest-key' },
    body: JSON.stringify({ source: 'gsc', meta: { property: 'sc-domain:mes.fm', tz: 'America/Los_Angeles' }, days: days(pStart, 14) }) });
  eq(r1.code, 200, 'days stored');
  const r2 = await call(ingest, { method: 'POST', headers: { 'x-ingest-key': 'ingest-key' },
    body: { source: 'gsc', sums: { '7': { cur: sum(start, end), prev: sum(pStart, pEnd, { pages: [['https://mes.fm/bmicalculator', 25, 800, 5]], queries: [['bmi calculator', 20, 600, 4]] }) } } } });
  eq(r2.code, 200, 'summaries stored');
  ok(STORE.has('gscdash:day:' + end) && STORE.has('gscdash:sum:7:cur') && STORE.has('gscdash:meta'), 'keys written');

  // ---- data API: Google without Bing
  delete process.env.BING_WEBMASTER_KEY;
  let res = await call(sc, { method: 'GET', query: { range: '7' } });
  eq(res.code, 200, 'data 200');
  const g = res.body.google;
  ok(g.setup && g.cur.end === end, 'google range ends on the summary end');
  eq(g.daily.length, 7, '7 days in range');
  eq(g.prevDaily.length, 7, '7 days in the previous period');
  const expC = [7, 8, 9, 10, 11, 12, 13].reduce((a, k) => a + 10 + k, 0);
  eq(g.totals.c, expC, 'clicks summed over the days');
  eq(g.totals.p, 5.5, 'position weighted by impressions');
  eq(g.pages[0].k, '/bmicalculator', 'page URL normalised to a path');
  eq(g.pages[0].c, 55, 'trailing-slash duplicates merged');
  eq(g.pages[0].pc, 25, 'previous-period clicks joined');
  ok(Math.abs(g.pages[0].p - (4.2 * 900 + 6 * 100) / 1000) < 0.01, 'merged page position weighted');
  eq(g.countries[0].k, 'usa', 'countries kept as lowercase alpha-3');
  eq(g.devices[0].k, 'mobile', 'device lowercased');
  eq(res.body.bing, { setup: false }, 'Bing not set up without the key');
  eq(res.headers['cache-control'], 'private, no-store', 'private, not cached at the edge');
  res = await call(sc, { method: 'GET', query: { range: '7', page: 'https://mes.fm/bmicalculator/' } });
  eq(res.body.rows.map((r) => r.k), ['bmi calculator', 'bmi chart'], 'drill-down: queries of a page (both URL forms)');
  eq(res.body.rows[0].pc, 40, 'drill-down: previous-period numbers joined');
  res = await call(sc, { method: 'GET', query: { range: 'abc' } });
  eq(res.body.range, '28', 'bad range falls back to 28');

  // ---- Bing parsing
  eq(sc.bingDate('/Date(1399014000000-0700)/'), '2014-05-02', 'Bing date with offset');
  eq(sc.bingDate('/Date(1399014000000)/'), '2014-05-02', 'Bing date without offset (Pacific)');
  eq(sc.bingDate('garbage'), null, 'bad Bing date');
  eq(sc.slimBing('GetQueryStats', { d: [{ Date: '/Date(1399014000000-0700)/', Query: 'q', Clicks: '2', Impressions: 3, AvgImpressionPosition: 4.5 }] }), [['2014-05-02', 'q', 2, 3, 4.5]], 'query stats slimmed');
  eq(sc.slimBing('GetRankAndTrafficStats', { d: [{ Date: '/Date(1399100400000-0700)/', Clicks: 2, Impressions: 100 }, { Date: '/Date(1399014000000-0700)/', Clicks: 1, Impressions: 30 }] }), [['2014-05-02', 1, 30], ['2014-05-03', 2, 100]], 'traffic sorted by date');
  eq(sc.slimBing('GetQueryStats', null), [], 'empty answer');

  // ---- Bing through the API
  process.env.BING_WEBMASTER_KEY = BING_KEY;
  res = await call(sc, { method: 'GET', query: { range: '28' } });
  const b = res.body.bing;
  ok(b.setup && !b.error, 'Bing set up');
  eq(b.cur.end, '2026-10-20', 'Bing range ends on its newest day');
  eq(b.daily.length, 28, '28 Bing days');
  eq(b.totals.c, 56, 'Bing clicks');
  eq(b.queries.map((r) => r.k), ['bmi calculator', 'timer'], 'weekly query buckets in range');
  eq(b.queries[0].pc, 3, 'Bing previous-period bucket joined');
  eq(b.totals.p, 7, 'Bing position = impressions-weighted query position');
  eq(b.pages[0].k, '/bmicalculator', 'Bing page normalised');
  ok(!JSON.stringify(res.body).includes(BING_KEY), 'key not in the response');
  const n1 = bingCalls.length;
  sc._mem.clear();
  await call(sc, { method: 'GET', query: { range: '28' } });
  eq(bingCalls.length, n1, 'second load served from the Redis cache');
  ok(![...STORE.values()].some((v) => String(v).includes(BING_KEY)), 'key not stored in Redis');
  res = await call(sc, { method: 'GET', query: { range: '28', src: 'bing', page: 'https://mes.fm/bmicalculator' } });
  eq(res.body.rows[0].k, 'bmi calculator', 'Bing page drill-down');
  // errors never echo the key
  sc._mem.clear(); for (const k of [...STORE.keys()]) if (k.startsWith('gscdash:bing:')) STORE.delete(k);
  bingFail = 'Invalid API key ' + BING_KEY + ' for https://ssl.bing.com/?apikey=' + BING_KEY;
  res = await call(sc, { method: 'GET', query: { range: '7' } });
  ok(res.body.bing.error && !JSON.stringify(res.body).includes(BING_KEY), 'Bing error reported without the key: ' + JSON.stringify(res.body.bing));
  eq(sc.scrub('x apikey=abc&y', ''), 'x apikey=***&y', 'apikey= scrubbed');
  bingFail = null;

  // ---- Google not set up
  for (const k of [...STORE.keys()]) if (k.startsWith('gscdash:') && !k.startsWith('gscdash:bing')) STORE.delete(k);
  delete process.env.BING_WEBMASTER_KEY;
  res = await call(sc, { method: 'GET', query: { range: '28' } });
  eq(res.body.google, { setup: false }, 'Google not set up without data');

  // ---- auth (middleware.js)
  const mw = fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'middleware.js'), 'utf8');
  const src = mw.replace(/export const config/, 'const config').replace(/export default function middleware/, 'function middleware') + '\nmodule.exports = { config, middleware };';
  const m = {}; new Function('module', 'atob', src)(m, (s) => Buffer.from(s, 'base64').toString('binary'));
  const { config, middleware } = m.exports;
  ok(config.matcher.includes('/search-console') && config.matcher.includes('/search-console/:path*') && config.matcher.includes('/api/search-console'), 'page + data API are gated');
  ok(!config.matcher.some((x) => /ingest/.test(x)), 'ingest endpoint is not gated (it has its own key)');
  const reqOf = (auth) => ({ url: 'https://mes.fm/search-console', headers: { get: (h) => (h === 'authorization' ? auth : null) } });
  global.Response = class { constructor(b, o) { this.status = o.status; } };
  eq(middleware(reqOf('')).status, 401, 'no password -> 401');
  eq(middleware(reqOf('Basic ' + Buffer.from('mes:wrong').toString('base64'))).status, 401, 'wrong password -> 401');
  eq(middleware(reqOf('Basic ' + Buffer.from('mes:911').toString('base64'))), undefined, 'right password passes');

  // ---- the built page
  const page = path.join(__dirname, '..', 'mes.fm', 'search-console', 'index.html');
  if (fs.existsSync(page)) {
    const html = fs.readFileSync(page, 'utf8');
    ok(/<meta name="robots" content="noindex/.test(html), 'page is noindex');
    ok(!/adsbygoogle|googlesyndication/.test(html), 'page has no ads');
  }

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
