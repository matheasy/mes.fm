/* MES Photo Editor dialogs: modal + form helpers, adjustments and filters with live preview (levels, curves, ...), image / canvas size, new document, export. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, I = window.MESImg, mk = PE.mk;
	function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	PE.el = el; PE.esc = esc;

	/* ---------- "?" help buttons: a small round button that opens a short explanation next to it ---------- */
	var helpEl = null;
	function closeHelp2() { if (helpEl) { helpEl.remove(); helpEl = null; } }
	PE.helpBtn = function (title, text) {
		var b = el("button", "pe-qh", "?"); b.type = "button"; b.title = text.replace(/<[^>]+>/g, "").slice(0, 160); b.setAttribute("aria-label", "What is " + title + "?");
		b.addEventListener("click", function (e) {
			e.preventDefault(); e.stopPropagation(); var same = helpEl && helpEl._b === b; closeHelp2(); if (same) return;
			var root = PE.els.root || document.body, h = el("div", "pe-qpop"), r = b.getBoundingClientRect(), rr = root.getBoundingClientRect();
			h.innerHTML = "<b>" + esc(title) + "</b><div>" + text + "</div>"; h._b = b; root.appendChild(h); helpEl = h;
			var x = Math.min(Math.max(4, r.left - rr.left - 10), rr.width - h.offsetWidth - 6), y = r.bottom - rr.top + 6; if (y + h.offsetHeight > rr.height - 4) y = Math.max(4, r.top - rr.top - h.offsetHeight - 6); h.style.left = x + "px"; h.style.top = y + "px";
		});
		return b;
	};
	document.addEventListener("mousedown", function (e) { if (helpEl && !(e.target.closest && (e.target.closest(".pe-qpop") || e.target.closest(".pe-qh")))) closeHelp2(); }, true);
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && helpEl) { closeHelp2(); e.stopPropagation(); } }, true);

	/* ---------- modal ---------- */
	var openModal = null;
	PE.modal = function (o) {
		if (openModal) openModal.close(true);
		var back = el("div", "pe-modal"), box = el("div", "pe-dlg" + (o.wide ? " pe-dlg--wide" : "") + (o.cls ? " " + o.cls : "")), head = el("div", "pe-dlg-h"), body = el("div", "pe-dlg-b"), foot = el("div", "pe-dlg-f");
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
			var row = el("label", "pe-row"), lab = el("span", "pe-row-l", esc(p.label)); row.appendChild(lab); if (p.help) lab.appendChild(PE.helpBtn(p.label, p.help)); var inp, out;
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
		var d = PE.doc; if (!d) return; var wrap = el("div", "pe-cs"), ax = 0.5, ay = 0.5, R = { x: 0, y: 0, w: d.w, h: d.h };
		var thumb = null; try { thumb = PE.flatten(); } catch (e) {}
		var cv = el("canvas", "pe-cs-cv"); cv.width = 440; cv.height = 280; wrap.appendChild(cv); var cx = cv.getContext("2d");
		var f = PE.form([{ k: "w", label: "Width", help: "The width of the canvas in pixels. Bigger than the picture adds empty space; smaller crops the picture. Or drag the purple edges in the preview.", type: "number", val: d.w, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", help: "The height of the canvas in pixels.", type: "number", val: d.h, min: 1, max: PE.MAXPX }, { k: "fill", label: "New area", help: "What fills any extra space the bigger canvas adds. Transparent keeps it see-through (use PNG or WebP to keep that).", type: "select", options: [["none", "Transparent"], ["bg", "Background colour"], ["fg", "Foreground colour"], ["white", "White"], ["black", "Black"]], val: "none" }], null);
		wrap.appendChild(f.el);
		var chips = el("div", "pe-cs-chips"); chips.appendChild(el("span", "pe-row-l", "Quick sizes")); chips.appendChild(PE.helpBtn("Quick sizes", "One click to make the canvas exactly as big as: all the visible layers together, just the selected layer, or the current selection. Handy after pasting a picture bigger than the canvas."));
		function chip(label, fn, tip) { var b = el("button", "pe-btn pe-btn--sm", esc(label)); b.type = "button"; b.title = tip; b.addEventListener("click", fn); chips.appendChild(b); }
		function setRect(r) { R = { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) }; sync(); draw(); }
		function union(list) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(function (L) { var b = PE.bounds(L); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }); return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; }
		chip("Fit all visible layers", function () { var r = union(d.layers.filter(function (L) { return !PE.isGroup(L) && PE.effVisible(L); })); if (r) setRect(r); else PE.toast("No visible layers"); }, "Canvas = the box around everything you can see");
		chip("Fit selected layer", function () { var L = PE.active(), r = L && !PE.isGroup(L) ? union([L]) : null; if (r) setRect(r); else PE.toast("Select a layer first"); }, "Canvas = the box around the selected layer");
		chip("Fit selection", function () { var b = PE.selBounds && PE.selBounds(); if (b) setRect(b); else PE.toast("Make a selection first"); }, "Canvas = the box around the current selection");
		chip("Reset", function () { ax = ay = 0.5; setRect({ x: 0, y: 0, w: d.w, h: d.h }); }, "Back to the current size");
		wrap.appendChild(chips);
		var grid = el("div", "pe-anchor"); for (var i = 0; i < 9; i++) { (function (i) { var b = el("button", null, i === 4 ? "●" : ""); b.type = "button"; b.setAttribute("aria-pressed", i === 4 ? "true" : "false"); b.title = "Where the current picture sits inside the new canvas"; b.addEventListener("click", function () { ax = (i % 3) / 2; ay = Math.floor(i / 3) / 2; Array.prototype.forEach.call(grid.children, function (c, j) { c.setAttribute("aria-pressed", j === i ? "true" : "false"); c.textContent = j === i ? "●" : ""; }); fromInputs(); }); grid.appendChild(b); })(i); }
		var row = el("div", "pe-row"); var al = el("span", "pe-row-l", "Anchor"); al.appendChild(PE.helpBtn("Anchor", "When you change the width or height, the anchor decides which side of the picture stays put. Centre grows or shrinks evenly all round; top-left keeps the top-left corner and adds or removes space at the right and bottom.")); row.appendChild(al); row.appendChild(grid); wrap.appendChild(row);
		var info = el("p", "pe-hint2"); wrap.appendChild(info);
		function sync() { f.set("w", R.w); f.set("h", R.h); info.textContent = "Current " + d.w + " × " + d.h + " px → new " + R.w + " × " + R.h + " px" + (R.w * R.h > PE.MAXAREA ? " (too large)" : ""); }
		function fromInputs() { var v = f.get(), w = Math.max(1, Math.round(v.w || 1)), h = Math.max(1, Math.round(v.h || 1)); R = { x: Math.round(-(w - d.w) * ax), y: Math.round(-(h - d.h) * ay), w: w, h: h }; info.textContent = "Current " + d.w + " × " + d.h + " px → new " + w + " × " + h + " px"; draw(); }
		f.inputs.w.inp.addEventListener("input", fromInputs); f.inputs.h.inp.addEventListener("input", fromInputs);
		var sc = 1, ox = 0, oy = 0;
		function view() { var x0 = Math.min(0, R.x), y0 = Math.min(0, R.y), x1 = Math.max(d.w, R.x + R.w), y1 = Math.max(d.h, R.y + R.h), pw = x1 - x0, ph = y1 - y0, m = 26; sc = Math.min((cv.width - m * 2) / pw, (cv.height - m * 2) / ph); ox = (cv.width - pw * sc) / 2 - x0 * sc; oy = (cv.height - ph * sc) / 2 - y0 * sc; }
		function draw() {
			view(); cx.clearRect(0, 0, cv.width, cv.height); cx.fillStyle = "#101014"; cx.fillRect(0, 0, cv.width, cv.height);
			// new canvas area (checker so transparent space reads as empty)
			var nx = ox + R.x * sc, ny = oy + R.y * sc, nw = R.w * sc, nh = R.h * sc; cx.save(); cx.beginPath(); cx.rect(nx, ny, nw, nh); cx.clip(); for (var yy = 0; yy < nh; yy += 10) for (var xx = 0; xx < nw; xx += 10) { cx.fillStyle = ((xx + yy) / 10) % 2 ? "#2a2a33" : "#33333d"; cx.fillRect(nx + xx, ny + yy, 10, 10); } cx.restore();
			if (thumb) { cx.imageSmoothingQuality = "high"; cx.drawImage(thumb, ox, oy, d.w * sc, d.h * sc); } else { cx.fillStyle = "#555"; cx.fillRect(ox, oy, d.w * sc, d.h * sc); }
			cx.strokeStyle = "rgba(255,255,255,0.45)"; cx.setLineDash([4, 3]); cx.lineWidth = 1; cx.strokeRect(ox + 0.5, oy + 0.5, d.w * sc, d.h * sc); cx.setLineDash([]);   // the current picture's edge
			cx.fillStyle = "rgba(0,0,0,0.5)"; // darken what will be cropped away
			cx.save(); cx.beginPath(); cx.rect(ox, oy, d.w * sc, d.h * sc); cx.rect(nx, ny, nw, nh); cx.clip("evenodd"); cx.fillRect(ox, oy, d.w * sc, d.h * sc); cx.restore();
			cx.strokeStyle = "#a78bfa"; cx.lineWidth = 2; cx.strokeRect(nx, ny, nw, nh);
			cx.fillStyle = "#a78bfa"; cx.strokeStyle = "#fff"; cx.lineWidth = 1.5; handles(nx, ny, nw, nh).forEach(function (h) { cx.beginPath(); cx.rect(h.x - 5, h.y - 5, 10, 10); cx.fill(); cx.stroke(); });
		}
		function handles(nx, ny, nw, nh) { return [{ k: "nw", x: nx, y: ny }, { k: "n", x: nx + nw / 2, y: ny }, { k: "ne", x: nx + nw, y: ny }, { k: "e", x: nx + nw, y: ny + nh / 2 }, { k: "se", x: nx + nw, y: ny + nh }, { k: "s", x: nx + nw / 2, y: ny + nh }, { k: "sw", x: nx, y: ny + nh }, { k: "w", x: nx, y: ny + nh / 2 }]; }
		var drag = null;
		function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
		function hit(p) { var hs = handles(ox + R.x * sc, oy + R.y * sc, R.w * sc, R.h * sc); for (var i = 0; i < hs.length; i++) if (Math.abs(p.x - hs[i].x) < 9 && Math.abs(p.y - hs[i].y) < 9) return hs[i].k; return null; }
		var CUR = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
		cv.addEventListener("pointermove", function (e) {
			var p = pos(e); if (!drag) { var k = hit(p); cv.style.cursor = k ? CUR[k] : "default"; return; }
			var dx = Math.round((p.x - drag.p.x) / sc), dy = Math.round((p.y - drag.p.y) / sc), r = { x: drag.R.x, y: drag.R.y, w: drag.R.w, h: drag.R.h }, k = drag.k;
			if (k.indexOf("e") >= 0) r.w = Math.max(1, drag.R.w + dx); if (k.indexOf("s") >= 0) r.h = Math.max(1, drag.R.h + dy);
			if (k.indexOf("w") >= 0) { r.w = Math.max(1, drag.R.w - dx); r.x = drag.R.x + drag.R.w - r.w; } if (k.indexOf("n") >= 0) { r.h = Math.max(1, drag.R.h - dy); r.y = drag.R.y + drag.R.h - r.h; }
			if (e.shiftKey && k.length === 2) { var asp = drag.R.w / drag.R.h; r.h = Math.max(1, Math.round(r.w / asp)); if (k.indexOf("n") >= 0) r.y = drag.R.y + drag.R.h - r.h; }
			R = r; sync(); draw();
		});
		cv.addEventListener("pointerdown", function (e) { var p = pos(e), k = hit(p); if (!k) return; cv.setPointerCapture(e.pointerId); drag = { k: k, p: p, R: { x: R.x, y: R.y, w: R.w, h: R.h } }; });
		cv.addEventListener("pointerup", function () { drag = null; }); cv.addEventListener("pointercancel", function () { drag = null; });
		wrap.appendChild(el("p", "pe-hint2", "Drag the purple handles to resize the canvas (hold Shift on a corner to keep the shape). The dashed line is your picture's current edge; darkened parts will be cropped away."));
		sync(); draw();
		PE.modal({ title: "Canvas size", wide: true, body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Apply", primary: true, act: function (m) { var v = f.get(); m.close(); PE.canvasRect(R.x, R.y, R.w, R.h, v.fill === "none" ? null : v.fill === "bg" ? PE.bg : v.fill === "fg" ? PE.fg : v.fill); } }] });
	};

	/* ---------- new solid colour layer (white, black, any colour) ---------- */
	PE.dlgFillLayer = function () {
		var d = PE.doc; if (!d) { PE.toast("Open or create an image first"); return; } var wrap = el("div"), f = PE.form([{ k: "c", label: "Colour", help: "The colour the whole layer is filled with. Pick any colour, or use the quick buttons below.", type: "color", val: "#ffffff" }, { k: "where", label: "Put it", help: "Above the selected layer, or at the very bottom as a background (it then sits behind everything).", type: "select", options: [["above", "Above the selected layer"], ["bottom", "At the bottom (as a background)"]], val: "bottom" }, { k: "name", label: "Layer name", type: "text", val: "Fill" }], null);
		wrap.appendChild(f.el); var q = el("div", "pe-cs-chips"); q.appendChild(el("span", "pe-row-l", "Quick colours"));
		[["White", "#ffffff"], ["Black", "#000000"], ["Foreground", PE.fg], ["Background", PE.bg], ["Grey", "#808080"], ["Red", "#e53935"], ["Yellow", "#ffeb3b"], ["Green", "#43a047"], ["Blue", "#1e88e5"]].forEach(function (c) { var b = el("button", "pe-btn pe-btn--sm", esc(c[0])); b.type = "button"; b.style.cssText = "border-left:1.1em solid " + c[1]; b.addEventListener("click", function () { f.set("c", c[1]); f.set("name", c[0]); }); q.appendChild(b); });
		wrap.appendChild(q); wrap.appendChild(el("p", "pe-hint2", "Adds a new layer filled with one colour, the size of the image. Use it for a white or coloured background, or put it above other layers and lower its opacity for a tint."));
		PE.modal({ title: "New solid colour layer", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Add layer", primary: true, act: function (m) { var v = f.get(); m.close(); var L = PE.makeLayer({ name: v.name || "Fill" }), x = L.canvas.getContext("2d"); x.fillStyle = v.c; x.fillRect(0, 0, L.canvas.width, L.canvas.height); if (v.where === "bottom") { d.layers.unshift(L); PE.setActive(L.id); PE.emit("layers"); PE.invalidate(); } else PE.addLayer(L); PE.commit("New solid colour layer"); } }] });
	};

	/* ---------- new document ---------- */
	PE.PRESETS = [["Full HD 1920 × 1080", 1920, 1080], ["HD 1280 × 720 (YouTube thumbnail)", 1280, 720], ["4K 3840 × 2160", 3840, 2160], ["Social share 1200 × 630", 1200, 630], ["Square post 1080 × 1080", 1080, 1080], ["Portrait post 1080 × 1350", 1080, 1350], ["Story / Reel 1080 × 1920", 1080, 1920], ["X / Twitter post 1600 × 900", 1600, 900], ["Banner 1500 × 500", 1500, 500], ["A4 at 300 dpi 2480 × 3508", 2480, 3508], ["Icon 512 × 512", 512, 512], ["Small 800 × 600", 800, 600]];
	PE.dlgNew = function () {
		var wrap = el("div"), f = PE.form([{ k: "preset", label: "Preset", type: "select", options: [["", "Custom"]].concat(PE.PRESETS.map(function (p, i) { return [String(i), p[0]]; })), val: "0" }, { k: "w", label: "Width", type: "number", val: 1920, min: 1, max: PE.MAXPX }, { k: "h", label: "Height", type: "number", val: 1080, min: 1, max: PE.MAXPX }, { k: "bg", label: "Background", type: "select", options: [["#ffffff", "White"], ["none", "Transparent"], ["fg", "Foreground colour"], ["bgc", "Background colour"], ["#000000", "Black"]], val: "#ffffff" }], function () { var v = f.get(); if (v.preset !== "" && PE.PRESETS[+v.preset]) { f.set("w", PE.PRESETS[+v.preset][1]); f.set("h", PE.PRESETS[+v.preset][2]); } });
		wrap.appendChild(f.el);
		PE.modal({ title: "New image", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Create", primary: true, act: function (m) { var v = f.get(); m.close(); PE.newDoc(v.w, v.h, v.bg === "none" ? null : v.bg === "fg" ? PE.fg : v.bg === "bgc" ? PE.bg : v.bg, "Untitled"); PE.setTool("move"); } }] });
	};

	/* ---------- export ---------- */
	var HELP_FMT = "<p><b>PNG</b>: perfect quality, keeps transparency. Files are big for photos. Best for screenshots, logos, text, anything with sharp edges or see-through parts.</p><p><b>JPEG</b>: small files for photos, but slightly lossy and no transparency (it fills with the background colour). Works everywhere. Best for photographs and anything you will email or post.</p><p><b>WebP</b>: a newer format that is usually 25-35% smaller than JPEG at the same look, and keeps transparency. Works in all modern browsers and most apps, but some older programs cannot open it.</p>";
	/* the name to suggest for an exported picture: the linked project file, else the document's own name (the opened picture / project), else the first
	   layer's file, else "image" (never "Untitled") */
	PE.docBaseName = function () {
		var d = PE.doc; if (!d) return "image"; var L = PE.projectLink && PE.projectLink(), ok = function (s) { s = String(s || "").trim(); return s && !/^(untitled|image|layer)$/i.test(s) ? s : ""; };
		var n = (L && ok(P.projectBase(L.name))) || ok(d.name) || (d.file && d.file.file && ok(I.baseName(d.file.file)));
		if (!n) d.layers.some(function (k) { return k.src && k.src.file && (n = ok(I.baseName(k.src.file))); });
		return n || "image";
	};
	PE.dlgExport = function () {
		var d = PE.doc; if (!d) return; var wrap = el("div", "pe-exp"), saved = Object.assign({ fmt: "png", q: 90, scale: 100, bg: "#ffffff" }, PE.savedParams.export || {});
		if (saved.pid !== d.pid || !saved.name) saved.name = PE.docBaseName();   // a name typed earlier is kept only for the same project
		var f = PE.form([{ k: "fmt", label: "Format", help: HELP_FMT, type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", help: "How much detail JPEG and WebP keep. Higher looks better but makes a bigger file. 85-92% is a good balance: the picture looks the same and the file is much smaller than PNG. PNG is lossless, so it has no quality setting.", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }, { k: "scale", label: "Scale", help: "Makes the exported picture bigger or smaller than the image you are editing. 100% keeps the size. 50% halves the width and height (a quarter of the pixels), handy for web use; 200% doubles it (the pixels are enlarged, it does not add detail).", type: "range", min: 10, max: 400, step: 1, val: saved.scale, unit: "%" }, { k: "bg", label: "Background (JPEG)", help: "JPEG cannot be see-through. Any transparent parts of your image are filled with this colour. PNG and WebP keep transparency, so they ignore this.", type: "color", val: saved.bg }, { k: "name", label: "File name", help: "The name of the downloaded file, without the ending (the ending comes from the format).", type: "text", val: saved.name }], function () { vis(); est(); });
		wrap.appendChild(f.el); var info = el("div", "pe-exp-info", ""); wrap.appendChild(info);
		function vis() { var v = f.get(), F = I.FORMATS[v.fmt]; f.inputs.q.inp.closest(".pe-row").style.display = F.lossy ? "" : "none"; f.inputs.bg.inp.closest(".pe-row").style.display = F.alpha ? "none" : ""; }
		var t = 0, token = 0; function est() { clearTimeout(t); t = setTimeout(function () { var v = f.get(), my = ++token; info.textContent = "Calculating…"; PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }).then(function (b) { if (my !== token) return; info.innerHTML = "<b>" + Math.round(d.w * v.scale / 100) + " × " + Math.round(d.h * v.scale / 100) + " px</b> · " + I.formatBytes(b.size); }).catch(function (e) { info.textContent = e.message; }); }, 250); }
		vis(); est();
		function getBlob(v) { return PE.exportBlob(v.fmt, v.q / 100, { scale: v.scale / 100, bg: v.bg }); }
		PE.modal({ title: "Export image", body: wrap, buttons: [{ label: "Copy to clipboard", act: function (m) { var v = f.get(); PE.exportBlob("png", 1, { scale: v.scale / 100 }).then(function (b) { return navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); }).then(function () { PE.toast("Copied as PNG"); }).catch(function () { PE.toast("This browser can't copy images"); }); } },
			{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download", primary: true, act: function (m) { var v = f.get(); PE.savedParams.export = Object.assign({ pid: d.pid }, v); getBlob(v).then(function (b) { PE.download(b, I.cleanFileName(v.name || "image") + "." + I.FORMATS[v.fmt].ext); PE.toast("Saved"); m.close(); }).catch(function (e) { PE.toast(e.message); }); } }] });
	};
	/* ---------- export one group as its own image, on a canvas of its own size ---------- */
	PE.dlgExportGroup = function (G) {
		var d = PE.doc; if (!d) return; G = G || PE.active(); while (G && !PE.isGroup(G)) G = d.layers.filter(function (k) { return k.id === G.group; })[0];
		if (!G) { PE.toast("Select a group (or a layer inside one) first"); return; }
		var members = PE.descendants(G).filter(function (k) { return !PE.isGroup(k); }); if (!members.length) { PE.toast("This group has no layers in it"); return; }
		var gb = PE.groupBounds(G), cx0 = Math.floor(gb.x), cy0 = Math.floor(gb.y), cw = Math.max(1, Math.ceil(gb.x + gb.w) - cx0), ch = Math.max(1, Math.ceil(gb.y + gb.h) - cy0);
		var saved = PE.savedParams.groupExport || { fmt: "png", q: 90, area: "contents", fit: "fit", bg: "#ffffff", solid: false }, wrap = el("div", "pe-exp");
		var f = PE.form([{ k: "area", label: "Take from", help: "<p><b>The group's contents</b>: the smallest box around everything in the group (you can use any size below).</p><p><b>The whole canvas</b>: the full image area, with only this group showing.</p>", type: "seg", options: [["contents", "The group's contents"], ["canvas", "The whole canvas"]], val: saved.area },
			{ k: "w", label: "Canvas width", type: "number", min: 1, max: 12000, step: 1, val: cw }, { k: "h", label: "Canvas height", type: "number", min: 1, max: 12000, step: 1, val: ch },
			{ k: "fit", label: "Place the group", help: "<p><b>Fit</b>: scaled to fit inside, nothing cut off.</p><p><b>Fill</b>: scaled to cover the whole canvas, the edges may be cut off.</p><p><b>Actual size</b>: not scaled, centred.</p><p><b>Stretch</b>: squashed to the exact shape.</p>", type: "seg", options: [["fit", "Fit"], ["fill", "Fill"], ["none", "Actual size"], ["stretch", "Stretch"]], val: saved.fit },
			{ k: "solid", label: "Solid background", type: "check", val: saved.solid }, { k: "bg", label: "Background colour", type: "color", val: saved.bg },
			{ k: "fmt", label: "Format", type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }], function () { vis(); });
		wrap.appendChild(f.el); var info = el("p", "pe-hint2", "Exports only this group (" + members.length + " layer" + (members.length > 1 ? "s" : "") + ") as its own picture, on a canvas of the size you choose. Your document is not changed.");
		wrap.appendChild(info);
		var lastArea = saved.area;
		function vis() { var v = f.get(), F = I.FORMATS[v.fmt]; f.inputs.q.inp.closest(".pe-row").style.display = F.lossy ? "" : "none"; var sol = v.solid || !F.alpha; f.inputs.bg.inp.closest(".pe-row").style.display = sol ? "" : "none"; if (v.area !== lastArea) { lastArea = v.area; f.set("w", v.area === "canvas" ? d.w : cw); f.set("h", v.area === "canvas" ? d.h : ch); } }
		vis();
		function render(v) {
			var rx = v.area === "canvas" ? 0 : cx0, ry = v.area === "canvas" ? 0 : cy0, rw = v.area === "canvas" ? d.w : cw, rh = v.area === "canvas" ? d.h : ch;
			var chain = []; for (var g = G; g; g = d.layers.filter(function (k) { return k.id === g.group; })[0]) chain.push(g); var was = chain.map(function (k) { return k.visible; }); chain.forEach(function (k) { k.visible = true; }); PE.relink();
			var src = mk(rw, rh), sx = src.getContext("2d"); sx.imageSmoothingQuality = "high";
			try { d.layers.forEach(function (L) { if (members.indexOf(L) >= 0) PE.drawLayer(sx, L, [1, 0, 0, 1, -rx, -ry], "exp", rw, rh); }); } finally { chain.forEach(function (k, i) { k.visible = was[i]; }); }
			var W = Math.max(1, Math.min(12000, Math.round(v.w))), H = Math.max(1, Math.min(12000, Math.round(v.h))), out = mk(W, H), x = out.getContext("2d"), F = I.FORMATS[v.fmt];
			if (v.solid || !F.alpha) { x.fillStyle = v.bg; x.fillRect(0, 0, W, H); }
			x.imageSmoothingQuality = "high";
			if (v.fit === "stretch") x.drawImage(src, 0, 0, W, H); else { var k = v.fit === "none" ? 1 : v.fit === "fill" ? Math.max(W / rw, H / rh) : Math.min(W / rw, H / rh); x.drawImage(src, (W - rw * k) / 2, (H - rh * k) / 2, rw * k, rh * k); }
			return out;
		}
		PE.modal({ title: "Export group: " + G.name, body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download", primary: true, act: function (m) {
			var v = f.get(), F = I.FORMATS[v.fmt]; PE.savedParams.groupExport = v; render(v).toBlob(function (b) { if (!b || b.type !== F.mime) { PE.toast("This browser can't save " + F.name); return; } PE.download(b, I.cleanFileName(G.name || "group") + "." + F.ext); PE.toast("Saved"); m.close(); }, F.mime, v.q / 100); } }] });
	};
	/* ---------- layer effects (new layer under the active one) + round corners + straighten ---------- */
	function flatLayer(L) { var c = mk(L.canvas.width, L.canvas.height); PE.drawLayer(c.getContext("2d"), Object.assign({}, L, { opacity: 1, blend: "source-over", live: null, preview: null, _p: null }), [1, 0, 0, 1, 0, 0], "fl", c.width, c.height); return c; }
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

	/* ---------- export all comps as a set of pictures (one ZIP) ---------- */
	PE.dlgExportComps = function () {
		var d = PE.doc; if (!d) return; var comps = d.comps || []; if (!comps.length) { PE.toast("Save some comps first (Comps tab, + Save current view)"); return; }
		var saved = PE.savedParams.expc || { fmt: "jpg", q: 90, mode: "doc", w: 1280, pat: "{project}-{n}-{comp}", bg: "#ffffff" };
		var wrap = el("div"), f = PE.form([{ k: "fmt", label: "Format", type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]], val: saved.fmt }, { k: "q", label: "Quality", type: "range", min: 30, max: 100, step: 1, val: saved.q, unit: "%" }, { k: "mode", label: "Size", type: "select", options: [["doc", "Same as the image (" + d.w + " × " + d.h + ")"], ["width", "Fixed width"]], val: saved.mode }, { k: "w", label: "Width (px)", type: "number", val: saved.w, min: 16, max: 8000 }, { k: "bg", label: "Background (JPEG)", type: "color", val: saved.bg }, { k: "pat", label: "File names", type: "text", val: saved.pat }], function () { vis(); });
		wrap.appendChild(f.el); function vis() { var v = f.get(); f.inputs.q.inp.closest(".pe-row").style.display = I.FORMATS[v.fmt].lossy ? "" : "none"; f.inputs.bg.inp.closest(".pe-row").style.display = I.FORMATS[v.fmt].alpha ? "none" : ""; f.inputs.w.inp.closest(".pe-row").style.display = v.mode === "width" ? "" : "none"; } vis();
		var list = el("div", "pe-complist"); comps.forEach(function (c, i) { var r = el("label", "pe-row pe-row--check"); var cb = el("input"); cb.type = "checkbox"; cb.checked = true; cb.dataset.i = i; r.appendChild(el("span", "pe-row-l", esc((i + 1) + ". " + c.name))); r.appendChild(cb); list.appendChild(r); }); wrap.appendChild(el("p", "pe-hint2", "Comps to export:")); wrap.appendChild(list); var st = el("p", "pe-hint2"); wrap.appendChild(st);
		PE.modal({ title: "Export all comps", body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "⬇ Download ZIP", primary: true, act: function (m) {
			var v = f.get(), picked = []; list.querySelectorAll("input").forEach(function (cb) { if (cb.checked) picked.push(comps[+cb.dataset.i]); }); if (!picked.length) { PE.toast("Tick at least one comp"); return; }
			PE.savedParams.expc = v; var back = { st: PE.compCapture() }, files = [], used = {}, F = I.FORMATS[v.fmt], scale = v.mode === "width" ? v.w / d.w : 1, i = 0;
			function next() {
				if (i >= picked.length) { PE.compApplyState(back); PE.emit("comps"); var out = files.length === 1 ? new Blob([files[0].data], { type: F.mime }) : new Blob([I.zipStore(files)], { type: "application/zip" }); PE.download(out, files.length === 1 ? files[0].name : I.cleanFileName(d.name) + "-comps.zip"); PE.toast(files.length + " picture" + (files.length === 1 ? "" : "s") + " saved"); m.close(); return Promise.resolve(); }
				var c = picked[i++]; st.textContent = "Rendering " + i + " of " + picked.length + ": " + c.name; PE.compApplyState(c);
				return new Promise(function (res) { setTimeout(res, 20); }).then(function () { return PE.exportBlob(v.fmt, v.q / 100, { scale: scale, bg: v.bg }); }).then(function (b) { return b.arrayBuffer(); }).then(function (ab) {
					var nm = v.pat.replace(/\{project\}/g, I.baseName(d.name)).replace(/\{n\}/g, String(i)).replace(/\{comp\}/g, c.name); files.push({ name: I.uniqueName(I.cleanFileName(nm) + "." + F.ext, used), data: new Uint8Array(ab) }); return next(); });
			}
			next().catch(function (e) { PE.compApplyState(back); st.textContent = "Could not export: " + (e && e.message ? e.message : e); });
		} }] });
	};

	PE.download = function (blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); };

	/* ---------- share as a link: Litterbox (up to 3 days) with an automatic fallback to the mes.fm 1-hour picture host ---------- */
	function shrinkJpeg(maxBytes) {   // a JPEG of the whole image that fits maxBytes (steps the quality, then the size, down)
		var scale = Math.min(1, 1600 / Math.max(PE.doc.w, PE.doc.h)), q = 0.88, tries = 0;
		return new Promise(function (res, rej) {
			(function step() { PE.exportBlob("jpg", q, { scale: scale, bg: "#ffffff" }).then(function (b) { if (b.size <= maxBytes) return res(b); if (++tries > 10) return rej(new Error("The picture is too big to shrink enough")); if (q > 0.55) q -= 0.1; else scale *= 0.8; step(); }).catch(rej); })();
		});
	}
	PE.dlgShare = function () {
		var d = PE.doc; if (!d) return;
		var wrap = el("div", "pe-exp"), f = PE.form([
			{ k: "host", label: "Send it to", help: "<p><b>Litterbox</b> is a free temporary file host (catbox.moe). It keeps the picture at full quality for the time you choose, up to 3 days.</p><p><b>mes.fm</b> keeps a smaller copy (a JPEG under 700 KB) for exactly 1 hour at a private link. It is the fallback if Litterbox is busy or down, and is deleted automatically.</p>", type: "select", options: [["lb", "Litterbox (up to 3 days, full quality)"], ["mes", "mes.fm (1 hour, shrunk to a small JPEG)"]], val: "lb" },
			{ k: "fmt", label: "Format", help: HELP_FMT, type: "seg", options: [["png", "PNG"], ["jpg", "JPEG"]], val: "png" },
			{ k: "life", label: "Link lasts", help: "How long the link keeps working before the picture is deleted. Only for Litterbox: the mes.fm link always lasts 1 hour.", type: "select", options: [["1h", "1 hour"], ["12h", "12 hours"], ["24h", "1 day"], ["72h", "3 days"]], val: "72h" },
			{ k: "scale", label: "Size", help: "Shrinks the picture before it is uploaded. Smaller uploads faster and fails less often. 100% = the full image.", type: "range", min: 10, max: 100, step: 5, val: 100, unit: "%" }], null);
		wrap.appendChild(f.el);
		wrap.appendChild(el("p", "pe-hint2", "This uploads a copy of the whole image to a free temporary host and gives you a link. <b>Anyone who has the link can see the picture</b>, and it is deleted automatically when the time is up. MES does not keep it. Don't share anything private."));
		wrap.appendChild(el("p", "pe-hint2", "Want a link that never expires? <b>Copy for Snipboard</b> copies the picture and opens <b>snipboard.io</b>: click on that page and press Ctrl+V (Cmd+V on a Mac) and Snipboard gives you its own permanent link. Snipboard has no upload service we can call for you, so that last paste is yours."));
		var out = el("div", "pe-share-out"); wrap.appendChild(out);
		var busy = false, link = "";
		function show(url, note) {
			link = url; out.innerHTML = ""; var inp = el("input"); inp.type = "text"; inp.readOnly = true; inp.value = url; inp.style.cssText = "width:100%;margin-top:.6em"; inp.addEventListener("focus", function () { inp.select(); }); out.appendChild(inp); if (note) out.appendChild(el("p", "pe-hint2", esc(note))); inp.focus(); inp.select();
		}
		function viaLitterbox(v) {
			return PE.exportBlob(v.fmt, 0.92, { scale: v.scale / 100, bg: "#ffffff" }).then(function (b) {
				if (b.size > 190 * 1024 * 1024) throw new Error("Too big: choose a smaller size");
				var fd = new FormData(); fd.append("reqtype", "fileupload"); fd.append("time", v.life); fd.append("fileToUpload", b, "mes-photo." + (v.fmt === "jpg" ? "jpg" : "png"));
				return fetch("https://litterbox.catbox.moe/resources/internals/api.php", { method: "POST", body: fd });
			}).then(function (r) { return r.text().then(function (t) { if (!r.ok || !/^https:\/\//.test(t.trim())) throw new Error("Litterbox said " + r.status + (/^</.test(t.trim()) ? "" : ": " + t.trim().slice(0, 80))); return t.trim(); }); });
		}
		function viaMes() {
			return shrinkJpeg(650000).then(function (b) { return fetch("/api/image-temp", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: b }); })
				.then(function (r) { if (!r.ok) throw new Error("mes.fm said " + r.status); return r.json(); }).then(function (j) { if (!j || !j.url) throw new Error("mes.fm gave no link"); return j.url; });
		}
		var m = PE.modal({ title: "Share as a link", body: wrap, buttons: [{ label: "Close", act: function (m) { m.close(); } },
			{ label: "Copy link", act: function () { if (!link) { PE.toast("Upload first"); return; } (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { PE.toast("Link copied"); }).catch(function () { PE.toast("Select the link and press Ctrl+C"); }); } },
			{ label: "Copy for Snipboard", act: function () {
				var w = window.open("about:blank", "_blank"), v = f.get();   // opened inside the click so a pop-up blocker lets it through
				// the clipboard item is handed over as a PROMISE inside the click: browsers only allow the copy while the click still counts, and rendering a big image takes longer than that
				var png = PE.exportBlob("png", 0.92, { scale: v.scale / 100, bg: "#ffffff" }), done = false;
				try {
					navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(function () { done = true; PE.toast("Picture copied: press Ctrl/Cmd+V on the Snipboard page"); if (w) w.location.href = "https://snipboard.io/"; }, function () {
						if (w) w.location.href = "https://snipboard.io/"; PE.toast("The browser would not copy the picture. Use Export to download it, then drag it onto the Snipboard page.");
					});
				} catch (e) { if (w) w.location.href = "https://snipboard.io/"; PE.toast("This browser cannot copy pictures. Use Export, then drag the file onto the Snipboard page."); }
			} },
			{ label: "Upload and get link", primary: true, act: function () {
				if (busy) return; busy = true; var v = f.get(); out.textContent = "Uploading…";
				var first = v.host === "mes" ? viaMes() : viaLitterbox(v);
				first.catch(function (e) { if (v.host === "mes") throw e; out.textContent = "Litterbox did not accept it (" + (e && e.message ? e.message : "no answer") + "). Trying mes.fm instead…"; return viaMes().then(function (u) { u = { url: u }; return u; }); })
				.then(function (url) { busy = false; var fallback = typeof url === "object"; var u = fallback ? url.url : url; show(u, fallback ? "Litterbox failed, so this link is on mes.fm: a smaller JPEG that lasts 1 hour." : (v.host === "mes" ? "This link lasts 1 hour." : "")); navigator.clipboard && navigator.clipboard.writeText(u).then(function () { PE.toast("Link copied"); }).catch(function () {}); })
				.catch(function (e) { busy = false; out.textContent = "Couldn't upload: " + (e && e.message ? e.message : "the host did not answer") + ". Try a smaller size, or download the picture and use another site."; });
			} }] });
	};
})();
