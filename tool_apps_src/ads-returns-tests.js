// Tests for the Google Ads return check: main_js/track.js (client), api/track.js (writes), api/ads-returns.js (reads).
// Run: node tool_apps_src/ads-returns-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', 'mes.fm');
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL', msg); } }

// ---- client: run track.js in a fake browser on a given day / URL, return what it beaconed
const CLIENT = fs.readFileSync(path.join(ROOT, 'main_js/track.js'), 'utf8');
function visit(store, day, url) {
  const u = new URL(url);
  let sent = null;
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [day + 'T12:00:00Z'])); } }
  FakeDate.parse = RealDate.parse;
  const ctx = {
    Date: FakeDate, URLSearchParams, JSON, String, Array, Number,
    location: { search: u.search, pathname: u.pathname, hostname: u.hostname },
    document: { referrer: '' },
    navigator: { sendBeacon: (_u, d) => { sent = Object.fromEntries(d.entries()); return true; } },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  };
  vm.runInNewContext(CLIENT, ctx);
  return sent;
}

let s = {};
let b = visit(s, '2026-10-22', 'https://mes.fm/gematria?gclid=abc');
ok(b.ad === 'g' && b.adf === '1' && b.adp === '/gematria' && b.add === '2026-10-22', 'first ad click marks arrival');
ok(!/gclid/.test(b.path), 'gclid still stripped from path');
b = visit(s, '2026-10-22', 'https://mes.fm/birthday');
ok(!b.adf && !b.adr && !b.adp, 'same day, another page: nothing extra');
b = visit(s, '2026-10-23', 'https://mes.fm/timer');
ok(b.adr === '1' && b.adp === '/gematria' && b.add === '2026-10-22', 'next day organic visit = return 1 for the landing page');
b = visit(s, '2026-10-23', 'https://mes.fm/gematria');
ok(!b.adr, 'second page the same day does not count again');
b = visit(s, '2026-10-25', 'https://mes.fm/gematria?gclid=zzz');
ok(!b.adf && !b.adr, 'a later ad click is neither a new arrival nor a return');
b = visit(s, '2026-10-26', 'https://mes.fm/gematria');
ok(b.adr === '2', 'next organic day = return 2');
b = visit(s, '2027-06-01', 'https://mes.fm/gematria');
ok(!b.adr && !('mes-adv' in s), 'record forgotten after 180 days');
b = visit({}, '2026-10-22', 'https://mes.fm/timer');
ok(!b.adf && !b.adr, 'organic visitor never marked');
// broken storage must not break the beacon
const bad = { get 'mes-adv'() { throw new Error('denied'); } };
b = visit(bad, '2026-10-22', 'https://mes.fm/timer?gclid=1');
ok(b && b.ad === 'g', 'beacon still sent when storage throws');

// ---- server writes: api/track.js with a fake Upstash
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
let lastCommands = [];
global.fetch = async (_url, opts) => {
  lastCommands = JSON.parse(opts.body);
  return { ok: true, json: async () => lastCommands.map(() => ({ result: [] })) };
};
const track = require(path.join(ROOT, 'api/track.js'));
function res() { const r = { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, end() { return this; }, json(o) { this.body = o; return this; } }; return r; }
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const ua = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' };
async function post(body) { lastCommands = []; await track({ method: 'POST', headers: ua, body: Object.assign({ site: 'mes.fm', path: '/x', referrer: '' }, body) }, res()); return lastCommands.filter((c) => /^ads:/.test(c[1])); }

(async () => {
  let c = await post({ ad: 'g', adf: '1', adp: '/gematria', add: today });
  ok(c.some((x) => x[0] === 'ZINCRBY' && x[1] === `ads:arr:${today}` && x[3] === 'mes.fm|/gematria'), 'arrival counted');
  c = await post({ adf: '1', adp: '/gematria', add: daysAgo(3) });
  ok(!c.length, 'arrival dated in the past is rejected');
  c = await post({ adr: '1', adp: '/gematria', add: daysAgo(2) });
  const keys = c.filter((x) => x[0] === 'ZINCRBY').map((x) => x[1]);
  ok(keys.includes(`ads:retdays:${daysAgo(2)}`) && keys.includes(`ads:ret1:${daysAgo(2)}`) && !keys.includes(`ads:ret5:${daysAgo(2)}`), 'return 1 counted');
  c = await post({ adr: '5', adp: '/gematria', add: daysAgo(9) });
  ok(c.filter((x) => x[0] === 'ZINCRBY').map((x) => x[1]).includes(`ads:ret5:${daysAgo(9)}`), 'fifth return day counted as loyal');
  c = await post({ adr: '1', adp: '/gematria', add: today });
  ok(!c.length, 'return on the arrival day is rejected');
  c = await post({ adr: '1', adp: '/gematria', add: daysAgo(200) });
  ok(!c.length, 'return after 180 days is rejected');
  c = await post({ adf: '1', adp: 'gematria', add: today });
  ok(!c.length, 'path must start with /');
  c = await post({ adf: '1', adp: '/a|b', add: today });
  ok(!c.length, 'pipe in path rejected');
  c = await post({ adr: 'x', adp: '/gematria', add: daysAgo(2) });
  ok(!c.length, 'non-numeric return count rejected');

  // ---- server reads: api/ads-returns.js
  global.fetch = async (_url, opts) => {
    const cmds = JSON.parse(opts.body);
    const data = {
      [`ads:arr:${today}`]: ['mes.fm|/gematria', '4'],
      [`ads:arr:${daysAgo(10)}`]: ['mes.fm|/gematria', '6', 'mes.fm|/birthday', '10'],
      [`ads:ret1:${daysAgo(10)}`]: ['mes.fm|/gematria', '3', 'mes.fm|/birthday', '1'],
      [`ads:ret5:${daysAgo(10)}`]: ['mes.fm|/gematria', '1'],
      [`ads:retdays:${daysAgo(10)}`]: ['mes.fm|/gematria', '9', 'mes.fm|/birthday', '1'],
    };
    return { ok: true, json: async () => cmds.map((cm) => ({ result: data[cm[1]] || [] })) };
  };
  const reader = require(path.join(ROOT, 'api/ads-returns.js'));
  const r = res();
  await reader({ query: { range: '30d' } }, r);
  const g = r.body.rows.find((x) => x.path === '/gematria');
  ok(r.code === 200 && g.arrivals === 10 && g.returned === 3 && g.loyal === 1 && g.returnDays === 9, 'cohort summed per page');
  ok(r.body.rows[0].path === '/gematria' || r.body.rows[0].arrivals >= r.body.rows[1].arrivals, 'sorted by arrivals');
  ok(r.body.totals.arrivals === 20 && r.body.totals.returned === 4, 'totals');
  ok(r.body.recentArrivals === 4, 'arrivals in the last 7 days flagged');
  const r7 = res();
  await reader({ query: { range: '7d' } }, r7);
  ok(r7.body.totals.arrivals === 4, '7-day range only reads 7 arrival days');
  const rBad = res();
  await reader({ query: { range: 'all' } }, rBad);
  ok(rBad.body.range === '30d', 'unknown range falls back to 30d');

  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
