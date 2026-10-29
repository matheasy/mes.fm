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
	var ORDER = ["move", "marquee", "lasso", "wand", "crop", "layercrop", "brush", "smudge", "eraser", "clone", "retouch", "objerase", "bucket", "gradient", "eyedropper", "text", "equation", "shape", "hand", "zoom"];
	var HELP = {
		move: "Move, resize and rotate layers. Drag a layer to move it. Several at once: Ctrl / Cmd- or Shift-click layers on the picture (or in the Layers panel), or drag a box on empty canvas (or from outside the picture) to pick every layer it touches; Shift-drag a box adds to the selection. Then drag any of them to move them all, or drag the handles of the combined box to resize them together (rotating works on one layer at a time). While moving or resizing, the layer snaps to the canvas edges and centre (magenta guides) and to other layers' edges and centres (cyan guides); hold Ctrl (or Alt while moving) to place freely. Shift while moving keeps to one direction; on a handle, Shift switches between keeping and changing the proportions and Alt resizes from the centre. Drag just outside a corner to rotate. Arrow keys nudge the selection by 1 px (Shift = 10 px). Double-click a text to edit it.",
		marquee: "Draw a rectangle or ellipse selection. Anything you then do (fill, delete, adjust, copy) only touches the selection. Shift while dragging = square or circle, Shift-drag on an existing selection = add to it, Alt = subtract. Drag inside a selection to move it, click once to deselect. Feather softens the edge.",
		lasso: "Select any shape. Freehand: drag around the area. Polygon: click each corner, then double-click or press Enter to close. Use the Mode buttons to add to, subtract from or intersect an existing selection.",
		wand: "Click a colour to select every touching pixel of a similar colour. Raise Tolerance to include more shades. Click the background, press Delete, then export as PNG for a transparent background.",
		crop: "Cut the picture down to part of it. Drag the box or its handles, pick a ratio in the option bar if you want one, then press Enter or Apply. Everything outside the box is removed.",
		brush: "Paint with the foreground colour. [ and ] change the size, Shift-click draws a straight line from the last point. Opacity, hardness and size are in the option bar. On a layer mask the brush reveals the layer.",
		smudge: "Drag to smear colours along, like pulling a finger through wet paint. Strength decides how far the colour is carried; Size and Hardness work like the brush.",
		eraser: "Erase pixels on the active layer (they become transparent). Same size and hardness controls as the brush. On a layer mask the eraser hides parts of the layer without destroying them.",
		clone: "Copy one part of the picture over another. Alt-click to choose the source spot, then paint where the copy should go. Good for removing blemishes, dust and small objects.",
		retouch: "Paint to blur, sharpen, lighten, darken or change the saturation only where you drag. Choose the effect and its strength in the option bar.",
		objerase: "AI object remover. Paint over the thing you want gone (Alt un-paints), then press Enter or the Erase button. The AI fills the area from its surroundings. Works best on small objects against plain or repeating backgrounds. The model downloads once on first use.",
		bucket: "Click an area to fill it with the foreground colour. Tolerance decides how similar a colour must be to be filled. With a selection active, only the selection is filled.",
		gradient: "Drag from where the gradient should start to where it should end. It blends the foreground and background colours and respects any selection.",
		eyedropper: "Press and drag over the picture: a magnifier follows the pointer and shows the pixels, the colour and its hex code; let go to use it as the foreground colour (Alt = background). Sample = 1 pixel or the average of a 3 × 3 / 5 × 5 area; All layers = the colour you see, off = only the selected layer. With Confirm with a button, letting go leaves a Use this colour / Cancel bar and you can drag again to move the sample point. The 💉 buttons next to the colour wells and the option bar colours do the same for one pick.",
		text: "Click empty canvas to add a text; click an existing text to edit it right on the picture. The caret goes where you click; drag to select, double-click selects a word, triple-click a line, Shift-click extends. Enter starts a new line; Ctrl+Enter, Esc or a click outside finishes. The option bar (font, size, colour, outline, box...) changes the selected text layer live, also while you type, and the whole edit is one undo step. Drag the purple handle on the right of the frame to wrap the text to a width. Each text is its own layer, so you can move, scale and rotate it later.",
		equation: "Insert a maths equation. Click where it goes, type LaTeX (a live preview appears), then Insert. Click an existing equation to edit it. Equations stay sharp when enlarged.",
		shape: "Draw rectangles, rounded boxes, ellipses, lines, arrows, callouts, numbered step badges, highlights and blur / hide areas. Shift = square or straight line. Outline uses the foreground colour, fill uses the background colour. Each shape lands on its own layer.",
		hand: "Drag to pan around a zoomed-in picture. You can also hold Space with any tool, or use the middle mouse button.",
		zoom: "Click to zoom in, Alt-click to zoom out. Ctrl + mouse wheel also zooms, and Ctrl+0 fits the picture to the window.",
		layercrop: "Crops ONE layer without deleting anything (like Camtasia): drag the edges or corners of the purple box to hide the sides of the selected layer, drag inside the box to slide what shows. The hidden part is kept, so Show whole layer brings it back any time. Then use the Move tool to place the layer; the crop moves with it."
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
		ariaSide(); setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 0);
	}
	function ariaSide() { var g = $("pe-sgrip"), s = $("pe-side"); if (!g) return; var fs = parseFloat(getComputedStyle(s).fontSize) || 13, now = Math.round(s.getBoundingClientRect().width) || Math.round(UI.sw * fs); g.setAttribute("aria-valuemin", String(Math.round(12 * fs))); g.setAttribute("aria-valuemax", String(Math.round(48 * fs))); g.setAttribute("aria-valuenow", String(now)); g.setAttribute("aria-valuetext", "Panels " + now + " pixels wide"); }
	function initLayoutUI() {
		var tg = el("button", "pe-ttoggle", "»"); tg.type = "button"; tg.id = "pe-ttoggle"; tg.addEventListener("click", function () { UI.tw = !UI.tw; saveUI(); applyUI(); }); var th = el("div", "pe-thead"), tsw = el("button", "pe-tswap", "⇄"); tsw.type = "button"; tsw.id = "pe-tswap"; tsw.addEventListener("click", function () { UI.tside = UI.tside === "r" ? "l" : "r"; saveUI(); applyUI(); }); th.appendChild(tg); th.appendChild(tsw); $("pe-tools").insertBefore(th, $("pe-tools").firstChild);
		var bar = el("div", "pe-sbar"); bar.innerHTML = '<span>Panels</span><button type="button" id="pe-sswap" class="pe-mini">⇄</button><button type="button" id="pe-shide" class="pe-mini" title="Hide the panels (more room for the picture)">Hide ✕</button>'; $("pe-side").insertBefore(bar, $("pe-side").firstChild);
		/* the panels' grip is its own flex item between the picture and the panels (it used to sit inside the scrolling panel column, where the
		   search box's .pe-sres styles moved it to the bottom as an 8 px square: that is why the panels could not be resized) */
		var side = $("pe-side"), grip = el("div", "pe-sgrip"); grip.id = "pe-sgrip"; grip.tabIndex = 0; grip.setAttribute("role", "separator"); grip.setAttribute("aria-orientation", "vertical"); grip.setAttribute("aria-controls", "pe-side"); grip.setAttribute("aria-label", "Width of the panels");
		grip.title = "Drag to make the panels wider or narrower. Arrow keys work too when it is selected (Shift = bigger steps). Double-click: back to the normal width."; grip.innerHTML = "<i></i>"; side.parentNode.insertBefore(grip, side);
		var show = el("button", "pe-sshow", "‹ Panels"); show.type = "button"; show.id = "pe-sshow"; show.hidden = true; $("pe-stage").appendChild(show);
		$("pe-sswap").addEventListener("click", function () { UI.side = UI.side === "l" ? "r" : "l"; saveUI(); applyUI(); });
		$("pe-shide").addEventListener("click", function () { UI.hide = true; saveUI(); applyUI(); }); show.addEventListener("click", function () { UI.hide = false; saveUI(); applyUI(); });
		function fsOf() { return parseFloat(getComputedStyle(side).fontSize) || 13; }
		function otherW() { var w = 0; Array.prototype.forEach.call(root.querySelector(".pe-main").children, function (c) { if (c !== side && c !== grip && c !== PE.els.stage && c.offsetParent !== null) w += c.offsetWidth; }); return w; }
		function setSide(em, save) { UI.sw = P.panelClamp(em, root.querySelector(".pe-main").clientWidth, otherW() + grip.offsetWidth, fsOf()); side.style.width = UI.sw + "em"; ariaSide(); if (save) saveUI(); }
		PE.setPanelWidth = setSide;
		grip.addEventListener("dblclick", function () { setSide(17.5, true); });
		grip.addEventListener("keydown", function (e) { var r = P.panelKey(e.key, e.shiftKey, UI.side === "l"); if (!r) return; e.preventDefault(); e.stopPropagation(); setSide(r.to === "reset" ? 17.5 : r.to === "min" ? 0 : r.to === "max" ? 999 : UI.sw + r.d, true); });
		grip.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return; e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch (x) {} grip.classList.add("is-drag"); grip.focus({ preventScroll: true });
			var x0 = e.clientX, w0 = side.getBoundingClientRect().width, fs = fsOf(), dir = UI.side === "l" ? 1 : -1;
			function mv(ev) { setSide((w0 + (ev.clientX - x0) * dir) / fs, false); }
			function up() { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up); grip.classList.remove("is-drag"); saveUI(); window.dispatchEvent(new Event("resize")); }
			grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
		});
		var tg2 = el("div", "pe-tres"); tg2.title = "Drag to make the toolbox wider or narrower (double-click to reset)"; $("pe-tools").parentNode.insertBefore(tg2, $("pe-tools").nextSibling);
		tg2.addEventListener("dblclick", function () { UI.tws = 15.5; UI.tw = true; saveUI(); applyUI(); });
		tg2.addEventListener("pointerdown", function (e) { e.preventDefault(); tg2.setPointerCapture(e.pointerId); var x0 = e.clientX, w0 = $("pe-tools").getBoundingClientRect().width, fs = parseFloat(getComputedStyle($("pe-tools")).fontSize) || 16, dir = UI.tside === "r" ? -1 : 1;
			function mv(ev) { var w = (w0 + (ev.clientX - x0) * dir) / fs; if (w < 7) { UI.tw = false; } else { UI.tw = true; UI.tws = Math.max(9, Math.min(30, w)); } applyUI(); }
			function up() { tg2.removeEventListener("pointermove", mv); tg2.removeEventListener("pointerup", up); saveUI(); window.dispatchEvent(new Event("resize")); } tg2.addEventListener("pointermove", mv); tg2.addEventListener("pointerup", up); });
		applyUI();
	}
	/* the tool panel in groups (round 7): fold a group, Arrange mode = drag tools to reorder or into another group, new / rename / delete groups, hide
	   tools you never use (their keys still work), Reset. Saved as UI.tl {groups: [{id, name, open, tools}], hidden: [ids]} (MESPixel.normToolLayout). */
	var TL_DEF = [{ id: "sel", name: "Select & move", tools: ["move", "marquee", "lasso", "wand", "crop", "layercrop"] }, { id: "paint", name: "Paint & fix", tools: ["brush", "smudge", "eraser", "clone", "retouch", "objerase", "bucket", "gradient"] },
		{ id: "add", name: "Text & shapes", tools: ["text", "equation", "shape"] }, { id: "view", name: "Colour & view", tools: ["eyedropper", "hand", "zoom"] }];
	var arranging = false, tdrag = null;
	function toolLayout() { return P.normToolLayout(UI.tl, ORDER.filter(function (id) { return PE.tools[id]; }), TL_DEF); }
	function saveLayout(L) { UI.tl = L; saveUI(); drawTools(); }
	function toolRow(id) {
		var t = PE.tools[id], row = el("div", "pe-trow"), b = el("button", "pe-tool"); row.dataset.t = id; b.type = "button"; b.dataset.t = id; b.title = t.name + " (" + t.key.toUpperCase() + ")"; b.setAttribute("aria-label", t.name); b.setAttribute("aria-pressed", PE.toolId === id ? "true" : "false");
		b.innerHTML = '<span class="pe-ticon">' + esc(t.icon) + '</span><span class="pe-tname">' + esc(t.name.replace(/ \(.*\)$/, "")) + '</span><kbd class="pe-tkey">' + esc(t.key.toUpperCase()) + "</kbd>"; b.addEventListener("click", function () { if (!arranging) PE.setTool(id); });
		row.appendChild(b);
		if (arranging) {
			row.draggable = true; row.classList.add("is-arr");
			var hb = el("button", "pe-thide", "✕"); hb.type = "button"; hb.title = "Hide this tool (its key still works; show it again from Hidden tools)"; hb.setAttribute("aria-label", "Hide " + t.name); hb.addEventListener("click", function () { saveLayout(P.moveTool(toolLayout(), id, "hidden")); }); row.appendChild(hb);
			row.addEventListener("dragstart", function (e) { tdrag = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pe-tool", id); row.classList.add("is-dragging"); });
			row.addEventListener("dragend", function () { tdrag = null; row.classList.remove("is-dragging"); clearMarks(); });
			row.addEventListener("dragover", function (e) { if (!tdrag) return; e.preventDefault(); clearMarks(); var r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? "is-over-above" : "is-over-below"); });
			row.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); e.stopPropagation(); var r = row.getBoundingClientRect(), below = e.clientY >= r.top + r.height / 2, L = toolLayout(), gid = row.closest(".pe-tgrp").dataset.g, g = L.groups.filter(function (x) { return x.id === gid; })[0], src = tdrag; tdrag = null; if (!g || src === id) { drawTools(); return; }
				var list = g.tools.filter(function (x) { return x !== src; }), at = list.indexOf(id) + (below ? 1 : 0); saveLayout(P.moveTool(L, src, gid, at)); });
			// keyboard: Alt+Up / Alt+Down move the tool inside its group
			b.addEventListener("keydown", function (e) { if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return; e.preventDefault(); var L = toolLayout(), g = L.groups.filter(function (x) { return x.tools.indexOf(id) >= 0; })[0]; if (!g) return; var i = g.tools.indexOf(id) + (e.key === "ArrowUp" ? -1 : 1); if (i < 0 || i >= g.tools.length) return; saveLayout(P.moveTool(L, id, g.id, i)); setTimeout(function () { var nb = $("pe-tools").querySelector('.pe-tool[data-t="' + id + '"]'); if (nb) nb.focus(); }, 0); });
		} else {
			var q = el("button", "pe-thelp", "?"); q.type = "button"; q.title = "What is this tool and how do I use it?"; q.setAttribute("aria-label", "Help: " + t.name); q.addEventListener("click", function () { showHelp(id, row); }); row.appendChild(q);
		}
		return row;
	}
	function clearMarks() { Array.prototype.forEach.call($("pe-tools").querySelectorAll(".is-over-above,.is-over-below,.is-over-into"), function (r) { r.classList.remove("is-over-above", "is-over-below", "is-over-into"); }); }
	function drawTools() {
		var box = $("pe-tools"), head = box.querySelector(".pe-thead"); Array.prototype.slice.call(box.children).forEach(function (c) { if (c !== head) c.remove(); });
		var L = toolLayout(); box.classList.toggle("pe-tools--arr", arranging);
		var ab = $("pe-tarr"); if (ab) { ab.setAttribute("aria-pressed", arranging ? "true" : "false"); ab.textContent = arranging ? "✓ Done" : "⚙"; ab.title = arranging ? "Finish arranging" : "Arrange the tools: drag to reorder, group, hide"; }
		L.groups.forEach(function (g) {
			var gw = el("div", "pe-tgrp" + (g.open ? "" : " is-closed")); gw.dataset.g = g.id; gw.setAttribute("role", "group"); gw.setAttribute("aria-label", g.name);
			var gh = el("div", "pe-tgh"), fold = el("button", "pe-tgfold"); fold.type = "button"; fold.setAttribute("aria-expanded", g.open ? "true" : "false"); fold.title = (g.open ? "Fold " : "Open ") + g.name; fold.innerHTML = '<span class="pe-tgar" aria-hidden="true">' + (g.open ? "▾" : "▸") + '</span><span class="pe-tgn">' + esc(g.name) + "</span>" + (g.open ? "" : '<span class="pe-tgc">' + g.tools.length + "</span>");
			fold.addEventListener("click", function () { var L2 = toolLayout(); L2.groups.forEach(function (x) { if (x.id === g.id) x.open = !x.open; }); saveLayout(L2); }); gh.appendChild(fold);
			if (arranging) {
				var rn = el("button", "pe-tgbtn", "✎"); rn.type = "button"; rn.title = "Rename this group"; rn.setAttribute("aria-label", "Rename group " + g.name); rn.addEventListener("click", function () { var n = window.prompt("Group name", g.name); if (n == null || !n.trim()) return; var L2 = toolLayout(); L2.groups.forEach(function (x) { if (x.id === g.id) x.name = n.trim().slice(0, 40); }); saveLayout(L2); }); gh.appendChild(rn);
				if (L.groups.length > 1) { var dl = el("button", "pe-tgbtn", "🗑"); dl.type = "button"; dl.title = "Delete this group (its tools move to the group above)"; dl.setAttribute("aria-label", "Delete group " + g.name); dl.addEventListener("click", function () { var L2 = toolLayout(), i = L2.groups.map(function (x) { return x.id; }).indexOf(g.id), to = L2.groups[i > 0 ? i - 1 : 1]; to.tools = to.tools.concat(L2.groups[i].tools); L2.groups.splice(i, 1); saveLayout(L2); }); gh.appendChild(dl); }
				gh.addEventListener("dragover", function (e) { if (!tdrag) return; e.preventDefault(); clearMarks(); gh.classList.add("is-over-into"); });
				gh.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); var src = tdrag; tdrag = null; saveLayout(P.moveTool(toolLayout(), src, g.id, -1)); });
			}
			gw.appendChild(gh);
			if (g.open || arranging) g.tools.forEach(function (id) { gw.appendChild(toolRow(id)); });
			if (arranging && !g.tools.length) { var em = el("div", "pe-tgempty", "Drop tools here"); em.addEventListener("dragover", function (e) { if (tdrag) e.preventDefault(); }); em.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); var src = tdrag; tdrag = null; saveLayout(P.moveTool(toolLayout(), src, g.id, -1)); }); gw.appendChild(em); }
			box.appendChild(gw);
		});
		if (arranging) {
			var hw = el("div", "pe-tgrp pe-tgrp--hidden"); hw.dataset.g = "hidden"; hw.appendChild(el("div", "pe-tgh", '<span class="pe-tgn">Hidden tools (' + L.hidden.length + ")</span>"));
			L.hidden.forEach(function (id) { var t = PE.tools[id], r = el("div", "pe-trow is-arr"), sb = el("button", "pe-tool"); sb.type = "button"; sb.title = "Show " + t.name + " again"; sb.innerHTML = '<span class="pe-ticon">' + esc(t.icon) + '</span><span class="pe-tname">' + esc(t.name.replace(/ \(.*\)$/, "")) + "</span>"; sb.addEventListener("click", function () { saveLayout(P.moveTool(toolLayout(), id, toolLayout().groups[0].id, -1)); }); var sh = el("button", "pe-thide", "＋"); sh.type = "button"; sh.title = "Show this tool again"; sh.setAttribute("aria-label", "Show " + t.name); sh.addEventListener("click", function () { sb.click(); }); r.appendChild(sb); r.appendChild(sh); hw.appendChild(r); });
			hw.addEventListener("dragover", function (e) { if (tdrag) e.preventDefault(); }); hw.addEventListener("drop", function (e) { if (!tdrag) return; e.preventDefault(); var src = tdrag; tdrag = null; saveLayout(P.moveTool(toolLayout(), src, "hidden")); });
			box.appendChild(hw);
			var acts = el("div", "pe-tacts"), ng = el("button", "pe-btn pe-btn--sm", "+ New group"), rs = el("button", "pe-btn pe-btn--sm", "Reset"); ng.type = rs.type = "button"; ng.title = "Add an empty group: drag tools into it"; rs.title = "Back to the standard tool groups, nothing hidden";
			ng.addEventListener("click", function () { var n = window.prompt("Name of the new group", "My tools"); if (n == null || !n.trim()) return; var L2 = toolLayout(); L2.groups.push({ id: "u" + Date.now().toString(36), name: n.trim().slice(0, 40), open: true, tools: [] }); saveLayout(L2); });
			rs.addEventListener("click", function () { if (!window.confirm("Put every tool back in the standard groups and show the hidden ones?")) return; UI.tl = null; saveUI(); drawTools(); });
			acts.appendChild(ng); acts.appendChild(rs); box.appendChild(acts); box.appendChild(el("p", "pe-thint", "Drag a tool up or down, onto a group's name or into another group. ✕ hides it (its keyboard key still works). On a keyboard: Alt+↑ / Alt+↓."));
		}
	}
	PE.drawTools = drawTools;
	function buildTools() {
		var box = $("pe-tools"); box.innerHTML = "";
		initLayoutUI();
		var ab = el("button", "pe-tarr", "⚙"); ab.type = "button"; ab.id = "pe-tarr"; ab.addEventListener("click", function () { arranging = !arranging; if (arranging && !UI.tw) { UI.tw = true; saveUI(); applyUI(); } drawTools(); }); box.querySelector(".pe-thead").appendChild(ab);
		drawTools();
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
			if (u.type === "check") { inp = el("input"); inp.type = "checkbox"; inp.checked = !!v; inp.addEventListener("change", function () { PE.optSet(id, u.k, inp.checked); rebuildOpts(); }); }
			else if (u.type === "select") { inp = el("select"); var opts = u.options === "fonts" ? PE.FONTS : u.options; opts.forEach(function (o) { var op = el("option", null, esc(o[1])); op.value = o[0]; inp.appendChild(op); }); inp.value = v; inp.addEventListener("change", function () { PE.optSet(id, u.k, u.num ? +inp.value : inp.value); rebuildOpts(); }); }
			else if (u.type === "seg") { inp = el("span", "pe-seg"); u.options.forEach(function (o) { var b = el("button", null, esc(o[1])); b.type = "button"; b.setAttribute("aria-pressed", String(v) === String(o[0]) ? "true" : "false"); b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.addEventListener("click", function () { PE.optSet(id, u.k, o[0]); rebuildOpts(); }); inp.appendChild(b); }); }
			else if (u.type === "color") { inp = el("input"); inp.type = "color"; inp.dataset.ck = "opt:" + id + ":" + u.k; inp.dataset.cname = u.label; inp.value = v; inp.addEventListener("input", function () { PE.optSet(id, u.k, inp.value); });
				// 💉 next to the well: pick this option's colour from the picture (drag with a magnifier, applied on release)
				var dp = el("button", "pe-mini pe-dropbtn", "💉"); dp.type = "button"; dp.title = "Pick " + u.label.toLowerCase() + " from the picture: press and drag over it, let go to use the colour"; dp.setAttribute("aria-label", dp.title);
				dp.addEventListener("mousedown", function (e) { e.preventDefault(); }); dp.addEventListener("click", function () { if (!needDoc()) return; PE.pickColorFromImage({ label: u.label, apply: function (hex) { PE.optSet(id, u.k, hex); rebuildOpts(); } }); });
				w.appendChild(inp); w.appendChild(dp); var hq3 = optHelp(u); if (hq3) w.appendChild(hq3); box.appendChild(w); return; }
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
	function rebuildOpts() { buildOpts(); if (PE.textEditing && PE.textEditing()) setTimeout(PE.focusText, 0); }   // a change in the option bar while typing: keep typing into the text
	var OPTHELP = { "Hardness": "How sharp the edge of the brush is. 100% is a crisp hard circle; lower values fade softly towards the edge, like an airbrush.", "Opacity": "How see-through the paint is. 100% covers fully; 30% lets what is underneath show through. Overlapping strokes in one drag do not stack.", "Smoothing": "Steadies a shaky hand: the brush lags a little behind the pointer and draws smoother curves. 0% = follows the pointer exactly.", "Pen pressure": "With a drawing tablet or pen, pressing harder makes the stroke bigger. Has no effect with a mouse.", "Tolerance": "How different a colour can be and still count as the same area. Low = only almost identical colours; high = spreads into similar colours.", "Strength": "How strong the effect is each time you paint over it.", "Aligned": "On: the copy source moves along with your brush. Off: every stroke starts again from the same source point.", "Contiguous": "On: only connected areas are filled. Off: every matching colour in the whole layer.", "Sample all layers": "Look at the merged picture instead of only the selected layer when deciding what is the same colour.", "Pick the layer under the click": "On: clicking a letter or shape picks the layer that is actually showing there, so the selection (and a following Delete) acts on that layer and not on the picture behind it. Off: always use the selected layer.", "Box width (0 = auto)": "How wide the text box is before words wrap onto the next line. 0 = as wide as the text needs (up to the image width). You can also drag the purple handles on the left and right edges of the text box (Text tool or Move tool).", "Auto-fit text": "On: the font size changes by itself so the text fills the box. Drag the box's edges or corners (purple handles) and the words re-wrap and grow or shrink to fit. Off: dragging the box's sides only re-wraps the words, and the box is as tall as the text.", "Box height": "With Auto-fit text: how tall the text box is. The font size is the largest one that fits the box's width and height.", "Underline": "Underlines the text. While you are typing in a text, Ctrl/Cmd+U (and B, I) changes only the selected letters; with nothing selected, the whole text.", "Outline width": "How thick the outline around the letters is. 0 = no outline.", "Letter spacing": "Extra space between letters (negative = tighter).", };
	function optHelp(u) { var t = u.help || OPTHELP[u.label]; return t ? PE.helpBtn(u.label, esc(t)) : null; }
	function fmtV(v, u) { return (u.step < 1 ? (+v).toFixed(2) : Math.round(v)) + (u.unit || ""); }
	var optsTimer = 0; PE.on("opts", function (id) { if (id === PE.toolId) { clearTimeout(optsTimer); optsTimer = setTimeout(function () { if (!document.activeElement || document.activeElement.type !== "range") buildOpts(); }, 10); } sset({ opt: PE.opt }); });
	PE.on("active", function () { if (PE.toolId === "text") buildOpts(); });
	PE.on("fonts", buildOpts);

	/* ---------- colour panel ---------- */
	function buildColor() {
		var box = $("pe-colors"); box.innerHTML = "";
		var sw = el("div", "pe-sw"), bgb = el("label", "pe-sw-bg"), fgb = el("label", "pe-sw-fg"); bgb.style.background = PE.bg; fgb.style.background = PE.fg; bgb.title = "Background colour"; fgb.title = "Foreground colour (brush, shapes, text outline)";
		var fi = el("input"); fi.type = "color"; fi.dataset.ck = "fg"; fi.dataset.cname = "Foreground colour"; fi.value = PE.fg; fi.addEventListener("input", function () { PE.fg = fi.value; fgb.style.background = fi.value; hexIn.value = fi.value; PE.emit("color-live"); }); fi.addEventListener("change", function () { PE.setFg(fi.value); });
		var bi = el("input"); bi.type = "color"; bi.dataset.ck = "bg"; bi.dataset.cname = "Background colour"; bi.value = PE.bg; bi.addEventListener("input", function () { PE.bg = bi.value; bgb.style.background = bi.value; }); bi.addEventListener("change", function () { PE.setBg(bi.value); });
		fgb.appendChild(fi); bgb.appendChild(bi); sw.appendChild(bgb); sw.appendChild(fgb);
		var swap = el("button", "pe-mini", "⇄"); swap.type = "button"; swap.title = "Swap colours (X)"; swap.addEventListener("click", swapColors); var def = el("button", "pe-mini", "◐"); def.type = "button"; def.title = "Default colours: black and white (D)"; def.addEventListener("click", function () { PE.fg = "#000000"; PE.bg = "#ffffff"; PE.emit("color"); });
		var hexIn = el("input", "pe-hex"); hexIn.value = PE.fg; hexIn.maxLength = 7; hexIn.title = "Foreground colour hex"; hexIn.addEventListener("change", function () { var h = hexIn.value.trim(); if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) { if (h[0] !== "#") h = "#" + h; if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; PE.setFg(h.toLowerCase()); } else hexIn.value = PE.fg; });
		var drop = el("button", "pe-mini pe-dropbtn", "💉"); drop.type = "button"; drop.title = "Pick the foreground colour from the picture: press and drag over it (a magnifier shows the pixels), let go to use the colour. Alt = background colour. (I)"; drop.setAttribute("aria-label", "Pick a colour from the picture");
		drop.addEventListener("click", function (e) { if (!needDoc()) return; var bgPick = e.altKey; PE.pickColorFromImage({ label: bgPick ? "background colour" : "foreground colour", apply: function (hex, alt) { (bgPick || alt) ? PE.setBg(hex) : PE.setFg(hex); } }); });
		var top = el("div", "pe-col-top"); top.appendChild(sw); var bt = el("div", "pe-col-b"); bt.appendChild(swap); bt.appendChild(def); bt.appendChild(drop); bt.appendChild(hexIn); top.appendChild(bt); box.appendChild(top);
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
	/* the canvas side of a multi-selection (Move tool: rubber band, Shift / Ctrl-click): ids = every picked layer; fewer than two = back to just the active layer */
	PE.setMulti = function (ids) { multi = {}; if (ids && ids.length > 1) { ids.forEach(function (id) { multi[id] = true; }); var A = PE.active(); if (!A || !multi[A.id]) { PE.setActive(ids[ids.length - 1]); return; } } buildLayers(); PE.invalidateOverlay(); };
	/* add a layer to the Move tool's selection, or take it out; returns true when it is now picked */
	PE.toggleMove = function (L) {
		var cur = PE.moveSet ? PE.moveSet() : PE.multi(), ids = cur.map(function (x) { return x.id; }), i = ids.indexOf(L.id);
		if (i >= 0) { if (ids.length < 2) return true; ids.splice(i, 1); if (PE.active() === L) PE.doc.activeId = ids[ids.length - 1]; PE.setMulti(ids); if (ids.length === 1) PE.setActive(ids[0]); return false; }
		ids.push(L.id); PE.doc.activeId = L.id; PE.setMulti(ids); PE.emit("active"); return true;
	};
	function rowsTopDown() {
		var d = PE.doc, q = lfilter.trim().toLowerCase(), out = [];
		d.layers.slice().reverse().forEach(function (L) {
			var anc = PE.ancestorsOf(L); if (!q && anc.some(function (a) { return a.collapsed; })) return;
			if (q) { var hit = L.name.toLowerCase().indexOf(q) >= 0 || (PE.isGroup(L) && PE.descendants(L).some(function (k) { return k.name.toLowerCase().indexOf(q) >= 0; })); if (!hit) return; }
			out.push({ L: L, depth: anc.length });
		});
		return out;
	}
	function renameLayer(id) {
		var nm = $("pe-layers").querySelector('.pe-layer[data-id="' + id + '"] .pe-lname'); if (nm) nm.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
	}
	root.addEventListener("keydown", function (e) { if (e.key === "F2" && PE.doc && PE.active() && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); renameLayer(PE.active().id); } });
	/* The list is reconciled, not rebuilt: a row whose layer did not change (name, visibility, selection, depth, pixels...) keeps its DOM node, so moving a
	 * layer up / down only moves rows. Rebuilding every row on every step made the list flash, and fought with page-zoom / text-size extensions that
	 * restyle new elements a moment after they appear. Handlers look the layer up by id at click time (undo / redo replace the layer objects). */
	var rowCache = {};
	function rowSig(L, r, on) { return [L.name, L.type, L.visible, PE.effVisible(L), on ? 1 : 0, r.depth, L.collapsed, L.locked, L.mask ? 1 : 0, L.editMask ? 1 : 0, L.maskOff ? 1 : 0, L.viewMask ? 1 : 0, PE.hasFx(L) ? 1 : 0, L.crop ? 1 : 0, L.rev, L.canvas.width, L.canvas.height, PE.isGroup(L) ? PE.descendants(L).filter(function (k) { return !PE.isGroup(k); }).length : -1].join("|"); }
	function makeRow(id, depth, on) {
		var L0 = PE.layerById(id), grp = PE.isGroup(L0), hidden = !PE.effVisible(L0) && !grp ? true : !L0.visible, cur = function () { return PE.layerById(id); };
		var row = el("div", "pe-layer" + (on ? " is-active" : "") + (hidden ? " is-hidden" : "") + (grp ? " is-group" : "")); row.draggable = true; row.dataset.id = id; row.style.paddingLeft = (0.3 + depth * 1.1) + "em";
		var eye = el("button", "pe-eye", L0.visible ? "👁" : "—"); eye.type = "button"; eye.title = "Show / hide"; eye.addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (!L) return; L.visible = !L.visible; PE.touch(L); PE.commit("Toggle visibility"); });
		row.appendChild(eye);
		if (grp) { var ar = el("button", "pe-arrow", L0.collapsed ? "▸" : "▾"); ar.type = "button"; ar.title = L0.collapsed ? "Expand group" : "Collapse group"; ar.addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (!L) return; L.collapsed = !L.collapsed; buildLayers(); }); row.appendChild(ar); var th0 = el("span", "pe-th pe-th--grp", "📁"); row.appendChild(th0); }
		else { var th = el("span", "pe-th" + (L0.mask && !L0.editMask ? " is-paint" : "")); th.appendChild(thumbFor(L0)); if (L0.mask) th.title = L0.editMask ? "Click to paint on the picture again" : "You are painting on the picture"; row.appendChild(th); }
		var nm = el("span", "pe-lname", esc(L0.name) + (L0.type === "text" ? " ᵀ" : "") + (grp ? ' <small class="pe-cnt">' + PE.descendants(L0).filter(function (k) { return !PE.isGroup(k); }).length + "</small>" : "")); nm.title = L0.name + " (double-click to rename)";
		if (L0.mask) {
			var mt = el("span", "pe-th pe-th--mask" + (L0.editMask ? " is-on is-paint" : "") + (L0.maskOff ? " is-off" : "") + (L0.viewMask ? " is-view" : "")); mt.appendChild(PE.maskView ? (function () { var c = PE.mk(36, 36), x = c.getContext("2d"), v = PE.maskView(L0), sc = Math.min(36 / v.width, 36 / v.height); x.fillStyle = "#3a3a44"; x.fillRect(0, 0, 36, 36); x.drawImage(v, (36 - v.width * sc) / 2, (36 - v.height * sc) / 2, v.width * sc, v.height * sc); return c; })() : el("span"));
			mt.title = "Layer mask (white = shown, black = hidden). " + (L0.editMask ? "You are painting on the mask: black hides, white shows." : "Click to paint on the mask.") + " Shift-click: switch the mask " + (L0.maskOff ? "on again" : "off for a moment") + ". Alt-click: " + (L0.viewMask ? "back to the picture" : "see the mask itself") + ".";
			mt.setAttribute("role", "button"); mt.tabIndex = 0; mt.setAttribute("aria-label", "Layer mask of " + L0.name + (L0.editMask ? ", being painted" : ""));
			var mclick = function (e) { e.stopPropagation(); var L = cur(); if (!L) return; PE.setActive(id); if (e.shiftKey) { L.maskOff = !L.maskOff; L.rev++; PE.commit(L.maskOff ? "Switch mask off" : "Switch mask on"); return; } if (e.altKey) { L.viewMask = !L.viewMask; delete rowCache[id]; PE.invalidate(); buildLayers(); return; } L.editMask = true; delete rowCache[id]; buildLayers(); PE.emit("paintTarget"); };
			mt.addEventListener("click", mclick); mt.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mclick(e); } });
			row.querySelector(".pe-th").addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (!L) return; PE.setActive(id); L.editMask = false; L.viewMask = false; delete rowCache[id]; PE.invalidate(); buildLayers(); PE.emit("paintTarget"); }); row.appendChild(mt);
		}
		row.appendChild(nm);
		if (grp) { var xg = el("button", "pe-pen", "⬇"); xg.type = "button"; xg.title = "Export this group as its own image, on a canvas of any size"; xg.addEventListener("click", function (e) { e.stopPropagation(); var L = cur(); if (L) PE.dlgExportGroup(L); }); row.appendChild(xg); }
		if (!grp) { var fxb = el("button", "pe-pen pe-fxb" + (PE.hasFx(L0) ? " is-on" : ""), "fx"); fxb.type = "button"; fxb.title = PE.hasFx(L0) ? "Layer style (outline / shadow) is on: click to change it" : "Add an outline or shadow (layer style)"; fxb.setAttribute("aria-label", "Layer style of " + L0.name); fxb.addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(id); PE.dlgLayerStyle(cur()); }); row.appendChild(fxb);
			if (L0.crop) { var cb = el("button", "pe-pen pe-cropb is-on", "⛶"); cb.type = "button"; cb.title = "This layer is cropped (its edges are hidden, not deleted): click to change the crop"; cb.setAttribute("aria-label", "Change the crop of " + L0.name); cb.addEventListener("click", function (e) { e.stopPropagation(); PE.setActive(id); PE.setTool("layercrop"); }); row.appendChild(cb); } }
		var pen = el("button", "pe-pen", "✎"); pen.type = "button"; pen.title = "Rename"; pen.addEventListener("click", function (e) { e.stopPropagation(); renameLayer(id); }); row.appendChild(pen);
		if (L0.locked) row.appendChild(el("span", "pe-lock", "🔒"));
		row.addEventListener("click", function (e) {
			var L = cur(), act = PE.active(); if (!L) return;
			if (e.ctrlKey || e.metaKey) { multi[id] = !multi[id]; if (!Object.keys(multi).some(function (k) { return multi[k]; })) multi = {}; else multi[act ? act.id : id] = true; buildLayers(); PE.invalidateOverlay(); return; }
			if (e.shiftKey && act) { var order = rowsTopDown().map(function (x) { return x.L; }), i0 = order.indexOf(act), i1 = order.indexOf(L); if (i0 >= 0 && i1 >= 0) { multi = {}; order.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).forEach(function (x) { multi[x.id] = true; }); buildLayers(); PE.invalidateOverlay(); return; } }
			multi = {}; PE.setActive(id); PE.invalidateOverlay();
		});
		nm.addEventListener("dblclick", function (e) {
			e.stopPropagation(); var L = cur(); if (!L) return; var inp = el("input", "pe-rename"), fin = false; inp.type = "text"; inp.value = L.name; inp.spellcheck = false; inp.setAttribute("aria-label", "New name for " + (grp ? "the group " : "the layer ") + L.name); row.draggable = false; row.classList.add("is-renaming"); nm.replaceWith(inp); inp.focus(); inp.select();
			var done = function (ok) { if (fin) return; fin = true; row.classList.remove("is-renaming"); var v = inp.value.trim(), L2 = cur(); delete rowCache[id]; if (ok && L2 && v && v !== L2.name) { L2.name = v; PE.commit(grp ? "Rename group" : "Rename layer"); } else buildLayers(); };
			// clicks inside the box must not reach the row: its click selects the layer, which rebuilds the list and threw the half-typed name away
			["click", "mousedown", "pointerdown", "dblclick", "dragstart"].forEach(function (t) { inp.addEventListener(t, function (ev) { ev.stopPropagation(); }); });
			inp.addEventListener("keydown", function (ev) { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); done(true); } if (ev.key === "Escape") { ev.preventDefault(); done(false); } }); inp.addEventListener("blur", function () { done(true); });
		});
		row.addEventListener("contextmenu", function (e) { e.preventDefault(); var L = cur(); if (!L) return; if (PE.active() !== L) PE.setActive(id); layerMenu(L, e.clientX, e.clientY); });
		row.addEventListener("dragstart", function (e) { dragId = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pe-layer", String(id)); });
		function zoneOf(e) { var rc = row.getBoundingClientRect(), y = (e.clientY - rc.top) / rc.height; return grp ? (y < 0.25 ? "above" : "into") : (y < 0.5 ? "above" : "below"); }
		row.addEventListener("dragover", function (e) { if (dragId == null) return; e.preventDefault(); row.classList.remove("is-over-above", "is-over-below", "is-over-into"); row.classList.add("is-over-" + zoneOf(e)); });
		row.addEventListener("dragleave", function () { row.classList.remove("is-over-above", "is-over-below", "is-over-into"); });
		row.addEventListener("drop", function (e) { if (dragId == null) return; e.preventDefault(); e.stopPropagation(); row.classList.remove("is-over-above", "is-over-below", "is-over-into"); var src = PE.layerById(dragId), z = zoneOf(e), L = cur(); dragId = null; if (src && L && src !== L) PE.relocate(src, L, z); });
		return row;
	}
	/* a small menu at the pointer (right-click on a layer, the Mask button) */
	function popMenu(items, x, y) {
		var old = root.querySelector(".pe-cmenu"); if (old) old.remove(); var m = el("div", "pe-cmenu pe-pop"); m.setAttribute("role", "menu");
		items.forEach(function (it) { if (it === "-") { m.appendChild(el("div", "pe-sep")); return; } var b = el("button", "pe-item", "<span>" + esc(it.label) + "</span>"); b.type = "button"; b.setAttribute("role", "menuitem"); if (it.dis) b.disabled = true; b.addEventListener("click", function () { m.remove(); it.act(); }); m.appendChild(b); });
		root.appendChild(m); var rr = root.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(4, Math.min(x - rr.left, rr.width - w - 4)) + "px"; m.style.top = Math.max(4, Math.min(y - rr.top, rr.height - h - 4)) + "px";
		var f = m.querySelector("button:not(:disabled)"); if (f) f.focus();
		var off = function (e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", esck, true); } }, esck = function (e) { if (e.key === "Escape") { e.stopPropagation(); m.remove(); document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", esck, true); } };
		setTimeout(function () { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", esck, true); }, 0);
	}
	PE.popMenu = popMenu;
	function maskItems(L) {
		if (!L.mask) return [{ label: "◑ Add layer mask", act: function () { PE.addMask(L, true); } }, { label: "? How layer masks work", act: PE.maskHelp }];
		return [{ label: (L.editMask ? "✓ " : "") + "Paint on the mask", act: function () { L.editMask = true; L.viewMask = false; PE.invalidate(); buildLayers(); PE.emit("paintTarget"); } }, { label: (!L.editMask ? "✓ " : "") + "Paint on the picture", act: function () { L.editMask = false; L.viewMask = false; PE.invalidate(); buildLayers(); PE.emit("paintTarget"); } },
			{ label: (L.viewMask ? "✓ " : "") + "Show the mask itself (black and white)", act: function () { L.viewMask = !L.viewMask; PE.invalidate(); buildLayers(); } }, { label: L.maskOff ? "Switch the mask on again" : "Switch the mask off for now", act: function () { L.maskOff = !L.maskOff; L.rev++; PE.commit(L.maskOff ? "Switch mask off" : "Switch mask on"); } },
			"-", { label: "Apply mask (make the hiding permanent)", act: function () { PE.applyMask(L); } }, { label: "Delete mask (show the whole layer)", act: function () { PE.deleteMask(L); } }, "-", { label: "? How layer masks work", act: PE.maskHelp }];
	}
	function layerMenu(L, x, y) {
		var grp = PE.isGroup(L), items = [{ label: "✎ Rename", act: function () { renameLayer(L.id); } }, { label: "⧉ Duplicate", act: function () { PE.duplicateLayer(L); } }];
		if (!grp) items = items.concat(["-", { label: "fx Layer style: outline, shadow, glow…", act: function () { PE.dlgLayerStyle(L); } }, { label: "⛶ Crop this layer (hide edges)", act: function () { PE.setTool("layercrop"); } }]);
		if (!grp && L.crop) items.push({ label: "Show the whole layer (uncrop)", act: function () { PE.clearLayerCrop(L); } });
		if (!grp) items = items.concat(["-"], maskItems(L));
		items = items.concat(["-", { label: L.locked ? "🔓 Unlock" : "🔒 Lock", act: function () { L.locked = !L.locked; PE.commit(L.locked ? "Lock layer" : "Unlock layer"); } }, { label: "🗑 Delete layer", act: function () { PE.deleteLayer(); } }]);
		popMenu(items, x, y);
	}
	function buildLayers() {
		var list = $("pe-layers"), d = PE.doc; if (!d) { list.innerHTML = ""; rowCache = {}; return; } var act = PE.active(), rows = rowsTopDown(); PE.relink();
		if (list.querySelector(".is-renaming")) return;   // never pull a half-typed name out from under the keyboard
		var keep = {}, at = 0;
		rows.forEach(function (r) {
			var L = r.L, on = L === act || multi[L.id], sig = rowSig(L, r, on), c = rowCache[L.id];
			if (!c || c.sig !== sig) { c = rowCache[L.id] = { sig: sig, row: makeRow(L.id, r.depth, on) }; }
			keep[L.id] = 1; var node = list.children[at];
			if (node !== c.row) list.insertBefore(c.row, node || null);
			at++;
		});
		while (list.children.length > at) list.removeChild(list.lastChild);
		for (var k in rowCache) if (!keep[k]) delete rowCache[k];
		syncLayerProps();
	}
	$("pe-layers").addEventListener("dragover", function (e) { if (dragId != null) e.preventDefault(); });
	$("pe-layers").addEventListener("dragend", function () { dragId = null; Array.prototype.forEach.call($("pe-layers").querySelectorAll(".is-over-above,.is-over-below,.is-over-into"), function (r) { r.classList.remove("is-over-above", "is-over-below", "is-over-into"); }); });
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
	var histRows = new WeakMap();   // one button per history step, kept between updates (only the new step is added, the rest just change class)
	function buildHistory() {
		var list = $("pe-history"), H = PE.hist, at = 0, act = null;
		H.stack.forEach(function (e, i) {
			var r = histRows.get(e); if (!r) { r = el("button", "pe-hrow", esc(e.label)); r.type = "button"; r.addEventListener("click", function () { var j = PE.hist.stack.indexOf(e); if (j >= 0) PE.gotoHistory(j); }); histRows.set(e, r); }
			var cls = "pe-hrow" + (i === H.idx ? " is-active" : "") + (i > H.idx ? " is-future" : ""); if (r.className !== cls) r.className = cls; if (i === H.idx) act = r;
			var node = list.children[at]; if (node !== r) list.insertBefore(r, node || null); at++;
		});
		while (list.children.length > at) list.removeChild(list.lastChild);
		if (act) act.scrollIntoView({ block: "nearest" });
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
	lbtn("pe-lrename", function () { var L = PE.active(); if (L) renameLayer(L.id); }); lbtn("pe-lnew", function () { PE.newRasterLayer(); }); lbtn("pe-lfill", function () { PE.dlgFillLayer(); }); lbtn("pe-lgroup", function () { groupSelected(); }); lbtn("pe-ldup", function () { PE.duplicateLayer(); }); lbtn("pe-ldel", function () { PE.deleteLayer(); }); lbtn("pe-lmerge", function () { PE.mergeDown(); });
	lbtn("pe-lock", function () { var L = PE.active(); L.locked = !L.locked; PE.commit(L.locked ? "Lock layer" : "Unlock layer"); });
	lbtn("pe-mask-btn", function () { var L = PE.active(); if (!L) return; if (!L.mask) { PE.addMask(L, true); return; } var r = $("pe-mask-btn").getBoundingClientRect(); popMenu(maskItems(L), r.left, r.bottom + 4); });
	$("pe-mask-help").addEventListener("click", function () { PE.maskHelp(); });
	lbtn("pe-lstyle", function () { PE.dlgLayerStyle(); }); lbtn("pe-lcrop", function () { var L = PE.active(); if (!L || PE.isGroup(L)) { PE.toast("Select a layer (not a group) to crop"); return; } PE.setTool("layercrop"); });
	/* the Layers list: Fill the side column (other panels fold away), a big floating Layers window over the picture, or drag the grip under the list for any height */
	(function () {
		var panel = root.querySelector(".pe-panel--layers"), home = panel.parentNode, next = panel.nextSibling, side = $("pe-side"), list = $("pe-layers"), grip = $("pe-lgrip"), fl = null;
		function apply() {
			side.classList.toggle("pe-side--lfill", UI.lmode === "fill"); list.style.height = UI.lmode === "fill" || UI.lmode === "big" ? "" : (UI.lh ? UI.lh + "px" : ""); panel.classList.toggle("pe-panel--lsized", !!UI.lh && !UI.lmode);
			$("pe-lfillbtn").setAttribute("aria-pressed", UI.lmode === "fill" ? "true" : "false"); $("pe-lbigbtn").setAttribute("aria-pressed", UI.lmode === "big" ? "true" : "false"); $("pe-lbigbtn").textContent = UI.lmode === "big" ? "✕ Close" : "⤢ Big";
			if (UI.lmode === "big" && !fl) { fl = el("div", "pe-lfloat"); fl.setAttribute("role", "dialog"); fl.setAttribute("aria-label", "Layers"); PE.els.stage.appendChild(fl); fl.appendChild(panel); }
			if (UI.lmode !== "big" && fl) { home.insertBefore(panel, next); fl.remove(); fl = null; }
		}
		$("pe-lfillbtn").addEventListener("click", function () { UI.lmode = UI.lmode === "fill" ? "" : "fill"; if (UI.lmode && UI.hide) { UI.hide = false; applyUI(); } saveUI(); apply(); });
		$("pe-lbigbtn").addEventListener("click", function () { UI.lmode = UI.lmode === "big" ? "" : "big"; saveUI(); apply(); });
		if (UI.lmode === "big") UI.lmode = "";   // the big Layers window is for now only: a reload starts with the normal list
		document.addEventListener("keydown", function (e) { if (e.key === "Escape" && UI.lmode === "big" && fl && fl.contains(document.activeElement) && document.activeElement.tagName !== "INPUT") { UI.lmode = ""; saveUI(); apply(); } });
		grip.addEventListener("pointerdown", function (e) { if (e.button > 0 || UI.lmode) return; e.preventDefault(); grip.setPointerCapture(e.pointerId); var y0 = e.clientY, h0 = list.getBoundingClientRect().height;
			var mv = function (ev) { UI.lh = Math.round(P.clamp(h0 + ev.clientY - y0, 80, 3000)); list.style.height = UI.lh + "px"; panel.classList.add("pe-panel--lsized"); }, up = function () { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); saveUI(); }; grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); });
		grip.addEventListener("dblclick", function () { UI.lh = 0; saveUI(); apply(); });
		grip.addEventListener("keydown", function (e) { if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault(); UI.lh = Math.round(P.clamp((UI.lh || list.getBoundingClientRect().height) + (e.key === "ArrowDown" ? 40 : -40), 80, 3000)); saveUI(); apply(); });
		apply();
	})();

	/* ---------- status + zoom ---------- */
	function status() { var d = PE.doc; $("pe-st-doc").textContent = d ? d.w + " × " + d.h + " px" : "No image"; $("pe-zoom").textContent = Math.round(PE.view.zoom * 100) + "%"; var L = PE.active(); $("pe-st-layer").textContent = L ? L.name + " · " + L.canvas.width + "×" + L.canvas.height + (L.mask && !PE.isGroup(L) ? (L.editMask ? " · painting on the MASK" : " · painting on the picture") : "") + (L.crop ? " · cropped" : "") : ""; }
	PE.on("paintTarget", status); PE.on("active", status);
	PE.on("view", status); PE.on("docsize", status); PE.on("layers", status); PE.on("pointer", function (p) { $("pe-st-xy").textContent = Math.floor(p.x) + ", " + Math.floor(p.y); });
	PE.on("cropinfo", function (c) { $("pe-st-xy").textContent = "crop " + c.w + " × " + c.h; });
	PE.on("docsize", function () { $("pe-empty").hidden = !!PE.doc; });
	PE.on("sel", function () { var b = PE.sel && PE.selBounds(); $("pe-st-sel").textContent = b ? "Selection " + b.w + " × " + b.h : ""; });
	$("pe-zoom").addEventListener("click", function () { PE.view.zoom === 1 ? PE.fit() : PE.setZoom(1); });
	$("pe-zin").addEventListener("click", function () { PE.setZoom(PE.view.zoom * 1.25); }); $("pe-zout").addEventListener("click", function () { PE.setZoom(PE.view.zoom / 1.25); });
	$("pe-fit").addEventListener("click", function () { PE.fit(); }); $("pe-undo").addEventListener("click", function () { PE.undo(); }); $("pe-redo").addEventListener("click", function () { PE.redo(); }); $("pe-export").addEventListener("click", function () { PE.dlgExport(); }); $("pe-copy").addEventListener("click", function () { if (needDoc()) copyMerged(); });
