// node tool_apps_src/bridge-builder-tests.js
var B = require('./bridge-builder/lib.js');
var fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log('FAIL', msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), msg + ' got ' + a + ' want ' + b); }

// 1. triangle: apex dead load P -> each diagonal C = P / (2 sin th)
var tri = {span: 12, gap: 6, nodes: [{x: 0, y: 0}, {x: 6, y: 4}, {x: 12, y: 0}], members: [{a: 0, b: 2, m: 'road', s: 3}, {a: 0, b: 1, m: 'steel', s: 4}, {a: 1, b: 2, m: 'steel', s: 4}]};
var r = B.analyze(tri, {traffic: {veh: 'car', n: 1, gap: 5}});
ok(!r.err, 'triangle analyses');
var P = B.nodeMasses(tri)[1] * B.G, th = Math.atan2(4, 6);
near(r.members[1].Nd, -P / (2 * Math.sin(th)), 1e-6, 'triangle diagonal force');
near(r.members[0].Nd, 0, 1e-6, 'road between two anchors carries nothing');
// one free node: frequencies from the 2x2 problem
var k = B.MATS.steel.E * B.sizeInfo('steel', 4).A / Math.hypot(6, 4), c = Math.cos(th), s = Math.sin(th), m = B.nodeMasses(tri)[1];
var kxx = 2 * k * c * c, kyy = 2 * k * s * s, fl = [Math.sqrt(kxx / m) / 2 / Math.PI, Math.sqrt(kyy / m) / 2 / Math.PI].sort(function (a, b) { return a - b; });
near(r.modes[0].f, fl[0], 1e-4, 'mode 1 frequency'); near(r.modes[1].f, fl[1], 1e-4, 'mode 2 frequency');
// mechanism: a road chain alone folds
var chain = {span: 12, gap: 6, nodes: [{x: 0, y: 0}, {x: 6, y: 0}, {x: 12, y: 0}], members: [{a: 0, b: 1, m: 'road', s: 3}, {a: 1, b: 2, m: 'road', s: 3}]};
ok(B.analyze(chain).err === 'mech', 'a plain road chain is a mechanism');

// 2. every template analyses and auto-sizes to a passing bridge
[[30, 12], [60, 30], [120, 40]].forEach(function (site) {
  B.TYPES.forEach(function (t) {
    var S = site[0], h = B.defaultDepth(t[0], S);
    var md = B.template(t[0], S, site[1], h);
    var too = md.members.some(function (e) { return B.memberLen(md, e) > B.MATS[e.m].maxL + 1e-6; });
    if (too && S > 60) return; // long-member templates at long spans are filtered by cheapest()
    var a = B.autoSize(md, {traffic: {veh: 'car', n: 3, gap: 6}, sf: 1.5});
    ok(!a.res.err, t[0] + ' ' + S + ' m analyses (' + a.res.err + ')');
    if (!a.res.err) ok(a.res.ok, t[0] + ' ' + S + ' m auto-sizes to a pass (worst ' + a.res.worst.toFixed(2) + ', weak ' + a.weak.length + ')');
  });
});

// 3. Pratt: top chord in compression, bottom chord (road) in tension at mid-span
var pr = B.autoSize(B.template('pratt', 40, 15, 6), {traffic: {veh: 'bus', n: 2, gap: 8}}).model, ar = B.analyze(pr, {traffic: {veh: 'bus', n: 2, gap: 8}});
var topMid = -1, botMid = -1;
pr.members.forEach(function (e, i) {
  var A = pr.nodes[e.a], Bn = pr.nodes[e.b], xm = (A.x + Bn.x) / 2;
  if (Math.abs(xm - 20) < 3.5 && A.y > 5 && Bn.y > 5) topMid = i;
  if (Math.abs(xm - 20) < 3.5 && A.y === 0 && Bn.y === 0) botMid = i;
});
ok(topMid >= 0 && ar.members[topMid].Nd < 0, 'pratt top chord compressed');
ok(botMid >= 0 && ar.members[botMid].Nd > 0, 'pratt bottom chord pulled');
ok(ar.liveDefl > 0 && ar.liveDefl < 40 / 100, 'live deflection sensible: ' + ar.liveDefl);
// deeper truss -> smaller chord forces
var p6 = B.analyze(B.template('pratt', 40, 15, 4)), p12 = B.analyze(B.template('pratt', 40, 15, 8));
function maxComp(res) { return Math.min.apply(null, res.members.map(function (q) { return q.Nd; })); }
ok(-maxComp(p12) < -maxComp(p6), 'deeper truss has smaller chord compression');

