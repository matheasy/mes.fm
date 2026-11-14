/* node tool_apps_src/darkroom-tests.js : MESDR pure helpers */
var D = require("./darkroom/lib.js"), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
function near(a, b, e, m) { ok(Math.abs(a - b) <= (e || 1e-6), m + " (" + a + " vs " + b + ")"); }
/* settings */
var d = D.defaults(); ok(!D.isEdited(d), "defaults are not edited"); ok(D.changedGroups(d).length === 0, "no groups changed");
var s = D.normalize({ exposure: 9, contrast: -500, hue: [1, 2, 3], crop: { x: 0.9, y: 0, w: 0.5, h: 2 }, rot90: 5, locals: [{ type: "radial", adj: { exp: 9 } }, null], spots: [{ x: 0.2, y: 0.3 }] });
ok(s.exposure === 5 && s.contrast === -100, "clamped numbers"); ok(s.hue.length === 8 && s.hue[2] === 3 && s.hue[7] === 0, "8 bands");
ok(s.crop.w === 0.5 && s.crop.h === 1 && s.crop.x === 0.5, "crop clamped inside"); ok(s.rot90 === 1, "rot90 mod 4");
ok(s.locals.length === 1 && s.locals[0].adj.exp === 4, "locals cleaned"); ok(s.spots.length === 1 && s.spots[0].r === 0.02, "spot defaults");
ok(D.isEdited({ clarity: 10 }) && D.changedGroups(D.normalize({ clarity: 10 }))[0] === "presence", "edited groups");
var p = D.pickGroups(D.normalize({ exposure: 1, temp: 20, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }), d, ["tone"]); ok(p.exposure === 1 && p.temp === 0 && p.crop.w === 1, "pickGroups copies only chosen groups");
/* curves */
var f = D.curveFn([[0, 0], [1, 1]]); near(f(0.37), 0.37, 1e-9, "identity curve");
f = D.curveFn([[0, 0], [0.5, 0.7], [1, 1]]); near(f(0.5), 0.7, 1e-9, "curve passes its points"); var mono = true, prev = -1; for (var i = 0; i <= 100; i++) { var v = f(i / 100); if (v < prev - 1e-9) mono = false; prev = v; } ok(mono, "monotone");
var lut = D.curveLUT(d.curve); ok(lut[0] === 0 && lut[255 * 4] === 255 && lut[128 * 4] === 128, "identity LUT");
/* white balance */
var m = D.wbMul(0, 0); near(m[0], 1, 1e-9, "neutral wb"); var w = D.wbMul(50, 0); ok(w[0] > 1 && w[2] < 1, "warm = more red, less blue"); near(0.2126 * w[0] + 0.7152 * w[1] + 0.0722 * w[2], 1, 1e-9, "wb keeps luminance");
var pick = D.wbFromPick([0.3, 0.25, 0.15]), mm = D.wbMul(pick.temp, pick.tint), c = [0.3 * mm[0], 0.25 * mm[1], 0.15 * mm[2]]; ok(Math.max.apply(0, c) / Math.min.apply(0, c) < 1.06, "picked colour becomes grey " + c);
ok(D.wbFromPick([0.2, 0.2, 0.2]).temp === 0, "grey stays");
/* histogram + auto */
var px = new Uint8Array(4 * 1000); for (i = 0; i < 1000; i++) { var g = 20 + Math.round(i / 1000 * 60); px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g; px[i * 4 + 3] = 255; }
var h = D.histogram(px); ok(h.n === 1000, "hist count"); var a = D.autoTone(h); ok(a.exposure > 0.5, "dark picture -> brighter " + a.exposure);
/* crop helpers */
var ins = D.maxInscribed(6000, 4000, 10, 1.5); ok(ins[0] < 6000 && Math.abs(ins[0] / ins[1] - 1.5) < 1e-9, "inscribed keeps aspect");
var fc = D.fitCropAspect({ x: 0, y: 0, w: 1, h: 1 }, 6000, 4000, 1); near(fc.w * 6000, fc.h * 4000, 1e-6, "square crop"); near(fc.x, (1 - fc.w) / 2, 1e-9, "centred");
ok(D.aspectValue("16:9") === 16 / 9 && D.aspectValue("orig", 1.5) === 1.5 && D.aspectValue("free") === 0, "aspects");
/* presets */
var pr = D.applyPreset(d, { contrast: 40, bw: true, grade: { sh: [200, 30, 0] } }, 50); ok(pr.contrast === 20 && pr.bw === true && pr.grade.sh[1] === 15, "preset at 50%");
ok(D.applyPreset(d, { bw: true }, 40).bw === false, "switch only above 50%");
D.PRESETS.forEach(function (q) { if (q.s) { var r = D.applyPreset(d, q.s, 100); ok(D.isEdited(r), "preset " + q.id + " changes something"); } });
/* export */
ok(D.exportName("{name}-{n3}", { name: "IMG_1.CR2", n: 7, ext: "jpg" }) === "IMG_1-007.jpg", "export name");
ok(D.exportName("{date}", { name: "a", date: new Date(2026, 10, 14), ext: "png" }) === "2026-11-14.png", "date token");
ok(D.exportName("a/b:c", { name: "x", ext: "jpg" }) === "a-b-c.jpg", "unsafe characters");
var es = D.exportSize(6000, 4000, "long", 2048); ok(es[0] === 2048 && es[1] === 1365, "long edge"); ok(D.exportSize(100, 50, "long", 2048)[0] === 100, "no enlarging");
/* jpeg finder */
function jpg(w, hh, body) { var a = [0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, hh >> 8, hh & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xda, 0, 2]; a = a.concat(body, [0xff, 0x00, 1, 2, 0xff, 0xd0, 3, 0xff, 0xd9]); return a; }
var buf = [9, 9, 9].concat(jpg(160, 120, [1, 2, 3]), [7, 7], jpg(4000, 3000, [5, 6, 7, 8]), [0]), J = D.findJpegs(new Uint8Array(buf));
ok(J.length === 2 && J[1].w === 4000 && J[1].h === 3000, "found both previews"); ok(D.bestPreview(J).w === 4000, "best = largest"); ok(new Uint8Array(buf)[J[1].off + J[1].len - 1] === 0xd9, "ends at EOI");
var tif = new Uint8Array(64); tif.set([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0]); ok(D.tiffOrientation(tif) === 6, "TIFF orientation");
/* XMP */
var x = '<x:xmpmeta><rdf:Description crs:Exposure2012="+0.85" crs:Contrast2012="-12" crs:Highlights2012="-40" crs:HueAdjustmentBlue="-10" crs:SaturationAdjustmentRed="+15" crs:IncrementalTemperature="12" crs:HasCrop="True" crs:CropTop="0.1" crs:CropLeft="0.05" crs:CropBottom="0.9" crs:CropRight="0.95" crs:ConvertToGrayscale="False" crs:Sharpness="40" xmp:Rating="4" xmp:Label="Green"><crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>128, 150</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012><dc:subject><rdf:Bag><rdf:li>beach</rdf:li><rdf:li>2026</rdf:li></rdf:Bag></dc:subject></rdf:Description></x:xmpmeta>';
var X = D.parseXmp(x); ok(X && X.settings, "xmp parsed"); near(X.settings.exposure, 0.85, 1e-9, "xmp exposure"); ok(X.settings.contrast === -12 && X.settings.highlights === -40, "xmp tone");
ok(X.settings.hue[5] === -10 && X.settings.sat[0] === 15 && X.settings.temp === 12, "xmp hsl / wb"); near(X.settings.crop.w, 0.9, 1e-9, "xmp crop"); ok(X.settings.curve.rgb.length === 3, "xmp curve");
ok(X.rating === 4 && X.label === 3 && X.keywords.join() === "beach,2026", "xmp rating / label / keywords"); ok(!X.settings.bw && X.settings.sharpen === 40, "xmp misc");
ok(D.parseXmp("hello") === null, "not xmp");
/* catalogue */
var L = [{ key: "a", name: "b.jpg", dir: "", raw: false, date: 2 }, { key: "b", name: "a.CR2", dir: "x", raw: true, date: 1 }, { key: "c", name: "c10.jpg", dir: "x/y", raw: false, date: 3 }], R = { a: { rating: 3, flag: 1 }, b: { rating: 5, kw: ["sea"] }, c: { flag: -1 } }, ro = function (q) { return R[q.key]; };
ok(D.filterPhotos(L, { minRating: 3 }, ro).length === 2, "rating filter"); ok(D.filterPhotos(L, { flag: "notrej" }, ro).length === 2, "not rejected");
ok(D.filterPhotos(L, { folder: "x" }, ro).length === 2, "folder includes subfolders"); ok(D.filterPhotos(L, { q: "sea" }, ro)[0].key === "b", "keyword search"); ok(D.filterPhotos(L, { kind: "raw" }, ro).length === 1, "raw filter");
ok(D.sortPhotos(L, "date", "asc", ro).map(function (q) { return q.key; }).join("") === "bac", "sort by date"); ok(D.sortPhotos(L, "rating", "desc", ro)[0].key === "b", "sort by rating");
var ht = D.halfTable(); ok(ht[0] === 0 && ht[65535] === 0x3c00, "half table ends");
/* sky: blue top half, brown bottom half with a textured horizon */
var W = 120, H = 80, im = new Uint8Array(W * H * 4); for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) { var o = (yy * W + xx) * 4, sky = yy < 36 + Math.round(3 * Math.sin(xx / 7)); if (sky) { im[o] = 110; im[o + 1] = 160; im[o + 2] = 230; } else { var nz = (xx * 7 + yy * 13) % 9 * 6; im[o] = 90 + nz; im[o + 1] = 70 + nz; im[o + 2] = 40; } im[o + 3] = 255; }
var SK = D.skyMask(im, W, H); ok(SK.cover > 0.38 && SK.cover < 0.5, "sky cover " + SK.cover.toFixed(2)); ok(SK.a[5 * W + 60] > 0.9 && SK.a[70 * W + 60] < 0.1, "sky top in, ground out");
var gray = new Uint8Array(W * H * 4).fill(60); for (i = 3; i < gray.length; i += 4) gray[i] = 255; ok(D.skyMask(gray, W, H).cover < 0.05, "dark flat picture has no sky");
var nm = D.normMask(new Float32Array([2, 4, 6])); ok(nm[0] === 0 && nm[2] === 1, "normMask");
console.log(bad ? bad + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(bad ? 1 : 0);