$("pe-share").addEventListener("click", function () { if (needDoc()) PE.dlgShare(); }); $("pe-save").addEventListener("click", function () { saveProject(); });

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
	function paintClipboardImage(src, name, at, clip) { var meta = { how: "paste", clip: clip || "clipboard" }; if (!PE.doc) { PE.openImageSource(src, name || "Pasted image", meta); PE.setTool("move"); return; } PE.placeSource(src, name || "Pasted", at, meta); PE.setTool("move"); }
	function pasteInternal() { if (PE.clipCanvas) paintClipboardImage(PE.clipCanvas, "Pasted layer", null, "editor"); else if (navigator.clipboard && navigator.clipboard.read) { navigator.clipboard.read().then(function (items) { for (var i = 0; i < items.length; i++) { var t = items[i].types.filter(function (t) { return /^image\//.test(t); })[0]; if (t) { items[i].getType(t).then(function (b) { return PE.decodeFile(b); }).then(function (im) { paintClipboardImage(im, "Pasted image"); }); return; } } PE.toast("Nothing to paste"); }).catch(function () { PE.toast("Use Ctrl+V to paste an image"); }); } else PE.toast("Use Ctrl+V to paste an image"); }
	document.addEventListener("paste", function (e) {
		if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "") || PE.modalOpen()) return; var items = (e.clipboardData && e.clipboardData.items) || [];
		var gf = []; for (var j = 0; j < items.length; j++) if (items[j].kind === "file") { var ff = items[j].getAsFile(); if (ff && /\.xcf$/i.test(ff.name)) gf.push(ff); }
		if (gf.length) { e.preventDefault(); openFiles(gf, { place: !!PE.doc, how: "paste" }); return; }   // a GIMP file copied in the file manager
		for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); e.preventDefault(); PE.decodeFile(f).then(function (im) { paintClipboardImage(im, "Pasted image"); }).catch(function () { PE.toast("Can't read that image"); }); return; }
		var tx = e.clipboardData && e.clipboardData.getData("text/plain"); if (tx && PE.looksLikeLatex(tx)) { e.preventDefault(); PE.dlgEquation(null, null, tx.trim().replace(/^\$+|\$+$/g, "")); return; }
		if (PE.clipCanvas) { e.preventDefault(); paintClipboardImage(PE.clipCanvas, "Pasted layer", null, "editor"); }
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
	function loadPsd(buf, name, meta) {
		return loadScript("https://cdn.jsdelivr.net/npm/ag-psd@30.1.1/dist/bundle.js", function () { return window.agPsd; }).then(function (ag) {
			var psd = ag.readPsd(new Uint8Array(buf), { skipThumbnail: true }), layers = [];
			(function walk(list) { (list || []).forEach(function (n) { if (n.children) walk(n.children); else if (n.canvas) layers.push(n); }); })(psd.children);
			if (!PE.newDoc(psd.width, psd.height, null, I.baseName(name))) return; var d = PE.doc; d.layers = []; var from = Object.assign({ file: name }, meta || {}, { how: "psd" }); d.file = PE.mkSrc(from);
			var MAP = { "normal": "source-over", "multiply": "multiply", "screen": "screen", "overlay": "overlay", "darken": "darken", "lighten": "lighten", "color dodge": "color-dodge", "color burn": "color-burn", "hard light": "hard-light", "soft light": "soft-light", "difference": "difference", "exclusion": "exclusion", "hue": "hue", "saturation": "saturation", "color": "color", "luminosity": "luminosity" };
			if (!layers.length && psd.canvas) layers.push({ name: "Background", canvas: psd.canvas, left: 0, top: 0 });
			layers.forEach(function (n) { var c = PE.clone(n.canvas), L = PE.makeLayer({ canvas: c, name: n.name || "Layer", x: n.left || 0, y: n.top || 0, src: PE.mkSrc({ how: "psd", file: name }, c.width, c.height) }); L.visible = !n.hidden; L.opacity = n.opacity == null ? 1 : n.opacity; L.blend = MAP[n.blendMode] || "source-over"; d.layers.push(L); });
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
		var proj = files.filter(function (f) { return /\.(mesproj|zip)$/i.test(f.name); })[0], psd = files.filter(function (f) { return /\.psd$/i.test(f.name); })[0], xcfs = files.filter(function (f) { return /\.xcf$/i.test(f.name); }), imgs = files.filter(function (f) { return /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif|svg|ico)$/i.test(f.name); });
		var meta = function (f) { return { how: opts.how || "open", file: f.name, path: f.webkitRelativePath || "", bytes: f.size || 0, dir: opts.dir || "", hk: opts.hk || "" }; };
		if (proj) { openProjectFile(proj, opts, meta(proj)); return; }
		if (psd && !opts.place) { if (!confirmReplace()) return; psd.arrayBuffer().then(function (b) { return loadPsd(b, psd.name, meta(psd)); }).catch(function (e) { PE.toast(e.message); }); return; }
		if (xcfs.length) {   // GIMP files: open the first as the image (or, when placing into an open image, add each as a group of layers), then any pictures as layers
			var place = !!(opts.place && PE.doc); if (!place && !confirmReplace()) return;
			var xc = Promise.resolve(); xcfs.forEach(function (f, i) { xc = xc.then(function () { return f.arrayBuffer(); }).then(function (b) { PE.loadXcf(b, f.name, meta(f), place || i > 0); }).catch(function (e) { PE.toast("Can't read " + f.name + ": " + (e && e.message || e)); }); });
			if (imgs.length) xc.then(function () { if (PE.doc) openFiles(imgs, Object.assign({}, opts, { place: true })); });
			return;
		}
		if (!imgs.length) { PE.toast("That file type is not supported (use PNG, JPG, WebP, GIF, BMP, AVIF, SVG, PSD, GIMP .xcf)"); return; }
		var first = !PE.doc || (!opts.place && confirmReplace()); if (!PE.doc) first = true; else if (!opts.place && !first) return;
		var chain = Promise.resolve(); imgs.forEach(function (f, i) { chain = chain.then(function () { return PE.decodeFile(f).then(function (im) { if (first && i === 0 && (!PE.doc || !opts.place)) { PE.openImageSource(im, f.name, meta(f)); } else PE.placeSource(im, I.baseName(f.name), opts.at, meta(f)); }).catch(function () { PE.toast("Can't read " + f.name); }); }); });
		chain.then(function () { PE.setTool("move"); if (imgs.length > 1) PE.toast(imgs.length + " images added as layers"); });
	}
	/* a .mesproj, or a .zip with a project.json in it. With a file handle (File -> Open picker, a drop in Chrome / Edge / Brave, the connected folder) the
	 * project is linked to the file, so Save writes back to it */
	function openProjectFile(f, opts, m) {
		var hp = opts.fh ? Promise.resolve(opts.fh) : opts.handles ? Promise.resolve(opts.handles).then(function (hs) { return (hs || []).filter(function (h) { return h && h.kind === "file" && h.name === f.name; })[0] || null; }, function () { return null; }) : Promise.resolve(null);
		f.arrayBuffer().then(function (b) {
			var u = new Uint8Array(b); if (!PE.isProjectZip(u)) { PE.toast(/\.zip$/i.test(f.name) ? "“" + f.name + "” is a ZIP without a MES project in it (no project.json). To use its pictures, unzip it and drop them here" : "“" + f.name + "” is not a MES project file"); return; }
			if (!confirmReplace()) return;
			return PE.loadProject(b, f.name, m).then(function () { return hp; }).then(function (h) {
				if (h) PE.linkProject(h, { dir: opts.dir || "", lm: f.lastModified }); else PE.rememberProject({});
				PE.setTool("move"); PE.toast(h ? "Opened " + f.name + ": " + MOD + "S saves back to this file" : "Project opened" + (PE.canOpenPicker() ? " (use File → Open project… so " + MOD + "S can save back to the same file)" : ""));
			});
		}).catch(function (e) {   // a file that cannot be read: an online-only OneDrive / iCloud placeholder, or a folder the browser handed over as a file
			if (e && (e.name === "NotReadableError" || e.name === "NotFoundError")) { PE.toast("Could not read “" + f.name + "”. If it is in OneDrive or iCloud, make it available on this computer first (right-click → Always keep on this device), then drop it again. If it is a folder (an unzipped project), use File → Open project folder…"); return; }
			PE.toast(e && e.message || String(e)); });
	}
	function confirmReplace() { if (!PE.doc || !PE.dirty || PE.hist.stack.length < 2) return true; return window.confirm("Replace the current image? Unsaved changes will be lost (you can still restore the last auto-saved session)."); }
	PE.openFiles = openFiles; PE.confirmReplace = confirmReplace;
	/* File -> Open: the browser's file picker that returns file handles (so a project opened this way can be saved back in place), else the plain file input */
	var OPEN_ACCEPT = "image/*,.psd,.xcf,.mesproj,.zip";
	function pickOpen() {
		if (PE.canOpenPicker()) {
			var dh = PE.folderHandle && PE.folderHandle(), o = { id: "mes-photo-open", multiple: true, types: [{ description: "Pictures, projects, PSD and GIMP files", accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"], "image/gif": [".gif"], "image/bmp": [".bmp"], "image/avif": [".avif"], "image/svg+xml": [".svg"], "application/zip": [".mesproj", ".zip"], "application/octet-stream": [".psd", ".xcf"] } }] }; if (dh) o.startIn = dh;
			window.showOpenFilePicker(o).then(function (hs) { return Promise.all(hs.map(function (h) { return h.getFile(); })).then(function (fs) { openFiles(fs, { handles: hs }); }); }).catch(function (x) { if (x && x.name === "AbortError") return; pickFiles(OPEN_ACCEPT, true, function (fs) { openFiles(fs); }); });
			return;
		}
		pickFiles(OPEN_ACCEPT, true, function (fs) { openFiles(fs); });
	}
	PE.pickOpen = pickOpen;
	function pickFiles(accept, multiple, cb) { var inp = $("pe-file"); inp.accept = accept; inp.multiple = !!multiple; inp.onchange = function () { var fs = Array.prototype.slice.call(inp.files); inp.value = ""; if (fs.length) cb(fs); }; inp.click(); }
	PE.pickFontFile = function () { pickFiles(".ttf,.otf,.woff,.woff2", false, function (fs) { PE.loadFontFile(fs[0]).then(function () { PE.toast("Font loaded"); }).catch(function () { PE.toast("Could not load that font"); }); }); };
	var stage = PE.els.stage;
	["dragenter", "dragover"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); stage.classList.add("is-drop"); } }); });
	["dragleave", "drop"].forEach(function (ev) { stage.addEventListener(ev, function () { stage.classList.remove("is-drop"); }); });
	stage.addEventListener("drop", function (e) {
		/* a dropped FOLDER (an unzipped .mesproj, or a folder of pictures): read it with the entry / handle API, which must be asked during the drop event itself */
		try { var its = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.items) || []).filter(function (it) { return it.kind === "file"; }), ents = its.map(function (it) { try { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; } catch (x) { return null; } }), di = -1;
			ents.forEach(function (en, i) { if (di < 0 && en && en.isDirectory) di = i; });
			if (di >= 0 && PE.openDroppedFolder) { e.preventDefault(); var hp = null; try { hp = its[di].getAsFileSystemHandle ? its[di].getAsFileSystemHandle() : null; } catch (x) { hp = null; } PE.openDroppedFolder(ents[di], hp); return; }
		} catch (x) { }
		if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); var at = PE.doc ? PE.toDoc(e.clientX, e.clientY) : null; var hs = null; try { var items = Array.prototype.slice.call(e.dataTransfer.items || []); if (items.length && items[0].getAsFileSystemHandle) hs = Promise.all(items.map(function (it) { return it.kind === "file" ? it.getAsFileSystemHandle().catch(function () { return null; }) : null; })); } catch (x) { hs = null; }
		openFiles(e.dataTransfer.files, { place: !!PE.doc, at: null, how: "drop", handles: hs }); } });
	function saveProject() { PE.saveProject(); }   // Save / Save as / download: projects.js
	/* the top-bar Save button shows a dot while there are changes that are not in a saved project file */
	function saveState() { setTimeout(function () { var b = $("pe-save"), on = !!(PE.doc && PE.dirty && PE.hist.stack.length > 1); if (!b) return; b.classList.toggle("is-dirty", on); var L = PE.projectLink && PE.projectLink(); b.title = (L ? "Save project to " + PE.projectWhere() : "Save project: a .mesproj file that keeps every layer, group and comp") + " (" + MOD + "S)" + (on ? ". You have changes that are not saved in a project file yet." : ""); if (PE.drawProjectBar) PE.drawProjectBar(); }, 0); }
	PE.saveState = saveState; PE.on("history", saveState); PE.on("docsize", saveState);

	/* ---------- autosave (IndexedDB, per project, with Recent projects): projects.js ---------- */
	window.addEventListener("beforeunload", function (e) { if (PE.doc && PE.dirty && PE.hist.stack.length > 1) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- menus ---------- */
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform), MOD = isMac ? "⌘" : "Ctrl+";
	function adj(list) { return list.map(function (a) { return { label: a.title, act: function () { if (needDoc()) PE.runAdjust(a.id); } }; }); }
	var MENUS = [
		{ label: "File", items: [{ label: "New image…", act: function () { PE.dlgNew(); } }, { label: "Open image / PSD / GIMP / project…", key: MOD + "O", act: pickOpen }, { label: "Open project file…", icon: "📂", title: "Open a .mesproj (or a .zip with a project in it) so that Save writes back to the same file", act: function () { PE.openProjectPicker(); } }, { label: "Open project folder…", icon: "📁", title: "Open an unzipped project: a folder with project.json and the layer PNGs in it (Chrome / Edge: Save then writes back into that folder)", act: function () { PE.openProjectFolderPicker(); } }, { label: "Open recent…", act: function () { PE.dlgRecent(); }, title: "Projects autosaved in this browser and project files opened or saved here" }, { label: "Insert equation (LaTeX)…", act: function () { PE.dlgEquation(null, null); } }, { label: "Place image(s) as layers…", act: function () { if (!needDoc()) return; pickFiles("image/*,.xcf", true, function (fs) { openFiles(fs, { place: true }); }); } }, "-",
			{ label: "Save project", tag: "keeps layers", icon: "💾", hi: true, key: MOD + "S", act: saveProject, title: "A .mesproj file with every layer, group, mask, text and comp: open it again here to keep working. Once it is in a file, this writes to that same file" }, { label: "Save project as…", key: MOD + "Alt+Shift+S", act: function () { PE.saveProjectAs(); }, title: "Save the project under a new name or in another folder" }, { label: function () { return (PE.autoFileOn() ? "✓ " : "") + "Auto-save to the project file"; }, act: function () { PE.setAutoFile(!PE.autoFileOn()); }, title: "Write changes into the linked project file 20 s after you stop editing, so a synced folder (OneDrive…) always has the latest" }, { label: "Download project as .zip", act: function () { PE.downloadProjectZip(); }, title: "The same project as a normal .zip file (project.json + one PNG per layer): drop it on the editor to keep working" }, "-", { label: "Export as PNG / JPEG / WebP…", key: MOD + "Shift+S", act: function () { if (needDoc()) PE.dlgExport(); } }, { label: "Export the selected group as its own image…", act: function () { if (needDoc()) PE.dlgExportGroup(); } }, { label: "Export all comps as pictures (ZIP)…", act: function () { if (needDoc()) PE.dlgExportComps(); } }, { label: "Export every layer as PNG (ZIP)…", act: function () { PE.dlgExportLayers(); }, title: "One PNG per layer plus layers.json with the positions, for other apps" }, { label: "Save as PSD (Photoshop)", act: savePsd }, { label: "Save as GIMP file (.xcf)", act: function () { PE.saveXcf(); } }, "-",
			{ label: "Where are my images? (files, folder, autosave)…", act: function () { PE.dlgFolder("where"); } }, { label: "Keep working on another computer…", act: function () { PE.dlgFolder("move"); } }, { label: "Connect a folder on this computer…", act: function () { PE.dlgFolder("folder"); } }, "-", { label: "Copy merged image to clipboard", act: function () { if (needDoc()) copyMerged(); } }, { label: "Share as a link (temporary upload)…", act: function () { if (needDoc()) PE.dlgShare(); } }, "-", { label: "Bulk convert images…", act: function () { window.open("/image-converter", "_blank"); } }] },
		{ label: "Edit", items: [{ label: "Undo", key: MOD + "Z", act: function () { PE.undo(); } }, { label: "Redo", key: MOD + "Shift+Z", act: function () { PE.redo(); } }, "-", { label: "Cut", key: MOD + "X", act: function () { copySel(true); } }, { label: "Copy", key: MOD + "C", act: function () { copySel(false); } }, { label: "Copy merged", act: function () { if (needDoc()) copyMerged(); } }, { label: "Paste as new layer", key: MOD + "V", act: pasteInternal }, "-",
			{ label: "Erase selection with AI (remove object)", act: function () { if (needSel()) PE.aiEraseRun(); } }, { label: "Clear selection (transparent)", key: "Del", act: clearSel }, { label: "Fill with foreground colour", key: "Alt+Backspace", act: function () { if (needDoc()) fillSel(PE.fg); } }, { label: "Fill with background colour", key: MOD + "Backspace", act: function () { if (needDoc()) fillSel(PE.bg); } }, "-",
			{ label: "Select all", key: MOD + "A", act: function () { if (needDoc()) { PE.selAll(); PE.commit("Select all"); } } }, { label: "Deselect", key: MOD + "D", act: function () { if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } }, { label: "Invert selection", key: MOD + "Shift+I", act: function () { if (needDoc()) { PE.selInvert(); PE.commit("Invert selection"); } } },
			{ label: "Feather selection…", act: function () { if (needSel()) promptNum("Feather selection", "Radius", 8, 1, 200, function (v) { PE.selFeather(v); PE.commit("Feather"); }); } }, { label: "Grow selection…", act: function () { if (needSel()) promptNum("Grow selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, true); PE.commit("Grow selection"); }); } }, { label: "Shrink selection…", act: function () { if (needSel()) promptNum("Shrink selection", "By", 4, 1, 100, function (v) { PE.selGrow(v, false); PE.commit("Shrink selection"); }); } }] },
		{ label: "Image", items: [{ label: "Image size…", act: function () { PE.dlgImageSize(); } }, { label: "Canvas size…", act: function () { PE.dlgCanvasSize(); } }, { label: "Upscale with AI (2× / 4×)…", act: function () { PE.aiUpscale(); } }, { label: "Crop to selection", act: function () { if (!needDoc()) return; var b = PE.selBounds(); if (!b) { PE.toast("Make a selection first, or use the Crop tool"); return; } PE.cropTo(b.x, b.y, b.w, b.h); } }, { label: "Trim transparent edges", act: function () { if (needDoc()) PE.trim(); } }, "-",
			{ label: "Rotate / straighten…", act: function () { PE.dlgStraighten(); } }, { label: "Rotate 90° clockwise", act: function () { if (needDoc()) PE.rotateImage(90); } }, { label: "Rotate 90° counter-clockwise", act: function () { if (needDoc()) PE.rotateImage(270); } }, { label: "Rotate 180°", act: function () { if (needDoc()) PE.rotateImage(180); } }, { label: "Flip horizontal", act: function () { if (needDoc()) PE.flipImage(true); } }, { label: "Flip vertical", act: function () { if (needDoc()) PE.flipImage(false); } }, "-", { label: "Flatten image", act: function () { if (needDoc()) PE.flattenImage(); } }] },
		{ label: "Layer", items: [{ label: "Group layers", key: MOD + "G", act: function () { if (needDoc()) groupSelected(); } }, { label: "Ungroup", key: MOD + "Shift+G", act: function () { if (needDoc()) PE.ungroup(); } }, "-", { label: "New layer (empty)", key: MOD + "Shift+N", act: function () { if (needDoc()) PE.newRasterLayer(); } }, { label: "New solid colour layer… (white, black, any colour)", act: function () { PE.dlgFillLayer(); } }, { label: "Duplicate layer", key: MOD + "J", act: function () { if (needDoc()) PE.duplicateLayer(); } }, { label: "Delete layer", act: function () { if (needDoc()) PE.deleteLayer(); } }, { label: "Layer via copy (selection)", act: function () { if (needDoc()) PE.layerFromSelection(false); } }, { label: "Layer via cut (selection)", act: function () { if (needDoc()) PE.layerFromSelection(true); } }, "-",
			{ label: "Merge down", key: MOD + "E", act: function () { if (needDoc()) PE.mergeDown(); } }, { label: "Merge visible", act: function () { if (needDoc()) PE.mergeVisible(); } }, "-", { label: "Remove background (AI)…", act: function () { PE.aiRemoveBackground(); } }, { label: "Add layer mask", act: function () { if (needDoc()) PE.addMask(PE.active(), true); } }, { label: "Apply layer mask", act: function () { if (needDoc()) PE.applyMask(); } }, { label: "Delete layer mask", act: function () { if (needDoc()) PE.deleteMask(); } }, { label: "How layer masks work", act: function () { PE.maskHelp(); } }, { label: "Rasterize text layer", act: function () { var L = PE.active(); if (L && L.type === "text") { PE.rasterize(L); PE.commit("Rasterize"); } } }, "-",
			{ label: "Align: left", act: function () { align("left"); } }, { label: "Align: centre horizontally", act: function () { align("hcenter"); } }, { label: "Align: right", act: function () { align("right"); } }, { label: "Align: top", act: function () { align("top"); } }, { label: "Align: centre vertically", act: function () { align("vcenter"); } }, { label: "Align: bottom", act: function () { align("bottom"); } }, "-",
			{ label: "Layer style: outline…", act: function () { PE.dlgLayerStyle(null, "outline"); }, title: "A live outline around the layer's visible pixels: change or remove it any time" }, { label: "Layer style: drop shadow…", act: function () { PE.dlgLayerStyle(null, "shadow"); } }, { label: "Layer style: glow…", act: function () { PE.dlgLayerStyle(null, "glow"); } }, { label: "Outline / shadow as a new layer (pixels)…", act: function () { PE.dlgEffect("outline"); } }, { label: "Crop layer (hide its edges)", key: "Y", act: function () { var L = PE.active(); if (needDoc() && L && !PE.isGroup(L)) PE.setTool("layercrop"); } }, { label: "Show the whole layer (uncrop)", act: function () { if (needDoc()) PE.clearLayerCrop(); } }, { label: "Round corners…", act: function () { PE.dlgRoundCorners(); } }, "-", { label: "Fit layer inside canvas", act: function () { fitLayer(false); } }, { label: "Fill canvas with layer", act: function () { fitLayer(true); } }, { label: "Reset layer scale / rotation", act: resetTransform }, { label: "Flip layer horizontally", act: function () { if (needDoc()) PE.flipLayer(true); } }, { label: "Flip layer vertically", act: function () { if (needDoc()) PE.flipLayer(false); } }, "-", { label: "Move layer up", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 1); } }, { label: "Move layer down", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -1); } }, { label: "Bring to front", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, 999); } }, { label: "Send to back", act: function () { var L = PE.active(); if (L) PE.stepLayer(L, -999); } }] },
		{ label: "Adjust", items: adj(PE.ADJUST) }, { label: "Filter", items: adj(PE.FILTERS) },
		{ label: "View", items: [{ label: "Zoom in", key: MOD + "+", act: function () { PE.setZoom(PE.view.zoom * 1.25); } }, { label: "Zoom out", key: MOD + "−", act: function () { PE.setZoom(PE.view.zoom / 1.25); } }, { label: "Fit on screen", key: MOD + "0", act: function () { PE.fit(); } }, { label: "Actual pixels (100%)", key: MOD + "1", act: function () { PE.setZoom(1); } }, "-", { label: "Pixel grid (when zoomed in)", act: function () { PE.showGrid = !PE.showGrid; PE.invalidate(); } }, { label: "Full window mode", key: "F", act: function () { toggleWin(); } }] },
		{ label: "Help", items: [{ label: "Keyboard shortcuts", act: shortcuts }, { label: "Tips for labels, arrows and callouts", act: tips }] }
	];
	var openMenu = null;
	function lab(it) { return typeof it.label === "function" ? it.label() : it.label; }
	PE.rebuildMenus = function () { buildMenus(); };
	function buildMenus() {
		var bar = $("pe-menubar"); bar.innerHTML = "";
		MENUS.forEach(function (m) {
			var b = el("button", "pe-menu", esc(m.label)); b.type = "button"; b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false");
			var pop = el("div", "pe-pop"); pop.hidden = true; pop.setAttribute("role", "menu");
			m.items.forEach(function (it) { if (it === "-") { pop.appendChild(el("div", "pe-sep")); return; } var r = el("button", "pe-item" + (it.hi ? " pe-item--hi" : ""), "<span>" + (it.icon ? '<span class="pe-iic" aria-hidden="true">' + esc(it.icon) + "</span>" : "") + esc(lab(it)) + (it.tag ? ' <small class="pe-itag">' + esc(it.tag) + "</small>" : "") + "</span>" + (it.key ? "<kbd>" + esc(it.key) + "</kbd>" : "")); r.type = "button"; r.setAttribute("role", "menuitem"); if (it.title) r.title = it.title; r.addEventListener("click", function () { closeMenu(); it.act(); }); pop.appendChild(r); });
			var wrap = el("div", "pe-mwrap"); wrap.appendChild(b); wrap.appendChild(pop); bar.appendChild(wrap);
			b.addEventListener("click", function (e) { e.stopPropagation(); if (openMenu && openMenu.b === b) closeMenu(); else showMenu(b, pop, wrap); }); b.addEventListener("mouseenter", function () { if (openMenu && openMenu.b !== b) showMenu(b, pop, wrap); });
		});
	}
	function showMenu(b, pop, wrap) { closeMenu(); pop.hidden = false; b.setAttribute("aria-expanded", "true"); openMenu = { b: b, pop: pop }; var r = pop.getBoundingClientRect(); if (r.right > window.innerWidth - 8) pop.style.left = (window.innerWidth - 8 - r.right) + "px"; if (r.bottom > window.innerHeight - 8) pop.style.maxHeight = (window.innerHeight - r.top - 12) + "px"; }
	function closeMenu() { if (openMenu) { openMenu.pop.hidden = true; openMenu.pop.style.left = ""; openMenu.b.setAttribute("aria-expanded", "false"); openMenu = null; } }
	document.addEventListener("click", closeMenu); document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
	function shortcuts() {
		var rows = [["V M L W C", "Move, Marquee, Lasso, Magic wand, Crop"], ["B E S R", "Brush, Eraser, Clone stamp, Retouch"], ["K G I", "Paint bucket, Gradient, Eyedropper"], ["T U", "Text, Shapes & annotations"], ["H / Space", "Pan (hold Space with any tool)"], ["Z, Ctrl + wheel", "Zoom"], ["[ and ]", "Smaller / larger brush"], ["X / D", "Swap / reset colours"], [MOD + "Z, " + MOD + "Shift+Z", "Undo, redo"], [MOD + "A, " + MOD + "D, " + MOD + "Shift+I", "Select all, deselect, invert selection"], [MOD + "C X V", "Copy, cut, paste as layer"], [MOD + "J, " + MOD + "E", "Duplicate layer, merge down"], ["Delete", "Clear selection (or delete the layer)"], ["Arrow keys", "Nudge the layer (Shift = 10 px)"], ["Enter / Esc", "Apply crop, close polygon / cancel"], [MOD + "0 / " + MOD + "1", "Fit on screen / 100%"], [MOD + "S", "Save project (keeps layers)"], [MOD + "Shift+S", "Export PNG / JPEG / WebP"]];
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
			MENUS.forEach(function (m) { m.items.forEach(function (it) { if (it !== "-") list.push({ k: m.label, l: lab(it).replace(/…$/, "") + (it.tag ? " (" + it.tag + ")" : ""), sub: it.key || "", hay: (lab(it) + " " + (it.tag || "") + " " + (it.title || "") + " " + m.label).toLowerCase(), run: function () { it.act(); } }); }); });
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
		if (PE.textKey && PE.textKey(e)) { e.preventDefault(); return; }   // a text is open but its key catcher lost focus: the key goes into the text, not to a tool shortcut
		if (k === " " ) { if (!e.repeat) { PE.setSpace(true); PE.spaceHeld = true; PE.els.over.style.cursor = "grab"; } if (document.activeElement === document.body || root.contains(document.activeElement)) e.preventDefault(); return; }
		if (mod) {
			if (low === "z") { e.preventDefault(); e.shiftKey ? PE.redo() : PE.undo(); return; } if (low === "y") { e.preventDefault(); PE.redo(); return; }
			if (!has && low !== "v" && low !== "o") return;
			if ((low === "b" || low === "u" || (low === "i" && !e.shiftKey)) && !e.altKey) { var AL = PE.active(); if (AL && AL.type === "text" && AL.text && PE.textToggleStyle) { e.preventDefault(); PE.textToggleStyle(low === "b" ? 1 : low === "i" ? 2 : 4); return; } }   // bold / italic / underline the whole active text layer
			if (low === "a") { e.preventDefault(); PE.selAll(); PE.commit("Select all"); } else if (low === "d") { e.preventDefault(); if (PE.sel) { PE.selClear(); PE.commit("Deselect"); } } else if (low === "i" && e.shiftKey) { e.preventDefault(); PE.selInvert(); PE.commit("Invert selection"); }
			else if (low === "c") { e.preventDefault(); e.shiftKey ? copyMerged() : copySel(false); } else if (low === "x") { e.preventDefault(); copySel(true); } else if (low === "j") { e.preventDefault(); PE.duplicateLayer(); } else if (low === "g") { e.preventDefault(); e.shiftKey ? PE.ungroup() : groupSelected(); } else if (low === "e") { e.preventDefault(); PE.mergeDown(); }
			else if (low === "n" && e.shiftKey) { e.preventDefault(); PE.newRasterLayer(); } else if (low === "s" || e.code === "KeyS") { e.preventDefault(); e.shiftKey && e.altKey ? PE.saveProjectAs() : e.shiftKey ? PE.dlgExport() : saveProject(); } else if (k === "0") { e.preventDefault(); PE.fit(); } else if (k === "1") { e.preventDefault(); PE.setZoom(1); } else if (k === "=" || k === "+") { e.preventDefault(); PE.setZoom(PE.view.zoom * 1.25); } else if (k === "-") { e.preventDefault(); PE.setZoom(PE.view.zoom / 1.25); }
			else if (low === "t") { e.preventDefault(); PE.setTool("move"); PE.opt.move.handles = true; buildOpts(); } else if (low === "o") { e.preventDefault(); pickOpen(); } else if (k === "Backspace") { e.preventDefault(); fillSel(PE.bg); }
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
	root.addEventListener("dblclick", function (e) { if (e.target === PE.els.over && PE.toolId !== "text") { var L = PE.active(); if (L && L.type === "text" && PE.toolId === "move") PE.editActiveText(PE.toDoc(e.clientX, e.clientY)); else if (L && L.eq && PE.toolId === "move") PE.dlgEquation(L); } });

	/* ---------- empty state + init ---------- */
	$("pe-e-open").addEventListener("click", pickOpen);
	$("pe-e-new").addEventListener("click", function () { PE.dlgNew(); }); $("pe-e-paste").addEventListener("click", pasteInternal);
	var recBox = $("pe-recent"); if (recBox && PE.recentEl) { var rl = PE.recentEl({ title: "Recent projects", compact: true, keep: true, limit: 6 }); recBox.appendChild(rl); }
	if (S.opt) for (var k in S.opt) if (PE.opt[k]) for (var kk in S.opt[k]) if (kk in PE.opt[k]) PE.opt[k][kk] = S.opt[k][kk];
	PE.opt.shape.next = 1; PE.opt.text.str = "Text";
	showTab(S.tab === "comps" ? "comps" : "hist"); buildMenus(); buildTools(); PE.initPointer(); PE.initTextEditor(); buildColor(); resize(); PE.setTool("move"); status(); if (PE.recentReady) PE.recentReady(); saveState();
	if (S.win) { autoWin = true; toggleWin(true); }
	var q = new URLSearchParams(location.search); if (q.get("new")) { var wh = (q.get("new") || "").split("x"); if (wh.length === 2) PE.newDoc(+wh[0], +wh[1], "#ffffff"); }
	window.PEdebug = PE;
})();
