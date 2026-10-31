/* MES Photo Editor round 8 (2026-10-30): the Layer Style dialog, laid out like Photoshop's / Photopea's: a list of effects on the left (tick = on,
 * click the name = edit it), the settings of the selected effect on the right, live on the picture. Effects: Bevel and Emboss (inner / outer bevel,
 * emboss, pillow emboss; smooth / chisel hard / chisel soft; depth, direction, size, soften, angle, altitude, highlight and shadow mode / colour /
 * opacity), Stroke, Inner Shadow, Inner Glow, Satin, Color Overlay, Gradient Overlay, Outer Glow, Drop Shadow, plus Blending Options (blend mode,
 * opacity, fill opacity, the image's global light). The dialog floats: drag it by its title bar, it does not darken the picture, the picture can still
 * be zoomed and panned, and it turns see-through while a slider is dragged. The maths is MESPixel.fxPlanes (lib.js), drawn by core.js.
 * Also: Copy / Paste layer style (the layer's right-click menu and the dialog). */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel; if (!PE || !P || !P.fxPlanes) return;
	var el = function (t, c, h) { return PE.el(t, c, h); }, esc = function (s) { return PE.esc(s); };
	var clone = function (o) { return o == null ? null : JSON.parse(JSON.stringify(o)); };
	var MODES = PE.BLENDS.slice(0, 2).concat([["lighter", "Linear Dodge (Add)"]], PE.BLENDS.slice(2));
	var ITEMS = [["blend", "Blending options"], ["bevel", "Bevel and emboss"], ["outline", "Stroke"], ["ishadow", "Inner shadow"], ["iglow", "Inner glow"], ["satin", "Satin"], ["color", "Color overlay"], ["grad", "Gradient overlay"], ["oglow", "Outer glow"], ["shadow", "Drop shadow"], ["styles", "Ready-made styles"]];
	var NAME = {}; ITEMS.forEach(function (i) { NAME[i[0]] = i[1]; });
	var lastSel = null, fxClip = null;

	function R(k, label, min, max, val, unit, help, step) { return { k: k, label: label, type: "range", min: min, max: max, step: step || 1, val: val, unit: unit || "", help: help }; }
	function M(k, label, val) { return { k: k, label: label || "Blend mode", type: "select", options: MODES, val: val }; }
	function C(k, label, val) { return { k: k, label: label || "Colour", type: "color", val: val }; }
	var H = {
		depth: "How steep the bevel is: higher = stronger light and shadow on its slopes. Photoshop's Depth, 1 to 1000%.",
		size: "How far the effect reaches, in pixels on the image.",
		soften: "Blurs the bevel's shading so its edges look rounder and softer.",
		angle: "Where the light comes from, in degrees: 0 = from the right, 90 = from above, 120 = from the upper left (Photoshop's default).",
		alt: "How high the light is above the surface: low = long shadows and strong shading on the slopes, 90 = straight down (little shading).",
		gl: "Use the image's global light: every effect with this ticked shares one light, so changing the angle here changes it for all of them (on every layer).",
		spread: "Grows the shape before it is blurred: 0% = soft all the way, 100% = a hard edge.",
		choke: "Pushes the edge inward before it is blurred: 0% = soft, 100% = a hard edge.",
		fill: "Fill opacity fades the layer's own pixels but not its effects: set it to 0% to keep only the bevel, stroke or shadow (glass text, outlines).",
		knock: "Hides the drop shadow under the layer itself (it matters when Fill opacity is below 100%).",
		hiMode: "How the highlight mixes with the layer: Screen lightens (Photoshop's default), Normal paints the colour as it is.",
		style: "<p><b>Inner bevel</b>: the edge of the shape is raised inward. <b>Outer bevel</b>: a slope outside the shape. <b>Emboss</b>: both. <b>Pillow emboss</b>: the edge is pressed in. <b>Stroke emboss</b>: drawn as Emboss here.</p>",
		tech: "<p><b>Smooth</b>: round, soft slopes. <b>Chisel hard</b>: straight, sharp slopes (good on text). <b>Chisel soft</b>: straight slopes with softened corners.</p>"
	};
	function paramsFor(k, e, lt) {
		var ang = function (e2) { return e2.gl ? lt.angle : e2.angle; };
		switch (k) {
			case "bevel": return [{ k: "style", label: "Style", type: "select", options: [["inner", "Inner bevel"], ["outer", "Outer bevel"], ["emboss", "Emboss"], ["pillow", "Pillow emboss"], ["stroke", "Stroke emboss"]], val: e.style, help: H.style },
				{ k: "tech", label: "Technique", type: "select", options: [["smooth", "Smooth"], ["hard", "Chisel hard"], ["soft", "Chisel soft"]], val: e.tech, help: H.tech },
				R("depth", "Depth", 1, 1000, e.depth, "%", H.depth), { k: "dir", label: "Direction", type: "seg", options: [["up", "Up"], ["down", "Down"]], val: e.dir }, R("size", "Size", 0, 250, e.size, "px", H.size), R("soften", "Soften", 0, 16, e.soften, "px", H.soften),
				R("angle", "Angle", -180, 180, ang(e), "°", H.angle), R("alt", "Altitude", 0, 90, e.gl ? lt.alt : e.alt, "°", H.alt), { k: "gl", label: "Use global light", type: "check", val: e.gl, help: H.gl },
				M("hiMode", "Highlight mode", e.hiMode), C("hiC", "Highlight colour", e.hiC), R("hiOp", "Highlight opacity", 0, 100, Math.round(e.hiOp * 100), "%"),
				M("shMode", "Shadow mode", e.shMode), C("shC", "Shadow colour", e.shC), R("shOp", "Shadow opacity", 0, 100, Math.round(e.shOp * 100), "%")];
			case "outline": return [R("w", "Size", 1, 250, e.w, "px"), { k: "pos", label: "Position", type: "seg", options: [["outside", "Outside"], ["center", "Centre"], ["inside", "Inside"]], val: e.pos, help: "<p><b>Outside</b>: around the edge, the layer is not covered. <b>Centre</b>: half outside, half over the edge. <b>Inside</b>: over the edge of the layer itself.</p>" }, M("mode", null, e.mode), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%"), C("c", "Fill colour", e.c)];
			case "ishadow": return [M("mode", null, e.mode), C("c", "Colour", e.c), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%"), R("angle", "Angle", -180, 180, ang(e), "°", H.angle), { k: "gl", label: "Use global light", type: "check", val: e.gl, help: H.gl }, R("dist", "Distance", 0, 300, e.dist, "px"), R("choke", "Choke", 0, 100, e.choke, "%", H.choke), R("size", "Size", 0, 250, e.size, "px", H.size)];
			case "iglow": return [M("mode", null, e.mode), C("c", "Colour", e.c), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%"), { k: "src", label: "Source", type: "seg", options: [["center", "Centre"], ["edge", "Edge"]], val: e.src, help: "Edge: the glow comes in from the edges. Centre: it shines out of the middle." }, R("choke", "Choke", 0, 100, e.choke, "%", H.choke), R("size", "Size", 0, 250, e.size, "px", H.size)];
			case "satin": return [M("mode", null, e.mode), C("c", "Colour", e.c), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%"), R("angle", "Angle", -180, 180, e.angle, "°"), R("dist", "Distance", 1, 250, e.dist, "px"), R("size", "Size", 0, 250, e.size, "px"), { k: "invert", label: "Invert", type: "check", val: e.invert }];
			case "color": return [M("mode", null, e.mode), C("c", "Colour", e.c), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%")];
			case "grad": return [M("mode", null, e.mode), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%"), { k: "reverse", label: "Reverse", type: "check", val: e.reverse }, { k: "type", label: "Style", type: "select", options: [["linear", "Linear"], ["radial", "Radial"], ["angle", "Angle"], ["reflected", "Reflected"], ["diamond", "Diamond"]], val: e.type }, R("angle", "Angle", -180, 180, e.angle, "°", "90° = from the bottom (first colour) to the top (last colour)."), R("scale", "Scale", 10, 150, e.scale, "%")];
			case "oglow": return [M("mode", null, e.mode), C("c", "Colour", e.c), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%"), R("spread", "Spread", 0, 100, e.spread, "%", H.spread), R("size", "Size", 0, 250, e.size, "px", H.size)];
			case "shadow": return [M("mode", null, e.mode), C("c", "Colour", e.c), R("op", "Opacity", 0, 100, Math.round(e.op * 100), "%"), R("angle", "Angle", -180, 180, ang(e), "°", H.angle), { k: "gl", label: "Use global light", type: "check", val: e.gl, help: H.gl }, R("dist", "Distance", 0, 300, e.dist, "px"), R("spread", "Spread", 0, 100, e.spread, "%", H.spread), R("blur", "Size", 0, 250, e.blur, "px", H.size), { k: "knock", label: "Layer knocks out drop shadow", type: "check", val: e.knock !== false, help: H.knock }];
		}
		return [];
	}
	var PCT = { op: 1, hiOp: 1, shOp: 1 };
	/* ready-made styles (the user's title text style first: a yellow / purple chisel bevel with a drop shadow) */
	var PRESETS = [
		["Gold title", "Smooth bevel, yellow highlight, purple shadow, drop shadow", { bevel: { on: true, style: "inner", tech: "smooth", depth: 339, dir: "up", size: 5, soften: 0, angle: 120, alt: 30, gl: true, hiMode: "source-over", hiC: "#ffff00", hiOp: 1, shMode: "source-over", shC: "#7a1f9c", shOp: 1 }, shadow: { on: true, c: "#000000", op: 0.75, mode: "multiply", angle: 120, dist: 6, spread: 0, blur: 8, gl: true, knock: true } }],
		["Chrome", "Silver gradient, hard bevel, dark stroke", { grad: { on: true, op: 1, mode: "source-over", type: "linear", angle: 90, scale: 100, reverse: false, stops: [{ p: 0, c: "#5a5a66", a: 1 }, { p: 0.48, c: "#f2f2f7", a: 1 }, { p: 0.52, c: "#9a9aa6", a: 1 }, { p: 1, c: "#ffffff", a: 1 }] }, bevel: { on: true, style: "inner", tech: "hard", depth: 250, size: 4, soften: 1, gl: true }, outline: { on: true, w: 2, c: "#222228", pos: "outside", op: 1, mode: "source-over" } }],
		["Sticker", "Thick white outline and a soft shadow", { outline: { on: true, w: 10, c: "#ffffff", pos: "outside", op: 1, mode: "source-over" }, shadow: { on: true, c: "#000000", op: 0.5, mode: "multiply", angle: 120, dist: 6, spread: 0, blur: 12, gl: true, knock: true } }],
		["Neon glow", "Coloured outer glow and a light inner glow", { color: { on: true, c: "#ffffff", op: 1, mode: "source-over" }, oglow: { on: true, c: "#ff2bd6", op: 1, mode: "screen", size: 22, spread: 8 }, iglow: { on: true, c: "#ff8ef0", op: 0.9, mode: "screen", size: 6, choke: 0, src: "edge" } }],
		["Embossed", "Pressed into the background", { fill: 0, bevel: { on: true, style: "inner", tech: "smooth", depth: 140, dir: "down", size: 4, soften: 1, gl: true, hiMode: "screen", hiC: "#ffffff", hiOp: 0.8, shMode: "multiply", shC: "#000000", shOp: 0.7 } }],
		["Cut-out shadow", "Inner shadow, as if cut into the picture", { ishadow: { on: true, c: "#000000", op: 0.8, mode: "multiply", angle: 120, dist: 4, choke: 0, size: 6, gl: true }, outline: { on: true, w: 1, c: "#000000", pos: "inside", op: 0.35, mode: "source-over" } }]
	];

	PE.copyLayerStyle = function (L) { L = L || PE.active(); if (!L || !PE.hasFx(L)) { PE.toast("This layer has no layer style to copy"); return; } fxClip = clone(L.fx); PE.toast("Layer style copied: select another layer and Paste layer style"); };
	PE.pasteLayerStyle = function (L) {
		L = L || PE.active(); if (!fxClip) { PE.toast("Copy a layer style first (right-click a layer that has one)"); return; } if (!L || PE.isGroup(L)) { PE.toast("Select a layer (not a group)"); return; } if (L.locked) { PE.toast("This layer is locked"); return; }
		L.fx = clone(fxClip); PE.invalidate(); PE.commit("Paste layer style"); PE.emit("layers");
	};
	PE.hasStyleClip = function () { return !!fxClip; };

	PE.dlgLayerStyle = function (L, focus) {
		L = L || PE.active(); if (!PE.doc || !L) { PE.toast("Open an image first"); return; }
		if (PE.isGroup(L)) { PE.toast("Select a layer (not a group) to give it a layer style"); return; }
		if (L.locked) { PE.toast("This layer is locked"); return; }
		var id = L.id, cur = function () { return PE.layerById(id); }, d = PE.doc, done = false;
		var old = { fx: clone(L.fx), blend: L.blend, opacity: L.opacity, light: d.light ? Object.assign({}, d.light) : null };
		var F = P.fxNorm(L.fx), st = { blend: L.blend, opacity: L.opacity }, lt = Object.assign({ angle: 120, alt: 30 }, d.light || {});
		var sel = focus === "glow" ? "oglow" : focus || null;
		if (sel && F[sel] && typeof F[sel] === "object" && !F[sel].on) F[sel].on = true;
		if (!sel) { sel = lastSel || "blend"; for (var i = 1; i < ITEMS.length - 1; i++) if (F[ITEMS[i][0]].on) { sel = ITEMS[i][0]; break; } }
		var wrap = el("div", "pe-ls"), list = el("div", "pe-ls-list"), pane = el("div", "pe-ls-pane"); list.setAttribute("role", "list"); wrap.appendChild(list); wrap.appendChild(pane);
		var rows = {};
		ITEMS.forEach(function (it) {
			var k = it[0], row = el("div", "pe-ls-item"); row.setAttribute("role", "listitem"); rows[k] = row;
			if (k !== "blend" && k !== "styles") { var cb = el("input"); cb.type = "checkbox"; cb.setAttribute("aria-label", it[1] + " on / off"); cb.addEventListener("change", function () { F[k].on = cb.checked; if (cb.checked) select(k); else live(); }); row.appendChild(cb); row._cb = cb; }
			else row.appendChild(el("span", "pe-ls-sp"));
			var b = el("button", "pe-ls-name", esc(it[1])); b.type = "button"; b.addEventListener("click", function () { if (k !== "blend" && k !== "styles" && !F[k].on) F[k].on = true; select(k); }); row.appendChild(b);
			list.appendChild(row);
		});
		function syncList() { ITEMS.forEach(function (it) { var r = rows[it[0]]; r.classList.toggle("is-sel", it[0] === sel); r.querySelector(".pe-ls-name").setAttribute("aria-current", it[0] === sel ? "true" : "false"); if (r._cb) r._cb.checked = !!F[it[0]].on; }); }
		function live() {
			var Lc = cur(); if (!Lc) return; Lc.fx = P.fxAny(F) ? clone(F) : null; Lc.blend = st.blend; Lc.opacity = st.opacity;
			if (lt.angle !== (d.light || {}).angle || lt.alt !== (d.light || {}).alt) { d.light = { angle: lt.angle, alt: lt.alt }; d.layers.forEach(function (x) { x._fxc = null; }); }
			syncList(); PE.invalidate();
		}
		function gradEditor(g) {
			var box = el("div", "pe-gred"), bar = el("div", "pe-gred-bar"), stops = el("div", "pe-gred-stops"), tools = el("div", "pe-gred-tools");
			box.appendChild(bar); box.appendChild(stops); box.appendChild(tools);
			function css() { return "linear-gradient(to right, " + g.stops.map(function (s) { var c = P.hexToRgb(s.c); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + s.a + ") " + Math.round(s.p * 100) + "%"; }).join(", ") + "), repeating-conic-gradient(#888 0 25%, #bbb 0 50%) 0 0 / 10px 10px"; }
			function draw() {
				bar.style.background = css(); stops.innerHTML = "";
				g.stops.forEach(function (s, i) {
					var r = el("div", "pe-gred-row"), c = el("input"); c.type = "color"; c.value = s.c; c.dataset.ck = "grad:" + i; c.dataset.cname = "Gradient colour " + (i + 1); c.addEventListener("input", function () { s.c = c.value; bar.style.background = css(); live(); });
					var at = el("input", "pe-num"); at.type = "number"; at.min = 0; at.max = 100; at.value = Math.round(s.p * 100); at.title = "Where this colour is (0% = start, 100% = end)"; at.setAttribute("aria-label", "Location of colour " + (i + 1) + " (%)");
					at.addEventListener("change", function () { s.p = P.clamp((+at.value || 0) / 100, 0, 1); g.stops.sort(function (a, b) { return a.p - b.p; }); draw(); live(); });
					var op = el("input", "pe-num"); op.type = "number"; op.min = 0; op.max = 100; op.value = Math.round(s.a * 100); op.title = "Opacity of this colour (%)"; op.setAttribute("aria-label", "Opacity of colour " + (i + 1) + " (%)"); op.addEventListener("input", function () { s.a = P.clamp((+op.value || 0) / 100, 0, 1); bar.style.background = css(); live(); });
					var x = el("button", "pe-mini pe-mini--s", "✕"); x.type = "button"; x.title = "Remove this colour"; x.disabled = g.stops.length <= 2; x.addEventListener("click", function () { g.stops.splice(i, 1); draw(); live(); });
					r.appendChild(c); r.appendChild(el("span", "pe-gred-l", "at")); r.appendChild(at); r.appendChild(el("span", "pe-gred-l", "% · opacity")); r.appendChild(op); r.appendChild(el("span", "pe-gred-l", "%")); r.appendChild(x); stops.appendChild(r);
				});
			}
			var add = el("button", "pe-btn pe-btn--sm", "+ Add colour"); add.type = "button"; add.addEventListener("click", function () { var a = g.stops[0], b = g.stops[g.stops.length - 1], m = P.gradAt(g.stops, 0.5); g.stops.push({ p: 0.5, c: P.rgbToHex(m[0], m[1], m[2]), a: m[3] }); g.stops.sort(function (x, y) { return x.p - y.p; }); void a; void b; draw(); live(); }); tools.appendChild(add);
			[["Black → white", [["#000000", 1], ["#ffffff", 1]]], ["Colour → clear", [["#ffffff", 1], ["#ffffff", 0]]], ["Gold", [["#7a4a00", 1], ["#ffd76a", 1], ["#fff6c8", 1], ["#b07a10", 1]]], ["Sunset", [["#2b1055", 1], ["#d53369", 1], ["#ffb347", 1]]], ["Rainbow", [["#ff0000", 1], ["#ffff00", 1], ["#00ff00", 1], ["#00ffff", 1], ["#0000ff", 1], ["#ff00ff", 1]]]].forEach(function (pr) {
				var b = el("button", "pe-chip2", esc(pr[0])); b.type = "button"; b.addEventListener("click", function () { var n = pr[1].length; g.stops = pr[1].map(function (q, i) { return { p: n === 1 ? 0 : i / (n - 1), c: q[0], a: q[1] }; }); draw(); live(); }); tools.appendChild(b);
			});
			draw(); return box;
		}
		function select(k) {
			sel = k; lastSel = k; pane.innerHTML = ""; live();   // live(): picking an effect by its name switches it on, show that at once
			var head = el("div", "pe-ls-ph"); head.appendChild(el("b", null, esc(NAME[k]))); pane.appendChild(head);
			if (k === "styles") {
				pane.appendChild(el("p", "pe-hint2", "Click one to replace this layer's style with it, then fine-tune it in the list on the left."));
				var g = el("div", "pe-ls-presets");
				PRESETS.forEach(function (pr) { var b = el("button", "pe-ls-preset", "<b>" + esc(pr[0]) + "</b><span>" + esc(pr[1]) + "</span>"); b.type = "button"; b.addEventListener("click", function () { F = P.fxNorm(pr[2]); live(); var first = "blend"; for (var i = 1; i < ITEMS.length - 1; i++) if (F[ITEMS[i][0]].on) { first = ITEMS[i][0]; break; } select(first); }); g.appendChild(b); });
				pane.appendChild(g); return;
			}
			if (k === "blend") {
				var fb = PE.form([{ k: "blend", label: "Blend mode", type: "select", options: PE.BLENDS, val: st.blend }, R("opacity", "Opacity", 0, 100, Math.round(st.opacity * 100), "%"), R("fill", "Fill opacity", 0, 100, Math.round(F.fill * 100), "%", H.fill),
					R("angle", "Global light angle", -180, 180, lt.angle, "°", H.gl), R("alt", "Global light altitude", 0, 90, lt.alt, "°", H.alt)], function () { var v = fb.get(); st.blend = v.blend; st.opacity = P.clamp(v.opacity / 100, 0, 1); F.fill = P.clamp(v.fill / 100, 0, 1); lt.angle = v.angle; lt.alt = v.alt; live(); });
				pane.appendChild(fb.el); pane.appendChild(el("p", "pe-hint2", "Not here yet: channels, Blend If, knockout, Pattern overlay and the Contour / Texture options of Bevel and emboss.")); return;
			}
			var e = F[k], params = paramsFor(k, e, lt), f = PE.form(params, function () {
				var v = f.get(); params.forEach(function (p) { var val = v[p.k]; if (PCT[p.k]) val = val / 100; e[p.k] = val; });
				if ((k === "bevel" || k === "shadow" || k === "ishadow") && e.gl) { lt.angle = e.angle; if (k === "bevel") lt.alt = e.alt; }
				if (e.gl !== undefined && v.gl !== undefined) { var was = f._gl; if (was !== v.gl && v.gl) { f.set("angle", lt.angle); e.angle = lt.angle; if (k === "bevel") { f.set("alt", lt.alt); e.alt = lt.alt; } } f._gl = v.gl; }
				e.on = true; live();
			});
			f._gl = e.gl; pane.appendChild(f.el);
			if (k === "grad") pane.insertBefore(gradEditor(e), f.el.nextSibling);
			var reset = el("button", "pe-btn pe-btn--sm pe-ls-reset", "Reset to default"); reset.type = "button"; reset.title = "Put this effect's settings back to Photoshop's defaults"; reset.addEventListener("click", function () { F[k] = Object.assign(clone(P.FXDEF[k]), { on: true }); live(); select(k); }); pane.appendChild(reset);
		}
		live(); select(sel);
		var avoid = null; try { var bx = PE.bounds(L), q0 = PE.toScreen(bx.x, bx.y), q1 = PE.toScreen(bx.x + bx.w, bx.y + bx.h), orr = PE.els.over.getBoundingClientRect(); avoid = { left: orr.left + Math.min(q0.x, q1.x), right: orr.left + Math.max(q0.x, q1.x) }; } catch (e) {}
		var m = PE.modal({ title: "Layer style: " + L.name, body: wrap, float: true, avoid: avoid, wide: true, cls: "pe-dlg--lstyle", key: "lstyle", noFocus: true,
			onClose: function () { if (!done) { var Lc = cur(); if (Lc) { Lc.fx = old.fx; Lc.blend = old.blend; Lc.opacity = old.opacity; } d.light = old.light; d.layers.forEach(function (x) { x._fxc = null; }); PE.invalidate(); } },
			buttons: [
				{ label: "Remove style", title: "Switch every effect off and remove the style", act: function (mm) { done = true; var Lc = cur(); if (Lc) { Lc.fx = null; Lc.blend = old.blend; Lc.opacity = old.opacity; PE.commit("Remove layer style"); PE.emit("layers"); } mm.close(); } },
				{ label: "Copy style", title: "Copy this style to paste it on other layers (right-click a layer → Paste layer style)", act: function () { fxClip = clone(F); PE.toast("Layer style copied"); } },
				{ label: "Cancel", act: function (mm) { mm.close(); } },
				{ label: "OK", primary: true, act: function (mm) { done = true; live(); PE.commit("Layer style"); PE.emit("layers"); mm.close(); } }] });
		return m;
	};
})();