// 4. cheapest search
var rows = B.cheapest(30, 12, {traffic: {veh: 'car', n: 3, gap: 6}}, ['warren', 'pratt', 'howe'], [4, 6, 8]);
ok(rows.length >= 6 && rows[0].ok, 'cheapest returns passing designs');
ok(rows.every(function (q, i) { return i === 0 || !q.ok || !rows[i - 1].ok || q.cost >= rows[i - 1].cost; }), 'cheapest sorted by cost');

// 5. share code round trip
var w = B.autoSize(B.template('warren', 24, 10, 4), {}).model, w2 = B.decode(B.encode(w));
ok(w2 && w2.members.length === w.members.length && w2.nodes.length === w.nodes.length, 'encode / decode');
near(B.cost(w2).total, B.cost(w).total, 1e-6, 'decoded cost');
ok(B.decode('nonsense') === null && B.decode('1|99999,1|0,0|') === null, 'bad codes refused');

// 6. quake signal peak = PGA
['shake', 'soft', 'pulse', 'sine'].forEach(function (q) {
  var sg = B.quakeSignal(q, 0.4, {f: 1.2}), pk = 0;
  for (var t = 0; t < sg.end; t += 0.005) pk = Math.max(pk, Math.abs(sg.a(t)));
  near(pk, 0.4 * B.G, 0.02, q + ' quake peak acceleration');
  ok(Math.abs(sg.u(sg.end + 1.9)) < 0.05, q + ' ground comes back');
});

// 7. dynamic sim: a passing bridge stands still, carries traffic, and a weak one breaks
var good = B.autoSize(B.template('pratt', 30, 12, 5), {traffic: {veh: 'bus', n: 2, gap: 8}}).model;
var gr = B.analyze(good, {traffic: {veh: 'bus', n: 2, gap: 8}});
var sim = new B.Sim(good, {analysis: gr});
sim.advance(2);
ok(sim.broken === 0 && Math.abs(sim.midDefl()) < 0.01, 'unloaded bridge stays put (' + sim.midDefl() + ')');
sim = new B.Sim(good, {analysis: gr, traffic: {veh: 'bus', n: 2, gap: 8, speed: 50}});
for (var i = 0; i < 400 && !sim.finished(); i++) sim.advance(0.05);
ok(sim.broken === 0 && sim.crossed === 2, 'buses cross (crossed ' + sim.crossed + ', broken ' + sim.broken + ', t ' + sim.t.toFixed(1) + ')');
var weak = B.clone(good); weak.members.forEach(function (e) { if (!B.MATS[e.m].road) e.s = 0; });
sim = new B.Sim(weak, {analysis: B.analyze(weak), traffic: {veh: 'truck', n: 2, gap: 8, speed: 50}});
for (i = 0; i < 300 && !sim.finished(); i++) sim.advance(0.05);
ok(sim.broken > 0 && sim.fell > 0, 'tiny members break under trucks (broken ' + sim.broken + ', fell ' + sim.fell + ')');
// earthquake runs
sim = new B.Sim(good, {analysis: gr, quake: {pga: 0.3, type: 'shake', dur: 4}});
for (i = 0; i < 300 && !sim.finished(); i++) sim.advance(0.05);
ok(isFinite(sim.midDefl()) && sim.t > 4, 'quake sim finite');
// sim dead-load deflection matches the static one (no jump at the start)
console.log(n - fails + '/' + n + ' passed');
process.exit(fails ? 1 : 0);
