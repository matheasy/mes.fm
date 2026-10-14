/* MES EXIF viewer: reads the metadata of JPEG / PNG / WebP / TIFF files in the browser (pure; node-testable). Exposed as MESExif. */
var MESExif = (function () {
	'use strict';
	var IFD0 = { 0x010E: 'Description', 0x010F: 'Camera make', 0x0110: 'Camera model', 0x0112: 'Orientation', 0x011A: 'X resolution', 0x011B: 'Y resolution', 0x0128: 'Resolution unit', 0x0131: 'Software', 0x0132: 'Date modified', 0x013B: 'Artist', 0x8298: 'Copyright', 0xA430: 'Owner name' };
	var EXIF = { 0x829A: 'Exposure time', 0x829D: 'Aperture (f-number)', 0x8822: 'Exposure program', 0x8827: 'ISO', 0x9003: 'Date taken', 0x9004: 'Date digitized', 0x9010: 'Offset time', 0x9011: 'Offset time (taken)', 0x9201: 'Shutter speed value', 0x9202: 'Aperture value', 0x9204: 'Exposure bias',
		0x9207: 'Metering mode', 0x9209: 'Flash', 0x920A: 'Focal length', 0xA002: 'Width (px)', 0xA003: 'Height (px)', 0xA401: 'Custom rendered', 0xA402: 'Exposure mode', 0xA403: 'White balance', 0xA405: 'Focal length (35 mm)', 0xA406: 'Scene type', 0xA420: 'Image unique ID',
		0xA431: 'Body serial number', 0xA432: 'Lens specification', 0xA433: 'Lens make', 0xA434: 'Lens model', 0xA435: 'Lens serial number', 0x9286: 'User comment' };
	var GPS = { 1: 'Latitude ref', 2: 'Latitude', 3: 'Longitude ref', 4: 'Longitude', 5: 'Altitude ref', 6: 'Altitude', 7: 'GPS time (UTC)', 0x10: 'Direction ref', 0x11: 'Direction', 0x1D: 'GPS date', 0x0C: 'Speed ref', 0x0D: 'Speed' };
	var ORIENT = { 1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Mirrored vertically', 5: 'Mirrored, rotated 90° left', 6: 'Rotated 90° right', 7: 'Mirrored, rotated 90° right', 8: 'Rotated 90° left' };
	var PROG = { 0: 'Not defined', 1: 'Manual', 2: 'Normal program', 3: 'Aperture priority', 4: 'Shutter priority', 5: 'Creative', 6: 'Action', 7: 'Portrait', 8: 'Landscape' };
	var METER = { 0: 'Unknown', 1: 'Average', 2: 'Center-weighted', 3: 'Spot', 4: 'Multi-spot', 5: 'Pattern', 6: 'Partial' };
	var SENSITIVE = { 'Body serial number': 1, 'Lens serial number': 1, 'Owner name': 1, 'Artist': 1, 'Image unique ID': 1 };
	var SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

	function readTiff(u8, start, out) {
		var dv = new DataView(u8.buffer, u8.byteOffset + start, u8.length - start), le;
		if (dv.byteLength < 8) return false;
		var bo = String.fromCharCode(dv.getUint8(0), dv.getUint8(1)); if (bo === 'II') le = true; else if (bo === 'MM') le = false; else return false;
		if (dv.getUint16(2, le) !== 42) return false;
		function str(o, n) { var s = ''; for (var i = 0; i < n; i++) { var c = dv.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
		function val(type, count, vo, entryOff) {
			var sz = (SIZE[type] || 1) * count, o = sz > 4 ? dv.getUint32(entryOff + 8, le) : entryOff + 8, i, a = [];
			if (o + sz > dv.byteLength) return null;
			if (type === 2) return str(o, count);
			if (type === 7) { if (count > 64) return null; var s = ''; for (i = 0; i < count; i++) s += ('0' + dv.getUint8(o + i).toString(16)).slice(-2); return s; }
			for (i = 0; i < Math.min(count, 32); i++) {
				if (type === 1 || type === 6) a.push(type === 1 ? dv.getUint8(o + i) : dv.getInt8(o + i));
				else if (type === 3) a.push(dv.getUint16(o + i * 2, le)); else if (type === 8) a.push(dv.getInt16(o + i * 2, le));
				else if (type === 4) a.push(dv.getUint32(o + i * 4, le)); else if (type === 9) a.push(dv.getInt32(o + i * 4, le));
				else if (type === 5) { var d = dv.getUint32(o + i * 8 + 4, le); a.push(d ? dv.getUint32(o + i * 8, le) / d : 0); }
				else if (type === 10) { var d2 = dv.getInt32(o + i * 8 + 4, le); a.push(d2 ? dv.getInt32(o + i * 8, le) / d2 : 0); }
				else if (type === 11) a.push(dv.getFloat32(o + i * 4, le)); else if (type === 12) a.push(dv.getFloat64(o + i * 8, le));
			}
			return a.length === 1 ? a[0] : a;
		}
		function ifd(off, dict, group, seen) {
			if (!off || off + 2 > dv.byteLength || seen[off]) return; seen[off] = 1;
			var n = dv.getUint16(off, le), i, subs = {};
			for (i = 0; i < n && i < 200; i++) {
				var e = off + 2 + i * 12; if (e + 12 > dv.byteLength) break;
				var tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le), v;
				if (tag === 0x8769 || tag === 0x8825 || tag === 0xA005) { subs[tag] = dv.getUint32(e + 8, le); continue; }
				if (!dict[tag] || !SIZE[type]) continue;
				v = val(type, count, 0, e); if (v == null || v === '') continue;
				out.raw[group + ':' + dict[tag]] = v; out.rows.push({ group: group, name: dict[tag], raw: v });
			}
			if (subs[0x8769]) ifd(subs[0x8769], EXIF, 'Exif', seen); if (subs[0x8825]) ifd(subs[0x8825], GPS, 'GPS', seen);
		}
		ifd(dv.getUint32(4, le), IFD0, 'Camera', {}); return true;
	}

	function fmtValue(name, v) {
		var a = Array.isArray(v);
		if (name === 'Orientation') return ORIENT[v] || String(v);
		if (name === 'Exposure program') return PROG[v] || String(v);
		if (name === 'Metering mode') return METER[v] || String(v);
		if (name === 'Exposure time') return v >= 1 ? v + ' s' : v > 0 ? '1/' + Math.round(1 / v) + ' s' : String(v);
		if (name === 'Aperture (f-number)') return 'f/' + (Math.round(v * 10) / 10);
		if (name === 'Focal length' || name === 'Focal length (35 mm)') return (Math.round(v * 10) / 10) + ' mm';
		if (name === 'Exposure bias') return (v > 0 ? '+' : '') + (Math.round(v * 100) / 100) + ' EV';
		if (name === 'Flash') return (v & 1) ? 'Fired' : 'Did not fire';
		if (name === 'Altitude') return Math.round(v * 10) / 10 + ' m';
		if (name === 'Latitude' || name === 'Longitude') return a ? v[0] + '° ' + v[1] + '′ ' + (Math.round(v[2] * 100) / 100) + '″' : String(v);
		if (name === 'GPS time (UTC)' && a) return v.map(function (x) { return ('0' + Math.round(x)).slice(-2); }).join(':');
		if (name === 'Date taken' || name === 'Date digitized' || name === 'Date modified') return String(v).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
		if (name === 'User comment') return String(v).replace(/^(41|55)[0-9a-f]{14}/i, function () { return ''; }).slice(0, 120);
		return a ? v.join(', ') : String(v);
	}
	function dms(v, ref) { if (!Array.isArray(v) || v.length < 3) return null; var d = v[0] + v[1] / 60 + v[2] / 3600; return (ref === 'S' || ref === 'W') ? -d : d; }

	function ascii(u8, from, to) { var s = ''; for (var i = from; i < to && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
	function find(u8, str, from, to) { var n = str.length, i, j; for (i = from || 0; i <= Math.min(u8.length, to || u8.length) - n; i++) { for (j = 0; j < n; j++) if (u8[i + j] !== str.charCodeAt(j)) break; if (j === n) return i; } return -1; }

	/* Returns { format, rows: [{group,name,value,sensitive}], gps: {lat,lon,alt}|null, flags: [text], hasExif } */
	function parse(buf) {
		var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), out = { format: 'Unknown', rows: [], raw: {}, gps: null, flags: [], hasExif: false, orientation: 1 }, i;
		if (u8[0] === 0xFF && u8[1] === 0xD8) {
			out.format = 'JPEG'; i = 2;
			while (i + 4 < u8.length) {
				if (u8[i] !== 0xFF) { i++; continue; } var m = u8[i + 1]; if (m === 0xFF) { i++; continue; } if (m === 0xD9 || m === 0xDA) break;
				var len = (u8[i + 2] << 8) | u8[i + 3];
				if (m === 0xE1 && ascii(u8, i + 4, i + 10) === 'Exif\0\0') { out.hasExif = readTiff(u8, i + 10, out) || out.hasExif; }
				if (m === 0xE1 && ascii(u8, i + 4, i + 33).indexOf('http://ns.adobe.com/xap') === 0) out.xmp = ascii(u8, i + 4, Math.min(i + 2 + len, i + 70000));
				if (m === 0xEB && find(u8, 'c2pa', i + 4, i + 40) > 0) out.flags.push('Content Credentials (C2PA) are attached: this file records how it was made or edited.');
				if (m === 0xEB && !out.c2pa && find(u8, 'jumb', i + 4, i + 20) > 0) out.c2pa = true;
				i += 2 + len;
			}
		} else if (u8[0] === 0x89 && ascii(u8, 1, 4) === 'PNG') {
			out.format = 'PNG'; i = 8;
			while (i + 8 < u8.length) { var cl = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0, ty = ascii(u8, i + 4, i + 8); if (ty === 'eXIf') { out.hasExif = readTiff(u8, i + 8, out); } if (ty === 'iTXt' && ascii(u8, i + 8, i + 30).indexOf('XML:com.adobe.xmp') === 0) out.xmp = ascii(u8, i + 8, Math.min(i + 8 + cl, i + 70000)); if (ty === 'IDAT') break; i += 12 + cl; }
		} else if (ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 12) === 'WEBP') {
			out.format = 'WebP'; i = 12;
			while (i + 8 < u8.length) { var wl = u8[i + 4] | (u8[i + 5] << 8) | (u8[i + 6] << 16) | (u8[i + 7] << 24), wt = ascii(u8, i, i + 4); if (wt === 'EXIF') { var st = i + 8; if (ascii(u8, st, st + 6) === 'Exif\0\0') st += 6; out.hasExif = readTiff(u8, st, out); } if (wt === 'XMP ') out.xmp = ascii(u8, i + 8, Math.min(i + 8 + wl, i + 70000)); i += 8 + wl + (wl & 1); }
		} else if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 42) || (u8[0] === 0x4D && u8[1] === 0x4D && u8[3] === 42)) { out.format = 'TIFF'; out.hasExif = readTiff(u8, 0, out); }
		else if (ascii(u8, 4, 8) === 'ftyp') { out.format = /heic|heif|mif1|avif/.test(ascii(u8, 8, 12)) ? (ascii(u8, 8, 12) === 'avif' ? 'AVIF' : 'HEIC') : 'MP4'; out.unsupported = true; }
		else if (ascii(u8, 0, 3) === 'GIF') { out.format = 'GIF'; }
		var lat = dms(out.raw['GPS:Latitude'], out.raw['GPS:Latitude ref']), lon = dms(out.raw['GPS:Longitude'], out.raw['GPS:Longitude ref']);
		if (lat != null && lon != null && !(lat === 0 && lon === 0)) { var alt = out.raw['GPS:Altitude']; if (alt != null && out.raw['GPS:Altitude ref'] === 1) alt = -alt; out.gps = { lat: lat, lon: lon, alt: alt == null ? null : alt }; }
		out.orientation = out.raw['Camera:Orientation'] || 1;
		out.rows = out.rows.filter(function (r) { return !(r.group === 'GPS' && /ref$/.test(r.name)); }).map(function (r) { return { group: r.group, name: r.name, value: fmtValue(r.name, r.raw), sensitive: !!SENSITIVE[r.name] || r.group === 'GPS' }; });
		var xmp = out.xmp || '';
		if (/trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia/.test(xmp)) out.flags.push('The metadata says this picture was made or edited with AI (IPTC digital source type).');
		if (/c2pa|contentcredentials/i.test(xmp) && !out.c2pa) out.flags.push('Content Credentials (C2PA) are referenced in this file.');
		var sw = out.raw['Camera:Software'] || ''; if (/photoshop|lightroom|gimp|affinity|snapseed|canva|picsart|facetune|midjourney|dall|stable diffusion|firefly/i.test(sw + ' ' + xmp.slice(0, 6000))) out.flags.push('Edited or generated with software: ' + (sw || 'see the XMP data') + '.');
		if (out.c2pa && !out.flags.some(function (f) { return /C2PA/.test(f); })) out.flags.push('Content Credentials (C2PA) are attached: this file records how it was made or edited.');
		if (out.gps) out.flags.unshift('This picture contains the GPS location where it was taken.');
		if (out.rows.some(function (r) { return /serial/i.test(r.name); })) out.flags.push('It contains a camera or lens serial number, which can identify the device.');
		delete out.raw; return out;
	}
	return { parse: parse, fmtValue: fmtValue, dms: dms, ORIENT: ORIENT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESExif;

/* MES EXIF viewer UI. Parsing = MESExif in lib.js (prepended above). The photo never leaves the browser. */
(function () {
	'use strict';
	var X = MESExif, $ = function (id) { return document.getElementById(id); }, cur = null, objUrl = null;
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('ex-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2200); }
	function bytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }
	var drop = $('ex-drop'), inp = $('ex-file');
	drop.onclick = function () { inp.click(); }; drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
	inp.onchange = function () { if (inp.files[0]) load(inp.files[0]); inp.value = ''; };
	['dragenter', 'dragover'].forEach(function (n) { document.addEventListener(n, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); drop.classList.add('is-over'); } }); });
	['dragleave', 'drop'].forEach(function (n) { document.addEventListener(n, function () { drop.classList.remove('is-over'); }); });
	document.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); load(f); } });
	document.addEventListener('paste', function (e) { var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) { e.preventDefault(); load(f); } });

	function load(f) {
		var fr = new FileReader();
		fr.onload = function () {
			var r = X.parse(fr.result); cur = { file: f, r: r }; if (objUrl) URL.revokeObjectURL(objUrl); objUrl = URL.createObjectURL(f);
			var img = $('ex-img'); img.onload = function () { $('ex-fileinfo').textContent = f.name + ' · ' + r.format + ' · ' + bytes(f.size) + ' · ' + img.naturalWidth + ' × ' + img.naturalHeight + ' px'; cur.w = img.naturalWidth; cur.h = img.naturalHeight; }; img.onerror = function () { $('ex-fileinfo').textContent = f.name + ' · ' + r.format + ' · ' + bytes(f.size) + ' (this browser cannot show it)'; }; img.src = objUrl;
			render(r);
		};
		fr.onerror = function () { toast('Could not read that file'); }; fr.readAsArrayBuffer(f);
	}
	function pick(r, names) { return names.map(function (n) { var x = r.rows.filter(function (q) { return q.name === n; })[0]; return x ? x.value : null; }); }
	function card(k, v, sub, hero) { return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value" style="font-size:1.25em">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; }
	function render(r) {
		$('ex-out').hidden = false;
		var fl = r.flags.map(function (t) { return '<div class="ex-flag' + (/GPS location|serial number/.test(t) ? ' bad' : '') + '">' + (/GPS location/.test(t) ? '&#128205; ' : '&#9888;&#65039; ') + esc(t) + '</div>'; }).join('');
		if (r.unsupported) fl += '<div class="ex-flag">This looks like a ' + esc(r.format) + ' file. Browsers cannot read its metadata here yet: export the photo as JPEG from your phone, or use the image converter.</div>';
		else if (!r.rows.length && !r.flags.length) fl += '<div class="ex-flag">No EXIF metadata found in this ' + esc(r.format) + ' file. It may have been removed, or it was screenshotted, downloaded from a social site or compressed by an app.</div>';
		$('ex-flags').innerHTML = fl;
		var cam = pick(r, ['Camera make', 'Camera model', 'Lens model']), taken = pick(r, ['Date taken', 'Date digitized', 'Date modified']), s = pick(r, ['Exposure time', 'Aperture (f-number)', 'ISO', 'Focal length']);
		var c = '';
		c += card('Camera', esc(((cam[0] || '') + ' ' + (cam[1] || '')).trim() || '—'), cam[2] ? 'Lens: ' + esc(cam[2]) : '', true);
		c += card('Taken', esc(taken[0] || taken[1] || '—'), taken[0] ? 'by the camera clock, not checked' : (taken[2] ? 'last modified' : ''));
		c += card('Settings', esc(s.filter(Boolean).join(' · ') || '—'), 'exposure · aperture · ISO · focal length');
		c += card('Location', r.gps ? 'GPS present' : 'None', r.gps ? '' : 'no GPS data in this file');
		$('ex-cards').innerHTML = c;
		var loc = $('ex-loc');
		if (r.gps) { var la = r.gps.lat.toFixed(6), lo = r.gps.lon.toFixed(6); loc.hidden = false; loc.innerHTML = '<b>&#128205; ' + la + ', ' + lo + '</b>' + (r.gps.alt != null ? ' · altitude ' + Math.round(r.gps.alt) + ' m' : '') + '<br><a href="https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=16/' + la + '/' + lo + '" target="_blank" rel="noopener">Open in OpenStreetMap</a> · <a href="https://www.google.com/maps?q=' + la + ',' + lo + '" target="_blank" rel="noopener">Open in Google Maps</a> <span class="tu-note">(opening a map tells that site the place)</span>'; } else loc.hidden = true;
		fillTable(); $('ex-strip').disabled = r.unsupported;
	}
	function fillTable() {
		if (!cur) return; var q = $('ex-find').value.trim().toLowerCase(), rows = cur.r.rows.filter(function (x) { return !q || (x.group + ' ' + x.name + ' ' + x.value).toLowerCase().indexOf(q) >= 0; });
		$('ex-body').innerHTML = rows.map(function (x) { return '<tr' + (x.sensitive ? ' class="sens"' : '') + '><td>' + esc(x.group) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.value) + '</td></tr>'; }).join('');
		$('ex-tbl').hidden = !rows.length; $('ex-none').hidden = !!rows.length; $('ex-none').textContent = cur.r.rows.length ? 'No field matches that filter.' : 'No readable fields.';
	}
	$('ex-find').oninput = fillTable;
	$('ex-copy').onclick = function () {
		if (!cur) return; var t = cur.r.rows.map(function (x) { return x.group + ' / ' + x.name + ': ' + x.value; }).join('\n') || 'No metadata found.';
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { toast('Copy failed'); }); else toast('Copy needs a secure page');
	};
	$('ex-strip').onclick = function () {
		if (!cur) return; var img = $('ex-img'); if (!img.naturalWidth) return toast('This browser cannot re-save that picture');
		var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; var x = c.getContext('2d'), isPng = /png|webp|gif/i.test(cur.file.type) && cur.r.format !== 'JPEG';
		if (!isPng) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(img, 0, 0);
		c.toBlob(function (b) { if (!b) return toast('Could not make the copy'); var a = document.createElement('a'), u = URL.createObjectURL(b); a.href = u; a.download = (cur.file.name.replace(/\.[^.]+$/, '') || 'photo') + '-clean.' + (isPng ? 'png' : 'jpg'); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500); toast('Clean copy saved: no metadata'); }, isPng ? 'image/png' : 'image/jpeg', 0.95);
	};
})();
