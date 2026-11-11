// node tool_apps_src/gallery-tests.js -- the pure part of MES Gallery (tool_apps_src/gallery/lib.js)
'use strict';
var G = require('./gallery/lib.js'), assert = require('assert'), n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } }
function near(a, b, eps, msg) { assert.ok(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ' ' + a + ' vs ' + b); }

t('kind by ending', function () {
	assert.strictEqual(G.kindOf('IMG_1.JPG'), 'image');
	assert.strictEqual(G.kindOf('a.heic'), 'image');
	assert.strictEqual(G.kindOf('clip.MOV'), 'video');
	assert.strictEqual(G.kindOf('x.mkv'), 'video');
	assert.strictEqual(G.kindOf('notes.txt'), null);
	assert.strictEqual(G.kindOf('noext', 'image/png'), 'image');
	assert.strictEqual(G.kindOf('.DS_Store'), null);
	assert.ok(G.showable('a.webp') && !G.showable('a.heic') && !G.showable('a.avi'));
});
function bytes(arr, len) { var u = new Uint8Array(len || Math.max(64, arr.length)); arr.forEach(function (b, i) { u[i] = typeof b === 'string' ? b.charCodeAt(0) : b; }); return u; }
function str(s) { return s.split(''); }
t('sniff magic bytes', function () {
	assert.deepStrictEqual(G.sniff(bytes([0xFF, 0xD8, 0xFF, 0xE0])), { kind: 'image', ext: 'jpg' });
	assert.strictEqual(G.sniff(bytes([0x89].concat(str('PNG')))).ext, 'png');
	assert.strictEqual(G.sniff(bytes(str('GIF89a'))).ext, 'gif');
	assert.strictEqual(G.sniff(bytes(str('RIFF....WEBPVP8 '))).ext, 'webp');
	assert.strictEqual(G.sniff(bytes(str('RIFF....AVI LIST'))).kind, 'video');
	assert.strictEqual(G.sniff(bytes(str('....ftypheic'))).ext, 'heic');
	assert.strictEqual(G.sniff(bytes(str('....ftypavif'))).ext, 'avif');
	assert.strictEqual(G.sniff(bytes(str('....ftypqt  '))).ext, 'mov');
	assert.strictEqual(G.sniff(bytes(str('....ftypisom'))).ext, 'mp4');
	assert.strictEqual(G.sniff(bytes([0x1A, 0x45, 0xDF, 0xA3].concat(str('....webm')))).ext, 'webm');
	assert.strictEqual(G.sniff(bytes(str('<?xml version="1.0"?><svg xmlns="x">'))).ext, 'svg');
	assert.strictEqual(G.sniff(bytes(str('hello world, plain text'))), null);
});
t('image size from headers', function () {
	var png = bytes([0x89].concat(str('PNG'), [13, 10, 26, 10, 0, 0, 0, 13], str('IHDR'), [0, 0, 0x0F, 0xA0, 0, 0, 0x0B, 0xB8]));
	assert.deepStrictEqual(G.imageSize(png), { w: 4000, h: 3000, o: 1 });
	var gif = bytes(str('GIF89a').concat([0x40, 0x01, 0xF0, 0x00]));
	assert.deepStrictEqual(G.imageSize(gif), { w: 320, h: 240, o: 1 });
	var vp8x = bytes(str('RIFF....WEBPVP8X').concat([0, 0, 0, 0, 0, 0, 0, 0, 0x7F, 0x07, 0, 0x37, 0x04, 0]));
	assert.deepStrictEqual(G.imageSize(vp8x), { w: 1920, h: 1080, o: 1 });
	// JPEG: SOI, APP1 Exif with orientation 6 (rotated 90), SOF0 3000x4000 stored -> shown 3000 wide is the stored height
	var exif = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
	var app1 = str('Exif').concat([0, 0], exif), len = app1.length + 2;
	var jpg = [0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255].concat(app1, [0xFF, 0xC0, 0, 17, 8, 0x0B, 0xB8, 0x0F, 0xA0, 3]);
	assert.deepStrictEqual(G.imageSize(bytes(jpg, 200)), { w: 3000, h: 4000, o: 6 });
	var jpg2 = [0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xC2, 0, 17, 8, 0x01, 0xE0, 0x02, 0x80, 3];
	assert.deepStrictEqual(G.imageSize(bytes(jpg2, 64)), { w: 640, h: 480, o: 1 });
	assert.strictEqual(G.imageSize(bytes([0xFF, 0xD8, 0xFF, 0xE0, 0, 60], 30)), null);
});
t('dates', function () {
	var d = new Date(G.exifDate('2024:05:01 12:34:56'));
	assert.deepStrictEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getSeconds()], [2024, 4, 1, 12, 56]);
	assert.strictEqual(G.exifDate('0000:00:00 00:00:00'), null);
	assert.strictEqual(G.exifDate(''), null);
	var n1 = new Date(G.nameDate('IMG_20240501_123456.jpg'));
	assert.deepStrictEqual([n1.getFullYear(), n1.getMonth(), n1.getDate(), n1.getHours(), n1.getMinutes()], [2024, 4, 1, 12, 34]);
	assert.ok(G.nameDate('Screenshot 2023-11-30 at 09.15.02.png'));
	assert.ok(G.nameDate('VID-20220101-WA0003.mp4'));
	assert.strictEqual(G.nameDate('IMG_1234.jpg'), null);
	assert.strictEqual(G.nameDate('20241399_bad.jpg'), null);
	assert.strictEqual(G.dateOf({ taken: 5, named: 4, mtime: 3 }), 5);
	assert.strictEqual(G.dateOf({ named: 4, mtime: 3 }), 4);
});
function it(name, o) { o = o || {}; var p = o.folder ? o.folder + '/' + name : name; return { name: name, path: p, folder: o.folder || '', kind: G.kindOf(name), ext: G.ext(name), size: o.size || 0, mtime: o.mtime || 0, taken: o.taken || 0, w: o.w, h: o.h, rkey: G.rateKey(name, o.size || 0) }; }
t('natural sort and keys', function () {
	var L = [it('IMG 10.jpg'), it('img 2.jpg'), it('IMG 1.jpg')];
	assert.deepStrictEqual(G.sortItems(L, 'name', 1).map(function (x) { return x.name; }), ['IMG 1.jpg', 'img 2.jpg', 'IMG 10.jpg']);
	assert.deepStrictEqual(G.sortItems(L, 'name', -1).map(function (x) { return x.name; })[0], 'IMG 10.jpg');
	var D = [it('a.jpg', { mtime: 300 }), it('b.jpg', { mtime: 100, taken: 500 }), it('c.jpg', { mtime: 200 })];
	assert.deepStrictEqual(G.sortItems(D, 'date', 1).map(function (x) { return x.name; }), ['c.jpg', 'a.jpg', 'b.jpg']);
	var S = [it('a.mp4', { size: 9 }), it('b.jpg', { size: 3 })];
	assert.strictEqual(G.sortItems(S, 'size', -1)[0].name, 'a.mp4');
	assert.strictEqual(G.sortItems(S, 'type', 1)[0].name, 'b.jpg');
	var R = [it('a.jpg'), it('b.jpg'), it('c.jpg')], rt = {}; rt[R[1].rkey] = { r: 5 }; rt[R[2].rkey] = { f: 1 };
	assert.deepStrictEqual(G.sortItems(R, 'rating', -1, rt).map(function (x) { return x.name; }), ['b.jpg', 'c.jpg', 'a.jpg']);
	var r1 = G.sortItems(R, 'random', 1, null, 7).map(function (x) { return x.name; }), r2 = G.sortItems(R, 'random', 1, null, 7).map(function (x) { return x.name; });
	assert.deepStrictEqual(r1, r2);
	assert.strictEqual(G.sortItems(R, 'name', 1).length, 3);
	assert.strictEqual(R[0].name, 'a.jpg'); // input not changed
});
t('filter', function () {
	var L = [it('Beach day.jpg', { folder: 'Holiday/Été' }), it('beach.mp4'), it('cat.png', { folder: 'Pets' })], rt = {};
	rt[L[2].rkey] = { f: 1, r: 4 };
	assert.strictEqual(G.filterItems(L, { q: 'beach' }).length, 2);
	assert.strictEqual(G.filterItems(L, { q: 'ete' }).length, 1);
	assert.strictEqual(G.filterItems(L, { q: 'beach -day' }).length, 1);
	assert.strictEqual(G.filterItems(L, { q: '.mp4' }).length, 1);
	assert.strictEqual(G.filterItems(L, { q: 'ext:png' }).length, 1);
	assert.strictEqual(G.filterItems(L, { kind: 'video' }).length, 1);
	assert.strictEqual(G.filterItems(L, { kind: 'image' }).length, 2);
	assert.strictEqual(G.filterItems(L, { kind: 'fav' }, rt).length, 1);
	assert.strictEqual(G.filterItems(L, { minRating: 3 }, rt).length, 1);
});
t('grouping', function () {
	var a = new Date(2024, 4, 1, 10).getTime(), b = new Date(2024, 4, 1, 20).getTime(), c = new Date(2023, 0, 5).getTime();
	var L = [it('1.jpg', { taken: a, folder: 'X' }), it('2.mp4', { mtime: b, folder: 'Y' }), it('3.jpg', { taken: c, folder: 'X' }), it('4.jpg')];
	var day = G.groupItems(L, 'day');
	assert.deepStrictEqual(day.map(function (g) { return g.items.length; }), [2, 1, 1]);
	assert.strictEqual(day[0].label, 'Wednesday, May 1, 2024');
	assert.strictEqual(day[2].label, 'No date');
	assert.strictEqual(G.groupItems(L, 'month')[0].label, 'May 2024');
	assert.deepStrictEqual(G.groupItems(L, 'year').map(function (g) { return g.key; }), ['2024', '2023', 'none']);
	assert.deepStrictEqual(G.groupItems(L, 'folder').map(function (g) { return g.label; }), ['X', 'Y', 'Top folder']);
	assert.deepStrictEqual(G.groupItems(L, 'type').map(function (g) { return g.label + g.items.length; }), ['Photos3', 'Videos1']);
	assert.strictEqual(G.groupItems(L, 'none').length, 1);
});
t('justified rows fill the width', function () {
	var asp = [1.5, 1, 0.66, 1.78, 1.33, 1.5, 0.75, 2, 1, 1.5];
	var rows = G.justify(asp.slice(), 1000, 200, 4);
	var count = 0;
	rows.forEach(function (r, k) {
		count += r.items.length;
		var last = r.items[r.items.length - 1];
		if (k < rows.length - 1) { near(last.x + last.w, 1000, 0.01, 'row ' + k + ' ends at the edge'); assert.ok(r.h <= 200 + 1e-9 && r.h > 100, 'height ' + r.h); }
		else assert.ok(r.h <= 200 + 1e-9);
		r.items.forEach(function (c, j) { if (j) near(c.x, r.items[j - 1].x + r.items[j - 1].w + 4, 0.01); });
	});
	assert.strictEqual(count, asp.length);
	near(rows[1].y, rows[0].h + 4);
	// a single very wide panorama is capped instead of making a 20 px row
	var p = G.justify([12], 1000, 200, 4); assert.ok(p[0].h >= 1000 / 6 - 1e-9);
	assert.deepStrictEqual(G.justify([], 1000, 200, 4), []);
});
t('masonry + squares', function () {
	var m = G.masonry([1, 0.5, 2, 1, 1], 900, 200, 10);
	assert.strictEqual(m.cols, 4);
	near(m.colW, (900 - 30) / 4);
	assert.strictEqual(m.pos[4].x, m.pos[2].x); // the 2:1 picture made column 3 the shortest
	m.pos.forEach(function (p) { assert.ok(p.x + p.w <= 900 + 1e-9); });
	var s = G.squares(7, 500, 100, 4);
	assert.strictEqual(s.cols, 4); near(s.size, (500 - 12) / 4); near(s.height, 2 * s.size + 4);
	assert.strictEqual(s.pos[4].x, 0); near(s.pos[4].y, s.size + 4);
});
t('page layout with group headings', function () {
	var L = [it('1.jpg', { folder: 'A', w: 400, h: 300 }), it('2.jpg', { folder: 'A', w: 300, h: 400 }), it('3.jpg', { folder: 'B', w: 400, h: 400 })];
	var groups = G.groupItems(L, 'folder');
	['justified', 'square', 'masonry', 'list'].forEach(function (v) {
		var lay = G.layout(groups, { width: 600, size: 150, gap: 4, view: v }, function (x) { return x.w / x.h; });
		assert.strictEqual(lay.tiles.length, 3, v);
		assert.strictEqual(lay.heads.length, 2, v);
		assert.ok(lay.heads[1].y > lay.tiles[0].y, v + ' second heading below the first group');
		assert.ok(lay.tiles[2].y >= lay.heads[1].y + lay.heads[1].h, v);
		assert.ok(lay.height >= lay.tiles[2].y + lay.tiles[2].h - 1e-9, v);
	});
	var flat = G.layout(G.groupItems(L, 'none'), { width: 600, size: 150, view: 'list', listH: 50 }, function () { return 1; });
	assert.strictEqual(flat.heads.length, 0); assert.strictEqual(flat.height, 150);
	var vis = G.visible(flat.tiles, 60, 90); assert.deepStrictEqual(vis, [1]);
});
t('viewer fit maths', function () {
	near(G.fitScale('fit', 4000, 3000, 1000, 1000, 0), 0.25);
	near(G.fitScale('fit', 4000, 3000, 1000, 1000, 90), 0.25);
	near(G.fitScale('fit', 4000, 2000, 1000, 1000, 90), 0.25);
	near(G.fitScale('fill', 4000, 2000, 1000, 1000, 0), 0.5);
	near(G.fitScale('fit', 200, 100, 1000, 1000, 0), 5);
	near(G.fitScale('fit', 200, 100, 1000, 1000, 0, { noUpscale: true }), 1);
	near(G.fitScale('actual', 200, 100, 1000, 1000, 0, { dpr: 2 }), 0.5);
	near(G.fitScale('custom', 200, 100, 1000, 1000, 0, { pct: 150 }), 1.5);
	var c = G.clampPan(900, -900, 1, 2000, 1000, 1000, 800, 0); near(c.x, 500); near(c.y, -100);
	var c2 = G.clampPan(50, 50, 0.1, 2000, 1000, 1000, 800, 0); near(c2.x, 0); near(c2.y, 0);
	var z = G.zoomAbout(0, 0, 1, 2, 100, 50); near(z.s, 2); near(z.x, -100); near(z.y, -50);
	near(G.zoomAbout(0, 0, 30, 2, 0, 0, 0.1, 40).s, 40);
});
t('video speed + A-B loop', function () {
	near(G.speedStep(1, 1), 1.1); near(G.speedStep(1, -1), 0.9); near(G.speedStep(0.3, -1), 0.25); near(G.speedStep(4, 1), 4);
	near(G.speedStep(1.25, 1, 0.25), 1.5);
	assert.strictEqual(G.fmtSpeed(1), '1×'); assert.strictEqual(G.fmtSpeed(0.25), '0.25×'); assert.strictEqual(G.fmtSpeed(1.1), '1.1×');
	assert.strictEqual(G.abCheck(5, 2, 4), 2); assert.strictEqual(G.abCheck(3, 2, 4), null); assert.strictEqual(G.abCheck(1, 2, 4), 2);
	assert.strictEqual(G.abCheck(5, 2, null), null); assert.strictEqual(G.abCheck(5, 4, 4), null);
	assert.deepStrictEqual(G.setAB({}, 'a', 3), { a: 3, b: undefined });
	assert.deepStrictEqual(G.setAB({ a: 3 }, 'b', 7, 6), { a: 3, b: 6 });
	assert.deepStrictEqual(G.setAB({ a: 5 }, 'b', 2), { a: 2, b: 5 });
	assert.deepStrictEqual(G.setAB({ a: 1, b: 4 }, 'a', 6), { a: 6, b: null });
	near(G.posterTime(60), 5); near(G.posterTime(10), 1); near(G.posterTime(0.3), 0.15); near(G.posterTime(NaN), 0.5);
	assert.strictEqual(G.nextIndex(0, 5, -1, true), 4); assert.strictEqual(G.nextIndex(4, 5, 1, false), 4); assert.strictEqual(G.nextIndex(2, 5, 1), 3);
});
t('formatters + paths', function () {
	assert.strictEqual(G.fmtBytes(999), '999 B'); assert.strictEqual(G.fmtBytes(1500), '1.5 KB'); assert.strictEqual(G.fmtBytes(2345678), '2.35 MB');
	assert.strictEqual(G.fmtDur(65), '1:05'); assert.strictEqual(G.fmtDur(3725), '1:02:05'); assert.strictEqual(G.fmtTime(1.5, true), '0:01.50');
	assert.strictEqual(G.mp(4000, 3000), '12 MP');
	assert.deepStrictEqual(G.splitPath('Photos/2024/a.jpg', true), { name: 'a.jpg', folder: '2024' });
	assert.deepStrictEqual(G.splitPath('a.jpg', true), { name: 'a.jpg', folder: '' });
	assert.strictEqual(G.thumbKey({ path: 'x/a.jpg', size: 5, mtime: 9 }, 480), 'x/a.jpg|5|9|480');
	var s = G.summary([it('a.jpg', { size: 10, mtime: 5 }), it('b.mp4', { size: 20, mtime: 9 })]);
	assert.deepStrictEqual([s.images, s.videos, s.bytes, s.first, s.last], [1, 1, 30, 5, 9]);
	assert.strictEqual(G.plural(1, 'photo'), '1 photo'); assert.strictEqual(G.plural(1200, 'photo'), '1,200 photos');
});
t('hidden files and duplicates', function () {
	var a = it('x.jpg', { size: 10, mtime: 1 }), b = it('x.jpg', { size: 10, mtime: 2 }), c = it('y.jpg', { size: 11, mtime: 3 }), d = it('z.jpg', { size: 10, mtime: 0, folder: 'f' });
	assert.notStrictEqual(G.hideKey(a), G.hideKey(b)); assert.ok(G.sameFile(a, it('x.jpg', { size: 10, mtime: 1 })));
	var H = {}; H[G.hideKey(a)] = 1;
	assert.deepStrictEqual(G.filterItems([a, b, c], { hidden: H }).map(function (x) { return x.mtime; }), [2, 3]);
	assert.deepStrictEqual(G.filterItems([a, b, c], { hidden: H, kind: 'hidden' }), [a]);
	assert.strictEqual(G.sizeBuckets([a, b, c, d]).length, 1);
	a.hash = b.hash = d.hash = 'h'; c.hash = 'h';
	var sets = G.dupSets([a, b, c, d]);
	assert.strictEqual(sets.length, 1); assert.strictEqual(sets[0][0], d); assert.strictEqual(sets[0].length, 3);
	d._dup = 1; d._dupN = 3; assert.strictEqual(G.groupItems([d], 'dup')[0].label, 'Same picture: 3 copies');
});
console.log(n + ' test groups passed' + (process.exitCode ? ' (with failures above)' : ''));
