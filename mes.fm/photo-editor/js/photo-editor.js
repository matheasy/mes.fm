/* MES Image Converter helpers -- pure code shared by mes.fm/image-converter and mes.fm/photo-editor (lib_from), node-testable:
 * node tool_apps_src/image-converter-tests.js. Formats, output sizes, file names, a store-only ZIP writer / reader (crc32). */
var MESImg = (function () {
	"use strict";
	var FORMATS = {
		jpg: { mime: "image/jpeg", ext: "jpg", name: "JPEG", lossy: true, alpha: false },
		png: { mime: "image/png", ext: "png", name: "PNG", lossy: false, alpha: true },
		webp: { mime: "image/webp", ext: "webp", name: "WebP", lossy: true, alpha: true }
	};
	function extOf(name) { var m = /\.([A-Za-z0-9]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
	function baseName(name) { return String(name || "image").replace(/^.*[\\\/]/, "").replace(/\.[A-Za-z0-9]+$/, "") || "image"; }
	function cleanFileName(s) { return String(s).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 150) || "image"; }
	/* output size: mode "keep" | "width" | "height" | "box" | "percent"; never enlarges unless `enlarge` */
	function fitSize(w, h, o) {
		o = o || {}; var mode = o.mode || "keep", s = 1;
		if (mode === "width" && o.w > 0) s = o.w / w;
		else if (mode === "height" && o.h > 0) s = o.h / h;
		else if (mode === "box" && (o.w > 0 || o.h > 0)) s = Math.min(o.w > 0 ? o.w / w : Infinity, o.h > 0 ? o.h / h : Infinity);
		else if (mode === "percent" && o.p > 0) s = o.p / 100;
		if (!o.enlarge && s > 1) s = 1;
		return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
	}
	/* de-duplicate names inside one batch / ZIP: a.jpg, a (2).jpg, a (3).jpg */
	function uniqueName(name, used) {
		var key = name.toLowerCase();
		if (!used[key]) { used[key] = 1; return name; }
		var ext = extOf(name), base = ext ? name.slice(0, -ext.length - 1) : name, n = ++used[key], cand;
		do { cand = base + " (" + n + ")" + (ext ? "." + ext : ""); n++; } while (used[cand.toLowerCase()]);
		used[cand.toLowerCase()] = 1; return cand;
	}
	/* output file name: pattern with {name}, {n} (1-based), {w}, {h}; falls back to name + suffix */
	function outName(pattern, file, n, fmt, w, h) {
		var base = baseName(file);
		var p = (pattern && pattern.indexOf("{") >= 0) ? pattern : (base + (pattern || ""));
		p = p.replace(/\{name\}/g, base).replace(/\{n\}/g, String(n)).replace(/\{w\}/g, String(w || "")).replace(/\{h\}/g, String(h || ""));
		return cleanFileName(p) + "." + FORMATS[fmt].ext;
	}
	function formatBytes(b) {
		if (b < 1024) return b + " B";
		if (b < 1048576) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
		return (b / 1048576).toFixed(b < 10485760 ? 2 : 1) + " MB";
	}
	var CRC = null;
	function crc32(u8) {
		if (!CRC) { CRC = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
		var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = CRC[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
		return (crc ^ 0xFFFFFFFF) >>> 0;
	}
	function utf8(s) { return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Uint8Array.from(unescape(encodeURIComponent(s)), function (c) { return c.charCodeAt(0); }); }
	/* ZIP, "store" method only (images are already compressed): files = [{name, data: Uint8Array}] -> Uint8Array */
	function zipStore(files, when) {
		var d = when || new Date(), dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()) & 0xFFFF, tm = (d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1)) & 0xFFFF;
		var parts = [], central = [], offset = 0;
		files.forEach(function (f) {
			var nm = utf8(f.name), crc = crc32(f.data), size = f.data.length;
			var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
			lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
			parts.push(new Uint8Array(lh.buffer), nm, f.data);
			var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
			ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nm.length, true);
			ch.setUint32(42, offset, true);
			central.push(new Uint8Array(ch.buffer), nm);
			offset += 30 + nm.length + size;
		});
		var csize = 0; central.forEach(function (c) { csize += c.length; });
		var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
		var all = parts.concat(central, [new Uint8Array(end.buffer)]), total = 0; all.forEach(function (p) { total += p.length; });
		var out = new Uint8Array(total), pos = 0; all.forEach(function (p) { out.set(p, pos); pos += p.length; });
		return out;
	}
	/* read a stored-only ZIP (the ones zipStore() writes) -> [{name, data}] ; returns null when it is not one */
	function zipRead(u8) {
		var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i = u8.length - 22;
		while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
		if (i < 0) return null;
		var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), out = [], dec = new TextDecoder();
		for (var k = 0; k < n; k++) {
			if (dv.getUint32(p, true) !== 0x02014b50) return null;
			var method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
			if (method !== 0) return null;
			var name = dec.decode(u8.subarray(p + 46, p + 46 + nl)), lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true), st = lo + 30 + lnl + lel;
			out.push({ name: name, data: u8.subarray(st, st + csz) });
			p += 46 + nl + el + cl;
		}
		return out;
	}
	var api = { FORMATS: FORMATS, extOf: extOf, baseName: baseName, cleanFileName: cleanFileName, fitSize: fitSize, uniqueName: uniqueName, outName: outName, formatBytes: formatBytes, crc32: crc32, zipStore: zipStore, zipRead: zipRead };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();

/* MES Photo Editor pixel library -- pure functions on RGBA Uint8ClampedArray / Uint8Array masks, no DOM, node-testable:
 * node tool_apps_src/photo-editor-tests.js. Adjustments (levels, curves, brightness / contrast, hue / saturation, vibrance, exposure, temperature,
 * invert, grayscale, sepia, threshold, posterize), filters (gaussian / box blur, unsharp mask, noise, pixelate, vignette, 3x3 convolution) and mask
 * helpers (flood select, grow / shrink, feather). Alpha is never touched by colour adjustments. */
var MESPixel = (function () {
	"use strict";
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function hexToRgb(h) {
		h = String(h || "#000").replace("#", "");
		if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
		var n = parseInt(h.slice(0, 6), 16); if (isNaN(n)) n = 0;
		return [n >> 16 & 255, n >> 8 & 255, n & 255];
	}
	function rgbToHex(r, g, b) { return "#" + [r, g, b].map(function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
	function rgbToHsl(r, g, b) {
		r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
		if (d > 1e-9) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
		return [h, s, l];
	}
	function hue2(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
	function hslToRgb(h, s, l) {
		h = ((h % 360) + 360) % 360 / 360;
		if (s <= 0) return [l * 255, l * 255, l * 255];
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
		return [hue2(p, q, h + 1 / 3) * 255, hue2(p, q, h) * 255, hue2(p, q, h - 1 / 3) * 255];
	}
	function histogram(d) {
		var R = new Uint32Array(256), G = new Uint32Array(256), B = new Uint32Array(256), L = new Uint32Array(256);
		for (var i = 0; i < d.length; i += 4) { if (d[i + 3] === 0) continue; R[d[i]]++; G[d[i + 1]]++; B[d[i + 2]]++; L[Math.round(d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722)]++; }
		return { r: R, g: G, b: B, l: L };
	}
	function identityLUT() { var l = new Uint8Array(256); for (var i = 0; i < 256; i++) l[i] = i; return l; }
	function applyLUT(d, lr, lg, lb) {
		lg = lg || lr; lb = lb || lr;
		for (var i = 0; i < d.length; i += 4) { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; }
	}
	function levelsLUT(inB, inW, gamma, outB, outW) {
		var l = new Uint8Array(256), span = Math.max(1, inW - inB), g = 1 / Math.max(0.01, gamma);
		for (var i = 0; i < 256; i++) { var v = clamp((i - inB) / span, 0, 1); v = Math.pow(v, g); l[i] = Math.round(outB + v * (outW - outB)); }
		return l;
	}
	/* monotone cubic (Fritsch-Carlson) through points [[x,y],...] on 0..255 */
	function curveLUT(pts) {
		var p = pts.slice().sort(function (a, b) { return a[0] - b[0]; }), n = p.length, lut = new Uint8Array(256);
		if (n < 2) return identityLUT();
		var dx = [], dy = [], m = [], c1 = [];
		for (var i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, p[i + 1][0] - p[i][0]); dy[i] = p[i + 1][1] - p[i][1]; m[i] = dy[i] / dx[i]; }
		c1[0] = m[0]; c1[n - 1] = m[n - 2];
		for (i = 1; i < n - 1; i++) c1[i] = m[i - 1] * m[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((dx[i - 1] + dx[i] + dx[i]) / m[i - 1] + (dx[i - 1] + dx[i] + dx[i - 1]) / m[i]);
		for (var x = 0; x < 256; x++) {
			var v;
			if (x <= p[0][0]) v = p[0][1]; else if (x >= p[n - 1][0]) v = p[n - 1][1];
			else {
				var k = 0; while (k < n - 2 && x > p[k + 1][0]) k++;
				var t = (x - p[k][0]) / dx[k], t2 = t * t, t3 = t2 * t;
				v = (2 * t3 - 3 * t2 + 1) * p[k][1] + (t3 - 2 * t2 + t) * dx[k] * c1[k] + (-2 * t3 + 3 * t2) * p[k + 1][1] + (t3 - t2) * dx[k] * c1[k + 1];
			}
			lut[x] = clamp(Math.round(v), 0, 255);
		}
		return lut;
	}
	function brightnessContrast(d, b, c) {
		var off = b * 2.55, cc = c * 2.55, f = (259 * (cc + 255)) / (255 * (259 - cc)), lut = new Uint8Array(256);
		for (var i = 0; i < 256; i++) lut[i] = clamp(Math.round((i - 128) * f + 128 + off), 0, 255);
		applyLUT(d, lut);
	}
	function exposure(d, ev, offset, gamma) {
		var lut = new Uint8Array(256), m = Math.pow(2, ev), g = 1 / Math.max(0.01, gamma);
		for (var i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(clamp(i / 255 * m + offset, 0, 1), g));
		applyLUT(d, lut);
	}
	function hueSat(d, h, s, l) {
		var sf = s >= 0 ? 1 + s / 100 : 1 + s / 100;
		for (var i = 0; i < d.length; i += 4) {
			var hsl = rgbToHsl(d[i], d[i + 1], d[i + 2]), S = clamp(hsl[1] * sf, 0, 1), L = hsl[2];
			if (l > 0) L = L + (1 - L) * l / 100; else if (l < 0) L = L * (1 + l / 100);
			var c = hslToRgb(hsl[0] + h, S, L); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
		}
	}
	function vibrance(d, v) {
		var k = v / 100;
		for (var i = 0; i < d.length; i += 4) {
			var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), avg = (r + g + b) / 3, sat = mx ? (mx - mn) / mx : 0;
			var f = k >= 0 ? 1 + k * (1 - sat) : 1 + k;
			d[i] = avg + (r - avg) * f; d[i + 1] = avg + (g - avg) * f; d[i + 2] = avg + (b - avg) * f;
		}
	}
	function temperature(d, t, tint) {
		var rf = 1 + t / 200, bf = 1 - t / 200, gf = 1 - tint / 200;
		for (var i = 0; i < d.length; i += 4) { d[i] *= rf; d[i + 1] *= gf; d[i + 2] *= bf; }
	}
	function invert(d) { for (var i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } }
	function grayscale(d) { for (var i = 0; i < d.length; i += 4) { var y = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722; d[i] = d[i + 1] = d[i + 2] = y; } }
	function sepia(d) {
		for (var i = 0; i < d.length; i += 4) { var r = d[i], g = d[i + 1], b = d[i + 2];
			d[i] = r * 0.393 + g * 0.769 + b * 0.189; d[i + 1] = r * 0.349 + g * 0.686 + b * 0.168; d[i + 2] = r * 0.272 + g * 0.534 + b * 0.131; }
	}
	function threshold(d, t) { for (var i = 0; i < d.length; i += 4) { var y = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722, v = y >= t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } }
	function posterize(d, n) {
		n = Math.max(2, Math.round(n)); var lut = new Uint8Array(256);
		for (var i = 0; i < 256; i++) lut[i] = Math.round(Math.round(i / 255 * (n - 1)) / (n - 1) * 255);
		applyLUT(d, lut);
	}
	/* ---- blur (premultiplied alpha, edge-clamped running sums, three box passes approximate a gaussian) ---- */
	function boxSizes(sigma, n) {
		var w = Math.sqrt(12 * sigma * sigma / n + 1), wl = Math.floor(w); if (wl % 2 === 0) wl--; var wu = wl + 2;
		var m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)), s = [];
		for (var i = 0; i < n; i++) s.push(((i < m ? wl : wu) - 1) / 2);
		return s;
	}
	function boxPass(src, dst, w, h, r, nc, horiz) {
		r = Math.max(0, Math.round(r)); if (r === 0) { dst.set(src); return; }
		var len = horiz ? w : h, lines = horiz ? h : w, step = horiz ? nc : w * nc, lstep = horiz ? w * nc : nc, div = 2 * r + 1;
		for (var l = 0; l < lines; l++) {
			var base = l * lstep;
			for (var c = 0; c < nc; c++) {
				var o = base + c, first = src[o], last = src[o + (len - 1) * step], sum = (r + 1) * first;
				for (var j = 0; j < r; j++) sum += src[o + Math.min(j, len - 1) * step];
				for (var i = 0; i < len; i++) {
					var add = src[o + Math.min(i + r, len - 1) * step], rem = i - r - 1 < 0 ? first : src[o + (i - r - 1) * step];
					sum += add - rem; dst[o + i * step] = (sum / div + 0.5) | 0;
				}
			}
		}
	}
	function blurPlane(a, w, h, nc, sigma) {
		if (sigma <= 0.3) return;
		var tmp = new Uint8ClampedArray(a.length), boxes = boxSizes(sigma, 3);
		for (var p = 0; p < 3; p++) { boxPass(a, tmp, w, h, boxes[p], nc, true); boxPass(tmp, a, w, h, boxes[p], nc, false); }
	}
	function premultiply(d) { for (var i = 0; i < d.length; i += 4) { var a = d[i + 3]; if (a < 255) { d[i] = d[i] * a / 255 + 0.5 | 0; d[i + 1] = d[i + 1] * a / 255 + 0.5 | 0; d[i + 2] = d[i + 2] * a / 255 + 0.5 | 0; } } }
	function unpremultiply(d) { for (var i = 0; i < d.length; i += 4) { var a = d[i + 3]; if (a > 0 && a < 255) { d[i] = Math.min(255, d[i] * 255 / a + 0.5 | 0); d[i + 1] = Math.min(255, d[i + 1] * 255 / a + 0.5 | 0); d[i + 2] = Math.min(255, d[i + 2] * 255 / a + 0.5 | 0); } } }
	function gaussianBlur(d, w, h, radius) { premultiply(d); blurPlane(d, w, h, 4, radius / 2); unpremultiply(d); }
	function boxBlur(d, w, h, radius) {
		premultiply(d); var tmp = new Uint8ClampedArray(d.length); boxPass(d, tmp, w, h, radius, 4, true); boxPass(tmp, d, w, h, radius, 4, false); unpremultiply(d);
	}
	function unsharp(d, w, h, amount, radius, thr) {
		var b = new Uint8ClampedArray(d), k2 = amount / 100; gaussianBlur(b, w, h, radius);
		for (var i = 0; i < d.length; i += 4) for (var c = 0; c < 3; c++) {
			var diff = d[i + c] - b[i + c]; if (Math.abs(diff) > thr) d[i + c] = d[i + c] + diff * k2;
		}
	}
	function rng(seed) { var a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	function noise(d, amount, mono, seed) {
		var r = rng(seed || 1), s = amount * 2.55;
		function g() { return (r() + r() + r() - 1.5) * 2; }
		for (var i = 0; i < d.length; i += 4) {
			if (mono) { var n = g() * s; d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += g() * s; d[i + 1] += g() * s; d[i + 2] += g() * s; }
		}
	}
	function pixelate(d, w, h, size) {
		size = Math.max(1, Math.round(size));
		for (var by = 0; by < h; by += size) for (var bx = 0; bx < w; bx += size) {
			var x1 = Math.min(w, bx + size), y1 = Math.min(h, by + size), r = 0, g = 0, b = 0, a = 0, n = 0, wsum = 0;
			for (var y = by; y < y1; y++) for (var x = bx; x < x1; x++) { var i = (y * w + x) * 4, al = d[i + 3]; r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; wsum += al; n++; }
			var ra = n ? a / n : 0, rr = wsum ? r / wsum : 0, rg = wsum ? g / wsum : 0, rb = wsum ? b / wsum : 0;
			for (y = by; y < y1; y++) for (x = bx; x < x1; x++) { i = (y * w + x) * 4; d[i] = rr; d[i + 1] = rg; d[i + 2] = rb; d[i + 3] = ra; }
		}
	}
	/* darken (amount > 0) or lighten (< 0) the edges; size = clear centre 0..100, feather = softness 0..100 */
	function vignette(d, w, h, amount, size, feather) {
		var cx = w / 2, cy = h / 2, maxd = Math.sqrt(cx * cx + cy * cy), s0 = size / 100, f = Math.max(0.01, feather / 100), k = amount / 100;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var dd = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxd, t = clamp((dd - s0) / f, 0, 1); t = t * t * (3 - 2 * t);
			var i = (y * w + x) * 4;
			if (k >= 0) { var m = 1 - k * t; d[i] *= m; d[i + 1] *= m; d[i + 2] *= m; } else { var q = -k * t; d[i] += (255 - d[i]) * q; d[i + 1] += (255 - d[i + 1]) * q; d[i + 2] += (255 - d[i + 2]) * q; }
		}
	}
	function convolve(d, w, h, kernel, div, bias) {
		var src = new Uint8ClampedArray(d);
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var o = (y * w + x) * 4;
			for (var c = 0; c < 3; c++) {
				var s = 0, k = 0;
				for (var ky = -1; ky <= 1; ky++) for (var kx = -1; kx <= 1; kx++) { var xx = clamp(x + kx, 0, w - 1), yy = clamp(y + ky, 0, h - 1); s += src[(yy * w + xx) * 4 + c] * kernel[k++]; }
				d[o + c] = s / (div || 1) + (bias || 0);
			}
		}
	}
	/* ---- masks (Uint8Array w*h, 0..255) ---- */
	function colorDiff(d, i, r, g, b, a) { return Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b), Math.abs(d[i + 3] - a)); }
	function floodMask(d, w, h, x, y, tol, contiguous) {
		var mask = new Uint8Array(w * h); x = x | 0; y = y | 0; if (x < 0 || y < 0 || x >= w || y >= h) return mask;
		var o = (y * w + x) * 4, r = d[o], g = d[o + 1], b = d[o + 2], a = d[o + 3];
		if (!contiguous) { for (var p = 0; p < w * h; p++) if (colorDiff(d, p * 4, r, g, b, a) <= tol) mask[p] = 255; return mask; }
		var stack = [x, y];
		while (stack.length) {
			var cy = stack.pop(), cx = stack.pop(), lx = cx;
			while (lx >= 0 && !mask[cy * w + lx] && colorDiff(d, (cy * w + lx) * 4, r, g, b, a) <= tol) lx--;
			lx++; var up = false, dn = false;
			for (var px = lx; px < w && !mask[cy * w + px] && colorDiff(d, (cy * w + px) * 4, r, g, b, a) <= tol; px++) {
				mask[cy * w + px] = 255;
				if (cy > 0) { var m = !mask[(cy - 1) * w + px] && colorDiff(d, ((cy - 1) * w + px) * 4, r, g, b, a) <= tol; if (m && !up) { stack.push(px, cy - 1); } up = m; }
				if (cy < h - 1) { var m2 = !mask[(cy + 1) * w + px] && colorDiff(d, ((cy + 1) * w + px) * 4, r, g, b, a) <= tol; if (m2 && !dn) { stack.push(px, cy + 1); } dn = m2; }
			}
		}
		return mask;
	}
	function dilate1(src, dst, w, h, r, horiz, isMax) {
		var len = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 1 : w, lstep = horiz ? w : 1;
		for (var l = 0; l < lines; l++) { var base = l * lstep;
			for (var i = 0; i < len; i++) { var best = isMax ? 0 : 255, lo = Math.max(0, i - r), hi = Math.min(len - 1, i + r);
				if (!isMax && (i - r < 0 || i + r > len - 1)) best = 0;      // outside the image counts as empty when shrinking: selections shrink off the edges too
				else for (var j = lo; j <= hi; j++) { var v = src[base + j * step]; if (isMax ? v > best : v < best) best = v; }
				dst[base + i * step] = best; } }
	}
	function growShrinkMask(mask, w, h, r, grow) {
		r = Math.max(0, Math.round(r)); if (!r) return new Uint8Array(mask);
		var a = new Uint8Array(w * h), b = new Uint8Array(w * h); dilate1(mask, a, w, h, r, true, grow); dilate1(a, b, w, h, r, false, grow); return b;
	}
	function featherMask(mask, w, h, radius) { var m = new Uint8ClampedArray(mask); blurPlane(m, w, h, 1, radius / 2); return new Uint8Array(m.buffer); }
	function invertMask(mask) { var o = new Uint8Array(mask.length); for (var i = 0; i < mask.length; i++) o[i] = 255 - mask[i]; return o; }
	function maskBounds(mask, w, h) {
		var x0 = w, y0 = h, x1 = -1, y1 = -1;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
		return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
	}
	/* bounding box of non-transparent pixels (alpha > thr) */
	function opaqueBounds(d, w, h, thr) {
		var x0 = w, y0 = h, x1 = -1, y1 = -1; thr = thr || 0;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
		return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
	}
	/* blend `after` into `before` by a mask (0..255 per pixel); both RGBA data arrays of the same size */
	function blendByMask(before, after, mask) {
		for (var p = 0, i = 0; p < mask.length; p++, i += 4) { var m = mask[p]; if (m === 255) continue; if (m === 0) { after[i] = before[i]; after[i + 1] = before[i + 1]; after[i + 2] = before[i + 2]; after[i + 3] = before[i + 3]; continue; }
			var k = m / 255; after[i] = before[i] + (after[i] - before[i]) * k; after[i + 1] = before[i + 1] + (after[i + 1] - before[i + 1]) * k; after[i + 2] = before[i + 2] + (after[i + 2] - before[i + 2]) * k; after[i + 3] = before[i + 3] + (after[i + 3] - before[i + 3]) * k; }
	}
	function autoLevels(hist, clip) {
		var tot = 0, i; for (i = 0; i < 256; i++) tot += hist[i]; if (!tot) return { black: 0, white: 255 };
		var lim = tot * (clip == null ? 0.005 : clip), s = 0, b = 0, w = 255;
		for (i = 0; i < 256; i++) { s += hist[i]; if (s > lim) { b = i; break; } }
		s = 0; for (i = 255; i >= 0; i--) { s += hist[i]; if (s > lim) { w = i; break; } }
		if (w - b < 2) { b = 0; w = 255; } return { black: b, white: w };
	}
	var api = { clamp: clamp, hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb, histogram: histogram, identityLUT: identityLUT, applyLUT: applyLUT, levelsLUT: levelsLUT, curveLUT: curveLUT,
		brightnessContrast: brightnessContrast, exposure: exposure, hueSat: hueSat, vibrance: vibrance, temperature: temperature, invert: invert, grayscale: grayscale, sepia: sepia, threshold: threshold, posterize: posterize,
		gaussianBlur: gaussianBlur, boxBlur: boxBlur, unsharp: unsharp, noise: noise, pixelate: pixelate, vignette: vignette, convolve: convolve, floodMask: floodMask, growShrinkMask: growShrinkMask, featherMask: featherMask, invertMask: invertMask,
		maskBounds: maskBounds, opaqueBounds: opaqueBounds, blendByMask: blendByMask, autoLevels: autoLevels, premultiply: premultiply, unpremultiply: unpremultiply };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();

/* MES Photo Editor core: document + layer model, compositing, selection, history, image-level operations, project files.
 * Layers are canvases with a non-destructive transform (centre cx, cy, scale sx, sy, rotation rot): moving / scaling / rotating costs nothing and is
 * "baked" into pixels only when something paints on the layer. Everything that changes the picture ends in PE.commit(label) = one undo step. */
