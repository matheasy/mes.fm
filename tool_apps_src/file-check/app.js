/* MES File Safety Check UI. Detection = MESScan in lib.js (prepended above). Files are read with File.slice() inside the browser;
   nothing is uploaded or stored. Settings (hash on/off) in localStorage mes-file-check:v1. */
(function () {
	'use strict';
	var S = MESScan, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-file-check:v1';
	var set = { hash: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && typeof sv.hash === 'boolean') set.hash = sv.hash; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('fc-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2400); }
	function copy(text, msg) {
		(navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg || 'Copied'); }, function () {
			var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Copied'); } catch (e) { toast('Could not copy'); } ta.remove();
		});
	}
	function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
	var LW = ['ok', 'note', 'caution', 'danger'], LWORD = ['No red flags', 'No red flags', 'Caution', 'Danger'], LICON = ['✓', '✓', '!', '✕'];

	/* ---------- tabs ---------- */
	function setTab(t, push) {
		if (['files', 'link', 'guide'].indexOf(t) < 0) t = 'files';
		Array.prototype.forEach.call(document.querySelectorAll('#fc-tabs [data-tab]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === t)); });
		['files', 'link', 'guide'].forEach(function (k) { $('fc-p-' + k).hidden = k !== t; });
		if (push) { try { var u = new URL(location.href); if (t === 'files') u.searchParams.delete('tab'); else u.searchParams.set('tab', t); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {} }
	}
	$('fc-tabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.getAttribute('data-tab'), true); };
	document.addEventListener('click', function (e) { var a = e.target.closest('[data-tab-link]'); if (a && $('fc').contains(a)) { e.preventDefault(); setTab(a.getAttribute('data-tab-link'), true); $('fc-tabs').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
	try { setTab(new URLSearchParams(location.search).get('tab') || 'files'); } catch (e) { setTab('files'); }

	/* ---------- inflating (browser's own DecompressionStream, capped so a bomb can't fill memory) ---------- */
	var CAP = 40 * 1024 * 1024;
	function inflater(fmt) {
		if (typeof DecompressionStream === 'undefined') return null;
		try { new DecompressionStream(fmt); } catch (e) { return null; }
		return function (u8) {
			var rd = new Blob([u8]).stream().pipeThrough(new DecompressionStream(fmt)).getReader(), parts = [], tot = 0;
			function step() {
				return rd.read().then(function (r) {
					if (r.done) { var o = new Uint8Array(tot), at = 0; parts.forEach(function (p) { o.set(p, at); at += p.length; }); return o; }
					tot += r.value.length; if (tot > CAP) { try { rd.cancel(); } catch (e) {} throw new Error('too big'); }
					parts.push(r.value); return step();
				});
			}
			return step();
		};
	}
	var OPTS = { inflateRaw: inflater('deflate-raw'), inflate: inflater('deflate') };
	function fileSource(f) { return { size: f.size, read: function (o, l) { o = Math.max(0, o); return f.slice(o, Math.min(f.size, o + l)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); } }; }

	/* ---------- the queue ---------- */
	var items = [], queue = [], busy = 0, stopFlag = false, seq = 0, HASH_MAX = 512 * 1024 * 1024, MAX_FILES = 5000;
	var view = { f: 'all', q: '', sort: 'risk', shown: 200, open: {} };
	function addFiles(list) {
		var arr = Array.prototype.slice.call(list).filter(function (x) { return x && x.file; });
		if (!arr.length) return;
		if (items.length + arr.length > MAX_FILES) { toast('Checking the first ' + MAX_FILES + ' files only.'); arr = arr.slice(0, Math.max(0, MAX_FILES - items.length)); }
		stopFlag = false;
		arr.forEach(function (x) { var it = { id: ++seq, file: x.file, path: x.path || x.file.name, name: x.file.name, size: x.file.size, rep: null, hash: null, state: 'wait' }; items.push(it); queue.push(it); });
		$('fc-out').hidden = false; pump(); paintSoon();
	}
	function pump() {
		while (busy < 2 && queue.length && !stopFlag) {
			var it = queue.shift(); busy++; it.state = 'run';
			(function (it) {
				S.analyze(fileSource(it.file), it.name, OPTS).then(function (rep) { it.rep = rep; rep.path = it.path; }, function (err) {
					it.rep = { name: it.name, size: it.size, type: { id: 'err', label: 'Could not read', family: 'unknown' }, level: 1, findings: [{ level: 1, code: 'err', msg: 'Could not read this file (' + (err && err.message || 'error') + '). It may be locked or in use.' }], children: [], info: {}, path: it.path };
				}).then(function () { return set.hash ? hashIt(it) : null; }).then(function () { it.state = 'done'; busy--; paintSoon(); pump(); });
			})(it);
		}
		progress();
	}
	function hashIt(it) {
		if (it.size > HASH_MAX) { it.hash = { skipped: 'Too big to fingerprint here (over 512 MB).' }; return Promise.resolve(); }
		if (!(window.crypto && crypto.subtle)) { it.hash = { skipped: 'This browser can\'t work out fingerprints.' }; return Promise.resolve(); }
		return it.file.arrayBuffer().then(function (buf) {
			return Promise.all([crypto.subtle.digest('SHA-256', buf), crypto.subtle.digest('SHA-1', buf)]).then(function (d) {
				it.hash = { sha256: S.hex(d[0]), sha1: S.hex(d[1]), md5: it.size <= 256 * 1024 * 1024 ? S.md5(new Uint8Array(buf)) : '' };
				it.rep.hash = it.hash;
			});
		}).catch(function () { it.hash = { skipped: 'Could not read the file to fingerprint it.' }; });
	}
	function progress() {
		var done = items.filter(function (i) { return i.state === 'done'; }).length, tot = items.length, on = done < tot && !stopFlag;
		$('fc-prog').hidden = !on;
		if (on) { $('fc-progbar').style.width = (done / tot * 100).toFixed(1) + '%'; $('fc-progtxt').textContent = 'Checked ' + done + ' of ' + tot + '…'; }
	}
	$('fc-stop').onclick = function () { stopFlag = true; queue.forEach(function (it) { it.state = 'done'; it.rep = { name: it.name, size: it.size, type: { id: 'skip', label: 'Not checked', family: 'unknown' }, level: 1, findings: [{ level: 1, code: 'stopped', msg: 'Not checked: you pressed Stop.' }], children: [], info: {}, path: it.path }; }); queue = []; progress(); paintSoon(); };

	/* ---------- picking files and folders ---------- */
	$('fc-pickfiles').onclick = function () { $('fc-files').click(); };
	$('fc-files').onchange = function () { addFiles(Array.prototype.map.call(this.files, function (f) { return { file: f }; })); this.value = ''; };
	$('fc-dir').onchange = function () { addFiles(Array.prototype.map.call(this.files, function (f) { return { file: f, path: f.webkitRelativePath || f.name }; })); this.value = ''; };
	$('fc-pickdir').onclick = function () {
		if (!window.showDirectoryPicker) return void $('fc-dir').click();
		window.showDirectoryPicker({ mode: 'read' }).then(function (dir) {
			var out = [];
			function walk(d, pre) {
				if (out.length >= MAX_FILES) return Promise.resolve();
				var it = d.values(), list = [];
				function next() { return it.next().then(function (r) { if (r.done) return; list.push(r.value); return next(); }); }
				return next().then(function () {
					return list.reduce(function (p, h) { return p.then(function () {
						if (out.length >= MAX_FILES) return;
						if (h.kind === 'file') return h.getFile().then(function (f) { out.push({ file: f, path: pre + h.name }); }, function () {});
						return walk(h, pre + h.name + '/');
					}); }, Promise.resolve());
				});
			}
			$('fc-prog').hidden = false; $('fc-progtxt').textContent = 'Reading the folder…';
			return walk(dir, dir.name + '/').then(function () { addFiles(out); if (!out.length) { $('fc-prog').hidden = true; toast('That folder has no files.'); } });
		}).catch(function (e) { if (e && e.name !== 'AbortError') $('fc-dir').click(); });
	};
	var drop = $('fc-drop');
	drop.onclick = function () { $('fc-files').click(); };
	drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fc-files').click(); } };
	['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
	['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('is-over'); }); });
	drop.addEventListener('drop', function (e) {
		e.preventDefault();
		var dt = e.dataTransfer, ents = [];
		if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) Array.prototype.forEach.call(dt.items, function (i) { var en = i.kind === 'file' && i.webkitGetAsEntry(); if (en) ents.push(en); });
		if (!ents.length) return addFiles(Array.prototype.map.call(dt.files || [], function (f) { return { file: f }; }));
		var out = [];
		function walk(en, pre) {
			if (out.length >= MAX_FILES) return Promise.resolve();
			if (en.isFile) return new Promise(function (res) { en.file(function (f) { out.push({ file: f, path: pre + f.name }); res(); }, function () { res(); }); });
			var rd = en.createReader(), all = [];
			function more() { return new Promise(function (res) { rd.readEntries(function (b) { res(b); }, function () { res([]); }); }).then(function (b) { if (!b.length) return; all = all.concat(b); return more(); }); }
			return more().then(function () { return all.reduce(function (p, c) { return p.then(function () { return walk(c, pre + en.name + '/'); }); }, Promise.resolve()); });
		}
		ents.reduce(function (p, en) { return p.then(function () { return walk(en, ''); }); }, Promise.resolve()).then(function () { addFiles(out); });
	});
	$('fc-hash').checked = set.hash;
	$('fc-hash').onchange = function () { set.hash = this.checked; save(); if (set.hash) items.forEach(function (it) { if (it.state === 'done' && !it.hash && it.rep) hashIt(it).then(paintSoon); }); };

	/* ---------- examples (harmless bytes made here in memory) ---------- */
	function u8(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }
	function mkFile(name, data) { try { return new File([data], name); } catch (e) { var b = new Blob([data]); b.name = name; b.lastModified = Date.now(); return b; } }
	$('fc-eicar').onclick = function () { addFiles([{ file: mkFile('eicar.com', S.eicarBytes()), path: 'Example: eicar.com' }]); };
	$('fc-demo').onclick = function () {
		var pe = new Uint8Array(1024); pe.set(u8('MZ')); pe[0x3C] = 0x80; pe.set(u8('PE\0\0'), 0x80); pe[0x96] = 0x22; pe[0x98] = 0x0b; pe[0x99] = 0x02;
		pe.set(u8('This is a harmless example made by mes.fm/file-check. It does nothing.'), 0x200);
		var vba = u8('Attribute VB_Name = "ThisDocument"\0Sub AutoOpen()\0Shell "calc.exe"\0End Sub');
		var docm = MESImg.zipStore([{ name: '[Content_Types].xml', data: u8('<?xml version="1.0"?><Types/>') }, { name: 'word/document.xml', data: u8('<w:document><w:body/></w:document>') }, { name: 'word/vbaProject.bin', data: vba }]);
		var html = u8('<!doctype html><html><body><h1>Microsoft 365</h1><p>Sign in to view the shared document.</p><form action="https://example.invalid/collect" method="post"><input type="email" name="email"><input type="password" name="pass"><button>Sign in</button></form></body></html>');
		var pdf = u8('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 2 0 R >>\nendobj\n2 0 obj\n<< /S /JavaScript /JS (app.alert\\("example"\\)) >>\nendobj\n%%EOF\n');
		var zip = MESImg.zipStore([{ name: 'Scan_0042.pdf.exe', data: pe }]);
		var url = u8('[InternetShortcut]\r\nURL=https://paypa1-secure.com/login\r\n');
		var png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
		addFiles([
			{ file: mkFile('Invoice_2026.pdf', pe), path: 'Example: Invoice_2026.pdf' },
			{ file: mkFile('Photo‮gpj.exe', pe), path: 'Example: Photo‮gpj.exe' },
			{ file: mkFile('Payment_Details.docm', docm), path: 'Example: Payment_Details.docm' },
			{ file: mkFile('Secure_Message.html', html), path: 'Example: Secure_Message.html' },
			{ file: mkFile('Statement.pdf', pdf), path: 'Example: Statement.pdf' },
			{ file: mkFile('Scans.zip', zip), path: 'Example: Scans.zip' },
			{ file: mkFile('PayPal Login.url', url), path: 'Example: PayPal Login.url' },
			{ file: mkFile('holiday.png', png), path: 'Example: holiday.png' }
		]);
		toast('8 harmless example files made in memory');
	};

	/* ---------- painting ---------- */
	var pT = 0; function paintSoon() { clearTimeout(pT); pT = setTimeout(paint, 80); }
	function done() { return items.filter(function (i) { return i.state === 'done' && i.rep; }); }
	function lv(i) { return i.rep.level <= 1 ? 0 : i.rep.level; }
	function paint() {
		progress();
		var d = done(), c = { 0: 0, 2: 0, 3: 0 };
		d.forEach(function (i) { c[lv(i)]++; });
		$('fc-sum').innerHTML = [[3, 'Danger', 'Tricks that honest files don\'t use'], [2, 'Caution', 'Can run code, or can\'t be checked'], [0, 'No red flags', 'None of the known tricks found'], ['all', 'Checked', items.length > d.length ? (items.length - d.length) + ' still in the queue' : 'files']].map(function (x) {
			var cnt = x[0] === 'all' ? d.length : c[x[0]], k = x[0] === 'all' ? 'all' : LW[x[0]];
			return '<button type="button" class="fc-tile fc-tile--' + k + (String(view.f) === String(x[0]) ? ' is-on' : '') + '" data-f="' + x[0] + '"><span class="fc-tile__n">' + cnt + '</span><span class="fc-tile__l">' + x[1] + '</span><span class="fc-tile__s">' + esc(x[2]) + '</span></button>';
		}).join('');
		Array.prototype.forEach.call(document.querySelectorAll('#fc-filters [data-f]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === String(view.f))); });
		var q = view.q.toLowerCase(), list = d.filter(function (i) {
			if (view.f !== 'all' && String(lv(i)) !== String(view.f)) return false;
			return !q || (i.path + ' ' + (i.rep.type ? i.rep.type.label : '') + ' ' + i.rep.findings.map(function (f) { return f.msg; }).join(' ')).toLowerCase().indexOf(q) >= 0;
		});
		var by = { risk: function (a, b) { return b.rep.level - a.rep.level || a.id - b.id; }, name: function (a, b) { return a.path.localeCompare(b.path); }, size: function (a, b) { return b.size - a.size; }, type: function (a, b) { return (a.rep.type.label || '').localeCompare(b.rep.type.label || '') || a.id - b.id; }, order: function (a, b) { return a.id - b.id; } }[view.sort];
		list.sort(by);
		var html = list.slice(0, view.shown).map(row).join('');
		$('fc-list').innerHTML = html || '<p class="fc-empty">' + (d.length ? 'No files match.' : 'Checking…') + '</p>';
		$('fc-more').hidden = list.length <= view.shown; $('fc-more').textContent = 'Show more (' + (list.length - view.shown) + ' left)';
	}
	function badge(level, small) { var k = level <= 1 ? 0 : level; return '<span class="fc-badge fc-badge--' + LW[k] + (small ? ' fc-badge--sm' : '') + '"><span aria-hidden="true">' + LICON[k] + '</span> ' + LWORD[k] + '</span>'; }
	function row(i) {
		var r = i.rep, main = r.findings.filter(function (f) { return f.level >= 2; }).sort(function (a, b) { return b.level - a.level; }), first = main[0] || r.findings.filter(function (f) { return f.level === 1; })[0];
		var open = !!view.open[i.id], k = LW[lv(i)];
		var summ = first ? esc(first.msg) : 'None of the known tricks found.';
		var more = r.findings.filter(function (f) { return f.level >= 1; }).length - (first ? 1 : 0);
		return '<div class="fc-row fc-row--' + k + (open ? ' is-open' : '') + '" role="listitem">' +
			'<button type="button" class="fc-rbtn" data-open="' + i.id + '" aria-expanded="' + open + '">' +
			'<span class="fc-c-badge">' + badge(r.level) + '</span>' +
			'<span class="fc-c-name"><b>' + esc(showName(i.path)) + '</b><span class="fc-meta">' + esc(r.type ? r.type.label : '') + ' · ' + S.fmtBytes(i.size) + '</span></span>' +
			'<span class="fc-c-what">' + summ + (more > 0 ? ' <span class="fc-moretag">+' + more + ' more</span>' : '') + '</span>' +
			'<span class="fc-c-arrow" aria-hidden="true">' + (open ? '▴' : '▾') + '</span></button>' +
			(open ? detail(i) : '') + '</div>';
	}
	function showName(p) { return p.replace(/[‪-‮⁦-⁩‎‏؜]/g, function (c) { return '⟨U+' + c.charCodeAt(0).toString(16).toUpperCase() + '⟩'; }); }
	function findList(fs) {
		var s = fs.slice().sort(function (a, b) { return b.level - a.level; });
		if (!s.length) return '<p class="fc-ok">None of the tricks this page knows about were found. That is a good sign, not a guarantee.</p>';
		return '<ul class="fc-finds">' + s.map(function (f) { return '<li class="fc-f fc-f--' + LW[f.level <= 1 && f.level > 0 ? 1 : f.level] + '">' + (f.level >= 2 ? badge(f.level, true) + ' ' : '<span class="fc-dot" aria-hidden="true">•</span> ') + esc(f.msg) + '</li>'; }).join('') + '</ul>';
	}
	function kidList(kids, depth) {
		if (!kids || !kids.length) return '';
		var shown = kids.slice().sort(function (a, b) { return b.level - a.level; }).slice(0, 80);
		return '<ul class="fc-kids">' + shown.map(function (k) {
			var w = k.findings.filter(function (f) { return f.level >= 2; })[0];
			return '<li>' + badge(k.level, true) + ' <b>' + esc(showName(k.name)) + '</b> <span class="fc-meta">' + esc(k.type ? k.type.label : (k.info.skipped || 'not unpacked')) + (k.size != null ? ' · ' + S.fmtBytes(k.size) : '') + '</span>' + (w ? '<div class="fc-kmsg">' + esc(w.msg) + '</div>' : '') + (depth < 2 ? kidList(k.children, depth + 1) : '') + '</li>';
		}).join('') + (kids.length > shown.length ? '<li class="fc-meta">… and ' + (kids.length - shown.length) + ' more</li>' : '') + '</ul>';
	}
	function detail(i) {
		var r = i.rep, h = i.hash, out = '<div class="fc-detail">';
		out += '<div class="fc-dpath">' + esc(showName(i.path)) + '</div>';
		out += findList(r.findings);
		if (r.children && r.children.length) out += '<h3 class="fc-h3">Inside (' + r.children.length + ')</h3>' + kidList(r.children, 0);
		if (h && h.sha256) {
			out += '<h3 class="fc-h3">Fingerprints</h3><dl class="fc-hash">' + [['SHA-256', h.sha256], ['SHA-1', h.sha1], ['MD5', h.md5]].filter(function (x) { return x[1]; }).map(function (x) { return '<dt>' + x[0] + '</dt><dd><code>' + x[1] + '</code> <button type="button" class="fc-link" data-copy="' + x[1] + '">Copy</button></dd>'; }).join('') + '</dl>';
			out += '<div class="tu-row fc-look"><a class="tu-btn tu-btn--ghost" href="' + S.links.vtFile(h.sha256) + '" target="_blank" rel="noopener noreferrer">Look up on VirusTotal ↗</a><a class="tu-btn tu-btn--ghost" href="' + S.links.bazaar(h.sha256) + '" target="_blank" rel="noopener noreferrer">Look up on MalwareBazaar ↗</a></div>';
			out += '<p class="tu-note">These open a new tab and send only the SHA-256 fingerprint, never the file. "Not found" there means nobody has uploaded this exact file before; it does not mean it is safe or unsafe.</p>';
		} else if (h && h.skipped) out += '<p class="tu-note">' + esc(h.skipped) + '</p>';
		else if (!set.hash) out += '<p class="tu-note">Tick "Work out each file\'s fingerprint" above to get hashes for VirusTotal.</p>';
		return out + '</div>';
	}
	$('fc-list').onclick = function (e) {
		var c = e.target.closest('[data-copy]'); if (c) return copy(c.getAttribute('data-copy'), 'Fingerprint copied');
		var b = e.target.closest('[data-open]'); if (!b) return;
		var id = +b.getAttribute('data-open'); view.open[id] = !view.open[id]; paint();
		var again = $('fc-list').querySelector('[data-open="' + id + '"]'); if (again) again.focus();
	};
	function setF(f) { view.f = view.f === f && f !== 'all' ? 'all' : f; view.shown = 200; paint(); }
	$('fc-sum').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) setF(b.getAttribute('data-f')); };
	$('fc-filters').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) setF(b.getAttribute('data-f')); };
	$('fc-find').oninput = function () { view.q = this.value.trim(); view.shown = 200; paintSoon(); };
	$('fc-sort').onchange = function () { view.sort = this.value; paint(); };
	$('fc-more').onclick = function () { view.shown += 300; paint(); };
	function reps() { return done().map(function (i) { return i.rep; }); }
	function stamp() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
	$('fc-copy').onclick = function () { copy(S.toText(reps(), new Date().toLocaleString()), 'Report copied'); };
	$('fc-txt').onclick = function () { download('file-safety-check-' + stamp() + '.txt', S.toText(reps(), new Date().toLocaleString())); };
	$('fc-csv').onclick = function () { download('file-safety-check-' + stamp() + '.csv', '﻿' + S.toCSV(reps()), 'text/csv'); };
	$('fc-clear').onclick = function () { stopFlag = true; queue = []; items = []; view.open = {}; $('fc-out').hidden = true; progress(); };

	/* ---------- link checker ---------- */
	function checkLink(raw) {
		var r = S.checkUrl(raw), out = $('fc-uout');
		out.hidden = false;
		if (!r.input) { out.innerHTML = ''; out.hidden = true; return; }
		var head = r.host ? '<div class="fc-uhost"><span class="fc-meta">Site</span> <b>' + esc(r.registrable || r.host) + '</b>' + (r.registrable && r.registrable !== r.host ? '<div class="fc-meta">Full name: ' + esc(r.host) + '</div>' : '') + (r.hostUnicode !== r.host ? '<div class="fc-meta">Shown as: ' + esc(r.hostUnicode) + '</div>' : '') + '</div>' : '';
		var fs = r.findings.filter(function (f) { return f.level >= 1; }), info = r.findings.filter(function (f) { return f.level === 0; });
		var verdict = r.level >= 3 ? 'This link uses tricks that real sites don\'t use. Don\'t open it.' : r.level === 2 ? 'Be careful: this link has warning signs.' : 'No obvious tricks found. That doesn\'t prove the site is safe: check it on the services below too.';
		var full = r.href || r.input;
		var html = '<div class="tu-card fc-ures fc-row--' + LW[r.level <= 1 ? 0 : r.level] + '"><div class="fc-uv">' + badge(r.level) + ' <span>' + esc(verdict) + '</span></div>' + head +
			(fs.length || info.length ? findList(fs.concat(info)) : '') +
			(r.embedded.length ? '<div class="fc-emb">Address inside it: ' + r.embedded.map(function (e) { return '<button type="button" class="fc-link" data-u="' + esc(e) + '">' + esc(e.slice(0, 90)) + ' (check)</button>'; }).join(' ') + '</div>' : '') +
			(r.href ? '<h3 class="fc-h3">Check it on a reputation service</h3><div class="tu-row fc-look">' +
				'<a class="tu-btn tu-btn--ghost" href="' + S.links.vtUrl(full) + '" target="_blank" rel="noopener noreferrer">VirusTotal ↗</a>' +
				'<a class="tu-btn tu-btn--ghost" href="' + S.links.gsb(full) + '" target="_blank" rel="noopener noreferrer">Google Safe Browsing ↗</a>' +
				'<a class="tu-btn tu-btn--ghost" href="' + S.links.urlscan(r.host) + '" target="_blank" rel="noopener noreferrer">urlscan.io ↗</a></div>' +
				'<p class="tu-note">Each button opens that service in a new tab and sends it this link (not your files). VirusTotal and urlscan.io may need you to press their own scan button for a link nobody has checked yet.</p>' : '') +
			'</div>';
		out.innerHTML = html;
	}
	$('fc-uform').onsubmit = function (e) { e.preventDefault(); checkLink($('fc-url').value); };
	$('fc-uex').onclick = function (e) { var b = e.target.closest('[data-u]'); if (!b) return; $('fc-url').value = b.getAttribute('data-u'); checkLink(b.getAttribute('data-u')); };
	$('fc-uout').onclick = function (e) { var b = e.target.closest('[data-u]'); if (!b) return; $('fc-url').value = b.getAttribute('data-u'); checkLink(b.getAttribute('data-u')); };
	var uT; $('fc-url').oninput = function () { clearTimeout(uT); var v = this.value; uT = setTimeout(function () { if (v.trim().length > 4) checkLink(v); }, 400); };

	/* paste a file anywhere on the Files tab */
	document.addEventListener('paste', function (e) {
		if ($('fc-p-files').hidden || /input|textarea/i.test((e.target && e.target.tagName) || '')) return;
		var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(Array.prototype.map.call(fs, function (f) { return { file: f }; })); }
	});

	function panels() {
		if (!window.MESPanel) { if (document.readyState !== 'complete') return void setTimeout(panels, 200); return; }
		window.MESPanel.add($('fc-res'), { bar: $('fc-pbar') });
	}
	panels();
	if (!OPTS.inflateRaw) toast('This browser can\'t unpack zip files, so files inside zips are checked by name only.');
})();
