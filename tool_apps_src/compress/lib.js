/* MES Compressor -- pure helpers (no DOM). Browser global `MESCmp`; node: require('./tool_apps_src/compress/lib.js'); tests: node tool_apps_src/compress-tests.js
 * mes.fm/compress shrinks pictures, PDFs and audio in the browser. This file holds the decisions (what kind of file, which output, the
 * quality search for a target size, PDF picture plans, MP3 plans / PCM helpers, names); app.js does the encoding. */
(function (root) {
	"use strict";
	var IMG = /\.(jpe?g|png|webp|gif|bmp)$/i, AUD = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|wma|weba)$/i, VID = /\.(mp4|mov|m4v|avi|mkv|webm|wmv|flv|mpe?g|3gp)$/i;
	function kindOf(name, type) {
		name = String(name || ""); type = String(type || "").toLowerCase();
		if (/pdf/.test(type) || /\.pdf$/i.test(name)) return "pdf";
		if (/^image\/(png|jpe?g|webp|gif|bmp)/.test(type) || IMG.test(name)) return "image";
		if (/^audio\//.test(type) || AUD.test(name)) return "audio";
		if (/^video\//.test(type) || VID.test(name)) return "video";
		return "other";
	}
	function ext(name) { var m = /\.([A-Za-z0-9]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
	function base(name) { return String(name || "file").replace(/^.*[\\\/]/, "").replace(/\.[A-Za-z0-9]+$/, "") || "file"; }
	function clean(s) { return String(s).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim().slice(0, 120) || "file"; }
	function formatBytes(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB" : (b / 1048576).toFixed(b < 10485760 ? 2 : 1) + " MB"; }
	function pctSaved(before, after) { return before > 0 ? Math.round((before - after) / before * 100) : 0; }
	function savedText(before, after) {
		if (!(before > 0)) return "";
		var d = before - after, p = Math.round(Math.abs(d) / before * 100);
		return d > 0 ? "Smaller by " + p + "% (" + formatBytes(before) + " to " + formatBytes(after) + ")" : d < 0 ? "Larger by " + p + "% (" + formatBytes(before) + " to " + formatBytes(after) + ")" : "Same size";
	}
	function outName(name, outExt, used) {
		var b = clean(base(name)) + "-compressed", n = b + "." + outExt, i = 2; used = used || {};
		while (used[n.toLowerCase()]) n = b + "-" + (i++) + "." + outExt;
		used[n.toLowerCase()] = 1; return n;
	}

	/* ---------- pictures ---------- */
	var IMG_OUT = { keep: "Keep each format", webp: "WebP (smallest)", jpeg: "JPEG" };
	// which format a picture leaves in; PNG / GIF / BMP can only shrink by resizing when kept, so "keep" turns them into PNG at the same size
	function imageOut(srcExt, choice) {
		srcExt = String(srcExt || "").toLowerCase();
		if (choice === "webp") return "webp";
		if (choice === "jpeg") return "jpg";
		if (srcExt === "jpg" || srcExt === "jpeg") return "jpg";
		if (srcExt === "webp") return "webp";
		return "png";
	}
	var MIME = { jpg: "image/jpeg", webp: "image/webp", png: "image/png" };
	function fitDims(w, h, maxSide) {
		maxSide = maxSide | 0; if (!(w > 0 && h > 0)) return { w: 1, h: 1, scale: 1 };
		var big = Math.max(w, h); if (!maxSide || big <= maxSide) return { w: w, h: h, scale: 1 };
		var s = maxSide / big; return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
	}
	// find the highest quality (0.30-0.95 by default) whose encoding is at most `target` bytes: encode(q) -> Promise<number bytes>; returns {q, bytes, ok}
	function fitQuality(encode, target, lo, hi, steps) {
		lo = lo == null ? 0.3 : lo; hi = hi == null ? 0.95 : hi; steps = steps || 7;
		return encode(hi).then(function (b) {
			if (b <= target) return { q: hi, bytes: b, ok: true };
			return encode(lo).then(function (bl) {
				if (bl > target) return { q: lo, bytes: bl, ok: false };
				var bestQ = lo, bestB = bl, a = lo, z = hi, i = 0;
				function step() {
					if (i++ >= steps) return { q: bestQ, bytes: bestB, ok: true };
					var m = (a + z) / 2;
					return encode(m).then(function (bm) { if (bm <= target) { bestQ = m; bestB = bm; a = m; } else z = m; return step(); });
				}
				return Promise.resolve(step());
			});
		});
	}

	/* ---------- PDF pictures ---------- */
	var PDF_LEVELS = [
		{ id: "light", name: "Light", note: "Keeps everything as it is and only tidies the file's structure. Small savings, text stays selectable.", maxSide: 0, q: 0, raster: 0 },
		{ id: "balanced", name: "Balanced", note: "Re-saves the embedded photos and scans as smaller JPEGs (up to 2000 px). Text stays selectable. Best for most files.", maxSide: 2000, q: 0.78, raster: 0 },
		{ id: "strong", name: "Strong", note: "Smaller photos (up to 1400 px) at lower quality. Text stays selectable.", maxSide: 1400, q: 0.62, raster: 0 },
		{ id: "extreme", name: "Extreme", note: "Turns every page into a 100 dpi picture. Smallest result, but text can no longer be selected or searched.", maxSide: 0, q: 0.55, raster: 100 }
	];
	function pdfLevel(id) { for (var i = 0; i < PDF_LEVELS.length; i++) if (PDF_LEVELS[i].id === id) return PDF_LEVELS[i]; return PDF_LEVELS[1]; }
	// should an embedded JPEG be re-encoded? only when it can get meaningfully smaller: big dimensions, or a lot of bytes per pixel
	function recompressPlan(w, h, bytes, level) {
		if (!level || !level.q || level.raster) return { go: false, w: w, h: h, q: 0 };
		if (!(w > 0 && h > 0 && bytes > 0)) return { go: false, w: w, h: h, q: 0 };
		var d = fitDims(w, h, level.maxSide), bpp = bytes / (w * h);
		var go = d.scale < 1 || bpp > (level.q >= 0.7 ? 0.45 : 0.3);
		return { go: go, w: d.w, h: d.h, q: level.q };
	}
	function keepIfSmaller(before, after, margin) { return after < before * (margin || 0.95); }

	/* ---------- audio ---------- */
	var BITRATES = [64, 96, 128, 160, 192, 256];
	var RATES = [{ id: "keep", name: "Keep (up to 44.1 kHz)" }, { id: "32000", name: "32 kHz" }, { id: "22050", name: "22.05 kHz (voice)" }];
	function mp3Plan(srcRate, srcChannels, opts) {
		opts = opts || {}; var kb = BITRATES.indexOf(opts.kbps) >= 0 ? opts.kbps : 128;
		var rate = opts.rate && opts.rate !== "keep" ? parseInt(opts.rate, 10) : Math.min(srcRate || 44100, 44100);
		if ([48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(rate) < 0) rate = rate > 44100 ? 44100 : rate > 32000 ? 44100 : rate > 24000 ? 32000 : 22050;
		if (kb > 64 && rate <= 22050) kb = Math.min(kb, 160);   // MPEG-2 layer III tops out at 160 kbps
		var ch = opts.mono || srcChannels < 2 ? 1 : 2;
		return { kbps: kb, rate: rate, channels: ch };
	}
	function estimateMp3Bytes(seconds, kbps) { return Math.round(seconds * kbps * 1000 / 8) + 417; }
	function floatToInt16(f, out) {
		out = out || new Int16Array(f.length);
		for (var i = 0; i < f.length; i++) { var s = f[i]; s = s > 1 ? 1 : s < -1 ? -1 : s; out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767); }
		return out;
	}
	function mixToMono(l, r) { var o = new Float32Array(l.length); for (var i = 0; i < l.length; i++) o[i] = (l[i] + r[i]) / 2; return o; }
	function resampledLength(n, from, to) { return Math.max(1, Math.ceil(n * to / from)); }
	function duration(n, rate) { return rate > 0 ? n / rate : 0; }
	function formatTime(sec) { sec = Math.max(0, Math.round(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s; }

	var C = { kindOf: kindOf, ext: ext, base: base, clean: clean, formatBytes: formatBytes, pctSaved: pctSaved, savedText: savedText, outName: outName,
		IMG_OUT: IMG_OUT, imageOut: imageOut, MIME: MIME, fitDims: fitDims, fitQuality: fitQuality, PDF_LEVELS: PDF_LEVELS, pdfLevel: pdfLevel, recompressPlan: recompressPlan, keepIfSmaller: keepIfSmaller,
		BITRATES: BITRATES, RATES: RATES, mp3Plan: mp3Plan, estimateMp3Bytes: estimateMp3Bytes, floatToInt16: floatToInt16, mixToMono: mixToMono, resampledLength: resampledLength, duration: duration, formatTime: formatTime };
	if (typeof module !== "undefined" && module.exports) module.exports = C; else root.MESCmp = C;
})(typeof window !== "undefined" ? window : this);