(function () {
	"use strict";
	var PE = window.PE = window.PE || {};
	var P = window.MESPixel, I = window.MESImg;
	var listeners = {};
	PE.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
	PE.emit = function (ev, a, b) { (listeners[ev] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.error(e); } }); };
	PE.doc = null; PE.fg = "#000000"; PE.bg = "#ffffff"; PE.sel = null; PE.dirty = false; PE.view = { zoom: 1, px: 0, py: 0, w: 0, h: 0, dpr: 1 };
	PE.BLENDS = [["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"], ["darken", "Darken"], ["lighten", "Lighten"], ["color-dodge", "Color Dodge"], ["color-burn", "Color Burn"], ["hard-light", "Hard Light"], ["soft-light", "Soft Light"], ["difference", "Difference"], ["exclusion", "Exclusion"], ["hue", "Hue"], ["saturation", "Saturation"], ["color", "Color"], ["luminosity", "Luminosity"]];
	PE.MAXPX = 16384; PE.MAXAREA = 120e6;

	function mk(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
	function clone(c) { var n = mk(c.width, c.height); n.getContext("2d").drawImage(c, 0, 0); return n; }
	PE.mk = mk; PE.clone = clone;
	var tmps = {};
	PE.tmp = function (key, w, h) { var c = tmps[key] || (tmps[key] = mk(w, h)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else { var x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.clearRect(0, 0, w, h); } return c; };

	/* ---------- layers ---------- */
	PE.makeLayer = function (o) {
		o = o || {}; var d = PE.doc, w = o.w || (d ? d.w : 1), h = o.h || (d ? d.h : 1);
		var c = o.canvas || mk(w, h);
		return { id: d ? d.next++ : 1, name: o.name || "Layer", type: o.type || "raster", canvas: c, cx: o.cx != null ? o.cx : (o.x || 0) + c.width / 2, cy: o.cy != null ? o.cy : (o.y || 0) + c.height / 2,
			sx: 1, sy: 1, rot: 0, visible: true, opacity: 1, blend: "source-over", locked: false, text: o.text || null, mask: null, editMask: false, rev: 0, _snap: null, group: null, collapsed: false, _p: null };
	};
	PE.active = function () { var d = PE.doc; if (!d) return null; for (var i = 0; i < d.layers.length; i++) if (d.layers[i].id === d.activeId) return d.layers[i]; return d.layers[d.layers.length - 1] || null; };
	PE.layerById = function (id) { var d = PE.doc; for (var i = 0; i < d.layers.length; i++) if (d.layers[i].id === id) return d.layers[i]; return null; };
	PE.indexOf = function (L) { return PE.doc.layers.indexOf(L); };
	PE.setActive = function (id) { PE.doc.activeId = id; PE.emit("layers"); PE.emit("active"); };
	PE.touch = function (L) { if (L) L.rev++; PE.invalidate(); };
	/* ---------- groups: a group is a header layer (type "group", 1x1 canvas) that comes AFTER its members in the flat array; members point at it with `group` (its id). Members are always contiguous. ---------- */
	PE.isGroup = function (L) { return !!L && L.type === "group"; };
	PE.makeGroup = function (name) { var G = PE.makeLayer({ name: name || "Group", w: 1, h: 1, type: "group" }); return G; };
	PE.relink = function () { var d = PE.doc, m = {}; d.layers.forEach(function (L) { m[L.id] = L; }); d.layers.forEach(function (L) { L._p = L.group != null ? (m[L.group] || null) : null; }); };
	PE.kidsOf = function (G) { return PE.doc.layers.filter(function (L) { return L.group === G.id; }); };
	PE.descendants = function (G) { var out = [], d = PE.doc; (function walk(g) { d.layers.forEach(function (L) { if (L.group === g.id) { if (PE.isGroup(L)) walk(L); out.push(L); } }); })(G); return d.layers.filter(function (L) { return out.indexOf(L) >= 0; }); };
	PE.blockOf = function (L) { return PE.isGroup(L) ? PE.descendants(L).concat([L]) : [L]; };
	PE.ancestorsOf = function (L) { var out = [], d = PE.doc, p = L.group; while (p != null) { var g = PE.layerById(p); if (!g) break; out.push(g); p = g.group; } return out; };
	PE.depthOf = function (L) { return PE.ancestorsOf(L).length; };
	PE.topGroupOf = function (L) { var a = PE.ancestorsOf(L); return a.length ? a[a.length - 1] : L; };
	PE.effVisible = function (L) { if (!L.visible) return false; for (var p = L._p; p; p = p._p) if (!p.visible) return false; return true; };
	PE.translate = function (L, dx, dy) { if (PE.isGroup(L)) PE.descendants(L).forEach(function (k) { if (!PE.isGroup(k)) { k.cx += dx; k.cy += dy; k.rev++; } }); else { L.cx += dx; L.cy += dy; } PE.invalidate(); };
	PE.groupBounds = function (G) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false; PE.descendants(G).forEach(function (k) { if (PE.isGroup(k)) return; var b = PE.bounds(k); any = true; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }); return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 }; };
	PE.addLayer = function (L, index) {
		var d = PE.doc;
		if (index == null) {
			var a = PE.active();
			if (!a) index = d.layers.length;
			else if (PE.isGroup(a)) { if (!a.collapsed) { L.group = a.id; index = d.layers.indexOf(a); } else { L.group = a.group; index = d.layers.indexOf(a) + 1; } }
			else { L.group = a.group; index = d.layers.indexOf(a) + 1; }
		}
		d.layers.splice(index, 0, L); d.activeId = L.id; PE.relink(); PE.emit("layers"); PE.invalidate(); return L;
	};
	PE.origin = function (L) { return { x: Math.round(L.cx - L.canvas.width / 2), y: Math.round(L.cy - L.canvas.height / 2) }; };
	PE.isIdentity = function (L) { return L.sx === 1 && L.sy === 1 && L.rot === 0; };
	function matrix(L) { var c = Math.cos(L.rot), s = Math.sin(L.rot); return [c * L.sx, s * L.sx, -s * L.sy, c * L.sy, L.cx, L.cy]; }
	PE.corners = function (L) {
		if (PE.isGroup(L)) { var gb = PE.groupBounds(L); return [[gb.x, gb.y], [gb.x + gb.w, gb.y], [gb.x + gb.w, gb.y + gb.h], [gb.x, gb.y + gb.h]]; }
		var m = matrix(L), hw = L.canvas.width / 2, hh = L.canvas.height / 2;
		return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; });
	};
	PE.bounds = function (L) { if (PE.isGroup(L)) return PE.groupBounds(L); var c = PE.corners(L), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; c.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
	PE.toLayerPt = function (L, x, y) { var c = Math.cos(L.rot), s = Math.sin(L.rot), dx = x - L.cx, dy = y - L.cy; return { x: (c * dx + s * dy) / L.sx + L.canvas.width / 2, y: (-s * dx + c * dy) / L.sy + L.canvas.height / 2 }; };
	PE.layerAt = function (x, y) {
		var ls = PE.doc.layers;
		for (var i = ls.length - 1; i >= 0; i--) {
			var L = ls[i]; if (PE.isGroup(L) || !PE.effVisible(L)) continue; var p = PE.toLayerPt(L, x, y);
			if (p.x < 0 || p.y < 0 || p.x >= L.canvas.width || p.y >= L.canvas.height) continue;
			try { if (L.canvas.getContext("2d").getImageData(p.x | 0, p.y | 0, 1, 1).data[3] > 8) return L; } catch (e) { return L; }
		}
		return null;
	};
	/* bake the transform into the pixels (scale / rotation / flip) so tools can paint in layer space */
	PE.bake = function (L) {
		if (PE.isIdentity(L)) return;
		var b = PE.bounds(L), ox = Math.floor(b.x + 1e-6), oy = Math.floor(b.y + 1e-6), W = Math.max(1, Math.ceil(b.x + b.w - 1e-6) - ox), H = Math.max(1, Math.ceil(b.y + b.h - 1e-6) - oy);
		if (W * H > PE.MAXAREA) { PE.toast("That layer would be too large to edit"); return; }
		var m = matrix(L), nc = mk(W, H), x = nc.getContext("2d"); x.imageSmoothingQuality = "high";
		x.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy); x.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2);
		if (L.mask) { var nm = mk(W, H), mx = nm.getContext("2d"); mx.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy); mx.drawImage(L.mask, -L.canvas.width / 2, -L.canvas.height / 2); L.mask = nm; }
		L.canvas = nc; L.cx = ox + W / 2; L.cy = oy + H / 2; L.sx = L.sy = 1; L.rot = 0; L.rev++;
	};
	/* grow a layer's canvas (and mask) so it covers rect {x,y,w,h} (doc coordinates); the layer must be baked */
	PE.growLayer = function (L, r) {
		var o = PE.origin(L), w = L.canvas.width, h = L.canvas.height, x0 = Math.min(o.x, Math.floor(r.x)), y0 = Math.min(o.y, Math.floor(r.y)), x1 = Math.max(o.x + w, Math.ceil(r.x + r.w)), y1 = Math.max(o.y + h, Math.ceil(r.y + r.h));
		if (x0 === o.x && y0 === o.y && x1 === o.x + w && y1 === o.y + h) return;
		var W = x1 - x0, H = y1 - y0; if (W * H > PE.MAXAREA || W > PE.MAXPX * 2) return;
		var nc = mk(W, H); nc.getContext("2d").drawImage(L.canvas, o.x - x0, o.y - y0);
		if (L.mask) { var nm = mk(W, H), mx = nm.getContext("2d"); mx.fillStyle = "#000"; mx.fillRect(0, 0, W, H); mx.clearRect(o.x - x0, o.y - y0, w, h); mx.drawImage(L.mask, o.x - x0, o.y - y0); L.mask = nm; }
		L.canvas = nc; L.cx = x0 + W / 2; L.cy = y0 + H / 2; L.rev++;
	};
	PE.rasterize = function (L) { if (L.type === "text") { L.type = "raster"; L.text = null; L.rev++; } };
	/* make a layer ready for painting: raster, baked, at least as big as the document; returns false if locked / not possible */
	PE.prepare = function (L, quiet, noGrow) {
		if (!L) { if (!quiet) PE.toast("Add or open an image first"); return false; }
		if (L.locked) { if (!quiet) PE.toast("This layer is locked"); return false; }
		if (PE.isGroup(L)) { if (!quiet) PE.toast("This is a group: select a layer inside it"); return false; }
		L.eq = null;
		if (L.type === "text") { PE.rasterize(L); PE.emit("layers"); }
		PE.bake(L); if (!noGrow) PE.growLayer(L, { x: 0, y: 0, w: PE.doc.w, h: PE.doc.h }); return true;
	};

	/* ---------- text layers ---------- */
	PE.TEXTDEF = { str: "Text", font: "Arial, Helvetica, sans-serif", size: 64, bold: false, italic: false, color: "#000000", align: "left", lh: 1.2, bgOn: false, bgColor: "#ffeb3b", bgPad: 12, bgRadius: 8, strokeOn: false, stroke: "#ffffff", strokeW: 4, shadowOn: false, shadow: "#000000", shadowBlur: 8, shadowDx: 4, shadowDy: 4, ls: 0 };
	PE.renderText = function (L) {
		var t = L.text, lines = String(t.str).split("\n"), f = (t.italic ? "italic " : "") + (t.bold ? "bold " : "") + t.size + "px " + t.font, m = mk(8, 8).getContext("2d");
		m.font = f; if ("letterSpacing" in m) m.letterSpacing = (t.ls || 0) + "px";
		var lw = lines.map(function (s) { return m.measureText(s).width; }), mw = Math.max.apply(null, lw.concat([1])), lhp = t.size * t.lh;
		var bgp = t.bgOn ? t.bgPad : 0, pad = Math.ceil(bgp + (t.strokeOn ? t.strokeW : 0) + (t.shadowOn ? t.shadowBlur * 2 + Math.max(Math.abs(t.shadowDx), Math.abs(t.shadowDy)) : 0) + t.size * 0.15 + 2);
		var W = Math.ceil(mw) + pad * 2, H = Math.ceil(lhp * lines.length + t.size * 0.3) + pad * 2; if (W * H > PE.MAXAREA) return;
		var oldW = L.canvas.width, oldH = L.canvas.height, c = mk(W, H), x = c.getContext("2d");
		x.font = f; if ("letterSpacing" in x) x.letterSpacing = (t.ls || 0) + "px"; x.textBaseline = "alphabetic"; x.lineJoin = "round"; x.textAlign = t.align;
		if (t.bgOn) { var bx = pad - bgp, by = pad - bgp, bw = Math.ceil(mw) + bgp * 2, bh = Math.ceil(lhp * lines.length + t.size * 0.3 - t.size * 0.1) + bgp * 2 - Math.round(t.size * 0.05), br = Math.min(t.bgRadius, bw / 2, bh / 2); x.fillStyle = t.bgColor; x.beginPath(); x.moveTo(bx + br, by); x.arcTo(bx + bw, by, bx + bw, by + bh, br); x.arcTo(bx + bw, by + bh, bx, by + bh, br); x.arcTo(bx, by + bh, bx, by, br); x.arcTo(bx, by, bx + bw, by, br); x.closePath(); x.fill(); }
		lines.forEach(function (s, i) {
			var px = t.align === "center" ? pad + mw / 2 : t.align === "right" ? pad + mw : pad, py = pad + lhp * i + t.size * 0.92;
			if (t.shadowOn) { x.save(); x.shadowColor = t.shadow; x.shadowBlur = t.shadowBlur; x.shadowOffsetX = t.shadowDx; x.shadowOffsetY = t.shadowDy; x.fillStyle = t.color; x.fillText(s, px, py); x.restore(); }
			if (t.strokeOn) { x.strokeStyle = t.stroke; x.lineWidth = t.strokeW * 2; x.strokeText(s, px, py); }
			x.fillStyle = t.color; x.fillText(s, px, py);
		});
		L._pad = pad; var dx = (W - oldW) / 2, dy = (H - oldH) / 2, m6 = matrix(L);      // keep the top-left corner where it was
		L.cx += m6[0] * dx + m6[2] * dy; L.cy += m6[1] * dx + m6[3] * dy; L.canvas = c; L.rev++;
		if (L.mask) { L.mask = null; }
	};

	/* ---------- compositing ---------- */
	function drawLayer(ctx, L, base, tmpKey, w, h) {
		if (PE.isGroup(L) || !L.visible) return; var op = L.opacity; for (var gp = L._p; gp; gp = gp._p) { if (!gp.visible) return; op *= gp.opacity; } if (op <= 0) return;
		var src = L.preview || L.canvas, cw = L.canvas.width, ch = L.canvas.height, m = matrix(L);
		var needTmp = L.mask || L.live;
		if (!needTmp) {
			ctx.save(); ctx.globalAlpha = op; ctx.globalCompositeOperation = L.blend;
			ctx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
			ctx.drawImage(src, -cw / 2, -ch / 2, cw, ch); ctx.restore(); return;
		}
		var t = PE.tmp(tmpKey, w, h), tx = t.getContext("2d");
		tx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
		tx.imageSmoothingQuality = "high"; tx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
		tx.drawImage(src, -cw / 2, -ch / 2, cw, ch);
		if (L.live && L.live.target !== "mask") { tx.globalCompositeOperation = L.live.erase ? "destination-out" : "source-over"; tx.globalAlpha = L.live.alpha; tx.drawImage(L.live.buf, -cw / 2, -ch / 2); tx.globalAlpha = 1; }
		if (L.mask) {
			tx.globalCompositeOperation = "destination-in";
			if (L.live && L.live.target === "mask") { var mm = PE.tmp(tmpKey + "m", L.mask.width, L.mask.height), mc = mm.getContext("2d"); mc.drawImage(L.mask, 0, 0); mc.globalCompositeOperation = L.live.erase ? "destination-out" : "source-over"; mc.globalAlpha = L.live.alpha; mc.drawImage(L.live.buf, 0, 0); tx.drawImage(mm, -cw / 2, -ch / 2); }
			else tx.drawImage(L.mask, -cw / 2, -ch / 2);
		}
		ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = op; ctx.globalCompositeOperation = L.blend; ctx.drawImage(t, 0, 0); ctx.restore();
	}
	PE.drawLayer = drawLayer;
	/* the whole picture as a document-size canvas (export, copy merged, thumbnails) */
	PE.flatten = function (o) {
		o = o || {}; var d = PE.doc; PE.relink(); var sc = o.scale || 1, W = Math.max(1, Math.round(d.w * sc)), H = Math.max(1, Math.round(d.h * sc)), c = mk(W, H), x = c.getContext("2d");
		if (o.fill) { x.fillStyle = o.fill; x.fillRect(0, 0, W, H); }
		x.imageSmoothingQuality = "high";
		d.layers.forEach(function (L) { if (o.only && o.only.indexOf(L) < 0) return; drawLayer(x, L, [sc, 0, 0, sc, 0, 0], "exp", W, H); });
		return c;
	};
	PE.invalidate = function () { if (PE._raf) return; PE._raf = requestAnimationFrame(function () { PE._raf = 0; PE.render(); PE.drawOverlay(); }); };
	PE.invalidateOverlay = function () { if (PE._oraf) return; PE._oraf = requestAnimationFrame(function () { PE._oraf = 0; PE.drawOverlay(); }); };

	/* ---------- view ---------- */
	PE.toDoc = function (cx, cy) { var r = PE.els.over.getBoundingClientRect(), v = PE.view; return { x: (cx - r.left - v.px) / v.zoom, y: (cy - r.top - v.py) / v.zoom }; };
	PE.toScreen = function (x, y) { var v = PE.view; return { x: x * v.zoom + v.px, y: y * v.zoom + v.py }; };
	PE.fit = function (pad) {
		var v = PE.view, d = PE.doc; if (!d || !v.w) return; pad = pad == null ? 24 : pad;
		var z = Math.min((v.w - pad * 2) / d.w, (v.h - pad * 2) / d.h); v.zoom = Math.min(Math.max(z, 0.02), 1); v.px = (v.w - d.w * v.zoom) / 2; v.py = (v.h - d.h * v.zoom) / 2; PE.emit("view"); PE.invalidate();
	};
	PE.setZoom = function (z, sx, sy) {
		var v = PE.view; z = Math.min(64, Math.max(0.02, z)); if (sx == null) { sx = v.w / 2; sy = v.h / 2; }
		var dx = (sx - v.px) / v.zoom, dy = (sy - v.py) / v.zoom; v.zoom = z; v.px = sx - dx * z; v.py = sy - dy * z; PE.emit("view"); PE.invalidate();
	};
	PE.panBy = function (dx, dy) { PE.view.px += dx; PE.view.py += dy; PE.emit("view"); PE.invalidate(); };
	var checker = null;
	function checkerPattern(ctx, dpr, dark) {
		var s = Math.round(8 * dpr), c = mk(s * 2, s * 2), x = c.getContext("2d");
		x.fillStyle = dark ? "#3a3a3a" : "#ffffff"; x.fillRect(0, 0, s * 2, s * 2); x.fillStyle = dark ? "#2e2e2e" : "#cfcfcf"; x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s);
		return ctx.createPattern(c, "repeat");
	}
	PE.render = function () {
		var v = PE.view, c = PE.els.main; if (!c || !v.w) return;
		var W = Math.round(v.w * v.dpr), H = Math.round(v.h * v.dpr);
		if (c.width !== W || c.height !== H) { c.width = W; c.height = H; checker = null; }
		var ctx = c.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#1b1b1f"; ctx.fillRect(0, 0, W, H);
		var d = PE.doc; if (!d) return; PE.relink();
		var z = v.zoom * v.dpr, ox = v.px * v.dpr, oy = v.py * v.dpr, rx = ox, ry = oy, rw = d.w * z, rh = d.h * z;
		ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 18 * v.dpr; ctx.fillStyle = "#000"; ctx.fillRect(rx, ry, rw, rh); ctx.restore();
		ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
		if (!checker) checker = checkerPattern(ctx, v.dpr, true);
		ctx.fillStyle = PE.docBg || checker; ctx.fillRect(rx, ry, rw, rh);
		var comp = PE.tmp("comp", W, H), cx = comp.getContext("2d"); cx.imageSmoothingEnabled = z < 2; cx.imageSmoothingQuality = "high";
		var base = [z, 0, 0, z, ox, oy];
		d.layers.forEach(function (L) { drawLayer(cx, L, base, "lt", W, H); });
		ctx.drawImage(comp, 0, 0);
		if (PE.showGrid && z >= 6) { ctx.strokeStyle = "rgba(128,128,128,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); for (var gx = 0; gx <= d.w; gx++) { ctx.moveTo(Math.round(rx + gx * z) + 0.5, ry); ctx.lineTo(Math.round(rx + gx * z) + 0.5, ry + rh); } for (var gy = 0; gy <= d.h; gy++) { ctx.moveTo(rx, Math.round(ry + gy * z) + 0.5); ctx.lineTo(rx + rw, Math.round(ry + gy * z) + 0.5); } ctx.stroke(); }
		ctx.restore();
	};

	/* ---------- selection (a document-size canvas, alpha = how selected) ---------- */
	function selCanvas() { if (!PE.sel) PE.sel = { c: mk(PE.doc.w, PE.doc.h), ver: 0 }; return PE.sel; }
	PE.selChanged = function () { var s = PE.sel; if (s) { s.ver++; s.u8 = null; s.bb = undefined; } PE.emit("sel"); PE.invalidateOverlay(); };
	/* shape(ctx): draws the new region in white; mode "new" | "add" | "sub" | "int" */
	PE.selShape = function (draw, mode) {
		var d = PE.doc, s = selCanvas(), n = mk(d.w, d.h), nx = n.getContext("2d"); nx.fillStyle = "#fff"; draw(nx);
		PE.selCombine(n, mode);
	};
	PE.selCombine = function (n, mode) {
		var s = selCanvas(), x = s.c.getContext("2d");
		if (mode === "add") { x.globalCompositeOperation = "source-over"; x.drawImage(n, 0, 0); }
		else if (mode === "sub") { x.globalCompositeOperation = "destination-out"; x.drawImage(n, 0, 0); }
		else if (mode === "int") { x.globalCompositeOperation = "destination-in"; x.drawImage(n, 0, 0); }
		else { x.globalCompositeOperation = "copy"; x.drawImage(n, 0, 0); }
		x.globalCompositeOperation = "source-over"; PE.selChanged(); PE.selTrim();
	};
	PE.selMask = function () { var s = PE.sel; if (!s) return null; if (!s.u8) { var d = s.c.getContext("2d").getImageData(0, 0, s.c.width, s.c.height).data, u = new Uint8Array(s.c.width * s.c.height); for (var i = 0; i < u.length; i++) u[i] = d[i * 4 + 3]; s.u8 = u; } return s.u8; };
	PE.selBounds = function () { var s = PE.sel; if (!s) return null; if (s.bb === undefined) s.bb = P.maskBounds(PE.selMask(), s.c.width, s.c.height); return s.bb; };
	PE.selTrim = function () { if (PE.sel && !PE.selBounds()) { PE.sel = null; PE.emit("sel"); PE.invalidateOverlay(); } };
	PE.selFromMask = function (u8, mode) {
		var d = PE.doc, n = mk(d.w, d.h), x = n.getContext("2d"), id = x.createImageData(d.w, d.h), a = id.data;
		for (var i = 0; i < u8.length; i++) { a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = 255; a[i * 4 + 3] = u8[i]; }
		x.putImageData(id, 0, 0); PE.selCombine(n, mode || "new");
	};
	PE.selAll = function () { PE.selShape(function (x) { x.fillRect(0, 0, PE.doc.w, PE.doc.h); }, "new"); };
	PE.selClear = function () { if (PE.sel) { PE.sel = null; PE.emit("sel"); PE.invalidateOverlay(); } };
	PE.selInvert = function () { var d = PE.doc; if (!PE.sel) { PE.selAll(); return; } var m = P.invertMask(PE.selMask()); PE.selFromMask(m, "new"); };
	PE.selGrow = function (r, grow) { if (!PE.sel) return; var d = PE.doc; PE.selFromMask(P.growShrinkMask(PE.selMask(), d.w, d.h, r, grow), "new"); };
	PE.selFeather = function (r) { if (!PE.sel) return; var d = PE.doc; PE.selFromMask(P.featherMask(PE.selMask(), d.w, d.h, r), "new"); };
	/* the selection cut out for a doc-space rect, drawn into ctx (destination-in) so a dab / shape stays inside it */
	PE.restrictToSel = function (ctx, x, y, w, h) {
		if (!PE.sel) return; var sc = PE.sel.c, sx = Math.max(0, x), sy = Math.max(0, y), sw = Math.min(sc.width, x + w) - sx, sh = Math.min(sc.height, y + h) - sy;
		ctx.save(); ctx.globalCompositeOperation = "destination-in"; ctx.setTransform(1, 0, 0, 1, 0, 0);
		if (sw <= 0 || sh <= 0) { ctx.clearRect(0, 0, w, h); ctx.restore(); return; }
		var cc = PE.tmp("selcrop", Math.ceil(w), Math.ceil(h)); cc.getContext("2d").drawImage(sc, sx, sy, sw, sh, sx - x, sy - y, sw, sh);
		ctx.drawImage(cc, 0, 0); ctx.restore();
	};

	/* ---------- pixel operations on a layer (adjustments, filters, fills), limited to the selection ---------- */
	PE.layerData = function (L) { return L.canvas.getContext("2d").getImageData(0, 0, L.canvas.width, L.canvas.height); };
	PE.selMaskForLayer = function (L) {
		if (!PE.sel) return null; var o = PE.origin(L), w = L.canvas.width, h = L.canvas.height, m = PE.selMask(), sw = PE.sel.c.width, sh = PE.sel.c.height, out = new Uint8Array(w * h);
		for (var y = 0; y < h; y++) { var dy = y + o.y; if (dy < 0 || dy >= sh) continue; for (var x = 0; x < w; x++) { var dx = x + o.x; if (dx >= 0 && dx < sw) out[y * w + x] = m[dy * sw + dx]; } }
		return out;
	};
	PE.applyPixels = function (L, fn, label, noCommit) {
		if (!PE.prepare(L, false, true)) return false;
		var id = PE.layerData(L), before = PE.sel ? new Uint8ClampedArray(id.data) : null; fn(id.data, id.width, id.height);
		if (before) P.blendByMask(before, id.data, PE.selMaskForLayer(L));
		L.canvas.getContext("2d").putImageData(id, 0, 0); L.rev++; PE.invalidate(); if (!noCommit) PE.commit(label); return true;
	};

	/* ---------- history ---------- */
	var H = PE.hist = { stack: [], idx: -1 };
	function snapLayer(L) {
		var s = L._snap; if (!s || s.rev !== L.rev || (L.mask ? !s.m : !!s.m)) { s = L._snap = { rev: L.rev, c: clone(L.canvas), m: L.mask ? clone(L.mask) : null }; }
		return { meta: { id: L.id, group: L.group, collapsed: L.collapsed, name: L.name, type: L.type, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, text: L.text ? JSON.parse(JSON.stringify(L.text)) : null, eq: L.eq ? JSON.parse(JSON.stringify(L.eq)) : null, editMask: L.editMask }, snap: s };
	}
	var lastSel = { ver: -1, obj: null };
	function takeSnapshot(label) {
		var d = PE.doc, sel = null;
		if (PE.sel) { if (lastSel.obj && lastSel.ver === PE.sel.ver && lastSel.c === PE.sel.c) sel = lastSel.snap; else { sel = clone(PE.sel.c); lastSel = { ver: PE.sel.ver, c: PE.sel.c, snap: sel, obj: PE.sel }; } }
		return { label: label, w: d.w, h: d.h, active: d.activeId, layers: d.layers.map(snapLayer), sel: sel, comps: JSON.stringify(d.comps || []), t: Date.now() };
	}
	PE.commit = function (label) {
		if (!PE.doc) return; PE.dirty = true;
		H.stack.length = H.idx + 1; H.stack.push(takeSnapshot(label)); H.idx = H.stack.length - 1;
		var budget = 700e6, total = function () { var seen = new Set(), t = 0; H.stack.forEach(function (e) { e.layers.forEach(function (l) { if (!seen.has(l.snap)) { seen.add(l.snap); t += l.snap.c.width * l.snap.c.height * 4 + (l.snap.m ? l.snap.m.width * l.snap.m.height * 4 : 0); } }); }); return t; };
		while (H.stack.length > 2 && (H.stack.length > 100 || total() > budget)) { H.stack.shift(); H.idx--; }
		PE.emit("history"); PE.emit("layers"); PE.invalidate(); PE.scheduleAutosave && PE.scheduleAutosave();
	};
	function restore(e) {
		var d = PE.doc; d.w = e.w; d.h = e.h; d.layers = e.layers.map(function (l) {
			var L = PE.makeLayer({ canvas: clone(l.snap.c), type: l.meta.type, name: l.meta.name, text: l.meta.text }); for (var k in l.meta) if (k !== "text" && k !== "eq") L[k] = l.meta[k]; L.text = l.meta.text ? JSON.parse(JSON.stringify(l.meta.text)) : null; L.eq = l.meta.eq ? JSON.parse(JSON.stringify(l.meta.eq)) : null;
			L.mask = l.snap.m ? clone(l.snap.m) : null; L.rev = l.snap.rev; L._snap = l.snap; return L; });
		d.comps = JSON.parse(e.comps || "[]"); d.activeId = e.active; if (!PE.layerById(d.activeId) && d.layers.length) d.activeId = d.layers[d.layers.length - 1].id;
		PE.sel = e.sel ? { c: clone(e.sel), ver: ++PE.selSeq } : null; PE.relink(); PE.emit("sel"); PE.emit("history"); PE.emit("layers"); PE.emit("comps"); PE.emit("docsize"); PE.invalidate(); PE.scheduleAutosave && PE.scheduleAutosave();
	}
	PE.selSeq = 1000;
	PE.undo = function () { if (H.idx > 0) { H.idx--; restore(H.stack[H.idx]); } };
	PE.redo = function () { if (H.idx < H.stack.length - 1) { H.idx++; restore(H.stack[H.idx]); } };
	PE.gotoHistory = function (i) { if (i >= 0 && i < H.stack.length && i !== H.idx) { H.idx = i; restore(H.stack[i]); } };

	/* ---------- documents ---------- */
	PE.newDoc = function (w, h, bg, name) {
		w = Math.round(w); h = Math.round(h); if (!(w > 0 && h > 0) || w > PE.MAXPX || h > PE.MAXPX || w * h > PE.MAXAREA) { PE.toast("That size is too large for a browser (max " + PE.MAXPX + " px a side)"); return false; }
		PE.doc = { w: w, h: h, layers: [], activeId: 0, next: 1, name: name || "Untitled", comps: [] }; PE.sel = null; H.stack = []; H.idx = -1; lastSel = { ver: -1 };
		var L = PE.makeLayer({ name: bg ? "Background" : "Layer 1" }); if (bg) { var x = L.canvas.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, w, h); }
		PE.doc.layers.push(L); PE.doc.activeId = L.id; PE.commit("New document"); PE.dirty = false; PE.emit("docsize"); PE.emit("sel"); PE.fit(); return true;
	};
	PE.openImageSource = function (src, name) {
		var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
		if (w > PE.MAXPX || h > PE.MAXPX || w * h > PE.MAXAREA) { var s = Math.min(PE.MAXPX / w, PE.MAXPX / h, Math.sqrt(PE.MAXAREA / (w * h))), c = mk(w * s, h * s), x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; PE.toast("Very large image: scaled down to " + w + " × " + h + " to fit the browser"); }
		if (!PE.newDoc(w, h, null, I.baseName(name || "image"))) return false;
		var L = PE.doc.layers[0]; L.name = "Background"; L.canvas.getContext("2d").drawImage(src, 0, 0); L.rev++; PE.commit("Open " + (name || "image")); PE.dirty = false; PE.fit(); return true;
	};
	PE.decodeFile = function (file) {
		if (window.createImageBitmap && !/svg/.test(file.type)) return createImageBitmap(file).catch(function () { return viaImg(file); });
		return viaImg(file);
	};
	function viaImg(file) { return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("Can't read this image")); }; im.src = u; }); }
	/* add an image / canvas as a new layer, centred (scaled down if bigger than the document) */
	PE.placeSource = function (src, name, at) {
		var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, c = mk(w, h); c.getContext("2d").drawImage(src, 0, 0);
		var L = PE.makeLayer({ canvas: c, name: name || "Layer", cx: at ? at.x : PE.doc.w / 2, cy: at ? at.y : PE.doc.h / 2 });
		if (!at && (w > PE.doc.w || h > PE.doc.h)) { var s = Math.min(PE.doc.w / w, PE.doc.h / h); L.sx = L.sy = s; }
		if (!at) { L.cx = Math.round(PE.doc.w / 2 * 2) / 2; L.cy = Math.round(PE.doc.h / 2 * 2) / 2; if (PE.isIdentity(L)) { L.cx = Math.round(L.cx - w / 2) + w / 2; L.cy = Math.round(L.cy - h / 2) + h / 2; } }
		PE.addLayer(L); PE.commit("Place " + (name || "image")); return L;
	};

	/* ---------- layer commands ---------- */
	PE.newRasterLayer = function (name) { PE.addLayer(PE.makeLayer({ name: name || "Layer " + PE.doc.next })); PE.commit("New layer"); };
	PE.duplicateLayer = function (L) {
		L = L || PE.active(); if (!L) return; var d = PE.doc, block = PE.blockOf(L), map = {}, copies = block.map(function (B) {
			var n = PE.makeLayer({ canvas: clone(B.canvas), type: B.type, name: B.name + (B === L ? " copy" : ""), text: B.text ? JSON.parse(JSON.stringify(B.text)) : null }); map[B.id] = n;
			["cx", "cy", "sx", "sy", "rot", "visible", "opacity", "blend", "collapsed"].forEach(function (k) { n[k] = B[k]; }); if (B.eq) n.eq = JSON.parse(JSON.stringify(B.eq)); if (B.mask) n.mask = clone(B.mask); return n; });
		copies.forEach(function (n, i) { var B = block[i]; n.group = B === L ? L.group : (map[B.group] ? map[B.group].id : L.group); });
		var at = d.layers.indexOf(L) + 1; Array.prototype.splice.apply(d.layers, [at, 0].concat(copies)); d.activeId = copies[copies.length - 1].id; PE.relink(); PE.commit("Duplicate " + (PE.isGroup(L) ? "group" : "layer"));
	};
	PE.deleteLayer = function (L) {
		L = L || PE.active(); if (!L) return; var d = PE.doc, i = d.layers.indexOf(L), gone = PE.blockOf(L);
		d.layers = d.layers.filter(function (x) { return gone.indexOf(x) < 0; });
		if (!d.layers.length) d.layers.push(PE.makeLayer({ name: "Layer 1" })); d.activeId = d.layers[Math.max(0, Math.min(i - gone.length + 1, d.layers.length - 1))].id; PE.relink(); PE.commit("Delete " + (PE.isGroup(L) ? "group" : "layer"));
	};
	/* move a layer (with its members, if a group) next to `target`: zone "above" (higher in the stack) / "below" / "into" (target is a group: becomes its top member) */
	PE.relocate = function (src, target, zone) {
		var d = PE.doc; if (!src || !target || src === target) return false;
		if (PE.isGroup(src) && PE.descendants(src).indexOf(target) >= 0) return false;
		var block = PE.blockOf(src); d.layers = d.layers.filter(function (x) { return block.indexOf(x) < 0; });
		var ti = d.layers.indexOf(target), at, parent;
		if (zone === "into" && PE.isGroup(target)) { parent = target.id; at = ti; }
		else { parent = target.group; if (zone === "below") { at = ti - (PE.isGroup(target) ? PE.descendants(target).length : 0); } else at = ti + 1; }
		src.group = parent; Array.prototype.splice.apply(d.layers, [Math.max(0, at), 0].concat(block)); PE.relink(); PE.commit("Reorder layers"); return true;
	};
	PE.moveLayer = function (L, to) {
		var d = PE.doc; var sibs = d.layers.filter(function (x) { return x.group === L.group; }), i = sibs.indexOf(L), t = Math.max(0, Math.min(sibs.length - 1, to)); if (i < 0 || i === t) return;
		var other = sibs[t]; PE.relocate(L, other, t > i ? "above" : "below");
	};
	PE.stepLayer = function (L, dir) { var sibs = PE.doc.layers.filter(function (x) { return x.group === L.group; }), i = sibs.indexOf(L); PE.moveLayer(L, i + dir); };
	PE.groupLayers = function (list) {
		var d = PE.doc; list = (list || []).filter(Boolean); if (!list.length) { PE.toast("Select the layers to group (Ctrl-click in the Layers panel)"); return null; }
		list.sort(function (a, b) { return d.layers.indexOf(a) - d.layers.indexOf(b); }); var top = list[list.length - 1], parent = top.group;
		var members = list.filter(function (L) { return L.group === parent; }); if (!members.length) members = [top];
		var blocks = []; members.forEach(function (L) { PE.blockOf(L).forEach(function (B) { if (blocks.indexOf(B) < 0) blocks.push(B); }); }); blocks = d.layers.filter(function (x) { return blocks.indexOf(x) >= 0; });
		var G = PE.makeGroup("Group " + d.next), topIdx = d.layers.indexOf(top), before = d.layers.slice(0, topIdx + 1).filter(function (x) { return blocks.indexOf(x) < 0; }).length;
		d.layers = d.layers.filter(function (x) { return blocks.indexOf(x) < 0; }); G.group = parent; members.forEach(function (L) { L.group = G.id; });
		Array.prototype.splice.apply(d.layers, [before, 0].concat(blocks, [G])); d.activeId = G.id; PE.relink(); PE.commit("Group layers"); return G;
	};
	PE.ungroup = function (G) {
		G = G || PE.active(); if (!PE.isGroup(G)) { PE.toast("Select a group first"); return; } var d = PE.doc, kids = PE.kidsOf(G); kids.forEach(function (k) { k.group = G.group; });
		d.layers = d.layers.filter(function (x) { return x !== G; }); d.activeId = kids.length ? kids[kids.length - 1].id : (d.layers[d.layers.length - 1] || {}).id; PE.relink(); PE.commit("Ungroup");
	};
	PE.mergeLayers = function (list, label) {
		var d = PE.doc; list = d.layers.filter(function (L) { return list.indexOf(L) >= 0 && !PE.isGroup(L); }); if (list.length < 2) return; PE.relink();
		var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(function (L) { var b = PE.bounds(L); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
		x0 = Math.floor(x0); y0 = Math.floor(y0); var W = Math.ceil(x1) - x0, Hh = Math.ceil(y1) - y0; if (W * Hh > PE.MAXAREA) { PE.toast("Merged layer would be too large"); return; }
		var c = mk(W, Hh), x = c.getContext("2d"); x.imageSmoothingQuality = "high"; list.forEach(function (L) { drawLayer(x, L, [1, 0, 0, 1, -x0, -y0], "merge", W, Hh); });
		var top = list[list.length - 1], n = PE.makeLayer({ canvas: c, name: list[0].name, x: x0, y: y0 }), at = d.layers.indexOf(top); n.group = top.group;
		d.layers = d.layers.filter(function (L) { return list.indexOf(L) < 0; }); d.layers.splice(Math.min(at - list.length + 1, d.layers.length), 0, n); d.activeId = n.id; PE.relink(); PE.commit(label || "Merge layers");
	};
	PE.mergeDown = function () { var d = PE.doc, L = PE.active(), i = PE.indexOf(L); if (!L || PE.isGroup(L)) { PE.toast("Select a normal layer to merge"); return; } var below = d.layers[i - 1]; if (!below || PE.isGroup(below) || below.group !== L.group) { PE.toast("There is no layer directly below in this group"); return; } PE.mergeLayers([below, L], "Merge down"); };
	PE.mergeVisible = function () { PE.relink(); PE.mergeLayers(PE.doc.layers.filter(function (L) { return PE.effVisible(L) && !PE.isGroup(L); }), "Merge visible"); };
	PE.flattenImage = function () { var d = PE.doc, all = d.layers.filter(function (L) { return !PE.isGroup(L) && PE.effVisible(L); }); if (all.length < 2 && d.layers.length === all.length) return; d.layers.forEach(function (L) { L.group = null; }); PE.relink(); PE.mergeLayers(all, "Flatten image"); d.layers = d.layers.filter(function (L) { return !PE.isGroup(L); }); var L = PE.active(); if (L) L.name = "Background"; PE.commit("Flatten image"); };
	PE.layerFromSelection = function (cut) {
		var L = PE.active(), b = PE.selBounds(); if (!L || !b) { PE.toast("Make a selection first"); return; }
		var c = mk(b.w, b.h), x = c.getContext("2d"); drawLayer(x, L, [1, 0, 0, 1, -b.x, -b.y], "sel", b.w, b.h); x.globalCompositeOperation = "destination-in"; x.drawImage(PE.sel.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
		var n = PE.makeLayer({ canvas: c, name: (cut ? "Cut" : "Copy") + " of " + L.name, x: b.x, y: b.y });
		if (cut && PE.prepare(L, false, true)) { var o = PE.origin(L), lx = L.canvas.getContext("2d"); lx.save(); lx.globalCompositeOperation = "destination-out"; lx.drawImage(PE.sel.c, -o.x, -o.y); lx.restore(); L.rev++; }
		n.group = L.group; PE.addLayer(n, PE.indexOf(L) + 1); PE.commit(cut ? "Layer via cut" : "Layer via copy");
	};
	PE.addMask = function (L, fromSel) {
		L = L || PE.active(); if (!L || L.mask) return; PE.bake(L); var m = mk(L.canvas.width, L.canvas.height), x = m.getContext("2d");
		if (fromSel && PE.sel) { var o = PE.origin(L); x.drawImage(PE.sel.c, -o.x, -o.y); } else { x.fillStyle = "#000"; x.fillRect(0, 0, m.width, m.height); }
		L.mask = m; L.editMask = true; L.rev++; PE.commit("Add layer mask");
	};
	PE.applyMask = function (L) { L = L || PE.active(); if (!L || !L.mask) return; PE.bake(L); var x = L.canvas.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-in"; x.drawImage(L.mask, 0, 0); x.restore(); L.mask = null; L.editMask = false; L.rev++; PE.commit("Apply layer mask"); };
	PE.deleteMask = function (L) { L = L || PE.active(); if (!L || !L.mask) return; L.mask = null; L.editMask = false; L.rev++; PE.commit("Delete layer mask"); };

	/* ---------- comps (scenes): named states of every layer's visibility, position, scale, rotation, opacity and blend mode (like Photoshop layer comps). Layers that did not exist when a comp was
	   saved are hidden when it is applied, so a comp always shows what it showed. "Export all comps" turns one project with many groups into a set of pictures. ---------- */
	PE.compCapture = function () { var st = {}; PE.doc.layers.forEach(function (L) { st[L.id] = { v: L.visible ? 1 : 0, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, o: L.opacity, b: L.blend }; }); return st; };
	PE.compSave = function (name) { var d = PE.doc; d.comps = d.comps || []; var c = { id: "c" + (d.next++), name: name || "Comp " + (d.comps.length + 1), st: PE.compCapture() }; d.comps.push(c); PE.commit("Save comp \"" + c.name + "\""); PE.emit("comps"); return c; };
	PE.compUpdate = function (c) { c.st = PE.compCapture(); PE.commit("Update comp \"" + c.name + "\""); PE.emit("comps"); };
	PE.compApplyState = function (c) { var d = PE.doc; d.layers.forEach(function (L) { var s = c.st[L.id]; if (!s) { L.visible = false; return; } L.visible = !!s.v; L.cx = s.cx; L.cy = s.cy; L.sx = s.sx; L.sy = s.sy; L.rot = s.rot; L.opacity = s.o; L.blend = s.b; L.rev++; }); PE.relink(); PE.invalidate(); };
	PE.compApply = function (c) { PE.compApplyState(c); PE.commit("Show comp \"" + c.name + "\""); PE.emit("comps"); };
	PE.compMatches = function (c) { var d = PE.doc, ok = true; d.layers.forEach(function (L) { var s = c.st[L.id]; if (!s) { if (L.visible) ok = false; return; } if (!!s.v !== L.visible || Math.abs(s.cx - L.cx) > 0.01 || Math.abs(s.cy - L.cy) > 0.01 || s.sx !== L.sx || s.sy !== L.sy || s.rot !== L.rot || Math.abs(s.o - L.opacity) > 0.001 || s.b !== L.blend) ok = false; }); return ok; };
	PE.compDelete = function (c) { var d = PE.doc; d.comps = d.comps.filter(function (x) { return x !== c; }); PE.commit("Delete comp"); PE.emit("comps"); };
	PE.compRename = function (c, name) { c.name = name; PE.commit("Rename comp"); PE.emit("comps"); };
	PE.compMove = function (c, dir) { var a = PE.doc.comps, i = a.indexOf(c), j = i + dir; if (j < 0 || j >= a.length) return; a.splice(i, 1); a.splice(j, 0, c); PE.commit("Reorder comps"); PE.emit("comps"); };

	/* ---------- image-level operations ---------- */
	PE.cropTo = function (x, y, w, h) {
		x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (w < 1 || h < 1) return;
		var d = PE.doc; d.layers.forEach(function (L) { L.cx -= x; L.cy -= y; }); d.w = w; d.h = h; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Crop"); PE.fit();
	};
	PE.canvasSize = function (w, h, ax, ay, fill) {
		var d = PE.doc; w = Math.round(w); h = Math.round(h); if (w * h > PE.MAXAREA || w > PE.MAXPX || h > PE.MAXPX) { PE.toast("Too large"); return; }
		var dx = Math.round((w - d.w) * ax), dy = Math.round((h - d.h) * ay); d.layers.forEach(function (L) { L.cx += dx; L.cy += dy; }); d.w = w; d.h = h;
		if (fill) { var L = PE.makeLayer({ name: "Background" }); L.canvas.getContext("2d").fillStyle = fill; L.canvas.getContext("2d").fillRect(0, 0, w, h); d.layers.unshift(L); }
		PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Canvas size"); PE.fit();
	};
	PE.resizeImage = function (w, h) {
		var d = PE.doc, fx = w / d.w, fy = h / d.h; w = Math.round(w); h = Math.round(h); if (w * h > PE.MAXAREA || w > PE.MAXPX || h > PE.MAXPX) { PE.toast("Too large"); return; }
		d.layers.forEach(function (L) {
			if (L.type === "text" && Math.abs(fx - fy) < 1e-6) { L.text.size = Math.max(1, L.text.size * fx); L.text.strokeW *= fx; L.text.shadowBlur *= fx; L.text.shadowDx *= fx; L.text.shadowDy *= fx; var ocx = L.cx * fx, ocy = L.cy * fy; PE.renderText(L); L.cx = ocx; L.cy = ocy; return; }
			if (L.type === "text") PE.rasterize(L);
			PE.bake(L); var nw = Math.max(1, Math.round(L.canvas.width * fx)), nh = Math.max(1, Math.round(L.canvas.height * fy));
			L.canvas = PE.resample(L.canvas, nw, nh); if (L.mask) L.mask = PE.resample(L.mask, nw, nh); L.cx *= fx; L.cy *= fy; L.cx = Math.round(L.cx - nw / 2) + nw / 2; L.cy = Math.round(L.cy - nh / 2) + nh / 2; L.rev++;
		});
		d.w = w; d.h = h; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Image size"); PE.fit();
	};
	/* high-quality resample: halve repeatedly while shrinking by more than 2x, then one final draw */
	PE.resample = function (src, w, h) {
		var cur = src; while (cur.width / 2 >= w && cur.height / 2 >= h) { var t = mk(Math.max(w, Math.floor(cur.width / 2)), Math.max(h, Math.floor(cur.height / 2))), tx = t.getContext("2d"); tx.imageSmoothingQuality = "high"; tx.drawImage(cur, 0, 0, t.width, t.height); cur = t; }
		var out = mk(w, h), x = out.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(cur, 0, 0, w, h); return out;
	};
	PE.rotateImage = function (deg) {
		var d = PE.doc, a = deg * Math.PI / 180, W = d.w, Hh = d.h, nw = deg === 180 ? W : Hh, nh = deg === 180 ? Hh : W, c = Math.cos(a), s = Math.sin(a);
		d.layers.forEach(function (L) { var dx = L.cx - W / 2, dy = L.cy - Hh / 2; L.cx = nw / 2 + dx * c - dy * s; L.cy = nh / 2 + dx * s + dy * c; L.rot += a; });
		d.w = nw; d.h = nh; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Rotate " + deg + "°"); PE.fit();
	};
	PE.flipImage = function (horizontal) {
		var d = PE.doc; d.layers.forEach(function (L) { if (horizontal) { L.cx = d.w - L.cx; L.sx = -L.sx; L.rot = -L.rot; } else { L.cy = d.h - L.cy; L.sy = -L.sy; L.rot = -L.rot; } });
		PE.sel = null; PE.emit("sel"); PE.commit("Flip " + (horizontal ? "horizontal" : "vertical")); PE.invalidate();
	};
	PE.flipLayer = function (horizontal) { var L = PE.active(); if (!L) return; if (PE.isGroup(L)) { PE.toast("Select a normal layer"); return; } if (horizontal) { L.sx = -L.sx; L.rot = -L.rot; } else { L.sy = -L.sy; L.rot = -L.rot; } PE.touch(L); PE.commit("Flip layer"); };
	PE.trim = function () {
		var d = PE.doc, c = PE.flatten(), id = c.getContext("2d").getImageData(0, 0, c.width, c.height), b = P.opaqueBounds(id.data, c.width, c.height, 0);
		if (!b) { PE.toast("Nothing to trim: the image is empty"); return; } if (b.w === d.w && b.h === d.h) { PE.toast("No transparent edges to trim"); return; } PE.cropTo(b.x, b.y, b.w, b.h);
	};

	/* ---------- export ---------- */
	PE.exportBlob = function (fmt, quality, opts) {
		opts = opts || {}; var F = I.FORMATS[fmt], d = PE.doc, sc = opts.scale || 1;
		var c = PE.flatten({ scale: sc, fill: F.alpha ? null : (opts.bg || "#ffffff") });
		return new Promise(function (res, rej) { c.toBlob(function (b) { b && b.type === F.mime ? res(b) : rej(new Error("This browser can't save " + F.name)); }, F.mime, quality); });
	};

	/* ---------- project files (.mesproj = stored ZIP: project.json + PNG per layer / mask) ---------- */
	function canvasBytes(c) { return new Promise(function (res) { c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, "image/png"); }); }
	PE.projectBlob = function () {
		var d = PE.doc, files = [], metas = [], jobs = [];
		d.layers.forEach(function (L) {
			var m = { id: L.id, group: L.group, collapsed: L.collapsed, name: L.name, type: L.type, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, text: L.text, w: L.canvas.width, h: L.canvas.height, hasMask: !!L.mask, eq: L.eq || null }; metas.push(m);
			jobs.push(canvasBytes(L.canvas).then(function (u) { files.push({ name: "layer-" + L.id + ".png", data: u }); }));
			if (L.mask) jobs.push(canvasBytes(L.mask).then(function (u) { files.push({ name: "mask-" + L.id + ".png", data: u }); }));
		});
		return Promise.all(jobs).then(function () {
			files.unshift({ name: "project.json", data: new TextEncoder().encode(JSON.stringify({ app: "MES Photo Editor", v: 2, w: d.w, h: d.h, name: d.name, active: d.activeId, next: d.next, layers: metas, comps: d.comps || [] })) });
			return new Blob([I.zipStore(files)], { type: "application/zip" });
		});
	};
	function loadPng(u8) { return new Promise(function (res, rej) { var u = URL.createObjectURL(new Blob([u8], { type: "image/png" })), im = new Image(); im.onload = function () { var c = mk(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0); URL.revokeObjectURL(u); res(c); }; im.onerror = function () { rej(new Error("bad layer image")); }; im.src = u; }); }
	PE.loadProject = function (buf) {
		var files = I.zipRead(new Uint8Array(buf)); if (!files) return Promise.reject(new Error("Not a MES project file"));
		var by = {}; files.forEach(function (f) { by[f.name] = f.data; }); if (!by["project.json"]) return Promise.reject(new Error("Not a MES project file"));
		var p = JSON.parse(new TextDecoder().decode(by["project.json"])), layers = [];
		return Promise.all(p.layers.map(function (m, i) {
			return loadPng(by["layer-" + m.id + ".png"]).then(function (c) { var L = PE.makeLayer({ canvas: c, name: m.name, type: m.type, text: m.text }); L.id = m.id; L.eq = m.eq || null; ["cx", "cy", "sx", "sy", "rot", "visible", "opacity", "blend", "locked", "group", "collapsed"].forEach(function (k) { if (m[k] !== undefined) L[k] = m[k]; }); layers[i] = L; return m.hasMask ? loadPng(by["mask-" + m.id + ".png"]).then(function (mc) { L.mask = mc; }) : null; });
		})).then(function () {
			PE.doc = { w: p.w, h: p.h, layers: layers, activeId: p.active, next: p.next || 1000, name: p.name || "Untitled", comps: p.comps || [] }; PE.relink(); PE.sel = null; H.stack = []; H.idx = -1; lastSel = { ver: -1 };
			PE.commit("Open project"); PE.dirty = false; PE.emit("docsize"); PE.emit("sel"); PE.fit();
		});
	};
})();

/* MES Photo Editor tools, part 1: pointer dispatch (pan / pinch / tools), overlay, move + transform, selection tools, crop, painting (brush, eraser,
 * clone stamp, retouch), bucket, gradient, eyedropper, hand, zoom. Each tool = {id, name, key, icon, opts, ui, down, move, up, overlay, ...}. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk;
	PE.tools = {}; PE.toolOrder = []; PE.toolId = "move"; PE.opt = {}; PE.ptr = { x: 0, y: 0, inside: false };
	PE.defTool = function (t) { PE.tools[t.id] = t; PE.toolOrder.push(t.id); PE.opt[t.id] = JSON.parse(JSON.stringify(t.opts || {})); };
	PE.tool = function () { return PE.tools[PE.toolId]; };
	PE.setTool = function (id) { if (!PE.tools[id]) return; var old = PE.tool(); if (old && old.cancel) old.cancel(); PE.toolId = id; PE.emit("tool"); PE.invalidateOverlay(); };
	function rgba(hex, a) { var c = P.hexToRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
	PE.rgba = rgba;
	function ev2(e) { var p = PE.toDoc(e.clientX, e.clientY); return { x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, pressure: e.pointerType === "pen" ? (e.pressure || 0.5) : 1, pen: e.pointerType === "pen", e: e }; }

	/* ---------- pointer dispatch ---------- */
	var down = {}, gesture = null, panning = null, spaceDown = false, current = null;
	PE.setSpace = function (v) { spaceDown = v; };
	PE.initPointer = function () {
		var el = PE.els.over;
		el.addEventListener("pointerdown", function (e) {
			if (!PE.doc) return; el.setPointerCapture(e.pointerId); down[e.pointerId] = { x: e.clientX, y: e.clientY };
			var n = Object.keys(down).length;
			if (n === 2) { if (current && current.abort) current.abort(); current = null; startGesture(); return; }
			if (n > 2) return;
			if (e.button === 1 || e.button === 2 && false || spaceDown || PE.toolId === "hand") { panning = { x: e.clientX, y: e.clientY }; el.style.cursor = "grabbing"; return; }
			if (e.button !== 0) return;
			var t = PE.tool(); if (t.down) { current = t; t.down(ev2(e)); }
		});
		el.addEventListener("pointermove", function (e) {
			var r = el.getBoundingClientRect(); PE.ptr.x = e.clientX - r.left; PE.ptr.y = e.clientY - r.top; PE.ptr.inside = true;
			if (down[e.pointerId]) down[e.pointerId] = { x: e.clientX, y: e.clientY };
			if (gesture) { moveGesture(); return; }
			if (panning) { PE.panBy(e.clientX - panning.x, e.clientY - panning.y); panning = { x: e.clientX, y: e.clientY }; return; }
			var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e]; if (!evs.length) evs = [e];
			if (current && current.move && down[e.pointerId]) evs.forEach(function (c) { current.move(ev2(c)); });
			else { var t = PE.tool(); if (t.hover) t.hover(ev2(e)); }
			PE.emit("pointer", PE.toDoc(e.clientX, e.clientY)); PE.invalidateOverlay();
		});
		function end(e) {
			if (!down[e.pointerId]) return; delete down[e.pointerId];
			if (gesture) { if (Object.keys(down).length < 2) gesture = null; return; }
			if (panning) { panning = null; el.style.cursor = ""; return; }
			if (current) { var t = current; current = null; if (t.up) t.up(ev2(e)); }
			if (PE.focusText) setTimeout(PE.focusText, 0);
			PE.invalidateOverlay();
		}
		el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
		el.addEventListener("pointerleave", function () { PE.ptr.inside = false; PE.invalidateOverlay(); });
		el.addEventListener("dblclick", function (e) { var t = PE.tool(); if (t.dbl && PE.doc) t.dbl(ev2(e)); });
		el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
		el.addEventListener("wheel", function (e) {
			if (!PE.doc) return; e.preventDefault(); var r = el.getBoundingClientRect();
			if (e.ctrlKey || e.metaKey) PE.setZoom(PE.view.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top);
			else if (e.altKey) PE.setZoom(PE.view.zoom * Math.exp(-e.deltaY * 0.004), e.clientX - r.left, e.clientY - r.top);
			else PE.panBy(-(e.shiftKey ? e.deltaY : e.deltaX), -(e.shiftKey ? 0 : e.deltaY));
		}, { passive: false });
	};
	function startGesture() { var k = Object.keys(down), a = down[k[0]], b = down[k[1]]; gesture = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, z: PE.view.zoom }; }
	function moveGesture() {
		var k = Object.keys(down); if (k.length < 2) return; var a = down[k[0]], b = down[k[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = PE.els.over.getBoundingClientRect();
		PE.panBy(cx - gesture.cx, cy - gesture.cy); PE.setZoom(gesture.z * d / gesture.d, cx - r.left, cy - r.top); gesture.cx = cx; gesture.cy = cy;
	}

	/* ---------- overlay: selection ants, tool overlays, brush cursor ---------- */
	var ants = { key: "", a: null, b: null }, phase = 0;
	function buildAnts() {
		var v = PE.view, s = PE.sel; if (!s) return null; var key = [s.ver, v.zoom, v.px, v.py, v.w, v.h, v.dpr].join(","); if (ants.key === key) return ants;
		var W = Math.round(v.w * v.dpr), Hh = Math.round(v.h * v.dpr), t = PE.tmp("ants", W, Hh), x = t.getContext("2d"), z = v.zoom * v.dpr;
		x.setTransform(z, 0, 0, z, v.px * v.dpr, v.py * v.dpr); x.imageSmoothingEnabled = z < 2; x.drawImage(s.c, 0, 0);
		var src = x.getImageData(0, 0, W, Hh).data, ia = new ImageData(W, Hh), ib = new ImageData(W, Hh), da = ia.data, db = ib.data;
		for (var y = 0; y < Hh; y++) for (var xx = 0; xx < W; xx++) {
			var i = (y * W + xx) * 4; if (src[i + 3] <= 127) continue;
			var edge = xx === 0 || y === 0 || xx === W - 1 || y === Hh - 1 || src[i - 4 + 3] <= 127 || src[i + 4 + 3] <= 127 || src[i - W * 4 + 3] <= 127 || src[i + W * 4 + 3] <= 127; if (!edge) continue;
			var on = ((xx + y) >> 2) & 1, o = on ? 255 : 0, o2 = on ? 0 : 255;
			da[i] = da[i + 1] = da[i + 2] = o; da[i + 3] = 255; db[i] = db[i + 1] = db[i + 2] = o2; db[i + 3] = 255;
		}
		var ca = mk(W, Hh), cb = mk(W, Hh); ca.getContext("2d").putImageData(ia, 0, 0); cb.getContext("2d").putImageData(ib, 0, 0); ants = { key: key, a: ca, b: cb }; return ants;
	}
	setInterval(function () { if (PE.sel && !document.hidden) { phase ^= 1; PE.invalidateOverlay(); } }, 450);
	PE.drawOverlay = function () {
		var c = PE.els.over, v = PE.view; if (!c || !v.w) return; var W = Math.round(v.w * v.dpr), Hh = Math.round(v.h * v.dpr);
		if (c.width !== W || c.height !== Hh) { c.width = W; c.height = Hh; }
		var x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, Hh); if (!PE.doc) return;
		if (PE.sel) { var a = buildAnts(); if (a) x.drawImage(phase ? a.b : a.a, 0, 0); }
		x.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
		var t = PE.tool(); if (t && t.overlay) t.overlay(x, v);
		if (PE.guides && PE.guides.length) { x.strokeStyle = "#ff3df0"; x.lineWidth = 1; x.beginPath(); PE.guides.forEach(function (g) { if (g.v != null) { var sx = Math.round(g.v * v.zoom + v.px) + 0.5; x.moveTo(sx, 0); x.lineTo(sx, v.h); } else { var sy = Math.round(g.h * v.zoom + v.py) + 0.5; x.moveTo(0, sy); x.lineTo(v.w, sy); } }); x.stroke(); }
		if (PE.ptr.inside && t && t.cursorSize && !PE.spaceHeld) {
			var r = t.cursorSize() * v.zoom / 2; if (r > 1) { x.lineWidth = 1; x.strokeStyle = "rgba(0,0,0,0.85)"; x.beginPath(); x.arc(PE.ptr.x, PE.ptr.y, r, 0, 6.2832); x.stroke(); x.strokeStyle = "rgba(255,255,255,0.9)"; x.beginPath(); x.arc(PE.ptr.x, PE.ptr.y, r + 1, 0, 6.2832); x.stroke(); }
		}
	};
	PE.handleBox = function (x, cx, cy, s) { x.fillStyle = "#fff"; x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.beginPath(); x.rect(cx - s, cy - s, s * 2, s * 2); x.fill(); x.stroke(); };

	/* ---------- small helpers ---------- */
	function saveOpt(id) { PE.emit("opts", id); }
	PE.sample = function (x, y, n, merged) {
		var h = Math.floor(n / 2), c = mk(n, n), cx = c.getContext("2d"), L = PE.active();
		if (merged || !L) PE.doc.layers.forEach(function (l) { PE.drawLayer(cx, l, [1, 0, 0, 1, -Math.floor(x) + h, -Math.floor(y) + h], "smp", n, n); });
		else PE.drawLayer(cx, L, [1, 0, 0, 1, -Math.floor(x) + h, -Math.floor(y) + h], "smp", n, n);
		var d = cx.getImageData(0, 0, n, n).data, r = 0, g = 0, b = 0, a = 0, k = n * n; for (var i = 0; i < d.length; i += 4) { var al = d[i + 3]; r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; }
		if (!a) return null; return { r: r / a, g: g / a, b: b / a, a: a / k / 255 };
	};
	/* composite a document-space canvas onto the active layer (or its mask), restricted to the selection */
	PE.paintInto = function (L, src, dx, dy, o) {
		o = o || {}; var cv = (o.target === "mask" && L.mask) ? L.mask : L.canvas, og = PE.origin(L), x = cv.getContext("2d"), w = src.width, h = src.height, s = src;
		if (PE.sel) { s = PE.tmp("pi", w, h); s.getContext("2d").drawImage(src, 0, 0); PE.restrictToSel(s.getContext("2d"), Math.round(dx), Math.round(dy), w, h); }
		x.save(); x.globalAlpha = o.alpha == null ? 1 : o.alpha; x.globalCompositeOperation = o.erase ? "destination-out" : "source-over"; x.drawImage(s, Math.round(dx) - og.x, Math.round(dy) - og.y); x.restore(); L.rev++;
	};

	/* ---------- Move + free transform ---------- */
	var HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
	function handleScreen(L, hd) {
		var c = Math.cos(L.rot), s = Math.sin(L.rot), hw = L.canvas.width * L.sx / 2, hh = L.canvas.height * L.sy / 2, lx = hd[0] * hw, ly = hd[1] * hh;
		return PE.toScreen(L.cx + c * lx - s * ly, L.cy + s * lx + c * ly);
	}
	var mv = null;
	function pickTarget(hit, L, groupsOn) {
		if (!groupsOn) return hit; var anc = PE.ancestorsOf(hit); if (!anc.length) return hit; if (L === hit) return hit; if (L && anc.indexOf(L) >= 0) return L;
		if (L && PE.topGroupOf(L) === PE.topGroupOf(hit)) return hit; return PE.topGroupOf(hit);
	}
	PE.defTool({ id: "move", name: "Move / Transform", key: "v", icon: "✥", opts: { auto: true, handles: true, snap: true, groups: true },
		ui: [{ k: "auto", label: "Pick layer on click", type: "check" }, { k: "groups", label: "Pick the whole group", type: "check" }, { k: "handles", label: "Transform handles", type: "check" }, { k: "snap", label: "Snap to canvas edges", type: "check" }, { type: "button", label: "✂ Remove background (AI)", act: function () { PE.aiRemoveBackground(); } }],
		hint: "Drag to move. Drag a square handle to resize, just outside a corner to rotate (Shift = snap / keep proportions). Arrow keys nudge.",
		down: function (e) {
			var L = PE.active(), o = PE.opt.move, z = PE.view.zoom;
			if (L && o.handles && L.visible && !PE.isGroup(L)) {
				for (var i = 0; i < 8; i++) { var s = handleScreen(L, HANDLES[i]); if (Math.hypot(s.x - (e.sx - PE.els.over.getBoundingClientRect().left), s.y - (e.sy - PE.els.over.getBoundingClientRect().top)) < 9) { mv = { kind: "scale", L: L, h: HANDLES[i], sx0: L.sx, sy0: L.sy, cx0: L.cx, cy0: L.cy, rot: L.rot, p0: e }; return; } }
				var rect = PE.els.over.getBoundingClientRect(), px = e.sx - rect.left, py = e.sy - rect.top;
				var corners = [0, 2, 4, 6].map(function (k) { return handleScreen(L, HANDLES[k]); });
				for (i = 0; i < 4; i++) { var dd = Math.hypot(corners[i].x - px, corners[i].y - py); if (dd >= 9 && dd < 30 && !PE.layerAtPoint(L, e.x, e.y)) { mv = { kind: "rot", L: L, a0: Math.atan2(e.y - L.cy, e.x - L.cx), rot0: L.rot }; return; } }
			}
			var hit = o.auto ? PE.layerAt(e.x, e.y) : null;
			if (hit && hit !== L && PE.isBackdrop(hit)) hit = null;
			if (hit) hit = pickTarget(hit, L, o.groups);
			if (o.auto && hit && hit !== L) { PE.setActive(hit.id); L = hit; }
			else if (o.auto && !hit && !(L && PE.layerAtPoint(L, e.x, e.y))) { mv = null; return; }
			if (!L || L.locked) { if (L && L.locked) PE.toast("This layer is locked"); return; }
			mv = { kind: "move", L: L, cx0: L.cx, cy0: L.cy, p0: e, moved: false, grp: PE.isGroup(L) ? PE.descendants(L).filter(function (k) { return !PE.isGroup(k); }).map(function (k) { return [k, k.cx, k.cy]; }) : null };
		},
		move: function (e) {
			if (!mv) return; var L = mv.L;
			if (mv.kind === "move") {
				var dx = Math.round(e.x - mv.p0.x), dy = Math.round(e.y - mv.p0.y); if (e.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
				if (mv.grp) { mv.grp.forEach(function (g) { g[0].cx = g[1] + dx; g[0].cy = g[2] + dy; }); PE.guides = []; mv.moved = true; PE.invalidate(); return; }
				L.cx = mv.cx0 + dx; L.cy = mv.cy0 + dy; PE.guides = [];
				if (PE.opt.move.snap && !e.ctrl) {
					var b = PE.bounds(L), th = 6 / PE.view.zoom, d = PE.doc, ax = [[b.x, 0], [b.x + b.w, d.w], [b.x + b.w / 2, d.w / 2], [b.x, d.w / 2 - b.w / 2 + b.x - b.x]];
					[[b.x, 0, "l"], [b.x + b.w, d.w, "r"], [b.x + b.w / 2, d.w / 2, "c"]].forEach(function (q) { if (Math.abs(q[0] - q[1]) < th) { L.cx += q[1] - q[0]; PE.guides.push({ v: q[1] }); } });
					b = PE.bounds(L); [[b.y, 0], [b.y + b.h, d.h], [b.y + b.h / 2, d.h / 2]].forEach(function (q) { if (Math.abs(q[0] - q[1]) < th) { L.cy += q[1] - q[0]; PE.guides.push({ h: q[1] }); } });
				}
				mv.moved = true; PE.invalidate();
			} else if (mv.kind === "rot") {
				var a = Math.atan2(e.y - L.cy, e.x - L.cx), r = mv.rot0 + (a - mv.a0); if (e.shift) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12); L.rot = r; mv.moved = true; PE.invalidate();
			} else {
				var c = Math.cos(mv.rot), s = Math.sin(mv.rot), dx2 = e.x - mv.cx0, dy2 = e.y - mv.cy0, lx = c * dx2 + s * dy2, ly = -s * dx2 + c * dy2, hd = mv.h, W0 = L.canvas.width * Math.abs(mv.sx0), H0 = L.canvas.height * Math.abs(mv.sy0);
				var ax = e.alt ? 0 : -hd[0] * W0 / 2, ay = e.alt ? 0 : -hd[1] * H0 / 2, nw = hd[0] ? Math.max(2, (lx - ax) * hd[0] * (e.alt ? 2 : 1)) : W0, nh = hd[1] ? Math.max(2, (ly - ay) * hd[1] * (e.alt ? 2 : 1)) : H0;
				var uniform = (hd[0] && hd[1]) ? !e.shift : e.shift;
				if (uniform && hd[0] && hd[1]) { var f = Math.max(nw / W0, nh / H0); nw = W0 * f; nh = H0 * f; } else if (uniform) { var f2 = hd[0] ? nw / W0 : nh / H0; nw = W0 * f2; nh = H0 * f2; }
				var ncx = e.alt ? 0 : ax + hd[0] * nw / 2, ncy = e.alt ? 0 : ay + hd[1] * nh / 2;
				L.sx = Math.sign(mv.sx0 || 1) * nw / L.canvas.width; L.sy = Math.sign(mv.sy0 || 1) * nh / L.canvas.height; L.cx = mv.cx0 + c * ncx - s * ncy; L.cy = mv.cy0 + s * ncx + c * ncy; mv.moved = true; PE.invalidate();
			}
		},
		up: function () { var m = mv; mv = null; PE.guides = []; if (m && m.moved) { PE.touch(m.L); PE.commit(m.kind === "move" ? (m.grp ? "Move group" : "Move layer") : m.kind === "rot" ? "Rotate layer" : "Resize layer"); } PE.invalidateOverlay(); },
		abort: function () { if (mv) { var m = mv; m.L.cx = m.cx0 || m.L.cx; mv = null; } },
		overlay: function (x, v) {
			var L = PE.active(); if (!L || !PE.opt.move.handles || !L.visible) return;
			if (PE.isGroup(L)) { var gb = PE.groupBounds(L), g0 = PE.toScreen(gb.x, gb.y), g1 = PE.toScreen(gb.x + gb.w, gb.y + gb.h); x.setLineDash([6, 4]); x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.strokeRect(g0.x, g0.y, g1.x - g0.x, g1.y - g0.y); x.setLineDash([]); return; }
			var pts = PE.corners(L).map(function (p) { return PE.toScreen(p[0], p[1]); }); x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke();
			for (var i = 0; i < 8; i++) { var s = handleScreen(L, HANDLES[i]); PE.handleBox(x, s.x, s.y, 4.5); }
		} });
	PE.isBackdrop = function (L) { var d = PE.doc, b = PE.bounds(L); return PE.indexOf(L) === 0 && PE.isIdentity(L) && b.x <= 1 && b.y <= 1 && b.x + b.w >= d.w - 1 && b.y + b.h >= d.h - 1; };
	PE.layerAtPoint = function (L, x, y) { if (PE.isGroup(L)) { var gb = PE.groupBounds(L); return x >= gb.x && y >= gb.y && x <= gb.x + gb.w && y <= gb.y + gb.h; } var p = PE.toLayerPt(L, x, y); return p.x >= 0 && p.y >= 0 && p.x < L.canvas.width && p.y < L.canvas.height; };
	PE.nudge = function (dx, dy) { var L = PE.active(); if (!L || L.locked) return; PE.translate(L, dx, dy); PE.touch(L); clearTimeout(PE._nt); PE._nt = setTimeout(function () { PE.commit("Move layer"); }, 350); };

	/* ---------- selection tools ---------- */
	function selMode(e) { var o = PE.opt[PE.toolId].mode || "new"; return e.shift && e.alt ? "int" : e.shift ? "add" : e.alt ? "sub" : o; }
	var selDrag = null;
	function rectOf(a, b, e, square) { var x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y; if (square) { var d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * d; y1 = y0 + Math.sign(y1 - y0 || 1) * d; } if (e && e.alt && false) { x0 = 2 * a.x - x1; y0 = 2 * a.y - y1; } return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; }
	PE.defTool({ id: "marquee", name: "Rectangular / Elliptical Select", key: "m", icon: "⬚", opts: { shape: "rect", mode: "new", feather: 0 },
		ui: [{ k: "shape", label: "Shape", type: "seg", options: [["rect", "Rectangle"], ["ellipse", "Ellipse"]] }, { k: "mode", label: "Mode", type: "seg", options: [["new", "New"], ["add", "Add"], ["sub", "Subtract"], ["int", "Intersect"]] }, { k: "feather", label: "Feather", type: "range", min: 0, max: 100, step: 1, unit: "px" }],
		hint: "Drag to select. Shift = square / add, Alt = subtract. Drag inside an existing selection to move it. Click to deselect.",
		down: function (e) {
			var inside = PE.sel && PE.opt.marquee.mode === "new" && !e.shift && !e.alt && PE.selMask()[Math.max(0, Math.min(PE.doc.h - 1, Math.floor(e.y))) * PE.doc.w + Math.max(0, Math.min(PE.doc.w - 1, Math.floor(e.x)))] > 127;
			selDrag = inside ? { move: true, p0: e, base: PE.clone(PE.sel.c) } : { a: e, b: e, mode: selMode(e), e: e };
		},
		move: function (e) { if (!selDrag) return; if (selDrag.move) { var dx = Math.round(e.x - selDrag.p0.x), dy = Math.round(e.y - selDrag.p0.y), x = PE.sel.c.getContext("2d"); x.clearRect(0, 0, PE.doc.w, PE.doc.h); x.drawImage(selDrag.base, dx, dy); PE.selChanged(); } else { selDrag.b = e; selDrag.sq = e.shift && selDrag.mode === "new"; PE.invalidateOverlay(); } },
		up: function (e) {
			var d = selDrag; selDrag = null; if (!d) return;
			if (d.move) { PE.commit("Move selection"); return; }
			var o = PE.opt.marquee, r = rectOf(d.a, d.b, e, d.sq); if (r.w < 2 && r.h < 2) { if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } return; }
			PE.selShape(function (x) { if (o.shape === "ellipse") { x.beginPath(); x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 6.2832); x.fill(); } else x.fillRect(r.x, r.y, r.w, r.h); }, d.mode);
			if (o.feather > 0) PE.selFeather(o.feather); PE.commit("Select");
		},
		overlay: function (x) { if (!selDrag || selDrag.move) return; var r = rectOf(selDrag.a, selDrag.b, null, selDrag.sq), s0 = PE.toScreen(r.x, r.y), z = PE.view.zoom; x.setLineDash([5, 4]); x.strokeStyle = "#fff"; x.lineWidth = 1; if (PE.opt.marquee.shape === "ellipse") { x.beginPath(); x.ellipse(s0.x + r.w * z / 2, s0.y + r.h * z / 2, r.w * z / 2, r.h * z / 2, 0, 0, 6.2832); x.stroke(); } else x.strokeRect(s0.x, s0.y, r.w * z, r.h * z); x.setLineDash([]); },
		cancel: function () { selDrag = null; } });
	var lasso = null;
	function lassoDone(mode) { var pts = lasso.pts; lasso = null; if (pts.length < 3) { PE.invalidateOverlay(); return; } PE.selShape(function (x) { x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.fill(); }, mode); if (PE.opt.lasso.feather > 0) PE.selFeather(PE.opt.lasso.feather); PE.commit("Lasso select"); PE.invalidateOverlay(); }
	PE.defTool({ id: "lasso", name: "Lasso / Polygon Select", key: "l", icon: "➰", opts: { style: "free", mode: "new", feather: 0 },
		ui: [{ k: "style", label: "Style", type: "seg", options: [["free", "Freehand"], ["poly", "Polygon"]] }, { k: "mode", label: "Mode", type: "seg", options: [["new", "New"], ["add", "Add"], ["sub", "Subtract"], ["int", "Intersect"]] }, { k: "feather", label: "Feather", type: "range", min: 0, max: 100, step: 1, unit: "px" }],
		hint: "Freehand: drag around the area. Polygon: click each corner, double-click or press Enter to close.",
		down: function (e) {
			var o = PE.opt.lasso;
			if (o.style === "poly") { if (!lasso) lasso = { pts: [], mode: selMode(e), poly: true }; var f = lasso.pts[0]; if (f && Math.hypot((f.x - e.x) * PE.view.zoom, (f.y - e.y) * PE.view.zoom) < 8 && lasso.pts.length > 2) { lassoDone(lasso.mode); return; } lasso.pts.push({ x: e.x, y: e.y }); lasso.cur = e; PE.invalidateOverlay(); }
			else lasso = { pts: [{ x: e.x, y: e.y }], mode: selMode(e), free: true };
		},
		move: function (e) { if (lasso && lasso.free) { lasso.pts.push({ x: e.x, y: e.y }); PE.invalidateOverlay(); } },
		hover: function (e) { if (lasso && lasso.poly) { lasso.cur = e; PE.invalidateOverlay(); } },
		up: function () { if (lasso && lasso.free) lassoDone(lasso.mode); },
		dbl: function () { if (lasso && lasso.poly) { lasso.pts.pop(); lassoDone(lasso.mode); } },
		enter: function () { if (lasso && lasso.poly) lassoDone(lasso.mode); }, cancel: function () { lasso = null; },
		overlay: function (x) { if (!lasso) return; x.strokeStyle = "#fff"; x.setLineDash([5, 4]); x.lineWidth = 1; x.beginPath(); lasso.pts.forEach(function (p, i) { var s = PE.toScreen(p.x, p.y); i ? x.lineTo(s.x, s.y) : x.moveTo(s.x, s.y); }); if (lasso.poly && lasso.cur) { var c = PE.toScreen(lasso.cur.x, lasso.cur.y); x.lineTo(c.x, c.y); } x.stroke(); x.setLineDash([]); } });
	PE.defTool({ id: "wand", name: "Magic Wand (select by colour)", key: "w", icon: "✨", opts: { tol: 32, contiguous: true, merged: false, mode: "new", smooth: true },
		ui: [{ k: "tol", label: "Tolerance", type: "range", min: 0, max: 255, step: 1 }, { k: "contiguous", label: "Contiguous", type: "check" }, { k: "merged", label: "All layers", type: "check" }, { k: "smooth", label: "Smooth edges", type: "check" }, { k: "mode", label: "Mode", type: "seg", options: [["new", "New"], ["add", "Add"], ["sub", "Subtract"], ["int", "Intersect"]] }],
		hint: "Click a colour to select it. Raise Tolerance to include similar colours. Great for removing a plain background.",
		down: function (e) {
			var o = PE.opt.wand, d = PE.doc, L = PE.active(), mask, w, h;
			if (o.merged || !L) { var c = PE.flatten(), id = c.getContext("2d").getImageData(0, 0, c.width, c.height); mask = P.floodMask(id.data, c.width, c.height, e.x, e.y, o.tol, o.contiguous); w = c.width; h = c.height; }
			else { var og = PE.origin(L), lp = PE.toLayerPt(L, e.x, e.y); if (!PE.isIdentity(L)) { PE.bake(L); og = PE.origin(L); lp = { x: e.x - og.x, y: e.y - og.y }; } var data = PE.layerData(L); var m = P.floodMask(data.data, data.width, data.height, lp.x, lp.y, o.tol, o.contiguous); mask = new Uint8Array(d.w * d.h); for (var y = 0; y < data.height; y++) { var dy = y + og.y; if (dy < 0 || dy >= d.h) continue; for (var x = 0; x < data.width; x++) { var dx = x + og.x; if (dx >= 0 && dx < d.w) mask[dy * d.w + dx] = m[y * data.width + x]; } } w = d.w; h = d.h; }
			if (o.smooth) mask = P.featherMask(P.growShrinkMask(mask, w, h, 0, true), w, h, 1.5);
			PE.selFromMask(mask, selMode(e)); PE.commit("Magic wand");
		} });

	/* ---------- crop ---------- */
	var crop = null, cdrag = null;
	function cropRatio() { var r = PE.opt.crop.ratio; if (r === "free") return 0; if (r === "orig") return PE.doc.w / PE.doc.h; var p = r.split(":"); return p[0] / p[1]; }
	PE.cropReset = function () { var d = PE.doc; crop = d ? { x: 0, y: 0, w: d.w, h: d.h } : null; PE.invalidateOverlay(); };
	PE.cropApply = function () { if (crop && (crop.w < d().w || crop.h < d().h || crop.x || crop.y)) PE.cropTo(crop.x, crop.y, crop.w, crop.h); crop = null; PE.setTool("move"); };
	function d() { return PE.doc; }
	PE.defTool({ id: "crop", name: "Crop", key: "c", icon: "⛶", opts: { ratio: "free" },
		ui: [{ k: "ratio", label: "Shape", type: "select", options: [["free", "Free"], ["orig", "Original ratio"], ["1:1", "1:1 Square"], ["4:3", "4:3"], ["3:2", "3:2"], ["16:9", "16:9"], ["9:16", "9:16"], ["4:5", "4:5"], ["2:1", "2:1"]] }, { type: "button", label: "✓ Apply crop (Enter)", act: function () { PE.cropApply(); } }, { type: "button", label: "Reset", act: function () { PE.cropReset(); } }],
		hint: "Drag the box or its handles, then press Enter (or Apply). Everything outside is removed.",
		enter: function () { PE.cropApply(); }, cancel: function () { crop = null; cdrag = null; }, activate: function () { PE.cropReset(); },
		down: function (e) {
			if (!crop) PE.cropReset(); var z = PE.view.zoom, r = PE.els.over.getBoundingClientRect(), px = e.sx - r.left, py = e.sy - r.top, s0 = PE.toScreen(crop.x, crop.y), s1 = PE.toScreen(crop.x + crop.w, crop.y + crop.h), t = 9;
			var hx = Math.abs(px - s0.x) < t ? -1 : Math.abs(px - s1.x) < t ? 1 : (Math.abs(px - (s0.x + s1.x) / 2) < t ? 0 : null), hy = Math.abs(py - s0.y) < t ? -1 : Math.abs(py - s1.y) < t ? 1 : (Math.abs(py - (s0.y + s1.y) / 2) < t ? 0 : null);
			var inX = px > s0.x - t && px < s1.x + t, inY = py > s0.y - t && py < s1.y + t;
			if (hx !== null && hy !== null && inX && inY && !(hx === 0 && hy === 0)) cdrag = { kind: "h", hx: hx, hy: hy, c0: Object.assign({}, crop), p0: e };
			else if (px > s0.x && px < s1.x && py > s0.y && py < s1.y) cdrag = { kind: "move", c0: Object.assign({}, crop), p0: e };
			else { crop = { x: e.x, y: e.y, w: 1, h: 1 }; cdrag = { kind: "new", p0: e }; }
		},
		move: function (e) {
			if (!cdrag) return; var dd = PE.doc, ratio = cropRatio(), c0 = cdrag.c0;
			if (cdrag.kind === "move") { crop.x = Math.round(Math.max(0, Math.min(dd.w - c0.w, c0.x + e.x - cdrag.p0.x))); crop.y = Math.round(Math.max(0, Math.min(dd.h - c0.h, c0.y + e.y - cdrag.p0.y))); }
			else {
				var x0, y0, x1, y1;
				if (cdrag.kind === "new") { x0 = cdrag.p0.x; y0 = cdrag.p0.y; x1 = e.x; y1 = e.y; }
				else { x0 = c0.x; y0 = c0.y; x1 = c0.x + c0.w; y1 = c0.y + c0.h; if (cdrag.hx === -1) x0 = e.x; if (cdrag.hx === 1) x1 = e.x; if (cdrag.hy === -1) y0 = e.y; if (cdrag.hy === 1) y1 = e.y; }
				x0 = Math.max(0, Math.min(dd.w, x0)); x1 = Math.max(0, Math.min(dd.w, x1)); y0 = Math.max(0, Math.min(dd.h, y0)); y1 = Math.max(0, Math.min(dd.h, y1));
				var w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
				if (ratio) { if (w / (h || 1) > ratio) w = h * ratio; else h = w / ratio; }
				var nx = sx > 0 ? x0 : x0 - w, ny = sy > 0 ? y0 : y0 - h; if (cdrag.kind === "h" && ratio) { if (cdrag.hx === -1) nx = x1 - w; if (cdrag.hy === -1) ny = y1 - h; if (cdrag.hx === 0) nx = c0.x + (c0.w - w) / 2; if (cdrag.hy === 0) ny = c0.y + (c0.h - h) / 2; }
				crop = { x: Math.round(Math.max(0, nx)), y: Math.round(Math.max(0, ny)), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
			}
			PE.emit("cropinfo", crop); PE.invalidateOverlay();
		},
		up: function () { cdrag = null; },
		overlay: function (x, v) {
			if (!crop) return; var a = PE.toScreen(crop.x, crop.y), b = PE.toScreen(crop.x + crop.w, crop.y + crop.h), d0 = PE.toScreen(0, 0), d1 = PE.toScreen(PE.doc.w, PE.doc.h);
			x.fillStyle = "rgba(0,0,0,0.55)"; x.fillRect(d0.x, d0.y, d1.x - d0.x, a.y - d0.y); x.fillRect(d0.x, b.y, d1.x - d0.x, d1.y - b.y); x.fillRect(d0.x, a.y, a.x - d0.x, b.y - a.y); x.fillRect(b.x, a.y, d1.x - b.x, b.y - a.y);
			x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); x.strokeStyle = "rgba(255,255,255,0.4)"; x.lineWidth = 1; x.beginPath();
			for (var i = 1; i < 3; i++) { x.moveTo(a.x + (b.x - a.x) * i / 3, a.y); x.lineTo(a.x + (b.x - a.x) * i / 3, b.y); x.moveTo(a.x, a.y + (b.y - a.y) * i / 3); x.lineTo(b.x, a.y + (b.y - a.y) * i / 3); } x.stroke();
			[[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y], [(a.x + b.x) / 2, a.y], [(a.x + b.x) / 2, b.y], [a.x, (a.y + b.y) / 2], [b.x, (a.y + b.y) / 2]].forEach(function (p) { PE.handleBox(x, p[0], p[1], 4); });
			x.fillStyle = "rgba(0,0,0,0.7)"; x.font = "12px system-ui,sans-serif"; var tx = crop.w + " × " + crop.h; x.fillRect(a.x, a.y - 22, x.measureText(tx).width + 12, 20); x.fillStyle = "#fff"; x.fillText(tx, a.x + 6, a.y - 8);
		} });

	/* ---------- painting engine: brush, eraser, clone stamp, retouch ---------- */
	var stroke = null;
	function softDab(x, r, hard, col, cx, cy) {
		if (hard >= 0.98) { x.fillStyle = col.solid; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill(); return; }
		var g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col.solid); g.addColorStop(Math.max(0.01, hard), col.solid); g.addColorStop(1, col.clear); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
	}
	function beginStroke(kind, e) {
		var L = PE.active(); var mask = L && L.editMask && L.mask; if (!PE.prepare(L)) return false;
		var o = PE.opt[kind === "eraser" ? "eraser" : kind === "clone" ? "clone" : kind === "retouch" ? "retouch" : "brush"], cv = mask ? L.mask : L.canvas, og = PE.origin(L), erase = kind === "eraser";
		var hex = mask ? "#000000" : (erase ? "#000000" : PE.fg);
		stroke = { kind: kind, L: L, o: o, og: og, target: mask ? "mask" : "pixel", buf: mk(cv.width, cv.height), erase: erase, alpha: (o.opacity == null ? 100 : o.opacity) / 100, col: { solid: rgba(hex, 1), clear: rgba(hex, 0) }, last: null, rem: 0, sm: { x: e.x, y: e.y }, n: 0 };
		L.live = { buf: stroke.buf, erase: erase, alpha: stroke.alpha, target: stroke.target };
		if (kind === "clone") { if (!PE.cloneSrc) { PE.toast("Alt-click first to set the source point"); L.live = null; stroke = null; return false; } stroke.snap = PE.clone(cv); stroke.off = stroke.aligned ? null : null; stroke.off = { x: PE.cloneSrc.x - e.x, y: PE.cloneSrc.y - e.y }; if (!o.aligned) stroke.start = { x: PE.cloneSrc.x, y: PE.cloneSrc.y, px: e.x, py: e.y }; }
		if (kind === "retouch") { stroke.proc = retouchCopy(cv, o); stroke.alpha = Math.max(0.05, o.strength / 100); L.live.alpha = stroke.alpha; }
		return true;
	}
	function retouchCopy(cv, o) {
		var c = PE.clone(cv), x = c.getContext("2d"), id = x.getImageData(0, 0, c.width, c.height);
		if (o.mode === "blur") P.gaussianBlur(id.data, id.width, id.height, 2 + o.size / 12); else if (o.mode === "sharpen") P.unsharp(id.data, id.width, id.height, 220, 1.2, 0); else if (o.mode === "dodge") P.exposure(id.data, 0.5, 0, 1); else if (o.mode === "burn") P.exposure(id.data, -0.5, 0, 1); else if (o.mode === "saturate") P.vibrance(id.data, 60); else if (o.mode === "desaturate") P.hueSat(id.data, 0, -70, 0);
		x.putImageData(id, 0, 0); return c;
	}
	function dab(px, py, size) {
		var s = stroke, L = s.L, r = Math.max(0.5, size / 2), lx = px - s.og.x, ly = py - s.og.y, bx = s.buf.getContext("2d"), hard = (s.o.hardness == null ? 100 : s.o.hardness) / 100;
		if (!PE.sel && s.kind !== "clone" && s.kind !== "retouch") { softDab(bx, r, hard, s.col, lx, ly); return; }
		var D = Math.ceil(r * 2) + 2, t = PE.tmp("dab", D, D), tx = t.getContext("2d"), c = D / 2;
		if (s.kind === "clone" || s.kind === "retouch") {
			var src = s.kind === "clone" ? s.snap : s.proc, sx, sy; if (s.kind === "clone") { var ox = s.o.aligned ? s.off.x : s.start.x - s.start.px, oy = s.o.aligned ? s.off.y : s.start.y - s.start.py; sx = px + ox - s.og.x; sy = py + oy - s.og.y; } else { sx = lx; sy = ly; }
			tx.drawImage(src, sx - c, sy - c, D, D, 0, 0, D, D); tx.globalCompositeOperation = "destination-in"; softDab(tx, r, Math.min(hard, 0.9), { solid: "#000", clear: "rgba(0,0,0,0)" }, c, c); tx.globalCompositeOperation = "source-over";
		} else softDab(tx, r, hard, s.col, c, c);
		if (PE.sel) PE.restrictToSel(tx, Math.round(px - c), Math.round(py - c), D, D);
		bx.drawImage(t, Math.round(lx - c), Math.round(ly - c));
	}
	function strokeTo(e, first) {
		var s = stroke, o = s.o, sm = (o.smooth || 0) / 100;
		var tx = e.x, ty = e.y; if (sm > 0 && !first) { s.sm.x += (e.x - s.sm.x) * (1 - sm * 0.9); s.sm.y += (e.y - s.sm.y) * (1 - sm * 0.9); tx = s.sm.x; ty = s.sm.y; }
		var size = o.size * (o.pressure && e.pen ? Math.max(0.15, e.pressure) : 1), sp = Math.max(1, o.size * (s.kind === "brush" || s.kind === "eraser" ? 0.1 : 0.2));
		if (first || !s.last) { dab(tx, ty, size); s.last = { x: tx, y: ty }; PE.invalidate(); return; }
		var dx = tx - s.last.x, dy = ty - s.last.y, len = Math.hypot(dx, dy), pos = sp - s.rem;
		while (pos <= len) { dab(s.last.x + dx * pos / len, s.last.y + dy * pos / len, size); pos += sp; }
		s.rem = len - (pos - sp); s.last = { x: tx, y: ty }; PE.invalidate();
	}
	function endStroke(label) {
		var s = stroke; if (!s) return; stroke = null; var L = s.L, cv = s.target === "mask" ? L.mask : L.canvas, x = cv.getContext("2d");
		x.save(); x.globalAlpha = s.alpha; x.globalCompositeOperation = s.erase ? "destination-out" : "source-over"; x.drawImage(s.buf, 0, 0); x.restore(); L.live = null; L.rev++; PE.commit(label);
	}
	function paintTool(id, name, key, icon, kind, opts, ui, extra) {
		var t = { id: id, name: name, key: key, icon: icon, opts: opts, ui: ui, hint: "Drag to paint. [ and ] change the size, Shift-click draws a straight line from the last point.",
			cursorSize: function () { return PE.opt[id].size; },
			down: function (e) {
				var o = PE.opt[id]; if (kind === "clone" && e.alt) { PE.cloneSrc = { x: e.x, y: e.y }; PE.toast("Clone source set"); PE.invalidateOverlay(); return; }
				if (!beginStroke(kind, e)) return;
				if (e.shift && PE.lastPaint && PE.lastPaint.L === PE.active() && kind !== "clone") { stroke.last = { x: PE.lastPaint.x, y: PE.lastPaint.y }; strokeTo(e, false); } else strokeTo(e, true);
			},
			move: function (e) { if (stroke) strokeTo(e, false); },
			up: function (e) { if (stroke) { PE.lastPaint = { L: stroke.L, x: e.x, y: e.y }; endStroke(name.split(" ")[0]); } },
			abort: function () { if (stroke) { stroke.L.live = null; stroke = null; PE.invalidate(); } }, cancel: function () { if (stroke) { endStroke(name); } } };
		if (extra) for (var k in extra) t[k] = extra[k]; PE.defTool(t);
	}
	var BRUSHUI = [{ k: "size", label: "Size", type: "range", min: 1, max: 500, step: 1, unit: "px" }, { k: "hardness", label: "Hardness", type: "range", min: 0, max: 100, step: 1, unit: "%" }, { k: "opacity", label: "Opacity", type: "range", min: 1, max: 100, step: 1, unit: "%" }, { k: "smooth", label: "Smoothing", type: "range", min: 0, max: 100, step: 1, unit: "%" }, { k: "pressure", label: "Pen pressure", type: "check" }];
	paintTool("brush", "Brush", "b", "🖌", "brush", { size: 24, hardness: 80, opacity: 100, smooth: 0, pressure: true }, BRUSHUI);
	paintTool("eraser", "Eraser", "e", "◌", "eraser", { size: 40, hardness: 90, opacity: 100, smooth: 0, pressure: true }, BRUSHUI);
	paintTool("clone", "Clone Stamp", "s", "⧉", "clone", { size: 40, hardness: 60, opacity: 100, aligned: true }, [BRUSHUI[0], BRUSHUI[1], BRUSHUI[2], { k: "aligned", label: "Aligned", type: "check" }],
		{ hint: "Alt-click to pick the source area, then paint to copy it. Great for removing blemishes and objects.", overlay: function (x) { if (!PE.cloneSrc) return; var s = PE.toScreen(PE.cloneSrc.x, PE.cloneSrc.y); x.strokeStyle = "#ff3d3d"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(s.x - 8, s.y); x.lineTo(s.x + 8, s.y); x.moveTo(s.x, s.y - 8); x.lineTo(s.x, s.y + 8); x.stroke(); } });
	paintTool("retouch", "Retouch (blur / sharpen / dodge / burn)", "r", "💧", "retouch", { size: 40, hardness: 50, strength: 50, mode: "blur" }, [{ k: "mode", label: "Effect", type: "select", options: [["blur", "Blur"], ["sharpen", "Sharpen"], ["dodge", "Lighten (dodge)"], ["burn", "Darken (burn)"], ["saturate", "Saturate"], ["desaturate", "Desaturate"]] }, BRUSHUI[0], BRUSHUI[1], { k: "strength", label: "Strength", type: "range", min: 5, max: 100, step: 1, unit: "%" }],
		{ hint: "Paint to blur, sharpen, lighten, darken or change saturation just where you drag." });

	/* ---------- bucket + gradient ---------- */
	PE.defTool({ id: "bucket", name: "Paint Bucket", key: "k", icon: "🪣", opts: { tol: 24, contiguous: true, merged: false, opacity: 100 },
		ui: [{ k: "tol", label: "Tolerance", type: "range", min: 0, max: 255, step: 1 }, { k: "contiguous", label: "Contiguous", type: "check" }, { k: "merged", label: "Sample all layers", type: "check" }, { k: "opacity", label: "Opacity", type: "range", min: 1, max: 100, step: 1, unit: "%" }],
		hint: "Click an area to fill it with the foreground colour. With a selection active, only the selection is filled.",
		down: function (e) {
			var L = PE.active(), o = PE.opt.bucket, d = PE.doc, mask = L && L.editMask && L.mask; if (!PE.prepare(L)) return; var og = PE.origin(L), w = L.canvas.width, h = L.canvas.height, m;
			if (o.merged) { var c = PE.flatten(), id = c.getContext("2d").getImageData(0, 0, c.width, c.height), dm = P.floodMask(id.data, c.width, c.height, e.x, e.y, o.tol, o.contiguous); m = new Uint8Array(w * h); for (var y = 0; y < h; y++) { var dy = y + og.y; if (dy < 0 || dy >= d.h) continue; for (var x = 0; x < w; x++) { var dx = x + og.x; if (dx >= 0 && dx < d.w) m[y * w + x] = dm[dy * d.w + dx]; } } }
			else { var cv = mask ? L.mask : L.canvas, data = cv.getContext("2d").getImageData(0, 0, w, h); m = P.floodMask(data.data, w, h, e.x - og.x, e.y - og.y, o.tol, o.contiguous); }
			var t = mk(w, h), tx = t.getContext("2d"), id2 = tx.createImageData(w, h), col = P.hexToRgb(mask ? "#000000" : PE.fg), a = id2.data; for (var i = 0; i < m.length; i++) { a[i * 4] = col[0]; a[i * 4 + 1] = col[1]; a[i * 4 + 2] = col[2]; a[i * 4 + 3] = m[i]; } tx.putImageData(id2, 0, 0);
			PE.paintInto(L, t, og.x, og.y, { alpha: o.opacity / 100, target: mask ? "mask" : "pixel" }); PE.commit("Bucket fill");
		} });
	var grad = null;
	PE.defTool({ id: "gradient", name: "Gradient", key: "g", icon: "◐", opts: { type: "linear", mode: "fgbg", opacity: 100 },
		ui: [{ k: "type", label: "Type", type: "seg", options: [["linear", "Linear"], ["radial", "Radial"]] }, { k: "mode", label: "Colours", type: "select", options: [["fgbg", "Foreground → Background"], ["fgt", "Foreground → Transparent"], ["fgbgr", "Background → Foreground"]] }, { k: "opacity", label: "Opacity", type: "range", min: 1, max: 100, step: 1, unit: "%" }],
		hint: "Drag from the start to the end of the gradient. Respects the selection.",
		down: function (e) { grad = { a: e, b: e }; }, move: function (e) { if (grad) { grad.b = e.shift ? { x: e.x, y: grad.a.y + (Math.abs(e.x - grad.a.x) > Math.abs(e.y - grad.a.y) ? 0 : e.y - grad.a.y) } : e; if (e.shift && Math.abs(e.x - grad.a.x) < Math.abs(e.y - grad.a.y)) grad.b = { x: grad.a.x, y: e.y }; PE.invalidateOverlay(); } },
		up: function () {
			var g = grad; grad = null; if (!g || Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) < 2) return; var L = PE.active(), o = PE.opt.gradient, mask = L && L.editMask && L.mask; if (!PE.prepare(L)) return;
			var og = PE.origin(L), w = L.canvas.width, h = L.canvas.height, t = mk(w, h), x = t.getContext("2d"), a = { x: g.a.x - og.x, y: g.a.y - og.y }, b = { x: g.b.x - og.x, y: g.b.y - og.y };
			var gr = o.type === "radial" ? x.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y)) : x.createLinearGradient(a.x, a.y, b.x, b.y), c1 = mask ? "#000" : (o.mode === "fgbgr" ? PE.bg : PE.fg), c2 = o.mode === "fgt" ? rgba(PE.fg, 0) : (o.mode === "fgbgr" ? PE.fg : PE.bg);
			if (mask) { gr.addColorStop(0, "#000"); gr.addColorStop(1, "rgba(0,0,0,0)"); } else { gr.addColorStop(0, c1); gr.addColorStop(1, c2); } x.fillStyle = gr; x.fillRect(0, 0, w, h);
			PE.paintInto(L, t, og.x, og.y, { alpha: o.opacity / 100, target: mask ? "mask" : "pixel" }); PE.commit("Gradient");
		},
		overlay: function (x) { if (!grad) return; var a = PE.toScreen(grad.a.x, grad.a.y), b = PE.toScreen(grad.b.x, grad.b.y); x.strokeStyle = "#000"; x.lineWidth = 3; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.stroke(); x.fillStyle = "#fff"; x.beginPath(); x.arc(a.x, a.y, 4, 0, 6.2832); x.fill(); } });

	/* ---------- eyedropper, hand, zoom ---------- */
	function pick(e) { var o = PE.opt.eyedropper, n = o.size; var c = PE.sample(e.x, e.y, n, o.merged); if (!c) return; var hex = P.rgbToHex(c.r, c.g, c.b); if (e.alt) PE.setBg(hex); else PE.setFg(hex); }
	PE.defTool({ id: "eyedropper", name: "Eyedropper (pick colour)", key: "i", icon: "💉", opts: { size: 1, merged: true }, ui: [{ k: "size", label: "Sample", type: "select", options: [[1, "Point"], [3, "3 × 3"], [5, "5 × 5"], [11, "11 × 11"]], num: true }, { k: "merged", label: "All layers", type: "check" }],
		hint: "Click to pick the foreground colour. Alt-click picks the background colour.", down: pick, move: pick });
	PE.defTool({ id: "hand", name: "Hand (pan)", key: "h", icon: "✋", opts: {}, ui: [], hint: "Drag to pan. You can also hold Space with any tool, or use the middle mouse button." });
	PE.defTool({ id: "zoom", name: "Zoom", key: "z", icon: "🔍", opts: {}, ui: [{ type: "button", label: "Fit (Ctrl+0)", act: function () { PE.fit(); } }, { type: "button", label: "100% (Ctrl+1)", act: function () { PE.setZoom(1); } }], hint: "Click to zoom in, Alt-click to zoom out. Ctrl + wheel also zooms.",
		down: function (e) { var r = PE.els.over.getBoundingClientRect(); PE.setZoom(PE.view.zoom * (e.alt ? 0.5 : 2), e.sx - r.left, e.sy - r.top); } });
	PE.stepBrushSize = function (dir) { var o = PE.opt[PE.toolId]; if (o && o.size != null) { var s = o.size, ns = dir > 0 ? Math.round(s * 1.15 + 1) : Math.max(1, Math.round(s / 1.15 - 1)); o.size = Math.min(500, Math.max(1, ns)); saveOpt(PE.toolId); PE.invalidateOverlay(); } };
})();

