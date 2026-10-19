// node tool_apps_src/compress-video-tests.js
const V = require("./compress-video/lib.js"); let n = 0, bad = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log("FAIL", m, "got", JSON.stringify(a), "want", JSON.stringify(b)); } }
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
const MB = 1048576;
// size parsing
eq(V.parseSize("25 MB"), 25 * MB, "25 MB"); eq(V.parseSize("25mb"), 25 * MB, "25mb"); eq(V.parseSize("25"), 25 * MB, "bare = MB"); eq(V.parseSize("1.5 GB"), 1.5 * 1073741824, "1.5 GB");
eq(V.parseSize("800 kb"), 800 * 1024, "kb"); eq(V.parseSize("1,024 MB"), 1024 * MB, "comma"); eq(V.parseSize("8M"), 8 * MB, "8M"); eq(V.parseSize("0"), null, "zero"); eq(V.parseSize("abc"), null, "text"); eq(V.parseSize(""), null, "empty"); eq(V.parseSize("-5 MB"), null, "negative"); eq(V.parseSize(1000), 1000, "number");
// dims
eq(V.fitDims(3840, 2160, 1080), { w: 1920, h: 1080, scaled: true }, "4K to 1080"); eq(V.fitDims(2160, 3840, 1080), { w: 1080, h: 1920, scaled: true }, "portrait 4K");
eq(V.fitDims(1280, 720, 1080), { w: 1280, h: 720, scaled: false }, "no enlarge"); eq(V.fitDims(1921, 1081, 0), { w: 1920, h: 1080, scaled: false }, "even"); eq(V.fitDims(1920, 1080, 480), { w: 852, h: 480, scaled: true }, "480");
ok(V.fitDims(1000, 563, 360).w % 2 === 0 && V.fitDims(1000, 563, 360).h % 2 === 0, "even after scale");
// rotation
eq(V.rotationFromMatrix([65536, 0, 0, 0, 65536, 0]), 0, "rot 0"); eq(V.rotationFromMatrix([0, 65536, 0, -65536, 0, 0]), 90, "rot 90"); eq(V.rotationFromMatrix([-65536, 0, 0, 0, -65536, 0]), 180, "rot 180"); eq(V.rotationFromMatrix([0, -65536, 0, 65536, 0, 0]), 270, "rot 270"); eq(V.rotationFromMatrix(null), 0, "no matrix");
// fps
eq(V.outFps(60, 30), 30, "cap 60 to 30"); eq(V.outFps(24, 30), 24, "never up"); eq(V.outFps(29.97, 0), 29.97, "keep"); eq(V.outFps(0, 0), 30, "unknown");
let last = null, kept = 0; for (let i = 0; i < 60; i++) { const ts = i * 1e6 / 60; if (V.keepFrame(ts, last, 30)) { last = ts; kept++; } } eq(kept, 30, "60 -> 30 keeps half");
last = null; kept = 0; for (let i = 0; i < 24; i++) { const ts = i * 1e6 / 24; if (V.keepFrame(ts, last, 30)) { last = ts; kept++; } } eq(kept, 24, "24 stays 24");
// codecs
eq(V.avcCodec(1280, 720, 30), "avc1.64001f", "720p30 L3.1"); eq(V.avcCodec(1920, 1080, 30), "avc1.640028", "1080p30 L4.0"); eq(V.avcCodec(3840, 2160, 30), "avc1.640032", "4K30 L5.0");
eq(V.avcCodec(3840, 2160, 60), "avc1.640034", "4K60 L5.2"); eq(V.vp9Codec(1280, 720), "vp09.00.31.08", "vp9 720"); eq(V.vp9Codec(1920, 1080), "vp09.00.40.08", "vp9 1080");
// bitrates
const b1 = V.presetBitrate(1920, 1080, 30, "balanced", "avc1", 0); ok(Math.abs(b1 - 1920 * 1080 * 30 * 0.07) < 2, "balanced 1080p30 ~4.3 Mbps");
ok(V.presetBitrate(1920, 1080, 30, "balanced", "vp09", 0) < b1, "vp9 smaller"); eq(V.presetBitrate(1920, 1080, 30, "high", "avc1", 2000000), 1700000, "capped at 85% of source");
ok(V.presetBitrate(1920, 1080, 30, "smallest", "avc1", 0) < V.presetBitrate(1920, 1080, 30, "small", "avc1", 0), "preset order"); ok(V.presetBitrate(64, 64, 1, "smallest", "avc1", 0) >= 80000, "floor");
// target size: 25 MB for 120 s with 128 kbps audio
let t = V.targetBitrate(25 * MB, 120, 128000, 1920, 1080, 30); ok(Math.abs(t.videoBps - (25 * MB * 8 * 0.97 / 120 - 128000)) <= 1, "video bitrate for target"); ok(t.feasible, "feasible");
ok(Math.abs(V.estimateBytes(t.videoBps, 128000, 120) - 25 * MB) < 25 * MB * 0.01, "estimate round-trips to target within 1%");
t = V.targetBitrate(1 * MB, 600, 128000, 1920, 1080, 30); eq(t.feasible, false, "1 MB for 10 min is not feasible"); eq(t.videoBps, 60000, "floor"); t = V.targetBitrate(10 * MB, 60, 0, 1920, 1080, 30); ok(t.tight === false || t.bpp > 0, "no audio ok");
t = V.targetBitrate(5 * MB, 300, 128000, 1920, 1080, 30); eq(t.tight, true, "5 MB for 5 min 1080p is tight");
eq(V.retuneBitrate(1000000, 25 * MB, 25 * MB * 1.02), null, "within 3%"); eq(V.retuneBitrate(1000000, 25 * MB, 20 * MB), null, "under target"); const r = V.retuneBitrate(1000000, 25 * MB, 30 * MB); ok(r < 1000000 * 25 / 30 && r > 700000, "retune lowers ~");
// audio
eq(V.audioBps("128", 0), 128000, "128"); eq(V.audioBps("none", 0), 0, "none"); eq(V.audioBps("keep", 96000), 96000, "keep"); eq(V.audioBps("keep", 0), 128000, "keep unknown");
// profile + defaults
eq(V.profile({ cores: 10, mem: 8 }).level, "strong", "strong"); eq(V.profile({ cores: 10, mem: 8 }).defaultCap, 0, "strong keeps size"); eq(V.profile({ cores: 4, mem: 8 }).level, "modest", "4 cores modest");
eq(V.profile({ cores: 8, mem: 4 }).maxShort, 1080, "4 GB modest"); eq(V.profile({ cores: 2, mem: 2 }).level, "weak", "weak"); eq(V.profile({ cores: 2, mem: 2 }).defaultCap, 720, "weak caps 720"); eq(V.profile({}).level, "modest", "unknown is modest (4 cores assumed)");
eq(V.profile({ cores: 8 }).level, "strong", "no deviceMemory (Safari/Firefox) still strong with cores"); ok(V.profile({ cores: 8, mem: 8 }).memLimit > V.profile({ cores: 8, mem: 2 }).memLimit, "memLimit grows with memory");
eq(V.chooseFormat({ h264: true, vp9: true }, false), "mp4", "mp4 default"); eq(V.chooseFormat({ h264: true, vp9: true }, true), "webm", "webm wanted"); eq(V.chooseFormat({ h264: false, vp9: true }, false), "webm", "only vp9"); eq(V.chooseFormat({ h264: true, vp9: false }, true), "mp4", "webm unavailable");
// warnings
const strong = { cores: 10, mem: 8, freeBytes: 500 * 1073741824, fs: true, h264: true };
eq(V.warnings({ durationSec: 60, outW: 1920, outH: 1080, estBytes: 40 * MB, toDisk: false, engine: "webcodecs" }, strong), [], "no warnings normally");
ok(V.warnings({ durationSec: 60, outW: 1920, outH: 1080, estBytes: 40 * MB, toDisk: false, engine: "recorder" }, strong).length === 1, "recorder warns");
ok(/may not fit/.test(V.warnings({ durationSec: 60, outW: 1920, outH: 1080, estBytes: 900 * MB, toDisk: true, engine: "webcodecs" }, { cores: 8, mem: 8, freeBytes: 500 * MB })[0]), "disk warning");
ok(/held in memory.*Save straight to disk/.test(V.warnings({ durationSec: 600, outW: 1920, outH: 1080, estBytes: 3000 * MB, toDisk: false, engine: "webcodecs" }, strong)[0]), "memory warning with fs");
ok(V.warnings({ durationSec: 600, outW: 1920, outH: 1080, estBytes: 3000 * MB, toDisk: true, engine: "webcodecs" }, strong).length === 0, "disk streaming silences memory warning");
ok(/heavy/.test(V.warnings({ durationSec: 60, outW: 3840, outH: 2160, estBytes: 50 * MB, toDisk: false, engine: "webcodecs" }, { cores: 4, mem: 4, freeBytes: 1e12 })[0]), "4K on modest device warns");
eq(V.warnings({ durationSec: 60, outW: 3840, outH: 2160, estBytes: 50 * MB, toDisk: false, engine: "webcodecs" }, strong), [], "4K fine on strong");
// names
const used = {}; eq(V.outName("My Clip.MOV", "mp4", used), "My Clip-compressed.mp4", "name"); eq(V.outName("My Clip.mp4", "mp4", used), "My Clip-compressed-2.mp4", "dedupe"); eq(V.outName("a/b:c.mp4", "webm", {}), "b_c-compressed.webm", "sanitise");
ok(V.isVideo("x.MP4", "") && V.isVideo("x", "video/webm") && !V.isVideo("x.png", "image/png"), "isVideo"); ok(V.isMp4Family("a.mov", "") && !V.isMp4Family("a.webm", "video/webm"), "mp4 family");
eq(V.formatBytes(25 * MB), "25.0 MB", "fmt"); eq(V.formatTime(3725), "1:02:05", "time"); eq(V.formatBitrate(4300000), "4.30 Mbps", "bitrate");
console.log(bad ? bad + " of " + n + " FAILED" : "all " + n + " checks passed"); process.exit(bad ? 1 : 0);
