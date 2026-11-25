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
// ghost poses
var gh = [C.ghostSample(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), C.ghostSample(1, { x: 10, y: 2, z: -4 }, { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 })];
var gp = C.ghostPose(gh, 0.5); near(gp.x, 5, 1e-9, "ghost x"); near(gp.z, -2, 1e-9, "ghost z"); near(Math.hypot.apply(null, gp.q), 1, 1e-9, "ghost q unit");
ok(C.ghostPose(gh, 1.5) === null && C.ghostPose([], 0) === null, "ghost out of range");
// stunts
ok(C.stuntName(-2 * Math.PI, 0, 0).name === "backflip", "backflip " + C.stuntName(-2 * Math.PI, 0, 0).name);
ok(C.stuntName(4.1 * Math.PI, 0, 0).name === "Double front flip", "double front flip");
ok(C.stuntName(0, 0, 2.1 * Math.PI).name === "barrel roll", "barrel roll");
ok(C.stuntName(0, 2 * Math.PI, 0).name === "360° spin", "360");
ok(C.stuntName(0.5, 0.4, 0.3).name === "", "no stunt for wobbles");
ok(C.stuntName(-6.4, 3.3, 0).name === "backflip + 180", "flip + 180");
// weather
C.WORLD_ORDER.forEach(function (w) { var l = C.weatherFor(w); ok(l[0] === "clear" && l.every(function (k) { return C.WEATHER[k]; }), "weather list " + w); });
ok(C.weatherFor("moon").length === 1 && C.weatherFor("ceres").length === 1, "no weather without air");
ok(C.weatherFor("mars").indexOf("dust") >= 0 && C.weatherFor("earth").indexOf("rain") >= 0, "weather per world");
Object.keys(C.WEATHER).forEach(function (k) { var x = C.WEATHER[k]; ok(x.grip > 0 && x.grip <= 1 && x.fog > 0 && x.fog <= 1, "weather " + k); });
near(C.stopDist(27.78, C.WEATHER.snow.grip, 9.81) / C.stopDist(27.78, 1, 9.81), 1 / 0.32, 1e-9, "snow stops 3x longer");
ok(C.parseQuery("w=earth&wx=snow").weather === "snow" && C.parseQuery("wx=nope").weather === undefined, "wx query");
ok(C.query({ world: "earth", weather: "rain" }).indexOf("wx=rain") >= 0 && C.query({ world: "moon", weather: "rain" }).indexOf("wx") < 0, "wx in links only where possible");
// time of day
var base = C.WORLDS.earth.sun;
ok(C.sunAt(12, base).elev > 0.85 && C.sunAt(12, base).day === 1 && C.sunAt(12, base).sunK === 1, "noon is full day");
ok(C.sunAt(0, base).elev < -0.85 && C.sunAt(0, base).day === 0 && C.sunAt(0, base).moonK === 1, "midnight is night");
near(C.sunAt(6, base).elev, 0, 1e-9, "sunrise at 6"); near(C.sunAt(18, base).elev, 0, 1e-9, "sunset at 18");
ok(C.sunAt(18.05, base).dusk > 0.8 && C.sunAt(12, base).dusk === 0 && C.sunAt(2, base).dusk === 0, "dusk colours only near sunset");
var d1 = C.sunAt(9, base).dir, d2 = C.sunAt(15, base).dir; ok(Math.abs(d1[0] - d2[0]) + Math.abs(d1[2] - d2[2]) > 0.5, "sun moves across the sky");
for (var hh = 0; hh < 24; hh += 0.37) { var sa = C.sunAt(hh, base); near(Math.hypot(sa.dir[0], sa.dir[1], sa.dir[2]), 1, 1e-9, "sun dir unit"); ok(sa.day >= 0 && sa.day <= 1 && !(sa.sunK > 0 && sa.moonK > 0), "sun / moon light never both at " + hh); }
ok(C.fmtTime(13.5) === "13:30" && C.fmtTime(24.25) === "00:15" && C.fmtTime(-1) === "23:00", "time format");
ok(C.timeName(12) === "Midday" && C.timeName(18) === "Sunset" && C.timeName(23) === "Night", "time names");
ok(C.parseQuery("t=19.5").tod === 19.5 && C.parseQuery("t=30").tod === undefined, "t query");
ok(C.query({ world: "earth", tod: 19.5 }).indexOf("t=19.5") >= 0 && C.query({ world: "earth", tod: 13 }).indexOf("t=") < 0, "t in links");
// game speed + driving feel in links
ok(C.parseQuery("spd=2").speed === 2 && C.parseQuery("spd=7").speed === undefined && C.parseQuery("dr=arcade").drive === "arcade" && C.parseQuery("dr=x").drive === undefined, "speed / drive query");
ok(C.query({ world: "earth", speed: 1.5, drive: "real" }).indexOf("spd=1.5") >= 0 && C.query({ world: "earth", speed: 1, drive: "fast" }).indexOf("spd") < 0 && C.query({ world: "earth", drive: "real" }).indexOf("dr=real") >= 0, "speed / drive in links");
ok(C.DRIVE_ORDER.every(function (k) { var D = C.DRIVE[k]; return D.F >= 1 && D.v >= 1 && D.grip >= 1; }), "driving feels never weaker than real");
// map pieces
C.PIECE_ORDER.forEach(function (k) {
	var p = C.newPiece(k, 12, -7, 0.7), R = C.pieceRect(p), cs = C.pieceCorners(p);
	ok(p.t && C.SHAPE_PARAMS[p.t], "piece shape " + k);
	ok(C.pieceHit(p, (cs[0][0] + cs[2][0]) / 2, (cs[0][1] + cs[2][1]) / 2) && !C.pieceHit(p, 12 + 500, -7), "piece hit " + k);
	var w = C.toWorld(p, 3, -2), l = C.toLocal(p, w[0], w[1]); near(l[0], 3, 1e-9, "local x " + k); near(l[1], -2, 1e-9, "local z " + k);
	near(Math.hypot(cs[0][0] - cs[1][0], cs[0][1] - cs[1][1]), 2 * R.hx, 1e-9, "rect width " + k);
	C.prismParts(p).forEach(function (pt) { ok(pt.prof.length >= 3 && pt.prof.every(function (q) { return q[1] >= 0 && isFinite(q[0]); }), "prism profile " + k); });
	var bad2 = Object.assign({}, p); (C.SHAPE_PARAMS[p.t] || []).forEach(function (q) { bad2[q] = 1e9; }); C.clampPiece(bad2); ok((C.SHAPE_PARAMS[p.t] || []).every(function (q) { return bad2[q] <= C.PARAMS[q][2]; }), "clamp " + k);
});
near(C.toWorld({ x: 0, z: 0, yaw: Math.PI / 2 }, 0, 10)[0], 10, 1e-9, "yaw 90° faces +x");
ok(C.prismParts(C.newPiece("whoops", 0, 0, 0)).length === 6 && C.prismParts(C.newPiece("gap", 0, 0, 0))[1].flip === true, "whoops count / gap landing");
// roads
var sq = C.roadPath([[0, 0], [100, 0], [100, 100], [0, 100]], true, 2);
ok(sq.L > 380 && sq.L < 460 && sq.closed, "closed road length " + sq.L);
var pp = C.pathPoint(sq, 50), nn = C.pathNearest(sq, pp.x, pp.z); near(nn.s, 50, 1.5, "nearest = point"); ok(nn.d < 0.5, "on the road");
near(C.pathPoint(sq, sq.L + 10).x, C.pathPoint(sq, 10).x, 1e-6, "closed road wraps");
var op = C.roadPath([[0, 0], [50, 0]], false, 2); near(op.L, 50, 0.01, "straight open road"); near(C.pathPoint(op, 25).x, 25, 0.01, "midpoint");
var lp = C.lapNew(), evs = [], tt = 0; for (var round = 0; round < 3.3; round += 0.01) { var ss = (round * sq.L) % sq.L; C.lapStep(lp, ss, 0, tt += 0.1, sq.L, 10).forEach(function (e) { evs.push(e.t); }); }
ok(lp.laps === 2 && evs.indexOf("lap") >= 0, "laps on a drawn circuit: " + lp.laps);
// layouts + map links
["earth", "moon", "mars"].forEach(function (w) {
	C.MAP_PRESETS.forEach(function (pr) {
		var m = C.mapPreset(pr[0], w), d = C.mapDecode(C.mapEncode(m));
		ok(d && d.p.length === m.p.length && d.r.length === m.r.length && d.oval === (m.oval !== false), "map link round trip " + w + " " + pr[0]);
		d.p.forEach(function (p, i) { near(p.x, m.p[i].x, 0.06, "piece x"); near(p.yaw, m.p[i].yaw, 0.01, "piece yaw"); ok(p.t === m.p[i].t, "piece shape kept"); });
		var half = C.WORLDS[w].size / 2 - 30; ok(m.p.every(function (p) { return Math.abs(p.x) < half && Math.abs(p.z) < half; }), "layout inside the world " + w + " " + pr[0]);
	});
});
ok(C.mapPreset("race", "earth").oval === false && C.mapPreset("race", "earth").r[0].closed, "race layout = closed road, oval off");
ok(C.mapDecode("!!!") === null && C.mapDecode("e30") === null, "bad map links ignored");
ok(C.lapKey("earth", "sports", 9.81, "dr:fast") === "earth|sports|9.81|dr:fast" && C.lapKey("earth", "sports", 9.81) === "earth|sports|9.81", "lap keys");
// pads
var spr = C.newPiece("spring", 0, 0, 0), lpd = C.newPiece("launchpad", 0, 0, 0), bst = C.newPiece("boost", 0, 0, Math.PI / 2);
ok(C.padLaunch(spr, { x: 3, y: -1, z: 0 }, false, 1).y === spr.v, "spring throws up by itself");
ok(C.padLaunch(spr, { x: 0, y: 0, z: 0 }, false, -1).y === -spr.v, "spring follows flipped gravity");
ok(C.padLaunch(lpd, { x: 0, y: 0, z: 0 }, false, 1) === null && C.padLaunch(lpd, { x: 0, y: 0, z: 0 }, true, 1).y === lpd.v, "launch pad waits for the button");
var bv = C.padLaunch(bst, { x: 5, y: 0, z: 0 }, false, 1); near(bv.x, bst.v, 1e-9, "boost along its direction"); ok(C.padLaunch(bst, { x: 60, y: 0, z: 0 }, false, 1) === null, "boost never slows");
near(C.springHeight(20, 9.81), 400 / 19.62, 1e-9, "spring height");
ok(C.mapDecode(C.mapEncode({ p: [spr, lpd, bst], r: [] })).p.map(function (p) { return p.pad; }).join() === "spring,press,boost", "pads survive a map link");
// ---------- aircraft ----------
C.PLANE_ORDER.forEach(function (k) {
	var P = C.CARS[k], A = P.fly; ok(C.isPlane(k) && !C.isPlane("sports"), "isPlane " + k);
	ok(P.wf > P.wb && P.wb < 0 && P.wf > 0, k + ": nose wheel ahead of the centre of mass, main wheels just behind it (tricycle)");
	// lift curve: continuous at the stall, biggest at the stall angle, falls after it
	[0, 1, 2].forEach(function (f) {
		var aP = A.aS + A.flap[f][2], a = C.liftCoef(A, aP - 1e-6, f), b = C.liftCoef(A, aP + 1e-6, f), c = C.liftCoef(A, aP + 0.15, f);
		near(a.CL, b.CL, 1e-4, k + " lift continuous at the stall, flaps " + f); ok(c.CL < a.CL * 0.85 && c.s > 0.5, k + " lift falls after the stall, flaps " + f);
		ok(C.liftCoef(A, 0.05, f).s === 0, k + " not stalled at 3 degrees");
	});
	ok(C.liftCoef(A, 0.1, 2).CL > C.liftCoef(A, 0.1, 0).CL, k + " flaps add lift");
	ok(C.dragCoef(A, 0.1, 2, 0.8, 0) > C.dragCoef(A, 0.1, 0, 0.8, 0), k + " flaps add drag");
	ok(C.dragCoef(A, 0.1, 0, 1.2, 0) > C.dragCoef(A, 0.1, 0, 0.4, 0), k + " more lift = more induced drag");
	// no air: no lift, no control, only the engine
	var m = C.aero(A, { x: 0, y: -3, z: 40 }, { x: 0.3, y: 0.2, z: 0.4 }, { elev: 1, ail: 1, rud: 1, flap: 0, thr: 1 }, 0);
	ok(m.F.y === 0 && m.F.x === 0 && m.T.x === 0 && m.T.y === 0 && m.T.z === 0 && m.F.z > 0, k + " on the Moon only thrust, no lift or control");
	ok(C.stallSpeed(A, P.mass, 1.62, 0, 0) === Infinity, k + " Moon: can never fly");
	// level flight is symmetric
	var e = C.aero(A, { x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 0 }, { elev: 0, ail: 0, rud: 0, flap: 0, thr: 0.5 }, 1.225);
	ok(Math.abs(e.T.y) < 1e-9 && Math.abs(e.T.z) < 1e-9 && Math.abs(e.F.x) < 1e-9, k + " no roll / yaw / side force when flying straight");
	ok(e.F.y > 0, k + " lift is up at a positive wing setting");
	// controls push the right way; damping opposes turns; weathervane turns the nose into the airflow
	var base = { elev: 0, ail: 0, rud: 0, flap: 0, thr: 0.5 }, vb = { x: 0, y: 0, z: 60 }, w0 = { x: 0, y: 0, z: 0 };
	ok(C.aero(A, vb, w0, Object.assign({}, base, { elev: 1 }), 1.225).T.x < e.T.x, k + " stick back = nose up (-X torque)");
	ok(C.aero(A, vb, w0, Object.assign({}, base, { ail: 1 }), 1.225).T.z > 0, k + " right aileron = roll right (+Z torque)");
	ok(C.aero(A, vb, w0, Object.assign({}, base, { rud: 1 }), 1.225).T.y < 0, k + " right rudder = nose right (-Y torque)");
	ok(C.aero(A, vb, { x: 0, y: 0, z: 1 }, base, 1.225).T.z < 0, k + " roll damping");
	ok(C.aero(A, vb, { x: -1, y: 0, z: 0 }, base, 1.225).T.x > e.T.x, k + " pitch damping");
	ok(C.aero(A, { x: 6, y: 0, z: 60 }, w0, base, 1.225).T.y > 0, k + " sliding left turns the nose left (weathervane)");
	ok(C.aero(A, { x: 6, y: 0, z: 60 }, w0, base, 1.225).T.z > 0, k + " dihedral rolls away from a slide");
	// pitch is statically stable: more angle of attack = more nose-down moment
	var lo = C.aero(A, { x: 0, y: -2, z: 60 }, w0, base, 1.225), hi = C.aero(A, { x: 0, y: -8, z: 60 }, w0, base, 1.225);
	ok(hi.T.x > lo.T.x && hi.alpha > lo.alpha, k + " stable in pitch");
	// damping cap: one step can never reverse a fast roll
	var unc = C.aero(A, { x: 0, y: 0, z: 200 }, { x: 0, y: 0, z: 5 }, base, 1.225), cap = C.aero(A, { x: 0, y: 0, z: 200 }, { x: 0, y: 0, z: 5 }, base, 1.225, 1 / 60, A.I);
	ok(Math.abs(cap.T.z) <= Math.abs(unc.T.z) + 1e-9 && Math.abs(cap.T.z) / A.I[2] / 60 <= 5 * 0.8 + 1e-6, k + " damping capped so one step never reverses a roll");
	// speeds on Earth, Mars, Jupiter-g
	var vsE = C.stallSpeed(A, P.mass, 9.81, 1.225, 0), vsF = C.stallSpeed(A, P.mass, 9.81, 1.225, 2), vsM = C.stallSpeed(A, P.mass, 3.71, 0.02, 0);
	ok(vsF < vsE, k + " flaps lower the stall speed");
	near(vsM / vsE, Math.sqrt((3.71 / 0.02) / (9.81 / 1.225)), 1e-9, k + " Mars stall speed ratio = sqrt((g/rho) ratio)");
	ok(C.topSpeed(A, P.mass, 9.81, 1.225) > vsE * 1.6, k + " flies well above its stall speed on Earth");
});
var LP = C.CARS.plane.fly, JT = C.CARS.jet.fly;
near(C.stallSpeed(LP, 1100, 9.81, 1.225, 0) * 3.6, 92, 8, "light plane stalls near 90 km/h clean (Cessna 172: ~87)");
near(C.topSpeed(LP, 1100, 9.81, 1.225) * 3.6, 225, 25, "light plane tops out near 225 km/h (Cessna 172: ~226)");
ok(C.topSpeed(LP, 1100, 24.79, 1.225) === 0, "light plane cannot hold itself up at Jupiter's gravity");
ok(C.topSpeed(JT, 4800, 24.79, 1.225) > C.stallSpeed(JT, 4800, 24.79, 1.225, 0), "the jet can fly at Jupiter's gravity");
ok(C.stallSpeed(LP, 1100, 3.71, 0.02, 0) * 3.6 > 400, "Mars: the light plane would need over 400 km/h");
near(C.thrust(LP, 0, 1), LP.T0, 1e-9, "static thrust"); near(C.thrust(LP, 60, 1), LP.eta * LP.P / 60, 1e-9, "propeller thrust = eta P / v");
ok(C.thrust(LP, 30, 0.5) === C.thrust(LP, 30, 1) / 2 && C.thrust(LP, 30, -1) === 0, "throttle scales thrust");
// a 2-D longitudinal flight: take-off roll distance + a stable climb
function fly2d(A, mass, secs, ctlf) {
	var st = { x: 0, y: 0, vx: 0, vy: 0, th: 0, q: 0, air: false, rotX: null, liftX: null }, dt = 1 / 240, g = 9.81, maxH = 0;
	for (var i = 0; i < secs / dt; i++) {
		var t = i * dt, ctl = ctlf(st, t), f = [Math.cos(st.th), Math.sin(st.th)], u = [-Math.sin(st.th), Math.cos(st.th)];
		var vb = { x: 0, y: st.vx * u[0] + st.vy * u[1], z: st.vx * f[0] + st.vy * f[1] }, o = C.aero(A, vb, { x: -st.q, y: 0, z: 0 }, ctl, 1.225, dt, A.I);
		var Fx = o.F.z * f[0] + o.F.y * u[0], Fy = o.F.z * f[1] + o.F.y * u[1] - mass * g, M = -o.T.x;
		if (st.y <= 0) { var N = Math.max(0, -Fy); Fy += N; Fx -= 0.02 * N; if (st.vy < 0) st.vy = 0; if (st.th < 0) { st.th = 0; st.q = Math.max(0, st.q); } M = Math.max(M, 0) - (st.th <= 0 ? 0 : 0); }
		st.vx += Fx / mass * dt; st.vy += Fy / mass * dt; st.q += M / A.I[0] * dt; st.q *= st.y <= 0 ? 0.9 : 1; st.th += st.q * dt; st.x += st.vx * dt; st.y = Math.max(0, st.y + st.vy * dt);
		if (st.y > 0.5 && st.liftX == null) st.liftX = st.x;
		maxH = Math.max(maxH, st.y);
	}
	st.maxH = maxH; return st;
}
var to = fly2d(LP, 1100, 40, function (s) { var v = Math.hypot(s.vx, s.vy); return { thr: 1, flap: 1, elev: v > 27 ? Math.max(-0.4, Math.min(0.6, (0.14 - s.th) * 3 - s.q)) : 0 }; });
ok(to.liftX != null && to.liftX > 120 && to.liftX < 400, "light plane lifts off in a few hundred metres (" + Math.round(to.liftX) + " m)");
ok(to.y > 60 && to.th > 0 && to.th < 0.5, "and climbs steadily (" + Math.round(to.y) + " m after 40 s)");
// attitude
var at = C.attitude({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }); near(at.pitch, 0, 1e-9, "level pitch"); near(at.bank, 0, 1e-9, "level bank");
var r = 0.5, bk = C.attitude({ x: 0, y: 0, z: 1 }, { x: -Math.sin(r), y: Math.cos(r), z: 0 }); near(bk.bank, r, 1e-9, "bank right = + (up vector leans right = -X)");
near(C.attitude({ x: 0, y: Math.sin(0.3), z: Math.cos(0.3) }, { x: 0, y: Math.cos(0.3), z: -Math.sin(0.3) }).pitch, 0.3, 1e-9, "nose up = +");
ok(C.landingRate(0.5).indexOf("Butter") === 0 && C.landingRate(5) === "Hard landing" && C.landingRate(9) === "Crash landing", "landing grades");
ok(C.onRunway(C.RUNWAY.x + 200, C.RUNWAY.z) && !C.onRunway(0, 0), "runway area");
var terE = C.makeTerrain("earth"), h0 = terE.height(C.RUNWAY.x - 200, C.RUNWAY.z), h1 = terE.height(C.RUNWAY.x + 200, C.RUNWAY.z + 10);
near(h0, 0, 1e-9, "runway flat (west end)"); near(h1, 0, 1e-9, "runway flat (east end)");
ok(C.parseQuery("w=earth&car=plane").car === "plane", "plane in a link");
// ---------- online: codes, packets, interpolation, events ----------
var rr = 0.123; function rnd() { rr = (rr * 9301 + 49297) % 233280 / 233280; return rr; }
for (var ci = 0; ci < 50; ci++) { var cd = C.netCode(rnd); ok(C.netCodeOk(cd), "room code " + cd); ok(C.netPeerOk(C.netPeerId(rnd)), "peer id"); }
ok(!C.netCodeOk("abcde1") && !C.netCodeOk("ABCDEF") && !C.netCodeOk("abcdefg"), "bad room codes refused (1, capitals, length)");
ok(C.netParseCode("https://mes.fm/car-sandbox?room=k7m2pq") === "k7m2pq" && C.netParseCode(" K7M-2PQ ") === "k7m2pq" && C.netParseCode("hello") === null, "codes from links / typed");
ok(C.netName("  <b>Bob</b>‮  ") === "bBob/b" && C.netName("") === "Driver" && C.netName("x".repeat(40)).length === 20, "names cleaned");
var st0 = { slot: 3, seq: 70000, t: 123456.7, type: "jet", brake: true, boost: false, air: true, thr: 0.6, flap: 2, p: [12.5, -3.25, 4000.125], q: [0.1, 0.7, -0.2, 0.67], v: [30, -2, 5], w: [[0.31, 0.2, 7.5], [-0.1, -0.33, -1], [0, 0, 3.14], [0.2, 0, 0]] };
var pk = C.netEncode(st0); ok(pk.byteLength === C.NET.LEN, "packet is " + C.NET.LEN + " bytes");
var de = C.netDecode(pk);
ok(de && de.slot === 3 && de.seq === 70000 - 65536 && de.t === 123457 && de.type === "jet" && de.brake && !de.boost && de.air && de.flap === 2, "packet header round trip");
near(de.thr, 0.6, 0.003, "throttle"); near(de.p[2], 4000.125, 1e-3, "position"); near(de.v[0], 30, 1e-4, "velocity");
var qn0 = Math.hypot.apply(null, st0.q); for (var qi = 0; qi < 4; qi++) near(de.q[qi], st0.q[qi] / qn0, 1e-4, "quaternion " + qi);
near(de.w[0][0], 0.31, 1e-3, "wheel height"); near(de.w[1][1], -0.33, 1e-4, "steer"); near(Math.cos(de.w[0][2]), Math.cos(7.5), 1e-3, "wheel turn kept modulo 2 pi");
ok(C.netDecode(new ArrayBuffer(10)) === null && C.netDecode(new ArrayBuffer(C.NET.LEN)) === null, "junk packets refused");
var bad1 = C.netEncode(st0); new DataView(bad1).setUint8(8, 200); ok(C.netDecode(bad1) === null, "unknown vehicle refused");
var bad2 = C.netEncode(st0); new DataView(bad2).setFloat32(12, NaN); ok(C.netDecode(bad2) === null, "NaN refused");
ok(C.netDecode(C.netSetSlot(pk, 5)).slot === 5 && C.netDecode(pk).slot === 3, "host rewrites the slot on a copy");
// clock offset follows the fastest packet
var est = {}; C.netClock(est, 1000, 5100); C.netClock(est, 1100, 5180); ok(est.off === 4080, "clock takes the fastest packet");
C.netClock(est, 1200, 5400); ok(est.off > 4080 && est.off < 4081, "clock creeps up slowly " + est.off);
// buffer: order, duplicates, length
var bf = []; [100, 300, 200, 300].forEach(function (t) { C.netPush(bf, { t: t }); }); ok(bf.map(function (x) { return x.t; }).join() === "100,200,300", "buffer sorted, duplicate dropped");
for (var bi = 0; bi < 60; bi++) C.netPush(bf, { t: 400 + bi }); ok(bf.length === 40, "buffer capped");
// interpolation
function snap(t, x, yaw, vx) { return { t: t, p: [x, 1, 0], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], v: [vx || 0, 0, 0], w: [[0.2, 0, 0], [0.2, 0, 0], [0.2, 0, 0], [0.2, 0, 6]], type: "sports" }; }
var ib = [snap(0, 0, 0, 10), snap(100, 1, 0.4, 10), snap(200, 2, 0.8, 10)];
var sm = C.netSample(ib, 150); near(sm.p[0], 1.5, 1e-9, "lerp position"); near(2 * Math.atan2(sm.q[1], sm.q[3]), 0.6, 1e-3, "nlerp turn"); ok(sm.k === "lerp", "lerp kind");
var se = C.netSample(ib, 300); near(se.p[0], 3, 1e-9, "extrapolates along velocity"); ok(se.k === "extra", "extra kind");
var sl = C.netSample(ib, 1000); near(sl.p[0], 2 + 10 * C.NET.EXTRA / 1000, 1e-9, "extrapolation capped"); ok(sl.k === "late", "late kind");
near(C.netSample(ib, -50).p[0], 0, 1e-9, "before the first = first"); ok(C.netSample([], 5) === null, "empty buffer");
var wb = [snap(0, 0, 0), snap(100, 0, 0)]; wb[0].w[0][2] = 3.0; wb[1].w[0][2] = -3.0; near(Math.abs(C.netSample(wb, 50).w[0][2]), Math.PI, 0.02, "wheel angle takes the short way round");
var jb = [snap(0, 0, 0), snap(100, 500, 0)]; near(C.netSample(jb, 20).p[0], 500, 1e-9, "a reset jumps instead of sliding");
var fq = [snap(0, 0, 0), snap(100, 0, 0)]; fq[1].q = fq[1].q.map(function (x) { return -x; }); near(Math.abs(C.netSample(fq, 50).q[3]), 1, 1e-9, "same turn with a flipped quaternion sign");
// events
ok(C.netClean({ t: "chat", txt: "  hi\u0000 there " }).txt === "hi there", "chat cleaned"); ok(C.netClean({ t: "chat", txt: "" }) === null, "empty chat dropped");
ok(C.netClean({ t: "eval", x: 1 }) === null && C.netClean(null) === null && C.netClean({ t: 5 }) === null, "unknown events dropped");
var he = C.netClean({ t: "hello", name: "Sam", car: "nope", color: "red", extra: 1 }); ok(he.car === "sports" && he.color === "#d9480f" && he.extra === undefined, "hello cleaned");
ok(C.netClean({ t: "room", room: { w: "mars", g: 999 } }).room.g === C.WORLDS.mars.g && C.netClean({ t: "room", room: { w: "pluto" } }) === null, "room cleaned");
ok(C.netClean({ t: "room", room: { w: "earth", g: 3, map: "bad map!" } }).room.map === undefined, "bad map string dropped");
ok(C.netClean({ t: "lap", n: 2, time: 41.2, total: 80 }).n === 2 && C.netClean({ t: "lap", n: 2, time: -1, total: 80 }) === null, "lap events checked");
ok(C.netClean({ t: "race", laps: 50, cd: 1 }).laps === 10 && C.netClean({ t: "race", laps: 50, cd: 1 }).cd === 3, "race limits");
// grid + results
var g0 = C.netGrid(0), g1 = C.netGrid(1), g2 = C.netGrid(2); ok(g0.s === g1.s && g0.lane === -g1.lane && g2.s < g0.s && g0.s < 0, "grid: two lanes behind the line");
var ro = C.raceOrder([{ name: "a", n: 2, total: 90 }, { name: "b", fin: true, n: 3, total: 130 }, { name: "c", fin: true, n: 3, total: 120 }, { name: "d", n: 2, total: 85 }, { name: "e" }]);
ok(ro.map(function (x) { return x.name; }).join("") === "cbdae", "race order " + ro.map(function (x) { return x.name; }).join(""));
console.log(bad ? bad + " of " + n + " checks failed" : "all " + n + " checks passed"); process.exit(bad ? 1 : 0);
