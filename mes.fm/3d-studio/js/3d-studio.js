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

/* MES 3D Studio: pure maths (no three.js, no DOM). Runs in the browser (window.MES3D) and in node (require).
 * Units are millimetres, Z is up. A "triangle soup" is a Float32Array of x,y,z for 3 vertices per triangle.
 * Tests: node tool_apps_src/3d-studio-tests.js */
(function (root) {
	'use strict';

	// ---------- build plates (mm, x = width, y = depth, z = height) ----------
	var PLATES = [
		{ id: 'ender3', name: 'Creality Ender 3 / V2 / Pro', x: 220, y: 220, z: 250 },
		{ id: 'ender3v3', name: 'Creality Ender 3 V3 / SE / KE', x: 220, y: 220, z: 250 },
		{ id: 'k1', name: 'Creality K1 / K1C', x: 220, y: 220, z: 250 },
		{ id: 'mk4', name: 'Prusa MK4 / MK4S / MK3S', x: 250, y: 210, z: 220 },
		{ id: 'mini', name: 'Prusa MINI', x: 180, y: 180, z: 180 },
		{ id: 'xl', name: 'Prusa XL', x: 360, y: 360, z: 360 },
		{ id: 'a1', name: 'Bambu Lab A1', x: 256, y: 256, z: 256 },
		{ id: 'a1mini', name: 'Bambu Lab A1 mini', x: 180, y: 180, z: 180 },
		{ id: 'x1', name: 'Bambu Lab X1 / P1S / P1P', x: 256, y: 256, z: 256 },
		{ id: 'neptune4', name: 'Elegoo Neptune 4 / 4 Pro', x: 225, y: 225, z: 265 },
		{ id: 'mars', name: 'Elegoo Mars 4 (resin)', x: 153, y: 77, z: 175 },
		{ id: 'custom', name: 'Custom size', x: 200, y: 200, z: 200 }
	];
	function plateById(id, custom) {
		for (var i = 0; i < PLATES.length; i++) if (PLATES[i].id === id) {
			if (id === 'custom' && custom) return { id: 'custom', name: 'Custom size', x: +custom.x || 200, y: +custom.y || 200, z: +custom.z || 200 };
			return PLATES[i];
		}
		return PLATES[0];
	}

	// ---------- filament materials (density g/cm³, typical price per kg in your currency) ----------
	var MATERIALS = [
		{ id: 'pla', name: 'PLA', density: 1.24, price: 22 },
		{ id: 'petg', name: 'PETG', density: 1.27, price: 24 },
		{ id: 'abs', name: 'ABS', density: 1.04, price: 22 },
		{ id: 'asa', name: 'ASA', density: 1.07, price: 28 },
		{ id: 'tpu', name: 'TPU (flexible)', density: 1.21, price: 32 },
		{ id: 'nylon', name: 'Nylon (PA)', density: 1.14, price: 40 },
		{ id: 'pc', name: 'Polycarbonate', density: 1.20, price: 38 },
		{ id: 'resin', name: 'Standard resin', density: 1.12, price: 30, resin: true }
	];
	function materialById(id) { for (var i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].id === id) return MATERIALS[i]; return MATERIALS[0]; }

	// ---------- lengths ----------
	var UNITS = { mm: 1, cm: 10, m: 1000, 'in': 25.4, '"': 25.4, inch: 25.4, inches: 25.4, ft: 304.8, "'": 304.8 };
	// "20", "2 cm", "1in", '1"', "1/2 in", "10*2 + 5", "-3.5mm", "1,5" (decimal comma). Returns mm, or NaN.
	function parseLength(str, unit) {
		var base = UNITS[unit] || 1;
		var s = String(str == null ? '' : str).trim().toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ')
			.replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g, function (m, a, b) { return String(+a / +b); });
		if (!s) return NaN;
		var i = 0;
		function ws() { while (s[i] === ' ') i++; }
		function num() {
			ws();
			var m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
			if (!m) return NaN;
			i += m[0].length;
			var v = parseFloat(m[0]);
			ws();
			var u = /^(mm|cm|inches|inch|in|ft|m(?![a-z])|"|')/.exec(s.slice(i));
			if (u) { i += u[0].length; return v * UNITS[u[0]]; }
			return { raw: v };
		}
		function factor() {
			ws();
			if (s[i] === '-') { i++; var f = factor(); return neg(f); }
			if (s[i] === '+') { i++; return factor(); }
			if (s[i] === '(') { i++; var v = expr(); ws(); if (s[i] !== ')') return NaN; i++; return v; }
			return num();
		}
		function neg(v) { return typeof v === 'object' ? { raw: -v.raw } : -v; }
		function val(v) { return typeof v === 'object' ? v.raw * base : v; }
		function term() {
			var a = factor();
			for (;;) {
				ws();
				var op = s[i];
				if (op !== '*' && op !== '/' && op !== 'x' && op !== '×') return a;
				i++;
				var b = factor();
				// a number times a unitless number keeps the unit of the first ("1/2 in" -> (1/2) in handled below)
				var bv = typeof b === 'object' ? b.raw : b / base;
				if (typeof a === 'object') a = op === '/' ? { raw: a.raw / bv } : { raw: a.raw * bv };
				else a = op === '/' ? a / bv : a * bv;
			}
		}
		function expr() {
			var a = term();
			for (;;) {
				ws();
				var op = s[i];
				if (op !== '+' && op !== '-') return a;
				i++;
				var b = term();
				if (typeof a === 'object' && typeof b === 'object') a = { raw: op === '+' ? a.raw + b.raw : a.raw - b.raw };
				else a = op === '+' ? val(a) + val(b) : val(a) - val(b);
			}
		}
		var r = expr();
		ws();
		if (i < s.length) {
			// a trailing unit after an expression: "1/2 in", "(10+5) cm"
			var u = /^(mm|cm|inches|inch|in|ft|m|"|')$/.exec(s.slice(i).trim());
			if (u && typeof r === 'object') return r.raw * UNITS[u[1]];
			return NaN;
		}
		var out = val(r);
		return isFinite(out) ? out : NaN;
	}
	function fmtLength(mm, unit, digits) {
		if (!isFinite(mm)) return '–';
		var d = digits == null ? 2 : digits;
		if (unit === 'in') return trim((mm / 25.4).toFixed(d + 1)) + ' in';
		if (unit === 'cm') return trim((mm / 10).toFixed(d)) + ' cm';
		return trim(mm.toFixed(d)) + ' mm';
	}
	function trim(s) { return s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, ''); }
	function fmtNum(v, d) { return isFinite(v) ? trim(v.toFixed(d == null ? 2 : d)) : '–'; }
	function snap(v, step) { if (!step) return v; return Math.round(v / step) * step; }

	// ---------- triangle soups ----------
	function bboxOf(pos) {
		var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
		for (var i = 0; i < pos.length; i += 3) for (var k = 0; k < 3; k++) { var v = pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
		return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
	}
	// signed volume (positive when the triangles face outwards) and surface area
	function volumeArea(pos) {
		var v = 0, a = 0;
		for (var i = 0; i + 8 < pos.length; i += 9) {
			var ax = pos[i], ay = pos[i + 1], az = pos[i + 2], bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5], cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
			v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
			var ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
			var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
			a += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
		}
		return { volume: v / 6, area: a };
	}
	// reverse every triangle (inside-out fix), in place
	function flipWinding(pos) {
		for (var i = 0; i + 8 < pos.length; i += 9) for (var k = 0; k < 3; k++) { var t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
		return pos;
	}
	// weld vertices that are closer than tol (grid hashing), returns { index: Uint32Array (3 per triangle), verts: Float64Array }
	function weld(pos, tol) {
		var t = tol || 1e-4, inv = 1 / t, map = new Map(), verts = [], index = new Uint32Array(pos.length / 3);
		for (var i = 0, n = 0; i < pos.length; i += 3, n++) {
			var kx = Math.round(pos[i] * inv), ky = Math.round(pos[i + 1] * inv), kz = Math.round(pos[i + 2] * inv);
			var key = kx + ',' + ky + ',' + kz, id = map.get(key);
			if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(pos[i], pos[i + 1], pos[i + 2]); }
			index[n] = id;
		}
		return { index: index, verts: new Float64Array(verts) };
	}
	/* Is the mesh closed ("watertight") so a slicer can fill it?
	 * Every edge of a closed, consistently oriented surface is used by exactly two triangles, once in each direction.
	 * boundary = edges with one triangle (holes in the surface), nonManifold = edges with 3 or more,
	 * flipped = edges used twice in the same direction (a triangle facing the wrong way), shells = connected pieces. */
	function manifoldCheck(pos, tol) {
		var w = weld(pos, tol), idx = w.index, nv = w.verts.length / 3;
		var edges = new Map(), tris = 0, degenerate = 0;
		var parent = new Int32Array(nv); for (var p = 0; p < nv; p++) parent[p] = p;
		function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
		function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
		function add(a, b) {
			var lo = a < b ? a : b, hi = a < b ? b : a, key = lo * 4294967296 + hi, e = edges.get(key);
			if (!e) { e = [0, 0]; edges.set(key, e); }
			if (a < b) e[0]++; else e[1]++;
		}
		for (var i = 0; i < idx.length; i += 3) {
			var a = idx[i], b = idx[i + 1], c = idx[i + 2];
			if (a === b || b === c || a === c) { degenerate++; continue; }
			tris++;
			add(a, b); add(b, c); add(c, a);
			union(a, b); union(b, c);
		}
		var boundary = 0, nonManifold = 0, flipped = 0, open = [];
		edges.forEach(function (e, key) {
			var n = e[0] + e[1];
			if (n === 1) { boundary++; var lo = Math.floor(key / 4294967296), hi = key - lo * 4294967296; open.push(e[0] ? [lo, hi] : [hi, lo]); }
			else if (n > 2) nonManifold++;
			else if (e[0] !== 1) flipped++;
		});
		var seams = open.length ? seamCover(open, w.verts, tol) : { gaps: 0, gapLength: 0 };
		var roots = new Set();
		for (var j = 0; j < idx.length; j += 3) {
			if (idx[j] === idx[j + 1] || idx[j + 1] === idx[j + 2] || idx[j] === idx[j + 2]) continue;
			roots.add(find(idx[j]));
		}
		return { triangles: tris, vertices: nv, edges: edges.size, boundary: boundary, nonManifold: nonManifold, flipped: flipped, degenerate: degenerate, shells: roots.size,
			tjunctions: boundary - seams.gaps, gaps: seams.gaps, gapLength: seams.gapLength,
			closed: tris > 0 && seams.gaps === 0 && nonManifold === 0 && flipped === 0 };
	}
	/* Boolean (CSG) results often have "T-junctions": a long edge on one side of a seam meets two or more shorter edges on the
	 * other side. Every one of those edges is used by one triangle only, yet the surface has no gap. This checks each straight
	 * line of open edges: the edges running one way must cover exactly the same stretch as the edges running the other way.
	 * open = directed edges [from, to] (vertex indices), verts = welded positions. Returns how many open edges are real gaps. */
	function seamCover(open, verts, tol) {
		var E = [], lens = [];
		open.forEach(function (e) {
			var a = [verts[e[0] * 3], verts[e[0] * 3 + 1], verts[e[0] * 3 + 2]], b = [verts[e[1] * 3], verts[e[1] * 3 + 1], verts[e[1] * 3 + 2]];
			var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
			if (l) { E.push({ a: a, b: b, d: [d[0] / l, d[1] / l, d[2] / l], l: l }); lens.push(l); }
		});
		lens.sort(function (x, y) { return x - y; });
		var cell = Math.min(5, Math.max(0.25, lens[lens.length >> 1] || 1)), grid = new Map(), near = Math.max(1e-3, (tol || 1e-4) * 10);
		function k(x, y, z) { return x + ',' + y + ',' + z; }
		E.forEach(function (e, i) {
			var lo = [0, 1, 2].map(function (j) { return Math.floor((Math.min(e.a[j], e.b[j]) - near) / cell); }), hi = [0, 1, 2].map(function (j) { return Math.floor((Math.max(e.a[j], e.b[j]) + near) / cell); });
			var n = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
			if (n > 4000) { var keyL = 'L'; if (!grid.has(keyL)) grid.set(keyL, []); grid.get(keyL).push(i); return; }   // very long edge: checked against everything
			for (var x = lo[0]; x <= hi[0]; x++) for (var y = lo[1]; y <= hi[1]; y++) for (var z = lo[2]; z <= hi[2]; z++) { var kk = k(x, y, z), c = grid.get(kk); if (!c) { c = []; grid.set(kk, c); } c.push(i); }
		});
		var longs = grid.get('L') || [];
		function onSeg(p, f) {
			var t = (p[0] - f.a[0]) * f.d[0] + (p[1] - f.a[1]) * f.d[1] + (p[2] - f.a[2]) * f.d[2];
			if (t < -near || t > f.l + near) return false;
			var qx = f.a[0] + f.d[0] * t - p[0], qy = f.a[1] + f.d[1] * t - p[1], qz = f.a[2] + f.d[2] * t - p[2];
			return qx * qx + qy * qy + qz * qz < near * near;
		}
		var gaps = 0, gapLength = 0;
		E.forEach(function (e, i) {
			var covered = [0.15, 0.5, 0.85].every(function (t) {
				var p = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t, e.a[2] + (e.b[2] - e.a[2]) * t];
				var cand = (grid.get(k(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell))) || []).concat(longs);
				return cand.some(function (j) { if (j === i) return false; var f = E[j]; return e.d[0] * f.d[0] + e.d[1] * f.d[1] + e.d[2] * f.d[2] < -0.995 && onSeg(p, f); });
			});
			if (!covered) { gaps++; gapLength += e.l; }
		});
		return { gaps: gaps, gapLength: gapLength };
	}
	/* Faces that point down more steeply than `maxAngle` degrees from vertical need supports when printed (45° is the usual rule).
	 * Faces lying on the floor (all three corners within floorTol of floorZ) are the first layer, not an overhang. */
	function overhang(pos, maxAngle, floorZ, floorTol) {
		var lim = Math.cos((90 - (maxAngle == null ? 45 : maxAngle)) * Math.PI / 180), fz = floorZ || 0, ft = floorTol == null ? 0.05 : floorTol;
		var nt = Math.floor(pos.length / 9), flags = new Uint8Array(nt), area = 0, total = 0;
		for (var t = 0, i = 0; t < nt; t++, i += 9) {
			var ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2], wx = pos[i + 6] - pos[i], wy = pos[i + 7] - pos[i + 1], wz = pos[i + 8] - pos[i + 2];
			var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
			if (!len) continue;
			total += len / 2;
			if (-nz / len > lim) {
				var onFloor = pos[i + 2] - fz < ft && pos[i + 5] - fz < ft && pos[i + 8] - fz < ft;
				if (!onFloor) { flags[t] = 1; area += len / 2; }
			}
		}
		return { flags: flags, area: area, total: total, fraction: total ? area / total : 0 };
	}
	// does a bounding box (min/max) fit the plate centred on the origin (x, y in -W/2..W/2) and the build height?
	function plateFit(bb, plate, margin) {
		var m = margin || 0, hx = plate.x / 2 - m, hy = plate.y / 2 - m;
		var over = {
			left: Math.max(0, -hx - bb.min[0]), right: Math.max(0, bb.max[0] - hx),
			front: Math.max(0, -hy - bb.min[1]), back: Math.max(0, bb.max[1] - hy),
			top: Math.max(0, bb.max[2] - plate.z), below: Math.max(0, -bb.min[2])
		};
		var sx = bb.max[0] - bb.min[0], sy = bb.max[1] - bb.min[1], sz = bb.max[2] - bb.min[2];
		var fitsSize = sx <= plate.x - 2 * m + 1e-6 && sy <= plate.y - 2 * m + 1e-6 && sz <= plate.z + 1e-6;
		var rotated = !fitsSize && sy <= plate.x - 2 * m + 1e-6 && sx <= plate.y - 2 * m + 1e-6 && sz <= plate.z + 1e-6;
		var inside = over.left + over.right + over.front + over.back + over.top < 1e-6;
		return { fits: inside && over.below < 1e-3, inside: inside, fitsSize: fitsSize, fitsIfTurned: rotated, floating: bb.min[2] > 0.01, below: over.below > 1e-3, over: over };
	}
	/* Filament estimate. volume, area in mm³ / mm². The outside shell (walls + top/bottom) is solid: about area × wall,
	 * the rest is filled at the infill percentage. Returns used plastic volume, grams, metres of filament and cost. */
	function filament(va, opt) {
		var o = opt || {}, mat = materialById(o.material), vol = Math.max(0, va.volume), area = Math.max(0, va.area);
		var wall = o.wall == null ? 0.8 : o.wall, infill = (o.infill == null ? 15 : o.infill) / 100;
		var shell = Math.min(vol, area * wall), used = mat.resin ? vol : shell + (vol - shell) * infill;
		var d = o.diameter || 1.75, grams = used / 1000 * mat.density;
		var metres = mat.resin ? 0 : used / (Math.PI * d * d / 4) / 1000;
		var price = o.price == null ? mat.price : o.price;
		var flow = o.flow || 8;           // mm³ per second the printer really pushes on average
		var hours = used / (flow * 0.55) / 3600;
		return { used: used, shell: shell, grams: grams, metres: metres, cost: grams / 1000 * price, hours: hours, material: mat };
	}

	// ---------- 2D shapes (counter-clockwise point lists in mm) ----------
	function polyArea(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
	function ccw(pts) { return polyArea(pts) < 0 ? pts.slice().reverse() : pts.slice(); }
	function circlePts(r, n, cx, cy) { var o = [], k = n || 48; for (var i = 0; i < k; i++) { var a = i / k * Math.PI * 2; o.push([(cx || 0) + r * Math.cos(a), (cy || 0) + r * Math.sin(a)]); } return o; }
	function roundedRect(w, h, r, seg) {
		var rr = Math.max(0, Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6)), s = seg || 8, o = [], cs = [[w / 2 - rr, h / 2 - rr, 0], [-w / 2 + rr, h / 2 - rr, 90], [-w / 2 + rr, -h / 2 + rr, 180], [w / 2 - rr, -h / 2 + rr, 270]];
		if (rr < 1e-6) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
		cs.forEach(function (c) { for (var i = 0; i <= s; i++) { var a = (c[2] + i / s * 90) * Math.PI / 180; o.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]); } });
		return o;
	}
	function starPts(points, rOut, rIn) { var o = [], n = Math.max(3, points | 0); for (var i = 0; i < n * 2; i++) { var a = Math.PI / 2 + i / (n * 2) * Math.PI * 2, r = i % 2 ? rIn : rOut; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
	function heartPts(size, n) {
		var o = [], k = n || 72;
		for (var i = 0; i < k; i++) { var t = i / k * Math.PI * 2; o.push([16 * Math.pow(Math.sin(t), 3), 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]); }
		var bb = bounds2(o), s = size / Math.max(bb.w, bb.h), cx = (bb.minx + bb.maxx) / 2, cy = (bb.miny + bb.maxy) / 2;
		return ccw(o.map(function (p) { return [(p[0] - cx) * s, (p[1] - cy) * s]; }));
	}
	function polygonPts(sides, r) { var o = [], n = Math.max(3, sides | 0); for (var i = 0; i < n; i++) { var a = Math.PI / 2 + i / n * Math.PI * 2; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
	// spur gear outline with trapezoid teeth: module m (tooth size), z teeth. Pitch radius = m z / 2, tip = +m, root = -1.25 m.
	function gearPts(teeth, mod) {
		var z = Math.max(6, teeth | 0), m = mod || 2, rp = m * z / 2, ra = rp + m, rf = Math.max(m, rp - 1.25 * m), o = [];
		for (var i = 0; i < z; i++) {
			var a0 = i / z * Math.PI * 2, step = Math.PI * 2 / z;
			var f = [[0, rf], [0.18, rf], [0.30, ra], [0.50, ra], [0.62, rf], [0.82, rf]];
			for (var k = 0; k < f.length; k++) { var a = a0 + f[k][0] * step; o.push([f[k][1] * Math.cos(a), f[k][1] * Math.sin(a)]); }
		}
		return { pts: o, pitch: rp, tip: ra, root: rf };
	}
	function bounds2(pts) { var b = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity }; pts.forEach(function (p) { if (p[0] < b.minx) b.minx = p[0]; if (p[0] > b.maxx) b.maxx = p[0]; if (p[1] < b.miny) b.miny = p[1]; if (p[1] > b.maxy) b.maxy = p[1]; }); b.w = b.maxx - b.minx; b.h = b.maxy - b.miny; return b; }
	// move every corner of a counter-clockwise polygon outwards by d (inwards when d < 0); simple miter offset, fine for smooth outlines
	function offsetPolygon(pts, d) {
		var p = ccw(pts), n = p.length, o = [];
		for (var i = 0; i < n; i++) {
			var a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
			var e1 = norm2([b[0] - a[0], b[1] - a[1]]), e2 = norm2([c[0] - b[0], c[1] - b[1]]);
			var n1 = [e1[1], -e1[0]], n2 = [e2[1], -e2[0]], m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
			var cos = m[0] * n1[0] + m[1] * n1[1], k = d / Math.max(0.3, cos);
			o.push([b[0] + m[0] * k, b[1] + m[1] * k]);
		}
		return o;
	}
	function norm2(v) { var l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
	// a lathe profile (r, z) must stay on the right of the axis
	function cleanProfile(pts) { return pts.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }).map(function (p) { return [Math.max(0, +p[0]), +p[1]]; }); }

	// ---------- 3MF (the 3D-printing format with units and colours) ----------
	function hex6(c) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); return m ? '#' + m[1].toUpperCase() : '#9CA3AF'; }
	function xmlEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
	function n6(v) { return trim(v.toFixed(5)); }
	/* objects: [{name, positions (triangle soup, mm), color '#rrggbb'}] -> the 3D/3dmodel.model XML */
	function threeMFModel(objects, title) {
		var mats = [], matIndex = {};
		objects.forEach(function (o) { var c = hex6(o.color); if (matIndex[c] == null) { matIndex[c] = mats.length; mats.push(c); } });
		var out = ['<?xml version="1.0" encoding="UTF-8"?>',
			'<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
			' <metadata name="Title">' + xmlEsc(title || 'MES 3D Studio model') + '</metadata>',
			' <metadata name="Application">MES 3D Studio (mes.fm/3d-studio)</metadata>',
			' <resources>',
			'  <basematerials id="1">' + mats.map(function (c, i) { return '<base name="Colour ' + (i + 1) + '" displaycolor="' + c + '" />'; }).join('') + '</basematerials>'];
		var ids = [];
		objects.forEach(function (o, k) {
			var w = weld(o.positions, 1e-5), id = k + 2, v = w.verts, idx = w.index, vs = [], ts = [];
			ids.push(id);
			for (var i = 0; i < v.length; i += 3) vs.push('<vertex x="' + n6(v[i]) + '" y="' + n6(v[i + 1]) + '" z="' + n6(v[i + 2]) + '" />');
			for (var j = 0; j < idx.length; j += 3) { if (idx[j] === idx[j + 1] || idx[j + 1] === idx[j + 2] || idx[j] === idx[j + 2]) continue; ts.push('<triangle v1="' + idx[j] + '" v2="' + idx[j + 1] + '" v3="' + idx[j + 2] + '" />'); }
			out.push('  <object id="' + id + '" name="' + xmlEsc(o.name || ('Part ' + (k + 1))) + '" type="model" pid="1" pindex="' + matIndex[hex6(o.color)] + '">',
				'   <mesh><vertices>' + vs.join('') + '</vertices><triangles>' + ts.join('') + '</triangles></mesh>', '  </object>');
		});
		out.push(' </resources>', ' <build>' + ids.map(function (id) { return '<item objectid="' + id + '" />'; }).join('') + '</build>', '</model>');
		return out.join('\n');
	}
	var THREEMF_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>';
	var THREEMF_RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" /></Relationships>';

	// ---------- base64 for Float32Array (project files) ----------
	var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	function bytesToB64(u8) {
		var out = [], i = 0;
		for (; i + 2 < u8.length; i += 3) { var n = u8[i] << 16 | u8[i + 1] << 8 | u8[i + 2]; out.push(B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]); }
		if (i < u8.length) { var m = u8[i] << 16 | (i + 1 < u8.length ? u8[i + 1] << 8 : 0); out.push(B64[m >> 18 & 63] + B64[m >> 12 & 63] + (i + 1 < u8.length ? B64[m >> 6 & 63] : '=') + '='); }
		return out.join('');
	}
	function b64ToBytes(s) {
		var str = String(s).replace(/[^A-Za-z0-9+/]/g, ''), len = Math.floor(str.length * 3 / 4), out = new Uint8Array(len), j = 0, lut = {};
		for (var k = 0; k < 64; k++) lut[B64[k]] = k;
		for (var i = 0; i < str.length; i += 4) {
			var a = lut[str[i]], b = lut[str[i + 1]], c = lut[str[i + 2]], d = lut[str[i + 3]];
			var n = a << 18 | b << 12 | (c || 0) << 6 | (d || 0);
			if (j < len) out[j++] = n >> 16 & 255;
			if (c !== undefined && j < len) out[j++] = n >> 8 & 255;
			if (d !== undefined && j < len) out[j++] = n & 255;
		}
		return out;
	}
	function f32ToB64(f) { return bytesToB64(new Uint8Array(f.buffer, f.byteOffset, f.byteLength)); }
	function b64ToF32(s) { var b = b64ToBytes(s); var n = Math.floor(b.length / 4), copy = new Uint8Array(n * 4); copy.set(b.subarray(0, n * 4)); return new Float32Array(copy.buffer); }

	// ---------- arranging ----------
	// align boxes [{min, max}] on axis k (0 x, 1 y, 2 z) to 'min' | 'mid' | 'max' of their combined box; returns the shift for each
	function alignShifts(boxes, k, how) {
		var lo = Infinity, hi = -Infinity;
		boxes.forEach(function (b) { lo = Math.min(lo, b.min[k]); hi = Math.max(hi, b.max[k]); });
		return boxes.map(function (b) {
			if (how === 'min') return lo - b.min[k];
			if (how === 'max') return hi - b.max[k];
			return (lo + hi) / 2 - (b.min[k] + b.max[k]) / 2;
		});
	}
	// spread the centres evenly between the first and last (sorted along the axis); returns shifts in the original order
	function distributeShifts(boxes, k) {
		var c = boxes.map(function (b, i) { return { i: i, c: (b.min[k] + b.max[k]) / 2 }; }).sort(function (a, b) { return a.c - b.c; });
		var out = boxes.map(function () { return 0; });
		if (c.length < 3) return out;
		var a = c[0].c, b = c[c.length - 1].c;
		c.forEach(function (e, j) { out[e.i] = a + (b - a) * j / (c.length - 1) - e.c; });
		return out;
	}

	// ---------- project files ----------
	var TYPES = ['box', 'plate', 'sphere', 'cylinder', 'cone', 'pyramid', 'wedge', 'torus', 'tube', 'star', 'heart', 'polygon', 'gear', 'text', 'lathe', 'extrude', 'mesh', 'group'];
	function validObj(o, depth) {
		if (!o || typeof o !== 'object' || (depth || 0) > 24) return false;
		if (TYPES.indexOf(o.type) < 0) return false;
		var v3 = function (a) { return Array.isArray(a) && a.length === 3 && a.every(function (x) { return typeof x === 'number' && isFinite(x); }); };
		if (!v3(o.pos) || !v3(o.rot) || !v3(o.scl)) return false;
		if (o.type === 'group') return Array.isArray(o.children) && o.children.length > 0 && o.children.every(function (c) { return validObj(c, (depth || 0) + 1); });
		return true;
	}
	function validProject(p) { return !!(p && p.app === 'mes-3d-studio' && Array.isArray(p.objs) && p.objs.every(function (o) { return validObj(o, 0); })); }
	function safeName(s, fallback) { var n = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); return n || fallback || 'model'; }


	// ---------- picture -> 3D relief (heights on a grid of cells, used by "Photo to 3D") ----------
	// Box-filter / bilinear resample of a w x h float grid to nw x nh.
	function resampleGrid(a, w, h, nw, nh) {
		var o = new Float32Array(nw * nh), sx = w / nw, sy = h / nh;
		for (var j = 0; j < nh; j++) for (var i = 0; i < nw; i++) {
			if (sx > 1 || sy > 1) { // shrink: average the source pixels under the cell
				var x0 = Math.floor(i * sx), x1 = Math.max(x0 + 1, Math.floor((i + 1) * sx)), y0 = Math.floor(j * sy), y1 = Math.max(y0 + 1, Math.floor((j + 1) * sy)), t = 0, c = 0;
				for (var y = y0; y < y1 && y < h; y++) for (var x = x0; x < x1 && x < w; x++) { t += a[y * w + x]; c++; }
				o[j * nw + i] = c ? t / c : 0;
			} else { // grow: bilinear
				var fx = Math.min(w - 1, Math.max(0, (i + 0.5) * sx - 0.5)), fy = Math.min(h - 1, Math.max(0, (j + 0.5) * sy - 0.5)), ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy, ix2 = Math.min(w - 1, ix + 1), iy2 = Math.min(h - 1, iy + 1);
				o[j * nw + i] = (a[iy * w + ix] * (1 - ax) + a[iy * w + ix2] * ax) * (1 - ay) + (a[iy2 * w + ix] * (1 - ax) + a[iy2 * w + ix2] * ax) * ay;
			}
		}
		return o;
	}
	// Outline of the model: 'rect', 'circle' (largest circle in the middle), 'oval' (fills the picture) or 'subject' (alpha >= 0.5).
	function shapeMask(kind, w, h, alpha) {
		var m = new Uint8Array(w * h), cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
		for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
			var k = j * w + i, dx = i + 0.5 - cx, dy = j + 0.5 - cy;
			m[k] = kind === 'circle' ? (dx * dx + dy * dy <= r * r ? 1 : 0) : kind === 'oval' ? ((dx * dx) / (cx * cx) + (dy * dy) / (cy * cy) <= 1 ? 1 : 0) : kind === 'subject' ? (alpha && alpha[k] >= 0.5 ? 1 : 0) : 1;
		}
		return m;
	}
	function components(m, w, h, val) { // 4-connected pieces of cells equal to val -> {lab Int32Array, sizes[], touches[] (touches the grid edge)}
		var lab = new Int32Array(w * h).fill(-1), sizes = [], touches = [], st = new Int32Array(w * h);
		for (var s0 = 0; s0 < w * h; s0++) {
			if (m[s0] !== val || lab[s0] >= 0) continue;
			var id = sizes.length, n = 0, top = 0, edge = false; st[top++] = s0; lab[s0] = id;
			while (top) {
				var k = st[--top], x = k % w, y = (k - x) / w; n++;
				if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
				if (x > 0 && m[k - 1] === val && lab[k - 1] < 0) { lab[k - 1] = id; st[top++] = k - 1; }
				if (x < w - 1 && m[k + 1] === val && lab[k + 1] < 0) { lab[k + 1] = id; st[top++] = k + 1; }
				if (y > 0 && m[k - w] === val && lab[k - w] < 0) { lab[k - w] = id; st[top++] = k - w; }
				if (y < h - 1 && m[k + w] === val && lab[k + w] < 0) { lab[k + w] = id; st[top++] = k + w; }
			}
			sizes.push(n); touches.push(edge);
		}
		return { lab: lab, sizes: sizes, touches: touches };
	}
	// Makes a mask printable as one watertight solid: cells that only touch at a corner get joined (else edges would be shared by 4 faces),
	// optionally only the biggest piece is kept and holes smaller than opt.holes cells are filled. Returns a new Uint8Array.
	function cleanMask(mask, w, h, opt) {
		opt = opt || {}; var m = new Uint8Array(mask), i, k;
		if (opt.largest !== false) {
			var c = components(m, w, h, 1), best = -1, bn = 0;
			for (i = 0; i < c.sizes.length; i++) if (c.sizes[i] > bn) { bn = c.sizes[i]; best = i; }
			for (k = 0; k < m.length; k++) if (m[k] && c.lab[k] !== best) m[k] = 0;
		}
		if (opt.holes > 0) {
			var e = components(m, w, h, 0);
			for (k = 0; k < m.length; k++) if (!m[k] && !e.touches[e.lab[k]] && e.sizes[e.lab[k]] <= opt.holes) m[k] = 1;
		}
		for (var pass = 0; pass < 8; pass++) { // join corner-only contacts
			var changed = false;
			for (var y = 0; y < h - 1; y++) for (var x = 0; x < w - 1; x++) {
				var a = m[y * w + x], b = m[y * w + x + 1], cc = m[(y + 1) * w + x], d = m[(y + 1) * w + x + 1];
				if (a && d && !b && !cc) { m[y * w + x + 1] = 1; changed = true; }
				else if (b && cc && !a && !d) { m[y * w + x] = 1; changed = true; }
			}
			if (!changed) break;
		}
		return m;
	}
	function boxBlur(v, mask, w, h, passes) { // blur that only mixes cells inside the mask
		var a = new Float32Array(v), b = new Float32Array(v.length);
		for (var p = 0; p < passes; p++) {
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var k = y * w + x; if (mask && !mask[k]) { b[k] = a[k]; continue; }
				var t = 0, c = 0;
				for (var dy = -1; dy <= 1; dy++) { var yy = y + dy; if (yy < 0 || yy >= h) continue; for (var dx = -1; dx <= 1; dx++) { var xx = x + dx; if (xx < 0 || xx >= w) continue; var q = yy * w + xx; if (mask && !mask[q]) continue; t += a[q]; c++; } }
				b[k] = t / c;
			}
			var tmp = a; a = b; b = tmp;
		}
		return a;
	}
	// Raw values (depth or brightness) -> heights 0..1 inside the mask: percentile stretch (lo..hi %), smoothing, gamma, invert.
	function normHeights(v, mask, w, h, opt) {
		opt = opt || {}; var vals = [], k, n = w * h;
		var s = opt.blur > 0 ? boxBlur(v, mask, w, h, opt.blur | 0) : v;
		for (k = 0; k < n; k++) if (!mask || mask[k]) vals.push(s[k]);
		if (!vals.length) return new Float32Array(n);
		vals.sort(function (a, b) { return a - b; });
		var lo = vals[Math.floor((vals.length - 1) * (opt.lo == null ? 0.02 : opt.lo))], hi = vals[Math.floor((vals.length - 1) * (opt.hi == null ? 0.98 : opt.hi))], rg = hi - lo || 1, g = opt.gamma > 0 ? opt.gamma : 1, o = new Float32Array(n);
		for (k = 0; k < n; k++) { var t = Math.min(1, Math.max(0, (s[k] - lo) / rg)); if (opt.invert) t = 1 - t; o[k] = g === 1 ? t : Math.pow(t, g); }
		return o;
	}
	// Distance (in cells, 8-neighbour chamfer) from each inside cell to the nearest outside cell or the grid edge.
	function edgeDistance(mask, w, h) {
		var d = new Float32Array(w * h), INF = 1e9, x, y, k, D = Math.SQRT2;
		for (k = 0; k < d.length; k++) d[k] = mask[k] ? INF : 0;
		function g(xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : d[yy * w + xx]; }
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (!d[k]) continue; d[k] = Math.min(d[k], g(x - 1, y) + 1, g(x, y - 1) + 1, g(x - 1, y - 1) + D, g(x + 1, y - 1) + D); }
		for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) { k = y * w + x; if (!d[k]) continue; d[k] = Math.min(d[k], g(x + 1, y) + 1, g(x, y + 1) + 1, g(x + 1, y + 1) + D, g(x - 1, y + 1) + D); }
		return d;
	}
	// Heights (0..1, row 0 = top of the picture) + mask -> closed, outward-facing triangle soup in mm, Z up, the picture lying on the plate.
	// opt: cell (mm per cell), base (mm under the lowest point), height (mm of relief), twoSided (mirror the relief under the model, flat-back otherwise),
	// border (mm of frame at full height round the edge), smoothEdge (taper the relief to 0 over this many mm near the outline).
	function reliefMesh(H, mask, w, h, opt) {
		opt = opt || {}; var cell = opt.cell || 0.5, base = opt.base == null ? 1 : opt.base, hh = opt.height == null ? 3 : opt.height, two = !!opt.twoSided, x, y, k;
		var bc = (opt.border || 0) / cell, tc = (opt.smoothEdge || 0) / cell, dist = bc > 0 || tc > 0 ? edgeDistance(mask, w, h) : null;
		var val = new Float32Array(w * h);
		for (k = 0; k < w * h; k++) { if (!mask[k]) continue; var t = H[k]; if (dist) { if (dist[k] <= bc) t = 1; else if (tc > 0 && dist[k] - bc < tc) t *= (dist[k] - bc) / tc; } val[k] = t; }
		// corner heights = average of the inside cells around the corner (corners on a (w+1) x (h+1) grid)
		var W1 = w + 1, ct = new Float32Array(W1 * (h + 1)), cn = new Uint8Array(W1 * (h + 1));
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (!mask[k]) continue; var v = val[k]; [y * W1 + x, y * W1 + x + 1, (y + 1) * W1 + x, (y + 1) * W1 + x + 1].forEach(function (c) { ct[c] += v; cn[c]++; }); }
		for (k = 0; k < ct.length; k++) if (cn[k]) ct[k] /= cn[k];
		var cells = 0, walls = 0;
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (!mask[k]) continue; cells++; if (x === 0 || !mask[k - 1]) walls++; if (x === w - 1 || !mask[k + 1]) walls++; if (y === 0 || !mask[k - w]) walls++; if (y === h - 1 || !mask[k + w]) walls++; }
		var out = new Float32Array((cells * 4 + walls * 2) * 9), p = 0;
		function zt(c) { return two ? base / 2 + ct[c] * hh : base + ct[c] * hh; }
		function zb(c) { return two ? -(base / 2 + ct[c] * hh) : 0; }
		function px(cx) { return cx * cell; }
		function py(cy) { return (h - cy) * cell; } // picture row -> y up
		function tri(a, b, c) { out[p++] = a[0]; out[p++] = a[1]; out[p++] = a[2]; out[p++] = b[0]; out[p++] = b[1]; out[p++] = b[2]; out[p++] = c[0]; out[p++] = c[1]; out[p++] = c[2]; }
		function quad(a, b, c, d) { tri(a, b, c); tri(a, c, d); }
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
			k = y * w + x; if (!mask[k]) continue;
			// corners in picture coords: TL (x,y) TR (x+1,y) BL (x,y+1) BR (x+1,y+1); in the mesh y grows upward, so BL is "south-west"
			var cTL = y * W1 + x, cTR = cTL + 1, cBL = cTL + W1, cBR = cBL + 1;
			var T = function (c, cx, cy) { return [px(cx), py(cy), zt(c)]; }, B = function (c, cx, cy) { return [px(cx), py(cy), zb(c)]; };
			var tBL = T(cBL, x, y + 1), tBR = T(cBR, x + 1, y + 1), tTR = T(cTR, x + 1, y), tTL = T(cTL, x, y);
			var bBL = B(cBL, x, y + 1), bBR = B(cBR, x + 1, y + 1), bTR = B(cTR, x + 1, y), bTL = B(cTL, x, y);
			quad(tBL, tBR, tTR, tTL); // top, counter-clockwise from above
			quad(bBL, bTL, bTR, bBR); // bottom, facing down
			if (y === h - 1 || !mask[k + w]) quad(bBL, bBR, tBR, tBL); // south wall (-y)
			if (y === 0 || !mask[k - w]) quad(bTR, bTL, tTL, tTR); // north wall (+y)
			if (x === w - 1 || !mask[k + 1]) quad(bBR, bTR, tTR, tBR); // east wall (+x)
			if (x === 0 || !mask[k - 1]) quad(bTL, bBL, tBL, tTL); // west wall (-x)
		}
		return out;
	}
	// Grid size for a picture: at most maxCells cells, keeping the aspect ratio.
	function reliefGrid(w, h, maxCells) { var s = Math.min(1, Math.sqrt((maxCells || 60000) / (w * h))); return { w: Math.max(2, Math.round(w * s)), h: Math.max(2, Math.round(h * s)) }; }
	function luminance(rgba, n) { var o = new Float32Array(n); for (var i = 0; i < n; i++) o[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255; return o; }
	var RELIEF_PRESETS = {
		relief: { name: 'Raised picture (relief)', source: 'depth', shape: 'rect', width: 100, base: 2, height: 6, border: 0, two: false, blur: 2, gamma: 1, invert: false },
		medal: { name: 'Coin / medallion', source: 'depth', shape: 'circle', width: 60, base: 2, height: 3, border: 2.5, two: false, blur: 2, gamma: 1, invert: false },
		figure: { name: 'Cut-out figure (flat back)', source: 'depth', shape: 'subject', width: 80, base: 2, height: 10, border: 0, two: false, blur: 3, gamma: 1, invert: false },
		puffy: { name: 'Cut-out figure (both sides)', source: 'depth', shape: 'subject', width: 80, base: 3, height: 7, border: 0, two: true, blur: 3, gamma: 1, invert: false },
		litho: { name: 'Lithophane (light shines through)', source: 'dark', shape: 'rect', width: 100, base: 0.8, height: 2.2, border: 3, two: false, blur: 0, gamma: 1, invert: false },
		logo: { name: 'Logo or drawing (brightness)', source: 'dark', shape: 'rect', width: 80, base: 2, height: 2, border: 0, two: false, blur: 0, gamma: 1, invert: false }
	};

	var api = { PLATES: PLATES, plateById: plateById, MATERIALS: MATERIALS, materialById: materialById, UNITS: UNITS, parseLength: parseLength, fmtLength: fmtLength, fmtNum: fmtNum, snap: snap,
		bboxOf: bboxOf, volumeArea: volumeArea, flipWinding: flipWinding, weld: weld, manifoldCheck: manifoldCheck, overhang: overhang, plateFit: plateFit, filament: filament,
		polyArea: polyArea, ccw: ccw, circlePts: circlePts, roundedRect: roundedRect, starPts: starPts, heartPts: heartPts, polygonPts: polygonPts, gearPts: gearPts, bounds2: bounds2, offsetPolygon: offsetPolygon, cleanProfile: cleanProfile,
		threeMFModel: threeMFModel, THREEMF_TYPES: THREEMF_TYPES, THREEMF_RELS: THREEMF_RELS, hex6: hex6,
		bytesToB64: bytesToB64, b64ToBytes: b64ToBytes, f32ToB64: f32ToB64, b64ToF32: b64ToF32,
		alignShifts: alignShifts, resampleGrid: resampleGrid, shapeMask: shapeMask, cleanMask: cleanMask, normHeights: normHeights, edgeDistance: edgeDistance, reliefMesh: reliefMesh, reliefGrid: reliefGrid, luminance: luminance, RELIEF_PRESETS: RELIEF_PRESETS, distributeShifts: distributeShifts, TYPES: TYPES, validObj: validObj, validProject: validProject, safeName: safeName };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	root.MES3D = api;
})(typeof window !== 'undefined' ? window : this);

