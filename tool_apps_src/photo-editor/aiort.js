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
