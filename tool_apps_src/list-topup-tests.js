// Tests for the runtime top-up of snapshot list pages: main_js/list-topup.js (shared client logic), shared/list-topup.mjs (build side) and
// api/yt-latest.js (YouTube RSS -> JSON, fetch mocked). Run: node tool_apps_src/list-topup-tests.js
const path = require('path');
const ROOT = path.join(__dirname, '..', 'mes.fm');
const T = require(path.join(ROOT, 'main_js/list-topup.js'));
const API = require(path.join(ROOT, 'api/yt-latest.js'));
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL', msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' -> ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); }

(async () => {
  // ---- build side: category functions -> regex spec, round trip, mismatch detection
  const B = await import(path.join(ROOT, 'shared/list-topup.mjs'));
  const CATS = [
    { id: 'money', label: 'Money', test: (t) => /money|\bbank|econom/i.test(t), tags: ['money'] },
    { id: 'tech', label: 'Tech', test: (t) => /free energy|\bai\b|9\/11/i.test(t) },
  ];
  const spec = B.catSpec(CATS);
  eq(spec[0], { id: 'money', re: 'money|\\bbank|econom', fl: 'i', tags: ['money'] }, 'catSpec money');
  eq(spec[1], { id: 'tech', re: 'free energy|\\bai\\b|9\\/11', fl: 'i' }, 'catSpec tech (no tags key)');
  let threw = false;
  try { B.catSpec([{ id: 'x', test: (t) => t.includes('a') }]); } catch (e) { threw = true; }
  ok(threw, 'catSpec rejects a non-regex test');
  const cats = T.compileCats(spec);
  eq(T.catsFor({ title: 'The Bank of AI' }, cats), 'money tech', 'two topics');
  eq(T.catsFor({ title: 'A walk', tags: ['money'] }, cats), 'money', 'tag match');
  eq(T.catsFor({ title: 'A walk', tags: ['life'] }, cats), 'other', 'nothing -> other');
  eq(T.catsFor({ title: 'Banking' }, cats), 'money', 'prefix match like the build'); eq(T.catsFor({ title: 'Snowbank' }, cats), 'other', 'word boundary kept');
  B.checkCats([{ title: 'The Bank of AI', cats: 'money tech' }], spec);
  threw = false;
  try { B.checkCats([{ title: 'The Bank of AI', cats: 'money' }], spec); } catch (e) { threw = true; }
  ok(threw, 'checkCats spots a mismatch');
  const html = B.topupScripts({ section: 's', known: ['</script><b>'] });
  ok(!/<\/script><b>/.test(html.split('\n')[0].slice(8)), 'config cannot close its script tag');
  ok(/list-topup\.js\?v=\d+/.test(html), 'script tag');

  // ---- pickNew
  const f = (k) => ({ key: k });
  eq(T.pickNew([f('c'), f('b'), f('a')], ['a', 'z']), { items: [f('c'), f('b')], more: false }, 'pickNew stops at the snapshot');
  eq(T.pickNew([f('a'), f('b')], ['a']), { items: [], more: false }, 'pickNew nothing new');
  eq(T.pickNew([f('x'), f('y')], ['a']), { items: [f('x'), f('y')], more: true }, 'pickNew snapshot not reached -> more');
  eq(T.pickNew([], ['a']), { items: [], more: false }, 'pickNew empty');
  eq(T.number([f('x'), f('y')]).map((i) => i.i), [-2, -1], 'number(): newest gets the lowest data-i');

  // ---- Hive posts
  const post = {
    author: 'amaterasusolar', permlink: 'birds-with-money', title: 'Birds with Money', depth: 0, created: '2026-10-21T11:13:36',
    body: '\n![h.png](https://files.peakd.com/x/a b.png)\n<br>\nBirds   **have** money.&nbsp; See [this](https://x.y/z) now.',
    json_metadata: { tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], image: ['https://files.peakd.com/x/a b.png'] },
  };
  const it = T.hiveItem(post, 'amaterasusolar');
  eq(it.key, 'birds-with-money', 'hive key');
  eq(it.href, 'https://peakd.com/@amaterasusolar/birds-with-money', 'hive href');
  eq(it.desc, 'Birds have money. See this now.', 'hive desc = plain text');
  eq(it.words, 9, 'hive words = whitespace words of the raw body (as in sections.mjs)');
  eq(it.tags.length, 8, 'hive tags capped at 8');
  eq(it.image, 'https://images.hive.blog/640x0/https://files.peakd.com/x/a%20b.png', 'hive image proxied');
  ok(/^Oct 21, 2026 · 9 words · 1 min read$/.test(it.meta), 'hive meta ' + it.meta);
  eq(T.hiveItem(Object.assign({}, post, { author: 'someoneelse' }), 'amaterasusolar'), null, 'reblog (other author) skipped');
  eq(T.hiveItem(Object.assign({}, post, { reblogged_by: ['amaterasusolar'] }), 'amaterasusolar'), null, 'reblogged_by skipped');
  eq(T.hiveItem(Object.assign({}, post, { depth: 1 }), 'amaterasusolar'), null, 'comment skipped');
  eq(T.hiveItem(Object.assign({}, post, { json_metadata: '{"tags":["x"]}' }), 'amaterasusolar').image, 'https://images.hive.blog/u/amaterasusolar/avatar', 'no image -> avatar; string metadata ok');
  // real-shape check: the snapshot's own word count for this post was computed the same way
  eq(T.wordCount('a  b\n\nc'), 3, 'wordCount');

  // ---- YouTube items
  const skip = new RegExp('^(?:MES Livestream \\d|MES Math Q\\/A \\d)', 'i');
  const y = T.ytItem({ id: 'DprWTjHTgEk', title: 'Problems Plus 7', published: '2026-10-21T19:44:35+00:00', views: 12345, short: false }, skip);
  eq(y.href, 'https://www.youtube.com/watch?v=DprWTjHTgEk', 'yt href');
  eq(y.image, 'https://i.ytimg.com/vi/DprWTjHTgEk/hqdefault.jpg', 'yt thumb');
  eq(y.meta, 'Uploaded Oct 21, 2026 · 12K views', 'yt meta');
  eq(y.v, 12345, 'yt views sort key');
  eq(T.ytItem({ id: 'DprWTjHTgEk', title: 'MES Math Q/A 73: X', short: false }, skip), null, 'livestream replay skipped');
  eq(T.ytItem({ id: 'DprWTjHTgEk', title: 'MES Livestream 142: X', short: false }, skip), null, 'livestream skipped');
  eq(T.ytItem({ id: 'DprWTjHTgEk', title: 'Gaussian pulse', short: true }, skip), null, 'Short skipped');
  eq(T.ytItem({ id: 'bad id!', title: 'x' }, skip), null, 'bad id skipped');

  // ---- markup
  const card = T.cardHtml(Object.assign({}, it, { cats: 'money', i: -1 }));
  ok(/^<a class="link-card lt-added" data-lt="birds-with-money" data-cats="money" data-i="-1" data-v="9" data-d="9" data-s="/.test(card), 'card attrs');
  ok(/<span class="link-card-title">Birds with Money<\/span>/.test(card) && /class="lt-new"/.test(card), 'card title + badge');
  const evil = T.cardHtml({ key: 'k', title: '<img onerror=x>', href: 'https://a/"x', image: "https://a/')x", meta: 'm', i: -1 });
  ok(!/<img onerror/.test(evil) && !/"x"/.test(evil) && !/'\)x/.test(evil), 'card escapes title / href / image');
  const row = T.rowHtml(Object.assign({}, it, { cats: 'money', i: -1 }));
  ok(/<h3>Birds with Money<\/h3>/.test(row) && /Read on Hive/.test(row) && /class="list-thumb"/.test(row), 'row markup');

  // ---- status text
  eq(T.statusText(0, 'article', 'articles', 'just now'), 'Up to date · checked just now', 'status up to date');
  eq(T.statusText(2, 'article', 'articles', '2 min ago'), '2 new articles added · checked 2 min ago', 'status 2 new');
  eq(T.statusText(1, 'video', 'videos', '1 min ago', true), '1 new video added (there may be more) · checked 1 min ago', 'status 1 + more');
  eq(T.ago(30e3), 'just now', 'ago 30 s'); eq(T.ago(125e3), '2 min ago', 'ago 2 min'); eq(T.ago(3.7e6), '1 hour ago', 'ago 1 h');

  // ---- api/yt-latest.js
  const FEED = `<?xml version="1.0"?><feed><title>Math Easy Solutions</title>
<entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Sum &amp; &quot;Product&quot; &#8211; rules</title><published>2026-10-22T10:00:00+00:00</published><media:statistics views="42"/></entry>
<entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>A Short</title><published>2026-10-21T10:00:00+00:00</published><media:statistics views="7"/></entry>
<entry><yt:videoId>bad</yt:videoId><title>Broken</title></entry>
</feed>`;
  eq(API.parseFeed(FEED).map((v) => [v.id, v.title, v.views]), [['AAAAAAAAAAA', 'Sum & "Product" – rules', 42], ['BBBBBBBBBBB', 'A Short', 7]], 'parseFeed');
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push(url);
    if (url.startsWith('https://www.youtube.com/feeds/videos.xml?channel_id=')) return { ok: true, status: 200, text: async () => FEED };
    if (url === 'https://www.youtube.com/shorts/BBBBBBBBBBB') return { ok: true, status: 200 };
    if (url.startsWith('https://www.youtube.com/shorts/')) return { ok: false, status: 303 };
    throw new Error('unexpected ' + url);
  };
  function fakeRes() {
    const r = { headers: {}, code: 0, body: null };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (c) => { r.code = c; return r; };
    r.send = (b) => { r.body = JSON.parse(b); return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  }
  let res = fakeRes();
  await API({ query: { ch: 'mes' } }, res);
  eq(res.code, 200, 'api 200');
  eq(res.body.items.map((v) => [v.id, v.short]), [['AAAAAAAAAAA', false], ['BBBBBBBBBBB', true]], 'api marks Shorts');
  ok(/s-maxage=3600/.test(res.headers['Cache-Control']) && /stale-while-revalidate=86400/.test(res.headers['Cache-Control']), 'api cache header');
  ok(calls[0] === 'https://www.youtube.com/feeds/videos.xml?channel_id=UCUUBq1GPBvvGNz7dpgO14Ow', 'api reads the @mes feed');
  calls.length = 0; res = fakeRes();
  await API({ query: {} }, res);
  ok(res.code === 200 && res.body.channel === 'mes', 'api default channel');
  for (const bad of ['https://evil.example/feed', 'UCUUBq1GPBvvGNz7dpgO14Ow', '__proto__', 'constructor', 'toString']) {
    calls.length = 0; res = fakeRes();
    await API({ query: { ch: bad } }, res);
    ok(res.code === 400 && calls.length === 0 && res.headers['Cache-Control'] === 'no-store', 'api refuses ch=' + bad + ' without fetching');
  }
  calls.length = 0; res = fakeRes();
  await API({ query: { ch: ['mes', 'x'] } }, res);
  ok(res.code === 200 && res.body.channel === 'mes', 'api: array ch falls back to the default channel');
  global.fetch = async () => ({ ok: false, status: 500, text: async () => '' });
  res = fakeRes();
  await API({ query: { ch: 'mes' } }, res);
  ok(res.code === 502 && res.headers['Cache-Control'] === 'no-store', 'api 502 not cached');
  global.fetch = async (url) => { if (url.includes('/shorts/')) throw new Error('net'); return { ok: true, status: 200, text: async () => FEED }; };
  res = fakeRes();
  await API({ query: { ch: 'mes' } }, res);
  ok(res.code === 200 && res.body.items.every((v) => v.short === false), 'api: a failed Shorts check counts as not a Short');
  global.fetch = realFetch;

  console.log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
