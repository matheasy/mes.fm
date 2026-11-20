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

/* MES Screen Recorder: pure helpers (no DOM). Layout of the captures on the output picture, dragging / resizing them, crop boxes, the
 * pause-aware timer, recorder format choice and file names. Node: require('./tool_apps_src/screen-recorder/lib.js'); tests in
 * tool_apps_src/screen-recorder-tests.js. Rectangles are {x, y, w, h} in output pixels unless said otherwise. */
var MESRec = (function () {
	"use strict";
	var R = {};
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	R.clamp = clamp;

	/* ---------- output sizes ---------- */
	R.SIZES = [
		["auto", "Match the first screen"], ["1920x1080", "1080p (1920 × 1080)"], ["1280x720", "720p (1280 × 720)"], ["2560x1440", "1440p (2560 × 1440)"],
		["3840x2160", "4K (3840 × 2160)"], ["1080x1920", "Phone, upright (1080 × 1920)"], ["1080x1080", "Square (1080 × 1080)"]
	];
	/* "1920x1080" -> {w, h}; "auto" -> the first video source's own size (even numbers, at most 3840 wide), else 1920x1080 */
	R.outSize = function (pref, first) {
		var m = /^(\d+)x(\d+)$/.exec(pref || "");
		if (m) return { w: +m[1], h: +m[2] };
		if (first && first.w > 0 && first.h > 0) {
			var k = Math.min(1, 3840 / Math.max(first.w, first.h));
			return { w: Math.max(2, Math.round(first.w * k / 2) * 2), h: Math.max(2, Math.round(first.h * k / 2) * 2) };
		}
		return { w: 1920, h: 1080 };
	};

	/* box of size (sw, sh) fitted into r: contain = whole picture shows (bars), cover = fills r (edges cut). Returns {x, y, w, h} of the drawn picture. */
	R.fit = function (sw, sh, r, mode) {
		if (!(sw > 0 && sh > 0)) return { x: r.x, y: r.y, w: r.w, h: r.h };
		var k = mode === "cover" ? Math.max(r.w / sw, r.h / sh) : Math.min(r.w / sw, r.h / sh), w = sw * k, h = sh * k;
		return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w: w, h: h };
	};

	/* ---------- layouts ----------
	 * srcs = [{kind: "screen"|"camera"|"image", w, h}] in drawing order (first = bottom). Returns one rect per source.
	 * pip: first screen fills the picture, other screens / cameras are small boxes along the bottom right, cameras round.
	 * side: all video sources side by side in one row (or column on an upright picture). grid: a square-ish grid. full: first fills, others hidden. */
	R.LAYOUTS = [["pip", "Screen + small boxes"], ["side", "Side by side"], ["grid", "Grid"], ["full", "First one only"]];
	R.layout = function (srcs, W, H, mode) {
		var n = srcs.length, out = [], i;
		if (!n) return out;
		var main = 0; for (i = 0; i < n; i++) if (srcs[i].kind === "screen") { main = i; break; }
		if (mode === "full") {
			for (i = 0; i < n; i++) out.push(i === main ? { x: 0, y: 0, w: W, h: H, hide: false } : { x: 0, y: 0, w: W / 4, h: H / 4, hide: true });
			return out;
		}
		if (mode === "side" || mode === "grid") {
			var cols, rows;
			if (mode === "side") { if (W >= H) { cols = n; rows = 1; } else { cols = 1; rows = n; } }
			else { cols = Math.ceil(Math.sqrt(n * W / H / (16 / 9))); cols = clamp(cols, 1, n); rows = Math.ceil(n / cols); }
			var cw = W / cols, ch = H / rows;
			for (i = 0; i < n; i++) {
				var c = i % cols, rw = Math.floor(i / cols), cell = { x: c * cw, y: rw * ch, w: cw, h: ch }, f = R.fit(srcs[i].w || 16, srcs[i].h || 9, cell, "contain");
				out.push({ x: f.x, y: f.y, w: f.w, h: f.h, hide: false });
			}
			return out;
		}
		// pip
		var small = Math.round(Math.min(W, H) * 0.28), pad = Math.round(Math.min(W, H) * 0.03), x = W - pad;
		for (i = n - 1; i >= 0; i--) {
			if (i === main) continue;
			var s = srcs[i], bw, bh;
			if (s.kind === "camera") { bw = bh = small; }
			else { var ar = (s.w || 16) / (s.h || 9); bh = small; bw = Math.round(bh * ar); if (bw > W * 0.4) { bw = Math.round(W * 0.4); bh = Math.round(bw / ar); } }
			x -= bw; out[i] = { x: x, y: H - pad - bh, w: bw, h: bh, hide: false }; x -= pad;
			if (x < W * 0.15) x = W - pad;   // wrap back: never runs off the left edge
		}
		var m = srcs[main], mf = R.fit(m.w || W, m.h || H, { x: 0, y: 0, w: W, h: H }, "contain");
		out[main] = { x: mf.x, y: mf.y, w: mf.w, h: mf.h, hide: false };
		return out;
	};

	/* ---------- picking, moving, resizing on the preview ---------- */
	/* topmost visible rect containing (px, py); rects in drawing order. -1 = none */
	R.hit = function (rects, px, py) {
		for (var i = rects.length - 1; i >= 0; i--) { var r = rects[i]; if (r && !r.hide && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i; }
		return -1;
	};
	/* which corner handle of r is under (px, py) within tol: "nw" | "ne" | "sw" | "se" | null */
	R.handleAt = function (r, px, py, tol) {
		var cs = { nw: [r.x, r.y], ne: [r.x + r.w, r.y], sw: [r.x, r.y + r.h], se: [r.x + r.w, r.y + r.h] };
		for (var k in cs) if (Math.abs(px - cs[k][0]) <= tol && Math.abs(py - cs[k][1]) <= tol) return k;
		return null;
	};
	/* moved by (dx, dy), kept at least `keep` px inside the picture */
	R.move = function (r, dx, dy, W, H, keep) {
		keep = keep == null ? 24 : keep;
		return { x: clamp(r.x + dx, keep - r.w, W - keep), y: clamp(r.y + dy, keep - r.h, H - keep), w: r.w, h: r.h, hide: r.hide };
	};
	/* resized by dragging corner `h` by (dx, dy), the opposite corner stays put; aspect kept unless free; min size `min` px */
	R.resize = function (r, h, dx, dy, opt) {
		opt = opt || {}; var min = opt.min || 40, ar = r.w / r.h;
		var x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
		if (h.indexOf("w") >= 0) x0 += dx; else x1 += dx;
		if (h.indexOf("n") >= 0) y0 += dy; else y1 += dy;
		var w = Math.max(min, x1 - x0), hh = Math.max(min, y1 - y0);
		if (!opt.free) { if (Math.abs(dx) * r.h >= Math.abs(dy) * r.w) hh = w / ar; else w = hh * ar; if (w < min) { w = min; hh = w / ar; } if (hh < min) { hh = min; w = hh * ar; } }
		var nx = h.indexOf("w") >= 0 ? r.x + r.w - w : r.x, ny = h.indexOf("n") >= 0 ? r.y + r.h - hh : r.y;
		return { x: nx, y: ny, w: w, h: hh, hide: r.hide };
	};
	/* snap a rect's edges to the picture edges / centre lines within tol; returns the snapped rect and the lines it used */
	R.snap = function (r, W, H, tol) {
		var o = { x: r.x, y: r.y, w: r.w, h: r.h, hide: r.hide }, lines = [];
		var xs = [[0, 0], [W - r.w, W], [(W - r.w) / 2, W / 2]], ys = [[0, 0], [H - r.h, H], [(H - r.h) / 2, H / 2]], i;
		for (i = 0; i < 3; i++) if (Math.abs(r.x - xs[i][0]) <= tol) { o.x = xs[i][0]; lines.push(["v", xs[i][1]]); break; }
		for (i = 0; i < 3; i++) if (Math.abs(r.y - ys[i][0]) <= tol) { o.y = ys[i][0]; lines.push(["h", ys[i][1]]); break; }
		return { r: o, lines: lines };
	};

	/* ---------- crop boxes ---------- */
	/* a crop is stored in source fractions {x, y, w, h} (0..1). From a drag between two points given in fractions; tiny drags = null (no crop) */
	R.cropFromDrag = function (ax, ay, bx, by, minFrac) {
		minFrac = minFrac || 0.02;
		var x0 = clamp(Math.min(ax, bx), 0, 1), y0 = clamp(Math.min(ay, by), 0, 1), x1 = clamp(Math.max(ax, bx), 0, 1), y1 = clamp(Math.max(ay, by), 0, 1);
		if (x1 - x0 < minFrac || y1 - y0 < minFrac) return null;
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	};
	/* source pixel rect for a crop (whole source when none); even sizes so encoders are happy */
	R.cropPx = function (crop, sw, sh) {
		if (!crop) return { x: 0, y: 0, w: sw, h: sh };
		var x = Math.round(crop.x * sw), y = Math.round(crop.y * sh), w = Math.max(2, Math.round(crop.w * sw / 2) * 2), h = Math.max(2, Math.round(crop.h * sh / 2) * 2);
		if (x + w > sw) x = Math.max(0, sw - w); if (y + h > sh) y = Math.max(0, sh - h);
		return { x: x, y: y, w: Math.min(w, sw), h: Math.min(h, sh) };
	};
	/* the crop moved / resized by a drag inside the crop editor ("move" or a corner), kept inside 0..1 */
	R.cropEdit = function (c, mode, dx, dy) {
		var x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h, m = 0.02;
		if (mode === "move") { var nx = clamp(x0 + dx, 0, 1 - c.w), ny = clamp(y0 + dy, 0, 1 - c.h); return { x: nx, y: ny, w: c.w, h: c.h }; }
		if (mode.indexOf("w") >= 0) x0 = clamp(x0 + dx, 0, x1 - m); else x1 = clamp(x1 + dx, x0 + m, 1);
		if (mode.indexOf("n") >= 0) y0 = clamp(y0 + dy, 0, y1 - m); else y1 = clamp(y1 + dy, y0 + m, 1);
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	};

	/* ---------- timer that knows about pauses ---------- */
	R.Timer = function () { this.acc = 0; this.t0 = 0; this.state = "idle"; };
	R.Timer.prototype.start = function (now) { this.acc = 0; this.t0 = now; this.state = "rec"; };
	R.Timer.prototype.pause = function (now) { if (this.state === "rec") { this.acc += now - this.t0; this.state = "paused"; } };
	R.Timer.prototype.resume = function (now) { if (this.state === "paused") { this.t0 = now; this.state = "rec"; } };
	R.Timer.prototype.stop = function (now) { if (this.state === "rec") this.acc += now - this.t0; this.state = "idle"; return this.acc; };
	R.Timer.prototype.elapsed = function (now) { return this.state === "rec" ? this.acc + (now - this.t0) : this.acc; };

	/* 83500 -> "1:23", 3723000 -> "1:02:03" */
	R.fmtTime = function (ms) {
		var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
	};

	/* ---------- recorder format ----------
	 * pref "mp4" | "webm"; video false = sound only. Returns the first type the browser can record, with its file ending, or null. */
	var VID = {
		mp4: ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/mp4"],
		webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=h264,opus", "video/webm"]
	};
	var AUD = { mp4: ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"], webm: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"] };
	R.pickType = function (pref, video, ok) {
		var t = video ? VID : AUD, order = pref === "webm" ? ["webm", "mp4"] : ["mp4", "webm"];
		for (var o = 0; o < order.length; o++) { var list = t[order[o]]; for (var i = 0; i < list.length; i++) if (ok(list[i])) return { type: list[i], ext: R.extOf(list[i]), fallback: o > 0 }; }
		return null;
	};
	R.extOf = function (type) { type = String(type || "").toLowerCase(); if (type.indexOf("video/mp4") === 0) return "mp4"; if (type.indexOf("audio/mp4") === 0) return "m4a"; if (type.indexOf("audio/ogg") === 0) return "ogg"; if (type.indexOf("audio/") === 0) return "webm"; return "webm"; };
	/* bits per second for a picture of w x h at fps: ~0.1 bit per pixel per frame (screen text stays sharp), 2-40 Mbps; quality 0.5 / 1 / 2 */
	R.bitrate = function (w, h, fps, q) { return Math.round(clamp(w * h * (fps || 30) * 0.1 * (q || 1), 1.5e6, 40e6)); };

	/* ---------- names ---------- */
	function two(n) { return (n < 10 ? "0" : "") + n; }
	/* "Screen recording 2026-11-20 at 14.05.09.mp4" */
	R.fileName = function (what, d, ext) {
		return what + " " + d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " at " + two(d.getHours()) + "." + two(d.getMinutes()) + "." + two(d.getSeconds()) + "." + ext;
	};
	/* a name that is not in `used` (array of names): "x.mp4" -> "x (2).mp4" */
	R.unique = function (name, used) {
		if (used.indexOf(name) < 0) return name;
		var dot = name.lastIndexOf("."), b = dot > 0 ? name.slice(0, dot) : name, e = dot > 0 ? name.slice(dot) : "";
		for (var i = 2; i < 1e4; i++) { var n = b + " (" + i + ")" + e; if (used.indexOf(n) < 0) return n; }
		return name;
	};

	/* ---------- meter ---------- */
	/* rms 0..1 -> fraction of the meter (-60 dB .. 0 dB) */
	R.meter = function (rms) { if (!(rms > 0)) return 0; var db = 20 * Math.log10(rms); return clamp((db + 60) / 60, 0, 1); };
	/* slider 0..200 (%) -> gain; 100 = 1 */
	R.gain = function (pct) { return clamp(+pct || 0, 0, 400) / 100; };

	/* ---------- what can this browser do ---------- */
	R.caps = function (nav, win) {
		var md = nav && nav.mediaDevices, ua = (nav && nav.userAgent) || "";
		var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua), firefox = /Firefox\//.test(ua), safari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
		var chromium = /Chrome|Chromium|Edg\//.test(ua) && !firefox, win32 = /Windows/.test(ua);
		return {
			screen: !!(md && md.getDisplayMedia) && !mobile, cam: !!(md && md.getUserMedia), rec: !!(win && win.MediaRecorder),
			tabAudio: chromium && !mobile, systemAudio: chromium && win32, folder: !!(win && win.showDirectoryPicker), pip: !!(win && win.documentPictureInPicture),
			firefox: firefox, safari: safari, chromium: chromium, mobile: mobile
		};
	};

	if (typeof module !== "undefined" && module.exports) module.exports = R;
	return R;
})();

