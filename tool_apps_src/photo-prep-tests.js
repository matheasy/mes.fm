// node tool_apps_src/photo-prep-tests.js -- pure maths of mes.fm/main_js/photo-prep.js (MESPhotoPrep.math)
"use strict";
const P = require("../mes.fm/main_js/photo-prep.js");
const M = P.math;
let n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL " + msg); } }
function near(a, b, msg, eps) { ok(Math.abs(a - b) <= (eps || 1e-6), msg + " -> " + a + " expected " + b); }
function inside(r, fw, fh, msg) { ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= fw + 1e-9 && r.y + r.h <= fh + 1e-9 && r.w > 0 && r.h > 0, msg + " " + JSON.stringify(r)); }

ok(typeof P.open === "function", "open() exported");

// rotation bounds
let b = M.rotBounds(400, 300, 90); near(b.w, 300, "rotBounds 90 w"); near(b.h, 400, "rotBounds 90 h");
b = M.rotBounds(100, 100, 45); near(b.w, 100 * Math.SQRT2, "rotBounds 45", 1e-6);
b = M.rotBounds(400, 300, 0); near(b.w, 400, "rotBounds 0");

// inner rectangle: no empty corners
let ir = M.innerRect(400, 300, 0); near(ir.w, 400, "inner 0 w"); near(ir.h, 300, "inner 0 h");
ir = M.innerRect(400, 300, 90); near(ir.w, 300, "inner 90 w"); near(ir.h, 400, "inner 90 h");
[-45, -20, -3, 2.5, 10, 33, 45].forEach(function (d) {
  const w = 400, h = 300, r = M.innerRect(w, h, d), g = M.geom(w, h, { rot: 0, str: d });
  // the four corners of the centred inner rect, mapped back to the picture, are inside the picture
  const x0 = (g.fw - r.w) / 2, y0 = (g.fh - r.h) / 2;
  [[x0, y0], [x0 + r.w, y0], [x0, y0 + r.h], [x0 + r.w, y0 + r.h]].forEach(function (c) {
    const p = M.apply(g.inv, c[0], c[1]);
    ok(p[0] >= -1e-6 && p[0] <= w + 1e-6 && p[1] >= -1e-6 && p[1] <= h + 1e-6, "inner rect corner inside picture at " + d + "° " + p);
  });
  ok(r.w > 0 && r.h > 0 && r.w <= w && r.h <= g.fh, "inner rect positive at " + d);
});
// a bigger rect at 10 degrees would poke out: the inner one is (close to) the largest
(function () {
  const r = M.innerRect(400, 300, 10), g = M.geom(400, 300, { rot: 0, str: 10 }), k = 1.01, w = r.w * k, h = r.h * k;
  const p = M.apply(g.inv, (g.fw - w) / 2, (g.fh - h) / 2), q = M.apply(g.inv, (g.fw + w) / 2, (g.fh - h) / 2);
  ok([p, q].some(function (c) { return c[0] < 0 || c[0] > 400 || c[1] < 0 || c[1] > 300; }), "1% bigger rect leaves the picture");
})();

