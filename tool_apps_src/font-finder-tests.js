// node tool_apps_src/font-finder-tests.js -- MES Font Finder: fingerprint parity with build_font_finder_data.py, letter files, segmentation, ranking accuracy on recorded pictures
"use strict";
var fs = require("fs"), path = require("path"), F = require("./font-finder/lib.js");
var DATA = path.join(__dirname, "..", "mes.fm", "font-finder", "data"), FX = JSON.parse(fs.readFileSync(path.join(__dirname, "font-finder", "fixtures", "fixtures.json"), "utf8"));
var fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log("FAIL", msg); } }
var meta = JSON.parse(fs.readFileSync(path.join(DATA, "fonts.json"), "utf8")), N = meta.prim.length, shards = {};
function shard(ch) { if (!shards[ch]) { var b = fs.readFileSync(path.join(DATA, "g", ch.charCodeAt(0) + ".bin")); shards[ch] = F.parseShard(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); } return shards[ch]; }

// 1. fingerprint = the Python one
var P = FX.parity, bits = Buffer.from(P.bits, "base64"), m = new Uint8Array(P.w * P.h);
for (var i = 0; i < m.length; i++) m[i] = (bits[i >> 3] >> (7 - (i & 7))) & 1;
var fp = F.fingerprint(m, P.w, P.h), md = 0; for (i = 0; i < fp.length; i++) md = Math.max(md, Math.abs(fp[i] - P.fp[i]));
ok(md < 2e-4, "fingerprint matches Python (max diff " + md + ")");
// 2. letter file: projecting the Python letter gives the stored numbers
var sh = shard(P.ch), q = F.project(fp, sh), err = 0, nrm = 0;
for (var k = 0; k < sh.K; k++) { var e = q[k] - sh.coef[P.rec * sh.K + k]; err += e * e; nrm += q[k] * q[k]; }
ok(sh.N === N && sh.ch === "R", "letter file header");
ok(Math.sqrt(err / nrm) < 0.05, "stored numbers = projection (rel err " + Math.sqrt(err / nrm).toFixed(4) + ")");
ok(meta.chars.split("").every(function (c) { return fs.existsSync(path.join(DATA, "g", c.charCodeAt(0) + ".bin")); }), "a file for every letter");
ok(meta.prim.every(function (s) { return meta.styles[s][3] === -1; }), "primary styles are not copies");
// 3. helpers
ok(F.styleName(700, 1) === "Bold italic" && F.styleName(400, 1) === "Italic" && F.styleName(400, 0) === "Regular", "style names");
ok(F.googleCss("Open Sans", 700, 1, "Ab") === "https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@1,700&display=block&text=Ab", "Google CSS link");
ok(F.twinOf("Arimo").indexOf("Arial") >= 0, "free twins");
var split = F.splitGlyph({ x0: 0, y0: 0, x1: 9, y1: 1, px: [0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19] }, 10);
ok(split && split.length === 2 && split[0].x1 < split[1].x0, "split a box in two");

// 4. whole pictures: binarise -> segment -> letters -> rank
var fitted = 0, top1 = 0, top5 = 0, top20 = 0, segOk = 0, t0 = Date.now(), famOf = function (rec) { return meta.fams[meta.styles[meta.prim[rec]][0]][0]; };
FX.cases.forEach(function (c) {
	var gray = new Uint8Array(Buffer.from(c.gray, "base64")), b = F.binarise(gray, "auto"), seg = F.segment(b, c.w, c.h);
	var chars = c.text.replace(/\s/g, "").split(""), gl = seg.lines.length ? seg.lines[0].glyphs : [];
	if (seg.lines.length !== 1) return;
	if (gl.length === chars.length) segOk++; else gl = F.fitCount(gl, chars.length, c.w);
	if (gl.length !== chars.length) return; fitted++;
	var bottoms = gl.filter(function (g, i) { return !F.descender(chars[i]); }).map(function (g) { return g.y1; }), base = F.median(bottoms.length ? bottoms : gl.map(function (g) { return g.y1; }));
	var letters = gl.map(function (g, i) { var cg = F.cutGlyph(g, c.w); return { ch: chars[i], fp: F.fingerprint(cg.m, cg.w, cg.h), w: cg.w, h: cg.h, top: base - g.y0 + 1 }; });
	letters.forEach(function (L) { shard(L.ch); });
	var s = F.rank(letters, shards, N), order = Array.from(s.keys()).sort(function (a, z) { return s[a] - s[z]; }), fams = [];
	for (var j = 0; j < order.length && fams.length < 20; j++) { var f = famOf(order[j]); if (fams.indexOf(f) < 0) fams.push(f); }
	if (fams[0] === c.id) top1++; if (fams.slice(0, 5).indexOf(c.id) >= 0) top5++; if (fams.indexOf(c.id) >= 0) top20++;
});
var nc = FX.cases.length;
console.log("pictures: segmented " + segOk + "/" + nc + ", after fitting to the typed text " + fitted + ", top1 " + top1 + ", top5 " + top5 + ", top20 " + top20 + " (" + (Date.now() - t0) + " ms)");
ok(segOk >= nc * 0.8, "segmentation finds the right letters in most pictures by itself");
ok(fitted === nc, "with the typed text every picture gets the right number of letters");
ok(top5 >= nc * 0.75, "the right font is in the top 5 for most pictures");
ok(top20 >= nc * 0.85, "the right font is in the top 20 for nearly all pictures");
console.log(fails ? fails + " of " + n + " checks FAILED" : "all " + n + " checks passed");
process.exit(fails ? 1 : 0);
