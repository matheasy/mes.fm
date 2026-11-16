/* MES Upscale: AI picture upscaler in the browser. Real-ESRGAN x4 models (BSD-3-Clause, self-hosted in /upscale/models/) through onnxruntime-web 1.22.0
 * (WebGPU first, CPU/wasm fallback, also when a run fails). Pictures are tiled (lib.js tilePlan), every tile goes through the x4 network, the kept centre is drawn
 * into the result; 8x / big width targets run a second pass on the result shrunk to a quarter of the final size. Nothing is uploaded. */
(function () {
	"use strict";
	var U = window.MESUp, I = window.MESImg, $ = function (id) { return document.getElementById(id); };
	if (!U || !$("up")) return;
	var ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js", CACHE = "mes-upscale-models", MODEL_V = "1";
	var KEY = "mes-upscale:v1", S = { mode: "photo", scale: "2", w: 3840, det: 100, fmt: "png", q: 92 };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var items = [], seq = 0, running = false, stopReq = false, ortP = null, sessions = {}, provider = null;
	function mk(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmtB(n) { return I && I.formatBytes ? I.formatBytes(n) : Math.round(n / 1024) + " KB"; }
	function toast(msg) { var t = document.createElement("div"); t.className = "tu-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3200); }

	/* ---------- engine ---------- */
	function ort() {
		if (window.ort) return Promise.resolve(window.ort);
		return ortP = ortP || new Promise(function (res, rej) { var s = document.createElement("script"); s.src = ORT; s.onload = function () { try { window.ort.env.wasm.numThreads = 1; } catch (e) {} res(window.ort); }; s.onerror = function () { ortP = null; rej(new Error("Could not load the AI engine (offline?)")); }; document.head.appendChild(s); });
	}
	function fetchModel(m, onProg) {
		var url = "/upscale/models/" + m.file + "?v=" + MODEL_V, c = window.caches ? caches.open(CACHE).catch(function () { return null; }) : Promise.resolve(null);
		return c.then(function (cache) {
			return (cache ? cache.match(url) : Promise.resolve(null)).then(function (hit) {
				if (hit) return hit.arrayBuffer();
				return fetch(url).then(function (r) {
					if (!r.ok) throw new Error("Model download failed (" + r.status + ")");
					var total = +r.headers.get("content-length") || m.mb * 1e6, rd = r.body.getReader(), got = 0, parts = [];
					function pump() { return rd.read().then(function (x) { if (x.done) return; parts.push(x.value); got += x.value.length; onProg(got, total); return pump(); }); }
					return pump().then(function () { var buf = new Uint8Array(got), p = 0; parts.forEach(function (a) { buf.set(a, p); p += a.length; }); if (cache) cache.put(url, new Response(buf.slice(0), { headers: { "content-type": "application/octet-stream" } })).catch(function () {}); return buf.buffer; });
				});
			});
		});
	}
	function session(key, onProg, forceWasm) {
		var s = sessions[key]; if (s && !forceWasm) return Promise.resolve(s);
		var m = U.MODELS[key];
		return Promise.all([ort(), s ? Promise.resolve(s.bytes) : fetchModel(m, onProg)]).then(function (r) {
			var o = r[0], bytes = r[1], tries = forceWasm || !navigator.gpu || /[?&]cpu=1/.test(location.search) ? ["wasm"] : ["webgpu", "wasm"];
			function next(i) {
				return o.InferenceSession.create(bytes, { executionProviders: [tries[i]] }).then(function (sess) {
					var x = { sess: sess, provider: tries[i], ort: o, key: key, bytes: bytes, m: m, inName: sess.inputNames[0], outName: sess.outputNames[0] };
					sessions[key] = x; provider = tries[i]; engNote(); return x;
				}, function (e) { if (i + 1 < tries.length) return next(i + 1); throw e; });
			}
			return next(0);
		});
	}
	function runTile(x, feeds) {
		return x.sess.run(feeds).then(function (out) { return { out: out[x.outName], x: x }; }, function (e) {
			if (x.provider !== "webgpu") throw e;
			return session(x.key, function () {}, true).then(function (x2) { var f2 = {}; f2[x2.inName] = feeds[x.inName]; return x2.sess.run(f2).then(function (out) { return { out: out[x2.outName], x: x2 }; }); });
		});
	}
	function engNote() {
		var el = $("up-eng"); if (!el) return;
		el.innerHTML = provider === "webgpu" ? "⚡ <b>Using your graphics chip</b> (WebGPU): fast. Runs on your device, nothing is uploaded."
			: provider === "wasm" ? "🐢 <b>Using the processor</b>: your browser did not offer the graphics chip (WebGPU), so big pictures take a while. Chrome, Edge or Brave on a computer are fastest."
			: "Runs on your device. The first AI upscale downloads a small model (5 MB or less) and keeps it in your browser." + (navigator.gpu ? "" : " <b>No WebGPU in this browser</b>: it will use the processor, which is slower.");
	}
	function tileOpt(key, prov) { var m = U.MODELS[key]; return m.fixed ? { fixed: m.fixed, pad: 16 } : { tile: (prov || (navigator.gpu ? "webgpu" : "wasm")) === "webgpu" ? 256 : 128, pad: 16 }; }
	/* one x4 pass of the network over a canvas -> canvas 4x */
	function aiPass(src, key, prog) {
		return session(key, function (g, t) { status("Downloading the AI model… " + (g / 1e6).toFixed(1) + " of " + (t / 1e6).toFixed(1) + " MB"); setBar(g / t); }).then(function (x) {
			var w = src.width, h = src.height, tiles = U.tilePlan(w, h, tileOpt(key, x.provider)), out = mk(w * 4, h * 4), ox = out.getContext("2d"), sx = src.getContext("2d", { willReadFrequently: true }), i = 0;
			var tc = null, tctx = null;
			function next() {
				if (stopReq) return Promise.reject(new Error("stopped"));
				if (i >= tiles.length) return Promise.resolve(out);
				var t = tiles[i++], r = U.readRect(t, w, h), id = sx.getImageData(r.x, r.y, r.w, r.h).data;
				var off = { x: r.x - t.wx, y: r.y - t.wy }, ww = t.ww, wh = t.wh, data;
				if (off.x || off.y) { /* window starts before the picture: not possible with our plans, but keep it safe */ }
				data = U.toCHW(id, r.w, r.h, ww, wh);
				var feeds = {}; feeds[x.inName] = new x.ort.Tensor("float32", data, [1, 3, wh, ww]);
				return runTile(x, feeds).then(function (res) {
					x = res.x; var d = res.out.data, W4 = ww * 4, H4 = wh * 4;
					if (!tc || tc.width !== W4 || tc.height !== H4) { tc = mk(W4, H4); tctx = tc.getContext("2d"); }
					var img = tctx.createImageData(W4, H4); U.fromCHW(d, W4, H4, img.data); tctx.putImageData(img, 0, 0);
					ox.drawImage(tc, (t.cx - r.x) * 4, (t.cy - r.y) * 4, t.cw * 4, t.ch * 4, t.cx * 4, t.cy * 4, t.cw * 4, t.ch * 4);
					prog(1);
					return new Promise(function (res2) { setTimeout(res2, 0); }).then(next);
				});
			}
			return next();
		});
	}
	function resize(src, W, H, smooth) { var c = mk(W, H), x = c.getContext("2d"); x.imageSmoothingEnabled = smooth !== false; x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, W, H); return c; }
	function hasAlpha(c) { var d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; for (var i = 3; i < d.length; i += 4) if (d[i] < 250) return true; return false; }

	/* ---------- items ---------- */
	function settingsKey() { return [S.mode, S.scale === "w" ? "w" + S.w : S.scale, S.det, S.fmt, S.q].join("|"); }
	function target(it) { return S.scale === "w" ? U.targetSize(it.w, it.h, "width", S.w) : U.targetSize(it.w, it.h, "scale", +S.scale); }
	function add(files) {
		var list = [].slice.call(files || []).filter(function (f) { return f && (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name || "")); });
		if (!list.length) { toast("No pictures found in that"); return; }
		list.forEach(function (f) {
			var it = { id: ++seq, file: f, name: f.name || "picture.png", status: "load" };
			items.push(it); drawItem(it);
			createImageBitmap(f).then(function (bm) { it.bm = bm; it.w = bm.width; it.h = bm.height; it.status = "wait"; drawItem(it); summary(); }, function () { it.status = "err"; it.err = "This browser cannot open that file"; drawItem(it); summary(); });
		});
		summary();
	}
	function drawItem(it) {
		var ul = $("up-list"), li = it.li;
		if (!li) { li = it.li = document.createElement("li"); li.className = "up-it"; li.innerHTML = '<div class="up-th"></div><div class="up-info"><div class="up-nm"></div><div class="up-meta"></div><div class="up-ibar"><i></i></div></div><div class="up-btns"></div>'; ul.appendChild(li); if (it.file) { var u = URL.createObjectURL(it.file); it.thumbUrl = u; li.querySelector(".up-th").style.backgroundImage = "url(" + u + ")"; } }
		li.querySelector(".up-nm").textContent = it.name;
		var meta = "", btn = "";
		if (it.status === "load") meta = "Opening…";
		else if (it.status === "err") meta = '<span class="up-err">' + esc(it.err || "Error") + "</span>";
		else {
			var t = target(it), ai = U.MODES[S.mode].ai;
			meta = it.w + " × " + it.h + " → <b>" + t.W + " × " + t.H + "</b> px";
			if (t.tooBig) meta += ' · <span class="up-err">too big for a browser (max 16,384 px a side, 80 MP)</span>';
			else if (it.status === "wait" && ai) { var n = U.countTiles(it.w, it.h, t.W, t.H, tileOpt(U.MODES[S.mode].model, provider)); meta += " · about " + U.fmtSec(U.estimateSec(n, { gpu: (provider || (navigator.gpu ? "webgpu" : "wasm")) === "webgpu", fixed: U.MODELS[U.MODES[S.mode].model].fixed })); }
			if (it.status === "busy") meta += " · <b>working…</b>";
			if (it.status === "done" && it.out) { meta = it.w + " × " + it.h + " → <b>" + it.out.W + " × " + it.out.H + "</b> px · " + fmtB(it.out.blob.size) + ' · <span class="up-ok">done in ' + U.fmtSec(it.out.sec) + "</span>"; if (it.out.key !== settingsKey()) meta += ' · <span class="up-warn">settings changed: upscale again to use them</span>'; }
		}
		li.querySelector(".up-meta").innerHTML = meta;
		li.classList.toggle("is-busy", it.status === "busy");
		if (it.status !== "busy") li.querySelector(".up-ibar i").style.width = it.status === "done" ? "100%" : "0";
		var done = it.status === "done" && it.out;
		btn += done ? '<button type="button" data-a="cmp" class="up-b-p">Compare</button><button type="button" data-a="dl">⬇ Save</button><button type="button" data-a="ed" title="Open the result in the MES Photo Editor">Edit</button>' : "";
		btn += it.status === "wait" || (done && it.out.key !== settingsKey()) ? '<button type="button" data-a="go">' + (done ? "↻ Again" : "✨ Upscale") + "</button>" : "";
		btn += it.status !== "busy" ? '<button type="button" data-a="rm" aria-label="Remove">✕</button>' : "";
		li.querySelector(".up-btns").innerHTML = btn;
		li.querySelectorAll(".up-btns button").forEach(function (b) { b.onclick = function () { act(it, b.getAttribute("data-a")); }; });
	}
	function act(it, a) {
		if (a === "rm") { if (it.out && it.out.url) URL.revokeObjectURL(it.out.url); if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl); it.li.remove(); items = items.filter(function (x) { return x !== it; }); summary(); }
		else if (a === "dl") download(it.out.blob, it.out.name);
		else if (a === "cmp") openCmp(it);
		else if (a === "go") runQueue([it]);
		else if (a === "ed") { if (I && I.handoffSend) I.handoffSend("/photo", [{ blob: it.out.blob, name: it.out.name }], function (u) { toast("Allow pop-ups for mes.fm, or open " + u); }).catch(function () { toast("Could not hand it over: save it and open it in the Photo Editor"); }); }
	}
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
	function summary() {
		var n = items.length, done = items.filter(function (x) { return x.status === "done" && x.out; }).length;
		$("up-bar").hidden = !n;
		$("up-sum").innerHTML = n ? "<b>" + n + "</b> picture" + (n > 1 ? "s" : "") + (done ? " · <b>" + done + "</b> upscaled" : "") : "";
		$("up-zip").disabled = !done || running;
		$("up-go").disabled = running || !items.some(function (x) { return x.status === "wait" || (x.status === "done" && x.out && x.out.key !== settingsKey()); });
		$("up-stop").hidden = !running;
	}
	function setBar(f) { var b = $("up-prog"); b.hidden = f == null; if (f != null) $("up-prog-i").style.width = Math.max(0, Math.min(1, f)) * 100 + "%"; }
	function status(t) { $("up-st").textContent = t || ""; }

	/* ---------- the work ---------- */
	function upscaleOne(it, prog) {
		var t = target(it), mode = U.MODES[S.mode], t0 = performance.now();
		if (t.tooBig) return Promise.reject(new Error("Too big for a browser: choose a smaller size"));
		var src = mk(it.w, it.h); src.getContext("2d").drawImage(it.bm, 0, 0);
		var alpha = hasAlpha(src), p;
		if (!mode.ai) p = Promise.resolve(resize(src, t.W, t.H, S.mode !== "pixel"));
		else {
			var plan = U.plan(it.w, it.h, t.W, t.H), cur = src, chain = Promise.resolve();
			if (alpha) { var flat = mk(it.w, it.h), fx = flat.getContext("2d"); fx.fillStyle = "#fff"; fx.fillRect(0, 0, it.w, it.h); fx.drawImage(src, 0, 0); cur = flat; }
			plan.steps.forEach(function (s) { chain = chain.then(function () { if (s.type === "ai") return aiPass(cur, mode.model, prog).then(function (c) { cur = c; }); cur = resize(cur, s.w, s.h, true); }); });
			p = chain.then(function () {
				if (S.det < 100) { var mix = resize(src, t.W, t.H, true), mx = mix.getContext("2d"); mx.globalAlpha = S.det / 100; mx.drawImage(cur, 0, 0); cur = mix; }
				if (alpha) { var a = mk(it.w, it.h), ax = a.getContext("2d"); ax.drawImage(src, 0, 0); ax.globalCompositeOperation = "source-in"; ax.fillStyle = "#000"; ax.fillRect(0, 0, it.w, it.h); var big = resize(a, t.W, t.H, true), cx = cur.getContext("2d"); cx.globalCompositeOperation = "destination-in"; cx.drawImage(big, 0, 0); cx.globalCompositeOperation = "source-over"; }
				return cur;
			});
		}
		return p.then(function (c) {
			var F = I.FORMATS[S.fmt], out = c;
			if (!F.alpha && alpha) { out = mk(c.width, c.height); var o = out.getContext("2d"); o.fillStyle = "#fff"; o.fillRect(0, 0, c.width, c.height); o.drawImage(c, 0, 0); }
			return new Promise(function (res, rej) { out.toBlob(function (b) { b ? res(b) : rej(new Error("Could not save the result (out of memory?)")); }, F.mime, F.lossy ? S.q / 100 : undefined); });
		}).then(function (blob) {
			if (it.out && it.out.url) URL.revokeObjectURL(it.out.url);
			it.out = { blob: blob, W: t.W, H: t.H, name: U.outName(it.name, t.f, I.FORMATS[S.fmt].ext, t.W, t.H, S.scale === "w" ? "width" : "scale"), key: settingsKey(), sec: (performance.now() - t0) / 1000 };
			it.status = "done";
		});
	}
	function runQueue(list) {
		if (running) return;
		list = (list || items).filter(function (x) { return x.bm && (x.status === "wait" || (x.status === "done" && x.out && x.out.key !== settingsKey())); });
		if (!list.length) return;
		running = true; stopReq = false; summary();
		var tp = window.MESTabProgress ? MESTabProgress.task("Upscaling") : null, total = 0, done = 0, t0 = performance.now();
		list.forEach(function (it) { var t = target(it); total += U.MODES[S.mode].ai ? U.countTiles(it.w, it.h, t.W, t.H, tileOpt(U.MODES[S.mode].model, provider)) : 1; });
		function prog(n) {
			done += n; var f = done / total, el = (performance.now() - t0) / 1000, left = done ? el / done * (total - done) : 0; setBar(f);
			status("Upscaling… " + Math.round(f * 100) + "%" + (left > 3 ? " · about " + U.fmtSec(left) + " left" : "") + (provider === "wasm" ? " · on the processor (no WebGPU)" : ""));
			if (tp) tp.set(f); var cur = list.filter(function (x) { return x.status === "busy"; })[0]; if (cur && cur.li) cur.li.querySelector(".up-ibar i").style.width = Math.round(100 * (done - cur._start) / cur._tiles) + "%";
		}
		var chain = Promise.resolve();
		list.forEach(function (it) {
			chain = chain.then(function () {
				if (stopReq) return; var t = target(it); it._start = done; it._tiles = U.MODES[S.mode].ai ? U.countTiles(it.w, it.h, t.W, t.H, tileOpt(U.MODES[S.mode].model, provider)) : 1;
				it.status = "busy"; drawItem(it); status("Starting…");
				return upscaleOne(it, prog).then(function () { if (!U.MODES[S.mode].ai) prog(1); drawItem(it); summary(); }, function (e) {
					if (e && e.message === "stopped") { it.status = it.out ? "done" : "wait"; drawItem(it); return; }
					it.status = "err"; it.err = "Could not upscale: " + (e && e.message ? e.message : e); drawItem(it); console.error(e);
				});
			});
		});
		chain.then(function () {
			running = false; setBar(null); var ok = list.filter(function (x) { return x.status === "done"; }).length;
			status(stopReq ? "Stopped." : ok ? "Done: " + ok + " picture" + (ok > 1 ? "s" : "") + " upscaled in " + U.fmtSec((performance.now() - t0) / 1000) + "." : "");
			if (tp) { if (stopReq) tp.stop(); else tp.done(ok ? "Upscaled" : "Failed"); }
			summary(); items.forEach(drawItem);
			if (ok === 1 && list.length === 1 && !stopReq) openCmp(list[0]);
		});
	}

	/* ---------- compare viewer ---------- */
	var C = { it: null, bm: null, z: 0, fit: true, ox: 0, oy: 0, split: 0.5, mode: "split" };
	function openCmp(it) {
		if (!it.out) return;
		createImageBitmap(it.out.blob).then(function (bm) {
			C.it = it; C.bm = bm; C.fit = true; C.split = 0.5; $("up-cmp-t").textContent = it.out.name + " · " + it.out.W + " × " + it.out.H;
			$("up-cmp").hidden = false; document.body.classList.add("up-cmping"); layoutCmp(); drawCmp();
		}, function () { toast("Could not show the result (out of memory?)"); });
	}
	function closeCmp() { $("up-cmp").hidden = true; document.body.classList.remove("up-cmping"); if (C.bm && C.bm.close) C.bm.close(); C.bm = null; C.it = null; }
	function layoutCmp() {
		var st = $("up-cmp-stage"), cv = $("up-cmp-cv"), dpr = window.devicePixelRatio || 1;
		cv.width = Math.round(st.clientWidth * dpr); cv.height = Math.round(st.clientHeight * dpr); cv.style.width = st.clientWidth + "px"; cv.style.height = st.clientHeight + "px";
		if (C.fit && C.bm) { var W = C.mode === "side" ? cv.width / 2 : cv.width; C.z = Math.min(W / C.bm.width, cv.height / C.bm.height); C.ox = (W - C.bm.width * C.z) / 2; C.oy = (cv.height - C.bm.height * C.z) / 2; }
	}
	function drawCmp() {
		if (!C.bm) return; var cv = $("up-cmp-cv"), x = cv.getContext("2d"), W = cv.width, H = cv.height, bm = C.bm, it = C.it, dw = bm.width * C.z, dh = bm.height * C.z;
		x.clearRect(0, 0, W, H); x.imageSmoothingQuality = "high";
		var dpr = window.devicePixelRatio || 1, sharp = C.z >= 1.5;
		if (C.mode === "side") {
			var half = W / 2;
			x.save(); x.beginPath(); x.rect(0, 0, half - 1, H); x.clip(); x.imageSmoothingEnabled = !sharp; x.drawImage(it.bm, C.ox, C.oy, dw, dh); x.restore();
			x.save(); x.beginPath(); x.rect(half + 1, 0, half, H); x.clip(); x.imageSmoothingEnabled = !sharp; x.drawImage(bm, half + C.ox, C.oy, dw, dh); x.restore();
			x.fillStyle = "#fff"; x.fillRect(half - 1, 0, 2, H);
		} else {
			var sx = W * C.split;
			x.imageSmoothingEnabled = !sharp; x.drawImage(bm, C.ox, C.oy, dw, dh);
			x.save(); x.beginPath(); x.rect(0, 0, sx, H); x.clip(); x.imageSmoothingEnabled = true; x.drawImage(it.bm, C.ox, C.oy, dw, dh); x.restore();
			x.fillStyle = "#fff"; x.fillRect(sx - 1 * dpr, 0, 2 * dpr, H);
			x.beginPath(); x.arc(sx, H / 2, 16 * dpr, 0, 7); x.fill(); x.fillStyle = "#333"; x.font = (14 * dpr) + "px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("◀▶", sx, H / 2);
		}
		$("up-cmp-zv").textContent = Math.round(C.z * 100) + "%";
		document.querySelectorAll("#up-cmp [data-m]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === C.mode ? "true" : "false"); });
		$("up-cmp").querySelector(".up-cmp-l").textContent = C.mode === "side" ? "Before (plain resize)" : "◀ Before (plain resize)"; $("up-cmp").querySelector(".up-cmp-r").textContent = C.mode === "side" ? "After" : "After ▶";
	}
	function zoomAt(f, px, py) { var nz = Math.max(0.02, Math.min(16, C.z * f)); C.ox = px - (px - C.ox) * nz / C.z; C.oy = py - (py - C.oy) * nz / C.z; C.z = nz; C.fit = false; drawCmp(); }
	(function wireCmp() {
		var cv = $("up-cmp-cv"), drag = null, pts = {};
		function pos(e) { var r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
		cv.addEventListener("pointerdown", function (e) {
			cv.setPointerCapture(e.pointerId); pts[e.pointerId] = pos(e); var p = pos(e), ids = Object.keys(pts);
			if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z: C.z, ox: C.ox, oy: C.oy, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return; }
			var near = C.mode === "split" && Math.abs(p.x - cv.width * C.split) < 26 * (window.devicePixelRatio || 1);
			drag = near ? { split: true } : { x: p.x, y: p.y, ox: C.ox, oy: C.oy };
		});
		cv.addEventListener("pointermove", function (e) {
			var p = pos(e); if (pts[e.pointerId]) pts[e.pointerId] = p;
			if (!drag) { cv.style.cursor = C.mode === "split" && Math.abs(p.x - cv.width * C.split) < 26 * (window.devicePixelRatio || 1) ? "ew-resize" : "grab"; return; }
			if (drag.pinch) { var ids = Object.keys(pts); if (ids.length < 2) return; var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), nz = Math.max(0.02, Math.min(16, drag.z * d / drag.pinch)); C.ox = drag.cx - (drag.cx - drag.ox) * nz / drag.z; C.oy = drag.cy - (drag.cy - drag.oy) * nz / drag.z; C.z = nz; C.fit = false; drawCmp(); return; }
			if (drag.split) { C.split = Math.max(0, Math.min(1, p.x / cv.width)); drawCmp(); return; }
			C.ox = drag.ox + p.x - drag.x; C.oy = drag.oy + p.y - drag.y; C.fit = false; drawCmp();
		});
		function up(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) drag = null; }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); var p = pos(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
		cv.addEventListener("dblclick", function (e) { var p = pos(e); if (C.fit) zoomAt(1 / C.z, p.x, p.y); else { C.fit = true; layoutCmp(); drawCmp(); } });
		$("up-cmp").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.hasAttribute("data-z")) { var z = b.getAttribute("data-z"); if (z === "fit") { C.fit = true; layoutCmp(); } else { var cvw = cv.width, cvh = cv.height; zoomAt(+z / C.z, cvw / 2, cvh / 2); } drawCmp(); }
			if (b.hasAttribute("data-m")) { C.mode = b.getAttribute("data-m"); C.fit = true; layoutCmp(); drawCmp(); }
		});
		$("up-cmp-x").onclick = closeCmp; $("up-cmp-dl").onclick = function () { if (C.it) download(C.it.out.blob, C.it.out.name); };
		document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("up-cmp").hidden) closeCmp(); });
		window.addEventListener("resize", function () { if (!$("up-cmp").hidden) { layoutCmp(); drawCmp(); } });
	})();

	/* ---------- options ---------- */
	function seg(id, key, after) {
		var box = $(id);
		function paint() { box.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === String(S[key]) ? "true" : "false"); }); }
		box.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b || running) return; S[key] = b.getAttribute("data-v"); paint(); save(); after && after(); changed(); });
		paint();
	}
	function changed() { items.forEach(drawItem); summary(); }
	function optsUi() {
		var m = U.MODES[S.mode]; $("up-mode-n").textContent = m.note + (m.ai ? " AI model: " + U.MODELS[m.model].name + "." : "");
		$("up-det-f").hidden = !m.ai; $("up-w-box").hidden = S.scale !== "w"; $("up-q-box").hidden = !I.FORMATS[S.fmt].lossy;
	}
	seg("up-mode", "mode", optsUi); seg("up-scale", "scale", optsUi); seg("up-fmt", "fmt", optsUi);
	$("up-w").value = S.w; $("up-w").addEventListener("change", function () { S.w = U.clampInt(this.value, 16, 16384); this.value = S.w; save(); changed(); });
	document.querySelectorAll("#up-w-box [data-w]").forEach(function (b) { b.onclick = function () { S.w = +b.getAttribute("data-w"); $("up-w").value = S.w; save(); changed(); }; });
	$("up-det").value = S.det; $("up-det-v").textContent = S.det; $("up-det").addEventListener("input", function () { S.det = +this.value; $("up-det-v").textContent = S.det; save(); changed(); });
	$("up-q").value = S.q; $("up-q-v").textContent = S.q; $("up-q").addEventListener("input", function () { S.q = +this.value; $("up-q-v").textContent = S.q; save(); changed(); });
	optsUi(); engNote();

	/* ---------- input ---------- */
	var drop = $("up-drop"), fi = $("up-file");
	$("up-pick").onclick = function (e) { e.stopPropagation(); fi.click(); };
	drop.addEventListener("click", function (e) { if (!e.target.closest("button")) fi.click(); });
	drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
	fi.addEventListener("change", function () { add(fi.files); fi.value = ""; });
	["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
	["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("is-over"); }); });
	drop.addEventListener("drop", function (e) { e.preventDefault(); add(e.dataTransfer.files); });
	document.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
	document.addEventListener("drop", function (e) { if (e.target.closest && e.target.closest("#up-drop")) return; if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); add(e.dataTransfer.files); } });
	document.addEventListener("paste", function (e) { if (e.target.closest && e.target.closest("input,textarea,[contenteditable]")) return; var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); add(fs); } });
	$("up-sample").onclick = function (e) { e.stopPropagation(); fetch("/upscale/img/sample.jpg").then(function (r) { return r.blob(); }).then(function (b) { add([new File([b], "sample.jpg", { type: "image/jpeg" })]); }).catch(function () { toast("Could not load the sample"); }); };
	$("up-go").onclick = function () { runQueue(); };
	$("up-stop").onclick = function () { stopReq = true; status("Stopping after this tile…"); };
	$("up-clear").onclick = function () { if (running) return; items.slice().forEach(function (it) { act(it, "rm"); }); status(""); };
	$("up-zip").onclick = function () {
		var done = items.filter(function (x) { return x.status === "done" && x.out; }); if (!done.length) return;
		if (done.length === 1) { download(done[0].out.blob, done[0].out.name); return; }
		var used = {}; Promise.all(done.map(function (it) { return it.out.blob.arrayBuffer().then(function (b) { var nm = I.uniqueName(it.out.name, used); return { name: nm, data: new Uint8Array(b) }; }); })).then(function (files) { download(new Blob([I.zipStore(files)], { type: "application/zip" }), "upscaled.zip"); });
	};
	window.addEventListener("beforeunload", function (e) { if (running) { e.preventDefault(); e.returnValue = ""; } });
	if (I && I.handoffReceive) I.handoffReceive().then(function (fs) { if (fs.length) add(fs); });
	window.MESUpscaleDebug = { items: function () { return items; }, run: runQueue, add: add, S: S, provider: function () { return provider; } };
})();