/* MES 3D Studio: ready-made models (window.TD_TEMPLATES). Each make() returns plain objects (no three.js):
 * {type, p (shape settings, mm), pos (centre, mm, Z up), rot (degrees), scl, color, hole, children (groups)}.
 * Positions are where each part's centre goes; the app then puts the whole model on the middle of the plate. */
(function () {
	'use strict';
	var L = window.MES3D;
	function o(type, p, pos, ext) { var r = { type: type, p: p || {}, pos: pos || [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], color: null }; for (var k in ext || {}) r[k] = ext[k]; return r; }
	function hole(type, p, pos, ext) { var r = o(type, p, pos, ext); r.hole = true; return r; }
	function g(children, ext) { var r = { type: 'group', op: 'union', children: children, pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], color: null }; for (var k in ext || {}) r[k] = ext[k]; return r; }
	function pts(a) { return a.map(function (p) { return [+p[0].toFixed(3), +p[1].toFixed(3)]; }); }

	var T = [
		{ id: 'keychain', name: 'Name keychain', emoji: '🔑', tags: 'key ring tag name text gift', desc: 'A rounded tag with your name and a ring hole. Select it and type a new name in the Shape panel.',
			make: function () { return [g([o('plate', { w: 50, d: 18, h: 3, r: 5 }, [0, 0, 1.5]), o('text', { text: 'MES', size: 9, depth: 2, font: 'helvetiker_bold' }, [4, 0, 4]), hole('cylinder', { w: 5, d: 5, h: 10, seg: 32 }, [-18.5, 0, 1.5])], { color: '#f97316', name: 'Name keychain' })]; } },
		{ id: 'phone-stand', name: 'Phone stand', emoji: '📱', tags: 'phone tablet holder desk stand', desc: 'A desk stand for a phone, printed on its side so it needs no supports.',
			make: function () { return [o('extrude', { depth: 70, shapes: [{ o: [[0, 0], [75, 0], [75, 4], [32, 4], [54, 60], [47, 62], [24, 4], [8, 4], [8, 16], [0, 16]] }] }, [0, 0, 31], { rot: [90, 0, 0], color: '#3b82f6', name: 'Phone stand' })]; } },
		{ id: 'cup', name: 'Cup', emoji: '🥤', tags: 'cup mug glass drink lathe revolve', desc: 'A drinking cup made by spinning a side profile around the middle (Revolve).',
			make: function () { return [o('lathe', { seg: 72, pts: [[0, 0], [32, 0], [35, 85], [32.5, 85], [29.6, 3], [0, 3]] }, [0, 0, 42.5], { color: '#14b8a6', name: 'Cup' })]; } },
		{ id: 'box-lid', name: 'Box with lid', emoji: '📦', tags: 'box container storage lid case', desc: 'A small box with 2 mm walls and a lid that pushes on. Print the lid as it lies.',
			make: function () { return [
				g([o('box', { w: 60, d: 40, h: 30 }, [0, 0, 15]), hole('box', { w: 56, d: 36, h: 30 }, [0, 0, 17])], { color: '#8b5cf6', name: 'Box' }),
				g([o('box', { w: 60, d: 40, h: 2 }, [70, 0, 1]), o('box', { w: 55.6, d: 35.6, h: 3 }, [70, 0, 3.5])], { color: '#a78bfa', name: 'Lid' })]; } },
		{ id: 'coaster', name: 'Coaster', emoji: '☕', tags: 'coaster drink mat table text', desc: 'A round coaster with a shallow dish and raised letters.',
			make: function () { return [g([g([o('cylinder', { w: 95, d: 95, h: 5, seg: 96 }, [0, 0, 2.5]), hole('cylinder', { w: 85, d: 85, h: 3, seg: 96 }, [0, 0, 5])]), o('text', { text: 'MES', size: 16, depth: 1.5, font: 'helvetiker_bold' }, [0, 0, 4.25])], { color: '#ef4444', name: 'Coaster' })]; } },
		{ id: 'gear', name: 'Gear', emoji: '⚙️', tags: 'gear cog wheel teeth mechanical', desc: 'A spur gear: change the teeth and size in the Shape panel. Two gears with the same module mesh.',
			make: function () { return [o('gear', { teeth: 20, mod: 2, h: 8, bore: 5 }, [0, 0, 4], { color: '#64748b', name: 'Gear' })]; } },
		{ id: 'pawn', name: 'Chess pawn', emoji: '♟️', tags: 'chess pawn game piece lathe revolve', desc: 'A chess pawn made with Revolve: edit the profile to make the other pieces.',
			make: function () { return [o('lathe', { seg: 64, pts: [[0, 0], [14, 0], [14, 3], [12, 4], [12, 6], [9, 8], [6, 14], [5, 22], [8, 24], [8, 26], [4.5, 27], [7, 30], [8, 34], [7, 38], [4, 40.5], [0, 41]] }, [0, 0, 20.5], { color: '#1f2937', name: 'Pawn' })]; } },
		{ id: 'planter', name: 'Planter pot', emoji: '🪴', tags: 'plant pot planter flower garden drain', desc: 'A plant pot with a drain hole in the bottom.',
			make: function () { return [g([o('lathe', { seg: 72, pts: [[0, 0], [30, 0], [40, 70], [37, 70], [27.6, 3], [0, 3]] }, [0, 0, 35]), hole('cylinder', { w: 8, d: 8, h: 10, seg: 32 }, [0, 0, 1.5])], { color: '#16a34a', name: 'Planter' })]; } },
		{ id: 'cookie-cutter', name: 'Cookie cutter', emoji: '🍪', tags: 'cookie cutter baking heart kitchen', desc: 'A heart cookie cutter: a thin wall with a wider rim on top for your hand.',
			make: function () {
				var b = L.bounds2(L.heartPts(1)), r = b.h / b.w, W = 60, T = 1.2, w2 = W - 2 * T;     // the wall is the heart minus a slightly smaller heart
				return [g([o('heart', { w: W, d: W * r, h: 12 }, [0, 0, 6]), o('heart', { w: W + 8, d: (W + 8) * r, h: 2 }, [0, 0, 1]), hole('heart', { w: w2, d: w2 * r, h: 16 }, [0, -0.6, 7])], { color: '#ec4899', name: 'Cookie cutter' })];
			} },
		{ id: 'hook', name: 'Wall hook', emoji: '🪝', tags: 'hook wall hang coat key screw', desc: 'A wall hook with two screw holes (for 3.5 mm screws).',
			make: function () { return [g([o('extrude', { depth: 20, shapes: [{ o: [[0, 0], [30, 0], [30, 18], [25, 18], [25, 5], [5, 5], [5, 60], [0, 60]] }] }, [15, 0, 30], { rot: [90, 0, 0] }),
				hole('cylinder', { w: 4, d: 4, h: 14, seg: 24 }, [2.5, 0, 50], { rot: [0, 90, 0] }), hole('cylinder', { w: 4, d: 4, h: 14, seg: 24 }, [2.5, 0, 25], { rot: [0, 90, 0] })], { color: '#0ea5e9', name: 'Wall hook' })]; } },
		{ id: 'nameplate', name: 'Desk nameplate', emoji: '🪧', tags: 'name plate desk sign office text', desc: 'A standing name sign for a desk. Type a new name in the Shape panel.',
			make: function () { return [g([o('box', { w: 120, d: 40, h: 4 }, [0, 0, 2]), o('box', { w: 120, d: 4, h: 30 }, [0, 8, 19]), o('text', { text: 'Your Name', size: 12, depth: 2, font: 'helvetiker_bold' }, [0, 5, 19], { rot: [90, 0, 0] })], { color: '#0f766e', name: 'Nameplate' })]; } },
		{ id: 'house', name: 'Simple house', emoji: '🏠', tags: 'house home building roof door window toy', desc: 'Walls, a roof, a chimney, and a door and windows made with holes.',
			make: function () { return [g([o('box', { w: 40, d: 30, h: 25 }, [0, 0, 12.5]), o('extrude', { depth: 34, shapes: [{ o: [[-23, 0], [23, 0], [0, 16]] }] }, [0, 0, 33], { rot: [90, 0, 0] }), o('box', { w: 5, d: 5, h: 10 }, [12, 8, 38]),
				hole('box', { w: 8, d: 6, h: 14 }, [0, -15, 7]), hole('box', { w: 7, d: 6, h: 7 }, [-12, -15, 15]), hole('box', { w: 7, d: 6, h: 7 }, [12, -15, 15])], { color: '#eab308', name: 'House' })]; } },
		{ id: 'dice', name: 'Dice', emoji: '🎲', tags: 'dice die game cube rounded pips', desc: 'A rounded die: a cube kept only where it overlaps a sphere (Intersect), then pips cut as holes.',
			make: function () {
				var c = [g([o('box', { w: 16, d: 16, h: 16 }, [0, 0, 8]), o('sphere', { w: 22.4, d: 22.4, h: 22.4, seg: 48 }, [0, 0, 8])], { op: 'intersect' })];
				var s = 4, pip = function (x, y, z) { var o2 = function (v, mid) { return v === mid + 8 ? v + 0.4 : v === mid - 8 ? v - 0.4 : v; }; c.push(hole('sphere', { w: 3.4, d: 3.4, h: 3.4, seg: 20 }, [o2(x, 0), o2(y, 0), o2(z, 8)])); };
				pip(0, 0, 16);                                                                   // 1 on top
				pip(-s, -8, 8 + s); pip(s, -8, 8 - s);                                            // 2 at the front
				pip(8, -s, 8 + s); pip(8, 0, 8); pip(8, s, 8 - s);                                // 3 on the right
				[[-s, -s], [s, -s], [-s, s], [s, s]].forEach(function (q) { pip(q[0], 8, 8 + q[1]); });   // 4 at the back
				[[-s, -s], [s, -s], [-s, s], [s, s], [0, 0]].forEach(function (q) { pip(-8, q[0], 8 + q[1]); }); // 5 on the left
				[[-s, -s], [0, -s], [s, -s], [-s, s], [0, s], [s, s]].forEach(function (q) { pip(q[0], q[1], 0); }); // 6 underneath
				return [g(c, { color: '#f8fafc', name: 'Dice' })];
			} },
		{ id: 'ring', name: 'Finger ring', emoji: '💍', tags: 'ring finger jewellery band tube', desc: 'A plain band ring, 17 mm inside (about US size 6.5). Change the Tube size for other fingers.',
			make: function () { return [o('tube', { w: 21, d: 21, h: 6, wall: 2, seg: 96 }, [0, 0, 3], { color: '#fbbf24', name: 'Ring' })]; } },
		{ id: 'pencil-holder', name: 'Pencil holder', emoji: '✏️', tags: 'pencil pen holder cup desk hexagon', desc: 'A six-sided pen cup with 3 mm walls.',
			make: function () { return [g([o('cylinder', { w: 70, d: 70, h: 90, seg: 6 }, [0, 0, 45]), hole('cylinder', { w: 64, d: 64, h: 90, seg: 6 }, [0, 0, 48])], { color: '#22c55e', name: 'Pencil holder' })]; } },
		{ id: 'vase', name: 'Vase', emoji: '🏺', tags: 'vase flower curve lathe revolve', desc: 'A curvy vase made with Revolve. Try your slicer\'s "spiral vase" mode.',
			make: function () { return [o('lathe', { seg: 96, pts: [[0, 0], [25, 0], [33, 30], [22, 70], [26, 100], [24, 100], [20, 70], [31, 30], [23, 2], [0, 2]] }, [0, 0, 50], { color: '#6366f1', name: 'Vase' })]; } },
		{ id: 'bookmark', name: 'Bookmark', emoji: '🔖', tags: 'bookmark book read text tassel', desc: 'A thin bookmark with a word and a hole for a ribbon.',
			make: function () { return [g([o('plate', { w: 40, d: 120, h: 1.5, r: 5 }, [0, 0, 0.75]), o('text', { text: 'READ', size: 14, depth: 1, font: 'helvetiker_bold' }, [0, -8, 2], { rot: [0, 0, 90] }), hole('cylinder', { w: 6, d: 6, h: 5, seg: 32 }, [0, 51, 0.75])], { color: '#e11d48', name: 'Bookmark' })]; } },
		{ id: 'top', name: 'Spinning top', emoji: '🌀', tags: 'spinning top toy spin lathe', desc: 'A toy top: flip it over in the slicer if you prefer to print it point up.',
			make: function () { return [o('lathe', { seg: 72, pts: [[0, 0], [1.5, 0], [22, 14], [22, 17], [5, 22], [4, 40], [0, 40]] }, [0, 0, 20], { color: '#f43f5e', name: 'Spinning top' })]; } },
		{ id: 'star-ornament', name: 'Star ornament', emoji: '⭐', tags: 'star christmas tree ornament hang', desc: 'A star with a loop for a string.',
			make: function () { return [g([o('star', { w: 60, d: 60, h: 4, points: 5, inner: 45 }, [0, 0, 2]), o('tube', { w: 10, d: 10, h: 4, wall: 2, seg: 48 }, [0, 32, 2])], { color: '#facc15', name: 'Star ornament' })]; } },
		{ id: 'snowman', name: 'Snowman', emoji: '⛄', tags: 'snowman winter christmas toy spheres', desc: 'Three spheres and a carrot nose: a good first try at putting shapes together.',
			make: function () { return [g([o('sphere', { w: 40, d: 40, h: 40, seg: 48 }, [0, 0, 20]), o('sphere', { w: 28, d: 28, h: 28, seg: 48 }, [0, 0, 50]), o('sphere', { w: 20, d: 20, h: 20, seg: 48 }, [0, 0, 71])], { color: '#e5e7eb', name: 'Snowman' }),
				o('cone', { w: 4, d: 4, h: 10, top: 0, seg: 24 }, [0, -13, 72], { rot: [90, 0, 0], color: '#f97316', name: 'Nose' })]; } },
		{ id: 'tealight', name: 'Tea light holder', emoji: '🕯️', tags: 'candle tealight holder light star', desc: 'A holder for a standard 39 mm tea light, with star cut-outs.',
			make: function () { var c = [o('cylinder', { w: 60, d: 60, h: 30, seg: 72 }, [0, 0, 15]), hole('cylinder', { w: 40, d: 40, h: 30, seg: 72 }, [0, 0, 18])];
				for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; c.push(hole('star', { w: 12, d: 12, h: 20, points: 5, inner: 45 }, [Math.cos(a) * 26, Math.sin(a) * 26, 17], { rot: [90, 0, a * 180 / Math.PI + 90] })); }
				return [g(c, { color: '#f59e0b', name: 'Tea light holder' })]; } },
		{ id: 'plant-label', name: 'Plant label', emoji: '🌱', tags: 'garden plant label stake sign text', desc: 'A stake for a plant pot with a name on it.',
			make: function () { return [g([o('plate', { w: 60, d: 22, h: 2, r: 4 }, [0, 30, 1]), o('extrude', { depth: 2, shapes: [{ o: [[-4, 0], [4, 0], [4, 60], [0, 70], [-4, 60]] }] }, [0, -14, 1], { rot: [0, 0, 180] }), o('text', { text: 'Basil', size: 10, depth: 1.2, font: 'helvetiker_bold' }, [0, 30, 2.6])], { color: '#65a30d', name: 'Plant label' })]; } }
	];
	window.TD_TEMPLATES = T;
})();

