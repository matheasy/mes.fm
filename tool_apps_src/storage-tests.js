/* node tool_apps_src/storage-tests.js -- MES Storage Analyzer core (tool_apps_src/storage/lib.js) */
'use strict';
var S = require('./storage/lib.js');
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, msg + ' (got ' + a + ', want ' + b + ')'); }

/* fake FileSystemDirectoryHandle tree */
function F(name, size, mt) { return { kind: 'file', name: name, getFile: function () { return Promise.resolve({ size: size, lastModified: mt || 1000 }); } }; }
function Bad(name) { return { kind: 'file', name: name, getFile: function () { var e = new Error('x'); e.name = 'NotReadableError'; return Promise.reject(e); } }; }
function D(name, kids) { return { kind: 'directory', name: name, values: async function* () { for (var k of kids) yield k; } }; }
function Locked(name) { return { kind: 'directory', name: name, values: function () { return { [Symbol.asyncIterator]: function () { return { next: function () { var e = new Error('no'); e.name = 'NotAllowedError'; return Promise.reject(e); } }; } }; } }; }

(async function () {
	var tree = D('top', [
		F('a.mp4', 5000, 10), F('b.JPG', 300, 20), F('.gitignore', 10, 30),
		D('docs', [F('r.pdf', 200, 40), F('r2.pdf', 200, 50), D('empty', [D('emptier', [])]), Bad('gone.txt')]),
		D('music', [F('s.mp3', 1000, 5), F('t.mp3', 1000, 6)]),
		Locked('private')
	]);
	var progressCalls = 0;
	var raw = await S.scanHandle(tree, { onProgress: function () { progressCalls++; } });
	ok(raw, 'scan returns a result');
	eq(raw.names.length, 14, 'node count');
	for (var i = 1; i < raw.names.length; i++) ok(raw.parent[i] < i, 'parent before child for ' + raw.names[i]);
	eq(raw.errors.length, 2, 'two errors (locked folder + unreadable file)');
	ok(raw.errors.some(function (e) { return /permission/.test(e.why); }), 'permission error explained');
	ok(progressCalls >= 1, 'progress reported');

	var m = S.build(raw);
	eq(m.total[0], 5000 + 300 + 10 + 400 + 2000, 'root total');
	eq(m.files[0], 8, 'root file count includes the unreadable file');
	var docs = raw.names.indexOf('docs');
	eq(m.total[docs], 400, 'docs total');
	eq(m.files[docs], 3, 'docs files');
	eq(m.dirs[docs], 2, 'docs folders inside');
	eq(m.newest[docs], 50, 'docs newest');
	var kids0 = S.children(m, 0).map(function (i) { return raw.names[i]; });
	eq(kids0[0], 'a.mp4', 'biggest child first');
	eq(kids0[1], 'music', 'second biggest');
	eq(S.pathOf(m, raw.names.indexOf('r2.pdf')), 'top/docs/r2.pdf', 'path');
	eq(S.CATS[m.cat[raw.names.indexOf('b.JPG')]].k, 'image', 'JPG is a picture');
	eq(S.ext('.gitignore'), '', 'dot file has no extension');
	eq(S.ext('archive.tar.gz'), 'gz', 'last extension');
	eq(S.ext('noext'), '', 'no extension');

	var big = S.largestFiles(m, 3);
	eq(big.map(function (i) { return raw.names[i]; }).join(','), 'a.mp4,s.mp3,t.mp3', 'largest files');

	var bt = S.byType(m, 0);
	eq(bt.cats[0].k, 'video', 'video is biggest type');
	eq(bt.exts.filter(function (e) { return e.ext === 'mp3'; })[0].count, 2, 'mp3 count');
	eq(bt.exts.filter(function (e) { return e.ext === 'pdf'; })[0].bytes, 400, 'pdf bytes');

	var em = S.emptyFolders(m).map(function (i) { return raw.names[i]; });
	ok(em.indexOf('empty') >= 0, 'empty folder found');
	ok(em.indexOf('emptier') < 0, 'only the outermost empty folder listed');
	ok(em.indexOf('private') >= 0, 'unreadable folder counts as empty (no files seen)');

	var dg = S.sameSizeGroups(m, 1);
	eq(dg.length, 2, 'two same-size groups (pdf 200, mp3 1000)');
	eq(dg[0].size, 1000, 'groups sorted by waste');
	var split = S.splitByHash(dg[0], (function () { var h = {}; dg[0].ids.forEach(function (i) { h[i] = 'aa'; }); return h; })());
	eq(split.length, 1, 'equal hashes -> one duplicate group');
	var split2 = S.splitByHash(dg[0], { [dg[0].ids[0]]: 'aa', [dg[0].ids[1]]: 'bb' });
	eq(split2.length, 0, 'different hashes -> no duplicates');

	var ol = S.oldLarge(m, 250, 0, 100);
	eq(ol.count, 4, 'old & large: files >= 250 B older than now');
	eq(raw.names[ol.top[0]], 'a.mp4', 'old & large sorted by size');

	var sr = S.search(m, 'mp3', 10);
	eq(sr.count, 2, 'search by word');
	eq(S.search(m, '*.pdf', 10).count, 2, 'search *.pdf');
	eq(S.search(m, 'ext:pdf r2', 10).count, 1, 'search ext + word');
	eq(S.search(m, 'DOCS', 10).count, 1, 'search ignores case');
	ok(S.matcher('cafe')('Café.txt'), 'search ignores accents');

	/* fromPaths */
	var r2 = S.fromPaths([{ path: 'root/x/y/z.txt', size: 7 }, { path: 'root/x/w.png', size: 3 }, { path: 'root/top.txt', size: 1 }, { path: 'root/e', dir: true }]);
	var m2 = S.build(r2);
	eq(m2.total[0], 11, 'fromPaths total');
	eq(m2.names[0], 'root', 'fromPaths root name');
	for (i = 1; i < r2.names.length; i++) ok(r2.parent[i] < i, 'fromPaths parent first ' + r2.names[i]);
	eq(S.emptyFolders(m2).length, 1, 'fromPaths keeps an empty dir item');

	/* squarify */
	var vals = [6, 6, 4, 3, 2, 2, 1], rects = S.squarify(vals, 0, 0, 6, 4), area = 0;
	eq(rects.length, 7, 'squarify one rect per value');
	rects.forEach(function (r) {
		area += r.w * r.h;
		near(r.w * r.h, vals[r.i], 1e-9, 'area proportional for ' + r.i);
		ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 6 + 1e-9 && r.y + r.h <= 4 + 1e-9, 'inside the box');
	});
	near(area, 24, 1e-9, 'squarify fills the box');
	var worstAR = 0; rects.forEach(function (r) { worstAR = Math.max(worstAR, Math.max(r.w / r.h, r.h / r.w)); });
	ok(worstAR < 3, 'squarified (aspect ratio ' + worstAR.toFixed(2) + ')');
	eq(S.squarify([0, 0], 0, 0, 10, 10).length, 0, 'zero sizes give nothing');
	/* many values stay inside */
	var many = []; for (i = 0; i < 2000; i++) many.push(1 + (i * 7919) % 1000);
	var mr = S.squarify(many, 10, 20, 800, 500), ma = 0; mr.forEach(function (r) { ma += r.w * r.h; });
	near(ma, 400000, 1e-3, 'squarify 2000 values fills the box');

	/* sunburst */
	var arcs = S.sunburst(m, 0, 3, 0);
	var ring1 = arcs.filter(function (a) { return a.ring === 1; }), span = 0;
	ring1.forEach(function (a) { span += a.a1 - a.a0; });
	near(span, Math.PI * 2, 1e-9, 'ring 1 covers the circle');
	var sm = S.sunburst(m, 0, 3, 0.5);
	ok(sm.some(function (a) { return a.i === -1; }), 'small arcs merged');

	/* formatting */
	eq(S.fmtBytes(0), '0 B', 'fmt 0');
	eq(S.fmtBytes(1500), '1.50 KB', 'fmt KB');
	eq(S.fmtBytes(123456789), '123 MB', 'fmt MB');
	eq(S.fmtInt(1234567), '1,234,567', 'fmtInt');
	eq(S.fmtPct(0.05), '<0.1%', 'tiny pct');
	eq(S.parseSize('1.5 GB'), 1.5e9, 'parseSize GB');
	eq(S.parseSize('200k'), 200000, 'parseSize k');
	eq(S.parseSize('1 MiB'), 1048576, 'parseSize MiB');
	eq(S.parseSize('lots'), null, 'parseSize junk');
	eq(S.csvCell('=cmd'), '"=cmd"', 'CSV formula injection quoted');
	eq(S.csvCell('a,b'), '"a,b"', 'CSV comma quoted');
	var csv = S.toCSV(m, 0);
	eq(csv.split('\r\n').length - 2, m.n, 'CSV one row per node');
	ok(/top\/docs\/r\.pdf,file,200/.test(csv), 'CSV row content');
	var js = S.toJSON(m, 0, 1, 0);
	eq(js.tree.bytes, m.total[0], 'JSON root bytes');
	ok(js.tree.children && !js.tree.children.filter(function (c) { return c.name === 'docs'; })[0].children, 'JSON depth limit');
	eq(S.ageText(0, 1), 'unknown', 'ageText unknown');
	eq(S.ageText(1, 1 + 400 * 864e5), '13 months ago', 'ageText months');

	/* worker source parses */
	ok(typeof new Function(S.WORKER_SRC.replace('onmessage =', 'var onmessage =')) === 'function', 'worker source is valid JS');

	/* cancel */
	var calls = 0, cancelled = await S.scanHandle(tree, { cancelled: function () { return ++calls > 2; } });
	eq(cancelled, null, 'cancel returns null');

	/* depth limit */
	var deep = D('d0', []), cur = deep;
	for (i = 1; i < 6; i++) { var nx = D('d' + i, []); (function (p, c) { var ks = [c]; p.values = async function* () { for (var k of ks) yield k; }; })(cur, nx); cur = nx; }
	var rd = await S.scanHandle(deep, { maxDepth: 3 });
	ok(rd.errors.some(function (e) { return /Too deep/.test(e.why); }), 'depth limit reported');

	/* scale: 120k files build quickly */
	var N = 120000, items = [];
	for (i = 0; i < N; i++) items.push({ path: 'r/f' + (i % 300) + '/g' + (i % 7) + '/file' + i + '.' + ['jpg', 'mp4', 'txt'][i % 3], size: (i * 2654435761) % 100000, mtime: i });
	var t0 = Date.now(), mb = S.build(S.fromPaths(items));
	var dt = Date.now() - t0;
	ok(dt < 4000, 'build 120k files in ' + dt + ' ms');
	eq(mb.files[0], N, '120k file count');
	t0 = Date.now(); S.largestFiles(mb, 50); S.byType(mb, 0); S.sameSizeGroups(mb, 1);
	ok(Date.now() - t0 < 3000, 'lists on 120k files in ' + (Date.now() - t0) + ' ms');

	console.log(pass + ' passed, ' + fail + ' failed');
	process.exit(fail ? 1 : 0);
})();
