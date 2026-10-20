/* MES Photo Editor: AI object erase (inpainting), in the browser. Paint over what you want gone (or use a selection), press Erase: LaMa fills the area from its surroundings.
 * LaMa (Apache-2.0) as OpenCV's 93 MB ONNX build (huggingface.co/opencv/inpainting_lama, derived from Carve/LaMa-ONNX), run by onnxruntime-web 1.22.0 (jsDelivr; WebGPU when it works,
 * else wasm). The model works on 512 x 512, so a window around the marked area (with context) is resampled to 512, filled, resampled back, and only the marked area (grown 2 px,
 * feathered) is copied over the original: everything else keeps its exact pixels. The model file is cached with the Cache API after the first download. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk, el = PE.el;
	var MODEL = "https://huggingface.co/opencv/inpainting_lama/resolve/main/inpainting_lama_2025jan.onnx", MB = 92.6;
	var provider = "", marks = null, busy = false, stroke = null;
	var SESSKEY = "lama";
	function getSession(onProg) { return PE.aiRt.session(SESSKEY, MODEL, MB, onProg).then(function (o) { provider = o.provider; return o; }); }
	function runSafe(o, img, msk) {
		var ort = o.ort, feeds = { image: new ort.Tensor("float32", img, [1, 3, 512, 512]), mask: new ort.Tensor("float32", msk, [1, 1, 512, 512]) };
		return PE.aiRt.run(o, feeds).then(function (r) { provider = r.o.provider; return r.out.output.data; });
	}

	/* mask (Uint8, document size) -> filled pixels in the active layer */
	function inpaint(L, o, docMask, status) {
		PE.bake(L); var d = PE.doc, og = PE.origin(L), lw = L.canvas.width, lh = L.canvas.height, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, y, x;
		for (y = 0; y < d.h; y++) for (x = 0; x < d.w; x++) if (docMask[y * d.w + x]) { var lx = x - og.x, ly = y - og.y; if (lx < 0 || ly < 0 || lx >= lw || ly >= lh) continue; if (lx < x0) x0 = lx; if (lx > x1) x1 = lx; if (ly < y0) y0 = ly; if (ly > y1) y1 = ly; }
		if (x1 < 0) { PE.toast("Mark the object on this layer first"); return Promise.resolve(false); }
		var bw = x1 - x0 + 1, bh = y1 - y0 + 1, want = Math.max(bw, bh) + Math.max(96, Math.round(Math.max(bw, bh) * 0.6)), S = Math.max(512, want), ww = Math.min(S, lw), wh = Math.min(S, lh);
		var wx = Math.round(Math.min(Math.max(0, (x0 + x1) / 2 - ww / 2), lw - ww)), wy = Math.round(Math.min(Math.max(0, (y0 + y1) / 2 - wh / 2), lh - wh));
		var win = mk(ww, wh); win.getContext("2d").drawImage(L.canvas, wx, wy, ww, wh, 0, 0, ww, wh);
		var wm = new Uint8Array(ww * wh); for (y = 0; y < wh; y++) { var dy = y + wy + og.y; if (dy < 0 || dy >= d.h) continue; for (x = 0; x < ww; x++) { var dx = x + wx + og.x; if (dx >= 0 && dx < d.w && docMask[dy * d.w + dx]) wm[y * ww + x] = 255; } }
		var mc = mk(ww, wh), mid = mc.getContext("2d").createImageData(ww, wh); for (var i = 0; i < wm.length; i++) { mid.data[i * 4 + 3] = wm[i]; } mc.getContext("2d").putImageData(mid, 0, 0);
		var a512 = PE.resample(win, 512, 512), m512 = mk(512, 512); m512.getContext("2d").imageSmoothingEnabled = true; m512.getContext("2d").drawImage(mc, 0, 0, 512, 512);
		var ad = a512.getContext("2d").getImageData(0, 0, 512, 512).data, md = m512.getContext("2d").getImageData(0, 0, 512, 512).data, n = 512 * 512, img = new Float32Array(3 * n), msk = new Float32Array(n), mu = new Uint8Array(n);
		for (i = 0; i < n; i++) { img[i] = ad[i * 4] / 255; img[n + i] = ad[i * 4 + 1] / 255; img[2 * n + i] = ad[i * 4 + 2] / 255; mu[i] = md[i * 4 + 3] > 40 ? 255 : 0; }
		mu = P.growShrinkMask(mu, 512, 512, 2, true); for (i = 0; i < n; i++) msk[i] = mu[i] ? 1 : 0;
		status("Filling in the area… " + (provider === "wasm" ? "(about 15 seconds on this device)" : ""));
		return runSafe(o, img, msk).then(function (out) {
			var rc = mk(512, 512), rid = rc.getContext("2d").createImageData(512, 512); for (var k = 0; k < n; k++) { rid.data[k * 4] = out[k]; rid.data[k * 4 + 1] = out[n + k]; rid.data[k * 4 + 2] = out[2 * n + k]; rid.data[k * 4 + 3] = 255; } rc.getContext("2d").putImageData(rid, 0, 0);
			var res = mk(ww, wh), rx = res.getContext("2d"); rx.imageSmoothingQuality = "high"; rx.drawImage(rc, 0, 0, ww, wh);
			var soft = P.featherMask(P.growShrinkMask(wm, ww, wh, 2, true), ww, wh, 3), sc = mk(ww, wh), sid = sc.getContext("2d").createImageData(ww, wh); for (var j = 0; j < soft.length; j++) sid.data[j * 4 + 3] = soft[j]; sc.getContext("2d").putImageData(sid, 0, 0);
			rx.globalCompositeOperation = "destination-in"; rx.drawImage(sc, 0, 0); var lx2 = L.canvas.getContext("2d"); lx2.drawImage(res, wx, wy); L.rev++; PE.markAi(L, "object erased"); PE.commit("Erase object (AI)"); return true;
		});
	}

	/* the dialog that shows progress while the model downloads and runs */
	function process(docMask) {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (L.locked) { PE.toast("This layer is locked"); return; } if (L.type === "text") { PE.toast("Rasterize the text layer first"); return; } if (busy) return;
		busy = true; var wrap = el("div"), st = el("div", "pe-hint2"), bar = el("div", "pe-aibar"), fill = el("i"); bar.appendChild(fill); wrap.appendChild(el("p", "pe-hint2", "Everything runs on your device. The first time, a " + Math.round(MB) + " MB AI model is downloaded and kept in your browser.")); wrap.appendChild(bar); wrap.appendChild(st); st.textContent = "Loading the AI engine…";
		var m = PE.modal({ title: "Erase object (AI)", body: wrap, sticky: true, onClose: function () { busy = false; } });
		getSession(function (got, total) { fill.style.width = (100 * got / total) + "%"; st.textContent = "Downloading the model… " + Math.round(got / 1e6) + " of " + Math.round(total / 1e6) + " MB"; }).then(function (o) { fill.style.width = "100%"; return inpaint(L, o, docMask, function (t) { st.textContent = t; }); })
			.then(function (ok) { busy = false; m.close(true); if (ok) { clearMarks(); PE.toast("Erased. Undo with Ctrl+Z if you want it back."); } })
			.catch(function (e) { busy = false; st.textContent = "Could not erase: " + (e && e.message ? e.message : e); var b = el("button", "pe-btn", "Close"); b.type = "button"; b.addEventListener("click", function () { m.close(true); }); wrap.appendChild(b); });
	}

	/* ---------- marks (what to erase) ---------- */
	function ensureMarks() { var d = PE.doc; if (!d) return null; if (!marks || marks.width !== d.w || marks.height !== d.h) marks = mk(d.w, d.h); return marks; }
	function clearMarks() { if (marks) marks.getContext("2d").clearRect(0, 0, marks.width, marks.height); PE.invalidateOverlay(); }
	function marksMask() { var d = PE.doc; if (!marks || marks.width !== d.w || marks.height !== d.h) return null; var id = marks.getContext("2d").getImageData(0, 0, d.w, d.h).data, m = new Uint8Array(d.w * d.h), any = false; for (var i = 0; i < m.length; i++) if (id[i * 4 + 3] > 127) { m[i] = 255; any = true; } return any ? m : null; }
	PE.aiEraseRun = function () { var m = marksMask(); if (!m && PE.sel) m = PE.selMask().slice ? new Uint8Array(PE.selMask()) : null; if (!m) { PE.toast("Paint over the object you want to remove first (or make a selection)"); return; } process(m); };
	function seg(a, b, o) { var x = marks.getContext("2d"); x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = PE.opt.objerase.size; if (o.alt) { x.globalCompositeOperation = "destination-out"; } x.strokeStyle = "#ff2d2d"; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); x.globalCompositeOperation = "source-over"; }
	PE.defTool({ id: "objerase", name: "Object Erase (AI)", key: "j", icon: "🧽", opts: { size: 40, auto: false },
		ui: [{ k: "size", label: "Brush size", type: "range", min: 4, max: 300, step: 1, unit: "px" }, { k: "auto", label: "Erase when I release", type: "check" }, { type: "button", label: "✨ Erase marked area (Enter)", act: function () { PE.aiEraseRun(); } }, { type: "button", label: "Use selection", act: function () { if (!PE.sel) { PE.toast("Make a selection first"); return; } ensureMarks(); var x = marks.getContext("2d"); x.drawImage(PE.sel.c, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = "#ff2d2d"; x.fillRect(0, 0, marks.width, marks.height); x.globalCompositeOperation = "source-over"; PE.invalidateOverlay(); } }, { type: "button", label: "Clear marks (Esc)", act: clearMarks }],
		hint: "Paint over the object (Alt = un-paint), then press Enter or the Erase button. AI fills the area from its surroundings. Works best on small objects against plain or repeating backgrounds.",
		cursorSize: function () { return PE.opt.objerase.size; },
		down: function (e) { if (busy) return; ensureMarks(); stroke = { last: e }; seg(e, e, e); PE.invalidateOverlay(); },
		move: function (e) { if (!stroke) return; seg(stroke.last, e, e); stroke.last = e; PE.invalidateOverlay(); },
		up: function () { if (!stroke) return; stroke = null; if (PE.opt.objerase.auto) PE.aiEraseRun(); },
		enter: function () { PE.aiEraseRun(); }, cancel: function () { stroke = null; clearMarks(); },
		overlay: function (x) { if (!marks || !PE.doc) return; var s = PE.toScreen(0, 0), z = PE.view.zoom; x.save(); x.globalAlpha = 0.5; x.imageSmoothingEnabled = false; x.drawImage(marks, s.x, s.y, marks.width * z, marks.height * z); x.restore(); } });
})();
