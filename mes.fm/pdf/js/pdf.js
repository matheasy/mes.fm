/* MES PDF Editor -- pure helpers (no DOM, no pdf.js / pdf-lib). Browser global `PDM`; node: require('./tool_apps_src/pdf-editor/lib.js'); tests: node tool_apps_src/pdf-editor-tests.js
 * Annotations live in PDF user space (points, origin bottom-left, y up) of the SOURCE page, so rotating a page just rotates what is drawn on it. */
(function (root) {
	"use strict";
	var uid = 0; function newId(p) { uid++; return (p || "a") + Date.now().toString(36) + uid.toString(36); }
	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	/* ---------- the page view: PDF point <-> canvas pixel, for a page of W x H points whose view box starts at (x0, y0), rotated clockwise by rot degrees ---------- */
	function Viewport(W, H, x0, y0, rot, scale) {
		rot = ((Math.round(rot / 90) % 4) + 4) % 4 * 90; var s = scale || 1, q = rot === 90 || rot === 270;
		this.W = W; this.H = H; this.x0 = x0 || 0; this.y0 = y0 || 0; this.rot = rot; this.scale = s; this.width = (q ? H : W) * s; this.height = (q ? W : H) * s;
	}
	Viewport.prototype.toView = function (x, y) {
		var X = x - this.x0, Y = y - this.y0, s = this.scale, W = this.W, H = this.H;
		switch (this.rot) { case 90: return [Y * s, X * s]; case 180: return [(W - X) * s, Y * s]; case 270: return [(H - Y) * s, (W - X) * s]; default: return [X * s, (H - Y) * s]; }
	};
	Viewport.prototype.toPdf = function (px, py) {
		var s = this.scale, W = this.W, H = this.H, X, Y;
		switch (this.rot) { case 90: Y = px / s; X = py / s; break; case 180: X = W - px / s; Y = py / s; break; case 270: Y = H - px / s; X = W - py / s; break; default: X = px / s; Y = H - py / s; }
		return [X + this.x0, Y + this.y0];
	};
	// a length along the page's x axis, in pixels (for line widths and font sizes)
	Viewport.prototype.len = function (l) { return l * this.scale; };
	/* ---------- text ---------- */
	var WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
	function winAnsiOk(str) { for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); if (c === 10 || c === 13 || c === 9) continue; if (c >= 32 && c <= 126) continue; if (c >= 160 && c <= 255) continue; if (WINANSI_EXTRA.indexOf(str[i]) >= 0) continue; return false; } return true; }
	// word-wrap `text` (with \n) to maxW using measure(str) -> width; very long words are split
	function wrapLines(text, maxW, measure) {
		var out = [];
		String(text == null ? "" : text).split(/\r?\n/).forEach(function (para) {
			if (para === "") { out.push(""); return; }
			var words = para.split(/(\s+)/), line = "";
			words.forEach(function (w) {
				if (w === "") return;
				var t = line + w;
				if (measure(t) <= maxW || line === "") { if (measure(t) > maxW && !/^\s+$/.test(w)) { var cur = line; for (var i = 0; i < w.length; i++) { if (measure(cur + w[i]) > maxW && cur !== "") { out.push(cur); cur = ""; } cur += w[i]; } line = cur; } else line = t; }
				else { out.push(line.replace(/\s+$/, "")); line = /^\s+$/.test(w) ? "" : w; }
			});
			out.push(line.replace(/\s+$/, ""));
		});
		return out.length ? out : [""];
	}
	var LINE_H = 1.2, ASCENT = 0.86, PAD = 3;
	// height of a text annotation holding n lines
	function textHeight(n, size) { return n * size * LINE_H + PAD * 2; }
	/* ---------- turning a page's text items into editable lines (for the Edit text tool) ----------
	 * items: [{ str, transform:[a,b,c,d,e,f], width, height, fontName }] in PDF user space; styles[fontName].fontFamily tells serif / monospace / sans */
	function groupText(items, styles) {
		var it = items.filter(function (i) { return i && typeof i.str === "string" && i.str.trim() !== "" && i.transform; }).map(function (i) { var size = Math.hypot(i.transform[2], i.transform[3]) || i.height || 10; return { s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, size: size, family: familyOf(i, styles) }; });
		it.sort(function (a, b) { return Math.abs(b.y - a.y) > 0.4 * Math.min(a.size, b.size) ? b.y - a.y : a.x - b.x; });
		var lines = [], cur = null;
		it.forEach(function (i) {
			if (cur && Math.abs(cur.y - i.y) < 0.4 * cur.size && i.x - (cur.x + cur.w) < 1.2 * cur.size && i.x >= cur.x - 1) { var gap = i.x - (cur.x + cur.w); cur.text += (gap > 0.15 * cur.size && !/\s$/.test(cur.text) ? " " : "") + i.s; cur.w = i.x + i.w - cur.x; cur.size = Math.max(cur.size, i.size); }
			else { cur = { text: i.s, x: i.x, y: i.y, w: i.w, size: i.size, family: i.family }; lines.push(cur); }
		});
		return lines;
	}
	function familyOf(i, styles) { var f = styles && styles[i.fontName] && styles[i.fontName].fontFamily || "", n = String(i.fontName || "") + " " + f; return /mono|courier|consol/i.test(n) ? "mono" : /serif/i.test(f) && !/sans/i.test(f) || /times|georgia|garamond|minion|palatino|serif/i.test(n) && !/sans/i.test(n) ? "serif" : "sans"; }
	function lineAt(lines, x, y) { for (var i = 0; i < lines.length; i++) { var l = lines[i]; if (x >= l.x - 2 && x <= l.x + l.w + 2 && y >= l.y - 0.28 * l.size && y <= l.y + 0.95 * l.size) return l; } return null; }
	/* ---------- annotations: boxes, hit tests, moving ---------- */
	function bbox(a) {
		switch (a.t) {
			case "pen": var xs = a.pts.map(function (p) { return p[0]; }), ys = a.pts.map(function (p) { return p[1]; }), h = (a.width || 1) / 2; return { x: Math.min.apply(null, xs) - h, y: Math.min.apply(null, ys) - h, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 2 * h, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 2 * h };
			case "line": case "arrow": { var m = Math.max(a.sw || 1, 1) / 2 + (a.t === "arrow" ? (a.sw || 1) * 3 : 0); return { x: Math.min(a.x1, a.x2) - m, y: Math.min(a.y1, a.y2) - m, w: Math.abs(a.x2 - a.x1) + 2 * m, h: Math.abs(a.y2 - a.y1) + 2 * m }; }
			case "note": return { x: a.x, y: a.y - 18, w: 18, h: 18 };
			default: return { x: a.x, y: a.y, w: a.w, h: a.h };
		}
	}
	function distToSegment(px, py, x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0; return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); }
	function hit(a, x, y, tol) {
		tol = tol || 4;
		if (a.t === "pen") { var h = (a.width || 1) / 2 + tol; for (var i = 1; i < a.pts.length; i++) if (distToSegment(x, y, a.pts[i - 1][0], a.pts[i - 1][1], a.pts[i][0], a.pts[i][1]) <= h) return true; return a.pts.length === 1 && Math.hypot(x - a.pts[0][0], y - a.pts[0][1]) <= h; }
		if (a.t === "line" || a.t === "arrow") return distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= (a.sw || 1) / 2 + tol;
		var b = bbox(a); if (a.t === "ellipse" && !a.fill) { var cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2; if (rx < 1 || ry < 1) return false; var d = Math.hypot((x - cx) / rx, (y - cy) / ry); return Math.abs(d - 1) <= (tol + (a.sw || 1)) / Math.min(rx, ry) + 0.02 || false; }
		if (a.t === "rect" && !a.fill && a.stroke) { var inner = x > b.x + tol + (a.sw || 1) && x < b.x + b.w - tol - (a.sw || 1) && y > b.y + tol + (a.sw || 1) && y < b.y + b.h - tol - (a.sw || 1); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol && !inner; }
		return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
	}
	// the topmost annotation under a point (list order = paint order)
	function pick(list, x, y, tol) { for (var i = list.length - 1; i >= 0; i--) if (hit(list[i], x, y, tol)) return list[i]; return null; }
	function move(a, dx, dy) {
		if (a.t === "pen") a.pts = a.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; });
		else if (a.t === "line" || a.t === "arrow") { a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy; }
		else { a.x += dx; a.y += dy; }
		return a;
	}
	// resize a box-shaped annotation by dragging a corner (corner = "nw" | "ne" | "sw" | "se"; y is up); keepRatio for pictures
	function resizeBox(a, corner, px, py, keepRatio) {
		var x0 = a.x, y0 = a.y, x1 = a.x + a.w, y1 = a.y + a.h, ratio = a.w / (a.h || 1), nx0 = x0, ny0 = y0, nx1 = x1, ny1 = y1;
		if (corner[1] === "w") nx0 = px; else nx1 = px; if (corner[0] === "n") ny1 = py; else ny0 = py;
		if (keepRatio) { var w = Math.abs(nx1 - nx0), h = w / ratio; if (corner[0] === "n") ny1 = ny0 + h; else ny0 = ny1 - h; }
		var minS = 6; if (Math.abs(nx1 - nx0) < minS) nx1 = nx0 + (corner[1] === "w" ? -minS : minS); if (Math.abs(ny1 - ny0) < minS) ny1 = ny0 + (corner[0] === "n" ? minS : -minS);
		a.x = Math.min(nx0, nx1); a.w = Math.abs(nx1 - nx0); a.y = Math.min(ny0, ny1); a.h = Math.abs(ny1 - ny0); return a;
	}
	/* ---------- freehand strokes: drop near-duplicate points, then Ramer-Douglas-Peucker ---------- */
	function simplify(pts, eps) {
		if (pts.length < 3) return pts.slice();
		function rdp(i0, i1, keep) { var d = 0, idx = -1; for (var i = i0 + 1; i < i1; i++) { var dd = distToSegment(pts[i][0], pts[i][1], pts[i0][0], pts[i0][1], pts[i1][0], pts[i1][1]); if (dd > d) { d = dd; idx = i; } } if (d > eps) { keep[idx] = true; rdp(i0, idx, keep); rdp(idx, i1, keep); } }
		var keep = {}; keep[0] = true; keep[pts.length - 1] = true; rdp(0, pts.length - 1, keep); return pts.filter(function (p, i) { return keep[i]; });
	}
	// Chaikin smoothing (one pass keeps the ends)
	function smooth(pts, passes) {
		var p = pts.slice(); for (var k = 0; k < (passes == null ? 1 : passes); k++) { if (p.length < 3) break; var o = [p[0]]; for (var i = 0; i < p.length - 1; i++) { var a = p[i], b = p[i + 1]; o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } o.push(p[p.length - 1]); p = o; } return p;
	}
	/* ---------- images: the box around the non-transparent pixels of RGBA data (for a trimmed signature) ---------- */
	function alphaBounds(data, w, h, thresh) {
		var minx = w, miny = h, maxx = -1, maxy = -1, t = thresh == null ? 8 : thresh;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > t) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
		return maxx < 0 ? null : { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
	}
	// make near-white pixels transparent (a photographed or scanned signature): soft edge between lo and hi lightness
	function whiteToAlpha(data, lo, hi) {
		lo = lo == null ? 200 : lo; hi = hi == null ? 245 : hi;
		for (var i = 0; i < data.length; i += 4) { var l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2], a = l <= lo ? 255 : l >= hi ? 0 : Math.round(255 * (hi - l) / (hi - lo)); data[i + 3] = Math.min(data[i + 3], a); if (a < 255) { data[i] = Math.min(data[i], 60); data[i + 1] = Math.min(data[i + 1], 60); data[i + 2] = Math.min(data[i + 2], 80); } }
		return data;
	}
	/* ---------- colours and files ---------- */
	function hexToRgb(h) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) { m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(h || ""); if (m) return [parseInt(m[1] + m[1], 16) / 255, parseInt(m[2] + m[2], 16) / 255, parseInt(m[3] + m[3], 16) / 255]; return [0, 0, 0]; } var n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
	function rgbToHex(r, g, b) { return "#" + [r, g, b].map(function (v) { var x = clamp(Math.round(v), 0, 255).toString(16); return x.length < 2 ? "0" + x : x; }).join(""); }
	function editedName(name) { var base = String(name || "document").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "document"; return base + (/-edited$/i.test(base) ? "" : "-edited") + ".pdf"; }
	function formatBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
	/* ---------- undo / redo over JSON snapshots ---------- */
	function History(limit) { this.limit = limit || 80; this.stack = []; this.i = -1; }
	History.prototype.reset = function (snap) { this.stack = [snap]; this.i = 0; };
	History.prototype.push = function (snap) { if (this.i >= 0 && this.stack[this.i] === snap) return false; this.stack = this.stack.slice(0, this.i + 1); this.stack.push(snap); if (this.stack.length > this.limit) this.stack.shift(); this.i = this.stack.length - 1; return true; };
	History.prototype.canUndo = function () { return this.i > 0; }; History.prototype.canRedo = function () { return this.i < this.stack.length - 1; };
	History.prototype.undo = function () { return this.canUndo() ? this.stack[--this.i] : null; }; History.prototype.redo = function () { return this.canRedo() ? this.stack[++this.i] : null; };
	// default stamps / sizes
	var SIZES = { sigW: 150, stampW: 28, noteW: 18 };
	var PDM = { newId: newId, clamp: clamp, esc: esc, Viewport: Viewport, winAnsiOk: winAnsiOk, wrapLines: wrapLines, LINE_H: LINE_H, ASCENT: ASCENT, PAD: PAD, textHeight: textHeight, groupText: groupText, lineAt: lineAt, bbox: bbox, hit: hit, pick: pick, move: move, resizeBox: resizeBox, distToSegment: distToSegment, simplify: simplify, smooth: smooth, alphaBounds: alphaBounds, whiteToAlpha: whiteToAlpha, hexToRgb: hexToRgb, rgbToHex: rgbToHex, editedName: editedName, formatBytes: formatBytes, History: History, SIZES: SIZES };
	if (typeof module !== "undefined" && module.exports) module.exports = PDM; else root.PDM = PDM;
})(typeof window !== "undefined" ? window : this);

