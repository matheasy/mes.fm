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

/* MES Upscale: pure helpers (no DOM), node-tested by tool_apps_src/upscale-tests.js.
 * Sizes and passes, tile plans for the x4 networks (dynamic-size and fixed 256x256 inputs), tensor packing, names. */
(function (root) {
	"use strict";
	var MAX_SIDE = 16384, MAX_AREA = 80e6; // a browser canvas (and memory) limit we stay under
	var MODES = {
		photo: { name: "Photo & everyday", ai: true, model: "general", note: "Photos, screenshots, logos, scans." },
		art: { name: "Drawing, anime & cartoon", ai: true, model: "art", note: "Clean lines and flat colours: anime, cartoons, comics, illustrations." },
		pixel: { name: "Pixel art (sharp squares)", ai: false, note: "Every pixel becomes a crisp square. For game sprites and icons." },
		smooth: { name: "No AI (plain resize)", ai: false, note: "A normal smooth resize, for comparison." }
	};
	var MODELS = {
		general: { file: "realesr-general-x4v3.onnx", mb: 4.9, fixed: 0, name: "Real-ESRGAN general x4v3" },
		art: { file: "realesr-animevideov3-256.onnx", mb: 2.5, fixed: 256, name: "Real-ESRGAN anime video v3" }
	};
	function clampInt(v, a, b) { v = Math.round(+v); if (!isFinite(v)) v = a; return v < a ? a : v > b ? b : v; }
	/* wanted output size: by = "scale" (val = factor) | "width" | "height" (val = px). Keeps the aspect ratio. */
	function targetSize(w, h, by, val) {
		var f;
		if (by === "width") f = (+val || w) / w; else if (by === "height") f = (+val || h) / h; else f = +val || 2;
		if (!(f > 0)) f = 1;
		var W = Math.max(1, Math.round(w * f)), H = Math.max(1, Math.round(h * f));
		return { W: W, H: H, f: W / w, ok: W <= MAX_SIDE && H <= MAX_SIDE && W * H <= MAX_AREA, tooBig: !(W <= MAX_SIDE && H <= MAX_SIDE && W * H <= MAX_AREA) };
	}
	/* how the AI gets there. Each pass is x4. f <= 4: one pass, then resample down to the target.
	 * f > 4: first pass x4, resample to target/4, second pass x4 = the target exactly (so the big intermediate is never bigger than the result). */
	function plan(w, h, W, H) {
		var f = Math.max(W / w, H / h), steps = [];
		if (f <= 1) return { passes: 0, steps: [{ type: "resize", w: W, h: H }], f: f };
		if (f <= 4) { steps.push({ type: "ai", inW: w, inH: h }); if (W !== w * 4 || H !== h * 4) steps.push({ type: "resize", w: W, h: H }); return { passes: 1, steps: steps, f: f }; }
		var mw = Math.max(1, Math.round(W / 4)), mh = Math.max(1, Math.round(H / 4));
		steps.push({ type: "ai", inW: w, inH: h });
		steps.push({ type: "resize", w: mw, h: mh });
		steps.push({ type: "ai", inW: mw, inH: mh });
		if (mw * 4 !== W || mh * 4 !== H) steps.push({ type: "resize", w: W, h: H });
		return { passes: 2, steps: steps, f: f };
	}
	/* tiles for an x4 network. core = the part of each tile that is kept; pad = context on every side that is thrown away.
	 * fixed > 0: the network only takes fixed x fixed inputs, so every window is exactly that size (moved inside the picture at the edges,
	 * and padded by repeating the edge when the picture itself is smaller). */
	function tilePlan(w, h, opt) {
		opt = opt || {}; var fixed = opt.fixed || 0, pad = opt.pad == null ? 16 : opt.pad, core = fixed ? fixed - 2 * pad : (opt.tile || 256), out = [];
		for (var y = 0; y < h; y += core) for (var x = 0; x < w; x += core) {
			var cw = Math.min(core, w - x), ch = Math.min(core, h - y), wx, wy, ww, wh;
			if (fixed) {
				ww = fixed; wh = fixed;
				wx = w < ww ? 0 : Math.max(0, Math.min(x - pad, w - ww));
				wy = h < wh ? 0 : Math.max(0, Math.min(y - pad, h - wh));
			} else {
				wx = Math.max(0, x - pad); wy = Math.max(0, y - pad);
				ww = Math.min(w, x + cw + pad) - wx; wh = Math.min(h, y + ch + pad) - wy;
			}
			out.push({ cx: x, cy: y, cw: cw, ch: ch, wx: wx, wy: wy, ww: ww, wh: wh });
		}
		return out;
	}
	/* pixels of the source to read for a window: always inside the picture; the rest of a fixed window is filled by repeating edges. */
	function readRect(t, w, h) { var x0 = Math.max(0, t.wx), y0 = Math.max(0, t.wy); return { x: x0, y: y0, w: Math.min(w, t.wx + t.ww) - x0, h: Math.min(h, t.wy + t.wh) - y0 }; }
	/* RGBA bytes (rw x rh) -> float32 CHW 0..1 of size ww x wh, edge pixels repeated where the window is bigger than the read area */
	function toCHW(rgba, rw, rh, ww, wh) {
		var n = ww * wh, f = new Float32Array(3 * n);
		for (var y = 0; y < wh; y++) {
			var sy = y < rh ? y : rh - 1;
			for (var x = 0; x < ww; x++) {
				var sx = x < rw ? x : rw - 1, s = (sy * rw + sx) * 4, d = y * ww + x;
				f[d] = rgba[s] / 255; f[n + d] = rgba[s + 1] / 255; f[2 * n + d] = rgba[s + 2] / 255;
			}
		}
		return f;
	}
	/* float32 CHW (ww x wh) -> RGBA bytes, opaque */
	function fromCHW(d, ww, wh, outRGBA) {
		var m = ww * wh, a = outRGBA || new Uint8ClampedArray(m * 4);
		for (var k = 0; k < m; k++) { a[k * 4] = d[k] * 255; a[k * 4 + 1] = d[m + k] * 255; a[k * 4 + 2] = d[2 * m + k] * 255; a[k * 4 + 3] = 255; }
		return a;
	}
	/* number of network runs for a picture (for progress and the time estimate) */
	function countTiles(w, h, W, H, opt) {
		var p = plan(w, h, W, H), n = 0;
		p.steps.forEach(function (s) { if (s.type === "ai") n += tilePlan(s.inW, s.inH, opt).length; });
		return n;
	}
	/* rough seconds: measured on an M-series laptop (~0.3 s per 256 px tile on WebGPU, ~1.8 s per 128 px tile and ~7 s per fixed 256 px tile on the CPU) */
	function estimateSec(tiles, opt) { opt = opt || {}; var per = opt.gpu ? 0.3 : (opt.fixed ? 7 : 1.8); return Math.round(tiles * per); }
	function fmtSec(s) { if (s < 60) return Math.max(1, Math.round(s)) + " s"; var m = Math.round(s / 60); return m < 60 ? m + " min" : (m / 60).toFixed(1) + " h"; }
	function baseName(n) { n = String(n || "picture").replace(/^.*[\\/]/, ""); var i = n.lastIndexOf("."); return (i > 0 ? n.slice(0, i) : n) || "picture"; }
	function fmtFactor(f) { var r = Math.round(f * 100) / 100; return (r === Math.round(r) ? String(r) : r.toFixed(2).replace(/0$/, "")) + "x"; }
	function outName(name, f, ext, W, H, by) { return baseName(name) + "-upscaled-" + (by === "scale" ? fmtFactor(f) : W + "x" + H) + "." + ext; }
	function sameSize(a, b) { return a.w === b.w && a.h === b.h; }
	var api = { MAX_SIDE: MAX_SIDE, MAX_AREA: MAX_AREA, MODES: MODES, MODELS: MODELS, clampInt: clampInt, targetSize: targetSize, plan: plan, tilePlan: tilePlan, readRect: readRect,
		toCHW: toCHW, fromCHW: fromCHW, countTiles: countTiles, estimateSec: estimateSec, fmtSec: fmtSec, baseName: baseName, fmtFactor: fmtFactor, outName: outName, sameSize: sameSize };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESUp = api;
})(this);

