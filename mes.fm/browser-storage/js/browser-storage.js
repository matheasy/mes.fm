/* MES Browser Storage & Memory: pure helpers (no DOM). window.MESBS; node: require('./lib.js').
   A web page can only see the storage of its own site (mes.fm), so every function here is about
   naming, sizing and grouping what mes.fm keeps in this browser. */
(function (root) {
	'use strict';
	var BS = {};

	BS.fmt = function (n, unknown) {
		if (n == null || !isFinite(n)) return unknown || '?';
		if (n < 1000) return Math.round(n) + ' B';
		var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
		do { n /= 1000; i++; } while (n >= 1000 && i < u.length - 1);
		return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u[i];
	};
	BS.pct = function (a, b) { if (!b) return '0%'; var p = a / b * 100; return (p > 0 && p < 0.1 ? '<0.1' : p < 10 ? p.toFixed(1) : Math.round(p)) + '%'; };

	/* localStorage / sessionStorage count UTF-16 code units, 2 bytes each (key + value) */
	BS.strBytes = function (s) { return s == null ? 0 : String(s).length * 2; };

	/* Rough size of a value as IndexedDB would store it (structured clone). Blobs / files count their
	   own size without being read. Stops after `limit` nodes so a giant object can't hang the page. */
	BS.sizeOf = function (v, limit) {
		var seen = typeof Set === 'function' ? new Set() : null, left = limit || 200000, total = 0, stack = [v];
		while (stack.length && left-- > 0) {
			var x = stack.pop(), t = typeof x;
			if (x == null) { total += 1; continue; }
			if (t === 'string') { total += x.length * 2; continue; }
			if (t === 'number') { total += 8; continue; }
			if (t === 'boolean') { total += 1; continue; }
			if (t === 'bigint') { total += 16; continue; }
			if (t !== 'object') continue;
			if (seen) { if (seen.has(x)) continue; seen.add(x); }
			if (typeof Blob !== 'undefined' && x instanceof Blob) { total += x.size; continue; }
			if (typeof ArrayBuffer !== 'undefined') {
				if (x instanceof ArrayBuffer) { total += x.byteLength; continue; }
				if (ArrayBuffer.isView && ArrayBuffer.isView(x)) { total += x.byteLength; continue; }
			}
			if (x instanceof Date) { total += 8; continue; }
			if (typeof ImageData !== 'undefined' && x instanceof ImageData) { total += x.data.byteLength; continue; }
			if (typeof Map !== 'undefined' && x instanceof Map) { x.forEach(function (val, k) { stack.push(k, val); }); total += 8; continue; }
			if (typeof Set !== 'undefined' && x instanceof Set) { x.forEach(function (val) { stack.push(val); }); total += 8; continue; }
			if (Array.isArray(x)) { total += 8; for (var i = 0; i < x.length; i++) stack.push(x[i]); continue; }
			total += 8;
			for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) { total += k.length * 2; stack.push(x[k]); }
		}
		return total;
	};

	/* ---------- who owns a piece of data ---------- */
	/* key word after "mes-" (before ":") -> page. Only names whose page differs from "/<word>". */
	BS.ALIAS = {
		'photo-editor': '/photo', 'photo-editor-models': '/photo', 'photo-folder': '/photo', 'photo-move': '/photo', 'photo-open': '/photo', 'photo-proj': '/photo', 'photo-projdir': '/photo', 'photo-psd': '/photo',
		'video-editor': '/video', 'copytext': '/copy-text', 'copytext-sync': '/copy-text', 'copy-text': '/copy-text',
		'graph2d': '/2d-graphing-calculator', 'graph3d': '/3d-graphing-calculator', 'typingtest': '/typing-test', 'transcribe': '/typing-test-transcribe',
		'voicetest': '/typing-test-voice', 'cycle': '/ovulation-calculator', 'feedlog': '/baby-feeding-log', 'growth': '/baby-growth-percentile-calculator',
		'contractions': '/contraction-timer', 'days': '/days-between-dates-calculator', 'matrix': '/matrix-calculator', 'cas': '/cas-calculator',
		'derivative': '/derivative-calculator', 'integral': '/integral-calculator', 'nn-playground': '/neural-network-playground', 'compressor': '/compress',
		'videocompressor': '/compress-video', 'dash': '/dashboard', 'gsc': '/search-console', 'image-search': '/reverse-image-search',
		'weighted-average': '/gradecalculator/weighted-average-calculator', 'picks': '/nba-picks', 'adfree': '/premium', 'pdf-editor': '/pdf',
		'dictionary-words': '/define', 'electromagnetic-fields': '/electromagnetic-fields-simulator', 'excel': '/excel', 'latex-ocr-models': '/latex',
		'readaloud': '/read-aloud', 'speedreader': '/speedreader', 'chart-notes': '/search-console', 'rating': '/ratings', 'fav': '/fav', 'search': '/search'
	};
	/* names that belong to the whole site, not one tool */
	BS.SHARED = {
		'denoise-models': ['Noise removal model (Audio & Video editors)', '/audio'],
		'handoff': ['Pictures passed between tools', '/photo'],
		'hive-user': ['Hive login', ''], 'hive-has': ['Hive login (phone app)', ''], 'hive-store': ['Hive backups (list cache)', '/copy-text'],
		'hive-sort': ['Hive comments', ''], 'hive-tabs': ['Hive comments', ''], 'hive-vw': ['Hive comments', ''], 'hive-comments': ['Hive comments', ''],
		'linkpref': ['Site settings', ''], 'when': ['Site settings', ''], 'time24': ['Site settings', ''], 'owner': ['Site settings', ''],
		'stage': ['Simulator box sizes', ''], 'inlhide': ['Simulator box sizes', ''], 'fillpanel': ['Simulator box sizes', ''],
		'hubview': ['Site settings', ''], 'rowprefs': ['Site settings', ''], 'adv': ['Visit statistics (ads)', ''], 'ads-quiet': ['Site settings', ''],
		'text-scale': ['Site settings', ''], 'readaloud': ['Read aloud (site button)', ''], 'premium-mock': ['Premium', '/premium']
	};
	/* well-known keys without the "mes-" prefix */
	BS.PLAIN = [
		[/^(pageMode|pageWide|theme|articleFontScale|asideSide|asideHidden|asideForce|tocHidden|hdrPins|hdrBar|hdrMore|statsPicks)$/, 'Site settings', ''],
		[/^pc[A-Z]|^pcLayout$|^(android|pct)AppBannerHidden$/, '', '/percentagecalculator'],
		[/AppBannerHidden$/, 'Site settings', ''],
		[/^keyval-store$/, 'Text recognition languages (Image to Text, Translate, Font Finder)', '/image-to-text'],
		[/^transformers-cache$/, 'AI models (Photo Editor)', '/photo'],
		[/^onnxruntime/, 'AI models (Photo Editor)', '/photo'],
		[/^lscache|^_grecaptcha|^google/, 'Other (ads / third-party)', ''],
		[/^(fastcomments|fc_)/i, 'Comments (FastComments)', '']
	];

	function titleCase(w) { return w.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

	/* name -> {tool, path}. `titles` = {"/path": "Page title"} from the site search index (optional). */
	BS.owner = function (name, titles) {
		titles = titles || {};
		name = String(name || '');
		var nm = function (path, fallback) { return { tool: (path && titles[path]) || fallback || (path ? titleCase(path.split('/').pop()) : 'Other'), path: path || '' }; };
		var m = /^mes-([a-z0-9-]+?)(?:[:.]|$)/i.exec(name) || /^mes-([a-z0-9-]+)/i.exec(name);
		if (m) {
			var w = m[1].toLowerCase().replace(/-+$/, '');
			if (BS.SHARED[w]) return { tool: BS.SHARED[w][0], path: BS.SHARED[w][1] };
			if (BS.ALIAS[w]) return nm(BS.ALIAS[w]);
			/* try "/word", then drop trailing "-part"s ("mes-photo-editor-models" -> "/photo-editor") */
			var parts = w.split('-');
			for (var n = parts.length; n > 0; n--) {
				var p = '/' + parts.slice(0, n).join('-');
				if (titles[p]) return nm(p);
				if (BS.ALIAS[parts.slice(0, n).join('-')]) return nm(BS.ALIAS[parts.slice(0, n).join('-')]);
			}
			return nm('/' + w, titleCase(w));
		}
		for (var i = 0; i < BS.PLAIN.length; i++) if (BS.PLAIN[i][0].test(name)) return BS.PLAIN[i][2] && !BS.PLAIN[i][1] ? nm(BS.PLAIN[i][2]) : { tool: BS.PLAIN[i][1], path: BS.PLAIN[i][2] };
		return { tool: 'Other', path: '' };
	};

	/* items [{kind, name, size, n, owner:{tool,path}}] -> groups sorted by size */
	BS.group = function (items) {
		var by = {}, out = [];
		items.forEach(function (it) {
			var k = it.owner.tool + '|' + it.owner.path;
			if (!by[k]) { by[k] = { tool: it.owner.tool, path: it.owner.path, size: 0, items: [], kinds: {}, partial: false }; out.push(by[k]); }
			var g = by[k]; g.items.push(it); g.size += it.size || 0; g.kinds[it.kind] = 1; if (it.partial || it.size == null) g.partial = true;
		});
		out.forEach(function (g) { g.items.sort(function (a, b) { return (b.size || 0) - (a.size || 0); }); });
		return out.sort(function (a, b) { return b.size - a.size || (a.tool < b.tool ? -1 : 1); });
	};

	BS.KINDS = {
		ls: ['Saved settings', 'localStorage: small text the page reads at once. Kept until you clear site data.'],
		ss: ['This tab only', 'sessionStorage: forgotten when this tab is closed.'],
		idb: ['Database', 'IndexedDB: files, projects and autosaves.'],
		cache: ['Downloaded files', 'Cache storage: big files kept so they need not download again (AI models, for example).'],
		opfs: ['Private files', 'Origin private file system: files a page keeps for itself.'],
		cookie: ['Cookie', 'Cookies this page can see (cookies marked HttpOnly are hidden from pages).'],
		sw: ['Background helper', 'Service worker registration.']
	};

	/* navigator.storage.estimate() -> parts for the bar (Chrome adds usageDetails) */
	BS.quota = function (e) {
		e = e || {};
		var usage = e.usage || 0, quota = e.quota || 0, d = e.usageDetails || null, parts = [];
		if (d) {
			var names = { indexedDB: 'Databases', caches: 'Downloaded files', serviceWorkerRegistrations: 'Background helpers', fileSystem: 'Private files' };
			Object.keys(d).forEach(function (k) { if (d[k] > 0) parts.push({ key: k, label: names[k] || k, size: d[k] }); });
			parts.sort(function (a, b) { return b.size - a.size; });
		}
		return { usage: usage, quota: quota, free: Math.max(0, quota - usage), parts: parts, frac: quota ? usage / quota : 0 };
	};

	/* which browser, for the "see every site" guide */
	BS.browser = function (ua, brands) {
		ua = ua || '';
		var b = (brands || []).map(function (x) { return x.brand; }).join(' ');
		if (/Brave/.test(b) || /Brave/.test(ua)) return 'brave';
		if (/Edg\//.test(ua) || /Edge/.test(b)) return 'edge';
		if (/OPR\/|Opera/.test(ua) || /Opera/.test(b)) return 'opera';
		if (/Vivaldi/.test(ua)) return 'vivaldi';
		if (/Firefox\//.test(ua)) return 'firefox';
		if (/Chrome\/|CriOS/.test(ua)) return 'chrome';
		if (/Safari\//.test(ua)) return 'safari';
		return 'other';
	};
	BS.GUIDE = {
		chrome: { name: 'Chrome', data: 'chrome://settings/content/all', mem: 'Press Shift+Esc (or ⋮ > More tools > Task manager) to see the memory of every tab and extension.', dev: 'chrome://settings/clearBrowserData' },
		brave: { name: 'Brave', data: 'brave://settings/content/all', mem: 'Press Shift+Esc (or ☰ > More tools > Task manager).', dev: 'brave://settings/clearBrowserData' },
		edge: { name: 'Edge', data: 'edge://settings/content/all', mem: 'Press Shift+Esc (or … > More tools > Browser task manager).', dev: 'edge://settings/clearBrowserData' },
		opera: { name: 'Opera', data: 'opera://settings/content/all', mem: 'Press Shift+Esc for Opera\'s task manager.', dev: 'opera://settings/clearBrowserData' },
		vivaldi: { name: 'Vivaldi', data: 'vivaldi://settings/content/all', mem: 'Press Shift+Esc for the task manager.', dev: 'vivaldi://settings/clearBrowserData' },
		firefox: { name: 'Firefox', data: 'about:preferences#privacy', dataHow: 'Cookies and Site Data > Manage Data… lists every site with its size.', mem: 'Open about:processes for memory per tab, or about:memory for the details.', dev: 'about:preferences#privacy' },
		safari: { name: 'Safari', data: '', dataHow: 'Safari > Settings > Privacy > Manage Website Data… (sizes are not shown; Develop > Show Web Inspector > Storage shows this site\'s).', mem: 'Open Activity Monitor (macOS) and look for "Safari Web Content" or the site name.', dev: '' },
		other: { name: 'your browser', data: '', dataHow: 'Look in the browser\'s settings under Privacy > Site data (or Cookies and site data).', mem: 'Use the browser\'s task manager if it has one, or your system\'s (Task Manager on Windows, Activity Monitor on Mac).', dev: '' }
	};

	/* JS heap readings (Chrome's performance.memory is rounded and only covers this tab) */
	BS.heap = function (m) {
		if (!m || !m.jsHeapSizeLimit) return null;
		return { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit, frac: m.usedJSHeapSize / m.jsHeapSizeLimit };
	};

	/* snapshot of localStorage for a backup file / restore (string values only) */
	BS.backup = function (pairs, when) { var o = {}; pairs.forEach(function (p) { o[p[0]] = String(p[1]); }); return { app: 'mes-browser-storage', v: 1, saved: when || 0, site: 'mes.fm', localStorage: o }; };
	BS.readBackup = function (text) {
		var j; try { j = JSON.parse(text); } catch (e) { return { error: 'This is not a backup file (not JSON).' }; }
		var ls = j && (j.localStorage || (j.app == null && typeof j === 'object' ? j : null));
		if (!ls || typeof ls !== 'object' || Array.isArray(ls)) return { error: 'No saved settings found in this file.' };
		var out = [];
		Object.keys(ls).forEach(function (k) { if (typeof ls[k] === 'string' && k.length < 300) out.push([k, ls[k]]); });
		return { pairs: out };
	};

	if (typeof module !== 'undefined' && module.exports) module.exports = BS;
	root.MESBS = BS;
})(typeof window !== 'undefined' ? window : globalThis);

/* MES Browser Storage & Memory (mes.fm/browser-storage). Measures what mes.fm keeps in this browser,
   by tool, and this tab's memory. Pure helpers in lib.js (MESBS). Nothing leaves the browser. */
(function () {
	'use strict';
	var L = window.MESBS, $ = function (id) { return document.getElementById(id); };
	if (!L || !$('bs')) return;
	var B = L.fmt, titles = {}, items = [], groups = [], open = {}, kind = 'all', busy = false, idbConns = [];
	var KCOL = { ls: 'var(--bs-k1)', ss: 'var(--bs-k6)', idb: 'var(--bs-k2)', cache: 'var(--bs-k3)', opfs: 'var(--bs-k4)', cookie: 'var(--bs-k5)', sw: 'var(--bs-k6)' };
	var PCOL = { indexedDB: 'var(--bs-k2)', caches: 'var(--bs-k3)', fileSystem: 'var(--bs-k4)', serviceWorkerRegistrations: 'var(--bs-k6)' };
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function toast(msg, ms) { var t = $('bs-toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, ms || 3200); }
	function stat(big, small) { return '<div class="bs-stat"><b>' + big + '</b><span>' + small + '</span></div>'; }
	function cleanTitle(t) { return String(t).replace(/^MES\s+/, '').replace(/\s+by MES$/i, '').split(/: | \| /)[0]; }

	/* ---------- titles from the site search index (only for nicer names) ---------- */
	function loadTitles() {
		return fetch('/search/index.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
			if (d && d.p) d.p.forEach(function (p) { titles[p[0]] = cleanTitle(p[1]); });
		}).catch(function () {});
	}

	/* ---------- measuring ---------- */
	function add(kind, name, size, extra) {
		var it = { kind: kind, name: name, size: size, owner: L.owner(name, titles) };
		if (extra) for (var k in extra) it[k] = extra[k];
		items.push(it); return it;
	}
	function webStorage(store, kind) {
		try {
			var s = window[store];
			for (var i = 0; i < s.length; i++) { var k = s.key(i); add(kind, k, L.strBytes(k) + L.strBytes(s.getItem(k))); }
		} catch (e) { /* blocked (private window / settings) */ }
	}
	function cookies() {
		(document.cookie || '').split(/;\s*/).forEach(function (c) {
			if (!c) return; var i = c.indexOf('='), k = i < 0 ? c : c.slice(0, i);
			add('cookie', k, c.length);
		});
	}
	function prog(t) { $('bs-prog').textContent = t; }

	/* open an existing database without creating a missing one */
	function openDb(name) {
		return new Promise(function (res) {
			var req;
			try { req = indexedDB.open(name); } catch (e) { return res(null); }
			req.onupgradeneeded = function (e) { if (e.oldVersion === 0) { try { e.target.transaction.abort(); } catch (x) {} } };
			req.onsuccess = function () { var db = req.result; db.onversionchange = function () { db.close(); }; idbConns.push(db); res(db); };
			req.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); res(null); };
			req.onblocked = function () { res(null); };
		});
	}
	function measureStore(db, sn, deadline) {
		return new Promise(function (res) {
			var size = 0, n = 0, partial = false, tx, st;
			try { tx = db.transaction(sn, 'readonly'); st = tx.objectStore(sn); } catch (e) { return res({ size: 0, n: 0, partial: true }); }
			var total = null, cnt = st.count(); cnt.onsuccess = function () { total = cnt.result; };
			var cur = st.openCursor();
			cur.onsuccess = function () {
				var c = cur.result;
				if (!c) return;
				size += L.sizeOf(c.key, 2000) + L.sizeOf(c.value, 50000); n++;
				if (n >= 40000 || Date.now() > deadline) { partial = true; return; }
				c.continue();
			};
			tx.oncomplete = tx.onabort = tx.onerror = function () {
				if (partial && total && n) size = size / n * total;
				res({ size: size, n: total != null ? total : n, partial: partial });
			};
		});
	}
	var KNOWN_IDB = ['mes-photo-editor', 'mes-video-editor', 'mes-audio', 'mes-gallery', 'mes-3d-studio', 'mes-docx', 'mes-excel', 'mes-copytext', 'mes-handoff'];
	function databases() {
		if (!window.indexedDB) return Promise.resolve([]);
		if (indexedDB.databases) return indexedDB.databases().then(function (l) { return l.map(function (d) { return d.name; }).filter(Boolean); }, function () { return KNOWN_IDB; });
		return Promise.resolve(KNOWN_IDB);
	}
	function measureIdb() {
		return databases().then(function (names) {
			var chain = Promise.resolve();
			names.forEach(function (name) {
				chain = chain.then(function () {
					prog('Measuring database "' + name + '"…');
					return openDb(name).then(function (db) {
						if (!db) return;
						var stores = Array.prototype.slice.call(db.objectStoreNames), deadline = Date.now() + 5000, sum = 0, n = 0, partial = false, parts = [];
						var c2 = Promise.resolve();
						stores.forEach(function (sn) { c2 = c2.then(function () { return measureStore(db, sn, deadline).then(function (r) { sum += r.size; n += r.n; partial = partial || r.partial; parts.push(sn + ' ' + r.n); }); }); });
						return c2.then(function () { db.close(); add('idb', name, sum, { n: n, partial: partial, note: parts.join(' · ') }); });
					});
				});
			});
			return chain;
		});
	}
	function measureCaches() {
		if (!window.caches || !caches.keys) return Promise.resolve();
		return caches.keys().then(function (names) {
			var chain = Promise.resolve();
			names.forEach(function (name) {
				chain = chain.then(function () {
					prog('Measuring downloaded files "' + name + '"…');
					return caches.open(name).then(function (c) { return c.keys().then(function (reqs) {
						var size = 0, unknown = 0, c3 = Promise.resolve();
						reqs.forEach(function (rq) { c3 = c3.then(function () { return c.match(rq).then(function (r) {
							if (!r) return;
							if (r.type === 'opaque') { unknown++; return; }
							var len = +r.headers.get('content-length');
							if (len > 0) { size += len; return; }
							return r.blob().then(function (b) { size += b.size; });
						}).catch(function () { unknown++; }); }); });
						return c3.then(function () { add('cache', name, size, { n: reqs.length, partial: unknown > 0, note: reqs.length + ' file' + (reqs.length === 1 ? '' : 's') + (unknown ? ', ' + unknown + ' of unknown size' : '') }); });
					}); });
				});
			});
			return chain;
		}).catch(function () {});
	}
	function measureOpfs() {
		if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve();
		function walk(dir, path) {
			var out = [], it;
			try { it = dir.values(); } catch (e) { return Promise.resolve(out); }
			function next() {
				return it.next().then(function (r) {
					if (r.done) return out;
					var h = r.value, p = path + h.name;
					if (h.kind === 'file') return h.getFile().then(function (f) { out.push({ name: p, size: f.size, h: h, dir: dir }); return next(); }, next);
					return walk(h, p + '/').then(function (sub) { var s = 0; sub.forEach(function (x) { s += x.size; }); out.push({ name: p + '/', size: s, h: h, dir: dir, n: sub.length }); return next(); });
				});
			}
			return next();
		}
		return navigator.storage.getDirectory().then(function (root) {
			return walk(root, '').then(function (list) {
				list.filter(function (x) { return x.name.split('/').filter(Boolean).length === 1; }).forEach(function (x) { add('opfs', x.name, x.size, { n: x.n, ref: x }); });
			});
		}).catch(function () {});
	}
	function measureSw() {
		if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistrations) return Promise.resolve();
		return navigator.serviceWorker.getRegistrations().then(function (regs) { regs.forEach(function (r) { add('sw', r.scope, 0, { ref: r }); }); }).catch(function () {});
	}

	function scan() {
		if (busy) return; busy = true; items = [];
		$('bs-scan').disabled = true; prog('Measuring…'); $('bs-prog').hidden = false;
		var t0 = Date.now();
		(Object.keys(titles).length ? Promise.resolve() : loadTitles()).then(function () {
			webStorage('localStorage', 'ls'); webStorage('sessionStorage', 'ss'); cookies();
			return measureIdb();
		}).then(measureCaches).then(measureOpfs).then(measureSw).then(function () {
			groups = L.group(items); busy = false; $('bs-scan').disabled = false;
			$('bs-prog').hidden = true;
			render(); quota((Date.now() - t0) / 1000);
		}, function (e) { busy = false; $('bs-scan').disabled = false; prog('Something went wrong while measuring: ' + (e && e.message || e)); });
	}

	/* ---------- summary + quota ---------- */
	function quota(secs) {
		var measured = 0; items.forEach(function (it) { measured += it.size || 0; });
		var st = navigator.storage;
		var p = st && st.estimate ? st.estimate().catch(function () { return null; }) : Promise.resolve(null);
		p.then(function (e) {
			var q = L.quota(e), h = '';
			h += stat(B(e ? q.usage : measured), e ? 'used by mes.fm (browser\'s count)' : 'used by mes.fm (measured)');
			h += stat(B(measured), 'measured by this page');
			if (e && q.quota) h += stat(B(q.quota), 'mes.fm may store up to');
			h += stat(groups.length, groups.length === 1 ? 'tool keeps data' : 'tools keep data');
			$('bs-stats').innerHTML = h;
			var fill = $('bs-qbar'), leg = '';
			fill.innerHTML = '';
			if (e && q.quota) {
				var parts = q.parts.length ? q.parts : [{ key: 'all', label: 'Used', size: q.usage }];
				parts.forEach(function (pp) {
					var s = document.createElement('span'); s.style.width = Math.max(pp.size ? 0.3 : 0, pp.size / q.quota * 100) + '%'; s.style.background = PCOL[pp.key] || 'var(--bs-bar)'; s.title = pp.label + ': ' + B(pp.size); fill.appendChild(s);
					leg += '<span><i style="background:' + (PCOL[pp.key] || 'var(--bs-bar)') + '"></i>' + esc(pp.label) + ' ' + B(pp.size) + '</span>';
				});
				leg += '<span><i style="background:var(--bs-track)"></i>Room left ' + B(q.free) + ' (' + L.pct(q.usage, q.quota) + ' used)</span>';
				$('bs-qnote').textContent = 'The limit is a browser rule for website data, often worked out from your disk size: it is not your free disk space.' + (secs >= 1 ? ' Measured in ' + secs.toFixed(1) + ' s.' : '');
			} else { fill.hidden = true; $('bs-qnote').textContent = 'This browser doesn\'t report its storage limit, so only the sizes this page measured are shown.'; }
			$('bs-qleg').innerHTML = leg;
		});
		persistUi();
	}
	function persistUi() {
		var box = $('bs-persist'), st = navigator.storage;
		if (!st || !st.persisted) { box.innerHTML = ''; return; }
		st.persisted().then(function (on) {
			box.innerHTML = on ? '<span class="bs-chip bs-chip--ok">✓ Kept: the browser won\'t delete mes.fm\'s data on its own when the disk is full</span>'
				: '<span class="bs-chip">The browser may delete this data by itself if the disk gets full</span> <button type="button" class="tu-btn tu-btn--ghost" id="bs-keep">Ask the browser to keep it</button>';
			var b = $('bs-keep');
			if (b) b.onclick = function () { st.persist().then(function (ok) { toast(ok ? 'Done: mes.fm\'s data is now kept.' : 'The browser said no. Chrome says yes for sites you use often, bookmark or install; Firefox asks you.', 6000); persistUi(); }); };
		});
	}

	/* ---------- table ---------- */
	function visible(g) {
		var q = $('bs-q').value.trim().toLowerCase();
		var its = g.items.filter(function (it) {
			if (kind === 'big' && !/^(idb|cache|opfs)$/.test(it.kind)) return false;
			if (kind === 'ls' && !/^(ls|ss|cookie)$/.test(it.kind)) return false;
			return !q || (g.tool + ' ' + g.path + ' ' + it.name).toLowerCase().indexOf(q) >= 0;
		});
		return its;
	}
	function kindChip(k) { return '<span class="bs-chip" title="' + esc(L.KINDS[k][1]) + '"><i style="display:inline-block;width:0.6em;height:0.6em;border-radius:50%;margin-right:0.3em;background:' + KCOL[k] + '"></i>' + L.KINDS[k][0] + '</span>'; }
	function render() {
		var body = $('bs-body'), h = '', max = 0, shown = 0;
		var rows = groups.map(function (g) { var its = visible(g), s = 0, part = false; its.forEach(function (it) { s += it.size || 0; part = part || it.partial || it.size == null; }); return { g: g, its: its, size: s, part: part }; })
			.filter(function (r) { return r.its.length; }).sort(function (a, b) { return b.size - a.size; });
		rows.forEach(function (r) { max = Math.max(max, r.size); });
		rows.forEach(function (r, gi) {
			var g = r.g, key = g.tool + '|' + g.path, isOpen = !!open[key], kinds = {};
			r.its.forEach(function (it) { kinds[it.kind] = 1; });
			shown++;
			h += '<tr class="bs-row" data-g="' + esc(key) + '" aria-expanded="' + isOpen + '" tabindex="0"><td class="bs-tool"><span class="bs-arrow" aria-hidden="true">▸</span>' + esc(g.tool)
				+ (g.path ? ' <a href="' + esc(g.path) + '" title="Open the tool">open ↗</a>' : '') + '<div class="bs-cnt">' + r.its.length + ' item' + (r.its.length === 1 ? '' : 's') + '</div></td>'
				+ '<td class="bs-where"><div class="bs-kinds">' + Object.keys(kinds).map(kindChip).join('') + '</div></td>'
				+ '<td class="bs-num">' + (r.part ? '≈ ' : '') + B(r.size) + '<span class="bs-sizebar" style="width:' + (max ? Math.max(2, r.size / max * 100) : 0) + '%"></span></td>'
				+ '<td class="bs-c-act"><button type="button" class="bs-del" data-delg="' + esc(key) + '">Delete</button></td></tr>';
			if (isOpen) r.its.forEach(function (it) {
				var idx = items.indexOf(it);
				h += '<tr class="bs-sub"><td class="bs-name">' + esc(it.name) + '<small>' + L.KINDS[it.kind][0] + (it.n != null && it.kind !== 'cache' ? ' · ' + it.n + ' record' + (it.n === 1 ? '' : 's') : '') + (it.note ? ' · ' + esc(it.note) : '') + (it.partial ? ' · estimated' : '') + '</small></td>' + '<td class="bs-where"></td>'
					+ '<td class="bs-num">' + (it.kind === 'sw' ? '' : (it.partial ? '≈ ' : '') + B(it.size)) + '</td><td class="bs-c-act"><button type="button" class="bs-del" data-deli="' + idx + '">Delete</button></td></tr>';
			});
		});
		if (!shown) h = '<tr class="bs-empty"><td colspan="4">' + (items.length ? 'Nothing matches.' : 'mes.fm keeps nothing in this browser right now.') + '</td></tr>';
		body.innerHTML = h;
	}
	$('bs-body').addEventListener('click', function (e) {
		var b = e.target.closest('button'), a = e.target.closest('a');
		if (a) return;
		if (b && b.dataset.delg != null) { var g = groups.filter(function (x) { return x.tool + '|' + x.path === b.dataset.delg; })[0]; if (g) confirmDelete(g.tool, g.items); return; }
		if (b && b.dataset.deli != null) { var it = items[+b.dataset.deli]; if (it) confirmDelete(it.owner.tool, [it]); return; }
		var row = e.target.closest('.bs-row'); if (row) { var k = row.dataset.g; open[k] = !open[k]; render(); }
	});
	$('bs-body').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('bs-row')) { e.preventDefault(); var k = e.target.dataset.g; open[k] = !open[k]; render(); var r = $('bs-body').querySelector('[data-g="' + CSS.escape(k) + '"]'); if (r) r.focus(); } });
	$('bs-q').addEventListener('input', render);
	Array.prototype.forEach.call(document.querySelectorAll('#bs-tools [data-kind]'), function (b) {
		b.onclick = function () { kind = b.dataset.kind; Array.prototype.forEach.call(document.querySelectorAll('#bs-tools [data-kind]'), function (x) { x.setAttribute('aria-pressed', x === b); }); render(); };
	});
	$('bs-scan').onclick = scan;

	/* ---------- deleting ---------- */
	var pending = null;
	function confirmDelete(title, list) {
		var big = list.filter(function (it) { return /^(idb|opfs)$/.test(it.kind); }).length, size = 0;
		list.forEach(function (it) { size += it.size || 0; });
		$('bs-mtitle').textContent = 'Delete ' + (list.length === 1 ? '"' + list[0].name + '"' : title + '\'s data') + '?';
		$('bs-mtext').innerHTML = '<p>This removes ' + (list.length === 1 ? 'it' : 'these ' + list.length + ' items') + ' (' + B(size) + ') from this browser for good:</p><ul>'
			+ list.slice(0, 12).map(function (it) { return '<li>' + L.KINDS[it.kind][0] + ': <code>' + esc(it.name) + '</code></li>'; }).join('') + (list.length > 12 ? '<li>… and ' + (list.length - 12) + ' more</li>' : '') + '</ul>'
			+ (big ? '<p><b>Autosaved projects in it can\'t be brought back.</b> Close other mes.fm tabs that use ' + esc(title) + ' first.</p>' : '<p>Settings go back to the defaults; downloaded files download again when needed.</p>');
		pending = list; $('bs-modal').hidden = false; $('bs-myes').focus();
	}
	function closeModal() { $('bs-modal').hidden = true; pending = null; }
	$('bs-mno').onclick = closeModal;
	$('bs-modal').addEventListener('click', function (e) { if (e.target === $('bs-modal')) closeModal(); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('bs-modal').hidden) closeModal(); });
	$('bs-myes').onclick = function () { var list = pending; closeModal(); if (list) remove(list); };
	function delIdb(name) {
		idbConns.forEach(function (db) { try { db.close(); } catch (e) {} }); idbConns = [];
		return new Promise(function (res) {
			var req = indexedDB.deleteDatabase(name), told = false;
			req.onsuccess = req.onerror = function () { res(); };
			req.onblocked = function () { if (!told) { told = true; toast('Waiting: close the other mes.fm tabs that have "' + name + '" open.', 8000); } };
		});
	}
	function removeOne(it) {
		try {
			if (it.kind === 'ls') { localStorage.removeItem(it.name); return Promise.resolve(); }
			if (it.kind === 'ss') { sessionStorage.removeItem(it.name); return Promise.resolve(); }
			if (it.kind === 'cookie') { ['', '; domain=' + location.hostname, '; domain=.' + location.hostname.replace(/^www\./, '')].forEach(function (d) { document.cookie = it.name + '=; Max-Age=0; path=/' + d; }); return Promise.resolve(); }
			if (it.kind === 'idb') return delIdb(it.name);
			if (it.kind === 'cache') return caches.delete(it.name);
			if (it.kind === 'opfs') return it.ref.dir.removeEntry(it.ref.h.name, { recursive: true });
			if (it.kind === 'sw') return it.ref.unregister();
		} catch (e) { return Promise.reject(e); }
		return Promise.resolve();
	}
	function remove(list) {
		var chain = Promise.resolve(), fails = 0;
		list.forEach(function (it) { chain = chain.then(function () { return removeOne(it).catch(function () { fails++; }); }); });
		chain.then(function () { toast(fails ? fails + ' item(s) could not be deleted.' : 'Deleted.'); scan(); });
	}
	$('bs-all').onclick = function () { if (items.length) confirmDelete('mes.fm', items.slice()); else toast('Nothing to delete.'); };

	/* ---------- backup of saved settings ---------- */
	$('bs-export').onclick = function () {
		var pairs = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); pairs.push([k, localStorage.getItem(k)]); } } catch (e) {}
		var d = new Date(), name = 'mes-fm-settings-' + d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + '.json';
		var a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(L.backup(pairs, Date.now()), null, 1)], { type: 'application/json' }));
		a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
		toast('Saved ' + pairs.length + ' settings. Projects in databases are not in this file: save those from their own tool.', 6000);
	};
	$('bs-import').onchange = function () {
		var f = this.files && this.files[0]; this.value = ''; if (!f) return;
		f.text().then(function (t) {
			var r = L.readBackup(t);
			if (r.error) return toast(r.error, 5000);
			var ok = 0; r.pairs.forEach(function (p) { try { localStorage.setItem(p[0], p[1]); ok++; } catch (e) {} });
			toast('Restored ' + ok + ' settings. Open the tools again to see them.', 5000); scan();
		});
	};

	/* ---------- memory ---------- */
	var samples = [], timer = null;
	function memStats() {
		var h = '', nav = navigator, hp = L.heap(performance.memory);
		if (nav.deviceMemory) h += stat((nav.deviceMemory >= 8 ? '8+' : nav.deviceMemory) + ' GB', 'memory in this device (the browser rounds it, 8 = 8 or more)');
		if (nav.hardwareConcurrency) h += stat(nav.hardwareConcurrency, 'processor threads');
		if (hp) { h += stat(B(hp.used), 'JavaScript memory this tab uses'); h += stat(B(hp.limit), 'most this tab may use'); }
		$('bs-mstats').innerHTML = h || stat('—', 'this browser reports no memory numbers');
		var note = hp ? 'Only this tab, rounded by the browser so sites can\'t fingerprint you. Pictures, videos and the page itself use more memory than the JavaScript number shows. The whole browser and other tabs: see the guide below (Shift+Esc in Chrome, Edge, Brave and Opera).'
			: 'This browser doesn\'t tell pages how much memory they use (Chrome, Edge, Brave and Opera do, roughly). To see memory per tab, use the browser\'s task manager: see the guide below.';
		$('bs-mnote').textContent = note;
		$('bs-chartbox').hidden = !hp;
	}
	function sample() {
		var m = L.heap(performance.memory); if (!m) return;
		samples.push({ t: Date.now(), u: m.used, tot: m.total }); if (samples.length > 300) samples.shift();
		memStats(); draw();
	}
	function draw() {
		var c = $('bs-canvas'), box = $('bs-chartbox'); if (box.hidden || !samples.length) return;
		var dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
		c.width = w * dpr; c.height = h * dpr; var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
		var cs = getComputedStyle($('bs')), col = cs.getPropertyValue('--bs-k2').trim() || '#2563eb', mut = cs.getPropertyValue('--bs-muted').trim() || '#888', line = cs.getPropertyValue('--bs-line').trim() || '#ddd';
		var max = 0; samples.forEach(function (s) { max = Math.max(max, s.tot, s.u); }); max *= 1.12;
		var pad = { l: 8, r: 64, t: 10, b: 18 }, W = w - pad.l - pad.r, H = h - pad.t - pad.b, n = 300;
		function X(i) { return pad.l + W * (i + n - samples.length) / (n - 1); }
		function Y(v) { return pad.t + H - v / max * H; }
		g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = mut; g.font = '11px system-ui, sans-serif';
		for (var k = 0; k <= 4; k++) { var v = max * k / 4, y = Y(v); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + W, y); g.stroke(); g.fillText(B(v), pad.l + W + 6, y + 4); }
		g.fillText('10 min ago', pad.l, h - 4); g.fillText('now', pad.l + W - 18, h - 4);
		g.setLineDash([4, 4]); g.strokeStyle = mut; g.beginPath(); samples.forEach(function (s, i) { i ? g.lineTo(X(i), Y(s.tot)) : g.moveTo(X(i), Y(s.tot)); }); g.stroke(); g.setLineDash([]);
		g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); samples.forEach(function (s, i) { i ? g.lineTo(X(i), Y(s.u)) : g.moveTo(X(i), Y(s.u)); }); g.stroke();
		var last = samples[samples.length - 1];
		$('bs-chartnote').textContent = 'This tab: ' + B(last.u) + ' in use (solid), ' + B(last.tot) + ' set aside (dashed). Every 2 s.';
	}
	function startMem() { memStats(); if (performance.memory && !timer) { sample(); timer = setInterval(function () { if (!document.hidden) sample(); }, 2000); } }
	window.addEventListener('resize', function () { clearTimeout(draw.t); draw.t = setTimeout(draw, 120); });

	/* ---------- guide ---------- */
	function guide() {
		var me = L.browser(navigator.userAgent, navigator.userAgentData && navigator.userAgentData.brands), order = ['chrome', 'edge', 'brave', 'firefox', 'safari', 'opera'];
		if (order.indexOf(me) < 0 && me !== 'other') order.unshift(me);
		order.sort(function (a, b) { return (b === me) - (a === me); });
		$('bs-glist').innerHTML = order.map(function (k) {
			var g = L.GUIDE[k];
			return '<div class="bs-g' + (k === me ? ' bs-me' : '') + '"><h3>' + g.name + (k === me ? ' <span class="bs-chip">your browser</span>' : '') + '</h3>'
				+ '<p><b>Every site\'s storage:</b> ' + (g.data ? '<span class="bs-copy"><code>' + esc(g.data) + '</code><button type="button" data-copy="' + esc(g.data) + '">Copy</button></span>' + (g.dataHow ? ' ' + esc(g.dataHow) : ' Lists each site with its size; click one to clear it.') : esc(g.dataHow)) + '</p>'
				+ '<p><b>Memory per tab:</b> ' + esc(g.mem) + '</p></div>';
		}).join('');
	}
	$('bs-glist').addEventListener('click', function (e) {
		var b = e.target.closest('[data-copy]'); if (!b) return;
		var t = b.dataset.copy;
		(navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copied: paste it into the address bar.'); }, function () { toast('Select the address and copy it.'); });
	});

	/* ---------- Fill window / Full screen ---------- */
	(function panels() {
		if (!window.MESPanel) { if (document.readyState !== 'complete') return void setTimeout(panels, 200); return; }
		window.MESPanel.add($('bs-tools'), { bar: $('bs-tbtns') });
		window.MESPanel.add($('bs-mem'), { bar: $('bs-mbtns'), onChange: function () { setTimeout(draw, 60); } });
	})();

	guide(); startMem(); scan();
	if (/[?&]debug=1/.test(location.search)) window.MESBSDebug = { items: function () { return items; }, groups: function () { return groups; }, scan: scan };
})();
