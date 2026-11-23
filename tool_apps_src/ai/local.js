/* MES AI "on this device" (2026-11-22): a small open model running in the visitor's browser with WebLLM (MIT, github.com/mlc-ai/web-llm)
 * on the graphics chip (WebGPU). Nothing is sent to mes.fm or to an AI company: the model files come once from huggingface.co and the
 * browser keeps them (Cache API, "webllm/*" caches). WebLLM itself (one self-contained ES module, MESAI.LOCAL.url) is import()ed only
 * when a local model is used. The engine runs in a module Web Worker made from a Blob (so the page stays smooth), or on the page if a
 * worker can't be made. window.AILocal = {detect, has, remove, load, chat, stop, loaded}; used by app.js. Rules (models, device check,
 * history trim): lib.js (MESAI.MODELS with prov "local", localCheck, localTrim, splitThink). */
(function () {
	"use strict";
	var A = window.MESAI;
	if (!A || !A.LOCAL) return;
	var libP = null, engine = null, engineId = null, worker = null, envP = null, loadP = null;
	// the import is hidden from older parsers / bundlers the same way as the 3D graphing calculator does it
	function webllm() {
		if (!libP) libP = new Function("u", "return import(u)")(A.LOCAL.url).catch(function (e) { libP = null; throw e; });
		return libP;
	}
	// what this browser and graphics chip can do -> env for MESAI.localCheck
	function detect() {
		if (envP) return envP;
		var mem = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null;
		if (!navigator.gpu) return (envP = Promise.resolve({ gpu: false, mem: mem }));
		envP = Promise.resolve().then(function () { return navigator.gpu.requestAdapter({ powerPreference: "high-performance" }); }).then(function (ad) {
			if (!ad) return { gpu: true, adapter: false, mem: mem };
			return { gpu: true, adapter: true, f16: !!(ad.features && ad.features.has("shader-f16")), maxBuf: (ad.limits && ad.limits.maxBufferSize) || 0, mem: mem };
		}).catch(function () { return { gpu: true, adapter: false, mem: mem }; });
		return envP;
	}
	function has(id) { return webllm().then(function (w) { return w.hasModelInCache(id); }).catch(function () { return false; }); }
	function unload() {
		var e = engine; engine = null; engineId = null;
		if (e) try { e.unload(); } catch (x) {}
		if (worker) { try { worker.terminate(); } catch (x) {} worker = null; }
	}
	function remove(id) {
		if (engineId === id) unload();
		return webllm().then(function (w) { return w.deleteModelAllInfoInCache(id); });
	}
	function makeWorker() {
		var src = "import { WebWorkerMLCEngineHandler } from " + JSON.stringify(A.LOCAL.url) + ";\nconst h = new WebWorkerMLCEngineHandler();\nself.onmessage = (e) => h.onmessage(e);\n";
		return new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })), { type: "module" });
	}
	/* Download the model's weight files into WebLLM's own cache ("webllm/model", keyed by the huggingface.co URL exactly as WebLLM asks for
	   it) before WebLLM starts. WebLLM downloads 4 pieces at a time and gives up on the first dropped connection; on slow or shaky
	   connections that never finished. Here: 2 at a time, each piece retried, progress by the byte. Pieces already saved are skipped. */
	function prefetch(id, onProgress) {
		return webllm().then(function (w) {
			var rec = (w.prebuiltAppConfig.model_list || []).filter(function (m) { return m.model_id === id; })[0];
			if (!rec || !window.caches) return;
			var base = rec.model.replace(/\/?$/, "/"); if (!/\/resolve\/.+\//.test(base)) base += "resolve/main/";
			return caches.open("webllm/model").then(function (cache) {
				return fetch(base + "tensor-cache.json").then(function (r) { if (!r.ok) throw new Error("Request failed " + r.status); return r.json(); }).then(function (man) {
					return cache.keys().then(function (ks) {
						var have = {}; ks.forEach(function (k) { have[k.url] = 1; });
						var list = (man.records || []).map(function (x) { return { url: new URL(x.dataPath, base).href, n: x.nbytes || 0 }; });
						var total = list.reduce(function (t, x) { return t + x.n; }, 0) || 1, done = 0, live = {};
						var todo = list.filter(function (x) { if (have[x.url]) { done += x.n; return false; } return true; });
						if (!todo.length) return;
						var report = function () { var b = done; Object.keys(live).forEach(function (k) { b += live[k]; }); onProgress && onProgress({ progress: Math.min(1, b / total), dl: true }); };
						report();
						var one = function (x, tries) {
							live[x.url] = 0;
							return fetch(x.url).then(function (r) {
								if (!r.ok || !r.body) throw new Error("Request failed " + r.status);
								var rd = r.body.getReader(), parts = [];
								return (function pump() {
									return rd.read().then(function (c) {
										if (c.done) return;
										parts.push(c.value); live[x.url] += c.value.length; report();
										return pump();
									});
								})().then(function () { return cache.put(new Request(x.url), new Response(new Blob(parts), { headers: { "Content-Type": "application/octet-stream" } })); });
							}).then(function () { delete live[x.url]; done += x.n; report(); }, function (e) {
								delete live[x.url]; report();
								if (tries >= 6 || /quota/i.test(String(e && e.name) + String(e && e.message))) throw e;
								return new Promise(function (ok) { setTimeout(ok, 1000 + tries * 1500); }).then(function () { return one(x, tries + 1); });
							});
						};
						var next = 0, lane = function () { if (next >= todo.length) return Promise.resolve(); var x = todo[next++]; return one(x, 0).then(lane); };
						return Promise.all([lane(), lane()]);
					});
				});
			});
		});
	}
	// load (download the first time) model id; onProgress({progress 0..1, text}) -> Promise
	function load(id, onProgress) {
		if (engine && engineId === id) return Promise.resolve();
		if (loadP && loadP.id === id) return loadP;
		unload();
		var cfg = { initProgressCallback: function (p) { try { onProgress && onProgress(p || {}); } catch (e) {} } };
		var p = prefetch(id, onProgress).then(webllm).then(function (w) {
			var viaWorker = function () { worker = makeWorker(); return w.CreateWebWorkerMLCEngine(worker, id, cfg); };
			var onPage = function () { if (worker) { try { worker.terminate(); } catch (x) {} worker = null; } return w.CreateMLCEngine(id, cfg); };
			var go;
			try { go = viaWorker().catch(function (e) { if (/shader-f16|device was lost|out of memory|quota|storage/i.test(String(e && e.message))) throw e; return onPage(); }); }
			catch (e) { go = onPage(); }
			return go;
		}).then(function (e) { engine = e; engineId = id; loadP = null; }, function (e) { loadP = null; unload(); throw e; });
		p.id = id; loadP = p;
		return p;
	}
	/* a dropped connection on one of WebLLM's 4 parallel downloads fails the whole load ("Cache.add() encountered a network error"),
	   but the pieces already saved stay in the cache, so trying again carries on from there */
	function isNet(e) { return /network|Request failed|Failed to fetch|Load failed|Cache/i.test(String(e && (e.message || e))); }
	function loadRetry(id, onProgress, tries) {
		tries = tries || 0;
		return load(id, onProgress).catch(function (e) {
			if (!isNet(e) || tries >= 7) throw e;
			try { onProgress && onProgress({ retry: tries + 1, progress: null }); } catch (x) {}
			return new Promise(function (r) { setTimeout(r, 1500 + tries * 1500); }).then(function () { return loadRetry(id, onProgress, tries + 1); });
		});
	}
	/* stream an answer: messages = [{role, content}] incl. the system message; onPiece({t: "text", v} | {t: "done", stop}) */
	function chat(id, messages, maxOut, onPiece) {
		if (!engine || engineId !== id) return Promise.reject(new Error("The model is not loaded."));
		var req = { messages: messages, stream: true, max_tokens: maxOut, temperature: 0.6, top_p: 0.9 };
		if (/^Qwen3/.test(id)) req.extra_body = { enable_thinking: false };  // a small model's thinking would eat most of its short memory
		return engine.chat.completions.create(req).then(function (it) {
			var stop = null, iter = it[Symbol.asyncIterator]();
			return (function next() {
				return iter.next().then(function (x) {
					if (x.done) { onPiece({ t: "done", stop: stop === "length" ? "max_tokens" : stop === "abort" ? "stopped" : "end_turn" }); return; }
					var c = x.value && x.value.choices && x.value.choices[0];
					if (c && c.delta && c.delta.content) onPiece({ t: "text", v: c.delta.content });
					if (c && c.finish_reason) stop = c.finish_reason;
					return next();
				});
			})();
		});
	}
	function stop() { if (engine) try { engine.interruptGenerate(); } catch (e) {} }
	window.AILocal = { detect: detect, has: has, remove: remove, load: loadRetry, chat: chat, stop: stop, unload: unload, loaded: function () { return engineId; } };
})();
