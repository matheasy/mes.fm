/* MES Photo Editor round 10 -- Quick adjust (Canva-style), Simple mode and the hand-over to the Compressor / Image Converter.
 *
 * Quick adjust: a panel of sliders (Temperature, Tint, Brightness, Contrast, Highlights, Shadows, Whites, Blacks, Vibrance, Saturation) and one-click
 * filters with thumbnails + intensity. The settings live on the layer (L.adj, MESPixel.adjNorm) and are drawn live by PE.adjCanvas (core.js), so they
 * stay editable: change them, reset them, or "Apply to pixels" to bake them in. They travel with history, duplicates and .mesproj files; exports, PSD,
 * XCF and merges include them (they all draw through PE.drawLayer). Before / After (button or the \ key) hides every layer's adjustments.
 *
 * Simple mode (a switch in the top bar, remembered): a Canva-like layout with a big picture, a left rail (Uploads, Sizes, Text, Elements, Draw,
 * Crop, Adjust) and a drawer next to it; the full toolbox and the History panel are hidden. Everything stays the same editor underneath.
 *
 * Hand-over: File -> "Compress this picture" / "Convert this picture" send the flattened picture to mes.fm/compress or /image-converter through
 * MESImg.handoffSend (IndexedDB in this browser, nothing uploaded); those pages send pictures back here with ?handoff=<id>. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, I = window.MESImg; if (!PE || !P || !P.quickAdjust) return;
	var el = PE.el, esc = PE.esc, $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-photo-editor:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

	/* ---------- the panel ---------- */
	var SLIDERS = [
		["White balance", [["temp", "Temperature", "Cooler (blue) to warmer (yellow / orange). Fixes a picture that looks too blue or too yellow.", "pe-adj-r--temp"], ["tint", "Tint", "Green to magenta. Fixes a green cast from shop or office lights.", "pe-adj-r--tint"]]],
		["Light", [["bright", "Brightness", "Lighter or darker overall; pure black and pure white stay as they are."], ["contrast", "Contrast", "More: darks darker and lights lighter (punchier). Less: flatter, softer."], ["hi", "Highlights", "Only the light parts: pull them down to bring back a bright sky or a shiny face."], ["sh", "Shadows", "Only the dark parts: lift them to see detail in a dark corner or a backlit face."], ["wh", "Whites", "The very brightest parts: set where white starts."], ["bl", "Blacks", "The very darkest parts: deeper blacks (minus) or a faded look (plus)."]]],
		["Colour", [["vib", "Vibrance", "Boosts the dull colours more than the bright ones, so skin tones stay natural."], ["sat", "Saturation", "All colours stronger or weaker; -100 = black and white.", "pe-adj-r--sat"]]]
	];
	var box = null, ui = {}, thumbsKey = "", thumbT = 0, liveT = 0, before = false;
	function target() { var L = PE.active(); return L && !PE.isGroup(L) ? L : null; }
	function cur() { var L = target(); return P.adjNorm(L && L.adj); }
	function build() {
		if (box) return box;
		box = el("div", "pe-panel pe-panel--adj"); box.id = "pe-adjp"; box.hidden = true; box.setAttribute("aria-label", "Quick adjust");
		var head = el("div", "pe-ph pe-adj-h"); head.innerHTML = '<span>Adjust</span>';
		var ba = el("button", "pe-mini pe-mini--t pe-adj-ba", "Before / After"); ba.type = "button"; ba.id = "pe-adj-ba"; ba.setAttribute("aria-pressed", "false"); ba.title = "Show the picture without the adjustments (hold the \\ key for a quick look)"; ba.addEventListener("click", function () { setBefore(!before); });
		var cl = el("button", "pe-mini pe-adj-x", "✕"); cl.type = "button"; cl.title = "Close the Adjust panel"; cl.setAttribute("aria-label", "Close the Adjust panel"); cl.addEventListener("click", function () { PE.showAdjust(false); });
		head.appendChild(ba); head.appendChild(cl); box.appendChild(head);
		ui.who = el("div", "pe-adj-who"); box.appendChild(ui.who);
		// filters
		var fh = el("div", "pe-adj-sub", "Filters"); box.appendChild(fh);
		ui.filters = el("div", "pe-adj-fl"); ui.filters.setAttribute("role", "listbox"); ui.filters.setAttribute("aria-label", "Filters"); box.appendChild(ui.filters);
		[{ id: "", name: "Original" }].concat(P.QFILTERS).forEach(function (f) {
			var b = el("button", "pe-adj-f"); b.type = "button"; b.dataset.f = f.id; b.setAttribute("role", "option"); b.title = f.id ? f.name + " filter" : "No filter";
			var c = document.createElement("canvas"); c.width = c.height = 64; c.className = "pe-adj-ft"; b.appendChild(c); b.appendChild(el("span", "pe-adj-fn", esc(f.name)));
			b.addEventListener("click", function () { var a = cur(); a.filter = f.id ? { id: f.id, amt: a.filter && a.filter.id === f.id ? a.filter.amt : 100 } : null; setAdj(a, true, f.id ? "Filter: " + f.name : "No filter"); });
			ui.filters.appendChild(b);
		});
		ui.amtRow = row({ k: "amt", label: "Intensity", help: "How strong the filter is: 100 = the full filter, 50 = half way between the original and the filter.", min: 0, max: 100 }, function (v, live) { var a = cur(); if (!a.filter) return; a.filter.amt = v; setAdj(a, !live, "Filter intensity"); });
		box.appendChild(ui.amtRow.w);
		ui.rows = {};
		SLIDERS.forEach(function (g) {
			box.appendChild(el("div", "pe-adj-sub", esc(g[0])));
			g[1].forEach(function (s) { var r = row({ k: s[0], label: s[1], help: s[2], cls: s[3], min: -100, max: 100 }, function (v, live) { var a = cur(); a[s[0]] = v; setAdj(a, !live, s[1]); }); ui.rows[s[0]] = r; box.appendChild(r.w); });
		});
		var acts = el("div", "pe-adj-acts");
		var rs = el("button", "pe-btn pe-btn--sm", "Reset adjustments"); rs.type = "button"; rs.title = "Back to the original picture (the sliders to 0, no filter)"; rs.addEventListener("click", function () { var L = target(); if (!L || !L.adj) return; L.adj = null; L._adjc = null; PE.invalidate(); PE.commit("Reset adjustments"); sync(); });
		var ap = el("button", "pe-btn pe-btn--sm", "Apply to pixels"); ap.type = "button"; ap.title = "Bake the adjustments into the layer's pixels (they can't be changed afterwards, except with Undo)"; ap.addEventListener("click", applyPixels);
		acts.appendChild(rs); acts.appendChild(ap); box.appendChild(acts);
		box.appendChild(el("p", "pe-adj-note", "The adjustments stay editable: they are kept on the layer (also in saved projects) and only change what you see and export. Painting on the layer paints the original colours."));
		var side = $("pe-side"), sbar = side && side.querySelector(".pe-sbar"); if (side) side.insertBefore(box, sbar ? sbar.nextSibling : side.firstChild);
		return box;
	}
	/* one slider row: label, range, number box, ? help; double-click the slider = 0 */
	function row(o, cb) {
		var w = el("div", "pe-adj-r" + (o.cls ? " " + o.cls : "")), id = "pe-adj-" + o.k, lb = el("label", "pe-adj-l", esc(o.label)); lb.htmlFor = id;
		var rg = el("input"); rg.type = "range"; rg.id = id; rg.min = o.min; rg.max = o.max; rg.step = 1; rg.value = 0;
		var nb = el("input", "pe-num pe-adj-n"); nb.type = "number"; nb.min = o.min; nb.max = o.max; nb.step = 1; nb.value = 0; nb.setAttribute("aria-label", o.label + " (number)");
		var top = el("div", "pe-adj-rt"); top.appendChild(lb); top.appendChild(nb); if (o.help && PE.helpBtn) top.appendChild(PE.helpBtn(o.label, esc(o.help))); w.appendChild(top); w.appendChild(rg);
		rg.addEventListener("input", function () { nb.value = rg.value; cb(+rg.value, true); });
		rg.addEventListener("change", function () { cb(+rg.value, false); });
		rg.addEventListener("dblclick", function () { var z = o.k === "amt" ? 100 : 0; rg.value = nb.value = z; cb(z, false); });
		nb.addEventListener("input", function () { if (nb.value === "" || isNaN(+nb.value)) return; var v = Math.max(o.min, Math.min(o.max, Math.round(+nb.value))); rg.value = v; cb(v, true); });
		nb.addEventListener("change", function () { if (nb.value === "" || isNaN(+nb.value)) nb.value = rg.value; cb(+rg.value, false); });
		nb.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") nb.blur(); });
		rg.addEventListener("keydown", function (e) { e.stopPropagation(); });
		return { w: w, rg: rg, nb: nb, set: function (v) { if (document.activeElement !== nb) nb.value = v; rg.value = v; } };
	}
	/* change the active layer's adjustments: live = while a slider moves (quick preview of big layers), else the full picture + an undo step */
	function setAdj(a, final, label) {
		var L = target(); if (!L) { PE.toast(PE.doc ? "Select a layer first (in the Layers panel)" : "Open a picture first"); sync(); return; }
		if (L.locked) { PE.toast("This layer is locked"); sync(); return; }
		a = P.adjNorm(a); L.adj = P.adjAny(a) || a.filter ? a : null; L._adjLive = !final; if (before) setBefore(false);
		clearTimeout(liveT); if (!final) liveT = setTimeout(function () { L._adjLive = false; PE.invalidate(); }, 260);
		PE.invalidate(); syncFilters(a);
		PE.later("adjust", function () { L._adjLive = false; PE.invalidate(); PE.commit(label ? "Adjust: " + label : "Adjust"); }, final ? 30 : 600);
	}
	function applyPixels() {
		var L = target(); if (!L || !L.adj || !P.adjAny(L.adj)) { PE.toast("Nothing to apply: move a slider or pick a filter first"); return; }
		if (L.locked) { PE.toast("This layer is locked"); return; }
		if (PE.flushPending) PE.flushPending();
		var a = L.adj; L.adj = null; L._adjc = null; if (L.type === "text" || L.eq) PE.prepare(L, true, true);
		var x = L.canvas.getContext("2d"), id = x.getImageData(0, 0, L.canvas.width, L.canvas.height); P.quickAdjust(id.data, a); x.putImageData(id, 0, 0); L.rev++;
		PE.invalidate(); PE.commit("Apply adjustments"); sync(); PE.toast("Adjustments are now part of the layer's pixels");
	}
	function setBefore(v) {
		before = !!v; PE.adjBefore = before; var b = $("pe-adj-ba"); if (b) { b.setAttribute("aria-pressed", before ? "true" : "false"); b.textContent = before ? "Showing before" : "Before / After"; }
		PE.invalidate();
	}
	PE.adjSetBefore = setBefore;
	function sync() {
		if (!box || box.hidden) return; var L = target(), a = cur();
		ui.who.innerHTML = !PE.doc ? "Open a picture to adjust it." : !L ? "Select a layer (groups can't be adjusted: pick a layer inside)." : "Changes the layer <b>" + esc(L.name) + "</b>" + (L.adj && P.adjAny(L.adj) ? ' <span class="pe-adj-on">adjusted</span>' : "") + (L.locked ? " (locked)" : "");
		box.classList.toggle("is-off", !L);
		Object.keys(ui.rows).forEach(function (k) { ui.rows[k].set(a[k]); ui.rows[k].rg.disabled = ui.rows[k].nb.disabled = !L; });
		syncFilters(a); thumbs();
	}
	function syncFilters(a) {
		Array.prototype.forEach.call(ui.filters.children, function (b) { var on = a.filter ? b.dataset.f === a.filter.id : !b.dataset.f; b.setAttribute("aria-selected", on ? "true" : "false"); b.classList.toggle("is-on", on); });
		ui.amtRow.w.hidden = !a.filter; if (a.filter) ui.amtRow.set(a.filter.amt);
	}
	/* filter thumbnails: the selected layer (or the whole picture) shrunk to 64 px, each filter applied at full strength */
	function thumbs() {
		clearTimeout(thumbT); thumbT = setTimeout(function () {
			var L = target(); if (!box || box.hidden) return; var src = L ? L.canvas : null, k = L ? L.id + ":" + L.rev + ":" + src.width + "x" + src.height : "none"; if (k === thumbsKey) return; thumbsKey = k;
			var base = document.createElement("canvas"); base.width = base.height = 64; var bx = base.getContext("2d");
			if (src) { var s = Math.min(src.width, src.height), sx = (src.width - s) / 2, sy = (src.height - s) / 2; bx.fillStyle = "#808080"; bx.fillRect(0, 0, 64, 64); bx.imageSmoothingQuality = "high"; bx.drawImage(src, sx, sy, s, s, 0, 0, 64, 64); }
			else { var g = bx.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, "#f2b134"); g.addColorStop(0.5, "#4fb3bf"); g.addColorStop(1, "#3b5b92"); bx.fillStyle = g; bx.fillRect(0, 0, 64, 64); }
			var id0 = bx.getImageData(0, 0, 64, 64);
			Array.prototype.forEach.call(ui.filters.children, function (b) { var c = b.querySelector("canvas"), x = c.getContext("2d"), d = new ImageData(new Uint8ClampedArray(id0.data), 64, 64); if (b.dataset.f) P.quickAdjust(d.data, { filter: { id: b.dataset.f, amt: 100 } }); x.putImageData(d, 0, 0); });
		}, 120);
	}
	PE.showAdjust = function (on) {
		build(); if (on == null) on = box.hidden; box.hidden = !on; var tb = $("pe-adjbtn"); if (tb) tb.setAttribute("aria-pressed", on ? "true" : "false");
		if (!on) setBefore(false); else { var sh = $("pe-sshow"); if (sh && !sh.hidden && !simple()) sh.click();   /* the panels were hidden: show them */ thumbsKey = ""; sync(); }
		sset({ adjOpen: !!on }); if (simple()) placeAdjust();
	};
	PE.on("layers", function () { sync(); }); PE.on("history", function () { sync(); }); PE.on("active", function () { sync(); });
	document.addEventListener("keydown", function (e) {   // \ = hold for a quick "before" look (like Lightroom), when no text field has the keys
		if (e.key !== "\\" || e.ctrlKey || e.metaKey || e.altKey || !box || box.hidden) return; var t = e.target; if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return; if (!before) setBefore(true); e.preventDefault();
	});
	document.addEventListener("keyup", function (e) { if (e.key === "\\" && before && box && !box.hidden) setBefore(false); });

	/* ---------- Adjust menu entry + top-bar button ---------- */
	if (PE.ADJUST) PE.ADJUST.unshift({ id: "quick", title: "Quick adjust & filters (sliders)…" });
	var run0 = PE.runAdjust; PE.runAdjust = function (id) { if (id === "quick") { PE.showAdjust(true); return; } return run0.apply(this, arguments); };

	/* ---------- Simple mode ---------- */
	var RAIL = [["uploads", "Uploads", "🖼"], ["sizes", "Sizes", "⤢"], ["text", "Text", "@text"], ["elements", "Elements", "@shape"], ["draw", "Draw", "@brush"], ["crop", "Crop", "@crop"], ["adjust", "Adjust", "◐"]];
	function ico(g) { return g.charAt(0) === "@" && PE.toolIcon ? PE.toolIcon(g.slice(1), "") : esc(g); }
	/* small line drawings for the Elements tiles (no emoji font needed: Windows 7 has none) */
	var SV = function (b) { return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + b + "</svg>"; };
	var EL_ICO = { arrow: SV('<path d="M4 18L19 5"/><path d="M11 5h8v8"/>'), rect: SV('<rect x="4" y="6" width="16" height="12"/>'), round: SV('<rect x="4" y="6" width="16" height="12" rx="4"/>'), ellipse: SV('<circle cx="12" cy="12" r="8"/>'), line: SV('<path d="M5 19L19 5"/>'),
		callout: SV('<path d="M4 6h16v10H11l-5 4v-4H4z"/>'), badge: SV('<circle cx="12" cy="12" r="9"/><path d="M11 9l2-1v8"/>'), highlight: SV('<path d="M3 15h18" stroke-width="7" stroke-opacity="0.45"/>'), redact: SV('<rect x="4" y="6" width="16" height="12"/><path d="M8 6v12M12 6v12M16 6v12M4 10h16M4 14h16" stroke-width="1"/>'), eq: SV('<path d="M17 5H7l6 7-6 7h10"/>') };
	var rail = null, drawer = null, railSel = "";
	function simple() { var r = $("pe"); return !!(r && r.classList.contains("pe-simple")); }
	function buildRail() {
		if (rail) return; var main = document.querySelector("#pe .pe-main"); if (!main) return;
		rail = el("nav", "pe-rail"); rail.setAttribute("aria-label", "Simple mode"); drawer = el("div", "pe-drawer"); drawer.hidden = true;
		RAIL.forEach(function (r) { var b = el("button", "pe-rail-b"); b.type = "button"; b.dataset.r = r[0]; b.setAttribute("aria-pressed", "false"); b.innerHTML = '<span class="pe-rail-i" aria-hidden="true">' + ico(r[2]) + '</span><span class="pe-rail-n">' + esc(r[1]) + "</span>"; b.addEventListener("click", function () { openDrawer(railSel === r[0] ? "" : r[0]); }); rail.appendChild(b); });
		var full = el("button", "pe-rail-b pe-rail-full"); full.type = "button"; full.innerHTML = '<span class="pe-rail-i" aria-hidden="true">⚙</span><span class="pe-rail-n">Full editor</span>'; full.title = "Switch to the full editor (all tools, History)"; full.addEventListener("click", function () { setSimple(false); }); rail.appendChild(full);
		main.insertBefore(drawer, main.firstChild); main.insertBefore(rail, main.firstChild);
	}
	function btn(label, cls, title, fn) { var b = el("button", "pe-btn " + (cls || ""), esc(label)); b.type = "button"; if (title) b.title = title; b.addEventListener("click", fn); return b; }
	function addText(preset, str, rel) {
		if (!PE.doc) { PE.newDoc(1080, 1080, "#ffffff", "Untitled"); }
		var d = PE.doc, o = JSON.parse(JSON.stringify(PE.opt.text)); o.wrapW = 0; o.fit = false; o.boxH = 0; o.rich = null; o.rsz = null; o.bold = false; o.italic = false; o.underline = false; o.bgOn = false; o.strokeOn = false; o.shadowOn = false;
		for (var k in preset) o[k] = preset[k]; o.str = str; o.size = Math.max(12, Math.round(Math.min(d.w, d.h) * rel));
		var L = PE.makeLayer({ type: "text", name: str, text: o, w: 4, h: 4 }); PE.renderText(L); L.cx = d.w / 2; L.cy = d.h / 2; PE.addLayer(L); PE.setActive(L.id); PE.commit("Add text"); PE.setTool("move"); PE.invalidate();
		PE.toast("Double-click the text to type your own words; drag a corner to resize it");
	}
	function openDrawer(id) {
		railSel = id; Array.prototype.forEach.call(rail.querySelectorAll(".pe-rail-b"), function (b) { b.setAttribute("aria-pressed", b.dataset.r === id ? "true" : "false"); });
		drawer.innerHTML = ""; drawer.hidden = !id; if (id !== "adjust" && box && box.parentNode === drawer) { PE.showAdjust(false); placeAdjust(); }
		if (!id) { window.dispatchEvent(new Event("resize")); return; }
		var h = el("div", "pe-drawer-h", esc(RAIL.filter(function (r) { return r[0] === id; })[0][1])), x = btn("✕", "pe-btn--sm pe-drawer-x", "Close", function () { openDrawer(""); }); h.appendChild(x); drawer.appendChild(h);
		var body = el("div", "pe-drawer-b"); drawer.appendChild(body);
		if (id === "uploads") {
			body.appendChild(btn("Open picture(s)…", "pe-btn--primary pe-drawer-wide", "Open pictures from your computer (nothing is uploaded)", function () { PE.pickOpen(); }));
			body.appendChild(btn("Add a picture as a layer…", "pe-drawer-wide", "Put another picture on top of this one", function () { if (!PE.doc) { PE.pickOpen(); return; } var inp = $("pe-file"); inp.accept = "image/*"; inp.multiple = true; inp.onchange = function () { var fs = Array.prototype.slice.call(inp.files); inp.value = ""; if (fs.length) PE.openFiles(fs, { place: true }); }; inp.click(); }));
			body.appendChild(btn("Recent projects…", "pe-drawer-wide", null, function () { PE.dlgRecent(); }));
			body.appendChild(el("p", "pe-drawer-p", "Or drop pictures anywhere on the editor, or press Ctrl+V to paste one."));
		} else if (id === "sizes") {
			body.appendChild(el("p", "pe-drawer-p", "Start a blank design in a common size:"));
			[["Instagram post", 1080, 1080], ["Instagram story", 1080, 1920], ["YouTube thumbnail", 1280, 720], ["Facebook post", 1200, 630], ["X / Twitter post", 1600, 900], ["A4 (150 dpi)", 1240, 1754]].forEach(function (s) {
				body.appendChild(btn(s[0] + "  " + s[1] + " × " + s[2], "pe-drawer-wide", "New blank image, " + s[1] + " × " + s[2] + " px", function () { if (PE.confirmReplace && !PE.confirmReplace()) return; PE.newDoc(s[1], s[2], "#ffffff", s[0]); PE.fit && PE.fit(); }));
			});
			body.appendChild(btn("Other size…", "pe-drawer-wide", null, function () { PE.dlgNew(); }));
		} else if (id === "text") {
			body.appendChild(btn("Add a heading", "pe-drawer-wide pe-drawer-h1", null, function () { addText({ bold: true, font: "Arial, Helvetica, sans-serif", color: "#111111", align: "center" }, "Add a heading", 0.09); }));
			body.appendChild(btn("Add a subheading", "pe-drawer-wide pe-drawer-h2", null, function () { addText({ bold: true, font: "Arial, Helvetica, sans-serif", color: "#333333", align: "center" }, "Add a subheading", 0.055); }));
			body.appendChild(btn("Add a little body text", "pe-drawer-wide", null, function () { addText({ font: "Arial, Helvetica, sans-serif", color: "#333333", align: "left" }, "Add a little body text", 0.035); }));
			body.appendChild(el("div", "pe-adj-sub", "Styles"));
			[["Yellow label", { bgOn: true, bgColor: "#ffeb3b", color: "#111111", bold: true, bgPad: 14, bgRadius: 8 }], ["Red callout", { bgOn: true, bgColor: "#e53935", color: "#ffffff", bold: true, bgPad: 14, bgRadius: 10 }], ["Meme text", { color: "#ffffff", strokeOn: true, stroke: "#000000", strokeW: 6, bold: true, font: "Impact, 'Arial Black', sans-serif", align: "center" }], ["Glow title", { color: "#ffffff", shadowOn: true, shadow: "#7c3aed", shadowBlur: 18, shadowDx: 0, shadowDy: 0, bold: true, align: "center" }]].forEach(function (p) {
				body.appendChild(btn(p[0], "pe-drawer-wide", null, function () { addText(p[1], p[0], 0.06); }));
			});
			body.appendChild(el("p", "pe-drawer-p", "Tip: with the Text tool (T) you can click anywhere on the picture to type."));
		} else if (id === "elements") {
			var grid = el("div", "pe-drawer-g");
			[["arrow", "Arrow"], ["rect", "Box"], ["round", "Rounded box"], ["ellipse", "Circle"], ["line", "Line"], ["callout", "Speech bubble"], ["badge", "Step number"], ["highlight", "Highlighter"], ["redact", "Blur / hide"]].forEach(function (k) {
				var b = el("button", "pe-drawer-tile", EL_ICO[k[0]] + "<span>" + esc(k[1]) + "</span>"); b.type = "button"; b.title = "Draw a " + k[1].toLowerCase() + ": drag on the picture"; b.addEventListener("click", function () { PE.optSet("shape", "kind", k[0]); PE.setTool("shape"); PE.toast("Drag on the picture to draw the " + k[1].toLowerCase()); });
				grid.appendChild(b);
			});
			var eq = el("button", "pe-drawer-tile", EL_ICO.eq + "<span>Equation</span>"); eq.type = "button"; eq.addEventListener("click", function () { PE.dlgEquation && PE.dlgEquation(null, null); }); grid.appendChild(eq);
			body.appendChild(grid);
		} else if (id === "draw") {
			body.appendChild(btn("Brush", "pe-drawer-wide", null, function () { PE.setTool("brush"); })); body.appendChild(btn("Eraser", "pe-drawer-wide", null, function () { PE.setTool("eraser"); }));
			body.appendChild(btn("Highlighter", "pe-drawer-wide", null, function () { PE.optSet("shape", "kind", "highlight"); PE.setTool("shape"); }));
			body.appendChild(el("p", "pe-drawer-p", "Pick the colour in the Colour panel on the right; size and softness are in the bar above the picture."));
		} else if (id === "crop") {
			body.appendChild(btn("Crop the picture", "pe-btn--primary pe-drawer-wide", null, function () { PE.setTool("crop"); }));
			body.appendChild(btn("Rotate / straighten…", "pe-drawer-wide", null, function () { if (PE.doc) PE.dlgStraighten(); }));
			body.appendChild(btn("Resize the picture…", "pe-drawer-wide", null, function () { if (PE.doc) PE.dlgImageSize(); }));
			body.appendChild(btn("Remove the background (AI)…", "pe-drawer-wide", null, function () { if (PE.aiRemoveBackground) PE.aiRemoveBackground(); }));
		} else if (id === "adjust") { PE.showAdjust(true); }
		placeAdjust(); window.dispatchEvent(new Event("resize"));
	}
	/* in Simple mode the Adjust panel sits in the drawer, else at the top of the side panels */
	function placeAdjust() {
		if (!box) return; var side = $("pe-side"), sbar = side && side.querySelector(".pe-sbar");
		if (simple() && railSel === "adjust" && drawer) { var b = drawer.querySelector(".pe-drawer-b"); if (b && box.parentNode !== b) b.appendChild(box); }
		else if (side && box.parentNode !== side) side.insertBefore(box, sbar ? sbar.nextSibling : side.firstChild);
	}
	function setSimple(on) {
		var r = $("pe"); if (!r) return; buildRail(); r.classList.toggle("pe-simple", !!on); sset({ simple: !!on });
		var b = $("pe-simplebtn"); if (b) { b.setAttribute("aria-pressed", on ? "true" : "false"); b.innerHTML = on ? "⚙<span> Full editor</span>" : "✨<span> Simple</span>"; b.title = on ? "Show all tools (the full editor)" : "Simple mode: a big picture and a few easy tools (like Canva)"; }
		if (on && !railSel) openDrawer(PE.doc ? "adjust" : "uploads"); else if (!on) { if (railSel === "adjust") { railSel = ""; placeAdjust(); } else openDrawer(""); drawer.hidden = true; }
		placeAdjust(); setTimeout(function () { window.dispatchEvent(new Event("resize")); if (PE.doc && PE.fit) PE.fit(); }, 30);
	}
	PE.setSimple = setSimple; PE.isSimple = simple;

	/* ---------- top-bar buttons ---------- */
	function topButtons() {
		var tr = document.querySelector("#pe .pe-top-r"), save = $("pe-save"); if (!tr || $("pe-adjbtn")) return;
		var ab = el("button", "pe-ib pe-ib--txt", '◐<span> Adjust</span>'); ab.type = "button"; ab.id = "pe-adjbtn"; ab.setAttribute("aria-pressed", "false"); ab.title = "Quick adjust: brightness, contrast, colour sliders and one-click filters";
		ab.addEventListener("click", function () { if (simple()) { openDrawer(railSel === "adjust" ? "" : "adjust"); return; } PE.showAdjust(); });
		var sb = el("button", "pe-ib pe-ib--txt", "✨<span> Simple</span>"); sb.type = "button"; sb.id = "pe-simplebtn"; sb.setAttribute("aria-pressed", "false"); sb.title = "Simple mode: a big picture and a few easy tools (like Canva)"; sb.addEventListener("click", function () { setSimple(!simple()); });
		tr.insertBefore(sb, save || null); tr.insertBefore(ab, sb);
	}

	/* ---------- hand-over to / from the Compressor and the Image Converter ---------- */
	PE.sendPicture = function (to, what) {
		if (!PE.doc) { PE.toast("Open or create an image first"); return; } if (!I || !I.handoffSend) { window.open(to, "_blank"); return; }
		var c = PE.flatten(), name = (I.cleanFileName ? I.cleanFileName(PE.doc.name || "picture") : "picture") + ".png";
		// the tab must open inside the click: start the hand-over now, give it the PNG when it is ready
		var blobP = new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/png"); });
		var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) {}
		blobP.then(function (b) { return I.handoffPut([{ blob: b, name: name, type: "image/png" }]); }).then(function (id) {
			var url = to + "?handoff=" + encodeURIComponent(id); if (w && !w.closed) { try { w.opener = null; } catch (e) {} w.location.href = url; PE.toast("Opened " + what + " with your picture in a new tab"); }
			else PE.toast("Your browser blocked the new tab: allow pop-ups for mes.fm, or open " + url);
		}).catch(function () { if (w) w.close(); PE.toast("Could not hand the picture over (private window?): export it and open it there"); });
	};
	function receive() {
		if (!I || !I.handoffReceive || !/[?&]handoff=/.test(location.search)) return;
		I.handoffReceive().then(function (fs) { if (!fs.length) { PE.toast("That picture is no longer waiting here (hand-overs last an hour): open it again"); return; } PE.openFiles(fs, { place: !!PE.doc, how: "open" }); });
	}

	/* ---------- start (after app.js has built the editor) ---------- */
	function start() {
		if (!PE.openFiles) { setTimeout(start, 50); return; }
		topButtons(); build();
		var st = sget(); if (st.simple || /[?&]simple=1/.test(location.search) || ($("pe") && $("pe").dataset.start === "simple")) setSimple(true); else if (st.adjOpen) PE.showAdjust(true);
		receive();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(start, 0); }); else setTimeout(start, 0);
})();
