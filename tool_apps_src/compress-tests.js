// node tool_apps_src/compress-tests.js
const C = require("./compress/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(C.kindOf("a.PDF", ""), "pdf", "pdf"); eq(C.kindOf("x", "application/pdf"), "pdf", "pdf mime"); eq(C.kindOf("p.jpeg", ""), "image", "jpeg"); eq(C.kindOf("p.heic", ""), "other", "heic");
eq(C.kindOf("s.m4a", ""), "audio", "m4a"); eq(C.kindOf("s", "audio/mpeg"), "audio", "audio mime"); eq(C.kindOf("m.MOV", ""), "video", "mov"); eq(C.kindOf("m", "video/mp4"), "video", "video mime"); eq(C.kindOf("a.zip", ""), "other", "zip");
eq(C.imageOut("jpeg", "keep"), "jpg", "keep jpeg"); eq(C.imageOut("png", "keep"), "png", "keep png"); eq(C.imageOut("gif", "keep"), "png", "gif -> png"); eq(C.imageOut("webp", "keep"), "webp", "keep webp"); eq(C.imageOut("png", "webp"), "webp", "to webp"); eq(C.imageOut("png", "jpeg"), "jpg", "to jpeg");
eq(C.fitDims(4000, 3000, 2000), { w: 2000, h: 1500, scale: 0.5 }, "fit landscape"); eq(C.fitDims(3000, 4000, 2000).h, 2000, "fit portrait"); eq(C.fitDims(800, 600, 2000).scale, 1, "never enlarges"); eq(C.fitDims(800, 600, 0).w, 800, "0 = original"); eq(C.fitDims(5000, 1, 100).h, 1, "min 1");
eq(C.formatBytes(1500), "1.5 KB", "bytes"); eq(C.pctSaved(1000, 250), 75, "pct"); eq(C.pctSaved(0, 5), 0, "pct zero"); eq(C.savedText(1000, 500).indexOf("Smaller by 50%"), 0, "saved text"); eq(/^Larger/.test(C.savedText(500, 1000)), true, "larger text");
const used = {}; eq(C.outName("My Photo.png", "webp", used), "My Photo-compressed.webp", "name"); eq(C.outName("My Photo.jpg", "webp", used), "My Photo-compressed-2.webp", "unique name"); eq(C.outName("a/b\\c:d.pdf", "pdf", {}), "c_d-compressed.pdf", "illegal chars");
// target size search: bytes grow with quality
const enc = (q) => Promise.resolve(Math.round(1000 + 99000 * q * q));
(async () => {
  let r = await C.fitQuality(enc, 200000); eq(r.q, 0.95, "already small: keeps max quality");
  r = await C.fitQuality(enc, 30000); eq(r.ok, true, "found"); eq(r.bytes <= 30000, true, "within target"); eq(r.q > 0.3 && r.q < 0.95, true, "between bounds"); eq(30000 - r.bytes < 1500, true, "close to the target");
  r = await C.fitQuality(enc, 100); eq(r.ok, false, "impossible target"); eq(r.q, 0.3, "gives the lowest quality");
  console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
})();
