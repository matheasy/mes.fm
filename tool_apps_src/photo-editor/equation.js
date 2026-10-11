/* MES Photo Editor: LaTeX equations as layers. MathJax 3.2.2 (tex-svg from cdnjs, loaded on first use, `fontCache: none` so the SVG is self-contained) typesets the TeX to SVG at the requested
 * font size, the SVG is rasterised at 2x (so it stays crisp when enlarged: the layer's scale is 1/2) onto a transparent canvas, optionally on a rounded background box. The TeX source and
 * options are kept on the layer (`L.eq`), so Equation tool / double-click re-opens the dialog and re-renders it, keeping the position and any scaling you applied. Pasting text that looks like
 * LaTeX opens the dialog with it. Painting on or adjusting an equation layer turns it into plain pixels (`eq` cleared). */
(function () {
	"use strict";
	var PE = window.PE, mk = PE.mk, el = PE.el, esc = PE.esc;
	var JS = "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js", K = 2, loading = null;
	function loadMJ() {
		if (window.MathJax && window.MathJax.tex2svg) return window.MathJax.startup.promise.then(function () { return window.MathJax; });
		if (loading) return loading;
		window.MathJax = { tex: { processEnvironments: true, tags: "ams", macros: { xleftrightarrow: ["\\overset{#1}{\\longleftrightarrow}", 1], xLeftrightarrow: ["\\overset{#1}{\\Longleftrightarrow}", 1] } }, svg: { fontCache: "none" }, options: { enableMenu: false }, startup: { typeset: false } };
		loading = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = JS; s.onload = function () { window.MathJax.startup.promise.then(function () { res(window.MathJax); }); }; s.onerror = function () { loading = null; rej(new Error("Could not load the equation engine (offline?)")); }; document.head.appendChild(s); });
		return loading;
	}
	/* eq = {tex, size, color, display, bgOn, bg, pad, radius} -> Promise<{canvas, k, nw}> (rejects with Error(message) for invalid TeX) */
	PE.renderEquation = function (eq, k) {
		k = k || K;
		return loadMJ().then(function (MJ) {
			var size = Math.max(8, eq.size || 96), node = MJ.tex2svg(eq.tex || "", { display: eq.display !== false, em: size, ex: size / 2, containerWidth: 1e6 }), bad = node.querySelector("[data-mjx-error]");
			if (bad) throw new Error(bad.getAttribute("data-mjx-error") || "Invalid LaTeX");
			var svg = node.querySelector("svg"), ex = size / 2, w = parseFloat(svg.getAttribute("width")) * ex, h = parseFloat(svg.getAttribute("height")) * ex;
			svg.setAttribute("xmlns", "http://www.w3.org/2000/svg"); svg.setAttribute("width", w * k); svg.setAttribute("height", h * k); svg.removeAttribute("style");
			var src = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, eq.color || "#000000");
			return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("Could not draw the equation")); }; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src); }).then(function (im) {
				var pad = eq.bgOn ? Math.round((eq.pad || 0) * k) : Math.round(size * 0.04 * k), W = Math.ceil(w * k) + pad * 2, H = Math.ceil(h * k) + pad * 2; if (W * H > PE.MAXAREA) throw new Error("That equation is too large");
				var c = mk(W, H), x = c.getContext("2d");
				if (eq.bgOn) { var r = Math.min((eq.radius || 0) * k, W / 2, H / 2); x.fillStyle = eq.bg || "#ffffff"; x.beginPath(); x.moveTo(r, 0); x.arcTo(W, 0, W, H, r); x.arcTo(W, H, 0, H, r); x.arcTo(0, H, 0, 0, r); x.arcTo(0, 0, W, 0, r); x.closePath(); x.fill(); }
				x.drawImage(im, pad, pad, w * k, h * k); return { canvas: c, k: k, nw: W / k };
			});
		});
	};
	var DEF = { tex: "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", size: 96, color: "#ffffff", display: true, bgOn: false, bg: "#ffffff", pad: 24, radius: 16 };
	var last = null; try { last = JSON.parse(localStorage.getItem("mes-photo-editor:eq") || "null"); } catch (e) {}
	var SNIP = [["a/b", "\\frac{a}{b}"], ["√", "\\sqrt{x}"], ["xⁿ", "x^{n}"], ["xₙ", "x_{n}"], ["∫", "\\int_{a}^{b} f(x)\\,dx"], ["∑", "\\sum_{n=1}^{\\infty} a_n"], ["lim", "\\lim_{x \\to 0}"], ["∂", "\\frac{\\partial f}{\\partial x}"], ["vector", "\\vec{r}\\,'(t)"], ["| |", "\\left| x \\right|"], ["matrix", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"], ["cases", "\\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}"], ["align", "\\begin{aligned} a &= b + c \\\\ &= d \\end{aligned}"], ["π θ λ", "\\pi \\theta \\lambda \\alpha \\beta"], ["boxed", "\\boxed{x = 1}"]];
	/* edit: an existing equation layer (re-render it), else insert a new one centred at `at` (doc coordinates) */
	PE.dlgEquation = function (edit, at, prefill) {
		if (!PE.doc) { PE.toast("Open or create an image first"); return; }
		var base = edit && edit.eq ? edit.eq : (last || DEF), eq = JSON.parse(JSON.stringify(base)); if (!edit) { eq.color = PE.fg === "#e53935" && !last ? eq.color : eq.color; if (prefill) eq.tex = prefill; }
		var wrap = el("div"), ta = el("textarea", "pe-tex"); ta.value = eq.tex; ta.rows = 4; ta.spellcheck = false; ta.setAttribute("aria-label", "LaTeX"); wrap.appendChild(ta);
		var chips = el("div", "pe-snips"); SNIP.forEach(function (sn) { var b = el("button", "pe-chip2", esc(sn[0])); b.type = "button"; b.title = sn[1]; b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", function () { var a = ta.selectionStart, z = ta.selectionEnd; ta.setRangeText(sn[1], a, z, "end"); ta.focus(); upd(); }); chips.appendChild(b); }); wrap.appendChild(chips);
		var f = PE.form([{ k: "size", label: "Size", type: "range", min: 16, max: 400, step: 1, val: eq.size, unit: "px" }, { k: "color", label: "Colour", type: "color", val: eq.color }, { k: "display", label: "Large style (display)", type: "check", val: eq.display }, { k: "bgOn", label: "Background box", type: "check", val: eq.bgOn }, { k: "bg", label: "Box colour", type: "color", val: eq.bg }, { k: "pad", label: "Padding", type: "range", min: 0, max: 120, step: 1, val: eq.pad, unit: "px" }, { k: "radius", label: "Corners", type: "range", min: 0, max: 80, step: 1, val: eq.radius, unit: "px" }], function () { vis(); upd(); });
		wrap.appendChild(f.el); function vis() { var v = f.get(); ["bg", "pad", "radius"].forEach(function (k) { f.inputs[k].inp.closest(".pe-row").style.display = v.bgOn ? "" : "none"; }); } vis();
		var prev = el("div", "pe-eqprev"), err = el("div", "pe-eqerr"); wrap.appendChild(prev); wrap.appendChild(err);
		var tmr = 0, token = 0, cur = null;
		function upd() { clearTimeout(tmr); tmr = setTimeout(draw, 160); }
		function get() { var v = f.get(); v.tex = ta.value; return v; }
		function draw() { var my = ++token, v = get(); if (!v.tex.trim()) { prev.innerHTML = ""; err.textContent = ""; cur = null; return; } PE.renderEquation(v, 1).then(function (r) { if (my !== token) return; cur = v; err.textContent = ""; r.canvas.style.maxWidth = "100%"; r.canvas.style.maxHeight = "9em"; prev.innerHTML = ""; prev.appendChild(r.canvas); }).catch(function (e) { if (my !== token) return; err.textContent = e.message; }); }
		ta.addEventListener("input", upd); ta.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); go(); } });
		var m = PE.modal({ title: edit ? "Edit equation" : "Insert equation (LaTeX)", wide: true, body: wrap, noFocus: true, buttons: [{ label: "Cancel", act: function (mm) { mm.close(); } }, { label: edit ? "Update" : "Insert", primary: true, act: function () { go(); } }] });
		setTimeout(function () { ta.focus(); ta.select(); }, 30); draw();
		function go() {
			var v = get(); if (!v.tex.trim()) { PE.toast("Type some LaTeX first"); return; }
			PE.renderEquation(v, K).then(function (r) {
				last = v; try { localStorage.setItem("mes-photo-editor:eq", JSON.stringify(v)); } catch (e) {} v.k = K; v.nw = r.nw; var name = "Eq: " + v.tex.replace(/\s+/g, " ").slice(0, 24);
				if (edit) { var ur = Math.abs(edit.sx) * edit.canvas.width / (edit.eq.nw || (edit.canvas.width / K)), sgx = edit.sx < 0 ? -1 : 1, sgy = edit.sy < 0 ? -1 : 1; edit.canvas = r.canvas; edit.sx = sgx * ur / K; edit.sy = sgy * ur / K; edit.eq = v; edit.name = name; edit.mask = null; edit.rev++; PE.commit("Edit equation"); }
				else { var L = PE.makeLayer({ canvas: r.canvas, name: name, cx: at ? at.x : PE.doc.w / 2, cy: at ? at.y : PE.doc.h / 2 }); L.sx = L.sy = 1 / K; L.eq = v; PE.addLayer(L); PE.commit("Insert equation"); }
				m.close(true); PE.setTool("move");
			}).catch(function (e) { err.textContent = e.message; });
		}
	};
	PE.looksLikeLatex = function (t) { t = String(t || "").trim(); return t.length > 1 && t.length < 4000 && (/\\[a-zA-Z]{2,}/.test(t) || /[\^_]\{/.test(t) || /^\$.*\$$/.test(t)); };
	PE.defTool({ id: "equation", name: "Equation (LaTeX)", key: "q", icon: "∑", opts: {}, ui: [{ type: "button", label: "Insert equation…", act: function () { PE.dlgEquation(null, null); } }, { type: "button", label: "Edit selected equation", act: function () { var L = PE.active(); if (L && L.eq) PE.dlgEquation(L); else PE.toast("Select an equation layer first"); } }],
		hint: "Click where the equation should go, type LaTeX (a live preview appears), then Insert. Click an existing equation to edit it. Equations stay sharp when you enlarge them.",
		down: function (e) { var hit = PE.layerAt(e.x, e.y); if (hit && hit.eq) { PE.setActive(hit.id); PE.dlgEquation(hit); return; } PE.dlgEquation(null, { x: e.x, y: e.y }); } });
})();
