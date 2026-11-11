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
