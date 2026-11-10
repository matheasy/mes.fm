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
	/* ---------- hand pictures from one MES tool to another in the same browser (round 10: Photo Editor <-> Compressor <-> Image Converter) ----------
	 * The pictures go through IndexedDB "mes-handoff" (same site, never uploaded) under a random id; the other page is opened with ?handoff=<id> and
	 * takes them (they are deleted when taken, and anything older than an hour is cleared). send() opens the new tab inside the click so pop-up
	 * blockers allow it, then points it at the page once the pictures are stored. */
	var HDB = "mes-handoff";
	function hdb() { return new Promise(function (res, rej) { if (typeof indexedDB === "undefined") { rej(new Error("no IndexedDB")); return; } var r = indexedDB.open(HDB, 1); r.onupgradeneeded = function () { r.result.createObjectStore("h"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function htx(mode, fn) { return hdb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction("h", mode), st = t.objectStore("h"), out = fn(st); t.oncomplete = function () { db.close(); res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { db.close(); rej(t.error); }; }); }); }
	function handoffPut(files) {
		var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10), list = (files || []).map(function (f) { return { name: f.name || "picture.png", type: f.type || (f.blob && f.blob.type) || "image/png", blob: f.blob || f }; });
		return htx("readwrite", function (st) { var c = st.openCursor(); c.onsuccess = function () { var cur = c.result; if (!cur) return; if (!cur.value || Date.now() - cur.value.t > 3600e3) cur.delete(); cur.continue(); }; st.put({ t: Date.now(), files: list }, id); }).then(function () { return id; });
	}
	function handoffTake(id) {
		var got = null; return htx("readwrite", function (st) { var g = st.get(String(id)); g.onsuccess = function () { got = g.result || null; if (got) st.delete(String(id)); }; }).then(function () {
			if (!got) return []; return got.files.map(function (f) { try { return new File([f.blob], f.name, { type: f.type }); } catch (e) { var b = f.blob; b.name = f.name; return b; } });
		});
	}
	/* to = "/photo" | "/compress" | "/image-converter"; files = [File or {blob, name}]. Returns a promise; onBlocked(url) is called when no tab could open. */
	function handoffSend(to, files, onBlocked) {
		var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) {}
		return handoffPut(files).then(function (id) { var url = to + (to.indexOf("?") < 0 ? "?" : "&") + "handoff=" + encodeURIComponent(id); if (w && !w.closed) { try { w.opener = null; } catch (e) {} w.location.href = url; } else if (onBlocked) onBlocked(url); else location.href = url; return id; }, function (e) { if (w) w.close(); throw e; });
	}
	/* the pictures handed to this page (?handoff=<id>), and the address cleaned so a reload doesn't ask again */
	function handoffReceive() {
		if (typeof location === "undefined") return Promise.resolve([]); var m = /[?&]handoff=([\w-]+)/.exec(location.search); if (!m) return Promise.resolve([]);
		try { var u = new URL(location.href); u.searchParams.delete("handoff"); history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash); } catch (e) {}
		return handoffTake(m[1]).catch(function () { return []; });
	}
	var api = { FORMATS: FORMATS, extOf: extOf, baseName: baseName, cleanFileName: cleanFileName, fitSize: fitSize, uniqueName: uniqueName, outName: outName, formatBytes: formatBytes, crc32: crc32, zipStore: zipStore, zipRead: zipRead, handoffPut: handoffPut, handoffTake: handoffTake, handoffSend: handoffSend, handoffReceive: handoffReceive };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();

/* MES Draw (mes.fm/draw): the pure part. Geometry (SVG path data for every shape and brush), 2D matrices, bounding boxes, hit maths,
 * paper patterns, the SVG writer, templates / examples, and the emoji + symbol lists. No DOM: runs in node for the tests
 * (node tool_apps_src/draw-tests.js). The page (app.js) turns the path data into Path2D objects, so the canvas and the SVG export draw
 * exactly the same shapes.
 *
 * A drawing = {w, h, bg: {c: colour | null (transparent), p: paper pattern id}, objs: [...]}. Every object has an affine matrix m = [a,b,c,d,e,f]
 * (canvas order: x' = a x + c y + e, y' = b x + d y + f) applied to its own coordinates, so moving / scaling / rotating never touches the points.
 *   path : {t:"path", brush: pen|calli|marker|hl|pencil|neon|spray|erase, pts:[x,y,p, ...], c, w, o, sd (spray seed)}
 *   shape: {t:"shape", k: kind, x, y, w, h (line kinds: from (x,y) to (x+w, y+h)), c (stroke or null), sw, f (fill or null), dash, o}
 *   text : {t:"text", s, x, y, size, font, c, b (bold), i (italic), al (l|c|r), sc (outline colour), bgc (box colour), tw, th (measured size)}
 *   img  : {t:"img", src (data URL), x, y, w, h, o}
 */
