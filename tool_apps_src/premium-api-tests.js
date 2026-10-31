// Tests for mes.fm/api/premium.js (ad-free status from the Hive chain) and the inline AdSense guard.
// Run: node tool_apps_src/premium-api-tests.js
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const P = require(path.join(__dirname, '..', 'mes.fm', 'api', 'premium.js'));

let pass = 0;
function t(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; }, (e) => { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }); }
const DAY = 864e5, NOW = Date.parse('2026-10-30T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
const tr = (i, from, to, amount, at, name = 'transfer', memo = 'mes.fm ad-free') => [i, { op: [name, { from, to, amount, memo }], timestamp: iso(at) }];

(async () => {
  await t('amounts', () => {
    assert.deepStrictEqual(P.parseAmount('1.000 HBD'), { n: 1, sym: 'HBD' });
    assert.deepStrictEqual(P.parseAmount('2.5 SBD'), { n: 2.5, sym: 'HBD' });
    assert.deepStrictEqual(P.parseAmount({ amount: '1000', precision: 3, nai: '@@000000013' }), { n: 1, sym: 'HBD' });
    assert.strictEqual(P.parseAmount('5.000 HIVE').sym, 'HIVE');
    assert.strictEqual(P.parseAmount('junk').n, 0);
  });
  await t('names', () => {
    for (const n of ['mes', 'mestruth', 'mes.fm-x', 'a-b.cde']) assert.ok(P.validName(n), n);
    for (const n of ['me', 'Mes', '1abc', 'abc-', 'a..bc', 'toolongusername123', 'ab.c', '']) assert.ok(!P.validName(n), n);
  });
  await t('no payments = ads', () => {
    const r = P.computeAdFree({ user: 'bob', history: [], recurrents: [], now: NOW });
    assert.strictEqual(r.adFree, false); assert.strictEqual(r.until, null); assert.strictEqual(r.how, null);
  });
  await t('one 1 HBD payment = 31 days', () => {
    const at = NOW - 10 * DAY;
    const r = P.computeAdFree({ user: 'bob', history: [tr(1, 'bob', 'mes', '1.000 HBD', at)], recurrents: [], now: NOW });
    assert.ok(r.adFree); assert.strictEqual(r.how, 'payment'); assert.strictEqual(r.months, 1);
    assert.strictEqual(r.untilMs, Date.parse(iso(at) + 'Z') + 31 * DAY);
  });
  await t('expired payment', () => {
    const r = P.computeAdFree({ user: 'bob', history: [tr(1, 'bob', 'mes', '1.000 HBD', NOW - 40 * DAY)], recurrents: [], now: NOW });
    assert.strictEqual(r.adFree, false); assert.ok(r.untilMs > 0 && r.untilMs < NOW);
  });
  await t('ignored: HIVE, under 1 HBD, other target, other sender, future', () => {
    const h = [tr(1, 'bob', 'mes', '5.000 HIVE', NOW - DAY), tr(2, 'bob', 'mes', '0.999 HBD', NOW - DAY), tr(3, 'bob', 'peakd', '9.000 HBD', NOW - DAY),
      tr(4, 'eve', 'mes', '9.000 HBD', NOW - DAY), tr(5, 'bob', 'mes', '9.000 HBD', NOW + 30 * DAY)];
    assert.strictEqual(P.computeAdFree({ user: 'bob', history: h, recurrents: [], now: NOW }).adFree, false);
  });
  await t('stacking: 3 HBD = 3 months, a second payment extends', () => {
    const a = NOW - 50 * DAY, b = NOW - 40 * DAY;
    const r = P.computeAdFree({ user: 'bob', history: [tr(2, 'bob', 'mes', '1.000 HBD', b), tr(1, 'bob', 'mes', '3.000 HBD', a)], recurrents: [], now: NOW });
    assert.strictEqual(r.months, 4);
    assert.strictEqual(r.untilMs, Date.parse(iso(a) + 'Z') + 4 * 31 * DAY);
  });
  await t('recurrent fills count like payments', () => {
    const r = P.computeAdFree({ user: 'bob', history: [tr(1, 'bob', 'mes', '1.000 HBD', NOW - 5 * DAY, 'fill_recurrent_transfer')], recurrents: [], now: NOW });
    assert.ok(r.adFree); assert.strictEqual(r.how, 'subscription');
  });
  await t('active subscription covers its next execution + grace', () => {
    const rec = [{ from: 'bob', to: 'mes', amount: '1.000 HBD', recurrence: 720, remaining_executions: 10, consecutive_failures: 0, trigger_date: iso(NOW + 2 * DAY) }];
    const r = P.computeAdFree({ user: 'bob', history: [], recurrents: rec, now: NOW });
    assert.ok(r.adFree); assert.strictEqual(r.how, 'subscription'); assert.ok(r.subscription.counts);
    assert.strictEqual(r.untilMs, Date.parse(iso(NOW + 2 * DAY) + 'Z') + 3 * DAY);
  });
  await t('subscription that does not count: failing, too rare, too small, other target', () => {
    const base = { from: 'bob', to: 'mes', amount: '1.000 HBD', recurrence: 720, remaining_executions: 10, consecutive_failures: 0, trigger_date: iso(NOW + 2 * DAY) };
    for (const bad of [{ consecutive_failures: 2 }, { recurrence: 8760 }, { amount: '0.100 HBD' }, { to: 'peakd' }, { remaining_executions: 0 }, { amount: '1.000 HIVE' }]) {
      const r = P.computeAdFree({ user: 'bob', history: [], recurrents: [Object.assign({}, base, bad)], now: NOW });
      assert.strictEqual(r.adFree, false, JSON.stringify(bad));
    }
    const ok = P.computeAdFree({ user: 'bob', history: [], recurrents: [Object.assign({}, base, { amount: '2.000 HBD', recurrence: 1440 })], now: NOW });
    assert.ok(ok.adFree, '2 HBD every 60 days counts');
  });

  // the handler, with a fake fetch standing in for the Hive nodes
  const realFetch = global.fetch;
  function fakeNodes(answers, fail = 0) {
    let n = 0;
    const calls = [];
    global.fetch = async (url, opt) => {
      const body = JSON.parse(opt.body);
      calls.push({ url, method: body.method, params: body.params });
      if (n++ < fail) throw new Error('down');
      const res = answers[body.method];
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: typeof res === 'function' ? res(body.params) : res }) };
    };
    return calls;
  }
  function run(q) {
    return new Promise((resolve) => {
      const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, body: j, headers: this.headers }); } };
      P({ query: q }, res);
    });
  }
  await t('handler: bad name -> 400 no-store, no fetch', async () => {
    const calls = fakeNodes({});
    const r = await run({ u: '<script>' });
    assert.strictEqual(r.code, 400); assert.strictEqual(r.headers['Cache-Control'], 'no-store'); assert.strictEqual(calls.length, 0);
  });
  await t('handler: paid user -> adFree, cached, filtered history query', async () => {
    const calls = fakeNodes({
      'condenser_api.get_account_history': [tr(7, 'bob', 'mes', '1.000 HBD', Date.now() - DAY)],
      'condenser_api.find_recurrent_transfers': [],
    });
    const r = await run({ u: '@Bob' });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.user, 'bob'); assert.ok(r.body.adFree);
    assert.ok(/s-maxage=60/.test(r.headers['Cache-Control']));
    const h = calls.find((c) => c.method === 'condenser_api.get_account_history');
    assert.deepStrictEqual(h.params, ['bob', -1, 1000, P.FILTER_LOW, P.FILTER_HIGH]);
    assert.strictEqual(P.FILTER_LOW, 2 ** 2 + 2 ** 49); assert.strictEqual(P.FILTER_HIGH, 2 ** 19);
  });
  await t('handler: first node down -> next node', async () => {
    const calls = fakeNodes({ 'condenser_api.get_account_history': [], 'condenser_api.find_recurrent_transfers': [] }, 1);
    const r = await run({ u: 'bob' });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.adFree, false);
    assert.ok(new Set(calls.map((c) => c.url)).size >= 2);
  });
  await t('handler: every node down -> 502 no-store', async () => {
    global.fetch = async () => { throw new Error('down'); };
    const r = await run({ u: 'bob' });
    assert.strictEqual(r.code, 502); assert.strictEqual(r.headers['Cache-Control'], 'no-store');
  });
  await t('history paging stops at 400 days and at short pages', async () => {
    const old = Date.now() - 500 * DAY;
    let pages = 0;
    fakeNodes({
      'condenser_api.get_account_history': (p) => { pages++; const s = p[1] === -1 ? 5000 : p[1]; return Array.from({ length: p[2] }, (_, i) => tr(s - p[2] + 1 + i, 'x', 'y', '1.000 HBD', old)); },
      'condenser_api.find_recurrent_transfers': [],
    });
    await P.status('bob');
    assert.strictEqual(pages, 1, 'old full page -> no second page');
  });
  global.fetch = realFetch;

  // the inline guard that add_adfree_guard.py puts into every AdSense loader
  await t('inline guard skips AdSense only while paid and not switched off', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'tool_page_template.html'), 'utf8');
    const m = src.match(/<script>\s*(\(function \(\) \{\n\s*\/\* MES-ADFREE[\s\S]*?\}\)\(\);)\s*<\/script>/);
    assert.ok(m, 'guarded loader found in tool_page_template.html');
    function sim(stored) {
      const added = [], classes = [], timers = [];
      const ctx = {
        localStorage: { getItem: () => stored }, Date,
        document: { createElement: () => ({}), head: { appendChild: (s) => added.push(s) }, documentElement: { classList: { add: (c) => classes.push(c) } } },
        addEventListener() {}, removeEventListener() {}, setTimeout: (f) => timers.push(f),
      };
      new Function(...Object.keys(ctx), m[1])(...Object.values(ctx));
      timers.forEach((f) => f());
      return { loaded: added.length > 0, adfree: classes.includes('mes-adfree') };
    }
    assert.deepStrictEqual(sim(null), { loaded: true, adfree: false });
    assert.deepStrictEqual(sim(JSON.stringify({ user: 'bob', until: Date.now() + DAY })), { loaded: false, adfree: true });
    assert.deepStrictEqual(sim(JSON.stringify({ user: 'bob', until: Date.now() - DAY })), { loaded: true, adfree: false });
    assert.deepStrictEqual(sim(JSON.stringify({ user: 'bob', until: Date.now() + DAY, off: true })), { loaded: true, adfree: false });
    assert.deepStrictEqual(sim('{broken'), { loaded: true, adfree: false });
  });

  console.log(pass + ' premium tests passed' + (process.exitCode ? ' (with failures)' : ''));
})();
