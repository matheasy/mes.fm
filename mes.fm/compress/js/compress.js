/* MES Image Converter helpers -- pure code shared by mes.fm/image-converter and mes.fm/photo-editor (lib_from), node-testable:
 * node tool_apps_src/image-converter-tests.js. Formats, output sizes, file names, a store-only ZIP writer / reader (crc32). */
var MESImg = (function () {
	"use strict";
	var FORMATS = {
		jpg: { mime: "image/jpeg", ext: "jpg", name: "JPEG", lossy: true, alpha: false },
		png: { mime: "image/png", ext: "png", name: "PNG", lossy: false, alpha: true },
		webp: { mime: "image/webp", ext: "webp", name: "WebP", lossy: true, alpha: true }
	};
	function extOf(name) { var m = /\.([A-Za-z0-9]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
	function baseName(name) { return String(name || "image").replace(/^.*[\\\/]/, "").replace(/\.[A-Za-z0-9]+$/, "") || "image"; }
	function cleanFileName(s) { return String(s).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 150) || "image"; }
	/* output size: mode "keep" | "width" | "height" | "box" | "percent"; never enlarges unless `enlarge` */
	function fitSize(w, h, o) {
		o = o || {}; var mode = o.mode || "keep", s = 1;
		if (mode === "width" && o.w > 0) s = o.w / w;
		else if (mode === "height" && o.h > 0) s = o.h / h;
		else if (mode === "box" && (o.w > 0 || o.h > 0)) s = Math.min(o.w > 0 ? o.w / w : Infinity, o.h > 0 ? o.h / h : Infinity);
		else if (mode === "percent" && o.p > 0) s = o.p / 100;
		if (!o.enlarge && s > 1) s = 1;
		return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
	}
	/* de-duplicate names inside one batch / ZIP: a.jpg, a (2).jpg, a (3).jpg */
	function uniqueName(name, used) {
		var key = name.toLowerCase();
		if (!used[key]) { used[key] = 1; return name; }
		var ext = extOf(name), base = ext ? name.slice(0, -ext.length - 1) : name, n = ++used[key], cand;
		do { cand = base + " (" + n + ")" + (ext ? "." + ext : ""); n++; } while (used[cand.toLowerCase()]);
		used[cand.toLowerCase()] = 1; return cand;
	}
	/* output file name: pattern with {name}, {n} (1-based), {w}, {h}; falls back to name + suffix */
	function outName(pattern, file, n, fmt, w, h) {
		var base = baseName(file);
		var p = (pattern && pattern.indexOf("{") >= 0) ? pattern : (base + (pattern || ""));
		p = p.replace(/\{name\}/g, base).replace(/\{n\}/g, String(n)).replace(/\{w\}/g, String(w || "")).replace(/\{h\}/g, String(h || ""));
		return cleanFileName(p) + "." + FORMATS[fmt].ext;
	}
	function formatBytes(b) {
		if (b < 1024) return b + " B";
		if (b < 1048576) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
		return (b / 1048576).toFixed(b < 10485760 ? 2 : 1) + " MB";
	}
	var CRC = null;
	function crc32(u8) {
		if (!CRC) { CRC = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
		var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = CRC[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
		return (crc ^ 0xFFFFFFFF) >>> 0;
	}
	function utf8(s) { return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Uint8Array.from(unescape(encodeURIComponent(s)), function (c) { return c.charCodeAt(0); }); }
	/* ZIP, "store" method only (images are already compressed): files = [{name, data: Uint8Array}] -> Uint8Array */
	function zipStore(files, when) {
		var d = when || new Date(), dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()) & 0xFFFF, tm = (d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1)) & 0xFFFF;
		var parts = [], central = [], offset = 0;
		files.forEach(function (f) {
			var nm = utf8(f.name), crc = crc32(f.data), size = f.data.length;
			var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
			lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
			parts.push(new Uint8Array(lh.buffer), nm, f.data);
			var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
			ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nm.length, true);
			ch.setUint32(42, offset, true);
			central.push(new Uint8Array(ch.buffer), nm);
			offset += 30 + nm.length + size;
		});
		var csize = 0; central.forEach(function (c) { csize += c.length; });
		var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
		var all = parts.concat(central, [new Uint8Array(end.buffer)]), total = 0; all.forEach(function (p) { total += p.length; });
		var out = new Uint8Array(total), pos = 0; all.forEach(function (p) { out.set(p, pos); pos += p.length; });
		return out;
	}
	/* read a stored-only ZIP (the ones zipStore() writes) -> [{name, data}] ; returns null when it is not one */
	function zipRead(u8) {
		var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i = u8.length - 22;
		while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
		if (i < 0) return null;
		var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), out = [], dec = new TextDecoder();
		for (var k = 0; k < n; k++) {
			if (dv.getUint32(p, true) !== 0x02014b50) return null;
			var method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
			if (method !== 0) return null;
			var name = dec.decode(u8.subarray(p + 46, p + 46 + nl)), lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true), st = lo + 30 + lnl + lel;
			out.push({ name: name, data: u8.subarray(st, st + csz) });
			p += 46 + nl + el + cl;
		}
		return out;
	}
	var api = { FORMATS: FORMATS, extOf: extOf, baseName: baseName, cleanFileName: cleanFileName, fitSize: fitSize, uniqueName: uniqueName, outName: outName, formatBytes: formatBytes, crc32: crc32, zipStore: zipStore, zipRead: zipRead };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();

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

