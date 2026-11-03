// Tests for mes.fm/dashboard: the parsers in tool_apps_src/dashboard/lib.js on live answers recorded 2026-11-02
// (tool_apps_src/dashboard/fixtures/, re-record with  node mes.fm/api/dashboard.js --fixtures), and the whole api/dashboard.js
// build + handler with fetch answered from those fixtures and a fake Upstash.   Run:  node tool_apps_src/dashboard-tests.js
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const FX = path.join(__dirname, 'dashboard', 'fixtures');
const F = (f) => fs.readFileSync(path.join(FX, f), 'utf8');
const J = (f) => JSON.parse(F(f));
const D = require('./dashboard/lib.js');
let n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; } }
const NOW = Date.parse('2026-11-03T01:00:00Z');

t('lib copy is byte-identical', () => assert.strictEqual(fs.readFileSync(path.join(__dirname, 'dashboard', 'lib.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'mes.fm', 'api', '_dash-lib.js'), 'utf8')));
t('num', () => {
  assert.strictEqual(D.num('60.1K subscribers'), 60100); assert.strictEqual(D.num('13,660,614 views'), 13660614); assert.strictEqual(D.num('1.9K videos'), 1900);
  assert.strictEqual(D.num(' 170 '), 170); assert.strictEqual(D.num('1.2M'), 1200000); assert.strictEqual(D.num('no'), null); assert.strictEqual(D.num(null), null);
});
t('relTime / utc', () => {
  assert.strictEqual(D.relTime('3 days ago (edited)', NOW), NOW - 3 * 864e5); assert.strictEqual(D.relTime('1 hour ago', NOW), NOW - 36e5);
  assert.strictEqual(D.relTime('Streamed 2 weeks ago', NOW), NOW - 2 * 6048e5); assert.strictEqual(D.relTime('yesterday-ish', NOW), null);
  assert.strictEqual(D.utc('2026-11-02T21:39:24'), Date.parse('2026-11-02T21:39:24Z'));
});
t('YouTube about page', () => {
  const a = D.ytAbout(F('yt-about-mes.html'));
  assert.ok(a.subs > 50000 && a.subs < 200000, 'subs ' + a.subs); assert.ok(a.views > 13e6, 'views ' + a.views); assert.ok(a.videos > 1500, 'videos ' + a.videos);
  const b = D.ytAbout(F('yt-about-mestruth.html'));
  assert.ok(b.subs > 100 && b.subs < a.subs); assert.ok(b.views > 1000);
});
t('YouTube videos / streams tabs', () => {
  const v = D.ytVideosPage(F('yt-videos-mes.html'), NOW);
  assert.ok(v.length >= 10); v.forEach((x) => { assert.ok(/^[A-Za-z0-9_-]{11}$/.test(x.id)); assert.ok(x.title); assert.ok(x.views == null || x.views >= 0); });
  assert.ok(v.some((x) => x.views > 100)); assert.ok(v.every((x) => !x.published || x.published <= NOW));
  const s = D.ytVideosPage(F('yt-streams-mes.html'), NOW);
  assert.ok(s.length >= 5 && s.some((x) => /Livestream|Q\/A/i.test(x.title)));
});
t('YouTube watch page + comments', () => {
  const w = D.ytWatch(F('yt-watch-mes.html'));
  assert.ok(/^2\.\d{8}/.test(w.ver)); assert.ok(w.token && w.token.length > 20);
  const c = D.ytComments(F('yt-next-mes.json'), NOW);
  assert.ok(c.items.length >= 1); const x = c.items[0];
  assert.ok(x.id && x.text && x.author); assert.ok(x.ts < NOW); assert.strictEqual(typeof x.creator, 'boolean');
  assert.deepStrictEqual(D.ytComments('not json', NOW), { count: null, items: [] });
});
t('YouTube API shapes', () => {
  assert.deepStrictEqual(D.ytApiChannel({ items: [{ statistics: { subscriberCount: '60123', viewCount: '13660614', videoCount: '1955' }, contentDetails: { relatedPlaylists: { uploads: 'UUx' } } }] }), { subs: 60123, views: 13660614, videos: 1955, uploads: 'UUx' });
  assert.strictEqual(D.ytApiChannel({ items: [] }), null);
  assert.deepStrictEqual(D.ytApiVideos({ items: [{ id: 'a', statistics: { viewCount: '5', likeCount: '2', commentCount: '1' } }] }), { a: { views: 5, likes: 2, comments: 1 } });
  const c = D.ytApiComments({ items: [{ id: 'C1', snippet: { videoId: 'v', totalReplyCount: 2, topLevelComment: { snippet: { textOriginal: 'hi &amp; bye', authorDisplayName: '@x', authorChannelId: { value: 'UCx' }, publishedAt: '2026-11-01T00:00:00Z', likeCount: 3 } } } }] });
  assert.strictEqual(c[0].text, 'hi & bye'); assert.strictEqual(c[0].replies, 2); assert.strictEqual(c[0].ts, Date.parse('2026-11-01T00:00:00Z'));
});
t('YouTube RSS feed', () => {
  const xml = '<feed><entry><yt:videoId>zNdifMfnqcs</yt:videoId><title>A &amp; B</title><published>2026-10-30T06:00:00+00:00</published><media:group><media:community><media:starRating count="9" average="5"/><media:statistics views="338"/></media:community></media:group></entry><entry><yt:videoId>bad</yt:videoId></entry></feed>';
  const f = D.ytFeed(xml);
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].title, 'A & B'); assert.strictEqual(f[0].views, 338); assert.strictEqual(f[0].likes, 9);
});
t('Rumble channel (embedded JSON)', () => {
  ['mes', 'mestruth'].forEach((a) => {
    const r = D.rumbleChannel(F('rumble-' + a + '.html'));
    assert.ok(r.followers > 100, a + ' followers ' + r.followers); assert.ok(r.videos.length >= 5);
    r.videos.forEach((v) => { assert.ok(/^https:\/\/rumble\.com\//.test(v.url)); assert.ok(v.views == null || v.views >= 0); assert.ok(v.comments == null || v.comments >= 0); });
    for (let i = 1; i < r.videos.length; i++) assert.ok((r.videos[i - 1].published || 0) >= (r.videos[i].published || 0));
  });
  const h = D.rumbleChannel('<h1>X</h1><span>2.5K Followers</span>');
  assert.strictEqual(h.followers, 2500); assert.deepStrictEqual(h.videos, []);
});
t('BitChute', () => {
  const c = D.bitchuteChannel(J('bitchute-channel-mes.json'));
  assert.ok(c.followers > 1000 && c.views > 800000 && c.videos > 1700);
  assert.strictEqual(D.bitchuteChannel({ errors: [] }), null);
  const v = D.bitchuteVideos(J('bitchute-videos-mes.json'));
  assert.ok(v.length >= 5 && v[0].url.indexOf('https://www.bitchute.com/video/') === 0 && v[0].views >= 0);
  assert.deepStrictEqual(D.bitchuteCounts({ view_count: 81, like_count: 3, dislike_count: 0 }), { views: 81, likes: 3, dislikes: 0 });
});
t('Odysee', () => {
  const r = D.odyResolve(J('odysee-resolve-mes.json'), 'lbry://@mes#8');
  assert.strictEqual(r.claimId, '8c11ce96daacbbccc877c6dc9525f8067f968b59'); assert.ok(r.claims > 1000);
  assert.strictEqual(D.odyResolve({ error: { message: 'wallet' } }, 'lbry://@mes#8'), null);
  const v = D.odyClaims(J('odysee-claims-mestruth.json'));
  assert.ok(v.length >= 5); assert.ok(/^https:\/\/odysee\.com\/@mestruth:9\//.test(v[0].url), v[0].url); assert.ok(v[0].published > 1.7e12);
  const rx = D.odyReactions(J('odysee-reactions-mes.json')); assert.ok(Object.keys(rx).length >= 1);
  const c = D.odyComments(J('odysee-comments-mestruth.json'));
  assert.ok(c.total >= c.items.length); c.items.forEach((x) => { assert.ok(x.id && x.ts > 1.5e12); });
  assert.strictEqual(D.odyCounts({ success: false, error: 'authentication required' }), null);
  assert.deepStrictEqual(D.odyCounts({ success: true, data: [12, 3] }), [12, 3]);
});
t('Hive', () => {
  const p = D.hiveProfile(J('hive-profile-mes.json')); assert.ok(p.followers > 1000); assert.strictEqual(p.name, 'mes');
  const g = D.hivePerVest(J('hive-dgp.json')); assert.ok(g > 0.0004 && g < 0.001, 'hive per vest ' + g);
  const w = D.hiveAccount(J('hive-accounts-mes.json').result[0], g); assert.ok(w.hp > 1000 && w.hbd >= 0 && w.unclaimed);
  const posts = D.hivePosts(J('hive-posts-mes.json')); assert.ok(posts.length >= 10); assert.ok(posts.some((x) => x.video), 'a 3Speak video among the posts');
  posts.forEach((x) => { assert.ok(x.votes >= 0 && x.payout >= 0 && x.url.indexOf('https://peakd.com/@') === 0); });
  const rep = D.hiveReplies(J('hive-replies-mes.json')); assert.ok(rep.length >= 5 && rep[0].ts && rep[0].author && rep[0].parent);
  const no = D.hiveNotifs(J('hive-notifs-mes.json')); assert.ok(no.length >= 10); assert.ok(no.every((x) => x.kind && x.ts));
  assert.ok(no.some((x) => x.kind === 'vote' && x.author));
});
t('totals, snapshot, diff, inbox, series', () => {
  const src = [
    { p: 'yt', a: 'mes', ok: true, stats: { followers: 100, views: 1000, videos: 10 }, inbox: [{ id: 'a', ts: 5 }, { id: 'b', ts: 9 }] },
    { p: 'yt', a: 'mestruth', ok: true, stats: { followers: 5, views: null, videos: 2 }, inbox: [{ id: 'a', ts: 7 }] },
    { p: 'rumble', a: 'mes', ok: false, error: 'x' },
  ];
  const T = D.totals(src);
  assert.strictEqual(T.all.followers, 105); assert.strictEqual(T.all.views, 1000); assert.strictEqual(T.all.failed, 1); assert.strictEqual(T.per.yt.accounts, 2);
  const s = D.snapshot(src); assert.deepStrictEqual(s, { 'yt:mes': { f: 100, v: 1000, n: 10 }, 'yt:mestruth': { f: 5, n: 2 } });
  const d = D.diff({ 'yt:mes': { f: 90, v: 1000 } }, s); assert.deepStrictEqual(d['yt:mes'], { f: 10, v: 0, n: null }); assert.deepStrictEqual(d['yt:mestruth'], { f: null, v: null, n: null });
  const ib = D.inbox(src); assert.deepStrictEqual(ib.map((x) => x.key), ['yt:mes:b', 'yt:mestruth:a', 'yt:mes:a']);
  const rows = [{ d: '2026-11-01', a: s }, { d: '2026-11-02', a: { 'yt:mes': { f: 110 } } }];
  assert.deepStrictEqual(D.series(rows, 'yt:mes', 'f'), [{ d: '2026-11-01', y: 100 }, { d: '2026-11-02', y: 110 }]);
  assert.deepStrictEqual(D.sumSeries(rows, 'f', (k) => k.indexOf('yt:') === 0), [{ d: '2026-11-01', y: 105 }, { d: '2026-11-02', y: 110 }]);
  assert.strictEqual(D.fmt(13660614), '13.7M'); assert.strictEqual(D.fmt(1234), '1,234'); assert.strictEqual(D.fmt(null), '–');
});

// ---------------------------------------------------------------- the API, offline: fetch answered from the fixtures
const api = require(path.join(ROOT, 'mes.fm', 'api', 'dashboard.js'));
function fakeFetch(opts) {
  opts = opts || {};
  return async (url, init) => {
    const u = new URL(url), body = init && init.body ? String(init.body) : '';
    const ok = (t) => ({ ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t) });
    const miss = () => ({ ok: false, status: 404, text: async () => 'nope' });
    if (opts.down && opts.down.test(u.hostname)) throw new Error('getaddrinfo ENOTFOUND ' + u.hostname);
    if (u.hostname === 'www.youtube.com') {
      const acct = /mestruth/.test(u.pathname) || /UCmYl/.test(u.search) ? 'mestruth' : 'mes';
      if (/\/about$/.test(u.pathname)) return ok(F('yt-about-' + acct + '.html'));
      if (/\/videos$/.test(u.pathname)) return ok(F('yt-videos-' + acct + '.html'));
      if (/\/streams$/.test(u.pathname)) return ok(F('yt-streams-' + acct + '.html'));
      if (u.pathname === '/watch') return ok(F('yt-watch-mes.html'));
      if (u.pathname === '/youtubei/v1/next') return ok(F('yt-next-mes.json'));
      return miss();
    }
    if (u.hostname === 'rumble.com') return ok(F(/MESTruth/.test(u.pathname) ? 'rumble-mestruth.html' : 'rumble-mes.html'));
    if (u.hostname === 'api.bitchute.com') {
      if (/channel\/videos$/.test(u.pathname)) return ok(F('bitchute-videos-mes.json'));
      if (/channel$/.test(u.pathname)) return ok(F('bitchute-channel-mes.json'));
      return ok(F('bitchute-counts.json'));
    }
    if (u.hostname === 'api.na-backend.odysee.com') {
      const a = /mestruth|9edc879ee73a302f1c9f8110053ed725a2eeb256/.test(body) ? 'mestruth' : 'mes';
      return ok(F((/claim_search/.test(u.search) ? 'odysee-claims-' : 'odysee-resolve-') + a + '.json'));
    }
    if (u.hostname === 'api.odysee.com') return ok(F('odysee-reactions-mes.json'));
    if (u.hostname === 'comments.odysee.tv') return ok(F('odysee-comments-mestruth.json'));
    if (/hive|deathwing/.test(u.hostname)) {
      const j = JSON.parse(body), p = j.params, a = (p && (p.account || (Array.isArray(p) && p[0] && p[0][0]))) || 'mes';
      const name = { 'bridge.get_profile': 'hive-profile-', 'condenser_api.get_accounts': 'hive-accounts-', 'bridge.account_notifications': 'hive-notifs-', 'bridge.unread_notifications': 'hive-unread-' }[j.method];
      if (name) return ok(F(name + a + '.json'));
      if (j.method === 'condenser_api.get_dynamic_global_properties') return ok(F('hive-dgp.json'));
      if (j.method === 'bridge.get_account_posts') return ok(F((p.sort === 'replies' ? 'hive-replies-' : 'hive-posts-') + a + '.json'));
    }
    return miss();
  };
}
function fakeRedis() {
  const db = {};
  return { db, fetch: async (url, init) => {
    const cmds = JSON.parse(init.body);
    const out = cmds.map((c) => { const [op, ...a] = c; if (op === 'GET') return { result: db[a[0]] || null }; if (op === 'SET') { db[a[0]] = a[1]; return { result: 'OK' }; } if (op === 'MGET') return { result: a.map((k) => db[k] || null) }; return { result: null }; });
    return { ok: true, status: 200, json: async () => out, text: async () => JSON.stringify(out) };
  } };
}
function res() { const r = { code: 0, headers: {}, body: null }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; }

(async () => {
  const realFetch = global.fetch;
  try {
    global.fetch = fakeFetch();
    const d = await api.build({});
    const by = {}; d.sources.forEach((s) => { by[s.p + ':' + s.a] = s; });
    t('build: every source answers from the fixtures', () => d.sources.forEach((s) => assert.ok(s.ok, s.p + ':' + s.a + ' ' + s.error)));
    t('build: YouTube keyless', () => { const s = by['yt:mes']; assert.ok(s.stats.followers > 50000 && s.stats.views > 1e7); assert.ok(s.uploads.length >= 10); assert.deepStrictEqual(s.needs, ['YOUTUBE_API_KEY']); assert.ok(s.inbox.length >= 1 && s.inbox[0].kind === 'comment' && /&lc=/.test(s.inbox[0].url)); });
    t('build: Odysee needs its token for followers', () => { const s = by['odysee:mes']; assert.strictEqual(s.stats.followers, null); assert.ok(s.stats.videos > 1000); assert.deepStrictEqual(s.needs, ['ODYSEE_AUTH_TOKEN']); });
    t('build: Hive inbox + wallet', () => { const s = by['hive:mes']; assert.ok(s.inbox.some((x) => x.kind === 'comment')); assert.ok(s.inbox.some((x) => x.kind === 'vote')); assert.ok(!s.inbox.some((x) => x.kind === 'reply')); assert.ok(s.extra.wallet.hp > 0); });
    t('build: 3Speak = Hive video posts only', () => { const s = by['3speak:mes']; assert.ok(s.uploads.length >= 1 && s.uploads.every((v) => v.video && /^https:\/\/3speak\.tv\/watch\?v=/.test(v.url))); });
    t('build: inbox texts are clipped', () => d.sources.forEach((s) => (s.inbox || []).forEach((x) => assert.ok(x.text.length <= 600))));

    global.fetch = fakeFetch({ down: /bitchute|rumble/ });
    const d2 = await api.build({});
    t('build: a platform that is down only fails itself', () => { d2.sources.forEach((s) => { if (/bitchute|rumble/.test(s.p)) { assert.ok(!s.ok && /ENOTFOUND/.test(s.error)); } else assert.ok(s.ok, s.p); }); });

    // handler: Upstash cache, daily snapshot, stale fallback
    const R = fakeRedis();
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
    const route = (opts) => async (url, init) => /redis\.test/.test(url) ? R.fetch(url, init) : fakeFetch(opts)(url, init);
    global.fetch = route();
    const r1 = res(); await api({ query: {} }, r1);
    t('handler: 200, private, history written', () => {
      assert.strictEqual(r1.code, 200); assert.strictEqual(r1.headers['Cache-Control'], 'private, no-store');
      assert.ok(R.db['dash:data']); const day = Object.keys(R.db).find((k) => /^dash:day:\d{4}-\d\d-\d\d$/.test(k)); assert.ok(day);
      assert.ok(JSON.parse(R.db[day])['yt:mes'].f > 0); assert.strictEqual(r1.body.history.length, 1);
    });
    global.fetch = route({ down: /bitchute/ });
    const r2 = res(); await api({ query: { refresh: '1' } }, r2);
    t('handler: refresh within a minute reuses the stored data', () => assert.strictEqual(r2.body.generated, r1.body.generated));
    const stored = JSON.parse(R.db['dash:data']); stored.generated = new Date(Date.now() - 20 * 6e4).toISOString(); R.db['dash:data'] = JSON.stringify(stored);
    const r3 = res(); await api({ query: {} }, r3);
    t('handler: a failed source keeps its last good numbers, marked stale', () => { const b = r3.body.sources.find((s) => s.p === 'bitchute'); assert.ok(b.ok && b.stale && /ENOTFOUND/.test(b.error) && b.stats.followers > 0); });
    t('handler: stale numbers are not written into the day snapshot', () => { const day = Object.keys(R.db).find((k) => /^dash:day:/.test(k)); assert.ok(!JSON.parse(R.db[day])['bitchute:mes']); });

    t('middleware gates the page and its data', () => { const m = fs.readFileSync(path.join(ROOT, 'mes.fm', 'middleware.js'), 'utf8'); ["'/dashboard'", "'/dashboard/:path*'", "'/api/dashboard'"].forEach((x) => assert.ok(m.indexOf(x) > 0, x)); });
    t('sample has every source', () => { const s = api.sample(Date.now()); assert.ok(s.sample); assert.strictEqual(s.sources.length, d.sources.length); assert.ok(s.history.length >= 30); });
    t('page sample file exists', () => { const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'mes.fm', 'dashboard', 'data', 'sample.json'), 'utf8')); assert.ok(s.sample); });
  } finally { global.fetch = realFetch; }
  console.log(process.exitCode ? 'FAILED' : 'ok', n, 'checks');
})();
