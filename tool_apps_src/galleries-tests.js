// node tool_apps_src/galleries-tests.js : MES Galleries core (MESGal.handle on fake stores), crypto, R2 presign, copy check.
const assert = require('assert'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = require('./galleries/lib.js');
let n = 0; const t = (c, m) => { assert.ok(c, m); n++; };
const libA = fs.readFileSync(path.join(__dirname, 'galleries/lib.js'), 'utf8');
const libB = fs.readFileSync(path.join(__dirname, '../mes.fm/api/_galleries-lib.js'), 'utf8');
t(libA === libB, 'mes.fm/api/_galleries-lib.js must be a byte-identical copy (cp)');

function fakeCtx(owner) {
  const store = new Map(), mails = [];
  return {
    store, mails, owner, ip: '1.2.3.4', base: 'https://mes.fm', now: () => 1.8e12,
    sha: (s) => crypto.createHash('sha256').update(String(s)).digest('hex'),
    rand: (k) => crypto.randomBytes(k).toString('hex'),
    db: {
      async get(k) { return store.has(k) ? JSON.parse(store.get(k)) : null; },
      async set(k, v) { store.set(k, JSON.stringify(v)); }, async del(k) { store.delete(k); },
      async incr(k) { const v = (store.has(k) ? JSON.parse(store.get(k)) : 0) + 1; store.set(k, JSON.stringify(v)); return v; },
      async sadd(k, m) { const s = new Set(store.has(k) ? JSON.parse(store.get(k)) : []); s.add(m); store.set(k, JSON.stringify([...s])); },
      async srem(k, m) { const s = new Set(store.has(k) ? JSON.parse(store.get(k)) : []); s.delete(m); store.set(k, JSON.stringify([...s])); },
      async smembers(k) { return store.has(k) ? JSON.parse(store.get(k)) : []; },
    },
    blob: { deleted: [], async putUrl(p) { return 'put:' + p; }, async getUrl(p) { return 'get:' + p; }, async del(p) { this.deleted.push(p); } },
    mail: { async send(m) { mails.push(m); return { ok: true }; } },
  };
}

(async () => {
  // fields / fill
  t(G.fields('Hi {{Client Name}}, {{date}} {{date}}').join() === 'client_name,date', 'fields');
  t(G.fill('{{a}} {{b}}', { a: 'x' }) === 'x ____', 'fill');
  t(G.chunkCount(1) === 1 && G.chunkCount(G.CHUNK + 1) === 2, 'chunks');
  t(G.fitSize(4000, 2000, 2048).join() === '2048,1024', 'fit');
  t(G.validEmail('A@b.co') && !G.validEmail('nope') && !G.validEmail('a@b'), 'email');

  // crypto round trip
  const k = await G.importKey(await G.newKey()), plain = new Uint8Array([1, 2, 3, 250]);
  const enc = await G.encrypt(k, plain); t(enc.length === 12 + 4 + 16, 'iv + tag');
  t((await G.decrypt(k, enc)).join() === plain.join(), 'decrypt');
  enc[20] ^= 1; let bad = false; try { await G.decrypt(k, enc); } catch (e) { bad = true; } t(bad, 'tamper detected');

  // owner makes a gallery, client gets in with a code
  const o = fakeCtx(true), key = await G.newKey();
  t((await G.handle({ op: 'list' }, Object.assign(fakeCtx(false), { store: o.store }))).ok === false, 'public cannot list');
  let r = await G.handle({ op: 'save', gallery: { title: 'Smith', active: true, emails: ['Ann@Example.com', 'bad', 'ann@example.com'], dl: 'full', key } }, o);
  t(r.ok && r.gallery.emails.join() === 'ann@example.com', 'emails cleaned');
  const gid = r.gallery.id;
  r = await G.handle({ op: 'upload', gid, item: { id: 'abcdefghij', kind: 'vid', size: G.CHUNK * 2 + 5 } }, o);
  t(r.ok && r.urls.full.length === 3 && r.chunks === 3, 'video pieces');
  const g = (await G.handle({ op: 'list' }, o)).galleries[0];
  g.items = [{ id: 'abcdefghij', kind: 'vid', name: 'clip.mp4', size: G.CHUNK * 2 + 5, chunks: 3 }];
  await G.handle({ op: 'save', gallery: g }, o);

  const c = Object.assign(fakeCtx(false), {}); c.db = o.db; c.store = o.store; c.mails = o.mails; c.mail = o.mail;
  r = await G.handle({ op: 'code', gid, email: 'stranger@x.com' }, c); t(r.ok && o.mails.length === 0, 'unknown email: same answer, no mail');
  r = await G.handle({ op: 'code', gid, email: 'ANN@example.com' }, c); t(r.ok && o.mails.length === 1, 'code mailed');
  const code = o.mails[0].text.match(/\b\d{6}\b/)[0];
  r = await G.handle({ op: 'verify', gid, email: 'ann@example.com', code: '000000' === code ? '111111' : '000000' }, c); t(!r.ok, 'wrong code');
  r = await G.handle({ op: 'verify', gid, email: 'ann@example.com', code }, c); t(r.ok && /^[a-f0-9]{40}$/.test(r.token), 'token');
  const tok = r.token;
  r = await G.handle({ op: 'verify', gid, email: 'ann@example.com', code }, c); t(!r.ok, 'code works once');
  r = await G.handle({ op: 'open', token: tok }, c); t(r.ok && r.key === key && r.items.length === 1 && r.items[0].thumb.startsWith('get:'), 'open');
  r = await G.handle({ op: 'urls', token: tok, ids: ['abcdefghij'], want: 'full' }, c); t(r.urls.abcdefghij.length === 3, 'video urls');
  r = await G.handle({ op: 'fav', token: tok, favs: ['abcdefghij', 'BAD!'] }, c); t(r.n === 1, 'fav');
  r = await G.handle({ op: 'stats', gid }, o); t(r.views['ann@example.com'].n === 1 && r.favs['ann@example.com'].length === 1, 'stats');

  // inactive / expired / removed email close it
  g.active = false; await G.handle({ op: 'save', gallery: g }, o);
  r = await G.handle({ op: 'open', token: tok }, c); t(!r.ok && r.status === 403, 'inactive');
  g.active = true; g.expires = 1; await G.handle({ op: 'save', gallery: g }, o);
  r = await G.handle({ op: 'code', gid, email: 'ann@example.com' }, c); t(!r.ok, 'expired');
  g.expires = 0; g.emails = []; await G.handle({ op: 'save', gallery: g }, o);
  r = await G.handle({ op: 'open', token: tok }, c); t(!r.ok, 'email removed -> out');
  // removing an item deletes its files
  g.items = []; await G.handle({ op: 'save', gallery: g }, o); t(o.blob.deleted.length === 5, 'files deleted (thumb, web, 3 pieces)');

  // contracts
  await G.handle({ op: 'brand', name: 'AWC', email: 'karo@example.com' }, o);
  r = await G.handle({ op: 'csend', email: 'ann@example.com', title: 'Agreement', body: 'Has {{field}}' }, o); t(!r.ok, 'unfilled field refused');
  r = await G.handle({ op: 'csend', email: 'ann@example.com', title: 'Agreement', body: 'The fee is $500. Both parties agree.' }, o);
  t(r.ok && /c=[a-z0-9]{10}&t=[a-f0-9]{32}/.test(r.link), 'contract link');
  const [, cid, ct] = r.link.match(/c=([a-z0-9]+)&t=([a-f0-9]+)/);
  r = await G.handle({ op: 'contract', cid, t: 'x' + ct.slice(1) }, c); t(!r.ok, 'wrong token');
  r = await G.handle({ op: 'contract', cid, t: ct }, c); t(r.ok && r.contract.status === 'sent', 'client reads');
  const sig = 'data:image/png;base64,' + 'A'.repeat(200), h = r.contract.hash;
  t(!(await G.handle({ op: 'sign', cid, t: ct, name: 'Ann', sig, agree: false, hash: h }, c)).ok, 'must agree');
  t(!(await G.handle({ op: 'sign', cid, t: ct, name: 'Ann', sig, agree: true, hash: 'zz' }, c)).ok, 'text changed');
  const before = o.mails.length;
  r = await G.handle({ op: 'sign', cid, t: ct, name: 'Ann Smith', sig, agree: true, hash: h, ua: 'test' }, c);
  t(r.ok && r.contract.signed.name === 'Ann Smith' && r.contract.signed.ip.length === 16 && !/1\.2\.3\.4/.test(JSON.stringify(r.contract)), 'signed, ip hashed');
  t(o.mails.length === before + 2 && o.mails.some((m) => m.to === 'karo@example.com'), 'both emailed');
  t(!(await G.handle({ op: 'sign', cid, t: ct, name: 'Ann', sig, agree: true, hash: h }, c)).ok, 'signs once');

  // R2 presign shape
  Object.assign(process.env, { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'AKID', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'b' });
  const core = require('../mes.fm/api/_galleries-core.js');
  const u = new URL(core.presign('PUT', 'g/x/y/t', 60, Date.UTC(2026, 0, 2)));
  t(u.host === 'acc.r2.cloudflarestorage.com' && u.pathname === '/b/g/x/y/t' && /^[a-f0-9]{64}$/.test(u.searchParams.get('X-Amz-Signature')) && u.searchParams.get('X-Amz-Credential') === 'AKID/20260102/auto/s3/aws4_request', 'presign');
  console.log('galleries tests: ' + n + ' passed');
})().catch((e) => { console.error(e); process.exit(1); });
