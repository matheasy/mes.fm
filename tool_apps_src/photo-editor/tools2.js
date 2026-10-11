/* MES Photo Editor tools, part 2: text (with label backgrounds), shapes + annotations (arrows, callouts, step badges, highlights, redact), option plumbing. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk, rgba = PE.rgba;
	PE.optGet = function (id, k) { var t = PE.tools[id]; if (t.optsTarget) { var tg = t.optsTarget(); if (tg) return tg[k]; } return PE.opt[id][k]; };
	PE.optSet = function (id, k, v) { var t = PE.tools[id]; PE.opt[id][k] = v; if (t.optsTarget) { var tg = t.optsTarget(); if (tg && tg !== PE.opt[id]) { tg[k] = v; if (t.onopt) t.onopt(k, v); } } PE.emit("opts", id); PE.invalidateOverlay(); };

	/* ---------- fonts ---------- */
	PE.FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["system-ui, -apple-system, 'Segoe UI', sans-serif", "System UI"], ["Verdana, Geneva, sans-serif", "Verdana"], ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Tahoma, sans-serif", "Tahoma"], ["Impact, 'Arial Black', sans-serif", "Impact"], ["Georgia, serif", "Georgia"], ["'Times New Roman', Times, serif", "Times New Roman"], ["'Palatino Linotype', Palatino, serif", "Palatino"], ["'Courier New', Courier, monospace", "Courier New"], ["ui-monospace, Menlo, Consolas, monospace", "Monospace"], ["'Comic Sans MS', 'Comic Neue', cursive", "Comic Sans"], ["'Brush Script MT', cursive", "Brush Script"]];
	PE.loadFontFile = function (file) {
		var name = file.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]/g, "");
		return file.arrayBuffer().then(function (ab) { var ff = new FontFace(name, ab); return ff.load().then(function () { document.fonts.add(ff); PE.FONTS.push(["'" + name + "', sans-serif", name + " (yours)"]); PE.emit("fonts"); PE.optSet("text", "font", "'" + name + "', sans-serif"); }); });
	};

	/* ---------- text ---------- */
	var te = null;
	function editor() { return PE.els.textedit; }
	function placeEditor() {
		if (!te) return; var L = te.L, ta = editor(), t = L.text, v = PE.view, c = Math.cos(L.rot), s = Math.sin(L.rot), pad = L._pad || 0;
		var lx = pad - L.canvas.width / 2, ly = pad - L.canvas.height / 2, dx = L.cx + c * L.sx * lx - s * L.sy * ly, dy = L.cy + s * L.sx * lx + c * L.sy * ly, sp = PE.toScreen(dx, dy), z = v.zoom;
		ta.style.cssText = "display:block;left:0;top:0;transform-origin:0 0;transform:matrix(" + (c * L.sx * z) + "," + (s * L.sx * z) + "," + (-s * L.sy * z) + "," + (c * L.sy * z) + "," + sp.x + "," + sp.y + ");font:" + (t.italic ? "italic " : "") + (t.bold ? "bold " : "") + t.size + "px/" + (t.size * t.lh) + "px " + t.font + ";text-align:" + t.align + ";width:" + (L.canvas.width - pad * 2 + 4) + "px;height:" + (L.canvas.height - pad * 2 + t.size * 0.2) + "px;letter-spacing:" + (t.ls || 0) + "px;caret-color:" + (t.color) + ";";
	}
	PE.placeTextEditor = placeEditor;
	function openEdit(L, isNew) {
		te = { L: L, isNew: isNew, orig: L.text.str }; var ta = editor(); ta.value = L.text.str; placeEditor(); PE.emit("opts", "text");
		setTimeout(function () { ta.focus(); ta.select(); }, 0); setTimeout(function () { if (te && document.activeElement !== ta) { ta.focus(); ta.select(); } }, 80);
	}
	PE.endTextEdit = function (cancel) {
		if (!te) return; var e = te; te = null; var ta = editor(); ta.style.display = "none"; var L = e.L;
		if (cancel && e.isNew) { PE.doc.layers.splice(PE.doc.layers.indexOf(L), 1); if (!PE.doc.layers.length) PE.doc.layers.push(PE.makeLayer({ name: "Layer 1" })); PE.doc.activeId = PE.doc.layers[PE.doc.layers.length - 1].id; PE.emit("layers"); PE.invalidate(); return; }
		if (!L.text.str.trim() && e.isNew) { PE.doc.layers.splice(PE.doc.layers.indexOf(L), 1); if (!PE.doc.layers.length) PE.doc.layers.push(PE.makeLayer({ name: "Layer 1" })); PE.doc.activeId = PE.doc.layers[PE.doc.layers.length - 1].id; PE.emit("layers"); PE.invalidate(); return; }
		if (e.isNew) { L.name = L.text.str.split("\n")[0].slice(0, 24) || "Text"; PE.commit("Add text"); } else if (L.text.str !== e.orig) { L.name = L.text.str.split("\n")[0].slice(0, 24) || "Text"; PE.commit("Edit text"); }
		PE.invalidate();
	};
	PE.textEditing = function () { return !!te; };
	PE.focusText = function () { if (te) { var ta = editor(); if (document.activeElement !== ta) ta.focus(); } };
	PE.initTextEditor = function () {
		var ta = editor();
		ta.addEventListener("input", function () { if (!te) return; te.L.text.str = ta.value; PE.renderText(te.L); PE.touch(te.L); placeEditor(); });
		ta.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); PE.endTextEdit(false); e.stopPropagation(); } e.stopPropagation(); });
		ta.addEventListener("blur", function () { setTimeout(function () { if (te && document.activeElement !== ta && !PE.keepTextEdit) PE.endTextEdit(false); }, 120); });
		PE.on("view", function () { if (te) placeEditor(); });
	};
	var ctimer = 0;
	PE.defTool({ id: "text", name: "Text / Label", key: "t", icon: "T", opts: JSON.parse(JSON.stringify(PE.TEXTDEF)), hint: "Click to add text. Click an existing text to edit it. Turn on Background for a label or callout look. Esc finishes.",
		ui: [{ k: "font", label: "Font", type: "select", options: "fonts" }, { k: "size", label: "Size", type: "range", min: 6, max: 400, step: 1, unit: "px" }, { k: "bold", label: "Bold", type: "check" }, { k: "italic", label: "Italic", type: "check" }, { k: "align", label: "Align", type: "seg", options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] }, { k: "lh", label: "Line height", type: "range", min: 0.8, max: 3, step: 0.05 }, { k: "color", label: "Colour", type: "color" },
			{ k: "bgOn", label: "Background box", type: "check" }, { k: "bgColor", label: "Box colour", type: "color", show: "bgOn" }, { k: "bgPad", label: "Padding", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" }, { k: "bgRadius", label: "Corners", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" },
			{ k: "strokeOn", label: "Outline", type: "check" }, { k: "stroke", label: "Outline colour", type: "color", show: "strokeOn" }, { k: "strokeW", label: "Outline width", type: "range", min: 1, max: 40, step: 1, unit: "px", show: "strokeOn" },
			{ k: "shadowOn", label: "Shadow", type: "check" }, { k: "shadow", label: "Shadow colour", type: "color", show: "shadowOn" }, { k: "shadowBlur", label: "Blur", type: "range", min: 0, max: 60, step: 1, unit: "px", show: "shadowOn" },
			{ type: "button", label: "Load font file…", act: function () { PE.pickFontFile(); } }, { type: "button", label: "Yellow label", act: function () { preset({ bgOn: true, bgColor: "#ffeb3b", color: "#111111", bold: true, bgPad: 14, bgRadius: 8 }); } }, { type: "button", label: "Red callout", act: function () { preset({ bgOn: true, bgColor: "#e53935", color: "#ffffff", bold: true, bgPad: 14, bgRadius: 10 }); } }, { type: "button", label: "Meme text", act: function () { preset({ bgOn: false, color: "#ffffff", strokeOn: true, stroke: "#000000", strokeW: 6, bold: true, font: "Impact, 'Arial Black', sans-serif", align: "center" }); } }],
		optsTarget: function () { var L = PE.active(); return L && L.type === "text" && L.text ? L.text : null; },
		onopt: function () { var L = PE.active(); if (!L || L.type !== "text") return; PE.renderText(L); PE.touch(L); if (te) placeEditor(); clearTimeout(ctimer); ctimer = setTimeout(function () { PE.commit("Text style"); }, 450); },
		down: function (e) {
			if (te) { PE.endTextEdit(false); }
			var hit = PE.layerAt(e.x, e.y); if (hit && hit.type === "text") { PE.setActive(hit.id); openEdit(hit, false); return; }
			var o = JSON.parse(JSON.stringify(PE.opt.text)); o.str = ""; var L = PE.makeLayer({ type: "text", name: "Text", text: o, w: 4, h: 4 }); PE.renderText(L); L.cx = e.x - (L._pad || 0) + L.canvas.width / 2; L.cy = e.y - (L._pad || 0) + L.canvas.height / 2;
			PE.addLayer(L); openEdit(L, true);
		}, cancel: function () { PE.endTextEdit(false); } });
	function preset(o) { for (var k in o) PE.optSet("text", k, o[k]); PE.emit("opts", "text"); }
	PE.editActiveText = function () { var L = PE.active(); if (L && L.type === "text") { PE.setTool("text"); openEdit(L, false); } };

	/* ---------- shapes and annotations ---------- */
	function rr(x, bx, by, bw, bh, r) { r = Math.min(r, bw / 2, bh / 2); x.moveTo(bx + r, by); x.arcTo(bx + bw, by, bx + bw, by + bh, r); x.arcTo(bx + bw, by + bh, bx, by + bh, r); x.arcTo(bx, by + bh, bx, by, r); x.arcTo(bx, by, bx + bw, by, r); x.closePath(); }
	function contrast(hex) { var c = P.hexToRgb(hex); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) > 150 ? "#111111" : "#ffffff"; }
	function norm(a, b, sq) { var x1 = b.x, y1 = b.y; if (sq) { var d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)); x1 = a.x + Math.sign(b.x - a.x || 1) * d; y1 = a.y + Math.sign(b.y - a.y || 1) * d; } return { x: Math.min(a.x, x1), y: Math.min(a.y, y1), w: Math.abs(x1 - a.x), h: Math.abs(y1 - a.y), x1: x1, y1: y1 }; }
	function drawShape(x, kind, a, b, o, sq) {
		var fg = PE.fg, bg = PE.bg, sw = o.width, r = norm(a, b, sq);
		x.lineJoin = "round"; x.lineCap = "round"; x.lineWidth = sw;
		if (o.shadow) { x.shadowColor = "rgba(0,0,0,0.45)"; x.shadowBlur = 8; x.shadowOffsetX = 2; x.shadowOffsetY = 3; }
		if (kind === "line" || kind === "arrow") {
			var ex = sq ? r.x1 : b.x, ey = sq ? r.y1 : b.y, ang = Math.atan2(ey - a.y, ex - a.x), hl = Math.max(12, sw * 4.5), len = Math.hypot(ex - a.x, ey - a.y);
			x.strokeStyle = fg; x.fillStyle = fg; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(kind === "arrow" && len > hl ? ex - Math.cos(ang) * hl * 0.7 : ex, kind === "arrow" && len > hl ? ey - Math.sin(ang) * hl * 0.7 : ey); x.stroke();
			if (kind === "arrow" && len > 2) { var hw = hl * 0.55; x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex - Math.cos(ang) * hl + Math.sin(ang) * hw, ey - Math.sin(ang) * hl - Math.cos(ang) * hw); x.lineTo(ex - Math.cos(ang) * hl - Math.sin(ang) * hw, ey - Math.sin(ang) * hl + Math.cos(ang) * hw); x.closePath(); x.fill(); }
			return;
		}
		x.beginPath();
		if (kind === "ellipse") x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 6.2832);
		else if (kind === "round" || kind === "callout" && false) rr(x, r.x, r.y, r.w, r.h, o.radius);
		else if (kind === "callout") {
			var rad = Math.min(o.radius, r.w / 2, r.h / 2), tx0 = r.x + Math.min(r.w * 0.2, 40), tx1 = r.x + Math.min(r.w * 0.2 + 36, r.w - rad), tipx = r.x - Math.min(r.w * 0.12, 20), tipy = r.y + r.h + Math.min(r.h * 0.4, 36);
			x.moveTo(r.x + rad, r.y); x.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad); x.arcTo(r.x + r.w, r.y + r.h, tx1, r.y + r.h, rad); x.lineTo(tx1, r.y + r.h); x.lineTo(tipx, tipy); x.lineTo(tx0, r.y + r.h); x.arcTo(r.x, r.y + r.h, r.x, r.y, rad); x.arcTo(r.x, r.y, r.x + r.w, r.y, rad); x.closePath();
		} else if (kind === "badge") { var br = Math.max(8, o.badge / 2); x.arc(a.x, a.y, br, 0, 6.2832); }
		else x.rect(r.x, r.y, r.w, r.h);
		if (kind === "highlight") { x.fillStyle = fg; x.fill(); return; }
		if (kind === "badge") { x.fillStyle = fg; x.fill(); if (o.stroke) { x.strokeStyle = bg; x.lineWidth = Math.max(2, o.badge / 12); x.stroke(); } x.shadowColor = "transparent"; x.fillStyle = contrast(fg); x.font = "bold " + Math.round(o.badge * 0.55) + "px Arial, Helvetica, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(o.next), a.x, a.y + o.badge * 0.04); return; }
		if (o.fill) { x.fillStyle = bg; x.fill(); x.shadowColor = "transparent"; }
		if (o.stroke) { x.strokeStyle = fg; x.stroke(); }
	}
	function shapePad(kind, o) { return Math.ceil(o.width + (o.shadow ? 16 : 0) + (kind === "arrow" ? Math.max(12, o.width * 4.5) : 0) + (kind === "callout" ? 60 : 0) + 4); }
	function shapeBox(kind, a, b, o, sq) {
		var r = norm(a, b, sq), p = shapePad(kind, o);
		if (kind === "line" || kind === "arrow") { var ex = sq ? r.x1 : b.x, ey = sq ? r.y1 : b.y; r = { x: Math.min(a.x, ex), y: Math.min(a.y, ey), w: Math.abs(ex - a.x), h: Math.abs(ey - a.y) }; }
		if (kind === "badge") { var br = Math.max(8, o.badge / 2); r = { x: a.x - br, y: a.y - br, w: br * 2, h: br * 2 }; }
		return { x: Math.floor(r.x - p), y: Math.floor(r.y - p), w: Math.ceil(r.w + p * 2), h: Math.ceil(r.h + p * 2) };
	}
	var sh = null;
	var KINDS = [["rect", "Rectangle"], ["round", "Rounded box"], ["ellipse", "Ellipse"], ["line", "Line"], ["arrow", "Arrow"], ["callout", "Callout bubble"], ["badge", "Step number"], ["highlight", "Highlight"], ["redact", "Blur / hide area"]];
	var KNAMES = {}; KINDS.forEach(function (k) { KNAMES[k[0]] = k[1]; });
	PE.defTool({ id: "shape", name: "Shapes & Annotations", key: "u", icon: "▭", opts: { kind: "rect", fill: false, stroke: true, width: 6, radius: 12, opacity: 100, newLayer: true, shadow: false, badge: 56, next: 1, redact: "pixelate", amount: 14 },
		ui: [{ k: "kind", label: "Shape", type: "select", options: KINDS }, { k: "stroke", label: "Outline", type: "check", hideFor: ["line", "arrow", "badge", "highlight", "redact"] }, { k: "fill", label: "Fill (background colour)", type: "check", hideFor: ["line", "arrow", "badge", "highlight", "redact"] }, { k: "width", label: "Line width", type: "range", min: 1, max: 80, step: 1, unit: "px", hideFor: ["badge", "highlight", "redact"] }, { k: "radius", label: "Corner radius", type: "range", min: 0, max: 120, step: 1, unit: "px", showFor: ["round", "callout"] },
			{ k: "badge", label: "Badge size", type: "range", min: 20, max: 200, step: 2, unit: "px", showFor: ["badge"] }, { k: "next", label: "Next number", type: "number", showFor: ["badge"] },
			{ k: "redact", label: "Hide with", type: "seg", options: [["pixelate", "Pixelate"], ["blur", "Blur"], ["solid", "Solid"]], showFor: ["redact"] }, { k: "amount", label: "Strength", type: "range", min: 4, max: 60, step: 1, showFor: ["redact"] },
			{ k: "opacity", label: "Opacity", type: "range", min: 5, max: 100, step: 1, unit: "%", hideFor: ["redact"] }, { k: "shadow", label: "Drop shadow", type: "check", hideFor: ["redact", "highlight"] }, { k: "newLayer", label: "On a new layer", type: "check", hideFor: ["redact"] }],
		hint: "Drag to draw (Shift = square / straight). Outline uses the foreground colour, fill uses the background colour. Step numbers: just click. Each lands on its own layer so you can move or delete it.",
		down: function (e) { var o = PE.opt.shape; sh = { a: e, b: e, sq: false }; if (o.kind === "badge") { sh.b = e; } },
		move: function (e) { if (sh) { sh.b = e; sh.sq = e.shift; PE.invalidateOverlay(); } },
		up: function (e) {
			var s = sh; sh = null; if (!s) return; var o = PE.opt.shape, kind = o.kind, a = s.a, b = s.b;
			if (kind !== "badge" && Math.hypot(b.x - a.x, b.y - a.y) < 3) return;
			var box = shapeBox(kind, a, b, o, s.sq);
			if (kind === "redact") { redact(box, norm(a, b, s.sq), o); return; }
			var c = mk(box.w, box.h), x = c.getContext("2d"); x.translate(-box.x, -box.y); drawShape(x, kind, a, b, o, s.sq); x.setTransform(1, 0, 0, 1, 0, 0);
			var op = o.opacity / 100;
			if (PE.sel) PE.restrictToSel(x, box.x, box.y, box.w, box.h);
			if (o.newLayer || !PE.active()) { var L = PE.makeLayer({ canvas: c, x: box.x, y: box.y, name: KNAMES[kind] }); L.opacity = op; if (kind === "highlight") L.blend = "multiply"; PE.addLayer(L); PE.commit("Add " + KNAMES[kind].toLowerCase()); }
			else { var A = PE.active(); if (!PE.prepare(A)) return; PE.paintInto(A, c, box.x, box.y, { alpha: op }); PE.commit(KNAMES[kind]); }
			if (kind === "badge") { PE.opt.shape.next++; PE.emit("opts", "shape"); }
		},
		overlay: function (x) {
			if (!sh) return; var o = PE.opt.shape, v = PE.view, kind = o.kind; x.save(); x.setTransform(v.dpr * v.zoom, 0, 0, v.dpr * v.zoom, v.dpr * v.px, v.dpr * v.py); x.globalAlpha = kind === "redact" ? 1 : o.opacity / 100;
			if (kind === "redact") { var r = norm(sh.a, sh.b, sh.sq); x.setLineDash([6 / v.zoom, 5 / v.zoom]); x.lineWidth = 1.5 / v.zoom; x.strokeStyle = "#ff3d3d"; x.fillStyle = "rgba(255,61,61,0.15)"; x.fillRect(r.x, r.y, r.w, r.h); x.strokeRect(r.x, r.y, r.w, r.h); }
			else drawShape(x, kind, sh.a, sh.b, o, sh.sq); x.restore();
		}, cancel: function () { sh = null; } });
	function redact(box, r, o) {
		var x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(PE.doc.w, Math.ceil(r.x + r.w)), y1 = Math.min(PE.doc.h, Math.ceil(r.y + r.h)), w = x1 - x0, h = y1 - y0; if (w < 2 || h < 2) return;
		var flat = PE.flatten(), c = mk(w, h), x = c.getContext("2d"); x.drawImage(flat, x0, y0, w, h, 0, 0, w, h);
		if (o.redact === "solid") { x.fillStyle = PE.fg; x.fillRect(0, 0, w, h); } else { var id = x.getImageData(0, 0, w, h); if (o.redact === "blur") P.gaussianBlur(id.data, w, h, o.amount); else P.pixelate(id.data, w, h, Math.max(2, o.amount)); x.putImageData(id, 0, 0); }
		if (PE.sel) PE.restrictToSel(x, x0, y0, w, h);
		var L = PE.makeLayer({ canvas: c, x: x0, y: y0, name: o.redact === "solid" ? "Hidden area" : o.redact === "blur" ? "Blurred area" : "Pixelated area" }); PE.addLayer(L, PE.doc.layers.length); PE.commit("Hide area");
	}
})();