/* MES Upscale: AI picture upscaler in the browser. Real-ESRGAN x4 models (BSD-3-Clause, self-hosted in /upscale/models/) through onnxruntime-web 1.22.0
 * (WebGPU first, CPU/wasm fallback, also when a run fails). Pictures are tiled (lib.js tilePlan), every tile goes through the x4 network, the kept centre is drawn
 * into the result; 8x / big width targets run a second pass on the result shrunk to a quarter of the final size. Nothing is uploaded. */
(function () {
	"use strict";
	var U = window.MESUp, I = window.MESImg, $ = function (id) { return document.getElementById(id); };
	if (!U || !$("up")) return;
	var ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js", CACHE = "mes-upscale-models", MODEL_V = "1";
	var KEY = "mes-upscale:v1", S = { mode: "photo", scale: "2", w: 3840, det: 100, fmt: "png", q: 92 };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var items = [], seq = 0, running = false, stopReq = false, ortP = null, sessions = {}, provider = null;
	function mk(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmtB(n) { return I && I.formatBytes ? I.formatBytes(n) : Math.round(n / 1024) + " KB"; }
	function toast(msg) { var t = document.createElement("div"); t.className = "tu-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3200); }

	/* ---------- engine ---------- */
	function ort() {
		if (window.ort) return Promise.resolve(window.ort);
		return ortP = ortP || new Promise(function (res, rej) { var s = document.createElement("script"); s.src = ORT; s.onload = function () { try { window.ort.env.wasm.numThreads = 1; } catch (e) {} res(window.ort); }; s.onerror = function () { ortP = null; rej(new Error("Could not load the AI engine (offline?)")); }; document.head.appendChild(s); });
	}
	function fetchModel(m, onProg) {
		var url = "/upscale/models/" + m.file + "?v=" + MODEL_V, c = window.caches ? caches.open(CACHE).catch(function () { return null; }) : Promise.resolve(null);
		return c.then(function (cache) {
			return (cache ? cache.match(url) : Promise.resolve(null)).then(function (hit) {
				if (hit) return hit.arrayBuffer();
				return fetch(url).then(function (r) {
					if (!r.ok) throw new Error("Model download failed (" + r.status + ")");
					var total = +r.headers.get("content-length") || m.mb * 1e6, rd = r.body.getReader(), got = 0, parts = [];
					function pump() { return rd.read().then(function (x) { if (x.done) return; parts.push(x.value); got += x.value.length; onProg(got, total); return pump(); }); }
					return pump().then(function () { var buf = new Uint8Array(got), p = 0; parts.forEach(function (a) { buf.set(a, p); p += a.length; }); if (cache) cache.put(url, new Response(buf.slice(0), { headers: { "content-type": "application/octet-stream" } })).catch(function () {}); return buf.buffer; });
				});
			});
		});
	}
	function session(key, onProg, forceWasm) {
		var s = sessions[key]; if (s && !forceWasm) return Promise.resolve(s);
		var m = U.MODELS[key];
		return Promise.all([ort(), s ? Promise.resolve(s.bytes) : fetchModel(m, onProg)]).then(function (r) {
			var o = r[0], bytes = r[1], tries = forceWasm || !navigator.gpu || /[?&]cpu=1/.test(location.search) ? ["wasm"] : ["webgpu", "wasm"];
			function next(i) {
				return o.InferenceSession.create(bytes, { executionProviders: [tries[i]] }).then(function (sess) {
					var x = { sess: sess, provider: tries[i], ort: o, key: key, bytes: bytes, m: m, inName: sess.inputNames[0], outName: sess.outputNames[0] };
					sessions[key] = x; provider = tries[i]; engNote(); return x;
				}, function (e) { if (i + 1 < tries.length) return next(i + 1); throw e; });
			}
			return next(0);
		});
	}
	function runTile(x, feeds) {
		return x.sess.run(feeds).then(function (out) { return { out: out[x.outName], x: x }; }, function (e) {
			if (x.provider !== "webgpu") throw e;
			return session(x.key, function () {}, true).then(function (x2) { var f2 = {}; f2[x2.inName] = feeds[x.inName]; return x2.sess.run(f2).then(function (out) { return { out: out[x2.outName], x: x2 }; }); });
		});
	}
	function engNote() {
		var el = $("up-eng"); if (!el) return;
		el.innerHTML = provider === "webgpu" ? "⚡ <b>Using your graphics chip</b> (WebGPU): fast. Runs on your device, nothing is uploaded."
			: provider === "wasm" ? "🐢 <b>Using the processor</b>: your browser did not offer the graphics chip (WebGPU), so big pictures take a while. Chrome, Edge or Brave on a computer are fastest."
			: "Runs on your device. The first AI upscale downloads a small model (5 MB or less) and keeps it in your browser." + (navigator.gpu ? "" : " <b>No WebGPU in this browser</b>: it will use the processor, which is slower.");
	}
	function tileOpt(key, prov) { var m = U.MODELS[key]; return m.fixed ? { fixed: m.fixed, pad: 16 } : { tile: (prov || (navigator.gpu ? "webgpu" : "wasm")) === "webgpu" ? 256 : 128, pad: 16 }; }
	/* one x4 pass of the network over a canvas -> canvas 4x */
	function aiPass(src, key, prog) {
		return session(key, function (g, t) { status("Downloading the AI model… " + (g / 1e6).toFixed(1) + " of " + (t / 1e6).toFixed(1) + " MB"); setBar(g / t); }).then(function (x) {
			var w = src.width, h = src.height, tiles = U.tilePlan(w, h, tileOpt(key, x.provider)), out = mk(w * 4, h * 4), ox = out.getContext("2d"), sx = src.getContext("2d", { willReadFrequently: true }), i = 0;
			var tc = null, tctx = null;
			function next() {
				if (stopReq) return Promise.reject(new Error("stopped"));
				if (i >= tiles.length) return Promise.resolve(out);
				var t = tiles[i++], r = U.readRect(t, w, h), id = sx.getImageData(r.x, r.y, r.w, r.h).data;
				var off = { x: r.x - t.wx, y: r.y - t.wy }, ww = t.ww, wh = t.wh, data;
				if (off.x || off.y) { /* window starts before the picture: not possible with our plans, but keep it safe */ }
				data = U.toCHW(id, r.w, r.h, ww, wh);
				var feeds = {}; feeds[x.inName] = new x.ort.Tensor("float32", data, [1, 3, wh, ww]);
				return runTile(x, feeds).then(function (res) {
					x = res.x; var d = res.out.data, W4 = ww * 4, H4 = wh * 4;
					if (!tc || tc.width !== W4 || tc.height !== H4) { tc = mk(W4, H4); tctx = tc.getContext("2d"); }
					var img = tctx.createImageData(W4, H4); U.fromCHW(d, W4, H4, img.data); tctx.putImageData(img, 0, 0);
					ox.drawImage(tc, (t.cx - r.x) * 4, (t.cy - r.y) * 4, t.cw * 4, t.ch * 4, t.cx * 4, t.cy * 4, t.cw * 4, t.ch * 4);
					prog(1);
					return new Promise(function (res2) { setTimeout(res2, 0); }).then(next);
				});
			}
			return next();
		});
	}
	function resize(src, W, H, smooth) { var c = mk(W, H), x = c.getContext("2d"); x.imageSmoothingEnabled = smooth !== false; x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, W, H); return c; }
	function hasAlpha(c) { var d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; for (var i = 3; i < d.length; i += 4) if (d[i] < 250) return true; return false; }

	/* ---------- items ---------- */
	function settingsKey() { return [S.mode, S.scale === "w" ? "w" + S.w : S.scale, S.det, S.fmt, S.q].join("|"); }
	function target(it) { return S.scale === "w" ? U.targetSize(it.w, it.h, "width", S.w) : U.targetSize(it.w, it.h, "scale", +S.scale); }
	function add(files) {
		var list = [].slice.call(files || []).filter(function (f) { return f && (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name || "")); });
		if (!list.length) { toast("No pictures found in that"); return; }
		list.forEach(function (f) {
			var it = { id: ++seq, file: f, name: f.name || "picture.png", status: "load" };
			items.push(it); drawItem(it);
			createImageBitmap(f).then(function (bm) { it.bm = bm; it.w = bm.width; it.h = bm.height; it.status = "wait"; drawItem(it); summary(); }, function () { it.status = "err"; it.err = "This browser cannot open that file"; drawItem(it); summary(); });
		});
		summary();
	}
	function drawItem(it) {
		var ul = $("up-list"), li = it.li;
		if (!li) { li = it.li = document.createElement("li"); li.className = "up-it"; li.innerHTML = '<div class="up-th"></div><div class="up-info"><div class="up-nm"></div><div class="up-meta"></div><div class="up-ibar"><i></i></div></div><div class="up-btns"></div>'; ul.appendChild(li); if (it.file) { var u = URL.createObjectURL(it.file); it.thumbUrl = u; li.querySelector(".up-th").style.backgroundImage = "url(" + u + ")"; } }
		li.querySelector(".up-nm").textContent = it.name;
		var meta = "", btn = "";
		if (it.status === "load") meta = "Opening…";
		else if (it.status === "err") meta = '<span class="up-err">' + esc(it.err || "Error") + "</span>";
		else {
			var t = target(it), ai = U.MODES[S.mode].ai;
			meta = it.w + " × " + it.h + " → <b>" + t.W + " × " + t.H + "</b> px";
			if (t.tooBig) meta += ' · <span class="up-err">too big for a browser (max 16,384 px a side, 80 MP)</span>';
			else if (it.status === "wait" && ai) { var n = U.countTiles(it.w, it.h, t.W, t.H, tileOpt(U.MODES[S.mode].model, provider)); meta += " · about " + U.fmtSec(U.estimateSec(n, { gpu: (provider || (navigator.gpu ? "webgpu" : "wasm")) === "webgpu", fixed: U.MODELS[U.MODES[S.mode].model].fixed })); }
			if (it.status === "busy") meta += " · <b>working…</b>";
			if (it.status === "done" && it.out) { meta = it.w + " × " + it.h + " → <b>" + it.out.W + " × " + it.out.H + "</b> px · " + fmtB(it.out.blob.size) + ' · <span class="up-ok">done in ' + U.fmtSec(it.out.sec) + "</span>"; if (it.out.key !== settingsKey()) meta += ' · <span class="up-warn">settings changed: upscale again to use them</span>'; }
		}
		li.querySelector(".up-meta").innerHTML = meta;
		li.classList.toggle("is-busy", it.status === "busy");
		if (it.status !== "busy") li.querySelector(".up-ibar i").style.width = it.status === "done" ? "100%" : "0";
		var done = it.status === "done" && it.out;
		btn += done ? '<button type="button" data-a="cmp" class="up-b-p">Compare</button><button type="button" data-a="dl">⬇ Save</button><button type="button" data-a="ed" title="Open the result in the MES Photo Editor">Edit</button>' : "";
		btn += it.status === "wait" || (done && it.out.key !== settingsKey()) ? '<button type="button" data-a="go">' + (done ? "↻ Again" : "✨ Upscale") + "</button>" : "";
		btn += it.status !== "busy" ? '<button type="button" data-a="rm" aria-label="Remove">✕</button>' : "";
		li.querySelector(".up-btns").innerHTML = btn;
		li.querySelectorAll(".up-btns button").forEach(function (b) { b.onclick = function () { act(it, b.getAttribute("data-a")); }; });
	}
	function act(it, a) {
		if (a === "rm") { if (it.out && it.out.url) URL.revokeObjectURL(it.out.url); if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl); it.li.remove(); items = items.filter(function (x) { return x !== it; }); summary(); }
		else if (a === "dl") download(it.out.blob, it.out.name);
		else if (a === "cmp") openCmp(it);
		else if (a === "go") runQueue([it]);
		else if (a === "ed") { if (I && I.handoffSend) I.handoffSend("/photo", [{ blob: it.out.blob, name: it.out.name }], function (u) { toast("Allow pop-ups for mes.fm, or open " + u); }).catch(function () { toast("Could not hand it over: save it and open it in the Photo Editor"); }); }
	}
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
	function summary() {
		var n = items.length, done = items.filter(function (x) { return x.status === "done" && x.out; }).length;
		$("up-bar").hidden = !n;
		$("up-sum").innerHTML = n ? "<b>" + n + "</b> picture" + (n > 1 ? "s" : "") + (done ? " · <b>" + done + "</b> upscaled" : "") : "";
		$("up-zip").disabled = !done || running;
		$("up-go").disabled = running || !items.some(function (x) { return x.status === "wait" || (x.status === "done" && x.out && x.out.key !== settingsKey()); });
		$("up-stop").hidden = !running;
	}
	function setBar(f) { var b = $("up-prog"); b.hidden = f == null; if (f != null) $("up-prog-i").style.width = Math.max(0, Math.min(1, f)) * 100 + "%"; }
	function status(t) { $("up-st").textContent = t || ""; }

	/* ---------- the work ---------- */
	function upscaleOne(it, prog) {
		var t = target(it), mode = U.MODES[S.mode], t0 = performance.now();
		if (t.tooBig) return Promise.reject(new Error("Too big for a browser: choose a smaller size"));
		var src = mk(it.w, it.h); src.getContext("2d").drawImage(it.bm, 0, 0);
		var alpha = hasAlpha(src), p;
		if (!mode.ai) p = Promise.resolve(resize(src, t.W, t.H, S.mode !== "pixel"));
		else {
			var plan = U.plan(it.w, it.h, t.W, t.H), cur = src, chain = Promise.resolve();
			if (alpha) { var flat = mk(it.w, it.h), fx = flat.getContext("2d"); fx.fillStyle = "#fff"; fx.fillRect(0, 0, it.w, it.h); fx.drawImage(src, 0, 0); cur = flat; }
			plan.steps.forEach(function (s) { chain = chain.then(function () { if (s.type === "ai") return aiPass(cur, mode.model, prog).then(function (c) { cur = c; }); cur = resize(cur, s.w, s.h, true); }); });
			p = chain.then(function () {
				if (S.det < 100) { var mix = resize(src, t.W, t.H, true), mx = mix.getContext("2d"); mx.globalAlpha = S.det / 100; mx.drawImage(cur, 0, 0); cur = mix; }
				if (alpha) { var a = mk(it.w, it.h), ax = a.getContext("2d"); ax.drawImage(src, 0, 0); ax.globalCompositeOperation = "source-in"; ax.fillStyle = "#000"; ax.fillRect(0, 0, it.w, it.h); var big = resize(a, t.W, t.H, true), cx = cur.getContext("2d"); cx.globalCompositeOperation = "destination-in"; cx.drawImage(big, 0, 0); cx.globalCompositeOperation = "source-over"; }
				return cur;
			});
		}
		return p.then(function (c) {
			var F = I.FORMATS[S.fmt], out = c;
			if (!F.alpha && alpha) { out = mk(c.width, c.height); var o = out.getContext("2d"); o.fillStyle = "#fff"; o.fillRect(0, 0, c.width, c.height); o.drawImage(c, 0, 0); }
			return new Promise(function (res, rej) { out.toBlob(function (b) { b ? res(b) : rej(new Error("Could not save the result (out of memory?)")); }, F.mime, F.lossy ? S.q / 100 : undefined); });
		}).then(function (blob) {
			if (it.out && it.out.url) URL.revokeObjectURL(it.out.url);
			it.out = { blob: blob, W: t.W, H: t.H, name: U.outName(it.name, t.f, I.FORMATS[S.fmt].ext, t.W, t.H, S.scale === "w" ? "width" : "scale"), key: settingsKey(), sec: (performance.now() - t0) / 1000 };
			it.status = "done";
		});
	}
	function runQueue(list) {
		if (running) return;
		list = (list || items).filter(function (x) { return x.bm && (x.status === "wait" || (x.status === "done" && x.out && x.out.key !== settingsKey())); });
		if (!list.length) return;
		running = true; stopReq = false; summary();
		var tp = window.MESTabProgress ? MESTabProgress.task("Upscaling") : null, total = 0, done = 0, t0 = performance.now();
		list.forEach(function (it) { var t = target(it); total += U.MODES[S.mode].ai ? U.countTiles(it.w, it.h, t.W, t.H, tileOpt(U.MODES[S.mode].model, provider)) : 1; });
		function prog(n) {
			done += n; var f = done / total, el = (performance.now() - t0) / 1000, left = done ? el / done * (total - done) : 0; setBar(f);
			status("Upscaling… " + Math.round(f * 100) + "%" + (left > 3 ? " · about " + U.fmtSec(left) + " left" : "") + (provider === "wasm" ? " · on the processor (no WebGPU)" : ""));
			if (tp) tp.set(f); var cur = list.filter(function (x) { return x.status === "busy"; })[0]; if (cur && cur.li) cur.li.querySelector(".up-ibar i").style.width = Math.round(100 * (done - cur._start) / cur._tiles) + "%";
		}
		var chain = Promise.resolve();
		list.forEach(function (it) {
			chain = chain.then(function () {
				if (stopReq) return; var t = target(it); it._start = done; it._tiles = U.MODES[S.mode].ai ? U.countTiles(it.w, it.h, t.W, t.H, tileOpt(U.MODES[S.mode].model, provider)) : 1;
				it.status = "busy"; drawItem(it); status("Starting…");
				return upscaleOne(it, prog).then(function () { if (!U.MODES[S.mode].ai) prog(1); drawItem(it); summary(); }, function (e) {
					if (e && e.message === "stopped") { it.status = it.out ? "done" : "wait"; drawItem(it); return; }
					it.status = "err"; it.err = "Could not upscale: " + (e && e.message ? e.message : e); drawItem(it); console.error(e);
				});
			});
		});
		chain.then(function () {
			running = false; setBar(null); var ok = list.filter(function (x) { return x.status === "done"; }).length;
			status(stopReq ? "Stopped." : ok ? "Done: " + ok + " picture" + (ok > 1 ? "s" : "") + " upscaled in " + U.fmtSec((performance.now() - t0) / 1000) + "." : "");
			if (tp) { if (stopReq) tp.stop(); else tp.done(ok ? "Upscaled" : "Failed"); }
			summary(); items.forEach(drawItem);
			if (ok === 1 && list.length === 1 && !stopReq) openCmp(list[0]);
		});
	}

	/* ---------- compare viewer ---------- */
	var C = { it: null, bm: null, z: 0, fit: true, ox: 0, oy: 0, split: 0.5, mode: "split" };
	function openCmp(it) {
		if (!it.out) return;
		createImageBitmap(it.out.blob).then(function (bm) {
			C.it = it; C.bm = bm; C.fit = true; C.split = 0.5; $("up-cmp-t").textContent = it.out.name + " · " + it.out.W + " × " + it.out.H;
			$("up-cmp").hidden = false; document.body.classList.add("up-cmping"); layoutCmp(); drawCmp();
		}, function () { toast("Could not show the result (out of memory?)"); });
	}
	function closeCmp() { $("up-cmp").hidden = true; document.body.classList.remove("up-cmping"); if (C.bm && C.bm.close) C.bm.close(); C.bm = null; C.it = null; }
	function layoutCmp() {
		var st = $("up-cmp-stage"), cv = $("up-cmp-cv"), dpr = window.devicePixelRatio || 1;
		cv.width = Math.round(st.clientWidth * dpr); cv.height = Math.round(st.clientHeight * dpr); cv.style.width = st.clientWidth + "px"; cv.style.height = st.clientHeight + "px";
		if (C.fit && C.bm) { var W = C.mode === "side" ? cv.width / 2 : cv.width; C.z = Math.min(W / C.bm.width, cv.height / C.bm.height); C.ox = (W - C.bm.width * C.z) / 2; C.oy = (cv.height - C.bm.height * C.z) / 2; }
	}
	function drawCmp() {
		if (!C.bm) return; var cv = $("up-cmp-cv"), x = cv.getContext("2d"), W = cv.width, H = cv.height, bm = C.bm, it = C.it, dw = bm.width * C.z, dh = bm.height * C.z;
		x.clearRect(0, 0, W, H); x.imageSmoothingQuality = "high";
		var dpr = window.devicePixelRatio || 1, sharp = C.z >= 1.5;
		if (C.mode === "side") {
			var half = W / 2;
			x.save(); x.beginPath(); x.rect(0, 0, half - 1, H); x.clip(); x.imageSmoothingEnabled = !sharp; x.drawImage(it.bm, C.ox, C.oy, dw, dh); x.restore();
			x.save(); x.beginPath(); x.rect(half + 1, 0, half, H); x.clip(); x.imageSmoothingEnabled = !sharp; x.drawImage(bm, half + C.ox, C.oy, dw, dh); x.restore();
			x.fillStyle = "#fff"; x.fillRect(half - 1, 0, 2, H);
		} else {
			var sx = W * C.split;
			x.imageSmoothingEnabled = !sharp; x.drawImage(bm, C.ox, C.oy, dw, dh);
			x.save(); x.beginPath(); x.rect(0, 0, sx, H); x.clip(); x.imageSmoothingEnabled = true; x.drawImage(it.bm, C.ox, C.oy, dw, dh); x.restore();
			x.fillStyle = "#fff"; x.fillRect(sx - 1 * dpr, 0, 2 * dpr, H);
			x.beginPath(); x.arc(sx, H / 2, 16 * dpr, 0, 7); x.fill(); x.fillStyle = "#333"; x.font = (14 * dpr) + "px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("◀▶", sx, H / 2);
		}
		$("up-cmp-zv").textContent = Math.round(C.z * 100) + "%";
		document.querySelectorAll("#up-cmp [data-m]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === C.mode ? "true" : "false"); });
		$("up-cmp").querySelector(".up-cmp-l").textContent = C.mode === "side" ? "Before (plain resize)" : "◀ Before (plain resize)"; $("up-cmp").querySelector(".up-cmp-r").textContent = C.mode === "side" ? "After" : "After ▶";
	}
	function zoomAt(f, px, py) { var nz = Math.max(0.02, Math.min(16, C.z * f)); C.ox = px - (px - C.ox) * nz / C.z; C.oy = py - (py - C.oy) * nz / C.z; C.z = nz; C.fit = false; drawCmp(); }
	(function wireCmp() {
		var cv = $("up-cmp-cv"), drag = null, pts = {};
		function pos(e) { var r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
		cv.addEventListener("pointerdown", function (e) {
			cv.setPointerCapture(e.pointerId); pts[e.pointerId] = pos(e); var p = pos(e), ids = Object.keys(pts);
			if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z: C.z, ox: C.ox, oy: C.oy, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return; }
			var near = C.mode === "split" && Math.abs(p.x - cv.width * C.split) < 26 * (window.devicePixelRatio || 1);
			drag = near ? { split: true } : { x: p.x, y: p.y, ox: C.ox, oy: C.oy };
		});
		cv.addEventListener("pointermove", function (e) {
			var p = pos(e); if (pts[e.pointerId]) pts[e.pointerId] = p;
			if (!drag) { cv.style.cursor = C.mode === "split" && Math.abs(p.x - cv.width * C.split) < 26 * (window.devicePixelRatio || 1) ? "ew-resize" : "grab"; return; }
			if (drag.pinch) { var ids = Object.keys(pts); if (ids.length < 2) return; var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), nz = Math.max(0.02, Math.min(16, drag.z * d / drag.pinch)); C.ox = drag.cx - (drag.cx - drag.ox) * nz / drag.z; C.oy = drag.cy - (drag.cy - drag.oy) * nz / drag.z; C.z = nz; C.fit = false; drawCmp(); return; }
			if (drag.split) { C.split = Math.max(0, Math.min(1, p.x / cv.width)); drawCmp(); return; }
			C.ox = drag.ox + p.x - drag.x; C.oy = drag.oy + p.y - drag.y; C.fit = false; drawCmp();
		});
		function up(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) drag = null; }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); var p = pos(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
		cv.addEventListener("dblclick", function (e) { var p = pos(e); if (C.fit) zoomAt(1 / C.z, p.x, p.y); else { C.fit = true; layoutCmp(); drawCmp(); } });
		$("up-cmp").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.hasAttribute("data-z")) { var z = b.getAttribute("data-z"); if (z === "fit") { C.fit = true; layoutCmp(); } else { var cvw = cv.width, cvh = cv.height; zoomAt(+z / C.z, cvw / 2, cvh / 2); } drawCmp(); }
			if (b.hasAttribute("data-m")) { C.mode = b.getAttribute("data-m"); C.fit = true; layoutCmp(); drawCmp(); }
		});
		$("up-cmp-x").onclick = closeCmp; $("up-cmp-dl").onclick = function () { if (C.it) download(C.it.out.blob, C.it.out.name); };
		document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("up-cmp").hidden) closeCmp(); });
		window.addEventListener("resize", function () { if (!$("up-cmp").hidden) { layoutCmp(); drawCmp(); } });
	})();

	/* ---------- options ---------- */
	function seg(id, key, after) {
		var box = $(id);
		function paint() { box.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === String(S[key]) ? "true" : "false"); }); }
		box.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b || running) return; S[key] = b.getAttribute("data-v"); paint(); save(); after && after(); changed(); });
		paint();
	}
	function changed() { items.forEach(drawItem); summary(); }
	function optsUi() {
		var m = U.MODES[S.mode]; $("up-mode-n").textContent = m.note + (m.ai ? " AI model: " + U.MODELS[m.model].name + "." : "");
		$("up-det-f").hidden = !m.ai; $("up-w-box").hidden = S.scale !== "w"; $("up-q-box").hidden = !I.FORMATS[S.fmt].lossy;
	}
	seg("up-mode", "mode", optsUi); seg("up-scale", "scale", optsUi); seg("up-fmt", "fmt", optsUi);
	$("up-w").value = S.w; $("up-w").addEventListener("change", function () { S.w = U.clampInt(this.value, 16, 16384); this.value = S.w; save(); changed(); });
	document.querySelectorAll("#up-w-box [data-w]").forEach(function (b) { b.onclick = function () { S.w = +b.getAttribute("data-w"); $("up-w").value = S.w; save(); changed(); }; });
	$("up-det").value = S.det; $("up-det-v").textContent = S.det; $("up-det").addEventListener("input", function () { S.det = +this.value; $("up-det-v").textContent = S.det; save(); changed(); });
	$("up-q").value = S.q; $("up-q-v").textContent = S.q; $("up-q").addEventListener("input", function () { S.q = +this.value; $("up-q-v").textContent = S.q; save(); changed(); });
	optsUi(); engNote();

	/* ---------- input ---------- */
	var drop = $("up-drop"), fi = $("up-file");
	$("up-pick").onclick = function (e) { e.stopPropagation(); fi.click(); };
	drop.addEventListener("click", function (e) { if (!e.target.closest("button")) fi.click(); });
	drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
	fi.addEventListener("change", function () { add(fi.files); fi.value = ""; });
	["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
	["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("is-over"); }); });
	drop.addEventListener("drop", function (e) { e.preventDefault(); add(e.dataTransfer.files); });
	document.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
	document.addEventListener("drop", function (e) { if (e.target.closest && e.target.closest("#up-drop")) return; if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); add(e.dataTransfer.files); } });
	document.addEventListener("paste", function (e) { if (e.target.closest && e.target.closest("input,textarea,[contenteditable]")) return; var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); add(fs); } });
	$("up-sample").onclick = function (e) { e.stopPropagation(); fetch("/upscale/img/sample.jpg").then(function (r) { return r.blob(); }).then(function (b) { add([new File([b], "sample.jpg", { type: "image/jpeg" })]); }).catch(function () { toast("Could not load the sample"); }); };
	$("up-go").onclick = function () { runQueue(); };
	$("up-stop").onclick = function () { stopReq = true; status("Stopping after this tile…"); };
	$("up-clear").onclick = function () { if (running) return; items.slice().forEach(function (it) { act(it, "rm"); }); status(""); };
	$("up-zip").onclick = function () {
		var done = items.filter(function (x) { return x.status === "done" && x.out; }); if (!done.length) return;
		if (done.length === 1) { download(done[0].out.blob, done[0].out.name); return; }
		var used = {}; Promise.all(done.map(function (it) { return it.out.blob.arrayBuffer().then(function (b) { var nm = I.uniqueName(it.out.name, used); return { name: nm, data: new Uint8Array(b) }; }); })).then(function (files) { download(new Blob([I.zipStore(files)], { type: "application/zip" }), "upscaled.zip"); });
	};
	window.addEventListener("beforeunload", function (e) { if (running) { e.preventDefault(); e.returnValue = ""; } });
	if (I && I.handoffReceive) I.handoffReceive().then(function (fs) { if (fs.length) add(fs); });
	window.MESUpscaleDebug = { items: function () { return items; }, run: runQueue, add: add, S: S, provider: function () { return provider; } };
})();
