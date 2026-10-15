/* MES PDF Editor: tools, option bar, pointer handling, text editing, page list. Uses PD (core.js). */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$, P = PD.S.prefs;
	var def = { text: { font: "sans", size: 14, bold: false, italic: false, color: "#111111", align: "left", bg: "" }, draw: { color: "#1a56db", width: 2 }, hl: { color: "#ffeb3b", mode: "box" }, shape: { kind: "rect", stroke: "#e53935", sw: 2, fill: "" }, cover: { mode: "paper" }, stamp: { kind: "check", color: "#1b8a3a", size: 24, fmt: "us" }, note: { color: "#ffd54f" } };
	Object.keys(def).forEach(function (k) { P[k] = Object.assign({}, def[k], P[k] || {}); });
	var COLORS = ["#111111", "#e53935", "#1a56db", "#1b8a3a", "#f59e0b", "#8e24aa"], HL = ["#ffeb3b", "#76ff03", "#ff80ab", "#40c4ff", "#ffab40"];
	var TOOLS = [
		{ id: "select", name: "Select", icon: "↖", key: "v", hint: "Click an item to select it. Drag to move, drag a corner to resize, press Delete to remove." },
		{ id: "text", name: "Text", icon: "T", key: "t", hint: "Click the page where the text should start, then type." },
		{ id: "edittext", name: "Edit text", icon: "✎", key: "e", hint: "Click a line of existing text to change it." },
		{ id: "draw", name: "Draw", icon: "✏", key: "p", hint: "Draw freehand with a mouse, finger or pen." },
		{ id: "highlight", name: "Highlight", icon: "▨", key: "h", hint: "Drag over the text to highlight." },
		{ id: "shapes", name: "Shapes", icon: "▭", key: "s", hint: "Drag to draw. Hold Shift for a square, circle or straight angle." },
		{ id: "cover", name: "Cover", icon: "▮", key: "w", hint: "Drag a box over what you want to hide. Use Black to redact." },
		{ id: "sign", name: "Sign", icon: "✍", key: "g", hint: "Pick a signature, then click where it goes." },
		{ id: "stamp", name: "Stamps", icon: "✔", key: "k", hint: "Click to place a check mark, cross, dot or today's date." },
		{ id: "form", name: "Fill form", icon: "\u2611", key: "r", hint: "Type into the fields of a fillable PDF form. Use the Text tool for forms with no fields." },
		{ id: "note", name: "Comment", icon: "≡", key: "n", hint: "Click to add a comment note." },
		{ id: "image", name: "Image", icon: "▣", key: "i", hint: "Choose a picture, then click where it goes." }
	];
	var byId = {}; TOOLS.forEach(function (t) { byId[t.id] = t; }); PD.TOOLS = TOOLS;
	function savePrefs() { PD.saveS(); }

	/* ---------- the tool column ---------- */
	function buildTools() {
		$("pd-tools").innerHTML = TOOLS.map(function (t) { return '<button type="button" class="pd-tool" data-t="' + t.id + '" aria-pressed="false" title="' + t.name + " (" + t.key.toUpperCase() + ")" + '"><span class="pd-ti">' + t.icon + "</span><span>" + t.name + "</span></button>"; }).join("");
		$("pd-tools").addEventListener("click", function (e) { var b = e.target.closest(".pd-tool"); if (b) PD.setTool(b.dataset.t); });
	}
	PD.setTool = function (id) {
		if (!byId[id]) return; endEdit(); PD.tool = id; PD.armed = null; [].forEach.call($("pd-tools").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === id)); });
		if (id !== "select" && PD.sel) { var p = PD.page(PD.sel.page); PD.sel = null; if (p) PD.repaint(p); }
		if (PD.formRefresh) PD.formRefresh(); PD.hint(byId[id].hint); $("pd-view").style.cursor = id === "select" ? "default" : id === "text" || id === "edittext" ? "text" : "crosshair"; buildOpts();
	};

	/* ---------- option bar: bound either to the tool's preferences or to the selected annotation ---------- */
	function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
	function swatches(label, colors, get, set, any) {
		var w = el('<label>' + label + ' <span class="pd-sw"></span></label>'), box = w.querySelector(".pd-sw");
		function draw() { box.innerHTML = ""; colors.forEach(function (c) { var b = el('<button type="button" aria-label="' + c + '" aria-pressed="' + (get() === c) + '" style="background:' + c + '"></button>'); b.onclick = function () { set(c, true); draw(); }; box.appendChild(b); });
			if (any) { var inp = el('<input type="color" value="' + (/^#[0-9a-f]{6}$/i.test(get()) ? get() : "#000000") + '" aria-label="Any colour">'); inp.addEventListener("input", function () { set(inp.value, false); }); inp.addEventListener("change", function () { set(inp.value, true); draw(); }); box.appendChild(inp); } }
		draw(); return w;
	}
	function range(label, min, max, step, get, set, unit) {
		var w = el('<label>' + label + ' <input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + get() + '"><span class="pd-dim">' + get() + (unit || "") + "</span></label>"), inp = w.querySelector("input"), out = w.querySelector("span");
		inp.addEventListener("input", function () { out.textContent = inp.value + (unit || ""); set(+inp.value, false); }); inp.addEventListener("change", function () { set(+inp.value, true); }); return w;
	}
	function select(label, opts, get, set) {
		var w = el("<label>" + label + " <select>" + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(get()) === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>"); w.querySelector("select").addEventListener("change", function () { set(this.value, true); }); return w;
	}
	function seg(label, opts, get, set) {
		var w = el((label ? "<label>" + label + " " : "<span>") + '<span class="pd-seg"></span>' + (label ? "</label>" : "</span>")), box = w.querySelector(".pd-seg");
		function draw() { box.innerHTML = ""; opts.forEach(function (o) { var b = el('<button type="button" aria-pressed="' + (String(get()) === String(o[0])) + '" title="' + (o[2] || "") + '">' + o[1] + "</button>"); b.onclick = function () { set(o[0], true); draw(); }; box.appendChild(b); }); } draw(); return w;
	}
	function toggle(label, get, set) { var w = el('<button type="button" class="pd-ib pd-ib--txt" aria-pressed="' + !!get() + '">' + label + "</button>"); w.onclick = function () { var v = !(w.getAttribute("aria-pressed") === "true"); w.setAttribute("aria-pressed", String(v)); set(v, true); }; return w; }
	function button(label, fn, primary) { var b = el('<button type="button" class="pd-btn' + (primary ? " pd-btn--primary" : "") + '">' + label + "</button>"); b.onclick = fn; return b; }
	// writes a value either to the selected annotation (live repaint + commit on change) or to the tool's prefs
	function binder(target, key, annot, afterSet) {
		return function (v, fin) { target[key] = v; if (annot) { var p = PD.page(PD.sel.page); if (annot.t === "text") PD.layoutText(annot); if (afterSet) afterSet(annot); PD.repaint(p); if (fin) PD.commit(); } else savePrefs(); };
	}
	function textControls(t, annot) {
		var b = function (k) { return binder(t, k, annot); }, out = [];
		out.push(select("Font", [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]], function () { return t.font; }, b("font")));
		out.push(el('<label>Size <input type="number" min="4" max="200" step="1" value="' + t.size + '" style="width:4.2em"></label>')); out[out.length - 1].querySelector("input").addEventListener("input", function () { var v = Math.max(4, Math.min(200, +this.value || 12)); b("size")(v, false); }); out[out.length - 1].querySelector("input").addEventListener("change", function () { b("size")(Math.max(4, Math.min(200, +this.value || 12)), true); });
		out.push(toggle("<b>B</b>", function () { return t.bold; }, b("bold"))); out.push(toggle("<i>I</i>", function () { return t.italic; }, b("italic")));
		out.push(seg("", [["left", "≡L"], ["center", "≡C"], ["right", "≡R"]], function () { return t.align; }, b("align")));
		out.push(swatches("Colour", COLORS, function () { return t.color; }, b("color"), true));
		out.push(select("Background", [["", "None"], ["#ffffff", "White"], ["#fff59d", "Yellow"]], function () { return t.bg || ""; }, function (v, f) { b("bg")(v || null, f); }));
		return out;
	}
	function buildOpts() {
		var o = $("pd-opts"); o.innerHTML = ""; var add = function (x) { if (Array.isArray(x)) x.forEach(add); else if (x) o.appendChild(x); };
		var a = PD.tool === "select" ? PD.selAnnot() : null, t = PD.tool;
		if (a) {
			add(el('<span class="pd-note">Selected: ' + ({ text: "text", pen: "drawing", rect: "box", ellipse: "ellipse", line: "line", arrow: "arrow", img: "picture", stamp: "stamp", note: "comment" }[a.t] || a.t) + "</span>"));
			if (a.t === "text") add(textControls(a, a));
			else if (a.t === "pen") { add(swatches("Colour", a.alpha ? HL : COLORS, function () { return a.color; }, binder(a, "color", a), !a.alpha)); add(range("Width", 1, a.alpha ? 40 : 14, 1, function () { return a.width; }, binder(a, "width", a), " pt")); }
			else if (a.t === "rect" || a.t === "ellipse") { add(swatches("Line", COLORS, function () { return a.stroke || "#e53935"; }, binder(a, "stroke", a), true)); add(range("Width", 0, 12, 1, function () { return a.sw || 0; }, binder(a, "sw", a), " pt")); add(swatches("Fill", ["#ffffff", "#000000", "#ffeb3b"], function () { return a.fill || ""; }, binder(a, "fill", a), true)); add(button("No fill", function () { binder(a, "fill", a)(null, true); buildOpts(); })); }
			else if (a.t === "line" || a.t === "arrow") { add(swatches("Colour", COLORS, function () { return a.color; }, binder(a, "color", a), true)); add(range("Width", 1, 12, 1, function () { return a.sw; }, binder(a, "sw", a), " pt")); }
			else if (a.t === "stamp") { add(swatches("Colour", COLORS, function () { return a.color; }, binder(a, "color", a), true)); }
			else if (a.t === "note") { add(button("Edit comment", function () { editNote(PD.page(PD.sel.page), a); })); }
			add(button("Duplicate", function () { duplicateSel(); })); add(button("To front", function () { var p = PD.page(PD.sel.page); p.annots = p.annots.filter(function (x) { return x !== a; }).concat([a]); PD.repaint(p); PD.commit(); })); add(button("Delete", function () { PD.removeSel(); })); return;
		}
		if (t === "select") { add(el('<span class="pd-note">Click an item to select it. Its options appear here.</span>')); return; }
		if (t === "text") add(textControls(P.text, null));
		else if (t === "form") add(el('<span class="pd-note">Click a highlighted field and type. Check boxes and drop-downs work too. What you fill in is saved into the PDF when you download it.</span>'));
		else if (t === "edittext") add(el('<span class="pd-note">Click a line of text. The old text is covered with a patch in the paper colour and an editable box takes its place.</span>'));
		else if (t === "draw") { add(swatches("Colour", COLORS, function () { return P.draw.color; }, binder(P.draw, "color"), true)); add(range("Width", 1, 14, 1, function () { return P.draw.width; }, binder(P.draw, "width"), " pt")); }
		else if (t === "highlight") { add(seg("", [["box", "Box"], ["free", "Freehand"]], function () { return P.hl.mode; }, binder(P.hl, "mode"))); add(swatches("Colour", HL, function () { return P.hl.color; }, binder(P.hl, "color"), true)); }
		else if (t === "shapes") { add(seg("", [["rect", "Rectangle"], ["ellipse", "Ellipse"], ["line", "Line"], ["arrow", "Arrow"]], function () { return P.shape.kind; }, binder(P.shape, "kind"))); add(swatches("Line", COLORS, function () { return P.shape.stroke; }, binder(P.shape, "stroke"), true)); add(range("Width", 1, 12, 1, function () { return P.shape.sw; }, binder(P.shape, "sw"), " pt")); add(select("Fill", [["", "None"], ["#ffffff", "White"], ["#ffeb3b", "Yellow"], ["#000000", "Black"]], function () { return P.shape.fill || ""; }, function (v, f) { binder(P.shape, "fill")(v || "", f); })); }
		else if (t === "cover") { add(seg("", [["paper", "Match paper"], ["white", "White"], ["black", "Black (redact)"]], function () { return P.cover.mode; }, binder(P.cover, "mode"))); add(el('<span class="pd-note">A cover hides what is under it on screen. To remove the hidden text for good, turn on <b>Flatten pages</b> when you download.</span>')); }
		else if (t === "sign") { PD.signOptions(o, add, button); }
		else if (t === "stamp") { add(seg("", [["check", "✔ Check"], ["cross", "✘ Cross"], ["dot", "● Dot"], ["date", "Date"]], function () { return P.stamp.kind; }, binder(P.stamp, "kind"))); add(swatches("Colour", COLORS, function () { return P.stamp.color; }, binder(P.stamp, "color"), true)); add(range("Size", 10, 80, 2, function () { return P.stamp.size; }, binder(P.stamp, "size"), " pt")); add(select("Date format", [["us", "03/27/2026"], ["eu", "27/03/2026"], ["iso", "2026-03-27"], ["long", "March 27, 2026"]], function () { return P.stamp.fmt; }, binder(P.stamp, "fmt"))); }
		else if (t === "note") { add(swatches("Colour", ["#ffd54f", "#a5d6a7", "#90caf9", "#f48fb1"], function () { return P.note.color; }, binder(P.note, "color"), false)); add(el('<span class="pd-note">Comments are saved as real PDF comment notes, readable in other PDF viewers.</span>')); }
		else if (t === "image") { add(button("Choose a picture...", function () { $("pd-imgfile").click(); }, true)); add(PD.armed && PD.armed.kind === "img" ? el('<span class="pd-note">Now click where it should go.</span>') : null); }
	}
	PD.buildOpts = buildOpts; PD.on("sel", buildOpts);

	/* ---------- pointer interaction ---------- */
	var drag = null;
	function ctxOf(e) {
		var pe = e.target.closest && e.target.closest(".pd-page"); if (!pe) return null; var p = PD.page(pe.dataset.id); if (!p) return null; var vp = PD.vp(p), r = pe.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, pt = vp.toPdf(px, py);
		return { p: p, vp: vp, px: px, py: py, x: pt[0], y: pt[1], e: e, tol: 5 / PD.zoom, pe: pe };
	}
	function toPdfFrom(c, e) { var r = c.pe.getBoundingClientRect(), pt = c.vp.toPdf(e.clientX - r.left, e.clientY - r.top); return pt; }
	function setCur(p) { var i = PD.doc.pages.indexOf(p); if (i >= 0 && i !== PD.cur) { PD.cur = i; [].forEach.call($("pd-pages").children, function (x, k) { x.classList.toggle("is-cur", k === i); }); PD.emit("cur"); } }
	function onDown(e) {
		if (!PD.doc || e.button > 0 || (e.pointerType === "mouse" && e.button !== 0)) return; var c = ctxOf(e); if (!c) { if (PD.tool === "select" && PD.sel && (e.target.id === "pd-view" || e.target.id === "pd-pages")) PD.select(null, null); return; }
		if (!$("pd-textedit").hidden) { if (e.target === $("pd-textedit")) return; endEdit(); }
		setCur(c.p); var tl = PD.tool;
		if (tl === "select") return selectDown(c);
		if (tl === "text") return textDown(c); if (tl === "edittext") return editTextDown(c); if (tl === "note") return noteDown(c); if (tl === "stamp") return stampDown(c); if (tl === "image") return imageDown(c); if (tl === "sign") return signDown(c);
		if (tl === "draw" || (tl === "highlight" && P.hl.mode === "free")) { var hl = tl === "highlight"; drag = { kind: "pen", c: c, live: { t: "pen", pts: [[c.x, c.y]], color: hl ? P.hl.color : P.draw.color, width: hl ? 14 : P.draw.width, alpha: hl ? 0.38 : undefined } }; c.p._live = drag.live; PD.repaint(c.p); }
		else if (tl === "highlight" || tl === "cover" || tl === "shapes") { drag = { kind: "shape", c: c, x0: c.x, y0: c.y, live: null }; }
		else return;
		try { c.pe.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault();
	}
	function shapeFrom(d, x, y, shift) {
		var tl = PD.tool, x0 = d.x0, y0 = d.y0;
		if (tl === "shapes" && (P.shape.kind === "line" || P.shape.kind === "arrow")) { if (shift) { var ang = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(x - x0, y - y0); x = x0 + Math.cos(ang) * L; y = y0 + Math.sin(ang) * L; } return { t: P.shape.kind, x1: x0, y1: y0, x2: x, y2: y, color: P.shape.stroke, sw: P.shape.sw }; }
		if (shift && tl === "shapes") { var s = Math.max(Math.abs(x - x0), Math.abs(y - y0)); x = x0 + (x >= x0 ? s : -s); y = y0 + (y >= y0 ? s : -s); }
		var a = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) };
		if (tl === "highlight") return Object.assign({ t: "rect", fill: P.hl.color, stroke: null, sw: 0, alpha: 0.38 }, a);
		if (tl === "cover") return Object.assign({ t: "rect", fill: P.cover.mode === "black" ? "#000000" : P.cover.mode === "white" ? "#ffffff" : (d.paper || "#ffffff"), stroke: null, sw: 0 }, a);
		return Object.assign({ t: P.shape.kind, stroke: P.shape.stroke, sw: P.shape.sw, fill: P.shape.fill || null }, a);
	}
	function onMove(e) {
		if (!drag) return; var c = drag.c, pt = toPdfFrom(c, e);
		if (drag.kind === "pen") { var l = drag.live, last = l.pts[l.pts.length - 1]; if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.6 / PD.zoom) { l.pts.push(pt); PD.repaint(c.p); } }
		else if (drag.kind === "shape") { if (drag.paper == null && PD.tool === "cover") drag.paper = PD.sampleColor(c.p, Math.min(drag.x0, pt[0]), Math.min(drag.y0, pt[1]), Math.abs(pt[0] - drag.x0), Math.abs(pt[1] - drag.y0)); drag.live = shapeFrom(drag, pt[0], pt[1], e.shiftKey); if (drag.paper) drag.live.fill = P.cover.mode === "paper" && PD.tool === "cover" ? PD.sampleColor(c.p, drag.live.x, drag.live.y, drag.live.w, drag.live.h) : drag.live.fill; c.p._live = drag.live; PD.repaint(c.p); }
		else if (drag.kind === "move") { var dx = pt[0] - drag.last[0], dy = pt[1] - drag.last[1]; if (!drag.moved && Math.hypot(dx, dy) < 1.5 / PD.zoom) return; drag.moved = true; drag.last = pt; M.move(drag.a, dx, dy); PD.repaint(c.p); }
		else if (drag.kind === "resize") { resizeTo(drag, pt, e.shiftKey); PD.repaint(c.p); drag.moved = true; }
		e.preventDefault();
	}
	function onUp(e) {
		if (!drag) return; var d = drag; drag = null; var c = d.c, p = c.p;
		if (d.kind === "pen") { p._live = null; var pts = M.smooth(M.simplify(d.live.pts, 0.25), 1); if (d.live.pts.length > 1 || true) { d.live.pts = d.live.pts.length < 3 ? d.live.pts : pts; PD.addAnnot(p, d.live, true); PD.commit(); } }
		else if (d.kind === "shape") { p._live = null; var a = d.live; if (a && ((a.w != null && a.w > 3 && a.h > 3) || (a.x2 != null && Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 4))) { PD.addAnnot(p, a, PD.tool !== "shapes"); if (PD.tool === "shapes") { PD.setTool("select"); PD.select(p, a); } PD.commit(); } else PD.repaint(p); }
		else if (d.moved) { PD.commit(); PD.repaint(p); buildOpts(); }
	}
	document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", function () { if (drag) { var p = drag.c.p; p._live = null; drag = null; PD.repaint(p); } });
	function bindPointer() { $("pd-view").addEventListener("pointerdown", onDown); $("pd-view").addEventListener("dblclick", function (e) { if (PD.tool !== "select") return; var c = ctxOf(e); if (!c) return; var a = M.pick(c.p.annots, c.x, c.y, c.tol); if (a && a.t === "text") { PD.select(c.p, a); editText(c.p, a); } else if (a && a.t === "note") { PD.select(c.p, a); editNote(c.p, a); } }); }

	/* ----- select / move / resize ----- */
	function selectDown(c) {
		var sel = PD.sel && PD.sel.page === c.p.id ? PD.selAnnot() : null;
		if (sel) { var hs = PD.handles(c.p, sel, c.vp); if (hs) { var hit = null; Object.keys(hs).forEach(function (n) { if (Math.hypot(hs[n][0] - c.px, hs[n][1] - c.py) <= 11) hit = n; }); if (hit) { drag = { kind: "resize", c: c, a: sel, corner: hit, top: sel.y + (sel.h || 0) }; c.pe.setPointerCapture(c.e.pointerId); c.e.preventDefault(); return; } } }
		var a = M.pick(c.p.annots, c.x, c.y, c.tol);
		if (a) { PD.select(c.p, a); drag = { kind: "move", c: c, a: a, last: [c.x, c.y], moved: false }; c.pe.setPointerCapture(c.e.pointerId); c.e.preventDefault(); }
		else PD.select(null, null);
	}
	function resizeTo(d, pt, shift) {
		var a = d.a;
		if (a.t === "line" || a.t === "arrow") { if (d.corner === "p1") { a.x1 = pt[0]; a.y1 = pt[1]; } else { a.x2 = pt[0]; a.y2 = pt[1]; } return; }
		if (a.t === "text") { var top = d.top, tmp = { x: a.x, y: a.y, w: a.w, h: a.h }; M.resizeBox(tmp, d.corner, pt[0], pt[1], false); a.x = tmp.x; a.w = Math.max(30, tmp.w); a.y = top - a.h; PD.layoutText(a); return; }
		M.resizeBox(a, d.corner, pt[0], pt[1], a.t === "img" || a.t === "stamp" || !!shift);
	}

	/* ----- text ----- */
	PD.makeText = function (p, x, top, props, text) {
		var a = Object.assign({ t: "text", x: x, w: 220, text: text || "", size: 14, font: "sans", bold: false, italic: false, color: "#111111", align: "left", bg: null }, props); a.h = M.textHeight(1, a.size); a.y = top - a.h; var vb = p.W; if (a.x + a.w > p.x0 + p.W) a.x = Math.max(p.x0 + 4, p.x0 + p.W - a.w - 4); PD.layoutText(a); return a;
	};
	function textDown(c) { var t = P.text, a = PD.makeText(c.p, c.x, c.y, { size: t.size, font: t.font, bold: t.bold, italic: t.italic, color: t.color, align: t.align, bg: t.bg || null }); PD.addAnnot(c.p, a); c.e.preventDefault(); editText(c.p, a, true); }
	var editing = null, ta = null;
	function placeTa(p, a) {
		var pe = PD.pageEl(p), r = pe.getBoundingClientRect(), vp = PD.vp(p), o = vp.toView(a.x, a.y + a.h), s = PD.zoom; ta.style.left = (r.left + o[0]) + "px"; ta.style.top = (r.top + o[1]) + "px"; ta.style.width = (a.w * s) + "px"; ta.style.height = (a.h * s) + "px";
		ta.style.transformOrigin = "0 0"; ta.style.transform = "rotate(" + vp.rot + "deg)"; ta.style.font = PD.cssFont(a, a.size * s); ta.style.lineHeight = (M.LINE_H * a.size * s) + "px"; ta.style.padding = (M.PAD * s) + "px"; ta.style.color = a.color; ta.style.textAlign = a.align || "left"; ta.style.fontFamily = ta.style.fontFamily; ta.style.boxSizing = "border-box"; ta.style.background = a.bg || "rgba(255,255,255,0.96)";
	}
	function editText(p, a, isNew) {
		endEdit(); ta = $("pd-textedit"); editing = { p: p, a: a, isNew: !!isNew, before: a.text, kind: "text" }; ta.hidden = false; ta.value = a.text; p._hideSel = true; ta.className = "pd-textedit"; placeTa(p, a); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
		ta.oninput = function () { a.text = ta.value; PD.layoutText(a); placeTa(p, a); PD.repaint(p); };
		ta.onkeydown = function (e) { if (e.key === "Escape") { e.preventDefault(); endEdit(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); endEdit(); } e.stopPropagation(); };
		PD.repaint(p);
	}
	function editNote(p, a) {
		endEdit(); ta = $("pd-textedit"); editing = { p: p, a: a, isNew: !a.text, before: a.text || "", kind: "note" }; var pe = PD.pageEl(p), r = pe.getBoundingClientRect(), vp = PD.vp(p), o = vp.toView(a.x + 22, a.y); ta.hidden = false; ta.value = a.text || ""; ta.className = "pd-textedit";
		ta.style.left = Math.min(window.innerWidth - 250, r.left + o[0]) + "px"; ta.style.top = Math.max(4, r.top + o[1] - 60) + "px"; ta.style.width = "240px"; ta.style.height = "90px"; ta.style.transform = "none"; ta.style.font = "13px/1.3 sans-serif"; ta.style.padding = "6px"; ta.style.color = "#333"; ta.style.background = "#fff8d6"; ta.style.textAlign = "left";
		ta.focus(); ta.oninput = function () { a.text = ta.value; }; ta.onkeydown = function (e) { if (e.key === "Escape") { e.preventDefault(); endEdit(); } e.stopPropagation(); };
	}
	function endEdit() {
		if (!editing) { if (ta) ta.hidden = true; return; } var e = editing, p = e.p, a = e.a; editing = null; ta.hidden = true; ta.oninput = ta.onkeydown = null; p._hideSel = false;
		if (e.kind === "text") { a.text = ta.value; if (!a.text.trim()) { p.annots = p.annots.filter(function (x) { return x !== a; }); if (PD.sel && PD.sel.id === a.id) PD.sel = null; if (!e.isNew) PD.commit(); else if (e.cover) { PD.commit(); } } else { PD.layoutText(a); if (e.isNew || a.text !== e.before) PD.commit(); } }
		else { a.text = ta.value; if (!a.text.trim() && e.isNew) { p.annots = p.annots.filter(function (x) { return x !== a; }); PD.sel = null; } else if (a.text !== e.before) PD.commit(); }
		PD.repaint(p); PD.emit("sel");
	}
	PD.endEdit = endEdit; PD.isEditing = function () { return !!editing; };
	function noteDown(c) { var a = { t: "note", x: c.x, y: c.y, text: "", color: P.note.color }; PD.addAnnot(c.p, a); c.e.preventDefault(); setTimeout(function () { editNote(c.p, a); }, 0); }
	/* ----- edit existing text ----- */
	async function editTextDown(c) {
		c.e.preventDefault(); var p = c.p; if (p.blank) return PD.toast("This page has no existing text. Use the Text tool.");
		if (!p._lines) { try { PD.hint("Reading the page's text..."); var tc = await p.proxy.getTextContent(); p._lines = M.groupText(tc.items, tc.styles); } catch (e) { p._lines = []; } PD.hint(byId.edittext.hint); }
		var l = M.lineAt(p._lines, c.x, c.y); if (!l) return PD.toast(p._lines.length ? "No text there. Click on a line of text." : "No selectable text on this page (a scan?). Use Cover and Text instead.", 3500);
		var already = p.annots.filter(function (x) { return x.coverOf === l.text + "@" + Math.round(l.x) + "," + Math.round(l.y); })[0]; if (already) { var t0 = p.annots.filter(function (x) { return x.id === already.textId; })[0]; if (t0) { PD.select(p, t0); return editText(p, t0); } }
		var pad = 1.5, bx = l.x - pad, by = l.y - 0.28 * l.size, bw = l.w + pad * 2, bh = l.size * 1.28, fill = PD.sampleColor(p, bx, by, bw, bh);
		var cover = { id: M.newId("a"), t: "rect", x: bx, y: by, w: bw, h: bh, fill: fill, stroke: null, sw: 0 }, text = PD.makeText(p, l.x - M.PAD, l.y + M.ASCENT * l.size + M.PAD, { size: Math.round(l.size * 10) / 10, font: l.family, color: "#000000", w: Math.max(l.w + M.PAD * 2 + 10, p.x0 + p.W - (l.x - M.PAD) - 18) }, l.text);
		text.id = M.newId("a"); cover.coverOf = l.text + "@" + Math.round(l.x) + "," + Math.round(l.y); cover.textId = text.id; p.annots.push(cover); PD.addAnnot(p, text); editing = null; editText(p, text, true); editing.cover = true;
	}

	/* ----- stamps, images, signatures ----- */
	function dateText(fmt) { var d = new Date(), p2 = function (n) { return (n < 10 ? "0" : "") + n; }, y = d.getFullYear(), m = p2(d.getMonth() + 1), dd = p2(d.getDate()); return fmt === "eu" ? dd + "/" + m + "/" + y : fmt === "iso" ? y + "-" + m + "-" + dd : fmt === "long" ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : m + "/" + dd + "/" + y; }
	function stampDown(c) {
		var s = P.stamp; c.e.preventDefault();
		if (s.kind === "date") { var a = PD.makeText(c.p, c.x, c.y, { size: Math.max(10, Math.min(30, s.size * 0.6)), color: s.color, w: 160 }, dateText(s.fmt)); a.w = Math.max(60, PD.measure(a, a.text) + M.PAD * 2 + 4); PD.layoutText(a); PD.addAnnot(c.p, a); PD.commit(); return; }
		var a2 = { t: "stamp", kind: s.kind, x: c.x - s.size / 2, y: c.y - s.size / 2, w: s.size, h: s.size, color: s.color }; PD.addAnnot(c.p, a2); PD.commit();
	}
	PD.placeImage = function (p, x, y, id, w0, h0, kind) {
		var W = Math.min(kind === "sig" ? M.SIZES.sigW : 220, p.W * 0.6), H = W * h0 / w0, a = { t: "img", img: id, kind: kind || "img", x: x - W / 2, y: y - H / 2, w: W, h: H }; a.x = Math.max(p.x0, Math.min(p.x0 + p.W - W, a.x)); a.y = Math.max(p.y0, Math.min(p.y0 + p.H - H, a.y)); PD.addAnnot(p, a); PD.commit(); PD.setTool("select"); PD.select(p, a); return a;
	};
	function imageDown(c) { if (!PD.armed || PD.armed.kind !== "img") { $("pd-imgfile").click(); return; } c.e.preventDefault(); var ar = PD.armed; PD.placeImage(c.p, c.x, c.y, ar.id, ar.w, ar.h, "img"); }
	function signDown(c) { if (!PD.armed || PD.armed.kind !== "sig") { PD.toast("Pick or create a signature first"); return; } c.e.preventDefault(); var ar = PD.armed; PD.placeImage(c.p, c.x, c.y, ar.id, ar.w, ar.h, "sig"); }
	PD.loadImageFile = function (file) {
		return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { var im = new Image(); im.onload = function () { var id = M.newId("i"); PD.images[id] = { data: fr.result, w: im.naturalWidth, h: im.naturalHeight }; res({ id: id, w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = function () { PD.toast("That picture could not be read"); res(null); }; im.src = fr.result; }; fr.readAsDataURL(file); });
	};
	PD.addImageData = function (data, w, h) { var id = M.newId("i"); PD.images[id] = { data: data, w: w, h: h }; return id; };
	function duplicateSel() { var a = PD.selAnnot(); if (!a) return; var p = PD.page(PD.sel.page), c = JSON.parse(JSON.stringify(a)); c.id = M.newId("a"); delete c.coverOf; delete c.textId; M.move(c, 12, -12); p.annots.push(c); PD.sel = { page: p.id, id: c.id }; PD.repaint(p); PD.commit(); buildOpts(); }
	PD.duplicateSel = duplicateSel;
	PD.nudge = function (dx, dy) { var a = PD.selAnnot(); if (!a) return false; var p = PD.page(PD.sel.page); M.move(a, dx, dy); PD.repaint(p); clearTimeout(PD._nt); PD._nt = setTimeout(function () { PD.commit(); }, 400); return true; };
	PD.copySel = function () { var a = PD.selAnnot(); if (!a) return false; PD.clip = JSON.stringify(a); return true; };
	PD.pasteClip = function () { if (!PD.clip || !PD.doc) return false; var p = PD.doc.pages[PD.cur], a = JSON.parse(PD.clip); a.id = M.newId("a"); delete a.coverOf; delete a.textId; M.move(a, 14, -14); p.annots.push(a); PD.sel = { page: p.id, id: a.id }; PD.repaint(p); PD.commit(); PD.emit("sel"); return true; };

	/* ---------- page list (thumbnails): rotate, delete, duplicate, reorder, add ---------- */
	var thumbQueue = Promise.resolve();
	function thumbRender(p, canvas) {
		thumbQueue = thumbQueue.then(async function () {
			if (!canvas.isConnected) return; var vp = PD.vp(p, 1), sc = 120 / vp.width, tv = PD.vp(p, sc), k = 1.5; canvas.width = Math.round(tv.width * k); canvas.height = Math.round(tv.height * k); var ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
			if (!p.blank) { try { await p.proxy.render({ canvasContext: ctx, viewport: p.proxy.getViewport({ scale: sc * k, rotation: (p.rot0 + p.rot) % 360 }) }).promise; } catch (e) {} }
			ctx.save(); ctx.scale(k, k); PD.paintAll(ctx, tv, p.annots); ctx.restore();
		}).catch(function () {});
	}
	function buildThumbs() {
		var box = $("pd-thumbs"); box.classList.toggle("is-off", !PD.S.thumbs || !PD.doc); if (!PD.doc) { box.innerHTML = ""; return; } if (!PD.S.thumbs) return;
		box.innerHTML = PD.doc.pages.map(function (p, i) { return '<div class="pd-th' + (i === PD.cur ? " is-cur" : "") + '" draggable="true" data-i="' + i + '"><canvas></canvas><div class="pd-th-n">' + (i + 1) + '</div><div class="pd-th-act"><button type="button" data-a="rl" title="Rotate left" aria-label="Rotate page ' + (i + 1) + ' left">↶</button><button type="button" data-a="rr" title="Rotate right" aria-label="Rotate page ' + (i + 1) + ' right">↷</button><button type="button" data-a="dup" title="Duplicate page" aria-label="Duplicate page ' + (i + 1) + '">⧉</button><button type="button" data-a="blank" title="Add a blank page after this one" aria-label="Add a blank page after page ' + (i + 1) + '">+</button><button type="button" data-a="del" title="Delete page" aria-label="Delete page ' + (i + 1) + '">✕</button></div></div>'; }).join("") + '<div class="pd-thumbs-add"><button type="button" data-a="addblank">+ Blank page</button><button type="button" data-a="addpdf">+ Pages from a PDF</button></div>';
		[].forEach.call(box.querySelectorAll(".pd-th"), function (th, i) { thumbRender(PD.doc.pages[i], th.querySelector("canvas")); });
	}
	function pageOp(op, i) {
		var d = PD.doc, p = d.pages[i]; PD.endEdit();
		if (op === "rl" || op === "rr") { p.rot = (p.rot + (op === "rl" ? 270 : 90)) % 360; p._rendered = false; }
		else if (op === "del") { if (d.pages.length < 2) return PD.toast("A PDF needs at least one page"); d.pages.splice(i, 1); PD.sel = null; PD.cur = Math.min(PD.cur, d.pages.length - 1); }
		else if (op === "dup") { var c = Object.assign({}, p, { id: M.newId("p"), annots: JSON.parse(JSON.stringify(p.annots)), _rendered: false, _live: null }); c.annots.forEach(function (a) { a.id = M.newId("a"); delete a.coverOf; delete a.textId; }); d.pages.splice(i + 1, 0, c); }
		else if (op === "blank") { var q = PD.vp(p, 1); d.pages.splice(i + 1, 0, PD.blankPage(p.W, p.H)); }
		PD.commit(); PD.layout(); if (op === "blank" || op === "dup") PD.goPage(i + 1);
	}
	function bindThumbs() {
		var box = $("pd-thumbs"), from = null;
		box.addEventListener("click", function (e) { var b = e.target.closest("button"); var th = e.target.closest(".pd-th"); if (b && b.dataset.a === "addblank") { var cp = PD.doc.pages[PD.cur] || PD.doc.pages[PD.doc.pages.length - 1]; PD.doc.pages.push(PD.blankPage(cp.W, cp.H)); PD.commit(); PD.layout(); PD.goPage(PD.doc.pages.length - 1); return; } if (b && b.dataset.a === "addpdf") { $("pd-addfile").click(); return; } if (b && th) { pageOp(b.dataset.a, +th.dataset.i); return; } if (th) PD.goPage(+th.dataset.i); });
		box.addEventListener("dragstart", function (e) { var th = e.target.closest(".pd-th"); if (!th) return; from = +th.dataset.i; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", "page"); } catch (x) {} });
		box.addEventListener("dragover", function (e) { if (from == null) return; e.preventDefault(); var th = e.target.closest(".pd-th"); [].forEach.call(box.querySelectorAll(".is-over"), function (x) { x.classList.remove("is-over"); }); if (th) th.classList.add("is-over"); });
		box.addEventListener("drop", function (e) { if (from == null) return; e.preventDefault(); var th = e.target.closest(".pd-th"); if (th) { var to = +th.dataset.i; if (to !== from) { var pg = PD.doc.pages.splice(from, 1)[0]; PD.doc.pages.splice(to, 0, pg); PD.cur = to; PD.commit(); PD.layout(); } } from = null; });
		box.addEventListener("dragend", function () { from = null; [].forEach.call(box.querySelectorAll(".is-over"), function (x) { x.classList.remove("is-over"); }); });
	}
	var thumbT; PD.on("layout", function () { clearTimeout(thumbT); thumbT = setTimeout(buildThumbs, 120); }); PD.on("cur", function () { [].forEach.call($("pd-thumbs").querySelectorAll(".pd-th"), function (x, i) { x.classList.toggle("is-cur", i === PD.cur); }); var cur = $("pd-thumbs").querySelector(".is-cur"); if (cur && PD.S.thumbs) { var box = $("pd-thumbs"); if (cur.offsetTop < box.scrollTop || cur.offsetTop + cur.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = cur.offsetTop - 20; } });
	PD.refreshThumb = function (p) { var i = PD.doc.pages.indexOf(p), th = $("pd-thumbs").querySelectorAll(".pd-th")[i]; if (th) thumbRender(p, th.querySelector("canvas")); };
	var tt; PD.on("history", function () { clearTimeout(tt); tt = setTimeout(function () { if (PD.doc && PD.S.thumbs) { [].forEach.call($("pd-thumbs").querySelectorAll(".pd-th"), function (th, i) { if (PD.doc.pages[i]) thumbRender(PD.doc.pages[i], th.querySelector("canvas")); }); } }, 600); });
	PD.init = { buildTools: buildTools, bindPointer: bindPointer, bindThumbs: bindThumbs };
})();