/* MES PDF Editor: the model (sources, pages, annotations), library loading, page rendering, annotation painting, history. Global `PD`. */
(function () {
	"use strict";
	var M = window.PDM, PD = window.PD = { M: M, doc: null, zoom: 1, tool: "select", sel: null, cur: 0, dirty: false, images: {}, S: { thumbs: true, win: null }, hooks: {}, clip: null };
	var $ = PD.$ = function (id) { return document.getElementById(id); };
	var KEY = "mes-pdf-editor:v1";
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { if (sv.thumbs === false) PD.S.thumbs = false; if (sv.win === false) PD.S.win = false; PD.S.prefs = sv.prefs || {}; } } catch (e) {}
	PD.S.prefs = PD.S.prefs || {};
	PD.saveS = function () { try { localStorage.setItem(KEY, JSON.stringify({ thumbs: PD.S.thumbs, win: PD.S.win, prefs: PD.S.prefs })); } catch (e) {} };
	PD.on = function (n, f) { (PD.hooks[n] = PD.hooks[n] || []).push(f); }; PD.emit = function (n, a) { (PD.hooks[n] || []).forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); };
	PD.toast = function (msg, ms) { var t = $("pd-toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(PD.toast._t); PD.toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2200); };
	PD.hint = function (s) { $("pd-hint").textContent = s || ""; };

	/* ---------- libraries (loaded on first use, from cdnjs, pinned) ---------- */
	var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js", PDFLIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
	function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Could not load " + src)); }; document.head.appendChild(s); }); }
	PD.ensureLibs = function () {
		if (!PD._libs) PD._libs = Promise.all([loadScript(PDFJS), loadScript(PDFLIB)]).then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }).catch(function (e) { PD._libs = null; throw e; });
		return PD._libs;
	};
	var dpr = function () { return Math.min(window.devicePixelRatio || 1, 2.5); };

	/* ---------- document model ---------- */
	function pageEntry(src, index, proxy) { var v = proxy.view; return { id: M.newId("p"), src: src, index: index, W: v[2] - v[0], H: v[3] - v[1], x0: v[0], y0: v[1], rot0: proxy.rotate || 0, rot: 0, annots: [], proxy: proxy }; }
	function blankEntry(w, h) { return { id: M.newId("p"), src: -1, index: -1, blank: true, W: w, H: h, x0: 0, y0: 0, rot0: 0, rot: 0, annots: [], proxy: null }; }
	PD.blankPage = blankEntry;
	function askPassword(reason) {
		return new Promise(function (res) {
			PD.dialog('<h3>This PDF is password protected</h3><p class="pd-note">' + (reason === 2 ? "That password was not right. Try again." : "Type the password to open it. It stays in your browser.") + '</p><div class="pd-row"><input type="password" id="pd-pw" autocomplete="off" aria-label="Password"></div><div class="pd-end"><button type="button" class="pd-btn" id="pd-pw-no">Cancel</button><button type="button" class="pd-btn pd-btn--primary" id="pd-pw-ok">Open</button></div>');
			var inp = $("pd-pw"); inp.focus(); function done(v) { PD.closeDialog(); res(v); }
			$("pd-pw-ok").onclick = function () { done(inp.value); }; $("pd-pw-no").onclick = function () { done(null); }; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") done(inp.value); });
		});
	}
	// load a file's bytes as a new source; returns { src index, pages entries }
	PD.loadSource = async function (bytes, name) {
		await PD.ensureLibs();
		var task = window.pdfjsLib.getDocument({ data: bytes.slice(0) });
		task.onPassword = function (update, reason) { askPassword(reason).then(function (pw) { if (pw == null) task.destroy(); else update(pw); }); };
		var pdf = await task.promise, n = pdf.numPages, proxies = [];
		if (n > 800) PD.toast("This PDF has " + n + " pages; it may feel slow.", 4000);
		for (var i = 1; i <= n; i++) proxies.push(await pdf.getPage(i));
		var s = { bytes: bytes, name: name, pdf: pdf, proxies: proxies, locked: false, libDoc: null };
		return s;
	};
	PD.open = async function (file) {
		try {
			PD.busy(true, "Opening " + file.name + "...");
			var bytes = new Uint8Array(await file.arrayBuffer()); if (String.fromCharCode.apply(null, bytes.slice(0, 5)) !== "%PDF-") { var head = String.fromCharCode.apply(null, bytes.slice(0, 1024)); if (head.indexOf("%PDF-") < 0) throw new Error("That does not look like a PDF file."); }
			var s = await PD.loadSource(bytes, file.name);
			PD.doc = { name: file.name, srcs: [s], pages: s.proxies.map(function (p, i) { return pageEntry(0, i, p); }) };
			PD.images = {}; PD.sel = null; PD.cur = 0; PD.dirty = false; PD.hist.reset(PD.snapshot()); PD.layout(true); PD.emit("open");
		} catch (e) { console.error(e); PD.toast((e && e.message) || "Could not open that PDF", 4500); } finally { PD.busy(false); }
	};
	PD.newBlank = async function () { await PD.ensureLibs(); PD.doc = { name: "Untitled.pdf", srcs: [], pages: [blankEntry(612, 792)] }; PD.images = {}; PD.sel = null; PD.cur = 0; PD.dirty = false; PD.hist.reset(PD.snapshot()); PD.layout(true); PD.emit("open"); };
	PD.addPdf = async function (file) {
		if (!PD.doc) return PD.open(file);
		try { PD.busy(true, "Adding pages..."); var bytes = new Uint8Array(await file.arrayBuffer()), s = await PD.loadSource(bytes, file.name), si = PD.doc.srcs.push(s) - 1; s.proxies.forEach(function (p, i) { PD.doc.pages.push(pageEntry(si, i, p)); }); PD.commit(); PD.layout(); PD.toast("Added " + s.proxies.length + (s.proxies.length === 1 ? " page" : " pages")); }
		catch (e) { PD.toast((e && e.message) || "Could not add that PDF", 4500); } finally { PD.busy(false); }
	};
	PD.busy = function (on, msg) { var e = $("pd-st-doc"); if (on) { e._old = e.textContent; e.textContent = msg || "Working..."; document.body.style.cursor = "progress"; } else { if (e._old != null) e.textContent = e._old; document.body.style.cursor = ""; PD.status(); } };
	PD.status = function () { var d = PD.doc; $("pd-st-doc").textContent = d ? d.pages.length + (d.pages.length === 1 ? " page" : " pages") + (PD.dirty ? " · unsaved changes" : "") : "No file"; $("pd-name").textContent = d ? d.name : "No file open"; document.title = (d && PD.dirty ? "* " : "") + (PD._title || (PD._title = document.title.replace(/^\* /, ""))); };
	PD.page = function (id) { return PD.doc ? PD.doc.pages.filter(function (p) { return p.id === id; })[0] : null; };
	PD.vp = function (p, scale) { return new M.Viewport(p.W, p.H, p.x0, p.y0, p.rot0 + p.rot, scale == null ? PD.zoom : scale); };

	/* ---------- history: JSON snapshots of the page list and every annotation ---------- */
	PD.hist = new M.History(80);
	PD.snapshot = function () { return JSON.stringify({ pages: PD.doc ? PD.doc.pages.map(function (p) { return { id: p.id, src: p.src, index: p.index, blank: !!p.blank, W: p.W, H: p.H, x0: p.x0, y0: p.y0, rot0: p.rot0, rot: p.rot, annots: p.annots }; }) : [] }); };
	PD.commit = function () { if (!PD.doc) return; PD.dirty = true; if (PD.hist.push(PD.snapshot())) PD.emit("history"); PD.status(); };
	function restore(snap) {
		if (!snap || !PD.doc) return; var d = JSON.parse(snap), selId = PD.sel && PD.sel.id;
		PD.doc.pages = d.pages.map(function (q) { var p = Object.assign({}, q); p.proxy = q.blank ? null : PD.doc.srcs[q.src].proxies[q.index]; return p; });
		PD.sel = null; if (selId) PD.doc.pages.forEach(function (p) { p.annots.forEach(function (a) { if (a.id === selId) PD.sel = { page: p.id, id: a.id }; }); });
		PD.cur = Math.min(PD.cur, PD.doc.pages.length - 1); PD.dirty = true; PD.layout(); PD.emit("history"); PD.status();
	}
	PD.undo = function () { var s = PD.hist.undo(); if (s) restore(s); }; PD.redo = function () { var s = PD.hist.redo(); if (s) restore(s); };

	/* ---------- text measuring with the real PDF font metrics (so the editor wraps exactly as the export will) ---------- */
	var FONTS = { sans: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"], serif: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"], mono: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"] };
	var CSSF = { sans: 'Helvetica, Arial, "Liberation Sans", sans-serif', serif: '"Times New Roman", Times, "Liberation Serif", serif', mono: '"Courier New", Courier, "Liberation Mono", monospace' };
	PD.fontName = function (a) { return FONTS[a.font || "sans"][(a.bold ? 1 : 0) + (a.italic ? 2 : 0)]; };
	PD.cssFont = function (a, px) { return (a.italic ? "italic " : "") + (a.bold ? "bold " : "") + px + "px " + CSSF[a.font || "sans"]; };
	var mctx = document.createElement("canvas").getContext("2d");
	PD.measure = function (a, str) { mctx.font = PD.cssFont(a, 100); return mctx.measureText(str).width / 100 * (a.size || 12); };   // widths of the standard fonts match their system look-alikes closely; the export wraps with the same function
	PD.layoutText = function (a) {
		var raster = !M.winAnsiOk(a.text || ""), inner = Math.max(8, a.w - M.PAD * 2); a.raster = raster; a.lines = M.wrapLines(a.text || "", inner, function (s) { return PD.measure(a, s); });
		var h = M.textHeight(a.lines.length, a.size); a.y = a.y + a.h - h; a.h = h; return a;   // grows downward: the top edge stays put
	};

	/* ---------- painting annotations (also used to flatten pages) ---------- */
	function poly(ctx, vp, pts) { ctx.beginPath(); pts.forEach(function (p, i) { var v = vp.toView(p[0], p[1]); if (i) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); }); ctx.closePath(); }
	function corners(a) { return [[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]]; }
	PD.image = function (id) { var r = PD.images[id]; if (!r) return null; if (!r.el) { r.el = new Image(); r.el.onload = function () { PD.emit("imgload"); }; r.el.src = r.data; } return r.el.complete && r.el.naturalWidth ? r.el : null; };
	PD.stampPath = function (kind) { return kind === "check" ? [[0.08, 0.55], [0.38, 0.88], [0.94, 0.12]] : kind === "cross" ? null : null; };
	PD.paintAnnot = function (ctx, vp, a, state) {
		var s = vp.scale; ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
		switch (a.t) {
			case "pen": ctx.globalAlpha = a.alpha || 1; ctx.strokeStyle = a.color; ctx.lineWidth = Math.max(0.5, vp.len(a.width)); ctx.beginPath(); a.pts.forEach(function (p, i) { var v = vp.toView(p[0], p[1]); if (i) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); }); if (a.pts.length === 1) { var v0 = vp.toView(a.pts[0][0], a.pts[0][1]); ctx.lineTo(v0[0] + 0.01, v0[1]); } ctx.stroke(); break;
			case "rect": ctx.globalAlpha = a.alpha || 1; poly(ctx, vp, corners(a)); if (a.fill) { ctx.fillStyle = a.fill; ctx.fill(); } if (a.stroke && a.sw > 0) { ctx.strokeStyle = a.stroke; ctx.lineWidth = vp.len(a.sw); ctx.lineJoin = "miter"; ctx.stroke(); } break;
			case "ellipse": ctx.globalAlpha = a.alpha || 1; { var c = vp.toView(a.x + a.w / 2, a.y + a.h / 2), q = vp.rot % 180 === 90; ctx.translate(c[0], c[1]); ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.5, (q ? a.h : a.w) / 2 * s), Math.max(0.5, (q ? a.w : a.h) / 2 * s), 0, 0, Math.PI * 2); } ctx.setTransform ? 0 : 0; if (a.fill) { ctx.fillStyle = a.fill; ctx.fill(); } if (a.stroke && a.sw > 0) { ctx.strokeStyle = a.stroke; ctx.lineWidth = vp.len(a.sw); ctx.stroke(); } break;
			case "line": case "arrow": {
				ctx.strokeStyle = a.color; ctx.lineWidth = vp.len(a.sw); var p1 = vp.toView(a.x1, a.y1), p2 = vp.toView(a.x2, a.y2); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
				if (a.t === "arrow") { var ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = Math.max(8, a.sw * 4); [Math.PI - 0.45, Math.PI + 0.45].forEach(function (d) { var q2 = vp.toView(a.x2 + Math.cos(ang + d) * L, a.y2 + Math.sin(ang + d) * L); ctx.beginPath(); ctx.moveTo(p2[0], p2[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke(); }); }
				break; }
			case "text": paintText(ctx, vp, a, state); break;
			case "img": { var im = PD.image(a.img); var o = vp.toView(a.x, a.y + a.h); ctx.translate(o[0], o[1]); ctx.rotate(vp.rot * Math.PI / 180); if (im) ctx.drawImage(im, 0, 0, a.w * s, a.h * s); else { ctx.fillStyle = "#ddd"; ctx.fillRect(0, 0, a.w * s, a.h * s); } break; }
			case "stamp": { ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = Math.max(1, a.w * s * 0.13); var P = function (u, v) { return vp.toView(a.x + u * a.w, a.y + (1 - v) * a.h); };
				if (a.kind === "check") { var pts = [[0.1, 0.55], [0.38, 0.85], [0.92, 0.15]].map(function (p) { return P(p[0], p[1]); }); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke(); }
				else if (a.kind === "cross") { var A = P(0.15, 0.15), B = P(0.85, 0.85), C = P(0.85, 0.15), D = P(0.15, 0.85); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.moveTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.stroke(); }
				else { var Cc = P(0.5, 0.5); ctx.beginPath(); ctx.arc(Cc[0], Cc[1], a.w * s * 0.36, 0, Math.PI * 2); ctx.fill(); } break; }
			case "note": { var n0 = vp.toView(a.x, a.y), r = vp.len(9); ctx.fillStyle = a.color || "#ffd54f"; ctx.strokeStyle = "#8a6d00"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(n0[0] + r, n0[1] - r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#5d4a00"; ctx.fillRect(n0[0] + r * 0.5, n0[1] - r * 1.3, r, r * 0.16); ctx.fillRect(n0[0] + r * 0.5, n0[1] - r * 0.95, r, r * 0.16); ctx.fillRect(n0[0] + r * 0.5, n0[1] - r * 0.6, r * 0.65, r * 0.16); break; }
		}
		ctx.restore();
	};
	function paintText(ctx, vp, a, state) {
		var s = vp.scale, origin = vp.toView(a.x, a.y + a.h);
		if (a.bg) { ctx.save(); poly(ctx, vp, corners(a)); ctx.fillStyle = a.bg; ctx.fill(); ctx.restore(); }
		if (!(a.lines && a.lines.length)) return;
		if (a.raster) { var cv = PD.rasterText(a, Math.max(2, s * 2)); ctx.translate(origin[0], origin[1]); ctx.rotate(vp.rot * Math.PI / 180); ctx.drawImage(cv, 0, 0, a.w * s, a.h * s); return; }
		ctx.translate(origin[0], origin[1]); ctx.rotate(vp.rot * Math.PI / 180); ctx.fillStyle = a.color; ctx.font = PD.cssFont(a, a.size * s); ctx.textBaseline = "alphabetic";
		a.lines.forEach(function (line, i) { var w = PD.measure(a, line), dx = a.align === "center" ? (a.w - w) / 2 : a.align === "right" ? a.w - M.PAD - w : M.PAD; ctx.fillText(line, dx * s, (M.PAD + M.ASCENT * a.size + i * a.size * M.LINE_H) * s); });
	}
	// text with characters the standard PDF fonts cannot show (Cyrillic, Greek, CJK...) is drawn to a picture, in the editor and in the file alike
	PD.rasterText = function (a, k) {
		var cv = document.createElement("canvas"); cv.width = Math.ceil(a.w * k); cv.height = Math.ceil(a.h * k); var c = cv.getContext("2d"); c.fillStyle = a.color; c.font = PD.cssFont(a, a.size * k).replace(CSSF[a.font || "sans"], CSSF[a.font || "sans"] + ', "Noto Sans", "Segoe UI", sans-serif'); c.textBaseline = "alphabetic";
		a.lines.forEach(function (line, i) { var w = c.measureText(line).width / k, dx = a.align === "center" ? (a.w - w) / 2 : a.align === "right" ? a.w - M.PAD - w : M.PAD; c.fillText(line, dx * k, (M.PAD + M.ASCENT * a.size + i * a.size * M.LINE_H) * k); }); return cv;
	};
	PD.paintAll = function (ctx, vp, annots, state) { annots.forEach(function (a) { PD.paintAnnot(ctx, vp, a, state); }); };

	/* ---------- the pages on screen ---------- */
	var pagesEl, io, renderTasks = {};
	PD.pageEl = function (p) { return pagesEl.querySelector('.pd-page[data-id="' + p.id + '"]'); };
	PD.fitWidth = function () { var v = $("pd-view"), p = PD.doc && PD.doc.pages[Math.max(0, PD.cur)]; if (!p) return; var q = (p.rot0 + p.rot) % 180 === 90, w = q ? p.H : p.W; return Math.max(0.2, Math.min(4, (v.clientWidth - 40) / w)); };
	PD.setZoom = function (z, keepCenter) {
		z = Math.max(0.2, Math.min(5, z)); if (Math.abs(z - PD.zoom) < 0.001) return; var v = $("pd-view"), ratio = z / PD.zoom, cy = v.scrollTop + v.clientHeight / 2, cx = v.scrollLeft + v.clientWidth / 2; PD.zoom = z; PD.layout(false, true);
		v.scrollTop = cy * ratio - v.clientHeight / 2; v.scrollLeft = cx * ratio - v.clientWidth / 2; $("pd-zoom").textContent = Math.round(z * 100) + "%";
	};
	PD.layout = function (fresh, zoomOnly) {
		pagesEl = $("pd-pages"); var d = PD.doc; $("pd-empty").hidden = !!d; if (!d) { pagesEl.innerHTML = ""; return; }
		if (fresh) { PD.zoom = 1; var z = PD.fitWidth(); PD.zoom = z || 1; $("pd-zoom").textContent = Math.round(PD.zoom * 100) + "%"; }
		if (io) io.disconnect(); io = new IntersectionObserver(function (es) { es.forEach(function (e) { var p = PD.page(e.target.dataset.id); if (p) { if (e.isIntersecting) { p._vis = true; renderPage(p); } else { p._vis = false; } } }); if (!zoomOnly) {} }, { root: $("pd-view"), rootMargin: "700px 0px" });
		var existing = {}; [].forEach.call(pagesEl.children, function (el) { existing[el.dataset.id] = el; }); var frag = document.createDocumentFragment();
		d.pages.forEach(function (p, i) {
			var vp = PD.vp(p), el = existing[p.id]; delete existing[p.id];
			if (!el) { el = document.createElement("div"); el.className = "pd-page"; el.dataset.id = p.id; el.innerHTML = '<canvas class="pd-c"></canvas><canvas class="pd-o" tabindex="-1"></canvas><span class="pd-pagenum"></span>'; }
			el.style.width = Math.round(vp.width) + "px"; el.style.height = Math.round(vp.height) + "px"; el.querySelector(".pd-pagenum").textContent = i + 1; el.classList.toggle("is-cur", i === PD.cur);
			if (p._rkey !== zkey(p)) p._rendered = false; frag.appendChild(el); io.observe(el);
		});
		pagesEl.innerHTML = ""; pagesEl.appendChild(frag); d.pages.forEach(function (p) { if (!p._rendered) { sizeCanvas(p); } paintOverlay(p); });
		PD.emit("layout");
	};
	function zkey(p) { return PD.zoom.toFixed(3) + "|" + (p.rot0 + p.rot) + "|" + dpr(); }
	function sizeCanvas(p) { var el = PD.pageEl(p); if (!el) return; var vp = PD.vp(p), k = dpr(); [".pd-c", ".pd-o"].forEach(function (s) { var c = el.querySelector(s); c.style.width = Math.round(vp.width) + "px"; c.style.height = Math.round(vp.height) + "px"; if (s === ".pd-o") { c.width = Math.round(vp.width * k); c.height = Math.round(vp.height * k); } }); }
	async function renderPage(p) {
		var el = PD.pageEl(p); if (!el) return; var key = zkey(p); if (p._rendered && p._rkey === key) return; var cv = el.querySelector(".pd-c"), k = dpr(), vp = PD.vp(p);
		if (renderTasks[p.id]) { try { renderTasks[p.id].cancel(); } catch (e) {} }
		var w = Math.round(vp.width * k), h = Math.round(vp.height * k), off = document.createElement("canvas"); off.width = w; off.height = h; var ctx = off.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
		if (!p.blank) {
			try { var pv = p.proxy.getViewport({ scale: PD.zoom * k, rotation: (p.rot0 + p.rot) % 360 }), task = p.proxy.render({ canvasContext: ctx, viewport: pv }); renderTasks[p.id] = task; await task.promise; }
			catch (e) { if (e && e.name === "RenderingCancelledException") return; console.error(e); }
		}
		if (!PD.doc || PD.pageEl(p) !== el) return; cv.width = w; cv.height = h; cv.style.width = Math.round(vp.width) + "px"; cv.style.height = Math.round(vp.height) + "px"; cv.getContext("2d").drawImage(off, 0, 0); p._rendered = true; p._rkey = key; paintOverlay(p); PD.emit("rendered", p);
	}
	PD.renderPage = renderPage;
	// the page's own colour near a point, for the whiteout under edited text
	PD.sampleColor = function (p, x, y, w, h) {
		var el = PD.pageEl(p); if (!el || !p._rendered) return "#ffffff"; var cv = el.querySelector(".pd-c"), vp = PD.vp(p), k = cv.width / vp.width, a = vp.toView(x, y), b = vp.toView(x + w, y + h), ctx = cv.getContext("2d"), pts = [[Math.min(a[0], b[0]) - 3, Math.min(a[1], b[1]) - 3], [Math.max(a[0], b[0]) + 3, Math.min(a[1], b[1]) - 3], [Math.min(a[0], b[0]) - 3, Math.max(a[1], b[1]) + 3], [Math.max(a[0], b[0]) + 3, Math.max(a[1], b[1]) + 3]], r = 0, g = 0, bl = 0, n = 0;
		pts.forEach(function (q) { try { var d = ctx.getImageData(Math.max(0, Math.round(q[0] * k)), Math.max(0, Math.round(q[1] * k)), 1, 1).data; r += d[0]; g += d[1]; bl += d[2]; n++; } catch (e) {} }); return n ? M.rgbToHex(r / n, g / n, bl / n) : "#ffffff";
	};
	PD.selAnnot = function () { if (!PD.sel || !PD.doc) return null; var p = PD.page(PD.sel.page); if (!p) return null; for (var i = 0; i < p.annots.length; i++) if (p.annots[i].id === PD.sel.id) return p.annots[i]; return null; };
	// corner handles of the selected annotation in view pixels: { name: [px, py] }
	PD.handles = function (p, a, vp) {
		if (!a) return null; if (a.t === "line" || a.t === "arrow") return { p1: vp.toView(a.x1, a.y1), p2: vp.toView(a.x2, a.y2) };
		if (a.t === "pen" || a.t === "note" || a.t === "stamp" && false) return null; if (a.t === "note") return null;
		return { sw: vp.toView(a.x, a.y), se: vp.toView(a.x + a.w, a.y), ne: vp.toView(a.x + a.w, a.y + a.h), nw: vp.toView(a.x, a.y + a.h) };
	};
	function paintOverlay(p) {
		var el = PD.pageEl(p); if (!el) return; var cv = el.querySelector(".pd-o"), k = cv.width / (parseFloat(cv.style.width) || 1) || dpr(), ctx = cv.getContext("2d"), vp = PD.vp(p);
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(k, 0, 0, k, 0, 0);
		PD.paintAll(ctx, vp, p.annots); if (p._live) PD.paintAnnot(ctx, vp, p._live);
		var a = PD.sel && PD.sel.page === p.id ? PD.selAnnot() : null;
		if (a && !p._hideSel) {
			ctx.save(); ctx.strokeStyle = "#2f80ff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
			var b = M.bbox(a), pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(function (q) { return vp.toView(q[0], q[1]); }); ctx.beginPath(); pts.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
			var hs = PD.handles(p, a, vp); if (hs) Object.keys(hs).forEach(function (n) { ctx.beginPath(); ctx.rect(hs[n][0] - 5, hs[n][1] - 5, 10, 10); ctx.fill(); ctx.stroke(); }); ctx.restore();
			if (a.t === "note" && a.text) { var o = vp.toView(a.x + 20, a.y); ctx.save(); ctx.font = "12px sans-serif"; var tw = Math.min(220, ctx.measureText(a.text).width + 14); ctx.fillStyle = "#fff8d6"; ctx.strokeStyle = "#8a6d00"; ctx.fillRect(o[0], o[1] - 40, tw, 26); ctx.strokeRect(o[0], o[1] - 40, tw, 26); ctx.fillStyle = "#333"; ctx.fillText(a.text.slice(0, 40) + (a.text.length > 40 ? "..." : ""), o[0] + 7, o[1] - 23); ctx.restore(); }
		}
	}
	PD.paintOverlay = paintOverlay; PD.repaint = function (p) { if (p) paintOverlay(p); else if (PD.doc) PD.doc.pages.forEach(paintOverlay); };
	PD.on("imgload", function () { PD.repaint(); });
	PD.zoomTo = function (z) { PD.setZoom(z); };
	/* the current page = the one at the middle of the view */
	PD.trackCurrent = function () {
		if (!PD.doc) return; var v = $("pd-view"), mid = v.getBoundingClientRect().top + v.clientHeight / 2, best = PD.cur, bd = 1e9;
		[].forEach.call(pagesEl.children, function (el, i) { var r = el.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid); if (r.top <= mid && r.bottom >= mid) { bd = -1; best = i; } else if (bd >= 0 && d < bd) { bd = d; best = i; } });
		if (best !== PD.cur) { PD.cur = best; [].forEach.call(pagesEl.children, function (el, i) { el.classList.toggle("is-cur", i === best); }); PD.emit("cur"); }
	};
	PD.goPage = function (i) { var el = pagesEl && pagesEl.children[i]; if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); PD.cur = i; PD.emit("cur"); } };

	/* ---------- annotation helpers ---------- */
	PD.addAnnot = function (p, a, noSelect) { a.id = a.id || M.newId("a"); p.annots.push(a); if (!noSelect) PD.sel = { page: p.id, id: a.id }; PD.repaint(p); return a; };
	PD.removeSel = function () { var a = PD.selAnnot(); if (!a) return; var p = PD.page(PD.sel.page); p.annots = p.annots.filter(function (x) { return x.id !== a.id; }); PD.sel = null; PD.repaint(p); PD.commit(); PD.emit("sel"); };
	PD.select = function (p, a) { var old = PD.sel && PD.page(PD.sel.page); PD.sel = a ? { page: p.id, id: a.id } : null; if (old) PD.repaint(old); if (p) PD.repaint(p); PD.emit("sel"); };

	/* ---------- dialogs ---------- */
	PD.dialog = function (html, onClose) { var m = $("pd-modal"), d = $("pd-dlg"); d.innerHTML = html; m.hidden = false; PD._onClose = onClose || null; };
	PD.closeDialog = function () { var m = $("pd-modal"); m.hidden = true; $("pd-dlg").innerHTML = ""; if (PD._onClose) { var f = PD._onClose; PD._onClose = null; f(); } };
	$("pd-modal").addEventListener("mousedown", function (e) { if (e.target === this && !PD.noBackdropClose) PD.closeDialog(); });
	window.addEventListener("beforeunload", function (e) { if (PD.dirty) { e.preventDefault(); e.returnValue = ""; } });
})();

