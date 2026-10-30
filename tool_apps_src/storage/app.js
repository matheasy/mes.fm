/* MES Storage Analyzer UI. Core (scan, model, layouts, lists, reports) = MESStorage in lib.js (prepended above).
   Settings in localStorage mes-storage:v1 (views and filters only: no file names or sizes are ever stored or sent). */
(function () {
	'use strict';
	var L = MESStorage, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-storage:v1';
	var P = { view: 'sun', col: 'folder', rings: 6, tab: 'big', sort: 'size', dir: -1, oldMin: 100e6, oldDays: 365, dupMin: 1e6 };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in P) P[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('st-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 3200); }
	function dark() { return document.body.classList.contains('dark-mode'); }
	var B = L.fmtBytes, N = L.fmtInt;

	/* ---------- state ---------- */
	var M = null, zoom = 0, sel = -1, hover = -1, expanded = new Set(), moreN = new Map(), focusCat = -1;
	var src = null;            // how the last scan was made, for "Scan again": {kind: 'handle', h} | {kind: 'demo'} | {kind: 'input'} | {kind: 'drop'}
	var mode = 'none';         // 'handle' (File System Access), 'paths' (folder upload picker / dropped entries), 'demo'
	var busy = null;           // the running scan: {cancel()}
	var hashes = {}, hashRun = null;
	var hasPicker = typeof window.showDirectoryPicker === 'function';
	var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

	/* ---------- what this browser can do ---------- */
	(function how() {
		var t;
		if (hasPicker) t = 'This browser can open a folder directly: the scan runs in the background, empty folders show up and very big folders work. It only gets permission to <b>view</b> the folder, for this tab.';
		else if (navigator.brave) t = '<b>Brave</b> has the faster way switched off. This page will use the browser\'s "upload a folder" window instead: nothing is uploaded, but Brave may say "upload" and empty folders won\'t show. To switch the faster way on, open <code>brave://flags/#file-system-access-api</code>, set it to Enabled and restart Brave.';
		else if (isIOS) t = 'On iPhone and iPad, Safari can\'t open folders from a web page. Please use a computer (or try the made-up example).';
		else t = 'This browser will show its "upload a folder" window. Nothing is uploaded: the page only reads the list of files. The browser may ask you to confirm, and empty folders won\'t show up.';
		$('st-how').innerHTML = t;
	})();

	/* ---------- progress ---------- */
	var t0 = 0, progTimer = 0, lastP = null;
	function showProg(on) {
		$('st-prog').hidden = !on;
		$('st-pick').hidden = on;
		if (on) { $('st-res').hidden = true; t0 = Date.now(); lastP = { files: 0, dirs: 0, bytes: 0, path: '' }; paintProg(); clearInterval(progTimer); progTimer = setInterval(paintProg, 250); }
		else clearInterval(progTimer);
	}
	function onProg(p) { lastP = p; }
	function paintProg() {
		var p = lastP || {};
		$('st-pfiles').textContent = N(p.files || 0); $('st-pdirs').textContent = N(p.dirs || 0); $('st-pbytes').textContent = B(p.bytes || 0);
		$('st-ptime').textContent = Math.round((Date.now() - t0) / 1000) + ' s'; $('st-ppath').textContent = p.path ? '‎' + p.path + '‎' : '';
	}
	$('st-cancel').onclick = function () { if (busy) busy.cancel(); };

	/* ---------- scanning ---------- */
	function scanFromHandle(h) {
		src = { kind: 'handle', h: h };
		showProg(true);
		var cancelled = false, w = null;
		busy = { cancel: function () { cancelled = true; if (w) { w.terminate(); w = null; } done(null); } };
		var settled = false;
		function done(raw, err) {
			if (settled) return; settled = true; busy = null;
			if (w) { w.terminate(); w = null; }
			if (err) { showProg(false); toast('The scan stopped: ' + err); return; }
			if (!raw) { showProg(false); toast('Scan cancelled.'); return; }
			finish(raw, 'handle');
		}
		function mainThread() {
			if (cancelled || settled) return;
			L.scanHandle(h, { onProgress: onProg, cancelled: function () { return cancelled; } }).then(function (r) { done(r); }, function (e) { done(null, e && e.message || String(e)); });
		}
		try {
			var url = URL.createObjectURL(new Blob([L.WORKER_SRC], { type: 'text/javascript' }));
			w = new Worker(url);
			URL.revokeObjectURL(url);
			var gotAny = false;
			w.onmessage = function (e) {
				var m = e.data; gotAny = true;
				if (m.type === 'progress') onProg(m.p);
				else if (m.type === 'done') done(m.r);
				else if (m.type === 'cancelled') done(null);
				else if (m.type === 'error') { if (w) { w.terminate(); w = null; } mainThread(); }   // e.g. a browser that can't use folder handles in a worker
			};
			w.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); if (w) { w.terminate(); w = null; } if (!gotAny) mainThread(); else done(null, 'the background scan failed'); };
			w.postMessage({ cmd: 'scan', handle: h, maxDepth: 64 });
		} catch (e) { if (w) { w.terminate(); w = null; } mainThread(); }
	}
	$('st-choose').onclick = function () {
		if (!hasPicker) { $('st-dirinput').value = ''; $('st-dirinput').click(); return; }
		window.showDirectoryPicker({ id: 'mes-storage', mode: 'read' }).then(scanFromHandle, function (e) {
			if (e && e.name === 'AbortError') return;
			toast(e && (e.name === 'SecurityError' || e.name === 'TypeError') ? 'The browser won\'t open that folder (it holds system files). Pick a folder inside it, like Documents or Downloads.' : 'Could not open the folder: ' + (e && e.message || e));
		});
	};
	/* <input webkitdirectory>: the browser hands over every file with its relative path */
	$('st-dirinput').onchange = function () {
		var fl = this.files; if (!fl || !fl.length) { toast('No files in that folder (or the browser gave none).'); return; }
		src = { kind: 'input' };
		fromFileList(Array.prototype.slice.call(fl));
	};
	function fromFileList(arr) {
		showProg(true);
		var items = [], k = 0, cancelled = false, bytes = 0, dirs = Object.create(null), nd = 0;
		busy = { cancel: function () { cancelled = true; } };
		(function step() {
			if (cancelled) { busy = null; showProg(false); toast('Cancelled.'); return; }
			var end = Math.min(arr.length, k + 4000);
			for (; k < end; k++) {
				var f = arr[k], p = f.webkitRelativePath || f.name;
				items.push({ path: p, size: f.size, mtime: f.lastModified, file: f }); bytes += f.size;
				var d = p.slice(0, p.lastIndexOf('/')); if (!dirs[d]) { dirs[d] = 1; nd++; }
			}
			onProg({ files: k, dirs: nd, bytes: bytes, path: arr[k - 1] ? arr[k - 1].webkitRelativePath : '' });
			if (k < arr.length) return void setTimeout(step, 0);
			busy = null;
			finish(L.fromPaths(items), 'paths');
		})();
	}
	/* dropped folder without handles: walk FileSystemDirectoryEntry (readEntries returns batches until empty) */
	function fromEntry(root) {
		src = { kind: 'drop' };
		showProg(true);
		var items = [], errors = [], cancelled = false, nf = 0, nd = 1, bytes = 0, q = [{ e: root, d: 0 }];
		busy = { cancel: function () { cancelled = true; } };
		function readAll(dirEntry) {
			return new Promise(function (res) {
				var rd = dirEntry.createReader(), out = [];
				(function more() { rd.readEntries(function (batch) { if (!batch.length) return res(out); out = out.concat(batch); more(); }, function (err) { errors.push({ path: dirEntry.fullPath.slice(1), why: 'Could not read this folder' + (err && err.name ? ' (' + err.name + ')' : '') }); res(out); }); })();
			});
		}
		function fileOf(fe) { return new Promise(function (res) { fe.file(function (f) { res(f); }, function (err) { res({ __err: err }); }); }); }
		(async function () {
			while (q.length) {
				if (cancelled) { busy = null; showProg(false); toast('Cancelled.'); return; }
				var job = q.shift(), list = await readAll(job.e), fes = [];
				list.forEach(function (en) {
					if (en.isDirectory) { if (job.d + 1 > 64) errors.push({ path: en.fullPath.slice(1), why: 'Too deep: skipped' }); else { items.push({ path: en.fullPath.slice(1), dir: true }); nd++; q.push({ e: en, d: job.d + 1 }); } }
					else if (en.isFile) fes.push(en);
				});
				for (var i = 0; i < fes.length; i += 32) {
					var part = fes.slice(i, i + 32), got = await Promise.all(part.map(fileOf));
					got.forEach(function (f, j) {
						var p = part[j].fullPath.slice(1);
						if (f.__err) { errors.push({ path: p, why: 'Could not read the size' }); items.push({ path: p, size: 0 }); }
						else { items.push({ path: p, size: f.size, mtime: f.lastModified, file: f }); bytes += f.size; }
						nf++;
					});
					onProg({ files: nf, dirs: nd, bytes: bytes, path: job.e.fullPath.slice(1) });
				}
			}
			busy = null;
			var raw = L.fromPaths(items, root.name); raw.errors = errors;
			finish(raw, 'paths');
		})();
	}

	/* drag and drop anywhere on the tool */
	var dropZone = $('st');
	['dragenter', 'dragover'].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { if (!e.dataTransfer || [].indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return; e.preventDefault(); $('st-drop').classList.add('st-over'); }); });
	['dragleave', 'drop'].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { if (ev === 'dragleave' && dropZone.contains(e.relatedTarget)) return; $('st-drop').classList.remove('st-over'); }); });
	dropZone.addEventListener('drop', function (e) {
		if (!e.dataTransfer || !e.dataTransfer.items || !e.dataTransfer.items.length) return;
		e.preventDefault();
		if (busy) return toast('A scan is already running.');
		var it = null;
		for (var i = 0; i < e.dataTransfer.items.length; i++) if (e.dataTransfer.items[i].kind === 'file') { it = e.dataTransfer.items[i]; break; }
		if (!it) return;
		var entry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
		if (it.getAsFileSystemHandle) {
			it.getAsFileSystemHandle().then(function (h) {
				if (h && h.kind === 'directory') scanFromHandle(h);
				else toast('That is a file. Drop a folder to see what is inside it.');
			}, function () { if (entry && entry.isDirectory) fromEntry(entry); else toast('Could not open what was dropped.'); });
			return;
		}
		if (entry && entry.isDirectory) fromEntry(entry);
		else toast('That is a file. Drop a folder to see what is inside it.');
	});

	/* ---------- made-up example ---------- */
	function demoRaw() {
		var s = 20240917;
		function rnd() { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
		function ri(a, b) { return Math.floor(a + rnd() * (b - a + 1)); }
		function when(y0, y1) { return Date.UTC(y0, 0, 1) + rnd() * (Date.UTC(y1, 11, 31) - Date.UTC(y0, 0, 1)); }
		var it = [], R = 'Example folder';
		function f(p, size, mt) { it.push({ path: R + '/' + p, size: Math.round(size), mtime: mt }); }
		var photoSizes = [];
		for (var y = 2016; y <= 2025; y++) for (var i = 0, n = ri(250, 700); i < n; i++) {
			var sz = ri(1.8e6, 7.5e6), ex = y >= 2020 && rnd() < 0.4 ? 'HEIC' : 'JPG'; photoSizes.push(sz);
			f('Photos/' + y + '/' + (rnd() < 0.08 ? 'Screenshot ' + y + '-' + ri(1, 12) + '-' + ri(1, 28) + '.png' : 'IMG_' + ri(1000, 9999) + '.' + ex), sz, when(y, y));
		}
		for (i = 0; i < 46; i++) f('Videos/' + ['Holiday', 'Birthday', 'Drone', 'Concert', 'Screen recording', 'Lecture'][i % 6] + ' ' + (i + 1) + '.' + (i % 3 ? 'mp4' : 'mov'), ri(1.5e8, 4.2e9), when(2017, 2025));
		f('Videos/Camtasia/Math Q&A 72.tscproj', 2.1e6, when(2025, 2025)); f('Videos/Camtasia/Math Q&A 72 recording.trec', 8.9e9, when(2025, 2025));
		var artists = ['The Lumens', 'Ada Park', 'Northbound', 'Kilo Echo', 'Mira Sol', 'Static Pines'];
		artists.forEach(function (a) { for (var al = 1; al <= ri(2, 5); al++) for (var t = 1; t <= ri(8, 14); t++) f('Music/' + a + '/Album ' + al + '/' + ('0' + t).slice(-2) + ' Track.mp3', ri(3e6, 11e6), when(2012, 2019)); });
		['website', 'mobile-app', 'thesis-code', 'game-jam'].forEach(function (pr, pi) {
			for (var m = 0; m < 160; m++) for (var j = 0, fn = ri(5, 40); j < fn; j++) f('Projects/' + pr + '/node_modules/pkg-' + m + '/' + (j % 5 ? 'lib/' : '') + 'file' + j + '.' + (j % 4 ? 'js' : 'json'), ri(400, 60e3), when(2021 + (pi % 3), 2024));
			for (j = 0; j < 60; j++) f('Projects/' + pr + '/src/module' + j + '.' + (pi === 2 ? 'py' : 'ts'), ri(1e3, 30e3), when(2022, 2025));
			f('Projects/' + pr + '/.git/objects/pack/pack-' + pi + '.pack', ri(3e7, 4e8), when(2023, 2025));
			it.push({ path: R + '/Projects/' + pr + '/build', dir: true });
		});
		var dl = ['Setup-Editor.exe', 'Office-Installer.dmg', 'Drivers.zip', 'ubuntu-24.04-desktop-amd64.iso', 'tax-return-2023.pdf', 'Invoice 4471.pdf', 'Slides.pptx', 'dataset.csv'];
		dl.forEach(function (d, k) { f('Downloads/' + d, [9e7, 2.4e8, 6e7, 6.1e9, 4e5, 1.2e5, 1.5e7, 3.3e8][k], when(2019, 2025)); });
		for (i = 0; i < 60; i++) { var ps = photoSizes[ri(0, photoSizes.length - 1)]; f('Downloads/IMG_' + ri(1000, 9999) + ' (1).JPG', ps, when(2021, 2025)); }
		f('Downloads/Office-Installer (1).dmg', 2.4e8, when(2024, 2024)); f('Downloads/ubuntu-24.04-desktop-amd64 (2).iso', 6.1e9, when(2025, 2025));
		for (i = 0; i < 180; i++) f('Documents/' + ['Work', 'School', 'Home', 'Taxes'][i % 4] + '/' + ['Notes', 'Report', 'Budget', 'Letter', 'Plan'][i % 5] + ' ' + i + '.' + ['docx', 'xlsx', 'pdf', 'txt', 'md'][i % 5], ri(8e3, 4e6), when(2015, 2025));
		f('Backups/Laptop backup 2019.zip', 3.4e9, when(2019, 2019)); f('Backups/Phone backup 2020.zip', 2.2e9, when(2020, 2020)); f('Backups/Old disk image.dmg', 1.1e10, when(2018, 2018));
		it.push({ path: R + '/Old stuff/To sort', dir: true }); it.push({ path: R + '/Old stuff/Empty album', dir: true });
		var raw = L.fromPaths(it, R);
		raw.errors = [{ path: R + '/Library/Private', why: 'No permission to read this folder (NotAllowedError) [example]' }];
		return raw;
	}
	$('st-demo').onclick = function () { src = { kind: 'demo' }; finish(demoRaw(), 'demo'); toast('A made-up folder of about 20,000 files, so you can try the charts.'); };

	/* ---------- after a scan ---------- */
	function finish(raw, how) {
		showProg(false);
		mode = how; M = L.build(raw); zoom = 0; sel = -1; hover = -1; expanded = new Set(); moreN = new Map(); focusCat = -1; hashes = {}; hashRun = null;
		$('st-pick').hidden = true; $('st-res').hidden = false;
		if (M.n < 2) toast('The folder is empty, or the browser showed none of its files.');
		renderAll();
		setTimeout(function () { $('st-rootname').scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
	}
	$('st-new').onclick = function () { $('st-res').hidden = true; $('st-pick').hidden = false; M = null; $('st-pick').scrollIntoView({ block: 'center' }); };
	$('st-again').onclick = function () {
		if (!src) return;
		if (src.kind === 'handle') scanFromHandle(src.h);
		else if (src.kind === 'demo') $('st-demo').click();
		else { toast('The browser needs you to pick the folder again.'); $('st-choose').click(); }
	};

	function renderAll() { renderSummary(); renderZoom(); }
	function renderZoom() { renderCrumbs(); drawChart(); renderInfo(); renderLegend(); renderTable(); renderList(); }

	function renderSummary() {
		var bt = L.byType(M, 0), big = L.largestFiles(M, 1, 0)[0], cat = bt.cats[0];
		$('st-rootname').textContent = M.names[0] + (mode === 'demo' ? ' (made up)' : '');
		$('st-stats').innerHTML = [
			['<b>' + B(M.total[0]) + '</b><span>in total</span>'],
			['<b>' + N(M.files[0]) + '</b><span>files</span>'],
			['<b>' + N(M.dirs[0]) + '</b><span>folders</span>'],
			[cat ? '<b>' + esc(cat.name) + '</b><span>biggest type: ' + B(cat.bytes) + ' (' + L.fmtPct(L.pct(cat.bytes, M.total[0])) + ')</span>' : ''],
			[big != null ? '<b>' + B(M.size[big]) + '</b><span>largest file: ' + esc(M.names[big]) + '</span>' : '']
		].filter(function (x) { return x[0]; }).map(function (x) { return '<div class="st-stat">' + x[0] + '</div>'; }).join('');
		var w = $('st-warn');
		if (M.errors.length) { w.hidden = false; w.innerHTML = N(M.errors.length) + ' item' + (M.errors.length > 1 ? 's' : '') + ' could not be read and ' + (M.errors.length > 1 ? 'are' : 'is') + ' not counted. <button type="button" id="st-goerr">See which</button>'; $('st-goerr').onclick = function () { setTab('err'); $('st-listsec').scrollIntoView({ block: 'start', behavior: 'smooth' }); }; }
		else w.hidden = true;
	}

	/* ---------- zoom / select ---------- */
	function setZoom(i) { if (i == null || i < 0 || !M.isDir[i]) return; zoom = i; hover = -1; renderZoom(); }
	function reveal(i) {
		if (i == null || i < 0) return;
		var z = M.isDir[i] ? M.parent[i] : M.parent[i];
		if (z < 0) z = 0;
		sel = i; zoom = z;
		L.ancestors(M, i).forEach(function (a) { if (M.isDir[a]) expanded.add(a); });
		renderZoom();
		var row = document.querySelector('#st-tbody tr[data-i="' + i + '"]'); if (row) row.scrollIntoView({ block: 'nearest' });
	}
	function up() { if (zoom > 0) { sel = zoom; setZoom(M.parent[zoom]); } }
	function renderCrumbs() {
		var a = L.ancestors(M, zoom);
		$('st-crumbs').innerHTML = (zoom ? '<button type="button" data-z="' + M.parent[zoom] + '" title="Up one folder (Backspace)">⬆ Up</button><span class="st-sep">·</span>' : '') +
			a.map(function (i, k) { return '<button type="button" data-z="' + i + '"' + (i === zoom ? ' aria-current="page"' : '') + '>' + esc(M.names[i]) + '</button>' + (k < a.length - 1 ? '<span class="st-sep">›</span>' : ''); }).join('') +
			'<span class="st-sep">·</span><span>' + B(M.total[zoom]) + '</span>';
	}
	$('st-crumbs').onclick = function (e) { var b = e.target.closest('[data-z]'); if (b && !b.hasAttribute('aria-current')) setZoom(+b.getAttribute('data-z')); };
	document.addEventListener('keydown', function (e) {
		if (!M || $('st-res').hidden) return;
		var t = e.target, tag = t && t.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
		if (e.key === 'Backspace' && zoom > 0) { e.preventDefault(); up(); }
	});

	/* ---------- colours ---------- */
	var HUE0 = 200;
	function hueOfTop(k) { return (HUE0 + k * 137.508) % 360; }
	function folderCol(h, ring, isFile) {
		var dk = dark();
		if (isFile) return 'hsl(' + h.toFixed(0) + ',' + (dk ? 30 : 35) + '%,' + (dk ? 62 : 72) + '%)';
		return 'hsl(' + h.toFixed(0) + ',' + (dk ? 58 : 62) + '%,' + Math.min(dk ? 66 : 70, (dk ? 40 : 42) + ring * 5) + '%)';
	}
	function typeCol(i, ring) {
		if (!M.isDir[i]) return L.CATS[M.cat[i]].color;
		var dk = dark();
		return 'hsl(215,' + (dk ? 10 : 12) + '%,' + (dk ? 30 + ring * 4 : 70 + Math.min(ring, 5) * 3) + '%)';
	}
	function faded(i) { return focusCat >= 0 && (M.isDir[i] || M.cat[i] !== focusCat); }

	/* ---------- chart ---------- */
	var cv = $('st-canvas'), ctx = cv.getContext('2d'), box = $('st-chartbox');
	var ov = document.createElement('canvas'); ov.className = 'st-ov'; ov.setAttribute('aria-hidden', 'true');
	ov.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
	box.appendChild(ov);
	var octx = ov.getContext('2d');
	var W = 0, H = 0, DPR = 1, geo = null;   // geo: sunburst {cx, cy, r0, dr, rings, byRing} or treemap {rects: Float32Array x,y,w,h + ids}
	function sizeCanvas() {
		W = Math.max(50, box.clientWidth); H = Math.max(50, box.clientHeight); DPR = Math.min(2.5, window.devicePixelRatio || 1);
		[cv, ov].forEach(function (c) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); c.style.width = W + 'px'; c.style.height = H + 'px'; });
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0); octx.setTransform(DPR, 0, 0, DPR, 0, 0);
	}
	function drawChart() {
		if (!M || $('st-res').hidden) return;
		/* on a narrow screen a sunburst is round: make the box square instead of leaving empty space above and below */
		var fill = $('st-chartsec').classList.contains('mes-pfill'), want = '';
		if (P.view === 'sun' && !fill && box.clientWidth < 700) want = Math.round(Math.max(260, Math.min(box.clientWidth, window.innerHeight * 0.75))) + 'px';
		if (box.style.height !== want) box.style.height = want;
		sizeCanvas();
		ctx.clearRect(0, 0, W, H);
		$('st-ringslab').style.display = P.view === 'sun' ? '' : 'none';
		if (P.view === 'sun') drawSun(); else drawTree();
		drawOverlay();
	}
	function cssVar(n) { return getComputedStyle($('st')).getPropertyValue(n).trim() || '#fff'; }

	function drawSun() {
		var cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 6, rings = P.rings, r0 = Math.max(26, R * 0.2), dr = (R - r0) / rings;
		var arcs = L.sunburst(M, zoom, rings, Math.max(0.003, 1.2 / R)), byRing = [], bg = cssVar('--st-chartbg');
		/* a shallow folder uses fewer, wider rings so the chart still fills its circle */
		var deepest = 1; arcs.forEach(function (a) { if (a.ring > deepest) deepest = a.ring; });
		if (deepest < rings) { rings = deepest; dr = (R - r0) / rings; }
		for (var k = 0; k <= rings; k++) byRing.push([]);
		var topIx = new Map(); L.children(M, zoom).forEach(function (c, k2) { topIx.set(c, k2); });
		function topOf(i) { while (i >= 0 && M.parent[i] !== zoom) i = M.parent[i]; return i; }
		ctx.lineJoin = 'round';
		arcs.forEach(function (a) {
			byRing[a.ring].push(a);
			var ri = r0 + (a.ring - 1) * dr, ro = ri + dr - 0.5, s = a.a0 - Math.PI / 2, e = a.a1 - Math.PI / 2, col;
			if (a.i < 0) col = dark() ? '#4b5563' : '#cbd5e1';
			else if (P.col === 'type') col = typeCol(a.i, a.ring);
			else col = folderCol(hueOfTop(topIx.get(topOf(a.i)) || 0), a.ring, !M.isDir[a.i]);
			ctx.globalAlpha = a.i >= 0 && faded(a.i) ? 0.18 : 1;
			ctx.beginPath(); ctx.arc(cx, cy, ro, s, e); ctx.arc(cx, cy, ri, e, s, true); ctx.closePath();
			ctx.fillStyle = col; ctx.fill();
			if ((a.a1 - a.a0) * ro > 2.5) { ctx.globalAlpha = 1; ctx.strokeStyle = bg; ctx.lineWidth = 1; ctx.stroke(); }
		});
		ctx.globalAlpha = 1;
		/* labels on wide-enough arcs of the first two rings */
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		arcs.forEach(function (a) {
			if (a.i < 0 || a.ring > 2) return;
			var rm = r0 + (a.ring - 0.5) * dr, span = (a.a1 - a.a0) * rm;
			if (span < 46 || dr < 16) return;
			var m = (a.a0 + a.a1) / 2 - Math.PI / 2, x = cx + Math.cos(m) * rm, y = cy + Math.sin(m) * rm;
			var fs = Math.min(13, Math.max(10, dr * 0.32)); ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
			var label = fit(M.names[a.i], Math.min(span - 8, dr * 2.6), ctx);
			if (!label) return;
			ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.strokeText(label, x, y); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y);
		});
		/* middle: the folder shown */
		ctx.beginPath(); ctx.arc(cx, cy, r0 - 2, 0, Math.PI * 2); ctx.fillStyle = cssVar('--st-soft'); ctx.fill();
		ctx.fillStyle = cssVar('--st-fg'); ctx.font = '700 ' + Math.max(11, Math.min(18, r0 * 0.28)) + 'px system-ui, sans-serif';
		ctx.fillText(B(M.total[zoom]), cx, cy - (r0 > 40 ? 8 : 0));
		if (r0 > 40) { ctx.font = Math.max(10, Math.min(13, r0 * 0.2)) + 'px system-ui, sans-serif'; ctx.fillStyle = cssVar('--st-muted'); ctx.fillText(fit(zoom ? '⬆ ' + M.names[zoom] : M.names[zoom], r0 * 1.6, ctx), cx, cy + 12); }
		geo = { kind: 'sun', cx: cx, cy: cy, r0: r0, dr: dr, rings: rings, byRing: byRing };
	}
	function fit(text, maxW, c) {
		if (c.measureText(text).width <= maxW) return text;
		var t = String(text); while (t.length > 2 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
		return t.length > 2 ? t + '…' : '';
	}

	function drawTree() {
		var rects = [], ids = [], depthOf = [], budget = 60000, bg = cssVar('--st-chartbg'), dk = dark();
		var topIx = new Map(); L.children(M, zoom).forEach(function (c, k) { topIx.set(c, k); });
		ctx.font = '600 11px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
		function colOf(i, d, h) { return P.col === 'type' ? typeCol(i, d) : folderCol(h, d, !M.isDir[i]); }
		function rec(i, x, y, w, h, d, hue) {
			var ks = L.children(M, i), vals = new Array(ks.length);
			for (var k = 0; k < ks.length; k++) vals[k] = M.total[ks[k]];
			var rs = L.squarify(vals, x, y, w, h);
			for (k = 0; k < rs.length; k++) {
				var r = rs[k], c = ks[r.i], hh = d === 0 ? hueOfTop(topIx.get(c) || 0) : hue;
				if (r.w < 0.5 || r.h < 0.5) continue;
				var col = colOf(c, d + 1, hh), fd = faded(c);
				ctx.globalAlpha = fd ? 0.16 : 1;
				if (!M.isDir[c] && r.w * r.h > 500 && rects.length < 8000) {
					var g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
					g.addColorStop(0, shade(col, dk ? 0.18 : 0.28)); g.addColorStop(1, shade(col, -0.22)); ctx.fillStyle = g;
				} else ctx.fillStyle = col;
				ctx.fillRect(r.x, r.y, r.w, r.h);
				ctx.globalAlpha = 1;
				if (r.w > 3 && r.h > 3) { ctx.strokeStyle = bg; ctx.lineWidth = r.w > 12 && r.h > 12 ? 1 : 0.5; ctx.strokeRect(r.x + 0.25, r.y + 0.25, r.w - 0.5, r.h - 0.5); }
				rects.push(r.x, r.y, r.w, r.h); ids.push(c); depthOf.push(d + 1);
				if (M.isDir[c] && r.w >= 6 && r.h >= 6 && rects.length / 4 < budget && d < 30) {
					var hdr = r.h > 34 && r.w > 46 ? 15 : 0, pad = r.w > 20 && r.h > 20 ? 2 : 1;
					if (hdr) {
						ctx.fillStyle = shade(col, -0.18); ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, hdr - 1);
						var t = fit(M.names[c] + '  ' + B(M.total[c]), r.w - 8, ctx);
						if (t) { ctx.fillStyle = lightOf(col) > 0.55 ? '#111' : '#fff'; ctx.fillText(t, r.x + 4, r.y + hdr / 2 + 0.5); }
					}
					rec(c, r.x + pad, r.y + (hdr || pad), r.w - pad * 2, r.h - (hdr || pad) - pad, d + 1, hh);
				} else if (!M.isDir[c] && r.w > 60 && r.h > 18) {
					var t2 = fit(M.names[c], r.w - 8, ctx);
					if (t2) { ctx.fillStyle = lightOf(col) > 0.55 ? '#111' : '#fff'; ctx.fillText(t2, r.x + 4, r.y + 9); }
				}
			}
		}
		ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
		rec(zoom, 1, 1, W - 2, H - 2, 0, 0);
		geo = { kind: 'tree', rects: Float32Array.from(rects), ids: Int32Array.from(ids), depth: depthOf };
	}
	/* hsl()/hex colour -> lighter (+) or darker (-) */
	var colCache = new Map();
	function rgbOf(col) {
		var c = colCache.get(col); if (c) return c;
		var d = document.createElement('canvas').getContext('2d'); d.fillStyle = col; var s = d.fillStyle;
		if (s[0] === '#') c = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
		else { var m = s.match(/\d+(\.\d+)?/g) || [0, 0, 0]; c = [+m[0], +m[1], +m[2]]; }
		if (colCache.size > 4000) colCache.clear();
		colCache.set(col, c); return c;
	}
	function shade(col, f) { var c = rgbOf(col); return 'rgb(' + c.map(function (v) { return Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)); }).join(',') + ')'; }
	function lightOf(col) { var c = rgbOf(col); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

	/* hit testing */
	function hit(x, y) {
		if (!geo) return null;
		if (geo.kind === 'sun') {
			var dx = x - geo.cx, dy = y - geo.cy, r = Math.sqrt(dx * dx + dy * dy);
			if (r < geo.r0) return { center: true };
			var ring = Math.floor((r - geo.r0) / geo.dr) + 1; if (ring > geo.rings) return null;
			var a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2;
			var list = geo.byRing[ring], lo = 0, hi = list.length - 1, f = -1;
			while (lo <= hi) { var mid = (lo + hi) >> 1; if (list[mid].a0 <= a) { f = mid; lo = mid + 1; } else hi = mid - 1; }
			if (f < 0 || list[f].a1 < a) return null;
			return { arc: list[f], i: list[f].i };
		}
		var R = geo.rects;
		for (var k = geo.ids.length - 1; k >= 0; k--) {
			var x0 = R[k * 4], y0 = R[k * 4 + 1];
			if (x >= x0 && y >= y0 && x <= x0 + R[k * 4 + 2] && y <= y0 + R[k * 4 + 3]) return { i: geo.ids[k], k: k };
		}
		return null;
	}
	function outline(i, color, lw) {
		if (i < 0 || !geo) return;
		octx.strokeStyle = color; octx.lineWidth = lw;
		if (geo.kind === 'sun') {
			for (var ring = 1; ring <= geo.rings; ring++) geo.byRing[ring].forEach(function (a) {
				if (a.i !== i) return;
				var ri = geo.r0 + (a.ring - 1) * geo.dr, ro = ri + geo.dr - 0.5;
				octx.beginPath(); octx.arc(geo.cx, geo.cy, ro, a.a0 - Math.PI / 2, a.a1 - Math.PI / 2); octx.arc(geo.cx, geo.cy, ri, a.a1 - Math.PI / 2, a.a0 - Math.PI / 2, true); octx.closePath(); octx.stroke();
			});
		} else {
			for (var k = 0; k < geo.ids.length; k++) if (geo.ids[k] === i) { var R = geo.rects; octx.strokeRect(R[k * 4] + lw / 2, R[k * 4 + 1] + lw / 2, R[k * 4 + 2] - lw, R[k * 4 + 3] - lw); break; }
		}
	}
	function drawOverlay() {
		octx.clearRect(0, 0, W, H);
		var s = sel;
		/* a selected item hidden inside a merged / too-small piece: outline its nearest drawn ancestor */
		if (s >= 0 && geo) { var a = s; while (a >= 0 && !drawn(a)) a = M.parent[a]; s = a; }
		outline(s, cssVar('--st-sel'), 3);
		if (hover >= 0 && hover !== s) outline(hover, dark() ? '#fff' : '#111', 2);
	}
	function drawn(i) {
		if (geo.kind === 'sun') { for (var r = 1; r <= geo.rings; r++) for (var k = 0; k < geo.byRing[r].length; k++) if (geo.byRing[r][k].i === i) return true; return false; }
		for (var j = 0; j < geo.ids.length; j++) if (geo.ids[j] === i) return true; return false;
	}
	function tipFor(h, x, y) {
		var tip = $('st-tip');
		if (!h) { tip.hidden = true; return; }
		var html;
		if (h.center) html = zoom ? '<b>⬆ Up to ' + esc(M.names[M.parent[zoom]]) + '</b>' : '<b>' + esc(M.names[0]) + '</b><br>' + B(M.total[0]);
		else if (h.i < 0) html = '<b>' + N(h.arc.n) + ' smaller items</b><br>' + B((h.arc.a1 - h.arc.a0) / (Math.PI * 2) * M.total[zoom]) + ' together';
		else {
			var i = h.i, p = M.parent[i];
			html = '<b>' + (M.isDir[i] ? '📁 ' : '') + esc(M.names[i]) + '</b><br>' + B(M.total[i]) + ' · ' + L.fmtPct(L.pct(M.total[i], M.total[zoom])) + ' of ' + esc(M.names[zoom]) +
				(M.isDir[i] ? '<br>' + N(M.files[i]) + ' files' : '<br>' + esc(L.CATS[M.cat[i]].name) + (M.exts[M.extId[i]] ? ' (.' + esc(M.exts[M.extId[i]]) + ')' : '')) +
				(M.newest[i] > 0 ? '<br>Last changed ' + L.fmtDate(M.newest[i]) : '') +
				(p >= 0 && p !== zoom ? '<div class="st-tippath">in ' + esc(L.pathOf(M, p)) + '</div>' : '');
		}
		tip.innerHTML = html; tip.hidden = false;
		var tw = tip.offsetWidth, th = tip.offsetHeight;
		tip.style.left = Math.max(4, Math.min(W - tw - 4, x + 14)) + 'px';
		tip.style.top = Math.max(4, y + 16 + th > H ? y - th - 12 : y + 16) + 'px';
	}
	function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	cv.addEventListener('pointermove', function (e) {
		if (!M) return;
		var p = pos(e), h = hit(p.x, p.y), hv = h && h.i != null && h.i >= 0 ? h.i : -1;
		cv.style.cursor = h && (h.center && zoom || hv >= 0 && M.isDir[hv]) ? 'pointer' : 'default';
		if (hv !== hover) { hover = hv; drawOverlay(); }
		tipFor(h, p.x, p.y);
	});
	cv.addEventListener('pointerleave', function () { hover = -1; drawOverlay(); $('st-tip').hidden = true; });
	cv.addEventListener('click', function (e) {
		if (!M) return;
		var p = pos(e), h = hit(p.x, p.y), touch = lastPtr === 'touch' || lastPtr === 'pen';
		if (!h) return;
		if (h.center) { if (zoom) up(); return; }
		if (h.i < 0) { toast('Many small items. Zoom into the folder to see them, or use the table below.'); return; }
		/* mouse: a click on a folder zooms in. touch: the first tap selects (shows its size), a second tap zooms */
		if (M.isDir[h.i] && (!touch || sel === h.i)) { sel = -1; setZoom(h.i); tipFor(null); return; }
		sel = h.i; drawOverlay(); renderInfo(); markRow();
		if (touch) tipFor(h, p.x, p.y);
	});
	var lastPtr = 'mouse';
	cv.addEventListener('pointerdown', function (e) { lastPtr = e.pointerType || 'mouse'; });
	if (window.ResizeObserver) { var rT = 0; new ResizeObserver(function () { clearTimeout(rT); rT = setTimeout(drawChart, 60); }).observe(box); }
	new MutationObserver(function () { colCache.clear(); drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* the info panel beside the chart */
	function renderInfo() {
		var i = sel >= 0 ? sel : zoom, d = M.isDir[i], p = M.parent[i];
		var share = i === zoom ? (p >= 0 ? L.fmtPct(L.pct(M.total[i], M.total[p])) + ' of ' + esc(M.names[p]) : 'the folder you picked') : L.fmtPct(L.pct(M.total[i], M.total[zoom])) + ' of ' + esc(M.names[zoom]);
		$('st-info').innerHTML = '<h3>' + (d ? '📁 ' : fileIcon(i) + ' ') + esc(M.names[i]) + '</h3>' +
			'<div class="st-ibig">' + B(M.total[i]) + '</div>' +
			'<div>' + share + '</div>' +
			(d ? '<div>' + N(M.files[i]) + ' files · ' + N(M.dirs[i]) + ' folders</div>' : '<div>' + esc(L.CATS[M.cat[i]].name) + (M.exts[M.extId[i]] ? ' · .' + esc(M.exts[M.extId[i]]) : '') + ' · ' + N(M.size[i]) + ' bytes</div>') +
			(M.newest[i] > 0 ? '<div>' + (d ? 'Newest change ' : 'Last changed ') + L.fmtDate(M.newest[i]) + ' (' + L.ageText(M.newest[i], Date.now()) + ')</div>' : '') +
			'<div class="st-ipath">' + esc(L.pathOf(M, i)) + '</div>' +
			'<div class="tu-row">' +
			(d && i !== zoom ? '<button type="button" class="tu-btn st-small" data-act="zoom">Zoom in</button>' : '') +
			(i === zoom && zoom > 0 ? '<button type="button" class="tu-btn st-small" data-act="up">⬆ Up</button>' : '') +
			'<button type="button" class="tu-btn tu-btn--ghost st-small" data-act="copy">Copy path</button>' +
			(sel >= 0 ? '<button type="button" class="tu-btn tu-btn--ghost st-small" data-act="table">Show in table</button>' : '') + '</div>';
	}
	$('st-info').onclick = function (e) {
		var b = e.target.closest('[data-act]'); if (!b) return;
		var i = sel >= 0 ? sel : zoom, a = b.getAttribute('data-act');
		if (a === 'zoom') { sel = -1; setZoom(i); } else if (a === 'up') up(); else if (a === 'copy') copyPath(i);
		else if (a === 'table') { reveal(i); $('st-tablesec').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
	};
	function fileIcon(i) { return ['🎬', '🖼️', '🎵', '📄', '🗜️', '🧩', '📦', '🗄️', '📄'][M.cat[i]] || '📄'; }
	function copyPath(i) {
		var t = L.pathOf(M, i);
		function ok() { toast('Copied: ' + t + '. (The path starts at the folder you picked; browsers don\'t show where that folder is on your disk.)'); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { prompt('Copy this path:', t); });
		else prompt('Copy this path:', t);
	}

	/* legend */
	function renderLegend() {
		var el = $('st-legend');
		if (P.col === 'type') {
			var bt = L.byType(M, zoom);
			el.innerHTML = bt.cats.map(function (c) {
				return '<button type="button" data-cat="' + c.i + '" aria-pressed="' + (focusCat === c.i) + '"' + (focusCat >= 0 && focusCat !== c.i ? ' class="st-dim"' : '') + ' title="Show only ' + esc(c.name) + ' (click again for all)"><span class="st-sw" style="background:' + c.color + '"></span>' + esc(c.name) + ' · ' + B(c.bytes) + '</button>';
			}).join('');
		} else {
			var ks = L.children(M, zoom).slice(0, 10);
			el.innerHTML = ks.map(function (c, k) { return '<button type="button" data-zz="' + c + '"><span class="st-sw" style="background:' + folderCol(hueOfTop(k), 1, !M.isDir[c]) + '"></span>' + esc(M.names[c]) + ' · ' + B(M.total[c]) + '</button>'; }).join('');
		}
	}
	$('st-legend').onclick = function (e) {
		var b = e.target.closest('[data-cat]'), z = e.target.closest('[data-zz]');
		if (b) { var c = +b.getAttribute('data-cat'); focusCat = focusCat === c ? -1 : c; drawChart(); renderLegend(); }
		if (z) { var i = +z.getAttribute('data-zz'); if (M.isDir[i]) setZoom(i); else { sel = i; drawOverlay(); renderInfo(); } }
	};

	/* chart controls */
	function paintSeg() {
		[].forEach.call(document.querySelectorAll('#st [data-view]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === P.view); });
		[].forEach.call(document.querySelectorAll('#st [data-col]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-col') === P.col); });
		$('st-rings').value = P.rings; $('st-ringsv').textContent = P.rings;
	}
	document.querySelector('#st-chartsec').addEventListener('click', function (e) {
		var v = e.target.closest('[data-view]'), c = e.target.closest('[data-col]');
		if (v) { P.view = v.getAttribute('data-view'); save(); paintSeg(); drawChart(); }
		if (c) { P.col = c.getAttribute('data-col'); if (P.col !== 'type') focusCat = -1; save(); paintSeg(); drawChart(); renderLegend(); }
	});
	$('st-rings').oninput = function () { P.rings = +this.value; $('st-ringsv').textContent = P.rings; save(); drawChart(); };
	paintSeg();

	/* ---------- the tree table ---------- */
	var SORTS = {
		size: function (a, b) { return M.total[b] - M.total[a]; },
		name: function (a, b) { return M.names[a].localeCompare(M.names[b], undefined, { numeric: true, sensitivity: 'base' }); },
		files: function (a, b) { return M.files[b] - M.files[a] || M.total[b] - M.total[a]; },
		date: function (a, b) { return M.newest[b] - M.newest[a]; }
	};
	function sortedKids(i) {
		var ks = L.children(M, i);
		if (P.sort === 'size' && P.dir < 0) return ks;   // already biggest first
		ks.sort(SORTS[P.sort] || SORTS.size);
		if ((P.sort === 'name' ? 1 : -1) !== P.dir) ks.reverse();
		return ks;
	}
	function row(i, d) {
		var dirI = M.isDir[i], p = M.parent[i], pc = L.pct(M.total[i], M.total[p] || 1), open = expanded.has(i), kids = dirI ? M.start[i + 1] - M.start[i] : 0;
		return '<tr class="st-row' + (i === sel ? ' st-on' : '') + '" data-i="' + i + '"><td class="st-name"><div class="st-nm" style="padding-left:' + (d * 1.15).toFixed(2) + 'em">' +
			'<button type="button" class="st-tog" data-t="' + i + '"' + (kids ? ' aria-expanded="' + open + '" aria-label="' + (open ? 'Collapse ' : 'Expand ') + esc(M.names[i]) + '"' : ' disabled aria-hidden="true" tabindex="-1"') + '>' + (kids ? (open ? '▾' : '▸') : '') + '</button>' +
			'<span class="st-ico" aria-hidden="true">' + (dirI ? '📁' : fileIcon(i)) + '</span><button type="button" class="st-nlink" data-n="' + i + '">' + esc(M.names[i]) + '</button></div></td>' +
			'<td class="st-num">' + B(M.total[i]) + '</td>' +
			'<td class="st-pbarcell"><div class="st-bar"><i><b style="width:' + Math.min(100, pc).toFixed(2) + '%"></b></i><span>' + L.fmtPct(pc) + '</span></div></td>' +
			'<td class="st-num">' + (dirI ? N(M.files[i]) : '') + '</td>' +
			'<td class="st-num st-hidesm">' + L.fmtDate(M.newest[i]) + '</td></tr>';
	}
	function renderTable() {
		if ($('st-q').value.trim()) return renderSearch();
		var out = [], rows = 0, LIMIT = 4000;
		function rec(i, d) {
			var ks = sortedKids(i), lim = moreN.get(i) || 100;
			for (var k = 0; k < ks.length && k < lim; k++) {
				if (rows++ > LIMIT) return;
				out.push(row(ks[k], d));
				if (expanded.has(ks[k])) rec(ks[k], d + 1);
			}
			if (ks.length > lim) out.push('<tr class="st-more"><td colspan="5"><button type="button" data-more="' + i + '">Show ' + Math.min(200, ks.length - lim) + ' more of ' + N(ks.length - lim) + ' (in ' + esc(M.names[i]) + ')</button></td></tr>');
		}
		rec(zoom, 0);
		if (rows > LIMIT) out.push('<tr class="st-more"><td colspan="5">Many rows open. Collapse some folders, or zoom into a folder, to see the rest.</td></tr>');
		$('st-tbody').innerHTML = out.join('') || '<tr><td colspan="5" class="st-empty">This folder is empty.</td></tr>';
		$('st-qinfo').textContent = zoom ? 'Inside ' + M.names[zoom] : '';
		[].forEach.call(document.querySelectorAll('#st-tree th'), function (th) {
			var b = th.querySelector('[data-sort]'); if (!b) return;
			var on = b.getAttribute('data-sort') === P.sort && !th.classList.contains('st-thbar');
			if (on) th.setAttribute('aria-sort', P.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
		});
	}
	function markRow() {
		[].forEach.call(document.querySelectorAll('#st-tbody tr.st-on'), function (r) { r.classList.remove('st-on'); });
		var r = document.querySelector('#st-tbody tr[data-i="' + sel + '"]'); if (r) r.classList.add('st-on');
	}
	$('st-tbody').onclick = function (e) {
		var t = e.target.closest('[data-t]'), n = e.target.closest('[data-n]'), more = e.target.closest('[data-more]'), rv = e.target.closest('[data-reveal]');
		if (more) { var mi = +more.getAttribute('data-more'); moreN.set(mi, (moreN.get(mi) || 100) + 200); renderTable(); return; }
		if (rv) { $('st-q').value = ''; reveal(+rv.getAttribute('data-reveal')); return; }
		if (t) { var i = +t.getAttribute('data-t'); if (expanded.has(i)) expanded.delete(i); else expanded.add(i); renderTable(); return; }
		if (n) {
			var j = +n.getAttribute('data-n');
			sel = j; if (M.isDir[j]) { if (expanded.has(j)) expanded.delete(j); else expanded.add(j); renderTable(); } else markRow();
			drawOverlay(); renderInfo();
		}
	};
	$('st-tbody').addEventListener('dblclick', function (e) { var n = e.target.closest('[data-n]'); if (n && M.isDir[+n.getAttribute('data-n')]) { sel = -1; setZoom(+n.getAttribute('data-n')); } });
	document.querySelector('#st-tree thead').onclick = function (e) {
		var b = e.target.closest('[data-sort]'); if (!b) return;
		var s = b.getAttribute('data-sort');
		if (P.sort === s) P.dir = -P.dir; else { P.sort = s; P.dir = s === 'name' ? 1 : -1; }
		save(); renderTable();
	};
	$('st-collapse').onclick = function () { expanded.clear(); moreN.clear(); renderTable(); };
	var qT = 0; $('st-q').oninput = function () { clearTimeout(qT); qT = setTimeout(renderTable, 180); };
	function renderSearch() {
		var r = L.search(M, $('st-q').value, 300, 0);
		$('st-qinfo').textContent = r.count ? N(r.count) + ' match' + (r.count > 1 ? 'es' : '') + (r.count > 300 ? ' (the 300 biggest shown)' : '') : 'No matches';
		$('st-tbody').innerHTML = r.ids.map(function (i) {
			var p = M.parent[i];
			return '<tr class="st-row" data-i="' + i + '"><td class="st-name"><div class="st-nm"><span class="st-ico" aria-hidden="true">' + (M.isDir[i] ? '📁' : fileIcon(i)) + '</span><span><button type="button" class="st-nlink" data-reveal="' + i + '">' + esc(M.names[i]) + '</button><span class="st-pathsm">' + esc(p >= 0 ? L.pathOf(M, p) : '') + '</span></span></div></td>' +
				'<td class="st-num">' + B(M.total[i]) + '</td><td class="st-pbarcell"><div class="st-bar"><i><b style="width:' + Math.min(100, L.pct(M.total[i], M.total[0])).toFixed(2) + '%"></b></i><span>' + L.fmtPct(L.pct(M.total[i], M.total[0])) + '</span></div></td>' +
				'<td class="st-num">' + (M.isDir[i] ? N(M.files[i]) : '') + '</td><td class="st-num st-hidesm">' + L.fmtDate(M.newest[i]) + '</td></tr>';
		}).join('') || '<tr><td colspan="5" class="st-empty">Nothing matches. Try part of a name, or *.mp4 for a type.</td></tr>';
	}

	/* ---------- lists ---------- */
	function setTab(t) { P.tab = t; save(); renderList(); }
	$('st-tabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.getAttribute('data-tab')); };
	function itemCell(i, base) {
		var p = M.parent[i];
		return '<button type="button" class="st-linkbtn" data-reveal="' + i + '">' + (M.isDir[i] ? '📁 ' : fileIcon(i) + ' ') + esc(M.names[i]) + '</button><button type="button" class="st-copy" data-copy="' + i + '" title="Copy the path">Copy path</button>' +
			'<span class="st-pathsm">' + esc(p >= 0 ? L.pathOf(M, p) : '') + '</span>';
	}
	function sel_(id, opts, v) { return '<select class="tu-select" id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; }
	function renderList() {
		if (!M) return;
		[].forEach.call(document.querySelectorAll('#st-tabs [data-tab]'), function (b) { var on = b.getAttribute('data-tab') === P.tab; b.setAttribute('aria-selected', on); b.setAttribute('aria-pressed', on); });
		var er = document.querySelector('#st-tabs [data-tab="err"]'); er.textContent = 'Couldn\'t read' + (M.errors.length ? ' (' + N(M.errors.length) + ')' : '');
		$('st-scope').innerHTML = P.tab === 'err' ? 'Whole scan.' : 'Inside <b>' + esc(L.pathOf(M, zoom)) + '</b> (' + B(M.total[zoom]) + '). Zoom the chart into a folder to narrow these lists.';
		var el = $('st-panel'), now = Date.now(), tot = M.total[zoom] || 1, h = '';
		if (P.tab === 'big') {
			var big = L.largestFiles(M, 50, zoom);
			h = big.length ? '<div class="tu-table-wrap"><table class="tu-table st-ltbl"><thead><tr><th>#</th><th>File</th><th class="st-num">Size</th><th class="st-num">Share</th><th class="st-num">Last changed</th></tr></thead><tbody>' +
				big.map(function (i, k) { return '<tr><td>' + (k + 1) + '</td><td>' + itemCell(i) + '</td><td class="st-num">' + B(M.size[i]) + '</td><td class="st-num">' + L.fmtPct(L.pct(M.size[i], tot)) + '</td><td class="st-num">' + L.fmtDate(M.mtime[i]) + '</td></tr>'; }).join('') +
				'</tbody></table></div>' : '<p class="st-empty">No files here.</p>';
		} else if (P.tab === 'types') {
			var bt = L.byType(M, zoom), mx = bt.cats.length ? bt.cats[0].bytes : 1;
			h = '<div class="st-stack" role="img" aria-label="Share of each file type">' + bt.cats.map(function (c) { return '<span title="' + esc(c.name) + ' ' + B(c.bytes) + '" style="background:' + c.color + ';width:' + L.pct(c.bytes, tot).toFixed(3) + '%"></span>'; }).join('') + '</div>' +
				'<div class="st-catbars">' + bt.cats.map(function (c) {
					return '<button type="button" class="st-cb" data-fcat="' + c.i + '" title="Colour the chart by type and show only ' + esc(c.name) + '"><span><span class="st-sw" style="background:' + c.color + '"></span> ' + esc(c.name) + '</span><i><b style="background:' + c.color + ';width:' + L.pct(c.bytes, mx).toFixed(2) + '%"></b></i><small>' + B(c.bytes) + ' · ' + L.fmtPct(L.pct(c.bytes, tot)) + ' · ' + N(c.count) + ' files</small></button>';
				}).join('') + '</div>' +
				'<div class="tu-table-wrap"><table class="tu-table st-ltbl"><thead><tr><th>Extension</th><th>Type</th><th class="st-num">Files</th><th class="st-num">Size</th><th class="st-num">Share</th><th>Biggest</th></tr></thead><tbody>' +
				bt.exts.slice(0, 80).map(function (x) {
					return '<tr><td><button type="button" class="st-linkbtn" data-ext="' + esc(x.ext) + '" title="List these files">' + (x.ext ? '.' + esc(x.ext) : '(no extension)') + '</button></td><td><span class="st-sw" style="background:' + L.CATS[x.cat].color + '"></span> ' + esc(L.CATS[x.cat].name) + '</td><td class="st-num">' + N(x.count) + '</td><td class="st-num">' + B(x.bytes) + '</td><td class="st-num">' + L.fmtPct(L.pct(x.bytes, tot)) + '</td><td>' + itemCell(x.biggest) + '</td></tr>';
				}).join('') + '</tbody></table></div>' + (bt.exts.length > 80 ? '<p class="tu-note">' + N(bt.exts.length - 80) + ' more extensions not shown.</p>' : '');
		} else if (P.tab === 'old') {
			var ol = L.oldLarge(M, P.oldMin, P.oldDays, now, 200, zoom);
			h = '<div class="st-ctl"><div class="tu-field tu-field--sm"><label class="tu-label" for="st-omin">Bigger than</label>' + sel_('st-omin', [[1e6, '1 MB'], [10e6, '10 MB'], [100e6, '100 MB'], [500e6, '500 MB'], [1e9, '1 GB']], P.oldMin) + '</div>' +
				'<div class="tu-field tu-field--sm"><label class="tu-label" for="st-odays">Not changed for</label>' + sel_('st-odays', [[90, '3 months'], [182, '6 months'], [365, '1 year'], [730, '2 years'], [1826, '5 years']], P.oldDays) + '</div></div>' +
				'<p><b>' + N(ol.count) + ' files, ' + B(ol.bytes) + '</b> (' + L.fmtPct(L.pct(ol.bytes, tot)) + ' of this folder). "Changed" means modified: browsers can\'t see when a file was last opened.</p>' +
				(ol.top.length ? '<div class="tu-table-wrap"><table class="tu-table st-ltbl"><thead><tr><th>File</th><th class="st-num">Size</th><th class="st-num">Last changed</th></tr></thead><tbody>' +
					ol.top.map(function (i) { return '<tr><td>' + itemCell(i) + '</td><td class="st-num">' + B(M.size[i]) + '</td><td class="st-num">' + L.fmtDate(M.mtime[i]) + '<span class="st-pathsm">' + L.ageText(M.mtime[i], now) + '</span></td></tr>'; }).join('') +
					'</tbody></table></div>' + (ol.count > 200 ? '<p class="tu-note">The 200 biggest are shown.</p>' : '') : '<p class="st-empty">None. Try a smaller size or a shorter time.</p>');
		} else if (P.tab === 'dup') h = dupHtml();
		else if (P.tab === 'empty') {
			var em = L.emptyFolders(M, zoom);
			h = (mode === 'paths' && !(src && src.kind === 'drop') ? '<p class="tu-note">This browser\'s folder picker leaves empty folders out, so none can be listed. Chrome or Edge on a computer, or dragging the folder onto the page, can show them.</p>' : '') +
				(em.length ? '<p>' + N(em.length) + ' folder' + (em.length > 1 ? 's have' : ' has') + ' no files inside (sub-folders included). They take almost no space, but can be clutter.</p><div class="tu-table-wrap"><table class="tu-table st-ltbl"><thead><tr><th>Folder</th><th class="st-num">Folders inside</th></tr></thead><tbody>' +
					em.slice(0, 500).map(function (i) { return '<tr><td>' + itemCell(i) + '</td><td class="st-num">' + N(M.dirs[i]) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="st-empty">No empty folders found.</p>');
		} else if (P.tab === 'err') {
			h = M.errors.length ? '<p>These were skipped and are not in the totals. Folders usually say "no permission" when they belong to the system or another user.</p><div class="tu-table-wrap"><table class="tu-table st-ltbl"><thead><tr><th>Path</th><th>Why</th></tr></thead><tbody>' +
				M.errors.slice(0, 1000).map(function (x) { return '<tr><td style="word-break:break-all">' + esc(x.path) + '</td><td>' + esc(x.why) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="st-empty">Everything could be read.</p>';
		}
		el.innerHTML = h;
		var om = $('st-omin'), od = $('st-odays'), dm = $('st-dmin');
		if (om) om.onchange = function () { P.oldMin = +this.value; save(); renderList(); };
		if (od) od.onchange = function () { P.oldDays = +this.value; save(); renderList(); };
		if (dm) dm.onchange = function () { P.dupMin = +this.value; save(); renderList(); };
	}
	$('st-panel').onclick = function (e) {
		var rv = e.target.closest('[data-reveal]'), cp = e.target.closest('[data-copy]'), fc = e.target.closest('[data-fcat]'), ex = e.target.closest('[data-ext]'), hb = e.target.closest('#st-hash'), hc = e.target.closest('#st-hashstop');
		if (rv) { reveal(+rv.getAttribute('data-reveal')); $('st-chartsec').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
		else if (cp) copyPath(+cp.getAttribute('data-copy'));
		else if (fc) { focusCat = +fc.getAttribute('data-fcat'); P.col = 'type'; save(); paintSeg(); drawChart(); renderLegend(); $('st-chartsec').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
		else if (ex) { var x = ex.getAttribute('data-ext'); $('st-q').value = x ? '*.' + x : ''; renderTable(); $('st-tablesec').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
		else if (hb) startHash();
		else if (hc && hashRun) hashRun.stop = true;
	};

	/* ---------- duplicates ---------- */
	var BIG_FILE = 512e6, SAMPLE = 8e6;
	function groupsNow() { return L.sameSizeGroups(M, P.dupMin, zoom); }
	function dupHtml() {
		var gs = groupsNow(), waste = 0, files = 0;
		gs.forEach(function (g) { waste += g.waste; files += g.ids.length; });
		var h = '<div class="st-ctl"><div class="tu-field tu-field--sm"><label class="tu-label" for="st-dmin">Files at least</label>' + sel_('st-dmin', [[1, 'any size'], [100e3, '100 KB'], [1e6, '1 MB'], [10e6, '10 MB'], [100e6, '100 MB']], P.dupMin) + '</div></div>';
		if (!gs.length) return h + '<p class="st-empty">No two files here have exactly the same size, so there are no duplicates.</p>';
		var checked = hashRun && hashRun.done && hashRun.zoom === zoom && hashRun.min === P.dupMin;
		if (checked) {
			var conf = [];
			gs.forEach(function (g) { conf = conf.concat(L.splitByHash(g, hashes)); });
			conf.sort(function (a, b) { return b.waste - a.waste; });
			var cw = 0; conf.forEach(function (g) { cw += g.waste; });
			h += '<p><b>' + N(conf.length) + (conf.length === 1 ? ' set' : ' sets') + ' of identical files</b> (same SHA-256 fingerprint). Keeping one of each would free <b>' + B(cw) + '</b>.' + (hashRun.sampled ? ' Files marked "probably" are over 512 MB and were compared by their size plus first and last 8 MB.' : '') + (hashRun.failed ? ' ' + N(hashRun.failed) + ' files could not be read and were left out.' : '') + '</p>' +
				conf.slice(0, 200).map(groupHtml).join('') + (conf.length > 200 ? '<p class="tu-note">The 200 biggest sets are shown.</p>' : '');
			return h + '<div class="tu-row"><button type="button" class="tu-btn tu-btn--ghost" id="st-hash">Check again</button></div>';
		}
		h += '<p><b>' + N(gs.length) + (gs.length === 1 ? ' set</b> of files has' : ' sets</b> of files have') + ' exactly the same size (' + N(files) + ' files). If they are copies, keeping one of each would free up to <b>' + B(waste) + '</b>. Same size doesn\'t prove same contents:</p>';
		if (hashRun && !hashRun.done) h += '<div class="st-hashbar"><b id="st-hashfill"></b></div><p id="st-hashtxt" class="tu-note">Reading…</p><div class="tu-row"><button type="button" class="tu-btn tu-btn--ghost" id="st-hashstop">Stop</button></div>';
		else if (mode === 'demo') h += '<p class="tu-note">The made-up example has no real files to read, so contents can\'t be checked. Scan a real folder to try it.</p>';
		else h += '<div class="tu-row"><button type="button" class="tu-btn tu-btn--primary" id="st-hash">Check contents (reads these files)</button></div><p class="tu-note">This reads the ' + N(files) + ' files above (' + B(totalOf(gs)) + ') on your computer to compare fingerprints. Nothing is uploaded. Big folders can take a while.</p>';
		return h + gs.slice(0, 150).map(groupHtml).join('') + (gs.length > 150 ? '<p class="tu-note">The 150 biggest sets are shown.</p>' : '');
	}
	function totalOf(gs) { var t = 0; gs.forEach(function (g) { t += g.size * g.ids.length; }); return t; }
	function groupHtml(g) {
		var prob = g.hash && g.hash.indexOf('p:') === 0;
		return '<div class="st-dupg"><h4>' + N(g.ids.length) + ' × ' + B(g.size) + (g.hash ? ' <span class="st-tag">' + (prob ? 'probably identical' : 'identical') + '</span>' : '') + ' <small class="st-pathsm" style="display:inline">could free ' + B(g.waste) + '</small></h4><ul>' +
			g.ids.slice(0, 30).map(function (i) { return '<li>' + itemCell(i) + '</li>'; }).join('') + (g.ids.length > 30 ? '<li>… and ' + N(g.ids.length - 30) + ' more</li>' : '') + '</ul></div>';
	}
	function hex(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; }
	async function hashFile(f) {
		if (f.size <= BIG_FILE) return hex(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()));
		var a = new Uint8Array(await f.slice(0, SAMPLE).arrayBuffer()), b = new Uint8Array(await f.slice(f.size - SAMPLE).arrayBuffer()), c = new Uint8Array(a.length + b.length + 16);
		c.set(a); c.set(b, a.length); new DataView(c.buffer).setFloat64(a.length + b.length, f.size);
		return 'p:' + hex(await crypto.subtle.digest('SHA-256', c));
	}
	async function startHash() {
		if (!crypto || !crypto.subtle) { toast('This browser can\'t compute fingerprints here (needs a secure https page).'); return; }
		var gs = groupsNow(), list = [], total = 0;
		gs.forEach(function (g) { g.ids.forEach(function (i) { list.push(i); total += Math.min(g.size, g.size > BIG_FILE ? SAMPLE * 2 : g.size); }); });
		var run = hashRun = { done: false, stop: false, zoom: zoom, min: P.dupMin, sampled: false, failed: 0 };
		hashes = {};
		renderList();
		var doneB = 0, t1 = Date.now();
		for (var k = 0; k < list.length; k++) {
			if (run.stop || hashRun !== run) break;
			var i = list[k], f = M.fileObj[i];
			try { if (!f) throw new Error('no file'); hashes[i] = await hashFile(f); if (f.size > BIG_FILE) run.sampled = true; }
			catch (e) { hashes[i] = null; run.failed++; }
			doneB += Math.min(M.size[i], M.size[i] > BIG_FILE ? SAMPLE * 2 : M.size[i]);
			var fill = $('st-hashfill'), txt = $('st-hashtxt');
			if (fill) fill.style.width = (doneB / (total || 1) * 100).toFixed(1) + '%';
			if (txt) txt.textContent = 'Read ' + N(k + 1) + ' of ' + N(list.length) + ' files (' + B(doneB) + ' of ' + B(total) + ', ' + Math.round((Date.now() - t1) / 1000) + ' s)…';
		}
		if (hashRun !== run) return;
		if (run.stop) { hashRun = null; toast('Stopped. Nothing was compared.'); }
		else run.done = true;
		if (P.tab === 'dup') renderList();
	}

	/* ---------- reports ---------- */
	function download(name, text, type) {
		var a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: type }));
		a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
	}
	function base() { return 'storage-' + String(M.names[0]).replace(/[^\w.-]+/g, '-').slice(0, 40) + '-' + L.fmtDate(Date.now()); }
	$('st-csv').onclick = function () { if (M) download(base() + '.csv', '﻿' + L.toCSV(M, 0, false), 'text/csv'); };
	$('st-csvd').onclick = function () { if (M) download(base() + '-folders.csv', '﻿' + L.toCSV(M, 0, true), 'text/csv'); };
	$('st-json').onclick = function () { if (M) download(base() + '.json', JSON.stringify(L.toJSON(M, 0, 6, Date.now()), null, 1), 'application/json'); };

	/* ---------- browser quota (NOT disk space) ---------- */
	$('st-est').onclick = function () {
		var o = $('st-estout');
		if (!navigator.storage || !navigator.storage.estimate) { o.textContent = 'This browser doesn\'t report it.'; return; }
		navigator.storage.estimate().then(function (e) {
			o.innerHTML = 'Websites may store up to about <b>' + B(e.quota || 0) + '</b> in this browser, and this site uses <b>' + B(e.usage || 0) + '</b>. This is a browser limit for website data, often worked out from the disk size, and is <b>not</b> your free disk space.';
		}, function () { o.textContent = 'The browser didn\'t answer.'; });
	};

	/* ---------- Fill window / Full screen ---------- */
	(function panels() {
		if (!window.MESPanel) { if (document.readyState !== 'complete') return void setTimeout(panels, 200); return; }
		window.MESPanel.add($('st-chartsec'), { bar: $('st-cbtns'), onChange: function () { setTimeout(drawChart, 40); } });
		window.MESPanel.add($('st-tablesec'), { bar: $('st-tbtns') });
		window.MESPanel.add($('st-listsec'), { bar: $('st-lbtns') });
	})();

	/* testing hook (?debug=1): window.MESStorageDebug */
	if (/[?&]debug=1/.test(location.search)) window.MESStorageDebug = { model: function () { return M; }, finish: finish, demoRaw: demoRaw, fromPaths: L.fromPaths, state: function () { return { zoom: zoom, sel: sel, P: P, geo: geo && geo.kind }; }, setZoom: setZoom, hit: hit };
})();
