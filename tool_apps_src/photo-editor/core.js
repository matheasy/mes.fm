/* MES Photo Editor core: document + layer model, compositing, selection, history, image-level operations, project files.
 * Layers are canvases with a non-destructive transform (centre cx, cy, scale sx, sy, rotation rot): moving / scaling / rotating costs nothing and is
 * "baked" into pixels only when something paints on the layer. Everything that changes the picture ends in PE.commit(label) = one undo step. */
(function () {
	"use strict";
	var PE = window.PE = window.PE || {};
	var P = window.MESPixel, I = window.MESImg;
	var listeners = {};
	PE.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
	PE.emit = function (ev, a, b) { (listeners[ev] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.error(e); } }); };
	PE.doc = null; PE.fg = "#000000"; PE.bg = "#ffffff"; PE.sel = null; PE.dirty = false; PE.view = { zoom: 1, px: 0, py: 0, w: 0, h: 0, dpr: 1 };
	PE.BLENDS = [["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"], ["darken", "Darken"], ["lighten", "Lighten"], ["color-dodge", "Color Dodge"], ["color-burn", "Color Burn"], ["hard-light", "Hard Light"], ["soft-light", "Soft Light"], ["difference", "Difference"], ["exclusion", "Exclusion"], ["hue", "Hue"], ["saturation", "Saturation"], ["color", "Color"], ["luminosity", "Luminosity"]];
	PE.MAXPX = 16384; PE.MAXAREA = 120e6;

	function mk(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
	function clone(c) { var n = mk(c.width, c.height); n.getContext("2d").drawImage(c, 0, 0); return n; }
	PE.mk = mk; PE.clone = clone;
	var tmps = {};
	PE.tmp = function (key, w, h) { var c = tmps[key] || (tmps[key] = mk(w, h)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else { var x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.clearRect(0, 0, w, h); } return c; };

	/* ---------- layers ---------- */
	PE.makeLayer = function (o) {
		o = o || {}; var d = PE.doc, w = o.w || (d ? d.w : 1), h = o.h || (d ? d.h : 1);
		var c = o.canvas || mk(w, h);
		return { id: d ? d.next++ : 1, name: o.name || "Layer", type: o.type || "raster", canvas: c, cx: o.cx != null ? o.cx : (o.x || 0) + c.width / 2, cy: o.cy != null ? o.cy : (o.y || 0) + c.height / 2,
			sx: 1, sy: 1, rot: 0, visible: true, opacity: 1, blend: "source-over", locked: false, text: o.text || null, mask: null, editMask: false, rev: 0, _snap: null, group: null, collapsed: false, _p: null, src: o.src || null, crop: null, fx: null };
	};
	/* where a layer came from (shown in File -> Files and folders): {how: open|drop|paste|folder|folder-ro|psd|xcf|project|autosave|merge|made, file, path, dir, bytes, w, h, t, hk (memory-only key of a folder file handle), copy, ai: [steps]}.
	 * src objects are never changed in place (history snapshots share them): every update makes a new object. */
	PE.mkSrc = function (meta, w, h) { var s = {}; meta = meta || {}; for (var k in meta) if (meta[k] != null && meta[k] !== "") s[k] = meta[k]; if (!s.how) s.how = "made"; if (w) { s.w = Math.round(w); s.h = Math.round(h); } s.t = Date.now(); return s; };
	PE.markAi = function (L, what) { if (!L) return; var s = L.src || { how: "made" }, ai = (s.ai || []).concat([what]).slice(-6); L.src = Object.assign({}, s, { ai: ai }); };
	PE.active = function () { var d = PE.doc; if (!d) return null; for (var i = 0; i < d.layers.length; i++) if (d.layers[i].id === d.activeId) return d.layers[i]; return d.layers[d.layers.length - 1] || null; };
	PE.layerById = function (id) { var d = PE.doc; for (var i = 0; i < d.layers.length; i++) if (d.layers[i].id === id) return d.layers[i]; return null; };
	PE.indexOf = function (L) { return PE.doc.layers.indexOf(L); };
	PE.setActive = function (id) { PE.doc.activeId = id; PE.emit("layers"); PE.emit("active"); };
	PE.touch = function (L) { if (L) L.rev++; PE.invalidate(); };
	/* ---------- groups: a group is a header layer (type "group", 1x1 canvas) that comes AFTER its members in the flat array; members point at it with `group` (its id). Members are always contiguous. ---------- */
	PE.isGroup = function (L) { return !!L && L.type === "group"; };
	PE.makeGroup = function (name) { var G = PE.makeLayer({ name: name || "Group", w: 1, h: 1, type: "group" }); return G; };
	PE.relink = function () { var d = PE.doc, m = {}; d.layers.forEach(function (L) { m[L.id] = L; }); d.layers.forEach(function (L) { L._p = L.group != null ? (m[L.group] || null) : null; }); };
	PE.kidsOf = function (G) { return PE.doc.layers.filter(function (L) { return L.group === G.id; }); };
	PE.descendants = function (G) { var out = [], d = PE.doc; (function walk(g) { d.layers.forEach(function (L) { if (L.group === g.id) { if (PE.isGroup(L)) walk(L); out.push(L); } }); })(G); return d.layers.filter(function (L) { return out.indexOf(L) >= 0; }); };
	PE.blockOf = function (L) { return PE.isGroup(L) ? PE.descendants(L).concat([L]) : [L]; };
	PE.ancestorsOf = function (L) { var out = [], d = PE.doc, p = L.group; while (p != null) { var g = PE.layerById(p); if (!g) break; out.push(g); p = g.group; } return out; };
	PE.depthOf = function (L) { return PE.ancestorsOf(L).length; };
	PE.topGroupOf = function (L) { var a = PE.ancestorsOf(L); return a.length ? a[a.length - 1] : L; };
	PE.effVisible = function (L) { if (!L.visible) return false; for (var p = L._p; p; p = p._p) if (!p.visible) return false; return true; };
	PE.translate = function (L, dx, dy) { if (PE.isGroup(L)) PE.descendants(L).forEach(function (k) { if (!PE.isGroup(k)) { k.cx += dx; k.cy += dy; k.rev++; } }); else { L.cx += dx; L.cy += dy; } PE.invalidate(); };
	PE.groupBounds = function (G) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false; PE.descendants(G).forEach(function (k) { if (PE.isGroup(k)) return; var b = PE.bounds(k); any = true; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }); return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 }; };
	PE.addLayer = function (L, index) {
		var d = PE.doc;
		if (index == null) {
			var a = PE.active();
			if (!a) index = d.layers.length;
			else if (PE.isGroup(a)) { if (!a.collapsed) { L.group = a.id; index = d.layers.indexOf(a); } else { L.group = a.group; index = d.layers.indexOf(a) + 1; } }
			else { L.group = a.group; index = d.layers.indexOf(a) + 1; }
		}
		d.layers.splice(index, 0, L); d.activeId = L.id; PE.relink(); PE.emit("layers"); PE.invalidate(); return L;
	};
	PE.origin = function (L) { return { x: Math.round(L.cx - L.canvas.width / 2), y: Math.round(L.cy - L.canvas.height / 2) }; };
	PE.isIdentity = function (L) { return L.sx === 1 && L.sy === 1 && L.rot === 0; };
	function matrix(L) { var c = Math.cos(L.rot), s = Math.sin(L.rot); return [c * L.sx, s * L.sx, -s * L.sy, c * L.sy, L.cx, L.cy]; }
	PE.corners = function (L) {
		if (PE.isGroup(L)) { var gb = PE.groupBounds(L); return [[gb.x, gb.y], [gb.x + gb.w, gb.y], [gb.x + gb.w, gb.y + gb.h], [gb.x, gb.y + gb.h]]; }
		var m = matrix(L), hw = L.canvas.width / 2, hh = L.canvas.height / 2;
		return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; });
	};
	PE.bounds = function (L) { if (PE.isGroup(L)) return PE.groupBounds(L); var c = PE.corners(L), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; c.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
	PE.toLayerPt = function (L, x, y) { var c = Math.cos(L.rot), s = Math.sin(L.rot), dx = x - L.cx, dy = y - L.cy; return { x: (c * dx + s * dy) / L.sx + L.canvas.width / 2, y: (-s * dx + c * dy) / L.sy + L.canvas.height / 2 }; };
	PE.layerAt = function (x, y) {
		var ls = PE.doc.layers;
		for (var i = ls.length - 1; i >= 0; i--) {
			var L = ls[i]; if (PE.isGroup(L) || !PE.effVisible(L)) continue; var p = PE.toLayerPt(L, x, y);
			if (p.x < 0 || p.y < 0 || p.x >= L.canvas.width || p.y >= L.canvas.height) continue;
			var cr = L.crop; if (cr && (p.x < cr.x || p.y < cr.y || p.x >= cr.x + cr.w || p.y >= cr.y + cr.h)) continue;   // hidden by the layer's crop box
			try { if (L.canvas.getContext("2d").getImageData(p.x | 0, p.y | 0, 1, 1).data[3] > 8) return L; } catch (e) { return L; }
		}
		return null;
	};
	/* bake the transform into the pixels (scale / rotation / flip) so tools can paint in layer space */
	PE.bake = function (L) {
		if (PE.isIdentity(L)) return;
		var cr = L.crop, m0 = matrix(L);
		if (cr && Math.abs(Math.sin(L.rot)) > 1e-9 && Math.abs(Math.cos(L.rot)) > 1e-9) { cropIntoMask(L); cr = null; }   // a crop box turned at an odd angle can't stay a box: it becomes part of the layer mask (still undoable, nothing is deleted)
		var b = PE.bounds(L), ox = Math.floor(b.x + 1e-6), oy = Math.floor(b.y + 1e-6), W = Math.max(1, Math.ceil(b.x + b.w - 1e-6) - ox), H = Math.max(1, Math.ceil(b.y + b.h - 1e-6) - oy);
		if (W * H > PE.MAXAREA) { PE.toast("That layer would be too large to edit"); return; }
		var m = matrix(L), nc = mk(W, H), x = nc.getContext("2d"); x.imageSmoothingQuality = "high";
		x.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy); x.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2); x.setTransform(1, 0, 0, 1, 0, 0);   // reset: tools later draw into this canvas with its own 2D context, and a leftover scale / offset put Delete, brush and fill marks in the wrong place
		if (L.mask) { var nm = mk(W, H), mx = nm.getContext("2d"); mx.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy); mx.drawImage(L.mask, -L.canvas.width / 2, -L.canvas.height / 2); mx.setTransform(1, 0, 0, 1, 0, 0); L.mask = nm; }
		if (cr) { var pts = [[cr.x, cr.y], [cr.x + cr.w, cr.y + cr.h]].map(function (q) { var u = q[0] - L.canvas.width / 2, v = q[1] - L.canvas.height / 2; return [m0[0] * u + m0[2] * v + m0[4] - ox, m0[1] * u + m0[3] * v + m0[5] - oy]; });
			L.crop = P.clampCrop({ x: Math.min(pts[0][0], pts[1][0]), y: Math.min(pts[0][1], pts[1][1]), w: Math.abs(pts[1][0] - pts[0][0]), h: Math.abs(pts[1][1] - pts[0][1]) }, W, H); }
		L.canvas = nc; L.cx = ox + W / 2; L.cy = oy + H / 2; L.sx = L.sy = 1; L.rot = 0; L.rev++;
	};
	/* fold a layer's crop box into its mask (used before baking a layer turned at an odd angle) */
	function cropIntoMask(L) {
		var cr = L.crop; if (!cr) return; var w = L.canvas.width, h = L.canvas.height, m = L.mask || (function () { var c = mk(w, h), x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, w, h); return c; })(), x = m.getContext("2d");
		x.save(); x.globalCompositeOperation = "destination-in"; x.fillStyle = "#000"; x.fillRect(cr.x, cr.y, cr.w, cr.h); x.restore(); L.mask = m; L.crop = null; L.rev++;
	}
	PE.cropIntoMask = cropIntoMask;
	/* grow a layer's canvas (and mask) so it covers rect {x,y,w,h} (doc coordinates); the layer must be baked */
	PE.growLayer = function (L, r) {
		var o = PE.origin(L), w = L.canvas.width, h = L.canvas.height, x0 = Math.min(o.x, Math.floor(r.x)), y0 = Math.min(o.y, Math.floor(r.y)), x1 = Math.max(o.x + w, Math.ceil(r.x + r.w)), y1 = Math.max(o.y + h, Math.ceil(r.y + r.h));
		if (x0 === o.x && y0 === o.y && x1 === o.x + w && y1 === o.y + h) return;
		var W = x1 - x0, H = y1 - y0; if (W * H > PE.MAXAREA || W > PE.MAXPX * 2) return;
		var nc = mk(W, H); nc.getContext("2d").drawImage(L.canvas, o.x - x0, o.y - y0);
		if (L.mask) { var nm = mk(W, H), mx = nm.getContext("2d"); mx.fillStyle = "#000"; mx.fillRect(0, 0, W, H); mx.clearRect(o.x - x0, o.y - y0, w, h); mx.drawImage(L.mask, o.x - x0, o.y - y0); L.mask = nm; }
		if (L.crop) L.crop = P.shiftCrop(L.crop, o.x - x0, o.y - y0, W, H);
		L.canvas = nc; L.cx = x0 + W / 2; L.cy = y0 + H / 2; L.rev++;
	};
	/* shrink a baked layer's canvas (and mask) to rect {x,y,w,h} in doc coordinates, clipped to what it has now (the opposite of growLayer) */
	PE.cropLayerTo = function (L, r) {
		var o = PE.origin(L), w = L.canvas.width, h = L.canvas.height, x0 = Math.max(o.x, Math.floor(r.x)), y0 = Math.max(o.y, Math.floor(r.y)), x1 = Math.min(o.x + w, Math.ceil(r.x + r.w)), y1 = Math.min(o.y + h, Math.ceil(r.y + r.h));
		if (x1 <= x0 || y1 <= y0 || (x0 === o.x && y0 === o.y && x1 === o.x + w && y1 === o.y + h)) return;
		var W = x1 - x0, H = y1 - y0, nc = mk(W, H); nc.getContext("2d").drawImage(L.canvas, x0 - o.x, y0 - o.y, W, H, 0, 0, W, H);
		if (L.mask) { var nm = mk(W, H); nm.getContext("2d").drawImage(L.mask, x0 - o.x, y0 - o.y, W, H, 0, 0, W, H); L.mask = nm; }
		if (L.crop) L.crop = P.shiftCrop(L.crop, o.x - x0, o.y - y0, W, H);
		L.canvas = nc; L.cx = x0 + W / 2; L.cy = y0 + H / 2; L.rev++;
	};
	PE.rasterize = function (L) { if (L.type === "text") { L.type = "raster"; L.text = null; L.rev++; } };
	/* make a layer ready for painting: raster, baked, at least as big as the document; returns false if locked / not possible */
	PE.prepare = function (L, quiet, noGrow) {
		if (!L) { if (!quiet) PE.toast("Add or open an image first"); return false; }
		if (L.locked) { if (!quiet) PE.toast("This layer is locked"); return false; }
		if (PE.isGroup(L)) { if (!quiet) PE.toast("This is a group: select a layer inside it"); return false; }
		L.eq = null;
		if (L.type === "text") { PE.rasterize(L); PE.emit("layers"); }
		PE.bake(L); if (!noGrow) PE.growLayer(L, { x: 0, y: 0, w: PE.doc.w, h: PE.doc.h }); return true;
	};

	/* ---------- text layers ---------- */
	PE.TEXTDEF = { str: "Text", font: "Arial, Helvetica, sans-serif", size: 64, bold: false, italic: false, underline: false, color: "#000000", align: "left", lh: 1.2, bgOn: false, bgColor: "#ffeb3b", bgPad: 12, bgRadius: 8, strokeOn: false, stroke: "#ffffff", strokeW: 4, shadowOn: false, shadow: "#000000", shadowBlur: 8, shadowDx: 4, shadowDy: 4, ls: 0, wrapW: 0, fit: false, boxH: 0 };
	/* rich text (MESPixel.rich*): t.rich = one style digit per character (1 bold, 2 italic, 4 underline) or null = the layer's own bold / italic / underline */
	PE.textRich = function (t) { return t && typeof t.rich === "string" && t.rich.length === String(t.str).length && t.rich.length ? t.rich : null; };
	PE.textMask = function (t) { return P.richMask(t.bold, t.italic, t.underline); };
	function fontFor(t, m, size) { return (m & 2 ? "italic " : "") + (m & 1 ? "bold " : "") + (size == null ? t.size : size) + "px " + t.font; }
	PE.textFont = fontFor;
	/* a measure(s, start) for a text at a given size: rich parts are measured with their own font */
	function measurer(t, size, ctx) {
		var rich = PE.textRich(t), base = PE.textMask(t), ls = (t.ls || 0) + "px", cache = {}, set = function (fn) { if (ctx.font !== fn) ctx.font = fn; if ("letterSpacing" in ctx && ctx.letterSpacing !== ls) ctx.letterSpacing = ls; };
		if (!rich) { var f = fontFor(t, base, size); return function (s) { var w = cache[s]; if (w == null) { set(f); w = cache[s] = ctx.measureText(s).width; } return w; }; }
		return function (s, st) {
			st = st || 0; var key = st + "|" + s, w = cache[key]; if (w != null) return w; w = 0;
			P.richSegs(rich, st, st + s.length, base).forEach(function (g) { set(fontFor(t, g.m, size)); w += ctx.measureText(s.slice(g.s - st, g.e - st)).width; });
			return (cache[key] = w);
		};
	}
	/* Auto-fit text: the font size that fills the box (Box width x box height) */
	PE.fitTextSize = function (L) {
		var t = L.text; if (!t || !t.fit || !(t.wrapW > 0) || !(t.boxH > 0)) return null; var m = lmc || (lmc = mk(8, 8).getContext("2d"));
		return P.fitFontSize(t.str, t.wrapW, t.boxH, t.lh, function (sz) { return measurer(t, sz, m); }, 4, Math.min(1000, t.boxH * 1.2));
	};
	/* where every line of a text layer sits in its canvas (shared by the renderer and the on-canvas text editor: caret, selection, click-to-place).
	 * lines = [{text, start, end}] with string offsets (MESPixel.wrapLines), lx[i] = left edge of line i, base[i] = its baseline, measure(s, start) = width in px,
	 * bh = height of the text box (the text, or the Auto-fit box when that is taller) */
	var lmc = null;
	PE.textLayout = function (L) {
		var t = L.text; if (!t) return null; var rich = PE.textRich(t), f = fontFor(t, PE.textMask(t)), dw = PE.doc ? PE.doc.w : 1200, fit = !!(t.fit && t.wrapW > 0 && t.boxH > 0);
		var key = JSON.stringify([t.str, f, rich, t.ls || 0, t.wrapW, t.lh, t.align, t.bgOn && t.bgPad, t.strokeOn && t.strokeW, t.shadowOn && [t.shadowBlur, t.shadowDx, t.shadowDy], t.wrapW > 0 ? 0 : dw, fit && t.boxH]);
		if (L._lay && L._lay.key === key) return L._lay;
		var m = lmc || (lmc = mk(8, 8).getContext("2d")), measure = measurer(t, t.size, m);
		// word wrap: an explicit box width (Box width option / the handles on the box), else never wider than 90% of the image so pasted text stays reasonable
		var lim = t.wrapW > 0 ? t.wrapW : Math.max(160, dw * 0.9), lines = P.wrapLines(t.str, lim, measure);
		var lw = lines.map(function (s) { return measure(s.text, s.start); }), mw = t.wrapW > 0 ? t.wrapW : Math.max.apply(null, lw.concat([1])), lhp = t.size * t.lh;
		var sw = t.strokeOn ? Math.max(0, t.strokeW || 0) : 0, bgp = t.bgOn ? t.bgPad : 0, pad = Math.ceil(bgp + sw + (t.shadowOn ? t.shadowBlur * 2 + Math.max(Math.abs(t.shadowDx), Math.abs(t.shadowDy)) : 0) + t.size * 0.15 + 2);
		var lx = lw.map(function (w) { return t.align === "center" ? pad + mw / 2 - w / 2 : t.align === "right" ? pad + mw - w : pad; }), base = lines.map(function (s, i) { return pad + lhp * i + t.size * 0.92; });
		var th = lhp * lines.length + t.size * 0.25, bh = fit ? Math.max(t.boxH, th) : th;
		L._lay = { key: key, font: f, rich: rich, lines: lines, lw: lw, lx: lx, base: base, mw: mw, lhp: lhp, pad: pad, bgp: bgp, bh: bh, fit: fit, W: Math.ceil(mw) + pad * 2, H: Math.ceil(Math.max(lhp * lines.length + t.size * 0.3, bh + t.size * 0.05)) + pad * 2, size: t.size, measure: measure };
		return L._lay;
	};
	PE.renderText = function (L) {
		var t = L.text; if (t.fit) { var fs = PE.fitTextSize(L); if (fs) t.size = fs; }
		var lay = PE.textLayout(L), lines = lay.lines, mw = lay.mw, lhp = lay.lhp, bgp = lay.bgp, pad = lay.pad, rich = lay.rich, base = PE.textMask(t), sz = t.size;
		var W = lay.W, H = lay.H; if (W * H > PE.MAXAREA) return;
		var oldW = L.canvas.width, oldH = L.canvas.height, c = mk(W, H), x = c.getContext("2d"), sw = t.strokeOn ? Math.max(0, t.strokeW || 0) : 0;
		if ("letterSpacing" in x) x.letterSpacing = (t.ls || 0) + "px"; x.textBaseline = "alphabetic"; x.lineJoin = "round"; x.textAlign = "left";
		if (t.bgOn) { var inner = Math.ceil(lhp * lines.length + sz * 0.3 - sz * 0.1) - Math.round(sz * 0.05); if (lay.fit) inner = Math.max(inner, Math.ceil(lay.bh)); var bx = pad - bgp, by = pad - bgp, bw = Math.ceil(mw) + bgp * 2, bh = inner + bgp * 2, br = Math.min(t.bgRadius, bw / 2, bh / 2); x.fillStyle = t.bgColor; x.beginPath(); x.moveTo(bx + br, by); x.arcTo(bx + bw, by, bx + bw, by + bh, br); x.arcTo(bx + bw, by + bh, bx, by + bh, br); x.arcTo(bx, by + bh, bx, by, br); x.arcTo(bx, by, bx + bw, by, br); x.closePath(); x.fill(); }
		// underline: scaled to the font size, from the first to the last underlined letter of each run (not the letter spacing after the last one)
		var uOff = Math.max(1, sz * 0.11), uTh = Math.max(1, sz * 0.065), ls = t.ls || 0;
		lines.forEach(function (ln, i) {
			var py = lay.base[i], x0 = lay.lx[i], segs = P.richSegs(rich, ln.start, ln.end, base), ul = [];
			segs.forEach(function (g) { g.x = x0 + lay.measure(ln.text.slice(0, g.s - ln.start), ln.start); g.txt = ln.text.slice(g.s - ln.start, g.e - ln.start); });
			segs.forEach(function (g) { if (!(g.m & 4)) return; var xe = x0 + lay.measure(ln.text.slice(0, g.e - ln.start), ln.start) - (ls > 0 ? ls : 0), last = ul[ul.length - 1]; if (last && last.e === g.s) { last.e = g.e; last.x1 = xe; } else ul.push({ s: g.s, e: g.e, x0: g.x, x1: xe }); });
			ul = ul.filter(function (u) { return u.x1 > u.x0; });
			var draw = function (fn) { segs.forEach(function (g) { x.font = fontFor(t, g.m); fn(g); }); };
			var bars = function (fn) { ul.forEach(function (u) { fn(u.x0, py + uOff, u.x1 - u.x0, uTh); }); };
			if (t.shadowOn) { x.save(); x.shadowColor = t.shadow; x.shadowBlur = t.shadowBlur; x.shadowOffsetX = t.shadowDx; x.shadowOffsetY = t.shadowDy; x.fillStyle = t.color; draw(function (g) { x.fillText(g.txt, g.x, py); }); bars(function (a, b, w, h) { x.fillRect(a, b, w, h); }); x.restore(); }
			if (sw > 0) { x.strokeStyle = t.stroke; x.lineWidth = sw * 2; draw(function (g) { x.strokeText(g.txt, g.x, py); }); bars(function (a, b, w, h) { x.strokeRect(a, b, w, h); }); }
			x.fillStyle = t.color; draw(function (g) { x.fillText(g.txt, g.x, py); }); bars(function (a, b, w, h) { x.fillRect(a, b, w, h); });
		});
		L._pad = pad; var dx = (W - oldW) / 2, dy = (H - oldH) / 2, m6 = matrix(L);      // keep the top-left corner where it was
		L.cx += m6[0] * dx + m6[2] * dy; L.cy += m6[1] * dx + m6[3] * dy; L.canvas = c; L.rev++;
		if (L.mask) { L.mask = null; } if (L.crop) L.crop = P.clampCrop(L.crop, W, H);
	};

	/* ---------- layer styles (L.fx): an outline and / or a drop shadow worked out from the layer's visible pixels (mask and crop included), never baked
	   into the layer: change or remove them any time (Layer -> Layer style). Cached in the layer's own pixel space, so panning and zooming cost nothing.
	   fx = { outline: {on, w (px on the image), c, pos: outside | center | inside, op (0-1)}, shadow: {on, c, op, blur, dx, dy (px on the image)} } */
	PE.FXDEF = { outline: { on: false, w: 4, c: "#ffffff", pos: "outside", op: 1 }, shadow: { on: false, c: "#000000", op: 0.55, blur: 14, dx: 6, dy: 8 } };
	function fxOn(L) { var f = L.fx; return !!(f && ((f.outline && f.outline.on && f.outline.w > 0) || (f.shadow && f.shadow.on))); }
	PE.hasFx = fxOn;
	/* how far (image px) the style reaches past the layer's pixels: for bounding boxes (XCF export) */
	PE.fxReach = function (L) { if (!fxOn(L)) return 0; var f = L.fx, r = 0; if (f.outline && f.outline.on && f.outline.pos !== "inside") r = f.outline.w; if (f.shadow && f.shadow.on) r = Math.max(r, f.shadow.blur * 2 + Math.max(Math.abs(f.shadow.dx), Math.abs(f.shadow.dy))); return Math.ceil(r) + 2; };
	function fxCanvases(L) {
		var f = L.fx, cw = L.canvas.width, ch = L.canvas.height, sc = Math.max(0.01, Math.sqrt(Math.abs(L.sx * L.sy))), key = [L.rev, cw, ch, L.sx, L.sy, L.rot, JSON.stringify(L.crop), JSON.stringify(f), !!L.mask].join("|"), k = L._fxc;
		if (k && k.key === key && k.c === L.canvas) return k.r;
		var ol = f.outline && f.outline.on && f.outline.w > 0 ? f.outline : null, sh = f.shadow && f.shadow.on ? f.shadow : null, olw = ol ? ol.w / sc : 0;
		// the shadow offset is on the image (down-right stays down-right however the layer is turned): back into the layer's own axes
		var co = Math.cos(L.rot), si = Math.sin(L.rot), sdx = sh ? (co * sh.dx + si * sh.dy) / L.sx : 0, sdy = sh ? (-si * sh.dx + co * sh.dy) / L.sy : 0, sbl = sh ? sh.blur / sc : 0;
		var mg = Math.ceil(Math.max(ol && ol.pos !== "inside" ? olw : 0, sh ? sbl * 2 + Math.max(Math.abs(sdx), Math.abs(sdy)) : 0)) + 2, W = cw + mg * 2, H = ch + mg * 2, r = { mg: mg, under: null, over: null };
		if (W * H > 24e6) { L._fxc = { key: key, c: L.canvas, r: r }; return r; }   // too big to work out in a browser: drawn without the style
		var src = mk(W, H), sx = src.getContext("2d"); sx.drawImage(L.canvas, mg, mg);
		if (L.mask) { sx.globalCompositeOperation = "destination-in"; sx.drawImage(L.mask, mg, mg); }
		if (L.crop) { sx.globalCompositeOperation = "destination-in"; sx.fillStyle = "#000"; sx.fillRect(mg + L.crop.x, mg + L.crop.y, L.crop.w, L.crop.h); }
		sx.globalCompositeOperation = "source-over";
		var under = null, over = null;
		if (sh) {
			var rgb = P.hexToRgb(sh.c), sc2 = mk(W, H), q = sc2.getContext("2d"); q.shadowColor = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + Math.max(0, Math.min(1, sh.op)) + ")"; q.shadowBlur = sbl; q.shadowOffsetX = 30000 + sdx; q.shadowOffsetY = sdy; q.drawImage(src, -30000, 0); under = sc2;
		}
		if (ol) {
			var id = sx.getImageData(0, 0, W, H), al = new Uint8Array(W * H); for (var i = 0; i < al.length; i++) al[i] = id.data[i * 4 + 3];
			var oa = P.outlineAlpha(al, W, H, olw, ol.pos), c3 = P.hexToRgb(ol.c), oc = mk(W, H), ox = oc.getContext("2d"), od = ox.createImageData(W, H), opa = Math.max(0, Math.min(1, ol.op == null ? 1 : ol.op));
			for (var j = 0; j < oa.length; j++) { if (!oa[j]) continue; od.data[j * 4] = c3[0]; od.data[j * 4 + 1] = c3[1]; od.data[j * 4 + 2] = c3[2]; od.data[j * 4 + 3] = Math.round(oa[j] * opa); }
			ox.putImageData(od, 0, 0);
			if (ol.pos === "outside") { if (under) { under.getContext("2d").drawImage(oc, 0, 0); } else under = oc; } else over = oc;
		}
		r.under = under; r.over = over; L._fxc = { key: key, c: L.canvas, r: r }; return r;
	}
	PE.fxCanvases = fxCanvases;

	/* ---------- compositing ---------- */
	function clipCrop(x, L) { var cr = L.crop; if (!cr) return; x.beginPath(); x.rect(cr.x - L.canvas.width / 2, cr.y - L.canvas.height / 2, cr.w, cr.h); x.clip(); }
	function drawLayer(ctx, L, base, tmpKey, w, h) {
		if (PE.isGroup(L) || !L.visible) return; var op = L.opacity; for (var gp = L._p; gp; gp = gp._p) { if (!gp.visible) return; op *= gp.opacity; } if (op <= 0) return;
		var src = L.preview || L.canvas, cw = L.canvas.width, ch = L.canvas.height, m = matrix(L), fx = fxOn(L) && !L.noFx ? fxCanvases(L) : null;
		var needTmp = L.mask || L.live || fx;
		if (!needTmp) {
			ctx.save(); ctx.globalAlpha = op; ctx.globalCompositeOperation = L.blend;
			ctx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
			clipCrop(ctx, L); ctx.drawImage(src, -cw / 2, -ch / 2, cw, ch); ctx.restore(); return;
		}
		var t = PE.tmp(tmpKey, w, h), tx = t.getContext("2d");
		tx.save(); tx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
		tx.imageSmoothingQuality = "high"; tx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
		clipCrop(tx, L);
		tx.drawImage(src, -cw / 2, -ch / 2, cw, ch);
		if (L.live && L.live.target !== "mask") { tx.globalCompositeOperation = L.live.erase ? "destination-out" : "source-over"; tx.globalAlpha = L.live.alpha; tx.drawImage(L.live.buf, -cw / 2, -ch / 2); tx.globalAlpha = 1; }
		if (L.mask) {
			tx.globalCompositeOperation = "destination-in";
			if (L.live && L.live.target === "mask") { var mm = PE.tmp(tmpKey + "m", L.mask.width, L.mask.height), mc = mm.getContext("2d"); mc.drawImage(L.mask, 0, 0); mc.globalCompositeOperation = L.live.erase ? "destination-out" : "source-over"; mc.globalAlpha = L.live.alpha; mc.drawImage(L.live.buf, 0, 0); tx.drawImage(mm, -cw / 2, -ch / 2); }
			else tx.drawImage(L.mask, -cw / 2, -ch / 2);
		}
		tx.restore();
		if (fx && (fx.under || fx.over)) {
			tx.save(); tx.setTransform(base[0] * m[0] + base[2] * m[1], base[1] * m[0] + base[3] * m[1], base[0] * m[2] + base[2] * m[3], base[1] * m[2] + base[3] * m[3], base[0] * m[4] + base[2] * m[5] + base[4], base[1] * m[4] + base[3] * m[5] + base[5]);
			tx.imageSmoothingQuality = "high"; tx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
			if (fx.under) { tx.globalCompositeOperation = "destination-over"; tx.drawImage(fx.under, -cw / 2 - fx.mg, -ch / 2 - fx.mg); }
			if (fx.over) { tx.globalCompositeOperation = "source-over"; tx.drawImage(fx.over, -cw / 2 - fx.mg, -ch / 2 - fx.mg); }
			tx.restore();
		}
		ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = op; ctx.globalCompositeOperation = L.blend; ctx.drawImage(t, 0, 0); ctx.restore();
	}
	PE.drawLayer = drawLayer;
	/* the whole picture as a document-size canvas (export, copy merged, thumbnails) */
	PE.flatten = function (o) {
		o = o || {}; var d = PE.doc; PE.relink(); var sc = o.scale || 1, W = Math.max(1, Math.round(d.w * sc)), H = Math.max(1, Math.round(d.h * sc)), c = mk(W, H), x = c.getContext("2d");
		if (o.fill) { x.fillStyle = o.fill; x.fillRect(0, 0, W, H); }
		x.imageSmoothingQuality = "high";
		d.layers.forEach(function (L) { if (o.only && o.only.indexOf(L) < 0) return; drawLayer(x, L, [sc, 0, 0, sc, 0, 0], "exp", W, H); });
		return c;
	};
	PE.invalidate = function () { if (PE._raf) return; PE._raf = requestAnimationFrame(function () { PE._raf = 0; PE.render(); PE.drawOverlay(); }); };
	PE.invalidateOverlay = function () { if (PE._oraf) return; PE._oraf = requestAnimationFrame(function () { PE._oraf = 0; PE.drawOverlay(); }); };

	/* ---------- view ---------- */
	PE.toDoc = function (cx, cy) { var r = PE.els.over.getBoundingClientRect(), v = PE.view; return { x: (cx - r.left - v.px) / v.zoom, y: (cy - r.top - v.py) / v.zoom }; };
	PE.toScreen = function (x, y) { var v = PE.view; return { x: x * v.zoom + v.px, y: y * v.zoom + v.py }; };
	PE.fit = function (pad) {
		var v = PE.view, d = PE.doc; if (!d || !v.w) return; pad = pad == null ? 24 : pad;
		var z = Math.min((v.w - pad * 2) / d.w, (v.h - pad * 2) / d.h); v.zoom = Math.min(Math.max(z, 0.02), 1); v.px = (v.w - d.w * v.zoom) / 2; v.py = (v.h - d.h * v.zoom) / 2; PE.emit("view"); PE.invalidate();
	};
	PE.setZoom = function (z, sx, sy) {
		var v = PE.view; z = Math.min(64, Math.max(0.02, z)); if (sx == null) { sx = v.w / 2; sy = v.h / 2; }
		var dx = (sx - v.px) / v.zoom, dy = (sy - v.py) / v.zoom; v.zoom = z; v.px = sx - dx * z; v.py = sy - dy * z; PE.emit("view"); PE.invalidate();
	};
	PE.panBy = function (dx, dy) { PE.view.px += dx; PE.view.py += dy; PE.emit("view"); PE.invalidate(); };
	var checker = null;
	function checkerPattern(ctx, dpr, dark) {
		var s = Math.round(8 * dpr), c = mk(s * 2, s * 2), x = c.getContext("2d");
		x.fillStyle = dark ? "#3a3a3a" : "#ffffff"; x.fillRect(0, 0, s * 2, s * 2); x.fillStyle = dark ? "#2e2e2e" : "#cfcfcf"; x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s);
		return ctx.createPattern(c, "repeat");
	}
	PE.render = function () {
		var v = PE.view, c = PE.els.main; if (!c || !v.w) return;
		var W = Math.round(v.w * v.dpr), H = Math.round(v.h * v.dpr);
		if (c.width !== W || c.height !== H) { c.width = W; c.height = H; checker = null; }
		var ctx = c.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#1b1b1f"; ctx.fillRect(0, 0, W, H);
		var d = PE.doc; if (!d) return; PE.relink();
		var z = v.zoom * v.dpr, ox = v.px * v.dpr, oy = v.py * v.dpr, rx = ox, ry = oy, rw = d.w * z, rh = d.h * z;
		ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 18 * v.dpr; ctx.fillStyle = "#000"; ctx.fillRect(rx, ry, rw, rh); ctx.restore();
		ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
		if (!checker) checker = checkerPattern(ctx, v.dpr, true);
		ctx.fillStyle = PE.docBg || checker; ctx.fillRect(rx, ry, rw, rh);
		var comp = PE.tmp("comp", W, H), cx = comp.getContext("2d"); cx.imageSmoothingEnabled = z < 2; cx.imageSmoothingQuality = "high";
		var base = [z, 0, 0, z, ox, oy];
		d.layers.forEach(function (L) { drawLayer(cx, L, base, "lt", W, H); });
		ctx.drawImage(comp, 0, 0);
		if (PE.showGrid && z >= 6) { ctx.strokeStyle = "rgba(128,128,128,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); for (var gx = 0; gx <= d.w; gx++) { ctx.moveTo(Math.round(rx + gx * z) + 0.5, ry); ctx.lineTo(Math.round(rx + gx * z) + 0.5, ry + rh); } for (var gy = 0; gy <= d.h; gy++) { ctx.moveTo(rx, Math.round(ry + gy * z) + 0.5); ctx.lineTo(rx + rw, Math.round(ry + gy * z) + 0.5); } ctx.stroke(); }
		ctx.restore();
	};

	/* ---------- selection (a document-size canvas, alpha = how selected) ---------- */
	function selCanvas() { if (!PE.sel) PE.sel = { c: mk(PE.doc.w, PE.doc.h), ver: 0 }; return PE.sel; }
	PE.selChanged = function () { var s = PE.sel; if (s) { s.ver++; s.u8 = null; s.bb = undefined; } PE.emit("sel"); PE.invalidateOverlay(); };
	/* shape(ctx): draws the new region in white; mode "new" | "add" | "sub" | "int" */
	PE.selShape = function (draw, mode) {
		if (!PE.sel && (mode === "sub" || mode === "int")) mode = "new"; /* nothing to subtract from: start a selection instead of making an empty one */
		var d = PE.doc, s = selCanvas(), n = mk(d.w, d.h), nx = n.getContext("2d"); nx.fillStyle = "#fff"; draw(nx);
		PE.selCombine(n, mode);
	};
	PE.selCombine = function (n, mode) {
		if (!PE.sel && (mode === "sub" || mode === "int")) mode = "new";
		var s = selCanvas(), x = s.c.getContext("2d");
		if (mode === "add") { x.globalCompositeOperation = "source-over"; x.drawImage(n, 0, 0); }
		else if (mode === "sub") { x.globalCompositeOperation = "destination-out"; x.drawImage(n, 0, 0); }
		else if (mode === "int") { x.globalCompositeOperation = "destination-in"; x.drawImage(n, 0, 0); }
		else { x.globalCompositeOperation = "copy"; x.drawImage(n, 0, 0); }
		x.globalCompositeOperation = "source-over"; PE.selChanged(); PE.selTrim();
	};
	PE.selMask = function () { var s = PE.sel; if (!s) return null; if (!s.u8) { var d = s.c.getContext("2d").getImageData(0, 0, s.c.width, s.c.height).data, u = new Uint8Array(s.c.width * s.c.height); for (var i = 0; i < u.length; i++) u[i] = d[i * 4 + 3]; s.u8 = u; } return s.u8; };
	PE.selBounds = function () { var s = PE.sel; if (!s) return null; if (s.bb === undefined) s.bb = P.maskBounds(PE.selMask(), s.c.width, s.c.height); return s.bb; };
	PE.selTrim = function () { if (PE.sel && !PE.selBounds()) { PE.sel = null; PE.emit("sel"); PE.invalidateOverlay(); } };
	PE.selFromMask = function (u8, mode) {
		var d = PE.doc, n = mk(d.w, d.h), x = n.getContext("2d"), id = x.createImageData(d.w, d.h), a = id.data;
		for (var i = 0; i < u8.length; i++) { a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = 255; a[i * 4 + 3] = u8[i]; }
		x.putImageData(id, 0, 0); PE.selCombine(n, mode || "new");
	};
	PE.selAll = function () { PE.selShape(function (x) { x.fillRect(0, 0, PE.doc.w, PE.doc.h); }, "new"); };
	PE.selClear = function () { if (PE.sel) { PE.sel = null; PE.emit("sel"); PE.invalidateOverlay(); } };
	PE.selInvert = function () { var d = PE.doc; if (!PE.sel) { PE.selAll(); return; } var m = P.invertMask(PE.selMask()); PE.selFromMask(m, "new"); };
	PE.selGrow = function (r, grow) { if (!PE.sel) return; var d = PE.doc; PE.selFromMask(P.growShrinkMask(PE.selMask(), d.w, d.h, r, grow), "new"); };
	PE.selFeather = function (r) { if (!PE.sel) return; var d = PE.doc; PE.selFromMask(P.featherMask(PE.selMask(), d.w, d.h, r), "new"); };
	/* the selection cut out for a doc-space rect, drawn into ctx (destination-in) so a dab / shape stays inside it */
	PE.restrictToSel = function (ctx, x, y, w, h) {
		if (!PE.sel) return; var sc = PE.sel.c, sx = Math.max(0, x), sy = Math.max(0, y), sw = Math.min(sc.width, x + w) - sx, sh = Math.min(sc.height, y + h) - sy;
		ctx.save(); ctx.globalCompositeOperation = "destination-in"; ctx.setTransform(1, 0, 0, 1, 0, 0);
		if (sw <= 0 || sh <= 0) { ctx.clearRect(0, 0, w, h); ctx.restore(); return; }
		var cc = PE.tmp("selcrop", Math.ceil(w), Math.ceil(h)); cc.getContext("2d").drawImage(sc, sx, sy, sw, sh, sx - x, sy - y, sw, sh);
		ctx.drawImage(cc, 0, 0); ctx.restore();
	};

	/* ---------- pixel operations on a layer (adjustments, filters, fills), limited to the selection ---------- */
	PE.layerData = function (L) { return L.canvas.getContext("2d").getImageData(0, 0, L.canvas.width, L.canvas.height); };
	PE.selMaskForLayer = function (L) {
		if (!PE.sel) return null; var o = PE.origin(L), w = L.canvas.width, h = L.canvas.height, m = PE.selMask(), sw = PE.sel.c.width, sh = PE.sel.c.height, out = new Uint8Array(w * h);
		for (var y = 0; y < h; y++) { var dy = y + o.y; if (dy < 0 || dy >= sh) continue; for (var x = 0; x < w; x++) { var dx = x + o.x; if (dx >= 0 && dx < sw) out[y * w + x] = m[dy * sw + dx]; } }
		return out;
	};
	PE.applyPixels = function (L, fn, label, noCommit) {
		if (!PE.prepare(L, false, true)) return false;
		var id = PE.layerData(L), before = PE.sel ? new Uint8ClampedArray(id.data) : null; fn(id.data, id.width, id.height);
		if (before) P.blendByMask(before, id.data, PE.selMaskForLayer(L));
		L.canvas.getContext("2d").putImageData(id, 0, 0); L.rev++; PE.invalidate(); if (!noCommit) PE.commit(label); return true;
	};

	/* ---------- history ---------- */
	var H = PE.hist = { stack: [], idx: -1 };
	function snapLayer(L) {
		var s = L._snap; if (!s || s.rev !== L.rev || (L.mask ? !s.m : !!s.m)) { s = L._snap = { rev: L.rev, c: clone(L.canvas), m: L.mask ? clone(L.mask) : null }; }
		return { meta: { id: L.id, group: L.group, collapsed: L.collapsed, name: L.name, type: L.type, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, text: L.text ? JSON.parse(JSON.stringify(L.text)) : null, eq: L.eq ? JSON.parse(JSON.stringify(L.eq)) : null, editMask: L.editMask, src: L.src || null, crop: L.crop ? Object.assign({}, L.crop) : null, fx: L.fx ? JSON.parse(JSON.stringify(L.fx)) : null }, snap: s };
	}
	var lastSel = { ver: -1, obj: null };
	function takeSnapshot(label) {
		var d = PE.doc, sel = null;
		if (PE.sel) { if (lastSel.obj && lastSel.ver === PE.sel.ver && lastSel.c === PE.sel.c) sel = lastSel.snap; else { sel = clone(PE.sel.c); lastSel = { ver: PE.sel.ver, c: PE.sel.c, snap: sel, obj: PE.sel }; } }
		return { label: label, w: d.w, h: d.h, active: d.activeId, layers: d.layers.map(snapLayer), sel: sel, comps: JSON.stringify(d.comps || []), t: Date.now() };
	}
	PE.commit = function (label) {
		if (!PE.doc) return; PE.dirty = true;
		H.stack.length = H.idx + 1; H.stack.push(takeSnapshot(label)); H.idx = H.stack.length - 1;
		var budget = 700e6, total = function () { var seen = new Set(), t = 0; H.stack.forEach(function (e) { e.layers.forEach(function (l) { if (!seen.has(l.snap)) { seen.add(l.snap); t += l.snap.c.width * l.snap.c.height * 4 + (l.snap.m ? l.snap.m.width * l.snap.m.height * 4 : 0); } }); }); return t; };
		while (H.stack.length > 2 && (H.stack.length > 100 || total() > budget)) { H.stack.shift(); H.idx--; }
		PE.emit("history"); PE.emit("layers"); PE.invalidate(); PE.scheduleAutosave && PE.scheduleAutosave();
	};
	function restore(e) {
		var d = PE.doc; d.w = e.w; d.h = e.h; d.layers = e.layers.map(function (l) {
			var L = PE.makeLayer({ canvas: clone(l.snap.c), type: l.meta.type, name: l.meta.name, text: l.meta.text }); for (var k in l.meta) if (k !== "text" && k !== "eq" && k !== "crop" && k !== "fx") L[k] = l.meta[k]; L.crop = l.meta.crop ? Object.assign({}, l.meta.crop) : null; L.fx = l.meta.fx ? JSON.parse(JSON.stringify(l.meta.fx)) : null; L.text = l.meta.text ? JSON.parse(JSON.stringify(l.meta.text)) : null; L.eq = l.meta.eq ? JSON.parse(JSON.stringify(l.meta.eq)) : null;
			L.mask = l.snap.m ? clone(l.snap.m) : null; L.rev = l.snap.rev; L._snap = l.snap; return L; });
		d.comps = JSON.parse(e.comps || "[]"); d.activeId = e.active; if (!PE.layerById(d.activeId) && d.layers.length) d.activeId = d.layers[d.layers.length - 1].id;
		PE.sel = e.sel ? { c: clone(e.sel), ver: ++PE.selSeq } : null; PE.relink(); PE.emit("sel"); PE.emit("history"); PE.emit("layers"); PE.emit("comps"); PE.emit("docsize"); PE.invalidate(); PE.scheduleAutosave && PE.scheduleAutosave();
	}
	PE.selSeq = 1000;
	PE.undo = function () { if (H.idx > 0) { H.idx--; restore(H.stack[H.idx]); } };
	PE.redo = function () { if (H.idx < H.stack.length - 1) { H.idx++; restore(H.stack[H.idx]); } };
	PE.gotoHistory = function (i) { if (i >= 0 && i < H.stack.length && i !== H.idx) { H.idx = i; restore(H.stack[i]); } };

	/* ---------- documents ---------- */
	PE.newDoc = function (w, h, bg, name) {
		w = Math.round(w); h = Math.round(h); if (!(w > 0 && h > 0) || w > PE.MAXPX || h > PE.MAXPX || w * h > PE.MAXAREA) { PE.toast("That size is too large for a browser (max " + PE.MAXPX + " px a side)"); return false; }
		PE.doc = { w: w, h: h, layers: [], activeId: 0, next: 1, name: name || "Untitled", comps: [], pid: P.newProjectId() }; PE.sel = null; H.stack = []; H.idx = -1; lastSel = { ver: -1 };
		var L = PE.makeLayer({ name: bg ? "Background" : "Layer 1" }); if (bg) { var x = L.canvas.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, w, h); }
		PE.doc.layers.push(L); PE.doc.activeId = L.id; PE.commit("New document"); PE.dirty = false; PE.emit("docsize"); PE.emit("sel"); PE.fit(); return true;
	};
	PE.openImageSource = function (src, name, meta) {
		var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, w0 = w, h0 = h;
		if (w > PE.MAXPX || h > PE.MAXPX || w * h > PE.MAXAREA) { var s = Math.min(PE.MAXPX / w, PE.MAXPX / h, Math.sqrt(PE.MAXAREA / (w * h))), c = mk(w * s, h * s), x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; PE.toast("Very large image: scaled down to " + w + " × " + h + " to fit the browser"); }
		if (!PE.newDoc(w, h, null, I.baseName(name || "image"))) return false;
		var L = PE.doc.layers[0]; L.name = "Background"; L.canvas.getContext("2d").drawImage(src, 0, 0); L.rev++; L.src = PE.mkSrc(meta || { how: "open", file: name }, w0, h0); PE.doc.file = L.src; PE.commit("Open " + (name || "image")); PE.dirty = false; PE.fit(); return true;
	};
	PE.decodeFile = function (file) {
		if (window.createImageBitmap && !/svg/.test(file.type)) return createImageBitmap(file).catch(function () { return viaImg(file); });
		return viaImg(file);
	};
	function viaImg(file) { return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("Can't read this image")); }; im.src = u; }); }
	/* add an image / canvas as a new layer, centred (scaled down if bigger than the document) */
	PE.placeSource = function (src, name, at, meta) {
		var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, c = mk(w, h); c.getContext("2d").drawImage(src, 0, 0);
		var L = PE.makeLayer({ canvas: c, name: name || "Layer", cx: at ? at.x : PE.doc.w / 2, cy: at ? at.y : PE.doc.h / 2, src: meta ? PE.mkSrc(meta, w, h) : null });
		if (!at && (w > PE.doc.w || h > PE.doc.h)) { var s = Math.min(PE.doc.w / w, PE.doc.h / h); L.sx = L.sy = s; }
		if (!at) { L.cx = Math.round(PE.doc.w / 2 * 2) / 2; L.cy = Math.round(PE.doc.h / 2 * 2) / 2; if (PE.isIdentity(L)) { L.cx = Math.round(L.cx - w / 2) + w / 2; L.cy = Math.round(L.cy - h / 2) + h / 2; } }
		PE.addLayer(L); PE.commit("Place " + (name || "image")); return L;
	};

	/* ---------- layer commands ---------- */
	PE.newRasterLayer = function (name) { PE.addLayer(PE.makeLayer({ name: name || "Layer " + PE.doc.next })); PE.commit("New layer"); };
	PE.duplicateLayer = function (L) {
		L = L || PE.active(); if (!L) return; var d = PE.doc, block = PE.blockOf(L), map = {}, copies = block.map(function (B) {
			var n = PE.makeLayer({ canvas: clone(B.canvas), type: B.type, name: B.name + (B === L ? " copy" : ""), text: B.text ? JSON.parse(JSON.stringify(B.text)) : null }); map[B.id] = n;
			["cx", "cy", "sx", "sy", "rot", "visible", "opacity", "blend", "collapsed"].forEach(function (k) { n[k] = B[k]; }); if (B.eq) n.eq = JSON.parse(JSON.stringify(B.eq)); if (B.mask) n.mask = clone(B.mask); if (B.src) n.src = Object.assign({}, B.src, { copy: true }); if (B.crop) n.crop = Object.assign({}, B.crop); if (B.fx) n.fx = JSON.parse(JSON.stringify(B.fx)); return n; });
		copies.forEach(function (n, i) { var B = block[i]; n.group = B === L ? L.group : (map[B.group] ? map[B.group].id : L.group); });
		var at = d.layers.indexOf(L) + 1; Array.prototype.splice.apply(d.layers, [at, 0].concat(copies)); d.activeId = copies[copies.length - 1].id; PE.relink(); PE.commit("Duplicate " + (PE.isGroup(L) ? "group" : "layer"));
	};
	PE.deleteLayer = function (L) {
		L = L || PE.active(); if (!L) return; var d = PE.doc, i = d.layers.indexOf(L), gone = PE.blockOf(L);
		d.layers = d.layers.filter(function (x) { return gone.indexOf(x) < 0; });
		if (!d.layers.length) d.layers.push(PE.makeLayer({ name: "Layer 1" })); d.activeId = d.layers[Math.max(0, Math.min(i - gone.length + 1, d.layers.length - 1))].id; PE.relink(); PE.commit("Delete " + (PE.isGroup(L) ? "group" : "layer"));
	};
	/* move a layer (with its members, if a group) next to `target`: zone "above" (higher in the stack) / "below" / "into" (target is a group: becomes its top member) */
	PE.relocate = function (src, target, zone) {
		var d = PE.doc; if (!src || !target || src === target) return false;
		if (PE.isGroup(src) && PE.descendants(src).indexOf(target) >= 0) return false;
		var block = PE.blockOf(src); d.layers = d.layers.filter(function (x) { return block.indexOf(x) < 0; });
		var ti = d.layers.indexOf(target), at, parent;
		if (zone === "into" && PE.isGroup(target)) { parent = target.id; at = ti; }
		else { parent = target.group; if (zone === "below") { at = ti - (PE.isGroup(target) ? PE.descendants(target).length : 0); } else at = ti + 1; }
		src.group = parent; Array.prototype.splice.apply(d.layers, [Math.max(0, at), 0].concat(block)); PE.relink(); PE.commit("Reorder layers"); return true;
	};
	PE.moveLayer = function (L, to) {
		var d = PE.doc; var sibs = d.layers.filter(function (x) { return x.group === L.group; }), i = sibs.indexOf(L), t = Math.max(0, Math.min(sibs.length - 1, to)); if (i < 0 || i === t) return;
		var other = sibs[t]; PE.relocate(L, other, t > i ? "above" : "below");
	};
	PE.stepLayer = function (L, dir) { var sibs = PE.doc.layers.filter(function (x) { return x.group === L.group; }), i = sibs.indexOf(L); PE.moveLayer(L, i + dir); };
	PE.groupLayers = function (list) {
		var d = PE.doc; list = (list || []).filter(Boolean); if (!list.length) { PE.toast("Select the layers to group (Ctrl-click in the Layers panel)"); return null; }
		list.sort(function (a, b) { return d.layers.indexOf(a) - d.layers.indexOf(b); }); var top = list[list.length - 1], parent = top.group;
		var members = list.filter(function (L) { return L.group === parent; }); if (!members.length) members = [top];
		var blocks = []; members.forEach(function (L) { PE.blockOf(L).forEach(function (B) { if (blocks.indexOf(B) < 0) blocks.push(B); }); }); blocks = d.layers.filter(function (x) { return blocks.indexOf(x) >= 0; });
		var G = PE.makeGroup("Group " + d.next), topIdx = d.layers.indexOf(top), before = d.layers.slice(0, topIdx + 1).filter(function (x) { return blocks.indexOf(x) < 0; }).length;
		d.layers = d.layers.filter(function (x) { return blocks.indexOf(x) < 0; }); G.group = parent; members.forEach(function (L) { L.group = G.id; });
		Array.prototype.splice.apply(d.layers, [before, 0].concat(blocks, [G])); d.activeId = G.id; PE.relink(); PE.commit("Group layers"); return G;
	};
	PE.ungroup = function (G) {
		G = G || PE.active(); if (!PE.isGroup(G)) { PE.toast("Select a group first"); return; } var d = PE.doc, kids = PE.kidsOf(G); kids.forEach(function (k) { k.group = G.group; });
		d.layers = d.layers.filter(function (x) { return x !== G; }); d.activeId = kids.length ? kids[kids.length - 1].id : (d.layers[d.layers.length - 1] || {}).id; PE.relink(); PE.commit("Ungroup");
	};
	PE.mergeLayers = function (list, label) {
		var d = PE.doc; list = d.layers.filter(function (L) { return list.indexOf(L) >= 0 && !PE.isGroup(L); }); if (list.length < 2) return; PE.relink();
		var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(function (L) { var b = PE.bounds(L); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
		x0 = Math.floor(x0); y0 = Math.floor(y0); var W = Math.ceil(x1) - x0, Hh = Math.ceil(y1) - y0; if (W * Hh > PE.MAXAREA) { PE.toast("Merged layer would be too large"); return; }
		var c = mk(W, Hh), x = c.getContext("2d"); x.imageSmoothingQuality = "high"; list.forEach(function (L) { drawLayer(x, L, [1, 0, 0, 1, -x0, -y0], "merge", W, Hh); });
		var top = list[list.length - 1], n = PE.makeLayer({ canvas: c, name: list[0].name, x: x0, y: y0, src: { how: "merge", from: list.map(function (L) { return L.name; }).reverse(), t: Date.now() } }), at = d.layers.indexOf(top); n.group = top.group;
		d.layers = d.layers.filter(function (L) { return list.indexOf(L) < 0; }); d.layers.splice(Math.min(at - list.length + 1, d.layers.length), 0, n); d.activeId = n.id; PE.relink(); PE.commit(label || "Merge layers");
	};
	PE.mergeDown = function () { var d = PE.doc, L = PE.active(), i = PE.indexOf(L); if (!L || PE.isGroup(L)) { PE.toast("Select a normal layer to merge"); return; } var below = d.layers[i - 1]; if (!below || PE.isGroup(below) || below.group !== L.group) { PE.toast("There is no layer directly below in this group"); return; } PE.mergeLayers([below, L], "Merge down"); };
	PE.mergeVisible = function () { PE.relink(); PE.mergeLayers(PE.doc.layers.filter(function (L) { return PE.effVisible(L) && !PE.isGroup(L); }), "Merge visible"); };
	PE.flattenImage = function () { var d = PE.doc, all = d.layers.filter(function (L) { return !PE.isGroup(L) && PE.effVisible(L); }); if (all.length < 2 && d.layers.length === all.length) return; d.layers.forEach(function (L) { L.group = null; }); PE.relink(); PE.mergeLayers(all, "Flatten image"); d.layers = d.layers.filter(function (L) { return !PE.isGroup(L); }); var L = PE.active(); if (L) L.name = "Background"; PE.commit("Flatten image"); };
	PE.layerFromSelection = function (cut) {
		var L = PE.active(), b = PE.selBounds(); if (!L || !b) { PE.toast("Make a selection first"); return; }
		var c = mk(b.w, b.h), x = c.getContext("2d"); drawLayer(x, L, [1, 0, 0, 1, -b.x, -b.y], "sel", b.w, b.h); x.globalCompositeOperation = "destination-in"; x.drawImage(PE.sel.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
		var n = PE.makeLayer({ canvas: c, name: (cut ? "Cut" : "Copy") + " of " + L.name, x: b.x, y: b.y });
		if (cut && PE.prepare(L, false, true)) { var o = PE.origin(L), lx = L.canvas.getContext("2d"); lx.save(); lx.globalCompositeOperation = "destination-out"; lx.drawImage(PE.sel.c, -o.x, -o.y); lx.restore(); L.rev++; }
		n.group = L.group; PE.addLayer(n, PE.indexOf(L) + 1); PE.commit(cut ? "Layer via cut" : "Layer via copy");
	};
	PE.addMask = function (L, fromSel) {
		L = L || PE.active(); if (!L || L.mask) return; PE.bake(L); var m = mk(L.canvas.width, L.canvas.height), x = m.getContext("2d");
		if (fromSel && PE.sel) { var o = PE.origin(L); x.drawImage(PE.sel.c, -o.x, -o.y); } else { x.fillStyle = "#000"; x.fillRect(0, 0, m.width, m.height); }
		L.mask = m; L.editMask = true; L.rev++; PE.commit("Add layer mask");
	};
	PE.applyMask = function (L) { L = L || PE.active(); if (!L || !L.mask) return; PE.bake(L); var x = L.canvas.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-in"; x.drawImage(L.mask, 0, 0); x.restore(); L.mask = null; L.editMask = false; L.rev++; PE.commit("Apply layer mask"); };
	PE.deleteMask = function (L) { L = L || PE.active(); if (!L || !L.mask) return; L.mask = null; L.editMask = false; L.rev++; PE.commit("Delete layer mask"); };

	/* ---------- comps (scenes): named states of every layer's visibility, position, scale, rotation, opacity and blend mode (like Photoshop layer comps). Layers that did not exist when a comp was
	   saved are hidden when it is applied, so a comp always shows what it showed. "Export all comps" turns one project with many groups into a set of pictures. ---------- */
	PE.compCapture = function () { var st = {}; PE.doc.layers.forEach(function (L) { st[L.id] = { v: L.visible ? 1 : 0, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, o: L.opacity, b: L.blend }; }); return st; };
	PE.compSave = function (name) { var d = PE.doc; d.comps = d.comps || []; var c = { id: "c" + (d.next++), name: name || "Comp " + (d.comps.length + 1), st: PE.compCapture() }; d.comps.push(c); PE.commit("Save comp \"" + c.name + "\""); PE.emit("comps"); return c; };
	PE.compUpdate = function (c) { c.st = PE.compCapture(); PE.commit("Update comp \"" + c.name + "\""); PE.emit("comps"); };
	PE.compApplyState = function (c) { var d = PE.doc; d.layers.forEach(function (L) { var s = c.st[L.id]; if (!s) { L.visible = false; return; } L.visible = !!s.v; L.cx = s.cx; L.cy = s.cy; L.sx = s.sx; L.sy = s.sy; L.rot = s.rot; L.opacity = s.o; L.blend = s.b; L.rev++; }); PE.relink(); PE.invalidate(); };
	PE.compApply = function (c) { PE.compApplyState(c); PE.commit("Show comp \"" + c.name + "\""); PE.emit("comps"); };
	PE.compMatches = function (c) { var d = PE.doc, ok = true; d.layers.forEach(function (L) { var s = c.st[L.id]; if (!s) { if (L.visible) ok = false; return; } if (!!s.v !== L.visible || Math.abs(s.cx - L.cx) > 0.01 || Math.abs(s.cy - L.cy) > 0.01 || s.sx !== L.sx || s.sy !== L.sy || s.rot !== L.rot || Math.abs(s.o - L.opacity) > 0.001 || s.b !== L.blend) ok = false; }); return ok; };
	PE.compDelete = function (c) { var d = PE.doc; d.comps = d.comps.filter(function (x) { return x !== c; }); PE.commit("Delete comp"); PE.emit("comps"); };
	PE.compRename = function (c, name) { c.name = name; PE.commit("Rename comp"); PE.emit("comps"); };
	PE.compMove = function (c, dir) { var a = PE.doc.comps, i = a.indexOf(c), j = i + dir; if (j < 0 || j >= a.length) return; a.splice(i, 1); a.splice(j, 0, c); PE.commit("Reorder comps"); PE.emit("comps"); };

	/* ---------- image-level operations ---------- */
	PE.cropTo = function (x, y, w, h) {
		x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (w < 1 || h < 1) return;
		var d = PE.doc; d.layers.forEach(function (L) { L.cx -= x; L.cy -= y; }); d.w = w; d.h = h; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Crop"); PE.fit();
	};
	/* set the canvas to rect {x,y,w,h} measured from the current top-left (x / y may be negative to grow upwards / leftwards), optional fill colour layer at the bottom */
	PE.canvasRect = function (x, y, w, h, fill) {
		var d = PE.doc; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (w < 1 || h < 1) return; if (w * h > PE.MAXAREA || w > PE.MAXPX || h > PE.MAXPX) { PE.toast("Too large"); return; }
		d.layers.forEach(function (L) { L.cx -= x; L.cy -= y; }); d.w = w; d.h = h;
		if (fill) { var L = PE.makeLayer({ name: "Background" }); L.canvas.getContext("2d").fillStyle = fill; L.canvas.getContext("2d").fillRect(0, 0, w, h); d.layers.unshift(L); }
		PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Canvas size"); PE.fit();
	};
	PE.canvasSize = function (w, h, ax, ay, fill) {
		var d = PE.doc; w = Math.round(w); h = Math.round(h); if (w * h > PE.MAXAREA || w > PE.MAXPX || h > PE.MAXPX) { PE.toast("Too large"); return; }
		var dx = Math.round((w - d.w) * ax), dy = Math.round((h - d.h) * ay); d.layers.forEach(function (L) { L.cx += dx; L.cy += dy; }); d.w = w; d.h = h;
		if (fill) { var L = PE.makeLayer({ name: "Background" }); L.canvas.getContext("2d").fillStyle = fill; L.canvas.getContext("2d").fillRect(0, 0, w, h); d.layers.unshift(L); }
		PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Canvas size"); PE.fit();
	};
	PE.resizeImage = function (w, h) {
		var d = PE.doc, fx = w / d.w, fy = h / d.h; w = Math.round(w); h = Math.round(h); if (w * h > PE.MAXAREA || w > PE.MAXPX || h > PE.MAXPX) { PE.toast("Too large"); return; }
		d.layers.forEach(function (L) {
			if (L.type === "text" && Math.abs(fx - fy) < 1e-6) { L.text.size = Math.max(1, L.text.size * fx); L.text.strokeW *= fx; L.text.shadowBlur *= fx; L.text.shadowDx *= fx; L.text.shadowDy *= fx; var ocx = L.cx * fx, ocy = L.cy * fy; PE.renderText(L); L.cx = ocx; L.cy = ocy; return; }
			if (L.type === "text") PE.rasterize(L);
			PE.bake(L); var nw = Math.max(1, Math.round(L.canvas.width * fx)), nh = Math.max(1, Math.round(L.canvas.height * fy));
			var ow0 = L.canvas.width, oh0 = L.canvas.height; L.canvas = PE.resample(L.canvas, nw, nh); if (L.mask) L.mask = PE.resample(L.mask, nw, nh); if (L.crop) L.crop = P.clampCrop({ x: L.crop.x * nw / ow0, y: L.crop.y * nh / oh0, w: L.crop.w * nw / ow0, h: L.crop.h * nh / oh0 }, nw, nh); L.cx *= fx; L.cy *= fy; L.cx = Math.round(L.cx - nw / 2) + nw / 2; L.cy = Math.round(L.cy - nh / 2) + nh / 2; L.rev++;
		});
		d.w = w; d.h = h; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Image size"); PE.fit();
	};
	/* high-quality resample: halve repeatedly while shrinking by more than 2x, then one final draw */
	PE.resample = function (src, w, h) {
		var cur = src; while (cur.width / 2 >= w && cur.height / 2 >= h) { var t = mk(Math.max(w, Math.floor(cur.width / 2)), Math.max(h, Math.floor(cur.height / 2))), tx = t.getContext("2d"); tx.imageSmoothingQuality = "high"; tx.drawImage(cur, 0, 0, t.width, t.height); cur = t; }
		var out = mk(w, h), x = out.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(cur, 0, 0, w, h); return out;
	};
	PE.rotateImage = function (deg) {
		var d = PE.doc, a = deg * Math.PI / 180, W = d.w, Hh = d.h, nw = deg === 180 ? W : Hh, nh = deg === 180 ? Hh : W, c = Math.cos(a), s = Math.sin(a);
		d.layers.forEach(function (L) { var dx = L.cx - W / 2, dy = L.cy - Hh / 2; L.cx = nw / 2 + dx * c - dy * s; L.cy = nh / 2 + dx * s + dy * c; L.rot += a; });
		d.w = nw; d.h = nh; PE.sel = null; PE.emit("sel"); PE.emit("docsize"); PE.commit("Rotate " + deg + "°"); PE.fit();
	};
	PE.flipImage = function (horizontal) {
		var d = PE.doc; d.layers.forEach(function (L) { if (horizontal) { L.cx = d.w - L.cx; L.sx = -L.sx; L.rot = -L.rot; } else { L.cy = d.h - L.cy; L.sy = -L.sy; L.rot = -L.rot; } });
		PE.sel = null; PE.emit("sel"); PE.commit("Flip " + (horizontal ? "horizontal" : "vertical")); PE.invalidate();
	};
	PE.flipLayer = function (horizontal) { var L = PE.active(); if (!L) return; if (PE.isGroup(L)) { PE.toast("Select a normal layer"); return; } if (horizontal) { L.sx = -L.sx; L.rot = -L.rot; } else { L.sy = -L.sy; L.rot = -L.rot; } PE.touch(L); PE.commit("Flip layer"); };
	PE.trim = function () {
		var d = PE.doc, c = PE.flatten(), id = c.getContext("2d").getImageData(0, 0, c.width, c.height), b = P.opaqueBounds(id.data, c.width, c.height, 0);
		if (!b) { PE.toast("Nothing to trim: the image is empty"); return; } if (b.w === d.w && b.h === d.h) { PE.toast("No transparent edges to trim"); return; } PE.cropTo(b.x, b.y, b.w, b.h);
	};

	/* ---------- export ---------- */
	PE.exportBlob = function (fmt, quality, opts) {
		opts = opts || {}; var F = I.FORMATS[fmt], d = PE.doc, sc = opts.scale || 1;
		var c = PE.flatten({ scale: sc, fill: F.alpha ? null : (opts.bg || "#ffffff") });
		return new Promise(function (res, rej) { c.toBlob(function (b) { b && b.type === F.mime ? res(b) : rej(new Error("This browser can't save " + F.name)); }, F.mime, quality); });
	};

	/* ---------- project files (.mesproj = stored ZIP: project.json + PNG per layer / mask) ---------- */
	function canvasBytes(c) { return new Promise(function (res) { c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, "image/png"); }); }
	PE.projectBlob = function () {
		var d = PE.doc, files = [], metas = [], jobs = [];
		d.layers.forEach(function (L) {
			var m = { id: L.id, group: L.group, collapsed: L.collapsed, name: L.name, type: L.type, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, text: L.text, w: L.canvas.width, h: L.canvas.height, hasMask: !!L.mask, eq: L.eq || null, src: L.src ? Object.assign({}, L.src, { hk: undefined }) : null, crop: L.crop || null, fx: L.fx || null }; metas.push(m);
			jobs.push(canvasBytes(L.canvas).then(function (u) { files.push({ name: "layer-" + L.id + ".png", data: u }); }));
			if (L.mask) jobs.push(canvasBytes(L.mask).then(function (u) { files.push({ name: "mask-" + L.id + ".png", data: u }); }));
		});
		return Promise.all(jobs).then(function () {
			files.unshift({ name: "project.json", data: new TextEncoder().encode(JSON.stringify({ app: "MES Photo Editor", v: 2, pid: d.pid || (d.pid = P.newProjectId()), w: d.w, h: d.h, name: d.name, active: d.activeId, next: d.next, layers: metas, comps: d.comps || [] })) });
			return new Blob([I.zipStore(files)], { type: "application/zip" });
		});
	};
	function loadPng(u8) { return new Promise(function (res, rej) { var u = URL.createObjectURL(new Blob([u8], { type: "image/png" })), im = new Image(); im.onload = function () { var c = mk(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0); URL.revokeObjectURL(u); res(c); }; im.onerror = function () { rej(new Error("bad layer image")); }; im.src = u; }); }
	/* the files of a ZIP (stored, or deflated as Finder / Explorer / 7-Zip make them) with project.json's folder stripped from the names */
	PE.readProjectZip = function (u8) {
		var ents = P.zipEntries(u8); if (!ents) return Promise.reject(new Error("Not a MES project file (not a ZIP this editor can read)"));
		var pre = P.projectPrefix(ents.map(function (e) { return e.name; })); if (pre === null) return Promise.reject(new Error("Not a MES project file: the ZIP has no project.json"));
		ents = ents.filter(function (e) { return e.name.indexOf(pre) === 0 && !/(^|\/)__MACOSX\//.test(e.name); });
		return Promise.all(ents.map(function (e) {
			var name = e.name.slice(pre.length); if (e.method === 0) return { name: name, data: e.data };
			if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack compressed ZIPs: save the project from the editor (it writes an uncompressed one)");
			return new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer().then(function (ab) { return { name: name, data: new Uint8Array(ab) }; });
		}));
	};
	PE.isProjectZip = function (u8) { var e = P.isZipBytes(u8) && P.zipEntries(u8); return !!(e && P.projectPrefix(e.map(function (x) { return x.name; })) !== null); };
	/* opts: {pid} = the project id to use when project.json has none (an autosave from before round 5) */
	PE.loadProject = function (buf, fileName, meta, opts) {
		opts = opts || {}; return PE.readProjectZip(new Uint8Array(buf)).then(function (files) { return loadProjectFiles(files, fileName, meta, opts); });
	};
	function loadProjectFiles(files, fileName, meta, opts) {
		var by = {}; files.forEach(function (f) { by[f.name] = f.data; }); if (!by["project.json"]) return Promise.reject(new Error("Not a MES project file"));
		var p = JSON.parse(new TextDecoder().decode(by["project.json"])), layers = [];
		return Promise.all(p.layers.map(function (m, i) {
			return loadPng(by["layer-" + m.id + ".png"]).then(function (c) { var L = PE.makeLayer({ canvas: c, name: m.name, type: m.type, text: m.text }); L.id = m.id; L.eq = m.eq || null; L.src = m.src || (m.type === "group" ? null : { how: fileName === "autosave" ? "autosave" : "project", file: fileName === "autosave" ? "" : fileName || "" }); ["cx", "cy", "sx", "sy", "rot", "visible", "opacity", "blend", "locked", "group", "collapsed"].forEach(function (k) { if (m[k] !== undefined) L[k] = m[k]; }); L.crop = m.crop ? P.clampCrop(m.crop, c.width, c.height) : null; L.fx = m.fx && typeof m.fx === "object" ? m.fx : null; layers[i] = L; return m.hasMask ? loadPng(by["mask-" + m.id + ".png"]).then(function (mc) { L.mask = mc; }) : null; });
		})).then(function () {
			PE.doc = { w: p.w, h: p.h, layers: layers, activeId: p.active, next: p.next || 1000, name: p.name || "Untitled", comps: p.comps || [], pid: p.pid || opts.pid || P.newProjectId(), file: PE.mkSrc(fileName === "autosave" ? { how: "autosave" } : Object.assign({ how: "project", file: fileName }, meta || {}, { how: "project" })) }; PE.relink(); PE.sel = null; H.stack = []; H.idx = -1; lastSel = { ver: -1 };
			PE.commit("Open project"); PE.dirty = false; PE.emit("docsize"); PE.emit("sel"); PE.fit();
		});
	}
})();
