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
