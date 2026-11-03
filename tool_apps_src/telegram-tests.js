// Tests for the MES Telegram Archive (mes.fm/telegram): parser on recorded t.me/s/meslinks pages, data files, filters, safe rendering,
// the api lib copy and api/tg-latest.js with a mocked fetch.  Run: node tool_apps_src/telegram-tests.js
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const T = require('./telegram/lib.js');
const FX = path.join(__dirname, 'telegram', 'fixtures');
let n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepStrictEqual(a, b, m); n++; }
const page = (f) => T.parsePage(fs.readFileSync(path.join(FX, f), 'utf8'));

// --- byte-identical api copy
eq(fs.readFileSync(path.join(__dirname, 'telegram', 'lib.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'mes.fm', 'api', '_tg-lib.js'), 'utf8'), 'mes.fm/api/_tg-lib.js must be a copy of tool_apps_src/telegram/lib.js');

// --- newest page
const top = page('newest.html');
ok(top.posts.length >= 15 && top.posts.length <= 20, 'newest page has ~20 posts');
ok(top.posts.every((p, i, a) => !i || a[i - 1].i < p.i), 'oldest first');
eq(top.before, top.posts[0].i, 'before = oldest id on the page');
const last = top.posts[top.posts.length - 1];
eq(last.i, 35673);
eq(last.d, Math.round(Date.parse('2026-11-02T22:36:43+00:00') / 1000), 'date from <time datetime>');
ok(/^Richard Gage: "We Are Necessarily Gatekeepers"/.test(last.t), 'text, entities decoded');
ok(last.t.indexOf('[MES](https://mes.fm/richard-gage-gatekeeper)') >= 0, 'labelled link kept as [label](url)');
eq(last.m, 'v'); eq(last.r, 35444, 'reply-to id');
ok(typeof last.v === 'number' && last.v > 0, 'views');
ok(/^https:\/\/cdn\d\.telesco\.pe\//.test(last.img), 'live picture address');
ok(last.t.indexOf('<') < 0, 'no HTML left in text');
const hut = top.posts.find((p) => p.i === 35654);
ok(hut && hut.t.indexOf('[Captain John Hutchison](https://www.youtube.com/@HutchisonEffect)') >= 0, 'link inside text');
ok(T.catMask(hut) & 2, 'Hutchison topic');
const album = top.posts.find((p) => p.n > 1);
ok(album && album.n >= 2, 'album counted');

// --- reply text is not taken for the post's own text
const p20k = page('before-20000.html');
const r = p20k.posts.find((p) => p.i === 19982);
ok(r.t.indexOf('mRNA Nobel prizers wore masks') >= 0 && r.t.indexOf('Nobel press release') < 0, 'reply quote dropped');
eq(r.r, 19976);
ok(r.t.indexOf('[mRNA Nobel prizers wore masks](https://www.instagram.com/p/Cx5yzR0R_9R/)') === 0, 'anchor label + url');
eq(p20k.posts.find((p) => p.i === 19979).m, 'p', 'mixed album: photo first');

// --- forwarded + nested text div + link preview
const p2 = page('before-20644.html');
const fw = p2.posts.concat(page('before-15000.html').posts).filter((p) => p.f);
ok(fw.length >= 1 && fw.every((p) => p.f.indexOf('<') < 0 && p.f.indexOf('Forwarded') < 0), 'forwarded-from name');
ok(fw.some((p) => p.fu && /^https:\/\/t\.me\//.test(p.fu)), 'forwarded-from link');
const gnm = p2.posts.find((p) => /German New Medicine/.test(p.t || ''));
ok(gnm && gnm.t.indexOf('https://youtu.be/I7viSVL3twA') >= 0, 'nested text div, bare link kept as URL');
eq(T.firstYt(gnm), 'I7viSVL3twA', 'YouTube id');
const old = page('before-1200.html');
const pv = old.posts.find((p) => p.pv);
ok(pv && /twitter\.com/.test(pv.pv.u) && pv.pv.s === 'Twitter', 'link preview');

// --- views parsing, text helpers
eq(T.views('1.2K'), 1200); eq(T.views('37'), 37); eq(T.views('2M'), 2000000); eq(T.views('x'), null);
eq(T.textOf('a <a href="https://x.com/a">https://x.com/a</a> <a href="?q=%23math">#math</a> <b>b</b><br/>c &amp; d'), 'a https://x.com/a #math b\nc & d');
eq(T.textOf('<a href="javascript:alert(1)">bad</a>'), 'bad', 'non-http links become plain text');

// --- safe rendering
const evil = { i: 1, t: '<img src=x onerror=alert(1)> [click](javascript:alert(1)) [ok](https://mes.fm/a") https://youtu.be/abcdefghijk.' };
const html = T.textHtml(evil.t);
ok(html.indexOf('<img') < 0 && html.indexOf('&lt;img') >= 0, 'tags escaped');
ok(html.indexOf('href="javascript') < 0, 'no javascript: links');
ok(/href="https:\/\/youtu\.be\/abcdefghijk"/.test(html) && /<\/a>\.$/.test(html), 'bare URL linked, trailing dot kept outside');
ok(html.indexOf('mes.fm/a&quot;') >= 0 || html.indexOf('href="https://mes.fm/a&quot;"') >= 0, 'quotes in URLs escaped');
ok(T.textHtml('x'.repeat(500), 100).length < 140, 'truncation');

// --- links, sites
const lp = { i: 2, t: 'see [MES](https://mes.fm/x) and https://peakd.com/@mes/p, https://youtu.be/abcdefghijk', pv: { u: 'https://rumble.com/v1' } };
eq(T.links(lp), ['https://mes.fm/x', 'https://peakd.com/@mes/p', 'https://youtu.be/abcdefghijk', 'https://rumble.com/v1']);
eq(T.sitesOf(lp).sort(), ['hive', 'mes', 'rum', 'yt']);
ok(T.catMask(lp) & (1 << T.CATS.findIndex((c) => c.id === 'mesfm')), 'MES.fm pages topic');

// --- data files + filters
const all = [].concat(top.posts, p20k.posts, p2.posts, old.posts, top.posts);
const out = T.buildData(all, { generated: '2026-11-02T00:00:00Z' });
eq(out.index.count, new Set(all.map((p) => p.i)).size, 'deduplicated');
ok(out.chunks.length === 1 && out.chunks[0].data.posts.every((p) => !('img' in p)), 'CDN addresses never stored');
eq(out.index.newest, 35673);
ok(Object.values(out.index.years).reduce((a, b) => a + b, 0) === out.index.count, 'year counts add up');
const posts = out.chunks[0].data.posts;
eq(T.filter(posts, T.parseQuery('?q=%2335673')).map((p) => p.i), [35673], '#id search');
const g = T.filter(posts, T.parseQuery('?q=gatekeepers richard'));
ok(g.length >= 1 && g.every((p) => /gatekeep/i.test(p.t)), 'every word must match');
const y = T.filter(posts, T.parseQuery('?y=2021'));
ok(y.length && y.every((p) => T.yearOf(p) === 2021), 'year filter');
const s = T.sortPosts(posts, 'views');
ok(s.every((p, i) => !i || (s[i - 1].v || 0) >= (p.v || 0)), 'most viewed sort');
const c = T.counts(posts, T.parseQuery(''));
eq(Object.values(c.y).reduce((a, b) => a + b, 0), posts.length, 'counts');
eq(T.toQuery(T.parseQuery('?q=a b&c=hut&sort=views&view=list&pg=3')), '?q=a%20b&c=hut&sort=views&view=list&pg=3');
ok(!T.needsAll(T.parseQuery('?pg=4')) && T.needsAll(T.parseQuery('?c=math')), 'needsAll');

// --- api with a mocked fetch
const api = require('../mes.fm/api/tg-latest.js');
const fixture = fs.readFileSync(path.join(FX, 'newest.html'), 'utf8');
let asked = null;
api.build(async (u) => { asked = u; return { ok: true, status: 200, text: async () => fixture }; }).then((d) => {
	eq(asked, 'https://t.me/s/meslinks', 'fixed address');
	ok(d.posts.length === top.posts.length && d.posts.every((p) => typeof p.c === 'number'), 'api posts');
	ok(d.posts.some((p) => p.img), 'api keeps live pictures');
	return api.build(async () => ({ ok: false, status: 500, text: async () => '' })).then(() => assert.fail('should throw'), () => { n++; });
}).then(() => {
	// handler: query string ignored, errors not cached
	const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, send(b) { this.body = b; }, json(b) { this.body = b; } };
	const saved = global.fetch;
	global.fetch = async () => { throw new Error('down'); };
	return api({ query: { url: 'https://evil.example' } }, res).then(() => {
		global.fetch = saved;
		eq(res.code, 502); eq(res.h['Cache-Control'], 'no-store');
		console.log('telegram tests: ' + n + ' checks passed');
	});
}).catch((e) => { console.error(e); process.exit(1); });
