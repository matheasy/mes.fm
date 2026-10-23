// Tests for the private ads page's data: api/earnings-ingest.js (writes) and api/earnings.js (reads + joins).
// Run: node tool_apps_src/earnings-tests.js
const path = require('path');
const ROOT = path.join(__dirname, '..', 'mes.fm');
let fails = 0, passes = 0;
function ok(c, m) { if (c) passes++; else { fails++; console.log('FAIL', m); } }

const ingest = require(path.join(ROOT, 'api/earnings-ingest.js'));
const earnings = require(path.join(ROOT, 'api/earnings.js'));
const today = new Date().toISOString().slice(0, 10);
const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// ---- parse()
let p = ingest.parse({ source: 'gads', meta: { currency: 'VND' }, days: { [ago(1)]: { camps: [['BMI', 'DESKTOP', 10, 2, 800000000]], geo: [['AR', 'Argentina', 'BMI', 10, 2, 800000000]], lp: [['https://mes.fm/calculadora-imc', 'BMI', 2, 800000000]] } } }, today);
ok(!p.error && p.days.length === 1 && p.meta.currency === 'VND', 'valid gads payload');
ok(JSON.parse(p.days[0][1]).camps[0][4] === 800000000, 'micros kept');
p = ingest.parse({ source: 'other', days: { [today]: {} } }, today);
ok(p.error === 'unknown source', 'unknown source rejected');
p = ingest.parse({ source: 'adsense', days: { 'x': {} } }, today);
ok(/bad date/.test(p.error), 'bad date rejected');
p = ingest.parse({ source: 'adsense', days: { [ago(500)]: {} } }, today);
ok(/out of range/.test(p.error), 'old date rejected');
p = ingest.parse({ source: 'adsense', days: { [today]: { pages: [['mes.fm/a', 1.5, 10, 20, 1], ['bad', -1, 1, 1, 1], ['short', 1]] } } }, today);
ok(!p.error && JSON.parse(p.days[0][1]).pages.length === 1, 'bad rows dropped, good kept');
p = ingest.parse({ source: 'adsense', days: { [today]: { pages: [['x'.repeat(301), 1, 1, 1, 1]] } } }, today);
ok(JSON.parse(p.days[0][1]).pages.length === 0, 'over-long string dropped');
ok(ingest.sameKey('abc', 'abc') && !ingest.sameKey('abd', 'abc') && !ingest.sameKey('', 'abc') && !ingest.sameKey('abc', ''), 'key compare');

// ---- normPage / normDevice
ok(earnings.normPage('https://mes.fm/bmicalculator/index.html?x=1') === '/bmicalculator', 'normPage index.html + query');
ok(earnings.normPage('mes.fm/timer/') === '/timer', 'normPage trailing slash, no scheme');
ok(earnings.normPage('https://www.mes.fm/') === '/', 'normPage root');
ok(earnings.normPage('https://cole.example.org/x.html') === 'cole.example.org/x', 'other host kept');
ok(earnings.normDevice('High-end mobile devices') === 'mobile' && earnings.normDevice('DESKTOP') === 'desktop' && earnings.normDevice('Tablets') === 'tablet' && earnings.normDevice('CONNECTED_TV') === 'tv', 'devices');

