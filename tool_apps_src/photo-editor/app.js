/* MES Photo Editor -- mes.fm/photo-editor. UI: menus, tool + options bars, colour / layers / history panels, files (open, drop, paste, PSD, project),
 * shortcuts, autosave. Engine = core.js (layers, history, selection), tools.js / tools2.js, dialogs.js; pixel maths = lib.js (MESPixel, node-tested). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pe"); if (!root) return;
	var PE = window.PE, P = window.MESPixel, I = window.MESImg, el = PE.el, esc = PE.esc;
	var KEY = "mes-photo-editor:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	PE.els = { root: root, main: $("pe-main"), over: $("pe-over"), textedit: $("pe-textedit"), stage: $("pe-stage") };
	PE.toast = function (t) { var e = document.querySelector(".tu-toast"); if (!e) { e = document.createElement("div"); e.className = "tu-toast"; document.body.appendChild(e); } e.textContent = t; e.classList.add("tu-toast--show"); clearTimeout(PE.toast.t); PE.toast.t = setTimeout(function () { e.classList.remove("tu-toast--show"); }, 2600); };
	var S = sget();

	/* ---------- colours ---------- */
	PE.fg = S.fg || "#e53935"; PE.bg = S.bg || "#ffffff"; var recent = S.recent || [];
	PE.setFg = function (c) { PE.fg = c; pushRecent(c); PE.emit("color"); sset({ fg: c }); };
	PE.setBg = function (c) { PE.bg = c; PE.emit("color"); sset({ bg: c }); };
	function pushRecent(c) { recent = [c].concat(recent.filter(function (x) { return x !== c; })).slice(0, 12); sset({ recent: recent }); }
	var PALETTE = ["#e53935", "#fb8c00", "#ffeb3b", "#43a047", "#1e88e5", "#8e24aa", "#ffffff", "#9e9e9e", "#000000"];

	/* ---------- stage size ---------- */
	function resize() { var r = PE.els.stage.getBoundingClientRect(), v = PE.view; v.w = Math.max(10, Math.floor(r.width)); v.h = Math.max(10, Math.floor(r.height)); v.dpr = Math.min(3, window.devicePixelRatio || 1); [PE.els.main, PE.els.over].forEach(function (c) { c.style.width = v.w + "px"; c.style.height = v.h + "px"; }); if (PE.doc && PE.autoFit) PE.fit(); else PE.invalidate(); }
	new ResizeObserver(resize).observe(PE.els.stage);
	var _fit = PE.fit; PE.fit = function (p) { PE.autoFit = true; _fit(p); }; var _sz = PE.setZoom; PE.setZoom = function (z, x, y) { PE.autoFit = false; _sz(z, x, y); }; var _pb = PE.panBy; PE.panBy = function (dx, dy) { PE.autoFit = false; _pb(dx, dy); };

	/* ---------- tool bar ---------- */
	var ORDER = ["move", "marquee", "lasso", "wand", "crop", "brush", "eraser", "clone", "retouch", "objerase", "bucket", "gradient", "eyedropper", "text", "equation", "shape", "hand", "zoom"];
	var HELP = {
		move: "Move, resize and rotate the active layer (or a whole group). Drag a layer to move it. Drag a square handle to resize; hold Shift while dragging a corner for free proportions. Drag just outside a corner to rotate. Arrow keys nudge by 1 px (Shift = 10 px). The option bar has Remove background (AI).",
		marquee: "Draw a rectangle or ellipse selection. Anything you then do (fill, delete, adjust, copy) only touches the selection. Shift while dragging = square or circle, Shift-drag on an existing selection = add to it, Alt = subtract. Drag inside a selection to move it, click once to deselect. Feather softens the edge.",
		lasso: "Select any shape. Freehand: drag around the area. Polygon: click each corner, then double-click or press Enter to close. Use the Mode buttons to add to, subtract from or intersect an existing selection.",
		wand: "Click a colour to select every touching pixel of a similar colour. Raise Tolerance to include more shades. Click the background, press Delete, then export as PNG for a transparent background.",
		crop: "Cut the picture down to part of it. Drag the box or its handles, pick a ratio in the option bar if you want one, then press Enter or Apply. Everything outside the box is removed.",
		brush: "Paint with the foreground colour. [ and ] change the size, Shift-click draws a straight line from the last point. Opacity, hardness and size are in the option bar. On a layer mask the brush reveals the layer.",
		eraser: "Erase pixels on the active layer (they become transparent). Same size and hardness controls as the brush. On a layer mask the eraser hides parts of the layer without destroying them.",
		clone: "Copy one part of the picture over another. Alt-click to choose the source spot, then paint where the copy should go. Good for removing blemishes, dust and small objects.",
		retouch: "Paint to blur, sharpen, lighten, darken or change the saturation only where you drag. Choose the effect and its strength in the option bar.",
		objerase: "AI object remover. Paint over the thing you want gone (Alt un-paints), then press Enter or the Erase button. The AI fills the area from its surroundings. Works best on small objects against plain or repeating backgrounds. The model downloads once on first use.",
		bucket: "Click an area to fill it with the foreground colour. Tolerance decides how similar a colour must be to be filled. With a selection active, only the selection is filled.",
		gradient: "Drag from where the gradient should start to where it should end. It blends the foreground and background colours and respects any selection.",
		eyedropper: "Click anywhere on the picture to pick that colour as the foreground colour. Alt-click picks the background colour instead.",
		text: "Click to add text. Click existing text to edit it. Turn on Background for a label or callout look. Esc finishes. Each text is its own layer, so you can move, scale and rotate it later.",
		equation: "Insert a maths equation. Click where it goes, type LaTeX (a live preview appears), then Insert. Click an existing equation to edit it. Equations stay sharp when enlarged.",
		shape: "Draw rectangles, rounded boxes, ellipses, lines, arrows, callouts, numbered step badges, highlights and blur / hide areas. Shift = square or straight line. Outline uses the foreground colour, fill uses the background colour. Each shape lands on its own layer.",
		hand: "Drag to pan around a zoomed-in picture. You can also hold Space with any tool, or use the middle mouse button.",
		zoom: "Click to zoom in, Alt-click to zoom out. Ctrl + mouse wheel also zooms, and Ctrl+0 fits the picture to the window."
	};
	var UI = S.ui || { tw: false, sw: 17.5, side: "r", hide: false }; if (!UI.tws) UI.tws = 15.5; if (!UI.tside) UI.tside = "l";
	function saveUI() { sset({ ui: UI }); }
	function closeHelp() { var h = root.querySelector(".pe-help"); if (h) h.remove(); }
	function showHelp(id, anchor) {
		closeHelp(); var t = PE.tools[id]; if (!t) return; var h = el("div", "pe-help"), r = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect();
		h.setAttribute("role", "dialog"); h.innerHTML = '<div class="pe-help-t">' + esc(t.icon) + " " + esc(t.name) + (t.key ? ' <kbd>' + esc(t.key.toUpperCase()) + "</kbd>" : "") + '</div><p>' + esc(HELP[id] || t.hint || "") + '</p><button type="button" class="pe-btn pe-btn--sm">Got it</button>';
		h.querySelector("button").addEventListener("click", closeHelp); root.appendChild(h);
		var top = Math.max(4, Math.min(r.top - rr.top - 8, rr.height - h.offsetHeight - 8)); h.style.top = top + "px"; h.style.left = (UI.side === "l" && !UI.hide ? 4 : (r.right - rr.left + 8)) + "px";
		if (UI.side === "l" && !UI.hide) h.style.left = (r.right - rr.left + 8) + "px";
	}
	document.addEventListener("mousedown", function (e) { if (!e.target.closest || (!e.target.closest(".pe-help") && !e.target.closest(".pe-thelp"))) closeHelp(); });
	document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeHelp(); });
	function applyUI() {
		var main = root.querySelector(".pe-main"), tools = $("pe-tools"), side = $("pe-side");
		tools.classList.toggle("pe-tools--wide", !!UI.tw); main.classList.toggle("pe-main--sl", UI.side === "l"); main.classList.toggle("pe-main--tr", UI.tside === "r"); main.classList.toggle("pe-main--shide", !!UI.hide);
		side.style.width = UI.sw + "em"; tools.style.width = UI.tw ? UI.tws + "em" : ""; var tg = $("pe-ttoggle"); if (tg) { tg.textContent = UI.tw ? "« Collapse" : "»"; tg.title = UI.tw ? "Show only the icons" : "Show the tool names and help"; tg.setAttribute("aria-pressed", UI.tw ? "true" : "false"); }
		var ts = $("pe-tswap"); if (ts) ts.title = UI.tside === "r" ? "Move the toolbox to the left" : "Move the toolbox to the right";
		var sw = $("pe-sswap"); if (sw) sw.title = UI.side === "l" ? "Move the panels to the right" : "Move the panels to the left";
		var sh = $("pe-sshow"); if (sh) { sh.hidden = !UI.hide; sh.textContent = UI.side === "l" ? "Panels ›" : "‹ Panels"; }
		setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 0);
	}
	function initLayoutUI() {
		var tg = el("button", "pe-ttoggle", "»"); tg.type = "button"; tg.id = "pe-ttoggle"; tg.addEventListener("click", function () { UI.tw = !UI.tw; saveUI(); applyUI(); }); var th = el("div", "pe-thead"), tsw = el("button", "pe-tswap", "⇄"); tsw.type = "button"; tsw.id = "pe-tswap"; tsw.addEventListener("click", function () { UI.tside = UI.tside === "r" ? "l" : "r"; saveUI(); applyUI(); }); th.appendChild(tg); th.appendChild(tsw); $("pe-tools").insertBefore(th, $("pe-tools").firstChild);
		var bar = el("div", "pe-sbar"); bar.innerHTML = '<span>Panels</span><button type="button" id="pe-sswap" class="pe-mini">⇄</button><button type="button" id="pe-shide" class="pe-mini" title="Hide the panels (more room for the picture)">Hide ✕</button>'; $("pe-side").insertBefore(bar, $("pe-side").firstChild);
		var grip = el("div", "pe-sres"); grip.title = "Drag to make the panels wider or narrower (double-click to reset)"; $("pe-side").appendChild(grip);
		var show = el("button", "pe-sshow", "‹ Panels"); show.type = "button"; show.id = "pe-sshow"; show.hidden = true; $("pe-stage").appendChild(show);
		$("pe-sswap").addEventListener("click", function () { UI.side = UI.side === "l" ? "r" : "l"; saveUI(); applyUI(); });
		$("pe-shide").addEventListener("click", function () { UI.hide = true; saveUI(); applyUI(); }); show.addEventListener("click", function () { UI.hide = false; saveUI(); applyUI(); });
		grip.addEventListener("dblclick", function () { UI.sw = 17.5; saveUI(); applyUI(); });
		grip.addEventListener("pointerdown", function (e) { e.preventDefault(); grip.setPointerCapture(e.pointerId); var x0 = e.clientX, w0 = $("pe-side").getBoundingClientRect().width, fs = parseFloat(getComputedStyle($("pe-side")).fontSize) || 16, dir = UI.side === "l" ? 1 : -1;
			function mv(ev) { UI.sw = Math.max(12, Math.min(40, (w0 + (ev.clientX - x0) * dir) / fs)); $("pe-side").style.width = UI.sw + "em"; }
			function up() { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); saveUI(); window.dispatchEvent(new Event("resize")); } grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); });
		var tg2 = el("div", "pe-tres"); tg2.title = "Drag to make the toolbox wider or narrower (double-click to reset)"; $("pe-tools").parentNode.insertBefore(tg2, $("pe-tools").nextSibling);
		tg2.addEventListener("dblclick", function () { UI.tws = 15.5; UI.tw = true; saveUI(); applyUI(); });
		tg2.addEventListener("pointerdown", function (e) { e.preventDefault(); tg2.setPointerCapture(e.pointerId); var x0 = e.clientX, w0 = $("pe-tools").getBoundingClientRect().width, fs = parseFloat(getComputedStyle($("pe-tools")).fontSize) || 16, dir = UI.tside === "r" ? -1 : 1;
			function mv(ev) { var w = (w0 + (ev.clientX - x0) * dir) / fs; if (w < 7) { UI.tw = false; } else { UI.tw = true; UI.tws = Math.max(9, Math.min(30, w)); } applyUI(); }
			function up() { tg2.removeEventListener("pointermove", mv); tg2.removeEventListener("pointerup", up); saveUI(); window.dispatchEvent(new Event("resize")); } tg2.addEventListener("pointermove", mv); tg2.addEventListener("pointerup", up); });
		applyUI();
	}
	function buildTools() {
		var box = $("pe-tools"); box.innerHTML = "";
		ORDER.forEach(function (id) { var t = PE.tools[id]; if (!t) return; var row = el("div", "pe-trow"), b = el("button", "pe-tool"); b.type = "button"; b.dataset.t = id; b.title = t.name + " (" + t.key.toUpperCase() + ")"; b.setAttribute("aria-label", t.name); b.innerHTML = '<span class="pe-ticon">' + esc(t.icon) + '</span><span class="pe-tname">' + esc(t.name.replace(/ \(.*\)$/, "")) + '</span><kbd class="pe-tkey">' + esc(t.key.toUpperCase()) + "</kbd>"; b.addEventListener("click", function () { PE.setTool(id); });
			var q = el("button", "pe-thelp", "?"); q.type = "button"; q.title = "What is this tool and how do I use it?"; q.setAttribute("aria-label", "Help: " + t.name); q.addEventListener("click", function () { showHelp(id, row); }); row.appendChild(b); row.appendChild(q); box.appendChild(row); });
		initLayoutUI();
	}
	PE.on("tool", function () { Array.prototype.forEach.call($("pe-tools").querySelectorAll(".pe-tool"), function (b) { b.setAttribute("aria-pressed", b.dataset.t === PE.toolId ? "true" : "false"); }); var t = PE.tool(); if (t.activate) t.activate(); buildOpts(); $("pe-hint").textContent = t.hint || ""; setCursor(); });
	function setCursor() { PE.els.over.style.cursor = PE.tool().cursorSize ? "none" : PE.toolId === "hand" ? "grab" : PE.toolId === "zoom" ? "zoom-in" : PE.toolId === "text" ? "text" : PE.toolId === "move" ? "default" : "crosshair"; }

	/* ---------- options bar ---------- */
	function buildOpts() {
		var box = $("pe-opts"), t = PE.tool(), id = t.id, kind = PE.opt[id] && PE.opt[id].kind; box.innerHTML = ""; var name = el("span", "pe-opt-name", esc(t.name)); box.appendChild(name);
		(t.ui || []).forEach(function (u) {
			if (u.showFor && u.showFor.indexOf(kind) < 0) return; if (u.hideFor && u.hideFor.indexOf(kind) >= 0) return; if (u.show && !PE.optGet(id, u.show)) return;
			if (u.type === "button") { var b = el("button", "pe-btn pe-btn--sm", esc(u.label)); b.type = "button"; b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", u.act); box.appendChild(b); return; }
			var w = el("label", "pe-opt"), v = PE.optGet(id, u.k), inp; w.appendChild(el("span", "pe-opt-l", esc(u.label)));
			if (u.type === "check") { inp = el("input"); inp.type = "checkbox"; inp.checked = !!v; inp.addEventListener("change", function () { PE.optSet(id, u.k, inp.checked); buildOpts(); }); }
			else if (u.type === "select") { inp = el("select"); var opts = u.options === "fonts" ? PE.FONTS : u.options; opts.forEach(function (o) { var op = el("option", null, esc(o[1])); op.value = o[0]; inp.appendChild(op); }); inp.value = v; inp.addEventListener("change", function () { PE.optSet(id, u.k, u.num ? +inp.value : inp.value); buildOpts(); }); }
			else if (u.type === "seg") { inp = el("span", "pe-seg"); u.options.forEach(function (o) { var b = el("button", null, esc(o[1])); b.type = "button"; b.setAttribute("aria-pressed", String(v) === String(o[0]) ? "true" : "false"); b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", function () { PE.optSet(id, u.k, o[0]); buildOpts(); }); inp.appendChild(b); }); }
			else if (u.type === "color") { inp = el("input"); inp.type = "color"; inp.value = v; inp.addEventListener("input", function () { PE.optSet(id, u.k, inp.value); }); }
			else if (u.type === "number") { inp = el("input", "pe-num"); inp.type = "number"; inp.value = v; inp.addEventListener("input", function () { PE.optSet(id, u.k, +inp.value); }); }
			else {
				inp = el("input"); inp.type = "range"; inp.min = u.min; inp.max = u.max; inp.step = u.step; inp.value = v;
				var num = el("input", "pe-num pe-num--opt"); num.type = "number"; num.min = u.min; num.max = u.max; num.step = u.step; num.value = (+v).toFixed(u.step < 1 ? 2 : 0); num.title = "Type an exact value" + (u.unit ? " (" + u.unit + ")" : "");
				inp.addEventListener("input", function () { PE.optSet(id, u.k, +inp.value); num.value = (+inp.value).toFixed(u.step < 1 ? 2 : 0); });
				num.addEventListener("input", function () { if (num.value === "" || isNaN(+num.value)) return; var nv = +num.value; PE.optSet(id, u.k, nv); inp.value = Math.max(u.min, Math.min(u.max, nv)); });
				num.addEventListener("keydown", function (e) { e.stopPropagation(); });
				w.appendChild(inp); w.appendChild(num); if (u.unit) w.appendChild(el("span", "pe-opt-v", esc(u.unit))); var hq = optHelp(u); if (hq) w.appendChild(hq); box.appendChild(w); return;
			}
			w.appendChild(inp); var hq2 = optHelp(u); if (hq2) w.appendChild(hq2); box.appendChild(w);
		});
		if (id === "text" || id === "shape") { }
	}
	var OPTHELP = { "Size": "How big the brush or item is, in pixels of the image.", "Hardness": "How sharp the edge of the brush is. 100% is a crisp hard circle; lower values fade softly towards the edge, like an airbrush.", "Opacity": "How see-through the paint is. 100% covers fully; 30% lets what is underneath show through. Overlapping strokes in one drag do not stack.", "Smoothing": "Steadies a shaky hand: the brush lags a little behind the pointer and draws smoother curves. 0% = follows the pointer exactly.", "Pen pressure": "With a drawing tablet or pen, pressing harder makes the stroke bigger. Has no effect with a mouse.", "Tolerance": "How different a colour can be and still count as the same area. Low = only almost identical colours; high = spreads into similar colours.", "Strength": "How strong the effect is each time you paint over it.", "Aligned": "On: the copy source moves along with your brush. Off: every stroke starts again from the same source point.", "Contiguous": "On: only connected areas are filled. Off: every matching colour in the whole layer.", "Sample all layers": "Look at the merged picture instead of only the selected layer when deciding what is the same colour.", "Line height": "Space between lines of text. 1.2 is normal; bigger spreads the lines out.", "Box width (0 = auto)": "How wide the text box is before words wrap onto the next line. 0 = as wide as the text needs (up to the image width). You can also drag the purple handle on the right edge of the text box.", "Background box": "Draws a coloured rectangle behind the text, like a label or caption.", "Outline": "Draws a border around the letters (or the shape).", "Shadow": "Adds a soft shadow behind the text so it stands out from busy pictures.", "Padding": "Space between the text and the edge of its background box.", "Corners": "How round the corners of the box are.", "Blur": "How soft the edge is.", "Bold": "Makes the letters thicker.", "Italic": "Slants the letters." };
	function optHelp(u) { var t = u.help || OPTHELP[u.label]; return t ? PE.helpBtn(u.label, esc(t)) : null; }
	function fmtV(v, u) { return (u.step < 1 ? (+v).toFixed(2) : Math.round(v)) + (u.unit || ""); }
	var optsTimer = 0; PE.on("opts", function (id) { if (id === PE.toolId) { clearTimeout(optsTimer); optsTimer = setTimeout(function () { if (!document.activeElement || document.activeElement.type !== "range") buildOpts(); }, 10); } sset({ opt: PE.opt }); });
	PE.on("active", function () { if (PE.toolId === "text") buildOpts(); });
	PE.on("fonts", buildOpts);

	/* ---------- colour panel ---------- */
	function buildColor() {
		var box = $("pe-colors"); box.innerHTML = "";
		var sw = el("div", "pe-sw"), bgb = el("label", "pe-sw-bg"), fgb = el("label", "pe-sw-fg"); bgb.style.background = PE.bg; fgb.style.background = PE.fg; bgb.title = "Background colour"; fgb.title = "Foreground colour (brush, shapes, text outline)";
		var fi = el("input"); fi.type = "color"; fi.value = PE.fg; fi.addEventListener("input", function () { PE.fg = fi.value; fgb.style.background = fi.value; hexIn.value = fi.value; PE.emit("color-live"); }); fi.addEventListener("change", function () { PE.setFg(fi.value); });
		var bi = el("input"); bi.type = "color"; bi.value = PE.bg; bi.addEventListener("input", function () { PE.bg = bi.value; bgb.style.background = bi.value; }); bi.addEventListener("change", function () { PE.setBg(bi.value); });
		fgb.appendChild(fi); bgb.appendChild(bi); sw.appendChild(bgb); sw.appendChild(fgb);
		var swap = el("button", "pe-mini", "⇄"); swap.type = "button"; swap.title = "Swap colours (X)"; swap.addEventListener("click", swapColors); var def = el("button", "pe-mini", "◐"); def.type = "button"; def.title = "Default colours: black and white (D)"; def.addEventListener("click", function () { PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color"); });
		var hexIn = el("input", "pe-hex"); hexIn.value = PE.fg; hexIn.maxLength = 7; hexIn.title = "Foreground colour hex"; hexIn.addEventListener("change", function () { var h = hexIn.value.trim(); if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) { if (h[0] !== "#") h = "#" + h; if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; PE.setFg(h.toLowerCase()); } else hexIn.value = PE.fg; });
		var top = el("div", "pe-col-top"); top.appendChild(sw); var bt = el("div", "pe-col-b"); bt.appendChild(swap); bt.appendChild(def); bt.appendChild(hexIn); top.appendChild(bt); box.appendChild(top);
		var pal = el("div", "pe-pal"); PALETTE.concat(recent.filter(function (c) { return PALETTE.indexOf(c) < 0; }).slice(0, 6)).forEach(function (c) { var b = el("button", "pe-chip"); b.type = "button"; b.style.background = c; b.title = c + " (click: foreground, Shift-click: background)"; b.addEventListener("click", function (e) { e.shiftKey ? PE.setBg(c) : PE.setFg(c); }); pal.appendChild(b); }); box.appendChild(pal);
	}
	function swapColors() { var t = PE.fg; PE.fg = PE.bg; PE.bg = t; sset({ fg: PE.fg, bg: PE.bg }); PE.emit("color"); }
	PE.on("color", buildColor);

	/* ---------- layers panel ---------- */
	var thumbs = {};
	function thumbFor(L) {
		var k = L.id, t = thumbs[k]; if (t && t.rev === L.rev && t.w === L.canvas.width) return t.c;
		var c = PE.mk(36, 36), x = c.getContext("2d"); x.fillStyle = "#555"; x.fillRect(0, 0, 36, 36); x.fillStyle = "#777"; for (var i = 0; i < 36; i += 6) for (var j = 0; j < 36; j += 6) if (((i + j) / 6) % 2 === 0) x.fillRect(i, j, 6, 6);
		var s = Math.min(36 / L.canvas.width, 36 / L.canvas.height); x.drawImage(L.canvas, (36 - L.canvas.width * s) / 2, (36 - L.canvas.height * s) / 2, L.canvas.width * s, L.canvas.height * s); thumbs[k] = { c: c, rev: L.rev, w: L.canvas.width }; return c;
	}
	var dragId = null, multi = {}, lfilter = "";
	PE.multi = function () { return PE.doc ? PE.doc.layers.filter(function (L) { return multi[L.id]; }) : []; };
	function rowsTopDown() {
		var d = PE.doc, q = lfilter.trim().toLowerCase(), out = [];
		d.layers.slice().reverse().forEach(function (L) {
			var anc = PE.ancestorsOf(L); if (!q && anc.some(function (a) { return a.collapsed; })) return;
			if (q) { var hit = L.name.toLowerCase().indexOf(q) >= 0 || (PE.isGroup(L) && PE.descendants(L).some(function (k) { return k.name.toLowerCase().indexOf(q) >= 0; })); if (!hit) return; }
			out.push({ L: L, depth: anc.length });
		});
		return out;
	}
	function buildLayers() {
		var list = $("pe-layers"), d = PE.doc; list.innerHTML = ""; if (!d) return; var act = PE.active(), rows = rowsTopDown(); PE.relink();
		rows.forEach(function (r) {
			var L = r.L, grp = PE.isGroup(L), on = L === act || multi[L.id], hidden = !PE.effVisible(L) && !grp ? true : !L.visible;
			var row = el("div", "pe-layer" + (on ? " is-active" : "") + (hidden ? " is-hidden" : "") + (grp ? " is-group" : "")); row.draggable = true; row.dataset.id = L.id; row.style.paddingLeft = (0.3 + r.depth * 1.1) + "em";
			var eye = el("button", "pe-eye", L.visible ? "👁" : "—"); eye.type = "button"; eye.title = "Show / hide"; eye.addEventListener("click", function (e) { e.stopPropagation(); L.visible = !L.visible; PE.touch(L); PE.commit("Toggle visibility"); });
			row.appendChild(eye);
			if (grp) { var ar = el("button", "pe-arrow", L.collapsed ? "▸" : "▾"); ar.type = "button"; ar.title = L.collapsed ? "Expand group" : "Collapse group"; ar.addEventListener("click", function (e) { e.stopPropagation(); L.collapsed = !L.collapsed; buildLayers(); }); row.appendChild(ar); var th0 = el("span", "pe-th pe-th--grp", "📁"); row.appendChild(th0); }
			else { var th = el("span", "pe-th"); th.appendChild(thumbFor(L)); row.appendChild(th); }
			var nm = el("span", "pe-lname", esc(L.name) + (L.type === "text" ? " ᵀ" : "") + (grp ? ' <small class="pe-cnt">' + PE.descendants(L).filter(function (k) { return !PE.isGroup(k); }).length + "</small>" : "")); nm.title = "Double-click to rename";
			if (L.mask) { var mt = el("span", "pe-th pe-th--mask" + (L.editMask ? " is-on" : "")); var mc = PE.mk(36, 36), mx = mc.getContext("2d"); mx.fillStyle = "#000"; mx.fillRect(0, 0, 36, 36); var wm = PE.mk(36, 36), wx = wm.getContext("2d"); wx.drawImage(L.mask, 0, 0, 36, 36); wx.globalCompositeOperation = "source-in"; wx.fillStyle = "#fff"; wx.fillRect(0, 0, 36, 36); mx.drawImage(wm, 0, 0); mt.appendChild(mc); mt.title = "Layer mask: click to paint on the mask (white-ish = shown). Click the picture to paint on the layer."; mt.addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(L.id); L.editMask = true; buildLayers(); }); row.querySelector(".pe-th").addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(L.id); L.editMask = false; buildLayers(); }); row.appendChild(mt); }
			row.appendChild(nm); if (L.locked) row.appendChild(el("span", "pe-lock", "🔒"));
			row.addEventListener("click", function (e) {
				if (e.ctrlKey || e.metaKey) { multi[L.id] = !multi[L.id]; if (!Object.keys(multi).some(function (k) { return multi[k]; })) multi = {}; else multi[act ? act.id : L.id] = true; buildLayers(); return; }
				if (e.shiftKey && act) { var order = rowsTopDown().map(function (x) { return x.L; }), i0 = order.indexOf(act), i1 = order.indexOf(L); if (i0 >= 0 && i1 >= 0) { multi = {}; order.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).forEach(function (x) { multi[x.id] = true; }); buildLayers(); return; } }
				multi = {}; PE.setActive(L.id);
			});
			nm.addEventListener("dblclick", function (e) { e.stopPropagation(); var inp = el("input", "pe-rename"); inp.value = L.name; nm.replaceWith(inp); inp.focus(); inp.select(); var done = function (ok) { if (ok && inp.value.trim()) { L.name = inp.value.trim(); PE.commit("Rename layer"); } else buildLayers(); }; inp.addEventListener("keydown", function (ev) { ev.stopPropagation(); if (ev.key === "Enter") done(true); if (ev.key === "Escape") done(false); }); inp.addEventListener("blur", function () { done(true); }); });
			row.addEventListener("dragstart", function (e) { dragId = L.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pe-layer", String(L.id)); });
			function zoneOf(e) { var rc = row.getBoundingClientRect(), y = (e.clientY - rc.top) / rc.height; return grp ? (y < 0.25 ? "above" : "into") : (y < 0.5 ? "above" : "below"); }
			row.addEventListener("dragover", function (e) { if (dragId == null) return; e.preventDefault(); row.classList.remove("is-over-above", "is-over-below", "is-over-into"); row.classList.add("is-over-" + zoneOf(e)); });
			row.addEventListener("dragleave", function () { row.classList.remove("is-over-above", "is-over-below", "is-over-into"); });
			row.addEventListener("drop", function (e) { if (dragId == null) return; e.preventDefault(); e.stopPropagation(); var src = PE.layerById(dragId), z = zoneOf(e); dragId = null; if (src && src !== L) PE.relocate(src, L, z); });
			list.appendChild(row);
		});
		syncLayerProps();
	}
	$("pe-layers").addEventListener("dragover", function (e) { if (dragId != null) e.preventDefault(); });
	$("pe-layers").addEventListener("drop", function (e) { if (dragId == null || !PE.doc) return; e.preventDefault(); var src = PE.layerById(dragId); dragId = null; var tops = PE.doc.layers.filter(function (x) { return x.group == null; }); var top = tops[tops.length - 1]; if (src && top && top !== src) PE.relocate(src, top, "above"); });
	$("pe-lfilter").addEventListener("input", function () { lfilter = this.value; buildLayers(); });
	PE.on("layers", function () { if (!PE.doc) return; var ids = {}; PE.doc.layers.forEach(function (L) { ids[L.id] = 1; }); for (var k in multi) if (!ids[k]) delete multi[k]; });
	function groupSelected() { var m = PE.multi(), act = PE.active(); var list = m.length > 1 ? m : (act ? [act] : []); if (!list.length) { PE.toast("Select layers first (Ctrl-click to select several)"); return; } if (list.length === 1 && PE.isGroup(list[0])) { PE.ungroup(list[0]); return; } multi = {}; PE.groupLayers(list); }
	PE.groupSelected = groupSelected;
	function syncLayerProps() {
		var L = PE.active(); var bl = $("pe-blend"), op = $("pe-opacity"), ov = $("pe-opacity-v"); if (!L) return; bl.value = L.blend; bl.disabled = PE.isGroup(L); op.value = Math.round(L.opacity * 100); ov.textContent = Math.round(L.opacity * 100) + "%";
		$("pe-lock").setAttribute("aria-pressed", L.locked ? "true" : "false"); $("pe-mask-btn").title = L.mask ? "Delete layer mask" : "Add layer mask (reveal all; with a selection: reveal the selection)"; $("pe-mask-btn").setAttribute("aria-pressed", L.mask ? "true" : "false");
	}
	PE.on("layers", buildLayers); PE.on("active", buildLayers);
	function buildHistory() {
		var list = $("pe-history"); list.innerHTML = ""; var H = PE.hist;
		H.stack.forEach(function (e, i) { var r = el("button", "pe-hrow" + (i === H.idx ? " is-active" : "") + (i > H.idx ? " is-future" : ""), esc(e.label)); r.type = "button"; r.addEventListener("click", function () { PE.gotoHistory(i); }); list.appendChild(r); });
		var a = list.querySelector(".is-active"); if (a) a.scrollIntoView({ block: "nearest" });
		$("pe-undo").disabled = H.idx <= 0; $("pe-redo").disabled = H.idx >= H.stack.length - 1;
	}
	PE.on("history", buildHistory);
	function askName(title, val, ok) { var w = el("div"), f = PE.form([{ k: "n", label: "Name", type: "text", val: val }], null); w.appendChild(f.el); PE.modal({ title: title, body: w, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "OK", primary: true, act: function (m) { var v = f.get().n.trim(); m.close(); if (v) ok(v); } }] }); }
	function buildComps() {
		var box = $("pe-comps"); box.innerHTML = ""; if (!PE.doc) return; var comps = PE.doc.comps || [];
		if (!comps.length) { box.appendChild(el("p", "pe-hint2", "A comp remembers which layers and groups are shown, and where they are. Set up one thumbnail, press + Save current view, change what is visible, save another... then Export all makes a picture of each.")); return; }
		comps.forEach(function (c, i) {
			var on = PE.compMatches(c), row = el("div", "pe-comp" + (on ? " is-active" : "")), nm = el("button", "pe-compname", esc(c.name)); nm.type = "button"; nm.title = on ? "This is what is showing now" : "Click to show this comp"; nm.addEventListener("click", function () { PE.compApply(c); });
			row.appendChild(nm);
			[["⟳", "Update this comp with what is showing now", function () { PE.compUpdate(c); }], ["✎", "Rename", function () { askName("Rename comp", c.name, function (v) { PE.compRename(c, v); }); }], ["▲", "Move up", function () { PE.compMove(c, -1); }], ["▼", "Move down", function () { PE.compMove(c, 1); }], ["🗑", "Delete comp", function () { PE.compDelete(c); }]].forEach(function (b) { var bt = el("button", "pe-mini pe-mini--s", b[0]); bt.type = "button"; bt.title = b[1]; bt.addEventListener("click", b[2]); row.appendChild(bt); });
			box.appendChild(row);
		});
	}
	PE.on("comps", buildComps); PE.on("history", buildComps);
	function showTab(t) { $("pe-history").hidden = t !== "hist"; $("pe-compspane").hidden = t !== "comps"; $("pe-tab-hist").setAttribute("aria-pressed", t === "hist" ? "true" : "false"); $("pe-tab-comps").setAttribute("aria-pressed", t === "comps" ? "true" : "false"); sset({ tab: t }); }
	$("pe-tab-hist").addEventListener("click", function () { showTab("hist"); }); $("pe-tab-comps").addEventListener("click", function () { showTab("comps"); });
	$("pe-comp-new").addEventListener("click", function () { if (!PE.doc) return; askName("Save comp", "Comp " + ((PE.doc.comps || []).length + 1), function (v) { PE.compSave(v); }); });
	$("pe-comp-exp").addEventListener("click", function () { PE.dlgExportComps(); });
	function stepComp(dir) { var d = PE.doc; if (!d || !(d.comps || []).length) return; var i = -1; d.comps.forEach(function (c, k) { if (PE.compMatches(c)) i = k; }); var j = i < 0 ? (dir > 0 ? 0 : d.comps.length - 1) : (i + dir + d.comps.length) % d.comps.length; PE.compApply(d.comps[j]); PE.toast(d.comps[j].name); }
	$("pe-blend").innerHTML = PE.BLENDS.map(function (b) { return '<option value="' + b[0] + '">' + b[1] + "</option>"; }).join("");
	$("pe-blend").addEventListener("change", function () { var L = PE.active(); if (L) { L.blend = this.value; PE.touch(L); PE.commit("Blend mode"); } });
	var opTimer = 0; $("pe-opacity").addEventListener("input", function () { var L = PE.active(); if (!L) return; L.opacity = this.value / 100; $("pe-opacity-v").textContent = this.value + "%"; PE.invalidate(); clearTimeout(opTimer); opTimer = setTimeout(function () { PE.commit("Layer opacity"); }, 400); });
	function lbtn(id, fn) { $(id).addEventListener("click", function () { if (PE.doc) fn(); }); }
	lbtn("pe-lnew", function () { PE.newRasterLayer(); }); lbtn("pe-lfill", function () { PE.dlgFillLayer(); }); lbtn("pe-lgroup", function () { groupSelected(); }); lbtn("pe-ldup", function () { PE.duplicateLayer(); }); lbtn("pe-ldel", function () { PE.deleteLayer(); }); lbtn("pe-lmerge", function () { PE.mergeDown(); });
	lbtn("pe-lock", function () { var L = PE.active(); L.locked = !L.locked; PE.commit(L.locked ? "Lock layer" : "Unlock layer"); });
	lbtn("pe-mask-btn", function () { var L = PE.active(); if (L.mask) PE.deleteMask(L); else PE.addMask(L, true); });

	/* ---------- status + zoom ---------- */
	function status() { var d = PE.doc; $("pe-st-doc").textContent = d ? d.w + " × " + d.h + " px" : "No image"; $("pe-zoom").textContent = Math.round(PE.view.zoom * 100) + "%"; var L = PE.active(); $("pe-st-layer").textContent = L ? L.name + " · " + L.canvas.width + "×" + L.canvas.height : ""; }
	PE.on("view", status); PE.on("docsize", status); PE.on("layers", status); PE.on("pointer", function (p) { $("pe-st-xy").textContent = Math.floor(p.x) + ", " + Math.floor(p.y); });
	PE.on("cropinfo", function (c) { $("pe-st-xy").textContent = "crop " + c.w + " × " + c.h; });
	PE.on("docsize", function () { $("pe-empty").hidden = !!PE.doc; });
	PE.on("sel", function () { var b = PE.sel && PE.selBounds(); $("pe-st-sel").textContent = b ? "Selection " + b.w + " × " + b.h : ""; });
	$("pe-zoom").addEventListener("click", function () { PE.view.zoom === 1 ? PE.fit() : PE.setZoom(1); });
	$("pe-zin").addEventListener("click", function () { PE.setZoom(PE.view.zoom * 1.25); }); $("pe-zout").addEventListener("click", function () { PE.setZoom(PE.view.zoom / 1.25); });
	$("pe-fit").addEventListener("click", function () { PE.fit(); }); $("pe-undo").addEventListener("click", function () { PE.undo(); }); $("pe-redo").addEventListener("click", function () { PE.redo(); }); $("pe-export").addEventListener("click", function () { PE.dlgExport(); }); $("pe-copy").addEventListener("click", function () { if (needDoc()) copyMerged(); });