/* MES PDF Editor: tools, option bar, pointer handling, text editing, page list. Uses PD (core.js). */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$, P = PD.S.prefs;
	var def = { text: { font: "sans", size: 14, bold: false, italic: false, color: "#111111", align: "left", bg: "" }, draw: { color: "#1a56db", width: 2 }, hl: { color: "#ffeb3b", mode: "box" }, shape: { kind: "rect", stroke: "#e53935", sw: 2, fill: "" }, cover: { mode: "paper" }, stamp: { kind: "check", color: "#1b8a3a", size: 24, fmt: "us" }, note: { color: "#ffd54f" } };
	Object.keys(def).forEach(function (k) { P[k] = Object.assign({}, def[k], P[k] || {}); });
	var COLORS = ["#111111", "#e53935", "#1a56db", "#1b8a3a", "#f59e0b", "#8e24aa"], HL = ["#ffeb3b", "#76ff03", "#ff80ab", "#40c4ff", "#ffab40"];
	var TOOLS = [
		{ id: "select", name: "Select", icon: "↖", key: "v", hint: "Click an item to select it. Drag to move, drag a corner to resize, press Delete to remove." },
		{ id: "text", name: "Text", icon: "T", key: "t", hint: "Click the page where the text should start, then type." },
		{ id: "edittext", name: "Edit text", icon: "✎", key: "e", hint: "Click a line of existing text to change it." },
		{ id: "draw", name: "Draw", icon: "✏", key: "p", hint: "Draw freehand with a mouse, finger or pen." },
		{ id: "highlight", name: "Highlight", icon: "▨", key: "h", hint: "Drag over the text to highlight." },
		{ id: "shapes", name: "Shapes", icon: "▭", key: "s", hint: "Drag to draw. Hold Shift for a square, circle or straight angle." },
		{ id: "cover", name: "Cover", icon: "▮", key: "w", hint: "Drag a box over what you want to hide. Use Black to redact." },
		{ id: "sign", name: "Sign", icon: "✍", key: "g", hint: "Pick a signature, then click where it goes." },
		{ id: "stamp", name: "Stamps", icon: "✔", key: "k", hint: "Click to place a check mark, cross, dot or today's date." },
		{ id: "note", name: "Comment", icon: "≡", key: "n", hint: "Click to add a comment note." },
		{ id: "image", name: "Image", icon: "▣", key: "i", hint: "Choose a picture, then click where it goes." }
	];
	var byId = {}; TOOLS.forEach(function (t) { byId[t.id] = t; }); PD.TOOLS = TOOLS;
	function savePrefs() { PD.saveS(); }

	/* ---------- the tool column ---------- */
	function buildTools() {
		$("pd-tools").innerHTML = TOOLS.map(function (t) { return '<button type="button" class="pd-tool" data-t="' + t.id + '" aria-pressed="false" title="' + t.name + " (" + t.key.toUpperCase() + ")" + '"><span class="pd-ti">' + t.icon + "</span><span>" + t.name + "</span></button>"; }).join("");
		$("pd-tools").addEventListener("click", function (e) { var b = e.target.closest(".pd-tool"); if (b) PD.setTool(b.dataset.t); });
	}
	PD.setTool = function (id) {
		if (!byId[id]) return; endEdit(); PD.tool = id; PD.armed = null; [].forEach.call($("pd-tools").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === id)); });
		if (id !== "select" && PD.sel) { var p = PD.page(PD.sel.page); PD.sel = null; if (p) PD.repaint(p); }
		PD.hint(byId[id].hint); $("pd-view").style.cursor = id === "select" ? "default" : id === "text" || id === "edittext" ? "text" : "crosshair"; buildOpts();
	};

	/* ---------- option bar: bound either to the tool's preferences or to the selected annotation ---------- */
	function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
	function swatches(label, colors, get, set, any) {
		var w = el('<label>' + label + ' <span class="pd-sw"></span></label>'), box = w.querySelector(".pd-sw");
		function draw() { box.innerHTML = ""; colors.forEach(function (c) { var b = el('<button type="button" aria-label="' + c + '" aria-pressed="' + (get() === c) + '" style="background:' + c + '"></button>'); b.onclick = function () { set(c, true); draw(); }; box.appendChild(b); });
			if (any) { var inp = el('<input type="color" value="' + (/^#[0-9a-f]{6}$/i.test(get()) ? get() : "#000000") + '" aria-label="Any colour">'); inp.addEventListener("input", function () { set(inp.value, false); }); inp.addEventListener("change", function () { set(inp.value, true); draw(); }); box.appendChild(inp); } }
		draw(); return w;
	}
	function range(label, min, max, step, get, set, unit) {
		var w = el('<label>' + label + ' <input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + get() + '"><span class="pd-dim">' + get() + (unit || "") + "</span></label>"), inp = w.querySelector("input"), out = w.querySelector("span");
		inp.addEventListener("input", function () { out.textContent = inp.value + (unit || ""); set(+inp.value, false); }); inp.addEventListener("change", function () { set(+inp.value, true); }); return w;
	}
	function select(label, opts, get, set) {
		var w = el("<label>" + label + " <select>" + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(get()) === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>"); w.querySelector("select").addEventListener("change", function () { set(this.value, true); }); return w;
	}
	function seg(label, opts, get, set) {
		var w = el((label ? "<label>" + label + " " : "<span>") + '<span class="pd-seg"></span>' + (label ? "</label>" : "</span>")), box = w.querySelector(".pd-seg");
		function draw() { box.innerHTML = ""; opts.forEach(function (o) { var b = el('<button type="button" aria-pressed="' + (String(get()) === String(o[0])) + '" title="' + (o[2] || "") + '">' + o[1] + "</button>"); b.onclick = function () { set(o[0], true); draw(); }; box.appendChild(b); }); } draw(); return w;
	}
	function toggle(label, get, set) { var w = el('<button type="button" class="pd-ib pd-ib--txt" aria-pressed="' + !!get() + '">' + label + "</button>"); w.onclick = function () { var v = !(w.getAttribute("aria-pressed") === "true"); w.setAttribute("aria-pressed", String(v)); set(v, true); }; return w; }
	function button(label, fn, primary) { var b = el('<button type="button" class="pd-btn' + (primary ? " pd-btn--primary" : "") + '">' + label + "</button>"); b.onclick = fn; return b; }
	// writes a value either to the selected annotation (live repaint + commit on change) or to the tool's prefs
	function binder(target, key, annot, afterSet) {
		return function (v, fin) { target[key] = v; if (annot) { var p = PD.page(PD.sel.page); if (annot.t === "text") PD.layoutText(annot); if (afterSet) afterSet(annot); PD.repaint(p); if (fin) PD.commit(); } else savePrefs(); };
	}
	function textControls(t, annot) {
		var b = function (k) { return binder(t, k, annot); }, out = [];
		out.push(select("Font", [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]], function () { return t.font; }, b("font")));
		out.push(el('<label>Size <input type="number" min="4" max="200" step="1" value="' + t.size + '" style="width:4.2em"></label>')); out[out.length - 1].querySelector("input").addEventListener("input", function () { var v = Math.max(4, Math.min(200, +this.value || 12)); b("size")(v, false); }); out[out.length - 1].querySelector("input").addEventListener("change", function () { b("size")(Math.max(4, Math.min(200, +this.value || 12)), true); });
		out.push(toggle("<b>B</b>", function () { return t.bold; }, b("bold"))); out.push(toggle("<i>I</i>", function () { return t.italic; }, b("italic")));
		out.push(seg("", [["left", "≡L"], ["center", "≡C"], ["right", "≡R"]], function () { return t.align; }, b("align")));
		out.push(swatches("Colour", COLORS, function () { return t.color; }, b("color"), true));
		out.push(select("Background", [["", "None"], ["#ffffff", "White"], ["#fff59d", "Yellow"]], function () { return t.bg || ""; }, function (v, f) { b("bg")(v || null, f); }));
		return out;
	}
	function buildOpts() {
		var o = $("pd-opts"); o.innerHTML = ""; var add = function (x) { if (Array.isArray(x)) x.forEach(add); else if (x) o.appendChild(x); };
		var a = PD.tool === "select" ? PD.selAnnot() : null, t = PD.tool;
		if (a) {
			add(el('<span class="pd-note">Selected: ' + ({ text: "text", pen: "drawing", rect: "box", ellipse: "ellipse", line: "line", arrow: "arrow", img: "picture", stamp: "stamp", note: "comment" }[a.t] || a.t) + "</span>"));
			if (a.t === "text") add(textControls(a, a));
			else if (a.t === "pen") { add(swatches("Colour", a.alpha ? HL : COLORS, function () { return a.color; }, binder(a, "color", a), !a.alpha)); add(range("Width", 1, a.alpha ? 40 : 14, 1, function () { return a.width; }, binder(a, "width", a), " pt")); }
			else if (a.t === "rect" || a.t === "ellipse") { add(swatches("Line", COLORS, function () { return a.stroke || "#e53935"; }, binder(a, "stroke", a), true)); add(range("Width", 0, 12, 1, function () { return a.sw || 0; }, binder(a, "sw", a), " pt")); add(swatches("Fill", ["#ffffff", "#000000", "#ffeb3b"], function () { return a.fill || ""; }, binder(a, "fill", a), true)); add(button("No fill", function () { binder(a, "fill", a)(null, true); buildOpts(); })); }
			else if (a.t === "line" || a.t === "arrow") { add(swatches("Colour", COLORS, function () { return a.color; }, binder(a, "color", a), true)); add(range("Width", 1, 12, 1, function () { return a.sw; }, binder(a, "sw", a), " pt")); }
			else if (a.t === "stamp") { add(swatches("Colour", COLORS, function () { return a.color; }, binder(a, "color", a), true)); }
			else if (a.t === "note") { add(button("Edit comment", function () { editNote(PD.page(PD.sel.page), a); })); }
			add(button("Duplicate", function () { duplicateSel(); })); add(button("To front", function () { var p = PD.page(PD.sel.page); p.annots = p.annots.filter(function (x) { return x !== a; }).concat([a]); PD.repaint(p); PD.commit(); })); add(button("Delete", function () { PD.removeSel(); })); return;
		}
		if (t === "select") { add(el('<span class="pd-note">Click an item to select it. Its options appear here.</span>')); return; }
		if (t === "text") add(textControls(P.text, null));
		else if (t === "edittext") add(el('<span class="pd-note">Click a line of text. The old text is covered with a patch in the paper colour and an editable box takes its place.</span>'));
		else if (t === "draw") { add(swatches("Colour", COLORS, function () { return P.draw.color; }, binder(P.draw, "color"), true)); add(range("Width", 1, 14, 1, function () { return P.draw.width; }, binder(P.draw, "width"), " pt")); }
		else if (t === "highlight") { add(seg("", [["box", "Box"], ["free", "Freehand"]], function () { return P.hl.mode; }, binder(P.hl, "mode"))); add(swatches("Colour", HL, function () { return P.hl.color; }, binder(P.hl, "color"), true)); }
		else if (t === "shapes") { add(seg("", [["rect", "Rectangle"], ["ellipse", "Ellipse"], ["line", "Line"], ["arrow", "Arrow"]], function () { return P.shape.kind; }, binder(P.shape, "kind"))); add(swatches("Line", COLORS, function () { return P.shape.stroke; }, binder(P.shape, "stroke"), true)); add(range("Width", 1, 12, 1, function () { return P.shape.sw; }, binder(P.shape, "sw"), " pt")); add(select("Fill", [["", "None"], ["#ffffff", "White"], ["#ffeb3b", "Yellow"], ["#000000", "Black"]], function () { return P.shape.fill || ""; }, function (v, f) { binder(P.shape, "fill")(v || "", f); })); }
		else if (t === "cover") { add(seg("", [["paper", "Match paper"], ["white", "White"], ["black", "Black (redact)"]], function () { return P.cover.mode; }, binder(P.cover, "mode"))); add(el('<span class="pd-note">A cover hides what is under it on screen. To remove the hidden text for good, turn on <b>Flatten pages</b> when you download.</span>')); }
		else if (t === "sign") { PD.signOptions(o, add, button); }
		else if (t === "stamp") { add(seg("", [["check", "✔ Check"], ["cross", "✘ Cross"], ["dot", "● Dot"], ["date", "Date"]], function () { return P.stamp.kind; }, binder(P.stamp, "kind"))); add(swatches("Colour", COLORS, function () { return P.stamp.color; }, binder(P.stamp, "color"), true)); add(range("Size", 10, 80, 2, function () { return P.stamp.size; }, binder(P.stamp, "size"), " pt")); add(select("Date format", [["us", "03/27/2026"], ["eu", "27/03/2026"], ["iso", "2026-03-27"], ["long", "March 27, 2026"]], function () { return P.stamp.fmt; }, binder(P.stamp, "fmt"))); }
		else if (t === "note") { add(swatches("Colour", ["#ffd54f", "#a5d6a7", "#90caf9", "#f48fb1"], function () { return P.note.color; }, binder(P.note, "color"), false)); add(el('<span class="pd-note">Comments are saved as real PDF comment notes, readable in other PDF viewers.</span>')); }
		else if (t === "image") { add(button("Choose a picture...", function () { $("pd-imgfile").click(); }, true)); add(PD.armed && PD.armed.kind === "img" ? el('<span class="pd-note">Now click where it should go.</span>') : null); }
	}
	PD.buildOpts = buildOpts; PD.on("sel", buildOpts);

	/* ---------- pointer interaction ---------- */
	var drag = null;
	function ctxOf(e) {
		var pe = e.target.closest && e.target.closest(".pd-page"); if (!pe) return null; var p = PD.page(pe.dataset.id); if (!p) return null; var vp = PD.vp(p), r = pe.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, pt = vp.toPdf(px, py);
		return { p: p, vp: vp, px: px, py: py, x: pt[0], y: pt[1], e: e, tol: 5 / PD.zoom, pe: pe };
	}
	function toPdfFrom(c, e) { var r = c.pe.getBoundingClientRect(), pt = c.vp.toPdf(e.clientX - r.left, e.clientY - r.top); return pt; }
	function setCur(p) { var i = PD.doc.pages.indexOf(p); if (i >= 0 && i !== PD.cur) { PD.cur = i; [].forEach.call($("pd-pages").children, function (x, k) { x.classList.toggle("is-cur", k === i); }); PD.emit("cur"); } }
	function onDown(e) {
		if (!PD.doc || e.button > 0 || (e.pointerType === "mouse" && e.button !== 0)) return; var c = ctxOf(e); if (!c) { if (PD.tool === "select" && PD.sel && (e.target.id === "pd-view" || e.target.id === "pd-pages")) PD.select(null, null); return; }
		if (!$("pd-textedit").hidden) { if (e.target === $("pd-textedit")) return; endEdit(); }
		setCur(c.p); var tl = PD.tool;
		if (tl === "select") return selectDown(c);
		if (tl === "text") return textDown(c); if (tl === "edittext") return editTextDown(c); if (tl === "note") return noteDown(c); if (tl === "stamp") return stampDown(c); if (tl === "image") return imageDown(c); if (tl === "sign") return signDown(c);
		if (tl === "draw" || (tl === "highlight" && P.hl.mode === "free")) { var hl = tl === "highlight"; drag = { kind: "pen", c: c, live: { t: "pen", pts: [[c.x, c.y]], color: hl ? P.hl.color : P.draw.color, width: hl ? 14 : P.draw.width, alpha: hl ? 0.38 : undefined } }; c.p._live = drag.live; PD.repaint(c.p); }
		else if (tl === "highlight" || tl === "cover" || tl === "shapes") { drag = { kind: "shape", c: c, x0: c.x, y0: c.y, live: null }; }
		else return;
		try { c.pe.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault();
	}
	function shapeFrom(d, x, y, shift) {
		var tl = PD.tool, x0 = d.x0, y0 = d.y0;
		if (tl === "shapes" && (P.shape.kind === "line" || P.shape.kind === "arrow")) { if (shift) { var ang = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x - x0, y - y0); x = x0 + Math.cos(ang) * L; y = y0 + Math.sin(ang) * L; } return { t: P.shape.kind, x1: x0, y1: y0, x2: x, y2: y, color: P.shape.stroke, sw: P.shape.sw }; }
		if (shift && tl === "shapes") { var s = Math.max(Math.abs(x - x0), Math.abs(y - y0)); x = x0 + (x >= x0 ? s : -s); y = y0 + (y >= y0 ? s : -s); }
		var a = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) };
		if (tl === "highlight") return Object.assign({ t: "rect", fill: P.hl.color, stroke: null, sw: 0, alpha: 0.38 }, a);
		if (tl === "cover") return Object.assign({ t: "rect", fill: P.cover.mode === "black" ? "#000000" : P.cover.mode === "white" ? "#ffffff" : (d.paper || "#ffffff"), stroke: null, sw: 0 }, a);
		return Object.assign({ t: P.shape.kind, stroke: P.shape.stroke, sw: P.shape.sw, fill: P.shape.fill || null }, a);
	}
	function onMove(e) {
		if (!drag) return; var c = drag.c, pt = toPdfFrom(c, e);
		if (drag.kind === "pen") { var l = drag.live, last = l.pts[l.pts.length - 1]; if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.6 / PD.zoom) { l.pts.push(pt); PD.repaint(c.p); } }
		else if (drag.kind === "shape") { if (drag.paper == null && PD.tool === "cover") drag.paper = PD.sampleColor(c.p, Math.min(drag.x0, pt[0]), Math.min(drag.y0, pt[1]), Math.abs(pt[0] - drag.x0), Math.abs(pt[1] - drag.y0)); drag.live = shapeFrom(drag, pt[0], pt[1], e.shiftKey); if (drag.paper) drag.live.fill = P.cover.mode === "paper" && PD.tool === "cover" ? PD.sampleColor(c.p, drag.live.x, drag.live.y, drag.live.w, drag.live.h) : drag.live.fill; c.p._live = drag.live; PD.repaint(c.p); }
		else if (drag.kind === "move") { var dx = pt[0] - drag.last[0], dy = pt[1] - drag.last[1]; if (!drag.moved && Math.hypot(dx, dy) < 1.5 / PD.zoom) return; drag.moved = true; drag.last = pt; M.move(drag.a, dx, dy); PD.repaint(c.p); }
		else if (drag.kind === "resize") { resizeTo(drag, pt, e.shiftKey); PD.repaint(c.p); drag.moved = true; }
		e.preventDefault();
	}
	function onUp(e) {
		if (!drag) return; var d = drag; drag = null; var c = d.c, p = c.p;
		if (d.kind === "pen") { p._live = null; var pts = M.smooth(M.simplify(d.live.pts, 0.25), 1); if (d.live.pts.length > 1 || true) { d.live.pts = d.live.pts.length < 3 ? d.live.pts : pts; PD.addAnnot(p, d.live, true); PD.commit(); } }
		else if (d.kind === "shape") { p._live = null; var a = d.live; if (a && ((a.w != null && a.w > 3 && a.h > 3) || (a.x2 != null && Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 4))) { PD.addAnnot(p, a, PD.tool !== "shapes"); if (PD.tool === "shapes") { PD.setTool("select"); PD.select(p, a); } PD.commit(); } else PD.repaint(p); }
		else if (d.moved) { PD.commit(); PD.repaint(p); buildOpts(); }
	}
	document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", function () { if (drag) { var p = drag.c.p; p._live = null; drag = null; PD.repaint(p); } });
	function bindPointer() { $("pd-view").addEventListener("pointerdown", onDown); $("pd-view").addEventListener("dblclick", function (e) { if (PD.tool !== "select") return; var c = ctxOf(e); if (!c) return; var a = M.pick(c.p.annots, c.x, c.y, c.tol); if (a && a.t === "text") { PD.select(c.p, a); editText(c.p, a); } else if (a && a.t === "note") { PD.select(c.p, a); editNote(c.p, a); } }); }

	/* ----- select / move / resize ----- */
	function selectDown(c) {
		var sel = PD.sel && PD.sel.page === c.p.id ? PD.selAnnot() : null;
		if (sel) { var hs = PD.handles(c.p, sel, c.vp); if (hs) { var hit = null; Object.keys(hs).forEach(function (n) { if (Math.hypot(hs[n][0] - c.px, hs[n][1] - c.py) <= 11) hit = n; }); if (hit) { drag = { kind: "resize", c: c, a: sel, corner: hit, top: sel.y + (sel.h || 0) }; c.pe.setPointerCapture(c.e.pointerId); c.e.preventDefault(); return; } } }
		var a = M.pick(c.p.annots, c.x, c.y, c.tol);
		if (a) { PD.select(c.p, a); drag = { kind: "move", c: c, a: a, last: [c.x, c.y], moved: false }; c.pe.setPointerCapture(c.e.pointerId); c.e.preventDefault(); }
		else PD.select(null, null);
	}
	function resizeTo(d, pt, shift) {
		var a = d.a;
		if (a.t === "line" || a.t === "arrow") { if (d.corner === "p1") { a.x1 = pt[0]; a.y1 = pt[1]; } else { a.x2 = pt[0]; a.y2 = pt[1]; } return; }
		if (a.t === "text") { var top = d.top, tmp = { x: a.x, y: a.y, w: a.w, h: a.h }; M.resizeBox(tmp, d.corner, pt[0], pt[1], false); a.x = tmp.x; a.w = Math.max(30, tmp.w); a.y = top - a.h; PD.layoutText(a); return; }
		M.resizeBox(a, d.corner, pt[0], pt[1], a.t === "img" || a.t === "stamp" || !!shift);
	}

	/* ----- text ----- */
	PD.makeText = function (p, x, top, props, text) {
		var a = Object.assign({ t: "text", x: x, w: 220, text: text || "", size: 14, font: "sans", bold: false, italic: false, color: "#111111", align: "left", bg: null }, props); a.h = M.textHeight(1, a.size); a.y = top - a.h; var vb = p.W; if (a.x + a.w > p.x0 + p.W) a.x = Math.max(p.x0 + 4, p.x0 + p.W - a.w - 4); PD.layoutText(a); return a;
	};
	function textDown(c) { var t = P.text, a = PD.makeText(c.p, c.x, c.y, { size: t.size, font: t.font, bold: t.bold, italic: t.italic, color: t.color, align: t.align, bg: t.bg || null }); PD.addAnnot(c.p, a); c.e.preventDefault(); editText(c.p, a, true); }
	var editing = null, ta = null;
	function placeTa(p, a) {
		var pe = PD.pageEl(p), r = pe.getBoundingClientRect(), vp = PD.vp(p), o = vp.toView(a.x, a.y + a.h), s = PD.zoom; ta.style.left = (r.left + o[0]) + "px"; ta.style.top = (r.top + o[1]) + "px"; ta.style.width = (a.w * s) + "px"; ta.style.height = (a.h * s) + "px";
		ta.style.transformOrigin = "0 0"; ta.style.transform = "rotate(" + vp.rot + "deg)"; ta.style.font = PD.cssFont(a, a.size * s); ta.style.lineHeight = (M.LINE_H * a.size * s) + "px"; ta.style.padding = (M.PAD * s) + "px"; ta.style.color = a.color; ta.style.textAlign = a.align || "left"; ta.style.fontFamily = ta.style.fontFamily; ta.style.boxSizing = "border-box"; ta.style.background = a.bg || "rgba(255,255,255,0.96)";
	}
	function editText(p, a, isNew) {
		endEdit(); ta = $("pd-textedit"); editing = { p: p, a: a, isNew: !!isNew, before: a.text, kind: "text" }; ta.hidden = false; ta.value = a.text; p._hideSel = true; ta.className = "pd-textedit"; placeTa(p, a); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
		ta.oninput = function () { a.text = ta.value; PD.layoutText(a); placeTa(p, a); PD.repaint(p); };
		ta.onkeydown = function (e) { if (e.key === "Escape") { e.preventDefault(); endEdit(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); endEdit(); } e.stopPropagation(); };
		PD.repaint(p);
	}
	function editNote(p, a) {
		endEdit(); ta = $("pd-textedit"); editing = { p: p, a: a, isNew: !a.text, before: a.text || "", kind: "note" }; var pe = PD.pageEl(p), r = pe.getBoundingClientRect(), vp = PD.vp(p), o = vp.toView(a.x + 22, a.y); ta.hidden = false; ta.value = a.text || ""; ta.className = "pd-textedit";
		ta.style.left = Math.min(window.innerWidth - 250, r.left + o[0]) + "px"; ta.style.top = Math.max(4, r.top + o[1] - 60) + "px"; ta.style.width = "240px"; ta.style.height = "90px"; ta.style.transform = "none"; ta.style.font = "13px/1.3 sans-serif"; ta.style.padding = "6px"; ta.style.color = "#333"; ta.style.background = "#fff8d6"; ta.style.textAlign = "left";
		ta.focus(); ta.oninput = function () { a.text = ta.value; }; ta.onkeydown = function (e) { if (e.key === "Escape") { e.preventDefault(); endEdit(); } e.stopPropagation(); };
	}
	function endEdit() {
		if (!editing) { if (ta) ta.hidden = true; return; } var e = editing, p = e.p, a = e.a; editing = null; ta.hidden = true; ta.oninput = ta.onkeydown = null; p._hideSel = false;
		if (e.kind === "text") { a.text = ta.value; if (!a.text.trim()) { p.annots = p.annots.filter(function (x) { return x !== a; }); if (PD.sel && PD.sel.id === a.id) PD.sel = null; if (!e.isNew) PD.commit(); else if (e.cover) { PD.commit(); } } else { PD.layoutText(a); if (e.isNew || a.text !== e.before) PD.commit(); } }
		else { a.text = ta.value; if (!a.text.trim() && e.isNew) { p.annots = p.annots.filter(function (x) { return x !== a; }); PD.sel = null; } else if (a.text !== e.before) PD.commit(); }
		PD.repaint(p); PD.emit("sel");
	}
	PD.endEdit = endEdit; PD.isEditing = function () { return !!editing; };
	function noteDown(c) { var a = { t: "note", x: c.x, y: c.y, text: "", color: P.note.color }; PD.addAnnot(c.p, a); c.e.preventDefault(); setTimeout(function () { editNote(c.p, a); }, 0); }
	/* ----- edit existing text ----- */
	async function editTextDown(c) {
		c.e.preventDefault(); var p = c.p; if (p.blank) return PD.toast("This page has no existing text. Use the Text tool.");
		if (!p._lines) { try { PD.hint("Reading the page's text..."); var tc = await p.proxy.getTextContent(); p._lines = M.groupText(tc.items, tc.styles); } catch (e) { p._lines = []; } PD.hint(byId.edittext.hint); }
		var l = M.lineAt(p._lines, c.x, c.y); if (!l) return PD.toast(p._lines.length ? "No text there. Click on a line of text." : "No selectable text on this page (a scan?). Use Cover and Text instead.", 3500);
		var already = p.annots.filter(function (x) { return x.coverOf === l.text + "@" + Math.round(l.x) + "," + Math.round(l.y); })[0]; if (already) { var t0 = p.annots.filter(function (x) { return x.id === already.textId; })[0]; if (t0) { PD.select(p, t0); return editText(p, t0); } }
		var pad = 1.5, bx = l.x - pad, by = l.y - 0.28 * l.size, bw = l.w + pad * 2, bh = l.size * 1.28, fill = PD.sampleColor(p, bx, by, bw, bh);
		var cover = { id: M.newId("a"), t: "rect", x: bx, y: by, w: bw, h: bh, fill: fill, stroke: null, sw: 0 }, text = PD.makeText(p, l.x - M.PAD, l.y + M.ASCENT * l.size + M.PAD, { size: Math.round(l.size * 10) / 10, font: l.family, color: "#000000", w: Math.max(l.w + M.PAD * 2 + 10, p.x0 + p.W - (l.x - M.PAD) - 18) }, l.text);
		text.id = M.newId("a"); cover.coverOf = l.text + "@" + Math.round(l.x) + "," + Math.round(l.y); cover.textId = text.id; p.annots.push(cover); PD.addAnnot(p, text); editing = null; editText(p, text, true); editing.cover = true;
	}

	/* ----- stamps, images, signatures ----- */
	function dateText(fmt) { var d = new Date(), p2 = function (n) { return (n < 10 ? "0" : "") + n; }, y = d.getFullYear(), m = p2(d.getMonth() + 1), dd = p2(d.getDate()); return fmt === "eu" ? dd + "/" + m + "/" + y : fmt === "iso" ? y + "-" + m + "-" + dd : fmt === "long" ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : m + "/" + dd + "/" + y; }
	function stampDown(c) {
		var s = P.stamp; c.e.preventDefault();
		if (s.kind === "date") { var a = PD.makeText(c.p, c.x, c.y, { size: Math.max(10, Math.min(30, s.size * 0.6)), color: s.color, w: 160 }, dateText(s.fmt)); a.w = Math.max(60, PD.measure(a, a.text) + M.PAD * 2 + 4); PD.layoutText(a); PD.addAnnot(c.p, a); PD.commit(); return; }
		var a2 = { t: "stamp", kind: s.kind, x: c.x - s.size / 2, y: c.y - s.size / 2, w: s.size, h: s.size, color: s.color }; PD.addAnnot(c.p, a2); PD.commit();
	}
	PD.placeImage = function (p, x, y, id, w0, h0, kind) {
		var W = Math.min(kind === "sig" ? M.SIZES.sigW : 220, p.W * 0.6), H = W * h0 / w0, a = { t: "img", img: id, kind: kind || "img", x: x - W / 2, y: y - H / 2, w: W, h: H }; a.x = Math.max(p.x0, Math.min(p.x0 + p.W - W, a.x)); a.y = Math.max(p.y0, Math.min(p.y0 + p.H - H, a.y)); PD.addAnnot(p, a); PD.commit(); PD.setTool("select"); PD.select(p, a); return a;
	};
	function imageDown(c) { if (!PD.armed || PD.armed.kind !== "img") { $("pd-imgfile").click(); return; } c.e.preventDefault(); var ar = PD.armed; PD.placeImage(c.p, c.x, c.y, ar.id, ar.w, ar.h, "img"); }
	function signDown(c) { if (!PD.armed || PD.armed.kind !== "sig") { PD.toast("Pick or create a signature first"); return; } c.e.preventDefault(); var ar = PD.armed; PD.placeImage(c.p, c.x, c.y, ar.id, ar.w, ar.h, "sig"); }
	PD.loadImageFile = function (file) {
		return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { var im = new Image(); im.onload = function () { var id = M.newId("i"); PD.images[id] = { data: fr.result, w: im.naturalWidth, h: im.naturalHeight }; res({ id: id, w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = function () { PD.toast("That picture could not be read"); res(null); }; im.src = fr.result; }; fr.readAsDataURL(file); });
	};
	PD.addImageData = function (data, w, h) { var id = M.newId("i"); PD.images[id] = { data: data, w: w, h: h }; return id; };
	function duplicateSel() { var a = PD.selAnnot(); if (!a) return; var p = PD.page(PD.sel.page), c = JSON.parse(JSON.stringify(a)); c.id = M.newId("a"); delete c.coverOf; delete c.textId; M.move(c, 12, -12); p.annots.push(c); PD.sel = { page: p.id, id: c.id }; PD.repaint(p); PD.commit(); buildOpts(); }
	PD.duplicateSel = duplicateSel;
	PD.nudge = function (dx, dy) { var a = PD.selAnnot(); if (!a) return false; var p = PD.page(PD.sel.page); M.move(a, dx, dy); PD.repaint(p); clearTimeout(PD._nt); PD._nt = setTimeout(function () { PD.commit(); }, 400); return true; };
	PD.copySel = function () { var a = PD.selAnnot(); if (!a) return false; PD.clip = JSON.stringify(a); return true; };
	PD.pasteClip = function () { if (!PD.clip || !PD.doc) return false; var p = PD.doc.pages[PD.cur], a = JSON.parse(PD.clip); a.id = M.newId("a"); delete a.coverOf; delete a.textId; M.move(a, 14, -14); p.annots.push(a); PD.sel = { page: p.id, id: a.id }; PD.repaint(p); PD.commit(); PD.emit("sel"); return true; };

	/* ---------- page list (thumbnails): rotate, delete, duplicate, reorder, add ---------- */
	var thumbQueue = Promise.resolve();
	function thumbRender(p, canvas) {
		thumbQueue = thumbQueue.then(async function () {
			if (!canvas.isConnected) return; var vp = PD.vp(p, 1), sc = 120 / vp.width, tv = PD.vp(p, sc), k = 1.5; canvas.width = Math.round(tv.width * k); canvas.height = Math.round(tv.height * k); var ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
			if (!p.blank) { try { await p.proxy.render({ canvasContext: ctx, viewport: p.proxy.getViewport({ scale: sc * k, rotation: (p.rot0 + p.rot) % 360 }) }).promise; } catch (e) {} }
			ctx.save(); ctx.scale(k, k); PD.paintAll(ctx, tv, p.annots); ctx.restore();
		}).catch(function () {});
	}
	function buildThumbs() {
		var box = $("pd-thumbs"); box.classList.toggle("is-off", !PD.S.thumbs || !PD.doc); if (!PD.doc) { box.innerHTML = ""; return; } if (!PD.S.thumbs) return;
		box.innerHTML = PD.doc.pages.map(function (p, i) { return '<div class="pd-th' + (i === PD.cur ? " is-cur" : "") + '" draggable="true" data-i="' + i + '"><canvas></canvas><div class="pd-th-n">' + (i + 1) + '</div><div class="pd-th-act"><button type="button" data-a="rl" title="Rotate left" aria-label="Rotate page ' + (i + 1) + ' left">↶</button><button type="button" data-a="rr" title="Rotate right" aria-label="Rotate page ' + (i + 1) + ' right">↷</button><button type="button" data-a="dup" title="Duplicate page" aria-label="Duplicate page ' + (i + 1) + '">⧉</button><button type="button" data-a="blank" title="Add a blank page after this one" aria-label="Add a blank page after page ' + (i + 1) + '">+</button><button type="button" data-a="del" title="Delete page" aria-label="Delete page ' + (i + 1) + '">✕</button></div></div>'; }).join("") + '<div class="pd-thumbs-add"><button type="button" data-a="addblank">+ Blank page</button><button type="button" data-a="addpdf">+ Pages from a PDF</button></div>';
		[].forEach.call(box.querySelectorAll(".pd-th"), function (th, i) { thumbRender(PD.doc.pages[i], th.querySelector("canvas")); });
	}
	function pageOp(op, i) {
		var d = PD.doc, p = d.pages[i]; PD.endEdit();
		if (op === "rl" || op === "rr") { p.rot = (p.rot + (op === "rl" ? 270 : 90)) % 360; p._rendered = false; }
		else if (op === "del") { if (d.pages.length < 2) return PD.toast("A PDF needs at least one page"); d.pages.splice(i, 1); PD.sel = null; PD.cur = Math.min(PD.cur, d.pages.length - 1); }
		else if (op === "dup") { var c = Object.assign({}, p, { id: M.newId("p"), annots: JSON.parse(JSON.stringify(p.annots)), _rendered: false, _live: null }); c.annots.forEach(function (a) { a.id = M.newId("a"); delete a.coverOf; delete a.textId; }); d.pages.splice(i + 1, 0, c); }
		else if (op === "blank") { var q = PD.vp(p, 1); d.pages.splice(i + 1, 0, PD.blankPage(p.W, p.H)); }
		PD.commit(); PD.layout(); if (op === "blank" || op === "dup") PD.goPage(i + 1);
	}
	function bindThumbs() {
		var box = $("pd-thumbs"), from = null;
		box.addEventListener("click", function (e) { var b = e.target.closest("button"); var th = e.target.closest(".pd-th"); if (b && b.dataset.a === "addblank") { var cp = PD.doc.pages[PD.cur] || PD.doc.pages[PD.doc.pages.length - 1]; PD.doc.pages.push(PD.blankPage(cp.W, cp.H)); PD.commit(); PD.layout(); PD.goPage(PD.doc.pages.length - 1); return; } if (b && b.dataset.a === "addpdf") { $("pd-addfile").click(); return; } if (b && th) { pageOp(b.dataset.a, +th.dataset.i); return; } if (th) PD.goPage(+th.dataset.i); });
		box.addEventListener("dragstart", function (e) { var th = e.target.closest(".pd-th"); if (!th) return; from = +th.dataset.i; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", "page"); } catch (x) {} });
		box.addEventListener("dragover", function (e) { if (from == null) return; e.preventDefault(); var th = e.target.closest(".pd-th"); [].forEach.call(box.querySelectorAll(".is-over"), function (x) { x.classList.remove("is-over"); }); if (th) th.classList.add("is-over"); });
		box.addEventListener("drop", function (e) { if (from == null) return; e.preventDefault(); var th = e.target.closest(".pd-th"); if (th) { var to = +th.dataset.i; if (to !== from) { var pg = PD.doc.pages.splice(from, 1)[0]; PD.doc.pages.splice(to, 0, pg); PD.cur = to; PD.commit(); PD.layout(); } } from = null; });
		box.addEventListener("dragend", function () { from = null; [].forEach.call(box.querySelectorAll(".is-over"), function (x) { x.classList.remove("is-over"); }); });
	}
	var thumbT; PD.on("layout", function () { clearTimeout(thumbT); thumbT = setTimeout(buildThumbs, 120); }); PD.on("cur", function () { [].forEach.call($("pd-thumbs").querySelectorAll(".pd-th"), function (x, i) { x.classList.toggle("is-cur", i === PD.cur); }); var cur = $("pd-thumbs").querySelector(".is-cur"); if (cur && PD.S.thumbs) { var box = $("pd-thumbs"); if (cur.offsetTop < box.scrollTop || cur.offsetTop + cur.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = cur.offsetTop - 20; } });
	PD.refreshThumb = function (p) { var i = PD.doc.pages.indexOf(p), th = $("pd-thumbs").querySelectorAll(".pd-th")[i]; if (th) thumbRender(p, th.querySelector("canvas")); };
	var tt; PD.on("history", function () { clearTimeout(tt); tt = setTimeout(function () { if (PD.doc && PD.S.thumbs) { [].forEach.call($("pd-thumbs").querySelectorAll(".pd-th"), function (th, i) { if (PD.doc.pages[i]) thumbRender(PD.doc.pages[i], th.querySelector("canvas")); }); } }, 600); });
	PD.init = { buildTools: buildTools, bindPointer: bindPointer, bindThumbs: bindThumbs };
})();

/* MES PDF Editor: signatures (type, draw, upload), saved in this browser only. Uses PD. */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$, SKEY = "mes-pdf-editor:sigs";
	var FONTS = ["Great Vibes", "Dancing Script", "Sacramento", "Mrs Saint Delafield", "Homemade Apple", "Caveat"], INK = [["#111111", "Black"], ["#1a2f8a", "Blue"], ["#b3261e", "Red"]];
	function load() { try { var a = JSON.parse(localStorage.getItem(SKEY) || "[]"); return Array.isArray(a) ? a.filter(function (s) { return s && /^data:image\/png;base64,/.test(s.data || ""); }).slice(0, 8) : []; } catch (e) { return []; } }
	function save(list) { try { localStorage.setItem(SKEY, JSON.stringify(list.slice(0, 8))); return true; } catch (e) { PD.toast("Could not save the signature in this browser (storage is full or blocked)"); return false; } }
	var fontsLinked = false; function linkFonts() { if (fontsLinked) return; fontsLinked = true; var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Homemade+Apple&family=Mrs+Saint+Delafield&family=Sacramento&display=swap"; document.head.appendChild(l); }
	function arm(s) { if (!s.imgId || !PD.images[s.imgId]) s.imgId = PD.addImageData(s.data, s.w, s.h); PD.armed = { kind: "sig", id: s.imgId, w: s.w, h: s.h }; }
	PD.signOptions = function (o, add, button) {
		var list = load(); add(button("Create signature...", function () { PD.signDialog(); }, true));
		var wrap = document.createElement("span"); wrap.className = "pd-sigs-bar"; wrap.style.cssText = "display:inline-flex;gap:0.4em;align-items:center;flex-wrap:wrap";
		list.forEach(function (s, i) { var b = document.createElement("button"); b.type = "button"; b.className = "pd-btn"; b.style.cssText = "background:#fff;padding:0.15em 0.4em;border-radius:0.4em;height:2.4em;" + (PD.armed && PD.armed.sigIndex === i ? "outline:2px solid var(--pd-on);" : ""); b.title = "Use this signature"; b.innerHTML = '<img alt="Saved signature ' + (i + 1) + '" style="height:1.9em;display:block" src="' + s.data + '">'; b.onclick = function () { arm(s); PD.armed.sigIndex = i; PD.toast("Click on the page where the signature should go"); PD.buildOpts(); }; wrap.appendChild(b); });
		add(wrap); if (list.length) add(button("Manage...", function () { PD.manageSigs(); })); else { var n = document.createElement("span"); n.className = "pd-note"; n.textContent = "No saved signatures yet."; add(n); }
		if (PD.armed && PD.armed.kind === "sig") { var h = document.createElement("span"); h.className = "pd-note pd-warn"; h.textContent = "Click on the page where it should go."; add(h); }
	};
	PD.manageSigs = function () {
		var list = load(); PD.dialog('<h3>Saved signatures</h3><p class="pd-note">They are stored only in this browser. Delete any you no longer want.</p><div class="pd-sigs" id="pd-sg"></div><div class="pd-end"><button type="button" class="pd-btn pd-btn--primary" id="pd-sg-done">Done</button></div>', function () { PD.buildOpts(); });
		function draw() { var g = $("pd-sg"); g.innerHTML = ""; list.forEach(function (s, i) { var c = document.createElement("div"); c.className = "pd-sigc"; c.innerHTML = '<img alt="Saved signature ' + (i + 1) + '" src="' + s.data + '"><button type="button" aria-label="Delete this signature">✕</button>'; c.querySelector("button").onclick = function () { list.splice(i, 1); save(list); PD.armed = null; draw(); }; g.appendChild(c); }); if (!list.length) g.innerHTML = '<span class="pd-note">None saved.</span>'; }
		draw(); $("pd-sg-done").onclick = PD.closeDialog;
	};
	// trim transparent margins, return { data, w, h }
	function finish(canvas) {
		var ctx = canvas.getContext("2d"), d = ctx.getImageData(0, 0, canvas.width, canvas.height), b = M.alphaBounds(d.data, canvas.width, canvas.height, 10); if (!b) return null; var pad = Math.round(Math.max(b.w, b.h) * 0.03) + 2, x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad), w = Math.min(canvas.width - x, b.w + pad * 2), h = Math.min(canvas.height - y, b.h + pad * 2), out = document.createElement("canvas"); out.width = w; out.height = h; out.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
		var max = 900; if (w > max) { var o2 = document.createElement("canvas"); o2.width = max; o2.height = Math.round(h * max / w); o2.getContext("2d").drawImage(out, 0, 0, o2.width, o2.height); return { data: o2.toDataURL("image/png"), w: o2.width, h: o2.height }; }
		return { data: out.toDataURL("image/png"), w: w, h: h };
	}
	PD.signDialog = function () {
		linkFonts(); var tab = "type", ink = INK[0][0], fontIdx = 0, name = "", result = null, strokes = [], upImg = null, removeBg = true, saveIt = true;
		PD.noBackdropClose = true;
		PD.dialog('<h3>Create your signature</h3><div class="pd-tabs" role="tablist"><button type="button" role="tab" data-tab="type" aria-selected="true">Type</button><button type="button" role="tab" data-tab="draw" aria-selected="false">Draw</button><button type="button" role="tab" data-tab="upload" aria-selected="false">Upload</button></div><div id="pd-sg-body"></div><div class="pd-row"><span class="pd-note">Ink</span><span class="pd-sw" id="pd-sg-ink"></span></div><label class="pd-chk"><input type="checkbox" id="pd-sg-save" checked> <span>Save it in this browser for next time (it never leaves your device)</span></label><div class="pd-end"><button type="button" class="pd-btn" id="pd-sg-cancel">Cancel</button><button type="button" class="pd-btn pd-btn--primary" id="pd-sg-use" disabled>Use this signature</button></div>', function () { PD.noBackdropClose = false; });
		var body = $("pd-sg-body"), useBtn = $("pd-sg-use");
		function setResult(r) { result = r; useBtn.disabled = !r; }
		function drawInk() { var box = $("pd-sg-ink"); box.innerHTML = ""; INK.forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.style.background = c[0]; b.title = c[1]; b.setAttribute("aria-label", c[1]); b.setAttribute("aria-pressed", String(c[0] === ink)); b.onclick = function () { ink = c[0]; drawInk(); render(); }; box.appendChild(b); }); }
		function typeRender() {
			var txt = name.trim(); if (!txt) { setResult(null); var pv = body.querySelector(".pd-sigprev"); if (pv) pv.innerHTML = '<span class="pd-note" style="color:#666">Your signature appears here</span>'; return; }
			var f = FONTS[fontIdx]; document.fonts.load('96px "' + f + '"', txt).then(function () { var c = document.createElement("canvas"), ctx = c.getContext("2d"), sz = 120; ctx.font = sz + 'px "' + f + '", cursive'; var w = Math.ceil(ctx.measureText(txt).width) + 60; c.width = Math.min(3000, w); c.height = sz * 2; ctx.font = sz + 'px "' + f + '", cursive'; ctx.fillStyle = ink; ctx.textBaseline = "middle"; ctx.fillText(txt, 30, sz); var r = finish(c); setResult(r); var pv = body.querySelector(".pd-sigprev"); if (pv && r) pv.innerHTML = '<img alt="Signature preview" style="max-width:100%;max-height:6em" src="' + r.data + '">'; });
		}
		function typeUI() {
			body.innerHTML = '<div class="pd-row"><input type="text" id="pd-sg-name" placeholder="Type your name" maxlength="60" autocomplete="off" aria-label="Your name" value="' + M.esc(name) + '"></div><div class="pd-fonts" id="pd-sg-fonts"></div><div class="pd-sigprev"></div>';
			var fb = $("pd-sg-fonts"); function fonts() { fb.innerHTML = ""; FONTS.forEach(function (f, i) { var d = document.createElement("div"); d.className = "pd-fontc" + (i === fontIdx ? " is-on" : ""); d.style.fontFamily = '"' + f + '", cursive'; d.style.color = '#111'; d.textContent = name.trim() || "Your name"; d.title = f; d.onclick = function () { fontIdx = i; fonts(); typeRender(); }; fb.appendChild(d); }); } fonts();
			$("pd-sg-name").addEventListener("input", function () { name = this.value; fonts(); typeRender(); }); $("pd-sg-name").focus(); typeRender();
		}
		function drawUI() {
			body.innerHTML = '<canvas class="pd-pad" id="pd-pad" width="1200" height="360" aria-label="Draw your signature here"></canvas><div class="pd-row"><button type="button" class="pd-btn" id="pd-pad-undo">Undo</button><button type="button" class="pd-btn" id="pd-pad-clear">Clear</button><span class="pd-note">Draw with a mouse, trackpad, finger or pen.</span></div>';
			var cv = $("pd-pad"), ctx = cv.getContext("2d"), cur = null;
			function redraw() { ctx.clearRect(0, 0, cv.width, cv.height); ctx.strokeStyle = ink; ctx.lineCap = ctx.lineJoin = "round"; strokes.forEach(function (s) { ctx.lineWidth = 7; ctx.beginPath(); var p = s.pts; if (p.length === 1) { ctx.arc(p[0][0], p[0][1], 3.5, 0, 7); ctx.fillStyle = ink; ctx.fill(); return; } ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length - 1; i++) { var mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my); } ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); ctx.stroke(); }); setResult(strokes.length ? finish(cv) : null); }
			function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
			cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); cur = { pts: [pt(e)] }; strokes.push(cur); redraw(); e.preventDefault(); });
			cv.addEventListener("pointermove", function (e) { if (!cur) return; cur.pts.push(pt(e)); redraw(); }); ["pointerup", "pointercancel"].forEach(function (n) { cv.addEventListener(n, function () { cur = null; }); });
			$("pd-pad-undo").onclick = function () { strokes.pop(); redraw(); }; $("pd-pad-clear").onclick = function () { strokes = []; redraw(); }; redraw(); cv._redraw = redraw;
		}
		function uploadUI() {
			body.innerHTML = '<div class="pd-row"><input type="file" id="pd-sg-file" accept="image/*" aria-label="Choose a picture of your signature"></div><label class="pd-chk"><input type="checkbox" id="pd-sg-bg" ' + (removeBg ? "checked" : "") + '> <span>Remove the white background</span></label><div class="pd-sigprev"><span class="pd-note" style="color:#666">Choose a photo or scan of your signature on white paper</span></div>';
			function proc() { if (!upImg) return; var c = document.createElement("canvas"), s = Math.min(1, 1000 / upImg.naturalWidth); c.width = Math.max(1, Math.round(upImg.naturalWidth * s)); c.height = Math.max(1, Math.round(upImg.naturalHeight * s)); var x = c.getContext("2d"); x.drawImage(upImg, 0, 0, c.width, c.height); if (removeBg) { var d = x.getImageData(0, 0, c.width, c.height); M.whiteToAlpha(d.data, 190, 240); x.putImageData(d, 0, 0); } var r = finish(c); setResult(r); var pv = body.querySelector(".pd-sigprev"); if (pv && r) pv.innerHTML = '<img alt="Signature preview" style="max-width:100%;max-height:7em" src="' + r.data + '">'; }
			$("pd-sg-file").addEventListener("change", function () { var f = this.files[0]; if (!f) return; var fr = new FileReader(); fr.onload = function () { var im = new Image(); im.onload = function () { upImg = im; proc(); }; im.src = fr.result; }; fr.readAsDataURL(f); }); $("pd-sg-bg").addEventListener("change", function () { removeBg = this.checked; proc(); });
		}
		function render() { if (tab === "type") typeUI(); else if (tab === "draw") drawUI(); else uploadUI(); }
		[].forEach.call(PD.$("pd-dlg").querySelectorAll(".pd-tabs button"), function (b) { b.onclick = function () { tab = b.dataset.tab; [].forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-selected", String(x === b)); }); setResult(null); render(); }; });
		$("pd-sg-save").onchange = function () { saveIt = this.checked; }; $("pd-sg-cancel").onclick = PD.closeDialog;
		useBtn.onclick = function () { if (!result) return; var s = { id: M.newId("s"), data: result.data, w: result.w, h: result.h }; if (saveIt) { var list = load(); list.unshift({ id: s.id, data: s.data, w: s.w, h: s.h }); save(list); } PD.closeDialog(); arm(s); PD.armed.sigIndex = saveIt ? 0 : -1; PD.setTool("sign"); arm(s); PD.buildOpts(); PD.toast("Click on the page where the signature should go", 3500); };
		drawInk(); render();
	};
})();

