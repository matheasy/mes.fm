/* MES Photo Editor round 7 (2026-10-28):
 * - our own colour picker (PE.colorPop): every <input type="color"> in the editor opens it instead of the browser's own popup, which closed as soon as
 *   it was used. It stays open (pin) while you work: saturation / brightness square, hue strip, hex, R G B, pick from the picture, recent colours.
 * - Layer style (PE.dlgLayerStyle): a live outline (outside / centre / inside) and drop shadow / glow kept on the layer (L.fx), editable any time.
 * - Layer masks: a short "How masks work" guide (shown the first time a mask is added and from the ? next to the Mask button), and the Brush on a
 *   mask follows the colour: dark hides, light shows (tools.js).
 * - Crop Layer tool (Y): a crop box on one layer (L.crop, in the layer's own pixels) hides its edges without deleting them; drag the edges, drag inside
 *   to slide the window, Show all to uncrop. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel; if (!PE || !P) return;
	var el = function (t, c, h) { return PE.el(t, c, h); }, esc = function (s) { return PE.esc(s); };
	var KEY = "mes-photo-editor:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

	/* ================= colour picker ================= */
	var BASIC = ["#000000", "#ffffff", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff2d55", "#8e8e93"];
	var pop = null;   // {el, inp, key, h, s, v, pinned, changeT}
	function keyOf(inp) {
		if (inp.dataset.ck) return inp.dataset.ck;
		var box = inp.closest(".pe-opt, .pe-row, .pe-sw-fg, .pe-sw-bg, label"), lab = box && box.querySelector(".pe-opt-l, .pe-row-l");
		return (box ? box.className.split(" ")[0] : "x") + ":" + (lab ? lab.textContent.trim() : "");
	}
	function findInput() {
		if (!pop) return null; if (pop.inp && pop.inp.isConnected) return pop.inp;
		var all = document.querySelectorAll("#pe input[type=color]"); for (var i = 0; i < all.length; i++) if (keyOf(all[i]) === pop.key) { pop.inp = all[i]; return all[i]; }
		return null;
	}
	function recent() { var r = sget().crecent; return Array.isArray(r) ? r.filter(function (c) { return /^#[0-9a-f]{6}$/.test(c); }) : []; }
	function pushRecent(c) { var r = recent().filter(function (x) { return x !== c; }); r.unshift(c); sset({ crecent: r.slice(0, 12) }); }
	function hexNow() { var c = P.hsvToRgb(pop.h, pop.s, pop.v); return P.rgbToHex(c[0], c[1], c[2]); }
	function send(fire) {
		var inp = findInput(), hex = hexNow(); if (!inp) return;
		if (inp.value !== hex) { inp.value = hex; inp.dispatchEvent(new Event("input", { bubbles: true })); }
		clearTimeout(pop.changeT); var go = function () { var i2 = findInput(); if (i2) { i2.dispatchEvent(new Event("change", { bubbles: true })); pushRecent(hexNow()); drawRecent(); } };
		if (fire) go(); else pop.changeT = setTimeout(go, 350);
	}
	function setHex(hex, fire) { var c = P.hexToRgb(hex), h = P.rgbToHsv(c[0], c[1], c[2]); if (h[1] > 0.001 && h[2] > 0.001) pop.h = h[0]; pop.s = h[1]; pop.v = h[2]; paint(); send(fire); }
	function paint() {
		if (!pop) return; var e = pop.el, sv = e.querySelector(".pe-cp-sv"), hue = e.querySelector(".pe-cp-hue"), hex = hexNow(), rgb = P.hexToRgb(hex);
		var base = P.hsvToRgb(pop.h, 1, 1); sv.style.background = "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, " + P.rgbToHex(base[0], base[1], base[2]) + ")";
		var dot = e.querySelector(".pe-cp-dot"); dot.style.left = (pop.s * 100) + "%"; dot.style.top = ((1 - pop.v) * 100) + "%"; dot.style.background = hex;
		e.querySelector(".pe-cp-hk").style.left = (pop.h / 360 * 100) + "%";
		sv.setAttribute("aria-valuetext", "saturation " + Math.round(pop.s * 100) + "%, brightness " + Math.round(pop.v * 100) + "%"); hue.setAttribute("aria-valuenow", String(Math.round(pop.h)));
		var hx = e.querySelector(".pe-cp-hex"); if (document.activeElement !== hx) hx.value = hex;
		["r", "g", "b"].forEach(function (k, i) { var n = e.querySelector(".pe-cp-" + k); if (document.activeElement !== n) n.value = Math.round(rgb[i]); });
		e.querySelector(".pe-cp-now").style.background = hex;
	}
	function drawRecent() {
		if (!pop) return; var box = pop.el.querySelector(".pe-cp-sw"); box.innerHTML = "";
		var list = recent().concat(BASIC.filter(function (c) { return recent().indexOf(c) < 0; })).slice(0, 18);
		list.forEach(function (c) { var b = el("button", "pe-cp-chip"); b.type = "button"; b.style.background = c; b.title = c; b.setAttribute("aria-label", "Use " + c); b.addEventListener("click", function () { setHex(c, true); }); box.appendChild(b); });
	}
	function dragOn(node, fn) {
		node.addEventListener("pointerdown", function (e) { if (e.button > 0) return; e.preventDefault(); try { node.setPointerCapture(e.pointerId); } catch (x) {} fn(e); var mv = function (ev) { fn(ev); }, up = function () { node.removeEventListener("pointermove", mv); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up); send(true); }; node.addEventListener("pointermove", mv); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up); });
	}
	function place(inp) {
		var r = inp.getBoundingClientRect(), e = pop.el, w = e.offsetWidth, h = e.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
		var x = r.left, y = r.bottom + 6; if (x + w > vw - 8) x = vw - w - 8; if (y + h > vh - 8) y = Math.max(8, r.top - h - 6); e.style.left = Math.max(8, x) + "px"; e.style.top = Math.max(8, y) + "px";
	}
	PE.colorPopClose = function () { if (!pop) return; clearTimeout(pop.changeT); var i = findInput(); if (i) i.dispatchEvent(new Event("change", { bubbles: true })); pop.el.remove(); pop = null; };
	PE.colorPop = function (inp) {
		var pinned = sget().cpin !== false;
		if (pop && pop.inp === inp) { PE.colorPopClose(); return; }
		if (pop) PE.colorPopClose();
		var lab = (inp.closest(".pe-opt, .pe-row") || {}).querySelector ? (inp.closest(".pe-opt, .pe-row").querySelector(".pe-opt-l, .pe-row-l") || {}).textContent : "";
		var name = inp.dataset.cname || (lab ? lab.trim() : "Colour");
		var e = el("div", "pe-cpop"); e.setAttribute("role", "dialog"); e.setAttribute("aria-label", "Colour picker: " + name);
		e.innerHTML = '<div class="pe-cp-h"><b class="pe-cp-t">' + esc(name) + '</b><span class="pe-cp-now" aria-hidden="true"></span><button type="button" class="pe-cp-pin" aria-pressed="' + pinned + '" title="Keep this open while you work (clicks on the picture do not close it)">📌</button><button type="button" class="pe-cp-x" aria-label="Close" title="Close (Esc)">✕</button></div>'
			+ '<div class="pe-cp-sv" role="slider" tabindex="0" aria-label="Saturation and brightness (arrow keys)"><span class="pe-cp-dot"></span></div>'
			+ '<div class="pe-cp-hue" role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><span class="pe-cp-hk"></span></div>'
			+ '<div class="pe-cp-row"><label>Hex <input class="pe-cp-hex" type="text" maxlength="24" spellcheck="false" aria-label="Hex colour (or r, g, b)"></label><button type="button" class="pe-mini pe-cp-drop" title="Pick a colour from the picture" aria-label="Pick a colour from the picture">💉</button></div>'
			+ '<div class="pe-cp-row pe-cp-rgb"><label>R <input class="pe-cp-r" type="number" min="0" max="255"></label><label>G <input class="pe-cp-g" type="number" min="0" max="255"></label><label>B <input class="pe-cp-b" type="number" min="0" max="255"></label></div>'
			+ '<div class="pe-cp-sl">Recent and basic colours</div><div class="pe-cp-sw"></div>';
		(PE.els.root || document.body).appendChild(e);
		pop = { el: e, inp: inp, key: keyOf(inp), h: 0, s: 0, v: 0, pinned: pinned };
		var c = P.hexToRgb(inp.value || "#000000"), hv = P.rgbToHsv(c[0], c[1], c[2]); pop.h = hv[0]; pop.s = hv[1]; pop.v = hv[2];
		var sv = e.querySelector(".pe-cp-sv"), hue = e.querySelector(".pe-cp-hue");
		dragOn(sv, function (ev) { var r = sv.getBoundingClientRect(); pop.s = P.clamp((ev.clientX - r.left) / r.width, 0, 1); pop.v = P.clamp(1 - (ev.clientY - r.top) / r.height, 0, 1); paint(); send(false); });
		dragOn(hue, function (ev) { var r = hue.getBoundingClientRect(); pop.h = P.clamp((ev.clientX - r.left) / r.width, 0, 1) * 359.9; paint(); send(false); });
		sv.addEventListener("keydown", function (ev) { var d = ev.shiftKey ? 0.1 : 0.02; if (ev.key === "ArrowLeft") pop.s -= d; else if (ev.key === "ArrowRight") pop.s += d; else if (ev.key === "ArrowUp") pop.v += d; else if (ev.key === "ArrowDown") pop.v -= d; else return; ev.preventDefault(); pop.s = P.clamp(pop.s, 0, 1); pop.v = P.clamp(pop.v, 0, 1); paint(); send(false); });
		hue.addEventListener("keydown", function (ev) { var d = ev.shiftKey ? 15 : 3; if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") pop.h = (pop.h - d + 360) % 360; else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") pop.h = (pop.h + d) % 360; else return; ev.preventDefault(); paint(); send(false); });
		var hx = e.querySelector(".pe-cp-hex"); hx.addEventListener("input", function () { var v = P.parseColor(hx.value); if (v) setHex(v, false); hx.classList.toggle("is-bad", !v); });
		hx.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { var v = P.parseColor(hx.value); if (v) setHex(v, true); } });
		hx.addEventListener("blur", function () { hx.classList.remove("is-bad"); paint(); });
		["r", "g", "b"].forEach(function (k) { var n = e.querySelector(".pe-cp-" + k); n.addEventListener("input", function () { var v = ["r", "g", "b"].map(function (q) { return P.clamp(+e.querySelector(".pe-cp-" + q).value || 0, 0, 255); }); setHex(P.rgbToHex(v[0], v[1], v[2]), false); }); });
		e.querySelector(".pe-cp-drop").addEventListener("click", function () { if (!PE.doc) { PE.toast("Open an image first"); return; } PE.pickColorFromImage({ label: name.toLowerCase(), apply: function (hex) { if (pop) setHex(hex, true); else { var i = findInput(); if (i) { i.value = hex; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); } } } }); });
		e.querySelector(".pe-cp-x").addEventListener("click", PE.colorPopClose);
		var pin = e.querySelector(".pe-cp-pin"); pin.addEventListener("click", function () { pop.pinned = !pop.pinned; pin.setAttribute("aria-pressed", String(pop.pinned)); sset({ cpin: pop.pinned }); });
		// drag the window by its title bar
		var head = e.querySelector(".pe-cp-h"); head.addEventListener("pointerdown", function (ev) { if (ev.target.closest("button")) return; ev.preventDefault(); var r = e.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top; head.setPointerCapture(ev.pointerId);
			var mv = function (m) { e.style.left = P.clamp(m.clientX - dx, 0, window.innerWidth - 60) + "px"; e.style.top = P.clamp(m.clientY - dy, 0, window.innerHeight - 40) + "px"; }, up = function () { head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", up); }; head.addEventListener("pointermove", mv); head.addEventListener("pointerup", up); });
		drawRecent(); paint(); place(inp); sv.focus({ preventScroll: true });
	};
	/* every colour well in the editor opens our picker (the browser's own closes after one click) */
	document.addEventListener("click", function (e) {
		var t = e.target; if (!t || t.tagName !== "INPUT" || t.type !== "color" || !t.closest("#pe") || t.dataset.native) return;
		e.preventDefault(); PE.colorPop(t);
	}, true);
	document.addEventListener("pointerdown", function (e) {
		if (!pop || e.target.closest(".pe-cpop") || (e.target.tagName === "INPUT" && e.target.type === "color")) return;
		if (!findInput()) { PE.colorPopClose(); return; }   // its colour well went away (a dialog was closed)
		if (!pop.pinned) PE.colorPopClose();
	}, true);
	window.addEventListener("keydown", function (e) { if (pop && e.key === "Enter" && e.target.closest && e.target.closest(".pe-cpop")) { e.stopPropagation(); if (e.target.classList.contains("pe-cp-hex")) { var v = P.parseColor(e.target.value); if (v) setHex(v, true); } return; }   // never the open dialog's OK button
		if (pop && e.key === "Escape" && !(PE.toolId === "eyedropper" && e.target === PE.els.over)) { e.stopPropagation(); e.preventDefault(); PE.colorPopClose(); } }, true);
	window.addEventListener("resize", function () { if (pop && pop.el.getBoundingClientRect().left > window.innerWidth - 40) place(findInput() || pop.el); });

	/* the Layer Style dialog (PE.dlgLayerStyle) moved to layerstyle.js (round 8: the full Photoshop-style set of effects) */

	/* ================= layer masks: the guide ================= */
	var MASKHELP = "<ol class=\"pe-steps\"><li><b>Add a mask.</b> Select a layer and press <b>◑ Mask</b>. Nothing changes yet: a white box appears next to the layer's picture in the Layers list. That box is the mask.</li>"
		+ "<li><b>Paint on the mask.</b> While the mask box is outlined, the Brush paints on the mask, not on the picture: <b>black hides</b> that part of the layer, <b>white brings it back</b>, grey makes it see-through. The Eraser also hides. Press <kbd>X</kbd> to swap black and white.</li>"
		+ "<li><b>Switch back.</b> Click the layer's picture box to paint on the picture again, the mask box to paint on the mask. The status bar says which one you are painting on. Shift-click the mask box to switch the mask off for a moment, Alt-click it to see the mask itself.</li>"
		+ "<li><b>Finish.</b> Nothing is ever deleted, so you can fix mistakes any time. Layer → <b>Apply layer mask</b> makes the hiding permanent; <b>Delete layer mask</b> brings the whole layer back.</li></ol>"
		+ "<p class=\"pe-hint2\">Tip: with a selection made first, the new mask shows only the selected part.</p>";
	PE.maskHelp = function () { var w = el("div", "pe-maskhelp", MASKHELP); PE.modal({ title: "How layer masks work", body: w, buttons: [{ label: "Got it", primary: true, act: function (m) { m.close(); } }] }); };
	var addMask0 = PE.addMask;
	PE.addMask = function (L, fromSel) {
		L = L || PE.active(); if (!L) return; if (PE.isGroup(L)) { PE.toast("Masks go on a layer, not on a group"); return; } if (L.mask) { PE.toast("This layer already has a mask"); return; }
		addMask0(L, fromSel); PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color");
		if (!sget().maskHelpSeen) { sset({ maskHelpSeen: true }); setTimeout(PE.maskHelp, 60); } else PE.toast("Mask added: paint black to hide, white to bring back (X swaps)");
	};
	/* the mask as a black and white picture (Alt-click the mask box) */
	PE.maskView = function (L) {
		var m = L.mask, k = L._mv; if (k && k.rev === L.rev && k.m === m) return k.c; var c = PE.mk(m.width, m.height), x = c.getContext("2d");
		x.drawImage(m, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = "destination-over"; x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height);
		L._mv = { rev: L.rev, m: m, c: c }; return c;
	};

	/* ================= Crop Layer tool ================= */
	var cd = null, HD = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
	function okLayer(quiet) { var L = PE.active(); if (!L || PE.isGroup(L)) { if (!quiet) PE.toast("Select a layer (not a group) to crop"); return null; } if (L.locked) { if (!quiet) PE.toast("This layer is locked"); return null; } return L; }
	function boxOf(L) { return L.crop || { x: 0, y: 0, w: L.canvas.width, h: L.canvas.height }; }
	function toDocPt(L, u, v) { var c = Math.cos(L.rot), s = Math.sin(L.rot), lx = (u - L.canvas.width / 2) * L.sx, ly = (v - L.canvas.height / 2) * L.sy; return { x: L.cx + c * lx - s * ly, y: L.cy + s * lx + c * ly }; }
	function scrPt(L, u, v) { var p = toDocPt(L, u, v); return PE.toScreen(p.x, p.y); }
	PE.clearLayerCrop = function (L) { L = L || PE.active(); if (!L || !L.crop) { PE.toast("This layer is not cropped"); return; } L.crop = null; L.rev++; PE.commit("Show whole layer"); };
	PE.defTool({ id: "layercrop", name: "Crop Layer (hide edges)", key: "y", icon: "⛶", opts: {},
		ui: [{ type: "button", label: "Show whole layer (uncrop)", act: function () { PE.clearLayerCrop(); PE.invalidateOverlay(); } }, { type: "button", label: "✓ Done (Move tool)", act: function () { PE.setTool("move"); } }],
		hint: "Crops one layer without deleting anything: drag the edges or corners of the box to hide parts of the layer, drag inside the box to slide what shows. Show whole layer brings it all back. Then use the Move tool to place the layer. Enter = done.",
		down: function (e) {
			var L = okLayer(); if (!L) return; var b = boxOf(L), sp = PE.toScreen(e.x, e.y), i;
			for (i = 0; i < 8; i++) { var h = HD[i], q = scrPt(L, b.x + (h[0] + 1) / 2 * b.w, b.y + (h[1] + 1) / 2 * b.h); if (Math.hypot(q.x - sp.x, q.y - sp.y) < 11) { cd = { L: L, h: h, b0: Object.assign({}, b), p0: PE.toLayerPt(L, e.x, e.y) }; return; } }
			var p = PE.toLayerPt(L, e.x, e.y); if (p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h) { cd = { L: L, slide: true, b0: Object.assign({}, b), p0: p }; return; }
			PE.toast("Drag the edges of the box (or inside it) on the selected layer");
		},
		move: function (e) {
			if (!cd) return; var L = cd.L, p = PE.toLayerPt(L, e.x, e.y), dx = p.x - cd.p0.x, dy = p.y - cd.p0.y, cw = L.canvas.width, ch = L.canvas.height, b0 = cd.b0, nb;
			if (cd.slide) nb = { x: P.clamp(b0.x + dx, 0, cw - b0.w), y: P.clamp(b0.y + dy, 0, ch - b0.h), w: b0.w, h: b0.h }; else nb = P.dragCrop(b0, cd.h[0], cd.h[1], dx, dy, cw, ch);
			L.crop = P.clampCrop(nb, cw, ch); L._fxc = null; PE.invalidate(); var bb = boxOf(L); PE.emit("cropinfo", { w: Math.round(bb.w * Math.abs(L.sx)), h: Math.round(bb.h * Math.abs(L.sy)) });
		},
		up: function () { if (!cd) return; var L = cd.L, ch = JSON.stringify(L.crop) !== JSON.stringify(cd.b0.w === L.canvas.width && cd.b0.h === L.canvas.height && !cd.b0.x && !cd.b0.y ? null : cd.b0); cd = null; if (ch) { L.rev++; PE.commit("Crop layer"); } },
		enter: function () { PE.setTool("move"); },
		cancel: function () { cd = null; },
		overlay: function (x) {
			var L = okLayer(true); if (!L || !PE.effVisible(L)) return; var b = boxOf(L), full = [[0, 0], [L.canvas.width, 0], [L.canvas.width, L.canvas.height], [0, L.canvas.height]].map(function (q) { return scrPt(L, q[0], q[1]); }), box = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(function (q) { return scrPt(L, q[0], q[1]); });
			var dpr = PE.view.dpr || 1; x.save(); x.setTransform(dpr, 0, 0, dpr, 0, 0);
			// the hidden part of the layer, shown faintly so you can see what you are cropping away
			x.globalAlpha = 0.35; x.save(); x.beginPath(); full.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); box.slice().reverse().forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.clip("evenodd");
			var m = [Math.cos(L.rot) * L.sx, Math.sin(L.rot) * L.sx, -Math.sin(L.rot) * L.sy, Math.cos(L.rot) * L.sy], v = PE.view; x.setTransform(dpr * v.zoom * m[0], dpr * v.zoom * m[1], dpr * v.zoom * m[2], dpr * v.zoom * m[3], dpr * (L.cx * v.zoom + v.px), dpr * (L.cy * v.zoom + v.py));
			x.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2); x.restore(); x.globalAlpha = 1;
			x.setLineDash([5, 4]); x.strokeStyle = "#9b9bab"; x.lineWidth = 1; x.beginPath(); full.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke(); x.setLineDash([]);
			x.strokeStyle = "#fff"; x.lineWidth = 3; x.beginPath(); box.forEach(function (p, i) { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.closePath(); x.stroke(); x.strokeStyle = "#7c3aed"; x.lineWidth = 1.5; x.stroke();
			HD.forEach(function (h) { var q = scrPt(L, b.x + (h[0] + 1) / 2 * b.w, b.y + (h[1] + 1) / 2 * b.h); x.fillStyle = "#fff"; x.strokeStyle = "#7c3aed"; x.lineWidth = 2; x.beginPath(); x.rect(q.x - 5, q.y - 5, 10, 10); x.fill(); x.stroke(); });
			x.restore();
		} });
	// a Crop layer button in the Move tool's options and the layer's right-click menu (app.js)
	if (PE.tools.move && PE.tools.move.ui) PE.tools.move.ui.push({ type: "button", label: "⛶ Crop layer", act: function () { if (okLayer()) PE.setTool("layercrop"); } });
})();
