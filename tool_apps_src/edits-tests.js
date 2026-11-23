// Tests for MES Edits: node tool_apps_src/edits-tests.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('./edits/lib.js');
const api = require('../mes.fm/api/edits.js');
let n = 0;
const t = (name, fn) => { fn(); n++; };
const at = async (name, fn) => { await fn(); n++; };

t('copy of lib.js in api is identical', () => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, 'edits/lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../mes.fm/api/_edits-lib.js'), 'utf8'));
});

t('add / update / reply / delete', () => {
  const m = {};
  let r = E.apply(m, { op: 'add', k: 'app', t: '  New idea\r\nsecond line  ', star: 1 }, 1000);
  assert.strictEqual(r.status, 200);
  const it = r.body.item; m[it.id] = it;
  assert.strictEqual(it.t, 'New idea\nsecond line'); assert.strictEqual(it.k, 'app'); assert.strictEqual(it.star, true); assert.strictEqual(it.st, 'todo');
  assert.strictEqual(E.apply(m, { op: 'add', t: '   ' }).status, 400);
  assert.strictEqual(E.apply(m, { op: 'add', t: 'x', k: 'Bad Kind!' }).body.item.k, 'fix');
  assert.strictEqual(E.apply(m, { op: 'add', t: 'x', k: 'mirror' }).body.item.k, 'mirror');
  assert.strictEqual(E.apply(m, { op: 'add', t: 'x', k: 'ai-ideas' }).body.item.k, 'ai-ideas');
  r = E.apply(m, { op: 'update', id: it.id, st: 'done', note: 'Shipped in abc123' }, 2000);
  assert.strictEqual(r.body.item.st, 'done'); assert.strictEqual(r.body.item.d, 2000); assert.strictEqual(r.body.item.u, 2000); m[it.id] = r.body.item;
  r = E.apply(m, { op: 'update', id: it.id, st: 'todo' }, 3000); assert.strictEqual(r.body.item.d, 0);
  assert.strictEqual(E.apply(m, { op: 'update', id: it.id, st: 'nope' }).status, 400);
  assert.strictEqual(E.apply(m, { op: 'update', id: 'zzzzzzzz', st: 'done' }).status, 404);
  r = E.apply(m, { op: 'reply', id: it.id, t: 'Done, see /photo', by: 'claude' }, 4000);
  assert.deepStrictEqual(r.body.item.rs, [{ t: 'Done, see /photo', at: 4000, by: 'claude' }]);
  assert.strictEqual(E.apply(m, { op: 'reply', id: it.id, t: 'x', by: 'hacker' }).body.item.rs[0].by, 'me');
  assert.deepStrictEqual(E.apply(m, { op: 'delete', id: it.id }).del, [it.id]);
  assert.strictEqual(E.apply(m, { op: 'what' }).status, 400);
  assert.strictEqual(E.apply(m, { op: 'add', t: 'a'.repeat(9000) }).body.item.t.length, E.MAX_T);
});

t('lists and my order', () => {
  assert.strictEqual(E.kindSlug('AI Ideas!'), 'ai-ideas'); assert.strictEqual(E.kindSlug('9 Café ideas'), '9-cafe-ideas'); assert.strictEqual(E.kindSlug('9/11'), '9/11'); assert.ok(E.okKind('9/11')); assert.strictEqual(E.kindName('9/11'), '9/11'); assert.ok(!E.okKind('all')); assert.ok(!E.okKind('9/')); assert.ok(!E.okKind('a//b'));
  assert.strictEqual(E.kindName('ai-ideas'), 'Ai ideas'); assert.strictEqual(E.kindName('mirror'), 'Mirrors'); assert.strictEqual(E.kindOne('app'), 'New app');
  assert.ok(!E.okKind('a')); assert.ok(!E.okKind('x--y')); assert.ok(E.okKind('other'));
  const items = [{ id: 'a1aaaa', k: 'fix', t: 'a', st: 'todo', c: 3, u: 3 }, { id: 'b1bbbb', k: 'zz-top', t: 'b', st: 'todo', c: 2, u: 2 }];
  assert.deepStrictEqual(E.kindsOf(items, ['mine-list']), ['fix', 'app', 'mirror', 'other', 'mine-list', 'zz-top']);
  assert.strictEqual(E.counts(items)['zz-top'], 1);
  const m = {}; items.forEach((x) => { m[x.id] = Object.assign({ rs: [], note: '', star: false, d: 0 }, x); });
  let r = E.apply(m, { op: 'update', id: 'b1bbbb', o: -10 }, 9); assert.strictEqual(r.body.item.o, -10); m.b1bbbb = r.body.item;
  assert.deepStrictEqual(E.filter(Object.values(m), { k: 'all', sort: 'mine' }).map((x) => x.id), ['b1bbbb', 'a1aaaa']);
  r = E.apply(m, { op: 'update', id: 'b1bbbb', o: null }, 9); assert.strictEqual(r.body.item.o, undefined);
  assert.strictEqual(E.apply(m, { op: 'update', id: 'b1bbbb', o: 'x' }).status, 400);
  assert.strictEqual(E.between(null, 4, true), 2); assert.strictEqual(E.between(2, 4), 3); assert.strictEqual(E.between(5, null), 6);
});

