/* MES Photo Editor dialogs: modal + form helpers, adjustments and filters with live preview (levels, curves, ...), image / canvas size, new document, export. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, I = window.MESImg, mk = PE.mk;
	function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	PE.el = el; PE.esc = esc;

	/* ---------- modal ---------- */
	var openModal = null;
	PE.modal = function (o) {
		if (openModal) openModal.close(true);
		var back = el("div", "pe-modal"), box = el("div", "pe-dlg" + (o.wide ? " pe-dlg--wide" : "")), head = el("div", "pe-dlg-h"), body = el("div", "pe-dlg-b"), foot = el("div", "pe-dlg-f");
		head.innerHTML = "<b>" + esc(o.title) + "</b>"; var x = el("button", "pe-x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Close"); head.appendChild(x);
		body.appendChild(o.body); (o.buttons || []).forEach(function (b) { var bt = el("button", "pe-btn" + (b.primary ? " pe-btn--primary" : ""), esc(b.label)); bt.type = "button"; bt.addEventListener("click", function () { b.act(m); }); foot.appendChild(bt); b.el = bt; });
		box.appendChild(head); box.appendChild(body); if (o.buttons) box.appendChild(foot); back.appendChild(box); (PE.els.root || document.body).appendChild(back);
		var m = { el: box, body: body, close: function (silent) { if (openModal !== m) return; openModal = null; back.remove(); document.removeEventListener("keydown", key, true); if (o.onClose) o.onClose(silent); } };
		function key(e) { if (e.key === "Escape") { e.stopPropagation(); m.close(); } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON" && o.buttons) { var p = o.buttons.filter(function (b) { return b.primary; })[0]; if (p) { e.preventDefault(); e.stopPropagation(); p.act(m); } } }
		document.addEventListener("keydown", key, true); x.addEventListener("click", function () { m.close(); }); back.addEventListener("mousedown", function (e) { if (e.target === back && !o.sticky) m.close(); });
		openModal = m; var f = body.querySelector("input,select,button"); if (f && !o.noFocus) setTimeout(function () { f.focus(); }, 30); return m;
	};
	PE.modalOpen = function () { return !!openModal; };
	/* params: [{k,label,type:range|check|select|color|number|seg,min,max,step,val,unit,options}] -> {el,get()} */
	PE.form = function (params, onChange) {
		var root = el("div", "pe-form"), inputs = {};
		params.forEach(function (p) {
			var row = el("label", "pe-row"), lab = el("span", "pe-row-l", esc(p.label)); row.appendChild(lab); var inp, out;
			if (p.type === "check") { inp = el("input"); inp.type = "checkbox"; inp.checked = !!p.val; row.className += " pe-row--check"; }
			else if (p.type === "select") { inp = el("select"); p.options.forEach(function (o) { var op = el("option", null, esc(o[1])); op.value = o[0]; inp.appendChild(op); }); inp.value = p.val; }
			else if (p.type === "color") { inp = el("input"); inp.type = "color"; inp.value = p.val; }
			else if (p.type === "seg") { inp = el("div", "pe-seg"); p.options.forEach(function (o) { var b = el("button", null, esc(o[1])); b.type = "button"; b.dataset.v = o[0]; b.addEventListener("click", function () { inp.value = o[0]; sync(); onChange && onChange(); }); inp.appendChild(b); }); inp.value = p.val; var sync = function () { Array.prototype.forEach.call(inp.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === String(inp.value) ? "true" : "false"); }); }; sync(); }
			else if (p.type === "text") { inp = el("input"); inp.type = "text"; inp.value = p.val == null ? "" : p.val; }
			else if (p.type === "number") { inp = el("input"); inp.type = "number"; inp.value = p.val; if (p.min != null) inp.min = p.min; if (p.max != null) inp.max = p.max; if (p.step != null) inp.step = p.step; }
			else { inp = el("input"); inp.type = "range"; inp.min = p.min; inp.max = p.max; inp.step = p.step || 1; inp.value = p.val; out = el("input", "pe-num"); out.type = "number"; out.min = p.min; out.max = p.max; out.step = p.step || 1; out.value = p.val; inp.addEventListener("input", function () { out.value = inp.value; onChange && onChange(); }); out.addEventListener("input", function () { if (out.value !== "") { inp.value = out.value; onChange && onChange(); } }); }
			if (p.type !== "range") { inp.addEventListener("input", function () { onChange && onChange(); }); inp.addEventListener("change", function () { onChange && onChange(); }); }
			row.appendChild(inp); if (out) { row.appendChild(out); } if (p.unit && out) { row.appendChild(el("span", "pe-unit", esc(p.unit))); }
			inputs[p.k] = { inp: inp, p: p, out: out }; root.appendChild(row);
		});
		return { el: root, inputs: inputs, get: function () { var r = {}; params.forEach(function (p) { var i = inputs[p.k].inp; r[p.k] = p.type === "check" ? i.checked : (p.type === "range" || p.type === "number") ? parseFloat(i.value) : i.value; }); return r; },
			set: function (k, v) { var i = inputs[k]; if (!i) return; if (i.p.type === "check") i.inp.checked = v; else i.inp.value = v; if (i.out) i.out.value = v; if (i.p.type === "seg") Array.prototype.forEach.call(i.inp.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === String(v) ? "true" : "false"); }); } };
	};

	/* ---------- live-preview engine for adjustments / filters ---------- */
	function maskProxy(L, pw, ph) {
		if (!PE.sel) return null; var o = PE.origin(L), c = PE.tmp("pmask", L.canvas.width, L.canvas.height); c.getContext("2d").drawImage(PE.sel.c, -o.x, -o.y);
		var s = PE.tmp("pmask2", pw, ph), sx = s.getContext("2d"); sx.drawImage(c, 0, 0, pw, ph); var d = sx.getImageData(0, 0, pw, ph).data, m = new Uint8Array(pw * ph); for (var i = 0; i < m.length; i++) m[i] = d[i * 4 + 3]; return m;
	}
	/* run(data, w, h, scale) mutates RGBA data; returns controller {update(), apply(label), cancel()} */
	function previewer(run, scaleKeysFn) {
		var L = PE.active(); if (!PE.prepare(L, false, true)) return null;
		var w = L.canvas.width, h = L.canvas.height, sc = Math.min(1, 1100 / Math.max(w, h)), pw = Math.max(1, Math.round(w * sc)), ph = Math.max(1, Math.round(h * sc)), base = mk(pw, ph);
		base.getContext("2d").drawImage(L.canvas, 0, 0, pw, ph); var baseData = base.getContext("2d").getImageData(0, 0, pw, ph), mask = maskProxy(L, pw, ph), out = mk(pw, ph), timer = 0;
		function render() { timer = 0; var id = new ImageData(new Uint8ClampedArray(baseData.data), pw, ph); run(id.data, pw, ph, sc); if (mask) P.blendByMask(baseData.data, id.data, mask); out.getContext("2d").putImageData(id, 0, 0); L.preview = out; PE.invalidate(); }
		render();
		return { update: function () { if (!timer) timer = setTimeout(render, 25); }, apply: function (label) { clearTimeout(timer); L.preview = null; PE.applyPixels(L, function (d, W, H) { run(d, W, H, 1); }, label); }, cancel: function () { clearTimeout(timer); L.preview = null; PE.invalidate(); }, L: L };
	}
	function adjustDialog(def) {
		if (!PE.doc || !PE.active()) { PE.toast("Open an image first"); return; }
		if (!def.params || !def.params.length) { PE.applyPixels(PE.active(), function (d, w, h) { def.fn(d, w, h, {}, 1); }, def.title); return; }
		var f, pv, saved = PE.savedParams[def.id] || {}; def.params.forEach(function (p) { if (saved[p.k] != null) p.val = saved[p.k]; });
		var wrap = el("div"); f = PE.form(def.params, function () { pv && pv.update(); }); wrap.appendChild(f.el);
		var scaleKeys = def.scaleKeys || [];
		pv = previewer(function (d, w, h, sc) { var p = f.get(); scaleKeys.forEach(function (k) { p[k] *= sc; }); def.fn(d, w, h, p, sc); });
		if (!pv) return;
		var done = false;
		PE.modal({ title: def.title, body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [
			{ label: "Reset", act: function () { def.params.forEach(function (p) { f.set(p.k, p.def != null ? p.def : p.val); }); pv.update(); } }, { label: "Cancel", act: function (m) { m.close(); } },
			{ label: "Apply", primary: true, act: function (m) { done = true; PE.savedParams[def.id] = f.get(); pv.apply(def.title); m.close(); } }] });
	}
	PE.savedParams = {};
	PE.adjustDialog = adjustDialog;

	function P2(k, label, min, max, val, step, unit) { return { k: k, label: label, type: "range", min: min, max: max, val: val, def: val, step: step || 1, unit: unit }; }
	PE.ADJUST = [
		{ id: "bc", title: "Brightness / Contrast", params: [P2("b", "Brightness", -100, 100, 0), P2("c", "Contrast", -100, 100, 0)], fn: function (d, w, h, p) { P.brightnessContrast(d, p.b, p.c); } },
		{ id: "levels", title: "Levels…", custom: "levels" }, { id: "curves", title: "Curves…", custom: "curves" },
		{ id: "exposure", title: "Exposure", params: [P2("ev", "Exposure (stops)", -3, 3, 0, 0.05), P2("off", "Offset", -0.5, 0.5, 0, 0.01), P2("g", "Gamma", 0.2, 3, 1, 0.01)], fn: function (d, w, h, p) { P.exposure(d, p.ev, p.off, p.g); } },
		{ id: "hs", title: "Hue / Saturation / Lightness", params: [P2("h", "Hue", -180, 180, 0, 1, "°"), P2("s", "Saturation", -100, 100, 0), P2("l", "Lightness", -100, 100, 0)], fn: function (d, w, h, p) { P.hueSat(d, p.h, p.s, p.l); } },
		{ id: "vibrance", title: "Vibrance", params: [P2("v", "Vibrance", -100, 100, 40)], fn: function (d, w, h, p) { P.vibrance(d, p.v); } },
		{ id: "temp", title: "Temperature / Tint", params: [P2("t", "Warm ↔ Cool", -100, 100, 0), P2("tint", "Green ↔ Magenta", -100, 100, 0)], fn: function (d, w, h, p) { P.temperature(d, p.t, p.tint); } },
		{ id: "threshold", title: "Threshold (black & white)", params: [P2("t", "Threshold", 1, 255, 128)], fn: function (d, w, h, p) { P.threshold(d, p.t); } },
		{ id: "posterize", title: "Posterize", params: [P2("n", "Levels", 2, 32, 5)], fn: function (d, w, h, p) { P.posterize(d, p.n); } },
		{ id: "invert", title: "Invert colours", params: [], fn: function (d) { P.invert(d); } },
		{ id: "gray", title: "Black & white", params: [], fn: function (d) { P.grayscale(d); } },
		{ id: "sepia", title: "Sepia", params: [], fn: function (d) { P.sepia(d); } },
		{ id: "keycolor", title: "Make a colour transparent", params: [{ k: "c", label: "Colour", type: "color", val: "#ffffff" }, P2("tol", "Tolerance", 0, 255, 30), P2("soft", "Soft edge", 0, 128, 20)], fn: function (d, w, h, p) { var c = P.hexToRgb(p.c); for (var i = 0; i < d.length; i += 4) { var df = Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2])); var a = Math.min(1, Math.max(0, (df - p.tol) / (p.soft + 1))); d[i + 3] *= a; } } }
	];
	PE.FILTERS = [
		{ id: "blur", title: "Gaussian Blur", params: [P2("r", "Radius", 0.5, 100, 6, 0.5, "px")], scaleKeys: ["r"], fn: function (d, w, h, p) { P.gaussianBlur(d, w, h, p.r); } },
		{ id: "unsharp", title: "Sharpen (Unsharp Mask)", params: [P2("a", "Amount", 0, 500, 120, 1, "%"), P2("r", "Radius", 0.3, 20, 1.5, 0.1, "px"), P2("t", "Threshold", 0, 50, 0)], scaleKeys: ["r"], fn: function (d, w, h, p) { P.unsharp(d, w, h, p.a, p.r, p.t); } },
		{ id: "noise", title: "Add Noise", params: [P2("a", "Amount", 1, 100, 12, 1, "%"), { k: "mono", label: "Monochrome", type: "check", val: true }], fn: function (d, w, h, p) { P.noise(d, p.a, p.mono, 7); } },
		{ id: "pixelate", title: "Pixelate", params: [P2("s", "Block size", 2, 120, 12, 1, "px")], scaleKeys: ["s"], fn: function (d, w, h, p) { P.pixelate(d, w, h, p.s); } },
		{ id: "vignette", title: "Vignette", params: [P2("a", "Amount", -100, 100, 60), P2("s", "Size", 0, 100, 35), P2("f", "Softness", 1, 100, 60)], fn: function (d, w, h, p) { P.vignette(d, w, h, p.a, p.s, p.f); } },
		{ id: "emboss", title: "Emboss", params: [], fn: function (d, w, h) { P.convolve(d, w, h, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 128); } },
		{ id: "edges", title: "Find Edges", params: [], fn: function (d, w, h) { P.convolve(d, w, h, [-1, -1, -1, -1, 8, -1, -1, -1, -1], 1, 0); } }
	];

	/* ---------- Levels ---------- */
	function histCanvas(hist, w, h, chan) {
		var c = mk(w, h), x = c.getContext("2d"), a = hist, mx = 1; for (var i = 1; i < 255; i++) mx = Math.max(mx, a[i]);
		x.fillStyle = "#16161a"; x.fillRect(0, 0, w, h); x.fillStyle = chan === "r" ? "#e5534b" : chan === "g" ? "#57ab5a" : chan === "b" ? "#539bf5" : "#9aa0a6";
		for (i = 0; i < 256; i++) { var bh = Math.min(h, Math.sqrt(a[i] / mx) * h); x.fillRect(i * w / 256, h - bh, Math.ceil(w / 256) + 0.5, bh); } return c;
	}
	function levelsDialog() {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (!PE.prepare(L, false, true)) return;
		var id = PE.layerData(L), hist = P.histogram(id.data), chan = "l", wrap = el("div", "pe-lev"), hc = el("canvas", "pe-hist"); hc.width = 256; hc.height = 90; wrap.appendChild(hc);
		var f = PE.form([{ k: "ch", label: "Channel", type: "select", options: [["l", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]], val: "l" }, P2("ib", "Input black", 0, 254, 0), P2("g", "Gamma", 0.1, 4, 1, 0.01), P2("iw", "Input white", 1, 255, 255), P2("ob", "Output black", 0, 255, 0), P2("ow", "Output white", 0, 255, 255)], function () { drawH(); pv.update(); });
		wrap.appendChild(f.el); var auto = el("button", "pe-btn", "Auto"); auto.type = "button"; wrap.appendChild(auto);
		function drawH() { var ch = f.get().ch; hc.getContext("2d").drawImage(histCanvas(hist[ch], 256, 90, ch), 0, 0); }
		auto.addEventListener("click", function () { var r = P.autoLevels(hist[f.get().ch], 0.005); f.set("ib", r.black); f.set("iw", r.white); pv.update(); });
		var pv = previewer(function (d) { var p = f.get(), lut = P.levelsLUT(Math.min(p.ib, p.iw - 1), p.iw, p.g, p.ob, p.ow), id = P.identityLUT(); if (p.ch === "l") P.applyLUT(d, lut); else P.applyLUT(d, p.ch === "r" ? lut : id, p.ch === "g" ? lut : id, p.ch === "b" ? lut : id); }); if (!pv) return; drawH();
		var done = false; PE.modal({ title: "Levels", body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { done = true; pv.apply("Levels"); m.close(); } }] });
	}
	/* ---------- Curves ---------- */
	function curvesDialog() {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (!PE.prepare(L, false, true)) return;
		var S = 256, cv = el("canvas", "pe-curve"); cv.width = S; cv.height = S; var pts = { l: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] }, chan = "l", drag = -1;
		var wrap = el("div", "pe-cur"), tabs = el("div", "pe-seg"); [["l", "RGB"], ["r", "Red"], ["g", "Green"], ["b", "Blue"]].forEach(function (c) { var b = el("button", null, c[1]); b.type = "button"; b.dataset.c = c[0]; b.addEventListener("click", function () { chan = c[0]; sync(); draw(); }); tabs.appendChild(b); });
		function sync() { Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.c === chan ? "true" : "false"); }); } sync();
		wrap.appendChild(tabs); wrap.appendChild(cv); var hint = el("div", "pe-hint2", "Click the line to add a point, drag to bend the curve, double-click a point to remove it."); wrap.appendChild(hint);
		function draw() {
			var x = cv.getContext("2d"); x.fillStyle = "#16161a"; x.fillRect(0, 0, S, S); x.strokeStyle = "#2c2c33"; x.lineWidth = 1; x.beginPath(); for (var i = 1; i < 4; i++) { x.moveTo(i * S / 4, 0); x.lineTo(i * S / 4, S); x.moveTo(0, i * S / 4); x.lineTo(S, i * S / 4); } x.stroke();
			x.strokeStyle = "#555"; x.beginPath(); x.moveTo(0, S); x.lineTo(S, 0); x.stroke();
			var lut = P.curveLUT(pts[chan]); x.strokeStyle = chan === "r" ? "#e5534b" : chan === "g" ? "#57ab5a" : chan === "b" ? "#539bf5" : "#fff"; x.lineWidth = 2; x.beginPath(); for (i = 0; i < 256; i++) { var py = S - lut[i]; i ? x.lineTo(i, py) : x.moveTo(i, py); } x.stroke();
			pts[chan].forEach(function (p) { x.fillStyle = "#fff"; x.strokeStyle = "#1a73e8"; x.lineWidth = 2; x.beginPath(); x.arc(p[0], S - p[1], 4.5, 0, 6.2832); x.fill(); x.stroke(); });
		}
		function pos(e) { var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(255, Math.round((e.clientX - r.left) / r.width * S))), Math.max(0, Math.min(255, Math.round(255 - (e.clientY - r.top) / r.height * S)))]; }
		cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); var p = pos(e), a = pts[chan], best = -1, bd = 12; a.forEach(function (q, i) { var d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } }); if (best < 0) { a.push(p); a.sort(function (u, v) { return u[0] - v[0]; }); best = a.indexOf(p); } drag = best; draw(); pv.update(); });
		cv.addEventListener("pointermove", function (e) { if (drag < 0) return; var a = pts[chan], p = pos(e), q = a[drag]; if (drag > 0 && drag < a.length - 1) { p[0] = Math.max(a[drag - 1][0] + 1, Math.min(a[drag + 1][0] - 1, p[0])); q[0] = p[0]; } else if (drag === 0) p[0] = Math.min(p[0], a[1][0] - 1), q[0] = p[0]; else p[0] = Math.max(p[0], a[a.length - 2][0] + 1), q[0] = p[0]; q[1] = p[1]; draw(); pv.update(); });
		cv.addEventListener("pointerup", function () { drag = -1; });
		cv.addEventListener("dblclick", function (e) { var p = pos(e), a = pts[chan]; for (var i = 1; i < a.length - 1; i++) if (Math.hypot(a[i][0] - p[0], a[i][1] - p[1]) < 12) { a.splice(i, 1); draw(); pv.update(); return; } });
		var pv = previewer(function (d) { var l = P.curveLUT(pts.l), r = P.curveLUT(pts.r), g = P.curveLUT(pts.g), b = P.curveLUT(pts.b); var R = new Uint8Array(256), G = new Uint8Array(256), B = new Uint8Array(256); for (var i = 0; i < 256; i++) { R[i] = l[r[i]]; G[i] = l[g[i]]; B[i] = l[b[i]]; } P.applyLUT(d, R, G, B); }); if (!pv) return; draw();
		var done = false; PE.modal({ title: "Curves", body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [{ label: "Reset", act: function () { pts = { l: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] }; draw(); pv.update(); } }, { label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { done = true; pv.apply("Curves"); m.close(); } }] });
	}
	PE.runAdjust = function (id) {
		var a = PE.ADJUST.concat(PE.FILTERS).filter(function (x) { return x.id === id; })[0]; if (!a) return;
		if (a.custom === "levels") levelsDialog(); else if (a.custom === "curves") curvesDialog(); else adjustDialog(a);
	};

	/* ---------- image size / canvas size ---------- */
	PE.dlgImageSize = function () {
		var d = PE.doc; if (!d) return; var ratio = d.w / d.h, wrap = el("div");
		var f = PE.form([{ k: "w", label: "Width", type: "number", val: d.w, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: d.h, min: 1, max: PE.MAXPX }, { k: "lock", label: "Keep proportions", type: "check", val: true }, { k: "pct", label: "Scale", type: "range", min: 5, max: 400, step: 1, val: 100, unit: "%" }], function () { });
		wrap.appendChild(f.el); wrap.appendChild(el("p", "pe-hint2", "Current size: " + d.w + " × " + d.h + " px. Shrinking is smooth (it uses high-quality resampling)."));
		var I1 = f.inputs; I1.w.inp.addEventListener("input", function () { if (I1.lock.inp.checked) { f.set("h", Math.max(1, Math.round(I1.w.inp.value / ratio))); } f.set("pct", Math.round(I1.w.inp.value / d.w * 100)); });
		I1.h.inp.addEventListener("input", function () { if (I1.lock.inp.checked) { f.set("w", Math.max(1, Math.round(I1.h.inp.value * ratio))); } f.set("pct", Math.round(I1.h.inp.value / d.h * 100)); });
		var pc = function () { var p = +I1.pct.inp.value; f.set("w", Math.max(1, Math.round(d.w * p / 100))); f.set("h", Math.max(1, Math.round(d.h * p / 100))); }; I1.pct.inp.addEventListener("input", pc); I1.pct.out.addEventListener("input", pc);
		PE.modal({ title: "Image size", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Resize", primary: true, act: function (m) { var v = f.get(); m.close(); PE.resizeImage(Math.round(v.w), Math.round(v.h)); } }] });
	};
	PE.dlgCanvasSize = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div"), anchor = [0.5, 0.5];
		var f = PE.form([{ k: "w", label: "Width", type: "number", val: d.w, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: d.h, min: 1, max: PE.MAXPX }, { k: "fill", label: "New area", type: "select", options: [["none", "Transparent"], ["bg", "Background colour"], ["fg", "Foreground colour"], ["white", "White"], ["black", "Black"]], val: "none" }], null);
		wrap.appendChild(f.el); var grid = el("div", "pe-anchor"); for (var i = 0; i < 9; i++) { (function (i) { var b = el("button", null, i === 4 ? "●" : ""); b.type = "button"; b.setAttribute("aria-pressed", i === 4 ? "true" : "false"); b.addEventListener("click", function () { anchor = [(i % 3) / 2, Math.floor(i / 3) / 2]; Array.prototype.forEach.call(grid.children, function (c, j) { c.setAttribute("aria-pressed", j === i ? "true" : "false"); c.textContent = j === i ? "●" : ""; }); }); grid.appendChild(b); })(i); }
		var row = el("div", "pe-row"); row.appendChild(el("span", "pe-row-l", "Anchor")); row.appendChild(grid); wrap.appendChild(row);
		PE.modal({ title: "Canvas size", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { var v = f.get(); m.close(); PE.canvasSize(v.w, v.h, anchor[0], anchor[1], v.fill === "none" ? null : v.fill === "bg" ? PE.bg : v.fill === "fg" ? PE.fg : v.fill); } }] });
	};

	/* ---------- new document ---------- */
	PE.PRESETS = [["Full HD 1920 × 1080", 1920, 1080], ["HD 1280 × 720 (YouTube thumbnail)", 1280, 720], ["4K 3840 × 2160", 3840, 2160], ["Social share 1200 × 630", 1200, 630], ["Square post 1080 × 1080", 1080, 1080], ["Portrait post 1080 × 1350", 1080, 1350], ["Story / Reel 1080 × 1920", 1080, 1920], ["X / Twitter post 1600 × 900", 1600, 900], ["Banner 1500 × 500", 1500, 500], ["A4 at 300 dpi 2480 × 3508", 2480, 3508], ["Icon 512 × 512", 512, 512], ["Small 800 × 600", 800, 600]];
	PE.dlgNew = function () {
		var wrap = el("div"), f = PE.form([{ k: "preset", label: "Preset", type: "select", options: [["", "Custom"]].concat(PE.PRESETS.map(function (p, i) { return [String(i), p[0]]; })), val: "0" }, { k: "w", label: "Width", type: "number", val: 1920, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: 1080, min: 1, max: PE.MAXPX }, { k: "bg", label: "Background", type: "select", options: [["#ffffff", "White"], ["none", "Transparent"], ["fg", "Foreground colour"], ["bgc", "Background colour"], ["#000000", "Black"]], val: "#ffffff" }], function () { var v = f.get(); if (v.preset !== "" && PE.PRESETS[+v.preset]) { f.set("w", PE.PRESETS[+v.preset][1]); f.set("h", PE.PRESETS[+v.preset][2]); } });
		wrap.appendChild(f.el);
		PE.modal({ title: "New image", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Create", primary: true, act: function (m) { var v = f.get(); m.close(); PE.newDoc(v.w, v.h, v.bg === "none" ? null : v.bg === "fg" ? PE.fg : v.bg === "bgc" ? PE.bg : v.bg, "Untitled"); PE.setTool("move"); } }] });
	};

	/* ---------- export ---------- */
	PE.dlgExport = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div", "pe-exp"), saved = PE.savedParams.export || { fmt: "png", q: 90, scale: 100, bg: "#ffffff", name: d.name };
		var f = PE.form([{ k: "fmt", label: "Format", type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }, { k: "scale", label: "Scale", type: "range", min: 10, max: 400, step: 1, val: saved.scale, unit: "%" }, { k: "bg", label: "Background (JPEG)", type: "color", val: saved.bg }, { k: "name", label: "File name", type: "text", val: saved.name }], function () { vis(); est(); });
		wrap.appendChild(f.el); var info = el("div", "pe-exp-info", ""); wrap.appendChild(info);
		function vis() { var v = f.get(), F = I.FORMATS[v.fmt]; f.inputs.q.inp.closest(".pe-row").style.display = F.lossy ? "" : "none"; f.inputs.bg.inp.closest(".pe-row").style.display = F.alpha ? "none" : ""; }
		var t = 0, token = 0; function est() { clearTimeout(t); t = setTimeout(function () { var v = f.get(), my = ++token; info.textContent = "Calculating…"; PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }).then(function (b) { if (my !== token) return; info.innerHTML = "<b>" + Math.round(d.w * v.scale / 100) + " × " + Math.round(d.h * v.scale / 100) + " px</b> · " + I.formatBytes(b.size); }).catch(function (e) { info.textContent = e.message; }); }, 250); }
		vis(); est();
		function getBlob(v) { return PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }); }
		PE.modal({ title: "Export image", body: wrap, buttons: [{ label: "Copy to clipboard", act: function (m) { var v = f.get(); PE.exportBlob("png", 1, { scale: v.scale / 100 }).then(function (b) { return navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); }).then(function () { PE.toast("Copied as PNG"); }).catch(function () { PE.toast("This browser can't copy images"); }); } },
			{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download", primary: true, act: function (m) { var v = f.get(); PE.savedParams.export = v; getBlob(v).then(function (b) { PE.download(b, I.cleanFileName(v.name || "image") + "." + I.FORMATS[v.fmt].ext); PE.toast("Saved"); m.close(); }).catch(function (e) { PE.toast(e.message); }); } }] });
	};
	/* ---------- layer effects (new layer under the active one) + round corners + straighten ---------- */
	function flatLayer(L) { var c = mk(L.canvas.width, L.canvas.height); PE.drawLayer(c.getContext("2d"), Object.assign({}, L, { opacity: 1, blend: "source-over", live: null, preview: null }), [1, 0, 0, 1, 0, 0], "fl", c.width, c.height); return c; }
	function effectDialog(kind) {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (L.locked) { PE.toast("This layer is locked"); return; }
		var shadow = kind === "shadow", params = shadow ? [{ k: "c", label: "Colour", type: "color", val: "#000000" }, P2("op", "Opacity", 5, 100, 55, 1, "%"), P2("blur", "Blur", 0, 80, 14, 1, "px"), P2("dx", "Offset X", -80, 80, 6, 1, "px"), P2("dy", "Offset Y", -80, 80, 8, 1, "px")] : [{ k: "c", label: "Colour", type: "color", val: PE.fg }, P2("w", "Width", 1, 60, 6, 1, "px")];
		var wrap = el("div"), f = PE.form(params, null); wrap.appendChild(f.el); wrap.appendChild(el("p", "pe-hint2", shadow ? "Adds a separate shadow layer under this one. Set the offset to 0 and raise the blur for a glow." : "Adds a separate outline layer under this one (follows the shape of the layer's pixels)."));
		PE.modal({ title: shadow ? "Drop shadow" : "Outline", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Add", primary: true, act: function (m) { var v = f.get(); m.close(); makeEffect(L, kind, v); } }] });
	}
	function makeEffect(L, kind, v) {
		PE.bake(L); var src = flatLayer(L), W = src.width, H = src.height, o = PE.origin(L), shadow = kind === "shadow", mg = shadow ? Math.ceil(v.blur * 2 + Math.max(Math.abs(v.dx), Math.abs(v.dy)) + 2) : Math.ceil(v.w + 2), c = mk(W + mg * 2, H + mg * 2), x = c.getContext("2d");
		if (shadow) { var rgb = P.hexToRgb(v.c); x.shadowColor = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + v.op / 100 + ")"; x.shadowBlur = v.blur; x.shadowOffsetX = 20000 + v.dx; x.shadowOffsetY = v.dy; x.drawImage(src, mg - 20000, mg); }
		else { var sil = mk(W, H), sx = sil.getContext("2d"); sx.drawImage(src, 0, 0); sx.globalCompositeOperation = "source-in"; sx.fillStyle = v.c; sx.fillRect(0, 0, W, H); var steps = Math.max(16, Math.round(v.w * 6)); for (var i = 0; i < steps; i++) { var a = i / steps * Math.PI * 2; x.drawImage(sil, mg + Math.cos(a) * v.w, mg + Math.sin(a) * v.w); } x.drawImage(sil, mg, mg); }
		var N = PE.makeLayer({ canvas: c, x: o.x - mg, y: o.y - mg, name: (shadow ? "Shadow of " : "Outline of ") + L.name }); PE.addLayer(N, PE.indexOf(L)); PE.setActive(L.id); PE.commit(shadow ? "Drop shadow" : "Outline");
	}
	PE.dlgEffect = effectDialog;
	PE.dlgRoundCorners = function () {
		var L = PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; } if (!PE.prepare(L, false, true)) return;
		var w = L.canvas.width, h = L.canvas.height, mx = Math.floor(Math.min(w, h) / 2), wrap = el("div"), f = PE.form([P2("r", "Radius", 0, mx, Math.min(24, mx), 1, "px")], function () { pv.update(); }); wrap.appendChild(f.el);
		function round(d, W, Hh, sc) { var r = f.get().r * sc, c = mk(W, Hh), x = c.getContext("2d"); x.putImageData(new ImageData(d, W, Hh), 0, 0); x.globalCompositeOperation = "destination-in"; x.beginPath(); x.moveTo(r, 0); x.arcTo(W, 0, W, Hh, r); x.arcTo(W, Hh, 0, Hh, r); x.arcTo(0, Hh, 0, 0, r); x.arcTo(0, 0, W, 0, r); x.closePath(); x.fill(); d.set(x.getImageData(0, 0, W, Hh).data); }
		var pv = previewer(round); if (!pv) return; var done = false;
		PE.modal({ title: "Round corners", body: wrap, noFocus: true, onClose: function () { if (!done) pv.cancel(); }, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { done = true; pv.apply("Round corners"); m.close(); } }] });
	};
	PE.dlgStraighten = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div"), f = PE.form([P2("a", "Angle", -45, 45, 0, 0.1, "°"), { k: "ex", label: "Grow canvas to fit", type: "check", val: false }], null); wrap.appendChild(f.el); wrap.appendChild(el("p", "pe-hint2", "Rotates every layer about the centre of the image. Use it to level a tilted horizon. Without “Grow canvas”, the corners are cropped."));
		PE.modal({ title: "Rotate / straighten image", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Rotate", primary: true, act: function (m) { var v = f.get(); m.close(); PE.rotateArbitrary(v.a, v.ex); } }] });
	};
	PE.rotateArbitrary = function (deg, expand) {
		if (!deg) return; var d = PE.doc, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), W = d.w, H = d.h, nw = W, nh = H;
		if (expand) { nw = Math.ceil(Math.abs(W * c) + Math.abs(H * s)); nh = Math.ceil(Math.abs(W * s) + Math.abs(H * c)); }
		d.layers.forEach(function (L) { var dx = L.cx - W / 2, dy = L.cy - H / 2; L.cx = nw / 2 + dx * c - dy * s; L.cy = nh / 2 + dx * s + dy * c; L.rot += a; });
		d.w = nw; d.h = nh; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Rotate " + deg + "°"); PE.fit();
	};

	PE.download = function (blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); };
})();
