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
// muxer frame rate (mp4-muxer snaps timestamps to it)
eq(V.muxFrameRate(30, 30, true), 30, "30 fps CFR"); eq(V.muxFrameRate(60, 30, true), 30, "60 -> 30 keeps every other frame"); eq(V.muxFrameRate(29.97, 29.97, true), undefined, "29.97: no grid");
eq(V.muxFrameRate(29.28, 29.28, false), undefined, "phone VFR: none"); eq(V.muxFrameRate(30, 30, false), undefined, "not constant: none"); eq(V.muxFrameRate(25, 24, true), undefined, "25 capped at 24 keeps all frames: none");
eq(V.muxFrameRate(50, 30, true), undefined, "50 capped at 30 = 25 fps really: none"); eq(V.muxFrameRate(120, 60, true), 60, "120 -> 60"); eq(V.muxFrameRate(0, 30, true), undefined, "unknown");
// codecs
eq(V.avcCodec(1280, 720, 30), "avc1.64001f", "720p30 L3.1"); eq(V.avcCodec(1920, 1080, 30), "avc1.640028", "1080p30 L4.0"); eq(V.avcCodec(3840, 2160, 30), "avc1.640032", "4K30 L5.0");
eq(V.avcCodec(3840, 2160, 60), "avc1.640034", "4K60 L5.2"); eq(V.vp9Codec(1280, 720), "vp09.00.31.08", "vp9 720"); eq(V.vp9Codec(1920, 1080), "vp09.00.40.08", "vp9 1080");
// bitrates
const b1 = V.presetBitrate(1920, 1080, 30, "balanced", "avc1", 0); ok(Math.abs(b1 - 1920 * 1080 * 30 * 0.05) < 2, "fallback balanced 1080p30 ~3.1 Mbps");
eq(V.presetBitrate(1920, 1080, 30, "balanced", "vp09", 0), b1, "fallback: VP9 not assumed smaller"); eq(V.presetBitrate(1920, 1080, 30, "high", "avc1", 2000000), 1700000, "capped at 85% of source");
ok(V.presetBitrate(1920, 1080, 30, "smallest", "avc1", 0) < V.presetBitrate(1920, 1080, 30, "small", "avc1", 0), "preset order"); ok(V.presetBitrate(64, 64, 1, "smallest", "avc1", 0) >= 80000, "floor");
// constant quality: presets, key-frame interval
eq(V.presetQ("balanced"), 23.5, "balanced q 23.5"); ok(V.presetQ("high") < V.presetQ("balanced") && V.presetQ("balanced") < V.presetQ("small") && V.presetQ("small") < V.presetQ("smallest"), "q order"); eq(V.presetQ("nonsense"), 23.5, "unknown preset = balanced");
eq(V.keyEvery(30), 300, "key frame every 10 s at 30 fps"); eq(V.keyEvery(0), 300, "unknown fps"); eq(V.keyEvery(29.97), 300, "29.97"); eq(V.keyEvery(60), 600, "60 fps");
// probe windows
function tl(n, fps, keyEvery) { const t = [], k = []; for (let i = 0; i < n; i++) { t.push(i / fps); k.push(i % keyEvery === 0); } return [t, k]; }
let [tt, kk] = tl(2372, 30, 60); let w = V.probeWindows(tt, kk, 79.2);
eq(w.length, 7, "79 s video: 7 windows"); ok(w.every(x => kk[x.i] && x.n === 42), "each starts on a key frame, 42 frames"); ok(w.every((x, j) => j === 0 || x.i > w[j - 1].i), "ascending, distinct");
ok(w[0].i < 300 && w[6].i > 1900, "spread through the video"); ok(w.reduce((a, x) => a + x.n, 0) <= 300, "about 300 frames in all");
[tt, kk] = tl(900, 30, 900); w = V.probeWindows(tt, kk, 30); eq(w, [{ i: 0, n: 150 }], "one key frame only: one longer window at the start");
[tt, kk] = tl(600, 30, 300); w = V.probeWindows(tt, kk, 20); eq(w, [{ i: 0, n: 60 }, { i: 300, n: 60 }], "10 s key frames, 20 s: two windows");
[tt, kk] = tl(40, 30, 10); w = V.probeWindows(tt, kk, 40 / 30); ok(w.length >= 1 && w.every(x => x.i + x.n <= 40), "short clip stays inside the video");
[tt, kk] = tl(30, 30, 1); w = V.probeWindows(tt, kk, 1); ok(w.every((x, j) => j + 1 >= w.length || x.i + x.n <= w[j + 1].i), "windows do not overlap");
eq(V.probeWindows([], [], 10), [], "no samples"); eq(V.probeWindows([0, 0.1, 0.2], [false, false, false], 0.3), [{ i: 0, n: 3 }], "no key flags: from the start");
// size model
const pr = { q: 24, s: 6, bitsP: 1000, bitsK: 50000 };
ok(Math.abs(V.cqVideoBps(pr, 24, 10, 30) - (299 * 1000 + 50000) / 10) < 1e-6, "model at the probe q"); ok(Math.abs(V.cqVideoBps(pr, 30, 10, 30) * 2 - V.cqVideoBps(pr, 24, 10, 30)) < 1e-6, "+6 q halves the bits");
ok(Math.abs(V.cqVideoBps(pr, 24, 100, 30) - (2990 * 1000 + 10 * 50000) / 100) < 1e-6, "one key frame per 10 s"); ok(Math.abs(V.qForBps(pr, V.cqVideoBps(pr, 27.3, 60, 30), 60, 30) - 27.3) < 1e-9, "qForBps inverts the model");
eq(V.probeSlope(24, 1000, 30, 500), 6, "slope 6"); eq(V.probeSlope(24, 1000, 30, 900), null, "bits barely dropped: quantizer ignored"); eq(V.probeSlope(24, 1000, 30, 100), 4, "slope clamped low"); eq(V.probeSlope(24, 0, 30, 0), null, "no bits");
ok(Math.abs(V.probeSlope(24, 1000, 30, 600) - 6 / Math.log2(1 / 0.6)) < 1e-9, "slope formula");
let c = V.chooseQ(pr, { goal: "preset", preset: "balanced", dur: 60, fps: 30 }); eq([c.q, c.why], [23.5, ""], "balanced = q 23.5"); ok(Math.abs(c.bps - V.cqVideoBps(pr, 23.5, 60, 30)) <= 1, "estimate");
c = V.chooseQ(pr, { goal: "preset", preset: "high", capBps: 10000, dur: 60, fps: 30 }); eq(c.why, "capped", "capped by the source"); ok(c.q > 24 && c.bps <= 10000 * 1.01 && c.bps > 10000 * 0.9, "capped estimate at the cap");
c = V.chooseQ(pr, { goal: "preset", preset: "balanced", capBps: 1e9, dur: 60, fps: 30 }); eq(c.q, 23.5, "loose cap does nothing");
c = V.chooseQ(pr, { goal: "target", targetBps: 1e7, dur: 60, fps: 30 }); eq([c.q, c.why], [21, "roomy"], "big target: High quality, smaller than asked");
c = V.chooseQ(pr, { goal: "target", targetBps: 20000, dur: 60, fps: 30 }); ok(c.q > 24 && c.bps <= 20000 * 0.97 * 1.04 && c.bps >= 20000 * 0.97 * 0.96, "tight target: q from the model, ~3% under"); ok(c.q * 4 === Math.round(c.q * 4), "quarter steps");
c = V.chooseQ(pr, { goal: "target", targetBps: 1, dur: 60, fps: 30 }); eq(c.q, 51, "impossible target clamps at 51");
const pr2 = { q: 24, bitsP: 1000, bitsK: 50000, sP: 8, sK: 5 };
ok(Math.abs(V.cqVideoBps(pr2, 32, 10, 30) - (299 * 500 + 50000 * Math.pow(2, -8 / 5)) / 10) < 1e-6, "key and delta frames shrink at their own rate");
ok(Math.abs(V.qForBps(pr2, V.cqVideoBps(pr2, 28.75, 60, 30), 60, 30) - 28.75) < 1e-6, "qForBps inverts the split model");
eq(V.slopeOf(24, 1000, 30, 950), 14, "still picture: delta frames barely shrink (clamped)"); eq(V.slopeOf(24, 1000, 30, 1200), 14, "grew: clamped"); eq(V.slopeOf(24, 1000, 30, 500), 6, "slopeOf 6"); eq(V.slopeOf(24, 0, 30, 1), null, "slopeOf no bits");
let st = V.qStepper(23.5), seq = [st(), st(), st(), st()]; eq(seq, [24, 23, 24, 23], "23.5 alternates"); st = V.qStepper(24.25); let sum = 0; for (let i = 0; i < 400; i++) sum += st(); eq(sum, 24.25 * 400, "24.25 averages out");
st = V.qStepper(24); ok([st(), st(), st()].every(x => x === 24), "whole q stays"); st = V.qStepper(60); eq(st(), 51, "clamped to 51");
eq(V.retuneQ(24, 6, 25 * MB, 25 * MB * 1.02, 0), null, "within 3%"); eq(V.retuneQ(24, 6, 25 * MB, 20 * MB, 0), null, "under");
let rq = V.retuneQ(24, 6, 25 * MB, 30 * MB, 1 * MB); ok(rq > 24 + 6 * Math.log2(29 / (25 * 0.97 - 1)) && rq < 27, "retune raises q enough to land under");
ok(V.VBR_FACTOR.vp9 > 1 && V.VBR_FACTOR.sw > V.VBR_FACTOR.vp9, "VBR factors");
ok(V.needs8bit("hvc1.2.4.L120.b0") && V.needs8bit("hev1.2.4.L153.B0") && !V.needs8bit("hvc1.1.6.L120.B0") && !V.needs8bit("avc1.640028") && V.needs8bit("avc1.6E0028") && V.needs8bit("vp09.02.10.10") && !V.needs8bit("vp09.00.40.08") && V.needs8bit("av01.0.08M.10") && !V.needs8bit("av01.0.08M.08") && !V.needs8bit(""), "10-bit detection");
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
