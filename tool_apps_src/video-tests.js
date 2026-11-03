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

/* magnetic tracks */
{
	const a = clip({ id: "a", start: 3, out: 5 }), b = clip({ id: "b", start: 12, out: 4 }), c = clip({ id: "c", start: 20, out: 2 }), p = proj([b, a, c]);
	V.pack(p, "v1"); eq([a.start, b.start, c.start], [0, 5, 9], "pack closes every gap, keeping the order");
	V.removeClips(p, ["b"], false); V.pack(p, "v1"); eq([a.start, c.start], [0, 5], "after a delete the clips close up");
	const d = clip({ id: "d", out: 3 }); p.clips.push(d);
	V.magnetInsert(p, "v1", "d", 1); eq([d.start, a.start, c.start], [0, 3, 8], "dropped near the start: goes first");
	V.magnetInsert(p, "v1", "d", 4.5); eq([a.start, d.start, c.start], [0, 5, 8], "dropped past a's middle: goes after a");
	V.magnetInsert(p, "v1", "d", 50); eq([a.start, c.start, d.start], [0, 5, 7], "dropped far right: last, no gap");
	V.magnetInsert(p, "v1", "d", 50); eq([a.start, c.start, d.start], [0, 5, 7], "same place again: stable");
	const q = proj([clip({ id: "x", start: 4, out: 2 }), clip({ id: "y", start: 9, out: 2, track: "v2" })]); q.tracks[0].mag = true;
	V.applyMagnets(q); eq([V.clip(q, "x").start, V.clip(q, "y").start], [0, 9], "only magnetic tracks are packed");
	const n = V.normalize({ tracks: [{ id: "v1", kind: "v", mag: true, h: 9999 }, { id: "a1", kind: "a", h: 120 }], clips: [] });
	eq([n.tracks[0].mag, n.tracks[0].h, n.tracks[1].mag, n.tracks[1].h], [true, V.ROW_MAX, false, 120], "magnet and track height are kept (height clamped)");
	eq([V.rowH({ kind: "a" }), V.rowH({ kind: "v", h: 10 })], [V.ROW_DEFAULT.a, V.ROW_MIN], "row heights");
}
/* separated audio + links */
{
	const v = clip({ id: "v", start: 2, in: 1, out: 9, vol: 0.5, afx: { level: { on: true } } }), p = proj([v]);
	let made = 0;
	const a = V.separateAudio(p, "v", "a", "L1", () => { made++; const t = { id: "a9", kind: "a", name: "Audio 9" }; p.tracks.push(t); return t; });
	ok(a && a.type === "audio" && a.track === "a1" && made === 0, "the sound goes to the free audio track");
	eq([a.start, a.in, a.out, a.vol, a.link, v.link, v.noAudio, !!a.afx, v.afx], [2, 1, 9, 0.5, "L1", "L1", true, true, null], "audio clip copies timing, volume and effects; video goes silent");
	near(V.gainAt(p, v, 3), 0, 0, "the video clip itself makes no sound now"); near(V.gainAt(p, a, 3), 0.5, 1e-9, "the audio clip does");
	eq(V.withLinks(p, ["v"]).sort(), ["a", "v"], "selecting one selects its partner");
	v.start = 5; V.syncLinks(p); near(a.start, 5, 0, "partner follows the video");
	const r = V.splitAt(p, ["a"], 7, (() => { let k = 0; return () => "n" + (++k); })(), 1 / 30);
	eq(r.length, 2, "splitting one splits both"); const rv = p.clips.filter(c => r.indexOf(c.id) >= 0);
	ok(rv[0].link && rv[0].link === rv[1].link && rv[0].link !== "L1", "right halves share a new link"); eq(V.partners(p, V.clip(p, "v")).map(c => c.id), ["a"], "left halves keep theirs");
	const b2 = V.clip(p, "a"); b2.vol = 0.8; p.clips = p.clips.filter(c => r.indexOf(c.id) < 0); V.joinAudio(p, "v"); const v2 = V.clip(p, "v"); ok(!V.clip(p, "a") && !v2.noAudio && v2.vol === 0.8 && v2.link === null, "join puts the sound back");
	ok(V.separateAudio(p, "v", "z", "L2") && V.unlink(p, "v") && v2.link === null && V.clip(p, "z").link === null, "unlink");
	const q = proj([clip({ id: "v", start: 0, out: 4 }), clip({ id: "o", type: "audio", track: "a1", start: 1, out: 2 })]);
	const a2 = V.separateAudio(q, "v", "a", "L", () => { const t = { id: "a2", kind: "a" }; q.tracks.push(t); return t; });
	eq(a2.track, "a2", "audio track busy there: a new one is made");
	const m = proj([clip({ id: "v", start: 3, out: 4 }), clip({ id: "w", start: 0, out: 2 })]); m.tracks[0].mag = true;
	V.separateAudio(m, "v", "va", "LL"); V.applyMagnets(m); eq([V.clip(m, "v").start, V.clip(m, "va").start], [2, 2], "partner follows a packed video");
}
/* audio effects */
{
	near(V.compStatic(-30, -24, 4, 0), 0, 1e-9, "below the threshold: no change"); near(V.compStatic(-12, -24, 4, 0), -9, 1e-9, "12 dB over at 4:1 -> 9 dB less");
	near(V.compStatic(-24, -24, 4, 6), -0.75 * 9 / 12, 1e-9, "soft knee at the threshold"); ok(V.compStatic(-27.1, -24, 4, 6) === 0, "below the knee");
	near(V.compMakeup({ thr: -24, ratio: 1, knee: 0, makeup: null }), 0, 1e-12, "no compression, no make-up"); near(V.compMakeup({ thr: -20, ratio: 2, knee: 0, makeup: null }, -10), 5, 1e-9, "auto make-up = the reduction at the reference level"); near(V.compMakeup({ thr: -24, ratio: 3, knee: 0, makeup: null }), 4, 1e-9, "default reference -18 dBFS"); near(V.compMakeup({ thr: -24, ratio: 3, knee: 0, makeup: -2 }), -2, 0, "manual make-up");
	const hop = 0.01, lv = new Float32Array(300).fill(-6), cg = V.compGain(lv, { thr: -24, ratio: 3, knee: 0, att: 0.01, rel: 0.2 }, hop);
	near(cg[299], -12, 0.01, "steady state 18 dB over at 3:1 -> -12 dB"); ok(cg[0] > -12 && cg[0] < 0, "attack takes a moment");
	const rel = V.compGain(new Float32Array(400).map((x, i) => i < 200 ? -6 : -40), { thr: -24, ratio: 3, knee: 0, att: 0.01, rel: 0.2 }, hop);
	ok(rel[205] < -6 && rel[399] > -0.1, "release brings the gain back slowly");
	// leveler: 5 s quiet speech (-35), 3 s silence, 5 s loud (-12): both end near the target, the silence is not boosted further
	const rms = new Float32Array(1300).map((x, i) => i < 500 ? -35 : i < 800 ? -90 : -12), o = Object.assign({}, V.AFX_DEFAULT.level, { target: -20, maxUp: 20, maxDown: 20 });
	const lg = V.levelGain(rms, o, hop);
	near(rms[250] + lg[250], -20, 0.3, "quiet part raised to the target"); near(rms[1050] + lg[1050], -20, 0.3, "loud part lowered to the target");
	ok(Math.abs(lg[650] - lg[490]) < 4, "gain held through the silence"); ok(lg.every(g => g <= 20 && g >= -20), "within the limits");
	const lim = V.levelGain(new Float32Array(200).fill(-60), Object.assign({}, o, { gate: -70, maxUp: 6 }), hop); near(lim[100], 6, 1e-6, "max boost caps it");
	const lev = V.levels([new Float32Array(4800).map((x, i) => i < 2400 ? 0.5 : 0.05)], 48000, 0.01, 2);
	eq([lev.rms.length, lev.start], [10, 2], "10 ms blocks"); near(lev.rms[0], V.db(0.5), 1e-4, "RMS of a constant"); near(lev.peak[9], V.db(0.05), 1e-4, "peak");
	const env = V.fxEnvelope({ start: 1, hop: hop, rms: rms, peak: rms }, V.afxOf({ afx: { level: { on: true, target: -20, maxUp: 20, maxDown: 20 } } }));
	near(V.db(V.envAt(env, 1 + 2.5)), lg[250], 0.05, "envelope = the leveler alone"); near(V.envAt(env, -5), env.g[0], 0, "before the start: first value");
	const env1 = V.fxEnvelope({ start: 0, hop: hop, rms: rms, peak: rms }, V.afxOf({})); ok(env1.g.every(g => g === 1), "no effect on: unity");
	const both = V.fxEnvelope({ start: 0, hop: hop, rms: rms, peak: rms }, V.afxOf({ afx: { level: { on: true, maxUp: 20, maxDown: 20 }, comp: { on: true, thr: -30, ratio: 2, knee: 0, makeup: 0 } } }));
	near(rms[250] + V.db(both.g[250]), -25, 0.4, "leveler to -20 then 2:1 above -30 -> -25");
	const pre = V.activePrefix({ rms: rms }, -45);
	near(V.presenceAt({ start: 0, hop: hop, rms: rms }, pre, 2, 0.25), 1, 0, "voice present"); near(V.presenceAt({ start: 0, hop: hop, rms: rms }, pre, 6.5, 0.25), 0, 0, "silence");
	near(V.presenceAt({ start: 0, hop: hop, rms: rms }, pre, 5, 0.25), 1, 0, "edge ramps (half the window active = full)");
	ok(V.afxOn({ afx: { duck: { on: true } } }) && !V.afxOn({ afx: { comp: { on: false } } }) && !V.afxOn({}), "afxOn");
	const p = proj([clip({ id: "a", type: "audio", track: "a1", vol: 0.5, out: 4 })]), g = V.gainCurve(p, p.clips[0], 1, 10, 48000, () => 2); near(g[5], 1, 1e-9, "extra gain multiplies the curve");
}
/* waveform + canvas size */
{
	eq([V.encDb(1), V.encDb(0), V.encDb(1e-6)], [255, 0, 0], "byte levels"); near(V.decDb(V.encDb(0.5)), V.db(0.5), 0.2, "round trip");
	const w = V.wave([new Float32Array(960).map((x, i) => i < 480 ? (i % 2 ? 0.5 : -0.5) : 0)], 48000, 100);
	eq(w.pk.length, 2, "two bins"); near(V.decDb(w.pk[0]), V.db(0.5), 0.2, "peak of bin 0"); near(V.decDb(w.rms[0]), V.db(0.5), 0.2, "RMS of a square wave"); ok(w.pk[1] === 0, "silent bin");
	eq([V.waveY(0), V.waveY(-27), V.waveY(-80), V.waveY(-6, "lin") > 0.49 && V.waveY(-6, "lin") < 0.51], [1, 0.5, 0, true], "wave heights");
	eq([V.presetOf(1080, 1920), V.presetOf(1000, 700)], ["1080x1920", "custom"], "preset of a size");
	eq([V.parseSize("1281 x 721"), V.parseSize("1280×720"), V.parseSize("abc"), V.parseSize("9000x100")], [{ w: 1282, h: 722 }, { w: 1280, h: 720 }, null, null], "custom size text");
}