t('import skips duplicates, newer copy wins', () => {
  const m = {};
  let r = E.apply(m, { op: 'import', items: [{ id: 'aaaaaa1', t: 'One', u: 5 }, { t: 'Two' }, { t: 'two ' }, { t: '' }, null] }, 10);
  assert.deepStrictEqual(r.body, { added: 2, replaced: 0, skipped: 3 });
  r.put.forEach((x) => { m[x.id] = x; });
  r = E.apply(m, { op: 'import', items: [{ id: 'aaaaaa1', t: 'One changed', u: 50 }, { id: 'aaaaaa1', t: 'old', u: 1 }, { t: 'One', k: 'app' }] }, 100);
  assert.deepStrictEqual(r.body, { added: 1, replaced: 1, skipped: 1 });
  assert.strictEqual(E.apply(m, { op: 'import', items: 'x' }).status, 400);
});

t('links, pictures, tools, filter', () => {
  const txt = 'Fix mes.fm/photo text box, see https://snipboard.io/AbC123.jpg and https://example.com/a.png. Also mes.fm/api/x';
  assert.deepStrictEqual(E.tools(txt), ['photo']);
  assert.strictEqual(E.imageOf('https://snipboard.io/AbC123.jpg'), 'https://i.snipboard.io/AbC123.jpg');
  assert.strictEqual(E.imageOf('https://example.com/a.png'), 'https://example.com/a.png');
  assert.strictEqual(E.imageOf('https://example.com/page'), '');
  const h = E.linkify('<b>x</b> https://a.com/x). mes.fm/photo');
  assert.ok(h.includes('&lt;b&gt;') && h.includes('href="https://a.com/x"') && h.includes('</a>).') && h.includes('href="https://mes.fm/photo"'));
  assert.ok(!E.linkify('javascript:alert(1) "><img>').includes('<img'));
  const items = [
    { id: 'a1', k: 'fix', t: 'Café on mes.fm/photo', st: 'todo', star: false, rs: [], c: 1, u: 1 },
    { id: 'a2', k: 'fix', t: 'Second', st: 'doing', star: true, rs: [{ t: 'cafe' }], c: 2, u: 9 },
    { id: 'a3', k: 'app', t: 'An app', st: 'done', star: false, rs: [], c: 3, u: 3 },
  ];
  assert.deepStrictEqual(E.filter(items, { k: 'fix' }).map((x) => x.id), ['a2', 'a1']);
  assert.deepStrictEqual(E.filter(items, { k: 'all', st: 'all', sort: 'old' }).map((x) => x.id), ['a1', 'a2', 'a3']);
  assert.deepStrictEqual(E.filter(items, { k: 'all', q: 'cafe' }).map((x) => x.id), ['a2', 'a1']);
  assert.deepStrictEqual(E.filter(items, { k: 'all', tool: 'photo' }).map((x) => x.id), ['a1']);
  assert.deepStrictEqual(E.filter(items, { k: 'all', st: 'done' }).map((x) => x.id), ['a3']);
  assert.deepStrictEqual(E.filter(items, { k: 'all', star: true }).map((x) => x.id), ['a2']);
  const c = E.counts(items); assert.strictEqual(c.fix, 2); assert.strictEqual(c.app, 0); assert.strictEqual(c.done, 1);
});

