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

/* MES Reverse Image Search: engine table + URL builder (no DOM; node-testable via require). Exposed as window.MESImgSearch.
 * An engine: { id, name, g (group), badge: [text, bg, fg?], home: the site's own page, opened when the image is pasted there, url: template with {u} (the URL-encoded image link), up: { action, field } when the site accepts a file POSTed
 * straight from another page (only sites verified to do so), note }. Sites that block cross-site uploads (Google Lens answers 403, TinEye 405) take a link, or the
 * image pasted with Ctrl+V after the page opens: the app copies the image to the clipboard for that. */
(function (root) {
	"use strict";
	var GROUPS = [
		["general", "General reverse image search", "Find where a picture appears, bigger versions, and what it shows."],
		["original", "Find the original & check copies", "Who posted it first, and where else it has been reused."],
		["art", "Art, anime & illustration", "Sources for artwork, anime screenshots and fan art."],
		["info", "Metadata", "Camera, date and location data hidden inside a photo."]
	];
	var ENGINES = [
		{ id: "lens", home: "https://lens.google.com/", g: "general", name: "Google Lens", badge: ["G", "#4285f4"], url: "https://lens.google.com/uploadbyurl?url={u}", note: "Matches, objects, text, products and places. Also reads text in the picture." },
		{ id: "bing", home: "https://www.bing.com/visualsearch", g: "general", name: "Bing Visual Search", badge: ["B", "#008373"], url: "https://www.bing.com/images/search?view=detailv2&iss=sbi&FORM=SBIHMP&sbisrc=UrlPaste&q=imgurl:{u}", note: "Good for products, landmarks and similar pictures." },
		{ id: "yandex", home: "https://yandex.com/images/", g: "general", name: "Yandex Images", badge: ["Ya", "#fc3f1d"], url: "https://yandex.com/images/search?rpt=imageview&url={u}", note: "Often the best for finding the same picture on other sites. May ask for a captcha." },
		{ id: "baidu", home: "https://graph.baidu.com/pcpage/index?tpl_from=pc", g: "general", name: "Baidu", badge: ["百", "#2932e1"], url: "https://graph.baidu.com/details?isfromtusoupc=1&tn=pc&carousel=0&promotion_name=pc_image_shituindex&image={u}", note: "Strong for pictures that appear on Chinese-language sites." },
		{ id: "sogou", home: "https://pic.sogou.com/", g: "general", name: "Sogou", badge: ["So", "#fb6c00"], url: "https://pic.sogou.com/ris?query={u}&flag=1&drag=0", note: "Another Chinese search engine with image matching." },
		{ id: "tineye", home: "https://tineye.com/", g: "original", name: "TinEye", badge: ["Ti", "#1a8fbf"], url: "https://tineye.com/search?url={u}", note: "The classic: exact and edited copies, oldest and biggest versions. Sort by 'Oldest' to find the original." },
		{ id: "saucenao", home: "https://saucenao.com/", g: "art", name: "SauceNAO", badge: ["Sa", "#6a4c93"], url: "https://saucenao.com/search.php?url={u}", up: { action: "https://saucenao.com/search.php", field: "file" }, note: "Artwork, manga and anime. Accepts a file directly from this page." },
		{ id: "iqdb", home: "https://iqdb.org/", g: "art", name: "IQDB", badge: ["Iq", "#d24d57"], url: "https://iqdb.org/?url={u}", up: { action: "https://iqdb.org/", field: "file" }, note: "Searches Danbooru, Gelbooru, Pixiv and others at once. Accepts a file directly." },
		{ id: "tracemoe", home: "https://trace.moe/", g: "art", name: "trace.moe", badge: ["Tm", "#2e86de"], url: "https://trace.moe/?url={u}", note: "Which anime episode and minute a screenshot is from." },
		{ id: "ascii2d", home: "https://ascii2d.net/", g: "art", name: "ascii2d", badge: ["A2", "#3d3d3d"], url: "https://ascii2d.net/search/url/{u}", note: "Finds Pixiv / Twitter artwork even when it is cropped or recoloured." },
		{ id: "exif", home: "https://exif.regex.info/exif.cgi", g: "info", name: "Jeffrey's Exif Viewer", badge: ["Ex", "#5b7c99"], url: "http://exif.regex.info/exif.cgi?imgurl={u}", note: "Camera model, date taken and GPS location, if the file still has it." }
	];
	var SETS = [
		["popular", "Popular", ["lens", "bing", "yandex", "tineye"]],
		["original", "Find the original", ["tineye", "yandex", "lens", "baidu"]],
		["art", "Art & anime", ["saucenao", "iqdb", "tracemoe", "ascii2d", "yandex"]],
		["all", "Everything", ENGINES.map(function (e) { return e.id; })]
	];
	function isImageUrl(s) { return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test((s || "").trim()); }
	/* Turn what a person pasted into a clean link: trims, adds https:// to a bare "example.com/a.jpg", unwraps a Google / Bing "imgurl=" redirect. */
	function cleanLink(s) {
		s = (s || "").trim().replace(/^["'<]+|["'>]+$/g, "");
		if (!s) return "";
		if (/^\/\//.test(s)) s = "https:" + s;
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[^\s/]+\.[^\s/]{2,}\//.test(s)) s = "https://" + s;
		var m = /[?&](?:imgurl|mediaurl|image_url)=([^&]+)/i.exec(s);
		if (m) { try { var d = decodeURIComponent(m[1]); if (/^https?:\/\//i.test(d)) s = d; } catch (e) {} }
		return s;
	}
	function build(engine, link) { return engine.url.replace(/\{u\}/g, encodeURIComponent(link)); }
	/* A custom engine's template may use {u} (encoded link), {raw} (as typed) or %s (encoded link). */
	function customUrl(tpl, link) { return tpl.replace(/\{u\}|%s/g, encodeURIComponent(link)).replace(/\{raw\}/g, link); }
	function validTemplate(t) { return /^https?:\/\//i.test(t || "") && /\{u\}|%s|\{raw\}/.test(t); }
	function byId(id) { for (var i = 0; i < ENGINES.length; i++) if (ENGINES[i].id === id) return ENGINES[i]; return null; }
	root.MESImgSearch = { GROUPS: GROUPS, ENGINES: ENGINES, SETS: SETS, isImageUrl: isImageUrl, cleanLink: cleanLink, build: build, customUrl: customUrl, validTemplate: validTemplate, byId: byId };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESImgSearch;
})(typeof window !== "undefined" ? window : globalThis);

/* MES AI Detector: pure logic (node-testable), exposed as MESAID. It never gives a yes / no verdict: every finding is a "signal" with a direction
   (ai = points to AI, real = points to a camera / a person, info = neutral) and a strength (strong / medium / weak), and the page lists them.
   Pictures: C2PA / Content Credentials, IPTC digital source type, generator text chunks (Stable Diffusion, ComfyUI, NovelAI, InvokeAI...), XMP / EXIF traces
   (MESExif from the EXIF viewer for camera data when it is loaded). Videos: container metadata + byte traces. Text: statistics + typical AI wording + LM numbers. */
var MESAID = (function () {
	'use strict';
	var A = {};
	function latin1(u8, from, to) { var s = '', i, end = Math.min(to == null ? u8.length : to, u8.length), CH = 8192; for (i = from || 0; i < end; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(end, i + CH))); return s; }
	function utf8(u8, from, to) { var b = u8.subarray(from, to); try { return typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }).decode(b) : Buffer.from(b).toString('utf8'); } catch (e) { return latin1(u8, from, to); } }
	A.latin1 = latin1;
	/* The part of a file we search: whole file up to 24 MB, else the first 16 MB + the last 4 MB (metadata sits at either end). */
	A.haystack = function (u8) { if (u8.length <= 24 << 20) return latin1(u8); return latin1(u8, 0, 16 << 20) + '\n' + latin1(u8, u8.length - (4 << 20)); };
	function sig(dir, strength, title, detail, src) { return { dir: dir, strength: strength, title: title, detail: detail || '', src: src || '' }; }
	A.sig = sig;

	/* ---- generator names (C2PA claim generators, XMP CreatorTool, Software fields, video encoders) ---- */
	var GEN = [
		[/Adobe\s*Firefly|firefly/i, 'Adobe Firefly'], [/DALL[·\.\- ]?E/i, 'OpenAI DALL·E'], [/gpt-image|ChatGPT|OpenAI/i, 'OpenAI (ChatGPT image)'], [/\bSora\b/i, 'OpenAI Sora'],
		[/Midjourney/i, 'Midjourney'], [/Stable[\s_-]?Diffusion|stability\.ai|\bSDXL\b|\bSD3\b/i, 'Stable Diffusion'], [/ComfyUI/i, 'ComfyUI'], [/Automatic1111|stable-diffusion-webui/i, 'Stable Diffusion web UI'],
		[/NovelAI/i, 'NovelAI'], [/InvokeAI/i, 'InvokeAI'], [/Fooocus/i, 'Fooocus'], [/Leonardo\.?ai/i, 'Leonardo.Ai'], [/ideogram/i, 'Ideogram'], [/\bFlux(\.1)?[\s-](dev|schnell|pro)/i, 'FLUX'],
		[/Imagen|Gemini|Nano Banana|Made with Google AI|SynthID/i, 'Google (Gemini / Imagen)'], [/\bVeo\b/i, 'Google Veo'], [/Microsoft Designer|Bing Image Creator|Image Creator from Microsoft/i, 'Microsoft Designer / Bing'],
		[/Meta AI|Imagined with AI|Emu\b/i, 'Meta AI'], [/grok|Aurora by xAI|xAI/i, 'xAI Grok'], [/Runway(ML)?|Gen-[234]\b/i, 'Runway'], [/\bPika\b/i, 'Pika'], [/\bKling\b/i, 'Kling'],
		[/Luma (AI|Dream)|Dream Machine/i, 'Luma'], [/HeyGen/i, 'HeyGen'], [/Synthesia/i, 'Synthesia'], [/Hailuo|MiniMax/i, 'Hailuo / MiniMax'], [/Canva (AI|Magic)|Magic Media/i, 'Canva AI'],
		[/Generative (Fill|Expand)/i, 'Photoshop Generative Fill'], [/craiyon/i, 'Craiyon'], [/NightCafe/i, 'NightCafe'], [/playground(ai)?\.com|Playground v/i, 'Playground'], [/Krea/i, 'Krea'], [/Wan2\.|Hunyuan/i, 'Wan / Hunyuan']
	];
	var CAMS = /\b(Canon|Nikon|NIKON|SONY|Sony|FUJIFILM|Fujifilm|OLYMPUS|OM Digital|Panasonic|LEICA|Leica|PENTAX|RICOH|Hasselblad|Apple|samsung|Samsung|Google|Pixel|HUAWEI|Xiaomi|OnePlus|motorola|GoPro|DJI|Insta360)\b/;
	A.genNames = function (s) { var out = []; GEN.forEach(function (g) { if (g[0].test(s) && out.indexOf(g[1]) < 0) out.push(g[1]); }); return out; };

	/* ---- PNG text chunks ---- */
	A.pngChunks = function (u8) {
		var out = [], i = 8;
		if (!(u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47)) return out;
		while (i + 8 <= u8.length && out.length < 200) {
			var len = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0, ty = latin1(u8, i + 4, i + 8), st = i + 8, en = st + len;
			if (en > u8.length) break;
			if (ty === 'tEXt') { var z = u8.indexOf(0, st); if (z > st && z < en) out.push({ type: ty, key: latin1(u8, st, z), text: latin1(u8, z + 1, en) }); }
			else if (ty === 'iTXt') {
				var z1 = u8.indexOf(0, st); if (z1 > st && z1 < en) {
					var key = latin1(u8, st, z1), comp = u8[z1 + 1], p = z1 + 3, z2 = u8.indexOf(0, p), z3 = z2 >= 0 ? u8.indexOf(0, z2 + 1) : -1;
					if (z3 >= 0 && z3 < en) out.push({ type: ty, key: key, text: comp ? '' : utf8(u8, z3 + 1, en), compressed: !!comp, raw: comp ? u8.subarray(z3 + 1, en) : null });
				}
			} else if (ty === 'zTXt') { var zz = u8.indexOf(0, st); if (zz > st && zz < en) out.push({ type: ty, key: latin1(u8, st, zz), text: '', compressed: true, raw: u8.subarray(zz + 2, en) }); }
			else if (ty === 'caBX') out.push({ type: ty, key: 'C2PA', text: '' });
			else if (ty === 'eXIf') out.push({ type: ty, key: 'EXIF', text: '' });
			if (ty === 'IEND') break;
			i = en + 4;
		}
		return out;
	};
	/* "parameters" written by the Stable Diffusion web UI / Forge: prompt, then "Negative prompt:", then "Steps: 20, Sampler: ..., Seed: ..., Model: ..." */
	A.parseA1111 = function (t) {
		var r = { prompt: '', negative: '', settings: {} }, m = /\n(Steps: [\s\S]*)$/.exec(t), head = m ? t.slice(0, m.index) : t;
		var ni = head.indexOf('\nNegative prompt:'); r.prompt = (ni >= 0 ? head.slice(0, ni) : head).trim(); if (ni >= 0) r.negative = head.slice(ni + 17).trim();
		if (m) m[1].split(/,\s*(?=[A-Z][\w ]{1,30}: )/).forEach(function (kv) { var j = kv.indexOf(':'); if (j > 0) r.settings[kv.slice(0, j).trim()] = kv.slice(j + 1).trim(); });
		return r;
	};
	function genFromPngText(ch, push) {
		var k = ch.key.toLowerCase(), t = ch.text || '';
		if (k === 'parameters' && /Steps:\s*\d+/.test(t)) { var p = A.parseA1111(t), st = p.settings; push(sig('ai', 'strong', 'Stable Diffusion settings are saved in this picture', 'The PNG has a "parameters" note with the prompt and the generator settings' + (st.Model ? ' (model ' + st.Model + ')' : '') + (st.Sampler ? ', sampler ' + st.Sampler : '') + (st.Seed ? ', seed ' + st.Seed : '') + '.', 'PNG text')); return { kind: 'a1111', prompt: p.prompt, negative: p.negative, settings: st }; }
		if ((k === 'prompt' || k === 'workflow') && /class_type|"nodes"\s*:|KSampler|CheckpointLoader/i.test(t)) { push(sig('ai', 'strong', 'A ComfyUI workflow is saved in this picture', 'The PNG carries the node graph ComfyUI used to make it (' + ch.key + ').', 'PNG text')); var pr = /"text"\s*:\s*"((?:[^"\\]|\\.){3,600})"/.exec(t); return { kind: 'comfy', prompt: pr ? pr[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '' }; }
		if ((k === 'software' || k === 'source') && /NovelAI/i.test(t)) { push(sig('ai', 'strong', 'Made with NovelAI', 'The PNG says Software / Source: ' + t.slice(0, 80) + '.', 'PNG text')); return { kind: 'novelai' }; }
		if (k === 'comment' && /"(steps|sampler|uc|scale|seed)"\s*:/.test(t)) { push(sig('ai', 'strong', 'Image-generator settings in the PNG comment', 'A JSON comment with sampler / seed / steps settings, as NovelAI and others write it.', 'PNG text')); return { kind: 'json' }; }
		if (k === 'dream' || k === 'sd-metadata' || k === 'invokeai_metadata' || k === 'invokeai_graph') { push(sig('ai', 'strong', 'InvokeAI settings are saved in this picture', 'PNG note "' + ch.key + '".', 'PNG text')); return { kind: 'invoke' }; }
		if (k === 'fooocus_scheme' || /fooocus/i.test(t.slice(0, 300))) { push(sig('ai', 'strong', 'Fooocus settings are saved in this picture', '', 'PNG text')); return { kind: 'fooocus' }; }
		return null;
	}

	/* ---- XMP ---- */
	A.xmpBlocks = function (hay) { var out = [], re = /<x:xmpmeta[\s\S]{0,400000}?<\/x:xmpmeta>/g, m; while ((m = re.exec(hay)) && out.length < 8) out.push(m[0]); return out; };
	function xmpVal(x, name) {
		var re = new RegExp('(?:' + name + ')\\s*=\\s*"([^"]{0,600})"|<(?:' + name + ')>\\s*([\\s\\S]{0,1200}?)\\s*</(?:' + name + ')>', 'i'), m = re.exec(x);
		if (!m) return ''; var v = m[1] != null ? m[1] : m[2]; return v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	}
	A.xmpVal = xmpVal;
	var DST = {
		trainedAlgorithmicMedia: ['ai', 'strong', 'The file says it was made by AI', 'IPTC digital source type "trained algorithmic media": generated by a trained AI model.'],
		compositeWithTrainedAlgorithmicMedia: ['ai', 'strong', 'The file says part of it was made with AI', 'IPTC digital source type "composite with trained algorithmic media": an edit that used generative AI (e.g. Generative Fill).'],
		algorithmicallyEnhanced: ['ai', 'medium', 'The file says it was enhanced by an algorithm', 'IPTC digital source type "algorithmically enhanced".'],
		algorithmicMedia: ['ai', 'medium', 'The file says it was made by a computer program', 'IPTC digital source type "algorithmic media": computer-generated, not necessarily with AI.'],
		compositeSynthetic: ['ai', 'medium', 'The file says it is a synthetic composite', 'IPTC digital source type "composite synthetic".'],
		virtualRecording: ['info', 'weak', 'Recorded from a screen or a game', 'IPTC digital source type "virtual recording".'],
		digitalCapture: ['real', 'medium', 'The file says it was captured by a camera', 'IPTC digital source type "digital capture". Like all metadata, it can be written by anyone.'],
		computationalCapture: ['real', 'medium', 'The file says it was captured by a phone camera', 'IPTC digital source type "computational capture" (phone processing such as HDR).'],
		negativeFilm: ['real', 'medium', 'Scanned from film', 'IPTC digital source type "negative film".'], positiveFilm: ['real', 'medium', 'Scanned from film', 'IPTC digital source type "positive film".'],
		print: ['real', 'weak', 'Scanned from a print', 'IPTC digital source type "print".'], minorHumanEdits: ['real', 'weak', 'Small human edits', 'IPTC digital source type "minor human edits".'],
		composite: ['info', 'weak', 'A composite of several pictures', 'IPTC digital source type "composite".'], digitalArt: ['info', 'medium', 'Made by a person with digital tools', 'IPTC digital source type "digital art".'],
		dataDrivenMedia: ['info', 'weak', 'Data-driven media', 'IPTC digital source type "data-driven media" (charts, maps...).']
	};
	A.DST = DST;
	A.sourceTypes = function (hay) { var out = [], re = /digitalsourcetype\/(\w+)/gi, m; while ((m = re.exec(hay))) { var k = m[1]; for (var d in DST) if (d.toLowerCase() === k.toLowerCase() && out.indexOf(d) < 0) out.push(d); } return out; };

	/* ---- C2PA ---- */
	A.c2pa = function (hay) {
		var at = hay.search(/c2pa\.(claim|signature|assertions|manifest)|\x00jumb[\s\S]{0,40}c2pa|caBX/);
		if (at < 0 && !/urn:(uuid|c2pa):[\s\S]{0,60}c2pa|contentauth/i.test(hay)) return null;
		var from = Math.max(0, (at < 0 ? 0 : at) - 2000), part = hay.slice(from, from + 600000), r = { gens: [], actions: [], issuer: '', camera: '', sourceTypes: A.sourceTypes(part), text: '' };
		var cg = part.match(/claim_generator(?:_info)?[\s\S]{0,12}?([\x20-\x7e]{3,120})/g) || [];
		cg.forEach(function (s) { var v = s.replace(/^claim_generator(_info)?[^\x20-\x7e]*/, '').replace(/[^\x20-\x7e]/g, ' ').trim(); if (v && r.text.length < 600) r.text += v + ' | '; });
		var names = part.match(/(?:\bname|\bsoftwareAgent)[^\x20-\x7e]{1,6}([\x20-\x7e]{3,80})/g) || []; names.slice(0, 40).forEach(function (s) { r.text += s.replace(/^(name|softwareAgent)[^\x20-\x7e]*/, '') + ' | '; });
		(part.match(/c2pa\.(created|opened|edited|placed|cropped|resized|color_adjustments|filtered|converted|drawing|published|transcoded|removed|repackaged)/g) || []).forEach(function (a) { if (r.actions.indexOf(a) < 0) r.actions.push(a); });
		var iss = /(?:O=|organizationName[^\x20-\x7e]{1,4})([\x20-\x7e]{3,60})/.exec(part); if (iss) r.issuer = iss[1].replace(/[,\/].*$/, '').trim();
		r.gens = A.genNames(r.text + ' ' + r.issuer);
		var cam = CAMS.exec(r.text + ' ' + r.issuer); if (cam && !r.gens.length) r.camera = cam[1];
		return r;
	};

	/* ---- dimensions often used by generators (weak hint only) ---- */
	var AI_SIZES = { '1024x1024': 1, '1024x1792': 1, '1792x1024': 1, '1536x1024': 1, '1024x1536': 1, '512x512': 1, '768x768': 1, '832x1216': 1, '1216x832': 1, '896x1152': 1, '1152x896': 1, '768x1344': 1, '1344x768': 1, '640x1536': 1, '1536x640': 1, '2048x2048': 1, '1408x768': 1, '768x1408': 1, '1184x864': 1, '864x1184': 1, '1248x832': 1, '832x1248': 1 };
	A.sizeHint = function (w, h) { if (!w || !h) return null; if (AI_SIZES[w + 'x' + h]) return 'list'; if (w % 64 === 0 && h % 64 === 0 && w <= 2048 && h <= 2048 && w >= 512 && h >= 512) return 'mult64'; return null; };

	/* ---- the whole picture check. exif = MESExif.parse(u8) result or null; w / h = decoded size or 0 ---- */
	A.scanImage = function (u8, opt) {
		opt = opt || {}; var hay = A.haystack(u8), S = [], push = function (s) { S.push(s); }, info = { format: fmt(u8), gens: [], prompt: '', settings: null, texts: [], xmp: [], c2pa: null, camera: '' };
		/* C2PA */
		var c = A.c2pa(hay); info.c2pa = c;
		if (c) {
			var aiType = c.sourceTypes.filter(function (t) { return DST[t][0] === 'ai'; });
			if (c.gens.length || aiType.length) push(sig('ai', 'strong', 'Content Credentials say this was made with AI' + (c.gens.length ? ': ' + c.gens.join(', ') : ''), 'A C2PA manifest is attached' + (c.actions.length ? ' (actions: ' + c.actions.map(function (a) { return a.replace('c2pa.', ''); }).join(', ') + ')' : '') + (aiType.length ? ', with digital source type ' + aiType.join(', ') : '') + '. This page reads it but does not check its signature: confirm at contentcredentials.org/verify.', 'C2PA'));
			else if (c.camera) push(sig('real', 'strong', 'Content Credentials from a camera / phone: ' + c.camera, 'A C2PA manifest signed by the device maker is attached. Check the signature at contentcredentials.org/verify.', 'C2PA'));
			else push(sig('info', 'medium', 'Content Credentials (C2PA) are attached', 'The file records how it was made or edited' + (c.text ? ' (' + c.text.replace(/\s*\|\s*$/, '').slice(0, 160) + ')' : '') + '. Open it at contentcredentials.org/verify to see every step.', 'C2PA'));
		}
		/* IPTC digital source type (XMP or C2PA) */
		A.sourceTypes(hay).forEach(function (t) { if (c && c.sourceTypes.indexOf(t) >= 0 && DST[t][0] === 'ai') return; var d = DST[t]; push(sig(d[0], d[1], d[2], d[3], 'IPTC')); });
		/* PNG text chunks */
		A.pngChunks(u8).forEach(function (ch) {
			if (ch.type === 'caBX' || ch.type === 'eXIf') return;
			info.texts.push(ch); var g = genFromPngText(ch, push); if (g) { info.prompt = info.prompt || g.prompt || ''; if (g.settings) info.settings = g.settings; }
		});
		/* XMP fields */
		A.xmpBlocks(hay).forEach(function (x) {
			var tool = xmpVal(x, 'xmp:CreatorTool|xmp:creatortool'), desc = xmpVal(x, 'dc:description'), credit = xmpVal(x, 'photoshop:Credit|Iptc4xmpCore:Credit'), hist = xmpVal(x, 'stEvt:softwareAgent');
			info.xmp.push({ tool: tool, desc: desc, credit: credit, hist: hist });
			var g = A.genNames([tool, credit, hist].join(' | '));
			if (g.length) push(sig('ai', 'medium', 'The XMP data names an AI tool: ' + g.join(', '), 'Creator tool / credit / history: ' + [tool, credit, hist].filter(Boolean).join(' · ').slice(0, 200), 'XMP'));
			if (/Job ID:\s*[0-9a-f-]{20,}/i.test(desc) || /midjourney/i.test(desc)) push(sig('ai', 'strong', 'Midjourney job details in the description', desc.slice(0, 200), 'XMP'));
		});
		/* EXIF */
		var ex = opt.exif;
		if (ex && ex.rows) {
			var get = function (n) { var r = ex.rows.filter(function (q) { return q.name === n; })[0]; return r ? r.value : ''; };
			var make = get('Camera make'), model = get('Camera model'), sw = get('Software'), expo = get('Exposure time'), iso = get('ISO'), fn = get('Aperture (f-number)');
			if (make || model) { info.camera = (make + ' ' + model).trim(); push(sig('real', expo || iso || fn ? 'medium' : 'weak', 'Camera data: ' + info.camera, (expo || iso || fn ? 'Exposure settings are recorded (' + [expo, fn, iso ? 'ISO ' + iso : ''].filter(Boolean).join(', ') + '). ' : '') + 'Camera EXIF is a good sign but can be copied from another photo or typed in.', 'EXIF')); }
			var sg = A.genNames(sw + ' ' + get('Description') + ' ' + get('Artist') + ' ' + get('User comment'));
			if (sg.length) push(sig('ai', 'strong', 'The EXIF names an AI tool: ' + sg.join(', '), 'Software / description field: ' + (sw || get('Description')).slice(0, 160), 'EXIF'));
			else if (sw && /photoshop|lightroom|gimp|affinity|snapseed|picsart|facetune|pixelmator|canva/i.test(sw)) push(sig('info', 'weak', 'Edited with ' + sw, 'Editing is normal for real photos too; it only tells you the file passed through an editor.', 'EXIF'));
			if (ex.gps) push(sig('real', 'weak', 'GPS location recorded', 'Phones add GPS when they take a photo. Generators don\'t, but it can be added later.', 'EXIF'));
		}
		/* loose byte traces (C2PA missing but names in the file) */
		if (!S.some(function (s) { return s.dir === 'ai' && s.strength === 'strong'; })) {
			var head = hay.length > 3000000 ? hay.slice(0, 2000000) + hay.slice(-1000000) : hay, lg = [];
			[[/Made with Google AI|Google Generative AI|SynthID/, 'Google AI label'], [/Imagined with AI/, 'Meta "Imagined with AI" label'], [/Generated by (DALL|OpenAI|ChatGPT)/i, 'OpenAI label'], [/Midjourney/i, 'Midjourney'], [/\bgpt-image-\d/i, 'OpenAI gpt-image']].forEach(function (p) { if (p[0].test(head)) lg.push(p[1]); });
			if (lg.length) push(sig('ai', 'medium', 'AI tool names found inside the file', lg.join(', ') + '. Found as text in the file, outside the standard fields.', 'bytes'));
		}
		/* size hint */
		var sh = A.sizeHint(opt.w, opt.h);
		if (sh === 'list') push(sig('ai', 'weak', 'A size image generators often use (' + opt.w + ' × ' + opt.h + ')', 'Many generators output exactly this size. Plenty of real pictures are cropped to it too, so this alone means little.', 'size'));
		else if (sh === 'mult64') push(sig('info', 'weak', 'Both sides are multiples of 64 px (' + opt.w + ' × ' + opt.h + ')', 'Diffusion models work in 64-pixel steps. Weak hint.', 'size'));
		/* nothing at all */
		if (!S.some(function (s) { return s.src !== 'size'; })) push(sig('info', 'medium', 'No metadata to go on', 'This file has no camera data, no Content Credentials and no generator notes. That is normal for screenshots and pictures saved from social sites, which remove them: it says nothing either way.', 'none'));
		info.gens = A.genNames(S.map(function (s) { return s.title + ' ' + s.detail; }).join(' '));
		return { info: info, signals: dedupe(S) };
	};
	function dedupe(S) { var seen = {}; return S.filter(function (s) { var k = s.dir + s.title; if (seen[k]) return false; seen[k] = 1; return true; }); }
	function fmt(u8) {
		if (u8[0] === 0xFF && u8[1] === 0xD8) return 'JPEG'; if (u8[0] === 0x89 && u8[1] === 0x50) return 'PNG';
		var a = latin1(u8, 0, 12); if (a.slice(0, 4) === 'RIFF' && a.slice(8, 12) === 'WEBP') return 'WebP'; if (a.slice(0, 3) === 'GIF') return 'GIF';
		if (a.slice(4, 8) === 'ftyp') { var b = a.slice(8, 12); return /avif/.test(b) ? 'AVIF' : /heic|heix|mif1|heif/.test(b) ? 'HEIC' : /qt/.test(b) ? 'MOV' : 'MP4'; }
		if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) return 'WebM / MKV';
		if (a.slice(0, 2) === 'II' || a.slice(0, 2) === 'MM') return 'TIFF'; return 'Unknown';
	}
	A.format = fmt;

	/* ---- video container: MP4 / MOV box walk (top levels) + byte traces ---- */
	A.mp4Boxes = function (u8, maxDepth) {
		var out = [], CONT = { moov: 1, udta: 1, meta: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, ilst: 1, keys: 0, edts: 1 };
		function walk(from, to, depth, path) {
			var i = from, n = 0;
			while (i + 8 <= to && n++ < 400) {
				var size = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0, ty = latin1(u8, i + 4, i + 8), hdr = 8;
				if (size === 1 && i + 16 <= to) { size = ((u8[i + 12] << 24) | (u8[i + 13] << 16) | (u8[i + 14] << 8) | u8[i + 15]) >>> 0; if (u8[i + 8] | u8[i + 9] | u8[i + 10] | u8[i + 11]) size = to - i; hdr = 16; }
				if (size === 0) size = to - i; if (size < hdr || i + size > to + 8) break;
				var end = Math.min(i + size, to), p = path ? path + '/' + ty : ty; out.push({ type: ty, path: p, start: i, hdr: hdr, end: end });
				if (CONT[ty] && depth < (maxDepth || 6)) walk(i + hdr + (ty === 'meta' && latin1(u8, i + hdr + 4, i + hdr + 8) !== 'hdlr' ? 4 : 0), end, depth + 1, p);
				i += size;
			}
		}
		walk(0, u8.length, 0, ''); return out;
	};
	A.scanVideo = function (u8, opt) {
		opt = opt || {}; var S = [], push = function (s) { S.push(s); }, info = { format: fmt(u8), encoder: '', make: '', model: '', software: '', created: '', location: '', brand: '', c2pa: null, size: opt.size || u8.length };
		if (/MP4|MOV/.test(info.format)) {
			info.brand = latin1(u8, 8, 12).trim();
			var boxes = A.mp4Boxes(u8), keys = [];
			boxes.forEach(function (b) {
				if (b.type === 'mvhd') { var o = b.start + b.hdr, u32 = function (q) { return ((u8[q] << 24) | (u8[q + 1] << 16) | (u8[q + 2] << 8) | u8[q + 3]) >>> 0; }, t = u8[o] === 1 ? u32(o + 4) * 4294967296 + u32(o + 8) : u32(o + 4); if (t > 0) { var d = new Date((t - 2082844800) * 1000); if (d.getUTCFullYear() > 1990 && d.getUTCFullYear() < 2100) info.created = d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC'; } }
				if (b.type === 'keys') { var n = (u8[b.start + 12] << 24 | u8[b.start + 13] << 16 | u8[b.start + 14] << 8 | u8[b.start + 15]) >>> 0, p = b.start + 16; for (var k = 0; k < n && k < 60 && p + 8 <= b.end; k++) { var ks = (u8[p] << 24 | u8[p + 1] << 16 | u8[p + 2] << 8 | u8[p + 3]) >>> 0; if (ks < 8) break; keys.push(latin1(u8, p + 8, p + ks)); p += ks; } }
				var parent = b.path.split('/').slice(-2, -1)[0];
				if (parent === 'ilst' || parent === 'udta') {
					var dat = A.findData(u8, b.start + b.hdr, b.end), ty = b.type;
					if (parent === 'ilst' && keys.length && /^\x00/.test(ty)) { var key = keys[((u8[b.start + 4] << 24 | u8[b.start + 5] << 16 | u8[b.start + 6] << 8 | u8[b.start + 7]) >>> 0) - 1] || ''; ty = /make$/.test(key) ? '\u00a9mak' : /model$/.test(key) ? '\u00a9mod' : /software$/.test(key) ? 'soft' : /ISO6709$/.test(key) ? '\u00a9xyz' : /creationdate$/.test(key) ? '\u00a9day' : /encoder|tool/i.test(key) ? '\u00a9too' : ty; }
					if (ty === '\u00a9too' || ty === '\u00a9enc' || ty === '\u00a9swr') info.encoder = info.encoder || dat;
					else if (ty === 'soft') info.software = dat; else if (ty === '\u00a9mak') info.make = dat; else if (ty === '\u00a9mod') info.model = dat; else if (ty === '\u00a9xyz') info.location = dat; else if (ty === '\u00a9day') info.created = dat || info.created;
				}
			});
		}
		var hay = A.haystack(u8), c = A.c2pa(hay); info.c2pa = c;
		if (!info.encoder) { var lv = /Lavf\d+\.\d+\.\d+|Lavc\d+\.\d+/.exec(hay); if (lv) info.encoder = lv[0]; }
		if (c) { var aiT = c.sourceTypes.filter(function (t) { return DST[t][0] === 'ai'; }); if (c.gens.length || aiT.length) push(sig('ai', 'strong', 'Content Credentials say this video was made with AI' + (c.gens.length ? ': ' + c.gens.join(', ') : ''), 'A C2PA manifest is attached. Check its signature at contentcredentials.org/verify.', 'C2PA')); else if (c.camera) push(sig('real', 'strong', 'Content Credentials from a camera / phone: ' + c.camera, '', 'C2PA')); else push(sig('info', 'medium', 'Content Credentials (C2PA) are attached', 'Open it at contentcredentials.org/verify to see every step.', 'C2PA')); }
		A.sourceTypes(hay).forEach(function (t) { if (c && c.sourceTypes.indexOf(t) >= 0) return; var d = DST[t]; push(sig(d[0], d[1], d[2], d[3], 'IPTC')); });
		var g = A.genNames([info.encoder, info.software, info.make, info.model].join(' | '));
		if (g.length) push(sig('ai', 'strong', 'The video metadata names an AI tool: ' + g.join(', '), 'Encoder / software: ' + (info.software || info.encoder), 'container'));
		if ((info.make || info.model) && !g.length) push(sig('real', 'medium', 'Recorded on: ' + (info.make + ' ' + info.model).trim(), 'Phones and cameras write their make and model into the video. It can be copied, but generators don\'t add it.', 'container'));
		if (info.location) push(sig('real', 'weak', 'A recording location is saved', info.location, 'container'));
		if (/^Lav/.test(info.encoder)) push(sig('info', 'weak', 'Re-encoded with FFmpeg (' + info.encoder + ')', 'The file was converted or downloaded by a tool, which usually removes the original camera / generator data.', 'container'));
		if (!g.length && !c) { var lg = A.genNames(hay.slice(0, 200000) + hay.slice(-200000)).filter(function (n) { return !/Google \(|Meta AI|xAI/.test(n); }); if (lg.length) push(sig('ai', 'medium', 'AI tool names found inside the file', lg.join(', '), 'bytes')); }
		if (!S.length) push(sig('info', 'medium', 'No metadata to go on', 'No camera make, no Content Credentials, no generator notes. Videos downloaded from YouTube, X, TikTok and others lose them, so this says nothing either way.', 'none'));
		return { info: info, signals: dedupe(S) };
	};
	A.findData = function (u8, from, to) { for (var i = from; i + 16 <= to; i++) if (u8[i + 4] === 0x64 && u8[i + 5] === 0x61 && u8[i + 6] === 0x74 && u8[i + 7] === 0x61) { var sz = (u8[i] << 24 | u8[i + 1] << 16 | u8[i + 2] << 8 | u8[i + 3]) >>> 0; return utf8(u8, i + 16, Math.min(i + sz, to)).replace(/\u0000/g, '').trim(); } var s = latin1(u8, from + 4, to).replace(/[^\x20-\x7e]/g, '').trim(); return s.slice(0, 200); };

	/* ---- classifier output -> P(AI) ---- */
	A.clsProb = function (out) {
		if (!out || !out.length) return null; var ai = 0, real = 0;
		out.forEach(function (o) { var l = String(o.label).toLowerCase(); if (/fake|artificial|ai|generated|synthetic/.test(l)) ai += o.score; else if (/real|human|natural/.test(l)) real += o.score; });
		return ai + real > 0 ? ai / (ai + real) : null;
	};
	A.clsSignal = function (p, frames) {
		if (p == null) return null; var pct = Math.round(p * 100), what = frames ? 'average over ' + frames + ' frames' : 'this picture';
		var d = 'A small open model (MIT, trained in 2024) scored ' + what + ' at ' + pct + '% "AI". These models are often wrong: they miss newer generators and can flag edited or compressed real photos. Treat it as one weak hint.';
		if (p >= 0.85) return sig('ai', 'weak', 'The model leans AI (' + pct + '%)', d, 'model');
		if (p <= 0.15) return sig('real', 'weak', 'The model leans real (' + (100 - pct) + '% real)', d, 'model');
		return sig('info', 'weak', 'The model is unsure (' + pct + '% AI)', d, 'model');
	};

	/* ---- summary: never a verdict, just what the evidence adds up to ---- */
	var W = { strong: 3, medium: 1.5, weak: 0.5 };
	A.summary = function (S) {
		var ai = 0, real = 0, strongAi = false, strongReal = false;
		S.forEach(function (s) { var w = W[s.strength] || 0; if (s.dir === 'ai') { ai += w; if (s.strength === 'strong') strongAi = true; } if (s.dir === 'real') { real += w; if (s.strength === 'strong') strongReal = true; } });
		var level, text;
		if (strongAi && !strongReal) { level = 'ai'; text = 'The file itself says it was made or edited with AI.'; }
		else if (strongAi && strongReal) { level = 'mixed'; text = 'The evidence points both ways. Look at each item below.'; }
		else if (strongReal) { level = 'real'; text = 'Content Credentials from a camera or phone are attached. Check the signature to be sure.'; }
		else if (ai >= 1.5 && ai > real * 1.5) { level = 'lean-ai'; text = 'Some hints point to AI, none of them conclusive.'; }
		else if (real >= 1.5 && real > ai * 1.5) { level = 'lean-real'; text = 'Some hints point to a real camera, none of them conclusive.'; }
		else if (ai + real === 0) { level = 'none'; text = 'Nothing in the file points either way.'; }
		else { level = 'unclear'; text = 'The hints are weak or mixed.'; }
		return { level: level, text: text, ai: ai, real: real };
	};

	/* ---- text ---- */
	A.sentences = function (t) { return String(t).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])["'”’)\]]*\s+(?=["'“‘(\[]?[A-Z0-9])/).map(function (s) { return s.trim(); }).filter(function (s) { return /[A-Za-z]{2}/.test(s); }); };
	A.words = function (t) { return (String(t).toLowerCase().match(/[a-z][a-z'’-]*/g) || []); };
	var PHRASES = [
		[/\bas an ai( language model)?\b|\bi('m| am) an ai\b|\bas a large language model\b/i, 'strong', '"As an AI language model"'],
		[/\b(certainly|sure|absolutely)!? here('s| is| are)\b/i, 'medium', '"Certainly! Here is..." (chat-reply opener)'], [/\[(your name|insert [^\]]{1,30}|name|company name|date)\]/i, 'medium', 'Placeholder like [Your Name]'],
		[/\bi hope this (email|message|helps|finds you well)\b/i, 'weak', '"I hope this helps / finds you well"'], [/\bknowledge cutoff\b|\bmy training data\b/i, 'strong', 'Mentions its training data / cutoff'],
		[/\bregenerate response\b/i, 'medium', '"Regenerate response" (copied chat button)']
	];
	var WORDS = ['delve', 'delves', 'delving', 'tapestry', 'testament', 'realm', 'intricate', 'multifaceted', 'pivotal', 'foster', 'fostering', 'seamless', 'seamlessly', 'leverage', 'leveraging', 'elevate', 'unlock', 'unleash', 'embark', 'navigate', 'navigating', 'landscape', 'showcasing', 'showcase', 'underscore', 'underscores', 'vibrant', 'bustling', 'meticulous', 'meticulously', 'commendable', 'invaluable', 'paramount', 'nuanced', 'holistic', 'robust', 'crucial', 'furthermore', 'moreover', 'additionally', 'ultimately', 'comprehensive', 'enhance', 'enhancing', 'harness', 'resonate', 'resonates', 'captivating', 'boasts', 'beacon', 'interplay', 'ever-evolving', 'game-changer', 'transformative'];
	var GRAMS = [/\bit('s| is) (important|worth|crucial) (to note|noting|to remember)\b/gi, /\bin today's (fast-paced|digital|ever-changing)\b/gi, /\bplays? a (crucial|pivotal|vital|key) role\b/gi, /\bin conclusion\b/gi, /\bnot only\b[^.]{3,80}\bbut also\b/gi, /\ba testament to\b/gi, /\bwhether you('re| are)\b/gi, /\bdive (deep|deeper|into)\b/gi, /\bthe world of\b/gi, /\bstands? as a\b/gi, /\bnavigat(e|ing) the (complexities|challenges|world)\b/gi, /\bwhen it comes to\b/gi, /\bin the realm of\b/gi, /\bembark on a journey\b/gi, /\bbelow is a\b|\bhere's a breakdown\b/gi];
	A.WORDS = WORDS;
	A.textStats = function (t) {
		t = String(t || ''); var sents = A.sentences(t), words = A.words(t), n = words.length, lens = sents.map(function (s) { return A.words(s).length; }).filter(function (x) { return x > 0; });
		var mean = lens.reduce(function (a, b) { return a + b; }, 0) / (lens.length || 1), sd = Math.sqrt(lens.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (lens.length || 1));
		var win = 100, ttr = 0, cnt = 0; if (n >= win) { for (var i = 0; i + win <= n; i += 25) { var set = {}; for (var j = i; j < i + win; j++) set[words[j]] = 1; ttr += Object.keys(set).length / win; cnt++; } ttr /= cnt; } else if (n) { var s0 = {}; words.forEach(function (w) { s0[w] = 1; }); ttr = Object.keys(s0).length / n; }
		var hits = {}, wcount = 0; words.forEach(function (w) { var ww = w.replace(/[’]/g, "'"); if (WORDS.indexOf(ww) >= 0) { hits[ww] = (hits[ww] || 0) + 1; wcount++; } });
		var grams = []; GRAMS.forEach(function (re) { var m = t.match(re); if (m) grams.push({ text: m[0].toLowerCase(), n: m.length }); });
		var phrases = []; PHRASES.forEach(function (p) { var m = p[0].exec(t); if (m) phrases.push({ text: m[0], strength: p[1], label: p[2] }); });
		var tri = {}, rep = 0; for (var k = 0; k + 2 < n; k++) { var key = words[k] + ' ' + words[k + 1] + ' ' + words[k + 2]; tri[key] = (tri[key] || 0) + 1; if (tri[key] === 2) rep++; }
		var em = (t.match(/—/g) || []).length, curly = (t.match(/[“”‘’]/g) || []).length, bullets = (t.match(/^\s*([-*•]|\d+\.)\s+/gm) || []).length, heads = (t.match(/^\s*#{1,4}\s|\*\*[^*\n]{2,60}\*\*:?/gm) || []).length;
		var starts = {}; sents.forEach(function (s) { var f = (A.words(s)[0] || ''); starts[f] = (starts[f] || 0) + 1; }); var topStart = Object.keys(starts).sort(function (a, b) { return starts[b] - starts[a]; })[0] || '';
		return { chars: t.length, words: n, sentences: sents.length, lens: lens, mean: mean, sd: sd, cv: mean ? sd / mean : 0, ttr: ttr, aiWords: hits, aiWordCount: wcount, aiWordRate: n ? wcount / n * 1000 : 0, grams: grams, phrases: phrases, repeats: rep, emDash: em, emRate: n ? em / n * 1000 : 0, curly: curly, bullets: bullets, heads: heads, topStart: topStart, topStartShare: sents.length ? (starts[topStart] || 0) / sents.length : 0 };
	};
	A.textSignals = function (st) {
		var S = [];
		if (st.words < 40) { S.push(sig('info', 'medium', 'Too short to judge', 'Paste at least 150 words for the statistics to mean anything. Even then they are weak.', 'stats')); }
		st.phrases.forEach(function (p) { S.push(sig('ai', p.strength, 'Chatbot leftover: ' + p.label, 'Found: "' + p.text + '". Text pasted straight from a chatbot often keeps these.', 'wording')); });
		if (st.words >= 40) {
			if (st.sentences >= 8 && st.cv < 0.33) S.push(sig('ai', 'weak', 'Very even sentence lengths', 'Sentence length varies by only ' + Math.round(st.cv * 100) + '% (people usually vary more, often 50%+). AI text tends to be even; so is careful formal writing.', 'stats'));
			else if (st.sentences >= 8 && st.cv > 0.62) S.push(sig('real', 'weak', 'Uneven sentence lengths', 'Sentence length varies by ' + Math.round(st.cv * 100) + '%, which is typical of people writing quickly. Easy to fake.', 'stats'));
			var hitList = Object.keys(st.aiWords).sort(function (a, b) { return st.aiWords[b] - st.aiWords[a]; }), gramN = st.grams.reduce(function (a, g) { return a + g.n; }, 0), rate = (st.aiWordCount + gramN * 2) / st.words * 1000;
			if (rate >= 12 && st.aiWordCount + gramN >= 3) S.push(sig('ai', rate >= 22 ? 'medium' : 'weak', 'Lots of words chatbots overuse', hitList.slice(0, 10).map(function (w) { return w + (st.aiWords[w] > 1 ? ' ×' + st.aiWords[w] : ''); }).concat(st.grams.map(function (g) { return '"' + g.text + '"'; })).join(', ') + ' (' + rate.toFixed(1) + ' per 1,000 words). People use these words too.', 'wording'));
			else if (st.words >= 150 && st.aiWordCount + gramN === 0) S.push(sig('real', 'weak', 'None of the words chatbots overuse', 'No "delve", "tapestry", "it\'s important to note"... A good sign, but easy to avoid on purpose.', 'wording'));
			if (st.emRate >= 6 && st.emDash >= 3) S.push(sig('ai', 'weak', 'Many em dashes (—)', st.emDash + ' em dashes. Chatbots use them a lot, and so do many good writers.', 'style'));
			if (st.heads >= 2 && st.bullets >= 3) S.push(sig('info', 'weak', 'Headings and bullet lists', 'Chat answers are often formatted like this; so are notes and articles.', 'style'));
			if (st.ttr && st.words >= 200 && st.ttr < 0.55) S.push(sig('ai', 'weak', 'Small range of words', 'Only ' + Math.round(st.ttr * 100) + '% different words in each 100 (often 60-75% for people).', 'stats'));
		}
		return S;
	};
	/* Language-model numbers. lp = log-probability (natural log) of each actual next token, rank = its rank among all tokens (1 = most likely). */
	A.lmStats = function (lp, rank) {
		var n = lp.length; if (!n) return null; var mean = 0, i; for (i = 0; i < n; i++) mean += lp[i]; mean /= n;
		var sd = 0; for (i = 0; i < n; i++) sd += (lp[i] - mean) * (lp[i] - mean); sd = Math.sqrt(sd / n);
		var top1 = 0, top10 = 0; for (i = 0; i < n; i++) { if (rank[i] <= 1) top1++; if (rank[i] <= 10) top10++; }
		return { tokens: n, ppl: Math.exp(-mean), sd: sd, top1: top1 / n, top10: top10 / n };
	};
	A.lmSignal = function (m) {
		if (!m) return null; var d = 'Measured with distilGPT-2, a small 2019 model, on the first ' + m.tokens + ' tokens: perplexity ' + m.ppl.toFixed(1) + ', ' + Math.round(m.top10 * 100) + '% of words were in its top-10 guesses. Low "surprise" is typical of AI text, but also of simple, formal or very common text (and of text written in a style the model knows). Newer chatbots fool it easily.';
		if (m.tokens < 40) return sig('info', 'weak', 'Too few words for the language model', d, 'model');
		if (m.ppl < 22 && m.top10 > 0.68) return sig('ai', 'weak', 'Very predictable to a language model', d, 'model');
		if (m.ppl > 70 || m.top10 < 0.5) return sig('real', 'weak', 'Surprising to a language model', d, 'model');
		return sig('info', 'weak', 'In between for the language model', d, 'model');
	};
	/* The prompt the page copies for a paid opinion from MES AI. */
	A.aiPrompt = function (text, signals) {
		var ev = (signals || []).filter(function (s) { return s.src !== 'none'; }).map(function (s) { return '- ' + s.title + ' (' + s.dir + ', ' + s.strength + ')'; }).join('\n');
		return 'Please judge whether the text below was written by a person, by an AI chatbot, or by a person with AI help. Give your honest opinion with the specific reasons (wording, structure, facts, tone) and say how sure you can be. Don\'t give a percentage you can\'t justify.' + (ev ? '\n\nSignals an automatic check found (weak on their own):\n' + ev : '') + '\n\n--- TEXT ---\n' + String(text).slice(0, 12000);
	};

	/* ---- image views (pure array maths; the page draws them) ---- */
	/* error level: |original - re-saved JPEG| amplified. a, b = RGBA arrays of the same size. */
	A.elaMap = function (a, b, gain) { var out = new Uint8ClampedArray(a.length), g = gain || 15, mx = 0; for (var i = 0; i < a.length; i += 4) { for (var c = 0; c < 3; c++) { var d = Math.abs(a[i + c] - b[i + c]) * g; out[i + c] = d; if (d > mx) mx = d; } out[i + 3] = 255; } return { data: out, max: Math.min(255, mx) }; };
	/* noise residual: luminance minus a 3x3 mean, amplified around grey; also returns per-block noise level spread (how even the noise is). */
	A.noiseMap = function (d, w, h, gain) {
		var g = gain || 8, L = new Float32Array(w * h), out = new Uint8ClampedArray(w * h * 4), i, x, y;
		for (i = 0; i < w * h; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
		var B = 16, bw = Math.ceil(w / B), bh = Math.ceil(h / B), bs = new Float64Array(bw * bh), bn = new Float64Array(bw * bh);
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
			var s = 0, c = 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += L[yy * w + xx]; c++; } }
			var r = L[y * w + x] - s / c, v = 128 + r * g, o = (y * w + x) * 4; out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
			var bi = ((y / B) | 0) * bw + ((x / B) | 0); bs[bi] += r * r; bn[bi]++;
		}
		var lv = []; for (i = 0; i < bs.length; i++) if (bn[i] > 32) lv.push(Math.sqrt(bs[i] / bn[i]));
		lv.sort(function (p, q) { return p - q; }); var med = lv.length ? lv[lv.length >> 1] : 0, p10 = lv.length ? lv[Math.floor(lv.length * 0.1)] : 0, p90 = lv.length ? lv[Math.floor(lv.length * 0.9)] : 0;
		return { data: out, median: med, p10: p10, p90: p90 };
	};
	/* frame times for a video: n evenly spread, avoiding the very start / end */
	A.frameTimes = function (dur, n) { if (!(dur > 0)) return [0]; n = Math.max(1, Math.min(n || 6, 24)); var out = []; for (var i = 0; i < n; i++) out.push(Math.round(dur * (i + 0.5) / n * 100) / 100); return out; };

	/* ---- post links (2026-11-25): check a whole post (Hive / PeakD / InLeo / Ecency / 3Speak, a web article, a YouTube video) ---- */
	var HIVE_HOSTS = /^(?:www\.)?(peakd\.com|hive\.blog|ecency\.com|inleo\.io|leofinance\.io|3speak\.tv|hiveblog\.io|liketu\.com|waivio\.com|actifit\.io|stemsocial\.com|dbuzz\.com|travelfeed\.io|blog\.openhive\.network|hivel\.ink|splintertalk\.io|hive\.vote|worldmappin\.com)$/i;
	/* What a pasted link points to: {kind:'hive', author, permlink} | {kind:'youtube', id, url} | {kind:'web', url} | null. A comment link (#@user/permlink) means that comment. */
	A.parsePostLink = function (s) {
		s = String(s || '').trim(); if (!s) return null;
		if (/^@?[a-z0-9.-]{3,16}\/[a-z0-9-]{1,256}$/.test(s)) { var bp = s.replace(/^@/, '').split('/'); return { kind: 'hive', author: bp[0], permlink: bp[1] }; }
		if (!/^https?:\/\//i.test(s)) { if (/^[\w-]+(\.[\w-]+)+\//.test(s)) s = 'https://' + s; else return null; }
		var u; try { u = new URL(s); } catch (e) { return null; }
		var host = u.hostname.toLowerCase(), m;
		if (/(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(host)) { m = /[?&]v=([\w-]{11})/.exec(u.search) || /\/(?:shorts|embed|live)\/([\w-]{11})/.exec(u.pathname); if (m) return { kind: 'youtube', id: m[1], url: 'https://www.youtube.com/watch?v=' + m[1] }; }
		if (host === 'youtu.be') { m = /^\/([\w-]{11})/.exec(u.pathname); if (m) return { kind: 'youtube', id: m[1], url: 'https://www.youtube.com/watch?v=' + m[1] }; }
		if (HIVE_HOSTS.test(host)) {
			m = /^#@([a-z0-9.-]{3,16})\/([a-z0-9-]+)/.exec(u.hash); if (m) return { kind: 'hive', author: m[1], permlink: m[2] };
			if (/3speak\.tv$/.test(host)) { m = /[?&]v=([a-z0-9.-]{3,16})\/([a-z0-9-]+)/.exec(u.search); if (m) return { kind: 'hive', author: m[1], permlink: m[2], video: true }; }
			m = /\/@([a-z0-9.-]{3,16})\/([a-z0-9-]+)\/?$/.exec(u.pathname) || /\/threads\/view\/([a-z0-9.-]{3,16})\/([a-z0-9-]+)/.exec(u.pathname) || /\/(?:p|post)\/([a-z0-9.-]{3,16})\/([a-z0-9-]+)/.exec(u.pathname);
			if (m) return { kind: 'hive', author: m[1], permlink: m[2] };
		}
		return { kind: 'web', url: u.href };
	};
	A.isImageLink = function (s) { return /^https?:\/\/[^\s]+\.(jpe?g|png|webp|avif|gif|heic|bmp)(\?[^\s]*)?$/i.test(String(s || '').trim()) || /^https?:\/\/(images\.hive\.blog|images\.ecency\.com)\//i.test(String(s || '').trim()); };
	/* Markdown / HTML post body -> plain text for the text check (pictures, links, code and markup removed; link words kept). */
	A.mdToText = function (md) {
		var t = String(md || '');
		t = t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\[\/\/\]:\s*#\s*\([^\n]*\)\s*$/gm, ' ').replace(/^\s*Posted (?:Using|using|via|with) \S+\s*$/gm, ' ').replace(/```[\s\S]*?```/g, '\n').replace(/<(script|style|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
			.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|blockquote|center|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
			.replace(/https?:\/\/\S+/g, ' ').replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*>\s?/gm, '').replace(/^\s*[-*_]{3,}\s*$/gm, '').replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, '$1').replace(/`([^`]*)`/g, '$1')
			.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
		return t.split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
	};
	/* Picture links in a post: json_metadata.image first, then markdown / html / bare picture links in the body. Deduped, at most 40. */
	A.postImages = function (body, meta) {
		var out = [], seen = {};
		function add(u) { u = String(u || '').trim().replace(/[)\]>"']+$/, ''); if (!/^https?:\/\//i.test(u) || u.length > 2000) return; var k = A.imageKey(u); if (seen[k]) return; seen[k] = 1; out.push(u); }
		((meta && Array.isArray(meta.image)) ? meta.image : []).forEach(add);
		var b = String(body || ''), m, re = /!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)[^)]*\)|<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["']|(https?:\/\/\S+?\.(?:jpe?g|png|webp|gif|avif)(?:\?\S*)?)(?=[\s)\]<"']|$)/gi;
		while ((m = re.exec(b))) add(m[1] || m[2] || m[3]);
		return out.slice(0, 40);
	};
	/* The real picture behind Hive image proxies (images.hive.blog/0x0/<url>, /640x0/<url>), so the same picture is found once. */
	A.imageOrigin = function (u) { var m = /^https?:\/\/(?:images\.hive\.blog|images\.ecency\.com|steemitimages\.com)\/\d+x\d+\/(https?:\/\/.+)$/i.exec(u); return m ? m[1] : u; };
	A.imageKey = function (u) { return A.imageOrigin(u).replace(/^https?:\/\//i, '').toLowerCase(); };
	/* What a Hive picture link itself tells: who uploaded it (files.peakd.com keeps the account in the path) and the upload hash (same hash = the same file). */
	A.hiveImageInfo = function (u) {
		var o = A.imageOrigin(u), m, r = { url: o, host: '', uploader: '', hash: '' };
		try { r.host = new URL(o).hostname.toLowerCase(); } catch (e) { return r; }
		if ((m = /files\.peakd\.com\/file\/peakd-hive\/([a-z0-9.-]{3,16})\/([A-Za-z0-9]{20,})/.exec(o))) { r.uploader = m[1]; r.hash = m[2]; }
		else if ((m = /\/(DQm[1-9A-HJ-NP-Za-km-z]{40,50}|Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})/.exec(o))) r.hash = m[1];
		else if ((m = /images\.hive\.blog\/p\/([1-9A-HJ-NP-Za-km-z]{20,})/.exec(o))) r.hash = m[1];
		return r;
	};
	/* A Hive post (bridge.get_post / condenser get_content answer) -> what the page checks. */
	A.hivePost = function (p) {
		if (!p || !p.author) return null;
		var meta = p.json_metadata; if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } } meta = meta || {};
		var body = String(p.body || ''), video = null, v = meta.video, m;
		if (v && (v.info || v.content)) { var inf = v.info || {}; video = { kind: '3speak', author: inf.author || p.author, permlink: inf.permlink || p.permlink, thumb: inf.snaphash ? 'https://ipfs-3speak.b-cdn.net/ipfs/' + inf.snaphash : '' }; }
		if (!video && (m = /3speak\.tv\/(?:watch|embed)\?v=([a-z0-9.-]{3,16})\/([a-z0-9-]+)/i.exec(body))) video = { kind: '3speak', author: m[1], permlink: m[2] };
		if (!video && (m = /(?:youtube\.com\/(?:watch\?(?:[^\s)"']*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(body))) video = { kind: 'youtube', id: m[1], thumb: 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg' };
		var imgs = A.postImages(body, meta);
		return { kind: 'hive', author: p.author, permlink: p.permlink, title: p.title || (p.depth ? 'Comment by @' + p.author : ''), created: p.created || '', depth: p.depth || 0, app: String(meta.app || '').split('/')[0], tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 10) : [], text: A.mdToText(body), images: imgs, video: video, link: 'https://peakd.com/@' + p.author + '/' + p.permlink };
	};
	/* The sentences most worth searching for word for word: 9-40 words, few common words, no quotes / links / lists, spread through the text. */
	var COMMON = ' the a an and or but of to in on at for with is are was were be been it this that these those i you he she we they my your his her our their as by from not no so if then than there here have has had do does did will would can could should just very also more most some any all one about into out up what which who when where how why me him them us its im dont ';
	A.distinctiveSentences = function (text, n) {
		var sents = String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?]["”’)]?)\s+(?=[A-Z"“(])/), cand = [];
		sents.forEach(function (s, i) {
			s = s.trim(); var w = s.split(' '); if (w.length < 9 || w.length > 40 || /https?:|www\.|[•|]|^\d+[.)]/.test(s) || /^["“]/.test(s)) return;
			var rare = 0, longw = 0; w.forEach(function (x) { var k = x.toLowerCase().replace(/[^a-z']/g, ''); if (k && COMMON.indexOf(' ' + k + ' ') < 0) rare++; if (k.length >= 8) longw++; });
			cand.push({ s: s.replace(/[.!?]+$/, ''), i: i, r: rare / w.length, score: rare / w.length + longw * 0.03 + Math.min(w.length, 22) * 0.01 });
		});
		cand.sort(function (a, b) { return b.score - a.score; });
		var good = cand.filter(function (c) { return c.r >= 0.34; }); cand = good.length ? good : cand.slice(0, 1);
		var pick = [], N = n || 3, gap = Math.max(1, Math.floor(sents.length / (N * 2)));
		cand.forEach(function (c) { if (pick.length < N && pick.every(function (p) { return Math.abs(p.i - c.i) >= gap; })) pick.push(c); });
		return pick.sort(function (a, b) { return a.i - b.i; }).map(function (c) { var w = c.s.split(' '); return w.length > 24 ? w.slice(0, 24).join(' ') : c.s; });
	};
	/* Exact-phrase searches for one sentence: the whole web, then only Hive front ends. */
	A.phraseLinks = function (s) {
		var q = '"' + String(s).replace(/"/g, '') + '"', e = encodeURIComponent;
		return [
			{ name: 'Google', url: 'https://www.google.com/search?q=' + e(q) },
			{ name: 'Bing', url: 'https://www.bing.com/search?q=' + e(q) },
			{ name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' + e(q) },
			{ name: 'Hive sites', url: 'https://www.google.com/search?q=' + e(q + ' (site:peakd.com OR site:hive.blog OR site:ecency.com OR site:inleo.io)') }
		];
	};
	/* Searches for the same Hive upload (by its hash) in other posts. */
	A.hashLinks = function (h) { var e = encodeURIComponent; return h ? [{ name: 'Same upload on the web', url: 'https://www.google.com/search?q=' + e('"' + h + '"') }] : []; };
	/* Copy clues from what the post itself shows (dir: look = a reason to check, ok = a small good sign, info). Honest: a picture uploaded by another account is a reason to look, not proof (people re-share with permission). */
	A.copySignals = function (post) {
		var S = []; if (!post) return S;
		var others = {}, own = 0, n = (post.images || []).length;
		(post.images || []).forEach(function (u) { var i = A.hiveImageInfo(u); if (i.uploader) { if (i.uploader === post.author) own++; else others[i.uploader] = (others[i.uploader] || 0) + 1; } });
		var ol = Object.keys(others);
		if (ol.length) S.push(sig('look', 'medium', 'Picture uploaded by another account', ol.map(function (a) { return '@' + a + (others[a] > 1 ? ' (' + others[a] + ')' : ''); }).join(', ') + ': PeakD keeps the uploader\'s name in the picture link. It may be a friend\'s or shared picture; check whether credit is given.', 'copy'));
		if (own) S.push(sig('ok', 'weak', own + ' picture' + (own > 1 ? 's' : '') + ' uploaded by @' + post.author, 'The uploader in the link is the author. That only shows who uploaded the file, not who made it.', 'copy'));
		if (n && !own && !ol.length) S.push(sig('info', 'weak', 'Uploader not shown in the picture links', 'Most picture hosts (images.hive.blog, Ecency, InLeo, other sites) don\'t record who uploaded a file. Use the reverse image searches.', 'copy'));
		var credit = /\b(source|credits?|courtesy|image by|images by|photo by|photos by|picture by|pixabay|unsplash|pexels|wikimedia|made with ai|generated (?:with|by|using)|ai[- ]generated|midjourney|dall-?e|stable diffusion)\b/i.exec(post.text || '');
		if (n && credit) S.push(sig('info', 'weak', 'The post mentions a source: "' + credit[0] + '"', 'Credit lines are a good sign; open the source to check it really is where the picture came from.', 'copy'));
		else if (n >= 1) S.push(sig('info', 'weak', 'No picture credit found in the text', 'Not proof of anything: many people post their own photos without saying so.', 'copy'));
		return S;
	};
	return A;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MESAID;

/* MES AI Detector UI (mes.fm/ai-detector). Logic = MESAID (lib.js) + MESExif (exif-viewer lib, via lib_from). Nothing is uploaded; the optional models
   (onnx-community/ai-image-detect-distilled-ONNX, MIT; Xenova/distilgpt2, Apache 2.0) run in the browser through transformers.js 3.7.6. Debug: window.MESAIDDebug. */
(function () {
	'use strict';
	var A = MESAID, $ = function (id) { return document.getElementById(id); }, root = $('aid');
	if (!root) return;
	var LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js', T = null, cls = null, lm = null, tok = null;
	var IMG_MODEL = 'onnx-community/ai-image-detect-distilled-ONNX', IMG_REV = '7f067e23521eeb6d6525221af82c613fb746aaff', LM_MODEL = 'Xenova/distilgpt2';
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('aid-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2600); }
	function bytes(n) { return n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
	function loadLib() { return T ? Promise.resolve(T) : new Function('u', 'return import(u)')(LIB).then(function (m) { T = m; m.env.allowLocalModels = false; return m; }); }
	function progress(box, label) {
		var el = $(box); el.hidden = false; var bar = el.querySelector('i'), txt = el.querySelector('span'), files = {};
		function set(f, t) { bar.style.width = Math.round(f * 100) + '%'; txt.textContent = t; }
		set(0, label);
		return { cb: function (p) { if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; var l = 0, t = 0; for (var k in files) { l += files[k][0]; t += files[k][1]; } set(l / t, 'Downloading ' + bytes(l) + ' of ' + bytes(t) + '…'); } }, set: set, done: function () { el.hidden = true; } };
	}

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll('.aid-tabs [role=tab]');
	function showTab(id, push) {
		tabs.forEach(function (b) { var on = b.dataset.tab === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; $('aid-p-' + b.dataset.tab).hidden = !on; });
		if (push) try { var u = new URL(location.href); u.searchParams.set('tab', id); history.replaceState(null, '', u); } catch (e) {}
	}
	tabs.forEach(function (b, i) {
		b.onclick = function () { showTab(b.dataset.tab, true); };
		b.onkeydown = function (e) { var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); var nb = tabs[(i + d + tabs.length) % tabs.length]; nb.focus(); nb.click(); };
	});
	var qt = /[?&]tab=(img|vid|text)\b/.exec(location.search); if (qt) showTab(qt[1]);
	function curTab() { var t = 'img'; tabs.forEach(function (b) { if (b.getAttribute('aria-selected') === 'true') t = b.dataset.tab; }); return t; }

	/* ---------- shared rendering ---------- */
	var LV = { ai: ['&#9888;&#65039;', 'Strong AI evidence'], real: ['&#128247;&#65038;', 'Strong camera evidence'], mixed: ['&#9878;&#65038;', 'Evidence both ways'], 'lean-ai': ['&#8599;&#65038;', 'Leans AI (weak)'], 'lean-real': ['&#8600;&#65038;', 'Leans real (weak)'], none: ['&#10067;&#65038;', 'No evidence either way'], unclear: ['&#10067;&#65038;', 'Unclear'] };
	function renderSum(id, S) { var s = A.summary(S), l = LV[s.level]; $(id).className = 'aid-sum aid-sum--' + s.level; $(id).innerHTML = '<span class="aid-sum__ic">' + l[0] + '</span><div><b>' + l[1] + '</b><span>' + esc(s.text) + ' Not a verdict: read the clues below.</span></div>'; }
	var DIR = { ai: ['Points to AI', '&#9650;'], real: ['Points to real', '&#9660;'], info: ['Neutral', '&#9679;'] };
	function renderSigs(id, S) {
		var order = { strong: 0, medium: 1, weak: 2 }, dirO = { ai: 0, real: 1, info: 2 };
		S = S.slice().sort(function (a, b) { return order[a.strength] - order[b.strength] || dirO[a.dir] - dirO[b.dir]; });
		$(id).innerHTML = S.map(function (s) { return '<div class="aid-sig aid-sig--' + s.dir + '"><div class="aid-sig__top"><span class="aid-sig__dir">' + DIR[s.dir][1] + ' ' + DIR[s.dir][0] + '</span><span class="aid-str aid-str--' + s.strength + '">' + s.strength + '</span>' + (s.src && s.src !== 'none' ? '<span class="aid-src">' + esc(s.src) + '</span>' : '') + '</div><div class="aid-sig__t">' + esc(s.title) + '</div>' + (s.detail ? '<div class="aid-sig__d">' + esc(s.detail) + '</div>' : '') + '</div>'; }).join('');
	}
	function dropzone(dropId, inputId, onFile, accept) {
		var drop = $(dropId), inp = $(inputId);
		drop.onclick = function () { inp.click(); }; drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
		inp.onchange = function () { if (inp.files[0]) onFile(inp.files[0]); inp.value = ''; };
		drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
		drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
		drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); var f = e.dataTransfer.files[0]; if (f) onFile(f); });
	}
	document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
	document.addEventListener('drop', function (e) {
		if (e.defaultPrevented || !e.dataTransfer || !e.dataTransfer.files[0]) return; e.preventDefault(); routeFile(e.dataTransfer.files[0]);
	});
	document.addEventListener('paste', function (e) {
		if (/^(TEXTAREA|INPUT)$/.test((document.activeElement || {}).tagName || '')) return;
		var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) { e.preventDefault(); routeFile(f); return; }
		var t = e.clipboardData && e.clipboardData.getData('text'); if (t && /^https?:\/\/\S+$/.test(t.trim())) { e.preventDefault(); if (A.isImageLink(t.trim())) { showTab('img', true); loadImageUrl(t.trim()); } else { $('aid-purl').value = t.trim(); loadPost(t.trim()); } return; }
		if (t && t.length > 40 && !/^https?:\/\//.test(t.trim())) { e.preventDefault(); showTab('text', true); $('aid-text').value = t; checkText(); }
	});
	function routeFile(f) {
		if (/^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) { showTab('vid', true); loadVideo(f); }
		else if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|heic|tiff?)$/i.test(f.name)) { showTab('img', true); loadImage(f, f.name); }
		else if (/^text\//.test(f.type) || /\.(txt|md|html?|csv|srt)$/i.test(f.name)) { showTab('text', true); f.text().then(function (t) { $('aid-text').value = t; checkText(); }); }
		else toast('That kind of file can\'t be checked here');
	}

	/* ---------- PICTURE ---------- */
	var img = { file: null, bmp: null, u8: null, S: [], view: 'orig', ela: null, noise: null, cls: null };
	dropzone('aid-idrop', 'aid-ifile', function (f) { loadImage(f, f.name); });
	$('aid-iurlf').onsubmit = function (e) {
		e.preventDefault(); var u = $('aid-iurl').value.trim();
		var pl = A.parsePostLink(u); if (pl && !A.isImageLink(u) && (pl.kind !== 'web' || !/\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(u))) { $('aid-purl').value = u; loadPost(u); return; }
		if (!/^https?:\/\//i.test(u)) return toast('Paste a link that starts with https://');
		loadImageUrl(u);
	};
	function loadImageUrl(u) {
		toast('Downloading the picture…');
		return fetch(u, { mode: 'cors', referrerPolicy: 'no-referrer' }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).catch(function () { return fetch('/api/image-fetch?url=' + encodeURIComponent(u)).then(function (r) { if (!r.ok) throw new Error('Could not download that picture (' + r.status + ')'); return r.blob(); }); })
			.then(function (b) { loadImage(b, decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || 'picture')); }).catch(function (er) { toast(er && er.message ? er.message : 'Could not download that picture'); });
	}
	function loadImage(file, name) {
		img = { file: file, name: name || 'picture', bmp: null, u8: null, S: [], view: 'orig', ela: null, noise: null, cls: null };
		file.arrayBuffer().then(function (buf) {
			img.u8 = new Uint8Array(buf);
			return createImageBitmap(file).catch(function () { return null; });
		}).then(function (bmp) {
			img.bmp = bmp; var ex = null; try { ex = typeof MESExif !== 'undefined' ? MESExif.parse(img.u8) : null; } catch (e) {}
			var r = A.scanImage(img.u8, { exif: ex, w: bmp ? bmp.width : 0, h: bmp ? bmp.height : 0 }); img.r = r; img.S = r.signals;
			$('aid-iout').hidden = false; $('aid-ifinfo').textContent = img.name + ' · ' + r.info.format + ' · ' + bytes(img.u8.length) + (bmp ? ' · ' + bmp.width + ' × ' + bmp.height + ' px' : ' · this browser can\'t show it');
			renderImg(); setView('orig'); renderPrompt(r.info);
			$('aid-imodel').disabled = !bmp; $('aid-imodel').textContent = 'Run the AI-picture model';
			if (cls && bmp) runImgModel();
		}).catch(function () { toast('Could not read that file'); });
	}
	function renderImg() { var S = img.S.slice(); if (img.cls) S.push(img.cls); renderSum('aid-isum', S); renderSigs('aid-isigs', S); }
	function renderPrompt(info) {
		var el = $('aid-iprompt'); if (!info.prompt && !info.settings) { el.hidden = true; return; }
		var st = info.settings ? Object.keys(info.settings).map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + esc(info.settings[k]) + '</td></tr>'; }).join('') : '';
		el.hidden = false; el.innerHTML = '<h3 class="aid-h">The prompt saved in the file</h3>' + (info.prompt ? '<blockquote class="aid-q">' + esc(info.prompt) + '</blockquote>' : '') + (st ? '<div class="tu-table-wrap"><table class="tu-table aid-kv"><tbody>' + st + '</tbody></table></div>' : '');
	}
	var NOTES = { orig: '', ela: 'Error level: the picture saved again as a JPEG and compared with itself. Areas that were pasted in or saved fewer times can look brighter or flatter than the rest. Edges and fine detail are always brighter. A visual aid only.', noise: 'Noise: what is left after smoothing. Real camera photos have fine grain everywhere; generated or retouched areas are often too smooth or have a repeating texture. A visual aid only.' };
	function maxCanvas(w, h, m) { var k = Math.min(1, m / Math.max(w, h)); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; }
	function setView(v) {
		if (!img.bmp) return; img.view = v;
		$('aid-iview').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); });
		$('aid-ivnote').textContent = NOTES[v];
		var cv = $('aid-icv'), sz = maxCanvas(img.bmp.width, img.bmp.height, 1600), x;
		cv.width = sz[0]; cv.height = sz[1]; x = cv.getContext('2d'); x.drawImage(img.bmp, 0, 0, sz[0], sz[1]);
		if (v === 'orig') return;
		var d = x.getImageData(0, 0, sz[0], sz[1]);
		if (v === 'noise') { var nm = img.noise || (img.noise = A.noiseMap(d.data, sz[0], sz[1], 8)); x.putImageData(new ImageData(nm.data, sz[0], sz[1]), 0, 0); $('aid-ivnote').textContent = NOTES.noise + ' Noise level across the picture: ' + nm.p10.toFixed(1) + ' (calm 10%) to ' + nm.p90.toFixed(1) + ' (busy 10%).'; return; }
		if (img.ela) { x.putImageData(new ImageData(img.ela, sz[0], sz[1]), 0, 0); return; }
		cv.toBlob(function (b) {
			createImageBitmap(b).then(function (bm) {
				var c2 = document.createElement('canvas'); c2.width = sz[0]; c2.height = sz[1]; var y = c2.getContext('2d'); y.drawImage(bm, 0, 0);
				var e = A.elaMap(d.data, y.getImageData(0, 0, sz[0], sz[1]).data, 15); img.ela = e.data; if (img.view === 'ela') x.putImageData(new ImageData(e.data, sz[0], sz[1]), 0, 0);
			});
		}, 'image/jpeg', 0.9);
	}
	$('aid-iview').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setView(b.dataset.v); });
	/* fill window */
	function fill(on) { var st = $('aid-istage'); st.classList.toggle('is-fill', on); document.body.classList.toggle('aid-filling', on); $('aid-iclose').hidden = !on; $('aid-ifill').setAttribute('aria-pressed', on ? 'true' : 'false'); }
	$('aid-ifill').onclick = function () { fill(!$('aid-istage').classList.contains('is-fill')); };
	$('aid-iclose').onclick = function () { fill(false); };
	document.addEventListener('keydown', function (e) {
		if (/^(TEXTAREA|INPUT|SELECT)$/.test((e.target || {}).tagName || '')) return;
		if (e.key === 'Escape' && $('aid-istage').classList.contains('is-fill')) fill(false);
		else if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && curTab() === 'img' && img.bmp) fill(!$('aid-istage').classList.contains('is-fill'));
	});

	/* image model */
	function getCls(p) {
		if (cls) return Promise.resolve(cls);
		return loadLib().then(function (m) { return m.pipeline('image-classification', IMG_MODEL, { dtype: 'q8', revision: IMG_REV, progress_callback: p.cb }); }).then(function (c) { cls = c; return c; });
	}
	function canvasUrl(src, w, h) { return new Promise(function (res) { var c = document.createElement('canvas'), sz = maxCanvas(w, h, 512); c.width = sz[0]; c.height = sz[1]; c.getContext('2d').drawImage(src, 0, 0, sz[0], sz[1]); c.toBlob(function (b) { res(URL.createObjectURL(b)); }, 'image/png'); }); }
	function classify(src, w, h) { return canvasUrl(src, w, h).then(function (u) { return cls(u, { top_k: 2 }).then(function (o) { URL.revokeObjectURL(u); return A.clsProb(o); }); }); }
	function runImgModel() {
		if (!img.bmp) return; var p = progress('aid-iprog', 'Loading the model…'), b = $('aid-imodel'); b.disabled = true;
		getCls(p).then(function () { p.set(1, 'Looking at the picture…'); return classify(img.bmp, img.bmp.width, img.bmp.height); }).then(function (prob) {
			p.done(); img.cls = A.clsSignal(prob); renderImg(); b.disabled = false; b.textContent = 'Run it again';
		}).catch(function (e) { p.done(); b.disabled = false; toast('The model could not run here: ' + (e && e.message || e)); });
	}
	$('aid-imodel').onclick = runImgModel;

	/* ---------- VIDEO ---------- */
	var vid = { file: null, S: [], frames: [], cls: null, url: null };
	dropzone('aid-vdrop', 'aid-vfile', loadVideo);
	function readSlice(f, a, b) { return f.slice(a, b).arrayBuffer().then(function (x) { return new Uint8Array(x); }); }
	/* MP4 / MOV: walk the top-level boxes with small reads, keep everything but the media data (so a 4 GB file costs a few MB). */
	function containerBytes(f) {
		var head = readSlice(f, 0, 12);
		return head.then(function (h) {
			if (A.latin1(h, 4, 8) !== 'ftyp') return f.size <= 48 << 20 ? readSlice(f, 0, f.size) : Promise.all([readSlice(f, 0, 16 << 20), readSlice(f, f.size - (8 << 20), f.size)]).then(function (p) { var o = new Uint8Array(p[0].length + p[1].length); o.set(p[0]); o.set(p[1], p[0].length); return o; });
			var parts = [], pos = 0, n = 0;
			function step() {
				if (pos + 8 > f.size || n++ > 500) return finish();
				return readSlice(f, pos, pos + 16).then(function (b) {
					var size = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0, ty = A.latin1(b, 4, 8);
					if (size === 1) size = (((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]) >>> 0) * 4294967296 + (((b[12] << 24) | (b[13] << 16) | (b[14] << 8) | b[15]) >>> 0);
					if (size === 0) size = f.size - pos; if (size < 8) return finish();
					var keep = ty !== 'mdat' && ty !== 'free' && ty !== 'skip' && size <= 96 << 20, at = pos; pos += size;
					return (keep ? readSlice(f, at, at + size).then(function (x) { parts.push(x); }) : Promise.resolve()).then(step);
				});
			}
			function finish() { var len = parts.reduce(function (a, p) { return a + p.length; }, 0), o = new Uint8Array(len), k = 0; parts.forEach(function (p) { o.set(p, k); k += p.length; }); return o; }
			return step();
		});
	}
	function loadVideo(f) {
		if (vid.url) URL.revokeObjectURL(vid.url);
		vid = { file: f, S: [], frames: [], cls: null, url: URL.createObjectURL(f) };
		$('aid-vout').hidden = false; $('aid-vfinfo').textContent = f.name + ' · ' + bytes(f.size); $('aid-frames').innerHTML = '<span class="tu-note">Reading frames…</span>'; $('aid-fstage').hidden = true;
		$('aid-vmodel').textContent = 'Run the AI-picture model on the frames'; $('aid-vmodel').disabled = true;
		containerBytes(f).then(function (u8) {
			var r = A.scanVideo(u8, { size: f.size }); vid.r = r; vid.S = r.signals; renderVid();
			var i = r.info, rows = [['Format', i.format + (i.brand ? ' (' + i.brand + ')' : '')], ['Size', bytes(f.size)], ['Created', i.created], ['Encoder', i.encoder], ['Software', i.software], ['Make', i.make], ['Model', i.model], ['Location', i.location], ['Content Credentials', i.c2pa ? 'Yes' : 'None found']];
			$('aid-vkv').querySelector('tbody').innerHTML = rows.filter(function (x) { return x[1]; }).map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('');
		}).catch(function () { toast('Could not read the video file'); });
		var v = $('aid-vid'); v.src = vid.url;
		v.onloadedmetadata = function () { $('aid-vfinfo').textContent = f.name + ' · ' + bytes(f.size) + ' · ' + v.videoWidth + ' × ' + v.videoHeight + ' · ' + fmtTime(v.duration); grabFrames(v); };
		v.onerror = function () { $('aid-frames').innerHTML = '<span class="tu-note">This browser can\'t play this video, so no frames. The metadata check above still works.</span>'; };
	}
	function fmtTime(s, fine) { if (!isFinite(s)) return '?'; if (fine && s < 60) return s.toFixed(1) + ' s'; s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
	function grabFrames(v) {
		var times = A.frameTimes(v.duration, 8), out = [], token = vid;
		var w = v.videoWidth, h = v.videoHeight; if (!w) return;
		function next(i) {
			if (token !== vid) return;
			if (i >= times.length) { vid.frames = out; drawFrames(); v.currentTime = 0; $('aid-vmodel').disabled = !out.length; return; }
			var done = false, onS = function () { if (done) return; done = true; v.removeEventListener('seeked', onS); var c = document.createElement('canvas'), sz = maxCanvas(w, h, 960); c.width = sz[0]; c.height = sz[1]; c.getContext('2d').drawImage(v, 0, 0, sz[0], sz[1]); out.push({ t: times[i], c: c, p: null }); next(i + 1); };
			v.addEventListener('seeked', onS); setTimeout(onS, 4000); v.currentTime = times[i];
		}
		next(0);
	}
	function drawFrames() {
		$('aid-frames').innerHTML = vid.frames.map(function (fr, i) { return '<button type="button" class="aid-frame" data-i="' + i + '"><img src="' + fr.c.toDataURL('image/jpeg', 0.7) + '" alt="Frame at ' + fmtTime(fr.t) + '"><span>' + fmtTime(fr.t) + (fr.p != null ? ' · ' + Math.round(fr.p * 100) + '% AI' : '') + '</span></button>'; }).join('');
	}
	$('aid-frames').addEventListener('click', function (e) {
		var b = e.target.closest('.aid-frame'); if (!b) return; var fr = vid.frames[+b.dataset.i]; $('aid-fstage').hidden = false;
		var cv = $('aid-fcv'), x; cv.width = fr.c.width; cv.height = fr.c.height; x = cv.getContext('2d'); var d = fr.c.getContext('2d').getImageData(0, 0, cv.width, cv.height), nm = A.noiseMap(d.data, cv.width, cv.height, 8); x.putImageData(new ImageData(nm.data, cv.width, cv.height), 0, 0);
		root.querySelectorAll('.aid-frame').forEach(function (q) { q.classList.toggle('is-on', q === b); });
	});
	function renderVid() { var S = vid.S.slice(); if (vid.cls) S.push(vid.cls); renderSum('aid-vsum', S); renderSigs('aid-vsigs', S); }
	$('aid-vmodel').onclick = function () {
		if (!vid.frames.length) return; var p = progress('aid-vprog', 'Loading the model…'), b = $('aid-vmodel'); b.disabled = true;
		getCls(p).then(function () {
			var i = 0, sum = 0;
			function one() { if (i >= vid.frames.length) return; p.set(i / vid.frames.length, 'Frame ' + (i + 1) + ' of ' + vid.frames.length + '…'); var fr = vid.frames[i]; return classify(fr.c, fr.c.width, fr.c.height).then(function (pr) { fr.p = pr; sum += pr || 0; i++; return one(); }); }
			return one().then(function () { return sum / vid.frames.length; });
		}).then(function (avg) { p.done(); vid.cls = A.clsSignal(avg, vid.frames.length); drawFrames(); renderVid(); b.disabled = false; b.textContent = 'Run it again'; })
			.catch(function (e) { p.done(); b.disabled = false; toast('The model could not run here: ' + (e && e.message || e)); });
	};

	/* ---------- TEXT ---------- */
	var txt = { st: null, S: [], lmSig: null, toks: null, view: 'words' };
	var ta = $('aid-text');
	function count() { var w = A.words(ta.value).length; $('aid-tcount').textContent = w ? w.toLocaleString() + ' words' : ''; }
	ta.addEventListener('input', count);
	try { var dr = localStorage.getItem('mes-ai-detector:draft'); if (dr && !ta.value) ta.value = dr; } catch (e) {}
	ta.addEventListener('input', function () { try { if (ta.value.length < 60000) localStorage.setItem('mes-ai-detector:draft', ta.value); } catch (e) {} });
	count();
	$('aid-tgo').onclick = checkText;
	$('aid-tclear').onclick = function () { ta.value = ''; count(); $('aid-tout').hidden = true; try { localStorage.removeItem('mes-ai-detector:draft'); } catch (e) {} ta.focus(); };
	$('aid-topen').onclick = function () { $('aid-tfile').click(); };
	$('aid-tfile').onchange = function () { var f = this.files[0]; if (f) f.text().then(function (t) { if (/\.html?$/i.test(f.name)) { var d = new DOMParser().parseFromString(t, 'text/html'); t = d.body ? d.body.innerText || d.body.textContent : t; } ta.value = t; count(); checkText(); }); this.value = ''; };
	ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); checkText(); } });
	function checkText() {
		var t = ta.value; if (!t.trim()) { toast('Paste some text first'); return; }
		if (/^\S+$/.test(t.trim()) && /^(https?:\/\/|@?[a-z0-9.-]+\/[a-z0-9-]+$)/i.test(t.trim()) && A.parsePostLink(t.trim()) && !postBusy) { $('aid-purl').value = t.trim(); loadPost(t.trim(), 'text'); return; }
		txt = { st: A.textStats(t), S: [], lmSig: null, toks: null, view: 'words', text: t }; txt.S = A.textSignals(txt.st);
		$('aid-tout').hidden = false; renderText(); setTView('words');
		var lb = $('aid-tview').querySelector('[data-v=lm]'); lb.disabled = true; $('aid-tlm').disabled = false; $('aid-tlm').textContent = 'Measure with a language model';
		if (lm) runLM();
	}
	function renderText() {
		var st = txt.st, S = txt.S.slice(); if (txt.lmSig) S.push(txt.lmSig);
		renderSum('aid-tsum', S); renderSigs('aid-tsigs', S);
		var card = function (k, v, sub) { return '<div class="tu-stat"><div class="tu-stat__label">' + k + '</div><div class="tu-stat__value">' + v + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>'; };
		var c = card('Words', st.words.toLocaleString(), st.sentences + ' sentences') + card('Average sentence', st.mean.toFixed(1), 'words') + card('Length variety', Math.round(st.cv * 100) + '%', 'people: often 50%+') + card('Word variety', st.ttr ? Math.round(st.ttr * 100) + '%' : '—', 'different words per 100') + card('Chatbot words', st.aiWordRate.toFixed(1), 'per 1,000 words');
		if (txt.lmStats) c += card('Perplexity', txt.lmStats.ppl.toFixed(1), 'lower = more predictable');
		$('aid-tstats').innerHTML = c;
		var mx = Math.max.apply(null, st.lens.concat([1])), lens = st.lens.slice(0, 300);
		$('aid-tbars').innerHTML = lens.map(function (l, i) { return '<i style="height:' + Math.max(4, Math.round(l / mx * 100)) + '%" title="Sentence ' + (i + 1) + ': ' + l + ' words"></i>'; }).join('') || '<span class="tu-note">No sentences found.</span>';
	}
	function setTView(v) {
		txt.view = v; $('aid-tview').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); });
		var t = txt.text.length > 20000 ? txt.text.slice(0, 20000) : txt.text, html;
		if (v === 'lm' && txt.toks) {
			html = txt.toks.map(function (k) { var cl = !k.r ? '' : k.r <= 10 ? 'k10' : k.r <= 100 ? 'k100' : k.r <= 1000 ? 'k1000' : 'kmore'; return (cl ? '<span class="' + cl + '" title="Guess #' + k.r + '">' : '<span>') + esc(k.s) + '</span>'; }).join('') + (txt.toks.cut ? '<span class="aid-cut"> … (only the first ' + txt.toks.length + ' tokens were measured)</span>' : '');
			$('aid-tlegend').innerHTML = '<span class="k10">top 10 guess</span><span class="k100">top 100</span><span class="k1000">top 1,000</span><span class="kmore">rarer</span> <span class="tu-note">Mostly green = very predictable text (typical of AI, and of simple writing).</span>';
		} else {
			var words = A.WORDS.slice().sort(function (a, b) { return b.length - a.length; }).map(function (w) { return w.replace(/[-]/g, '\\-'); });
			var re = new RegExp("\\b(" + words.join('|') + ")\\b|((?:it(?:'|’)s|it is) (?:important|worth|crucial) (?:to note|noting|to remember)|in today(?:'|’)s (?:fast-paced|digital|ever-changing)|plays? a (?:crucial|pivotal|vital|key) role|in conclusion|a testament to|navigat(?:e|ing) the (?:complexities|challenges)|as an ai(?: language model)?|(?:certainly|sure)! here(?:'s|’s| is| are)|\\u2014)", 'gi');
			html = esc(t).replace(/&#39;|&amp;#39;/g, "'").replace(re, function (m) { return '<mark>' + m + '</mark>'; }) + (t.length < txt.text.length ? '<span class="aid-cut"> … (first 20,000 characters shown)</span>' : '');
			$('aid-tlegend').innerHTML = '<mark>highlighted</mark> <span class="tu-note">words and phrases chatbots overuse (people use them too).</span>';
		}
		$('aid-trender').innerHTML = html.replace(/\n/g, '<br>');
	}
	$('aid-tview').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) setTView(b.dataset.v); });
	function getLM(p) {
		if (lm) return Promise.resolve();
		return loadLib().then(function (m) { return Promise.all([m.AutoTokenizer.from_pretrained(LM_MODEL, { progress_callback: p.cb }), m.AutoModelForCausalLM.from_pretrained(LM_MODEL, { dtype: 'q8', model_file_name: 'decoder_model_merged', progress_callback: p.cb })]); }).then(function (r) { tok = r[0]; lm = r[1]; });
	}
	function runLM() {
		var p = progress('aid-tprog', 'Loading the language model…'), b = $('aid-tlm'); b.disabled = true;
		getLM(p).then(function () {
			p.set(1, 'Reading the text…');
			var enc = tok(txt.text, { truncation: true, max_length: 400 }), ids = Array.from(enc.input_ids.data, Number), cut = A.words(txt.text).length * 1.25 > ids.length + 5;
			return lm({ input_ids: enc.input_ids, attention_mask: enc.attention_mask }).then(function (out) {
				var L = out.logits, V = L.dims[2], data = L.data, lp = [], rank = [], toks = [{ s: tok.decode([ids[0]]), r: 0 }];
				for (var i = 0; i + 1 < ids.length; i++) {
					var off = i * V, mx = -Infinity, j; for (j = 0; j < V; j++) if (data[off + j] > mx) mx = data[off + j];
					var se = 0; for (j = 0; j < V; j++) se += Math.exp(data[off + j] - mx);
					var tv = data[off + ids[i + 1]], r = 1; for (j = 0; j < V; j++) if (data[off + j] > tv) r++;
					lp.push(tv - mx - Math.log(se)); rank.push(r); toks.push({ s: tok.decode([ids[i + 1]]), r: r });
				}
				toks.cut = cut; return { m: A.lmStats(lp, rank), toks: toks };
			});
		}).then(function (res) {
			p.done(); txt.lmStats = res.m; txt.lmSig = A.lmSignal(res.m); txt.toks = res.toks; renderText();
			var lb = $('aid-tview').querySelector('[data-v=lm]'); lb.disabled = false; setTView('lm'); b.disabled = false; b.textContent = 'Measure again';
		}).catch(function (e) { p.done(); b.disabled = false; toast('The language model could not run here: ' + (e && e.message || e)); });
	}
	$('aid-tlm').onclick = function () { if (!txt.text) return; runLM(); };
	$('aid-task').onclick = function () {
		var q = A.aiPrompt(txt.text || ta.value, txt.S.concat(txt.lmSig ? [txt.lmSig] : []));
		var go = function () { window.open('/ai?tab=chat', '_blank', 'noopener'); };
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(q).then(function () { toast('Copied: paste it into MES AI'); go(); }, function () { toast('Copy failed'); go(); });
		else { toast('Copy needs a secure page'); go(); }
	};

	/* ---------- POST LINK (2026-11-25): text + pictures + video of a Hive post, a web article or a YouTube video ---------- */
	var NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network', 'https://hive-api.arcange.eu'];
	var post = null, postBusy = false, IS = typeof MESImgSearch !== 'undefined' ? MESImgSearch : null;
	function hiveCall(method, params) {
		var i = 0;
		function next() {
			if (i >= NODES.length) return Promise.reject(new Error('The Hive nodes did not answer. Try again in a moment.'));
			var node = NODES[i++], ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 8000);
			return fetch(node, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: method, params: params, id: 1 }), signal: ctl && ctl.signal })
				.then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); if (j.error) { if (/does not exist|Invalid parameters/i.test(j.error.message || '')) throw Object.assign(new Error('That post was not found on Hive.'), { stop: 1 }); throw new Error(j.error.message); } return j.result; })
				.catch(function (e) { clearTimeout(t); if (e.stop) throw e; return next(); });
		}
		return next();
	}
	function thumbOf(u) { var o = A.imageOrigin(u); return /^https?:\/\/(images\.hive\.blog|images\.ecency\.com)\//i.test(o) || /\.(gif)(\?|$)/i.test(o) ? o : 'https://images.hive.blog/320x0/' + o; }
	function picLinks(u) {
		var o = A.imageOrigin(u), info = A.hiveImageInfo(u), out = [];
		if (IS) ['lens', 'tineye', 'yandex', 'bing'].forEach(function (id) { var e = IS.byId(id); if (e) out.push({ name: e.name, url: IS.build(e, o) }); });
		A.hashLinks(info.hash).forEach(function (x) { out.push(x); });
		out.push({ name: 'All engines', url: '/reverse-image-search?q=' + encodeURIComponent(o) });
		return { links: out, info: info };
	}
	function tile(u, label) {
		var p = picLinks(u), up = p.info.uploader ? '<span class="aid-ptag' + (post && post.author && p.info.uploader !== post.author ? ' is-other' : '') + '">uploaded by @' + esc(p.info.uploader) + '</span>' : '';
		return '<div class="aid-ptile"><button type="button" class="aid-pthumb" data-check="' + esc(A.imageOrigin(u)) + '" title="Check this picture for AI"><img src="' + esc(thumbOf(u)) + '" alt="' + esc(label || 'Picture') + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'"></button>' +
			'<div class="aid-pbody">' + (label ? '<b>' + esc(label) + '</b>' : '') + up + '<button type="button" class="tu-btn tu-btn--ghost aid-sm" data-check="' + esc(A.imageOrigin(u)) + '">Check for AI</button>' +
			'<details class="aid-pfind"><summary>Find copies</summary>' + p.links.map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>'; }).join('') + '</details></div></div>';
	}
	var CDIR = { look: ['Worth checking', '&#9888;&#65038;'], ok: ['Small good sign', '&#10003;&#65038;'], info: ['Note', '&#9679;'] };
	function renderPost() {
		var P = post, when = P.created ? new Date(/Z$|[+-]\d\d:?\d\d$/.test(P.created) ? P.created : P.created + 'Z') : null;
		var src = P.kind === 'hive' ? '@' + P.author + (P.app ? ' · posted with ' + P.app : '') : P.kind === 'youtube' ? (P.channel || 'YouTube') : P.host;
		$('aid-phead').innerHTML = '<div class="aid-post__t">' + esc(P.title || '(no title)') + '</div><div class="aid-post__m">' + esc(src) + (when && !isNaN(when) ? ' · ' + esc(when.toLocaleString()) : '') + ' · <a href="' + esc(P.link) + '" target="_blank" rel="noopener">open it</a></div>';
		var w = P.text ? A.words(P.text).length : 0, acts = '';
		acts += w ? '<button type="button" class="tu-btn tu-btn--primary" id="aid-ptext">Check the text for AI (' + w.toLocaleString() + ' words)</button>' : '<span class="tu-note">' + (P.kind === 'youtube' ? 'YouTube doesn\'t share a video\'s description with other sites, so there is no text to check: paste it into the Text tab yourself.' : 'No text found in it.') + '</span>';
		$('aid-pacts').innerHTML = acts;
		var h = '';
		if (P.video) {
			var vt = P.video.kind === 'youtube' ? 'YouTube video' : '3Speak video', vthumb = P.video.thumb || (P.video.kind === 'youtube' ? 'https://i.ytimg.com/vi/' + P.video.id + '/hqdefault.jpg' : '');
			h += '<h3 class="aid-h">Video</h3><div class="aid-pvid">' + (vthumb ? tile(P.video.kind === 'youtube' ? 'https://i.ytimg.com/vi/' + P.video.id + '/maxresdefault.jpg' : vthumb, vt + ': thumbnail') : '') +
				'<p class="tu-note">A page can\'t download the video itself from ' + (P.video.kind === 'youtube' ? 'YouTube' : '3Speak') + ', and those copies have lost their original metadata anyway. Check the thumbnail here; for the video, ask for the original file and drop it on the Video tab, or take a frame (Video Editor) to the reverse image searches. Copies of a video are usually found by searching its title and a few spoken sentences.</p></div>';
		}
		var imgs = (P.images || []).filter(function (u) { return !P.video || !P.video.thumb || A.imageKey(u) !== A.imageKey(P.video.thumb); });
		h += '<h3 class="aid-h">Pictures (' + imgs.length + ')</h3>' + (imgs.length ? '<div class="aid-pimgs">' + imgs.map(function (u, i) { return tile(u, 'Picture ' + (i + 1)); }).join('') + '</div>' : '<p class="tu-note">No pictures in it.</p>');
		if (imgs.length && P.kind === 'hive') h += '<p class="tu-note">Pictures on Hive usually pass through a re-saving proxy or were saved from another site, so most have lost their camera data and Content Credentials. A picture that still has them says a lot; one without them says nothing.</p>';
		$('aid-pmedia').innerHTML = h;
		var C = A.copySignals(P);
		$('aid-pcopy').innerHTML = C.map(function (s) { return '<div class="aid-sig aid-csig--' + s.dir + '"><div class="aid-sig__top"><span class="aid-sig__dir">' + CDIR[s.dir][1] + ' ' + CDIR[s.dir][0] + '</span></div><div class="aid-sig__t">' + esc(s.title) + '</div><div class="aid-sig__d">' + esc(s.detail) + '</div></div>'; }).join('');
		var sents = A.distinctiveSentences(P.text, 3), st = '';
		if (P.title && P.title.length > 15) sents.unshift(P.title);
		if (sents.length) st = '<h3 class="aid-h">Search for its words elsewhere</h3><ul class="aid-links aid-plinks">' + sents.map(function (s) { return '<li><q>' + esc(s) + '</q><span>' + A.phraseLinks(s).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>'; }).join(' · ') + '</span></li>'; }).join('') + '</ul><p class="tu-note">The title and the sentences with the most unusual words. An exact match on another site, older than this post, means the words were copied (or both copied a third source). No match proves nothing: search engines don\'t index everything, and reworded copies won\'t match.</p>';
		$('aid-psent').innerHTML = st;
		$('aid-post').hidden = false;
	}
	$('aid-post').addEventListener('click', function (e) {
		var b = e.target.closest('[data-check]'); if (b) { showTab('img', true); loadImageUrl(b.getAttribute('data-check')).then(function () { $('aid-p-img').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); return; }
		if (e.target.closest('#aid-ptext')) { showTab('text', true); ta.value = post.text; count(); checkText(); $('aid-p-text').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
	});
	function loadPost(link, then) {
		var L = A.parsePostLink(link); if (!L) { toast('That doesn\'t look like a link'); return Promise.resolve(); }
		postBusy = true; var btn = $('aid-postf').querySelector('button'); btn.disabled = true; btn.textContent = 'Loading…';
		var job;
		if (L.kind === 'hive') job = hiveCall('bridge.get_post', { author: L.author, permlink: L.permlink }).then(function (p) { if (!p || !p.author) throw new Error('That post was not found on Hive.'); return A.hivePost(p); });
		else if (L.kind === 'youtube') job = fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(L.url)).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (o) {
			return { kind: 'youtube', title: o.title || 'YouTube video', channel: o.author_name || '', text: '', images: [], video: { kind: 'youtube', id: L.id }, link: L.url };
		});
		else job = fetch('/api/page-text?url=' + encodeURIComponent(L.url)).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.error) throw new Error(j.error || (r.status === 404 ? 'The page reader is not available here.' : 'Could not read that page (' + r.status + ').')); return j; }); }).then(function (j) {
			if (j.redo) throw new Error('That link is a ' + (j.redo === 'pdf' ? 'PDF' : 'Word') + ' file: open it in the ' + (j.redo === 'pdf' ? 'PDF Editor' : 'Word Viewer') + ' and paste the text here.');
			var host = ''; try { host = new URL(j.url || L.url).hostname.replace(/^www\./, ''); } catch (e) {}
			return { kind: 'web', title: j.title || host, host: host, text: j.text || '', images: j.images || [], link: j.url || L.url };
		});
		return job.then(function (P) {
			post = P; renderPost();
			if (then === 'text' && P.text) { ta.value = P.text; count(); checkText(); }
			else if (curTab() === 'text' && P.text) { ta.value = P.text; count(); checkText(); }
			$('aid-post').scrollIntoView({ behavior: 'smooth', block: 'start' });
			try { var u = new URL(location.href); u.searchParams.set('u', link); history.replaceState(null, '', u); } catch (e) {}
		}).catch(function (e) { toast(e && e.message ? e.message : 'Could not load that link'); }).then(function () { postBusy = false; btn.disabled = false; btn.textContent = 'Load the post'; });
	}
	$('aid-postf').onsubmit = function (e) { e.preventDefault(); var u = $('aid-purl').value.trim(); if (!u) return toast('Paste a link first'); if (A.isImageLink(u)) { showTab('img', true); loadImageUrl(u); return; } loadPost(u); };
	var qu = /[?&]u=([^&]+)/.exec(location.search); if (qu) { try { var qv = decodeURIComponent(qu[1]); $('aid-purl').value = qv; loadPost(qv); } catch (e) {} }

	window.MESAIDDebug = { post: function () { return post; }, loadPost: loadPost, img: function () { return img; }, vid: function () { return vid; }, txt: function () { return txt; }, loadImage: loadImage, loadVideo: loadVideo, checkText: checkText, showTab: showTab };
})();