// animations: easing
{
	V.EASES.forEach(function (e) { near(V.ease(e[0], 0), 0, 1e-12, "ease " + e[0] + " starts at 0"); near(V.ease(e[0], 1), 1, 1e-12, "ease " + e[0] + " ends at 1"); });
	near(V.ease("inout", 0.5), 0.5, 1e-12, "smooth is symmetric"); near(V.ease("linear", 0.3), 0.3, 1e-12, "linear");
	ok(V.ease("back", 0.8) > 1, "overshoot goes past the end"); ok(V.ease("out", 0.2) > 0.2 && V.ease("in", 0.2) < 0.2, "out is fast first, in slow first");
	near(V.ease("inout", -1), 0, 0, "clamped below"); near(V.ease("inout", 2), 1, 0, "clamped above");
}
// animations: state over time (zoom in then move, with a slide in from the left)
{
	const c = clip({ start: 10, out: 10, x: 0.5, y: 0.5, scale: 1, anims: [
		{ id: "z", t: 2, d: 2, ease: "linear", to: { scale: 2 } },
		{ id: "m", t: 5, d: 1, ease: "linear", to: { x: 0.25 } },
		{ id: "s", t: 0, d: 1, ease: "linear", from: { x: -0.5 } } ] });
	eq(c.anims.map(a => a.id), ["s", "z", "m"], "kept sorted by start");
	near(V.stateAt(c, 0).x, -0.5, 1e-12, "slide in starts off the frame"); near(V.stateAt(c, 0.5).x, 0, 1e-12, "half way in"); near(V.stateAt(c, 1).x, 0.5, 1e-12, "slide in ends where the clip is");
	near(V.stateAt(c, 1.5).scale, 1, 0, "before the zoom"); near(V.stateAt(c, 3).scale, 1.5, 1e-12, "half way through the zoom"); near(V.stateAt(c, 4).scale, 2, 1e-12, "zoom done");
	near(V.stateAt(c, 4.5).scale, 2, 0, "zoom holds"); near(V.stateAt(c, 5.5).x, 0.375, 1e-12, "moving"); near(V.stateAt(c, 9).x, 0.25, 0, "move holds"); near(V.stateAt(c, 9).scale, 2, 0, "zoom still holds");
	const pos = V.posAt(c, 13); near(pos.scale, 1.5, 1e-12, "posAt takes timeline time"); ok(pos.crop && pos.crop.l === 0, "posAt has a crop");
	near(V.layersAt(proj([c]), 13)[0].pos.scale, 1.5, 1e-12, "layersAt carries the animated position (preview and export draw from it)");
	const f = clip({ start: 0, out: 4, anims: [{ t: 3, d: 1, ease: "linear", to: { op: 0 } }] });
	near(V.layersAt(proj([f]), 3.5)[0].alpha, 0.5, 1e-9, "an opacity animation fades the layer");
}
// animations: who owns a value (dragging at an animation's end changes that keyframe)
{
	const c = clip({ start: 0, out: 10, x: 0.5, anims: [{ id: "a", t: 1, d: 2, to: { x: 0.2 } }, { id: "b", t: 5, d: 1, to: { scale: 2 } }] });
	eq(V.propOwner(c, 0.5, "x"), null, "before: the clip owns x"); eq(V.propOwner(c, 3, "x").id, "a", "at the end of a: a owns x");
	eq(V.propOwner(c, 8, "x").id, "a", "later: still a"); eq(V.propOwner(c, 8, "y"), null, "a never set y");
	ok(V.animRunning(c, 2, 0.01) && !V.animRunning(c, 3, 0.01), "running inside, not at the end");
	V.setPropAt(c, 3, "x", 0.7); near(c.anims[0].to.x, 0.7, 0, "moved the keyframe"); near(c.x, 0.5, 0, "clip value untouched");
	const e = V.setPropAt(c, 6, "x", 0.9, 0.01); eq(e.id, "b", "at the end of b: the change goes into b"); near(c.anims[1].to.x, 0.9, 0, "b now also moves x"); near(V.stateAt(c, 5.5).x, (0.7 + 0.9) / 2, 1e-9, "and moves it during b");
	delete c.anims[1].to.x;
	V.setPropAt(c, 0.2, "x", 0.6); near(c.x, 0.6, 0, "before any animation: the clip's own value"); near(V.stateAt(c, 2).x, 0.65, 1e-12, "the animation now runs from the new start");
}
// animations: split, left trim and cutting a range keep every frame where it was
{
	const mk = () => clip({ id: "k", start: 4, in: 0, out: 10, x: 0.5, scale: 1, anims: [{ id: "a", t: 1, d: 4, ease: "inout", to: { scale: 3, x: 0.1 } }, { id: "b", t: 6, d: 2, to: { rot: 90 } }] });
	const c = mk(), r = V.split(c, 7, "k2");
	for (const t of [4.5, 6, 6.99]) { const a = V.posAt(c, t), b = V.posAt(r[0], t); near(b.scale, a.scale, 1e-9, "left half at " + t); }
	for (const t of [7, 8.2, 9.5, 11, 13.9]) { const a = V.posAt(c, t), b = V.posAt(r[1], t); near(b.scale, a.scale, 1e-9, "right half scale at " + t); near(b.x, a.x, 1e-9, "right half x at " + t); near(b.rot, a.rot, 1e-9, "right half rot at " + t); }
	ok(r[1].anims[0].t < 0, "the running animation carries on with a negative start");
	const c2 = mk(), o = V.trim(c2, "l", 5.5, { mediaDur: 20 }), c3 = Object.assign(JSON.parse(JSON.stringify(c2)), o);
	for (const t of [5.5, 6, 8, 12]) near(V.posAt(c3, t).scale, V.posAt(c2, t).scale, 1e-9, "left trim keeps the animation at " + t);
	const p = proj([mk()]); V.removeRange(p, 6, 8, () => "n");
	const L = p.clips.filter(x => x.start === 4)[0], R = p.clips.filter(x => x.start === 6 && x !== L)[0];
	const orig = mk(); near(V.posAt(R, 6).scale, V.posAt(orig, 8).scale, 1e-9, "after a cut the right part continues the zoom"); near(V.posAt(L, 5.5).scale, V.posAt(orig, 5.5).scale, 1e-9, "left part unchanged");
}
// animations: zoom-n-pan, presets, slots, cleaning
{
	const s = V.baseState(clip({}));
	const z = V.zoomToRect(s, { x: 960, y: 540, w: 960, h: 540 }, 1920, 1080);
	near(z.scale, 2, 1e-12, "zoom to a quarter = 2×"); near(z.x, 0, 1e-12, "pans left"); near(z.y, 0, 1e-12, "pans up");
	// the chosen rectangle really fills the frame: its corner (960,540) lands on (0,0) and (1920,1080) on (1920,1080)
	const pl = V.place(1920, 1080, Object.assign({ crop: { l: 0, t: 0, r: 0, b: 0 } }, z), 1920, 1080), k = pl.dw / 1920;
	near(pl.dx + 960 * k, 0, 1e-6, "rect corner at the frame corner"); near(pl.dx + 1920 * k, 1920, 1e-6, "far corner at the far edge");
	const fr = V.frameRect(1900, 100, 400, 1920, 1080); near(fr.h, 225, 1e-9, "frame-shaped box"); near(fr.x, 1520, 1e-9, "kept inside");
	near(V.animValues("zoomin", s).to.scale, 1.5, 0, "zoom in"); near(V.animValues("slidein-l", s, { w: 960, h: 540 }, 1920, 1080).from.x, -0.26, 1e-12, "slide in starts just off the left");
	near(V.animValues("spin", Object.assign({}, s, { rot: 10 })).to.rot, 370, 0, "spin adds a turn"); eq(V.animValues("zoompan", s, null, 1920, 1080, {}), null, "zoom-n-pan needs a box");
	eq(V.animSlot("end", 0, 1, 5), { t: 4, d: 1 }, "out animations at the end"); eq(V.animSlot("here", 4.6, 1, 5), { t: 4, d: 1 }, "kept inside the clip"); eq(V.animSlot("start", 3, 9, 2), { t: 0, d: 2 }, "never longer than the clip");
	const cl = V.cleanAnims([{ t: "2", d: 0, to: { scale: 99, op: 5, bogus: 1 } }, { t: 1, d: 1 }, null, { t: 0, d: 1, ease: "zzz", from: { x: 0.1 } }]);
	eq(cl.length, 2, "empty / bad animations dropped"); near(cl[1].d, 0.02, 0, "length kept positive"); near(cl[1].to.scale, 40, 0, "scale clamped"); near(cl[1].to.op, 1, 0, "opacity clamped"); ok(!("bogus" in cl[1].to), "unknown props dropped"); eq(cl[0].ease, "inout", "unknown easing -> smooth");
	const n = V.normalize({ tracks: [{ id: "v1", kind: "v" }], clips: [{ id: "q", type: "image", track: "v1", start: 0, in: 0, out: 5, rot: "x", anims: [{ t: 0, d: 1, to: { rot: 45 } }] }] });
	eq([n.clips[0].rot, n.clips[0].anims.length], [0, 1], "project files keep animations, fix a bad rotation");
	ok(V.split(clip({ start: 0, out: 4 }), 2, "z")[1].anims === null, "a clip without animations splits as before");
}
// preview view maths
{
	const v = V.viewFit(1000, 600, 1920, 1080, 20);
	near(v.k, 960 / 1920, 1e-12, "fits the width"); near(v.ox, 20, 1e-9, "margin left"); near(v.oy, (600 - 540) / 2, 1e-9, "centred vertically");
	const w = V.viewZoomAt(v, 2, 500, 300); near((500 - w.ox) / w.k, (500 - v.ox) / v.k, 1e-9, "zoom keeps the point under the pointer");
	const r = V.rotPt(2, 1, 1, 1, 90); near(r.x, 1, 1e-12, "rotate x"); near(r.y, 2, 1e-12, "rotate y");
	eq(V.presetOf(854, 480), "854x480", "480p preset"); eq(V.presetOf(1440, 1080), "1440x1080", "4:3 preset"); ok(V.CANVAS_PRESETS.every(q => V.parseSize(q[0]) && q[2]), "every preset parses and has a group");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
