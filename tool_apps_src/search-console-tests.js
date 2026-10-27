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
  // the mocked Bing query data starts 2026-09-19, inside the previous period (2026-08-26 .. 09-22): not covered -> no previous numbers
  ok(b.prevPartial && !b.tablesPrevOk, 'Bing previous period not covered by its query data');
  eq(b.queries[0].pc, undefined, 'no previous numbers joined when Bing does not cover the previous period');
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

  // ---- Bing compare guard (pure)
  {
    const tr = [], q = [];
    for (let k = 0; k < 200; k++) tr.push([new Date(Date.parse('2026-10-20T12:00:00Z') - (199 - k) * 864e5).toISOString().slice(0, 10), 2, 10]);
    for (let w = 0; w < 26; w++) { const d = new Date(Date.parse('2026-10-17T12:00:00Z') - w * 7 * 864e5).toISOString().slice(0, 10); q.push([d, '25%, 30%', w === 25 ? 0 : 3, w === 25 ? 1 : 40, 5]); }
    const b90 = sc.bingPart(tr, q, [], '90', '2026-10-24');
    ok(!b90.prevPartial && b90.tablesPrevOk, '90 days: Bing covers the previous 90 days');
    ok(b90.queries[0].pc > 0, '90 days: previous numbers joined');
    const b365 = sc.bingPart(tr, q, [], '365', '2026-10-24');
    ok(b365.prevPartial && b365.curPartial, '365 days: previous period not covered, current only partly');
    eq(b365.queries[0].pc, undefined, '365 days: no previous numbers, so no +11,618%');
    eq(b365.since.tables, q[q.length - 1][0], 'Bing data start reported');
    const bt = sc.bingPart(tr, q, [], 'today', '2026-10-24');
    ok(bt.empty && bt.lag && bt.newest === '2026-10-20', 'today: Bing lags, says so with its newest day');
    const bf = sc.bingPart(tr, q, [], '90', '2026-10-24', [{ dim: 'query', op: 'contains', v: '25%' }]);
    ok(bf.filtered && bf.queries.length === 1 && bf.daily.length === 0, 'Bing query filter: query table filtered, day line dropped');
    ok(bf.blocked.pages, 'Bing page table cannot apply a query filter');
    const bc = sc.bingPart(tr, q, [], '90', '2026-10-24', [{ dim: 'country', op: 'exact', v: 'usa' }]);
    ok(bc.blocked.queries && !bc.queries.length, 'Bing has no country split');
  }

  // ---- ingest: fresh days, hours, breakdowns
  {
    const tday = new Date().toISOString().slice(0, 10);
    const pp = ingest.parse({ source: 'gsc', meta: { fresh: tday }, days: { [tday]: { t: [5, 50, 4], f: 1, h: [[13, 1, 10, 3], [25, 1, 1, 1], [2, 1, 5, 4]] } },
      dims: { [tday]: { a: { s: ['usa', 'MOBILE'], r: [[0, 1, 5, 50, 4]] }, q: { s: ['bmi', 'https://mes.fm/bmicalculator', 'usa', 'MOBILE'], r: [[0, 1, 2, 3, 2, 20, 3]] } } } }, tday);
    ok(!pp.error, 'fresh day + hours + breakdowns accepted ' + (pp.error || ''));
    const blob = JSON.parse(pp.days[0][1]);
    ok(blob.f === 1 && blob.h.length === 2 && blob.h[0][0] === 2, 'fresh flag kept, bad hour dropped, hours sorted');
    eq(pp.meta.fresh, tday, 'firstIncompleteDate kept');
    eq(pp.dims.map((x) => x[0]).sort(), ['da:' + tday, 'dq:' + tday], 'breakdown keys');
    ok(ingest.parse({ source: 'gsc', dims: { [tday]: { a: { s: ['usa'], r: [[0, 1, 5, 50, 4]] } } } }, tday).error, 'string index out of range refused');
    ok(ingest.parse({ source: 'gsc', dims: { [tday]: { z: { s: [], r: [] } } } }, tday).error, 'unknown breakdown refused');
    ok(ingest.parse({ source: 'gsc', dims: { [tday]: { a: { s: ['usa', 'm'], r: [[0, 1, -5, 50, 4]] } } } }, tday).error, 'negative numbers refused');
    ok(ingest.parse({ source: 'gsc', dims: { [tday]: { q: { s: ['x'], r: Array(8001).fill([0, 0, 0, 0, 1, 1, 1]) } } } }, tday).error, 'too many breakdown rows refused');
    ok(ingest.parse({ source: 'gsc', dims: { '2025-01-01': { a: { s: [], r: [] } } } }, tday).error, 'breakdown older than 200 days refused');
    const before = STORE.get('gscdash:meta');
    const r3 = await call(ingest, { method: 'POST', headers: { 'x-ingest-key': 'ingest-key' }, body: { source: 'gsc', dims: { [tday]: { a: { s: ['usa', 'MOBILE'], r: [[0, 1, 5, 50, 4]] } } } } });
    eq(r3.code, 200, 'breakdown-only POST stored');
    ok(STORE.has('gscdash:da:' + tday), 'breakdown key written');
    eq(STORE.get('gscdash:meta'), before, 'a POST without day rows leaves meta (newest day) alone');
  }

  // ---- filters: parsing + aggregation through respond()
  eq(sc.parseFilters('').filters, [], 'no filters');
  ok(sc.parseFilters('[{"dim":"hack","op":"contains","v":"x"}]').error, 'unknown filter dimension refused');
  ok(sc.parseFilters('[{"dim":"query","op":"regex","v":"x"}]').error, 'unknown operator refused');
  ok(sc.parseFilters('{bad').error, 'bad JSON refused');
  ok(sc.parseFilters(JSON.stringify(Array(9).fill({ dim: 'query', op: 'contains', v: 'a' }))).error, 'at most 8 filters');
  ok(sc.passes({ page: 'https://mes.fm/bmicalculator/' }, [{ dim: 'page', op: 'exact', v: '/bmicalculator' }]), 'page exact matches the normalised path');
  ok(!sc.passes({ query: 'bmi chart' }, [{ dim: 'query', op: 'not', v: 'BMI' }]), 'not contains, case-insensitive');
  {
    // a fake store: 180 days ending today (Pacific), every day: 2 queries x 2 countries x 1 device, plus hidden traffic in a / b
    const S = new Map(), set = (k, v) => S.set(k, JSON.stringify(v));
    const now = Date.parse('2026-10-24T20:00:00Z'), today = sc.ptDate(now);
    const ad = (s, n) => new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    for (let k = 0; k < 180; k++) {
      const d = ad(today, -k);
      const q = { s: ['bmi calculator', 'https://mes.fm/bmicalculator', 'usa', 'MOBILE', 'timer', 'https://mes.fm/timer', 'can'],
        r: [[0, 1, 2, 3, 4, 100, 3], [0, 1, 6, 3, 1, 50, 5], [4, 5, 2, 3, 2, 40, 8], [4, 5, 6, 3, 1, 10, 6]] };
      const b = { s: ['https://mes.fm/bmicalculator', 'usa', 'MOBILE', 'can', 'https://mes.fm/timer'], r: [[0, 1, 2, 6, 120, 3], [0, 3, 2, 2, 60, 5], [4, 1, 2, 3, 50, 8], [4, 3, 2, 1, 10, 6]] };
      const a = { s: ['usa', 'MOBILE', 'can'], r: [[0, 1, 9, 170, 4], [2, 1, 3, 70, 5]] };
      set('gscdash:dq:' + d, q); set('gscdash:db:' + d, b); set('gscdash:da:' + d, a);
      const blob = { t: [12, 240, 4.3], dev: [['MOBILE', 12, 240, 4.3]] };
      if (k < 2) blob.f = 1;
      if (k < 2) blob.h = [[9, 1, 20, 4], [10, 2, 30, 4]];
      set('gscdash:day:' + d, blob);
    }
    set('gscdash:meta', { at: '2026-10-24T19:00:00Z', lastDay: today, property: 'sc-domain:mes.fm' });
    const deps = { now, mget: async (keys) => keys.map((k) => (S.has(k) ? S.get(k) : null)), bing: null };
    let r = await sc.respond({ range: '28', f: JSON.stringify([{ dim: 'query', op: 'contains', v: 'BMI' }]) }, deps);
    let g = r.body.google;
    ok(g.filtered && g.basis === 'q', 'query filter uses the query breakdown');
    eq(g.daily.length, 28, '28 filtered days');
    eq(g.totals.c, 28 * 5, 'query filter: clicks of the matching rows only');
    eq(g.totals.i, 28 * 150, 'query filter: impressions of the matching rows');
    eq(g.queries.map((x) => x.k), ['bmi calculator'], 'query table filtered');
    eq(g.pages.map((x) => x.k), ['/bmicalculator'], 'pages under a query filter come from the query breakdown');
    eq(g.countries.map((x) => x.k), ['usa', 'can'], 'countries under a query filter');
    ok(!g.prevPartial && g.queries[0].pc === 28 * 5, 'previous 28 days filtered too');
    ok(g.daily[g.daily.length - 1].f === 1, 'fresh flag carried into filtered days');
    r = await sc.respond({ range: '7', f: JSON.stringify([{ dim: 'query', op: 'contains', v: 'bmi' }, { dim: 'country', op: 'exact', v: 'CAN' }]) }, deps);
    eq(r.body.google.totals.c, 7, 'two filters ANDed (bmi in Canada: 1 click a day)');
    r = await sc.respond({ range: '7', f: JSON.stringify([{ dim: 'country', op: 'exact', v: 'can' }]) }, deps);
    g = r.body.google;
    ok(g.basis === 'a' && g.totals.c === 21 && g.totals.i === 490, 'country filter uses the complete country x device breakdown (hidden queries included)');
    eq(g.pages.map((x) => x.k), ['/bmicalculator', '/timer'], 'pages for a country filter come from the page breakdown');
    r = await sc.respond({ range: '7', f: JSON.stringify([{ dim: 'page', op: 'not', v: '/timer' }]) }, deps);
    ok(r.body.google.basis === 'b' && r.body.google.totals.c === 56, 'page "not contains" filter on the page breakdown');
    r = await sc.respond({ range: '365', f: JSON.stringify([{ dim: 'device', op: 'exact', v: 'mobile' }]) }, deps);
    ok(r.body.google.clamped && r.body.rangeUsed === '90' && r.body.google.daily.length === 90, '365 days with a filter answered for 90 days');
    ok(!r.body.google.prevPartial, '...with its previous 90 days (180 days of breakdowns kept)');
    r = await sc.respond({ range: '90', f: JSON.stringify([{ dim: 'device', op: 'exact', v: 'mobile' }]) }, Object.assign({}, deps, { mget: async (keys) => keys.map((k) => (S.has(k) && !(k > 'gscdash:da:' && k < 'gscdash:da:' + ad(today, -120)) ? S.get(k) : null)) }));
    ok(r.body.google.prevPartial && r.body.google.countries[0].pc === undefined, 'previous period only partly stored -> no changes');
    r = await sc.respond({ range: 'today' }, deps);
    g = r.body.google;
    ok(g.day && g.daily.length === 1 && g.daily[0].d === today && g.daily[0].c === 12, 'today: the day totals');
    eq(g.hourly.map((x) => x.h), [9, 10], 'today: hourly numbers');
    eq(g.prevDaily[0].d, ad(today, -1), 'today compares with yesterday');
    eq(g.queries.map((x) => x.k), ['bmi calculator', 'timer'], 'today: tables from the breakdowns');
    r = await sc.respond({ range: 'yesterday', f: JSON.stringify([{ dim: 'query', op: 'exact', v: 'timer' }]) }, deps);
    ok(r.body.google.daily[0].d === ad(today, -1) && r.body.google.totals.c === 3 && !r.body.google.hourly, 'yesterday + filter: one filtered day, no hours');
    r = await sc.respond({ range: '28', f: '[{"dim":"x"}]' }, deps);
    eq(r.status, 400, 'bad filter -> 400');
    // missing breakdowns are reported
    for (const k of [...S.keys()]) if (k.startsWith('gscdash:dq:') && k < 'gscdash:dq:' + ad(today, -3)) S.delete(k);
    r = await sc.respond({ range: '7', f: JSON.stringify([{ dim: 'query', op: 'contains', v: 'bmi' }]) }, deps);
    eq(r.body.google.dimDays, { have: 4, want: 7 }, 'days without breakdowns counted');
  }

  // ---- Google not set up
  for (const k of [...STORE.keys()]) if (k.startsWith('gscdash:') && !k.startsWith('gscdash:bing')) STORE.delete(k);
  delete process.env.BING_WEBMASTER_KEY;
  res = await call(sc, { method: 'GET', query: { range: '28' } });
  eq(res.body.google, { setup: false }, 'Google not set up without data');


  // ---- AI search: export parsing (tool_apps_src/search-console/lib.js) + /api/search-console-ai
  const L = require(path.join(__dirname, 'search-console', 'lib.js'));
  const aiApi = require(path.join(API, 'search-console-ai.js'));
  const FIX = path.join(__dirname, 'search-console', 'fixtures');
  eq(L.parseCsv('a,b\n"x, y",2\r\n"he said ""hi""",3\n'), [['a', 'b'], ['x, y', '2'], ['he said "hi"', '3']], 'CSV: quotes, commas, CRLF');
  eq(L.parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']], 'CSV: semicolons');
  eq([L.num('1,234'), L.num('12.5%'), L.num('1.234,5'), L.num('~'), L.num('-'), L.num('<10'), L.num('3,5')], [1234, 12.5, 1234.5, 0, 0, 10, 3.5], 'numbers');
  eq([L.parseDate('2026-10-20'), L.parseDate('10/21/2026'), L.parseDate('21/10/2026'), L.parseDate('Oct 20, 2026'), L.parseDate('20 Oct 2026'), L.parseDate(46315), L.parseDate('2026-02-30'), L.parseDate('2026-10-20T00:00:00')],
    ['2026-10-20', '2026-10-21', '2026-10-21', '2026-10-20', '2026-10-20', '2026-10-20', null, '2026-10-20'], 'dates');
  eq(L.classify(['Date', 'Impressions']).kind, 'g-daily', 'Google dates table');
  eq(L.classify(['Top pages', 'Impressions']).kind, 'g-pages', 'Google pages table');
  eq(L.classify(['Country', 'Impressions']).kind, 'g-countries', 'Google countries table');
  eq(L.classify(['Top queries', 'Clicks', 'Impressions', 'CTR', 'Position']).kind, 'normal', 'normal Performance export is not AI data');
  eq(L.classify(['Date', 'Citations', 'Cited pages']).kind, 'b-daily', 'Bing citations by day');
  eq(L.classify(['Grounding queries', 'Intent', 'Topic', 'Citations', 'Citation share', 'Avg. cited pages per day']).kind, 'b-queries', 'Bing grounding queries');
  eq(L.classify(['URL', 'Citations']).kind, 'b-pages', 'Bing cited pages');
  eq(L.classify(['Foo', 'Impressions'], 'Pages.csv').kind, 'g-pages', 'file name breaks a tie');
  const bq = L.parseTable([['Grounding query', 'Intent', 'Topic', 'Citations', 'Citation share', 'Avg cited pages per day'], ['bmi', 'Informational', 'Health', '12', '0.25', '1.5']], 'q.csv');
  eq(bq.rows, [['bmi', 'Informational', 'Health', 12, 25, 1.5]], 'Bing share written as a fraction becomes %');
  eq(L.oldSubdomain('https://gradecalculator.mes.fm/memes.html'), { sub: 'gradecalculator', to: 'https://mes.fm/gradecalculator/memes' }, 'old subdomain page -> new URL');
  eq(L.oldSubdomain('gpacalculator.mes.fm/'), { sub: 'gpacalculator', to: 'https://mes.fm/gpacalculator' }, 'old subdomain home -> new URL');
  eq(L.oldSubdomain('https://bmicalculator.mes.fm/sports/index.html'), { sub: 'bmicalculator', to: 'https://mes.fm/bmicalculator/sports' }, 'index.html dropped');
  eq(L.oldSubdomain('https://eyes.mes.fm/x'), { sub: 'eyes', to: null }, 'unknown subdomain flagged, no guess');
  eq([L.oldSubdomain('https://mes.fm/timer'), L.oldSubdomain('https://www.mes.fm/')], [null, null], 'mes.fm itself is not old');
  {
    const zipT = await L.parseFile({ name: 'google-genai-export.zip', bytes: new Uint8Array(fs.readFileSync(path.join(FIX, 'google-genai-export.zip'))) });
    eq(zipT.map((t) => t.kind).sort(), ['filters', 'g-countries', 'g-daily', 'g-devices', 'g-pages'], 'Google ZIP (deflated): every table recognised, __MACOSX skipped');
    const c = L.combine(zipT);
    eq(c.google.daily, [['2026-10-20', 1204], ['2026-10-21', 980], ['2026-10-22', 0]], 'Google daily rows (BOM, thousands, ~ = 0)');
    eq(c.google.pages[0], ['https://gradecalculator.mes.fm/', 31000], 'Google pages sorted');
    eq(c.google.countries[1][0], 'Korea, Republic of', 'quoted country name');
    ok(c.bing === null && c.google.period.from === '2026-10-20', 'period from the days, no Bing');
    const xT = await L.parseFile({ name: 'bing-ai-performance.xlsx', bytes: new Uint8Array(fs.readFileSync(path.join(FIX, 'bing-ai-performance.xlsx'))) });
    eq(xT.map((t) => t.kind), ['b-daily', 'b-queries'], 'Bing .xlsx: both sheets recognised');
    const cb = L.combine(xT).bing;
    eq(cb.daily, [['2026-10-20', 40, 9.5], ['2026-10-21', 35, 8]], 'xlsx: date serial + text date');
    eq(cb.queries, [['grade calculator & final', 'Informational', 'Education', 412, 23.5, 0]], 'xlsx: rich shared string, entity, inline strings');
    const per = L.periods({ '2026-10-01': 1, '2026-10-02': 2, '2026-10-03': 3, '2026-10-04': 4 }, 2);
    ok(per.end === '2026-10-04' && L.sumOf({ '2026-10-03': 3, '2026-10-04': 4 }, per.cur) === 7 && per.prevFull && per.prev.length === 2, 'periods end on the newest stored day');
    ok(L.sumOf({ a: [5, 2] }, ['a'], 1) === 2, 'Bing second number');

    // API
    const AIS = new Map();
    const deps = { get: async (k) => (AIS.has(k) ? AIS.get(k) : null), set: async (k, v) => { AIS.set(k, v); }, del: async (k) => { AIS.delete(k); } };
    const okReq = (body, extra) => Object.assign({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body }, extra || {});
    let r = await aiApi.respond(okReq(c.google), deps);
    ok(r.status === 200 && r.body.days === 3, 'Google import stored ' + JSON.stringify(r.body).slice(0, 120));
    r = await aiApi.respond(okReq({ source: 'google', daily: [['2026-10-22', 50], ['2026-10-23', 60]], pages: [['https://mes.fm/timer', 5]] }), deps);
    const gb = JSON.parse(AIS.get('gscdash:ai:google'));
    ok(gb.daily['2026-10-20'] === 1204 && gb.daily['2026-10-22'] === 50 && gb.daily['2026-10-23'] === 60, 'second import merges days by date');
    ok(gb.pages.length === 1 && gb.countries.length === 2 && gb.tp.pages.from === '2026-10-22', 'tables replaced only when sent, with their period');
    ok(gb.imports.length === 2, 'import history kept');
    eq((await aiApi.respond(okReq(c.google, { origin: 'https://evil.example' }), deps)).status, 403, 'other origin refused');
    eq((await aiApi.respond(okReq(c.google, { origin: undefined }), deps)).status, 403, 'no origin refused');
    eq((await aiApi.respond(okReq(c.google, { contentType: 'text/plain' }), deps)).status, 415, 'non-JSON refused');
    eq((await aiApi.respond(okReq({ source: 'yahoo', daily: [] }), deps)).status, 400, 'unknown source refused');
    eq((await aiApi.respond(okReq({ source: 'google', clicks: [] }), deps)).status, 400, 'unknown table refused');
    eq((await aiApi.respond(okReq({ source: 'google', daily: [['20-10-2026', 5]] }), deps)).status, 400, 'bad date refused');
    eq((await aiApi.respond(okReq({ source: 'google', daily: [['2026-10-20', -5]] }), deps)).status, 400, 'negative number refused');
    eq((await aiApi.respond(okReq({ source: 'bing', pages: Array(5001).fill(['x', 1]) }), deps)).status, 400, 'too many rows refused');
    eq((await aiApi.respond(okReq({ source: 'google' }), deps)).status, 400, 'empty import refused');
    eq((await aiApi.respond(okReq('x'.repeat(1600000)), deps)).status, 413, 'huge body refused');
    r = await aiApi.respond(okReq(L.combine(xT).bing), deps);
    ok(r.status === 200, 'Bing import stored');
    const bb = JSON.parse(AIS.get('gscdash:ai:bing'));
    eq(bb.daily['2026-10-20'], [40, 9.5], 'Bing day = [citations, cited pages]');
    r = await aiApi.respond({ method: 'GET' }, deps);
    ok(r.body.google && r.body.bing && r.body.google.daily['2026-10-23'] === 60, 'GET returns both');
    eq((await aiApi.respond({ method: 'DELETE', origin: 'https://mes.fm', query: { src: 'bing' } }, deps)).status, 200, 'delete');
    ok(!AIS.has('gscdash:ai:bing'), 'Bing blob removed');
    eq((await aiApi.respond({ method: 'DELETE', origin: 'https://evil.example', query: { src: 'google' } }, deps)).status, 403, 'delete from another origin refused');
    eq((await aiApi.respond({ method: 'PUT', origin: 'https://mes.fm' }, deps)).status, 405, 'other methods refused');
    // handler with the fake Redis behind fetch
    STORE.delete('gscdash:ai:google');
    const hr = mockRes();
    await aiApi({ method: 'POST', headers: { origin: 'https://mes.fm', 'content-type': 'application/json' }, body: c.google, query: {} }, hr);
    ok(hr.code === 200 && STORE.has('gscdash:ai:google'), 'handler stores through Redis');
    ok(String(hr.headers['cache-control'] || '').includes('no-store'), 'handler: no-store');
  }

  // ---- auth (middleware.js)
  const mw = fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'middleware.js'), 'utf8');
  const src = mw.replace(/export const config/, 'const config').replace(/export default function middleware/, 'function middleware') + '\nmodule.exports = { config, middleware };';
  const m = {}; new Function('module', 'atob', src)(m, (s) => Buffer.from(s, 'base64').toString('binary'));
  const { config, middleware } = m.exports;
  ok(config.matcher.includes('/search-console') && config.matcher.includes('/search-console/:path*') && config.matcher.includes('/api/search-console'), 'page + data API are gated');
  ok(config.matcher.includes('/api/search-console-ai'), 'imported AI numbers API is gated');
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
  for (const slug of ['search-console', 'ads']) {
    const f = path.join(__dirname, '..', 'mes.fm', slug, 'index.html');
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    ok(/data-page-modes="3"/.test(html) && /HUB-THEATRE-HEAD/.test(html) && /hub-theatre\.js/.test(html), slug + ': Standard | Wide | Theatre switch (Wide by default)');
    ok(/panel-view\.js/.test(html), slug + ': Fill window / Full screen buttons');
  }
  for (const f of ['stats/index.html', 'seo/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'mes.fm', f), 'utf8');
    ok(/class="mes-owner-links" hidden/.test(html) && !/Search Console \(private\)/.test(html), f + ': private links hidden unless the owner flag is set');
  }

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