/* MES Photo Editor tools, part 2: text (with label backgrounds), shapes + annotations (arrows, callouts, step badges, highlights, redact), option plumbing. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk, rgba = PE.rgba;
	PE.optGet = function (id, k) { var t = PE.tools[id]; if (t.optsTarget) { var tg = t.optsTarget(); if (tg) return tg[k]; } return PE.opt[id][k]; };
	PE.optSet = function (id, k, v) { var t = PE.tools[id]; PE.opt[id][k] = v; if (t.optsTarget) { var tg = t.optsTarget(); if (tg && tg !== PE.opt[id]) { tg[k] = v; if (t.onopt) t.onopt(k, v); } } PE.emit("opts", id); PE.invalidateOverlay(); };

	/* ---------- fonts ---------- */
	PE.FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["system-ui, -apple-system, 'Segoe UI', sans-serif", "System UI"], ["Verdana, Geneva, sans-serif", "Verdana"], ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Tahoma, sans-serif", "Tahoma"], ["Impact, 'Arial Black', sans-serif", "Impact"], ["Georgia, serif", "Georgia"], ["'Times New Roman', Times, serif", "Times New Roman"], ["'Palatino Linotype', Palatino, serif", "Palatino"], ["'Courier New', Courier, monospace", "Courier New"], ["ui-monospace, Menlo, Consolas, monospace", "Monospace"], ["'Comic Sans MS', 'Comic Neue', cursive", "Comic Sans"], ["'Brush Script MT', cursive", "Brush Script"]];
	PE.loadFontFile = function (file) {
		var name = file.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]/g, "");
		return file.arrayBuffer().then(function (ab) { var ff = new FontFace(name, ab); return ff.load().then(function () { document.fonts.add(ff); PE.FONTS.push(["'" + name + "', sans-serif", name + " (yours)"]); PE.emit("fonts"); PE.optSet("text", "font", "'" + name + "', sans-serif"); }); });
	};

	/* ---------- text ---------- */
	var te = null;
	function editor() { return PE.els.textedit; }
	function placeEditor() {
		if (!te) return; var L = te.L, ta = editor(), t = L.text, v = PE.view, c = Math.cos(L.rot), s = Math.sin(L.rot), pad = L._pad || 0;
		var lx = pad - L.canvas.width / 2, ly = pad - L.canvas.height / 2, dx = L.cx + c * L.sx * lx - s * L.sy * ly, dy = L.cy + s * L.sx * lx + c * L.sy * ly, sp = PE.toScreen(dx, dy), z = v.zoom;
		ta.style.cssText = "display:block;left:0;top:0;transform-origin:0 0;transform:matrix(" + (c * L.sx * z) + "," + (s * L.sx * z) + "," + (-s * L.sy * z) + "," + (c * L.sy * z) + "," + sp.x + "," + sp.y + ");font:" + (t.italic ? "italic " : "") + (t.bold ? "bold " : "") + t.size + "px/" + (t.size * t.lh) + "px " + t.font + ";text-align:" + t.align + ";width:" + (L.canvas.width - pad * 2 + 4) + "px;height:" + (L.canvas.height - pad * 2 + t.size * 0.2) + "px;letter-spacing:" + (t.ls || 0) + "px;caret-color:" + (t.color) + ";";
	}
	PE.placeTextEditor = placeEditor;
	function openEdit(L, isNew) {
		te = { L: L, isNew: isNew, orig: L.text.str }; var ta = editor(); ta.value = L.text.str; placeEditor(); PE.emit("opts", "text");
		setTimeout(function () { ta.focus(); ta.select(); }, 0); setTimeout(function () { if (te && document.activeElement !== ta) { ta.focus(); ta.select(); } }, 80);
	}
	PE.endTextEdit = function (cancel) {
		if (!te) return; var e = te; te = null; var ta = editor(); ta.style.display = "none"; var L = e.L;
		if (cancel && e.isNew) { PE.doc.layers.splice(PE.doc.layers.indexOf(L), 1); if (!PE.doc.layers.length) PE.doc.layers.push(PE.makeLayer({ name: "Layer 1" })); PE.doc.activeId = PE.doc.layers[PE.doc.layers.length - 1].id; PE.emit("layers"); PE.invalidate(); return; }
		if (!L.text.str.trim() && e.isNew) { PE.doc.layers.splice(PE.doc.layers.indexOf(L), 1); if (!PE.doc.layers.length) PE.doc.layers.push(PE.makeLayer({ name: "Layer 1" })); PE.doc.activeId = PE.doc.layers[PE.doc.layers.length - 1].id; PE.emit("layers"); PE.invalidate(); return; }
		if (e.isNew) { L.name = L.text.str.split("\n")[0].slice(0, 24) || "Text"; PE.commit("Add text"); } else if (L.text.str !== e.orig) { L.name = L.text.str.split("\n")[0].slice(0, 24) || "Text"; PE.commit("Edit text"); }
		PE.invalidate();
	};
	PE.textEditing = function () { return !!te; };
	PE.focusText = function () { if (te) { var ta = editor(); if (document.activeElement !== ta) ta.focus(); } };
	PE.initTextEditor = function () {
		var ta = editor();
		ta.addEventListener("input", function () { if (!te) return; te.L.text.str = ta.value; PE.renderText(te.L); PE.touch(te.L); placeEditor(); });
		ta.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); PE.endTextEdit(false); e.stopPropagation(); } e.stopPropagation(); });
		ta.addEventListener("blur", function () { setTimeout(function () { if (te && document.activeElement !== ta && !PE.keepTextEdit) PE.endTextEdit(false); }, 120); });
		PE.on("view", function () { if (te) placeEditor(); });
	};
	var ctimer = 0;
	PE.defTool({ id: "text", name: "Text / Label", key: "t", icon: "T", opts: JSON.parse(JSON.stringify(PE.TEXTDEF)), hint: "Click to add text. Click an existing text to edit it. Turn on Background for a label or callout look. Esc finishes.",
		ui: [{ k: "font", label: "Font", type: "select", options: "fonts" }, { k: "size", label: "Size", type: "range", min: 6, max: 400, step: 1, unit: "px" }, { k: "bold", label: "Bold", type: "check" }, { k: "italic", label: "Italic", type: "check" }, { k: "align", label: "Align", type: "seg", options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] }, { k: "lh", label: "Line height", type: "range", min: 0.8, max: 3, step: 0.05 }, { k: "color", label: "Colour", type: "color" },
			{ k: "bgOn", label: "Background box", type: "check" }, { k: "bgColor", label: "Box colour", type: "color", show: "bgOn" }, { k: "bgPad", label: "Padding", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" }, { k: "bgRadius", label: "Corners", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" },
			{ k: "strokeOn", label: "Outline", type: "check" }, { k: "stroke", label: "Outline colour", type: "color", show: "strokeOn" }, { k: "strokeW", label: "Outline width", type: "range", min: 1, max: 40, step: 1, unit: "px", show: "strokeOn" },
			{ k: "shadowOn", label: "Shadow", type: "check" }, { k: "shadow", label: "Shadow colour", type: "color", show: "shadowOn" }, { k: "shadowBlur", label: "Blur", type: "range", min: 0, max: 60, step: 1, unit: "px", show: "shadowOn" },
			{ type: "button", label: "Load font file…", act: function () { PE.pickFontFile(); } }, { type: "button", label: "Yellow label", act: function () { preset({ bgOn: true, bgColor: "#ffeb3b", color: "#111111", bold: true, bgPad: 14, bgRadius: 8 }); } }, { type: "button", label: "Red callout", act: function () { preset({ bgOn: true, bgColor: "#e53935", color: "#ffffff", bold: true, bgPad: 14, bgRadius: 10 }); } }, { type: "button", label: "Meme text", act: function () { preset({ bgOn: false, color: "#ffffff", strokeOn: true, stroke: "#000000", strokeW: 6, bold: true, font: "Impact, 'Arial Black', sans-serif", align: "center" }); } }],
		optsTarget: function () { var L = PE.active(); return L && L.type === "text" && L.text ? L.text : null; },
		onopt: function () { var L = PE.active(); if (!L || L.type !== "text") return; PE.renderText(L); PE.touch(L); if (te) placeEditor(); clearTimeout(ctimer); ctimer = setTimeout(function () { PE.commit("Text style"); }, 450); },
		down: function (e) {
			if (te) { PE.endTextEdit(false); }
			var hit = PE.layerAt(e.x, e.y); if (hit && hit.type === "text") { PE.setActive(hit.id); openEdit(hit, false); return; }
			var o = JSON.parse(JSON.stringify(PE.opt.text)); o.str = ""; var L = PE.makeLayer({ type: "text", name: "Text", text: o, w: 4, h: 4 }); PE.renderText(L); L.cx = e.x - (L._pad || 0) + L.canvas.width / 2; L.cy = e.y - (L._pad || 0) + L.canvas.height / 2;
			PE.addLayer(L); openEdit(L, true);
		}, cancel: function () { PE.endTextEdit(false); } });
	function preset(o) { for (var k in o) PE.optSet("text", k, o[k]); PE.emit("opts", "text"); }
	PE.editActiveText = function () { var L = PE.active(); if (L && L.type === "text") { PE.setTool("text"); openEdit(L, false); } };

	/* ---------- shapes and annotations ---------- */
	function rr(x, bx, by, bw, bh, r) { r = Math.min(r, bw / 2, bh / 2); x.moveTo(bx + r, by); x.arcTo(bx + bw, by, bx + bw, by + bh, r); x.arcTo(bx + bw, by + bh, bx, by + bh, r); x.arcTo(bx, by + bh, bx, by, r); x.arcTo(bx, by, bx + bw, by, r); x.closePath(); }
	function contrast(hex) { var c = P.hexToRgb(hex); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) > 150 ? "#111111" : "#ffffff"; }
	function norm(a, b, sq) { var x1 = b.x, y1 = b.y; if (sq) { var d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)); x1 = a.x + Math.sign(b.x - a.x || 1) * d; y1 = a.y + Math.sign(b.y - a.y || 1) * d; } return { x: Math.min(a.x, x1), y: Math.min(a.y, y1), w: Math.abs(x1 - a.x), h: Math.abs(y1 - a.y), x1: x1, y1: y1 }; }
	function drawShape(x, kind, a, b, o, sq) {
		var fg = PE.fg, bg = PE.bg, sw = o.width, r = norm(a, b, sq);
		x.lineJoin = "round"; x.lineCap = "round"; x.lineWidth = sw;
		if (o.shadow) { x.shadowColor = "rgba(0,0,0,0.45)"; x.shadowBlur = 8; x.shadowOffsetX = 2; x.shadowOffsetY = 3; }
		if (kind === "line" || kind === "arrow") {
			var ex = sq ? r.x1 : b.x, ey = sq ? r.y1 : b.y, ang = Math.atan2(ey - a.y, ex - a.x), hl = Math.max(12, sw * 4.5), len = Math.hypot(ex - a.x, ey - a.y);
			x.strokeStyle = fg; x.fillStyle = fg; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(kind === "arrow" && len > hl ? ex - Math.cos(ang) * hl * 0.7 : ex, kind === "arrow" && len > hl ? ey - Math.sin(ang) * hl * 0.7 : ey); x.stroke();
			if (kind === "arrow" && len > 2) { var hw = hl * 0.55; x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex - Math.cos(ang) * hl + Math.sin(ang) * hw, ey - Math.sin(ang) * hl - Math.cos(ang) * hw); x.lineTo(ex - Math.cos(ang) * hl - Math.sin(ang) * hw, ey - Math.sin(ang) * hl + Math.cos(ang) * hw); x.closePath(); x.fill(); }
			return;
		}
		x.beginPath();
		if (kind === "ellipse") x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 6.2832);
		else if (kind === "round" || kind === "callout" && false) rr(x, r.x, r.y, r.w, r.h, o.radius);
		else if (kind === "callout") {
			var rad = Math.min(o.radius, r.w / 2, r.h / 2), tx0 = r.x + Math.min(r.w * 0.2, 40), tx1 = r.x + Math.min(r.w * 0.2 + 36, r.w - rad), tipx = r.x - Math.min(r.w * 0.12, 20), tipy = r.y + r.h + Math.min(r.h * 0.4, 36);
			x.moveTo(r.x + rad, r.y); x.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad); x.arcTo(r.x + r.w, r.y + r.h, tx1, r.y + r.h, rad); x.lineTo(tx1, r.y + r.h); x.lineTo(tipx, tipy); x.lineTo(tx0, r.y + r.h); x.arcTo(r.x, r.y + r.h, r.x, r.y, rad); x.arcTo(r.x, r.y, r.x + r.w, r.y, rad); x.closePath();
		} else if (kind === "badge") { var br = Math.max(8, o.badge / 2); x.arc(a.x, a.y, br, 0, 6.2832); }
		else x.rect(r.x, r.y, r.w, r.h);
		if (kind === "highlight") { x.fillStyle = fg; x.fill(); return; }
		if (kind === "badge") { x.fillStyle = fg; x.fill(); if (o.stroke) { x.strokeStyle = bg; x.lineWidth = Math.max(2, o.badge / 12); x.stroke(); } x.shadowColor = "transparent"; x.fillStyle = contrast(fg); x.font = "bold " + Math.round(o.badge * 0.55) + "px Arial, Helvetica, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(o.next), a.x, a.y + o.badge * 0.04); return; }
		if (o.fill) { x.fillStyle = bg; x.fill(); x.shadowColor = "transparent"; }
		if (o.stroke) { x.strokeStyle = fg; x.stroke(); }
	}
	function shapePad(kind, o) { return Math.ceil(o.width + (o.shadow ? 16 : 0) + (kind === "arrow" ? Math.max(12, o.width * 4.5) : 0) + (kind === "callout" ? 60 : 0) + 4); }
	function shapeBox(kind, a, b, o, sq) {
		var r = norm(a, b, sq), p = shapePad(kind, o);
		if (kind === "line" || kind === "arrow") { var ex = sq ? r.x1 : b.x, ey = sq ? r.y1 : b.y; r = { x: Math.min(a.x, ex), y: Math.min(a.y, ey), w: Math.abs(ex - a.x), h: Math.abs(ey - a.y) }; }
		if (kind === "badge") { var br = Math.max(8, o.badge / 2); r = { x: a.x - br, y: a.y - br, w: br * 2, h: br * 2 }; }
		return { x: Math.floor(r.x - p), y: Math.floor(r.y - p), w: Math.ceil(r.w + p * 2), h: Math.ceil(r.h + p * 2) };
	}
	var sh = null;
	var KINDS = [["rect", "Rectangle"], ["round", "Rounded box"], ["ellipse", "Ellipse"], ["line", "Line"], ["arrow", "Arrow"], ["callout", "Callout bubble"], ["badge", "Step number"], ["highlight", "Highlight"], ["redact", "Blur / hide area"]];
	var KNAMES = {}; KINDS.forEach(function (k) { KNAMES[k[0]] = k[1]; });
	PE.defTool({ id: "shape", name: "Shapes & Annotations", key: "u", icon: "▭", opts: { kind: "rect", fill: false, stroke: true, width: 6, radius: 12, opacity: 100, newLayer: true, shadow: false, badge: 56, next: 1, redact: "pixelate", amount: 14 },
		ui: [{ k: "kind", label: "Shape", type: "select", options: KINDS }, { k: "stroke", label: "Outline", type: "check", hideFor: ["line", "arrow", "badge", "highlight", "redact"] }, { k: "fill", label: "Fill (background colour)", type: "check", hideFor: ["line", "arrow", "badge", "highlight", "redact"] }, { k: "width", label: "Line width", type: "range", min: 1, max: 80, step: 1, unit: "px", hideFor: ["badge", "highlight", "redact"] }, { k: "radius", label: "Corner radius", type: "range", min: 0, max: 120, step: 1, unit: "px", showFor: ["round", "callout"] },
			{ k: "badge", label: "Badge size", type: "range", min: 20, max: 200, step: 2, unit: "px", showFor: ["badge"] }, { k: "next", label: "Next number", type: "number", showFor: ["badge"] },
			{ k: "redact", label: "Hide with", type: "seg", options: [["pixelate", "Pixelate"], ["blur", "Blur"], ["solid", "Solid"]], showFor: ["redact"] }, { k: "amount", label: "Strength", type: "range", min: 4, max: 60, step: 1, showFor: ["redact"] },
			{ k: "opacity", label: "Opacity", type: "range", min: 5, max: 100, step: 1, unit: "%", hideFor: ["redact"] }, { k: "shadow", label: "Drop shadow", type: "check", hideFor: ["redact", "highlight"] }, { k: "newLayer", label: "On a new layer", type: "check", hideFor: ["redact"] }],
		hint: "Drag to draw (Shift = square / straight). Outline uses the foreground colour, fill uses the background colour. Step numbers: just click. Each lands on its own layer so you can move or delete it.",
		down: function (e) { var o = PE.opt.shape; sh = { a: e, b: e, sq: false }; if (o.kind === "badge") { sh.b = e; } },
		move: function (e) { if (sh) { sh.b = e; sh.sq = e.shift; PE.invalidateOverlay(); } },
		up: function (e) {
			var s = sh; sh = null; if (!s) return; var o = PE.opt.shape, kind = o.kind, a = s.a, b = s.b;
			if (kind !== "badge" && Math.hypot(b.x - a.x, b.y - a.y) < 3) return;
			var box = shapeBox(kind, a, b, o, s.sq);
			if (kind === "redact") { redact(box, norm(a, b, s.sq), o); return; }
			var c = mk(box.w, box.h), x = c.getContext("2d"); x.translate(-box.x, -box.y); drawShape(x, kind, a, b, o, s.sq); x.setTransform(1, 0, 0, 1, 0, 0);
			var op = o.opacity / 100;
			if (PE.sel) PE.restrictToSel(x, box.x, box.y, box.w, box.h);
			if (o.newLayer || !PE.active()) { var L = PE.makeLayer({ canvas: c, x: box.x, y: box.y, name: KNAMES[kind] }); L.opacity = op; if (kind === "highlight") L.blend = "multiply"; PE.addLayer(L); PE.commit("Add " + KNAMES[kind].toLowerCase()); }
			else { var A = PE.active(); if (!PE.prepare(A)) return; PE.paintInto(A, c, box.x, box.y, { alpha: op }); PE.commit(KNAMES[kind]); }
			if (kind === "badge") { PE.opt.shape.next++; PE.emit("opts", "shape"); }
		},
		overlay: function (x) {
			if (!sh) return; var o = PE.opt.shape, v = PE.view, kind = o.kind; x.save(); x.setTransform(v.dpr * v.zoom, 0, 0, v.dpr * v.zoom, v.dpr * v.px, v.dpr * v.py); x.globalAlpha = kind === "redact" ? 1 : o.opacity / 100;
			if (kind === "redact") { var r = norm(sh.a, sh.b, sh.sq); x.setLineDash([6 / v.zoom, 5 / v.zoom]); x.lineWidth = 1.5 / v.zoom; x.strokeStyle = "#ff3d3d"; x.fillStyle = "rgba(255,61,61,0.15)"; x.fillRect(r.x, r.y, r.w, r.h); x.strokeRect(r.x, r.y, r.w, r.h); }
			else drawShape(x, kind, sh.a, sh.b, o, sh.sq); x.restore();
		}, cancel: function () { sh = null; } });
	function redact(box, r, o) {
		var x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(PE.doc.w, Math.ceil(r.x + r.w)), y1 = Math.min(PE.doc.h, Math.ceil(r.y + r.h)), w = x1 - x0, h = y1 - y0; if (w < 2 || h < 2) return;
		var flat = PE.flatten(), c = mk(w, h), x = c.getContext("2d"); x.drawImage(flat, x0, y0, w, h, 0, 0, w, h);
		if (o.redact === "solid") { x.fillStyle = PE.fg; x.fillRect(0, 0, w, h); } else { var id = x.getImageData(0, 0, w, h); if (o.redact === "blur") P.gaussianBlur(id.data, w, h, o.amount); else P.pixelate(id.data, w, h, Math.max(2, o.amount)); x.putImageData(id, 0, 0); }
		if (PE.sel) PE.restrictToSel(x, x0, y0, w, h);
		var L = PE.makeLayer({ canvas: c, x: x0, y: y0, name: o.redact === "solid" ? "Hidden area" : o.redact === "blur" ? "Blurred area" : "Pixelated area" }); PE.addLayer(L, PE.doc.layers.length); PE.commit("Hide area");
	}
})();

