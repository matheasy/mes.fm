/* MES Photo Editor tools, part 2: text (with label backgrounds), shapes + annotations (arrows, callouts, step badges, highlights, redact), option plumbing. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk, rgba = PE.rgba;
	PE.optGet = function (id, k) { var t = PE.tools[id]; if (t.optGet) { var ov = t.optGet(k); if (ov !== undefined) return ov; } if (t.optsTarget) { var tg = t.optsTarget(); if (tg) return tg[k]; } return PE.opt[id][k]; };
	PE.optSet = function (id, k, v) { var t = PE.tools[id]; PE.opt[id][k] = v; if (t.optsTarget) { var tg = t.optsTarget(); if (tg && tg !== PE.opt[id]) { tg[k] = v; if (t.onopt) t.onopt(k, v); } } PE.emit("opts", id); PE.invalidateOverlay(); };

	/* ---------- fonts ---------- */
	PE.FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["system-ui, -apple-system, 'Segoe UI', sans-serif", "System UI"], ["Verdana, Geneva, sans-serif", "Verdana"], ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Tahoma, sans-serif", "Tahoma"], ["Impact, 'Arial Black', sans-serif", "Impact"], ["Georgia, serif", "Georgia"], ["'Times New Roman', Times, serif", "Times New Roman"], ["'Palatino Linotype', Palatino, serif", "Palatino"], ["'Courier New', Courier, monospace", "Courier New"], ["ui-monospace, Menlo, Consolas, monospace", "Monospace"], ["'Comic Sans MS', 'Comic Neue', cursive", "Comic Sans"], ["'Brush Script MT', cursive", "Brush Script"]];
	PE.loadFontFile = function (file) {
		var name = file.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]/g, "");
		return file.arrayBuffer().then(function (ab) { var ff = new FontFace(name, ab); return ff.load().then(function () { document.fonts.add(ff); PE.FONTS.push(["'" + name + "', sans-serif", name + " (yours)"]); PE.emit("fonts"); PE.optSet("text", "font", "'" + name + "', sans-serif"); }); });
	};

	/* ---------- text: edited in place on the canvas, like GIMP ----------
	 * The rendered layer IS what you see while typing: a hidden <textarea> only collects the keys (typing, IME, clipboard, undo inside the box), and the caret,
	 * the selection and the frame are drawn on the overlay from PE.textLayout(L), so they always sit exactly on the letters (also on a rotated or scaled layer).
	 * One edit session = one undo step ("Add text" / "Edit text"), whatever was typed or restyled in between. */
	var te = null, hoverT = null, blinkOn = true, blinkT = 0, tdrag = null, lastDbl = { t: 0, x: 0, y: 0 };
	function editor() { return PE.els.textedit; }
	function locToDoc(L, u, v) { var c = Math.cos(L.rot), s = Math.sin(L.rot), lx = (u - L.canvas.width / 2) * L.sx, ly = (v - L.canvas.height / 2) * L.sy; return { x: L.cx + c * lx - s * ly, y: L.cy + s * lx + c * ly }; }
	function frameOf(L) { var lay = PE.textLayout(L), p = lay.pad, g = Math.max(2, lay.size * 0.06); return { u0: p - g, v0: p - g, u1: p + lay.mw + g, v1: p + lay.bh + g }; }
	function placeEditor() {   // the (invisible) key catcher sits over the text so an IME pop-up opens next to it
		if (!te) return; var L = te.L, ta = editor(), t = L.text, v = PE.view, c = Math.cos(L.rot), s = Math.sin(L.rot), lay = PE.textLayout(L), pad = lay.pad;
		var dp = locToDoc(L, pad, pad), sp = PE.toScreen(dp.x, dp.y), z = v.zoom;
		ta.style.cssText = "display:block;left:0;top:0;transform-origin:0 0;transform:matrix(" + (c * L.sx * z) + "," + (s * L.sx * z) + "," + (-s * L.sy * z) + "," + (c * L.sy * z) + "," + sp.x + "," + sp.y + ");font:" + (t.italic ? "italic " : "") + (t.bold ? "bold " : "") + t.size + "px/" + (t.size * t.lh) + "px " + t.font + ";text-align:" + t.align + ";white-space:pre-wrap;overflow:hidden;width:" + Math.max(20, lay.mw + 4) + "px;height:" + (lay.lhp * lay.lines.length + t.size * 0.2) + "px;letter-spacing:" + (t.ls || 0) + "px;";
	}
	PE.placeTextEditor = placeEditor;
	function poke() { blinkOn = true; PE.invalidateOverlay(); }
	function hitText(e, prefer) {   // the text layer under a point: its whole text box counts (clicking between letters edits, it does not start a new text)
		if (prefer && PE.effVisible(prefer) && PE.layerAtPoint(prefer, e.x, e.y)) return prefer;
		var ls = PE.doc.layers; for (var i = ls.length - 1; i >= 0; i--) { var L = ls[i]; if (L.type !== "text" || !L.text || !PE.effVisible(L) || L.locked) continue; if (PE.layerAtPoint(L, e.x, e.y)) return L; }
		return null;
	}
	function indexAt(L, x, y) {
		var lay = PE.textLayout(L), p = PE.toLayerPt(L, x, y), n = lay.lines.length, i = Math.max(0, Math.min(n - 1, Math.floor((p.y - lay.pad) / lay.lhp)));
		return P.hitInLine(lay.lines[i], p.x - lay.lx[i], lay.measure);
	}
	function focusIdx(ta) { return ta.selectionDirection === "backward" ? ta.selectionStart : ta.selectionEnd; }
	function anchorIdx(ta) { return ta.selectionDirection === "backward" ? ta.selectionEnd : ta.selectionStart; }
	function setSel(a, b) { var ta = editor(); if (b >= a) ta.setSelectionRange(a, b, "forward"); else ta.setSelectionRange(b, a, "backward"); poke(); }
	function openEdit(L, isNew, caret) {
		if (te && te.L === L) { if (caret != null) { var ta0 = editor(); if (caret === "all") ta0.select(); else ta0.setSelectionRange(caret, caret); } poke(); return; }
		if (te) PE.endTextEdit(false);
		te = { L: L, isNew: isNew, orig: JSON.stringify(L.text) }; var ta = editor(); ta.value = L.text.str; placeEditor(); PE.emit("opts", "text");
		var put = function () { if (!te || te.L !== L) return; if (document.activeElement !== ta) ta.focus({ preventScroll: true }); if (caret === "all") ta.select(); else { var k = caret == null ? ta.value.length : caret; ta.setSelectionRange(k, k); } poke(); };
		put(); setTimeout(function () { if (te && te.L === L && document.activeElement !== ta) put(); }, 60);
		clearInterval(blinkT); blinkT = setInterval(function () { if (!te) { clearInterval(blinkT); return; } blinkOn = !blinkOn; PE.invalidateOverlay(); }, 530);
	}
	function dropLayer(L) { PE.doc.layers.splice(PE.doc.layers.indexOf(L), 1); if (!PE.doc.layers.length) PE.doc.layers.push(PE.makeLayer({ name: "Layer 1" })); PE.doc.activeId = PE.doc.layers[PE.doc.layers.length - 1].id; PE.emit("layers"); PE.invalidate(); }
	PE.endTextEdit = function (cancel) {
		if (!te) return; var e = te; te = null; tdrag = null; clearInterval(blinkT); var ta = editor(); ta.style.display = "none"; if (document.activeElement === ta) ta.blur(); var L = e.L;
		if (PE.doc.layers.indexOf(L) < 0) { PE.invalidateOverlay(); return; }   // gone meanwhile (undo, delete)
		if (e.isNew && (cancel || !L.text.str.trim())) { dropLayer(L); return; }
		var nm = L.text.str.split("\n")[0].slice(0, 24) || "Text";
		if (e.isNew) { L.name = nm; PE.commit("Add text"); } else if (JSON.stringify(L.text) !== e.orig) { if (L.text.str !== JSON.parse(e.orig).str) L.name = nm; PE.commit("Edit text"); }
		PE.invalidate();
	};
	PE.textEditing = function () { return !!te; };
	PE.focusText = function () { if (te) { var ta = editor(); if (document.activeElement !== ta) ta.focus({ preventScroll: true }); } };
	function lineMove(dir, shift, ta) {   // Up / Down / Home / End follow the lines as they are drawn on the canvas (the hidden box wraps differently)
		var L = te.L, lay = PE.textLayout(L), f = focusIdx(ta), cl = P.caretLine(lay.lines, f), line = lay.lines[cl.line], nIdx;
		if (dir === "home") nIdx = line.start; else if (dir === "end") nIdx = line.end;
		else { var x = lay.lx[cl.line] + lay.measure(line.text.slice(0, cl.k), line.start), j = cl.line + dir; if (j < 0) nIdx = 0; else if (j >= lay.lines.length) nIdx = ta.value.length; else nIdx = P.hitInLine(lay.lines[j], x - lay.lx[j], lay.measure); }
		setSel(shift ? anchorIdx(ta) : nIdx, nIdx);
	}
	PE.initTextEditor = function () {
		var ta = editor();
		ta.addEventListener("input", function () { if (!te) return; var tt = te.L.text; if (PE.textRich(tt) || tt.rich) { var nr = P.richNorm(P.richEdit(tt.rich || String(PE.textMask(tt)).repeat(tt.str.length), tt.str, ta.value, PE.textMask(tt))); tt.rich = nr.rich; if (nr.mask != null) normFlags(tt, nr.mask); } tt.str = ta.value; PE.renderText(te.L); PE.touch(te.L); placeEditor(); poke(); });
		ta.addEventListener("keydown", function (e) {
			e.stopPropagation(); if (!te) return; var mod = e.ctrlKey || e.metaKey;
			if (e.key === "Escape" || (e.key === "Enter" && mod)) { e.preventDefault(); PE.endTextEdit(false); return; }
			if (mod && !e.altKey && !e.shiftKey) { var kb = e.key.toLowerCase(), bit = kb === "b" ? 1 : kb === "i" ? 2 : kb === "u" ? 4 : 0; if (bit) { e.preventDefault(); PE.textToggleStyle(bit); return; } }   // Ctrl / Cmd + B, I, U: bold / italic / underline the selected letters (all of the text when nothing is selected)
			if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !mod && !e.altKey) { e.preventDefault(); lineMove(e.key === "ArrowUp" ? -1 : 1, e.shiftKey, ta); return; }
			if ((e.key === "Home" || e.key === "End") && !mod) { e.preventDefault(); lineMove(e.key === "Home" ? "home" : "end", e.shiftKey, ta); return; }
			setTimeout(poke, 0);
		});
		["keyup", "select", "focus"].forEach(function (t) { ta.addEventListener(t, function () { poke(); selStyleSync(); }); });
		ta.addEventListener("blur", function () { setTimeout(function () {
			var a = document.activeElement, opts = document.getElementById("pe-opts");
			if (!te || a === ta || PE.keepTextEdit) return;
			if (a && opts && opts.contains(a)) return;   // changing the font / size / colour in the option bar keeps the edit going (one undo step)
			PE.endTextEdit(false); }, 120); });
		PE.on("view", function () { if (te) placeEditor(); });
		var opts = document.getElementById("pe-opts");   // a click on the option bar's background must not take the keyboard away from the text
		if (opts) opts.addEventListener("mousedown", function (e) { if (te && !(e.target.closest && e.target.closest("input,select,textarea,button,label,a"))) e.preventDefault(); });
		/* keys that reach the page while a text is open but the key catcher lost focus (a click somewhere neutral): type them into the text instead of
		 * letting them act as tool shortcuts ("b" would switch to the brush) */
		PE.textKey = function (e) {
			if (!te) return false; var k = e.key; if (e.ctrlKey || e.metaKey || e.altKey) return false;
			if (k === "Escape") { PE.endTextEdit(false); return true; }
			ta.focus({ preventScroll: true });
			if (k.length === 1) { var a = ta.selectionStart, b = ta.selectionEnd; ta.setRangeText(k, a, b, "end"); ta.dispatchEvent(new Event("input")); }
			else if (k === "Enter") { var a2 = ta.selectionStart; ta.setRangeText("\n", a2, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); }
			return true;
		};
		PE.on("history", function () { if (te && PE.doc.layers.indexOf(te.L) < 0) { te = null; clearInterval(blinkT); ta.style.display = "none"; } });   // undo / redo replaced the layer objects
	};
	var ctimer = 0;
	/* ---------- bold / italic / underline of a range (rich text) ---------- */
	function normFlags(t, m) { t.bold = !!(m & 1); t.italic = !!(m & 2); t.underline = !!(m & 4); }
	var BITS = { bold: 1, italic: 2, underline: 4 };
	/* set (force = true / false) or toggle (force = null) one style bit on the characters a..b of a text layer; the whole text when a..b is empty */
	function styleRange(L, bit, a, b, force) {
		var t = L.text, n = String(t.str).length, key = bit === 1 ? "bold" : bit === 2 ? "italic" : "underline";
		if (!n) { t[key] = force != null ? !!force : !t[key]; t.rich = null; return; }
		if (a == null || b == null || a === b) { a = 0; b = n; }
		var r = PE.textRich(t) || String(PE.textMask(t)).repeat(n), on = force != null ? !!force : !P.richAll(r, a, b, bit);
		var nm = P.richNorm(P.richSet(r, a, b, bit, on)); t.rich = nm.rich; normFlags(t, nm.mask);
	}
	PE.textStyleRange = styleRange;
	function selRange() { if (!te) return null; var ta = editor(); return ta.selectionStart !== ta.selectionEnd ? [ta.selectionStart, ta.selectionEnd] : null; }
	/* Ctrl / Cmd + B, I, U (also outside the text box: then it is the whole active text layer) */
	PE.textToggleStyle = function (bit) {
		var L = te ? te.L : PE.active(); if (!L || L.type !== "text" || !L.text) return false; var rg = selRange();
		styleRange(L, bit, rg ? rg[0] : null, rg ? rg[1] : null, null); PE.renderText(L); PE.touch(L);
		if (te) { placeEditor(); poke(); } else PE.commit(bit === 1 ? "Bold" : bit === 2 ? "Italic" : "Underline");
		lastSig = ""; PE.emit("opts", "text"); return true;
	};
	/* the B / I / U ticks in the option bar show the selected letters while a text is open */
	var lastSig = "";
	function selStyleSync() { if (!te) return; var sg = ["bold", "italic", "underline"].map(function (k) { return PE.optGet("text", k) ? 1 : 0; }).join("") + (selRange() ? "s" : ""); if (sg !== lastSig) { lastSig = sg; PE.emit("opts", "text"); } }

	/* ---------- the text box on the canvas: drag its edges to set the wrap width; with Auto-fit text also its height (the font size follows) ----------
	 * Handles sit on the text frame (not on the layer's padding). hx / hy = 0, 0.5 or 1 across / down the frame; the opposite side stays where it is. */
	var bw = null;   // a text-box drag in the Text tool
	var SIDES = [[0, 0.5], [1, 0.5]], ALL8 = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
	function boxHandles(L) {
		if (!L || L.type !== "text" || !L.text || L.locked || !PE.effVisible(L)) return []; var lay = PE.textLayout(L), p = lay.pad;
		var o0 = PE.toScreen.apply(null, xy(locToDoc(L, 0, 0))), oX = PE.toScreen.apply(null, xy(locToDoc(L, 1, 0))), oY = PE.toScreen.apply(null, xy(locToDoc(L, 0, 1))), ux = unit(oX.x - o0.x, oX.y - o0.y), uy = unit(oY.x - o0.x, oY.y - o0.y);
		// the grips sit 8 px outside the box so they never cover the first / last letter
		return (lay.fit || L.text.fit ? ALL8 : SIDES).map(function (h) { var d = locToDoc(L, p + h[0] * lay.mw, p + h[1] * lay.bh), sc = PE.toScreen(d.x, d.y), kx = (h[0] - 0.5) * 2 * 8, ky = (h[1] - 0.5) * 2 * 8; return { hx: h[0], hy: h[1], x: d.x, y: d.y, s: { x: sc.x + ux[0] * kx + uy[0] * ky, y: sc.y + ux[1] * kx + uy[1] * ky } }; });
	}
	function scrOf(e) { var r = PE.els.over.getBoundingClientRect(); return { x: e.sx - r.left, y: e.sy - r.top }; }
	/* the handle under the pointer: a dot within 9 px, or anywhere along a left / right edge (5 px) */
	PE.textBoxHit = function (L, e) {
		var hs = boxHandles(L); if (!hs.length) return null; var sp = scrOf(e), best = null, bd = 9.5;
		hs.forEach(function (h) { var d = Math.hypot(h.s.x - sp.x, h.s.y - sp.y); if (d < bd) { bd = d; best = h; } }); if (best) return best;
		var lay = PE.textLayout(L), p = lay.pad;
		for (var i = 0; i < hs.length; i++) { var h = hs[i]; if (h.hy !== 0.5) continue; var a = PE.toScreen.apply(null, xy(locToDoc(L, p + h.hx * lay.mw, p))), b = PE.toScreen.apply(null, xy(locToDoc(L, p + h.hx * lay.mw, p + lay.bh))), vx = b.x - a.x, vy = b.y - a.y, ll = vx * vx + vy * vy || 1, tt = ((sp.x - a.x) * vx + (sp.y - a.y) * vy) / ll; if (tt < 0 || tt > 1) continue; if (Math.hypot(a.x + vx * tt - sp.x, a.y + vy * tt - sp.y) < 5) return h; }
		return null;
	};
	function xy(d) { return [d.x, d.y]; }
	function unit(x, y) { var l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
	PE.textBoxCursor = function (h, L) { if (!h) return ""; var r = ((L.rot % Math.PI) + Math.PI) % Math.PI, turned = r > Math.PI / 4 && r < Math.PI * 3 / 4; if (h.hy === 0.5) return turned ? "ns-resize" : "ew-resize"; if (h.hx === 0.5) return turned ? "ew-resize" : "ns-resize"; return (h.hx === h.hy) !== turned ? "nwse-resize" : "nesw-resize"; };
	PE.textBoxStart = function (L, h) {
		var lay = PE.textLayout(L), p = lay.pad, f = locToDoc(L, p + (1 - h.hx) * lay.mw, p + (1 - h.hy) * lay.bh);
		return { L: L, h: h, fixed: f, orig: JSON.stringify(L.text), cx: L.cx, cy: L.cy, moved: false };
	};
	PE.textBoxMove = function (b, e) {
		var L = b.L, t = L.text, h = b.h, c = Math.cos(L.rot), s = Math.sin(L.rot), dx = e.x - b.fixed.x, dy = e.y - b.fixed.y, du = (c * dx + s * dy) / L.sx, dv = (-s * dx + c * dy) / L.sy;
		if (h.hx !== 0.5) t.wrapW = Math.max(20, Math.round(h.hx === 1 ? du : -du));
		if (h.hy !== 0.5 && t.fit) { t.boxH = Math.max(12, Math.round(h.hy === 1 ? dv : -dv)); if (!(t.wrapW > 0)) t.wrapW = Math.round(PE.textLayout(L).mw); }
		PE.renderText(L); var lay = PE.textLayout(L), p = lay.pad, n = locToDoc(L, p + (1 - h.hx) * lay.mw, p + (1 - h.hy) * lay.bh); L.cx += b.fixed.x - n.x; L.cy += b.fixed.y - n.y;   // the opposite side stays put
		b.moved = true; PE.touch(L); if (te && te.L === L) placeEditor(); PE.emit("opts", PE.toolId === "text" ? "text" : PE.toolId);
	};
	PE.textBoxAbort = function (b) { b.L.text = JSON.parse(b.orig); PE.renderText(b.L); b.L.cx = b.cx; b.L.cy = b.cy; PE.touch(b.L); };
	PE.drawTextBoxHandles = function (x, L) { boxHandles(L).forEach(function (h) { var sp = h.s; x.fillStyle = "#a78bfa"; x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); if (h.hy === 0.5) x.rect(sp.x - 5, sp.y - 11, 10, 22); else if (h.hx === 0.5) x.rect(sp.x - 11, sp.y - 5, 22, 10); else x.rect(sp.x - 6, sp.y - 6, 12, 12); x.fill(); x.stroke(); }); };
	PE.textAt = function (e) { return hitText(e, null); };
	PE.drawTextFrame = function (x, L, solid) { drawFrame(x, L, solid); };
	function drawFrame(x, L, solid) {
		var f = frameOf(L), pts = [[f.u0, f.v0], [f.u1, f.v0], [f.u1, f.v1], [f.u0, f.v1]].map(function (q) { var d = locToDoc(L, q[0], q[1]); return PE.toScreen(d.x, d.y); });
		x.save(); x.lineWidth = 1; x.setLineDash(solid ? [] : [4, 3]); x.strokeStyle = "rgba(0,0,0,0.65)"; x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x + 0.5, p.y + 0.5) : x.moveTo(p.x + 0.5, p.y + 0.5); }); x.closePath(); x.stroke();
		x.lineDashOffset = solid ? 0 : 3.5; x.strokeStyle = solid ? "#a78bfa" : "rgba(255,255,255,0.85)"; x.lineWidth = solid ? 1.5 : 1; x.stroke(); x.restore();
	}
	function drawCaret(x, v) {
		var L = te.L, ta = editor(), lay = PE.textLayout(L), a = ta.selectionStart, b = ta.selectionEnd, sz = lay.size, sc = v.zoom * Math.max(1e-6, Math.abs(L.sx));
		x.save(); x.translate(v.px, v.py); x.scale(v.zoom, v.zoom); var c = Math.cos(L.rot), s = Math.sin(L.rot); x.transform(c * L.sx, s * L.sx, -s * L.sy, c * L.sy, L.cx, L.cy); x.translate(-L.canvas.width / 2, -L.canvas.height / 2);
		if (a !== b) {
			x.fillStyle = "rgba(59,130,246,0.38)";
			lay.lines.forEach(function (ln, i) {
				var s0 = Math.max(a, ln.start), s1 = Math.min(b, ln.end); var past = b > ln.end && a <= ln.end;   // the selection runs on past this line: show the line break as selected too
				if (s1 < s0 || (s1 === s0 && !past)) return; var x0 = lay.lx[i] + lay.measure(ln.text.slice(0, s0 - ln.start), ln.start), x1 = lay.lx[i] + lay.measure(ln.text.slice(0, s1 - ln.start), ln.start) + (past ? sz * 0.25 : 0);
				x.fillRect(x0, lay.base[i] - sz * 0.86, x1 - x0, sz * 1.1);
			});
		} else if (blinkOn) {
			var cl = P.caretLine(lay.lines, focusIdx(ta)), ln = lay.lines[cl.line], cx = lay.lx[cl.line] + lay.measure(ln.text.slice(0, cl.k), ln.start), y0 = lay.base[cl.line] - sz * 0.86, y1 = lay.base[cl.line] + sz * 0.24;
			x.lineCap = "butt"; x.strokeStyle = "rgba(255,255,255,0.95)"; x.lineWidth = 4 / sc; x.beginPath(); x.moveTo(cx, y0); x.lineTo(cx, y1); x.stroke(); x.strokeStyle = "#111"; x.lineWidth = 2 / sc; x.stroke();
		}
		x.restore();
	}
	PE.defTool({ id: "text", name: "Text / Label", key: "t", icon: "T", opts: JSON.parse(JSON.stringify(PE.TEXTDEF)), hint: "Click empty canvas to add text, click a text to edit it (caret where you click, drag to select, double-click a word, triple-click a line). Ctrl/Cmd+B, I, U = bold, italic, underline of the selected letters. Drag the purple handles on the box edges to wrap the text (with Auto-fit text: the corners too, and the size follows). Enter = new line, Ctrl+Enter, Esc or a click outside = done.",
		ui: [{ k: "font", label: "Font", type: "select", options: "fonts" }, { k: "size", label: "Size", type: "range", min: 6, max: 400, step: 1, unit: "px" }, { k: "wrapW", label: "Box width (0 = auto)", type: "range", min: 0, max: 4000, step: 10, unit: "px" }, { k: "fit", label: "Auto-fit text", type: "check" }, { k: "boxH", label: "Box height", type: "range", min: 0, max: 4000, step: 10, unit: "px", show: "fit" }, { k: "bold", label: "Bold", type: "check" }, { k: "italic", label: "Italic", type: "check" }, { k: "underline", label: "Underline", type: "check" }, { k: "align", label: "Align", type: "seg", options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] }, { k: "lh", label: "Line height", type: "range", min: 0.8, max: 3, step: 0.05 }, { k: "ls", label: "Letter spacing", type: "range", min: -10, max: 60, step: 1, unit: "px" }, { k: "color", label: "Colour", type: "color" },
			{ k: "bgOn", label: "Background box", type: "check" }, { k: "bgColor", label: "Box colour", type: "color", show: "bgOn" }, { k: "bgPad", label: "Padding", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" }, { k: "bgRadius", label: "Corners", type: "range", min: 0, max: 80, step: 1, unit: "px", show: "bgOn" },
			{ k: "strokeOn", label: "Outline", type: "check" }, { k: "stroke", label: "Outline colour", type: "color", show: "strokeOn" }, { k: "strokeW", label: "Outline width", type: "range", min: 0, max: 40, step: 1, unit: "px", show: "strokeOn" },
			{ k: "shadowOn", label: "Shadow", type: "check" }, { k: "shadow", label: "Shadow colour", type: "color", show: "shadowOn" }, { k: "shadowBlur", label: "Blur", type: "range", min: 0, max: 60, step: 1, unit: "px", show: "shadowOn" }, { k: "shadowDx", label: "Shadow X", type: "range", min: -60, max: 60, step: 1, unit: "px", show: "shadowOn" }, { k: "shadowDy", label: "Shadow Y", type: "range", min: -60, max: 60, step: 1, unit: "px", show: "shadowOn" },
			{ type: "button", label: "Load font file…", act: function () { PE.pickFontFile(); } }, { type: "button", label: "Yellow label", act: function () { preset({ bgOn: true, bgColor: "#ffeb3b", color: "#111111", bold: true, bgPad: 14, bgRadius: 8 }); } }, { type: "button", label: "Red callout", act: function () { preset({ bgOn: true, bgColor: "#e53935", color: "#ffffff", bold: true, bgPad: 14, bgRadius: 10 }); } }, { type: "button", label: "Meme text", act: function () { preset({ bgOn: false, color: "#ffffff", strokeOn: true, stroke: "#000000", strokeW: 6, bold: true, font: "Impact, 'Arial Black', sans-serif", align: "center" }); } }],
		optsTarget: function () { var L = PE.active(); return L && L.type === "text" && L.text ? L.text : null; },
		optGet: function (k) {   // B / I / U while a text is open show the selected letters; with mixed styles, ticked = every letter has it
			if (!BITS[k]) return undefined; var L = te ? te.L : PE.active(); if (!L || L.type !== "text" || !L.text) return undefined; var t = L.text, r = PE.textRich(t), rg = selRange();
			if (rg) return P.richAll(r || String(PE.textMask(t)).repeat(t.str.length), rg[0], rg[1], BITS[k]); return undefined;
		},
		onopt: function (k, v) { var L = PE.active(); if (!L || L.type !== "text") return; var t = L.text;
			if (BITS[k]) { var rg = te && te.L === L ? selRange() : null; if (rg) styleRange(L, BITS[k], rg[0], rg[1], v); else if (PE.textRich(t)) styleRange(L, BITS[k], 0, t.str.length, v); lastSig = ""; }
			if (k === "fit" && v) { var ly = PE.textLayout(L); if (!(t.wrapW > 0)) t.wrapW = Math.round(ly.mw); if (!(t.boxH > 0)) t.boxH = Math.round(ly.bh); setTimeout(function () { PE.emit("opts", "text"); }, 0); }
			if (k === "size" && t.fit) { t.fit = false; PE.opt.text.fit = false; PE.toast("Auto-fit text is off now, so the size you set is kept"); setTimeout(function () { PE.emit("opts", "text"); }, 0); }
			PE.renderText(L); PE.touch(L); if (te) { placeEditor(); poke(); return; } clearTimeout(ctimer); ctimer = setTimeout(function () { PE.commit("Text style"); }, 450); },   // while editing, the style change is part of the edit's one undo step
		overlay: function (x, v) {
			var A = PE.active();
			if (hoverT && hoverT !== A && PE.doc.layers.indexOf(hoverT) >= 0 && !te) drawFrame(x, hoverT, false);
			if (A && A.type === "text" && A.text) { drawFrame(x, A, !!te); if (te && te.L === A) drawCaret(x, v); }
			if (A && A.type === "text" && A.text) PE.drawTextBoxHandles(x, A);
		},
		hover: function (e) { if (!PE.doc) return; var h = hitText(e, null); if (h !== hoverT) { hoverT = h; PE.invalidateOverlay(); } var A = PE.active(), hh = A && A.type === "text" ? PE.textBoxHit(A, e) : null; PE.els.over.style.cursor = hh ? PE.textBoxCursor(hh, A) : "text"; },
		move: function (e) {
			if (bw) { PE.textBoxMove(bw, e); return; }
			if (tdrag && te) { setSel(tdrag.a, indexAt(te.L, e.x, e.y)); }
		},
		up: function () { if (bw) { var w0 = bw; bw = null; if (w0.moved && !te) PE.commit("Text box"); } tdrag = null; },
		dbl: function (e) { if (!te || !PE.layerAtPoint(te.L, e.x, e.y)) return; var w = P.wordAt(te.L.text.str, indexAt(te.L, e.x, e.y)); setSel(w[0], w[1]); tdrag = null; lastDbl = { t: Date.now(), x: e.sx, y: e.sy }; },
		down: function (e) {
			var A0 = te ? te.L : PE.active(), hh = A0 && A0.type === "text" ? PE.textBoxHit(A0, e) : null; if (hh) { bw = PE.textBoxStart(A0, hh); return; }
			var hit = hitText(e, te ? te.L : PE.active());
			if (te && hit === te.L) {
				var idx = indexAt(hit, e.x, e.y), ta = editor();
				if (Date.now() - lastDbl.t < 450 && Math.hypot(e.sx - lastDbl.x, e.sy - lastDbl.y) < 6) { var lay = PE.textLayout(hit), ln = lay.lines[P.caretLine(lay.lines, idx).line]; setSel(ln.start, ln.end); lastDbl.t = 0; return; }   // triple-click = the whole line
				var a = e.shift ? anchorIdx(ta) : idx; setSel(a, idx); tdrag = { a: a }; PE.focusText(); return;
			}
			if (te) { PE.endTextEdit(false); if (!hit) return; }   // a click outside finishes the edit; the next click on empty canvas starts a new text
			if (hit) { PE.setActive(hit.id); var i2 = indexAt(hit, e.x, e.y); openEdit(hit, false, i2); tdrag = { a: i2 }; return; }
			var o = JSON.parse(JSON.stringify(PE.opt.text)); o.str = ""; var L = PE.makeLayer({ type: "text", name: "Text", text: o, w: 4, h: 4 }); PE.renderText(L); var pd = PE.textLayout(L).pad; L.cx = e.x - pd + L.canvas.width / 2; L.cy = e.y - pd + L.canvas.height / 2;
			PE.addLayer(L); openEdit(L, true, 0);
		}, cancel: function () { if (bw) { PE.textBoxAbort(bw); bw = null; } PE.endTextEdit(false); hoverT = null; } });
	function preset(o) { for (var k in o) PE.optSet("text", k, o[k]); PE.emit("opts", "text"); }
	/* open the active text layer for editing: at = a point on the canvas (caret there, from a double-click with the Move tool), else everything selected */
	PE.editActiveText = function (at) { var L = PE.active(); if (L && L.type === "text") { PE.setTool("text"); openEdit(L, false, at ? indexAt(L, at.x, at.y) : "all"); } };
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
