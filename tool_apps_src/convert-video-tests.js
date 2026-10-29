// node tool_apps_src/convert-video-tests.js  -- MESConv (AVI / H.264 / MP3 / ffmpeg-log helpers of mes.fm/convert-video)
"use strict";
const fs = require("fs"), path = require("path"), C = require("./convert-video/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
const FX = path.join(__dirname, "convert-video", "fixtures");
function readAvi(name) { return new Uint8Array(fs.readFileSync(path.join(FX, name))); }
// walk all data chunks the same way engine.js does (linear: RIFF / movi / rec are entered, other LISTs skipped)
function chunks(b) {
	const out = []; let pos = 12;
	while (pos + 8 <= b.length) {
		const id = C.fourcc(b, pos), size = C.u32le(b, pos + 4);
		if (id === "RIFF") { pos += 12; continue; }
		if (id === "LIST") { const lt = C.fourcc(b, pos + 8); if (lt === "movi" || lt === "rec ") { pos += 12; continue; } pos += 8 + size + (size & 1); continue; }
		const st = C.streamOf(id); if (st >= 0) out.push({ st, data: b.subarray(pos + 8, pos + 8 + size) });
		pos += 8 + size + (size & 1);
	}
	return out;
}

// names
eq(C.outName("My clip.avi"), "My clip.mp4", "outName");
const used = {}; C.outName("a.avi", used); eq(C.outName("a.mkv", used), "a (2).mp4", "outName clash");
ok(C.isVideo("x.WMV") && C.isVideo("x.flv") && !C.isVideo("x.txt"), "isVideo");
eq(C.formatBytes(1536), "1.50 KB", "formatBytes"); eq(C.formatTime(3725), "1:02:05", "formatTime");
eq(C.streamOf("00dc"), 0, "streamOf video"); eq(C.streamOf("01wb"), 1, "streamOf audio"); eq(C.streamOf("ix00"), -1, "streamOf index");

// AVI header: H.264 + MP3
{
	const b = readAvi("h264-mp3.avi"), h = C.parseAviHeader(b), d = C.describeAvi(h);
	ok(h.ok, "header ok"); eq([d.width, d.height, Math.round(d.fps)], [96, 64, 30], "size + fps");
	ok(d.h264, "is H.264"); eq(d.audioKind, "mp3", "audio mp3"); eq(d.reasons, [], "no reasons");
	eq(C.route({ container: "avi", avi: d, hasB: false }).engine, "native", "routes native");
	const cs = chunks(b), vid = cs.filter(c => c.st === d.videoStream), aud = cs.filter(c => c.st === d.audioStream);
	ok(vid.length >= 30 && vid.length <= 31, "about 30 frames in 1 s");
	const au0 = C.inspectAU(C.splitAnnexB(vid[0].data));
	ok(au0.idr && au0.sps.length === 1 && au0.pps.length === 1, "first frame IDR with SPS/PPS");
	const sps = C.parseSps(au0.sps[0]); eq([sps.width, sps.height], [96, 64], "SPS size"); eq(C.codecString(au0.sps[0]).slice(0, 5), "avc1.", "codec string");
	const keys = vid.map(v => C.inspectAU(C.splitAnnexB(v.data)).idr); eq(keys.filter(Boolean).length, 2, "key every 15 frames");
	const avcc = C.avcC(au0.sps, au0.pps), back = C.parseAvcC(avcc); ok(back && back.sps[0].length === au0.sps[0].length && back.pps.length === 1, "avcC round trip");
	const nals = C.splitAnnexB(vid[1].data), lp = C.toAvcc(nals); eq(C.splitAvcc(lp).map(n => n.length), nals.map(n => n.length), "Annex B -> AVCC -> NALs");
	// MP3 frames
	const sp = new C.Mp3Splitter(); let frames = [];
	aud.forEach(a => { frames = frames.concat(sp.push(a.data.slice(0, 7))).concat(sp.push(a.data.slice(7))); });   // cut each chunk in two on purpose
	ok(frames.length >= 38 && frames.length <= 41, "about 1 s of MP3 frames (" + frames.length + ")");
	eq([frames[0].h.sampleRate, frames[0].h.samples], [44100, 1152], "MP3 header");
	ok(frames.every(f => f.data.length === f.h.len), "whole frames");
}
// B-frames: presentation order from POC
{
	const b = readAvi("h264-bframes.avi"), h = C.parseAviHeader(b), d = C.describeAvi(h), vid = chunks(b).filter(c => c.st === d.videoStream && c.data.length);
	let sps = null, hasB = false; const st = {}, pocs = [], pairs = [];
	const ro = new C.Reorder((dd, p) => pairs.push([dd, p]), 16);
	vid.forEach((v, i) => {
		const au = C.inspectAU(C.splitAnnexB(v.data)); if (!sps) sps = C.parseSps(au.sps[0]);
		const sl = C.parseSlice(au.vcl, sps); if (sl.type === 1) hasB = true;
		const poc = C.pocType0(st, sl, sps); pocs.push(poc); ro.push(i, poc, au.idr);
	});
	ro.flush();
	ok(hasB, "B slices found"); eq(sps.pocType, 0, "poc type 0");
	const disp = pairs.sort((x, y) => x[0] - y[0]).map(p => p[1]);
	eq(disp.slice().sort((x, y) => x - y), disp.map((_, i) => i), "display order is a permutation");
	ok(disp.some((v, i) => v !== i), "frames really are reordered");
	// in display order the POCs within each IDR period increase
	const byDisp = []; disp.forEach((p, i) => byDisp[p] = pocs[i]);
	let mono = true; for (let i = 1; i < byDisp.length; i++) if (byDisp[i] <= byDisp[i - 1] && byDisp[i] !== 0) mono = false;
	ok(mono, "POC increases in display order");
	ok(C.reorderDelay(pairs) >= 1 && C.reorderDelay(pairs) <= 3, "reorder delay 1..3 (" + C.reorderDelay(pairs) + ")");
	eq(d.audio.channels, 1, "mono MP3");
}
// PCM
{
	const b = readAvi("h264-pcm.avi"), d = C.describeAvi(C.parseAviHeader(b)), aud = chunks(b).filter(c => c.st === d.audioStream);
	eq(d.audioKind, "pcm", "PCM"); eq(d.audio.bits, 16, "16-bit");
	const pl = C.pcmToPlanar(aud[0].data, 2, 16); eq(pl.length, 2, "two channels");
	ok(pl[0].every(x => x >= -1 && x <= 1) && pl[0].some(x => Math.abs(x) > 0.05), "samples in range, not silent");
	const s16 = new Uint8Array([0x00, 0x80, 0xff, 0x7f]); const r16 = C.pcmToPlanar(s16, 1, 16); ok(r16[0][0] === -1 && Math.abs(r16[0][1] - 32767 / 32768) < 1e-9, "16-bit ends");
	const s24 = new Uint8Array([0, 0, 0x80]); eq(C.pcmToPlanar(s24, 1, 24)[0][0], -1, "24-bit min");
}
// not H.264 -> ffmpeg
{
	const d = C.describeAvi(C.parseAviHeader(readAvi("mpeg4.avi")));
	ok(!d.h264, "MPEG-4 Part 2 is not H.264"); eq(C.route({ container: "avi", avi: d }).engine, "ffmpeg", "routes to ffmpeg");
	eq(C.route({ container: "mkv" }).engine, "ffmpeg", "mkv -> ffmpeg");
	ok(!C.parseAviHeader(new Uint8Array(20)).ok, "rejects non-AVI");
}
// bits / exp-Golomb
{
	const r = new C.Bits(new Uint8Array([0b10100110, 0b01000000])); eq([r.ue(), r.ue(), r.ue(), r.ue()], [0, 1, 2, 3 - 0], "ue sequence");
	eq(Array.from(C.unescape(new Uint8Array([0, 0, 3, 1, 5]))), [0, 0, 1, 5], "emulation prevention removed");
}
// ffmpeg log + plan
{
	const log = fs.readFileSync(path.join(FX, "bframes-log.txt"), "utf8") + "\n" +
		"Input #1, asf, from 'x.wmv':\n  Duration: 00:01:02.50, start: 0.000000, bitrate: 560 kb/s\n  Stream #0:0: Video: wmv2 (WMV2 / 0x32564D57), yuv420p, 640x360, SAR 1:1 DAR 16:9, 25 fps, 25 tbr, 1k tbn\n  Stream #0:1: Audio: wmav2 (a[1][0][0] / 0x0161), 44100 Hz, mono, fltp, 128 kb/s\n";
	const p = C.parseFfmpegLog(log);
	eq(p.duration, 62.5, "duration (last one wins)");
	const v = p.streams.filter(s => s.type === "video"); eq([v[0].codec, v[0].width, v[0].height, v[0].fps, v[0].pix], ["h264", 96, 64, 30, "yuv420p"], "h264 stream");
	eq([v[1].codec, v[1].fps], ["wmv2", 25], "wmv2 stream");
	const plan = C.ffmpegPlan({ duration: 6, streams: [v[0], { index: 1, type: "audio", codec: "mp3", channels: 1 }] }, "/in/a.avi", "/o.mp4", {});
	ok(plan.ok && plan.copyVideo && plan.args.join(" ").indexOf("-c:v copy") > 0 && plan.args.indexOf("aac") > 0, "h264 copied, mp3 -> aac");
	const plan2 = C.ffmpegPlan({ duration: 6, streams: [Object.assign({}, v[1], { index: 0 }), { index: 1, type: "audio", codec: "aac" }] }, "/in/a.wmv", "/o.mp4", { quality: "high" });
	ok(!plan2.copyVideo && plan2.args.indexOf("libx264") > 0 && plan2.args[plan2.args.indexOf("-crf") + 1] === "18", "wmv re-encoded with x264 crf 18");
	ok(plan2.args.indexOf("+faststart") > 0, "faststart");
	eq(C.ffmpegPlan({ streams: [{ type: "audio", codec: "mp3", index: 0 }] }, "a", "b").ok, false, "no video -> error");
	eq(C.ffmpegTime("frame=  10 fps=0.0 q=-1.0 size=  1kB time=00:01:02.50 bitrate"), 62.5, "progress time");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