t('Telegram export', () => {
  const chat = { name: 'AI Coding New Apps', id: 1234567890, messages: [
    { id: 1, type: 'message', date_unixtime: '1700000000', from: 'MES', text: 'Make a password page' },
    { id: 2, type: 'message', date_unixtime: '1700000100', text: ['See ', { type: 'link', text: 'https://snipboard.io/X1.jpg' }], reply_to_message_id: 1 },
    { id: 3, type: 'message', date_unixtime: '1700000200', text: 'DONE also maybe add options', reply_to_message_id: 2 },
    { id: 4, type: 'service', action: 'pin_message' },
    { id: 5, type: 'message', date_unixtime: '1700000300', text: '', photo: 'photos/a.jpg' },
    { id: 6, type: 'message', date_unixtime: '1700000400', text: [{ type: 'text_link', text: 'this', href: 'https://x.com/y' }, ' page'] },
  ] };
  const r = E.fromTelegramChat(chat);
  assert.strictEqual(r.kind, 'app');
  assert.strictEqual(r.items.length, 3);
  const a = r.items[0];
  assert.strictEqual(a.rs.length, 2); assert.strictEqual(a.st, 'done'); assert.strictEqual(a.d, 1700000200000); assert.strictEqual(a.c, 1700000000000);
  assert.strictEqual(r.items[1].t, '[Photo in Telegram]');
  assert.strictEqual(r.items[2].t, 'this (https://x.com/y) page');
  assert.ok(/^[a-z0-9]{6,24}$/.test(a.id));
  assert.strictEqual(E.fromTelegramChat(chat, 'fix').items[0].k, 'fix');
  assert.strictEqual(E.guessKind('AI Coding Fixin\''), 'fix');
  assert.strictEqual(E.fromTelegram({ chats: { list: [chat, { name: 'x' }] } }).length, 1);
  // importing twice adds nothing
  const m = {}; const one = E.apply(m, { op: 'import', items: r.items }); one.put.forEach((x) => { m[x.id] = x; });
  assert.strictEqual(one.body.added, 3);
  assert.strictEqual(E.apply(m, { op: 'import', items: E.fromTelegramChat(chat).items }).body.added, 0);
});

t('backup file', () => {
  const txt = E.backupText([{ id: 'abcdef', t: 'x' }], 0);
  assert.deepStrictEqual(E.readBackup(JSON.parse(txt)), [{ id: 'abcdef', t: 'x' }]);
  assert.deepStrictEqual(E.readBackup([1]), [1]);
  assert.strictEqual(E.readBackup({}), null);
});

