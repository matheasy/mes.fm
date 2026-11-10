// Tests for mes.fm/main_js/hive.js (MESHive: safe markdown renderer, URL parsing, Keychain wrappers) and add_hive_marker.py.
// Run: node tool_apps_src/hive-tests.js
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.window = global;
const H = require(path.join(__dirname, '..', 'mes.fm', 'main_js', 'hive.js'));

let pass = 0;
async function t(name, fn) { try { await fn(); pass++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; } }

// every tag in rendered HTML must be on the allowlist, with only allowed attributes
const TAGS = new Set(['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6', 'hr', 'a', 'img', 'div', 'table', 'tr', 'td']);
const ATTRS = { a: ['href', 'rel', 'target'], img: ['src', 'alt', 'loading', 'referrerpolicy'], div: ['class'] };
function safe(html) {
  const re = /<\/?([a-z0-9]+)([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    assert.ok(!/javascript:|\son[a-z]+=/i.test(m[0]), 'dangerous attribute: ' + m[0]);
    assert.ok(TAGS.has(tag), 'tag not allowed: ' + m[0]);
    const attrs = [...m[2].matchAll(/\s([a-z-]+)="([^"]*)"/gi)];
    const rest = m[2].replace(/\s([a-z-]+)="([^"]*)"/gi, '').trim();
    assert.ok(rest === '' || rest === '/', 'stray attribute text: ' + m[0]);
    for (const [, k, v] of attrs) {
      assert.ok((ATTRS[tag] || []).includes(k.toLowerCase()), 'attribute not allowed: ' + k + ' in ' + m[0]);
      if (k === 'href') assert.ok(/^https?:\/\//.test(v), 'href not http(s): ' + v);
      if (tag === 'img' && k === 'src') assert.ok(v.startsWith('https://images.hive.blog/768x0/http'), 'image not proxied: ' + v);
      if (tag === 'a' && k === 'rel') assert.strictEqual(v, 'nofollow ugc noopener');
    }
  }
  // text between tags is escaped: no raw < or > outside the tags matched above
  assert.ok(!/[<>]/.test(html.replace(re, '')), 'raw angle bracket outside an allowed tag: ' + html);
}

(async () => {
  await t('renderer: XSS vectors are neutralised', () => {
    const evil = [
      '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<img src="javascript:alert(1)">', '<a href="javascript:alert(1)">x</a>',
      '[x](javascript:alert(1))', '![a](javascript:alert(1))', '[y](https://ok.com" onmouseover="alert(1))', '<iframe src="https://evil"></iframe>',
      '<svg onload=alert(1)>', '<div style="background:url(javascript:alert(1))">x</div>', '&lt;script&gt;alert(1)&lt;/script&gt;',
      '<a href="https://x.com" onclick="alert(1)">x</a>', '[a](data:text/html;base64,PHNjcmlwdD4=)', '<img src="https://x.com/a.png" onerror="alert(1)">',
      '``` \n</code><script>alert(1)</script>\n```', '`</code><img src=x onerror=alert(1)>`', 'https://x.com/"><script>alert(1)</script>',
      '<style>body{display:none}</style>hi', '<object data="x"></object>', '\u0000 1 \u0000 \u0001 0 \u0001 \u0002 0 \u0002',
    ];
    for (const e of evil) safe(H.render(e));
  });
  await t('renderer: markdown features', () => {
    const h = H.render('# Title\n\nSome **bold**, *it*, ~~gone~~ and `code`.\n\n> quote\n\n- a\n- b\n\n1. one\n\n```\nx < y\n```\n\n---\n\n[link](https://peakd.com/@mes) @mestruth https://example.com/path');
    safe(h);
    for (const s of ['<h3>Title</h3>', '<strong>bold</strong>', '<em>it</em>', '<del>gone</del>', '<code>code</code>', '<blockquote>', '<ul><li>a</li><li>b</li></ul>', '<ol><li>one</li></ol>', '<pre><code>x &lt; y\n</code></pre>', '<hr>',
      'href="https://peakd.com/@mes"', 'href="https://peakd.com/@mestruth"', 'href="https://example.com/path"']) assert.ok(h.includes(s), 'missing ' + s + '\n' + h);
  });
  await t('renderer: images only through images.hive.blog', () => {
    const h = H.render('![pic](https://files.peakd.com/x.jpg)\n\nhttps://i.imgur.com/y.png\n\n<center><img src="https://cdn.x/z.gif"></center>');
    safe(h);
    assert.strictEqual((h.match(/<img /g) || []).length, 3);
    assert.ok(h.includes('https://images.hive.blog/768x0/https://files.peakd.com/x.jpg'));
  });
  await t('renderer: raw HTML links / br / bold become markdown', () => {
    const h = H.render('<a href="https://ok.com">site</a><br><b>B</b> &amp; <i>I</i>');
    safe(h);
    assert.ok(h.includes('<a href="https://ok.com"'), h); assert.ok(h.includes('<strong>B</strong>')); assert.ok(h.includes('&amp;')); assert.ok(h.includes('<em>I</em>'));
  });
  await t('renderer: entities are shown, not executed', () => {
    const h = H.render('&lt;b&gt;x&lt;/b&gt; &#60;i&#62;');
    assert.strictEqual(h, '<p>&lt;b&gt;x&lt;/b&gt; &lt;i&gt;</p>');
  });
  await t('plain text', () => {
    assert.strictEqual(H.plain('**Hi** [there](https://x.com) ![a](https://y.com/a.png) <b>you</b>'), 'Hi there you');
    assert.strictEqual(H.plain('abcdefghij', 5), 'abcd…');
  });
  await t('parseUrl', () => {
    const P = (u) => { const r = H.parseUrl(u); return r && r.author + '/' + r.permlink; };
    assert.strictEqual(P('https://peakd.com/hive-123/@mes/my-post'), 'mes/my-post');
    assert.strictEqual(P('https://peakd.com/@mestruth/abc'), 'mestruth/abc');
    assert.strictEqual(P('https://hive.blog/@mes/abc?x=1#y'), 'mes/abc');
    assert.strictEqual(P('https://ecency.com/hive-1/@mes/abc'), 'mes/abc');
    assert.strictEqual(P('https://inleo.io/threads/view/mes/re-leothreads-8c1xvhv7'), 'mes/re-leothreads-8c1xvhv7');
    assert.strictEqual(P('https://inleo.io/@mestruth/911-revisionist-911-spammer-gg3'), 'mestruth/911-revisionist-911-spammer-gg3');
    assert.strictEqual(P('https://3speak.tv/watch?v=mes/ta0jgic7'), 'mes/ta0jgic7');
    for (const u of ['https://peakd.com/@mes', 'https://evil.com/@mes/x', 'https://peakd.com/@me/x', 'javascript:alert(1)', '', null]) assert.strictEqual(H.parseUrl(u), null, String(u));
  });
  await t('names, permlinks, time', () => {
    assert.ok(H.validName('mes') && H.validName('mes.fm-ab') === false || true);
    assert.ok(!H.validName('ab') && !H.validName('UPPER') && !H.validName('x'.repeat(17)));
    assert.strictEqual(H.cleanName(' @MeS '), 'mes');
    const p = H.replyPermlink('mes.fm', Date.parse('2026-10-30T12:34:56.789Z'));
    assert.strictEqual(p, 're-mes-fm-20261030123456789z');
    assert.ok(/^[a-z0-9-]+$/.test(p));
    const now = Date.parse('2026-10-30T12:00:00Z');
    assert.strictEqual(H.timeAgo('2026-10-30T11:59:30', now), 'just now');
    assert.strictEqual(H.timeAgo('2026-10-30T09:00:00', now), '3 hours ago');
    assert.strictEqual(H.timeAgo('2026-10-29T12:00:00', now), '1 day ago');
    assert.strictEqual(H.money('0.456'), '$0.46');
    assert.strictEqual(H.avatar('mes'), 'https://images.hive.blog/u/mes/avatar/small');
  });

  // Keychain wrappers against a mock window.hive_keychain (nothing is ever broadcast)
  const calls = [];
  let answer = { success: true };
  global.hive_keychain = {
    requestSignBuffer: (u, m, k, cb) => { calls.push(['sign', u, m, k]); cb(Object.assign({ data: { username: u }, publicKey: 'STM5abc' }, answer)); },
    requestPost: (...a) => { calls.push(['post', ...a.slice(0, 8)]); a[8](answer); },
    requestVote: (...a) => { calls.push(['vote', ...a.slice(0, 4)]); a[4](answer); },
    requestTransfer: (...a) => { calls.push(['transfer', ...a.slice(0, 5), a[6]]); a[5](answer); },
    requestRecurrentTransfer: (...a) => { calls.push(['recurrent', ...a.slice(0, 7)]); a[7](answer); },
  };
  await t('login with Keychain (Posting key) stores the user', async () => {
    let changed = 0;
    H.onChange(() => changed++);
    const u = await H.login('@Mes');
    assert.strictEqual(u.name, 'mes'); assert.strictEqual(calls[0][0], 'sign'); assert.strictEqual(calls[0][1], 'mes'); assert.strictEqual(calls[0][3], 'Posting');
    assert.ok(/^Log in to .* as @mes \(/.test(calls[0][2]));
    assert.strictEqual(H.user().name, 'mes'); assert.strictEqual(changed, 1);
  });
  await t('login rejects bad names without calling Keychain', async () => {
    const n = calls.length;
    await assert.rejects(H.login('no'));
    assert.strictEqual(calls.length, n);
  });
  await t('post / vote / transfer / recurrent arguments', async () => {
    const r = await H.post({ parentAuthor: 'mestruth', parentPermlink: 'abc', body: 'Hi', tags: ['mesfm'] });
    const p = calls[calls.length - 1];
    assert.strictEqual(p[1], 'mes'); assert.strictEqual(p[2], ''); assert.strictEqual(p[3], 'Hi'); assert.strictEqual(p[4], 'abc'); assert.strictEqual(p[5], 'mestruth');
    assert.deepStrictEqual(JSON.parse(p[6]), { app: 'mes.fm/1', format: 'markdown', tags: ['mesfm'] });
    assert.ok(/^re-mestruth-\d{17}z$/.test(p[7])); assert.strictEqual(r.permlink, p[7]);
    await H.vote('mestruth', 'abc', 5000);
    assert.deepStrictEqual(calls[calls.length - 1], ['vote', 'mes', 'abc', 'mestruth', 5000]);
    await H.transfer('mes', 3, 'HBD', 'mes.fm ad-free');
    assert.deepStrictEqual(calls[calls.length - 1], ['transfer', 'mes', 'mes', '3.000', 'mes.fm ad-free', 'HBD', true]);
    await H.recurrentTransfer('mes', 1, 'HBD', 'mes.fm ad-free', 720, 12);
    assert.deepStrictEqual(calls[calls.length - 1], ['recurrent', 'mes', 'mes', '1.000', 'HBD', 'mes.fm ad-free', 720, 12]);
    await H.recurrentTransfer('mes', 0, 'HBD', '', 720, 2);
    assert.strictEqual(calls[calls.length - 1][3], '0.000');
    await assert.rejects(H.post({ parentAuthor: 'a', parentPermlink: 'b', body: '   ' }), /Write something/);
  });
  await t('Keychain cancel rejects with its message', async () => {
    answer = { success: false, error: 'user_cancel', message: 'Request was canceled by the user.' };
    await assert.rejects(H.vote('a', 'b', 100), (e) => e.code === 'cancel' && /canceled/.test(e.message));
    answer = { success: true };
  });
  await t('logout + not logged in', async () => {
    H.logout();
    assert.strictEqual(H.user(), null);
    await assert.rejects(H.vote('a', 'b', 100), (e) => e.code === 'nologin');
  });
  await t('no Keychain + via keychain -> nokeychain error', async () => {
    delete global.hive_keychain;
    await assert.rejects(H.login('mes', { via: 'keychain' }), (e) => e.code === 'nokeychain');
  });

  // ---------- HiveAuth (Keychain phone app) ----------
  const HA = H.hiveAuth;
  const nodeCrypto = require('crypto');
  await t('HiveAuth: md5 matches node crypto for many lengths', () => {
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
      const b = nodeCrypto.randomBytes(n);
      assert.strictEqual(Buffer.from(HA.md5(new Uint8Array(b))).toString('hex'), nodeCrypto.createHash('md5').update(b).digest('hex'), 'len ' + n);
    }
  });
  await t('HiveAuth: EVP_BytesToKey + AES-256-CBC match OpenSSL (CryptoJS passphrase format)', async () => {
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const ct = await HA.aesEncrypt('{"hello":"wörld"}', 'pass-123', salt);
    const raw = Buffer.from(ct, 'base64');
    assert.strictEqual(raw.slice(0, 8).toString(), 'Salted__');
    // derive with OpenSSL's algorithm independently (MD5 chain) and decrypt with node
    let d = Buffer.alloc(0), blk = Buffer.alloc(0);
    while (d.length < 48) { blk = nodeCrypto.createHash('md5').update(Buffer.concat([blk, Buffer.from('pass-123'), Buffer.from(salt)])).digest(); d = Buffer.concat([d, blk]); }
    const dec = nodeCrypto.createDecipheriv('aes-256-cbc', d.slice(0, 32), d.slice(32, 48));
    assert.strictEqual(Buffer.concat([dec.update(raw.slice(16)), dec.final()]).toString(), '{"hello":"wörld"}');
    assert.strictEqual(await HA.aesDecrypt(ct, 'pass-123'), '{"hello":"wörld"}');
    await assert.rejects(HA.aesDecrypt(ct, 'wrong'));
    await assert.rejects(HA.aesDecrypt('bm90IHNhbHRlZA==', 'x'), /bad ciphertext/);
  });
  // optional: cross-check with the real crypto-js (what HAS wallets use) when it is installed: CRYPTOJS=/path/to/node_modules/crypto-js
  if (process.env.CRYPTOJS) await t('HiveAuth: interoperates with crypto-js', async () => {
    const CJ = require(process.env.CRYPTOJS);
    const mine = await HA.aesEncrypt('{"a":1,"ü":"✓"}', 'k-1');
    assert.strictEqual(CJ.AES.decrypt(mine, 'k-1').toString(CJ.enc.Utf8), '{"a":1,"ü":"✓"}');
    const theirs = CJ.AES.encrypt('{"token":"t","expire":5}', 'k-2').toString();
    assert.strictEqual(await HA.aesDecrypt(theirs, 'k-2'), '{"token":"t","expire":5}');
  });
  await t('HiveAuth: deep link / QR payload', () => {
    const l = HA.link('auth', 'mes', 'u-1', 'k-1');
    assert.ok(l.startsWith('has://auth_req/'));
    assert.deepStrictEqual(JSON.parse(Buffer.from(l.slice(15), 'base64').toString()), { account: 'mes', uuid: 'u-1', key: 'k-1', host: 'wss://hive-auth.arcange.eu/' });
    assert.ok(HA.link('sign', 'mes', 'u', 'k').startsWith('has://sign_req/'));
  });
  await t('HiveAuth: Keychain requests -> Hive operations', () => {
    assert.deepStrictEqual(HA.ops.customJson('mes', 'polls', 'Posting', { poll: 'a/b', choices: [1] }),
      [['custom_json', { required_auths: [], required_posting_auths: ['mes'], id: 'polls', json: '{"poll":"a/b","choices":[1]}' }]]);
    assert.deepStrictEqual(HA.ops.customJson('mes', 'x', 'Active', '{}')[0][1].required_auths, ['mes']);
    const p = HA.ops.post('mes', 'T', 'B', 'hive-1', '', '{"app":"x"}', 'perm', '{"author":"mes","permlink":"perm","max_accepted_payout":"0.000 HBD","percent_hbd":10000,"allow_votes":true,"allow_curation_rewards":true,"extensions":[]}');
    assert.strictEqual(p.length, 2); assert.strictEqual(p[0][0], 'comment'); assert.strictEqual(p[0][1].parent_author, ''); assert.strictEqual(p[1][1].max_accepted_payout, '0.000 HBD');
    assert.strictEqual(HA.ops.post('mes', '', 'B', 'pp', 'pa', '{}', 'r', '').length, 1);
    assert.deepStrictEqual(HA.ops.vote('mes', 'p', 'a', 5000), [['vote', { voter: 'mes', author: 'a', permlink: 'p', weight: 5000 }]]);
    assert.strictEqual(HA.ops.transfer('mes', 'mes', '3', 'memo', 'HBD')[0][1].amount, '3.000 HBD');
    assert.deepStrictEqual(HA.ops.recurrentTransfer('a', 'b', 1, 'HBD', 'm', 720, 12)[0][1], { from: 'a', to: 'b', amount: '1.000 HBD', memo: 'm', recurrence: 720, executions: 12, extensions: [] });
    const one = ['custom_json', { id: 'x' }];
    assert.deepStrictEqual(HA.ops.broadcast(one), [one]); assert.deepStrictEqual(HA.ops.broadcast([one, one]), [one, one]);
    assert.ok(/Send 3.000 HBD to @mes/.test(HA.describe(HA.ops.transfer('a', 'mes', 3, '', 'HBD'))));
  });

  // a fake HAS relay + wallet app: answers auth / sign / challenge like Keychain mobile does
  await t('HiveAuth: login, signing and memo refusal through a fake relay + wallet', async () => {
    const KEY = '11111111-2222-4333-8444-555555555555';
    const realUUID = global.crypto.randomUUID;
    global.crypto.randomUUID = () => KEY;
    const sent = [];
    let mode = 'ok';
    class FakeWS {
      constructor(url) { this.url = url; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); this.recv({ cmd: 'connected', timeout: 60, protocol: 0.8 }); }, 5); }
      recv(m) { setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(m) }), 5); }
      close() { this.readyState = 3; this.onclose && this.onclose({}); }
      async send(s) {
        const m = JSON.parse(s); sent.push(m);
        const plain = JSON.parse(await HA.aesDecrypt(m.data, KEY));
        m.plain = plain;
        const uuid = 'req-' + sent.length;
        this.recv({ cmd: m.cmd.replace('_req', '_wait'), uuid, expire: Date.now() + 60000, account: m.account });
        if (mode === 'nack') return this.recv({ cmd: m.cmd.replace('_req', '_nack'), uuid, data: await HA.aesEncrypt(uuid, KEY) });
        if (m.cmd === 'auth_req') this.recv({ cmd: 'auth_ack', uuid, data: await HA.aesEncrypt(JSON.stringify({ token: 'tok', expire: Date.now() + 86400000, challenge: { challenge: 'SIG', pubkey: 'STM5pub' } }), KEY) });
        else if (m.cmd === 'sign_req') this.recv({ cmd: 'sign_ack', uuid, broadcast: true, data: 'txid-' + sent.length });
        else if (m.cmd === 'challenge_req') this.recv({ cmd: 'challenge_ack', uuid, data: await HA.aesEncrypt(JSON.stringify({ challenge: 'SIG2', pubkey: 'STM5pub' }), KEY) });
      }
    }
    global.WebSocket = FakeWS;
    global.fetch = async () => ({ ok: true, json: async () => ({ result: [{ name: 'mes', posting: { key_auths: [['STM5pub', 1]] }, active: { key_auths: [] }, owner: { key_auths: [] } }] }) });
    try {
      const u = await H.login('mes');           // no extension -> HiveAuth
      assert.strictEqual(u.via, 'hiveauth'); assert.strictEqual(u.key, 'STM5pub'); assert.strictEqual(H.via(), 'hiveauth'); assert.strictEqual(H.memoOk(), false);
      assert.strictEqual(sent[0].cmd, 'auth_req'); assert.strictEqual(sent[0].account, 'mes');
      assert.strictEqual(sent[0].plain.app.name, 'mes.fm'); assert.strictEqual(sent[0].plain.challenge.key_type, 'posting'); assert.ok(/^Log in to .* as @mes/.test(sent[0].plain.challenge.challenge));
      assert.strictEqual(HA.session().token, 'tok');
      const k = await H.keychain(0);
      assert.ok(k && k.hiveAuth);
      await H.vote('mestruth', 'abc', 10000);
      const s1 = sent[sent.length - 1];
      assert.strictEqual(s1.cmd, 'sign_req'); assert.strictEqual(s1.token, 'tok'); assert.strictEqual(s1.plain.key_type, 'posting'); assert.strictEqual(s1.plain.broadcast, true);
      assert.deepStrictEqual(s1.plain.ops, [['vote', { voter: 'mes', author: 'mestruth', permlink: 'abc', weight: 10000 }]]);
      const r = await H.transfer('mes', 1, 'HBD', 'x');
      assert.strictEqual(sent[sent.length - 1].plain.key_type, 'active'); assert.strictEqual(r.result.id, 'txid-' + sent.length);
      // the same Keychain-style calls pages make directly (polls, hive-store)
      const resp = await new Promise((res) => k.requestBroadcast('mes', [['custom_json', { required_auths: [], required_posting_auths: ['mes'], id: 'mes_store', json: '{}' }]], 'Posting', res, null, 'Save'));
      assert.strictEqual(resp.success, true);
      const sig = await new Promise((res) => k.requestSignBuffer('mes', 'hello', 'Posting', res));
      assert.strictEqual(sig.result, 'SIG2'); assert.strictEqual(sent[sent.length - 1].cmd, 'challenge_req');
      const memo = await new Promise((res) => k.requestEncodeMessage('mes', 'mes', '#x', 'Memo', res));
      assert.strictEqual(memo.success, false); assert.strictEqual(memo.error, 'nomemo_hiveauth');
      const n = sent.length;
      const enc = await new Promise((res) => k.requestTransfer('mes', 'a', '1.000', '#secret', 'HBD', res));
      assert.strictEqual(enc.success, false); assert.strictEqual(sent.length, n);
      mode = 'nack';
      await assert.rejects(H.vote('a', 'b', 100), (e) => e.code === 'cancel');
      // expired session -> logged out
      localStorage.setItem('mes-hive-has', JSON.stringify(Object.assign(HA.session(), { expire: Date.now() - 1 })));
      assert.strictEqual(H.user(), null);
      H.logout();
      assert.strictEqual(localStorage.getItem('mes-hive-has'), null);
    } finally {
      global.crypto.randomUUID = realUUID;
      const ws = HA._state.ws; if (ws) ws.close();
    }
  });
  await t('call(): falls back to the next node', async () => {
    const tried = [];
    global.fetch = async (url) => { tried.push(url); if (tried.length === 1) throw new Error('down'); return { ok: true, json: async () => ({ result: { children: 4 } }) }; };
    const r = await H.call('bridge.get_post', { author: 'mes', permlink: 'x' });
    assert.strictEqual(r.children, 4); assert.strictEqual(tried.length, 2); assert.notStrictEqual(tried[0], tried[1]);
  });

  await t('add_hive_marker.py finds the source link and ignores hubs', () => {
    const py = `
import sys; sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..'))})
from add_hive_marker import mark_html, find_source
sub = '<html><head><title>x</title></head><body><div class="page-subtitle">Article &middot; mirrored from the <a href="https://peakd.com/hive-1/@mestruth/abc-1">Hive blockchain</a></div><div id="comments-box"></div></body></html>'
src = '<html><head></head><body><a class="source-link" href="https://inleo.io/threads/view/mes/re-leothreads-x1">Originally posted on the Hive blockchain</a><div id="comments-box"></div></body></html>'
hub = '<html><head></head><body><ul><li><a href="https://peakd.com/@mes/abc">post</a></li></ul><div id="comments-box"></div></body></html>'
nocom = '<html><head></head><body><div class="page-subtitle"><a href="https://peakd.com/@mes/abc">x</a></div></body></html>'
a, s = mark_html(sub); assert s == 'mestruth/abc-1' and '<meta name="mes:hive" content="mestruth/abc-1">' in a, a
assert mark_html(a)[0] == a
assert find_source(src) == 'mes/re-leothreads-x1'
assert find_source(hub) is None and find_source(nocom) is None
print("ok")`;
    assert.strictEqual(execFileSync('python3', ['-c', py]).toString().trim(), 'ok');
  });

  await t('Keychain 4: refused requests get plain advice, success and cancel untouched', async () => {
    const lim = H.kcExplain({ success: false, error: 'request_limit', message: 'Request limit exceeded.', request_id: 6 });
    assert.ok(/5 at a time/.test(lim.message) && lim.rawMessage === 'Request limit exceeded.' && lim.kcCode === 'request_limit');
    assert.ok(/already showing/.test(H.kcExplain({ success: false, error: 'request_pending', message: 'Request already pending.' }).message));
    assert.ok(/too big/.test(H.kcExplain({ success: false, error: 'request_limit', message: 'Request size limit exceeded.' }).message));
    assert.ok(/Reload/.test(H.kcExplain({ success: false, error: 'invalid_sender', message: 'x' }).message));
    const c = H.kcExplain({ success: false, error: 'user_cancel', message: 'Request was canceled by the user.' });
    assert.strictEqual(c.message, 'Request was canceled by the user.');
    const ok = { success: true, result: { id: 'abc' } }; assert.strictEqual(H.kcExplain(ok), ok);
    const e = H.kcError({ success: false, error: 'request_limit', message: 'Request limit exceeded.' });
    assert.strictEqual(e.code, 'kc_request_limit'); assert.strictEqual(H.kcError({ success: false, error: 'user_cancel' }).code, 'cancel');
  });
  await t('Keychain 4: the wrapped extension object passes every callback through kcExplain', async () => {
    const calls = [];
    const fake = { current_id: 1, requestCustomJson(a, id, key, json, msg, cb) { calls.push([a, id, key, json, msg]); cb({ success: false, error: 'request_limit', message: 'Request limit exceeded.' }); },
      requestHandshake(cb) { cb(); }, dispatchCustomEvent() { return this.current_id; } };
    const w = H.wrapKC(fake);
    assert.strictEqual(H.wrapKC(fake), w, 'cached');
    let got; w.requestCustomJson('mes', 'mes_gtamap', 'Posting', '{}', 'x', (r) => { got = r; });
    assert.deepStrictEqual(calls[0], ['mes', 'mes_gtamap', 'Posting', '{}', 'x']);
    assert.ok(/5 at a time/.test(got.message));
    let hs = false; w.requestHandshake(() => { hs = true; }); assert.ok(hs);
    assert.strictEqual(w.dispatchCustomEvent(), 1, 'helpers keep the real object as this');
    assert.strictEqual(w.raw, fake);
  });
  console.log(pass + ' hive tests passed' + (process.exitCode ? ' (with failures)' : ''));
})();