/* MES Compressor (mes.fm/compress): pictures (canvas re-encode to WebP / JPEG, optional target size), PDFs (embedded JPEGs re-saved smaller with pdf-lib,
 * or every page rasterised for "Extreme"), audio (decoded, resampled and saved as MP3 with lamejs). Everything runs in the browser; nothing is uploaded.
 * Decisions live in lib.js (MESCmp); pdf.js 3.11.174, pdf-lib 1.17.1 and lamejs 1.2.1 load from cdnjs the first time they are needed. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("cm"); if (!root || !window.MESCmp) return;
	var C = window.MESCmp, Z = window.MESImg, KEY = "mes-compressor:v1";
	var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
		PDFLIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", LAME = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js";
	var S = { imgOut: "keep", q: 75, max: 0, target: 0, pdf: "balanced", kbps: 128, mono: false, rate: "keep" };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var files = [], busy = false, uid = 0, urls = [];
	var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
	var scripts = {};
	function loadScript(u) { if (!scripts[u]) scripts[u] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { delete scripts[u]; rej(new Error("Could not load a helper library. Check your connection and try again.")); }; document.head.appendChild(s); }); return scripts[u]; }
	var libPdf = function () { return loadScript(PDFLIB); }, libPdfjs = function () { return loadScript(PDFJS).then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; }); }, libLame = function () { return loadScript(LAME); };
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function notice(msg, err) { var n = $("cm-notice"); n.hidden = !msg; n.textContent = msg || ""; n.classList.toggle("is-err", !!err); }
	function blobOf(u8, type) { return new Blob([u8], { type: type }); }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }

	/* ---------- adding files ---------- */
	var drop = $("cm-drop"), input = $("cm-input");
	drop.addEventListener("click", function (e) { if (!e.target.closest("button")) input.click(); });
	drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
	$("cm-pick").onclick = function (e) { e.stopPropagation(); input.click(); }; $("cm-more").onclick = function () { input.click(); };
	input.onchange = function () { add([].slice.call(input.files)); input.value = ""; };
	["dragenter", "dragover"].forEach(function (t) { document.addEventListener(t, function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); drop.classList.add("is-over"); } }); });
	["dragleave", "drop"].forEach(function (t) { document.addEventListener(t, function (e) { if (t === "drop") { e.preventDefault(); add([].slice.call(e.dataTransfer.files || [])); } if (t === "dragleave" && e.target !== document && e.relatedTarget) return; drop.classList.remove("is-over"); }); });
	document.addEventListener("paste", function (e) { var fs = []; [].forEach.call((e.clipboardData && e.clipboardData.items) || [], function (it) { if (it.kind === "file") { var f = it.getAsFile(); if (f) fs.push(f); } }); if (fs.length) { e.preventDefault(); add(fs); } });
	function add(list) {
		var rej = [];
		list.forEach(function (f) {
			var k = C.kindOf(f.name, f.type);
			if (k === "video") { rej.push(f.name + " (video: use the Video Compressor at mes.fm/compress-video)"); return; }
			if (k === "other") { rej.push(f.name + " (not a picture, PDF or audio file)"); return; }
			files.push({ id: ++uid, file: f, name: f.name || "pasted-image.png", kind: k, size: f.size, state: "ready", out: null });
		});
		notice(rej.length ? "Skipped: " + rej.join("; ") + "." : "", rej.length > 0 && !files.length);
		if (files.length) { $("cm-work").hidden = false; }
		render();
	}
	$("cm-clear").onclick = function () { if (busy) return; files = []; urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = []; $("cm-work").hidden = true; $("cm-sum").hidden = true; notice(""); render(); };

	/* ---------- options ---------- */
	function has(k) { return files.some(function (f) { return f.kind === k; }); }
	function renderOpts() {
		var h = "";
		if (has("image")) {
			h += "<h3>Pictures</h3><div class='cm-row'><label>Save as <select id='o-out' class='tu-select' style='width:auto'>" + Object.keys(C.IMG_OUT).map(function (k) { return "<option value='" + k + "'" + (S.imgOut === k ? " selected" : "") + ">" + C.IMG_OUT[k] + "</option>"; }).join("") + "</select></label>" +
				"<label>Quality <input type='range' id='o-q' min='30' max='95' value='" + S.q + "'> <b id='o-qv'>" + S.q + "</b></label>" +
				"<label>Largest side <select id='o-max' class='tu-select' style='width:auto'>" + [[0, "Original"], [3840, "3840 px (4K)"], [2560, "2560 px"], [1920, "1920 px (HD)"], [1600, "1600 px"], [1280, "1280 px"], [1024, "1024 px"], [800, "800 px"]].map(function (o) { return "<option value='" + o[0] + "'" + (S.max === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
				"<label>Aim for at most <input type='number' id='o-tg' min='0' step='10' placeholder='off' value='" + (S.target || "") + "'> KB each</label></div>" +
				"<p class='cm-note'>With a size target, the quality slider is the ceiling and each picture gets the highest quality that fits. PNG stays PNG only if you keep the format: for photos choose WebP or JPEG.</p>";
		}
		if (has("pdf")) {
			h += "<h3>PDFs</h3>" + C.PDF_LEVELS.map(function (l) { return "<label class='cm-lv'><input type='radio' name='o-pdf' value='" + l.id + "'" + (S.pdf === l.id ? " checked" : "") + "><span><b>" + l.name + "</b><br><span class='cm-note'>" + l.note + "</span></span></label>"; }).join("");
		}
		if (has("audio")) {
			h += "<h3>Audio (saved as MP3)</h3><div class='cm-row'><label>Quality <select id='o-kb' class='tu-select' style='width:auto'>" + C.BITRATES.map(function (b) { return "<option value='" + b + "'" + (S.kbps === b ? " selected" : "") + ">" + b + " kbps" + (b === 128 ? " (music)" : b === 64 ? " (speech)" : "") + "</option>"; }).join("") + "</select></label>" +
				"<label><input type='checkbox' id='o-mono'" + (S.mono ? " checked" : "") + "> Mono (half the size)</label>" +
				"<label>Sample rate <select id='o-rate' class='tu-select' style='width:auto'>" + C.RATES.map(function (r) { return "<option value='" + r.id + "'" + (S.rate === r.id ? " selected" : "") + ">" + r.name + "</option>"; }).join("") + "</select></label></div>";
		}
		var o = $("cm-opts"); o.innerHTML = h; o.hidden = !h;
		function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }
		on("o-out", "change", function (e) { S.imgOut = e.target.value; save(); }); on("o-q", "input", function (e) { S.q = +e.target.value; $("o-qv").textContent = S.q; save(); }); on("o-max", "change", function (e) { S.max = +e.target.value; save(); });
		on("o-tg", "input", function (e) { S.target = Math.max(0, parseInt(e.target.value, 10) || 0); save(); });
		[].forEach.call(o.querySelectorAll("input[name=o-pdf]"), function (r) { r.addEventListener("change", function () { S.pdf = r.value; save(); }); });
		on("o-kb", "change", function (e) { S.kbps = +e.target.value; save(); }); on("o-mono", "change", function (e) { S.mono = e.target.checked; save(); }); on("o-rate", "change", function (e) { S.rate = e.target.value; save(); });
	}

	/* ---------- list ---------- */
	var CHIP = { image: "IMG", pdf: "PDF", audio: "MP3" };
	function render() {
		renderOpts();
		$("cm-list").innerHTML = files.map(function (f) {
			var thumb = f.kind === "image" ? "<img alt='' src='" + (f.thumb || (f.thumb = URL.createObjectURL(f.file))) + "'>" : CHIP[f.kind];
			if (f.thumb && urls.indexOf(f.thumb) < 0) urls.push(f.thumb);
			var meta = "<span class='cm-fm'>" + C.formatBytes(f.size) + (f.info ? " &middot; " + esc(f.info) : "") + "</span>", right = "";
			if (f.state === "done") {
				meta = f.kept ? "<span class='cm-fm'>" + C.formatBytes(f.size) + " &middot; <b class='cm-bad'>" + esc(f.note) + "</b></span>" : "<span class='cm-fm'>" + C.formatBytes(f.size) + " &rarr; <b>" + C.formatBytes(f.out.blob.size) + "</b> &middot; <b class='cm-ok'>" + C.pctSaved(f.size, f.out.blob.size) + "% smaller</b>" + (f.note ? " &middot; " + esc(f.note) : "") + "</span>";
				right = f.kept ? "" : "<button type='button' class='tu-btn tu-btn--primary' data-a='dl' data-i='" + f.id + "'>Download</button>" + (f.kind === "image" ? "<button type='button' class='tu-btn tu-btn--ghost' data-a='cmp' data-i='" + f.id + "'>Compare</button>" : "");
			} else if (f.state === "error") meta = "<span class='cm-fm'><b class='cm-bad'>" + esc(f.note) + "</b></span>";
			else if (f.state === "working") meta = "<span class='cm-fm'>" + esc(f.note || "Working...") + "</span><div class='cm-bar'><i style='width:" + (f.pct || 0) + "%'></i></div>";
			return "<div class='cm-f' data-i='" + f.id + "'><span class='cm-th' aria-hidden='true'>" + thumb + "</span><div style='min-width:0'><div class='cm-fn' title='" + esc(f.name) + "'>" + esc(f.name) + "</div>" + meta + "</div><div class='cm-fr'>" + right + (busy ? "" : "<button type='button' class='cm-x' data-a='rm' data-i='" + f.id + "' aria-label='Remove " + esc(f.name) + "'>&times;</button>") + "</div></div>";
		}).join("");
		var pending = files.filter(function (f) { return f.state === "ready" || f.state === "error"; }).length;
		$("cm-go").disabled = busy || !files.length; $("cm-go").textContent = files.some(function (f) { return f.state === "done"; }) && !pending ? "Compress again" : "Compress" + (files.length > 1 ? " " + files.length + " files" : "");
		summary();
	}
	$("cm-list").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-a]"); if (!b) return; var f = files.filter(function (x) { return x.id === +b.getAttribute("data-i"); })[0]; if (!f) return;
		if (b.getAttribute("data-a") === "rm") { files = files.filter(function (x) { return x !== f; }); if (!files.length) $("cm-work").hidden = true; render(); }
		else if (b.getAttribute("data-a") === "dl") download(f.out.blob, f.out.name);
		else if (b.getAttribute("data-a") === "cmp") compare(f);
	});
	function summary() {
		var done = files.filter(function (f) { return f.state === "done" && !f.kept; }), el = $("cm-sum");
		if (!done.length) { el.hidden = true; return; }
		var before = 0, after = 0; done.forEach(function (f) { before += f.size; after += f.out.blob.size; });
		el.hidden = false; el.innerHTML = "<b class='cm-big'>" + C.pctSaved(before, after) + "% smaller</b> &nbsp; " + C.formatBytes(before) + " &rarr; " + C.formatBytes(after) + " (saved " + C.formatBytes(before - after) + " across " + done.length + " file" + (done.length === 1 ? "" : "s") + ")" + (done.length > 1 ? "<div style='margin-top:0.6em'><button type='button' class='tu-btn tu-btn--primary' id='cm-zip'>Download all as ZIP</button></div>" : "");
		var z = $("cm-zip"); if (z) z.onclick = function () { Promise.all(done.map(function (f) { return f.out.blob.arrayBuffer().then(function (b) { return { name: f.out.name, data: new Uint8Array(b) }; }); })).then(function (fl) { download(new Blob([Z.zipStore(fl)], { type: "application/zip" }), "compressed-files.zip"); }); };
	}

	/* ---------- run ---------- */
	function setP(f, pct, note) { f.pct = pct; f.note = note; var row = root.querySelector(".cm-f[data-i='" + f.id + "']"); if (row) { var bar = row.querySelector(".cm-bar i"), m = row.querySelector(".cm-fm"); if (bar) bar.style.width = pct + "%"; if (m && note) m.textContent = note; } }
	$("cm-go").onclick = function () {
		if (busy) return; busy = true; var used = {}, todo = files.slice();
		files.forEach(function (f) { f.state = "ready"; f.out = null; f.kept = false; f.note = ""; }); render();
		(function next(i) {
			if (i >= todo.length) { busy = false; $("cm-prog").textContent = ""; render(); return; }
			var f = todo[i]; f.state = "working"; f.pct = 3; f.note = "Starting..."; $("cm-prog").textContent = "File " + (i + 1) + " of " + todo.length; render();
			var job = f.kind === "image" ? doImage(f, used) : f.kind === "pdf" ? doPdf(f, used) : doAudio(f, used);
			job.then(function (r) {
				if (r.blob.size >= f.size * 0.98 && !r.force) { f.state = "done"; f.kept = true; f.note = r.keepNote || "Already small: the original is kept (the result would not be smaller)."; }
				else { f.state = "done"; f.out = r; f.note = r.note || ""; }
			}, function (e) { f.state = "error"; f.note = (e && e.message) || "This file could not be compressed."; }).then(function () { render(); return tick(); }).then(function () { next(i + 1); });
		})(0);
	};

	/* ---------- pictures ---------- */
	function bitmapOf(file) {
		if (window.createImageBitmap) return createImageBitmap(file).catch(viaImg);
		return viaImg();
		function viaImg() { return new Promise(function (res, rej) { var im = new Image(), u = URL.createObjectURL(file); im.onload = function () { res(im); URL.revokeObjectURL(u); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("This picture could not be read.")); }; im.src = u; }); }
	}
	function drawScaled(im, w, h, bg) {
		var iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight, c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d");
		if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
		x.imageSmoothingQuality = "high"; var cur = im, cw = iw, ch = ih;
		while (cw / 2 >= w && ch / 2 >= h) { var nw = Math.max(w, Math.floor(cw / 2)), nh = Math.max(h, Math.floor(ch / 2)), t = document.createElement("canvas"); t.width = nw; t.height = nh; var tx = t.getContext("2d"); tx.imageSmoothingQuality = "high"; tx.drawImage(cur, 0, 0, nw, nh); cur = t; cw = nw; ch = nh; }
		x.drawImage(cur, 0, 0, w, h); return c;
	}
	function enc(c, mime, q) { return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error("This browser cannot save " + mime + ".")); }, mime, q); }); }
	function doImage(f, used) {
		var oext = C.imageOut(C.ext(f.name), S.imgOut), mime = C.MIME[oext];
		return bitmapOf(f.file).then(function (im) {
			var iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight, d = C.fitDims(iw, ih, S.max); f.info = iw + " × " + ih + " px";
			var c = drawScaled(im, d.w, d.h, oext === "jpg" ? "#ffffff" : null); if (im.close) im.close(); setP(f, 30, "Compressing...");
			var qMax = S.q / 100, lossy = oext !== "png";
			if (!lossy) return enc(c, mime).then(function (b) { return { blob: b, name: C.outName(f.name, oext, used), note: d.scale < 1 ? "resized to " + d.w + " × " + d.h : "", keepNote: "A PNG kept as PNG cannot get smaller without being resized. Choose WebP or JPEG above for a real saving.", src: f.file }; });
			if (S.target > 0) return C.fitQuality(function (q) { return enc(c, mime, q).then(function (b) { return b.size; }); }, S.target * 1024, 0.3, qMax).then(function (r) { return enc(c, mime, r.q).then(function (b) { return { blob: b, name: C.outName(f.name, oext, used), note: (r.ok ? "" : "could not reach " + S.target + " KB; this is the smallest at the lowest quality; ") + "quality " + Math.round(r.q * 100), src: f.file, force: false }; }); });
			return enc(c, mime, qMax).then(function (b) { return { blob: b, name: C.outName(f.name, oext, used), note: "quality " + S.q + (d.scale < 1 ? ", resized to " + d.w + " × " + d.h : ""), src: f.file }; });
		});
	}

	/* ---------- PDFs ---------- */
	function doPdf(f, used) {
		var lv = C.pdfLevel(S.pdf);
		return Promise.all([libPdf(), f.file.arrayBuffer()]).then(function (a) {
			var L = window.PDFLib, bytes = new Uint8Array(a[1]);
			if (lv.raster) return libPdfjs().then(function () { return rasterPdf(f, bytes, lv); }).then(function (u8) { return { blob: blobOf(u8, "application/pdf"), name: C.outName(f.name, "pdf", used), note: "every page rebuilt as a 100 dpi picture; text is not selectable" }; });
			setP(f, 8, "Reading the PDF...");
			return L.PDFDocument.load(bytes, { updateMetadata: false }).then(function (doc) { return recompress(f, L, doc, lv).then(function (stats) {
				doc.setProducer("MES Compressor (mes.fm/compress)"); setP(f, 94, "Saving...");
				return doc.save({ useObjectStreams: true }).then(function (u8) { return { blob: blobOf(u8, "application/pdf"), name: C.outName(f.name, "pdf", used), note: lv.q ? (stats.changed + " picture" + (stats.changed === 1 ? "" : "s") + " re-saved smaller" + (stats.seen > stats.changed ? ", " + (stats.seen - stats.changed) + " left as they are" : "")) : "structure tidied" }; });
			}); });
		}, function (e) { if (/encrypt/i.test(e && e.message)) throw new Error("This PDF is password-protected. Remove the password first."); throw e; });
	}
	function rasterPdf(f, bytes, lv) {
		var L = window.PDFLib; return window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise.then(function (pdf) {
			return L.PDFDocument.create().then(function (out) {
				var n = pdf.numPages; function page(t) {
					if (t > n) { out.setProducer("MES Compressor (mes.fm/compress)"); return out.save(); }
					setP(f, 5 + Math.round(t / n * 85), "Page " + t + " of " + n + "...");
					return pdf.getPage(t).then(function (p) { var v = p.getViewport({ scale: lv.raster / 72 }), v1 = p.getViewport({ scale: 1 }), c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height); var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
						return p.render({ canvasContext: x, viewport: v }).promise.then(function () { return enc(c, "image/jpeg", lv.q); }).then(function (jb) { return jb.arrayBuffer(); }).then(function (ab) { return out.embedJpg(new Uint8Array(ab)); }).then(function (em) { var pg = out.addPage([v1.width, v1.height]); pg.drawImage(em, { x: 0, y: 0, width: v1.width, height: v1.height }); c.width = c.height = 1; return tick(); }); }).then(function () { return page(t + 1); });
				} return page(1);
			});
		});
	}
	// re-encode the JPEG pictures inside the PDF (DCTDecode, RGB / gray / ICC) that can get meaningfully smaller
	function recompress(f, L, doc, lv) {
		var stats = { seen: 0, changed: 0 }; if (!lv.q) return Promise.resolve(stats);
		var ctx = doc.context, N = function (s) { return L.PDFName.of(s); }, list = [];
		ctx.enumerateIndirectObjects().forEach(function (pair) { var obj = pair[1]; if (obj instanceof L.PDFRawStream) { var d = obj.dict, st = d.get(N("Subtype")); if (st && st.toString() === "/Image") list.push(pair); } });
		function isDct(d) { var fl = d.get(N("Filter")); if (!fl) return false; if (fl instanceof L.PDFArray) return fl.size() === 1 && String(fl.get(0)) === "/DCTDecode"; return String(fl) === "/DCTDecode"; }
		function num(v) { return v && v.asNumber ? v.asNumber() : 0; }
		function ok(d) {
			if (!isDct(d) || d.get(N("ImageMask")) || d.get(N("Decode")) || d.get(N("Mask"))) return false;
			var cs = d.get(N("ColorSpace")); if (!cs) return false; cs = ctx.lookup(cs);
			if (cs instanceof L.PDFName) return cs.toString() === "/DeviceRGB" || cs.toString() === "/DeviceGray";
			if (cs instanceof L.PDFArray && String(cs.get(0)) === "/ICCBased") { var pr = ctx.lookup(cs.get(1)), nn = pr && pr.dict ? num(pr.dict.get(N("N"))) : 0; return nn === 1 || nn === 3; }
			return false;
		}
		var i = 0; function step() {
			if (i >= list.length) return Promise.resolve(stats);
			var ref = list[i][0], obj = list[i][1]; i++; setP(f, 10 + Math.round(i / list.length * 80), "Picture " + i + " of " + list.length + "...");
			var d = obj.dict, w = num(d.get(N("Width"))), h = num(d.get(N("Height"))), bytes = obj.contents; stats.seen++;
			if (!ok(d)) { stats.seen--; return tick().then(step); }
			var plan = C.recompressPlan(w, h, bytes.length, lv); if (!plan.go) return tick().then(step);
			return createImageBitmap(new Blob([bytes], { type: "image/jpeg" })).then(function (bm) {
				var c = drawScaled(bm, plan.w, plan.h, "#ffffff"); if (bm.close) bm.close();
				return enc(c, "image/jpeg", plan.q).then(function (jb) { c.width = c.height = 1; return jb.arrayBuffer(); });
			}).then(function (ab) {
				var nb = new Uint8Array(ab); if (!C.keepIfSmaller(bytes.length, nb.length)) return;
				var nd = ctx.obj({ Type: "XObject", Subtype: "Image", Width: plan.w, Height: plan.h, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "DCTDecode", Length: nb.length });
				var sm = d.get(N("SMask")); if (sm) nd.set(N("SMask"), sm);
				ctx.assign(ref, L.PDFRawStream.of(nd, nb)); stats.changed++;
			}, function () { stats.seen--; }).then(tick).then(step);
		}
		return step();
	}

	/* ---------- audio ---------- */
	function doAudio(f, used) {
		if (f.size > 250 * 1048576) return Promise.reject(new Error("This audio file is very large (over 250 MB) for a browser. Try a shorter file."));
		return Promise.all([libLame(), f.file.arrayBuffer()]).then(function (a) {
			var AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error("This browser cannot decode audio.");
			setP(f, 8, "Decoding...");
			var ctx = new AC(), p = ctx.decodeAudioData(a[1]); return Promise.resolve(p).then(function (buf) { if (ctx.close) ctx.close(); return buf; }, function () { if (ctx.close) ctx.close(); throw new Error("This audio file could not be decoded by your browser."); });
		}).then(function (buf) {
			var plan = C.mp3Plan(buf.sampleRate, buf.numberOfChannels, { kbps: S.kbps, rate: S.rate, mono: S.mono }); f.info = C.formatTime(buf.duration) + ", " + buf.numberOfChannels + " ch, " + Math.round(buf.sampleRate / 100) / 10 + " kHz";
			setP(f, 14, "Resampling...");
			var need = plan.rate !== buf.sampleRate, p = need ? new Promise(function (res) { var oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(buf.numberOfChannels, C.resampledLength(buf.length, buf.sampleRate, plan.rate), plan.rate), s = oc.createBufferSource(); s.buffer = buf; s.connect(oc.destination); s.start(); var r = oc.startRendering(); if (r && r.then) r.then(res); else oc.oncomplete = function (e) { res(e.renderedBuffer); }; }) : Promise.resolve(buf);
			return p.then(function (b) {
				var l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
				if (plan.channels === 1) { l = b.numberOfChannels > 1 ? C.mixToMono(l, r) : l; r = null; }
				var enc3 = new window.lamejs.Mp3Encoder(plan.channels, plan.rate, plan.kbps), out = [], BLK = 1152 * 20, i = 0, total = l.length, L16 = new Int16Array(BLK), R16 = plan.channels === 2 ? new Int16Array(BLK) : null;
				function chunk() {
					if (i >= total) { var tail = enc3.flush(); if (tail.length) out.push(new Uint8Array(tail)); return { blob: new Blob(out, { type: "audio/mpeg" }), name: C.outName(f.name, "mp3", used), note: plan.kbps + " kbps" + (plan.channels === 1 ? " mono" : " stereo") + ", " + Math.round(plan.rate / 100) / 10 + " kHz" }; }
					var end = Math.min(total, i + BLK), n = end - i, lc = C.floatToInt16(l.subarray(i, end), L16.subarray(0, n)), m;
					if (R16) { var rc = C.floatToInt16(r.subarray(i, end), R16.subarray(0, n)); m = enc3.encodeBuffer(lc, rc); } else m = enc3.encodeBuffer(lc);
					if (m.length) out.push(new Uint8Array(m)); i = end; setP(f, 18 + Math.round(i / total * 78), "Encoding " + Math.round(i / total * 100) + "%");
					return tick().then(chunk);
				} return Promise.resolve(chunk());
			});
		});
	}

	/* ---------- before / after ---------- */
	function compare(f) {
		var m = $("cm-modal"), box = $("cm-cmp"), a = URL.createObjectURL(f.file), b = URL.createObjectURL(f.out.blob);
		box.innerHTML = "<img alt='Original' src='" + a + "'><div class='cm-after'><img alt='Compressed' src='" + b + "'></div><span class='cm-tag' style='left:0.5em'>Original " + C.formatBytes(f.size) + "</span><span class='cm-tag' style='right:0.5em'>Compressed " + C.formatBytes(f.out.blob.size) + "</span><div class='cm-hd'></div>";
		$("cm-mcap").textContent = f.name + ": drag the line to compare. " + C.savedText(f.size, f.out.blob.size) + ".";
		m.hidden = false; var base = box.querySelector("img"), aft = box.querySelector(".cm-after"), ai = aft.querySelector("img"), hd = box.querySelector(".cm-hd");
		function size() { ai.style.width = base.clientWidth + "px"; ai.style.height = base.clientHeight + "px"; } function pos(p) { p = Math.max(0, Math.min(1, p)); aft.style.clipPath = "inset(0 0 0 " + p * 100 + "%)"; hd.style.left = "calc(" + p * 100 + "% - 1px)"; }
		base.onload = function () { size(); pos(0.5); }; if (base.complete) { size(); pos(0.5); }
		function move(e) { var r = box.getBoundingClientRect(); pos((e.clientX - r.left) / r.width); } var dn = false; box.onpointerdown = function (e) { dn = true; box.setPointerCapture(e.pointerId); move(e); }; box.onpointermove = function (e) { if (dn) move(e); }; box.onpointerup = function () { dn = false; };
		function close() { m.hidden = true; URL.revokeObjectURL(a); URL.revokeObjectURL(b); document.removeEventListener("keydown", esc2); } function esc2(e) { if (e.key === "Escape") close(); }
		$("cm-mx").onclick = close; m.onclick = function (e) { if (e.target === m) close(); }; document.addEventListener("keydown", esc2);
	}
	render();
})();
