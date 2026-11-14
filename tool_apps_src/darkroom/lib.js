/* MES Darkroom: pure helpers (no DOM). Settings model, curves, white balance, auto tone, presets, copy / paste groups,
   export names, RAW embedded-preview finder, TIFF orientation, Lightroom XMP sidecar import, catalogue filter / sort.
   Runs in node too: node tool_apps_src/darkroom-tests.js */
var MESDR = (function () {
	"use strict";
	var RAW_EXT = ["cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2", "dng", "raf", "orf", "rw2", "rwl", "pef", "srw", "3fr", "fff", "iiq", "mos", "mrw", "x3f", "erf", "kdc", "dcr", "mef", "raw"];
	var IMG_EXT = ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "tif", "tiff", "heic", "heif", "jfif"];
	function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
	function isRaw(name) { return RAW_EXT.indexOf(ext(name)) >= 0; }
	function isPhoto(name) { var e = ext(name); return RAW_EXT.indexOf(e) >= 0 || IMG_EXT.indexOf(e) >= 0; }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, d) { v = +v; return isFinite(v) ? v : d; }

	/* ---------- settings ---------- */
	var BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];
	var BAND_LABEL = ["Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple", "Magenta"];
	var LOCAL_ADJ = ["exp", "con", "hi", "sh", "cla", "dh", "temp", "tint", "sat"];
	function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
	function defaults() {
		return {
			v: 1,
			temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
			texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
			curve: { rgb: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] },
			hue: zeros(8), sat: zeros(8), lum: zeros(8), bw: false, mix: zeros(8),
			grade: { sh: [0, 0, 0], mid: [0, 0, 0], hi: [0, 0, 0], glob: [0, 0, 0], blend: 50, balance: 0 },
			sharpen: 0, sRadius: 1, sMask: 0, nr: 0, nrColor: 0,
			dist: 0, lensVig: 0, ca: 0, keyV: 0, keyH: 0,
			rot90: 0, flipH: false, flipV: false, angle: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: "free",
			vig: 0, vigMid: 50, vigFeather: 50, vigRound: 0, grain: 0, grainSize: 25, grainRough: 50,
			locals: [], spots: []
		};
	}
	var NUM_RANGES = {
		temp: [-100, 100], tint: [-100, 100], exposure: [-5, 5], contrast: [-100, 100], highlights: [-100, 100], shadows: [-100, 100], whites: [-100, 100], blacks: [-100, 100],
		texture: [-100, 100], clarity: [-100, 100], dehaze: [-100, 100], vibrance: [-100, 100], saturation: [-100, 100],
		sharpen: [0, 150], sRadius: [0.5, 3], sMask: [0, 100], nr: [0, 100], nrColor: [0, 100], dist: [-100, 100], lensVig: [-100, 100], ca: [-100, 100], keyV: [-100, 100], keyH: [-100, 100],
		angle: [-45, 45], vig: [-100, 100], vigMid: [0, 100], vigFeather: [0, 100], vigRound: [-100, 100], grain: [0, 100], grainSize: [0, 100], grainRough: [0, 100]
	};
	function cleanCurve(pts) {
		if (!Array.isArray(pts)) return [[0, 0], [1, 1]];
		var a = pts.filter(function (p) { return Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1]); }).map(function (p) { return [clamp(+p[0], 0, 1), clamp(+p[1], 0, 1)]; });
		a.sort(function (p, q) { return p[0] - q[0]; });
		var out = []; a.forEach(function (p) { if (!out.length || p[0] - out[out.length - 1][0] > 1e-4) out.push(p); });
		if (out.length < 2) return [[0, 0], [1, 1]];
		return out.slice(0, 16);
	}
	function arr8(a) { var o = zeros(8); if (Array.isArray(a)) for (var i = 0; i < 8; i++) o[i] = clamp(num(a[i], 0), -100, 100); return o; }
	function cleanLocal(l) {
		if (!l || typeof l !== "object") return null;
		var t = l.type === "radial" || l.type === "brush" ? l.type : "linear";
		var o = { id: String(l.id || Math.random().toString(36).slice(2, 9)), type: t, name: String(l.name || "").slice(0, 40), on: l.on !== false, inv: !!l.inv, adj: {} };
		LOCAL_ADJ.forEach(function (k) { o.adj[k] = clamp(num(l.adj && l.adj[k], 0), k === "exp" ? -4 : -100, k === "exp" ? 4 : 100); });
		if (t === "linear") { o.x0 = num(l.x0, 0.5); o.y0 = num(l.y0, 0.15); o.x1 = num(l.x1, 0.5); o.y1 = num(l.y1, 0.55); }
		else if (t === "radial") { o.cx = num(l.cx, 0.5); o.cy = num(l.cy, 0.5); o.rx = clamp(num(l.rx, 0.25), 0.005, 3); o.ry = clamp(num(l.ry, 0.25), 0.005, 3); o.rot = num(l.rot, 0); o.feather = clamp(num(l.feather, 50), 0, 100); }
		else { o.mask = typeof l.mask === "string" ? l.mask : ""; }
		return o;
	}
	function normalize(s) {
		var d = defaults(); if (!s || typeof s !== "object") return d;
		Object.keys(NUM_RANGES).forEach(function (k) { if (k in s) d[k] = clamp(num(s[k], d[k]), NUM_RANGES[k][0], NUM_RANGES[k][1]); });
		if (s.curve) ["rgb", "r", "g", "b"].forEach(function (k) { d.curve[k] = cleanCurve(s.curve[k]); });
		d.hue = arr8(s.hue); d.sat = arr8(s.sat); d.lum = arr8(s.lum); d.mix = arr8(s.mix); d.bw = !!s.bw;
		if (s.grade) {
			["sh", "mid", "hi", "glob"].forEach(function (k) { var g = s.grade[k]; if (Array.isArray(g)) d.grade[k] = [((num(g[0], 0) % 360) + 360) % 360, clamp(num(g[1], 0), 0, 100), clamp(num(g[2], 0), -100, 100)]; });
			d.grade.blend = clamp(num(s.grade.blend, 50), 0, 100); d.grade.balance = clamp(num(s.grade.balance, 0), -100, 100);
		}
		d.rot90 = ((Math.round(num(s.rot90, 0)) % 4) + 4) % 4; d.flipH = !!s.flipH; d.flipV = !!s.flipV;
		if (s.crop) { var c = s.crop; var w = clamp(num(c.w, 1), 0.01, 1), h = clamp(num(c.h, 1), 0.01, 1); d.crop = { x: clamp(num(c.x, 0), 0, 1 - w), y: clamp(num(c.y, 0), 0, 1 - h), w: w, h: h }; }
		if (typeof s.aspect === "string") d.aspect = s.aspect.slice(0, 12);
		if (Array.isArray(s.locals)) d.locals = s.locals.map(cleanLocal).filter(Boolean).slice(0, 8);
		if (Array.isArray(s.spots)) d.spots = s.spots.filter(function (p) { return p && isFinite(+p.x) && isFinite(+p.y); }).slice(0, 32).map(function (p) { return { x: +p.x, y: +p.y, r: clamp(num(p.r, 0.02), 0.002, 0.3), sx: num(p.sx, +p.x + 0.05), sy: num(p.sy, +p.y), f: clamp(num(p.f, 50), 0, 100), heal: p.heal !== false }; });
		return d;
	}
	function clone(s) { return JSON.parse(JSON.stringify(s)); }
	function curveIsId(c) { return c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1; }
	/* which groups differ from the defaults: used for the "edited" badge and the paste dialog */
	var GROUPS = [
		{ id: "wb", label: "White balance", keys: ["temp", "tint"] },
		{ id: "tone", label: "Exposure and tone", keys: ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"] },
		{ id: "presence", label: "Texture, clarity, dehaze", keys: ["texture", "clarity", "dehaze"] },
		{ id: "color", label: "Vibrance and saturation", keys: ["vibrance", "saturation"] },
		{ id: "curve", label: "Tone curve", keys: ["curve"] },
		{ id: "hsl", label: "Colour mixer (HSL)", keys: ["hue", "sat", "lum"] },
		{ id: "bw", label: "Black & white", keys: ["bw", "mix"] },
		{ id: "grade", label: "Colour grading", keys: ["grade"] },
		{ id: "detail", label: "Sharpening and noise", keys: ["sharpen", "sRadius", "sMask", "nr", "nrColor"] },
		{ id: "lens", label: "Lens corrections", keys: ["dist", "lensVig", "ca"] },
		{ id: "transform", label: "Transform (perspective)", keys: ["keyV", "keyH"] },
		{ id: "crop", label: "Crop, straighten, rotate", keys: ["crop", "angle", "rot90", "flipH", "flipV", "aspect"] },
		{ id: "fx", label: "Vignette and grain", keys: ["vig", "vigMid", "vigFeather", "vigRound", "grain", "grainSize", "grainRough"] },
		{ id: "locals", label: "Masks", keys: ["locals"] },
		{ id: "spots", label: "Healing spots", keys: ["spots"] }
	];
	function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
	function changedGroups(s) { var d = defaults(); return GROUPS.filter(function (g) { return g.keys.some(function (k) { return !same(s[k], d[k]); }); }).map(function (g) { return g.id; }); }
	function isEdited(s) { return !!s && changedGroups(normalize(s)).length > 0; }
	function pickGroups(src, dst, ids) {
		var out = clone(dst);
		GROUPS.forEach(function (g) { if (ids.indexOf(g.id) >= 0) g.keys.forEach(function (k) { out[k] = clone(src[k]); }); });
		return normalize(out);
	}

	/* ---------- curves (monotone cubic, Fritsch-Carlson) ---------- */
	function curveFn(pts) {
		pts = cleanCurve(pts); var n = pts.length, x = pts.map(function (p) { return p[0]; }), y = pts.map(function (p) { return p[1]; });
		var d = [], m = []; for (var i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i] || 1e-9));
		m[0] = d[0]; m[n - 1] = d[n - 2]; for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
		for (i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } var a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b; if (h > 9) { var t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
		return function (v) {
			if (v <= x[0]) return y[0]; if (v >= x[n - 1]) return y[n - 1];
			var k = 0; while (k < n - 2 && v > x[k + 1]) k++;
			var hh = x[k + 1] - x[k], t = (v - x[k]) / hh, t2 = t * t, t3 = t2 * t;
			return clamp((2 * t3 - 3 * t2 + 1) * y[k] + (t3 - 2 * t2 + t) * hh * m[k] + (-2 * t3 + 3 * t2) * y[k + 1] + (t3 - t2) * hh * m[k + 1], 0, 1);
		};
	}
	/* 256-entry RGBA table: each channel = its own curve applied after the master curve */
	function curveLUT(curve, n) {
		n = n || 256; var M = curveFn(curve.rgb), R = curveFn(curve.r), G = curveFn(curve.g), B = curveFn(curve.b), out = new Uint8Array(n * 4);
		for (var i = 0; i < n; i++) { var v = M(i / (n - 1)); out[i * 4] = Math.round(R(v) * 255); out[i * 4 + 1] = Math.round(G(v) * 255); out[i * 4 + 2] = Math.round(B(v) * 255); out[i * 4 + 3] = 255; }
		return out;
	}

	/* ---------- white balance ---------- */
	/* temp / tint (-100..100) -> RGB multipliers that keep brightness the same (luminance weights Rec.709) */
	function wbMul(temp, tint) {
		var t = temp / 100, g = tint / 100, r = Math.pow(2, 0.55 * t + 0.12 * g), gg = Math.pow(2, -0.42 * g), b = Math.pow(2, -0.55 * t + 0.12 * g);
		var y = 0.2126 * r + 0.7152 * gg + 0.0722 * b; return [r / y, gg / y, b / y];
	}
	/* a picked linear colour (before any white balance) -> temp / tint that make it grey */
	function wbFromPick(rgb) {
		var r = Math.max(rgb[0], 1e-5), g = Math.max(rgb[1], 1e-5), b = Math.max(rgb[2], 1e-5);
		var best = null, bt = 0, bg = 0;
		for (var pass = 0; pass < 3; pass++) {
			var step = [10, 2, 0.4][pass], c0t = pass ? bt : 0, c0g = pass ? bg : 0, span = [100, 12, 2.5][pass];
			for (var t = c0t - span; t <= c0t + span + 1e-9; t += step) for (var u = c0g - span; u <= c0g + span + 1e-9; u += step) {
				var m = wbMul(clamp(t, -100, 100), clamp(u, -100, 100)), R = r * m[0], G = g * m[1], B = b * m[2], mx = (R + G + B) / 3;
				var e = Math.pow(Math.log(R / mx), 2) + Math.pow(Math.log(G / mx), 2) + Math.pow(Math.log(B / mx), 2);
				if (best === null || e < best) { best = e; bt = clamp(t, -100, 100); bg = clamp(u, -100, 100); }
			}
		}
		return { temp: Math.round(bt), tint: Math.round(bg) };
	}
	var WB_PRESETS = [
		{ id: "asshot", label: "As shot", temp: 0, tint: 0 }, { id: "daylight", label: "Daylight", temp: 8, tint: 2 }, { id: "cloudy", label: "Cloudy", temp: 22, tint: 4 },
		{ id: "shade", label: "Shade", temp: 34, tint: 6 }, { id: "tungsten", label: "Tungsten", temp: -55, tint: 0 }, { id: "fluorescent", label: "Fluorescent", temp: -30, tint: 22 },
		{ id: "flash", label: "Flash", temp: 14, tint: 2 }
	];

	/* ---------- histogram + auto ---------- */
	function histogram(px) {
		var r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256), n = 0, lo = 0, hi = 0;
		for (var i = 0; i < px.length; i += 4) { if (px[i + 3] < 8) continue; var R = px[i], G = px[i + 1], B = px[i + 2]; r[R]++; g[G]++; b[B]++; l[Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B)]++; n++; if (R >= 254 || G >= 254 || B >= 254) hi++; if (R <= 1 && G <= 1 && B <= 1) lo++; }
		return { r: r, g: g, b: b, l: l, n: n, clipHi: n ? hi / n : 0, clipLo: n ? lo / n : 0 };
	}
	function percentile(h, p) { var tot = 0, i; for (i = 0; i < 256; i++) tot += h[i]; var t = tot * p, acc = 0; for (i = 0; i < 256; i++) { acc += h[i]; if (acc >= t) return i / 255; } return 1; }
	function s2l(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
	/* hist = histogram of the picture rendered with neutral tone (white balance kept). Returns tone settings like Lightroom's Auto. */
	function autoTone(hist) {
		var L = hist.l, med = percentile(L, 0.5), p01 = percentile(L, 0.005), p99 = percentile(L, 0.995), p90 = percentile(L, 0.9), p10 = percentile(L, 0.1);
		var exposure = clamp(Math.log2(s2l(0.46) / Math.max(s2l(med), 1e-4)), -3, 3);
		exposure = Math.round(exposure * 0.75 * 100) / 100;
		var spread = p90 - p10, contrast = Math.round(clamp((0.55 - spread) * 90, -30, 40));
		var highlights = Math.round(clamp(-(p99 - 0.9) * 400 - (hist.clipHi > 0.004 ? 25 : 0), -80, 10));
		var shadows = Math.round(clamp((0.12 - p10) * 250, -20, 60));
		var whites = Math.round(clamp((0.97 - p99) * 120, -40, 40)), blacks = Math.round(clamp((p01 - 0.02) * -250, -40, 30));
		return { exposure: exposure, contrast: contrast, highlights: highlights, shadows: shadows, whites: whites, blacks: blacks };
	}
	function autoWB(hist) {
		/* grey world on the mid tones: mean of each channel in linear */
		function mean(h) { var s = 0, n = 0; for (var i = 8; i < 248; i++) { s += s2l(i / 255) * h[i]; n += h[i]; } return n ? s / n : 0.2; }
		return wbFromPick([mean(hist.r), mean(hist.g), mean(hist.b)]);
	}

	/* ---------- crop ---------- */
	var ASPECTS = [["free", "Free"], ["orig", "Original"], ["1:1", "1 : 1"], ["4:5", "4 : 5 / 8 x 10"], ["5:7", "5 x 7"], ["2:3", "2 : 3 / 4 x 6"], ["3:4", "3 : 4"], ["16:9", "16 : 9"], ["9:16", "9 : 16"], ["1.91:1", "1.91 : 1 (link card)"], ["3:1", "3 : 1 (banner)"]];
	function aspectValue(id, imgAspect) { if (id === "free") return 0; if (id === "orig") return imgAspect; var m = /^([\d.]+):([\d.]+)$/.exec(id); return m ? +m[1] / +m[2] : 0; }
	/* oriented size: after the 90 degree turns */
	function orientedSize(w, h, rot90) { return rot90 % 2 ? [h, w] : [w, h]; }
	/* the biggest centred rectangle of aspect a (w / h, pixels) that stays inside a W x H picture turned by angle degrees */
	function maxInscribed(W, H, angle, a) {
		var t = Math.abs(angle) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
		/* rectangle w x h (w = a h) rotated by t must fit: w c + h s <= W and w s + h c <= H */
		var h = Math.min(W / (a * c + s), H / (a * s + c)); return [a * h, h];
	}
	/* fit crop rect (normalised in the oriented picture) to an aspect, keeping its centre */
	function fitCropAspect(crop, W, H, a) {
		if (!a) return crop; var cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2, pw = crop.w * W, ph = crop.h * H;
		if (pw / ph > a) pw = ph * a; else ph = pw / a;
		var w = pw / W, h = ph / H; if (w > 1) { h /= w; w = 1; } if (h > 1) { w /= h; h = 1; }
		return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w: w, h: h };
	}

	/* ---------- presets ---------- */
	function P(id, name, group, s) { return { id: id, name: name, group: group, s: s }; }
	var C = function (a) { return a; };
	var PRESETS = [
		P("auto", "Auto", "Basic", null),
		P("pop", "Pop", "Colour", { contrast: 18, clarity: 18, vibrance: 28, saturation: 6, texture: 10 }),
		P("vivid", "Vivid", "Colour", { contrast: 25, vibrance: 40, saturation: 15, clarity: 10, blacks: -10 }),
		P("warm", "Warm", "Colour", { temp: 18, tint: 3, vibrance: 10 }),
		P("cool", "Cool", "Colour", { temp: -18, tint: -2, vibrance: 6 }),
		P("matte", "Matte", "Film", { contrast: -15, curve: { rgb: [[0, 0.09], [0.25, 0.27], [0.75, 0.76], [1, 0.95]] }, saturation: -12, grain: 12 }),
		P("faded", "Faded film", "Film", { contrast: -22, highlights: -20, curve: { rgb: [[0, 0.12], [0.5, 0.52], [1, 0.92]] }, saturation: -20, temp: 8, grade: { sh: [200, 12, 0], hi: [45, 14, 0] }, grain: 20 }),
		P("portra", "Soft portrait film", "Film", { temp: 7, tint: 4, contrast: -6, highlights: -25, shadows: 18, vibrance: -6, hue: [3, 4, 0, -10, 0, 0, 0, 0], sat: [-6, -10, -10, -18, -10, -8, 0, 0], grade: { sh: [215, 8, 0], hi: [40, 10, 0] }, grain: 14 }),
		P("cine", "Teal & orange", "Cinematic", { contrast: 14, highlights: -18, shadows: 10, grade: { sh: [192, 32, -4], mid: [0, 0, 0], hi: [35, 24, 2], blend: 60, balance: 10 }, sat: [0, 10, -10, -30, 10, 10, -10, -10], vibrance: 8 }),
		P("moody", "Moody", "Cinematic", { exposure: -0.3, contrast: 20, highlights: -40, shadows: -10, clarity: 12, dehaze: 8, saturation: -18, vig: -25, grade: { sh: [210, 18, -6], hi: [40, 8, 0] } }),
		P("landscape", "Landscape", "Scene", { contrast: 15, highlights: -45, shadows: 30, clarity: 22, dehaze: 12, vibrance: 30, texture: 15, sat: [0, 0, 6, 12, 10, 14, 0, 0], lum: [0, 0, 0, -6, 0, -10, 0, 0] }),
		P("portrait", "Portrait smooth", "Scene", { texture: -25, clarity: -10, highlights: -15, shadows: 12, vibrance: 10, lum: [0, 10, 4, 0, 0, 0, 0, 0], sat: [0, -8, 0, 0, 0, 0, 0, 0] }),
		P("food", "Food", "Scene", { temp: 8, exposure: 0.15, contrast: 12, shadows: 15, texture: 18, vibrance: 22, sat: [8, 10, 6, 6, 0, 0, 0, 0] }),
		P("night", "Night city", "Scene", { temp: -10, highlights: -55, shadows: 25, blacks: -15, clarity: 15, dehaze: 15, nr: 25, vibrance: 15 }),
		P("hdr", "HDR look", "Scene", { highlights: -80, shadows: 70, whites: 15, blacks: -20, clarity: 40, texture: 25, vibrance: 25, dehaze: 10 }),
		P("bw", "Black & white", "Black & white", { bw: true, contrast: 15 }),
		P("bwhigh", "B&W high contrast", "Black & white", { bw: true, contrast: 45, clarity: 20, blacks: -20, whites: 15, mix: [10, 10, 0, -20, -20, -35, -10, 0] }),
		P("bwsoft", "B&W soft", "Black & white", { bw: true, contrast: -15, highlights: -20, shadows: 20, grain: 18, mix: [20, 25, 10, 0, 0, -10, 0, 10] }),
		P("sepia", "Sepia", "Black & white", { bw: true, contrast: 8, grade: { glob: [38, 30, 0] }, grain: 10 }),
		P("selenium", "Split tone", "Black & white", { bw: true, contrast: 18, grade: { sh: [220, 22, 0], hi: [42, 20, 0], balance: -10 } }),
		P("vintage", "Vintage", "Film", { temp: 15, contrast: -10, curve: { rgb: [[0, 0.07], [1, 0.94]], b: [[0, 0.1], [1, 0.88]] }, saturation: -25, vig: -30, grain: 25 }),
		P("sharp", "Crisp detail", "Detail", { sharpen: 60, sRadius: 1, sMask: 20, texture: 15 }),
		P("clean", "Clean noise", "Detail", { nr: 40, nrColor: 40, sharpen: 30, sMask: 40 })
	];
	/* blend a preset into settings: amount 0..100 (numbers move part of the way; switches apply above 50) */
	function applyPreset(s, ps, amount) {
		var k = (amount == null ? 100 : amount) / 100, out = clone(normalize(s)), d = defaults();
		function mixN(a, b) { return a + (b - a) * k; }
		Object.keys(ps || {}).forEach(function (key) {
			var v = ps[key];
			if (typeof v === "number" && typeof out[key] === "number") out[key] = mixN(out[key], v);
			else if (typeof v === "boolean") { if (k >= 0.5) out[key] = v; }
			else if (Array.isArray(v) && Array.isArray(out[key]) && typeof out[key][0] === "number") out[key] = out[key].map(function (x, i) { return mixN(x, num(v[i], d[key][i])); });
			else if (key === "curve") ["rgb", "r", "g", "b"].forEach(function (c) { if (v[c]) out.curve[c] = k >= 0.999 ? clone(v[c]) : cleanCurve(v[c].map(function (p) { var f = curveFn(out.curve[c]); return [p[0], f(p[0]) + (p[1] - f(p[0])) * k]; })); });
			else if (key === "grade") ["sh", "mid", "hi", "glob"].forEach(function (c) { if (v[c]) out.grade[c] = [v[c][0], mixN(out.grade[c][1], v[c][1]), mixN(out.grade[c][2], v[c][2])]; else if (typeof v.blend === "number") out.grade.blend = v.blend; });
		});
		if (ps && ps.grade) { if (typeof ps.grade.blend === "number") out.grade.blend = ps.grade.blend; if (typeof ps.grade.balance === "number") out.grade.balance = mixN(out.grade.balance, ps.grade.balance); }
		return normalize(out);
	}
	/* a user preset = the groups chosen from current settings */
	function makePreset(name, s, groups) { var p = {}; GROUPS.forEach(function (g) { if (groups.indexOf(g.id) >= 0) g.keys.forEach(function (k) { p[k] = clone(s[k]); }); }); return { id: "u" + Date.now().toString(36), name: String(name || "My preset").slice(0, 40), group: "My presets", s: p, user: true }; }

	/* ---------- history labels ---------- */
	var LABELS = { temp: "Temp", tint: "Tint", exposure: "Exposure", contrast: "Contrast", highlights: "Highlights", shadows: "Shadows", whites: "Whites", blacks: "Blacks", texture: "Texture", clarity: "Clarity", dehaze: "Dehaze", vibrance: "Vibrance", saturation: "Saturation", sharpen: "Sharpening", sRadius: "Sharpen radius", sMask: "Sharpen masking", nr: "Noise reduction", nrColor: "Colour noise", dist: "Distortion", lensVig: "Lens vignetting", ca: "Chromatic aberration", keyV: "Vertical", keyH: "Horizontal", angle: "Straighten", vig: "Vignette", vigMid: "Vignette midpoint", vigFeather: "Vignette feather", vigRound: "Vignette roundness", grain: "Grain", grainSize: "Grain size", grainRough: "Grain roughness" };
	function fmtVal(k, v) { if (k === "exposure") return (v > 0 ? "+" : "") + v.toFixed(2); if (k === "sRadius") return v.toFixed(1); if (k === "angle") return v.toFixed(1) + "°"; v = Math.round(v); return (v > 0 && NUM_RANGES[k] && NUM_RANGES[k][0] < 0 ? "+" : "") + v; }

	/* ---------- export ---------- */
	function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
	function exportName(pattern, o) {
		var base = String(o.name || "photo").replace(/\.[^.]+$/, ""), d = o.date instanceof Date && !isNaN(o.date) ? o.date : new Date();
		var s = String(pattern || "{name}").replace(/\{(\w+)\}/g, function (m, k) {
			if (k === "name") return base; if (k === "n") return String(o.n || 1); if (k === "n2") return pad(o.n || 1, 2); if (k === "n3") return pad(o.n || 1, 3); if (k === "n4") return pad(o.n || 1, 4);
			if (k === "date") return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2); if (k === "year") return String(d.getFullYear()); if (k === "month") return pad(d.getMonth() + 1, 2); if (k === "day") return pad(d.getDate(), 2);
			if (k === "rating") return String(o.rating || 0); if (k === "w") return String(o.w || ""); if (k === "h") return String(o.h || ""); if (k === "folder") return String(o.folder || "").split("/").pop() || "photos";
			return m;
		});
		s = s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").replace(/^\.+/, "").trim() || base;
		return s.slice(0, 180) + "." + (o.ext || "jpg");
	}
	function exportSize(w, h, mode, val, enlarge) {
		var k = 1; val = +val || 0;
		if (mode === "long" && val) k = val / Math.max(w, h); else if (mode === "short" && val) k = val / Math.min(w, h);
		else if (mode === "width" && val) k = val / w; else if (mode === "height" && val) k = val / h; else if (mode === "mp" && val) k = Math.sqrt(val * 1e6 / (w * h)); else if (mode === "percent" && val) k = val / 100;
		if (!enlarge && k > 1) k = 1; return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
	}

	/* ---------- RAW: embedded JPEG previews ---------- */
	/* every complete baseline / progressive JPEG stream in the bytes: [{off, len, w, h}] */
	function jpegSize(u, off) {
		var i = off + 2, n = u.length;
		while (i + 9 < n) {
			if (u[i] !== 0xff) return null; var m = u[i + 1]; if (m === 0xff) { i++; continue; }
			var L = (u[i + 2] << 8) | u[i + 3];
			if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { h: (u[i + 5] << 8) | u[i + 6], w: (u[i + 7] << 8) | u[i + 8], sof: m };
			if (m === 0xda || L < 2) return null; i += 2 + L;
		}
		return null;
	}
	function jpegEnd(u, off) {
		var i = off + 2, n = u.length;
		while (i + 1 < n) {
			if (u[i] !== 0xff) return -1; var m = u[i + 1];
			if (m === 0xff) { i++; continue; } if (m === 0xd9) return i + 2; if (m >= 0xd0 && m <= 0xd7) { i += 2; continue; }
			if (i + 3 >= n) return -1; var L = (u[i + 2] << 8) | u[i + 3]; if (L < 2) return -1; i += 2 + L;
			if (m === 0xda) { /* entropy data until a marker that is not a stuffing / restart */
				while (i + 1 < n) { if (u[i] === 0xff) { var x = u[i + 1]; if (x === 0 || (x >= 0xd0 && x <= 0xd7) || x === 0xff) { i += x === 0xff ? 1 : 2; continue; } break; } i++; }
			}
		}
		return -1;
	}
	function findJpegs(u, limit) {
		var out = [], n = u.length, i = 0; limit = limit || 12;
		while (i < n - 4 && out.length < limit) {
			if (u[i] === 0xff && u[i + 1] === 0xd8 && u[i + 2] === 0xff) {
				var sz = jpegSize(u, i);
				if (sz && sz.sof !== 0xc3 && sz.w > 0 && sz.h > 0) { var e = jpegEnd(u, i); if (e > i) { out.push({ off: i, len: e - i, w: sz.w, h: sz.h }); i = e; continue; } }
			}
			i++;
		}
		return out;
	}
	function bestPreview(list, minSide) { var b = null; (list || []).forEach(function (j) { if (minSide && Math.min(j.w, j.h) < minSide) return; if (!b || j.w * j.h > b.w * b.h) b = j; }); return b; }
	/* TIFF-based RAW files: orientation (1-8) from IFD0, 0 if unknown */
	function tiffOrientation(u) {
		if (u.length < 16) return 0; var le = u[0] === 0x49 && u[1] === 0x49, be = u[0] === 0x4d && u[1] === 0x4d; if (!le && !be) return 0;
		function r16(o) { return le ? u[o] | (u[o + 1] << 8) : (u[o] << 8) | u[o + 1]; }
		function r32(o) { return le ? (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0 : ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0; }
		var ifd = r32(4); if (ifd + 2 > u.length) return 0; var cnt = r16(ifd); if (cnt > 400) return 0;
		for (var i = 0; i < cnt; i++) { var e = ifd + 2 + i * 12; if (e + 12 > u.length) break; if (r16(e) === 0x0112) { var v = r16(e + 8); return v >= 1 && v <= 8 ? v : 0; } }
		return 0;
	}

	/* ---------- Lightroom / Camera Raw XMP sidecars (crs:) ---------- */
	function xmpVal(x, name) {
		var re = new RegExp("crs:" + name + "\\s*=\\s*\"([^\"]*)\""), m = re.exec(x); if (m) return m[1];
		re = new RegExp("<crs:" + name + ">([^<]*)</crs:" + name + ">"); m = re.exec(x); return m ? m[1] : null;
	}
	function xmpNum(x, name) { var v = xmpVal(x, name); return v == null || v === "" ? null : +String(v).replace(/^\+/, ""); }
	function xmpSeq(x, name) { var re = new RegExp("<crs:" + name + ">\\s*<rdf:Seq>([\\s\\S]*?)</rdf:Seq>"), m = re.exec(x); if (!m) return null; var out = [], r = /<rdf:li>([^<]*)<\/rdf:li>/g, k; while ((k = r.exec(m[1]))) out.push(k[1]); return out; }
	var XMP_BAND = ["Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple", "Magenta"];
	/* returns {settings, rating, label, notes[]} or null if no Camera Raw settings */
	function parseXmp(x) {
		x = String(x || ""); if (!/crs:|xmp:Rating|xmp:Label/.test(x)) return null;
		var s = defaults(), notes = [], had = false;
		function set(key, name, f) { var v = xmpNum(x, name); if (v != null && isFinite(v)) { s[key] = f ? f(v) : v; had = true; } }
		set("exposure", "Exposure2012"); if (xmpVal(x, "Exposure2012") == null) set("exposure", "Exposure");
		set("contrast", "Contrast2012"); set("highlights", "Highlights2012"); set("shadows", "Shadows2012"); set("whites", "Whites2012"); set("blacks", "Blacks2012");
		set("texture", "Texture"); set("clarity", "Clarity2012"); if (xmpVal(x, "Clarity2012") == null) set("clarity", "Clarity"); set("dehaze", "Dehaze"); set("vibrance", "Vibrance"); set("saturation", "Saturation");
		var it = xmpNum(x, "IncrementalTemperature"), itt = xmpNum(x, "IncrementalTint"), K = xmpNum(x, "Temperature"), Ti = xmpNum(x, "Tint");
		if (it != null) { s.temp = clamp(it, -100, 100); had = true; } else if (K != null) { s.temp = clamp(Math.round((1e6 / 5500 - 1e6 / K) / 1.6), -100, 100); had = true; notes.push("White balance was given in kelvin; it is converted from 5500 K, so check it."); }
		if (itt != null) s.tint = clamp(itt, -100, 100); else if (Ti != null) s.tint = clamp(Ti * 0.7, -100, 100);
		XMP_BAND.forEach(function (b, i) { var h = xmpNum(x, "HueAdjustment" + b), sa = xmpNum(x, "SaturationAdjustment" + b), l = xmpNum(x, "LuminanceAdjustment" + b), g = xmpNum(x, "GrayMixer" + b); if (h != null) { s.hue[i] = h; had = true; } if (sa != null) s.sat[i] = sa; if (l != null) s.lum[i] = l; if (g != null) s.mix[i] = g; });
		if (/crs:ConvertToGrayscale\s*=\s*"True"|<crs:ConvertToGrayscale>True/.test(x)) { s.bw = true; had = true; }
		function curve(name, key) { var seq = xmpSeq(x, name); if (seq && seq.length >= 2) { s.curve[key] = cleanCurve(seq.map(function (p) { var a = p.split(","); return [+a[0] / 255, +a[1] / 255]; })); had = true; } }
		curve("ToneCurvePV2012", "rgb"); curve("ToneCurvePV2012Red", "r"); curve("ToneCurvePV2012Green", "g"); curve("ToneCurvePV2012Blue", "b");
		function grade(k, pre) { var h = xmpNum(x, "ColorGrade" + pre + "Hue"), sa = xmpNum(x, "ColorGrade" + pre + "Sat"), l = xmpNum(x, "ColorGrade" + pre + "Lum"); if (h != null || sa != null || l != null) { s.grade[k] = [h || 0, sa || 0, l || 0]; had = true; } }
		grade("sh", "Shadow"); grade("mid", "Midtone"); grade("hi", "Highlight"); grade("glob", "Global");
		var bl = xmpNum(x, "ColorGradeBlending"); if (bl != null) s.grade.blend = bl;
		if (xmpVal(x, "ColorGradeShadowHue") == null) { var sh = xmpNum(x, "SplitToningShadowHue"), ss = xmpNum(x, "SplitToningShadowSaturation"), hh = xmpNum(x, "SplitToningHighlightHue"), hs = xmpNum(x, "SplitToningHighlightSaturation"); if (ss) { s.grade.sh = [sh || 0, ss, 0]; had = true; } if (hs) { s.grade.hi = [hh || 0, hs, 0]; had = true; } var bal = xmpNum(x, "SplitToningBalance"); if (bal != null) s.grade.balance = bal; }
		set("sharpen", "Sharpness"); set("sRadius", "SharpenRadius"); set("sMask", "SharpenEdgeMasking"); set("nr", "LuminanceSmoothing"); set("nrColor", "ColorNoiseReduction");
		set("vig", "PostCropVignetteAmount"); set("vigMid", "PostCropVignetteMidpoint"); set("vigFeather", "PostCropVignetteFeather"); set("vigRound", "PostCropVignetteRoundness");
		set("grain", "GrainAmount"); set("grainSize", "GrainSize"); set("grainRough", "GrainFrequency");
		set("dist", "LensManualDistortionAmount", function (v) { return -v; }); set("lensVig", "VignetteAmount"); set("keyV", "PerspectiveVertical"); set("keyH", "PerspectiveHorizontal");
		if (/crs:HasCrop\s*=\s*"True"|<crs:HasCrop>True/.test(x)) {
			var t = xmpNum(x, "CropTop"), l2 = xmpNum(x, "CropLeft"), b2 = xmpNum(x, "CropBottom"), r2 = xmpNum(x, "CropRight"), a = xmpNum(x, "CropAngle");
			if (t != null && l2 != null && b2 != null && r2 != null) { s.crop = { x: l2, y: t, w: r2 - l2, h: b2 - t }; had = true; } if (a) s.angle = a;
			if (a) notes.push("The crop is turned; Lightroom measures turned crops a little differently, so check the edges.");
		}
		var rating = null, m = /xmp:Rating\s*=\s*"(-?\d)"|<xmp:Rating>(-?\d)</.exec(x); if (m) rating = +(m[1] || m[2]);
		var label = null; m = /xmp:Label\s*=\s*"([^"]*)"|<xmp:Label>([^<]*)</.exec(x); if (m) label = (m[1] || m[2] || "").toLowerCase();
		var kw = []; m = /<dc:subject>\s*<rdf:Bag>([\s\S]*?)<\/rdf:Bag>/.exec(x); if (m) { var r = /<rdf:li>([^<]*)<\/rdf:li>/g, k2; while ((k2 = r.exec(m[1]))) kw.push(k2[1].trim()); }
		if (/crs:MaskGroupBasedCorrections|<crs:MaskGroupBasedCorrections|crs:PaintBasedCorrections|crs:GradientBasedCorrections|crs:CircularGradientBasedCorrections/.test(x)) notes.push("Lightroom masks were not brought over (they work differently): redo them with Masks.");
		if (/crs:RetouchInfo|<crs:RetouchAreas/.test(x)) notes.push("Healing spots were not brought over.");
		if (/crs:LookName|crs:Look\b|<crs:Look>/.test(x)) notes.push("The Lightroom profile (Adobe Color, Vivid...) is not available; the picture may look a little different.");
		var labelMap = { red: 1, yellow: 2, green: 3, blue: 4, purple: 5 };
		return { settings: had ? normalize(s) : null, rating: rating, label: label && labelMap[label] ? labelMap[label] : 0, keywords: kw, notes: notes };
	}

	/* ---------- catalogue ---------- */
	var LABELS_C = [null, { id: 1, name: "Red", c: "#e5484d" }, { id: 2, name: "Yellow", c: "#f5c518" }, { id: 3, name: "Green", c: "#30a46c" }, { id: 4, name: "Blue", c: "#3e8ef7" }, { id: 5, name: "Purple", c: "#9b5de5" }];
	/* f = {q, minRating, ratingOp (">=", "=", "<="), flag ("any","picked","rejected","unflagged","notrej"), label (0 any, -1 none, 1..5), edited ("any","yes","no"), kind ("any","raw","jpeg"), folder, coll (array of keys or null)} */
	function filterPhotos(list, f, recOf) {
		f = f || {}; var q = String(f.q || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
		return list.filter(function (p) {
			var r = recOf(p) || {};
			if (f.folder && (p.dir || "") !== f.folder && (p.dir || "").indexOf(f.folder + "/") !== 0) return false;
			if (f.coll && f.coll.indexOf(p.key) < 0) return false;
			var rt = r.rating || 0, mr = f.minRating || 0;
			if (mr) { if ((f.ratingOp || ">=") === ">=" && rt < mr) return false; if (f.ratingOp === "=" && rt !== mr) return false; if (f.ratingOp === "<=" && rt > mr) return false; }
			var fl = r.flag || 0; if (f.flag === "picked" && fl !== 1) return false; if (f.flag === "rejected" && fl !== -1) return false; if (f.flag === "unflagged" && fl !== 0) return false; if (f.flag === "notrej" && fl === -1) return false;
			if (f.label > 0 && (r.label || 0) !== f.label) return false; if (f.label === -1 && r.label) return false;
			if (f.edited === "yes" && !isEdited(r.s)) return false; if (f.edited === "no" && isEdited(r.s)) return false;
			if (f.kind === "raw" && !p.raw) return false; if (f.kind === "jpeg" && p.raw) return false;
			if (q.length) { var hay = (p.name + " " + (p.dir || "") + " " + (r.kw || []).join(" ") + " " + (r.title || "")).toLowerCase(); if (!q.every(function (w) { return hay.indexOf(w) >= 0; })) return false; }
			return true;
		});
	}
	function natCmp(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }); }
	function sortPhotos(list, by, dir, recOf) {
		var k = dir === "desc" ? -1 : 1, a = list.slice();
		a.sort(function (p, q) {
			var r;
			if (by === "name") r = natCmp(p.name, q.name);
			else if (by === "rating") r = ((recOf(p) || {}).rating || 0) - ((recOf(q) || {}).rating || 0);
			else if (by === "edited") r = ((recOf(p) || {}).t || 0) - ((recOf(q) || {}).t || 0);
			else if (by === "size") r = (p.size || 0) - (q.size || 0);
			else if (by === "kind") r = (p.raw ? 0 : 1) - (q.raw ? 0 : 1);
			else r = (p.date || p.mtime || 0) - (q.date || q.mtime || 0);
			return r * k || natCmp(p.name, q.name);
		});
		return a;
	}
	/* half-float table for 16-bit linear data: u16 -> half bits of u16 / 65535 */
	function halfTable() {
		var t = new Uint16Array(65536), f = new Float32Array(1), i32 = new Uint32Array(f.buffer);
		for (var v = 0; v < 65536; v++) {
			f[0] = v / 65535; var x = i32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
			if (e <= 0) t[v] = e < -10 ? s : s | ((m | 0x800000) >> (1 - e + 13)); else if (e >= 31) t[v] = s | 0x7c00; else t[v] = s | (e << 10) | (m >> 13);
		}
		return t;
	}

	/* ---------- smart masks ---------- */
	/* box mean of a float plane (radius r) via a summed-area table */
	function boxMean(src, w, h, r) {
		var I = new Float64Array((w + 1) * (h + 1)), out = new Float32Array(w * h), x, y;
		for (y = 0; y < h; y++) { var row = 0; for (x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
		for (y = 0; y < h; y++) { var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1); for (x = 0; x < w; x++) { var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } }
		return out;
	}
	/* edge-aware smoothing of a mask p, guided by the luminance g (He et al. guided filter) */
	function guidedFilter(g, p, w, h, r, eps) {
		var n = w * h, gp = new Float32Array(n), gg = new Float32Array(n), i;
		for (i = 0; i < n; i++) { gp[i] = g[i] * p[i]; gg[i] = g[i] * g[i]; }
		var mg = boxMean(g, w, h, r), mp = boxMean(p, w, h, r), mgp = boxMean(gp, w, h, r), mgg = boxMean(gg, w, h, r), a = new Float32Array(n), b = new Float32Array(n);
		for (i = 0; i < n; i++) { var cov = mgp[i] - mg[i] * mp[i], vr = mgg[i] - mg[i] * mg[i]; a[i] = cov / (vr + eps); b[i] = mp[i] - a[i] * mg[i]; }
		var ma = boxMean(a, w, h, r), mb = boxMean(b, w, h, r), out = new Float32Array(n);
		for (i = 0; i < n; i++) out[i] = clamp(ma[i] * g[i] + mb[i], 0, 1);
		return out;
	}
	/* sky from the picture alone (sRGB RGBA, about 300-500 px): bright, smooth, blue / white / sunset pixels connected to the top edge.
	   Returns {a: Float32Array 0..1, cover: share of the picture} */
	function skyMask(px, w, h) {
		var n = w * h, L = new Float32Array(n), sc = new Float32Array(n), i, x, y;
		for (i = 0; i < n; i++) { var r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255; L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b; }
		/* texture = local gradient, averaged */
		var grad = new Float32Array(n);
		for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; grad[i] = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + w] - L[i - w]); }
		var V = new Float32Array(n); for (i = 0; i < n; i++) V[i] = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255;
		var tex = boxMean(grad, w, h, 2), sorted = Array.prototype.slice.call(V).sort(function (a2, b2) { return a2 - b2; }), med = sorted[Math.floor(n * 0.5)], hiL = sorted[Math.floor(n * 0.9)];
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
			i = y * w + x; var R = px[i * 4] / 255, G = px[i * 4 + 1] / 255, B = px[i * 4 + 2] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), sat = mx > 0 ? (mx - mn) / mx : 0;
			var blue = B > R && B >= G * 0.9 ? 1 : 0, neutral = sat < 0.18 ? 1 : 0, warm = R > B && sat < 0.75 && y < h * 0.6 ? 0.7 : 0;
			var col = Math.max(blue, neutral * 0.85, warm), bright = smooth01((V[i] - Math.min(med, 0.45) * 0.8) / Math.max(0.12, hiL - med * 0.8));
			var smoothT = 1 - smooth01((tex[i] - 0.03) / 0.09), pos = 1 - 0.55 * (y / h);
			sc[i] = col * (0.35 + 0.65 * bright) * (0.25 + 0.75 * smoothT) * pos * (0.25 + 0.75 * smooth01((V[i] - 0.3) / 0.3));
		}
		/* grow from the top rows over likely sky without crossing strong edges */
		var m = new Uint8Array(n), q = new Int32Array(n), qh = 0, qt = 0;
		for (x = 0; x < w; x++) for (y = 0; y < Math.max(2, Math.round(h * 0.04)); y++) { i = y * w + x; if (sc[i] > 0.42 && !m[i]) { m[i] = 1; q[qt++] = i; } }
		while (qh < qt) {
			i = q[qh++]; x = i % w; y = (i - x) / w;
			for (var k = 0; k < 4; k++) { var nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0); if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; var j = ny * w + nx; if (m[j]) continue;
				if (sc[j] > 0.3 && Math.abs(L[j] - L[i]) < 0.06 && grad[j] < 0.16) { m[j] = 1; q[qt++] = j; } }
		}
		/* fill small holes (clouds, birds) that do not touch the sides or the bottom */
		var lab = new Int32Array(n).fill(-1), comp = 0;
		for (var s0 = 0; s0 < n; s0++) {
			if (m[s0] || lab[s0] >= 0) continue; var cnt = 0, edge = false; qh = qt = 0; q[qt++] = s0; lab[s0] = comp;
			while (qh < qt) { i = q[qh++]; cnt++; x = i % w; y = (i - x) / w; if (x === 0 || x === w - 1 || y === h - 1) edge = true; for (var k2 = 0; k2 < 4; k2++) { var nx2 = x + (k2 === 0 ? 1 : k2 === 1 ? -1 : 0), ny2 = y + (k2 === 2 ? 1 : k2 === 3 ? -1 : 0); if (nx2 < 0 || ny2 < 0 || nx2 >= w || ny2 >= h) continue; var j2 = ny2 * w + nx2; if (!m[j2] && lab[j2] < 0) { lab[j2] = comp; q[qt++] = j2; } } }
			if (!edge && cnt < n * 0.04) for (var t = 0; t < qt; t++) m[q[t]] = 1;
			comp++;
		}
		var p = new Float32Array(n), cover = 0; for (i = 0; i < n; i++) { p[i] = m[i]; cover += m[i]; }
		var a = guidedFilter(L, p, w, h, Math.max(2, Math.round(Math.max(w, h) / 120)), 1e-3);
		return { a: a, cover: cover / n };
	}
	function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
	/* model output (any range) -> 0..1 with a soft edge */
	function normMask(d) { var mn = 1e9, mx = -1e9, i; for (i = 0; i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; } var rg = Math.max(1e-6, mx - mn), out = new Float32Array(d.length); for (i = 0; i < d.length; i++) out[i] = smooth01(((d[i] - mn) / rg - 0.1) / 0.8); return out; }

	return {
		RAW_EXT: RAW_EXT, IMG_EXT: IMG_EXT, ext: ext, isRaw: isRaw, isPhoto: isPhoto, clamp: clamp,
		BANDS: BANDS, BAND_LABEL: BAND_LABEL, LOCAL_ADJ: LOCAL_ADJ, defaults: defaults, normalize: normalize, clone: clone, NUM_RANGES: NUM_RANGES, cleanLocal: cleanLocal,
		GROUPS: GROUPS, changedGroups: changedGroups, isEdited: isEdited, pickGroups: pickGroups, curveIsId: curveIsId,
		curveFn: curveFn, curveLUT: curveLUT, wbMul: wbMul, wbFromPick: wbFromPick, WB_PRESETS: WB_PRESETS,
		histogram: histogram, percentile: percentile, autoTone: autoTone, autoWB: autoWB,
		ASPECTS: ASPECTS, aspectValue: aspectValue, orientedSize: orientedSize, maxInscribed: maxInscribed, fitCropAspect: fitCropAspect,
		PRESETS: PRESETS, applyPreset: applyPreset, makePreset: makePreset, LABELS: LABELS, fmtVal: fmtVal,
		exportName: exportName, exportSize: exportSize,
		findJpegs: findJpegs, jpegSize: jpegSize, bestPreview: bestPreview, tiffOrientation: tiffOrientation,
		boxMean: boxMean, guidedFilter: guidedFilter, skyMask: skyMask, normMask: normMask,
		parseXmp: parseXmp, LABELS_C: LABELS_C, filterPhotos: filterPhotos, sortPhotos: sortPhotos, natCmp: natCmp, halfTable: halfTable
	};
})();
if (typeof module !== "undefined" && module.exports) module.exports = MESDR;
