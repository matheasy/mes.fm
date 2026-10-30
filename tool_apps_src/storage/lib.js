/* MES Storage Analyzer core (pure; runs in the browser, in the scan Web Worker and in node:
   require('./tool_apps_src/storage/lib.js')). Nothing here reads file contents: sizes come from File.size.

   The scan result ("raw") is a flat list of nodes where a parent always comes before its children:
     { names: [string], parent: Int32Array (-1 for the root), isDir: Uint8Array, size: Float64Array (own bytes, 0 for folders),
       mtime: Float64Array (ms, 0 = unknown), files: [File|null] (kept for the opt-in duplicate check), errors: [{path, why}] }
   build(raw) turns that into a model with folder totals, a child list per folder (biggest first) and a type per file. */
var MESStorage = (function () {
	'use strict';

	/* ---------- scanning a FileSystemDirectoryHandle ----------
	   scanHandle is SELF-CONTAINED (no outside references) because its source text also runs as the Web Worker
	   (see WORKER_SRC). opt: { onProgress(p), cancelled() -> bool, maxDepth (64), concurrency (16), keepFiles (true) }.
	   Folders are read breadth first by a small pool of async workers, so every child gets a bigger index than its parent. */
	async function scanHandle(root, opt) {
		opt = opt || {};
		var names = [], parent = [], isDir = [], size = [], mtime = [], files = [], errors = [];
		var maxDepth = opt.maxDepth || 64, pool = opt.concurrency || 16, keep = opt.keepFiles !== false;
		var nFiles = 0, nDirs = 1, bytes = 0, lastPost = 0, path = root.name || 'folder';
		names.push(root.name || 'folder'); parent.push(-1); isDir.push(1); size.push(0); mtime.push(0); files.push(null);
		var queue = [{ h: root, i: 0, d: 0, p: root.name || 'folder' }], head = 0, active = 0, stop = false;
		function now() { return Date.now(); }
		function progress(force) {
			var t = now();
			if (!force && t - lastPost < 120) return;
			lastPost = t;
			if (opt.onProgress) opt.onProgress({ files: nFiles, dirs: nDirs, bytes: bytes, path: path, errors: errors.length });
		}
		function add(name, par, dir, sz, mt, file) {
			names.push(name); parent.push(par); isDir.push(dir ? 1 : 0); size.push(sz); mtime.push(mt); files.push(keep ? file : null);
			return names.length - 1;
		}
		async function readDir(job) {
			var fileHandles = [];
			path = job.p;
			try {
				for await (var h of job.h.values()) {
					if (opt.cancelled && opt.cancelled()) { stop = true; return; }
					if (h.kind === 'directory') {
						if (job.d + 1 > maxDepth) { errors.push({ path: job.p + '/' + h.name, why: 'Too deep (more than ' + maxDepth + ' levels): skipped, in case of a link loop' }); continue; }
						var di = add(h.name, job.i, true, 0, 0, null); nDirs++;
						queue.push({ h: h, i: di, d: job.d + 1, p: job.p + '/' + h.name });
					} else if (h.kind === 'file') fileHandles.push(h);
				}
			} catch (e) {
				errors.push({ path: job.p, why: (e && e.name === 'NotAllowedError' ? 'No permission to read this folder' :
					e && e.name === 'NotFoundError' ? 'Folder disappeared while scanning' : 'Could not read this folder') + (e && e.name ? ' (' + e.name + ')' : '') });
			}
			for (var k = 0; k < fileHandles.length; k += 32) {
				if (opt.cancelled && opt.cancelled()) { stop = true; return; }
				var part = fileHandles.slice(k, k + 32);
				var got = await Promise.all(part.map(function (fh) {
					return fh.getFile().then(function (f) { return f; }, function (e) { return { __err: e }; });
				}));
				for (var j = 0; j < got.length; j++) {
					var f = got[j];
					if (f && f.__err) {
						errors.push({ path: job.p + '/' + part[j].name, why: 'Could not read the size' + (f.__err && f.__err.name ? ' (' + f.__err.name + ')' : '') });
						add(part[j].name, job.i, false, 0, 0, null);
					} else {
						add(part[j].name, job.i, false, f.size || 0, f.lastModified || 0, f);
						bytes += f.size || 0;
					}
					nFiles++;
				}
				progress(false);
			}
			progress(false);
		}
		await new Promise(function (resolve) {
			function next() {
				if (stop) { if (!active) resolve(); return; }
				while (active < pool && head < queue.length) {
					var job = queue[head]; queue[head++] = null; active++;
					readDir(job).then(function () { active--; next(); }, function () { active--; next(); });
				}
				if (!active && head >= queue.length) resolve();
			}
			next();
		});
		if (stop) return null;
		progress(true);
		return { names: names, parent: Int32Array.from(parent), isDir: Uint8Array.from(isDir), size: Float64Array.from(size),
			mtime: Float64Array.from(mtime), files: files, errors: errors };
	}

	/* the Web Worker: receives {cmd:'scan', handle, maxDepth}, posts {type:'progress'|'done'|'error'|'cancelled'} */
	var WORKER_SRC = 'var scanHandle = ' + scanHandle.toString() + ';\n' +
		'var cancel = false;\n' +
		'onmessage = function (e) { var m = e.data;\n' +
		'  if (m.cmd === "cancel") { cancel = true; return; }\n' +
		'  if (m.cmd === "scan") { cancel = false;\n' +
		'    scanHandle(m.handle, { maxDepth: m.maxDepth, onProgress: function (p) { postMessage({ type: "progress", p: p }); }, cancelled: function () { return cancel; } })\n' +
		'      .then(function (r) { if (!r) { postMessage({ type: "cancelled" }); return; }\n' +
		'        postMessage({ type: "done", r: r }, [r.parent.buffer, r.isDir.buffer, r.size.buffer, r.mtime.buffer]); },\n' +
		'        function (err) { postMessage({ type: "error", message: String(err && err.message || err) }); });\n' +
		'  }\n' +
		'};\n';

	/* ---------- building from a list of paths (<input webkitdirectory> and dropped folders without handles) ----------
	   items: [{ path: 'top/a/b.txt', size, mtime, file, dir: bool }]. The first path part is the root folder's name.
	   Empty folders only show up when the list includes them as dir items (an <input webkitdirectory> never does). */
	function fromPaths(items, rootName) {
		var names = [], parent = [], isDir = [], size = [], mtime = [], files = [], dirIndex = Object.create(null);
		var root = rootName || (items.length ? String(items[0].path).split('/')[0] : 'folder');
		names.push(root); parent.push(-1); isDir.push(1); size.push(0); mtime.push(0); files.push(null); dirIndex[''] = 0;
		function dirOf(parts, upto) {
			var key = '', p = 0;
			for (var i = 0; i < upto; i++) {
				key += (i ? '/' : '') + parts[i];
				var hit = dirIndex[key];
				if (hit === undefined) {
					names.push(parts[i]); parent.push(p); isDir.push(1); size.push(0); mtime.push(0); files.push(null);
					hit = dirIndex[key] = names.length - 1;
				}
				p = hit;
			}
			return p;
		}
		for (var k = 0; k < items.length; k++) {
			var it = items[k], parts = String(it.path).split('/').filter(Boolean);
			if (parts.length && parts[0] === root) parts.shift();
			if (!parts.length) continue;
			if (it.dir) { dirOf(parts, parts.length); continue; }
			var p = dirOf(parts, parts.length - 1);
			names.push(parts[parts.length - 1]); parent.push(p); isDir.push(0); size.push(it.size || 0); mtime.push(it.mtime || 0); files.push(it.file || null);
		}
		/* folders are created on first sight, so a folder can get its index after one of its own files only when a path skips
		   levels, which dirOf never does: parents always come first */
		return { names: names, parent: Int32Array.from(parent), isDir: Uint8Array.from(isDir), size: Float64Array.from(size),
			mtime: Float64Array.from(mtime), files: files, errors: [] };
	}

	/* ---------- file types ---------- */
	var CATS = [
		{ k: 'video', name: 'Video', color: '#e11d48', ext: 'mp4 m4v mov mkv avi wmv flv webm mpg mpeg m2ts mts ts 3gp vob ogv trec camrec tscproj' },
		{ k: 'image', name: 'Pictures', color: '#2563eb', ext: 'jpg jpeg png gif webp heic heif bmp tif tiff svg raw cr2 cr3 nef arw dng orf rw2 psd xcf ai eps ico avif jxl mesproj' },
		{ k: 'audio', name: 'Audio', color: '#9333ea', ext: 'mp3 wav flac aac m4a ogg opus wma aiff aif mid midi alac amr' },
		{ k: 'doc', name: 'Documents', color: '#16a34a', ext: 'pdf doc docx xls xlsx xlsm ppt pptx odt ods odp rtf txt md csv tsv epub mobi pages numbers key tex log json xml yaml yml html htm' },
		{ k: 'archive', name: 'Archives & disk images', color: '#ca8a04', ext: 'zip rar 7z tar gz tgz bz2 xz zst iso dmg img vhd vhdx vmdk qcow2 cab' },
		{ k: 'code', name: 'Code', color: '#0891b2', ext: 'js mjs cjs ts tsx jsx py rb go rs java kt c h cpp hpp cc cs php swift m mm sh bat ps1 css scss less vue svelte sql r jl lua pl ipynb' },
		{ k: 'app', name: 'Apps & installers', color: '#ea580c', ext: 'exe msi app apk aab ipa pkg deb rpm appimage jar dll so dylib sys bin wasm' },
		{ k: 'data', name: 'Databases & caches', color: '#64748b', ext: 'db sqlite sqlite3 mdb accdb dat cache tmp bak old swp lock idx pack pyc class o obj' },
		{ k: 'other', name: 'Other', color: '#94a3b8', ext: '' }
	];
	var EXT_CAT = Object.create(null);
	CATS.forEach(function (c, i) { c.ext.split(' ').forEach(function (e) { if (e) EXT_CAT[e] = i; }); });
	var OTHER = CATS.length - 1;
	/* lower-case extension without the dot; '' when there is none. Dot-files (.gitignore) have no extension. */
	function ext(name) {
		var s = String(name), i = s.lastIndexOf('.');
		if (i <= 0 || i === s.length - 1) return '';
		var e = s.slice(i + 1).toLowerCase();
		return e.length > 12 || /\s/.test(e) ? '' : e;
	}
	function catOf(e) { var c = EXT_CAT[e]; return c === undefined ? OTHER : c; }

	/* ---------- the model ---------- */
	function build(raw) {
		var n = raw.names.length, par = raw.parent, dir = raw.isDir;
		var total = new Float64Array(n), files = new Uint32Array(n), dirs = new Uint32Array(n), newest = new Float64Array(n), depth = new Uint16Array(n);
		var extId = new Int32Array(n).fill(-1), cat = new Uint8Array(n), exts = [], extIx = Object.create(null);
		for (var i = 0; i < n; i++) {
			total[i] = raw.size[i]; newest[i] = raw.mtime[i];
			if (!dir[i]) {
				files[i] = 1;
				var e = ext(raw.names[i]), x = extIx[e];
				if (x === undefined) { x = extIx[e] = exts.length; exts.push(e); }
				extId[i] = x; cat[i] = catOf(e);
			}
			if (i > 0) depth[i] = depth[par[i]] + 1;
		}
		for (i = n - 1; i > 0; i--) {
			var p = par[i];
			total[p] += total[i]; files[p] += files[i]; dirs[p] += dir[i] ? dirs[i] + 1 : 0;
			if (newest[i] > newest[p]) newest[p] = newest[i];
		}
		/* children lists (CSR), biggest first */
		var count = new Uint32Array(n + 1);
		for (i = 1; i < n; i++) count[par[i] + 1]++;
		for (i = 0; i < n; i++) count[i + 1] += count[i];
		var start = count.slice(0, n + 1), fill = count.slice(0, n), kids = new Int32Array(Math.max(0, n - 1));
		for (i = 1; i < n; i++) kids[fill[par[i]]++] = i;
		for (i = 0; i < n; i++) {
			var a = start[i], b = start[i + 1];
			if (b - a > 1) {
				var sub = Array.prototype.slice.call(kids, a, b).sort(function (u, v) { return total[v] - total[u] || (raw.names[u] < raw.names[v] ? -1 : 1); });
				for (var j = 0; j < sub.length; j++) kids[a + j] = sub[j];
			}
		}
		return { n: n, names: raw.names, parent: par, isDir: dir, size: raw.size, mtime: raw.mtime, fileObj: raw.files || [], errors: raw.errors || [],
			total: total, files: files, dirs: dirs, newest: newest, depth: depth, extId: extId, cat: cat, exts: exts, start: start, kids: kids };
	}
	function children(m, i) { return Array.prototype.slice.call(m.kids, m.start[i], m.start[i + 1]); }
	function pathOf(m, i) { var p = []; while (i >= 0) { p.push(m.names[i]); i = m.parent[i]; } return p.reverse().join('/'); }
	function ancestors(m, i) { var p = []; while (i >= 0) { p.push(i); i = m.parent[i]; } return p.reverse(); }
	function isInside(m, i, root) { while (i >= 0) { if (i === root) return true; i = m.parent[i]; } return false; }

	/* biggest n items of an index list by key (a simple bounded insertion; fine for n <= a few hundred) */
	function topN(ids, key, n) {
		var out = [];
		for (var k = 0; k < ids.length; k++) {
			var id = ids[k], v = key(id);
			if (out.length === n && v <= key(out[n - 1])) continue;
			var lo = 0, hi = out.length;
			while (lo < hi) { var mid = (lo + hi) >> 1; if (key(out[mid]) >= v) lo = mid + 1; else hi = mid; }
			out.splice(lo, 0, id); if (out.length > n) out.pop();
		}
		return out;
	}
	function fileIds(m, root) {
		var out = [];
		for (var i = 0; i < m.n; i++) if (!m.isDir[i] && (root === 0 || root == null || isInside(m, i, root))) out.push(i);
		return out;
	}
	function largestFiles(m, n, root) { return topN(fileIds(m, root), function (i) { return m.size[i]; }, n || 50); }

	/* bytes and counts per category and per extension, under root */
	function byType(m, root) {
		var cats = CATS.map(function (c, i) { return { i: i, k: c.k, name: c.name, color: c.color, bytes: 0, count: 0 }; });
		var ex = Object.create(null);
		var ids = fileIds(m, root);
		for (var k = 0; k < ids.length; k++) {
			var i = ids[k], c = cats[m.cat[i]], e = m.exts[m.extId[i]];
			c.bytes += m.size[i]; c.count++;
			var r = ex[e] || (ex[e] = { ext: e, cat: m.cat[i], bytes: 0, count: 0, biggest: i });
			r.bytes += m.size[i]; r.count++; if (m.size[i] > m.size[r.biggest]) r.biggest = i;
		}
		var list = Object.keys(ex).map(function (k) { return ex[k]; }).sort(function (a, b) { return b.bytes - a.bytes; });
		return { cats: cats.filter(function (c) { return c.count; }).sort(function (a, b) { return b.bytes - a.bytes; }), exts: list };
	}

	/* files at least minBytes big and not changed for at least days days, biggest first */
	function oldLarge(m, minBytes, days, nowMs, n, root) {
		var cut = nowMs - days * 864e5;
		var ids = fileIds(m, root).filter(function (i) { return m.size[i] >= minBytes && m.mtime[i] > 0 && m.mtime[i] <= cut; });
		var bytes = 0; ids.forEach(function (i) { bytes += m.size[i]; });
		return { count: ids.length, bytes: bytes, top: topN(ids, function (i) { return m.size[i]; }, n || 200) };
	}

	/* folders with no files anywhere inside (their sub-folders are empty too). Only the outermost one of a chain is listed. */
	function emptyFolders(m, root) {
		var out = [];
		for (var i = 1; i < m.n; i++) {
			if (m.isDir[i] && m.files[i] === 0 && !(m.parent[i] > 0 && m.files[m.parent[i]] === 0) && (root == null || root === 0 || isInside(m, i, root))) out.push(i);
		}
		return out;
	}

	/* duplicate candidates: files of exactly the same size (>= minBytes). Groups sorted by the space a clean-up would free. */
	function sameSizeGroups(m, minBytes, root) {
		var by = new Map(), ids = fileIds(m, root);
		for (var k = 0; k < ids.length; k++) {
			var i = ids[k], s = m.size[i];
			if (s < (minBytes || 1)) continue;
			var g = by.get(s); if (g) g.push(i); else by.set(s, [i]);
		}
		var out = [];
		by.forEach(function (g, s) { if (g.length > 1) out.push({ size: s, ids: g, waste: s * (g.length - 1) }); });
		return out.sort(function (a, b) { return b.waste - a.waste; });
	}
	/* split a same-size group by content hash: hashes = { id: hex|null }. Returns groups of >= 2 with equal hashes. */
	function splitByHash(group, hashes) {
		var by = Object.create(null), out = [];
		group.ids.forEach(function (i) { var h = hashes[i]; if (!h) return; (by[h] || (by[h] = [])).push(i); });
		Object.keys(by).forEach(function (h) { if (by[h].length > 1) out.push({ size: group.size, hash: h, ids: by[h], waste: group.size * (by[h].length - 1) }); });
		return out;
	}

	/* search: names containing every word (case and accents ignored), or *.ext / ext:mp4 */
	function fold(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
	function matcher(q) {
		var words = fold(q).trim().split(/\s+/).filter(Boolean);
		if (!words.length) return null;
		var exts = [], plain = [];
		words.forEach(function (w) {
			var mm = /^(?:\*\.|ext:|\.)([a-z0-9]{1,12})$/.exec(w);
			if (mm) exts.push(mm[1]); else plain.push(w);
		});
		return function (name) {
			var f = fold(name);
			if (exts.length && exts.indexOf(ext(name)) < 0) return false;
			for (var k = 0; k < plain.length; k++) if (f.indexOf(plain[k]) < 0) return false;
			return true;
		};
	}
	function search(m, q, n, root) {
		var fn = matcher(q); if (!fn) return { count: 0, ids: [] };
		var hits = [];
		for (var i = 1; i < m.n; i++) if (fn(m.names[i]) && (root == null || root === 0 || isInside(m, i, root))) hits.push(i);
		return { count: hits.length, ids: topN(hits, function (i) { return m.total[i]; }, n || 300) };
	}

	/* ---------- squarified treemap (Bruls, Huizing, van Wijk 2000) ----------
	   values: sizes (any order, > 0); returns [{i (index into values), x, y, w, h}] filling the rectangle. */
	function squarify(values, x, y, w, h) {
		var idx = [], sum = 0;
		for (var i = 0; i < values.length; i++) if (values[i] > 0) { idx.push(i); sum += values[i]; }
		idx.sort(function (a, b) { return values[b] - values[a]; });
		var out = [];
		if (!idx.length || w <= 0 || h <= 0) return out;
		var scale = w * h / sum, k = 0;
		function worst(row, rs, side) {
			var mx = 0, mn = Infinity;
			for (var j = 0; j < row.length; j++) { var a = values[row[j]] * scale; if (a > mx) mx = a; if (a < mn) mn = a; }
			var s2 = side * side, r2 = rs * rs;
			return Math.max(s2 * mx / r2, r2 / (s2 * mn));
		}
		while (k < idx.length) {
			var side = Math.min(w, h), row = [idx[k]], rs = values[idx[k]] * scale; k++;
			while (k < idx.length) {
				var a2 = values[idx[k]] * scale;
				if (worst(row.concat(idx[k]), rs + a2, side) <= worst(row, rs, side)) { row.push(idx[k]); rs += a2; k++; } else break;
			}
			var thick = rs / side, pos = 0;
			for (var j = 0; j < row.length; j++) {
				var len = values[row[j]] * scale / thick;
				if (w >= h) out.push({ i: row[j], x: x, y: y + pos, w: thick, h: len });
				else out.push({ i: row[j], x: x + pos, y: y, w: len, h: thick });
				pos += len;
			}
			if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
			if (w < 1e-9 || h < 1e-9) { w = Math.max(w, 0); h = Math.max(h, 0); }
		}
		return out;
	}

	/* ---------- sunburst layout ----------
	   From folder `root`, out to `rings` levels. Each arc: {i, ring (1..rings), a0, a1 (radians, 0 = 12 o'clock, clockwise)}.
	   Arcs narrower than minAngle are merged into one grey "small items" arc per parent ({i: -1, parent}). */
	function sunburst(m, root, rings, minAngle) {
		var out = [], tot = m.total[root] || 1;
		function walk(i, ring, a0, span) {
			if (ring > rings) return;
			var ks = children(m, i), a = a0, small = 0, smallN = 0, scale = span / (m.total[i] || 1);
			for (var k = 0; k < ks.length; k++) {
				var c = ks[k], s = m.total[c] * scale;
				if (s <= 0) continue;
				if (s < minAngle) { small += s; smallN++; continue; }
				out.push({ i: c, ring: ring, a0: a, a1: a + s });
				if (m.isDir[c]) walk(c, ring + 1, a, s);
				a += s;
			}
			if (small > 0) out.push({ i: -1, parent: i, n: smallN, ring: ring, a0: a, a1: a + small });
		}
		if (tot > 0) walk(root, 1, 0, Math.PI * 2);
		return out;
	}

	/* ---------- formatting ---------- */
	function fmtBytes(b, digits) {
		if (!(b > 0)) return '0 B';
		var u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], i = 0;
		while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
		var d = digits != null ? digits : (b >= 100 || i === 0 ? 0 : b >= 10 ? 1 : 2);
		return b.toFixed(d) + ' ' + u[i];
	}
	function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
	function pct(part, whole) { return whole > 0 ? part / whole * 100 : 0; }
	function fmtPct(p) { return p >= 10 ? p.toFixed(0) + '%' : p >= 0.1 ? p.toFixed(1) + '%' : p > 0 ? '<0.1%' : '0%'; }
	function fmtDate(ms) { if (!(ms > 0)) return ''; var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
	function ageText(ms, nowMs) {
		if (!(ms > 0)) return 'unknown';
		var d = (nowMs - ms) / 864e5;
		if (d < 1) return 'today'; if (d < 2) return 'yesterday'; if (d < 60) return Math.floor(d) + ' days ago';
		if (d < 730) return Math.floor(d / 30.44) + ' months ago'; return (d / 365.25).toFixed(1).replace(/\.0$/, '') + ' years ago';
	}
	/* parse "500 MB", "1.5 GB", "200k" -> bytes (decimal units, like the rest of the page) */
	function parseSize(s) {
		var mm = /^\s*([\d.,]+)\s*([kmgtp]?)(i?)b?\s*$/i.exec(String(s));
		if (!mm) return null;
		var v = parseFloat(mm[1].replace(',', '.')); if (!isFinite(v)) return null;
		var p = 'bkmgtp'.indexOf((mm[2] || 'b').toLowerCase()); if (!mm[2]) p = 0;
		return Math.round(v * Math.pow(mm[3] ? 1024 : 1000, p));
	}

	/* ---------- reports ---------- */
	function csvCell(v) { var s = String(v == null ? '' : v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
	/* one row per folder and file under root (folders only when foldersOnly) */
	function toCSV(m, root, foldersOnly) {
		root = root || 0;
		var rows = [['path', 'type', 'bytes', 'size', 'files', 'folders', 'modified'].join(',')];
		var stack = [root];
		while (stack.length) {
			var i = stack.pop(), d = m.isDir[i];
			if (d || !foldersOnly) rows.push([csvCell(pathOf(m, i)), d ? 'folder' : 'file', m.total[i], csvCell(fmtBytes(m.total[i])), m.files[i], d ? m.dirs[i] : '', fmtDate(m.newest[i])].join(','));
			if (d) { var ks = children(m, i); for (var k = ks.length - 1; k >= 0; k--) stack.push(ks[k]); }
		}
		return rows.join('\r\n') + '\r\n';
	}
	/* nested JSON down to maxDepth levels below root; deeper content is summed into its folder */
	function toJSON(m, root, maxDepth, nowMs) {
		root = root || 0;
		function node(i, d) {
			var o = { name: m.names[i], type: m.isDir[i] ? 'folder' : 'file', bytes: m.total[i] };
			if (m.isDir[i]) { o.files = m.files[i]; o.folders = m.dirs[i]; }
			if (m.newest[i] > 0) o.modified = new Date(m.newest[i]).toISOString();
			if (m.isDir[i] && d < maxDepth) o.children = children(m, i).map(function (c) { return node(c, d + 1); });
			return o;
		}
		return { tool: 'MES Storage Analyzer', made: new Date(nowMs || Date.now()).toISOString(), root: pathOf(m, root), tree: node(root, 0) };
	}

	return { scanHandle: scanHandle, WORKER_SRC: WORKER_SRC, fromPaths: fromPaths, build: build, children: children, pathOf: pathOf,
		ancestors: ancestors, isInside: isInside, topN: topN, largestFiles: largestFiles, byType: byType, oldLarge: oldLarge,
		emptyFolders: emptyFolders, sameSizeGroups: sameSizeGroups, splitByHash: splitByHash, matcher: matcher, search: search,
		squarify: squarify, sunburst: sunburst, ext: ext, catOf: catOf, CATS: CATS, fmtBytes: fmtBytes, fmtInt: fmtInt, pct: pct,
		fmtPct: fmtPct, fmtDate: fmtDate, ageText: ageText, parseSize: parseSize, csvCell: csvCell, toCSV: toCSV, toJSON: toJSON };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESStorage;
