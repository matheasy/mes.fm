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

/* MES PDF Tools -- pure helpers (no DOM, no pdf.js / pdf-lib). Browser global `PT`; node: require('./tool_apps_src/pdf-tools/lib.js'); tests: node tool_apps_src/pdf-tools-tests.js
 * Shared by mes.fm/merge-pdf, split-pdf, organize-pdf, jpg-to-pdf, pdf-to-jpg and compress-pdf. Page numbers are 1-based in the interface, 0-based in the returned index lists. */
(function (root) {
	"use strict";
	/* ---------- page ranges: "1-3, 5, 8-" -> pages ---------- */
	function parseRanges(str, n) {
		var s = String(str == null ? "" : str).trim().toLowerCase();
		if (s === "" || s === "all") return { ok: n > 0, error: n > 0 ? "" : "No pages", groups: [], pages: seq(0, n - 1) };
		var groups = [], pages = [], parts = s.split(/[\s,;]+/).filter(Boolean), i;
		for (i = 0; i < parts.length; i++) {
			var p = parts[i], m = /^(\d*)\s*-\s*(\d*)$/.exec(p), a, b;
			if (m && (m[1] !== "" || m[2] !== "")) { a = m[1] === "" ? 1 : parseInt(m[1], 10); b = m[2] === "" ? n : parseInt(m[2], 10); }
			else if (/^\d+$/.test(p)) { a = b = parseInt(p, 10); }
			else if (p === "last") { a = b = n; }
			else return { ok: false, error: 'Could not read "' + parts[i] + '". Use numbers and ranges like 1-3, 5, 8-.', groups: [], pages: [] };
			if (a < 1 || b < 1 || a > n || b > n) return { ok: false, error: "Page " + (a > n || b > n ? Math.max(a, b) : 0) + " is outside this PDF (it has " + n + (n === 1 ? " page)." : " pages)."), groups: [], pages: [] };
			var g = a <= b ? seq(a - 1, b - 1) : seq(b - 1, a - 1).reverse(); groups.push(g); pages = pages.concat(g);
		}
		return { ok: true, error: "", groups: groups, pages: pages };
	}
	function seq(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }
	// split into pieces of k pages: [[0..k-1], [k..2k-1], ...]
	function chunk(n, k) { k = Math.max(1, Math.floor(k)); var o = []; for (var i = 0; i < n; i += k) o.push(seq(i, Math.min(n, i + k) - 1)); return o; }
	// "pages 1-3" / "page 5" / "pages 1-3, 5"
	function describe(pages) {
		if (!pages.length) return ""; var s = pages.slice().sort(function (a, b) { return a - b; }), runs = [], st = s[0], pr = s[0], i;
		for (i = 1; i <= s.length; i++) { if (s[i] === pr + 1) { pr = s[i]; continue; } runs.push(st === pr ? String(st + 1) : (st + 1) + "-" + (pr + 1)); st = s[i]; pr = s[i]; }
		return (s.length === 1 ? "page " : "pages ") + runs.join(", ");
	}
	/* ---------- file names ---------- */
	function base(name) { return String(name || "file").replace(/^.*[\\\/]/, "").replace(/\.[A-Za-z0-9]+$/, "") || "file"; }
	function clean(name) { return String(name).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").replace(/\s+/g, " ").trim().slice(0, 120) || "file"; }
	function pad(i, total) { var w = String(total).length; return ("0000" + i).slice(-Math.max(2, w)); }
	function splitName(srcName, i, total, pages) { return clean(base(srcName)) + "-part-" + pad(i, total) + ".pdf"; }
	function pageImageName(srcName, pageNo, total, ext) { return clean(base(srcName)) + "-page-" + pad(pageNo, total) + "." + ext; }
	function mergedName(names) { if (names.length && names.every(function (n) { return base(n) === base(names[0]); })) return clean(base(names[0])) + "-merged.pdf"; return "merged.pdf"; }
	function uniqueName(name, used) { var k = name.toLowerCase(); if (!used[k]) { used[k] = 1; return name; } var m = /^(.*?)(\.[^.]*)?$/.exec(name), b = m[1], e = m[2] || "", n = used[k] + 1, c; do { c = b + " (" + n + ")" + e; n++; } while (used[c.toLowerCase()]); used[k] = n - 1; used[c.toLowerCase()] = 1; return c; }
	function formatBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + " MB"; }
	function savedText(before, after) { if (!(before > 0)) return ""; var d = before - after, p = Math.round(Math.abs(d) / before * 100); return d > 0 ? "Smaller by " + p + "% (" + formatBytes(before) + " to " + formatBytes(after) + ")" : d < 0 ? "Larger by " + p + "% (" + formatBytes(before) + " to " + formatBytes(after) + ")" : "Same size (" + formatBytes(after) + ")"; }
	/* ---------- images to PDF ---------- */
	var PAGE_SIZES = { a4: [595.28, 841.89, "A4"], letter: [612, 792, "US Letter"], legal: [612, 1008, "US Legal"], a5: [419.53, 595.28, "A5"], fit: [0, 0, "Same size as the picture"] };
	var MARGINS = { none: 0, small: 18, medium: 36, large: 54 };
	// the page for an image: size in points and where the picture goes (origin bottom-left). orient = "auto" | "portrait" | "landscape"
	function imagePage(imgW, imgH, size, orient, margin) {
		var m = MARGINS[margin] != null ? MARGINS[margin] : 0, pw, ph;
		if (size === "fit" || !PAGE_SIZES[size]) { var k = 0.75; pw = Math.max(36, imgW * k) + 2 * m; ph = Math.max(36, imgH * k) + 2 * m; }   // 96 dpi pixels to points
		else { pw = PAGE_SIZES[size][0]; ph = PAGE_SIZES[size][1]; var land = orient === "landscape" || (orient === "auto" && imgW > imgH); if (land && pw < ph || !land && orient === "portrait" && pw > ph) { var t = pw; pw = ph; ph = t; } if (orient === "portrait" && pw > ph) { var t2 = pw; pw = ph; ph = t2; } }
		var bw = pw - 2 * m, bh = ph - 2 * m, s = Math.min(bw / imgW, bh / imgH), w = imgW * s, h = imgH * s;
		return { pageW: pw, pageH: ph, x: (pw - w) / 2, y: (ph - h) / 2, w: w, h: h };
	}
	/* ---------- turning pages into pictures: pixel size for a dpi ---------- */
	function renderScale(dpi) { return Math.max(0.2, dpi / 72); }
	var DPIS = { 72: "Small (72 dpi)", 150: "Standard (150 dpi)", 220: "High (220 dpi)", 300: "Print (300 dpi)" };
	/* ---------- compress presets: pictures-only modes rebuild every page as a JPEG ---------- */
	var COMPRESS = [
		{ id: "light", name: "Light: keep the text", dpi: 0, q: 0, note: "Rewrites the file more compactly. Text stays selectable. Often saves little." },
		{ id: "medium", name: "Medium: shrink pictures", dpi: 150, q: 0.78, note: "Turns each page into a 150 dpi picture. Good for scans and photos; text is no longer selectable." },
		{ id: "strong", name: "Strong: smallest file", dpi: 100, q: 0.62, note: "Turns each page into a 100 dpi picture at lower quality. Small, readable on screen." }
	];
	// move an item in a list (drag reorder): returns a new array
	function moveItem(list, from, to) { var a = list.slice(); if (from < 0 || from >= a.length || to < 0 || to >= a.length) return a; var x = a.splice(from, 1)[0]; a.splice(to, 0, x); return a; }
	function isPdf(f) { return !!f && (/pdf/i.test(f.type || "") || /\.pdf$/i.test(f.name || "")); }
	function isImage(f) { return !!f && (/^image\/(png|jpe?g|webp|gif|bmp)/i.test(f.type || "") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name || "")); }
	var PT = { parseRanges: parseRanges, seq: seq, chunk: chunk, describe: describe, base: base, clean: clean, pad: pad, splitName: splitName, pageImageName: pageImageName, mergedName: mergedName, uniqueName: uniqueName, formatBytes: formatBytes, savedText: savedText, PAGE_SIZES: PAGE_SIZES, MARGINS: MARGINS, imagePage: imagePage, renderScale: renderScale, DPIS: DPIS, COMPRESS: COMPRESS, moveItem: moveItem, isPdf: isPdf, isImage: isImage };
	if (typeof module !== "undefined" && module.exports) module.exports = PT; else root.PT = PT;
})(typeof window !== "undefined" ? window : this);

