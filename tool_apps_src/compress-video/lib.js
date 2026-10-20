/* MES Video Compressor -- pure helpers (no DOM). Browser global `MESVid`; node: require('./tool_apps_src/compress-video/lib.js'); tests: node tool_apps_src/compress-video-tests.js
 * Decisions only: size parsing, resolution / frame-rate fitting, codec strings, constant-quality maths (quantizer per preset, the size model fitted on
 * a short probe of the video, which samples to probe), bitrate for a target size, what to default to on this computer (cores, memory, free disk, codec
 * support) and what to warn about before a job. app.js does the demuxing, encoding and muxing. */
(function (root) {
	"use strict";
	var MB = 1048576;
	function parseSize(s) {
		if (typeof s === "number") return s > 0 ? Math.round(s) : null;
		var m = /^\s*([0-9][0-9,]*\.?[0-9]*|\.[0-9]+)\s*(kb|k|mb|m|gb|g|b)?(?:ytes?|ib)?\s*$/i.exec(String(s || "")); if (!m) return null;
		var n = parseFloat(m[1].replace(/,/g, "")), u = (m[2] || "mb").toLowerCase();
		var mul = { b: 1, k: 1024, kb: 1024, m: MB, mb: MB, g: 1073741824, gb: 1073741824 }[u];
		n = Math.round(n * mul); return n > 0 ? n : null;
	}
	function formatBytes(b) { return b < 1024 ? b + " B" : b < MB ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB" : b < 1073741824 ? (b / MB).toFixed(b < 10 * MB ? 2 : 1) + " MB" : (b / 1073741824).toFixed(2) + " GB"; }
	function formatTime(sec) { sec = Math.max(0, Math.round(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s; }
	function formatBitrate(bps) { return bps >= 1e6 ? (bps / 1e6).toFixed(bps >= 1e7 ? 1 : 2) + " Mbps" : Math.round(bps / 1000) + " kbps"; }
	function even(n) { n = Math.max(2, Math.round(n)); return n % 2 ? n - 1 : n; }
	// cap = the SHORT side in pixels (1080 = "1080p" for landscape and portrait alike); 0 = keep. Never enlarges. Always even.
	function fitDims(w, h, cap) {
		var s = Math.min(w, h);
		if (!cap || s <= cap) return { w: even(w), h: even(h), scaled: false };
		var k = cap / s; return { w: even(w * k), h: even(h * k), scaled: true };
	}
	// rotation (0/90/180/270 clockwise) from an mp4 transform matrix (16.16 fixed point: a, b at [0], [1])
	function rotationFromMatrix(m) {
		if (!m || m.length < 2) return 0;
		var a = m[0] / 65536, b = m[1] / 65536; if (!a && !b) return 0;
		var deg = Math.round(Math.atan2(b, a) * 180 / Math.PI); deg = ((deg % 360) + 360) % 360;
		return [0, 90, 180, 270].indexOf(deg) >= 0 ? deg : Math.round(deg / 90) % 4 * 90;
	}
	// frame-rate cap: drop frames so the output never exceeds `cap` fps (0 = keep). Time-based so odd rates (29.97, VFR) behave.
	function outFps(srcFps, cap) { srcFps = srcFps > 0 ? srcFps : 30; return cap > 0 && srcFps > cap ? cap : srcFps; }
	function keepFrame(ts, lastKept, fps) { return lastKept == null || ts - lastKept >= 1e6 / fps * 0.9; }
	// frame rate to give mp4-muxer, which SNAPS every timestamp to a 1/frameRate grid: only for a constant whole-number rate that the frames really
	// sit on. A phone's variable rate, 29.97 fps, or 25 fps capped at 24 (all frames kept) would get repeated timestamps; then none (exact microseconds).
	function muxFrameRate(srcFps, outFps, cfr) {
		if (!cfr || !(srcFps > 0) || !(outFps > 0)) return undefined;
		var r = Math.round(outFps), k = srcFps / outFps; if (r < 1 || Math.abs(outFps - r) > 0.001 || Math.abs(srcFps - Math.round(srcFps)) > 0.001 || Math.abs(k - Math.round(k)) > 0.001) return undefined;
		return r;
	}

	function avcCodec(w, h, fps) {
		var mbps = Math.ceil(w / 16) * Math.ceil(h / 16) * (fps || 30), fs = Math.ceil(w / 16) * Math.ceil(h / 16);
		var lvl = fs <= 1620 && mbps <= 40500 ? "1e" : fs <= 3600 && mbps <= 108000 ? "1f" : fs <= 8192 && mbps <= 245760 ? "28" : fs <= 22080 && mbps <= 589824 ? "2a" : fs <= 36864 && mbps <= 983040 ? "32" : "34";
		return "avc1.6400" + lvl;   // High profile
	}
	function vp9Codec(w, h) { var px = w * h; return "vp09.00." + (px <= 414720 ? "30" : px <= 983040 ? "31" : px <= 2228224 ? "40" : px <= 8912896 ? "50" : "51") + ".08"; }
	// "Choose a quality" = constant quality, like HandBrake's RF: every frame gets the same H.264 quantizer (q), so a still picture costs little and
	// a busy one costs more. Measured 2026-10-20 against x264 (HandBrake's encoder) at RF 22 on a 79 s 1080p talk-show clip with a Mac's hardware
	// encoder: q 24 = 1.18x the video size at VMAF 95.9 vs 96.0, q 23 = 1.33x at 96.2, so Balanced is 23.5 (frames alternate 23 / 24).
	// bpp is only used when no encoder here takes a quantizer (then the size cannot follow the picture).
	var PRESETS = { high: { q: 21, bpp: 0.08, label: "High (bigger, cleanest picture)" }, balanced: { q: 23.5, bpp: 0.05, label: "Balanced (like HandBrake RF 22)" },
		small: { q: 27, bpp: 0.032, label: "Small" }, smallest: { q: 30, bpp: 0.02, label: "Smallest (soft picture)" } };
	var GOP_SEC = 10;   // a key frame every 10 s, as HandBrake does: key frames are big, and a 2 s interval cost ~16% extra on a talking-head video
	function keyEvery(fps) { return Math.max(1, Math.round((fps > 0 ? fps : 30) * GOP_SEC)); }
	function presetQ(preset) { return (PRESETS[preset] || PRESETS.balanced).q; }
	// fallback when no quantizer is available: bits per pixel per frame x pixels x fps, never above 85% of what the source used
	function presetBitrate(w, h, fps, preset, codec, srcBps) {
		var p = PRESETS[preset] || PRESETS.balanced, b = w * h * fps * p.bpp;
		if (srcBps > 0) b = Math.min(b, srcBps * 0.85);
		return Math.max(80000, Math.round(b));
	}
	// which stretches to probe: times = decode time of each sample (s, ascending), sync = key-frame flags. Windows start on a key frame (so they can be
	// decoded on their own), spread through the video, about 300 frames in all. Returns [{ i: first sample, n: count }].
	function probeWindows(times, sync, dur) {
		var total = times.length, keys = [], out = [], seen = {}; if (!total) return out;
		for (var j = 0; j < total; j++) if (sync[j]) keys.push(j); if (!keys.length) keys.push(0);
		var want = Math.max(3, Math.min(8, Math.ceil((dur || 0) / 12))), per = Math.max(30, Math.min(60, Math.floor(300 / want)));
		for (var k = 0; k < want; k++) {
			var t = (dur || times[total - 1]) * (k + 0.5) / want, lo = 0, hi = keys.length - 1;
			while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (times[keys[mid]] <= t) lo = mid; else hi = mid - 1; }
			if (!seen[keys[lo]]) { seen[keys[lo]] = 1; out.push({ i: keys[lo], n: 0 }); }
		}
		var len = out.length === 1 ? 150 : per;   // key frames too far apart to spread the windows: one longer window at the start
		for (k = 0; k < out.length; k++) out[k].n = Math.min(len, total - out[k].i, k + 1 < out.length ? out[k + 1].i - out[k].i : total);
		return out;
	}
	// size model from a probe: pr = { q, bitsP, bitsK (average bits of a delta / key frame at quantizer q), sP, sK (quantizer steps that halve them; s = both) }
	function cqVideoBps(pr, q, durSec, fps) {
		var frames = Math.max(1, Math.round(durSec * fps)), keys = Math.min(frames, Math.max(1, Math.ceil(frames / keyEvery(fps))));
		var kP = Math.pow(2, -(q - pr.q) / (pr.sP || pr.s)), kK = Math.pow(2, -(q - pr.q) / (pr.sK || pr.s));
		return ((frames - keys) * pr.bitsP * kP + keys * pr.bitsK * kK) / Math.max(0.1, durSec);
	}
	// the quantizer that gives `bps` (the model falls as q rises, so bisection)
	function qForBps(pr, bps, durSec, fps) {
		var lo = -40, hi = 120; for (var j = 0; j < 60; j++) { var mid = (lo + hi) / 2; if (cqVideoBps(pr, mid, durSec, fps) > bps) lo = mid; else hi = mid; }
		return (lo + hi) / 2;
	}
	function clampQ(q) { return Math.max(10, Math.min(51, Math.round(q * 4) / 4)); }
	// slope from the same probe windows encoded at two quantizers; null when the encoder ignored the quantizer (all the bits together did not drop)
	function probeSlope(q0, bits0, q1, bits1) {
		if (!(bits0 > 0) || !(bits1 > 0) || q1 <= q0) return null;
		var r = bits1 / bits0; if (r > 0.85) return null;
		return Math.max(4, Math.min(10, (q1 - q0) / Math.log2(1 / r)));
	}
	// the same for one kind of frame (key or delta) once the quantizer is known to work: an almost still picture can barely shrink its delta frames
	function slopeOf(q0, bits0, q1, bits1) {
		if (!(bits0 > 0) || !(bits1 > 0) || q1 <= q0) return null;
		var r = bits1 / bits0; return r >= 1 ? 14 : Math.max(3, Math.min(14, (q1 - q0) / Math.log2(1 / r)));
	}
	// the quantizer to use. goal "preset": the preset's q, raised only when that would not make the file smaller than the source (capBps).
	// goal "target": the q that should land just under the target, never better than High (there is no point spending more than that).
	function chooseQ(pr, o) {
		var q, why = "";
		if (o.goal === "target") { q = qForBps(pr, o.targetBps * 0.97, o.dur, o.fps); if (q < PRESETS.high.q) { q = PRESETS.high.q; why = "roomy"; } }
		else q = presetQ(o.preset);
		if (o.capBps > 0 && cqVideoBps(pr, q, o.dur, o.fps) > o.capBps) { q = Math.max(q, qForBps(pr, o.capBps, o.dur, o.fps)); why = "capped"; }
		q = clampQ(q); return { q: q, bps: Math.round(cqVideoBps(pr, q, o.dur, o.fps)), why: why };
	}
	// whole-number quantizer for each frame that averages out to a fractional q (23.5 -> 24, 23, 24, 23 ...)
	function qStepper(q) { var n = 0; return function () { n++; return Math.max(0, Math.min(51, Math.round(q * n) - Math.round(q * (n - 1)))); }; }
	// target-size run with a quantizer came out at actualBytes: quantizer for one more try, or null when close enough (<= 3% over, or under)
	function retuneQ(prevQ, s, targetBytes, actualBytes, audioBytes) {
		if (actualBytes <= targetBytes * 1.03) return null;
		var a = audioBytes || 0, va = Math.max(1, actualBytes - a), vt = Math.max(1, targetBytes * 0.97 - a);
		return clampQ(prevQ + (s || 6) * Math.log2(va / vt) + 0.25);
	}
	// when the final encoder takes no quantizer (VP9 / WebM, the software H.264 fallback) it gets an average bitrate this much above the
	// constant-quality size, which was about the same look in our tests (VP9 needed ~1.2x, Chrome's software H.264 far more)
	var VBR_FACTOR = { vp9: 1.2, sw: 1.6, hw: 1.25 };
	// 10-bit / HDR sources: the hardware H.264 encoder cannot take their frames, so they go through a canvas (8-bit) first
	function needs8bit(codec) { return /^(hvc1|hev1)\.2\./i.test(codec || "") || /^avc1\.6e/i.test(codec || "") || /^vp09\.0[23]\./i.test(codec || "") || /^vp09\.\d\d\.\d\d\.1[02]/i.test(codec || "") || /^av01\.\d\.\d\d[MH]\.1[02]/i.test(codec || ""); }
	// video bitrate that should land on a target file size (container overhead ~3%); feasible=false when it would be starved
	function targetBitrate(targetBytes, durationSec, audioBps, w, h, fps) {
		var total = targetBytes * 8 * 0.97 / Math.max(0.1, durationSec), v = total - (audioBps || 0), floor = 60000;
		var bpp = w && h && fps ? Math.max(v, floor) / (w * h * fps) : 1;
		return { videoBps: Math.max(floor, Math.round(v)), bpp: bpp, feasible: v >= floor, tight: bpp < 0.02 };
	}
	// after a target-size run came out at `actual` bytes: bitrate for one more try, or null when it is close enough (<= 3% over, or under)
	function retuneBitrate(prevVideoBps, targetBytes, actualBytes) {
		if (actualBytes <= targetBytes * 1.03) return null;
		return Math.max(60000, Math.round(prevVideoBps * (targetBytes / actualBytes) * 0.96));
	}
	function estimateBytes(videoBps, audioBps, durationSec) { return Math.round((videoBps + (audioBps || 0)) * durationSec / 8 * 1.03); }

	var AUDIO_CHOICES = { keep: "Keep original audio", "192": "192 kbps", "128": "128 kbps (good default)", "96": "96 kbps", "64": "64 kbps (speech)", none: "Remove audio" };
	function audioBps(choice, srcBps) { return choice === "none" ? 0 : choice === "keep" ? (srcBps > 0 ? srcBps : 128000) : (parseInt(choice, 10) || 128) * 1000; }

	// what this computer can sensibly do; caps = { cores, mem (GB, may be undefined), freeBytes, webcodecs, h264, vp9, aac, opus, fs }
	function profile(caps) {
		caps = caps || {}; var cores = caps.cores || 4, mem = caps.mem;
		var level = (mem && mem <= 2) || cores <= 2 ? "weak" : (mem && mem <= 4) || cores <= 4 ? "modest" : "strong";
		var maxShort = level === "weak" ? 720 : level === "modest" ? 1080 : 2160;
		return { level: level, maxShort: maxShort, defaultCap: level === "weak" ? 720 : level === "modest" ? 1080 : 0,
			memLimit: mem ? Math.min(mem, 8) * 1073741824 * 0.12 : 600 * MB };
	}
	function chooseFormat(caps, wantWebm) {
		caps = caps || {};
		if (wantWebm && caps.vp9) return "webm";
		if (caps.h264) return "mp4";
		if (caps.vp9) return "webm";
		return "mp4";
	}
	// warnings before a job; job = { inputBytes, durationSec, outW, outH, estBytes, toDisk, engine }
	function warnings(job, caps) {
		var out = [], pr = profile(caps), free = caps && caps.freeBytes;
		if (job.engine === "recorder") out.push("This file goes through the slow real-time path (about " + formatTime(job.durationSec) + " per pass): keep this tab open and visible until it finishes.");
		if (free > 0 && job.estBytes * 1.2 > free) out.push("The result (about " + formatBytes(job.estBytes) + ") may not fit in the free space your browser reports (" + formatBytes(free) + ").");
		if (!job.toDisk && job.estBytes > pr.memLimit) out.push("The result (about " + formatBytes(job.estBytes) + ") will be held in memory" + (caps && caps.fs ? ": tick \"Save straight to disk\" for big files." : ": this browser cannot write straight to disk, so a very large file may fail."));
		if (Math.min(job.outW, job.outH) > pr.maxShort) out.push("This size is heavy for this computer (" + pr.level + " device: " + Math.round(pr.maxShort * 16 / 9) + "x" + pr.maxShort + " is the sensible limit). It may be slow or run out of memory; pick a lower size to be safe.");
		return out;
	}
	function outName(name, ext, used) {
		var b = String(name || "video").replace(/^.*[\\\/]/, "").replace(/\.[A-Za-z0-9]+$/, "").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim().slice(0, 100) || "video";
		b += "-compressed"; var n = b + "." + ext, i = 2; used = used || {};
		while (used[n.toLowerCase()]) n = b + "-" + (i++) + "." + ext;
		used[n.toLowerCase()] = 1; return n;
	}
	var VID_RE = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|mpe?g|wmv|flv|ogv)$/i;
	function isVideo(name, type) { return /^video\//i.test(type || "") || VID_RE.test(name || ""); }
	function isMp4Family(name, type) { return /\.(mp4|m4v|mov|3gp)$/i.test(name || "") || /^video\/(mp4|quicktime|3gpp)/i.test(type || ""); }

	var V = { MB: MB, parseSize: parseSize, formatBytes: formatBytes, formatTime: formatTime, formatBitrate: formatBitrate, even: even, fitDims: fitDims, rotationFromMatrix: rotationFromMatrix,
		outFps: outFps, keepFrame: keepFrame, muxFrameRate: muxFrameRate, avcCodec: avcCodec, vp9Codec: vp9Codec, PRESETS: PRESETS, presetBitrate: presetBitrate, targetBitrate: targetBitrate, retuneBitrate: retuneBitrate,
		GOP_SEC: GOP_SEC, keyEvery: keyEvery, presetQ: presetQ, probeWindows: probeWindows, cqVideoBps: cqVideoBps, qForBps: qForBps, clampQ: clampQ, probeSlope: probeSlope, slopeOf: slopeOf, chooseQ: chooseQ,
		qStepper: qStepper, retuneQ: retuneQ, VBR_FACTOR: VBR_FACTOR, needs8bit: needs8bit,
		estimateBytes: estimateBytes, AUDIO_CHOICES: AUDIO_CHOICES, audioBps: audioBps, profile: profile, chooseFormat: chooseFormat, warnings: warnings, outName: outName, isVideo: isVideo, isMp4Family: isMp4Family };
	if (typeof module !== "undefined" && module.exports) module.exports = V; else root.MESVid = V;
})(typeof window !== "undefined" ? window : this);