/* MES 3D Studio: "Photo to 3D". Turns a picture into a printable relief, coin, lithophane or cut-out figure, all in the browser.
 * Heights come from an AI depth model (Depth Anything V2 Small, Apache-2.0, onnx-community/depth-anything-v2-small) or from the picture's brightness;
 * "Subject only" uses the picture's own transparency, else IS-Net (Apache-2.0, Ko033/isnet-general-use-onnx, the Photo Editor's background remover).
 * transformers.js 3.7.6 from jsDelivr loads on first use; the models come from huggingface.co once and stay in the browser's cache. Nothing is uploaded.
 * The mesh maths (resample, mask clean-up, heights, watertight mesh) is MES3D in lib.js. Started by app.js: window.TDPhoto3D(api). */
(function () {
	'use strict';
	var LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js', TF = null, models = {};
	var DEPTH = { id: 'onnx-community/depth-anything-v2-small', mb: function (g) { return g ? 50 : 27; } };
	var SEG = { id: 'Ko033/isnet-general-use-onnx', mb: function (g) { return g ? 88 : 46; } };
	var KEY = 'mes-3d-studio:photo3d';
	function loadLib() { return TF ? Promise.resolve(TF) : new Function('u', 'return import(u)')(LIB).then(function (m) { TF = m; return m; }); }
	var f16 = null;
	function gpuF16() { if (f16) return f16; f16 = navigator.gpu ? navigator.gpu.requestAdapter().then(function (a) { return !!(a && a.features.has('shader-f16')); }).catch(function () { return false; }) : Promise.resolve(false); return f16; }

	window.TDPhoto3D = function (api) {
		var L = api.L, esc = api.esc;
		var st = (function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
		var P = Object.assign({ preset: 'relief', detail: 60000 }, L.RELIEF_PRESETS.relief, st);
		function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
		var pic = null; // {name, canvas (<= 1024 px), w, h, rgba, alpha (Float32 or null), depth: {d,w,h} | null, seg: {d,w,h} | null}

		function getModel(which, prog) {
			return Promise.all([loadLib(), gpuF16()]).then(function (r) {
				var gpu = r[1], key = which + (gpu ? ':gpu' : ':cpu'); if (models[key]) return models[key];
				var M = which === 'depth' ? DEPTH : SEG, opt = { progress_callback: prog, dtype: gpu ? 'fp16' : 'q8', device: gpu ? 'webgpu' : 'wasm' };
				function load(o) {
					if (which === 'depth') return TF.pipeline('depth-estimation', M.id, o).then(function (p) { return { run: p, gpu: o.device === 'webgpu' }; });
					return Promise.all([TF.AutoModel.from_pretrained(M.id, o), TF.AutoProcessor.from_pretrained(M.id)]).then(function (a) { return { model: a[0], proc: a[1], gpu: o.device === 'webgpu' }; });
				}
				return (models[key] = load(opt).catch(function (e) { if (!gpu) throw e; return load({ progress_callback: prog, dtype: 'q8', device: 'wasm' }); }));
			});
		}
		function tensorGrid(t) { var dims = t.dims, h = dims[dims.length - 2], w = dims[dims.length - 1]; return Promise.resolve(t.data).then(function (d) { return { d: Float32Array.from(d), w: w, h: h }; }); }
		function runDepth(prog) {
			return getModel('depth', prog).then(function (m) { return TF.RawImage.fromCanvas(pic.canvas); }).then(function (img) {
				return getModel('depth', prog).then(function (m) { return m.run(img); });
			}).then(function (out) { return tensorGrid(out.predicted_depth); });
		}
		function runSeg(prog) {
			return getModel('seg', prog).then(function (m) {
				return Promise.resolve(TF.RawImage.fromCanvas(pic.canvas)).then(function (img) { return m.proc(img); }).then(function (inp) {
					var s = m.model.sessions.model, feed = {}; feed[s.inputNames[0]] = inp.pixel_values;
					return m.model(feed).then(function (res) { return tensorGrid(res[s.outputNames[0]]); });
				});
			}).then(function (g) { // min-max normalise to 0..1
				var mn = Infinity, mx = -Infinity, i; for (i = 0; i < g.d.length; i++) { if (g.d[i] < mn) mn = g.d[i]; if (g.d[i] > mx) mx = g.d[i]; }
				var r = mx - mn || 1; for (i = 0; i < g.d.length; i++) g.d[i] = (g.d[i] - mn) / r; return g;
			});
		}

		// ---------- reading a picture ----------
		function loadPicture(file) {
			return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); }).then(function (bmp) {
				var s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height)), w = Math.max(2, Math.round(bmp.width * s)), h = Math.max(2, Math.round(bmp.height * s));
				var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d', { willReadFrequently: true });
				x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h);
				var rgba = x.getImageData(0, 0, w, h).data, alpha = null, see = 0;
				for (var i = 0; i < w * h; i++) if (rgba[i * 4 + 3] < 250) see++;
				if (see > w * h * 0.02) { alpha = new Float32Array(w * h); for (i = 0; i < w * h; i++) alpha[i] = rgba[i * 4 + 3] / 255; }
				// the AI models want a solid picture: paint transparent parts white
				if (alpha) { var c2 = document.createElement('canvas'); c2.width = w; c2.height = h; var x2 = c2.getContext('2d'); x2.fillStyle = '#fff'; x2.fillRect(0, 0, w, h); x2.drawImage(c, 0, 0); c = c2; rgba = x2.getImageData(0, 0, w, h).data; }
				pic = { name: api.baseName(file.name || 'picture'), canvas: c, w: w, h: h, rgba: rgba, alpha: alpha, depth: null, seg: null };
				return pic;
			});
		}

		// ---------- the dialog ----------
		var d = null, busy = false, token = 0;
		function presetChips() { return Object.keys(L.RELIEF_PRESETS).map(function (k) { return '<button type="button" class="td-b td-p3-pre" data-pre="' + k + '" aria-pressed="' + (P.preset === k) + '">' + esc(L.RELIEF_PRESETS[k].name) + '</button>'; }).join(''); }
		function num(id, label, v, step, hint) { return '<label class="td-f" title="' + esc(hint || '') + '">' + label + '<input class="td-in" type="number" inputmode="decimal" step="' + step + '" min="0" id="td-p3-' + id + '" value="' + v + '"></label>'; }
		function open(file) {
			d = api.dialog('<h3>Photo to 3D</h3>'
				+ '<p class="td-hint">Turn a photo or drawing into a model you can print: a raised picture, a coin, a lithophane or a cut-out figure. Everything happens in your browser: the picture is never uploaded.</p>'
				+ '<div class="td-p3">'
				+ '<div class="td-p3-l">'
				+ '<div class="td-p3-drop" id="td-p3-drop" tabindex="0" role="button" aria-label="Choose a picture"><canvas id="td-p3-pic" hidden></canvas><span id="td-p3-dt">📷 <b>Choose a picture</b><br><small>or drop it here, or paste it (Ctrl+V)</small></span></div>'
				+ '<input type="file" id="td-p3-file" accept="image/*" hidden>'
				+ '<div class="td-p3-prevw"><canvas id="td-p3-prev" aria-label="Preview of the 3D shape (lit from the top left)"></canvas><div class="td-p3-ph" id="td-p3-ph">The 3D preview appears here</div></div>'
				+ '<div class="td-p3-bar" id="td-p3-bar" hidden><i></i></div><p class="td-hint" id="td-p3-st" aria-live="polite"></p>'
				+ '</div>'
				+ '<div class="td-p3-r">'
				+ '<div class="td-p3-pres">' + presetChips() + '</div>'
				+ '<div class="td-p3-grid">'
				+ '<label class="td-f td-f--w">Height comes from<select id="td-p3-source"><option value="depth">AI depth: near things stick out (3D from a photo)</option><option value="dark">Brightness: darker = higher</option><option value="light">Brightness: lighter = higher</option></select></label>'
				+ '<label class="td-f td-f--w">Shape<select id="td-p3-shape"><option value="rect">Rectangle (whole picture)</option><option value="circle">Circle (coin)</option><option value="oval">Oval</option><option value="subject">Subject only (background removed)</option></select></label>'
				+ num('width', 'Width (mm)', P.width, 1, 'Width of the model; the depth follows the picture') + num('height', 'Relief height (mm)', P.height, 0.1, 'How far the highest point rises above the base')
				+ num('base', 'Base (mm)', P.base, 0.1, 'Solid thickness under the relief (lithophane: the thinnest part)') + num('border', 'Frame (mm)', P.border, 0.5, 'A raised rim round the edge; 0 = none')
				+ num('round', 'Round the edges (mm)', P.round || 0, 0.5, 'Lowers the relief near the outline so cut-outs get soft edges')
				+ '<label class="td-f">Smoothness<input type="range" min="0" max="8" step="1" id="td-p3-blur" value="' + P.blur + '"></label>'
				+ '<label class="td-f">Contrast<input type="range" min="0.4" max="2.5" step="0.05" id="td-p3-gamma" value="' + P.gamma + '" title="Left = more of the relief rises; right = only the highest parts stand out"></label>'
				+ '<label class="td-f">Detail<select id="td-p3-detail"><option value="20000">Low (fast)</option><option value="60000">Normal</option><option value="120000">High</option><option value="200000">Very high (big file)</option></select></label>'
				+ '<label class="td-chk td-f--w"><input type="checkbox" id="td-p3-two"> Both sides (puffy: the relief is mirrored underneath)</label>'
				+ '<label class="td-chk td-f--w"><input type="checkbox" id="td-p3-inv"> Flip the heights (high becomes low)</label>'
				+ '</div>'
				+ '<p class="td-hint" id="td-p3-info"></p>'
				+ '<p class="td-hint td-p3-ai">AI depth guesses shape from one photo: it is a relief (like a carving), not a full model you can walk round. First use downloads a small AI model (about ' + DEPTH.mb(!!navigator.gpu) + ' MB, + ' + SEG.mb(!!navigator.gpu) + ' MB for "Subject only") from huggingface.co and keeps it in this browser.</p>'
				+ '<div class="td-btns"><button type="button" class="td-b td-b--pri" id="td-p3-add" disabled>➕ Add to my model</button><button type="button" class="td-b" data-close>Cancel</button></div>'
				+ '</div></div>', 'td-dlg--wide td-dlg--p3', function () { token++; d = null; document.removeEventListener('paste', onPaste); });
			setForm(); bind(); document.addEventListener('paste', onPaste);
			if (file) choose(file); else if (pic) { showPic(); update(); }
		}
		function $(id) { return d && d.querySelector('#td-p3-' + id); }
		function setForm() {
			$('source').value = P.source; $('shape').value = P.shape; $('detail').value = String(P.detail);
			['width', 'height', 'base', 'border'].forEach(function (k) { $(k).value = P[k]; }); $('round').value = P.round || 0; $('blur').value = P.blur; $('gamma').value = P.gamma;
			$('two').checked = !!P.two; $('inv').checked = !!P.invert;
			d.querySelectorAll('.td-p3-pre').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pre === P.preset)); });
		}
		function readForm() {
			function n(id, dflt, lo, hi) { var v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }
			P.source = $('source').value; P.shape = $('shape').value; P.detail = +$('detail').value;
			P.width = n('width', 100, 5, 1000); P.height = n('height', 4, 0, 200); P.base = n('base', 1, 0, 100); P.border = n('border', 0, 0, 100); P.round = n('round', 0, 0, 100);
			P.blur = +$('blur').value; P.gamma = +$('gamma').value; P.two = $('two').checked; P.invert = $('inv').checked;
		}
		var timer = 0;
		function bind() {
			var drop = $('drop'), fi = $('file');
			drop.addEventListener('click', function () { fi.click(); });
			drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
			fi.addEventListener('change', function () { if (fi.files[0]) choose(fi.files[0]); fi.value = ''; });
			drop.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('on'); });
			drop.addEventListener('dragleave', function () { drop.classList.remove('on'); });
			drop.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove('on'); var f = e.dataTransfer.files[0]; if (f) choose(f); });
			d.addEventListener('click', function (e) {
				var b = e.target.closest('[data-pre]'); if (!b) return;
				P.preset = b.dataset.pre; Object.assign(P, L.RELIEF_PRESETS[P.preset]); P.round = P.shape === 'subject' && !P.two ? 2 : P.two ? 3 : 0; setForm(); save(); update();
			});
			d.addEventListener('input', function (e) { if (!e.target.id || e.target.id.indexOf('td-p3-') !== 0 || e.target.id === 'td-p3-file') return; readForm(); save(); clearTimeout(timer); timer = setTimeout(update, e.target.type === 'range' ? 60 : 250); });
			d.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') { readForm(); save(); update(); } });
			$('add').addEventListener('click', add);
		}
		function onPaste(e) {
			var it = Array.prototype.find.call((e.clipboardData && e.clipboardData.items) || [], function (i) { return i.type.indexOf('image/') === 0; });
			if (it) { e.preventDefault(); choose(it.getAsFile()); }
		}
		function status(t, frac) {
			if (!d) return; $('st').textContent = t || '';
			var bar = $('bar'); bar.hidden = frac == null; if (frac != null) bar.firstChild.style.width = Math.round(frac * 100) + '%';
		}
		function choose(file) {
			if (!file || !/^image\//.test(file.type || 'image/')) return status('That is not a picture. Use a JPG, PNG or WebP.');
			status('Reading the picture…');
			token++; loadPicture(file).then(function () { showPic(); update(); }).catch(function (e) { status('Could not read that picture (' + (e && e.message || e) + '). Try a JPG, PNG or WebP.'); });
		}
		function showPic() {
			var c = $('pic'), dt = $('dt'); c.hidden = false; dt.hidden = true; c.width = pic.w; c.height = pic.h; c.getContext('2d').drawImage(pic.canvas, 0, 0);
		}
		function progress(label) {
			var files = {};
			return function (p) {
				if (!p || p.status !== 'progress' || !(p.total > 1e6)) return; files[p.file] = p; var l = 0, t = 0;
				for (var k in files) { l += files[k].loaded; t += files[k].total; }
				status('Downloading the ' + label + ' model… ' + Math.round(l / 1e6) + ' of ' + Math.round(t / 1e6) + ' MB (only the first time)', t ? l / t : 0);
			};
		}
		// make sure the AI results this setting needs exist, then build
		var built = null;
		function update() {
			if (!d || !pic) return; readForm();
			var my = ++token, needDepth = P.source === 'depth' && !pic.depth, needSeg = P.shape === 'subject' && !pic.alpha && !pic.seg;
			var steps = Promise.resolve();
			if (needDepth) steps = steps.then(function () { status('Loading the AI depth model…', 0); return runDepth(progress('depth')).then(function (g) { pic.depth = g; }); });
			if (needSeg) steps = steps.then(function () { status('Loading the AI background remover…', 0); return runSeg(progress('background')).then(function (g) { pic.seg = g; }); });
			if (needDepth || needSeg) { busy = true; $('add').disabled = true; }
			steps.then(function () { if (my !== token || !d) return; busy = false; status(needDepth || needSeg ? 'Done. Change any setting: the preview follows at once.' : ''); build(); })
				.catch(function (e) { if (my !== token || !d) return; busy = false; console.warn(e); status('The AI model could not run: ' + (e && e.message || e) + (/fetch|network|load|Failed/i.test(String(e && e.message)) ? ' (check your connection)' : '') + '. Brightness still works without it.'); });
		}
		function build() {
			var g = L.reliefGrid(pic.w, pic.h, P.detail), gw = g.w, gh = g.h, src;
			if (P.source === 'depth') src = L.resampleGrid(pic.depth.d, pic.depth.w, pic.depth.h, gw, gh);
			else { var lum = L.luminance(pic.rgba, pic.w * pic.h); if (P.source === 'dark') for (var i = 0; i < lum.length; i++) lum[i] = 1 - lum[i]; src = L.resampleGrid(lum, pic.w, pic.h, gw, gh); }
			var alpha = P.shape === 'subject' ? (pic.alpha ? L.resampleGrid(pic.alpha, pic.w, pic.h, gw, gh) : L.resampleGrid(pic.seg.d, pic.seg.w, pic.seg.h, gw, gh)) : null;
			var mask = L.cleanMask(L.shapeMask(P.shape, gw, gh, alpha), gw, gh, { largest: P.shape === 'subject', holes: P.shape === 'subject' ? Math.round(gw * gh / 400) : 0 });
			var cells = 0; for (var k = 0; k < mask.length; k++) cells += mask[k];
			if (cells < 4) { built = null; $('add').disabled = true; $('info').textContent = 'Nothing is left to print: the subject was not found. Try another shape.'; return; }
			var H = L.normHeights(src, mask, gw, gh, { blur: P.blur, gamma: P.gamma, invert: P.invert });
			var x0 = gw, x1 = -1; for (var yy = 0; yy < gh; yy++) for (var xx = 0; xx < gw; xx++) if (mask[yy * gw + xx]) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; }
			var cell = P.width / (x1 - x0 + 1), soup = L.reliefMesh(H, mask, gw, gh, { cell: cell, base: P.base, height: P.height, twoSided: P.two, border: P.border, smoothEdge: P.round });
			built = { soup: soup, H: H, mask: mask, gw: gw, gh: gh, cell: cell };
			drawPreview(); var bb = L.bboxOf(soup), sz = bb.size;
			$('info').textContent = 'Size ' + L.fmtNum(sz[0], 1) + ' × ' + L.fmtNum(sz[1], 1) + ' × ' + L.fmtNum(sz[2], 1) + ' mm · ' + (soup.length / 9).toLocaleString() + ' triangles · watertight, ready to print';
			$('add').disabled = busy;
		}
		function drawPreview() { // hill-shaded picture of the heights, lit from the top left
			var b = built, c = $('prev'), gw = b.gw, gh = b.gh; c.width = gw; c.height = gh; $('ph').hidden = true;
			var x = c.getContext('2d'), id = x.createImageData(gw, gh), a = id.data, zs = Math.max(b.gw, b.gh) * 0.35 * Math.min(1.5, Math.max(0.3, (P.height + 0.01) / P.width * 10)), lx = -0.55, ly = -0.55, lz = 0.63;
			function hv(i, j) { i = Math.max(0, Math.min(gw - 1, i)); j = Math.max(0, Math.min(gh - 1, j)); var k = j * gw + i; return b.mask[k] ? b.H[k] : 0; }
			for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
				var k = j * gw + i, o = k * 4; if (!b.mask[k]) { a[o + 3] = 0; continue; }
				var nx = (hv(i - 1, j) - hv(i + 1, j)) * zs / 2, ny = (hv(i, j - 1) - hv(i, j + 1)) * zs / 2, nl = Math.hypot(nx, ny, 1), s = Math.max(0, (nx * lx + ny * ly + lz) / nl);
				var v = 40 + 200 * s; a[o] = v * 0.86; a[o + 1] = v * 0.92; a[o + 2] = v; a[o + 3] = 255;
			}
			x.putImageData(id, 0, 0);
		}
		function add() {
			if (!built || busy) return;
			var name = pic.name + ' (' + L.RELIEF_PRESETS[P.preset].name.replace(/ \(.*/, '').toLowerCase() + ')';
			api.addMesh(built.soup, name, P.preset === 'litho' ? '#F5F5F0' : null);
			api.closeDlg(); api.toast('Added ' + name + '. Check it in the Print tab, then export STL or 3MF.' + (P.preset === 'litho' ? ' Print lithophanes standing up, in white, at 100% infill.' : ''));
		}
		return { open: open, isImage: function (f) { return /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name); } };
	};
})();

