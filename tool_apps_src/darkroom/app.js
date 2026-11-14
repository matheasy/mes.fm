/* MES Darkroom: library + develop UI. Uses MESDR (lib.js), DREngine / DRGeo (engine.js), MESImg (image-converter: ZIP + hand-off), MESExif (exif-viewer). */
(function () {
	"use strict";
	var D = window.MESDR, root = document.getElementById("dr"); if (!root || !D) return;
	var G = window.DRGeo;
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
	function scrollIn(box, el, mode) { if (!box || !el || !box.clientWidth) return; var b = box.getBoundingClientRect(), r = el.getBoundingClientRect(); function axis(lo, hi, blo, bhi, size) { if (mode === "center") return (lo + hi) / 2 - (blo + bhi) / 2; if (lo < blo) return lo - blo; if (hi > bhi) return Math.min(hi - bhi, lo - blo); return 0; } var dy = axis(r.top, r.bottom, b.top, b.bottom), dx = axis(r.left, r.right, b.left, b.right); if (dy) box.scrollTop += dy; if (dx) box.scrollLeft += dx; }
	function cap(el, e) { try { el.setPointerCapture(e.pointerId); } catch (x) {} }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function debounce(fn, ms) { var t; return function () { var a = arguments, me = this; clearTimeout(t); t = setTimeout(function () { fn.apply(me, a); }, ms); }; }
	function fmtBytes(n) { return n > 1e9 ? (n / 1e9).toFixed(2) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1e3) + " KB"; }
	var IMPORT = new Function("u", "return import(u)");
	var hasDirPicker = typeof window.showDirectoryPicker === "function", hasSavePicker = typeof window.showSaveFilePicker === "function";

	/* ---------------- storage ---------------- */
	var DB = (function () {
		var p = null;
		function open() { if (p) return p; p = new Promise(function (res, rej) { var r = indexedDB.open("mes-darkroom", 1); r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains("rec")) d.createObjectStore("rec", { keyPath: "key" }); if (!d.objectStoreNames.contains("thumb")) d.createObjectStore("thumb"); if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); return p; }
		function tx(store, mode, fn) { return open().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = function () { res(out && typeof out === "object" && "readyState" in out ? out.result : out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; }); }); }
		return {
			get: function (st, k) { return tx(st, "readonly", function (s) { return s.get(k); }).catch(function () { return undefined; }); },
			put: function (st, v, k) { return tx(st, "readwrite", function (s) { return k === undefined ? s.put(v) : s.put(v, k); }).catch(function () {}); },
			del: function (st, k) { return tx(st, "readwrite", function (s) { return s.delete(k); }).catch(function () {}); },
			all: function (st) { return tx(st, "readonly", function (s) { return s.getAll(); }).catch(function () { return []; }); },
			clear: function (st) { return tx(st, "readwrite", function (s) { return s.clear(); }).catch(function () {}); }
		};
	})();
	var PK = "mes-darkroom:v1";
	var prefs = (function () { var d = { lv: "pro", lw: 0, rw: 0, ts: 170, sort: "date", dir: "asc", sub: true, raw: true, side: false, xmp: true, hide: {}, closed: { lens: true, transform: true, detail: true }, exp: { fmt: "jpeg", q: 90, size: "long", val: 2048, enlarge: false, name: "{name}", dest: hasDirPicker ? "folder" : "zip", wm: "", wmPos: "br", wmSize: 3, wmOp: 70, rawFull: true }, healR: 0.03, healHeal: true, brush: { size: 0.08, feather: 60, flow: 60 }, paste: null }; try { var s = JSON.parse(localStorage.getItem(PK) || "{}"); Object.keys(s).forEach(function (k) { if (k === "exp" || k === "brush") Object.assign(d[k], s[k]); else d[k] = s[k]; }); } catch (e) {} return d; })();
	function savePrefs() { try { localStorage.setItem(PK, JSON.stringify(prefs)); } catch (e) {} }

	/* ---------------- state ---------------- */
	var photos = [], byKey = {}, recs = {}, view = [], cur = -1, sel = new Set(), mod = "library", rootDir = null, rootName = "", userPresets = [], colls = [], filter = { q: "", minRating: 0, flag: "any", label: 0, edited: "any", kind: "any", folder: "", coll: null, special: "" };
	var dev = null, eng = null, work = null, clip = null;
	try { clip = JSON.parse(localStorage.getItem(PK + ":clip") || "null"); } catch (e) {}

	function recOf(p) { return recs[p.key] || null; }
	function ensureRec(p) { var r = recs[p.key]; if (!r) { r = recs[p.key] = { key: p.key, rating: 0, flag: 0, label: 0, kw: [], s: null, snaps: [], hist: [], t: 0 }; } return r; }
	var saveQ = {}, saveT = null;
	function saveRec(r) { saveQ[r.key] = r; clearTimeout(saveT); saveT = setTimeout(flushSaves, 400); }
	function flushSaves() { var q = saveQ; saveQ = {}; Object.keys(q).forEach(function (k) { var r = q[k]; DB.put("rec", JSON.parse(JSON.stringify(r))); if (prefs.side) writeSidecar(byKey[k], r); }); }
	window.addEventListener("pagehide", flushSaves);

	/* ---------------- toast / modal ---------------- */
	var toastT;
	function toast(msg, ms, btn) { var t = $("dr-toast"); t.innerHTML = esc(msg); if (btn) { var b = h("button", "dr-b dr-b--sm", esc(btn.label)); b.onclick = function () { t.classList.remove("dr-show"); btn.fn(); }; t.appendChild(b); } t.classList.add("dr-show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("dr-show"); }, ms || 3200); }
	var modalClose = null;
	function modal(html, onReady) { var m = $("dr-modal"), d = $("dr-dlg"); d.innerHTML = html; m.hidden = false; var f = d.querySelector("input,select,button,textarea"); if (f) setTimeout(function () { f.focus(); }, 30); modalClose = function () { m.hidden = true; d.innerHTML = ""; modalClose = null; }; if (onReady) onReady(d, modalClose); return d; }
	$("dr-modal").addEventListener("mousedown", function (e) { if (e.target === this && modalClose && !this._busy) modalClose(); });
	function confirmBox(title, text, okLabel) { return new Promise(function (res) { modal('<h3>' + esc(title) + '</h3><p class="dr-note">' + esc(text) + '</p><div class="dr-acts"><button type="button" class="dr-b" data-a="no">Cancel</button><button type="button" class="dr-b dr-b--pri" data-a="ok">' + esc(okLabel || "OK") + '</button></div>', function (d, close) { d.onclick = function (e) { var a = e.target.getAttribute("data-a"); if (a) { close(); res(a === "ok"); } }; }); }); }
	function promptBox(title, value, okLabel) { return new Promise(function (res) { modal('<h3>' + esc(title) + '</h3><input type="text" class="dr-in" style="width:100%" id="dr-pr" value="' + esc(value || "") + '"><div class="dr-acts"><button type="button" class="dr-b" data-a="no">Cancel</button><button type="button" class="dr-b dr-b--pri" data-a="ok">' + esc(okLabel || "OK") + '</button></div>', function (d, close) { var i = d.querySelector("#dr-pr"); i.select(); function done(ok) { var v = i.value.trim(); close(); res(ok && v ? v : null); } i.onkeydown = function (e) { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }; d.onclick = function (e) { var a = e.target.getAttribute("data-a"); if (a) done(a === "ok"); }; }); }); }

	/* ---------------- import ---------------- */
	var sideMap = {};   /* "dir/stem" (lower case) -> {xmp, mesdr} handles or files */
	function stemKey(dir, name) { return ((dir ? dir + "/" : "") + name.replace(/\.[^.]+$/, "")).toLowerCase(); }
	function addPhoto(o) {
		var key = (o.dir ? o.dir + "/" : "") + o.name + "|" + o.size;
		if (byKey[key]) return byKey[key];
		var p = { key: key, name: o.name, dir: o.dir || "", file: o.file || null, fh: o.fh || null, size: o.size, mtime: o.mtime || 0, raw: D.isRaw(o.name), ext: D.ext(o.name), date: 0, w: 0, h: 0, url: "", tstate: 0 };
		photos.push(p); byKey[key] = p; return p;
	}
	async function scanDir(dirH, path, depth, out) {
		for await (var entry of dirH.values()) {
			if (entry.name.charAt(0) === ".") continue;
			if (entry.kind === "directory") { if (prefs.sub && depth < 8 && !/^(@eaDir|\$RECYCLE\.BIN|System Volume Information|node_modules)$/i.test(entry.name)) await scanDir(entry, path ? path + "/" + entry.name : entry.name, depth + 1, out); continue; }
			var e = D.ext(entry.name);
			if (e === "xmp" || e === "mesdr") { var sk = stemKey(path, entry.name), m = sideMap[sk] || (sideMap[sk] = {}); m[e] = entry; m.dirH = dirH; continue; }
			if (!D.isPhoto(entry.name)) continue;
			out.push({ name: entry.name, dir: path, fh: entry, dirH: dirH });
			if (out.length % 200 === 0) busyText("Found " + out.length + " photos…");
		}
	}
	async function openFolder(handle) {
		var dh = handle;
		if (!dh) { if (!hasDirPicker) { $("dr-pickdir").click(); return; } try { dh = await window.showDirectoryPicker({ id: "mes-darkroom", mode: prefs.side ? "readwrite" : "read" }); } catch (e) { return; } }
		closeAll(); rootDir = dh; rootName = dh.name; DB.put("kv", dh, "dir");
		showStartBusy("Reading the folder…");
		var list = []; try { await scanDir(dh, "", 0, list); } catch (e) { toast("Could not read that folder: " + e.message, 5000); }
		busyText("Found " + list.length + " photos…");
		await addList(list);
	}
	async function addList(list) {
		var made = 0;
		for (var i = 0; i < list.length; i++) {
			var o = list[i], size = o.size, mtime = o.mtime;
			if (o.fh && size == null) { try { var f = await o.fh.getFile(); size = f.size; mtime = f.lastModified; } catch (e) { continue; } }
			var p = addPhoto({ name: o.name, dir: o.dir, file: o.file, fh: o.fh, size: size, mtime: mtime }); p.dirH = o.dirH || null; made++;
			if (i % 150 === 0) busyText("Reading " + (i + 1) + " of " + list.length + "…");
		}
		await readSidecars();
		hideStartBusy(); refreshAll(); if (!photos.length) { showStart(); toast("No photos found there.", 4000); }
		else toast(made + " photos" + (made !== photos.length ? " (" + photos.length + " in the catalogue)" : ""), 2500);
		pumpThumbs();
	}
	async function readText(x) { var f = x.getFile ? await x.getFile() : x; return await f.text(); }
	async function readSidecars() {
		var n = 0, notes = [];
		for (var i = 0; i < photos.length; i++) {
			var p = photos[i], m = sideMap[stemKey(p.dir, p.name)]; if (!m) continue; p.side = m;
			var r = recs[p.key];
			try {
				if (m.mesdr) { var j = JSON.parse(await readText(m.mesdr)); if (j && j.app === "mes-darkroom" && (!r || (j.t || 0) > Math.max(r.t || 0, r.mt || 0))) { r = ensureRec(p); ["rating", "flag", "label", "kw", "s", "snaps", "title", "caption"].forEach(function (k) { if (j[k] !== undefined) r[k] = j[k]; }); r.t = j.et != null ? j.et : (j.t || 0); r.mt = j.t || 0; if (r.s) r.s = D.normalize(r.s); DB.put("rec", JSON.parse(JSON.stringify(r))); n++; } }
				else if (m.xmp && prefs.xmp && (!r || (!r.t && !r.fromXmp))) { var x = D.parseXmp(await readText(m.xmp)); if (x) { r = ensureRec(p); if (x.settings) r.s = x.settings; if (x.rating != null && x.rating > 0) r.rating = x.rating; if (x.rating === -1) r.flag = -1; if (x.label) r.label = x.label; if (x.keywords.length) r.kw = x.keywords; r.fromXmp = 1; r.t = r.t || 0; DB.put("rec", JSON.parse(JSON.stringify(r))); n++; x.notes.forEach(function (t) { if (notes.indexOf(t) < 0) notes.push(t); }); } }
			} catch (e) {}
		}
		if (n) toast("Read edits for " + n + " photos from files next to them." + (notes.length ? " " + notes[0] : ""), 6000);
	}
	function filesToList(files) {
		var list = [], rel;
		Array.prototype.forEach.call(files, function (f) {
			rel = f.webkitRelativePath || f._rel || ""; var parts = rel ? rel.split("/") : [], dir = parts.length > 1 ? parts.slice(1, -1).join("/") : "";
			if (!prefs.sub && dir) return;
			var e = D.ext(f.name);
			if (e === "xmp" || e === "mesdr") { var sk = stemKey(dir, f.name), m = sideMap[sk] || (sideMap[sk] = {}); m[e] = f; return; }
			if (D.isPhoto(f.name)) list.push({ name: f.name, dir: dir, file: f, size: f.size, mtime: f.lastModified });
		});
		if (files.length && files[0].webkitRelativePath) rootName = files[0].webkitRelativePath.split("/")[0];
		return list;
	}
	async function addFiles(files, replace) {
		if (replace) closeAll();
		showStartBusy("Adding photos…");
		await addList(filesToList(files));
	}
	async function dropItems(dt) {
		var items = dt.items ? Array.prototype.slice.call(dt.items) : [], handles = [];
		if (items.length && items[0].getAsFileSystemHandle) { handles = await Promise.all(items.map(function (it) { return it.kind === "file" ? it.getAsFileSystemHandle() : null; })); handles = handles.filter(Boolean); }
		if (handles.length === 1 && handles[0].kind === "directory") return openFolder(handles[0]);
		if (handles.length) {
			var list = [], ps = [];
			for (var i = 0; i < handles.length; i++) { var hh = handles[i]; if (hh.kind === "directory") { await scanDir(hh, hh.name, 1, list); } else if (D.isPhoto(hh.name)) list.push({ name: hh.name, dir: "", fh: hh }); else { var e = D.ext(hh.name); if (e === "xmp" || e === "mesdr") { var m = sideMap[stemKey("", hh.name)] || (sideMap[stemKey("", hh.name)] = {}); m[e] = hh; } } }
			if (!photos.length) showStartBusy("Adding photos…");
			return addList(list);
		}
		/* older browsers: entries */
		var entries = items.map(function (it) { return it.webkitGetAsEntry && it.webkitGetAsEntry(); }).filter(Boolean), files = [];
		function walk(en, path) { return new Promise(function (res) { if (en.isFile) en.file(function (f) { f._rel = "x/" + (path ? path + "/" : "") + f.name; files.push(f); res(); }, res); else { var r = en.createReader(), all = []; (function more() { r.readEntries(function (es) { if (!es.length) { Promise.all(all.map(function (c) { return walk(c, (path ? path + "/" : "") + en.name); })).then(res); } else { all = all.concat(es); more(); } }, res); })(); } }); }
		if (entries.length) { await Promise.all(entries.map(function (en) { return walk(en, ""); })); return addFiles(files, false); }
		if (dt.files && dt.files.length) return addFiles(dt.files, false);
	}
	async function getFile(p) { if (p.file) return p.file; return await p.fh.getFile(); }
	function closeAll() { photos.forEach(function (p) { if (p.url) URL.revokeObjectURL(p.url); }); photos = []; byKey = {}; view = []; cur = -1; sel.clear(); sideMap = {}; rootDir = null; rootName = ""; filter.folder = ""; filter.coll = null; filter.special = ""; if (dev) leaveDevelop(true); }

	/* ---------------- previews ---------------- */
	async function rawPreviewBlob(file) {
		var head = new Uint8Array(await file.slice(0, Math.min(file.size, 32e6)).arrayBuffer());
		var best = D.bestPreview(D.findJpegs(head), 300);
		if (!best && file.size > 32e6) { head = new Uint8Array(await file.arrayBuffer()); best = D.bestPreview(D.findJpegs(head), 300); }
		if (!best) best = D.bestPreview(D.findJpegs(head), 0);
		return { blob: best ? new Blob([head.subarray(best.off, best.off + best.len)], { type: "image/jpeg" }) : null, orient: D.tiffOrientation(head), head: head };
	}
	/* oriented ImageBitmap / canvas no larger than maxSide (0 = full). Returns {img, w, h, exif} */
	async function loadPreview(p, maxSide) {
		var file = await getFile(p), blob = file, orient = 0, head = null;
		if (p.raw) { var r = await rawPreviewBlob(file); if (!r.blob) throw new Error("No preview found inside this RAW file."); blob = r.blob; orient = r.orient; head = r.head; }
		else head = new Uint8Array(await file.slice(0, 196608).arrayBuffer());
		if (!p.exif) exifInfo(p, head);
		var bmp;
		try { bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
		catch (e) { if (/heic|heif/.test(p.ext)) throw new Error("This browser can't open HEIC photos (Safari can). Convert them to JPEG first."); throw new Error("This photo could not be read."); }
		var W = bmp.width, H = bmp.height, turn = orient >= 5, w = turn ? H : W, hh = turn ? W : H;
		var k = maxSide ? Math.min(1, maxSide / Math.max(w, hh)) : 1;
		p.ow = w; p.oh = hh;
		if (!orient || orient === 1) { if (k >= 1) return { img: bmp, w: W, h: H }; }
		var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(hh * k)), c = document.createElement("canvas"); c.width = cw; c.height = ch; var x = c.getContext("2d"); x.imageSmoothingQuality = "high";
		x.save(); x.scale(cw / w, ch / hh);
		var M = { 2: [-1, 0, 0, 1, W, 0], 3: [-1, 0, 0, -1, W, H], 4: [1, 0, 0, -1, 0, H], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, H, 0], 7: [0, -1, -1, 0, H, W], 8: [0, -1, 1, 0, 0, W] }[orient]; if (M) x.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
		x.drawImage(bmp, 0, 0); x.restore(); bmp.close && bmp.close();
		return { img: c, w: cw, h: ch };
	}
	function exifInfo(p, head) { if (!window.MESExif) return; try { p.exif = MESExif.parse(head); var rows = p.exif.rows || [], f = function (re) { var r = rows.find(function (x) { return re.test(x.name); }); return r ? String(r.value) : ""; }; var dv = f(/^Date taken/i) || f(/^Date digitized/i) || f(/^Date modified/i), m = /^(\d{4})[-:](\d\d)[-:](\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(dv); if (m && !p.date) p.date = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); var w = parseInt(f(/^Width/i), 10), hh = parseInt(f(/^Height/i), 10); if (w > 0 && hh > 0) { p.fw = w; p.fh2 = hh; } } catch (e) { p.exif = { rows: [] }; } }
	async function readMeta(p) { if (p.exif || !window.MESExif) return; try { var f = await getFile(p), head = new Uint8Array(await f.slice(0, 262144).arrayBuffer()); exifInfo(p, head); } catch (e) { p.exif = { rows: [] }; } }
	/* full RAW decode with LibRaw (worker) -> half floats */
	var HALF = null;
	async function decodeRaw(file, onStage) {
		var mod = await IMPORT("/main_js/libraw/1.6.0/index.js"), LibRaw = mod.default, raw = new LibRaw();
		try {
			onStage && onStage("Decoding RAW…");
			await raw.open(new Uint8Array(await file.arrayBuffer()), { outputBps: 16, gamm: [1, 1], noAutoBright: true, useCameraWb: true, useCameraMatrix: 1, outputColor: 1, userQual: 3, highlight: 2 });
			var img = await raw.imageData();
			var w = img.width, hh = img.height, d = img.data, n = w * hh * 3;
			if (!(d instanceof Uint16Array)) d = new Uint16Array(d.buffer || d, d.byteOffset || 0, n);
			if ((img.colors || 3) !== 3) throw new Error("Unexpected colour layout");
			if (!HALF) HALF = D.halfTable();
			for (var i = 0; i < n; i++) d[i] = HALF[d[i]];
			return { w: w, h: hh, half: d.length === n ? d : d.subarray(0, n), gain: 1 };
		} finally { try { raw.dispose(); } catch (e) {} }
	}

	/* brightness of a decoded RAW is matched to the camera's own preview: median luminance of the default rendering */
	function s2l(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
	function medianLum(e) { return D.percentile(D.histogram(e.pixels(D.defaults(), 256).data).l, 0.5); }
	function matchRawGain(e, target) {
		var t = s2l(clamp(target, 0.03, 0.97)); e.gain = 1;
		for (var i = 0; i < 4; i++) { var m = s2l(Math.max(medianLum(e), 0.004)); var k = clamp(t / m, 0.2, 40); e.gain = clamp(e.gain * k, 0.05, 400); if (Math.abs(Math.log(k)) < 0.03) break; }
		return e.gain;
	}
	/* ---------------- thumbnails ---------------- */
	var thumbQ = [], thumbBusy = 0, thumbGen = 0;
	function tsig(p) { var r = recOf(p); return r && r.s && D.isEdited(r.s) ? (r.t || 1) : 0; }
	function wantThumb(p, prio) { if (p.tstate === 1 || (p.tstate === 2 && p.tsig === tsig(p))) return; if (thumbQ.indexOf(p) < 0) { if (prio) thumbQ.unshift(p); else thumbQ.push(p); } pumpThumbs(); }
	function pumpThumbs() {
		while (thumbBusy < 3 && thumbQ.length) {
			var p = thumbQ.shift(); if (!byKey[p.key]) continue; if (p.tstate === 2 && p.tsig === tsig(p)) continue;
			thumbBusy++; p.tstate = 1; var gen = thumbGen;
			makeThumb(p).catch(function () { p.terr = true; }).then(function (pp) { return function () { thumbBusy--; if (gen !== thumbGen) return; pp.tstate = 2; updateCell(pp); pumpThumbs(); }; }(p));
		}
	}
	async function makeThumb(p) {
		var sig = tsig(p), tk = p.key + "|" + p.mtime, t = await DB.get("thumb", tk);
		if (t && t.sig === sig && t.blob) { setThumb(p, t.blob, sig); if (t.date && !p.date) p.date = t.date; p.w = t.w || p.w; p.h = t.h || p.h; return; }
		var pv = await loadPreview(p, 640), r = recOf(p), canvas;
		p.w = p.w || pv.w; p.h = p.h || pv.h;
		if (sig && r && r.s) { canvas = await renderSmall(pv.img, r.s, 360); }
		else { var k = Math.min(1, 360 / Math.max(pv.w, pv.h)); canvas = document.createElement("canvas"); canvas.width = Math.round(pv.w * k); canvas.height = Math.round(pv.h * k); var x = canvas.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(pv.img, 0, 0, canvas.width, canvas.height); }
		if (pv.img.close) pv.img.close();
		var blob = await new Promise(function (res) { canvas.toBlob(res, "image/webp", 0.82); }) || await new Promise(function (res) { canvas.toBlob(res, "image/jpeg", 0.85); });
		if (!blob) return;
		DB.put("thumb", { blob: blob, sig: sig, date: p.date, w: p.w, h: p.h }, tk);
		setThumb(p, blob, sig);
	}
	function setThumb(p, blob, sig) { if (p.url) URL.revokeObjectURL(p.url); p.url = URL.createObjectURL(blob); p.tsig = sig; }
	/* render settings on a small picture with the work engine */
	function workEngine() { if (!work) { var c = document.createElement("canvas"); c.width = 4; c.height = 4; work = new window.DREngine(c, { preserve: false }); } return work; }
	async function renderSmall(img, s, maxSide) {
		var e = workEngine(); e.setImage(img); s = D.normalize(s); await setMasksFor(e, s);
		var g = G.geometry(s, e.W, e.H), k = Math.min(1, maxSide / Math.max(g.cw, g.ch));
		return e.renderTo(s, Math.max(1, Math.round(g.cw * k)), Math.max(1, Math.round(g.ch * k)));
	}
	/* brush masks: pack every brush local's mask into the two RGBA textures */
	function loadImg(url) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = url; }); }
	async function setMasksFor(e, s, canvases) {
		var brushes = s.locals.filter(function (l) { return l.type === "brush"; }).slice(0, 8);
		if (!brushes.length) { e.setMask(0, null); e.setMask(1, null); return; }
		var mw = 1024, mh = 1024, k = 1024 / Math.max(e.W, e.H); mw = Math.max(8, Math.round(e.W * k)); mh = Math.max(8, Math.round(e.H * k));
		var datas = [];
		for (var i = 0; i < brushes.length; i++) {
			var l = brushes[i]; l._slot = i; var cv = canvases && canvases[l.id];
			if (!cv) { cv = document.createElement("canvas"); cv.width = mw; cv.height = mh; if (l.mask) { var im = await loadImg(l.mask); if (im) cv.getContext("2d").drawImage(im, 0, 0, mw, mh); } }
			datas.push(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height));
		}
		[0, 1].forEach(function (t) {
			var out = new ImageData(datas[0].width, datas[0].height), o = out.data, any = false;
			for (var c = 0; c < 4; c++) { var di = datas[t * 4 + c]; if (!di) continue; any = true; var src = di.data; for (var j = 0; j < o.length; j += 4) o[j + c] = src[j + 3]; }
			e.setMask(t, any ? out : null);
		});
	}

	/* ---------------- sidecars ---------------- */
	async function writeSidecar(p, r) {
		if (!p || !p.fh || !p.dirH) return;
		try {
			var name = p.name.replace(/\.[^.]+$/, "") + ".mesdr";
			if (p.dirH.queryPermission && (await p.dirH.queryPermission({ mode: "readwrite" })) !== "granted") return;
			var fh = await p.dirH.getFileHandle(name, { create: true }), w = await fh.createWritable();
			await w.write(JSON.stringify({ app: "mes-darkroom", v: 1, file: p.name, t: Math.max(r.t || 0, r.mt || 0), et: r.t || 0, rating: r.rating, flag: r.flag, label: r.label, kw: r.kw, title: r.title, caption: r.caption, s: r.s, snaps: r.snaps }, null, 1)); await w.close();
		} catch (e) {}
	}

	/* ---------------- filtering / view ---------------- */
	function rebuildView() {
		var keep = cur >= 0 && view[cur] ? view[cur].key : null, f = Object.assign({}, filter);
		if (f.special === "qc") f.coll = quick(); else if (f.special === "picked") f.flag = "picked"; else if (f.special === "edited") f.edited = "yes"; else if (f.special === "rejected") f.flag = "rejected";
		if (f.edited === "raw" || f.edited === "jpeg") { f.kind = f.edited; f.edited = "any"; }
		view = D.sortPhotos(D.filterPhotos(photos, f, recOf), prefs.sort, prefs.dir, recOf);
		cur = keep ? view.findIndex(function (p) { return p.key === keep; }) : -1; if (cur < 0 && view.length) cur = 0;
	}
	function quick() { var q = colls.find(function (c) { return c.id === "qc"; }); return q ? q.keys : []; }
	function curPhoto() { return cur >= 0 ? view[cur] : null; }
	function selected() { var s = view.filter(function (p) { return sel.has(p.key); }); if (!s.length && curPhoto()) s = [curPhoto()]; return s; }

	/* ---------------- top-level layout ---------------- */
	function applyLayout() {
		root.style.setProperty("--dr-ts", prefs.ts + "px"); if (prefs.lw) root.style.setProperty("--dr-lw", prefs.lw + "px"); if (prefs.rw) root.style.setProperty("--dr-rw", prefs.rw + "px");
		root.classList.toggle("dr-hl", !!prefs.hide.l); root.classList.toggle("dr-hr", !!prefs.hide.r); root.classList.toggle("dr-hf", !!prefs.hide.f);
		root.querySelectorAll("#dr-level button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lv") === prefs.lv ? "true" : "false"); });
		$("dr-tsize").value = prefs.ts; $("dr-sort").value = prefs.sort; $("dr-sortdir").textContent = prefs.dir === "asc" ? "↑" : "↓"; $("dr-sub").checked = prefs.sub !== false;
	}
	function showStart() { $("dr-start").hidden = false; $("dr-grid").hidden = true; $("dr-stage").hidden = true; $("dr-fbar").hidden = true; $("dr-tbar").hidden = true; $("dr-film").hidden = true; $("dr-left").innerHTML = ""; $("dr-right").innerHTML = ""; $("dr-crumb").textContent = ""; }
	function showStartBusy(t) { $("dr-start").hidden = false; $("dr-grid").hidden = true; $("dr-stage").hidden = true; $("dr-how").innerHTML = '<span class="dr-spin" style="display:inline-block;vertical-align:middle"></span> <span id="dr-howt">' + esc(t) + "</span>"; }
	function busyText(t) { var e = $("dr-howt"); if (e) e.textContent = t; }
	function hideStartBusy() { $("dr-how").innerHTML = howText(); }
	function howText() { return hasDirPicker ? "Tip: the folder can be inside OneDrive, Dropbox, iCloud or Google Drive." : (/Brave/.test(navigator.userAgent) || navigator.brave ? "Brave: turn on brave://flags/#file-system-access-api to save edits next to the photos and export straight into a folder." : "This browser opens folders read-only: edits are kept in the browser and exports are downloads."); }
	function refreshAll() {
		if (!photos.length) { showStart(); return; }
		rebuildView(); $("dr-start").hidden = true; $("dr-fbar").hidden = mod !== "library"; $("dr-tbar").hidden = false; $("dr-film").hidden = false;
		root.querySelectorAll(".dr-mods button").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-mod") === mod ? "true" : "false"); });
		if (mod === "library") { $("dr-grid").hidden = false; $("dr-stage").hidden = true; renderLeftLibrary(); renderGrid(); renderRightLibrary(); renderTbarLibrary(); }
		else { $("dr-grid").hidden = true; $("dr-stage").hidden = false; }
		renderFilm(); crumb();
	}
	function crumb() { var p = curPhoto(); $("dr-crumb").textContent = (rootName ? rootName + " · " : "") + view.length + " of " + photos.length + " photos" + (sel.size > 1 ? " · " + sel.size + " selected" : "") + (p ? " · " + p.name : ""); }

	/* ---------------- library: left ---------------- */
	function sec(id, title, body, extraHead) {
		var s = h("div", "dr-sec" + (prefs.closed[id] ? " dr-closed" : "")); s.setAttribute("data-sec", id);
		var b = h("button", "dr-sech", esc(title) + (extraHead || "") + '<span class="dr-car">▾</span>'); b.type = "button";
		b.onclick = function (e) { if (e.target.closest(".dr-onoff")) return; prefs.closed[id] = !prefs.closed[id]; s.classList.toggle("dr-closed", !!prefs.closed[id]); savePrefs(); if (!prefs.closed[id] && s._onOpen) s._onOpen(); };
		var bd = h("div", "dr-secb"); if (typeof body === "string") bd.innerHTML = body; else if (body) bd.appendChild(body);
		s.appendChild(b); s.appendChild(bd); return s;
	}
	function li(label, count, on, fn, extra) { var b = h("button", "dr-li" + (on ? " dr-on" : ""), label + (count != null ? '<span class="dr-cnt">' + count + "</span>" : "") + (extra || "")); b.type = "button"; b.onclick = fn; return b; }
	function renderLeftLibrary() {
		var L = $("dr-left"); L.innerHTML = "";
		var cat = h("div", "dr-list"), n = function (fn) { return photos.filter(function (p) { return fn(recOf(p) || {}); }).length; };
		var isAll = !filter.folder && !filter.coll && !filter.special;
		cat.appendChild(li("All photographs", photos.length, isAll, function () { filter.folder = ""; filter.coll = null; filter.special = ""; refreshAll(); }));
		cat.appendChild(li("Quick collection ●", quick().filter(function (k) { return byKey[k]; }).length, filter.special === "qc", function () { filter.folder = ""; filter.coll = null; filter.special = "qc"; refreshAll(); }));
		cat.appendChild(li("Picked ⚑", n(function (r) { return r.flag === 1; }), filter.special === "picked", function () { filter.folder = ""; filter.coll = null; filter.special = "picked"; refreshAll(); }));
		cat.appendChild(li("Edited", n(function (r) { return D.isEdited(r.s); }), filter.special === "edited", function () { filter.folder = ""; filter.coll = null; filter.special = "edited"; refreshAll(); }));
		cat.appendChild(li("Rejected ✕", n(function (r) { return r.flag === -1; }), filter.special === "rejected", function () { filter.folder = ""; filter.coll = null; filter.special = "rejected"; refreshAll(); }));
		L.appendChild(sec("cat", "Catalogue", cat));
		var dirs = {}; photos.forEach(function (p) { var parts = p.dir ? p.dir.split("/") : []; for (var i = 0; i <= parts.length; i++) { var d = parts.slice(0, i).join("/"); dirs[d] = (dirs[d] || 0) + (i === parts.length ? 1 : 0); } });
		var dk = Object.keys(dirs).sort(D.natCmp);
		if (dk.length > 1) { var fl = h("div", "dr-list"); dk.forEach(function (d) { var depth = d ? d.split("/").length : 0, tot = photos.filter(function (p) { return d === "" || p.dir === d || p.dir.indexOf(d + "/") === 0; }).length; fl.appendChild(li('<span style="padding-left:' + depth * 0.8 + 'em">📁 ' + esc(d ? d.split("/").pop() : (rootName || "Top folder")) + "</span>", tot, filter.folder === d && !filter.special && !filter.coll && (d !== "" || false), function () { filter.folder = d; filter.coll = null; filter.special = ""; refreshAll(); })); }); L.appendChild(sec("folders", "Folders", fl)); }
		var cl = h("div", "dr-list");
		colls.filter(function (c) { return c.id !== "qc"; }).forEach(function (c) { var b = li("▤ " + esc(c.name), c.keys.filter(function (k) { return byKey[k]; }).length, filter.coll === c.keys, function (e) { if (e.target.closest(".dr-x")) return; filter.folder = ""; filter.special = ""; filter.coll = c.keys; refreshAll(); }, '<button type="button" class="dr-x" title="Delete this collection">✕</button>'); b.querySelector(".dr-x").onclick = async function (e) { e.stopPropagation(); if (await confirmBox("Delete the collection " + c.name + "?", "The photos themselves stay.", "Delete")) { colls = colls.filter(function (x) { return x !== c; }); saveColls(); if (filter.coll === c.keys) filter.coll = null; refreshAll(); } }; cl.appendChild(b); });
		var nb = h("button", "dr-b dr-b--sm", "＋ New collection from selected"); nb.type = "button"; nb.style.marginTop = "0.4em"; nb.onclick = async function () { var name = await promptBox("Name of the new collection", "Collection " + (colls.length), "Create"); if (!name) return; colls.push({ id: "c" + Date.now(), name: name.slice(0, 50), keys: selected().map(function (p) { return p.key; }) }); saveColls(); renderLeftLibrary(); };
		cl.appendChild(nb); L.appendChild(sec("colls", "Collections", cl));
		var kw = {}; photos.forEach(function (p) { ((recOf(p) || {}).kw || []).forEach(function (k) { kw[k] = (kw[k] || 0) + 1; }); });
		var kk = Object.keys(kw).sort(D.natCmp); if (kk.length) { var kl = h("div", "dr-list"); kk.slice(0, 200).forEach(function (k) { kl.appendChild(li("🏷 " + esc(k), kw[k], filter.q === k, function () { filter.q = filter.q === k ? "" : k; $("dr-q").value = filter.q; refreshAll(); })); }); L.appendChild(sec("kw", "Keywords", kl)); }
	}
	function saveColls() { DB.put("kv", colls, "colls"); }

	/* ---------------- library: grid ---------------- */
	function starsHtml(n) { var s = ""; for (var i = 0; i < n; i++) s += "★"; return s; }
	function cellHtml(p) {
		var r = recOf(p) || {}, lab = D.LABELS_C[r.label || 0];
		return '<div class="dr-cimg">' + (p.url ? '<img src="' + p.url + '" alt="" draggable="false">' : p.terr ? '<span class="dr-note">Can\'t preview</span>' : '<div class="dr-cph"></div>') + (p.raw ? '<span class="dr-tag">' + esc(p.ext.toUpperCase()) + "</span>" : "") + (D.isEdited(r.s) ? '<span class="dr-tag dr-tag2" title="Edited">±</span>' : "") + "</div>" +
			'<button type="button" class="dr-qc' + (quick().indexOf(p.key) >= 0 ? " dr-on" : "") + '" title="Quick collection (B)">●</button>' +
			'<div class="dr-cmeta">' + (r.flag === 1 ? '<span class="dr-flag dr-p" title="Picked">⚑</span>' : r.flag === -1 ? '<span class="dr-flag dr-x" title="Rejected">✕</span>' : "") + '<span class="dr-cname" title="' + esc(p.dir ? p.dir + "/" + p.name : p.name) + '">' + esc(p.name) + '</span><span class="dr-stars">' + starsHtml(r.rating || 0) + "</span>" + (lab ? '<span class="dr-lbl" style="background:' + lab.c + '" title="' + lab.name + '"></span>' : "") + "</div>";
	}
	var gridCells = {};
	function renderGrid() {
		var g = $("dr-grid"); g.innerHTML = ""; gridCells = {};
		if (!view.length) { g.innerHTML = '<div class="dr-gempty">No photos match. <button type="button" class="dr-b dr-b--sm" id="dr-clearf">Show all</button></div>'; $("dr-clearf").onclick = clearFilters; return; }
		var frag = document.createDocumentFragment();
		view.forEach(function (p, i) { var c = h("div", "dr-cell" + (sel.has(p.key) ? " dr-sel" : "") + (i === cur ? " dr-cur" : "") + (((recOf(p) || {}).flag === -1) ? " dr-rejected" : ""), cellHtml(p)); c.setAttribute("data-i", i); gridCells[p.key] = c; frag.appendChild(c); });
		g.appendChild(frag); setTimeout(loadVisible, 0);
	}
	function updateCell(p) {
		var c = gridCells[p.key]; if (c) { var i = view.indexOf(p); c.className = "dr-cell" + (sel.has(p.key) ? " dr-sel" : "") + (i === cur ? " dr-cur" : "") + (((recOf(p) || {}).flag === -1) ? " dr-rejected" : ""); c.innerHTML = cellHtml(p); }
		var f = filmCells[p.key]; if (f) f.innerHTML = filmHtml(p);
	}
	function loadVisible() {
		var g = $("dr-grid"); if (g.hidden) return; var top = g.scrollTop - 400, bot = g.scrollTop + g.clientHeight + 800;
		view.forEach(function (p) { if (p.tstate === 2 && p.tsig === tsig(p)) return; var c = gridCells[p.key]; if (!c) return; var y = c.offsetTop; if (y > top && y < bot) wantThumb(p, true); });
		thumbQ.sort(function (a, b) { return (gridCells[a.key] ? gridCells[a.key].offsetTop : 1e9) - (gridCells[b.key] ? gridCells[b.key].offsetTop : 1e9); });
	}
	$("dr-grid").addEventListener("scroll", debounce(loadVisible, 80));
	function clearFilters() { filter = { q: "", minRating: 0, flag: "any", label: 0, edited: "any", kind: "any", folder: "", coll: null, special: "" }; $("dr-q").value = ""; $("dr-frating").value = "0"; $("dr-fflag").value = "any"; $("dr-flabel").value = "0"; $("dr-fedit").value = "any"; refreshAll(); }
	var anchor = -1;
	function clickSelect(i, e) {
		var p = view[i]; if (!p) return;
		if (e.shiftKey && anchor >= 0) { if (!(e.ctrlKey || e.metaKey)) sel.clear(); var a = Math.min(anchor, i), b = Math.max(anchor, i); for (var j = a; j <= b; j++) sel.add(view[j].key); }
		else if (e.ctrlKey || e.metaKey) { if (sel.has(p.key)) sel.delete(p.key); else sel.add(p.key); anchor = i; }
		else { sel.clear(); sel.add(p.key); anchor = i; }
		setCur(i, true);
	}
	function setCur(i, keepSel) {
		var old = curPhoto(); cur = clamp(i, 0, view.length - 1); var p = curPhoto(); if (!p) return;
		if (!keepSel) { sel.clear(); sel.add(p.key); anchor = cur; }
		view.forEach(function (q) { var c = gridCells[q.key]; if (c) { c.classList.toggle("dr-sel", sel.has(q.key)); c.classList.toggle("dr-cur", q === p); } var f = filmCells[q.key]; if (f) { f.classList.toggle("dr-sel", sel.has(q.key)); f.classList.toggle("dr-cur", q === p); } });
		var c = gridCells[p.key]; if (c && mod === "library") scrollIn($("dr-grid"), c);
		var fc = filmCells[p.key]; if (fc) scrollIn($("dr-film"), fc);
		crumb();
		if (mod === "library") { renderRightLibrary(); renderTbarLibrary(); }
		else if (!old || old.key !== p.key) openDevelop(p);
		else renderTbarDevelop();
	}
	$("dr-grid").addEventListener("click", function (e) {
		var qc = e.target.closest(".dr-qc"), c = e.target.closest(".dr-cell"); if (!c) return; var i = +c.getAttribute("data-i");
		if (qc) { toggleQuick([view[i]]); return; }
		/* touch: a tap on the photo that is already picked opens it in Develop (double-tap is hard on phones) */
		if (gridTouch && i === cur && sel.size === 1 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { setMod("develop"); return; }
		clickSelect(i, e);
		if (gridTouch && !(S_tipTap++)) toast("Tap it again to develop it.", 1800);
	});
	var gridTouch = false, S_tipTap = 0;
	$("dr-grid").addEventListener("pointerdown", function (e) { gridTouch = e.pointerType === "touch"; });
	$("dr-grid").addEventListener("dblclick", function (e) { var c = e.target.closest(".dr-cell"); if (!c) return; setCur(+c.getAttribute("data-i")); setMod("develop"); });
	function toggleQuick(list) { var q = colls.find(function (c) { return c.id === "qc"; }); if (!q) { q = { id: "qc", name: "Quick collection", keys: [] }; colls.push(q); } var allIn = list.every(function (p) { return q.keys.indexOf(p.key) >= 0; }); list.forEach(function (p) { var i = q.keys.indexOf(p.key); if (allIn && i >= 0) q.keys.splice(i, 1); else if (!allIn && i < 0) q.keys.push(p.key); updateCell(p); }); saveColls(); toast(allIn ? "Removed from the Quick collection" : "Added to the Quick collection", 1500); if (mod === "library") renderLeftLibrary(); }

	/* ---------------- library: right + toolbar ---------------- */
	function rateUI(n, cls) { var s = '<span class="dr-rate ' + (cls || "") + '" role="group" aria-label="Rating">'; for (var i = 1; i <= 5; i++) s += '<button type="button" data-rate="' + i + '" class="' + (i <= n ? "dr-on" : "") + '" title="' + i + ' star' + (i > 1 ? "s" : "") + ' (' + i + ')">★</button>'; return s + "</span>"; }
	function labelUI(cur0) { var s = ""; for (var i = 1; i <= 5; i++) { var l = D.LABELS_C[i]; s += '<button type="button" class="dr-ib" data-label="' + i + '" title="' + l.name + (i < 5 ? " (" + (i + 5) + ")" : "") + '" aria-pressed="' + (cur0 === i) + '"><span class="dr-swatch" style="background:' + l.c + '"></span></button>'; } return s; }
	function renderTbarLibrary() {
		var p = curPhoto(), r = p ? recOf(p) || {} : {}, t = $("dr-tbar");
		t.innerHTML = '<button type="button" class="dr-ib" data-a="hl" title="Show / hide the left panel">◧</button>' + rateUI(r.rating || 0) + '<button type="button" class="dr-ib" data-flag="1" title="Pick (P)" aria-pressed="' + (r.flag === 1) + '">⚑</button><button type="button" class="dr-ib" data-flag="-1" title="Reject (X)" aria-pressed="' + (r.flag === -1) + '">✕</button>' + labelUI(r.label) +
			'<span class="dr-sp"></span><span class="dr-note">' + (sel.size > 1 ? sel.size + " selected" : "") + '</span><button type="button" class="dr-b dr-b--sm" data-a="selall" title="Ctrl+A">Select all</button><button type="button" class="dr-b dr-b--pri dr-b--sm" data-a="develop" ' + (p ? "" : "disabled") + '>Develop ›</button><button type="button" class="dr-ib" data-a="hf" title="Show / hide the filmstrip">▭</button><button type="button" class="dr-ib" data-a="hr" title="Show / hide the right panel">◨</button>';
	}
	$("dr-tbar").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		var rate = b.getAttribute("data-rate"), fl = b.getAttribute("data-flag"), lab = b.getAttribute("data-label"), a = b.getAttribute("data-a");
		if (rate) { var p = curPhoto(), r0 = p && (recOf(p) || {}).rating; setRating(+rate === r0 ? 0 : +rate); }
		else if (fl) { var p2 = curPhoto(), f0 = p2 && (recOf(p2) || {}).flag; setFlag(+fl === f0 ? 0 : +fl); }
		else if (lab) { var p3 = curPhoto(), l0 = p3 && (recOf(p3) || {}).label; setLabel(+lab === l0 ? 0 : +lab); }
		else if (a === "develop") setMod("develop"); else if (a === "selall") selectAll();
		else if (a === "hl" || a === "hr" || a === "hf") { prefs.hide[a.charAt(1)] = !prefs.hide[a.charAt(1)]; savePrefs(); applyLayout(); requestRender(); }
		else if (dev) devTbarAction(a, b);
	});
	function selectAll() { view.forEach(function (p) { sel.add(p.key); }); refreshSel(); }
	function refreshSel() { view.forEach(function (q) { var c = gridCells[q.key]; if (c) c.classList.toggle("dr-sel", sel.has(q.key)); var f = filmCells[q.key]; if (f) f.classList.toggle("dr-sel", sel.has(q.key)); }); crumb(); if (mod === "library") { renderRightLibrary(); renderTbarLibrary(); } else renderTbarDevelop(); }
	function touchRec(list, fn, label) { list.forEach(function (p) { var r = ensureRec(p); fn(r); r.mt = Date.now(); saveRec(r); updateCell(p); }); if (mod === "library") renderTbarLibrary(); else renderTbarDevelop(); if (label) toast(label + (list.length > 1 ? " · " + list.length + " photos" : ""), 1200); }
	function setRating(n) { touchRec(selected(), function (r) { r.rating = n; }, n ? starsHtml(n) : "No stars"); }
	function setFlag(n) { var list = selected(); touchRec(list, function (r) { r.flag = n; }, n === 1 ? "Picked" : n === -1 ? "Rejected" : "Unflagged"); }
	function setLabel(n) { touchRec(selected(), function (r) { r.label = n; }, n ? D.LABELS_C[n].name + " label" : "No label"); }
	function renderRightLibrary() {
		var R = $("dr-right"), p = curPhoto(), list = selected(); R.innerHTML = ""; if (!p) return;
		var qd = h("div"); var opts = '<option value="">Choose a preset…</option>' + allPresets().filter(function (x) { return x.s; }).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.group + " · " + x.name) + "</option>"; }).join("");
		qd.innerHTML = '<p class="dr-note">' + (list.length > 1 ? "Changes go to all " + list.length + " selected photos." : "Quick changes for this photo.") + '</p>' +
			'<div class="dr-row"><select class="dr-in" id="dr-qpre" style="flex:1">' + opts + '</select></div>' +
			'<div class="dr-row"><select class="dr-in" id="dr-qwb" style="flex:1"><option value="">White balance…</option>' + D.WB_PRESETS.map(function (w) { return '<option value="' + w.id + '">' + w.label + "</option>"; }).join("") + '</select></div>' +
			'<div class="dr-row"><label>Exposure</label> <button type="button" class="dr-b dr-b--sm" data-qe="-1">−1</button><button type="button" class="dr-b dr-b--sm" data-qe="-0.33">−⅓</button><button type="button" class="dr-b dr-b--sm" data-qe="0.33">+⅓</button><button type="button" class="dr-b dr-b--sm" data-qe="1">+1</button></div>' +
			'<div class="dr-row"><button type="button" class="dr-b dr-b--sm" id="dr-qauto">✨ Auto tone</button><button type="button" class="dr-b dr-b--sm" id="dr-qbw">B&amp;W</button><button type="button" class="dr-b dr-b--sm" id="dr-qreset">Reset</button></div>' +
			'<div class="dr-row"><button type="button" class="dr-b dr-b--sm" id="dr-qcopy" title="Ctrl+Shift+C">Copy settings</button><button type="button" class="dr-b dr-b--sm" id="dr-qpaste" title="Ctrl+Shift+V" ' + (clip ? "" : "disabled") + '>Paste settings</button></div>';
		R.appendChild(sec("qdev", "Quick develop", qd));
		qd.querySelector("#dr-qpre").onchange = function () { var ps = presetById(this.value); this.value = ""; if (!ps) return; bulkEdit(list, function (s) { return D.applyPreset(s, ps.s, 100); }, "Preset: " + ps.name); };
		qd.querySelector("#dr-qwb").onchange = function () { var w = D.WB_PRESETS.find(function (x) { return x.id === this.value; }, this); this.value = ""; if (w) bulkEdit(list, function (s) { s.temp = w.temp; s.tint = w.tint; return s; }, "White balance: " + w.label); };
		qd.querySelectorAll("[data-qe]").forEach(function (b) { b.onclick = function () { var d = +b.getAttribute("data-qe"); bulkEdit(list, function (s) { s.exposure = clamp(s.exposure + d, -5, 5); return s; }, "Exposure " + (d > 0 ? "+" : "") + d); }; });
		qd.querySelector("#dr-qauto").onclick = function () { autoMany(list); };
		qd.querySelector("#dr-qbw").onclick = function () { bulkEdit(list, function (s) { s.bw = !s.bw; return s; }, "Black & white"); };
		qd.querySelector("#dr-qreset").onclick = async function () { if (list.length > 1 && !(await confirmBox("Reset " + list.length + " photos?", "Their develop settings go back to the original (you can undo each one in its History).", "Reset"))) return; bulkEdit(list, function () { return D.defaults(); }, "Reset"); };
		qd.querySelector("#dr-qcopy").onclick = function () { copySettings(); }; qd.querySelector("#dr-qpaste").onclick = function () { pasteSettings(list); };
		/* keywords */
		var kwBox = h("div"), common = null; list.forEach(function (q) { var k = (recOf(q) || {}).kw || []; common = common === null ? k.slice() : common.filter(function (x) { return k.indexOf(x) >= 0; }); });
		kwBox.innerHTML = '<div class="dr-kw">' + (common || []).map(function (k) { return '<span>' + esc(k) + '<button type="button" data-kw="' + esc(k) + '" title="Remove">✕</button></span>'; }).join("") + '</div><input type="text" class="dr-in" id="dr-kwin" placeholder="Add keywords, comma separated" style="width:100%">';
		R.appendChild(sec("kwd", "Keywords", kwBox));
		kwBox.querySelector("#dr-kwin").onkeydown = function (e) { if (e.key !== "Enter") return; var add = this.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean); this.value = ""; touchRec(list, function (r) { r.kw = r.kw || []; add.forEach(function (k) { if (r.kw.indexOf(k) < 0) r.kw.push(k); }); }); renderRightLibrary(); renderLeftLibrary(); };
		kwBox.querySelectorAll("[data-kw]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-kw"); touchRec(list, function (r) { r.kw = (r.kw || []).filter(function (x) { return x !== k; }); }); renderRightLibrary(); renderLeftLibrary(); }; });
		/* metadata */
		var r = recOf(p) || {}, md = h("div"), rows = [["File", esc(p.name)], ["Folder", esc(p.dir || rootName || "")], ["Size", fmtBytes(p.size)]];
		if (p.fw || p.ow) rows.push(["Pixels", (p.fw || p.ow) + " × " + (p.fh2 || p.oh)]); if (p.date) rows.push(["Taken", new Date(p.date).toLocaleString()]);
		(p.exif && p.exif.rows || []).filter(function (x) { return !x.sensitive && /^(Camera make|Camera model|Lens model|Lens|ISO|Exposure time|Aperture \(f-number\)|Focal length|Exposure bias|Flash)$/i.test(x.name); }).slice(0, 10).forEach(function (x) { rows.push([esc(x.name), esc(x.value)]); });
		md.innerHTML = '<dl class="dr-meta">' + rows.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + '</dl><div class="dr-subh">Title</div><input type="text" class="dr-in" id="dr-title" style="width:100%" value="' + esc(r.title || "") + '"><div class="dr-subh">Caption</div><textarea class="dr-in" id="dr-cap" rows="2" style="width:100%;resize:vertical">' + esc(r.caption || "") + "</textarea>";
		R.appendChild(sec("meta", "Metadata", md));
		md.querySelector("#dr-title").onchange = function () { var v = this.value; touchRec([p], function (rr) { rr.title = v.slice(0, 200); }); };
		md.querySelector("#dr-cap").onchange = function () { var v = this.value; touchRec([p], function (rr) { rr.caption = v.slice(0, 2000); }); };
		if (!p.exif) readMeta(p).then(function () { if (p.exif && curPhoto() === p && mod === "library") renderRightLibrary(); });
	}
	/* edit settings of many photos without opening them */
	function bulkEdit(list, fn, label) {
		list.forEach(function (p) { var r = ensureRec(p), s = fn(D.clone(D.normalize(r.s))); r.s = D.normalize(s); r.t = Date.now(); r.hist = (r.hist || []).concat([{ l: label, s: JSON.stringify(r.s) }]).slice(-60); saveRec(r); wantThumb(p, true); if (dev && dev.p === p) { dev.s = D.clone(r.s); dev.hist = r.hist.slice(); dev.hpos = dev.hist.length - 1; afterSettings(true); } });
		toast(label + (list.length > 1 ? " · " + list.length + " photos" : ""), 1600);
	}
	async function autoMany(list) {
		for (var i = 0; i < list.length; i++) {
			var p = list[i]; try { var pv = await loadPreview(p, 512), e = workEngine(); e.setImage(pv.img); if (pv.img.close) pv.img.close(); var r = ensureRec(p), s = D.normalize(r.s), n = autoNeutral(s); var px = e.pixels(n, 256); Object.assign(s, D.autoTone(D.histogram(px.data))); r.s = s; r.t = Date.now(); r.hist = (r.hist || []).concat([{ l: "Auto tone", s: JSON.stringify(s) }]).slice(-60); saveRec(r); wantThumb(p, true); if (dev && dev.p === p) { dev.s = D.clone(s); afterSettings(true); } } catch (e2) {}
			if (list.length > 1) toast("Auto tone " + (i + 1) + " of " + list.length + "…", 1500);
		}
		toast("Auto tone done", 1500);
	}
	function autoNeutral(s) { var n = D.clone(s); ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"].forEach(function (k) { n[k] = 0; }); n.curve = D.defaults().curve; return n; }

	/* ---------------- filmstrip ---------------- */
	var filmCells = {};
	function filmHtml(p) { var r = recOf(p) || {}; return (p.url ? '<img src="' + p.url + '" alt="" draggable="false">' : "") + (r.rating ? '<span class="dr-fst">' + starsHtml(r.rating) + "</span>" : ""); }
	function renderFilm() {
		var f = $("dr-film"); f.innerHTML = ""; filmCells = {}; var frag = document.createDocumentFragment();
		view.forEach(function (p, i) { var c = h("div", "dr-fcell" + (sel.has(p.key) ? " dr-sel" : "") + (i === cur ? " dr-cur" : ""), filmHtml(p)); c.setAttribute("data-i", i); c.title = p.name; filmCells[p.key] = c; frag.appendChild(c); });
		f.appendChild(frag); var c0 = filmCells[(curPhoto() || {}).key]; if (c0) scrollIn(f, c0, "center");
		setTimeout(loadFilmVisible, 0);
	}
	function loadFilmVisible() { var f = $("dr-film"), l = f.scrollLeft - 300, r = f.scrollLeft + f.clientWidth + 600; view.forEach(function (p) { var c = filmCells[p.key]; if (c && c.offsetLeft > l && c.offsetLeft < r) wantThumb(p, mod === "develop"); }); }
	$("dr-film").addEventListener("scroll", debounce(loadFilmVisible, 100));
	$("dr-film").addEventListener("click", function (e) { var c = e.target.closest(".dr-fcell"); if (!c) return; clickSelect(+c.getAttribute("data-i"), e); });
	$("dr-film").addEventListener("dblclick", function (e) { if (mod === "library" && e.target.closest(".dr-fcell")) setMod("develop"); });
	$("dr-film").addEventListener("wheel", function (e) { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

	/* ---------------- presets ---------------- */
	function allPresets() { return D.PRESETS.concat(userPresets); }
	function presetById(id) { return allPresets().find(function (p) { return p.id === id; }); }

	/* ================= DEVELOP ================= */
	function setMod(m) {
		if (!photos.length) return; if (m === mod) return;
		if (mod === "develop" && m !== "develop") leaveDevelop();
		mod = m; refreshAll();
		if (m === "develop") { var p = curPhoto(); if (p) openDevelop(p); }
		else { requestAnimationFrame(loadVisible); var c = gridCells[(curPhoto() || {}).key]; if (c) scrollIn($("dr-grid"), c, "center"); }
	}
	function ensureEngine() {
		if (eng) return eng;
		try { eng = new window.DREngine($("dr-cv"), { preserve: true, onLost: function () { toast("The graphics card reset; reload the page if the photo stays black.", 6000); } }); }
		catch (e) { modal('<h3>Your browser can\'t develop photos here</h3><p class="dr-note">' + esc(e.message) + ' MES Darkroom needs WebGL 2 (Chrome, Edge, Brave, Opera, Firefox and Safari 15+ all have it; it may be switched off in your browser\'s settings).</p><div class="dr-acts"><button type="button" class="dr-b dr-b--pri" data-a="ok">OK</button></div>', function (d, close) { d.onclick = function (e2) { if (e2.target.getAttribute("data-a")) close(); }; }); throw e; }
		return eng;
	}
	var loadToken = 0;
	async function openDevelop(p) {
		if (dev && dev.p === p) { renderDevelopPanels(); renderTbarDevelop(); requestRender(); return; }
		if (dev) leaveDevelop(true);
		try { ensureEngine(); } catch (e) { mod = "library"; refreshAll(); return; }
		var r = recOf(p), tok = ++loadToken;
		dev = { p: p, s: D.normalize(r && r.s), hist: (r && r.hist || []).slice(), hpos: 0, tool: null, before: false, split: false, clipShow: false, view: { z: 0, cx: 0, cy: 0 }, ready: false, isRaw: false, maskCv: {}, selMask: null, selSpot: -1, showMask: false, lastPreset: null };
		if (!dev.hist.length) dev.hist.push({ l: "Original", s: JSON.stringify(D.defaults()) }); if (r && r.s && D.isEdited(r.s) && dev.hist[dev.hist.length - 1].s !== JSON.stringify(dev.s)) dev.hist.push({ l: "Settings", s: JSON.stringify(dev.s) });
		dev.hpos = dev.hist.length - 1;
		renderDevelopPanels(); renderTbarDevelop(); renderLeftDevelop(); busy("Loading…");
		try {
			var pv = await loadPreview(p, Math.min(eng.maxTex, 16384)); if (tok !== loadToken) return;
			p.w = pv.w; p.h = pv.h; eng.setImage(pv.img); dev.cpu = cpuCopy(pv.img, pv.w, pv.h); if (pv.img.close) pv.img.close();
			await setMasksFor(eng, dev.s, dev.maskCv); await restoreMaskCanvases();
			dev.ready = true; busy(null); badge(p.raw ? p.ext.toUpperCase() + " · camera preview" : (p.w + " × " + p.h)); requestRender(); scheduleHist(); scheduleLooks();
			if (p.raw && prefs.raw) {
				busy("Decoding RAW… (16-bit)");
				var target = medianLum(eng), rr = ensureRec(p), f = await getFile(p), raw = await decodeRaw(f); if (tok !== loadToken) return;
				if (raw.w > eng.maxTex || raw.h > eng.maxTex) throw new Error("RAW is larger than this graphics card allows");
				eng.setImage(raw); rr.rg = matchRawGain(eng, target); if (rr.t || rr.rating) saveRec(rr); requestRender(); dev.isRaw = true; await setMasksFor(eng, dev.s, dev.maskCv); busy(null); badge(p.ext.toUpperCase() + " · RAW 16-bit · " + raw.w + " × " + raw.h); requestRender(); scheduleHist(); scheduleLooks();
			}
		} catch (e) { if (tok !== loadToken) return; busy(null); if (dev && dev.ready) { badge(p.ext.toUpperCase() + " · camera preview"); toast("RAW decoding failed (" + e.message + "); editing the camera's preview instead.", 6000); } else { badge(null); toast(e.message || "This photo could not be opened.", 6000); } }
	}
	function leaveDevelop(silent) { if (!dev) return; flushThumbForDev(); dev = null; loadToken++; busy(null); badge(null); if (!silent) {} }
	function cpuCopy(img, w, hh) { var k = Math.min(1, 512 / Math.max(w, hh)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k)); var x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height); return x.getImageData(0, 0, c.width, c.height); }
	function busy(t) { $("dr-busy").hidden = !t; if (t) $("dr-busyt").textContent = t; }
	function badge(t) { $("dr-badge").hidden = !t; if (t) $("dr-badge").textContent = t; }
	function tip(t) { $("dr-tip").hidden = !t; if (t) $("dr-tip").textContent = t; }

	/* ---- settings changes ---- */
	function live() { requestRender(); scheduleHist(); }
	function commit(label) {
		if (!dev) return; var js = JSON.stringify(dev.s);
		if (dev.hist[dev.hpos] && dev.hist[dev.hpos].s === js) return;
		dev.hist = dev.hist.slice(0, dev.hpos + 1); dev.hist.push({ l: label, s: js }); if (dev.hist.length > 80) dev.hist.shift(); dev.hpos = dev.hist.length - 1;
		var r = ensureRec(dev.p); r.s = D.normalize(dev.s); r.t = Date.now(); r.hist = dev.hist.slice(-60); saveRec(r);
		dev.p.tstate = 0; scheduleThumb(); renderHistory(); scheduleLooks(); markChanged();
	}
	function afterSettings(skipCommit) { syncControls(); requestRender(); scheduleHist(); renderHistory(); if (!skipCommit) scheduleLooks(); }
	function gotoHist(i) { if (!dev || !dev.hist[i]) return; dev.hpos = i; dev.s = D.normalize(JSON.parse(dev.hist[i].s)); var r = ensureRec(dev.p); r.s = D.clone(dev.s); r.t = Date.now(); saveRec(r); setMasksFor(eng, dev.s, dev.maskCv); afterSettings(); scheduleThumb(); renderDevelopPanels(); }
	function undo() { if (dev && dev.hpos > 0) { gotoHist(dev.hpos - 1); toast("Undo: " + dev.hist[dev.hpos + 1].l, 1000); } }
	function redo() { if (dev && dev.hpos < dev.hist.length - 1) { gotoHist(dev.hpos + 1); toast("Redo: " + dev.hist[dev.hpos].l, 1000); } }
	var thumbT;
	function scheduleThumb() { clearTimeout(thumbT); thumbT = setTimeout(flushThumbForDev, 1200); }
	function flushThumbForDev() {
		clearTimeout(thumbT); if (!dev || !dev.ready || !eng) return; var p = dev.p;
		try { var s = dev.s, g = G.geometry(s, eng.W, eng.H), k = Math.min(1, 360 / Math.max(g.cw, g.ch)), c = eng.renderTo(s, Math.max(1, Math.round(g.cw * k)), Math.max(1, Math.round(g.ch * k))); requestRender();
			c.toBlob(function (b) { if (!b) return; var sig = tsig(p); DB.put("thumb", { blob: b, sig: sig, date: p.date, w: p.w, h: p.h }, p.key + "|" + p.mtime); setThumb(p, b, sig); p.tstate = 2; updateCell(p); }, "image/webp", 0.82); } catch (e) {}
	}
	function markChanged() { var p = dev && dev.p; if (p) updateCell(p); }

	/* ---- rendering ---- */
	var rq = false;
	function requestRender() { if (rq) return; rq = true; requestAnimationFrame(function () { rq = false; draw(); }); }
	function dispSettings() { var s = dev.hover || dev.s; if (dev.tool === "crop") { s = D.clone(s); s.crop = { x: 0, y: 0, w: 1, h: 1 }; s.angle = 0; s.vig = 0; } return s; }
	function stageSize() { var st = $("dr-stage"); return [st.clientWidth, st.clientHeight]; }
	function viewInfo(s) {
		var g = G.geometry(s, eng.W, eng.H), sz = stageSize(), m = dev.tool === "crop" ? 36 : 14, fit = Math.min((sz[0] - 2 * m) / g.cw, (sz[1] - 2 * m) / g.ch);
		var z = dev.view.z || fit, cx = dev.view.z ? dev.view.cx : g.cw / 2, cy = dev.view.z ? dev.view.cy : g.ch / 2;
		return { g: g, fit: fit, z: z, cx: cx, cy: cy, W: sz[0], H: sz[1] };
	}
	function outToScreen(v, x, y) { return [(x - v.cx) * v.z + v.W / 2, (y - v.cy) * v.z + v.H / 2]; }
	function screenToOut(v, x, y) { return [(x - v.W / 2) / v.z + v.cx, (y - v.H / 2) / v.z + v.cy]; }
	function srcToScreen(v, u, w) { var o = G.apply(G.inv(v.g.ori), u, w), q = G.apply(G.inv(v.g.crop), o[0], o[1]); return outToScreen(v, q[0], q[1]); }
	function screenToSrc(v, x, y) { var q = screenToOut(v, x, y); return v.g.inv(q[0], q[1]); }
	var VI = null;
	function draw() {
		if (!dev || !dev.ready || mod !== "develop" || !eng) return;
		var cv = $("dr-cv"), dpr = Math.min(window.devicePixelRatio || 1, 2), sz = stageSize(); if (!sz[0] || !sz[1]) return;
		var W = Math.round(sz[0] * dpr), H = Math.round(sz[1] * dpr); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
		var s = dispSettings(), v = viewInfo(s); VI = v;
		/* target device px -> output px */
		var map = G.mul(G.T(v.cx, v.cy), G.mul(G.Sc(1 / (v.z * dpr), 1 / (v.z * dpr)), G.T(-W / 2, -H / 2)));
		var gl = eng.gl, bg = [0.043, 0.043, 0.047, 1];
		eng.draw(s, { outW: W, outH: H, map: map }, { before: dev.before, clip: dev.clipShow, showMask: dev.showMask && dev.selMask ? maskIndex(dev.selMask) : 0, bg: bg });
		if (dev.split && !dev.before) { gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, Math.round(W / 2), H); eng.draw(s, { outW: W, outH: H, map: map }, { before: true, bg: bg }); gl.disable(gl.SCISSOR_TEST); }
		drawOverlay(v, dpr); stageLock();
		var zl = root.querySelector(".dr-zoomv"); if (zl) zl.textContent = Math.round(v.z * dpr * 100) + "%";
	}
	function maskIndex(id) { var on = dev.s.locals.filter(function (l) { return l.on; }); var i = on.findIndex(function (l) { return l.id === id; }); return i + 1; }

	/* ---- histogram ---- */
	var histT;
	function scheduleHist() { clearTimeout(histT); histT = setTimeout(drawHist, 90); }
	function drawHist() {
		if (!dev || !dev.ready) return; var c = $("dr-hist"); if (!c) return;
		var px = eng.pixels(dev.s, 320), hs = D.histogram(px.data); requestRender(); dev.lastHist = hs;
		var dpr = Math.min(window.devicePixelRatio || 1, 2), W = c.clientWidth * dpr, H = c.clientHeight * dpr; c.width = W; c.height = H; var x = c.getContext("2d"); x.clearRect(0, 0, W, H);
		var mx = 1; for (var i = 2; i < 254; i++) mx = Math.max(mx, hs.r[i], hs.g[i], hs.b[i]);
		x.globalCompositeOperation = "lighter";
		[["r", "rgba(230,70,70,0.75)"], ["g", "rgba(70,200,90,0.7)"], ["b", "rgba(80,130,255,0.75)"]].forEach(function (ch) { x.fillStyle = ch[1]; x.beginPath(); x.moveTo(0, H); for (var i = 0; i < 256; i++) x.lineTo(i / 255 * W, H - Math.min(1, Math.sqrt(hs[ch[0]][i] / mx)) * H * 0.95); x.lineTo(W, H); x.fill(); });
		x.globalCompositeOperation = "source-over";
		if (hs.clipHi > 0.0005) { x.fillStyle = "#ff5a5a"; x.fillRect(W - 8 * dpr, 2 * dpr, 6 * dpr, 6 * dpr); } if (hs.clipLo > 0.0005) { x.fillStyle = "#5a8cff"; x.fillRect(2 * dpr, 2 * dpr, 6 * dpr, 6 * dpr); }
		var info = $("dr-histinfo"); if (info) { var e = dev.p.exif && dev.p.exif.raw, f = function (re) { if (!dev.p.exif) return ""; var r0 = dev.p.exif.rows.find(function (r) { return re.test(r.name); }); return r0 ? r0.value : ""; }; info.innerHTML = "<span>" + esc(f(/ISO/i)) + "</span><span>" + esc(f(/Focal length$/i) || f(/Focal/i)) + "</span><span>" + esc(f(/F-number|Aperture/i)) + "</span><span>" + esc(f(/Exposure time|Shutter/i)) + "</span>"; }
	}

	/* ---- looks (live preset previews for Simple and the Presets panel) ---- */
	var looksT;
	function scheduleLooks() { clearTimeout(looksT); looksT = setTimeout(drawLooks, 350); }
	function drawLooks() {
		if (!dev || !dev.ready) return; var boxes = root.querySelectorAll("canvas[data-look]"); if (!boxes.length) return;
		/* a few previews per frame (each one waits for the graphics card), on-screen ones first, so a phone never locks up */
		var base = dev.s, gen = ++looksGen, list = Array.prototype.slice.call(boxes), vh = window.innerHeight;
		function onScreen(c) { var r = c.getBoundingClientRect(); return r.bottom > -50 && r.top < vh + 50 && r.width > 0; }
		list.sort(function (a, b) { return (onScreen(b) ? 1 : 0) - (onScreen(a) ? 1 : 0); });
		(function next() {
			if (gen !== looksGen || !dev || !dev.ready) return; var t0 = performance.now();
			while (list.length && performance.now() - t0 < 12) { var c = list.shift(); if (c.isConnected) oneLook(c, base); }
			if (list.length) setTimeout(next, 16); else requestRender();
		})();
	}
	var looksGen = 0;
	function oneLook(c, base) {
		var id = c.getAttribute("data-look"), ps = presetById(id), s = id === "none" ? D.defaults() : id === "auto" ? autoSettings(base) : ps ? D.applyPreset(base, ps.s, 100) : base;
		s = D.clone(s); s.crop = base.crop; s.angle = base.angle; s.rot90 = base.rot90; s.flipH = base.flipH; s.flipV = base.flipV;
		var px = eng.pixels(s, 140); c.width = px.w; c.height = px.h; var x = c.getContext("2d"), id2 = x.createImageData(px.w, px.h);
		for (var y = 0; y < px.h; y++) id2.data.set(px.data.subarray((px.h - 1 - y) * px.w * 4, (px.h - y) * px.w * 4), y * px.w * 4);
		x.putImageData(id2, 0, 0);
	}
	function autoSettings(s) { var n = autoNeutral(s), px = eng.pixels(n, 256), out = D.clone(s); Object.assign(out, D.autoTone(D.histogram(px.data))); return out; }

	/* ---- develop panels ---- */
	var BASIC = [["temp", "Temp", -100, 100, 1, "wbt"], ["tint", "Tint", -100, 100, 1, "wbg"], ["#Tone"], ["exposure", "Exposure", -5, 5, 0.01], ["contrast", "Contrast", -100, 100, 1], ["highlights", "Highlights", -100, 100, 1], ["shadows", "Shadows", -100, 100, 1], ["whites", "Whites", -100, 100, 1], ["blacks", "Blacks", -100, 100, 1], ["#Presence"], ["texture", "Texture", -100, 100, 1], ["clarity", "Clarity", -100, 100, 1], ["dehaze", "Dehaze", -100, 100, 1], ["vibrance", "Vibrance", -100, 100, 1], ["saturation", "Saturation", -100, 100, 1]];
	var SIMPLE = [["#Light"], ["exposure", "Brightness", -3, 3, 0.01], ["contrast", "Contrast", -100, 100, 1], ["highlights", "Highlights", -100, 100, 1], ["shadows", "Shadows", -100, 100, 1], ["#Colour"], ["temp", "Warmth", -100, 100, 1, "wbt"], ["tint", "Tint", -100, 100, 1, "wbg"], ["vibrance", "Vibrance", -100, 100, 1], ["saturation", "Saturation", -100, 100, 1], ["#Detail"], ["clarity", "Clarity", -100, 100, 1], ["sharpen", "Sharpen", 0, 150, 1], ["nr", "Smooth noise", 0, 100, 1], ["#Effects"], ["vig", "Vignette", -100, 100, 1], ["grain", "Grain", 0, 100, 1]];
	var DETAIL = [["#Sharpening"], ["sharpen", "Amount", 0, 150, 1], ["sRadius", "Radius", 0.5, 3, 0.1], ["sMask", "Masking", 0, 100, 1], ["#Noise reduction"], ["nr", "Luminance", 0, 100, 1], ["nrColor", "Colour", 0, 100, 1]];
	var LENS = [["dist", "Distortion", -100, 100, 1], ["lensVig", "Vignetting", -100, 100, 1], ["ca", "Colour fringes", -100, 100, 1]];
	var TRANSFORM = [["keyV", "Vertical", -100, 100, 1], ["keyH", "Horizontal", -100, 100, 1], ["angle", "Straighten", -45, 45, 0.1]];
	var FX = [["#Post-crop vignette"], ["vig", "Amount", -100, 100, 1], ["vigMid", "Midpoint", 0, 100, 1], ["vigRound", "Roundness", -100, 100, 1], ["vigFeather", "Feather", 0, 100, 1], ["#Grain"], ["grain", "Amount", 0, 100, 1], ["grainSize", "Size", 0, 100, 1], ["grainRough", "Roughness", 0, 100, 1]];
	var DEF = D.defaults();
	function grad(kind) { if (kind === "wbt") return "linear-gradient(90deg,#4a7bff,#c9c9c9,#ffc23a)"; if (kind === "wbg") return "linear-gradient(90deg,#36c45a,#c9c9c9,#e05ad8)"; return ""; }
	function sliderRow(spec, get, set, onCommit, extraCls) {
		var k = spec[0], row = h("div", "dr-sl" + (extraCls ? " " + extraCls : "")); row.setAttribute("data-k", k);
		row.innerHTML = '<label title="Double-click to reset">' + esc(spec[1]) + '</label><input type="range" min="' + spec[2] + '" max="' + spec[3] + '" step="' + spec[4] + '" aria-label="' + esc(spec[1]) + '"' + (spec[5] ? ' class="dr-gwb" style="background:' + grad(spec[5]) + '"' : "") + '><input type="text" class="dr-v" inputmode="decimal" aria-label="' + esc(spec[1]) + ' value">';
		var r = row.querySelector("input[type=range]"), v = row.querySelector(".dr-v");
		function show() { var val = get(); r.value = val; v.value = D.fmtVal(k, val); row.classList.toggle("dr-chg", Math.abs(val - (spec[6] != null ? spec[6] : (typeof DEF[k] === "number" ? DEF[k] : 0))) > 1e-9); }
		row._show = show; show();
		r.addEventListener("input", function () { set(+r.value); v.value = D.fmtVal(k, +r.value); row.classList.add("dr-chg"); });
		r.addEventListener("change", function () { onCommit(spec[1] + " " + D.fmtVal(k, +r.value)); show(); });
		v.addEventListener("change", function () { var n = parseFloat(String(v.value).replace(",", ".").replace("°", "")); if (!isFinite(n)) { show(); return; } n = clamp(n, spec[2], spec[3]); set(n); onCommit(spec[1] + " " + D.fmtVal(k, n)); show(); });
		v.addEventListener("keydown", function (e) { if (e.key === "Enter") v.blur(); if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); var st = +spec[4] * (e.shiftKey ? 10 : 1), n = clamp(get() + (e.key === "ArrowUp" ? st : -st), spec[2], spec[3]); set(n); show(); onCommit(spec[1] + " " + D.fmtVal(k, n)); } });
		row.querySelector("label").addEventListener("dblclick", function () { var d0 = spec[6] != null ? spec[6] : (typeof DEF[k] === "number" ? DEF[k] : 0); set(d0); show(); onCommit(spec[1] + " reset"); });
		return row;
	}
	function sliders(list, box) {
		list.forEach(function (sp) {
			if (sp[0].charAt(0) === "#") { box.appendChild(h("div", "dr-subh", esc(sp[0].slice(1)))); return; }
			box.appendChild(sliderRow(sp, function () { return dev.s[sp[0]]; }, function (v) { dev.s[sp[0]] = v; dev.lastPreset = null; live(); }, function (l) { commit(l); }));
		});
	}
	function syncControls() { root.querySelectorAll("#dr-right .dr-sl").forEach(function (r) { if (r._show) r._show(); }); var c = $("dr-curvecv"); if (c && c._draw) c._draw(); root.querySelectorAll(".dr-wheel canvas").forEach(function (w) { if (w._draw) w._draw(); }); renderTbarDevelop(); var bw = $("dr-bwtog"); if (bw) bw.setAttribute("aria-pressed", dev.s.bw ? "true" : "false"); }
	function renderDevelopPanels() {
		var R = $("dr-right"); R.innerHTML = ""; if (!dev) return;
		var hs = h("div", "dr-sec"); hs.innerHTML = '<div class="dr-secb" style="padding-top:0.6em"><canvas class="dr-hist" id="dr-hist" title="Histogram (J shows clipping)"></canvas><div class="dr-histinfo" id="dr-histinfo"></div></div>'; R.appendChild(hs);
		var tools = h("div", "dr-tools"), T = [["crop", "⛶", "Crop", "R"], ["heal", "✚", "Heal", "Q"], ["mask", "◐", "Masks", "M"], ["wb", "⌖", "WB pick", "W"], ["auto", "✨", "Auto", "Shift+A"]];
		tools.innerHTML = T.map(function (t) { return '<button type="button" data-tool="' + t[0] + '" title="' + t[2] + " (" + t[3] + ')" aria-pressed="' + (dev.tool === t[0]) + '"><b>' + t[1] + "</b>" + t[2] + "</button>"; }).join("");
		tools.onclick = function (e) { var b = e.target.closest("[data-tool]"); if (!b) return; var t = b.getAttribute("data-tool"); if (t === "auto") doAuto(); else setTool(dev.tool === t ? null : t); };
		R.appendChild(tools);
		if (dev.tool) { var tb = h("div", "dr-sec"); tb.appendChild(h("div", "dr-secb")); toolPanel(tb.firstChild); R.appendChild(tb); }
		if (prefs.lv === "simple") { renderSimple(R); } else { renderPro(R); }
		var fb = h("div", "dr-secb"); fb.style.padding = "0.7em";
		fb.innerHTML = '<div class="dr-row"><button type="button" class="dr-b dr-b--sm" id="dr-pcopy" title="Ctrl+Shift+C">Copy settings</button><button type="button" class="dr-b dr-b--sm" id="dr-ppaste" ' + (clip ? "" : "disabled") + ' title="Ctrl+Shift+V">Paste</button><button type="button" class="dr-b dr-b--sm" id="dr-preset" title="Reset every adjustment">Reset all</button></div><div class="dr-row"><button type="button" class="dr-b dr-b--sm" id="dr-toeditor">🎨 Edit in Photo Editor</button><button type="button" class="dr-b dr-b--sm" id="dr-savepre">＋ Save as preset</button></div>';
		R.appendChild(fb);
		fb.querySelector("#dr-pcopy").onclick = copySettings; fb.querySelector("#dr-ppaste").onclick = function () { pasteSettings(selected()); };
		fb.querySelector("#dr-preset").onclick = function () { dev.s = D.defaults(); setMasksFor(eng, dev.s, dev.maskCv); afterSettings(); commit("Reset all"); renderDevelopPanels(); };
		fb.querySelector("#dr-toeditor").onclick = toPhotoEditor; fb.querySelector("#dr-savepre").onclick = savePresetDlg;
		scheduleHist(); scheduleLooks();
	}
	function renderSimple(R) {
		var lk = h("div", "dr-looks"), ids = ["none", "auto"].concat(D.PRESETS.filter(function (p) { return p.s; }).map(function (p) { return p.id; })).concat(userPresets.map(function (p) { return p.id; }));
		ids.forEach(function (id) { var ps = presetById(id), b = h("button", "dr-look", '<canvas data-look="' + esc(id) + '"></canvas>' + esc(id === "none" ? "Original" : id === "auto" ? "Auto" : ps.name)); b.type = "button"; b.onclick = function () { applyLook(id); }; lk.appendChild(b); });
		var amt = h("div"); amt.appendChild(sliderRow(["amt", "Look strength", 0, 100, 1, null, 100], function () { return dev.lastPreset ? dev.lastPreset.amt : 100; }, function (v) { if (!dev.lastPreset) return; dev.lastPreset.amt = v; dev.s = D.applyPreset(dev.lastPreset.base, dev.lastPreset.ps, v); live(); }, function (l) { if (dev.lastPreset) commit("Look strength " + Math.round(dev.lastPreset.amt)); syncControls(); }));
		var box = h("div"); box.appendChild(lk); box.appendChild(amt);
		R.appendChild(sec("looks", "Looks", box));
		var b2 = h("div"), bw = h("div", "dr-row"); bw.innerHTML = '<button type="button" class="dr-b dr-b--sm" id="dr-bwtog" aria-pressed="' + dev.s.bw + '">◑ Black &amp; white</button><button type="button" class="dr-b dr-b--sm" id="dr-awb">⌖ Auto white balance</button>';
		var sm = h("div", "dr-row"); sm.innerHTML = '<button type="button" class="dr-b dr-b--sm" data-ai="subject">👤 Brighten subject</button><button type="button" class="dr-b dr-b--sm" data-ai="sky">☁ Deeper sky</button><button type="button" class="dr-b dr-b--sm" data-ai="background">▦ Darken background</button>'; b2.appendChild(sm); sm.querySelectorAll("[data-ai]").forEach(function (x) { x.onclick = function () { smartMask(x.getAttribute("data-ai")); }; });
		b2.appendChild(bw); sliders(SIMPLE, b2); R.appendChild(sec("simple", "Adjust", b2));
		bw.querySelector("#dr-bwtog").onclick = function () { dev.s.bw = !dev.s.bw; afterSettings(true); commit(dev.s.bw ? "Black & white" : "Colour"); };
		bw.querySelector("#dr-awb").onclick = autoWB;
	}
	function applyLook(id) {
		var base = D.clone(dev.s);
		if (id === "none") { var keep = { crop: base.crop, angle: base.angle, rot90: base.rot90, flipH: base.flipH, flipV: base.flipV, spots: base.spots }; dev.s = Object.assign(D.defaults(), keep); dev.lastPreset = null; }
		else if (id === "auto") { dev.s = autoSettings(base); dev.lastPreset = null; }
		else { var ps = presetById(id); if (!ps) return; dev.s = D.applyPreset(base, ps.s, 100); dev.lastPreset = { base: base, ps: ps.s, amt: 100, name: ps.name }; }
		setMasksFor(eng, dev.s, dev.maskCv); afterSettings(true); commit(id === "none" ? "Original" : id === "auto" ? "Auto" : "Preset: " + presetById(id).name);
	}
	function renderPro(R) {
		var b = h("div"), top = h("div", "dr-row");
		top.innerHTML = '<label>Treatment</label><span class="dr-seg"><button type="button" data-bw="0" aria-pressed="' + !dev.s.bw + '">Colour</button><button type="button" data-bw="1" aria-pressed="' + dev.s.bw + '">B&amp;W</button></span><select class="dr-in" id="dr-wbsel" title="White balance"><option value="">WB…</option><option value="auto">Auto</option>' + D.WB_PRESETS.map(function (w) { return '<option value="' + w.id + '">' + w.label + "</option>"; }).join("") + '</select>';
		b.appendChild(top);
		top.querySelectorAll("[data-bw]").forEach(function (x) { x.onclick = function () { dev.s.bw = x.getAttribute("data-bw") === "1"; afterSettings(true); commit(dev.s.bw ? "Black & white" : "Colour"); renderDevelopPanels(); }; });
		top.querySelector("#dr-wbsel").onchange = function () { var v = this.value; this.value = ""; if (v === "auto") return autoWB(); var w = D.WB_PRESETS.find(function (x) { return x.id === v; }); if (w) { dev.s.temp = w.temp; dev.s.tint = w.tint; afterSettings(true); commit("White balance: " + w.label); } };
		sliders(BASIC, b);
		var ab = h("div", "dr-row"); ab.innerHTML = '<button type="button" class="dr-b dr-b--sm" id="dr-autob">✨ Auto</button><button type="button" class="dr-b dr-b--sm" id="dr-resetb">Reset basic</button>'; b.appendChild(ab);
		ab.querySelector("#dr-autob").onclick = doAuto; ab.querySelector("#dr-resetb").onclick = function () { BASIC.forEach(function (sp) { if (sp[0].charAt(0) !== "#") dev.s[sp[0]] = 0; }); afterSettings(true); commit("Reset basic"); };
		R.appendChild(sec("basic", "Basic", b));
		R.appendChild(sec("curve", "Tone curve", curvePanel()));
		R.appendChild(sec("hsl", dev.s.bw ? "B&W mix" : "Colour mixer", hslPanel()));
		R.appendChild(sec("grade", "Colour grading", gradePanel()));
		var d = h("div"); sliders(DETAIL, d); R.appendChild(sec("detail", "Detail", d));
		var l = h("div"); sliders(LENS, l); l.appendChild(h("p", "dr-note", "Distortion fixes barrel (+) or pincushion (−) lines; Vignetting brightens dark corners from the lens.")); R.appendChild(sec("lens", "Lens corrections", l));
		var t = h("div"); sliders(TRANSFORM, t); var tr = h("div", "dr-row"); tr.innerHTML = '<button type="button" class="dr-b dr-b--sm" data-rot="1" title="Rotate left">↺ Left</button><button type="button" class="dr-b dr-b--sm" data-rot="3" title="Rotate right">↻ Right</button><button type="button" class="dr-b dr-b--sm" data-flip="h">⇋ Flip</button><button type="button" class="dr-b dr-b--sm" data-flip="v">⇵ Flip</button>'; t.appendChild(tr); bindRotate(tr); R.appendChild(sec("transform", "Transform", t));
		var fx = h("div"); sliders(FX, fx); R.appendChild(sec("fx", "Effects", fx));
	}
	function bindRotate(box) { box.querySelectorAll("[data-rot]").forEach(function (b) { b.onclick = function () { rotate(+b.getAttribute("data-rot")); }; }); box.querySelectorAll("[data-flip]").forEach(function (b) { b.onclick = function () { var f = b.getAttribute("data-flip"); if (f === "h") dev.s.flipH = !dev.s.flipH; else dev.s.flipV = !dev.s.flipV; afterSettings(true); commit("Flip"); }; }); }
	function rotate(k) { var c = dev.s.crop; dev.s.rot90 = (dev.s.rot90 + k) % 4; dev.s.crop = k === 1 ? { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w } : { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w }; dev.view.z = 0; afterSettings(true); commit(k === 1 ? "Rotate left" : "Rotate right"); }
	function doAuto() { if (!dev || !dev.ready) return; dev.s = autoSettings(dev.s); afterSettings(true); commit("Auto tone"); }
	function autoWB() { if (!dev || !dev.ready) return; var n = D.clone(dev.s); n.temp = 0; n.tint = 0; var hs = D.histogram(eng.pixels(autoNeutral(n), 256).data), w = D.autoWB(hs); dev.s.temp = w.temp; dev.s.tint = w.tint; afterSettings(true); commit("Auto white balance"); }

	/* ---- tone curve editor ---- */
	var curveCh = "rgb";
	function curvePanel() {
		var b = h("div"); b.innerHTML = '<div class="dr-tabs" role="group">' + [["rgb", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]].map(function (c) { return '<button type="button" data-ch="' + c[0] + '" aria-pressed="' + (curveCh === c[0]) + '">' + c[1] + "</button>"; }).join("") + '</div><canvas class="dr-curve" id="dr-curvecv"></canvas><div class="dr-row"><select class="dr-in" id="dr-curvepre"><option value="">Curve preset…</option><option value="lin">Linear</option><option value="med">Medium contrast</option><option value="strong">Strong contrast</option><option value="matte">Matte (lifted blacks)</option><option value="soft">Soft (lower contrast)</option></select><button type="button" class="dr-b dr-b--sm" id="dr-curvereset">Reset</button></div><p class="dr-note">Click to add a point, drag to move, drag off the box or double-click to remove.</p>';
		var cv = b.querySelector("canvas"), drag = -1;
		b.querySelectorAll("[data-ch]").forEach(function (x) { x.onclick = function () { curveCh = x.getAttribute("data-ch"); b.querySelectorAll("[data-ch]").forEach(function (y) { y.setAttribute("aria-pressed", y === x ? "true" : "false"); }); draw2(); }; });
		var PRE = { lin: [[0, 0], [1, 1]], med: [[0, 0], [0.25, 0.21], [0.75, 0.79], [1, 1]], strong: [[0, 0], [0.25, 0.17], [0.75, 0.84], [1, 1]], matte: [[0, 0.1], [0.3, 0.3], [0.8, 0.82], [1, 0.97]], soft: [[0, 0.04], [0.25, 0.28], [0.75, 0.73], [1, 0.96]] };
		b.querySelector("#dr-curvepre").onchange = function () { var v = this.value; this.value = ""; if (!PRE[v]) return; dev.s.curve[curveCh] = D.clone(PRE[v]); draw2(); live(); commit("Tone curve"); };
		b.querySelector("#dr-curvereset").onclick = function () { dev.s.curve[curveCh] = [[0, 0], [1, 1]]; draw2(); live(); commit("Tone curve reset"); };
		function pts() { return dev.s.curve[curveCh]; }
		function draw2() {
			var dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth * dpr || 240, H = W; cv.width = W; cv.height = H; var x = cv.getContext("2d"); x.clearRect(0, 0, W, H);
			if (dev.lastHist) { var hl = dev.lastHist.l, mx = 1; for (var i = 2; i < 254; i++) mx = Math.max(mx, hl[i]); x.fillStyle = "rgba(255,255,255,0.08)"; x.beginPath(); x.moveTo(0, H); for (i = 0; i < 256; i++) x.lineTo(i / 255 * W, H - Math.sqrt(hl[i] / mx) * H * 0.9); x.lineTo(W, H); x.fill(); }
			x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 1; for (i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * W / 4, 0); x.lineTo(i * W / 4, H); x.moveTo(0, i * H / 4); x.lineTo(W, i * H / 4); x.stroke(); }
			x.beginPath(); x.moveTo(0, H); x.lineTo(W, 0); x.strokeStyle = "rgba(255,255,255,0.18)"; x.stroke();
			var col = { rgb: "#e6e6ea", r: "#ff6b6b", g: "#57c785", b: "#5b8cff" }[curveCh], f = D.curveFn(pts());
			x.strokeStyle = col; x.lineWidth = 2 * dpr; x.beginPath(); for (i = 0; i <= 128; i++) { var u = i / 128, y = f(u); if (i) x.lineTo(u * W, H - y * H); else x.moveTo(0, H - y * H); } x.stroke();
			pts().forEach(function (p, j) { x.fillStyle = j === drag ? col : "#121214"; x.strokeStyle = col; x.lineWidth = 1.5 * dpr; x.beginPath(); x.arc(p[0] * W, H - p[1] * H, 4.5 * dpr, 0, 7); x.fill(); x.stroke(); });
		}
		cv._draw = draw2;
		function pos(e) { var r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1), (e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; }
		cv.addEventListener("pointerdown", function (e) {
			var p = pos(e), P = pts(), best = -1, bd = 0.05; P.forEach(function (q, i) { var d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
			if (best < 0) { P.push([p[0], p[1]]); P.sort(function (a, b) { return a[0] - b[0]; }); best = P.findIndex(function (q) { return q[0] === p[0] && q[1] === p[1]; }); }
			drag = best; cap(cv, e); draw2(); live();
		});
		cv.addEventListener("pointermove", function (e) {
			if (drag < 0) return; var p = pos(e), P = pts(), out = p[2] < -0.08 || p[2] > 1.08 || p[3] < -0.08 || p[3] > 1.08;
			var lo = drag > 0 ? P[drag - 1][0] + 0.01 : 0, hi = drag < P.length - 1 ? P[drag + 1][0] - 0.01 : 1;
			if (drag === 0 && P.length > 1) hi = Math.min(hi, P[1][0] - 0.01); P[drag] = [drag === 0 && P.length > 1 && P[0][0] === 0 && false ? 0 : clamp(p[0], lo, hi), p[1]]; P[drag]._out = out;
			draw2(); live();
		});
		function end() { if (drag < 0) return; var P = pts(); if (P[drag] && P[drag]._out && P.length > 2) P.splice(drag, 1); else if (P[drag]) delete P[drag]._out; dev.s.curve[curveCh] = P.map(function (q) { return [q[0], q[1]]; }); drag = -1; draw2(); live(); commit("Tone curve"); }
		cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
		cv.addEventListener("dblclick", function (e) { var p = pos(e), P = pts(); var i = P.findIndex(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05; }); if (i >= 0 && P.length > 2) { P.splice(i, 1); draw2(); live(); commit("Tone curve"); } });
		setTimeout(draw2, 0); b._onOpen = draw2;
		return b;
	}

	/* ---- colour mixer ---- */
	var hslTab = "hue";
	var BAND_HUE = [0, 30, 60, 120, 180, 240, 280, 320];
	function hslPanel() {
		var b = h("div");
		function build() {
			b.innerHTML = "";
			if (dev.s.bw) { b.appendChild(h("p", "dr-note", "How bright each colour becomes in black and white.")); D.BAND_LABEL.forEach(function (lb, i) { b.appendChild(sliderRow(["mix" + i, lb, -100, 100, 1, null, 0], function () { return dev.s.mix[i]; }, function (v) { dev.s.mix[i] = v; live(); }, function (l) { commit("B&W " + l); }, "")); setGrad(b.lastChild, "linear-gradient(90deg,#111,hsl(" + BAND_HUE[i] + ",70%,50%),#eee)"); }); return; }
			var tabs = h("div", "dr-tabs"); tabs.innerHTML = [["hue", "Hue"], ["sat", "Saturation"], ["lum", "Luminance"], ["all", "All"]].map(function (t) { return '<button type="button" data-t="' + t[0] + '" aria-pressed="' + (hslTab === t[0]) + '">' + t[1] + "</button>"; }).join("");
			tabs.onclick = function (e) { var x = e.target.closest("[data-t]"); if (x) { hslTab = x.getAttribute("data-t"); build(); } }; b.appendChild(tabs);
			(hslTab === "all" ? ["hue", "sat", "lum"] : [hslTab]).forEach(function (key) {
				if (hslTab === "all") b.appendChild(h("div", "dr-subh", { hue: "Hue", sat: "Saturation", lum: "Luminance" }[key]));
				D.BAND_LABEL.forEach(function (lb, i) {
					var row = sliderRow([key + i, lb, -100, 100, 1, null, 0], function () { return dev.s[key][i]; }, function (v) { dev.s[key][i] = v; live(); }, function (l) { commit({ hue: "Hue", sat: "Saturation", lum: "Luminance" }[key] + " " + l); });
					var hh = BAND_HUE[i]; setGrad(row, key === "hue" ? "linear-gradient(90deg,hsl(" + (hh - 30) + ",75%,52%),hsl(" + hh + ",75%,52%),hsl(" + (hh + 30) + ",75%,52%))" : key === "sat" ? "linear-gradient(90deg,#888,hsl(" + hh + ",90%,50%))" : "linear-gradient(90deg,hsl(" + hh + ",60%,15%),hsl(" + hh + ",70%,50%),hsl(" + hh + ",80%,88%))");
					b.appendChild(row);
				});
			});
		}
		build(); return b;
	}
	function setGrad(row, g) { var r = row.querySelector("input[type=range]"); r.classList.add("dr-gwb"); r.style.background = g; }

	/* ---- colour grading wheels ---- */
	function gradePanel() {
		var b = h("div"), w = h("div", "dr-wheels");
		[["sh", "Shadows"], ["mid", "Midtones"], ["hi", "Highlights"], ["glob", "Global"]].forEach(function (z) { var box = h("div", "dr-wheel" + (z[0] === "glob" ? " dr-wbig" : "")); box.innerHTML = '<canvas></canvas><span>' + z[1] + '</span><input type="range" min="-100" max="100" step="1" title="Luminance" aria-label="' + z[1] + ' luminance">'; w.appendChild(box); wheel(box, z[0], z[1]); });
		b.appendChild(w);
		sliders([["#Mix"]], b);
		b.appendChild(sliderRow(["blend", "Blending", 0, 100, 1, null, 50], function () { return dev.s.grade.blend; }, function (v) { dev.s.grade.blend = v; live(); }, function (l) { commit("Grading " + l); }));
		b.appendChild(sliderRow(["balance", "Balance", -100, 100, 1, null, 0], function () { return dev.s.grade.balance; }, function (v) { dev.s.grade.balance = v; live(); }, function (l) { commit("Grading " + l); }));
		var rb = h("button", "dr-b dr-b--sm", "Reset grading"); rb.type = "button"; rb.onclick = function () { dev.s.grade = D.defaults().grade; afterSettings(true); commit("Reset grading"); }; b.appendChild(rb);
		return b;
	}
	function wheel(box, key, name) {
		var cv = box.querySelector("canvas"), sl = box.querySelector("input"), drag = false;
		function g() { return dev.s.grade[key]; }
		function drawW() {
			var dpr = Math.min(window.devicePixelRatio || 1, 2), W = (cv.clientWidth || 80) * dpr; cv.width = W; cv.height = W; var x = cv.getContext("2d"), r = W / 2 - 3 * dpr;
			for (var a = 0; a < 360; a += 3) { x.beginPath(); x.moveTo(W / 2, W / 2); x.arc(W / 2, W / 2, r, (a - 1.5 - 90) * Math.PI / 180, (a + 2 - 90) * Math.PI / 180); var gr = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, r); gr.addColorStop(0, "hsl(0,0%,32%)"); gr.addColorStop(1, "hsl(" + a + ",70%,50%)"); x.fillStyle = gr; x.fill(); }
			var v = g(), ang = (v[0] - 90) * Math.PI / 180, rr = v[1] / 100 * r; x.strokeStyle = "#fff"; x.lineWidth = 2 * dpr; x.beginPath(); x.arc(W / 2 + Math.cos(ang) * rr, W / 2 + Math.sin(ang) * rr, 5 * dpr, 0, 7); x.stroke();
			sl.value = v[2]; box.title = name + ": hue " + Math.round(v[0]) + "°, saturation " + Math.round(v[1]) + ", luminance " + Math.round(v[2]) + " (double-click resets)";
		}
		cv._draw = drawW; setTimeout(drawW, 0);
		function setFrom(e) { var r = cv.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, R0 = r.width / 2 - 3, sat = clamp(Math.hypot(dx, dy) / R0 * 100, 0, 100), hue = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360; if (e.shiftKey) sat = g()[1]; dev.s.grade[key] = [hue, sat, g()[2]]; drawW(); live(); }
		cv.addEventListener("pointerdown", function (e) { drag = true; cap(cv, e); setFrom(e); });
		cv.addEventListener("pointermove", function (e) { if (drag) setFrom(e); });
		cv.addEventListener("pointerup", function () { if (drag) { drag = false; commit(name + " colour"); } });
		cv.addEventListener("dblclick", function () { dev.s.grade[key] = [0, 0, 0]; drawW(); live(); commit(name + " reset"); });
		sl.addEventListener("input", function () { dev.s.grade[key][2] = +sl.value; live(); }); sl.addEventListener("change", function () { commit(name + " luminance"); });
	}

	/* ---- left panel in develop ---- */
	function renderLeftDevelop() {
		var L = $("dr-left"); L.innerHTML = ""; if (!dev) return;
		var pl = h("div"), groups = {}; allPresets().filter(function (p) { return p.s; }).forEach(function (p) { (groups[p.group] = groups[p.group] || []).push(p); });
		var amt = h("div"); amt.appendChild(sliderRow(["amt", "Amount", 0, 100, 1, null, 100], function () { return dev.lastPreset ? dev.lastPreset.amt : 100; }, function (v) { if (!dev.lastPreset) return; dev.lastPreset.amt = v; dev.s = D.applyPreset(dev.lastPreset.base, dev.lastPreset.ps, v); live(); }, function () { if (dev.lastPreset) { commit("Preset amount " + Math.round(dev.lastPreset.amt)); syncControls(); } }));
		pl.appendChild(amt); pl.appendChild(h("p", "dr-note", "Hover a preset to preview it on the photo; click to apply."));
		Object.keys(groups).forEach(function (gname) {
			pl.appendChild(h("div", "dr-subh", esc(gname))); var lst = h("div", "dr-list");
			groups[gname].forEach(function (p) {
				var b = li(esc(p.name), null, false, function (e) { if (e.target.closest(".dr-x")) return; dev.hover = null; var base = D.clone(dev.s); dev.s = D.applyPreset(base, p.s, 100); dev.lastPreset = { base: base, ps: p.s, amt: 100, name: p.name }; setMasksFor(eng, dev.s, dev.maskCv); afterSettings(true); commit("Preset: " + p.name); renderLeftDevelop(); }, p.user ? '<button type="button" class="dr-x" title="Delete this preset">✕</button>' : "");
				b.onmouseenter = function () { if (!dev || !dev.ready) return; dev.hover = D.applyPreset(dev.s, p.s, 100); requestRender(); };
				b.onmouseleave = function () { if (dev) { dev.hover = null; requestRender(); } };
				var x = b.querySelector(".dr-x"); if (x) x.onclick = async function (e) { e.stopPropagation(); if (await confirmBox("Delete the preset " + p.name + "?", "Photos already edited with it stay as they are.", "Delete")) { userPresets = userPresets.filter(function (q) { return q !== p; }); DB.put("kv", userPresets, "presets"); renderLeftDevelop(); } };
				lst.appendChild(b);
			});
			pl.appendChild(lst);
		});
		L.appendChild(sec("presets", "Presets", pl));
		var snaps = h("div"); var r = ensureRec(dev.p);
		var sb = h("button", "dr-b dr-b--sm", "＋ Snapshot of this look"); sb.type = "button"; sb.onclick = async function () { var name = await promptBox("Name the snapshot", new Date().toLocaleString(), "Save"); if (!name) return; r.snaps = (r.snaps || []).concat([{ n: name.slice(0, 60), s: D.clone(dev.s) }]); r.t = r.t || Date.now(); saveRec(r); renderLeftDevelop(); };
		snaps.appendChild(sb); var sl = h("div", "dr-list"); sl.style.marginTop = "0.4em";
		(r.snaps || []).forEach(function (sn, i) { var b = li("📷 " + esc(sn.n), null, false, function (e) { if (e.target.closest(".dr-x")) return; dev.s = D.normalize(sn.s); setMasksFor(eng, dev.s, dev.maskCv); afterSettings(true); commit("Snapshot: " + sn.n); renderDevelopPanels(); }, '<button type="button" class="dr-x" title="Delete">✕</button>'); b.querySelector(".dr-x").onclick = function (e) { e.stopPropagation(); r.snaps.splice(i, 1); saveRec(r); renderLeftDevelop(); }; b.onmouseenter = function () { dev.hover = D.normalize(sn.s); requestRender(); }; b.onmouseleave = function () { dev.hover = null; requestRender(); }; sl.appendChild(b); });
		snaps.appendChild(sl); L.appendChild(sec("snaps", "Snapshots", snaps));
		var hb = h("div", "dr-list"); hb.id = "dr-hlist"; L.appendChild(sec("history", "History", hb)); renderHistory();
	}
	function renderHistory() {
		var hb = $("dr-hlist"); if (!hb || !dev) return; hb.innerHTML = "";
		for (var i = dev.hist.length - 1; i >= 0; i--) { (function (i) { var b = li(esc(dev.hist[i].l), null, i === dev.hpos, function () { gotoHist(i); }); if (i > dev.hpos) b.classList.add("dr-future"); hb.appendChild(b); })(i); }
		var cl = h("button", "dr-b dr-b--sm", "Clear history"); cl.type = "button"; cl.style.marginTop = "0.4em"; cl.onclick = function () { dev.hist = [{ l: "Settings", s: JSON.stringify(dev.s) }]; dev.hpos = 0; var r = ensureRec(dev.p); r.hist = dev.hist.slice(); saveRec(r); renderHistory(); }; hb.appendChild(cl);
	}

	/* ---- develop toolbar ---- */
	function renderTbarDevelop() {
		if (!dev || mod !== "develop") return; var r = recOf(dev.p) || {}, multi = selected().length > 1, t = $("dr-tbar");
		t.innerHTML = '<button type="button" class="dr-ib" data-a="hl" title="Show / hide the left panel">◧</button><button type="button" class="dr-ib" data-a="prev" title="Previous (←)">‹</button><button type="button" class="dr-ib" data-a="next" title="Next (→)">›</button>' +
			'<button type="button" class="dr-ib" data-a="before" title="Before / after (\\)" aria-pressed="' + dev.before + '">◑</button><button type="button" class="dr-ib" data-a="split" title="Side by side: before | after (Y)" aria-pressed="' + dev.split + '">◫</button><button type="button" class="dr-ib" data-a="clip" title="Show clipping (J)" aria-pressed="' + dev.clipShow + '">⚠</button>' +
			'<button type="button" class="dr-b dr-b--sm" data-a="fit" title="Fit (Z)">Fit</button><button type="button" class="dr-b dr-b--sm" data-a="z100" title="100% (Z)">1:1</button><span class="dr-zoomv"></span>' +
			'<span class="dr-sp"></span>' + rateUI(r.rating || 0) + '<button type="button" class="dr-ib" data-flag="1" title="Pick (P)" aria-pressed="' + (r.flag === 1) + '">⚑</button><button type="button" class="dr-ib" data-flag="-1" title="Reject (X)" aria-pressed="' + (r.flag === -1) + '">✕</button>' + labelUI(r.label) +
			'<button type="button" class="dr-ib" data-a="undo" title="Undo (Ctrl+Z)"' + (dev.hpos > 0 ? "" : " disabled") + '>↶</button><button type="button" class="dr-ib" data-a="redo" title="Redo (Ctrl+Shift+Z)"' + (dev.hpos < dev.hist.length - 1 ? "" : " disabled") + '>↷</button>' +
			(multi ? '<button type="button" class="dr-b dr-b--sm dr-b--pri" data-a="sync" title="Copy this photo\'s settings to the other selected photos">Sync ' + selected().length + '…</button>' : "") +
			'<button type="button" class="dr-ib" data-a="hf" title="Show / hide the filmstrip">▭</button><button type="button" class="dr-ib" data-a="hr" title="Show / hide the right panel">◨</button>';
		requestRender();
	}
	function devTbarAction(a) {
		if (a === "prev") step(-1); else if (a === "next") step(1);
		else if (a === "before") { dev.before = !dev.before; dev.split = false; renderTbarDevelop(); }
		else if (a === "split") { dev.split = !dev.split; dev.before = false; renderTbarDevelop(); }
		else if (a === "clip") { dev.clipShow = !dev.clipShow; renderTbarDevelop(); }
		else if (a === "fit") { dev.view.z = 0; requestRender(); } else if (a === "z100") zoomTo(1 / dprv());
		else if (a === "undo") undo(); else if (a === "redo") redo(); else if (a === "sync") syncDlg();
	}
	function step(d) { if (!view.length) return; var i = clamp(cur + d, 0, view.length - 1); if (i !== cur) setCur(i); }
	function dprv() { return Math.min(window.devicePixelRatio || 1, 2); }
	function zoomTo(z, sx, sy) {
		if (!VI) return; var v = VI; z = clamp(z, 0.02, 16); if (sx == null) { sx = v.W / 2; sy = v.H / 2; }
		var o = screenToOut(v, sx, sy); dev.view = { z: z, cx: o[0] - (sx - v.W / 2) / z, cy: o[1] - (sy - v.H / 2) / z }; requestRender();
	}

	/* ---- tools: crop / heal / masks / WB picker ---- */
	function setTool(t) {
		if (!dev) return; if (dev.tool === "crop" && t !== "crop") commitCrop();
		dev.tool = t; dev.view.z = 0; dev.selSpot = -1;
		if (t === "mask" && !dev.selMask && dev.s.locals.length) dev.selMask = dev.s.locals[0].id;
		tip(t === "crop" ? "Drag the corners or edges to crop, drag inside to move, drag outside the box to straighten. Enter = done." : t === "heal" ? "Click a spot to remove it. Drag the white circle or its source. Delete removes the selected spot." : t === "wb" ? "Click something that should be neutral grey or white." : t === "mask" ? "Pick New: linear, radial or brush, then drag or paint on the photo." : null);
		renderDevelopPanels(); requestRender();
	}
	function toolPanel(box) {
		if (dev.tool === "crop") {
			var ow = D.orientedSize(eng.W, eng.H, dev.s.rot90);
			box.innerHTML = '<div class="dr-subh">Crop &amp; straighten</div><div class="dr-row"><label>Aspect</label><select class="dr-in" id="dr-asp">' + D.ASPECTS.map(function (a) { return '<option value="' + a[0] + '"' + (dev.s.aspect === a[0] ? " selected" : "") + ">" + a[1] + "</option>"; }).join("") + '</select><button type="button" class="dr-b dr-b--sm" id="dr-aspflip" title="Swap width and height">⇄</button></div>';
			sliders([["angle", "Straighten", -45, 45, 0.1]], box);
			var r = h("div", "dr-row"); r.innerHTML = '<button type="button" class="dr-b dr-b--sm" data-rot="1">↺</button><button type="button" class="dr-b dr-b--sm" data-rot="3">↻</button><button type="button" class="dr-b dr-b--sm" data-flip="h">⇋</button><button type="button" class="dr-b dr-b--sm" id="dr-cropreset">Reset crop</button><button type="button" class="dr-b dr-b--pri dr-b--sm" id="dr-cropdone">Done</button>'; box.appendChild(r); bindRotate(r);
			box.querySelector("#dr-asp").onchange = function () { dev.s.aspect = this.value; var a = D.aspectValue(this.value, ow[0] / ow[1]); dev.s.crop = D.fitCropAspect(dev.s.crop, ow[0], ow[1], a); constrainCrop(); requestRender(); commit("Crop aspect " + this.value); };
			box.querySelector("#dr-aspflip").onclick = function () { var a = dev.s.aspect, m = /^([\d.]+):([\d.]+)$/.exec(a); if (!m) return; dev.s.aspect = m[2] + ":" + m[1]; if (!D.ASPECTS.some(function (x) { return x[0] === dev.s.aspect; })) dev.s.aspect = a; var av = +m[2] / +m[1]; dev.s.crop = D.fitCropAspect(dev.s.crop, ow[0], ow[1], av); constrainCrop(); renderDevelopPanels(); commit("Crop aspect"); };
			box.querySelector("#dr-cropreset").onclick = function () { dev.s.crop = { x: 0, y: 0, w: 1, h: 1 }; dev.s.angle = 0; dev.s.aspect = "free"; syncControls(); requestRender(); commit("Reset crop"); };
			box.querySelector("#dr-cropdone").onclick = function () { setTool(null); };
		} else if (dev.tool === "heal") {
			box.innerHTML = '<div class="dr-subh">Healing</div><div class="dr-row"><span class="dr-seg"><button type="button" data-hm="1" aria-pressed="' + prefs.healHeal + '">Heal</button><button type="button" data-hm="0" aria-pressed="' + !prefs.healHeal + '">Clone</button></span></div>';
			box.appendChild(sliderRow(["hr", "Size", 0.5, 20, 0.1, null, 3], function () { var sp = dev.s.spots[dev.selSpot]; return Math.round((sp ? sp.r : prefs.healR) * 1000) / 10; }, function (v) { prefs.healR = v / 100; var sp = dev.s.spots[dev.selSpot]; if (sp) sp.r = v / 100; savePrefs(); live(); }, function () { commit("Spot size"); }));
			box.appendChild(sliderRow(["hf", "Feather", 0, 100, 1, null, 50], function () { var sp = dev.s.spots[dev.selSpot]; return sp ? sp.f : 50; }, function (v) { var sp = dev.s.spots[dev.selSpot]; if (sp) { sp.f = v; live(); } }, function () { commit("Spot feather"); }));
			var r2 = h("div", "dr-row"); r2.innerHTML = '<button type="button" class="dr-b dr-b--sm" id="dr-spdel"' + (dev.selSpot >= 0 ? "" : " disabled") + '>Remove spot</button><button type="button" class="dr-b dr-b--sm" id="dr-spclear"' + (dev.s.spots.length ? "" : " disabled") + '>Clear all (' + dev.s.spots.length + ')</button><button type="button" class="dr-b dr-b--pri dr-b--sm" id="dr-healdone">Done</button>'; box.appendChild(r2);
			box.querySelectorAll("[data-hm]").forEach(function (b) { b.onclick = function () { prefs.healHeal = b.getAttribute("data-hm") === "1"; savePrefs(); var sp = dev.s.spots[dev.selSpot]; if (sp) { sp.heal = prefs.healHeal; live(); commit("Spot mode"); } renderDevelopPanels(); }; });
			box.querySelector("#dr-spdel").onclick = function () { if (dev.selSpot >= 0) { dev.s.spots.splice(dev.selSpot, 1); dev.selSpot = -1; live(); commit("Remove spot"); renderDevelopPanels(); } };
			box.querySelector("#dr-spclear").onclick = function () { dev.s.spots = []; dev.selSpot = -1; live(); commit("Clear spots"); renderDevelopPanels(); };
			box.querySelector("#dr-healdone").onclick = function () { setTool(null); };
		} else if (dev.tool === "mask") maskPanel(box);
		else if (dev.tool === "wb") { box.innerHTML = '<div class="dr-subh">White balance picker</div><p class="dr-note">Click something in the photo that should be neutral (a white wall, grey road, clouds). Esc cancels.</p>'; }
	}
	var newMask = null; /* "linear" | "radial" | "brush": waiting for the first drag */
	function maskPanel(box) {
		var on = dev.s.locals;
		box.innerHTML = '<div class="dr-subh">Masks</div><div class="dr-row"><button type="button" class="dr-b dr-b--sm" data-nm="linear" aria-pressed="' + (newMask === "linear") + '">▤ Linear</button><button type="button" class="dr-b dr-b--sm" data-nm="radial">◯ Radial</button><button type="button" class="dr-b dr-b--sm" data-nm="brush">🖌 Brush</button></div><div class="dr-row"><button type="button" class="dr-b dr-b--sm" data-ai="subject" title="Finds the main subject with an AI model that runs on this computer">👤 Subject</button><button type="button" class="dr-b dr-b--sm" data-ai="sky" title="Finds the sky (no download)">☁ Sky</button><button type="button" class="dr-b dr-b--sm" data-ai="background" title="Everything except the subject">▦ Background</button></div>';
		var lst = h("div", "dr-list dr-masks");
		on.forEach(function (l, i) { var b = li('<input type="checkbox" ' + (l.on ? "checked" : "") + ' title="On / off" data-mon> ' + esc(l.name || ({ linear: "Linear", radial: "Radial", brush: "Brush" }[l.type] + " " + (i + 1))), null, dev.selMask === l.id, function (e) { if (e.target.matches("[data-mon]")) { l.on = e.target.checked; live(); commit("Mask on / off"); return; } if (e.target.closest(".dr-x")) return; dev.selMask = l.id; renderDevelopPanels(); requestRender(); }, '<button type="button" class="dr-x" title="Delete mask">✕</button>'); b.querySelector(".dr-x").onclick = function (e) { e.stopPropagation(); dev.s.locals.splice(i, 1); delete dev.maskCv[l.id]; if (dev.selMask === l.id) dev.selMask = dev.s.locals[0] ? dev.s.locals[0].id : null; setMasksFor(eng, dev.s, dev.maskCv); live(); commit("Delete mask"); renderDevelopPanels(); }; lst.appendChild(b); });
		box.appendChild(lst);
		box.querySelectorAll("[data-ai]").forEach(function (b) { b.onclick = function () { smartMask(b.getAttribute("data-ai")); }; });
		box.querySelectorAll("[data-nm]").forEach(function (b) { b.onclick = function () { var t = b.getAttribute("data-nm"); if (dev.s.locals.length >= 8) { toast("Up to 8 masks per photo.", 2500); return; } if (t === "brush" && dev.s.locals.filter(function (x) { return x.type === "brush"; }).length >= 8) return; if (t === "brush") { var l = D.cleanLocal({ type: "brush" }); l.adj.exp = 0.5; dev.s.locals.push(l); dev.selMask = l.id; newMask = null; makeMaskCanvas(l); setMasksFor(eng, dev.s, dev.maskCv); commit("New brush mask"); tip("Paint where the change should go. Alt (Option) + drag erases."); } else { newMask = t; tip(t === "linear" ? "Drag from where the change is full to where it fades out." : "Drag from the centre outwards."); } renderDevelopPanels(); }; });
		var L = on.find(function (x) { return x.id === dev.selMask; });
		if (L) {
			var ad = h("div"); ad.appendChild(h("div", "dr-subh", "Adjust inside the mask"));
			[["exp", "Exposure", -4, 4, 0.01], ["con", "Contrast", -100, 100, 1], ["hi", "Highlights", -100, 100, 1], ["sh", "Shadows", -100, 100, 1], ["cla", "Clarity", -100, 100, 1], ["dh", "Dehaze", -100, 100, 1], ["temp", "Temp", -100, 100, 1, "wbt"], ["tint", "Tint", -100, 100, 1, "wbg"], ["sat", "Saturation", -100, 100, 1]].forEach(function (sp) { ad.appendChild(sliderRow([sp[0] === "exp" ? "exposure" : "m" + sp[0], sp[1], sp[2], sp[3], sp[4], sp[5], 0], function () { return L.adj[sp[0]]; }, function (v) { L.adj[sp[0]] = v; live(); }, function (l) { commit("Mask " + l); })); });
			var r3 = h("div", "dr-row"); r3.innerHTML = '<label><input type="checkbox" id="dr-minv" ' + (L.inv ? "checked" : "") + '> Invert</label><label><input type="checkbox" id="dr-mshow" ' + (dev.showMask ? "checked" : "") + '> Show mask (O)</label>'; ad.appendChild(r3);
			if (L.type === "radial") ad.appendChild(sliderRow(["feather", "Feather", 0, 100, 1, null, 50], function () { return L.feather; }, function (v) { L.feather = v; live(); }, function () { commit("Mask feather"); }));
			if (L.type === "brush") { ad.appendChild(h("div", "dr-subh", "Brush")); ad.appendChild(sliderRow(["bs", "Size", 1, 40, 0.5, null, 8], function () { return prefs.brush.size * 100; }, function (v) { prefs.brush.size = v / 100; savePrefs(); requestRender(); }, function () {})); ad.appendChild(sliderRow(["bf", "Feather", 0, 100, 1, null, 60], function () { return prefs.brush.feather; }, function (v) { prefs.brush.feather = v; savePrefs(); }, function () {})); ad.appendChild(sliderRow(["bfl", "Flow", 5, 100, 1, null, 60], function () { return prefs.brush.flow; }, function (v) { prefs.brush.flow = v; savePrefs(); }, function () {})); var er = h("div", "dr-row"); er.innerHTML = '<label><input type="checkbox" id="dr-berase" ' + (dev.erase ? "checked" : "") + '> Erase (or hold Alt)</label><button type="button" class="dr-b dr-b--sm" id="dr-bclear">Clear paint</button>'; ad.appendChild(er); er.querySelector("#dr-berase").onchange = function () { dev.erase = this.checked; }; er.querySelector("#dr-bclear").onclick = function () { var cv = dev.maskCv[L.id]; if (cv) cv.getContext("2d").clearRect(0, 0, cv.width, cv.height); L.mask = ""; setMasksFor(eng, dev.s, dev.maskCv); live(); commit("Clear brush"); }; }
			box.appendChild(ad);
			ad.querySelector("#dr-minv").onchange = function () { L.inv = this.checked; live(); commit("Invert mask"); };
			ad.querySelector("#dr-mshow").onchange = function () { dev.showMask = this.checked; requestRender(); };
		} else if (!on.length) box.appendChild(h("p", "dr-note", "Masks change only part of the photo: a linear gradient for skies, a radial one to light a face, or a brush for anything else."));
		var dn = h("button", "dr-b dr-b--pri dr-b--sm", "Done"); dn.type = "button"; dn.style.marginTop = "0.5em"; dn.onclick = function () { setTool(null); }; box.appendChild(dn);
	}
	/* ---- smart masks: subject (AI), background, sky ---- */
	function sourcePixels(maxSide) { var px = eng.pixels(D.defaults(), maxSide, { before: true }), w = px.w, hh = px.h, out = new Uint8ClampedArray(w * hh * 4); for (var y = 0; y < hh; y++) out.set(px.data.subarray((hh - 1 - y) * w * 4, (hh - y) * w * 4), y * w * 4); requestRender(); return { w: w, h: hh, data: out }; }
	function alphaCanvas(a, w, hh, inv) { var c = document.createElement("canvas"); c.width = w; c.height = hh; var x = c.getContext("2d"), id = x.createImageData(w, hh), d = id.data; for (var i = 0; i < a.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = Math.round(255 * (inv ? 1 - a[i] : a[i])); } x.putImageData(id, 0, 0); return c; }
	var SMART = { subject: { name: "Subject", adj: { exp: 0.35, cla: 8, sat: 6 } }, background: { name: "Background", adj: { exp: -0.45, sat: -10 } }, sky: { name: "Sky", adj: { exp: -0.5, dh: 15, sat: 10, hi: -20 } } };
	var smartBusy = false;
	async function smartMask(kind) {
		if (!dev || !dev.ready || smartBusy) return; if (dev.s.locals.length >= 8) { toast("Up to 8 masks per photo: delete one first.", 3000); return; }
		var d0 = dev, info = SMART[kind], a, w, hh; smartBusy = true;
		try {
			if (kind === "sky") { busy("Finding the sky…"); await new Promise(function (r) { setTimeout(r, 30); }); var sp = sourcePixels(480), r = D.skyMask(sp.data, sp.w, sp.h); if (r.cover < 0.02) { toast("No sky found in this photo. Paint one with the Brush, or try a Linear mask.", 4500); return; } a = r.a; w = sp.w; hh = sp.h; }
			else {
				if (!window.DRAI) throw new Error("the AI part did not load");
				if (!d0.subj) { busy("Getting ready…"); var src = sourcePixels(1024), c = document.createElement("canvas"); c.width = src.w; c.height = src.h; c.getContext("2d").putImageData(new ImageData(src.data, src.w, src.h), 0, 0); var res = await window.DRAI.subject(c, function (t) { if (dev === d0) busy(t); }); d0.subj = { a: D.normMask(res.d), w: res.w, h: res.h }; }
				a = d0.subj.a; w = d0.subj.w; hh = d0.subj.h;
			}
			if (dev !== d0) return;
			var l = D.cleanLocal({ type: "brush", name: info.name }); Object.assign(l.adj, info.adj);
			var cv = makeMaskCanvas(l), x = cv.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(alphaCanvas(a, w, hh, kind === "background"), 0, 0, cv.width, cv.height);
			var wu = cv.toDataURL("image/webp", 0.9); l.mask = /^data:image\/webp/.test(wu) ? wu : cv.toDataURL("image/png");
			dev.s.locals.push(l); dev.selMask = l.id; newMask = null; await setMasksFor(eng, dev.s, dev.maskCv); live(); commit(info.name + " mask");
			if (dev.tool !== "mask") setTool("mask"); else renderDevelopPanels();
			toast(info.name + " mask added: move its sliders, or touch it up with the brush (Alt erases).", 3500);
		} catch (e) { toast("Could not make the " + info.name.toLowerCase() + " mask: " + (e && e.message || e), 5000); }
		finally { smartBusy = false; busy(null); }
	}
	function makeMaskCanvas(l) { var k = 1024 / Math.max(eng.W, eng.H), c = document.createElement("canvas"); c.width = Math.max(8, Math.round(eng.W * k)); c.height = Math.max(8, Math.round(eng.H * k)); dev.maskCv[l.id] = c; return c; }
	async function restoreMaskCanvases() { for (var i = 0; i < dev.s.locals.length; i++) { var l = dev.s.locals[i]; if (l.type !== "brush" || dev.maskCv[l.id]) continue; var c = makeMaskCanvas(l); if (l.mask) { var im = await loadImg(l.mask); if (im) c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); } } }
	function constrainCrop() {
		var ow = D.orientedSize(eng.W, eng.H, dev.s.rot90), OW = ow[0], OH = ow[1], c = dev.s.crop, cx = (c.x + c.w / 2) * OW, cy = (c.y + c.h / 2) * OH, w = c.w * OW, hh = c.h * OH, a = dev.s.angle * Math.PI / 180;
		function inside(w2, h2, x0, y0) { var co = Math.cos(a), si = Math.sin(a); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(function (q) { var x = x0 + (q[0] * w2 / 2) * co - (q[1] * h2 / 2) * si, y = y0 + (q[0] * w2 / 2) * si + (q[1] * h2 / 2) * co; return x >= -0.5 && y >= -0.5 && x <= OW + 0.5 && y <= OH + 0.5; }); }
		cx = clamp(cx, 0, OW); cy = clamp(cy, 0, OH);
		if (!inside(w, hh, cx, cy)) {
			/* first try moving it back inside, then shrink */
			var lo = 0, hi = 1; for (var i = 0; i < 24; i++) { var m = (lo + hi) / 2; if (inside(w * m, hh * m, cx, cy)) lo = m; else hi = m; }
			var tx = OW / 2, ty = OH / 2, best = null; for (var t = 0; t <= 1.0001; t += 0.05) { var x2 = cx + (tx - cx) * t, y2 = cy + (ty - cy) * t; if (inside(w, hh, x2, y2)) { best = [x2, y2]; break; } }
			if (best) { cx = best[0]; cy = best[1]; } else { w *= lo; hh *= lo; }
		}
		dev.s.crop = { x: cx / OW - w / OW / 2, y: cy / OH - hh / OH / 2, w: clamp(w / OW, 0.01, 1), h: clamp(hh / OH, 0.01, 1) };
	}
	function commitCrop() { constrainCrop(); commit("Crop"); }
	function autoSpotSource(u, v, r) {
		var d = dev.cpu; if (!d) return [u + r * 2.2, v];
		var W = d.width, H = d.height, k = Math.max(W, H), R = Math.max(2, Math.round(r * k)), cx = u * W, cy = v * H, best = null, be = 1e18;
		function samp(x, y) { x = clamp(Math.round(x), 0, W - 1); y = clamp(Math.round(y), 0, H - 1); var i = (y * W + x) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2]]; }
		/* compare the ring around the spot with the ring around each candidate */
		var ring = []; for (var a = 0; a < 16; a++) { var t = a / 16 * Math.PI * 2; ring.push([Math.cos(t) * R * 1.3, Math.sin(t) * R * 1.3]); }
		var ref = ring.map(function (o) { return samp(cx + o[0], cy + o[1]); });
		for (var dist = 2.2; dist <= 4.6; dist += 1.2) for (var a2 = 0; a2 < 12; a2++) {
			var t2 = a2 / 12 * Math.PI * 2, sx = cx + Math.cos(t2) * R * dist, sy = cy + Math.sin(t2) * R * dist; if (sx < R || sy < R || sx > W - R || sy > H - R) continue;
			var e = 0; ring.forEach(function (o, i) { var p = samp(sx + o[0], sy + o[1]), q = ref[i]; e += (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]); });
			var inner = 0; for (var j = 0; j < 9; j++) { var o2 = [(j % 3 - 1) * R * 0.5, (Math.floor(j / 3) - 1) * R * 0.5], p2 = samp(sx + o2[0], sy + o2[1]), q2 = samp(sx, sy); inner += Math.abs(p2[0] - q2[0]) + Math.abs(p2[1] - q2[1]); }
			e += inner * 40 + dist * 2000; if (e < be) { be = e; best = [sx / W, sy / H]; }
		}
		return best || [u + r * 2.2, v];
	}

	/* ---- overlay ---- */
	function drawOverlay(v, dpr) {
		var ov = $("dr-ov"), W = Math.round(v.W * dpr), H = Math.round(v.H * dpr); if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
		var x = ov.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, v.W, v.H);
		if (dev.split && !dev.before) { x.strokeStyle = "rgba(255,255,255,0.8)"; x.lineWidth = 1; x.beginPath(); x.moveTo(v.W / 2, 0); x.lineTo(v.W / 2, v.H); x.stroke(); x.fillStyle = "rgba(0,0,0,0.55)"; x.font = "12px system-ui,sans-serif"; x.fillRect(v.W / 2 - 64, 8, 56, 20); x.fillRect(v.W / 2 + 8, 8, 48, 20); x.fillStyle = "#fff"; x.fillText("Before", v.W / 2 - 56, 22); x.fillText("After", v.W / 2 + 16, 22); }
		if (dev.before) { x.fillStyle = "rgba(0,0,0,0.55)"; x.fillRect(v.W - 74, v.H - 30, 66, 22); x.fillStyle = "#fff"; x.font = "12px system-ui,sans-serif"; x.fillText("Before", v.W - 64, v.H - 15); }
		if (dev.tool === "crop") drawCropOverlay(x, v);
		else if (dev.tool === "heal") dev.s.spots.forEach(function (sp, i) { var a = srcToScreen(v, sp.x, sp.y), b = srcToScreen(v, sp.sx, sp.sy), r = sp.r * Math.max(eng.W, eng.H) * v.z * (v.g.cw / (v.g.cw)), sel = i === dev.selSpot; r = spotRadiusScreen(v, sp.r); x.lineWidth = sel ? 2 : 1.3; x.strokeStyle = sel ? "#fff" : "rgba(255,255,255,0.75)"; x.beginPath(); x.arc(a[0], a[1], r, 0, 7); x.stroke(); x.setLineDash([4, 3]); x.beginPath(); x.arc(b[0], b[1], r, 0, 7); x.stroke(); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.setLineDash([]); });
		else if (dev.tool === "mask") drawMaskOverlay(x, v);
		if (dev.tool === "mask" && dev.brushAt) { var L = curMask(); if (L && L.type === "brush") { x.strokeStyle = "#fff"; x.lineWidth = 1; var rr = prefs.brush.size * Math.max(eng.W, eng.H) * screenScale(v); x.beginPath(); x.arc(dev.brushAt[0], dev.brushAt[1], rr, 0, 7); x.stroke(); x.strokeStyle = "rgba(255,255,255,0.4)"; x.beginPath(); x.arc(dev.brushAt[0], dev.brushAt[1], rr * (1 - prefs.brush.feather / 100 * 0.9), 0, 7); x.stroke(); } }
	}
	function screenScale(v) { /* screen px per source px (approximate, ignores straighten) */ var a = srcToScreen(v, 0, 0), b = srcToScreen(v, 1, 0), c = srcToScreen(v, 0, 1); return Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) / eng.W, Math.hypot(c[0] - a[0], c[1] - a[1]) / eng.H); }
	function spotRadiusScreen(v, r) { return r * Math.max(eng.W, eng.H) * screenScale(v); }
	function curMask() { return dev.s.locals.find(function (l) { return l.id === dev.selMask; }); }
	function cropCorners(v) { /* crop rect corners on screen (crop mode shows the oriented picture, out px = oriented px) */
		var ow = D.orientedSize(eng.W, eng.H, dev.s.rot90), c = dev.s.crop, cx = (c.x + c.w / 2) * ow[0], cy = (c.y + c.h / 2) * ow[1], w = c.w * ow[0], hh = c.h * ow[1], a = dev.s.angle * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
		return { pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (q) { return outToScreen(v, cx + (q[0] * w / 2) * co - (q[1] * hh / 2) * si, cy + (q[0] * w / 2) * si + (q[1] * hh / 2) * co); }), cx: cx, cy: cy, w: w, h: hh, a: a, ow: ow };
	}
	function drawCropOverlay(x, v) {
		var c = cropCorners(v), p = c.pts;
		x.fillStyle = "rgba(0,0,0,0.55)"; x.beginPath(); x.rect(0, 0, v.W, v.H); x.moveTo(p[0][0], p[0][1]); for (var i = 3; i >= 0; i--) x.lineTo(p[i][0], p[i][1]); x.closePath(); x.fill("evenodd");
		x.strokeStyle = "rgba(255,255,255,0.9)"; x.lineWidth = 1; x.beginPath(); x.moveTo(p[0][0], p[0][1]); for (i = 1; i < 4; i++) x.lineTo(p[i][0], p[i][1]); x.closePath(); x.stroke();
		x.strokeStyle = "rgba(255,255,255,0.35)"; for (i = 1; i < 3; i++) { var t = i / 3; x.beginPath(); x.moveTo(p[0][0] + (p[1][0] - p[0][0]) * t, p[0][1] + (p[1][1] - p[0][1]) * t); x.lineTo(p[3][0] + (p[2][0] - p[3][0]) * t, p[3][1] + (p[2][1] - p[3][1]) * t); x.stroke(); x.beginPath(); x.moveTo(p[0][0] + (p[3][0] - p[0][0]) * t, p[0][1] + (p[3][1] - p[0][1]) * t); x.lineTo(p[1][0] + (p[2][0] - p[1][0]) * t, p[1][1] + (p[2][1] - p[1][1]) * t); x.stroke(); }
		x.fillStyle = "#fff"; cropHandles(c).forEach(function (hd) { x.fillRect(hd.x - 5, hd.y - 5, 10, 10); });
		x.fillStyle = "rgba(0,0,0,0.6)"; x.fillRect(8, 8, 150, 22); x.fillStyle = "#fff"; x.font = "12px system-ui,sans-serif"; x.fillText(Math.round(c.w) + " × " + Math.round(c.h) + (dev.s.angle ? "  ·  " + dev.s.angle.toFixed(1) + "°" : ""), 16, 23);
	}
	function cropHandles(c) { var p = c.pts, out = []; var names = ["nw", "ne", "se", "sw"]; p.forEach(function (q, i) { out.push({ x: q[0], y: q[1], k: names[i] }); }); [["n", 0, 1], ["e", 1, 2], ["s", 2, 3], ["w", 3, 0]].forEach(function (m) { out.push({ x: (p[m[1]][0] + p[m[2]][0]) / 2, y: (p[m[1]][1] + p[m[2]][1]) / 2, k: m[0] }); }); return out; }
	function drawMaskOverlay(x, v) {
		dev.s.locals.forEach(function (l) {
			var sel = l.id === dev.selMask; x.lineWidth = sel ? 2 : 1; x.strokeStyle = sel ? "#fff" : "rgba(255,255,255,0.5)";
			if (l.type === "linear") { var a = srcToScreen(v, l.x0, l.y0), b = srcToScreen(v, l.x1, l.y1), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len * 3000, ny = dx / len * 3000;
				[a, b].forEach(function (p, i) { x.setLineDash(i ? [6, 4] : []); x.beginPath(); x.moveTo(p[0] - nx, p[1] - ny); x.lineTo(p[0] + nx, p[1] + ny); x.stroke(); }); x.setLineDash([]); if (sel) { [a, b].forEach(function (p) { x.fillStyle = "#fff"; x.beginPath(); x.arc(p[0], p[1], 5, 0, 7); x.fill(); }); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); } }
			else if (l.type === "radial") { var c = srcToScreen(v, l.cx, l.cy), md = Math.max(eng.W, eng.H) * screenScale(v), rx = l.rx * md, ry = l.ry * md; x.beginPath(); x.ellipse(c[0], c[1], rx, ry, l.rot, 0, 7); x.stroke(); x.setLineDash([3, 3]); x.beginPath(); x.ellipse(c[0], c[1], rx * (1 - l.feather / 100), ry * (1 - l.feather / 100), l.rot, 0, 7); x.stroke(); x.setLineDash([]); if (sel) radialHandles(v, l).forEach(function (hd) { x.fillStyle = "#fff"; x.beginPath(); x.arc(hd.x, hd.y, hd.k === "c" ? 6 : 4.5, 0, 7); x.fill(); }); }
		});
		if (dev.drawNew) { var d = dev.drawNew; x.strokeStyle = "#fff"; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(d.a[0], d.a[1]); x.lineTo(d.b[0], d.b[1]); x.stroke(); x.setLineDash([]); }
	}
	function radialHandles(v, l) { var c = srcToScreen(v, l.cx, l.cy), md = Math.max(eng.W, eng.H) * screenScale(v), co = Math.cos(l.rot), si = Math.sin(l.rot), rx = l.rx * md, ry = l.ry * md; return [{ k: "c", x: c[0], y: c[1] }, { k: "rx", x: c[0] + co * rx, y: c[1] + si * rx }, { k: "ry", x: c[0] - si * ry, y: c[1] + co * ry }, { k: "rot", x: c[0] + co * (rx + 22), y: c[1] + si * (rx + 22) }]; }

	/* ---- pointer handling on the stage ---- */
	var drag = null, spaceDown = false;
	var ovEl = $("dr-ov");
	function local(e) { var r = ovEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
	/* touch: on a phone the page must still scroll over the picture. One finger = scroll the page (or move the picture
	   when zoomed in / a tool is on), swipe sideways = next / previous photo, double-tap = zoom, two fingers = pinch. */
	var touches = {}, pinch = null, lastTap = null;
	function winMode() { return root.classList.contains("dr-win") || document.fullscreenElement === root; }
	function isZoomed() { return !!(dev && VI && dev.view.z && dev.view.z > VI.fit * 1.01); }
	function stageLock() { var st = $("dr-stage"); if (st) st.classList.toggle("dr-lock", !!(dev && (dev.tool || isZoomed() || winMode()))); }
	ovEl.addEventListener("touchstart", function (e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
	function startPinch() { var ids = Object.keys(touches), a = touches[ids[0]], b = touches[ids[1]], v = VI, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; pinch = { d0: Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])), z0: v.z, o: screenToOut(v, m[0], m[1]) }; drag = null; }
	function touchEnd(e) {
		if (!touches[e.pointerId]) return false; delete touches[e.pointerId];
		if (pinch) { if (Object.keys(touches).length < 2) { pinch = null; if (VI && dev.view.z && dev.view.z <= VI.fit * 1.01) dev.view.z = 0; drag = null; lastTap = null; requestRender(); } return true; }
		return false;
	}
	function doubleTap(p) { var now = Date.now(), t = lastTap; if (t && now - t.t < 340 && Math.hypot(p[0] - t.p[0], p[1] - t.p[1]) < 40) { lastTap = null; if (!isZoomed()) zoomTo(Math.max(VI.fit * 2.5, 1 / dprv()), p[0], p[1]); else { dev.view.z = 0; requestRender(); } return true; } lastTap = { t: now, p: p }; return false; }
	ovEl.addEventListener("pointerdown", function (e) {
		if (!dev || !dev.ready || !VI) return; var p = local(e), v = VI;
		if (e.pointerType === "touch") {
			touches[e.pointerId] = p; var n = Object.keys(touches).length;
			if (n === 2 && !(drag && drag.k === "paint")) { cap(ovEl, e); startPinch(); requestRender(); return; }
			if (n > 1) return;
			if (!dev.tool && !isZoomed()) { drag = { k: "tap", p: p }; return; }
			if (!dev.tool) { cap(ovEl, e); drag = { k: "pan", p: p, cx: v.cx, cy: v.cy, moved: false, touch: true }; return; }
		}
		cap(ovEl, e);
		if (e.button === 1 || e.button === 2 || spaceDown || (!dev.tool && (dev.view.z && dev.view.z > v.fit * 1.01))) { drag = { k: "pan", p: p, cx: v.cx, cy: v.cy, moved: false }; return; }
		if (!dev.tool) { drag = { k: "click", p: p }; return; }
		if (dev.tool === "wb") { var uv = screenToSrc(v, p[0], p[1]); if (uv[0] < 0 || uv[1] < 0 || uv[0] > 1 || uv[1] > 1) return; var rgb = eng.sampleSource(uv[0], uv[1]); var w = D.wbFromPick(rgb); dev.s.temp = w.temp; dev.s.tint = w.tint; afterSettings(true); commit("White balance (picked)"); setTool(null); return; }
		if (dev.tool === "crop") { var c = cropCorners(v), hit = cropHandles(c).find(function (hd) { return Math.hypot(hd.x - p[0], hd.y - p[1]) < 12; }); var o = screenToOut(v, p[0], p[1]); drag = { k: hit ? "crop-" + hit.k : insideCrop(c, p) ? "crop-move" : "crop-rot", p: p, o: o, c0: D.clone(dev.s.crop), a0: dev.s.angle, cc: c }; return; }
		if (dev.tool === "heal") {
			var hitS = -1, src = false; dev.s.spots.forEach(function (sp, i) { var a = srcToScreen(v, sp.x, sp.y), b = srcToScreen(v, sp.sx, sp.sy), r = spotRadiusScreen(v, sp.r); if (Math.hypot(a[0] - p[0], a[1] - p[1]) < Math.max(r, 8)) { hitS = i; src = false; } else if (Math.hypot(b[0] - p[0], b[1] - p[1]) < Math.max(r, 8)) { hitS = i; src = true; } });
			if (hitS >= 0) { dev.selSpot = hitS; drag = { k: src ? "spot-src" : "spot", i: hitS, p: p, sp: D.clone(dev.s.spots[hitS]) }; renderDevelopPanels(); requestRender(); return; }
			var u = screenToSrc(v, p[0], p[1]); if (u[0] < 0 || u[1] < 0 || u[0] > 1 || u[1] > 1) return; if (dev.s.spots.length >= 32) { toast("Up to 32 spots per photo.", 2500); return; }
			var s2 = autoSpotSource(u[0], u[1], prefs.healR); dev.s.spots.push({ x: u[0], y: u[1], r: prefs.healR, sx: s2[0], sy: s2[1], f: 50, heal: prefs.healHeal }); dev.selSpot = dev.s.spots.length - 1; live(); commit("Spot"); renderDevelopPanels(); return;
		}
		if (dev.tool === "mask") {
			var L = curMask();
			if (newMask) { drag = { k: "newmask", a: p }; dev.drawNew = { a: p, b: p }; return; }
			if (L && L.type === "brush") { drag = { k: "paint", erase: e.altKey || dev.erase, last: null }; paintAt(p, drag); return; }
			if (L && L.type === "linear") { var a2 = srcToScreen(v, L.x0, L.y0), b2 = srcToScreen(v, L.x1, L.y1); if (Math.hypot(a2[0] - p[0], a2[1] - p[1]) < 12) { drag = { k: "lin-a" }; return; } if (Math.hypot(b2[0] - p[0], b2[1] - p[1]) < 12) { drag = { k: "lin-b" }; return; } drag = { k: "lin-move", p: p, l0: D.clone(L) }; return; }
			if (L && L.type === "radial") { var hd = radialHandles(v, L).find(function (q) { return Math.hypot(q.x - p[0], q.y - p[1]) < 12; }); drag = { k: hd ? "rad-" + hd.k : "rad-c", p: p, l0: D.clone(L) }; return; }
		}
	});
	function insideCrop(c, p) { var q = c.pts, s = 0; for (var i = 0; i < 4; i++) { var a = q[i], b = q[(i + 1) % 4], cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); s += cr > 0 ? 1 : -1; } return Math.abs(s) === 4; }
	ovEl.addEventListener("pointermove", function (e) {
		if (!dev || !VI) return; var p = local(e), v = VI;
		if (dev.tool === "mask") { var L0 = curMask(); dev.brushAt = L0 && L0.type === "brush" && !newMask ? p : null; if (dev.brushAt && !drag) requestRender(); }
		ovEl.style.cursor = !dev.tool ? (dev.view.z > v.fit * 1.01 ? "grab" : "zoom-in") : dev.tool === "wb" || dev.tool === "heal" ? "crosshair" : dev.tool === "mask" ? (dev.brushAt ? "none" : "crosshair") : dev.tool === "crop" ? cropCursor(v, p) : "default";
		if (e.pointerType === "touch" && touches[e.pointerId]) { touches[e.pointerId] = p; if (pinch) { var ids = Object.keys(touches); if (ids.length < 2) return; var a = touches[ids[0]], b = touches[ids[1]], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z = clamp(pinch.z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d0, v.fit * 0.6, 16); dev.view = { z: z, cx: pinch.o[0] - (m[0] - v.W / 2) / z, cy: pinch.o[1] - (m[1] - v.H / 2) / z }; requestRender(); return; } }
		if (!drag) return;
		if (drag.k === "tap") { var tdx = p[0] - drag.p[0], tdy = p[1] - drag.p[1]; if (Math.abs(tdx) > 14 && Math.abs(tdx) > Math.abs(tdy) * 1.4) drag.swipe = true; drag.last = p; return; }
		if (drag.k === "pan") { drag.moved = true; dev.view = { z: v.z, cx: drag.cx - (p[0] - drag.p[0]) / v.z, cy: drag.cy - (p[1] - drag.p[1]) / v.z }; requestRender(); return; }
		if (drag.k === "click") { if (Math.hypot(p[0] - drag.p[0], p[1] - drag.p[1]) > 4) { drag = { k: "pan", p: p, cx: v.cx, cy: v.cy, moved: true }; if (!dev.view.z) dev.view = { z: v.z, cx: v.cx, cy: v.cy }; } return; }
		if (drag.k.indexOf("crop-") === 0) { cropDrag(v, p); requestRender(); return; }
		if (drag.k === "spot" || drag.k === "spot-src") { var u = screenToSrc(v, p[0], p[1]), u0 = screenToSrc(v, drag.p[0], drag.p[1]), dx = u[0] - u0[0], dy = u[1] - u0[1], sp = dev.s.spots[drag.i]; if (drag.k === "spot") { sp.x = drag.sp.x + dx; sp.y = drag.sp.y + dy; sp.sx = drag.sp.sx + dx; sp.sy = drag.sp.sy + dy; } else { sp.sx = drag.sp.sx + dx; sp.sy = drag.sp.sy + dy; } live(); return; }
		if (drag.k === "newmask") { dev.drawNew.b = p; requestRender(); return; }
		if (drag.k === "paint") { paintAt(p, drag); return; }
		var L = curMask(); if (!L) return; var uv = screenToSrc(v, p[0], p[1]);
		if (drag.k === "lin-a") { L.x0 = uv[0]; L.y0 = uv[1]; } else if (drag.k === "lin-b") { L.x1 = uv[0]; L.y1 = uv[1]; }
		else if (drag.k === "lin-move") { var q0 = screenToSrc(v, drag.p[0], drag.p[1]), ddx = uv[0] - q0[0], ddy = uv[1] - q0[1]; L.x0 = drag.l0.x0 + ddx; L.y0 = drag.l0.y0 + ddy; L.x1 = drag.l0.x1 + ddx; L.y1 = drag.l0.y1 + ddy; }
		else if (drag.k === "rad-c") { var q1 = screenToSrc(v, drag.p[0], drag.p[1]); L.cx = drag.l0.cx + uv[0] - q1[0]; L.cy = drag.l0.cy + uv[1] - q1[1]; }
		else { var c = srcToScreen(v, L.cx, L.cy), md = Math.max(eng.W, eng.H) * screenScale(v), dxs = p[0] - c[0], dys = p[1] - c[1], co = Math.cos(L.rot), si = Math.sin(L.rot);
			if (drag.k === "rad-rx") L.rx = clamp(Math.abs(dxs * co + dys * si) / md, 0.005, 3); else if (drag.k === "rad-ry") L.ry = clamp(Math.abs(-dxs * si + dys * co) / md, 0.005, 3); else if (drag.k === "rad-rot") L.rot = Math.atan2(dys, dxs); }
		live();
	});
	function endDrag(e) {
		if (e && e.pointerType === "touch" && touchEnd(e)) return;
		if (!drag || !dev) { drag = null; return; } var k = drag.k, v = VI, p = e ? local(e) : null;
		if (k === "tap") { var d0 = drag; drag = null; if (!p) return; var sdx = p[0] - d0.p[0]; if (d0.swipe && Math.abs(sdx) > 50) { lastTap = null; step(sdx < 0 ? 1 : -1); } else if (Math.hypot(sdx, p[1] - d0.p[1]) < 12) doubleTap(p); return; }
		if (k === "pan" && !drag.touch && !drag.moved && p && e.button === 0 && !spaceDown && !dev.tool) { drag = null; dev.view.z = 0; requestRender(); return; }
		if (k === "pan" && drag.touch) { var mv = drag.moved; drag = null; if (!mv && p) doubleTap(p); requestRender(); return; }
		if (k === "click" && p) { /* click: toggle fit / 100% at that point */ if (!dev.view.z || dev.view.z <= v.fit * 1.01) zoomTo(1 / dprv(), p[0], p[1]); else { dev.view.z = 0; requestRender(); } }
		else if (k.indexOf("crop-") === 0) { constrainCrop(); syncControls(); commit(k === "crop-rot" ? "Straighten " + dev.s.angle.toFixed(1) + "°" : "Crop"); requestRender(); }
		else if (k === "spot" || k === "spot-src") commit(k === "spot" ? "Move spot" : "Spot source");
		else if (k === "newmask" && v) { var d = dev.drawNew; dev.drawNew = null; var a = screenToSrc(v, d.a[0], d.a[1]), b = screenToSrc(v, d.b[0], d.b[1]); var len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
			var l; if (newMask === "linear") { if (len < 6) { b = [a[0], a[1] + 0.25]; } l = D.cleanLocal({ type: "linear", x0: a[0], y0: a[1], x1: b[0], y1: b[1] }); l.adj.exp = -0.6; }
			else { var md = Math.max(eng.W, eng.H) * screenScale(v), r = len < 6 ? 0.18 : len / md; l = D.cleanLocal({ type: "radial", cx: a[0], cy: a[1], rx: r, ry: r * 0.8 }); l.adj.exp = 0.5; }
			dev.s.locals.push(l); dev.selMask = l.id; newMask = null; tip(null); live(); commit("New " + l.type + " mask"); renderDevelopPanels(); }
		else if (k === "paint") { var L = curMask(), cv = L && dev.maskCv[L.id]; if (cv) { var wu = cv.toDataURL("image/webp", 0.9); L.mask = /^data:image\/webp/.test(wu) ? wu : cv.toDataURL("image/png"); setMasksFor(eng, dev.s, dev.maskCv); } commit("Brush"); }
		else if (k.indexOf("lin-") === 0 || k.indexOf("rad-") === 0) commit("Move mask");
		drag = null; requestRender();
	}
	ovEl.addEventListener("pointerup", endDrag); ovEl.addEventListener("pointercancel", function (e) { if (e.pointerType === "touch") { delete touches[e.pointerId]; if (Object.keys(touches).length < 2) pinch = null; } drag = null; dev && (dev.drawNew = null); requestRender(); });
	ovEl.addEventListener("pointerleave", function () { if (dev && dev.brushAt) { dev.brushAt = null; requestRender(); } });
	ovEl.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	ovEl.addEventListener("wheel", function (e) {
		if (!dev || !VI) return; var winMode = root.classList.contains("dr-win") || document.fullscreenElement === root; if (!winMode && !e.ctrlKey && !e.metaKey) return;
		e.preventDefault(); var p = local(e), k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)); zoomTo((dev.view.z || VI.fit) * k, p[0], p[1]);
	}, { passive: false });
	function cropCursor(v, p) { var c = cropCorners(v), hit = cropHandles(c).find(function (hd) { return Math.hypot(hd.x - p[0], hd.y - p[1]) < 12; }); if (hit) return { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" }[hit.k]; return insideCrop(c, p) ? "move" : "alias"; }
	function cropDrag(v, p) {
		var c0 = drag.c0, ow = drag.cc.ow, OW = ow[0], OH = ow[1], o = screenToOut(v, p[0], p[1]), dx = o[0] - drag.o[0], dy = o[1] - drag.o[1];
		if (drag.k === "crop-move") { dev.s.crop = { x: c0.x + dx / OW, y: c0.y + dy / OH, w: c0.w, h: c0.h }; constrainCrop(); return; }
		if (drag.k === "crop-rot") { var cx = drag.cc.cx, cy = drag.cc.cy, a0 = Math.atan2(drag.o[1] - cy, drag.o[0] - cx), a1 = Math.atan2(o[1] - cy, o[0] - cx); dev.s.angle = clamp(Math.round((drag.a0 + (a1 - a0) * 180 / Math.PI) * 10) / 10, -45, 45); var a = D.aspectValue(dev.s.aspect, OW / OH); constrainCrop(); syncControls(); return; }
		/* resize in the rectangle's own frame: the opposite side stays */
		var k = drag.k.slice(5), an = dev.s.angle * Math.PI / 180, co = Math.cos(an), si = Math.sin(an), lx = dx * co + dy * si, ly = -dx * si + dy * co;
		var w = c0.w * OW, hh = c0.h * OH, l = -w / 2, r = w / 2, t = -hh / 2, b = hh / 2;
		if (k.indexOf("w") >= 0) l += lx; if (k.indexOf("e") >= 0) r += lx; if (k.indexOf("n") >= 0) t += ly; if (k.indexOf("s") >= 0) b += ly;
		var asp = D.aspectValue(dev.s.aspect, OW / OH), nw = Math.max(16, r - l), nh = Math.max(16, b - t);
		if (asp) { if (k.length === 1 && (k === "n" || k === "s")) nw = nh * asp; else if (k.length === 1) nh = nw / asp; else { if (nw / nh > asp) nh = nw / asp; else nw = nh * asp; } if (k.indexOf("w") >= 0) l = r - nw; else r = l + nw; if (k.indexOf("n") >= 0) t = b - nh; else b = t + nh; if (k === "n" || k === "s") { l = -nw / 2; r = nw / 2; } if (k === "e" || k === "w") { t = -nh / 2; b = nh / 2; } }
		else { if (k.indexOf("w") >= 0) l = r - nw; else r = l + nw; if (k.indexOf("n") >= 0) t = b - nh; else b = t + nh; }
		var mx = (l + r) / 2, my = (t + b) / 2, ccx = drag.cc.cx + mx * co - my * si, ccy = drag.cc.cy + mx * si + my * co;
		dev.s.crop = { x: (ccx - nw / 2) / OW, y: (ccy - nh / 2) / OH, w: Math.min(1, nw / OW), h: Math.min(1, nh / OH) };
		constrainCrop();
	}
	var paintPending = false;
	function paintAt(p, d) {
		var L = curMask(); if (!L) return; var cv = dev.maskCv[L.id] || makeMaskCanvas(L), x = cv.getContext("2d"), v = VI, uv = screenToSrc(v, p[0], p[1]);
		var px = uv[0] * cv.width, py = uv[1] * cv.height, R = prefs.brush.size * Math.max(cv.width, cv.height), fe = prefs.brush.feather / 100, fl = prefs.brush.flow / 100;
		var pts = [[px, py]]; if (d.last) { var dd = Math.hypot(px - d.last[0], py - d.last[1]), n = Math.floor(dd / (R * 0.25)); for (var i = 1; i <= n; i++) pts.unshift([d.last[0] + (px - d.last[0]) * i / (n + 1), d.last[1] + (py - d.last[1]) * i / (n + 1)]); }
		d.last = [px, py];
		x.globalCompositeOperation = d.erase ? "destination-out" : "source-over";
		pts.forEach(function (q) { var g = x.createRadialGradient(q[0], q[1], R * (1 - fe) * 0.999, q[0], q[1], R); g.addColorStop(0, "rgba(255,255,255," + fl + ")"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.beginPath(); x.arc(q[0], q[1], R, 0, 7); x.fill(); });
		x.globalCompositeOperation = "source-over"; dev.brushAt = p;
		if (!paintPending) { paintPending = true; requestAnimationFrame(function () { paintPending = false; if (dev) { setMasksFor(eng, dev.s, dev.maskCv); requestRender(); } }); }
	}

	/* ---------------- copy / paste / sync / presets ---------------- */
	var DEFAULT_COPY = ["wb", "tone", "presence", "color", "curve", "hsl", "bw", "grade", "detail", "lens", "fx"];
	function groupChecks(sel0, s) { var ch = s ? D.changedGroups(s) : []; return '<div class="dr-checks">' + D.GROUPS.map(function (g) { return '<label><input type="checkbox" value="' + g.id + '"' + (sel0.indexOf(g.id) >= 0 ? " checked" : "") + "> " + esc(g.label) + (ch.indexOf(g.id) >= 0 ? " <small style=\"color:var(--dr-acc)\">●</small>" : "") + "</label>"; }).join("") + '</div><div class="dr-row" style="margin-top:0.5em"><button type="button" class="dr-b dr-b--sm" data-all="1">All</button><button type="button" class="dr-b dr-b--sm" data-all="0">None</button></div>'; }
	function bindChecks(d) { d.querySelectorAll("[data-all]").forEach(function (b) { b.onclick = function () { var on = b.getAttribute("data-all") === "1"; d.querySelectorAll(".dr-checks input").forEach(function (i) { i.checked = on; }); }; }); return function () { return Array.prototype.filter.call(d.querySelectorAll(".dr-checks input"), function (i) { return i.checked; }).map(function (i) { return i.value; }); }; }
	function curSettings() { var p = curPhoto(); if (!p) return null; if (dev && dev.p === p) return D.clone(dev.s); return D.normalize((recOf(p) || {}).s); }
	function copySettings() {
		var s = curSettings(); if (!s) return;
		modal('<h3>Copy settings</h3><p class="dr-note">Choose what to copy (● = changed on this photo).</p>' + groupChecks(prefs.copyGroups || DEFAULT_COPY, s) + '<div class="dr-acts"><button type="button" class="dr-b" data-a="no">Cancel</button><button type="button" class="dr-b dr-b--pri" data-a="ok">Copy</button></div>', function (d, close) { var get = bindChecks(d); d.querySelector("[data-a=no]").onclick = close; d.querySelector("[data-a=ok]").onclick = function () { var g = get(); prefs.copyGroups = g; savePrefs(); clip = { s: s, g: g }; try { localStorage.setItem(PK + ":clip", JSON.stringify(clip)); } catch (e) {} close(); toast("Settings copied: paste with Ctrl+Shift+V", 2200); if (mod === "library") renderRightLibrary(); else renderDevelopPanels(); }; });
	}
	function pasteSettings(list) { if (!clip) { toast("Copy settings first (Ctrl+Shift+C).", 2000); return; } bulkEdit(list, function (s) { return D.pickGroups(clip.s, s, clip.g); }, "Paste settings"); if (dev) setMasksFor(eng, dev.s, dev.maskCv); }
	function syncDlg() {
		var s = curSettings(), list = selected().filter(function (p) { return !dev || p !== dev.p; }); if (!s || !list.length) return;
		modal('<h3>Sync settings to ' + list.length + ' photo' + (list.length > 1 ? "s" : "") + '</h3><p class="dr-note">The chosen parts of this photo\'s settings are copied to the other selected photos.</p>' + groupChecks(prefs.copyGroups || DEFAULT_COPY, s) + '<div class="dr-acts"><button type="button" class="dr-b" data-a="no">Cancel</button><button type="button" class="dr-b dr-b--pri" data-a="ok">Sync</button></div>', function (d, close) { var get = bindChecks(d); d.querySelector("[data-a=no]").onclick = close; d.querySelector("[data-a=ok]").onclick = function () { var g = get(); prefs.copyGroups = g; savePrefs(); close(); bulkEdit(list, function (s2) { return D.pickGroups(s, s2, g); }, "Sync settings"); }; });
	}
	function savePresetDlg() {
		if (!dev) return;
		modal('<h3>Save as preset</h3><div class="dr-grid2"><label for="dr-pn">Name</label><input type="text" class="dr-in" id="dr-pn" value="My look ' + (userPresets.length + 1) + '"></div><p class="dr-note">Include:</p>' + groupChecks(D.changedGroups(dev.s).filter(function (g) { return ["crop", "locals", "spots", "transform"].indexOf(g) < 0; }), dev.s) + '<div class="dr-acts"><button type="button" class="dr-b" data-a="no">Cancel</button><button type="button" class="dr-b dr-b--pri" data-a="ok">Save preset</button></div>', function (d, close) { var get = bindChecks(d); d.querySelector("[data-a=no]").onclick = close; d.querySelector("[data-a=ok]").onclick = function () { var g = get(); if (!g.length) { toast("Tick at least one part.", 2000); return; } var p = D.makePreset(d.querySelector("#dr-pn").value, dev.s, g); userPresets.push(p); DB.put("kv", userPresets, "presets"); close(); toast("Preset saved: " + p.name, 2000); renderLeftDevelop(); renderDevelopPanels(); }; });
	}

	/* ---------------- export ---------------- */
	function exportDlg() {
		var list = selected(); if (!list.length) { toast("Select photos to export first.", 2000); return; }
		var e = prefs.exp, raws = list.filter(function (p) { return p.raw; }).length;
		modal('<h3>Export ' + list.length + ' photo' + (list.length > 1 ? "s" : "") + '</h3><div class="dr-grid2">' +
			'<label for="dr-xf">Format</label><select class="dr-in" id="dr-xf"><option value="jpeg">JPEG</option><option value="png">PNG (no loss, big)</option><option value="webp">WebP (smaller)</option></select>' +
			'<label for="dr-xq">Quality</label><div class="dr-row" style="margin:0"><input type="range" id="dr-xq" min="40" max="100" value="' + e.q + '" style="flex:1;accent-color:var(--dr-acc)"><span id="dr-xqv">' + e.q + '</span></div>' +
			'<label for="dr-xs">Size</label><div class="dr-row" style="margin:0"><select class="dr-in" id="dr-xs"><option value="full">Full size</option><option value="long">Long edge</option><option value="short">Short edge</option><option value="width">Width</option><option value="height">Height</option><option value="mp">Megapixels</option><option value="percent">Percent</option></select><input type="number" class="dr-in" id="dr-xv" min="1" style="width:6em" value="' + e.val + '"><span id="dr-xu" class="dr-note"></span></div>' +
			'<label></label><label><input type="checkbox" id="dr-xen"' + (e.enlarge ? " checked" : "") + '> Allow enlarging</label>' +
			'<label for="dr-xn">File name</label><div><input type="text" class="dr-in" id="dr-xn" style="width:100%" value="' + esc(e.name) + '"><div class="dr-note" id="dr-xnp" style="margin:0.2em 0 0">{name} {n3} {date} {rating} {folder} {w} {h}</div></div>' +
			'<label for="dr-xw">Watermark</label><div class="dr-row" style="margin:0"><input type="text" class="dr-in" id="dr-xw" placeholder="e.g. © Your Name" value="' + esc(e.wm) + '" style="flex:1"><select class="dr-in" id="dr-xwp"><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option><option value="c">Centre</option></select></div>' +
			(raws ? '<label>RAW files</label><label><input type="checkbox" id="dr-xraw"' + (e.rawFull ? " checked" : "") + '> Decode the full RAW (best quality, a few seconds each)</label>' : "") +
			'<label for="dr-xd">Save to</label><select class="dr-in" id="dr-xd">' + (hasDirPicker ? '<option value="folder">A folder you pick</option>' : "") + '<option value="zip">One ZIP file</option><option value="dl">Separate downloads</option></select>' +
			'</div><div class="dr-prog" id="dr-xprog" hidden><div></div></div><p class="dr-note" id="dr-xmsg"></p><div class="dr-acts"><button type="button" class="dr-b" data-a="no">Cancel</button><button type="button" class="dr-b dr-b--pri" data-a="ok">Export</button></div>', function (d, close) {
			var q = function (id) { return d.querySelector("#" + id); };
			q("dr-xf").value = e.fmt; q("dr-xs").value = e.size; q("dr-xwp").value = e.wmPos; if (q("dr-xd").querySelector('option[value="' + e.dest + '"]')) q("dr-xd").value = e.dest;
			function upd() { var fmt = q("dr-xf").value; q("dr-xq").disabled = fmt === "png"; q("dr-xqv").textContent = q("dr-xq").value; var s = q("dr-xs").value; q("dr-xv").hidden = s === "full"; q("dr-xu").textContent = { long: "px", short: "px", width: "px", height: "px", mp: "MP", percent: "%" }[s] || ""; var p0 = list[0], r0 = recOf(p0) || {}; q("dr-xnp").textContent = "e.g. " + D.exportName(q("dr-xn").value, { name: p0.name, n: 1, date: p0.date ? new Date(p0.date) : null, rating: r0.rating, folder: p0.dir || rootName, ext: fmt === "jpeg" ? "jpg" : fmt }); }
			d.addEventListener("input", upd); d.addEventListener("change", upd); upd();
			var cancel = { v: false };
			d.querySelector("[data-a=no]").onclick = function () { cancel.v = true; $("dr-modal")._busy = false; close(); };
			d.querySelector("[data-a=ok]").onclick = async function () {
				Object.assign(e, { fmt: q("dr-xf").value, q: +q("dr-xq").value, size: q("dr-xs").value, val: +q("dr-xv").value || 2048, enlarge: q("dr-xen").checked, name: q("dr-xn").value || "{name}", wm: q("dr-xw").value, wmPos: q("dr-xwp").value, dest: q("dr-xd").value }); if (q("dr-xraw")) e.rawFull = q("dr-xraw").checked; savePrefs();
				var dir = null; if (e.dest === "folder") { try { dir = await window.showDirectoryPicker({ id: "mes-darkroom-export", mode: "readwrite" }); } catch (er) { return; } }
				this.disabled = true; $("dr-modal")._busy = true; q("dr-xprog").hidden = false;
				try { await runExport(list, e, dir, cancel, function (i, msg) { q("dr-xprog").firstChild.style.width = (i / list.length * 100) + "%"; q("dr-xmsg").textContent = msg; }); if (!cancel.v) { q("dr-xmsg").textContent = "Done: " + list.length + " photo" + (list.length > 1 ? "s" : "") + " exported" + (dir ? " to " + dir.name : "") + "."; this.textContent = "Close"; this.disabled = false; this.onclick = function () { $("dr-modal")._busy = false; close(); }; } }
				catch (er2) { q("dr-xmsg").textContent = "Export stopped: " + er2.message; this.disabled = false; }
				$("dr-modal")._busy = false;
			};
		});
	}
	async function runExport(list, e, dir, cancel, prog) {
		var zip = [], used = {}, ext = e.fmt === "jpeg" ? "jpg" : e.fmt, mime = "image/" + e.fmt;
		for (var i = 0; i < list.length; i++) {
			if (cancel.v) return; var p = list[i], r = recOf(p) || {}, s = (dev && dev.p === p) ? D.clone(dev.s) : D.normalize(r.s);
			prog(i, "Preparing " + p.name + " (" + (i + 1) + " of " + list.length + ")…");
			var en = workEngine(), file = await getFile(p);
			if (p.raw && e.rawFull) { prog(i, "Decoding RAW " + p.name + " (" + (i + 1) + " of " + list.length + ")…"); var pvr = await loadPreview(p, 1024); en.setImage(pvr.img); var tg = medianLum(en); try { var rd = await decodeRaw(file); en.setImage(rd); if (r.rg) en.gain = r.rg; else matchRawGain(en, tg); } catch (er) { var pv0 = await loadPreview(p, en.maxTex); en.setImage(pv0.img); } }
			else { var pv = await loadPreview(p, en.maxTex); en.setImage(pv.img); if (pv.img.close) pv.img.close(); }
			await setMasksFor(en, s, (dev && dev.p === p) ? dev.maskCv : null);
			var g = G.geometry(s, en.W, en.H), sz = e.size === "full" ? [Math.round(g.cw), Math.round(g.ch)] : D.exportSize(g.cw, g.ch, e.size, e.val, e.enlarge);
			if (sz[0] * sz[1] > 120e6) { var k = Math.sqrt(120e6 / (sz[0] * sz[1])); sz = [Math.round(sz[0] * k), Math.round(sz[1] * k)]; }
			prog(i + 0.5, "Rendering " + p.name + " at " + sz[0] + " × " + sz[1] + "…");
			await new Promise(function (res) { setTimeout(res, 20); });
			var cv = en.renderTo(s, sz[0], sz[1]);
			if (e.wm) watermark(cv, e);
			if (e.fmt === "jpeg") { var c2 = cv.getContext("2d"); c2.globalCompositeOperation = "destination-over"; c2.fillStyle = "#fff"; c2.fillRect(0, 0, cv.width, cv.height); c2.globalCompositeOperation = "source-over"; }
			var blob = await new Promise(function (res) { cv.toBlob(res, mime, e.q / 100); }); cv.width = cv.height = 1;
			if (!blob) throw new Error("The browser could not encode " + p.name + " (too large?)");
			var name = D.exportName(e.name, { name: p.name, n: i + 1, date: p.date ? new Date(p.date) : null, rating: r.rating, folder: p.dir || rootName, w: sz[0], h: sz[1], ext: ext });
			if (window.MESImg) name = MESImg.uniqueName ? MESImg.uniqueName(name, used) : name; used[name.toLowerCase()] = 1;
			if (dir) { var fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(blob); await w.close(); }
			else if (e.dest === "zip") zip.push({ name: name, data: new Uint8Array(await blob.arrayBuffer()) });
			else downloadBlob(blob, name);
		}
		if (zip.length) { prog(list.length, "Making the ZIP…"); var z = MESImg.zipStore(zip); downloadBlob(new Blob([z], { type: "application/zip" }), (rootName || "darkroom-export") + ".zip"); }
		prog(list.length, "");
	}
	function watermark(cv, e) { var x = cv.getContext("2d"), fs = Math.max(12, Math.round(Math.min(cv.width, cv.height) * e.wmSize / 100)), pad = fs; x.font = "600 " + fs + "px system-ui, -apple-system, Segoe UI, sans-serif"; var w = x.measureText(e.wm).width, px = e.wmPos.indexOf("l") >= 0 ? pad : e.wmPos === "c" ? (cv.width - w) / 2 : cv.width - w - pad, py = e.wmPos.indexOf("t") === 0 ? pad + fs : e.wmPos === "c" ? cv.height / 2 : cv.height - pad; x.globalAlpha = e.wmOp / 100; x.fillStyle = "rgba(0,0,0,0.5)"; x.fillText(e.wm, px + fs * 0.06, py + fs * 0.06); x.fillStyle = "#fff"; x.fillText(e.wm, px, py); x.globalAlpha = 1; }
	function downloadBlob(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 20000); }
	async function toPhotoEditor() {
		if (!dev || !dev.ready || !window.MESImg || !MESImg.handoffSend) return; var s = dev.s, g = G.geometry(s, eng.W, eng.H), cv = eng.renderTo(s, Math.round(g.cw), Math.round(g.ch)); requestRender();
		var blob = await new Promise(function (res) { cv.toBlob(res, "image/png"); }); if (!blob) return;
		MESImg.handoffSend("/photo", [{ blob: blob, name: dev.p.name.replace(/\.[^.]+$/, "") + "-developed.png" }], function (u) { toast("Your browser blocked the new tab: allow pop-ups for mes.fm, or open " + u, 6000); }).catch(function () { toast("Could not hand the photo over (private window?): export it and open it in the Photo Editor.", 6000); });
	}

	/* ---------------- settings / backup ---------------- */
	function settingsDlg() {
		modal('<h3>Settings</h3><div class="dr-checks" style="grid-template-columns:1fr">' +
			'<label><input type="checkbox" id="dr-ssub"' + (prefs.sub ? " checked" : "") + '> Include subfolders when opening a folder</label>' +
			'<label><input type="checkbox" id="dr-sraw"' + (prefs.raw ? " checked" : "") + '> Decode RAW files fully in Develop (16-bit, more room to recover highlights)</label>' +
			'<label><input type="checkbox" id="dr-sxmp"' + (prefs.xmp ? " checked" : "") + '> Read Lightroom / Camera Raw .xmp files next to the photos</label>' +
			'<label><input type="checkbox" id="dr-sside"' + (prefs.side ? " checked" : "") + (hasDirPicker ? "" : " disabled") + '> Save edits next to the photos (.mesdr files), so they travel with the folder</label>' +
			'</div><p class="dr-note">' + (hasDirPicker ? "Saving next to the photos asks once for permission to change files in the folder. Your photos themselves are never changed." : "This browser can't write into folders, so edits are kept in the browser: use Back up my edits now and then.") + '</p>' +
			'<div class="dr-row"><button type="button" class="dr-b dr-b--sm" id="dr-sthumbs">Forget saved thumbnails</button><button type="button" class="dr-b dr-b--sm" id="dr-sall">Forget every edit…</button></div>' +
			'<div class="dr-acts"><button type="button" class="dr-b dr-b--pri" data-a="ok">Close</button></div>', function (d, close) {
			d.querySelector("[data-a=ok]").onclick = close;
			d.querySelector("#dr-ssub").onchange = function () { prefs.sub = this.checked; $("dr-sub").checked = this.checked; savePrefs(); };
			d.querySelector("#dr-sraw").onchange = function () { prefs.raw = this.checked; savePrefs(); };
			d.querySelector("#dr-sxmp").onchange = function () { prefs.xmp = this.checked; savePrefs(); };
			d.querySelector("#dr-sside").onchange = async function () { var on = this.checked; if (on && rootDir && rootDir.requestPermission) { var ok = await rootDir.requestPermission({ mode: "readwrite" }); if (ok !== "granted") { this.checked = false; return; } } prefs.side = on; savePrefs(); if (on) { var n = 0; photos.forEach(function (p) { var r = recOf(p); if (r && (r.t || r.rating || r.flag || r.label)) { writeSidecar(p, r); n++; } }); toast(n ? "Writing " + n + " .mesdr files…" : "New edits will be saved next to the photos.", 2500); } };
			d.querySelector("#dr-sthumbs").onclick = async function () { await DB.clear("thumb"); photos.forEach(function (p) { p.tstate = 0; }); toast("Thumbnails will be made again.", 2000); if (mod === "library") loadVisible(); };
			d.querySelector("#dr-sall").onclick = async function () { close(); if (!(await confirmBox("Forget every edit?", "Ratings, flags, labels, keywords, collections and develop settings kept in this browser are deleted. .mesdr files next to the photos and backups stay. This can't be undone.", "Forget everything"))) return; await DB.clear("rec"); await DB.clear("thumb"); recs = {}; photos.forEach(function (p) { p.tstate = 0; }); if (dev) { dev.s = D.defaults(); afterSettings(true); } refreshAll(); toast("Done.", 2000); };
		});
	}
	function backup() { var data = { app: "mes-darkroom", v: 1, made: new Date().toISOString(), recs: Object.keys(recs).map(function (k) { return recs[k]; }).filter(function (r) { return r.t || r.rating || r.flag || r.label || (r.kw && r.kw.length); }), presets: userPresets, colls: colls }; downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), "mes-darkroom-edits-" + new Date().toISOString().slice(0, 10) + ".json"); toast(data.recs.length + " photos' edits saved to a file.", 2500); }
	async function restore(file) { try { var j = JSON.parse(await file.text()); if (!j || j.app !== "mes-darkroom") throw new Error("not a MES Darkroom backup"); var n = 0; (j.recs || []).forEach(function (r) { if (!r || !r.key) return; var o = recs[r.key]; if (!o || (r.t || 0) >= (o.t || 0)) { if (r.s) r.s = D.normalize(r.s); recs[r.key] = r; DB.put("rec", r); n++; } }); if (Array.isArray(j.presets)) j.presets.forEach(function (p) { if (p && p.id && !userPresets.some(function (q) { return q.id === p.id; })) userPresets.push(p); }); DB.put("kv", userPresets, "presets"); if (Array.isArray(j.colls)) j.colls.forEach(function (c) { if (c && c.id && !colls.some(function (q) { return q.id === c.id; })) colls.push(c); }); saveColls(); photos.forEach(function (p) { p.tstate = 0; }); refreshAll(); toast("Restored edits for " + n + " photos.", 3000); } catch (e) { toast("Could not restore: " + e.message, 4000); } }

	/* ---------------- samples ---------------- */
	var SAMPLES = ["/mortgagecalculator/img/memes/fallingwater-house-in-pennsylvania-usa.jpg", "/mortgagecalculator/img/memes/free-spirit-spheres-in-qualicum-beach-bc-canada.jpg", "/mortgagecalculator/img/memes/amazing-house-on-a-rock.jpg", "/mortgagecalculator/img/memes/too-tall-tea-house-in-nagano-japan.jpg", "/mortgagecalculator/img/memes/shipping-container-house-in-san-antonio-texas-usa.jpg", "/mortgagecalculator/img/memes/amazing-indoor-pool-in-house.jpg"];
	async function loadSamples() {
		showStartBusy("Loading sample photos…"); var files = [];
		for (var i = 0; i < SAMPLES.length; i++) { try { var r = await fetch(SAMPLES[i]); if (!r.ok) continue; var b = await r.blob(); files.push(new File([b], SAMPLES[i].split("/").pop(), { type: b.type || "image/jpeg", lastModified: Date.now() - i * 864e5 })); } catch (e) {} }
		closeAll(); rootName = "Sample photos"; await addFiles(files, false);
	}

	/* ---------------- top bar wiring ---------------- */
	root.querySelector(".dr-mods").addEventListener("click", function (e) { var b = e.target.closest("[data-mod]"); if (b) setMod(b.getAttribute("data-mod")); });
	$("dr-level").addEventListener("click", function (e) { var b = e.target.closest("[data-lv]"); if (!b) return; prefs.lv = b.getAttribute("data-lv"); savePrefs(); applyLayout(); if (dev) renderDevelopPanels(); });
	var om = $("dr-openmenu");
	$("dr-openbtn").addEventListener("click", function (e) { e.stopPropagation(); om.hidden = !om.hidden; this.setAttribute("aria-expanded", om.hidden ? "false" : "true"); });
	document.addEventListener("click", function (e) { if (!om.hidden && !e.target.closest(".dr-mw")) { om.hidden = true; $("dr-openbtn").setAttribute("aria-expanded", "false"); } });
	function act(a) {
		om.hidden = true;
		if (a === "folder") openFolder(); else if (a === "files") { $("dr-pickfiles")._add = false; $("dr-pickfiles").click(); } else if (a === "add") { $("dr-pickfiles")._add = true; $("dr-pickfiles").click(); }
		else if (a === "rescan") { if (rootDir) openFolder(rootDir); else toast("Open a folder first.", 2000); } else if (a === "sample") loadSamples();
		else if (a === "backup") backup(); else if (a === "restore") $("dr-pickbackup").click(); else if (a === "settings") settingsDlg();
		else if (a === "close") { closeAll(); mod = "library"; showStart(); }
		else if (a === "reopen") reopen();
	}
	om.addEventListener("click", function (e) { var b = e.target.closest("[data-act]"); if (b) act(b.getAttribute("data-act")); });
	$("dr-start").addEventListener("click", function (e) { var b = e.target.closest("[data-act]"); if (b) act(b.getAttribute("data-act")); });
	$("dr-pickfiles").addEventListener("change", function () { var f = this.files; if (f && f.length) addFiles(f, !this._add); this.value = ""; });
	$("dr-pickdir").addEventListener("change", function () { var f = this.files; if (f && f.length) addFiles(f, true); this.value = ""; });
	$("dr-pickbackup").addEventListener("change", function () { if (this.files[0]) restore(this.files[0]); this.value = ""; });
	$("dr-sub").addEventListener("change", function () { prefs.sub = this.checked; savePrefs(); });
	$("dr-export").addEventListener("click", exportDlg);
	$("dr-help").addEventListener("click", helpDlg);
	function setWin(on) { root.classList.toggle("dr-win", on); document.documentElement.classList.toggle("dr-win-on", on); $("dr-fill").setAttribute("aria-pressed", on ? "true" : "false"); requestRender(); setTimeout(function () { requestRender(); if (mod === "library") loadVisible(); }, 50); }
	$("dr-fill").addEventListener("click", function () { setWin(!root.classList.contains("dr-win")); });
	$("dr-fs").addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(function () {}); });
	document.addEventListener("fullscreenchange", function () { setTimeout(requestRender, 60); });
	/* filter bar */
	var qd = debounce(function () { filter.q = $("dr-q").value; refreshAll(); }, 200); $("dr-q").addEventListener("input", qd);
	$("dr-frating").addEventListener("change", function () { filter.minRating = +this.value; refreshAll(); });
	$("dr-fflag").addEventListener("change", function () { filter.flag = this.value; refreshAll(); });
	$("dr-flabel").addEventListener("change", function () { filter.label = +this.value; refreshAll(); });
	$("dr-fedit").addEventListener("change", function () { filter.edited = this.value; refreshAll(); });
	$("dr-sort").addEventListener("change", function () { prefs.sort = this.value; savePrefs(); refreshAll(); });
	$("dr-sortdir").addEventListener("click", function () { prefs.dir = prefs.dir === "asc" ? "desc" : "asc"; savePrefs(); applyLayout(); refreshAll(); });
	$("dr-tsize").addEventListener("input", function () { prefs.ts = +this.value; root.style.setProperty("--dr-ts", prefs.ts + "px"); }); $("dr-tsize").addEventListener("change", function () { savePrefs(); loadVisible(); });
	/* drop */
	["dragenter", "dragover"].forEach(function (t) { root.addEventListener(t, function (e) { if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") < 0) return; e.preventDefault(); $("dr-drop").classList.add("dr-over"); }); });
	root.addEventListener("dragleave", function (e) { if (e.target === root || !root.contains(e.relatedTarget)) $("dr-drop").classList.remove("dr-over"); });
	root.addEventListener("drop", function (e) { if (!e.dataTransfer) return; e.preventDefault(); $("dr-drop").classList.remove("dr-over"); dropItems(e.dataTransfer); });
	/* panel grips */
	function grip(el, side) {
		el.addEventListener("dblclick", function () { prefs.hide[side] = true; savePrefs(); applyLayout(); requestRender(); toast("Panel hidden: bring it back with the " + (side === "l" ? "◧" : "◨") + " button.", 2500); });
		el.addEventListener("pointerdown", function (e) { cap(el, e); var x0 = e.clientX, w0 = $(side === "l" ? "dr-left" : "dr-right").offsetWidth; function mv(ev) { var w = clamp(side === "l" ? w0 + ev.clientX - x0 : w0 - (ev.clientX - x0), 170, 520); prefs[side + "w"] = w; root.style.setProperty("--dr-" + side + "w", w + "px"); requestRender(); } function up() { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); savePrefs(); scheduleHist(); } el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); });
	}
	grip($("dr-lgrip"), "l"); grip($("dr-rgrip"), "r");
	window.addEventListener("resize", debounce(function () { requestRender(); if (mod === "library") loadVisible(); }, 60));
	if (window.ResizeObserver) new ResizeObserver(function () { requestRender(); }).observe($("dr-stage"));

	/* ---------------- keyboard ---------------- */
	function helpDlg() {
		var rows = [["G", "Library grid"], ["D", "Develop"], ["← →", "Previous / next photo"], ["0–5", "Stars"], ["P X U", "Pick, reject, unflag"], ["6 7 8 9", "Red, yellow, green, blue label"], ["B", "Add to / remove from the Quick collection"], ["\\", "Before / after"], ["Y", "Before | after side by side"], ["J", "Show clipping"], ["Z or Space", "Zoom 100% / fit (Space + drag pans)"], ["R Q M W", "Crop, heal, masks, white-balance picker"], ["Shift+A", "Auto tone"], ["O", "Show the selected mask"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["Ctrl+Shift+C / V", "Copy / paste settings"], ["Ctrl+A", "Select all"], ["Ctrl+Shift+E", "Export"], ["F / Shift+F", "Fill window / full screen"], ["Esc", "Leave the tool, close the window"]];
		modal('<h3>Keyboard shortcuts</h3><table>' + rows.map(function (r) { return "<tr><td><kbd>" + esc(r[0]) + "</kbd></td><td>" + esc(r[1]) + "</td></tr>"; }).join("") + '</table><p class="dr-note">On a Mac, Ctrl is Cmd.</p><div class="dr-acts"><button type="button" class="dr-b dr-b--pri" data-a="ok">Close</button></div>', function (d, close) { d.querySelector("[data-a=ok]").onclick = close; });
	}
	document.addEventListener("keydown", function (e) {
		if (!photos.length && e.key !== "Escape") return; if (!root.offsetParent && !root.classList.contains("dr-win")) return;
		var t = e.target, typing = t && (t.tagName === "INPUT" && !/range|checkbox|radio|button/.test(t.type) || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
		if (e.key === "Escape") { if (modalClose && !$("dr-modal")._busy) { modalClose(); e.preventDefault(); return; } if (dev && (dev.tool || newMask)) { newMask = null; if (dev.tool === "crop") commitCrop(); setTool(null); e.preventDefault(); return; } if (root.classList.contains("dr-win")) { setWin(false); return; } return; }
		if (typing || modalClose) return;
		var r = root.getBoundingClientRect(); if (!root.classList.contains("dr-win") && (r.bottom < 0 || r.top > window.innerHeight)) return;
		var k = e.key, ctrl = e.ctrlKey || e.metaKey, used = true;
		if (ctrl && e.shiftKey && (k === "C" || k === "c")) copySettings();
		else if (ctrl && e.shiftKey && (k === "V" || k === "v")) pasteSettings(selected());
		else if (ctrl && e.shiftKey && (k === "E" || k === "e")) exportDlg();
		else if (ctrl && !e.shiftKey && (k === "z" || k === "Z")) undo();
		else if (ctrl && ((e.shiftKey && (k === "z" || k === "Z")) || k === "y")) redo();
		else if (ctrl && (k === "a" || k === "A")) selectAll();
		else if (ctrl) used = false;
		else if (k === "g" || k === "G" || (k === "e" && mod === "develop")) setMod("library");
		else if (k === "d" || k === "D") setMod("develop");
		else if (k === "ArrowRight") { if (mod === "library") moveGrid(1, e); else step(1); }
		else if (k === "ArrowLeft") { if (mod === "library") moveGrid(-1, e); else step(-1); }
		else if ((k === "ArrowDown" || k === "ArrowUp") && mod === "library") moveGrid((k === "ArrowDown" ? 1 : -1) * gridCols(), e);
		else if (k === "Enter" && mod === "library") setMod("develop");
		else if (k === "Enter" && dev && dev.tool === "crop") setTool(null);
		else if (/^[0-5]$/.test(k)) setRating(+k);
		else if (/^[6-9]$/.test(k)) { var lb = +k - 5; var p0 = curPhoto(); setLabel(p0 && (recOf(p0) || {}).label === lb ? 0 : lb); }
		else if (k === "p" || k === "P") setFlag(1); else if (k === "x" || k === "X") setFlag(-1); else if (k === "u" || k === "U") setFlag(0);
		else if (k === "b" || k === "B") toggleQuick(selected());
		else if (k === "f") setWin(!root.classList.contains("dr-win"));
		else if (k === "F") $("dr-fs").click();
		else if (k === "?") helpDlg();
		else if (mod === "develop" && dev) {
			if (k === "\\") devTbarAction("before"); else if (k === "y" || k === "Y") devTbarAction("split"); else if (k === "j" || k === "J") devTbarAction("clip");
			else if (k === "z" || k === "Z") { if (dev.view.z && VI && dev.view.z > VI.fit * 1.01) { dev.view.z = 0; requestRender(); } else zoomTo(1 / dprv()); }
			else if (k === " ") { e.preventDefault(); if (!spaceDown) { spaceDown = true; spaceUsed = false; } return; }
			else if (k === "r" || k === "R") setTool(dev.tool === "crop" ? null : "crop"); else if (k === "q" || k === "Q") setTool(dev.tool === "heal" ? null : "heal"); else if (k === "m" || k === "M") setTool(dev.tool === "mask" ? null : "mask"); else if (k === "w" || k === "W") setTool(dev.tool === "wb" ? null : "wb");
			else if (k === "A") doAuto();
			else if (k === "o" || k === "O") { dev.showMask = !dev.showMask; requestRender(); renderDevelopPanels(); }
			else if ((k === "Delete" || k === "Backspace") && dev.tool === "heal" && dev.selSpot >= 0) { dev.s.spots.splice(dev.selSpot, 1); dev.selSpot = -1; live(); commit("Remove spot"); renderDevelopPanels(); }
			else if ((k === "Delete" || k === "Backspace") && dev.tool === "mask" && dev.selMask) { var i = dev.s.locals.findIndex(function (l) { return l.id === dev.selMask; }); if (i >= 0) { dev.s.locals.splice(i, 1); dev.selMask = dev.s.locals[0] ? dev.s.locals[0].id : null; setMasksFor(eng, dev.s, dev.maskCv); live(); commit("Delete mask"); renderDevelopPanels(); } }
			else used = false;
		} else used = false;
		if (used) e.preventDefault();
	});
	var spaceUsed = false;
	document.addEventListener("keyup", function (e) { if (e.key === " " && spaceDown) { spaceDown = false; if (!drag && dev && mod === "develop") { if (dev.view.z && VI && dev.view.z > VI.fit * 1.01) { dev.view.z = 0; requestRender(); } else zoomTo(1 / dprv()); } } });
	function gridCols() { var g = $("dr-grid"), c = g.querySelector(".dr-cell"); if (!c) return 1; return Math.max(1, Math.round(g.clientWidth / (c.offsetWidth + 8))); }
	function moveGrid(d, e) { var i = clamp(cur + d, 0, view.length - 1); if (e.shiftKey) { sel.add(view[i].key); setCur(i, true); } else setCur(i); }

	/* ---------------- start ---------------- */
	async function reopen() { var dh = await DB.get("kv", "dir"); if (!dh) return; try { var perm = await dh.requestPermission({ mode: prefs.side ? "readwrite" : "read" }); if (perm !== "granted") return; openFolder(dh); } catch (e) { toast("Could not open it again: " + e.message, 3000); } }
	async function init() {
		applyLayout(); $("dr-how").innerHTML = howText(); showStart();
		var all = await DB.all("rec"); all.forEach(function (r) { if (r && r.key) { if (r.s) r.s = D.normalize(r.s); recs[r.key] = r; } });
		userPresets = (await DB.get("kv", "presets")) || []; colls = (await DB.get("kv", "colls")) || [];
		var dh = await DB.get("kv", "dir"); if (dh && dh.name) { var b = $("dr-reopen"); b.hidden = false; b.textContent = "↩ Open " + dh.name + " again"; }
		if (window.MESImg && MESImg.handoffReceive) { var fs = await MESImg.handoffReceive(); if (fs && fs.length) { await addFiles(fs.map(function (f) { return f instanceof File ? f : new File([f.blob || f], f.name || "photo.png", { type: (f.blob || f).type }); }), true); } }
		if (/[?&]sample=1/.test(location.search)) loadSamples();
	}
	window.MESDarkroomDebug = { get dev() { return dev; }, get photos() { return photos; }, get eng() { return eng; }, setMod: setMod, render: draw, openFolder: openFolder, addFiles: addFiles, recs: function () { return recs; }, setTool: setTool };
	init();
})();
