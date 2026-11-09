// node tool_apps_src/watch-tests.js
const assert = require('assert');
const W = require('./watch/lib.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

let it = W.item('https://youtu.be/dQw4w9WgXcQ?t=1m5s');
eq([it.k, it.id, it.s, W.mode(it)], ['youtube', 'dQw4w9WgXcQ', 65, 'yt'], 'youtu.be + t');
ok(it.th.includes('dQw4w9WgXcQ'), 'yt thumb');
it = W.item('youtube.com/shorts/dQw4w9WgXcQ'); eq(W.mode(it), 'yt', 'shorts');
it = W.item('https://3speak.tv/watch?v=mes/abcdefgh'); eq([it.k, it.id, W.mode(it)], ['3speak', 'mes/abcdefgh', 'hls'], '3speak');
it = W.item('https://odysee.com/@mestruth:9/my-video:3'); eq([W.mode(it), it.id], ['odysee', '@mestruth:9/my-video:3'], 'odysee video');
it = W.item('https://odysee.com/@mestruth:9'); eq(W.mode(it), 'open', 'odysee channel = open');
it = W.item('https://rumble.com/embed/v4abc12/'); eq(W.mode(it), 'embed', 'rumble embed');
it = W.item('https://rumble.com/v4xyz-some-title.html'); eq(W.mode(it), 'open', 'rumble page');
it = W.item('https://www.bitchute.com/video/AbCdEf123456/'); eq(W.mode(it), 'embed', 'bitchute');
it = W.item('https://x.com/mes/status/1234567890123'); eq(W.mode(it), 'embed', 'x');
it = W.item('https://example.com/clip.mp4'); eq([W.mode(it), it.t], ['file', 'clip.mp4'], 'direct');
ok(W.item('notalink').err, 'bad link');
ok(W.canSpeed(W.item('https://youtu.be/dQw4w9WgXcQ')) && !W.canSpeed(W.item('https://rumble.com/embed/v4abc12/')), 'canSpeed');
eq(W.ytSpeed(3), 2, 'yt speed cap');

const m = W.parseMany('https://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ, https://3speak.tv/watch?v=mes/x1 hello ftp://x.y/z');
eq(m.items.length, 2, 'dedupe + parse many'); eq(m.errors.length, 1, 'ftp error');

let a = W.parseMany('youtu.be/AAAAAAAAAAA youtu.be/BBBBBBBBBBB youtu.be/CCCCCCCCCCC').items;
let q = W.add([], a);
eq(q.map(x => x.id), ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'], 'add');
eq(W.add(q, [a[1]]).length, 3, 'no dup');
eq(W.add([a[0]], [a[2]], true).map(x => x.id), ['CCCCCCCCCCC', 'AAAAAAAAAAA'], 'atFront');
eq(W.move(q, 0, 2).map(x => x.id), ['BBBBBBBBBBB', 'CCCCCCCCCCC', 'AAAAAAAAAAA'], 'move');
eq(W.remove(q, a[1].key).length, 2, 'remove'); eq(W.indexOf(q, a[2].key), 2, 'indexOf');

let h = W.touch([], a[0], 100, 600, 1000);
eq([h[0].pos, h[0].at], [100, 1000], 'touch');
eq(W.resumeAt(a[0], h[0]), 97, 'resume');
eq(W.resumeAt(a[0], { pos: 10, dur: 600 }), 0, 'too early');
h = W.touch(h, a[0], 595, 600); eq(h.length, 1, 'touch replaces'); ok(W.done(h[0]), 'done'); eq(W.resumeAt(a[0], h[0]), 0, 'finished restarts');
eq(W.resumeAt({ s: 30 }, { pos: 200, dur: 600 }), 30, 'link t wins');
eq(W.pct({ pos: 150, dur: 600 }), 25, 'pct');

let s = W.shareUrl('https://mes.fm/watch', [a[0]], 42.7);
eq(W.fromQuery(s.split('?')[1]), { links: ['https://www.youtube.com/watch?v=AAAAAAAAAAA'], t: 42, name: '' }, 'share one');
s = W.shareUrl('https://mes.fm/watch', a);
eq(W.fromQuery('?' + s.split('?')[1]).links.length, 3, 'share many');
eq(W.atTime(a[0], 90.4), 'https://www.youtube.com/watch?v=AAAAAAAAAAA&t=90s', 'atTime');
eq([W.fmt(65), W.fmt(3725)], ['1:05', '1:02:05'], 'fmt');
eq(W.ago(0, 3 * 3600e3), '3 h ago', 'ago');
// playlists, own lists, zoom
let pm = W.parseMany('https://www.youtube.com/playlist?list=PLai3U8-WIK0FfZ_7hUuyO7xN8lp5oaDiu https://youtu.be/dQw4w9WgXcQ?list=PLabcdefghij https://x.com/a?list=PLzzzzzzzzzz');
eq(pm.playlists, ['PLai3U8-WIK0FfZ_7hUuyO7xN8lp5oaDiu', 'PLabcdefghij'], 'playlist ids, youtube only');
eq(pm.items.filter(x => x.k === 'youtube').map(x => x.id), ['dQw4w9WgXcQ'], 'a playlist page adds no item, watch?v=&list= keeps its video');
eq(W.playlistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'), '', 'radio mix ignored');
let nl = W.newList('Fav', [W.item('https://youtu.be/dQw4w9WgXcQ')], 5); ok(nl.id && nl.items.length === 1 && W.findList([nl], nl.id) === nl, 'newList/findList');
eq(W.clampZoom({ k: 2, x: 900, y: -900 }, 400, 225), { k: 2, x: 200, y: -112.5 }, 'clampZoom keeps it covering');
eq(W.clampZoom({ k: 0.5, x: 10 }, 400, 225), { k: 1, x: 0, y: 0 }, 'no zoom out below 1');
eq(W.fillZoom(1600, 720), 1.25, 'fill a 20:9 screen');
s = W.shareUrl('https://mes.fm/watch', [a[0]], 0, 'My list'); eq(W.fromQuery(s.split('?')[1]).name, 'My list', 'named list link');
// channels
eq(['@veritasium','https://www.youtube.com/@mes/videos','youtube.com/channel/UCUUBq1GPBvvGNz7dpgO14Ow','https://x.com/@mes','https://www.youtube.com/watch?v=dQw4w9WgXcQ','@a'].map(W.channelRef), ['@veritasium','@mes','UCUUBq1GPBvvGNz7dpgO14Ow','','',''], 'channelRef');
let pc = W.parseMany('@veritasium https://youtu.be/dQw4w9WgXcQ youtube.com/@mes');
eq([pc.channels, pc.items.length], [['@veritasium','@mes'], 1], 'parseMany channels');
// sync merge
const V = (id, t) => Object.assign(W.item('https://youtu.be/' + id), t ? { t } : {});
const A = V('AAAAAAAAAAA'), B = V('BBBBBBBBBBB'), C = V('CCCCCCCCCCC'), Dv = V('DDDDDDDDDDD');
let base = W.snap({ q: [A, B], saved: [A], lists: [{ id: 'l1', name: 'One', items: [A] }], chans: [{ k: '@x', n: 'X' }] });
let mine = W.snap({ q: [A, B, C], saved: [], lists: [{ id: 'l1', name: 'One renamed', items: [A, C] }], chans: [{ k: '@x', n: 'X' }] });
let theirs = W.snap({ q: [B, A, Dv], saved: [A, B], lists: [{ id: 'l1', name: 'One', items: [A, Dv] }, { id: 'l2', name: 'Two', items: [B] }], chans: [] });
let mg = W.merge3(base, mine, theirs);
eq(mg.q.map(x => x.id[0]).join(''), 'BCAD', 'merge q: their order, my new item after the one it followed');
ok(mg.q.length === 4 && mg.q.some(x => x.id === 'CCCCCCCCCCC') && mg.q.some(x => x.id === 'DDDDDDDDDDD'), 'merge q keeps new items from both sides');
eq(mg.saved.map(x => x.id), ['BBBBBBBBBBB'], 'merge saved: removed here stays removed, added there kept');
eq(mg.chans, [], 'merge chans: removed there stays removed');
eq(mg.lists.map(l => [l.id, l.name, l.items.map(x => x.id[0]).join('')]), [['l1', 'One renamed', 'ACD'], ['l2', 'Two', 'B']], 'merge lists: rename + items both sides + new list');
ok(mg.lists[0].items.length === 3, 'list items from both sides');
eq(W.merge3(base, base, theirs), theirs, 'mine untouched -> theirs');
eq(W.merge3(base, mine, base), mine, 'theirs untouched -> mine');
// history: newest wins, a delete only sticks if the other side did not watch it again
const hb = [Object.assign({}, A, { pos: 10, dur: 100, at: 100 }), Object.assign({}, B, { pos: 5, dur: 100, at: 90 })];
const hm = [Object.assign({}, A, { pos: 50, dur: 100, at: 200 })];                 // B removed here
const ht = [Object.assign({}, B, { pos: 5, dur: 100, at: 90 }), Object.assign({}, A, { pos: 20, dur: 100, at: 150 })];
let hh = W.merge3({ hist: hb }, { hist: hm }, { hist: ht }).hist;
eq(hh.map(x => [x.id[0], x.pos]), [['A', 50]], 'history merge');
ht[0].at = 300; hh = W.merge3({ hist: hb }, { hist: hm }, { hist: ht }).hist;
eq(hh.map(x => x.id[0]), ['B', 'A'], 'watched again elsewhere -> kept');
let ad = W.mergeAdd(W.snap({ q: [A], saved: [], lists: [], chans: [] }), W.snap({ q: [B], saved: [C], lists: [], chans: [{ k: '@y' }] }));
eq([ad.added, ad.data.q.length], [3, 2], 'mergeAdd adds, removes nothing');
eq(W.readFile(W.fileText(base)), base, 'file round trip');
ok(W.readFile('') === null, 'empty file = nothing yet');
console.log('watch tests ok:', n);
