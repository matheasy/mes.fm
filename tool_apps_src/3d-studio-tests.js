// node tool_apps_src/3d-studio-tests.js  -- pure maths of MES 3D Studio (lib.js = MES3D)
'use strict';
var M = require('./3d-studio/lib.js');
var fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log('FAIL ' + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= (tol || 1e-6), msg + ' (got ' + a + ', want ' + b + ')'); }

// a closed axis-aligned box as a triangle soup, outward facing
function boxSoup(w, d, h, x0, y0, z0) {
	x0 = x0 || 0; y0 = y0 || 0; z0 = z0 || 0;
	var v = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]].map(function (p) { return [p[0] + x0, p[1] + y0, p[2] + z0]; });
	var f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
	var out = [];
	f.forEach(function (t) { t.forEach(function (i) { out.push(v[i][0], v[i][1], v[i][2]); }); });
	return new Float32Array(out);
}

// lengths
near(M.parseLength('20'), 20, 0, 'plain number is mm');
near(M.parseLength('2 cm'), 20, 1e-9, 'cm');
near(M.parseLength('1in'), 25.4, 1e-9, 'inch');
near(M.parseLength('1"'), 25.4, 1e-9, 'inch mark');
near(M.parseLength('1/2 in'), 12.7, 1e-9, 'fraction of an inch');
near(M.parseLength('10*2 + 5'), 25, 1e-9, 'arithmetic');
near(M.parseLength('-3,5'), -3.5, 1e-9, 'decimal comma and minus');
near(M.parseLength('(10+5) cm'), 150, 1e-9, 'unit after brackets');
near(M.parseLength('2', 'in'), 50.8, 1e-9, 'default unit inch');
near(M.parseLength('1 cm + 5'), 15, 1e-9, 'mixed: unitless part uses the default unit');
ok(isNaN(M.parseLength('abc')), 'garbage is NaN');
ok(isNaN(M.parseLength('')), 'empty is NaN');
ok(isNaN(M.parseLength('5 kg')), 'unknown unit is NaN');
ok(M.fmtLength(12.5) === '12.5 mm', 'fmt mm');
ok(M.fmtLength(25.4, 'in') === '1 in', 'fmt in: ' + M.fmtLength(25.4, 'in'));
ok(M.fmtLength(20, 'cm') === '2 cm', 'fmt cm');
near(M.snap(7.3, 5), 5, 0, 'snap'); near(M.snap(7.6, 0.5), 7.5, 1e-9, 'snap half');

// volume / area / box
var b = boxSoup(10, 20, 30);
var va = M.volumeArea(b);
near(va.volume, 6000, 1e-3, 'box volume');
near(va.area, 2 * (200 + 300 + 600), 1e-3, 'box area');
var bb = M.bboxOf(b);
ok(bb.size[0] === 10 && bb.size[1] === 20 && bb.size[2] === 30, 'bbox size');
var flipped = M.flipWinding(new Float32Array(b));
near(M.volumeArea(flipped).volume, -6000, 1e-3, 'flipped volume is negative');

