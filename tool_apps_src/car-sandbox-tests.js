/* node tool_apps_src/car-sandbox-tests.js : checks the pure parts of MES Car Sandbox (lib.js = MESCar) */
"use strict";
var C = require("./car-sandbox/lib.js"), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL:", m); } }
function near(a, b, e, m) { ok(Math.abs(a - b) <= e, m + " (" + a + " vs " + b + ")"); }
// worlds + cars are complete
C.WORLD_ORDER.forEach(function (w) { var W = C.WORLDS[w]; ok(W && W.g >= 0 && W.size > 100 && W.n > 10 && C.CARS[W.car], "world " + w); });
C.CAR_ORDER.forEach(function (k) { var c = C.CARS[k]; ok(c.mass > 0 && c.wr > 0 && c.wf > c.wb && c.F > 0 && c.vmax > 0 && c.l > c.wf - c.wb, "car " + k); ok(c.wx * 2 <= c.w + c.ww + 0.8, "track fits " + k); });
// track: continuous, closed, distance 0 on the line
var L = C.trackLength(), prev = C.trackPoint(0), maxStep = 0;
for (var s = 1; s <= L; s += 1) { var p = C.trackPoint(s); maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.z - prev.z)); prev = p; near(C.trackDist(p.x, p.z), 0, 1e-6, "on line at " + s); }
ok(maxStep < 1.01, "track continuous " + maxStep);
near(Math.hypot(C.trackPoint(L).x - C.trackPoint(0).x, C.trackPoint(L).z - C.trackPoint(0).z), 0, 1e-6, "track closed");
// direction matches movement
for (s = 5; s < L; s += 37) { var a = C.trackPoint(s), b = C.trackPoint(s + 0.5); near(C.wrap(C.yawOf(b.x - a.x, b.z - a.z) - a.dir), 0, 0.02, "dir at " + s); }
// terrain: deterministic, flat on the track, start areas flat
C.WORLD_ORDER.forEach(function (w) {
	var T = C.makeTerrain(w), T2 = C.makeTerrain(w);
	ok(T.height(13.3, -27.1) === T2.height(13.3, -27.1), "deterministic " + w);
	ok(Math.abs(T.height(0, 0)) < 0.6 && Math.abs(T.height(3, 2)) < 0.8, "start flat " + w + " " + T.height(0, 0));
	var H = C.heightGrid(T), mx = -1e9, mn = 1e9; for (var i = 0; i < H.length; i++) { mx = Math.max(mx, H[i]); mn = Math.min(mn, H[i]); ok(isFinite(H[i]), "finite"); if (!isFinite(H[i])) break; }
	ok(mx - mn > 3 && mx < 400, "relief " + w + " " + mn.toFixed(1) + ".." + mx.toFixed(1));
	near(C.gridHeight(T, H, -T.size / 2, -T.size / 2), H[0], 1e-6, "grid corner " + w);
	var step = T.size / T.n; near(C.gridHeight(T, H, -T.size / 2 + step * 3, -T.size / 2 + step * 5), H[3 * (T.n + 1) + 5], 1e-5, "grid node " + w);
});
var TE = C.makeTerrain("earth");
for (s = 0; s < L; s += 23) { var q = C.trackPoint(s); ok(Math.abs(TE.height(q.x, q.z)) < 0.05, "track flat at " + s); }
// craters stay off the start
C.craters("moon").forEach(function (c) { ok(Math.hypot(c.x, c.z) >= 30 + c.R, "crater clear"); });
ok(C.craters("moon").length > 30, "moon has craters");
// stunt pieces + planks
C.WORLD_ORDER.forEach(function (w) { C.statics(w).forEach(function (st) { ok(["ramp", "loop", "block", "pipe"].indexOf(st.t) >= 0 && isFinite(st.x + st.z + st.yaw), "static " + w); }); });
var lp = C.loopPlanks(9, 7, 40); ok(lp.length === 40, "loop planks"); near(Math.max.apply(null, lp.map(function (p) { return p.y; })), 18, 0.1, "loop height");
ok(lp[39].x > lp[0].x + 7, "loop corkscrew offset");
ok(C.rampPoints(4, 10, 2).length === 18, "ramp points");
// layouts
Object.keys(C.LAYOUTS).forEach(function (k) { var l = C.layout(k, C.rng(3)); ok(l.length > 3, "layout " + k); l.forEach(function (o) { ok(o.k === "brick" || C.OBJECTS[o.k], "obj kind " + o.k); ok(o.y > 0, "above ground"); }); });
// AI: target dead ahead -> straight + throttle; to the left (+x when facing +z) -> positive steer
var d = C.aiDrive({ x: 0, z: 0, yaw: 0, v: 0 }, 0, 50, { vmax: 20 }); near(d.steer, 0, 1e-9, "ai straight"); ok(d.throttle > 0, "ai goes");
ok(C.aiDrive({ x: 0, z: 0, yaw: 0, v: 5 }, 20, 20, {}).steer > 0, "ai turns left towards +x");
ok(C.aiDrive({ x: 0, z: 0, yaw: 0, v: 5 }, -20, 20, {}).steer < 0, "ai turns right");
ok(C.aiDrive({ x: 0, z: 0, yaw: 0, v: 30 }, 0, 50, { vmax: 20 }).brake > 0, "ai brakes when too fast");
var ct = C.cruiseTarget("earth", 0, C.TRACK.cz + C.TRACK.r, 0, 18); near(ct.x, 18, 1e-6, "cruise ahead x"); near(ct.z, C.TRACK.cz + C.TRACK.r, 1e-6, "cruise ahead z");
var ct2 = C.cruiseTarget("moon", 70, 0, 0, 10); near(Math.hypot(ct2.x, ct2.z), 70, 1e-6, "cruise circle");
// physics helpers
near(C.feltG(0, 0, 0, -9.80665), 1, 1e-9, "1 g at rest"); near(C.feltG(0, -9.80665, 0, -9.80665), 0, 1e-9, "free fall 0 g");
var j = C.jump(20, Math.PI / 4, 9.81), jm = C.jump(20, Math.PI / 4, 1.62); near(j.range, 400 / 9.81, 1e-9, "range"); near(jm.range / j.range, 9.81 / 1.62, 1e-9, "moon jump 6x");
ok(C.jump(10, 0.3, 0).range === Infinity, "zero g never lands");
near(C.stopDist(20, 1, 9.81), 400 / 19.62, 1e-9, "stop dist");
ok(C.engineForce(1000, 0, 50) === 1000 && C.engineForce(1000, 50, 50) === 0 && C.engineForce(1000, 25, 50) < 1000, "engine taper");
ok(C.engineForce(1000, 50, 50, true) > 0, "boost passes top speed");
near(C.dragForce(1.225, 0.62, 30), 0.5 * 1.225 * 0.62 * 900, 1e-9, "drag"); ok(C.dragForce(0, 1, 30) === 0, "no air no drag");
ok(C.fmtSpeed(27.7778) === "100 km/h" && C.fmtSpeed(26.8224, "mph") === "60 mph", "speed format");
ok(C.gName(1.62) === "Moon" && C.gName(5) === null, "g names");
// links
var qs = C.query({ world: "moon", car: "rover", g: 3.71, traffic: 4, ai: "chase" }), back = C.parseQuery(qs);
ok(back.world === "moon" && back.car === "rover" && back.g === 3.71 && back.traffic === 4 && back.ai === "chase", "query round trip " + qs);
ok(!C.parseQuery("w=nope&car=x&g=-1&cars=99").world && C.parseQuery("w=nope&g=-1&cars=99").g === undefined, "bad query ignored");
ok(C.query({ world: "earth", car: "sports", g: 9.81 }).indexOf("g=") < 0, "default g left out");
ok(C.query({ world: "earth", car: null, g: null }) === "w=earth", "no car = left out");
// track nearest point: inverse of trackPoint, also a little off the line
for (s = 0; s < L; s += 7.3) { var tp = C.trackPoint(s), nr = C.trackNearest(tp.x, tp.z); near(Math.min(Math.abs(nr.s - s), L - Math.abs(nr.s - s)), 0, 1e-6, "nearest s at " + s); near(nr.d, 0, 1e-6, "nearest d"); var off = C.trackNearest(tp.x + Math.cos(tp.dir) * 4, tp.z - Math.sin(tp.dir) * 4); near(Math.min(Math.abs(off.s - s), L - Math.abs(off.s - s)), 0, 0.2, "offset s at " + s); near(off.d, 4, 1e-6, "offset d"); }
// laps: drive two laps along the line
var st = C.lapNew(), evs = [], tt = 0;
for (s = -20; s < 2 * L + 10; s += 2) { tt += 0.1; var q2 = C.trackPoint(s), nn = C.trackNearest(q2.x, q2.z); C.lapStep(st, nn.s, nn.d, tt).forEach(function (e) { evs.push(e); }); }
var kinds = evs.map(function (e) { return e.t; }).join(",");
ok(kinds === "start,sector,sector,sector,lap,sector,sector,sector,lap", "lap events " + kinds);
var lap1 = evs.filter(function (e) { return e.t === "lap"; })[0]; near(lap1.time, L / 2 * 0.1, 0.11, "lap time"); ok(lap1.splits.length === 4 && lap1.splits[3] === lap1.time, "splits");
// shortcut across the infield (skip a quarter) does not count
var st2 = C.lapNew(), ev2 = [], t2 = 0;
[ -5, 2, 40, 500, 700, 760, L - 3, 3 ].forEach(function (sv) { t2 += 5; var p3 = C.trackPoint(sv), n3 = C.trackNearest(p3.x, p3.z); C.lapStep(st2, n3.s, n3.d, t2).forEach(function (e) { ev2.push(e.t); }); });
ok(ev2.indexOf("lap") < 0, "shortcut lap rejected " + ev2.join(","));
// driving the wrong way says so
var st3 = C.lapNew(), ev3 = []; [10, 5, L - 5, L - 10].forEach(function (sv, i) { var p4 = C.trackPoint(sv), n4 = C.trackNearest(p4.x, p4.z); C.lapStep(st3, n4.s, n4.d, i).forEach(function (e) { ev3.push(e.t); }); });
ok(ev3.indexOf("wrong") >= 0, "wrong way");
ok(C.fmtLap(61.234) === "1:01.23" && C.fmtLap(9.5) === "0:09.50", "lap format");
console.log(bad ? bad + " of " + n + " checks failed" : "all " + n + " checks passed"); process.exit(bad ? 1 : 0);
