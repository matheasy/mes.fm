// node tool_apps_src/upscale-tests.js
"use strict";
var U = require("./upscale/lib.js"), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL " + m); } }
// sizes
var t = U.targetSize(500, 300, "scale", 4); ok(t.W === 2000 && t.H === 1200 && t.ok, "4x");
t = U.targetSize(500, 300, "width", 3840); ok(t.W === 3840 && t.H === 2304, "width target");
t = U.targetSize(5000, 5000, "scale", 4); ok(t.tooBig, "too big");
// plans
var p = U.plan(100, 50, 400, 200); ok(p.passes === 1 && p.steps.length === 1, "exact 4x one pass");
p = U.plan(100, 50, 200, 100); ok(p.passes === 1 && p.steps[1].type === "resize" && p.steps[1].w === 200, "2x = pass + resize down");
p = U.plan(100, 50, 800, 400); ok(p.passes === 2 && p.steps[1].w === 200 && p.steps[2].inW === 200 && p.steps.length === 3, "8x two passes, exact");
p = U.plan(100, 50, 768, 384); ok(p.passes === 2 && p.steps[1].w === 192 && p.steps.length === 3, "7.68x");
p = U.plan(100, 50, 50, 25); ok(p.passes === 0, "shrink = resize only");
// tiles cover every pixel exactly once (cores) and windows contain their cores
function cover(w, h, opt) {
	var tiles = U.tilePlan(w, h, opt), seen = new Uint8Array(w * h), good = true;
	tiles.forEach(function (q) {
		if (opt.fixed && (q.ww !== opt.fixed || q.wh !== opt.fixed)) good = false;
		var r = U.readRect(q, w, h); if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h || r.w < 1 || r.h < 1) good = false;
		if (q.cx < q.wx || q.cy < q.wy || q.cx + q.cw > q.wx + q.ww || q.cy + q.ch > q.wy + q.wh) good = false;
		if (q.cx + q.cw > r.x + r.w || q.cy + q.ch > r.y + r.h) good = false; // core must be real pixels
		for (var y = q.cy; y < q.cy + q.ch; y++) for (var x = q.cx; x < q.cx + q.cw; x++) seen[y * w + x]++;
	});
	for (var i = 0; i < seen.length; i++) if (seen[i] !== 1) good = false;
	return good;
}
[[1, 1], [37, 900], [256, 256], [500, 300], [1023, 77], [225, 225], [224, 449]].forEach(function (s) {
	ok(cover(s[0], s[1], { tile: 128, pad: 16 }), "dynamic cover " + s);
	ok(cover(s[0], s[1], { fixed: 256, pad: 16 }), "fixed cover " + s);
});
// context: interior tiles of a fixed plan have pad pixels around the core
var tl = U.tilePlan(1000, 1000, { fixed: 256, pad: 16 }); ok(tl[1].cx - tl[1].wx === 16, "fixed pad left"); ok(tl.length === Math.ceil(1000 / 224) * Math.ceil(1000 / 224), "fixed count");
// tensors
var rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 128, 255, 255]);
var f = U.toCHW(rgba, 2, 1, 3, 2); ok(f.length === 18 && f[0] === 1 && f[6] === 0 && Math.abs(f[7] - 128 / 255) < 1e-6 && f[2] === 0 && f[3] === 1, "toCHW + edge repeat");
var back = U.fromCHW(f, 3, 2); ok(back[0] === 255 && back[5] === 128 && back[6] === 255 && back[7] === 255, "fromCHW");
var cl = U.fromCHW(new Float32Array([-0.5, 2, 0.5]), 1, 1); ok(cl[0] === 0 && cl[1] === 255 && cl[2] === 128, "clamp");
// counts and names
ok(U.countTiles(256, 256, 1024, 1024, { tile: 256, pad: 16 }) === 1, "count 1");
ok(U.countTiles(100, 100, 800, 800, { tile: 256, pad: 16 }) === 2, "count 2 passes");
ok(U.outName("cat.photo.jpg", 4, "png", 0, 0, "scale") === "cat.photo-upscaled-4x.png", "name");
ok(U.outName("a.png", 7.68, "jpg", 3840, 2160, "width") === "a-upscaled-3840x2160.jpg", "name px");
ok(U.fmtFactor(2.5) === "2.5x", "factor");
console.log(bad ? bad + " of " + n + " failed" : "all " + n + " passed"); process.exit(bad ? 1 : 0);