// manifold check
var mc = M.manifoldCheck(b);
ok(mc.closed && mc.triangles === 12 && mc.vertices === 8 && mc.edges === 18 && mc.shells === 1, 'closed box: ' + JSON.stringify(mc));
var open = b.slice(0, b.length - 9);
var mo = M.manifoldCheck(open);
ok(!mo.closed && mo.boundary === 3, 'one triangle missing leaves 3 open edges: ' + JSON.stringify(mo));
var bad = new Float32Array(b); for (var k = 0; k < 3; k++) { var t = bad[3 + k]; bad[3 + k] = bad[6 + k]; bad[6 + k] = t; }
var mf = M.manifoldCheck(bad);
ok(!mf.closed && mf.flipped === 3 && mf.boundary === 0, 'one flipped triangle: ' + JSON.stringify(mf));
var two = new Float32Array(b.length * 2); two.set(b); two.set(boxSoup(5, 5, 5, 50, 0, 0), b.length);
var m2 = M.manifoldCheck(two);
ok(m2.closed && m2.shells === 2, 'two separate boxes: two closed shells');
var touching = new Float32Array(b.length * 2); touching.set(b); touching.set(boxSoup(10, 20, 30, 10, 0, 0), b.length);
var mt = M.manifoldCheck(touching);
ok(!mt.closed && mt.nonManifold > 0, 'boxes sharing a face are non-manifold');
var withDeg = new Float32Array(b.length + 9); withDeg.set(b); withDeg.set([1, 1, 1, 1, 1, 1, 2, 2, 2], b.length);
ok(M.manifoldCheck(withDeg).degenerate === 1 && M.manifoldCheck(withDeg).closed, 'degenerate triangles are ignored');
var w = M.weld(new Float32Array([0, 0, 0, 0.00001, 0, 0, 1, 0, 0]), 1e-3);
ok(w.verts.length === 6, 'weld merges near points');

// T-junction: a box whose top face is split along an edge on one side only (like a boolean result) is still closed
(function () {
	// unit cube; the front edge of the top (y=0, z=1) gets an extra vertex at x=0.5 on the top face only
	var V = { a: [0, 0, 0], b: [1, 0, 0], c: [1, 1, 0], d: [0, 1, 0], e: [0, 0, 1], f: [1, 0, 1], g: [1, 1, 1], h: [0, 1, 1], m: [0.5, 0, 1] };
	var F = [['a', 'c', 'b'], ['a', 'd', 'c'], ['a', 'b', 'f'], ['a', 'f', 'e'], ['b', 'c', 'g'], ['b', 'g', 'f'], ['c', 'd', 'h'], ['c', 'h', 'g'], ['d', 'a', 'e'], ['d', 'e', 'h'],
		['e', 'm', 'h'], ['m', 'g', 'h'], ['m', 'f', 'g']];
	var arr = []; F.forEach(function (t) { t.forEach(function (k) { arr.push.apply(arr, V[k]); }); });
	var soupT = new Float32Array(arr);
	near(M.volumeArea(soupT).volume, 1, 1e-6, 't-junction cube volume');
	var r = M.manifoldCheck(soupT);
	ok(r.boundary === 3 && r.tjunctions === 3 && r.gaps === 0 && r.closed, 't-junction is not a gap: ' + JSON.stringify(r));
	var cut = soupT.slice(0, soupT.length - 9);   // now a real hole
	var r2 = M.manifoldCheck(cut);
	ok(!r2.closed && r2.gaps > 0, 'a missing triangle is still a gap: ' + JSON.stringify(r2));
})();

// overhangs: a box standing on the floor has none; lifted, its bottom is all overhang
var oh = M.overhang(b, 45, 0);
ok(oh.area === 0, 'box on the floor: no overhang');
var lifted = boxSoup(10, 20, 30, 0, 0, 5);
var oh2 = M.overhang(lifted, 45, 0);
near(oh2.area, 200, 1e-3, 'floating box: bottom is overhang');
ok(oh2.flags.reduce(function (a, v) { return a + v; }, 0) === 2, 'two bottom triangles flagged');
// a 30 degree slope (from horizontal) facing down is an overhang at 45; at 70 degrees allowed it is not
var s30 = Math.tan(30 * Math.PI / 180);
var slope = new Float32Array([0, 0, 5, 0, 10, 5 + 10 * s30, 10, 0, 5]);
ok(M.volumeArea(slope).area > 0 && M.overhang(slope, 45, 0).flags[0] === 1, 'slope 30 degrees below horizontal is an overhang');
ok(M.overhang(slope, 70, 0).flags[0] === 0, '...but allowed when 70 degrees are allowed');