/* MES Screen Recorder: screens / windows / tabs (getDisplayMedia), cameras and microphones (getUserMedia) on one picture. Video captures are drawn on a
 * canvas (the output, recorded with canvas.captureStream) at their boxes, which you drag / resize on the preview (an overlay of DOM boxes, so the handles
 * are never recorded). Ticks come from a Web Worker timer, so a hidden tab keeps drawing. Sound: every capture with sound goes through its own GainNode
 * into one MediaStreamDestination. MediaRecorder writes MP4 or WebM, into memory or straight into a chosen folder (File System Access). Nothing is uploaded.
 * Pure maths in lib.js (MESRec). */
(function () {
	"use strict";
	var R = window.MESRec, I = window.MESImg, $ = function (id) { return document.getElementById(id); };
	if (!R || !$("sr")) return;
	var KEY = "mes-screen-recorder:v1";
	var S = { size: "auto", layout: "pip", bg: "#111111", fmt: "mp4", q: "1", fps: "30", cd: "3", to: "mem", sys: true, clean: true, direct: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmtB(n) { return I && I.formatBytes ? I.formatBytes(n) : Math.round(n / 1048576) + " MB"; }
	function toast(msg, ms) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3600); }
	var caps = R.caps(navigator, window);
	var cv = $("sr-cv"), ctx = cv.getContext("2d"), W = 1920, H = 1080;
	var srcs = [], seq = 0, sel = -1, manual = false;
	var ac = null, dest = null;
	var rec = null, recInfo = null, timer = new R.Timer(), counting = false, results = [], usedNames = [];
	var dirHandle = null, pip = null;

	/* ---------- small IndexedDB for the chosen folder ---------- */
	function kv(mode, fn) { return new Promise(function (res, rej) { if (!window.indexedDB) return rej(new Error("no IndexedDB")); var r = indexedDB.open("mes-screen-recorder", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result, t = db.transaction("kv", mode), out = fn(t.objectStore("kv")); t.oncomplete = function () { db.close(); res(out && out.result); }; t.onerror = function () { db.close(); rej(t.error); }; }; r.onerror = function () { rej(r.error); }; }); }
	kv("readonly", function (st) { return st.get("dir"); }).then(function (h) { if (h) { dirHandle = h; showDir(); } }).catch(function () {});

	/* ---------- what this browser can do ---------- */
	(function () {
		var t = [];
		if (!caps.rec) t.push("This browser cannot record (no MediaRecorder).");
		if (!caps.screen) { $("sr-add-screen").disabled = true; t.push(caps.mobile ? "Phones and tablets don't let web pages record the screen: you can record the camera and the microphone." : "This browser can't share the screen."); }
		else if (!caps.tabAudio) t.push("This browser records no tab or computer sound: add a microphone for your voice.");
		else if (!caps.systemAudio) t.push("Sound: share a tab and tick \"Also share tab audio\" to record its sound. Other apps' sound can only be recorded on Windows.");
		else t.push("Sound: share a screen and tick \"Also share system audio\", or a tab with \"Also share tab audio\".");
		if (!caps.cam) { $("sr-add-cam").disabled = $("sr-add-mic").disabled = true; }
		$("sr-caps").textContent = t.join(" ");
		if (caps.pip) $("sr-pop").hidden = false;
	})();

	/* ---------- options ---------- */
	function seg(id, key, after) {
		var box = $(id);
		function paint() { [].forEach.call(box.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === String(S[key]))); }); }
		box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || b.disabled) return; S[key] = b.dataset.v; save(); paint(); if (after) after(); });
		paint();
	}
	function fmtNote() {
		var p = R.pickType(S.fmt, true, function (t) { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); });
		$("sr-fmt-n").textContent = !p ? "" : p.fallback ? "This browser can't record " + S.fmt.toUpperCase() + ": it will record " + p.ext.toUpperCase() + "." : "Records " + p.type.split(";")[0] + ".";
	}
	seg("sr-fmt", "fmt", fmtNote); seg("sr-q", "q"); seg("sr-fps", "fps", restartTick); seg("sr-cd", "cd");
	seg("sr-to", "to", showDir); fmtNote();
	$("sr-o-sys").checked = !!S.sys; $("sr-o-clean").checked = !!S.clean; $("sr-o-direct").checked = !!S.direct;
	$("sr-o-sys").onchange = function () { S.sys = this.checked; save(); };
	$("sr-o-clean").onchange = function () { S.clean = this.checked; save(); };
	$("sr-o-direct").onchange = function () { S.direct = this.checked; save(); };
	R.LAYOUTS.forEach(function (l) { $("sr-layout").add(new Option(l[1], l[0])); });
	R.SIZES.forEach(function (l) { $("sr-size").add(new Option(l[1], l[0])); });
	$("sr-layout").value = S.layout; $("sr-size").value = S.size; $("sr-bg").value = S.bg;
	$("sr-layout").onchange = function () { S.layout = this.value; save(); manual = false; relayout(true); };
	$("sr-size").onchange = function () { if (rec) { this.value = S.size; toast("The size can't change while recording."); return; } S.size = this.value; save(); relayout(true); };
	$("sr-bg").oninput = function () { S.bg = this.value; save(); };
	function showDir() {
		$("sr-dirbox").hidden = S.to !== "dir";
		$("sr-dirname").textContent = dirHandle ? "Saving into “" + dirHandle.name + "”" : "No folder chosen yet";
		if (S.to === "dir" && !caps.folder) $("sr-to-n").textContent = "This browser can't write into a folder (Brave: turn on brave://flags/#file-system-access-api; Firefox and Safari can't), so recordings are kept here for you to download.";
	}
	$("sr-dirbtn").onclick = function () { pickDir().catch(function () {}); };
	function pickDir() {
		if (!caps.folder) { toast("This browser can't write into a folder."); return Promise.reject(new Error("no folder")); }
		return window.showDirectoryPicker({ id: "mes-screen-recorder", mode: "readwrite" }).then(function (h) { dirHandle = h; kv("readwrite", function (st) { st.put(h, "dir"); }).catch(function () {}); showDir(); return h; });
	}
	/* make sure we may write into the folder; must run inside the click */
	function readyDir() {
		if (S.to !== "dir" || !caps.folder) return Promise.resolve(null);
		if (!dirHandle) return pickDir().catch(function () { return null; });
		return dirHandle.queryPermission({ mode: "readwrite" }).then(function (p) { return p === "granted" ? p : dirHandle.requestPermission({ mode: "readwrite" }); })
			.then(function (p) { return p === "granted" ? dirHandle : null; }).catch(function () { return null; });
	}

	/* ---------- adding captures ---------- */
	function vidEl(stream) { var v = document.createElement("video"); v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = stream; var p = v.play(); if (p && p.catch) p.catch(function () {}); return v; }
	function audioCtx() {
		if (!ac) { var C = window.AudioContext || window.webkitAudioContext; ac = new C({ latencyHint: "interactive" }); dest = ac.createMediaStreamDestination(); }
		if (ac.state === "suspended") ac.resume().catch(function () {});
		return ac;
	}
	function hookAudio(s, track) {
		if (!track) return;
		audioCtx(); s.atrack = track;
		s.node = ac.createMediaStreamSource(new MediaStream([track])); s.gain = ac.createGain(); s.an = ac.createAnalyser(); s.an.fftSize = 1024;
		s.node.connect(s.gain); s.gain.connect(s.an); s.gain.connect(dest); setGain(s);
		track.addEventListener("ended", function () { if (s.kind === "mic") removeSrc(s.id); else { unhookAudio(s); renderList(); } });
	}
	function unhookAudio(s) { try { s.node.disconnect(); s.gain.disconnect(); } catch (e) {} s.node = s.gain = s.an = s.atrack = null; }
	function setGain(s) { if (s.gain) s.gain.gain.value = s.muted ? 0 : R.gain(s.vol); }
	function addSrc(s) {
		s.id = ++seq; s.vol = s.vol == null ? 100 : s.vol; s.hide = false; s.crop = null;
		srcs.push(s);
		if (s.vtrack) {
			s.video = vidEl(new MediaStream([s.vtrack]));
			s.video.addEventListener("loadedmetadata", function () { relayout(false, s); });
			s.vtrack.addEventListener("ended", function () { removeSrc(s.id); });
		}
		relayout(false, s); renderList(); state(); ensureTick();
		return s;
	}
	$("sr-add-screen").onclick = function () {
		var o = { video: { frameRate: { ideal: +S.fps, max: 60 } }, audio: S.sys && caps.tabAudio ? { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
			systemAudio: S.sys ? "include" : "exclude", surfaceSwitching: "include", selfBrowserSurface: "exclude", monitorTypeSurfaces: "include" };
		if (S.sys) audioCtx();
		navigator.mediaDevices.getDisplayMedia(o).then(function (st) {
			var vt = st.getVideoTracks()[0], at = st.getAudioTracks()[0], set = vt && vt.getSettings ? vt.getSettings() : {};
			var surf = set.displaySurface, label = surf === "browser" ? "Tab" : surf === "window" ? "Window" : "Screen";
			if (vt && "contentHint" in vt) vt.contentHint = "detail";
			var s = addSrc({ kind: "screen", label: label + (vt && vt.label && !/^(screen|window):/.test(vt.label) ? ": " + vt.label : ""), stream: st, vtrack: vt });
			if (at) hookAudio(s, at); else if (S.sys && caps.tabAudio) toast(surf === "browser" ? "No sound: tick \"Also share tab audio\" in the share box next time." : caps.systemAudio ? "No sound: tick \"Also share system audio\" in the share box next time." : "Only tabs can share their sound on this computer.", 5200);
			renderList();
		}).catch(function (e) { if (e && e.name !== "NotAllowedError" && e.name !== "AbortError") toast("Could not share the screen: " + (e.message || e.name)); });
	};
	function camConstraints(id) { var v = { width: { ideal: 1280 }, height: { ideal: 720 } }; if (id) v.deviceId = { exact: id }; return { video: v, audio: false }; }
	function micConstraints(id) { var a = { echoCancellation: S.clean, noiseSuppression: S.clean, autoGainControl: S.clean }; if (id) a.deviceId = { exact: id }; return { audio: a, video: false }; }
	$("sr-add-cam").onclick = function () {
		navigator.mediaDevices.getUserMedia(camConstraints()).then(function (st) {
			var vt = st.getVideoTracks()[0];
			addSrc({ kind: "camera", label: "Camera", stream: st, vtrack: vt, shape: "circle", mirror: true, dev: vt.getSettings ? vt.getSettings().deviceId : "" });
			listDevices();
		}).catch(function (e) { toast("Could not use the camera: " + (e.name === "NotAllowedError" ? "permission was refused (allow the camera in the address bar)." : e.message || e.name), 5200); });
	};
	$("sr-add-mic").onclick = function () {
		navigator.mediaDevices.getUserMedia(micConstraints()).then(function (st) {
			var at = st.getAudioTracks()[0], n = srcs.filter(function (x) { return x.kind === "mic"; }).length;
			var s = addSrc({ kind: "mic", label: n ? "Microphone " + (n + 1) : "Microphone", stream: st, dev: at.getSettings ? at.getSettings().deviceId : "" });
			hookAudio(s, at); listDevices(); renderList();
		}).catch(function (e) { toast("Could not use the microphone: " + (e.name === "NotAllowedError" ? "permission was refused (allow the microphone in the address bar)." : e.message || e.name), 5200); });
	};
	var devices = [];
	function listDevices() { if (!navigator.mediaDevices.enumerateDevices) return; navigator.mediaDevices.enumerateDevices().then(function (d) { devices = d; renderList(); }).catch(function () {}); }
	if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", listDevices);
	function switchDevice(s, id) {
		var c = s.kind === "camera" ? camConstraints(id) : micConstraints(id);
		navigator.mediaDevices.getUserMedia(c).then(function (st) {
			s.stream.getTracks().forEach(function (t) { t.onended = null; t.stop(); });
			s.stream = st; s.dev = id;
			if (s.kind === "camera") { s.vtrack = st.getVideoTracks()[0]; s.video.srcObject = new MediaStream([s.vtrack]); s.video.play().catch(function () {}); s.vtrack.addEventListener("ended", function () { removeSrc(s.id); }); }
			else { unhookAudio(s); hookAudio(s, st.getAudioTracks()[0]); if (rec) toast("Switched. The new microphone is in the recording from now."); }
			renderList();
		}).catch(function (e) { toast("Could not switch: " + (e.message || e.name)); renderList(); });
	}
	function removeSrc(id) {
		var i = srcs.findIndex(function (x) { return x.id === id; }); if (i < 0) return;
		var s = srcs[i]; srcs.splice(i, 1);
		unhookAudio(s);
		if (s.stream) s.stream.getTracks().forEach(function (t) { t.stop(); });
		if (s.video) s.video.srcObject = null;
		if (sel === i) sel = -1; else if (sel > i) sel--;
		if (recInfo && recInfo.direct && recInfo.direct === s.vtrack) stopRec();
		else if (rec && !srcs.length) stopRec();
		renderList(); state(); paintOv(); ensureTick();
	}

	/* ---------- layout ---------- */
	function vids() { return srcs.filter(function (s) { return s.vtrack; }); }
	function natSize(s) { var w = s.video && s.video.videoWidth || 1280, h = s.video && s.video.videoHeight || 720, c = R.cropPx(s.crop, w, h); return { w: c.w, h: c.h }; }
	function relayout(all, only) {
		var vs = vids(), first = vs.filter(function (s) { return s.kind === "screen"; })[0] || vs[0];
		if (!rec) { var o = R.outSize(S.size, first ? natSize(first) : null); if (o.w !== W || o.h !== H) { W = cv.width = o.w; H = cv.height = o.h; all = true; } }
		var L = R.layout(vs.map(function (s) { var n = natSize(s); return { kind: s.kind, w: n.w, h: n.h }; }), W, H, S.layout);
		vs.forEach(function (s, i) { if (all || !manual || !s.r || s === only) s.r = L[i]; });
		fitStage(); paintOv();
	}
	/* when a crop changes, keep the box's width and centre, change its height to the new shape */
	function reshape(s) { var n = natSize(s); if (!s.r) return; var cx = s.r.x + s.r.w / 2, cy = s.r.y + s.r.h / 2, h = s.r.w * n.h / n.w; s.r = { x: s.r.x, y: cy - h / 2, w: s.r.w, h: h, hide: s.r.hide }; if (s.kind === "camera" && s.shape === "circle") s.r.h = s.r.w; void cx; }

	/* ---------- drawing (worker ticks keep going in a hidden tab) ---------- */
	var tickW = null, tickOn = 0;
	function tick() { draw(); if (rec) tickRec(); }
	function restartTick() { tickOn = 0; ensureTick(); }
	function ensureTick() {
		var want = vids().length || rec ? Math.round(1000 / (+S.fps || 30)) : 0;
		if (want === tickOn) return; tickOn = want;
		if (!tickW) {
			try { tickW = new Worker(URL.createObjectURL(new Blob(["var t=null;onmessage=function(e){clearInterval(t);t=null;if(e.data>0)t=setInterval(function(){postMessage(0)},e.data)}"], { type: "text/javascript" }))); tickW.onmessage = tick; }
			catch (e) { tickW = { iv: null, postMessage: function (ms) { clearInterval(this.iv); if (ms > 0) this.iv = setInterval(tick, ms); } }; }
		}
		tickW.postMessage(want);
		if (!want) draw();
	}
	function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
	function drawSrc(c, s) {
		var v = s.video, r = s.r; if (!v || !r || r.hide || !(v.videoWidth > 0)) return;
		var cp = R.cropPx(s.crop, v.videoWidth, v.videoHeight), f = R.fit(cp.w, cp.h, r, s.kind === "camera" ? "cover" : "contain");
		c.save();
		if (s.kind === "camera" && vids().length === 1) {   // camera alone = a plain webcam video, no bubble
			c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
			if (s.mirror) { c.translate(f.x * 2 + f.w, 0); c.scale(-1, 1); }
		} else if (s.kind === "camera") {
			var rad = s.shape === "circle" ? Math.min(r.w, r.h) / 2 : s.shape === "round" ? Math.min(r.w, r.h) * 0.12 : 0;
			if (s.shape === "circle") { c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2, rad, 0, Math.PI * 2); } else rr(c, r.x, r.y, r.w, r.h, rad);
			c.save(); c.shadowColor = "rgba(0,0,0,0.45)"; c.shadowBlur = Math.min(r.w, r.h) * 0.06; c.fillStyle = "#000"; c.fill(); c.restore();
			c.clip();
			if (s.mirror) { c.translate(f.x * 2 + f.w, 0); c.scale(-1, 1); }
		} else { c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); }
		c.drawImage(v, cp.x, cp.y, cp.w, cp.h, f.x, f.y, f.w, f.h);
		c.restore();
	}
	function draw() {
		ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
		srcs.forEach(function (s) { drawSrc(ctx, s); });
		$("sr-empty").hidden = srcs.length > 0;
		if (pip) paintPip();
	}

	/* ---------- preview sizing + overlay boxes ---------- */
	function fitStage() {
		var st = $("sr-stage"), fill = $("sr-view").classList.contains("mes-pfill");
		var aw = st.clientWidth - 2, ah = fill ? Math.max(120, st.clientHeight - 2) : Math.min(window.innerHeight * 0.7, 900);
		var k = Math.min(aw / W, ah / H), w = Math.max(80, Math.floor(W * k)), h = Math.max(45, Math.floor(H * k));
		cv.style.width = w + "px"; cv.style.height = h + "px";
		paintOv();
	}
	if (window.ResizeObserver) new ResizeObserver(fitStage).observe($("sr-stage")); else window.addEventListener("resize", fitStage);
	function scale() { return cv.getBoundingClientRect().width / W || 1; }
	function paintOv() {
		var ov = $("sr-ov"), k = scale(), vs = vids(), html = "";
		vs.forEach(function (s, i) {
			if (!s.r || s.r.hide) return;
			var on = srcs.indexOf(s) === sel, r = s.r, round = s.kind === "camera" && s.shape === "circle" && vs.length > 1;
			html += '<div class="sr-box' + (on ? " is-on" : "") + (round ? " is-round" : "") + '" style="left:' + (r.x * k) + "px;top:" + (r.y * k) + "px;width:" + (r.w * k) + "px;height:" + (r.h * k) + 'px">' +
				(on ? '<i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i><span class="sr-boxl">' + esc(s.label) + "</span>" : "") + "</div>";
			void i;
		});
		ov.innerHTML = html + '<div class="sr-guide" id="sr-gv" hidden></div><div class="sr-guide sr-gh" id="sr-gh" hidden></div>';
	}
	(function () {
		var wrap = $("sr-cvwrap"), drag = null;
		function pt(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height }; }
		wrap.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return;
			var p = pt(e), vs = vids(), rects = vs.map(function (s) { return s.r; }), cur = sel >= 0 ? srcs[sel] : null, h = null, i;
			if (cur && cur.r && cur.vtrack) h = R.handleAt(cur.r, p.x, p.y, 14 / scale());
			if (h) i = vs.indexOf(cur); else i = R.hit(rects, p.x, p.y);
			if (i < 0) { sel = -1; paintOv(); renderList(); return; }
			sel = srcs.indexOf(vs[i]); e.preventDefault();
			drag = { s: vs[i], h: h, p0: p, r0: vs[i].r, id: e.pointerId };
			try { wrap.setPointerCapture(e.pointerId); } catch (er) {}
			paintOv(); renderList();
		});
		wrap.addEventListener("pointermove", function (e) {
			if (!drag || e.pointerId !== drag.id) { if (!drag) { var p0 = pt(e), cur = sel >= 0 ? srcs[sel] : null; wrap.style.cursor = cur && cur.r && cur.vtrack && R.handleAt(cur.r, p0.x, p0.y, 14 / scale()) ? "nwse-resize" : R.hit(vids().map(function (s) { return s.r; }), p0.x, p0.y) >= 0 ? "move" : ""; } return; }
			var p = pt(e), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y, s = drag.s, gv = $("sr-gv"), gh = $("sr-gh");
			if (drag.h) { s.r = R.resize(drag.r0, drag.h, dx, dy, { free: e.shiftKey && !(s.kind === "camera" && s.shape === "circle"), min: Math.min(W, H) * 0.06 }); gv.hidden = gh.hidden = true; }
			else {
				var m = R.move(drag.r0, dx, dy, W, H, 24), sn = e.altKey ? { r: m, lines: [] } : R.snap(m, W, H, Math.min(W, H) * 0.015);
				s.r = sn.r; var k = scale(); gv.hidden = gh.hidden = true;
				sn.lines.forEach(function (l) { var g = l[0] === "v" ? gv : gh; g.hidden = false; if (l[0] === "v") g.style.left = (l[1] * k) + "px"; else g.style.top = (l[1] * k) + "px"; });
			}
			manual = true; positionSel();
		});
		function end() { if (!drag) return; drag = null; var g1 = $("sr-gv"), g2 = $("sr-gh"); if (g1) g1.hidden = true; if (g2) g2.hidden = true; paintOv(); }
		wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
		function positionSel() { var b = $("sr-ov").querySelector(".sr-box.is-on"), s = srcs[sel], k = scale(); if (!b || !s || !s.r) return paintOv(); b.style.left = s.r.x * k + "px"; b.style.top = s.r.y * k + "px"; b.style.width = s.r.w * k + "px"; b.style.height = s.r.h * k + "px"; }
	})();

	/* ---------- list of captures ---------- */
	var ICON = { screen: "🖥", camera: "📷", mic: "🎤" };
	function devOptions(s) {
		var kind = s.kind === "camera" ? "videoinput" : "audioinput", list = devices.filter(function (d) { return d.kind === kind && d.deviceId; });
		if (list.length < 2) return "";
		return '<label class="sr-dev">Device <select data-a="dev">' + list.map(function (d, i) { return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === s.dev ? " selected" : "") + ">" + esc(d.label || (kind === "videoinput" ? "Camera " : "Microphone ") + (i + 1)) + "</option>"; }).join("") + "</select></label>";
	}
	function renderList() {
		var ul = $("sr-list"); $("sr-none").hidden = srcs.length > 0;
		ul.innerHTML = srcs.map(function (s, i) {
			var v = !!s.vtrack, a = !!s.gain;
			return '<li class="sr-it' + (i === sel ? " is-on" : "") + '" data-id="' + s.id + '">' +
				'<div class="sr-ith"><span class="sr-ico" aria-hidden="true">' + ICON[s.kind] + '</span><b class="sr-name">' + esc(s.label) + "</b>" +
				(v ? '<span class="sr-dim">' + (s.video && s.video.videoWidth ? natSize(s).w + " × " + natSize(s).h : "") + "</span>" : "") +
				'<span class="sr-sp"></span>' +
				(v ? '<button type="button" class="sr-mini" data-a="hide" aria-pressed="' + !(s.r && s.r.hide) + '" title="Show or hide on the picture">' + (s.r && s.r.hide ? "Hidden" : "Shown") + "</button>" : "") +
				(v ? '<button type="button" class="sr-mini" data-a="front" title="Bring to the front">Front</button><button type="button" class="sr-mini" data-a="back" title="Send to the back">Back</button>' : "") +
				(v ? '<button type="button" class="sr-mini" data-a="shot" title="Screenshot of this capture at full size">📸</button>' : "") +
				(s.kind === "screen" ? '<button type="button" class="sr-mini" data-a="crop" title="Record only part of it">✂ Crop' + (s.crop ? " ✓" : "") + "</button>" : "") +
				'<button type="button" class="sr-mini sr-del" data-a="del" title="Stop and remove">✕</button></div>' +
				'<div class="sr-itb">' +
				(s.kind === "camera" ? '<label class="sr-dev">Shape <select data-a="shape"><option value="circle"' + (s.shape === "circle" ? " selected" : "") + '>Round</option><option value="round"' + (s.shape === "round" ? " selected" : "") + '>Rounded box</option><option value="rect"' + (s.shape === "rect" ? " selected" : "") + '>Box</option></select></label><label class="sr-chk"><input type="checkbox" data-a="mirror"' + (s.mirror ? " checked" : "") + "> Mirror</label>" : "") +
				(s.kind !== "screen" ? devOptions(s) : "") +
				(a ? '<span class="sr-vol"><button type="button" class="sr-mini" data-a="mute" aria-pressed="' + !!s.muted + '">' + (s.muted ? "🔇 Muted" : "🔊") + '</button><input type="range" min="0" max="200" step="5" value="' + s.vol + '" data-a="vol" aria-label="Volume of ' + esc(s.label) + '"><b class="sr-volv">' + s.vol + '%</b><canvas class="sr-meter" width="160" height="10" aria-hidden="true"></canvas></span>' : (s.kind === "screen" ? '<span class="sr-dim">No sound from this one</span>' : "")) +
				"</div></li>";
		}).join("");
	}
	$("sr-list").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"), li = e.target.closest(".sr-it"); if (!li) return;
		var s = srcs.find(function (x) { return x.id === +li.dataset.id; }); if (!s) return;
		if (!b) { sel = srcs.indexOf(s); paintOv(); renderList(); return; }
		var a = b.dataset.a, i = srcs.indexOf(s);
		if (a === "del") removeSrc(s.id);
		else if (a === "hide" && s.r) { s.r.hide = !s.r.hide; paintOv(); renderList(); }
		else if (a === "front" || a === "back") { srcs.splice(i, 1); if (a === "front") srcs.push(s); else srcs.unshift(s); sel = srcs.indexOf(s); paintOv(); renderList(); }
		else if (a === "mute") { s.muted = !s.muted; setGain(s); renderList(); }
		else if (a === "crop") openCrop(s);
		else if (a === "shot") shotOf(s);
	});
	$("sr-list").addEventListener("input", function (e) {
		var t = e.target, li = t.closest(".sr-it"); if (!li || t.dataset.a !== "vol") return;
		var s = srcs.find(function (x) { return x.id === +li.dataset.id; }); if (!s) return;
		s.vol = +t.value; setGain(s); li.querySelector(".sr-volv").textContent = s.vol + "%";
	});
	$("sr-list").addEventListener("change", function (e) {
		var t = e.target, li = t.closest(".sr-it"); if (!li) return;
		var s = srcs.find(function (x) { return x.id === +li.dataset.id; }); if (!s) return;
		if (t.dataset.a === "shape") { s.shape = t.value; if (s.r && s.shape === "circle") { var m = Math.min(s.r.w, s.r.h); s.r.w = s.r.h = m; } paintOv(); }
		else if (t.dataset.a === "mirror") s.mirror = t.checked;
		else if (t.dataset.a === "dev") switchDevice(s, t.value);
	});
	/* level meters (UI only, animation frames) */
	(function meters() {
		var buf = new Float32Array(1024);
		function f() {
			[].forEach.call($("sr-list").querySelectorAll(".sr-it"), function (li) {
				var s = srcs.find(function (x) { return x.id === +li.dataset.id; }), c = li.querySelector(".sr-meter"); if (!s || !s.an || !c) return;
				s.an.getFloatTimeDomainData(buf); var sum = 0, pk = 0; for (var i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; if (Math.abs(buf[i]) > pk) pk = Math.abs(buf[i]); }
				var m = R.meter(Math.sqrt(sum / buf.length)), x = c.getContext("2d"), w = c.width, h = c.height;
				x.clearRect(0, 0, w, h); x.fillStyle = "rgba(128,128,128,0.25)"; x.fillRect(0, 0, w, h);
				x.fillStyle = pk > 0.98 ? "#dc2626" : m > 0.85 ? "#eab308" : "#16a34a"; x.fillRect(0, 0, Math.round(w * m), h);
			});
			requestAnimationFrame(f);
		}
		requestAnimationFrame(f);
	})();

	/* ---------- recording ---------- */
	function state() {
		var any = srcs.length > 0, r = !!rec;
		$("sr-rec").disabled = !caps.rec || (!any && !r) || counting; $("sr-rec").textContent = r ? "■ Stop" : "● Record"; $("sr-rec").classList.toggle("is-on", r);
		$("sr-pause").disabled = !r; $("sr-pause").textContent = rec && rec.state === "paused" ? "▶ Resume" : "❚❚ Pause";
		$("sr-stop").disabled = !r; $("sr-shot").disabled = !vids().length;
		$("sr-recdot").hidden = !r; $("sr-recdot").classList.toggle("is-paused", !!(rec && rec.state === "paused"));
		$("sr-view").classList.toggle("is-rec", r);
		if (pip) paintPip();
	}
	var baseTitle = document.title;
	function tickRec() {
		var t = R.fmtTime(timer.elapsed(performance.now()));
		if ($("sr-time").textContent !== t) { $("sr-time").textContent = t; document.title = (rec.state === "paused" ? "❚❚ " : "● ") + t + " · " + baseTitle; }
	}
	setInterval(function () { if (rec) tickRec(); }, 500);
	$("sr-rec").onclick = function () { if (rec) stopRec(); else startRec(); };
	$("sr-stop").onclick = function () { stopRec(); };
	$("sr-pause").onclick = pauseRec;
	function pauseRec() {
		if (!rec) return; var now = performance.now();
		if (rec.state === "recording") { rec.pause(); timer.pause(now); } else if (rec.state === "paused") { rec.resume(); timer.resume(now); }
		tickRec(); state();
	}
	function startRec() {
		if (rec || counting || !srcs.length) return;
		if (ac && ac.state === "suspended") ac.resume().catch(function () {});
		readyDir().then(function (dir) {
			if (S.to === "dir" && caps.folder && !dir) toast("No folder: the recording is kept here for you to download.");
			var n = +S.cd || 0; if (!n) return go(dir);
			counting = true; state(); var box = $("sr-count"); box.hidden = false;
			(function step() { if (!counting) { box.hidden = true; return; } if (n <= 0) { box.hidden = true; counting = false; go(dir); return; } box.textContent = n--; box.classList.remove("is-pop"); void box.offsetWidth; box.classList.add("is-pop"); setTimeout(step, 1000); })();
		});
	}
	function go(dir) {
		if (!srcs.length) { state(); return; }
		var vs = vids(), audio = srcs.some(function (s) { return s.gain; }), direct = null;
		if (S.direct && vs.length === 1 && vs[0].kind === "screen" && !vs[0].crop) direct = vs[0].vtrack;
		var tracks = [];
		if (vs.length) tracks.push(direct || cv.captureStream(+S.fps || 30).getVideoTracks()[0]);
		if (audio) tracks.push(dest.stream.getAudioTracks()[0]);
		if (!tracks.length) { toast("Nothing to record."); return; }
		var video = vs.length > 0, p = R.pickType(S.fmt, video, function (t) { return MediaRecorder.isTypeSupported(t); });
		var ds = direct && direct.getSettings ? direct.getSettings() : null, ow = ds && ds.width || W, oh = ds && ds.height || H;
		var opt = { audioBitsPerSecond: 160000 }; if (p) opt.mimeType = p.type; if (video) opt.videoBitsPerSecond = R.bitrate(ow, oh, +S.fps, +S.q);
		var stream = new MediaStream(tracks), r;
		try { r = new MediaRecorder(stream, opt); } catch (e) { try { r = new MediaRecorder(stream); } catch (e2) { toast("This browser could not start recording: " + (e2.message || e2.name)); return; } }
		var type = (r.mimeType || (p && p.type) || (video ? "video/webm" : "audio/webm")), ext = R.extOf(type);
		var what = !video ? "Voice recording" : vs.every(function (s) { return s.kind === "camera"; }) ? "Camera recording" : "Screen recording";
		var name = R.unique(R.fileName(what, new Date(), ext), usedNames); usedNames.push(name);
		recInfo = { name: name, type: type, chunks: [], size: 0, video: video, direct: direct, w: ow, h: oh, writer: null, fh: null, wq: Promise.resolve(), canvasTrack: direct ? null : tracks[0] };
		var start = function () {
			r.ondataavailable = function (e) {
				if (!e.data || !e.data.size) return; recInfo.size += e.data.size;
				if (recInfo.writer) { var d = e.data, w = recInfo.writer; recInfo.wq = recInfo.wq.then(function () { return w.write(d); }).catch(function (er) { recInfo.werr = er; }); }
				else recInfo.chunks.push(e.data);
			};
			r.onstop = function () { finish(r, recInfo); };
			r.onerror = function (e) { toast("Recording error: " + (e.error && e.error.message || "unknown")); };
			rec = r; r.start(1000); timer.start(performance.now()); $("sr-time").textContent = "0:00"; state(); ensureTick();
		};
		if (dir) dir.getFileHandle(name, { create: true }).then(function (fh) { recInfo.fh = fh; return fh.createWritable(); }).then(function (w) { recInfo.writer = w; recInfo.dir = dir.name; start(); }, function (e) { toast("Could not write into the folder (" + (e.message || e.name) + "): keeping it here."); start(); });
		else start();
	}
	function stopRec() {
		if (counting) { counting = false; state(); return; }
		if (!rec) return;
		var r = rec; timer.stop(performance.now()); try { r.stop(); } catch (e) { finish(r, recInfo); }
	}
	function finish(r, info) {
		if (info.done) return; info.done = true;
		if (rec === r) rec = null;
		if (info.canvasTrack) info.canvasTrack.stop();
		document.title = baseTitle; state(); ensureTick();
		var dur = timer.acc;
		var out = { kind: info.video ? "video" : "audio", name: info.name, type: info.type, dur: dur, w: info.w, h: info.h, dir: null };
		var p = info.writer ? info.wq.then(function () { return info.writer.close(); }).then(function () { out.dir = info.dir; out.fh = info.fh; return info.fh.getFile(); })
			: Promise.resolve(new File(info.chunks, info.name, { type: info.type.split(";")[0] }));
		p.then(function (file) { out.file = file; out.size = file.size; addResult(out); toast(out.dir ? "Saved “" + info.name + "” in " + out.dir + "." : "Recording ready below: " + fmtB(file.size) + "."); })
			.catch(function (e) { toast("Could not finish the file: " + (e.message || e.name)); if (info.chunks.length) { out.file = new File(info.chunks, info.name, { type: info.type.split(";")[0] }); out.size = out.file.size; addResult(out); } });
	}
	window.addEventListener("beforeunload", function (e) { if (rec || results.some(function (x) { return !x.dir && !x.saved; })) { e.preventDefault(); e.returnValue = ""; } });

	/* keys */
	document.addEventListener("keydown", function (e) {
		var t = e.target; if (e.ctrlKey || e.metaKey || e.altKey || (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))) return;
		if (!$("sr-shotm").hidden || !$("sr-cropm").hidden) { if (e.key === "Escape") closeModals(); return; }
		var k = e.key.toLowerCase();
		if (k === "r" && !$("sr-rec").disabled) { e.preventDefault(); $("sr-rec").click(); }
		else if (k === "p" && rec) { e.preventDefault(); pauseRec(); }
		else if (k === "s" && vids().length) { e.preventDefault(); shotAll(); }
		else if ((k === "delete" || k === "backspace") && sel >= 0 && srcs[sel] && srcs[sel].r) { e.preventDefault(); srcs[sel].r.hide = true; paintOv(); renderList(); }
	});

	/* ---------- results ---------- */
	function addResult(o) {
		o.id = ++seq; o.url = URL.createObjectURL(o.file); results.unshift(o); renderResults();
	}
	function renderResults() {
		$("sr-out").hidden = !results.length;
		$("sr-res").innerHTML = results.map(function (o) {
			var media = o.kind === "video" ? '<video src="' + o.url + '" controls preload="metadata" playsinline></video>' : o.kind === "audio" ? '<audio src="' + o.url + '" controls preload="metadata"></audio>' : '<img src="' + o.url + '" alt="Screenshot">';
			var info = [o.kind === "shot" ? o.w + " × " + o.h : (o.kind === "video" ? o.w + " × " + o.h + " · " : "") + R.fmtTime(o.dur), fmtB(o.size)];
			return '<li class="sr-r sr-r--' + o.kind + '" data-id="' + o.id + '"><div class="sr-rm">' + media + '</div><div class="sr-ri"><b class="sr-rn">' + esc(o.name) + '</b><span class="sr-dim">' + esc(info.join(" · ")) + (o.dir ? " · saved in “" + esc(o.dir) + "”" : o.saved ? " · downloaded" : "") + "</span>" +
				'<div class="sr-ra">' + (o.dir ? "" : '<button type="button" class="tu-btn tu-btn--primary" data-a="dl">⬇ Download</button>') +
				(o.kind === "shot" ? '<button type="button" class="tu-btn" data-a="copy">Copy</button><button type="button" class="tu-btn" data-a="open">Open / crop</button><button type="button" class="tu-btn" data-a="photo">Edit in Photo Editor</button>'
					: (o.kind === "video" ? '<button type="button" class="tu-btn" data-a="video">Open in Video Editor</button>' : "") + '<button type="button" class="tu-btn" data-a="audio">Open in Audio Editor</button>' + (o.kind === "video" && /webm/.test(o.type) ? '<a class="tu-btn tu-btn--ghost" href="/convert-video" target="_blank" rel="noopener">Make it MP4</a>' : "")) +
				'<button type="button" class="tu-btn tu-btn--ghost" data-a="del">Remove</button></div></div></li>';
		}).join("");
	}
	function download(file, name) { var a = document.createElement("a"), u = URL.createObjectURL(file); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
	function handTo(page, o) {
		if (!I || !I.handoffSend) { toast("Download it, then open it in the editor."); return; }
		I.handoffSend(page, [{ blob: o.file, name: o.name, type: o.file.type }], function (url) { toast("Your browser blocked the new tab: allow pop-ups, or open " + url); }).catch(function (e) { toast("Could not hand it over: " + (e.message || e)); });
	}
	$("sr-res").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"), li = e.target.closest(".sr-r"); if (!b || !li) return;
		var o = results.find(function (x) { return x.id === +li.dataset.id; }); if (!o) return;
		var a = b.dataset.a;
		if (a === "dl") { download(o.file, o.name); o.saved = true; renderResults(); }
		else if (a === "video") handTo("/video", o);
		else if (a === "audio") handTo("/audio", o);
		else if (a === "photo") handTo("/photo", o);
		else if (a === "copy") copyPng(o.file);
		else if (a === "open") { var im = new Image(); im.onload = function () { var c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0); openShot(c, o); }; im.src = o.url; }
		else if (a === "del") { if (!o.dir && !o.saved && o.kind !== "shot" && !confirm("Remove “" + o.name + "”? It was not downloaded.")) return; URL.revokeObjectURL(o.url); results.splice(results.indexOf(o), 1); renderResults(); }
	});

	/* ---------- screenshots ---------- */
	function copyPng(blobOrCanvas) {
		if (!navigator.clipboard || !window.ClipboardItem) { toast("This browser can't copy pictures: use Save PNG."); return; }
		var p = blobOrCanvas instanceof Blob ? Promise.resolve(blobOrCanvas) : new Promise(function (res) { blobOrCanvas.toBlob(res, "image/png"); });
		navigator.clipboard.write([new ClipboardItem({ "image/png": p })]).then(function () { toast("Copied. Paste it anywhere with Ctrl+V."); }, function (e) { toast("Could not copy: " + (e.message || e.name)); });
	}
	function shotAll() { draw(); var c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(cv, 0, 0); openShot(c); }
	function shotOf(s) {
		var v = s.video; if (!v || !v.videoWidth) return;
		var cp = R.cropPx(s.crop, v.videoWidth, v.videoHeight), c = document.createElement("canvas"); c.width = cp.w; c.height = cp.h;
		var x = c.getContext("2d"); if (s.kind === "camera" && s.mirror) { x.translate(cp.w, 0); x.scale(-1, 1); } x.drawImage(v, cp.x, cp.y, cp.w, cp.h, 0, 0, cp.w, cp.h); openShot(c);
	}
	$("sr-shot").onclick = shotAll;
	var shot = null;
	function openShot(c, existing) {
		shot = { c: c, box: null, res: existing || null };
		var sc = $("sr-shotcv"); sc.width = c.width; sc.height = c.height; sc.getContext("2d").drawImage(c, 0, 0);
		$("sr-shotbox").hidden = true; $("sr-shotcrop").disabled = true; $("sr-shotsize").textContent = c.width + " × " + c.height + " px";
		$("sr-shotm").hidden = false; document.documentElement.classList.add("sr-modal-on");
		if (!existing) keepShot();
	}
	function shotName() { return R.unique(R.fileName("Screenshot", new Date(), "png"), usedNames); }
	function keepShot() {
		var c = shot.c, s = shot;
		c.toBlob(function (b) {
			if (!b) return;
			if (s.res) { URL.revokeObjectURL(s.res.url); s.res.file = new File([b], s.res.name, { type: "image/png" }); s.res.size = b.size; s.res.url = URL.createObjectURL(b); s.res.w = c.width; s.res.h = c.height; s.res.saved = false; s.res.dir = null; renderResults(); saveShotToDir(s.res); return; }
			var name = shotName(); usedNames.push(name);
			var o = { kind: "shot", name: name, type: "image/png", file: new File([b], name, { type: "image/png" }), size: b.size, w: c.width, h: c.height };
			addResult(o); s.res = o; saveShotToDir(o);
		}, "image/png");
	}
	function saveShotToDir(o) {
		if (S.to !== "dir" || !dirHandle || !caps.folder) return;
		dirHandle.queryPermission({ mode: "readwrite" }).then(function (p) {
			if (p !== "granted") return;
			return dirHandle.getFileHandle(o.name, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(o.file).then(function () { return w.close(); }); }).then(function () { o.dir = dirHandle.name; renderResults(); });
		}).catch(function () {});
	}
	function boxDrag(wrapId, boxId, getC, setC, onChange) {
		var wrap = $(wrapId), box = $(boxId), d = null;
		function fr(e) { var b = wrap.querySelector("canvas").getBoundingClientRect(); return { x: R.clamp((e.clientX - b.left) / b.width, 0, 1), y: R.clamp((e.clientY - b.top) / b.height, 0, 1) }; }
		wrap.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return; e.preventDefault(); var p = fr(e), c = getC(), h = e.target.dataset && e.target.dataset.h;
			if (h && c) d = { m: h, p: p, c: c }; else if (c && e.target === box) d = { m: "move", p: p, c: c }; else d = { m: "new", p: p };
			try { wrap.setPointerCapture(e.pointerId); } catch (er) {}
		});
		wrap.addEventListener("pointermove", function (e) {
			if (!d) return; var p = fr(e);
			if (d.m === "new") setC(R.cropFromDrag(d.p.x, d.p.y, p.x, p.y, 0.005)); else setC(R.cropEdit(d.c, d.m, p.x - d.p.x, p.y - d.p.y));
			paint();
		});
		function up() { if (d) { d = null; onChange(); } }
		wrap.addEventListener("pointerup", up); wrap.addEventListener("pointercancel", up);
		function paint() { var c = getC(); box.hidden = !c; if (!c) return; box.style.left = c.x * 100 + "%"; box.style.top = c.y * 100 + "%"; box.style.width = c.w * 100 + "%"; box.style.height = c.h * 100 + "%"; onChange(true); }
		return paint;
	}
	var paintShotBox = boxDrag("sr-shotwrap", "sr-shotbox", function () { return shot && shot.box; }, function (c) { if (shot) shot.box = c; }, function () {
		var b = shot && shot.box; $("sr-shotcrop").disabled = !b;
		$("sr-shotsize").textContent = b ? Math.round(b.w * shot.c.width) + " × " + Math.round(b.h * shot.c.height) + " px selected" : shot ? shot.c.width + " × " + shot.c.height + " px" : "";
	});
	$("sr-shotcrop").onclick = function () {
		if (!shot || !shot.box) return; var px = R.cropPx(shot.box, shot.c.width, shot.c.height), c = document.createElement("canvas"); c.width = px.w; c.height = px.h;
		c.getContext("2d").drawImage(shot.c, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h); var res = shot.res; openShot(c, res); keepShot(); paintShotBox();
	};
	$("sr-shotcopy").onclick = function () { if (shot) copyPng(shot.c); };
	$("sr-shotsave").onclick = function () { if (!shot || !shot.res) return; download(shot.res.file, shot.res.name); shot.res.saved = true; renderResults(); };
	$("sr-shotedit").onclick = function () { if (shot && shot.res) handTo("/photo", shot.res); };

	/* ---------- crop a capture ---------- */
	var cropS = null, cropBox = null;
	function openCrop(s) {
		var v = s.video; if (!v || !v.videoWidth) { toast("Wait until the capture shows a picture."); return; }
		cropS = s; cropBox = s.crop ? { x: s.crop.x, y: s.crop.y, w: s.crop.w, h: s.crop.h } : null;
		var c = $("sr-cropcv"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
		$("sr-cropm").hidden = false; document.documentElement.classList.add("sr-modal-on"); paintCrop();
	}
	var paintCrop = boxDrag("sr-cropwrap", "sr-cropbox", function () { return cropBox; }, function (c) { cropBox = c; }, function () {
		var v = cropS && cropS.video; if (!v) return; var px = R.cropPx(cropBox, v.videoWidth, v.videoHeight);
		$("sr-cropsize").textContent = cropBox ? px.w + " × " + px.h + " px of " + v.videoWidth + " × " + v.videoHeight : "Whole capture: " + v.videoWidth + " × " + v.videoHeight + " px";
	});
	$("sr-cropok").onclick = function () { if (cropS) { cropS.crop = cropBox; reshape(cropS); if (!manual) relayout(true); paintOv(); renderList(); } closeModals(); };
	$("sr-cropnone").onclick = function () { cropBox = null; paintCrop(); };
	function closeModals() { $("sr-shotm").hidden = $("sr-cropm").hidden = true; document.documentElement.classList.remove("sr-modal-on"); shot = null; cropS = null; }
	[].forEach.call(document.querySelectorAll(".sr-modal [data-close]"), function (b) { b.addEventListener("click", closeModals); });
	[].forEach.call(document.querySelectorAll(".sr-modal"), function (m) { m.addEventListener("click", function (e) { if (e.target === m) closeModals(); }); });

	/* ---------- pop-out controls (Document Picture-in-Picture, Chrome / Edge) ---------- */
	$("sr-pop").onclick = function () {
		if (pip) { pip.close(); return; }
		window.documentPictureInPicture.requestWindow({ width: 320, height: 96 }).then(function (w) {
			pip = w; var d = w.document;
			d.body.innerHTML = '<style>body{margin:0;font:14px/1.2 system-ui,sans-serif;background:#16181d;color:#eee;display:flex;align-items:center;gap:6px;padding:8px;height:100vh;box-sizing:border-box}button{font:inherit;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;background:#2c313a;color:#fff}button:disabled{opacity:.4}#r.on{background:#dc2626}#t{font-variant-numeric:tabular-nums;font-weight:700;min-width:3.6em;text-align:center}</style>' +
				'<button id="r">● Rec</button><button id="p">❚❚</button><span id="t">0:00</span><button id="s" title="Screenshot">📸</button>';
			d.getElementById("r").onclick = function () { if (rec) stopRec(); else startRec(); };
			d.getElementById("p").onclick = pauseRec;
			d.getElementById("s").onclick = function () { if (vids().length) shotAll(); };
			w.addEventListener("pagehide", function () { pip = null; $("sr-pop").textContent = "⧉ Pop out the controls"; });
			$("sr-pop").textContent = "Close the pop-out"; paintPip();
		}).catch(function (e) { toast("Could not pop out: " + (e.message || e.name)); });
	};
	function paintPip() {
		if (!pip) return; var d = pip.document, r = d.getElementById("r"); if (!r) return;
		r.textContent = rec ? "■ Stop" : "● Rec"; r.className = rec ? "on" : ""; r.disabled = !rec && !srcs.length;
		d.getElementById("p").disabled = !rec; d.getElementById("p").textContent = rec && rec.state === "paused" ? "▶" : "❚❚";
		d.getElementById("t").textContent = rec ? R.fmtTime(timer.elapsed(performance.now())) : "0:00";
		d.getElementById("s").disabled = !vids().length;
	}
	setInterval(function () { if (pip) paintPip(); }, 500);

	/* Fill window / Full screen of the picture card */
	(function panel() {
		if (!window.MESPanel) return setTimeout(panel, 300);
		window.MESPanel.add($("sr-view"), { bar: $("sr-vbar").querySelector(".sr-vbtns"), stage: $("sr-stage"), onChange: function () { setTimeout(fitStage, 40); } });
	})();

	relayout(true); renderList(); state(); draw();
	/* testing: MESRecDebug.addStream(stream, "screen"|"camera"|"mic") adds a capture without the browser's picker */
	window.MESRecDebug = {
		addStream: function (st, kind) { var vt = st.getVideoTracks()[0], at = st.getAudioTracks()[0]; var s = addSrc({ kind: kind || "screen", label: kind === "camera" ? "Camera" : kind === "mic" ? "Microphone" : "Screen: test", stream: st, vtrack: vt, shape: "circle", mirror: true }); if (at) hookAudio(s, at); renderList(); return s; },
		srcs: srcs, results: results, start: function () { S.cd = "0"; go(null); }, stop: stopRec, state: function () { return { W: W, H: H, rec: rec && rec.state, sel: sel }; }
	};
})();