/* MES PDF Tools -- mes.fm/merge-pdf, split-pdf, organize-pdf, jpg-to-pdf, pdf-to-jpg, compress-pdf. One script, six pages (data-mode on #pt). Maths and names in lib.js (PT);
 * pdf.js 3.11.174 renders thumbnails / pictures and pdf-lib 1.17.1 builds the PDFs (both loaded from cdnjs on first use). Files never leave the browser. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("pt"); if (!root || !window.PT) return;
	var PT = window.PT, MODE = root.getAttribute("data-mode"), Z = window.MESImg;
	var CFG = {
		merge: { multi: true, kind: "pdf", t: "Merge PDF files", s: "Drop two or more PDFs here, put them in order, then merge them into one.", go: "Merge PDFs", min: 2 },
		split: { multi: false, kind: "pdf", t: "Split a PDF", s: "Drop a PDF here, then choose how to split it.", go: "Split PDF", min: 1 },
		organize: { multi: false, kind: "pdf", t: "Rotate, delete and rearrange PDF pages", s: "Drop a PDF here to reorder, rotate, delete, duplicate or add pages.", go: "Save the new PDF", min: 1 },
		images: { multi: true, kind: "img", t: "Turn pictures into a PDF", s: "Drop JPG, PNG or WebP pictures here. Each picture becomes a page.", go: "Create PDF", min: 1 },
		toimg: { multi: false, kind: "pdf", t: "Turn PDF pages into pictures", s: "Drop a PDF here to save its pages as JPG or PNG images.", go: "Convert to images", min: 1 },
		compress: { multi: false, kind: "pdf", t: "Make a PDF smaller", s: "Drop a PDF here, then choose how much to shrink it.", go: "Compress PDF", min: 1 }
	}[MODE];
	if (!CFG) return;
	var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js", PDFLIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
	function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Could not load a needed library. Check your connection and try again.")); }; document.head.appendChild(s); }); }
	var libs = null; function ensureLibs() { if (!libs) libs = Promise.all([loadScript(PDFJS), loadScript(PDFLIB)]).then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; }).catch(function (e) { libs = null; throw e; }); return libs; }
	var items = [], pages = [], uid = 0, busy = false, tab = "range", sp = { range: "", every: 2, extract: "" }, opt = { size: "a4", orient: "auto", margin: "none", fmt: "jpg", dpi: 150, range: "", level: "medium" };
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function notice(msg, err) { var n = $("pt-notice"); n.hidden = !msg; n.className = "tu-card tu-card--tint pt-notice" + (err ? " is-err" : ""); n.innerHTML = msg || ""; }
	function prog(msg) { $("pt-prog").textContent = msg || ""; }
	function save(blob, name) { var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000); }
	var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
	$("pt-drop-t").textContent = CFG.t; $("pt-drop-s").textContent = CFG.s; $("pt-pick").textContent = CFG.multi ? "Choose files" : "Choose a file"; $("pt-go").textContent = CFG.go; $("pt-input").accept = CFG.kind === "pdf" ? "application/pdf,.pdf" : "image/*"; $("pt-input").multiple = CFG.multi;
	var drop = $("pt-drop"); $("pt-pick").addEventListener("click", function (e) { e.stopPropagation(); $("pt-input").click(); }); drop.addEventListener("click", function () { $("pt-input").click(); }); drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("pt-input").click(); } });
	$("pt-input").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
	["dragenter", "dragover"].forEach(function (n) { document.addEventListener(n, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); drop.classList.add("is-over"); } }); });
	["dragleave", "drop"].forEach(function (n) { document.addEventListener(n, function (e) { if (n === "dragleave" && e.relatedTarget) return; drop.classList.remove("is-over"); }); });
	document.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length && !e.target.closest(".pt-file, .pt-pg")) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
	$("pt-clear").onclick = function () { items = []; pages = []; $("pt-out").hidden = true; notice(""); prog(""); render(); };

	/* ---------- reading files ---------- */
	function readBytes(f) { return f.arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
	async function openPdf(bytes, name) {
		var task = window.pdfjsLib.getDocument({ data: bytes.slice(0) }), locked = false;
		task.onPassword = function (update, reason) { locked = true; var pw = window.prompt((reason === 2 ? "That password was not right. " : "") + "Password for " + name + ":"); if (pw == null) task.destroy(); else update(pw); };
		return { pdf: await task.promise, locked: locked };
	}
	async function pageCanvas(pdf, no, maxW, rot, extra) {
		var p = await pdf.getPage(no), v0 = p.getViewport({ scale: 1, rotation: ((p.rotate || 0) + (rot || 0)) % 360 }), sc = maxW / v0.width, v = p.getViewport({ scale: sc, rotation: ((p.rotate || 0) + (rot || 0)) % 360 }), c = document.createElement("canvas"); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
		var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: ctx, viewport: v }).promise; return c;
	}
	async function addFiles(list) {
		list = Array.prototype.slice.call(list || []); if (!list.length || busy) return; var good = list.filter(CFG.kind === "pdf" ? PT.isPdf : PT.isImage), skipped = list.length - good.length;
		if (!good.length) return notice("Please choose " + (CFG.kind === "pdf" ? "PDF files." : "picture files (JPG, PNG, WebP, GIF or BMP)."), true); if (!CFG.multi) { good = good.slice(0, 1); items = []; pages = []; }
		busy = true; $("pt-out").hidden = true; notice(""); prog("Reading files...");
		try {
			await ensureLibs();
			for (var i = 0; i < good.length; i++) {
				var f = good[i]; prog("Reading " + f.name + " (" + (i + 1) + " of " + good.length + ")...");
				var it = { id: ++uid, kind: CFG.kind, name: f.name, size: f.size, range: "", rot: 0 };
				if (CFG.kind === "pdf") {
					it.bytes = await readBytes(f); var o; try { o = await openPdf(it.bytes, f.name); } catch (e) { notice("Could not open " + esc(f.name) + ": it may be damaged or not a real PDF.", true); continue; }
					it.pdf = o.pdf; it.locked = o.locked; it.n = o.pdf.numPages; it.thumb = await pageCanvas(o.pdf, 1, 160, 0);
				} else {
					it.url = URL.createObjectURL(f); it.file = f; await new Promise(function (res) { var im = new Image(); im.onload = function () { it.w = im.naturalWidth; it.h = im.naturalHeight; it.el = im; res(); }; im.onerror = function () { it.bad = true; res(); }; im.src = it.url; });
					if (it.bad) { notice("Could not read " + esc(f.name) + " as a picture.", true); continue; }
				}
				items.push(it); await tick();
			}
			if (skipped) notice(skipped + (skipped === 1 ? " file was" : " files were") + " skipped (not " + (CFG.kind === "pdf" ? "a PDF" : "a picture") + ").");
			if ((MODE === "organize" || MODE === "split") && items[0]) await buildPages();
		} catch (e) { console.error(e); notice(esc((e && e.message) || "Something went wrong opening the file."), true); }
		busy = false; prog(""); render();
	}
	async function buildPages() { var it = items[0]; pages = PT.seq(0, it.n - 1).map(function (i) { return { src: 0, index: i, rot: 0, del: false, blank: false, key: ++uid }; }); }

	/* ---------- the screen ---------- */
	function render() {
		var has = items.length > 0; $("pt-work").hidden = !has; drop.hidden = has && !CFG.multi; if (CFG.multi && has) { $("pt-drop-t").textContent = "Add more files"; $("pt-drop-s").textContent = CFG.kind === "pdf" ? "Drop more PDFs here" : "Drop more pictures here"; } else { $("pt-drop-t").textContent = CFG.t; $("pt-drop-s").textContent = CFG.s; }
		if (!has) return; renderFiles(); renderCtl(); $("pt-grid").hidden = !(MODE === "organize" || (MODE === "split" && tab === "extract")); if (!$("pt-grid").hidden) renderGrid(); updateGo();
	}
	function updateGo() { var ok = items.length >= CFG.min; $("pt-go").disabled = busy || !ok; }
	function fileCard(it, i) {
		var c = document.createElement("div"); c.className = "pt-file"; c.dataset.i = i; if (CFG.multi) c.draggable = true;
		var media = it.kind === "pdf" ? it.thumb : null; if (media) { var cv = document.createElement("canvas"); cv.width = media.width; cv.height = media.height; cv.getContext("2d").drawImage(media, 0, 0); c.appendChild(cv); } else { var im = document.createElement("img"); im.src = it.url; im.alt = ""; im.style.transform = "rotate(" + it.rot + "deg)"; im.style.maxHeight = "9em"; c.appendChild(im); }
		var meta = it.kind === "pdf" ? it.n + (it.n === 1 ? " page" : " pages") + " · " + PT.formatBytes(it.size) : it.w + "×" + it.h + " · " + PT.formatBytes(it.size);
		c.insertAdjacentHTML("beforeend", '<div class="pt-fn">' + esc(it.name) + '</div><div class="pt-fm">' + meta + (it.locked ? " · password protected" : "") + "</div>");
		if (MODE === "merge") { var inp = document.createElement("input"); inp.type = "text"; inp.placeholder = "Pages: all (e.g. 1-3, 5)"; inp.value = it.range; inp.setAttribute("aria-label", "Pages to use from " + it.name); inp.oninput = function () { it.range = inp.value; }; c.appendChild(inp); }
		if (MODE === "images") c.insertAdjacentHTML("beforeend", '<div class="pt-mv"><button type="button" data-a="rl" aria-label="Rotate left">↶</button><button type="button" data-a="rr" aria-label="Rotate right">↷</button></div>');
		if (CFG.multi) c.insertAdjacentHTML("beforeend", '<div class="pt-mv"><button type="button" data-a="up" aria-label="Move earlier">←</button><button type="button" data-a="down" aria-label="Move later">→</button></div>');
		c.insertAdjacentHTML("beforeend", '<button type="button" class="pt-x" data-a="rm" aria-label="Remove ' + esc(it.name) + '">✕</button>'); return c;
	}
	function renderFiles() {
		var box = $("pt-files"); box.innerHTML = ""; items.forEach(function (it, i) { box.appendChild(fileCard(it, i)); });
		box.onclick = function (e) { var b = e.target.closest("button[data-a]"); if (!b) return; var i = +b.closest(".pt-file").dataset.i, a = b.dataset.a; if (a === "rm") { items.splice(i, 1); if (MODE === "organize" || MODE === "split") pages = []; } else if (a === "up") items = PT.moveItem(items, i, i - 1); else if (a === "down") items = PT.moveItem(items, i, i + 1); else if (a === "rl") items[i].rot = (items[i].rot + 270) % 360; else if (a === "rr") items[i].rot = (items[i].rot + 90) % 360; $("pt-out").hidden = true; render(); };
		if (CFG.multi) sortable(box, ".pt-file", function (f, t) { items = PT.moveItem(items, f, t); render(); });
	}
	function sortable(box, sel, onMove) {
		var from = null; box.ondragstart = function (e) { var c = e.target.closest(sel); if (!c) return; from = +c.dataset.i; try { e.dataTransfer.setData("text/plain", "x"); e.dataTransfer.effectAllowed = "move"; } catch (x) {} };
		box.ondragover = function (e) { if (from == null) return; e.preventDefault(); var c = e.target.closest(sel); [].forEach.call(box.querySelectorAll(".is-over"), function (x) { x.classList.remove("is-over"); }); if (c) c.classList.add("is-over"); };
		box.ondrop = function (e) { if (from == null) return; e.preventDefault(); e.stopPropagation(); var c = e.target.closest(sel), f = from; from = null; if (c && +c.dataset.i !== f) onMove(f, +c.dataset.i); };
		box.ondragend = function () { from = null; [].forEach.call(box.querySelectorAll(".is-over"), function (x) { x.classList.remove("is-over"); }); };
	}
	function sel(id, opts, cur) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; }
	function renderCtl() {
		var c = $("pt-ctl"), it = items[0], h = "";
		if (MODE === "merge") { var tot = 0; items.forEach(function (x) { tot += x.n; }); h = '<h3>Order</h3><p class="pt-note" style="margin:0">Drag the cards or use the arrows to set the order. Type page numbers under a file to use only some of its pages. ' + (items.length < 2 ? "<b>Add at least one more PDF.</b>" : "The merged PDF will have up to " + tot + " pages.") + "</p>"; }
		else if (MODE === "images") { h = '<h3>Page settings</h3><div class="pt-row"><label>Page size ' + sel("pt-size", Object.keys(PT.PAGE_SIZES).map(function (k) { return [k, PT.PAGE_SIZES[k][2]]; }), opt.size) + "</label><label>Orientation " + sel("pt-orient", [["auto", "Automatic"], ["portrait", "Portrait"], ["landscape", "Landscape"]], opt.orient) + "</label><label>Margin " + sel("pt-margin", [["none", "None"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"]], opt.margin) + '</label></div><p class="pt-note" style="margin:0">Each picture keeps its shape and is centred on its page. Order the pictures with the arrows or by dragging.</p>'; }
		else if (MODE === "split") {
			h = '<h3>How should it be split?</h3><div class="pt-tabs" role="group" aria-label="Split method">' + [["range", "By page range"], ["every", "Every N pages"], ["extract", "Extract pages"]].map(function (t) { return '<button type="button" data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
			if (tab === "range") h += '<div class="pt-row"><label>Ranges <input type="text" id="pt-sr" size="26" placeholder="e.g. 1-3, 4-6, 7-" value="' + esc(sp.range) + '"></label></div><p class="pt-note" style="margin:0">Each range becomes its own PDF. This file has ' + it.n + " pages. <span id=\"pt-spv\"></span></p>";
			else if (tab === "every") h += '<div class="pt-row"><label>Make a new PDF every <input type="number" id="pt-se" min="1" max="' + it.n + '" value="' + sp.every + '" style="width:5em"> pages</label></div><p class="pt-note" style="margin:0" id="pt-spv"></p>';
			else h += '<div class="pt-row"><label>Pages to keep <input type="text" id="pt-sx" size="26" placeholder="e.g. 1, 3-5, 9" value="' + esc(sp.extract) + '"></label></div><p class="pt-note" style="margin:0">Click pages below to pick them, or type their numbers. They are saved together as one PDF, in the order you list them. <span id="pt-spv"></span></p>';
		}
		else if (MODE === "organize") { h = '<h3>Pages</h3><div class="pt-row"><span id="pt-orgsum"></span> <button type="button" class="tu-btn tu-btn--ghost" id="pt-addblank">+ Add a blank page</button> <button type="button" class="tu-btn tu-btn--ghost" id="pt-orgreset">Reset</button></div><p class="pt-note" style="margin:0">Drag pages to reorder them. Use the buttons under a page to rotate, duplicate or delete it.</p>'; }
		else if (MODE === "toimg") { h = '<h3>Picture settings</h3><div class="pt-row"><label>Format ' + sel("pt-fmt", [["jpg", "JPG (smaller)"], ["png", "PNG (sharper)"]], opt.fmt) + "</label><label>Quality " + sel("pt-dpi", Object.keys(PT.DPIS).map(function (k) { return [k, PT.DPIS[k]]; }), opt.dpi) + '</label><label>Pages <input type="text" id="pt-range" size="18" placeholder="all (or 1-3, 5)" value="' + esc(opt.range) + '"></label></div><p class="pt-note" style="margin:0">This PDF has ' + it.n + " pages.</p>"; }
		else if (MODE === "compress") { h = "<h3>How small?</h3>" + PT.COMPRESS.map(function (l) { return '<label style="display:flex;align-items:flex-start;gap:0.5em;margin:0.4em 0"><input type="radio" name="pt-lvl" value="' + l.id + '"' + (opt.level === l.id ? " checked" : "") + ' style="margin-top:0.3em"><span><b>' + l.name + '</b><br><span class="pt-note">' + l.note + "</span></span></label>"; }).join("") + '<p class="pt-note" style="margin:0.5em 0 0">Original size: <b>' + PT.formatBytes(it.size) + "</b>, " + it.n + " pages.</p>"; }
		c.innerHTML = h; bindCtl(); updateSplitPreview();
	}
	function bindCtl() {
		var g = function (id) { return $(id); }, on = function (id, ev, f) { var e = g(id); if (e) e.addEventListener(ev, f); };
		on("pt-size", "change", function () { opt.size = this.value; }); on("pt-orient", "change", function () { opt.orient = this.value; }); on("pt-margin", "change", function () { opt.margin = this.value; }); on("pt-fmt", "change", function () { opt.fmt = this.value; }); on("pt-dpi", "change", function () { opt.dpi = +this.value; }); on("pt-range", "input", function () { opt.range = this.value; });
		[].forEach.call($("pt-ctl").querySelectorAll('input[name="pt-lvl"]'), function (r) { r.addEventListener("change", function () { opt.level = this.value; }); });
		[].forEach.call($("pt-ctl").querySelectorAll("[data-tab]"), function (b) { b.addEventListener("click", function () { tab = b.dataset.tab; $("pt-out").hidden = true; render(); }); });
		on("pt-sr", "input", function () { sp.range = this.value; updateSplitPreview(); }); on("pt-se", "input", function () { sp.every = Math.max(1, +this.value || 1); updateSplitPreview(); }); on("pt-sx", "input", function () { sp.extract = this.value; updateSplitPreview(); syncGridSel(); });
		on("pt-addblank", "click", function () { var last = pages[pages.length - 1]; pages.push({ src: 0, index: -1, rot: 0, del: false, blank: true, key: ++uid }); renderGrid(); orgSum(); }); on("pt-orgreset", "click", function () { buildPages().then(function () { render(); }); });
	}
	function updateSplitPreview() {
		var e = $("pt-spv"); if (!e || MODE !== "split") return; var n = items[0].n, t;
		if (tab === "range") { var r = PT.parseRanges(sp.range, n); t = !sp.range.trim() ? "" : r.ok ? "This makes " + r.groups.length + (r.groups.length === 1 ? " file." : " files.") : '<span style="color:#c0392b">' + esc(r.error) + "</span>"; }
		else if (tab === "every") t = "This makes " + PT.chunk(n, sp.every).length + " files.";
		else { var x = PT.parseRanges(sp.extract, n); t = !sp.extract.trim() ? "" : x.ok ? x.pages.length + (x.pages.length === 1 ? " page" : " pages") + " selected." : '<span style="color:#c0392b">' + esc(x.error) + "</span>"; }
		e.innerHTML = t;
	}
	/* ---------- the page grid (organize / pick pages) ---------- */
	var thumbCache = {};
	async function renderGrid() {
		var box = $("pt-grid"), it = items[0]; if (!it) return; box.innerHTML = ""; var org = MODE === "organize";
		pages.forEach(function (p, i) {
			var d = document.createElement("div"); d.className = "pt-pg" + (p.del ? " is-del" : "") + (!org && selected(i) ? " is-sel" : ""); d.dataset.i = i; if (org) d.draggable = true; d.innerHTML = '<canvas width="120" height="160"></canvas><div class="pt-pn">' + (p.blank ? "Blank" : "Page " + (p.index + 1)) + (p.del ? " (deleted)" : "") + "</div>" + (org ? '<div class="pt-pa"><button type="button" data-a="rl" aria-label="Rotate left">↶</button><button type="button" data-a="rr" aria-label="Rotate right">↷</button><button type="button" data-a="dup" aria-label="Duplicate">⧉</button><button type="button" data-a="del" aria-label="Delete or restore">' + (p.del ? "↺" : "✕") + "</button></div>" : ""); box.appendChild(d); drawThumb(p, d.querySelector("canvas"));
		});
		box.onclick = function (e) { var d = e.target.closest(".pt-pg"); if (!d) return; var i = +d.dataset.i, b = e.target.closest("button[data-a]"); if (!org) { toggleExtract(i); return; } if (!b) return; var p = pages[i], a = b.dataset.a; if (a === "rl") p.rot = (p.rot + 270) % 360; else if (a === "rr") p.rot = (p.rot + 90) % 360; else if (a === "dup") pages.splice(i + 1, 0, Object.assign({}, p, { key: ++uid })); else if (a === "del") p.del = !p.del; renderGrid(); orgSum(); };
		if (org) sortable(box, ".pt-pg", function (f, t) { pages = PT.moveItem(pages, f, t); renderGrid(); }); else { box.ondragstart = box.ondragover = box.ondrop = box.ondragend = null; } orgSum();
	}
	function drawThumb(p, cv) {
		var it = items[0]; if (p.blank) { var ref = pages.filter(function (x) { return !x.blank; })[0], a = 0.77; cv.width = 120; cv.height = 156; var c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, 120, 156); c.strokeStyle = "#ccc"; c.strokeRect(0.5, 0.5, 119, 155); return; }
		var key = p.index + ":" + p.rot; if (thumbCache[it.id + key]) { blit(cv, thumbCache[it.id + key]); return; }
		pageCanvas(it.pdf, p.index + 1, 120, p.rot).then(function (c) { thumbCache[it.id + key] = c; blit(cv, c); }).catch(function () {});
	}
	function blit(cv, src) { cv.width = src.width; cv.height = src.height; cv.getContext("2d").drawImage(src, 0, 0); }
	function orgSum() { var e = $("pt-orgsum"); if (!e) return; var keep = pages.filter(function (p) { return !p.del; }).length; e.innerHTML = "<b>" + keep + "</b> of " + pages.length + " pages will be kept"; $("pt-go").disabled = busy || !keep; }
	function selected(i) { var r = PT.parseRanges(sp.extract, items[0].n); return r.ok && sp.extract.trim() && r.pages.indexOf(pages[i].index) >= 0; }
	function toggleExtract(i) { var n = items[0].n, r = PT.parseRanges(sp.extract, n), list = r.ok && sp.extract.trim() ? r.pages.slice() : [], idx = pages[i].index, at = list.indexOf(idx); if (at >= 0) list.splice(at, 1); else list.push(idx); sp.extract = PT.describe(list).replace(/^pages? /, ""); var inp = $("pt-sx"); if (inp) inp.value = sp.extract; syncGridSel(); updateSplitPreview(); }
	function syncGridSel() { [].forEach.call($("pt-grid").querySelectorAll(".pt-pg"), function (d) { d.classList.toggle("is-sel", !!selected(+d.dataset.i)); }); }
	// the "Pages 1-3, 5" text builder above emits ascending runs; typed order is kept when the person types

	/* ---------- results ---------- */
	function showResults(list, extra) {
		var out = $("pt-out"), tot = 0; list.forEach(function (r) { tot += r.blob.size; });
		var h = "<h3>" + (extra && extra.title ? extra.title : list.length === 1 ? "Your file is ready" : list.length + " files are ready") + "</h3>" + (extra && extra.note ? '<p class="pt-note" style="margin:0 0 0.5em">' + extra.note + "</p>" : "");
		list.forEach(function (r, i) { h += '<div class="pt-res">' + (r.thumbUrl ? '<img alt="" src="' + r.thumbUrl + '">' : "") + '<div class="pt-res-n">' + esc(r.name) + '<div class="pt-res-m">' + (r.meta ? esc(r.meta) + " · " : "") + PT.formatBytes(r.blob.size) + '</div></div><button type="button" class="tu-btn tu-btn--primary" data-dl="' + i + '">Download</button></div>'; });
		if (list.length > 1) h += '<div class="pt-res"><div class="pt-res-n">All ' + list.length + " files in one ZIP<div class=\"pt-res-m\">" + PT.formatBytes(tot) + '</div></div><button type="button" class="tu-btn tu-btn--ghost" id="pt-zip">Download ZIP</button></div>';
		out.innerHTML = h; out.hidden = false; out.onclick = async function (e) { var b = e.target.closest("[data-dl]"); if (b) { var r = list[+b.dataset.dl]; save(r.blob, r.name); return; } if (e.target.id === "pt-zip") { prog("Building the ZIP..."); var files = []; for (var i = 0; i < list.length; i++) files.push({ name: list[i].name, data: new Uint8Array(await list[i].blob.arrayBuffer()) }); save(new Blob([Z.zipStore(files)], { type: "application/zip" }), (extra && extra.zip) || "files.zip"); prog(""); } };
		out.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
	function pdfBlob(bytes) { return new Blob([bytes], { type: "application/pdf" }); }
	function fail(e) { console.error(e); var m = String((e && e.message) || e); notice(/encrypt/i.test(m) ? "This PDF is password protected, so it cannot be changed here. Open it in the <a href=\"/pdf\">PDF editor</a> (it asks for the password) and download a copy first." : "Something went wrong: " + esc(m), true); }

	/* ---------- the six jobs ---------- */
	async function copyInto(out, srcBytes, idxs, cache) { var key = srcBytes; var src = cache.get(key); if (!src) { src = await window.PDFLib.PDFDocument.load(srcBytes, { updateMetadata: false }); cache.set(key, src); } var cp = await out.copyPages(src, idxs); cp.forEach(function (p) { out.addPage(p); }); }
	async function run() {
		if (busy) return; busy = true; $("pt-go").disabled = true; $("pt-out").hidden = true; notice(""); var L = window.PDFLib;
		try {
			await ensureLibs();
			if (MODE === "merge") {
				var out = await L.PDFDocument.create(), cache = new Map(), total = 0;
				for (var i = 0; i < items.length; i++) { var it = items[i], r = PT.parseRanges(it.range, it.n); if (!r.ok) throw new Error(it.name + ": " + r.error); prog("Adding " + it.name + " (" + (i + 1) + " of " + items.length + ")..."); await copyInto(out, it.bytes, r.pages, cache); total += r.pages.length; await tick(); }
				out.setProducer("MES PDF Tools (mes.fm/merge-pdf)"); var b = await out.save(); showResults([{ name: PT.mergedName(items.map(function (x) { return x.name; })), blob: pdfBlob(b), meta: total + " pages" }], { title: "Merged: " + items.length + " files, " + total + " pages" });
			} else if (MODE === "split") {
				var it0 = items[0], n = it0.n, groups;
				if (tab === "range") { var rr = PT.parseRanges(sp.range, n); if (!sp.range.trim()) throw new Error("Type the ranges to split at, like 1-3, 4-6."); if (!rr.ok) throw new Error(rr.error); groups = rr.groups; }
				else if (tab === "every") groups = PT.chunk(n, sp.every); else { var xr = PT.parseRanges(sp.extract, n); if (!sp.extract.trim()) throw new Error("Pick the pages to keep."); if (!xr.ok) throw new Error(xr.error); groups = [xr.pages]; }
				var src = await L.PDFDocument.load(it0.bytes, { updateMetadata: false }), res = [], used = {};
				for (var g = 0; g < groups.length; g++) { prog("Making file " + (g + 1) + " of " + groups.length + "..."); var o2 = await L.PDFDocument.create(), cp = await o2.copyPages(src, groups[g]); cp.forEach(function (p) { o2.addPage(p); }); var bytes = await o2.save(), nm = tab === "extract" ? PT.clean(PT.base(it0.name)) + "-extract.pdf" : PT.splitName(it0.name, g + 1, groups.length); res.push({ name: PT.uniqueName(nm, used), blob: pdfBlob(bytes), meta: PT.describe(groups[g]) }); await tick(); }
				showResults(res, { zip: PT.clean(PT.base(it0.name)) + "-split.zip" });
			} else if (MODE === "organize") {
				var it1 = items[0], keep = pages.filter(function (p) { return !p.del; }); if (!keep.length) throw new Error("Keep at least one page."); var out3 = await L.PDFDocument.create(), src3 = await L.PDFDocument.load(it1.bytes, { updateMetadata: false }), ref = keep.filter(function (p) { return !p.blank; })[0], rs = ref ? src3.getPage(ref.index).getSize() : { width: 595, height: 842 };
				for (var k = 0; k < keep.length; k++) { var pg = keep[k], np; if (pg.blank) np = out3.addPage([rs.width, rs.height]); else { var c1 = await out3.copyPages(src3, [pg.index]); np = out3.addPage(c1[0]); if (pg.rot) np.setRotation(L.degrees(((np.getRotation().angle + pg.rot) % 360 + 360) % 360)); } if (k % 10 === 9) { prog("Page " + (k + 1) + " of " + keep.length + "..."); await tick(); } }
				out3.setProducer("MES PDF Tools (mes.fm/organize-pdf)"); var b3 = await out3.save(); showResults([{ name: PT.clean(PT.base(it1.name)) + "-organized.pdf", blob: pdfBlob(b3), meta: keep.length + " pages" }]);
			} else if (MODE === "images") {
				var out4 = await L.PDFDocument.create();
				for (var m = 0; m < items.length; m++) { var im = items[m]; prog("Adding picture " + (m + 1) + " of " + items.length + "..."); var emb, w = im.w, h = im.h, mime = (im.file.type || "").toLowerCase(), direct = !im.rot && (mime === "image/jpeg" || mime === "image/png");
					if (direct) { var ab = new Uint8Array(await im.file.arrayBuffer()); emb = mime === "image/png" ? await out4.embedPng(ab) : await out4.embedJpg(ab); }
					else { var q = im.rot % 180 === 90, cv = document.createElement("canvas"); cv.width = q ? im.h : im.w; cv.height = q ? im.w : im.h; var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.translate(cv.width / 2, cv.height / 2); cx.rotate(im.rot * Math.PI / 180); cx.drawImage(im.el, -im.w / 2, -im.h / 2); var jb = await new Promise(function (r) { cv.toBlob(r, "image/jpeg", 0.92); }); emb = await out4.embedJpg(new Uint8Array(await jb.arrayBuffer())); w = cv.width; h = cv.height; }
					if (!direct) { } else if (im.rot) { } var pl = PT.imagePage(w, h, opt.size, opt.orient, opt.margin), page = out4.addPage([pl.pageW, pl.pageH]); page.drawImage(emb, { x: pl.x, y: pl.y, width: pl.w, height: pl.h }); await tick(); }
				out4.setProducer("MES PDF Tools (mes.fm/jpg-to-pdf)"); var b4 = await out4.save(); showResults([{ name: items.length === 1 ? PT.clean(PT.base(items[0].name)) + ".pdf" : "images.pdf", blob: pdfBlob(b4), meta: items.length + (items.length === 1 ? " page" : " pages") }]);
			} else if (MODE === "toimg") {
				var it5 = items[0], rg = PT.parseRanges(opt.range, it5.n); if (!rg.ok) throw new Error(rg.error); var res5 = [], used5 = {}, ext = opt.fmt === "png" ? "png" : "jpg", sc = PT.renderScale(opt.dpi);
				for (var s = 0; s < rg.pages.length; s++) { var no = rg.pages[s] + 1; prog("Rendering page " + no + " (" + (s + 1) + " of " + rg.pages.length + ")..."); var pgp = await it5.pdf.getPage(no), vp = pgp.getViewport({ scale: sc }), cv5 = document.createElement("canvas"); cv5.width = Math.round(vp.width); cv5.height = Math.round(vp.height); var c5 = cv5.getContext("2d"); c5.fillStyle = "#fff"; c5.fillRect(0, 0, cv5.width, cv5.height); await pgp.render({ canvasContext: c5, viewport: vp }).promise;
					var bl = await new Promise(function (r) { cv5.toBlob(r, ext === "png" ? "image/png" : "image/jpeg", 0.9); }); var th = document.createElement("canvas"); th.width = 70; th.height = Math.round(70 * cv5.height / cv5.width); th.getContext("2d").drawImage(cv5, 0, 0, th.width, th.height);
					res5.push({ name: PT.uniqueName(PT.pageImageName(it5.name, no, it5.n, ext), used5), blob: bl, meta: cv5.width + "×" + cv5.height + " px", thumbUrl: th.toDataURL("image/jpeg", 0.7) }); cv5.width = cv5.height = 1; await tick(); }
				showResults(res5, { zip: PT.clean(PT.base(it5.name)) + "-images.zip" });
			} else if (MODE === "compress") {
				var it6 = items[0], lv = PT.COMPRESS.filter(function (x) { return x.id === opt.level; })[0], bytes6;
				if (!lv.dpi) { prog("Rewriting the PDF..."); var d6 = await L.PDFDocument.load(it6.bytes, { updateMetadata: false }); d6.setProducer("MES PDF Tools (mes.fm/compress-pdf)"); bytes6 = await d6.save({ useObjectStreams: true }); }
				else { var o6 = await L.PDFDocument.create(), sc6 = lv.dpi / 72; for (var t = 1; t <= it6.n; t++) { prog("Shrinking page " + t + " of " + it6.n + "..."); var p6 = await it6.pdf.getPage(t), v6 = p6.getViewport({ scale: sc6 }), v1 = p6.getViewport({ scale: 1 }), c6 = document.createElement("canvas"); c6.width = Math.round(v6.width); c6.height = Math.round(v6.height); var x6 = c6.getContext("2d"); x6.fillStyle = "#fff"; x6.fillRect(0, 0, c6.width, c6.height); await p6.render({ canvasContext: x6, viewport: v6 }).promise; var jb6 = await new Promise(function (r) { c6.toBlob(r, "image/jpeg", lv.q); }), em6 = await o6.embedJpg(new Uint8Array(await jb6.arrayBuffer())), pg6 = o6.addPage([v1.width, v1.height]); pg6.drawImage(em6, { x: 0, y: 0, width: v1.width, height: v1.height }); c6.width = c6.height = 1; await tick(); } o6.setProducer("MES PDF Tools (mes.fm/compress-pdf)"); bytes6 = await o6.save(); }
				var smaller = bytes6.length < it6.size; showResults(smaller ? [{ name: PT.clean(PT.base(it6.name)) + "-compressed.pdf", blob: pdfBlob(bytes6), meta: PT.savedText(it6.size, bytes6.length) }] : [], { title: smaller ? "Compressed" : "This level could not make it smaller", note: smaller ? PT.savedText(it6.size, bytes6.length) + "." : "The result (" + PT.formatBytes(bytes6.length) + ") is not smaller than the original (" + PT.formatBytes(it6.size) + "). Try a stronger level, or keep the original: it may already be compact." });
			}
			prog("");
		} catch (e) { prog(""); fail(e); }
		busy = false; updateGo(); if (MODE === "organize") orgSum();
	}
	$("pt-go").onclick = run;
	render();
})();
