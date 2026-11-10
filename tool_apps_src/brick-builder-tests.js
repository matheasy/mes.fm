// node tool_apps_src/brick-builder-tests.js
var M = require('./brick-builder/lib.js'), EX = require('./brick-builder/templates.js'), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log('FAIL', m); } }
// rotation keeps the footprint inside its rotated size and is a bijection
M.PARTS.forEach(function (d) { for (var r = 0; r < 4; r++) { var sz = M.size(d, r), seen = {}; for (var i = 0; i < d.w; i++) for (var j = 0; j < d.d; j++) { var o = M.rot(d, r, i, j); ok(o[0] >= 0 && o[1] >= 0 && o[0] < sz[0] && o[1] < sz[1], d.id + ' rot ' + r); seen[o] = 1; } ok(Object.keys(seen).length === d.w * d.d, d.id + ' bijection ' + r); } });
ok(Math.abs(M.BY.b2x4.mass - 2.4) < 0.01, 'brick mass');
ok(M.BY.a1x4.vox.length === 3 + 3 + 2, 'arch 1x4 voxels: legs full, middle top only');
// gravity stacking
var w = new M.World(16);
w.add({ t: 'b2x4', x: 2, y: w.dropY('b2x4', 0, 2, 2), z: 2, r: 0, c: 0 });
ok(w.dropY('b2x2', 0, 3, 2) === 3, 'drops onto a brick');
ok(w.dropY('p1x1', 0, 9, 9) === 0, 'drops to the floor');
ok(w.placeY('b1x1', 0, 0, 0, 5) === 0, 'floating placement falls');
var hang = w.placeY('b1x1', 0, 2, 2, 0); ok(hang === 3, 'occupied falls on top');
// tipping and grip
var a = new M.World(32);
a.add({ t: 'b2x2', x: 10, y: 0, z: 10, r: 0, c: 0 });
var arm = a.add({ t: 'p1x8', x: 10, y: 3, z: 10, r: 0, c: 0 });
var r1 = M.analyze(a, { anchored: true, loads: {} });
ok(r1.stress[arm.u] > 0 && r1.stress[arm.u] < 1, 'cantilever arm small stress ' + r1.stress[arm.u]);
var r2 = M.analyze(a, { anchored: true, loads: (function () { var L = {}; L[arm.u] = 2000; return L; })() });
ok(r2.max >= 1, '2 kg on a cantilever fails ' + r2.max);
var r3 = M.analyze(a, { anchored: true, clutch: 0, loads: {} });
ok(r3.max === Infinity || r3.max >= 1, 'no grip: overhanging plate falls');
// deeper decks are stiffer
var t = EX.filter(function (e) { return e.id === 'thin-thick'; })[0].make(), tw = new M.World(32); tw.load(t.parts);
var L = {}; t.loads.forEach(function (x) { L[tw.parts[x[0]].u] = x[1]; });
var rt = M.analyze(tw, { loads: L }), thin = tw.parts[t.loads[0][0]].u, bottomThick = tw.parts[t.loads[1][0] - 4].u;
ok(rt.stress[thin] > 3 * rt.stress[bottomThick], 'thick deck stiffer: ' + rt.stress[thin].toFixed(3) + ' vs ' + rt.stress[bottomThick].toFixed(3));
// every example loads completely, stands, nothing floats
EX.forEach(function (e) {
	var m = e.make(), ww = new M.World(32); ww.load(m.parts);
	ok(ww.parts.length === m.parts.length && m.parts.length > 3, e.id + ' parts ' + m.parts.length);
	var LL = {}; (m.loads || []).forEach(function (x) { LL[ww.parts[x[0]].u] = x[1]; });
	var res = M.analyze(ww, { anchored: m.anchored !== false, clutch: M.CLUTCH[m.grip || 'normal'], loads: LL });
	ok(!res.floating.length, e.id + ' floating ' + res.floating.length);
	ok(res.max < 1 && !res.tips, e.id + ' stands: max ' + res.max.toFixed(2) + (res.tips ? ' TIPS' : '') + ' ' + (res.why[res.weakest] || ''));
	ok(M.decode(M.encode(m.parts)).length === m.parts.length, e.id + ' save code');
	if (m.test != null) { var bl = M.breakLoad(ww, ww.parts[m.test].u, { anchored: m.anchored !== false, clutch: M.CLUTCH[m.grip || 'normal'], loads: LL }); console.log('  ', e.id, 'breaks at', M.fmtG(bl.g), bl.why || ''); }
});
ok(M.decode('1:zzz,1,1,1,1,1;b1x1,1,2,3,0,0').length === 1, 'decode skips bad parts');
ok(M.decode('nope') === null, 'decode rejects');
console.log(n - bad + '/' + n + ' passed'); if (bad) process.exit(1);