/* MES Photo Editor dialogs: modal + form helpers, adjustments and filters with live preview (levels, curves, ...), image / canvas size, new document, export. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, I = window.MESImg, mk = PE.mk;
	function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	PE.el = el; PE.esc = esc;

	/* ---------- modal ---------- */
	var openModal = null;
	PE.modal = function (o) {
		if (openModal) openModal.close(true);
		var back = el("div", "pe-modal"), box = el("div", "pe-dlg" + (o.wide ? " pe-dlg--wide" : "")), head = el("div", "pe-dlg-h"), body = el("div", "pe-dlg-b"), foot = el("div", "pe-dlg-f");
		head.innerHTML = "<b>" + esc(o.title) + "</b>"; var x = el("button", "pe-x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Close"); head.appendChild(x);
		body.appendChild(o.body); (o.buttons || []).forEach(function (b) { var bt = el("button", "pe-btn" + (b.primary ? " pe-btn--primary" : ""), esc(b.label)); bt.type = "button"; bt.addEventListener("click", function () { b.act(m); }); foot.appendChild(bt); b.el = bt; });
		box.appendChild(head); box.appendChild(body); if (o.buttons) box.appendChild(foot); back.appendChild(box); (PE.els.root || document.body).appendChild(back);
		var m = { el: box, body: body, close: function (silent) { if (openModal !== m) return; openModal = null; back.remove(); document.removeEventListener("keydown", key, true); if (o.onClose) o.onClose(silent); } };
		function key(e) { if (e.key === "Escape") { e.stopPropagation(); m.close(); } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON" && o.buttons) { var p = o.buttons.filter(function (b) { return b.primary; })[0]; if (p) { e.preventDefault(); e.stopPropagation(); p.act(m); } } }
		document.addEventListener("keydown", key, true); x.addEventListener("click", function () { m.close(); }); back.addEventListener("mousedown", function (e) { if (e.target === back && !o.sticky) m.close(); });
		openModal = m; var f = body.querySelector("input,select,button"); if (f && !o.noFocus) setTimeout(function () { f.focus(); }, 30); return m;
	};
	PE.modalOpen = function () { return !!openModal; };
	/* params: [{k,label,type:range|check|select|color|number|seg,min,max,step,val,unit,options}] -> {el,get()} */
	PE.form = function (params, onChange) {
		var root = el("div", "pe-form"), inputs = {};
		params.forEach(function (p) {
			var row = el("label", "pe-row"), lab = el("span", "pe-row-l", esc(p.label)); row.appendChild(lab); var inp, out;
			if (p.type === "check") { inp = el("input"); inp.type = "checkbox"; inp.checked = !!p.val; row.className += " pe-row--check"; }
			else if (p.type === "select") { inp = el("select"); p.options.forEach(function (o) { var op = el("option", null, esc(o[1])); op.value = o[0]; inp.appendChild(op); }); inp.value = p.val; }
			else if (p.type === "color") { inp = el("input"); inp.type = "color"; inp.value = p.val; }
			else if (p.type === "seg") { inp = el("div", "pe-seg"); p.options.forEach(function (o) { var b = el("button", null, esc(o[1])); b.type = "button"; b.dataset.v = o[0]; b.addEventListener("click", function () { inp.value = o[0]; sync(); onChange && onChange(); }); inp.appendChild(b); }); inp.value = p.val; var sync = function () { Array.prototype.forEach.call(inp.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === String(inp.value) ? "true" : "false"); }); }; sync(); }
			else if (p.type === "text") { inp = el("input"); inp.type = "text"; inp.value = p.val == null ? "" : p.val; }
			else if (p.type === "number") { inp = el("input"); inp.type = "number"; inp.value = p.val; if (p.min != null) inp.min = p.min; if (p.max != null) inp.max = p.max; if (p.step != null) inp.step = p.step; }
			else { inp = el("input"); inp.type = "range"; inp.min = p.min; inp.max = p.max; inp.step = p.step || 1; inp.value = p.val; out = el("input", "pe-num"); out.type = "number"; out.min = p.min; out.max = p.max; out.step = p.step || 1; out.value = p.val; inp.addEventListener("input", function () { out.value = inp.value; onChange && onChange(); }); out.addEventListener("input", function () { if (out.value !== "") { inp.value = out.value; onChange && onChange(); } }); }
			if (p.type !== "range") { inp.addEventListener("input", function () { onChange && onChange(); }); inp.addEventListener("change", function () { onChange && onChange(); }); }
			row.appendChild(inp); if (out) { row.appendChild(out); } if (p.unit && out) { row.appendChild(el("span", "pe-unit", esc(p.unit))); }
			inputs[p.k] = { inp: inp, p: p, out: out }; root.appendChild(row);
		});
		return { el: root, inputs: inputs, get: function () { var r = {}; params.forEach(function (p) { var i = inputs[p.k].inp; r[p.k] = p.type === "check" ? i.checked : (p.type === "range" || p.type === "number") ? parseFloat(i.value) : i.value; }); return r; },
			set: function (k, v) { var i = inputs[k]; if (!i) return; if (i.p.type === "check") i.inp.checked = v; else i.inp.value = v; if (i.out) i.out.value = v; if (i.p.type === "seg") Array.prototype.forEach.call(i.inp.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === String(v) ? "true" : "false"); }); } };
	};

	/* ---------- live-preview engine for adjustments / filters ---------- */
	function maskProxy(L, pw, ph) {
		if (!PE.sel) return null; var o = PE.origin(L), c = PE.tmp("pmask", L.canvas.width, L.canvas.height); c.getContext("2d").drawImage(PE.sel.c, -o.x, -o.y);
		var s = PE.tmp("pmask2", pw, ph), sx = s.getContext("2d"); sx.drawImage(c, 0, 0, pw, ph); var d = sx.getImageData(0, 0, pw, ph).data, m = new Uint8Array(pw * ph); for (var i = 0; i < m.length; i++) m[i] = d[i * 4 + 3]; return m;
	}
	/* run(data, w, h, scale) mutates RGBA data; returns controller {update(), apply(label), cancel()} */
	function previewer(run, scaleKeysFn) {
		var L = PE.active(); if (!PE.prepare(L, false, true)) return null;
		var w = L.canvas.width, h = L.canvas.height, sc = Math.min(1, 1100 / Math.max(w, h)), pw = Math.max(1, Math.round(w * sc)), ph = Math.max(1, Math.round(h * sc)), base = mk(pw, ph);
		base.getContext("2d").drawImage(L.canvas, 0, 0, pw, ph); var baseData = base.getContext("2d").getImageData(0, 0, pw, ph), mask = maskProxy(L, pw, ph), out = mk(pw, ph), timer = 0;
		function render() { timer = 0; var id = new ImageData(new Uint8ClampedArray(baseData.data), pw, ph); run(id.data, pw, ph, sc); if (mask) P.blendByMask(baseData.data, id.data, mask); out.getContext("2d").putImageData(id, 0, 0); L.preview = out; PE.invalidate(); }
		render();
		return { update: function () { if (!timer) timer = setTimeout(render, 25); }, apply: function (label) { clearTimeout(timer); L.preview = null; PE.applyPixels(L, function (d, W, H) { run(d, W, H, 1); }, label); }, cancel: function () { clearTimeout(timer); L.preview = null; PE.invalidate(); }, L: L };
	}
	function adjustDialog(def) {
		if (!PE.doc || !PE.active()) { PE.toast("Open an image first"); return; }
		if (!def.params || !def.params.length) { PE.applyPixels(PE.active(), function (d, w, h) { def.fn(d, w, h, {}, 1); }, def.title); return; }
		var f, pv, saved = PE.savedParams[def.id] || {}; def.params.forEach(function (p) { if (saved[p.k] != null) p.val = saved[p.k]; });
		var wrap = el("div"); f = PE.form(def.params, function () { pv && pv.update(); }); wrap.appendChild(f.el);
		var scaleKeys = def.scaleKeys || [];
		pv = previewer(function (d, w, h, sc) { var p = f.get(); scaleKeys.forEach(function (k) { p[k] *= sc; }); def.fn(d, w, h, p, sc); });
		if (!pv) return;
		var done = false;
		PE.modal({ title: def.title, body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [
			{ label: "Reset", act: function () { def.params.forEach(function (p) { f.set(p.k, p.def != null ? p.def : p.val); }); pv.update(); } }, { label: "Cancel", act: function (m) { m.close(); } },
			{ label: "Apply", primary: true, act: function (m) { done = true; PE.savedParams[def.id] = f.get(); pv.apply(def.title); m.close(); } }] });
	}
	PE.savedParams = {};
	PE.adjustDialog = adjustDialog;

	function P2(k, label, min, max, val, step, unit) { return { k: k, label: label, type: "range", min: min, max: max, val: val, def: val, step: step || 1, unit: unit }; }
	PE.ADJUST = [
		{ id: "bc", title: "Brightness / Contrast", params: [P2("b", "Brightness", -100, 100, 0), P2("c", "Contrast", -100, 100, 0)], fn: function (d, w, h, p) { P.brightnessContrast(d, p.b, p.c); } },
		{ id: "levels", title: "Levels…", custom: "levels" }, { id: "curves", title: "Curves…", custom: "curves" },
		{ id: "exposure", title: "Exposure", params: [P2("ev", "Exposure (stops)", -3, 3, 0, 0.05), P2("off", "Offset", -0.5, 0.5, 0, 0.01), P2("g", "Gamma", 0.2, 3, 1, 0.01)], fn: function (d, w, h, p) { P.exposure(d, p.ev, p.off, p.g); } },
		{ id: "hs", title: "Hue / Saturation / Lightness", params: [P2("h", "Hue", -180, 180, 0, 1, "°"), P2("s", "Saturation", -100, 100, 0), P2("l", "Lightness", -100, 100, 0)], fn: function (d, w, h, p) { P.hueSat(d, p.h, p.s, p.l); } },
		{ id: "vibrance", title: "Vibrance", params: [P2("v", "Vibrance", -100, 100, 40)], fn: function (d, w, h, p) { P.vibrance(d, p.v); } },
		{ id: "temp", title: "Temperature / Tint", params: [P2("t", "Warm ↔ Cool", -100, 100, 0), P2("tint", "Green ↔ Magenta", -100, 100, 0)], fn: function (d, w, h, p) { P.temperature(d, p.t, p.tint); } },
		{ id: "threshold", title: "Threshold (black & white)", params: [P2("t", "Threshold", 1, 255, 128)], fn: function (d, w, h, p) { P.threshold(d, p.t); } },
		{ id: "posterize", title: "Posterize", params: [P2("n", "Levels", 2, 32, 5)], fn: function (d, w, h, p) { P.posterize(d, p.n); } },
		{ id: "invert", title: "Invert colours", params: [], fn: function (d) { P.invert(d); } },
		{ id: "gray", title: "Black & white", params: [], fn: function (d) { P.grayscale(d); } },
		{ id: "sepia", title: "Sepia", params: [], fn: function (d) { P.sepia(d); } },
		{ id: "keycolor", title: "Make a colour transparent", params: [{ k: "c", label: "Colour", type: "color", val: "#ffffff" }, P2("tol", "Tolerance", 0, 255, 30), P2("soft", "Soft edge", 0, 128, 20)], fn: function (d, w, h, p) { var c = P.hexToRgb(p.c); for (var i = 0; i < d.length; i += 4) { var df = Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2])); var a = Math.min(1, Math.max(0, (df - p.tol) / (p.soft + 1))); d[i + 3] *= a; } } }
	];
	PE.FILTERS = [
		{ id: "blur", title: "Gaussian Blur", params: [P2("r", "Radius", 0.5, 100, 6, 0.5, "px")], scaleKeys: ["r"], fn: function (d, w, h, p) { P.gaussianBlur(d, w, h, p.r); } },
		{ id: "unsharp", title: "Sharpen (Unsharp Mask)", params: [P2("a", "Amount", 0, 500, 120, 1, "%"), P2("r", "Radius", 0.3, 20, 1.5, 0.1, "px"), P2("t", "Threshold", 0, 50, 0)], scaleKeys: ["r"], fn: function (d, w, h, p) { P.unsharp(d, w, h, p.a, p.r, p.t); } },
		{ id: "noise", title: "Add Noise", params: [P2("a", "Amount", 1, 100, 12, 1, "%"), { k: "mono", label: "Monochrome", type: "check", val: true }], fn: function (d, w, h, p) { P.noise(d, p.a, p.mono, 7); } },
		{ id: "pixelate", title: "Pixelate", params: [P2("s", "Block size", 2, 120, 12, 1, "px")], scaleKeys: ["s"], fn: function (d, w, h, p) { P.pixelate(d, w, h, p.s); } },
		{ id: "vignette", title: "Vignette", params: [P2("a", "Amount", -100, 100, 60), P2("s", "Size", 0, 100, 35), P2("f", "Softness", 1, 100, 60)], fn: function (d, w, h, p) { P.vignette(d, w, h, p.a, p.s, p.f); } },
		{ id: "emboss", title: "Emboss", params: [], fn: function (d, w, h) { P.convolve(d, w, h, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 128); } },
		{ id: "edges", title: "Find Edges", params: [], fn: function (d, w, h) { P.convolve(d, w, h, [-1, -1, -1, -1, 8, -1, -1, -1, -1], 1, 0); } }
	];

	/* ---------- Levels ---------- */
	function histCanvas(hist, w, h, chan) {
		var c = mk(w, h), x = c.getContext("2d"), a = hist, mx = 1; for (var i = 1; i < 255; i++) mx = Math.max(mx, a[i]);
		x.fillStyle = "#16161a"; x.fillRect(0, 0, w, h); x.fillStyle = chan === "r" ? "#e5534b" : chan === "g" ? "#57ab5a" : chan === "b" ? "#539bf5" : "#9aa0a6";
		for (i = 0; i < 256; i++) { var bh = Math.min(h, Math.sqrt(a[i] / mx) * h); x.fillRect(i * w / 256, h - bh, Math.ceil(w / 256) + 0.5, bh); } return c;
	}
	function levelsDialog() {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (!PE.prepare(L, false, true)) return;
		var id = PE.layerData(L), hist = P.histogram(id.data), chan = "l", wrap = el("div", "pe-lev"), hc = el("canvas", "pe-hist"); hc.width = 256; hc.height = 90; wrap.appendChild(hc);
		var f = PE.form([{ k: "ch", label: "Channel", type: "select", options: [["l", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]], val: "l" }, P2("ib", "Input black", 0, 254, 0), P2("g", "Gamma", 0.1, 4, 1, 0.01), P2("iw", "Input white", 1, 255, 255), P2("ob", "Output black", 0, 255, 0), P2("ow", "Output white", 0, 255, 255)], function () { drawH(); pv.update(); });
		wrap.appendChild(f.el); var auto = el("button", "pe-btn", "Auto"); auto.type = "button"; wrap.appendChild(auto);
		function drawH() { var ch = f.get().ch; hc.getContext("2d").drawImage(histCanvas(hist[ch], 256, 90, ch), 0, 0); }
		auto.addEventListener("click", function () { var r = P.autoLevels(hist[f.get().ch], 0.005); f.set("ib", r.black); f.set("iw", r.white); pv.update(); });
		var pv = previewer(function (d) { var p = f.get(), lut = P.levelsLUT(Math.min(p.ib, p.iw - 1), p.iw, p.g, p.ob, p.ow), id = P.identityLUT(); if (p.ch === "l") P.applyLUT(d, lut); else P.applyLUT(d, p.ch === "r" ? lut : id, p.ch === "g" ? lut : id, p.ch === "b" ? lut : id); }); if (!pv) return; drawH();
		var done = false; PE.modal({ title: "Levels", body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { done = true; pv.apply("Levels"); m.close(); } }] });
	}
	/* ---------- Curves ---------- */
	function curvesDialog() {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (!PE.prepare(L, false, true)) return;
		var S = 256, cv = el("canvas", "pe-curve"); cv.width = S; cv.height = S; var pts = { l: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] }, chan = "l", drag = -1;
		var wrap = el("div", "pe-cur"), tabs = el("div", "pe-seg"); [["l", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]].forEach(function (c) { var b = el("button", null, c[1]); b.type = "button"; b.dataset.c = c[0]; b.addEventListener("click", function () { chan = c[0]; sync(); draw(); }); tabs.appendChild(b); });
		function sync() { Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.c === chan ? "true" : "false"); }); } sync();
		wrap.appendChild(tabs); wrap.appendChild(cv); var hint = el("div", "pe-hint2", "Click the line to add a point, drag to bend the curve, double-click a point to remove it."); wrap.appendChild(hint);
		function draw() {
			var x = cv.getContext("2d"); x.fillStyle = "#16161a"; x.fillRect(0, 0, S, S); x.strokeStyle = "#2c2c33"; x.lineWidth = 1; x.beginPath(); for (var i = 1; i < 4; i++) { x.moveTo(i * S / 4, 0); x.lineTo(i * S / 4, S); x.moveTo(0, i * S / 4); x.lineTo(S, i * S / 4); } x.stroke();
			x.strokeStyle = "#555"; x.beginPath(); x.moveTo(0, S); x.lineTo(S, 0); x.stroke();
			var lut = P.curveLUT(pts[chan]); x.strokeStyle = chan === "r" ? "#e5534b" : chan === "g" ? "#57ab5a" : chan === "b" ? "#539bf5" : "#fff"; x.lineWidth = 2; x.beginPath(); for (i = 0; i < 256; i++) { var py = S - lut[i]; i ? x.lineTo(i, py) : x.moveTo(i, py); } x.stroke();
			pts[chan].forEach(function (p) { x.fillStyle = "#fff"; x.strokeStyle = "#1a73e8"; x.lineWidth = 2; x.beginPath(); x.arc(p[0], S - p[1], 4.5, 0, 6.2832); x.fill(); x.stroke(); });
		}
		function pos(e) { var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(255, Math.round((e.clientX - r.left) / r.width * S))), Math.max(0, Math.min(255, Math.round(255 - (e.clientY - r.top) / r.height * S)))]; }
		cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); var p = pos(e), a = pts[chan], best = -1, bd = 12; a.forEach(function (q, i) { var d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } }); if (best < 0) { a.push(p); a.sort(function (u, v) { return u[0] - v[0]; }); best = a.indexOf(p); } drag = best; draw(); pv.update(); });
		cv.addEventListener("pointermove", function (e) { if (drag < 0) return; var a = pts[chan], p = pos(e), q = a[drag]; if (drag > 0 && drag < a.length - 1) { p[0] = Math.max(a[drag - 1][0] + 1, Math.min(a[drag + 1][0] - 1, p[0])); q[0] = p[0]; } else if (drag === 0) p[0] = Math.min(p[0], a[1][0] - 1), q[0] = p[0]; else p[0] = Math.max(p[0], a[a.length - 2][0] + 1), q[0] = p[0]; q[1] = p[1]; draw(); pv.update(); });
		cv.addEventListener("pointerup", function () { drag = -1; });
		cv.addEventListener("dblclick", function (e) { var p = pos(e), a = pts[chan]; for (var i = 1; i < a.length - 1; i++) if (Math.hypot(a[i][0] - p[0], a[i][1] - p[1]) < 12) { a.splice(i, 1); draw(); pv.update(); return; } });
		var pv = previewer(function (d) { var l = P.curveLUT(pts.l), r = P.curveLUT(pts.r), g = P.curveLUT(pts.g), b = P.curveLUT(pts.b); var R = new Uint8Array(256), G = new Uint8Array(256), B = new Uint8Array(256); for (var i = 0; i < 256; i++) { R[i] = l[r[i]]; G[i] = l[g[i]]; B[i] = l[b[i]]; } P.applyLUT(d, R, G, B); }); if (!pv) return; draw();
		var done = false; PE.modal({ title: "Curves", body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [{ label: "Reset", act: function () { pts = { l: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] }; draw(); pv.update(); } }, { label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { done = true; pv.apply("Curves"); m.close(); } }] });
	}
	PE.runAdjust = function (id) {
		var a = PE.ADJUST.concat(PE.FILTERS).filter(function (x) { return x.id === id; })[0]; if (!a) return;
		if (a.custom === "levels") levelsDialog(); else if (a.custom === "curves") curvesDialog(); else adjustDialog(a);
	};

	/* ---------- image size / canvas size ---------- */
	PE.dlgImageSize = function () {
		var d = PE.doc; if (!d) return; var ratio = d.w / d.h, wrap = el("div");
		var f = PE.form([{ k: "w", label: "Width", type: "number", val: d.w, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: d.h, min: 1, max: PE.MAXPX }, { k: "lock", label: "Keep proportions", type: "check", val: true }, { k: "pct", label: "Scale", type: "range", min: 5, max: 400, step: 1, val: 100, unit: "%" }], function () { });
		wrap.appendChild(f.el); wrap.appendChild(el("p", "pe-hint2", "Current size: " + d.w + " × " + d.h + " px. Shrinking is smooth (it uses high-quality resampling)."));
		var I1 = f.inputs; I1.w.inp.addEventListener("input", function () { if (I1.lock.inp.checked) { f.set("h", Math.max(1, Math.round(I1.w.inp.value / ratio))); } f.set("pct", Math.round(I1.w.inp.value / d.w * 100)); });
		I1.h.inp.addEventListener("input", function () { if (I1.lock.inp.checked) { f.set("w", Math.max(1, Math.round(I1.h.inp.value * ratio))); } f.set("pct", Math.round(I1.h.inp.value / d.h * 100)); });
		var pc = function () { var p = +I1.pct.inp.value; f.set("w", Math.max(1, Math.round(d.w * p / 100))); f.set("h", Math.max(1, Math.round(d.h * p / 100))); }; I1.pct.inp.addEventListener("input", pc); I1.pct.out.addEventListener("input", pc);
		PE.modal({ title: "Image size", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Resize", primary: true, act: function (m) { var v = f.get(); m.close(); PE.resizeImage(Math.round(v.w), Math.round(v.h)); } }] });
	};
	PE.dlgCanvasSize = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div"), anchor = [0.5, 0.5];
		var f = PE.form([{ k: "w", label: "Width", type: "number", val: d.w, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: d.h, min: 1, max: PE.MAXPX }, { k: "fill", label: "New area", type: "select", options: [["none", "Transparent"], ["bg", "Background colour"], ["fg", "Foreground colour"], ["white", "White"], ["black", "Black"]], val: "none" }], null);
		wrap.appendChild(f.el); var grid = el("div", "pe-anchor"); for (var i = 0; i < 9; i++) { (function (i) { var b = el("button", null, i === 4 ? "●" : ""); b.type = "button"; b.setAttribute("aria-pressed", i === 4 ? "true" : "false"); b.addEventListener("click", function () { anchor = [(i % 3) / 2, Math.floor(i / 3) / 2]; Array.prototype.forEach.call(grid.children, function (c, j) { c.setAttribute("aria-pressed", j === i ? "true" : "false"); c.textContent = j === i ? "●" : ""; }); }); grid.appendChild(b); })(i); }
		var row = el("div", "pe-row"); row.appendChild(el("span", "pe-row-l", "Anchor")); row.appendChild(grid); wrap.appendChild(row);
		PE.modal({ title: "Canvas size", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { var v = f.get(); m.close(); PE.canvasSize(v.w, v.h, anchor[0], anchor[1], v.fill === "none" ? null : v.fill === "bg" ? PE.bg : v.fill === "fg" ? PE.fg : v.fill); } }] });
	};

	/* ---------- new document ---------- */
	PE.PRESETS = [["Full HD 1920 × 1080", 1920, 1080], ["HD 1280 × 720 (YouTube thumbnail)", 1280, 720], ["4K 3840 × 2160", 3840, 2160], ["Social share 1200 × 630", 1200, 630], ["Square post 1080 × 1080", 1080, 1080], ["Portrait post 1080 × 1350", 1080, 1350], ["Story / Reel 1080 × 1920", 1080, 1920], ["X / Twitter post 1600 × 900", 1600, 900], ["Banner 1500 × 500", 1500, 500], ["A4 at 300 dpi 2480 × 3508", 2480, 3508], ["Icon 512 × 512", 512, 512], ["Small 800 × 600", 800, 600]];
	PE.dlgNew = function () {
		var wrap = el("div"), f = PE.form([{ k: "preset", label: "Preset", type: "select", options: [["", "Custom"]].concat(PE.PRESETS.map(function (p, i) { return [String(i), p[0]]; })), val: "0" }, { k: "w", label: "Width", type: "number", val: 1920, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: 1080, min: 1, max: PE.MAXPX }, { k: "bg", label: "Background", type: "select", options: [["#ffffff", "White"], ["none", "Transparent"], ["fg", "Foreground colour"], ["bgc", "Background colour"], ["#000000", "Black"]], val: "#ffffff" }], function () { var v = f.get(); if (v.preset !== "" && PE.PRESETS[+v.preset]) { f.set("w", PE.PRESETS[+v.preset][1]); f.set("h", PE.PRESETS[+v.preset][2]); } });
		wrap.appendChild(f.el);
		PE.modal({ title: "New image", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Create", primary: true, act: function (m) { var v = f.get(); m.close(); PE.newDoc(v.w, v.h, v.bg === "none" ? null : v.bg === "fg" ? PE.fg : v.bg === "bgc" ? PE.bg : v.bg, "Untitled"); PE.setTool("move"); } }] });
	};

	/* ---------- export ---------- */
	PE.dlgExport = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div", "pe-exp"), saved = PE.savedParams.export || { fmt: "png", q: 90, scale: 100, bg: "#ffffff", name: d.name };
		var f = PE.form([{ k: "fmt", label: "Format", type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }, { k: "scale", label: "Scale", type: "range", min: 10, max: 400, step: 1, val: saved.scale, unit: "%" }, { k: "bg", label: "Background (JPEG)", type: "color", val: saved.bg }, { k: "name", label: "File name", type: "text", val: saved.name }], function () { vis(); est(); });
		wrap.appendChild(f.el); var info = el("div", "pe-exp-info", ""); wrap.appendChild(info);
		function vis() { var v = f.get(), F = I.FORMATS[v.fmt]; f.inputs.q.inp.closest(".pe-row").style.display = F.lossy ? "" : "none"; f.inputs.bg.inp.closest(".pe-row").style.display = F.alpha ? "none" : ""; }
		var t = 0, token = 0; function est() { clearTimeout(t); t = setTimeout(function () { var v = f.get(), my = ++token; info.textContent = "Calculating…"; PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }).then(function (b) { if (my !== token) return; info.innerHTML = "<b>" + Math.round(d.w * v.scale / 100) + " × " + Math.round(d.h * v.scale / 100) + " px</b> · " + I.formatBytes(b.size); }).catch(function (e) { info.textContent = e.message; }); }, 250); }
		vis(); est();
		function getBlob(v) { return PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }); }
		PE.modal({ title: "Export image", body: wrap, buttons: [{ label: "Copy to clipboard", act: function (m) { var v = f.get(); PE.exportBlob("png", 1, { scale: v.scale / 100 }).then(function (b) { return navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); }).then(function () { PE.toast("Copied as PNG"); }).catch(function () { PE.toast("This browser can't copy images"); }); } },
			{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download", primary: true, act: function (m) { var v = f.get(); PE.savedParams.export = v; getBlob(v).then(function (b) { PE.download(b, I.cleanFileName(v.name || "image") + "." + I.FORMATS[v.fmt].ext); PE.toast("Saved"); m.close(); }).catch(function (e) { PE.toast(e.message); }); } }] });
	};
	/* ---------- layer effects (new layer under the active one) + round corners + straighten ---------- */
	function flatLayer(L) { var c = mk(L.canvas.width, L.canvas.height); PE.drawLayer(c.getContext("2d"), Object.assign({}, L, { opacity: 1, blend: "source-over", live: null, preview: null, _p: null }), [1, 0, 0, 1, 0, 0], "fl", c.width, c.height); return c; }
	function effectDialog(kind) {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (L.locked) { PE.toast("This layer is locked"); return; }
		var shadow = kind === "shadow", params = shadow ? [{ k: "c", label: "Colour", type: "color", val: "#000000" }, P2("op", "Opacity", 5, 100, 55, 1, "%"), P2("blur", "Blur", 0, 80, 14, 1, "px"), P2("dx", "Offset X", -80, 80, 6, 1, "px"), P2("dy", "Offset Y", -80, 80, 8, 1, "px")] : [{ k: "c", label: "Colour", type: "color", val: PE.fg }, P2("w", "Width", 1, 60, 6, 1, "px")];
		var wrap = el("div"), f = PE.form(params, null); wrap.appendChild(f.el); wrap.appendChild(el("p", "pe-hint2", shadow ? "Adds a separate shadow layer under this one. Set the offset to 0 and raise the blur for a glow." : "Adds a separate outline layer under this one (follows the shape of the layer's pixels)."));
		PE.modal({ title: shadow ? "Drop shadow" : "Outline", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Add", primary: true, act: function (m) { var v = f.get(); m.close(); makeEffect(L, kind, v); } }] });
	}
	function makeEffect(L, kind, v) {
		PE.bake(L); var src = flatLayer(L), W = src.width, H = src.height, o = PE.origin(L), shadow = kind === "shadow", mg = shadow ? Math.ceil(v.blur * 2 + Math.max(Math.abs(v.dx), Math.abs(v.dy)) + 2) : Math.ceil(v.w + 2), c = mk(W + mg * 2, H + mg * 2), x = c.getContext("2d");
		if (shadow) { var rgb = P.hexToRgb(v.c); x.shadowColor = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + v.op / 100 + ")"; x.shadowBlur = v.blur; x.shadowOffsetX = 20000 + v.dx; x.shadowOffsetY = v.dy; x.drawImage(src, mg - 20000, mg); }
		else { var sil = mk(W, H), sx = sil.getContext("2d"); sx.drawImage(src, 0, 0); sx.globalCompositeOperation = "source-in"; sx.fillStyle = v.c; sx.fillRect(0, 0, W, H); var steps = Math.max(16, Math.round(v.w * 6)); for (var i = 0; i < steps; i++) { var a = i / steps * Math.PI * 2; x.drawImage(sil, mg + Math.cos(a) * v.w, mg + Math.sin(a) * v.w); } x.drawImage(sil, mg, mg); }
		var N = PE.makeLayer({ canvas: c, x: o.x - mg, y: o.y - mg, name: (shadow ? "Shadow of " : "Outline of ") + L.name }); PE.addLayer(N, PE.indexOf(L)); PE.setActive(L.id); PE.commit(shadow ? "Drop shadow" : "Outline");
	}
	PE.dlgEffect = effectDialog;
	PE.dlgRoundCorners = function () {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (!PE.prepare(L, false, true)) return;
		var w = L.canvas.width, h = L.canvas.height, mx = Math.floor(Math.min(w, h) / 2), wrap = el("div"), f = PE.form([P2("r", "Radius", 0, mx, Math.min(24, mx), 1, "px")], function () { pv.update(); }); wrap.appendChild(f.el);
		function round(d, W, Hh, sc) { var r = f.get().r * sc, c = mk(W, Hh), x = c.getContext("2d"); x.putImageData(new ImageData(d, W, Hh), 0, 0); x.globalCompositeOperation = "destination-in"; x.beginPath(); x.moveTo(r, 0); x.arcTo(W, 0, W, Hh, r); x.arcTo(W, Hh, 0, Hh, r); x.arcTo(0, Hh, 0, 0, r); x.arcTo(0, 0, W, 0, r); x.closePath(); x.fill(); d.set(x.getImageData(0, 0, W, Hh).data); }
		var pv = previewer(round); if (!pv) return; var done = false;
		PE.modal({ title: "Round corners", body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { done = true; pv.apply("Round corners"); m.close(); } }] });
	};
	PE.dlgStraighten = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div"), f = PE.form([P2("a", "Angle", -45, 45, 0, 0.1, "°"), { k: "ex", label: "Grow canvas to fit", type: "check", val: false }], null); wrap.appendChild(f.el); wrap.appendChild(el("p", "pe-hint2", "Rotates every layer about the centre of the image. Use it to level a tilted horizon. Without “Grow canvas”, the corners are cropped."));
		PE.modal({ title: "Rotate / straighten image", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Rotate", primary: true, act: function (m) { var v = f.get(); m.close(); PE.rotateArbitrary(v.a, v.ex); } }] });
	};
	PE.rotateArbitrary = function (deg, expand) {
		if (!deg) return; var d = PE.doc, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), W = d.w, H = d.h, nw = W, nh = H;
		if (expand) { nw = Math.ceil(Math.abs(W * c) + Math.abs(H * s)); nh = Math.ceil(Math.abs(W * s) + Math.abs(H * c)); }
		d.layers.forEach(function (L) { var dx = L.cx - W / 2, dy = L.cy - H / 2; L.cx = nw / 2 + dx * c - dy * s; L.cy = nh / 2 + dx * s + dy * c; L.rot += a; });
		d.w = nw; d.h = nh; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Rotate " + deg + "°"); PE.fit();
	};

	/* ---------- export all comps as a set of pictures (one ZIP) ---------- */
	PE.dlgExportComps = function () {
		var d = PE.doc; if (!d) return; var comps = d.comps || []; if (!comps.length) { PE.toast("Save some comps first (Comps tab, + Save current view)"); return; }
		var saved = PE.savedParams.expc || { fmt: "jpg", q: 90, mode: "doc", w: 1280, pat: "{project}-{n}-{comp}", bg: "#ffffff" };
		var wrap = el("div"), f = PE.form([{ k: "fmt", label: "Format", type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }, { k: "mode", label: "Size", type: "select", options: [["doc", "Same as the image (" + d.w + " × " + d.h + ")"], ["width", "Fixed width"]], val: saved.mode }, { k: "w", label: "Width (px)", type: "number", val: saved.w, min: 16, max: 8000 }, { k: "bg", label: "Background (JPEG)", type: "color", val: saved.bg }, { k: "pat", label: "File names", type: "text", val: saved.pat }], function () { vis(); });
		wrap.appendChild(f.el); function vis() { var v = f.get(); f.inputs.q.inp.closest(".pe-row").style.display = I.FORMATS[v.fmt].lossy ? "" : "none"; f.inputs.bg.inp.closest(".pe-row").style.display = I.FORMATS[v.fmt].alpha ? "none" : ""; f.inputs.w.inp.closest(".pe-row").style.display = v.mode === "width" ? "" : "none"; } vis();
		var list = el("div", "pe-complist"); comps.forEach(function (c, i) { var r = el("label", "pe-row pe-row--check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = true; cb.dataset.i = i; r.appendChild(el("span", "pe-row-l", esc((i + 1) + ". " + c.name))); r.appendChild(cb); list.appendChild(r); }); wrap.appendChild(el("p", "pe-hint2", "Comps to export:")); wrap.appendChild(list); var st = el("p", "pe-hint2"); wrap.appendChild(st);
		PE.modal({ title: "Export all comps", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download ZIP", primary: true, act: function (m) {
			var v = f.get(), picked = []; list.querySelectorAll("input").forEach(function (cb) { if (cb.checked) picked.push(comps[+cb.dataset.i]); }); if (!picked.length) { PE.toast("Tick at least one comp"); return; }
			PE.savedParams.expc = v; var back = { st: PE.compCapture() }, files = [], used = {}, F = I.FORMATS[v.fmt], scale = v.mode === "width" ? v.w / d.w : 1, i = 0;
			function next() {
				if (i >= picked.length) { PE.compApplyState(back); PE.emit("comps"); var out = files.length === 1 ? new Blob([files[0].data], { type: F.mime }) : new Blob([I.zipStore(files)], { type: "application/zip" }); PE.download(out, files.length === 1 ? files[0].name : I.cleanFileName(d.name) + "-comps.zip"); PE.toast(files.length + " picture" + (files.length === 1 ? "" : "s") + " saved"); m.close(); return Promise.resolve(); }
				var c = picked[i++]; st.textContent = "Rendering " + i + " of " + picked.length + ": " + c.name; PE.compApplyState(c);
				return new Promise(function (res) { setTimeout(res, 20); }).then(function () { return PE.exportBlob(v.fmt, v.q / 100, { scale: scale, bg: v.bg }); }).then(function (b) { return b.arrayBuffer(); }).then(function (ab) {
					var nm = v.pat.replace(/\{project\}/g, I.baseName(d.name)).replace(/\{n\}/g, String(i)).replace(/\{comp\}/g, c.name); files.push({ name: I.uniqueName(I.cleanFileName(nm) + "." + F.ext, used), data: new Uint8Array(ab) }); return next(); });
			}
			next().catch(function (e) { PE.compApplyState(back); st.textContent = "Could not export: " + (e && e.message ? e.message : e); });
		} }] });
	};

	PE.download = function (blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); };
})();

