/* MES Video Compressor -- pure helpers (no DOM). Browser global `MESVid`; node: require('./tool_apps_src/compress-video/lib.js'); tests: node tool_apps_src/compress-video-tests.js
 * Decisions only: size parsing, resolution / frame-rate fitting, codec strings, bitrate for a quality or a target size, what to default to on this
 * computer (cores, memory, free disk, codec support) and what to warn about before a job. app.js does the demuxing, encoding and muxing. */
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

	function avcCodec(w, h, fps) {
		var mbps = Math.ceil(w / 16) * Math.ceil(h / 16) * (fps || 30), fs = Math.ceil(w / 16) * Math.ceil(h / 16);
		var lvl = fs <= 1620 && mbps <= 40500 ? "1e" : fs <= 3600 && mbps <= 108000 ? "1f" : fs <= 8192 && mbps <= 245760 ? "28" : fs <= 22080 && mbps <= 589824 ? "2a" : fs <= 36864 && mbps <= 983040 ? "32" : "34";
		return "avc1.6400" + lvl;   // High profile
	}
	function vp9Codec(w, h) { var px = w * h; return "vp09.00." + (px <= 414720 ? "30" : px <= 983040 ? "31" : px <= 2228224 ? "40" : px <= 8912896 ? "50" : "51") + ".08"; }
	var PRESETS = { high: { bpp: 0.11, label: "High quality" }, balanced: { bpp: 0.07, label: "Balanced" }, small: { bpp: 0.045, label: "Small" }, smallest: { bpp: 0.028, label: "Smallest" } };
	function codecFactor(c) { return /vp|av1/i.test(c || "") ? 0.8 : 1; }
	// bitrate for a quality preset: bits per pixel per frame x pixels x fps, never above 85% of what the source used
	function presetBitrate(w, h, fps, preset, codec, srcBps) {
		var p = PRESETS[preset] || PRESETS.balanced, b = w * h * fps * p.bpp * codecFactor(codec);
		if (srcBps > 0) b = Math.min(b, srcBps * 0.85);
		return Math.max(80000, Math.round(b));
	}
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
		outFps: outFps, keepFrame: keepFrame, avcCodec: avcCodec, vp9Codec: vp9Codec, PRESETS: PRESETS, presetBitrate: presetBitrate, targetBitrate: targetBitrate, retuneBitrate: retuneBitrate,
		estimateBytes: estimateBytes, AUDIO_CHOICES: AUDIO_CHOICES, audioBps: audioBps, profile: profile, chooseFormat: chooseFormat, warnings: warnings, outName: outName, isVideo: isVideo, isMp4Family: isMp4Family };
	if (typeof module !== "undefined" && module.exports) module.exports = V; else root.MESVid = V;
})(typeof window !== "undefined" ? window : this);
