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
