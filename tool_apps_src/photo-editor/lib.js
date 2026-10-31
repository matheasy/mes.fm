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


	/* ================= layer styles (Photoshop / Photopea style), pure maths =================
	   A layer style is worked out from the layer's alpha (0-255, with a transparent margin round it) as a list of planes: each plane is a coverage
	   (Float32 0-1) with one colour (or an RGBA picture for the gradient overlay), a blend mode and an opacity, drawn either UNDER the layer
	   (drop shadow, outer glow, the outside of a bevel, an outside stroke) or OVER it (inner shadow, inner glow, satin, colour / gradient overlay, the
	   inside of a bevel, an inside / centre stroke), already clipped to where they belong. Sizes are in the layer's own pixels (geo.sc converts from
	   image pixels), angles are on the image (geo.vec turns an image vector into the layer's axes, so a rotated layer keeps its light from upper left).
	   Blend modes are canvas globalCompositeOperation names ("source-over" = Normal, "lighter" = Linear Dodge). */
	var FXDEF = {
		fill: 1,
		bevel: { on: false, style: "inner", tech: "smooth", depth: 100, dir: "up", size: 5, soften: 0, angle: 120, alt: 30, gl: true, hiMode: "screen", hiC: "#ffffff", hiOp: 0.75, shMode: "multiply", shC: "#000000", shOp: 0.75 },
		outline: { on: false, w: 3, c: "#000000", pos: "outside", op: 1, mode: "source-over" },
		ishadow: { on: false, c: "#000000", op: 0.75, mode: "multiply", angle: 120, dist: 5, choke: 0, size: 5, gl: true },
		iglow: { on: false, c: "#ffffbe", op: 0.75, mode: "screen", size: 5, choke: 0, src: "edge" },
		satin: { on: false, c: "#000000", op: 0.5, mode: "multiply", angle: 19, dist: 11, size: 14, invert: true },
		color: { on: false, c: "#ff0000", op: 1, mode: "source-over" },
		grad: { on: false, op: 1, mode: "source-over", type: "linear", angle: 90, scale: 100, reverse: false, stops: [{ p: 0, c: "#000000", a: 1 }, { p: 1, c: "#ffffff", a: 1 }] },
		oglow: { on: false, c: "#ffffbe", op: 0.75, mode: "screen", size: 5, spread: 0 },
		shadow: { on: false, c: "#000000", op: 0.75, mode: "multiply", angle: 120, dist: 5, spread: 0, blur: 5, gl: true, knock: true }
	};
	var FXKEYS = ["bevel", "outline", "ishadow", "iglow", "satin", "color", "grad", "oglow", "shadow"];
	/* a complete style object from a stored one (older styles had outline {on,w,c,pos,op} and shadow {on,c,op,blur,dx,dy}) */
	function fxNorm(fx) {
		var o = { fill: fx && fx.fill != null ? clamp(+fx.fill, 0, 1) : 1 };
		FXKEYS.forEach(function (k) { var d = FXDEF[k], s = fx && fx[k]; o[k] = Object.assign({}, d, s || {}); });
		var sh = fx && fx.shadow;
		if (sh && sh.angle == null && (sh.dx != null || sh.dy != null)) { var dx = +sh.dx || 0, dy = +sh.dy || 0; o.shadow.dist = Math.round(Math.hypot(dx, dy) * 10) / 10; o.shadow.angle = o.shadow.dist ? Math.round(Math.atan2(dy, -dx) * 180 / Math.PI) : 120; o.shadow.gl = false; if (!sh.mode) o.shadow.mode = "source-over"; if (sh.knock == null) o.shadow.knock = true; if (sh.spread == null) o.shadow.spread = 0; }
		if (fx && fx.outline && !fx.outline.mode) o.outline.mode = "source-over";
		o.grad.stops = (o.grad.stops && o.grad.stops.length >= 2 ? o.grad.stops : FXDEF.grad.stops).map(function (s) { return { p: clamp(+s.p || 0, 0, 1), c: parseColor(s.c) || "#000000", a: s.a == null ? 1 : clamp(+s.a, 0, 1) }; }).sort(function (a, b) { return a.p - b.p; });
		return o;
	}
	function fxAny(fx) { if (!fx) return false; var o = fxNorm(fx); if (o.fill < 1) return true; for (var i = 0; i < FXKEYS.length; i++) { var e = o[FXKEYS[i]]; if (e.on && (FXKEYS[i] !== "outline" || e.w > 0)) return true; } return false; }
	/* the angle a shadow-like effect uses (its own, or the image's global light) */
	function fxAngle(e, light) { return e.gl && light && light.angle != null ? +light.angle : +e.angle; }
	/* the offset (image px, y down) of a shadow cast away from a light at `angle` degrees (Photoshop: 120 = light from the upper left) */
	function fxOffset(angle, dist) { var a = angle * Math.PI / 180; return { x: -Math.cos(a) * dist, y: Math.sin(a) * dist }; }
	/* how far (image px) a style reaches past the layer's pixels */
	function fxReach(fx, light) {
		if (!fx) return 0; var o = fxNorm(fx), r = 0;
		if (o.outline.on && o.outline.pos !== "inside") r = Math.max(r, o.outline.pos === "center" ? o.outline.w / 2 : o.outline.w);
		if (o.shadow.on) r = Math.max(r, o.shadow.blur * 1.6 + o.shadow.dist + 2);
		if (o.oglow.on) r = Math.max(r, o.oglow.size * 1.6 + 2);
		if (o.bevel.on && o.bevel.style !== "inner") r = Math.max(r, o.bevel.size + o.bevel.soften * 2 + 2);
		return Math.ceil(r) + 2;
	}
	/* signed distance to the shape's edge (+ inside, - outside), half-pixel accurate; anti-aliased edge pixels use their alpha */
	function sdField(alpha, w, h) {
		var n = w * h, ins = new Uint8Array(n), outs = new Uint8Array(n), sd = new Float32Array(n);
		for (var i = 0; i < n; i++) { if (alpha[i] >= 128) ins[i] = 1; else outs[i] = 1; }
		var dO = edt(outs, w, h), dI = edt(ins, w, h);
		for (var j = 0; j < n; j++) { var a = alpha[j], s = ins[j] ? Math.sqrt(dO[j]) - 0.5 : 0.5 - Math.sqrt(dI[j]); if (a > 0 && a < 255 && Math.abs(s) <= 1) s = a / 255 - 0.5; sd[j] = s; }
		return sd;
	}
	/* coverage of the shape grown (+) or shrunk (-) by `off` pixels */
	function sdCover(sd, off) { var n = sd.length, o = new Float32Array(n); off = off || 0; for (var i = 0; i < n; i++) { var v = sd[i] + off + 0.5; o[i] = v <= 0 ? 0 : v >= 1 ? 1 : v; } return o; }
	function boxPassF(src, dst, w, h, r, horiz) {
		r = Math.max(0, Math.round(r)); if (r === 0) { dst.set(src); return; }
		var len = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 1 : w, lstep = horiz ? w : 1, div = 2 * r + 1;
		for (var l = 0; l < lines; l++) {
			var o = l * lstep, first = src[o], last = src[o + (len - 1) * step], sum = (r + 1) * first;
			for (var j = 0; j < r; j++) sum += src[o + Math.min(j, len - 1) * step];
			for (var i = 0; i < len; i++) { var ai = i + r, add = ai < len ? src[o + ai * step] : last, rem = i - r - 1 < 0 ? first : src[o + (i - r - 1) * step]; sum += add - rem; dst[o + i * step] = sum / div; }
		}
	}
	/* gaussian-like blur of a Float32 plane (three box passes), in place; sigma in pixels */
	function blurF(a, w, h, sigma) {
		if (!(sigma > 0.3)) return a; var tmp = new Float32Array(a.length), bx = boxSizes(sigma, 3);
		for (var p = 0; p < 3; p++) { boxPassF(a, tmp, w, h, bx[p], true); boxPassF(tmp, a, w, h, bx[p], false); }
		return a;
	}
	/* move a plane by (dx, dy) whole pixels; what comes in from outside is `fill` */
	function shiftF(a, w, h, dx, dy, fill) {
		dx = Math.round(dx); dy = Math.round(dy); var o = new Float32Array(a.length); if (fill) o.fill(fill);
		for (var y = 0; y < h; y++) { var sy = y - dy; if (sy < 0 || sy >= h) continue; for (var x = 0; x < w; x++) { var sx = x - dx; if (sx >= 0 && sx < w) o[y * w + x] = a[sy * w + sx]; } }
		return o;
	}
	function mulF(a, b) { for (var i = 0; i < a.length; i++) a[i] *= b[i]; return a; }
	function invF(a) { for (var i = 0; i < a.length; i++) a[i] = 1 - a[i]; return a; }
	/* colour of a gradient (stops [{p 0-1, c hex, a 0-1}], sorted) at t: [r, g, b, a 0-1] */
	function gradAt(stops, t) {
		t = clamp(t, 0, 1); if (!stops.length) return [0, 0, 0, 1]; var s0 = stops[0], s1 = stops[stops.length - 1];
		if (t <= s0.p) { var c0 = hexToRgb(s0.c); return [c0[0], c0[1], c0[2], s0.a]; } if (t >= s1.p) { var c1 = hexToRgb(s1.c); return [c1[0], c1[1], c1[2], s1.a]; }
		for (var i = 1; i < stops.length; i++) { var b = stops[i]; if (t <= b.p) { var a = stops[i - 1], k = b.p > a.p ? (t - a.p) / (b.p - a.p) : 0, ca = hexToRgb(a.c), cb = hexToRgb(b.c); return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k, a.a + (b.a - a.a) * k]; } }
		return [0, 0, 0, 1];
	}
	/* the gradient overlay's colour for every pixel (RGBA, straight alpha) over the box {x, y, w, h}; dir = unit vector (layer axes) start -> end */
	function gradPlane(w, h, box, g, dir) {
		var out = new Uint8ClampedArray(w * h * 4), cx = box.x + box.w / 2, cy = box.y + box.h / 2, sc = Math.max(0.1, (g.scale || 100) / 100), ux = dir.x, uy = dir.y, vx = -uy, vy = ux;
		var half = Math.max(0.5, (Math.abs(ux) * box.w + Math.abs(uy) * box.h) / 2) * sc, rad = Math.max(0.5, Math.hypot(box.w, box.h) / 2 * sc), lut = [];
		for (var q = 0; q <= 1024; q++) lut.push(gradAt(g.stops, q / 1024));
		var a0 = Math.atan2(uy, ux);
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var px = x + 0.5 - cx, py = y + 0.5 - cy, along = px * ux + py * uy, across = px * vx + py * vy, t;
			if (g.type === "radial") t = Math.hypot(px, py) / rad; else if (g.type === "reflected") t = Math.abs(along) / half; else if (g.type === "diamond") t = (Math.abs(along) + Math.abs(across)) / rad;
			else if (g.type === "angle") { var an = Math.atan2(py, px) - a0; t = ((an / (2 * Math.PI)) % 1 + 1) % 1; } else t = 0.5 + along / (2 * half);
			if (g.reverse) t = 1 - t; var c = lut[Math.round(clamp(t, 0, 1) * 1024)], i = (y * w + x) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = Math.round(c[3] * 255);
		}
		return out;
	}
	/* Bevel and Emboss: highlight and shadow amounts (0-1) inside and outside the shape, from a height map built on the signed distance field and lit
	   from `light` = {x, y} (unit vector toward the light in the layer's pixel axes) at `b.alt` degrees above the surface. */
	function bevelPlanes(sd, w, h, b, light) {
		var n = w * h, size = Math.max(0.5, +b.size || 1), H = new Float32Array(n), st = b.style || "inner", tech = b.tech || "smooth";
		for (var i = 0; i < n; i++) {
			var s = sd[i], t;
			if (st === "outer") t = s >= 0 ? 1 : clamp(1 + s / size, 0, 1);
			else if (st === "emboss" || st === "stroke") t = clamp(0.5 + s / size, 0, 1);
			else if (st === "pillow") t = clamp(Math.abs(s) / (size / 2), 0, 1);
			else t = s <= 0 ? 0 : clamp(s / size, 0, 1);
			var f = tech === "smooth" ? 1 - (1 - t) * (1 - t) : t;
			H[i] = f * size;
		}
		if (tech === "smooth") blurF(H, w, h, Math.max(0.6, size * 0.22)); else if (tech === "soft") blurF(H, w, h, 0.9);
		if (b.soften > 0) blurF(H, w, h, b.soften / 2);
		/* Shading like Photoshop's rather than a strict Lambert model (where a very steep slope turns away from a low light and goes dark again): how
		   much a slope faces the light (cos of the angle between its downhill direction and the light) times how steep it is (saturating, so Depth
		   raises the contrast until it is full), stronger for a low light (altitude 0) and faint for a light straight overhead (90). */
		var k = (+b.depth || 100) / 100 * (b.dir === "down" ? -1 : 1), alt = clamp(+b.alt || 0, 0, 90) * Math.PI / 180, A = 0.15 + 1.35 * Math.cos(alt), lx = light.x, ly = light.y;
		var inner = st !== "outer", outer = st !== "inner", hiIn = inner ? new Float32Array(n) : null, shIn = inner ? new Float32Array(n) : null, hiOut = outer ? new Float32Array(n) : null, shOut = outer ? new Float32Array(n) : null;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var j = y * w + x, gx = (H[x < w - 1 ? j + 1 : j] - H[x > 0 ? j - 1 : j]) / 2 * k, gy = (H[y < h - 1 ? j + w : j] - H[y > 0 ? j - w : j]) / 2 * k, gl = Math.sqrt(gx * gx + gy * gy);
			if (gl < 1e-6) continue;
			var v = (-gx * lx - gy * ly) / gl * (1 - Math.exp(-gl * 1.2)) * A, hi = v > 0 ? (v > 1 ? 1 : v) : 0, sh = v < 0 ? (v < -1 ? 1 : -v) : 0, cov = sd[j] + 0.5; cov = cov <= 0 ? 0 : cov >= 1 ? 1 : cov;
			if (inner) { hiIn[j] = hi * cov; shIn[j] = sh * cov; } if (outer) { hiOut[j] = hi * (1 - cov); shOut[j] = sh * (1 - cov); }
		}
		return { hiIn: hiIn, shIn: shIn, hiOut: hiOut, shOut: shOut };
	}
	/* bounding box of the opaque part of an alpha plane (for the gradient overlay); the whole plane when empty */
	function alphaBox(alpha, w, h) {
		var x0 = w, y0 = h, x1 = -1, y1 = -1; for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (alpha[y * w + x] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
		return x1 < 0 ? { x: 0, y: 0, w: w, h: h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
	}
	/* every plane of a layer style. alpha = Uint8 (w x h, with margin); base = {sd} (cached signed distance, optional);
	   geo = {sc: layer px per image px (1 = no scaling), vec(x, y) -> image vector in layer axes, light: {angle, alt} (global light)}.
	   -> [{k, under, a (Float32 coverage), rgb [r,g,b] | rgba (Uint8ClampedArray), mode, op}] in drawing order (under first, bottom to top, then over). */
	function fxPlanes(alpha, w, h, fx, geo, base) {
		var o = fxNorm(fx), n = w * h, sc = geo && geo.sc > 0 ? geo.sc : 1, vec = geo && geo.vec || function (x, y) { return { x: x, y: y }; }, light = geo && geo.light || { angle: 120, alt: 30 };
		var sd = base && base.sd && base.sd.length === n ? base.sd : sdField(alpha, w, h), cov = sdCover(sd, 0), under = [], over = [];
		var px = function (v) { return (+v || 0) / sc; }, unit = function (x, y) { var v = vec(x, y), l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }, rgb = function (c) { return hexToRgb(c); };
		var knock = o.fill < 1;
		if (o.shadow.on) { var S = o.shadow, sz = px(S.blur), spr = clamp(+S.spread || 0, 0, 100) / 100, off = fxOffset(fxAngle(S, light), +S.dist || 0), v = vec(off.x, off.y), a = blurF(sdCover(sd, sz * spr), w, h, sz * (1 - spr) / 2); a = shiftF(a, w, h, v.x, v.y, 0); if (knock && S.knock !== false) mulF(a, invF(Float32Array.from(cov))); under.push({ k: "shadow", under: true, a: a, rgb: rgb(S.c), mode: S.mode, op: S.op }); }
		if (o.oglow.on) { var G = o.oglow, gs = px(G.size), gp = clamp(+G.spread || 0, 0, 100) / 100, ga = blurF(sdCover(sd, gs * gp), w, h, gs * (1 - gp) / 2); if (knock) mulF(ga, invF(Float32Array.from(cov))); under.push({ k: "oglow", under: true, a: ga, rgb: rgb(G.c), mode: G.mode, op: G.op }); }
		var bv = null; if (o.bevel.on) { var B = o.bevel, la = (B.gl ? light.angle : B.angle) * Math.PI / 180, alt = B.gl && light.alt != null ? light.alt : B.alt; bv = bevelPlanes(sd, w, h, { style: B.style, tech: B.tech, depth: B.depth, dir: B.dir, size: px(B.size), soften: px(B.soften), alt: alt }, unit(Math.cos(la), -Math.sin(la)));
			if (bv.shOut) under.push({ k: "bevel-sh-out", under: true, a: bv.shOut, rgb: rgb(B.shC), mode: B.shMode, op: B.shOp }); if (bv.hiOut) under.push({ k: "bevel-hi-out", under: true, a: bv.hiOut, rgb: rgb(B.hiC), mode: B.hiMode, op: B.hiOp }); }
		var ol = o.outline.on && o.outline.w > 0 ? o.outline : null, olA = null;
		if (ol) {   // the shape grown minus the shape shrunk, from the distance field (exact, anti-aliased, no extra distance transform)
			var ow = px(ol.w), g1 = sdCover(sd, ol.pos === "inside" ? 0 : ol.pos === "center" ? ow / 2 : ow), g0 = sdCover(sd, ol.pos === "outside" ? 0 : ol.pos === "center" ? -ow / 2 : -ow); olA = g1; for (var q = 0; q < n; q++) { var dv = g1[q] - g0[q]; olA[q] = dv > 0 ? dv : 0; } if (ol.pos === "outside") under.push({ k: "outline", under: true, a: olA, rgb: rgb(ol.c), mode: ol.mode, op: ol.op }); }
		if (o.ishadow.on) { var I = o.ishadow, isz = px(I.size), ich = clamp(+I.choke || 0, 0, 100) / 100, io = fxOffset(fxAngle(I, light), +I.dist || 0), iv = vec(io.x, io.y), inv = invF(sdCover(sd, -isz * ich)); inv = shiftF(inv, w, h, iv.x, iv.y, 1); blurF(inv, w, h, isz * (1 - ich) / 2); mulF(inv, cov); over.push({ k: "ishadow", a: inv, rgb: rgb(I.c), mode: I.mode, op: I.op }); }
		if (o.iglow.on) { var J = o.iglow, js = px(J.size), jc = clamp(+J.choke || 0, 0, 100) / 100, ed = blurF(invF(sdCover(sd, -js * jc)), w, h, js * (1 - jc) / 2); if (J.src === "center") invF(ed); mulF(ed, cov); over.push({ k: "iglow", a: ed, rgb: rgb(J.c), mode: J.mode, op: J.op }); }
		if (o.satin.on) { var T = o.satin, sa = T.angle * Math.PI / 180, sv = vec(Math.cos(sa) * T.dist, -Math.sin(sa) * T.dist), s1 = blurF(shiftF(cov, w, h, sv.x, sv.y, 0), w, h, px(T.size) / 2), s2 = blurF(shiftF(cov, w, h, -sv.x, -sv.y, 0), w, h, px(T.size) / 2), sat = new Float32Array(n); for (var u = 0; u < n; u++) sat[u] = Math.abs(s1[u] - s2[u]); if (T.invert) invF(sat); mulF(sat, cov); over.push({ k: "satin", a: sat, rgb: rgb(T.c), mode: T.mode, op: T.op }); }
		if (o.color.on) over.push({ k: "color", a: Float32Array.from(cov), rgb: rgb(o.color.c), mode: o.color.mode, op: o.color.op });
		if (o.grad.on) { var g = o.grad, gaRad = g.angle * Math.PI / 180, dir = unit(Math.cos(gaRad), -Math.sin(gaRad)); over.push({ k: "grad", a: Float32Array.from(cov), rgba: gradPlane(w, h, alphaBox(alpha, w, h), g, dir), mode: g.mode, op: g.op }); }
		if (bv && bv.shIn) { over.push({ k: "bevel-sh", a: bv.shIn, rgb: rgb(o.bevel.shC), mode: o.bevel.shMode, op: o.bevel.shOp }); over.push({ k: "bevel-hi", a: bv.hiIn, rgb: rgb(o.bevel.hiC), mode: o.bevel.hiMode, op: o.bevel.hiOp }); }
		if (ol && ol.pos !== "outside") over.push({ k: "outline", a: olA, rgb: rgb(ol.c), mode: ol.mode, op: ol.op });
		return under.concat(over.map(function (p) { p.under = false; return p; }));
	}
	/* ---- Photoshop (ag-psd) layer effects <-> our style ---- */
	var PSD_MODES = { "normal": "source-over", "multiply": "multiply", "screen": "screen", "overlay": "overlay", "darken": "darken", "lighten": "lighten", "color dodge": "color-dodge", "color burn": "color-burn", "hard light": "hard-light", "soft light": "soft-light", "difference": "difference", "exclusion": "exclusion", "hue": "hue", "saturation": "saturation", "color": "color", "luminosity": "luminosity", "linear dodge": "lighter" };
	function modeFromPsd(m, notes, what) { var k = String(m || "normal").toLowerCase(); if (PSD_MODES[k]) return PSD_MODES[k]; if (notes) notes.push(what + ": blend mode “" + m + "” is drawn as Normal"); return "source-over"; }
	function modeToPsd(m) { for (var k in PSD_MODES) if (PSD_MODES[k] === m) return k; return "normal"; }
	function colorFromPsd(c) {
		if (!c) return "#000000"; if (c.r != null) return rgbToHex(c.r, c.g, c.b); if (c.fr != null) return rgbToHex(c.fr * 255, c.fg * 255, c.fb * 255);
		if (c.k != null && c.c == null) { var g = 255 - clamp(c.k, 0, 100) * 2.55; return rgbToHex(g, g, g); }
		if (c.h != null && c.s != null && c.b != null) { var rgb = hsvToRgb(c.h, c.s / 100, c.b / 100); return rgbToHex(rgb[0], rgb[1], rgb[2]); }
		if (c.c != null && c.m != null) { var K = c.k / 100; return rgbToHex(255 * (1 - c.c / 100) * (1 - K), 255 * (1 - c.m / 100) * (1 - K), 255 * (1 - c.y / 100) * (1 - K)); }
		return "#000000";
	}
	function colorToPsd(hex) { var c = hexToRgb(hex); return { r: c[0], g: c[1], b: c[2] }; }
	/* a UnitsValue (or plain number) in pixels; scale = the effects' own scale (1 = 100%) */
	function unitsPx(u, scale) { if (u == null) return 0; var v = typeof u === "number" ? u : +u.value || 0; if (u && u.units === "Percent") return v; return v * (scale || 1); }
	function opac(v, d) { if (v == null) return d; v = +v; return v > 1 ? v / 100 : v; }
	function pct(u) { if (u == null) return 0; var v = typeof u === "number" ? u : +u.value || 0; return clamp(v, 0, 100); }
	function on(e) { return !!e && e.enabled !== false && e.present !== false; }
	/* ag-psd's layer.effects (+ fillOpacity) -> {fx (our style or null), notes [strings: what could not be drawn]} */
	function fxFromPsd(eff, fillOpacity, globalAngle, globalAlt) {
		var notes = [], fx = JSON.parse(JSON.stringify(FXDEF)), any = false; if (fillOpacity != null && fillOpacity < 1) { fx.fill = clamp(fillOpacity, 0, 1); any = true; }
		if (!eff || eff.disabled) { if (eff && eff.disabled) notes.push("the layer's effects were switched off in the file (kept off)"); return { fx: any ? fx : null, notes: notes, light: null }; }
		var s = eff.scale || 1, gA = globalAngle == null ? 120 : globalAngle, gAlt = globalAlt == null ? 30 : globalAlt;
		var ang = function (e, d) { return e.useGlobalLight ? gA : e.angle == null ? d : e.angle; };
		var ds = (eff.dropShadow || []).filter(on); if (ds.length) { var d = ds[0]; Object.assign(fx.shadow, { on: true, c: colorFromPsd(d.color), op: opac(d.opacity, 0.75), mode: modeFromPsd(d.blendMode, notes, "Drop shadow"), angle: ang(d, 120), gl: !!d.useGlobalLight, dist: unitsPx(d.distance, s), blur: unitsPx(d.size, s), spread: pct(d.choke), knock: d.layerConceals !== false }); any = true; if (ds.length > 1) notes.push("Drop shadow: " + ds.length + " shadows, only the first is drawn"); if (d.contour && d.contour.name && !/linear/i.test(d.contour.name)) notes.push("Drop shadow: contour “" + d.contour.name + "” is drawn as Linear"); }
		var is = (eff.innerShadow || []).filter(on); if (is.length) { var q = is[0]; Object.assign(fx.ishadow, { on: true, c: colorFromPsd(q.color), op: opac(q.opacity, 0.75), mode: modeFromPsd(q.blendMode, notes, "Inner shadow"), angle: ang(q, 120), gl: !!q.useGlobalLight, dist: unitsPx(q.distance, s), size: unitsPx(q.size, s), choke: pct(q.choke) }); any = true; if (is.length > 1) notes.push("Inner shadow: only the first of " + is.length + " is drawn"); }
		if (on(eff.outerGlow)) { var g = eff.outerGlow; Object.assign(fx.oglow, { on: true, c: colorFromPsd(g.color), op: opac(g.opacity, 0.75), mode: modeFromPsd(g.blendMode, notes, "Outer glow"), size: unitsPx(g.size, s), spread: pct(g.choke) }); any = true; if (g.noise) notes.push("Outer glow: noise is left out"); }
		if (on(eff.innerGlow)) { var ig = eff.innerGlow; Object.assign(fx.iglow, { on: true, c: colorFromPsd(ig.color), op: opac(ig.opacity, 0.75), mode: modeFromPsd(ig.blendMode, notes, "Inner glow"), size: unitsPx(ig.size, s), choke: pct(ig.choke), src: ig.source === "center" ? "center" : "edge" }); any = true; }
		if (on(eff.bevel)) { var b = eff.bevel, ST = { "inner bevel": "inner", "outer bevel": "outer", "emboss": "emboss", "pillow emboss": "pillow", "stroke emboss": "stroke" }, TE = { "smooth": "smooth", "chisel hard": "hard", "chisel soft": "soft" };
			Object.assign(fx.bevel, { on: true, style: ST[b.style] || "inner", tech: TE[b.technique] || "smooth", depth: b.strength == null ? 100 : Math.round(+b.strength * 1000) / 10, dir: b.direction === "down" ? "down" : "up", size: unitsPx(b.size, s), soften: unitsPx(b.soften, s), angle: ang(b, 120), alt: b.useGlobalLight ? gAlt : b.altitude == null ? 30 : b.altitude, gl: !!b.useGlobalLight,
				hiMode: modeFromPsd(b.highlightBlendMode || "screen", notes, "Bevel highlight"), hiC: colorFromPsd(b.highlightColor || { r: 255, g: 255, b: 255 }), hiOp: opac(b.highlightOpacity, 0.75), shMode: modeFromPsd(b.shadowBlendMode || "multiply", notes, "Bevel shadow"), shC: colorFromPsd(b.shadowColor), shOp: opac(b.shadowOpacity, 0.75) }); any = true;
			if (b.style === "stroke emboss") notes.push("Bevel and emboss: Stroke Emboss is drawn as Emboss"); if (b.contour && b.contour.name && !/linear/i.test(b.contour.name)) notes.push("Bevel and emboss: gloss contour “" + b.contour.name + "” is drawn as Linear"); if (b.useTexture) notes.push("Bevel and emboss: Texture is left out"); if (b.useShape) notes.push("Bevel and emboss: Contour (shape) is left out"); }
		var sf = (eff.solidFill || []).filter(on); if (sf.length) { var f = sf[0]; Object.assign(fx.color, { on: true, c: colorFromPsd(f.color), op: opac(f.opacity, 1), mode: modeFromPsd(f.blendMode, notes, "Color overlay") }); any = true; }
		var go = (eff.gradientOverlay || []).filter(on); if (go.length) { var gr = go[0], gd = gr.gradient || {}, stops = [];
			if (gd.type === "noise" || !gd.colorStops) notes.push("Gradient overlay: a noise gradient is drawn black to white");
			else { var ops = (gd.opacityStops || []).map(function (o) { return { p: clamp((o.location || 0) / 4096, 0, 1), a: opac(o.opacity, 1) }; }).sort(function (a, b) { return a.p - b.p; }), aAt = function (p) { if (!ops.length) return 1; if (p <= ops[0].p) return ops[0].a; for (var i = 1; i < ops.length; i++) if (p <= ops[i].p) { var A = ops[i - 1], Bq = ops[i], k = Bq.p > A.p ? (p - A.p) / (Bq.p - A.p) : 0; return A.a + (Bq.a - A.a) * k; } return ops[ops.length - 1].a; };
				gd.colorStops.forEach(function (c) { var p = clamp((c.location || 0) / 4096, 0, 1); stops.push({ p: p, c: colorFromPsd(c.color), a: aAt(p) }); }); stops.sort(function (a, b) { return a.p - b.p; }); }
			var GT = { linear: "linear", radial: "radial", angle: "angle", reflected: "reflected", diamond: "diamond" };
			Object.assign(fx.grad, { on: true, op: opac(gr.opacity, 1), mode: modeFromPsd(gr.blendMode, notes, "Gradient overlay"), type: GT[gr.type] || "linear", angle: gr.angle == null ? 90 : gr.angle, scale: gr.scale == null ? 100 : Math.round(+gr.scale * 1000) / 10, reverse: !!gr.reverse }); if (stops.length >= 2) fx.grad.stops = stops; any = true; if (gr.align === false) notes.push("Gradient overlay: “Align with layer” off is drawn aligned"); }
		var sk = (eff.stroke || []).filter(on); if (sk.length) { var k2 = sk[0], sc2 = colorFromPsd(k2.color); if (k2.fillType === "gradient" && k2.gradient && k2.gradient.colorStops && k2.gradient.colorStops[0]) { sc2 = colorFromPsd(k2.gradient.colorStops[0].color); notes.push("Stroke: a gradient stroke is drawn in its first colour"); } else if (k2.fillType === "pattern") notes.push("Stroke: a pattern stroke is drawn in one colour");
			Object.assign(fx.outline, { on: true, w: unitsPx(k2.size, s), c: sc2, pos: k2.position || "outside", op: opac(k2.opacity, 1), mode: modeFromPsd(k2.blendMode, notes, "Stroke") }); any = true; if (sk.length > 1) notes.push("Stroke: only the first of " + sk.length + " strokes is drawn"); }
		if (on(eff.satin)) { var sa = eff.satin; Object.assign(fx.satin, { on: true, c: colorFromPsd(sa.color), op: opac(sa.opacity, 0.5), mode: modeFromPsd(sa.blendMode, notes, "Satin"), angle: sa.angle == null ? 19 : sa.angle, dist: unitsPx(sa.distance, s), size: unitsPx(sa.size, s), invert: sa.invert !== false }); any = true; if (sa.contour && sa.contour.name && !/linear|gaussian/i.test(sa.contour.name)) notes.push("Satin: contour “" + sa.contour.name + "” is drawn as Gaussian"); }
		if (on(eff.patternOverlay)) notes.push("Pattern overlay is left out (patterns are not supported yet)");
		return { fx: any ? fx : null, notes: notes };
	}
	/* our style -> ag-psd layer.effects (only what is switched on) + fillOpacity. ag-psd keeps Depth (strength) and the gradient scale as fractions (3.39 =
	   339%) and will not write a Percent unit for Spread / Choke (ag-psd 30.1.1 rejects it), so those are written as a plain number in Pixels units. */
	function fxToPsd(fx, globalAngle) {
		var o = fxNorm(fx), e = {}, U = function (v) { return { units: "Pixels", value: Math.round(v * 100) / 100 }; }, P = function (v) { return { units: "Pixels", value: Math.round(v) }; }, gA = globalAngle == null ? 120 : globalAngle, any = false;
		if (o.shadow.on) { var S = o.shadow; e.dropShadow = [{ enabled: true, present: true, showInDialog: true, color: colorToPsd(S.c), opacity: S.op, blendMode: modeToPsd(S.mode), angle: S.gl ? gA : S.angle, useGlobalLight: !!S.gl, distance: U(S.dist), size: U(S.blur), choke: P(S.spread), layerConceals: S.knock !== false, antialiased: false }]; any = true; }
		if (o.ishadow.on) { var I = o.ishadow; e.innerShadow = [{ enabled: true, present: true, showInDialog: true, color: colorToPsd(I.c), opacity: I.op, blendMode: modeToPsd(I.mode), angle: I.gl ? gA : I.angle, useGlobalLight: !!I.gl, distance: U(I.dist), size: U(I.size), choke: P(I.choke) }]; any = true; }
		if (o.oglow.on) { var G = o.oglow; e.outerGlow = { enabled: true, present: true, showInDialog: true, color: colorToPsd(G.c), opacity: G.op, blendMode: modeToPsd(G.mode), size: U(G.size), choke: P(G.spread), source: "edge", range: 50, jitter: 0, noise: 0 }; any = true; }
		if (o.iglow.on) { var J = o.iglow; e.innerGlow = { enabled: true, present: true, showInDialog: true, color: colorToPsd(J.c), opacity: J.op, blendMode: modeToPsd(J.mode), size: U(J.size), choke: P(J.choke), source: J.src === "center" ? "center" : "edge", range: 50, jitter: 0, noise: 0 }; any = true; }
		if (o.bevel.on) { var B = o.bevel, ST = { inner: "inner bevel", outer: "outer bevel", emboss: "emboss", pillow: "pillow emboss", stroke: "stroke emboss" }, TE = { smooth: "smooth", hard: "chisel hard", soft: "chisel soft" };
			e.bevel = { enabled: true, present: true, showInDialog: true, style: ST[B.style] || "inner bevel", technique: TE[B.tech] || "smooth", strength: Math.round(B.depth) / 100, direction: B.dir === "down" ? "down" : "up", size: U(B.size), soften: U(B.soften), angle: B.gl ? gA : B.angle, altitude: B.alt, useGlobalLight: !!B.gl,
				highlightBlendMode: modeToPsd(B.hiMode), highlightColor: colorToPsd(B.hiC), highlightOpacity: B.hiOp, shadowBlendMode: modeToPsd(B.shMode), shadowColor: colorToPsd(B.shC), shadowOpacity: B.shOp }; any = true; }
		if (o.satin.on) { var T = o.satin; e.satin = { enabled: true, present: true, showInDialog: true, color: colorToPsd(T.c), opacity: T.op, blendMode: modeToPsd(T.mode), angle: T.angle, distance: U(T.dist), size: U(T.size), invert: !!T.invert }; any = true; }
		if (o.color.on) { e.solidFill = [{ enabled: true, present: true, showInDialog: true, color: colorToPsd(o.color.c), opacity: o.color.op, blendMode: modeToPsd(o.color.mode) }]; any = true; }
		if (o.grad.on) { var g = o.grad; e.gradientOverlay = [{ enabled: true, present: true, showInDialog: true, opacity: g.op, blendMode: modeToPsd(g.mode), align: true, scale: g.scale / 100, reverse: !!g.reverse, type: g.type, angle: g.angle, dither: false,
			gradient: { name: "Custom", type: "solid", smoothness: 4096, colorStops: g.stops.map(function (s) { return { color: colorToPsd(s.c), location: Math.round(s.p * 4096), midpoint: 50 }; }), opacityStops: g.stops.map(function (s) { return { opacity: s.a, location: Math.round(s.p * 4096), midpoint: 50 }; }) } }]; any = true; }
		if (o.outline.on && o.outline.w > 0) { var L = o.outline; e.stroke = [{ enabled: true, present: true, showInDialog: true, size: U(L.w), position: L.pos === "center" ? "center" : L.pos === "inside" ? "inside" : "outside", fillType: "color", blendMode: modeToPsd(L.mode), opacity: L.op, color: colorToPsd(L.c) }]; any = true; }
		return { effects: any ? Object.assign({ scale: 1 }, e) : null, fillOpacity: o.fill };
	}

	var api = { FXDEF: FXDEF, FXKEYS: FXKEYS, fxNorm: fxNorm, fxAny: fxAny, fxAngle: fxAngle, fxOffset: fxOffset, fxReach: fxReach, sdField: sdField, sdCover: sdCover, blurF: blurF, shiftF: shiftF, gradAt: gradAt, gradPlane: gradPlane, bevelPlanes: bevelPlanes, alphaBox: alphaBox, fxPlanes: fxPlanes, fxFromPsd: fxFromPsd, fxToPsd: fxToPsd, colorFromPsd: colorFromPsd, modeFromPsd: modeFromPsd, modeToPsd: modeToPsd, rgbToHsv: rgbToHsv, hsvToRgb: hsvToRgb, parseColor: parseColor, lightness: lightness, edt: edt, outlineAlpha: outlineAlpha, normToolLayout: normToolLayout, moveTool: moveTool, clampCrop: clampCrop, dragCrop: dragCrop, shiftCrop: shiftCrop, projectKind: projectKind, projectBase: projectBase, projectFileName: projectFileName, isZipBytes: isZipBytes, zipEntries: zipEntries, projectPrefix: projectPrefix, pruneRecent: pruneRecent, upsertRecent: upsertRecent, agoText: agoText, diskChanged: diskChanged, layerFileNames: layerFileNames, newProjectId: newProjectId,
		unionBox: unionBox, boxesTouch: boxesTouch, rectFrom: rectFrom, snapTargets: snapTargets, snapAxis: snapAxis, snapBox: snapBox, guidesOn: guidesOn, linSolve: linSolve, scaleAbout: scaleAbout, wrapLines: wrapLines, richMask: richMask, richEdit: richEdit, richSet: richSet, richAll: richAll, richNorm: richNorm, richSegs: richSegs, fitFontSize: fitFontSize, folderProject: folderProject, caretLine: caretLine, hitInLine: hitInLine, wordAt: wordAt, describeSource: describeSource, bytesText: bytesText, panelClamp: panelClamp, panelKey: panelKey, clamp: clamp, hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb, histogram: histogram, identityLUT: identityLUT, applyLUT: applyLUT, levelsLUT: levelsLUT, curveLUT: curveLUT,
		brightnessContrast: brightnessContrast, exposure: exposure, hueSat: hueSat, vibrance: vibrance, temperature: temperature, invert: invert, grayscale: grayscale, sepia: sepia, threshold: threshold, posterize: posterize,
		gaussianBlur: gaussianBlur, boxBlur: boxBlur, unsharp: unsharp, noise: noise, pixelate: pixelate, vignette: vignette, convolve: convolve, floodMask: floodMask, growShrinkMask: growShrinkMask, featherMask: featherMask, invertMask: invertMask,
		maskBounds: maskBounds, opaqueBounds: opaqueBounds, blendByMask: blendByMask, autoLevels: autoLevels, premultiply: premultiply, unpremultiply: unpremultiply };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();