// ---- aggregate
const d1 = ago(1), d2 = ago(2);
const blobs = {
  gads: {
    [d1]: { camps: [['BMI AR', 'DESKTOP', 100, 10, 3679282000]], geo: [['AR', 'Argentina', 'BMI AR', 100, 10, 3679282000]], lp: [['https://mes.fm/calculadora-imc', 'BMI AR', 10, 3679282000]] },
  },
  adsense: {
    [d1]: { pages: [['https://mes.fm/calculadora-imc', 0.5, 20, 40, 1], ['mes.fm/timer', 1, 100, 200, 2]], geo: [['AR', 'Argentina', 0.5, 20], ['US', 'United States', 1, 100]], dev: [['Desktop', 1.5, 120]], dom: [['mes.fm', 1.5, 120]] },
    [d2]: { pages: [['mes.fm/timer/', 2, 50, 100, 1]], geo: [], dev: [], dom: [] },
  },
};
const a = earnings.aggregate([d1, d2], blobs, 18396.41);
ok(Math.abs(a.totals.spend - 0.2) < 1e-4, 'spend converted to CAD: ' + a.totals.spend);
ok(Math.abs(a.totals.rev - 3.5) < 1e-9 && a.totals.pv === 170, 'revenue + page views summed');
const imc = a.pages.find((x) => x.path === '/calculadora-imc');
ok(imc && imc.rev === 0.5 && Math.abs(imc.spend - 0.2) < 1e-4 && imc.clicks === 10, 'landing page joins AdSense and Ads');
ok(a.pages.find((x) => x.path === '/timer').rev === 3, 'same page across days and URL forms merges');
const ar = a.countries.find((x) => x.cc === 'AR');
ok(ar && ar.rev === 0.5 && Math.abs(ar.spend - 0.2) < 1e-4, 'country joins');
ok(a.devices.find((x) => x.dev === 'desktop').clicks === 10, 'device joins');
ok(a.campaigns[0].name === 'BMI AR' && a.campaigns[0].dev.desktop === 10, 'campaign with device clicks');
ok(a.daily.length === 2 && a.daily[0].d === d2, 'daily sorted oldest first');

// ---- handlers with a fake Redis
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
const store = {};
global.fetch = async (url, opts) => {
  if (/open\.er-api/.test(url)) return { ok: true, json: async () => ({ rates: { VND: 18000 } }) };
  const cmds = JSON.parse(opts.body);
  return { ok: true, json: async () => cmds.map((c) => {
    if (c[0] === 'SET') { store[c[1]] = c[2]; return { result: 'OK' }; }
    if (c[0] === 'GET') return { result: store[c[1]] || null };
    if (c[0] === 'MGET') return { result: c.slice(1).map((k) => store[k] || null) };
    return { result: null };
  }) };
};
function res() { return { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } }; }
(async () => {
  delete process.env.EARNINGS_INGEST_KEY;
  let r = res(); await ingest({ method: 'POST', headers: {}, body: {} }, r);
  ok(r.code === 503, 'no key configured -> 503');
  process.env.EARNINGS_INGEST_KEY = 'secret-123';
  r = res(); await ingest({ method: 'POST', headers: { 'x-ingest-key': 'nope' }, body: {} }, r);
  ok(r.code === 401, 'wrong key -> 401');
  r = res(); await ingest({ method: 'GET', headers: {}, body: {} }, r);
  ok(r.code === 405, 'GET -> 405');
  r = res(); await ingest({ method: 'POST', headers: { 'x-ingest-key': 'secret-123' }, body: JSON.stringify({ source: 'gads', meta: { currency: 'VND', tz: 'America/Vancouver' }, days: blobs.gads }) }, r);
  ok(r.code === 200 && store['adsdash:gads:' + d1] && JSON.parse(store['adsdash:meta:gads']).currency === 'VND', 'gads stored');
  r = res(); await ingest({ method: 'POST', headers: { 'x-ingest-key': 'secret-123' }, body: { source: 'adsense', meta: { currency: 'CAD' }, days: blobs.adsense } }, r);
  ok(r.code === 200 && r.body.days === 2, 'adsense stored');
  r = res(); await earnings({ query: { range: '7d' } }, r);
  ok(r.code === 200 && Math.abs(r.body.totals.spend - 3679.282 / 18000) < 1e-4 && r.body.totals.rev === 3.5, 'read back with live fx');
  ok(r.body.fx.perCad === 18000 && r.body.adsCurrency === 'VND' && r.headers['Cache-Control'] === 'private, no-store', 'fx + private cache header');
  r = res(); await earnings({ query: { range: 'all' } }, r);
  ok(r.body.range === '30d', 'unknown range -> 30d');
  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