/* MES Photo Editor: AI background removal, running in the browser (nothing is uploaded). transformers.js 3.7.6 (jsDelivr, loaded on first use) runs one of two open models:
 * IS-Net "general use" (Apache-2.0, any object; WebGPU fp16 88 MB or CPU int8 46 MB) or MODNet (Apache-2.0, people, 6.6 MB). Models come from huggingface.co and are cached by the browser
 * (Cache API), so the download happens once. (BiRefNet was tried and fails on GPUs with <= 10 storage buffers per shader stage, i.e. Apple GPUs; RMBG / ISNet-ONNX are non-commercial / AGPL.) */
(function () {
	"use strict";
	var PE = window.PE, mk = PE.mk, el = PE.el, esc = PE.esc;
	var LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js", T = null, cache = {};
	var MODELS = { object: { id: "Ko033/isnet-general-use-onnx", label: "Any object (best quality)", mb: function (gpu) { return gpu ? 88 : 46; } }, people: { id: "Xenova/modnet", label: "People and portraits (small, fast)", mb: function () { return 7; }, dtype: "uint8", dev: "wasm" } };
	function hasGpu() { return !!(navigator.gpu); }
	function gpuF16() { return (navigator.gpu ? navigator.gpu.requestAdapter().then(function (a) { return !!(a && a.features.has("shader-f16")); }).catch(function () { return false; }) : Promise.resolve(false)); }
	function loadLib() { return T ? Promise.resolve(T) : new Function("u", "return import(u)")(LIB).then(function (m) { T = m; return m; }); }
	function getModel(kind, onProgress) {
		return Promise.all([loadLib(), gpuF16()]).then(function (r) {
			var M = MODELS[kind], gpu = r[1] && !M.dev, key = kind + (gpu ? ":gpu" : ":cpu"); if (cache[key]) return cache[key];
			var opts = { progress_callback: onProgress, dtype: M.dtype || (gpu ? "fp16" : "q8"), device: M.dev || (gpu ? "webgpu" : "wasm") };
			function load(o) { return Promise.all([T.AutoModel.from_pretrained(M.id, o), T.AutoProcessor.from_pretrained(M.id)]).then(function (a) { return { model: a[0], proc: a[1], gpu: o.device === "webgpu" }; }); }
			return load(opts).catch(function (e) { if (!gpu) throw e; return load({ progress_callback: onProgress, dtype: "q8", device: "wasm" }); }).then(function (m) { return (cache[key] = m); });
		});
	}
	/* canvas -> Float32 mask [0..1] at the model's output size */
	function infer(m, canvas, onStatus) {
		return Promise.resolve(T.RawImage.fromCanvas(canvas)).then(function (img) { return m.proc(img); }).then(function (inp) {
			var s = m.model.sessions.model, feed = {}; feed[s.inputNames[0]] = inp.pixel_values; onStatus("Finding the subject…");
			return m.model(feed).then(function (res) {
				var o = res[s.outputNames[0]], dims = o.dims, h = dims[dims.length - 2], w = dims[dims.length - 1];
				return Promise.resolve(o.data).then(function (d) { return { d: d, w: w, h: h }; });
			});
		});
	}
	function smooth(t, a, b) { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
	/* raw float mask -> canvas (black, alpha = mask) at the target size, with min-max normalisation and an edge style */
	function maskCanvas(r, W, H, edge) {
		var mn = 1e9, mx = -1e9, i, n = r.w * r.h; for (i = 0; i < n; i++) { var v = r.d[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
		var rg = Math.max(1e-6, mx - mn), c = mk(r.w, r.h), x = c.getContext("2d"), id = x.createImageData(r.w, r.h), a = id.data, lo = edge === "sharp" ? 0.4 : edge === "soft" ? 0 : 0.12, hi = edge === "sharp" ? 0.6 : edge === "soft" ? 1 : 0.88;
		for (i = 0; i < n; i++) { var t = (r.d[i] - mn) / rg; a[i * 4 + 3] = Math.round(255 * (edge === "soft" ? t : smooth(t, lo, hi))); }
		x.putImageData(id, 0, 0); var out = mk(W, H), ox = out.getContext("2d"); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = "high"; ox.drawImage(c, 0, 0, W, H); return out;
	}
	PE.aiRemoveBackground = function () {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; }
		if (L.locked) { PE.toast("This layer is locked"); return; }
		var wrap = el("div"), gpuNote = hasGpu();
		var f = PE.form([{ k: "model", label: "Picture type", type: "select", options: [["object", MODELS.object.label], ["people", MODELS.people.label]], val: PE.savedParams.ai ? PE.savedParams.ai.model : "object" },
			{ k: "result", label: "Result", type: "select", options: [["mask", "Hide the background with a layer mask (editable)"], ["cut", "Cut it out permanently"], ["sel", "Select the subject only"]], val: PE.savedParams.ai ? PE.savedParams.ai.result : "mask" },
			{ k: "edge", label: "Edge", type: "seg", options: [["soft", "Soft"], ["normal", "Normal"], ["sharp", "Sharp"]], val: PE.savedParams.ai ? PE.savedParams.ai.edge : "normal" }], function () { size(); });
		wrap.appendChild(f.el); var note = el("p", "pe-hint2"), bar = el("div", "pe-aibar"), fill = el("i"), st = el("div", "pe-hint2"); bar.appendChild(fill); bar.hidden = true; wrap.appendChild(note); wrap.appendChild(bar); wrap.appendChild(st);
		function size() { var M = MODELS[f.get().model]; note.textContent = "First use downloads a small AI model (about " + M.mb(gpuNote) + " MB, from huggingface.co) and keeps it in your browser, so later runs start instantly. Your picture never leaves your device."; } size();
		var busy = false, cancelled = false, run;
		var m = PE.modal({ title: "Remove background (AI)", body: wrap, sticky: true, onClose: function () { cancelled = true; }, buttons: [{ label: "Cancel", act: function (mm) { mm.close(); } }, { label: "Remove background", primary: true, act: function (mm) { if (busy) return; go(mm); } }] });
		function go(mm) {
			var v = f.get(); PE.savedParams.ai = v; busy = true; var btns = mm.el.querySelectorAll(".pe-dlg-f .pe-btn"); btns[1].disabled = true; btns[1].textContent = "Working…"; bar.hidden = false; var last = {};
			function prog(p) { if (p && p.status === "progress" && p.total > 1e6) { last[p.file] = p; var l = 0, t = 0; for (var k in last) { l += last[k].loaded; t += last[k].total; } fill.style.width = (100 * l / t) + "%"; st.textContent = "Downloading model… " + Math.round(l / 1e6) + " of " + Math.round(t / 1e6) + " MB"; } }
			PE.bake(L); var src = mk(L.canvas.width, L.canvas.height); PE.drawLayer(src.getContext("2d"), Object.assign({}, L, { opacity: 1, blend: "source-over", mask: null, live: null, preview: null, _p: null }), [1, 0, 0, 1, 0, 0], "ai", src.width, src.height);
			st.textContent = "Loading the AI engine…";
			getModel(v.model, prog).then(function (mod) { fill.style.width = "100%"; st.textContent = "Analysing…"; return infer(mod, src, function (t) { st.textContent = t; }); }).then(function (r) {
				if (cancelled) return; var mc = maskCanvas(r, src.width, src.height, v.edge), o = PE.origin(L);
				if (v.result === "sel") { var sc = mk(PE.doc.w, PE.doc.h); sc.getContext("2d").drawImage(mc, o.x, o.y); var sx = sc.getContext("2d"); sx.globalCompositeOperation = "source-in"; sx.fillStyle = "#fff"; sx.fillRect(0, 0, sc.width, sc.height); PE.selCombine(sc, "new"); PE.commit("Select subject (AI)"); }
				else if (v.result === "cut") { var x = L.canvas.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-in"; x.drawImage(mc, 0, 0); x.restore(); if (L.mask) { var mx = L.mask.getContext("2d"); } L.rev++; PE.commit("Remove background (AI)"); }
				else { if (L.mask) { var ex = L.mask.getContext("2d"); ex.save(); ex.globalCompositeOperation = "destination-in"; ex.drawImage(mc, 0, 0); ex.restore(); } else L.mask = mc; L.editMask = true; L.rev++; PE.commit("Remove background (AI)"); }
				PE.emit("layers"); PE.invalidate(); mm.close(); PE.toast(v.result === "mask" ? "Done. Paint on the mask to fix edges: brush reveals, eraser hides." : "Done");
			}).catch(function (e) { busy = false; btns[1].disabled = false; btns[1].textContent = "Try again"; bar.hidden = true; st.textContent = "Could not run the AI model: " + (e && e.message ? e.message : e) + (/fetch|network|load/i.test(String(e && e.message)) ? " (check your connection)" : ""); });
		}
	};
})();

/* MES Photo Editor: shared onnxruntime-web helpers for the AI tools that run plain ONNX files (object erase, upscaling). onnxruntime-web 1.22.0 from jsDelivr (`ort.all.min.js`: WebGPU + wasm);
 * models are fetched once with a progress callback and kept with the Cache API (`mes-photo-editor-models`). A session tries WebGPU first and falls back to wasm if creating it or running it fails
 * (some GPUs, e.g. Apple's, lack features a model needs). */
(function () {
	"use strict";
	var PE = window.PE, ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js", CACHE = "mes-photo-editor-models", ortP = null, sessions = {};
	var rt = PE.aiRt = {
		ort: function () { return window.ort ? Promise.resolve(window.ort) : (ortP = ortP || new Promise(function (res, rej) { var s = document.createElement("script"); s.src = ORT; s.onload = function () { res(window.ort); }; s.onerror = function () { ortP = null; rej(new Error("Could not load the AI engine (offline?)")); }; document.head.appendChild(s); })); },
		fetchModel: function (url, mb, onProg) {
			var c = window.caches ? caches.open(CACHE) : Promise.resolve(null);
			return c.then(function (cache) {
				return (cache ? cache.match(url) : Promise.resolve(null)).then(function (hit) {
					if (hit) return hit.arrayBuffer();
					return fetch(url).then(function (r) {
						if (!r.ok) throw new Error("Model download failed (" + r.status + ")"); var total = +r.headers.get("content-length") || mb * 1e6, rd = r.clone().body.getReader(), got = 0, parts = [];
						function pump() { return rd.read().then(function (x) { if (x.done) return; parts.push(x.value); got += x.value.length; onProg(got, total); return pump(); }); }
						return pump().then(function () { var buf = new Uint8Array(got), p = 0; parts.forEach(function (a) { buf.set(a, p); p += a.length; }); if (cache) cache.put(url, new Response(buf, { headers: { "content-type": "application/octet-stream" } })).catch(function () {}); return buf.buffer; });
					});
				});
			});
		},
		/* -> {run(feeds) -> outputs, provider} */
		session: function (key, url, mb, onProg, forceWasm) {
			var s = sessions[key]; if (s && !forceWasm) return Promise.resolve(s);
			return Promise.all([rt.ort(), rt.fetchModel(url, mb, onProg)]).then(function (r) {
				var ort = r[0], bytes = r[1], tries = forceWasm || (s && s.provider === "wasm") || !navigator.gpu ? ["wasm"] : ["webgpu", "wasm"];
				function next(i) { return ort.InferenceSession.create(bytes, { executionProviders: [tries[i]] }).then(function (sess) { var o = { sess: sess, provider: tries[i], ort: ort, key: key, url: url, mb: mb, bytes: bytes }; sessions[key] = o; return o; }, function (e) { if (i + 1 < tries.length) return next(i + 1); throw e; }); }
				return next(0);
			});
		},
		/* run with automatic fallback from WebGPU to wasm */
		run: function (o, feeds) {
			return o.sess.run(feeds).then(function (out) { return { out: out, o: o }; }, function (e) {
				if (o.provider !== "webgpu") throw e;
				return rt.session(o.key, o.url, o.mb, function () {}, true).then(function (o2) { return o2.sess.run(feeds).then(function (out) { return { out: out, o: o2 }; }); });
			});
		}
	};
})();

/* MES Photo Editor: AI object erase (inpainting), in the browser. Paint over what you want gone (or use a selection), press Erase: LaMa fills the area from its surroundings.
 * LaMa (Apache-2.0) as OpenCV's 93 MB ONNX build (huggingface.co/opencv/inpainting_lama, derived from Carve/LaMa-ONNX), run by onnxruntime-web 1.22.0 (jsDelivr; WebGPU when it works,
 * else wasm). The model works on 512 x 512, so a window around the marked area (with context) is resampled to 512, filled, resampled back, and only the marked area (grown 2 px,
 * feathered) is copied over the original: everything else keeps its exact pixels. The model file is cached with the Cache API after the first download. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk, el = PE.el;
	var MODEL = "https://huggingface.co/opencv/inpainting_lama/resolve/main/inpainting_lama_2025jan.onnx", MB = 92.6;
	var provider = "", marks = null, busy = false, stroke = null;
	var SESSKEY = "lama";
	function getSession(onProg) { return PE.aiRt.session(SESSKEY, MODEL, MB, onProg).then(function (o) { provider = o.provider; return o; }); }
	function runSafe(o, img, msk) {
		var ort = o.ort, feeds = { image: new ort.Tensor("float32", img, [1, 3, 512, 512]), mask: new ort.Tensor("float32", msk, [1, 1, 512, 512]) };
		return PE.aiRt.run(o, feeds).then(function (r) { provider = r.o.provider; return r.out.output.data; });
	}

	/* mask (Uint8, document size) -> filled pixels in the active layer */
	function inpaint(L, o, docMask, status) {
		PE.bake(L); var d = PE.doc, og = PE.origin(L), lw = L.canvas.width, lh = L.canvas.height, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, y, x;
		for (y = 0; y < d.h; y++) for (x = 0; x < d.w; x++) if (docMask[y * d.w + x]) { var lx = x - og.x, ly = y - og.y; if (lx < 0 || ly < 0 || lx >= lw || ly >= lh) continue; if (lx < x0) x0 = lx; if (lx > x1) x1 = lx; if (ly < y0) y0 = ly; if (ly > y1) y1 = ly; }
		if (x1 < 0) { PE.toast("Mark the object on this layer first"); return Promise.resolve(false); }
		var bw = x1 - x0 + 1, bh = y1 - y0 + 1, want = Math.max(bw, bh) + Math.max(96, Math.round(Math.max(bw, bh) * 0.6)), S = Math.max(512, want), ww = Math.min(S, lw), wh = Math.min(S, lh);
		var wx = Math.round(Math.min(Math.max(0, (x0 + x1) / 2 - ww / 2), lw - ww)), wy = Math.round(Math.min(Math.max(0, (y0 + y1) / 2 - wh / 2), lh - wh));
		var win = mk(ww, wh); win.getContext("2d").drawImage(L.canvas, wx, wy, ww, wh, 0, 0, ww, wh);
		var wm = new Uint8Array(ww * wh); for (y = 0; y < wh; y++) { var dy = y + wy + og.y; if (dy < 0 || dy >= d.h) continue; for (x = 0; x < ww; x++) { var dx = x + wx + og.x; if (dx >= 0 && dx < d.w && docMask[dy * d.w + dx]) wm[y * ww + x] = 255; } }
		var mc = mk(ww, wh), mid = mc.getContext("2d").createImageData(ww, wh); for (var i = 0; i < wm.length; i++) { mid.data[i * 4 + 3] = wm[i]; } mc.getContext("2d").putImageData(mid, 0, 0);
		var a512 = PE.resample(win, 512, 512), m512 = mk(512, 512); m512.getContext("2d").imageSmoothingEnabled = true; m512.getContext("2d").drawImage(mc, 0, 0, 512, 512);
		var ad = a512.getContext("2d").getImageData(0, 0, 512, 512).data, md = m512.getContext("2d").getImageData(0, 0, 512, 512).data, n = 512 * 512, img = new Float32Array(3 * n), msk = new Float32Array(n), mu = new Uint8Array(n);
		for (i = 0; i < n; i++) { img[i] = ad[i * 4] / 255; img[n + i] = ad[i * 4 + 1] / 255; img[2 * n + i] = ad[i * 4 + 2] / 255; mu[i] = md[i * 4 + 3] > 40 ? 255 : 0; }
		mu = P.growShrinkMask(mu, 512, 512, 2, true); for (i = 0; i < n; i++) msk[i] = mu[i] ? 1 : 0;
		status("Filling in the area… " + (provider === "wasm" ? "(about 15 seconds on this device)" : ""));
		return runSafe(o, img, msk).then(function (out) {
			var rc = mk(512, 512), rid = rc.getContext("2d").createImageData(512, 512); for (var k = 0; k < n; k++) { rid.data[k * 4] = out[k]; rid.data[k * 4 + 1] = out[n + k]; rid.data[k * 4 + 2] = out[2 * n + k]; rid.data[k * 4 + 3] = 255; } rc.getContext("2d").putImageData(rid, 0, 0);
			var res = mk(ww, wh), rx = res.getContext("2d"); rx.imageSmoothingQuality = "high"; rx.drawImage(rc, 0, 0, ww, wh);
			var soft = P.featherMask(P.growShrinkMask(wm, ww, wh, 2, true), ww, wh, 3), sc = mk(ww, wh), sid = sc.getContext("2d").createImageData(ww, wh); for (var j = 0; j < soft.length; j++) sid.data[j * 4 + 3] = soft[j]; sc.getContext("2d").putImageData(sid, 0, 0);
			rx.globalCompositeOperation = "destination-in"; rx.drawImage(sc, 0, 0); var lx2 = L.canvas.getContext("2d"); lx2.drawImage(res, wx, wy); L.rev++; PE.commit("Erase object (AI)"); return true;
		});
	}

	/* the dialog that shows progress while the model downloads and runs */
	function process(docMask) {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (L.locked) { PE.toast("This layer is locked"); return; } if (L.type === "text") { PE.toast("Rasterize the text layer first"); return; } if (busy) return;
		busy = true; var wrap = el("div"), st = el("div", "pe-hint2"), bar = el("div", "pe-aibar"), fill = el("i"); bar.appendChild(fill); wrap.appendChild(el("p", "pe-hint2", "Everything runs on your device. The first time, a " + Math.round(MB) + " MB AI model is downloaded and kept in your browser.")); wrap.appendChild(bar); wrap.appendChild(st); st.textContent = "Loading the AI engine…";
		var m = PE.modal({ title: "Erase object (AI)", body: wrap, sticky: true, onClose: function () { busy = false; } });
		getSession(function (got, total) { fill.style.width = (100 * got / total) + "%"; st.textContent = "Downloading the model… " + Math.round(got / 1e6) + " of " + Math.round(total / 1e6) + " MB"; }).then(function (o) { fill.style.width = "100%"; return inpaint(L, o, docMask, function (t) { st.textContent = t; }); })
			.then(function (ok) { busy = false; m.close(true); if (ok) { clearMarks(); PE.toast("Erased. Undo with Ctrl+Z if you want it back."); } })
			.catch(function (e) { busy = false; st.textContent = "Could not erase: " + (e && e.message ? e.message : e); var b = el("button", "pe-btn", "Close"); b.type = "button"; b.addEventListener("click", function () { m.close(true); }); wrap.appendChild(b); });
	}

	/* ---------- marks (what to erase) ---------- */
	function ensureMarks() { var d = PE.doc; if (!d) return null; if (!marks || marks.width !== d.w || marks.height !== d.h) marks = mk(d.w, d.h); return marks; }
	function clearMarks() { if (marks) marks.getContext("2d").clearRect(0, 0, marks.width, marks.height); PE.invalidateOverlay(); }
	function marksMask() { var d = PE.doc; if (!marks || marks.width !== d.w || marks.height !== d.h) return null; var id = marks.getContext("2d").getImageData(0, 0, d.w, d.h).data, m = new Uint8Array(d.w * d.h), any = false; for (var i = 0; i < m.length; i++) if (id[i * 4 + 3] > 127) { m[i] = 255; any = true; } return any ? m : null; }
	PE.aiEraseRun = function () { var m = marksMask(); if (!m && PE.sel) m = PE.selMask().slice ? new Uint8Array(PE.selMask()) : null; if (!m) { PE.toast("Paint over the object you want to remove first (or make a selection)"); return; } process(m); };
	function seg(a, b, o) { var x = marks.getContext("2d"); x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = PE.opt.objerase.size; if (o.alt) { x.globalCompositeOperation = "destination-out"; } x.strokeStyle = "#ff2d2d"; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); x.globalCompositeOperation = "source-over"; }
	PE.defTool({ id: "objerase", name: "Object Erase (AI)", key: "j", icon: "🧽", opts: { size: 40, auto: false },
		ui: [{ k: "size", label: "Brush size", type: "range", min: 4, max: 300, step: 1, unit: "px" }, { k: "auto", label: "Erase when I release", type: "check" }, { type: "button", label: "✨ Erase marked area (Enter)", act: function () { PE.aiEraseRun(); } }, { type: "button", label: "Use selection", act: function () { if (!PE.sel) { PE.toast("Make a selection first"); return; } ensureMarks(); var x = marks.getContext("2d"); x.drawImage(PE.sel.c, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = "#ff2d2d"; x.fillRect(0, 0, marks.width, marks.height); x.globalCompositeOperation = "source-over"; PE.invalidateOverlay(); } }, { type: "button", label: "Clear marks (Esc)", act: clearMarks }],
		hint: "Paint over the object (Alt = un-paint), then press Enter or the Erase button. AI fills the area from its surroundings. Works best on small objects against plain or repeating backgrounds.",
		cursorSize: function () { return PE.opt.objerase.size; },
		down: function (e) { if (busy) return; ensureMarks(); stroke = { last: e }; seg(e, e, e); PE.invalidateOverlay(); },
		move: function (e) { if (!stroke) return; seg(stroke.last, e, e); stroke.last = e; PE.invalidateOverlay(); },
		up: function () { if (!stroke) return; stroke = null; if (PE.opt.objerase.auto) PE.aiEraseRun(); },
		enter: function () { PE.aiEraseRun(); }, cancel: function () { stroke = null; clearMarks(); },
		overlay: function (x) { if (!marks || !PE.doc) return; var s = PE.toScreen(0, 0), z = PE.view.zoom; x.save(); x.globalAlpha = 0.5; x.imageSmoothingEnabled = false; x.drawImage(marks, s.x, s.y, marks.width * z, marks.height * z); x.restore(); } });
})();

/* MES Photo Editor: AI upscaling, in the browser. Real-ESRGAN "general x4v3" (SRVGGNetCompact, BSD-3-Clause; 4.9 MB ONNX from huggingface.co/CoderViking/realesr-general-x4v3-onnx) through onnxruntime-web
 * (see aiort.js). Every raster layer (and its mask) is cut into overlapping tiles (256 px on WebGPU, 128 px on wasm, 16 px of context that is thrown away), each tile goes through the x4 network, and
 * the central part is drawn into the result at x4, or scaled to x2 with high-quality smoothing; alpha is upscaled separately by plain resampling. Text layers are re-rendered at the new size
 * (sharper than any model could make them). The document grows by the same factor; it is one undo step. Measured here: ~0.3 s per 256 px tile on WebGPU, ~0.9 s per 128 px tile on wasm. */
(function () {
	"use strict";
	var PE = window.PE, mk = PE.mk, el = PE.el, I = window.MESImg;
	var MODEL = "https://huggingface.co/CoderViking/realesr-general-x4v3-onnx/resolve/main/realesr-general-x4v3.onnx", MB = 4.9, KEY = "esrgan", busy = false, cancelled = false;
	function hasAlpha(c) { var d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (var i = 3; i < d.length; i += 4) if (d[i] < 255) return true; return false; }
	function upscaleCanvas(src, scale, o, prog) {
		var w = src.width, h = src.height, gpu = o.provider === "webgpu", T = gpu ? 256 : 128, pad = 16, out = mk(w * scale, h * scale), ox = out.getContext("2d"), ort = o.ort; ox.imageSmoothingQuality = "high";
		var tiles = []; for (var ty = 0; ty < h; ty += T) for (var tx = 0; tx < w; tx += T) tiles.push([tx, ty]);
		var sx = src.getContext("2d"), idx = 0;
		function next() {
			if (cancelled) return Promise.reject(new Error("cancelled")); if (idx >= tiles.length) return Promise.resolve();
			var t = tiles[idx++], tx = t[0], ty = t[1], tw = Math.min(T, w - tx), th = Math.min(T, h - ty), x0 = Math.max(0, tx - pad), y0 = Math.max(0, ty - pad), x1 = Math.min(w, tx + tw + pad), y1 = Math.min(h, ty + th + pad), rw = x1 - x0, rh = y1 - y0;
			var id = sx.getImageData(x0, y0, rw, rh).data, n = rw * rh, f = new Float32Array(3 * n); for (var i = 0; i < n; i++) { f[i] = id[i * 4] / 255; f[n + i] = id[i * 4 + 1] / 255; f[2 * n + i] = id[i * 4 + 2] / 255; }
			return PE.aiRt.run(o, { input: new ort.Tensor("float32", f, [1, 3, rh, rw]) }).then(function (r) {
				o = r.o; var d = r.out.output.data, W4 = rw * 4, H4 = rh * 4, m = W4 * H4, tc = mk(W4, H4), tid = tc.getContext("2d").createImageData(W4, H4), a = tid.data;
				for (var k = 0; k < m; k++) { var v0 = d[k], v1 = d[m + k], v2 = d[2 * m + k]; a[k * 4] = v0 < 0 ? 0 : v0 > 1 ? 255 : v0 * 255 + 0.5; a[k * 4 + 1] = v1 < 0 ? 0 : v1 > 1 ? 255 : v1 * 255 + 0.5; a[k * 4 + 2] = v2 < 0 ? 0 : v2 > 1 ? 255 : v2 * 255 + 0.5; a[k * 4 + 3] = 255; }
				tc.getContext("2d").putImageData(tid, 0, 0); ox.drawImage(tc, (tx - x0) * 4, (ty - y0) * 4, tw * 4, th * 4, tx * scale, ty * scale, tw * scale, th * scale); prog(1, tiles.length);
				return new Promise(function (res) { setTimeout(res, 0); }).then(next);
			});
		}
		var al = hasAlpha(src);
		return next().then(function () {
			if (al) { var a2 = mk(w, h), ax = a2.getContext("2d"); ax.drawImage(src, 0, 0); ax.globalCompositeOperation = "source-in"; ax.fillStyle = "#fff"; ax.fillRect(0, 0, w, h); var big = mk(w * scale, h * scale), bx = big.getContext("2d"); bx.imageSmoothingQuality = "high"; bx.drawImage(a2, 0, 0, big.width, big.height); ox.globalCompositeOperation = "destination-in"; ox.drawImage(big, 0, 0); ox.globalCompositeOperation = "source-over"; }
			return { canvas: out, o: o };
		});
	}
	PE.aiUpscale = function () {
		var d = PE.doc; if (!d) { PE.toast("Open an image first"); return; } if (busy) return;
		var px = 0, count = 0; d.layers.forEach(function (L) { if (L.type !== "text" && L.type !== "group" && !L.eq) { px += L.canvas.width * L.canvas.height; count++; } });
		var wrap = el("div"), f = PE.form([{ k: "s", label: "Make it", type: "seg", options: [["2", "2× bigger"], ["4", "4× bigger"]], val: (PE.savedParams.up && PE.savedParams.up.s) || "2" }], function () { info(); });
		var info = function () { var s = +f.get().s, W = d.w * s, H = d.h * s, ok = W <= PE.MAXPX && H <= PE.MAXPX && W * H <= PE.MAXAREA, tiles = Math.ceil(px / (128 * 128)); note.innerHTML = "Result: <b>" + W + " × " + H + " px</b> (" + (W * H / 1e6).toFixed(1) + " MP)." + (ok ? "" : ' <span style="color:#ff8a80">Too large for a browser: choose 2× or shrink the image first.</span>') + "<br>About " + tiles + " small tiles to process: seconds on a computer with a GPU, roughly " + Math.max(1, Math.round(tiles * 1.0 / 60)) + " min without one."; };
		wrap.appendChild(f.el); var note = el("p", "pe-hint2"), bar = el("div", "pe-aibar"), fill = el("i"), st = el("div", "pe-hint2"); bar.appendChild(fill); bar.hidden = true; wrap.appendChild(note); wrap.appendChild(el("p", "pe-hint2", "Adds real detail to small or soft pictures (photos, screenshots, logos). First use downloads a 5 MB AI model and keeps it in your browser; everything runs on your device.")); wrap.appendChild(bar); wrap.appendChild(st); info();
		cancelled = false; var m = PE.modal({ title: "Upscale with AI", body: wrap, sticky: true, onClose: function () { if (busy) cancelled = true; } , buttons: [{ label: "Cancel", act: function (mm) { mm.close(); } }, { label: "Upscale", primary: true, act: function (mm) { go(mm); } }] });
		function go(mm) {
			if (busy) return; var s = +f.get().s, W = d.w * s, H = d.h * s; if (W > PE.MAXPX || H > PE.MAXPX || W * H > PE.MAXAREA) { PE.toast("That result would be too large"); return; }
			PE.savedParams.up = f.get(); busy = true; cancelled = false; bar.hidden = false; var btns = mm.el.querySelectorAll(".pe-dlg-f .pe-btn"); btns[1].disabled = true; btns[1].textContent = "Working…"; st.textContent = "Loading the AI engine…";
			PE.aiRt.session(KEY, MODEL, MB, function (g, t) { fill.style.width = (100 * g / t) + "%"; st.textContent = "Downloading the model… " + (g / 1e6).toFixed(1) + " of " + (t / 1e6).toFixed(1) + " MB"; }).then(function (o) {
				var done = 0, total = 0, layers = d.layers.filter(function (L) { return L.type !== "text" && L.type !== "group" && !L.eq; }); layers.forEach(function (L) { var T = o.provider === "webgpu" ? 256 : 128; total += Math.ceil(L.canvas.width / T) * Math.ceil(L.canvas.height / T); }); var t0 = Date.now();
				function prog(a) { done += a; fill.style.width = (100 * done / total) + "%"; var el2 = (Date.now() - t0) / 1000, eta = done ? el2 / done * (total - done) : 0; st.textContent = "Upscaling… tile " + done + " of " + total + (eta > 3 ? " (about " + Math.round(eta) + " s left)" : "") + (o.provider === "wasm" ? " · no GPU found, using the CPU" : ""); }
				var results = []; var chain = Promise.resolve(); layers.forEach(function (L) { chain = chain.then(function () { PE.bake(L); return upscaleCanvas(L.canvas, s, o, prog).then(function (r) { o = r.o; var nm = null; if (L.mask) nm = PE.resample(L.mask, r.canvas.width, r.canvas.height); results.push({ L: L, c: r.canvas, m: nm }); }); }); });
				return chain.then(function () { return results; });
			}).then(function (results) {
				if (cancelled) return; results.forEach(function (r) { r.L.canvas = r.c; if (r.m) r.L.mask = r.m; r.L.rev++; });
				d.layers.forEach(function (L) { var cx = L.cx * s, cy = L.cy * s; if (L.type === "text") { L.text.size *= s; L.text.strokeW *= s; L.text.shadowBlur *= s; L.text.shadowDx *= s; L.text.shadowDy *= s; L.text.bgPad *= s; L.text.bgRadius *= s; PE.renderText(L); L.cx = cx; L.cy = cy; } else { L.cx = cx; L.cy = cy; if (L.eq) { L.sx *= s; L.sy *= s; L.eq.size *= s; L.eq.nw *= s; L.eq.pad *= s; L.eq.radius *= s; } } });
				d.w = W; d.h = H; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Upscale " + s + "× (AI)"); PE.fit(); busy = false; mm.close(true); PE.toast("Done: " + W + " × " + H + " px");
			}).catch(function (e) { busy = false; if (cancelled || (e && e.message === "cancelled")) return; btns[1].disabled = false; btns[1].textContent = "Try again"; bar.hidden = true; st.textContent = "Could not upscale: " + (e && e.message ? e.message : e); });
		}
	};
})();

/* MES Photo Editor: LaTeX equations as layers. MathJax 3.2.2 (tex-svg from cdnjs, loaded on first use, `fontCache: none` so the SVG is self-contained) typesets the TeX to SVG at the requested
 * font size, the SVG is rasterised at 2x (so it stays crisp when enlarged: the layer's scale is 1/2) onto a transparent canvas, optionally on a rounded background box. The TeX source and
 * options are kept on the layer (`L.eq`), so Equation tool / double-click re-opens the dialog and re-renders it, keeping the position and any scaling you applied. Pasting text that looks like
 * LaTeX opens the dialog with it. Painting on or adjusting an equation layer turns it into plain pixels (`eq` cleared). */
(function () {
	"use strict";
	var PE = window.PE, mk = PE.mk, el = PE.el, esc = PE.esc;
	var JS = "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js", K = 2, loading = null;
	function loadMJ() {
		if (window.MathJax && window.MathJax.tex2svg) return window.MathJax.startup.promise.then(function () { return window.MathJax; });
		if (loading) return loading;
		window.MathJax = { tex: { processEnvironments: true, tags: "ams", macros: { xleftrightarrow: ["\\overset{#1}{\\longleftrightarrow}", 1], xLeftrightarrow: ["\\overset{#1}{\\Longleftrightarrow}", 1] } }, svg: { fontCache: "none" }, options: { enableMenu: false }, startup: { typeset: false } };
		loading = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = JS; s.onload = function () { window.MathJax.startup.promise.then(function () { res(window.MathJax); }); }; s.onerror = function () { loading = null; rej(new Error("Could not load the equation engine (offline?)")); }; document.head.appendChild(s); });
		return loading;
	}
	/* eq = {tex, size, color, display, bgOn, bg, pad, radius} -> Promise<{canvas, k, nw}> (rejects with Error(message) for invalid TeX) */
	PE.renderEquation = function (eq, k) {
		k = k || K;
		return loadMJ().then(function (MJ) {
			var size = Math.max(8, eq.size || 96), node = MJ.tex2svg(eq.tex || "", { display: eq.display !== false, em: size, ex: size / 2, containerWidth: 1e6 }), bad = node.querySelector("[data-mjx-error]");
			if (bad) throw new Error(bad.getAttribute("data-mjx-error") || "Invalid LaTeX");
			var svg = node.querySelector("svg"), ex = size / 2, w = parseFloat(svg.getAttribute("width")) * ex, h = parseFloat(svg.getAttribute("height")) * ex;
			svg.setAttribute("xmlns", "http://www.w3.org/2000/svg"); svg.setAttribute("width", w * k); svg.setAttribute("height", h * k); svg.removeAttribute("style");
			var src = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, eq.color || "#000000");
			return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("Could not draw the equation")); }; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src); }).then(function (im) {
				var pad = eq.bgOn ? Math.round((eq.pad || 0) * k) : Math.round(size * 0.04 * k), W = Math.ceil(w * k) + pad * 2, H = Math.ceil(h * k) + pad * 2; if (W * H > PE.MAXAREA) throw new Error("That equation is too large");
				var c = mk(W, H), x = c.getContext("2d");
				if (eq.bgOn) { var r = Math.min((eq.radius || 0) * k, W / 2, H / 2); x.fillStyle = eq.bg || "#ffffff"; x.beginPath(); x.moveTo(r, 0); x.arcTo(W, 0, W, H, r); x.arcTo(W, H, 0, H, r); x.arcTo(0, H, 0, 0, r); x.arcTo(0, 0, W, 0, r); x.closePath(); x.fill(); }
				x.drawImage(im, pad, pad, w * k, h * k); return { canvas: c, k: k, nw: W / k };
			});
		});
	};
	var DEF = { tex: "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", size: 96, color: "#ffffff", display: true, bgOn: false, bg: "#ffffff", pad: 24, radius: 16 };
	var last = null; try { last = JSON.parse(localStorage.getItem("mes-photo-editor:eq") || "null"); } catch (e) {}
	var SNIP = [["a/b", "\\frac{a}{b}"], ["√", "\\sqrt{x}"], ["xⁿ", "x^{n}"], ["xₙ", "x_{n}"], ["∫", "\\int_{a}^{b} f(x)\\,dx"], ["∑", "\\sum_{n=1}^{\\infty} a_n"], ["lim", "\\lim_{x \\to 0}"], ["∂", "\\frac{\\partial f}{\\partial x}"], ["vector", "\\vec{r}\\,'(t)"], ["| |", "\\left| x \\right|"], ["matrix", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"], ["cases", "\\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}"], ["align", "\\begin{aligned} a &= b + c \\\\ &= d \\end{aligned}"], ["π θ λ", "\\pi \\theta \\lambda \\alpha \\beta"], ["boxed", "\\boxed{x = 1}"]];
	/* edit: an existing equation layer (re-render it), else insert a new one centred at `at` (doc coordinates) */
	PE.dlgEquation = function (edit, at, prefill) {
		if (!PE.doc) { PE.toast("Open or create an image first"); return; }
		var base = edit && edit.eq ? edit.eq : (last || DEF), eq = JSON.parse(JSON.stringify(base)); if (!edit) { eq.color = PE.fg === "#e53935" && !last ? eq.color : eq.color; if (prefill) eq.tex = prefill; }
		var wrap = el("div"), ta = el("textarea", "pe-tex"); ta.value = eq.tex; ta.rows = 4; ta.spellcheck = false; ta.setAttribute("aria-label", "LaTeX"); wrap.appendChild(ta);
		var chips = el("div", "pe-snips"); SNIP.forEach(function (sn) { var b = el("button", "pe-chip2", esc(sn[0])); b.type = "button"; b.title = sn[1]; b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", function () { var a = ta.selectionStart, z = ta.selectionEnd; ta.setRangeText(sn[1], a, z, "end"); ta.focus(); upd(); }); chips.appendChild(b); }); wrap.appendChild(chips);
		var f = PE.form([{ k: "size", label: "Size", type: "range", min: 16, max: 400, step: 1, val: eq.size, unit: "px" }, { k: "color", label: "Colour", type: "color", val: eq.color }, { k: "display", label: "Large style (display)", type: "check", val: eq.display }, { k: "bgOn", label: "Background box", type: "check", val: eq.bgOn }, { k: "bg", label: "Box colour", type: "color", val: eq.bg }, { k: "pad", label: "Padding", type: "range", min: 0, max: 120, step: 1, val: eq.pad, unit: "px" }, { k: "radius", label: "Corners", type: "range", min: 0, max: 80, step: 1, val: eq.radius, unit: "px" }], function () { vis(); upd(); });
		wrap.appendChild(f.el); function vis() { var v = f.get(); ["bg", "pad", "radius"].forEach(function (k) { f.inputs[k].inp.closest(".pe-row").style.display = v.bgOn ? "" : "none"; }); } vis();
		var prev = el("div", "pe-eqprev"), err = el("div", "pe-eqerr"); wrap.appendChild(prev); wrap.appendChild(err);
		var tmr = 0, token = 0, cur = null;
		function upd() { clearTimeout(tmr); tmr = setTimeout(draw, 160); }
		function get() { var v = f.get(); v.tex = ta.value; return v; }
		function draw() { var my = ++token, v = get(); if (!v.tex.trim()) { prev.innerHTML = ""; err.textContent = ""; cur = null; return; } PE.renderEquation(v, 1).then(function (r) { if (my !== token) return; cur = v; err.textContent = ""; r.canvas.style.maxWidth = "100%"; r.canvas.style.maxHeight = "9em"; prev.innerHTML = ""; prev.appendChild(r.canvas); }).catch(function (e) { if (my !== token) return; err.textContent = e.message; }); }
		ta.addEventListener("input", upd); ta.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); go(); } });
		var m = PE.modal({ title: edit ? "Edit equation" : "Insert equation (LaTeX)", wide: true, body: wrap, noFocus: true, buttons: [{ label: "Cancel", act: function (mm) { mm.close(); } }, { label: edit ? "Update" : "Insert", primary: true, act: function () { go(); } }] });
		setTimeout(function () { ta.focus(); ta.select(); }, 30); draw();
		function go() {
			var v = get(); if (!v.tex.trim()) { PE.toast("Type some LaTeX first"); return; }
			PE.renderEquation(v, K).then(function (r) {
				last = v; try { localStorage.setItem("mes-photo-editor:eq", JSON.stringify(v)); } catch (e) {} v.k = K; v.nw = r.nw; var name = "Eq: " + v.tex.replace(/\s+/g, " ").slice(0, 24);
				if (edit) { var ur = Math.abs(edit.sx) * edit.canvas.width / (edit.eq.nw || (edit.canvas.width / K)), sgx = edit.sx < 0 ? -1 : 1, sgy = edit.sy < 0 ? -1 : 1; edit.canvas = r.canvas; edit.sx = sgx * ur / K; edit.sy = sgy * ur / K; edit.eq = v; edit.name = name; edit.mask = null; edit.rev++; PE.commit("Edit equation"); }
				else { var L = PE.makeLayer({ canvas: r.canvas, name: name, cx: at ? at.x : PE.doc.w / 2, cy: at ? at.y : PE.doc.h / 2 }); L.sx = L.sy = 1 / K; L.eq = v; PE.addLayer(L); PE.commit("Insert equation"); }
				m.close(true); PE.setTool("move");
			}).catch(function (e) { err.textContent = e.message; });
		}
	};
	PE.looksLikeLatex = function (t) { t = String(t || "").trim(); return t.length > 1 && t.length < 4000 && (/\\[a-zA-Z]{2,}/.test(t) || /[\^_]\{/.test(t) || /^\$.*\$$/.test(t)); };
	PE.defTool({ id: "equation", name: "Equation (LaTeX)", key: "q", icon: "∑", opts: {}, ui: [{ type: "button", label: "Insert equation…", act: function () { PE.dlgEquation(null, null); } }, { type: "button", label: "Edit selected equation", act: function () { var L = PE.active(); if (L && L.eq) PE.dlgEquation(L); else PE.toast("Select an equation layer first"); } }],
		hint: "Click where the equation should go, type LaTeX (a live preview appears), then Insert. Click an existing equation to edit it. Equations stay sharp when you enlarge them.",
		down: function (e) { var hit = PE.layerAt(e.x, e.y); if (hit && hit.eq) { PE.setActive(hit.id); PE.dlgEquation(hit); return; } PE.dlgEquation(null, { x: e.x, y: e.y }); } });
})();

