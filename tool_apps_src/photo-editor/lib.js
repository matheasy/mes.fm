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
	/* word wrap that remembers where each line came from in the string: [{text, start, end}] (end = start + text.length; a wrapped line loses its trailing spaces) */
	function wrapLines(str, lim, measure) {
		str = String(str == null ? "" : str); var out = [], pos = 0;
		str.split("\n").forEach(function (para) {
			var base = pos; pos += para.length + 1;
			if (measure(para) <= lim) { out.push({ text: para, start: base, end: base + para.length }); return; }
			var cur = "", cs = base, tp = base;
			var push = function (s, st, trim) { var tx = trim ? s.replace(/\s+$/, "") : s; out.push({ text: tx, start: st, end: st + tx.length }); };
			para.split(/(\s+)/).forEach(function (wd) {
				var ws = tp; tp += wd.length; if (!wd) return;
				if (cur && measure((cur + wd).replace(/\s+$/, "")) > lim) { push(cur, cs, true); if (/^\s+$/.test(wd)) { cur = ""; cs = tp; } else { cur = wd; cs = ws; } }
				else { if (!cur) cs = ws; cur += wd; }
				while (measure(cur.replace(/\s+$/, "")) > lim && cur.length > 1) { var k = cur.length - 1; while (k > 1 && measure(cur.slice(0, k)) > lim) k--; push(cur.slice(0, k), cs, false); cur = cur.slice(k); cs += k; }   // one word longer than the box
			});
			push(cur, cs, true);
		});
		return out;
	}
	/* which line a string index is on, and how far into it: {line, k} */
	function caretLine(lines, idx) {
		var li = 0; for (var i = 0; i < lines.length; i++) { if (lines[i].start <= idx) li = i; else break; }
		var L = lines[li]; return { line: li, k: Math.max(0, Math.min(L.text.length, idx - L.start)) };
	}
	/* the string index closest to x (measured from the line's own left edge) */
	function hitInLine(line, x, measure) { var best = 0, bd = Infinity; for (var k = 0; k <= line.text.length; k++) { var d = Math.abs(measure(line.text.slice(0, k)) - x); if (d < bd) { bd = d; best = k; } } return line.start + best; }
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
	/* a random id for a project (kept in project.json, so autosaves of the same project from different files and sessions line up) */
	function newProjectId(rand) { rand = rand || Math.random; var s = "p"; for (var i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rand() * 36)]; return s; }

	var api = { projectKind: projectKind, projectBase: projectBase, projectFileName: projectFileName, isZipBytes: isZipBytes, zipEntries: zipEntries, projectPrefix: projectPrefix, pruneRecent: pruneRecent, upsertRecent: upsertRecent, agoText: agoText, diskChanged: diskChanged, layerFileNames: layerFileNames, newProjectId: newProjectId,
		unionBox: unionBox, boxesTouch: boxesTouch, rectFrom: rectFrom, snapTargets: snapTargets, snapAxis: snapAxis, snapBox: snapBox, guidesOn: guidesOn, linSolve: linSolve, scaleAbout: scaleAbout, wrapLines: wrapLines, caretLine: caretLine, hitInLine: hitInLine, wordAt: wordAt, describeSource: describeSource, bytesText: bytesText, panelClamp: panelClamp, panelKey: panelKey, clamp: clamp, hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb, histogram: histogram, identityLUT: identityLUT, applyLUT: applyLUT, levelsLUT: levelsLUT, curveLUT: curveLUT,
		brightnessContrast: brightnessContrast, exposure: exposure, hueSat: hueSat, vibrance: vibrance, temperature: temperature, invert: invert, grayscale: grayscale, sepia: sepia, threshold: threshold, posterize: posterize,
		gaussianBlur: gaussianBlur, boxBlur: boxBlur, unsharp: unsharp, noise: noise, pixelate: pixelate, vignette: vignette, convolve: convolve, floodMask: floodMask, growShrinkMask: growShrinkMask, featherMask: featherMask, invertMask: invertMask,
		maskBounds: maskBounds, opaqueBounds: opaqueBounds, blendByMask: blendByMask, autoLevels: autoLevels, premultiply: premultiply, unpremultiply: unpremultiply };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();