// geometry: inverse round trip, corners map into the frame, flips
[[{ rot: 0, str: 0 }], [{ rot: 1, str: 0 }], [{ rot: 2, str: 7 }], [{ rot: 3, str: -12, fx: true }], [{ rot: 1, str: 30, fy: true }]].forEach(function (a) {
  const st = a[0], g = M.geom(640, 480, st);
  [[0, 0], [640, 0], [0, 480], [640, 480], [123, 456]].forEach(function (c) {
    const f = M.apply(g.m, c[0], c[1]), back = M.apply(g.inv, f[0], f[1]);
    near(back[0], c[0], "round trip x " + JSON.stringify(st), 1e-6); near(back[1], c[1], "round trip y", 1e-6);
    ok(f[0] >= -1e-6 && f[0] <= g.fw + 1e-6 && f[1] >= -1e-6 && f[1] <= g.fh + 1e-6, "corner in frame " + JSON.stringify(st));
  });
});
let g = M.geom(200, 100, { rot: 1 }); near(g.fw, 100, "rot 90 frame w"); near(g.fh, 200, "rot 90 frame h");
let p = M.apply(g.m, 0, 0); near(p[0], 100, "rot right: top-left goes to top-right x"); near(p[1], 0, "rot right: top-left y");
g = M.geom(200, 100, { rot: 0, fx: true }); p = M.apply(g.m, 0, 0); near(p[0], 200, "flip x");
// a screen flip of a turned picture = what you see mirrored left-right
(function () {
  const st = { rot: 1, str: 10, fx: false, fy: false }, fl = M.flip(st, true), a = M.geom(300, 200, st), b2 = M.geom(300, 200, fl);
  near(a.fw, b2.fw, "flip keeps frame w", 1e-6);
  [[0, 0], [300, 0], [50, 170]].forEach(function (c) {
    const pa = M.apply(a.m, c[0], c[1]), pb = M.apply(b2.m, c[0], c[1]);
    near(pb[0], a.fw - pa[0], "screen flip mirrors x", 1e-6); near(pb[1], pa[1], "screen flip keeps y", 1e-6);
  });
  const fv = M.flip(st, false), c2 = M.geom(300, 200, fv), pa = M.apply(a.m, 40, 60), pc = M.apply(c2.m, 40, 60);
  near(pc[1], a.fh - pa[1], "screen flip down mirrors y", 1e-6); near(pc[0], pa[0], "screen flip down keeps x", 1e-6);
})();

// crop helpers
let r = M.clampCrop({ x: -20, y: 50, w: 500, h: 400 }, 400, 300); inside(r, 400, 300, "clampCrop pulls inside");
near(r.w, 400, "clampCrop caps w"); near(r.h, 300, "clampCrop caps h");
r = M.clampCrop({ x: 10, y: 10, w: 1, h: 1 }, 400, 300, 8); near(r.w, 8, "clampCrop min size");
r = M.fitAspect({ x: 0, y: 0, w: 400, h: 300 }, 1, 400, 300); near(r.w, 300, "fitAspect 1:1 w"); near(r.h, 300, "fitAspect 1:1 h"); near(r.x, 50, "fitAspect centred");
r = M.fitAspect({ x: 0, y: 0, w: 400, h: 300 }, 16 / 9, 400, 300); near(r.w / r.h, 16 / 9, "fitAspect 16:9", 1e-9); inside(r, 400, 300, "fitAspect inside");
const c0 = { x: 100, y: 100, w: 100, h: 80 };
r = M.resizeCrop(c0, "move", 500, -500, 0, 400, 300); near(r.x, 300, "move clamps right"); near(r.y, 0, "move clamps top"); near(r.w, 100, "move keeps size");
r = M.resizeCrop(c0, "se", 50, 20, 0, 400, 300); near(r.w, 150, "se free w"); near(r.h, 100, "se free h"); near(r.x, 100, "se keeps x");
r = M.resizeCrop(c0, "nw", 500, 500, 0, 400, 300, 12); near(r.w, 12, "nw past the far edge keeps min w"); near(r.x + r.w, 200, "nw keeps right edge");
r = M.resizeCrop(c0, "e", 1000, 0, 0, 400, 300); near(r.x + r.w, 400, "e clamps to frame");
r = M.resizeCrop({ x: 100, y: 100, w: 100, h: 100 }, "se", 60, 10, 1, 400, 300); near(r.w, r.h, "se 1:1 square"); near(r.w, 160, "se 1:1 follows the bigger move");
r = M.resizeCrop({ x: 100, y: 100, w: 160, h: 90 }, "se", 400, 400, 16 / 9, 400, 300); near(r.w / r.h, 16 / 9, "se 16:9 aspect", 1e-9); inside(r, 400, 300, "se 16:9 stays inside");
r = M.resizeCrop({ x: 100, y: 100, w: 100, h: 100 }, "n", 0, -30, 1, 400, 300); near(r.h, 130, "n 1:1 h"); near(r.w, 130, "n 1:1 w grows both sides"); near(r.x + r.w / 2, 150, "n 1:1 keeps centre");
r = M.resizeCrop({ x: 10, y: 10, w: 100, h: 100 }, "e", 1000, 0, 1, 400, 300); inside(r, 400, 300, "e 1:1 big drag inside"); near(r.w, r.h, "e 1:1 still square");

