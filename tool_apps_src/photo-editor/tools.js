/* MES Photo Editor tools, part 1: pointer dispatch (pan / pinch / tools), overlay, move + transform, selection tools, crop, painting (brush, eraser,
 * clone stamp, retouch), bucket, gradient, eyedropper, hand, zoom. Each tool = {id, name, key, icon, opts, ui, down, move, up, overlay, ...}. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, mk = PE.mk;
	PE.tools = {}; PE.toolOrder = []; PE.toolId = "move"; PE.opt = {}; PE.ptr = { x: 0, y: 0, inside: false };
	PE.defTool = function (t) { PE.tools[t.id] = t; PE.toolOrder.push(t.id); PE.opt[t.id] = JSON.parse(JSON.stringify(t.opts || {})); };
	PE.tool = function () { return PE.tools[PE.toolId]; };
	PE.setTool = function (id) { if (!PE.tools[id]) return; var old = PE.tool(); if (old && old.cancel) old.cancel(); PE.toolId = id; PE.emit("tool"); PE.invalidateOverlay(); };
	function rgba(hex, a) { var c = P.hexToRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
	PE.rgba = rgba;
	function ev2(e) { var p = PE.toDoc(e.clientX, e.clientY); return { x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, pressure: e.pointerType === "pen" ? (e.pressure || 0.5) : 1, pen: e.pointerType === "pen", e: e }; }

	/* ---------- pointer dispatch ---------- */
	var down = {}, gesture = null, panning = null, spaceDown = false, current = null;
	PE.setSpace = function (v) { spaceDown = v; };
	PE.initPointer = function () {
		var el = PE.els.over;
		el.addEventListener("pointerdown", function (e) {
			if (!PE.doc) return; el.setPointerCapture(e.pointerId); down[e.pointerId] = { x: e.clientX, y: e.clientY };
			var n = Object.keys(down).length;
			if (n === 2) { if (current && current.abort) current.abort(); current = null; startGesture(); return; }
			if (n > 2) return;
			if (e.button === 1 || e.button === 2 && false || spaceDown || PE.toolId === "hand") { panning = { x: e.clientX, y: e.clientY }; el.style.cursor = "grabbing"; return; }
			if (e.button !== 0) return;
			var t = PE.tool(); if (t.down) { current = t; t.down(ev2(e)); }
		});
		el.addEventListener("pointermove", function (e) {
			var r = el.getBoundingClientRect(); PE.ptr.x = e.clientX - r.left; PE.ptr.y = e.clientY - r.top; PE.ptr.inside = true;
			if (down[e.pointerId]) down[e.pointerId] = { x: e.clientX, y: e.clientY };
			if (gesture) { moveGesture(); return; }
			if (panning) { PE.panBy(e.clientX - panning.x, e.clientY - panning.y); panning = { x: e.clientX, y: e.clientY }; return; }
			var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e]; if (!evs.length) evs = [e];
			if (current && current.move && down[e.pointerId]) evs.forEach(function (c) { current.move(ev2(c)); });
			else { var t = PE.tool(); if (t.hover) t.hover(ev2(e)); }
			PE.emit("pointer", PE.toDoc(e.clientX, e.clientY)); PE.invalidateOverlay();
		});
		function end(e) {
			if (!down[e.pointerId]) return; delete down[e.pointerId];
			if (gesture) { if (Object.keys(down).length < 2) gesture = null; return; }
			if (panning) { panning = null; el.style.cursor = ""; return; }
			if (current) { var t = current; current = null; if (t.up) t.up(ev2(e)); }
			if (PE.focusText) setTimeout(PE.focusText, 0);
			PE.invalidateOverlay();
		}
		el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
		el.addEventListener("pointerleave", function () { PE.ptr.inside = false; PE.invalidateOverlay(); });
		el.addEventListener("dblclick", function (e) { var t = PE.tool(); if (t.dbl && PE.doc) t.dbl(ev2(e)); });
		el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
		el.addEventListener("wheel", function (e) {
			if (!PE.doc) return; e.preventDefault(); var r = el.getBoundingClientRect();
			if (e.ctrlKey || e.metaKey) PE.setZoom(PE.view.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top);
			else if (e.altKey) PE.setZoom(PE.view.zoom * Math.exp(-e.deltaY * 0.004), e.clientX - r.left, e.clientY - r.top);
			else PE.panBy(-(e.shiftKey ? e.deltaY : e.deltaX), -(e.shiftKey ? 0 : e.deltaY));
		}, { passive: false });
	};
	function startGesture() { var k = Object.keys(down), a = down[k[0]], b = down[k[1]]; gesture = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, z: PE.view.zoom }; }
	function moveGesture() {
		var k = Object.keys(down); if (k.length < 2) return; var a = down[k[0]], b = down[k[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = PE.els.over.getBoundingClientRect();
		PE.panBy(cx - gesture.cx, cy - gesture.cy); PE.setZoom(gesture.z * d / gesture.d, cx - r.left, cy - r.top); gesture.cx = cx; gesture.cy = cy;
	}

	/* ---------- overlay: selection ants, tool overlays, brush cursor ---------- */
	var ants = { key: "", a: null, b: null }, phase = 0;
	function buildAnts() {
		var v = PE.view, s = PE.sel; if (!s) return null; var key = [s.ver, v.zoom, v.px, v.py, v.w, v.h, v.dpr].join(","); if (ants.key === key) return ants;
		var W = Math.round(v.w * v.dpr), Hh = Math.round(v.h * v.dpr), t = PE.tmp("ants", W, Hh), x = t.getContext("2d"), z = v.zoom * v.dpr;
		x.setTransform(z, 0, 0, z, v.px * v.dpr, v.py * v.dpr); x.imageSmoothingEnabled = z < 2; x.drawImage(s.c, 0, 0);
		var src = x.getImageData(0, 0, W, Hh).data, ia = new ImageData(W, Hh), ib = new ImageData(W, Hh), da = ia.data, db = ib.data;
		for (var y = 0; y < Hh; y++) for (var xx = 0; xx < W; xx++) {
			var i = (y * W + xx) * 4; if (src[i + 3] <= 127) continue;
			var edge = xx === 0 || y === 0 || xx === W - 1 || y === Hh - 1 || src[i - 4 + 3] <= 127 || src[i + 4 + 3] <= 127 || src[i - W * 4 + 3] <= 127 || src[i + W * 4 + 3] <= 127; if (!edge) continue;
			var on = ((xx + y) >> 2) & 1, o = on ? 255 : 0, o2 = on ? 0 : 255;
			da[i] = da[i + 1] = da[i + 2] = o; da[i + 3] = 255; db[i] = db[i + 1] = db[i + 2] = o2; db[i + 3] = 255;
		}
		var ca = mk(W, Hh), cb = mk(W, Hh); ca.getContext("2d").putImageData(ia, 0, 0); cb.getContext("2d").putImageData(ib, 0, 0); ants = { key: key, a: ca, b: cb }; return ants;
	}
	setInterval(function () { if (PE.sel && !document.hidden) { phase ^= 1; PE.invalidateOverlay(); } }, 450);
	PE.drawOverlay = function () {
		var c = PE.els.over, v = PE.view; if (!c || !v.w) return; var W = Math.round(v.w * v.dpr), Hh = Math.round(v.h * v.dpr);
		if (c.width !== W || c.height !== Hh) { c.width = W; c.height = Hh; }
		var x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, Hh); if (!PE.doc) return;
		if (PE.sel) { var a = buildAnts(); if (a) x.drawImage(phase ? a.b : a.a, 0, 0); }
		x.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
		var t = PE.tool(); if (t && t.overlay) t.overlay(x, v);
		if (PE.guides && PE.guides.length) { x.strokeStyle = "#ff3df0"; x.lineWidth = 1; x.beginPath(); PE.guides.forEach(function (g) { if (g.v != null) { var sx = Math.round(g.v * v.zoom + v.px) + 0.5; x.moveTo(sx, 0); x.lineTo(sx, v.h); } else { var sy = Math.round(g.h * v.zoom + v.py) + 0.5; x.moveTo(0, sy); x.lineTo(v.w, sy); } }); x.stroke(); }
		if (PE.ptr.inside && t && t.cursorSize && !PE.spaceHeld) {
			var r = t.cursorSize() * v.zoom / 2; if (r > 1) { x.lineWidth = 1; x.strokeStyle = "rgba(0,0,0,0.85)"; x.beginPath(); x.arc(PE.ptr.x, PE.ptr.y, r, 0, 6.2832); x.stroke(); x.strokeStyle = "rgba(255,255,255,0.9)"; x.beginPath(); x.arc(PE.ptr.x, PE.ptr.y, r + 1, 0, 6.2832); x.stroke(); }
		}
	};
	PE.handleBox = function (x, cx, cy, s) { x.fillStyle = "#fff"; x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.beginPath(); x.rect(cx - s, cy - s, s * 2, s * 2); x.fill(); x.stroke(); };

	/* ---------- small helpers ---------- */
	function saveOpt(id) { PE.emit("opts", id); }
	PE.sample = function (x, y, n, merged) {
		var h = Math.floor(n / 2), c = mk(n, n), cx = c.getContext("2d"), L = PE.active();
		if (merged || !L) PE.doc.layers.forEach(function (l) { PE.drawLayer(cx, l, [1, 0, 0, 1, -Math.floor(x) + h, -Math.floor(y) + h], "smp", n, n); });
		else PE.drawLayer(cx, L, [1, 0, 0, 1, -Math.floor(x) + h, -Math.floor(y) + h], "smp", n, n);
		var d = cx.getImageData(0, 0, n, n).data, r = 0, g = 0, b = 0, a = 0, k = n * n; for (var i = 0; i < d.length; i += 4) { var al = d[i + 3]; r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; }
		if (!a) return null; return { r: r / a, g: g / a, b: b / a, a: a / k / 255 };
	};
	/* composite a document-space canvas onto the active layer (or its mask), restricted to the selection */
	PE.paintInto = function (L, src, dx, dy, o) {
		o = o || {}; var cv = (o.target === "mask" && L.mask) ? L.mask : L.canvas, og = PE.origin(L), x = cv.getContext("2d"), w = src.width, h = src.height, s = src;
		if (PE.sel) { s = PE.tmp("pi", w, h); s.getContext("2d").drawImage(src, 0, 0); PE.restrictToSel(s.getContext("2d"), Math.round(dx), Math.round(dy), w, h); }
		x.save(); x.globalAlpha = o.alpha == null ? 1 : o.alpha; x.globalCompositeOperation = o.erase ? "destination-out" : "source-over"; x.drawImage(s, Math.round(dx) - og.x, Math.round(dy) - og.y); x.restore(); L.rev++;
	};

	/* ---------- Move + free transform ---------- */
	var HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
	function handleScreen(L, hd) {
		var c = Math.cos(L.rot), s = Math.sin(L.rot), hw = L.canvas.width * L.sx / 2, hh = L.canvas.height * L.sy / 2, lx = hd[0] * hw, ly = hd[1] * hh;
		return PE.toScreen(L.cx + c * lx - s * ly, L.cy + s * lx + c * ly);
	}
	var mv = null;
	PE.defTool({ id: "move", name: "Move / Transform", key: "v", icon: "✥", opts: { auto: true, handles: true, snap: true },
		ui: [{ k: "auto", label: "Pick layer on click", type: "check" }, { k: "handles", label: "Transform handles", type: "check" }, { k: "snap", label: "Snap to canvas edges", type: "check" }, { type: "button", label: "✂ Remove background (AI)", act: function () { PE.aiRemoveBackground(); } }],
		hint: "Drag to move. Drag a square handle to resize, just outside a corner to rotate (Shift = snap / keep proportions). Arrow keys nudge.",
		down: function (e) {
			var L = PE.active(), o = PE.opt.move, z = PE.view.zoom;
			if (L && o.handles && L.visible) {
				for (var i = 0; i < 8; i++) { var s = handleScreen(L, HANDLES[i]); if (Math.hypot(s.x - (e.sx - PE.els.over.getBoundingClientRect().left), s.y - (e.sy - PE.els.over.getBoundingClientRect().top)) < 9) { mv = { kind: "scale", L: L, h: HANDLES[i], sx0: L.sx, sy0: L.sy, cx0: L.cx, cy0: L.cy, rot: L.rot, p0: e }; return; } }
				var rect = PE.els.over.getBoundingClientRect(), px = e.sx - rect.left, py = e.sy - rect.top;
				var corners = [0, 2, 4, 6].map(function (k) { return handleScreen(L, HANDLES[k]); });
				for (i = 0; i < 4; i++) { var dd = Math.hypot(corners[i].x - px, corners[i].y - py); if (dd >= 9 && dd < 30 && !PE.layerAtPoint(L, e.x, e.y)) { mv = { kind: "rot", L: L, a0: Math.atan2(e.y - L.cy, e.x - L.cx), rot0: L.rot }; return; } }
			}
			var hit = o.auto ? PE.layerAt(e.x, e.y) : null;
			if (hit && hit !== L && PE.isBackdrop(hit)) hit = null;       // a full-canvas bottom layer is only moved when it was chosen in the Layers panel
			if (o.auto && hit && hit !== L) { PE.setActive(hit.id); L = hit; }
			else if (o.auto && !hit && !(L && PE.layerAtPoint(L, e.x, e.y))) { mv = null; return; }
			if (!L || L.locked) { if (L && L.locked) PE.toast("This layer is locked"); return; }
			mv = { kind: "move", L: L, cx0: L.cx, cy0: L.cy, p0: e, moved: false };
		},
		move: function (e) {
			if (!mv) return; var L = mv.L;
			if (mv.kind === "move") {
				var dx = Math.round(e.x - mv.p0.x), dy = Math.round(e.y - mv.p0.y); if (e.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
				L.cx = mv.cx0 + dx; L.cy = mv.cy0 + dy; PE.guides = [];
				if (PE.opt.move.snap && !e.ctrl) {
					var b = PE.bounds(L), th = 6 / PE.view.zoom, d = PE.doc, ax = [[b.x, 0], [b.x + b.w, d.w], [b.x + b.w / 2, d.w / 2], [b.x, d.w / 2 - b.w / 2 + b.x - b.x]];
					[[b.x, 0, "l"], [b.x + b.w, d.w, "r"], [b.x + b.w / 2, d.w / 2, "c"]].forEach(function (q) { if (Math.abs(q[0] - q[1]) < th) { L.cx += q[1] - q[0]; PE.guides.push({ v: q[1] }); } });
					b = PE.bounds(L); [[b.y, 0], [b.y + b.h, d.h], [b.y + b.h / 2, d.h / 2]].forEach(function (q) { if (Math.abs(q[0] - q[1]) < th) { L.cy += q[1] - q[0]; PE.guides.push({ h: q[1] }); } });
				}
				mv.moved = true; PE.invalidate();
			} else if (mv.kind === "rot") {
				var a = Math.atan2(e.y - L.cy, e.x - L.cx), r = mv.rot0 + (a - mv.a0); if (e.shift) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12); L.rot = r; mv.moved = true; PE.invalidate();
			} else {
				var c = Math.cos(mv.rot), s = Math.sin(mv.rot), dx2 = e.x - mv.cx0, dy2 = e.y - mv.cy0, lx = c * dx2 + s * dy2, ly = -s * dx2 + c * dy2, hd = mv.h, W0 = L.canvas.width * Math.abs(mv.sx0), H0 = L.canvas.height * Math.abs(mv.sy0);
				var ax = e.alt ? 0 : -hd[0] * W0 / 2, ay = e.alt ? 0 : -hd[1] * H0 / 2, nw = hd[0] ? Math.max(2, (lx - ax) * hd[0] * (e.alt ? 2 : 1)) : W0, nh = hd[1] ? Math.max(2, (ly - ay) * hd[1] * (e.alt ? 2 : 1)) : H0;
				var uniform = (hd[0] && hd[1]) ? !e.shift : e.shift;
				if (uniform && hd[0] && hd[1]) { var f = Math.max(nw / W0, nh / H0); nw = W0 * f; nh = H0 * f; } else if (uniform) { var f2 = hd[0] ? nw / W0 : nh / H0; nw = W0 * f2; nh = H0 * f2; }
				var ncx = e.alt ? 0 : ax + hd[0] * nw / 2, ncy = e.alt ? 0 : ay + hd[1] * nh / 2;
				L.sx = Math.sign(mv.sx0 || 1) * nw / L.canvas.width; L.sy = Math.sign(mv.sy0 || 1) * nh / L.canvas.height; L.cx = mv.cx0 + c * ncx - s * ncy; L.cy = mv.cy0 + s * ncx + c * ncy; mv.moved = true; PE.invalidate();
			}
		},
		up: function () { var m = mv; mv = null; PE.guides = []; if (m && m.moved) { PE.touch(m.L); PE.commit(m.kind === "move" ? "Move layer" : m.kind === "rot" ? "Rotate layer" : "Resize layer"); } PE.invalidateOverlay(); },
		abort: function () { if (mv) { var m = mv; m.L.cx = m.cx0 || m.L.cx; mv = null; } },
		overlay: function (x, v) {
			var L = PE.active(); if (!L || !PE.opt.move.handles || !L.visible) return;
			var pts = PE.corners(L).map(function (p) { return PE.toScreen(p[0], p[1]); }); x.strokeStyle = "#1a73e8"; x.lineWidth = 1.5; x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke();
			for (var i = 0; i < 8; i++) { var s = handleScreen(L, HANDLES[i]); PE.handleBox(x, s.x, s.y, 4.5); }
		} });
	PE.isBackdrop = function (L) { var d = PE.doc, b = PE.bounds(L); return PE.indexOf(L) === 0 && PE.isIdentity(L) && b.x <= 1 && b.y <= 1 && b.x + b.w >= d.w - 1 && b.y + b.h >= d.h - 1; };
	PE.layerAtPoint = function (L, x, y) { var p = PE.toLayerPt(L, x, y); return p.x >= 0 && p.y >= 0 && p.x < L.canvas.width && p.y < L.canvas.height; };
	PE.nudge = function (dx, dy) { var L = PE.active(); if (!L || L.locked) return; L.cx += dx; L.cy += dy; PE.touch(L); clearTimeout(PE._nt); PE._nt = setTimeout(function () { PE.commit("Move layer"); }, 350); };

	/* ---------- selection tools ---------- */
	function selMode(e) { var o = PE.opt[PE.toolId].mode || "new"; return e.shift && e.alt ? "int" : e.shift ? "add" : e.alt ? "sub" : o; }
	var selDrag = null;
	function rectOf(a, b, e, square) { var x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y; if (square) { var d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * d; y1 = y0 + Math.sign(y1 - y0 || 1) * d; } if (e && e.alt && false) { x0 = 2 * a.x - x1; y0 = 2 * a.y - y1; } return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; }
	PE.defTool({ id: "marquee", name: "Rectangular / Elliptical Select", key: "m", icon: "⬚", opts: { shape: "rect", mode: "new", feather: 0 },
		ui: [{ k: "shape", label: "Shape", type: "seg", options: [["rect", "Rectangle"], ["ellipse", "Ellipse"]] }, { k: "mode", label: "Mode", type: "seg", options: [["new", "New"], ["add", "Add"], ["sub", "Subtract"], ["int", "Intersect"]] }, { k: "feather", label: "Feather", type: "range", min: 0, max: 100, step: 1, unit: "px" }],
		hint: "Drag to select. Shift = square / add, Alt = subtract. Drag inside an existing selection to move it. Click to deselect.",
		down: function (e) {
			var inside = PE.sel && PE.opt.marquee.mode === "new" && !e.shift && !e.alt && PE.selMask()[Math.max(0, Math.min(PE.doc.h - 1, Math.floor(e.y))) * PE.doc.w + Math.max(0, Math.min(PE.doc.w - 1, Math.floor(e.x)))] > 127;
			selDrag = inside ? { move: true, p0: e, base: PE.clone(PE.sel.c) } : { a: e, b: e, mode: selMode(e), e: e };
		},
		move: function (e) { if (!selDrag) return; if (selDrag.move) { var dx = Math.round(e.x - selDrag.p0.x), dy = Math.round(e.y - selDrag.p0.y), x = PE.sel.c.getContext("2d"); x.clearRect(0, 0, PE.doc.w, PE.doc.h); x.drawImage(selDrag.base, dx, dy); PE.selChanged(); } else { selDrag.b = e; selDrag.sq = e.shift && selDrag.mode === "new"; PE.invalidateOverlay(); } },
		up: function (e) {
			var d = selDrag; selDrag = null; if (!d) return;
			if (d.move) { PE.commit("Move selection"); return; }
			var o = PE.opt.marquee, r = rectOf(d.a, d.b, e, d.sq); if (r.w < 2 && r.h < 2) { if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } return; }
			PE.selShape(function (x) { if (o.shape === "ellipse") { x.beginPath(); x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 6.2832); x.fill(); } else x.fillRect(r.x, r.y, r.w, r.h); }, d.mode);
			if (o.feather > 0) PE.selFeather(o.feather); PE.commit("Select");
		},
		overlay: function (x) { if (!selDrag || selDrag.move) return; var r = rectOf(selDrag.a, selDrag.b, null, selDrag.sq), s0 = PE.toScreen(r.x, r.y), z = PE.view.zoom; x.setLineDash([5, 4]); x.strokeStyle = "#fff"; x.lineWidth = 1; if (PE.opt.marquee.shape === "ellipse") { x.beginPath(); x.ellipse(s0.x + r.w * z / 2, s0.y + r.h * z / 2, r.w * z / 2, r.h * z / 2, 0, 0, 6.2832); x.stroke(); } else x.strokeRect(s0.x, s0.y, r.w * z, r.h * z); x.setLineDash([]); },
		cancel: function () { selDrag = null; } });
	var lasso = null;
	function lassoDone(mode) { var pts = lasso.pts; lasso = null; if (pts.length < 3) { PE.invalidateOverlay(); return; } PE.selShape(function (x) { x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.fill(); }, mode); if (PE.opt.lasso.feather > 0) PE.selFeather(PE.opt.lasso.feather); PE.commit("Lasso select"); PE.invalidateOverlay(); }
	PE.defTool({ id: "lasso", name: "Lasso / Polygon Select", key: "l", icon: "➰", opts: { style: "free", mode: "new", feather: 0 },
		ui: [{ k: "style", label: "Style", type: "seg", options: [["free", "Freehand"], ["poly", "Polygon"]] }, { k: "mode", label: "Mode", type: "seg", options: [["new", "New"], ["add", "Add"], ["sub", "Subtract"], ["int", "Intersect"]] }, { k: "feather", label: "Feather", type: "range", min: 0, max: 100, step: 1, unit: "px" }],
		hint: "Freehand: drag around the area. Polygon: click each corner, double-click or press Enter to close.",
		down: function (e) {
			var o = PE.opt.lasso;
			if (o.style === "poly") { if (!lasso) lasso = { pts: [], mode: selMode(e), poly: true }; var f = lasso.pts[0]; if (f && Math.hypot((f.x - e.x) * PE.view.zoom, (f.y - e.y) * PE.view.zoom) < 8 && lasso.pts.length > 2) { lassoDone(lasso.mode); return; } lasso.pts.push({ x: e.x, y: e.y }); lasso.cur = e; PE.invalidateOverlay(); }
			else lasso = { pts: [{ x: e.x, y: e.y }], mode: selMode(e), free: true };
		},
		move: function (e) { if (lasso && lasso.free) { lasso.pts.push({ x: e.x, y: e.y }); PE.invalidateOverlay(); } },
		hover: function (e) { if (lasso && lasso.poly) { lasso.cur = e; PE.invalidateOverlay(); } },
		up: function () { if (lasso && lasso.free) lassoDone(lasso.mode); },
		dbl: function () { if (lasso && lasso.poly) { lasso.pts.pop(); lassoDone(lasso.mode); } },
		enter: function () { if (lasso && lasso.poly) lassoDone(lasso.mode); }, cancel: function () { lasso = null; },
		overlay: function (x) { if (!lasso) return; x.strokeStyle = "#fff"; x.setLineDash([5, 4]); x.lineWidth = 1; x.beginPath(); lasso.pts.forEach(function (p, i) { var s = PE.toScreen(p.x, p.y); i ? x.lineTo(s.x, s.y) : x.moveTo(s.x, s.y); }); if (lasso.poly && lasso.cur) { var c = PE.toScreen(lasso.cur.x, lasso.cur.y); x.lineTo(c.x, c.y); } x.stroke(); x.setLineDash([]); } });
	PE.defTool({ id: "wand", name: "Magic Wand (select by colour)", key: "w", icon: "✨", opts: { tol: 32, contiguous: true, merged: false, mode: "new", smooth: true },
		ui: [{ k: "tol", label: "Tolerance", type: "range", min: 0, max: 255, step: 1 }, { k: "contiguous", label: "Contiguous", type: "check" }, { k: "merged", label: "All layers", type: "check" }, { k: "smooth", label: "Smooth edges", type: "check" }, { k: "mode", label: "Mode", type: "seg", options: [["new", "New"], ["add", "Add"], ["sub", "Subtract"], ["int", "Intersect"]] }],
		hint: "Click a colour to select it. Raise Tolerance to include similar colours. Great for removing a plain background.",
		down: function (e) {
			var o = PE.opt.wand, d = PE.doc, L = PE.active(), mask, w, h;
			if (o.merged || !L) { var c = PE.flatten(), id = c.getContext("2d").getImageData(0, 0, c.width, c.height); mask = P.floodMask(id.data, c.width, c.height, e.x, e.y, o.tol, o.contiguous); w = c.width; h = c.height; }
			else { var og = PE.origin(L), lp = PE.toLayerPt(L, e.x, e.y); if (!PE.isIdentity(L)) { PE.bake(L); og = PE.origin(L); lp = { x: e.x - og.x, y: e.y - og.y }; } var data = PE.layerData(L); var m = P.floodMask(data.data, data.width, data.height, lp.x, lp.y, o.tol, o.contiguous); mask = new Uint8Array(d.w * d.h); for (var y = 0; y < data.height; y++) { var dy = y + og.y; if (dy < 0 || dy >= d.h) continue; for (var x = 0; x < data.width; x++) { var dx = x + og.x; if (dx >= 0 && dx < d.w) mask[dy * d.w + dx] = m[y * data.width + x]; } } w = d.w; h = d.h; }
			if (o.smooth) mask = P.featherMask(P.growShrinkMask(mask, w, h, 0, true), w, h, 1.5);
			PE.selFromMask(mask, selMode(e)); PE.commit("Magic wand");
		} });

	/* ---------- crop ---------- */
	var crop = null, cdrag = null;
	function cropRatio() { var r = PE.opt.crop.ratio; if (r === "free") return 0; if (r === "orig") return PE.doc.w / PE.doc.h; var p = r.split(":"); return p[0] / p[1]; }
	PE.cropReset = function () { var d = PE.doc; crop = d ? { x: 0, y: 0, w: d.w, h: d.h } : null; PE.invalidateOverlay(); };
	PE.cropApply = function () { if (crop && (crop.w < d().w || crop.h < d().h || crop.x || crop.y)) PE.cropTo(crop.x, crop.y, crop.w, crop.h); crop = null; PE.setTool("move"); };
	function d() { return PE.doc; }
	PE.defTool({ id: "crop", name: "Crop", key: "c", icon: "⛶", opts: { ratio: "free" },
		ui: [{ k: "ratio", label: "Shape", type: "select", options: [["free", "Free"], ["orig", "Original ratio"], ["1:1", "1:1 Square"], ["4:3", "4:3"], ["3:2", "3:2"], ["16:9", "16:9"], ["9:16", "9:16"], ["4:5", "4:5"], ["2:1", "2:1"]] }, { type: "button", label: "✓ Apply crop (Enter)", act: function () { PE.cropApply(); } }, { type: "button", label: "Reset", act: function () { PE.cropReset(); } }],
		hint: "Drag the box or its handles, then press Enter (or Apply). Everything outside is removed.",
		enter: function () { PE.cropApply(); }, cancel: function () { crop = null; cdrag = null; }, activate: function () { PE.cropReset(); },
		down: function (e) {
			if (!crop) PE.cropReset(); var z = PE.view.zoom, r = PE.els.over.getBoundingClientRect(), px = e.sx - r.left, py = e.sy - r.top, s0 = PE.toScreen(crop.x, crop.y), s1 = PE.toScreen(crop.x + crop.w, crop.y + crop.h), t = 9;
			var hx = Math.abs(px - s0.x) < t ? -1 : Math.abs(px - s1.x) < t ? 1 : (Math.abs(px - (s0.x + s1.x) / 2) < t ? 0 : null), hy = Math.abs(py - s0.y) < t ? -1 : Math.abs(py - s1.y) < t ? 1 : (Math.abs(py - (s0.y + s1.y) / 2) < t ? 0 : null);
			var inX = px > s0.x - t && px < s1.x + t, inY = py > s0.y - t && py < s1.y + t;
			if (hx !== null && hy !== null && inX && inY && !(hx === 0 && hy === 0)) cdrag = { kind: "h", hx: hx, hy: hy, c0: Object.assign({}, crop), p0: e };
			else if (px > s0.x && px < s1.x && py > s0.y && py < s1.y) cdrag = { kind: "move", c0: Object.assign({}, crop), p0: e };
			else { crop = { x: e.x, y: e.y, w: 1, h: 1 }; cdrag = { kind: "new", p0: e }; }
		},
		move: function (e) {
			if (!cdrag) return; var dd = PE.doc, ratio = cropRatio(), c0 = cdrag.c0;
			if (cdrag.kind === "move") { crop.x = Math.round(Math.max(0, Math.min(dd.w - c0.w, c0.x + e.x - cdrag.p0.x))); crop.y = Math.round(Math.max(0, Math.min(dd.h - c0.h, c0.y + e.y - cdrag.p0.y))); }
			else {
				var x0, y0, x1, y1;
				if (cdrag.kind === "new") { x0 = cdrag.p0.x; y0 = cdrag.p0.y; x1 = e.x; y1 = e.y; }
				else { x0 = c0.x; y0 = c0.y; x1 = c0.x + c0.w; y1 = c0.y + c0.h; if (cdrag.hx === -1) x0 = e.x; if (cdrag.hx === 1) x1 = e.x; if (cdrag.hy === -1) y0 = e.y; if (cdrag.hy === 1) y1 = e.y; }
				x0 = Math.max(0, Math.min(dd.w, x0)); x1 = Math.max(0, Math.min(dd.w, x1)); y0 = Math.max(0, Math.min(dd.h, y0)); y1 = Math.max(0, Math.min(dd.h, y1));
				var w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
				if (ratio) { if (w / (h || 1) > ratio) w = h * ratio; else h = w / ratio; }
				var nx = sx > 0 ? x0 : x0 - w, ny = sy > 0 ? y0 : y0 - h; if (cdrag.kind === "h" && ratio) { if (cdrag.hx === -1) nx = x1 - w; if (cdrag.hy === -1) ny = y1 - h; if (cdrag.hx === 0) nx = c0.x + (c0.w - w) / 2; if (cdrag.hy === 0) ny = c0.y + (c0.h - h) / 2; }
				crop = { x: Math.round(Math.max(0, nx)), y: Math.round(Math.max(0, ny)), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
			}
			PE.emit("cropinfo", crop); PE.invalidateOverlay();
		},
		up: function () { cdrag = null; },
		overlay: function (x, v) {
			if (!crop) return; var a = PE.toScreen(crop.x, crop.y), b = PE.toScreen(crop.x + crop.w, crop.y + crop.h), d0 = PE.toScreen(0, 0), d1 = PE.toScreen(PE.doc.w, PE.doc.h);
			x.fillStyle = "rgba(0,0,0,0.55)"; x.fillRect(d0.x, d0.y, d1.x - d0.x, a.y - d0.y); x.fillRect(d0.x, b.y, d1.x - d0.x, d1.y - b.y); x.fillRect(d0.x, a.y, a.x - d0.x, b.y - a.y); x.fillRect(b.x, a.y, d1.x - b.x, b.y - a.y);
			x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); x.strokeStyle = "rgba(255,255,255,0.4)"; x.lineWidth = 1; x.beginPath();
			for (var i = 1; i < 3; i++) { x.moveTo(a.x + (b.x - a.x) * i / 3, a.y); x.lineTo(a.x + (b.x - a.x) * i / 3, b.y); x.moveTo(a.x, a.y + (b.y - a.y) * i / 3); x.lineTo(b.x, a.y + (b.y - a.y) * i / 3); } x.stroke();
			[[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y], [(a.x + b.x) / 2, a.y], [(a.x + b.x) / 2, b.y], [a.x, (a.y + b.y) / 2], [b.x, (a.y + b.y) / 2]].forEach(function (p) { PE.handleBox(x, p[0], p[1], 4); });
			x.fillStyle = "rgba(0,0,0,0.7)"; x.font = "12px system-ui,sans-serif"; var tx = crop.w + " × " + crop.h; x.fillRect(a.x, a.y - 22, x.measureText(tx).width + 12, 20); x.fillStyle = "#fff"; x.fillText(tx, a.x + 6, a.y - 8);
		} });

	/* ---------- painting engine: brush, eraser, clone stamp, retouch ---------- */
	var stroke = null;
	function softDab(x, r, hard, col, cx, cy) {
		if (hard >= 0.98) { x.fillStyle = col.solid; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill(); return; }
		var g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col.solid); g.addColorStop(Math.max(0.01, hard), col.solid); g.addColorStop(1, col.clear); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
	}
	function beginStroke(kind, e) {
		var L = PE.active(); var mask = L && L.editMask && L.mask; if (!PE.prepare(L)) return false;
		var o = PE.opt[kind === "eraser" ? "eraser" : kind === "clone" ? "clone" : kind === "retouch" ? "retouch" : "brush"], cv = mask ? L.mask : L.canvas, og = PE.origin(L), erase = kind === "eraser";
		var hex = mask ? "#000000" : (erase ? "#000000" : PE.fg);
		stroke = { kind: kind, L: L, o: o, og: og, target: mask ? "mask" : "pixel", buf: mk(cv.width, cv.height), erase: erase, alpha: (o.opacity == null ? 100 : o.opacity) / 100, col: { solid: rgba(hex, 1), clear: rgba(hex, 0) }, last: null, rem: 0, sm: { x: e.x, y: e.y }, n: 0 };
		L.live = { buf: stroke.buf, erase: erase, alpha: stroke.alpha, target: stroke.target };
		if (kind === "clone") { if (!PE.cloneSrc) { PE.toast("Alt-click first to set the source point"); L.live = null; stroke = null; return false; } stroke.snap = PE.clone(cv); stroke.off = stroke.aligned ? null : null; stroke.off = { x: PE.cloneSrc.x - e.x, y: PE.cloneSrc.y - e.y }; if (!o.aligned) stroke.start = { x: PE.cloneSrc.x, y: PE.cloneSrc.y, px: e.x, py: e.y }; }
		if (kind === "retouch") { stroke.proc = retouchCopy(cv, o); stroke.alpha = Math.max(0.05, o.strength / 100); L.live.alpha = stroke.alpha; }
		return true;
	}
	function retouchCopy(cv, o) {
		var c = PE.clone(cv), x = c.getContext("2d"), id = x.getImageData(0, 0, c.width, c.height);
		if (o.mode === "blur") P.gaussianBlur(id.data, id.width, id.height, 2 + o.size / 12); else if (o.mode === "sharpen") P.unsharp(id.data, id.width, id.height, 220, 1.2, 0); else if (o.mode === "dodge") P.exposure(id.data, 0.5, 0, 1); else if (o.mode === "burn") P.exposure(id.data, -0.5, 0, 1); else if (o.mode === "saturate") P.vibrance(id.data, 60); else if (o.mode === "desaturate") P.hueSat(id.data, 0, -70, 0);
		x.putImageData(id, 0, 0); return c;
	}
	function dab(px, py, size) {
		var s = stroke, L = s.L, r = Math.max(0.5, size / 2), lx = px - s.og.x, ly = py - s.og.y, bx = s.buf.getContext("2d"), hard = (s.o.hardness == null ? 100 : s.o.hardness) / 100;
		if (!PE.sel && s.kind !== "clone" && s.kind !== "retouch") { softDab(bx, r, hard, s.col, lx, ly); return; }
		var D = Math.ceil(r * 2) + 2, t = PE.tmp("dab", D, D), tx = t.getContext("2d"), c = D / 2;
		if (s.kind === "clone" || s.kind === "retouch") {
			var src = s.kind === "clone" ? s.snap : s.proc, sx, sy; if (s.kind === "clone") { var ox = s.o.aligned ? s.off.x : s.start.x - s.start.px, oy = s.o.aligned ? s.off.y : s.start.y - s.start.py; sx = px + ox - s.og.x; sy = py + oy - s.og.y; } else { sx = lx; sy = ly; }
			tx.drawImage(src, sx - c, sy - c, D, D, 0, 0, D, D); tx.globalCompositeOperation = "destination-in"; softDab(tx, r, Math.min(hard, 0.9), { solid: "#000", clear: "rgba(0,0,0,0)" }, c, c); tx.globalCompositeOperation = "source-over";
		} else softDab(tx, r, hard, s.col, c, c);
		if (PE.sel) PE.restrictToSel(tx, Math.round(px - c), Math.round(py - c), D, D);
		bx.drawImage(t, Math.round(lx - c), Math.round(ly - c));
	}
	function strokeTo(e, first) {
		var s = stroke, o = s.o, sm = (o.smooth || 0) / 100;
		var tx = e.x, ty = e.y; if (sm > 0 && !first) { s.sm.x += (e.x - s.sm.x) * (1 - sm * 0.9); s.sm.y += (e.y - s.sm.y) * (1 - sm * 0.9); tx = s.sm.x; ty = s.sm.y; }
		var size = o.size * (o.pressure && e.pen ? Math.max(0.15, e.pressure) : 1), sp = Math.max(1, o.size * (s.kind === "brush" || s.kind === "eraser" ? 0.1 : 0.2));
		if (first || !s.last) { dab(tx, ty, size); s.last = { x: tx, y: ty }; PE.invalidate(); return; }
		var dx = tx - s.last.x, dy = ty - s.last.y, len = Math.hypot(dx, dy), pos = sp - s.rem;
		while (pos <= len) { dab(s.last.x + dx * pos / len, s.last.y + dy * pos / len, size); pos += sp; }
		s.rem = len - (pos - sp); s.last = { x: tx, y: ty }; PE.invalidate();
	}
	function endStroke(label) {
		var s = stroke; if (!s) return; stroke = null; var L = s.L, cv = s.target === "mask" ? L.mask : L.canvas, x = cv.getContext("2d");
		x.save(); x.globalAlpha = s.alpha; x.globalCompositeOperation = s.erase ? "destination-out" : "source-over"; x.drawImage(s.buf, 0, 0); x.restore(); L.live = null; L.rev++; PE.commit(label);
	}
	function paintTool(id, name, key, icon, kind, opts, ui, extra) {
		var t = { id: id, name: name, key: key, icon: icon, opts: opts, ui: ui, hint: "Drag to paint. [ and ] change the size, Shift-click draws a straight line from the last point.",
			cursorSize: function () { return PE.opt[id].size; },
			down: function (e) {
				var o = PE.opt[id]; if (kind === "clone" && e.alt) { PE.cloneSrc = { x: e.x, y: e.y }; PE.toast("Clone source set"); PE.invalidateOverlay(); return; }
				if (!beginStroke(kind, e)) return;
				if (e.shift && PE.lastPaint && PE.lastPaint.L === PE.active() && kind !== "clone") { stroke.last = { x: PE.lastPaint.x, y: PE.lastPaint.y }; strokeTo(e, false); } else strokeTo(e, true);
			},
			move: function (e) { if (stroke) strokeTo(e, false); },
			up: function (e) { if (stroke) { PE.lastPaint = { L: stroke.L, x: e.x, y: e.y }; endStroke(name.split(" ")[0]); } },
			abort: function () { if (stroke) { stroke.L.live = null; stroke = null; PE.invalidate(); } }, cancel: function () { if (stroke) { endStroke(name); } } };
		if (extra) for (var k in extra) t[k] = extra[k]; PE.defTool(t);
	}
	var BRUSHUI = [{ k: "size", label: "Size", type: "range", min: 1, max: 500, step: 1, unit: "px" }, { k: "hardness", label: "Hardness", type: "range", min: 0, max: 100, step: 1, unit: "%" }, { k: "opacity", label: "Opacity", type: "range", min: 1, max: 100, step: 1, unit: "%" }, { k: "smooth", label: "Smoothing", type: "range", min: 0, max: 100, step: 1, unit: "%" }, { k: "pressure", label: "Pen pressure", type: "check" }];
	paintTool("brush", "Brush", "b", "🖌", "brush", { size: 24, hardness: 80, opacity: 100, smooth: 0, pressure: true }, BRUSHUI);
	paintTool("eraser", "Eraser", "e", "◌", "eraser", { size: 40, hardness: 90, opacity: 100, smooth: 0, pressure: true }, BRUSHUI);
	paintTool("clone", "Clone Stamp", "s", "⧉", "clone", { size: 40, hardness: 60, opacity: 100, aligned: true }, [BRUSHUI[0], BRUSHUI[1], BRUSHUI[2], { k: "aligned", label: "Aligned", type: "check" }],
		{ hint: "Alt-click to pick the source area, then paint to copy it. Great for removing blemishes and objects.", overlay: function (x) { if (!PE.cloneSrc) return; var s = PE.toScreen(PE.cloneSrc.x, PE.cloneSrc.y); x.strokeStyle = "#ff3d3d"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(s.x - 8, s.y); x.lineTo(s.x + 8, s.y); x.moveTo(s.x, s.y - 8); x.lineTo(s.x, s.y + 8); x.stroke(); } });
	paintTool("retouch", "Retouch (blur / sharpen / dodge / burn)", "r", "💧", "retouch", { size: 40, hardness: 50, strength: 50, mode: "blur" }, [{ k: "mode", label: "Effect", type: "select", options: [["blur", "Blur"], ["sharpen", "Sharpen"], ["dodge", "Lighten (dodge)"], ["burn", "Darken (burn)"], ["saturate", "Saturate"], ["desaturate", "Desaturate"]] }, BRUSHUI[0], BRUSHUI[1], { k: "strength", label: "Strength", type: "range", min: 5, max: 100, step: 1, unit: "%" }],
		{ hint: "Paint to blur, sharpen, lighten, darken or change saturation just where you drag." });

	/* ---------- bucket + gradient ---------- */
	PE.defTool({ id: "bucket", name: "Paint Bucket", key: "k", icon: "🪣", opts: { tol: 24, contiguous: true, merged: false, opacity: 100 },
		ui: [{ k: "tol", label: "Tolerance", type: "range", min: 0, max: 255, step: 1 }, { k: "contiguous", label: "Contiguous", type: "check" }, { k: "merged", label: "Sample all layers", type: "check" }, { k: "opacity", label: "Opacity", type: "range", min: 1, max: 100, step: 1, unit: "%" }],
		hint: "Click an area to fill it with the foreground colour. With a selection active, only the selection is filled.",
		down: function (e) {
			var L = PE.active(), o = PE.opt.bucket, d = PE.doc, mask = L && L.editMask && L.mask; if (!PE.prepare(L)) return; var og = PE.origin(L), w = L.canvas.width, h = L.canvas.height, m;
			if (o.merged) { var c = PE.flatten(), id = c.getContext("2d").getImageData(0, 0, c.width, c.height), dm = P.floodMask(id.data, c.width, c.height, e.x, e.y, o.tol, o.contiguous); m = new Uint8Array(w * h); for (var y = 0; y < h; y++) { var dy = y + og.y; if (dy < 0 || dy >= d.h) continue; for (var x = 0; x < w; x++) { var dx = x + og.x; if (dx >= 0 && dx < d.w) m[y * w + x] = dm[dy * d.w + dx]; } } }
			else { var cv = mask ? L.mask : L.canvas, data = cv.getContext("2d").getImageData(0, 0, w, h); m = P.floodMask(data.data, w, h, e.x - og.x, e.y - og.y, o.tol, o.contiguous); }
			var t = mk(w, h), tx = t.getContext("2d"), id2 = tx.createImageData(w, h), col = P.hexToRgb(mask ? "#000000" : PE.fg), a = id2.data; for (var i = 0; i < m.length; i++) { a[i * 4] = col[0]; a[i * 4 + 1] = col[1]; a[i * 4 + 2] = col[2]; a[i * 4 + 3] = m[i]; } tx.putImageData(id2, 0, 0);
			PE.paintInto(L, t, og.x, og.y, { alpha: o.opacity / 100, target: mask ? "mask" : "pixel" }); PE.commit("Bucket fill");
		} });
	var grad = null;
	PE.defTool({ id: "gradient", name: "Gradient", key: "g", icon: "◐", opts: { type: "linear", mode: "fgbg", opacity: 100 },
		ui: [{ k: "type", label: "Type", type: "seg", options: [["linear", "Linear"], ["radial", "Radial"]] }, { k: "mode", label: "Colours", type: "select", options: [["fgbg", "Foreground → Background"], ["fgt", "Foreground → Transparent"], ["fgbgr", "Background → Foreground"]] }, { k: "opacity", label: "Opacity", type: "range", min: 1, max: 100, step: 1, unit: "%" }],
		hint: "Drag from the start to the end of the gradient. Respects the selection.",
		down: function (e) { grad = { a: e, b: e }; }, move: function (e) { if (grad) { grad.b = e.shift ? { x: e.x, y: grad.a.y + (Math.abs(e.x - grad.a.x) > Math.abs(e.y - grad.a.y) ? 0 : e.y - grad.a.y) } : e; if (e.shift && Math.abs(e.x - grad.a.x) < Math.abs(e.y - grad.a.y)) grad.b = { x: grad.a.x, y: e.y }; PE.invalidateOverlay(); } },
		up: function () {
			var g = grad; grad = null; if (!g || Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) < 2) return; var L = PE.active(), o = PE.opt.gradient, mask = L && L.editMask && L.mask; if (!PE.prepare(L)) return;
			var og = PE.origin(L), w = L.canvas.width, h = L.canvas.height, t = mk(w, h), x = t.getContext("2d"), a = { x: g.a.x - og.x, y: g.a.y - og.y }, b = { x: g.b.x - og.x, y: g.b.y - og.y };
			var gr = o.type === "radial" ? x.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y)) : x.createLinearGradient(a.x, a.y, b.x, b.y), c1 = mask ? "#000" : (o.mode === "fgbgr" ? PE.bg : PE.fg), c2 = o.mode === "fgt" ? rgba(PE.fg, 0) : (o.mode === "fgbgr" ? PE.fg : PE.bg);
			if (mask) { gr.addColorStop(0, "#000"); gr.addColorStop(1, "rgba(0,0,0,0)"); } else { gr.addColorStop(0, c1); gr.addColorStop(1, c2); } x.fillStyle = gr; x.fillRect(0, 0, w, h);
			PE.paintInto(L, t, og.x, og.y, { alpha: o.opacity / 100, target: mask ? "mask" : "pixel" }); PE.commit("Gradient");
		},
		overlay: function (x) { if (!grad) return; var a = PE.toScreen(grad.a.x, grad.a.y), b = PE.toScreen(grad.b.x, grad.b.y); x.strokeStyle = "#000"; x.lineWidth = 3; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.stroke(); x.fillStyle = "#fff"; x.beginPath(); x.arc(a.x, a.y, 4, 0, 6.2832); x.fill(); } });

	/* ---------- eyedropper, hand, zoom ---------- */
	function pick(e) { var o = PE.opt.eyedropper, n = o.size; var c = PE.sample(e.x, e.y, n, o.merged); if (!c) return; var hex = P.rgbToHex(c.r, c.g, c.b); if (e.alt) PE.setBg(hex); else PE.setFg(hex); }
	PE.defTool({ id: "eyedropper", name: "Eyedropper (pick colour)", key: "i", icon: "💉", opts: { size: 1, merged: true }, ui: [{ k: "size", label: "Sample", type: "select", options: [[1, "Point"], [3, "3 × 3"], [5, "5 × 5"], [11, "11 × 11"]], num: true }, { k: "merged", label: "All layers", type: "check" }],
		hint: "Click to pick the foreground colour. Alt-click picks the background colour.", down: pick, move: pick });
	PE.defTool({ id: "hand", name: "Hand (pan)", key: "h", icon: "✋", opts: {}, ui: [], hint: "Drag to pan. You can also hold Space with any tool, or use the middle mouse button." });
	PE.defTool({ id: "zoom", name: "Zoom", key: "z", icon: "🔍", opts: {}, ui: [{ type: "button", label: "Fit (Ctrl+0)", act: function () { PE.fit(); } }, { type: "button", label: "100% (Ctrl+1)", act: function () { PE.setZoom(1); } }], hint: "Click to zoom in, Alt-click to zoom out. Ctrl + wheel also zooms.",
		down: function (e) { var r = PE.els.over.getBoundingClientRect(); PE.setZoom(PE.view.zoom * (e.alt ? 0.5 : 2), e.sx - r.left, e.sy - r.top); } });
	PE.stepBrushSize = function (dir) { var o = PE.opt[PE.toolId]; if (o && o.size != null) { var s = o.size, ns = dir > 0 ? Math.round(s * 1.15 + 1) : Math.max(1, Math.round(s / 1.15 - 1)); o.size = Math.min(500, Math.max(1, ns)); saveOpt(PE.toolId); PE.invalidateOverlay(); } };
})();
