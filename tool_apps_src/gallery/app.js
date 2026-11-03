/* MES Gallery -- mes.fm/gallery. Photos and videos from a folder on this computer, shown in the browser; nothing is uploaded.
   Pure maths in lib.js (MESGallery); EXIF from the EXIF viewer's lib (MESExif, lib_from). This file: opening folders / files (File System Access
   with a remembered handle in IndexedDB, <input webkitdirectory> and drag-and-drop fallbacks), the metadata pass (header sizes, EXIF dates),
   thumbnails (createImageBitmap / OffscreenCanvas, video poster frames, cached in IndexedDB), the virtualised grid, and the viewer. */
(function () {
	'use strict';
	var G = window.MESGallery, X = window.MESExif;
	var root = document.getElementById('mg');
	if (!root || !G) return;
	function $(id) { return document.getElementById(id); }
	function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	var KEY = 'mes-gallery:v1';
	var P = { view: 'justified', size: 200, group: 'month', sort: 'date', dir: -1, kind: 'all', sub: true, names: false, slide: 4, fit: 'fit', pct: 100, noUp: false, vol: 1, muted: false, strip: true, info: false, loopAll: false, vidFull: true, lastRate: 1.5, fill: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in sv) if (k in P) P[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }

	/* ---------------- IndexedDB: thumbs (blobs), meta (sizes / dates), kv (folder handle, ratings) ---------------- */
	var dbp = null;
	function db() {
		if (dbp) return dbp;
		dbp = new Promise(function (res) {
			try {
				var r = indexedDB.open('mes-gallery', 1);
				r.onupgradeneeded = function () { var d = r.result; ['thumbs', 'meta', 'kv'].forEach(function (s) { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
				r.onsuccess = function () { res(r.result); };
				r.onerror = r.onblocked = function () { res(null); };
			} catch (e) { res(null); }
		});
		return dbp;
	}
	function idb(store, mode, fn) {
		return db().then(function (d) {
			if (!d) return null;
			return new Promise(function (res) {
				try { var tx = d.transaction(store, mode), st = tx.objectStore(store), rq = fn(st); tx.oncomplete = function () { res(rq && 'result' in rq ? rq.result : null); }; tx.onerror = tx.onabort = function () { res(null); }; }
				catch (e) { res(null); }
			});
		});
	}
	function iget(store, key) { return idb(store, 'readonly', function (s) { return s.get(key); }); }
	function iput(store, key, val) { return idb(store, 'readwrite', function (s) { return s.put(val, key); }); }
	function iclear(store) { return idb(store, 'readwrite', function (s) { return s.clear(); }); }

	/* ratings / favourites: {rkey: {f: 1, r: 0-5}} keyed by name + size, so they survive moving a file to another folder */
	var RT = {};
	iget('kv', 'ratings').then(function (v) { if (v && typeof v === 'object') { RT = v; if (ALL.length) refresh(); } });
	var rtTimer = 0;
	function saveRT() { clearTimeout(rtTimer); rtTimer = setTimeout(function () { iput('kv', 'ratings', RT); }, 300); }
	function rating(it) { return RT[it.rkey] || {}; }
	function setRating(it, patch) { var r = Object.assign({}, RT[it.rkey] || {}, patch); if (!r.f && !r.r) delete RT[it.rkey]; else RT[it.rkey] = r; saveRT(); }

	/* ---------------- toast ---------------- */
	var toastEl = el('div', 'mg-toast'), toastT = 0;
	toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl);
	function toast(msg, ms) { toastEl.textContent = msg; toastEl.classList.add('mg-show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('mg-show'); }, ms || 2600); }

	/* ---------------- opening ---------------- */
	var ALL = [], VIEW = [], LAY = null, uid = 0, rootName = '', rootHandle = null, scanGen = 0;
	var hasPicker = typeof window.showDirectoryPicker === 'function';
	var isBrave = !!(navigator.brave);
	(function how() {
		var t;
		if (hasPicker) t = 'This browser can open a folder directly and remember it for next time. You can also drag a folder or files onto this box.';
		else if (isBrave) t = 'In Brave a folder opens through the browser\'s "upload a folder" window: nothing is actually uploaded. To open folders directly and have them remembered, turn on <code>brave://flags/#file-system-access-api</code> and restart Brave. Dragging a folder here works too.';
		else t = 'This browser opens a folder through its "upload a folder" window: nothing is actually uploaded, the word is just the browser\'s. You can also drag a folder or files onto this box.';
		$('mg-how').innerHTML = t;
	})();
	$('mg-sub').checked = P.sub;
	$('mg-sub').addEventListener('change', function () { P.sub = this.checked; save(); });

	function mkItem(file, rel, dropTop) {
		var sp = G.splitPath(rel || file.name, dropTop), name = sp.name || file.name;
		if (name[0] === '.' || /^~\$/.test(name) || name === 'Thumbs.db') return null;
		var kind = G.kindOf(name, file.type);
		if (!kind) return null;
		var it = { id: ++uid, file: file, name: name, folder: sp.folder, path: (sp.folder ? sp.folder + '/' : '') + name, kind: kind, ext: G.ext(name), size: file.size, mtime: file.lastModified || 0,
			named: G.nameDate(name), taken: 0, w: 0, h: 0, dur: 0, ar: 0, rkey: G.rateKey(name, file.size), meta: false };
		return it;
	}
	function begin(name) {
		scanGen++; stopQueues(); closeViewer(true);
		ALL = []; VIEW = []; rootName = name || 'Photos';
		thumbURL.forEach(function (u) { URL.revokeObjectURL(u); }); thumbURL.clear(); thumbOrder = [];
		$('mg-start').hidden = true; $('mg-app').hidden = false; $('mg-name').textContent = rootName;
		$('mg-canvas').innerHTML = ''; rendered.clear(); heads.clear();
		$('mg-scroll').scrollTop = 0;
		applyFill();
		return scanGen;
	}
	function finish(gen) {
		if (gen !== scanGen) return;
		progress(null);
		if (!ALL.length) { refresh(); return; }
		refresh(); metaPass(gen);
	}
	function addItems(list, gen) { if (gen !== scanGen) return; for (var i = 0; i < list.length; i++) if (list[i]) ALL.push(list[i]); }

	/* File System Access: walk the folder (16 at a time), collect File objects */
	function scanHandle(dir, gen, prefix) {
		var found = [], queue = [{ h: dir, p: prefix || '' }], active = 0, folders = 0, t0 = Date.now(), last = 0;
		return new Promise(function (res) {
			function pump() {
				if (gen !== scanGen) return res();
				while (active < 16 && queue.length) one(queue.shift());
				if (!active && !queue.length) { addItems(found, gen); res(); }
			}
			function one(q) {
				active++; folders++;
				var files = [];
				(async function () {
					try {
						for await (var ent of q.h.values()) {
							if (gen !== scanGen) break;
							if (ent.kind === 'file') { if (G.kindOf(ent.name)) files.push(ent); }
							else if (P.sub && ent.name[0] !== '.' && !/^(node_modules|\$RECYCLE\.BIN|System Volume Information)$/i.test(ent.name)) queue.push({ h: ent, p: q.p + ent.name + '/' });
						}
						for (var i = 0; i < files.length; i += 32) {
							var part = await Promise.all(files.slice(i, i + 32).map(function (fh) { return fh.getFile().then(function (f) { return mkItem(f, q.p + fh.name, false); }, function () { return null; }); }));
							part.forEach(function (x) { if (x) found.push(x); });
						}
					} catch (e) { /* unreadable folder: skip */ }
					active--;
					if (Date.now() - last > 120) { last = Date.now(); progress('Looking for photos and videos… ' + found.length.toLocaleString() + ' found in ' + folders.toLocaleString() + ' folders', -1); }
					if (found.length > 0 && Date.now() - t0 > 900 && !ALL.length && found.length > 60) { addItems(found, gen); found = []; refresh(); }
					pump();
				})();
			}
			pump();
		});
	}
	function openPicker() {
		if (!hasPicker) { $('mg-dirinput').click(); return; }
		window.showDirectoryPicker({ id: 'mes-gallery', mode: 'read' }).then(function (h) {
			rootHandle = h; iput('kv', 'dir', h); openHandle(h);
		}, function (e) { if (e && e.name !== 'AbortError') toast('Could not open that folder: ' + (e.message || e.name)); });
	}
	function openHandle(h) {
		var gen = begin(h.name); progress('Looking for photos and videos…', -1);
		scanHandle(h, gen).then(function () { finish(gen); });
	}
	/* a folder remembered from the last visit: one click asks for permission again */
	iget('kv', 'dir').then(function (h) {
		if (!h || !h.name || !hasPicker) return;
		var b = $('mg-reopen'); b.hidden = false; b.textContent = '↻ Open “' + h.name + '” again';
		b.onclick = function () {
			var ask = h.requestPermission ? h.requestPermission({ mode: 'read' }) : Promise.resolve('granted');
			ask.then(function (s) { if (s === 'granted') { rootHandle = h; openHandle(h); } else toast('The browser did not allow reading that folder. Choose it again.'); }, function () { toast('That folder is not available any more. Choose it again.'); b.hidden = true; });
		};
	});
	function fromFileList(list, name, append) {
		var arr = Array.prototype.slice.call(list || []), rel = arr.length && arr[0].webkitRelativePath;
		if (!arr.length) return;
		var top = rel ? rel.split('/')[0] : name;
		var gen = append && ALL.length ? scanGen : begin(top || 'Photos');
		var items = arr.map(function (f) { var r = f.webkitRelativePath; if (r && !P.sub && r.split('/').length > 2) return null; return mkItem(f, r || f.name, !!r); });
		addItems(items, gen);
		if (append) { refresh(); metaPass(gen); } else finish(gen);
	}
	$('mg-folder').onclick = openPicker;
	$('mg-files').onclick = function () { $('mg-fileinput').dataset.append = ''; $('mg-fileinput').click(); };
	$('mg-dirinput').addEventListener('change', function () { fromFileList(this.files, 'Folder'); this.value = ''; });
	$('mg-fileinput').addEventListener('change', function () { fromFileList(this.files, 'Selected files', this.dataset.append === '1'); this.value = ''; });

	/* drag and drop (folders via webkitGetAsEntry, which every browser has) */
	function readEntries(entry, prefix, out) {
		return new Promise(function (res) {
			if (entry.isFile) { entry.file(function (f) { out.push({ f: f, rel: prefix + f.name }); res(); }, function () { res(); }); return; }
			if (!entry.isDirectory) return res();
			var rd = entry.createReader(), all = [];
			(function more() {
				rd.readEntries(function (ents) {
					if (!ents.length) {
						Promise.all(all.filter(function (e) { return e.isFile || (P.sub && e.name[0] !== '.'); }).map(function (e) { return readEntries(e, prefix + entry.name + '/', out); })).then(res);
						return;
					}
					all = all.concat(Array.prototype.slice.call(ents)); more();
				}, function () { res(); });
			})();
		});
	}
	function onDrop(ev) {
		ev.preventDefault(); dragOver(false);
		var dt = ev.dataTransfer; if (!dt) return;
		var ents = [];
		for (var i = 0; i < (dt.items || []).length; i++) { var e = dt.items[i].webkitGetAsEntry && dt.items[i].webkitGetAsEntry(); if (e) ents.push(e); }
		if (!ents.length) { fromFileList(dt.files, 'Dropped files', !$('mg-app').hidden); return; }
		var out = [], single = ents.length === 1 && ents[0].isDirectory, append = !$('mg-app').hidden && !single;
		var gen = append && ALL.length ? scanGen : begin(single ? ents[0].name : 'Dropped files');
		progress('Reading the dropped files…', -1);
		Promise.all(ents.map(function (e) { return e.isDirectory ? readEntries(e, '', out) : readEntries(e, '', out); })).then(function () {
			addItems(out.map(function (o) { return mkItem(o.f, o.rel, single); }), gen);
			if (append) { progress(null); refresh(); metaPass(gen); } else finish(gen);
		});
	}
	function dragOver(on) { $('mg-drop').classList.toggle('mg-over', on); $('mg-app').classList.toggle('mg-over', on); }
	['dragenter', 'dragover'].forEach(function (t) { root.addEventListener(t, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); dragOver(true); } }); });
	root.addEventListener('dragleave', function (e) { if (!root.contains(e.relatedTarget)) dragOver(false); });
	root.addEventListener('drop', onDrop);

	/* installed app: "Open with MES Gallery" (manifest file_handlers) */
	if ('launchQueue' in window) {
		window.launchQueue.setConsumer(function (lp) {
			if (!lp.files || !lp.files.length) return;
			Promise.all(lp.files.map(function (h) { return h.getFile(); })).then(function (fs) { fromFileList(fs, fs.length === 1 ? fs[0].name : 'Opened files'); if (fs.length === 1) setTimeout(function () { if (VIEW.length) openViewer(0); }, 300); });
		});
	}

	/* the open menu */
	var menu = $('mg-menu');
	$('mg-more').onclick = function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; this.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) menu.querySelector('button').focus(); };
	document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; $('mg-more').setAttribute('aria-expanded', 'false'); } });
	menu.addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return; menu.hidden = true;
		var a = b.dataset.act;
		if (a === 'folder') openPicker();
		else if (a === 'files') { $('mg-fileinput').dataset.append = ''; $('mg-fileinput').click(); }
		else if (a === 'add') { $('mg-fileinput').dataset.append = '1'; $('mg-fileinput').click(); }
		else if (a === 'rescan') { if (rootHandle) openHandle(rootHandle); else toast('Open the folder again to look for new files.'); }
		else if (a === 'close') { begin(''); $('mg-app').hidden = true; $('mg-start').hidden = false; P.fill = false; applyFill(); }
		else if (a === 'clearcache') { Promise.all([iclear('thumbs'), iclear('meta')]).then(function () { toast('Saved thumbnails forgotten. Favourites and ratings are kept.'); }); }
	});

	/* ---------------- progress ---------------- */
	function progress(text, frac) {
		var p = $('mg-prog');
		if (text == null) { p.hidden = true; return; }
		p.hidden = false; $('mg-progtext').textContent = text;
		$('mg-progfill').style.width = frac < 0 ? '30%' : Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
	}

	/* ---------------- metadata pass: picture size + orientation from the header, EXIF date. Cached in IndexedDB. ---------------- */
	function metaKey(it) { return G.thumbKey(it, 0); }
	function readSlice(f, n) { return f.slice(0, n).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
	function metaPass(gen) {
		var todo = ALL.filter(function (it) { return !it.meta; }), done = 0, total = todo.length, i = 0, active = 0, changed = 0;
		if (!total) return;
		function tick() {
			if (gen !== scanGen) return;
			while (active < 8 && i < todo.length) one(todo[i++]);
			if (!active && i >= todo.length) { progress(null); refresh(true); return; }
		}
		function one(it) {
			active++;
			iget('meta', metaKey(it)).then(function (m) {
				if (m) { applyMeta(it, m); return; }
				if (it.kind !== 'image') { it.meta = true; return; }
				return readSlice(it.file, 65536).then(function (u8) {
					var s = G.imageSize(u8), ex = null;
					if (!s && u8[0] === 0xFF && u8[1] === 0xD8 && it.size > 65536) return readSlice(it.file, 524288).then(function (u) { return done2(u); });
					return done2(u8);
					function done2(u) {
						s = G.imageSize(u);
						try { ex = X ? X.parse(u.buffer.byteLength === u.length ? u.buffer : u.slice().buffer) : null; } catch (e) { ex = null; }
						var dt = null; if (ex && ex.rows) ex.rows.forEach(function (r) { if (r.name === 'Date taken' && !dt) dt = G.exifDate(r.value); });
						if (!s) { var sn = G.sniff(u); if (sn && sn.kind !== it.kind) it.kind = sn.kind; }
						var m2 = { w: s ? s.w : 0, h: s ? s.h : 0, o: s ? s.o : 1, taken: dt || 0 };
						applyMeta(it, m2); iput('meta', metaKey(it), m2);
					}
				});
			}).catch(function () { it.meta = true; }).then(function () {
				active--; done++; changed++;
				if (changed > 60 || done === total) { changed = 0; relayoutSoon(); }
				if (done % 25 === 0 || done === total) progress('Reading dates and sizes… ' + done.toLocaleString() + ' of ' + total.toLocaleString(), done / total);
				tick();
			});
		}
		tick();
	}
	function applyMeta(it, m) {
		it.meta = true;
		if (m.w && m.h) { it.w = m.w; it.h = m.h; it.ar = m.w / m.h; }
		if (m.taken) it.taken = m.taken;
		if (m.dur) it.dur = m.dur;
		if (m.bad) it.bad = m.bad;
	}

	/* ---------------- filtering, sorting, layout ---------------- */
	function aspectOf(it) { return it.ar || (it.kind === 'video' ? 16 / 9 : 4 / 3); }
	function refresh(keep) {
		var list = G.filterItems(ALL, { q: $('mg-q').value, kind: P.kind }, RT);
		VIEW = G.sortItems(list, P.sort, P.dir, RT, 7);
		VIEW.forEach(function (it, i) { it.vi = i; });
		var s = G.summary(ALL), st = [];
		if (s.images) st.push(G.plural(s.images, 'photo'));
		if (s.videos) st.push(G.plural(s.videos, 'video'));
		st.push(G.fmtBytes(s.bytes));
		if (s.first && s.last) { var a = new Date(s.first).getFullYear(), b = new Date(s.last).getFullYear(); st.push(a === b ? '' + a : a + '–' + b); }
		if (VIEW.length !== ALL.length) st.push(G.plural(VIEW.length, 'match') .replace('matchs', 'matches') + ' showing');
		$('mg-stats').textContent = '· ' + st.join(' · ');
		var em = $('mg-empty');
		if (!ALL.length) { em.hidden = false; em.textContent = scanGen && $('mg-prog').hidden ? 'No photos or videos here. Try another folder, or tick "Include subfolders".' : ''; }
		else if (!VIEW.length) { em.hidden = false; em.textContent = P.kind === 'fav' ? 'No favourites yet: tap ♥ on a picture to add it.' : 'Nothing matches your search.'; }
		else em.hidden = true;
		relayout(!!keep);
	}
	var relayT = 0;
	function relayoutSoon() { if (relayT) return; relayT = setTimeout(function () { relayT = 0; if (P.sort === 'date' || P.sort === 'dims' || P.sort === 'duration' || /^(day|month|year)$/.test(P.group)) refresh(true); else relayout(true); }, 300); }
	function scrollW() { var sc = $('mg-scroll'); return sc.clientWidth - 12; }
	function relayout(keep) {
		var sc = $('mg-scroll'), anchor = null, off = 0;
		if (keep && LAY && sc.scrollTop > 0) {
			var vis = G.visible(LAY.tiles, sc.scrollTop, sc.scrollTop + 10);
			if (vis.length) { anchor = LAY.tiles[vis[0]].it; off = LAY.tiles[vis[0]].y - sc.scrollTop; }
		}
		var groups = G.groupItems(VIEW, P.group);
		var gap = P.view === 'list' ? 0 : P.size < 130 ? 3 : 5;
		LAY = G.layout(groups, { width: scrollW(), size: P.view === 'square' ? P.size * 0.85 : P.size, gap: gap, view: P.view, headH: 44, listH: 56 }, aspectOf);
		LAY.groups = groups;
		LAY.byId = {}; LAY.tiles.forEach(function (t, i) { LAY.byId[t.it.id] = i; });
		$('mg-canvas').style.height = Math.ceil(LAY.height) + 'px';
		if (anchor && LAY.byId[anchor.id] != null) sc.scrollTop = LAY.tiles[LAY.byId[anchor.id]].y - off;
		render(false);
	}

	/* ---------------- virtualised rendering ---------------- */
	var rendered = new Map(), heads = new Map();
	function render(force) {
		if (!LAY) return;
		var sc = $('mg-scroll'), top = sc.scrollTop - sc.clientHeight * 0.8, bot = sc.scrollTop + sc.clientHeight * 1.8, cv = $('mg-canvas');
		var vis = G.visible(LAY.tiles, top, bot), keep = new Set();
		cv.classList.toggle('mg-shownames', !!P.names);
		vis.forEach(function (ti) {
			var t = LAY.tiles[ti], it = t.it, n = rendered.get(it.id);
			keep.add(it.id);
			var isList = P.view === 'list';
			if (n && n.dataset.view !== (isList ? 'l' : 't')) { n.remove(); rendered.delete(it.id); n = null; }
			if (!n) { n = makeTile(it, isList); cv.appendChild(n); rendered.set(it.id, n); }
			else if (force) updateTile(n, it);
			var s = n.style;
			s.transform = 'translate(' + t.x + 'px,' + t.y + 'px)'; s.width = t.w + 'px'; s.height = t.h + 'px';
		});
		rendered.forEach(function (n, id) { if (!keep.has(id)) { n.remove(); rendered.delete(id); } });
		var hk = new Set();
		LAY.heads.forEach(function (h) {
			if (h.y > bot || h.y + h.h < top) return;
			var key = h.key + '|' + h.g; hk.add(key);
			var n = heads.get(key);
			if (!n) {
				n = el('div', 'mg-h'); n.dataset.g = h.g;
				n.innerHTML = '<span>' + esc(h.label) + '</span> <small>' + h.count.toLocaleString() + '</small><button type="button" data-play="' + h.g + '" title="Slideshow of this group">▶ Play</button>';
				cv.appendChild(n); heads.set(key, n);
			}
			n.style.transform = 'translateY(' + h.y + 'px)'; n.style.height = h.h + 'px'; n.style.top = '0';
		});
		heads.forEach(function (n, k) { if (!hk.has(k)) { n.remove(); heads.delete(k); } });
		// thumbnails: visible ones first
		var want = [];
		vis.forEach(function (ti) { var t = LAY.tiles[ti]; if (t.y < sc.scrollTop + sc.clientHeight + 200 && t.y + t.h > sc.scrollTop - 200) want.push(t.it); });
		vis.forEach(function (ti) { var it = LAY.tiles[ti].it; if (want.indexOf(it) < 0) want.push(it); });
		want.forEach(function (it) { if (!thumbURL.has(it.id) && !it.bad) needThumb(it); });
		pumpThumbs();
	}
	function tileInner(it, isList) {
		var r = rating(it), heart = '<button type="button" class="mg-hb' + (r.f ? ' mg-on' : '') + '" data-fav="1" aria-label="Favourite" aria-pressed="' + (!!r.f) + '" tabindex="-1">♥</button>';
		var th = thumbURL.get(it.id), img = th ? '<img alt="" src="' + th + '" class="mg-in" draggable="false">' : '<img alt="" draggable="false">';
		var ph = it.bad ? '<span class="mg-ph"><b>' + (it.kind === 'video' ? '🎞' : '🖼') + '</b>' + esc((it.ext || '').toUpperCase()) + '<br>' + (it.bad === 'video' ? 'can\'t play here' : 'can\'t show here') + '</span>' : '';
		if (isList) {
			return '<span class="mg-lt">' + img + ph.replace('<br>', ' ') + '</span><span class="mg-lname">' + esc(it.name) + '<small>' + esc(it.folder || rootName) + '</small></span>' +
				'<span class="mg-lc mg-lx">' + (it.kind === 'video' ? (it.dur ? G.fmtDur(it.dur) : 'video') : (it.w ? it.w + '×' + it.h : '')) + '</span>' +
				'<span class="mg-lc mg-ld">' + G.fmtDate(G.dateOf(it), true) + '</span><span class="mg-lc mg-ls">' + G.fmtBytes(it.size) + '</span>' + heart;
		}
		return img + ph + (it.kind === 'video' ? '<span class="mg-badge">' + (it.dur ? G.fmtDur(it.dur) : '') + '</span>' : '') + (r.r ? '<span class="mg-stars">' + '★'.repeat(r.r) + '</span>' : '') +
			'<span class="mg-nm">' + esc(it.name) + '</span>' + heart;
	}
	function makeTile(it, isList) {
		var n = el('div', 'mg-t' + (isList ? ' mg-li' : '') + (it.kind === 'video' ? ' mg-hasbadge' : ''));
		n.setAttribute('role', 'listitem'); n.tabIndex = 0; n.dataset.id = it.id; n.dataset.view = isList ? 'l' : 't';
		n.setAttribute('aria-label', it.name + (it.kind === 'video' ? ', video' : ''));
		n.innerHTML = tileInner(it, isList);
		var im = n.querySelector('img'); if (im && !im.classList.contains('mg-in')) im.onload = function () { im.classList.add('mg-in'); };
		return n;
	}
	function updateTile(n, it) { var isList = n.dataset.view === 'l'; n.innerHTML = tileInner(it, isList); }
	function byId(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i]; return null; }
	var cvs = $('mg-canvas');
	cvs.addEventListener('click', function (e) {
		var pl = e.target.closest('[data-play]');
		if (pl) { var g = LAY.groups[+pl.dataset.play]; if (g && g.items.length) { openViewer(g.items[0].vi, null); startSlide(); } return; }
		var t = e.target.closest('.mg-t'); if (!t) return;
		var it = byId(+t.dataset.id); if (!it) return;
		if (e.target.closest('[data-fav]')) { var on = !rating(it).f; setRating(it, { f: on ? 1 : 0 }); updateTile(t, it); if (P.kind === 'fav' || P.sort === 'rating') refresh(); return; }
		openViewer(it.vi, t);
	});
	cvs.addEventListener('keydown', function (e) {
		var t = e.target.closest('.mg-t'); if (!t) return;
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var it = byId(+t.dataset.id); if (it) openViewer(it.vi, t); }
	});
	var raf = 0;
	$('mg-scroll').addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(false); }); }, { passive: true });
	var lastW = 0;
	if (window.ResizeObserver) new ResizeObserver(function () { var w = scrollW(); if (Math.abs(w - lastW) > 2) { lastW = w; if (ALL.length) relayout(true); } else render(false); }).observe($('mg-scroll'));

	/* ---------------- thumbnails ---------------- */
	var thumbURL = new Map(), thumbOrder = [], tq = [], tqSet = new Set(), tActive = 0, vActive = 0, TPX = 512;
	function stopQueues() { tq = []; tqSet.clear(); }
	function needThumb(it) { if (tqSet.has(it.id)) { var i = tq.indexOf(it); if (i >= 0) { tq.splice(i, 1); tq.push(it); } return; } tqSet.add(it.id); tq.push(it); }
	function pumpThumbs() {
		while (tq.length && (tActive < 4)) {
			// most recently wanted first, but only if still on screen
			var it = null;
			for (var i = tq.length - 1; i >= 0; i--) { var c = tq[i]; if (!rendered.has(c.id)) { tq.splice(i, 1); tqSet.delete(c.id); continue; } if (c.kind === 'video' && vActive >= 2) continue; it = c; tq.splice(i, 1); break; }
			if (!it) break;
			tActive++; if (it.kind === 'video') vActive++;
			(function (it, gen) {
				getThumb(it).then(function (url) {
					if (gen !== scanGen) return;
					if (url) setThumb(it, url);
				}).catch(function () {}).then(function () { tActive--; if (it.kind === 'video') vActive--; tqSet.delete(it.id); pumpThumbs(); });
			})(it, scanGen);
		}
	}
	function setThumb(it, url) {
		thumbURL.set(it.id, url); thumbOrder.push(it.id);
		if (thumbOrder.length > 1200) {   // keep memory in check: drop thumbnails far off screen (they come back from IndexedDB)
			for (var k = 0; k < thumbOrder.length - 900; k++) { var id = thumbOrder[k]; if (!rendered.has(id) && thumbURL.has(id) && (!V.open || !stripHas(id))) { URL.revokeObjectURL(thumbURL.get(id)); thumbURL.delete(id); thumbOrder.splice(k, 1); k--; } }
		}
		var n = rendered.get(it.id);
		if (n) {
			var im = n.querySelector('img');
			if (im) { im.onload = function () { im.classList.add('mg-in'); }; im.src = url; }
			var b = n.querySelector('.mg-badge'); if (b && it.dur) b.textContent = G.fmtDur(it.dur);
		}
		if (V.open) stripThumb(it);
	}
	function getThumb(it) {
		var key = G.thumbKey(it, TPX);
		return iget('thumbs', key).then(function (rec) {
			if (rec && rec.b) { if (rec.w && !it.ar) { it.w = it.w || rec.w; it.h = it.h || rec.h; it.ar = rec.w / rec.h; relayoutSoon(); } if (rec.dur) it.dur = rec.dur; return URL.createObjectURL(rec.b); }
			if (it.ext === 'svg') { var u = URL.createObjectURL(it.file); return probeImg(u).then(function (d) { if (d && !it.ar) { it.ar = d.w / d.h; relayoutSoon(); } return u; }); }
			var make = it.kind === 'video' ? videoThumb(it) : imageThumb(it);
			return make.then(function (r) {
				if (!r) return null;
				var rec2 = { b: r.blob, w: r.w, h: r.h, dur: r.dur || 0 };
				iput('thumbs', key, rec2);
				var newAr = r.w && r.h ? r.w / r.h : 0;
				if (newAr && (!it.ar || Math.abs(newAr - it.ar) > 0.02)) { it.ar = newAr; it.w = it.w || r.w; it.h = it.h || r.h; relayoutSoon(); }
				if (r.dur) { it.dur = r.dur; iput('meta', metaKey(it), { w: r.w, h: r.h, dur: r.dur }); }
				return URL.createObjectURL(r.blob);
			}, function () { return null; });
		});
	}
	function probeImg(url) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res({ w: i.naturalWidth || 300, h: i.naturalHeight || 300, img: i }); }; i.onerror = function () { res(null); }; i.src = url; }); }
	function canvasOf(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
	function toBlob(c, type, q) {
		if (c.convertToBlob) return c.convertToBlob({ type: type, quality: q });
		return new Promise(function (res) { c.toBlob(res, type, q); });
	}
	function drawThumb(src, sw, sh) {
		var k = Math.min(1, TPX / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k)), c = canvasOf(w, h), x = c.getContext('2d');
		x.imageSmoothingQuality = 'high';
		// two steps for a big shrink: sharper and faster than one huge downscale
		if (k < 0.25 && typeof createImageBitmap === 'function' && src.close) { /* bitmap: draw directly; Chrome downsamples well with 'high' */ }
		x.drawImage(src, 0, 0, w, h);
		return toBlob(c, 'image/webp', 0.8).then(function (b) {
			if (b && b.type === 'image/webp') return { blob: b, w: sw, h: sh };
			return toBlob(c, 'image/jpeg', 0.82).then(function (b2) { return { blob: b2, w: sw, h: sh }; });
		});
	}
	function imageThumb(it) {
		if (typeof createImageBitmap === 'function') {
			return createImageBitmap(it.file, { imageOrientation: 'from-image' }).then(function (bm) {
				return drawThumb(bm, bm.width, bm.height).then(function (r) { bm.close && bm.close(); return r; });
			}, function () { return imgElThumb(it); });
		}
		return imgElThumb(it);
	}
	function imgElThumb(it) {
		var u = URL.createObjectURL(it.file);
		return probeImg(u).then(function (d) {
			if (!d) { URL.revokeObjectURL(u); markBad(it, 'image'); return null; }
			return drawThumb(d.img, d.w, d.h).then(function (r) { URL.revokeObjectURL(u); return r; });
		});
	}
	function markBad(it, what) { it.bad = what; iput('meta', metaKey(it), { w: it.w, h: it.h, taken: it.taken, bad: what }); var n = rendered.get(it.id); if (n) updateTile(n, it); }
	function videoThumb(it) {
		return new Promise(function (res) {
			var v = document.createElement('video'), u = URL.createObjectURL(it.file), done = false, to = setTimeout(function () { fin(null, true); }, 12000);
			function fin(r, bad) { if (done) return; done = true; clearTimeout(to); try { v.removeAttribute('src'); v.load(); } catch (e) {} URL.revokeObjectURL(u); if (bad) markBad(it, 'video'); res(r); }
			v.muted = true; v.playsInline = true; v.preload = 'auto';
			v.onloadedmetadata = function () { it.dur = v.duration; v.currentTime = G.posterTime(v.duration); };
			v.onseeked = function () {
				if (!v.videoWidth) return fin(null, true);
				drawThumb(v, v.videoWidth, v.videoHeight).then(function (r) { r.dur = v.duration; fin(r); }, function () { fin(null, true); });
			};
			v.onerror = function () { fin(null, true); };
			v.src = u;
		});
	}

	/* ---------------- toolbar ---------------- */
	function seg(id, attr, val) { $(id).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))); }); }
	function dirLabel() {
		var up = P.dir === 1, t = { date: up ? '↑ Oldest first' : '↓ Newest first', name: up ? '↑ A to Z' : '↓ Z to A', size: up ? '↑ Smallest first' : '↓ Largest first', rating: up ? '↑ Lowest first' : '↓ Best first',
			dims: up ? '↑ Smallest first' : '↓ Largest first', duration: up ? '↑ Shortest first' : '↓ Longest first' }[P.sort];
		$('mg-dir').textContent = t || (up ? '↑ Ascending' : '↓ Descending');
		$('mg-dir').hidden = P.sort === 'random';
	}
	function syncBar() {
		seg('mg-view', 'view', P.view); seg('mg-kind', 'kind', P.kind);
		$('mg-group').value = P.group; $('mg-sort').value = P.sort; $('mg-size').value = P.size; $('mg-names').checked = !!P.names;
		$('mg-sizelab').style.visibility = P.view === 'list' ? 'hidden' : '';
		dirLabel();
	}
	syncBar();
	$('mg-view').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; P.view = b.dataset.view; save(); syncBar(); rendered.forEach(function (n) { n.remove(); }); rendered.clear(); relayout(true); });
	$('mg-kind').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; P.kind = b.dataset.kind; save(); syncBar(); refresh(); $('mg-scroll').scrollTop = 0; });
	$('mg-group').addEventListener('change', function () { P.group = this.value; save(); refresh(); });
	$('mg-sort').addEventListener('change', function () { P.sort = this.value; P.dir = { name: 1, folder: 1, type: 1 }[P.sort] ? 1 : -1; save(); syncBar(); refresh(); $('mg-scroll').scrollTop = 0; });
	$('mg-dir').onclick = function () { P.dir = -P.dir; save(); dirLabel(); refresh(); };
	var sizeT = 0;
	$('mg-size').addEventListener('input', function () { P.size = +this.value; clearTimeout(sizeT); sizeT = setTimeout(save, 400); relayout(true); });
	$('mg-names').addEventListener('change', function () { P.names = this.checked; save(); render(false); });
	var qT = 0;
	$('mg-q').addEventListener('input', function () { clearTimeout(qT); qT = setTimeout(function () { refresh(); $('mg-scroll').scrollTop = 0; }, 120); });
	$('mg-play').onclick = function () { if (!VIEW.length) return; openViewer(0, null); startSlide(); };

	/* fill window / full screen for the grid */
	function applyFill() {
		var app = $('mg-app'), on = !!P.fill && !app.hidden;
		app.classList.toggle('mg-fill', on);
		document.documentElement.classList.toggle('mg-lock', on || V.open);
		document.body.classList.toggle('mg-filling', on);
		$('mg-fill').innerHTML = on ? '✕ <span>Close full window</span>' : '⤢ <span>Fill window</span>';
		$('mg-fill').setAttribute('aria-pressed', String(on));
	}
	$('mg-fill').onclick = function () { P.fill = !P.fill; save(); applyFill(); setTimeout(function () { relayout(true); }, 30); };
	$('mg-fs').onclick = function () {
		var app = $('mg-app');
		if (document.fullscreenElement) document.exitFullscreen(); else if (app.requestFullscreen) app.requestFullscreen().catch(function () { toast('Full screen is not allowed here.'); });
	};
	document.addEventListener('fullscreenchange', function () { setTimeout(function () { relayout(true); if (V.open) fitNow(false); }, 60); });
	document.addEventListener('keydown', function (e) {
		if (V.open || e.defaultPrevented) return;
		if ($('mg-app').hidden) return;
		var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') { if (e.key === 'Escape' && e.target.id === 'mg-q' && e.target.value) { e.target.value = ''; refresh(); } return; }
		if (e.key === 'Escape' && P.fill) { P.fill = false; save(); applyFill(); setTimeout(function () { relayout(true); }, 30); }
		else if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey) { $('mg-fill').click(); }
		else if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) $('mg-play').click();
		else if (e.key === '/' ) { e.preventDefault(); $('mg-q').focus(); }
	});

	/* ================= the viewer ================= */
	var V = { open: false, i: -1, it: null, media: null, natW: 0, natH: 0, s: 1, x: 0, y: 0, rot: 0, fitS: 1, url: null, ab: {}, slide: false, rotMap: {} };
	var vw = null;
	function buildViewer() {
		if (vw) return vw;
		vw = el('div', 'mgv'); vw.id = 'mgv'; vw.setAttribute('role', 'dialog'); vw.setAttribute('aria-modal', 'true'); vw.setAttribute('aria-label', 'Photo viewer'); vw.tabIndex = -1;
		vw.innerHTML =
			'<div class="mgv-stage" id="mgv-stage"></div><div class="mgv-spin" id="mgv-spin"></div><div class="mgv-sbar" id="mgv-sbar"></div><div class="mgv-osd" id="mgv-osd"></div>' +
			'<div class="mgv-top">' +
			'<button type="button" class="mgv-b mgv-x" data-a="close" title="Close (Esc)" aria-label="Close">✕</button>' +
			'<div class="mgv-tt"><b id="mgv-name"></b><small id="mgv-sub"></small></div>' +
			'<button type="button" class="mgv-b mgv-heart mgv-hidesm" data-a="fav" title="Favourite (H)" aria-label="Favourite" aria-pressed="false">♥</button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="rotl" title="Rotate left (Shift+R)" aria-label="Rotate left">⟲</button>' +
			'<button type="button" class="mgv-b" data-a="rotr" title="Rotate right (R)" aria-label="Rotate right">⟳</button>' +
			'<button type="button" class="mgv-b mgv-zoom" data-a="sizemenu" title="Size: fit, fill, 100%, custom" aria-haspopup="true" id="mgv-zoom">Fit</button>' +
			'<button type="button" class="mgv-b" data-a="slide" title="Slideshow (P)" aria-pressed="false" id="mgv-slide">▶<span class="mgv-hidesm"> Slideshow</span></button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="strip" title="Strip of thumbnails (T)" aria-pressed="false" id="mgv-stripb">▭</button>' +
			'<button type="button" class="mgv-b" data-a="info" title="Details (I)" aria-pressed="false" id="mgv-infob">ⓘ</button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="fs" title="Full screen (F)" aria-label="Full screen">⛶</button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="help" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>' +
			'</div>' +
			'<div class="mgv-pop" id="mgv-sizepop" hidden role="menu">' +
			'<button type="button" role="menuitemradio" data-fit="fit">Fit to window <small>0</small></button>' +
			'<button type="button" role="menuitemradio" data-fit="fill">Fill the window <small>crop</small></button>' +
			'<button type="button" role="menuitemradio" data-fit="actual">100% (actual pixels) <small>1</small></button>' +
			'<button type="button" role="menuitemradio" data-fit="custom">Custom size</button>' +
			'<label>Size <input type="number" id="mgv-pct" min="5" max="1600" step="5" value="100"> %</label>' +
			'<hr><label><input type="checkbox" id="mgv-noup"> Don\'t enlarge small pictures</label>' +
			'<hr><label>Slideshow every <input type="range" id="mgv-slsp" min="0" max="10" step="1"> <b id="mgv-slv"></b></label>' +
			'<label><input type="checkbox" id="mgv-vidfull"> Slideshow plays videos to the end</label>' +
			'</div>' +
			'<button type="button" class="mgv-nav mgv-prev" data-a="prev" aria-label="Previous">‹</button><button type="button" class="mgv-nav mgv-next" data-a="next" aria-label="Next">›</button>' +
			'<div class="mgv-vbar" id="mgv-vbar" hidden>' +
			'<div class="mgv-seek" id="mgv-seek"><span class="mgv-track"></span><span class="mgv-buf" id="mgv-buf"></span><span class="mgv-ab" id="mgv-ab" hidden></span><span class="mgv-done" id="mgv-done"></span><span class="mgv-knob" id="mgv-knob"></span><span class="mgv-hov" id="mgv-hov" hidden></span></div>' +
			'<div class="mgv-vrow">' +
			'<button type="button" class="mgv-b" data-a="play" id="mgv-pp" title="Play / pause (Space, K)">▶</button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="fback" title="One frame back (,)">⏮︎</button><button type="button" class="mgv-b mgv-hidesm" data-a="ffwd" title="One frame forward (.)">⏭︎</button>' +
			'<span class="mgv-time" id="mgv-time">0:00 / 0:00</span>' +
			'<span class="mgv-sp"><button type="button" class="mgv-b" data-a="slower" title="Slower (S)">−</button><button type="button" class="mgv-b mgv-spv" data-a="speedmenu" id="mgv-spv" title="Speed: click for presets, R resets">1×</button><button type="button" class="mgv-b" data-a="faster" title="Faster (D)">+</button></span>' +
			'<span class="mgv-grow"></span>' +
			'<button type="button" class="mgv-b" data-a="seta" title="Loop start here (A)">A</button><button type="button" class="mgv-b" data-a="setb" title="Loop end here (B)">B</button><button type="button" class="mgv-b mgv-hidesm" data-a="clearab" title="Clear the A-B loop (C)" id="mgv-clab">✕AB</button>' +
			'<button type="button" class="mgv-b" data-a="loop" title="Repeat the whole video" aria-pressed="false" id="mgv-loop">🔁</button>' +
			'<span class="mgv-vol"><button type="button" class="mgv-b" data-a="mute" id="mgv-mute" title="Mute (M)">🔊</button><input type="range" id="mgv-vol" min="0" max="1" step="0.02" aria-label="Volume"></span>' +
			'</div></div>' +
			'<div class="mgv-pop" id="mgv-speedpop" hidden role="menu" style="top:auto;bottom:calc(var(--mv-stripH,0px) + 110px);right:auto;left:50%;transform:translateX(-50%);min-width:10em"></div>' +
			'<div class="mgv-strip" id="mgv-strip" hidden></div>' +
			'<aside class="mgv-info" id="mgv-info" aria-label="Details"></aside>' +
			'<div class="mgv-help" id="mgv-help" hidden><h3 style="margin-top:0">Keyboard shortcuts</h3><dl>' +
			'<dt>← → Home End</dt><dd>Previous, next, first, last</dd><dt>+ − 0 1</dt><dd>Zoom in, out, fit, 100%</dd><dt>Wheel, pinch, double-click</dt><dd>Zoom where you point; drag to look around</dd>' +
			'<dt>R / Shift+R</dt><dd>Rotate a photo (videos: R = normal speed)</dd><dt>P (Space for photos)</dt><dd>Slideshow</dd><dt>F, I, T, H</dt><dd>Full screen, details, thumbnail strip, favourite</dd><dt>1-5 with Alt</dt><dd>Star rating (Alt+0 clears)</dd>' +
			'<dt>Space / K</dt><dd>Play / pause a video</dd><dt>S / D</dt><dd>Slower / faster (0.25× to 4×)</dd><dt>R / G</dt><dd>Normal speed / back to your last speed</dd><dt>Z X / J L</dt><dd>Back / forward 5 s / 10 s</dd>' +
			'<dt>, .</dt><dd>One frame back / forward</dd><dt>A B C</dt><dd>A-B loop start, end, clear</dd><dt>M ↑ ↓</dt><dd>Mute, volume</dd><dt>Esc</dt><dd>Close</dd></dl><button type="button" class="mgv-b" data-a="help">Close</button></div>';
		document.body.appendChild(vw);
		wireViewer();
		return vw;
	}
	function vq(id) { return document.getElementById(id); }
	var idleT = 0;
	function poke() { if (!vw) return; vw.classList.remove('mgv-idle'); clearTimeout(idleT); idleT = setTimeout(function () { if (V.open && !anyPopOpen() && !vw.classList.contains('mgv-info-open') && !(V.media && V.media.tagName === 'VIDEO' && V.media.paused)) vw.classList.add('mgv-idle'); }, V.slide ? 1600 : 3000); }
	function anyPopOpen() { return !vq('mgv-sizepop').hidden || !vq('mgv-speedpop').hidden || !vq('mgv-help').hidden; }
	function osd(text) { var o = vq('mgv-osd'); o.textContent = text; o.classList.add('mgv-on'); clearTimeout(o._t); o._t = setTimeout(function () { o.classList.remove('mgv-on'); }, 900); }

	function openViewer(i, fromTile) {
		if (i == null || i < 0 || !VIEW.length) return;
		buildViewer();
		var wasOpen = V.open;
		V.open = true; vw.classList.add('mgv-open');
		document.body.classList.add('mg-viewing'); document.documentElement.classList.add('mg-lock');
		vw.classList.toggle('mgv-info-open', !!P.info);
		vq('mgv-infob').setAttribute('aria-pressed', String(!!P.info));
		vq('mgv-stripb').setAttribute('aria-pressed', String(!!P.strip));
		if (!wasOpen) { V.returnFocus = document.activeElement; history.pushState && history.pushState({ mgv: 1 }, ''); }
		show(i, 0, fromTile);
		vw.focus({ preventScroll: true });
		poke();
	}
	function closeViewer(silent) {
		if (!V.open) return;
		stopSlide(); unload();
		V.open = false; vw.classList.remove('mgv-open', 'mgv-idle');
		document.body.classList.remove('mg-viewing'); document.documentElement.classList.toggle('mg-lock', !!P.fill && !$('mg-app').hidden);
		if (document.fullscreenElement === vw) document.exitFullscreen().catch(function () {});
		['mgv-sizepop', 'mgv-speedpop', 'mgv-help'].forEach(function (id) { vq(id).hidden = true; });
		if (!silent) {
			if (history.state && history.state.mgv) history.back();
			// bring the tile into view
			if (V.it && LAY && LAY.byId[V.it.id] != null) { var t = LAY.tiles[LAY.byId[V.it.id]], sc = $('mg-scroll'); if (t.y < sc.scrollTop || t.y + t.h > sc.scrollTop + sc.clientHeight) sc.scrollTop = t.y - sc.clientHeight / 3; render(false); var n = rendered.get(V.it.id); if (n) n.focus({ preventScroll: true }); }
		}
	}
	window.addEventListener('popstate', function () { if (V.open) closeViewer(true); });
	function unload() {
		if (V.media) { if (V.media.tagName === 'VIDEO') { try { V.media.pause(); V.media.removeAttribute('src'); V.media.load(); } catch (e) {} } V.media.remove(); V.media = null; }
		if (V.url) { URL.revokeObjectURL(V.url); V.url = null; }
	}
	var loadGen = 0;
	function show(i, dir, fromTile) {
		if (!VIEW.length) return closeViewer();
		i = Math.max(0, Math.min(VIEW.length - 1, i));
		var it = VIEW[i], gen = ++loadGen, prev = V.media, prevUrl = V.url;
		V.i = i; V.it = it; V.rot = V.rotMap[it.id] || 0; V.ab = {}; V.media = null; V.url = null;
		vq('mgv-name').textContent = it.name;
		vq('mgv-sub').textContent = (i + 1).toLocaleString() + ' of ' + VIEW.length.toLocaleString() + ' · ' + [G.fmtDate(G.dateOf(it), true), it.folder].filter(Boolean).join(' · ');
		vw.querySelector('[data-a=prev]').disabled = i === 0 && !V.slide; vw.querySelector('[data-a=next]').disabled = i === VIEW.length - 1 && !V.slide;
		syncFav();
		vq('mgv-vbar').hidden = it.kind !== 'video';
		var stage = vq('mgv-stage'), oldMsg = stage.querySelector('.mgv-msg'); if (oldMsg) oldMsg.remove();
		// old picture slides / fades away
		if (prev) {
			if (prev.tagName === 'VIDEO') try { prev.pause(); } catch (e) {}
			prev.classList.remove('mgv-anim'); prev.classList.add('mgv-fade'); prev.style.opacity = '0';
			if (dir) prev.style.transform = prev.style.transform + ' translateX(' + (-dir * 60) + 'px)';
			setTimeout(function () { prev.remove(); if (prev.tagName === 'VIDEO') { try { prev.removeAttribute('src'); prev.load(); } catch (e) {} } if (prevUrl) URL.revokeObjectURL(prevUrl); }, 320);
		}
		vq('mgv-spin').classList.remove('mgv-on');
		var spinT = setTimeout(function () { if (gen === loadGen) vq('mgv-spin').classList.add('mgv-on'); }, 250);
		var url = URL.createObjectURL(it.file); V.url = url;
		var m;
		if (it.kind === 'video') {
			m = document.createElement('video'); m.className = 'mgv-media'; m.playsInline = true; m.preload = 'auto'; m.loop = !!P.loopAll;
			m.volume = P.vol; m.muted = !!P.muted; m.src = url;
			m.addEventListener('loadedmetadata', function () {
				if (gen !== loadGen) return; clearTimeout(spinT); vq('mgv-spin').classList.remove('mgv-on');
				V.natW = m.videoWidth || 1280; V.natH = m.videoHeight || 720; it.dur = m.duration;
				placeNew(m, dir, fromTile); m.playbackRate = V.rate || 1; m.play().catch(function () {}); syncVideo();
			});
			m.addEventListener('error', function () { if (gen !== loadGen) return; clearTimeout(spinT); vq('mgv-spin').classList.remove('mgv-on'); cantShow(it); });
			wireVideo(m);
		} else {
			m = new Image(); m.className = 'mgv-media'; m.decoding = 'async'; m.alt = it.name; m.draggable = false;
			// the thumbnail first (instant), the full picture replaces it when decoded
			var th = thumbURL.get(it.id), full = new Image();
			full.decoding = 'async';
			var ready = function () {
				if (gen !== loadGen) return; clearTimeout(spinT); vq('mgv-spin').classList.remove('mgv-on');
				V.natW = full.naturalWidth || 800; V.natH = full.naturalHeight || 600;
				if (m.parentNode && th) { m.src = url; sizeEl(m); fitNow(false, true); }
				else { m.src = url; placeNew(m, dir, fromTile); }
				if (!it.w) { it.w = V.natW; it.h = V.natH; }
				fillInfo(); preloadNext();
			};
			full.onload = function () { (full.decode ? full.decode() : Promise.resolve()).then(ready, ready); };
			full.onerror = function () { if (gen !== loadGen) return; clearTimeout(spinT); vq('mgv-spin').classList.remove('mgv-on'); if (m.parentNode) m.remove(); cantShow(it); };
			full.src = url;
			if (th && it.w && it.h) { m.src = th; V.natW = it.w; V.natH = it.h; placeNew(m, dir, fromTile); }
		}
		V.media = m;
		syncStrip(); fillInfo();
		if (V.slide) slideTick();
	}
	function cantShow(it) {
		var msg = el('div', 'mgv-msg');
		var heic = /^(heic|heif)$/.test(it.ext), conv = it.kind === 'video';
		msg.innerHTML = '<b>' + (it.kind === 'video' ? 'This browser can\'t play this video' : 'This browser can\'t show this picture') + '</b>' + esc(it.name) + ' · ' + G.fmtBytes(it.size) + '<br>' +
			(heic ? 'HEIC photos open in Safari. Other browsers need them converted to JPEG first.' : conv ? 'Convert it to MP4 with the <a href="/convert-video" target="_blank" rel="noopener">MES Video Converter</a>, then open it here.' : 'The file may be damaged or in a format browsers don\'t read.');
		vq('mgv-stage').appendChild(msg);
		if (V.slide) slideTick();
	}
	function sizeEl(m) { m.style.setProperty('width', V.natW + 'px', 'important'); m.style.setProperty('height', V.natH + 'px', 'important'); }
	function placeNew(m, dir, fromTile) {
		sizeEl(m); m.style.opacity = '0';
		vq('mgv-stage').appendChild(m);
		fitNow(false);
		var target = m.style.transform;
		if (fromTile && fromTile.getBoundingClientRect) {
			// zoom out of the tile it was clicked on
			var r = fromTile.getBoundingClientRect(), sr = vw.getBoundingClientRect(), cx = r.left + r.width / 2 - (sr.left + sr.width / 2), cy = r.top + r.height / 2 - (sr.top + sr.height / 2);
			var k = Math.max(r.width / (V.natW || 1), r.height / (V.natH || 1));
			m.style.transform = 'translate(-50%,-50%) translate(' + cx + 'px,' + cy + 'px) rotate(' + V.rot + 'deg) scale(' + k + ')'; m.style.opacity = '0.6';
		} else if (dir) { m.style.transform = target + ' translateX(' + (dir * 60) + 'px)'; }
		void m.offsetWidth;
		m.classList.add(fromTile ? 'mgv-anim' : 'mgv-fade');
		m.style.transform = target; m.style.opacity = '1';
		setTimeout(function () { m.classList.remove('mgv-anim', 'mgv-fade'); }, 340);
	}
	function stageSize() { var s = vq('mgv-stage'); var w = s.clientWidth, h = s.clientHeight; if (vw.classList.contains('mgv-info-open') && w > 700) w -= Math.min(352, w * 0.86); var bottom = 0; if (!vq('mgv-strip').hidden) bottom += 74; if (V.it && V.it.kind === 'video') bottom += 92; return { w: Math.max(80, w), h: Math.max(80, h - bottom - 56), off: -(bottom - 56) / 2 }; }
	function fitNow(anim, keepZoom) {
		if (!V.media || !V.natW) return;
		var ss = stageSize(), dpr = window.devicePixelRatio || 1;
		V.fitS = G.fitScale('fit', V.natW, V.natH, ss.w, ss.h, V.rot, { noUpscale: P.noUp });
		if (keepZoom && V.userZoom) { apply(anim); return; }
		V.s = G.fitScale(P.fit, V.natW, V.natH, ss.w, ss.h, V.rot, { dpr: dpr, pct: P.pct, noUpscale: P.noUp });
		V.x = 0; V.y = 0; V.userZoom = false;
		apply(anim);
	}
	function apply(anim) {
		var m = V.media; if (!m) return;
		var ss = stageSize(), c = G.clampPan(V.x, V.y, V.s, V.natW, V.natH, ss.w, ss.h, V.rot);
		V.x = c.x; V.y = c.y;
		var shiftX = vw.classList.contains('mgv-info-open') && vq('mgv-stage').clientWidth > 700 ? -Math.min(352, vq('mgv-stage').clientWidth * 0.86) / 2 : 0;
		if (anim) { m.classList.add('mgv-anim'); clearTimeout(m._at); m._at = setTimeout(function () { m.classList.remove('mgv-anim'); }, 300); }
		m.style.transform = 'translate(-50%,-50%) translate(' + (V.x + shiftX) + 'px,' + (V.y + ss.off) + 'px) rotate(' + V.rot + 'deg) scale(' + V.s + ')';
		m.classList.toggle('mgv-pix', V.s * (window.devicePixelRatio || 1) > 3);
		vq('mgv-stage').classList.toggle('mgv-fitted', V.s <= V.fitS * 1.01);
		var pct = Math.round(V.s * (window.devicePixelRatio || 1) * 100);
		vq('mgv-zoom').innerHTML = (!V.userZoom && P.fit === 'fit' ? '<span class="mgv-hidesm">Fit · </span>' : !V.userZoom && P.fit === 'fill' ? '<span class="mgv-hidesm">Fill · </span>' : '') + pct + '%';
	}
	function zoomBy(f, px, py, anim) {
		var r = vq('mgv-stage').getBoundingClientRect(), ss = stageSize();
		var cx = px == null ? 0 : px - (r.left + r.width / 2), cy = py == null ? 0 : py - (r.top + r.height / 2) - ss.off;
		var z = G.zoomAbout(V.x, V.y, V.s, f, cx, cy, V.fitS * 0.25, 40);
		V.s = z.s; V.x = z.x; V.y = z.y; V.userZoom = true; apply(anim);
	}
	function go(d) {
		if (!VIEW.length) return;
		var j = G.nextIndex(V.i, VIEW.length, d, V.slide);
		if (j === V.i) { osd(d > 0 ? 'Last one' : 'First one'); return; }
		show(j, d);
	}
	function preloadNext() { var n = VIEW[V.i + 1]; if (n && n.kind === 'image' && !thumbURL.has(n.id) && !n.bad) needThumb(n), pumpThumbs(); }

	/* ---------- viewer input ---------- */
	function wireViewer() {
		vw.addEventListener('click', function (e) {
			var b = e.target.closest('[data-a]'); if (!b) return;
			act(b.dataset.a, b); poke();
		});
		vw.addEventListener('mousemove', poke, { passive: true });
		vq('mgv-sizepop').addEventListener('click', function (e) {
			var b = e.target.closest('[data-fit]'); if (!b) return;
			P.fit = b.dataset.fit; save(); syncSizePop(); fitNow(true);
		});
		vq('mgv-pct').addEventListener('input', function () { var v = +this.value; if (v >= 5 && v <= 1600) { P.pct = v; P.fit = 'custom'; save(); syncSizePop(); fitNow(true); } });
		vq('mgv-noup').addEventListener('change', function () { P.noUp = this.checked; save(); fitNow(true); });
		vq('mgv-slsp').addEventListener('input', function () { P.slide = G.SLIDE[+this.value] || 4; save(); vq('mgv-slv').textContent = P.slide + ' s'; if (V.slide) slideTick(); });
		vq('mgv-vidfull').addEventListener('change', function () { P.vidFull = this.checked; save(); });
		vq('mgv-vol').addEventListener('input', function () { P.vol = +this.value; P.muted = P.vol === 0; save(); if (V.media && V.media.tagName === 'VIDEO') { V.media.volume = P.vol; V.media.muted = P.muted; } syncVideo(); });
		vq('mgv-speedpop').addEventListener('click', function (e) { var b = e.target.closest('[data-rate]'); if (!b) return; setRate(+b.dataset.rate); vq('mgv-speedpop').hidden = true; });
		vq('mgv-strip').addEventListener('click', function (e) { var b = e.target.closest('[data-vi]'); if (b) { var j = +b.dataset.vi; show(j, j > V.i ? 1 : -1); } });
		vq('mgv-info').addEventListener('click', function (e) {
			var s = e.target.closest('[data-star]'); if (s && V.it) { var n = +s.dataset.star, cur = rating(V.it).r || 0; setRating(V.it, { r: n === cur ? 0 : n }); fillInfo(); refreshTileOf(V.it); return; }
			if (e.target.closest('[data-heart]')) act('fav');
		});
		wireSeek(); wirePointer();
		document.addEventListener('keydown', onKey, true);
		window.addEventListener('resize', function () { if (V.open) fitNow(false, true); });
	}
	function refreshTileOf(it) { var n = rendered.get(it.id); if (n) updateTile(n, it); }
	function syncFav() { var b = vw.querySelector('[data-a=fav]'), f = !!rating(V.it).f; b.setAttribute('aria-pressed', String(f)); b.title = f ? 'Remove from favourites (H)' : 'Add to favourites (H)'; }
	function syncSizePop() {
		vq('mgv-sizepop').querySelectorAll('[data-fit]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.fit === P.fit)); });
		vq('mgv-pct').value = P.pct; vq('mgv-noup').checked = !!P.noUp;
		var si = G.SLIDE.indexOf(P.slide); vq('mgv-slsp').value = si < 0 ? 4 : si; vq('mgv-slv').textContent = P.slide + ' s'; vq('mgv-vidfull').checked = !!P.vidFull;
	}
	function act(a, b) {
		var m = V.media, isV = m && m.tagName === 'VIDEO';
		if (a === 'close') closeViewer();
		else if (a === 'prev') go(-1);
		else if (a === 'next') go(1);
		else if (a === 'fav') { var on = !rating(V.it).f; setRating(V.it, { f: on ? 1 : 0 }); syncFav(); fillInfo(); refreshTileOf(V.it); osd(on ? '♥ Favourite' : 'Not a favourite'); }
		else if (a === 'rotr' || a === 'rotl') { V.rot = ((V.rot + (a === 'rotr' ? 90 : -90)) % 360 + 360) % 360; V.rotMap[V.it.id] = V.rot; fitNow(true); }
		else if (a === 'sizemenu') { var p = vq('mgv-sizepop'); syncSizePop(); p.hidden = !p.hidden; vq('mgv-speedpop').hidden = true; }
		else if (a === 'slide') { if (V.slide) stopSlide(); else startSlide(); }
		else if (a === 'strip') { P.strip = !P.strip; save(); vq('mgv-stripb').setAttribute('aria-pressed', String(P.strip)); syncStrip(); fitNow(true, true); }
		else if (a === 'info') { P.info = !P.info; save(); vw.classList.toggle('mgv-info-open', P.info); vq('mgv-infob').setAttribute('aria-pressed', String(P.info)); fillInfo(); fitNow(true, true); }
		else if (a === 'fs') { if (document.fullscreenElement) document.exitFullscreen(); else if (vw.requestFullscreen) vw.requestFullscreen().catch(function () { osd('Full screen is not allowed here'); }); }
		else if (a === 'help') { vq('mgv-help').hidden = !vq('mgv-help').hidden; }
		else if (a === 'edit') editInPhoto();
		else if (a === 'opentab') { var u = URL.createObjectURL(V.it.file); window.open(u, '_blank', 'noopener'); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
		else if (a === 'copyname') { (navigator.clipboard ? navigator.clipboard.writeText(V.it.path) : Promise.reject()).then(function () { osd('Name copied'); }, function () { osd('Could not copy'); }); }
		else if (!isV) return;
		else if (a === 'play') { if (m.paused) m.play().catch(function () {}); else m.pause(); }
		else if (a === 'slower') setRate(G.speedStep(m.playbackRate, -1));
		else if (a === 'faster') setRate(G.speedStep(m.playbackRate, 1));
		else if (a === 'speedmenu') {
			var sp = vq('mgv-speedpop'); sp.innerHTML = G.SPEEDS.slice().reverse().map(function (r) { return '<button type="button" role="menuitemradio" data-rate="' + r + '" aria-checked="' + (Math.abs(m.playbackRate - r) < 0.001) + '">' + G.fmtSpeed(r) + (r === 1 ? ' <small>normal</small>' : '') + '</button>'; }).join('');
			sp.hidden = !sp.hidden; vq('mgv-sizepop').hidden = true;
		}
		else if (a === 'fback' || a === 'ffwd') frameStep(a === 'ffwd' ? 1 : -1);
		else if (a === 'seta' || a === 'setb') { V.ab = G.setAB(V.ab, a === 'seta' ? 'a' : 'b', m.currentTime, m.duration); syncVideo(); osd('Loop ' + (V.ab.a != null ? G.fmtTime(V.ab.a, true) : '…') + ' → ' + (V.ab.b != null ? G.fmtTime(V.ab.b, true) : '…')); }
		else if (a === 'clearab') { V.ab = {}; syncVideo(); osd('Loop cleared'); }
		else if (a === 'loop') { P.loopAll = !P.loopAll; save(); m.loop = P.loopAll; syncVideo(); osd(P.loopAll ? 'Repeat on' : 'Repeat off'); }
		else if (a === 'mute') { P.muted = !m.muted; if (!P.muted && P.vol === 0) P.vol = 0.6; m.muted = P.muted; m.volume = P.vol; save(); syncVideo(); }
	}
	function setRate(r) {
		var m = V.media; if (!m || m.tagName !== 'VIDEO') return;
		r = Math.min(4, Math.max(0.25, r)); m.playbackRate = r; V.rate = r; if (Math.abs(r - 1) > 0.001) { P.lastRate = r; save(); }
		try { m.preservesPitch = true; } catch (e) {}
		syncVideo(); osd(G.fmtSpeed(r));
	}
	function frameStep(d) {
		var m = V.media; m.pause();
		var fps = V.fps || 30;
		m.currentTime = Math.max(0, Math.min(m.duration || 0, m.currentTime + d / fps));
		osd((d > 0 ? '+1 frame ' : '−1 frame ') + G.fmtTime(m.currentTime, true));
	}
	function wireVideo(m) {
		m.addEventListener('timeupdate', function () { if (m !== V.media) return; var j = G.abCheck(m.currentTime, V.ab.a, V.ab.b); if (j != null && !m.paused) m.currentTime = j; syncVideo(); });
		m.addEventListener('play', function () { syncVideo(); poke(); }); m.addEventListener('pause', function () { syncVideo(); poke(); });
		m.addEventListener('progress', syncVideo); m.addEventListener('ratechange', syncVideo); m.addEventListener('volumechange', syncVideo);
		m.addEventListener('ended', function () { if (m === V.media && V.slide) go(1); });
		// frame rate guess from two presented frames, for frame stepping
		if (m.requestVideoFrameCallback) {
			var last = null, n = 0;
			var cb = function (now, md) { if (m !== V.media) return; if (last != null && md.mediaTime > last) { var f = 1 / (md.mediaTime - last); if (f > 5 && f < 241) V.fps = V.fps ? V.fps * 0.8 + f * 0.2 : f; } last = md.mediaTime; if (++n < 40) m.requestVideoFrameCallback(cb); };
			m.requestVideoFrameCallback(cb);
		}
		V.fps = 0;
	}
	var abLoopRaf = 0;
	function syncVideo() {
		var m = V.media; if (!m || m.tagName !== 'VIDEO' || !vw) return;
		var d = m.duration || 0, t = m.currentTime || 0, f = d ? t / d : 0;
		vq('mgv-pp').textContent = m.paused ? '▶' : '❚❚';
		vq('mgv-time').textContent = G.fmtTime(t) + ' / ' + G.fmtTime(d);
		vq('mgv-done').style.width = (f * 100) + '%'; vq('mgv-knob').style.left = (f * 100) + '%';
		try { var b = m.buffered; if (b.length) vq('mgv-buf').style.width = (b.end(b.length - 1) / (d || 1) * 100) + '%'; } catch (e) {}
		vq('mgv-spv').textContent = G.fmtSpeed(m.playbackRate);
		vq('mgv-vol').value = m.muted ? 0 : m.volume;
		vq('mgv-mute').textContent = m.muted || m.volume === 0 ? '🔇' : m.volume < 0.5 ? '🔉' : '🔊';
		vq('mgv-loop').setAttribute('aria-pressed', String(!!m.loop));
		var ab = vq('mgv-ab'), has = V.ab.a != null && d;
		ab.hidden = !has; vq('mgv-clab').hidden = !has;
		if (has) { var b2 = V.ab.b != null ? V.ab.b : d; ab.style.left = (V.ab.a / d * 100) + '%'; ab.style.width = ((b2 - V.ab.a) / d * 100) + '%'; }
		// precise A-B loop: check every frame while playing (timeupdate is only ~4 per second)
		if (has && V.ab.b != null && !m.paused && !abLoopRaf) { abLoopRaf = requestAnimationFrame(function chk() { abLoopRaf = 0; if (m !== V.media || m.paused) return; var j = G.abCheck(m.currentTime, V.ab.a, V.ab.b); if (j != null) m.currentTime = j; abLoopRaf = requestAnimationFrame(chk); }); }
	}
	function wireSeek() {
		var sk = vq('mgv-seek'), drag = false;
		function tAt(e) { var r = sk.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
		sk.addEventListener('pointerdown', function (e) { var m = V.media; if (!m || !m.duration) return; drag = true; sk.setPointerCapture(e.pointerId); m.currentTime = tAt(e) * m.duration; e.stopPropagation(); });
		sk.addEventListener('pointermove', function (e) {
			var m = V.media; if (!m || !m.duration) return; var f = tAt(e), h = vq('mgv-hov');
			h.hidden = false; h.style.left = (f * 100) + '%'; h.textContent = G.fmtTime(f * m.duration);
			if (drag) m.currentTime = f * m.duration;
		});
		sk.addEventListener('pointerup', function () { drag = false; }); sk.addEventListener('pointerleave', function () { vq('mgv-hov').hidden = true; });
		vq('mgv-vbar').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
	}
	function wirePointer() {
		var st = vq('mgv-stage'), pts = new Map(), start = null, pinch = null, lastTap = 0, moved = false;
		st.addEventListener('pointerdown', function (e) {
			if (e.button && e.button !== 0) return;
			st.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
			['mgv-sizepop', 'mgv-speedpop'].forEach(function (id) { vq(id).hidden = true; });
			if (pts.size === 2) { var a = Array.from(pts.values()); pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: V.s, x: V.x, y: V.y, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 }; start = null; return; }
			start = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y, zoomed: V.s > V.fitS * 1.01, t: Date.now() }; moved = false;
		});
		st.addEventListener('pointermove', function (e) {
			if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pinch && pts.size >= 2) {
				var a = Array.from(pts.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
				var r = st.getBoundingClientRect(), ss = stageSize(), px = pinch.cx - (r.left + r.width / 2), py = pinch.cy - (r.top + r.height / 2) - ss.off;
				var z = G.zoomAbout(pinch.x, pinch.y, pinch.s, d / pinch.d, px, py, V.fitS * 0.5, 40);
				V.s = z.s; V.x = z.x + (cx - pinch.cx); V.y = z.y + (cy - pinch.cy); V.userZoom = true; apply(false); moved = true; return;
			}
			if (!start) return;
			var dx = e.clientX - start.x, dy = e.clientY - start.y;
			if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
			if (start.zoomed) { V.x = start.vx + dx; V.y = start.vy + dy; st.classList.add('mgv-drag'); apply(false); }
			else if (V.media && moved) {
				// swipe: the picture follows the finger
				var ss = stageSize();
				V.media.style.transform = 'translate(-50%,-50%) translate(' + dx + 'px,' + (Math.abs(dy) > Math.abs(dx) && dy > 0 ? dy : 0) * 1 + ss.off + 'px) rotate(' + V.rot + 'deg) scale(' + V.s * (dy > 0 && Math.abs(dy) > Math.abs(dx) ? Math.max(0.6, 1 - dy / 1200) : 1) + ')';
			}
		});
		function end(e) {
			pts.delete(e.pointerId); st.classList.remove('mgv-drag');
			if (pinch) { if (pts.size < 2) { pinch = null; start = null; if (V.s < V.fitS) fitNow(true); } return; }
			if (!start) return;
			var dx = e.clientX - start.x, dy = e.clientY - start.y, s0 = start; start = null;
			if (!s0.zoomed && moved) {
				if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { go(dx < 0 ? 1 : -1); return; }
				if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { closeViewer(); return; }
				apply(true); return;
			}
			if (!moved && e.type === 'pointerup') {
				var now = Date.now();
				if (now - lastTap < 320) { lastTap = 0; dbl(e.clientX, e.clientY); }
				else { lastTap = now; var tap = e; setTimeout(function () { if (lastTap && Date.now() - lastTap >= 300) { lastTap = 0; if (V.media && V.media.tagName === 'VIDEO' && tap.pointerType === 'mouse') act('play'); else vw.classList.toggle('mgv-idle'); } }, 330); }
			}
		}
		st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
		function dbl(x, y) {
			if (V.s > V.fitS * 1.05 || V.userZoom) { V.userZoom = false; fitNow(true); return; }
			var target = Math.max(V.fitS * 2.5, 1 / (window.devicePixelRatio || 1));
			zoomBy(target / V.s, x, y, true);
		}
		st.addEventListener('wheel', function (e) {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey || !e.shiftKey) { var f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)); zoomBy(f, e.clientX, e.clientY, false); }
			poke();
		}, { passive: false });
	}
	function onKey(e) {
		if (!V.open) return;
		var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
		var k = e.key, m = V.media, isV = m && m.tagName === 'VIDEO', handled = true;
		if (e.ctrlKey || e.metaKey) return;
		if (e.altKey && /^Digit[0-5]$/.test(e.code || '')) { var nr = +e.code.slice(5); setRating(V.it, { r: nr }); fillInfo(); refreshTileOf(V.it); osd(nr ? '★'.repeat(nr) : 'No stars'); e.preventDefault(); e.stopPropagation(); return; }
		switch (k) {
			case 'Escape': if (anyPopOpen()) { ['mgv-sizepop', 'mgv-speedpop', 'mgv-help'].forEach(function (id) { vq(id).hidden = true; }); } else if (!document.fullscreenElement) closeViewer(); else handled = false; break;
			case 'ArrowLeft': if (isV && e.shiftKey) seekBy(-5); else go(-1); break;
			case 'ArrowRight': if (isV && e.shiftKey) seekBy(5); else go(1); break;
			case 'PageUp': go(-1); break; case 'PageDown': go(1); break;
			case 'Home': show(0, -1); break; case 'End': show(VIEW.length - 1, 1); break;
			case '+': case '=': zoomBy(1.25); break;
			case '-': case '_': zoomBy(0.8); break;
			case '0': P.fit = 'fit'; save(); fitNow(true); break;
			case '1': P.fit = 'actual'; save(); fitNow(true); break;
			case 'f': case 'F': act('fs'); break;
			case 'i': case 'I': act('info'); break;
			case 't': case 'T': act('strip'); break;
			case 'h': case 'H': act('fav'); break;
			case '?': act('help'); break;
			case 'p': case 'P': act('slide'); break;
			case ' ': if (isV) act('play'); else act('slide'); break;
			case 'r': case 'R': if (isV && !e.shiftKey) setRate(1); else act(e.shiftKey ? 'rotl' : 'rotr'); break;
			default:
				if (!isV) { handled = false; break; }
				switch (k.toLowerCase()) {
					case 'k': act('play'); break;
					case 's': setRate(G.speedStep(m.playbackRate, -1)); break;
					case 'd': setRate(G.speedStep(m.playbackRate, 1)); break;
					case 'g': setRate(Math.abs(m.playbackRate - 1) < 0.001 ? (P.lastRate || 1.5) : 1); break;
					case 'z': seekBy(-5); break; case 'x': seekBy(5); break;
					case 'j': seekBy(-10); break; case 'l': seekBy(10); break;
					case ',': frameStep(-1); break; case '.': frameStep(1); break;
					case 'a': act('seta'); break; case 'b': act('setb'); break; case 'c': act('clearab'); break;
					case 'm': act('mute'); break;
					case 'arrowup': P.vol = Math.min(1, (m.muted ? 0 : m.volume) + 0.05); P.muted = false; m.muted = false; m.volume = P.vol; save(); osd('Volume ' + Math.round(P.vol * 100) + '%'); break;
					case 'arrowdown': P.vol = Math.max(0, m.volume - 0.05); m.volume = P.vol; save(); osd('Volume ' + Math.round(P.vol * 100) + '%'); break;
					default: handled = false;
				}
		}
		if (handled) { e.preventDefault(); e.stopPropagation(); poke(); }
	}
	function seekBy(s) { var m = V.media; if (!m || !m.duration) return; m.currentTime = Math.max(0, Math.min(m.duration, m.currentTime + s)); osd((s > 0 ? '+' : '−') + Math.abs(s) + ' s'); }

	/* ---------- slideshow ---------- */
	var slideT = 0, slideStart = 0, slideRaf = 0;
	function startSlide() { V.slide = true; vq('mgv-slide').setAttribute('aria-pressed', 'true'); vq('mgv-slide').firstChild.textContent = '❚❚'; osd('Slideshow · every ' + P.slide + ' s'); slideTick(); poke(); }
	function stopSlide() { if (!vw) return; V.slide = false; clearTimeout(slideT); cancelAnimationFrame(slideRaf); vq('mgv-sbar').style.width = '0'; vq('mgv-slide').setAttribute('aria-pressed', 'false'); vq('mgv-slide').firstChild.textContent = '▶'; }
	function slideTick() {
		clearTimeout(slideT); cancelAnimationFrame(slideRaf);
		if (!V.slide) return;
		var it = V.it;
		if (it && it.kind === 'video' && P.vidFull && !it.bad) { vq('mgv-sbar').style.width = '0'; return; }   // 'ended' moves on
		var ms = P.slide * 1000; slideStart = performance.now();
		(function bar() { var f = Math.min(1, (performance.now() - slideStart) / ms); vq('mgv-sbar').style.width = (f * 100) + '%'; if (f < 1 && V.slide) slideRaf = requestAnimationFrame(bar); })();
		slideT = setTimeout(function () { if (V.slide) go(1); }, ms);
	}

	/* ---------- filmstrip ---------- */
	function stripHas(id) { var s = vq('mgv-strip'); return s && !!s.querySelector('[data-id="' + id + '"]'); }
	function syncStrip() {
		var s = vq('mgv-strip'); s.hidden = !P.strip; vw.style.setProperty('--mv-stripH', P.strip ? '74px' : '0px');
		if (!P.strip) return;
		var a = Math.max(0, V.i - 30), b = Math.min(VIEW.length, V.i + 31), h = '';
		for (var j = a; j < b; j++) { var it = VIEW[j], u = thumbURL.get(it.id); h += '<button type="button" data-vi="' + j + '" data-id="' + it.id + '" class="' + (j === V.i ? 'mgv-cur' : '') + '" aria-label="' + esc(it.name) + '">' + (u ? '<img alt="" src="' + u + '">' : '') + '</button>'; if (!u && !it.bad) needThumbStrip(it); }
		s.innerHTML = h;
		var cur = s.querySelector('.mgv-cur'); if (cur) s.scrollLeft = cur.offsetLeft - s.clientWidth / 2 + cur.offsetWidth / 2;
	}
	var stripQ = [];
	function needThumbStrip(it) { if (stripQ.indexOf(it) < 0) stripQ.push(it); if (stripQ.length === 1) setTimeout(runStripQ, 50); }
	function runStripQ() { var it = stripQ.shift(); if (!it) return; if (thumbURL.has(it.id)) return runStripQ(); getThumb(it).then(function (u) { if (u) setThumb(it, u); runStripQ(); }, runStripQ); }
	function stripThumb(it) { var b = vq('mgv-strip') && vq('mgv-strip').querySelector('[data-id="' + it.id + '"]'); if (b && !b.firstChild) b.innerHTML = '<img alt="" src="' + thumbURL.get(it.id) + '">'; }

	/* ---------- info panel ---------- */
	var exifCache = new Map();
	function fillInfo() {
		if (!vw || !V.it || !vw.classList.contains('mgv-info-open')) return;
		var it = V.it, r = rating(it), m = V.media, rows = [];
		rows.push(['Type', (it.kind === 'video' ? 'Video' : 'Photo') + ' · ' + (it.ext || '?').toUpperCase()]);
		rows.push(['Size', G.fmtBytes(it.size)]);
		var w = it.w || V.natW, h = it.h || V.natH;
		if (it.kind === 'video' && m && m.videoWidth) { w = m.videoWidth; h = m.videoHeight; }
		if (w && h) rows.push(['Dimensions', w + ' × ' + h + (it.kind === 'image' ? ' · ' + G.mp(w, h) : '')]);
		if (it.kind === 'video' && it.dur) rows.push(['Length', G.fmtDur(it.dur)]);
		if (it.kind === 'video' && V.fps) rows.push(['Frame rate', '≈ ' + Math.round(V.fps) + ' fps']);
		if (it.taken) rows.push(['Taken', G.fmtDate(it.taken, true)]);
		else if (it.named) rows.push(['Date in name', G.fmtDate(it.named, true)]);
		rows.push(['Changed', G.fmtDate(it.mtime, true)]);
		var stars = '';
		for (var s = 1; s <= 5; s++) stars += '<button type="button" data-star="' + s + '" class="' + ((r.r || 0) >= s ? 'mgv-lit' : '') + '" aria-label="' + s + ' star' + (s > 1 ? 's' : '') + '">★</button>';
		var html = '<h3>' + esc(it.name) + '</h3><div class="mgv-path">' + esc((rootName ? rootName + '/' : '') + it.path) + '</div>' +
			'<div class="mgv-rate">' + stars + '<button type="button" data-heart="1" class="mgv-heart2' + (r.f ? ' mgv-lit' : '') + '" aria-label="Favourite">♥</button></div>' +
			'<dl>' + rows.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' +
			'<div class="mgv-acts">' + (it.kind === 'image' ? '<button type="button" class="mgv-b" data-a="edit">✎ Edit in Photo Editor</button>' : '<a class="mgv-b" href="/video" target="_blank" rel="noopener" style="text-decoration:none">✂ Video Editor</a>') +
			'<button type="button" class="mgv-b" data-a="opentab">↗ Open in a new tab</button><button type="button" class="mgv-b" data-a="copyname">Copy name</button></div>' +
			'<div id="mgv-exif"></div>';
		vq('mgv-info').innerHTML = html;
		if (it.kind === 'image' && X) loadExif(it);
	}
	function loadExif(it) {
		var done = function (ex) {
			if (V.it !== it || !vq('mgv-exif')) return;
			if (!ex || !ex.rows || !ex.rows.length) { vq('mgv-exif').innerHTML = '<div class="mgv-sec">Camera</div><p style="color:var(--mv-muted);font-size:0.9em">No camera data (EXIF) in this file.</p>'; return; }
			var want = ['Camera make', 'Camera model', 'Lens model', 'Focal length', 'Focal length (35 mm)', 'Aperture (f-number)', 'Exposure time', 'ISO', 'Exposure bias', 'Flash', 'Software', 'Orientation'];
			var pick = []; want.forEach(function (n) { ex.rows.forEach(function (r) { if (r.name === n && !pick.some(function (p) { return p[0] === n; })) pick.push([n, r.value]); }); });
			var h = '<div class="mgv-sec">Camera</div><dl>' + pick.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('') + '</dl>';
			if (ex.gps) h += '<div class="mgv-sec">Location</div><p style="font-size:0.9em">' + ex.gps.lat.toFixed(5) + ', ' + ex.gps.lon.toFixed(5) + ' · <a href="https://www.openstreetmap.org/?mlat=' + ex.gps.lat + '&mlon=' + ex.gps.lon + '#map=15/' + ex.gps.lat + '/' + ex.gps.lon + '" target="_blank" rel="noopener">map</a></p>';
			h += '<p style="font-size:0.85em"><a href="/exif-viewer" target="_blank" rel="noopener">All metadata in the EXIF Viewer ↗</a></p>';
			vq('mgv-exif').innerHTML = h;
		};
		if (exifCache.has(it.id)) return done(exifCache.get(it.id));
		it.file.slice(0, 262144).arrayBuffer().then(function (b) { var ex = null; try { ex = X.parse(b); } catch (e) {} exifCache.set(it.id, ex); done(ex); }, function () { done(null); });
	}
	/* Edit in Photo Editor: copy the picture (PNG) to the clipboard inside the click, open the editor; Ctrl+V there pastes it */
	function editInPhoto() {
		var it = V.it, img = V.media;
		if (!it || !img || img.tagName !== 'IMG') return;
		var w = V.natW, h = V.natH, pngP = new Promise(function (res, rej) {
			var c = document.createElement('canvas'); c.width = w; c.height = h;
			var full = new Image(); full.onload = function () { c.getContext('2d').drawImage(full, 0, 0, w, h); c.toBlob(function (b) { b ? res(b) : rej(); }, 'image/png'); }; full.onerror = rej; full.src = V.url;
		});
		var copied = (navigator.clipboard && window.ClipboardItem) ? navigator.clipboard.write([new ClipboardItem({ 'image/png': pngP })]) : Promise.reject();
		var win = window.open('/photo', '_blank');
		copied.then(function () { toast('Picture copied. In the Photo Editor press Ctrl+V (⌘V on a Mac) to paste it in.', 6000); },
			function () { toast('Could not copy the picture. In the Photo Editor use File → Open and pick ' + it.name + '.', 6500); });
		if (!win) toast('The browser blocked the new tab: open mes.fm/photo yourself.');
	}

	/* ---------- demo: made-up pictures (and a short video where the browser can record one) ---------- */
	$('mg-demo').onclick = function () {
		var b = this; b.disabled = true; b.textContent = 'Making sample pictures…';
		makeDemo().then(function (files) {
			b.disabled = false; b.textContent = '✨ Try it with sample pictures';
			var gen = begin('Sample pictures');
			addItems(files.map(function (o) { return mkItem(o.f, o.rel, false); }), gen);
			finish(gen);
		});
	};
	function makeDemo() {
		var sizes = [[1600, 1067], [1067, 1600], [1600, 900], [1200, 1200], [1600, 1200], [900, 1600], [2400, 800], [1500, 1000]];
		var folders = ['Holiday', 'Holiday', 'Garden', 'Garden', 'Kids', 'Screenshots'], out = [], now = Date.now(), seq = Promise.resolve();
		function rnd(n) { var x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }
		for (var i = 0; i < 42; i++) (function (i) {
			seq = seq.then(function () {
				var s = sizes[i % sizes.length], c = document.createElement('canvas'); c.width = s[0] / 2; c.height = s[1] / 2;
				var x = c.getContext('2d'), h1 = Math.floor(rnd(i) * 360), h2 = (h1 + 40 + rnd(i + 7) * 80) % 360;
				var g = x.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, 'hsl(' + h1 + ',70%,60%)'); g.addColorStop(1, 'hsl(' + h2 + ',65%,32%)');
				x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
				x.fillStyle = 'hsla(' + ((h1 + 180) % 360) + ',80%,85%,0.85)'; x.beginPath(); x.arc(c.width * (0.25 + rnd(i + 3) * 0.5), c.height * (0.2 + rnd(i + 5) * 0.3), Math.min(c.width, c.height) * 0.12, 0, 7); x.fill();
				x.fillStyle = 'rgba(0,0,0,0.28)'; x.beginPath(); x.moveTo(0, c.height); for (var k = 0; k <= 8; k++) x.lineTo(c.width * k / 8, c.height * (0.62 + rnd(i * 10 + k) * 0.22)); x.lineTo(c.width, c.height); x.fill();
				x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = 'bold ' + Math.round(c.height / 9) + 'px sans-serif'; x.fillText('#' + (i + 1), c.width * 0.05, c.height * 0.14);
				return new Promise(function (res) { c.toBlob(function (bl) {
					var day = now - Math.floor(i / 3) * 86400000 * (3 + (i % 4)), d = new Date(day), nm = 'IMG_' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '_' + (100000 + i * 731) + '.jpg';
					var fo = folders[i % folders.length];
					out.push({ f: new File([bl], fo === 'Screenshots' ? 'Screenshot ' + (i + 1) + '.jpg' : nm, { type: 'image/jpeg', lastModified: day }), rel: fo + '/' + (fo === 'Screenshots' ? 'Screenshot ' + (i + 1) + '.jpg' : nm) });
					res();
				}, 'image/jpeg', 0.86); });
			});
		})(i);
		return seq.then(function () { return demoVideo().then(function (v) { if (v) out.push({ f: v, rel: 'Holiday/clip.webm' }); return out; }); });
	}
	function demoVideo() {
		if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return Promise.resolve(null);
		return new Promise(function (res) {
			var c = document.createElement('canvas'); c.width = 640; c.height = 360; var x = c.getContext('2d'), st = c.captureStream(30), rec, chunks = [], t0 = performance.now();
			try { rec = new MediaRecorder(st, { mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '' }); } catch (e) { return res(null); }
			rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
			rec.onstop = function () { res(chunks.length ? new File(chunks, 'clip.webm', { type: 'video/webm', lastModified: Date.now() - 86400000 }) : null); };
			var iv = setInterval(function () {
				var t = (performance.now() - t0) / 1000;
				var g = x.createLinearGradient(0, 0, 640, 360); g.addColorStop(0, 'hsl(' + (t * 60 % 360) + ',70%,55%)'); g.addColorStop(1, 'hsl(' + ((t * 60 + 120) % 360) + ',70%,30%)');
				x.fillStyle = g; x.fillRect(0, 0, 640, 360); x.fillStyle = '#fff'; x.beginPath(); x.arc(320 + Math.cos(t * 2) * 200, 180 + Math.sin(t * 3) * 110, 34, 0, 7); x.fill();
				x.font = 'bold 34px sans-serif'; x.fillText(t.toFixed(2) + ' s', 24, 50);
			}, 33);
			rec.start(250);
			setTimeout(function () { clearInterval(iv); try { rec.stop(); } catch (e) { res(null); } }, 3200);
			setTimeout(function () { res(null); }, 8000);
		});
	}

	/* debug hook for testing in a hidden pane */
	if (/[?&]debug=1/.test(location.search)) window.MESGalleryDebug = { all: function () { return ALL; }, view: function () { return VIEW; }, lay: function () { return LAY; }, V: V, P: P, open: openViewer, refresh: refresh, render: render, act: function (a) { act(a); } };
})();
