// node tool_apps_src/video-tests.js  -- MESVed: timeline maths of the MES Video Editor (mes.fm/video)
"use strict";
const V = require("./video/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= (tol || 1e-9), m + " (got " + a + ", want " + b + ")"); }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function clip(o) { return V.clipDefaults(Object.assign({ id: "c" + Math.random().toString(36).slice(2, 7), type: "video", track: "v1", media: "m1", start: 0, in: 0, out: 10 }, o)); }
function proj(clips) { const p = V.newProject(); p.clips = clips; return p; }

// timing + speed
{
	const c = clip({ start: 5, in: 2, out: 8, speed: 2 });
	near(V.dur(c), 3, 0, "duration at 2x"); near(V.end(c), 8, 0, "end"); near(V.srcAt(c, 6), 4, 0, "source time at 2x"); near(V.timeAtSrc(c, 4), 6, 0, "inverse");
}
// placing without overlap
{
	const a = clip({ id: "a", start: 0, out: 5 }), b = clip({ id: "b", start: 10, out: 5 }), p = proj([a, b]);
	ok(V.canPlace(p, "v1", 5, 5), "fits exactly in the gap"); ok(!V.canPlace(p, "v1", 4, 2), "overlaps a"); ok(!V.canPlace(p, "v1", -1, 1), "no negative start");
	ok(V.canPlace(p, "v1", 2, 2, { a: 1 }), "ignoring the moved clip");
	near(V.fitOnTrack(p, "v1", 4, 3), 5, 1e-9, "pushed into the gap"); near(V.fitOnTrack(p, "v1", 9, 6), 15, 1e-9, "too long for the gap -> after b");
	near(V.fitOnTrack(p, "v1", 3, 3, { a: 1 }), 3, 1e-9, "own place ignored"); near(V.duration(p), 15, 0, "project duration");
}
// snapping
{
	const p = proj([clip({ id: "a", start: 0, out: 5 })]); p.marks.in = 7;
	const pts = V.snapPoints(p, null, [3.2]);
	eq(V.snap(5.05, pts, 0.1), { t: 5, snapped: true, point: 5 }, "snaps to the clip end");
	eq(V.snap(7.3, pts, 0.1).snapped, false, "too far");
	near(V.snap(3.25, pts, 0.1).t, 3.2, 1e-9, "snaps to the playhead");
	ok(V.snapPoints(p, { a: 1 }).indexOf(5) < 0, "own edges ignored");
}
// split
{
	const c = clip({ id: "a", start: 10, in: 1, out: 9, speed: 2, fin: 0.5, fout: 0.5 });
	const r = V.split(c, 12, "b");
	near(r[0].out, 5, 1e-9, "left out point at source 5"); near(r[1].in, 5, 1e-9, "right in point"); near(r[1].start, 12, 0, "right start");
	near(V.end(r[0]), 12, 1e-9, "left ends at the cut"); near(V.end(r[1]), V.end(c), 1e-9, "right ends where the clip ended");
	eq([r[0].fin, r[0].fout, r[1].fin, r[1].fout], [0.5, 0, 0, 0.5], "fades stay on the outer ends");
	ok(V.split(c, 10, "x") === null && V.split(c, 14, "x") === null, "no split at the edges");
	const t = clip({ type: "text", start: 0, in: 0, out: 6 }), rt = V.split(t, 2, "t2");
	eq([rt[0].in, rt[0].out, rt[1].in, rt[1].out, rt[1].start], [0, 2, 0, 4, 2], "titles split by length");
}
// trim
{
	const c = clip({ start: 10, in: 4, out: 8 });
	eq(V.trim(c, "l", 8, { mediaDur: 20 }), { start: 8, in: 2, out: 8 }, "left edge out: earlier in point");
	eq(V.trim(c, "l", 2, { mediaDur: 20 }), { start: 6, in: 0, out: 8 }, "cannot go before the start of the media");
	eq(V.trim(c, "l", 9, { mediaDur: 20, lo: 9.5 }), { start: 9.5, in: 3.5, out: 8 }, "stops at the clip before");
	eq(V.trim(c, "r", 30, { mediaDur: 20 }), { start: 10, in: 4, out: 20 }, "right edge stops at the media end");
	eq(V.trim(c, "r", 13, { mediaDur: 20, hi: 12 }), { start: 10, in: 4, out: 6 }, "right edge stops at the next clip");
	const s = clip({ type: "image", start: 2, in: 0, out: 5 });
	eq(V.trim(s, "l", 0, { mediaDur: Infinity }), { start: 0, in: 0, out: 7 }, "a still image grows to the left");
	eq(V.trim(s, "r", 20, { mediaDur: Infinity }), { start: 2, in: 0, out: 18 }, "and to the right");
	const f = clip({ start: 0, in: 0, out: 10, speed: 2 }); eq(V.trim(f, "r", 4, { mediaDur: 10 }), { start: 0, in: 0, out: 8 }, "speed: 4 s on the timeline = 8 s of source");
}
// delete, ripple, range
{
	const a = clip({ id: "a", start: 0, out: 5 }), b = clip({ id: "b", start: 5, out: 5 }), c = clip({ id: "c", start: 10, out: 5 }), d = clip({ id: "d", track: "a1", type: "audio", start: 6, out: 4 });
	const p = V.removeClips(proj([a, b, c, d]), ["b"], true);
	eq(p.clips.map(x => [x.id, x.start]), [["a", 0], ["c", 5], ["d", 6]], "ripple delete closes the gap on that track only");
	const q = proj([clip({ id: "a", start: 0, in: 0, out: 10 }), clip({ id: "t", type: "text", start: 0, in: 0, out: 10, track: "v2" })]);
	V.removeRange(q, 3, 5, () => "n");
	const s = q.clips.map(x => [x.id, x.start, x.in, x.out]).sort();
	eq(s, [["a", 0, 0, 3], ["n", 3, 5, 10], ["n", 3, 0, 5], ["t", 0, 0, 3]].sort(), "range cut out of both tracks, gap closed");
	near(V.duration(q), 8, 1e-9, "2 seconds shorter");
	const lk = proj([clip({ id: "a", start: 0, out: 10 })]); lk.tracks[0].lock = true; V.removeRange(lk, 2, 4); near(V.duration(lk), 10, 0, "locked tracks untouched");
}
// visibility, fades, cross-fades, gain
{
	const a = clip({ id: "a", start: 0, out: 5, fin: 1 }), b = clip({ id: "b", start: 5, in: 2, out: 7, xin: 1 }), top = clip({ id: "t", type: "text", track: "v1", start: 0, out: 10 });
	a.track = b.track = "v2";
	const p = proj([a, b, top]);
	near(V.envelope(a, 0.5), 0.5, 1e-9, "fade in halfway");
	let L = V.layersAt(p, 4.5);
	eq(L.map(x => x.clip.id), ["a", "b", "t"], "during the cross-fade both clips, the top track last");
	near(L[1].alpha, 0.5, 1e-9, "incoming clip half way"); near(L[1].src, 1.5, 1e-9, "pre-roll shows the source before its in point");
	near(V.gainAt(p, a, 4.5), 0.5, 1e-9, "outgoing sound fades"); near(V.gainAt(p, b, 4.5), 0.5, 1e-9, "incoming sound fades in");
	near(V.gainAt(p, b, 6), 1, 1e-9, "after the cross-fade full volume");
	p.tracks[0].hide = true; eq(V.layersAt(p, 6).map(x => x.clip.id), ["b"], "hidden track not drawn");
	p.tracks[1].mute = true; near(V.gainAt(p, b, 6), 0, 0, "muted track silent");
	ok(V.layersAt(p, 20).length === 0, "nothing after the end");
	const g = V.gainCurve(proj([clip({ id: "z", start: 0, out: 1, fout: 1 })]), V.clipDefaults(clip({ id: "z", start: 0, out: 1, fout: 1 })), 0, 48000, 48000);
	ok(g[0] > 0.99 && g[47999] < 0.01 && g[24000] > 0.45 && g[24000] < 0.55, "gain curve follows the fade-out");
}
// mixing + resampling
{
	const rate = 48000, src = new Float32Array(rate); for (let i = 0; i < rate; i++) src[i] = Math.sin(2 * Math.PI * 440 * i / rate);
	const out = [new Float32Array(1000)];
	V.mixInto(out, 0, 1000, { start: 0, rate: rate, ch: [src] }, 0, 1 / rate, null);
	let err = 0; for (let i = 0; i < 1000; i++) err = Math.max(err, Math.abs(out[0][i] - src[i])); ok(err < 1e-6, "same rate copies exactly");
	const r44 = V.resample([src.subarray(0, 4800)], 48000, 44100); near(r44[0].length, 4410, 0, "48k -> 44.1k length");
	let e2 = 0; for (let i = 10; i < 4400; i++) e2 = Math.max(e2, Math.abs(r44[0][i] - Math.sin(2 * Math.PI * 440 * i / 44100))); ok(e2 < 2e-3, "resampled sine stays a sine (" + e2.toFixed(5) + ")");
	const twice = [new Float32Array(100)]; V.mixInto(twice, 0, 100, { start: 0, rate: rate, ch: [src] }, 0, 2 / rate, null); near(twice[0][10], src[20], 1e-6, "2x speed reads every other sample");
	const lim = [new Float32Array([2, -3, 0.5])]; V.limit(lim); ok(lim[0][0] <= 1 && lim[0][1] >= -1 && lim[0][2] === 0.5, "limiter");
}
// loudness
{
	const rate = 48000, n = rate * 3, l = new Float32Array(n), r = new Float32Array(n);
	for (let i = 0; i < n; i++) { l[i] = Math.sin(2 * Math.PI * 997 * i / rate); }
	near(V.lufs([l, new Float32Array(n)], rate), -3.01, 0.05, "997 Hz full-scale sine, one channel = -3.01 LUFS");
	for (let i = 0; i < n; i++) r[i] = l[i];
	near(V.lufs([l, r], rate), 0, 0.05, "both channels = 0 LUFS");
	const q = l.map(x => x * 0.1); near(V.lufs([q], rate), -23.01, 0.05, "-20 dB sine = -23 LUFS");
	ok(V.lufs([new Float32Array(n)], rate) === -Infinity, "silence");
	{ const m = new V.LufsMeter(rate); for (let o = 0; o < n; o += 7001) m.push([l.subarray(o, Math.min(n, o + 7001)), r.subarray(o, Math.min(n, o + 7001))]); near(m.result(), V.lufs([l, r], rate), 1e-3, "meter in pieces = in one go"); near(m.peak, 1, 1e-3, "meter peak"); }
	{ const m = new Float32Array(44100 * 3); for (let i = 0; i < m.length; i++) m[i] = Math.sin(2 * Math.PI * 997 * i / 44100); near(V.lufs([m], 44100), -3.01, 0.05, "44.1 kHz K-weighting"); }
	near(V.normalizeGain(-23, 0.1, -16, -1), Math.pow(10, 7 / 20), 1e-9, "+7 dB to reach -16");
	near(V.normalizeGain(-30, 0.8, -16, -1), Math.pow(10, -1 / 20) / 0.8, 1e-9, "peak ceiling wins");
	const pk = V.peaks([new Float32Array([0, 0.25, -1, 0])], 4, 2); eq(Array.from(pk), [128, 255], "waveform peaks");
}
// placement
{
	const r = V.place(1920, 1080, { x: 0.5, y: 0.5, scale: 1 }, 1280, 720); eq([r.dx, r.dy, r.dw, r.dh], [0, 0, 1280, 720], "fits a 16:9 frame");
	const s = V.place(1080, 1080, { x: 0.5, y: 0.5, scale: 0.5 }, 1920, 1080); eq([r.sx, s.dw, s.dh, s.dx, s.dy], [0, 540, 540, 690, 270], "square at half size, centred");
	const c = V.place(100, 100, { x: 0.5, y: 0.5, scale: 1, crop: { l: 0.5, t: 0, r: 0, b: 0 } }, 100, 100); eq([c.sx, c.sw, c.dx, c.dw], [50, 50, 50, 50], "crop keeps the right half where it was");
	ok(V.hit(s, 700, 300) && !V.hit(s, 10, 10), "hit test");
	eq(V.exportSize({ w: 2672, h: 1504 }, "1080"), { w: 1918, h: 1080 }, "owner's 2672x1504 at 1080p");
	eq(V.exportSize({ w: 2672, h: 1504 }, "project"), { w: 2672, h: 1504 }, "same as the project");
	ok(V.bitrate(1920, 1080, 30, "balanced") > 4e6 && V.bitrate(1920, 1080, 30, "balanced") < 8e6, "1080p30 bitrate");
	eq(V.avcCodec(1920, 1080, 30), "avc1.640028", "level 4.0 for 1080p30"); eq(V.avcCodec(1280, 720, 30), "avc1.64001f", "level 3.1 for 720p30"); eq(V.avcCodec(3840, 2160, 30), "avc1.640033", "level 5.1 for 4K");
}
// time codes, ticks, history, normalize
{
	eq(V.tc(3723.5, 30), "1:02:03;15", "time code"); eq(V.tc(5, 30), "0:05;00", "short"); near(V.parseTime("1:02:03;15", 30), 3723.5, 1e-9, "parse time code"); near(V.parseTime("90"), 90, 0, "parse seconds");
	ok(V.parseTime("a:b") === null, "bad time"); eq(V.short(65.25), "1:05.3", "short time");
	near(V.tickStep(100), 1, 0, "1 s ticks at 100 px/s"); near(V.tickStep(2), 60, 0, "1 min ticks when zoomed out");
	const h = new V.History(3); ["a", "b", "c", "d"].forEach(x => h.push(x)); eq(h.undo(), "c", "undo"); eq(h.undo(), "b", "undo 2"); ok(h.undo() === null, "only 3 kept"); eq(h.redo(), "c", "redo"); h.push("e"); ok(!h.canRedo(), "new edit drops redo");
	const n = V.normalize({ w: 1921, h: 1080, fps: 500, tracks: [{ id: "v1", kind: "v" }, { id: "bad", kind: "x" }], clips: [{ id: "a", track: "v1", start: 0, in: 0, out: 2 }, { id: "b", track: "bad", start: 0, in: 0, out: 2 }, { id: "c", track: "v1", start: 0, in: 2, out: 1 }] });
	eq([n.w, n.fps, n.tracks.length, n.clips.length, n.clips[0].speed], [1920, 120, 1, 1, 1], "normalize a loaded project");
	ok(V.frameSnap(1.016, 30) === 1, "frame snap");
}
/* WAV for the noise-removed sound at other preview speeds */
{
	var wv = new DataView(V.wav16([new Float32Array([0, 0.5, -1, 2]), new Float32Array([1, -0.5, 0, 0])], 48000));
	ok(wv.byteLength === 44 + 16 && String.fromCharCode(wv.getUint8(8), wv.getUint8(9), wv.getUint8(10), wv.getUint8(11)) === "WAVE", "WAV header");
	ok(wv.getUint16(22, true) === 2 && wv.getUint32(24, true) === 48000 && wv.getUint16(34, true) === 16, "2 channels, 48 kHz, 16-bit");
	ok(wv.getInt16(44, true) === 0 && wv.getInt16(46, true) === 32767 && wv.getInt16(48, true) === 16384 && wv.getInt16(52, true) === -32768 && wv.getInt16(56, true) === 32767, "interleaved, clipped to the 16-bit range");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
