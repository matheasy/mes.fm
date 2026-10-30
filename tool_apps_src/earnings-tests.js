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
    [ago(3)]: { pages: [['mes.fm/timer', 1, 10, 10, 0]], geo: [], dev: [['Desktop', 3, 50], ['High-end mobile devices', 1, 30]], dom: [] },
    [d2]: { pages: [['mes.fm/timer/', 2, 50, 100, 1]], geo: [], dev: [], dom: [] },
  },
};
const a = earnings.aggregate([d1, d2], blobs, 18396.41);
const a3 = earnings.aggregate([d1, d2, ago(3)], blobs, 18396.41);
ok(Math.abs(a3.totals.rev - 7.5) < 1e-9 && a3.totals.pv === 250, 'platform report wins when pages under-count');
const un = a3.pages.find((x) => x.path === '(pages AdSense did not list)');
ok(un && Math.abs(un.rev - 3) < 1e-9 && un.pv === 70, 'the gap is one unlisted row');
ok(Math.abs(a3.pages.reduce((t, x) => t + x.rev, 0) - a3.totals.rev) < 1e-9, 'pages add up to the total');
ok(Math.abs(a.totals.spend - 0.2) < 1e-4, 'spend converted to CAD: ' + a.totals.spend);
ok(Math.abs(a.totals.rev - 3.5) < 1e-9 && a.totals.pv === 170, 'revenue + page views summed (day 1 from the platform report, day 2 from pages)');
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
  ok(r.code === 200 && r.body.days === 3, 'adsense stored');
  r = res(); await earnings({ query: { range: '7d' } }, r);
  ok(r.code === 200 && Math.abs(r.body.totals.spend - 3679.282 / 18000) < 1e-4 && r.body.totals.rev === 7.5, 'read back with live fx');
  ok(r.body.fx.perCad === 18000 && r.body.fx.rates.VND === 18000 && r.body.fx.rates.CAD === 1 && r.body.fx.rates.USD === 0.72 && r.body.adsCurrency === 'VND' && r.headers['Cache-Control'] === 'private, no-store', 'fx rates for the currency switch (USD from the fallback) + private cache header');
  // Ads spend from before the first AdSense earnings is ignored
  store['adsdash:gads:' + ago(6)] = JSON.stringify({ camps: [['Old', 'DESKTOP', 5, 5, 9000000000]], geo: [], lp: [] });
  r = res(); await earnings({ query: { range: '7d' } }, r);
  ok(r.body.from === ago(3) && r.body.daily.every((x) => x.d >= ago(3)) && Math.abs(r.body.totals.spend - 3679.282 / 18000) < 1e-4, 'spend before the first AdSense earnings is ignored');
  r = res(); await earnings({ query: { range: 'yesterday' } }, r);
  ok(r.code === 200 && r.body.range === 'yesterday' && r.body.daily.length <= 1, 'yesterday = one day');
  r = res(); await earnings({ query: { range: 'all' } }, r);
  ok(r.body.range === '30d', 'unknown range -> 30d');
  // ---- Search Console on the ads page (?gsc=1, ?vs=1) + the join helpers
  const GJ = require(path.join(ROOT, 'api/_gsc-join.js'));
  ok(GJ.a2of('arg') === 'AR' && GJ.a3of('ar') === 'arg' && GJ.a2of('xkx') === 'XK' && GJ.a2of('zzz') === null, 'alpha-3 <-> alpha-2');
  const pd = earnings.pacificDays(3, new Date());
  const today2 = earnings.pacificDay(new Date());
  ok(pd.length === 3 && pd[2] === today2 && pd[0] < pd[1], 'pacific days, oldest first, ending today');
  const PC = 'https://mes.fm/percentagecalculator';
  for (const d of pd) {
    store['gscdash:day:' + d] = JSON.stringify(d === today2 ? { t: [0, 0, 0], f: 1 } : { t: [10, 900, 9], dev: [] });
    store['gscdash:dp:' + d] = JSON.stringify({ s: [PC, 'https://mes.fm/timer'], r: [[0, 3, 800, 9], [1, 1, 100, 5]] });
    store['gscdash:da:' + d] = JSON.stringify({ s: ['arg', 'MOBILE', 'usa'], r: [[0, 1, 2, 300, 9], [2, 1, 8, 600, 9]] });
    store['gscdash:db:' + d] = JSON.stringify({ s: [PC, 'arg', 'MOBILE'], r: [[0, 1, 2, 1, 40, 9]] });
  }
  store['gscdash:meta'] = JSON.stringify({ lastDay: pd[1] });
  store['gscdash:bing:GetRankAndTrafficStats'] = JSON.stringify({ at: new Date().toISOString(), rows: [[pd[0], 4, 50]] });
  r = res(); await earnings({ query: { gsc: '1', range: '7d' } }, r);
  ok(r.code === 200 && r.body.setup, 'gsc part answers');
  const gd = r.body.daily.find((x) => x.d === pd[0]);
  ok(gd && gd.gc === 10 && gd.gi === 900 && gd.bc === 4 && gd.bi === 50, 'daily Google + Bing search numbers');
  ok(!('gc' in r.body.daily.find((x) => x.d === today2)), 'an empty fresh day is a gap, not 0');
  ok(r.body.pages['/percentagecalculator'].i === 2400 && r.body.pages['/percentagecalculator'].c === 9, 'pages joined by path from the complete page breakdown');
  ok(r.body.countries.AR.i === 900 && r.body.countries.US.c === 24, 'countries converted to alpha-2');
  // days before the page breakdown existed fall back to b
  delete store['gscdash:dp:' + pd[0]];
  r = res(); await earnings({ query: { gsc: '1', range: '7d' } }, r);
  ok(r.body.cover.bDays === 1 && r.body.pages['/percentagecalculator'].i === 1600 + 40, 'fallback to page x country x device, counted');
  store['gscdash:dp:' + pd[0]] = JSON.stringify({ s: [PC], r: [[0, 3, 800, 9]] });
  // Ads vs SEO
  for (const d of pd) store['adsdash:gads:' + d] = JSON.stringify(d === pd[0] ? { camps: [], geo: [], lp: [] } : { camps: [['PC AR', 'MOBILE', 50, 5, 18000000000]], geo: [['AR', 'Argentina', 'PC AR', 50, 5, 18000000000], ['US', 'United States', 'Other', 10, 1, 18000000]], lp: [[PC + '?gclid=1', 'PC AR', 5, 18000000000]] });
  r = res(); await earnings({ query: { vs: '1', days: '30', cc: 'ar', page: '/percentagecalculator' } }, r);
  ok(r.code === 200 && r.body.basis === 'b' && r.body.cc === 'AR' && r.body.campaigns.join() === 'PC AR', 'vs: page + country');
  const vr = r.body.rows.find((x) => x.d === pd[1]);
  ok(vr && Math.abs(vr.spend - 1) < 1e-6 && vr.adClicks === 5 && vr.oc === 1 && vr.oi === 40, 'vs: spend in CAD, ad clicks, organic from page x country');
  ok(r.body.rows.length === 30 && r.body.rows[0].oc === null, 'vs: days without Search Console data are null');
  ok(r.body.ba.start === pd[1] && r.body.ba.n === 2 && r.body.ba.before.days === 1 && r.body.ba.before.i === 40 && r.body.ba.after.i === 80 && r.body.ba.imprChange === 0, 'vs: before / after around the first ad spend');
  r = res(); await earnings({ query: { vs: '1', days: '30', page: '/percentagecalculator' } }, r);
  ok(r.body.basis === 'p' && r.body.rows.find((x) => x.d === pd[1]).oi === 800, 'vs: page only = complete page totals');
  r = res(); await earnings({ query: { vs: '1', days: '30', cc: 'US' } }, r);
  ok(r.body.basis === 'a' && r.body.rows.find((x) => x.d === pd[1]).oi === 600 && r.body.rows.find((x) => x.d === pd[1]).adClicks === 1, 'vs: country only');
  ok(GJ.beforeAfter([{ d: 'a', spend: 1 }]).why === 'spend-from-first-day' && GJ.beforeAfter([{ d: 'a', spend: 0 }]).why === 'no-spend', 'before / after edge cases');
  const ba = GJ.beforeAfter([{ d: '1', spend: 0, oc: 1, oi: 10 }, { d: '2', spend: 0, oc: 1, oi: 10 }, { d: '3', spend: 2, oc: 2, oi: 20 }, { d: '4', spend: 2, oc: 4, oi: 30 }]);
  ok(ba.n === 2 && ba.clicksChange === 200 && ba.imprChange === 150, 'before / after: per-day change');

  // ---- chart notes API
  const notes = require(path.join(ROOT, 'api/chart-notes.js'));
  let nstore = null;
  const ndeps = { get: async () => nstore, set: async (v) => { nstore = v; } };
  let n = await notes.respond({ method: 'POST', origin: 'https://evil.example', contentType: 'application/json', body: { op: 'add', d: '2026-10-20', t: 'x' } }, ndeps);
  ok(n.status === 403, 'notes: other origins refused');
  n = await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'text/plain', body: '{}' }, ndeps);
  ok(n.status === 415, 'notes: JSON only');
  n = await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body: JSON.stringify({ op: 'add', d: '2026-10-20', t: '  Argentina\ncampaigns  started ' }) }, ndeps);
  ok(n.status === 200 && n.body.note.t === 'Argentina campaigns started' && /^[0-9a-f]{12}$/.test(n.body.note.id), 'notes: add (text tidied)');
  const nid = n.body.note.id;
  n = await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body: { op: 'add', d: '2026-10-01', t: 'earlier' } }, ndeps);
  n = await notes.respond({ method: 'GET' }, ndeps);
  ok(n.body.notes.length === 2 && n.body.notes[0].d === '2026-10-01', 'notes: listed oldest day first');
  ok((await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body: { op: 'add', d: '2026-13-40', t: 'x' } }, ndeps)).status === 400, 'notes: bad date refused');
  ok((await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body: { op: 'add', d: '2026-10-02', t: '   ' } }, ndeps)).status === 400, 'notes: empty text refused');
  n = await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body: { op: 'update', id: nid, t: 'edited', d: '2026-10-21' } }, ndeps);
  ok(n.status === 200 && n.body.note.t === 'edited' && n.body.note.d === '2026-10-21', 'notes: update');
  n = await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body: { op: 'delete', id: nid } }, ndeps);
  ok(n.status === 200 && JSON.parse(nstore).length === 1, 'notes: delete');
  ok((await notes.respond({ method: 'POST', origin: 'https://mes.fm', contentType: 'application/json', body: { op: 'delete', id: 'nope' } }, ndeps)).status === 404, 'notes: unknown id -> 404');
  ok(notes.cleanText('a'.repeat(300)).length === 200, 'notes: at most 200 characters');
  const mw = require('fs').readFileSync(path.join(ROOT, 'middleware.js'), 'utf8');
  ok(/'\/api\/chart-notes'/.test(mw), 'notes API is behind the password');

  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