/* MES Photo Editor -- mes.fm/photo-editor. UI: menus, tool + options bars, colour / layers / history panels, files (open, drop, paste, PSD, project),
 * shortcuts, autosave. Engine = core.js (layers, history, selection), tools.js / tools2.js, dialogs.js; pixel maths = lib.js (MESPixel, node-tested). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pe"); if (!root) return;
	var PE = window.PE, P = window.MESPixel, I = window.MESImg, el = PE.el, esc = PE.esc;
	var KEY = "mes-photo-editor:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	PE.els = { root: root, main: $("pe-main"), over: $("pe-over"), textedit: $("pe-textedit"), stage: $("pe-stage") };
	PE.toast = function (t) { var e = document.querySelector(".tu-toast"); if (!e) { e = document.createElement("div"); e.className = "tu-toast"; document.body.appendChild(e); } e.textContent = t; e.classList.add("tu-toast--show"); clearTimeout(PE.toast.t); PE.toast.t = setTimeout(function () { e.classList.remove("tu-toast--show"); }, 2600); };
	var S = sget();

	/* ---------- colours ---------- */
	PE.fg = S.fg || "#e53935"; PE.bg = S.bg || "#ffffff"; var recent = S.recent || [];
	PE.setFg = function (c) { PE.fg = c; pushRecent(c); PE.emit("color"); sset({ fg: c }); };
	PE.setBg = function (c) { PE.bg = c; PE.emit("color"); sset({ bg: c }); };
	function pushRecent(c) { recent = [c].concat(recent.filter(function (x) { return x !== c; })).slice(0, 12); sset({ recent: recent }); }
	var PALETTE = ["#e53935", "#fb8c00", "#ffeb3b", "#43a047", "#1e88e5", "#8e24aa", "#ffffff", "#9e9e9e", "#000000"];

	/* ---------- stage size ---------- */
	function resize() { var r = PE.els.stage.getBoundingClientRect(), v = PE.view; v.w = Math.max(10, Math.floor(r.width)); v.h = Math.max(10, Math.floor(r.height)); v.dpr = Math.min(3, window.devicePixelRatio || 1); [PE.els.main, PE.els.over].forEach(function (c) { c.style.width = v.w + "px"; c.style.height = v.h + "px"; }); if (PE.doc && PE.autoFit) PE.fit(); else PE.invalidate(); }
	new ResizeObserver(resize).observe(PE.els.stage);
	var _fit = PE.fit; PE.fit = function (p) { PE.autoFit = true; _fit(p); }; var _sz = PE.setZoom; PE.setZoom = function (z, x, y) { PE.autoFit = false; _sz(z, x, y); }; var _pb = PE.panBy; PE.panBy = function (dx, dy) { PE.autoFit = false; _pb(dx, dy); };

	/* ---------- tool bar ---------- */
	var ORDER = ["move", "marquee", "lasso", "wand", "crop", "brush", "eraser", "clone", "retouch", "objerase", "bucket", "gradient", "eyedropper", "text", "equation", "shape", "hand", "zoom"];
	function buildTools() {
		var box = $("pe-tools"); box.innerHTML = "";
		ORDER.forEach(function (id) { var t = PE.tools[id]; if (!t) return; var b = el("button", "pe-tool", esc(t.icon)); b.type = "button"; b.dataset.t = id; b.title = t.name + " (" + t.key.toUpperCase() + ")"; b.setAttribute("aria-label", t.name); b.addEventListener("click", function () { PE.setTool(id); }); box.appendChild(b); });
	}
	PE.on("tool", function () { Array.prototype.forEach.call($("pe-tools").children, function (b) { b.setAttribute("aria-pressed", b.dataset.t === PE.toolId ? "true" : "false"); }); var t = PE.tool(); if (t.activate) t.activate(); buildOpts(); $("pe-hint").textContent = t.hint || ""; setCursor(); });
	function setCursor() { PE.els.over.style.cursor = PE.tool().cursorSize ? "none" : PE.toolId === "hand" ? "grab" : PE.toolId === "zoom" ? "zoom-in" : PE.toolId === "text" ? "text" : PE.toolId === "move" ? "default" : "crosshair"; }

	/* ---------- options bar ---------- */
	function buildOpts() {
		var box = $("pe-opts"), t = PE.tool(), id = t.id, kind = PE.opt[id] && PE.opt[id].kind; box.innerHTML = ""; var name = el("span", "pe-opt-name", esc(t.name)); box.appendChild(name);
		(t.ui || []).forEach(function (u) {
			if (u.showFor && u.showFor.indexOf(kind) < 0) return; if (u.hideFor && u.hideFor.indexOf(kind) >= 0) return; if (u.show && !PE.optGet(id, u.show)) return;
			if (u.type === "button") { var b = el("button", "pe-btn pe-btn--sm", esc(u.label)); b.type = "button"; b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", u.act); box.appendChild(b); return; }
			var w = el("label", "pe-opt"), v = PE.optGet(id, u.k), inp; w.appendChild(el("span", "pe-opt-l", esc(u.label)));
			if (u.type === "check") { inp = el("input"); inp.type = "checkbox"; inp.checked = !!v; inp.addEventListener("change", function () { PE.optSet(id, u.k, inp.checked); buildOpts(); }); }
			else if (u.type === "select") { inp = el("select"); var opts = u.options === "fonts" ? PE.FONTS : u.options; opts.forEach(function (o) { var op = el("option", null, esc(o[1])); op.value = o[0]; inp.appendChild(op); }); inp.value = v; inp.addEventListener("change", function () { PE.optSet(id, u.k, u.num ? +inp.value : inp.value); buildOpts(); }); }
			else if (u.type === "seg") { inp = el("span", "pe-seg"); u.options.forEach(function (o) { var b = el("button", null, esc(o[1])); b.type = "button"; b.setAttribute("aria-pressed", String(v) === String(o[0]) ? "true" : "false"); b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", function () { PE.optSet(id, u.k, o[0]); buildOpts(); }); inp.appendChild(b); }); }
			else if (u.type === "color") { inp = el("input"); inp.type = "color"; inp.value = v; inp.addEventListener("input", function () { PE.optSet(id, u.k, inp.value); }); }
			else if (u.type === "number") { inp = el("input", "pe-num"); inp.type = "number"; inp.value = v; inp.addEventListener("input", function () { PE.optSet(id, u.k, +inp.value); }); }
			else { inp = el("input"); inp.type = "range"; inp.min = u.min; inp.max = u.max; inp.step = u.step; inp.value = v; var out = el("span", "pe-opt-v", fmtV(v, u)); inp.addEventListener("input", function () { PE.optSet(id, u.k, +inp.value); out.textContent = fmtV(+inp.value, u); }); w.appendChild(inp); w.appendChild(out); box.appendChild(w); return; }
			w.appendChild(inp); box.appendChild(w);
		});
		if (id === "text" || id === "shape") { }
	}
	function fmtV(v, u) { return (u.step < 1 ? (+v).toFixed(2) : Math.round(v)) + (u.unit || ""); }
	var optsTimer = 0; PE.on("opts", function (id) { if (id === PE.toolId) { clearTimeout(optsTimer); optsTimer = setTimeout(function () { if (!document.activeElement || document.activeElement.type !== "range") buildOpts(); }, 10); } sset({ opt: PE.opt }); });
	PE.on("active", function () { if (PE.toolId === "text") buildOpts(); });
	PE.on("fonts", buildOpts);

	/* ---------- colour panel ---------- */
	function buildColor() {
		var box = $("pe-colors"); box.innerHTML = "";
		var sw = el("div", "pe-sw"), bgb = el("label", "pe-sw-bg"), fgb = el("label", "pe-sw-fg"); bgb.style.background = PE.bg; fgb.style.background = PE.fg; bgb.title = "Background colour"; fgb.title = "Foreground colour (brush, shapes, text outline)";
		var fi = el("input"); fi.type = "color"; fi.value = PE.fg; fi.addEventListener("input", function () { PE.fg = fi.value; fgb.style.background = fi.value; hexIn.value = fi.value; PE.emit("color-live"); }); fi.addEventListener("change", function () { PE.setFg(fi.value); });
		var bi = el("input"); bi.type = "color"; bi.value = PE.bg; bi.addEventListener("input", function () { PE.bg = bi.value; bgb.style.background = bi.value; }); bi.addEventListener("change", function () { PE.setBg(bi.value); });
		fgb.appendChild(fi); bgb.appendChild(bi); sw.appendChild(bgb); sw.appendChild(fgb);
		var swap = el("button", "pe-mini", "⇄"); swap.type = "button"; swap.title = "Swap colours (X)"; swap.addEventListener("click", swapColors); var def = el("button", "pe-mini", "◐"); def.type = "button"; def.title = "Default colours: black and white (D)"; def.addEventListener("click", function () { PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color"); });
		var hexIn = el("input", "pe-hex"); hexIn.value = PE.fg; hexIn.maxLength = 7; hexIn.title = "Foreground colour hex"; hexIn.addEventListener("change", function () { var h = hexIn.value.trim(); if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) { if (h[0] !== "#") h = "#" + h; if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; PE.setFg(h.toLowerCase()); } else hexIn.value = PE.fg; });
		var top = el("div", "pe-col-top"); top.appendChild(sw); var bt = el("div", "pe-col-b"); bt.appendChild(swap); bt.appendChild(def); bt.appendChild(hexIn); top.appendChild(bt); box.appendChild(top);
		var pal = el("div", "pe-pal"); PALETTE.concat(recent.filter(function (c) { return PALETTE.indexOf(c) < 0; }).slice(0, 6)).forEach(function (c) { var b = el("button", "pe-chip"); b.type = "button"; b.style.background = c; b.title = c + " (click: foreground, Shift-click: background)"; b.addEventListener("click", function (e) { e.shiftKey ? PE.setBg(c) : PE.setFg(c); }); pal.appendChild(b); }); box.appendChild(pal);
	}
	function swapColors() { var t = PE.fg; PE.fg = PE.bg; PE.bg = t; sset({ fg: PE.fg, bg: PE.bg }); PE.emit("color"); }
	PE.on("color", buildColor);

	/* ---------- layers panel ---------- */
	var thumbs = {};
	function thumbFor(L) {
		var k = L.id, t = thumbs[k]; if (t && t.rev === L.rev && t.w === L.canvas.width) return t.c;
		var c = PE.mk(36, 36), x = c.getContext("2d"); x.fillStyle = "#555"; x.fillRect(0, 0, 36, 36); x.fillStyle = "#777"; for (var i = 0; i < 36; i += 6) for (var j = 0; j < 36; j += 6) if (((i + j) / 6) % 2 === 0) x.fillRect(i, j, 6, 6);
		var s = Math.min(36 / L.canvas.width, 36 / L.canvas.height); x.drawImage(L.canvas, (36 - L.canvas.width * s) / 2, (36 - L.canvas.height * s) / 2, L.canvas.width * s, L.canvas.height * s); thumbs[k] = { c: c, rev: L.rev, w: L.canvas.width }; return c;
	}
	var dragId = null, multi = {}, lfilter = "";
	PE.multi = function () { return PE.doc ? PE.doc.layers.filter(function (L) { return multi[L.id]; }) : []; };
	function rowsTopDown() {
		var d = PE.doc, q = lfilter.trim().toLowerCase(), out = [];
		d.layers.slice().reverse().forEach(function (L) {
			var anc = PE.ancestorsOf(L); if (!q && anc.some(function (a) { return a.collapsed; })) return;
			if (q) { var hit = L.name.toLowerCase().indexOf(q) >= 0 || (PE.isGroup(L) && PE.descendants(L).some(function (k) { return k.name.toLowerCase().indexOf(q) >= 0; })); if (!hit) return; }
			out.push({ L: L, depth: anc.length });
		});
		return out;
	}
	function buildLayers() {
		var list = $("pe-layers"), d = PE.doc; list.innerHTML = ""; if (!d) return; var act = PE.active(), rows = rowsTopDown(); PE.relink();
		rows.forEach(function (r) {
			var L = r.L, grp = PE.isGroup(L), on = L === act || multi[L.id], hidden = !PE.effVisible(L) && !grp ? true : !L.visible;
			var row = el("div", "pe-layer" + (on ? " is-active" : "") + (hidden ? " is-hidden" : "") + (grp ? " is-group" : "")); row.draggable = true; row.dataset.id = L.id; row.style.paddingLeft = (0.3 + r.depth * 1.1) + "em";
			var eye = el("button", "pe-eye", L.visible ? "👁" : "—"); eye.type = "button"; eye.title = "Show / hide"; eye.addEventListener("click", function (e) { e.stopPropagation(); L.visible = !L.visible; PE.touch(L); PE.commit("Toggle visibility"); });
			row.appendChild(eye);
			if (grp) { var ar = el("button", "pe-arrow", L.collapsed ? "▸" : "▾"); ar.type = "button"; ar.title = L.collapsed ? "Expand group" : "Collapse group"; ar.addEventListener("click", function (e) { e.stopPropagation(); L.collapsed = !L.collapsed; buildLayers(); }); row.appendChild(ar); var th0 = el("span", "pe-th pe-th--grp", "📁"); row.appendChild(th0); }
			else { var th = el("span", "pe-th"); th.appendChild(thumbFor(L)); row.appendChild(th); }
			var nm = el("span", "pe-lname", esc(L.name) + (L.type === "text" ? " ᵀ" : "") + (grp ? ' <small class="pe-cnt">' + PE.descendants(L).filter(function (k) { return !PE.isGroup(k); }).length + "</small>" : "")); nm.title = "Double-click to rename";
			if (L.mask) { var mt = el("span", "pe-th pe-th--mask" + (L.editMask ? " is-on" : "")); var mc = PE.mk(36, 36), mx = mc.getContext("2d"); mx.fillStyle = "#000"; mx.fillRect(0, 0, 36, 36); var wm = PE.mk(36, 36), wx = wm.getContext("2d"); wx.drawImage(L.mask, 0, 0, 36, 36); wx.globalCompositeOperation = "source-in"; wx.fillStyle = "#fff"; wx.fillRect(0, 0, 36, 36); mx.drawImage(wm, 0, 0); mt.appendChild(mc); mt.title = "Layer mask: click to paint on the mask (white-ish = shown). Click the picture to paint on the layer."; mt.addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(L.id); L.editMask = true; buildLayers(); }); row.querySelector(".pe-th").addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(L.id); L.editMask = false; buildLayers(); }); row.appendChild(mt); }
			row.appendChild(nm); if (L.locked) row.appendChild(el("span", "pe-lock", "🔒"));
			row.addEventListener("click", function (e) {
				if (e.ctrlKey || e.metaKey) { multi[L.id] = !multi[L.id]; if (!Object.keys(multi).some(function (k) { return multi[k]; })) multi = {}; else multi[act ? act.id : L.id] = true; buildLayers(); return; }
				if (e.shiftKey && act) { var order = rowsTopDown().map(function (x) { return x.L; }), i0 = order.indexOf(act), i1 = order.indexOf(L); if (i0 >= 0 && i1 >= 0) { multi = {}; order.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).forEach(function (x) { multi[x.id] = true; }); buildLayers(); return; } }
				multi = {}; PE.setActive(L.id);
			});
			nm.addEventListener("dblclick", function (e) { e.stopPropagation(); var inp = el("input", "pe-rename"); inp.value = L.name; nm.replaceWith(inp); inp.focus(); inp.select(); var done = function (ok) { if (ok && inp.value.trim()) { L.name = inp.value.trim(); PE.commit("Rename layer"); } else buildLayers(); }; inp.addEventListener("keydown", function (ev) { ev.stopPropagation(); if (ev.key === "Enter") done(true); if (ev.key === "Escape") done(false); }); inp.addEventListener("blur", function () { done(true); }); });
			row.addEventListener("dragstart", function (e) { dragId = L.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pe-layer", String(L.id)); });
			function zoneOf(e) { var rc = row.getBoundingClientRect(), y = (e.clientY - rc.top) / rc.height; return grp ? (y < 0.25 ? "above" : "into") : (y < 0.5 ? "above" : "below"); }
			row.addEventListener("dragover", function (e) { if (dragId == null) return; e.preventDefault(); row.classList.remove("is-over-above", "is-over-below", "is-over-into"); row.classList.add("is-over-" + zoneOf(e)); });
			row.addEventListener("dragleave", function () { row.classList.remove("is-over-above", "is-over-below", "is-over-into"); });
			row.addEventListener("drop", function (e) { if (dragId == null) return; e.preventDefault(); e.stopPropagation(); var src = PE.layerById(dragId), z = zoneOf(e); dragId = null; if (src && src !== L) PE.relocate(src, L, z); });
			list.appendChild(row);
		});
		syncLayerProps();
	}
	$("pe-layers").addEventListener("dragover", function (e) { if (dragId != null) e.preventDefault(); });
	$("pe-layers").addEventListener("drop", function (e) { if (dragId == null || !PE.doc) return; e.preventDefault(); var src = PE.layerById(dragId); dragId = null; var tops = PE.doc.layers.filter(function (x) { return x.group == null; }); var top = tops[tops.length - 1]; if (src && top && top !== src) PE.relocate(src, top, "above"); });
	$("pe-lfilter").addEventListener("input", function () { lfilter = this.value; buildLayers(); });
	PE.on("layers", function () { if (!PE.doc) return; var ids = {}; PE.doc.layers.forEach(function (L) { ids[L.id] = 1; }); for (var k in multi) if (!ids[k]) delete multi[k]; });
	function groupSelected() { var m = PE.multi(), act = PE.active(); var list = m.length > 1 ? m : (act ? [act] : []); if (!list.length) { PE.toast("Select layers first (Ctrl-click to select several)"); return; } if (list.length === 1 && PE.isGroup(list[0])) { PE.ungroup(list[0]); return; } multi = {}; PE.groupLayers(list); }
	PE.groupSelected = groupSelected;
	function syncLayerProps() {
		var L = PE.active(); var bl = $("pe-blend"), op = $("pe-opacity"), ov = $("pe-opacity-v"); if (!L) return; bl.value = L.blend; bl.disabled = PE.isGroup(L); op.value = Math.round(L.opacity * 100); ov.textContent = Math.round(L.opacity * 100) + "%";
		$("pe-lock").setAttribute("aria-pressed", L.locked ? "true" : "false"); $("pe-mask-btn").title = L.mask ? "Delete layer mask" : "Add layer mask (reveal all; with a selection: reveal the selection)"; $("pe-mask-btn").setAttribute("aria-pressed", L.mask ? "true" : "false");
	}
	PE.on("layers", buildLayers); PE.on("active", buildLayers);
	function buildHistory() {
		var list = $("pe-history"); list.innerHTML = ""; var H = PE.hist;
		H.stack.forEach(function (e, i) { var r = el("button", "pe-hrow" + (i === H.idx ? " is-active" : "") + (i > H.idx ? " is-future" : ""), esc(e.label)); r.type = "button"; r.addEventListener("click", function () { PE.gotoHistory(i); }); list.appendChild(r); });
		var a = list.querySelector(".is-active"); if (a) a.scrollIntoView({ block: "nearest" });
		$("pe-undo").disabled = H.idx <= 0; $("pe-redo").disabled = H.idx >= H.stack.length - 1;
	}
	PE.on("history", buildHistory);
	function askName(title, val, ok) { var w = el("div"), f = PE.form([{ k: "n", label: "Name", type: "text", val: val }], null); w.appendChild(f.el); PE.modal({ title: title, body: w, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "OK", primary: true, act: function (m) { var v = f.get().n.trim(); m.close(); if (v) ok(v); } }] }); }
	function buildComps() {
		var box = $("pe-comps"); box.innerHTML = ""; if (!PE.doc) return; var comps = PE.doc.comps || [];
		if (!comps.length) { box.appendChild(el("p", "pe-hint2", "A comp remembers which layers and groups are shown, and where they are. Set up one thumbnail, press + Save current view, change what is visible, save another... then Export all makes a picture of each.")); return; }
		comps.forEach(function (c, i) {
			var on = PE.compMatches(c), row = el("div", "pe-comp" + (on ? " is-active" : "")), nm = el("button", "pe-compname", esc(c.name)); nm.type = "button"; nm.title = on ? "This is what is showing now" : "Click to show this comp"; nm.addEventListener("click", function () { PE.compApply(c); });
			row.appendChild(nm);
			[["⟳", "Update this comp with what is showing now", function () { PE.compUpdate(c); }], ["✎", "Rename", function () { askName("Rename comp", c.name, function (v) { PE.compRename(c, v); }); }], ["▲", "Move up", function () { PE.compMove(c, -1); }], ["▼", "Move down", function () { PE.compMove(c, 1); }], ["🗑", "Delete comp", function () { PE.compDelete(c); }]].forEach(function (b) { var bt = el("button", "pe-mini pe-mini--s", b[0]); bt.type = "button"; bt.title = b[1]; bt.addEventListener("click", b[2]); row.appendChild(bt); });
			box.appendChild(row);
		});
	}
	PE.on("comps", buildComps); PE.on("history", buildComps);
	function showTab(t) { $("pe-history").hidden = t !== "hist"; $("pe-compspane").hidden = t !== "comps"; $("pe-tab-hist").setAttribute("aria-pressed", t === "hist" ? "true" : "false"); $("pe-tab-comps").setAttribute("aria-pressed", t === "comps" ? "true" : "false"); sset({ tab: t }); }
	$("pe-tab-hist").addEventListener("click", function () { showTab("hist"); }); $("pe-tab-comps").addEventListener("click", function () { showTab("comps"); });
	$("pe-comp-new").addEventListener("click", function () { if (!PE.doc) return; askName("Save comp", "Comp " + ((PE.doc.comps || []).length + 1), function (v) { PE.compSave(v); }); });
	$("pe-comp-exp").addEventListener("click", function () { PE.dlgExportComps(); });
	function stepComp(dir) { var d = PE.doc; if (!d || !(d.comps || []).length) return; var i = -1; d.comps.forEach(function (c, k) { if (PE.compMatches(c)) i = k; }); var j = i < 0 ? (dir > 0 ? 0 : d.comps.length - 1) : (i + dir + d.comps.length) % d.comps.length; PE.compApply(d.comps[j]); PE.toast(d.comps[j].name); }
	$("pe-blend").innerHTML = PE.BLENDS.map(function (b) { return '<option value="' + b[0] + '">' + b[1] + "</option>"; }).join("");
	$("pe-blend").addEventListener("change", function () { var L = PE.active(); if (L) { L.blend = this.value; PE.touch(L); PE.commit("Blend mode"); } });
	var opTimer = 0; $("pe-opacity").addEventListener("input", function () { var L = PE.active(); if (!L) return; L.opacity = this.value / 100; $("pe-opacity-v").textContent = this.value + "%"; PE.invalidate(); clearTimeout(opTimer); opTimer = setTimeout(function () { PE.commit("Layer opacity"); }, 400); });
	function lbtn(id, fn) { $(id).addEventListener("click", function () { if (PE.doc) fn(); }); }
	lbtn("pe-lnew", function () { PE.newRasterLayer(); }); lbtn("pe-lgroup", function () { groupSelected(); }); lbtn("pe-ldup", function () { PE.duplicateLayer(); }); lbtn("pe-ldel", function () { PE.deleteLayer(); }); lbtn("pe-lmerge", function () { PE.mergeDown(); });
	lbtn("pe-lock", function () { var L = PE.active(); L.locked = !L.locked; PE.commit(L.locked ? "Lock layer" : "Unlock layer"); });
	lbtn("pe-mask-btn", function () { var L = PE.active(); if (L.mask) PE.deleteMask(L); else PE.addMask(L, true); });

	/* ---------- status + zoom ---------- */
	function status() { var d = PE.doc; $("pe-st-doc").textContent = d ? d.w + " × " + d.h + " px" : "No image"; $("pe-zoom").textContent = Math.round(PE.view.zoom * 100) + "%"; var L = PE.active(); $("pe-st-layer").textContent = L ? L.name + " · " + L.canvas.width + "×" + L.canvas.height : ""; }
	PE.on("view", status); PE.on("docsize", status); PE.on("layers", status); PE.on("pointer", function (p) { $("pe-st-xy").textContent = Math.floor(p.x) + ", " + Math.floor(p.y); });
	PE.on("cropinfo", function (c) { $("pe-st-xy").textContent = "crop " + c.w + " × " + c.h; });
	PE.on("docsize", function () { $("pe-empty").hidden = !!PE.doc; });
	PE.on("sel", function () { var b = PE.sel && PE.selBounds(); $("pe-st-sel").textContent = b ? "Selection " + b.w + " × " + b.h : ""; });
	$("pe-zoom").addEventListener("click", function () { PE.view.zoom === 1 ? PE.fit() : PE.setZoom(1); });
	$("pe-zin").addEventListener("click", function () { PE.setZoom(PE.view.zoom * 1.25); }); $("pe-zout").addEventListener("click", function () { PE.setZoom(PE.view.zoom / 1.25); });
	$("pe-fit").addEventListener("click", function () { PE.fit(); }); $("pe-undo").addEventListener("click", function () { PE.undo(); }); $("pe-redo").addEventListener("click", function () { PE.redo(); }); $("pe-export").addEventListener("click", function () { PE.dlgExport(); });

	/* ---------- edit actions ---------- */
	PE.clipCanvas = null;
	function copySel(cut) {
		var L = PE.active(); if (!PE.doc || !L) return; var c;
		if (PE.sel) { var b = PE.selBounds(); if (!b) return; c = PE.mk(b.w, b.h); var x = c.getContext("2d"); PE.drawLayer(x, L, [1, 0, 0, 1, -b.x, -b.y], "cp", b.w, b.h); x.globalCompositeOperation = "destination-in"; x.drawImage(PE.sel.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); }
		else { c = PE.mk(L.canvas.width, L.canvas.height); c.getContext("2d").drawImage(L.canvas, 0, 0); }
		PE.clipCanvas = c; c.toBlob(function (b) { try { navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function () {}); } catch (e) {} });
		if (cut) clearSel(); PE.toast(cut ? "Cut" : "Copied");
	}
	function copyMerged() { if (!PE.doc) return; var c = PE.flatten(), b = PE.sel && PE.selBounds(); if (b) { var n = PE.mk(b.w, b.h), x = n.getContext("2d"); x.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); x.globalCompositeOperation = "destination-in"; x.drawImage(PE.sel.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); c = n; } PE.clipCanvas = c; c.toBlob(function (bl) { try { navigator.clipboard.write([new ClipboardItem({ "image/png": bl })]).then(function () { PE.toast("Copied merged image"); }); } catch (e) { PE.toast("Copied"); } }); }
	function clearSel() { var L = PE.active(); if (!L) return; if (!PE.sel) { PE.toast("Make a selection first (or delete the layer)"); return; } if (!PE.prepare(L, false, true)) return; var t = L.editMask && L.mask ? L.mask : L.canvas, o = PE.origin(L), x = t.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-out"; x.drawImage(PE.sel.c, -o.x, -o.y); x.restore(); L.rev++; PE.commit("Clear selection"); }
	function fillSel(color) {
		var L = PE.active(); if (!PE.doc || !PE.prepare(L)) return; var o = PE.origin(L), c = PE.mk(L.canvas.width, L.canvas.height), x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
		PE.paintInto(L, c, o.x, o.y, { target: L.editMask && L.mask ? "mask" : "pixel" }); PE.commit("Fill");
	}
	function paintClipboardImage(src, name, at) { if (!PE.doc) { PE.openImageSource(src, name || "Pasted image"); PE.setTool("move"); return; } PE.placeSource(src, name || "Pasted", at); PE.setTool("move"); }
	function pasteInternal() { if (PE.clipCanvas) paintClipboardImage(PE.clipCanvas, "Pasted layer"); else if (navigator.clipboard && navigator.clipboard.read) { navigator.clipboard.read().then(function (items) { for (var i = 0; i < items.length; i++) { var t = items[i].types.filter(function (t) { return /^image\//.test(t); })[0]; if (t) { items[i].getType(t).then(function (b) { return PE.decodeFile(b); }).then(function (im) { paintClipboardImage(im, "Pasted image"); }); return; } } PE.toast("Nothing to paste"); }).catch(function () { PE.toast("Use Ctrl+V to paste an image"); }); } else PE.toast("Use Ctrl+V to paste an image"); }
	document.addEventListener("paste", function (e) {
		if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "") || PE.modalOpen()) return; var items = (e.clipboardData && e.clipboardData.items) || [];
		for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); e.preventDefault(); PE.decodeFile(f).then(function (im) { paintClipboardImage(im, "Pasted image"); }).catch(function () { PE.toast("Can't read that image"); }); return; }
		var tx = e.clipboardData && e.clipboardData.getData("text/plain"); if (tx && PE.looksLikeLatex(tx)) { e.preventDefault(); PE.dlgEquation(null, null, tx.trim().replace(/^\$+|\$+$/g, "")); return; }
		if (PE.clipCanvas) { e.preventDefault(); paintClipboardImage(PE.clipCanvas, "Pasted layer"); }
	});
	function align(how) {
		var L = PE.active(), d = PE.doc; if (!L) return; var b = PE.bounds(L), dx = 0, dy = 0;
		if (how === "left") dx = -b.x; if (how === "hcenter") dx = d.w / 2 - (b.x + b.w / 2); if (how === "right") dx = d.w - (b.x + b.w); if (how === "top") dy = -b.y; if (how === "vcenter") dy = d.h / 2 - (b.y + b.h / 2); if (how === "bottom") dy = d.h - (b.y + b.h);
		PE.translate(L, Math.round(dx), Math.round(dy)); PE.touch(L); PE.commit("Align " + (PE.isGroup(L) ? "group" : "layer"));
	}
	function fitLayer(cover) { var L = PE.active(), d = PE.doc; if (!L) return; if (PE.isGroup(L)) { PE.toast("Select a normal layer"); return; } var w = L.canvas.width, h = L.canvas.height, s = cover ? Math.max(d.w / w, d.h / h) : Math.min(d.w / w, d.h / h); L.sx = Math.sign(L.sx || 1) * s; L.sy = Math.sign(L.sy || 1) * s; L.rot = 0; L.cx = d.w / 2; L.cy = d.h / 2; PE.touch(L); PE.commit(cover ? "Fill canvas" : "Fit to canvas"); }
	function resetTransform() { var L = PE.active(); if (!L) return; if (PE.isGroup(L)) { PE.toast("Select a normal layer"); return; } L.sx = L.sy = 1; L.rot = 0; PE.touch(L); PE.commit("Reset transform"); }
	function promptNum(title, label, val, min, max, fn) { var wrap = el("div"), f = PE.form([{ k: "v", label: label, type: "range", min: min, max: max, step: 1, val: val, unit: "px" }], null); wrap.appendChild(f.el); PE.modal({ title: title, body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "OK", primary: true, act: function (m) { var v = f.get().v; m.close(); fn(v); } }] }); }
	function needSel() { if (!PE.sel) { PE.toast("Make a selection first"); return false; } return true; }
	function needDoc() { if (!PE.doc) { PE.toast("Open or create an image first"); return false; } return true; }

	/* ---------- files ---------- */
	function loadPsd(buf, name) {
		return loadScript("https://cdn.jsdelivr.net/npm/ag-psd@30.1.1/dist/bundle.js", function () { return window.agPsd; }).then(function (ag) {
			var psd = ag.readPsd(new Uint8Array(buf), { skipThumbnail: true }), layers = [];
			(function walk(list) { (list || []).forEach(function (n) { if (n.children) walk(n.children); else if (n.canvas) layers.push(n); }); })(psd.children);
			if (!PE.newDoc(psd.width, psd.height, null, I.baseName(name))) return; var d = PE.doc; d.layers = [];
			var MAP = { "normal": "source-over", "multiply": "multiply", "screen": "screen", "overlay": "overlay", "darken": "darken", "lighten": "lighten", "color dodge": "color-dodge", "color burn": "color-burn", "hard light": "hard-light", "soft light": "soft-light", "difference": "difference", "exclusion": "exclusion", "hue": "hue", "saturation": "saturation", "color": "color", "luminosity": "luminosity" };
			if (!layers.length && psd.canvas) layers.push({ name: "Background", canvas: psd.canvas, left: 0, top: 0 });
			layers.forEach(function (n) { var c = PE.clone(n.canvas), L = PE.makeLayer({ canvas: c, name: n.name || "Layer", x: n.left || 0, y: n.top || 0 }); L.visible = !n.hidden; L.opacity = n.opacity == null ? 1 : n.opacity; L.blend = MAP[n.blendMode] || "source-over"; d.layers.push(L); });
			if (!d.layers.length) d.layers.push(PE.makeLayer({ name: "Layer 1" })); d.activeId = d.layers[d.layers.length - 1].id; PE.commit("Open PSD"); PE.dirty = false; PE.fit(); PE.emit("docsize"); PE.setTool("move");
			if (layers.length) PE.toast("Opened " + layers.length + " layer" + (layers.length === 1 ? "" : "s") + " from the PSD (effects, text and adjustment layers are flattened)");
		});
	}
	function loadScript(url, get) { return new Promise(function (res, rej) { if (get()) return res(get()); PE.toast("Loading PSD support…"); var s = document.createElement("script"); s.src = url; s.onload = function () { get() ? res(get()) : rej(new Error("PSD library failed")); }; s.onerror = function () { rej(new Error("Could not load the PSD library (offline?)")); }; document.head.appendChild(s); }); }
	function savePsd() {
		if (!needDoc()) return; loadScript("https://cdn.jsdelivr.net/npm/ag-psd@30.1.1/dist/bundle.js", function () { return window.agPsd; }).then(function (ag) {
			var d = PE.doc, MAP = { "source-over": "normal", "color-dodge": "color dodge", "color-burn": "color burn", "hard-light": "hard light", "soft-light": "soft light" };
			PE.relink(); var kids = d.layers.filter(function (L) { return !PE.isGroup(L); }).map(function (L) { var c = PE.mk(d.w, d.h), x = c.getContext("2d"); PE.drawLayer(x, Object.assign({}, L, { _p: null, opacity: 1, blend: "source-over" }), [1, 0, 0, 1, 0, 0], "psd", d.w, d.h); return { name: L.name, canvas: c, left: 0, top: 0, opacity: L.opacity, hidden: !PE.effVisible(L), blendMode: MAP[L.blend] || L.blend }; });
			var comp = PE.flatten(), buf = ag.writePsd({ width: d.w, height: d.h, children: kids, canvas: comp }, { generateThumbnail: false }); PE.download(new Blob([buf], { type: "image/vnd.adobe.photoshop" }), I.cleanFileName(d.name) + ".psd"); PE.toast("Saved PSD with " + kids.length + " layers");
		}).catch(function (e) { PE.toast(e.message); });
	}
	function openFiles(files, opts) {
		opts = opts || {}; files = Array.prototype.slice.call(files); if (!files.length) return;
		var proj = files.filter(function (f) { return /\.mesproj$/i.test(f.name); })[0], psd = files.filter(function (f) { return /\.psd$/i.test(f.name); })[0], imgs = files.filter(function (f) { return /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif|svg|ico)$/i.test(f.name); });
		if (proj) { if (!confirmReplace()) return; proj.arrayBuffer().then(PE.loadProject).then(function () { PE.setTool("move"); PE.toast("Project opened"); }).catch(function (e) { PE.toast(e.message); }); return; }
		if (psd && !opts.place) { if (!confirmReplace()) return; psd.arrayBuffer().then(function (b) { return loadPsd(b, psd.name); }).catch(function (e) { PE.toast(e.message); }); return; }
		if (!imgs.length) { PE.toast("That file type is not supported (use PNG, JPG, WebP, GIF, BMP, AVIF, SVG, PSD)"); return; }
		var first = !PE.doc || (!opts.place && confirmReplace()); if (!PE.doc) first = true; else if (!opts.place && !first) return;
		var chain = Promise.resolve(); imgs.forEach(function (f, i) { chain = chain.then(function () { return PE.decodeFile(f).then(function (im) { if (first && i === 0 && (!PE.doc || !opts.place)) { PE.openImageSource(im, f.name); } else PE.placeSource(im, I.baseName(f.name), opts.at); }).catch(function () { PE.toast("Can't read " + f.name); }); }); });
		chain.then(function () { PE.setTool("move"); if (imgs.length > 1) PE.toast(imgs.length + " images added as layers"); });
	}
	function confirmReplace() { if (!PE.doc || !PE.dirty || PE.hist.stack.length < 2) return true; return window.confirm("Replace the current image? Unsaved changes will be lost (you can still restore the last auto-saved session)."); }
	PE.openFiles = openFiles;
	function pickFiles(accept, multiple, cb) { var inp = $("pe-file"); inp.accept = accept; inp.multiple = !!multiple; inp.onchange = function () { var fs = Array.prototype.slice.call(inp.files); inp.value = ""; if (fs.length) cb(fs); }; inp.click(); }
	PE.pickFontFile = function () { pickFiles(".ttf,.otf,.woff,.woff2", false, function (fs) { PE.loadFontFile(fs[0]).then(function () { PE.toast("Font loaded"); }).catch(function () { PE.toast("Could not load that font"); }); }); };
	var stage = PE.els.stage;
	["dragenter", "dragover"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); stage.classList.add("is-drop"); } }); });
	["dragleave", "drop"].forEach(function (ev) { stage.addEventListener(ev, function () { stage.classList.remove("is-drop"); }); });
	stage.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); var at = PE.doc ? PE.toDoc(e.clientX, e.clientY) : null; openFiles(e.dataTransfer.files, { place: !!PE.doc, at: null }); } });
	function saveProject() { if (!needDoc()) return; PE.projectBlob().then(function (b) { PE.download(b, I.cleanFileName(PE.doc.name) + ".mesproj"); PE.dirty = false; PE.toast("Project saved (open it again with File → Open)"); }); }

	/* ---------- autosave (IndexedDB) ---------- */
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; Promise.resolve(fn(db.transaction("kv", "readwrite").objectStore("kv"))).then(function (v) { res(v); }, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	var asTimer = 0; PE.scheduleAutosave = function () { clearTimeout(asTimer); asTimer = setTimeout(function () { if (!PE.doc || PE.hist.stack.length < 2) return; PE.projectBlob().then(function (b) { return idb(function (st) { return req(st.put({ blob: b, t: Date.now(), name: PE.doc.name, w: PE.doc.w, h: PE.doc.h }, "auto")); }); }).catch(function () {}); }, 5000); };
	function restoreAuto() { idb(function (st) { return req(st.get("auto")); }).then(function (r) { if (!r) return; return r.blob.arrayBuffer().then(PE.loadProject).then(function () { PE.setTool("move"); PE.toast("Restored your last session"); }); }).catch(function () { PE.toast("Could not restore"); }); }
	function checkAuto() { try { idb(function (st) { return req(st.get("auto")); }).then(function (r) { var b = $("pe-restore"); if (r && b) { b.hidden = false; b.textContent = "↺ Restore last session (" + r.name + ", " + r.w + "×" + r.h + ", " + new Date(r.t).toLocaleString() + ")"; } }).catch(function () {}); } catch (e) {} }
	window.addEventListener("beforeunload", function (e) { if (PE.doc && PE.dirty && PE.hist.stack.length > 1) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- menus ---------- */
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform), MOD = isMac ? "⌘" : "Ctrl+";
	function adj(list) { return list.map(function (a) { return { label: a.title, act: function () { if (needDoc()) PE.runAdjust(a.id); } }; }); }
	var MENUS = [
		{ label: "File", items: [{ label: "New image…", act: function () { PE.dlgNew(); } }, { label: "Open image / PSD / project…", act: function () { pickFiles("image/*,.psd,.mesproj", true, function (fs) { openFiles(fs); }); } }, { label: "Insert equation (LaTeX)…", act: function () { PE.dlgEquation(null, null); } }, { label: "Place image(s) as layers…", act: function () { if (!needDoc()) return; pickFiles("image/*", true, function (fs) { openFiles(fs, { place: true }); }); } }, "-",
			{ label: "Export as PNG / JPEG / WebP…", key: MOD + "Shift+S", act: function () { if (needDoc()) PE.dlgExport(); } }, { label: "Save project (keeps layers)", key: MOD + "S", act: saveProject }, { label: "Save as PSD (Photoshop)", act: savePsd }, { label: "Export all comps as pictures (ZIP)…", act: function () { if (needDoc()) PE.dlgExportComps(); } }, { label: "Copy merged image to clipboard", act: function () { if (needDoc()) copyMerged(); } }, "-", { label: "Bulk convert images…", act: function () { window.open("/image-converter", "_blank"); } }] },
		{ label: "Edit", items: [{ label: "Undo", key: MOD + "Z", act: function () { PE.undo(); } }, { label: "Redo", key: MOD + "Shift+Z", act: function () { PE.redo(); } }, "-", { label: "Cut", key: MOD + "X", act: function () { copySel(true); } }, { label: "Copy", key: MOD + "C", act: function () { copySel(false); } }, { label: "Copy merged", act: function () { if (needDoc()) copyMerged(); } }, { label: "Paste as new layer", key: MOD + "V", act: pasteInternal }, "-",
			{ label: "Erase selection with AI (remove object)", act: function () { if (needSel()) PE.aiEraseRun(); } }, { label: "Clear selection (transparent)", key: "Del", act: clearSel }, { label: "Fill with foreground colour", key: "Alt+Backspace", act: function () { if (needDoc()) fillSel(PE.fg); } }, { label: "Fill with background colour", key: MOD + "Backspace", act: function () { if (needDoc()) fillSel(PE.bg); } }, "-",
			{ label: "Select all", key: MOD + "A", act: function () { if (needDoc()) { PE.selAll(); PE.commit("Select all"); } } }, { label: "Deselect", key: MOD + "D", act: function () { if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } }, { label: "Invert selection", key: MOD + "Shift+I", act: function () { if (needDoc()) { PE.selInvert(); PE.commit("Invert selection"); } } },
			{ label: "Feather selection…", act: function () { if (needSel()) promptNum("Feather selection", "Radius", 8, 1, 200, function (v) { PE.selFeather(v); PE.commit("Feather"); }); } }, { label: "Grow selection…", act: function () { if (needSel()) promptNum("Grow selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, true); PE.commit("Grow selection"); }); } }, { label: "Shrink selection…", act: function () { if (needSel()) promptNum("Shrink selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, false); PE.commit("Shrink selection"); }); } }] },
		{ label: "Image", items: [{ label: "Image size…", act: function () { PE.dlgImageSize(); } }, { label: "Canvas size…", act: function () { PE.dlgCanvasSize(); } }, { label: "Upscale with AI (2× / 4×)…", act: function () { PE.aiUpscale(); } }, { label: "Crop to selection", act: function () { if (!needDoc()) return; var b = PE.selBounds(); if (!b) { PE.toast("Make a selection first, or use the Crop tool"); return; } PE.cropTo(b.x, b.y, b.w, b.h); } }, { label: "Trim transparent edges", act: function () { if (needDoc()) PE.trim(); } }, "-",
			{ label: "Rotate / straighten…", act: function () { PE.dlgStraighten(); } }, { label: "Rotate 90° clockwise", act: function () { if (needDoc()) PE.rotateImage(90); } }, { label: "Rotate 90° counter-clockwise", act: function () { if (needDoc()) PE.rotateImage(270); } }, { label: "Rotate 180°", act: function () { if (needDoc()) PE.rotateImage(180); } }, { label: "Flip horizontal", act: function () { if (needDoc()) PE.flipImage(true); } }, { label: "Flip vertical", act: function () { if (needDoc()) PE.flipImage(false); } }, "-", { label: "Flatten image", act: function () { if (needDoc()) PE.flattenImage(); } }] },
		{ label: "Layer", items: [{ label: "Group layers", key: MOD + "G", act: function () { if (needDoc()) groupSelected(); } }, { label: "Ungroup", key: MOD + "Shift+G", act: function () { if (needDoc()) PE.ungroup(); } }, "-", { label: "New layer", key: MOD + "Shift+N", act: function () { if (needDoc()) PE.newRasterLayer(); } }, { label: "Duplicate layer", key: MOD + "J", act: function () { if (needDoc()) PE.duplicateLayer(); } }, { label: "Delete layer", act: function () { if (needDoc()) PE.deleteLayer(); } }, { label: "Layer via copy (selection)", act: function () { if (needDoc()) PE.layerFromSelection(false); } }, { label: "Layer via cut (selection)", act: function () { if (needDoc()) PE.layerFromSelection(true); } }, "-",
			{ label: "Merge down", key: MOD + "E", act: function () { if (needDoc()) PE.mergeDown(); } }, { label: "Merge visible", act: function () { if (needDoc()) PE.mergeVisible(); } }, "-", { label: "Remove background (AI)…", act: function () { PE.aiRemoveBackground(); } }, { label: "Add layer mask", act: function () { if (needDoc()) PE.addMask(PE.active(), true); } }, { label: "Apply layer mask", act: function () { if (needDoc()) PE.applyMask(); } }, { label: "Delete layer mask", act: function () { if (needDoc()) PE.deleteMask(); } }, { label: "Rasterize text layer", act: function () { var L = PE.active(); if (L && L.type === "text") { PE.rasterize(L); PE.commit("Rasterize"); } } }, "-",
			{ label: "Align: left", act: function () { align("left"); } }, { label: "Align: centre horizontally", act: function () { align("hcenter"); } }, { label: "Align: right", act: function () { align("right"); } }, { label: "Align: top", act: function () { align("top"); } }, { label: "Align: centre vertically", act: function () { align("vcenter"); } }, { label: "Align: bottom", act: function () { align("bottom"); } }, "-",
			{ label: "Drop shadow / glow…", act: function () { PE.dlgEffect("shadow"); } }, { label: "Outline…", act: function () { PE.dlgEffect("outline"); } }, { label: "Round corners…", act: function () { PE.dlgRoundCorners(); } }, "-", { label: "Fit layer inside canvas", act: function () { fitLayer(false); } }, { label: "Fill canvas with layer", act: function () { fitLayer(true); } }, { label: "Reset layer scale / rotation", act: resetTransform }, { label: "Flip layer horizontally", act: function () { if (needDoc()) PE.flipLayer(true); } }, { label: "Flip layer vertically", act: function () { if (needDoc()) PE.flipLayer(false); } }, "-", { label: "Move layer up", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 1); } }, { label: "Move layer down", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -1); } }, { label: "Bring to front", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 999); } }, { label: "Send to back", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -999); } }] },
		{ label: "Adjust", items: adj(PE.ADJUST) }, { label: "Filter", items: adj(PE.FILTERS) },
		{ label: "View", items: [{ label: "Zoom in", key: MOD + "+", act: function () { PE.setZoom(PE.view.zoom * 1.25); } }, { label: "Zoom out", key: MOD + "−", act: function () { PE.setZoom(PE.view.zoom / 1.25); } }, { label: "Fit on screen", key: MOD + "0", act: function () { PE.fit(); } }, { label: "Actual pixels (100%)", key: MOD + "1", act: function () { PE.setZoom(1); } }, "-", { label: "Pixel grid (when zoomed in)", act: function () { PE.showGrid = !PE.showGrid; PE.invalidate(); } }, { label: "Full window mode", key: "F", act: function () { toggleWin(); } }] },
		{ label: "Help", items: [{ label: "Keyboard shortcuts", act: shortcuts }, { label: "Tips for labels, arrows and callouts", act: tips }] }
	];
	var openMenu = null;
	function buildMenus() {
		var bar = $("pe-menubar"); bar.innerHTML = "";
		MENUS.forEach(function (m) {
			var b = el("button", "pe-menu", esc(m.label)); b.type = "button"; b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false");
			var pop = el("div", "pe-pop"); pop.hidden = true; pop.setAttribute("role", "menu");
			m.items.forEach(function (it) { if (it === "-") { pop.appendChild(el("div", "pe-sep")); return; } var r = el("button", "pe-item", "<span>" + esc(it.label) + "</span>" + (it.key ? "<kbd>" + esc(it.key) + "</kbd>" : "")); r.type = "button"; r.setAttribute("role", "menuitem"); r.addEventListener("click", function () { closeMenu(); it.act(); }); pop.appendChild(r); });
			var wrap = el("div", "pe-mwrap"); wrap.appendChild(b); wrap.appendChild(pop); bar.appendChild(wrap);
			b.addEventListener("click", function (e) { e.stopPropagation(); if (openMenu && openMenu.b === b) closeMenu(); else showMenu(b, pop, wrap); }); b.addEventListener("mouseenter", function () { if (openMenu && openMenu.b !== b) showMenu(b, pop, wrap); });
		});
	}
	function showMenu(b, pop, wrap) { closeMenu(); pop.hidden = false; b.setAttribute("aria-expanded", "true"); openMenu = { b: b, pop: pop }; var r = pop.getBoundingClientRect(); if (r.right > window.innerWidth - 8) pop.style.left = (window.innerWidth - 8 - r.right) + "px"; if (r.bottom > window.innerHeight - 8) pop.style.maxHeight = (window.innerHeight - r.top - 12) + "px"; }
	function closeMenu() { if (openMenu) { openMenu.pop.hidden = true; openMenu.pop.style.left = ""; openMenu.b.setAttribute("aria-expanded", "false"); openMenu = null; } }
	document.addEventListener("click", closeMenu); document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
	function shortcuts() {
		var rows = [["V M L W C", "Move, Marquee, Lasso, Magic wand, Crop"], ["B E S R", "Brush, Eraser, Clone stamp, Retouch"], ["K G I", "Paint bucket, Gradient, Eyedropper"], ["T U", "Text, Shapes & annotations"], ["H / Space", "Pan (hold Space with any tool)"], ["Z, Ctrl + wheel", "Zoom"], ["[ and ]", "Smaller / larger brush"], ["X / D", "Swap / reset colours"], [MOD + "Z, " + MOD + "Shift+Z", "Undo, redo"], [MOD + "A, " + MOD + "D, " + MOD + "Shift+I", "Select all, deselect, invert selection"], [MOD + "C X V", "Copy, cut, paste as layer"], [MOD + "J, " + MOD + "E", "Duplicate layer, merge down"], ["Delete", "Clear selection (or delete the layer)"], ["Arrow keys", "Nudge the layer (Shift = 10 px)"], ["Enter / Esc", "Apply crop, close polygon / cancel"], [MOD + "0 / " + MOD + "1", "Fit on screen / 100%"], [MOD + "S", "Save project"], [MOD + "Shift+S", "Export PNG / JPEG / WebP"]];
		var w = el("div"); w.innerHTML = '<table class="pe-keys">' + rows.map(function (r) { return "<tr><td><kbd>" + esc(r[0]) + "</kbd></td><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</table>"; PE.modal({ title: "Keyboard shortcuts", body: w, buttons: [{ label: "Close", primary: true, act: function (m) { m.close(); } }] });
	}
	function tips() {
		var w = el("div", "pe-tips"); w.innerHTML = "<ul><li><b>Label an image:</b> Text tool, click, type. Turn on <i>Background box</i> (or press <i>Yellow label</i>) for a callout look.</li><li><b>Arrows, boxes, numbers:</b> Shapes tool. Each shape lands on its own layer: move it with the Move tool, delete it from the Layers panel.</li><li><b>Combine images:</b> drag several files onto the canvas (each becomes a layer) or paste with Ctrl+V. Move, resize and rotate with the Move tool.</li><li><b>Transparent background:</b> Magic wand the background, press Delete, then Export as PNG. Or Adjust → Make a colour transparent.</li><li><b>Remove an object or person:</b> Object Erase tool (J): paint over it, press Enter. Or make a selection and use Edit → Erase selection with AI. <b>Cut out a subject:</b> Layer → Remove background (AI).</li><li><b>Many thumbnails from one project:</b> put each design in a group (select layers with Ctrl-click, Ctrl+G), then use the Comps tab: set up what is visible, + Save current view, repeat, then Export all. Press , and . to flip between comps.</li><li><b>Make a small picture bigger:</b> Image → Upscale with AI.</li><li><b>Equations:</b> Equation tool (Q) or File → Insert equation: type LaTeX (or paste LaTeX text with Ctrl+V), see the preview, Insert. Click it again to edit; it stays sharp when enlarged.</li><li><b>Hide private info:</b> Shapes → Blur / hide area, then drag over it.</li><li><b>Large file?</b> Export as WebP or JPEG and lower the quality.</li></ul>"; PE.modal({ title: "Tips", body: w, buttons: [{ label: "Close", primary: true, act: function (m) { m.close(); } }] });
	}

	/* ---------- window mode ---------- */
	var autoWin = false;
	function toggleWin(auto) { var on = !root.classList.contains("pe-win"); root.classList.toggle("pe-win", on); document.documentElement.classList.toggle("pe-win-on", on); $("pe-winbtn").setAttribute("aria-pressed", on ? "true" : "false"); $("pe-winbtn").textContent = on ? "⤡ Exit full window" : "⤢ Full window"; if (auto !== true) sset({ win: on }); setTimeout(function () { resize(); if (PE.doc) PE.fit(); }, 30); }
	$("pe-winbtn").addEventListener("click", function () { toggleWin(); });
	// no automatic Full window when a picture is opened (it hid the sidebar and the Standard | Wide | Theatre switch): Full window stays one click away (key F) and a manual choice is remembered

	/* ---------- keyboard ---------- */
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) && t.type !== "range" && t.type !== "checkbox" && t.type !== "button") || (t && t.isContentEditable);
		if (typing || PE.modalOpen()) return; var k = e.key, low = k.toLowerCase(), mod = e.ctrlKey || e.metaKey, has = !!PE.doc;
		if (k === " " ) { if (!e.repeat) { PE.setSpace(true); PE.spaceHeld = true; PE.els.over.style.cursor = "grab"; } if (document.activeElement === document.body || root.contains(document.activeElement)) e.preventDefault(); return; }
		if (mod) {
			if (low === "z") { e.preventDefault(); e.shiftKey ? PE.redo() : PE.undo(); return; } if (low === "y") { e.preventDefault(); PE.redo(); return; }
			if (!has && low !== "v" && low !== "o") return;
			if (low === "a") { e.preventDefault(); PE.selAll(); PE.commit("Select all"); } else if (low === "d") { e.preventDefault(); if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } else if (low === "i" && e.shiftKey) { e.preventDefault(); PE.selInvert(); PE.commit("Invert selection"); }
			else if (low === "c") { e.preventDefault(); e.shiftKey ? copyMerged() : copySel(false); } else if (low === "x") { e.preventDefault(); copySel(true); } else if (low === "j") { e.preventDefault(); PE.duplicateLayer(); } else if (low === "g") { e.preventDefault(); e.shiftKey ? PE.ungroup() : groupSelected(); } else if (low === "e") { e.preventDefault(); PE.mergeDown(); }
			else if (low === "n" && e.shiftKey) { e.preventDefault(); PE.newRasterLayer(); } else if (low === "s") { e.preventDefault(); e.shiftKey ? PE.dlgExport() : saveProject(); } else if (k === "0") { e.preventDefault(); PE.fit(); } else if (k === "1") { e.preventDefault(); PE.setZoom(1); } else if (k === "=" || k === "+") { e.preventDefault(); PE.setZoom(PE.view.zoom * 1.25); } else if (k === "-") { e.preventDefault(); PE.setZoom(PE.view.zoom / 1.25); }
			else if (low === "t") { e.preventDefault(); PE.setTool("move"); PE.opt.move.handles = true; buildOpts(); } else if (low === "o") { e.preventDefault(); pickFiles("image/*,.psd,.mesproj", true, function (fs) { openFiles(fs); }); } else if (k === "Backspace") { e.preventDefault(); fillSel(PE.bg); }
			return;
		}
		if (e.altKey && k === "Backspace") { e.preventDefault(); if (has) fillSel(PE.fg); return; }
		if (!has) return;
		if (k === "Enter") { var tl = PE.tool(); if (tl.enter) { e.preventDefault(); tl.enter(); } return; }
		if (k === "Escape") { var tl2 = PE.tool(); if (tl2.cancel) tl2.cancel(); if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } if (root.classList.contains("pe-win")) { } PE.invalidateOverlay(); return; }
		if (k === "Delete" || k === "Backspace") { e.preventDefault(); if (PE.sel) clearSel(); else PE.deleteLayer(); return; }
		if (k.indexOf("Arrow") === 0 && PE.toolId === "move") { e.preventDefault(); var n = e.shiftKey ? 10 : 1; PE.nudge(k === "ArrowLeft" ? -n : k === "ArrowRight" ? n : 0, k === "ArrowUp" ? -n : k === "ArrowDown" ? n : 0); return; }
		if (k === "[") { PE.stepBrushSize(-1); return; } if (k === "]") { PE.stepBrushSize(1); return; }
		if (k === ",") { stepComp(-1); return; } if (k === ".") { stepComp(1); return; } if (low === "x") { swapColors(); return; } if (low === "d") { PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color"); return; } if (low === "f") { toggleWin(); return; }
		for (var id in PE.tools) if (PE.tools[id].key === low) { PE.setTool(id); return; }
	});
	document.addEventListener("keyup", function (e) { if (e.key === " ") { PE.setSpace(false); PE.spaceHeld = false; setCursor(); PE.invalidateOverlay(); } });
	root.addEventListener("dblclick", function (e) { if (e.target === PE.els.over && PE.toolId !== "text") { var L = PE.active(); if (L && L.type === "text" && PE.toolId === "move") PE.editActiveText(); else if (L && L.eq && PE.toolId === "move") PE.dlgEquation(L); } });

	/* ---------- empty state + init ---------- */
	$("pe-e-open").addEventListener("click", function () { pickFiles("image/*,.psd,.mesproj", true, function (fs) { openFiles(fs); }); });
	$("pe-e-new").addEventListener("click", function () { PE.dlgNew(); }); $("pe-e-paste").addEventListener("click", pasteInternal);
	$("pe-restore").addEventListener("click", restoreAuto);
	if (S.opt) for (var k in S.opt) if (PE.opt[k]) for (var kk in S.opt[k]) if (kk in PE.opt[k]) PE.opt[k][kk] = S.opt[k][kk];
	PE.opt.shape.next = 1; PE.opt.text.str = "Text";
	showTab(S.tab === "comps" ? "comps" : "hist"); buildMenus(); buildTools(); PE.initPointer(); PE.initTextEditor(); buildColor(); resize(); PE.setTool("move"); status(); checkAuto();
	if (S.win) { autoWin = true; toggleWin(true); }
	var q = new URLSearchParams(location.search); if (q.get("new")) { var wh = (q.get("new") || "").split("x"); if (wh.length === 2) PE.newDoc(+wh[0], +wh[1], "#ffffff"); }
	window.PEdebug = PE;
})();
