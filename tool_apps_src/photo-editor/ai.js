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
			PE.bake(L); var src = mk(L.canvas.width, L.canvas.height); PE.drawLayer(src.getContext("2d"), Object.assign({}, L, { opacity: 1, blend: "source-over", mask: null, live: null, preview: null }), [1, 0, 0, 1, 0, 0], "ai", src.width, src.height);
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
