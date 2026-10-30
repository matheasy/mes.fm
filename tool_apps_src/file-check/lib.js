/* MES File Safety Check: pure detection logic (runs in the browser and in node: require('./tool_apps_src/file-check/lib.js')).
   It looks at what a file really is and at the tricks malware commonly uses. It is NOT an antivirus: it has no virus signatures,
   so "no red flags" never means "safe". Tests: node tool_apps_src/file-check-tests.js.

   analyze(src, name, opts) -> Promise<report>
     src  = { size, read(offset, length) -> Promise<Uint8Array> }  (MESScan.bytesSource(u8) wraps a byte array)
     opts = { inflateRaw(u8) -> Promise<u8>, inflate(u8) -> Promise<u8> (zlib), depth }
     report = { name, size, type: {id, label, family}, level 0-3, findings: [{level, code, msg}], children: [report], info: {} }
   Levels: 0 = no red flags, 1 = note (just so you know), 2 = caution, 3 = danger. */
var MESScan = (function () {
	'use strict';
	var LEVELS = [
		{ key: 'ok', word: 'No red flags' },
		{ key: 'note', word: 'Note' },
		{ key: 'caution', word: 'Caution' },
		{ key: 'danger', word: 'Danger' }
	];

	/* ---------- small helpers ---------- */
	function latin1(u8, a, b) {
		a = a || 0; b = b == null ? u8.length : Math.min(b, u8.length);
		var out = '', CH = 8192;
		for (var i = a; i < b; i += CH) out += String.fromCharCode.apply(null, u8.subarray(i, Math.min(b, i + CH)));
		return out;
	}
	function utf8(u8) { try { return new TextDecoder('utf-8').decode(u8); } catch (e) { return latin1(u8); } }
	function utf16(u8, a, b) {
		var s = ''; a = a || 0; b = b == null ? u8.length : b;
		for (var i = a; i + 1 < b; i += 2) { var c = u8[i] | (u8[i + 1] << 8); if (!c) break; s += String.fromCharCode(c); }
		return s;
	}
	function u16(u8, o) { return u8[o] | (u8[o + 1] << 8); }
	function u32(u8, o) { return (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16)) + u8[o + 3] * 16777216; }
	function u32be(u8, o) { return u8[o] * 16777216 + ((u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]); }
	function u64(u8, o) { return u32(u8, o) + u32(u8, o + 4) * 4294967296; }
	function starts(u8, sig, off) { off = off || 0; for (var i = 0; i < sig.length; i++) if (u8[off + i] !== sig[i]) return false; return u8.length >= off + sig.length; }
	function startsStr(u8, s, off) { off = off || 0; if (u8.length < off + s.length) return false; for (var i = 0; i < s.length; i++) if (u8[off + i] !== s.charCodeAt(i)) return false; return true; }
	function indexOfStr(u8, s, from, to) {
		var n = s.length, c0 = s.charCodeAt(0); to = Math.min(to == null ? u8.length : to, u8.length) - n;
		for (var i = from || 0; i <= to; i++) { if (u8[i] !== c0) continue; var ok = true; for (var j = 1; j < n; j++) if (u8[i + j] !== s.charCodeAt(j)) { ok = false; break; } if (ok) return i; }
		return -1;
	}
	function fmtBytes(n) {
		if (n == null || !isFinite(n)) return '';
		if (n < 1024) return n + ' B';
		var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
		do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
		return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u[i];
	}
	function aN(w) { return (/^[aeiouAEIOU]/.test(w) && !/^(Windows|Unicode|UTF|One)/.test(w) ? 'an ' : 'a ') + w; }
	function bytesSource(u8) { return { size: u8.length, read: function (o, l) { return Promise.resolve(u8.subarray(Math.max(0, o), Math.min(u8.length, o + l))); } }; }
	function add(rep, level, code, msg) { rep.findings.push({ level: level, code: code, msg: msg }); if (level > rep.level) rep.level = level; }
	function has(rep, code) { return rep.findings.some(function (f) { return f.code === code; }); }

	/* ---------- the EICAR test string, stored reversed so this script itself is never mistaken for the test file ---------- */
	var EICAR = '*H+H$!ELIF-TSET-SURIVITNA-DRADNATS-RACIE$}7)CC7)^P(45XZP\\4[PA@%P!O5X'.split('').reverse().join('');
	function eicarBytes() { var u = new Uint8Array(EICAR.length); for (var i = 0; i < EICAR.length; i++) u[i] = EICAR.charCodeAt(i); return u; }
	/* the official rule: the file starts with the 68 characters and is at most 128 bytes, the rest being white space */
	function isEicar(u8, size) {
		if (size > 128 || !startsStr(u8, EICAR)) return false;
		for (var i = EICAR.length; i < u8.length; i++) if ([9, 10, 13, 26, 32].indexOf(u8[i]) < 0) return false;
		return true;
	}

	/* ---------- extensions ---------- */
	/* family: what a file with this ending is expected to be. run: 0 data, 1 can run code / change the system, 2 rarely legitimate in a download */
	var EXT = {};
	function ext(list, family, run, label) { list.split(' ').forEach(function (e) { EXT[e] = { family: family, run: run, label: label }; }); }
	ext('exe com scr pif cpl dll sys ocx drv efi', 'program', 1, 'Windows program');
	ext('msi msp mst msix msixbundle appx appxbundle appinstaller', 'program', 1, 'Windows installer');
	ext('bat cmd ps1 psm1 vbs vbe js jse wsf wsh wsc sct hta reg inf scf msc gadget application appref-ms settingcontent-ms library-ms searchconnector-ms xll iqy slk cpl', 'script', 1, 'Windows script or system file');
	ext('lnk', 'shortcut', 1, 'Windows shortcut');
	ext('url webloc desktop website', 'shortcut', 0, 'web shortcut');
	ext('jar class', 'program', 1, 'Java program');
	ext('apk xapk aab', 'program', 1, 'Android app');
	ext('dmg pkg mpkg app command tool scpt applescript workflow terminal', 'program', 1, 'Mac program or script');
	ext('sh bash zsh run bin elf deb rpm appimage py pyw pl rb php', 'script', 1, 'script or Linux program');
	ext('iso img vhd vhdx udf', 'diskimage', 1, 'disk image');
	ext('docm dotm xlsm xltm xlam pptm potm ppsm ppam sldm', 'office', 1, 'Office file with macros');
	ext('doc dot xls xlt xla ppt pps pot rtf one', 'office', 0, 'older Office file');
	ext('docx dotx xlsx xltx pptx ppsx potx vsdx', 'office', 0, 'Office file');
	ext('odt ods odp odg epub', 'office', 0, 'document');
	ext('pdf', 'pdf', 0, 'PDF');
	ext('zip 7z rar gz tgz bz2 xz tar cab zipx z lz lzma zst arj ace', 'archive', 0, 'archive');
	ext('jpg jpeg png gif webp bmp tif tiff ico heic heif avif jfif', 'image', 0, 'picture');
	ext('svg', 'svg', 0, 'SVG picture');
	ext('mp3 wav ogg flac m4a aac opus wma', 'media', 0, 'audio');
	ext('mp4 mov mkv avi webm wmv m4v flv mpg mpeg 3gp', 'media', 0, 'video');
	ext('html htm xhtml mht mhtml shtml', 'html', 0, 'web page');
	ext('txt md csv tsv log json xml yml yaml ini cfg conf eml msg ics vcf srt', 'text', 0, 'text');
	ext('ttf otf woff woff2', 'font', 0, 'font');
	var RARE = { pif: 1, hta: 1, vbe: 1, jse: 1, wsf: 1, wsh: 1, sct: 1, 'settingcontent-ms': 1, scf: 1 };
	var DOCISH = { pdf: 1, doc: 1, docx: 1, xls: 1, xlsx: 1, ppt: 1, pptx: 1, txt: 1, rtf: 1, jpg: 1, jpeg: 1, png: 1, gif: 1, mp3: 1, mp4: 1, mov: 1, csv: 1, odt: 1, zip: 1, html: 1, htm: 1, wav: 1, avi: 1, heic: 1, webp: 1, invoice: 0 };
	var BIDI = /[‪-‮⁦-⁩‎‏؜]/;

	function nameInfo(name) {
		var base = String(name || '').split(/[\\/]/).pop(), m = base.toLowerCase().match(/\.([a-z0-9-]{1,20})$/);
		var e = m ? m[1] : '', parts = base.toLowerCase().split('.'), prev = parts.length > 2 ? parts[parts.length - 2].trim() : '';
		return { base: base, ext: e, prev: prev, info: EXT[e] || null };
	}
	/* findings that come from the name alone (also used for the entries of an archive we can't open) */
	function nameFindings(rep, name) {
		var n = nameInfo(name), e = n.ext, info = n.info;
		if (BIDI.test(n.base)) {
			var shown = n.base.replace(/[‪-‮⁦-⁩‎‏؜]/g, '');
			add(rep, 3, 'rlo', 'The name hides invisible right-to-left characters, which flip how the end of the name is shown, so a program can look like "' + reversedLook(n.base) + '". The real ending is ".' + (e || '?') + '" (name without the hidden characters: ' + shown + ').');
		}
		if (/(\s{3,}|[ -​　 ]{2,}|_{8,})\.[a-z0-9]{1,6}$/i.test(n.base)) add(rep, info && info.run ? 3 : 2, 'pad', 'Lots of spaces before the real ending (".' + e + '"), so the ending is pushed out of view in many windows.');
		if (n.prev && DOCISH[n.prev] && info && info.run) add(rep, 3, 'double', 'Double ending: it looks like a .' + n.prev + ' file, but the last ending ".' + e + '" is what counts, so it is really ' + aN(info.label) + '. Windows hides the last ending by default, so it would show as "' + n.base.replace(/\.[^.]+$/, '') + '".');
		if (info && info.run && !has(rep, 'double') && !has(rep, 'rlo')) {
			if (RARE[e]) add(rep, 3, 'rare', '".' + e + '" is ' + aN(info.label) + ' that runs code when opened and is almost never sent for a good reason.');
			else if (info.family === 'office') add(rep, 2, 'macroext', 'The ".' + e + '" ending means this Office file can carry macros (small programs).');
			else if (info.family === 'diskimage') add(rep, 2, 'disk', 'Disk image: double-clicking it on Windows opens it like a drive, and the files inside may skip the "downloaded from the internet" warning.');
			else add(rep, 2, 'runs', 'This is ' + aN(info.label) + ' (".' + e + '"): it can run code or change your system. Only open it if you trust where it came from.');
		}
		return n;
	}
	function reversedLook(base) {
		var i = base.search(/[‮]/); if (i < 0) return base.replace(/[‪-‮⁦-⁩‎‏؜]/g, '');
		return base.slice(0, i) + base.slice(i + 1).split('').reverse().join('').replace(/[‪-‮⁦-⁩‎‏؜]/g, '');
	}

	/* ---------- what is it really (magic bytes) ---------- */
	function T(id, label, family) { return { id: id, label: label, family: family }; }
	function sniff(h, size, tail) {
		if (!h || !h.length) return T('empty', 'Empty file', 'empty');
		if (startsStr(h, 'MZ')) {
			var pe = h.length > 0x40 ? u32(h, 0x3C) : 0;
			if (pe > 0 && pe + 24 < h.length && startsStr(h, 'PE\0\0', pe)) {
				var ch = u16(h, pe + 22), dll = (ch & 0x2000) !== 0, opt = pe + 24, magic = u16(h, opt), clr = false;
				var dd = magic === 0x20b ? opt + 112 : opt + 96; // data directories; #14 = CLR header (.NET)
				if (dd + 15 * 8 <= h.length) clr = u32(h, dd + 14 * 8) !== 0;
				return T(dll ? 'dll' : 'exe', 'Windows ' + (dll ? 'library (DLL)' : 'program (.exe)') + (clr ? ', .NET' : '') + (magic === 0x20b ? ', 64-bit' : ''), 'program');
			}
			return T('mz', 'DOS / Windows program (MZ)', 'program');
		}
		if (starts(h, [0x7F, 0x45, 0x4C, 0x46])) return T('elf', 'Linux program (ELF)', 'program');
		if (starts(h, [0xCF, 0xFA, 0xED, 0xFE]) || starts(h, [0xCE, 0xFA, 0xED, 0xFE]) || starts(h, [0xFE, 0xED, 0xFA, 0xCF]) || starts(h, [0xFE, 0xED, 0xFA, 0xCE])) return T('macho', 'Mac program (Mach-O)', 'program');
		if (starts(h, [0xCA, 0xFE, 0xBA, 0xBE]) && h.length >= 8) return u32be(h, 4) > 0 && u32be(h, 4) < 30 ? T('macho', 'Mac program (Mach-O universal)', 'program') : T('class', 'Java class file', 'program');
		if (startsStr(h, 'dex\n')) return T('dex', 'Android code (DEX)', 'program');
		if (starts(h, [0x4C, 0, 0, 0, 1, 0x14, 2, 0])) return T('lnk', 'Windows shortcut (.lnk)', 'shortcut');
		if (starts(h, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return T('cfb', 'Older Office / Windows Installer file (OLE)', 'office');
		if (startsStr(h, 'PK\x03\x04') || startsStr(h, 'PK\x05\x06') || startsStr(h, 'PK\x07\x08')) return T('zip', 'ZIP archive', 'archive');
		var pdfAt = indexOfStr(h, '%PDF-', 0, 1024);
		if (pdfAt >= 0) return T('pdf', 'PDF document', 'pdf');
		if (startsStr(h, '{\\rt')) return T('rtf', 'Rich Text (RTF)', 'office');
		if (starts(h, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) return T('7z', '7-Zip archive', 'archive');
		if (startsStr(h, 'Rar!\x1a\x07')) return T('rar', 'RAR archive', 'archive');
		if (starts(h, [0x1F, 0x8B])) return T('gz', 'GZIP archive', 'archive');
		if (startsStr(h, 'BZh')) return T('bz2', 'BZIP2 archive', 'archive');
		if (starts(h, [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0])) return T('xz', 'XZ archive', 'archive');
		if (startsStr(h, 'MSCF')) return T('cab', 'Windows cabinet (CAB)', 'archive');
		if (startsStr(h, 'ustar', 257)) return T('tar', 'TAR archive', 'archive');
		if (startsStr(h, 'xar!')) return T('xar', 'Mac installer (.pkg / XAR)', 'program');
		if (startsStr(h, '!<arch>')) return T('deb', 'Linux package (.deb)', 'program');
		if (starts(h, [0xED, 0xAB, 0xEE, 0xDB])) return T('rpm', 'Linux package (.rpm)', 'program');
		if (startsStr(h, 'conectix') || startsStr(h, 'vhdxfile') || (tail && startsStr(tail, 'conectix'))) return T('vhd', 'Virtual hard disk (VHD)', 'diskimage');
		if (startsStr(h, 'CD001', 32769) || startsStr(h, 'CD001', 34817)) return T('iso', 'Disk image (ISO)', 'diskimage');
		if (tail && tail.length >= 512 && startsStr(tail, 'koly', tail.length - 512)) return T('dmg', 'Mac disk image (DMG)', 'diskimage');
		if (startsStr(h, '\0asm')) return T('wasm', 'WebAssembly', 'program');
		if (starts(h, [0x89, 0x50, 0x4E, 0x47])) return T('png', 'PNG picture', 'image');
		if (starts(h, [0xFF, 0xD8, 0xFF])) return T('jpg', 'JPEG picture', 'image');
		if (startsStr(h, 'GIF87a') || startsStr(h, 'GIF89a')) return T('gif', 'GIF picture', 'image');
		if (startsStr(h, 'RIFF') && startsStr(h, 'WEBP', 8)) return T('webp', 'WebP picture', 'image');
		if (startsStr(h, 'RIFF') && startsStr(h, 'WAVE', 8)) return T('wav', 'WAV audio', 'media');
		if (startsStr(h, 'RIFF') && startsStr(h, 'AVI ', 8)) return T('avi', 'AVI video', 'media');
		if (startsStr(h, 'BM') && h.length > 14 && u32(h, 2) === size) return T('bmp', 'BMP picture', 'image');
		if (startsStr(h, 'II*\0') || startsStr(h, 'MM\0*')) return T('tif', 'TIFF picture', 'image');
		if (starts(h, [0, 0, 1, 0]) && h.length > 6 && h[4] > 0) return T('ico', 'Icon (ICO)', 'image');
		if (startsStr(h, 'ftyp', 4)) {
			var br = latin1(h, 8, 12);
			if (/^(heic|heix|mif1|msf1|heim|heis|hevc|avif)/.test(br)) return T('heic', 'HEIC / AVIF picture', 'image');
			if (/^M4A/.test(br)) return T('m4a', 'M4A audio', 'media');
			return T('mp4', 'MP4 / MOV video', 'media');
		}
		if (starts(h, [0x1A, 0x45, 0xDF, 0xA3])) return T('mkv', 'Matroska / WebM video', 'media');
		if (startsStr(h, 'ID3') || (h[0] === 0xFF && (h[1] & 0xE0) === 0xE0)) return T('mp3', 'MP3 audio', 'media');
		if (startsStr(h, 'OggS')) return T('ogg', 'Ogg audio / video', 'media');
		if (startsStr(h, 'fLaC')) return T('flac', 'FLAC audio', 'media');
		if (starts(h, [0x30, 0x26, 0xB2, 0x75])) return T('wmv', 'Windows Media (ASF)', 'media');
		if (startsStr(h, 'wOFF') || startsStr(h, 'wOF2') || startsStr(h, 'OTTO') || starts(h, [0, 1, 0, 0, 0])) return T('font', 'Font', 'font');
		if (startsStr(h, 'SQLite format 3')) return T('sqlite', 'SQLite database', 'data');
		if (startsStr(h, 'bplist00')) return T('bplist', 'Apple property list (binary)', 'text');
		if (startsStr(h, 'MSWIM')) return T('wim', 'Windows image (WIM)', 'diskimage');
		if (isText(h)) return sniffText(h);
		return T('bin', 'Unknown binary data', 'unknown');
	}
	function isText(h) {
		var n = Math.min(h.length, 4096), bad = 0;
		if (starts(h, [0xFF, 0xFE]) || starts(h, [0xFE, 0xFF])) return true;
		for (var i = 0; i < n; i++) { var c = h[i]; if (c === 0) return false; if (c < 9 || (c > 13 && c < 32 && c !== 27)) bad++; }
		return bad <= n * 0.02;
	}
	function sniffText(h) {
		var s = (starts(h, [0xFF, 0xFE]) ? utf16(h, 2, 4096) : latin1(h, 0, 4096)).replace(/^﻿|^\xEF\xBB\xBF/, '').trimStart(), lo = s.toLowerCase();
		if (lo.indexOf('[internetshortcut]') === 0) return T('url', 'Internet shortcut (.url)', 'shortcut');
		if (lo.indexOf('[desktop entry]') === 0) return T('desktop', 'Linux desktop shortcut', 'shortcut');
		if (s.indexOf('#!') === 0) return T('shebang', 'Script (' + (s.split('\n')[0].slice(2, 40).trim() || 'shell') + ')', 'script');
		if (/^<\?xml[^>]*>\s*(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(lo) || /^<svg[\s>]/.test(lo)) return T('svg', 'SVG picture (text)', 'svg');
		if (/^<!doctype plist|^<\?xml[^>]*>\s*<!doctype plist|<plist[\s>]/.test(lo.slice(0, 300))) return T('plist', 'Apple property list', 'text');
		if (/^(<!--[\s\S]*?-->\s*)*(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]|<meta[\s>]|<iframe[\s>]|<form[\s>])/.test(lo)) return T('html', 'Web page (HTML)', 'html');
		if (/^(mime-version:|received:|return-path:|from:[^\n]*\n(to|subject|date):)/.test(lo)) return T('eml', 'E-mail message', 'text');
		if (/^<\?xml/.test(lo)) return T('xml', 'XML text', 'text');
		if (/^[\[{]/.test(s) && /^[\[{]\s*["\[{\]}0-9-tfn]/.test(s)) return T('json', 'JSON text', 'text');
		return T('text', 'Plain text', 'text');
	}

	/* does the real type fit the name's ending? */
	var OK_FOR = {
		archive: { archive: 1, office: 1, program: 1 }, office: { office: 1, archive: 1, program: 1 }, // docx / jar / apk / msi are zip or OLE files
		program: { program: 1, script: 1, shortcut: 1 }, text: { text: 1, script: 1, html: 1, svg: 1, shortcut: 1, office: 1 },
		html: { html: 1, text: 1 }, svg: { svg: 1, image: 1, text: 1 }, image: { image: 1 }, media: { media: 1 }, pdf: { pdf: 1 },
		font: { font: 1 }, diskimage: { diskimage: 1, archive: 1 }, shortcut: { shortcut: 1, text: 1 }, data: { data: 1 }, unknown: {}, empty: {}, script: { script: 1, text: 1 }
	};
	function mismatch(rep, n, t) {
		var want = n.info ? n.info.family : null, real = t.family;
		if (real === 'empty' || real === 'unknown' || real === 'data') return;
		var codeLike = real === 'program' || t.id === 'lnk' || (t.id === 'cfb' && n.ext === 'msi');
		if (codeLike) {
			if (!want) add(rep, 2, 'noext', 'This is really ' + aN(t.label) + ' even though its name has ' + (n.ext ? 'the unusual ending ".' + n.ext + '"' : 'no ending') + '.');
			else if (want !== 'program' && want !== 'script' && want !== 'shortcut') add(rep, 3, 'disguised', 'Disguised program: the name says ".' + n.ext + '" (' + n.info.label + '), but the bytes inside are ' + aN(t.label) + '.');
			else if (!has(rep, 'runs') && !has(rep, 'rare') && !has(rep, 'double')) add(rep, 2, 'program', 'This is ' + aN(t.label) + ': it runs code on your computer. Only open it if you trust where it came from.');
			return;
		}
		if (!want) return;
		var ok = OK_FOR[want] || {};
		if (ok[real]) return;
		if (real === 'html' || real === 'svg') add(rep, 2, 'htmldisguise', 'Named like ' + aN(n.info.label) + ' (".' + n.ext + '"), but it is really ' + aN(t.label) + ', which can run scripts when opened in a browser.');
		else if (real === 'diskimage') add(rep, 3, 'disguisedimg', 'Named ".' + n.ext + '" but it is really ' + aN(t.label) + ', a common way to smuggle programs past e-mail filters.');
		else add(rep, 2, 'mismatch', 'The name says ".' + n.ext + '" (' + n.info.label + '), but the file is really ' + aN(t.label) + '. Renamed files are a common trick; it may also just be a mistake.');
	}

	/* ---------- text checks (scripts, HTML, SVG, CSV, shortcuts) ---------- */
	var TEXT_RULES = [
		[3, 'psenc', /powershell(\.exe)?["']?[^\n]{0,120}?\s-(e|ec|en|enc|enco|encod|encode|encodedcommand)\s+[A-Za-z0-9+\/=]{20,}/i, 'Runs PowerShell with a hidden (encoded) command.'],
		[2, 'download', /FromBase64String|\bIEX\b|Invoke-Expression|DownloadString|DownloadFile|Invoke-WebRequest|Net\.WebClient|Start-BitsTransfer|URLDownloadToFile|MSXML2\.XMLHTTP|Microsoft\.XMLHTTP|WinHttpRequest/i, 'Downloads or runs other code (PowerShell / Windows Script commands).'],
		[2, 'wsh', /WScript\.Shell|Shell\.Application|Scripting\.FileSystemObject|ADODB\.Stream|ActiveXObject\s*\(/i, 'Uses Windows Script objects that can run programs and write files.'],
		[2, 'lolbin', /\b(mshta|regsvr32|rundll32|certutil(\.exe)?\s+-(urlcache|decode)|bitsadmin|wmic\s+process\s+call|schtasks\s+\/create|vssadmin\s+delete|bcdedit)\b/i, 'Calls Windows tools that malware often misuses (mshta, regsvr32, rundll32, certutil, schtasks ...).'],
		[2, 'obfjs', /eval\s*\(\s*(atob|unescape|decodeURIComponent|String\.fromCharCode|function\s*\(p,\s*a,\s*c,\s*k,\s*e)|document\.write\s*\(\s*(unescape|atob)\s*\(/i, 'Hides its code (eval of decoded text), a common way to sneak past filters.'],
		[3, 'tgbot', /api\.telegram\.org\/bot/i, 'Sends data to a Telegram bot, a common way phishing pages pass on stolen passwords.'],
		[2, 'curlsh', /(curl|wget)\s+[^\n|;]{4,200}\|\s*(ba|z)?sh\b/i, 'Downloads a script from the internet and runs it straight away (curl ... | sh).'],
		[2, 'osascript', /osascript\s+-e|do shell script/i, 'Runs Mac shell commands (osascript / do shell script).']
	];
	function textChecks(rep, s, t, n) {
		var isWeb = t.family === 'html' || t.family === 'svg' || (n.info && (n.info.family === 'html' || n.ext === 'svg'));
		var plain = !isWeb && t.family === 'text' && (!n.info || n.info.family === 'text' || n.info.family === 'office' || n.info.family === 'pdf' || n.info.family === 'image');
		TEXT_RULES.forEach(function (r) { if (r[2].test(s)) add(rep, plain ? 1 : r[0], r[1], (plain ? 'Mentions commands that can be harmful (a text file can\'t run them by itself): ' : '') + r[3]); });
		var fcc = (s.match(/fromCharCode/g) || []).length; if (fcc > 40) add(rep, 2, 'fcc', 'Builds text from character codes ' + fcc + ' times, a common way to hide what a script does.');
		var b64 = s.match(/[A-Za-z0-9+\/]{3000,}={0,2}/); if (b64 && !/^data:image/.test(s.slice(Math.max(0, b64.index - 30), b64.index))) add(rep, 1, 'b64', 'Contains a long block of encoded data (' + fmtBytes(Math.round(b64[0].length * 0.75)) + ').');
		if (isWeb) {
			var lo = s.toLowerCase(), scripts = (lo.match(/<script[\s>]/g) || []).length, ev = (lo.match(/\son(load|error|click|mouseover|focus|begin|end|animationstart)\s*=/g) || []).length;
			if (t.family === 'svg' || n.ext === 'svg') { if (scripts || ev || /javascript:/.test(lo)) add(rep, 2, 'svgscript', 'This SVG picture contains script' + (ev ? ' / event handlers' : '') + '. Normal pictures do not need any; opened in a browser it can run like a web page.'); }
			else if (scripts) add(rep, 1, 'scripts', 'Web page with ' + scripts + ' script' + (scripts > 1 ? 's' : '') + '.');
			var pw = /<input[^>]*type\s*=\s*["']?password/i.test(s), mail = /<input[^>]*(type\s*=\s*["']?email|name\s*=\s*["']?(email|user|login))/i.test(s);
			var sends = /<form[^>]*action\s*=\s*["']?https?:/i.test(s) || /\b(fetch|XMLHttpRequest|\$\.(ajax|post)|sendBeacon|navigator\.sendBeacon)\b/.test(s) || /api\.telegram\.org|formspree|formsubmit|discord(app)?\.com\/api\/webhooks|script\.google\.com\/macros/i.test(s);
			if (pw) add(rep, sends ? 3 : 2, 'login', 'Asks for a password' + (sends ? ' and sends what you type to the internet' : '') + '. A login form inside a file is the classic phishing pattern: real sites never ask you to log in through an attachment.');
			else if (mail && sends) add(rep, 1, 'form', 'Has a form that sends what you type to the internet.');
			if (/atob\s*\(/.test(s) && /new\s+Blob\s*\(/.test(s) && /(\.download\s*=|msSaveOrOpenBlob|createObjectURL)/.test(s)) add(rep, 3, 'smuggle', 'Builds a file inside the page and saves it to your computer ("HTML smuggling"), a trick to get a download past e-mail filters.');
			var re = s.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]+url\s*=\s*['"]?\s*(https?:\/\/[^'"\s>]+)/i) || s.match(/(?:window\.|document\.|top\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)/i) || s.match(/location\.replace\s*\(\s*["'](https?:\/\/[^"']+)/i);
			if (re) { var u = checkUrl(re[1]); add(rep, Math.max(1, u.level), 'redirect', 'Sends you on to ' + (u.hostUnicode || u.host || re[1]) + ' as soon as it opens.' + (u.level >= 2 ? ' That address has warning signs: ' + u.findings.filter(function (f) { return f.level >= 2; }).map(function (f) { return f.msg; })[0] : '')); }
		}
		if (n.ext === 'csv' || n.ext === 'tsv' || n.ext === 'slk') {
			if (/(^|[,;\t\n"])\s*[=+\-@][^,\n]{0,60}\|\s*['"]?\s*\/?[a-z]/im.test(s) || /(^|[,;\t\n"])\s*=\s*(cmd|powershell|mshta|msexcel)\|/im.test(s) || /(^|[,;\t\n"])\s*=\s*(HYPERLINK|WEBSERVICE|IMPORTXML|IMPORTDATA)\s*\(/im.test(s)) add(rep, 3, 'csvinject', 'A cell starts with a formula that can run a command or reach the internet when opened in Excel (formula / DDE injection).');
		}
	}
	function shortcutChecks(rep, s, t, n) {
		var url = null, m;
		if (t.id === 'url' || n.ext === 'url' || n.ext === 'website') {
			m = s.match(/^\s*URL\s*=\s*(.+)$/im); url = m ? m[1].trim() : null;
			var icon = s.match(/^\s*IconFile\s*=\s*(.+)$/im);
			if (icon && /^(\\\\|file:)/i.test(icon[1].trim())) add(rep, 3, 'uncicon', 'Its icon is loaded from a network share (' + icon[1].trim().slice(0, 60) + '). Just showing the file can make Windows send your login details to that server.');
		} else if (t.id === 'plist' || n.ext === 'webloc') {
			m = s.match(/<key>\s*URL\s*<\/key>\s*<string>([^<]+)<\/string>/i) || s.match(/((?:https?|file|smb|afp|ftp):\/\/[\x21-\x7e]+)/i); url = m ? m[1].trim() : null;
		} else if (t.id === 'desktop' || n.ext === 'desktop') {
			m = s.match(/^\s*Exec\s*=\s*(.+)$/im); if (m) add(rep, 2, 'desktopexec', 'Linux shortcut that runs the command: ' + m[1].trim().slice(0, 120));
		}
		if (url) {
			rep.info.target = url;
			if (/^(file:|\\\\|smb:|afp:)/i.test(url)) add(rep, 3, 'shortfile', 'This shortcut opens something on a network share or on your computer (' + url.slice(0, 80) + '), not a web page. That is how these shortcuts are used to start programs.');
			else if (/^(javascript|vbscript|data):/i.test(url)) add(rep, 3, 'shortjs', 'This shortcut runs code (' + url.split(':')[0] + ':) instead of opening a web page.');
			else {
				var u = checkUrl(url);
				add(rep, Math.max(1, u.level), 'shorturl', 'Shortcut to ' + (u.hostUnicode || u.host || url) + '.' + (u.level >= 2 ? ' Warning signs about that address: ' + u.findings.filter(function (f) { return f.level >= 2; }).map(function (f) { return f.msg; }).join(' ') : ''));
			}
		}
	}
	function lnkChecks(rep, h) {
		var s = (latin1(h) + ' ' + utf16asciiAll(h)).toLowerCase();
		var hits = ['powershell', 'cmd.exe', 'mshta', 'wscript', 'cscript', 'rundll32', 'regsvr32', 'certutil', 'bitsadmin', 'conhost'].filter(function (k) { return s.indexOf(k) >= 0; });
		if (hits.length) add(rep, 3, 'lnkcmd', 'This shortcut starts ' + hits.join(', ') + '. Shortcuts that launch command tools are a common malware trick.');
		var h2 = s.match(/https?:\/\/[a-z0-9.-]+/); if (h2) add(rep, 2, 'lnkurl', 'The shortcut contains a web address: ' + h2[0]);
	}
	function utf16asciiAll(u8) { var s = ''; for (var i = 0; i + 1 < u8.length; i += 2) { var c = u8[i]; if (u8[i + 1] === 0 && c >= 32 && c < 127) s += String.fromCharCode(c); else if (s.charAt(s.length - 1) !== ' ') s += ' '; } return s; }

	/* ---------- ZIP (and the formats built on it) ---------- */
	function readZipDir(src) {
		var size = src.size, look = Math.min(size, 65557);
		return src.read(size - look, look).then(function (t) {
			var e = -1;
			for (var i = t.length - 22; i >= 0; i--) if (t[i] === 0x50 && t[i + 1] === 0x4B && t[i + 2] === 5 && t[i + 3] === 6) { e = i; break; }
			if (e < 0) return { error: 'The archive\'s table of contents is missing (damaged or not a real ZIP).' };
			var count = u16(t, e + 10), cdSize = u32(t, e + 12), cdOff = u32(t, e + 16), base = size - look;
			var z64 = e - 20 >= 0 && t[e - 20] === 0x50 && t[e - 19] === 0x4B && t[e - 18] === 6 && t[e - 17] === 7;
			var next = Promise.resolve();
			if (z64 && (count === 0xFFFF || cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF)) {
				var recOff = u64(t, e - 20 + 8);
				next = src.read(recOff, 56).then(function (r) { if (startsStr(r, 'PK\x06\x06')) { count = u64(r, 32); cdSize = u64(r, 40); cdOff = u64(r, 48); } });
			}
			return next.then(function () {
				if (cdOff + cdSize > size) { var shift = (base + e) - (cdOff + cdSize); if (shift > 0) cdOff += shift; /* self-extracting / prefixed data */ }
				return src.read(cdOff, Math.min(cdSize, 64 * 1024 * 1024)).then(function (cd) {
					var list = [], p = 0;
					while (p + 46 <= cd.length && list.length < 20000 && u32(cd, p) === 0x02014b50) {
						var flags = u16(cd, p + 8), method = u16(cd, p + 10), cs = u32(cd, p + 20), us = u32(cd, p + 24), nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32), off = u32(cd, p + 42);
						var nb = cd.subarray(p + 46, p + 46 + nl), name = (flags & 0x800) ? utf8(nb) : latin1(nb);
						var x = p + 46 + nl, xe = x + xl;
						while (x + 4 <= xe) { var id = u16(cd, x), ln = u16(cd, x + 2), q = x + 4; if (id === 1) { if (us === 0xFFFFFFFF) { us = u64(cd, q); q += 8; } if (cs === 0xFFFFFFFF) { cs = u64(cd, q); q += 8; } if (off === 0xFFFFFFFF) { off = u64(cd, q); } } x += 4 + ln; }
						list.push({ name: name, flags: flags, method: method, csize: cs, usize: us, offset: off, encrypted: !!(flags & 1) || method === 99, dir: /\/$/.test(name) });
						p += 46 + nl + xl + cl;
					}
					return { entries: list, declared: count };
				});
			});
		});
	}
	function zipEntryData(src, e, opts, limit) {
		return src.read(e.offset, 30).then(function (lh) {
			if (!startsStr(lh, 'PK\x03\x04')) throw new Error('bad local header');
			var start = e.offset + 30 + u16(lh, 26) + u16(lh, 28);
			return src.read(start, Math.min(e.csize, limit || e.csize));
		}).then(function (raw) {
			if (e.method === 0) return raw;
			if (e.method === 8 && opts.inflateRaw) return opts.inflateRaw(raw);
			throw new Error('compression method ' + e.method);
		});
	}
	function zipText(src, entries, name, opts) {
		var e = entries.filter(function (x) { return x.name === name; })[0];
		if (!e || e.usize > 30 * 1024 * 1024) return Promise.resolve(null);
		return zipEntryData(src, e, opts).then(utf8, function () { return null; });
	}

	function analyzeZip(rep, src, n, opts) {
		return readZipDir(src).then(function (z) {
			if (z.error) { add(rep, 2, 'zipbroken', z.error); return; }
			var E = z.entries, names = {};
			E.forEach(function (e) { names[e.name] = e; });
			rep.info.entries = E.length;
			if (names['[Content_Types].xml']) return analyzeOoxml(rep, src, E, names, n, opts);
			if (names['META-INF/MANIFEST.MF'] || E.some(function (e) { return /\.class$/i.test(e.name); })) {
				if (names['AndroidManifest.xml'] || names['classes.dex']) { rep.type = T('apk', 'Android app (APK)', 'program'); }
				else rep.type = T('jar', 'Java program (JAR)', 'program');
				if (!(n.info && n.info.family === 'program')) add(rep, 3, 'disguised', 'Disguised program: named ".' + (n.ext || '?') + '", but it is really ' + aN(rep.type.label) + '.');
				else if (!has(rep, 'runs')) add(rep, 2, 'program', 'This is ' + aN(rep.type.label) + ': it runs code. Only open it if you trust where it came from.');
				return;
			}
			if (names['mimetype'] && (names['content.xml'] || names['META-INF/container.xml'])) {
				rep.type = T('odf', names['META-INF/container.xml'] ? 'EPUB e-book' : 'OpenDocument file', 'office');
				if (E.some(function (e) { return /^Basic\//.test(e.name) && /\.xml$/.test(e.name) && !/script-l[bc]\.xml$/.test(e.name); })) add(rep, 2, 'odfmacro', 'Contains macros (LibreOffice / OpenOffice Basic).');
				return;
			}
			if (names['AppxManifest.xml'] || names['AppxMetadata/AppxBundleManifest.xml']) { rep.type = T('appx', 'Windows app package (MSIX / APPX)', 'program'); if (!has(rep, 'runs')) add(rep, 2, 'program', 'Windows app installer package.'); return; }
			return analyzeArchive(rep, src, E, opts);
		});
	}

	var MAX_ENTRY = 25 * 1024 * 1024, INFLATE_BUDGET = 150 * 1024 * 1024;
	function analyzeArchive(rep, src, E, opts) {
		var files = E.filter(function (e) { return !e.dir; }), enc = files.filter(function (e) { return e.encrypted; });
		var tc = 0, tu = 0, offs = {}, dup = 0;
		files.forEach(function (e) { tc += e.csize; tu += e.usize; if (offs[e.offset]) dup++; offs[e.offset] = 1; });
		rep.info.unpacked = tu;
		rep.info.list = files.slice(0, 500).map(function (e) { return { name: e.name, size: e.usize, enc: e.encrypted }; });
		if (dup > 0 && files.length > 1) add(rep, 3, 'bomb', 'Several entries point at the same data inside the archive: the trick used by "zip bombs" that unpack to a gigantic size.');
		else if ((tu > 1e9 && tu / Math.max(1, tc) > 100) || files.some(function (e) { return e.usize > 2e8 && e.usize / Math.max(1, e.csize) > 1000; })) add(rep, 3, 'bomb', 'Zip bomb warning: ' + fmtBytes(tc) + ' unpacks to ' + fmtBytes(tu) + ' (' + Math.round(tu / Math.max(1, tc)) + ' times bigger), enough to fill a disk or crash a scanner.');
		if (enc.length) {
			var encRun = enc.filter(function (e) { var i = nameInfo(e.name).info; return i && i.run; });
			add(rep, encRun.length ? 3 : 2, 'password', 'Password-protected (' + enc.length + ' of ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '), so nobody can look inside without the password. Malware is often sent this way, with the password in the message, to get past scanners.' + (encRun.length ? ' The locked files include programs or scripts: ' + encRun.slice(0, 3).map(function (e) { return e.name; }).join(', ') + '.' : ''));
		}
		var budget = { left: INFLATE_BUDGET }, depth = (opts.depth || 0) + 1, kids = [], tooDeep = depth > 3;
		var todo = files.slice(0, 2000);
		var run = todo.reduce(function (p, e) {
			return p.then(function () {
				var sub;
				if (e.encrypted || tooDeep || e.usize > MAX_ENTRY || e.usize > budget.left || (e.method !== 0 && e.method !== 8) || (e.method === 8 && !opts.inflateRaw)) {
					sub = newReport(e.name, e.usize); nameFindings(sub, e.name);
					if (!e.encrypted && !tooDeep && e.usize > MAX_ENTRY) sub.info.skipped = 'too big to unpack here';
					kids.push(sub); return;
				}
				budget.left -= e.usize;
				return zipEntryData(src, e, opts).then(function (u8) {
					return analyze(bytesSource(u8), e.name, { inflateRaw: opts.inflateRaw, inflate: opts.inflate, depth: depth });
				}).then(function (r) { kids.push(r); }, function () { sub = newReport(e.name, e.usize); nameFindings(sub, e.name); sub.info.skipped = 'could not unpack'; kids.push(sub); });
			});
		}, Promise.resolve());
		return run.then(function () {
			rep.children = kids;
			if (files.length > todo.length) add(rep, 1, 'many', 'Only the first ' + todo.length + ' of ' + files.length + ' files inside were checked.');
			bubble(rep, kids, 'Inside');
			var progs = kids.filter(function (k) { var t = k.type, i = nameInfo(k.name).info; return (t && (t.family === 'program' || t.id === 'lnk')) || (i && i.run); });
			if (progs.length && !rep.findings.some(function (f) { return f.code === 'inside' && f.level >= 2; })) add(rep, 2, 'hasprog', 'Contains ' + progs.length + ' program' + (progs.length > 1 ? 's or scripts' : ' or script') + ': ' + progs.slice(0, 4).map(function (k) { return k.name; }).join(', ') + (progs.length > 4 ? ' ...' : '') + '.');
			if (files.length === 1 && progs.length === 1) add(rep, 2, 'loneprog', 'The archive holds a single program and nothing else, a very common shape for malware sent by e-mail.');
		});
	}
	function bubble(rep, kids, word) {
		var bad = kids.filter(function (k) { return k.level >= 2; }).sort(function (a, b) { return b.level - a.level; });
		bad.slice(0, 6).forEach(function (k) {
			var f = k.findings.filter(function (x) { return x.level === k.level; })[0];
			add(rep, k.level, 'inside', word + ': ' + k.name + ': ' + (f ? f.msg : LEVELS[k.level].word));
		});
		if (bad.length > 6) add(rep, bad[0].level, 'inside', 'And ' + (bad.length - 6) + ' more files inside with warnings.');
	}

	var AUTO_MACRO = /\b(AutoOpen|Auto_Open|AutoExec|AutoClose|Auto_Close|AutoNew|Document_Open|Document_Close|DocumentOpen|Workbook_Open|Workbook_Activate|Workbook_BeforeClose|Presentation_Open)\b/i;
	var BAD_MACRO = /\b(Shell|WScript|CreateObject|URLDownloadToFile|Powershell|MSXML2|ADODB|Environ|CallByName|Kill|GetObject|XMLHTTP|RegWrite|ShellExecute)\b/i;
	function macroFindings(rep, raw, where) {
		var s = latin1(raw), auto = s.match(AUTO_MACRO), bad = s.match(BAD_MACRO);
		if (auto && bad) add(rep, 3, 'macroauto', 'Contains macros (' + where + ') that start by themselves when the file is opened (' + auto[0] + ') and use commands that can run programs or download files (' + bad[0] + '). Do not click "Enable content".');
		else if (auto) add(rep, 3, 'macroauto', 'Contains macros (' + where + ') that start by themselves when the file is opened and you click "Enable content" (' + auto[0] + ').');
		else add(rep, 2, 'macro', 'Contains macros (' + where + '): small programs inside the document. Only click "Enable content" if you trust where the file came from.');
	}
	function analyzeOoxml(rep, src, E, names, n, opts) {
		var kind = names['word/document.xml'] ? 'Word' : names['xl/workbook.xml'] || names['xl/workbook.bin'] ? 'Excel' : names['ppt/presentation.xml'] ? 'PowerPoint' : names['visio/document.xml'] ? 'Visio' : 'Office';
		rep.type = T('ooxml', kind + ' document (Office Open XML)', 'office');
		var vba = E.filter(function (e) { return /(^|\/)vbaProject\.bin$/i.test(e.name); })[0];
		var xlm = E.some(function (e) { return /^xl\/macrosheets\//i.test(e.name); });
		var jobs = [];
		if (vba) jobs.push(zipEntryData(src, vba, opts, 16 * 1024 * 1024).then(function (raw) { macroFindings(rep, raw, 'VBA'); }, function () { add(rep, 2, 'macro', 'Contains VBA macros: small programs inside the document.'); }));
		if (xlm) add(rep, 3, 'xlm', 'Contains Excel 4.0 (XLM) macro sheets, an old macro type that malware still uses because few scanners read it.');
		if ((vba || xlm) && n.ext && !/m$/.test(n.ext) && n.info && n.info.family === 'office') add(rep, 2, 'macrorename', 'It carries macros although it is named ".' + n.ext + '" (macro files normally end in "m", like .docm): it has been renamed.');
		if (E.some(function (e) { return /\/activeX\//i.test(e.name); })) add(rep, 2, 'activex', 'Contains ActiveX controls, which can run code.');
		var emb = E.filter(function (e) { return /\/embeddings\//i.test(e.name); });
		if (emb.length) {
			var ole = emb.filter(function (e) { return /oleObject\d*\.bin$/i.test(e.name); });
			add(rep, ole.length ? 2 : 1, 'embed', 'Has ' + emb.length + ' embedded object' + (emb.length > 1 ? 's' : '') + (ole.length ? ' (' + ole.length + ' OLE package' + (ole.length > 1 ? 's' : '') + ', which can hold any file, including programs)' : '') + '.');
			ole.slice(0, 5).forEach(function (e) { jobs.push(zipEntryData(src, e, opts, 8 * 1024 * 1024).then(function (raw) { var s = latin1(raw), m = s.match(/[\w ~\-]{1,60}\.(exe|scr|bat|cmd|js|jse|vbs|vbe|hta|lnk|ps1|wsf|com|pif|jar|msi)\b/i); if (m) add(rep, 3, 'olepkg', 'An embedded object is a program or script: ' + m[0].trim() + '.'); }, function () {})); });
		}
		var rels = E.filter(function (e) { return /\.rels$/i.test(e.name); }).slice(0, 200);
		rels.forEach(function (e) {
			jobs.push(zipText(src, E, e.name, opts).then(function (x) {
				if (!x) return;
				(x.match(/<Relationship\b[^>]*>/g) || []).forEach(function (r) {
					if (!/TargetMode\s*=\s*"External"/i.test(r)) return;
					var type = (r.match(/Type\s*=\s*"([^"]+)"/) || [])[1] || '', target = ((r.match(/Target\s*=\s*"([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&');
					var kind2 = type.split('/').pop();
					if (/attachedTemplate/i.test(kind2) && /^(https?:|\\\\|file:)/i.test(target)) add(rep, 3, 'template', 'Template injection: when opened, Office downloads a template from ' + target.slice(0, 100) + '. Attackers use this to pull in macros or exploits that are not in the file itself.');
					else if (/oleObject/i.test(kind2)) add(rep, 3, 'extole', 'Loads an object from the internet when opened (' + target.slice(0, 100) + '), used by several Office exploits (for example Follina, CVE-2022-30190).');
					else if (/frame|subDocument/i.test(kind2) && /^(https?:|\\\\)/i.test(target)) add(rep, 2, 'extframe', 'Loads part of the document from ' + target.slice(0, 100) + ' when opened.');
					else if (/^(\\\\|file:)/i.test(target) && !/hyperlink/i.test(kind2)) add(rep, 2, 'extunc', 'Points at a network share (' + target.slice(0, 80) + '); opening it can send your Windows login details to that server.');
					else if (/hyperlink/i.test(kind2)) { rep.info.links = (rep.info.links || 0) + 1; }
				});
			}));
		});
		['word/document.xml', 'word/header1.xml', 'word/footer1.xml'].forEach(function (nm) {
			jobs.push(zipText(src, E, nm, opts).then(function (x) {
				if (!x) return;
				var plain = x.replace(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g, ' $1 ').replace(/<[^>]+>/g, '');
				if (/\bDDE(AUTO)?\b/i.test(plain) || /w:instr="\s*DDE/i.test(x)) add(rep, 3, 'dde', 'Has a DDE field, which can start programs when the document is opened (Word asks to "update links").');
				if (/INCLUDEPICTURE\s+"?\\\\|INCLUDETEXT\s+"?https?:/i.test(plain)) add(rep, 2, 'include', 'A field loads content from outside the file when opened.');
			}));
		});
		E.filter(function (e) { return /^xl\/externalLinks\/externalLink\d+\.xml$/i.test(e.name); }).slice(0, 20).forEach(function (e) {
			jobs.push(zipText(src, E, e.name, opts).then(function (x) { if (x && /<ddeLink/i.test(x)) add(rep, 3, 'dde', 'Has a DDE link, which can start programs when the workbook is opened.'); }));
		});
		return Promise.all(jobs).then(function () { if (rep.info.links) add(rep, 1, 'links', rep.info.links + ' web link' + (rep.info.links > 1 ? 's' : '') + ' in the document.'); });
	}

	/* ---------- older Office / Windows Installer files (OLE compound file) ---------- */
	var CLSID = { '000c1084-0000-0000-c000-000000000046': 'Windows Installer (.msi)', '000c1086-0000-0000-c000-000000000046': 'Windows Installer patch (.msp)', '000c1082-0000-0000-c000-000000000046': 'Windows Installer transform (.mst)', '00020906-0000-0000-c000-000000000046': 'Word 97-2003 document', '00020820-0000-0000-c000-000000000046': 'Excel 97-2003 workbook', '64818d10-4f9b-11cf-86ea-00aa00b929e8': 'PowerPoint 97-2003 presentation' };
	function guid(u8, o) {
		function hx(b) { return (b < 16 ? '0' : '') + b.toString(16); }
		var a = [u8[o + 3], u8[o + 2], u8[o + 1], u8[o]].map(hx).join(''), b = [u8[o + 5], u8[o + 4]].map(hx).join(''), c = [u8[o + 7], u8[o + 6]].map(hx).join('');
		var d = [u8[o + 8], u8[o + 9]].map(hx).join(''), e = Array.prototype.slice.call(u8, o + 10, o + 16).map(hx).join('');
		return a + '-' + b + '-' + c + '-' + d + '-' + e;
	}
	function readCfbDir(src) {
		return src.read(0, 512).then(function (h) {
			var ss = 1 << u16(h, 30), nFat = u32(h, 44), dir0 = u32(h, 48), difat = [];
			if (ss !== 512 && ss !== 4096) throw new Error('bad sector size');
			for (var i = 0; i < 109 && i < nFat; i++) difat.push(u32(h, 76 + i * 4));
			var off = function (s) { return (s + 1) * ss; };
			nFat = Math.min(nFat, 4096);
			var fatP = Promise.all(difat.map(function (s) { return src.read(off(s), ss); }));
			return fatP.then(function (parts) {
				var fat = []; parts.forEach(function (p) { for (var i = 0; i + 3 < p.length; i += 4) fat.push(u32(p, i)); });
				var entries = [], s = dir0, guard = 0;
				function step() {
					if (s >= 0xFFFFFFFA || guard++ > 2000) return entries;
					return src.read(off(s), ss).then(function (d) {
						for (var j = 0; j + 128 <= d.length; j += 128) {
							var nl = u16(d, j + 64), type = d[j + 66];
							if (!type) continue;
							entries.push({ name: utf16(d, j, j + Math.min(64, nl)), type: type, clsid: type === 5 ? guid(d, j + 80) : null, size: u32(d, j + 120) });
						}
						s = fat[s] == null ? 0xFFFFFFFE : fat[s];
						return step();
					});
				}
				return step();
			});
		});
	}
	function analyzeCfb(rep, src, n) {
		return readCfbDir(src).then(function (E) {
			var names = E.map(function (e) { return e.name; }), root = E.filter(function (e) { return e.type === 5; })[0];
			var kind = root && CLSID[root.clsid];
			var nm = function (re) { return names.some(function (x) { return re.test(x); }); };
			if (!kind) kind = nm(/^WordDocument$/) ? 'Word 97-2003 document' : nm(/^(Workbook|Book)$/) ? 'Excel 97-2003 workbook' : nm(/^PowerPoint Document$/) ? 'PowerPoint 97-2003 presentation' : nm(/^EncryptedPackage$/) ? 'Password-protected Office file' : nm(/^__substg1\.0_/) ? 'Outlook message (.msg)' : 'OLE compound file';
			rep.type = T('cfb', kind, /Installer/.test(kind) ? 'program' : 'office');
			rep.info.streams = names.length;
			if (/Installer/.test(kind)) {
				if (n.info && n.info.family !== 'program') add(rep, 3, 'disguised', 'Disguised installer: named ".' + n.ext + '", but it is really ' + aN(kind) + '.');
				else if (!has(rep, 'runs')) add(rep, 2, 'program', 'This is ' + aN(kind) + ': it installs software and can change your system.');
				return;
			}
			if (nm(/^EncryptedPackage$/)) add(rep, 2, 'officepw', 'Password-protected Office file: its contents can\'t be checked without the password. Malware is often sent like this, with the password in the message.');
			if (nm(/^(_VBA_PROJECT_CUR|_VBA_PROJECT|VBA|Macros)$/)) {
				return src.read(0, Math.min(src.size, 32 * 1024 * 1024)).then(function (raw) { macroFindings(rep, raw, 'VBA'); });
			}
			if (nm(/^\u0001Ole10Native$/) || nm(/^ObjectPool$/)) add(rep, 1, 'oleobj', 'Contains embedded objects.');
		}, function () { add(rep, 1, 'cfbread', 'Could not read the inside of this OLE file.'); });
	}

	/* ---------- PDF ---------- */
	var PDF_NAMES = ['JavaScript', 'JS', 'OpenAction', 'AA', 'Launch', 'EmbeddedFile', 'URI', 'ObjStm', 'AcroForm', 'XFA', 'RichMedia', 'SubmitForm', 'GoToR', 'GoToE', 'Encrypt', 'ImportData'];
	function decodeNames(s) { return s.replace(/\/([A-Za-z0-9#]*#[0-9A-Fa-f]{2}[A-Za-z0-9#]*)/g, function (m, x) { return '/' + x.replace(/#([0-9A-Fa-f]{2})/g, function (q, hh) { return String.fromCharCode(parseInt(hh, 16)); }); }); }
	function countPdfNames(s, c, flags) {
		if (/\/[A-Za-z0-9]*#[0-9A-Fa-f]{2}/.test(s)) {
			(s.match(/\/[A-Za-z0-9#]*#[0-9A-Fa-f]{2}[A-Za-z0-9#]*/g) || []).slice(0, 2000).forEach(function (x) { var d = decodeNames(x).slice(1); if (/^(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|URI|RichMedia|SubmitForm|ObjStm)$/.test(d)) flags.hexName = d; });
			s = decodeNames(s);
		}
		var re = /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|URI|ObjStm|AcroForm|XFA|RichMedia|SubmitForm|GoToR|GoToE|Encrypt|ImportData)(?![A-Za-z0-9])/g, m;
		while ((m = re.exec(s))) c[m[1]] = (c[m[1]] || 0) + 1;
		var f = s.match(/\/(?:UF|F)\s*\(([^)]{1,120}\.(exe|scr|bat|cmd|js|vbs|hta|lnk|ps1|jar|msi|com|wsf|docm|xlsm|zip|iso))\)/i); if (f) flags.embName = f[1];
		var l = s.match(/\/Launch[\s\S]{0,300}?\/F\s*\(([^)]{1,120})\)/); if (l) flags.launch = l[1];
	}
	function analyzePdf(rep, src, opts) {
		var size = src.size, CH = 8 * 1024 * 1024, MAX = Math.min(size, 300 * 1024 * 1024), c = {}, flags = {}, objstm = [];
		var off = 0;
		function next() {
			if (off >= MAX) return Promise.resolve();
			var len = Math.min(CH + 256, MAX - off);
			return src.read(off, len).then(function (u8) {
				var s = latin1(u8); countPdfNames(off + CH < MAX ? s.slice(0, CH + 128) : s, c, flags);
				if (opts.inflate && objstm.length < 300) {
					var re = /\bstream\r?\n/g, m;
					while ((m = re.exec(s)) && objstm.length < 300) {
						var back = s.slice(Math.max(0, m.index - 600), m.index), oi = back.lastIndexOf(' obj'); if (oi >= 0) back = back.slice(oi);
						if (!/\/ObjStm\b/.test(back) || !/\/FlateDecode\b/.test(back) || /\/DecodeParms/.test(back)) continue;
						var start = m.index + m[0].length, end = s.indexOf('endstream', start); if (end > start) objstm.push(u8.slice(start, end));
					}
				}
				off += CH; return next();
			});
		}
		return next().then(function () {
			// the counts above double-count names that sit in the 256-byte overlap; small and harmless
			var inner = Promise.resolve();
			if (objstm.length && opts.inflate) inner = objstm.reduce(function (p, raw) { return p.then(function () { return opts.inflate(raw).then(function (u) { var c2 = {}; countPdfNames(latin1(u), c2, flags); Object.keys(c2).forEach(function (k) { c[k] = (c[k] || 0) + c2[k]; flags.inStm = flags.inStm || /JavaScript|JS|Launch|OpenAction|EmbeddedFile/.test(k); }); }, function () {}); }); }, Promise.resolve());
			return inner;
		}).then(function () {
			rep.info.pdf = c;
			var js = (c.JavaScript || 0) + (c.JS || 0), auto = (c.OpenAction || 0) + (c.AA || 0);
			if (c.Launch) add(rep, 3, 'launch', 'Has a "Launch" action, which can start a program or open a file on your computer' + (flags.launch ? ' (' + flags.launch + ')' : '') + '.');
			if (js && auto) add(rep, 3, 'pdfjs', 'Contains JavaScript (' + js + 'x) and actions that run by themselves when the PDF is opened (' + auto + 'x). Most normal PDFs have neither.');
			else if (js) add(rep, 2, 'pdfjs', 'Contains JavaScript (' + js + 'x). Some fillable forms use it, but it is also how many PDF attacks work.');
			else if (auto) add(rep, 1, 'pdfauto', 'Has ' + auto + ' automatic action' + (auto > 1 ? 's' : '') + ' (often just "open at page 1" or a zoom level).');
			if (c.EmbeddedFile) add(rep, flags.embName ? 3 : 2, 'pdfembed', 'Has ' + c.EmbeddedFile + ' file' + (c.EmbeddedFile > 1 ? 's' : '') + ' attached inside the PDF' + (flags.embName ? ', including ' + flags.embName : '') + '.');
			if (flags.hexName) add(rep, 3, 'pdfhex', 'The name "' + flags.hexName + '" is written in a disguised way (#xx codes), a trick used to hide from scanners.');
			if (flags.inStm) add(rep, 2, 'pdfstm', 'Some of these actions are hidden inside compressed object streams.');
			if (c.RichMedia) add(rep, 2, 'richmedia', 'Contains embedded Flash / rich media.');
			if (c.XFA) add(rep, 1, 'xfa', 'Uses an XFA form.');
			if (c.SubmitForm) add(rep, 1, 'submit', 'Has a form that can send what you type to a web address.');
			if (c.ImportData || c.GoToE || c.GoToR) add(rep, 1, 'goto', 'Has actions that open other files.');
			if (c.URI) add(rep, 1, 'uri', c.URI + ' web link' + (c.URI > 1 ? 's' : '') + '.');
			if (c.Encrypt) add(rep, 1, 'pdfenc', 'The PDF is encrypted, so some of its contents could not be read.');
			if (size > MAX) add(rep, 1, 'pdfbig', 'Only the first ' + fmtBytes(MAX) + ' were checked.');
		});
	}

	/* ---------- RTF ---------- */
	function analyzeRtf(rep, s) {
		var objs = (s.match(/\\object\b/g) || []).length, data = /\\objdata\b/.test(s);
		if (/\\objupdate\b/.test(s) && data) add(rep, 3, 'rtfupd', 'Has an embedded object set to load automatically (\\objupdate), a common way to trigger Office exploits.');
		if (/equation\.3|\\objclass\s+Equation/i.test(s)) add(rep, 3, 'rtfeq', 'Embeds an old Equation Editor object, used by a well-known Office exploit (CVE-2017-11882).');
		if (/\\objclass\s+Package/i.test(s)) add(rep, 2, 'rtfpkg', 'Embeds a "Package" object, which can hold any file, including programs.');
		if (objs && !has(rep, 'rtfupd') && !has(rep, 'rtfeq')) add(rep, 1, 'rtfobj', 'Has ' + objs + ' embedded object' + (objs > 1 ? 's' : '') + '.');
		if (/\\(macro|macpict)[^a-z]/i.test(s)) add(rep, 1, 'rtfmac', 'Uses rarely seen RTF control words.');
	}

	/* ---------- ISO 9660 disk images: list the top folder ---------- */
	function analyzeIso(rep, src) {
		return src.read(32768, 2048).then(function (pvd) {
			if (!startsStr(pvd, 'CD001', 1)) return;
			var lba = u32(pvd, 156 + 2), len = Math.min(u32(pvd, 156 + 10), 1 << 20);
			return src.read(lba * 2048, len).then(function (d) {
				var kids = [], p = 0;
				while (p < d.length && kids.length < 500) {
					var rl = d[p]; if (!rl) { p = (Math.floor(p / 2048) + 1) * 2048; continue; }
					var nl = d[p + 32], flags = d[p + 25], name = latin1(d, p + 33, p + 33 + nl).replace(/;1$/, '').replace(/\.$/, '');
					if (nl > 1 || (d[p + 33] !== 0 && d[p + 33] !== 1)) { var k = newReport(name + ((flags & 2) ? '/' : ''), u32(d, p + 10)); if (!(flags & 2)) nameFindings(k, name); kids.push(k); }
					p += rl;
				}
				rep.children = kids; rep.info.list = kids.map(function (k) { return { name: k.name, size: k.size }; });
				bubble(rep, kids, 'On the disk');
			});
		}, function () {});
	}

	/* ---------- the main entry ---------- */
	function newReport(name, size) { return { name: name, size: size, type: null, level: 0, findings: [], children: [], info: {} }; }
	var TEXT_MAX = 6 * 1024 * 1024;
	function analyze(src, name, opts) {
		opts = opts || {};
		var rep = newReport(name, src.size), n = nameFindings(rep, name), head, tail;
		return src.read(0, Math.min(src.size, 64 * 1024)).then(function (h) {
			head = h;
			return src.size > 1024 ? src.read(src.size - 512, 512) : null;
		}).then(function (t) {
			tail = t;
			var full = src.size <= 64 * 1024 ? head : null;
			if (src.size <= 128 && isEicar(head, src.size)) {
				rep.type = T('eicar', 'EICAR antivirus test file', 'test');
				add(rep, 3, 'eicar', 'This is the EICAR antivirus test file. It is harmless: it was made so people can check that their antivirus works. A working antivirus should block or quarantine it.');
				return rep;
			}
			var ty = sniff(head, src.size, tail); rep.type = ty;
			if (ty.id === 'empty') { add(rep, 0, 'empty', 'The file is empty.'); return rep; }
			mismatch(rep, n, ty);
			var job = Promise.resolve();
			if (ty.id === 'zip') job = analyzeZip(rep, src, n, opts);
			else if (ty.id === 'cfb') job = analyzeCfb(rep, src, n);
			else if (ty.id === 'pdf') job = analyzePdf(rep, src, opts);
			else if (ty.id === 'iso') job = analyzeIso(rep, src);
			else if (ty.id === 'lnk') { lnkChecks(rep, head); if (!has(rep, 'runs') && !has(rep, 'disguised') && n.ext !== 'lnk') add(rep, 2, 'program', 'Windows shortcut: it can start any program.'); }
			else if (ty.family === 'archive') add(rep, 1, 'cantopen', 'This kind of archive (' + ty.label + ') can\'t be opened here, so the files inside were not checked. Check them after unpacking.');
			else if (ty.family === 'diskimage') { if (!has(rep, 'disk') && !has(rep, 'disguisedimg')) add(rep, 2, 'disk', 'Disk image: opening it mounts it like a drive, and the files inside may skip the "downloaded from the internet" warning.'); }
			var wantText = ty.id === 'rtf' || ty.family === 'text' || ty.family === 'html' || ty.family === 'svg' || ty.family === 'script' || ty.family === 'shortcut' || (n.info && (n.info.family === 'script' || n.info.family === 'html' || n.info.family === 'text' || n.info.family === 'shortcut'));
			if (wantText && ty.id !== 'lnk' && src.size <= TEXT_MAX && ty.family !== 'program' && ty.family !== 'archive' && ty.family !== 'pdf') {
				job = job.then(function () { return full ? full : src.read(0, src.size); }).then(function (all) {
					var s = starts(all, [0xFF, 0xFE]) ? utf16(all, 2) : utf8(all);
					if (ty.id === 'rtf') analyzeRtf(rep, s);
					else { textChecks(rep, s, ty, n); shortcutChecks(rep, s, ty, n); }
					if (all.length > 128 && indexOfStr(all, EICAR) >= 0) add(rep, 1, 'eicarin', 'Contains the EICAR antivirus test text (not at the start, so it is not the official test file).');
				});
			}
			return job.then(function () { return rep; });
		});
	}

	/* ---------- hashes: MD5 (WebCrypto has SHA but no MD5) ---------- */
	function md5(u8) {
		var K = new Int32Array(64), S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
		for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
		var len = u8.length, nBlk = ((len + 8) >> 6) + 1, W = new Int32Array(nBlk * 16);
		for (i = 0; i < len; i++) W[i >> 2] |= u8[i] << ((i % 4) * 8);
		W[len >> 2] |= 0x80 << ((len % 4) * 8);
		W[nBlk * 16 - 2] = (len * 8) | 0; W[nBlk * 16 - 1] = Math.floor(len / 536870912) | 0;
		var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
		for (var b = 0; b < nBlk * 16; b += 16) {
			var A = a0, B = b0, C = c0, D = d0;
			for (i = 0; i < 64; i++) {
				var F, g;
				if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
				F = (F + A + K[i] + W[b + g]) | 0; A = D; D = C; C = B; B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
			}
			a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
		}
		return [a0, b0, c0, d0].map(function (x) { var s = ''; for (var j = 0; j < 4; j++) s += ((x >>> (j * 8)) & 255).toString(16).padStart(2, '0'); return s; }).join('');
	}
	function hex(buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i++) s += (u[i] < 16 ? '0' : '') + u[i].toString(16); return s; }

	/* ---------- links ---------- */
	var BRANDS = [
		['paypal', 'paypal.com paypal.me'], ['apple', 'apple.com icloud.com'], ['icloud', 'icloud.com apple.com'], ['microsoft', 'microsoft.com live.com outlook.com office.com microsoftonline.com office365.com sharepoint.com onedrive.com xbox.com bing.com msn.com skype.com'],
		['office365', 'office.com office365.com microsoft.com'], ['outlook', 'outlook.com live.com microsoft.com office.com'], ['onedrive', 'onedrive.com live.com microsoft.com'], ['sharepoint', 'sharepoint.com microsoft.com'],
		['google', 'google.com google.ca google.co.uk gmail.com youtube.com googleusercontent.com withgoogle.com googleapis.com gstatic.com googlevideo.com googlesyndication.com googleadservices.com google-analytics.com googletagmanager.com'], ['gmail', 'gmail.com google.com'], ['youtube', 'youtube.com youtu.be google.com'],
		['amazon', 'amazon.com amazon.ca amazon.co.uk amazon.de amazon.fr amazon.in amazon.co.jp amazon.com.au amazonaws.com amazon.it amazon.es'], ['facebook', 'facebook.com fb.com messenger.com meta.com'], ['instagram', 'instagram.com'], ['whatsapp', 'whatsapp.com whatsapp.net'],
		['netflix', 'netflix.com'], ['chase', 'chase.com'], ['wellsfargo', 'wellsfargo.com'], ['bankofamerica', 'bankofamerica.com bofa.com'], ['citibank', 'citibank.com citi.com'], ['hsbc', 'hsbc.com hsbc.co.uk hsbc.ca'],
		['rbcroyalbank', 'rbcroyalbank.com rbc.com'], ['scotiabank', 'scotiabank.com'], ['interac', 'interac.ca'], ['canadapost', 'canadapost.ca canadapost-postescanada.ca'], ['usps', 'usps.com'], ['fedex', 'fedex.com'], ['dhl', 'dhl.com dhl.de'],
		['coinbase', 'coinbase.com'], ['binance', 'binance.com'], ['kraken', 'kraken.com'], ['metamask', 'metamask.io'], ['ledger', 'ledger.com'], ['blockchain', 'blockchain.com'], ['trezor', 'trezor.io'],
		['docusign', 'docusign.com docusign.net'], ['dropbox', 'dropbox.com'], ['adobe', 'adobe.com'], ['linkedin', 'linkedin.com'], ['twitter', 'twitter.com x.com'], ['telegram', 'telegram.org t.me'],
		['steamcommunity', 'steamcommunity.com steampowered.com'], ['steampowered', 'steampowered.com steamcommunity.com'], ['roblox', 'roblox.com'], ['ebay', 'ebay.com ebay.ca ebay.co.uk'], ['walmart', 'walmart.com walmart.ca'],
		['discord', 'discord.com discord.gg discordapp.com'], ['github', 'github.com github.io'], ['yahoo', 'yahoo.com'], ['wetransfer', 'wetransfer.com'], ['spotify', 'spotify.com'], ['tiktok', 'tiktok.com'], ['zoom', 'zoom.us'],
		['venmo', 'venmo.com'], ['cashapp', 'cash.app'], ['americanexpress', 'americanexpress.com'], ['mastercard', 'mastercard.com'], ['visa', 'visa.com visa.ca']
	].map(function (b) { return { key: b[0], domains: b[1].split(' ') }; });
	var BRAND_DOMAINS = {}; BRANDS.forEach(function (b) { b.domains.forEach(function (d) { BRAND_DOMAINS[d] = b.key; }); });
	var SHORTENERS = 'bit.ly tinyurl.com t.co goo.gl ow.ly is.gd buff.ly cutt.ly rebrand.ly rb.gy shorturl.at tiny.cc s.id t.ly lnkd.in bl.ink qrco.de v.gd shorte.st adf.ly bitly.com tiny.one surl.li u.to clck.ru x.gd'.split(' ');
	var RISKY_TLD = { zip: 2, mov: 2, tk: 1, ml: 1, ga: 1, cf: 1, gq: 1, top: 1, xyz: 1, icu: 1, cyou: 1, buzz: 1, rest: 1, click: 1, country: 1, kim: 1, work: 1, cam: 1, monster: 1, sbs: 1, bond: 1, quest: 1, lol: 1, cfd: 1, surf: 1, mom: 1, beauty: 1, hair: 1, autos: 1, boats: 1 };
	var SLD2 = 'co.uk org.uk ac.uk gov.uk me.uk ltd.uk plc.uk co.jp ne.jp or.jp com.au net.au org.au edu.au gov.au co.nz org.nz com.br net.br com.mx com.ar com.tr co.za co.in net.in org.in com.cn net.cn com.hk com.sg com.my co.id co.kr com.tw com.vn com.ph com.pk co.il com.ua com.pl com.co gc.ca qc.ca on.ca bc.ca ab.ca'.split(' ');
	function registrable(host) {
		var p = host.split('.'); if (p.length <= 2) return host;
		var last2 = p.slice(-2).join('.'); return SLD2.indexOf(last2) >= 0 ? p.slice(-3).join('.') : last2;
	}
	/* RFC 3492 punycode decoder (for xn-- labels) */
	function punyDecode(input) {
		var base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, n = 128, i = 0, bias = 72, out = [], b = input.lastIndexOf('-');
		if (b < 0) b = 0;
		for (var j = 0; j < b; j++) out.push(input.charCodeAt(j));
		for (var idx = b > 0 ? b + 1 : 0; idx < input.length;) {
			var oldi = i, w = 1;
			for (var k = base; ; k += base) {
				if (idx >= input.length) throw new Error('bad punycode');
				var c = input.charCodeAt(idx++), digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
				if (digit >= base) throw new Error('bad punycode');
				i += digit * w; var t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
				if (digit < t) break; w *= base - t;
			}
			var len = out.length + 1, delta = oldi === 0 ? Math.floor((i - oldi) / damp) : (i - oldi) >> 1;
			delta += Math.floor(delta / len); for (k = 0; delta > ((base - tmin) * tmax) >> 1; k += base) delta = Math.floor(delta / (base - tmin)); bias = Math.floor(k + (base - tmin + 1) * delta / (delta + skew));
			n += Math.floor(i / len); i %= len; out.splice(i++, 0, n);
		}
		return String.fromCodePoint.apply(null, out);
	}
	function toUnicodeHost(h) { return h.split('.').map(function (l) { if (/^xn--/i.test(l)) { try { return punyDecode(l.slice(4)); } catch (e) { return l; } } return l; }).join('.'); }
	var CONFUSE = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'һ': 'h', 'ӏ': 'l', 'ո': 'n', 'ս': 'u', 'ν': 'v', 'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ԝ': 'w', 'ɩ': 'l', 'ı': 'i', 'ł': 'l', 'é': 'e', 'è': 'e', 'á': 'a', 'à': 'a', 'ó': 'o', 'ö': 'o', 'ü': 'u', 'í': 'i', 'ç': 'c' };
	function skeleton(s) { return s.toLowerCase().split('').map(function (ch) { return CONFUSE[ch] || ch; }).join('').replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/\$/g, 's').replace(/@/g, 'a').replace(/i/g, 'l'); }
	function editDist(a, b) {
		if (Math.abs(a.length - b.length) > 2) return 9;
		var d = []; for (var i = 0; i <= a.length; i++) { d[i] = [i]; } for (var j = 0; j <= b.length; j++) d[0][j] = j;
		for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
		}
		return d[a.length][b.length];
	}
	function scripts(s) { var o = {}; for (var ch of s) { var c = ch.codePointAt(0); if (c < 128) { if (/[a-z]/i.test(ch)) o.latin = 1; } else if (c >= 0x0400 && c <= 0x052F) o.cyrillic = 1; else if (c >= 0x0370 && c <= 0x03FF) o.greek = 1; else if (c >= 0x0530 && c <= 0x058F) o.armenian = 1; else if (c >= 0x00C0 && c <= 0x024F) o.latin = 1; else o.other = 1; } return Object.keys(o); }
	function brandMatch(host) {
		var reg = registrable(host), label = reg.split('.')[0], sk = skeleton(label), out = null;
		if (BRAND_DOMAINS[reg]) return { own: true, brand: BRAND_DOMAINS[reg] };
		BRANDS.forEach(function (b) {
			if (out) return;
			var k = b.key, real = b.domains[0];
			if (label === k) out = { why: 'name', brand: k, real: real };
			else if (sk === skeleton(k)) out = { why: 'lookalike', brand: k, real: real };
			else if (k.length >= 6 && editDist(label, k) <= (k.length >= 9 ? 2 : 1)) out = { why: 'typo', brand: k, real: real };
			else if (k.length >= 4 && label.split('-').some(function (t) { return t === k || skeleton(t) === skeleton(k); })) out = { why: 'contains', brand: k, real: real };
			else if (k.length >= 5 && (label.indexOf(k) === 0 || sk.indexOf(skeleton(k)) === 0)) out = { why: 'starts', brand: k, real: real };
			else if (k.length >= 5 && host.split('.').slice(0, -reg.split('.').length).some(function (l) { return l === k || skeleton(l) === skeleton(k); })) out = { why: 'subdomain', brand: k, real: real };
		});
		return out;
	}
	function checkUrl(input) {
		var raw = String(input || '').trim(), r = { input: raw, href: '', scheme: '', host: '', hostUnicode: '', registrable: '', findings: [], level: 0, embedded: [] };
		function f(level, code, msg) { r.findings.push({ level: level, code: code, msg: msg }); if (level > r.level) r.level = level; }
		if (!raw) return r;
		raw = raw.replace(/^<|>$/g, '').replace(/^hxxp/i, 'http').replace(/\[\.\]/g, '.').replace(/\[:\]/g, ':');
		var sm = raw.match(/^([a-z][a-z0-9+.-]*):/i);
		if (sm && /^(javascript|vbscript|data)$/i.test(sm[1])) { r.scheme = sm[1].toLowerCase(); f(3, 'scheme', 'This is not a web address: "' + r.scheme + ':" runs code or carries a hidden file when clicked.'); return r; }
		if (sm && /^file$/i.test(sm[1])) { r.scheme = 'file'; f(3, 'scheme', 'A "file:" link opens something on your computer or a network share, not a web page.'); return r; }
		var withScheme = sm && /^(https?|ftp)$/i.test(sm[1]) ? raw : (/^\/\//.test(raw) ? 'https:' + raw : 'http://' + raw);
		var u; try { u = new URL(withScheme); } catch (e) { f(2, 'parse', 'This doesn\'t look like a valid web address.'); return r; }
		r.href = u.href; r.scheme = u.protocol.replace(':', ''); r.host = u.hostname.replace(/\.$/, '').toLowerCase(); r.hostUnicode = toUnicodeHost(r.host);
		var authority = (withScheme.match(/^[a-z]+:\/\/([^\/?#]*)/i) || [])[1] || '';
		if (u.username || u.password || authority.indexOf('@') >= 0) f(3, 'at', 'The address contains "@": everything before it is ignored, so "' + authority.split('@')[0].slice(0, 40) + '" is only decoration and the real site is ' + r.host + '.');
		var isV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(r.host), isV6 = /^\[.*\]$/.test(u.host) || r.host.indexOf(':') >= 0;
		var origHost = authority.split('@').pop().replace(/:\d+$/, '');
		if (isV4 && !/^\d{1,3}(\.\d{1,3}){3}$/.test(origHost)) f(3, 'ipobf', 'The site\'s number is written in a disguised form (' + origHost + ' is really ' + r.host + ').');
		else if (isV4 || isV6) f(2, 'ip', 'Goes to a bare IP address (' + r.host + ') instead of a name. Real companies don\'t send you links like this.');
		if (isV4 || isV6) return finish();
		r.registrable = registrable(r.host);
		var tld = r.host.split('.').pop();
		if (!/\./.test(r.host)) f(1, 'nodot', 'There is no dot in the name, so it is a local or incomplete address.');
		var uni = r.hostUnicode !== r.host;
		if (uni) {
			var sc = scripts(r.hostUnicode.replace(/\./g, '').replace(/[0-9-]/g, ''));
			var labels = r.hostUnicode.split('.'), mixed = labels.some(function (l) { var s = scripts(l.replace(/[0-9-]/g, '')); return s.length > 1 && s.indexOf('latin') >= 0; });
			if (mixed) f(3, 'mixed', 'The name mixes Latin letters with look-alike letters from another alphabet (' + sc.filter(function (x) { return x !== 'latin'; }).join(', ') + '): "' + r.hostUnicode + '" is really "' + r.host + '".');
			else f(1, 'idn', 'International name: "' + r.hostUnicode + '" is written "' + r.host + '" in the address bar.');
		}
		var bm = brandMatch(uni ? r.hostUnicode : r.host);
		if (bm && bm.own) f(0, 'brand', 'The site\'s own domain is ' + r.registrable + ' (belongs to ' + bm.brand + ').');
		else if (bm) {
			var shownReg = uni ? toUnicodeHost(r.registrable) : r.registrable;
			var msg = { name: 'Uses the name "' + bm.brand + '" with a different ending (' + shownReg + '). The real site is ' + bm.real + '.', lookalike: '"' + shownReg + '" is made to look like ' + bm.real + ' (swapped or look-alike letters).', typo: '"' + shownReg + '" is one or two letters away from ' + bm.real + ', a common phishing trick.', contains: '"' + shownReg + '" puts "' + bm.brand + '" inside another name. The real site is ' + bm.real + ', not this one.', starts: '"' + shownReg + '" starts with "' + bm.brand + '" but is not ' + bm.real + '. It may be unrelated, or it may be pretending.', subdomain: '"' + bm.brand + '" is only the first part of the name: the real site here is ' + shownReg + ', not ' + bm.real + '.' }[bm.why];
			var cc = bm.why === 'name' && /^[a-z]{2}$/.test(tld) && ['google', 'amazon', 'ebay', 'apple', 'microsoft', 'yahoo', 'paypal', 'dhl'].indexOf(bm.brand) >= 0;
			f(cc ? 1 : bm.why === 'name' || bm.why === 'starts' ? 2 : 3, 'brand', cc ? 'Uses the name "' + bm.brand + '" with a country ending (' + r.registrable + '). That is often the real country site, but check: the main site is ' + bm.real + '.' : msg);
		}
		if (RISKY_TLD[tld]) f(RISKY_TLD[tld], 'tld', tld === 'zip' || tld === 'mov' ? 'The ending ".' + tld + '" is a real web domain that looks like a file name, used to make links look like downloads.' : 'The ending ".' + tld + '" is cheap and very common in spam and phishing (not proof on its own).');
		if (SHORTENERS.indexOf(r.registrable) >= 0 || SHORTENERS.indexOf(r.host) >= 0) f(1, 'short', 'This is a link shortener (' + r.host + '): it hides where you will really end up.');
		if (r.host.split('.').length > 5) f(1, 'deep', 'Has many sub-parts in the name (' + r.host.split('.').length + '), which can hide the real site in a long address.');
		if (r.host.length > 60) f(1, 'longhost', 'The site name is unusually long.');
		if ((r.host.match(/-/g) || []).length >= 4) f(1, 'hyphens', 'The name has many hyphens, common in throw-away phishing domains.');
		return finish();
		function finish() {
			if (r.scheme === 'http') f(1, 'http', 'Not encrypted (http, not https): anything you type can be read on the way.');
			if (u.port && u.port !== '80' && u.port !== '443') f(2, 'port', 'Uses an unusual port (:' + u.port + ').');
			var path = decodeSafe(u.pathname + u.search);
			var dl = path.match(/\.(exe|scr|msi|bat|cmd|js|jse|vbs|vbe|hta|lnk|ps1|apk|iso|img|dmg|pkg|jar|zip|rar|7z|wsf|docm|xlsm)(?=$|[?#&])/i);
			if (dl) f(2, 'dl', 'Downloads a ' + dl[1].toLowerCase() + ' file. Programs, scripts and archives from links you weren\'t expecting are a top way malware spreads.');
			if (!(bm && bm.own) && /(log-?in|sign-?in|verify|verification|account|update|secure|wallet|password|billing|invoice|unlock|suspend|confirm|recover|seed|airdrop)/i.test(r.host + path)) f(1, 'words', 'Uses words like "login", "verify" or "account", which phishing links use to look official.');
			var emb = path.match(/(?:https?|hxxps?)(?::|%3a)(?:\/\/|%2f%2f)[^\s&"'<>]+/ig);
			if (emb) { r.embedded = emb.slice(0, 3).map(decodeSafe); f(1, 'redirectparam', 'Contains another address inside it (' + r.embedded[0].slice(0, 80) + '), so it may forward you there. Check that one too.'); }
			if (/%[0-9a-f]{2}/i.test(authority)) f(2, 'enc', 'The site name is written with % codes, which hides what it really is.');
			if (raw.length > 300) f(1, 'long', 'Very long address (' + raw.length + ' characters).');
			return r;
		}
	}
	function decodeSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
	var links = {
		vtFile: function (sha256) { return 'https://www.virustotal.com/gui/file/' + sha256; },
		bazaar: function (sha256) { return 'https://bazaar.abuse.ch/browse.php?search=sha256%3A' + sha256; },
		vtUrl: function (url) { return 'https://www.virustotal.com/gui/search/' + encodeURIComponent(encodeURIComponent(url)); },
		gsb: function (url) { return 'https://transparencyreport.google.com/safe-browsing/search?url=' + encodeURIComponent(url); },
		urlscan: function (host) { return 'https://urlscan.io/search/#' + encodeURIComponent('domain:' + host); }
	};

	/* ---------- reports ---------- */
	function flat(reps) { return reps; }
	function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
	function toCSV(reps) {
		var out = ['file,size_bytes,real_type,risk,findings,sha256,sha1,md5'];
		flat(reps).forEach(function (r) {
			out.push([r.path || r.name, r.size, r.type ? r.type.label : '', LEVELS[r.level].word, r.findings.filter(function (f) { return f.level > 0; }).map(function (f) { return '[' + LEVELS[f.level].word + '] ' + f.msg; }).join(' | '), r.hash && r.hash.sha256 || '', r.hash && r.hash.sha1 || '', r.hash && r.hash.md5 || ''].map(csvCell).join(','));
		});
		return out.join('\n');
	}
	function toText(reps, when) {
		var lines = ['MES File Safety Check report' + (when ? ' (' + when + ')' : ''), 'Checks what each file really is and looks for common malware tricks. It is not an antivirus: "No red flags" does not mean a file is safe.', ''];
		var c = [0, 0, 0, 0]; reps.forEach(function (r) { c[r.level]++; });
		lines.push(reps.length + ' files: ' + c[3] + ' danger, ' + c[2] + ' caution, ' + (c[0] + c[1]) + ' with no red flags.', '');
		reps.slice().sort(function (a, b) { return b.level - a.level; }).forEach(function (r) {
			lines.push((r.level >= 2 ? LEVELS[r.level].word.toUpperCase() : LEVELS[r.level].word) + ': ' + (r.path || r.name) + ' (' + fmtBytes(r.size) + ', ' + (r.type ? r.type.label : '?') + ')');
			r.findings.forEach(function (f) { if (f.level > 0) lines.push('   - ' + f.msg); });
			if (r.hash && r.hash.sha256) lines.push('   SHA-256 ' + r.hash.sha256);
		});
		return lines.join('\n');
	}

	return { LEVELS: LEVELS, EXT: EXT, analyze: analyze, sniff: sniff, nameInfo: nameInfo, bytesSource: bytesSource, eicarBytes: eicarBytes, isEicar: isEicar,
		readZipDir: readZipDir, readCfbDir: readCfbDir, md5: md5, hex: hex, checkUrl: checkUrl, punyDecode: punyDecode, toUnicodeHost: toUnicodeHost, registrable: registrable,
		editDist: editDist, skeleton: skeleton, links: links, toCSV: toCSV, toText: toText, fmtBytes: fmtBytes };
})();
if (typeof module !== 'undefined') module.exports = MESScan;
