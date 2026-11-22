// Country counting on /stats: api/track.js stores x-vercel-ip-country, api/stats.js and api/stats-series.js read it back.
// node tool_apps_src/stats-country-tests.js
'use strict';
const path = require('path');
const api = (f) => require(path.join(__dirname, '..', 'mes.fm', 'api', f));
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL', m); } }
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

(async () => {
  // --- track.js: the country header becomes HINCRBY + hourly/daily ZINCRBY; junk headers count as XX
  const track = api('track.js');
  let sent = null;
  global.fetch = async (url, o) => { sent = JSON.parse(o.body); return { json: async () => [] }; };
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36';
  for (const [hdr, want] of [['ca', 'CA'], ['VN', 'VN'], ['', 'XX'], ['<script>', 'XX'], ['USA', 'XX']]) {
    sent = null;
    const r = res();
    await track({ method: 'POST', headers: { 'user-agent': ua, 'x-vercel-ip-country': hdr }, body: { site: 'mes.fm', path: '/stats' } }, r);
    ok(r.code === 204, 'track answers 204');
    const h = sent.find((c) => c[0] === 'HINCRBY' && c[1] === 'pageviews:country-totals');
    ok(h && h[2] === want, 'country-totals gets ' + want + ' for "' + hdr + '"');
    ok(sent.some((c) => c[0] === 'ZINCRBY' && /^pageviews:countrytotals:hourly:/.test(c[1]) && c[3] === want), 'hourly bucket ' + want);
    ok(sent.some((c) => c[0] === 'ZINCRBY' && /^pageviews:countrytotals:daily:/.test(c[1]) && c[3] === want), 'daily bucket ' + want);
  }
  // other sites keep their own prefix
  sent = null;
  await track({ method: 'POST', headers: { 'user-agent': ua, 'x-vercel-ip-country': 'CA' }, body: { site: 'alpinewestcreative.com', path: '/' } }, res());
  ok(sent.some((c) => c[0] === 'HINCRBY' && c[1] === 'awc:pageviews:country-totals'), 'awc country key is prefixed');

  // --- stats.js: ranged and all-time answers carry countryTotals
  const stats = api('stats.js');
  global.fetch = async (url, o) => {
    const cmds = JSON.parse(o.body);
    return { json: async () => cmds.map((c) => {
      if (c[0] === 'ZREVRANGE' && /:co:|^tmp|co/.test(c[1]) && cmds.findIndex((x) => x === c) === 10) return { result: ['CA', '7', 'US', '12'] };
      if (c[0] === 'HGETALL' && c[1] === 'pageviews:country-totals') return { result: ['VN', '3', 'XX', '1'] };
      return { result: [] };
    }) };
  };
  let r = res();
  await stats({ method: 'GET', query: { range: '7d' }, headers: {} }, r);
  ok(r.code === 200 && Array.isArray(r.body.countryTotals), '7d answer has countryTotals');
  ok(r.body.countryTotals[0] && r.body.countryTotals[0].country === 'US' && r.body.countryTotals[0].views === 12, '7d countries sorted, biggest first');
  ok(r.body.countriesSince === '2026-11-21', 'countriesSince');
  r = res();
  await stats({ method: 'GET', query: { range: 'all' }, headers: {} }, r);
  ok(r.code === 200 && r.body.countryTotals.length === 2 && r.body.countryTotals[0].country === 'VN', 'all-time reads the country hash');

  // --- stats-series.js ?by=country
  const series = api('stats-series.js');
  let asked = null;
  global.fetch = async (url, o) => {
    asked = JSON.parse(o.body);
    return { json: async () => asked.map((c, i) => ({ result: i === asked.length - 1 ? ['CA', '2', 'DE', '5'] : [] })) };
  };
  r = res();
  await series({ method: 'GET', query: { range: '7d', by: 'country' }, headers: {} }, r);
  ok(asked.every((c) => /^pageviews:countrytotals:daily:/.test(c[1])), 'series reads countrytotals buckets');
  const last = r.body.points[r.body.points.length - 1];
  ok(last.views === 7 && last.c.DE === 5 && last.c.CA === 2, 'series point has c + views');

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