// plate fit
var plate = M.plateById('ender3');
ok(plate.x === 220 && plate.z === 250, 'ender plate');
ok(M.plateById('custom', { x: 100, y: 50, z: 30 }).y === 50, 'custom plate');
var fit = M.plateFit({ min: [-50, -50, 0], max: [50, 50, 40] }, plate);
ok(fit.fits && !fit.floating, 'fits');
var tall = M.plateFit({ min: [-50, -50, 0], max: [50, 50, 300] }, plate);
ok(!tall.fits && Math.abs(tall.over.top - 50) < 1e-9, 'too tall by 50');
var off = M.plateFit({ min: [80, -10, 0], max: [130, 10, 10] }, plate);
ok(!off.fits && off.fitsSize && Math.abs(off.over.right - 20) < 1e-9, 'fits in size but hangs over the right edge');
var turn = M.plateFit({ min: [-120, -60, 0], max: [120, 60, 10] }, M.plateById('mk4'));
ok(turn.fitsSize, 'mk4 240x120 fits');
var turn2 = M.plateFit({ min: [-100, -120, 0], max: [100, 120, 10] }, M.plateById('mk4'));
ok(!turn2.fitsSize && turn2.fitsIfTurned, 'mk4: 200 x 240 fits when turned 90 degrees');
ok(M.plateFit({ min: [-5, -5, -2], max: [5, 5, 5] }, plate).below, 'below the floor');
ok(M.plateFit({ min: [-5, -5, 2], max: [5, 5, 5] }, plate).floating, 'floating');

// filament: a 20 mm solid cube at 100% infill = 8 cm3 = 9.92 g of PLA
var cube = M.volumeArea(boxSoup(20, 20, 20));
var f100 = M.filament(cube, { material: 'pla', infill: 100, diameter: 1.75, price: 20 });
near(f100.used, 8000, 1e-6, 'solid cube volume');
near(f100.grams, 9.92, 1e-9, 'PLA grams');
near(f100.metres, 8000 / (Math.PI * 1.75 * 1.75 / 4) / 1000, 1e-9, 'filament metres');
near(f100.cost, 9.92 / 1000 * 20, 1e-9, 'cost');
var f15 = M.filament(cube, { material: 'pla', infill: 15, wall: 0.8 });
near(f15.shell, 2400 * 0.8, 1e-9, 'shell = area x wall');
near(f15.used, 1920 + (8000 - 1920) * 0.15, 1e-6, 'infill part');
ok(M.filament({ volume: 10, area: 1000 }, { infill: 0 }).used === 10, 'shell never more than the volume');
ok(M.filament(cube, { material: 'resin' }).metres === 0, 'resin has no filament length');
ok(M.materialById('nope').id === 'pla', 'unknown material = PLA');

// 2D shapes
near(M.polyArea(M.roundedRect(40, 20, 0)), 800, 1e-9, 'rect area');
ok(M.polyArea(M.roundedRect(40, 20, 5)) > 0 && M.polyArea(M.roundedRect(40, 20, 5)) < 800, 'rounded rect smaller, ccw');
near(M.polyArea(M.roundedRect(40, 20, 5, 64)), 800 - (4 - Math.PI) * 25, 0.05, 'rounded rect area');
near(M.polyArea(M.circlePts(10, 360)), Math.PI * 100, 0.1, 'circle area');
ok(M.starPts(5, 10, 4).length === 10, 'star corners');
var hb = M.bounds2(M.heartPts(30));
near(Math.max(hb.w, hb.h), 30, 1e-6, 'heart size'); ok(M.polyArea(M.heartPts(30)) > 0, 'heart ccw');
var g = M.gearPts(20, 2);
ok(g.pitch === 20 && g.tip === 22 && Math.abs(g.root - 17.5) < 1e-9 && g.pts.length === 120, 'gear radii');
ok(M.polyArea(M.ccw([[0, 0], [0, 1], [1, 1], [1, 0]])) > 0, 'ccw reorders');
var sq = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
near(M.polyArea(M.offsetPolygon(sq, 1)), 144, 1e-9, 'offset square out by 1');
near(M.polyArea(M.offsetPolygon(sq, -1)), 64, 1e-9, 'offset square in by 1');
ok(M.cleanProfile([[-2, 3], [4, NaN], [5, 6]]).length === 2 && M.cleanProfile([[-2, 3]])[0][0] === 0, 'clean profile');
near(M.polyArea(M.polygonPts(6, 10)), 3 * Math.sqrt(3) / 2 * 100, 1e-9, 'hexagon area');