/* MES 3D Studio (mes.fm/3d-studio): a beginner-friendly 3D modeler for 3D printing.
 * three.js 0.170.0 + addons and three-bvh-csg 0.0.17 (booleans) are loaded through the page's import map (jsDelivr).
 * Model = plain objects (S.objs): {id, name, type, p, pos (centre, mm), rot (deg), scl, color, hole, hidden, locked, children, op}.
 * Z is up, units are millimetres. Pure maths lives in lib.js (window.MES3D), templates in templates.js. */
(function () {
	'use strict';
	var L = window.MES3D, root = document.getElementById('td');
	if (!root || !L) return;
	function $(s, r) { return (r || root).querySelector(s); }
	function $$(s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	var imp; try { imp = new Function('u', 'return import(u)'); } catch (e) { imp = null; }
	var T, OrbitControls, TransformControls, BGU, CSG, BVH, FONTS = {}, fontWait = {};
	var KEY = 'mes-3d-studio:v1';
	var ST = { plate: 'ender3', custom: { x: 200, y: 200, z: 200 }, grid: 1, snap: true, unit: 'mm', mat: 'pla', dia: 1.75, infill: 15, wall: 0.8, price: 22, flow: 8, ohAngle: 45, minWall: 0.8, keep: false, efmt: 'stl', showOh: false, showThin: false, showVol: true, addHole: false, tab: 'obj' };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in saved) if (k in ST) ST[k] = saved[k]; } catch (e) {}
	function saveST() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }

	var S = { objs: [], sel: [], name: 'My model' };
	var MESH = {};                 // imported mesh triangle soups by ref (not copied into undo snapshots)
	var hist = [], hpos = -1;
	var view = $('#td-view'), stage = $('#td-stage');
	var renderer, scene, camera, orbit, tc, pivot, plateGroup, overlay, lights = {}, meshes = {}, geoCache = new Map(), selBox, dirty = true, ready = false;
	var COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f8fafc', '#94a3b8', '#475569', '#1f2937', '#a16207'];
	var colorTurn = 7;

	// ---------- shape catalogue ----------
	var PRIMS = {
		box: { name: 'Box', icon: '◼', dims: true, p: { w: 20, d: 20, h: 20 } },
		plate: { name: 'Rounded plate', icon: '▭', dims: true, p: { w: 40, d: 20, h: 4, r: 4 } },
		sphere: { name: 'Sphere', icon: '●', dims: true, p: { w: 20, d: 20, h: 20, seg: 48 } },
		cylinder: { name: 'Cylinder', icon: '⬤', dims: true, p: { w: 20, d: 20, h: 20, seg: 64 } },
		cone: { name: 'Cone', icon: '▲', dims: true, p: { w: 20, d: 20, h: 20, top: 0, seg: 64 } },
		pyramid: { name: 'Pyramid', icon: '△', dims: true, p: { w: 20, d: 20, h: 20, sides: 4 } },
		wedge: { name: 'Wedge', icon: '◢', dims: true, p: { w: 20, d: 20, h: 20 } },
		torus: { name: 'Torus (ring)', icon: '◯', dims: true, p: { w: 30, d: 30, h: 8, seg: 64 } },
		tube: { name: 'Tube', icon: '◎', dims: true, p: { w: 20, d: 20, h: 20, wall: 2, seg: 64 } },
		star: { name: 'Star', icon: '★', dims: true, p: { w: 30, d: 30, h: 5, points: 5, inner: 45 } },
		heart: { name: 'Heart', icon: '♥', dims: true, p: { w: 30, d: 30, h: 5 } },
		gear: { name: 'Gear', icon: '⚙', p: { teeth: 16, mod: 2, h: 6, bore: 4 } },
		text: { name: '3D text', icon: 'T', p: { text: 'Hello', size: 10, depth: 3, font: 'helvetiker_bold' } },
		lathe: { name: 'Revolve (spin a profile)', icon: '⌒', p: { seg: 64, pts: [[0, 0], [15, 0], [18, 25], [12, 40], [0, 40]] } },
		extrude: { name: 'Extrude (raise a drawing)', icon: '⬣', p: { depth: 5, shapes: [{ o: [[-10, -10], [10, -10], [10, 10], [0, 18], [-10, 10]] }] } }
	};
	var FONT_LIST = [['helvetiker_bold', 'Helvetiker bold'], ['helvetiker_regular', 'Helvetiker'], ['optimer_bold', 'Optimer bold'], ['gentilis_bold', 'Gentilis bold'], ['droid/droid_sans_bold', 'Droid Sans bold'], ['droid/droid_serif_bold', 'Droid Serif bold'], ['droid/droid_sans_mono_regular', 'Droid Sans Mono']];

	// ---------- small helpers ----------
	var uid = (function () { var n = Date.now() % 100000; return function () { return 'o' + (n++).toString(36) + Math.random().toString(36).slice(2, 5); }; })();
	function u(v) { return L.fmtNum(ST.unit === 'in' ? v / 25.4 : ST.unit === 'cm' ? v / 10 : v, ST.unit === 'in' ? 3 : 2); }
	function uu() { return ST.unit === 'in' ? 'in' : ST.unit; }
	function len(mm) { return L.fmtLength(mm, ST.unit, 2); }
	function toast(msg, act) {
		var t = $('#td-toast'); t.innerHTML = esc(msg) + (act ? ' <button type="button" class="td-b td-b--s">' + esc(act[0]) + '</button>' : '');
		t.classList.add('on'); if (act) t.querySelector('button').onclick = function () { t.classList.remove('on'); act[1](); };
		clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, act ? 7000 : 3200);
	}
	function walk(list, fn, parent) { list.forEach(function (o) { fn(o, parent); if (o.children) walk(o.children, fn, o); }); }
	function byId(id) { var f = null; walk(S.objs, function (o) { if (o.id === id) f = o; }); return f; }
	function topSel() { return S.sel.map(function (id) { return S.objs.find(function (o) { return o.id === id; }); }).filter(Boolean); }
	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function reId(o) { o.id = uid(); if (o.children) o.children.forEach(reId); return o; }
	function nameOf(o) { return o.name || (o.type === 'group' ? (o.op === 'intersect' ? 'Intersection' : 'Group') : o.type === 'mesh' ? 'Imported model' : o.type === 'text' ? '"' + (o.p.text || '').slice(0, 14) + '"' : (PRIMS[o.type] || {}).name || o.type); }
	function nextColor() { colorTurn = (colorTurn + 1) % 11; return COLORS[colorTurn]; }
	function plate() { return L.plateById(ST.plate, ST.custom); }

	// ---------- loading three.js ----------
	function loadEngine() {
		if (!imp) return Promise.reject(new Error('This browser cannot load modules.'));
		return Promise.all([imp('three'), imp('three/addons/controls/OrbitControls.js'), imp('three/addons/controls/TransformControls.js'), imp('three/addons/utils/BufferGeometryUtils.js'), imp('three-bvh-csg'), imp('three-mesh-bvh')])
			.then(function (m) { T = m[0]; OrbitControls = m[1].OrbitControls; TransformControls = m[2].TransformControls; BGU = m[3]; CSG = m[4]; BVH = m[5]; });
	}
	function addon(path) { return imp('three/addons/' + path); }
	function loadFont(id) {
		if (FONTS[id]) return Promise.resolve(FONTS[id]);
		if (fontWait[id]) return fontWait[id];
		return (fontWait[id] = Promise.all([addon('loaders/FontLoader.js'), fetch('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/' + id + '.typeface.json').then(function (r) { if (!r.ok) throw new Error('font ' + r.status); return r.json(); })])
			.then(function (a) { FONTS[id] = new a[0].FontLoader().parse(a[1]); return FONTS[id]; }));
	}
	var TextGeometry = null;

	// ---------- geometry ----------
	function finish(g, keepPlace) {
		if (g.index) g = g.toNonIndexed();
		Object.keys(g.attributes).forEach(function (a) { if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); });
		g.clearGroups();
		if (!g.attributes.normal) g.computeVertexNormals();
		var pos = g.attributes.position.array;
		if (L.volumeArea(pos).volume < 0) { L.flipWinding(pos); var nr = g.attributes.normal.array; for (var i = 0; i < nr.length; i++) nr[i] = -nr[i]; }
		g.computeBoundingBox();
		if (!keepPlace) { var c = new T.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z); g.computeBoundingBox(); }
		g.computeBoundingSphere();
		return g;
	}
	function fitTo(g, w, d, h) { g.computeBoundingBox(); var b = g.boundingBox, c = new T.Vector3(); b.getCenter(c); g.translate(-c.x, -c.y, -c.z); var s = new T.Vector3(); b.getSize(s); g.scale(w / (s.x || 1), d / (s.y || 1), h / (s.z || 1)); return g; }
	function v2(a) { return a.map(function (p) { return new T.Vector2(p[0], p[1]); }); }
	function shapeOf(sh) { var s = new T.Shape(v2(L.ccw(sh.o))); (sh.h || []).forEach(function (h) { s.holes.push(new T.Path(v2(L.ccw(h).reverse()))); }); return s; }
	function extrude(shapes, depth, curve) { var g = new T.ExtrudeGeometry(shapes, { depth: Math.max(0.01, depth), bevelEnabled: false, curveSegments: curve || 12 }); return g; }
	function num(v, d, lo, hi) { v = +v; if (!isFinite(v)) v = d; if (lo != null) v = Math.max(lo, v); if (hi != null) v = Math.min(hi, v); return v; }
	function primGeo(o) {
		var p = o.p || {}, w = num(p.w, 20, 0.01), d = num(p.d, 20, 0.01), h = num(p.h, 20, 0.01), g;
		switch (o.type) {
			case 'box': g = new T.BoxGeometry(w, d, h); break;
			case 'plate': g = extrude([shapeOf({ o: L.roundedRect(w, d, num(p.r, 4, 0), 8) })], h); break;
			case 'sphere': g = fitTo(new T.SphereGeometry(1, num(p.seg, 48, 8, 160) | 0, Math.max(6, num(p.seg, 48, 8, 160) / 2 | 0)).rotateX(Math.PI / 2), w, d, h); break;
			case 'cylinder': g = fitTo(new T.CylinderGeometry(1, 1, 1, num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2), w, d, h); break;
			case 'cone': var top = num(p.top, 0, 0, 100) / 100; g = new T.CylinderGeometry(Math.max(top, 0.0001), 1, 1, num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2); g.scale(w / 2, d / 2, h); break;
			case 'pyramid': var n = num(p.sides, 4, 3, 64) | 0; g = fitTo(new T.ConeGeometry(1, 1, n).rotateY(n === 4 ? Math.PI / 4 : 0).rotateX(Math.PI / 2), w, d, h); break;
			case 'wedge': g = fitTo(extrude([new T.Shape(v2([[0, 0], [w, 0], [0, h]]))], d).rotateX(Math.PI / 2), w, d, h); break;
			case 'torus': g = fitTo(new T.TorusGeometry(1, 0.3, Math.max(8, num(p.seg, 64, 8, 256) / 3 | 0), num(p.seg, 64, 8, 256) | 0), w, d, h); break;
			case 'tube':
				var ro = w / 2, ri = Math.max(0.05, ro - num(p.wall, 2, 0.1));
				if (ri >= ro) ri = ro * 0.5;
				g = new T.LatheGeometry(v2([[ri, 0], [ro, 0], [ro, h], [ri, h], [ri, 0]]), num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2); g.scale(1, d / w, 1); break;
			case 'star': g = fitTo(extrude([shapeOf({ o: L.starPts(num(p.points, 5, 3, 40), 1, num(p.inner, 45, 5, 95) / 100) })], 1), w, d, h); break;
			case 'heart': g = fitTo(extrude([shapeOf({ o: L.heartPts(1, 96) })], 1), w, d, h); break;
			case 'gear':
				var gp = L.gearPts(num(p.teeth, 16, 6, 200), num(p.mod, 2, 0.2, 20)), sh = { o: gp.pts, h: [] }, bore = num(p.bore, 0, 0);
				if (bore > 0 && bore / 2 < gp.root - 0.5) sh.h.push(L.circlePts(bore / 2, 48));
				g = extrude([shapeOf(sh)], num(p.h, 6, 0.2)); break;
			case 'text':
				var font = FONTS[p.font || 'helvetiker_bold'];
				if (!font || !TextGeometry) { needFont(p.font || 'helvetiker_bold'); g = new T.BoxGeometry(Math.max(1, String(p.text || ' ').length) * num(p.size, 10, 0.5) * 0.7, num(p.size, 10, 0.5), num(p.depth, 3, 0.1)); g.userData.temp = true; break; }
				var txt = String(p.text || ' ').replace(/\r/g, '');
				g = new TextGeometry(txt.trim() ? txt : '?', { font: font, size: num(p.size, 10, 0.5), depth: num(p.depth, 3, 0.1), curveSegments: 6, bevelEnabled: false });
				break;
			case 'lathe':
				var pts = L.cleanProfile(p.pts || []);
				if (pts.length < 3) pts = [[0, 0], [10, 0], [0, 10]];
				var loop = pts.concat([pts[0]]);
				g = new T.LatheGeometry(v2(loop), num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2); break;
			case 'extrude':
				var shapes = (p.shapes || []).filter(function (s) { return s && s.o && s.o.length >= 3; }).map(shapeOf);
				if (!shapes.length) shapes = [shapeOf({ o: [[0, 0], [10, 0], [0, 10]] })];
				g = extrude(shapes, num(p.depth, 5, 0.05)); break;
			case 'mesh':
				g = new T.BufferGeometry();
				var arr = MESH[p.ref];
				g.setAttribute('position', new T.BufferAttribute(arr ? new Float32Array(arr) : new Float32Array(9), 3));
				g.computeVertexNormals();
				return finish(g, true);
			default: g = new T.BoxGeometry(10, 10, 10);
		}
		var temp = g.userData && g.userData.temp;
		g = finish(g);
		if (temp) g.userData.temp = true;
		return g;
	}
	function geoKey(o) {
		if (o.type === 'group') return 'g' + (o.op || 'union') + '[' + o.children.filter(function (c) { return !c.hidden; }).map(function (c) { return geoKey(c) + '@' + c.pos + '|' + c.rot + '|' + c.scl + (c.hole ? 'H' : ''); }).join(';') + ']';
		if (o.type === 'text') return 'text' + JSON.stringify(o.p) + (FONTS[o.p.font || 'helvetiker_bold'] && TextGeometry ? '' : '~');
		return o.type + JSON.stringify(o.p);
	}
	function geoFor(o) {
		var k = geoKey(o), g = geoCache.get(k);
		if (g) return g;
		g = o.type === 'group' ? groupGeo(o) : primGeo(o);
		if (!(g.userData && g.userData.temp)) { geoCache.set(k, g); if (geoCache.size > 400) { var first = geoCache.keys().next().value; geoCache.delete(first); } }
		return g;
	}
	var _q = null;
	function matOf(o) {
		var m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(o.rot[0] * Math.PI / 180, o.rot[1] * Math.PI / 180, o.rot[2] * Math.PI / 180, 'XYZ'));
		return m.compose(new T.Vector3(o.pos[0], o.pos[1], o.pos[2]), q, new T.Vector3(o.scl[0], o.scl[1], o.scl[2]));
	}
	// the object's geometry placed with matrix m (inside-out fixed when the matrix mirrors)
	function placed(o, m) {
		var g = geoFor(o).clone(); g.applyMatrix4(m);
		if (m.determinant() < 0) { L.flipWinding(g.attributes.position.array); }
		return g;
	}
	var evaluator = null;
	function groupGeo(o) {
		var solids = [], holes = [];
		o.children.forEach(function (c) { if (!c.hidden) (c.hole ? holes : solids).push(c); });
		var list = solids.length ? solids : holes;     // a group of only holes is itself a hole
		if (!list.length) return finish(new T.BoxGeometry(0.01, 0.01, 0.01), true);
		if (!evaluator) { evaluator = new CSG.Evaluator(); evaluator.attributes = ['position', 'normal']; evaluator.useGroups = false; }
		// shapes that only touch (a word standing on a plate) give exactly coplanar faces, which booleans handle badly and slowly;
		// growing each part by a few ten-thousandths of a millimetre about its centre turns touching into a hair of overlap
		var kid = 0;
		function brush(c) {
			kid++;
			var g = placed(c, matOf(c)); g.computeBoundingBox(); var ctr = new T.Vector3(); g.boundingBox.getCenter(ctr);
			var k = 1 + 2e-5 * kid; g.translate(-ctr.x, -ctr.y, -ctr.z); g.scale(k, k, k); g.translate(ctr.x, ctr.y, ctr.z);
			var b = new CSG.Brush(g); b.updateMatrixWorld(); return b;
		}
		try {
			var acc = brush(list[0]);
			for (var i = 1; i < list.length; i++) acc = evaluator.evaluate(acc, brush(list[i]), o.op === 'intersect' && solids.length ? CSG.INTERSECTION : CSG.ADDITION);
			if (solids.length) holes.forEach(function (hc) { acc = evaluator.evaluate(acc, brush(hc), CSG.SUBTRACTION); });
			var g = acc.geometry.clone();
			if (!g.attributes.position || !g.attributes.position.count) return finish(new T.BoxGeometry(0.01, 0.01, 0.01), true);
			return finish(g, true);
		} catch (e) {
			console.warn('CSG failed', e);
			var gs = list.map(function (c) { return placed(c, matOf(c)); });
			return finish(BGU.mergeGeometries(gs), true);
		}
	}
	function isHoleGroup(o) { return o.type === 'group' && !o.children.some(function (c) { return !c.hidden && !c.hole; }); }
	var fontAsked = {};
	function textReady(id) { return (TextGeometry ? Promise.resolve() : addon('geometries/TextGeometry.js').then(function (m) { TextGeometry = m.TextGeometry; })).then(function () { return loadFont(id || 'helvetiker_bold'); }); }
	function needFont(id) {
		if (fontAsked[id]) return; fontAsked[id] = 1;
		textReady(id).then(function () { sync(); }).catch(function (e) { fontAsked[id] = 0; toast('Could not load the font: ' + e.message); });
	}

	// ---------- scene ----------
	var MAT = {};
	function matFor(o) {
		var hole = o.hole || isHoleGroup(o), key = hole ? 'hole' : (o.color || '#3b82f6');
		if (!MAT[key]) MAT[key] = hole ? new T.MeshStandardMaterial({ color: 0x9aa4b2, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.6, side: T.DoubleSide })
			: new T.MeshStandardMaterial({ color: new T.Color(key), roughness: 0.55, metalness: 0.04 });
		return MAT[key];
	}
	function initScene() {
		renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.setClearColor(0x1b1f27);
		view.insertBefore(renderer.domElement, view.firstChild);
		renderer.domElement.className = 'td-canvas';
		scene = new T.Scene();
		T.Object3D.DEFAULT_UP.set(0, 0, 1);
		camera = new T.PerspectiveCamera(38, 1, 0.5, 20000);
		camera.up.set(0, 0, 1);
		camera.position.set(170, -230, 190);
		lights.hemi = new T.HemisphereLight(0xffffff, 0x3a4252, 1.6); lights.hemi.position.set(0, 0, 1); scene.add(lights.hemi);
		lights.dir = new T.DirectionalLight(0xffffff, 1.6); scene.add(lights.dir); scene.add(lights.dir.target);
		orbit = new OrbitControls(camera, renderer.domElement);
		orbit.enableDamping = false; orbit.screenSpacePanning = true; orbit.zoomToCursor = true;
		orbit.target.set(0, 0, 10);
		orbit.addEventListener('change', function () { dirty = true; });
		tc = new TransformControls(camera, renderer.domElement);
		tc.setSize(0.9);
		tc.addEventListener('dragging-changed', function (e) { orbit.enabled = !e.value; if (e.value) dragStart(); else dragEnd(); });
		tc.addEventListener('objectChange', dragMove);
		tc.addEventListener('change', function () { dirty = true; });
		scene.add(tc.getHelper());
		pivot = new T.Object3D(); scene.add(pivot);
		selBox = new T.Box3Helper(new T.Box3(), 0x60a5fa); selBox.visible = false; scene.add(selBox);
		plateGroup = new T.Group(); scene.add(plateGroup);
		buildPlate();
		new ResizeObserver(resize).observe(view);
		resize();
		applySnap(); setMode('translate');
		pointerSetup();
		requestAnimationFrame(loop);
	}
	function resize() {
		var w = Math.max(50, view.clientWidth), h = Math.max(50, view.clientHeight);
		renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
	}
	function buildPlate() {
		while (plateGroup.children.length) { var c = plateGroup.children.pop(); if (c.geometry) c.geometry.dispose(); }
		var P = plate(), hx = P.x / 2, hy = P.y / 2;
		var floor = new T.Mesh(new T.PlaneGeometry(P.x, P.y), new T.MeshStandardMaterial({ color: 0x2c3442, roughness: 0.95, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
		floor.position.z = -0.02; floor.userData.floor = true; plateGroup.add(floor);
		var minor = [], major = [], step = ST.grid >= 1 ? ST.grid : 1;
		if (P.x / step > 300) step = 5;
		for (var x = 0; x <= hx + 1e-6; x += step) [x, -x].forEach(function (xx, i) { if (i && !x) return; (Math.abs(Math.round(xx / 10) * 10 - xx) < 1e-6 ? major : minor).push(xx, -hy, 0, xx, hy, 0); });
		for (var y = 0; y <= hy + 1e-6; y += step) [y, -y].forEach(function (yy, i) { if (i && !y) return; (Math.abs(Math.round(yy / 10) * 10 - yy) < 1e-6 ? major : minor).push(-hx, yy, 0, hx, yy, 0); });
		function lines(a, color, op) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(a, 3)); return new T.LineSegments(g, new T.LineBasicMaterial({ color: color, transparent: true, opacity: op })); }
		if (minor.length && step < 10) plateGroup.add(lines(minor, 0x8fa0b8, 0.10));
		plateGroup.add(lines(major, 0x9fb0c8, 0.26));
		plateGroup.add(lines([-hx, -hy, 0, hx, -hy, 0, hx, -hy, 0, hx, hy, 0, hx, hy, 0, -hx, hy, 0, -hx, hy, 0, -hx, -hy, 0], 0xcbd5e1, 0.7));
		plateGroup.add(lines([-hx, -hy, 0.05, -hx + 20, -hy, 0.05], 0xef4444, 1));
		plateGroup.add(lines([-hx, -hy, 0.05, -hx, -hy + 20, 0.05], 0x22c55e, 1));
		plateGroup.add(lines([-hx, -hy, 0, -hx, -hy, 20], 0x3b82f6, 1));
		if (ST.showVol) {
			var z = P.z, b = [];
			[[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].forEach(function (c, i, a) { var n = a[(i + 1) % 4]; b.push(c[0], c[1], 0, c[0], c[1], z, c[0], c[1], z, n[0], n[1], z); });
			plateGroup.add(lines(b, 0x94a3b8, 0.13));
		}
		dirty = true;
	}
	function loop() {
		requestAnimationFrame(loop);
		if (dirty) render();
	}
	function render() {
		if (!renderer) return;
		dirty = false;
		lights.dir.position.copy(camera.position).add(new T.Vector3(40, -20, 80));
		lights.dir.target.position.copy(orbit.target);
		renderer.render(scene, camera);
		labels();
	}
	// make the meshes match S.objs
	function sync() {
		if (!ready) return;
		var seen = {};
		S.objs.forEach(function (o) {
			seen[o.id] = 1;
			var m = meshes[o.id], k = geoKey(o);
			if (!m) { m = new T.Mesh(geoFor(o), matFor(o)); m.userData.id = o.id; m.userData.key = k; scene.add(m); meshes[o.id] = m; }
			else if (m.userData.key !== k) { m.geometry = geoFor(o); m.userData.key = k; }
			m.material = matFor(o);
			m.renderOrder = o.hole || isHoleGroup(o) ? 2 : 0;
			m.visible = !o.hidden;
			setXform(m, o);
		});
		Object.keys(meshes).forEach(function (id) { if (!seen[id]) { scene.remove(meshes[id]); delete meshes[id]; } });
		S.sel = S.sel.filter(function (id) { return meshes[id]; });
		attach();
		$('#td-empty').hidden = S.objs.length > 0;
		dirty = true;
		outliner(); inspector(); status(); schedCheck();
	}
	function setXform(m, o) { m.position.set(o.pos[0], o.pos[1], o.pos[2]); m.rotation.set(o.rot[0] * Math.PI / 180, o.rot[1] * Math.PI / 180, o.rot[2] * Math.PI / 180, 'XYZ'); m.scale.set(o.scl[0], o.scl[1], o.scl[2]); m.updateMatrixWorld(); }
	function readXform(m, o) {
		var r2 = function (v) { return Math.round(v * 1e4) / 1e4; };
		o.pos = [r2(m.position.x), r2(m.position.y), r2(m.position.z)];
		o.rot = [r2(T.MathUtils.radToDeg(m.rotation.x)), r2(T.MathUtils.radToDeg(m.rotation.y)), r2(T.MathUtils.radToDeg(m.rotation.z))];
		o.scl = [r2(m.scale.x) || 0.0001, r2(m.scale.y) || 0.0001, r2(m.scale.z) || 0.0001];
	}
	function worldBox(objs) {
		var b = new T.Box3();
		objs.forEach(function (o) { var m = meshes[o.id]; if (m) { m.updateMatrixWorld(); b.expandByObject(m, true); } });
		return b;
	}
	function boxArr(b) { return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }; }

	// ---------- selection + gizmo ----------
	var mode = 'translate', multi = null;
	function attach() {
		var objs = topSel().filter(function (o) { return !o.locked && !o.hidden; });
		tc.detach();
		if (objs.length === 1) tc.attach(meshes[objs[0].id]);
		else if (objs.length > 1) { var b = worldBox(objs), c = new T.Vector3(); b.getCenter(c); pivot.position.copy(c); pivot.rotation.set(0, 0, 0); pivot.scale.set(1, 1, 1); pivot.updateMatrixWorld(); tc.attach(pivot); }
		var all = topSel();
		if (all.length) { var bb = worldBox(all); selBox.box.copy(bb); selBox.visible = !bb.isEmpty(); } else selBox.visible = false;
		tc.setSpace(mode === 'translate' || objs.length > 1 ? 'world' : 'local');
		dirty = true;
	}
	function select(ids, add) {
		if (add) ids.forEach(function (id) { var i = S.sel.indexOf(id); if (i >= 0) S.sel.splice(i, 1); else S.sel.push(id); });
		else S.sel = ids.slice();
		attach(); outliner(); inspector(); status();
	}
	function setMode(m) { mode = m; tc.setMode(m); $$('.td-mode').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'); }); attach(); }
	function applySnap(off) {
		var on = ST.snap && !off;
		tc.setTranslationSnap(on ? +ST.grid : null);
		tc.setRotationSnap(on ? T.MathUtils.degToRad(15) : null);
		tc.setScaleSnap(on ? 0.05 : null);
	}
	function dragStart() {
		var objs = topSel().filter(function (o) { return !o.locked && !o.hidden; });
		if (objs.length > 1) {
			multi = { inv: pivot.matrixWorld.clone().invert(), items: objs.map(function (o) { var m = meshes[o.id]; m.updateMatrixWorld(); return { o: o, m: m.matrixWorld.clone() }; }) };
		} else multi = null;
	}
	function dragMove() {
		var objs = topSel().filter(function (o) { return !o.locked && !o.hidden; });
		if (multi) {
			pivot.updateMatrixWorld();
			var delta = pivot.matrixWorld.clone().multiply(multi.inv), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
			multi.items.forEach(function (it) {
				var m = delta.clone().multiply(it.m); m.decompose(p, q, s);
				var mesh = meshes[it.o.id]; mesh.position.copy(p); mesh.quaternion.copy(q); mesh.scale.copy(s); mesh.updateMatrixWorld();
				readXform(mesh, it.o);
			});
		} else if (objs.length === 1) readXform(meshes[objs[0].id], objs[0]);
		var bb = worldBox(topSel()); selBox.box.copy(bb);
		dirty = true; status(); inspectorValues();
	}
	function dragEnd() {
		topSel().forEach(function (o) { if (mode === 'scale') bakeScale(o); });
		multi = null;
		commit(mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Resize');
	}
	// shapes with size settings (w, d, h) keep scale 1: a stretch becomes new sizes, so rounded corners and walls stay true
	function bakeScale(o) {
		var def = PRIMS[o.type];
		if (!def || !def.dims) return;
		var s = o.scl.map(Math.abs);
		o.p.w = +(o.p.w * s[0]).toFixed(3); o.p.d = +(o.p.d * s[1]).toFixed(3); o.p.h = +(o.p.h * s[2]).toFixed(3);
		o.scl = o.scl.map(function (v) { return v < 0 ? -1 : 1; });
	}

	// ---------- history + autosave ----------
	function snapshot() { return JSON.stringify({ objs: S.objs, name: S.name }); }
	function commit(label) {
		hist = hist.slice(0, hpos + 1); hist.push(snapshot()); if (hist.length > 120) hist.shift(); hpos = hist.length - 1;
		sync(); undoBtns(); autosave();
	}
	function restore(json) { var d = JSON.parse(json); S.objs = d.objs; S.name = d.name || S.name; sync(); undoBtns(); autosave(); }
	function undo() { if (hpos > 0) { hpos--; restore(hist[hpos]); } }
	function redo() { if (hpos < hist.length - 1) { hpos++; restore(hist[hpos]); } }
	function undoBtns() { $('[data-act=undo]').disabled = hpos <= 0; $('[data-act=redo]').disabled = hpos >= hist.length - 1; }
	var DB = null;
	function db() {
		if (DB) return DB;
		DB = new Promise(function (res, rej) { try { var r = indexedDB.open('mes-3d-studio', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; } catch (e) { rej(e); } });
		return DB;
	}
	function usedRefs() { var r = {}; walk(S.objs, function (o) { if (o.type === 'mesh' && o.p.ref) r[o.p.ref] = MESH[o.p.ref]; }); return r; }
	function autosave() {
		clearTimeout(autosave.t);
		autosave.t = setTimeout(function () {
			db().then(function (d) { var tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ name: S.name, objs: JSON.stringify(S.objs), meshes: usedRefs(), t: Date.now() }, 'auto'); }).catch(function () {});
		}, 1200);
	}
	function loadAuto() {
		return db().then(function (d) { return new Promise(function (res) { var r = d.transaction('kv').objectStore('kv').get('auto'); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); }).catch(function () { return null; });
	}

	// ---------- adding things ----------
	function newObj(type, p, ext) {
		var def = PRIMS[type] || {};
		var o = { id: uid(), name: '', type: type, p: clone(p || def.p || {}), pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], color: nextColor(), hole: !!ST.addHole };
		for (var k in ext || {}) o[k] = ext[k];
		return o;
	}
	// put new objects next to what is there (in front of the view), on the floor
	function placeNew(objs) {
		objs.forEach(function (o) { S.objs.push(o); });
		sync();
		var b = worldBox(objs), c = new T.Vector3(); b.getCenter(c);
		var t = orbit.target.clone(), P = plate();
		t.x = Math.max(-P.x / 2 + 10, Math.min(P.x / 2 - 10, t.x)); t.y = Math.max(-P.y / 2 + 10, Math.min(P.y / 2 - 10, t.y));
		var others = S.objs.filter(function (o) { return objs.indexOf(o) < 0 && !o.hidden; }), dx = t.x - c.x, dy = t.y - c.y;
		var target = topSel().filter(function (o) { return objs.indexOf(o) < 0; });
		if (objs.every(function (o) { return o.hole; }) && target.length) {
			// a new hole goes straight into the selected shape, ready to be grouped
			var tb = worldBox(target), tc2 = new T.Vector3(); tb.getCenter(tc2); dx = tc2.x - c.x; dy = tc2.y - c.y;
		} else if (others.length) {
			var ob = worldBox(others), sz = new T.Vector3(); b.getSize(sz);
			for (var tries = 0; tries < 12; tries++) {
				var test = b.clone().translate(new T.Vector3(dx, dy, 0));
				if (!test.intersectsBox(ob)) break;
				dx += sz.x + 5;
			}
		}
		objs.forEach(function (o) { o.pos[0] += dx; o.pos[1] += dy; o.pos[2] += -b.min.z; o.pos = o.pos.map(function (v) { return Math.round(v * 1000) / 1000; }); });
		S.sel = objs.map(function (o) { return o.id; });
		commit('Add');
	}
	function addPrim(type) {
		if (!ready) return;
		var o = newObj(type);
		if (type === 'lathe' || type === 'extrude') { sketch(o, true); return; }
		placeNew([o]);
		if (type === 'text') { setTab('obj'); setTimeout(function () { var t = $('#td-p-text'); if (t) { t.focus(); t.select(); } }, 60); }
	}
	function fromTemplate(t) {
		var objs = t.make().map(function (o) { return prep(o); });
		function prep(o) { o.id = uid(); o.name = o.name || ''; o.hole = !!o.hole; if (!o.color) o.color = nextColor(); if (o.children) o.children.forEach(prep); return o; }
		// treat the template as one block: centre it on the view, on the floor
		objs.forEach(function (o) { S.objs.push(o); }); sync();
		var b = worldBox(objs), c = new T.Vector3(); b.getCenter(c);
		S.objs = S.objs.filter(function (o) { return objs.indexOf(o) < 0; });
		objs.forEach(function (o) { o.pos[0] -= c.x; o.pos[1] -= c.y; o.pos[2] -= b.min.z; });
		placeNew(objs);
		frame(objs);
	}

	// ---------- edits ----------
	function selected(needLock) { var s = topSel(); return needLock ? s.filter(function (o) { return !o.locked; }) : s; }
	function del() { var ids = selected(true).map(function (o) { return o.id; }); if (!ids.length) return; S.objs = S.objs.filter(function (o) { return ids.indexOf(o.id) < 0; }); S.sel = []; commit('Delete'); }
	function dup() {
		var s = selected(); if (!s.length) return;
		var copies = s.map(function (o) { var c = reId(clone(o)); c.pos[0] += Math.max(5, +ST.grid * 5); c.pos[1] += Math.max(5, +ST.grid * 5); c.name = o.name ? o.name + ' copy' : ''; return c; });
		var at = S.objs.indexOf(s[s.length - 1]) + 1; S.objs.splice.apply(S.objs, [at, 0].concat(copies));
		S.sel = copies.map(function (o) { return o.id; }); commit('Duplicate');
	}
	function toggleHole() { var s = selected(true); if (!s.length) return toast('Select a shape first.'); var to = !s.every(function (o) { return o.hole; }); s.forEach(function (o) { o.hole = to; }); commit(to ? 'Make hole' : 'Make solid'); if (to) toast('Holes cut into the solids you group them with. Select both and press Group.'); }
	function group(op, autoHoles) {
		var s = selected(true);
		if (s.length < 2) return toast(autoHoles ? 'Select the shape to cut and the shapes to cut out of it (Shift-click), then press Subtract.' : 'Select two or more shapes (Shift-click or Ctrl+A), then press Group.');
		if (autoHoles) {
			var vol = function (o) { var b = worldBox([o]), z = new T.Vector3(); b.getSize(z); return z.x * z.y * z.z; };
			var big = s.slice().sort(function (a, b) { return vol(b) - vol(a); })[0];
			s.forEach(function (o) { if (o !== big) o.hole = true; else o.hole = false; });
		}
		var b = worldBox(s), c = new T.Vector3(); b.getCenter(c);
		var firstSolid = s.find(function (o) { return !o.hole; }) || s[0];
		var g = { id: uid(), name: '', type: 'group', op: op || 'union', children: [], pos: [c.x, c.y, c.z].map(function (v) { return Math.round(v * 1000) / 1000; }), rot: [0, 0, 0], scl: [1, 1, 1], color: firstSolid.color, hole: false };
		var at = Math.min.apply(null, s.map(function (o) { return S.objs.indexOf(o); }));
		s.forEach(function (o) { o.pos = [o.pos[0] - g.pos[0], o.pos[1] - g.pos[1], o.pos[2] - g.pos[2]]; g.children.push(o); });
		S.objs = S.objs.filter(function (o) { return s.indexOf(o) < 0; });
		S.objs.splice(at, 0, g); S.sel = [g.id];
		commit(op === 'intersect' ? 'Intersect' : 'Group');
		if (!s.some(function (o) { return o.hole; }) && op !== 'intersect') toast('Grouped. Tip: make a shape a Hole before grouping to cut it out.');
	}
	function ungroup() {
		var gs = selected(true).filter(function (o) { return o.type === 'group'; });
		if (!gs.length) return toast('Select a group to ungroup.');
		var ids = [];
		gs.forEach(function (g) {
			var gm = matOf(g), at = S.objs.indexOf(g), out = [], p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(), e = new T.Euler();
			g.children.forEach(function (c) {
				gm.clone().multiply(matOf(c)).decompose(p, q, sc); e.setFromQuaternion(q, 'XYZ');
				var r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
				c.pos = [r4(p.x), r4(p.y), r4(p.z)]; c.rot = [r4(e.x * 180 / Math.PI), r4(e.y * 180 / Math.PI), r4(e.z * 180 / Math.PI)]; c.scl = [r4(sc.x), r4(sc.y), r4(sc.z)];
				out.push(c); ids.push(c.id);
			});
			S.objs.splice.apply(S.objs, [at, 1].concat(out));
		});
		S.sel = ids; commit('Ungroup');
	}
	function mirror(axis) {
		var s = selected(true); if (!s.length) return toast('Select a shape first.');
		var b = worldBox(s), c = new T.Vector3(); b.getCenter(c);
		s.forEach(function (o) {
			// mirror through the selection's centre plane: reflect the whole transform
			var R = new T.Matrix4().makeTranslation(axis === 0 ? 2 * c.x : 0, axis === 1 ? 2 * c.y : 0, axis === 2 ? 2 * c.z : 0).multiply(new T.Matrix4().makeScale(axis === 0 ? -1 : 1, axis === 1 ? -1 : 1, axis === 2 ? -1 : 1));
			var m = R.multiply(matOf(o)), p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(), e = new T.Euler();
			m.decompose(p, q, sc); e.setFromQuaternion(q, 'XYZ');
			o.pos = [p.x, p.y, p.z]; o.rot = [e.x * 180 / Math.PI, e.y * 180 / Math.PI, e.z * 180 / Math.PI].map(function (v) { return Math.round(v * 1e4) / 1e4; }); o.scl = [sc.x, sc.y, sc.z];
		});
		commit('Mirror');
	}
	function drop(objs) {
		var s = objs || selected(true); if (!s.length) s = S.objs.filter(function (o) { return !o.locked; });
		s.forEach(function (o) { var b = worldBox([o]); if (!b.isEmpty()) o.pos[2] = Math.round((o.pos[2] - b.min.z) * 1e4) / 1e4; });
		commit('Drop to plate');
	}
	function centerOnPlate() {
		var s = selected(true); if (!s.length) return;
		var b = worldBox(s), c = new T.Vector3(); b.getCenter(c);
		s.forEach(function (o) { o.pos[0] -= c.x; o.pos[1] -= c.y; });
		commit('Centre on plate');
	}
	function align(k, how) {
		var s = selected(true); if (s.length < 2) return;
		var sh = L.alignShifts(s.map(function (o) { return boxArr(worldBox([o])); }), k, how);
		s.forEach(function (o, i) { o.pos[k] += sh[i]; }); commit('Align');
	}
	function distribute(k) {
		var s = selected(true); if (s.length < 3) return toast('Select three or more shapes to spread them out.');
		var sh = L.distributeShifts(s.map(function (o) { return boxArr(worldBox([o])); }), k);
		s.forEach(function (o, i) { o.pos[k] += sh[i]; }); commit('Distribute');
	}

	// ---------- views ----------
	function frame(objs) {
		var list = objs && objs.length ? objs : S.objs.filter(function (o) { return !o.hidden; });
		var b = list.length ? worldBox(list) : null;
		if (!b || b.isEmpty()) { var P = plate(); b = new T.Box3(new T.Vector3(-P.x / 3, -P.y / 3, 0), new T.Vector3(P.x / 3, P.y / 3, 20)); }
		var c = new T.Vector3(), sz = new T.Vector3(); b.getCenter(c); b.getSize(sz);
		var r = Math.max(10, sz.length() / 2), dist = r / Math.sin(camera.fov * Math.PI / 360) * 1.15;
		var dir = camera.position.clone().sub(orbit.target).normalize();
		tween(c, c.clone().add(dir.multiplyScalar(dist)));
	}
	function setView(v) {
		if (v === 'frame') return frame(topSel());
		var t = orbit.target.clone(), d = camera.position.distanceTo(t), dir;
		if (v === 'top') dir = new T.Vector3(0, -0.0001, 1);
		else if (v === 'front') dir = new T.Vector3(0, -1, 0);
		else if (v === 'side') dir = new T.Vector3(1, 0, 0);
		else dir = new T.Vector3(0.6, -0.8, 0.65).normalize();
		tween(t, t.clone().add(dir.normalize().multiplyScalar(d)));
	}
	function tween(target, pos) {
		var t0 = performance.now(), a = orbit.target.clone(), b = camera.position.clone();
		(function step() {
			var k = Math.min(1, (performance.now() - t0) / 260), e = k * k * (3 - 2 * k);
			orbit.target.lerpVectors(a, target, e); camera.position.lerpVectors(b, pos, e); orbit.update(); dirty = true;
			if (k < 1) requestAnimationFrame(step);
		})();
		if (document.hidden) { orbit.target.copy(target); camera.position.copy(pos); orbit.update(); render(); }
	}

	// ---------- pointer: click to select, floor readout ----------
	var ray, ptr, down = null, floorPt = null;
	function pointerSetup() {
		ray = new T.Raycaster(); ptr = new T.Vector2();
		var el = renderer.domElement;
		el.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
		el.addEventListener('pointerup', function (e) {
			if (!down || tc.dragging) return;
			var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
			if (moved > 5 || tc.axis) return;
			var hit = pick(e);
			if (hit) select([hit], e.shiftKey || e.ctrlKey || e.metaKey);
			else if (!e.shiftKey) select([]);
		});
		el.addEventListener('pointermove', function (e) {
			setPtr(e); ray.setFromCamera(ptr, camera);
			var p = new T.Vector3(); floorPt = ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), 0), p) ? p : null; status();
		});
		el.addEventListener('dblclick', function (e) { var id = pick(e); if (id) { select([id]); frame(topSel()); } });
	}
	function setPtr(e) { var r = renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
	function pick(e) {
		setPtr(e); ray.setFromCamera(ptr, camera);
		var list = S.objs.filter(function (o) { return !o.hidden; }).map(function (o) { return meshes[o.id]; }).filter(Boolean);
		var hits = ray.intersectObjects(list, false);
		if (!hits.length) return null;
		var solid = hits.find(function (h) { var o = byId(h.object.userData.id); return o && !o.hole; });   // see through holes to solids behind? prefer the nearest
		return hits[0].object.userData.id || (solid && solid.object.userData.id);
	}

	// ---------- labels (sizes of the selection) ----------
	function labels() {
		var box = $('#td-labels'), s = topSel(), html = '';
		if (s.length && selBox.visible) {
			var b = selBox.box, w = view.clientWidth, h = view.clientHeight;
			var pts = [[(b.min.x + b.max.x) / 2, b.min.y, b.min.z, b.max.x - b.min.x, 'x'], [b.max.x, (b.min.y + b.max.y) / 2, b.min.z, b.max.y - b.min.y, 'y'], [b.max.x, b.min.y, (b.min.z + b.max.z) / 2, b.max.z - b.min.z, 'z']];
			pts.forEach(function (p) {
				var v = new T.Vector3(p[0], p[1], p[2]).project(camera);
				if (v.z > 1) return;
				var x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
				if (x < 0 || y < 0 || x > w || y > h) return;
				html += '<span class="td-lab td-lab--' + p[4] + '" style="left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px">' + u(p[3]) + '</span>';
			});
		}
		box.innerHTML = html;
	}
	function status() {
		var s = topSel(), parts = [], P = plate();
		if (s.length) { var b = worldBox(s), z = new T.Vector3(); b.getSize(z); parts.push('<b>' + (s.length === 1 ? esc(nameOf(s[0])) : s.length + ' selected') + '</b> ' + u(z.x) + ' × ' + u(z.y) + ' × ' + u(z.z) + ' ' + uu()); }
		else if (S.objs.length) { var ab = worldBox(S.objs.filter(function (o) { return !o.hidden; })), az = new T.Vector3(); ab.getSize(az); parts.push('Everything: ' + u(az.x) + ' × ' + u(az.y) + ' × ' + u(az.z) + ' ' + uu()); }
		if (floorPt) parts.push('Pointer x ' + u(floorPt.x) + ', y ' + u(floorPt.y));
		parts.push(esc(P.name) + ' ' + P.x + '×' + P.y + '×' + P.z + ' mm');
		$('#td-status').innerHTML = parts.join('<span class="td-dot">·</span>');
	}

	// ---------- left panel ----------
	function shapesPanel() {
		$('#td-shapes').innerHTML = Object.keys(PRIMS).map(function (k) { return '<button type="button" class="td-shape" data-add="' + k + '" title="Add a ' + esc(PRIMS[k].name.toLowerCase()) + '"><span class="td-si">' + PRIMS[k].icon + '</span><span>' + esc(PRIMS[k].name.replace(/ \(.*/, '')) + '</span></button>'; }).join('')
			+ '<button type="button" class="td-shape" data-act="svg" title="Raise an SVG drawing into 3D"><span class="td-si">✎</span><span>SVG file</span></button>'
			+ '<button type="button" class="td-shape" data-act="photo3d" title="Turn a photo into a relief, coin, lithophane or figure"><span class="td-si">📷</span><span>Photo to 3D</span></button>';
	}
	var openGroups = {};
	function outliner() {
		var q = ($('#td-osearch').value || '').toLowerCase().trim(), out = [];
		function row(o, depth) {
			var kids = o.children || [], match = !q || nameOf(o).toLowerCase().indexOf(q) >= 0 || o.type.indexOf(q) >= 0;
			var kidsHtml = '';
			if (kids.length && (openGroups[o.id] || q)) kids.forEach(function (c) { kidsHtml += row(c, depth + 1); });
			if (!match && !kidsHtml) return '';
			var sel = depth === 0 && S.sel.indexOf(o.id) >= 0;
			var icon = o.type === 'group' ? (o.op === 'intersect' ? '⋂' : '⧉') : o.type === 'mesh' ? '▣' : (PRIMS[o.type] || {}).icon || '?';
			return '<div class="td-orow' + (sel ? ' on' : '') + (depth ? ' td-orow--kid' : '') + (o.hidden ? ' off' : '') + '" role="treeitem" aria-selected="' + sel + '" data-id="' + o.id + '" data-depth="' + depth + '" style="padding-left:' + (0.4 + depth * 1.1) + 'em">'
				+ (kids.length ? '<button type="button" class="td-otw" data-tw="' + o.id + '" aria-label="Show the parts">' + (openGroups[o.id] || q ? '▾' : '▸') + '</button>' : '<span class="td-otw"></span>')
				+ '<span class="td-osw" style="background:' + (o.hole ? 'transparent' : esc(o.color || '#888')) + '">' + icon + '</span>'
				+ '<span class="td-on" title="Double-click to rename">' + esc(nameOf(o)) + '</span>'
				+ (o.hole ? '<span class="td-tag">hole</span>' : '')
				+ (depth === 0 ? '<button type="button" class="td-oi" data-eye="' + o.id + '" title="' + (o.hidden ? 'Show' : 'Hide') + '" aria-label="' + (o.hidden ? 'Show' : 'Hide') + '">' + (o.hidden ? '◌' : '👁') + '</button><button type="button" class="td-oi" data-lock="' + o.id + '" title="' + (o.locked ? 'Unlock' : 'Lock (stops it moving)') + '" aria-label="Lock">' + (o.locked ? '🔒' : '🔓') + '</button>' : '')
				+ '</div>' + kidsHtml;
		}
		S.objs.forEach(function (o) { out.push(row(o, 0)); });
		var html = out.join('');
		$('#td-outl').innerHTML = html || '<p class="td-hint">' + (S.objs.length ? 'No part matches.' : 'Your parts will be listed here.') + '</p>';
		$('#td-ocount').textContent = S.objs.length ? '(' + S.objs.length + ')' : '';
	}

	// ---------- inspector ----------
	function inp(id, label, val, extra) { return '<label class="td-f"><span>' + label + '</span><input class="td-in" id="' + id + '" value="' + esc(val) + '" inputmode="decimal" autocomplete="off"' + (extra || '') + '></label>'; }
	function inspector() {
		var host = $('#td-insp'), s = topSel();
		if (!s.length) {
			host.innerHTML = '<p class="td-hint">Click a shape in the view or the Parts list to change it. Shift-click to pick several.</p>'
				+ '<div class="td-sec"><b>Project name</b><input class="td-in" id="td-pname" value="' + esc(S.name) + '" aria-label="Project name"></div>'
				+ '<div class="td-sec"><b>Quick start</b><ol class="td-steps"><li>Add a shape from the left.</li><li>Drag the arrows, or type sizes here.</li><li>Make a shape a <b>Hole</b>, then <b>Group</b> it with another to cut it out.</li><li>Check the <b>3D print</b> tab, then <b>Export</b>.</li></ol></div>';
			return;
		}
		if (s.length > 1) {
			host.innerHTML = '<div class="td-sec"><b>' + s.length + ' shapes selected</b><p class="td-hint">Drag the handles to move, turn or resize them together.</p>'
				+ '<div class="td-btns"><button type="button" class="td-b" data-act="group">⧉ Group</button><button type="button" class="td-b" data-act="subtract">⊖ Subtract</button><button type="button" class="td-b" data-act="intersect">⋂ Intersect</button></div></div>'
				+ alignHtml() + colorHtml(s[0].color) + '<div class="td-sec td-btns"><button type="button" class="td-b" data-act="hole">◌ Hole / solid</button><button type="button" class="td-b" data-act="dup">⧉ Duplicate</button><button type="button" class="td-b" data-act="drop">⤓ Drop</button><button type="button" class="td-b td-b--warn" data-act="delete">🗑 Delete</button></div>';
			return;
		}
		var o = s[0], def = PRIMS[o.type] || {}, b = worldBox([o]), sz = baseSize(o);
		var h = '<div class="td-sec"><input class="td-in td-name" id="td-oname" value="' + esc(o.name) + '" placeholder="' + esc(nameOf(o)) + '" aria-label="Name"></div>';
		h += '<div class="td-sec td-seg" role="group" aria-label="Solid or hole"><button type="button" class="td-b" data-solid="1" aria-pressed="' + !o.hole + '">■ Solid</button><button type="button" class="td-b" data-solid="0" aria-pressed="' + !!o.hole + '">◌ Hole</button></div>';
		if (!o.hole) h += colorHtml(o.color);
		h += '<div class="td-sec"><b>Size (' + uu() + ')</b> <label class="td-lock"><input type="checkbox" id="td-keep"' + (ST.keep ? ' checked' : '') + '> keep proportions</label><div class="td-3">'
			+ inp('td-sx', 'W (x)', u(sz[0])) + inp('td-sy', 'D (y)', u(sz[1])) + inp('td-sz', 'H (z)', u(sz[2])) + '</div></div>';
		h += '<div class="td-sec"><b>Position (' + uu() + ')</b> <span class="td-hint">centre of the shape</span><div class="td-3">'
			+ inp('td-px', 'X', u(o.pos[0])) + inp('td-py', 'Y', u(o.pos[1])) + inp('td-pz', 'Z', u(o.pos[2])) + '</div><div class="td-hint">Bottom at ' + u(b.min.z) + ' ' + uu() + (b.min.z > 0.01 ? ' (floating: press Drop)' : b.min.z < -0.01 ? ' (below the plate: press Drop)' : '') + '</div></div>';
		h += '<div class="td-sec"><b>Rotation (°)</b><div class="td-3">' + inp('td-rx', 'X', L.fmtNum(o.rot[0])) + inp('td-ry', 'Y', L.fmtNum(o.rot[1])) + inp('td-rz', 'Z', L.fmtNum(o.rot[2])) + '</div>'
			+ '<div class="td-btns td-btns--s"><button type="button" class="td-b td-b--s" data-rot="0,90">X +90°</button><button type="button" class="td-b td-b--s" data-rot="1,90">Y +90°</button><button type="button" class="td-b td-b--s" data-rot="2,90">Z +90°</button><button type="button" class="td-b td-b--s" data-rot="r">Reset</button></div></div>';
		h += paramsHtml(o, def);
		h += '<div class="td-sec td-btns"><button type="button" class="td-b" data-act="dup">⧉ Duplicate</button><button type="button" class="td-b" data-act="mirror">⇋ Mirror</button><button type="button" class="td-b" data-act="drop">⤓ Drop</button><button type="button" class="td-b" data-act="center">⌖ Centre on plate</button>'
			+ (o.type === 'group' ? '<button type="button" class="td-b" data-act="ungroup">⧈ Ungroup</button>' : '') + '<button type="button" class="td-b td-b--warn" data-act="delete">🗑 Delete</button></div>';
		host.innerHTML = h;
	}
	function baseSize(o) { var g = geoFor(o); g.computeBoundingBox(); var z = new T.Vector3(); g.boundingBox.getSize(z); return [z.x * Math.abs(o.scl[0]), z.y * Math.abs(o.scl[1]), z.z * Math.abs(o.scl[2])]; }
	function inspectorValues() {
		var s = topSel(); if (s.length !== 1 || !$('#td-px')) return;
		var o = s[0], sz = baseSize(o), map = { 'td-px': u(o.pos[0]), 'td-py': u(o.pos[1]), 'td-pz': u(o.pos[2]), 'td-rx': L.fmtNum(o.rot[0]), 'td-ry': L.fmtNum(o.rot[1]), 'td-rz': L.fmtNum(o.rot[2]), 'td-sx': u(sz[0]), 'td-sy': u(sz[1]), 'td-sz': u(sz[2]) };
		for (var id in map) { var el = $('#' + id); if (el && document.activeElement !== el) el.value = map[id]; }
	}
	function colorHtml(c) {
		return '<div class="td-sec"><b>Colour</b><div class="td-sw">' + COLORS.map(function (k) { return '<button type="button" class="td-swb' + (k === c ? ' on' : '') + '" data-color="' + k + '" style="background:' + k + '" aria-label="Colour ' + k + '"></button>'; }).join('')
			+ '<label class="td-swb td-swc" title="Any colour"><input type="color" id="td-color" value="' + esc(L.hex6(c).toLowerCase()) + '" aria-label="Pick any colour">＋</label></div></div>';
	}
	function alignHtml() {
		var a = function (k, n) { return '<div class="td-al"><span>' + n + '</span><button type="button" class="td-b td-b--s" data-align="' + k + ',min">' + (k === 2 ? 'Bottom' : k === 0 ? 'Left' : 'Front') + '</button><button type="button" class="td-b td-b--s" data-align="' + k + ',mid">Centre</button><button type="button" class="td-b td-b--s" data-align="' + k + ',max">' + (k === 2 ? 'Top' : k === 0 ? 'Right' : 'Back') + '</button><button type="button" class="td-b td-b--s" data-dist="' + k + '" title="Spread out evenly (3 or more)">Spread</button></div>'; };
		return '<div class="td-sec"><b>Align</b>' + a(0, 'X') + a(1, 'Y') + a(2, 'Z') + '</div>';
	}
	function pIn(key, label, val, kind) {
		if (kind === 'text') return '<label class="td-f td-f--w"><span>' + label + '</span><textarea class="td-in" id="td-p-' + key + '" data-p="' + key + '" rows="2">' + esc(val) + '</textarea></label>';
		return '<label class="td-f"><span>' + label + '</span><input class="td-in" id="td-p-' + key + '" data-p="' + key + '" data-kind="' + (kind || 'mm') + '" value="' + esc(kind === 'n' || kind === 'pct' ? L.fmtNum(val, 2) : u(val)) + '" inputmode="decimal"></label>';
	}
	function paramsHtml(o, def) {
		var p = o.p || {}, h = '';
		switch (o.type) {
			case 'plate': h = pIn('r', 'Corner radius', p.r); break;
			case 'sphere': case 'cylinder': h = pIn('seg', o.type === 'cylinder' ? 'Sides (6 = hexagon)' : 'Smoothness', p.seg, 'n'); break;
			case 'cone': h = pIn('top', 'Top width %', p.top, 'pct') + pIn('seg', 'Sides', p.seg, 'n'); break;
			case 'pyramid': h = pIn('sides', 'Sides', p.sides, 'n'); break;
			case 'torus': case 'tube': h = (o.type === 'tube' ? pIn('wall', 'Wall thickness', p.wall) : '') + pIn('seg', 'Smoothness', p.seg, 'n'); break;
			case 'star': h = pIn('points', 'Points', p.points, 'n') + pIn('inner', 'Inner size %', p.inner, 'pct'); break;
			case 'gear': h = pIn('teeth', 'Teeth', p.teeth, 'n') + pIn('mod', 'Module (tooth size)', p.mod, 'n') + pIn('h', 'Thickness', p.h) + pIn('bore', 'Shaft hole', p.bore)
				+ '<p class="td-hint">Outside diameter ' + u(L.gearPts(p.teeth, p.mod).tip * 2) + ' ' + uu() + '. Gears with the same module fit together; place them ' + u(p.mod) + ' × (teeth A + teeth B) ÷ 2 apart.</p>'; break;
			case 'text': h = pIn('text', 'Text', p.text, 'text') + '<label class="td-f td-f--w"><span>Font</span><select class="td-in" data-p="font">' + FONT_LIST.map(function (f) { return '<option value="' + f[0] + '"' + (p.font === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select></label>'
				+ pIn('size', 'Letter height', p.size) + pIn('depth', 'Thickness', p.depth); break;
			case 'lathe': h = '<button type="button" class="td-b td-b--pri" data-act="sketch">✎ Edit the profile</button>' + pIn('seg', 'Smoothness', p.seg, 'n'); break;
			case 'extrude': h = (p.svg ? '<p class="td-hint">Made from an SVG file. Change its size with the Size boxes.</p>' : '<button type="button" class="td-b td-b--pri" data-act="sketch">✎ Edit the drawing</button>') + pIn('depth', 'Height', p.depth); break;
			case 'mesh': h = '<p class="td-hint">Imported model: ' + (p.tris || 0).toLocaleString() + ' triangles. Group it with holes or shapes to change it.</p>'; break;
			case 'group':
				h = '<label class="td-f td-f--w"><span>Combine</span><select class="td-in" id="td-gop"><option value="union"' + (o.op !== 'intersect' ? ' selected' : '') + '>Join (holes cut)</option><option value="intersect"' + (o.op === 'intersect' ? ' selected' : '') + '>Keep only the overlap</option></select></label>';
				var texts = []; walk(o.children, function (c) { if (c.type === 'text') texts.push(c); });
				texts.forEach(function (c, i) { h += '<label class="td-f td-f--w"><span>Words' + (texts.length > 1 ? ' ' + (i + 1) : '') + '</span><textarea class="td-in" rows="1" data-gtext="' + c.id + '">' + esc(c.p.text) + '</textarea></label>'; });
				h += '<p class="td-hint">' + o.children.length + ' parts. Ungroup to change them one by one.</p>'; break;
		}
		return h ? '<div class="td-sec"><b>Shape settings</b><div class="td-2">' + h + '</div></div>' : '';
	}
	function readLen(el) { var v = L.parseLength(el.value, ST.unit === 'in' ? 'in' : ST.unit); return v; }
	function inspectorEvents() {
		var host = $('#td-insp');
		host.addEventListener('change', function (e) {
			var el = e.target, s = topSel(); if (!s.length) { if (el.id === 'td-pname') { S.name = el.value.trim() || 'My model'; commit('Rename'); } return; }
			var o = s[0];
			if (el.id === 'td-oname') { o.name = el.value.trim(); commit('Rename'); return; }
			if (el.id === 'td-color') { s.forEach(function (x) { x.color = el.value; }); commit('Colour'); return; }
			if (el.id === 'td-keep') { ST.keep = el.checked; saveST(); return; }
			if (el.id === 'td-gop') { o.op = el.value; commit('Combine'); return; }
			if (el.dataset.gtext) { var c = byId(el.dataset.gtext); if (c) { c.p.text = el.value; commit('Text'); } return; }
			var m = /^td-(p|r|s)([xyz])$/.exec(el.id);
			if (m) {
				var k = 'xyz'.indexOf(m[2]), v = m[1] === 'r' ? parseFloat(String(el.value).replace(',', '.')) : readLen(el);
				if (!isFinite(v)) { toast('Type a number, like 20, 2 cm or 1 in.'); inspectorValues(); return; }
				if (m[1] === 'p') o.pos[k] = v;
				else if (m[1] === 'r') o.rot[k] = v;
				else setSize(o, k, v);
				commit('Edit'); return;
			}
			if (el.dataset.p) {
				var key = el.dataset.p, kind = el.dataset.kind, val;
				if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') val = el.value;
				else { val = kind === 'mm' ? readLen(el) : parseFloat(String(el.value).replace(',', '.')); if (!isFinite(val)) { toast('Type a number.'); inspector(); return; } }
				o.p[key] = val; commit('Shape setting');
			}
		});
		host.addEventListener('input', function (e) { if (e.target.id === 'td-p-text' || e.target.dataset.gtext) { clearTimeout(inspectorEvents.t); var el = e.target; inspectorEvents.t = setTimeout(function () { el.dispatchEvent(new Event('change', { bubbles: true })); }, 500); } });
		host.addEventListener('click', function (e) {
			var b = e.target.closest('button'); if (!b) return;
			var s = topSel();
			if (b.dataset.color) { s.forEach(function (x) { x.color = b.dataset.color; }); commit('Colour'); }
			else if (b.dataset.solid) { s.forEach(function (x) { x.hole = b.dataset.solid === '0'; }); commit('Solid / hole'); }
			else if (b.dataset.rot) { s.forEach(function (x) { if (b.dataset.rot === 'r') x.rot = [0, 0, 0]; else { var r = b.dataset.rot.split(','); x.rot[+r[0]] = ((x.rot[+r[0]] + +r[1]) % 360 + 360) % 360; } }); commit('Rotate'); drop(s); }
			else if (b.dataset.align) { var a = b.dataset.align.split(','); align(+a[0], a[1]); }
			else if (b.dataset.dist) distribute(+b.dataset.dist);
		});
	}
	function setSize(o, k, v) {
		if (v <= 0) return;
		var cur = baseSize(o), f = v / (cur[k] || 1), def = PRIMS[o.type];
		var factors = ST.keep ? [f, f, f] : [k === 0 ? f : 1, k === 1 ? f : 1, k === 2 ? f : 1];
		if (def && def.dims) { o.p.w = +(o.p.w * factors[0]).toFixed(4); o.p.d = +(o.p.d * factors[1]).toFixed(4); o.p.h = +(o.p.h * factors[2]).toFixed(4); }
		else o.scl = o.scl.map(function (s, i) { return +(s * factors[i]).toFixed(6); });
	}

	// ---------- print check ----------
	function exportParts(onlySel) {
		var list = (onlySel ? topSel() : S.objs).filter(function (o) { return !o.hidden; });
		var solids = list.filter(function (o) { return !o.hole && !isHoleGroup(o); });
		var loose = list.length - solids.length;
		return { parts: solids.map(function (o) { return { o: o, g: placed(o, matOf(o)) }; }), loose: loose };
	}
	function soup(parts) { var n = 0; parts.forEach(function (p) { n += p.g.attributes.position.array.length; }); var out = new Float32Array(n), at = 0; parts.forEach(function (p) { out.set(p.g.attributes.position.array, at); at += p.g.attributes.position.array.length; }); return out; }
	var lastCheck = null;
	function schedCheck() { clearTimeout(schedCheck.t); schedCheck.t = setTimeout(function () { if (ST.tab === 'print' || ST.showOh || ST.showThin) check(); }, 500); }
	function check(force) {
		if (!ready) return;
		var ex = exportParts(false), pos = soup(ex.parts), tris = pos.length / 9;
		var host = $('#td-print'), P = plate();
		if (!force && tris > 600000) { host.innerHTML = setupHtml() + '<p class="td-hint">Big model (' + tris.toLocaleString() + ' triangles).</p><button type="button" class="td-b td-b--pri" data-act="check">Check now</button>'; return; }
		var r = { tris: tris, loose: ex.loose };
		if (tris) {
			r.bb = L.bboxOf(pos); r.fit = L.plateFit(r.bb, P); r.va = L.volumeArea(pos);
			r.mc = { closed: true, boundary: 0, gaps: 0, gapLength: 0, tjunctions: 0, nonManifold: 0, flipped: 0, shells: 0 };
			ex.parts.forEach(function (p) { var m = L.manifoldCheck(p.g.attributes.position.array, 1e-3); ['boundary', 'gaps', 'gapLength', 'tjunctions', 'nonManifold', 'flipped', 'shells'].forEach(function (k) { r.mc[k] += m[k]; }); if (!m.closed) { r.mc.closed = false; (r.open = r.open || []).push(nameOf(p.o)); } });
			r.oh = L.overhang(pos, ST.ohAngle, 0, 0.05);
			r.fil = L.filament(r.va, { material: ST.mat, diameter: ST.dia, infill: ST.infill, wall: ST.wall, price: ST.price, flow: ST.flow });
			r.thin = thinCheck(ex.parts, pos);
			r.float = ex.parts.map(function (p) { return [nameOf(p.o), L.bboxOf(p.g.attributes.position.array).min[2]]; }).filter(function (f) { return f[1] > 0.05; });
		}
		lastCheck = r;
		printPanel(r);
		drawOverlay(pos, r);
	}
	function thinCheck(parts, pos) {
		var out = { parts: [], area: 0, total: 0, flags: null };
		parts.forEach(function (p) { var b = L.bboxOf(p.g.attributes.position.array), m = Math.min.apply(null, b.size); if (m < ST.minWall) out.parts.push([nameOf(p.o), m]); });
		var nt = pos.length / 9; if (!nt || !BVH) return out;
		try {
			var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
			var bvh = new BVH.MeshBVH(g), r = new T.Ray(), flags = new Uint8Array(nt), step = Math.max(1, Math.floor(nt / 2500));
			var a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), ctr = new T.Vector3();
			for (var t = 0; t < nt; t += step) {
				var i = t * 9; a.fromArray(pos, i); b.fromArray(pos, i + 3); c.fromArray(pos, i + 6);
				n.subVectors(b, a).cross(c.clone().sub(a)); var ar = n.length() / 2; if (!ar) continue; n.normalize();
				ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
				r.origin.copy(ctr).addScaledVector(n, -0.002); r.direction.copy(n).negate();
				var hit = bvh.raycastFirst(r, T.DoubleSide);
				out.total += ar * step;
				if (hit && hit.distance + 0.002 < ST.minWall) { out.area += ar * step; flags[t] = 1; }
			}
			out.flags = flags;
		} catch (e) { console.warn(e); }
		return out;
	}
	function drawOverlay(pos, r) {
		if (overlay) { scene.remove(overlay); overlay.geometry.dispose(); overlay = null; }
		if (!pos.length || (!ST.showOh && !ST.showThin)) { dirty = true; return; }
		var pick = [], cols = [], nt = pos.length / 9;
		for (var t = 0; t < nt; t++) {
			var oh = ST.showOh && r.oh && r.oh.flags[t], th = ST.showThin && r.thin && r.thin.flags && r.thin.flags[t];
			if (!oh && !th) continue;
			for (var k = 0; k < 9; k++) pick.push(pos[t * 9 + k]);
			var col = th ? [1, 0.6, 0.1] : [0.95, 0.15, 0.2];
			cols.push.apply(cols, col.concat(col, col));
		}
		if (!pick.length) { dirty = true; return; }
		var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pick, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
		overlay = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: true, opacity: 0.85 }));
		overlay.renderOrder = 3; scene.add(overlay); dirty = true;
	}
	function setupHtml() {
		var P = plate();
		return '<div class="td-sec"><b>Printer</b><select class="td-in" id="td-plate" aria-label="Printer build plate">' + L.PLATES.map(function (p) { return '<option value="' + p.id + '"' + (p.id === ST.plate ? ' selected' : '') + '>' + esc(p.name) + (p.id !== 'custom' ? ' (' + p.x + '×' + p.y + '×' + p.z + ')' : '') + '</option>'; }).join('') + '</select>'
			+ (ST.plate === 'custom' ? '<div class="td-3">' + ['x', 'y', 'z'].map(function (k) { return '<label class="td-f"><span>' + { x: 'Width', y: 'Depth', z: 'Height' }[k] + ' mm</span><input class="td-in" data-cust="' + k + '" value="' + P[k] + '" inputmode="decimal"></label>'; }).join('') + '</div>' : '') + '</div>'
			+ '<div class="td-sec"><b>Plastic</b><div class="td-2"><label class="td-f"><span>Material</span><select class="td-in" data-st="mat">' + L.MATERIALS.map(function (m) { return '<option value="' + m.id + '"' + (m.id === ST.mat ? ' selected' : '') + '>' + esc(m.name) + ' (' + m.density + ' g/cm³)</option>'; }).join('') + '</select></label>'
			+ '<label class="td-f"><span>Filament</span><select class="td-in" data-st="dia"><option value="1.75"' + (+ST.dia === 1.75 ? ' selected' : '') + '>1.75 mm</option><option value="2.85"' + (+ST.dia === 2.85 ? ' selected' : '') + '>2.85 mm</option></select></label>'
			+ '<label class="td-f"><span>Infill %</span><input class="td-in" data-st="infill" value="' + ST.infill + '" inputmode="decimal"></label>'
			+ '<label class="td-f"><span>Walls (mm)</span><input class="td-in" data-st="wall" value="' + ST.wall + '" inputmode="decimal"></label>'
			+ '<label class="td-f"><span>Price per kg</span><input class="td-in" data-st="price" value="' + ST.price + '" inputmode="decimal"></label>'
			+ '<label class="td-f"><span>Thinnest wall (mm)</span><input class="td-in" data-st="minWall" value="' + ST.minWall + '" inputmode="decimal"></label></div></div>';
	}
	function printPanel(r) {
		var h = '';
		if (!r.tris) { $('#td-print').innerHTML = '<p class="td-hint">Add a shape to check it for printing.</p>' + setupHtml(); return; }
		var ok = function (good, txt, more) { return '<div class="td-ck ' + (good === true ? 'ok' : good === 'warn' ? 'warn' : 'bad') + '"><span class="td-cki">' + (good === true ? '✓' : good === 'warn' ? '!' : '✗') + '</span><div>' + txt + (more ? '<small>' + more + '</small>' : '') + '</div></div>'; };
		var f = r.fit, sz = r.bb.size, P = plate();
		h += '<div class="td-sec"><b>Checks</b>';
		if (f.fits) h += ok(true, 'Fits on the ' + esc(P.name) + ' plate', u(sz[0]) + ' × ' + u(sz[1]) + ' × ' + u(sz[2]) + ' ' + uu());
		else {
			var more = [];
			if (!f.fitsSize) more.push(f.fitsIfTurned ? 'It fits if you turn it 90° (select all, Rotate Z +90°).' : 'It is bigger than the plate: make it smaller or cut it into parts.');
			else if (!f.inside) more.push('It hangs over the edge: select everything and press Centre on plate.');
			if (f.below) more.push('Part of it is below the plate: press Drop.');
			h += ok(false, 'Does not fit the ' + esc(P.name) + ' (' + P.x + '×' + P.y + '×' + P.z + ')', more.join(' '));
		}
		if (!f.floating && r.float.length) h += ok('warn', r.float.length === 1 ? esc(r.float[0][0]) + ' floats ' + u(r.float[0][1]) + ' ' + uu() + ' above the plate' : r.float.length + ' parts float above the plate', 'Select it and press Drop (D), or it will print in mid-air.');
		if (f.floating) h += ok('warn', 'The model is floating ' + u(r.bb.min[2]) + ' ' + uu() + ' above the plate', 'Press Drop (D) so it sits on the plate.');
		var tiny = !r.mc.closed && !r.mc.flipped && r.mc.gapLength < 1 && r.mc.nonManifold <= 4;
		if (tiny) h += ok('warn', 'Watertight, apart from ' + (r.mc.gaps + r.mc.nonManifold) + ' tiny seam' + (r.mc.gaps + r.mc.nonManifold > 1 ? 's' : ''), 'Leftovers from cutting shapes (under 1 mm in all). Slicers close these by themselves.');
		else h += r.mc.closed ? ok(true, 'Watertight (closed, no gaps)', r.mc.shells + ' separate piece' + (r.mc.shells === 1 ? '' : 's')) : ok(false, 'Not watertight', (r.mc.gaps ? r.mc.gaps + ' open edges. ' : '') + (r.mc.nonManifold ? r.mc.nonManifold + ' edges shared by 3+ faces. ' : '') + (r.mc.flipped ? r.mc.flipped + ' faces facing the wrong way. ' : '') + 'In: ' + esc((r.open || []).join(', ')) + '. Most slicers repair small problems; grouping it with a box often fixes it.');
		if (r.loose) h += ok('warn', r.loose + ' hole' + (r.loose > 1 ? 's are' : ' is') + ' not grouped with anything', 'A hole only cuts when it is grouped with a solid. Loose holes are left out of the export.');
		var thinPct = r.thin.total ? r.thin.area / r.thin.total * 100 : 0;
		if (r.thin.parts.length) h += ok('warn', 'Very thin part' + (r.thin.parts.length > 1 ? 's' : ''), r.thin.parts.map(function (t) { return esc(t[0]) + ' is only ' + u(t[1]) + ' ' + uu(); }).join('; ') + '. Under about ' + ST.minWall + ' mm may not print.');
		else if (thinPct > 0.5) h += ok('warn', 'About ' + L.fmtNum(thinPct, 1) + '% of the surface is on walls thinner than ' + ST.minWall + ' mm', 'Turn on "Show thin walls" to see them in orange.');
		else h += ok(true, 'No walls thinner than ' + ST.minWall + ' mm found');
		var ohPct = r.oh.fraction * 100;
		h += ohPct > 0.5 ? ok('warn', 'Overhangs: ' + L.fmtNum(ohPct, 1) + '% of the surface faces down steeper than ' + ST.ohAngle + '°', 'These need supports. Turn on "Show overhangs" to see them in red; turning the model often removes them.') : ok(true, 'No big overhangs (' + ST.ohAngle + '° rule)');
		h += '<label class="td-chk"><input type="checkbox" data-stb="showOh"' + (ST.showOh ? ' checked' : '') + '> Show overhangs (red)</label><label class="td-chk"><input type="checkbox" data-stb="showThin"' + (ST.showThin ? ' checked' : '') + '> Show thin walls (orange)</label>';
		h += '</div><div class="td-sec"><b>Estimate</b><div class="td-stats">'
			+ '<div><span>Volume</span><b>' + L.fmtNum(r.va.volume / 1000, 2) + ' cm³</b></div>'
			+ '<div><span>Plastic used</span><b>' + L.fmtNum(r.fil.grams, 1) + ' g</b></div>'
			+ (r.fil.metres ? '<div><span>Filament</span><b>' + L.fmtNum(r.fil.metres, 2) + ' m</b></div>' : '')
			+ '<div><span>Cost</span><b>' + L.fmtNum(r.fil.cost, 2) + '</b></div>'
			+ '<div><span>Print time</span><b>~' + (r.fil.hours < 1 ? Math.max(1, Math.round(r.fil.hours * 60)) + ' min' : L.fmtNum(r.fil.hours, 1) + ' h') + '</b></div>'
			+ '<div><span>Triangles</span><b>' + r.tris.toLocaleString() + '</b></div></div>'
			+ '<p class="td-hint">Solid skin of ' + ST.wall + ' mm plus ' + ST.infill + '% infill. Your slicer gives the exact numbers; print time is a very rough guess.</p></div>';
		$('#td-print').innerHTML = h + setupHtml();
	}
	function printEvents() {
		var host = $('#td-print');
		host.addEventListener('change', function (e) {
			var el = e.target;
			if (el.id === 'td-plate') { ST.plate = el.value; saveST(); buildPlate(); status(); check(); return; }
			if (el.dataset.cust) { var v = parseFloat(el.value); if (v > 0) { ST.custom[el.dataset.cust] = v; saveST(); buildPlate(); check(); } return; }
			if (el.dataset.stb) { ST[el.dataset.stb] = el.checked; saveST(); check(); return; }
			if (el.dataset.st) { var k = el.dataset.st, val = k === 'mat' ? el.value : parseFloat(String(el.value).replace(',', '.')); if (k !== 'mat' && !(val >= 0)) return; ST[k] = val; if (k === 'mat') ST.price = L.materialById(val).price; saveST(); check(); }
		});
	}
	function settingsPanel() {
		$('#td-set').innerHTML = '<div class="td-sec"><b>Units</b><div class="td-seg">' + [['mm', 'Millimetres'], ['cm', 'Centimetres'], ['in', 'Inches']].map(function (x) { return '<button type="button" class="td-b" data-unit="' + x[0] + '" aria-pressed="' + (ST.unit === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div><p class="td-hint">You can always type any unit: "2 cm", "1 in", "10*3".</p></div>'
			+ '<div class="td-sec"><label class="td-chk"><input type="checkbox" data-sv="showVol"' + (ST.showVol ? ' checked' : '') + '> Show the printer\'s build height</label>'
			+ '<label class="td-f"><span>Overhang angle (°)</span><input class="td-in" data-sn="ohAngle" value="' + ST.ohAngle + '" inputmode="decimal"></label><p class="td-hint">45° is the usual rule; good printers manage 50-60°.</p></div>'
			+ '<div class="td-sec"><b>Saved in this browser</b><p class="td-hint">Your last project is kept here automatically. Use Save for a file you can open anywhere.</p><button type="button" class="td-b" data-act="new">✚ Start a new project</button></div>';
	}
	function settingsEvents() {
		var host = $('#td-set');
		host.addEventListener('click', function (e) { var b = e.target.closest('[data-unit]'); if (b) { ST.unit = b.dataset.unit; saveST(); settingsPanel(); inspector(); status(); check(); dirty = true; } });
		host.addEventListener('change', function (e) {
			var el = e.target;
			if (el.dataset.sv) { ST[el.dataset.sv] = el.checked; saveST(); buildPlate(); }
			if (el.dataset.sn) { var v = parseFloat(el.value); if (v > 0 && v < 90) { ST[el.dataset.sn] = v; saveST(); check(); } }
		});
	}
	function setTab(t) {
		ST.tab = t; saveST();
		$$('.td-tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
		['obj', 'print', 'set'].forEach(function (k) { $('#td-tp-' + k).hidden = k !== t; });
		if (t === 'print') check();
	}

	// ---------- dialogs ----------
	var dlgClose = null;
	function dialog(html, cls, onClose) {
		var w = $('#td-dlgw'), d = $('#td-dlg');
		d.className = 'td-dlg ' + (cls || ''); d.innerHTML = '<button type="button" class="td-x" data-close aria-label="Close">✕</button>' + html; w.hidden = false;
		dlgClose = function () { w.hidden = true; d.innerHTML = ''; dlgClose = null; if (onClose) onClose(); };
		var f = d.querySelector('input,textarea,select,button:not([data-close])'); if (f) setTimeout(function () { f.focus(); }, 30);
		return d;
	}
	function closeDlg() { if (dlgClose) dlgClose(); }
	$('#td-dlgw').addEventListener('click', function (e) { if (e.target.id === 'td-dlgw' || e.target.closest('[data-close]')) closeDlg(); });

	function templatesDlg() {
		var d = dialog('<h3>Templates</h3><input type="search" class="td-in" id="td-tq" placeholder="Search: keychain, cup, gear, box…" aria-label="Search templates"><div class="td-tgrid" id="td-tgrid"></div>', 'td-dlg--wide');
		function draw() {
			var q = $('#td-tq').value.toLowerCase().trim();
			var list = window.TD_TEMPLATES.filter(function (t) { return !q || (t.name + ' ' + t.tags + ' ' + t.desc).toLowerCase().indexOf(q) >= 0; });
			$('#td-tgrid').innerHTML = list.map(function (t) { return '<button type="button" class="td-tcard" data-tpl="' + t.id + '"><span class="td-tthumb" data-thumb="' + t.id + '">' + (thumbs[t.id] ? '<img src="' + thumbs[t.id] + '" alt="">' : t.emoji) + '</span><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small></button>'; }).join('') || '<p class="td-hint">No template matches. Try "box" or "text".</p>';
			makeThumbs();
		}
		$('#td-tq').addEventListener('input', draw);
		d.addEventListener('click', function (e) { var b = e.target.closest('[data-tpl]'); if (!b) return; var t = window.TD_TEMPLATES.find(function (x) { return x.id === b.dataset.tpl; }); closeDlg(); fromTemplate(t); toast('Added: ' + t.name + '. ' + t.desc); });
		draw();
	}
	var thumbs = {}, thumbBusy = false;
	function makeThumbs() {
		if (thumbBusy || !ready) return;
		if (!TextGeometry || !FONTS.helvetiker_bold) { textReady().then(makeThumbs).catch(function () {}); return; }
		thumbBusy = true;
		var todo = window.TD_TEMPLATES.filter(function (t) { return !thumbs[t.id]; });
		if (!todo.length) { thumbBusy = false; return; }
		var r2 = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r2.setSize(240, 180); r2.setClearColor(0x252b36);
		var sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x445066, 1.8)); var dl = new T.DirectionalLight(0xffffff, 1.5); dl.position.set(1, -1.2, 2); sc.add(dl);
		var cam = new T.PerspectiveCamera(32, 4 / 3, 0.5, 5000); cam.up.set(0, 0, 1);
		var i = 0;
		(function next() {
			if (i >= todo.length || $('#td-dlgw').hidden) { r2.dispose(); r2.forceContextLoss(); thumbBusy = false; return; }
			var t = todo[i++], grp = new T.Group();
			try {
				t.make().forEach(function (o) { if (!o.color) o.color = '#60a5fa'; var m = new T.Mesh(geoFor(o), matFor(o)); setXform(m, o); grp.add(m); });
				sc.add(grp);
				var b = new T.Box3().setFromObject(grp, true), c = new T.Vector3(), z = new T.Vector3(); b.getCenter(c); b.getSize(z);
				var dist = z.length() / 2 / Math.sin(16 * Math.PI / 180) * 1.05;
				cam.position.copy(c).add(new T.Vector3(0.6, -0.85, 0.6).normalize().multiplyScalar(dist)); cam.lookAt(c); cam.updateProjectionMatrix();
				r2.render(sc, cam); thumbs[t.id] = r2.domElement.toDataURL('image/png');
				sc.remove(grp);
				var el = $('[data-thumb="' + t.id + '"]'); if (el) el.innerHTML = '<img src="' + thumbs[t.id] + '" alt="">';
			} catch (e) { console.warn('thumb', t.id, e); }
			setTimeout(next, 0);
		})();
	}

	function helpDlg() {
		var keys = [['Click', 'Select a shape (Shift-click adds more)'], ['Drag in the view', 'Turn the view'], ['Right-drag / two fingers', 'Pan'], ['Wheel / pinch', 'Zoom'], ['Double-click a shape', 'Zoom to it'],
			['G / R / S', 'Move / Rotate / Scale handles'], ['Arrow keys', 'Move the selection one grid step (Shift: ×10)'], ['Page Up / Page Down', 'Move up / down'], ['H', 'Hole / solid'], ['Ctrl+G', 'Group'], ['Ctrl+Shift+G', 'Ungroup'],
			['Ctrl+D', 'Duplicate'], ['D', 'Drop onto the plate'], ['M', 'Mirror (left / right)'], ['Delete', 'Delete'], ['Ctrl+A', 'Select everything'], ['Esc', 'Select nothing / close'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
			['7 / 1 / 3 / 0', 'Top / Front / Side / 3D view'], ['.', 'Zoom to the selection'], ['F / Shift+F', 'Fill window / Full screen'], ['Ctrl+S / Ctrl+O / Ctrl+E', 'Save / Open / Export'], ['?', 'This help']];
		dialog('<h3>How 3D Studio works</h3><ol class="td-steps"><li><b>Add shapes</b> from the left. They land on the build plate.</li><li><b>Move, turn, resize</b> with the handles, or type exact numbers in the Shape panel (any unit: 20, 2 cm, 1 in).</li><li><b>Holes</b>: make a shape a hole, put it where you want to cut, select it with the solid and press <b>Group</b>. Subtract does this in one step.</li><li><b>Check</b> the 3D print tab: plate size, watertight, thin walls, overhangs, filament and cost.</li><li><b>Export</b> STL or 3MF and open it in your slicer.</li></ol>'
			+ '<h4>Keyboard and mouse</h4><table class="td-keys">' + keys.map(function (k) { return '<tr><td><kbd>' + esc(k[0]) + '</kbd></td><td>' + esc(k[1]) + '</td></tr>'; }).join('') + '</table>', 'td-dlg--wide');
	}
	function mirrorDlg() {
		if (!selected(true).length) return toast('Select a shape first.');
		var d = dialog('<h3>Mirror (flip)</h3><p class="td-hint">Flip the selection across its own centre.</p><div class="td-btns"><button type="button" class="td-b" data-m="0">⇋ Left ↔ right (X)</button><button type="button" class="td-b" data-m="1">⇅ Front ↔ back (Y)</button><button type="button" class="td-b" data-m="2">⇕ Upside down (Z)</button></div>');
		d.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) { closeDlg(); mirror(+b.dataset.m); } });
	}
	function alignDlg() {
		if (selected(true).length < 2) return toast('Select two or more shapes (Shift-click) to line them up.');
		var d = dialog('<h3>Align and spread</h3>' + alignHtml());
		d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.align) { var a = b.dataset.align.split(','); align(+a[0], a[1]); } else if (b.dataset.dist) distribute(+b.dataset.dist); });
	}

	// ---------- 2D sketch editor (Revolve profile / Extrude drawing) ----------
	var PRESETS = {
		lathe: { 'Vase': [[0, 0], [20, 0], [27, 25], [17, 55], [21, 80], [0, 80]], 'Cup (solid)': [[0, 0], [30, 0], [33, 80], [0, 80]], 'Bowl': [[0, 0], [20, 0], [40, 30], [37, 30], [18, 3], [0, 3]], 'Pawn': [[0, 0], [14, 0], [14, 3], [12, 6], [9, 8], [6, 14], [5, 22], [8, 24], [8, 26], [4.5, 27], [7, 30], [8, 34], [7, 38], [4, 40.5], [0, 41]],
			'Bottle': [[0, 0], [22, 0], [22, 60], [10, 75], [8, 90], [0, 90]], 'Spinning top': [[0, 0], [1.5, 0], [22, 14], [22, 17], [5, 22], [4, 40], [0, 40]], 'Dome': [[0, 0], [25, 0], [24, 8], [21, 15], [15, 21], [8, 24], [0, 25]] },
		extrude: { 'Star': L.starPts(5, 20, 9), 'Heart': L.heartPts(36, 48), 'Hexagon': L.polygonPts(6, 18), 'Arrow': [[-20, -5], [5, -5], [5, -14], [22, 0], [5, 14], [5, 5], [-20, 5]], 'Letter L': [[-10, -15], [12, -15], [12, -8], [-3, -8], [-3, 15], [-10, 15]],
			'Cross': [[-4, -15], [4, -15], [4, -4], [15, -4], [15, 4], [4, 4], [4, 15], [-4, 15], [-4, 4], [-15, 4], [-15, -4], [-4, -4]], 'Moon': (function () { var o = []; for (var i = 0; i <= 24; i++) { var a = -Math.PI / 2 + i / 24 * Math.PI; o.push([18 * Math.cos(a), 18 * Math.sin(a)]); } for (var j = 24; j >= 0; j--) { var b = -Math.PI / 2 + j / 24 * Math.PI; o.push([9 * Math.cos(b), 18 * Math.sin(b)]); } return o; })() }
	};
	function sketch(o, isNew) {
		var lathe = o.type === 'lathe', pts = clone(lathe ? o.p.pts : ((o.p.shapes || [])[0] || { o: [] }).o).map(function (p) { return [+p[0].toFixed(2), +p[1].toFixed(2)]; });
		var selPt = -1, hist2 = [];
		var d = dialog('<h3>' + (lathe ? 'Revolve: draw half of the outline' : 'Extrude: draw the shape') + '</h3>'
			+ '<p class="td-hint">' + (lathe ? 'The dashed line is the middle. The shape spins around it, like on a pottery wheel. Click to add points, drag them to move.' : 'Click to add corners, drag them to move. The drawing is raised straight up.') + ' Click near a line to put a point on it. Select a point and press Delete to remove it.</p>'
			+ '<div class="td-skw"><canvas id="td-skc" width="640" height="440" aria-label="Drawing area"></canvas><div class="td-skside">'
			+ '<label class="td-f"><span>Start from</span><select class="td-in" id="td-skpre"><option value="">Pick a shape…</option>' + Object.keys(PRESETS[lathe ? 'lathe' : 'extrude']).map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></label>'
			+ '<label class="td-f"><span>Snap to</span><select class="td-in" id="td-sksnap"><option value="0">Off</option><option value="0.5">0.5 mm</option><option value="1" selected>1 mm</option><option value="5">5 mm</option></select></label>'
			+ (lathe ? '' : '<label class="td-f"><span>Height (mm)</span><input class="td-in" id="td-skdepth" value="' + L.fmtNum(o.p.depth || 5) + '" inputmode="decimal"></label>')
			+ '<label class="td-f td-f--w"><span>Points (x, y per line, mm)</span><textarea class="td-in td-mono" id="td-skpts" rows="8"></textarea></label>'
			+ '<div class="td-btns"><button type="button" class="td-b td-b--s" id="td-skdel">Delete point</button><button type="button" class="td-b td-b--s" id="td-skundo">Undo</button><button type="button" class="td-b td-b--s" id="td-skclear">Clear</button></div>'
			+ '<p class="td-hint" id="td-skinfo"></p></div></div>'
			+ '<div class="td-btns td-btns--end"><button type="button" class="td-b" data-close>Cancel</button><button type="button" class="td-b td-b--pri" id="td-skok">' + (isNew ? 'Add to the model' : 'Apply') + '</button></div>', 'td-dlg--wide');
		var cv = $('#td-skc'), cx = cv.getContext('2d'), sc = 4, ox = 0, oy = 0, drag = -1;
		function fitView() {
			var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
			cv.width = Math.max(200, r.width * dpr | 0); cv.height = Math.max(160, r.height * dpr | 0);
			var b = pts.length ? L.bounds2(pts.concat(lathe ? [[0, 0]] : [])) : { minx: -20, maxx: 20, miny: -20, maxy: 20, w: 40, h: 40 };
			var w = Math.max(40, b.w * 1.3), h = Math.max(40, b.h * 1.3);
			sc = Math.min(cv.width / w, cv.height / h);
			ox = cv.width / 2 - (b.minx + b.maxx) / 2 * sc; oy = cv.height / 2 + (b.miny + b.maxy) / 2 * sc;
		}
		function toS(p) { return [ox + p[0] * sc, oy - p[1] * sc]; }
		function toW(x, y) { return [(x - ox) / sc, (oy - y) / sc]; }
		function snapP(p) { var s = +$('#td-sksnap').value; var q = s ? [L.snap(p[0], s), L.snap(p[1], s)] : [+p[0].toFixed(2), +p[1].toFixed(2)]; if (lathe) q[0] = Math.max(0, q[0]); return q; }
		function draw() {
			var W = cv.width, H = cv.height, dpr = window.devicePixelRatio || 1;
			cx.fillStyle = '#1b1f27'; cx.fillRect(0, 0, W, H);
			var step = sc * 5 < 14 ? (sc * 10 < 14 ? 50 : 10) : 5;
			cx.lineWidth = 1;
			for (var gx = Math.floor(toW(0, 0)[0] / step) * step; toS([gx, 0])[0] < W; gx += step) { cx.strokeStyle = gx % (step * 2) === 0 ? 'rgba(160,180,210,.22)' : 'rgba(160,180,210,.1)'; var x = toS([gx, 0])[0]; cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
			for (var gy = Math.floor(toW(0, H)[1] / step) * step; toS([0, gy])[1] > 0; gy += step) { cx.strokeStyle = gy % (step * 2) === 0 ? 'rgba(160,180,210,.22)' : 'rgba(160,180,210,.1)'; var y = toS([0, gy])[1]; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
			var a0 = toS([0, 0]);
			cx.strokeStyle = lathe ? '#fbbf24' : 'rgba(255,255,255,.35)'; cx.setLineDash(lathe ? [8 * dpr, 6 * dpr] : []); cx.beginPath(); cx.moveTo(a0[0], 0); cx.lineTo(a0[0], H); cx.stroke(); cx.setLineDash([]);
			cx.strokeStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.moveTo(0, a0[1]); cx.lineTo(W, a0[1]); cx.stroke();
			if (lathe && pts.length > 1) { cx.strokeStyle = 'rgba(96,165,250,.35)'; cx.beginPath(); pts.forEach(function (p, i) { var s = toS([-p[0], p[1]]); if (i) cx.lineTo(s[0], s[1]); else cx.moveTo(s[0], s[1]); }); cx.closePath(); cx.stroke(); }
			if (pts.length) {
				cx.fillStyle = 'rgba(59,130,246,.25)'; cx.strokeStyle = '#60a5fa'; cx.lineWidth = 2 * dpr; cx.beginPath();
				pts.forEach(function (p, i) { var s = toS(p); if (i) cx.lineTo(s[0], s[1]); else cx.moveTo(s[0], s[1]); });
				cx.closePath(); if (pts.length > 2) cx.fill(); cx.stroke();
				pts.forEach(function (p, i) { var s = toS(p); cx.fillStyle = i === selPt ? '#f97316' : i === 0 ? '#22c55e' : '#e2e8f0'; cx.beginPath(); cx.arc(s[0], s[1], (i === selPt ? 6 : 4.5) * dpr, 0, Math.PI * 2); cx.fill(); });
			}
			cx.fillStyle = '#cbd5e1'; cx.font = (12 * dpr) + 'px system-ui,sans-serif'; cx.fillText(step + ' mm grid', 8 * dpr, H - 8 * dpr);
			var info = pts.length + ' points';
			if (pts.length > 2) { var b = L.bounds2(pts); info += lathe ? ' · ' + L.fmtNum(b.maxx * 2) + ' mm wide, ' + L.fmtNum(b.h) + ' mm tall' : ' · ' + L.fmtNum(b.w) + ' × ' + L.fmtNum(b.h) + ' mm'; }
			if (lathe && pts.length && pts.some(function (p) { return p[0] < 0; })) info += ' · points left of the middle are moved onto it';
			$('#td-skinfo').textContent = info;
			if (document.activeElement !== $('#td-skpts')) $('#td-skpts').value = pts.map(function (p) { return L.fmtNum(p[0]) + ', ' + L.fmtNum(p[1]); }).join('\n');
		}
		function mark() { hist2.push(JSON.stringify(pts)); if (hist2.length > 80) hist2.shift(); }
		function at(e) { var r = cv.getBoundingClientRect(), dpr = cv.width / r.width; return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; }
		cv.addEventListener('pointerdown', function (e) {
			var p = at(e), dpr = cv.width / cv.getBoundingClientRect().width, best = -1, bd = 12 * dpr;
			pts.forEach(function (q, i) { var s = toS(q), dd = Math.hypot(s[0] - p[0], s[1] - p[1]); if (dd < bd) { bd = dd; best = i; } });
			mark();
			if (best >= 0) { selPt = drag = best; }
			else {
				var w = snapP(toW(p[0], p[1])), ins = pts.length, ed = 10 * dpr;
				for (var i = 0; i < pts.length && pts.length > 1; i++) { var a = toS(pts[i]), b = toS(pts[(i + 1) % pts.length]), dist = segDist(p, a, b); if (dist < ed) { ed = dist; ins = i + 1; } }
				pts.splice(ins, 0, w); selPt = drag = ins;
			}
			cv.setPointerCapture(e.pointerId); draw();
		});
		cv.addEventListener('pointermove', function (e) { if (drag < 0) return; var p = at(e); pts[drag] = snapP(toW(p[0], p[1])); draw(); });
		cv.addEventListener('pointerup', function () { drag = -1; });
		function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
		function delPt() { if (selPt >= 0 && selPt < pts.length) { mark(); pts.splice(selPt, 1); selPt = -1; draw(); } }
		$('#td-skdel').onclick = delPt;
		$('#td-skundo').onclick = function () { if (hist2.length) { pts = JSON.parse(hist2.pop()); selPt = -1; draw(); } };
		$('#td-skclear').onclick = function () { mark(); pts = []; selPt = -1; draw(); };
		$('#td-skpre').onchange = function () { var v = PRESETS[lathe ? 'lathe' : 'extrude'][this.value]; if (v) { mark(); pts = clone(v).map(function (p) { return [+p[0].toFixed(2), +p[1].toFixed(2)]; }); selPt = -1; fitView(); draw(); } };
		$('#td-skpts').addEventListener('change', function () {
			var n = this.value.split(/\n+/).map(function (l) { var m = l.split(/[,;\s]+/).filter(Boolean).map(Number); return m.length >= 2 && isFinite(m[0]) && isFinite(m[1]) ? [m[0], m[1]] : null; }).filter(Boolean);
			mark(); pts = lathe ? L.cleanProfile(n) : n; fitView(); draw();
		});
		d.addEventListener('keydown', function (e) { if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === cv) { e.preventDefault(); delPt(); } });
		cv.tabIndex = 0;
		$('#td-skok').onclick = function () {
			if (pts.length < 3) { toast('Draw at least 3 points.'); return; }
			if (lathe) { o.p.pts = L.cleanProfile(pts); }
			else { o.p.shapes = [{ o: L.ccw(pts) }]; var dv = L.parseLength($('#td-skdepth').value); if (dv > 0) o.p.depth = dv; delete o.p.svg; }
			closeDlg();
			if (isNew) placeNew([o]); else commit('Edit shape');
		};
		requestAnimationFrame(function () { fitView(); draw(); });
		setTimeout(function () { fitView(); draw(); }, 50);
	}

	// ---------- files: import / open / save / export ----------
	function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
	// a ready triangle soup (mm, Z up) -> a new mesh part, centred, on the plate
	function addMesh(soup, name, color) {
		var pos = new Float32Array(soup), bb = L.bboxOf(pos), c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
		for (var j = 0; j < pos.length; j += 3) { pos[j] -= c[0]; pos[j + 1] -= c[1]; pos[j + 2] -= c[2]; }
		var ref = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); MESH[ref] = pos;
		var ext = { name: name, hole: false }; if (color) ext.color = color;
		var o = newObj('mesh', { ref: ref, tris: pos.length / 9 }, ext); placeNew([o]); frame([o]); return o;
	}
	function baseName(n) { return L.safeName(String(n || '').replace(/\.[^.]+$/, ''), 'model'); }
	function saveProject() {
		var meshesB64 = {}, refs = usedRefs(); for (var r in refs) if (refs[r]) meshesB64[r] = L.f32ToB64(refs[r]);
		var data = { app: 'mes-3d-studio', v: 1, name: S.name, saved: new Date().toISOString(), plate: ST.plate, objs: S.objs, meshes: meshesB64 };
		download(new Blob([JSON.stringify(data)], { type: 'application/json' }), L.safeName(S.name, 'model') + '.mes3d');
		toast('Saved ' + L.safeName(S.name, 'model') + '.mes3d to your downloads.');
	}
	function openFiles(files) {
		Array.prototype.slice.call(files || []).forEach(function (f) {
			var ext = (/\.([a-z0-9]+)$/i.exec(f.name) || [])[1]; ext = ext ? ext.toLowerCase() : '';
			if (ext === 'mes3d' || ext === 'json') return f.text().then(function (t) { openProject(t, f.name); });
			if (ext === 'svg') return f.text().then(function (t) { importSvg(t, f.name); });
			if (['stl', 'obj', 'glb', 'gltf', '3mf'].indexOf(ext) >= 0) return importModel(f, ext);
			if (photo3d.isImage(f)) return photo3d.open(f);
			toast('Cannot open ' + f.name + '. Use .mes3d, STL, OBJ, GLB, 3MF, SVG, or a picture for Photo to 3D.');
		});
	}
	function openProject(text, fname) {
		var d; try { d = JSON.parse(text); } catch (e) { return toast('That file is not a 3D Studio project.'); }
		if (!L.validProject(d)) return toast('That file is not a 3D Studio project (or it is damaged).');
		var go = function () {
			MESH = {}; for (var r in d.meshes || {}) MESH[r] = L.b64ToF32(d.meshes[r]);
			S.objs = d.objs; S.name = d.name || baseName(fname); S.sel = []; geoCache.clear();
			walk(S.objs, function (o) { o.id = o.id || uid(); o.p = o.p || {}; });
			commit('Open'); frame();
			toast('Opened ' + fname + '.');
		};
		if (S.objs.length) { var dd = dialog('<h3>Open ' + esc(fname) + '</h3><p>Replace what you have now, or add the project\'s parts to it?</p><div class="td-btns td-btns--end"><button type="button" class="td-b" data-o="add">Add to this model</button><button type="button" class="td-b td-b--pri" data-o="rep">Replace</button></div>');
			dd.addEventListener('click', function (e) { var b = e.target.closest('[data-o]'); if (!b) return; closeDlg(); if (b.dataset.o === 'rep') go(); else { for (var r in d.meshes || {}) MESH[r] = L.b64ToF32(d.meshes[r]); var objs = d.objs.map(function (o) { return reId(o); }); placeNew(objs); } });
		} else go();
	}
	function importModel(f, ext) {
		toast('Reading ' + f.name + '…');
		var loaders = { stl: 'loaders/STLLoader.js', obj: 'loaders/OBJLoader.js', glb: 'loaders/GLTFLoader.js', gltf: 'loaders/GLTFLoader.js', '3mf': 'loaders/3MFLoader.js' };
		Promise.all([addon(loaders[ext]), ext === 'obj' ? f.text() : f.arrayBuffer()]).then(function (a) {
			var m = a[0], data = a[1];
			if (ext === 'stl') return new m.STLLoader().parse(data);
			if (ext === 'obj') return new m.OBJLoader().parse(data);
			if (ext === '3mf') return new m.ThreeMFLoader().parse(data);
			return new m.GLTFLoader().parseAsync(data, '').then(function (g) { var s = g.scene; s.rotation.x = Math.PI / 2; return s; });
		}).then(function (res) {
			var geos = [];
			if (res.isBufferGeometry) geos.push(res);
			else { res.updateMatrixWorld(true); res.traverse(function (c) { if (c.isMesh && c.geometry && c.geometry.attributes.position) { var g = c.geometry.clone(); g.applyMatrix4(c.matrixWorld); if (g.index) g = g.toNonIndexed(); if (c.matrixWorld.determinant() < 0) L.flipWinding(g.attributes.position.array); var ng = new T.BufferGeometry(); ng.setAttribute('position', g.attributes.position); geos.push(ng); } }); }
			if (!geos.length) throw new Error('no triangles found');
			var merged = geos.length > 1 ? BGU.mergeGeometries(geos.map(function (g) { return g.index ? g.toNonIndexed() : g; }).map(function (g) { var n = new T.BufferGeometry(); n.setAttribute('position', g.attributes.position); return n; })) : (geos[0].index ? geos[0].toNonIndexed() : geos[0]);
			var pos = new Float32Array(merged.attributes.position.array), bb = L.bboxOf(pos), note = '';
			var big = Math.max.apply(null, bb.size);
			if ((ext === 'glb' || ext === 'gltf') && big < 3) { for (var i = 0; i < pos.length; i++) pos[i] *= 1000; note = ' It was in metres, so it was scaled to millimetres.'; bb = L.bboxOf(pos); }
			var c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
			for (var j = 0; j < pos.length; j += 3) { pos[j] -= c[0]; pos[j + 1] -= c[1]; pos[j + 2] -= c[2]; }
			if (L.volumeArea(pos).volume < 0) L.flipWinding(pos);
			var ref = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
			MESH[ref] = pos;
			var o = newObj('mesh', { ref: ref, tris: pos.length / 9 }, { name: baseName(f.name), hole: false });
			placeNew([o]); frame([o]);
			var P = plate(), sz = L.bboxOf(pos).size;
			toast('Imported ' + f.name + ' (' + (pos.length / 9).toLocaleString() + ' triangles, ' + L.fmtNum(sz[0], 1) + ' × ' + L.fmtNum(sz[1], 1) + ' × ' + L.fmtNum(sz[2], 1) + ' mm).' + note + (sz[0] > P.x || sz[1] > P.y || sz[2] > P.z ? ' It is bigger than your plate: type a smaller size.' : ''));
		}).catch(function (e) { console.warn(e); toast('Could not read ' + f.name + ': ' + e.message); });
	}
	function importSvg(text, name) {
		addon('loaders/SVGLoader.js').then(function (m) {
			var data = new m.SVGLoader().parse(text), shapes = [];
			data.paths.forEach(function (path) {
				var fill = path.userData && path.userData.style && path.userData.style.fill;
				if (fill === 'none' && path.subPaths.length) { /* outlines only: still use them as filled shapes */ }
				m.SVGLoader.createShapes(path).forEach(function (s) { var e = s.extractPoints(12); if (e.shape.length >= 3) shapes.push({ o: e.shape.map(function (p) { return [p.x, -p.y]; }), h: e.holes.map(function (h) { return h.map(function (p) { return [p.x, -p.y]; }); }) }); });
			});
			if (!shapes.length) throw new Error('no filled shapes found');
			var all = []; shapes.forEach(function (s) { all = all.concat(s.o); });
			var b = L.bounds2(all), k = 60 / Math.max(b.w, b.h), cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
			var fix = function (pts) { return pts.map(function (p) { return [+((p[0] - cx) * k).toFixed(3), +((p[1] - cy) * k).toFixed(3)]; }); };
			shapes = shapes.map(function (s) { return { o: fix(s.o), h: s.h.map(fix) }; });
			var o = newObj('extrude', { depth: 3, shapes: shapes, svg: true }, { name: baseName(name) });
			placeNew([o]); frame([o]);
			toast('Raised ' + name + ' into 3D, 60 mm wide. Type another size in the Shape panel.');
		}).catch(function (e) { toast('Could not use that SVG: ' + e.message); });
	}
	function exportDlg() {
		var ex = exportParts(false);
		if (!ex.parts.length) return toast('There is nothing to export yet.');
		var r = lastCheck, warn = '';
		check(true); r = lastCheck;
		if (r && r.tris) {
			if (!r.fit.fits) warn += '<li>It does not fit your ' + esc(plate().name) + ' plate as placed.</li>';
			if (!r.mc.closed && !(r.mc.gapLength < 1 && r.mc.nonManifold <= 4 && !r.mc.flipped)) warn += '<li>It is not watertight; most slicers can repair that.</li>';
			if (r.fit.floating) warn += '<li>It floats above the plate: press Drop first.</li>';
			if (r.loose) warn += '<li>' + r.loose + ' loose hole(s) are left out (group them with a solid to cut).</li>';
		}
		var nSel = topSel().length;
		var d = dialog('<h3>Export</h3><label class="td-f td-f--w"><span>File name</span><input class="td-in" id="td-ename" value="' + esc(L.safeName(S.name, 'model')) + '"></label>'
			+ '<div class="td-fmt" role="radiogroup">' + [['stl', 'STL', 'Works with every slicer (one file, millimetres)'], ['3mf', '3MF', 'Keeps colours and separate parts (PrusaSlicer, Bambu Studio, Orca, Cura)'], ['obj', 'OBJ', 'For other 3D programs'], ['glb', 'GLB', 'For web viewers, games, AR (metres, Y up)']].map(function (f, i) { return '<label class="td-fo"><input type="radio" name="td-ef" value="' + f[0] + '"' + ((ST.efmt || 'stl') === f[0] ? ' checked' : '') + '><b>' + f[1] + '</b><small>' + f[2] + '</small></label>'; }).join('') + '</div>'
			+ (nSel ? '<label class="td-chk"><input type="checkbox" id="td-esel"> Only the ' + nSel + ' selected part' + (nSel > 1 ? 's' : '') + '</label>' : '')
			+ (warn ? '<ul class="td-warn">' + warn + '</ul>' : '<p class="td-ok">✓ Ready to print: fits the plate and is watertight.</p>')
			+ '<div class="td-btns td-btns--end"><button type="button" class="td-b" data-close>Cancel</button><button type="button" class="td-b td-b--pri" id="td-ego">⬇ Download</button></div>');
		$('#td-ego').onclick = function () {
			var fmt = (d.querySelector('[name=td-ef]:checked') || {}).value || 'stl', name = L.safeName($('#td-ename').value, 'model'), only = $('#td-esel') && $('#td-esel').checked;
			ST.efmt = fmt; saveST();
			doExport(fmt, name, only).then(function () { closeDlg(); }).catch(function (e) { toast('Export failed: ' + e.message); });
		};
	}
	function doExport(fmt, name, only) {
		var ex = exportParts(only);
		if (!ex.parts.length) return Promise.reject(new Error('nothing to export'));
		if (fmt === '3mf') {
			if (!window.MESImg || !window.MESImg.zipStore) return Promise.reject(new Error('zip writer missing'));
			var enc = new TextEncoder();
			var xml = L.threeMFModel(ex.parts.map(function (p) { return { name: nameOf(p.o), positions: p.g.attributes.position.array, color: p.o.color }; }), S.name);
			var zip = window.MESImg.zipStore([{ name: '[Content_Types].xml', data: enc.encode(L.THREEMF_TYPES) }, { name: '_rels/.rels', data: enc.encode(L.THREEMF_RELS) }, { name: '3D/3dmodel.model', data: enc.encode(xml) }]);
			download(new Blob([zip], { type: 'model/3mf' }), name + '.3mf'); toast('Exported ' + name + '.3mf'); return Promise.resolve();
		}
		var mods = { stl: 'exporters/STLExporter.js', obj: 'exporters/OBJExporter.js', glb: 'exporters/GLTFExporter.js' };
		return addon(mods[fmt]).then(function (m) {
			var grp = new T.Group();
			ex.parts.forEach(function (p) { var g = p.g.clone(); g.computeVertexNormals(); var mesh = new T.Mesh(g, new T.MeshStandardMaterial({ color: new T.Color(p.o.color || '#888888'), roughness: 0.6 })); mesh.name = nameOf(p.o); grp.add(mesh); });
			if (fmt === 'stl') {
				var merged = BGU.mergeGeometries(ex.parts.map(function (p) { var g = new T.BufferGeometry(); g.setAttribute('position', p.g.attributes.position); return g; }));
				var dv = new m.STLExporter().parse(new T.Mesh(merged), { binary: true });
				download(new Blob([dv], { type: 'model/stl' }), name + '.stl');
			} else if (fmt === 'obj') {
				download(new Blob([new m.OBJExporter().parse(grp)], { type: 'text/plain' }), name + '.obj');
			} else {
				grp.rotation.x = -Math.PI / 2; grp.scale.setScalar(0.001); grp.updateMatrixWorld(true);
				return new m.GLTFExporter().parseAsync(grp, { binary: true }).then(function (buf) { download(new Blob([buf], { type: 'model/gltf-binary' }), name + '.glb'); toast('Exported ' + name + '.glb'); });
			}
			toast('Exported ' + name + '.' + fmt);
		});
	}
	function screenshot() {
		var hide = [tc.getHelper(), selBox]; var vis = hide.map(function (h) { return h.visible; }); hide.forEach(function (h) { h.visible = false; });
		renderer.render(scene, camera);
		renderer.domElement.toBlob(function (b) { if (b) download(b, L.safeName(S.name, 'model') + '.png'); }, 'image/png');
		hide.forEach(function (h, i) { h.visible = vis[i]; }); dirty = true;
	}
	function newProject() {
		var go = function () { S.objs = []; S.sel = []; S.name = 'My model'; MESH = {}; geoCache.clear(); commit('New'); setView('iso'); };
		if (!S.objs.length) return go();
		var d = dialog('<h3>Start a new project?</h3><p>The current model will be cleared (you can still press Undo).</p><div class="td-btns td-btns--end"><button type="button" class="td-b" data-close>Cancel</button><button type="button" class="td-b td-b--pri" id="td-newok">Start new</button></div>');
		$('#td-newok').onclick = function () { closeDlg(); go(); };
	}

	// ---------- window modes ----------
	function setFill(on) {
		root.classList.toggle('td-fill', on); document.documentElement.classList.toggle('td-noscroll', on);
		$('#td-fillbtn').setAttribute('aria-pressed', on ? 'true' : 'false');
		paintShort(); setTimeout(resize, 30);
	}
	// Fill window / Full screen on a short, wide screen (a phone held sideways): .td-short makes the 3D view fill the window,
	// the toolbar becomes one row of small icon buttons floating on it, the side panels float narrow on the left / right,
	// and "Hide controls" (key C, remembered) leaves only one small button
	var SHORT = window.matchMedia ? window.matchMedia('(max-height:560px) and (min-aspect-ratio:4/3)') : null, NOCTL = 'mes-3d-studio:noctl';
	function noCtl() { try { return localStorage.getItem(NOCTL) === '1'; } catch (e) { return false; } }
	$$('#td-bar .td-b').forEach(function (b) {   // icon + label spans, so short mode can show the icon alone (the full name stays in aria-label / title)
		var m = /^(\S+)\s+(.+)$/.exec(b.textContent.trim()); if (!m || b.querySelector('.td-bl')) return;
		b.textContent = ''; var i = document.createElement('span'); i.className = 'td-bi'; i.textContent = m[1];
		var l = document.createElement('span'); l.className = 'td-bl'; l.textContent = ' ' + m[2]; b.appendChild(i); b.appendChild(l);
		if (!b.hasAttribute('aria-label')) b.setAttribute('aria-label', m[2]);
	});
	var ctlBtn = document.createElement('button'); ctlBtn.type = 'button'; ctlBtn.className = 'td-ctlbtn'; ctlBtn.id = 'td-ctlbtn'; root.appendChild(ctlBtn);
	function isShort() { return (root.classList.contains('td-fill') || document.fullscreenElement === root) && !!SHORT && SHORT.matches; }
	function paintShort() {
		var sh = isShort(), off = noCtl();
		root.classList.toggle('td-short', sh); root.classList.toggle('td-noctl', sh && off);
		ctlBtn.setAttribute('aria-pressed', off ? 'true' : 'false');
		ctlBtn.innerHTML = off ? '☰ <span>Controls</span>' : '✕ <span>Hide controls</span>';
		ctlBtn.title = off ? 'Show the tools and panels again (C)' : 'Hide the tools and panels so the 3D view fills the screen (C)';
	}
	function toggleCtl() { try { localStorage.setItem(NOCTL, noCtl() ? '0' : '1'); } catch (e) {} paintShort(); setTimeout(resize, 30); }
	ctlBtn.addEventListener('click', toggleCtl);
	if (SHORT && SHORT.addEventListener) SHORT.addEventListener('change', function () { paintShort(); setTimeout(resize, 30); });
	paintShort();
	function fullScreen() {
		if (document.fullscreenElement) { document.exitFullscreen(); return; }
		var p = root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen ? root.webkitRequestFullscreen() : null;
		if (p && p.catch) p.catch(function () { setFill(true); });
	}
	document.addEventListener('fullscreenchange', function () { root.classList.toggle('td-fs', document.fullscreenElement === root); paintShort(); setTimeout(resize, 50); });

	// ---------- actions + keys ----------
	var ACTS = {
		photo3d: function () { photo3d.open(); }, templates: templatesDlg, open: function () { $('#td-file').click(); }, save: saveProject, export: exportDlg, 'new': newProject, undo: undo, redo: redo,
		hole: toggleHole, group: function () { group('union'); }, subtract: function () { group('union', true); }, intersect: function () { group('intersect'); }, ungroup: ungroup,
		dup: dup, mirror: mirrorDlg, align: alignDlg, drop: function () { drop(); }, 'delete': del, center: centerOnPlate, shot: screenshot,
		fill: function () { setFill(!root.classList.contains('td-fill')); }, full: fullScreen, help: helpDlg, svg: function () { $('#td-file').accept = '.svg'; $('#td-file').click(); },
		sketch: function () { var s = topSel(); if (s.length === 1) sketch(s[0], false); }, check: function () { check(true); }
	};
	root.addEventListener('click', function (e) {
		var b = e.target.closest('[data-act],[data-add],[data-mode],[data-view],.td-tab');
		if (!b || b.closest('#td-dlg') && !b.dataset.act) return;
		if (!ready && !b.classList.contains('td-tab') && b.dataset.act !== 'help' && b.dataset.act !== 'fill' && b.dataset.act !== 'full') return toast('The 3D engine is still loading…');
		if (b.dataset.add) addPrim(b.dataset.add);
		else if (b.dataset.mode) setMode(b.dataset.mode);
		else if (b.dataset.view) setView(b.dataset.view);
		else if (b.classList.contains('td-tab')) setTab(b.dataset.tab);
		else if (ACTS[b.dataset.act]) { if (b.closest('#td-dlg') && ['group', 'subtract', 'intersect', 'hole', 'dup', 'drop', 'delete'].indexOf(b.dataset.act) >= 0) closeDlg(); ACTS[b.dataset.act](); }
	});
	$('#td-file').addEventListener('change', function () { openFiles(this.files); this.value = ''; this.accept = '.mes3d,.json,.stl,.obj,.glb,.gltf,.3mf,.svg'; });
	$('#td-snap').checked = ST.snap; $('#td-grid').value = String(ST.grid); $('#td-addhole').checked = ST.addHole;
	$('#td-snap').addEventListener('change', function () { ST.snap = this.checked; saveST(); if (ready) applySnap(); });
	$('#td-grid').addEventListener('change', function () { ST.grid = +this.value; saveST(); if (ready) { applySnap(); buildPlate(); } });
	$('#td-addhole').addEventListener('change', function () { ST.addHole = this.checked; saveST(); });
	$('#td-osearch').addEventListener('input', outliner);
	$('#td-outl').addEventListener('click', function (e) {
		var tw = e.target.closest('[data-tw]'); if (tw) { openGroups[tw.dataset.tw] = !openGroups[tw.dataset.tw]; outliner(); return; }
		var eye = e.target.closest('[data-eye]'); if (eye) { var o = byId(eye.dataset.eye); o.hidden = !o.hidden; commit(o.hidden ? 'Hide' : 'Show'); return; }
		var lk = e.target.closest('[data-lock]'); if (lk) { var o2 = byId(lk.dataset.lock); o2.locked = !o2.locked; commit(o2.locked ? 'Lock' : 'Unlock'); return; }
		var row = e.target.closest('.td-orow'); if (!row) return;
		var id = row.dataset.id; if (row.dataset.depth !== '0') { var top = S.objs.find(function (t) { var f = false; walk([t], function (x) { if (x.id === id) f = true; }); return f; }); id = top && top.id; }
		if (id) { select([id], e.shiftKey || e.ctrlKey || e.metaKey); setTab('obj'); }
	});
	$('#td-outl').addEventListener('dblclick', function (e) {
		var row = e.target.closest('.td-orow'); if (!row || row.dataset.depth !== '0') return;
		var o = byId(row.dataset.id), nm = row.querySelector('.td-on'), inpEl = document.createElement('input');
		inpEl.className = 'td-in td-oren'; inpEl.value = o.name || nameOf(o); nm.replaceWith(inpEl); inpEl.focus(); inpEl.select();
		var done = function () { var v = inpEl.value.trim(); if (v !== (o.name || nameOf(o))) { o.name = v; commit('Rename'); } else outliner(); };
		inpEl.addEventListener('keydown', function (k) { k.stopPropagation(); if (k.key === 'Enter') done(); if (k.key === 'Escape') outliner(); });
		inpEl.addEventListener('blur', done);
	});
	// drop files anywhere on the tool
	root.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { e.preventDefault(); root.classList.add('td-drop'); } });
	root.addEventListener('dragleave', function (e) { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('td-drop'); });
	root.addEventListener('drop', function (e) { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); root.classList.remove('td-drop'); if (ready) openFiles(e.dataTransfer.files); });

	document.addEventListener('keydown', function (e) {
		var t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
		if (e.key === 'Escape') {
			if (dlgClose) { closeDlg(); return; }
			if (typing) return;
			if (root.classList.contains('td-fill')) { setFill(false); return; }
			if (S.sel.length) { select([]); return; }
			return;
		}
		if (dlgClose || typing || !ready) return;
		var inTool = root.contains(t) || t === document.body || root.classList.contains('td-fill') || document.fullscreenElement === root;
		if (!inTool) return;
		var rr = root.getBoundingClientRect(); if (rr.bottom < 60 || rr.top > window.innerHeight - 60) return;
		var ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), handled = true, s = selected(true), step = +ST.grid * (e.shiftKey ? 10 : 1);
		if (ctrl && k === 'z') e.shiftKey ? redo() : undo();
		else if (ctrl && k === 'y') redo();
		else if (ctrl && k === 'g') e.shiftKey ? ungroup() : group('union');
		else if (ctrl && k === 'd') dup();
		else if (ctrl && k === 'a') select(S.objs.filter(function (o) { return !o.hidden; }).map(function (o) { return o.id; }));
		else if (ctrl && k === 's') saveProject();
		else if (ctrl && k === 'o') $('#td-file').click();
		else if (ctrl && k === 'e') exportDlg();
		else if (ctrl) handled = false;
		else if (k === 'delete' || k === 'backspace') del();
		else if (k === 'g') setMode('translate');
		else if (k === 'r') setMode('rotate');
		else if (k === 's') setMode('scale');
		else if (k === 'h') toggleHole();
		else if (k === 'd') drop();
		else if (k === 'm') mirror(0);
		else if (k === 'c' && isShort()) toggleCtl();
		else if (k === 'f') e.shiftKey ? fullScreen() : setFill(!root.classList.contains('td-fill'));
		else if (k === '?' || (e.shiftKey && k === '/')) helpDlg();
		else if (k === '7') setView('top'); else if (k === '1') setView('front'); else if (k === '3') setView('side'); else if (k === '0') setView('iso'); else if (k === '.') setView('frame');
		else if (/^arrow/.test(k) && s.length) {
			var dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] }[k];
			s.forEach(function (o) { o.pos[0] = +(o.pos[0] + dir[0] * step).toFixed(4); o.pos[1] = +(o.pos[1] + dir[1] * step).toFixed(4); }); commit('Nudge');
		}
		else if ((k === 'pageup' || k === 'pagedown') && s.length) { s.forEach(function (o) { o.pos[2] = +(o.pos[2] + (k === 'pageup' ? step : -step)).toFixed(4); }); commit('Nudge'); }
		else handled = false;
		if (handled) e.preventDefault();
	});
	document.addEventListener('keydown', function (e) { if (e.key === 'Shift' && ready && tc.dragging) applySnap(true); });
	document.addEventListener('keyup', function (e) { if (e.key === 'Shift' && ready) applySnap(); });

	// ---------- start ----------
	shapesPanel(); outliner(); settingsPanel(); inspectorEvents(); printEvents(); settingsEvents(); setTab(ST.tab === 'set' ? 'obj' : ST.tab || 'obj'); undoBtns();
	$('#td-insp').innerHTML = '<p class="td-hint">Loading…</p>';
	var start = function () {
		loadEngine().then(function () {
			initScene(); ready = true; if (/[?&]photo=1/.test(location.search)) setTimeout(function () { photo3d.open(); }, 50);
			$('#td-loading').hidden = true;
			return loadAuto();
		}).then(function (a) {
			if (a && a.objs) { try { var objs = JSON.parse(a.objs); if (objs.length) { MESH = a.meshes || {}; S.objs = objs; S.name = a.name || S.name; toast('Welcome back: your last project is restored.', ['Start new', function () { S.objs = []; S.sel = []; S.name = 'My model'; commit('New'); }]); } } catch (e) {} }
			hist = [snapshot()]; hpos = 0; sync(); undoBtns(); frame();
			walk(S.objs, function (o) { if (o.type === 'text') needFont(o.p.font || 'helvetiker_bold'); });
			needFont('helvetiker_bold');
		}).catch(function (e) {
			console.error(e);
			$('#td-loading').innerHTML = '<div><b>The 3D engine could not load.</b><br>' + esc(e.message || e) + '<br><small>It needs WebGL and a connection to cdn.jsdelivr.net. Try reloading, or another browser.</small></div>';
		});
	};
	if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 }); else setTimeout(start, 200);

	var photo3d = window.TDPhoto3D({ L: L, esc: esc, dialog: dialog, closeDlg: closeDlg, toast: toast, addMesh: addMesh, baseName: baseName });

	// for testing in a hidden tab (no animation frames there)
	window.MES3DStudio = { render: function () { if (ready) { sync(); render(); } }, S: S, ST: ST, add: addPrim, template: function (id) { var t = window.TD_TEMPLATES.find(function (x) { return x.id === id; }); if (t) fromTemplate(t); }, check: function () { check(true); return lastCheck; }, exportParts: exportParts, doExport: doExport, select: select, group: group, setView: setView, ready: function () { return ready; }, photo3d: photo3d, addMesh: addMesh };
})();
