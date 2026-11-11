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

/* MES Gallery (mes.fm/gallery): the pure part. File types (by name and by magic bytes), picture sizes read from the file header, EXIF dates,
   natural sorting, filtering, grouping, the justified / square / masonry / list layouts (with group headings), the viewer's fit maths, the video
   speed and A-B loop rules and small formatters. No DOM, runs in node: node tool_apps_src/gallery-tests.js. Exposed as MESGallery. */
var MESGallery = (function () {
	'use strict';
	var IMG = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', apng: 'image/apng', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
		bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', jxl: 'image/jxl' };
	var VID = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogv: 'video/ogg', avi: 'video/x-msvideo',
		'3gp': 'video/3gpp', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t', m2ts: 'video/mp2t', mts: 'video/mp2t' };
	/* what most browsers can show; the rest are listed but get a note (HEIC only in Safari, AVI / WMV / FLV / MKV-with-odd-codecs need converting) */
	var SHOWABLE = { jpg: 1, jpeg: 1, jpe: 1, jfif: 1, png: 1, apng: 1, gif: 1, webp: 1, avif: 1, bmp: 1, svg: 1, ico: 1, mp4: 1, m4v: 1, mov: 1, webm: 1, ogv: 1, mkv: 1 };

	function ext(name) { var m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
	function kindOf(name, mime) {
		var e = ext(name);
		if (IMG[e]) return 'image';
		if (VID[e]) return 'video';
		if (mime && /^image\//.test(mime)) return 'image';
		if (mime && /^video\//.test(mime)) return 'video';
		return null;
	}
	function mimeOf(name) { var e = ext(name); return IMG[e] || VID[e] || ''; }
	function showable(name) { return !!SHOWABLE[ext(name)]; }
	function asc(u8, a, b) { var s = ''; for (var i = a; i < b && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
	/* the real type from the first bytes (a photo saved without an ending, or a .jpg that is really a PNG) */
	function sniff(u8) {
		if (!u8 || u8.length < 12) return null;
		if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return { kind: 'image', ext: 'jpg' };
		if (u8[0] === 0x89 && asc(u8, 1, 4) === 'PNG') return { kind: 'image', ext: 'png' };
		if (asc(u8, 0, 4) === 'GIF8') return { kind: 'image', ext: 'gif' };
		if (asc(u8, 0, 4) === 'RIFF' && asc(u8, 8, 12) === 'WEBP') return { kind: 'image', ext: 'webp' };
		if (asc(u8, 0, 4) === 'RIFF' && asc(u8, 8, 12) === 'AVI ') return { kind: 'video', ext: 'avi' };
		if (u8[0] === 0x42 && u8[1] === 0x4D) return { kind: 'image', ext: 'bmp' };
		if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 42) || (u8[0] === 0x4D && u8[1] === 0x4D && u8[3] === 42)) return { kind: 'image', ext: 'tif' };
		if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) { var doc = asc(u8, 0, Math.min(u8.length, 64)); return { kind: 'video', ext: doc.indexOf('webm') >= 0 ? 'webm' : 'mkv' }; }
		if (asc(u8, 4, 8) === 'ftyp') {
			var b = asc(u8, 8, 12);
			if (b === 'avif' || b === 'avis') return { kind: 'image', ext: 'avif' };
			if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(b)) return { kind: 'image', ext: 'heic' };
			if (b === 'qt  ') return { kind: 'video', ext: 'mov' };
			return { kind: 'video', ext: 'mp4' };
		}
		var head = asc(u8, 0, Math.min(u8.length, 256)).replace(/^﻿/, '').trim();
		if (/^<\?xml[\s\S]*<svg|^<svg/i.test(head)) return { kind: 'image', ext: 'svg' };
		return null;
	}

	/* width / height from the header (no decoding), and the EXIF orientation of a JPEG, so the justified grid can be laid out before thumbnails exist.
	   Returns {w, h, o} with w / h already swapped for orientations 5-8 (how the picture is shown), or null when not found in these bytes. */
	function imageSize(u8) {
		if (!u8 || u8.length < 24) return null;
		var dv = new DataView(u8.buffer, u8.byteOffset, u8.length), i, w, h;
		if (u8[0] === 0x89 && asc(u8, 1, 4) === 'PNG') return { w: dv.getUint32(16), h: dv.getUint32(20), o: 1 };
		if (asc(u8, 0, 4) === 'GIF8') return { w: dv.getUint16(6, true), h: dv.getUint16(8, true), o: 1 };
		if (u8[0] === 0x42 && u8[1] === 0x4D && u8.length >= 26) return { w: Math.abs(dv.getInt32(18, true)), h: Math.abs(dv.getInt32(22, true)), o: 1 };
		if (asc(u8, 0, 4) === 'RIFF' && asc(u8, 8, 12) === 'WEBP') {
			var t = asc(u8, 12, 16);
			if (t === 'VP8 ' && u8.length >= 30) return { w: dv.getUint16(26, true) & 0x3FFF, h: dv.getUint16(28, true) & 0x3FFF, o: 1 };
			if (t === 'VP8L' && u8.length >= 25) { var b0 = u8[21], b1 = u8[22], b2 = u8[23], b3 = u8[24]; return { w: 1 + (((b1 & 0x3F) << 8) | b0), h: 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)), o: 1 }; }
			if (t === 'VP8X' && u8.length >= 30) return { w: 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16)), h: 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16)), o: 1 };
			return null;
		}
		if (u8[0] === 0xFF && u8[1] === 0xD8) {
			var o = 1; i = 2;
			while (i + 9 < u8.length) {
				if (u8[i] !== 0xFF) { i++; continue; }
				var m = u8[i + 1];
				if (m === 0xFF) { i++; continue; }
				if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { i += 2; continue; }
				var len = dv.getUint16(i + 2);
				if (m === 0xE1 && asc(u8, i + 4, i + 10) === 'Exif\0\0') { var oo = exifOrientation(u8, i + 10, Math.min(u8.length, i + 2 + len)); if (oo) o = oo; }
				if ((m >= 0xC0 && m <= 0xCF) && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
					h = dv.getUint16(i + 5); w = dv.getUint16(i + 7);
					return o >= 5 && o <= 8 ? { w: h, h: w, o: o } : { w: w, h: h, o: o };
				}
				i += 2 + len;
			}
			return null;
		}
		return null;
	}
	function exifOrientation(u8, start, end) {
		if (end - start < 8) return 0;
		var dv = new DataView(u8.buffer, u8.byteOffset + start, end - start), le = asc(u8, start, start + 2) === 'II';
		if (dv.getUint16(2, le) !== 42) return 0;
		var off = dv.getUint32(4, le); if (off + 2 > dv.byteLength) return 0;
		var n = dv.getUint16(off, le);
		for (var k = 0; k < n && k < 200; k++) { var e = off + 2 + k * 12; if (e + 12 > dv.byteLength) break; if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le); }
		return 0;
	}

	/* "2024:05:01 12:34:56" (EXIF, local time of the camera) -> ms in this browser's time zone; null for blank / zero dates */
	function exifDate(s) {
		var m = /^(\d{4})[:\-](\d\d)[:\-](\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/.exec(String(s || '').trim());
		if (!m || +m[1] < 1900 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1) return null;
		var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
		return isNaN(d.getTime()) ? null : d.getTime();
	}
	/* a date in the file name: IMG_20240501_123456, PXL_20240501_..., Screenshot 2024-05-01 at 12.34.56, VID-20240501-WA0001 */
	function nameDate(name) {
		var m = /(?:^|[^0-9])(19\d\d|20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)(?:[ _T-]*(?:at )?([0-2]\d)[.:_-]?([0-5]\d)[.:_-]?([0-5]\d))?(?![0-9])/.exec(name || '');
		if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
		var d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
		return d.getMonth() === +m[2] - 1 ? d.getTime() : null;
	}
	function dateOf(it) { return it.taken || it.named || it.mtime || 0; }

	/* natural order: "IMG 2" before "IMG 10", case and accents ignored */
	var collator = null;
	try { collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }); } catch (e) { collator = null; }
	function natCmp(a, b) {
		if (collator) return collator.compare(a, b);
		var ax = String(a).toLowerCase().match(/(\d+|\D+)/g) || [], bx = String(b).toLowerCase().match(/(\d+|\D+)/g) || [];
		for (var i = 0; i < Math.min(ax.length, bx.length); i++) {
			var x = ax[i], y = bx[i];
			if (x === y) continue;
			if (/^\d/.test(x) && /^\d/.test(y)) return (+x) - (+y) || x.length - y.length;
			return x < y ? -1 : 1;
		}
		return ax.length - bx.length;
	}
	function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
	var SORTS = { name: 'Name', date: 'Date', size: 'Size', type: 'Type', folder: 'Folder', rating: 'Rating', dims: 'Picture size', duration: 'Video length', random: 'Shuffle' };
	/* sort a copy. dir 1 = ascending, -1 = descending. Ties fall back to the folder path and name, so the order is always the same. */
	function sortItems(items, key, dir, ratings, seed) {
		dir = dir === -1 ? -1 : 1;
		var r = ratings || {}, sd = String(seed || 1);
		function rate(it) { var x = r[it.rkey]; return x ? (x.r || 0) + (x.f ? 0.5 : 0) : 0; }
		function tie(a, b) { return natCmp(a.path || a.name, b.path || b.name); }
		var f = {
			name: function (a, b) { return natCmp(a.name, b.name) || tie(a, b); },
			date: function (a, b) { return (dateOf(a) - dateOf(b)) || tie(a, b); },
			size: function (a, b) { return (a.size - b.size) || tie(a, b); },
			type: function (a, b) { return natCmp(a.kind + '.' + (a.ext || ''), b.kind + '.' + (b.ext || '')) || tie(a, b); },
			folder: function (a, b) { return natCmp(a.folder || '', b.folder || '') || natCmp(a.name, b.name); },
			rating: function (a, b) { return (rate(a) - rate(b)) || -tie(a, b) * dir; },
			dims: function (a, b) { return ((a.w || 0) * (a.h || 0) - (b.w || 0) * (b.h || 0)) || tie(a, b); },
			duration: function (a, b) { return ((a.dur || 0) - (b.dur || 0)) || tie(a, b); },
			random: function (a, b) { return (hashStr(sd + (a.path || a.name)) - hashStr(sd + (b.path || b.name))) || tie(a, b); }
		}[key] || null;
		if (!f) f = function (a, b) { return tie(a, b); };
		return items.slice().sort(function (a, b) { return f(a, b) * dir; });
	}
	function fold(s) { s = String(s || '').toLowerCase(); try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {} return s; }
	/* q: words that must all appear in the name or folder path; "-word" leaves out; ".mp4" or "ext:mp4" = that ending */
	function filterItems(items, opt, ratings) {
		opt = opt || {}; var r = ratings || {};
		var words = fold(opt.q || '').split(/\s+/).filter(Boolean), kind = opt.kind || 'all';
		return items.filter(function (it) {
			if (kind === 'image' && it.kind !== 'image') return false;
			if (kind === 'video' && it.kind !== 'video') return false;
			var hid = !!(opt.hidden && opt.hidden[hideKey(it)]);
			if (kind === 'hidden') { if (!hid) return false; }
			else if (hid) return false;
			if (kind === 'dups' && !it._dup) return false;
			var rt = r[it.rkey] || {};
			if (kind === 'fav' && !rt.f) return false;
			if (opt.minRating && (rt.r || 0) < opt.minRating) return false;
			if (!words.length) return true;
			var hay = fold((it.path || it.name)), e = it.ext || '';
			for (var i = 0; i < words.length; i++) {
				var w = words[i], neg = false;
				if (w[0] === '-' && w.length > 1) { neg = true; w = w.slice(1); }
				var hit = /^(ext:|\.)[a-z0-9]+$/.test(w) ? e === w.replace(/^(ext:|\.)/, '') : hay.indexOf(w) >= 0;
				if (hit === neg) return false;
			}
			return true;
		});
	}
	var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	/* groups in the order their first item appears in the (already sorted) list */
	function groupItems(items, by) {
		if (!by || by === 'none') return [{ key: 'all', label: '', items: items.slice() }];
		var map = {}, out = [];
		items.forEach(function (it) {
			var k, label, d;
			if (by === 'dup') { k = 'd' + (it._dup || 0); label = 'Same picture: ' + (it._dupN || 2) + ' copies'; }
			else if (by === 'folder') { k = it.folder || ''; label = k || 'Top folder'; }
			else if (by === 'type') { k = it.kind; label = it.kind === 'video' ? 'Videos' : 'Photos'; }
			else if (by === 'ext') { k = it.ext || '?'; label = (it.ext || 'no ending').toUpperCase(); }
			else {
				var t = dateOf(it);
				if (!t) { k = 'none'; label = 'No date'; }
				else {
					d = new Date(t);
					if (by === 'year') { k = '' + d.getFullYear(); label = k; }
					else if (by === 'month') { k = d.getFullYear() + '-' + pad(d.getMonth() + 1); label = MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
					else { k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); label = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
				}
			}
			var g = map[k];
			if (!g) { g = map[k] = { key: k, label: label, items: [] }; out.push(g); }
			g.items.push(it);
		});
		return out;
	}

	/* justified rows (Google Photos / Flickr style): every row fills the width exactly, its height close to target; the last row of a group keeps
	   the target height (not stretched). aspects = width / height. Returns [{h, y, items: [{i, x, w}]}] with i = index into aspects. */
	function justify(aspects, width, target, gap, maxH) {
		var rows = [], row = [], sum = 0, y = 0, i;
		gap = gap || 0; maxH = maxH || target * 1.6;
		function flush(last) {
			if (!row.length) return;
			var avail = width - gap * (row.length - 1), h = avail / sum;
			if (last && h > target) h = target;
			h = Math.min(h, maxH);
			var x = 0, r = { h: h, y: y, items: [] };
			row.forEach(function (k, j) {
				var w = aspects[k] * h;
				if (!last && j === row.length - 1) w = Math.max(1, width - x);    /* soak up rounding so the row ends exactly at the edge */
				r.items.push({ i: k, x: x, w: w }); x += w + gap;
			});
			rows.push(r); y += h + gap; row = []; sum = 0;
		}
		for (i = 0; i < aspects.length; i++) {
			var a = aspects[i] > 0 && isFinite(aspects[i]) ? Math.min(Math.max(aspects[i], 0.2), 6) : 1;
			aspects[i] = a;
			row.push(i); sum += a;
			if ((width - gap * (row.length - 1)) / sum <= target) flush(false);
		}
		flush(true);
		return rows;
	}
	/* masonry (Pinterest style): fixed-width columns, each picture goes to the shortest column */
	function masonry(aspects, width, colTarget, gap) {
		gap = gap || 0;
		var cols = Math.max(1, Math.round((width + gap) / (colTarget + gap))), cw = (width - gap * (cols - 1)) / cols, hs = [], pos = [], c;
		for (c = 0; c < cols; c++) hs.push(0);
		aspects.forEach(function (a, i) {
			a = a > 0 && isFinite(a) ? Math.min(Math.max(a, 0.2), 6) : 1;
			var best = 0; for (c = 1; c < cols; c++) if (hs[c] < hs[best] - 0.5) best = c;
			var h = cw / a; pos.push({ i: i, x: best * (cw + gap), y: hs[best], w: cw, h: h }); hs[best] += h + gap;
		});
		var height = Math.max.apply(null, hs); if (aspects.length) height -= gap;
		return { cols: cols, colW: cw, pos: pos, height: Math.max(0, height) };
	}
	function squares(n, width, size, gap) {
		gap = gap || 0;
		var cols = Math.max(1, Math.floor((width + gap) / (size + gap))), s = (width - gap * (cols - 1)) / cols, pos = [];
		for (var i = 0; i < n; i++) pos.push({ i: i, x: (i % cols) * (s + gap), y: Math.floor(i / cols) * (s + gap), w: s, h: s });
		return { cols: cols, size: s, pos: pos, height: n ? Math.ceil(n / cols) * (s + gap) - gap : 0 };
	}
	/* the whole page: groups (with a heading each) laid out one under the other. aspectOf(item) -> width / height.
	   view: justified | square | masonry | list. Returns {height, tiles: [{it, x, y, w, h}], heads: [{label, count, y, h, g}]} */
	function layout(groups, opt, aspectOf) {
		var width = Math.max(120, opt.width || 800), size = opt.size || 200, gap = opt.gap == null ? 4 : opt.gap, headH = opt.headH || 44, listH = opt.listH || 56;
		var y = 0, tiles = [], heads = [], view = opt.view || 'justified', showHead = groups.length > 1 || (groups[0] && groups[0].label);
		groups.forEach(function (g, gi) {
			if (showHead) { heads.push({ label: g.label, count: g.items.length, y: y, h: headH, g: gi, key: g.key }); y += headH; }
			var its = g.items, k;
			if (view === 'list') {
				for (k = 0; k < its.length; k++) tiles.push({ it: its[k], x: 0, y: y + k * listH, w: width, h: listH - 1 });
				y += its.length * listH;
			} else if (view === 'square') {
				var sq = squares(its.length, width, size, gap);
				sq.pos.forEach(function (p) { tiles.push({ it: its[p.i], x: p.x, y: y + p.y, w: p.w, h: p.h }); });
				y += sq.height;
			} else if (view === 'masonry') {
				var ms = masonry(its.map(aspectOf), width, size, gap);
				ms.pos.forEach(function (p) { tiles.push({ it: its[p.i], x: p.x, y: y + p.y, w: p.w, h: p.h }); });
				y += ms.height;
			} else {
				var rows = justify(its.map(aspectOf), width, size, gap, size * 1.7);
				rows.forEach(function (r) { r.items.forEach(function (c) { tiles.push({ it: its[c.i], x: c.x, y: y + r.y, w: c.w, h: r.h }); }); });
				if (rows.length) { var last = rows[rows.length - 1]; y += last.y + last.h; }
			}
			y += gi < groups.length - 1 ? Math.max(gap, 14) : 0;
		});
		return { height: y, tiles: tiles, heads: heads };
	}
	/* tiles overlapping [top, bottom] (tiles are in y order per group; masonry is not, so a plain scan: 10,000 tiles take well under a millisecond) */
	function visible(tiles, top, bottom) {
		var out = [];
		for (var i = 0; i < tiles.length; i++) { var t = tiles[i]; if (t.y < bottom && t.y + t.h > top) out.push(i); }
		return out;
	}

	/* the viewer's scale for a fit mode. rot in degrees (90 / 270 swap the sides). fit = whole picture, never enlarged past 'maxUp' (default: allowed);
	   fill = cover the screen; actual = 1 picture pixel per screen pixel (dpr); custom = pct / 100. */
	function fitScale(mode, iw, ih, vw, vh, rot, opt) {
		opt = opt || {};
		if ((rot || 0) % 180) { var t = iw; iw = ih; ih = t; }
		if (!(iw > 0 && ih > 0 && vw > 0 && vh > 0)) return 1;
		var contain = Math.min(vw / iw, vh / ih), cover = Math.max(vw / iw, vh / ih);
		if (mode === 'fill') return cover;
		if (mode === 'actual') return 1 / (opt.dpr || 1);
		if (mode === 'custom') return Math.max(0.01, (opt.pct || 100) / 100) / (opt.dpr || 1);
		if (opt.noUpscale && contain > 1) return 1;
		return contain;
	}
	/* keep a zoomed picture covering the view (no empty band on a side it could fill); a picture smaller than the view stays centred */
	function clampPan(x, y, scale, iw, ih, vw, vh, rot) {
		if ((rot || 0) % 180) { var t = iw; iw = ih; ih = t; }
		var w = iw * scale, h = ih * scale, mx = Math.max(0, (w - vw) / 2), my = Math.max(0, (h - vh) / 2);
		return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
	}
	/* zoom by factor about a point (px, py relative to the view centre), keeping that point under the pointer */
	function zoomAbout(x, y, s, f, px, py, min, max) {
		var ns = Math.min(max || 40, Math.max(min || 0.02, s * f)), k = ns / s;
		return { s: ns, x: px - (px - x) * k, y: py - (py - y) * k };
	}

	/* video speed like the Video Speed Controller: S / D step 0.1 (0.25 below 1 x when already on a quarter), clamp 0.25 - 4 (16 allowed if asked) */
	var SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
	function speedStep(rate, dir, step, max) {
		step = step || 0.1; max = max || 4;
		var r = Math.round((rate + dir * step) * 100) / 100;
		return Math.min(max, Math.max(0.25, r));
	}
	function fmtSpeed(r) { return String(Math.round(r * 100) / 100) + '×'; }
	/* A-B loop: where to jump to (or null). Needs a < b; a zero-length or reversed loop is ignored. */
	function abCheck(t, a, b) {
		if (a == null || b == null || !(b - a > 0.05)) return null;
		if (t >= b || t < a - 0.25) return a;
		return null;
	}
	function setAB(cur, which, t, dur) {
		var a = cur.a, b = cur.b;
		if (which === 'a') { a = t; if (b != null && b <= a) b = null; }
		else { b = t; if (a == null) a = 0; if (b <= a) { var x = a; a = b; b = x; } }
		if (dur && b != null) b = Math.min(b, dur);
		return { a: a, b: b };
	}
	/* where to grab a video's poster frame: a tenth of the way in (skips black fade-ins), between 0.2 s and 5 s */
	function posterTime(dur) { if (!(dur > 0) || !isFinite(dur)) return 0.5; return Math.min(5, Math.max(Math.min(0.2, dur / 2), dur * 0.1)); }
	function nextIndex(i, n, d, loop) { if (!n) return -1; var j = i + d; if (j < 0) return loop ? n - 1 : 0; if (j >= n) return loop ? 0 : n - 1; return j; }
	/* the slideshow interval from the slider (log-ish steps) */
	var SLIDE = [1, 1.5, 2, 3, 4, 5, 7, 10, 15, 20, 30];

	function fmtBytes(n) {
		if (!(n >= 0)) return '';
		if (n < 1000) return n + ' B';
		var u = ['KB', 'MB', 'GB', 'TB'], i = -1; do { n /= 1000; i++; } while (n >= 1000 && i < u.length - 1);
		return (n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100) + ' ' + u[i];
	}
	function fmtDur(s) {
		if (!(s >= 0) || !isFinite(s)) return '';
		s = Math.floor(s); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
		return (h ? h + ':' + pad(m) : m) + ':' + pad(x);
	}
	function fmtTime(s, frac) {
		if (!(s >= 0) || !isFinite(s)) return '0:00';
		var base = fmtDur(s); if (!frac) return base;
		return base + '.' + pad(Math.floor((s % 1) * 100));
	}
	function fmtDate(t, withTime) {
		if (!t) return '';
		var d = new Date(t), s = MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear();
		if (withTime) { var h = d.getHours(), ap = h < 12 ? 'am' : 'pm'; s += ', ' + ((h % 12) || 12) + ':' + pad(d.getMinutes()) + ' ' + ap; }
		return s;
	}
	function mp(w, h) { return w && h ? Math.round(w * h / 1e5) / 10 + ' MP' : ''; }
	function thumbKey(it, px) { return [it.path || it.name, it.size, it.mtime, px || 480].join('|'); }
	/* hidden files: keyed by where the file is + size + modified time, so two copies of one picture can be hidden one at a time */
	function hideKey(it) { return [it.path || it.name, it.size || 0, it.mtime || 0].join('|'); }
	/* same file added twice (dropped twice, opened again): same path, size and time */
	function sameFile(a, b) { return hideKey(a) === hideKey(b); }
	/* sizes that occur more than once = the only files that can be duplicates */
	function sizeBuckets(items) {
		var m = {}; items.forEach(function (it) { (m[it.size] = m[it.size] || []).push(it); });
		return Object.keys(m).map(function (k) { return m[k]; }).filter(function (g) { return g.length > 1 && g[0].size > 0; });
	}
	/* items each carrying .hash -> sets of 2+ with the same hash; inside a set the one to keep comes first (oldest date, then shortest path) */
	function dupSets(items) {
		var m = {}, out = [];
		items.forEach(function (it) { if (it.hash) (m[it.size + ':' + it.hash] = m[it.size + ':' + it.hash] || []).push(it); });
		Object.keys(m).forEach(function (k) {
			var g = m[k]; if (g.length < 2) return;
			g.sort(function (a, b) { return ((a.mtime || 0) - (b.mtime || 0)) || ((a.path || '').length - (b.path || '').length) || natCmp(a.path || '', b.path || ''); });
			out.push(g);
		});
		return out;
	}
	function rateKey(name, size) { return (name || '') + '|' + (size || 0); }
	/* "Holiday/2024/IMG_1.jpg" -> folder "Holiday/2024" (the top folder you opened is left out) */
	function splitPath(rel, dropTop) {
		var parts = String(rel || '').split('/').filter(Boolean), name = parts.pop() || '';
		if (dropTop && parts.length) parts.shift();
		return { name: name, folder: parts.join('/') };
	}
	function summary(items) {
		var s = { images: 0, videos: 0, bytes: 0, first: 0, last: 0 };
		items.forEach(function (it) {
			if (it.kind === 'video') s.videos++; else s.images++;
			s.bytes += it.size || 0; var d = dateOf(it);
			if (d) { if (!s.first || d < s.first) s.first = d; if (d > s.last) s.last = d; }
		});
		return s;
	}
	function plural(n, w) { return n.toLocaleString('en-US') + ' ' + w + (n === 1 ? '' : 's'); }

	return { IMG: IMG, VID: VID, ext: ext, kindOf: kindOf, mimeOf: mimeOf, showable: showable, sniff: sniff, imageSize: imageSize, exifDate: exifDate, nameDate: nameDate, dateOf: dateOf,
		natCmp: natCmp, SORTS: SORTS, sortItems: sortItems, filterItems: filterItems, groupItems: groupItems, justify: justify, masonry: masonry, squares: squares, layout: layout,
		visible: visible, fitScale: fitScale, clampPan: clampPan, zoomAbout: zoomAbout, SPEEDS: SPEEDS, speedStep: speedStep, fmtSpeed: fmtSpeed, abCheck: abCheck, setAB: setAB,
		posterTime: posterTime, nextIndex: nextIndex, SLIDE: SLIDE, fmtBytes: fmtBytes, fmtDur: fmtDur, fmtTime: fmtTime, fmtDate: fmtDate, mp: mp, thumbKey: thumbKey,
		rateKey: rateKey, hideKey: hideKey, sameFile: sameFile, sizeBuckets: sizeBuckets, dupSets: dupSets, splitPath: splitPath, summary: summary, plural: plural, MONTHS: MONTHS, hashStr: hashStr };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESGallery;

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
	if (P.kind === 'hidden' || P.kind === 'dups') P.kind = 'all';
	function save() { try { var o = Object.assign({}, P); if (o.kind === 'hidden' || o.kind === 'dups') o.kind = 'all'; localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

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
	/* hidden files: {hideKey: time hidden}; the files themselves are never touched */
	var HID = {}, hidTimer = 0;
	iget('kv', 'hidden').then(function (v) { if (v && typeof v === 'object') { HID = v; if (ALL.length) refresh(true); } });
	function saveHID() { clearTimeout(hidTimer); hidTimer = setTimeout(function () { iput('kv', 'hidden', HID); }, 200); }
	function isHidden(it) { return !!HID[G.hideKey(it)]; }
	function hiddenCount() { var n = 0; for (var i = 0; i < ALL.length; i++) if (HID[G.hideKey(ALL[i])]) n++; return n; }
	function setRating(it, patch) { var r = Object.assign({}, RT[it.rkey] || {}, patch); if (!r.f && !r.r) delete RT[it.rkey]; else RT[it.rkey] = r; saveRT(); }

	/* ---------------- toast ---------------- */
	var toastEl = el('div', 'mg-toast'), toastT = 0;
	toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl);
	function toast(msg, ms, action) {
		toastEl.textContent = msg; toastEl.classList.toggle('mg-act', !!action);
		if (action) { var b = el('button', '', esc(action.label)); b.type = 'button'; b.onclick = function () { toastEl.classList.remove('mg-show'); action.fn(); }; toastEl.appendChild(b); }
		toastEl.classList.add('mg-show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('mg-show'); }, ms || (action ? 6000 : 2600));
	}

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
		ALL = []; VIEW = []; rootName = name || 'Photos'; seenKeys = new Set(); SEL.clear(); setSelMode(false); DUPN = 0; if (P.kind === 'hidden' || P.kind === 'dups') P.kind = 'all';
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
	var seenKeys = new Set();
	function addItems(list, gen) {
		if (gen !== scanGen) return;
		for (var i = 0; i < list.length; i++) { var it = list[i]; if (!it) continue; var k = G.hideKey(it); if (seenKeys.has(k)) continue; seenKeys.add(k); ALL.push(it); }
	}

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
		else if (a === 'dups') findDups();
		else if (a === 'unhideall') { var hs = ALL.filter(isHidden); if (!hs.length) { toast('Nothing is hidden in this folder.'); return; } setHidden(hs, false); }
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
		if (m.bad && m.bad !== 'video') it.bad = m.bad;   // 'video' = old thumbnail-only failures (iPhone): try again
	}

	/* ---------------- filtering, sorting, layout ---------------- */
	function aspectOf(it) { return it.ar || (it.kind === 'video' ? 16 / 9 : 4 / 3); }
	function refresh(keep) {
		var nh = hiddenCount();
		if (P.kind === 'hidden' && !nh) P.kind = 'all';
		if (P.kind === 'dups' && !DUPN) P.kind = 'all';
		var kb = $('mg-kind').querySelector('[data-kind=hidden]'); kb.hidden = !nh && P.kind !== 'hidden'; kb.textContent = 'Hidden ' + nh;
		var db2 = $('mg-kind').querySelector('[data-kind=dups]'); db2.hidden = !DUPN; db2.textContent = 'Copies ' + DUPN;
		syncBar(); syncSel();
		var list = G.filterItems(ALL, { q: $('mg-q').value, kind: P.kind, hidden: HID }, RT);
		VIEW = G.sortItems(list, P.sort, P.dir, RT, 7);
		if (P.kind === 'dups') VIEW.sort(function (a, b) { return (a._dup - b._dup) || (a._dupI - b._dupI); });
		VIEW.forEach(function (it, i) { it.vi = i; });
		var s = G.summary(ALL.filter(function (it) { return !isHidden(it); })), st = [];
		if (s.images) st.push(G.plural(s.images, 'photo'));
		if (s.videos) st.push(G.plural(s.videos, 'video'));
		st.push(G.fmtBytes(s.bytes));
		if (s.first && s.last) { var a = new Date(s.first).getFullYear(), b = new Date(s.last).getFullYear(); st.push(a === b ? '' + a : a + '–' + b); }
		if (VIEW.length !== ALL.length - nh && P.kind !== 'hidden') st.push(G.plural(VIEW.length, 'match') .replace('matchs', 'matches') + ' showing');
		if (nh) st.push(nh.toLocaleString() + ' hidden');
		$('mg-stats').textContent = '· ' + st.join(' · ');
		$('mg-dupbar').hidden = P.kind !== 'dups';
		var em = $('mg-empty');
		if (!ALL.length) { em.hidden = false; em.textContent = scanGen && $('mg-prog').hidden ? 'No photos or videos here. Try another folder, or tick "Include subfolders".' : ''; }
		else if (!VIEW.length) { em.hidden = false; em.textContent = P.kind === 'fav' ? 'No favourites yet: tap ♥ on a picture to add it.' : P.kind === 'hidden' ? 'Nothing is hidden.' : ALL.every(isHidden) ? 'Everything here is hidden. Press "Hidden" above to see them again.' : 'Nothing matches your search.'; }
		else em.hidden = true;
		if (lastKind !== P.kind) { lastKind = P.kind; rendered.forEach(function (n) { n.remove(); }); rendered.clear(); }
		relayout(!!keep);
	}
	var relayT = 0, lastKind = P.kind;
	function relayoutSoon() { if (relayT) return; relayT = setTimeout(function () { relayT = 0; if (P.sort === 'date' || P.sort === 'dims' || P.sort === 'duration' || /^(day|month|year)$/.test(P.group)) refresh(true); else relayout(true); }, 300); }
	function scrollW() { var sc = $('mg-scroll'); return sc.clientWidth - 12; }
	function relayout(keep) {
		var sc = $('mg-scroll'), anchor = null, off = 0;
		if (keep && LAY && sc.scrollTop > 0) {
			var vis = G.visible(LAY.tiles, sc.scrollTop, sc.scrollTop + 10);
			if (vis.length) { anchor = LAY.tiles[vis[0]].it; off = LAY.tiles[vis[0]].y - sc.scrollTop; }
		}
		var groups = G.groupItems(VIEW, P.kind === 'dups' ? 'dup' : P.group);
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
				n.innerHTML = '<span>' + esc(h.label) + '</span> <small>' + h.count.toLocaleString() + '</small><button type="button" data-play="' + h.g + '" title="Slideshow of this group">▶︎ Play</button>';
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
		var hid = isHidden(it), xb = '<button type="button" class="mg-xb" data-hide="1" tabindex="-1" title="' + (hid ? 'Show it again' : 'Hide from the gallery (Delete). The file is not deleted.') + '" aria-label="' + (hid ? 'Show again' : 'Hide') + '">' + (hid ? '↺' : '✕') + '</button>';
		var keep = P.kind === 'dups' && it._dupI === 0 ? '<span class="mg-keep">Oldest copy</span>' : '';
		var pick = '<span class="mg-pick" aria-hidden="true">✓</span>';
		heart = xb + heart;
		var th = thumbURL.get(it.id), img = th ? '<img alt="" src="' + th + '" class="mg-in" draggable="false">' : '<img alt="" draggable="false">';
		var ph = it.bad ? '<span class="mg-ph"><b>' + (it.kind === 'video' ? '🎞' : '🖼') + '</b>' + esc((it.ext || '').toUpperCase()) + '<br>' + (it.bad === 'video-err' ? 'can\'t play here' : 'can\'t show here') + '</span>' : it.nothumb ? '<span class="mg-ph"><b>🎞</b>' + esc((it.ext || '').toUpperCase()) + '</span>' : '';
		if (isList) {
			return '<span class="mg-lt">' + img + ph.replace('<br>', ' ') + '</span><span class="mg-lname">' + esc(it.name) + '<small>' + esc(it.folder || rootName) + '</small></span>' +
				'<span class="mg-lc mg-lx">' + (it.kind === 'video' ? (it.dur ? G.fmtDur(it.dur) : 'video') : (it.w ? it.w + '×' + it.h : '')) + '</span>' +
				'<span class="mg-lc mg-ld">' + G.fmtDate(G.dateOf(it), true) + '</span><span class="mg-lc mg-ls">' + G.fmtBytes(it.size) + '</span>' + keep + heart + pick;
		}
		return img + ph + (it.kind === 'video' ? '<span class="mg-badge">' + (it.dur ? G.fmtDur(it.dur) : '') + '</span>' : '') + (r.r ? '<span class="mg-stars">' + '★'.repeat(r.r) + '</span>' : '') +
			'<span class="mg-nm">' + esc(it.name) + '</span>' + keep + heart + pick;
	}
	function makeTile(it, isList) {
		var n = el('div', 'mg-t' + (isList ? ' mg-li' : '') + (it.kind === 'video' ? ' mg-hasbadge' : '') + (SEL.has(it.id) ? ' mg-picked' : ''));
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
		if (e.target.closest('[data-hide]')) { setHidden([it], !isHidden(it)); return; }
		if (e.target.closest('[data-fav]')) { var on = !rating(it).f; setRating(it, { f: on ? 1 : 0 }); updateTile(t, it); if (P.kind === 'fav' || P.sort === 'rating') refresh(); return; }
		if (selMode || e.ctrlKey || e.metaKey || e.shiftKey) { pickClick(it, e.shiftKey); return; }
		openViewer(it.vi, t);
	});
	cvs.addEventListener('keydown', function (e) {
		var t = e.target.closest('.mg-t'); if (!t) return;
		var it0 = byId(+t.dataset.id);
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!it0) return; if (selMode) pickClick(it0, e.shiftKey); else openViewer(it0.vi, t); }
		else if ((e.key === 'Delete' || e.key === 'Backspace') && it0) { e.preventDefault(); var list = SEL.size ? selItems() : [it0]; setHidden(list, P.kind !== 'hidden'); }
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
		// A failed thumbnail never means "can't play": only a real decode error does (iPhone Safari often won't seek a video that has not played).
		return new Promise(function (res) {
			var v = document.createElement('video'), u = URL.createObjectURL(it.file), done = false, kick = 0, to = setTimeout(function () { fin(null); }, 9000);
			function fin(r, bad) {
				if (done) return; done = true; clearTimeout(to); clearTimeout(kick);
				try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} if (v.parentNode) v.remove(); URL.revokeObjectURL(u);
				if (bad) markBad(it, 'video-err'); else if (!r) { it.nothumb = true; var n = rendered.get(it.id); if (n) updateTile(n, it); }
				res(r);
			}
			function grab() {
				if (done || !v.videoWidth) return;
				drawThumb(v, v.videoWidth, v.videoHeight).then(function (r) { r.dur = v.duration; fin(r); }, function () { fin(null); });
			}
			v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto';
			// in the page (off screen): Safari decodes frames of attached videos more reliably
			v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
			v.onloadedmetadata = function () {
				it.dur = v.duration;
				if (!v.videoWidth && !v.videoHeight) return fin(null, true);   // sound only / undecodable picture
				var t = G.posterTime(v.duration); if (t > 0.05) v.currentTime = t;
				// no "seeked" (iPhone): play it silently for a moment, then take that frame
				kick = setTimeout(function () { var p = v.play(); if (p && p.then) p.then(function () { setTimeout(function () { v.pause(); grab(); }, 250); }, function () { grab(); }); else grab(); }, 1800);
			};
			v.onloadeddata = function () { if (G.posterTime(v.duration) <= 0.05) grab(); };
			v.onseeked = grab;
			v.onerror = function () { fin(null, true); };
			(document.body || document.documentElement).appendChild(v);
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
		if (e.key === 'Escape' && selMode) { setSelMode(false); return; }
		if ((e.key === 'Delete' || e.key === 'Backspace') && SEL.size) { e.preventDefault(); setHidden(selItems(), P.kind !== 'hidden'); return; }
		if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && selMode) { e.preventDefault(); selectAll(); return; }
		if (e.key === 'Escape' && P.fill) { P.fill = false; save(); applyFill(); setTimeout(function () { relayout(true); }, 30); }
		else if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey) { $('mg-fill').click(); }
		else if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) $('mg-play').click();
		else if (e.key === '/' ) { e.preventDefault(); $('mg-q').focus(); }
	});

	/* ================= hiding, selecting, duplicates ================= */
	var SEL = new Set(), selMode = false, lastPick = null, DUPN = 0;
	function selItems() { return ALL.filter(function (it) { return SEL.has(it.id); }); }
	function setHidden(list, on, quiet) {
		if (!list.length) return;
		var t = Date.now(), changed = [];
		list.forEach(function (it) { var k = G.hideKey(it); if (on && !HID[k]) { HID[k] = t; changed.push(it); } else if (!on && HID[k]) { delete HID[k]; changed.push(it); } });
		if (!changed.length) return;
		saveHID(); SEL.clear(); refresh(true);
		if (quiet) return;
		var n = changed.length, what = n === 1 ? '"' + changed[0].name + '"' : n.toLocaleString() + ' files';
		toast(on ? 'Hidden ' + what + '. The file' + (n === 1 ? ' is' : 's are') + ' still on your computer.' : what + ' showing again.', 0, { label: 'Undo', fn: function () { setHidden(changed, !on, true); } });
	}
	function setSelMode(on) {
		selMode = !!on; if (!on) SEL.clear();
		var b = $('mg-selbtn'); if (b) { b.setAttribute('aria-pressed', String(selMode)); b.textContent = selMode ? '✓ Done selecting' : '☑ Select'; }
		$('mg-canvas').classList.toggle('mg-selmode', selMode);
		syncSel();
		rendered.forEach(function (n, id) { n.classList.toggle('mg-picked', SEL.has(id)); });
	}
	function syncSel() {
		var bar = $('mg-selbar'); if (!bar) return;
		bar.hidden = !selMode;
		var n = SEL.size;
		$('mg-selcount').textContent = n ? n.toLocaleString() + ' selected' : 'Click pictures to select them (Shift-click picks a range)';
		$('mg-selhide').disabled = !n; $('mg-selhide').textContent = P.kind === 'hidden' ? '↺ Show again' : '✕ Hide selected';
	}
	function pickClick(it, range) {
		if (!selMode) setSelMode(true);
		if (range && lastPick && VIEW.indexOf(lastPick) >= 0) {
			var a = VIEW.indexOf(lastPick), b = VIEW.indexOf(it), lo = Math.min(a, b), hi = Math.max(a, b);
			for (var i = lo; i <= hi; i++) SEL.add(VIEW[i].id);
		} else { if (SEL.has(it.id)) SEL.delete(it.id); else SEL.add(it.id); lastPick = it; }
		rendered.forEach(function (n, id) { n.classList.toggle('mg-picked', SEL.has(id)); });
		syncSel();
	}
	function selectAll() { if (!selMode) setSelMode(true); VIEW.forEach(function (it) { SEL.add(it.id); }); rendered.forEach(function (n, id) { n.classList.toggle('mg-picked', SEL.has(id)); }); syncSel(); }
	$('mg-selbtn').onclick = function () { setSelMode(!selMode); };
	$('mg-selall').onclick = selectAll;
	$('mg-selnone').onclick = function () { SEL.clear(); rendered.forEach(function (n) { n.classList.remove('mg-picked'); }); syncSel(); };
	$('mg-selhide').onclick = function () { setHidden(selItems(), P.kind !== 'hidden'); syncSel(); };
	$('mg-selcancel').onclick = function () { setSelMode(false); };
	function viewerHide() {
		var it = V.it; if (!it) return;
		var on = !isHidden(it), i = V.i;
		setHidden([it], on);
		if (!VIEW.length) { closeViewer(); return; }
		show(Math.min(i, VIEW.length - 1), 1);
	}
	/* duplicates: only files of the same size can match; those are compared by SHA-256 (whole file up to 48 MB, else its first and last 4 MB) */
	var dupBusy = false;
	function hashOf(it) {
		if (it.hash) return Promise.resolve(it.hash);
		var f = it.file, M = 4 * 1048576, p = f.size <= 48 * 1048576 ? f.arrayBuffer() : Promise.all([f.slice(0, M).arrayBuffer(), f.slice(f.size - M).arrayBuffer()]).then(function (a) { var u = new Uint8Array(2 * M); u.set(new Uint8Array(a[0]), 0); u.set(new Uint8Array(a[1]), M); return u.buffer; });
		return p.then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (h) {
			var b = new Uint8Array(h), s = ''; for (var i = 0; i < 12; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
			it.hash = s; return s;
		}, function () { return null; });
	}
	function findDups() {
		if (dupBusy) return;
		if (!(window.crypto && crypto.subtle)) { toast('This browser cannot compare files here.'); return; }
		var cands = [].concat.apply([], G.sizeBuckets(ALL.filter(function (it) { return !isHidden(it); })));
		ALL.forEach(function (it) { delete it._dup; delete it._dupI; delete it._dupN; });
		if (!cands.length) { DUPN = 0; toast('No duplicates: no two files are the same size.'); refresh(); return; }
		dupBusy = true; var done = 0, i = 0, active = 0, gen = scanGen;
		progress('Comparing ' + cands.length.toLocaleString() + ' files of the same size…', 0);
		return new Promise(function (res) {
			function pump() {
				if (gen !== scanGen) { dupBusy = false; progress(null); return res(); }
				while (active < 3 && i < cands.length) { active++; hashOf(cands[i++]).then(function () { active--; done++; progress('Comparing files: ' + done.toLocaleString() + ' of ' + cands.length.toLocaleString(), done / cands.length); pump(); }); }
				if (!active && i >= cands.length) fin();
			}
			function fin() {
				dupBusy = false; progress(null);
				var sets = G.dupSets(cands), extra = 0, bytes = 0;
				sets.forEach(function (g, si) { g.forEach(function (it, j) { it._dup = si + 1; it._dupI = j; it._dupN = g.length; if (j) { extra++; bytes += it.size; } }); });
				DUPN = extra;
				if (!sets.length) { toast('No duplicates found among ' + ALL.length.toLocaleString() + ' files.'); refresh(); return res(); }
				$('mg-duptext').textContent = sets.length.toLocaleString() + (sets.length === 1 ? ' picture is' : ' pictures are') + ' here more than once: ' + G.plural(extra, 'extra copy').replace('copys', 'copies') + ', ' + G.fmtBytes(bytes) + '. The oldest copy of each is marked.';
				P.kind = 'dups'; refresh(); $('mg-scroll').scrollTop = 0;
				res();
			}
			pump();
		});
	}
	$('mg-duphide').onclick = function () {
		var extra = ALL.filter(function (it) { return it._dup && it._dupI > 0 && !isHidden(it); });
		DUPN = 0; ALL.forEach(function (it) { delete it._dup; delete it._dupI; delete it._dupN; });
		P.kind = 'all'; setHidden(extra, true);
		if (!extra.length) refresh();
	};
	$('mg-dupdone').onclick = function () { P.kind = 'all'; refresh(); };

	/* ================= the viewer ================= */
	var V = { open: false, i: -1, it: null, media: null, natW: 0, natH: 0, s: 1, x: 0, y: 0, rot: 0, fitS: 1, url: null, ab: {}, slide: false, rotMap: {} };
	var vw = null;
	function buildViewer() {
		if (vw) return vw;
		vw = el('div', 'mgv'); vw.id = 'mgv'; vw.setAttribute('role', 'dialog'); vw.setAttribute('aria-modal', 'true'); vw.setAttribute('aria-label', 'Photo viewer'); vw.tabIndex = -1;
		vw.innerHTML =
			'<div class="mgv-stage" id="mgv-stage"></div><button type="button" class="mgv-bigplay" id="mgv-bigplay" data-a="play" aria-label="Play" hidden>▶︎</button><div class="mgv-spin" id="mgv-spin"></div><div class="mgv-sbar" id="mgv-sbar"></div><div class="mgv-osd" id="mgv-osd"></div>' +
			'<div class="mgv-top">' +
			'<button type="button" class="mgv-b mgv-x" data-a="close" title="Close (Esc)" aria-label="Close">✕</button>' +
			'<div class="mgv-tt"><b id="mgv-name"></b><small id="mgv-sub"></small></div>' +
			'<button type="button" class="mgv-b mgv-heart mgv-hidesm" data-a="fav" title="Favourite (H)" aria-label="Favourite" aria-pressed="false">♥</button>' +
			'<button type="button" class="mgv-b" data-a="hide" id="mgv-hideb" title="Hide from the gallery (Delete). The file is not deleted." aria-label="Hide">⊘<span class="mgv-hidesm"> Hide</span></button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="rotl" title="Rotate left (Shift+R)" aria-label="Rotate left">⟲</button>' +
			'<button type="button" class="mgv-b" data-a="rotr" title="Rotate right (R)" aria-label="Rotate right">⟳</button>' +
			'<button type="button" class="mgv-b mgv-zoom" data-a="sizemenu" title="Size: fit, fill, 100%, custom" aria-haspopup="true" id="mgv-zoom">Fit</button>' +
			'<button type="button" class="mgv-b" data-a="slide" title="Slideshow (P)" aria-pressed="false" id="mgv-slide">▶︎<span class="mgv-hidesm"> Slideshow</span></button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="strip" title="Strip of thumbnails (T)" aria-pressed="false" id="mgv-stripb">▭</button>' +
			'<button type="button" class="mgv-b" data-a="info" title="Details (I)" aria-pressed="false" id="mgv-infob">ⓘ</button>' +
			'<button type="button" class="mgv-b mgv-fsb" data-a="fs" title="Full screen (F)" aria-label="Full screen">⛶</button>' +
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
			'<button type="button" class="mgv-b" data-a="play" id="mgv-pp" title="Play / pause (Space, K)">▶︎</button>' +
			'<button type="button" class="mgv-b mgv-hidesm" data-a="fback" title="One frame back (,)">⏮︎</button><button type="button" class="mgv-b mgv-hidesm" data-a="ffwd" title="One frame forward (.)">⏭︎</button>' +
			'<span class="mgv-time" id="mgv-time">0:00 / 0:00</span>' +
			'<span class="mgv-sp"><button type="button" class="mgv-b" data-a="slower" title="Slower (S)">−</button><button type="button" class="mgv-b mgv-spv" data-a="speedmenu" id="mgv-spv" title="Speed: click for presets, R resets">1×</button><button type="button" class="mgv-b" data-a="faster" title="Faster (D)">+</button></span>' +
			'<span class="mgv-grow"></span>' +
			'<button type="button" class="mgv-b" data-a="seta" title="Loop start here (A)">A</button><button type="button" class="mgv-b" data-a="setb" title="Loop end here (B)">B</button><button type="button" class="mgv-b mgv-hidesm" data-a="clearab" title="Clear the A-B loop (C)" id="mgv-clab">✕AB</button>' +
			'<button type="button" class="mgv-b" data-a="loop" title="Repeat the whole video" aria-pressed="false" id="mgv-loop">🔁︎</button>' +
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
		vq('mgv-bigplay').hidden = true; V.wantPlay = false;
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
			V.wantPlay = true; startPlay(m);
			m.addEventListener('loadedmetadata', function () {
				if (gen !== loadGen) return; clearTimeout(spinT); vq('mgv-spin').classList.remove('mgv-on');
				V.natW = m.videoWidth || 1280; V.natH = m.videoHeight || 720; it.dur = m.duration;
				placeNew(m, dir, fromTile); m.playbackRate = V.rate || 1; if (m.paused && V.wantPlay) startPlay(m); syncVideo();
			});
			m.addEventListener('playing', function once() { m.removeEventListener('playing', once); setTimeout(function () { thumbFromViewer(it, m); }, 400); });
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
	// a video whose thumbnail failed (iPhone) gets one from the viewer once it really plays
	function thumbFromViewer(it, m) {
		if (thumbURL.has(it.id) || !m.videoWidth || m !== V.media) return;
		drawThumb(m, m.videoWidth, m.videoHeight).then(function (r) {
			if (!r || !r.blob) return;
			iput('thumbs', G.thumbKey(it, TPX), { b: r.blob, w: r.w, h: r.h, dur: m.duration || 0 });
			it.nothumb = false; if (it.bad === 'video') it.bad = null;
			setThumb(it, URL.createObjectURL(r.blob)); var n = rendered.get(it.id); if (n) updateTile(n, it);
		}, function () {});
	}
	function startPlay(m) { var pr = m.play(); if (pr && pr.catch) pr.catch(function () { if (m === V.media) syncVideo(); }); }
	// phones held sideways: the controls float over the picture instead of shrinking it
	function isShort() { return Math.min(window.innerHeight, (window.visualViewport && window.visualViewport.height) || 1e9) <= 520; }
	// videos are laid out at their shown size (no scale()): phones draw a scaled-down full-size video element badly (wrong place, flicker, black)
	function xf(m, tx, ty, k) {
		k = k == null ? V.s : k;
		if (m.tagName === 'VIDEO') {
			m.style.setProperty('width', Math.max(1, V.natW * k) + 'px', 'important'); m.style.setProperty('height', Math.max(1, V.natH * k) + 'px', 'important');
			m.style.transform = 'translate(-50%,-50%) translate(' + tx + 'px,' + ty + 'px) rotate(' + V.rot + 'deg)';
		} else m.style.transform = 'translate(-50%,-50%) translate(' + tx + 'px,' + ty + 'px) rotate(' + V.rot + 'deg) scale(' + k + ')';
	}
	function sizeEl(m) { if (m.tagName === 'VIDEO') return; m.style.setProperty('width', V.natW + 'px', 'important'); m.style.setProperty('height', V.natH + 'px', 'important'); }
	function placeNew(m, dir, fromTile) {
		sizeEl(m); m.style.opacity = '0';
		vq('mgv-stage').appendChild(m);
		fitNow(false);
		var target = m.style.transform;
		if (fromTile && fromTile.getBoundingClientRect && m.tagName !== 'VIDEO') {
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
	function stageSize() {
		var s = vq('mgv-stage'); var w = s.clientWidth, h = s.clientHeight; if (vw.classList.contains('mgv-info-open') && w > 700) w -= Math.min(352, w * 0.86);
		var short = isShort(); vw.classList.toggle('mgv-short', short);
		if (short) return { w: Math.max(80, w), h: Math.max(80, h), off: 0 };
		var bottom = 0; if (!vq('mgv-strip').hidden) bottom += 74; if (V.it && V.it.kind === 'video') bottom += vq('mgv-vbar').offsetHeight + 16 || 92;
		return { w: Math.max(80, w), h: Math.max(80, h - bottom - 56), off: -(bottom - 56) / 2 };
	}
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
		xf(m, V.x + shiftX, V.y + ss.off);
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
		var rzT = 0, refit = function () { if (!V.open) return; cancelAnimationFrame(rzT); rzT = requestAnimationFrame(function () { fitNow(false, true); syncStrip(); }); };
		window.addEventListener('resize', refit);
		if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
		window.addEventListener('orientationchange', function () { refit(); setTimeout(refit, 350); setTimeout(refit, 800); });
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
		else if (a === 'hide') viewerHide();
		else if (a === 'rotr' || a === 'rotl') { V.rot = ((V.rot + (a === 'rotr' ? 90 : -90)) % 360 + 360) % 360; V.rotMap[V.it.id] = V.rot; fitNow(true); }
		else if (a === 'sizemenu') { var p = vq('mgv-sizepop'); syncSizePop(); p.hidden = !p.hidden; vq('mgv-speedpop').hidden = true; }
		else if (a === 'slide') { if (V.slide) stopSlide(); else startSlide(); }
		else if (a === 'strip') { P.strip = !P.strip; save(); vq('mgv-stripb').setAttribute('aria-pressed', String(P.strip)); syncStrip(); fitNow(true, true); }
		else if (a === 'info') { P.info = !P.info; save(); vw.classList.toggle('mgv-info-open', P.info); vq('mgv-infob').setAttribute('aria-pressed', String(P.info)); fillInfo(); fitNow(true, true); }
		else if (a === 'fs') {
			var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
			if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
			else if (vw.requestFullscreen || vw.webkitRequestFullscreen) {
				var pr = (vw.requestFullscreen || vw.webkitRequestFullscreen).call(vw);
				var lock = function () { if (isV && V.natW > V.natH && screen.orientation && screen.orientation.lock && matchMedia('(pointer:coarse)').matches) screen.orientation.lock('landscape').catch(function () {}); };
				if (pr && pr.then) pr.then(lock, function () { osd('Full screen is not allowed here'); }); else lock();
			}
			else if (isV && m.webkitEnterFullscreen) m.webkitEnterFullscreen();
			else osd('Full screen is not available in this browser');
		}
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
		vq('mgv-pp').textContent = m.paused ? '▶︎' : '❚❚';
		vq('mgv-bigplay').hidden = !m.paused || m.ended && !m.loop && V.slide;
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
				var down = dy > 0 && Math.abs(dy) > Math.abs(dx);
				xf(V.media, down ? 0 : dx, (down ? dy : 0) + ss.off, V.s * (down ? Math.max(0.6, 1 - dy / 1200) : 1));
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
			case 'Delete': case 'Backspace': e.preventDefault(); act('hide'); break;
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
	function stopSlide() { if (!vw) return; V.slide = false; clearTimeout(slideT); cancelAnimationFrame(slideRaf); vq('mgv-sbar').style.width = '0'; vq('mgv-slide').setAttribute('aria-pressed', 'false'); vq('mgv-slide').firstChild.textContent = '▶︎'; }
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
	if (/[?&]debug=1/.test(location.search)) window.MESGalleryDebug = { all: function () { return ALL; }, view: function () { return VIEW; }, lay: function () { return LAY; }, V: V, P: P, open: openViewer, refresh: refresh, render: render, act: function (a) { act(a); }, urls: function (list) { return Promise.all(list.map(function (u) { return fetch(u).then(function (r) { return r.blob(); }).then(function (b) { return new File([b], u.split('/').pop(), { type: b.type || '', lastModified: Date.now() }); }); })).then(function (fs) { fromFileList(fs, 'Test files'); }); } };
	if (/[?&]debug=1/.test(location.search) && /[?&]urls=/.test(location.search)) window.MESGalleryDebug.urls(decodeURIComponent(location.search.match(/[?&]urls=([^&]+)/)[1]).split(','));
})();