$("pe-share").addEventListener("click", function () { if (needDoc()) PE.dlgShare(); });

	/* ---------- edit actions ---------- */
	PE.clipCanvas = null;
	function copySel(cut) {
		var L = PE.active(); if (!PE.doc || !L) return; var c;
		if (PE.sel) { var b = PE.selBounds(); if (!b) return; c = PE.mk(b.w, b.h); var x = c.getContext("2d"); PE.drawLayer(x, L, [1, 0, 0, 1, -b.x, -b.y], "cp", b.w, b.h); x.globalCompositeOperation = "destination-in"; x.drawImage(PE.sel.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); }
		else { c = PE.mk(L.canvas.width, L.canvas.height); c.getContext("2d").drawImage(L.canvas, 0, 0); }
		PE.clipCanvas = c; c.toBlob(function (b) { try { navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function () {}); } catch (e) {} });
		if (cut) clearSel(); PE.toast(cut ? "Cut" : "Copied");
	}
	function copyMerged() { if (!PE.doc) return; var c = PE.flatten(), b = PE.sel && PE.selBounds(); if (b) { var n = PE.mk(b.w, b.h), x = n.getContext("2d"); x.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); x.globalCompositeOperation = "destination-in"; x.drawImage(PE.sel.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); c = n; } PE.clipCanvas = c; c.toBlob(function (bl) { try { navigator.clipboard.write([new ClipboardItem({ "image/png": bl })]).then(function () { PE.toast("Copied merged image"); }); } catch (e) { PE.toast("Copied"); } }); }
	function clearSel() { var L = PE.active(); if (!L) return; if (!PE.sel) { PE.toast("Make a selection first (or delete the layer)"); return; } if (!PE.prepare(L, false, true)) return; var t = L.editMask && L.mask ? L.mask : L.canvas, o = PE.origin(L), x = t.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-out"; x.drawImage(PE.sel.c, -o.x, -o.y); x.restore(); L.rev++; PE.commit("Clear selection"); }
	function fillSel(color) {
		var L = PE.active(); if (!PE.doc || !PE.prepare(L)) return; var o = PE.origin(L), c = PE.mk(L.canvas.width, L.canvas.height), x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
		PE.paintInto(L, c, o.x, o.y, { target: L.editMask && L.mask ? "mask" : "pixel" }); PE.commit("Fill");
	}
	function paintClipboardImage(src, name, at) { if (!PE.doc) { PE.openImageSource(src, name || "Pasted image"); PE.setTool("move"); return; } PE.placeSource(src, name || "Pasted", at); PE.setTool("move"); }
	function pasteInternal() { if (PE.clipCanvas) paintClipboardImage(PE.clipCanvas, "Pasted layer"); else if (navigator.clipboard && navigator.clipboard.read) { navigator.clipboard.read().then(function (items) { for (var i = 0; i < items.length; i++) { var t = items[i].types.filter(function (t) { return /^image\//.test(t); })[0]; if (t) { items[i].getType(t).then(function (b) { return PE.decodeFile(b); }).then(function (im) { paintClipboardImage(im, "Pasted image"); }); return; } } PE.toast("Nothing to paste"); }).catch(function () { PE.toast("Use Ctrl+V to paste an image"); }); } else PE.toast("Use Ctrl+V to paste an image"); }
	document.addEventListener("paste", function (e) {
		if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "") || PE.modalOpen()) return; var items = (e.clipboardData && e.clipboardData.items) || [];
		for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); e.preventDefault(); PE.decodeFile(f).then(function (im) { paintClipboardImage(im, "Pasted image"); }).catch(function () { PE.toast("Can't read that image"); }); return; }
		var tx = e.clipboardData && e.clipboardData.getData("text/plain"); if (tx && PE.looksLikeLatex(tx)) { e.preventDefault(); PE.dlgEquation(null, null, tx.trim().replace(/^\$+|\$+$/g, "")); return; }
		if (PE.clipCanvas) { e.preventDefault(); paintClipboardImage(PE.clipCanvas, "Pasted layer"); }
	});
	function align(how) {
		var L = PE.active(), d = PE.doc; if (!L) return; var b = PE.bounds(L), dx = 0, dy = 0;
		if (how === "left") dx = -b.x; if (how === "hcenter") dx = d.w / 2 - (b.x + b.w / 2); if (how === "right") dx = d.w - (b.x + b.w); if (how === "top") dy = -b.y; if (how === "vcenter") dy = d.h / 2 - (b.y + b.h / 2); if (how === "bottom") dy = d.h - (b.y + b.h);
		PE.translate(L, Math.round(dx), Math.round(dy)); PE.touch(L); PE.commit("Align " + (PE.isGroup(L) ? "group" : "layer"));
	}
	function fitLayer(cover) { var L = PE.active(), d = PE.doc; if (!L) return; if (PE.isGroup(L)) { PE.toast("Select a normal layer"); return; } var w = L.canvas.width, h = L.canvas.height, s = cover ? Math.max(d.w / w, d.h / h) : Math.min(d.w / w, d.h / h); L.sx = Math.sign(L.sx || 1) * s; L.sy = Math.sign(L.sy || 1) * s; L.rot = 0; L.cx = d.w / 2; L.cy = d.h / 2; PE.touch(L); PE.commit(cover ? "Fill canvas" : "Fit to canvas"); }
	function resetTransform() { var L = PE.active(); if (!L) return; if (PE.isGroup(L)) { PE.toast("Select a normal layer"); return; } L.sx = L.sy = 1; L.rot = 0; PE.touch(L); PE.commit("Reset transform"); }
	function promptNum(title, label, val, min, max, fn) { var wrap = el("div"), f = PE.form([{ k: "v", label: label, type: "range", min: min, max: max, step: 1, val: val, unit: "px" }], null); wrap.appendChild(f.el); PE.modal({ title: title, body: wrap, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "OK", primary: true, act: function (m) { var v = f.get().v; m.close(); fn(v); } }] }); }
	function needSel() { if (!PE.sel) { PE.toast("Make a selection first"); return false; } return true; }
	function needDoc() { if (!PE.doc) { PE.toast("Open or create an image first"); return false; } return true; }

	/* ---------- files ---------- */
	function loadPsd(buf, name) {
		return loadScript("https://cdn.jsdelivr.net/npm/ag-psd@30.1.1/dist/bundle.js", function () { return window.agPsd; }).then(function (ag) {
			var psd = ag.readPsd(new Uint8Array(buf), { skipThumbnail: true }), layers = [];
			(function walk(list) { (list || []).forEach(function (n) { if (n.children) walk(n.children); else if (n.canvas) layers.push(n); }); })(psd.children);
			if (!PE.newDoc(psd.width, psd.height, null, I.baseName(name))) return; var d = PE.doc; d.layers = [];
			var MAP = { "normal": "source-over", "multiply": "multiply", "screen": "screen", "overlay": "overlay", "darken": "darken", "lighten": "lighten", "color dodge": "color-dodge", "color burn": "color-burn", "hard light": "hard-light", "soft light": "soft-light", "difference": "difference", "exclusion": "exclusion", "hue": "hue", "saturation": "saturation", "color": "color", "luminosity": "luminosity" };
			if (!layers.length && psd.canvas) layers.push({ name: "Background", canvas: psd.canvas, left: 0, top: 0 });
			layers.forEach(function (n) { var c = PE.clone(n.canvas), L = PE.makeLayer({ canvas: c, name: n.name || "Layer", x: n.left || 0, y: n.top || 0 }); L.visible = !n.hidden; L.opacity = n.opacity == null ? 1 : n.opacity; L.blend = MAP[n.blendMode] || "source-over"; d.layers.push(L); });
			if (!d.layers.length) d.layers.push(PE.makeLayer({ name: "Layer 1" })); d.activeId = d.layers[d.layers.length - 1].id; PE.commit("Open PSD"); PE.dirty = false; PE.fit(); PE.emit("docsize"); PE.setTool("move");
			if (layers.length) PE.toast("Opened " + layers.length + " layer" + (layers.length === 1 ? "" : "s") + " from the PSD (effects, text and adjustment layers are flattened)");
		});
	}
	function loadScript(url, get) { return new Promise(function (res, rej) { if (get()) return res(get()); PE.toast("Loading PSD support…"); var s = document.createElement("script"); s.src = url; s.onload = function () { get() ? res(get()) : rej(new Error("PSD library failed")); }; s.onerror = function () { rej(new Error("Could not load the PSD library (offline?)")); }; document.head.appendChild(s); }); }
	function savePsd() {
		if (!needDoc()) return; loadScript("https://cdn.jsdelivr.net/npm/ag-psd@30.1.1/dist/bundle.js", function () { return window.agPsd; }).then(function (ag) {
			var d = PE.doc, MAP = { "source-over": "normal", "color-dodge": "color dodge", "color-burn": "color burn", "hard-light": "hard light", "soft-light": "soft light" };
			PE.relink(); var kids = d.layers.filter(function (L) { return !PE.isGroup(L); }).map(function (L) { var c = PE.mk(d.w, d.h), x = c.getContext("2d"); PE.drawLayer(x, Object.assign({}, L, { _p: null, opacity: 1, blend: "source-over" }), [1, 0, 0, 1, 0, 0], "psd", d.w, d.h); return { name: L.name, canvas: c, left: 0, top: 0, opacity: L.opacity, hidden: !PE.effVisible(L), blendMode: MAP[L.blend] || L.blend }; });
			var comp = PE.flatten(), buf = ag.writePsd({ width: d.w, height: d.h, children: kids, canvas: comp }, { generateThumbnail: false }); PE.download(new Blob([buf], { type: "image/vnd.adobe.photoshop" }), I.cleanFileName(d.name) + ".psd"); PE.toast("Saved PSD with " + kids.length + " layers");
		}).catch(function (e) { PE.toast(e.message); });
	}
	function openFiles(files, opts) {
		opts = opts || {}; files = Array.prototype.slice.call(files); if (!files.length) return;
		var proj = files.filter(function (f) { return /\.mesproj$/i.test(f.name); })[0], psd = files.filter(function (f) { return /\.psd$/i.test(f.name); })[0], imgs = files.filter(function (f) { return /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif|svg|ico)$/i.test(f.name); });
		if (proj) { if (!confirmReplace()) return; proj.arrayBuffer().then(PE.loadProject).then(function () { PE.setTool("move"); PE.toast("Project opened"); }).catch(function (e) { PE.toast(e.message); }); return; }
		if (psd && !opts.place) { if (!confirmReplace()) return; psd.arrayBuffer().then(function (b) { return loadPsd(b, psd.name); }).catch(function (e) { PE.toast(e.message); }); return; }
		if (!imgs.length) { PE.toast("That file type is not supported (use PNG, JPG, WebP, GIF, BMP, AVIF, SVG, PSD)"); return; }
		var first = !PE.doc || (!opts.place && confirmReplace()); if (!PE.doc) first = true; else if (!opts.place && !first) return;
		var chain = Promise.resolve(); imgs.forEach(function (f, i) { chain = chain.then(function () { return PE.decodeFile(f).then(function (im) { if (first && i === 0 && (!PE.doc || !opts.place)) { PE.openImageSource(im, f.name); } else PE.placeSource(im, I.baseName(f.name), opts.at); }).catch(function () { PE.toast("Can't read " + f.name); }); }); });
		chain.then(function () { PE.setTool("move"); if (imgs.length > 1) PE.toast(imgs.length + " images added as layers"); });
	}
	function confirmReplace() { if (!PE.doc || !PE.dirty || PE.hist.stack.length < 2) return true; return window.confirm("Replace the current image? Unsaved changes will be lost (you can still restore the last auto-saved session)."); }
	PE.openFiles = openFiles;
	function pickFiles(accept, multiple, cb) { var inp = $("pe-file"); inp.accept = accept; inp.multiple = !!multiple; inp.onchange = function () { var fs = Array.prototype.slice.call(inp.files); inp.value = ""; if (fs.length) cb(fs); }; inp.click(); }
	PE.pickFontFile = function () { pickFiles(".ttf,.otf,.woff,.woff2", false, function (fs) { PE.loadFontFile(fs[0]).then(function () { PE.toast("Font loaded"); }).catch(function () { PE.toast("Could not load that font"); }); }); };
	var stage = PE.els.stage;
	["dragenter", "dragover"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); stage.classList.add("is-drop"); } }); });
	["dragleave", "drop"].forEach(function (ev) { stage.addEventListener(ev, function () { stage.classList.remove("is-drop"); }); });
	stage.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); var at = PE.doc ? PE.toDoc(e.clientX, e.clientY) : null; openFiles(e.dataTransfer.files, { place: !!PE.doc, at: null }); } });
	function saveProject() { if (!needDoc()) return; PE.projectBlob().then(function (b) { PE.download(b, I.cleanFileName(PE.doc.name) + ".mesproj"); PE.dirty = false; PE.toast("Project saved (open it again with File → Open)"); }); }

	/* ---------- autosave (IndexedDB) ---------- */
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; Promise.resolve(fn(db.transaction("kv", "readwrite").objectStore("kv"))).then(function (v) { res(v); }, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	var asTimer = 0; PE.scheduleAutosave = function () { clearTimeout(asTimer); asTimer = setTimeout(function () { if (!PE.doc || PE.hist.stack.length < 2) return; PE.projectBlob().then(function (b) { return idb(function (st) { return req(st.put({ blob: b, t: Date.now(), name: PE.doc.name, w: PE.doc.w, h: PE.doc.h }, "auto")); }); }).catch(function () {}); }, 5000); };
	function restoreAuto() { idb(function (st) { return req(st.get("auto")); }).then(function (r) { if (!r) return; return r.blob.arrayBuffer().then(PE.loadProject).then(function () { PE.setTool("move"); PE.toast("Restored your last session"); }); }).catch(function () { PE.toast("Could not restore"); }); }
	function checkAuto() { try { idb(function (st) { return req(st.get("auto")); }).then(function (r) { var b = $("pe-restore"); if (r && b) { b.hidden = false; b.textContent = "↺ Restore last session (" + r.name + ", " + r.w + "×" + r.h + ", " + new Date(r.t).toLocaleString() + ")"; } }).catch(function () {}); } catch (e) {} }
	window.addEventListener("beforeunload", function (e) { if (PE.doc && PE.dirty && PE.hist.stack.length > 1) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- menus ---------- */
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform), MOD = isMac ? "⌘" : "Ctrl+";
	function adj(list) { return list.map(function (a) { return { label: a.title, act: function () { if (needDoc()) PE.runAdjust(a.id); } }; }); }
	var MENUS = [
		{ label: "File", items: [{ label: "New image…", act: function () { PE.dlgNew(); } }, { label: "Open image / PSD / project…", act: function () { pickFiles("image/*,.psd,.mesproj", true, function (fs) { openFiles(fs); }); } }, { label: "Insert equation (LaTeX)…", act: function () { PE.dlgEquation(null, null); } }, { label: "Place image(s) as layers…", act: function () { if (!needDoc()) return; pickFiles("image/*", true, function (fs) { openFiles(fs, { place: true }); }); } }, "-",
			{ label: "Export as PNG / JPEG / WebP…", key: MOD + "Shift+S", act: function () { if (needDoc()) PE.dlgExport(); } }, { label: "Save project (keeps layers)", key: MOD + "S", act: saveProject }, { label: "Save as PSD (Photoshop)", act: savePsd }, { label: "Save as GIMP file (.xcf)", act: function () { PE.saveXcf(); } }, { label: "Connect a folder on this computer…", act: function () { PE.dlgFolder(); } }, { label: "Export all comps as pictures (ZIP)…", act: function () { if (needDoc()) PE.dlgExportComps(); } }, { label: "Copy merged image to clipboard", act: function () { if (needDoc()) copyMerged(); } }, { label: "Share as a link (temporary upload)…", act: function () { if (needDoc()) PE.dlgShare(); } }, "-", { label: "Bulk convert images…", act: function () { window.open("/image-converter", "_blank"); } }] },
		{ label: "Edit", items: [{ label: "Undo", key: MOD + "Z", act: function () { PE.undo(); } }, { label: "Redo", key: MOD + "Shift+Z", act: function () { PE.redo(); } }, "-", { label: "Cut", key: MOD + "X", act: function () { copySel(true); } }, { label: "Copy", key: MOD + "C", act: function () { copySel(false); } }, { label: "Copy merged", act: function () { if (needDoc()) copyMerged(); } }, { label: "Paste as new layer", key: MOD + "V", act: pasteInternal }, "-",
			{ label: "Erase selection with AI (remove object)", act: function () { if (needSel()) PE.aiEraseRun(); } }, { label: "Clear selection (transparent)", key: "Del", act: clearSel }, { label: "Fill with foreground colour", key: "Alt+Backspace", act: function () { if (needDoc()) fillSel(PE.fg); } }, { label: "Fill with background colour", key: MOD + "Backspace", act: function () { if (needDoc()) fillSel(PE.bg); } }, "-",
			{ label: "Select all", key: MOD + "A", act: function () { if (needDoc()) { PE.selAll(); PE.commit("Select all"); } } }, { label: "Deselect", key: MOD + "D", act: function () { if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } }, { label: "Invert selection", key: MOD + "Shift+I", act: function () { if (needDoc()) { PE.selInvert(); PE.commit("Invert selection"); } } },
			{ label: "Feather selection…", act: function () { if (needSel()) promptNum("Feather selection", "Radius", 8, 1, 200, function (v) { PE.selFeather(v); PE.commit("Feather"); }); } }, { label: "Grow selection…", act: function () { if (needSel()) promptNum("Grow selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, true); PE.commit("Grow selection"); }); } }, { label: "Shrink selection…", act: function () { if (needSel()) promptNum("Shrink selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, false); PE.commit("Shrink selection"); }); } }] },
		{ label: "Image", items: [{ label: "Image size…", act: function () { PE.dlgImageSize(); } }, { label: "Canvas size…", act: function () { PE.dlgCanvasSize(); } }, { label: "Upscale with AI (2× / 4×)…", act: function () { PE.aiUpscale(); } }, { label: "Crop to selection", act: function () { if (!needDoc()) return; var b = PE.selBounds(); if (!b) { PE.toast("Make a selection first, or use the Crop tool"); return; } PE.cropTo(b.x, b.y, b.w, b.h); } }, { label: "Trim transparent edges", act: function () { if (needDoc()) PE.trim(); } }, "-",
			{ label: "Rotate / straighten…", act: function () { PE.dlgStraighten(); } }, { label: "Rotate 90° clockwise", act: function () { if (needDoc()) PE.rotateImage(90); } }, { label: "Rotate 90° counter-clockwise", act: function () { if (needDoc()) PE.rotateImage(270); } }, { label: "Rotate 180°", act: function () { if (needDoc()) PE.rotateImage(180); } }, { label: "Flip horizontal", act: function () { if (needDoc()) PE.flipImage(true); } }, { label: "Flip vertical", act: function () { if (needDoc()) PE.flipImage(false); } }, "-", { label: "Flatten image", act: function () { if (needDoc()) PE.flattenImage(); } }] },
		{ label: "Layer", items: [{ label: "Group layers", key: MOD + "G", act: function () { if (needDoc()) groupSelected(); } }, { label: "Ungroup", key: MOD + "Shift+G", act: function () { if (needDoc()) PE.ungroup(); } }, "-", { label: "New layer (empty)", key: MOD + "Shift+N", act: function () { if (needDoc()) PE.newRasterLayer(); } }, { label: "New solid colour layer… (white, black, any colour)", act: function () { PE.dlgFillLayer(); } }, { label: "Duplicate layer", key: MOD + "J", act: function () { if (needDoc()) PE.duplicateLayer(); } }, { label: "Delete layer", act: function () { if (needDoc()) PE.deleteLayer(); } }, { label: "Layer via copy (selection)", act: function () { if (needDoc()) PE.layerFromSelection(false); } }, { label: "Layer via cut (selection)", act: function () { if (needDoc()) PE.layerFromSelection(true); } }, "-",
			{ label: "Merge down", key: MOD + "E", act: function () { if (needDoc()) PE.mergeDown(); } }, { label: "Merge visible", act: function () { if (needDoc()) PE.mergeVisible(); } }, "-", { label: "Remove background (AI)…", act: function () { PE.aiRemoveBackground(); } }, { label: "Add layer mask", act: function () { if (needDoc()) PE.addMask(PE.active(), true); } }, { label: "Apply layer mask", act: function () { if (needDoc()) PE.applyMask(); } }, { label: "Delete layer mask", act: function () { if (needDoc()) PE.deleteMask(); } }, { label: "Rasterize text layer", act: function () { var L = PE.active(); if (L && L.type === "text") { PE.rasterize(L); PE.commit("Rasterize"); } } }, "-",
			{ label: "Align: left", act: function () { align("left"); } }, { label: "Align: centre horizontally", act: function () { align("hcenter"); } }, { label: "Align: right", act: function () { align("right"); } }, { label: "Align: top", act: function () { align("top"); } }, { label: "Align: centre vertically", act: function () { align("vcenter"); } }, { label: "Align: bottom", act: function () { align("bottom"); } }, "-",
			{ label: "Drop shadow / glow…", act: function () { PE.dlgEffect("shadow"); } }, { label: "Outline…", act: function () { PE.dlgEffect("outline"); } }, { label: "Round corners…", act: function () { PE.dlgRoundCorners(); } }, "-", { label: "Fit layer inside canvas", act: function () { fitLayer(false); } }, { label: "Fill canvas with layer", act: function () { fitLayer(true); } }, { label: "Reset layer scale / rotation", act: resetTransform }, { label: "Flip layer horizontally", act: function () { if (needDoc()) PE.flipLayer(true); } }, { label: "Flip layer vertically", act: function () { if (needDoc()) PE.flipLayer(false); } }, "-", { label: "Move layer up", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 1); } }, { label: "Move layer down", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -1); } }, { label: "Bring to front", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 999); } }, { label: "Send to back", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -999); } }] },
		{ label: "Adjust", items: adj(PE.ADJUST) }, { label: "Filter", items: adj(PE.FILTERS) },
		{ label: "View", items: [{ label: "Zoom in", key: MOD + "+", act: function () { PE.setZoom(PE.view.zoom * 1.25); } }, { label: "Zoom out", key: MOD + "−", act: function () { PE.setZoom(PE.view.zoom / 1.25); } }, { label: "Fit on screen", key: MOD + "0", act: function () { PE.fit(); } }, { label: "Actual pixels (100%)", key: MOD + "1", act: function () { PE.setZoom(1); } }, "-", { label: "Pixel grid (when zoomed in)", act: function () { PE.showGrid = !PE.showGrid; PE.invalidate(); } }, { label: "Full window mode", key: "F", act: function () { toggleWin(); } }] },
		{ label: "Help", items: [{ label: "Keyboard shortcuts", act: shortcuts }, { label: "Tips for labels, arrows and callouts", act: tips }] }
	];
	var openMenu = null;
	function buildMenus() {
		var bar = $("pe-menubar"); bar.innerHTML = "";
		MENUS.forEach(function (m) {
			var b = el("button", "pe-menu", esc(m.label)); b.type = "button"; b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false");
			var pop = el("div", "pe-pop"); pop.hidden = true; pop.setAttribute("role", "menu");
			m.items.forEach(function (it) { if (it === "-") { pop.appendChild(el("div", "pe-sep")); return; } var r = el("button", "pe-item", "<span>" + esc(it.label) + "</span>" + (it.key ? "<kbd>" + esc(it.key) + "</kbd>" : "")); r.type = "button"; r.setAttribute("role", "menuitem"); r.addEventListener("click", function () { closeMenu(); it.act(); }); pop.appendChild(r); });
			var wrap = el("div", "pe-mwrap"); wrap.appendChild(b); wrap.appendChild(pop); bar.appendChild(wrap);
			b.addEventListener("click", function (e) { e.stopPropagation(); if (openMenu && openMenu.b === b) closeMenu(); else showMenu(b, pop, wrap); }); b.addEventListener("mouseenter", function () { if (openMenu && openMenu.b !== b) showMenu(b, pop, wrap); });
		});
	}
	function showMenu(b, pop, wrap) { closeMenu(); pop.hidden = false; b.setAttribute("aria-expanded", "true"); openMenu = { b: b, pop: pop }; var r = pop.getBoundingClientRect(); if (r.right > window.innerWidth - 8) pop.style.left = (window.innerWidth - 8 - r.right) + "px"; if (r.bottom > window.innerHeight - 8) pop.style.maxHeight = (window.innerHeight - r.top - 12) + "px"; }
	function closeMenu() { if (openMenu) { openMenu.pop.hidden = true; openMenu.pop.style.left = ""; openMenu.b.setAttribute("aria-expanded", "false"); openMenu = null; } }
	document.addEventListener("click", closeMenu); document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
	function shortcuts() {
		var rows = [["V M L W C", "Move, Marquee, Lasso, Magic wand, Crop"], ["B E S R", "Brush, Eraser, Clone stamp, Retouch"], ["K G I", "Paint bucket, Gradient, Eyedropper"], ["T U", "Text, Shapes & annotations"], ["H / Space", "Pan (hold Space with any tool)"], ["Z, Ctrl + wheel", "Zoom"], ["[ and ]", "Smaller / larger brush"], ["X / D", "Swap / reset colours"], [MOD + "Z, " + MOD + "Shift+Z", "Undo, redo"], [MOD + "A, " + MOD + "D, " + MOD + "Shift+I", "Select all, deselect, invert selection"], [MOD + "C X V", "Copy, cut, paste as layer"], [MOD + "J, " + MOD + "E", "Duplicate layer, merge down"], ["Delete", "Clear selection (or delete the layer)"], ["Arrow keys", "Nudge the layer (Shift = 10 px)"], ["Enter / Esc", "Apply crop, close polygon / cancel"], [MOD + "0 / " + MOD + "1", "Fit on screen / 100%"], [MOD + "S", "Save project"], [MOD + "Shift+S", "Export PNG / JPEG / WebP"]];
		var w = el("div"); w.innerHTML = '<table class="pe-keys">' + rows.map(function (r) { return "<tr><td><kbd>" + esc(r[0]) + "</kbd></td><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</table>"; PE.modal({ title: "Keyboard shortcuts", body: w, buttons: [{ label: "Close", primary: true, act: function (m) { m.close(); } }] });
	}
	function tips() {
		var w = el("div", "pe-tips"); w.innerHTML = "<ul><li><b>Label an image:</b> Text tool, click, type. Turn on <i>Background box</i> (or press <i>Yellow label</i>) for a callout look.</li><li><b>Arrows, boxes, numbers:</b> Shapes tool. Each shape lands on its own layer: move it with the Move tool, delete it from the Layers panel.</li><li><b>Combine images:</b> drag several files onto the canvas (each becomes a layer) or paste with Ctrl+V. Move, resize and rotate with the Move tool.</li><li><b>Transparent background:</b> Magic wand the background, press Delete, then Export as PNG. Or Adjust → Make a colour transparent.</li><li><b>Remove an object or person:</b> Object Erase tool (J): paint over it, press Enter. Or make a selection and use Edit → Erase selection with AI. <b>Cut out a subject:</b> Layer → Remove background (AI).</li><li><b>Many thumbnails from one project:</b> put each design in a group (select layers with Ctrl-click, Ctrl+G), then use the Comps tab: set up what is visible, + Save current view, repeat, then Export all. Press , and . to flip between comps.</li><li><b>Make a small picture bigger:</b> Image → Upscale with AI.</li><li><b>Equations:</b> Equation tool (Q) or File → Insert equation: type LaTeX (or paste LaTeX text with Ctrl+V), see the preview, Insert. Click it again to edit; it stays sharp when enlarged.</li><li><b>Hide private info:</b> Shapes → Blur / hide area, then drag over it.</li><li><b>Large file?</b> Export as WebP or JPEG and lower the quality.</li></ul>"; PE.modal({ title: "Tips", body: w, buttons: [{ label: "Close", primary: true, act: function (m) { m.close(); } }] });
	}

	/* ---------- search: tools, menu commands, layers (Ctrl+K) ---------- */
	(function () {
		var inp = $("pe-search"), box = $("pe-sres"), items = [], sel = 0;
		function build() {
			var list = [];
			PE.toolOrder.forEach(function (id) { var t = PE.tools[id]; if (t) list.push({ k: "Tool", l: t.name, sub: t.key ? "key " + t.key.toUpperCase() : "", hay: (t.name + " " + (HELP[id] || t.hint || "")).toLowerCase(), run: function () { PE.setTool(id); } }); });
			MENUS.forEach(function (m) { m.items.forEach(function (it) { if (it !== "-") list.push({ k: m.label, l: it.label.replace(/…$/, ""), sub: it.key || "", hay: (it.label + " " + m.label).toLowerCase(), run: function () { it.act(); } }); }); });
			if (PE.doc) PE.doc.layers.slice().reverse().forEach(function (L) { if (!PE.isGroup(L) || true) list.push({ k: PE.isGroup(L) ? "Group" : "Layer", l: L.name, sub: PE.isGroup(L) ? "group" : (L.type === "text" ? "text layer" : "layer"), hay: L.name.toLowerCase(), run: function () { PE.setActive(L.id); PE.emit("layers"); } }); });
			return list;
		}
		function run() {
			var q = inp.value.trim().toLowerCase(); if (!q) { box.hidden = true; return; } var toks = q.split(/\s+/), all = build();
			items = all.map(function (x) { var inTitle = toks.every(function (t) { return x.l.toLowerCase().indexOf(t) >= 0; }), inHay = toks.every(function (t) { return x.hay.indexOf(t) >= 0; }); return inTitle ? { x: x, s: x.l.toLowerCase().indexOf(toks[0]) === 0 ? 3 : 2 } : inHay ? { x: x, s: 1 } : null; }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).slice(0, 14).map(function (o) { return o.x; });
			sel = 0; draw();
		}
		function draw() {
			box.hidden = false; box.innerHTML = items.length ? "" : '<div class="pe-sres-none">Nothing matches. Try “crop”, “blur”, “export”, “white” or a layer name.</div>';
			items.forEach(function (x, i) { var r = el("button", "pe-sres-i", "<span class=\"pe-sres-k\">" + esc(x.k) + "</span><span class=\"pe-sres-l\">" + esc(x.l) + "</span>" + (x.sub ? "<kbd>" + esc(x.sub) + "</kbd>" : "")); r.type = "button"; r.setAttribute("aria-selected", i === sel ? "true" : "false"); r.addEventListener("mousedown", function (e) { e.preventDefault(); pick(i); }); box.appendChild(r); });
		}
		function pick(i) { var x = items[i]; if (!x) return; box.hidden = true; inp.value = ""; inp.blur(); x.run(); }
		inp.addEventListener("input", run); inp.addEventListener("focus", run);
		inp.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); } else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } else if (e.key === "Enter") { e.preventDefault(); pick(sel); } else if (e.key === "Escape") { inp.value = ""; box.hidden = true; inp.blur(); } });
		document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest("#pe-searchw")) box.hidden = true; });
		document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && root.offsetParent) { e.preventDefault(); e.stopPropagation(); inp.focus(); inp.select(); } }, true);
	})();
	/* "?" on the panel headings */
	(function () {
		var T = { "Colour": "The two colours you paint with. The big square on top is the foreground (brushes, text, shapes), the one behind it is the background. Click either to change it, press X to swap them, D to reset to black and white.", "Layers": "Layers are transparent sheets stacked on top of each other: each picture, text or drawing lives on its own so you can move or delete it without touching the rest. The one at the top of the list is in front. Click a layer to select it; the eye hides it. Use the buttons: New adds an empty layer, Colour fill adds a layer of one solid colour (a white background, say), Merge down joins it with the layer below.", "History": "Every change you make is listed here. Click an earlier step to go back to it, or press Ctrl+Z. Steps after it stay until you make a new change.", "Comps": "Comps are saved scenes: which layers are shown and where they sit. Make a few versions of a design (different headlines, say) and switch between them, or export them all as pictures at once." };
		Array.prototype.forEach.call(root.querySelectorAll(".pe-ph"), function (h) { var k = h.textContent.trim(); if (T[k] && !h.querySelector(".pe-qh")) h.appendChild(PE.helpBtn(k, esc(T[k]))); });
		var tabs = $("pe-tab-hist"), tc = $("pe-tab-comps"); if (tabs && tc && tabs.parentNode) { tabs.title = T["History"]; tc.title = T["Comps"]; }
	})();

	/* ---------- window mode ---------- */
	var autoWin = false;
	function toggleWin(auto) { var on = !root.classList.contains("pe-win"); root.classList.toggle("pe-win", on); document.documentElement.classList.toggle("pe-win-on", on); $("pe-winbtn").setAttribute("aria-pressed", on ? "true" : "false"); $("pe-winbtn").textContent = on ? "⤡ Exit full window" : "⤢ Full window"; if (auto !== true) sset({ win: on }); setTimeout(function () { resize(); if (PE.doc) PE.fit(); }, 30); }
	$("pe-winbtn").addEventListener("click", function () { toggleWin(); });
	// no automatic Full window when a picture is opened (it hid the sidebar and the Standard | Wide | Theatre switch): Full window stays one click away (key F) and a manual choice is remembered

	/* ---------- keyboard ---------- */
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) && t.type !== "range" && t.type !== "checkbox" && t.type !== "button") || (t && t.isContentEditable);
		if (typing || PE.modalOpen()) return; var k = e.key, low = k.toLowerCase(), mod = e.ctrlKey || e.metaKey, has = !!PE.doc;
		if (k === " " ) { if (!e.repeat) { PE.setSpace(true); PE.spaceHeld = true; PE.els.over.style.cursor = "grab"; } if (document.activeElement === document.body || root.contains(document.activeElement)) e.preventDefault(); return; }
		if (mod) {
			if (low === "z") { e.preventDefault(); e.shiftKey ? PE.redo() : PE.undo(); return; } if (low === "y") { e.preventDefault(); PE.redo(); return; }
			if (!has && low !== "v" && low !== "o") return;
			if (low === "a") { e.preventDefault(); PE.selAll(); PE.commit("Select all"); } else if (low === "d") { e.preventDefault(); if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } else if (low === "i" && e.shiftKey) { e.preventDefault(); PE.selInvert(); PE.commit("Invert selection"); }
			else if (low === "c") { e.preventDefault(); e.shiftKey ? copyMerged() : copySel(false); } else if (low === "x") { e.preventDefault(); copySel(true); } else if (low === "j") { e.preventDefault(); PE.duplicateLayer(); } else if (low === "g") { e.preventDefault(); e.shiftKey ? PE.ungroup() : groupSelected(); } else if (low === "e") { e.preventDefault(); PE.mergeDown(); }
			else if (low === "n" && e.shiftKey) { e.preventDefault(); PE.newRasterLayer(); } else if (low === "s") { e.preventDefault(); e.shiftKey ? PE.dlgExport() : saveProject(); } else if (k === "0") { e.preventDefault(); PE.fit(); } else if (k === "1") { e.preventDefault(); PE.setZoom(1); } else if (k === "=" || k === "+") { e.preventDefault(); PE.setZoom(PE.view.zoom * 1.25); } else if (k === "-") { e.preventDefault(); PE.setZoom(PE.view.zoom / 1.25); }
			else if (low === "t") { e.preventDefault(); PE.setTool("move"); PE.opt.move.handles = true; buildOpts(); } else if (low === "o") { e.preventDefault(); pickFiles("image/*,.psd,.mesproj", true, function (fs) { openFiles(fs); }); } else if (k === "Backspace") { e.preventDefault(); fillSel(PE.bg); }
			return;
		}
		if (e.altKey && k === "Backspace") { e.preventDefault(); if (has) fillSel(PE.fg); return; }
		if (!has) return;
		if (k === "Enter") { var tl = PE.tool(); if (tl.enter) { e.preventDefault(); tl.enter(); } return; }
		if (k === "Escape") { var tl2 = PE.tool(); if (tl2.cancel) tl2.cancel(); if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } if (root.classList.contains("pe-win")) { } PE.invalidateOverlay(); return; }
		if (k === "Delete" || k === "Backspace") { e.preventDefault(); if (PE.sel) clearSel(); else PE.deleteLayer(); return; }
		if (k.indexOf("Arrow") === 0 && PE.toolId === "move") { e.preventDefault(); var n = e.shiftKey ? 10 : 1; PE.nudge(k === "ArrowLeft" ? -n : k === "ArrowRight" ? n : 0, k === "ArrowUp" ? -n : k === "ArrowDown" ? n : 0); return; }
		if (k === "[") { PE.stepBrushSize(-1); return; } if (k === "]") { PE.stepBrushSize(1); return; }
		if (k === ",") { stepComp(-1); return; } if (k === ".") { stepComp(1); return; } if (low === "x") { swapColors(); return; } if (low === "d") { PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color"); return; } if (low === "f") { toggleWin(); return; }
		for (var id in PE.tools) if (PE.tools[id].key === low) { PE.setTool(id); return; }
	});
	document.addEventListener("keyup", function (e) { if (e.key === " ") { PE.setSpace(false); PE.spaceHeld = false; setCursor(); PE.invalidateOverlay(); } });
	root.addEventListener("dblclick", function (e) { if (e.target === PE.els.over && PE.toolId !== "text") { var L = PE.active(); if (L && L.type === "text" && PE.toolId === "move") PE.editActiveText(); else if (L && L.eq && PE.toolId === "move") PE.dlgEquation(L); } });

	/* ---------- empty state + init ---------- */
	$("pe-e-open").addEventListener("click", function () { pickFiles("image/*,.psd,.mesproj", true, function (fs) { openFiles(fs); }); });
	$("pe-e-new").addEventListener("click", function () { PE.dlgNew(); }); $("pe-e-paste").addEventListener("click", pasteInternal);
	$("pe-restore").addEventListener("click", restoreAuto);
	if (S.opt) for (var k in S.opt) if (PE.opt[k]) for (var kk in S.opt[k]) if (kk in PE.opt[k]) PE.opt[k][kk] = S.opt[k][kk];
	PE.opt.shape.next = 1; PE.opt.text.str = "Text";
	showTab(S.tab === "comps" ? "comps" : "hist"); buildMenus(); buildTools(); PE.initPointer(); PE.initTextEditor(); buildColor(); resize(); PE.setTool("move"); status(); checkAuto();
	if (S.win) { autoWin = true; toggleWin(true); }
	var q = new URLSearchParams(location.search); if (q.get("new")) { var wh = (q.get("new") || "").split("x"); if (wh.length === 2) PE.newDoc(+wh[0], +wh[1], "#ffffff"); }
	window.PEdebug = PE;
})();
