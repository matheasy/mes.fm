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
	/* ---------- UI helpers (pure): where a layer came from, the width of the side panels ---------- */
	var HOW = { open: "Opened from a file", drop: "Dropped onto the editor", paste: "Pasted", folder: "From a folder on this computer", "folder-ro": "From a folder (read only)", psd: "From a Photoshop file", xcf: "From a GIMP file", project: "From a project file", autosave: "From the autosaved session", merge: "Merged from layers", made: "Made in the editor" };
	function bytesText(b) { b = +b || 0; return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB" : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + " MB"; }
	/* s = layer.src: {how, file, path, dir, bytes, from: [names], copy, ai: [steps], clip} -> {how, label, where, bytes, text} */
	function describeSource(s) {
		s = s || {}; var how = HOW[s.how] ? s.how : "made", label = HOW[how], where = "";
		if (how === "folder") where = (s.dir ? s.dir + "/" : "") + (s.file || "");
		else if (how === "folder-ro") where = s.path || ((s.dir ? s.dir + "/" : "") + (s.file || ""));
		else if (how === "paste") label = s.clip === "editor" ? "Pasted (copied inside the editor)" : "Pasted from the clipboard";
		else if (how === "merge") { var f = s.from || []; where = f.slice(0, 3).join(", ") + (f.length > 3 ? " and " + (f.length - 3) + " more" : ""); }
		else if (how !== "made") where = s.path || s.file || "";
		var bytes = s.bytes > 0 ? bytesText(s.bytes) : "", ai = (s.ai || []).join(", ");
		return { how: how, label: label, where: where, bytes: bytes, text: label + (where ? ": " + where : "") + (bytes ? " (" + bytes + ")" : "") + (s.copy ? ", duplicated" : "") + (ai ? " · then AI: " + ai : "") };
	}
	/* side panels: a width in em kept between 12 em and 48 em, and never so wide that the picture gets less than 240 px */
	function panelClamp(em, mainPx, otherPx, fontPx) {
		fontPx = fontPx > 0 ? fontPx : 13; var max = Math.max(12, Math.min(48, ((mainPx || 0) - (otherPx || 0) - 240) / fontPx)); em = +em; if (!isFinite(em)) em = 17.5;
		return Math.round(clamp(em, 12, max) * 100) / 100;
	}
	/* ---------- layout maths: Move tool (multi-selection boxes, snapping) and the text editor (wrapping with string offsets, caret hit-testing) ---------- */
	function unionBox(list) {
		var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
		(list || []).forEach(function (b) { if (!b) return; any = true; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
		return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
	}
	function boxesTouch(a, b) { return !!a && !!b && a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h; }
	function rectFrom(x0, y0, x1, y1) { return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; }
	/* snap lines: the canvas (edges + centre, kind "c") and every other layer's box (edges + centre, kind "l") */
	function snapTargets(W, H, boxes) {
		var tx = W == null ? [] : [{ p: 0, k: "c" }, { p: W / 2, k: "c" }, { p: W, k: "c" }], ty = H == null ? [] : [{ p: 0, k: "c" }, { p: H / 2, k: "c" }, { p: H, k: "c" }];
		(boxes || []).forEach(function (b) { if (!b) return; tx.push({ p: b.x, k: "l" }, { p: b.x + b.w / 2, k: "l" }, { p: b.x + b.w, k: "l" }); ty.push({ p: b.y, k: "l" }, { p: b.y + b.h / 2, k: "l" }, { p: b.y + b.h, k: "l" }); });
		return { x: tx, y: ty };
	}
	/* the closest target to any of the moving positions `vals`, if within `th`: {d (add it to the positions), p, k, i (which position)}; on a tie the canvas wins */
	function snapAxis(vals, targets, th) {
		var best = null;
		vals.forEach(function (v, i) { if (v == null || !isFinite(v)) return; targets.forEach(function (t) { var d = t.p - v, ad = Math.abs(d); if (ad > th) return; if (!best || ad < Math.abs(best.d) - 1e-9 || (Math.abs(ad - Math.abs(best.d)) <= 1e-9 && t.k === "c" && best.k !== "c")) best = { d: d, p: t.p, k: t.k, i: i }; }); });
		return best;
	}
	/* every target that a (snapped) position lies on = the guide lines to draw */
	function guidesOn(vals, targets) { var out = [], seen = {}; vals.forEach(function (v) { targets.forEach(function (t) { if (Math.abs(t.p - v) < 0.5) { var key = t.p.toFixed(2) + t.k; if (!seen[key]) { seen[key] = 1; out.push({ p: t.p, k: t.k }); } } }); }); return out; }
	/* moving a box: left / centre / right and top / middle / bottom snap independently. {dx, dy, gx, gy} */
	function snapBox(box, tg, th) {
		var vx = [box.x, box.x + box.w / 2, box.x + box.w], vy = [box.y, box.y + box.h / 2, box.y + box.h], sx = snapAxis(vx, tg.x, th), sy = snapAxis(vy, tg.y, th), dx = sx ? sx.d : 0, dy = sy ? sy.d : 0;
		return { dx: dx, dy: dy, gx: sx ? guidesOn(vx.map(function (v) { return v + dx; }), tg.x) : [], gy: sy ? guidesOn(vy.map(function (v) { return v + dy; }), tg.y) : [] };
	}
	/* a quantity that is linear in a parameter (v0 at f0, v1 at f1): the parameter that gives `target`, null when the quantity does not change */
	function linSolve(f0, v0, f1, v1, target) { var dv = v1 - v0; if (Math.abs(dv) < 1e-12) return null; return f0 + (target - v0) * (f1 - f0) / dv; }
	function scaleAbout(p, a, f) { return a + (p - a) * f; }
	/* word wrap that remembers where each line came from in the string: [{text, start, end}] (end = start + text.length; a wrapped line loses its trailing spaces).
	 * measure(s, start) = width of s, which begins at string index start (rich text: bold / italic parts measure wider) */
	function wrapLines(str, lim, measure) {
		str = String(str == null ? "" : str); var out = [], pos = 0;
		str.split("\n").forEach(function (para) {
			var base = pos; pos += para.length + 1;
			if (measure(para, base) <= lim) { out.push({ text: para, start: base, end: base + para.length }); return; }
			var cur = "", cs = base, tp = base;
			var push = function (s, st, trim) { var tx = trim ? s.replace(/\s+$/, "") : s; out.push({ text: tx, start: st, end: st + tx.length }); };
			para.split(/(\s+)/).forEach(function (wd) {
				var ws = tp; tp += wd.length; if (!wd) return;
				if (cur && measure((cur + wd).replace(/\s+$/, ""), cur ? cs : ws) > lim) { push(cur, cs, true); if (/^\s+$/.test(wd)) { cur = ""; cs = tp; } else { cur = wd; cs = ws; } }
				else { if (!cur) cs = ws; cur += wd; }
				while (measure(cur.replace(/\s+$/, ""), cs) > lim && cur.length > 1) { var k = cur.length - 1; while (k > 1 && measure(cur.slice(0, k), cs) > lim) k--; push(cur.slice(0, k), cs, false); cur = cur.slice(k); cs += k; }   // one word longer than the box
			});
			push(cur, cs, true);
		});
		return out;
	}
	/* ---------- rich text: per-character bold / italic / underline ----------
	 * A text layer may carry rich = a string as long as the text, one digit per character: bit 1 bold, 2 italic, 4 underline (so "0" plain, "5" bold + underline).
	 * rich = null means every character uses the layer's own bold / italic / underline. Kept as a string so it survives JSON (history, .mesproj, duplicate). */
	function richMask(b, i, u) { return (b ? 1 : 0) | (i ? 2 : 0) | (u ? 4 : 0); }
	function richRepeat(m, n) { var s = ""; for (var k = 0; k < n; k++) s += m; return s; }
	/* the text changed from oldS to newS (typing, paste, delete, undo inside the box): keep each kept character's style; new characters take the style of the
	 * character before them (or after them, at the very start) */
	function richEdit(rich, oldS, newS, def) {
		if (rich == null) return null; oldS = String(oldS); newS = String(newS); var ol = oldS.length, nl = newS.length, p = 0, s = 0;
		if (rich.length !== ol) rich = (rich + richRepeat(String(def || 0), ol)).slice(0, ol);
		while (p < ol && p < nl && oldS[p] === newS[p]) p++;
		while (s < ol - p && s < nl - p && oldS[ol - 1 - s] === newS[nl - 1 - s]) s++;
		var m = p > 0 ? rich[p - 1] : ol > 0 ? rich[0] : String(def || 0);
		return rich.slice(0, p) + richRepeat(m, nl - p - s) + rich.slice(ol - s);
	}
	/* switch one style bit on or off for the characters a..b */
	function richSet(rich, a, b, bit, on) { var out = rich.slice(0, a); for (var i = a; i < b && i < rich.length; i++) { var m = +rich[i]; out += String(on ? m | bit : m & ~bit); } return out + rich.slice(Math.min(b, rich.length)); }
	/* does every character a..b have the bit? (an empty range: the character before it) */
	function richAll(rich, a, b, bit) { if (b <= a) { var c = rich[Math.max(0, a - 1)]; return !!(c != null && (+c & bit)); } for (var i = a; i < b; i++) if (!(+rich[i] & bit)) return false; return true; }
	/* all characters the same -> {rich: null, mask}; else {rich, mask = the bits every character has} */
	function richNorm(rich) {
		if (rich == null || !rich.length) return { rich: null, mask: rich && rich.length ? +rich[0] : null };
		var all = 7, same = true; for (var i = 0; i < rich.length; i++) { all &= +rich[i]; if (rich[i] !== rich[0]) same = false; }
		return same ? { rich: null, mask: +rich[0] } : { rich: rich, mask: all };
	}
	/* the runs of one style in a..b: [{s, e, m}] (no rich = one run with the layer's mask) */
	function richSegs(rich, a, b, base) {
		if (rich == null) return b > a ? [{ s: a, e: b, m: base }] : []; var out = [], st = a;
		for (var i = a + 1; i <= b; i++) if (i === b || rich[i] !== rich[st]) { out.push({ s: st, e: i, m: +rich[st] }); st = i; }
		return out;
	}
	/* Auto-fit text: the largest font size whose wrapped text fits a box w x h (box height = size * (lh * lines + 0.25), like the editor's text frame),
	 * without breaking a word. measureAt(size) -> measure(s, start). Returns a size in steps of 0.5 between lo and hi. */
	function fitFontSize(str, w, h, lh, measureAt, lo, hi) {
		str = String(str == null ? "" : str); lo = lo || 4; hi = hi || 1000; if (!(w > 0) || !(h > 0)) return null;
		var words = [], re = /\S+/g, mm; while ((mm = re.exec(str))) words.push([mm[0], mm.index]);
		var fits = function (sz) { var me = measureAt(sz); for (var k = 0; k < words.length; k++) if (me(words[k][0], words[k][1]) > w) return false; return sz * (lh * wrapLines(str, w, me).length + 0.25) <= h; };
		if (!fits(lo)) return lo; if (fits(hi)) return hi;
		var a = lo, b = hi; for (var it = 0; it < 40 && b - a > 0.25; it++) { var mid = (a + b) / 2; if (fits(mid)) a = mid; else b = mid; }
		return Math.max(lo, Math.floor(a * 2) / 2);
	}
	/* a dropped / picked folder: the project.json that is closest to the top and the project files next to it.
	 * paths = "Fetzer/project.json", ... -> {prefix: "Fetzer/", files: [paths]} or null when there is no project.json */
	function folderProject(paths) {
		var pre = projectPrefix(paths); if (pre === null) return null;
		return { prefix: pre, files: (paths || []).filter(function (n) { if (n.indexOf(pre) !== 0 || /(^|\/)__MACOSX\//.test(n) || /(^|\/)\._/.test(n)) return false; var r = n.slice(pre.length); return /^(project\.json|layer-[^\/]+\.png|mask-[^\/]+\.png)$/.test(r); }) };
	}
	/* which line a string index is on, and how far into it: {line, k} */
	function caretLine(lines, idx) {
		var li = 0; for (var i = 0; i < lines.length; i++) { if (lines[i].start <= idx) li = i; else break; }
		var L = lines[li]; return { line: li, k: Math.max(0, Math.min(L.text.length, idx - L.start)) };
	}
	/* the string index closest to x (measured from the line's own left edge) */
	function hitInLine(line, x, measure) { var best = 0, bd = Infinity; for (var k = 0; k <= line.text.length; k++) { var d = Math.abs(measure(line.text.slice(0, k), line.start) - x); if (d < bd) { bd = d; best = k; } } return line.start + best; }
	/* the word around a string index (double-click): [start, end] */
	function wordAt(str, idx) {
		// a run of non-space characters ("2.0", "don't"), without punctuation stuck to its ends ("Fetzer," -> "Fetzer")
		str = String(str); var sp = function (c) { return !c || /\s/.test(c); }, PU = /[.,;:!?()\[\]{}"“”‘’'«»]/, a = idx;
		if (sp(str[a]) && !sp(str[a - 1])) a--;
		if (sp(str[a])) return [idx, idx];
		while (a > 0 && !sp(str[a - 1])) a--; var b = a; while (b < str.length && !sp(str[b])) b++;
		var a2 = a, b2 = b; while (a2 < b2 && PU.test(str[a2])) a2++; while (b2 > a2 && PU.test(str[b2 - 1])) b2--;
		return a2 < b2 && idx >= a2 && idx <= b2 ? [a2, b2] : [a, b];
	}
	/* arrow keys on the focused grip: the grip moves with the arrow, so the panels get wider when it moves towards the picture's side */
	function panelKey(key, shift, sideLeft) {
		var step = shift ? 4 : 1;
		if (key === "ArrowLeft" || key === "ArrowRight") return { d: (key === "ArrowRight" ? 1 : -1) * (sideLeft ? 1 : -1) * step };
		if (key === "Home") return { to: "min" }; if (key === "End") return { to: "max" }; if (key === "Enter") return { to: "reset" };
		return null;
	}
	/* ---------- project files and recent projects (round 5) ---------- */
	/* a .mesproj is a ZIP: what kind of project file is this name? */
	function projectKind(name) { name = String(name || "").toLowerCase(); return /\.mesproj$/.test(name) ? "mesproj" : /\.zip$/.test(name) ? "zip" : null; }
	/* "Fetzer.mesproj" / "Fetzer.zip" / "Fetzer.mesproj.zip" -> "Fetzer" */
	function projectBase(name) { var s = String(name || "").replace(/^.*[\\\/]/, "").replace(/(\.mesproj)?(\.zip)?$/i, "").replace(/\.mesproj$/i, "").trim(); return s || "Untitled"; }
	/* a file name for a project: base cleaned of characters file systems refuse, + .mesproj or .zip */
	function projectFileName(base, kind) { var b = String(base || "").replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 120) || "Untitled"; return b + (kind === "zip" ? ".zip" : ".mesproj"); }
	/* "PK\3\4" (or an empty ZIP's "PK\5\6") at the start */
	function isZipBytes(u8) { return !!u8 && u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && ((u8[2] === 3 && u8[3] === 4) || (u8[2] === 5 && u8[3] === 6)); }
	/* the ZIP's entries from its central directory: [{name, method (0 stored, 8 deflate), data (still compressed), size}], or null when it is not a ZIP we can read */
	function zipEntries(u8) {
		if (!u8 || u8.length < 22) return null; var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i = u8.length - 22, stop = Math.max(0, u8.length - 22 - 65557);
		while (i >= stop && dv.getUint32(i, true) !== 0x06054b50) i--; if (i < stop) return null;
		var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), out = [], dec = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
		for (var k = 0; k < n; k++) {
			if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) return null;
			var method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), usz = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
			var nb = u8.subarray(p + 46, p + 46 + nl), name = dec ? dec.decode(nb) : String.fromCharCode.apply(null, nb);
			if (lo + 30 > u8.length || dv.getUint32(lo, true) !== 0x04034b50) return null;
			var st = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
			if (method !== 0 && method !== 8) return null; if (st + csz > u8.length) return null;
			if (!/\/$/.test(name)) out.push({ name: name, method: method, data: u8.subarray(st, st + csz), size: usz });
			p += 46 + nl + xl + cl;
		}
		return out;
	}
	/* where project.json sits inside the ZIP ("" at the top, "Fetzer/" when someone zipped the folder), ignoring macOS "__MACOSX/" copies; null = no project.json */
	function projectPrefix(names) {
		var best = null; (names || []).forEach(function (n) { if (/(^|\/)__MACOSX\//.test(n) || /(^|\/)\._/.test(n)) return; var m = /^(.*\/)?project\.json$/.exec(n); if (m) { var pre = m[1] || ""; if (best === null || pre.length < best.length) best = pre; } });
		return best;
	}
	/* recent projects: entries {id, t (last used), bytes (autosave size, 0 = none), file (a remembered project file)}.
	 * Newest first; at most max entries; autosaves beyond the byte budget are dropped (the newest autosave is always kept); an entry that loses its
	 * autosave and has no remembered file is dropped altogether. -> {keep, drop: [ids], dropAuto: [ids that keep their entry but lose the autosave]} */
	function pruneRecent(list, max, budget) {
		max = max || 8; budget = budget || 500e6; var seen = {}, sorted = (list || []).filter(function (e) { if (!e || !e.id || seen[e.id]) return false; seen[e.id] = 1; return true; }).slice().sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
		var keep = [], drop = [], dropAuto = [], used = 0, kept = 0;
		sorted.forEach(function (e) {
			if (kept >= max) { drop.push(e.id); return; }
			var b = e.bytes > 0 ? e.bytes : 0, e2 = e;
			if (b && used + b > budget && used > 0) { if (!e.file) { drop.push(e.id); return; } e2 = Object.assign({}, e, { bytes: 0 }); dropAuto.push(e.id); b = 0; }
			used += b; kept++; keep.push(e2);
		});
		return { keep: keep, drop: drop, dropAuto: dropAuto };
	}
	/* put an entry at the top (merged into the old one with the same id) */
	function upsertRecent(list, entry) { var old = null, rest = (list || []).filter(function (e) { if (e.id === entry.id) { old = e; return false; } return true; }); return [Object.assign({}, old || {}, entry)].concat(rest); }
	/* "saved just now" / "saved 2 min ago" / "saved 3 h ago" / "saved on 24 Oct" */
	function agoText(t, now) {
		if (!t) return ""; var s = Math.max(0, Math.round(((now || Date.now()) - t) / 1000));
		if (s < 45) return "just now"; if (s < 90) return "1 min ago"; var m = Math.round(s / 60); if (m < 60) return m + " min ago"; var h = Math.round(m / 60); if (h < 24) return h + " h ago";
		var d = new Date(t), MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return "on " + d.getDate() + " " + MON[d.getMonth()] + (h > 24 * 300 ? " " + d.getFullYear() : "");
	}
	/* did the file change on disk since we read / wrote it? (a sync client rewriting the same time stamp is not a change; 1 s of slack for coarse file systems) */
	function diskChanged(known, current) { return !!(known && current && Math.abs(current - known) > 1000); }
	/* one PNG name per layer for "Export every layer as PNG": "01 Background.png", unique, safe for any file system */
	function layerFileNames(names) {
		var used = {}, w = String((names || []).length).length < 2 ? 2 : String(names.length).length;
		return (names || []).map(function (nm, i) {
			var b = String(nm || "Layer").replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Layer", num = String(i + 1); while (num.length < w) num = "0" + num;
			var f = num + " " + b + ".png", k = 2; while (used[f.toLowerCase()]) f = num + " " + b + " (" + (k++) + ").png"; used[f.toLowerCase()] = 1; return f;
		});
	}
	/* ---------- round 7 (2026-10-28) ---------- */
	/* colour picker maths: HSV <-> RGB (h 0-360, s / v 0-1, rgb 0-255) and a forgiving parser for typed colours ("#abc", "abc", "#aabbcc", "rgb(1, 2, 3)", "1,2,3") -> "#rrggbb" or null */
	function rgbToHsv(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0; if (d > 1e-9) { h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, mx > 0 ? d / mx : 0, mx]; }
	function hsvToRgb(h, s, v) { h = ((h % 360) + 360) % 360 / 60; var i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f)), m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; return [m[0] * 255, m[1] * 255, m[2] * 255]; }
	function parseColor(str) {
		var s = String(str == null ? "" : str).trim().toLowerCase(), m;
		if ((m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s))) { var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return "#" + h; }
		if ((m = /^(?:rgba?\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[, \/]\s*[\d.]+%?\s*)?\)?$/.exec(s))) { var v = [+m[1], +m[2], +m[3]]; if (v.every(function (x) { return x <= 255; })) return rgbToHex(v[0], v[1], v[2]); }
		return null;
	}
	/* perceived lightness 0-1 of a hex colour (a mask brush: dark hides, light shows) */
	function lightness(hex) { var c = hexToRgb(hex); return (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722) / 255; }
	/* squared Euclidean distance transform (Felzenszwalb & Huttenlocher): for every pixel, the squared distance to the nearest pixel where on[i] is true */
	function edt(on, w, h) {
		var INF = 1e20, d = new Float64Array(w * h), n = Math.max(w, h), f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n), out = new Float64Array(n);
		for (var i = 0; i < w * h; i++) d[i] = on[i] ? 0 : INF;
		function pass(len) { var k = 0; v[0] = 0; z[0] = -INF; z[1] = INF; for (var q = 1; q < len; q++) { var sq; while (true) { var r = v[k]; sq = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); if (sq <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; } k++; v[k] = q; z[k] = sq; z[k + 1] = INF; } k = 0; for (var q2 = 0; q2 < len; q2++) { while (z[k + 1] < q2) k++; var dd = q2 - v[k]; out[q2] = dd * dd + f[v[k]]; } }
		for (var x = 0; x < w; x++) { for (var y = 0; y < h; y++) f[y] = d[y * w + x]; pass(h); for (y = 0; y < h; y++) d[y * w + x] = out[y]; }
		for (var y2 = 0; y2 < h; y2++) { for (var x2 = 0; x2 < w; x2++) f[x2] = d[y2 * w + x2]; pass(w); for (x2 = 0; x2 < w; x2++) d[y2 * w + x2] = out[x2]; }
		return d;
	}
	/* the alpha (0-255) of an outline / stroke around the opaque part of a picture: pos "outside" | "inside" | "center", width in pixels.
	   alpha = the picture's alpha channel (the caller leaves enough transparent margin round it for an outside stroke). Anti-aliased by half a pixel. */
	function outlineAlpha(alpha, w, h, width, pos) {
		var n = w * h, inside = new Uint8Array(n), outside = new Uint8Array(n), out = new Uint8Array(n), r = Math.max(0, +width || 0); if (!r) return out;
		for (var i = 0; i < n; i++) { if (alpha[i] >= 128) inside[i] = 1; else outside[i] = 1; }
		var dOut = pos === "inside" ? null : edt(inside, w, h), dIn = pos === "outside" ? null : edt(outside, w, h), ro = pos === "center" ? r / 2 : r, ri = pos === "center" ? r / 2 : r;
		for (var j = 0; j < n; j++) {
			var a = 0;
			if (dOut && !inside[j]) { var d1 = Math.sqrt(dOut[j]) - 0.5; a = clamp(ro + 0.5 - d1, 0, 1); }
			else if (dIn && inside[j]) { var d2 = Math.sqrt(dIn[j]) - 0.5; a = clamp(ri + 0.5 - d2, 0, 1); }
			out[j] = Math.round(a * 255);
		}
		return out;
	}
	/* the tool panel's layout: groups [{id, name, open, tools: [ids]}] + hidden [ids]. Unknown ids are dropped, every known tool that is in no group and not
	   hidden goes into the first group (so new tools always show up), and every group keeps a name. */
	function normToolLayout(lay, all, defGroups) {
		var seen = {}, groups = [], hidden = [], ok = function (id) { return all.indexOf(id) >= 0 && !seen[id]; };
		var src = lay && Array.isArray(lay.groups) && lay.groups.length ? lay.groups : defGroups;
		((lay && lay.hidden) || []).forEach(function (id) { if (ok(id)) { seen[id] = 1; hidden.push(id); } });
		src.forEach(function (g, i) { var ts = []; (g.tools || []).forEach(function (id) { if (ok(id)) { seen[id] = 1; ts.push(id); } }); groups.push({ id: String(g.id || "g" + i), name: String(g.name || "Tools").slice(0, 40), open: g.open !== false, tools: ts }); });
		if (!groups.length) groups.push({ id: "g0", name: "Tools", open: true, tools: [] });
		all.forEach(function (id) { if (!seen[id]) { seen[id] = 1; var home = null; defGroups.forEach(function (g) { if ((g.tools || []).indexOf(id) >= 0) home = g.id; }); var tg = groups.filter(function (g) { return g.id === home; })[0] || groups[0]; tg.tools.push(id); } });
		return { groups: groups, hidden: hidden };
	}
	/* move a tool to another place in the layout: to group gid before index at (at = -1 or past the end: last); "hidden" hides it */
	function moveTool(lay, id, gid, at) {
		var L = { groups: lay.groups.map(function (g) { return Object.assign({}, g, { tools: g.tools.filter(function (t) { return t !== id; }) }); }), hidden: lay.hidden.filter(function (t) { return t !== id; }) };
		if (gid === "hidden") { L.hidden.push(id); return L; }
		var g = L.groups.filter(function (x) { return x.id === gid; })[0] || L.groups[0]; if (at == null || at < 0 || at > g.tools.length) at = g.tools.length; g.tools.splice(at, 0, id); return L;
	}
	/* a layer crop box {x, y, w, h} in the layer's own pixels, kept inside the canvas and at least 1 px; null when it covers the whole canvas */
	function clampCrop(c, cw, ch) {
		if (!c) return null; var x0 = clamp(Math.round(c.x), 0, cw - 1), y0 = clamp(Math.round(c.y), 0, ch - 1), x1 = clamp(Math.round(c.x + c.w), x0 + 1, cw), y1 = clamp(Math.round(c.y + c.h), y0 + 1, ch);
		if (x0 === 0 && y0 === 0 && x1 === cw && y1 === ch) return null; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}
	/* drag one edge / corner of a crop box (hx, hy in -1 / 0 / 1; dx, dy in layer pixels) */
	function dragCrop(c, hx, hy, dx, dy, cw, ch) {
		var x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
		if (hx < 0) x0 = clamp(x0 + dx, 0, x1 - 1); if (hx > 0) x1 = clamp(x1 + dx, x0 + 1, cw); if (hy < 0) y0 = clamp(y0 + dy, 0, y1 - 1); if (hy > 0) y1 = clamp(y1 + dy, y0 + 1, ch);
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}
	/* the crop box after the layer's canvas was shifted (grown / cut) by ox, oy and is now cw x ch */
	function shiftCrop(c, ox, oy, cw, ch) { if (!c) return null; return clampCrop({ x: c.x + ox, y: c.y + oy, w: c.w, h: c.h }, cw, ch); }

	/* a random id for a project (kept in project.json, so autosaves of the same project from different files and sessions line up) */
	function newProjectId(rand) { rand = rand || Math.random; var s = "p"; for (var i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rand() * 36)]; return s; }

	var api = { rgbToHsv: rgbToHsv, hsvToRgb: hsvToRgb, parseColor: parseColor, lightness: lightness, edt: edt, outlineAlpha: outlineAlpha, normToolLayout: normToolLayout, moveTool: moveTool, clampCrop: clampCrop, dragCrop: dragCrop, shiftCrop: shiftCrop, projectKind: projectKind, projectBase: projectBase, projectFileName: projectFileName, isZipBytes: isZipBytes, zipEntries: zipEntries, projectPrefix: projectPrefix, pruneRecent: pruneRecent, upsertRecent: upsertRecent, agoText: agoText, diskChanged: diskChanged, layerFileNames: layerFileNames, newProjectId: newProjectId,
		unionBox: unionBox, boxesTouch: boxesTouch, rectFrom: rectFrom, snapTargets: snapTargets, snapAxis: snapAxis, snapBox: snapBox, guidesOn: guidesOn, linSolve: linSolve, scaleAbout: scaleAbout, wrapLines: wrapLines, richMask: richMask, richEdit: richEdit, richSet: richSet, richAll: richAll, richNorm: richNorm, richSegs: richSegs, fitFontSize: fitFontSize, folderProject: folderProject, caretLine: caretLine, hitInLine: hitInLine, wordAt: wordAt, describeSource: describeSource, bytesText: bytesText, panelClamp: panelClamp, panelKey: panelKey, clamp: clamp, hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb, histogram: histogram, identityLUT: identityLUT, applyLUT: applyLUT, levelsLUT: levelsLUT, curveLUT: curveLUT,
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
			sx: 1, sy: 1, rot: 0, visible: true, opacity: 1, blend: "source-over", locked: false, text: o.text || null, mask: null, editMask: false, rev: 0, _snap: null, group: null, collapsed: false, _p: null, src: o.src || null, crop: null, fx: null };
	};
	/* where a layer came from (shown in File -> Files and folders): {how: open|drop|paste|folder|folder-ro|psd|xcf|project|autosave|merge|made, file, path, dir, bytes, w, h, t, hk (memory-only key of a folder file handle), copy, ai: [steps]}.
	 * src objects are never changed in place (history snapshots share them): every update makes a new object. */
	PE.mkSrc = function (meta, w, h) { var s = {}; meta = meta || {}; for (var k in meta) if (meta[k] != null && meta[k] !== "") s[k] = meta[k]; if (!s.how) s.how = "made"; if (w) { s.w = Math.round(w); s.h = Math.round(h); } s.t = Date.now(); return s; };
	PE.markAi = function (L, what) { if (!L) return; var s = L.src || { how: "made" }, ai = (s.ai || []).concat([what]).slice(-6); L.src = Object.assign({}, s, { ai: ai }); };
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
			var cr = L.crop; if (cr && (p.x < cr.x || p.y < cr.y || p.x >= cr.x + cr.w || p.y >= cr.y + cr.h)) continue;   // hidden by the layer's crop box
			try { if (L.canvas.getContext("2d").getImageData(p.x | 0, p.y | 0, 1, 1).data[3] > 8) return L; } catch (e) { return L; }
		}
		return null;
	};
	/* bake the transform into the pixels (scale / rotation / flip) so tools can paint in layer space */
	PE.bake = function (L) {
		if (PE.isIdentity(L)) return;
		var cr = L.crop, m0 = matrix(L);
		if (cr && Math.abs(Math.sin(L.rot)) > 1e-9 && Math.abs(Math.cos(L.rot)) > 1e-9) { cropIntoMask(L); cr = null; }   // a crop box turned at an odd angle can't stay a box: it becomes part of the layer mask (still undoable, nothing is deleted)
		var b = PE.bounds(L), ox = Math.floor(b.x + 1e-6), oy = Math.floor(b.y + 1e-6), W = Math.max(1, Math.ceil(b.x + b.w - 1e-6) - ox), H = Math.max(1, Math.ceil(b.y + b.h - 1e-6) - oy);
		if (W * H > PE.MAXAREA) { PE.toast("That layer would be too large to edit"); return; }
		var m = matrix(L), nc = mk(W, H), x = nc.getContext("2d"); x.imageSmoothingQuality = "high";
		x.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy); x.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2); x.setTransform(1, 0, 0, 1, 0, 0);   // reset: tools later draw into this canvas with its own 2D context, and a leftover scale / offset put Delete, brush and fill marks in the wrong place
		if (L.mask) { var nm = mk(W, H), mx = nm.getContext("2d"); mx.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy); mx.drawImage(L.mask, -L.canvas.width / 2, -L.canvas.height / 2); mx.setTransform(1, 0, 0, 1, 0, 0); L.mask = nm; }
		if (cr) { var pts = [[cr.x, cr.y], [cr.x + cr.w, cr.y + cr.h]].map(function (q) { var u = q[0] - L.canvas.width / 2, v = q[1] - L.canvas.height / 2; return [m0[0] * u + m0[2] * v + m0[4] - ox, m0[1] * u + m0[3] * v + m0[5] - oy]; });
			L.crop = P.clampCrop({ x: Math.min(pts[0][0], pts[1][0]), y: Math.min(pts[0][1], pts[1][1]), w: Math.abs(pts[1][0] - pts[0][0]), h: Math.abs(pts[1][1] - pts[0][1]) }, W, H); }
		L.canvas = nc; L.cx = ox + W / 2; L.cy = oy + H / 2; L.sx = L.sy = 1; L.rot = 0; L.rev++;
	};
	/* fold a layer's crop box into its mask (used before baking a layer turned at an odd angle) */
	function cropIntoMask(L) {
		var cr = L.crop; if (!cr) return; var w = L.canvas.width, h = L.canvas.height, m = L.mask || (function () { var c = mk(w, h), x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, w, h); return c; })(), x = m.getContext("2d");
		x.save(); x.globalCompositeOperation = "destination-in"; x.fillStyle = "#000"; x.fillRect(cr.x, cr.y, cr.w, cr.h); x.restore(); L.mask = m; L.crop = null; L.rev++;
	}
	PE.cropIntoMask = cropIntoMask;
	/* grow a layer's canvas (and mask) so it covers rect {x,y,w,h} (doc coordinates); the layer must be baked */
	PE.growLayer = function (L, r) {
		var o = PE.origin(L), w = L.canvas.width, h = L.canvas.height, x0 = Math.min(o.x, Math.floor(r.x)), y0 = Math.min(o.y, Math.floor(r.y)), x1 = Math.max(o.x + w, Math.ceil(r.x + r.w)), y1 = Math.max(o.y + h, Math.ceil(r.y + r.h));
		if (x0 === o.x && y0 === o.y && x1 === o.x + w && y1 === o.y + h) return;
		var W = x1 - x0, H = y1 - y0; if (W * H > PE.MAXAREA || W > PE.MAXPX * 2) return;
		var nc = mk(W, H); nc.getContext("2d").drawImage(L.canvas, o.x - x0, o.y - y0);
		if (L.mask) { var nm = mk(W, H), mx = nm.getContext("2d"); mx.fillStyle = "#000"; mx.fillRect(0, 0, W, H); mx.clearRect(o.x - x0, o.y - y0, w, h); mx.drawImage(L.mask, o.x - x0, o.y - y0); L.mask = nm; }
		if (L.crop) L.crop = P.shiftCrop(L.crop, o.x - x0, o.y - y0, W, H);
		L.canvas = nc; L.cx = x0 + W / 2; L.cy = y0 + H / 2; L.rev++;
	};
	/* shrink a baked layer's canvas (and mask) to rect {x,y,w,h} in doc coordinates, clipped to what it has now (the opposite of growLayer) */
	PE.cropLayerTo = function (L, r) {
		var o = PE.origin(L), w = L.canvas.width, h = L.canvas.height, x0 = Math.max(o.x, Math.floor(r.x)), y0 = Math.max(o.y, Math.floor(r.y)), x1 = Math.min(o.x + w, Math.ceil(r.x + r.w)), y1 = Math.min(o.y + h, Math.ceil(r.y + r.h));
		if (x1 <= x0 || y1 <= y0 || (x0 === o.x && y0 === o.y && x1 === o.x + w && y1 === o.y + h)) return;
		var W = x1 - x0, H = y1 - y0, nc = mk(W, H); nc.getContext("2d").drawImage(L.canvas, x0 - o.x, y0 - o.y, W, H, 0, 0, W, H);
		if (L.mask) { var nm = mk(W, H); nm.getContext("2d").drawImage(L.mask, x0 - o.x, y0 - o.y, W, H, 0, 0, W, H); L.mask = nm; }
		if (L.crop) L.crop = P.shiftCrop(L.crop, o.x - x0, o.y - y0, W, H);
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
	PE.TEXTDEF = { str: "Text", font: "Arial, Helvetica, sans-serif", size: 64, bold: false, italic: false, underline: false, color: "#000000", align: "left", lh: 1.2, bgOn: false, bgColor: "#ffeb3b", bgPad: 12, bgRadius: 8, strokeOn: false, stroke: "#ffffff", strokeW: 4, shadowOn: false, shadow: "#000000", shadowBlur: 8, shadowDx: 4, shadowDy: 4, ls: 0, wrapW: 0, fit: false, boxH: 0 };
	/* rich text (MESPixel.rich*): t.rich = one style digit per character (1 bold, 2 italic, 4 underline) or null = the layer's own bold / italic / underline */
	PE.textRich = function (t) { return t && typeof t.rich === "string" && t.rich.length === String(t.str).length && t.rich.length ? t.rich : null; };
	PE.textMask = function (t) { return P.richMask(t.bold, t.italic, t.underline); };
	function fontFor(t, m, size) { return (m & 2 ? "italic " : "") + (m & 1 ? "bold " : "") + (size == null ? t.size : size) + "px " + t.font; }
	PE.textFont = fontFor;
	/* a measure(s, start) for a text at a given size: rich parts are measured with their own font */
	function measurer(t, size, ctx) {
		var rich = PE.textRich(t), base = PE.textMask(t), ls = (t.ls || 0) + "px", cache = {}, set = function (fn) { if (ctx.font !== fn) ctx.font = fn; if ("letterSpacing" in ctx && ctx.letterSpacing !== ls) ctx.letterSpacing = ls; };
		if (!rich) { var f = fontFor(t, base, size); return function (s) { var w = cache[s]; if (w == null) { set(f); w = cache[s] = ctx.measureText(s).width; } return w; }; }
		return function (s, st) {
			st = st || 0; var key = st + "|" + s, w = cache[key]; if (w != null) return w; w = 0;
			P.richSegs(rich, st, st + s.length, base).forEach(function (g) { set(fontFor(t, g.m, size)); w += ctx.measureText(s.slice(g.s - st, g.e - st)).width; });
			return (cache[key] = w);
		};
	}
	/* Auto-fit text: the font size that fills the box (Box width x box height) */
	PE.fitTextSize = function (L) {
		var t = L.text; if (!t || !t.fit || !(t.wrapW > 0) || !(t.boxH > 0)) return null; var m = lmc || (lmc = mk(8, 8).getContext("2d"));
		return P.fitFontSize(t.str, t.wrapW, t.boxH, t.lh, function (sz) { return measurer(t, sz, m); }, 4, Math.min(1000, t.boxH * 1.2));
	};
	/* where every line of a text layer sits in its canvas (shared by the renderer and the on-canvas text editor: caret, selection, click-to-place).
	 * lines = [{text, start, end}] with string offsets (MESPixel.wrapLines), lx[i] = left edge of line i, base[i] = its baseline, measure(s, start) = width in px,
	 * bh = height of the text box (the text, or the Auto-fit box when that is taller) */
	var lmc = null;
	PE.textLayout = function (L) {
		var t = L.text; if (!t) return null; var rich = PE.textRich(t), f = fontFor(t, PE.textMask(t)), dw = PE.doc ? PE.doc.w : 1200, fit = !!(t.fit && t.wrapW > 0 && t.boxH > 0);
		var key = JSON.stringify([t.str, f, rich, t.ls || 0, t.wrapW, t.lh, t.align, t.bgOn && t.bgPad, t.strokeOn && t.strokeW, t.shadowOn && [t.shadowBlur, t.shadowDx, t.shadowDy], t.wrapW > 0 ? 0 : dw, fit && t.boxH]);
		if (L._lay && L._lay.key === key) return L._lay;
		var m = lmc || (lmc = mk(8, 8).getContext("2d")), measure = measurer(t, t.size, m);
		// word wrap: an explicit box width (Box width option / the handles on the box), else never wider than 90% of the image so pasted text stays reasonable
		var lim = t.wrapW > 0 ? t.wrapW : Math.max(160, dw * 0.9), lines = P.wrapLines(t.str, lim, measure);
		var lw = lines.map(function (s) { return measure(s.text, s.start); }), mw = t.wrapW > 0 ? t.wrapW : Math.max.apply(null, lw.concat([1])), lhp = t.size * t.lh;
		var sw = t.strokeOn ? Math.max(0, t.strokeW || 0) : 0, bgp = t.bgOn ? t.bgPad : 0, pad = Math.ceil(bgp + sw + (t.shadowOn ? t.shadowBlur * 2 + Math.max(Math.abs(t.shadowDx), Math.abs(t.shadowDy)) : 0) + t.size * 0.15 + 2);
		var lx = lw.map(function (w) { return t.align === "center" ? pad + mw / 2 - w / 2 : t.align === "right" ? pad + mw - w : pad; }), base = lines.map(function (s, i) { return pad + lhp * i + t.size * 0.92; });
		var th = lhp * lines.length + t.size * 0.25, bh = fit ? Math.max(t.boxH, th) : th;
		L._lay = { key: key, font: f, rich: rich, lines: lines, lw: lw, lx: lx, base: base, mw: mw, lhp: lhp, pad: pad, bgp: bgp, bh: bh, fit: fit, W: Math.ceil(mw) + pad * 2, H: Math.ceil(Math.max(lhp * lines.length + t.size * 0.3, bh + t.size * 0.05)) + pad * 2, size: t.size, measure: measure };
		return L._lay;
	};
	PE.renderText = function (L) {
		var t = L.text; if (t.fit) { var fs = PE.fitTextSize(L); if (fs) t.size = fs; }
		var lay = PE.textLayout(L), lines = lay.lines, mw = lay.mw, lhp = lay.lhp, bgp = lay.bgp, pad = lay.pad, rich = lay.rich, base = PE.textMask(t), sz = t.size;
		var W = lay.W, H = lay.H; if (W * H > PE.MAXAREA) return;
		var oldW = L.canvas.width, oldH = L.canvas.height, c = mk(W, H), x = c.getContext("2d"), sw = t.strokeOn ? Math.max(0, t.strokeW || 0) : 0;
		if ("letterSpacing" in x) x.letterSpacing = (t.ls || 0) + "px"; x.textBaseline = "alphabetic"; x.lineJoin = "round"; x.textAlign = "left";
		if (t.bgOn) { var inner = Math.ceil(lhp * lines.length + sz * 0.3 - sz * 0.1) - Math.round(sz * 0.05); if (lay.fit) inner = Math.max(inner, Math.ceil(lay.bh)); var bx = pad - bgp, by = pad - bgp, bw = Math.ceil(mw) + bgp * 2, bh = inner + bgp * 2, br = Math.min(t.bgRadius, bw / 2, bh / 2); x.fillStyle = t.bgColor; x.beginPath(); x.moveTo(bx + br, by); x.arcTo(bx + bw, by, bx + bw, by + bh, br); x.arcTo(bx + bw, by + bh, bx, by + bh, br); x.arcTo(bx, by + bh, bx, by, br); x.arcTo(bx, by, bx + bw, by, br); x.closePath(); x.fill(); }
		// underline: scaled to the font size, from the first to the last underlined letter of each run (not the letter spacing after the last one)
		var uOff = Math.max(1, sz * 0.11), uTh = Math.max(1, sz * 0.065), ls = t.ls || 0;
		lines.forEach(function (ln, i) {
			var py = lay.base[i], x0 = lay.lx[i], segs = P.richSegs(rich, ln.start, ln.end, base), ul = [];
			segs.forEach(function (g) { g.x = x0 + lay.measure(ln.text.slice(0, g.s - ln.start), ln.start); g.txt = ln.text.slice(g.s - ln.start, g.e - ln.start); });
			segs.forEach(function (g) { if (!(g.m & 4)) return; var xe = x0 + lay.measure(ln.text.slice(0, g.e - ln.start), ln.start) - (ls > 0 ? ls : 0), last = ul[ul.length - 1]; if (last && last.e === g.s) { last.e = g.e; last.x1 = xe; } else ul.push({ s: g.s, e: g.e, x0: g.x, x1: xe }); });
			ul = ul.filter(function (u) { return u.x1 > u.x0; });
			var draw = function (fn) { segs.forEach(function (g) { x.font = fontFor(t, g.m); fn(g); }); };
			var bars = function (fn) { ul.forEach(function (u) { fn(u.x0, py + uOff, u.x1 - u.x0, uTh); }); };
			if (t.shadowOn) { x.save(); x.shadowColor = t.shadow; x.shadowBlur = t.shadowBlur; x.shadowOffsetX = t.shadowDx; x.shadowOffsetY = t.shadowDy; x.fillStyle = t.color; draw(function (g) { x.fillText(g.txt, g.x, py); }); bars(function (a, b, w, h) { x.fillRect(a, b, w, h); }); x.restore(); }
			if (sw > 0) { x.strokeStyle = t.stroke; x.lineWidth = sw * 2; draw(function (g) { x.strokeText(g.txt, g.x, py); }); bars(function (a, b, w, h) { x.strokeRect(a, b, w, h); }); }
			x.fillStyle = t.color; draw(function (g) { x.fillText(g.txt, g.x, py); }); bars(function (a, b, w, h) { x.fillRect(a, b, w, h); });
		});
		L._pad = pad; var dx = (W - oldW) / 2, dy = (H - oldH) / 2, m6 = matrix(L);      // keep the top-left corner where it was
		L.cx += m6[0] * dx + m6[2] * dy; L.cy += m6[1] * dx + m6[3] * dy; L.canvas = c; L.rev++;
		if (L.mask) { L.mask = null; } if (L.crop) L.crop = P.clampCrop(L.crop, W, H);
	};

	/* ---------- layer styles (L.fx): an outline and / or a drop shadow worked out from the layer's visible pixels (mask and crop included), never baked
	   into the layer: change or remove them any time (Layer -> Layer style). Cached in the layer's own pixel space, so panning and zooming cost nothing.
	   fx = { outline: {on, w (px on the image), c, pos: outside | center | inside, op (0-1)}, shadow: {on, c, op, blur, dx, dy (px on the image)} } */
	PE.FXDEF = { outline: { on: false, w: 4, c: "#ffffff", pos: "outside", op: 1 }, shadow: { on: false, c: "#000000", op: 0.55, blur: 14, dx: 6, dy: 8 } };
	function fxOn(L) { var f = L.fx; return !!(f && ((f.outline && f.outline.on && f.outline.w > 0) || (f.shadow && f.shadow.on))); }
	PE.hasFx = fxOn;
	/* how far (image px) the style reaches past the layer's pixels: for bounding boxes (XCF export) */
	PE.fxReach = function (L) { if (!fxOn(L)) return 0; var f = L.fx, r = 0; if (f.outline && f.outline.on && f.outline.pos !== "inside") r = f.outline.w; if (f.shadow && f.shadow.on) r = Math.max(r, f.shadow.blur * 2 + Math.max(Math.abs(f.shadow.dx), Math.abs(f.shadow.dy))); return Math.ceil(r) + 2; };
	function fxCanvases(L) {
		var f = L.fx, cw = L.canvas.width, ch = L.canvas.height, sc = Math.max(0.01, Math.sqrt(Math.abs(L.sx * L.sy))), key = [L.rev, cw, ch, L.sx, L.sy, L.rot, JSON.stringify(L.crop), JSON.stringify(f), !!L.mask, !!L.maskOff].join("|"), k = L._fxc;
		if (k && k.key === key && k.c === L.canvas) return k.r;
		var ol = f.outline && f.outline.on && f.outline.w > 0 ? f.outline : null, sh = f.shadow && f.shadow.on ? f.shadow : null, olw = ol ? ol.w / sc : 0;
		// the shadow offset is on the image (down-right stays down-right however the layer is turned): back into the layer's own axes
		var co = Math.cos(L.rot), si = Math.sin(L.rot), sdx = sh ? (co * sh.dx + si * sh.dy) / L.sx : 0, sdy = sh ? (-si * sh.dx + co * sh.dy) / L.sy : 0, sbl = sh ? sh.blur / sc : 0;
		var mg = Math.ceil(Math.max(ol && ol.pos !== "inside" ? olw : 0, sh ? sbl * 2 + Math.max(Math.abs(sdx), Math.abs(sdy)) : 0)) + 2, W = cw + mg * 2, H = ch + mg * 2, r = { mg: mg, under: null, over: null };
		if (W * H > 24e6) { L._fxc = { key: key, c: L.canvas, r: r }; return r; }   // too big to work out in a browser: drawn without the style
		var src = mk(W, H), sx = src.getContext("2d"); sx.drawImage(L.canvas, mg, mg);
		if (L.mask && !L.maskOff) { sx.globalCompositeOperation = "destination-in"; sx.drawImage(L.mask, mg, mg); }
		if (L.crop) { sx.globalCompositeOperation = "destination-in"; sx.fillStyle = "#000"; sx.fillRect(mg + L.crop.x, mg + L.crop.y, L.crop.w, L.crop.h); }
		sx.globalCompositeOperation = "source-over";
		var under = null, over = null;
		if (sh) {
			var rgb = P.hexToRgb(sh.c), sc2 = mk(W, H), q = sc2.getContext("2d"); q.shadowColor = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + Math.max(0, Math.min(1, sh.op)) + ")"; q.shadowBlur = sbl; q.shadowOffsetX = 30000 + sdx; q.shadowOffsetY = sdy; q.drawImage(src, -30000, 0); under = sc2;
		}
		if (ol) {
			var id = sx.getImageData(0, 0, W, H), al = new Uint8Array(W * H); for (var i = 0; i < al.length; i++) al[i] = id.data[i * 4 + 3];
			var oa = P.outlineAlpha(al, W, H, olw, ol.pos), c3 = P.hexToRgb(ol.c), oc = mk(W, H), ox = oc.getContext("2d"), od = ox.createImageData(W, H), opa = Math.max(0, Math.min(1, ol.op == null ? 1 : ol.op));
			for (var j = 0; j < oa.length; j++) { if (!oa[j]) continue; od.data[j * 4] = c3[0]; od.data[j * 4 + 1] = c3[1]; od.data[j * 4 + 2] = c3[2]; od.data[j * 4 + 3] = Math.round(oa[j] * opa); }
			ox.putImageData(od, 0, 0);
			if (ol.pos === "outside") { if (under) { under.getContext("2d").drawImage(oc, 0, 0); } else under = oc; } else over = oc;
		}
		r.under = under; r.over = over; L._fxc = { key: key, c: L.canvas, r: r }; return r;
	}
	PE.fxCanvases = fxCanvases;

	/* ---------- compositing ---------- */
	function clipCrop(x, L) { var cr = L.crop; if (!cr) return; x.beginPath(); x.rect(cr.x - L.canvas.width / 2, cr.y - L.canvas.height / 2, cr.w, cr.h); x.clip(); }
	function drawLayer(ctx, L, base, tmpKey, w, h) {
		if (PE.isGroup(L) || !L.visible) return; var op = L.opacity; for (var gp = L._p; gp; gp = gp._p) { if (!gp.visible) return; op *= gp.opacity; } if (op <= 0) return;
		var src = L.preview || L.canvas, cw = L.canvas.width, ch = L.canvas.height, m = matrix(L), fx = fxOn(L) && !L.noFx ? fxCanvases(L) : null, msk = L.mask && !L.maskOff ? L.mask : null;
		if (L.mask && L.viewMask && PE.maskView) { src = PE.maskView(L); msk = null; fx = null; }   // Alt-click on the mask box: show the mask itself (white = shown)
		var needTmp = msk || L.live || fx;
		if (!needTmp) {
			ctx.save(); ctx.globalAlpha = op; ctx.globalCompositeOperation = L.blend;
			ctx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
			clipCrop(ctx, L); ctx.drawImage(src, -cw / 2, -ch / 2, cw, ch); ctx.restore(); return;
		}
		var t = PE.tmp(tmpKey, w, h), tx = t.getContext("2d");
		tx.save(); tx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
		tx.imageSmoothingQuality = "high"; tx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
		clipCrop(tx, L);
		tx.drawImage(src, -cw / 2, -ch / 2, cw, ch);
		if (L.live && L.live.target !== "mask") { tx.globalCompositeOperation = L.live.erase ? "destination-out" : "source-over"; tx.globalAlpha = L.live.alpha; tx.drawImage(L.live.buf, -cw / 2, -ch / 2); tx.globalAlpha = 1; }
		if (msk) {
			tx.globalCompositeOperation = "destination-in";
			if (L.live && L.live.target === "mask") { var mm = PE.tmp(tmpKey + "m", L.mask.width, L.mask.height), mc = mm.getContext("2d"); mc.drawImage(L.mask, 0, 0); mc.globalCompositeOperation = L.live.erase ? "destination-out" : "source-over"; mc.globalAlpha = L.live.alpha; mc.drawImage(L.live.buf, 0, 0); tx.drawImage(mm, -cw / 2, -ch / 2); }
			else tx.drawImage(L.mask, -cw / 2, -ch / 2);
		}
		tx.restore();
		if (fx && (fx.under || fx.over)) {
			tx.save(); tx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
			tx.imageSmoothingQuality = "high"; tx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
			if (fx.under) { tx.globalCompositeOperation = "destination-over"; tx.drawImage(fx.under, -cw / 2 - fx.mg, -ch / 2 - fx.mg); }
			if (fx.over) { tx.globalCompositeOperation = "source-over"; tx.drawImage(fx.over, -cw / 2 - fx.mg, -ch / 2 - fx.mg); }
			tx.restore();
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
		if (!PE.sel && (mode === "sub" || mode === "int")) mode = "new"; /* nothing to subtract from: start a selection instead of making an empty one */
		var d = PE.doc, s = selCanvas(), n = mk(d.w, d.h), nx = n.getContext("2d"); nx.fillStyle = "#fff"; draw(nx);
		PE.selCombine(n, mode);
	};
	PE.selCombine = function (n, mode) {
		if (!PE.sel && (mode === "sub" || mode === "int")) mode = "new";
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
		return { meta: { id: L.id, group: L.group, collapsed: L.collapsed, name: L.name, type: L.type, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, text: L.text ? JSON.parse(JSON.stringify(L.text)) : null, eq: L.eq ? JSON.parse(JSON.stringify(L.eq)) : null, editMask: L.editMask, maskOff: !!L.maskOff, src: L.src || null, crop: L.crop ? Object.assign({}, L.crop) : null, fx: L.fx ? JSON.parse(JSON.stringify(L.fx)) : null }, snap: s };
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
			var L = PE.makeLayer({ canvas: clone(l.snap.c), type: l.meta.type, name: l.meta.name, text: l.meta.text }); for (var k in l.meta) if (k !== "text" && k !== "eq" && k !== "crop" && k !== "fx") L[k] = l.meta[k]; L.crop = l.meta.crop ? Object.assign({}, l.meta.crop) : null; L.fx = l.meta.fx ? JSON.parse(JSON.stringify(l.meta.fx)) : null; L.text = l.meta.text ? JSON.parse(JSON.stringify(l.meta.text)) : null; L.eq = l.meta.eq ? JSON.parse(JSON.stringify(l.meta.eq)) : null;
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
		PE.doc = { w: w, h: h, layers: [], activeId: 0, next: 1, name: name || "Untitled", comps: [], pid: P.newProjectId() }; PE.sel = null; H.stack = []; H.idx = -1; lastSel = { ver: -1 };
		var L = PE.makeLayer({ name: bg ? "Background" : "Layer 1" }); if (bg) { var x = L.canvas.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, w, h); }
		PE.doc.layers.push(L); PE.doc.activeId = L.id; PE.commit("New document"); PE.dirty = false; PE.emit("docsize"); PE.emit("sel"); PE.fit(); return true;
	};
	PE.openImageSource = function (src, name, meta) {
		var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, w0 = w, h0 = h;
		if (w > PE.MAXPX || h > PE.MAXPX || w * h > PE.MAXAREA) { var s = Math.min(PE.MAXPX / w, PE.MAXPX / h, Math.sqrt(PE.MAXAREA / (w * h))), c = mk(w * s, h * s), x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; PE.toast("Very large image: scaled down to " + w + " × " + h + " to fit the browser"); }
		if (!PE.newDoc(w, h, null, I.baseName(name || "image"))) return false;
		var L = PE.doc.layers[0]; L.name = "Background"; L.canvas.getContext("2d").drawImage(src, 0, 0); L.rev++; L.src = PE.mkSrc(meta || { how: "open", file: name }, w0, h0); PE.doc.file = L.src; PE.commit("Open " + (name || "image")); PE.dirty = false; PE.fit(); return true;
	};
	PE.decodeFile = function (file) {
		if (window.createImageBitmap && !/svg/.test(file.type)) return createImageBitmap(file).catch(function () { return viaImg(file); });
		return viaImg(file);
	};
	function viaImg(file) { return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("Can't read this image")); }; im.src = u; }); }
	/* add an image / canvas as a new layer, centred (scaled down if bigger than the document) */
	PE.placeSource = function (src, name, at, meta) {
		var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, c = mk(w, h); c.getContext("2d").drawImage(src, 0, 0);
		var L = PE.makeLayer({ canvas: c, name: name || "Layer", cx: at ? at.x : PE.doc.w / 2, cy: at ? at.y : PE.doc.h / 2, src: meta ? PE.mkSrc(meta, w, h) : null });
		if (!at && (w > PE.doc.w || h > PE.doc.h)) { var s = Math.min(PE.doc.w / w, PE.doc.h / h); L.sx = L.sy = s; }
		if (!at) { L.cx = Math.round(PE.doc.w / 2 * 2) / 2; L.cy = Math.round(PE.doc.h / 2 * 2) / 2; if (PE.isIdentity(L)) { L.cx = Math.round(L.cx - w / 2) + w / 2; L.cy = Math.round(L.cy - h / 2) + h / 2; } }
		PE.addLayer(L); PE.commit("Place " + (name || "image")); return L;
	};

	/* ---------- layer commands ---------- */
	PE.newRasterLayer = function (name) { PE.addLayer(PE.makeLayer({ name: name || "Layer " + PE.doc.next })); PE.commit("New layer"); };
	PE.duplicateLayer = function (L) {
		L = L || PE.active(); if (!L) return; var d = PE.doc, block = PE.blockOf(L), map = {}, copies = block.map(function (B) {
			var n = PE.makeLayer({ canvas: clone(B.canvas), type: B.type, name: B.name + (B === L ? " copy" : ""), text: B.text ? JSON.parse(JSON.stringify(B.text)) : null }); map[B.id] = n;
			["cx", "cy", "sx", "sy", "rot", "visible", "opacity", "blend", "collapsed"].forEach(function (k) { n[k] = B[k]; }); if (B.eq) n.eq = JSON.parse(JSON.stringify(B.eq)); if (B.mask) n.mask = clone(B.mask); if (B.src) n.src = Object.assign({}, B.src, { copy: true }); if (B.crop) n.crop = Object.assign({}, B.crop); if (B.fx) n.fx = JSON.parse(JSON.stringify(B.fx)); return n; });
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
		var top = list[list.length - 1], n = PE.makeLayer({ canvas: c, name: list[0].name, x: x0, y: y0, src: { how: "merge", from: list.map(function (L) { return L.name; }).reverse(), t: Date.now() } }), at = d.layers.indexOf(top); n.group = top.group;
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
	PE.applyMask = function (L) { L = L || PE.active(); if (!L || !L.mask) return; PE.bake(L); var x = L.canvas.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-in"; x.drawImage(L.mask, 0, 0); x.restore(); L.mask = null; L.editMask = false; L.maskOff = false; L.viewMask = false; L.rev++; PE.commit("Apply layer mask"); };
	PE.deleteMask = function (L) { L = L || PE.active(); if (!L || !L.mask) return; L.mask = null; L.editMask = false; L.maskOff = false; L.viewMask = false; L.rev++; PE.commit("Delete layer mask"); };

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
	/* set the canvas to rect {x,y,w,h} measured from the current top-left (x / y may be negative to grow upwards / leftwards), optional fill colour layer at the bottom */
	PE.canvasRect = function (x, y, w, h, fill) {
		var d = PE.doc; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (w < 1 || h < 1) return; if (w * h > PE.MAXAREA || w > PE.MAXPX || h > PE.MAXPX) { PE.toast("Too large"); return; }
		d.layers.forEach(function (L) { L.cx -= x; L.cy -= y; }); d.w = w; d.h = h;
		if (fill) { var L = PE.makeLayer({ name: "Background" }); L.canvas.getContext("2d").fillStyle = fill; L.canvas.getContext("2d").fillRect(0, 0, w, h); d.layers.unshift(L); }
		PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Canvas size"); PE.fit();
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
			var ow0 = L.canvas.width, oh0 = L.canvas.height; L.canvas = PE.resample(L.canvas, nw, nh); if (L.mask) L.mask = PE.resample(L.mask, nw, nh); if (L.crop) L.crop = P.clampCrop({ x: L.crop.x * nw / ow0, y: L.crop.y * nh / oh0, w: L.crop.w * nw / ow0, h: L.crop.h * nh / oh0 }, nw, nh); L.cx *= fx; L.cy *= fy; L.cx = Math.round(L.cx - nw / 2) + nw / 2; L.cy = Math.round(L.cy - nh / 2) + nh / 2; L.rev++;
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
			var m = { id: L.id, group: L.group, collapsed: L.collapsed, name: L.name, type: L.type, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, text: L.text, w: L.canvas.width, h: L.canvas.height, hasMask: !!L.mask, eq: L.eq || null, src: L.src ? Object.assign({}, L.src, { hk: undefined }) : null, crop: L.crop || null, fx: L.fx || null, maskOff: !!L.maskOff }; metas.push(m);
			jobs.push(canvasBytes(L.canvas).then(function (u) { files.push({ name: "layer-" + L.id + ".png", data: u }); }));
			if (L.mask) jobs.push(canvasBytes(L.mask).then(function (u) { files.push({ name: "mask-" + L.id + ".png", data: u }); }));
		});
		return Promise.all(jobs).then(function () {
			files.unshift({ name: "project.json", data: new TextEncoder().encode(JSON.stringify({ app: "MES Photo Editor", v: 2, pid: d.pid || (d.pid = P.newProjectId()), w: d.w, h: d.h, name: d.name, active: d.activeId, next: d.next, layers: metas, comps: d.comps || [] })) });
			return new Blob([I.zipStore(files)], { type: "application/zip" });
		});
	};
	function loadPng(u8) { return new Promise(function (res, rej) { var u = URL.createObjectURL(new Blob([u8], { type: "image/png" })), im = new Image(); im.onload = function () { var c = mk(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0); URL.revokeObjectURL(u); res(c); }; im.onerror = function () { rej(new Error("bad layer image")); }; im.src = u; }); }
	/* the files of a ZIP (stored, or deflated as Finder / Explorer / 7-Zip make them) with project.json's folder stripped from the names */
	PE.readProjectZip = function (u8) {
		var ents = P.zipEntries(u8); if (!ents) return Promise.reject(new Error("Not a MES project file (not a ZIP this editor can read)"));
		var pre = P.projectPrefix(ents.map(function (e) { return e.name; })); if (pre === null) return Promise.reject(new Error("Not a MES project file: the ZIP has no project.json"));
		ents = ents.filter(function (e) { return e.name.indexOf(pre) === 0 && !/(^|\/)__MACOSX\//.test(e.name); });
		return Promise.all(ents.map(function (e) {
			var name = e.name.slice(pre.length); if (e.method === 0) return { name: name, data: e.data };
			if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack compressed ZIPs: save the project from the editor (it writes an uncompressed one)");
			return new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer().then(function (ab) { return { name: name, data: new Uint8Array(ab) }; });
		}));
	};
	PE.isProjectZip = function (u8) { var e = P.isZipBytes(u8) && P.zipEntries(u8); return !!(e && P.projectPrefix(e.map(function (x) { return x.name; })) !== null); };
	/* opts: {pid} = the project id to use when project.json has none (an autosave from before round 5) */
	PE.loadProject = function (buf, fileName, meta, opts) {
		opts = opts || {}; return PE.readProjectZip(new Uint8Array(buf)).then(function (files) { return loadProjectFiles(files, fileName, meta, opts); });
	};
	function loadProjectFiles(files, fileName, meta, opts) {
		var by = {}; files.forEach(function (f) { by[f.name] = f.data; }); if (!by["project.json"]) return Promise.reject(new Error("Not a MES project file"));
		var p = JSON.parse(new TextDecoder().decode(by["project.json"])), layers = [];
		return Promise.all(p.layers.map(function (m, i) {
			return loadPng(by["layer-" + m.id + ".png"]).then(function (c) { var L = PE.makeLayer({ canvas: c, name: m.name, type: m.type, text: m.text }); L.id = m.id; L.eq = m.eq || null; L.src = m.src || (m.type === "group" ? null : { how: fileName === "autosave" ? "autosave" : "project", file: fileName === "autosave" ? "" : fileName || "" }); ["cx", "cy", "sx", "sy", "rot", "visible", "opacity", "blend", "locked", "group", "collapsed"].forEach(function (k) { if (m[k] !== undefined) L[k] = m[k]; }); L.crop = m.crop ? P.clampCrop(m.crop, c.width, c.height) : null; L.fx = m.fx && typeof m.fx === "object" ? m.fx : null; L.maskOff = !!m.maskOff; layers[i] = L; return m.hasMask ? loadPng(by["mask-" + m.id + ".png"]).then(function (mc) { L.mask = mc; }) : null; });
		})).then(function () {
			PE.doc = { w: p.w, h: p.h, layers: layers, activeId: p.active, next: p.next || 1000, name: p.name || "Untitled", comps: p.comps || [], pid: p.pid || opts.pid || P.newProjectId(), file: PE.mkSrc(fileName === "autosave" ? { how: "autosave" } : Object.assign({ how: "project", file: fileName }, meta || {}, { how: "project" })) }; PE.relink(); PE.sel = null; H.stack = []; H.idx = -1; lastSel = { ver: -1 };
			PE.commit("Open project"); PE.dirty = false; PE.emit("docsize"); PE.emit("sel"); PE.fit();
		});
	}
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
	PE.pointerBusy = function () { return Object.keys(down).length > 0 || !!current; };   // a stroke / drag is going on (auto-save to the project file waits)
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
		el.addEventListener("mousedown", function (e) { if (PE.textEditing && PE.textEditing()) e.preventDefault(); });   // keep the keyboard on the text being edited (no blur, no end of the edit)
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
		if (PE.guides && PE.guides.length) {   // snap guides: magenta = the canvas (edges, centre), cyan = another layer
			x.lineWidth = 1; ["c", "l"].forEach(function (kind) { x.strokeStyle = kind === "c" ? "#ff3df0" : "#22d3ee"; x.beginPath(); PE.guides.forEach(function (g) { if ((g.k || "c") !== kind) return; if (g.v != null) { var sx = Math.round(g.v * v.zoom + v.px) + 0.5; x.moveTo(sx, 0); x.lineTo(sx, v.h); } else { var sy = Math.round(g.h * v.zoom + v.py) + 0.5; x.moveTo(0, sy); x.lineTo(v.w, sy); } }); x.stroke(); });
		}
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

	/* ---------- Move + free transform: one layer, a group, or several layers at once ----------
	 * The Move tool acts on PE.moveSet(): the layers picked in the Layers panel (Ctrl / Shift-click) or with a rubber band on the canvas, else the active layer.
	 * Snapping (MESPixel.snapBox / snapAxis): the canvas edges + centre lines and, with "Snap to other layers", every other visible layer's visible box
	 * (its non-transparent pixels, so a text snaps by its letters, not by the padding around them). 6 screen px; Ctrl (or Alt while moving) = no snapping. */
	var HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
	function handleScreen(L, hd) {
		var c = Math.cos(L.rot), s = Math.sin(L.rot), hw = L.canvas.width * L.sx / 2, hh = L.canvas.height * L.sy / 2, lx = hd[0] * hw, ly = hd[1] * hh;
		return PE.toScreen(L.cx + c * lx - s * ly, L.cy + s * lx + c * ly);
	}
	function boxHandle(b, hd) { return PE.toScreen(b.x + (hd[0] + 1) / 2 * b.w, b.y + (hd[1] + 1) / 2 * b.h); }
	function scr(e) { var r = PE.els.over.getBoundingClientRect(); return { x: e.sx - r.left, y: e.sy - r.top }; }
	var mv = null, hoverTM = null;
	function pickTarget(hit, L, groupsOn) {
		if (!groupsOn) return hit; var anc = PE.ancestorsOf(hit); if (!anc.length) return hit; if (L === hit) return hit; if (L && anc.indexOf(L) >= 0) return L;
		if (L && PE.topGroupOf(L) === PE.topGroupOf(hit)) return hit; return PE.topGroupOf(hit);
	}
	/* the layers the Move tool works on (a group in the list stands for its members, so a member listed as well is dropped) */
	PE.moveSet = function () {
		if (!PE.doc) return []; var m = PE.multi ? PE.multi() : [], A = PE.active(), list = m.length > 1 ? m : (A ? [A] : []);
		return list.filter(function (L) { return !PE.ancestorsOf(L).some(function (g) { return list.indexOf(g) >= 0; }); });
	};
	function leaves(set) { var out = []; set.forEach(function (L) { (PE.isGroup(L) ? PE.descendants(L) : [L]).forEach(function (k) { if (!PE.isGroup(k) && out.indexOf(k) < 0) out.push(k); }); }); return out; }
	/* visible box: the non-transparent part of a layer, in document coordinates (cached per pixel revision); null = nothing visible */
	function visLocal(L) {
		var c = L.canvas, v = L._vb, ck = L.crop ? [L.crop.x, L.crop.y, L.crop.w, L.crop.h].join(",") : ""; if (v && v.rev === L.rev && v.c === c && v.ck === ck) return v.r;
		var r = { x: 0, y: 0, w: c.width, h: c.height };
		if (c.width * c.height <= 16e6) { try { r = P.opaqueBounds(c.getContext("2d").getImageData(0, 0, c.width, c.height).data, c.width, c.height, 8); } catch (x) { } }
		if (r && L.crop) { var cr = L.crop, x0 = Math.max(r.x, cr.x), y0 = Math.max(r.y, cr.y), x1 = Math.min(r.x + r.w, cr.x + cr.w), y1 = Math.min(r.y + r.h, cr.y + cr.h); r = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; }   // only what the crop box shows
		L._vb = { rev: L.rev, c: c, r: r, ck: ck }; return r;
	}
	function locToDoc(L, u, v) { var c = Math.cos(L.rot), s = Math.sin(L.rot), lx = (u - L.canvas.width / 2) * L.sx, ly = (v - L.canvas.height / 2) * L.sy; return { x: L.cx + c * lx - s * ly, y: L.cy + s * lx + c * ly }; }
	PE.visBox = function (L) {
		if (PE.isGroup(L)) return P.unionBox(PE.descendants(L).filter(function (k) { return !PE.isGroup(k) && PE.effVisible(k); }).map(PE.visBox));
		var r = visLocal(L); if (!r) return null; var pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(function (q) { return locToDoc(L, q[0], q[1]); });
		var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; }), x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys); return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
	};
	function setBox(set) { return P.unionBox(set.map(function (L) { return PE.bounds(L); })); }
	function targetsFor(moving) {
		var o = PE.opt.move, d = PE.doc, boxes = [];
		if (o.snapLayers) d.layers.forEach(function (L) { if (PE.isGroup(L) || moving.indexOf(L) >= 0 || !PE.effVisible(L) || L.opacity <= 0) return; var b = PE.visBox(L); if (b && b.w > 0 && b.h > 0) boxes.push(b); });
		return P.snapTargets(o.snap ? d.w : null, o.snap ? d.h : null, boxes);
	}
	function snapOn(e) { var o = PE.opt.move; return (o.snap || o.snapLayers) && !e.ctrl; }
	function guidesFrom(gx, gy) { PE.guides = gx.map(function (g) { return { v: g.p, k: g.k }; }).concat(gy.map(function (g) { return { h: g.p, k: g.k }; })); }
	function th() { return 6 / PE.view.zoom; }
	function startMove(set, e) {
		set = set.filter(function (L) { return !L.locked; }); if (!set.length) { PE.toast("This layer is locked"); mv = null; return; }
		var items = leaves(set).filter(function (k) { return !k.locked; });
		mv = { kind: "move", set: set, items: items.map(function (k) { return [k, k.cx, k.cy]; }), p0: e, moved: false, box0: P.unionBox(items.filter(PE.effVisible).map(PE.visBox)), tg: targetsFor(items) };
	}
	/* one layer's resize, as before: from the dragged handle (Shift = the other proportion rule, Alt = from the centre) */
	function scaleDims(m, e) {
		var L = m.L, c = Math.cos(m.rot), s = Math.sin(m.rot), dx2 = e.x - m.cx0, dy2 = e.y - m.cy0, lx = c * dx2 + s * dy2, ly = -s * dx2 + c * dy2, hd = m.h, W0 = L.canvas.width * Math.abs(m.sx0), H0 = L.canvas.height * Math.abs(m.sy0);
		var ax = e.alt ? 0 : -hd[0] * W0 / 2, ay = e.alt ? 0 : -hd[1] * H0 / 2, nw = hd[0] ? Math.max(2, (lx - ax) * hd[0] * (e.alt ? 2 : 1)) : W0, nh = hd[1] ? Math.max(2, (ly - ay) * hd[1] * (e.alt ? 2 : 1)) : H0;
		var uniform = (hd[0] && hd[1]) ? !e.shift : e.shift;
		if (uniform && hd[0] && hd[1]) { var f = Math.max(nw / W0, nh / H0); nw = W0 * f; nh = H0 * f; } else if (uniform) { var f2 = hd[0] ? nw / W0 : nh / H0; nw = W0 * f2; nh = H0 * f2; }
		return { nw: nw, nh: nh, uniform: uniform, W0: W0, H0: H0, ax: ax, ay: ay };
	}
	function applyDims(m, d, nw, nh, alt) {
		var L = m.L, c = Math.cos(m.rot), s = Math.sin(m.rot), hd = m.h, ncx = alt ? 0 : d.ax + hd[0] * nw / 2, ncy = alt ? 0 : d.ay + hd[1] * nh / 2;
		L.sx = Math.sign(m.sx0 || 1) * nw / L.canvas.width; L.sy = Math.sign(m.sy0 || 1) * nh / L.canvas.height; L.cx = m.cx0 + c * ncx - s * ncy; L.cy = m.cy0 + s * ncx + c * ncy;
	}
	function uprightish(r) { var q = ((r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return q < 1e-6 || Math.abs(q - 2 * Math.PI) < 1e-6; }
	/* snap the moving edges of a box that depends linearly on one size parameter per axis. edgesAt(p, axis) -> [positions]; returns the snapped parameters */
	function snapSizes(e, m, px, py, edgesAt, uniform) {
		var t = m.tg, T = th(), best = { x: null, y: null };
		[["x", px], ["y", py]].forEach(function (q) {
			var ax = q[0], p = q[1]; if (p == null) return; var e0 = edgesAt(p, ax), e1 = edgesAt(p + 1, ax);
			e0.forEach(function (v, i) { var s = P.snapAxis([v], ax === "x" ? t.x : t.y, T); if (!s) return; var np = P.linSolve(p, v, p + 1, e1[i], s.p); if (np == null || !(np > 0)) return; if (!best[ax] || Math.abs(s.d) < Math.abs(best[ax].d)) best[ax] = { d: s.d, p: np, t: s }; });
		});
		if (uniform && best.x && best.y) { if (Math.abs(best.x.d) <= Math.abs(best.y.d)) best.y = null; else best.x = null; }
		return best;
	}
	PE.defTool({ id: "move", name: "Move / Transform", key: "v", icon: "✥", opts: { auto: true, handles: true, snap: true, snapLayers: true, groups: true },
		ui: [{ k: "auto", label: "Pick layer on click", type: "check" }, { k: "groups", label: "Pick the whole group", type: "check" }, { k: "handles", label: "Transform handles", type: "check" }, { k: "snap", label: "Snap to canvas edges", type: "check" }, { k: "snapLayers", label: "Snap to other layers", type: "check" }, { type: "button", label: "✎ Edit text / equation", act: function () { var L = PE.active(); if (L && L.type === "text") PE.editActiveText(); else if (L && L.eq) PE.dlgEquation(L); else PE.toast("Select a text or equation layer first (click it on the picture)"); } }, { type: "button", label: "✂ Remove background (AI)", act: function () { PE.aiRemoveBackground(); } }],
		hint: "Drag to move. Shift / Ctrl-click adds or removes layers; drag on empty canvas to box-select several. Handles resize (Shift = other proportions), just outside a corner rotates. On a text: the purple side handles wrap it (with Auto-fit text the purple corners resize the box; Alt+corner scales). Hold Ctrl (or Alt) while dragging = no snapping. Arrows nudge.",
		down: function (e) {
			var o = PE.opt.move, A = PE.active(), set = PE.moveSet(), multi = set.length > 1, sp = scr(e), i;
			mv = null; PE.guides = [];
			if (o.handles && !e.shift && !e.ctrl) {
				if (multi) {
					var b = setBox(set); if (b) for (i = 0; i < 8; i++) { var hs = boxHandle(b, HANDLES[i]); if (Math.hypot(hs.x - sp.x, hs.y - sp.y) < 9) {
						var its = leaves(set).filter(function (k) { return !k.locked; }); if (its.length !== leaves(set).length) { PE.toast("A locked layer is in the selection"); return; }
						mv = { kind: "mscale", set: set, b0: b, vb0: P.unionBox(its.filter(PE.effVisible).map(PE.visBox)) || b, h: HANDLES[i], items: its.map(function (k) { return [k, k.cx, k.cy, k.sx, k.sy, k.rot]; }), tg: targetsFor(its) }; return; } }
				} else if (A && A.visible && !PE.isGroup(A) && !A.locked) {
					var isText = A.type === "text" && A.text && PE.textBoxHit;
					if (isText) {   // a text layer: the purple handles on its box change the wrap width (and, with Auto-fit text, the box height); Alt on a box corner = scale
						var tbh = PE.textBoxHit(A, e);
						if (tbh) { if (e.alt && tbh.hx !== 0.5 && tbh.hy !== 0.5) { mv = { kind: "scale", L: A, h: [tbh.hx * 2 - 1, tbh.hy * 2 - 1], sx0: A.sx, sy0: A.sy, cx0: A.cx, cy0: A.cy, rot: A.rot, p0: e, tg: targetsFor([A]) }; return; } mv = { kind: "tbox", tb: PE.textBoxStart(A, tbh) }; return; }
					}
					for (i = 0; i < 8; i++) { if (isText && (A.text.fit || i % 2)) continue; var s = handleScreen(A, HANDLES[i]); if (Math.hypot(s.x - sp.x, s.y - sp.y) < 9) { mv = { kind: "scale", L: A, h: HANDLES[i], sx0: A.sx, sy0: A.sy, cx0: A.cx, cy0: A.cy, rot: A.rot, p0: e, tg: targetsFor([A]) }; return; } }
					var corners = [0, 2, 4, 6].map(function (k) { return handleScreen(A, HANDLES[k]); });
					for (i = 0; i < 4; i++) { var dd = Math.hypot(corners[i].x - sp.x, corners[i].y - sp.y); if (dd >= 9 && dd < 30 && !PE.layerAtPoint(A, e.x, e.y)) { mv = { kind: "rot", L: A, a0: Math.atan2(e.y - A.cy, e.x - A.cx), rot0: A.rot }; return; } }
				}
			}
			var raw = o.auto ? PE.layerAt(e.x, e.y) : null; if (raw && raw !== A && PE.isBackdrop(raw)) raw = null;
			var hit = raw ? pickTarget(raw, multi ? null : A, o.groups) : null;
			if (e.shift || e.ctrl) {   // add to / take out of the selection; on empty canvas a rubber band adds
				if (hit) { var now = PE.toggleMove(hit); if (now) startMove(PE.moveSet(), e); return; }
				mv = { kind: "band", a: e, b: e, add: true }; return;
			}
			if (hit && multi && set.indexOf(hit) >= 0) { startMove(set, e); return; }   // dragging one of the selected layers moves them all
			if (multi && hit && PE.ancestorsOf(hit).some(function (g) { return set.indexOf(g) >= 0; })) { startMove(set, e); return; }
			if (hit) { if (hit !== A || multi) { if (PE.setMulti) PE.setMulti([]); PE.setActive(hit.id); } startMove([hit], e); return; }
			if (!o.auto) { if (set.length) startMove(set, e); return; }
			if (multi) { var mb = setBox(set); if (mb && e.x >= mb.x && e.y >= mb.y && e.x <= mb.x + mb.w && e.y <= mb.y + mb.h) { startMove(set, e); return; } }
			else if (A && PE.layerAtPoint(A, e.x, e.y) && PE.effVisible(A)) { startMove([A], e); return; }   // e.g. dragging the active background picture
			mv = { kind: "band", a: e, b: e, add: false };   // empty canvas (or outside the picture): rubber-band select
		},
		move: function (e) {
			if (!mv) return; var L = mv.L, T = th();
			if (mv.kind === "band") { mv.b = e; PE.invalidateOverlay(); return; }
			if (mv.kind === "tbox") { PE.textBoxMove(mv.tb, e); mv.moved = mv.tb.moved; return; }
			if (mv.kind === "move") {
				var dx = Math.round(e.x - mv.p0.x), dy = Math.round(e.y - mv.p0.y); if (e.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
				PE.guides = [];
				if (snapOn(e) && !e.alt && mv.box0) {
					var lockX = e.shift && dx === 0, lockY = e.shift && dy === 0, r = P.snapBox({ x: mv.box0.x + dx, y: mv.box0.y + dy, w: mv.box0.w, h: mv.box0.h }, mv.tg, T);   // Shift keeps the drag on one axis: only that axis snaps
					if (!lockX) dx += r.dx; else r.gx = []; if (!lockY) dy += r.dy; else r.gy = []; guidesFrom(r.gx, r.gy);
				}
				mv.items.forEach(function (g) { g[0].cx = g[1] + dx; g[0].cy = g[2] + dy; }); mv.moved = mv.moved || dx !== 0 || dy !== 0; PE.invalidate(); return;
			}
			if (mv.kind === "rot") { var a = Math.atan2(e.y - L.cy, e.x - L.cx), rr = mv.rot0 + (a - mv.a0); if (e.shift) rr = Math.round(rr / (Math.PI / 12)) * (Math.PI / 12); L.rot = rr; mv.moved = true; PE.invalidate(); return; }
			if (mv.kind === "scale") {
				var d = scaleDims(mv, e), nw = d.nw, nh = d.nh; applyDims(mv, d, nw, nh, e.alt); PE.guides = [];
				var vr = visLocal(L);
				if (snapOn(e) && vr && uprightish(mv.rot) && mv.sx0 > 0 && mv.sy0 > 0) {
					var hd = mv.h, W = L.canvas.width, H = L.canvas.height;
					var edgesAt = function (p, ax) { var keep = [L.sx, L.sy, L.cx, L.cy]; if (ax === "x") applyDims(mv, d, p, nh, e.alt); else applyDims(mv, d, nw, p, e.alt); var out = ax === "x" ? [L.cx + (vr.x - W / 2) * L.sx, L.cx + (vr.x + vr.w - W / 2) * L.sx] : [L.cy + (vr.y - H / 2) * L.sy, L.cy + (vr.y + vr.h - H / 2) * L.sy]; L.sx = keep[0]; L.sy = keep[1]; L.cx = keep[2]; L.cy = keep[3]; var side = ax === "x" ? hd[0] : hd[1]; return e.alt ? out : side < 0 ? [out[0], NaN] : [NaN, out[1]]; };
					var bs = snapSizes(e, mv, hd[0] ? nw : null, hd[1] ? nh : null, edgesAt, d.uniform);
					if (bs.x || bs.y) {
						if (d.uniform) { var f = bs.x ? bs.x.p / nw : bs.y.p / nh; nw *= f; nh *= f; } else { if (bs.x) nw = bs.x.p; if (bs.y) nh = bs.y.p; }
						applyDims(mv, d, Math.max(2, nw), Math.max(2, nh), e.alt); guidesFrom(bs.x ? [bs.x.t] : [], bs.y ? [bs.y.t] : []);
					}
				}
				mv.moved = true; PE.invalidate(); return;
			}
			if (mv.kind === "mscale") {
				var b0 = mv.b0, h2 = mv.h, ux = e.alt ? b0.x + b0.w / 2 : h2[0] < 0 ? b0.x + b0.w : b0.x, uy = e.alt ? b0.y + b0.h / 2 : h2[1] < 0 ? b0.y + b0.h : b0.y;
				var ex = h2[0] > 0 ? b0.x + b0.w : b0.x, ey = h2[1] > 0 ? b0.y + b0.h : b0.y, fx = h2[0] ? Math.max(0.02, (e.x - ux) / ((ex - ux) || 1)) : 1, fy = h2[1] ? Math.max(0.02, (e.y - uy) / ((ey - uy) || 1)) : 1;
				var uni = (h2[0] && h2[1]) ? !e.shift : e.shift;
				if (uni && h2[0] && h2[1]) fx = fy = Math.max(fx, fy); else if (uni) { if (h2[0]) fy = fx; else fx = fy; }
				PE.guides = [];
				if (snapOn(e)) {
					var vb = mv.vb0, edgesAt2 = function (f, ax) { var o0 = ax === "x" ? [vb.x, vb.x + vb.w] : [vb.y, vb.y + vb.h], a0 = ax === "x" ? ux : uy, side = ax === "x" ? h2[0] : h2[1], out = o0.map(function (v) { return P.scaleAbout(v, a0, f); }); return e.alt ? out : side < 0 ? [out[0], NaN] : [NaN, out[1]]; };
					var bs2 = snapSizes(e, mv, h2[0] ? fx : null, h2[1] ? fy : null, edgesAt2, uni);
					if (bs2.x || bs2.y) { if (uni) { var g2 = bs2.x ? bs2.x.p : bs2.y.p; if (h2[0] && h2[1]) fx = fy = g2; else fx = fy = g2; } else { if (bs2.x) fx = bs2.x.p; if (bs2.y) fy = bs2.y.p; } guidesFrom(bs2.x ? [bs2.x.t] : [], bs2.y ? [bs2.y.t] : []); }
				}
				mv.items.forEach(function (it) {
					var k = it[0]; k.cx = P.scaleAbout(it[1], ux, fx); k.cy = P.scaleAbout(it[2], uy, fy);
					var q = ((it[5] % Math.PI) + Math.PI) % Math.PI, sxF, syF;
					if (Math.abs(fx - fy) < 1e-9 || q < 1e-6 || Math.PI - q < 1e-6) { sxF = fx; syF = fy; } else if (Math.abs(q - Math.PI / 2) < 1e-6) { sxF = fy; syF = fx; } else { sxF = syF = Math.sqrt(fx * fy); }   // a layer at an odd angle cannot be stretched without skewing: it scales evenly
					k.sx = it[3] * sxF; k.sy = it[4] * syF;
				});
				mv.moved = true; PE.invalidate();
			}
		},
		up: function (e) {
			var m = mv; mv = null; PE.guides = [];
			if (m && m.kind === "band") { bandSelect(m, e); PE.invalidateOverlay(); return; }
			if (m && m.moved) {
				var n = m.set ? m.set.length : 1, grp = m.set && n === 1 && PE.isGroup(m.set[0]);
				PE.commit(m.kind === "tbox" ? "Text box" : m.kind === "move" ? (n > 1 ? "Move " + n + " layers" : grp ? "Move group" : "Move layer") : m.kind === "rot" ? "Rotate layer" : m.kind === "mscale" ? "Resize " + n + " layers" : "Resize layer");
			}
			PE.invalidateOverlay();
		},
		abort: function () {
			var m = mv; mv = null; PE.guides = []; if (!m) return;
			if (m.kind === "move") m.items.forEach(function (g) { g[0].cx = g[1]; g[0].cy = g[2]; });
			else if (m.kind === "mscale") m.items.forEach(function (it) { var k = it[0]; k.cx = it[1]; k.cy = it[2]; k.sx = it[3]; k.sy = it[4]; });
			else if (m.kind === "tbox") PE.textBoxAbort(m.tb);
			else if (m.kind === "scale") { m.L.cx = m.cx0; m.L.cy = m.cy0; m.L.sx = m.sx0; m.L.sy = m.sy0; } else if (m.kind === "rot") m.L.rot = m.rot0;
			PE.invalidate();
		},
		cancel: function () { if (mv && mv.kind !== "band") this.abort(); mv = null; hoverTM = null; },
		hover: function (e) {   // a text layer under the pointer shows its box; the cursor tells when a box edge can be dragged
			if (!PE.doc) return; var A = PE.active(), h = null; if (PE.opt.move.handles && PE.moveSet().length === 1 && A && A.type === "text" && A.text) h = PE.textBoxHit(A, e);
			PE.els.over.style.cursor = h ? PE.textBoxCursor(h, A) : "default"; var ht = PE.textAt ? PE.textAt(e) : null; if (ht === A) ht = null; if (ht !== hoverTM) { hoverTM = ht; PE.invalidateOverlay(); }
		},
		overlay: function (x, v) {
			if (hoverTM && PE.doc.layers.indexOf(hoverTM) >= 0 && PE.drawTextFrame) PE.drawTextFrame(x, hoverTM, false);
			if (mv && mv.kind === "band") { var a = PE.toScreen(mv.a.x, mv.a.y), b = PE.toScreen(mv.b.x, mv.b.y), r = P.rectFrom(a.x, a.y, b.x, b.y); x.fillStyle = "rgba(26,115,232,0.12)"; x.fillRect(r.x, r.y, r.w, r.h); x.lineWidth = 1; [["#000", 0], ["#fff", 4]].forEach(function (p) { x.setLineDash([4, 4]); x.lineDashOffset = p[1]; x.strokeStyle = p[0]; x.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h); }); x.setLineDash([]); x.lineDashOffset = 0; }
			var set = PE.moveSet(), o = PE.opt.move; if (!set.length) return;
			if (set.length > 1) {
				x.strokeStyle = "rgba(26,115,232,0.75)"; x.lineWidth = 1;
				set.forEach(function (L) { var pts = PE.corners(L).map(function (p) { return PE.toScreen(p[0], p[1]); }); x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke(); });
				var bb = setBox(set); if (!bb) return; var s0 = PE.toScreen(bb.x, bb.y), s1 = PE.toScreen(bb.x + bb.w, bb.y + bb.h); x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.setLineDash([6, 4]); x.strokeRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y); x.setLineDash([]);
				if (o.handles) for (var k = 0; k < 8; k++) { var hs = boxHandle(bb, HANDLES[k]); PE.handleBox(x, hs.x, hs.y, 4.5); }
				x.font = "11px system-ui,sans-serif"; var lbl = set.length + " layers"; x.fillStyle = "rgba(26,115,232,0.9)"; x.fillRect(s0.x, s0.y - 18, x.measureText(lbl).width + 10, 16); x.fillStyle = "#fff"; x.fillText(lbl, s0.x + 5, s0.y - 6);
				return;
			}
			var L = set[0]; if (!o.handles || !L.visible) return;
			if (PE.isGroup(L)) { var gb = PE.groupBounds(L), g0 = PE.toScreen(gb.x, gb.y), g1 = PE.toScreen(gb.x + gb.w, gb.y + gb.h); x.setLineDash([6, 4]); x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.strokeRect(g0.x, g0.y, g1.x - g0.x, g1.y - g0.y); x.setLineDash([]); return; }
			var pts = PE.corners(L).map(function (p) { return PE.toScreen(p[0], p[1]); }); x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke();
			if (L.type === "text" && L.text && PE.drawTextBoxHandles) {   // corners = scale (not with Auto-fit text: there the box corners resize the box), purple = the text box
				if (!L.text.fit) for (var j = 0; j < 8; j += 2) { var sj = handleScreen(L, HANDLES[j]); PE.handleBox(x, sj.x, sj.y, 4.5); }
				PE.drawTextFrame(x, L, true); PE.drawTextBoxHandles(x, L); return;
			}
			for (var i = 0; i < 8; i++) { var s = handleScreen(L, HANDLES[i]); PE.handleBox(x, s.x, s.y, 4.5); }
		} });
	/* rubber band: every visible, unlocked layer whose visible box the band touches (not the full-canvas background picture); "Pick the whole group" picks groups */
	function bandSelect(m, e) {
		var a = PE.toScreen(m.a.x, m.a.y), b = PE.toScreen(e.x, e.y), o = PE.opt.move, cur = m.add ? PE.moveSet() : [];
		if (Math.hypot(a.x - b.x, a.y - b.y) < 4) { if (!m.add && PE.setMulti) { PE.setMulti([]); } return; }   // a plain click on empty canvas: back to one layer
		var r = P.rectFrom(m.a.x, m.a.y, e.x, e.y), picked = cur.slice();
		PE.doc.layers.forEach(function (L) {
			if (PE.isGroup(L) || !PE.effVisible(L) || L.locked || PE.isBackdrop(L)) return; var vb = PE.visBox(L); if (!P.boxesTouch(vb, r)) return;
			var tgt = o.groups ? PE.topGroupOf(L) : L; if (tgt.locked) return; if (picked.indexOf(tgt) < 0) picked.push(tgt);
		});
		picked = picked.filter(function (L) { return !PE.ancestorsOf(L).some(function (g) { return picked.indexOf(g) >= 0; }); });
		if (!picked.length) { if (!m.add && PE.setMulti) PE.setMulti([]); PE.toast("No layer in that box"); return; }
		var top = picked.slice().sort(function (p, q) { return PE.indexOf(p) - PE.indexOf(q); }).pop();
		if (picked.length === 1) { PE.setMulti([]); PE.setActive(picked[0].id); } else { PE.setActive(top.id); PE.setMulti(picked.map(function (L) { return L.id; })); PE.toast(picked.length + " layers selected: drag one to move them all"); }
	}
	PE.isBackdrop = function (L) { var d = PE.doc, b = PE.bounds(L); return PE.indexOf(L) === 0 && PE.isIdentity(L) && b.x <= 1 && b.y <= 1 && b.x + b.w >= d.w - 1 && b.y + b.h >= d.h - 1; };
	PE.layerAtPoint = function (L, x, y) { if (PE.isGroup(L)) { var gb = PE.groupBounds(L); return x >= gb.x && y >= gb.y && x <= gb.x + gb.w && y <= gb.y + gb.h; } var p = PE.toLayerPt(L, x, y); return p.x >= 0 && p.y >= 0 && p.x < L.canvas.width && p.y < L.canvas.height; };
	/* arrow keys: the whole selection moves (Shift = 10 px); the keys pressed within 0.35 s make one undo step */
	PE.nudge = function (dx, dy) {
		var set = PE.moveSet().filter(function (L) { return !L.locked; }); if (!set.length) { if (PE.active() && PE.active().locked) PE.toast("This layer is locked"); return; }
		set.forEach(function (L) { PE.translate(L, dx, dy); }); PE.invalidate(); var n = set.length;
		clearTimeout(PE._nt); PE._nt = setTimeout(function () { PE.commit(n > 1 ? "Move " + n + " layers" : "Move layer"); }, 350);
	};

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
		overlay: function (x) { if (!selDrag || selDrag.move) return; var r = rectOf(selDrag.a, selDrag.b, null, selDrag.sq), s0 = PE.toScreen(r.x, r.y), z = PE.view.zoom; x.lineWidth = 1; [["#000", 0], ["#fff", 5]].forEach(function (p) { x.setLineDash([5, 5]); x.lineDashOffset = p[1]; x.strokeStyle = p[0]; if (PE.opt.marquee.shape === "ellipse") { x.beginPath(); x.ellipse(s0.x + r.w * z / 2, s0.y + r.h * z / 2, r.w * z / 2, r.h * z / 2, 0, 0, 6.2832); x.stroke(); } else x.strokeRect(s0.x, s0.y, r.w * z, r.h * z); }); x.setLineDash([]); x.lineDashOffset = 0; },
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
		overlay: function (x) { if (!lasso) return; x.lineWidth = 1; [["#000", 0], ["#fff", 5]].forEach(function (p) { x.strokeStyle = p[0]; x.setLineDash([5, 5]); x.lineDashOffset = p[1]; x.beginPath(); lasso.pts.forEach(function (q, i) { var s = PE.toScreen(q.x, q.y); i ? x.lineTo(s.x, s.y) : x.moveTo(s.x, s.y); }); if (lasso.poly && lasso.cur) { var c = PE.toScreen(lasso.cur.x, lasso.cur.y); x.lineTo(c.x, c.y); } x.stroke(); }); x.setLineDash([]); x.lineDashOffset = 0; } });
	PE.defTool({ id: "wand", name: "Magic Wand (select by colour)", key: "w", icon: "✨", opts: { tol: 32, contiguous: true, merged: false, mode: "new", smooth: true, auto: true },
		ui: [{ k: "tol", label: "Tolerance", type: "range", min: 0, max: 255, step: 1 }, { k: "contiguous", label: "Contiguous", type: "check" }, { k: "merged", label: "All layers", type: "check" }, { k: "smooth", label: "Smooth edges", type: "check" }, { k: "auto", label: "Pick the layer under the click", type: "check", help: "On: clicking a letter or shape picks the layer that is actually showing there, so the selection (and a following Delete) acts on that layer and not on the picture behind it. Off: always use the selected layer." }, { k: "mode", label: "Mode", type: "seg", options: [["new", "New"], ["add", "Add"], ["sub", "Subtract"], ["int", "Intersect"]] }],
		hint: "Click a colour to select it. Raise Tolerance to include similar colours. Great for removing a plain background.",
		down: function (e) {
			var o = PE.opt.wand, d = PE.doc, L = PE.active(), mask, w, h;
			if (o.auto && !o.merged && L) {   // the layer that is really visible under the click (a letter on its own layer, a pasted picture ...)
				for (var li = d.layers.length - 1; li >= 0; li--) {
					var C = d.layers[li]; if (PE.isGroup(C) || !PE.effVisible(C)) continue; var q = PE.toLayerPt(C, e.x, e.y), cw = C.canvas.width, ch = C.canvas.height;
					if (q.x < 0 || q.y < 0 || q.x >= cw || q.y >= ch) continue; if (C.canvas.getContext("2d").getImageData(Math.floor(q.x), Math.floor(q.y), 1, 1).data[3] < 24) continue;
					if (C !== L && !C.locked) { PE.setActive(C.id); L = C; PE.toast("Picked layer \u201c" + C.name + "\u201d"); } break;
				}
			}
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
		var L = PE.active(); var mask = L && L.editMask && L.mask; if (!PE.prepare(L, false, true)) return false;
		var pre = (function () { var q = PE.origin(L); return { x: q.x, y: q.y, w: L.canvas.width, h: L.canvas.height }; })();   // the layer as it was: after the stroke it only grows as far as the paint reached
		PE.growLayer(L, { x: 0, y: 0, w: PE.doc.w, h: PE.doc.h });
		var o = PE.opt[kind === "eraser" ? "eraser" : kind === "clone" ? "clone" : kind === "retouch" ? "retouch" : "brush"], cv = mask ? L.mask : L.canvas, og = PE.origin(L), erase = kind === "eraser";
		if (mask && kind === "brush") erase = P.lightness(PE.fg) < 0.5;   // on a layer mask the Brush follows the colour: dark hides, light shows (like other editors)
		var hex = mask ? "#000000" : (erase ? "#000000" : PE.fg);
		stroke = { kind: kind, L: L, o: o, og: og, target: mask ? "mask" : "pixel", buf: mk(cv.width, cv.height), erase: erase, alpha: (o.opacity == null ? 100 : o.opacity) / 100, col: { solid: rgba(hex, 1), clear: rgba(hex, 0) }, last: null, rem: 0, sm: { x: e.x, y: e.y }, n: 0, pre: pre, bb: null };
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
		if (stroke) { var rr0 = Math.max(0.5, size / 2) + 2, q = stroke.bb; stroke.bb = q ? { x0: Math.min(q.x0, px - rr0), y0: Math.min(q.y0, py - rr0), x1: Math.max(q.x1, px + rr0), y1: Math.max(q.y1, py + rr0) } : { x0: px - rr0, y0: py - rr0, x1: px + rr0, y1: py + rr0 }; }
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
		x.save(); x.globalAlpha = s.alpha; x.globalCompositeOperation = s.erase ? "destination-out" : "source-over"; x.drawImage(s.buf, 0, 0); x.restore(); L.live = null; L.rev++;
		if (s.target === "pixel" && s.pre && s.bb && !L.mask) { var b = s.bb, p0 = s.pre; PE.cropLayerTo(L, { x: Math.min(p0.x, b.x0), y: Math.min(p0.y, b.y0), w: Math.max(p0.x + p0.w, b.x1) - Math.min(p0.x, b.x0), h: Math.max(p0.y + p0.h, b.y1) - Math.min(p0.y, b.y0) }); }
		PE.commit(label);
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

	/* ---------- smudge: picks up the colours under the pointer and drags them along ---------- */
	(function () {
		var sm = null;
		function region(L, x, y, D) { var c = PE.tmp("smr", D, D), g = c.getContext("2d"); g.clearRect(0, 0, D, D); g.drawImage(L.canvas, Math.round(x), Math.round(y), D, D, 0, 0, D, D); return c; }
		function smudgeDab(px, py) {
			var L = sm.L, o = sm.o, r = Math.max(1, o.size / 2), D = Math.ceil(r * 2) + 2, c = D / 2, lx = px - sm.og.x, ly = py - sm.og.y, rx = lx - c, ry = ly - c;
			var rr = r + 2, q = sm.bb; sm.bb = q ? { x0: Math.min(q.x0, px - rr), y0: Math.min(q.y0, py - rr), x1: Math.max(q.x1, px + rr), y1: Math.max(q.y1, py + rr) } : { x0: px - rr, y0: py - rr, x1: px + rr, y1: py + rr };
			var under = PE.mk(D, D); under.getContext("2d").drawImage(region(L, rx, ry, D), 0, 0);
			if (!sm.carry) { sm.carry = PE.mk(D, D); sm.carry.getContext("2d").drawImage(under, 0, 0); return; }
			var s = Math.max(0.05, o.strength / 100), t = PE.tmp("smt", D, D), tx = t.getContext("2d");
			tx.globalCompositeOperation = "source-over"; tx.clearRect(0, 0, D, D); tx.drawImage(sm.carry, 0, 0); tx.globalCompositeOperation = "destination-in"; softDab(tx, r, Math.min(o.hardness / 100, 0.9), { solid: "#000", clear: "rgba(0,0,0,0)" }, c, c); tx.globalCompositeOperation = "source-over";
			if (PE.sel) PE.restrictToSel(tx, Math.round(px - c), Math.round(py - c), D, D);
			var lg = L.canvas.getContext("2d"); lg.save(); lg.globalAlpha = Math.min(1, s * 0.9 + 0.1); lg.drawImage(t, Math.round(rx), Math.round(ry)); lg.restore();
			var cg = sm.carry.getContext("2d"); cg.save(); cg.globalAlpha = 1 - Math.min(0.95, s * 0.8); cg.drawImage(under, 0, 0); cg.restore();
			L.rev++;
		}
		function moveTo(e, first) {
			var o = sm.o; if (first || !sm.last) { smudgeDab(e.x, e.y); sm.last = { x: e.x, y: e.y }; return; }
			var dx = e.x - sm.last.x, dy = e.y - sm.last.y, len = Math.hypot(dx, dy), sp = Math.max(1, o.size * 0.12), pos = sp - sm.rem;
			while (pos <= len) { smudgeDab(sm.last.x + dx * pos / len, sm.last.y + dy * pos / len); pos += sp; }
			sm.rem = len - (pos - sp); sm.last = { x: e.x, y: e.y }; PE.invalidate();
		}
		function end() {
			if (!sm) return; var s = sm, L = s.L; sm = null;
			if (s.pre && s.bb && !L.mask) { var b = s.bb, p0 = s.pre; PE.cropLayerTo(L, { x: Math.min(p0.x, b.x0), y: Math.min(p0.y, b.y0), w: Math.max(p0.x + p0.w, b.x1) - Math.min(p0.x, b.x0), h: Math.max(p0.y + p0.h, b.y1) - Math.min(p0.y, b.y0) }); }
			L.rev++; PE.commit("Smudge");
		}
		PE.defTool({ id: "smudge", name: "Smudge", key: "n", icon: "👆", opts: { size: 40, hardness: 50, strength: 60 },
			ui: [BRUSHUI[0], BRUSHUI[1], { k: "strength", label: "Strength", type: "range", min: 5, max: 100, step: 1, unit: "%" }],
			hint: "Drag across the picture to smear the colours along, like dragging a finger through wet paint.",
			cursorSize: function () { return PE.opt.smudge.size; },
			down: function (e) {
				var L = PE.active(); if (!L || L.type === "group") return; if (L.editMask && L.mask) { PE.toast("Smudge works on the picture, not on the layer mask"); return; }
				if (!PE.prepare(L, false, true)) return;
				var pre = (function () { var q = PE.origin(L); return { x: q.x, y: q.y, w: L.canvas.width, h: L.canvas.height }; })();
				PE.growLayer(L, { x: 0, y: 0, w: PE.doc.w, h: PE.doc.h });
				sm = { L: L, o: PE.opt.smudge, og: PE.origin(L), pre: pre, bb: null, carry: null, last: null, rem: 0 };
				moveTo(e, true);
			},
			move: function (e) { if (sm) moveTo(e, false); },
			up: function () { end(); }, abort: function () { end(); }, cancel: function () { end(); } });
	})();

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

	/* ---------- eyedropper: press and drag over the picture with a magnifier; the colour is used on release (or, with "Confirm with a button",
	 * from a floating Use / Cancel bar, so the sample point can be dragged around first). PE.pickColorFromImage(req) borrows the tool for one pick
	 * (the 💉 buttons next to the colour wells and the option bar's colour boxes) and goes back to the tool you had. ---------- */
	var pk = null, pickReq = null, pickBar = null, LOUPE_N = 11, LOUPE_Z = 9;
	function sampleHex(x, y) { var o = PE.opt.eyedropper, c = PE.sample(x, y, o.size, o.merged); return c ? { hex: P.rgbToHex(c.r, c.g, c.b), a: c.a } : null; }
	function loupePixels(x, y) {   // the 11 x 11 pixels around the point, drawn like the picture (all layers, or the current layer)
		var n = LOUPE_N, h = Math.floor(n / 2), c = PE.tmp("loupe", n, n), cx = c.getContext("2d"), o = PE.opt.eyedropper, L = PE.active(), base = [1, 0, 0, 1, -Math.floor(x) + h, -Math.floor(y) + h];
		cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, n, n);
		if (o.merged || !L) { PE.relink(); PE.doc.layers.forEach(function (l) { PE.drawLayer(cx, l, base, "lpx", n, n); }); } else PE.drawLayer(cx, L, base, "lpx", n, n);
		return c;
	}
	function drawLoupe(x, v, docPt, scrPt, info, note) {
		var n = LOUPE_N, z = LOUPE_Z, S = n * z, pad = 6, W = S + pad * 2, H = S + pad * 2 + 40, off = 26, bx = scrPt.x + off, by = scrPt.y + off;
		if (bx + W > v.w - 4) bx = scrPt.x - off - W; if (by + H > v.h - 4) by = scrPt.y - off - H; bx = Math.max(4, bx); by = Math.max(4, by);
		x.save(); x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = 10; x.fillStyle = "#1d1d24"; x.beginPath(); if (x.roundRect) x.roundRect(bx, by, W, H, 8); else x.rect(bx, by, W, H); x.fill(); x.restore();
		var gx = bx + pad, gy = by + pad; x.fillStyle = "#6a6a76"; x.fillRect(gx, gy, S, S); x.fillStyle = "#9a9aa6"; for (var i = 0; i < n * 2; i++) for (var j = 0; j < n * 2; j++) if ((i + j) % 2 === 0) x.fillRect(gx + i * z / 2, gy + j * z / 2, z / 2, z / 2);
		x.imageSmoothingEnabled = false; x.drawImage(loupePixels(docPt.x, docPt.y), gx, gy, S, S); x.imageSmoothingEnabled = true;
		x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 1; x.beginPath(); for (var k = 1; k < n; k++) { x.moveTo(gx + k * z + 0.5, gy); x.lineTo(gx + k * z + 0.5, gy + S); x.moveTo(gx, gy + k * z + 0.5); x.lineTo(gx + S, gy + k * z + 0.5); } x.stroke();
		var sz = Math.min(n, PE.opt.eyedropper.size), h = Math.floor(n / 2), q = Math.floor(sz / 2), rx = gx + (h - q) * z, ry = gy + (h - q) * z;
		x.lineWidth = 2; x.strokeStyle = "#000"; x.strokeRect(rx - 1, ry - 1, sz * z + 2, sz * z + 2); x.lineWidth = 1; x.strokeStyle = "#fff"; x.strokeRect(rx - 0.5, ry - 0.5, sz * z + 1, sz * z + 1);
		var ty = gy + S + 8; x.fillStyle = info ? info.hex : "#000"; x.fillRect(gx, ty, 26, 26); x.strokeStyle = "#fff"; x.strokeRect(gx + 0.5, ty + 0.5, 25, 25);
		x.fillStyle = "#f2f2f5"; x.font = "bold 13px ui-monospace,Menlo,Consolas,monospace"; x.textBaseline = "middle"; x.fillText(info ? info.hex.toUpperCase() + (info.a < 0.99 ? " " + Math.round(info.a * 100) + "%" : "") : "transparent", gx + 34, ty + 8);
		x.font = "11px system-ui,sans-serif"; x.fillStyle = "#b9b9c6"; x.fillText(note, gx + 34, ty + 21); x.textBaseline = "alphabetic";
	}
	function marker(x, p) { var s = PE.toScreen(p.x, p.y); x.lineWidth = 3; x.strokeStyle = "#000"; x.beginPath(); x.arc(s.x, s.y, 7, 0, 6.2832); x.stroke(); x.lineWidth = 1.5; x.strokeStyle = "#fff"; x.stroke(); x.beginPath(); x.moveTo(s.x - 11, s.y); x.lineTo(s.x - 4, s.y); x.moveTo(s.x + 4, s.y); x.lineTo(s.x + 11, s.y); x.moveTo(s.x, s.y - 11); x.lineTo(s.x, s.y - 4); x.moveTo(s.x, s.y + 4); x.lineTo(s.x, s.y + 11); x.stroke(); }
	function hideBar() { if (pickBar) { pickBar.remove(); pickBar = null; } }
	function placeBar() {
		if (!pickBar || !pk) return; var s = PE.toScreen(pk.x, pk.y), v = PE.view, w = pickBar.offsetWidth || 260, h = pickBar.offsetHeight || 40, l = Math.max(6, Math.min(v.w - w - 6, s.x - w / 2)), t = s.y + 18; if (t + h > v.h - 6) t = s.y - 18 - h;
		pickBar.style.left = l + "px"; pickBar.style.top = Math.max(6, t) + "px";
	}
	function showBar() {
		hideBar(); if (!pk || !pk.info) return; var b = PE.el("div", "pe-pickbar"); b.setAttribute("role", "group"); b.setAttribute("aria-label", "Use the picked colour?");
		b.innerHTML = '<span class="pe-pickbar-sw" style="background:' + pk.info.hex + '"></span><code>' + pk.info.hex.toUpperCase() + '</code><button type="button" class="pe-btn pe-btn--sm pe-btn--primary" data-a="use">Use this colour</button><button type="button" class="pe-btn pe-btn--sm" data-a="no">Cancel</button>';
		b.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
		b.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("[data-a]"); if (!a) return; if (a.dataset.a === "use") applyPick(); else PE.tools.eyedropper.cancel(); });
		PE.els.stage.appendChild(b); pickBar = b; placeBar(); var u = b.querySelector("[data-a=use]"); if (u) u.focus({ preventScroll: true });
	}
	PE.on("view", placeBar);
	function applyPick() {
		var p = pk, r = pickReq; pk = null; hideBar(); PE.invalidateOverlay(); if (!p || !p.info) return;
		if (r) { pickReq = null; r.apply(p.info.hex, p.alt); if (r.prev && PE.toolId === "eyedropper") PE.setTool(r.prev); PE.toast("Picked " + p.info.hex.toUpperCase() + (r.label ? " for the " + r.label : "")); }
		else if (p.alt) PE.setBg(p.info.hex); else PE.setFg(p.info.hex);
	}
	PE.pickColorFromImage = function (req) {
		if (!PE.doc) return; var prev = PE.toolId === "eyedropper" ? (pickReq && pickReq.prev) || null : PE.toolId;
		PE.setTool("eyedropper"); pickReq = Object.assign({}, req, { prev: prev }); PE.toast("Press and drag over the picture, let go to use the colour" + (req.label ? " (" + req.label + ")" : "") + ". Esc cancels.");
		PE.els.over.focus({ preventScroll: true });
	};
	PE.defTool({ id: "eyedropper", name: "Eyedropper (pick colour)", key: "i", icon: "💉", opts: { size: 1, merged: true, confirm: false },
		ui: [{ k: "size", label: "Sample", type: "select", options: [[1, "1 pixel"], [3, "3 × 3 average"], [5, "5 × 5 average"], [11, "11 × 11 average"]], num: true }, { k: "merged", label: "All layers", type: "check", help: "On: the colour you see (all layers together). Off: only the selected layer's own pixels." }, { k: "confirm", label: "Confirm with a button", type: "check", help: "Off: the colour is used as soon as you let go. On: letting go leaves a Use this colour / Cancel bar, and you can drag again to move the sample point before you choose." }],
		hint: "Press and drag over the picture: the magnifier shows the pixels and the colour, let go to use it (Alt = background colour). Esc cancels.",
		down: function (e) { hideBar(); pk = { x: e.x, y: e.y, alt: e.alt || (pk && pk.alt), live: true, info: sampleHex(e.x, e.y) }; PE.invalidateOverlay(); },
		move: function (e) { if (!pk || !pk.live) return; pk.x = e.x; pk.y = e.y; pk.info = sampleHex(e.x, e.y); PE.invalidateOverlay(); },
		hover: function () { if (!pk) PE.invalidateOverlay(); },
		up: function () { if (!pk) return; pk.live = false; if (!pk.info) { PE.toast("Nothing there to pick (transparent)"); pk = null; PE.invalidateOverlay(); return; } if (PE.opt.eyedropper.confirm) { showBar(); PE.invalidateOverlay(); } else applyPick(); },
		enter: function () { if (pk && !pk.live) applyPick(); },
		cancel: function () { var r = pickReq; pk = null; pickReq = null; hideBar(); PE.invalidateOverlay(); if (r && r.prev) setTimeout(function () { if (PE.toolId === "eyedropper") PE.setTool(r.prev); }, 0); },
		overlay: function (x, v) {
			if (pk) { marker(x, pk); if (pk.live) drawLoupe(x, v, pk, PE.toScreen(pk.x, pk.y), pk.info, PE.opt.eyedropper.confirm ? "let go, then Use" : "let go to use"); return; }
			if (PE.ptr.inside && !PE.spaceHeld) { var d = { x: (PE.ptr.x - v.px) / v.zoom, y: (PE.ptr.y - v.py) / v.zoom }; drawLoupe(x, v, d, PE.ptr, sampleHex(d.x, d.y), pickReq ? "press to pick" + (pickReq.label ? ": " + pickReq.label : "") : "press and drag"); }
		} });
	/* ---------- hand, zoom ---------- */
	PE.defTool({ id: "hand", name: "Hand (pan)", key: "h", icon: "✋", opts: {}, ui: [], hint: "Drag to pan. You can also hold Space with any tool, or use the middle mouse button." });
	PE.defTool({ id: "zoom", name: "Zoom", key: "z", icon: "🔍", opts: {}, ui: [{ type: "button", label: "Fit (Ctrl+0)", act: function () { PE.fit(); } }, { type: "button", label: "100% (Ctrl+1)", act: function () { PE.setZoom(1); } }], hint: "Click to zoom in, Alt-click to zoom out. Ctrl + wheel also zooms.",
		down: function (e) { var r = PE.els.over.getBoundingClientRect(); PE.setZoom(PE.view.zoom * (e.alt ? 0.5 : 2), e.sx - r.left, e.sy - r.top); } });
	PE.stepBrushSize = function (dir) { var o = PE.opt[PE.toolId]; if (o && o.size != null) { var s = o.size, ns = dir > 0 ? Math.round(s * 1.15 + 1) : Math.max(1, Math.round(s / 1.15 - 1)); o.size = Math.min(500, Math.max(1, ns)); saveOpt(PE.toolId); PE.invalidateOverlay(); } };
})();

/* MES Photo Editor tools, part 2: text (with label backgrounds), shapes + annotations (arrows, callouts, step badges, highlights, redact), option plumbing. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk, rgba = PE.rgba;
	PE.optGet = function (id, k) { var t = PE.tools[id]; if (t.optGet) { var ov = t.optGet(k); if (ov !== undefined) return ov; } if (t.optsTarget) { var tg = t.optsTarget(); if (tg) return tg[k]; } return PE.opt[id][k]; };
	PE.optSet = function (id, k, v) { var t = PE.tools[id]; PE.opt[id][k] = v; if (t.optsTarget) { var tg = t.optsTarget(); if (tg && tg !== PE.opt[id]) { tg[k] = v; if (t.onopt) t.onopt(k, v); } } PE.emit("opts", id); PE.invalidateOverlay(); };

	/* ---------- fonts ---------- */
	PE.FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["system-ui, -apple-system, 'Segoe UI', sans-serif", "System UI"], ["Verdana, Geneva, sans-serif", "Verdana"], ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Tahoma, sans-serif", "Tahoma"], ["Impact, 'Arial Black', sans-serif", "Impact"], ["Georgia, serif", "Georgia"], ["'Times New Roman', Times, serif", "Times New Roman"], ["'Palatino Linotype', Palatino, serif", "Palatino"], ["'Courier New', Courier, monospace", "Courier New"], ["ui-monospace, Menlo, Consolas, monospace", "Monospace"], ["'Comic Sans MS', 'Comic Neue', cursive", "Comic Sans"], ["'Brush Script MT', cursive", "Brush Script"]];
	PE.loadFontFile = function (file) {
		var name = file.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]/g, "");
		return file.arrayBuffer().then(function (ab) { var ff = new FontFace(name, ab); return ff.load().then(function () { document.fonts.add(ff); PE.FONTS.push(["'" + name + "', sans-serif", name + " (yours)"]); PE.emit("fonts"); PE.optSet("text", "font", "'" + name + "', sans-serif"); }); });
	};

	/* ---------- text: edited in place on the canvas, like GIMP ----------
	 * The rendered layer IS what you see while typing: a hidden <textarea> only collects the keys (typing, IME, clipboard, undo inside the box), and the caret,
	 * the selection and the frame are drawn on the overlay from PE.textLayout(L), so they always sit exactly on the letters (also on a rotated or scaled layer).
	 * One edit session = one undo step ("Add text" / "Edit text"), whatever was typed or restyled in between. */
	var te = null, hoverT = null, blinkOn = true, blinkT = 0, tdrag = null, lastDbl = { t: 0, x: 0, y: 0 };
	function editor() { return PE.els.textedit; }
	function locToDoc(L, u, v) { var c = Math.cos(L.rot), s = Math.sin(L.rot), lx = (u - L.canvas.width / 2) * L.sx, ly = (v - L.canvas.height / 2) * L.sy; return { x: L.cx + c * lx - s * ly, y: L.cy + s * lx + c * ly }; }
	function frameOf(L) { var lay = PE.textLayout(L), p = lay.pad, g = Math.max(2, lay.size * 0.06); return { u0: p - g, v0: p - g, u1: p + lay.mw + g, v1: p + lay.bh + g }; }
	function placeEditor() {   // the (invisible) key catcher sits over the text so an IME pop-up opens next to it
		if (!te) return; var L = te.L, ta = editor(), t = L.text, v = PE.view, c = Math.cos(L.rot), s = Math.sin(L.rot), lay = PE.textLayout(L), pad = lay.pad;
		var dp = locToDoc(L, pad, pad), sp = PE.toScreen(dp.x, dp.y), z = v.zoom;
		ta.style.cssText = "display:block;left:0;top:0;transform-origin:0 0;transform:matrix(" + (c * L.sx * z) + "," + (s * L.sx * z) + "," + (-s * L.sy * z) + "," + (c * L.sy * z) + "," + sp.x + "," + sp.y + ");font:" + (t.italic ? "italic " : "") + (t.bold ? "bold " : "") + t.size + "px/" + (t.size * t.lh) + "px " + t.font + ";text-align:" + t.align + ";white-space:pre-wrap;overflow:hidden;width:" + Math.max(20, lay.mw + 4) + "px;height:" + (lay.lhp * lay.lines.length + t.size * 0.2) + "px;letter-spacing:" + (t.ls || 0) + "px;";
	}
	PE.placeTextEditor = placeEditor;
	function poke() { blinkOn = true; PE.invalidateOverlay(); }
	function hitText(e, prefer) {   // the text layer under a point: its whole text box counts (clicking between letters edits, it does not start a new text)
		if (prefer && PE.effVisible(prefer) && PE.layerAtPoint(prefer, e.x, e.y)) return prefer;
		var ls = PE.doc.layers; for (var i = ls.length - 1; i >= 0; i--) { var L = ls[i]; if (L.type !== "text" || !L.text || !PE.effVisible(L) || L.locked) continue; if (PE.layerAtPoint(L, e.x, e.y)) return L; }
		return null;
	}
	function indexAt(L, x, y) {
		var lay = PE.textLayout(L), p = PE.toLayerPt(L, x, y), n = lay.lines.length, i = Math.max(0, Math.min(n - 1, Math.floor((p.y - lay.pad) / lay.lhp)));
		return P.hitInLine(lay.lines[i], p.x - lay.lx[i], lay.measure);
	}
	function focusIdx(ta) { return ta.selectionDirection === "backward" ? ta.selectionStart : ta.selectionEnd; }
	function anchorIdx(ta) { return ta.selectionDirection === "backward" ? ta.selectionEnd : ta.selectionStart; }
	function setSel(a, b) { var ta = editor(); if (b >= a) ta.setSelectionRange(a, b, "forward"); else ta.setSelectionRange(b, a, "backward"); poke(); }
	function openEdit(L, isNew, caret) {
		if (te && te.L === L) { if (caret != null) { var ta0 = editor(); if (caret === "all") ta0.select(); else ta0.setSelectionRange(caret, caret); } poke(); return; }
		if (te) PE.endTextEdit(false);
		te = { L: L, isNew: isNew, orig: JSON.stringify(L.text) }; var ta = editor(); ta.value = L.text.str; placeEditor(); PE.emit("opts", "text");
		var put = function () { if (!te || te.L !== L) return; if (document.activeElement !== ta) ta.focus({ preventScroll: true }); if (caret === "all") ta.select(); else { var k = caret == null ? ta.value.length : caret; ta.setSelectionRange(k, k); } poke(); };
		put(); setTimeout(function () { if (te && te.L === L && document.activeElement !== ta) put(); }, 60);
		clearInterval(blinkT); blinkT = setInterval(function () { if (!te) { clearInterval(blinkT); return; } blinkOn = !blinkOn; PE.invalidateOverlay(); }, 530);
	}
	function dropLayer(L) { PE.doc.layers.splice(PE.doc.layers.indexOf(L), 1); if (!PE.doc.layers.length) PE.doc.layers.push(PE.makeLayer({ name: "Layer 1" })); PE.doc.activeId = PE.doc.layers[PE.doc.layers.length - 1].id; PE.emit("layers"); PE.invalidate(); }
	PE.endTextEdit = function (cancel) {
		if (!te) return; var e = te; te = null; tdrag = null; clearInterval(blinkT); var ta = editor(); ta.style.display = "none"; if (document.activeElement === ta) ta.blur(); var L = e.L;
		if (PE.doc.layers.indexOf(L) < 0) { PE.invalidateOverlay(); return; }   // gone meanwhile (undo, delete)
		if (e.isNew && (cancel || !L.text.str.trim())) { dropLayer(L); return; }
		var nm = L.text.str.split("\n")[0].slice(0, 24) || "Text";
		if (e.isNew) { L.name = nm; PE.commit("Add text"); } else if (JSON.stringify(L.text) !== e.orig) { if (L.text.str !== JSON.parse(e.orig).str) L.name = nm; PE.commit("Edit text"); }
		PE.invalidate();
	};
	PE.textEditing = function () { return !!te; };
	PE.focusText = function () { if (te) { var ta = editor(); if (document.activeElement !== ta) ta.focus({ preventScroll: true }); } };
	function lineMove(dir, shift, ta) {   // Up / Down / Home / End follow the lines as they are drawn on the canvas (the hidden box wraps differently)
		var L = te.L, lay = PE.textLayout(L), f = focusIdx(ta), cl = P.caretLine(lay.lines, f), line = lay.lines[cl.line], nIdx;
		if (dir === "home") nIdx = line.start; else if (dir === "end") nIdx = line.end;
		else { var x = lay.lx[cl.line] + lay.measure(line.text.slice(0, cl.k), line.start), j = cl.line + dir; if (j < 0) nIdx = 0; else if (j >= lay.lines.length) nIdx = ta.value.length; else nIdx = P.hitInLine(lay.lines[j], x - lay.lx[j], lay.measure); }
		setSel(shift ? anchorIdx(ta) : nIdx, nIdx);
	}
	PE.initTextEditor = function () {
		var ta = editor();
		ta.addEventListener("input", function () { if (!te) return; var tt = te.L.text; if (PE.textRich(tt) || tt.rich) { var nr = P.richNorm(P.richEdit(tt.rich || String(PE.textMask(tt)).repeat(tt.str.length), tt.str, ta.value, PE.textMask(tt))); tt.rich = nr.rich; if (nr.mask != null) normFlags(tt, nr.mask); } tt.str = ta.value; PE.renderText(te.L); PE.touch(te.L); placeEditor(); poke(); });
		ta.addEventListener("keydown", function (e) {
			e.stopPropagation(); if (!te) return; var mod = e.ctrlKey || e.metaKey;
			if (e.key === "Escape" || (e.key === "Enter" && mod)) { e.preventDefault(); PE.endTextEdit(false); return; }
			if (mod && !e.altKey && !e.shiftKey) { var kb = e.key.toLowerCase(), bit = kb === "b" ? 1 : kb === "i" ? 2 : kb === "u" ? 4 : 0; if (bit) { e.preventDefault(); PE.textToggleStyle(bit); return; } }   // Ctrl / Cmd + B, I, U: bold / italic / underline the selected letters (all of the text when nothing is selected)
			if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !mod && !e.altKey) { e.preventDefault(); lineMove(e.key === "ArrowUp" ? -1 : 1, e.shiftKey, ta); return; }
			if ((e.key === "Home" || e.key === "End") && !mod) { e.preventDefault(); lineMove(e.key === "Home" ? "home" : "end", e.shiftKey, ta); return; }
			setTimeout(poke, 0);
		});
		["keyup", "select", "focus"].forEach(function (t) { ta.addEventListener(t, function () { poke(); selStyleSync(); }); });
		ta.addEventListener("blur", function () { setTimeout(function () {
			var a = document.activeElement, opts = document.getElementById("pe-opts");
			if (!te || a === ta || PE.keepTextEdit) return;
			if (a && opts && opts.contains(a)) return;   // changing the font / size / colour in the option bar keeps the edit going (one undo step)
			PE.endTextEdit(false); }, 120); });
		PE.on("view", function () { if (te) placeEditor(); });
		var opts = document.getElementById("pe-opts");   // a click on the option bar's background must not take the keyboard away from the text
		if (opts) opts.addEventListener("mousedown", function (e) { if (te && !(e.target.closest && e.target.closest("input,select,textarea,button,label,a"))) e.preventDefault(); });
		/* keys that reach the page while a text is open but the key catcher lost focus (a click somewhere neutral): type them into the text instead of
		 * letting them act as tool shortcuts ("b" would switch to the brush) */
		PE.textKey = function (e) {
			if (!te) return false; var k = e.key; if (e.ctrlKey || e.metaKey || e.altKey) return false;
			if (k === "Escape") { PE.endTextEdit(false); return true; }
			ta.focus({ preventScroll: true });
			if (k.length === 1) { var a = ta.selectionStart, b = ta.selectionEnd; ta.setRangeText(k, a, b, "end"); ta.dispatchEvent(new Event("input")); }
			else if (k === "Enter") { var a2 = ta.selectionStart; ta.setRangeText("\n", a2, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); }
			return true;
		};
		PE.on("history", function () { if (te && PE.doc.layers.indexOf(te.L) < 0) { te = null; clearInterval(blinkT); ta.style.display = "none"; } });   // undo / redo replaced the layer objects
	};
	var ctimer = 0;
	/* ---------- bold / italic / underline of a range (rich text) ---------- */
	function normFlags(t, m) { t.bold = !!(m & 1); t.italic = !!(m & 2); t.underline = !!(m & 4); }
	var BITS = { bold: 1, italic: 2, underline: 4 };
	/* set (force = true / false) or toggle (force = null) one style bit on the characters a..b of a text layer; the whole text when a..b is empty */
	function styleRange(L, bit, a, b, force) {
		var t = L.text, n = String(t.str).length, key = bit === 1 ? "bold" : bit === 2 ? "italic" : "underline";
		if (!n) { t[key] = force != null ? !!force : !t[key]; t.rich = null; return; }
		if (a == null || b == null || a === b) { a = 0; b = n; }
		var r = PE.textRich(t) || String(PE.textMask(t)).repeat(n), on = force != null ? !!force : !P.richAll(r, a, b, bit);
		var nm = P.richNorm(P.richSet(r, a, b, bit, on)); t.rich = nm.rich; normFlags(t, nm.mask);
	}
	PE.textStyleRange = styleRange;
	function selRange() { if (!te) return null; var ta = editor(); return ta.selectionStart !== ta.selectionEnd ? [ta.selectionStart, ta.selectionEnd] : null; }
	/* Ctrl / Cmd + B, I, U (also outside the text box: then it is the whole active text layer) */
	PE.textToggleStyle = function (bit) {
		var L = te ? te.L : PE.active(); if (!L || L.type !== "text" || !L.text) return false; var rg = selRange();
		styleRange(L, bit, rg ? rg[0] : null, rg ? rg[1] : null, null); PE.renderText(L); PE.touch(L);
		if (te) { placeEditor(); poke(); } else PE.commit(bit === 1 ? "Bold" : bit === 2 ? "Italic" : "Underline");
		lastSig = ""; PE.emit("opts", "text"); return true;
	};
	/* the B / I / U ticks in the option bar show the selected letters while a text is open */
	var lastSig = "";
	function selStyleSync() { if (!te) return; var sg = ["bold", "italic", "underline"].map(function (k) { return PE.optGet("text", k) ? 1 : 0; }).join("") + (selRange() ? "s" : ""); if (sg !== lastSig) { lastSig = sg; PE.emit("opts", "text"); } }

	/* ---------- the text box on the canvas: drag its edges to set the wrap width; with Auto-fit text also its height (the font size follows) ----------
	 * Handles sit on the text frame (not on the layer's padding). hx / hy = 0, 0.5 or 1 across / down the frame; the opposite side stays where it is. */
	var bw = null;   // a text-box drag in the Text tool
	var SIDES = [[0, 0.5], [1, 0.5]], ALL8 = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
	function boxHandles(L) {
		if (!L || L.type !== "text" || !L.text || L.locked || !PE.effVisible(L)) return []; var lay = PE.textLayout(L), p = lay.pad;
		var o0 = PE.toScreen.apply(null, xy(locToDoc(L, 0, 0))), oX = PE.toScreen.apply(null, xy(locToDoc(L, 1, 0))), oY = PE.toScreen.apply(null, xy(locToDoc(L, 0, 1))), ux = unit(oX.x - o0.x, oX.y - o0.y), uy = unit(oY.x - o0.x, oY.y - o0.y);
		// the grips sit 8 px outside the box so they never cover the first / last letter
		return (lay.fit || L.text.fit ? ALL8 : SIDES).map(function (h) { var d = locToDoc(L, p + h[0] * lay.mw, p + h[1] * lay.bh), sc = PE.toScreen(d.x, d.y), kx = (h[0] - 0.5) * 2 * 8, ky = (h[1] - 0.5) * 2 * 8; return { hx: h[0], hy: h[1], x: d.x, y: d.y, s: { x: sc.x + ux[0] * kx + uy[0] * ky, y: sc.y + ux[1] * kx + uy[1] * ky } }; });
	}
	function scrOf(e) { var r = PE.els.over.getBoundingClientRect(); return { x: e.sx - r.left, y: e.sy - r.top }; }
	/* the handle under the pointer: a dot within 9 px, or anywhere along a left / right edge (5 px) */
	PE.textBoxHit = function (L, e) {
		var hs = boxHandles(L); if (!hs.length) return null; var sp = scrOf(e), best = null, bd = 9.5;
		hs.forEach(function (h) { var d = Math.hypot(h.s.x - sp.x, h.s.y - sp.y); if (d < bd) { bd = d; best = h; } }); if (best) return best;
		var lay = PE.textLayout(L), p = lay.pad;
		for (var i = 0; i < hs.length; i++) { var h = hs[i]; if (h.hy !== 0.5) continue; var a = PE.toScreen.apply(null, xy(locToDoc(L, p + h.hx * lay.mw, p))), b = PE.toScreen.apply(null, xy(locToDoc(L, p + h.hx * lay.mw, p + lay.bh))), vx = b.x - a.x, vy = b.y - a.y, ll = vx * vx + vy * vy || 1, tt = ((sp.x - a.x) * vx + (sp.y - a.y) * vy) / ll; if (tt < 0 || tt > 1) continue; if (Math.hypot(a.x + vx * tt - sp.x, a.y + vy * tt - sp.y) < 5) return h; }
		return null;
	};
	function xy(d) { return [d.x, d.y]; }
	function unit(x, y) { var l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
	PE.textBoxCursor = function (h, L) { if (!h) return ""; var r = ((L.rot % Math.PI) + Math.PI) % Math.PI, turned = r > Math.PI / 4 && r < Math.PI * 3 / 4; if (h.hy === 0.5) return turned ? "ns-resize" : "ew-resize"; if (h.hx === 0.5) return turned ? "ew-resize" : "ns-resize"; return (h.hx === h.hy) !== turned ? "nwse-resize" : "nesw-resize"; };
	PE.textBoxStart = function (L, h) {
		var lay = PE.textLayout(L), p = lay.pad, f = locToDoc(L, p + (1 - h.hx) * lay.mw, p + (1 - h.hy) * lay.bh);
		return { L: L, h: h, fixed: f, orig: JSON.stringify(L.text), cx: L.cx, cy: L.cy, moved: false };
	};
	PE.textBoxMove = function (b, e) {
		var L = b.L, t = L.text, h = b.h, c = Math.cos(L.rot), s = Math.sin(L.rot), dx = e.x - b.fixed.x, dy = e.y - b.fixed.y, du = (c * dx + s * dy) / L.sx, dv = (-s * dx + c * dy) / L.sy;
		if (h.hx !== 0.5) t.wrapW = Math.max(20, Math.round(h.hx === 1 ? du : -du));
		if (h.hy !== 0.5 && t.fit) { t.boxH = Math.max(12, Math.round(h.hy === 1 ? dv : -dv)); if (!(t.wrapW > 0)) t.wrapW = Math.round(PE.textLayout(L).mw); }
		PE.renderText(L); var lay = PE.textLayout(L), p = lay.pad, n = locToDoc(L, p + (1 - h.hx) * lay.mw, p + (1 - h.hy) * lay.bh); L.cx += b.fixed.x - n.x; L.cy += b.fixed.y - n.y;   // the opposite side stays put
		b.moved = true; PE.touch(L); if (te && te.L === L) placeEditor(); PE.emit("opts", PE.toolId === "text" ? "text" : PE.toolId);
	};
	PE.textBoxAbort = function (b) { b.L.text = JSON.parse(b.orig); PE.renderText(b.L); b.L.cx = b.cx; b.L.cy = b.cy; PE.touch(b.L); };
	PE.drawTextBoxHandles = function (x, L) { boxHandles(L).forEach(function (h) { var sp = h.s; x.fillStyle = "#a78bfa"; x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); if (h.hy === 0.5) x.rect(sp.x - 5, sp.y - 11, 10, 22); else if (h.hx === 0.5) x.rect(sp.x - 11, sp.y - 5, 22, 10); else x.rect(sp.x - 6, sp.y - 6, 12, 12); x.fill(); x.stroke(); }); };
	PE.textAt = function (e) { return hitText(e, null); };
	PE.drawTextFrame = function (x, L, solid) { drawFrame(x, L, solid); };
	function drawFrame(x, L, solid) {
		var f = frameOf(L), pts = [[f.u0, f.v0], [f.u1, f.v0], [f.u1, f.v1], [f.u0, f.v1]].map(function (q) { var d = locToDoc(L, q[0], q[1]); return PE.toScreen(d.x, d.y); });
		x.save(); x.lineWidth = 1; x.setLineDash(solid ? [] : [4, 3]); x.strokeStyle = "rgba(0,0,0,0.65)"; x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x + 0.5, p.y + 0.5) : x.moveTo(p.x + 0.5, p.y + 0.5); }); x.closePath(); x.stroke();
		x.lineDashOffset = solid ? 0 : 3.5; x.strokeStyle = solid ? "#a78bfa" : "rgba(255,255,255,0.85)"; x.lineWidth = solid ? 1.5 : 1; x.stroke(); x.restore();
	}
	function drawCaret(x, v) {
		var L = te.L, ta = editor(), lay = PE.textLayout(L), a = ta.selectionStart, b = ta.selectionEnd, sz = lay.size, sc = v.zoom * Math.max(1e-6, Math.abs(L.sx));
		x.save(); x.translate(v.px, v.py); x.scale(v.zoom, v.zoom); var c = Math.cos(L.rot), s = Math.sin(L.rot); x.transform(c * L.sx, s * L.sx, -s * L.sy, c * L.sy, L.cx, L.cy); x.translate(-L.canvas.width / 2, -L.canvas.height / 2);
		if (a !== b) {
			x.fillStyle = "rgba(59,130,246,0.38)";
			lay.lines.forEach(function (ln, i) {
				var s0 = Math.max(a, ln.start), s1 = Math.min(b, ln.end); var past = b > ln.end && a <= ln.end;   // the selection runs on past this line: show the line break as selected too
				if (s1 < s0 || (s1 === s0 && !past)) return; var x0 = lay.lx[i] + lay.measure(ln.text.slice(0, s0 - ln.start), ln.start), x1 = lay.lx[i] + lay.measure(ln.text.slice(0, s1 - ln.start), ln.start) + (past ? sz * 0.25 : 0);
				x.fillRect(x0, lay.base[i] - sz * 0.86, x1 - x0, sz * 1.1);
			});
		} else if (blinkOn) {
			var cl = P.caretLine(lay.lines, focusIdx(ta)), ln = lay.lines[cl.line], cx = lay.lx[cl.line] + lay.measure(ln.text.slice(0, cl.k), ln.start), y0 = lay.base[cl.line] - sz * 0.86, y1 = lay.base[cl.line] + sz * 0.24;
			x.lineCap = "butt"; x.strokeStyle = "rgba(255,255,255,0.95)"; x.lineWidth = 4 / sc; x.beginPath(); x.moveTo(cx, y0); x.lineTo(cx, y1); x.stroke(); x.strokeStyle = "#111"; x.lineWidth = 2 / sc; x.stroke();
		}
		x.restore();
	}
	PE.defTool({ id: "text", name: "Text / Label", key: "t", icon: "T", opts: JSON.parse(JSON.stringify(PE.TEXTDEF)), hint: "Click empty canvas to add text, click a text to edit it (caret where you click, drag to select, double-click a word, triple-click a line). Ctrl/Cmd+B, I, U = bold, italic, underline of the selected letters. Drag the purple handles on the box edges to wrap the text (with Auto-fit text: the corners too, and the size follows). Enter = new line, Ctrl+Enter, Esc or a click outside = done.",
		ui: [{ k: "font", label: "Font", type: "select", options: "fonts" }, { k: "size", label: "Size", type: "range", min: 6, max: 400, step: 1, unit: "px" }, { k: "wrapW", label: "Box width (0 = auto)", type: "range", min: 0, max: 4000, step: 10, unit: "px" }, { k: "fit", label: "Auto-fit text", type: "check" }, { k: "boxH", label: "Box height", type: "range", min: 0, max: 4000, step: 10, unit: "px", show: "fit" }, { k: "bold", label: "Bold", type: "check" }, { k: "italic", label: "Italic", type: "check" }, { k: "underline", label: "Underline", type: "check" }, { k: "align", label: "Align", type: "seg", options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] }, { k: "lh", label: "Line height", type: "range", min: 0.8, max: 3, step: 0.05 }, { k: "ls", label: "Letter spacing", type: "range", min: -10, max: 60, step: 1, unit: "px" }, { k: "color", label: "Colour", type: "color" },
			{ k: "bgOn", label: "Background box", type: "check" }, { k: "bgColor", label: "Box colour", type: "color", show: "bgOn" }, { k: "bgPad", label: "Padding", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" }, { k: "bgRadius", label: "Corners", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" },
			{ k: "strokeOn", label: "Outline", type: "check" }, { k: "stroke", label: "Outline colour", type: "color", show: "strokeOn" }, { k: "strokeW", label: "Outline width", type: "range", min: 0, max: 40, step: 1, unit: "px", show: "strokeOn" },
			{ k: "shadowOn", label: "Shadow", type: "check" }, { k: "shadow", label: "Shadow colour", type: "color", show: "shadowOn" }, { k: "shadowBlur", label: "Blur", type: "range", min: 0, max: 60, step: 1, unit: "px", show: "shadowOn" }, { k: "shadowDx", label: "Shadow X", type: "range", min: -60, max: 60, step: 1, unit: "px", show: "shadowOn" }, { k: "shadowDy", label: "Shadow Y", type: "range", min: -60, max: 60, step: 1, unit: "px", show: "shadowOn" },
			{ type: "button", label: "Load font file…", act: function () { PE.pickFontFile(); } }, { type: "button", label: "Yellow label", act: function () { preset({ bgOn: true, bgColor: "#ffeb3b", color: "#111111", bold: true, bgPad: 14, bgRadius: 8 }); } }, { type: "button", label: "Red callout", act: function () { preset({ bgOn: true, bgColor: "#e53935", color: "#ffffff", bold: true, bgPad: 14, bgRadius: 10 }); } }, { type: "button", label: "Meme text", act: function () { preset({ bgOn: false, color: "#ffffff", strokeOn: true, stroke: "#000000", strokeW: 6, bold: true, font: "Impact, 'Arial Black', sans-serif", align: "center" }); } }],
		optsTarget: function () { var L = PE.active(); return L && L.type === "text" && L.text ? L.text : null; },
		optGet: function (k) {   // B / I / U while a text is open show the selected letters; with mixed styles, ticked = every letter has it
			if (!BITS[k]) return undefined; var L = te ? te.L : PE.active(); if (!L || L.type !== "text" || !L.text) return undefined; var t = L.text, r = PE.textRich(t), rg = selRange();
			if (rg) return P.richAll(r || String(PE.textMask(t)).repeat(t.str.length), rg[0], rg[1], BITS[k]); return undefined;
		},
		onopt: function (k, v) { var L = PE.active(); if (!L || L.type !== "text") return; var t = L.text;
			if (BITS[k]) { var rg = te && te.L === L ? selRange() : null; if (rg) styleRange(L, BITS[k], rg[0], rg[1], v); else if (PE.textRich(t)) styleRange(L, BITS[k], 0, t.str.length, v); lastSig = ""; }
			if (k === "fit" && v) { var ly = PE.textLayout(L); if (!(t.wrapW > 0)) t.wrapW = Math.round(ly.mw); if (!(t.boxH > 0)) t.boxH = Math.round(ly.bh); setTimeout(function () { PE.emit("opts", "text"); }, 0); }
			if (k === "size" && t.fit) { t.fit = false; PE.opt.text.fit = false; PE.toast("Auto-fit text is off now, so the size you set is kept"); setTimeout(function () { PE.emit("opts", "text"); }, 0); }
			PE.renderText(L); PE.touch(L); if (te) { placeEditor(); poke(); return; } clearTimeout(ctimer); ctimer = setTimeout(function () { PE.commit("Text style"); }, 450); },   // while editing, the style change is part of the edit's one undo step
		overlay: function (x, v) {
			var A = PE.active();
			if (hoverT && hoverT !== A && PE.doc.layers.indexOf(hoverT) >= 0 && !te) drawFrame(x, hoverT, false);
			if (A && A.type === "text" && A.text) { drawFrame(x, A, !!te); if (te && te.L === A) drawCaret(x, v); }
			if (A && A.type === "text" && A.text) PE.drawTextBoxHandles(x, A);
		},
		hover: function (e) { if (!PE.doc) return; var h = hitText(e, null); if (h !== hoverT) { hoverT = h; PE.invalidateOverlay(); } var A = PE.active(), hh = A && A.type === "text" ? PE.textBoxHit(A, e) : null; PE.els.over.style.cursor = hh ? PE.textBoxCursor(hh, A) : "text"; },
		move: function (e) {
			if (bw) { PE.textBoxMove(bw, e); return; }
			if (tdrag && te) { setSel(tdrag.a, indexAt(te.L, e.x, e.y)); }
		},
		up: function () { if (bw) { var w0 = bw; bw = null; if (w0.moved && !te) PE.commit("Text box"); } tdrag = null; },
		dbl: function (e) { if (!te || !PE.layerAtPoint(te.L, e.x, e.y)) return; var w = P.wordAt(te.L.text.str, indexAt(te.L, e.x, e.y)); setSel(w[0], w[1]); tdrag = null; lastDbl = { t: Date.now(), x: e.sx, y: e.sy }; },
		down: function (e) {
			var A0 = te ? te.L : PE.active(), hh = A0 && A0.type === "text" ? PE.textBoxHit(A0, e) : null; if (hh) { bw = PE.textBoxStart(A0, hh); return; }
			var hit = hitText(e, te ? te.L : PE.active());
			if (te && hit === te.L) {
				var idx = indexAt(hit, e.x, e.y), ta = editor();
				if (Date.now() - lastDbl.t < 450 && Math.hypot(e.sx - lastDbl.x, e.sy - lastDbl.y) < 6) { var lay = PE.textLayout(hit), ln = lay.lines[P.caretLine(lay.lines, idx).line]; setSel(ln.start, ln.end); lastDbl.t = 0; return; }   // triple-click = the whole line
				var a = e.shift ? anchorIdx(ta) : idx; setSel(a, idx); tdrag = { a: a }; PE.focusText(); return;
			}
			if (te) { PE.endTextEdit(false); if (!hit) return; }   // a click outside finishes the edit; the next click on empty canvas starts a new text
			if (hit) { PE.setActive(hit.id); var i2 = indexAt(hit, e.x, e.y); openEdit(hit, false, i2); tdrag = { a: i2 }; return; }
			var o = JSON.parse(JSON.stringify(PE.opt.text)); o.str = ""; var L = PE.makeLayer({ type: "text", name: "Text", text: o, w: 4, h: 4 }); PE.renderText(L); var pd = PE.textLayout(L).pad; L.cx = e.x - pd + L.canvas.width / 2; L.cy = e.y - pd + L.canvas.height / 2;
			PE.addLayer(L); openEdit(L, true, 0);
		}, cancel: function () { if (bw) { PE.textBoxAbort(bw); bw = null; } PE.endTextEdit(false); hoverT = null; } });
	function preset(o) { for (var k in o) PE.optSet("text", k, o[k]); PE.emit("opts", "text"); }
	/* open the active text layer for editing: at = a point on the canvas (caret there, from a double-click with the Move tool), else everything selected */
	PE.editActiveText = function (at) { var L = PE.active(); if (L && L.type === "text") { PE.setTool("text"); openEdit(L, false, at ? indexAt(L, at.x, at.y) : "all"); } };
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

	/* ---------- "?" help buttons: a small round button that opens a short explanation next to it ---------- */
	var helpEl = null;
	function closeHelp2() { if (helpEl) { helpEl.remove(); helpEl = null; } }
	PE.helpBtn = function (title, text) {
		var b = el("button", "pe-qh", "?"); b.type = "button"; b.title = text.replace(/<[^>]+>/g, "").slice(0, 160); b.setAttribute("aria-label", "What is " + title + "?");
		b.addEventListener("click", function (e) {
			e.preventDefault(); e.stopPropagation(); var same = helpEl && helpEl._b === b; closeHelp2(); if (same) return;
			var root = PE.els.root || document.body, h = el("div", "pe-qpop"), r = b.getBoundingClientRect(), rr = root.getBoundingClientRect();
			h.innerHTML = "<b>" + esc(title) + "</b><div>" + text + "</div>"; h._b = b; root.appendChild(h); helpEl = h;
			var x = Math.min(Math.max(4, r.left - rr.left - 10), rr.width - h.offsetWidth - 6), y = r.bottom - rr.top + 6; if (y + h.offsetHeight > rr.height - 4) y = Math.max(4, r.top - rr.top - h.offsetHeight - 6); h.style.left = x + "px"; h.style.top = y + "px";
		});
		return b;
	};
	document.addEventListener("mousedown", function (e) { if (helpEl && !(e.target.closest && (e.target.closest(".pe-qpop") || e.target.closest(".pe-qh")))) closeHelp2(); }, true);
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && helpEl) { closeHelp2(); e.stopPropagation(); } }, true);

	/* ---------- modal ---------- */
	var openModal = null;
	PE.modal = function (o) {
		if (openModal) openModal.close(true);
		var back = el("div", "pe-modal"), box = el("div", "pe-dlg" + (o.wide ? " pe-dlg--wide" : "") + (o.cls ? " " + o.cls : "")), head = el("div", "pe-dlg-h"), body = el("div", "pe-dlg-b"), foot = el("div", "pe-dlg-f");
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
			var row = el("label", "pe-row"), lab = el("span", "pe-row-l", esc(p.label)); row.appendChild(lab); if (p.help) lab.appendChild(PE.helpBtn(p.label, p.help)); var inp, out;
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
		var d = PE.doc; if (!d) return; var wrap = el("div", "pe-cs"), ax = 0.5, ay = 0.5, R = { x: 0, y: 0, w: d.w, h: d.h };
		var thumb = null; try { thumb = PE.flatten(); } catch (e) {}
		var cv = el("canvas", "pe-cs-cv"); cv.width = 440; cv.height = 280; wrap.appendChild(cv); var cx = cv.getContext("2d");
		var f = PE.form([{ k: "w", label: "Width", help: "The width of the canvas in pixels. Bigger than the picture adds empty space; smaller crops the picture. Or drag the purple edges in the preview.", type: "number", val: d.w, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", help: "The height of the canvas in pixels.", type: "number", val: d.h, min: 1, max: PE.MAXPX }, { k: "fill", label: "New area", help: "What fills any extra space the bigger canvas adds. Transparent keeps it see-through (use PNG or WebP to keep that).", type: "select", options: [["none", "Transparent"], ["bg", "Background colour"], ["fg", "Foreground colour"], ["white", "White"], ["black", "Black"]], val: "none" }], null);
		wrap.appendChild(f.el);
		var chips = el("div", "pe-cs-chips"); chips.appendChild(el("span", "pe-row-l", "Quick sizes")); chips.appendChild(PE.helpBtn("Quick sizes", "One click to make the canvas exactly as big as: all the visible layers together, just the selected layer, or the current selection. Handy after pasting a picture bigger than the canvas."));
		function chip(label, fn, tip) { var b = el("button", "pe-btn pe-btn--sm", esc(label)); b.type = "button"; b.title = tip; b.addEventListener("click", fn); chips.appendChild(b); }
		function setRect(r) { R = { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) }; sync(); draw(); }
		function union(list) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(function (L) { var b = PE.bounds(L); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }); return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; }
		chip("Fit all visible layers", function () { var r = union(d.layers.filter(function (L) { return !PE.isGroup(L) && PE.effVisible(L); })); if (r) setRect(r); else PE.toast("No visible layers"); }, "Canvas = the box around everything you can see");
		chip("Fit selected layer", function () { var L = PE.active(), r = L && !PE.isGroup(L) ? union([L]) : null; if (r) setRect(r); else PE.toast("Select a layer first"); }, "Canvas = the box around the selected layer");
		chip("Fit selection", function () { var b = PE.selBounds && PE.selBounds(); if (b) setRect(b); else PE.toast("Make a selection first"); }, "Canvas = the box around the current selection");
		chip("Reset", function () { ax = ay = 0.5; setRect({ x: 0, y: 0, w: d.w, h: d.h }); }, "Back to the current size");
		wrap.appendChild(chips);
		var grid = el("div", "pe-anchor"); for (var i = 0; i < 9; i++) { (function (i) { var b = el("button", null, i === 4 ? "●" : ""); b.type = "button"; b.setAttribute("aria-pressed", i === 4 ? "true" : "false"); b.title = "Where the current picture sits inside the new canvas"; b.addEventListener("click", function () { ax = (i % 3) / 2; ay = Math.floor(i / 3) / 2; Array.prototype.forEach.call(grid.children, function (c, j) { c.setAttribute("aria-pressed", j === i ? "true" : "false"); c.textContent = j === i ? "●" : ""; }); fromInputs(); }); grid.appendChild(b); })(i); }
		var row = el("div", "pe-row"); var al = el("span", "pe-row-l", "Anchor"); al.appendChild(PE.helpBtn("Anchor", "When you change the width or height, the anchor decides which side of the picture stays put. Centre grows or shrinks evenly all round; top-left keeps the top-left corner and adds or removes space at the right and bottom.")); row.appendChild(al); row.appendChild(grid); wrap.appendChild(row);
		var info = el("p", "pe-hint2"); wrap.appendChild(info);
		function sync() { f.set("w", R.w); f.set("h", R.h); info.textContent = "Current " + d.w + " × " + d.h + " px → new " + R.w + " × " + R.h + " px" + (R.w * R.h > PE.MAXAREA ? " (too large)" : ""); }
		function fromInputs() { var v = f.get(), w = Math.max(1, Math.round(v.w || 1)), h = Math.max(1, Math.round(v.h || 1)); R = { x: Math.round(-(w - d.w) * ax), y: Math.round(-(h - d.h) * ay), w: w, h: h }; info.textContent = "Current " + d.w + " × " + d.h + " px → new " + w + " × " + h + " px"; draw(); }
		f.inputs.w.inp.addEventListener("input", fromInputs); f.inputs.h.inp.addEventListener("input", fromInputs);
		var sc = 1, ox = 0, oy = 0;
		function view() { var x0 = Math.min(0, R.x), y0 = Math.min(0, R.y), x1 = Math.max(d.w, R.x + R.w), y1 = Math.max(d.h, R.y + R.h), pw = x1 - x0, ph = y1 - y0, m = 26; sc = Math.min((cv.width - m * 2) / pw, (cv.height - m * 2) / ph); ox = (cv.width - pw * sc) / 2 - x0 * sc; oy = (cv.height - ph * sc) / 2 - y0 * sc; }
		function draw() {
			view(); cx.clearRect(0, 0, cv.width, cv.height); cx.fillStyle = "#101014"; cx.fillRect(0, 0, cv.width, cv.height);
			// new canvas area (checker so transparent space reads as empty)
			var nx = ox + R.x * sc, ny = oy + R.y * sc, nw = R.w * sc, nh = R.h * sc; cx.save(); cx.beginPath(); cx.rect(nx, ny, nw, nh); cx.clip(); for (var yy = 0; yy < nh; yy += 10) for (var xx = 0; xx < nw; xx += 10) { cx.fillStyle = ((xx + yy) / 10) % 2 ? "#2a2a33" : "#33333d"; cx.fillRect(nx + xx, ny + yy, 10, 10); } cx.restore();
			if (thumb) { cx.imageSmoothingQuality = "high"; cx.drawImage(thumb, ox, oy, d.w * sc, d.h * sc); } else { cx.fillStyle = "#555"; cx.fillRect(ox, oy, d.w * sc, d.h * sc); }
			cx.strokeStyle = "rgba(255,255,255,0.45)"; cx.setLineDash([4, 3]); cx.lineWidth = 1; cx.strokeRect(ox + 0.5, oy + 0.5, d.w * sc, d.h * sc); cx.setLineDash([]);   // the current picture's edge
			cx.fillStyle = "rgba(0,0,0,0.5)"; // darken what will be cropped away
			cx.save(); cx.beginPath(); cx.rect(ox, oy, d.w * sc, d.h * sc); cx.rect(nx, ny, nw, nh); cx.clip("evenodd"); cx.fillRect(ox, oy, d.w * sc, d.h * sc); cx.restore();
			cx.strokeStyle = "#a78bfa"; cx.lineWidth = 2; cx.strokeRect(nx, ny, nw, nh);
			cx.fillStyle = "#a78bfa"; cx.strokeStyle = "#fff"; cx.lineWidth = 1.5; handles(nx, ny, nw, nh).forEach(function (h) { cx.beginPath(); cx.rect(h.x - 5, h.y - 5, 10, 10); cx.fill(); cx.stroke(); });
		}
		function handles(nx, ny, nw, nh) { return [{ k: "nw", x: nx, y: ny }, { k: "n", x: nx + nw / 2, y: ny }, { k: "ne", x: nx + nw, y: ny }, { k: "e", x: nx + nw, y: ny + nh / 2 }, { k: "se", x: nx + nw, y: ny + nh }, { k: "s", x: nx + nw / 2, y: ny + nh }, { k: "sw", x: nx, y: ny + nh }, { k: "w", x: nx, y: ny + nh / 2 }]; }
		var drag = null;
		function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
		function hit(p) { var hs = handles(ox + R.x * sc, oy + R.y * sc, R.w * sc, R.h * sc); for (var i = 0; i < hs.length; i++) if (Math.abs(p.x - hs[i].x) < 9 && Math.abs(p.y - hs[i].y) < 9) return hs[i].k; return null; }
		var CUR = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
		cv.addEventListener("pointermove", function (e) {
			var p = pos(e); if (!drag) { var k = hit(p); cv.style.cursor = k ? CUR[k] : "default"; return; }
			var dx = Math.round((p.x - drag.p.x) / sc), dy = Math.round((p.y - drag.p.y) / sc), r = { x: drag.R.x, y: drag.R.y, w: drag.R.w, h: drag.R.h }, k = drag.k;
			if (k.indexOf("e") >= 0) r.w = Math.max(1, drag.R.w + dx); if (k.indexOf("s") >= 0) r.h = Math.max(1, drag.R.h + dy);
			if (k.indexOf("w") >= 0) { r.w = Math.max(1, drag.R.w - dx); r.x = drag.R.x + drag.R.w - r.w; } if (k.indexOf("n") >= 0) { r.h = Math.max(1, drag.R.h - dy); r.y = drag.R.y + drag.R.h - r.h; }
			if (e.shiftKey && k.length === 2) { var asp = drag.R.w / drag.R.h; r.h = Math.max(1, Math.round(r.w / asp)); if (k.indexOf("n") >= 0) r.y = drag.R.y + drag.R.h - r.h; }
			R = r; sync(); draw();
		});
		cv.addEventListener("pointerdown", function (e) { var p = pos(e), k = hit(p); if (!k) return; cv.setPointerCapture(e.pointerId); drag = { k: k, p: p, R: { x: R.x, y: R.y, w: R.w, h: R.h } }; });
		cv.addEventListener("pointerup", function () { drag = null; }); cv.addEventListener("pointercancel", function () { drag = null; });
		wrap.appendChild(el("p", "pe-hint2", "Drag the purple handles to resize the canvas (hold Shift on a corner to keep the shape). The dashed line is your picture's current edge; darkened parts will be cropped away."));
		sync(); draw();
		PE.modal({ title: "Canvas size", wide: true, body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { var v = f.get(); m.close(); PE.canvasRect(R.x, R.y, R.w, R.h, v.fill === "none" ? null : v.fill === "bg" ? PE.bg : v.fill === "fg" ? PE.fg : v.fill); } }] });
	};

	/* ---------- new solid colour layer (white, black, any colour) ---------- */
	PE.dlgFillLayer = function () {
		var d = PE.doc; if (!d) { PE.toast("Open or create an image first"); return; } var wrap = el("div"), f = PE.form([{ k: "c", label: "Colour", help: "The colour the whole layer is filled with. Pick any colour, or use the quick buttons below.", type: "color", val: "#ffffff" }, { k: "where", label: "Put it", help: "Above the selected layer, or at the very bottom as a background (it then sits behind everything).", type: "select", options: [["above", "Above the selected layer"], ["bottom", "At the bottom (as a background)"]], val: "bottom" }, { k: "name", label: "Layer name", type: "text", val: "Fill" }], null);
		wrap.appendChild(f.el); var q = el("div", "pe-cs-chips"); q.appendChild(el("span", "pe-row-l", "Quick colours"));
		[["White", "#ffffff"], ["Black", "#000000"], ["Foreground", PE.fg], ["Background", PE.bg], ["Grey", "#808080"], ["Red", "#e53935"], ["Yellow", "#ffeb3b"], ["Green", "#43a047"], ["Blue", "#1e88e5"]].forEach(function (c) { var b = el("button", "pe-btn pe-btn--sm", esc(c[0])); b.type = "button"; b.style.cssText = "border-left:1.1em solid " + c[1]; b.addEventListener("click", function () { f.set("c", c[1]); f.set("name", c[0]); }); q.appendChild(b); });
		wrap.appendChild(q); wrap.appendChild(el("p", "pe-hint2", "Adds a new layer filled with one colour, the size of the image. Use it for a white or coloured background, or put it above other layers and lower its opacity for a tint."));
		PE.modal({ title: "New solid colour layer", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Add layer", primary: true, act: function (m) { var v = f.get(); m.close(); var L = PE.makeLayer({ name: v.name || "Fill" }), x = L.canvas.getContext("2d"); x.fillStyle = v.c; x.fillRect(0, 0, L.canvas.width, L.canvas.height); if (v.where === "bottom") { d.layers.unshift(L); PE.setActive(L.id); PE.emit("layers"); PE.invalidate(); } else PE.addLayer(L); PE.commit("New solid colour layer"); } }] });
	};

	/* ---------- new document ---------- */
	PE.PRESETS = [["Full HD 1920 × 1080", 1920, 1080], ["HD 1280 × 720 (YouTube thumbnail)", 1280, 720], ["4K 3840 × 2160", 3840, 2160], ["Social share 1200 × 630", 1200, 630], ["Square post 1080 × 1080", 1080, 1080], ["Portrait post 1080 × 1350", 1080, 1350], ["Story / Reel 1080 × 1920", 1080, 1920], ["X / Twitter post 1600 × 900", 1600, 900], ["Banner 1500 × 500", 1500, 500], ["A4 at 300 dpi 2480 × 3508", 2480, 3508], ["Icon 512 × 512", 512, 512], ["Small 800 × 600", 800, 600]];
	PE.dlgNew = function () {
		var wrap = el("div"), f = PE.form([{ k: "preset", label: "Preset", type: "select", options: [["", "Custom"]].concat(PE.PRESETS.map(function (p, i) { return [String(i), p[0]]; })), val: "0" }, { k: "w", label: "Width", type: "number", val: 1920, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: 1080, min: 1, max: PE.MAXPX }, { k: "bg", label: "Background", type: "select", options: [["#ffffff", "White"], ["none", "Transparent"], ["fg", "Foreground colour"], ["bgc", "Background colour"], ["#000000", "Black"]], val: "#ffffff" }], function () { var v = f.get(); if (v.preset !== "" && PE.PRESETS[+v.preset]) { f.set("w", PE.PRESETS[+v.preset][1]); f.set("h", PE.PRESETS[+v.preset][2]); } });
		wrap.appendChild(f.el);
		PE.modal({ title: "New image", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Create", primary: true, act: function (m) { var v = f.get(); m.close(); PE.newDoc(v.w, v.h, v.bg === "none" ? null : v.bg === "fg" ? PE.fg : v.bg === "bgc" ? PE.bg : v.bg, "Untitled"); PE.setTool("move"); } }] });
	};

	/* ---------- export ---------- */
	var HELP_FMT = "<p><b>PNG</b>: perfect quality, keeps transparency. Files are big for photos. Best for screenshots, logos, text, anything with sharp edges or see-through parts.</p><p><b>JPEG</b>: small files for photos, but slightly lossy and no transparency (it fills with the background colour). Works everywhere. Best for photographs and anything you will email or post.</p><p><b>WebP</b>: a newer format that is usually 25-35% smaller than JPEG at the same look, and keeps transparency. Works in all modern browsers and most apps, but some older programs cannot open it.</p>";
	/* the name to suggest for an exported picture: the linked project file, else the document's own name (the opened picture / project), else the first
	   layer's file, else "image" (never "Untitled") */
	PE.docBaseName = function () {
		var d = PE.doc; if (!d) return "image"; var L = PE.projectLink && PE.projectLink(), ok = function (s) { s = String(s || "").trim(); return s && !/^(untitled|image|layer)$/i.test(s) ? s : ""; };
		var n = (L && ok(P.projectBase(L.name))) || ok(d.name) || (d.file && d.file.file && ok(I.baseName(d.file.file)));
		if (!n) d.layers.some(function (k) { return k.src && k.src.file && (n = ok(I.baseName(k.src.file))); });
		return n || "image";
	};
	PE.dlgExport = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div", "pe-exp"), saved = Object.assign({ fmt: "png", q: 90, scale: 100, bg: "#ffffff" }, PE.savedParams.export || {});
		if (saved.pid !== d.pid || !saved.name) saved.name = PE.docBaseName();   // a name typed earlier is kept only for the same project
		var f = PE.form([{ k: "fmt", label: "Format", help: HELP_FMT, type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", help: "How much detail JPEG and WebP keep. Higher looks better but makes a bigger file. 85-92% is a good balance: the picture looks the same and the file is much smaller than PNG. PNG is lossless, so it has no quality setting.", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }, { k: "scale", label: "Scale", help: "Makes the exported picture bigger or smaller than the image you are editing. 100% keeps the size. 50% halves the width and height (a quarter of the pixels), handy for web use; 200% doubles it (the pixels are enlarged, it does not add detail).", type: "range", min: 10, max: 400, step: 1, val: saved.scale, unit: "%" }, { k: "bg", label: "Background (JPEG)", help: "JPEG cannot be see-through. Any transparent parts of your image are filled with this colour. PNG and WebP keep transparency, so they ignore this.", type: "color", val: saved.bg }, { k: "name", label: "File name", help: "The name of the downloaded file, without the ending (the ending comes from the format).", type: "text", val: saved.name }], function () { vis(); est(); });
		wrap.appendChild(f.el); var info = el("div", "pe-exp-info", ""); wrap.appendChild(info);
		function vis() { var v = f.get(), F = I.FORMATS[v.fmt]; f.inputs.q.inp.closest(".pe-row").style.display = F.lossy ? "" : "none"; f.inputs.bg.inp.closest(".pe-row").style.display = F.alpha ? "none" : ""; }
		var t = 0, token = 0; function est() { clearTimeout(t); t = setTimeout(function () { var v = f.get(), my = ++token; info.textContent = "Calculating…"; PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }).then(function (b) { if (my !== token) return; info.innerHTML = "<b>" + Math.round(d.w * v.scale / 100) + " × " + Math.round(d.h * v.scale / 100) + " px</b> · " + I.formatBytes(b.size); }).catch(function (e) { info.textContent = e.message; }); }, 250); }
		vis(); est();
		function getBlob(v) { return PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }); }
		PE.modal({ title: "Export image", body: wrap, buttons: [{ label: "Copy to clipboard", act: function (m) { var v = f.get(); PE.exportBlob("png", 1, { scale: v.scale / 100 }).then(function (b) { return navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); }).then(function () { PE.toast("Copied as PNG"); }).catch(function () { PE.toast("This browser can't copy images"); }); } },
			{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download", primary: true, act: function (m) { var v = f.get(); PE.savedParams.export = Object.assign({ pid: d.pid }, v); getBlob(v).then(function (b) { PE.download(b, I.cleanFileName(v.name || "image") + "." + I.FORMATS[v.fmt].ext); PE.toast("Saved"); m.close(); }).catch(function (e) { PE.toast(e.message); }); } }] });
	};
	/* ---------- export one group as its own image, on a canvas of its own size ---------- */
	PE.dlgExportGroup = function (G) {
		var d = PE.doc; if (!d) return; G = G || PE.active(); while (G && !PE.isGroup(G)) G = d.layers.filter(function (k) { return k.id === G.group; })[0];
		if (!G) { PE.toast("Select a group (or a layer inside one) first"); return; }
		var members = PE.descendants(G).filter(function (k) { return !PE.isGroup(k); }); if (!members.length) { PE.toast("This group has no layers in it"); return; }
		var gb = PE.groupBounds(G), cx0 = Math.floor(gb.x), cy0 = Math.floor(gb.y), cw = Math.max(1, Math.ceil(gb.x + gb.w) - cx0), ch = Math.max(1, Math.ceil(gb.y + gb.h) - cy0);
		var saved = PE.savedParams.groupExport || { fmt: "png", q: 90, area: "contents", fit: "fit", bg: "#ffffff", solid: false }, wrap = el("div", "pe-exp");
		var f = PE.form([{ k: "area", label: "Take from", help: "<p><b>The group's contents</b>: the smallest box around everything in the group (you can use any size below).</p><p><b>The whole canvas</b>: the full image area, with only this group showing.</p>", type: "seg", options: [["contents", "The group's contents"], ["canvas", "The whole canvas"]], val: saved.area },
			{ k: "w", label: "Canvas width", type: "number", min: 1, max: 12000, step: 1, val: cw }, { k: "h", label: "Canvas height", type: "number", min: 1, max: 12000, step: 1, val: ch },
			{ k: "fit", label: "Place the group", help: "<p><b>Fit</b>: scaled to fit inside, nothing cut off.</p><p><b>Fill</b>: scaled to cover the whole canvas, the edges may be cut off.</p><p><b>Actual size</b>: not scaled, centred.</p><p><b>Stretch</b>: squashed to the exact shape.</p>", type: "seg", options: [["fit", "Fit"], ["fill", "Fill"], ["none", "Actual size"], ["stretch", "Stretch"]], val: saved.fit },
			{ k: "solid", label: "Solid background", type: "check", val: saved.solid }, { k: "bg", label: "Background colour", type: "color", val: saved.bg },
			{ k: "fmt", label: "Format", type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }], function () { vis(); });
		wrap.appendChild(f.el); var info = el("p", "pe-hint2", "Exports only this group (" + members.length + " layer" + (members.length > 1 ? "s" : "") + ") as its own picture, on a canvas of the size you choose. Your document is not changed.");
		wrap.appendChild(info);
		var lastArea = saved.area;
		function vis() { var v = f.get(), F = I.FORMATS[v.fmt]; f.inputs.q.inp.closest(".pe-row").style.display = F.lossy ? "" : "none"; var sol = v.solid || !F.alpha; f.inputs.bg.inp.closest(".pe-row").style.display = sol ? "" : "none"; if (v.area !== lastArea) { lastArea = v.area; f.set("w", v.area === "canvas" ? d.w : cw); f.set("h", v.area === "canvas" ? d.h : ch); } }
		vis();
		function render(v) {
			var rx = v.area === "canvas" ? 0 : cx0, ry = v.area === "canvas" ? 0 : cy0, rw = v.area === "canvas" ? d.w : cw, rh = v.area === "canvas" ? d.h : ch;
			var chain = []; for (var g = G; g; g = d.layers.filter(function (k) { return k.id === g.group; })[0]) chain.push(g); var was = chain.map(function (k) { return k.visible; }); chain.forEach(function (k) { k.visible = true; }); PE.relink();
			var src = mk(rw, rh), sx = src.getContext("2d"); sx.imageSmoothingQuality = "high";
			try { d.layers.forEach(function (L) { if (members.indexOf(L) >= 0) PE.drawLayer(sx, L, [1, 0, 0, 1, -rx, -ry], "exp", rw, rh); }); } finally { chain.forEach(function (k, i) { k.visible = was[i]; }); }
			var W = Math.max(1, Math.min(12000, Math.round(v.w))), H = Math.max(1, Math.min(12000, Math.round(v.h))), out = mk(W, H), x = out.getContext("2d"), F = I.FORMATS[v.fmt];
			if (v.solid || !F.alpha) { x.fillStyle = v.bg; x.fillRect(0, 0, W, H); }
			x.imageSmoothingQuality = "high";
			if (v.fit === "stretch") x.drawImage(src, 0, 0, W, H); else { var k = v.fit === "none" ? 1 : v.fit === "fill" ? Math.max(W / rw, H / rh) : Math.min(W / rw, H / rh); x.drawImage(src, (W - rw * k) / 2, (H - rh * k) / 2, rw * k, rh * k); }
			return out;
		}
		PE.modal({ title: "Export group: " + G.name, body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download", primary: true, act: function (m) {
			var v = f.get(), F = I.FORMATS[v.fmt]; PE.savedParams.groupExport = v; render(v).toBlob(function (b) { if (!b || b.type !== F.mime) { PE.toast("This browser can't save " + F.name); return; } PE.download(b, I.cleanFileName(G.name || "group") + "." + F.ext); PE.toast("Saved"); m.close(); }, F.mime, v.q / 100); } }] });
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

	/* ---------- share as a link: Litterbox (up to 3 days) with an automatic fallback to the mes.fm 1-hour picture host ---------- */
	function shrinkJpeg(maxBytes) {   // a JPEG of the whole image that fits maxBytes (steps the quality, then the size, down)
		var scale = Math.min(1, 1600 / Math.max(PE.doc.w, PE.doc.h)), q = 0.88, tries = 0;
		return new Promise(function (res, rej) {
			(function step() { PE.exportBlob("jpg", q, { scale: scale, bg: "#ffffff" }).then(function (b) { if (b.size <= maxBytes) return res(b); if (++tries > 10) return rej(new Error("The picture is too big to shrink enough")); if (q > 0.55) q -= 0.1; else scale *= 0.8; step(); }).catch(rej); })();
		});
	}
	PE.dlgShare = function () {
		var d = PE.doc; if (!d) return;
		var wrap = el("div", "pe-exp"), f = PE.form([
			{ k: "host", label: "Send it to", help: "<p><b>Litterbox</b> is a free temporary file host (catbox.moe). It keeps the picture at full quality for the time you choose, up to 3 days.</p><p><b>mes.fm</b> keeps a smaller copy (a JPEG under 700 KB) for exactly 1 hour at a private link. It is the fallback if Litterbox is busy or down, and is deleted automatically.</p>", type: "select", options: [["lb", "Litterbox (up to 3 days, full quality)"], ["mes", "mes.fm (1 hour, shrunk to a small JPEG)"]], val: "lb" },
			{ k: "fmt", label: "Format", help: HELP_FMT, type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"]], val: "png" },
			{ k: "life", label: "Link lasts", help: "How long the link keeps working before the picture is deleted. Only for Litterbox: the mes.fm link always lasts 1 hour.", type: "select", options: [["1h", "1 hour"], ["12h", "12 hours"], ["24h", "1 day"], ["72h", "3 days"]], val: "72h" },
			{ k: "scale", label: "Size", help: "Shrinks the picture before it is uploaded. Smaller uploads faster and fails less often. 100% = the full image.", type: "range", min: 10, max: 100, step: 5, val: 100, unit: "%" }], null);
		wrap.appendChild(f.el);
		wrap.appendChild(el("p", "pe-hint2", "This uploads a copy of the whole image to a free temporary host and gives you a link. <b>Anyone who has the link can see the picture</b>, and it is deleted automatically when the time is up. MES does not keep it. Don't share anything private."));
		wrap.appendChild(el("p", "pe-hint2", "Want a link that never expires? <b>Copy for Snipboard</b> copies the picture and opens <b>snipboard.io</b>: click on that page and press Ctrl+V (Cmd+V on a Mac) and Snipboard gives you its own permanent link. Snipboard has no upload service we can call for you, so that last paste is yours."));
		var out = el("div", "pe-share-out"); wrap.appendChild(out);
		var busy = false, link = "";
		function show(url, note) {
			link = url; out.innerHTML = ""; var inp = el("input"); inp.type = "text"; inp.readOnly = true; inp.value = url; inp.style.cssText = "width:100%;margin-top:.6em"; inp.addEventListener("focus", function () { inp.select(); }); out.appendChild(inp); if (note) out.appendChild(el("p", "pe-hint2", esc(note))); inp.focus(); inp.select();
		}
		function viaLitterbox(v) {
			return PE.exportBlob(v.fmt, 0.92, { scale: v.scale / 100, bg: "#ffffff" }).then(function (b) {
				if (b.size > 190 * 1024 * 1024) throw new Error("Too big: choose a smaller size");
				var fd = new FormData(); fd.append("reqtype", "fileupload"); fd.append("time", v.life); fd.append("fileToUpload", b, "mes-photo." + (v.fmt === "jpg" ? "jpg" : "png"));
				return fetch("https://litterbox.catbox.moe/resources/internals/api.php", { method: "POST", body: fd });
			}).then(function (r) { return r.text().then(function (t) { if (!r.ok || !/^https:\/\//.test(t.trim())) throw new Error("Litterbox said " + r.status + (/^</.test(t.trim()) ? "" : ": " + t.trim().slice(0, 80))); return t.trim(); }); });
		}
		function viaMes() {
			return shrinkJpeg(650000).then(function (b) { return fetch("/api/image-temp", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: b }); })
				.then(function (r) { if (!r.ok) throw new Error("mes.fm said " + r.status); return r.json(); }).then(function (j) { if (!j || !j.url) throw new Error("mes.fm gave no link"); return j.url; });
		}
		var m = PE.modal({ title: "Share as a link", body: wrap, buttons: [{ label: "Close", act: function (m) { m.close(); } },
			{ label: "Copy link", act: function () { if (!link) { PE.toast("Upload first"); return; } (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { PE.toast("Link copied"); }).catch(function () { PE.toast("Select the link and press Ctrl+C"); }); } },
			{ label: "Copy for Snipboard", act: function () {
				var w = window.open("about:blank", "_blank"), v = f.get();   // opened inside the click so a pop-up blocker lets it through
				// the clipboard item is handed over as a PROMISE inside the click: browsers only allow the copy while the click still counts, and rendering a big image takes longer than that
				var png = PE.exportBlob("png", 0.92, { scale: v.scale / 100, bg: "#ffffff" }), done = false;
				try {
					navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(function () { done = true; PE.toast("Picture copied: press Ctrl/Cmd+V on the Snipboard page"); if (w) w.location.href = "https://snipboard.io/"; }, function () {
						if (w) w.location.href = "https://snipboard.io/"; PE.toast("The browser would not copy the picture. Use Export to download it, then drag it onto the Snipboard page.");
					});
				} catch (e) { if (w) w.location.href = "https://snipboard.io/"; PE.toast("This browser cannot copy pictures. Use Export, then drag the file onto the Snipboard page."); }
			} },
			{ label: "Upload and get link", primary: true, act: function () {
				if (busy) return; busy = true; var v = f.get(); out.textContent = "Uploading…";
				var first = v.host === "mes" ? viaMes() : viaLitterbox(v);
				first.catch(function (e) { if (v.host === "mes") throw e; out.textContent = "Litterbox did not accept it (" + (e && e.message ? e.message : "no answer") + "). Trying mes.fm instead…"; return viaMes().then(function (u) { u = { url: u }; return u; }); })
				.then(function (url) { busy = false; var fallback = typeof url === "object"; var u = fallback ? url.url : url; show(u, fallback ? "Litterbox failed, so this link is on mes.fm: a smaller JPEG that lasts 1 hour." : (v.host === "mes" ? "This link lasts 1 hour." : "")); navigator.clipboard && navigator.clipboard.writeText(u).then(function () { PE.toast("Link copied"); }).catch(function () {}); })
				.catch(function (e) { busy = false; out.textContent = "Couldn't upload: " + (e && e.message ? e.message : "the host did not answer") + ". Try a smaller size, or download the picture and use another site."; });
			} }] });
	};
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
				else if (v.result === "cut") { var x = L.canvas.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-in"; x.drawImage(mc, 0, 0); x.restore(); if (L.mask) { var mx = L.mask.getContext("2d"); } L.rev++; PE.markAi(L, "background removed"); PE.commit("Remove background (AI)"); }
				else { if (L.mask) { var ex = L.mask.getContext("2d"); ex.save(); ex.globalCompositeOperation = "destination-in"; ex.drawImage(mc, 0, 0); ex.restore(); } else L.mask = mc; L.editMask = true; L.rev++; PE.markAi(L, "background masked"); PE.commit("Remove background (AI)"); }
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
			rx.globalCompositeOperation = "destination-in"; rx.drawImage(sc, 0, 0); var lx2 = L.canvas.getContext("2d"); lx2.drawImage(res, wx, wy); L.rev++; PE.markAi(L, "object erased"); PE.commit("Erase object (AI)"); return true;
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
				if (cancelled) return; results.forEach(function (r) { r.L.canvas = r.c; if (r.m) r.L.mask = r.m; r.L.rev++; PE.markAi(r.L, "upscaled " + s + "×"); });
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

/* MES XCF (GIMP's native format), pure, runs in node too.
 * write: window.MESXcf.write({ w, h, layers: [{ name, x, y, w, h, data (RGBA Uint8 array), opacity 0-1, visible, mode (GIMP layer mode number) }] }) -> Uint8Array.
 *   Layers are given bottom-first (like the editor); the file lists them top-first. Format "gimp xcf file" (version 0): 32-bit pointers, 8-bit RGB(A), 64x64 tiles with no compression.
 *   GIMP 2.x and 3 open it. Layer masks, groups and text are not written (the editor flattens them into pixels first). Checked against the independent `gimpformats` Python reader.
 * read: window.MESXcf.read(arrayBuffer | Uint8Array, { inflate }) -> { w, h, version, base, precision, compression, layers (TOP-first, like the file), notes }
 *   Versions 0-26 (32-bit pointers up to v10, 64-bit from v11), RGB / grayscale / indexed with or without alpha, every precision (8/16/32-bit integer, 16/32/64-bit float,
 *   linear or gamma: converted to 8-bit sRGB), tiles uncompressed / RLE / zlib (own inflate, so it is synchronous and finds the end of the last tile itself),
 *   layer masks, groups (PROP_GROUP_ITEM + PROP_ITEM_PATH), text layers (pixels + the text from the gimp-text-layer parasite), offsets, opacity, visibility, modes.
 *   Layer: { name, x, y, w, h, data (RGBA Uint8ClampedArray, null for groups), opacity, visible, mode, blend (canvas op or null when the editor has no such mode),
 *   modeName, mask: { data (Uint8Array, w*h), w, h, x, y } | null, maskOff, group (true for groups), parent (index of the parent group in layers, or -1), text, effects, floating }.
 *   Anything it cannot use is listed in notes (never thrown), except a file that is not an XCF at all. Tests: node tool_apps_src/photo-editor-tests.js (real GIMP 3.2 files in tool_apps_src/photo-editor/xcf-fixtures/). */
(function (root) {
	"use strict";
	var MODES = { "source-over": 0, "multiply": 3, "screen": 4, "overlay": 5, "difference": 6, "darken": 9, "lighten": 10, "hue": 11, "saturation": 12, "color": 13, "luminosity": 14, "color-dodge": 16, "color-burn": 17, "hard-light": 18, "soft-light": 19 };
	function Writer() { this.b = new Uint8Array(1 << 16); this.n = 0; }
	Writer.prototype.need = function (k) { if (this.n + k > this.b.length) { var nb = new Uint8Array(Math.max(this.b.length * 2, this.n + k)); nb.set(this.b); this.b = nb; } };
	Writer.prototype.u8 = function (v) { this.need(1); this.b[this.n++] = v & 255; };
	Writer.prototype.u32 = function (v) { this.need(4); this.b[this.n++] = (v >>> 24) & 255; this.b[this.n++] = (v >>> 16) & 255; this.b[this.n++] = (v >>> 8) & 255; this.b[this.n++] = v & 255; };
	Writer.prototype.patch = function (at, v) { this.b[at] = (v >>> 24) & 255; this.b[at + 1] = (v >>> 16) & 255; this.b[at + 2] = (v >>> 8) & 255; this.b[at + 3] = v & 255; };
	Writer.prototype.bytes = function (arr) { this.need(arr.length); this.b.set(arr, this.n); this.n += arr.length; };
	Writer.prototype.str = function (s) { var e = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0x80) e.push(c); else if (c < 0x800) e.push(0xc0 | (c >> 6), 0x80 | (c & 63)); else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { var c2 = s.charCodeAt(++i), cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); e.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)); } else e.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); } e.push(0); this.u32(e.length); this.bytes(e); };   // GIMP strings: byte count incl. the NUL, then the bytes
	function prop(w, id, payload) { w.u32(id); w.u32(payload.length); w.bytes(payload); }
	function p32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
	function write(doc) {
		var w = new Writer(), layers = doc.layers.slice().reverse();
		w.bytes([103, 105, 109, 112, 32, 120, 99, 102, 32, 102, 105, 108, 101, 0]);   // "gimp xcf file\0"
		w.u32(doc.w); w.u32(doc.h); w.u32(0);                                          // size, RGB
		prop(w, 17, [0]);                                                               // PROP_COMPRESSION = none
		prop(w, 19, p32(0x43160000).concat(p32(0x43160000)));                          // PROP_RESOLUTION 150 x 150 dpi (floats)
		w.u32(0); w.u32(0);                                                             // PROP_END
		var ptrAt = w.n; layers.forEach(function () { w.u32(0); }); w.u32(0); w.u32(0); // layer pointers (patched), end of layers, end of channels
		layers.forEach(function (L, li) {
			w.patch(ptrAt + li * 4, w.n);
			w.u32(L.w); w.u32(L.h); w.u32(1); w.str(L.name || "Layer");               // type 1 = RGBA
			prop(w, 6, p32(Math.round(Math.max(0, Math.min(1, L.opacity == null ? 1 : L.opacity)) * 255)));
			prop(w, 8, p32(L.visible === false ? 0 : 1));
			prop(w, 7, p32(L.mode || 0));
			prop(w, 15, p32(L.x | 0).concat(p32(L.y | 0)));
			w.u32(0); w.u32(0);                                                         // PROP_END
			var hAt = w.n; w.u32(0); w.u32(0);                                          // hierarchy pointer, layer-mask pointer (none)
			w.patch(hAt, w.n);
			w.u32(L.w); w.u32(L.h); w.u32(4); var lvAt = w.n; w.u32(0); w.u32(0);       // hierarchy: size, bytes per pixel, pointer to level 0, end of levels
			w.patch(lvAt, w.n);
			var tx = Math.ceil(L.w / 64), ty = Math.ceil(L.h / 64), nt = tx * ty;
			w.u32(L.w); w.u32(L.h); var tAt = w.n; for (var t = 0; t < nt; t++) w.u32(0); w.u32(0);
			for (var j = 0; j < ty; j++) for (var i = 0; i < tx; i++) {
				w.patch(tAt + (j * tx + i) * 4, w.n);
				var x0 = i * 64, y0 = j * 64, tw = Math.min(64, L.w - x0), th = Math.min(64, L.h - y0), buf = new Uint8Array(tw * th * 4);
				for (var yy = 0; yy < th; yy++) { var so = ((y0 + yy) * L.w + x0) * 4; buf.set(L.data.subarray ? L.data.subarray(so, so + tw * 4) : L.data.slice(so, so + tw * 4), yy * tw * 4); }
				w.bytes(buf);
			}
		});
		return w.b.slice(0, w.n);
	}

	/* ================= reader ================= */
	/* zlib inflate (RFC 1950/1951), synchronous; stops at the end of the stream, so trailing bytes (the next tile) are fine. outLen = expected size (grows if needed) */
	var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258], LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
	var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577], DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
	var CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
	function huff(lengths, off, n) {
		var counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(n), i;
		for (i = 0; i < n; i++) counts[lengths[off + i]]++; counts[0] = 0;
		for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
		for (i = 0; i < n; i++) if (lengths[off + i]) syms[offs[lengths[off + i]]++] = i;
		return { c: counts, s: syms };
	}
	var FIXED = null;
	function fixedTables() {
		if (FIXED) return FIXED; var l = new Uint8Array(288), i; for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
		var d = new Uint8Array(30).fill(5); FIXED = { lt: huff(l, 0, 288), dt: huff(d, 0, 30) }; return FIXED;
	}
	function inflate(src, start, outLen) {
		var p = start || 0, end = src.length, bb = 0, bc = 0, out = new Uint8Array(Math.max(outLen || 0, 1024)), o = 0;
		function bits(n) { while (bc < n) { if (p >= end) throw new Error("zlib data ends early"); bb |= src[p++] << bc; bc += 8; } var v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v; }
		function sym(t) { var cur = 0, len = 0, sum = 0, c = t.c; do { if (bc === 0) { if (p >= end) throw new Error("zlib data ends early"); bb = src[p++]; bc = 8; } cur = 2 * cur + (bb & 1); bb >>>= 1; bc--; if (++len > 15) throw new Error("bad zlib code"); sum += c[len]; cur -= c[len]; } while (cur >= 0); return t.s[sum + cur]; }
		function need(k) { if (o + k <= out.length) return; var n2 = new Uint8Array(Math.max(out.length * 2, o + k)); n2.set(out.subarray(0, o)); out = n2; }
		var cmf = src[p], flg = src[p + 1]; if ((cmf & 15) !== 8 || ((cmf << 8) | flg) % 31) throw new Error("not zlib data"); p += 2; if (flg & 32) p += 4;
		var last;
		do {
			last = bits(1); var type = bits(2);
			if (type === 0) {
				bb = 0; bc = 0; if (p + 4 > end) throw new Error("zlib data ends early"); var len = src[p] | (src[p + 1] << 8); p += 4; if (p + len > end) throw new Error("zlib data ends early");
				need(len); out.set(src.subarray(p, p + len), o); o += len; p += len;
			} else if (type === 1 || type === 2) {
				var lt, dt;
				if (type === 1) { var f = fixedTables(); lt = f.lt; dt = f.dt; }
				else {
					var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4, cl = new Uint8Array(19), i;
					for (i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
					var ct = huff(cl, 0, 19), lens = new Uint8Array(hlit + hdist), k = 0;
					while (k < hlit + hdist) {
						var s = sym(ct);
						if (s < 16) lens[k++] = s;
						else { var rep, val = 0; if (s === 16) { if (!k) throw new Error("bad zlib lengths"); val = lens[k - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7); if (k + rep > hlit + hdist) throw new Error("bad zlib lengths"); while (rep--) lens[k++] = val; }
					}
					lt = huff(lens, 0, hlit); dt = huff(lens, hlit, hdist);
				}
				for (;;) {
					var c = sym(lt);
					if (c < 256) { need(1); out[o++] = c; }
					else if (c === 256) break;
					else {
						c -= 257; if (c >= 29) throw new Error("bad zlib length"); var ln = LBASE[c] + (LEXT[c] ? bits(LEXT[c]) : 0), dc = sym(dt); if (dc >= 30) throw new Error("bad zlib distance");
						var dist = DBASE[dc] + (DEXT[dc] ? bits(DEXT[dc]) : 0); if (dist > o) throw new Error("bad zlib distance"); need(ln);
						for (var q = 0; q < ln; q++, o++) out[o] = out[o - dist];
					}
				}
			} else throw new Error("bad zlib block");
		} while (!last);
		return out.length === o ? out : out.subarray(0, o);
	}

	/* GIMP layer modes -> canvas blend modes the editor has (null = no such mode here: drawn as Normal, and said in a note) */
	var BLEND = { 0: "source-over", 28: "source-over", 61: "source-over", 3: "multiply", 30: "multiply", 4: "screen", 31: "screen", 5: "soft-light", 23: "overlay", 6: "difference", 32: "difference",
		9: "darken", 35: "darken", 10: "lighten", 36: "lighten", 11: "hue", 37: "hue", 24: "hue", 12: "saturation", 38: "saturation", 25: "saturation", 13: "color", 39: "color", 26: "color",
		14: "luminosity", 40: "luminosity", 27: "luminosity", 56: "luminosity", 16: "color-dodge", 42: "color-dodge", 17: "color-burn", 43: "color-burn", 18: "hard-light", 44: "hard-light", 19: "soft-light", 45: "soft-light", 52: "exclusion" };
	var MODE_NAMES = ["Normal (legacy)", "Dissolve", "Behind", "Multiply (legacy)", "Screen (legacy)", "Overlay (old)", "Difference (legacy)", "Addition", "Subtract", "Darken only", "Lighten only", "Hue (HSV)", "Saturation (HSV)", "Color (HSL)", "Value (HSV)",
		"Divide", "Dodge", "Burn", "Hard light", "Soft light", "Grain extract", "Grain merge", "Color erase", "Overlay", "Hue (LCH)", "Chroma (LCH)", "Color (LCH)", "Lightness (LCH)", "Normal", "Behind", "Multiply", "Screen", "Difference",
		"Addition", "Subtract", "Darken only", "Lighten only", "Hue (HSV)", "Saturation (HSV)", "Color (HSL)", "Value (HSV)", "Divide", "Dodge", "Burn", "Hard light", "Soft light", "Grain extract", "Grain merge", "Vivid light", "Pin light",
		"Linear light", "Hard mix", "Exclusion", "Linear burn", "Luma darken only", "Luma lighten only", "Luminance", "Color erase", "Erase", "Merge", "Split", "Pass through"];

	/* precision field -> { b: bytes per component, f: float?, lin: linear light? } */
	function precisionOf(version, p) {
		if (version < 4) return { b: 1, f: false, lin: false, name: "8-bit" };
		var t;
		if (version === 4) t = [[1, 0, 0], [2, 0, 0], [4, 0, 1], [2, 1, 1], [4, 1, 1]][p];
		else if (version <= 6) t = { 100: [1, 0, 1], 150: [1, 0, 0], 200: [2, 0, 1], 250: [2, 0, 0], 300: [4, 0, 1], 350: [4, 0, 0], 400: [2, 1, 1], 450: [2, 1, 0], 500: [4, 1, 1], 550: [4, 1, 0] }[p];
		else { var base = Math.floor(p / 100); t = { 1: [1, 0], 2: [2, 0], 3: [4, 0], 5: [2, 1], 6: [4, 1], 7: [8, 1] }[base]; if (t) t = [t[0], t[1], p % 100 === 0 ? 1 : 0]; }
		if (!t) throw new Error("This GIMP file uses an unknown precision (" + p + ")");
		return { b: t[0], f: !!t[1], lin: !!t[2], name: (t[0] * 8) + "-bit " + (t[1] ? "float" : "integer") + (t[2] ? " linear" : "") };
	}
	var HALF = null, SRGB = null, SRGB_N = 16384;
	function halfTable() { if (HALF) return HALF; HALF = new Float32Array(65536); for (var h = 0; h < 65536; h++) { var s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; HALF[h] = e === 0 ? s * f * Math.pow(2, -24) : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * Math.pow(2, e - 15); } return HALF; }
	function srgbTable() { if (SRGB) return SRGB; SRGB = new Uint8Array(SRGB_N + 1); for (var i = 0; i <= SRGB_N; i++) { var v = i / SRGB_N; SRGB[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); } return SRGB; }

	function read(input, opts) {
		opts = opts || {};
		var u = input instanceof Uint8Array ? input : new Uint8Array(input.buffer ? input.buffer : input, input.byteOffset || 0, input.byteLength);
		var dv = new DataView(u.buffer, u.byteOffset, u.byteLength), N = u.length, notes = [], noteSet = {};
		function note(t, who) { if (!noteSet[t]) { noteSet[t] = []; notes.push(t); } if (who && noteSet[t].indexOf(who) < 0) noteSet[t].push(who); }   // one line per kind of problem, with the layers it concerns
		function chk(p, k) { if (p < 0 || p + k > N) throw new Error("The file ends early (damaged or not finished saving)"); }
		var magic = "gimp xcf "; if (N < 26) throw new Error("This is not a GIMP .xcf file"); for (var i = 0; i < 9; i++) if (u[i] !== magic.charCodeAt(i)) throw new Error(u[0] === 0x1f && u[1] === 0x8b ? "This is a compressed .xcf.gz / .xcfgz: unzip it first, or save it from GIMP as a plain .xcf" : "This is not a GIMP .xcf file");
		var tag = String.fromCharCode(u[9], u[10], u[11], u[12]), version;
		if (tag === "file") version = 0; else if (/^v\d{3}$/.test(tag)) version = parseInt(tag.slice(1), 10); else throw new Error("Unknown GIMP file version (" + tag + ")");
		if (version >= 100) throw new Error("This is a CinePaint file (XCF " + version + "), not supported");
		if (version > 26) note("Made by a newer GIMP (file version " + version + "): read as far as this editor understands it");
		var pos = 14, wide = version >= 11;
		function u32() { chk(pos, 4); var v = dv.getUint32(pos); pos += 4; return v; }
		function i32() { chk(pos, 4); var v = dv.getInt32(pos); pos += 4; return v; }
		function ptr() { if (!wide) return u32(); chk(pos, 8); var hi = dv.getUint32(pos), lo = dv.getUint32(pos + 4); pos += 8; return hi * 4294967296 + lo; }
		function str() { var n = u32(); if (!n) return ""; chk(pos, n); var b = u.subarray(pos, pos + n - (u[pos + n - 1] === 0 ? 1 : 0)); pos += n; return utf8(b); }
		function props(cb) {
			for (var guard = 0; guard < 100000; guard++) {
				var id = u32(), len = u32(); if (id === 0) return;
				if (id === 1) { var nc = u32(); chk(pos, nc * 3); cb(id, pos - 4, 4 + nc * 3, nc); pos += nc * 3; continue; }   // PROP_COLORMAP: the length word is wrong in some old files
				chk(pos, len); cb(id, pos, len); pos += len;
			}
			throw new Error("Damaged property list");
		}
		var W = u32(), Hh = u32(), base = u32(); if (!W || !Hh || W > 524288 || Hh > 524288) throw new Error("Damaged GIMP file (canvas " + W + " × " + Hh + ")");
		if (base > 2) throw new Error("Unknown colour mode in this GIMP file");
		var prec = precisionOf(version, version >= 4 ? u32() : 150), compression = 0, cmap = null;
		if (base === 2 && prec.b !== 1) throw new Error("Damaged GIMP file (indexed image with " + prec.name + ")");
		var little = prec.b > 1 && version >= 7 && version <= 11;   // development GIMP builds wrote high-bit data in host order (see the XCF spec)
		props(function (id, p, len, nc) {
			if (id === 17) compression = u[p];
			else if (id === 1 && base === 2) { cmap = new Uint8Array(768); cmap.set(u.subarray(p + 4, p + 4 + Math.min(nc, 256) * 3)); }
		});
		if (compression > 2) throw new Error("This GIMP file uses a compression this editor cannot read (" + compression + ")");
		if (base === 2 && !cmap) { note("Indexed image without a colour map: shown in grey"); cmap = new Uint8Array(768); for (var ci = 0; ci < 256; ci++) cmap[ci * 3] = cmap[ci * 3 + 1] = cmap[ci * 3 + 2] = ci; }
		var lptrs = []; for (var g = 0; g < 1e6; g++) { var lp = ptr(); if (!lp) break; lptrs.push(lp); }
		var chans = 0; try { while (ptr()) chans++; } catch (e) { /* channel list is not needed */ }
		if (chans) note(chans + " saved selection channel" + (chans === 1 ? " was" : "s were") + " left out");
		var srgb = prec.lin || prec.f ? srgbTable() : null;   // float GIMP images are usually linear too; gamma floats skip the curve below
		var half = prec.f && prec.b === 2 ? halfTable() : null;
		/* one component (0..1) at raw[o] */
		function comp(raw, o) {
			switch (prec.b) {
				case 2: { var h = little ? raw[o] | (raw[o + 1] << 8) : (raw[o] << 8) | raw[o + 1]; return half ? half[h] : h / 65535; }
				case 4: { var d4 = new DataView(raw.buffer, raw.byteOffset + o, 4); return prec.f ? d4.getFloat32(0, little) : d4.getUint32(0, little) / 4294967295; }
				case 8: { var d8 = new DataView(raw.buffer, raw.byteOffset + o, 8); return d8.getFloat64(0, little); }
			}
			return raw[o] / 255;
		}
		function to8(v, colour) { if (!(v > 0)) return 0; if (v >= 1) return 255; return colour && prec.lin ? srgb[Math.round(v * SRGB_N)] : Math.round(v * 255); }
		var lin8 = prec.b === 1 && prec.lin ? (function () { var t = new Uint8Array(256), s = srgbTable(); for (var k = 0; k < 256; k++) t[k] = s[Math.round(k / 255 * SRGB_N)]; return t; })() : null;

		/* the pixels of a hierarchy -> raw interleaved bytes (w*h*bpp), or null */
		function pixels(hptr, w, h, bppWant, what) {
			pos = hptr; var hw = u32(), hh = u32(), bpp = u32(), lev = ptr();
			if (hw !== w || hh !== h) throw new Error(what + ": size does not match");
			if (bpp !== bppWant) throw new Error(what + ": " + bpp + " bytes per pixel, expected " + bppWant);
			pos = lev; var lw = u32(), lh = u32(); if (lw !== w || lh !== h) throw new Error(what + ": level size does not match");
			var tx = Math.ceil(w / 64), ty = Math.ceil(h / 64), nt = tx * ty, tp = new Array(nt + 1);
			for (var t = 0; t < nt; t++) { tp[t] = ptr(); if (!tp[t]) throw new Error(what + ": missing tiles"); }
			tp[nt] = ptr() || 0;
			var raw = new Uint8Array(w * h * bpp);
			for (var j = 0; j < ty; j++) for (var i = 0; i < tx; i++) {
				var k = j * tx + i, x0 = i * 64, y0 = j * 64, tw = Math.min(64, w - x0), th = Math.min(64, h - y0), n = tw * th, size = n * bpp, tile, p = tp[k];
				chk(p, 1);
				if (compression === 0) { chk(p, size); tile = u.subarray(p, p + size); }
				else if (compression === 2) { var lim = k + 1 < nt ? Math.min(N, tp[k + 1] > p ? tp[k + 1] : N) : N; tile = (opts.inflate || inflate)(u.subarray(0, lim), p, size); if (tile.length < size) throw new Error(what + ": a tile is too short"); }
				else tile = rle(p, n, bpp);
				for (var yy = 0; yy < th; yy++) raw.set(tile.subarray(yy * tw * bpp, (yy + 1) * tw * bpp), ((y0 + yy) * w + x0) * bpp);
			}
			return raw;
		}
		function rle(p, n, bpp) {
			var out = new Uint8Array(n * bpp);
			for (var c = 0; c < bpp; c++) {
				var k = 0;
				while (k < n) {
					chk(p, 1); var op = u[p++], cnt, v;
					if (op <= 126) { cnt = op + 1; chk(p, 1); v = u[p++]; if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = v; }
					else if (op === 127) { chk(p, 3); cnt = (u[p] << 8) | u[p + 1]; v = u[p + 2]; p += 3; if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = v; }
					else if (op === 128) { chk(p, 2); cnt = (u[p] << 8) | u[p + 1]; p += 2; chk(p, cnt); if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = u[p++]; }
					else { cnt = 256 - op; chk(p, cnt); if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = u[p++]; }
				}
			}
			return out;
		}
		/* raw pixels of one layer -> RGBA 8-bit */
		function toRGBA(raw, w, h, type) {
			var nc = [3, 4, 1, 2, 1, 2][type], alpha = type & 1, out = new Uint8ClampedArray(w * h * 4), n = w * h, b = prec.b, step = nc * b, p, i, o;
			if (type >= 4) { for (p = 0, i = 0, o = 0; p < n; p++, i += step, o += 4) { var ix = raw[i] * 3; out[o] = cmap[ix]; out[o + 1] = cmap[ix + 1]; out[o + 2] = cmap[ix + 2]; out[o + 3] = alpha ? raw[i + 1] : 255; } return out; }
			var grey = type >= 2;
			if (b === 1) {
				for (p = 0, i = 0, o = 0; p < n; p++, i += step, o += 4) {
					var r = raw[i], gg = grey ? r : raw[i + 1], bl = grey ? r : raw[i + 2];
					if (lin8) { r = lin8[r]; gg = lin8[gg]; bl = lin8[bl]; }
					out[o] = r; out[o + 1] = gg; out[o + 2] = bl; out[o + 3] = alpha ? raw[i + nc - 1] : 255;
				}
				return out;
			}
			for (p = 0, i = 0, o = 0; p < n; p++, i += step, o += 4) {
				var r2 = to8(comp(raw, i), true); out[o] = r2;
				out[o + 1] = grey ? r2 : to8(comp(raw, i + b), true); out[o + 2] = grey ? r2 : to8(comp(raw, i + 2 * b), true);
				out[o + 3] = alpha ? to8(comp(raw, i + (nc - 1) * b), false) : 255;
			}
			return out;
		}
		function maskData(raw, w, h) { var n = w * h, out = new Uint8Array(n), b = prec.b; if (b === 1) return raw.length === n ? raw : raw.subarray(0, n); for (var p = 0; p < n; p++) out[p] = to8(comp(raw, p * b), false); return out; }
		function parasiteText(p, len) {
			var e = p + len, q = p, save = pos;
			try {
				while (q < e) { pos = q; var name = str(), flags = u32(), plen = u32(); q = pos + plen; if (q > e) break;
					if (name === "gimp-text-layer") { var s = utf8(u.subarray(pos, pos + plen)), m = /\(text\s+"((?:[^"\\]|\\.)*)"/.exec(s) || /\(markup\s+"((?:[^"\\]|\\.)*)"/.exec(s); pos = save; if (!m) return ""; return m[1].replace(/\\(.)/g, function (a, c) { return c === "n" ? "\n" : c; }).replace(/<[^>]*>/g, ""); } }
			} catch (x) { /* ignore a broken parasite */ }
			pos = save; return null;
		}

		var layers = [], byPath = {}, top = 0;   // top = position of the next top-level item (top-level items carry no PROP_ITEM_PATH)
		lptrs.forEach(function (lp, li) {
			var L = { name: "Layer", x: 0, y: 0, w: 0, h: 0, data: null, opacity: 1, visible: true, mode: 0, blend: "source-over", modeName: "Normal", mask: null, maskOff: false, group: false, parent: -1, text: null, effects: 0, floating: false, path: null };
			try {
				pos = lp; L.w = u32(); L.h = u32(); var type = u32(); L.name = str() || "Layer";
				var opa = null, fopa = null, applyMask = true, isText = false;
				props(function (id, p, len) {
					var v = len >= 4 ? dv.getUint32(p) : 0;
					switch (id) {
						case 5: L.floating = true; break;
						case 6: opa = v; break;
						case 7: L.mode = v; break;
						case 8: L.visible = v !== 0; break;
						case 11: applyMask = v !== 0; break;
						case 15: L.x = dv.getInt32(p); L.y = dv.getInt32(p + 4); break;
						case 21: { var tx = parasiteText(p, len); if (tx != null) { isText = true; L.text = tx; } break; }
						case 26: isText = true; break;
						case 29: L.group = true; break;
						case 30: { var path = []; for (var q = 0; q + 4 <= len; q += 4) path.push(dv.getUint32(p + q)); L.path = path; break; }
						case 33: if (len >= 4) fopa = dv.getFloat32(p); break;
					}
				});
				L.opacity = Math.max(0, Math.min(1, fopa != null && isFinite(fopa) ? fopa : opa != null ? opa / 255 : 1));
				var hptr = ptr(), mptr = ptr();
				if (version >= 20) { var ne = 0; for (var e = 0; e < 1000; e++) { var ep = ptr(); if (!ep) break; ne++; } L.effects = ne; }
				L.modeName = MODE_NAMES[L.mode] || ("Mode " + L.mode);
				if (!L.path || !L.path.length) L.path = [top]; if (L.path.length === 1) top = L.path[0] + 1;
				if (L.path.length > 1) { var pk = L.path.slice(0, -1).join(","); L.parent = byPath[pk] != null ? byPath[pk] : -1; }
				if (L.group) { byPath[L.path.join(",")] = layers.length; L.blend = null; if (mptr) note("Masks on layer groups are not supported: left out", L.name); if (L.mode !== 61 && L.mode !== 0 && L.mode !== 28) note("Group blend modes are not supported: groups are drawn as pass-through", L.name); }
				else {
					if (type > 5 || [0, 0, 2, 2, 4, 4][type] !== base * 2) throw new Error("its colour type does not match the image");
					if (!L.w || !L.h) throw new Error("it is empty");
					if (L.w * L.h > 268435456) throw new Error("it is too large (" + L.w + " × " + L.h + ")");
					var nc = [3, 4, 1, 2, 1, 2][type];
					L.data = toRGBA(pixels(hptr, L.w, L.h, nc * prec.b, "Layer “" + L.name + "”"), L.w, L.h, type);
					L.blend = BLEND[L.mode] !== undefined ? BLEND[L.mode] : null;
					if (L.blend === null) note("Layer mode “" + L.modeName + "” is not in this editor: drawn as Normal", L.name);
					if (L.mode === 5) note("“Overlay (old)” layers from old GIMP files look like Soft light, so they open as Soft light", L.name);
					if (isText) { note("Text layers became pixels, named after their text", L.name); if (L.text && (!L.name || L.name === "Layer")) L.name = L.text.slice(0, 80); }
					if (L.effects) note("GIMP live filters (effects) are not applied: those layers show their pixels without them", L.name);
					if (L.floating) note("A floating selection opened as a normal layer", L.name);
					if (mptr) {
						pos = mptr; var mw = u32(), mh = u32(); str(); props(function () {}); var mh2 = ptr();
						if (mw !== L.w || mh !== L.h) note("A layer mask with the wrong size was left out", L.name);
						else if (!applyMask) { note("Disabled layer masks were left out", L.name); L.maskOff = true; }
						else L.mask = { data: maskData(pixels(mh2, mw, mh, prec.b, "Mask of “" + L.name + "”"), mw, mh), w: mw, h: mh };
					}
				}
				layers.push(L);
			} catch (err) {
				note("Layer " + (li + 1) + (L.name && L.name !== "Layer" ? " (“" + L.name + "”)" : "") + " could not be read: " + (err && err.message || err));
				if (L.group && L.path) { byPath[L.path.join(",")] = layers.length; L.data = null; layers.push(L); }
			}
		});
		notes = notes.map(function (t) { var w = noteSet[t]; return w.length ? t + " (" + w.slice(0, 4).join(", ") + (w.length > 4 ? " and " + (w.length - 4) + " more" : "") + ")" : t; });
		return { w: W, h: Hh, version: version, base: ["RGB", "Grayscale", "Indexed"][base], precision: prec.name, compression: ["none", "RLE", "zlib"][compression], layers: layers, notes: notes };
	}
	function utf8(b) {
		if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(b);
		var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
	}

	root.MESXcf = { write: write, read: read, inflate: inflate, MODES: MODES, BLEND: BLEND, MODE_NAMES: MODE_NAMES };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESXcf;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Photo Editor: GIMP (.xcf) export, and File -> "Files and folders": where each layer came from, the autosave in this browser, and a folder on this computer
 * (File System Access API: Chrome and Edge on a computer, Brave only after brave://flags/#file-system-access-api; elsewhere a read-only folder through <input webkitdirectory>). */
(function () {
	"use strict";
	var PE = window.PE, X = window.MESXcf, P = window.MESPixel, I = window.MESImg, el = PE.el, esc = PE.esc;

	/* ---------- save as GIMP ---------- */
	PE.saveXcf = function () {
		var d = PE.doc; if (!d) { PE.toast("Open or create an image first"); return; } PE.relink();
		var out = [], skipped = 0;
		d.layers.forEach(function (L) {
			if (PE.isGroup(L)) return; var b = PE.bounds(L), fr = PE.fxReach ? PE.fxReach(L) : 0; b = { x: b.x - fr, y: b.y - fr, w: b.w + fr * 2, h: b.h + fr * 2 }; var x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y)), x1 = Math.min(d.w, Math.ceil(b.x + b.w)), y1 = Math.min(d.h, Math.ceil(b.y + b.h));
			if (x1 <= x0 || y1 <= y0) { skipped++; return; }
			var w = x1 - x0, h = y1 - y0, c = PE.mk(w, h), x = c.getContext("2d");
			PE.drawLayer(x, Object.assign({}, L, { _p: null, opacity: 1, blend: "source-over", visible: true }), [1, 0, 0, 1, -x0, -y0], "xcf", w, h);
			var id = x.getImageData(0, 0, w, h); out.push({ name: L.name, x: x0, y: y0, w: w, h: h, data: new Uint8Array(id.data.buffer), opacity: L.opacity, visible: PE.effVisible(L), mode: X.MODES[L.blend] || 0 });
		});
		if (!out.length) { PE.toast("Nothing to save: every layer is outside the canvas"); return; }
		var bytes = X.write({ w: d.w, h: d.h, layers: out });
		PE.download(new Blob([bytes], { type: "image/x-xcf" }), window.MESImg.cleanFileName(d.name) + ".xcf"); PE.toast("Saved a GIMP file with " + out.length + " layer" + (out.length === 1 ? "" : "s") + (skipped ? " (" + skipped + " outside the canvas skipped)" : "") + ". Text became pixels; groups and masks are flattened.");
	};

	/* ---------- open a GIMP file: layers, groups, masks, offsets, opacity, modes (MESXcf.read). place = add into the open image as a group named after the file ---------- */
	PE.loadXcf = function (buf, name, meta, place) {
		var r; try { r = X.read(buf); } catch (e) { PE.toast("Can't open " + name + ": " + (e && e.message || e)); return false; }
		var notes = r.notes.slice(), d, made = [], skipped = 0;
		if (place && PE.doc) d = PE.doc; else { if (!PE.newDoc(r.w, r.h, null, I.baseName(name))) return false; d = PE.doc; d.layers = []; d.file = PE.mkSrc(Object.assign({ file: name }, meta || {}, { how: "xcf" })); }
		var src = PE.mkSrc(Object.assign({}, meta || {}, { how: "xcf", file: name }));
		r.layers.forEach(function (n) {   // top-first, like the file
			var L;
			if (n.group) { L = PE.makeGroup(n.name); L.collapsed = true; }
			else {
				if (!n.data || n.w > PE.MAXPX || n.h > PE.MAXPX || n.w * n.h > PE.MAXAREA) { if (n.data) { skipped++; notes.push("“" + n.name + "” is too large for a browser (" + n.w + " × " + n.h + "): left out"); } made.push(null); return; }
				var c = PE.mk(n.w, n.h); c.getContext("2d").putImageData(new ImageData(n.data, n.w, n.h), 0, 0);
				L = PE.makeLayer({ canvas: c, name: n.name, x: n.x, y: n.y, src: Object.assign({}, src, { w: n.w, h: n.h }) });
				L.blend = n.blend || "source-over";
				if (n.mask) { var mc = PE.mk(n.w, n.h), mx = mc.getContext("2d"), id = mx.createImageData(n.w, n.h), a = id.data, m = n.mask.data; for (var i = 0; i < m.length; i++) a[i * 4 + 3] = m[i]; mx.putImageData(id, 0, 0); L.mask = mc; }
			}
			L.visible = n.visible; L.opacity = n.opacity; made.push(L);
		});
		r.layers.forEach(function (n, i) { var L = made[i]; if (!L) return; var p = n.parent >= 0 ? made[n.parent] : null; L.group = p ? p.id : null; });
		var list = made.filter(Boolean).reverse();   // the editor keeps layers bottom-first, a group's header after its members
		if (!list.some(function (L) { return !PE.isGroup(L); })) { if (!place) { d.layers.push(PE.makeLayer({ name: "Layer 1" })); d.activeId = d.layers[0].id; PE.commit("Open GIMP file"); PE.fit(); PE.emit("docsize"); } PE.toast("No layers could be read from " + name + (notes.length ? ": " + notes[0] : "")); return false; }
		if (place) {
			var G = PE.makeGroup(I.baseName(name)); G.collapsed = true;   // the file becomes one group on top of everything, outside any other group
			list.forEach(function (L) { if (L.group == null) L.group = G.id; }); list.push(G);
			Array.prototype.push.apply(d.layers, list); d.activeId = G.id; PE.relink(); PE.commit("Add GIMP file " + name); PE.emit("layers"); PE.invalidate();
		} else {
			d.layers = list; d.activeId = list[list.length - 1].id; PE.relink(); PE.commit("Open GIMP file"); PE.dirty = false; PE.fit(); PE.emit("docsize"); PE.emit("layers");
		}
		PE.setTool("move");
		var nl = list.filter(function (L) { return !PE.isGroup(L); }).length, ng = list.length - nl - (place ? 1 : 0);
		var msg = (place ? "Added " : "Opened ") + nl + " layer" + (nl === 1 ? "" : "s") + (ng ? " and " + ng + " group" + (ng === 1 ? "" : "s") : "") + " from the GIMP file" + (r.precision.indexOf("8-bit") !== 0 || / linear/.test(r.precision) ? " (" + r.precision + ", shown in 8-bit)" : "");
		var info = notes.filter(function (t) { return /^Text layers/.test(t); }); notes = notes.filter(function (t) { return info.indexOf(t) < 0; });
		if (info.length) msg += ". Text layers are now pixels (the text is the layer name)";
		if (!notes.length) { PE.toast(msg); return true; }
		var w = el("div", "pe-xcf-notes"); w.innerHTML = "<p>" + esc(msg) + ". A few things in it work differently here:</p><ul>" + notes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
		PE.modal({ title: "Opened “" + name + "”", body: w, buttons: [{ label: "OK", primary: true, act: function (m) { m.close(); } }] });
		return true;
	};

	/* ---------- files and folders ---------- */
	var IMG = /\.(png|jpe?g|webp|gif|bmp|avif|psd|xcf|mesproj|zip)$/i, BRAVE_FLAG = "brave://flags/#file-system-access-api", dirHandle = null, roFiles = null, roName = "";
	var handles = PE.srcHandles = {}, hseq = 0;   // memory only: file handles of pictures added from the connected folder (a handle cannot go into a project file)
	function canFS() { return typeof window.showDirectoryPicker === "function"; }
	function isBrave() { return !!(navigator.brave && typeof navigator.brave.isBrave === "function"); }
	function isMobile() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || "")); }
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; Promise.resolve(fn(db.transaction("kv", "readwrite").objectStore("kv"))).then(res, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function rq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function perm(h, write, ask) { var o = { mode: write ? "readwrite" : "read" }; if (!h || !h.queryPermission) return Promise.resolve("granted"); return h.queryPermission(o).then(function (p) { return p === "granted" || !ask ? p : h.requestPermission(o); }); }
	function permText(p) { return p === "granted" ? "the editor can open and save files there" : p === "prompt" ? "the browser will ask again before the editor saves there" : "the browser blocks saving there"; }
	function errText(x) { return x && x.message ? x.message : String(x); }
	function namesIn(dir) { return (async function () { var used = {}; for await (var k of dir.keys()) used[String(k).toLowerCase()] = 1; return used; })(); }
	function writeFile(dir, name, blob) { return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }, function (e) { try { w.abort(); } catch (x) {} throw e; }); }).then(function () { return fh; }); }); }
	function regHandle(fh, dir) { var k = "h" + (++hseq); handles[k] = { fh: fh, dir: dir, name: fh.name, dirName: dir ? dir.name : "" }; return k; }
	/* a layer's provenance, with the live location of a picture that was moved since it was added */
	function srcOf(s) { var h = s && s.hk && handles[s.hk]; return h ? Object.assign({}, s, { dir: h.dirName, file: h.name }) : s; }
	function retarget(hk, dirName, fileName) { var d = PE.doc; if (!d) return; var fix = function (s) { return s && s.hk === hk ? Object.assign({}, s, { dir: dirName, file: fileName }) : s; }; d.layers.forEach(function (L) { L.src = fix(L.src); }); d.file = fix(d.file); }
	/* move = FileSystemHandle.move() when the browser has it for files on disk, else copy, check the size, then remove the original */
	function moveOne(fh, src, target, name, newName) {
		var copy = function () { return fh.getFile().then(function (f) { return writeFile(target, newName, f).then(function (nfh) { return nfh.getFile().then(function (c) { if (c.size !== f.size) throw new Error("the copy in “" + target.name + "” is incomplete, so the original was kept"); return src.removeEntry(name); }).then(function () { return nfh; }); }); }); };
		if (typeof fh.move !== "function") return copy();
		return fh.move(target, newName).then(function () { return fh; }, function () { return src.getFileHandle(name).then(copy, function () { return target.getFileHandle(newName); }); });
	}
	function thumbOf(L, n) { var c = PE.mk(n, n), x = c.getContext("2d"), w = L.canvas.width, h = L.canvas.height, s = Math.min(n / w, n / h); x.fillStyle = "#4a4a55"; x.fillRect(0, 0, n, n); x.fillStyle = "#6a6a76"; for (var i = 0; i < n; i += 6) for (var j = 0; j < n; j += 6) if (((i + j) / 6) % 2 === 0) x.fillRect(i, j, 6, 6); x.drawImage(L.canvas, (n - w * s) / 2, (n - h * s) / 2, w * s, h * s); c.className = "pe-fx-th"; return c; }
	function btn(t, title) { var b = el("button", "pe-btn pe-btn--sm", esc(t)); b.type = "button"; if (title) b.title = title; return b; }

	/* ---------- folder-access reminder: a chip in the status bar while this site can change files in a folder ----------
	 * The page reaches a folder only through its handle (kept in memory while connected, and in IndexedDB "dir" so Reconnect works next time).
	 * Disconnect drops both, so the editor can no longer reach the folder at all; the browser's own permission entry is removed in its site settings. */
	var folderListeners = []; PE.on("folder", function () { folderListeners = folderListeners.filter(function (f) { return f() !== false; }); });
	var remembered = null, chip = null;   // remembered = the stored handle when the browser still grants write access to it without asking
	var REVOKE = "In Brave or Chrome you can also remove it there: click the icon left of the address (lock or sliders) › Site settings › File editing (or the folder listed in that pop-up).";
	function accessName() { return dirHandle ? dirHandle.name : remembered ? remembered.name : ""; }
	function drawChip() {
		var st = document.querySelector("#pe .pe-status"); if (!st) return; var nm = accessName();
		if (!nm) { if (chip) chip.hidden = true; return; }
		if (!chip) {
			chip = el("span", "pe-fchip"); chip.setAttribute("role", "status"); st.insertBefore(chip, st.firstChild);
			chip.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"); if (!b) return; if (b.dataset.a === "off") PE.disconnectFolder(); else PE.dlgFolder("folder"); });
		}
		chip.hidden = false; chip.title = "This site can open and change files in “" + nm + "” while folder access is on. " + REVOKE;
		chip.innerHTML = '<button type="button" class="pe-fchip-n" data-a="open">📁 Folder access: <b>' + esc(nm) + '</b></button><span aria-hidden="true">·</span><button type="button" class="pe-fchip-x" data-a="off">Disconnect</button>';
	}
	PE.folderAccess = function () { return accessName(); };
	PE.folderHandle = function () { return dirHandle || remembered || null; };   // the connected folder (for Save as / Open pickers to start in, and to show a project file's folder)
	PE.disconnectFolder = function () {
		var nm = accessName(); dirHandle = null; remembered = null; roFiles = null; for (var k in handles) delete handles[k];
		idb(function (st) { return rq(st.delete("dir")); }).catch(function () {}).then(function () { drawChip(); PE.emit("folder"); PE.toast(nm ? "Disconnected “" + nm + "”: the editor can no longer open or change files there" : "No folder is connected"); });
	};
	/* on load: a folder from an earlier visit that the browser still lets the page write to (Chrome's "Allow on every visit") gets the chip too */
	if (canFS()) setTimeout(function () {
		idb(function (st) { return rq(st.get("dir")); }).then(function (h) { if (!h || dirHandle) return; return perm(h, true, false).then(function (p) { if (p === "granted" && !dirHandle) { remembered = h; drawChip(); } }); }).catch(function () {});
	}, 400);

	/* focus: "folder" scrolls to the folder section, anything else opens at the top ("Where your images are") */
	PE.dlgFolder = function (focus) {
		var wrap = el("div", "pe-fx"), token = 0, entries = [], stored = null;
		function sec(title, help) { var s = el("section", "pe-fx-sec"), h = el("h3", "pe-fx-h", esc(title)); if (help) h.appendChild(PE.helpBtn(title, esc(help))); s.appendChild(h); wrap.appendChild(s); return s; }

		/* 1. where the images are */
		var sW = sec("Where your images are"), docP = el("p", "pe-fx-doc"), list = el("div", "pe-fx-list");
		sW.appendChild(el("p", "pe-hint2", "Browsers never show where a file is on your disk (its full path), only its name, and for a connected folder the folder's name. This is everything the editor knows about the open image:"));
		sW.appendChild(docP); sW.appendChild(list);
		function drawWhere() {
			var d = PE.doc; list.innerHTML = ""; if (!d) { docP.textContent = "No image is open."; return; }
			var f = d.file ? P.describeSource(srcOf(d.file)) : null;
			docP.innerHTML = "<b>This image</b>: " + esc(d.name) + " · " + d.w + " × " + d.h + " px · " + esc(f ? f.text : "Made in the editor (New image)");
			var rows = d.layers.slice().reverse().filter(function (L) { return !PE.isGroup(L); }), shown = rows.slice(0, 80); PE.relink();
			shown.forEach(function (L) {
				var s = srcOf(L.src), info = P.describeSource(s), r = el("div", "pe-fx-row"), m = el("div", "pe-fx-m"), grp = PE.ancestorsOf(L).map(function (g) { return g.name; }).reverse().join(" › ");
				r.appendChild(thumbOf(L, 34));
				m.innerHTML = '<b class="pe-fx-n">' + esc(L.name) + "</b>" + (grp ? '<span class="pe-fx-g">in ' + esc(grp) + "</span>" : "") + '<span class="pe-fx-from pe-fx-from--' + info.how + '">' + esc(info.text) + '</span><span class="pe-fx-px">' + L.canvas.width + " × " + L.canvas.height + " px" + (s && s.w && (s.w !== L.canvas.width || s.h !== L.canvas.height) ? " (the file: " + s.w + " × " + s.h + ")" : "") + (L.type === "text" ? " · text layer" : L.eq ? " · equation" : "") + "</span>";
				r.appendChild(m);
				var h = s && s.hk && handles[s.hk];
				if (h && canFS()) { var b = btn("Move to another folder…", "Move the file " + h.name + " out of “" + h.dirName + "” into a folder you choose (you confirm first)"); b.addEventListener("click", function () { moveFile(s.hk, b); }); r.appendChild(b); }
				list.appendChild(r);
			});
			if (!rows.length) list.appendChild(el("p", "pe-hint2", "No layers."));
			if (rows.length > shown.length) list.appendChild(el("p", "pe-hint2", "…and " + (rows.length - shown.length) + " more layers."));
		}

		/* 2. a folder on this computer */
		var sF = sec("Folder on this computer", "Connect a folder and the editor lists its pictures. Click one to add it as a layer (or to open it, if nothing is open); Shift-click opens it as a new image. Nothing is uploaded: the editor reads the files straight from your disk, and only with the permission you give in the browser's pop-up.");
		var stP = el("p", "pe-fx-st"), note = el("div", "pe-fx-note"), bar = el("div", "pe-fold-h"), saveRow = el("div", "pe-fx-save"), search = el("input", "pe-fold-s"), msg = el("p", "pe-hint2"), grid = el("div", "pe-fold-g");
		var acc = el("div", "pe-fx-acc"); acc.hidden = true; acc.setAttribute("role", "note");
		function drawAccess(name) {   // the calm reminder of what "connected" allows, and how to switch it off
			if (!name) { acc.hidden = true; return; } acc.hidden = false;
			acc.innerHTML = "<b>🔓 Folder access is on for “" + esc(name) + "”.</b> While it is, this site can read and change files in that folder (and its subfolders); the editor only writes when you press Save or Move. "
				+ "Turn it off with <i>Disconnect</i>, which forgets the folder here. " + esc(REVOKE) + " <span class=\"pe-fx-tip\">Tip: connect a dedicated folder (say, <i>Thumbnails</i>) rather than your whole OneDrive or Documents.</span> ";
			var off = btn("Disconnect", "Forget this folder: the editor can no longer open or change files in it"); off.addEventListener("click", function () { PE.disconnectFolder(); }); acc.appendChild(off);
		}
		var offL = function () { if (!wrap.isConnected) return false; stored = null; entries = []; grid.innerHTML = ""; msg.textContent = canFS() ? "Choose a folder to see its pictures." : ""; drawAccess(""); refreshState(); drawWhere(); };
		folderListeners.push(offL);
		search.type = "search"; search.placeholder = "Filter by name…"; search.setAttribute("aria-label", "Filter pictures by name");
		var bPick = btn("📂 Choose a folder…", "Pick a folder; the browser asks whether the editor may see and save files in it"), bAgain = btn("↺ Reconnect", "Use the folder from last time again (the browser asks for permission once more)"), bRo = btn("📂 Open a folder (read only)…", "List the pictures of a folder. This browser cannot save into it: saving goes to your Downloads folder"), roInp = el("input");
		roInp.type = "file"; roInp.multiple = true; roInp.setAttribute("webkitdirectory", ""); roInp.hidden = true; roInp.setAttribute("aria-hidden", "true"); bAgain.hidden = true;
		var nameIn = el("input"), kind = el("select"), bSave = btn("⬇ Save"), saveHint = el("p", "pe-hint2");
		nameIn.type = "text"; nameIn.value = PE.doc ? PE.doc.name : "image"; nameIn.setAttribute("aria-label", "File name"); nameIn.spellcheck = false; kind.setAttribute("aria-label", "Save as");
		kind.innerHTML = '<option value="png">PNG picture (flattened)</option><option value="proj">Project .mesproj (keeps layers; it is a ZIP)</option>';
		saveRow.appendChild(el("span", "pe-fx-l", "Save this image as")); saveRow.appendChild(nameIn); saveRow.appendChild(kind); saveRow.appendChild(bSave);
		if (canFS()) { bar.appendChild(bPick); bar.appendChild(bAgain); note.hidden = true; }
		else {
			note.innerHTML = (isBrave() ? "<b>Brave has folder access switched off.</b> To switch it on, copy <code>" + BRAVE_FLAG + "</code> into the address bar, set <i>File System Access API</i> to <i>Enabled</i> and press <i>Relaunch</i>. Then this window can open, save and move files in a folder."
				: isMobile() ? "<b>Phones and tablets cannot connect a folder</b> to a web page. On a computer, Chrome and Edge can (Brave after switching it on)."
				: "<b>This browser cannot connect a folder.</b> Chrome and Edge on a computer can, and Brave after switching on <code>" + BRAVE_FLAG + "</code>. Safari and Firefox cannot.")
				+ " You can still open a folder read only: its pictures are listed below and can be added as layers, but saving goes to your Downloads folder.";
			if (isBrave()) { var bCopy = btn("Copy the address", "Copies " + BRAVE_FLAG + " so you can paste it into Brave's address bar"); bCopy.addEventListener("click", function () { var fail = function () { window.prompt("Copy this address:", BRAVE_FLAG); }; try { navigator.clipboard.writeText(BRAVE_FLAG).then(function () { PE.toast("Copied. Paste it into the address bar"); }, fail); } catch (x) { fail(); } }); note.appendChild(document.createTextNode(" ")); note.appendChild(bCopy); }
			bar.appendChild(bRo); bar.appendChild(roInp);
		}
		[stP, acc, note, bar, saveRow, saveHint, search, msg, grid].forEach(function (x) { sF.appendChild(x); });

		function refreshState() {
			if (canFS()) {
				bPick.textContent = dirHandle ? "📂 Choose another folder…" : "📂 Choose a folder…"; bAgain.hidden = !(stored && !dirHandle); if (stored) bAgain.textContent = "↺ Reconnect to “" + stored.name + "”";
				bSave.textContent = dirHandle ? "⬇ Save into “" + dirHandle.name + "”" : "⬇ Save into a folder…"; saveHint.textContent = dirHandle ? "If a file with that name is already there, you are asked before it is replaced." : "You pick the folder first.";
				if (dirHandle) { var h = dirHandle; perm(h, true, false).then(function (p) { if (h === dirHandle) { stP.innerHTML = "Connected: <b>“" + esc(h.name) + "”</b> · " + esc(permText(p)) + "."; drawAccess(p === "granted" ? h.name : ""); } }).catch(function () {}); }
				else { stP.textContent = remembered ? "“" + remembered.name + "” from last time is not listed yet (press Reconnect), but the browser still lets this site use it." : "No folder is connected." + (stored ? " Last time it was “" + stored.name + "”." : ""); drawAccess(remembered ? remembered.name : ""); }
			} else {
				stP.textContent = roFiles ? "Open read only: “" + roName + "”, " + roFiles.length + " picture" + (roFiles.length === 1 ? "" : "s") + " (subfolders included)." : ""; stP.hidden = !roFiles;
				bSave.textContent = "⬇ Download"; saveHint.textContent = "This browser cannot write into a folder, so the file goes to your Downloads folder.";
			}
		}
		function count(name, n) { msg.textContent = n + " picture" + (n === 1 ? "" : "s") + " in “" + name + "”" + (n > 400 ? " (showing the first 400: use the filter)" : "") + (n ? ". Click: add as a layer · Shift-click: open as a new image." : "."); }
		function roEntries() { return roFiles.map(function (f) { var rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name; return { name: f.name, label: rel, file: function () { return Promise.resolve(f); } }; }); }
		function load(h) {
			dirHandle = h; remembered = null; drawChip(); roFiles = null; var my = ++token; entries = []; grid.innerHTML = ""; msg.textContent = "Reading “" + h.name + "”…"; refreshState();
			(async function () { var out = []; try { var nd = 0; for await (var e of h.values()) { if (e.kind === "file" && IMG.test(e.name)) out.push(e); else if (e.kind === "directory" && nd++ < 300 && !/^(\.|__MACOSX)/.test(e.name)) { try { await e.getFileHandle("project.json"); out.push(e); } catch (x2) { } } } } catch (x) { if (my === token) msg.textContent = "Could not read the folder: " + errText(x); return; }
				if (my !== token) return; out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }); entries = out.map(function (fh) { return fh.kind === "directory" ? { name: fh.name, label: fh.name + " (project folder)", dirProj: fh, file: function () { return Promise.reject(new Error("a folder")); } } : { name: fh.name, label: fh.name, fh: fh, file: function () { return fh.getFile(); } }; }); count(h.name, entries.length); render(); })();
		}
		function render() {
			var q = search.value.trim().toLowerCase(), shown = entries.filter(function (e) { return !q || e.label.toLowerCase().indexOf(q) >= 0; }).slice(0, 400); grid.innerHTML = "";
			var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { io.unobserve(x.target); x.target._load(); } }); }, { root: grid, rootMargin: "200px" }) : null;
			shown.forEach(function (e) {
				var t = el("button", "pe-fold-t"), c = el("canvas"), n = el("span", "pe-fold-n", esc(e.label)); t.type = "button"; c.width = 120; c.height = 90; t.appendChild(c); t.appendChild(n); t.title = e.label + " · click: add as a layer · Shift-click: open as a new image";
				t._load = function () { if (e.dirProj) { var xd = c.getContext("2d"); xd.fillStyle = "#2b2540"; xd.fillRect(0, 0, 120, 90); xd.font = "34px sans-serif"; xd.textAlign = "center"; xd.fillText("📁", 60, 48); xd.fillStyle = "#c4b5fd"; xd.font = "bold 12px sans-serif"; xd.fillText("PROJECT", 60, 74); return; }
					if (/\.(psd|xcf|mesproj|zip)$/i.test(e.name)) { var x = c.getContext("2d"); x.fillStyle = "#26262e"; x.fillRect(0, 0, 120, 90); x.fillStyle = "#9b9bab"; x.font = "bold 14px sans-serif"; x.textAlign = "center"; x.fillText(e.name.split(".").pop().toUpperCase(), 60, 50); return; }
					e.file().then(function (f) { return createImageBitmap(f, { resizeWidth: 120, resizeQuality: "medium" }).catch(function () { return PE.decodeFile(f); }); }).then(function (im) { var x = c.getContext("2d"), w = im.width || im.naturalWidth, h = im.height || im.naturalHeight, s = Math.min(120 / w, 90 / h); x.drawImage(im, (120 - w * s) / 2, (90 - h * s) / 2, w * s, h * s); }).catch(function () { n.textContent = "⚠ " + e.label; }); };
				if (io) io.observe(t); else t._load();
				if (e.dirProj) t.title = e.name + " · an unzipped project (project.json + layer PNGs): click to open it; Save then writes back into this folder";
				t.addEventListener("click", function (ev) { if (e.dirProj) { m.close(); PE.openFolderHandle(e.dirProj, "folder").catch(function (x) { PE.toast("Could not open " + e.name + ": " + errText(x)); }); return; } var o = { place: !!PE.doc && !ev.shiftKey }; if (e.fh) { o.how = "folder"; o.dir = dirHandle ? dirHandle.name : ""; o.hk = regHandle(e.fh, dirHandle); o.fh = e.fh; } else { o.how = "folder-ro"; o.dir = roName; }
					e.file().then(function (f) { PE.openFiles([f], o); m.close(); }).catch(function (x) { PE.toast("Could not open " + e.name + ": " + errText(x)); }); });
				grid.appendChild(t);
			});
		}
		search.addEventListener("input", render);
		bPick.addEventListener("click", function () { window.showDirectoryPicker({ id: "mes-photo-folder", mode: "readwrite" }).then(function (h) { stored = h; idb(function (st) { return rq(st.put(h, "dir")); }).catch(function () {}); load(h); }).catch(function (x) { if (!x || x.name !== "AbortError") msg.textContent = "Could not open the folder: " + errText(x); }); });
		bAgain.addEventListener("click", function () { var h = stored; if (!h) return; perm(h, true, true).then(function (p) { if (p === "granted") load(h); else msg.textContent = "The browser did not give access to “" + h.name + "”. Press Reconnect again, or choose the folder."; }).catch(function (x) { msg.textContent = "Could not reconnect: " + errText(x); }); });
		bRo.addEventListener("click", function () { roInp.click(); });
		roInp.addEventListener("change", function () {
			var fs = Array.prototype.slice.call(roInp.files || []); roInp.value = ""; if (!fs.length) return; roName = (fs[0].webkitRelativePath || "").split("/")[0] || "folder"; dirHandle = null; ++token;
			roFiles = fs.filter(function (f) { return IMG.test(f.name); }).sort(function (a, b) { return (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }); });
			entries = roEntries(); count(roName, entries.length); render(); refreshState();
		});
		function saveTo(dh, k, name) {
			return perm(dh, true, true).then(function (p) { if (p !== "granted") throw new Error("the browser did not allow saving into “" + dh.name + "”"); return namesIn(dh); })
				.then(function (used) { if (used[name.toLowerCase()] && !window.confirm("“" + name + "” is already in “" + dh.name + "”. Replace it?")) throw "cancel"; return k === "proj" ? PE.projectBlob() : PE.exportBlob("png", 1, {}); })
				.then(function (b) { return writeFile(dh, name, b); })
				.then(function (fh) { if (k === "proj" && PE.linkProject) return fh.getFile().then(function (f) { PE.doc.name = P.projectBase(name); PE.linkProject(fh, { dir: dh.name, lm: f.lastModified, savedAt: Date.now() }); return fh; }); return fh; });
		}
		bSave.addEventListener("click", function () {
			if (!PE.doc) { PE.toast("Open or create an image first"); return; }
			var k = kind.value, base = I.cleanFileName((nameIn.value || "").trim().replace(/\.(png|mesproj)$/i, "") || PE.doc.name || "image"), name = base + (k === "proj" ? ".mesproj" : ".png");
			var ok = function (where) { if (k === "proj") { PE.dirty = false; if (PE.saveState) PE.saveState(); } PE.toast("Saved " + name + " " + where); };
			if (!canFS()) { (k === "proj" ? PE.projectBlob() : PE.exportBlob("png", 1, {})).then(function (b) { PE.download(b, name); ok("to your Downloads"); }).catch(function (x) { PE.toast("Could not save: " + errText(x)); }); return; }
			bSave.disabled = true;
			(dirHandle ? Promise.resolve(dirHandle) : window.showDirectoryPicker({ id: "mes-photo-folder", mode: "readwrite" }).then(function (h) { stored = h; idb(function (st) { return rq(st.put(h, "dir")); }).catch(function () {}); load(h); return h; }))
				.then(function (dh) { return saveTo(dh, k, name).then(function () { ok("into “" + dh.name + "”"); if (dh === dirHandle) load(dh); }); })
				.catch(function (x) { if (x === "cancel") { PE.toast("Not saved. Change the name to keep both files."); return; } if (x && x.name === "AbortError") return; PE.toast("Could not save: " + errText(x)); })
				.then(function () { bSave.disabled = false; });
		});
		nameIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); bSave.click(); } });
		function moveFile(hk, b) {
			var H = handles[hk]; if (!H) return; var src = H.dir, target, newName; b.disabled = true;
			perm(src, true, true).then(function (p) { if (p !== "granted") throw new Error("the browser did not allow changes in “" + src.name + "”"); return window.showDirectoryPicker({ id: "mes-photo-move", mode: "readwrite", startIn: src }); })
				.then(function (t) { target = t; return src.isSameEntry ? src.isSameEntry(t) : false; })
				.then(function (same) { if (same) throw new Error("that is the folder it is in already"); return namesIn(target); })
				.then(function (used) { newName = I.uniqueName(H.name, used);
					var q = "Move “" + H.name + "” from “" + src.name + "” to “" + target.name + "”?" + (newName !== H.name ? "\n\n“" + target.name + "” already has a file called “" + H.name + "”, so the moved one will be called “" + newName + "”." : "") + "\n\nThe original is removed from “" + src.name + "” only after the copy in “" + target.name + "” is complete.";
					if (!window.confirm(q)) throw "cancel"; return moveOne(H.fh, src, target, H.name, newName); })
				.then(function (nfh) { handles[hk] = { fh: nfh, dir: target, name: newName, dirName: target.name }; retarget(hk, target.name, newName); PE.toast("Moved " + newName + " to “" + target.name + "”"); if (dirHandle && src === dirHandle) load(dirHandle); drawWhere(); })
				.catch(function (x) { if (x === "cancel" || (x && x.name === "AbortError")) return; PE.toast(x && x.name === "SecurityError" ? "Press Move again: the browser needs a fresh click to open the folder chooser" : "Could not move: " + errText(x)); })
				.then(function () { b.disabled = false; });
		}

		/* 3. the autosaves in this browser (one per recent project) */
		var sA = sec("Autosave in this browser"), aP = el("p", "pe-fx-auto"), uP = el("p", "pe-hint2"), ab = el("div", "pe-fold-h"), bClear = btn("🗑 Clear all autosaves", "Delete the autosaved copies of your projects from this browser (you are asked first; project files on your disk are not touched)"), bRec = btn("Recent projects…", "Open one of the projects autosaved here or saved to a file");
		sA.appendChild(el("p", "pe-hint2", "While you work, the editor keeps a copy of each project in this browser's own storage (the IndexedDB database “mes-photo-editor” of mes.fm), 5 seconds after each change, so a reload or a crash does not lose your work. The last " + 8 + " projects are kept (500 MB at most) and listed under File → Open recent. They stay on this computer, in this browser only, and are not files you can find in a folder."));
		ab.appendChild(bRec); ab.appendChild(bClear); sA.appendChild(aP); sA.appendChild(ab); sA.appendChild(uP);
		var lk = PE.projectLink && PE.projectLink();
		sA.appendChild(el("p", "pe-hint2", lk ? "💾 This project is saved in the file <b>" + esc(PE.projectWhere()) + "</b>: " + esc(PE.modKey()) + "S writes it there" + (PE.autoFileOn() ? " (and Auto-save does, 20 s after you stop)" : "") + "." : "💾 Save project makes a real file (a .mesproj, which is an ordinary ZIP): in a folder you choose where the browser allows it, else in your Downloads folder. Export makes a flat picture."));
		function drawAuto() {
			(PE.recentReady ? PE.recentReady() : Promise.resolve([])).then(function () { var l = PE.recentList ? PE.recentList() : [], a = l.filter(function (e) { return e.bytes > 0; }), tot = 0; a.forEach(function (e) { tot += e.bytes; });
				bClear.disabled = !a.length; bRec.disabled = !l.length; aP.innerHTML = a.length ? "<b>" + a.length + "</b> project" + (a.length === 1 ? "" : "s") + " autosaved here (" + esc(P.bytesText(tot)) + "), the newest <b>" + esc(a[0].name || "Untitled") + "</b>, " + esc(new Date(a[0].at || a[0].t).toLocaleString()) + "." : "Nothing is autosaved at the moment."; })
				.catch(function () { bClear.disabled = true; aP.textContent = "This browser's storage cannot be read here (a private window, or site data is blocked), so nothing is autosaved."; });
			if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { uP.textContent = "All of mes.fm (every tool) uses about " + P.bytesText(e.usage || 0) + " of this browser's storage."; }).catch(function () {});
		}
		bRec.addEventListener("click", function () { m.close(); PE.dlgRecent(); });
		bClear.addEventListener("click", function () { if (!window.confirm("Delete the autosaved copies of all your projects from this browser?\n\nThe image that is open now stays open, and it is autosaved again 5 seconds after your next change. Project files on your disk are not touched.")) return; PE.clearAutosaves().then(function () { PE.toast("Autosaves cleared"); drawAuto(); }).catch(function (x) { PE.toast("Could not clear the autosaves: " + errText(x)); }); });

		/* 4. keep working on another computer */
		var sM = sec("Keep working on another computer", "Three ways to carry a project between computers and browsers. Nothing is stored on mes.fm's servers.");
		if (PE.moveHelpEl) sM.appendChild(PE.moveHelpEl());

		var m = PE.modal({ title: "Files and folders", wide: true, cls: "pe-dlg--files", body: wrap, noFocus: true, buttons: [{ label: "Close", act: function (mm) { mm.close(); } }] });
		drawWhere(); drawAuto(); refreshState();
		if (canFS() && dirHandle) load(dirHandle);
		else if (canFS()) { msg.textContent = "Choose a folder to see its pictures."; idb(function (st) { return rq(st.get("dir")); }).then(function (h) { stored = h || null; refreshState(); }).catch(function () {}); }
		else if (roFiles) { entries = roEntries(); count(roName, entries.length); render(); }
		if (focus === "folder" || focus === "move") setTimeout(function () { var t = focus === "move" ? sM : sF; m.body.scrollTop += t.getBoundingClientRect().top - m.body.getBoundingClientRect().top - 4; }, 0);
		return m;
	};
})();

/* MES Photo Editor: project files across computers (round 5).
 * - the open project can be LINKED to a file on disk (a FileSystemFileHandle from File -> Open, a drop, the connected folder, Save as, or a recent project):
 *   Save (Ctrl/Cmd+S) then overwrites that file in place, Save as (Ctrl/Cmd+Alt+Shift+S) picks a new one; without the File System Access API Save downloads.
 * - optional auto-save to the linked file 20 s after changes stop (never during a stroke / text edit / dialog); before every write the file's lastModified is
 *   compared with what we last read or wrote, and a change made elsewhere (another computer, synced by OneDrive) asks Keep mine / Open theirs.
 * - recent projects: autosaves per project id ("auto:<pid>" in IndexedDB "mes-photo-editor" / "kv") + the list "recent" (name, size, thumbnail, time,
 *   remembered file handle); pruned to 8 entries / 500 MB by MESPixel.pruneRecent. The old single "auto" entry is migrated once.
 * - Download project as .zip (same bytes), Export every layer as PNG (ZIP + layers.json). */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, I = window.MESImg; if (!PE || !P) return;
	var el = function (t, c, h) { return PE.el(t, c, h); }, esc = function (s) { return PE.esc(s); };
	var KEY = "mes-photo-editor:v1", AUTO_FILE_MS = 20000, MAX_RECENT = 8, BUDGET = 500e6, BRAVE_FLAG = "brave://flags/#file-system-access-api";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; Promise.resolve(fn(db.transaction("kv", "readwrite").objectStore("kv"))).then(res, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function rq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function errText(x) { return x && x.message ? x.message : String(x); }
	function needDoc() { if (!PE.doc) { PE.toast("Open or create an image first"); return false; } return true; }
	function canSavePicker() { return typeof window.showSaveFilePicker === "function"; }
	PE.canOpenPicker = function () { return typeof window.showOpenFilePicker === "function"; };
	function isBrave() { return !!(navigator.brave && typeof navigator.brave.isBrave === "function"); }
	var edits = 0; PE.on("history", function () { edits++; });

	/* ---------- the link between the open project and a file on disk ---------- */
	var link = null;   // {doc, handle, name, dir, lm (file's lastModified as we last read / wrote it), savedAt, conflict, needPerm}
	function cur() { if (link && link.doc !== PE.doc) link = null; return link; }
	PE.projectLink = cur;
	function whereText(L) { return L ? (L.dir ? L.dir + "/" : "") + L.name : ""; }
	PE.projectWhere = function () { return whereText(cur()); };
	/* the folder path of a file inside the connected folder ("Thumbnail Meta" when that folder is connected), else "" */
	function dirOf(h) { var dh = PE.folderHandle && PE.folderHandle(); if (!dh || !dh.resolve) return Promise.resolve(""); return dh.resolve(h._folder || h).then(function (p) { return p ? [dh.name].concat(p.slice(0, -1)).join("/") : ""; }).catch(function () { return ""; }); }
	/* call right after a project (or anything) became PE.doc: info = {dir, lm, savedAt, dirty} */
	PE.linkProject = function (h, info) {
		info = info || {}; if (!PE.doc || !h) return; var my = { doc: PE.doc, handle: h, name: h.name, dir: info.dir || "", lm: info.lm || 0, savedAt: info.savedAt || 0 }; link = my;
		if (!info.dir) dirOf(h).then(function (d) { if (d && link === my) { my.dir = d; drawBar(); } });
		if (!my.lm && h.getFile) h.getFile().then(function (f) { if (link === my && !my.lm) my.lm = f.lastModified; }).catch(function () {});
		remember({ fh: h, file: { name: h.name, dir: info.dir || "" } }); drawBar();
	};
	PE.unlinkProject = function () { link = null; drawBar(); };
	function ensurePerm(h, ask) { var o = { mode: "readwrite" }; if (!h.queryPermission) return Promise.resolve(true); return h.queryPermission(o).then(function (p) { return p === "granted" ? true : ask ? h.requestPermission(o).then(function (q) { return q === "granted"; }) : false; }); }
	function writeHandle(h, blob) { return h.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }, function (e) { try { w.abort(); } catch (x) {} throw e; }); }); }

	/* ---------- Save / Save as / download ---------- */
	var saving = null;
	function markSaved(L, e0) { if (edits === e0) { PE.dirty = false; } if (PE.saveState) PE.saveState(); drawBar(); remember({}); }
	/* write the open project into its linked file. interactive = the person pressed Save (may ask for permission and show the conflict question) */
	function saveToLink(interactive) {
		var L = cur(); if (!L) return Promise.resolve(false); if (saving) return saving.then(function () { return interactive ? saveToLink(true) : false; });
		var h = L.handle, e0 = edits;
		saving = ensurePerm(h, interactive).then(function (ok) {
			if (!ok) { L.needPerm = true; drawBar(); if (interactive) PE.toast("The browser did not allow saving to “" + L.name + "”. Use Save project as… to pick a place"); return false; }
			L.needPerm = false; return h.getFile().then(function (f) {
				if (P.diskChanged(L.lm, f.lastModified)) { if (!interactive && L.conflict) return "skip"; L.conflict = true; drawBar(); return askConflict(L, f); }
				return "mine";
			}).then(function (choice) {
				if (choice === "theirs") { L.conflict = false; return openHandle(h, { dir: L.dir }).then(function () { return false; }); }
				if (choice !== "mine") return false;
				L.conflict = false;
				return PE.projectBlob().then(function (b) { return writeHandle(h, b).then(function () { return h.getFile(); }); }).then(function (f2) {
					L.lm = f2.lastModified; L.savedAt = Date.now(); markSaved(L, e0);
					PE.toast((interactive ? "Saved to " : "Auto-saved to ") + whereText(L)); return true;
				});
			});
		}).catch(function (x) { if (x && x.name === "NotAllowedError" && !interactive) { L.needPerm = true; drawBar(); return false; } PE.toast("Could not save to “" + L.name + "”: " + errText(x)); return false; })
			.then(function (r) { saving = null; drawBar(); return r; });
		return saving;
	}
	function askConflict(L, f) {
		return new Promise(function (res) {
			var w = el("div", "pe-fx"); w.innerHTML = "<p><b>“" + esc(L.name) + "” was changed on disk</b> (" + esc(new Date(f.lastModified).toLocaleString()) + ") since it was opened or saved here, maybe on another computer that OneDrive or another sync service brought over.</p>"
				+ "<p class=\"pe-hint2\"><b>Keep mine</b> writes what is open here over that file. <b>Open theirs</b> opens the file as it is on disk now (what is open here is kept in Recent projects as an autosave).</p>";
			var done = false, fin = function (m, v) { if (done) return; done = true; m.close(); res(v); };
			PE.modal({ title: "The project file changed", body: w, sticky: true, onClose: function () { if (!done) { done = true; res("cancel"); } }, buttons: [{ label: "Cancel", act: function (m) { fin(m, "cancel"); } }, { label: "Open theirs", act: function (m) { keepMineAsCopy().then(function () { fin(m, "theirs"); }); } }, { label: "Keep mine", primary: true, act: function (m) { fin(m, "mine"); } }] });
		});
	}
	/* before "Open theirs" replaces it, what is open here goes into Recent projects as its own autosave ("… (my version)"), not linked to the file */
	function keepMineAsCopy() { var d = PE.doc; if (!d) return Promise.resolve(); d.pid = P.newProjectId(); d.name = (d.name || "Untitled") + " (my version)"; return autosaveNow({ fh: null, file: null }, true); }
	PE.saveProject = function () { if (!needDoc()) return; var L = cur(); if (L) return saveToLink(true); return PE.saveProjectAs(); };
	PE.saveProjectAs = function (kind) {
		if (!needDoc()) return; var L = cur(), base = PE.doc.name || "Untitled";
		if (!canSavePicker()) {
			if (!sget().dlNoAsk && !PE._dlExplained) return explainDownload().then(function (go) { if (go) { PE._dlExplained = true; return PE.saveProjectAs(kind); } });
			return PE.projectBlob().then(function (b) { var n = P.projectFileName(base, kind || "mesproj"); PE.download(b, n); PE.dirty = false; if (PE.saveState) PE.saveState(); drawBar();
				PE.toast("Saved " + n + " to your Downloads" + (isBrave() ? " (to save straight into a folder, switch on " + BRAVE_FLAG + ")" : "")); }).catch(function (e) { PE.toast("Could not save the project: " + errText(e)); });
		}
		var dh = PE.folderHandle && PE.folderHandle(), opts = { suggestedName: P.projectFileName(base, kind || (L && P.projectKind(L.name)) || "mesproj"), id: "mes-photo-proj", types: [{ description: "MES Photo Editor project", accept: { "application/zip": [".mesproj", ".zip"] } }] };
		if (L && L.handle) opts.startIn = L.handle._folder || L.handle; else if (dh) opts.startIn = dh;
		var e0 = edits, pick = function (o) { return window.showSaveFilePicker(o).catch(function (x) { if (x && x.name === "TypeError" && o.startIn) { var o2 = Object.assign({}, o); delete o2.startIn; return window.showSaveFilePicker(o2); } throw x; }); };
		return pick(opts).then(function (h) {
			if (L && L.handle && h !== L.handle) PE.doc.pid = P.newProjectId();   // a copy under a new name is its own project in Recent projects
			PE.doc.name = P.projectBase(h.name);
			return PE.projectBlob().then(function (b) { return writeHandle(h, b); }).then(function () { return h.getFile(); }).then(function (f) {
				PE.linkProject(h, { lm: f.lastModified, savedAt: Date.now() }); markSaved(cur(), e0); PE.emit("docsize"); PE.toast("Saved " + h.name + ": " + PE.modKey() + "S now saves to this file");
			});
		}).catch(function (x) { if (x && x.name === "AbortError") return; PE.toast("Could not save the project: " + errText(x)); });
	};
	/* Brave (by default), Safari and Firefox have no way for a page to write to a file it opened: every Save is a NEW download. When the browser is set to
	   "ask where to save each file", that looks like a Save As dialog on every Save. Say so once, and how to get silent saving. */
	function explainDownload() {
		return new Promise(function (res) {
			var br = isBrave(), w = el("div", "pe-fx"), done = false;
			w.innerHTML = "<p><b>This browser can't save over the project file.</b> Each Save makes a new download of <i>" + esc(P.projectFileName(PE.doc.name || "Untitled", "mesproj")) + "</i>. If your browser asks where to save every download, you will see a Save dialog each time: that is the browser, not a new project.</p>"
				+ (br ? "<p><b>In Brave you can switch it on:</b> open <code>" + BRAVE_FLAG + "</code> (copy it into the address bar), set it to <b>Enabled</b> and relaunch Brave. Then the first Save asks once where to put the file, and every later Save (" + PE.modKey() + "S) writes that same file silently, also in a OneDrive folder.</p>"
					: "<p>Chrome and Edge on a computer can write to the same file with no questions. Safari and Firefox can't.</p>")
				+ "<p class=\"pe-hint2\">To stop the Save dialog for downloads: browser Settings → Downloads → turn off “Ask where to save each file”. The project then goes straight to your Downloads folder.</p>"
				+ '<label class="pe-chk"><input type="checkbox" id="pe-dlnoask"> Always download without showing this again</label>';
			var fin = function (m, v) { if (done) return; done = true; if (w.querySelector("#pe-dlnoask").checked) sset({ dlNoAsk: true }); m.close(); res(v); };
			var btns = [{ label: "Cancel", act: function (m) { fin(m, false); } }];
			if (br) btns.push({ label: "Copy the Brave setting link", act: function () { try { navigator.clipboard.writeText(BRAVE_FLAG); PE.toast("Copied: paste it into the address bar"); } catch (x) {} } });
			btns.push({ label: "⬇ Download the project", primary: true, act: function (m) { fin(m, true); } });
			PE.modal({ title: "Saving in this browser", body: w, onClose: function () { if (!done) { done = true; res(false); } }, buttons: btns });
		});
	}
	PE.downloadProjectZip = function () {
		if (!needDoc()) return; PE.projectBlob().then(function (b) { var n = P.projectFileName(PE.doc.name, "zip"); PE.download(b, n); PE.toast("Downloaded " + n + ": a normal ZIP (project.json + one PNG per layer). Drop it on the editor to keep working"); }).catch(function (e) { PE.toast("Could not make the ZIP: " + errText(e)); });
	};
	PE.modKey = function () { return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"; };

	/* ---------- opening a project from a file handle ---------- */
	function openHandle(h, info) {
		info = info || {};
		return h.getFile().then(function (f) { return f.arrayBuffer().then(function (b) {
			return PE.loadProject(b, f.name, { file: f.name, bytes: f.size, dir: info.dir || "" }).then(function () { PE.linkProject(h, { dir: info.dir, lm: f.lastModified, savedAt: 0 }); if (PE.setTool) PE.setTool("move"); PE.toast("Opened " + f.name + (PE.canOpenPicker() ? " · " + PE.modKey() + "S saves back to it" : "")); });
		}); });
	}
	PE.openProjectHandle = openHandle;
	/* File -> Open project…: a picker that hands back a file handle, so Save can write to the same file later */
	PE.openProjectPicker = function () {
		if (!PE.canOpenPicker()) { PE.pickOpen(); return; }
		var dh = PE.folderHandle && PE.folderHandle(), o = { id: "mes-photo-proj", multiple: false, types: [{ description: "MES Photo Editor project", accept: { "application/zip": [".mesproj", ".zip"] } }] }; if (dh) o.startIn = dh;
		window.showOpenFilePicker(o).then(function (hs) { var h = hs[0]; if (!h) return; if (PE.confirmReplace && !PE.confirmReplace()) return; return openHandle(h, {}); }).catch(function (x) { if (x && x.name === "AbortError") return; PE.toast("Could not open the project: " + errText(x)); });
	};

	/* ---------- auto-save to the project file ---------- */
	var afTimer = 0;
	PE.autoFileOn = function () { return !!sget().autoFile; };
	PE.setAutoFile = function (on) { sset({ autoFile: !!on }); drawBar(); if (on) { var L = cur(); PE.toast(L ? "Auto-save on: changes are written to " + whereText(L) + " " + AUTO_FILE_MS / 1000 + " s after you stop" : "Auto-save on: it starts once the project is saved to a file (Save project as…)"); scheduleFile(); } else PE.toast("Auto-save to the project file is off"); if (PE.rebuildMenus) PE.rebuildMenus(); };
	function scheduleFile(ms) {
		clearTimeout(afTimer); var L = cur(); if (!L || !PE.autoFileOn()) return;
		afTimer = setTimeout(function () {
			var L2 = cur(); if (!L2 || !PE.autoFileOn() || !PE.dirty) return;
			if ((PE.pointerBusy && PE.pointerBusy()) || (PE.textEditing && PE.textEditing()) || (PE.modalOpen && PE.modalOpen()) || saving) { scheduleFile(3000); return; }   // never in the middle of a stroke, a text edit or a dialog
			if (L2.conflict) return;   // waiting for the person to answer Keep mine / Open theirs (or press Save)
			saveToLink(false);
		}, ms || AUTO_FILE_MS);
	}
	PE.on("history", function () { scheduleFile(); setTimeout(drawBar, 0); });

	/* ---------- recent projects (IndexedDB) ---------- */
	var recent = [], chain = Promise.resolve(), ready = null;
	function getList() { return idb(function (st) { return rq(st.get("recent")); }).then(function (l) { return Array.isArray(l) ? l : []; }); }
	function putList(list) { return idb(function (st) { return rq(st.put(list, "recent")); }); }
	/* run list changes one after another (an autosave and a save may finish together) */
	function update(fn) { chain = chain.then(function () { return getList().then(function (list) { return fn(list); }).then(function (list) { if (!list) return; var pr = P.pruneRecent(list, MAX_RECENT, BUDGET), gone = pr.drop.concat(pr.dropAuto); recent = pr.keep; return putList(pr.keep).then(function () { return gone.length ? idb(function (st) { return Promise.all(gone.map(function (id) { return rq(st.delete("auto:" + id)); })); }) : null; }); }); }).catch(function () {}).then(function () { PE.emit("recent"); }); return chain; }
	function thumbOf() { var d = PE.doc, s = Math.min(1, 160 / Math.max(d.w, d.h)); try { return PE.flatten({ scale: s, fill: "#2b2b33" }).toDataURL("image/jpeg", 0.72); } catch (e) { return ""; } }
	/* note the open project in the list (fields = extra fields: fh / file / bytes) */
	function remember(fields) {
		var d = PE.doc; if (!d || !d.pid) return chain; var L = cur(), e = Object.assign({ id: d.pid, name: d.name || "Untitled", w: d.w, h: d.h, t: Date.now(), thumb: thumbOf() }, fields || {});
		if (L && !("fh" in (fields || {}))) { e.fh = L.handle; e.file = { name: L.name, dir: L.dir }; }
		if (e.fh && e.fh._folder) { e.fh = e.fh._folder; e.file = Object.assign({}, e.file || { name: e.fh.name }, { folder: true }); }   // a project folder: IndexedDB keeps the real folder handle
		return update(function (list) { return P.upsertRecent(list, e); });
	}
	PE.rememberProject = remember;
	var asTimer = 0;
	function autosaveNow(extra, always) {
		var d = PE.doc; if (!d || (PE.hist.stack.length < 2 && !always)) return Promise.resolve();
		return PE.projectBlob().then(function (b) { return idb(function (st) { return rq(st.put({ blob: b, t: Date.now(), name: d.name, w: d.w, h: d.h, pid: d.pid }, "auto:" + d.pid)); }).then(function () { return remember(Object.assign({ bytes: b.size, at: Date.now() }, extra || {})); }); }).catch(function () {});
	}
	PE.autosaveNow = autosaveNow;
	PE.scheduleAutosave = function () { clearTimeout(asTimer); asTimer = setTimeout(function () { autosaveNow(); }, 5000); };
	/* the single "auto" autosave of rounds 1-4 becomes the first recent project */
	function migrate() {
		return idb(function (st) { return rq(st.get("auto")); }).then(function (r) {
			if (!r || !r.blob) return; var pid = P.newProjectId();
			return idb(function (st) { return rq(st.put({ blob: r.blob, t: r.t, name: r.name, w: r.w, h: r.h, pid: pid, migrated: true }, "auto:" + pid)); })
				.then(function () { return update(function (list) { return P.upsertRecent(list, { id: pid, name: r.name || "Untitled", w: r.w, h: r.h, t: r.t || Date.now(), bytes: r.blob.size, at: r.t, thumb: "" }); }); })
				.then(function () { return idb(function (st) { return rq(st.delete("auto")); }); });
		}).catch(function () {});
	}
	PE.recentReady = function () { if (!ready) { try { ready = migrate().then(getList).then(function (l) { recent = l; PE.emit("recent"); return l; }).catch(function () { return []; }); } catch (e) { ready = Promise.resolve([]); } } return ready; };
	PE.recentList = function () { return recent.slice(); };
	PE.forgetRecent = function (id) { return idb(function (st) { return rq(st.delete("auto:" + id)); }).catch(function () {}).then(function () { return update(function (list) { return list.filter(function (e) { return e.id !== id; }); }); }); };
	/* delete every autosave (remembered project files stay in the list) */
	PE.clearAutosaves = function () {
		return idb(function (st) { return rq(st.getAllKeys()).then(function (ks) { return Promise.all(ks.filter(function (k) { return k === "auto" || /^auto:/.test(String(k)); }).map(function (k) { return rq(st.delete(k)); })); }); })
			.then(function () { return update(function (list) { return list.filter(function (e) { return e.fh; }).map(function (e) { return Object.assign({}, e, { bytes: 0, at: 0 }); }); }); });
	};
	/* reopen a recent project. The click is the user gesture the browser needs to give the file back (one permission prompt). */
	PE.openRecent = function (e) {
		if (!e) return; if (PE.confirmReplace && !PE.confirmReplace()) return;
		if (e.fh && e.file && e.file.folder && !e.fh._folder) e = Object.assign({}, e, { fh: PE.folderProjectHandle(e.fh) });
		var permP = e.fh ? ensurePerm(e.fh, true).catch(function () { return false; }) : Promise.resolve(false);   // called right away, inside the click
		var autoP = e.bytes > 0 ? idb(function (st) { return rq(st.get("auto:" + e.id)); }).catch(function () { return null; }) : Promise.resolve(null);
		return Promise.all([permP, autoP]).then(function (r) {
			var ok = r[0], a = r[1];
			var fileP = ok ? e.fh.getFile().catch(function () { return null; }) : Promise.resolve(null);
			return fileP.then(function (f) {
				var dir = e.file && e.file.dir || "";
				if (f && (!a || f.lastModified > a.t + 2000)) return openHandle(e.fh, { dir: dir });   // the file is newer (saved here, or changed on another computer): open it
				if (!a) { PE.toast(e.fh ? "The browser did not give the file “" + (e.file && e.file.name || e.name) + "” back. Try again, or open it with File → Open" : "That autosave is gone"); return; }
				return a.blob.arrayBuffer().then(function (b) { return PE.loadProject(b, "autosave", null, { pid: e.id }); }).then(function () {
					if (f) { PE.linkProject(e.fh, { dir: dir, lm: f.lastModified }); PE.dirty = a.t > f.lastModified + 2000; if (PE.saveState) PE.saveState(); drawBar(); }
					if (PE.setTool) PE.setTool("move"); PE.toast("Opened “" + (a.name || e.name) + "” from this browser's autosave (" + new Date(a.t).toLocaleString() + ")" + (f ? " · linked to " + f.name : ""));
				});
			});
		}).catch(function (x) { PE.toast("Could not open it: " + errText(x)); });
	};
	/* a list of recent projects (empty start screen and File -> Open recent) */
	PE.recentEl = function (opts) {
		opts = opts || {}; var box = el("div", "pe-rec" + (opts.compact ? " pe-rec--compact" : ""));
		function draw() {
			box.innerHTML = ""; var list = recent.slice(0, opts.limit || MAX_RECENT); box.hidden = !list.length && !opts.always;
			if (!list.length) { if (opts.always) box.appendChild(el("p", "pe-hint2", "No recent projects in this browser yet. They appear here once you edit something (autosave) or save a project file.")); return; }
			if (opts.title) box.appendChild(el("div", "pe-rec-t", esc(opts.title)));
			var g = el("div", "pe-rec-g"); box.appendChild(g);
			list.forEach(function (e) {
				var it = el("div", "pe-rec-i"), b = el("button", "pe-rec-b"), x = el("button", "pe-rec-x", "✕"); b.type = "button"; x.type = "button"; x.title = "Remove from this list (deletes its autosave; a project file on disk is not touched)"; x.setAttribute("aria-label", "Remove " + (e.name || "project") + " from recent projects");
				var where = e.file ? (e.file.folder ? "📁 " : "📄 ") + (e.file.dir ? e.file.dir + "/" : "") + e.file.name : "", saved = e.bytes > 0 ? "autosave " + P.bytesText(e.bytes) : "";
				b.innerHTML = (e.thumb ? '<img class="pe-rec-th" alt="" src="' + esc(e.thumb) + '">' : '<span class="pe-rec-th pe-rec-th--none" aria-hidden="true">🖼</span>') + '<span class="pe-rec-m"><b class="pe-rec-n">' + esc(e.name || "Untitled") + "</b>"
					+ '<span class="pe-rec-s">' + esc([e.w && e.h ? e.w + " × " + e.h : "", saved, P.agoText(e.t)].filter(Boolean).join(" · ")) + "</span>" + (where ? '<span class="pe-rec-f">' + esc(where) + "</span>" : "") + "</span>";
				b.title = "Open " + (e.name || "this project") + (e.file ? " (the browser may ask once to let the editor use " + e.file.name + " again)" : " from this browser's autosave");
				b.addEventListener("click", function () { if (opts.onPick) opts.onPick(); PE.openRecent(e); });
				x.addEventListener("click", function (ev) { ev.stopPropagation(); if (!window.confirm("Remove “" + (e.name || "Untitled") + "” from Recent projects?" + (e.bytes > 0 ? "\n\nIts autosave in this browser is deleted." : "") + (e.file ? "\n\nThe file " + e.file.name + " on your disk is not touched." : ""))) return; PE.forgetRecent(e.id); });
				it.appendChild(b); it.appendChild(x); g.appendChild(it);
			});
		}
		var off = false; PE.on("recent", function () { if (!off && (box.isConnected || opts.keep)) draw(); }); draw(); box.detach = function () { off = true; };
		return box;
	};
	PE.dlgRecent = function () {
		PE.recentReady().then(function () {
			var w = el("div", "pe-fx"), m; w.appendChild(PE.recentEl({ always: true, onPick: function () { if (m) m.close(); } }));
			w.appendChild(el("p", "pe-hint2", "Each project here is kept in this browser (autosave, up to " + MAX_RECENT + " projects / " + Math.round(BUDGET / 1e6) + " MB) and, once saved to a file, remembered by its file: opening it reads the file again when it is newer than the autosave (for example after you saved it on another computer)."));
			m = PE.modal({ title: "Recent projects", wide: true, body: w, buttons: [{ label: "Open a project file…", act: function (mm) { mm.close(); PE.openProjectPicker(); } }, { label: "Close", primary: true, act: function (mm) { mm.close(); } }] });
		});
	};

	/* ---------- top bar: linked file + saved time + auto-save ---------- */
	var bar = null;
	function drawBar() {
		bar = bar || document.getElementById("pe-projst"); if (!bar) return; var d = PE.doc, L = cur();
		if (!d) { bar.hidden = true; return; } bar.hidden = false;
		var dirty = !!(PE.dirty && PE.hist.stack.length > 1), st = !L && !canSavePicker() ? (dirty ? "Save = new download" : "") : L ? (L.conflict ? "changed on disk" : L.needPerm && dirty ? "press Save to allow saving" : dirty ? "unsaved changes" : L.savedAt ? "saved " + P.agoText(L.savedAt) : "opened") : dirty ? "not saved to a file" : "";
		var af = PE.autoFileOn(), title = L ? "This project is linked to the file " + whereText(L) + ". " + PE.modKey() + "S writes it there." + (af ? " Auto-save writes changes there " + AUTO_FILE_MS / 1000 + " s after you stop." : "") : "This project is not saved in a file yet: Save project makes one (in a folder you choose, or your Downloads).";
		bar.className = "pe-projst" + (dirty ? " is-dirty" : "") + (L && L.conflict ? " is-warn" : "");
		bar.innerHTML = (L ? '<span class="pe-projst-f">' + (L.handle && L.handle._folder ? "📁 " : "📄 ") + esc(L.name) + "</span>" : "") + (st ? '<span class="pe-projst-s">' + esc(st) + "</span>" : "")
			+ (L ? '<label class="pe-projst-a" title="Write changes to ' + esc(whereText(L)) + " " + AUTO_FILE_MS / 1000 + ' s after you stop editing (handy when the folder is synced by OneDrive)"><input type="checkbox"' + (af ? " checked" : "") + "> Auto-save</label>" : "");
		bar.title = title; var cb = bar.querySelector("input"); if (cb) cb.addEventListener("change", function () { PE.setAutoFile(cb.checked); });
	}
	PE.drawProjectBar = drawBar;
	setInterval(drawBar, 30000); PE.on("docsize", function () { setTimeout(drawBar, 0); });

	/* ---------- Export every layer as PNG (ZIP) ---------- */
	function canvasBytes(c) { return new Promise(function (res, rej) { c.toBlob(function (b) { if (!b) { rej(new Error("a layer is too large to save as PNG")); return; } b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, "image/png"); }); }
	PE.dlgExportLayers = function () {
		if (!needDoc()) return; var d = PE.doc, w = el("div", "pe-fx"), f = PE.form([{ k: "size", label: "Each PNG", type: "seg", options: [["doc", "Image size"], ["own", "Layer's own size"]], val: sget().lexSize || "doc", help: "Image size: every PNG is " + d.w + " × " + d.h + " with the layer in its place, so stacking them in another app rebuilds the picture. Layer's own size: each PNG is just big enough for that layer; layers.json says where it goes." }, { k: "hidden", label: "Include hidden layers", type: "check", val: sget().lexHidden !== false }], null);
		w.appendChild(f.el); w.appendChild(el("p", "pe-hint2", "One PNG per layer (groups are not pictures, their layers are), named after the layers and numbered bottom to top, plus <b>layers.json</b> with each layer's position, size, opacity, blend mode, visibility and group. Masks are applied. For use in GIMP, Photoshop, Figma, Canva, video editors…"));
		PE.modal({ title: "Export every layer as PNG", body: w, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Make ZIP", primary: true, act: function (m) { var v = f.get(); sset({ lexSize: v.size, lexHidden: !!v.hidden }); m.close(); exportLayers(v.size, !!v.hidden); } }] });
	};
	function exportLayers(mode, hidden) {
		var d = PE.doc; PE.relink(); var L0 = d.layers.filter(function (L) { return !PE.isGroup(L) && (hidden || PE.effVisible(L)); });
		if (!L0.length) { PE.toast("No layers to export"); return; }
		var names = P.layerFileNames(L0.map(function (L) { return L.name; })), files = [], meta = [];
		PE.toast("Making " + L0.length + " PNGs…");
		var job = Promise.resolve();
		L0.forEach(function (L, i) { job = job.then(function () {
			var b = PE.bounds(L), x0 = 0, y0 = 0, W = d.w, H = d.h;
			if (mode === "own") { x0 = Math.floor(b.x); y0 = Math.floor(b.y); W = Math.max(1, Math.ceil(b.x + b.w) - x0); H = Math.max(1, Math.ceil(b.y + b.h) - y0); }
			if (W * H > 268e6) throw new Error("“" + L.name + "” is too large for one PNG");
			var c = PE.mk(W, H), x = c.getContext("2d"); x.imageSmoothingQuality = "high";
			PE.drawLayer(x, Object.assign({}, L, { _p: null, visible: true, opacity: 1, blend: "source-over", live: null, preview: null }), [1, 0, 0, 1, -x0, -y0], "lexp", W, H);
			var grp = PE.ancestorsOf ? PE.ancestorsOf(L).map(function (g) { return g.name; }).reverse() : [];
			meta.push({ file: names[i], name: L.name, type: L.type, x: x0, y: y0, w: W, h: H, visible: PE.effVisible(L), opacity: L.opacity, blend: L.blend === "source-over" ? "normal" : L.blend, group: grp, order: i, text: L.type === "text" && L.text ? L.text.str : undefined });
			return canvasBytes(c).then(function (u) { files.push({ name: names[i], data: u }); });
		}); });
		job.then(function () {
			files.push({ name: "layers.json", data: new TextEncoder().encode(JSON.stringify({ app: "MES Photo Editor", note: "One PNG per layer, bottom (first) to top (last). x / y = where the PNG's top-left corner goes on the image.", image: { name: d.name, w: d.w, h: d.h }, mode: mode === "own" ? "layer size" : "image size", layers: meta }, null, 1)) });
			var n = I.cleanFileName(d.name || "image") + " layers.zip"; PE.download(new Blob([I.zipStore(files)], { type: "application/zip" }), n); PE.toast("Downloaded " + n + " (" + L0.length + " PNGs + layers.json)");
		}).catch(function (x) { PE.toast("Could not export the layers: " + errText(x)); });
	}

	/* ---------- a project kept as a FOLDER (an unzipped .mesproj: project.json + layer-N.png + mask-N.png) ----------
	 * A .mesproj is a ZIP. Unzipped (Finder / Explorer / OneDrive sometimes hand it over that way) it is a folder; dropping that folder, choosing it with
	 * File -> Open project folder…, or clicking it in the connected folder opens it with the same loader as the ZIP (the files are put back into one).
	 * With a real folder handle (Chrome / Edge / Brave with the flag) the project is LINKED to the folder: Save writes project.json and the PNGs back into it
	 * (stale layer PNGs are removed). Without one (Safari, Firefox, or the read-only folder input) it opens, and Save makes a new .mesproj file. */
	var FOLDER_MAX = 4000, SKIP_DIR = /^(__MACOSX|\..*|node_modules)$/;
	/* every file under a FileSystemDirectoryHandle, a few folders deep -> [{path, fh}] */
	function listHandle(dh, pre, depth, out) {
		out = out || []; pre = pre || ""; depth = depth || 0;
		return (async function () { for await (var e of dh.values()) { if (out.length >= FOLDER_MAX) break; if (e.kind === "file") out.push({ path: pre + e.name, fh: e }); else if (depth < 4 && !SKIP_DIR.test(e.name)) await listHandle(e, pre + e.name + "/", depth + 1, out); } return out; })();
	}
	/* the same for a dropped FileSystemDirectoryEntry (webkitGetAsEntry: every browser) -> [{path, file}] */
	function listEntry(de, pre, depth, out) {
		out = out || []; pre = pre || ""; depth = depth || 0;
		return new Promise(function (res) {
			var rd = de.createReader(), all = [];
			var next = function () { rd.readEntries(function (es) { if (!es.length) return done(); all = all.concat(Array.prototype.slice.call(es)); next(); }, done); };
			var done = function () { var ch = Promise.resolve(); all.forEach(function (e) { ch = ch.then(function () { if (out.length >= FOLDER_MAX) return; if (e.isFile) return new Promise(function (r2) { e.file(function (f) { out.push({ path: pre + e.name, file: f }); r2(); }, function () { r2(); }); }); if (e.isDirectory && depth < 4 && !SKIP_DIR.test(e.name)) return listEntry(e, pre + e.name + "/", depth + 1, out); }); }); ch.then(function () { res(out); }); };
			next();
		});
	}
	function fileOf(it) { return it.file ? Promise.resolve(it.file) : it.fh.getFile(); }
	/* the project files of a folder listing as one stored ZIP (what PE.loadProject reads) + project.json's lastModified */
	function zipFromList(list, prefix, names) {
		var sel = list.filter(function (it) { return names.indexOf(it.path) >= 0; }), lm = 0;
		return Promise.all(sel.map(function (it) { return fileOf(it).then(function (f) { if (/(^|\/)project\.json$/.test(it.path)) lm = f.lastModified; return f.arrayBuffer().then(function (b) { return { name: it.path.slice(prefix.length), data: new Uint8Array(b) }; }); }); }))
			.then(function (files) { files.sort(function (a, b) { return a.name === "project.json" ? -1 : b.name === "project.json" ? 1 : 0; }); return { zip: I.zipStore(files), lm: lm, n: files.length }; });
	}
	function subDir(dh, prefix) { var parts = prefix.split("/").filter(Boolean), p = Promise.resolve(dh); parts.forEach(function (n) { p = p.then(function (d) { return d.getDirectoryHandle(n); }); }); return p; }
	/* open a folder listing: a project when it has a project.json (the one closest to the top), else its pictures as layers / a new image.
	 * info = {name (the folder's name), dirHandle (a real folder handle, or null), how} */
	PE.openProjectFolder = function (list, info) {
		info = info || {}; var fp = P.folderProject(list.map(function (it) { return it.path; }));
		if (!fp) {
			var imgs = list.filter(function (it) { return /\.(png|jpe?g|webp|gif|bmp|avif|svg|psd|xcf|mesproj|zip)$/i.test(it.path) && !/(^|\/)(__MACOSX\/|\._)/.test(it.path); }).slice(0, 60);
			if (!imgs.length) { PE.toast("“" + (info.name || "That folder") + "” has no MES project (project.json) and no pictures in it"); return Promise.resolve(); }
			return Promise.all(imgs.map(fileOf)).then(function (fs) { PE.toast("“" + (info.name || "folder") + "” is not a MES project (no project.json): its " + fs.length + " picture" + (fs.length === 1 ? "" : "s") + " are opened instead"); PE.openFiles(fs, { place: !!PE.doc, how: info.how || "drop", dir: info.name || "" }); });
		}
		if (PE.confirmReplace && !PE.confirmReplace()) return Promise.resolve();
		var folderName = fp.prefix ? fp.prefix.replace(/\/$/, "").split("/").pop() : info.name || "project";
		PE.toast("Opening the project folder “" + folderName + "”…");
		return zipFromList(list, fp.prefix, fp.files).then(function (z) {
			return PE.loadProject(z.zip, folderName, { file: folderName, dir: info.name && fp.prefix ? info.name : "", bytes: z.zip.length }).then(function () {
				if (!info.dirHandle || !info.dirHandle.getFileHandle) { PE.rememberProject({}); if (PE.setTool) PE.setTool("move"); PE.toast("Opened the project folder “" + folderName + "”. This browser cannot write into a dropped folder, so Save project makes a new .mesproj file" + (PE.canOpenPicker() ? " (File → Open project folder… links the folder instead)" : "")); return; }
				return subDir(info.dirHandle, fp.prefix).then(function (sd) {
					PE.linkProject(PE.folderProjectHandle(sd), { lm: z.lm, dir: fp.prefix ? info.name : "" }); if (PE.setTool) PE.setTool("move");
					PE.toast("Opened the project folder “" + folderName + "”: " + PE.modKey() + "S saves back into it (the browser asks once to allow changes)");
				});
			});
		}).catch(function (x) { PE.toast("Could not open the project folder: " + errText(x)); });
	};
	/* a folder handle that behaves like the project file handle the rest of this file uses (getFile, createWritable, permissions) */
	PE.folderProjectHandle = function (dir) {
		var H = { kind: "file", name: dir.name, _folder: dir,
			queryPermission: function (o) { return dir.queryPermission ? dir.queryPermission(o) : Promise.resolve("granted"); },
			requestPermission: function (o) { return dir.requestPermission ? dir.requestPermission(o) : Promise.resolve("granted"); },
			getFile: function () { return listHandle(dir, "", 3).then(function (list) { var fp = P.folderProject(list.map(function (it) { return it.path; })); if (!fp || fp.prefix) throw new Error("project.json is missing from the folder “" + dir.name + "”"); return zipFromList(list, "", fp.files); })
				.then(function (z) { return { name: dir.name, lastModified: z.lm, size: z.zip.length, arrayBuffer: function () { return Promise.resolve(z.zip.buffer.slice(z.zip.byteOffset, z.zip.byteOffset + z.zip.byteLength)); } }; }); },
			createWritable: function () { var parts = []; return Promise.resolve({ write: function (b) { parts.push(b); return Promise.resolve(); }, close: function () { return writeFolder(dir, new Blob(parts)); }, abort: function () {} }); },
			isSameEntry: function (o) { return Promise.resolve(!!o && (o === H || o._folder === dir)); } };
		return H;
	};
	function writeOne(dir, name, data) { return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(data).then(function () { return w.close(); }); }); }
	/* write a project ZIP into a project folder: the PNGs first, project.json last (its time is the project's time), then remove PNGs no layer uses any more */
	function writeFolder(dir, blob) {
		return blob.arrayBuffer().then(function (ab) {
			var ents = P.zipEntries(new Uint8Array(ab)); if (!ents) throw new Error("could not prepare the project"); var keep = {}, pj = null;
			var ch = Promise.resolve(); ents.forEach(function (e) { keep[e.name] = 1; if (e.name === "project.json") { pj = e; return; } ch = ch.then(function () { return writeOne(dir, e.name, e.data); }); });
			return ch.then(function () { return pj ? writeOne(dir, "project.json", pj.data) : null; }).then(function () {
				return (async function () { var gone = []; for await (var e of dir.values()) if (e.kind === "file" && /^(layer|mask)-[^\/]+\.png$/.test(e.name) && !keep[e.name]) gone.push(e.name); for (var i = 0; i < gone.length; i++) { try { await dir.removeEntry(gone[i]); } catch (x) { } } })();
			});
		});
	}
	/* a drop that contains a folder: the first folder (a real handle when the browser gives one, so Save can write back) */
	PE.openDroppedFolder = function (entry, handleP) {
		return Promise.resolve(handleP).catch(function () { return null; }).then(function (h) {
			if (h && h.kind === "directory") return listHandle(h).then(function (list) { return PE.openProjectFolder(list, { name: h.name, dirHandle: h, how: "drop" }); });
			return listEntry(entry).then(function (list) { return PE.openProjectFolder(list, { name: entry.name, how: "drop" }); });
		}).catch(function (x) { PE.toast("Could not read the folder: " + errText(x)); });
	};
	PE.openFolderHandle = function (h, how) { return listHandle(h).then(function (list) { return PE.openProjectFolder(list, { name: h.name, dirHandle: h, how: how || "folder" }); }); };
	/* File -> Open project folder…: a folder picker that can also save (Chrome / Edge), else the read-only folder input (Safari, Firefox, Brave without the flag) */
	PE.openProjectFolderPicker = function () {
		if (typeof window.showDirectoryPicker === "function") {
			var dh = PE.folderHandle && PE.folderHandle(), o = { id: "mes-photo-projdir", mode: "readwrite" }; if (dh) o.startIn = dh;
			window.showDirectoryPicker(o).then(function (h) { return PE.openFolderHandle(h, "open"); }).catch(function (x) { if (x && x.name === "AbortError") return; PE.toast("Could not open the folder: " + errText(x)); });
			return;
		}
		var inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.setAttribute("webkitdirectory", ""); inp.style.display = "none"; document.body.appendChild(inp);
		inp.addEventListener("change", function () { var fs = Array.prototype.slice.call(inp.files || []); inp.remove(); if (!fs.length) return; var top = (fs[0].webkitRelativePath || "").split("/")[0] || "folder";
			PE.openProjectFolder(fs.map(function (f) { return { path: (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name, file: f }; }), { name: top, how: "open" }); });
		inp.click();
	};
	PE.listFolderHandle = listHandle;

	/* ---------- moving to another computer (in File -> Files and folders) ---------- */
	PE.moveHelpEl = function () {
		var s = el("div", "pe-fx-move");
		s.innerHTML = "<p><b>A. The synced folder way</b> (best with OneDrive, Dropbox, Google Drive for desktop, iCloud Drive): keep your projects in a folder that syncs. On each computer, connect that folder here (or open the project with File → Open), press <b>Save project</b> once and tick <b>Auto-save</b> in the top bar: every change is written to the same file " + AUTO_FILE_MS / 1000 + " s after you stop, the sync service copies it, and on the other computer File → Open recent (or the folder) opens the latest. If both computers changed it, the editor asks <i>Keep mine</i> or <i>Open theirs</i>."
			+ (isBrave() || !canSavePicker() ? " <span class=\"pe-fx-tip\">Brave: this needs <code>" + BRAVE_FLAG + "</code> set to Enabled (then Relaunch). Without it, Save downloads a copy instead.</span>" : "") + "</p>"
			+ "<p><b>B. The file way</b> (any browser, phones too): <b>Save project</b> (or <i>Download project as .zip</i>) makes one file. Copy it to the other computer by USB stick, email, a chat app or any cloud drive, then drag it onto the editor there (or File → Open). A <b>.mesproj is an ordinary ZIP</b> (project.json + one PNG per layer and mask): rename it to .zip to look inside; a .zip like that opens here too.</p>"
			+ "<p><b>C. Not on mes.fm's servers.</b> The editor never uploads your projects: autosaves and Recent projects live only in this browser on this computer, so on another computer they are not there until you bring the file over.</p>";
		return s;
	};

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { PE.recentReady(); }); else setTimeout(function () { PE.recentReady(); }, 0);
})();

/* MES Photo Editor round 7 (2026-10-28):
 * - our own colour picker (PE.colorPop): every <input type="color"> in the editor opens it instead of the browser's own popup, which closed as soon as
 *   it was used. It stays open (pin) while you work: saturation / brightness square, hue strip, hex, R G B, pick from the picture, recent colours.
 * - Layer style (PE.dlgLayerStyle): a live outline (outside / centre / inside) and drop shadow / glow kept on the layer (L.fx), editable any time.
 * - Layer masks: a short "How masks work" guide (shown the first time a mask is added and from the ? next to the Mask button), and the Brush on a
 *   mask follows the colour: dark hides, light shows (tools.js).
 * - Crop Layer tool (Y): a crop box on one layer (L.crop, in the layer's own pixels) hides its edges without deleting them; drag the edges, drag inside
 *   to slide the window, Show all to uncrop. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel; if (!PE || !P) return;
	var el = function (t, c, h) { return PE.el(t, c, h); }, esc = function (s) { return PE.esc(s); };
	var KEY = "mes-photo-editor:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

	/* ================= colour picker ================= */
	var BASIC = ["#000000", "#ffffff", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff2d55", "#8e8e93"];
	var pop = null;   // {el, inp, key, h, s, v, pinned, changeT}
	function keyOf(inp) {
		if (inp.dataset.ck) return inp.dataset.ck;
		var box = inp.closest(".pe-opt, .pe-row, .pe-sw-fg, .pe-sw-bg, label"), lab = box && box.querySelector(".pe-opt-l, .pe-row-l");
		return (box ? box.className.split(" ")[0] : "x") + ":" + (lab ? lab.textContent.trim() : "");
	}
	function findInput() {
		if (!pop) return null; if (pop.inp && pop.inp.isConnected) return pop.inp;
		var all = document.querySelectorAll("#pe input[type=color]"); for (var i = 0; i < all.length; i++) if (keyOf(all[i]) === pop.key) { pop.inp = all[i]; return all[i]; }
		return null;
	}
	function recent() { var r = sget().crecent; return Array.isArray(r) ? r.filter(function (c) { return /^#[0-9a-f]{6}$/.test(c); }) : []; }
	function pushRecent(c) { var r = recent().filter(function (x) { return x !== c; }); r.unshift(c); sset({ crecent: r.slice(0, 12) }); }
	function hexNow() { var c = P.hsvToRgb(pop.h, pop.s, pop.v); return P.rgbToHex(c[0], c[1], c[2]); }
	function send(fire) {
		var inp = findInput(), hex = hexNow(); if (!inp) return;
		if (inp.value !== hex) { inp.value = hex; inp.dispatchEvent(new Event("input", { bubbles: true })); }
		clearTimeout(pop.changeT); var go = function () { var i2 = findInput(); if (i2) { i2.dispatchEvent(new Event("change", { bubbles: true })); pushRecent(hexNow()); drawRecent(); } };
		if (fire) go(); else pop.changeT = setTimeout(go, 350);
	}
	function setHex(hex, fire) { var c = P.hexToRgb(hex), h = P.rgbToHsv(c[0], c[1], c[2]); if (h[1] > 0.001 && h[2] > 0.001) pop.h = h[0]; pop.s = h[1]; pop.v = h[2]; paint(); send(fire); }
	function paint() {
		if (!pop) return; var e = pop.el, sv = e.querySelector(".pe-cp-sv"), hue = e.querySelector(".pe-cp-hue"), hex = hexNow(), rgb = P.hexToRgb(hex);
		var base = P.hsvToRgb(pop.h, 1, 1); sv.style.background = "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, " + P.rgbToHex(base[0], base[1], base[2]) + ")";
		var dot = e.querySelector(".pe-cp-dot"); dot.style.left = (pop.s * 100) + "%"; dot.style.top = ((1 - pop.v) * 100) + "%"; dot.style.background = hex;
		e.querySelector(".pe-cp-hk").style.left = (pop.h / 360 * 100) + "%";
		sv.setAttribute("aria-valuetext", "saturation " + Math.round(pop.s * 100) + "%, brightness " + Math.round(pop.v * 100) + "%"); hue.setAttribute("aria-valuenow", String(Math.round(pop.h)));
		var hx = e.querySelector(".pe-cp-hex"); if (document.activeElement !== hx) hx.value = hex;
		["r", "g", "b"].forEach(function (k, i) { var n = e.querySelector(".pe-cp-" + k); if (document.activeElement !== n) n.value = Math.round(rgb[i]); });
		e.querySelector(".pe-cp-now").style.background = hex;
	}
	function drawRecent() {
		if (!pop) return; var box = pop.el.querySelector(".pe-cp-sw"); box.innerHTML = "";
		var list = recent().concat(BASIC.filter(function (c) { return recent().indexOf(c) < 0; })).slice(0, 18);
		list.forEach(function (c) { var b = el("button", "pe-cp-chip"); b.type = "button"; b.style.background = c; b.title = c; b.setAttribute("aria-label", "Use " + c); b.addEventListener("click", function () { setHex(c, true); }); box.appendChild(b); });
	}
	function dragOn(node, fn) {
		node.addEventListener("pointerdown", function (e) { if (e.button > 0) return; e.preventDefault(); try { node.setPointerCapture(e.pointerId); } catch (x) {} fn(e); var mv = function (ev) { fn(ev); }, up = function () { node.removeEventListener("pointermove", mv); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up); send(true); }; node.addEventListener("pointermove", mv); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up); });
	}
	function place(inp) {
		var r = inp.getBoundingClientRect(), e = pop.el, w = e.offsetWidth, h = e.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
		var x = r.left, y = r.bottom + 6; if (x + w > vw - 8) x = vw - w - 8; if (y + h > vh - 8) y = Math.max(8, r.top - h - 6); e.style.left = Math.max(8, x) + "px"; e.style.top = Math.max(8, y) + "px";
	}
	PE.colorPopClose = function () { if (!pop) return; clearTimeout(pop.changeT); var i = findInput(); if (i) i.dispatchEvent(new Event("change", { bubbles: true })); pop.el.remove(); pop = null; };
	PE.colorPop = function (inp) {
		var pinned = sget().cpin !== false;
		if (pop && pop.inp === inp) { PE.colorPopClose(); return; }
		if (pop) PE.colorPopClose();
		var lab = (inp.closest(".pe-opt, .pe-row") || {}).querySelector ? (inp.closest(".pe-opt, .pe-row").querySelector(".pe-opt-l, .pe-row-l") || {}).textContent : "";
		var name = inp.dataset.cname || (lab ? lab.trim() : "Colour");
		var e = el("div", "pe-cpop"); e.setAttribute("role", "dialog"); e.setAttribute("aria-label", "Colour picker: " + name);
		e.innerHTML = '<div class="pe-cp-h"><b class="pe-cp-t">' + esc(name) + '</b><span class="pe-cp-now" aria-hidden="true"></span><button type="button" class="pe-cp-pin" aria-pressed="' + pinned + '" title="Keep this open while you work (clicks on the picture do not close it)">📌</button><button type="button" class="pe-cp-x" aria-label="Close" title="Close (Esc)">✕</button></div>'
			+ '<div class="pe-cp-sv" role="slider" tabindex="0" aria-label="Saturation and brightness (arrow keys)"><span class="pe-cp-dot"></span></div>'
			+ '<div class="pe-cp-hue" role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><span class="pe-cp-hk"></span></div>'
			+ '<div class="pe-cp-row"><label>Hex <input class="pe-cp-hex" type="text" maxlength="24" spellcheck="false" aria-label="Hex colour (or r, g, b)"></label><button type="button" class="pe-mini pe-cp-drop" title="Pick a colour from the picture" aria-label="Pick a colour from the picture">💉</button></div>'
			+ '<div class="pe-cp-row pe-cp-rgb"><label>R <input class="pe-cp-r" type="number" min="0" max="255"></label><label>G <input class="pe-cp-g" type="number" min="0" max="255"></label><label>B <input class="pe-cp-b" type="number" min="0" max="255"></label></div>'
			+ '<div class="pe-cp-sl">Recent and basic colours</div><div class="pe-cp-sw"></div>';
		(PE.els.root || document.body).appendChild(e);
		pop = { el: e, inp: inp, key: keyOf(inp), h: 0, s: 0, v: 0, pinned: pinned };
		var c = P.hexToRgb(inp.value || "#000000"), hv = P.rgbToHsv(c[0], c[1], c[2]); pop.h = hv[0]; pop.s = hv[1]; pop.v = hv[2];
		var sv = e.querySelector(".pe-cp-sv"), hue = e.querySelector(".pe-cp-hue");
		dragOn(sv, function (ev) { var r = sv.getBoundingClientRect(); pop.s = P.clamp((ev.clientX - r.left) / r.width, 0, 1); pop.v = P.clamp(1 - (ev.clientY - r.top) / r.height, 0, 1); paint(); send(false); });
		dragOn(hue, function (ev) { var r = hue.getBoundingClientRect(); pop.h = P.clamp((ev.clientX - r.left) / r.width, 0, 1) * 359.9; paint(); send(false); });
		sv.addEventListener("keydown", function (ev) { var d = ev.shiftKey ? 0.1 : 0.02; if (ev.key === "ArrowLeft") pop.s -= d; else if (ev.key === "ArrowRight") pop.s += d; else if (ev.key === "ArrowUp") pop.v += d; else if (ev.key === "ArrowDown") pop.v -= d; else return; ev.preventDefault(); pop.s = P.clamp(pop.s, 0, 1); pop.v = P.clamp(pop.v, 0, 1); paint(); send(false); });
		hue.addEventListener("keydown", function (ev) { var d = ev.shiftKey ? 15 : 3; if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") pop.h = (pop.h - d + 360) % 360; else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") pop.h = (pop.h + d) % 360; else return; ev.preventDefault(); paint(); send(false); });
		var hx = e.querySelector(".pe-cp-hex"); hx.addEventListener("input", function () { var v = P.parseColor(hx.value); if (v) setHex(v, false); hx.classList.toggle("is-bad", !v); });
		hx.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { var v = P.parseColor(hx.value); if (v) setHex(v, true); } });
		hx.addEventListener("blur", function () { hx.classList.remove("is-bad"); paint(); });
		["r", "g", "b"].forEach(function (k) { var n = e.querySelector(".pe-cp-" + k); n.addEventListener("input", function () { var v = ["r", "g", "b"].map(function (q) { return P.clamp(+e.querySelector(".pe-cp-" + q).value || 0, 0, 255); }); setHex(P.rgbToHex(v[0], v[1], v[2]), false); }); });
		e.querySelector(".pe-cp-drop").addEventListener("click", function () { if (!PE.doc) { PE.toast("Open an image first"); return; } PE.pickColorFromImage({ label: name.toLowerCase(), apply: function (hex) { if (pop) setHex(hex, true); else { var i = findInput(); if (i) { i.value = hex; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); } } } }); });
		e.querySelector(".pe-cp-x").addEventListener("click", PE.colorPopClose);
		var pin = e.querySelector(".pe-cp-pin"); pin.addEventListener("click", function () { pop.pinned = !pop.pinned; pin.setAttribute("aria-pressed", String(pop.pinned)); sset({ cpin: pop.pinned }); });
		// drag the window by its title bar
		var head = e.querySelector(".pe-cp-h"); head.addEventListener("pointerdown", function (ev) { if (ev.target.closest("button")) return; ev.preventDefault(); var r = e.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top; head.setPointerCapture(ev.pointerId);
			var mv = function (m) { e.style.left = P.clamp(m.clientX - dx, 0, window.innerWidth - 60) + "px"; e.style.top = P.clamp(m.clientY - dy, 0, window.innerHeight - 40) + "px"; }, up = function () { head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", up); }; head.addEventListener("pointermove", mv); head.addEventListener("pointerup", up); });
		drawRecent(); paint(); place(inp); sv.focus({ preventScroll: true });
	};
	/* every colour well in the editor opens our picker (the browser's own closes after one click) */
	document.addEventListener("click", function (e) {
		var t = e.target; if (!t || t.tagName !== "INPUT" || t.type !== "color" || !t.closest("#pe") || t.dataset.native) return;
		e.preventDefault(); PE.colorPop(t);
	}, true);
	document.addEventListener("pointerdown", function (e) {
		if (!pop || e.target.closest(".pe-cpop") || (e.target.tagName === "INPUT" && e.target.type === "color")) return;
		if (!findInput()) { PE.colorPopClose(); return; }   // its colour well went away (a dialog was closed)
		if (!pop.pinned) PE.colorPopClose();
	}, true);
	window.addEventListener("keydown", function (e) { if (pop && e.key === "Enter" && e.target.closest && e.target.closest(".pe-cpop")) { e.stopPropagation(); if (e.target.classList.contains("pe-cp-hex")) { var v = P.parseColor(e.target.value); if (v) setHex(v, true); } return; }   // never the open dialog's OK button
		if (pop && e.key === "Escape" && !(PE.toolId === "eyedropper" && e.target === PE.els.over)) { e.stopPropagation(); e.preventDefault(); PE.colorPopClose(); } }, true);
	window.addEventListener("resize", function () { if (pop && pop.el.getBoundingClientRect().left > window.innerWidth - 40) place(findInput() || pop.el); });

	/* ================= layer style: outline + drop shadow / glow (non-destructive) ================= */
	function P2(k, label, min, max, val, step, unit) { return { k: k, label: label, type: "range", min: min, max: max, step: step || 1, val: val, unit: unit || "" }; }
	PE.dlgLayerStyle = function (L, focus) {
		L = L || PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; }
		if (PE.isGroup(L)) { PE.toast("Select a layer (not a group) to give it an outline or shadow"); return; }
		if (L.locked) { PE.toast("This layer is locked"); return; }
		var id = L.id, cur = function () { return PE.layerById(id); }, old = L.fx ? JSON.parse(JSON.stringify(L.fx)) : null, F = JSON.parse(JSON.stringify(PE.FXDEF)), o = Object.assign(F.outline, old && old.outline || {}), s = Object.assign(F.shadow, old && old.shadow || {});
		if (focus === "outline" && !(old && old.outline && old.outline.on)) o.on = true; if (focus === "shadow" && !(old && old.shadow && old.shadow.on)) s.on = true;
		if (focus === "glow" && !(old && old.shadow && old.shadow.on)) { s.on = true; s.dx = 0; s.dy = 0; s.blur = 18; s.c = "#ffffff"; s.op = 0.9; }
		var wrap = el("div", "pe-lstyle"), done = false;
		var f = PE.form([{ k: "oOn", label: "Outline", type: "check", val: o.on, help: "A line around the layer's visible pixels (a cut-out, a text, a logo...). It follows the shape and updates when you paint, crop or mask the layer." },
			{ k: "oC", label: "Outline colour", type: "color", val: o.c }, P2("oW", "Outline width", 1, 80, o.w, 1, "px"),
			{ k: "oPos", label: "Position", type: "seg", options: [["outside", "Outside"], ["center", "Centre"], ["inside", "Inside"]], val: o.pos, help: "<p><b>Outside</b>: around the edge, the layer is not covered.</p><p><b>Centre</b>: half outside, half over the edge.</p><p><b>Inside</b>: over the edge of the layer itself (nothing is added outside).</p>" },
			P2("oOp", "Outline opacity", 5, 100, Math.round(o.op * 100), 1, "%"),
			{ k: "sOn", label: "Shadow / glow", type: "check", val: s.on, help: "A soft shadow behind the layer. For a glow set X and Y to 0, choose a light colour and raise the blur." },
			{ k: "sC", label: "Shadow colour", type: "color", val: s.c }, P2("sOp", "Shadow opacity", 5, 100, Math.round(s.op * 100), 1, "%"), P2("sB", "Blur", 0, 80, s.blur, 1, "px"), P2("sX", "Shadow X", -80, 80, s.dx, 1, "px"), P2("sY", "Shadow Y", -80, 80, s.dy, 1, "px")], function () { vis(); live(); });
		wrap.appendChild(f.el); wrap.appendChild(el("p", "pe-hint2", "The style stays editable: open Layer → Layer style again (or the fx button on the layer) to change or remove it. Nothing in the layer itself is changed."));
		function row(k) { return f.inputs[k] && (f.inputs[k].inp.closest(".pe-row") || f.inputs[k].inp.parentNode); }
		function vis() { var v = f.get(); ["oC", "oW", "oPos", "oOp"].forEach(function (k) { var r = row(k); if (r) r.style.display = v.oOn ? "" : "none"; }); ["sC", "sOp", "sB", "sX", "sY"].forEach(function (k) { var r = row(k); if (r) r.style.display = v.sOn ? "" : "none"; }); }
		function build() { var v = f.get(); return { outline: { on: !!v.oOn, w: +v.oW, c: v.oC, pos: v.oPos, op: v.oOp / 100 }, shadow: { on: !!v.sOn, c: v.sC, op: v.sOp / 100, blur: +v.sB, dx: +v.sX, dy: +v.sY } }; }
		function live() { var Lc = cur(); if (!Lc) return; var fx = build(); Lc.fx = fx.outline.on || fx.shadow.on ? fx : null; PE.invalidate(); }
		vis(); live();
		PE.modal({ title: "Layer style: " + L.name, body: wrap, onClose: function () { if (!done) { var Lc = cur(); if (Lc) { Lc.fx = old; PE.invalidate(); } } }, buttons: [
			{ label: "Remove style", act: function (m) { done = true; var Lc = cur(); if (Lc) { Lc.fx = null; PE.commit("Remove layer style"); } m.close(); } },
			{ label: "Cancel", act: function (m) { m.close(); } },
			{ label: "Apply", primary: true, act: function (m) { done = true; live(); PE.commit("Layer style"); PE.emit("layers"); m.close(); } }] });
	};

	/* ================= layer masks: the guide ================= */
	var MASKHELP = "<ol class=\"pe-steps\"><li><b>Add a mask.</b> Select a layer and press <b>◑ Mask</b>. Nothing changes yet: a white box appears next to the layer's picture in the Layers list. That box is the mask.</li>"
		+ "<li><b>Paint on the mask.</b> While the mask box is outlined, the Brush paints on the mask, not on the picture: <b>black hides</b> that part of the layer, <b>white brings it back</b>, grey makes it see-through. The Eraser also hides. Press <kbd>X</kbd> to swap black and white.</li>"
		+ "<li><b>Switch back.</b> Click the layer's picture box to paint on the picture again, the mask box to paint on the mask. The status bar says which one you are painting on. Shift-click the mask box to switch the mask off for a moment, Alt-click it to see the mask itself.</li>"
		+ "<li><b>Finish.</b> Nothing is ever deleted, so you can fix mistakes any time. Layer → <b>Apply layer mask</b> makes the hiding permanent; <b>Delete layer mask</b> brings the whole layer back.</li></ol>"
		+ "<p class=\"pe-hint2\">Tip: with a selection made first, the new mask shows only the selected part.</p>";
	PE.maskHelp = function () { var w = el("div", "pe-maskhelp", MASKHELP); PE.modal({ title: "How layer masks work", body: w, buttons: [{ label: "Got it", primary: true, act: function (m) { m.close(); } }] }); };
	var addMask0 = PE.addMask;
	PE.addMask = function (L, fromSel) {
		L = L || PE.active(); if (!L) return; if (PE.isGroup(L)) { PE.toast("Masks go on a layer, not on a group"); return; } if (L.mask) { PE.toast("This layer already has a mask"); return; }
		addMask0(L, fromSel); PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color");
		if (!sget().maskHelpSeen) { sset({ maskHelpSeen: true }); setTimeout(PE.maskHelp, 60); } else PE.toast("Mask added: paint black to hide, white to bring back (X swaps)");
	};
	/* the mask as a black and white picture (Alt-click the mask box) */
	PE.maskView = function (L) {
		var m = L.mask, k = L._mv; if (k && k.rev === L.rev && k.m === m) return k.c; var c = PE.mk(m.width, m.height), x = c.getContext("2d");
		x.drawImage(m, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = "destination-over"; x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height);
		L._mv = { rev: L.rev, m: m, c: c }; return c;
	};

	/* ================= Crop Layer tool ================= */
	var cd = null, HD = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
	function okLayer(quiet) { var L = PE.active(); if (!L || PE.isGroup(L)) { if (!quiet) PE.toast("Select a layer (not a group) to crop"); return null; } if (L.locked) { if (!quiet) PE.toast("This layer is locked"); return null; } return L; }
	function boxOf(L) { return L.crop || { x: 0, y: 0, w: L.canvas.width, h: L.canvas.height }; }
	function toDocPt(L, u, v) { var c = Math.cos(L.rot), s = Math.sin(L.rot), lx = (u - L.canvas.width / 2) * L.sx, ly = (v - L.canvas.height / 2) * L.sy; return { x: L.cx + c * lx - s * ly, y: L.cy + s * lx + c * ly }; }
	function scrPt(L, u, v) { var p = toDocPt(L, u, v); return PE.toScreen(p.x, p.y); }
	PE.clearLayerCrop = function (L) { L = L || PE.active(); if (!L || !L.crop) { PE.toast("This layer is not cropped"); return; } L.crop = null; L.rev++; PE.commit("Show whole layer"); };
	PE.defTool({ id: "layercrop", name: "Crop Layer (hide edges)", key: "y", icon: "⛶", opts: {},
		ui: [{ type: "button", label: "Show whole layer (uncrop)", act: function () { PE.clearLayerCrop(); PE.invalidateOverlay(); } }, { type: "button", label: "✓ Done (Move tool)", act: function () { PE.setTool("move"); } }],
		hint: "Crops one layer without deleting anything: drag the edges or corners of the box to hide parts of the layer, drag inside the box to slide what shows. Show whole layer brings it all back. Then use the Move tool to place the layer. Enter = done.",
		down: function (e) {
			var L = okLayer(); if (!L) return; var b = boxOf(L), sp = PE.toScreen(e.x, e.y), i;
			for (i = 0; i < 8; i++) { var h = HD[i], q = scrPt(L, b.x + (h[0] + 1) / 2 * b.w, b.y + (h[1] + 1) / 2 * b.h); if (Math.hypot(q.x - sp.x, q.y - sp.y) < 11) { cd = { L: L, h: h, b0: Object.assign({}, b), p0: PE.toLayerPt(L, e.x, e.y) }; return; } }
			var p = PE.toLayerPt(L, e.x, e.y); if (p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h) { cd = { L: L, slide: true, b0: Object.assign({}, b), p0: p }; return; }
			PE.toast("Drag the edges of the box (or inside it) on the selected layer");
		},
		move: function (e) {
			if (!cd) return; var L = cd.L, p = PE.toLayerPt(L, e.x, e.y), dx = p.x - cd.p0.x, dy = p.y - cd.p0.y, cw = L.canvas.width, ch = L.canvas.height, b0 = cd.b0, nb;
			if (cd.slide) nb = { x: P.clamp(b0.x + dx, 0, cw - b0.w), y: P.clamp(b0.y + dy, 0, ch - b0.h), w: b0.w, h: b0.h }; else nb = P.dragCrop(b0, cd.h[0], cd.h[1], dx, dy, cw, ch);
			L.crop = P.clampCrop(nb, cw, ch); L._fxc = null; PE.invalidate(); var bb = boxOf(L); PE.emit("cropinfo", { w: Math.round(bb.w * Math.abs(L.sx)), h: Math.round(bb.h * Math.abs(L.sy)) });
		},
		up: function () { if (!cd) return; var L = cd.L, ch = JSON.stringify(L.crop) !== JSON.stringify(cd.b0.w === L.canvas.width && cd.b0.h === L.canvas.height && !cd.b0.x && !cd.b0.y ? null : cd.b0); cd = null; if (ch) { L.rev++; PE.commit("Crop layer"); } },
		enter: function () { PE.setTool("move"); },
		cancel: function () { cd = null; },
		overlay: function (x) {
			var L = okLayer(true); if (!L || !PE.effVisible(L)) return; var b = boxOf(L), full = [[0, 0], [L.canvas.width, 0], [L.canvas.width, L.canvas.height], [0, L.canvas.height]].map(function (q) { return scrPt(L, q[0], q[1]); }), box = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(function (q) { return scrPt(L, q[0], q[1]); });
			var dpr = PE.view.dpr || 1; x.save(); x.setTransform(dpr, 0, 0, dpr, 0, 0);
			// the hidden part of the layer, shown faintly so you can see what you are cropping away
			x.globalAlpha = 0.35; x.save(); x.beginPath(); full.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); box.slice().reverse().forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.clip("evenodd");
			var m = [Math.cos(L.rot) * L.sx, Math.sin(L.rot) * L.sx, -Math.sin(L.rot) * L.sy, Math.cos(L.rot) * L.sy], v = PE.view; x.setTransform(dpr * v.zoom * m[0], dpr * v.zoom * m[1], dpr * v.zoom * m[2], dpr * v.zoom * m[3], dpr * (L.cx * v.zoom + v.px), dpr * (L.cy * v.zoom + v.py));
			x.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2); x.restore(); x.globalAlpha = 1;
			x.setLineDash([5, 4]); x.strokeStyle = "#9b9bab"; x.lineWidth = 1; x.beginPath(); full.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke(); x.setLineDash([]);
			x.strokeStyle = "#fff"; x.lineWidth = 3; x.beginPath(); box.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke(); x.strokeStyle = "#7c3aed"; x.lineWidth = 1.5; x.stroke();
			HD.forEach(function (h) { var q = scrPt(L, b.x + (h[0] + 1) / 2 * b.w, b.y + (h[1] + 1) / 2 * b.h); x.fillStyle = "#fff"; x.strokeStyle = "#7c3aed"; x.lineWidth = 2; x.beginPath(); x.rect(q.x - 5, q.y - 5, 10, 10); x.fill(); x.stroke(); });
			x.restore();
		} });
	// a Crop layer button in the Move tool's options and the layer's right-click menu (app.js)
	if (PE.tools.move && PE.tools.move.ui) PE.tools.move.ui.push({ type: "button", label: "⛶ Crop layer", act: function () { if (okLayer()) PE.setTool("layercrop"); } });
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
	var ORDER = ["move", "marquee", "lasso", "wand", "crop", "layercrop", "brush", "smudge", "eraser", "clone", "retouch", "objerase", "bucket", "gradient", "eyedropper", "text", "equation", "shape", "hand", "zoom"];
	var HELP = {
		move: "Move, resize and rotate layers. Drag a layer to move it. Several at once: Ctrl / Cmd- or Shift-click layers on the picture (or in the Layers panel), or drag a box on empty canvas (or from outside the picture) to pick every layer it touches; Shift-drag a box adds to the selection. Then drag any of them to move them all, or drag the handles of the combined box to resize them together (rotating works on one layer at a time). While moving or resizing, the layer snaps to the canvas edges and centre (magenta guides) and to other layers' edges and centres (cyan guides); hold Ctrl (or Alt while moving) to place freely. Shift while moving keeps to one direction; on a handle, Shift switches between keeping and changing the proportions and Alt resizes from the centre. Drag just outside a corner to rotate. Arrow keys nudge the selection by 1 px (Shift = 10 px). Double-click a text to edit it.",
		marquee: "Draw a rectangle or ellipse selection. Anything you then do (fill, delete, adjust, copy) only touches the selection. Shift while dragging = square or circle, Shift-drag on an existing selection = add to it, Alt = subtract. Drag inside a selection to move it, click once to deselect. Feather softens the edge.",
		lasso: "Select any shape. Freehand: drag around the area. Polygon: click each corner, then double-click or press Enter to close. Use the Mode buttons to add to, subtract from or intersect an existing selection.",
		wand: "Click a colour to select every touching pixel of a similar colour. Raise Tolerance to include more shades. Click the background, press Delete, then export as PNG for a transparent background.",
		crop: "Cut the picture down to part of it. Drag the box or its handles, pick a ratio in the option bar if you want one, then press Enter or Apply. Everything outside the box is removed.",
		brush: "Paint with the foreground colour. [ and ] change the size, Shift-click draws a straight line from the last point. Opacity, hardness and size are in the option bar. On a layer mask the brush reveals the layer.",
		smudge: "Drag to smear colours along, like pulling a finger through wet paint. Strength decides how far the colour is carried; Size and Hardness work like the brush.",
		eraser: "Erase pixels on the active layer (they become transparent). Same size and hardness controls as the brush. On a layer mask the eraser hides parts of the layer without destroying them.",
		clone: "Copy one part of the picture over another. Alt-click to choose the source spot, then paint where the copy should go. Good for removing blemishes, dust and small objects.",
		retouch: "Paint to blur, sharpen, lighten, darken or change the saturation only where you drag. Choose the effect and its strength in the option bar.",
		objerase: "AI object remover. Paint over the thing you want gone (Alt un-paints), then press Enter or the Erase button. The AI fills the area from its surroundings. Works best on small objects against plain or repeating backgrounds. The model downloads once on first use.",
		bucket: "Click an area to fill it with the foreground colour. Tolerance decides how similar a colour must be to be filled. With a selection active, only the selection is filled.",
		gradient: "Drag from where the gradient should start to where it should end. It blends the foreground and background colours and respects any selection.",
		eyedropper: "Press and drag over the picture: a magnifier follows the pointer and shows the pixels, the colour and its hex code; let go to use it as the foreground colour (Alt = background). Sample = 1 pixel or the average of a 3 × 3 / 5 × 5 area; All layers = the colour you see, off = only the selected layer. With Confirm with a button, letting go leaves a Use this colour / Cancel bar and you can drag again to move the sample point. The 💉 buttons next to the colour wells and the option bar colours do the same for one pick.",
		text: "Click empty canvas to add a text; click an existing text to edit it right on the picture. The caret goes where you click; drag to select, double-click selects a word, triple-click a line, Shift-click extends. Enter starts a new line; Ctrl+Enter, Esc or a click outside finishes. The option bar (font, size, colour, outline, box...) changes the selected text layer live, also while you type, and the whole edit is one undo step. Drag the purple handle on the right of the frame to wrap the text to a width. Each text is its own layer, so you can move, scale and rotate it later.",
		equation: "Insert a maths equation. Click where it goes, type LaTeX (a live preview appears), then Insert. Click an existing equation to edit it. Equations stay sharp when enlarged.",
		shape: "Draw rectangles, rounded boxes, ellipses, lines, arrows, callouts, numbered step badges, highlights and blur / hide areas. Shift = square or straight line. Outline uses the foreground colour, fill uses the background colour. Each shape lands on its own layer.",
		hand: "Drag to pan around a zoomed-in picture. You can also hold Space with any tool, or use the middle mouse button.",
		zoom: "Click to zoom in, Alt-click to zoom out. Ctrl + mouse wheel also zooms, and Ctrl+0 fits the picture to the window.",
		layercrop: "Crops ONE layer without deleting anything (like Camtasia): drag the edges or corners of the purple box to hide the sides of the selected layer, drag inside the box to slide what shows. The hidden part is kept, so Show whole layer brings it back any time. Then use the Move tool to place the layer; the crop moves with it."
	};
	var UI = S.ui || { tw: false, sw: 17.5, side: "r", hide: false }; if (!UI.tws) UI.tws = 15.5; if (!UI.tside) UI.tside = "l";
	function saveUI() { sset({ ui: UI }); }
	function closeHelp() { var h = root.querySelector(".pe-help"); if (h) h.remove(); }
	function showHelp(id, anchor) {
		closeHelp(); var t = PE.tools[id]; if (!t) return; var h = el("div", "pe-help"), r = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect();
		h.setAttribute("role", "dialog"); h.innerHTML = '<div class="pe-help-t">' + esc(t.icon) + " " + esc(t.name) + (t.key ? ' <kbd>' + esc(t.key.toUpperCase()) + "</kbd>" : "") + '</div><p>' + esc(HELP[id] || t.hint || "") + '</p><button type="button" class="pe-btn pe-btn--sm">Got it</button>';
		h.querySelector("button").addEventListener("click", closeHelp); root.appendChild(h);
		var top = Math.max(4, Math.min(r.top - rr.top - 8, rr.height - h.offsetHeight - 8)); h.style.top = top + "px"; h.style.left = (UI.side === "l" && !UI.hide ? 4 : (r.right - rr.left + 8)) + "px";
		if (UI.side === "l" && !UI.hide) h.style.left = (r.right - rr.left + 8) + "px";
	}
	document.addEventListener("mousedown", function (e) { if (!e.target.closest || (!e.target.closest(".pe-help") && !e.target.closest(".pe-thelp"))) closeHelp(); });
	document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeHelp(); });
	function applyUI() {
		var main = root.querySelector(".pe-main"), tools = $("pe-tools"), side = $("pe-side");
		tools.classList.toggle("pe-tools--wide", !!UI.tw); main.classList.toggle("pe-main--sl", UI.side === "l"); main.classList.toggle("pe-main--tr", UI.tside === "r"); main.classList.toggle("pe-main--shide", !!UI.hide);
		side.style.width = UI.sw + "em"; tools.style.width = UI.tw ? UI.tws + "em" : ""; var tg = $("pe-ttoggle"); if (tg) { tg.textContent = UI.tw ? "« Collapse" : "»"; tg.title = UI.tw ? "Show only the icons" : "Show the tool names and help"; tg.setAttribute("aria-pressed", UI.tw ? "true" : "false"); }
		var ts = $("pe-tswap"); if (ts) ts.title = UI.tside === "r" ? "Move the toolbox to the left" : "Move the toolbox to the right";
		var sw = $("pe-sswap"); if (sw) sw.title = UI.side === "l" ? "Move the panels to the right" : "Move the panels to the left";
		var sh = $("pe-sshow"); if (sh) { sh.hidden = !UI.hide; sh.textContent = UI.side === "l" ? "Panels ›" : "‹ Panels"; }
		ariaSide(); setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 0);
	}
	function ariaSide() { var g = $("pe-sgrip"), s = $("pe-side"); if (!g) return; var fs = parseFloat(getComputedStyle(s).fontSize) || 13, now = Math.round(s.getBoundingClientRect().width) || Math.round(UI.sw * fs); g.setAttribute("aria-valuemin", String(Math.round(12 * fs))); g.setAttribute("aria-valuemax", String(Math.round(48 * fs))); g.setAttribute("aria-valuenow", String(now)); g.setAttribute("aria-valuetext", "Panels " + now + " pixels wide"); }
	function initLayoutUI() {
		var tg = el("button", "pe-ttoggle", "»"); tg.type = "button"; tg.id = "pe-ttoggle"; tg.addEventListener("click", function () { UI.tw = !UI.tw; saveUI(); applyUI(); }); var th = el("div", "pe-thead"), tsw = el("button", "pe-tswap", "⇄"); tsw.type = "button"; tsw.id = "pe-tswap"; tsw.addEventListener("click", function () { UI.tside = UI.tside === "r" ? "l" : "r"; saveUI(); applyUI(); }); th.appendChild(tg); th.appendChild(tsw); $("pe-tools").insertBefore(th, $("pe-tools").firstChild);
		var bar = el("div", "pe-sbar"); bar.innerHTML = '<span>Panels</span><button type="button" id="pe-sswap" class="pe-mini">⇄</button><button type="button" id="pe-shide" class="pe-mini" title="Hide the panels (more room for the picture)">Hide ✕</button>'; $("pe-side").insertBefore(bar, $("pe-side").firstChild);
		/* the panels' grip is its own flex item between the picture and the panels (it used to sit inside the scrolling panel column, where the
		   search box's .pe-sres styles moved it to the bottom as an 8 px square: that is why the panels could not be resized) */
		var side = $("pe-side"), grip = el("div", "pe-sgrip"); grip.id = "pe-sgrip"; grip.tabIndex = 0; grip.setAttribute("role", "separator"); grip.setAttribute("aria-orientation", "vertical"); grip.setAttribute("aria-controls", "pe-side"); grip.setAttribute("aria-label", "Width of the panels");
		grip.title = "Drag to make the panels wider or narrower. Arrow keys work too when it is selected (Shift = bigger steps). Double-click: back to the normal width."; grip.innerHTML = "<i></i>"; side.parentNode.insertBefore(grip, side);
		var show = el("button", "pe-sshow", "‹ Panels"); show.type = "button"; show.id = "pe-sshow"; show.hidden = true; $("pe-stage").appendChild(show);
		$("pe-sswap").addEventListener("click", function () { UI.side = UI.side === "l" ? "r" : "l"; saveUI(); applyUI(); });
		$("pe-shide").addEventListener("click", function () { UI.hide = true; saveUI(); applyUI(); }); show.addEventListener("click", function () { UI.hide = false; saveUI(); applyUI(); });
		function fsOf() { return parseFloat(getComputedStyle(side).fontSize) || 13; }
		function otherW() { var w = 0; Array.prototype.forEach.call(root.querySelector(".pe-main").children, function (c) { if (c !== side && c !== grip && c !== PE.els.stage && c.offsetParent !== null) w += c.offsetWidth; }); return w; }
		function setSide(em, save) { UI.sw = P.panelClamp(em, root.querySelector(".pe-main").clientWidth, otherW() + grip.offsetWidth, fsOf()); side.style.width = UI.sw + "em"; ariaSide(); if (save) saveUI(); }
		PE.setPanelWidth = setSide;
		grip.addEventListener("dblclick", function () { setSide(17.5, true); });
		grip.addEventListener("keydown", function (e) { var r = P.panelKey(e.key, e.shiftKey, UI.side === "l"); if (!r) return; e.preventDefault(); e.stopPropagation(); setSide(r.to === "reset" ? 17.5 : r.to === "min" ? 0 : r.to === "max" ? 999 : UI.sw + r.d, true); });
		grip.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return; e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch (x) {} grip.classList.add("is-drag"); grip.focus({ preventScroll: true });
			var x0 = e.clientX, w0 = side.getBoundingClientRect().width, fs = fsOf(), dir = UI.side === "l" ? 1 : -1;
			function mv(ev) { setSide((w0 + (ev.clientX - x0) * dir) / fs, false); }
			function up() { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up); grip.classList.remove("is-drag"); saveUI(); window.dispatchEvent(new Event("resize")); }
			grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
		});
		var tg2 = el("div", "pe-tres"); tg2.title = "Drag to make the toolbox wider or narrower (double-click to reset)"; $("pe-tools").parentNode.insertBefore(tg2, $("pe-tools").nextSibling);
		tg2.addEventListener("dblclick", function () { UI.tws = 15.5; UI.tw = true; saveUI(); applyUI(); });
		tg2.addEventListener("pointerdown", function (e) { e.preventDefault(); tg2.setPointerCapture(e.pointerId); var x0 = e.clientX, w0 = $("pe-tools").getBoundingClientRect().width, fs = parseFloat(getComputedStyle($("pe-tools")).fontSize) || 16, dir = UI.tside === "r" ? -1 : 1;
			function mv(ev) { var w = (w0 + (ev.clientX - x0) * dir) / fs; if (w < 7) { UI.tw = false; } else { UI.tw = true; UI.tws = Math.max(9, Math.min(30, w)); } applyUI(); }
			function up() { tg2.removeEventListener("pointermove", mv); tg2.removeEventListener("pointerup", up); saveUI(); window.dispatchEvent(new Event("resize")); } tg2.addEventListener("pointermove", mv); tg2.addEventListener("pointerup", up); });
		applyUI();
	}
	/* the tool panel in groups (round 7): fold a group, Arrange mode = drag tools to reorder or into another group, new / rename / delete groups, hide
	   tools you never use (their keys still work), Reset. Saved as UI.tl {groups: [{id, name, open, tools}], hidden: [ids]} (MESPixel.normToolLayout). */
	var TL_DEF = [{ id: "sel", name: "Select & move", tools: ["move", "marquee", "lasso", "wand", "crop", "layercrop"] }, { id: "paint", name: "Paint & fix", tools: ["brush", "smudge", "eraser", "clone", "retouch", "objerase", "bucket", "gradient"] },
		{ id: "add", name: "Text & shapes", tools: ["text", "equation", "shape"] }, { id: "view", name: "Colour & view", tools: ["eyedropper", "hand", "zoom"] }];
	var arranging = false, tdrag = null;
	function toolLayout() { return P.normToolLayout(UI.tl, ORDER.filter(function (id) { return PE.tools[id]; }), TL_DEF); }
	function saveLayout(L) { UI.tl = L; saveUI(); drawTools(); }
	function toolRow(id) {
		var t = PE.tools[id], row = el("div", "pe-trow"), b = el("button", "pe-tool"); row.dataset.t = id; b.type = "button"; b.dataset.t = id; b.title = t.name + " (" + t.key.toUpperCase() + ")"; b.setAttribute("aria-label", t.name); b.setAttribute("aria-pressed", PE.toolId === id ? "true" : "false");
		b.innerHTML = '<span class="pe-ticon">' + esc(t.icon) + '</span><span class="pe-tname">' + esc(t.name.replace(/ \(.*\)$/, "")) + '</span><kbd class="pe-tkey">' + esc(t.key.toUpperCase()) + "</kbd>"; b.addEventListener("click", function () { if (!arranging) PE.setTool(id); });
		row.appendChild(b);
		if (arranging) {
			row.draggable = true; row.classList.add("is-arr");
			var hb = el("button", "pe-thide", "✕"); hb.type = "button"; hb.title = "Hide this tool (its key still works; show it again from Hidden tools)"; hb.setAttribute("aria-label", "Hide " + t.name); hb.addEventListener("click", function () { saveLayout(P.moveTool(toolLayout(), id, "hidden")); }); row.appendChild(hb);
			row.addEventListener("dragstart", function (e) { tdrag = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pe-tool", id); row.classList.add("is-dragging"); });
			row.addEventListener("dragend", function () { tdrag = null; row.classList.remove("is-dragging"); clearMarks(); });
			row.addEventListener("dragover", function (e) { if (!tdrag) return; e.preventDefault(); clearMarks(); var r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? "is-over-above" : "is-over-below"); });
			row.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); e.stopPropagation(); var r = row.getBoundingClientRect(), below = e.clientY >= r.top + r.height / 2, L = toolLayout(), gid = row.closest(".pe-tgrp").dataset.g, g = L.groups.filter(function (x) { return x.id === gid; })[0], src = tdrag; tdrag = null; if (!g || src === id) { drawTools(); return; }
				var list = g.tools.filter(function (x) { return x !== src; }), at = list.indexOf(id) + (below ? 1 : 0); saveLayout(P.moveTool(L, src, gid, at)); });
			// keyboard: Alt+Up / Alt+Down move the tool inside its group
			b.addEventListener("keydown", function (e) { if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return; e.preventDefault(); var L = toolLayout(), g = L.groups.filter(function (x) { return x.tools.indexOf(id) >= 0; })[0]; if (!g) return; var i = g.tools.indexOf(id) + (e.key === "ArrowUp" ? -1 : 1); if (i < 0 || i >= g.tools.length) return; saveLayout(P.moveTool(L, id, g.id, i)); setTimeout(function () { var nb = $("pe-tools").querySelector('.pe-tool[data-t="' + id + '"]'); if (nb) nb.focus(); }, 0); });
		} else {
			var q = el("button", "pe-thelp", "?"); q.type = "button"; q.title = "What is this tool and how do I use it?"; q.setAttribute("aria-label", "Help: " + t.name); q.addEventListener("click", function () { showHelp(id, row); }); row.appendChild(q);
		}
		return row;
	}
	function clearMarks() { Array.prototype.forEach.call($("pe-tools").querySelectorAll(".is-over-above,.is-over-below,.is-over-into"), function (r) { r.classList.remove("is-over-above", "is-over-below", "is-over-into"); }); }
	function drawTools() {
		var box = $("pe-tools"), head = box.querySelector(".pe-thead"); Array.prototype.slice.call(box.children).forEach(function (c) { if (c !== head) c.remove(); });
		var L = toolLayout(); box.classList.toggle("pe-tools--arr", arranging);
		var ab = $("pe-tarr"); if (ab) { ab.setAttribute("aria-pressed", arranging ? "true" : "false"); ab.textContent = arranging ? "✓ Done" : "⚙"; ab.title = arranging ? "Finish arranging" : "Arrange the tools: drag to reorder, group, hide"; }
		L.groups.forEach(function (g) {
			var gw = el("div", "pe-tgrp" + (g.open ? "" : " is-closed")); gw.dataset.g = g.id; gw.setAttribute("role", "group"); gw.setAttribute("aria-label", g.name);
			var gh = el("div", "pe-tgh"), fold = el("button", "pe-tgfold"); fold.type = "button"; fold.setAttribute("aria-expanded", g.open ? "true" : "false"); fold.title = (g.open ? "Fold " : "Open ") + g.name; fold.innerHTML = '<span class="pe-tgar" aria-hidden="true">' + (g.open ? "▾" : "▸") + '</span><span class="pe-tgn">' + esc(g.name) + "</span>" + (g.open ? "" : '<span class="pe-tgc">' + g.tools.length + "</span>");
			fold.addEventListener("click", function () { var L2 = toolLayout(); L2.groups.forEach(function (x) { if (x.id === g.id) x.open = !x.open; }); saveLayout(L2); }); gh.appendChild(fold);
			if (arranging) {
				var rn = el("button", "pe-tgbtn", "✎"); rn.type = "button"; rn.title = "Rename this group"; rn.setAttribute("aria-label", "Rename group " + g.name); rn.addEventListener("click", function () { var n = window.prompt("Group name", g.name); if (n == null || !n.trim()) return; var L2 = toolLayout(); L2.groups.forEach(function (x) { if (x.id === g.id) x.name = n.trim().slice(0, 40); }); saveLayout(L2); }); gh.appendChild(rn);
				if (L.groups.length > 1) { var dl = el("button", "pe-tgbtn", "🗑"); dl.type = "button"; dl.title = "Delete this group (its tools move to the group above)"; dl.setAttribute("aria-label", "Delete group " + g.name); dl.addEventListener("click", function () { var L2 = toolLayout(), i = L2.groups.map(function (x) { return x.id; }).indexOf(g.id), to = L2.groups[i > 0 ? i - 1 : 1]; to.tools = to.tools.concat(L2.groups[i].tools); L2.groups.splice(i, 1); saveLayout(L2); }); gh.appendChild(dl); }
				gh.addEventListener("dragover", function (e) { if (!tdrag) return; e.preventDefault(); clearMarks(); gh.classList.add("is-over-into"); });
				gh.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); var src = tdrag; tdrag = null; saveLayout(P.moveTool(toolLayout(), src, g.id, -1)); });
			}
			gw.appendChild(gh);
			if (g.open || arranging) g.tools.forEach(function (id) { gw.appendChild(toolRow(id)); });
			if (arranging && !g.tools.length) { var em = el("div", "pe-tgempty", "Drop tools here"); em.addEventListener("dragover", function (e) { if (tdrag) e.preventDefault(); }); em.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); var src = tdrag; tdrag = null; saveLayout(P.moveTool(toolLayout(), src, g.id, -1)); }); gw.appendChild(em); }
			box.appendChild(gw);
		});
		if (arranging) {
			var hw = el("div", "pe-tgrp pe-tgrp--hidden"); hw.dataset.g = "hidden"; hw.appendChild(el("div", "pe-tgh", '<span class="pe-tgn">Hidden tools (' + L.hidden.length + ")</span>"));
			L.hidden.forEach(function (id) { var t = PE.tools[id], r = el("div", "pe-trow is-arr"), sb = el("button", "pe-tool"); sb.type = "button"; sb.title = "Show " + t.name + " again"; sb.innerHTML = '<span class="pe-ticon">' + esc(t.icon) + '</span><span class="pe-tname">' + esc(t.name.replace(/ \(.*\)$/, "")) + "</span>"; sb.addEventListener("click", function () { saveLayout(P.moveTool(toolLayout(), id, toolLayout().groups[0].id, -1)); }); var sh = el("button", "pe-thide", "＋"); sh.type = "button"; sh.title = "Show this tool again"; sh.setAttribute("aria-label", "Show " + t.name); sh.addEventListener("click", function () { sb.click(); }); r.appendChild(sb); r.appendChild(sh); hw.appendChild(r); });
			hw.addEventListener("dragover", function (e) { if (tdrag) e.preventDefault(); }); hw.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); var src = tdrag; tdrag = null; saveLayout(P.moveTool(toolLayout(), src, "hidden")); });
			box.appendChild(hw);
			var acts = el("div", "pe-tacts"), ng = el("button", "pe-btn pe-btn--sm", "+ New group"), rs = el("button", "pe-btn pe-btn--sm", "Reset"); ng.type = rs.type = "button"; ng.title = "Add an empty group: drag tools into it"; rs.title = "Back to the standard tool groups, nothing hidden";
			ng.addEventListener("click", function () { var n = window.prompt("Name of the new group", "My tools"); if (n == null || !n.trim()) return; var L2 = toolLayout(); L2.groups.push({ id: "u" + Date.now().toString(36), name: n.trim().slice(0, 40), open: true, tools: [] }); saveLayout(L2); });
			rs.addEventListener("click", function () { if (!window.confirm("Put every tool back in the standard groups and show the hidden ones?")) return; UI.tl = null; saveUI(); drawTools(); });
			acts.appendChild(ng); acts.appendChild(rs); box.appendChild(acts); box.appendChild(el("p", "pe-thint", "Drag a tool up or down, onto a group's name or into another group. ✕ hides it (its keyboard key still works). On a keyboard: Alt+↑ / Alt+↓."));
		}
	}
	PE.drawTools = drawTools;
	function buildTools() {
		var box = $("pe-tools"); box.innerHTML = "";
		initLayoutUI();
		var ab = el("button", "pe-tarr", "⚙"); ab.type = "button"; ab.id = "pe-tarr"; ab.addEventListener("click", function () { arranging = !arranging; if (arranging && !UI.tw) { UI.tw = true; saveUI(); applyUI(); } drawTools(); }); box.querySelector(".pe-thead").appendChild(ab);
		drawTools();
	}
	PE.on("tool", function () { Array.prototype.forEach.call($("pe-tools").querySelectorAll(".pe-tool"), function (b) { b.setAttribute("aria-pressed", b.dataset.t === PE.toolId ? "true" : "false"); }); var t = PE.tool(); if (t.activate) t.activate(); buildOpts(); $("pe-hint").textContent = t.hint || ""; setCursor(); });
	function setCursor() { PE.els.over.style.cursor = PE.tool().cursorSize ? "none" : PE.toolId === "hand" ? "grab" : PE.toolId === "zoom" ? "zoom-in" : PE.toolId === "text" ? "text" : PE.toolId === "move" ? "default" : "crosshair"; }

	/* ---------- options bar ---------- */
	function buildOpts() {
		var box = $("pe-opts"), t = PE.tool(), id = t.id, kind = PE.opt[id] && PE.opt[id].kind; box.innerHTML = ""; var name = el("span", "pe-opt-name", esc(t.name)); box.appendChild(name);
		(t.ui || []).forEach(function (u) {
			if (u.showFor && u.showFor.indexOf(kind) < 0) return; if (u.hideFor && u.hideFor.indexOf(kind) >= 0) return; if (u.show && !PE.optGet(id, u.show)) return;
			if (u.type === "button") { var b = el("button", "pe-btn pe-btn--sm", esc(u.label)); b.type = "button"; b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", u.act); box.appendChild(b); return; }
			var w = el("label", "pe-opt"), v = PE.optGet(id, u.k), inp; w.appendChild(el("span", "pe-opt-l", esc(u.label)));
			if (u.type === "check") { inp = el("input"); inp.type = "checkbox"; inp.checked = !!v; inp.addEventListener("change", function () { PE.optSet(id, u.k, inp.checked); rebuildOpts(); }); }
			else if (u.type === "select") { inp = el("select"); var opts = u.options === "fonts" ? PE.FONTS : u.options; opts.forEach(function (o) { var op = el("option", null, esc(o[1])); op.value = o[0]; inp.appendChild(op); }); inp.value = v; inp.addEventListener("change", function () { PE.optSet(id, u.k, u.num ? +inp.value : inp.value); rebuildOpts(); }); }
			else if (u.type === "seg") { inp = el("span", "pe-seg"); u.options.forEach(function (o) { var b = el("button", null, esc(o[1])); b.type = "button"; b.setAttribute("aria-pressed", String(v) === String(o[0]) ? "true" : "false"); b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", function () { PE.optSet(id, u.k, o[0]); rebuildOpts(); }); inp.appendChild(b); }); }
			else if (u.type === "color") { inp = el("input"); inp.type = "color"; inp.dataset.ck = "opt:" + id + ":" + u.k; inp.dataset.cname = u.label; inp.value = v; inp.addEventListener("input", function () { PE.optSet(id, u.k, inp.value); });
				// 💉 next to the well: pick this option's colour from the picture (drag with a magnifier, applied on release)
				var dp = el("button", "pe-mini pe-dropbtn", "💉"); dp.type = "button"; dp.title = "Pick " + u.label.toLowerCase() + " from the picture: press and drag over it, let go to use the colour"; dp.setAttribute("aria-label", dp.title);
				dp.addEventListener("mousedown", function (e) { e.preventDefault(); }); dp.addEventListener("click", function () { if (!needDoc()) return; PE.pickColorFromImage({ label: u.label, apply: function (hex) { PE.optSet(id, u.k, hex); rebuildOpts(); } }); });
				w.appendChild(inp); w.appendChild(dp); var hq3 = optHelp(u); if (hq3) w.appendChild(hq3); box.appendChild(w); return; }
			else if (u.type === "number") { inp = el("input", "pe-num"); inp.type = "number"; inp.value = v; inp.addEventListener("input", function () { PE.optSet(id, u.k, +inp.value); }); }
			else {
				inp = el("input"); inp.type = "range"; inp.min = u.min; inp.max = u.max; inp.step = u.step; inp.value = v;
				var num = el("input", "pe-num pe-num--opt"); num.type = "number"; num.min = u.min; num.max = u.max; num.step = u.step; num.value = (+v).toFixed(u.step < 1 ? 2 : 0); num.title = "Type an exact value" + (u.unit ? " (" + u.unit + ")" : "");
				inp.addEventListener("input", function () { PE.optSet(id, u.k, +inp.value); num.value = (+inp.value).toFixed(u.step < 1 ? 2 : 0); });
				num.addEventListener("input", function () { if (num.value === "" || isNaN(+num.value)) return; var nv = +num.value; PE.optSet(id, u.k, nv); inp.value = Math.max(u.min, Math.min(u.max, nv)); });
				num.addEventListener("keydown", function (e) { e.stopPropagation(); });
				w.appendChild(inp); w.appendChild(num); if (u.unit) w.appendChild(el("span", "pe-opt-v", esc(u.unit))); var hq = optHelp(u); if (hq) w.appendChild(hq); box.appendChild(w); return;
			}
			w.appendChild(inp); var hq2 = optHelp(u); if (hq2) w.appendChild(hq2); box.appendChild(w);
		});
		if (id === "text" || id === "shape") { }
	}
	function rebuildOpts() { buildOpts(); if (PE.textEditing && PE.textEditing()) setTimeout(PE.focusText, 0); }   // a change in the option bar while typing: keep typing into the text
	var OPTHELP = { "Hardness": "How sharp the edge of the brush is. 100% is a crisp hard circle; lower values fade softly towards the edge, like an airbrush.", "Opacity": "How see-through the paint is. 100% covers fully; 30% lets what is underneath show through. Overlapping strokes in one drag do not stack.", "Smoothing": "Steadies a shaky hand: the brush lags a little behind the pointer and draws smoother curves. 0% = follows the pointer exactly.", "Pen pressure": "With a drawing tablet or pen, pressing harder makes the stroke bigger. Has no effect with a mouse.", "Tolerance": "How different a colour can be and still count as the same area. Low = only almost identical colours; high = spreads into similar colours.", "Strength": "How strong the effect is each time you paint over it.", "Aligned": "On: the copy source moves along with your brush. Off: every stroke starts again from the same source point.", "Contiguous": "On: only connected areas are filled. Off: every matching colour in the whole layer.", "Sample all layers": "Look at the merged picture instead of only the selected layer when deciding what is the same colour.", "Pick the layer under the click": "On: clicking a letter or shape picks the layer that is actually showing there, so the selection (and a following Delete) acts on that layer and not on the picture behind it. Off: always use the selected layer.", "Box width (0 = auto)": "How wide the text box is before words wrap onto the next line. 0 = as wide as the text needs (up to the image width). You can also drag the purple handles on the left and right edges of the text box (Text tool or Move tool).", "Auto-fit text": "On: the font size changes by itself so the text fills the box. Drag the box's edges or corners (purple handles) and the words re-wrap and grow or shrink to fit. Off: dragging the box's sides only re-wraps the words, and the box is as tall as the text.", "Box height": "With Auto-fit text: how tall the text box is. The font size is the largest one that fits the box's width and height.", "Underline": "Underlines the text. While you are typing in a text, Ctrl/Cmd+U (and B, I) changes only the selected letters; with nothing selected, the whole text.", "Outline width": "How thick the outline around the letters is. 0 = no outline.", "Letter spacing": "Extra space between letters (negative = tighter).", };
	function optHelp(u) { var t = u.help || OPTHELP[u.label]; return t ? PE.helpBtn(u.label, esc(t)) : null; }
	function fmtV(v, u) { return (u.step < 1 ? (+v).toFixed(2) : Math.round(v)) + (u.unit || ""); }
	var optsTimer = 0; PE.on("opts", function (id) { if (id === PE.toolId) { clearTimeout(optsTimer); optsTimer = setTimeout(function () { if (!document.activeElement || document.activeElement.type !== "range") buildOpts(); }, 10); } sset({ opt: PE.opt }); });
	PE.on("active", function () { if (PE.toolId === "text") buildOpts(); });
	PE.on("fonts", buildOpts);

	/* ---------- colour panel ---------- */
	function buildColor() {
		var box = $("pe-colors"); box.innerHTML = "";
		var sw = el("div", "pe-sw"), bgb = el("label", "pe-sw-bg"), fgb = el("label", "pe-sw-fg"); bgb.style.background = PE.bg; fgb.style.background = PE.fg; bgb.title = "Background colour"; fgb.title = "Foreground colour (brush, shapes, text outline)";
		var fi = el("input"); fi.type = "color"; fi.dataset.ck = "fg"; fi.dataset.cname = "Foreground colour"; fi.value = PE.fg; fi.addEventListener("input", function () { PE.fg = fi.value; fgb.style.background = fi.value; hexIn.value = fi.value; PE.emit("color-live"); }); fi.addEventListener("change", function () { PE.setFg(fi.value); });
		var bi = el("input"); bi.type = "color"; bi.dataset.ck = "bg"; bi.dataset.cname = "Background colour"; bi.value = PE.bg; bi.addEventListener("input", function () { PE.bg = bi.value; bgb.style.background = bi.value; }); bi.addEventListener("change", function () { PE.setBg(bi.value); });
		fgb.appendChild(fi); bgb.appendChild(bi); sw.appendChild(bgb); sw.appendChild(fgb);
		var swap = el("button", "pe-mini", "⇄"); swap.type = "button"; swap.title = "Swap colours (X)"; swap.addEventListener("click", swapColors); var def = el("button", "pe-mini", "◐"); def.type = "button"; def.title = "Default colours: black and white (D)"; def.addEventListener("click", function () { PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color"); });
		var hexIn = el("input", "pe-hex"); hexIn.value = PE.fg; hexIn.maxLength = 7; hexIn.title = "Foreground colour hex"; hexIn.addEventListener("change", function () { var h = hexIn.value.trim(); if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) { if (h[0] !== "#") h = "#" + h; if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; PE.setFg(h.toLowerCase()); } else hexIn.value = PE.fg; });
		var drop = el("button", "pe-mini pe-dropbtn", "💉"); drop.type = "button"; drop.title = "Pick the foreground colour from the picture: press and drag over it (a magnifier shows the pixels), let go to use the colour. Alt = background colour. (I)"; drop.setAttribute("aria-label", "Pick a colour from the picture");
		drop.addEventListener("click", function (e) { if (!needDoc()) return; var bgPick = e.altKey; PE.pickColorFromImage({ label: bgPick ? "background colour" : "foreground colour", apply: function (hex, alt) { (bgPick || alt) ? PE.setBg(hex) : PE.setFg(hex); } }); });
		var top = el("div", "pe-col-top"); top.appendChild(sw); var bt = el("div", "pe-col-b"); bt.appendChild(swap); bt.appendChild(def); bt.appendChild(drop); bt.appendChild(hexIn); top.appendChild(bt); box.appendChild(top);
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
	/* the canvas side of a multi-selection (Move tool: rubber band, Shift / Ctrl-click): ids = every picked layer; fewer than two = back to just the active layer */
	PE.setMulti = function (ids) { multi = {}; if (ids && ids.length > 1) { ids.forEach(function (id) { multi[id] = true; }); var A = PE.active(); if (!A || !multi[A.id]) { PE.setActive(ids[ids.length - 1]); return; } } buildLayers(); PE.invalidateOverlay(); };
	/* add a layer to the Move tool's selection, or take it out; returns true when it is now picked */
	PE.toggleMove = function (L) {
		var cur = PE.moveSet ? PE.moveSet() : PE.multi(), ids = cur.map(function (x) { return x.id; }), i = ids.indexOf(L.id);
		if (i >= 0) { if (ids.length < 2) return true; ids.splice(i, 1); if (PE.active() === L) PE.doc.activeId = ids[ids.length - 1]; PE.setMulti(ids); if (ids.length === 1) PE.setActive(ids[0]); return false; }
		ids.push(L.id); PE.doc.activeId = L.id; PE.setMulti(ids); PE.emit("active"); return true;
	};
	function rowsTopDown() {
		var d = PE.doc, q = lfilter.trim().toLowerCase(), out = [];
		d.layers.slice().reverse().forEach(function (L) {
			var anc = PE.ancestorsOf(L); if (!q && anc.some(function (a) { return a.collapsed; })) return;
			if (q) { var hit = L.name.toLowerCase().indexOf(q) >= 0 || (PE.isGroup(L) && PE.descendants(L).some(function (k) { return k.name.toLowerCase().indexOf(q) >= 0; })); if (!hit) return; }
			out.push({ L: L, depth: anc.length });
		});
		return out;
	}
	function renameLayer(id) {
		var nm = $("pe-layers").querySelector('.pe-layer[data-id="' + id + '"] .pe-lname'); if (nm) nm.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
	}
	root.addEventListener("keydown", function (e) { if (e.key === "F2" && PE.doc && PE.active() && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); renameLayer(PE.active().id); } });
	/* The list is reconciled, not rebuilt: a row whose layer did not change (name, visibility, selection, depth, pixels...) keeps its DOM node, so moving a
	 * layer up / down only moves rows. Rebuilding every row on every step made the list flash, and fought with page-zoom / text-size extensions that
	 * restyle new elements a moment after they appear. Handlers look the layer up by id at click time (undo / redo replace the layer objects). */
	var rowCache = {};
	function rowSig(L, r, on) { return [L.name, L.type, L.visible, PE.effVisible(L), on ? 1 : 0, r.depth, L.collapsed, L.locked, L.mask ? 1 : 0, L.editMask ? 1 : 0, L.maskOff ? 1 : 0, L.viewMask ? 1 : 0, PE.hasFx(L) ? 1 : 0, L.crop ? 1 : 0, L.rev, L.canvas.width, L.canvas.height, PE.isGroup(L) ? PE.descendants(L).filter(function (k) { return !PE.isGroup(k); }).length : -1].join("|"); }
	function makeRow(id, depth, on) {
		var L0 = PE.layerById(id), grp = PE.isGroup(L0), hidden = !PE.effVisible(L0) && !grp ? true : !L0.visible, cur = function () { return PE.layerById(id); };
		var row = el("div", "pe-layer" + (on ? " is-active" : "") + (hidden ? " is-hidden" : "") + (grp ? " is-group" : "")); row.draggable = true; row.dataset.id = id; row.style.paddingLeft = (0.3 + depth * 1.1) + "em";
		var eye = el("button", "pe-eye", L0.visible ? "👁" : "—"); eye.type = "button"; eye.title = "Show / hide"; eye.addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (!L) return; L.visible = !L.visible; PE.touch(L); PE.commit("Toggle visibility"); });
		row.appendChild(eye);
		if (grp) { var ar = el("button", "pe-arrow", L0.collapsed ? "▸" : "▾"); ar.type = "button"; ar.title = L0.collapsed ? "Expand group" : "Collapse group"; ar.addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (!L) return; L.collapsed = !L.collapsed; buildLayers(); }); row.appendChild(ar); var th0 = el("span", "pe-th pe-th--grp", "📁"); row.appendChild(th0); }
		else { var th = el("span", "pe-th" + (L0.mask && !L0.editMask ? " is-paint" : "")); th.appendChild(thumbFor(L0)); if (L0.mask) th.title = L0.editMask ? "Click to paint on the picture again" : "You are painting on the picture"; row.appendChild(th); }
		var nm = el("span", "pe-lname", esc(L0.name) + (L0.type === "text" ? " ᵀ" : "") + (grp ? ' <small class="pe-cnt">' + PE.descendants(L0).filter(function (k) { return !PE.isGroup(k); }).length + "</small>" : "")); nm.title = L0.name + " (double-click to rename)";
		if (L0.mask) {
			var mt = el("span", "pe-th pe-th--mask" + (L0.editMask ? " is-on is-paint" : "") + (L0.maskOff ? " is-off" : "") + (L0.viewMask ? " is-view" : "")); mt.appendChild(PE.maskView ? (function () { var c = PE.mk(36, 36), x = c.getContext("2d"), v = PE.maskView(L0), sc = Math.min(36 / v.width, 36 / v.height); x.fillStyle = "#3a3a44"; x.fillRect(0, 0, 36, 36); x.drawImage(v, (36 - v.width * sc) / 2, (36 - v.height * sc) / 2, v.width * sc, v.height * sc); return c; })() : el("span"));
			mt.title = "Layer mask (white = shown, black = hidden). " + (L0.editMask ? "You are painting on the mask: black hides, white shows." : "Click to paint on the mask.") + " Shift-click: switch the mask " + (L0.maskOff ? "on again" : "off for a moment") + ". Alt-click: " + (L0.viewMask ? "back to the picture" : "see the mask itself") + ".";
			mt.setAttribute("role", "button"); mt.tabIndex = 0; mt.setAttribute("aria-label", "Layer mask of " + L0.name + (L0.editMask ? ", being painted" : ""));
			var mclick = function (e) { e.stopPropagation(); var L = cur(); if (!L) return; PE.setActive(id); if (e.shiftKey) { L.maskOff = !L.maskOff; L.rev++; PE.commit(L.maskOff ? "Switch mask off" : "Switch mask on"); return; } if (e.altKey) { L.viewMask = !L.viewMask; delete rowCache[id]; PE.invalidate(); buildLayers(); return; } L.editMask = true; delete rowCache[id]; buildLayers(); PE.emit("paintTarget"); };
			mt.addEventListener("click", mclick); mt.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mclick(e); } });
			row.querySelector(".pe-th").addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (!L) return; PE.setActive(id); L.editMask = false; L.viewMask = false; delete rowCache[id]; PE.invalidate(); buildLayers(); PE.emit("paintTarget"); }); row.appendChild(mt);
		}
		row.appendChild(nm);
		if (grp) { var xg = el("button", "pe-pen", "⬇"); xg.type = "button"; xg.title = "Export this group as its own image, on a canvas of any size"; xg.addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (L) PE.dlgExportGroup(L); }); row.appendChild(xg); }
		if (!grp) { var fxb = el("button", "pe-pen pe-fxb" + (PE.hasFx(L0) ? " is-on" : ""), "fx"); fxb.type = "button"; fxb.title = PE.hasFx(L0) ? "Layer style (outline / shadow) is on: click to change it" : "Add an outline or shadow (layer style)"; fxb.setAttribute("aria-label", "Layer style of " + L0.name); fxb.addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(id); PE.dlgLayerStyle(cur()); }); row.appendChild(fxb);
			if (L0.crop) { var cb = el("button", "pe-pen pe-cropb is-on", "⛶"); cb.type = "button"; cb.title = "This layer is cropped (its edges are hidden, not deleted): click to change the crop"; cb.setAttribute("aria-label", "Change the crop of " + L0.name); cb.addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(id); PE.setTool("layercrop"); }); row.appendChild(cb); } }
		var pen = el("button", "pe-pen", "✎"); pen.type = "button"; pen.title = "Rename"; pen.addEventListener("click", function (e) { e.stopPropagation(); renameLayer(id); }); row.appendChild(pen);
		if (L0.locked) row.appendChild(el("span", "pe-lock", "🔒"));
		row.addEventListener("click", function (e) {
			var L = cur(), act = PE.active(); if (!L) return;
			if (e.ctrlKey || e.metaKey) { multi[id] = !multi[id]; if (!Object.keys(multi).some(function (k) { return multi[k]; })) multi = {}; else multi[act ? act.id : id] = true; buildLayers(); PE.invalidateOverlay(); return; }
			if (e.shiftKey && act) { var order = rowsTopDown().map(function (x) { return x.L; }), i0 = order.indexOf(act), i1 = order.indexOf(L); if (i0 >= 0 && i1 >= 0) { multi = {}; order.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).forEach(function (x) { multi[x.id] = true; }); buildLayers(); PE.invalidateOverlay(); return; } }
			multi = {}; PE.setActive(id); PE.invalidateOverlay();
		});
		nm.addEventListener("dblclick", function (e) {
			e.stopPropagation(); var L = cur(); if (!L) return; var inp = el("input", "pe-rename"), fin = false; inp.type = "text"; inp.value = L.name; inp.spellcheck = false; inp.setAttribute("aria-label", "New name for " + (grp ? "the group " : "the layer ") + L.name); row.draggable = false; row.classList.add("is-renaming"); nm.replaceWith(inp); inp.focus(); inp.select();
			var done = function (ok) { if (fin) return; fin = true; row.classList.remove("is-renaming"); var v = inp.value.trim(), L2 = cur(); delete rowCache[id]; if (ok && L2 && v && v !== L2.name) { L2.name = v; PE.commit(grp ? "Rename group" : "Rename layer"); } else buildLayers(); };
			// clicks inside the box must not reach the row: its click selects the layer, which rebuilds the list and threw the half-typed name away
			["click", "mousedown", "pointerdown", "dblclick", "dragstart"].forEach(function (t) { inp.addEventListener(t, function (ev) { ev.stopPropagation(); }); });
			inp.addEventListener("keydown", function (ev) { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); done(true); } if (ev.key === "Escape") { ev.preventDefault(); done(false); } }); inp.addEventListener("blur", function () { done(true); });
		});
		row.addEventListener("contextmenu", function (e) { e.preventDefault(); var L = cur(); if (!L) return; if (PE.active() !== L) PE.setActive(id); layerMenu(L, e.clientX, e.clientY); });
		row.addEventListener("dragstart", function (e) { dragId = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pe-layer", String(id)); });
		function zoneOf(e) { var rc = row.getBoundingClientRect(), y = (e.clientY - rc.top) / rc.height; return grp ? (y < 0.25 ? "above" : "into") : (y < 0.5 ? "above" : "below"); }
		row.addEventListener("dragover", function (e) { if (dragId == null) return; e.preventDefault(); row.classList.remove("is-over-above", "is-over-below", "is-over-into"); row.classList.add("is-over-" + zoneOf(e)); });
		row.addEventListener("dragleave", function () { row.classList.remove("is-over-above", "is-over-below", "is-over-into"); });
		row.addEventListener("drop", function (e) { if (dragId == null) return; e.preventDefault(); e.stopPropagation(); row.classList.remove("is-over-above", "is-over-below", "is-over-into"); var src = PE.layerById(dragId), z = zoneOf(e), L = cur(); dragId = null; if (src && L && src !== L) PE.relocate(src, L, z); });
		return row;
	}
	/* a small menu at the pointer (right-click on a layer, the Mask button) */
	function popMenu(items, x, y) {
		var old = root.querySelector(".pe-cmenu"); if (old) old.remove(); var m = el("div", "pe-cmenu pe-pop"); m.setAttribute("role", "menu");
		items.forEach(function (it) { if (it === "-") { m.appendChild(el("div", "pe-sep")); return; } var b = el("button", "pe-item", "<span>" + esc(it.label) + "</span>"); b.type = "button"; b.setAttribute("role", "menuitem"); if (it.dis) b.disabled = true; b.addEventListener("click", function () { m.remove(); it.act(); }); m.appendChild(b); });
		root.appendChild(m); var rr = root.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(4, Math.min(x - rr.left, rr.width - w - 4)) + "px"; m.style.top = Math.max(4, Math.min(y - rr.top, rr.height - h - 4)) + "px";
		var f = m.querySelector("button:not(:disabled)"); if (f) f.focus();
		var off = function (e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", esck, true); } }, esck = function (e) { if (e.key === "Escape") { e.stopPropagation(); m.remove(); document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", esck, true); } };
		setTimeout(function () { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", esck, true); }, 0);
	}
	PE.popMenu = popMenu;
	function maskItems(L) {
		if (!L.mask) return [{ label: "◑ Add layer mask", act: function () { PE.addMask(L, true); } }, { label: "? How layer masks work", act: PE.maskHelp }];
		return [{ label: (L.editMask ? "✓ " : "") + "Paint on the mask", act: function () { L.editMask = true; L.viewMask = false; PE.invalidate(); buildLayers(); PE.emit("paintTarget"); } }, { label: (!L.editMask ? "✓ " : "") + "Paint on the picture", act: function () { L.editMask = false; L.viewMask = false; PE.invalidate(); buildLayers(); PE.emit("paintTarget"); } },
			{ label: (L.viewMask ? "✓ " : "") + "Show the mask itself (black and white)", act: function () { L.viewMask = !L.viewMask; PE.invalidate(); buildLayers(); } }, { label: L.maskOff ? "Switch the mask on again" : "Switch the mask off for now", act: function () { L.maskOff = !L.maskOff; L.rev++; PE.commit(L.maskOff ? "Switch mask off" : "Switch mask on"); } },
			"-", { label: "Apply mask (make the hiding permanent)", act: function () { PE.applyMask(L); } }, { label: "Delete mask (show the whole layer)", act: function () { PE.deleteMask(L); } }, "-", { label: "? How layer masks work", act: PE.maskHelp }];
	}
	function layerMenu(L, x, y) {
		var grp = PE.isGroup(L), items = [{ label: "✎ Rename", act: function () { renameLayer(L.id); } }, { label: "⧉ Duplicate", act: function () { PE.duplicateLayer(L); } }];
		if (!grp) items = items.concat(["-", { label: "fx Layer style: outline, shadow, glow…", act: function () { PE.dlgLayerStyle(L); } }, { label: "⛶ Crop this layer (hide edges)", act: function () { PE.setTool("layercrop"); } }]);
		if (!grp && L.crop) items.push({ label: "Show the whole layer (uncrop)", act: function () { PE.clearLayerCrop(L); } });
		if (!grp) items = items.concat(["-"], maskItems(L));
		items = items.concat(["-", { label: L.locked ? "🔓 Unlock" : "🔒 Lock", act: function () { L.locked = !L.locked; PE.commit(L.locked ? "Lock layer" : "Unlock layer"); } }, { label: "🗑 Delete layer", act: function () { PE.deleteLayer(); } }]);
		popMenu(items, x, y);
	}
	function buildLayers() {
		var list = $("pe-layers"), d = PE.doc; if (!d) { list.innerHTML = ""; rowCache = {}; return; } var act = PE.active(), rows = rowsTopDown(); PE.relink();
		if (list.querySelector(".is-renaming")) return;   // never pull a half-typed name out from under the keyboard
		var keep = {}, at = 0;
		rows.forEach(function (r) {
			var L = r.L, on = L === act || multi[L.id], sig = rowSig(L, r, on), c = rowCache[L.id];
			if (!c || c.sig !== sig) { c = rowCache[L.id] = { sig: sig, row: makeRow(L.id, r.depth, on) }; }
			keep[L.id] = 1; var node = list.children[at];
			if (node !== c.row) list.insertBefore(c.row, node || null);
			at++;
		});
		while (list.children.length > at) list.removeChild(list.lastChild);
		for (var k in rowCache) if (!keep[k]) delete rowCache[k];
		syncLayerProps();
	}
	$("pe-layers").addEventListener("dragover", function (e) { if (dragId != null) e.preventDefault(); });
	$("pe-layers").addEventListener("dragend", function () { dragId = null; Array.prototype.forEach.call($("pe-layers").querySelectorAll(".is-over-above,.is-over-below,.is-over-into"), function (r) { r.classList.remove("is-over-above", "is-over-below", "is-over-into"); }); });
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
	var histRows = new WeakMap();   // one button per history step, kept between updates (only the new step is added, the rest just change class)
	function buildHistory() {
		var list = $("pe-history"), H = PE.hist, at = 0, act = null;
		H.stack.forEach(function (e, i) {
			var r = histRows.get(e); if (!r) { r = el("button", "pe-hrow", esc(e.label)); r.type = "button"; r.addEventListener("click", function () { var j = PE.hist.stack.indexOf(e); if (j >= 0) PE.gotoHistory(j); }); histRows.set(e, r); }
			var cls = "pe-hrow" + (i === H.idx ? " is-active" : "") + (i > H.idx ? " is-future" : ""); if (r.className !== cls) r.className = cls; if (i === H.idx) act = r;
			var node = list.children[at]; if (node !== r) list.insertBefore(r, node || null); at++;
		});
		while (list.children.length > at) list.removeChild(list.lastChild);
		if (act) act.scrollIntoView({ block: "nearest" });
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
	lbtn("pe-lrename", function () { var L = PE.active(); if (L) renameLayer(L.id); }); lbtn("pe-lnew", function () { PE.newRasterLayer(); }); lbtn("pe-lfill", function () { PE.dlgFillLayer(); }); lbtn("pe-lgroup", function () { groupSelected(); }); lbtn("pe-ldup", function () { PE.duplicateLayer(); }); lbtn("pe-ldel", function () { PE.deleteLayer(); }); lbtn("pe-lmerge", function () { PE.mergeDown(); });
	lbtn("pe-lock", function () { var L = PE.active(); L.locked = !L.locked; PE.commit(L.locked ? "Lock layer" : "Unlock layer"); });
	lbtn("pe-mask-btn", function () { var L = PE.active(); if (!L) return; if (!L.mask) { PE.addMask(L, true); return; } var r = $("pe-mask-btn").getBoundingClientRect(); popMenu(maskItems(L), r.left, r.bottom + 4); });
	$("pe-mask-help").addEventListener("click", function () { PE.maskHelp(); });
	lbtn("pe-lstyle", function () { PE.dlgLayerStyle(); }); lbtn("pe-lcrop", function () { var L = PE.active(); if (!L || PE.isGroup(L)) { PE.toast("Select a layer (not a group) to crop"); return; } PE.setTool("layercrop"); });
	/* the Layers list: Fill the side column (other panels fold away), a big floating Layers window over the picture, or drag the grip under the list for any height */
	(function () {
		var panel = root.querySelector(".pe-panel--layers"), home = panel.parentNode, next = panel.nextSibling, side = $("pe-side"), list = $("pe-layers"), grip = $("pe-lgrip"), fl = null;
		function apply() {
			side.classList.toggle("pe-side--lfill", UI.lmode === "fill"); list.style.height = UI.lmode === "fill" || UI.lmode === "big" ? "" : (UI.lh ? UI.lh + "px" : ""); panel.classList.toggle("pe-panel--lsized", !!UI.lh && !UI.lmode);
			$("pe-lfillbtn").setAttribute("aria-pressed", UI.lmode === "fill" ? "true" : "false"); $("pe-lbigbtn").setAttribute("aria-pressed", UI.lmode === "big" ? "true" : "false"); $("pe-lbigbtn").textContent = UI.lmode === "big" ? "✕ Close" : "⤢ Big";
			if (UI.lmode === "big" && !fl) { fl = el("div", "pe-lfloat"); fl.setAttribute("role", "dialog"); fl.setAttribute("aria-label", "Layers"); PE.els.stage.appendChild(fl); fl.appendChild(panel); }
			if (UI.lmode !== "big" && fl) { home.insertBefore(panel, next); fl.remove(); fl = null; }
		}
		$("pe-lfillbtn").addEventListener("click", function () { UI.lmode = UI.lmode === "fill" ? "" : "fill"; if (UI.lmode && UI.hide) { UI.hide = false; applyUI(); } saveUI(); apply(); });
		$("pe-lbigbtn").addEventListener("click", function () { UI.lmode = UI.lmode === "big" ? "" : "big"; saveUI(); apply(); });
		if (UI.lmode === "big") UI.lmode = "";   // the big Layers window is for now only: a reload starts with the normal list
		document.addEventListener("keydown", function (e) { if (e.key === "Escape" && UI.lmode === "big" && fl && fl.contains(document.activeElement) && document.activeElement.tagName !== "INPUT") { UI.lmode = ""; saveUI(); apply(); } });
		grip.addEventListener("pointerdown", function (e) { if (e.button > 0 || UI.lmode) return; e.preventDefault(); grip.setPointerCapture(e.pointerId); var y0 = e.clientY, h0 = list.getBoundingClientRect().height;
			var mv = function (ev) { UI.lh = Math.round(P.clamp(h0 + ev.clientY - y0, 80, 3000)); list.style.height = UI.lh + "px"; panel.classList.add("pe-panel--lsized"); }, up = function () { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); saveUI(); }; grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); });
		grip.addEventListener("dblclick", function () { UI.lh = 0; saveUI(); apply(); });
		grip.addEventListener("keydown", function (e) { if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault(); UI.lh = Math.round(P.clamp((UI.lh || list.getBoundingClientRect().height) + (e.key === "ArrowDown" ? 40 : -40), 80, 3000)); saveUI(); apply(); });
		apply();
	})();

	/* ---------- status + zoom ---------- */
	function status() { var d = PE.doc; $("pe-st-doc").textContent = d ? d.w + " × " + d.h + " px" : "No image"; $("pe-zoom").textContent = Math.round(PE.view.zoom * 100) + "%"; var L = PE.active(); $("pe-st-layer").textContent = L ? L.name + " · " + L.canvas.width + "×" + L.canvas.height + (L.mask && !PE.isGroup(L) ? (L.editMask ? " · painting on the MASK" : " · painting on the picture") : "") + (L.crop ? " · cropped" : "") : ""; }
	PE.on("paintTarget", status); PE.on("active", status);
	PE.on("view", status); PE.on("docsize", status); PE.on("layers", status); PE.on("pointer", function (p) { $("pe-st-xy").textContent = Math.floor(p.x) + ", " + Math.floor(p.y); });
	PE.on("cropinfo", function (c) { $("pe-st-xy").textContent = "crop " + c.w + " × " + c.h; });
	PE.on("docsize", function () { $("pe-empty").hidden = !!PE.doc; });
	PE.on("sel", function () { var b = PE.sel && PE.selBounds(); $("pe-st-sel").textContent = b ? "Selection " + b.w + " × " + b.h : ""; });
	$("pe-zoom").addEventListener("click", function () { PE.view.zoom === 1 ? PE.fit() : PE.setZoom(1); });
	$("pe-zin").addEventListener("click", function () { PE.setZoom(PE.view.zoom * 1.25); }); $("pe-zout").addEventListener("click", function () { PE.setZoom(PE.view.zoom / 1.25); });
	$("pe-fit").addEventListener("click", function () { PE.fit(); }); $("pe-undo").addEventListener("click", function () { PE.undo(); }); $("pe-redo").addEventListener("click", function () { PE.redo(); }); $("pe-export").addEventListener("click", function () { PE.dlgExport(); }); $("pe-copy").addEventListener("click", function () { if (needDoc()) copyMerged(); });
$("pe-share").addEventListener("click", function () { if (needDoc()) PE.dlgShare(); }); $("pe-save").addEventListener("click", function () { saveProject(); });

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
	function paintClipboardImage(src, name, at, clip) { var meta = { how: "paste", clip: clip || "clipboard" }; if (!PE.doc) { PE.openImageSource(src, name || "Pasted image", meta); PE.setTool("move"); return; } PE.placeSource(src, name || "Pasted", at, meta); PE.setTool("move"); }
	function pasteInternal() { if (PE.clipCanvas) paintClipboardImage(PE.clipCanvas, "Pasted layer", null, "editor"); else if (navigator.clipboard && navigator.clipboard.read) { navigator.clipboard.read().then(function (items) { for (var i = 0; i < items.length; i++) { var t = items[i].types.filter(function (t) { return /^image\//.test(t); })[0]; if (t) { items[i].getType(t).then(function (b) { return PE.decodeFile(b); }).then(function (im) { paintClipboardImage(im, "Pasted image"); }); return; } } PE.toast("Nothing to paste"); }).catch(function () { PE.toast("Use Ctrl+V to paste an image"); }); } else PE.toast("Use Ctrl+V to paste an image"); }
	document.addEventListener("paste", function (e) {
		if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "") || PE.modalOpen()) return; var items = (e.clipboardData && e.clipboardData.items) || [];
		var gf = []; for (var j = 0; j < items.length; j++) if (items[j].kind === "file") { var ff = items[j].getAsFile(); if (ff && /\.xcf$/i.test(ff.name)) gf.push(ff); }
		if (gf.length) { e.preventDefault(); openFiles(gf, { place: !!PE.doc, how: "paste" }); return; }   // a GIMP file copied in the file manager
		for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); e.preventDefault(); PE.decodeFile(f).then(function (im) { paintClipboardImage(im, "Pasted image"); }).catch(function () { PE.toast("Can't read that image"); }); return; }
		var tx = e.clipboardData && e.clipboardData.getData("text/plain"); if (tx && PE.looksLikeLatex(tx)) { e.preventDefault(); PE.dlgEquation(null, null, tx.trim().replace(/^\$+|\$+$/g, "")); return; }
		if (PE.clipCanvas) { e.preventDefault(); paintClipboardImage(PE.clipCanvas, "Pasted layer", null, "editor"); }
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
	function loadPsd(buf, name, meta) {
		return loadScript("https://cdn.jsdelivr.net/npm/ag-psd@30.1.1/dist/bundle.js", function () { return window.agPsd; }).then(function (ag) {
			var psd = ag.readPsd(new Uint8Array(buf), { skipThumbnail: true }), layers = [];
			(function walk(list) { (list || []).forEach(function (n) { if (n.children) walk(n.children); else if (n.canvas) layers.push(n); }); })(psd.children);
			if (!PE.newDoc(psd.width, psd.height, null, I.baseName(name))) return; var d = PE.doc; d.layers = []; var from = Object.assign({ file: name }, meta || {}, { how: "psd" }); d.file = PE.mkSrc(from);
			var MAP = { "normal": "source-over", "multiply": "multiply", "screen": "screen", "overlay": "overlay", "darken": "darken", "lighten": "lighten", "color dodge": "color-dodge", "color burn": "color-burn", "hard light": "hard-light", "soft light": "soft-light", "difference": "difference", "exclusion": "exclusion", "hue": "hue", "saturation": "saturation", "color": "color", "luminosity": "luminosity" };
			if (!layers.length && psd.canvas) layers.push({ name: "Background", canvas: psd.canvas, left: 0, top: 0 });
			layers.forEach(function (n) { var c = PE.clone(n.canvas), L = PE.makeLayer({ canvas: c, name: n.name || "Layer", x: n.left || 0, y: n.top || 0, src: PE.mkSrc({ how: "psd", file: name }, c.width, c.height) }); L.visible = !n.hidden; L.opacity = n.opacity == null ? 1 : n.opacity; L.blend = MAP[n.blendMode] || "source-over"; d.layers.push(L); });
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
		var proj = files.filter(function (f) { return /\.(mesproj|zip)$/i.test(f.name); })[0], psd = files.filter(function (f) { return /\.psd$/i.test(f.name); })[0], xcfs = files.filter(function (f) { return /\.xcf$/i.test(f.name); }), imgs = files.filter(function (f) { return /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif|svg|ico)$/i.test(f.name); });
		var meta = function (f) { return { how: opts.how || "open", file: f.name, path: f.webkitRelativePath || "", bytes: f.size || 0, dir: opts.dir || "", hk: opts.hk || "" }; };
		if (proj) { openProjectFile(proj, opts, meta(proj)); return; }
		if (psd && !opts.place) { if (!confirmReplace()) return; psd.arrayBuffer().then(function (b) { return loadPsd(b, psd.name, meta(psd)); }).catch(function (e) { PE.toast(e.message); }); return; }
		if (xcfs.length) {   // GIMP files: open the first as the image (or, when placing into an open image, add each as a group of layers), then any pictures as layers
			var place = !!(opts.place && PE.doc); if (!place && !confirmReplace()) return;
			var xc = Promise.resolve(); xcfs.forEach(function (f, i) { xc = xc.then(function () { return f.arrayBuffer(); }).then(function (b) { PE.loadXcf(b, f.name, meta(f), place || i > 0); }).catch(function (e) { PE.toast("Can't read " + f.name + ": " + (e && e.message || e)); }); });
			if (imgs.length) xc.then(function () { if (PE.doc) openFiles(imgs, Object.assign({}, opts, { place: true })); });
			return;
		}
		if (!imgs.length) { PE.toast("That file type is not supported (use PNG, JPG, WebP, GIF, BMP, AVIF, SVG, PSD, GIMP .xcf)"); return; }
		var first = !PE.doc || (!opts.place && confirmReplace()); if (!PE.doc) first = true; else if (!opts.place && !first) return;
		var chain = Promise.resolve(); imgs.forEach(function (f, i) { chain = chain.then(function () { return PE.decodeFile(f).then(function (im) { if (first && i === 0 && (!PE.doc || !opts.place)) { PE.openImageSource(im, f.name, meta(f)); } else PE.placeSource(im, I.baseName(f.name), opts.at, meta(f)); }).catch(function () { PE.toast("Can't read " + f.name); }); }); });
		chain.then(function () { PE.setTool("move"); if (imgs.length > 1) PE.toast(imgs.length + " images added as layers"); });
	}
	/* a .mesproj, or a .zip with a project.json in it. With a file handle (File -> Open picker, a drop in Chrome / Edge / Brave, the connected folder) the
	 * project is linked to the file, so Save writes back to it */
	function openProjectFile(f, opts, m) {
		var hp = opts.fh ? Promise.resolve(opts.fh) : opts.handles ? Promise.resolve(opts.handles).then(function (hs) { return (hs || []).filter(function (h) { return h && h.kind === "file" && h.name === f.name; })[0] || null; }, function () { return null; }) : Promise.resolve(null);
		f.arrayBuffer().then(function (b) {
			var u = new Uint8Array(b); if (!PE.isProjectZip(u)) { PE.toast(/\.zip$/i.test(f.name) ? "“" + f.name + "” is a ZIP without a MES project in it (no project.json). To use its pictures, unzip it and drop them here" : "“" + f.name + "” is not a MES project file"); return; }
			if (!confirmReplace()) return;
			return PE.loadProject(b, f.name, m).then(function () { return hp; }).then(function (h) {
				if (h) PE.linkProject(h, { dir: opts.dir || "", lm: f.lastModified }); else PE.rememberProject({});
				PE.setTool("move"); PE.toast(h ? "Opened " + f.name + ": " + MOD + "S saves back to this file" : "Project opened" + (PE.canOpenPicker() ? " (use File → Open project… so " + MOD + "S can save back to the same file)" : ""));
			});
		}).catch(function (e) {   // a file that cannot be read: an online-only OneDrive / iCloud placeholder, or a folder the browser handed over as a file
			if (e && (e.name === "NotReadableError" || e.name === "NotFoundError")) { PE.toast("Could not read “" + f.name + "”. If it is in OneDrive or iCloud, make it available on this computer first (right-click → Always keep on this device), then drop it again. If it is a folder (an unzipped project), use File → Open project folder…"); return; }
			PE.toast(e && e.message || String(e)); });
	}
	function confirmReplace() { if (!PE.doc || !PE.dirty || PE.hist.stack.length < 2) return true; return window.confirm("Replace the current image? Unsaved changes will be lost (you can still restore the last auto-saved session)."); }
	PE.openFiles = openFiles; PE.confirmReplace = confirmReplace;
	/* File -> Open: the browser's file picker that returns file handles (so a project opened this way can be saved back in place), else the plain file input */
	var OPEN_ACCEPT = "image/*,.psd,.xcf,.mesproj,.zip";
	function pickOpen() {
		if (PE.canOpenPicker()) {
			var dh = PE.folderHandle && PE.folderHandle(), o = { id: "mes-photo-open", multiple: true, types: [{ description: "Pictures, projects, PSD and GIMP files", accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"], "image/gif": [".gif"], "image/bmp": [".bmp"], "image/avif": [".avif"], "image/svg+xml": [".svg"], "application/zip": [".mesproj", ".zip"], "application/octet-stream": [".psd", ".xcf"] } }] }; if (dh) o.startIn = dh;
			window.showOpenFilePicker(o).then(function (hs) { return Promise.all(hs.map(function (h) { return h.getFile(); })).then(function (fs) { openFiles(fs, { handles: hs }); }); }).catch(function (x) { if (x && x.name === "AbortError") return; pickFiles(OPEN_ACCEPT, true, function (fs) { openFiles(fs); }); });
			return;
		}
		pickFiles(OPEN_ACCEPT, true, function (fs) { openFiles(fs); });
	}
	PE.pickOpen = pickOpen;
	function pickFiles(accept, multiple, cb) { var inp = $("pe-file"); inp.accept = accept; inp.multiple = !!multiple; inp.onchange = function () { var fs = Array.prototype.slice.call(inp.files); inp.value = ""; if (fs.length) cb(fs); }; inp.click(); }
	PE.pickFontFile = function () { pickFiles(".ttf,.otf,.woff,.woff2", false, function (fs) { PE.loadFontFile(fs[0]).then(function () { PE.toast("Font loaded"); }).catch(function () { PE.toast("Could not load that font"); }); }); };
	var stage = PE.els.stage;
	["dragenter", "dragover"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); stage.classList.add("is-drop"); } }); });
	["dragleave", "drop"].forEach(function (ev) { stage.addEventListener(ev, function () { stage.classList.remove("is-drop"); }); });
	stage.addEventListener("drop", function (e) {
		/* a dropped FOLDER (an unzipped .mesproj, or a folder of pictures): read it with the entry / handle API, which must be asked during the drop event itself */
		try { var its = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.items) || []).filter(function (it) { return it.kind === "file"; }), ents = its.map(function (it) { try { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; } catch (x) { return null; } }), di = -1;
			ents.forEach(function (en, i) { if (di < 0 && en && en.isDirectory) di = i; });
			if (di >= 0 && PE.openDroppedFolder) { e.preventDefault(); var hp = null; try { hp = its[di].getAsFileSystemHandle ? its[di].getAsFileSystemHandle() : null; } catch (x) { hp = null; } PE.openDroppedFolder(ents[di], hp); return; }
		} catch (x) { }
		if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); var at = PE.doc ? PE.toDoc(e.clientX, e.clientY) : null; var hs = null; try { var items = Array.prototype.slice.call(e.dataTransfer.items || []); if (items.length && items[0].getAsFileSystemHandle) hs = Promise.all(items.map(function (it) { return it.kind === "file" ? it.getAsFileSystemHandle().catch(function () { return null; }) : null; })); } catch (x) { hs = null; }
		openFiles(e.dataTransfer.files, { place: !!PE.doc, at: null, how: "drop", handles: hs }); } });
	function saveProject() { PE.saveProject(); }   // Save / Save as / download: projects.js
	/* the top-bar Save button shows a dot while there are changes that are not in a saved project file */
	function saveState() { setTimeout(function () { var b = $("pe-save"), on = !!(PE.doc && PE.dirty && PE.hist.stack.length > 1); if (!b) return; b.classList.toggle("is-dirty", on); var L = PE.projectLink && PE.projectLink(); b.title = (L ? "Save project to " + PE.projectWhere() : "Save project: a .mesproj file that keeps every layer, group and comp") + " (" + MOD + "S)" + (on ? ". You have changes that are not saved in a project file yet." : ""); if (PE.drawProjectBar) PE.drawProjectBar(); }, 0); }
	PE.saveState = saveState; PE.on("history", saveState); PE.on("docsize", saveState);

	/* ---------- autosave (IndexedDB, per project, with Recent projects): projects.js ---------- */
	window.addEventListener("beforeunload", function (e) { if (PE.doc && PE.dirty && PE.hist.stack.length > 1) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- menus ---------- */
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform), MOD = isMac ? "⌘" : "Ctrl+";
	function adj(list) { return list.map(function (a) { return { label: a.title, act: function () { if (needDoc()) PE.runAdjust(a.id); } }; }); }
	var MENUS = [
		{ label: "File", items: [{ label: "New image…", act: function () { PE.dlgNew(); } }, { label: "Open image / PSD / GIMP / project…", key: MOD + "O", act: pickOpen }, { label: "Open project file…", icon: "📂", title: "Open a .mesproj (or a .zip with a project in it) so that Save writes back to the same file", act: function () { PE.openProjectPicker(); } }, { label: "Open project folder…", icon: "📁", title: "Open an unzipped project: a folder with project.json and the layer PNGs in it (Chrome / Edge: Save then writes back into that folder)", act: function () { PE.openProjectFolderPicker(); } }, { label: "Open recent…", act: function () { PE.dlgRecent(); }, title: "Projects autosaved in this browser and project files opened or saved here" }, { label: "Insert equation (LaTeX)…", act: function () { PE.dlgEquation(null, null); } }, { label: "Place image(s) as layers…", act: function () { if (!needDoc()) return; pickFiles("image/*,.xcf", true, function (fs) { openFiles(fs, { place: true }); }); } }, "-",
			{ label: "Save project", tag: "keeps layers", icon: "💾", hi: true, key: MOD + "S", act: saveProject, title: "A .mesproj file with every layer, group, mask, text and comp: open it again here to keep working. Once it is in a file, this writes to that same file" }, { label: "Save project as…", key: MOD + "Alt+Shift+S", act: function () { PE.saveProjectAs(); }, title: "Save the project under a new name or in another folder" }, { label: function () { return (PE.autoFileOn() ? "✓ " : "") + "Auto-save to the project file"; }, act: function () { PE.setAutoFile(!PE.autoFileOn()); }, title: "Write changes into the linked project file 20 s after you stop editing, so a synced folder (OneDrive…) always has the latest" }, { label: "Download project as .zip", act: function () { PE.downloadProjectZip(); }, title: "The same project as a normal .zip file (project.json + one PNG per layer): drop it on the editor to keep working" }, "-", { label: "Export as PNG / JPEG / WebP…", key: MOD + "Shift+S", act: function () { if (needDoc()) PE.dlgExport(); } }, { label: "Export the selected group as its own image…", act: function () { if (needDoc()) PE.dlgExportGroup(); } }, { label: "Export all comps as pictures (ZIP)…", act: function () { if (needDoc()) PE.dlgExportComps(); } }, { label: "Export every layer as PNG (ZIP)…", act: function () { PE.dlgExportLayers(); }, title: "One PNG per layer plus layers.json with the positions, for other apps" }, { label: "Save as PSD (Photoshop)", act: savePsd }, { label: "Save as GIMP file (.xcf)", act: function () { PE.saveXcf(); } }, "-",
			{ label: "Where are my images? (files, folder, autosave)…", act: function () { PE.dlgFolder("where"); } }, { label: "Keep working on another computer…", act: function () { PE.dlgFolder("move"); } }, { label: "Connect a folder on this computer…", act: function () { PE.dlgFolder("folder"); } }, "-", { label: "Copy merged image to clipboard", act: function () { if (needDoc()) copyMerged(); } }, { label: "Share as a link (temporary upload)…", act: function () { if (needDoc()) PE.dlgShare(); } }, "-", { label: "Bulk convert images…", act: function () { window.open("/image-converter", "_blank"); } }] },
		{ label: "Edit", items: [{ label: "Undo", key: MOD + "Z", act: function () { PE.undo(); } }, { label: "Redo", key: MOD + "Shift+Z", act: function () { PE.redo(); } }, "-", { label: "Cut", key: MOD + "X", act: function () { copySel(true); } }, { label: "Copy", key: MOD + "C", act: function () { copySel(false); } }, { label: "Copy merged", act: function () { if (needDoc()) copyMerged(); } }, { label: "Paste as new layer", key: MOD + "V", act: pasteInternal }, "-",
			{ label: "Erase selection with AI (remove object)", act: function () { if (needSel()) PE.aiEraseRun(); } }, { label: "Clear selection (transparent)", key: "Del", act: clearSel }, { label: "Fill with foreground colour", key: "Alt+Backspace", act: function () { if (needDoc()) fillSel(PE.fg); } }, { label: "Fill with background colour", key: MOD + "Backspace", act: function () { if (needDoc()) fillSel(PE.bg); } }, "-",
			{ label: "Select all", key: MOD + "A", act: function () { if (needDoc()) { PE.selAll(); PE.commit("Select all"); } } }, { label: "Deselect", key: MOD + "D", act: function () { if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } }, { label: "Invert selection", key: MOD + "Shift+I", act: function () { if (needDoc()) { PE.selInvert(); PE.commit("Invert selection"); } } },
			{ label: "Feather selection…", act: function () { if (needSel()) promptNum("Feather selection", "Radius", 8, 1, 200, function (v) { PE.selFeather(v); PE.commit("Feather"); }); } }, { label: "Grow selection…", act: function () { if (needSel()) promptNum("Grow selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, true); PE.commit("Grow selection"); }); } }, { label: "Shrink selection…", act: function () { if (needSel()) promptNum("Shrink selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, false); PE.commit("Shrink selection"); }); } }] },
		{ label: "Image", items: [{ label: "Image size…", act: function () { PE.dlgImageSize(); } }, { label: "Canvas size…", act: function () { PE.dlgCanvasSize(); } }, { label: "Upscale with AI (2× / 4×)…", act: function () { PE.aiUpscale(); } }, { label: "Crop to selection", act: function () { if (!needDoc()) return; var b = PE.selBounds(); if (!b) { PE.toast("Make a selection first, or use the Crop tool"); return; } PE.cropTo(b.x, b.y, b.w, b.h); } }, { label: "Trim transparent edges", act: function () { if (needDoc()) PE.trim(); } }, "-",
			{ label: "Rotate / straighten…", act: function () { PE.dlgStraighten(); } }, { label: "Rotate 90° clockwise", act: function () { if (needDoc()) PE.rotateImage(90); } }, { label: "Rotate 90° counter-clockwise", act: function () { if (needDoc()) PE.rotateImage(270); } }, { label: "Rotate 180°", act: function () { if (needDoc()) PE.rotateImage(180); } }, { label: "Flip horizontal", act: function () { if (needDoc()) PE.flipImage(true); } }, { label: "Flip vertical", act: function () { if (needDoc()) PE.flipImage(false); } }, "-", { label: "Flatten image", act: function () { if (needDoc()) PE.flattenImage(); } }] },
		{ label: "Layer", items: [{ label: "Group layers", key: MOD + "G", act: function () { if (needDoc()) groupSelected(); } }, { label: "Ungroup", key: MOD + "Shift+G", act: function () { if (needDoc()) PE.ungroup(); } }, "-", { label: "New layer (empty)", key: MOD + "Shift+N", act: function () { if (needDoc()) PE.newRasterLayer(); } }, { label: "New solid colour layer… (white, black, any colour)", act: function () { PE.dlgFillLayer(); } }, { label: "Duplicate layer", key: MOD + "J", act: function () { if (needDoc()) PE.duplicateLayer(); } }, { label: "Delete layer", act: function () { if (needDoc()) PE.deleteLayer(); } }, { label: "Layer via copy (selection)", act: function () { if (needDoc()) PE.layerFromSelection(false); } }, { label: "Layer via cut (selection)", act: function () { if (needDoc()) PE.layerFromSelection(true); } }, "-",
			{ label: "Merge down", key: MOD + "E", act: function () { if (needDoc()) PE.mergeDown(); } }, { label: "Merge visible", act: function () { if (needDoc()) PE.mergeVisible(); } }, "-", { label: "Remove background (AI)…", act: function () { PE.aiRemoveBackground(); } }, { label: "Add layer mask", act: function () { if (needDoc()) PE.addMask(PE.active(), true); } }, { label: "Apply layer mask", act: function () { if (needDoc()) PE.applyMask(); } }, { label: "Delete layer mask", act: function () { if (needDoc()) PE.deleteMask(); } }, { label: "How layer masks work", act: function () { PE.maskHelp(); } }, { label: "Rasterize text layer", act: function () { var L = PE.active(); if (L && L.type === "text") { PE.rasterize(L); PE.commit("Rasterize"); } } }, "-",
			{ label: "Align: left", act: function () { align("left"); } }, { label: "Align: centre horizontally", act: function () { align("hcenter"); } }, { label: "Align: right", act: function () { align("right"); } }, { label: "Align: top", act: function () { align("top"); } }, { label: "Align: centre vertically", act: function () { align("vcenter"); } }, { label: "Align: bottom", act: function () { align("bottom"); } }, "-",
			{ label: "Layer style: outline…", act: function () { PE.dlgLayerStyle(null, "outline"); }, title: "A live outline around the layer's visible pixels: change or remove it any time" }, { label: "Layer style: drop shadow…", act: function () { PE.dlgLayerStyle(null, "shadow"); } }, { label: "Layer style: glow…", act: function () { PE.dlgLayerStyle(null, "glow"); } }, { label: "Outline / shadow as a new layer (pixels)…", act: function () { PE.dlgEffect("outline"); } }, { label: "Crop layer (hide its edges)", key: "Y", act: function () { var L = PE.active(); if (needDoc() && L && !PE.isGroup(L)) PE.setTool("layercrop"); } }, { label: "Show the whole layer (uncrop)", act: function () { if (needDoc()) PE.clearLayerCrop(); } }, { label: "Round corners…", act: function () { PE.dlgRoundCorners(); } }, "-", { label: "Fit layer inside canvas", act: function () { fitLayer(false); } }, { label: "Fill canvas with layer", act: function () { fitLayer(true); } }, { label: "Reset layer scale / rotation", act: resetTransform }, { label: "Flip layer horizontally", act: function () { if (needDoc()) PE.flipLayer(true); } }, { label: "Flip layer vertically", act: function () { if (needDoc()) PE.flipLayer(false); } }, "-", { label: "Move layer up", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 1); } }, { label: "Move layer down", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -1); } }, { label: "Bring to front", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 999); } }, { label: "Send to back", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -999); } }] },
		{ label: "Adjust", items: adj(PE.ADJUST) }, { label: "Filter", items: adj(PE.FILTERS) },
		{ label: "View", items: [{ label: "Zoom in", key: MOD + "+", act: function () { PE.setZoom(PE.view.zoom * 1.25); } }, { label: "Zoom out", key: MOD + "−", act: function () { PE.setZoom(PE.view.zoom / 1.25); } }, { label: "Fit on screen", key: MOD + "0", act: function () { PE.fit(); } }, { label: "Actual pixels (100%)", key: MOD + "1", act: function () { PE.setZoom(1); } }, "-", { label: "Pixel grid (when zoomed in)", act: function () { PE.showGrid = !PE.showGrid; PE.invalidate(); } }, { label: "Full window mode", key: "F", act: function () { toggleWin(); } }] },
		{ label: "Help", items: [{ label: "Keyboard shortcuts", act: shortcuts }, { label: "Tips for labels, arrows and callouts", act: tips }] }
	];
	var openMenu = null;
	function lab(it) { return typeof it.label === "function" ? it.label() : it.label; }
	PE.rebuildMenus = function () { buildMenus(); };
	function buildMenus() {
		var bar = $("pe-menubar"); bar.innerHTML = "";
		MENUS.forEach(function (m) {
			var b = el("button", "pe-menu", esc(m.label)); b.type = "button"; b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false");
			var pop = el("div", "pe-pop"); pop.hidden = true; pop.setAttribute("role", "menu");
			m.items.forEach(function (it) { if (it === "-") { pop.appendChild(el("div", "pe-sep")); return; } var r = el("button", "pe-item" + (it.hi ? " pe-item--hi" : ""), "<span>" + (it.icon ? '<span class="pe-iic" aria-hidden="true">' + esc(it.icon) + "</span>" : "") + esc(lab(it)) + (it.tag ? ' <small class="pe-itag">' + esc(it.tag) + "</small>" : "") + "</span>" + (it.key ? "<kbd>" + esc(it.key) + "</kbd>" : "")); r.type = "button"; r.setAttribute("role", "menuitem"); if (it.title) r.title = it.title; r.addEventListener("click", function () { closeMenu(); it.act(); }); pop.appendChild(r); });
			var wrap = el("div", "pe-mwrap"); wrap.appendChild(b); wrap.appendChild(pop); bar.appendChild(wrap);
			b.addEventListener("click", function (e) { e.stopPropagation(); if (openMenu && openMenu.b === b) closeMenu(); else showMenu(b, pop, wrap); }); b.addEventListener("mouseenter", function () { if (openMenu && openMenu.b !== b) showMenu(b, pop, wrap); });
		});
	}
	function showMenu(b, pop, wrap) { closeMenu(); pop.hidden = false; b.setAttribute("aria-expanded", "true"); openMenu = { b: b, pop: pop }; var r = pop.getBoundingClientRect(); if (r.right > window.innerWidth - 8) pop.style.left = (window.innerWidth - 8 - r.right) + "px"; if (r.bottom > window.innerHeight - 8) pop.style.maxHeight = (window.innerHeight - r.top - 12) + "px"; }
	function closeMenu() { if (openMenu) { openMenu.pop.hidden = true; openMenu.pop.style.left = ""; openMenu.b.setAttribute("aria-expanded", "false"); openMenu = null; } }
	document.addEventListener("click", closeMenu); document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
	function shortcuts() {
		var rows = [["V M L W C", "Move, Marquee, Lasso, Magic wand, Crop"], ["B E S R", "Brush, Eraser, Clone stamp, Retouch"], ["K G I", "Paint bucket, Gradient, Eyedropper"], ["T U", "Text, Shapes & annotations"], ["H / Space", "Pan (hold Space with any tool)"], ["Z, Ctrl + wheel", "Zoom"], ["[ and ]", "Smaller / larger brush"], ["X / D", "Swap / reset colours"], [MOD + "Z, " + MOD + "Shift+Z", "Undo, redo"], [MOD + "A, " + MOD + "D, " + MOD + "Shift+I", "Select all, deselect, invert selection"], [MOD + "C X V", "Copy, cut, paste as layer"], [MOD + "J, " + MOD + "E", "Duplicate layer, merge down"], ["Delete", "Clear selection (or delete the layer)"], ["Arrow keys", "Nudge the layer (Shift = 10 px)"], ["Enter / Esc", "Apply crop, close polygon / cancel"], [MOD + "0 / " + MOD + "1", "Fit on screen / 100%"], [MOD + "S", "Save project (keeps layers)"], [MOD + "Shift+S", "Export PNG / JPEG / WebP"]];
		var w = el("div"); w.innerHTML = '<table class="pe-keys">' + rows.map(function (r) { return "<tr><td><kbd>" + esc(r[0]) + "</kbd></td><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</table>"; PE.modal({ title: "Keyboard shortcuts", body: w, buttons: [{ label: "Close", primary: true, act: function (m) { m.close(); } }] });
	}
	function tips() {
		var w = el("div", "pe-tips"); w.innerHTML = "<ul><li><b>Label an image:</b> Text tool, click, type. Turn on <i>Background box</i> (or press <i>Yellow label</i>) for a callout look.</li><li><b>Arrows, boxes, numbers:</b> Shapes tool. Each shape lands on its own layer: move it with the Move tool, delete it from the Layers panel.</li><li><b>Combine images:</b> drag several files onto the canvas (each becomes a layer) or paste with Ctrl+V. Move, resize and rotate with the Move tool.</li><li><b>Transparent background:</b> Magic wand the background, press Delete, then Export as PNG. Or Adjust → Make a colour transparent.</li><li><b>Remove an object or person:</b> Object Erase tool (J): paint over it, press Enter. Or make a selection and use Edit → Erase selection with AI. <b>Cut out a subject:</b> Layer → Remove background (AI).</li><li><b>Many thumbnails from one project:</b> put each design in a group (select layers with Ctrl-click, Ctrl+G), then use the Comps tab: set up what is visible, + Save current view, repeat, then Export all. Press , and . to flip between comps.</li><li><b>Make a small picture bigger:</b> Image → Upscale with AI.</li><li><b>Equations:</b> Equation tool (Q) or File → Insert equation: type LaTeX (or paste LaTeX text with Ctrl+V), see the preview, Insert. Click it again to edit; it stays sharp when enlarged.</li><li><b>Hide private info:</b> Shapes → Blur / hide area, then drag over it.</li><li><b>Large file?</b> Export as WebP or JPEG and lower the quality.</li></ul>"; PE.modal({ title: "Tips", body: w, buttons: [{ label: "Close", primary: true, act: function (m) { m.close(); } }] });
	}

	/* ---------- search: tools, menu commands, layers (Ctrl+K) ---------- */
	(function () {
		var inp = $("pe-search"), box = $("pe-sres"), items = [], sel = 0;
		function build() {
			var list = [];
			PE.toolOrder.forEach(function (id) { var t = PE.tools[id]; if (t) list.push({ k: "Tool", l: t.name, sub: t.key ? "key " + t.key.toUpperCase() : "", hay: (t.name + " " + (HELP[id] || t.hint || "")).toLowerCase(), run: function () { PE.setTool(id); } }); });
			MENUS.forEach(function (m) { m.items.forEach(function (it) { if (it !== "-") list.push({ k: m.label, l: lab(it).replace(/…$/, "") + (it.tag ? " (" + it.tag + ")" : ""), sub: it.key || "", hay: (lab(it) + " " + (it.tag || "") + " " + (it.title || "") + " " + m.label).toLowerCase(), run: function () { it.act(); } }); }); });
			if (PE.doc) PE.doc.layers.slice().reverse().forEach(function (L) { if (!PE.isGroup(L) || true) list.push({ k: PE.isGroup(L) ? "Group" : "Layer", l: L.name, sub: PE.isGroup(L) ? "group" : (L.type === "text" ? "text layer" : "layer"), hay: L.name.toLowerCase(), run: function () { PE.setActive(L.id); PE.emit("layers"); } }); });
			return list;
		}
		function run() {
			var q = inp.value.trim().toLowerCase(); if (!q) { box.hidden = true; return; } var toks = q.split(/\s+/), all = build();
			items = all.map(function (x) { var inTitle = toks.every(function (t) { return x.l.toLowerCase().indexOf(t) >= 0; }), inHay = toks.every(function (t) { return x.hay.indexOf(t) >= 0; }); return inTitle ? { x: x, s: x.l.toLowerCase().indexOf(toks[0]) === 0 ? 3 : 2 } : inHay ? { x: x, s: 1 } : null; }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).slice(0, 14).map(function (o) { return o.x; });
			sel = 0; draw();
		}
		function draw() {
			box.hidden = false; box.innerHTML = items.length ? "" : '<div class="pe-sres-none">Nothing matches. Try “crop”, “blur”, “export”, “white” or a layer name.</div>';
			items.forEach(function (x, i) { var r = el("button", "pe-sres-i", "<span class=\"pe-sres-k\">" + esc(x.k) + "</span><span class=\"pe-sres-l\">" + esc(x.l) + "</span>" + (x.sub ? "<kbd>" + esc(x.sub) + "</kbd>" : "")); r.type = "button"; r.setAttribute("aria-selected", i === sel ? "true" : "false"); r.addEventListener("mousedown", function (e) { e.preventDefault(); pick(i); }); box.appendChild(r); });
		}
		function pick(i) { var x = items[i]; if (!x) return; box.hidden = true; inp.value = ""; inp.blur(); x.run(); }
		inp.addEventListener("input", run); inp.addEventListener("focus", run);
		inp.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); } else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } else if (e.key === "Enter") { e.preventDefault(); pick(sel); } else if (e.key === "Escape") { inp.value = ""; box.hidden = true; inp.blur(); } });
		document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest("#pe-searchw")) box.hidden = true; });
		document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && root.offsetParent) { e.preventDefault(); e.stopPropagation(); inp.focus(); inp.select(); } }, true);
	})();
	/* "?" on the panel headings */
	(function () {
		var T = { "Colour": "The two colours you paint with. The big square on top is the foreground (brushes, text, shapes), the one behind it is the background. Click either to change it, press X to swap them, D to reset to black and white.", "Layers": "Layers are transparent sheets stacked on top of each other: each picture, text or drawing lives on its own so you can move or delete it without touching the rest. The one at the top of the list is in front. Click a layer to select it; the eye hides it. Use the buttons: New adds an empty layer, Colour fill adds a layer of one solid colour (a white background, say), Merge down joins it with the layer below.", "History": "Every change you make is listed here. Click an earlier step to go back to it, or press Ctrl+Z. Steps after it stay until you make a new change.", "Comps": "Comps are saved scenes: which layers are shown and where they sit. Make a few versions of a design (different headlines, say) and switch between them, or export them all as pictures at once." };
		Array.prototype.forEach.call(root.querySelectorAll(".pe-ph"), function (h) { var k = h.textContent.trim(); if (T[k] && !h.querySelector(".pe-qh")) h.appendChild(PE.helpBtn(k, esc(T[k]))); });
		var tabs = $("pe-tab-hist"), tc = $("pe-tab-comps"); if (tabs && tc && tabs.parentNode) { tabs.title = T["History"]; tc.title = T["Comps"]; }
	})();

	/* ---------- window mode ---------- */
	var autoWin = false;
	function toggleWin(auto) { var on = !root.classList.contains("pe-win"); root.classList.toggle("pe-win", on); document.documentElement.classList.toggle("pe-win-on", on); $("pe-winbtn").setAttribute("aria-pressed", on ? "true" : "false"); $("pe-winbtn").textContent = on ? "⤡ Exit full window" : "⤢ Full window"; if (auto !== true) sset({ win: on }); setTimeout(function () { resize(); if (PE.doc) PE.fit(); }, 30); }
	$("pe-winbtn").addEventListener("click", function () { toggleWin(); });
	// no automatic Full window when a picture is opened (it hid the sidebar and the Standard | Wide | Theatre switch): Full window stays one click away (key F) and a manual choice is remembered

	/* ---------- keyboard ---------- */
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) && t.type !== "range" && t.type !== "checkbox" && t.type !== "button") || (t && t.isContentEditable);
		if (typing || PE.modalOpen()) return; var k = e.key, low = k.toLowerCase(), mod = e.ctrlKey || e.metaKey, has = !!PE.doc;
		if (PE.textKey && PE.textKey(e)) { e.preventDefault(); return; }   // a text is open but its key catcher lost focus: the key goes into the text, not to a tool shortcut
		if (k === " " ) { if (!e.repeat) { PE.setSpace(true); PE.spaceHeld = true; PE.els.over.style.cursor = "grab"; } if (document.activeElement === document.body || root.contains(document.activeElement)) e.preventDefault(); return; }
		if (mod) {
			if (low === "z") { e.preventDefault(); e.shiftKey ? PE.redo() : PE.undo(); return; } if (low === "y") { e.preventDefault(); PE.redo(); return; }
			if (!has && low !== "v" && low !== "o") return;
			if ((low === "b" || low === "u" || (low === "i" && !e.shiftKey)) && !e.altKey) { var AL = PE.active(); if (AL && AL.type === "text" && AL.text && PE.textToggleStyle) { e.preventDefault(); PE.textToggleStyle(low === "b" ? 1 : low === "i" ? 2 : 4); return; } }   // bold / italic / underline the whole active text layer
			if (low === "a") { e.preventDefault(); PE.selAll(); PE.commit("Select all"); } else if (low === "d") { e.preventDefault(); if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } else if (low === "i" && e.shiftKey) { e.preventDefault(); PE.selInvert(); PE.commit("Invert selection"); }
			else if (low === "c") { e.preventDefault(); e.shiftKey ? copyMerged() : copySel(false); } else if (low === "x") { e.preventDefault(); copySel(true); } else if (low === "j") { e.preventDefault(); PE.duplicateLayer(); } else if (low === "g") { e.preventDefault(); e.shiftKey ? PE.ungroup() : groupSelected(); } else if (low === "e") { e.preventDefault(); PE.mergeDown(); }
			else if (low === "n" && e.shiftKey) { e.preventDefault(); PE.newRasterLayer(); } else if (low === "s" || e.code === "KeyS") { e.preventDefault(); e.shiftKey && e.altKey ? PE.saveProjectAs() : e.shiftKey ? PE.dlgExport() : saveProject(); } else if (k === "0") { e.preventDefault(); PE.fit(); } else if (k === "1") { e.preventDefault(); PE.setZoom(1); } else if (k === "=" || k === "+") { e.preventDefault(); PE.setZoom(PE.view.zoom * 1.25); } else if (k === "-") { e.preventDefault(); PE.setZoom(PE.view.zoom / 1.25); }
			else if (low === "t") { e.preventDefault(); PE.setTool("move"); PE.opt.move.handles = true; buildOpts(); } else if (low === "o") { e.preventDefault(); pickOpen(); } else if (k === "Backspace") { e.preventDefault(); fillSel(PE.bg); }
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
	root.addEventListener("dblclick", function (e) { if (e.target === PE.els.over && PE.toolId !== "text") { var L = PE.active(); if (L && L.type === "text" && PE.toolId === "move") PE.editActiveText(PE.toDoc(e.clientX, e.clientY)); else if (L && L.eq && PE.toolId === "move") PE.dlgEquation(L); } });

	/* ---------- empty state + init ---------- */
	$("pe-e-open").addEventListener("click", pickOpen);
	$("pe-e-new").addEventListener("click", function () { PE.dlgNew(); }); $("pe-e-paste").addEventListener("click", pasteInternal);
	var recBox = $("pe-recent"); if (recBox && PE.recentEl) { var rl = PE.recentEl({ title: "Recent projects", compact: true, keep: true, limit: 6 }); recBox.appendChild(rl); }
	if (S.opt) for (var k in S.opt) if (PE.opt[k]) for (var kk in S.opt[k]) if (kk in PE.opt[k]) PE.opt[k][kk] = S.opt[k][kk];
	PE.opt.shape.next = 1; PE.opt.text.str = "Text";
	showTab(S.tab === "comps" ? "comps" : "hist"); buildMenus(); buildTools(); PE.initPointer(); PE.initTextEditor(); buildColor(); resize(); PE.setTool("move"); status(); if (PE.recentReady) PE.recentReady(); saveState();
	if (S.win) { autoWin = true; toggleWin(true); }
	var q = new URLSearchParams(location.search); if (q.get("new")) { var wh = (q.get("new") || "").split("x"); if (wh.length === 2) PE.newDoc(+wh[0], +wh[1], "#ffffff"); }
	window.PEdebug = PE;
})();
