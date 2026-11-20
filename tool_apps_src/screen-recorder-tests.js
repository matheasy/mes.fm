// node tool_apps_src/screen-recorder-tests.js  -- pure helpers of MES Screen Recorder
var R = require("./screen-recorder/lib.js"), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
function near(a, b, e) { return Math.abs(a - b) <= (e || 1e-6); }

// sizes
ok(R.outSize("1280x720").w === 1280 && R.outSize("1280x720").h === 720, "preset size");
var a = R.outSize("auto", { w: 5120, h: 2880 }); ok(a.w === 3840 && a.h === 2160, "auto caps at 3840: " + JSON.stringify(a));
a = R.outSize("auto", { w: 1441, h: 901 }); ok(a.w % 2 === 0 && a.h % 2 === 0 && Math.abs(a.w - 1441) <= 1, "auto even: " + JSON.stringify(a));
ok(R.outSize("auto", null).w === 1920, "auto without source");

// fit
var f = R.fit(1600, 900, { x: 0, y: 0, w: 1000, h: 1000 }, "contain"); ok(near(f.w, 1000) && near(f.h, 562.5) && near(f.y, 218.75), "contain");
f = R.fit(1600, 900, { x: 0, y: 0, w: 1000, h: 1000 }, "cover"); ok(near(f.h, 1000) && f.w > 1000 && f.x < 0, "cover");

// layouts
var srcs = [{ kind: "screen", w: 1920, h: 1080 }, { kind: "camera", w: 640, h: 480 }];
var L = R.layout(srcs, 1920, 1080, "pip");
ok(near(L[0].w, 1920) && near(L[0].h, 1080), "pip main fills");
ok(L[1].w === L[1].h && L[1].x + L[1].w <= 1920 && L[1].y + L[1].h <= 1080 && L[1].x > 960, "pip camera square bottom right " + JSON.stringify(L[1]));
var many = []; for (var i = 0; i < 8; i++) many.push({ kind: i ? "camera" : "screen", w: 640, h: 480 });
L = R.layout(many, 1920, 1080, "pip"); ok(L.every(function (r) { return r.x >= 0 && r.x + r.w <= 1920 + 1e-6; }), "pip never runs off the edge");
L = R.layout(srcs.concat([{ kind: "screen", w: 1280, h: 720 }]), 1920, 1080, "side");
ok(L.length === 3 && L.every(function (r, k) { return r.x >= k * 640 - 1e-6 && r.x + r.w <= (k + 1) * 640 + 1e-6; }), "side: one per column");
L = R.layout(srcs, 1080, 1920, "side"); ok(L[1].y >= 960 - 1e-6, "side on upright picture stacks");
L = R.layout(many, 1920, 1080, "grid"); ok(L.every(function (r) { return r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= 1920 + 1e-6 && r.y + r.h <= 1080 + 1e-6; }), "grid inside");
L = R.layout([{ kind: "camera", w: 640, h: 480 }, { kind: "screen", w: 1920, h: 1080 }], 1920, 1080, "full"); ok(L[0].hide && !L[1].hide, "full shows the first screen");
ok(R.layout([], 100, 100, "pip").length === 0, "empty layout");

// hit / handles / move / resize / snap
var rs = [{ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 20, h: 20 }, { x: 0, y: 0, w: 100, h: 100, hide: true }];
ok(R.hit(rs, 60, 60) === 1, "topmost visible"); ok(R.hit(rs, 10, 10) === 0, "lower"); ok(R.hit(rs, 300, 1) === -1, "none");
ok(R.handleAt({ x: 10, y: 10, w: 100, h: 50 }, 112, 58, 5) === "se", "se handle"); ok(R.handleAt({ x: 10, y: 10, w: 100, h: 50 }, 60, 30, 5) === null, "no handle");
var m = R.move({ x: 10, y: 10, w: 100, h: 50 }, -500, 0, 1000, 500, 24); ok(m.x === 24 - 100, "move keeps 24 px inside");
var r2 = R.resize({ x: 100, y: 100, w: 200, h: 100 }, "se", 100, 0); ok(near(r2.w, 300) && near(r2.h, 150) && r2.x === 100, "resize se keeps aspect");
r2 = R.resize({ x: 100, y: 100, w: 200, h: 100 }, "nw", 50, 0); ok(near(r2.w, 150) && near(r2.h, 75) && near(r2.x + r2.w, 300) && near(r2.y + r2.h, 200), "resize nw keeps opposite corner");
r2 = R.resize({ x: 0, y: 0, w: 200, h: 100 }, "se", -1000, 0); ok(r2.w >= 40 && r2.h >= 40 && near(r2.w / r2.h, 2), "min size keeps aspect");
r2 = R.resize({ x: 0, y: 0, w: 200, h: 100 }, "se", 10, 50, { free: true }); ok(near(r2.w, 210) && near(r2.h, 150), "free resize");
var sn = R.snap({ x: 6, y: 497, w: 100, h: 100 }, 1000, 600, 8); ok(sn.r.x === 0 && sn.r.y === 500 && sn.lines.length === 2, "snap to edges");
sn = R.snap({ x: 448, y: 200, w: 100, h: 100 }, 1000, 600, 8); ok(sn.r.x === 450, "snap to centre");