// pixels
const hist = new Uint32Array(256); for (let i = 0; i < 100; i++) hist[30]++; for (let i = 0; i < 100; i++) hist[220]++;
const t = M.otsu(hist); ok(t >= 30 && t < 220, "otsu splits two peaks: " + t);
const lv = M.levels(hist, 0.01, 0.99); ok(lv[0] === 30 && lv[1] === 220, "levels " + lv);
let lut = M.lut({ b: 0, c: 0 }, null); ok(lut[0] === 0 && lut[128] === 128 && lut[255] === 255, "identity LUT");
lut = M.lut({ b: 20, c: 0 }, null); ok(lut[100] === 151, "brightness +20 = +51 -> " + lut[100]);
lut = M.lut({ b: 0, c: 50 }, null); ok(lut[200] > 200 && lut[50] < 50 && Math.abs(lut[128] - 128) <= 1, "contrast spreads");
lut = M.lut({}, [30, 220]); ok(lut[30] === 0 && lut[220] === 255, "levels stretch");
ok(M.isPlainAdj({ b: 0, c: 0, g: false, t: false }) && !M.isPlainAdj({ b: 1 }) && !M.isPlainAdj({ g: true }), "isPlainAdj");
(function () {
  const w = 4, h = 3, d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 200; d[i * 4 + 1] = 100; d[i * 4 + 2] = 50; d[i * 4 + 3] = 255; }
  M.adjustPixels(d, w, h, { g: true });
  ok(d[0] === d[1] && d[1] === d[2] && d[3] === 255, "greyscale equal channels, alpha kept");
  near(d[0], Math.round((200 * 299 + 100 * 587 + 50 * 114) / 1000), "greyscale luminance", 1);
  const e = new Uint8ClampedArray(d); M.adjustPixels(e, w, h, { b: 0, c: 0, g: false, t: false });
  ok(e.every(function (v, i) { return v === d[i]; }), "plain adjust changes nothing");
})();
(function () {   // "make text clearer" on a soft grey page: lighter background, darker ink
  const w = 30, h = 20, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (y > 8 && y < 12 && x > 5 && x < 25) ? 90 : 170, p = (y * w + x) * 4; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
  M.adjustPixels(d, w, h, { t: true });
  ok(d[(2 * w + 2) * 4] > 230, "clearer: page goes near white " + d[(2 * w + 2) * 4]);
  ok(d[(10 * w + 15) * 4] < 30, "clearer: ink goes near black " + d[(10 * w + 15) * 4]);
})();
(function () {   // ink bounds
  const w = 200, h = 100, gray = new Uint8Array(w * h).fill(240);
  for (let y = 40; y < 60; y++) for (let x = 50; x < 150; x++) if ((x + y) % 3) gray[y * w + x] = 20;
  const r2 = M.inkBounds(gray, w, h);
  ok(r2 && r2.x <= 50 && r2.x >= 40 && r2.x + r2.w >= 150 && r2.x + r2.w <= 160 && r2.y <= 40 && r2.y + r2.h >= 60, "inkBounds finds the block " + JSON.stringify(r2));
  ok(M.inkBounds(new Uint8Array(w * h).fill(200), w, h) === null, "inkBounds: blank page = null");
  const inv = gray.map(function (v) { return 255 - v; }), r3 = M.inkBounds(inv, w, h);
  ok(r3 && Math.abs(r3.x - r2.x) <= 1 && Math.abs(r3.w - r2.w) <= 2, "inkBounds: light text on dark works too");
  // a dark band across the top and a dark box edge are not text
  const g2 = gray.slice(); for (let y = 0; y < 15; y++) for (let x = 0; x < w; x++) g2[y * w + x] = 60;
  for (let y = 70; y < 100; y++) for (let x = 0; x < 30; x++) g2[y * w + x] = 90;
  const r4 = M.inkBounds(g2, w, h);
  ok(r4 && r4.y >= 25 && r4.x >= 35 && r4.y + r4.h <= 70, "inkBounds ignores a band and a corner block " + JSON.stringify(r4));
})();

