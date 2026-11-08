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
eq(W.fromQuery(s.split('?')[1]), { links: ['https://www.youtube.com/watch?v=AAAAAAAAAAA'], t: 42 }, 'share one');
s = W.shareUrl('https://mes.fm/watch', a);
eq(W.fromQuery('?' + s.split('?')[1]).links.length, 3, 'share many');
eq(W.atTime(a[0], 90.4), 'https://www.youtube.com/watch?v=AAAAAAAAAAA&t=90s', 'atTime');
eq([W.fmt(65), W.fmt(3725)], ['1:05', '1:02:05'], 'fmt');
eq(W.ago(0, 3 * 3600e3), '3 h ago', 'ago');
console.log('watch tests ok:', n);
