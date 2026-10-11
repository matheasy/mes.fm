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