(function (root) {
	"use strict";
	var I = [1, 0, 0, 1, 0, 0];
	function r2(v) { return Math.round(v * 100) / 100; }
	function fin(v) { return typeof v === "number" && isFinite(v); }

	/* ---------- matrices ---------- */
	function mul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
	function inv(m) { var det = m[0] * m[3] - m[1] * m[2]; if (!det) return I.slice(); var a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det; return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]; }
	function ap(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
	function tr(tx, ty) { return [1, 0, 0, 1, tx, ty]; }
	function scaleAt(sx, sy, cx, cy) { return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy]; }
	function rotateAt(a, cx, cy) { var c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; }
	function mirrorX(cx) { return [-1, 0, 0, 1, 2 * cx, 0]; }
	function mirrorY(cy) { return [1, 0, 0, -1, 0, 2 * cy]; }
	function isId(m) { return !m || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0); }
	function mScale(m) { return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }

	/* ---------- seeded random (spray dots, examples) ---------- */
	function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

	/* ---------- shapes: SVG path data ---------- */
	var SHAPES = [
		["rect", "Rectangle"], ["round", "Rounded box"], ["ellipse", "Circle / ellipse"], ["line", "Line"], ["arrow", "Arrow"], ["arrow2", "Double arrow"],
		["tri", "Triangle"], ["rtri", "Right triangle"], ["diamond", "Diamond"], ["penta", "Pentagon"], ["hexa", "Hexagon"], ["octa", "Octagon"],
		["star", "Star"], ["star6", "Six-point star"], ["burst", "Burst"], ["heart", "Heart"], ["bubble", "Speech bubble"], ["think", "Thought bubble"],
		["cloud", "Cloud"], ["moon", "Moon"], ["bolt", "Lightning"], ["plus", "Plus"], ["check", "Check mark"], ["xmark", "X mark"],
		["blockarrow", "Block arrow"], ["para", "Parallelogram"], ["trap", "Trapezoid"], ["cube", "Cube"], ["cyl", "Cylinder"], ["arc", "Smile curve"]
	];
	var LINE_KINDS = { line: 1, arrow: 1, arrow2: 1 };
	var OPEN_KINDS = { line: 1, arrow: 1, arrow2: 1, check: 1, xmark: 1, arc: 1 };
	function P(x, y) { return r2(x) + " " + r2(y); }
	function poly(pts) { var d = ""; for (var i = 0; i < pts.length; i++) d += (i ? " L " : "M ") + P(pts[i][0], pts[i][1]); return d + " Z"; }
	function regular(n, x, y, w, h, rot) { var a0 = rot === undefined ? -Math.PI / 2 : rot, pts = []; for (var i = 0; i < n; i++) { var a = a0 + i * 2 * Math.PI / n; pts.push([x + w / 2 + w / 2 * Math.cos(a), y + h / 2 + h / 2 * Math.sin(a)]); } return pts; }
	function starPts(n, x, y, w, h, inner) { var pts = []; for (var i = 0; i < n * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 1; pts.push([x + w / 2 + w / 2 * r * Math.cos(a), y + h / 2 + h / 2 * r * Math.sin(a)]); } return pts; }
	function ellD(cx, cy, rx, ry) { return "M " + P(cx - rx, cy) + " A " + r2(rx) + " " + r2(ry) + " 0 1 0 " + P(cx + rx, cy) + " A " + r2(rx) + " " + r2(ry) + " 0 1 0 " + P(cx - rx, cy) + " Z"; }
	function roundRectD(x, y, w, h, r) {
		r = Math.max(0, Math.min(r, w / 2, h / 2));
		return "M " + P(x + r, y) + " H " + r2(x + w - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w, y + r) + " V " + r2(y + h - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w - r, y + h) +
			" H " + r2(x + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x, y + h - r) + " V " + r2(y + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + r, y) + " Z";
	}
	function headD(x1, y1, x2, y2, len) { var a = Math.atan2(y2 - y1, x2 - x1), s = 0.45; return " M " + P(x2 - len * Math.cos(a - s), y2 - len * Math.sin(a - s)) + " L " + P(x2, y2) + " L " + P(x2 - len * Math.cos(a + s), y2 - len * Math.sin(a + s)); }
	function arrowHead(sw) { return Math.max(12, (sw || 4) * 3.6); }
	/* unit-box mapper for the curvy ones (drawn in 0..1) */
	function U(x, y, w, h) { return function (u, v) { return P(x + u * w, y + v * h); }; }
	function norm(o) { var x = o.x, y = o.y, w = o.w, h = o.h; if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; } return { x: x, y: y, w: w, h: h }; }
	function shapeD(k, x, y, w, h, sw) {
		if (LINE_KINDS[k]) {
			var x2 = x + w, y2 = y + h, d = "M " + P(x, y) + " L " + P(x2, y2), hl = arrowHead(sw);
			if (k === "arrow" || k === "arrow2") d += headD(x, y, x2, y2, hl);
			if (k === "arrow2") d += headD(x2, y2, x, y, hl);
			return d;
		}
		var b = norm({ x: x, y: y, w: w, h: h }); x = b.x; y = b.y; w = b.w; h = b.h;
		var u = U(x, y, w, h), cx = x + w / 2, cy = y + h / 2;
		switch (k) {
			case "rect": return "M " + P(x, y) + " H " + r2(x + w) + " V " + r2(y + h) + " H " + r2(x) + " Z";
			case "round": return roundRectD(x, y, w, h, Math.min(w, h) * 0.18);
			case "ellipse": return ellD(cx, cy, w / 2, h / 2);
			case "tri": return poly([[cx, y], [x + w, y + h], [x, y + h]]);
			case "rtri": return poly([[x, y], [x + w, y + h], [x, y + h]]);
			case "diamond": return poly([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]);
			case "penta": return poly(regular(5, x, y, w, h));
			case "hexa": return poly(regular(6, x, y, w, h, 0));
			case "octa": return poly(regular(8, x, y, w, h, Math.PI / 8));
			case "star": return poly(starPts(5, x, y, w, h, 0.42));
			case "star6": return poly(starPts(6, x, y, w, h, 0.58));
			case "burst": return poly(starPts(12, x, y, w, h, 0.72));
			case "heart": return "M " + u(.5, .28) + " C " + u(.5, .18) + " " + u(.42, 0) + " " + u(.25, 0) + " C " + u(.08, 0) + " " + u(0, .14) + " " + u(0, .32) + " C " + u(0, .58) + " " + u(.26, .77) + " " + u(.5, 1) +
				" C " + u(.74, .77) + " " + u(1, .58) + " " + u(1, .32) + " C " + u(1, .14) + " " + u(.92, 0) + " " + u(.75, 0) + " C " + u(.58, 0) + " " + u(.5, .18) + " " + u(.5, .28) + " Z";
			case "bubble": {
				var bh = h * 0.78, r = Math.min(w, bh) * 0.2;
				return "M " + P(x + r, y) + " H " + r2(x + w - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w, y + r) + " V " + r2(y + bh - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w - r, y + bh) +
					" H " + r2(x + w * 0.42) + " L " + P(x + w * 0.2, y + h) + " L " + P(x + w * 0.27, y + bh) + " H " + r2(x + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x, y + bh - r) + " V " + r2(y + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + r, y) + " Z";
			}
			case "think": return cloudD(x, y, w, h * 0.74, 10) + " " + ellD(x + w * 0.24, y + h * 0.84, w * 0.06, h * 0.05) + " " + ellD(x + w * 0.12, y + h * 0.95, w * 0.035, h * 0.03);
			case "cloud": return cloudD(x, y, w, h, 9);
			case "moon": return "M " + u(.62, 0) + " A " + r2(w * .5) + " " + r2(h * .5) + " 0 1 0 " + u(.62, 1) + " A " + r2(w * .4) + " " + r2(h * .42) + " 0 1 1 " + u(.62, 0) + " Z";
			case "bolt": return poly([[x + w * .58, y], [x + w * .12, y + h * .56], [x + w * .45, y + h * .56], [x + w * .34, y + h], [x + w * .88, y + h * .4], [x + w * .54, y + h * .4], [x + w * .7, y]]);
			case "plus": { var t = 0.32; return poly([[x + w * t, y], [x + w * (1 - t), y], [x + w * (1 - t), y + h * t], [x + w, y + h * t], [x + w, y + h * (1 - t)], [x + w * (1 - t), y + h * (1 - t)], [x + w * (1 - t), y + h], [x + w * t, y + h], [x + w * t, y + h * (1 - t)], [x, y + h * (1 - t)], [x, y + h * t], [x + w * t, y + h * t]]); }
			case "check": return "M " + u(0, .55) + " L " + u(.36, .92) + " L " + u(1, .08);
			case "xmark": return "M " + u(0, 0) + " L " + u(1, 1) + " M " + u(1, 0) + " L " + u(0, 1);
			case "blockarrow": return poly([[x, y + h * .3], [x + w * .6, y + h * .3], [x + w * .6, y], [x + w, cy], [x + w * .6, y + h], [x + w * .6, y + h * .7], [x, y + h * .7]]);
			case "para": return poly([[x + w * .25, y], [x + w, y], [x + w * .75, y + h], [x, y + h]]);
			case "trap": return poly([[x + w * .22, y], [x + w * .78, y], [x + w, y + h], [x, y + h]]);
			case "cube": { var dx = w * .28, dy = h * .28; return poly([[x, y + dy], [x + dx, y], [x + w, y], [x + w, y + h - dy], [x + w - dx, y + h], [x, y + h]]) + " M " + P(x, y + dy) + " H " + r2(x + w - dx) + " V " + r2(y + h) + " M " + P(x + w - dx, y + dy) + " L " + P(x + w, y); }
			case "cyl": { var ry = Math.min(h * .14, w * .3); return "M " + P(x, y + ry) + " V " + r2(y + h - ry) + " A " + r2(w / 2) + " " + r2(ry) + " 0 0 0 " + P(x + w, y + h - ry) + " V " + r2(y + ry) + " " + ellD(cx, y + ry, w / 2, ry).replace(/^M/, "M"); }
			case "arc": return "M " + u(0, .1) + " Q " + u(.5, 1.7) + " " + u(1, .1);
		}
		return "M " + P(x, y) + " H " + r2(x + w) + " V " + r2(y + h) + " H " + r2(x) + " Z";
	}
	function cloudD(x, y, w, h, n) {
		var cx = x + w / 2, cy = y + h / 2, rx = w * 0.38, ry = h * 0.32, pts = [];
		for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
		var d = "M " + P(pts[0][0], pts[0][1]);
		for (var j = 0; j < n; j++) { var p = pts[j], q = pts[(j + 1) % n], ma = -Math.PI / 2 + (j + 0.5) * 2 * Math.PI / n; d += " Q " + P(cx + rx * 1.62 * Math.cos(ma), cy + ry * 1.62 * Math.sin(ma)) + " " + P(q[0], q[1]); }
		return d + " Z";
	}

	/* ---------- brushes ---------- */
	var BRUSHES = [
		["pen", "Pen", "Smooth ink that gets thinner when you move fast (or press lightly with a stylus)"],
		["marker", "Marker", "Even, round marker line"],
		["pencil", "Pencil", "Thin, slightly see-through pencil line"],
		["hl", "Highlighter", "See-through, flat-ended highlighter that darkens what is under it"],
		["calli", "Calligraphy", "A slanted nib: thick and thin by direction"],
		["neon", "Neon", "Glowing line"],
		["spray", "Spray", "Spray-paint dots"]
	];
	/* smooth a stroke (two passes of neighbour averaging), keeping the end points */
	function smoothPts(pts, passes) {
		var a = pts.slice(), n = a.length / 3; if (n < 3) return a;
		for (var p = 0; p < (passes || 1); p++) {
			var b = a.slice();
			for (var i = 1; i < n - 1; i++) for (var k = 0; k < 3; k++) b[i * 3 + k] = (a[(i - 1) * 3 + k] + 2 * a[i * 3 + k] + a[(i + 1) * 3 + k]) / 4;
			a = b;
		}
		return a;
	}
	/* drop points closer than `min` to the previous kept one (always keeps the last) */
	function thinPts(pts, min) {
		var n = pts.length / 3; if (n < 3) return pts.slice(); var out = [pts[0], pts[1], pts[2]], lx = pts[0], ly = pts[1];
		for (var i = 1; i < n - 1; i++) { var x = pts[i * 3], y = pts[i * 3 + 1]; if (Math.hypot(x - lx, y - ly) >= min) { out.push(x, y, pts[i * 3 + 2]); lx = x; ly = y; } }
		out.push(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1], pts[(n - 1) * 3 + 2]); return out;
	}
	/* a centre-line path (marker, pencil, highlighter, neon, eraser): quadratic curves through the midpoints */
	function lineD(pts) {
		var n = pts.length / 3; if (!n) return "";
		if (n === 1) return "M " + P(pts[0], pts[1]) + " L " + P(pts[0] + 0.01, pts[1]);
		if (n === 2) return "M " + P(pts[0], pts[1]) + " L " + P(pts[3], pts[4]);
		var d = "M " + P(pts[0], pts[1]);
		for (var i = 1; i < n - 1; i++) { var x = pts[i * 3], y = pts[i * 3 + 1], mx = (x + pts[i * 3 + 3]) / 2, my = (y + pts[i * 3 + 4]) / 2; d += " Q " + P(x, y) + " " + P(mx, my); }
		return d + " L " + P(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1]);
	}
	/* radius at each point: pressure (stylus) or speed (mouse / finger) thinning, calligraphy by direction */
	function radii(pts, w, brush) {
		var n = pts.length / 3, r = new Array(n), havePress = false, i;
		for (i = 0; i < n; i++) { var p = pts[i * 3 + 2]; if (p > 0 && p !== 0.5) { havePress = true; break; } }
		for (i = 0; i < n; i++) {
			var x = pts[i * 3], y = pts[i * 3 + 1], px = i ? pts[i * 3 - 3] : x, py = i ? pts[i * 3 - 2] : y, nx = i < n - 1 ? pts[i * 3 + 3] : x, ny = i < n - 1 ? pts[i * 3 + 4] : y;
			var f;
			if (brush === "calli") { var ang = Math.atan2(ny - py, nx - px); f = 0.12 + 0.88 * Math.abs(Math.sin(ang - Math.PI / 4)); }
			else if (havePress) f = 0.2 + 0.8 * Math.max(0, Math.min(1, pts[i * 3 + 2]));
			else { var v = Math.hypot(nx - px, ny - py) / 2; f = 1 - 0.55 * Math.min(1, v / (w * 2.2 + 4)); }
			r[i] = Math.max(0.35, w / 2 * f);
		}
		if (brush !== "calli") for (var pass = 0; pass < 2; pass++) { var q = r.slice(); for (i = 1; i < n - 1; i++) q[i] = (r[i - 1] + 2 * r[i] + r[i + 1]) / 4; r = q; }
		return r;
	}
	/* filled outline of a variable-width stroke (pen, calligraphy) */
	function outlineD(pts, w, brush) {
		var n = pts.length / 3; if (!n) return "";
		var r = radii(pts, w, brush);
		if (n === 1 || (n === 2 && Math.hypot(pts[3] - pts[0], pts[4] - pts[1]) < 0.5)) return ellD(pts[0], pts[1], r[0], r[0]);
		var L = [], R = [], i;
		for (i = 0; i < n; i++) {
			var x = pts[i * 3], y = pts[i * 3 + 1], px = i ? pts[i * 3 - 3] : x, py = i ? pts[i * 3 - 2] : y, nx = i < n - 1 ? pts[i * 3 + 3] : x, ny = i < n - 1 ? pts[i * 3 + 4] : y;
			var tx = nx - px, ty = ny - py, tl = Math.hypot(tx, ty) || 1, ox, oy;
			ox = -ty / tl; oy = tx / tl;
			L.push([x + ox * r[i], y + oy * r[i]]); R.push([x - ox * r[i], y - oy * r[i]]);
		}
		var d = "M " + P(L[0][0], L[0][1]);
		for (i = 1; i < n; i++) d += " L " + P(L[i][0], L[i][1]);
		var re = r[n - 1], rs = r[0];
		d += " A " + r2(re) + " " + r2(re) + " 0 0 1 " + P(R[n - 1][0], R[n - 1][1]);
		for (i = n - 2; i >= 0; i--) d += " L " + P(R[i][0], R[i][1]);
		d += " A " + r2(rs) + " " + r2(rs) + " 0 0 1 " + P(L[0][0], L[0][1]) + " Z";
		return d;
	}
	/* spray: deterministic dots around every point (the seed is stored, so the dots are the same every time it is drawn) */
	function sprayD(pts, w, sd) {
		var n = pts.length / 3, rnd = rng(sd || 1), d = "", dot = Math.max(0.8, w / 18), per = Math.max(4, Math.round(w * 0.9));
		for (var i = 0; i < n; i++) {
			var x = pts[i * 3], y = pts[i * 3 + 1];
			for (var k = 0; k < per; k++) { var a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * w / 2, dx = x + Math.cos(a) * rr, dy = y + Math.sin(a) * rr; d += "M " + P(dx, dy) + " h " + r2(dot) + " v " + r2(dot) + " h " + r2(-dot) + " Z "; }
		}
		return d.trim();
	}
	function isFilledBrush(b) { return b === "pen" || b === "calli" || b === "spray"; }
	function pathD(o) {
		if (o.brush === "pen" || o.brush === "calli") return outlineD(o.pts, o.w, o.brush);
		if (o.brush === "spray") return sprayD(o.pts, o.w, o.sd);
		return lineD(o.pts);
	}
	function objD(o) { if (o.t === "path") return pathD(o); if (o.t === "shape") return shapeD(o.k, o.x, o.y, o.w, o.h, o.sw); return ""; }

	/* ---------- bounding boxes ---------- */
	function estText(o) { var lines = String(o.s || "").split("\n"), mx = 0; lines.forEach(function (l) { mx = Math.max(mx, Array.from(l).length); }); return { w: Math.max(o.size * 0.4, mx * o.size * 0.58), h: lines.length * o.size * 1.2 }; }
	function localBox(o) {
		var x0, y0, x1, y1, pad = 0;
		if (o.t === "path") {
			x0 = y0 = Infinity; x1 = y1 = -Infinity;
			for (var i = 0; i < o.pts.length; i += 3) { var x = o.pts[i], y = o.pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
			pad = o.w / 2 + (o.brush === "neon" ? o.w : 0) + 1;
		} else if (o.t === "shape") {
			var b = norm(o); x0 = b.x; y0 = b.y; x1 = b.x + b.w; y1 = b.y + b.h;
			pad = (o.c ? (o.sw || 0) / 2 : 0) + (o.k === "arrow" || o.k === "arrow2" ? arrowHead(o.sw) * 0.5 : 0) + (o.k === "arc" ? 0 : 0);
			if (o.k === "arc") y1 = b.y + b.h * 0.95;
		} else if (o.t === "text") {
			var e = o.tw ? { w: o.tw, h: o.th } : estText(o), ox = o.al === "c" ? -e.w / 2 : o.al === "r" ? -e.w : 0;
			x0 = o.x + ox; y0 = o.y; x1 = x0 + e.w; y1 = o.y + e.h; pad = o.sc ? Math.max(2, o.size * 0.06) : 0; if (o.bgc) pad += o.size * 0.25;
		} else { x0 = o.x; y0 = o.y; x1 = o.x + o.w; y1 = o.y + o.h; }
		if (!isFinite(x0)) { x0 = y0 = x1 = y1 = 0; }
		return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
	}
	function boxCorners(b) { return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]; }
	function worldBox(o) {
		var b = localBox(o), m = o.m || I, xs = [], ys = [];
		boxCorners(b).forEach(function (c) { var p = ap(m, c[0], c[1]); xs.push(p[0]); ys.push(p[1]); });
		var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
		return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
	}
	function unionBox(list) {
		if (!list.length) return null; var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		list.forEach(function (o) { var b = worldBox(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}
	function boxesTouch(a, b) { return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h; }
	function boxInside(a, b) { return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h; }

	/* ---------- hit maths ---------- */
	function distSeg(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
	function distPolyline(pts, x, y) { var n = pts.length / 3, best = Infinity; if (n === 1) return Math.hypot(x - pts[0], y - pts[1]); for (var i = 0; i < n - 1; i++) best = Math.min(best, distSeg(x, y, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 3], pts[i * 3 + 4])); return best; }

	/* ---------- paper ---------- */
	var PAPERS = [["none", "Plain"], ["grid", "Grid"], ["dots", "Dot grid"], ["lined", "Lined paper"], ["graph", "Graph paper"], ["iso", "Isometric dots"], ["music", "Music staff"], ["hex", "Hexagons"]];
	/* returns layers [{d, stroke|fill, sw}] for a w x h page */
	function paper(p, w, h) {
		var out = [], d = "", x, y, s;
		if (p === "grid") { s = 40; for (x = s; x < w; x += s) d += "M " + x + " 0 V " + h + " "; for (y = s; y < h; y += s) d += "M 0 " + y + " H " + w + " "; out.push({ d: d.trim(), stroke: "#c9d6e4", sw: 1 }); }
		else if (p === "graph") {
			s = 10; var d2 = ""; for (x = s; x < w; x += s) (x % 50 ? (d += "M " + x + " 0 V " + h + " ") : (d2 += "M " + x + " 0 V " + h + " ")); for (y = s; y < h; y += s) (y % 50 ? (d += "M 0 " + y + " H " + w + " ") : (d2 += "M 0 " + y + " H " + w + " "));
			out.push({ d: d.trim(), stroke: "#d7e6d9", sw: 0.6 }); out.push({ d: d2.trim(), stroke: "#9fc3a6", sw: 1.2 });
		}
		else if (p === "dots") { s = 30; var r = 1.8; for (y = s; y < h; y += s) for (x = s; x < w; x += s) d += ellD(x, y, r, r) + " "; out.push({ d: d.trim(), fill: "#a9b4c2" }); }
		else if (p === "iso") { s = 34; var rr = 1.7, row = 0; for (y = s * 0.6; y < h; y += s * 0.866, row++) for (x = (row % 2 ? s / 2 : 0) + s / 2; x < w; x += s) d += ellD(x, y, rr, rr) + " "; out.push({ d: d.trim(), fill: "#a9b4c2" }); }
		else if (p === "lined") { s = 36; for (y = s * 2.5; y < h; y += s) d += "M 0 " + r2(y) + " H " + w + " "; out.push({ d: d.trim(), stroke: "#a9c7ea", sw: 1.2 }); out.push({ d: "M 90 0 V " + h, stroke: "#ef9a9a", sw: 1.5 }); }
		else if (p === "music") { s = 12; var gap = 110; for (var top = 70; top + 4 * s < h - 30; top += gap) for (var k = 0; k < 5; k++) d += "M 50 " + (top + k * s) + " H " + (w - 50) + " "; out.push({ d: d.trim(), stroke: "#7d8794", sw: 1.1 }); }
		else if (p === "hex") { s = 26; var hh = s * Math.sqrt(3), c = 0; for (x = 0; x < w + s * 2; x += s * 1.5, c++) for (y = (c % 2 ? hh / 2 : 0); y < h + hh; y += hh) d += poly(regular(6, x - s, y - hh / 2, s * 2, hh, 0)) + " "; out.push({ d: d.trim(), stroke: "#cfd8e3", sw: 1 }); }
		return out;
	}

	/* ---------- page sizes ---------- */
	var SIZES = [["screen", "Screen (1600 × 1000)", 1600, 1000], ["square", "Square post (1080 × 1080)", 1080, 1080], ["thumb", "YouTube thumbnail (1280 × 720)", 1280, 720],
		["icon", "App icon (512 × 512)", 512, 512], ["story", "Phone story (1080 × 1920)", 1080, 1920], ["a4", "A4 page (1240 × 1754)", 1240, 1754], ["letter", "US Letter (1275 × 1650)", 1275, 1650],
		["banner", "Banner (1500 × 500)", 1500, 500], ["card", "Card (1500 × 1050)", 1500, 1050]];

	/* ---------- SVG writer ---------- */
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function mAttr(m) { return isId(m) ? "" : ' transform="matrix(' + m.map(r2).join(" ") + ')"'; }
	function fontStack(f) { return f || "Arial, Helvetica, sans-serif"; }
	function objSVG(o, idn) {
		var op = o.o !== undefined && o.o < 1 ? ' opacity="' + r2(o.o) + '"' : "", tf = mAttr(o.m);
		if (o.t === "path") {
			var d = esc(pathD(o));
			if (isFilledBrush(o.brush)) return '<path d="' + d + '" fill="' + esc(o.c) + '"' + op + tf + "/>";
			var cap = o.brush === "hl" ? "butt" : "round", extra = o.brush === "hl" ? ' style="mix-blend-mode:multiply"' : "", w = o.w, opa = o.brush === "pencil" ? ' opacity="' + r2((o.o === undefined ? 1 : o.o) * 0.85) + '"' : op;
			if (o.brush === "neon") return '<g' + tf + op + '><path d="' + d + '" fill="none" stroke="' + esc(o.c) + '" stroke-width="' + r2(w) + '" stroke-linecap="round" stroke-linejoin="round" filter="url(#mesglow)"/><path d="' + d + '" fill="none" stroke="#ffffff" stroke-width="' + r2(Math.max(1, w * 0.35)) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></g>';
			return '<path d="' + d + '" fill="none" stroke="' + esc(o.c) + '" stroke-width="' + r2(w) + '" stroke-linecap="' + cap + '" stroke-linejoin="round"' + opa + extra + tf + "/>";
		}
		if (o.t === "shape") {
			var dd = esc(shapeD(o.k, o.x, o.y, o.w, o.h, o.sw)), fill = o.f && !OPEN_KINDS[o.k] ? esc(o.f) : "none", st = o.c ? ' stroke="' + esc(o.c) + '" stroke-width="' + r2(o.sw || 1) + '" stroke-linecap="round" stroke-linejoin="round"' + (o.dash ? ' stroke-dasharray="' + r2((o.sw || 1) * 3) + " " + r2((o.sw || 1) * 2) + '"' : "") : "";
			return '<path d="' + dd + '" fill="' + fill + '"' + st + op + tf + "/>";
		}
		if (o.t === "text") {
			var lines = String(o.s).split("\n"), anc = o.al === "c" ? "middle" : o.al === "r" ? "end" : "start", lh = o.size * 1.2, out = "";
			var b = o.tw ? { w: o.tw, h: o.th } : estText(o);
			if (o.bgc) { var bx = o.x + (o.al === "c" ? -b.w / 2 : o.al === "r" ? -b.w : 0), pad = o.size * 0.25; out += '<rect x="' + r2(bx - pad) + '" y="' + r2(o.y - pad) + '" width="' + r2(b.w + 2 * pad) + '" height="' + r2(b.h + 2 * pad) + '" rx="' + r2(pad) + '" fill="' + esc(o.bgc) + '"/>'; }
			var attrs = ' font-family="' + esc(fontStack(o.font)) + '" font-size="' + r2(o.size) + '"' + (o.b ? ' font-weight="700"' : "") + (o.i ? ' font-style="italic"' : "") + ' text-anchor="' + anc + '" fill="' + esc(o.c) + '"' +
				(o.sc ? ' stroke="' + esc(o.sc) + '" stroke-width="' + r2(Math.max(2, o.size * 0.08)) + '" paint-order="stroke" stroke-linejoin="round"' : "");
			out += "<text" + attrs + ">" + lines.map(function (l, i) { return '<tspan x="' + r2(o.x) + '" y="' + r2(o.y + i * lh + o.size * 0.92) + '">' + esc(l) + "</tspan>"; }).join("") + "</text>";
			return "<g" + tf + op + ">" + out + "</g>";
		}
		if (o.t === "img") return '<image href="' + esc(o.src) + '" x="' + r2(o.x) + '" y="' + r2(o.y) + '" width="' + r2(o.w) + '" height="' + r2(o.h) + '" preserveAspectRatio="none"' + op + tf + "/>";
		return "";
	}
	/* opts: {bg: true (draw the background colour), paper: true (draw the pattern)} */
	function toSVG(doc, opts) {
		opts = opts || {}; var W = doc.w, H = doc.h, defs = '<filter id="mesglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>', body = "", maskN = 0;
		var back = "";
		if (opts.bg !== false && doc.bg && doc.bg.c) back += '<rect width="' + W + '" height="' + H + '" fill="' + esc(doc.bg.c) + '"/>';
		if (opts.paper !== false && doc.bg && doc.bg.p && doc.bg.p !== "none") paper(doc.bg.p, W, H).forEach(function (l) { back += '<path d="' + l.d + '" ' + (l.fill ? 'fill="' + l.fill + '"' : 'fill="none" stroke="' + l.stroke + '" stroke-width="' + l.sw + '"') + "/>"; });
		(doc.objs || []).forEach(function (o) {
			if (o.t === "path" && o.brush === "erase") {
				var id = "mesm" + (++maskN);
				defs += '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/><path d="' + esc(lineD(o.pts)) + '" fill="none" stroke="#000" stroke-width="' + r2(o.w) + '" stroke-linecap="round" stroke-linejoin="round"' + mAttr(o.m) + "/></mask>";
				body = '<g mask="url(#' + id + ')">' + body + "</g>";
			} else body += objSVG(o);
		});
		return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '"><defs>' + defs + "</defs>" + back + body + "</svg>";
	}

	/* ---------- building blocks for templates ---------- */
	function S(k, x, y, w, h, o) { o = o || {}; return { t: "shape", k: k, x: x, y: y, w: w, h: h, c: o.c === undefined ? "#1e1e1e" : o.c, sw: o.sw === undefined ? 4 : o.sw, f: o.f === undefined ? null : o.f, dash: !!o.dash, o: o.o === undefined ? 1 : o.o, m: o.m || I.slice() }; }
	function T(s, x, y, size, o) { o = o || {}; return { t: "text", s: s, x: x, y: y, size: size, font: o.font || "Arial, Helvetica, sans-serif", c: o.c || "#1e1e1e", b: !!o.b, i: !!o.i, al: o.al || "l", sc: o.sc || null, bgc: o.bgc || null, o: 1, m: o.m || I.slice() }; }
	function E(ch, x, y, size, o) { var t = T(ch, x, y, size, o); t.font = "\"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif"; t.al = "c"; return t; }
	function Pth(pts, w, c, brush) { var a = []; pts.forEach(function (p) { a.push(p[0], p[1], 0.5); }); return { t: "path", brush: brush || "marker", pts: a, c: c, w: w, o: 1, m: I.slice() }; }
	function arcPts(cx, cy, r, a0, a1, n) { var out = []; for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out; }
	function doc(w, h, objs, bg, p) { return { w: w, h: h, bg: { c: bg === undefined ? "#ffffff" : bg, p: p || "none" }, objs: objs || [] }; }
	var OUT = { c: "#1e1e1e", sw: 4, f: "#ffffff" }; // coloring-page outlines

	var TEMPLATES = [
		/* paper */
		{ id: "blank", cat: "Paper", name: "Blank page", make: function () { return doc(1600, 1000, []); } },
		{ id: "grid", cat: "Paper", name: "Grid paper", make: function () { return doc(1600, 1000, [], "#ffffff", "grid"); } },
		{ id: "dots", cat: "Paper", name: "Dot grid", make: function () { return doc(1600, 1000, [], "#ffffff", "dots"); } },
		{ id: "lined", cat: "Paper", name: "Lined paper", make: function () { return doc(1240, 1754, [], "#ffffff", "lined"); } },
		{ id: "graph", cat: "Paper", name: "Graph paper", make: function () { return doc(1240, 1754, [], "#ffffff", "graph"); } },
		{ id: "iso", cat: "Paper", name: "Isometric dots", make: function () { return doc(1600, 1000, [], "#ffffff", "iso"); } },
		{ id: "music", cat: "Paper", name: "Music staff", make: function () { return doc(1240, 1754, [], "#ffffff", "music"); } },
		{ id: "chalk", cat: "Paper", name: "Chalkboard", make: function () { return doc(1600, 1000, [T("Today's lesson", 80, 60, 64, { c: "#f1f3ee", font: "\"Comic Sans MS\", \"Chalkboard SE\", cursive" })], "#25443a"); } },
		{ id: "transparent", cat: "Paper", name: "Transparent (for stickers)", make: function () { return doc(1000, 1000, [], null); } },
		/* layouts */
		{ id: "comic3", cat: "Layouts", name: "Comic strip (3 panels)", make: function () { return doc(1800, 640, [S("rect", 30, 30, 560, 580, { sw: 6 }), S("rect", 620, 30, 560, 580, { sw: 6 }), S("rect", 1210, 30, 560, 580, { sw: 6 }), S("bubble", 70, 60, 300, 170, { sw: 4, f: "#ffffff" })]); } },
		{ id: "comic6", cat: "Layouts", name: "Comic page (6 panels)", make: function () { var o = [], W = 1240, H = 1754; for (var r = 0; r < 3; r++) for (var c = 0; c < 2; c++) o.push(S("rect", 40 + c * 590, 40 + r * 560, 570, 540, { sw: 6 })); return doc(W, H, o); } },
		{ id: "story", cat: "Layouts", name: "Storyboard (6 frames)", make: function () { var o = [], i; for (i = 0; i < 6; i++) { var c = i % 3, r = Math.floor(i / 3), x = 50 + c * 510, y = 60 + r * 470; o.push(S("rect", x, y, 470, 280, { sw: 4 })); o.push(T((i + 1) + ".", x, y + 300, 30, { b: true })); o.push(S("line", x + 40, y + 340, 430, 0, { sw: 2, c: "#9aa3ad" })); o.push(S("line", x, y + 385, 470, 0, { sw: 2, c: "#9aa3ad" })); } return doc(1600, 1000, o); } },
		{ id: "mind", cat: "Layouts", name: "Mind map", make: function () {
			var o = [], cx = 800, cy = 500, cols = ["#e03131", "#f08c00", "#2f9e44", "#1971c2", "#7048e8", "#c2255c"];
			for (var i = 0; i < 6; i++) { var a = -Math.PI / 2 + i * Math.PI / 3, x = cx + Math.cos(a) * 360, y = cy + Math.sin(a) * 300; o.push(Pth([[cx, cy], [(cx + x) / 2 + Math.sin(a) * 30, (cy + y) / 2 - Math.cos(a) * 30], [x, y]], 6, cols[i])); o.push(S("round", x - 120, y - 45, 240, 90, { c: cols[i], sw: 4, f: "#ffffff" })); o.push(T("Idea " + (i + 1), x, y - 18, 32, { al: "c", c: cols[i], b: true })); }
			o.push(S("ellipse", cx - 170, cy - 80, 340, 160, { c: "#1e1e1e", sw: 5, f: "#fff3bf" })); o.push(T("Main topic", cx, cy - 22, 44, { al: "c", b: true })); return doc(1600, 1000, o);
		} },
		{ id: "flow", cat: "Layouts", name: "Flowchart", make: function () {
			return doc(1600, 1000, [S("ellipse", 650, 40, 300, 110, { f: "#d3f9d8", c: "#2f9e44" }), T("Start", 800, 75, 36, { al: "c", b: true }), S("arrow", 800, 150, 0, 70, { sw: 4 }),
				S("rect", 625, 230, 350, 120, { f: "#d0ebff", c: "#1971c2" }), T("Do something", 800, 270, 34, { al: "c" }), S("arrow", 800, 350, 0, 70, { sw: 4 }),
				S("diamond", 610, 430, 380, 200, { f: "#fff3bf", c: "#f08c00" }), T("Yes or no?", 800, 510, 34, { al: "c" }), S("arrow", 990, 530, 200, 0, { sw: 4 }), T("No", 1060, 480, 28, {}),
				S("rect", 1200, 470, 300, 120, { f: "#ffe3e3", c: "#e03131" }), T("Fix it", 1350, 510, 34, { al: "c" }), S("arrow", 800, 630, 0, 90, { sw: 4 }), T("Yes", 820, 655, 28, {}),
				S("ellipse", 650, 730, 300, 110, { f: "#d3f9d8", c: "#2f9e44" }), T("End", 800, 765, 36, { al: "c", b: true })]);
		} },
		{ id: "venn2", cat: "Layouts", name: "Venn diagram (2 sets)", make: function () { return doc(1600, 1000, [S("ellipse", 330, 180, 620, 620, { c: "#1971c2", sw: 5, f: "#4dabf7", o: 0.45 }), S("ellipse", 650, 180, 620, 620, { c: "#e03131", sw: 5, f: "#ff8787", o: 0.45 }), T("A", 470, 110, 56, { b: true, c: "#1971c2" }), T("B", 1080, 110, 56, { b: true, c: "#e03131" }), T("Both", 800, 460, 40, { al: "c", b: true })]); } },
		{ id: "venn3", cat: "Layouts", name: "Venn diagram (3 sets)", make: function () { return doc(1600, 1000, [S("ellipse", 420, 80, 520, 520, { c: "#1971c2", sw: 5, f: "#4dabf7", o: 0.4 }), S("ellipse", 660, 80, 520, 520, { c: "#e03131", sw: 5, f: "#ff8787", o: 0.4 }), S("ellipse", 540, 400, 520, 520, { c: "#2f9e44", sw: 5, f: "#69db7c", o: 0.4 }), T("A", 400, 80, 52, { b: true, c: "#1971c2" }), T("B", 1170, 80, 52, { b: true, c: "#e03131" }), T("C", 1080, 860, 52, { b: true, c: "#2f9e44" })]); } },
		{ id: "axes", cat: "Layouts", name: "Coordinate plane", make: function () {
			var o = [], cx = 800, cy = 500, s = 50, i;
			for (i = -14; i <= 14; i++) if (i) { o.push(S("line", cx + i * s, 40, 0, 920, { c: "#dbe4ee", sw: 1.5 })); }
			for (i = -8; i <= 8; i++) if (i) { o.push(S("line", 60, cy + i * s, 1480, 0, { c: "#dbe4ee", sw: 1.5 })); }
			o.push(S("arrow2", 50, cy, 1500, 0, { sw: 3 })); o.push(S("arrow2", cx, 30, 0, 940, { sw: 3 })); o.push(T("x", 1520, cy + 12, 34, { i: true })); o.push(T("y", cx + 16, 24, 34, { i: true }));
			for (i = -14; i <= 14; i += 2) if (i) o.push(T(String(i), cx + i * s, cy + 12, 20, { al: "c", c: "#59616d" }));
			for (i = -8; i <= 8; i += 2) if (i) o.push(T(String(-i), cx - 14, cy + i * s - 11, 20, { al: "r", c: "#59616d" }));
			return doc(1600, 1000, o);
		} },
		{ id: "ttt", cat: "Layouts", name: "Tic-tac-toe", make: function () { return doc(1000, 1000, [S("line", 380, 120, 0, 760, { sw: 12 }), S("line", 620, 120, 0, 760, { sw: 12 }), S("line", 120, 380, 760, 0, { sw: 12 }), S("line", 120, 620, 760, 0, { sw: 12 })]); } },
		{ id: "week", cat: "Layouts", name: "Weekly planner", make: function () { var o = [T("This week", 50, 30, 56, { b: true })], days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; days.forEach(function (d, i) { var x = 40 + i * 217; o.push(S("round", x, 120, 205, 840, { sw: 3, c: "#7d8794", f: i > 4 ? "#f1f3f5" : "#ffffff" })); o.push(T(d, x + 102, 140, 34, { al: "c", b: true })); }); return doc(1600, 1000, o); } },
		{ id: "todo", cat: "Layouts", name: "To-do list", make: function () { var o = [T("To do", 90, 70, 72, { b: true })]; for (var i = 0; i < 10; i++) { o.push(S("round", 90, 200 + i * 140, 70, 70, { sw: 4 })); o.push(S("line", 200, 265 + i * 140, 900, 0, { sw: 2, c: "#adb5bd" })); } return doc(1240, 1754, o); } },
		/* sizes with a starting design */
		{ id: "thumbnail", cat: "Designs", name: "YouTube thumbnail", make: function () { return doc(1280, 720, [S("rect", 0, 0, 1280, 720, { c: null, f: "#1c7ed6" }), S("burst", 860, 120, 420, 420, { c: null, f: "#ffd43b" }), E("😮", 1070, 230, 200), T("YOUR TITLE\nHERE", 70, 170, 130, { b: true, c: "#ffffff", sc: "#111111", font: "Impact, \"Arial Black\", sans-serif" })], "#1c7ed6"); } },
		{ id: "appicon", cat: "Designs", name: "App icon", make: function () { return doc(512, 512, [S("round", 0, 0, 512, 512, { c: null, f: "#7048e8" }), E("⭐", 256, 120, 270)], null); } },
		{ id: "meme", cat: "Designs", name: "Meme (top / bottom text)", make: function () { return doc(1080, 1080, [S("rect", 40, 40, 1000, 1000, { c: "#adb5bd", sw: 3, dash: true }), T("TOP TEXT", 540, 70, 110, { al: "c", b: true, c: "#ffffff", sc: "#000000", font: "Impact, \"Arial Black\", sans-serif" }), T("BOTTOM TEXT", 540, 880, 110, { al: "c", b: true, c: "#ffffff", sc: "#000000", font: "Impact, \"Arial Black\", sans-serif" })], "#dee2e6"); } },
		{ id: "bday", cat: "Designs", name: "Birthday card", make: function () {
			var o = [S("rect", 30, 30, 1440, 990, { c: "#e64980", sw: 10, f: null })], cols = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#b197fc"];
			cols.forEach(function (c, i) { var x = 120 + i * 85, y = 110 + (i % 2) * 70; o.push(Pth([[x + 50, y + 125], [x + 40, y + 260], [x + 75, y + 420]], 3, "#868e96")); o.push(S("ellipse", x, y, 100, 125, { c: null, f: c })); });
			o.push(T("Happy Birthday!", 980, 300, 110, { al: "c", b: true, c: "#e64980", font: "\"Comic Sans MS\", \"Chalkboard SE\", cursive" })); o.push(E("🎂", 980, 520, 260)); o.push(E("🎉", 1330, 120, 120)); return doc(1500, 1050, o, "#fff9db");
		} },
		{ id: "cert", cat: "Designs", name: "Certificate", make: function () { return doc(1600, 1130, [S("rect", 40, 40, 1520, 1050, { c: "#b08b2e", sw: 14 }), S("rect", 80, 80, 1440, 970, { c: "#d4b86a", sw: 4 }), T("Certificate of Achievement", 800, 180, 80, { al: "c", b: true, c: "#5c4813", font: "Georgia, \"Times New Roman\", serif" }), T("presented to", 800, 380, 40, { al: "c", i: true, c: "#5c4813", font: "Georgia, serif" }), T("Your Name", 800, 470, 96, { al: "c", c: "#1e1e1e", font: "\"Brush Script MT\", \"Snell Roundhand\", cursive" }), S("line", 450, 600, 700, 0, { c: "#b08b2e", sw: 3 }), T("for great work", 800, 650, 40, { al: "c", c: "#5c4813", font: "Georgia, serif" }), S("star", 720, 790, 160, 160, { c: "#b08b2e", sw: 4, f: "#ffd43b" })], "#fffbf0"); } },
		{ id: "poster", cat: "Designs", name: "Event poster", make: function () { return doc(1240, 1754, [S("rect", 0, 0, 1240, 640, { c: null, f: "#212529" }), T("BIG EVENT", 620, 170, 150, { al: "c", b: true, c: "#ffd43b", font: "Impact, \"Arial Black\", sans-serif" }), T("Saturday · 7 pm", 620, 380, 64, { al: "c", c: "#ffffff" }), E("🎸", 620, 760, 360), T("Free entry · Bring a friend", 620, 1350, 56, { al: "c", b: true }), T("Where: your place here", 620, 1460, 44, { al: "c", c: "#495057" })], "#f8f9fa"); } },
		/* examples (made of shapes, so every part can be moved, resized or recoloured) */
		{ id: "house", cat: "Examples", name: "House and sun", make: function () {
			return doc(1600, 1000, [S("rect", 0, 0, 1600, 1000, { c: null, f: "#d0ebff" }), S("ellipse", 1250, 80, 200, 200, { c: null, f: "#ffd43b" }), S("cloud", 160, 90, 330, 170, { c: null, f: "#ffffff" }), S("cloud", 700, 140, 260, 130, { c: null, f: "#ffffff" }),
				S("rect", 0, 760, 1600, 240, { c: null, f: "#69db7c" }), S("rect", 520, 470, 520, 340, { f: "#ffc078", c: "#7a4a05", sw: 5 }), S("tri", 470, 250, 620, 230, { f: "#e8590c", c: "#7a4a05", sw: 5 }),
				S("rect", 735, 610, 110, 200, { f: "#8c5a2b", c: "#5c3a12", sw: 4 }), S("rect", 580, 540, 110, 100, { f: "#e7f5ff", c: "#5c3a12", sw: 4 }), S("rect", 890, 540, 110, 100, { f: "#e7f5ff", c: "#5c3a12", sw: 4 }),
				S("rect", 1240, 600, 50, 200, { c: null, f: "#8c5a2b" }), S("ellipse", 1150, 420, 230, 230, { c: null, f: "#2f9e44" })], "#d0ebff");
		} },
		{ id: "smiley", cat: "Examples", name: "Smiley face", make: function () { return doc(1000, 1000, [S("ellipse", 150, 150, 700, 700, { f: "#ffd43b", c: "#e67700", sw: 10 }), S("ellipse", 330, 340, 90, 140, { c: null, f: "#1e1e1e" }), S("ellipse", 580, 340, 90, 140, { c: null, f: "#1e1e1e" }), Pth(arcPts(500, 470, 230, 0.35, Math.PI - 0.35, 24), 26, "#1e1e1e", "marker")]); } },
		{ id: "flower", cat: "Examples", name: "Flower", make: function () {
			var o = [Pth([[500, 560], [520, 720], [490, 950]], 18, "#2f9e44"), S("ellipse", 330, 720, 170, 70, { c: null, f: "#40c057", m: rotateAt(-0.5, 415, 755) }), S("ellipse", 520, 780, 170, 70, { c: null, f: "#40c057", m: rotateAt(0.5, 605, 815) })];
			for (var i = 0; i < 8; i++) o.push(S("ellipse", 455, 200, 90, 220, { c: "#c2255c", sw: 3, f: "#f783ac", m: rotateAt(i * Math.PI / 4, 500, 420) }));
			o.push(S("ellipse", 410, 330, 180, 180, { c: "#e67700", sw: 4, f: "#ffd43b" })); return doc(1000, 1000, o);
		} },
		{ id: "rocket", cat: "Examples", name: "Rocket", make: function () { return doc(1000, 1000, [S("tri", 340, 640, 120, 200, { f: "#e03131", c: "#1e1e1e", m: I.slice() }), S("tri", 540, 640, 120, 200, { f: "#e03131", c: "#1e1e1e" }), S("round", 400, 300, 200, 520, { f: "#e9ecef", c: "#1e1e1e" }), S("tri", 400, 120, 200, 220, { f: "#e03131", c: "#1e1e1e" }), S("ellipse", 440, 400, 120, 120, { f: "#74c0fc", c: "#1e1e1e", sw: 6 }), S("tri", 430, 820, 140, 140, { c: null, f: "#ff922b", m: mirrorY(890) }), S("star", 120, 120, 70, 70, { c: null, f: "#ffd43b" }), S("star", 800, 220, 50, 50, { c: null, f: "#ffd43b" }), S("star", 760, 700, 60, 60, { c: null, f: "#ffd43b" })], "#1c2541"); } },
		{ id: "snowman", cat: "Examples", name: "Snowman", make: function () { return doc(1000, 1000, [S("rect", 0, 820, 1000, 180, { c: null, f: "#ffffff" }), S("ellipse", 320, 560, 360, 340, { f: "#ffffff", c: "#a5b4c4" }), S("ellipse", 365, 350, 270, 250, { f: "#ffffff", c: "#a5b4c4" }), S("ellipse", 400, 170, 200, 200, { f: "#ffffff", c: "#a5b4c4" }), S("rect", 410, 60, 180, 120, { c: null, f: "#212529" }), S("rect", 370, 165, 260, 25, { c: null, f: "#212529" }), S("ellipse", 455, 235, 22, 26, { c: null, f: "#212529" }), S("ellipse", 525, 235, 22, 26, { c: null, f: "#212529" }), S("tri", 500, 265, 110, 34, { c: null, f: "#fd7e14", m: rotateAt(Math.PI / 2, 555, 282) }), S("ellipse", 488, 420, 24, 24, { c: null, f: "#212529" }), S("ellipse", 488, 480, 24, 24, { c: null, f: "#212529" })], "#a5d8ff"); } },
		{ id: "cat", cat: "Examples", name: "Cat face", make: function () { return doc(1000, 1000, [S("tri", 220, 170, 200, 260, { f: "#ffa94d", c: "#1e1e1e" }), S("tri", 580, 170, 200, 260, { f: "#ffa94d", c: "#1e1e1e" }), S("ellipse", 180, 280, 640, 560, { f: "#ffa94d", c: "#1e1e1e" }), S("ellipse", 340, 470, 80, 110, { c: null, f: "#2b8a3e" }), S("ellipse", 580, 470, 80, 110, { c: null, f: "#2b8a3e" }), S("tri", 465, 620, 70, 50, { c: null, f: "#f06595", m: mirrorY(645) }), S("line", 200, 640, 220, 20, { sw: 4 }), S("line", 200, 700, 220, -10, { sw: 4 }), S("line", 800, 640, -220, 20, { sw: 4 }), S("line", 800, 700, -220, -10, { sw: 4 })]); } },
		{ id: "land", cat: "Examples", name: "Mountain landscape", make: function () { return doc(1600, 1000, [S("rect", 0, 0, 1600, 1000, { c: null, f: "#ffe8cc" }), S("ellipse", 650, 140, 300, 300, { c: null, f: "#ff922b" }), S("tri", -100, 260, 900, 600, { c: null, f: "#5c7cfa" }), S("tri", 500, 200, 900, 660, { c: null, f: "#4263eb" }), S("tri", 1000, 330, 800, 530, { c: null, f: "#748ffc" }), S("rect", 0, 820, 1600, 180, { c: null, f: "#2b8a3e" }), S("ellipse", 300, 860, 600, 90, { c: null, f: "#74c0fc" }), S("tri", 1180, 600, 160, 260, { c: null, f: "#2f9e44" }), S("rect", 1245, 850, 30, 60, { c: null, f: "#5c3a12" }), S("tri", 1350, 640, 130, 220, { c: null, f: "#37b24d" }), S("rect", 1400, 850, 30, 60, { c: null, f: "#5c3a12" })], "#ffe8cc"); } },
		/* coloring pages (outlines only: colour them in with the paint bucket) */
		{ id: "mandala", cat: "Coloring", name: "Mandala", make: function () {
			var o = [], cx = 500, cy = 500, i;
			for (i = 0; i < 16; i++) o.push(S("ellipse", cx - 45, cy - 470, 90, 200, { c: "#1e1e1e", sw: 3, f: "#ffffff", m: rotateAt(i * Math.PI / 8, cx, cy) }));
			for (i = 0; i < 12; i++) o.push(S("ellipse", cx - 55, cy - 330, 110, 190, { c: "#1e1e1e", sw: 3, f: "#ffffff", m: rotateAt(i * Math.PI / 6 + Math.PI / 12, cx, cy) }));
			for (i = 0; i < 8; i++) o.push(S("heart", cx - 60, cy - 220, 120, 130, { c: "#1e1e1e", sw: 3, f: "#ffffff", m: rotateAt(i * Math.PI / 4, cx, cy) }));
			o.push(S("star6", cx - 95, cy - 95, 190, 190, { c: "#1e1e1e", sw: 3, f: "#ffffff" })); o.push(S("ellipse", cx - 40, cy - 40, 80, 80, { c: "#1e1e1e", sw: 3, f: "#ffffff" }));
			return doc(1000, 1000, o);
		} },
		{ id: "fish", cat: "Coloring", name: "Fish", make: function () { return doc(1200, 800, [S("tri", 820, 230, 300, 340, { c: OUT.c, sw: 5, f: "#fff", m: rotateAt(-Math.PI / 2, 970, 400) }), S("ellipse", 180, 190, 720, 420, OUT), S("tri", 440, 110, 220, 140, OUT), S("ellipse", 300, 330, 70, 70, OUT), S("ellipse", 322, 352, 26, 26, { c: null, f: "#1e1e1e" }), S("arc", 420, 300, 120, 200, { c: OUT.c, sw: 4 }), S("arc", 540, 300, 120, 200, { c: OUT.c, sw: 4 }), S("ellipse", 980, 120, 50, 50, OUT), S("ellipse", 1040, 60, 34, 34, OUT)]); } },
		{ id: "butterfly", cat: "Coloring", name: "Butterfly", make: function () { var o = [S("ellipse", 140, 140, 360, 320, OUT), S("ellipse", 200, 420, 300, 260, OUT), S("ellipse", 140, 140, 360, 320, { c: OUT.c, sw: 4, f: "#fff", m: mirrorX(500) }), S("ellipse", 200, 420, 300, 260, { c: OUT.c, sw: 4, f: "#fff", m: mirrorX(500) }), S("ellipse", 250, 220, 120, 120, OUT), S("ellipse", 630, 220, 120, 120, OUT), S("ellipse", 300, 480, 90, 90, OUT), S("ellipse", 610, 480, 90, 90, OUT), S("ellipse", 470, 160, 60, 560, OUT), Pth([[490, 170], [430, 90], [390, 60]], 4, "#1e1e1e"), Pth([[510, 170], [570, 90], [610, 60]], 4, "#1e1e1e")]; return doc(1000, 800, o); } },
		{ id: "car", cat: "Coloring", name: "Car", make: function () { return doc(1400, 800, [S("round", 140, 360, 1120, 230, OUT), S("trap", 360, 200, 640, 180, OUT), S("rect", 420, 230, 230, 130, OUT), S("rect", 700, 230, 230, 130, OUT), S("ellipse", 270, 500, 210, 210, OUT), S("ellipse", 920, 500, 210, 210, OUT), S("ellipse", 330, 560, 90, 90, OUT), S("ellipse", 980, 560, 90, 90, OUT), S("rect", 1190, 410, 70, 50, OUT), S("line", 40, 710, 1320, 0, { sw: 4 })]); } }
	];
	function template(id) { for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i].make(); return null; }

	/* ---------- emoji and symbols (search words after the character) ---------- */
	var EMOJI = {
		"Faces": "😀 grin happy smile|😃 smile big|😄 laugh|😁 beam grin|😆 laughing|😅 sweat|😂 tears joy lol|🤣 rofl rolling|🙂 slight smile|😉 wink|😊 blush|😇 angel halo|🥰 love hearts|😍 heart eyes|🤩 star struck|😘 kiss|😋 yum tongue|😛 tongue|😜 wink tongue|🤪 zany crazy|🤔 thinking|🤨 eyebrow|😐 neutral|😑 expressionless|😶 no mouth|🙄 eye roll|😏 smirk|😬 grimace|😌 relieved|😴 sleep|🤤 drool|😷 mask sick|🤒 thermometer sick|🤕 bandage hurt|🤢 nausea|🤮 vomit|🥵 hot|🥶 cold|😵 dizzy|🤯 mind blown exploding|🤠 cowboy|🥳 party|😎 cool sunglasses|🤓 nerd|🧐 monocle|😕 confused|😟 worried|🙁 frown|😮 wow surprised open mouth|😲 astonished|😳 flushed|🥺 pleading|😦 frowning|😨 fearful|😰 anxious|😢 cry sad|😭 sob|😱 scream|😖 confounded|😣 persevere|😞 disappointed|😓 sweat|😩 weary|😫 tired|🥱 yawn|😤 triumph steam|😡 angry pout|😠 angry|🤬 swearing|😈 devil smiling|👿 devil|💀 skull|☠️ skull bones|💩 poop|🤡 clown|👹 ogre|👻 ghost|👽 alien|🤖 robot|😺 cat smile|😹 cat joy|😻 cat heart",
		"Hands & people": "👋 wave hello|🤚 raised back hand|✋ hand stop high five|🖐️ hand fingers|👌 ok|🤌 pinched|✌️ peace victory|🤞 fingers crossed|🤟 love you|🤘 rock|🤙 call me|👈 left point|👉 right point|👆 up point|👇 down point|☝️ index up|👍 thumbs up like|👎 thumbs down dislike|✊ fist|👊 punch|👏 clap|🙌 raise hands|👐 open hands|🤲 palms|🤝 handshake deal|🙏 pray thanks please|✍️ writing|💪 muscle strong|🧠 brain|👀 eyes look|👁️ eye|👄 mouth|👶 baby|🧒 child|👦 boy|👧 girl|🧑 person|👨 man|👩 woman|🧓 older|👴 old man|👵 old woman|👮 police|👷 builder|💂 guard|🕵️ detective|👩‍⚕️ doctor|👨‍🍳 cook chef|👩‍🎓 student graduate|👨‍🏫 teacher|👩‍💻 coder laptop|👨‍🚀 astronaut|🦸 superhero|🧙 wizard|🧚 fairy|🧛 vampire|🧜 mermaid|🧝 elf|🧞 genie|🧟 zombie|🏃 run|💃 dance|🕺 dance man|🧘 yoga|🚴 bike|🏊 swim",
		"Animals & nature": "🐶 dog puppy|🐱 cat kitten|🐭 mouse|🐹 hamster|🐰 rabbit bunny|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🙈 see no evil|🐔 chicken|🐧 penguin|🐦 bird|🐤 chick|🦆 duck|🦅 eagle|🦉 owl|🦇 bat|🐺 wolf|🐴 horse|🦄 unicorn|🐝 bee|🐛 bug caterpillar|🦋 butterfly|🐌 snail|🐞 ladybug|🐜 ant|🕷️ spider|🐢 turtle|🐍 snake|🦎 lizard|🦖 dinosaur t-rex|🦕 dinosaur|🐙 octopus|🦑 squid|🦀 crab|🐠 fish tropical|🐟 fish|🐬 dolphin|🐳 whale|🦈 shark|🐊 crocodile|🐘 elephant|🦒 giraffe|🦓 zebra|🐪 camel|🦘 kangaroo|🐾 paw prints|🌵 cactus|🎄 christmas tree|🌲 pine tree|🌳 tree|🌴 palm tree|🌱 seedling sprout|🌿 herb|🍀 clover luck|🍁 maple leaf|🍂 fallen leaves|🍄 mushroom|💐 bouquet|🌷 tulip|🌹 rose|🌺 hibiscus|🌸 cherry blossom|🌼 blossom|🌻 sunflower|🌞 sun face|🌝 full moon face|🌛 moon|🌙 crescent moon|⭐ star|🌟 glowing star|✨ sparkles|⚡ lightning|🔥 fire|💧 drop water|🌊 wave|🌈 rainbow|☀️ sun|⛅ cloud sun|☁️ cloud|🌧️ rain|⛈️ storm|❄️ snowflake|☃️ snowman|🌪️ tornado|🌍 earth globe|🪐 planet|☄️ comet",
		"Food & drink": "🍎 apple|🍐 pear|🍊 orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🫐 blueberries|🍒 cherries|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🍅 tomato|🥑 avocado|🥦 broccoli|🥕 carrot|🌽 corn|🌶️ pepper hot|🥔 potato|🥐 croissant|🍞 bread|🧀 cheese|🥚 egg|🍳 cooking egg|🥞 pancakes|🥓 bacon|🍔 burger|🍟 fries|🍕 pizza|🌭 hot dog|🥪 sandwich|🌮 taco|🌯 burrito|🍝 spaghetti|🍜 ramen noodles|🍣 sushi|🍱 bento|🍤 shrimp|🍙 rice ball|🍦 ice cream|🍩 donut|🍪 cookie|🎂 birthday cake|🍰 cake|🧁 cupcake|🍫 chocolate|🍬 candy|🍭 lollipop|🍿 popcorn|☕ coffee|🍵 tea|🥤 drink cup|🧃 juice box|🥛 milk|🍺 beer|🍷 wine|🥂 cheers|🍾 champagne",
		"Activities & objects": "⚽ soccer football|🏀 basketball|🏈 american football|⚾ baseball|🎾 tennis|🏐 volleyball|🏓 ping pong|🎱 billiards 8 ball|🏒 hockey|⛳ golf|🎯 target dart|🎮 video game|🕹️ joystick|🎲 dice|♟️ chess|🧩 puzzle|🎨 art palette paint|🖌️ paintbrush|🖍️ crayon|✏️ pencil|✒️ pen|📝 memo note|📚 books|📖 book|📏 ruler|📐 triangle ruler|✂️ scissors|📌 pin|📎 paperclip|🔍 magnifier search|💡 idea bulb|🔦 flashlight|🕯️ candle|💻 laptop|🖥️ computer|⌨️ keyboard|🖱️ mouse|📱 phone|📷 camera|🎥 movie camera|📺 tv|🎙️ microphone|🎧 headphones|🎤 mic sing|🎸 guitar|🎹 piano|🥁 drum|🎺 trumpet|🎻 violin|🎵 music note|🎶 notes|🔔 bell|📣 megaphone|⏰ alarm clock|⌛ hourglass|🔑 key|🔒 lock|🧲 magnet|🔧 wrench|🔨 hammer|⚙️ gear|🧪 test tube|🔬 microscope|🔭 telescope|💊 pill|🩹 bandage|🎁 gift present|🎈 balloon|🎉 party popper|🎊 confetti|🏆 trophy|🥇 gold medal|🏅 medal|👑 crown|💎 gem diamond|💰 money bag|💵 dollar|💳 card|🛒 cart|🏠 house home|🏫 school|🏥 hospital|🏰 castle|⛺ tent|🚗 car|🚕 taxi|🚌 bus|🚓 police car|🚑 ambulance|🚒 fire truck|🚲 bicycle|🛵 scooter|🚂 train|✈️ plane|🚁 helicopter|🚀 rocket|🛸 ufo|⛵ sailboat|🚢 ship|⚓ anchor|🗺️ map|🧭 compass",
		"Hearts & signs": "❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|💕 two hearts|💖 sparkling heart|💗 growing heart|💘 cupid arrow|💝 heart ribbon|💯 hundred|💢 anger|💥 boom collision|💫 dizzy star|💦 sweat drops|💨 dash wind|💬 speech bubble|💭 thought bubble|💤 zzz sleep|✅ check yes done|☑️ ballot check|✔️ check mark|❌ cross no|❎ cross box|❓ question|❗ exclamation|‼️ double exclamation|⁉️ interrobang|⚠️ warning|🚫 prohibited no|⛔ no entry|🛑 stop|♻️ recycle|⭕ circle|🔴 red circle|🟠 orange circle|🟡 yellow circle|🟢 green circle|🔵 blue circle|🟣 purple circle|⚫ black circle|⚪ white circle|🟥 red square|🟩 green square|🟦 blue square|⬛ black square|⬜ white square|🔶 orange diamond|🔷 blue diamond|🔺 red triangle|➡️ right arrow|⬅️ left arrow|⬆️ up arrow|⬇️ down arrow|↗️ up right|↘️ down right|🔄 refresh arrows|🔝 top|🆕 new|🆗 ok|🆒 cool|🆓 free|🔟 ten|#️⃣ hash|1️⃣ one|2️⃣ two|3️⃣ three|🏁 finish flag|🚩 red flag|🏳️ white flag|🏴‍☠️ pirate flag"
	};
	var SYMBOLS = {
		"Arrows": "← left|→ right|↑ up|↓ down|↔ left right|↕ up down|↖ up left|↗ up right|↘ down right|↙ down left|⇐ double left|⇒ double right implies|⇔ iff double|⇑ double up|⇓ double down|↻ clockwise|↺ anticlockwise|⟶ long right|⟵ long left|➜ heavy right|➤ arrowhead|⤴ curve up|⤵ curve down|↩ return|↪ forward hook",
		"Math": "+ plus|− minus|× times multiply|÷ divide|± plus minus|= equals|≠ not equal|≈ approx|≡ identical|< less|> greater|≤ less equal|≥ greater equal|∞ infinity|√ root|∛ cube root|∑ sum sigma|∏ product|∫ integral|∬ double integral|∮ contour integral|∂ partial|∇ nabla|∆ delta change|∈ element of|∉ not in|⊂ subset|⊆ subset equal|∪ union|∩ intersection|∅ empty set|∀ for all|∃ exists|¬ not|∧ and|∨ or|∴ therefore|∵ because|∝ proportional|° degree|′ prime|″ double prime|‰ per mille|% percent|½ half|⅓ third|¼ quarter|¾ three quarters|² squared|³ cubed|ⁿ power n|₁ sub 1|₂ sub 2|ℕ naturals|ℤ integers|ℚ rationals|ℝ reals|ℂ complex|∠ angle|⊥ perpendicular|∥ parallel|△ triangle|□ square",
		"Greek": "α alpha|β beta|γ gamma|δ delta|ε epsilon|ζ zeta|η eta|θ theta|ι iota|κ kappa|λ lambda|μ mu|ν nu|ξ xi|π pi|ρ rho|σ sigma|τ tau|υ upsilon|φ phi|χ chi|ψ psi|ω omega|Γ Gamma|Δ Delta|Θ Theta|Λ Lambda|Ξ Xi|Π Pi|Σ Sigma|Φ Phi|Ψ Psi|Ω Omega",
		"Shapes & stars": "★ star black|☆ star white|✦ four star|✧ four star white|✪ circled star|✯ pinwheel star|❂ sun|✺ asterisk|✿ flower|❀ flower white|❁ flower|✾ flower|❖ diamond minus|◆ diamond|◇ diamond white|● circle|○ circle white|◉ fisheye|◎ bullseye|■ square|□ square white|▲ triangle up|△ triangle white|▼ triangle down|▽ triangle down white|◀ left triangle|▶ right triangle play|♥ heart|♡ heart white|♦ diamond suit|♣ club|♠ spade|☀ sun|☁ cloud|☂ umbrella|☃ snowman|☾ moon|❄ snow|☘ shamrock|⚘ flower|☮ peace|☯ yin yang|✓ check|✔ heavy check|✗ ballot x|✘ heavy x|☐ box|☑ box check|☒ box x",
		"Music & misc": "♩ quarter note|♪ eighth note|♫ beamed notes|♬ notes|♭ flat|♮ natural|♯ sharp|𝄞 treble clef|© copyright|® registered|™ trademark|§ section|¶ pilcrow|† dagger|‡ double dagger|• bullet|· middle dot|… ellipsis|— em dash|– en dash|« quote|» quote|¿ inverted question|¡ inverted exclamation|€ euro|£ pound|¥ yen|₿ bitcoin|$ dollar|¢ cent|₹ rupee|⚡ lightning|☎ phone|✉ envelope|✂ scissors|✎ pencil|✏ pencil|⌚ watch|⌛ hourglass|⚓ anchor|⚙ gear|⚖ scales|⚛ atom|☢ radioactive|☣ biohazard|♻ recycle|⚠ warning|♀ female|♂ male|⚤ male female"
	};
	function splitList(s) { return s.split("|").map(function (it) { var sp = it.indexOf(" "); return sp < 0 ? { ch: it, words: "" } : { ch: it.slice(0, sp), words: it.slice(sp + 1) }; }); }
	function search(groups, q) {
		q = String(q || "").trim().toLowerCase(); var out = [];
		Object.keys(groups).forEach(function (g) { splitList(groups[g]).forEach(function (e) { if (!q || e.words.toLowerCase().indexOf(q) >= 0 || g.toLowerCase().indexOf(q) >= 0 || e.ch === q) out.push({ ch: e.ch, words: e.words, group: g }); }); });
		return out;
	}

	/* ---------- file format ---------- */
	var KNOWN = { path: 1, shape: 1, text: 1, img: 1 };
	function cleanObj(o) {
		if (!o || !KNOWN[o.t]) return null; var c = {};
		Object.keys(o).forEach(function (k) { if (k.charAt(0) !== "_") c[k] = o[k]; });
		if (!Array.isArray(c.m) || c.m.length !== 6 || !c.m.every(fin)) c.m = I.slice();
		if (c.t === "path" && (!Array.isArray(c.pts) || !c.pts.length || !c.pts.every(fin))) return null;
		if (c.t === "img" && !/^data:image\/(png|jpeg|webp|gif|svg\+xml);/.test(String(c.src || ""))) return null;
		return c;
	}
	function serialize(d) { return JSON.stringify({ app: "mes-draw", v: 1, name: d.name || "Drawing", w: d.w, h: d.h, bg: d.bg, objs: (d.objs || []).map(cleanObj).filter(Boolean) }); }
	function parse(text) {
		var j; try { j = JSON.parse(text); } catch (e) { return null; }
		if (!j || j.app !== "mes-draw" || !fin(j.w) || !fin(j.h)) return null;
		return { name: String(j.name || "Drawing").slice(0, 80), w: Math.max(16, Math.min(8000, j.w)), h: Math.max(16, Math.min(8000, j.h)), bg: j.bg && typeof j.bg === "object" ? { c: j.bg.c || null, p: j.bg.p || "none" } : { c: "#ffffff", p: "none" }, objs: (j.objs || []).map(cleanObj).filter(Boolean) };
	}

	var api = { I: I, mul: mul, inv: inv, ap: ap, tr: tr, scaleAt: scaleAt, rotateAt: rotateAt, mirrorX: mirrorX, mirrorY: mirrorY, isId: isId, mScale: mScale, rng: rng,
		SHAPES: SHAPES, LINE_KINDS: LINE_KINDS, OPEN_KINDS: OPEN_KINDS, shapeD: shapeD, arrowHead: arrowHead, norm: norm, BRUSHES: BRUSHES, smoothPts: smoothPts, thinPts: thinPts, lineD: lineD, outlineD: outlineD, sprayD: sprayD, pathD: pathD, objD: objD, isFilledBrush: isFilledBrush,
		localBox: localBox, worldBox: worldBox, unionBox: unionBox, boxesTouch: boxesTouch, boxInside: boxInside, estText: estText, distSeg: distSeg, distPolyline: distPolyline,
		PAPERS: PAPERS, paper: paper, SIZES: SIZES, toSVG: toSVG, objSVG: objSVG, TEMPLATES: TEMPLATES, template: template, EMOJI: EMOJI, SYMBOLS: SYMBOLS, splitList: splitList, search: search,
		S: S, T: T, E: E, Pth: Pth, cleanObj: cleanObj, serialize: serialize, parse: parse };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	root.MESDraw = api;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Draw (mes.fm/draw): the page. The maths lives in lib.js (MESDraw). One canvas shows the desk, the page (background + paper lines),
 * the drawing (an "ink" canvas, so the eraser can rub out ink but never the paper) and the selection handles. Objects are never changed in
 * place: an edit replaces the object, so undo snapshots can share them. Drawings are kept in IndexedDB "mes-draw" (nothing is uploaded). */
(function () {
	"use strict";
	var D = window.MESDraw, root = document.getElementById("dr");
	if (!D || !root) return;
	function $(id) { return document.getElementById(id); }
	var KEY = "mes-draw:v1", EMOJI_FONT = "\"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif";
	var PAL = ["#1e1e1e", "#ffffff", "#868e96", "#e03131", "#f76707", "#f59f00", "#ffd43b", "#8ce99a", "#2f9e44", "#12b886", "#1c7ed6", "#74c0fc", "#7048e8", "#ae3ec9", "#e64980", "#f783ac", "#8c5a2b", "#ffc078"];
	var FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["\"Comic Sans MS\", \"Chalkboard SE\", \"Comic Neue\", cursive", "Comic Sans"], ["Georgia, \"Times New Roman\", serif", "Georgia"], ["\"Times New Roman\", Times, serif", "Times"],
		["Impact, \"Arial Black\", \"Haettenschweiler\", sans-serif", "Impact"], ["Verdana, Geneva, sans-serif", "Verdana"], ["\"Trebuchet MS\", sans-serif", "Trebuchet"], ["\"Courier New\", Courier, monospace", "Courier"],
		["\"Brush Script MT\", \"Snell Roundhand\", \"Segoe Script\", cursive", "Script"], ["\"Segoe Print\", \"Bradley Hand\", \"Marker Felt\", cursive", "Handwriting"], ["system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif", "System"]];
	var TOOLS = [
		["select", "Select and move", "V", '<path d="M5 3l14 8-6 1.5L10 19z"/>'],
		["hand", "Hand: move around the page", "H", '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7s-5-2-7-5l-1.5-2.5a1.5 1.5 0 0 1 2.5-1.6L8 13"/>'],
		"-",
		["brush", "Brush (pen, marker, pencil, highlighter, calligraphy, neon, spray)", "B", '<path d="M18.5 2.5l3 3L11 16l-4-1-1-4z"/><path d="M6 15c-2 0-3 1.5-3 3.5S2 21 2 21s4 1 6-1 0-5-2-5z"/>'],
		["eraser", "Eraser", "E", '<path d="M20 20H9L3.5 14.5a2 2 0 0 1 0-2.8L12 3.2a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L11 20"/><path d="M8 9l7 7"/>'],
		"-",
		["shape", "Shape (pick one in the Shapes panel)", "S", '<rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16.5" cy="7.5" r="4.5"/>'],
		["rect", "Rectangle", "R", '<rect x="3" y="5" width="18" height="14" rx="1"/>'],
		["ellipse", "Circle / ellipse", "O", '<ellipse cx="12" cy="12" rx="9" ry="7.5"/>'],
		["line", "Line", "L", '<path d="M4 20L20 4"/>'],
		["arrow", "Arrow", "A", '<path d="M4 20L20 4M11 4h9v9"/>'],
		["text", "Text", "T", '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
		"-",
		["fill", "Paint bucket: click a shape, line or text to paint it, or the page to change its colour", "F", '<path d="M19 11L11 3 3 11l8 8z"/><path d="M3 11h16M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z"/>'],
		["picker", "Colour picker: take a colour from the drawing", "I", '<path d="M14 4l6 6-9.5 9.5H4.5v-6z"/><path d="M12 6l6 6"/>']
	];
	var SHAPE_TOOL = { rect: "rect", ellipse: "ellipse", line: "line", arrow: "arrow" };

	/* ---------- settings ---------- */
	var S = { tool: "brush", brush: "pen", c: "#1e1e1e", fOn: false, fc: "#ffd43b", w: 6, ew: 34, sw: 5, o: 1, kind: "rect", dash: false, font: FONTS[0][0], fs: 56, b: false, i: false, al: "l", sOn: false, sc: "#000000",
		sym: "off", smooth: 50, emode: "rub", recent: [], tab: "shapes", side: true, fmt: "png", scale: 1, what: "page", xbg: true, xpaper: true, last: "" };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) Object.keys(S).forEach(function (k) { if (sv[k] !== undefined) S[k] = sv[k]; }); } catch (e) {}
	var saveTimerS = 0;
	function saveS() { clearTimeout(saveTimerS); saveTimerS = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 250); }

	/* ---------- state ---------- */
	var doc = null, sel = [], hist = [], hpos = -1, op = null, live = null, editing = null, spaceDown = false, penSeen = false, active = false;
	var view = { s: 1, ox: 0, oy: 0, fit: true }, dpr = 1, W = 0, H = 0;
	var stage = $("dr-stage"), cv = $("dr-cv"), ctx = cv.getContext("2d"), ink = document.createElement("canvas"), ictx = ink.getContext("2d"), lv = document.createElement("canvas"), lctx = lv.getContext("2d");
	var hcv = document.createElement("canvas"), hctx = hcv.getContext("2d"), mcv = document.createElement("canvas"), mctx = mcv.getContext("2d");
	var pathCache = new WeakMap(), imgCache = {}, paperCache = { key: "", list: [] }, inkOk = false, need = false;
	function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
	function clone(o, patch) { var c = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; if (patch) for (var j in patch) c[j] = patch[j]; return c; }
	function byId(id) { for (var i = 0; i < doc.objs.length; i++) if (doc.objs[i].id === id) return doc.objs[i]; return null; }
	function selObjs() { return doc.objs.filter(function (o) { return sel.indexOf(o.id) >= 0; }); }
	function dirty(inkToo) { if (inkToo !== false) inkOk = false; if (!need) { need = true; requestAnimationFrame(render); } }

	/* ---------- text measuring ---------- */
	function fontOf(o, k) { return (o.i ? "italic " : "") + (o.b ? "700 " : "") + (o.size * (k || 1)) + "px " + (o.font || FONTS[0][0]); }
	function measure(o) {
		mctx.font = fontOf(o); var lines = String(o.s).split("\n"), w = 0;
		lines.forEach(function (l) { w = Math.max(w, mctx.measureText(l).width); });
		o.tw = Math.max(o.size * 0.3, w); o.th = lines.length * o.size * 1.2; return o;
	}
	function prep(o) { if (!o.id) o.id = uid(); if (!o.m) o.m = D.I.slice(); if (o.t === "text") measure(o); return o; }

	/* ---------- history ---------- */
	function snap() { return { objs: doc.objs.slice(), bg: { c: doc.bg.c, p: doc.bg.p }, w: doc.w, h: doc.h }; }
	function commit() {
		hist = hist.slice(0, hpos + 1); hist.push(snap()); if (hist.length > 200) hist.shift(); hpos = hist.length - 1;
		sel = sel.filter(byId); uiHist(); scheduleSave(); dirty(); uiSel();
	}
	function restore(h) { doc.objs = h.objs.slice(); doc.bg = { c: h.bg.c, p: h.bg.p }; var sz = doc.w !== h.w || doc.h !== h.h; doc.w = h.w; doc.h = h.h; sel = sel.filter(byId); if (sz) fit(); uiPage(); uiHist(); uiSel(); scheduleSave(); dirty(); }
	function undo() { if (op) return; finishText(); if (hpos > 0) { hpos--; restore(hist[hpos]); tip("Undone"); } }
	function redo() { if (op) return; if (hpos < hist.length - 1) { hpos++; restore(hist[hpos]); tip("Redone"); } }
	function uiHist() { $("dr-undo").disabled = hpos <= 0; $("dr-redo").disabled = hpos >= hist.length - 1; }

	/* ---------- storage (IndexedDB) ---------- */
	var dbP = null;
	function db() { if (!dbP) dbP = new Promise(function (res, rej) { if (!window.indexedDB) { rej(new Error("no IndexedDB")); return; } var r = indexedDB.open("mes-draw", 1); r.onupgradeneeded = function () { r.result.createObjectStore("docs", { keyPath: "id" }); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); return dbP; }
	function tx(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("docs", mode), st = t.objectStore("docs"), out = fn(st); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
	function getAll() { return tx("readonly", function (st) { return st.getAll(); }).catch(function () { return []; }); }
	function getDoc(id) { return tx("readonly", function (st) { return st.get(id); }).catch(function () { return null; }); }
	var saveTimer = 0, saving = false;
	function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); status("Saving…"); }
	function saveNow() {
		clearTimeout(saveTimer); if (!doc) return Promise.resolve();
		var rec = { id: doc.id, name: doc.name, w: doc.w, h: doc.h, bg: doc.bg, objs: doc.objs.map(D.cleanObj).filter(Boolean), t: Date.now(), made: doc.made || Date.now(), thumb: thumb(doc, 260) };
		return tx("readwrite", function (st) { st.put(rec); }).then(function () { status("Saved in this browser · " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); if (S.tab === "mine") paneMine(); }, function () { status("Could not save in this browser (private window?). Use Export → Save as .mesdraw file."); });
	}
	function status(t) { $("dr-status").textContent = t; }

	/* ---------- loading a drawing ---------- */
	function setDoc(d, fresh) {
		doc = { id: d.id || uid(), name: d.name || "Untitled drawing", w: d.w, h: d.h, bg: { c: d.bg ? d.bg.c : "#ffffff", p: d.bg && d.bg.p || "none" }, objs: (d.objs || []).map(function (o) { return prep(clone(o)); }), made: d.made || Date.now() };
		sel = []; hist = []; hpos = -1; commitNoSave(); S.last = doc.id; saveS();
		$("dr-name").value = doc.name; uiPage(); fit(); dirty(); uiSel();
		if (fresh) scheduleSave();
	}
	function commitNoSave() { hist.push(snap()); hpos = hist.length - 1; uiHist(); }
	function newDoc(t, name) {
		var src = D.template(t) || D.template("blank"); src.name = name || "Untitled drawing";
		if (doc) saveNow(); setDoc(src, true);
	}

	/* ---------- view ---------- */
	function resize() {
		var r = stage.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2.5);
		var w = Math.max(50, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
		if (w === W && h === H && cv.width === Math.round(w * dpr)) return;
		W = w; H = h; [cv, ink, lv].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
		if (view.fit) fit(); else dirty();
	}
	function fit() { if (!doc || !W) return; var pad = Math.min(36, W * 0.05); view.s = Math.min((W - pad * 2) / doc.w, (H - pad * 2) / doc.h); view.ox = (W - doc.w * view.s) / 2; view.oy = (H - doc.h * view.s) / 2; view.fit = true; uiZoom(); dirty(); }
	function zoomAt(f, sx, sy) { var ns = Math.max(0.03, Math.min(16, view.s * f)); f = ns / view.s; view.ox = sx - (sx - view.ox) * f; view.oy = sy - (sy - view.oy) * f; view.s = ns; view.fit = false; uiZoom(); dirty(); placeEditor(); }
	function uiZoom() { $("dr-zfit").textContent = Math.round(view.s * 100) + "%"; }
	function toBoard(cx, cy) { var r = cv.getBoundingClientRect(); return [(cx - r.left - view.ox) / view.s, (cy - r.top - view.oy) / view.s]; }
	function toScreen(x, y) { return [view.ox + x * view.s, view.oy + y * view.s]; }

	/* ---------- drawing objects ---------- */
	function p2d(o) { var p = pathCache.get(o); if (!p) { p = new Path2D(D.objD(o)); pathCache.set(o, p); } return p; }
	function img(src) { var im = imgCache[src]; if (!im) { im = new Image(); im.onload = function () { dirty(); }; im.src = src; imgCache[src] = im; } return im; }
	function strokeLine(c, o, cap) { c.lineWidth = o.w; c.lineCap = cap; c.lineJoin = "round"; c.strokeStyle = o.c; c.stroke(p2d(o)); }
	function drawObj(c, o, k) {
		if (editing && editing.id === o.id) return;
		var m = o.m; c.save(); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); c.globalAlpha = o.o == null ? 1 : o.o;
		if (o.t === "path") {
			var b = o.brush;
			if (b === "erase") { c.globalCompositeOperation = "destination-out"; c.globalAlpha = 1; c.strokeStyle = "#000"; c.lineWidth = o.w; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(p2d(o)); }
			else if (D.isFilledBrush(b)) { c.fillStyle = o.c; c.fill(p2d(o)); }
			else if (b === "hl") { c.globalCompositeOperation = "multiply"; strokeLine(c, o, "butt"); }
			else if (b === "pencil") { c.globalAlpha *= 0.85; strokeLine(c, o, "round"); }
			else if (b === "neon") { c.shadowColor = o.c; c.shadowBlur = Math.max(2, o.w * 1.4 * k * D.mScale(m)); strokeLine(c, o, "round"); c.shadowBlur = 0; c.lineWidth = Math.max(1, o.w * 0.35); c.strokeStyle = "rgba(255,255,255,.9)"; c.stroke(p2d(o)); }
			else strokeLine(c, o, "round");
		} else if (o.t === "shape") {
			var p = p2d(o);
			if (o.f && !D.OPEN_KINDS[o.k]) { c.fillStyle = o.f; c.fill(p); }
			if (o.c && o.sw > 0) { c.lineWidth = o.sw; c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = o.c; if (o.dash) c.setLineDash([o.sw * 3, o.sw * 2]); c.stroke(p); }
		} else if (o.t === "text") drawText(c, o);
		else if (o.t === "img") { var im = img(o.src); if (im.complete && im.naturalWidth) c.drawImage(im, o.x, o.y, o.w, o.h); }
		c.restore();
	}
	function drawText(c, o) {
		var lines = String(o.s).split("\n"), lh = o.size * 1.2, tw = o.tw || D.estText(o).w, th = o.th || lines.length * lh;
		c.font = fontOf(o); c.textAlign = o.al === "c" ? "center" : o.al === "r" ? "right" : "left"; c.textBaseline = "alphabetic";
		if (o.bgc) { var bx = o.x + (o.al === "c" ? -tw / 2 : o.al === "r" ? -tw : 0), pad = o.size * 0.25; c.fillStyle = o.bgc; c.beginPath(); if (c.roundRect) c.roundRect(bx - pad, o.y - pad, tw + 2 * pad, th + 2 * pad, pad); else c.rect(bx - pad, o.y - pad, tw + 2 * pad, th + 2 * pad); c.fill(); }
		lines.forEach(function (l, i) {
			var y = o.y + i * lh + o.size * 0.92;
			if (o.sc) { c.lineWidth = Math.max(2, o.size * 0.08) * 2; c.lineJoin = "round"; c.strokeStyle = o.sc; c.strokeText(l, o.x, y); }
			c.fillStyle = o.c; c.fillText(l, o.x, y);
		});
	}
	function paperList() { var key = doc.bg.p + "|" + doc.w + "|" + doc.h; if (paperCache.key !== key) { paperCache.key = key; paperCache.list = D.paper(doc.bg.p, doc.w, doc.h).map(function (l) { return { p: new Path2D(l.d), l: l }; }); } return paperCache.list; }
	function drawPaper(c) { paperList().forEach(function (it) { if (it.l.fill) { c.fillStyle = it.l.fill; c.fill(it.p); } else { c.strokeStyle = it.l.stroke; c.lineWidth = it.l.sw; c.stroke(it.p); } }); }
	function checker(c, x, y, w, h, sz) { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = "#ffffff"; c.fillRect(x, y, w, h); c.fillStyle = "#e3e7ec"; for (var yy = 0, r = 0; yy < h; yy += sz, r++) for (var xx = (r % 2) * sz; xx < w; xx += sz * 2) c.fillRect(x + xx, y + yy, sz, sz); c.restore(); }

	var deskColor = "#e9ecf1";
	function readDesk() { deskColor = getComputedStyle(root).getPropertyValue("--dr-desk").trim() || "#e9ecf1"; }
	function render(noOverlay) {
		need = false; if (!doc || !W) return;
		var k = dpr * view.s, T = [k, 0, 0, k, view.ox * dpr, view.oy * dpr];
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = deskColor; ctx.fillRect(0, 0, cv.width, cv.height);
		var px = view.ox * dpr, py = view.oy * dpr, pw = doc.w * k, ph = doc.h * k;
		ctx.save(); ctx.shadowColor = "rgba(0,0,0,.22)"; ctx.shadowBlur = 14 * dpr; ctx.shadowOffsetY = 3 * dpr; ctx.fillStyle = doc.bg.c || "#fff"; ctx.fillRect(px, py, pw, ph); ctx.restore();
		if (!doc.bg.c) checker(ctx, px, py, pw, ph, 10 * dpr);
		ctx.save(); ctx.setTransform.apply(ctx, T); ctx.beginPath(); ctx.rect(0, 0, doc.w, doc.h); ctx.clip(); if (doc.bg.p && doc.bg.p !== "none") drawPaper(ctx); ctx.restore();
		if (!inkOk) {
			ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, ink.width, ink.height); ictx.setTransform.apply(ictx, T);
			doc.objs.forEach(function (o) { drawObj(ictx, o, k); }); inkOk = true;
		}
		var src = ink;
		if (live) {
			lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lv.width, lv.height); lctx.drawImage(ink, 0, 0); lctx.setTransform.apply(lctx, T);
			(live.list || [live]).forEach(function (o) { drawObj(lctx, o, k); }); src = lv;
		}
		ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip(); ctx.drawImage(src, 0, 0); ctx.restore();
		// outside the page: faint, so things moved off the edge can still be found
		ctx.save(); ctx.globalAlpha = 0.22; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.rect(px, py, pw, ph); ctx.clip("evenodd"); ctx.drawImage(src, 0, 0); ctx.restore();
		if (noOverlay !== true) overlay(T);
	}
	/* handles + marquee + eraser ring */
	var HS = 9;
	function selBox() { var l = selObjs(); return l.length ? D.unionBox(l) : null; }
	function handles(b) {
		var a = toScreen(b.x, b.y), z = toScreen(b.x + b.w, b.y + b.h), mx = (a[0] + z[0]) / 2, my = (a[1] + z[1]) / 2;
		return { nw: [a[0], a[1]], n: [mx, a[1]], ne: [z[0], a[1]], e: [z[0], my], se: [z[0], z[1]], s: [mx, z[1]], sw: [a[0], z[1]], w: [a[0], my], rot: [mx, a[1] - 28] };
	}
	function overlay() {
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var b = selBox();
		if (b && !editing && (S.tool === "select" || (op && (op.kind === "move" || op.kind === "scale" || op.kind === "rot")))) {
			var h = handles(b), a = toScreen(b.x, b.y);
			ctx.strokeStyle = "#7048e8"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(a[0], a[1], b.w * view.s, b.h * view.s); ctx.setLineDash([]);
			if (sel.length > 1) selObjs().forEach(function (o) { var wb = D.worldBox(o), p = toScreen(wb.x, wb.y); ctx.strokeStyle = "rgba(112,72,232,.45)"; ctx.strokeRect(p[0], p[1], wb.w * view.s, wb.h * view.s); });
			ctx.beginPath(); ctx.moveTo(h.n[0], h.n[1]); ctx.lineTo(h.rot[0], h.rot[1]); ctx.stroke();
			Object.keys(h).forEach(function (k) { var p = h[k]; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#7048e8"; ctx.lineWidth = 2; ctx.beginPath(); if (k === "rot") ctx.arc(p[0], p[1], 6.5, 0, 7); else ctx.rect(p[0] - HS / 2 - 1, p[1] - HS / 2 - 1, HS + 2, HS + 2); ctx.fill(); ctx.stroke(); });
		} else if (b && !editing) { var a2 = toScreen(b.x, b.y); ctx.strokeStyle = "rgba(112,72,232,.6)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.strokeRect(a2[0], a2[1], b.w * view.s, b.h * view.s); ctx.setLineDash([]); }
		if (op && op.kind === "marquee") { var q = toScreen(Math.min(op.x0, op.x1), Math.min(op.y0, op.y1)); ctx.fillStyle = "rgba(112,72,232,.1)"; ctx.strokeStyle = "#7048e8"; ctx.lineWidth = 1; var mw = Math.abs(op.x1 - op.x0) * view.s, mh = Math.abs(op.y1 - op.y0) * view.s; ctx.fillRect(q[0], q[1], mw, mh); ctx.strokeRect(q[0], q[1], mw, mh); }
		if (hover && (S.tool === "eraser" || S.tool === "brush") && !op) { var r = (S.tool === "eraser" ? S.ew : S.w) / 2 * view.s; if (r > 3) { ctx.strokeStyle = "rgba(128,128,128,.85)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hover[0], hover[1], r, 0, 7); ctx.stroke(); } }
		if (S.sym !== "off" && S.tool === "brush") { ctx.strokeStyle = "rgba(112,72,232,.35)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 1; symGuides(); ctx.setLineDash([]); }
		ctx.restore();
	}
	function symGuides() {
		var c = toScreen(doc.w / 2, doc.h / 2), R = Math.hypot(doc.w, doc.h) * view.s, n = { mx: [90], my: [0], m4: [0, 90], r6: [0, 30, 60, 90, 120, 150], r8: [0, 45, 90, 135], r12: [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165], k12: [0, 30, 60, 90, 120, 150] }[S.sym] || [];
		n.forEach(function (deg) { var a = deg * Math.PI / 180; ctx.beginPath(); ctx.moveTo(c[0] - Math.cos(a) * R, c[1] - Math.sin(a) * R); ctx.lineTo(c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R); ctx.stroke(); });
	}

	/* ---------- symmetry ---------- */
	function symMats() {
		var cx = doc.w / 2, cy = doc.h / 2, mX = D.mirrorX(cx), mY = D.mirrorY(cy), out = [D.I.slice()], i;
		if (S.sym === "mx") out.push(mX); else if (S.sym === "my") out.push(mY); else if (S.sym === "m4") out.push(mX, mY, D.mul(mX, mY));
		else if (/^r\d+$/.test(S.sym)) { var n = +S.sym.slice(1); for (i = 1; i < n; i++) out.push(D.rotateAt(i * 2 * Math.PI / n, cx, cy)); }
		else if (S.sym === "k12") { for (i = 1; i < 6; i++) out.push(D.rotateAt(i * Math.PI / 3, cx, cy)); out.slice().forEach(function (m) { out.push(D.mul(m, mX)); }); }
		return out;
	}

	/* ---------- hit testing ---------- */
	function hitObj(o, x, y, tolPx) {
		if (o.t === "path" && o.brush === "erase") return false;
		var wb = D.worldBox(o), tol = tolPx / view.s;
		if (x < wb.x - tol || x > wb.x + wb.w + tol || y < wb.y - tol || y > wb.y + wb.h + tol) return false;
		var l = D.ap(D.inv(o.m), x, y), lt = tol / D.mScale(o.m);
		if (o.t === "path") return D.distPolyline(o.pts, l[0], l[1]) <= o.w / 2 + lt;
		if (o.t === "shape") {
			var p = p2d(o); hctx.setTransform(1, 0, 0, 1, 0, 0);
			if (o.f && !D.OPEN_KINDS[o.k] && hctx.isPointInPath(p, l[0], l[1])) return true;
			hctx.lineWidth = Math.max(o.sw || 1, 1) + lt * 2; hctx.lineCap = "round"; hctx.lineJoin = "round"; return hctx.isPointInStroke(p, l[0], l[1]);
		}
		var b = D.localBox(o); return l[0] >= b.x - lt && l[0] <= b.x + b.w + lt && l[1] >= b.y - lt && l[1] <= b.y + b.h + lt;
	}
	function hit(x, y, tolPx) { for (var i = doc.objs.length - 1; i >= 0; i--) if (hitObj(doc.objs[i], x, y, tolPx || 6)) return doc.objs[i]; return null; }
	function withGroup(ids) { var gs = {}; doc.objs.forEach(function (o) { if (ids.indexOf(o.id) >= 0 && o.g) gs[o.g] = 1; }); return doc.objs.filter(function (o) { return ids.indexOf(o.id) >= 0 || (o.g && gs[o.g]); }).map(function (o) { return o.id; }); }
	function handleAt(sx, sy) { var b = selBox(); if (!b || S.tool !== "select") return null; var h = handles(b); for (var k in h) if (Math.abs(sx - h[k][0]) <= 9 && Math.abs(sy - h[k][1]) <= 9) return k; return null; }

	/* ---------- pointer ---------- */
	var ptrs = new Map(), hover = null, pinch = null;
	function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
	cv.addEventListener("pointerdown", function (e) {
		active = true; if (editing) { finishText(); if (S.tool === "text") return; }
		cv.focus({ preventScroll: true });
		var sp = local(e); ptrs.set(e.pointerId, sp); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
		if (ptrs.size === 2) { cancelOp(); var a = Array.from(ptrs.values()); pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), cx: (a[0][0] + a[1][0]) / 2, cy: (a[0][1] + a[1][1]) / 2 }; return; }
		if (ptrs.size > 2) return;
		if (e.pointerType === "pen") penSeen = true;
		var b = toBoard(e.clientX, e.clientY), pr = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
		if (e.button === 1 || spaceDown || S.tool === "hand" || (e.pointerType === "touch" && penSeen)) { op = { kind: "pan", sx: sp[0], sy: sp[1], ox: view.ox, oy: view.oy }; e.preventDefault(); return; }
		if (e.button === 2) return;
		e.preventDefault();
		var t = S.tool;
		if (t === "select") {
			var hk = handleAt(sp[0], sp[1]);
			if (hk) { startTransform(hk, b, e); return; }
			var o = hit(b[0], b[1]);
			if (o) {
				var ids = withGroup([o.id]);
				if (e.shiftKey || e.ctrlKey || e.metaKey) { if (sel.indexOf(o.id) >= 0) sel = sel.filter(function (id) { return ids.indexOf(id) < 0; }); else sel = sel.concat(ids.filter(function (id) { return sel.indexOf(id) < 0; })); uiSel(); dirty(false); return; }
				if (sel.indexOf(o.id) < 0) sel = ids;
				if (e.altKey) duplicate(true);
				uiSel(); startMove(b); return;
			}
			if (!e.shiftKey) sel = [];
			op = { kind: "marquee", x0: b[0], y0: b[1], x1: b[0], y1: b[1], add: e.shiftKey ? sel.slice() : [] }; uiSel(); dirty(false); return;
		}
		if (t === "brush" || (t === "eraser" && S.emode === "rub")) {
			var isE = t === "eraser", base = { t: "path", brush: isE ? "erase" : S.brush, pts: [b[0], b[1], pr], c: S.c, w: isE ? S.ew : S.w, o: isE ? 1 : S.o, sd: (Math.random() * 1e9) | 0, m: D.I.slice() };
			var mats = isE ? [D.I.slice()] : symMats();
			live = base; live.list = mats.map(function (m, i) { return i ? clone(base, { m: m, pts: base.pts }) : base; });
			op = { kind: "draw", x0: b[0], y0: b[1], last: [b[0], b[1]], mats: mats, shift: e.shiftKey }; dirty(false); return;
		}
		if (t === "eraser") { op = { kind: "objerase", hitAny: false }; eraseAt(b); return; }
		if (t === "shape" || SHAPE_TOOL[t]) {
			var k = SHAPE_TOOL[t] || S.kind;
			live = { t: "shape", k: k, x: b[0], y: b[1], w: 0, h: 0, c: S.c, sw: S.sw, f: S.fOn ? S.fc : null, dash: S.dash, o: S.o, m: D.I.slice() };
			op = { kind: "shape", x0: b[0], y0: b[1] }; dirty(false); return;
		}
		if (t === "text") { var ot = hit(b[0], b[1]); if (ot && ot.t === "text") editText(ot); else newText(b[0], b[1]); return; }
		if (t === "fill") { paint(b); return; }
		if (t === "picker") { pick(sp); return; }
	});
	cv.addEventListener("pointermove", function (e) {
		var sp = local(e);
		if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, sp);
		if (pinch && ptrs.size === 2) { var a = Array.from(ptrs.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), cx = (a[0][0] + a[1][0]) / 2, cy = (a[0][1] + a[1][1]) / 2; view.ox += cx - pinch.cx; view.oy += cy - pinch.cy; zoomAt(d / (pinch.d || d), cx, cy); pinch.d = d; pinch.cx = cx; pinch.cy = cy; return; }
		hover = sp; cursor(sp);
		if (!op) { if (S.tool === "eraser" || S.tool === "brush") dirty(false); return; }
		var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs = [e];
		var b = toBoard(e.clientX, e.clientY);
		if (op.kind === "pan") { view.ox = op.ox + sp[0] - op.sx; view.oy = op.oy + sp[1] - op.sy; view.fit = false; dirty(false); placeEditor(); return; }
		if (op.kind === "draw") {
			if (e.shiftKey) { var pr0 = live.pts[2]; live.pts = [op.x0, op.y0, pr0, b[0], b[1], pr0]; }
			else {
				var sm = S.smooth / 100 * 0.75, minD = 0.6 / view.s;
				evs.forEach(function (ev) { var p = toBoard(ev.clientX, ev.clientY), lx = op.last[0], ly = op.last[1], nx = lx + (p[0] - lx) * (1 - sm), ny = ly + (p[1] - ly) * (1 - sm); if (Math.hypot(nx - lx, ny - ly) < minD) return; op.last = [nx, ny]; live.pts.push(nx, ny, ev.pointerType === "pen" ? (ev.pressure || 0.5) : 0.5); });
			}
			live.list.forEach(function (o, i) { if (i) o.pts = live.pts; pathCache.delete(o); }); dirty(false); return;
		}
		if (op.kind === "objerase") { eraseAt(b); return; }
		if (op.kind === "shape") { shapeDrag(b, e); return; }
		if (op.kind === "marquee") { op.x1 = b[0]; op.y1 = b[1]; var mb = { x: Math.min(op.x0, op.x1), y: Math.min(op.y0, op.y1), w: Math.abs(op.x1 - op.x0), h: Math.abs(op.y1 - op.y0) }; sel = withGroup(op.add.concat(doc.objs.filter(function (o) { return !(o.t === "path" && o.brush === "erase") && D.boxesTouch(D.worldBox(o), mb); }).map(function (o) { return o.id; }))); uiSel(); dirty(false); return; }
		if (op.kind === "move") { var dx = b[0] - op.b0[0], dy = b[1] - op.b0[1]; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } applyM(D.tr(dx, dy)); op.moved = op.moved || Math.hypot(dx, dy) * view.s > 2; return; }
		if (op.kind === "scale") { scaleDrag(b, e); return; }
		if (op.kind === "rot") { var c = op.c, a1 = Math.atan2(b[1] - c[1], b[0] - c[0]), da = a1 - op.a0; if (e.shiftKey) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12); applyM(D.rotateAt(da, c[0], c[1])); tip(Math.round(((da * 180 / Math.PI) % 360 + 540) % 360 - 180) + "°"); }
	});
	function endPtr(e) {
		ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; return; }
		if (!op) return; var o = op; op = null;
		if (o.kind === "draw") finishStroke(o);
		else if (o.kind === "shape") finishShape();
		else if (o.kind === "objerase") { if (o.hitAny) commit(); }
		else if (o.kind === "move" || o.kind === "scale" || o.kind === "rot") { if (o.kind !== "move" || o.moved) commit(); else dirty(false); }
		else if (o.kind === "marquee") { uiSel(); dirty(false); }
		else dirty(false);
	}
	cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", function (e) { if (op && op.kind === "draw") { live = null; op = null; dirty(false); } endPtr(e); });
	cv.addEventListener("pointerleave", function () { hover = null; if (!op) dirty(false); });
	cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	cv.addEventListener("dblclick", function (e) { var b = toBoard(e.clientX, e.clientY), o = hit(b[0], b[1]); if (o && o.t === "text") editText(o); });
	function cancelOp() { if (op && (op.kind === "move" || op.kind === "scale" || op.kind === "rot")) { doc.objs = hist[hpos].objs.slice(); } live = null; op = null; dirty(); }
	function cursor(sp) {
		var c = "crosshair", t = S.tool;
		if (spaceDown || t === "hand") c = op && op.kind === "pan" ? "grabbing" : "grab";
		else if (t === "select") { var hk = handleAt(sp[0], sp[1]); if (hk) c = hk === "rot" ? "grab" : ({ nw: "nwse", se: "nwse", ne: "nesw", sw: "nesw", n: "ns", s: "ns", e: "ew", w: "ew" })[hk] + "-resize"; else { var b = toBoard(sp[0] + cv.getBoundingClientRect().left, sp[1] + cv.getBoundingClientRect().top); c = hit(b[0], b[1]) ? "move" : "default"; } }
		else if (t === "text") c = "text"; else if (t === "fill" || t === "picker") c = "cell";
		if (cv.style.cursor !== c) cv.style.cursor = c;
	}

	/* moving / scaling / rotating the selection: base objects are kept, a matrix is applied on top */
	function startMove(b) { op = { kind: "move", b0: b, base: baseMap() }; dirty(false); }
	function baseMap() { var m = {}; selObjs().forEach(function (o) { m[o.id] = o; }); return m; }
	function applyM(M) { var base = op.base; doc.objs = doc.objs.map(function (o) { var b = base[o.id]; return b ? clone(b, { m: D.mul(M, b.m) }) : o; }); dirty(); }
	function startTransform(hk, b, e) {
		var bx = selBox(); if (!bx) return;
		if (hk === "rot") { var c = [bx.x + bx.w / 2, bx.y + bx.h / 2]; op = { kind: "rot", c: c, a0: Math.atan2(b[1] - c[1], b[0] - c[0]), base: baseMap() }; return; }
		var ax = hk.indexOf("w") >= 0 ? bx.x + bx.w : hk.indexOf("e") >= 0 ? bx.x : bx.x + bx.w / 2, ay = hk.indexOf("n") >= 0 ? bx.y + bx.h : hk.indexOf("s") >= 0 ? bx.y : bx.y + bx.h / 2;
		op = { kind: "scale", hk: hk, box: bx, ax: ax, ay: ay, hx: hk.indexOf("w") >= 0 ? bx.x : bx.x + bx.w, hy: hk.indexOf("n") >= 0 ? bx.y : bx.y + bx.h, base: baseMap() };
	}
	function scaleDrag(b, e) {
		var o = op, hk = o.hk, sx = 1, sy = 1;
		if (hk.indexOf("e") >= 0 || hk.indexOf("w") >= 0) sx = (b[0] - o.ax) / ((o.hx - o.ax) || 1);
		if (hk.indexOf("n") >= 0 || hk.indexOf("s") >= 0) sy = (b[1] - o.ay) / ((o.hy - o.ay) || 1);
		var corner = hk.length === 2;
		if (corner && !e.shiftKey) { var s = Math.abs(sx) > Math.abs(sy) ? sx : sy; sx = Math.sign(sx || 1) * Math.abs(s); sy = Math.sign(sy || 1) * Math.abs(s); }
		if (e.altKey) { o.cx = o.box.x + o.box.w / 2; o.cy = o.box.y + o.box.h / 2; }
		var mn = 0.01; if (Math.abs(sx) < mn) sx = sx < 0 ? -mn : mn; if (Math.abs(sy) < mn) sy = sy < 0 ? -mn : mn;
		applyM(D.scaleAt(sx, sy, e.altKey ? o.box.x + o.box.w / 2 : o.ax, e.altKey ? o.box.y + o.box.h / 2 : o.ay));
		tip(Math.round(o.box.w * Math.abs(sx)) + " × " + Math.round(o.box.h * Math.abs(sy)));
	}

	/* strokes */
	function finishStroke(o) {
		var l = live; live = null; if (!l) return;
		var pts = l.pts;
		if (pts.length > 9 && !o.shift) pts = D.smoothPts(D.thinPts(pts, 0.35 / view.s), 1);
		var group = o.mats.length > 1 ? uid() : null, add = o.mats.map(function (m) { var n = clone(l, { pts: pts, m: m, id: uid() }); delete n.list; if (group) n.g = group; return n; });
		doc.objs = doc.objs.concat(add); commit();
	}
	/* whole-object eraser */
	function eraseAt(b) {
		var o = hit(b[0], b[1], Math.max(4, S.ew / 2 * view.s)); if (!o) return;
		var ids = withGroup([o.id]); doc.objs = doc.objs.filter(function (x) { return ids.indexOf(x.id) < 0; }); sel = sel.filter(function (id) { return ids.indexOf(id) < 0; }); op.hitAny = true; dirty();
	}
	/* shapes */
	function shapeDrag(b, e) {
		var x0 = op.x0, y0 = op.y0, dx = b[0] - x0, dy = b[1] - y0;
		if (D.LINE_KINDS[live.k]) {
			if (e.shiftKey) { var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy); dx = Math.cos(a) * L; dy = Math.sin(a) * L; }
			live = clone(live, { x: x0, y: y0, w: dx, h: dy });
		} else {
			if (e.shiftKey) { var m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
			if (e.altKey) live = clone(live, { x: x0 - dx, y: y0 - dy, w: dx * 2, h: dy * 2 }); else live = clone(live, { x: x0, y: y0, w: dx, h: dy });
		}
		tip(Math.round(Math.abs(live.w)) + " × " + Math.round(Math.abs(live.h))); dirty(false);
	}
	function finishShape() {
		var s = live; live = null; if (!s) return;
		if (Math.hypot(s.w, s.h) * view.s < 6) { var d = Math.min(doc.w, doc.h) * 0.18; s = D.LINE_KINDS[s.k] ? clone(s, { w: d * 1.4, h: 0 }) : clone(s, { x: s.x - d * 0.7, y: s.y - d / 2, w: d * 1.4, h: d }); if (s.k === "ellipse" || s.k === "star" || s.k === "heart" || /^(penta|hexa|octa|star6|burst)$/.test(s.k)) s = clone(s, { x: s.x + d * 0.2, w: d }); }
		if (!D.LINE_KINDS[s.k]) { var n = D.norm(s); s = clone(s, n); }
		s.id = uid(); doc.objs = doc.objs.concat([s]); sel = [s.id]; afterMake();
	}
	function afterMake() { setTool("select"); commit(); }

	/* paint bucket / picker */
	function paint(b) {
		var o = hit(b[0], b[1]), c = S.c;
		if (!o) { doc.bg = { c: c, p: doc.bg.p }; uiPage(); commit(); tip("Page colour changed"); return; }
		var p = o.t === "shape" ? (D.OPEN_KINDS[o.k] || (!o.f && !insideShape(o, b)) ? { c: c } : { f: c }) : o.t === "img" ? null : { c: c };
		if (!p) { tip("Pictures can't be painted"); return; }
		replace(o.id, p); commit();
	}
	function insideShape(o, b) { var l = D.ap(D.inv(o.m), b[0], b[1]); hctx.setTransform(1, 0, 0, 1, 0, 0); return hctx.isPointInPath(p2d(o), l[0], l[1]); }
	function pick(sp) {
		render(true); var d = ctx.getImageData(Math.round(sp[0] * dpr), Math.round(sp[1] * dpr), 1, 1).data; dirty(false);
		var hex = "#" + [d[0], d[1], d[2]].map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join(""); setColor(hex); tip("Picked " + hex);
	}
	function replace(id, patch) { doc.objs = doc.objs.map(function (o) { return o.id === id ? prep(clone(o, patch)) : o; }); }

	/* ---------- text ---------- */
	var ted = $("dr-ted");
	function newText(x, y) {
		var o = prep({ t: "text", s: "", x: x, y: y - S.fs * 0.6, size: S.fs, font: S.font, c: S.c, b: S.b, i: S.i, al: S.al, sc: S.sOn ? S.sc : null, bgc: S.fOn ? S.fc : null, o: S.o, m: D.I.slice() });
		editing = { id: o.id, obj: o, fresh: true }; openEditor(o);
	}
	function editText(o) { sel = [o.id]; editing = { id: o.id, obj: o, fresh: false }; openEditor(o); dirty(); }
	function openEditor(o) {
		ted.hidden = false; ted.value = o.s; placeEditor(); setTimeout(function () { ted.focus(); if (!editing.fresh) ted.select(); }, 0);
		tip("Type, then click outside or press Ctrl+Enter. Esc cancels.");
	}
	function placeEditor() {
		if (!editing) return; var o = editing.obj, sc = D.mScale(o.m), k = view.s * sc, p0 = D.ap(o.m, o.x, o.y), p = toScreen(p0[0], p0[1]);
		ted.style.font = fontOf(o, k); ted.style.color = o.c; ted.style.lineHeight = "1.2"; ted.style.textAlign = o.al === "c" ? "center" : o.al === "r" ? "right" : "left";
		ted.style.textShadow = o.sc ? "0 0 2px " + o.sc + ", 0 0 2px " + o.sc : "none"; ted.style.background = o.bgc || "rgba(255,255,255,.05)";
		var lines = ted.value.split("\n"), wpx = 0; mctx.font = fontOf(o, k); lines.forEach(function (l) { wpx = Math.max(wpx, mctx.measureText(l || " ").width); });
		wpx = Math.max(wpx + o.size * k * 0.6, 40); var hpx = lines.length * o.size * k * 1.2 + 4;
		var left = p[0] - (o.al === "c" ? wpx / 2 : o.al === "r" ? wpx : 0);
		ted.style.left = left + "px"; ted.style.top = p[1] + "px"; ted.style.width = wpx + "px"; ted.style.height = hpx + "px";
	}
	ted.addEventListener("input", function () { placeEditor(); });
	ted.addEventListener("keydown", function (e) {
		e.stopPropagation();
		if (e.key === "Escape") { e.preventDefault(); var fresh = editing && editing.fresh; editing = null; ted.hidden = true; if (fresh) { /* nothing made */ } dirty(); cv.focus(); return; }
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishText(); cv.focus(); }
	});
	ted.addEventListener("blur", function () { setTimeout(function () { if (editing && document.activeElement !== ted) finishText(); }, 0); });
	function finishText() {
		if (!editing) return; var ed = editing, s = ted.value.replace(/\s+$/, ""); editing = null; ted.hidden = true;
		if (ed.fresh) { if (!s) { dirty(); return; } var o = prep(clone(ed.obj, { s: s })); doc.objs = doc.objs.concat([o]); sel = [o.id]; afterMake(); return; }
		if (!s) { doc.objs = doc.objs.filter(function (x) { return x.id !== ed.id; }); sel = []; commit(); return; }
		if (s !== ed.obj.s) { replace(ed.id, { s: s }); commit(); } else dirty();
	}

	/* ---------- inserting things ---------- */
	function viewCentre() { var c = [(W / 2 - view.ox) / view.s, (H / 2 - view.oy) / view.s]; if (c[0] < 0 || c[0] > doc.w || c[1] < 0 || c[1] > doc.h) c = [doc.w / 2, doc.h / 2]; return c; }
	function insertChar(ch, isEmoji, at) {
		var c = at || viewCentre(), size = Math.round(Math.min(doc.w, doc.h) * (isEmoji ? 0.14 : 0.12));
		var o = prep({ t: "text", s: ch, x: c[0], y: c[1] - size * 0.6, size: size, font: isEmoji ? EMOJI_FONT : "\"Segoe UI Symbol\", \"Apple Symbols\", Arial, sans-serif", c: S.c, b: false, i: false, al: "c", sc: null, bgc: null, o: 1, m: D.I.slice() });
		doc.objs = doc.objs.concat([o]); sel = [o.id]; setTool("select"); commit(); tip("Drag it into place, or pull a corner to resize");
	}
	function insertObjs(list, offset) {
		var ids = [], gmap = {};
		list.forEach(function (o) { var n = prep(clone(o, { id: uid(), m: D.mul(D.tr(offset || 0, offset || 0), o.m || D.I) })); if (n.g) { gmap[n.g] = gmap[n.g] || uid(); n.g = gmap[n.g]; } doc.objs.push(n); ids.push(n.id); });
		doc.objs = doc.objs.slice(); sel = ids; setTool("select"); commit();
	}
	function addImageFile(file, at) {
		var url = URL.createObjectURL(file), im = new Image();
		im.onload = function () {
			var mx = 2048, w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, mx / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
			c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
			var src = c.toDataURL("image/webp", 0.92); if (!/^data:image\/webp/.test(src)) src = c.toDataURL("image/png");
			var fitK = Math.min(doc.w * 0.7 / c.width, doc.h * 0.7 / c.height, 1), dw = c.width * fitK, dh = c.height * fitK, ctr = at || viewCentre();
			var o = prep({ t: "img", src: src, x: ctr[0] - dw / 2, y: ctr[1] - dh / 2, w: dw, h: dh, o: 1, m: D.I.slice() });
			doc.objs = doc.objs.concat([o]); sel = [o.id]; setTool("select"); commit(); tip("Picture added");
		};
		im.onerror = function () { URL.revokeObjectURL(url); toast("That picture could not be opened"); };
		im.src = url;
	}
	function openFiles(files, at) {
		Array.from(files || []).forEach(function (f) {
			if (/^image\//.test(f.type)) addImageFile(f, at);
			else if (/\.(mesdraw|json)$/i.test(f.name) || f.type === "application/json") f.text().then(function (t) { var d = D.parse(t); if (!d) { toast("That is not a MES Draw file"); return; } saveNow(); d.id = uid(); setDoc(d, true); toast("Opened " + d.name); });
		});
	}

	/* ---------- selection actions ---------- */
	function delSel() { if (!sel.length) return; doc.objs = doc.objs.filter(function (o) { return sel.indexOf(o.id) < 0; }); sel = []; commit(); }
	function duplicate(inPlace) { var l = selObjs(); if (!l.length) return; var d = inPlace ? 0 : 24 / view.s; insertObjs(l, d); }
	function order(front) { var l = selObjs(), rest = doc.objs.filter(function (o) { return sel.indexOf(o.id) < 0; }); doc.objs = front ? rest.concat(l) : l.concat(rest); commit(); }
	function flip(h) { var b = selBox(); if (!b) return; var M = h ? D.scaleAt(-1, 1, b.x + b.w / 2, 0) : D.scaleAt(1, -1, 0, b.y + b.h / 2); doc.objs = doc.objs.map(function (o) { return sel.indexOf(o.id) >= 0 ? clone(o, { m: D.mul(M, o.m) }) : o; }); commit(); }
	function group(un) {
		var l = selObjs(); if (!l.length) return;
		if (un || (l.every(function (o) { return o.g && o.g === l[0].g; }))) { doc.objs = doc.objs.map(function (o) { if (sel.indexOf(o.id) < 0) return o; var c = clone(o); delete c.g; return c; }); tip("Ungrouped"); }
		else { if (l.length < 2) { tip("Select two or more things to group them"); return; } var g = uid(); doc.objs = doc.objs.map(function (o) { return sel.indexOf(o.id) >= 0 ? clone(o, { g: g }) : o; }); tip("Grouped: they now move together"); }
		commit();
	}
	function nudge(dx, dy) { if (!sel.length) return; var M = D.tr(dx, dy); doc.objs = doc.objs.map(function (o) { return sel.indexOf(o.id) >= 0 ? clone(o, { m: D.mul(M, o.m) }) : o; }); dirty(); clearTimeout(nudge.t); nudge.t = setTimeout(commit, 400); }
	/* style changes go to the selection when there is one */
	function styleSel(kind, v) {
		var l = selObjs(); if (!l.length || S.tool !== "select") return false;
		l.forEach(function (o) {
			var p = null;
			if (kind === "c") p = o.t === "img" ? null : { c: v };
			else if (kind === "f") p = o.t === "shape" ? { f: v } : o.t === "text" ? { bgc: v } : null;
			else if (kind === "w") p = o.t === "path" ? { w: v } : o.t === "shape" ? { sw: v } : null;
			else if (kind === "o") p = { o: v };
			else if (kind === "dash") p = o.t === "shape" ? { dash: v } : null;
			else if (o.t === "text") { var map = { font: "font", fs: "size", b: "b", i: "i", al: "al", sc: "sc" }; if (map[kind]) { p = {}; p[map[kind]] = v; } }
			if (p) replace(o.id, p);
		});
		clearTimeout(styleSel.t); styleSel.t = setTimeout(commit, 350); dirty(); return true;
	}

	/* ---------- UI: tools + options ---------- */
	function buildTools() {
		var h = "";
		TOOLS.forEach(function (t) { if (t === "-") { h += '<span class="dr-tsep"></span>'; return; } h += '<button type="button" class="dr-tool" data-tool="' + t[0] + '" title="' + t[1] + " (" + t[2] + ')" aria-label="' + t[1] + '" aria-pressed="false"><svg viewBox="0 0 24 24">' + t[3] + '</svg><span class="dr-k">' + t[2] + "</span></button>"; });
		$("dr-tools").innerHTML = h;
		$("dr-tools").addEventListener("click", function (e) { var b = e.target.closest("[data-tool]"); if (b) setTool(b.getAttribute("data-tool")); });
	}
	function setTool(t) {
		if (editing && t !== "text") finishText();
		if (SHAPE_TOOL[t]) { S.kind = SHAPE_TOOL[t]; }
		S.tool = t; saveS();
		Array.prototype.forEach.call(document.querySelectorAll("#dr-tools [data-tool]"), function (b) { var bt = b.getAttribute("data-tool"); b.setAttribute("aria-pressed", String(bt === t || (bt === "shape" && SHAPE_TOOL[t] && false))); });
		var cls = SHAPE_TOOL[t] ? "shape" : t === "fill" || t === "picker" || t === "hand" ? "none" : t;
		Array.prototype.forEach.call(document.querySelectorAll("#dr-opts [data-for]"), function (g) { var f = " " + g.getAttribute("data-for") + " "; g.hidden = f.indexOf(" " + cls + " ") < 0 && !(cls === "select" && false); });
		// size slider label / range by tool
		var wl = $("dr-wl"), w2 = $("dr-w2");
		if (t === "eraser") { wl.textContent = "Size"; w2.min = 4; w2.max = 200; w2.value = S.ew; }
		else if (cls === "shape") { wl.textContent = "Line"; w2.min = 0; w2.max = 60; w2.value = S.sw; }
		else { wl.textContent = "Size"; w2.min = 1; w2.max = 120; w2.value = S.w; }
		$("dr-wv").textContent = w2.value;
		if (t !== "select") { /* keep the selection visible but faint */ }
		uiKind(); uiSel(); dirty(false);
		tip({ brush: "Draw. Hold Shift for a straight line.", eraser: S.emode === "rub" ? "Rub out (paper lines stay)" : "Touch a line, shape or text to remove it", fill: "Click something to paint it, or the page to change its colour", picker: "Click the drawing to take a colour", hand: "Drag to move around", text: "Click where the text should go", select: "Click or drag a box to select. Drag to move.", shape: "Drag to draw. Shift = square / circle, Alt = from the centre" }[cls] || (cls === "shape" ? "" : ""));
	}
	function uiSel() {
		var has = sel.length > 0 && S.tool === "select"; $("dr-selacts").hidden = !has;
		if (has) {
			var l = selObjs(), o = l[0];
			// show the options that fit the selection
			var types = {}; l.forEach(function (x) { types[x.t] = 1; });
			Array.prototype.forEach.call(document.querySelectorAll("#dr-opts [data-for]"), function (g) { var f = g.getAttribute("data-for"); g.hidden = !(f.indexOf("select") >= 0 || (types.text && f === "text")); });
			var allg = l.length > 1 && l.every(function (x) { return x.g && x.g === l[0].g; }); $("dr-group").textContent = allg ? "Ungroup" : "Group";
			if (o && l.length === 1) {
				if (o.c) setSw("dr-cdot", o.c);
				if (o.t === "shape") { $("dr-w2").min = 0; $("dr-w2").max = 60; $("dr-w2").value = o.sw; $("dr-wv").textContent = o.sw; $("dr-fon").checked = !!o.f; if (o.f) setSw("dr-fdot", o.f); }
				else if (o.t === "path") { $("dr-w2").min = 1; $("dr-w2").max = 120; $("dr-w2").value = o.w; $("dr-wv").textContent = Math.round(o.w); }
				if (o.t === "text") { $("dr-fs").value = Math.round(o.size); $("dr-font").value = o.font; $("dr-bold").setAttribute("aria-pressed", String(!!o.b)); $("dr-ital").setAttribute("aria-pressed", String(!!o.i)); segSet("dr-al", o.al || "l"); $("dr-son").checked = !!o.sc; $("dr-fon").checked = !!o.bgc; }
				$("dr-o").value = Math.round((o.o == null ? 1 : o.o) * 100); $("dr-ov").textContent = $("dr-o").value + "%";
			}
		} else if (S.tool === "select") Array.prototype.forEach.call(document.querySelectorAll("#dr-opts [data-for]"), function (g) { g.hidden = true; });
	}
	function setSw(id, c) { $(id).style.background = c; }
	function segSet(id, v) { Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(v))); }); }
	function segWire(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); }); }
	function setColor(c) {
		S.c = c; $("dr-c").value = c; setSw("dr-cdot", c); S.recent = [c].concat(S.recent.filter(function (x) { return x !== c; })).slice(0, 8); saveS(); buildPal(); styleSel("c", c);
	}
	function buildPal() {
		var h = PAL.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (c === S.c) + '"></button>'; }).join("");
		var rec = S.recent.filter(function (c) { return PAL.indexOf(c) < 0; });
		if (rec.length) h += '<span class="dr-palsep"></span>' + rec.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" title="Recent: ' + c + '" aria-label="Recent colour ' + c + '" aria-pressed="' + (c === S.c) + '"></button>'; }).join("");
		$("dr-pal").innerHTML = h;
	}
	function uiKind() { var k = S.kind, nm = (D.SHAPES.filter(function (s) { return s[0] === k; })[0] || ["", "Shape"])[1]; $("dr-kind").innerHTML = '<svg viewBox="0 0 100 100" width="18" height="18" style="vertical-align:-3px;fill:none;stroke:currentColor;stroke-width:8"><path d="' + D.shapeD(k, 12, 18, 76, 64, 8) + '"/></svg> ' + nm; paneShapes(true); }
	function wireOpts() {
		$("dr-cbtn").addEventListener("click", function () { $("dr-c").click(); });
		$("dr-c").addEventListener("input", function () { S.c = this.value; setSw("dr-cdot", S.c); styleSel("c", S.c); });
		$("dr-c").addEventListener("change", function () { setColor(this.value); });
		$("dr-pal").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (b) setColor(b.getAttribute("data-c")); });
		$("dr-fbtn").addEventListener("click", function () { $("dr-f").click(); });
		$("dr-f").addEventListener("input", function () { S.fc = this.value; setSw("dr-fdot", S.fc); S.fOn = true; $("dr-fon").checked = true; saveS(); styleSel("f", S.fc); });
		$("dr-fon").addEventListener("change", function () { S.fOn = this.checked; saveS(); styleSel("f", S.fOn ? S.fc : null); });
		$("dr-w2").addEventListener("input", function () {
			var v = +this.value; $("dr-wv").textContent = v;
			if (styleSel("w", v)) return;
			if (S.tool === "eraser") S.ew = v; else if (S.tool === "shape" || SHAPE_TOOL[S.tool]) S.sw = v; else S.w = v; saveS(); dirty(false);
		});
		$("dr-o").addEventListener("input", function () { var v = +this.value / 100; $("dr-ov").textContent = this.value + "%"; if (!styleSel("o", v)) { S.o = v; saveS(); } });
		$("dr-brush").innerHTML = D.BRUSHES.map(function (b) { return '<option value="' + b[0] + '" title="' + b[2] + '">' + b[1] + "</option>"; }).join("");
		$("dr-brush").value = S.brush; $("dr-brush").addEventListener("change", function () { S.brush = this.value; if (S.brush === "hl" && S.w < 14) { S.w = 22; $("dr-w2").value = 22; $("dr-wv").textContent = 22; } saveS(); });
		$("dr-sym").value = S.sym; $("dr-sym").addEventListener("change", function () { S.sym = this.value; saveS(); dirty(false); if (S.sym !== "off") tip("Symmetry around the middle of the page"); });
		$("dr-smooth").value = S.smooth; $("dr-smooth").addEventListener("input", function () { S.smooth = +this.value; saveS(); });
		segSet("dr-emode", S.emode); segWire("dr-emode", function (v) { S.emode = v; saveS(); setTool("eraser"); });
		$("dr-kind").addEventListener("click", function () { S.side = true; uiSide(); setTab("shapes"); });
		$("dr-dash").checked = S.dash; $("dr-dash").addEventListener("change", function () { S.dash = this.checked; saveS(); styleSel("dash", S.dash); });
		$("dr-font").innerHTML = FONTS.map(function (f) { return '<option value="' + f[0].replace(/"/g, "&quot;") + '" style="font-family:' + f[0].replace(/"/g, "&quot;") + '">' + f[1] + "</option>"; }).join("");
		$("dr-font").value = S.font; $("dr-font").addEventListener("change", function () { S.font = this.value; saveS(); styleSel("font", S.font); if (editing) { editing.obj = clone(editing.obj, { font: S.font }); placeEditor(); } });
		$("dr-fs").value = S.fs; $("dr-fs").addEventListener("input", function () { var v = Math.max(6, Math.min(600, +this.value || 48)); S.fs = v; saveS(); styleSel("fs", v); if (editing) { editing.obj = clone(editing.obj, { size: v }); placeEditor(); } });
		function tg(id, key) { var b = $(id); b.setAttribute("aria-pressed", String(!!S[key])); b.addEventListener("click", function () { var on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); S[key] = on; saveS(); styleSel(key, on); if (editing) { var p = {}; p[key] = on; editing.obj = clone(editing.obj, p); placeEditor(); } }); }
		tg("dr-bold", "b"); tg("dr-ital", "i");
		segSet("dr-al", S.al); segWire("dr-al", function (v) { S.al = v; saveS(); styleSel("al", v); if (editing) { editing.obj = clone(editing.obj, { al: v }); placeEditor(); } });
		$("dr-son").checked = S.sOn; $("dr-sc").value = S.sc;
		$("dr-son").addEventListener("change", function () { S.sOn = this.checked; saveS(); styleSel("sc", S.sOn ? S.sc : null); });
		$("dr-sc").addEventListener("input", function () { S.sc = this.value; S.sOn = true; $("dr-son").checked = true; saveS(); styleSel("sc", S.sc); });
		$("dr-dup").addEventListener("click", function () { duplicate(); });
		$("dr-front").addEventListener("click", function () { order(true); }); $("dr-back").addEventListener("click", function () { order(false); });
		$("dr-fliph").addEventListener("click", function () { flip(true); }); $("dr-flipv").addEventListener("click", function () { flip(false); });
		$("dr-group").addEventListener("click", function () { group(false); }); $("dr-del").addEventListener("click", delSel);
		setSw("dr-cdot", S.c); setSw("dr-fdot", S.fc); $("dr-c").value = S.c; $("dr-f").value = S.fc; $("dr-fon").checked = S.fOn; $("dr-o").value = Math.round(S.o * 100); $("dr-ov").textContent = $("dr-o").value + "%";
	}

	/* ---------- top bar, page, export ---------- */
	function pop(id, btn, open) {
		var p = $(id), on = open === undefined ? p.hidden : open; ["dr-pagepop", "dr-exppop"].forEach(function (x) { $(x).hidden = true; }); ["dr-pagebtn", "dr-expbtn"].forEach(function (x) { $(x).setAttribute("aria-expanded", "false"); });
		p.hidden = !on; $(btn).setAttribute("aria-expanded", String(on)); if (on && id === "dr-exppop") xinfo(); setTimeout(resize, 0);
	}
	function uiPage() {
		if (!doc) return; $("dr-w").value = doc.w; $("dr-h").value = doc.h; $("dr-paper").value = doc.bg.p || "none"; $("dr-bgt").checked = !doc.bg.c; if (doc.bg.c) $("dr-bgc").value = doc.bg.c;
		var m = D.SIZES.filter(function (s) { return s[2] === doc.w && s[3] === doc.h; })[0]; $("dr-size").value = m ? m[0] : "custom";
	}
	function wireBar() {
		$("dr-name").addEventListener("input", function () { doc.name = this.value.trim() || "Untitled drawing"; scheduleSave(); });
		$("dr-new").addEventListener("click", function () { newDoc("blank"); toast("New drawing. Your last one is in My drawings."); });
		$("dr-undo").addEventListener("click", undo); $("dr-redo").addEventListener("click", redo);
		$("dr-zin").addEventListener("click", function () { zoomAt(1.25, W / 2, H / 2); }); $("dr-zout").addEventListener("click", function () { zoomAt(0.8, W / 2, H / 2); }); $("dr-zfit").addEventListener("click", fit);
		$("dr-pagebtn").addEventListener("click", function () { pop("dr-pagepop", "dr-pagebtn"); }); $("dr-pageok").addEventListener("click", function () { pop("dr-pagepop", "dr-pagebtn", false); });
		$("dr-expbtn").addEventListener("click", function () { pop("dr-exppop", "dr-expbtn"); });
		$("dr-sidebtn").addEventListener("click", function () { S.side = !S.side; saveS(); uiSide(); });
		$("dr-size").innerHTML = D.SIZES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + '<option value="custom">Custom</option>';
		$("dr-paper").innerHTML = D.PAPERS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + "</option>"; }).join("");
		$("dr-size").addEventListener("change", function () { var s = D.SIZES.filter(function (x) { return x[0] === this.value; }, this)[0]; if (s) setSize(s[2], s[3]); });
		function wh() { var w = Math.round(+$("dr-w").value), h = Math.round(+$("dr-h").value); if (w >= 16 && h >= 16 && w <= 8000 && h <= 8000) setSize(w, h); }
		$("dr-w").addEventListener("change", wh); $("dr-h").addEventListener("change", wh);
		$("dr-paper").addEventListener("change", function () { doc.bg = { c: doc.bg.c, p: this.value }; commit(); });
		$("dr-bgc").addEventListener("input", function () { doc.bg = { c: this.value, p: doc.bg.p }; $("dr-bgt").checked = false; dirty(); });
		$("dr-bgc").addEventListener("change", function () { commit(); });
		$("dr-bgt").addEventListener("change", function () { doc.bg = { c: this.checked ? null : $("dr-bgc").value, p: doc.bg.p }; commit(); });
		segSet("dr-fmt", S.fmt); segWire("dr-fmt", function (v) { S.fmt = v; saveS(); xinfo(); });
		segSet("dr-scale", String(S.scale)); segWire("dr-scale", function (v) { S.scale = +v; saveS(); xinfo(); });
		segSet("dr-what", S.what); segWire("dr-what", function (v) { S.what = v; saveS(); xinfo(); });
		$("dr-xbg").checked = S.xbg; $("dr-xpaper").checked = S.xpaper;
		$("dr-xbg").addEventListener("change", function () { S.xbg = this.checked; saveS(); xinfo(); }); $("dr-xpaper").addEventListener("change", function () { S.xpaper = this.checked; saveS(); });
		$("dr-xdl").addEventListener("click", download); $("dr-xcopy").addEventListener("click", copyImage); $("dr-xphoto").addEventListener("click", toPhoto);
		$("dr-xsave").addEventListener("click", function () { blobDl(new Blob([D.serialize(doc)], { type: "application/json" }), fileBase() + ".mesdraw"); toast("Saved " + fileBase() + ".mesdraw"); });
		$("dr-xopen").addEventListener("click", function () { $("dr-file").click(); });
		$("dr-file").addEventListener("change", function () { openFiles(this.files); this.value = ""; });
	}
	function setSize(w, h) { doc.w = w; doc.h = h; commit(); uiPage(); fit(); }
	function uiSide() { root.classList.toggle("dr-noside", !S.side); $("dr-sidebtn").setAttribute("aria-pressed", String(S.side)); setTimeout(resize, 0); }

	/* rendering a drawing to any canvas (export, thumbnails) */
	function cropBox() {
		if (S.what === "sel" && sel.length) return pad(selBox());
		if (S.what === "trim") { var l = doc.objs.filter(function (o) { return !(o.t === "path" && o.brush === "erase"); }); if (l.length) { var b = pad(D.unionBox(l)); var x0 = Math.max(0, b.x), y0 = Math.max(0, b.y); return { x: x0, y: y0, w: Math.min(doc.w, b.x + b.w) - x0, h: Math.min(doc.h, b.y + b.h) - y0 }; } }
		return { x: 0, y: 0, w: doc.w, h: doc.h };
	}
	function pad(b) { var p = Math.max(4, Math.min(b.w, b.h) * 0.03); return { x: Math.floor(b.x - p), y: Math.floor(b.y - p), w: Math.ceil(b.w + p * 2), h: Math.ceil(b.h + p * 2) }; }
	function renderTo(d, k, crop, o) {
		o = o || {}; var c = document.createElement("canvas"), w = Math.max(1, Math.round(crop.w * k)), h = Math.max(1, Math.round(crop.h * k)); c.width = w; c.height = h;
		var g = c.getContext("2d"), T = [k, 0, 0, k, -crop.x * k, -crop.y * k], onlySel = o.onlySel;
		if (o.bg && d.bg.c) { g.fillStyle = d.bg.c; g.fillRect(0, 0, w, h); } else if (o.white) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); }
		if (o.paper && d.bg.p && d.bg.p !== "none") { g.setTransform.apply(g, T); D.paper(d.bg.p, d.w, d.h).forEach(function (l) { var p = new Path2D(l.d); if (l.fill) { g.fillStyle = l.fill; g.fill(p); } else { g.strokeStyle = l.stroke; g.lineWidth = Math.max(l.sw, 0.7 / k); g.stroke(p); } }); g.setTransform(1, 0, 0, 1, 0, 0); }
		var ic = document.createElement("canvas"); ic.width = w; ic.height = h; var ig = ic.getContext("2d"); ig.setTransform.apply(ig, T);
		var ed = editing; editing = null;
		d.objs.forEach(function (ob) { if (onlySel && sel.indexOf(ob.id) < 0 && !(ob.t === "path" && ob.brush === "erase")) return; drawObj(ig, ob, k); });
		editing = ed; g.drawImage(ic, 0, 0); return c;
	}
	function thumb(d, max) { try { var k = Math.min(max / d.w, max / d.h); return renderTo(d, k, { x: 0, y: 0, w: d.w, h: d.h }, { bg: true, paper: true, white: false }).toDataURL("image/webp", 0.7); } catch (e) { return ""; } }
	function fileBase() { return (doc.name || "drawing").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "drawing"; }
	function xinfo() { var c = cropBox(), k = S.fmt === "svg" ? 1 : S.scale; $("dr-xinfo").textContent = S.fmt === "svg" ? "SVG: " + c.w + " × " + c.h + " (sharp at any size)" : Math.round(c.w * k) + " × " + Math.round(c.h * k) + " pixels" + (S.fmt === "png" && (!S.xbg || !doc.bg.c) ? " · see-through background" : ""); }
	function exportBlob() {
		var crop = cropBox(), onlySel = S.what === "sel" && sel.length > 0;
		if (S.fmt === "svg") {
			var sub = { w: crop.w, h: crop.h, bg: S.xbg ? doc.bg : { c: null, p: S.xpaper ? doc.bg.p : "none" }, objs: doc.objs.filter(function (o) { return !onlySel || sel.indexOf(o.id) >= 0 || (o.t === "path" && o.brush === "erase"); }).map(function (o) { return clone(o, { m: D.mul(D.tr(-crop.x, -crop.y), o.m) }); }) };
			if (!S.xpaper) sub.bg = { c: sub.bg.c, p: "none" };
			return Promise.resolve(new Blob([D.toSVG(sub, { bg: S.xbg, paper: S.xpaper })], { type: "image/svg+xml" }));
		}
		var c = renderTo(doc, S.scale, crop, { bg: S.xbg, paper: S.xpaper, white: S.fmt === "jpeg", onlySel: onlySel });
		return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error("too big")); }, S.fmt === "jpeg" ? "image/jpeg" : "image/png", 0.92); });
	}
	function blobDl(b, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
	function download() { exportBlob().then(function (b) { var ext = S.fmt === "jpeg" ? "jpg" : S.fmt; blobDl(b, fileBase() + "." + ext); toast("Downloaded " + fileBase() + "." + ext); }, function () { toast("That is too big for this browser: try a smaller size"); }); }
	function copyImage() {
		if (!navigator.clipboard || !window.ClipboardItem) { toast("This browser can't copy pictures: use Download"); return; }
		var keep = S.fmt; if (S.fmt !== "png") S.fmt = "png"; var p = exportBlob(); S.fmt = keep;
		navigator.clipboard.write([new ClipboardItem({ "image/png": p })]).then(function () { toast("Copied: paste it anywhere with Ctrl+V"); }, function () { toast("Could not copy: try Download"); });
	}
	function toPhoto() {
		var I = window.MESImg; var keep = S.fmt; S.fmt = "png"; var p = exportBlob(); S.fmt = keep;
		if (!I || !I.handoffSend) { window.open("/photo", "_blank"); return; }
		var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) {}
		p.then(function (b) { return I.handoffPut([{ blob: b, name: fileBase() + ".png", type: "image/png" }]); }).then(function (id) { var url = "/photo?handoff=" + encodeURIComponent(id); if (w && !w.closed) { try { w.opener = null; } catch (e) {} w.location.href = url; toast("Opened in the Photo Editor in a new tab"); } else location.href = url; }, function () { if (w) w.close(); toast("Could not hand the picture over"); });
	}

	/* ---------- side panel ---------- */
	function setTab(t) {
		S.tab = t; saveS();
		Array.prototype.forEach.call(document.querySelectorAll("#dr-tabs [role=tab]"), function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
		["shapes", "emoji", "symbols", "tpl", "mine"].forEach(function (x) { $("dr-p-" + x).hidden = x !== t; });
		({ shapes: paneShapes, emoji: function () { paneChars("emoji"); }, symbols: function () { paneChars("symbols"); }, tpl: paneTpl, mine: paneMine })[t]();
	}
	function paneShapes(onlyMark) {
		var el = $("dr-p-shapes");
		if (!el.firstChild || !onlyMark) {
			el.innerHTML = '<div class="dr-gh">Pick a shape, then drag on the page</div><div class="dr-shgrid">' + D.SHAPES.map(function (s) { return '<button type="button" class="dr-sh" data-k="' + s[0] + '" title="' + s[1] + '" aria-label="' + s[1] + '" aria-pressed="false"><svg viewBox="0 0 100 100"><path d="' + D.shapeD(s[0], 12, 16, 76, 68, 6) + '"/></svg></button>'; }).join("") + "</div>" +
				'<p class="dr-empty" style="margin-top:.7em">Fill, line width, dashes and colour are in the bar above. Hold <b>Shift</b> while dragging for a perfect square, circle or straight line.</p>';
		}
		Array.prototype.forEach.call(el.querySelectorAll(".dr-sh"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-k") === S.kind)); });
	}
	var charState = { emoji: { q: "", g: "" }, symbols: { q: "", g: "" } };
	function paneChars(which) {
		var el = $("dr-p-" + which), data = which === "emoji" ? D.EMOJI : D.SYMBOLS, st = charState[which];
		if (!el.querySelector(".dr-search")) {
			el.innerHTML = '<input type="search" class="dr-search" placeholder="Search ' + (which === "emoji" ? "emoji (cat, heart, star…)" : "symbols (arrow, pi, check…)") + '" aria-label="Search"><div class="dr-chips"></div><div class="dr-cl"></div><p class="dr-empty" style="margin-top:.6em">Click to put it in the middle of the page, or drag it onto the page.</p>';
			el.querySelector(".dr-search").addEventListener("input", function () { st.q = this.value; listChars(which); });
			el.querySelector(".dr-chips").addEventListener("click", function (e) { var b = e.target.closest("[data-g]"); if (!b) return; st.g = st.g === b.getAttribute("data-g") ? "" : b.getAttribute("data-g"); listChars(which); });
			el.querySelector(".dr-cl").addEventListener("click", function (e) { var b = e.target.closest("[data-ch]"); if (b) insertChar(b.getAttribute("data-ch"), which === "emoji"); });
			el.querySelector(".dr-cl").addEventListener("dragstart", function (e) { var b = e.target.closest("[data-ch]"); if (b) { e.dataTransfer.setData("text/plain", b.getAttribute("data-ch")); e.dataTransfer.setData("application/x-mes-draw-kind", which); e.dataTransfer.effectAllowed = "copy"; } });
		}
		el.querySelector(".dr-chips").innerHTML = Object.keys(data).map(function (g) { return '<button type="button" class="dr-chip" data-g="' + g + '" aria-pressed="' + (st.g === g) + '">' + g + "</button>"; }).join("");
		listChars(which);
	}
	function listChars(which) {
		var el = $("dr-p-" + which), data = which === "emoji" ? D.EMOJI : D.SYMBOLS, st = charState[which], cls = which === "emoji" ? "dr-gi" : "dr-gi dr-gi--sym", h = "";
		Array.prototype.forEach.call(el.querySelectorAll(".dr-chip"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-g") === st.g)); });
		var list = D.search(data, st.q).filter(function (e) { return !st.g || e.group === st.g; }), lastG = "";
		list.forEach(function (e) { if (e.group !== lastG) { if (lastG) h += "</div>"; h += '<div class="dr-gh">' + e.group + '</div><div class="dr-grid">'; lastG = e.group; } h += '<button type="button" class="' + cls + '" data-ch="' + e.ch + '" title="' + e.words + '" aria-label="' + e.words + '" draggable="true">' + e.ch + "</button>"; });
		if (lastG) h += "</div>"; el.querySelector(".dr-cl").innerHTML = h || '<p class="dr-empty">Nothing found.</p>';
	}
	var tplThumbs = {}, tplCat = "";
	function paneTpl() {
		var el = $("dr-p-tpl"), cats = [];
		D.TEMPLATES.forEach(function (t) { if (cats.indexOf(t.cat) < 0) cats.push(t.cat); });
		var h = '<div class="dr-chips">' + ['<button type="button" class="dr-chip" data-cat="" aria-pressed="' + (!tplCat) + '">All</button>'].concat(cats.map(function (c) { return '<button type="button" class="dr-chip" data-cat="' + c + '" aria-pressed="' + (tplCat === c) + '">' + c + "</button>"; })).join("") + "</div>";
		cats.filter(function (c) { return !tplCat || c === tplCat; }).forEach(function (c) {
			h += '<div class="dr-gh">' + c + '</div><div class="dr-tgrid">' + D.TEMPLATES.filter(function (t) { return t.cat === c; }).map(function (t) { return '<button type="button" class="dr-tc" data-tpl="' + t.id + '"><span class="dr-tph" data-th="' + t.id + '"></span><span>' + t.name + "</span></button>"; }).join("") + "</div>";
		});
		h += '<p class="dr-empty" style="margin-top:.7em">A template starts a new drawing; the one you were working on stays in My drawings.</p>';
		el.innerHTML = h;
		el.onclick = function (e) {
			var cb = e.target.closest("[data-cat]"); if (cb) { tplCat = cb.getAttribute("data-cat"); paneTpl(); return; }
			var b = e.target.closest("[data-tpl]"); if (!b) return; var t = D.TEMPLATES.filter(function (x) { return x.id === b.getAttribute("data-tpl"); })[0];
			newDoc(t.id, t.name); toast("Started “" + t.name + "”. Your last drawing is in My drawings.");
		};
		var todo = Array.prototype.slice.call(el.querySelectorAll("[data-th]"));
		(function next() {
			var t0 = performance.now();
			while (todo.length && performance.now() - t0 < 25) { var sp = todo.shift(), id = sp.getAttribute("data-th"); if (!tplThumbs[id]) { var d = D.template(id); d.objs.forEach(prep); tplThumbs[id] = thumb(d, 200); } var im = new Image(); im.alt = ""; im.src = tplThumbs[id]; sp.replaceWith(im); }
			if (todo.length) setTimeout(next, 16);
		})();
	}
	var deleted = null;
	function paneMine() {
		var el = $("dr-p-mine");
		getAll().then(function (list) {
			list.sort(function (a, b) { return b.t - a.t; });
			if (!list.length) { el.innerHTML = '<p class="dr-empty">No drawings yet.</p>'; return; }
			el.innerHTML = '<div class="dr-gh">' + list.length + " drawing" + (list.length === 1 ? "" : "s") + ' in this browser</div><div class="dr-tgrid">' + list.map(function (d) {
				var when = new Date(d.t).toLocaleDateString([], { month: "short", day: "numeric" }) + " " + new Date(d.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
				return '<div class="dr-tc' + (doc && d.id === doc.id ? " is-cur" : "") + '" data-id="' + d.id + '" role="button" tabindex="0" title="Open ' + escA(d.name) + '">' + (d.thumb ? '<img src="' + d.thumb + '" alt="">' : '<span class="dr-tph"></span>') + "<span>" + escH(d.name) + "</span><small>" + when + '</small><span class="dr-mrow"><button type="button" data-act="dup">Copy</button><button type="button" data-act="del">Delete</button></span></div>';
			}).join("") + '</div><p class="dr-empty" style="margin-top:.7em">Kept in this browser only. To move a drawing to another computer, use Export → Save as .mesdraw file.</p>';
			el.onclick = function (e) {
				var card = e.target.closest("[data-id]"); if (!card) return; var id = card.getAttribute("data-id"), act = e.target.closest("[data-act]");
				if (act && act.getAttribute("data-act") === "del") {
					getDoc(id).then(function (rec) { deleted = rec; return tx("readwrite", function (st) { st.delete(id); }); }).then(function () {
						if (doc && doc.id === id) { setDoc(D.template("blank"), false); } paneMine(); toast("Deleted", "Undo", function () { if (deleted) tx("readwrite", function (st) { st.put(deleted); }).then(paneMine); });
					}); return;
				}
				if (act && act.getAttribute("data-act") === "dup") { getDoc(id).then(function (rec) { if (!rec) return; rec.id = uid(); rec.name = rec.name + " (copy)"; rec.t = Date.now(); return tx("readwrite", function (st) { st.put(rec); }); }).then(paneMine); return; }
				if (doc && id === doc.id) return; saveNow().then(function () { return getDoc(id); }).then(function (rec) { if (rec) { setDoc(rec, false); paneMine(); } });
			};
		});
	}
	function escH(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
	function escA(s) { return escH(s).replace(/"/g, "&quot;"); }

	/* ---------- toasts / tips ---------- */
	var tipT = 0;
	function tip(t) { var el = $("dr-tip"); if (!t) return; el.textContent = t; el.classList.add("is-on"); clearTimeout(tipT); tipT = setTimeout(function () { el.classList.remove("is-on"); }, 1800); }
	var toastT = 0;
	function toast(t, act, fn) { var el = $("dr-toast"); el.innerHTML = ""; el.appendChild(document.createTextNode(t)); if (act) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-btn"; b.style.marginLeft = "0.7em"; b.textContent = act; b.onclick = function () { fn(); el.classList.remove("tu-toast--show"); }; el.appendChild(b); } el.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("tu-toast--show"); }, act ? 6000 : 2600); }

	/* ---------- keyboard, clipboard, drop ---------- */
	document.addEventListener("pointerdown", function (e) { active = !!(e.target.closest && e.target.closest("#dr-view")); }, true);
	function typing(e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
	document.addEventListener("keydown", function (e) {
		if (!active || typing(e) || editing) return;
		var k = e.key, mod = e.ctrlKey || e.metaKey, done = true;
		if (mod && (k === "z" || k === "Z")) { if (e.shiftKey) redo(); else undo(); }
		else if (mod && (k === "y" || k === "Y")) redo();
		else if (mod && (k === "a" || k === "A")) { setTool("select"); sel = doc.objs.filter(function (o) { return !(o.t === "path" && o.brush === "erase"); }).map(function (o) { return o.id; }); uiSel(); dirty(false); }
		else if (mod && (k === "d" || k === "D")) duplicate();
		else if (mod && (k === "g" || k === "G")) group(e.shiftKey);
		else if (mod && (k === "e" || k === "E")) pop("dr-exppop", "dr-expbtn", true);
		else if (mod && (k === "s" || k === "S")) { saveNow(); toast("Saved in this browser. For a file, use Export → Save as .mesdraw file."); }
		else if (mod && k === "]") order(true); else if (mod && k === "[") order(false);
		else if (mod) done = false;
		else if (k === "Delete" || k === "Backspace") delSel();
		else if (k === "Escape") { if (op) cancelOp(); else { sel = []; uiSel(); dirty(false); } pop("dr-pagepop", "dr-pagebtn", false); }
		else if (k.indexOf("Arrow") === 0 && sel.length) { var st = (e.shiftKey ? 10 : 1); nudge(k === "ArrowLeft" ? -st : k === "ArrowRight" ? st : 0, k === "ArrowUp" ? -st : k === "ArrowDown" ? st : 0); }
		else if (k === " ") { if (!spaceDown) { spaceDown = true; cv.style.cursor = "grab"; } }
		else if (k === "+" || k === "=") zoomAt(1.25, W / 2, H / 2); else if (k === "-" || k === "_") zoomAt(0.8, W / 2, H / 2); else if (k === "0") fit();
		else if (k === "[" || k === "]") { var w2 = $("dr-w2"); w2.value = Math.max(+w2.min, Math.min(+w2.max, +w2.value + (k === "]" ? 1 : -1) * Math.max(1, Math.round(+w2.value * 0.15)))); w2.dispatchEvent(new Event("input")); tip("Size " + w2.value); }
		else { var map = { v: "select", h: "hand", b: "brush", p: "brush", e: "eraser", s: "shape", r: "rect", o: "ellipse", l: "line", a: "arrow", t: "text", f: "fill", i: "picker" }; var tl = map[k.toLowerCase()]; if (tl) setTool(tl); else done = false; }
		if (done) e.preventDefault();
	});
	document.addEventListener("keyup", function (e) { if (e.key === " ") { spaceDown = false; if (hover) cursor(hover); } });
	window.addEventListener("blur", function () { spaceDown = false; });
	document.addEventListener("copy", function (e) { if (!active || typing(e) || !sel.length) return; e.clipboardData.setData("text/plain", JSON.stringify({ app: "mes-draw-clip", objs: selObjs().map(D.cleanObj) })); e.preventDefault(); tip("Copied"); });
	document.addEventListener("cut", function (e) { if (!active || typing(e) || !sel.length) return; e.clipboardData.setData("text/plain", JSON.stringify({ app: "mes-draw-clip", objs: selObjs().map(D.cleanObj) })); e.preventDefault(); delSel(); });
	document.addEventListener("paste", function (e) {
		if (!active || typing(e) || editing) return; var cd = e.clipboardData; if (!cd) return;
		var files = Array.from(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
		if (files.length) { e.preventDefault(); files.forEach(function (f) { addImageFile(f); }); return; }
		var t = cd.getData("text/plain"); if (!t) return; e.preventDefault();
		try { var j = JSON.parse(t); if (j && j.app === "mes-draw-clip" && Array.isArray(j.objs)) { insertObjs(j.objs.map(D.cleanObj).filter(Boolean), 24 / view.s); return; } } catch (x) {}
		var c = viewCentre(), o = prep({ t: "text", s: t.slice(0, 2000), x: c[0], y: c[1], size: S.fs, font: S.font, c: S.c, b: S.b, i: S.i, al: "c", sc: S.sOn ? S.sc : null, bgc: null, o: 1, m: D.I.slice() });
		doc.objs = doc.objs.concat([o]); sel = [o.id]; setTool("select"); commit();
	});
	stage.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
	stage.addEventListener("drop", function (e) {
		e.preventDefault(); active = true; var at = toBoard(e.clientX, e.clientY);
		if (e.dataTransfer.files && e.dataTransfer.files.length) { openFiles(e.dataTransfer.files, at); return; }
		var ch = e.dataTransfer.getData("text/plain"), kind = e.dataTransfer.getData("application/x-mes-draw-kind");
		if (ch && ch.length <= 16) insertChar(ch, kind !== "symbols", at);
	});
	stage.addEventListener("wheel", function (e) {
		var full = $("dr-view").classList.contains("mes-pfill");
		if (!(e.ctrlKey || e.metaKey || full)) return; e.preventDefault(); var sp = local(e);
		if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), sp[0], sp[1]);
		else if (e.shiftKey) { view.ox -= e.deltaY; view.fit = false; dirty(false); } else { view.ox -= e.deltaX; view.oy -= e.deltaY; view.fit = false; dirty(false); }
	}, { passive: false });

	/* ---------- start ---------- */
	buildTools(); wireOpts(); wireBar(); buildPal();
	$("dr-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) setTab(b.getAttribute("data-t")); });
	$("dr-tabs").addEventListener("keydown", function (e) { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; var bs = Array.from(this.querySelectorAll("[data-t]")), i = bs.findIndex(function (b) { return b.getAttribute("aria-selected") === "true"; }); i = (i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length; setTab(bs[i].getAttribute("data-t")); bs[i].focus(); e.preventDefault(); });
	$("dr-p-shapes").addEventListener("click", function (e) { var b = e.target.closest("[data-k]"); if (!b) return; S.kind = b.getAttribute("data-k"); saveS(); setTool("shape"); uiKind(); tip("Now drag on the page to draw it"); });
	readDesk(); new MutationObserver(function () { readDesk(); dirty(false); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); window.addEventListener("resize", resize);
	uiSide(); resize();
	function startDoc(d) { if (d) setDoc(d, false); else newDoc("blank"); setTool(S.tool || "brush"); setTab(S.tab || "shapes"); handoff(); }
	(S.last ? getDoc(S.last) : Promise.resolve(null)).then(startDoc, function () { startDoc(null); });
	function handoff() { var I = window.MESImg; if (I && I.handoffReceive && /[?&]handoff=/.test(location.search)) I.handoffReceive().then(function (files) { files.forEach(function (f) { addImageFile(f); }); }); }
	window.addEventListener("pagehide", function () { if (saveTimer) saveNow(); });
	document.addEventListener("visibilitychange", function () { if (document.hidden && saveTimer) saveNow(); });
	function panelInit() { if (window.MESPanel && window.MESPanel.add) window.MESPanel.add($("dr-view"), { bar: $("dr-bar"), stage: $("dr-main"), onChange: function () { setTimeout(function () { resize(); fit(); }, 30); } }); else setTimeout(panelInit, 200); }
	panelInit();
	window.MESDrawDebug = { get doc() { return doc; }, get sel() { return sel; }, set sel(v) { sel = v; uiSel(); dirty(false); }, setTool: setTool, render: function () { render(); }, toBoard: toBoard, toScreen: toScreen, view: view, insertChar: insertChar, newDoc: newDoc, exportBlob: exportBlob, S: S };
})();
