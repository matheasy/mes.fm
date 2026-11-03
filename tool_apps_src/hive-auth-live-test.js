// Live check of the HiveAuth handshake in mes.fm/main_js/hive.js against the real relay wss://hive-auth.arcange.eu
// (needs the network; no wallet approves it, so it stops at auth_wait and cancels). Run: node tool_apps_src/hive-auth-live-test.js
const assert = require('assert');
const path = require('path');
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.window = global;
const H = require(path.join(__dirname, '..', 'mes.fm', 'main_js', 'hive.js'));
const HA = H.hiveAuth;
(async () => {
  const key = HA.uuid();
  let waited = null;
  const p = HA.request('auth', 'zz-mesfm-test', { app: { name: 'mes.fm test' }, challenge: { key_type: 'posting', challenge: 'live test', nonce: Date.now() } }, key, null, {});
  const t0 = Date.now();
  while (!waited && Date.now() - t0 < 15000) { await new Promise((r) => setTimeout(r, 100)); const c = HA._state.cur; if (c && c.uuid) waited = c; }
  assert.ok(waited, 'no auth_wait from the relay');
  assert.ok(/^[0-9a-f-]{36}$/.test(waited.uuid), 'uuid ' + waited.uuid);
  assert.ok(waited.expire > Date.now() + 30000, 'expire in the future (ms)');
  assert.ok(HA._state.timeout >= 30000, 'connected message gave the timeout');
  const payload = JSON.parse(Buffer.from(waited.link.replace('has://auth_req/', ''), 'base64').toString());
  assert.deepStrictEqual(payload, { account: 'zz-mesfm-test', uuid: waited.uuid, key, host: 'wss://hive-auth.arcange.eu/' });
  waited.fail(Object.assign(new Error('Cancelled.'), { code: 'cancel' }));
  await assert.rejects(p, (e) => e.code === 'cancel');
  console.log('HiveAuth relay OK: auth_wait uuid', waited.uuid, 'expires in', Math.round((waited.expire - Date.now()) / 1000), 's');
  HA._state.ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