// crop
ok(R.cropFromDrag(0.5, 0.5, 0.505, 0.6) === null, "tiny crop = none");
var c = R.cropFromDrag(0.8, 0.9, 0.2, 1.4); ok(near(c.x, 0.2) && near(c.y, 0.9) && near(c.w, 0.6) && near(c.h, 0.1), "crop normalised + clamped");
var px = R.cropPx({ x: 0.25, y: 0.25, w: 0.333, h: 0.5 }, 1920, 1080); ok(px.w % 2 === 0 && px.h % 2 === 0 && px.x + px.w <= 1920 && px.y + px.h <= 1080, "crop px even inside");
ok(R.cropPx(null, 800, 600).w === 800, "no crop = whole");
var ce = R.cropEdit({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, "move", 0.5, 0); ok(near(ce.x, 0.6), "crop move clamps");
ce = R.cropEdit({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, "nw", 0.6, 0); ok(ce.w >= 0.02 - 1e-9 && ce.x + ce.w <= 0.9 + 1e-9, "crop corner can't flip");

// timer with pauses
var T = new R.Timer(); T.start(1000); ok(T.elapsed(3000) === 2000, "timer runs"); T.pause(4000); ok(T.elapsed(9000) === 3000, "paused doesn't count");
T.resume(10000); ok(T.elapsed(11500) === 4500, "resumed"); ok(T.stop(12000) === 5000 && T.elapsed(99999) === 5000, "stop total");
T.pause(1); T.resume(2); ok(T.state === "idle", "pause/resume when idle do nothing");
ok(R.fmtTime(83500) === "1:23" && R.fmtTime(3723000) === "1:02:03" && R.fmtTime(-5) === "0:00" && R.fmtTime(9000) === "0:09", "fmtTime");

// formats
function sup(list) { return function (t) { return list.indexOf(t) >= 0; }; }
var p = R.pickType("mp4", true, sup(["video/webm;codecs=vp9,opus", "video/mp4"])); ok(p.type === "video/mp4" && p.ext === "mp4" && !p.fallback, "mp4 when supported");
p = R.pickType("mp4", true, sup(["video/webm;codecs=vp8,opus"])); ok(p.ext === "webm" && p.fallback, "fallback to webm");
p = R.pickType("webm", false, sup(["audio/webm;codecs=opus", "audio/mp4"])); ok(p.type === "audio/webm;codecs=opus", "audio webm");
p = R.pickType("mp4", false, sup(["audio/mp4"])); ok(p.ext === "m4a", "audio m4a");
ok(R.pickType("mp4", true, function () { return false; }) === null, "nothing supported");
ok(R.bitrate(1920, 1080, 30, 1) > 5e6 && R.bitrate(1920, 1080, 30, 1) < 8e6 && R.bitrate(100, 100, 30) === 1.5e6 && R.bitrate(7680, 4320, 60, 2) === 40e6, "bitrate range");

// names
var d = new Date(2026, 10, 20, 14, 5, 9); ok(R.fileName("Screen recording", d, "mp4") === "Screen recording 2026-11-20 at 14.05.09.mp4", "file name");
ok(R.unique("a.mp4", ["a.mp4", "a (2).mp4"]) === "a (3).mp4" && R.unique("b.mp4", ["a.mp4"]) === "b.mp4", "unique");

// meter / gain / caps
ok(R.meter(1) === 1 && R.meter(0) === 0 && near(R.meter(0.001), 0, 1e-9) && near(R.meter(0.1), 2 / 3), "meter");
ok(R.gain(100) === 1 && R.gain(250) === 2.5 && R.gain(-3) === 0, "gain");
var cp = R.caps({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", mediaDevices: { getDisplayMedia: 1, getUserMedia: 1 } }, { MediaRecorder: 1, showDirectoryPicker: 1 });
ok(cp.screen && cp.systemAudio && cp.tabAudio && cp.folder, "chrome windows caps");
cp = R.caps({ userAgent: "Mozilla/5.0 (Macintosh) Firefox/130", mediaDevices: { getDisplayMedia: 1, getUserMedia: 1 } }, { MediaRecorder: 1 });
ok(cp.screen && !cp.tabAudio && !cp.systemAudio && !cp.folder && cp.firefox, "firefox caps");
cp = R.caps({ userAgent: "Mozilla/5.0 (iPhone) Safari/605", mediaDevices: { getUserMedia: 1 } }, { MediaRecorder: 1 });
ok(!cp.screen && cp.cam && cp.mobile, "phone: camera only");

console.log(n - bad + "/" + n + " passed"); if (bad) process.exit(1);