// 3MF
var xml = M.threeMFModel([{ name: 'Box <1>', positions: boxSoup(10, 10, 10), color: '#ff0000' }, { name: 'B', positions: boxSoup(5, 5, 5, 20, 0, 0), color: 'bad' }], 'Test & co');
ok(xml.indexOf('unit="millimeter"') > 0 && xml.indexOf('Box &lt;1&gt;') > 0 && xml.indexOf('Test &amp; co') > 0, '3mf escapes and units');
ok((xml.match(/<vertex /g) || []).length === 16 && (xml.match(/<triangle /g) || []).length === 24, '3mf welds vertices');
ok(xml.indexOf('displaycolor="#FF0000"') > 0 && xml.indexOf('displaycolor="#9CA3AF"') > 0, '3mf colours');
ok((xml.match(/<item objectid/g) || []).length === 2, '3mf build items');

// base64
var f = new Float32Array([1.5, -2.25, 3e6, 0, 7]);
var back = M.b64ToF32(M.f32ToB64(f));
ok(back.length === 5 && back.every(function (v, i) { return v === f[i]; }), 'float32 base64 round trip');
var bytes = new Uint8Array([1, 2, 3, 4, 250]);
ok(M.bytesToB64(bytes) === Buffer.from(bytes).toString('base64'), 'base64 matches node');
ok(M.b64ToBytes(Buffer.from('hi!!x').toString('base64')).length === 5, 'base64 decode length');

// align / distribute
var boxes = [{ min: [0, 0, 0], max: [10, 1, 1] }, { min: [20, 0, 0], max: [24, 1, 1] }, { min: [50, 0, 0], max: [60, 1, 1] }];
var al = M.alignShifts(boxes, 0, 'min');
ok(al[0] === 0 && al[1] === -20 && al[2] === -50, 'align left');
var am = M.alignShifts(boxes, 0, 'mid');
ok(am[0] === 25 && am[1] === 8 && am[2] === -25, 'align centre');
var ds = M.distributeShifts(boxes, 0);
ok(ds[0] === 0 && Math.abs(ds[1] - (30 - 22)) < 1e-9 && ds[2] === 0, 'distribute');

// project validation
var o1 = { type: 'box', pos: [0, 0, 5], rot: [0, 0, 0], scl: [1, 1, 1], p: {} };
ok(M.validProject({ app: 'mes-3d-studio', objs: [o1, { type: 'group', pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], children: [o1] }] }), 'valid project');
ok(!M.validProject({ app: 'other', objs: [] }), 'wrong app');
ok(!M.validProject({ app: 'mes-3d-studio', objs: [{ type: 'evil', pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1] }] }), 'unknown type');
ok(!M.validProject({ app: 'mes-3d-studio', objs: [{ type: 'box', pos: [0, 0, 'x'], rot: [0, 0, 0], scl: [1, 1, 1] }] }), 'bad number');
ok(M.safeName('a/b:c?') === 'a b c', 'safe name');

