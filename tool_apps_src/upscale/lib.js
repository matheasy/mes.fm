/* MES Upscale: pure helpers (no DOM), node-tested by tool_apps_src/upscale-tests.js.
 * Sizes and passes, tile plans for the x4 networks (dynamic-size and fixed 256x256 inputs), tensor packing, names. */
(function (root) {
	"use strict";
	var MAX_SIDE = 16384, MAX_AREA = 80e6; // a browser canvas (and memory) limit we stay under
	var MODES = {
		photo: { name: "Photo & everyday", ai: true, model: "general", note: "Photos, screenshots, logos, scans." },
		art: { name: "Drawing, anime & cartoon", ai: true, model: "art", note: "Clean lines and flat colours: anime, cartoons, comics, illustrations." },
		pixel: { name: "Pixel art (sharp squares)", ai: false, note: "Every pixel becomes a crisp square. For game sprites and icons." },
		smooth: { name: "No AI (plain resize)", ai: false, note: "A normal smooth resize, for comparison." }
	};
	var MODELS = {
		general: { file: "realesr-general-x4v3.onnx", mb: 4.9, fixed: 0, name: "Real-ESRGAN general x4v3" },
		art: { file: "realesr-animevideov3-256.onnx", mb: 2.5, fixed: 256, name: "Real-ESRGAN anime video v3" }
	};
	function clampInt(v, a, b) { v = Math.round(+v); if (!isFinite(v)) v = a; return v < a ? a : v > b ? b : v; }
	/* wanted output size: by = "scale" (val = factor) | "width" | "height" (val = px). Keeps the aspect ratio. */
	function targetSize(w, h, by, val) {
		var f;
		if (by === "width") f = (+val || w) / w; else if (by === "height") f = (+val || h) / h; else f = +val || 2;
		if (!(f > 0)) f = 1;
		var W = Math.max(1, Math.round(w * f)), H = Math.max(1, Math.round(h * f));
		return { W: W, H: H, f: W / w, ok: W <= MAX_SIDE && H <= MAX_SIDE && W * H <= MAX_AREA, tooBig: !(W <= MAX_SIDE && H <= MAX_SIDE && W * H <= MAX_AREA) };
	}
	/* how the AI gets there. Each pass is x4. f <= 4: one pass, then resample down to the target.
	 * f > 4: first pass x4, resample to target/4, second pass x4 = the target exactly (so the big intermediate is never bigger than the result). */
	function plan(w, h, W, H) {
		var f = Math.max(W / w, H / h), steps = [];
		if (f <= 1) return { passes: 0, steps: [{ type: "resize", w: W, h: H }], f: f };
		if (f <= 4) { steps.push({ type: "ai", inW: w, inH: h }); if (W !== w * 4 || H !== h * 4) steps.push({ type: "resize", w: W, h: H }); return { passes: 1, steps: steps, f: f }; }
		var mw = Math.max(1, Math.round(W / 4)), mh = Math.max(1, Math.round(H / 4));
		steps.push({ type: "ai", inW: w, inH: h });
		steps.push({ type: "resize", w: mw, h: mh });
		steps.push({ type: "ai", inW: mw, inH: mh });
		if (mw * 4 !== W || mh * 4 !== H) steps.push({ type: "resize", w: W, h: H });
		return { passes: 2, steps: steps, f: f };
	}
	/* tiles for an x4 network. core = the part of each tile that is kept; pad = context on every side that is thrown away.
	 * fixed > 0: the network only takes fixed x fixed inputs, so every window is exactly that size (moved inside the picture at the edges,
	 * and padded by repeating the edge when the picture itself is smaller). */
	function tilePlan(w, h, opt) {
		opt = opt || {}; var fixed = opt.fixed || 0, pad = opt.pad == null ? 16 : opt.pad, core = fixed ? fixed - 2 * pad : (opt.tile || 256), out = [];
		for (var y = 0; y < h; y += core) for (var x = 0; x < w; x += core) {
			var cw = Math.min(core, w - x), ch = Math.min(core, h - y), wx, wy, ww, wh;
			if (fixed) {
				ww = fixed; wh = fixed;
				wx = w < ww ? 0 : Math.max(0, Math.min(x - pad, w - ww));
				wy = h < wh ? 0 : Math.max(0, Math.min(y - pad, h - wh));
			} else {
				wx = Math.max(0, x - pad); wy = Math.max(0, y - pad);
				ww = Math.min(w, x + cw + pad) - wx; wh = Math.min(h, y + ch + pad) - wy;
			}
			out.push({ cx: x, cy: y, cw: cw, ch: ch, wx: wx, wy: wy, ww: ww, wh: wh });
		}
		return out;
	}
	/* pixels of the source to read for a window: always inside the picture; the rest of a fixed window is filled by repeating edges. */
	function readRect(t, w, h) { var x0 = Math.max(0, t.wx), y0 = Math.max(0, t.wy); return { x: x0, y: y0, w: Math.min(w, t.wx + t.ww) - x0, h: Math.min(h, t.wy + t.wh) - y0 }; }
	/* RGBA bytes (rw x rh) -> float32 CHW 0..1 of size ww x wh, edge pixels repeated where the window is bigger than the read area */
	function toCHW(rgba, rw, rh, ww, wh) {
		var n = ww * wh, f = new Float32Array(3 * n);
		for (var y = 0; y < wh; y++) {
			var sy = y < rh ? y : rh - 1;
			for (var x = 0; x < ww; x++) {
				var sx = x < rw ? x : rw - 1, s = (sy * rw + sx) * 4, d = y * ww + x;
				f[d] = rgba[s] / 255; f[n + d] = rgba[s + 1] / 255; f[2 * n + d] = rgba[s + 2] / 255;
			}
		}
		return f;
	}
	/* float32 CHW (ww x wh) -> RGBA bytes, opaque */
	function fromCHW(d, ww, wh, outRGBA) {
		var m = ww * wh, a = outRGBA || new Uint8ClampedArray(m * 4);
		for (var k = 0; k < m; k++) { a[k * 4] = d[k] * 255; a[k * 4 + 1] = d[m + k] * 255; a[k * 4 + 2] = d[2 * m + k] * 255; a[k * 4 + 3] = 255; }
		return a;
	}
	/* number of network runs for a picture (for progress and the time estimate) */
	function countTiles(w, h, W, H, opt) {
		var p = plan(w, h, W, H), n = 0;
		p.steps.forEach(function (s) { if (s.type === "ai") n += tilePlan(s.inW, s.inH, opt).length; });
		return n;
	}
	/* rough seconds: measured on an M-series laptop (~0.3 s per 256 px tile on WebGPU, ~1.8 s per 128 px tile and ~7 s per fixed 256 px tile on the CPU) */
	function estimateSec(tiles, opt) { opt = opt || {}; var per = opt.gpu ? 0.3 : (opt.fixed ? 7 : 1.8); return Math.round(tiles * per); }
	function fmtSec(s) { if (s < 60) return Math.max(1, Math.round(s)) + " s"; var m = Math.round(s / 60); return m < 60 ? m + " min" : (m / 60).toFixed(1) + " h"; }
	function baseName(n) { n = String(n || "picture").replace(/^.*[\\/]/, ""); var i = n.lastIndexOf("."); return (i > 0 ? n.slice(0, i) : n) || "picture"; }
	function fmtFactor(f) { var r = Math.round(f * 100) / 100; return (r === Math.round(r) ? String(r) : r.toFixed(2).replace(/0$/, "")) + "x"; }
	function outName(name, f, ext, W, H, by) { return baseName(name) + "-upscaled-" + (by === "scale" ? fmtFactor(f) : W + "x" + H) + "." + ext; }
	function sameSize(a, b) { return a.w === b.w && a.h === b.h; }
	var api = { MAX_SIDE: MAX_SIDE, MAX_AREA: MAX_AREA, MODES: MODES, MODELS: MODELS, clampInt: clampInt, targetSize: targetSize, plan: plan, tilePlan: tilePlan, readRect: readRect,
		toCHW: toCHW, fromCHW: fromCHW, countTiles: countTiles, estimateSec: estimateSec, fmtSec: fmtSec, baseName: baseName, fmtFactor: fmtFactor, outName: outName, sameSize: sameSize };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESUp = api;
})(this);
