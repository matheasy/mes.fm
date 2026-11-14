/* MES Darkroom: smart masks. Subject = IS-Net "general use" (Apache-2.0) run by transformers.js 3.7.6 in the browser (the same model and
   cache as the Photo Editor's background removal); Sky = MESDR.skyMask (no download). window.DRAI.subject(canvas, onStatus) -> Promise<{d: Float32Array, w, h}>. */
(function () {
	"use strict";
	if (typeof window === "undefined") return;
	var LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js", ID = "Ko033/isnet-general-use-onnx", T = null, cache = {};
	function loadLib() { return T ? Promise.resolve(T) : new Function("u", "return import(u)")(LIB).then(function (m) { T = m; return m; }); }
	function gpuF16() { return navigator.gpu ? navigator.gpu.requestAdapter().then(function (a) { return !!(a && a.features.has("shader-f16")); }).catch(function () { return false; }) : Promise.resolve(false); }
	function model(onProgress) {
		return Promise.all([loadLib(), gpuF16()]).then(function (r) {
			var gpu = r[1], key = gpu ? "gpu" : "cpu"; if (cache[key]) return cache[key];
			function load(o) { return Promise.all([T.AutoModel.from_pretrained(ID, o), T.AutoProcessor.from_pretrained(ID)]).then(function (a) { return { model: a[0], proc: a[1] }; }); }
			return load({ progress_callback: onProgress, dtype: gpu ? "fp16" : "q8", device: gpu ? "webgpu" : "wasm" }).catch(function (e) { if (!gpu) throw e; return load({ progress_callback: onProgress, dtype: "q8", device: "wasm" }); }).then(function (m) { return (cache[key] = m); });
		});
	}
	function subject(canvas, onStatus) {
		var seen = {};
		return model(function (p) { if (p && p.status === "progress" && p.total > 2e6) { seen[p.file] = [p.loaded, p.total]; var a = 0, b = 0; Object.keys(seen).forEach(function (k) { a += seen[k][0]; b += seen[k][1]; }); onStatus("Downloading the AI model (once): " + Math.round(a / 1e6) + " of " + Math.round(b / 1e6) + " MB…"); } }).then(function (m) {
			onStatus("Finding the subject…");
			return Promise.resolve(T.RawImage.fromCanvas(canvas)).then(function (img) { return m.proc(img); }).then(function (inp) {
				var s = m.model.sessions.model, feed = {}; feed[s.inputNames[0]] = inp.pixel_values;
				return m.model(feed).then(function (res) { var o = res[s.outputNames[0]], dims = o.dims; return Promise.resolve(o.data).then(function (d) { return { d: d, w: dims[dims.length - 1], h: dims[dims.length - 2] }; }); });
			});
		});
	}
	window.DRAI = { subject: subject, modelMB: function () { return navigator.gpu ? 88 : 46; } };
})();