/* MES PDF Editor: export with pdf-lib (text and shapes stay vector), flatten mode (pages become pictures), print. Uses PD. */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$;
	var STD = { "Helvetica": "Helvetica", "Helvetica-Bold": "HelveticaBold", "Helvetica-Oblique": "HelveticaOblique", "Helvetica-BoldOblique": "HelveticaBoldOblique", "Times-Roman": "TimesRoman", "Times-Bold": "TimesRomanBold", "Times-Italic": "TimesRomanItalic", "Times-BoldItalic": "TimesRomanBoldItalic", "Courier": "Courier", "Courier-Bold": "CourierBold", "Courier-Oblique": "CourierOblique", "Courier-BoldOblique": "CourierBoldOblique" };
	function dataBytes(url) { var b = atob(url.split(",")[1]), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
	function col(L, hex) { var c = M.hexToRgb(hex); return L.rgb(c[0], c[1], c[2]); }

	async function vector() {
		var L = window.PDFLib, out = await L.PDFDocument.create(), src = {}, fonts = {}, imgs = {};
		async function getSrc(i) { if (!src[i]) src[i] = await L.PDFDocument.load(PD.doc.srcs[i].bytes, { updateMetadata: false }); return src[i]; }
		async function font(a) { var n = PD.fontName(a); if (!fonts[n]) fonts[n] = await out.embedFont(L.StandardFonts[STD[n]]); return fonts[n]; }
		async function image(id) { if (!imgs[id]) { var d = PD.images[id].data, b = dataBytes(d); imgs[id] = /^data:image\/png/.test(d) ? await out.embedPng(b) : await out.embedJpg(b); } return imgs[id]; }
		async function pngImage(canvas) { var d = canvas.toDataURL("image/png"); return out.embedPng(dataBytes(d)); }
		for (var pi = 0; pi < PD.doc.pages.length; pi++) {
			var p = PD.doc.pages[pi], page;
			if (p.blank) page = out.addPage([p.W, p.H]); else { var s = await getSrc(p.src), cp = await out.copyPages(s, [p.index]); page = out.addPage(cp[0]); }
			if (p.rot) page.setRotation(L.degrees((((page.getRotation().angle + p.rot) % 360) + 360) % 360));
			for (var ai = 0; ai < p.annots.length; ai++) await draw(L, out, page, p.annots[ai], font, image, pngImage);
			if (pi % 8 === 7) await new Promise(function (r) { setTimeout(r, 0); });
		}
		out.setProducer("MES PDF Editor (mes.fm/pdf)"); out.setModificationDate(new Date());
		return out.save();
	}
	async function draw(L, out, page, a, font, image, pngImage) {
		var O = function (v) { return v == null ? 1 : v; };
		switch (a.t) {
			case "pen": {
				if (a.pts.length === 1) { page.drawCircle({ x: a.pts[0][0], y: a.pts[0][1], size: a.width / 2, color: col(L, a.color), opacity: O(a.alpha) }); break; }
				var d = "M " + a.pts.map(function (q) { return q[0].toFixed(2) + " " + (-q[1]).toFixed(2); }).join(" L ");
				page.drawSvgPath(d, { x: 0, y: 0, borderColor: col(L, a.color), borderWidth: a.width, borderOpacity: O(a.alpha), borderLineCap: L.LineCapStyle.Round }); break; }
			case "rect": { var o = { x: a.x, y: a.y, width: a.w, height: a.h }; if (a.fill) { o.color = col(L, a.fill); o.opacity = O(a.alpha); } if (a.stroke && a.sw > 0) { o.borderColor = col(L, a.stroke); o.borderWidth = a.sw; } if (a.fill || (a.stroke && a.sw > 0)) page.drawRectangle(o); break; }
			case "ellipse": { var e = { x: a.x + a.w / 2, y: a.y + a.h / 2, xScale: a.w / 2, yScale: a.h / 2 }; if (a.fill) { e.color = col(L, a.fill); e.opacity = O(a.alpha); } if (a.stroke && a.sw > 0) { e.borderColor = col(L, a.stroke); e.borderWidth = a.sw; } if (a.fill || (a.stroke && a.sw > 0)) page.drawEllipse(e); break; }
			case "line": case "arrow": {
				var c = col(L, a.color), seg = function (x1, y1, x2, y2) { page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: a.sw, color: c, lineCap: L.LineCapStyle.Round }); }; seg(a.x1, a.y1, a.x2, a.y2);
				if (a.t === "arrow") { var ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), len = Math.max(8, a.sw * 4); [Math.PI - 0.45, Math.PI + 0.45].forEach(function (dd) { seg(a.x2, a.y2, a.x2 + Math.cos(ang + dd) * len, a.y2 + Math.sin(ang + dd) * len); }); } break; }
			case "text": {
				if (a.bg) page.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: col(L, a.bg) });
				if (!(a.lines && a.lines.length)) break;
				if (a.raster) { var img = await pngImage(PD.rasterText(a, 3)); page.drawImage(img, { x: a.x, y: a.y, width: a.w, height: a.h }); break; }
				var f = await font(a), top = a.y + a.h;
				a.lines.forEach(function (line, i) { var t = line.replace(/\t/g, "    "), w = f.widthOfTextAtSize(t, a.size), dx = a.align === "center" ? (a.w - w) / 2 : a.align === "right" ? a.w - M.PAD - w : M.PAD; if (t) page.drawText(t, { x: a.x + dx, y: top - M.PAD - M.ASCENT * a.size - i * a.size * M.LINE_H, size: a.size, font: f, color: col(L, a.color) }); }); break; }
			case "img": { var im = await image(a.img); page.drawImage(im, { x: a.x, y: a.y, width: a.w, height: a.h }); break; }
			case "stamp": {
				var sc = col(L, a.color), th = Math.max(1, a.w * 0.13), P2 = function (u, v) { return { x: a.x + u * a.w, y: a.y + v * a.h }; }, ln = function (p1, p2) { page.drawLine({ start: p1, end: p2, thickness: th, color: sc, lineCap: L.LineCapStyle.Round }); };
				if (a.kind === "check") { ln(P2(0.1, 0.45), P2(0.38, 0.15)); ln(P2(0.38, 0.15), P2(0.92, 0.85)); } else if (a.kind === "cross") { ln(P2(0.15, 0.85), P2(0.85, 0.15)); ln(P2(0.85, 0.85), P2(0.15, 0.15)); } else page.drawCircle({ x: a.x + a.w / 2, y: a.y + a.h / 2, size: a.w * 0.36, color: sc }); break; }
			case "note": {
				var rgb = M.hexToRgb(a.color || "#ffd54f"), ctx = out.context, annot = ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [a.x, a.y - 18, a.x + 18, a.y], Contents: L.PDFHexString.fromText(a.text || ""), T: L.PDFHexString.fromText("Comment"), Name: "Comment", C: rgb, F: 4 }), ref = ctx.register(annot), arr = page.node.Annots();
				if (arr) arr.push(ref); else page.node.set(L.PDFName.of("Annots"), ctx.obj([ref])); break; }
		}
	}
	// flatten: every page becomes a picture (hidden text under covers is gone, file is bigger, text is no longer selectable)
	async function flatten(dpi, onProgress) {
		var L = window.PDFLib, out = await L.PDFDocument.create(), scale = dpi / 72, q = dpi >= 200 ? 0.9 : dpi >= 150 ? 0.86 : 0.8;
		for (var i = 0; i < PD.doc.pages.length; i++) {
			var p = PD.doc.pages[i], vp = PD.vp(p, scale), cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
			if (!p.blank) await p.proxy.render({ canvasContext: ctx, viewport: p.proxy.getViewport({ scale: scale, rotation: (p.rot0 + p.rot) % 360 }) }).promise;
			PD.paintAll(ctx, vp, p.annots);
			var blob = await new Promise(function (r) { cv.toBlob(r, "image/jpeg", q); }), bytes = new Uint8Array(await blob.arrayBuffer()), img = await out.embedJpg(bytes), page = out.addPage([vp.width / scale, vp.height / scale]); page.drawImage(img, { x: 0, y: 0, width: vp.width / scale, height: vp.height / scale }); cv.width = cv.height = 1;
			if (onProgress) onProgress(i + 1, PD.doc.pages.length); await new Promise(function (r) { setTimeout(r, 0); });
		}
		out.setProducer("MES PDF Editor (mes.fm/pdf)"); return out.save();
	}
	PD.exportBytes = async function (opts, onProgress) {
		await PD.ensureLibs(); if (opts.flatten) return { bytes: await flatten(opts.dpi || 150, onProgress), flattened: true };
		try { return { bytes: await vector(), flattened: false }; }
		catch (e) { console.error(e); var enc = /encrypt/i.test(String(e && (e.name + e.message))); PD.toast(enc ? "This PDF is password protected, so the edited copy is saved as flattened pages." : "Could not keep the original page content, so the copy is saved as flattened pages.", 5000); return { bytes: await flatten(opts.dpi || 150, onProgress), flattened: true }; }
	};
	function save(bytes, name) { var blob = new Blob([bytes], { type: "application/pdf" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 20000); }
	PD.exportDialog = function () {
		if (!PD.doc) return PD.toast("Open a PDF first"); PD.endEdit();
		var hasBlack = PD.doc.pages.some(function (p) { return p.annots.some(function (a) { return a.t === "rect" && /^#0{6}$/.test(a.fill || "") && !a.alpha; }); }), hasCover = PD.doc.pages.some(function (p) { return p.annots.some(function (a) { return a.t === "rect" && a.fill && !a.alpha && !a.stroke; }); });
		PD.dialog('<h3>Download your PDF</h3><div class="pd-row"><input type="text" id="pd-x-name" aria-label="File name" value="' + M.esc(M.editedName(PD.doc.name)) + '"></div>' + (hasBlack ? '<p class="pd-note pd-warn"><b>You have black cover boxes.</b> They hide text on screen, but the words are still inside the file unless you flatten it.</p>' : hasCover ? '<p class="pd-note">Cover boxes hide what is under them on screen. To remove the hidden text from the file, flatten it.</p>' : "") + '<label class="pd-chk"><input type="checkbox" id="pd-x-flat" ' + (hasBlack ? "checked" : "") + '><span><b>Flatten pages</b> (removes hidden text, so redactions are permanent; the file gets bigger and its text can no longer be selected)</span></label><div class="pd-row" id="pd-x-q" ' + (hasBlack ? "" : "hidden") + '><label class="pd-note">Quality <select id="pd-x-dpi" style="width:auto"><option value="100">Small (100 dpi)</option><option value="150" selected>Standard (150 dpi)</option><option value="220">High (220 dpi)</option></select></label></div><div class="pd-note" id="pd-x-st"></div><div class="pd-end"><button type="button" class="pd-btn" id="pd-x-no">Cancel</button><button type="button" class="pd-btn pd-btn--primary" id="pd-x-go">Download</button></div>');
		var flat = $("pd-x-flat"); flat.onchange = function () { $("pd-x-q").hidden = !flat.checked; }; $("pd-x-no").onclick = PD.closeDialog;
		$("pd-x-go").onclick = async function () {
			var name = ($("pd-x-name").value || "document.pdf").trim(); if (!/\.pdf$/i.test(name)) name += ".pdf"; $("pd-x-go").disabled = true; var st = $("pd-x-st");
			try { st.textContent = "Building the PDF..."; var r = await PD.exportBytes({ flatten: flat.checked, dpi: +$("pd-x-dpi").value }, function (i, n) { st.textContent = "Rendering page " + i + " of " + n + "..."; }); save(r.bytes, name); PD.dirty = false; PD.status(); PD.closeDialog(); PD.toast("Downloaded " + name + " (" + M.formatBytes(r.bytes.length) + ")", 3500); }
			catch (e) { console.error(e); st.textContent = "Something went wrong: " + ((e && e.message) || e); $("pd-x-go").disabled = false; }
		};
	};
	PD.printPdf = async function () {
		if (!PD.doc) return PD.toast("Open a PDF first"); PD.endEdit(); var win = window.open("", "_blank"); try { PD.toast("Preparing to print..."); var r = await PD.exportBytes({ flatten: false }), url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" })); if (win) { win.location.href = url; } else { var a = document.createElement("a"); a.href = url; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(function () { URL.revokeObjectURL(url); }, 120000); }
		catch (e) { if (win) win.close(); PD.toast("Could not prepare the PDF for printing", 4000); }
	};
})();

/* MES PDF Editor -- mes.fm/pdf (wiring: files, drag and drop, zoom, keyboard, window mode). The work is in core.js / tools.js / sign.js / export.js (global PD, helpers in lib.js as PDM). */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$, root = $("pd");
	if (!root) return;
	PD.init.buildTools(); PD.init.bindPointer(); PD.init.bindThumbs(); PD.setTool("select");
	function confirmDiscard() { return !PD.dirty || window.confirm("You have unsaved edits. Open another PDF and discard them?"); }
	function openFile(f) { if (!f) return; if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) return PD.toast("Please choose a PDF file"); if (!confirmDiscard()) return; PD.open(f); }
	["pd-open", "pd-e-open"].forEach(function (id) { $(id).addEventListener("click", function () { $("pd-file").click(); }); });
	$("pd-file").addEventListener("change", function () { openFile(this.files[0]); this.value = ""; });
	$("pd-addfile").addEventListener("change", function () { if (this.files[0]) PD.addPdf(this.files[0]); this.value = ""; });
	$("pd-e-blank").addEventListener("click", function () { PD.newBlank(); });
	$("pd-imgfile").addEventListener("change", async function () { var f = this.files[0]; this.value = ""; if (!f || !PD.doc) return; var r = await PD.loadImageFile(f); if (r) { PD.setTool("image"); PD.armed = { kind: "img", id: r.id, w: r.w, h: r.h }; PD.buildOpts(); PD.toast("Click where the picture should go", 3000); } });
	/* drag and drop: a PDF opens, a picture is placed on the page under the pointer */
	var view = $("pd-view"), depth = 0;
	function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
	view.addEventListener("dragenter", function (e) { if (hasFiles(e)) { depth++; view.classList.add("is-over"); } }); view.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) view.classList.remove("is-over"); });
	view.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
	view.addEventListener("drop", async function (e) {
		depth = 0; view.classList.remove("is-over"); if (!hasFiles(e)) return; e.preventDefault(); var f = e.dataTransfer.files[0]; if (!f) return;
		if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) return openFile(f);
		if (/^image\//.test(f.type) && PD.doc) { var pe = e.target.closest && e.target.closest(".pd-page"), p = (pe && PD.page(pe.dataset.id)) || PD.doc.pages[PD.cur], x = p.x0 + p.W / 2, y = p.y0 + p.H / 2; if (pe) { var r = pe.getBoundingClientRect(), pt = PD.vp(p).toPdf(e.clientX - r.left, e.clientY - r.top); x = pt[0]; y = pt[1]; } var im = await PD.loadImageFile(f); if (im) PD.placeImage(p, x, y, im.id, im.w, im.h, "img"); }
	});
	document.addEventListener("paste", async function (e) {
		if (!PD.doc || PD.isEditing() || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return; var cd = e.clipboardData, f = null; if (cd && cd.files) for (var i = 0; i < cd.files.length; i++) if (/^image\//.test(cd.files[i].type)) { f = cd.files[i]; break; }
		if (f) { e.preventDefault(); var p = PD.doc.pages[PD.cur], im = await PD.loadImageFile(f); if (im) PD.placeImage(p, p.x0 + p.W / 2, p.y0 + p.H / 2, im.id, im.w, im.h, "img"); } else if (PD.clip) { e.preventDefault(); PD.pasteClip(); }
	});
	/* undo / redo / history */
	$("pd-undo").onclick = function () { PD.endEdit(); PD.undo(); }; $("pd-redo").onclick = function () { PD.endEdit(); PD.redo(); };
	function histBtns() { $("pd-undo").disabled = !PD.hist.canUndo(); $("pd-redo").disabled = !PD.hist.canRedo(); } PD.on("history", histBtns); PD.on("open", histBtns);
	PD.on("open", function () { PD.setTool("select"); autoWin(); PD.status(); });
	PD.on("sel", function () { var a = PD.selAnnot(); $("pd-st-sel").textContent = a ? "Selected: " + a.t : ""; });
	/* zoom */
	$("pd-zin").onclick = function () { PD.setZoom(PD.zoom * 1.2); }; $("pd-zout").onclick = function () { PD.setZoom(PD.zoom / 1.2); }; $("pd-zoom").onclick = function () { var z = PD.fitWidth(); if (z) PD.setZoom(Math.abs(PD.zoom - z) < 0.01 ? 1 : z); };
	view.addEventListener("wheel", function (e) { if (!(e.ctrlKey || e.metaKey) || !PD.doc) return; e.preventDefault(); PD.setZoom(PD.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
	var scrollT; view.addEventListener("scroll", function () { clearTimeout(scrollT); scrollT = setTimeout(PD.trackCurrent, 80); });
	var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (PD.doc && PD.fitMode) { var z = PD.fitWidth(); if (z) PD.setZoom(z); } }, 200); });
	/* page list and window mode */
	function showThumbs() { $("pd-thumbbtn").setAttribute("aria-pressed", String(PD.S.thumbs)); $("pd-thumbs").classList.toggle("is-off", !PD.S.thumbs || !PD.doc); }
	$("pd-thumbbtn").onclick = function () { PD.S.thumbs = !PD.S.thumbs; PD.saveS(); showThumbs(); if (PD.S.thumbs) PD.layout(); }; showThumbs(); PD.on("open", showThumbs);
	var autoDone = false; function toggleWin(auto) { var on = !root.classList.contains("pd-win"); root.classList.toggle("pd-win", on); document.documentElement.classList.toggle("pd-win-on", on); $("pd-winbtn").setAttribute("aria-pressed", String(on)); if (!auto) { PD.S.win = on; PD.saveS(); } if (PD.doc) setTimeout(function () { var z = PD.fitWidth(); if (z && PD.fitMode) PD.setZoom(z); }, 60); }
	function autoWin() { if (!autoDone && PD.S.win !== false && !root.classList.contains("pd-win")) { autoDone = true; toggleWin(true); } }
	$("pd-winbtn").onclick = function () { toggleWin(); };
	$("pd-print").onclick = function () { PD.printPdf(); }; $("pd-export").onclick = function () { PD.exportDialog(); };
	PD.fitMode = true; var oz = PD.setZoom; PD.setZoom = function (z) { PD.fitMode = false; oz.apply(PD, arguments); };
	/* keyboard */
	document.addEventListener("keydown", function (e) {
		if (!PD.doc && !(e.ctrlKey || e.metaKey)) return; var t = e.target, typing = t && /INPUT|TEXTAREA|SELECT/.test(t.tagName); if (typing || PD.isEditing() || !$("pd-modal").hidden) { if (e.key === "Escape" && !$("pd-modal").hidden) PD.closeDialog(); return; }
		var k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
		if (mod && k === "z") { e.preventDefault(); e.shiftKey ? PD.redo() : PD.undo(); return; } if (mod && k === "y") { e.preventDefault(); PD.redo(); return; }
		if (mod && k === "d") { e.preventDefault(); PD.duplicateSel(); return; } if (mod && k === "c") { if (PD.copySel()) e.preventDefault(); return; } if (mod && k === "s") { e.preventDefault(); PD.exportDialog(); return; } if (mod && k === "p") { if (PD.doc) { e.preventDefault(); PD.printPdf(); } return; } if (mod && k === "o") { e.preventDefault(); $("pd-file").click(); return; } if (mod) return;
		if (e.key === "Delete" || e.key === "Backspace") { if (PD.selAnnot()) { e.preventDefault(); PD.removeSel(); } return; }
		if (e.key === "Escape") { if (PD.selAnnot()) PD.select(null, null); else if (PD.tool !== "select") PD.setTool("select"); return; }
		var step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]; if (mv && PD.nudge(mv[0], mv[1])) { e.preventDefault(); return; }
		if (k === "+" || k === "=") { PD.setZoom(PD.zoom * 1.2); return; } if (k === "-") { PD.setZoom(PD.zoom / 1.2); return; } if (k === "0") { var z = PD.fitWidth(); if (z) PD.setZoom(z); return; } if (k === "f") { toggleWin(); return; }
		PD.TOOLS.forEach(function (tl) { if (tl.key === k && PD.doc) PD.setTool(tl.id); });
	});
	PD.status();
})();