// ---------- picture -> relief ----------
(function () {
	var w = 10, h = 6, H = new Float32Array(w * h), m = M.shapeMask('rect', w, h);
	var flat = M.reliefMesh(H, m, w, h, { cell: 2, base: 3, height: 5 });
	near(M.volumeArea(flat).volume, 20 * 12 * 3, 1e-3, 'flat relief = a 20 x 12 x 3 box');
	var mc = M.manifoldCheck(flat); ok(mc.closed && mc.boundary === 0 && mc.shells === 1, 'flat relief is watertight ' + JSON.stringify(mc).slice(0, 120));
	var bb = M.bboxOf(flat); near(bb.min[2], 0, 1e-6, 'sits on the plate'); near(bb.max[2], 3, 1e-6, 'base height');
	for (var i = 0; i < H.length; i++) H[i] = 1;
	near(M.volumeArea(M.reliefMesh(H, m, w, h, { cell: 2, base: 3, height: 5 })).volume, 20 * 12 * 8, 1e-3, 'full height = base + relief');
	near(M.volumeArea(M.reliefMesh(H, m, w, h, { cell: 2, base: 2, height: 5, twoSided: true })).volume, 20 * 12 * 12, 1e-3, 'two-sided = mirrored');
	// a bumpy circle with a hole and a corner-only contact still closes
	var W = 40, Hh = 30, rnd = 1, hm = new Float32Array(W * Hh); for (i = 0; i < hm.length; i++) { rnd = (rnd * 16807) % 2147483647; hm[i] = rnd / 2147483647; }
	var cm = M.shapeMask('circle', W, Hh); cm[15 * W + 20] = 0; cm[0] = 1; cm[W + 1] = 1;
	var clean = M.cleanMask(cm, W, Hh, { largest: false, holes: 0 });
	var soup = M.reliefMesh(M.normHeights(hm, clean, W, Hh, { blur: 1 }), clean, W, Hh, { cell: 1, base: 1, height: 4, border: 2 });
	var c2 = M.manifoldCheck(soup); ok(c2.closed && c2.boundary === 0 && c2.flipped === 0, 'bumpy circle with a hole is watertight ' + JSON.stringify(c2).slice(0, 160));
	ok(M.volumeArea(soup).volume > 0, 'outward facing');
	var two = M.reliefMesh(hm, clean, W, Hh, { cell: 1, base: 1, height: 4, twoSided: true }), c3 = M.manifoldCheck(two); ok(c3.closed && c3.boundary === 0, 'two-sided bumpy is watertight');
	// cleanMask: largest piece + small holes
	var a = new Uint8Array(100); for (i = 0; i < 100; i++) { var x = i % 10, y = (i / 10) | 0; a[i] = (x >= 1 && x <= 6 && y >= 1 && y <= 6 && !(x === 3 && y === 3)) || (x === 9 && y === 9) ? 1 : 0; }
	var cl = M.cleanMask(a, 10, 10, { largest: true, holes: 4 }); ok(cl[99] === 0, 'stray piece dropped'); ok(cl[33] === 1, 'small hole filled');
	var dg = M.cleanMask(new Uint8Array([1, 0, 0, 1]), 2, 2, { largest: false }); ok(dg[1] + dg[2] === 1, 'corner contact joined');
	// normHeights
	var nh = M.normHeights(new Float32Array([0, 5, 10]), null, 3, 1, { lo: 0, hi: 1 }); near(nh[0], 0, 1e-6, 'norm low'); near(nh[1], 0.5, 1e-6, 'norm mid'); near(nh[2], 1, 1e-6, 'norm high');
	near(M.normHeights(new Float32Array([0, 5, 10]), null, 3, 1, { lo: 0, hi: 1, invert: true })[0], 1, 1e-6, 'invert');
	var rs = M.resampleGrid(new Float32Array([0, 1, 2, 3]), 4, 1, 2, 1); near(rs[0], 0.5, 1e-6, 'shrink averages'); near(rs[1], 2.5, 1e-6, 'shrink averages 2');
	var g = M.reliefGrid(4000, 3000, 60000); ok(g.w * g.h <= 60500 && Math.abs(g.w / g.h - 4 / 3) < 0.02, 'grid keeps aspect');
	var dist = M.edgeDistance(M.shapeMask('rect', 9, 9), 9, 9); near(dist[4 * 9 + 4], 5, 1e-6, 'edge distance at the centre');
	ok(Object.keys(M.RELIEF_PRESETS).length >= 5, 'presets');
})();

console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