(async () => {
  const store = {};
  const deps = {
    all: async () => Object.assign({}, store),
    put: async (items) => { items.forEach((it) => { store[it.id] = JSON.stringify(it); }); },
    del: async (ids) => { ids.forEach((id) => { delete store[id]; }); },
    getImg: async (id) => imgs[id], putImg: async (id, b) => { imgs[id] = b; },
  };
  const imgs = {};
  const post = (body, extra) => api.respond(Object.assign({ method: 'POST', body: JSON.stringify(body), origin: 'https://mes.fm', contentType: 'application/json' }, extra), deps);
  await at('api', async () => {
    let r = await post({ op: 'add', t: 'Hello', k: 'fix' });
    assert.strictEqual(r.status, 200);
    const id = r.body.item.id;
    r = await post({ op: 'add', t: 'Later' });
    r = await api.respond({ method: 'GET' }, deps);
    assert.deepStrictEqual(r.body.items.map((x) => x.t).sort(), ['Hello', 'Later']);
    assert.strictEqual((await post({ op: 'add', t: 'x' }, { origin: 'https://evil.example' })).status, 403);
    assert.strictEqual((await post({ op: 'add', t: 'curl ok' }, { origin: undefined })).status, 200);
    assert.strictEqual((await post({ op: 'add', t: 'x' }, { contentType: 'text/plain' })).status, 415);
    assert.strictEqual((await api.respond({ method: 'POST', body: '{bad', origin: 'https://mes.fm', contentType: 'application/json' }, deps)).status, 400);
    assert.strictEqual((await api.respond({ method: 'PUT' }, deps)).status, 405);
    assert.strictEqual((await post({ op: 'update', id, st: 'done' })).body.item.st, 'done');
    assert.strictEqual((await post({ op: 'delete', id })).status, 200);
    assert.strictEqual(store[id], undefined);
    store.broken = '{not json';
    assert.strictEqual((await api.respond({ method: 'GET' }, deps)).body.items.length, 2);
    assert.deepStrictEqual(api.pairs(['a', '1', 'b', '2']), { a: '1', b: '2' });
  });
  await at('pictures', async () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]).toString('base64');
    let r = await post({ op: 'img', data: 'data:image/jpeg;base64,' + jpg });
    assert.strictEqual(r.status, 200); assert.ok(/^https:\/\/mes\.fm\/api\/edits\?img=[a-f0-9]{16}\.jpg$/.test(r.body.url));
    const g = await api.respond({ method: 'GET', img: r.body.id + '.jpg' }, deps);
    assert.strictEqual(g.status, 200); assert.strictEqual(g.image.toString('base64'), jpg);
    assert.strictEqual((await api.respond({ method: 'GET', img: '../x' }, deps)).status, 404);
    assert.strictEqual((await api.respond({ method: 'GET', img: 'aaaaaaaaaaaaaaaa.jpg' }, deps)).status, 404);
    assert.strictEqual((await post({ op: 'img', data: Buffer.from('<svg>').toString('base64') })).status, 400);
    assert.strictEqual((await post({ op: 'img', data: 'A'.repeat(800000) })).status, 400);
    assert.strictEqual(E.imageOf(r.body.url), '/api/edits?img=' + r.body.id + '.jpg');
    assert.strictEqual(E.imageOf('https://snipboard.io/9FtYnA.jpg'), 'https://i.snipboard.io/9FtYnA.jpg');
  });
  console.log('edits tests: ' + n + ' groups passed');
})().catch((e) => { console.error(e); process.exit(1); });

(function () {
    var o = E.orderTabs(["fix", "app", "mirror", "other", "911", "all", "queue"], ["queue", "app", "gone"]);
    if (o.join() !== "queue,app,fix,mirror,other,911,all") throw new Error("orderTabs " + o.join());
    if (E.orderTabs(["a", "b"], null).join() !== "a,b") throw new Error("orderTabs null");
})();

(async function () {
    // list names keep the user's capitals, pins come first, A-Z mode sorts by the name shown
    var m = E.cleanMeta({ names: { ai: "AI", "hive-posts": "Hive posts", x: "nope", fix: "Fixes!" , bad: "Other" }, pins: ["mirror", "mirror", "zz zz"], mode: "az" });
    if (m.names.ai !== "AI" || m.names["hive-posts"] !== "Hive posts" || m.names.bad || m.names.x) throw new Error("cleanMeta names " + JSON.stringify(m.names));
    if (m.pins.join() !== "mirror" || m.mode !== "az") throw new Error("cleanMeta pins/mode");
    if (E.kindName("ai", m.names) !== "AI" || E.kindName("ai") !== "Ai") throw new Error("kindName names");
    var t = E.sortTabs(["fix", "app", "mirror", "other", "ai", "zebra", "all", "queue"], m, []);
    if (t.join() !== "mirror,all,queue,ai,fix,app,other,zebra") throw new Error("sortTabs az " + t.join());
    var c = E.sortTabs(["fix", "app", "all"], { pins: ["all"] }, ["app"]);
    if (c.join() !== "all,app,fix") throw new Error("sortTabs custom " + c.join());
    // meta op round trip through the API
    var store = null;
    var deps = { all: async () => ({}), put: async () => {}, del: async () => {}, getMeta: async () => store, putMeta: async (v) => { store = v; } };
    var r = await api.respond({ method: 'POST', body: { op: 'meta', meta: { names: { ai: "AI" }, pins: ["ai"] } }, contentType: 'application/json' }, deps);
    if (r.status !== 200 || r.body.meta.names.ai !== "AI") throw new Error("meta post");
    var g = await api.respond({ method: 'GET' }, deps);
    if (g.body.meta.pins[0] !== "ai") throw new Error("meta get");
    console.log("edits meta tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
