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
		'hive-user': ['Hive login', ''], 'hive-has': ['Hive login (phone app)', ''], 'hive-store': ['Hive backups (list cache, lock choice, remembered passphrase)', '/copy-text'],
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