// state, history
const s0 = M.initial(800, 600);
near(s0.crop.w, 800, "initial crop = whole picture"); ok(M.same(s0, M.clone(s0)), "clone is the same");
const s1 = M.clone(s0); s1.strokes = s1.strokes.concat([{ k: "pen", p: [1, 2] }]); ok(!M.same(s0, s1), "a stroke counts as an edit");
const s2 = M.clone(s0); s2.crop.w -= 0.2; ok(M.same(s0, s2), "sub-pixel crop noise is not an edit");
const s3 = M.clone(s0); s3.rot = 4; ok(M.same(s0, s3), "four quarter turns = no edit");
const s4 = M.clone(s0); s4.str = 5; s4.crop = M.autoCrop(800, 600, s4); inside(s4.crop, M.geom(800, 600, s4).fw, M.geom(800, 600, s4).fh, "autoCrop inside frame");
const H = new M.History(3);
H.push(1); H.push(2); H.push(3);
ok(H.canUndo() && !H.canRedo(), "history can undo");
ok(H.undo() === 2 && H.canRedo() && H.redo() === 3, "undo / redo");
H.undo(); H.push(9); ok(H.cur() === 9 && !H.canRedo(), "push after undo drops redo");
H.push(10); H.push(11); ok(H.list.length === 3 && H.list[0] === 9, "history limit keeps the newest");
while (H.canUndo()) H.undo(); ok(H.cur() === 9 && H.undo() === 9, "undo stops at the oldest");
const f = M.fitSide(8000, 2000, 4000); ok(f.w === 4000 && f.h === 1000, "fitSide caps the long side");
ok(M.fitSide(100, 50, 4000).w === 100, "fitSide never enlarges");

// phone view: a 4000 x 3000 photo on a 412 px wide stage fits with room for finger-sized crop handles, all 8 on screen
[[412, 560], [360, 480], [1280, 720]].forEach(function (sz) {
  const sw = sz[0], sh = sz[1], R = { x: 0, y: 0, w: 4000, h: 3000 };
  const pad = M.viewPad("crop", sw, sh, true), t = M.fitView(sw, sh, R, pad, 1, 0, 0);
  ok(pad >= 24, "crop pad leaves room for a finger at " + sw);
  const xs = [R.x * t.k + t.ox, (R.x + R.w) * t.k + t.ox], ys = [R.y * t.k + t.oy, (R.y + R.h) * t.k + t.oy];
  ok(xs[0] >= pad - 1e-6 && xs[1] <= sw - pad + 1e-6 && ys[0] >= pad - 1e-6 && ys[1] <= sh - pad + 1e-6, "every crop handle is on screen with a margin at " + sw + "x" + sh + " " + xs + " " + ys);
  ok(Math.abs((xs[0] + xs[1]) / 2 - sw / 2) < 1e-6 && Math.abs((ys[0] + ys[1]) / 2 - sh / 2) < 1e-6, "picture centred at " + sw);
  ok(Math.abs(xs[1] - xs[0] - (sw - 2 * pad)) < 1e-6 || Math.abs(ys[1] - ys[0] - (sh - 2 * pad)) < 1e-6, "picture uses the space at " + sw);
});
ok(M.viewPad("move", 412, 560, true) < 24, "other tools keep a small margin");
ok(M.fitView(100, 100, { x: 0, y: 0, w: 10, h: 10 }, 999, 1).k > 0, "a silly pad still leaves a positive scale");
ok(M.zoomLabel(1) === "1×" && M.zoomLabel(2) === "2×" && M.zoomLabel(0.5) === "0.5×", "zoom label is times the fitted size, not a misleading 100%");
// the visible box: null when nothing is zoomed, else the visual viewport
ok(M.visibleBox({ width: 412, height: 860, offsetLeft: 0, offsetTop: 0 }, 412, 860) === null, "visibleBox null when not zoomed");
const vb = M.visibleBox({ width: 206, height: 430, offsetLeft: 100, offsetTop: 50 }, 412, 860);
ok(vb && vb.x === 100 && vb.y === 50 && vb.w === 206 && vb.h === 430, "visibleBox follows a pinch-zoomed page");
ok(M.visibleBox({ width: 412, height: 500, offsetLeft: 0, offsetTop: 0 }, 412, 860).h === 500, "visibleBox follows an open keyboard");

console.log((bad ? bad + " of " : "all ") + n + " checks " + (bad ? "FAILED" : "passed"));
process.exit(bad ? 1 : 0);
