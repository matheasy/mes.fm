/* German New Medicine explorer UI: two-phase chart with a draggable marker, "describe your symptoms" matcher, organ / brain-relay picker,
   the Five Biological Laws with diagrams, glossary popovers. Data + maths: MESGNM (lib.js, node-tested: tool_apps_src/gnm-tests.js).
   Settings: localStorage mes-gnm:v1 = {sc, A, D, t, organ, layer, law} (the symptom text is never saved). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("gn"); if (!root || !window.MESGNM) return;
	var G = window.MESGNM, KEY = "mes-gnm:v1", NS = "http://www.w3.org/2000/svg";
	function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var saved = load(), saveT;
	function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 250); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function q(id) { return G.GLOSSARY[id] ? '<button type="button" class="gn-q" data-g="' + id + '" aria-label="What is ' + esc(G.GLOSSARY[id][0]) + '?">?</button>' : ""; }

	var S = {
		sc: G.SCEN[saved.sc] ? saved.sc : "classic",
		A: num(saved.A, 0.2, 1, 0.7), D: num(saved.D, 0.2, 1, 0.5),
		t: num(saved.t, 0, 1, 0.3),            /* marker as a fraction of the time axis */
		organ: G.ORGAN_BY[saved.organ] ? saved.organ : "bronchi",
		layer: G.LAYERS[saved.layer] ? saved.layer : "",
		law: num(saved.law, 0, 4, 0)
	};
	var qs = new URLSearchParams(location.search);
	if (G.ORGAN_BY[qs.get("organ")]) S.organ = qs.get("organ");
	var M = G.build({ scenario: S.sc, intensity: S.A, duration: S.D });

	/* ---------------------------------------------------------------- svg helpers */
	function el(name, attrs, parent) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
	function txt(parent, x, y, s, cls, extra) { var a = { x: x, y: y, "class": cls || "gn-st" }; if (extra) for (var k in extra) a[k] = extra[k]; var e = el("text", a, parent); e.textContent = s; return e; }

	/* ---------------------------------------------------------------- chart */
	/* The classic two-phase chart (after Dr. Ryke Geerd Hamer): day phase / sympathicotonia above the normotonia line (blue), night phase /
	   vagotonia below (red), DHS and CL triangles on the line, the epileptoid crisis spike with its box, PCL-A / PCL-B labels in the troughs,
	   dashed phase dividers, and the "Conflict-active phase" / "Healing phase" bars underneath. Drawn from the same MESGNM model, so the
	   course buttons and sliders reshape it. */
	var CH = $("gn-chart"), W = 1000, H = 560, L = 150, R = 16, TOP = 62, PB = 400, Y1 = 1.18, Y0 = -1.08;
	function X(t) { return L + (W - L - R) * t / M.T; }
	function Y(v) { return TOP + (PB - TOP) * (Y1 - v) / (Y1 - Y0); }
	function tOfX(x) { return clamp((x - L) / (W - L - R), 0, 1) * M.T; }
	var mk = {};
	/* spans of the bars underneath: active = DHS .. CL, healing = CL .. back to normotonia (or the next DHS) */
	function spans() {
		var out = [], cur = null;
		M.segs.forEach(function (s) {
			var kind = s.p === "norm" ? null : (s.p === "dhs" || s.p === "ca") ? "act" : "heal";
			if (cur && cur.k === kind) { cur.t1 = s.t1; cur.open = cur.open || !!s.open; return; }
			if (cur) out.push(cur);
			cur = kind ? { k: kind, t0: s.t0, t1: s.t1, open: !!s.open } : null;
		});
		if (cur) out.push(cur);
		return out;
	}
	function drawChart() {
		var nar = (CH.getBoundingClientRect().width || 900) < 720;   /* phones: a narrower drawing, so the text stays readable */
		W = nar ? 640 : 1000; H = nar ? 640 : 560; L = nar ? 112 : 150; TOP = nar ? 78 : 62; PB = nar ? 450 : 400;
		CH.setAttribute("viewBox", "0 0 " + W + " " + H); CH.classList.toggle("gn-chart--n", nar);
		CH.innerHTML = "";
		var fs = nar ? 1.45 : 1, uid = "gnc", defs = el("defs", {}, CH), y0 = Y(0), bot = H - (nar ? 6 : 4);
		/* clip regions: program phases above / below the line, normotonia stretches on their own */
		var cUp = el("clipPath", { id: uid + "u" }, defs), cDn = el("clipPath", { id: uid + "d" }, defs), cN = el("clipPath", { id: uid + "n" }, defs);
		M.segs.forEach(function (sg) {
			var x0 = X(sg.t0), w = Math.max(0.5, X(sg.t1) - x0);
			if (sg.p === "norm") el("rect", { x: x0, y: 0, width: w, height: H }, cN);
			else { el("rect", { x: x0, y: 0, width: w, height: y0 }, cUp); el("rect", { x: x0, y: y0, width: w, height: H }, cDn); }
		});
		/* axis labels */
		var ax = function (y, a, b, cls) { txt(CH, L - 10, y, a, "gn-st gn-ax " + cls, { "text-anchor": "end" }); if (b) txt(CH, L - 10, y + 17 * fs, b, "gn-st gn-ax " + cls, { "text-anchor": "end" }); };
		if (nar) { ax(Y(0.72), "Day", "phase ↑", "gn-ax--up"); ax(y0 + 7, "Normal", "", ""); ax(Y(-0.5), "Night", "phase ↓", "gn-ax--dn"); }
		else { ax(Y(0.78), "Day phase:", "Sympathicotonia", "gn-ax--up"); ax(y0 + 5, "Normotonia", "", ""); ax(Y(-0.5), "Night phase:", "Vagotonia", "gn-ax--dn"); }
		/* the curve and its fills */
		var pts = G.sample(M, 700), d = "", a = "M" + X(0) + "," + y0;
		pts.forEach(function (p, i) { var c = X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); d += (i ? "L" : "M") + c; a += "L" + c; });
		a += "L" + X(M.T) + "," + y0 + "Z";
		el("path", { d: a, "class": "gn-fill-n", "clip-path": "url(#" + uid + "n)" }, CH);
		el("path", { d: a, "class": "gn-fill-act", "clip-path": "url(#" + uid + "u)" }, CH);
		el("path", { d: a, "class": "gn-fill-heal", "clip-path": "url(#" + uid + "d)" }, CH);
		el("line", { x1: L, x2: W - R, y1: y0, y2: y0, "class": "gn-base" }, CH);
		/* dashed dividers at every phase change of a program (DHS, CL, crisis start / end, end of healing) */
		var vx = {};
		M.segs.forEach(function (sg, i) {
			var prev = M.segs[i - 1];
			if (sg.p === "dhs" || sg.p === "cl" || sg.p === "ec") vx[X(sg.t0).toFixed(1)] = 1;
			if (sg.p === "ec") vx[X(sg.t1).toFixed(1)] = 1;
			if (sg.p === "norm" && prev && prev.p !== "norm") vx[X(sg.t0).toFixed(1)] = 1;
		});
		Object.keys(vx).forEach(function (x) { el("line", { x1: x, x2: x, y1: TOP - 30 * fs, y2: bot - (nar ? 74 : 60), "class": "gn-vdash" }, CH); });
		el("path", { d: d, "class": "gn-curve" }, CH);
		/* trough / spike labels */
		M.segs.forEach(function (sg) {
			var xm = (X(sg.t0) + X(sg.t1)) / 2, w = X(sg.t1) - X(sg.t0);
			if (sg.p === "pcla" || sg.p === "pclb") {
				txt(CH, xm, y0 - 8, sg.p === "pcla" ? "PCL-A" : "PCL-B", "gn-st gn-ph", { "text-anchor": "middle" });
				var lw = (sg.p === "pcla" ? 76 : 66) * (nar ? 1.08 : 1), tl = (sg.t1 - sg.t0) * lw / 2 / Math.max(1, w), sh = -1, best = (sg.t0 + sg.t1) / 2;
				/* put the label where the trough is deepest across its whole width, so it never crosses the curve */
				for (var k = 0; k <= 16; k++) {
					var tc = sg.t0 + tl + (sg.t1 - sg.t0 - 2 * tl) * k / 16;
					var dd = Math.min(Y(G.levelAt(M, tc - tl)), Y(G.levelAt(M, tc + tl)), Y(G.levelAt(M, tc))) - y0;
					if (dd > sh) { sh = dd; best = tc; }
				}
				xm = X(best);
				if (w > lw + 6 && sh > 30 * (nar ? 1.2 : 1)) {
					var two = sg.p === "pcla" && sh > 56 * (nar ? 1.2 : 1), yy = y0 + (two ? sh * 0.42 : sh * 0.6) + 2;
					if (sg.p === "pcla") { txt(CH, xm, yy, "Exudation", "gn-st gn-in", { "text-anchor": "middle" }); if (two) txt(CH, xm, yy + 18 * (nar ? 1.2 : 1), "edema", "gn-st gn-in gn-in--b", { "text-anchor": "middle" }); }
					else if (!sg.hang) txt(CH, xm, yy, "Scarring", "gn-st gn-in", { "text-anchor": "middle" });
				}
			}
		});
		/* DHS / CL triangles on the line, the crisis box with an arrow at its peak */
		var tw = 62 * (nar ? 1.25 : 1), th = 40 * (nar ? 1.25 : 1);
		M.events.forEach(function (e) {
			var x = X(e.t);
			if (e.id === "dhs" || e.id === "rec" || e.id === "cl") {
				var g = el("g", { "class": "gn-tri" + (e.id === "cl" ? " gn-tri--cl" : "") }, CH);
				el("path", { d: "M" + (x - tw / 2) + "," + (y0 - th) + "L" + (x + tw / 2) + "," + (y0 - th) + "L" + x + "," + y0 + "Z" }, g);
				txt(g, x, y0 - th + 15 * fs + 1, e.id === "cl" ? "CL" : "DHS", "gn-st gn-tri-t", { "text-anchor": "middle" });
				if (e.id === "rec" || /track/.test(e.label)) txt(CH, x, y0 + 20 * fs, "track", "gn-st gn-small", { "text-anchor": "middle" });
			} else if (e.id === "ec") {
				var py = Y(G.levelAt(M, e.t)), bw = nar ? 230 : 190, bh = nar ? 38 : 30, by = TOP - (nar ? 72 : 58), bx = clamp(x - bw / 2, L, W - R - bw);
				el("line", { x1: x, x2: x, y1: by + bh, y2: py - 14, "class": "gn-ecline" }, CH);
				el("path", { d: "M" + (x - 9) + "," + (py - 2) + "L" + (x + 9) + "," + (py - 2) + "L" + x + "," + (py - 22) + "Z", "class": "gn-ecarrow" }, CH);
				var gg = el("g", { "class": "gn-ecbox" }, CH); el("rect", { x: bx, y: by, width: bw, height: bh, rx: 4 }, gg);
				txt(gg, bx + bw / 2, by + bh / 2 + 5 * fs, "Epileptoid crisis", "gn-st gn-ecbox-t", { "text-anchor": "middle" });
			} else {
				var ly = e.id === "open" || e.id === "hang" ? Y(G.levelAt(M, e.t)) + (e.id === "open" ? -14 : 26) : y0 - 12;
				txt(CH, X(e.t), ly, e.label, "gn-st gn-ev", { "text-anchor": "end" });
			}
		});
		/* the phase bars underneath */
		var barY = PB + (nar ? 44 : 36), barH = nar ? 52 : 44;
		spans().forEach(function (sp) {
			var x0 = X(sp.t0) + 3, x1 = X(sp.t1) - 3, w = x1 - x0; if (w < 6) return;
			var g = el("g", { "class": sp.k === "act" ? "gn-bar gn-bar--act" : "gn-bar gn-bar--heal" }, CH);
			el("rect", { x: x0, y: barY, width: w, height: barH, rx: 3 }, g);
			var big = sp.k === "act" ? ["Conflict-active", "phase"] : ["Healing", "phase"], cm = (x0 + x1) / 2;
			if (w > 150 * fs) txt(g, cm, barY + barH / 2 + 5 * fs, big.join(" "), "gn-st gn-bar-t", { "text-anchor": "middle" });
			else if (w > 66 * fs) { txt(g, cm, barY + barH / 2 - 2, big[0], "gn-st gn-bar-t gn-bar-t--s", { "text-anchor": "middle" }); txt(g, cm, barY + barH / 2 + 14 * fs - 2, big[1], "gn-st gn-bar-t gn-bar-t--s", { "text-anchor": "middle" }); }
			var cap = sp.k === "act" ? (sp.open ? ["Prolonged", "sympathicotonia (no CL yet)"] : ["Prolonged", "sympathicotonia"]) : ["Prolonged", "vagotonia"];
			var cpx = nar ? 17 : 14;      /* caption font size: show it only where its longest line fits under the bar */
			if (w > 0.56 * cpx * Math.max(cap[0].length, cap[1].length)) { txt(CH, cm, barY + barH + cpx * 1.5, cap[0], "gn-st gn-cap", { "text-anchor": "middle" }); txt(CH, cm, barY + barH + cpx * 2.85, cap[1], "gn-st gn-cap", { "text-anchor": "middle" }); }
		});
		mk.line = el("line", { y1: TOP - 20, y2: PB + 20, "class": "gn-mline" }, CH);
		mk.halo = el("circle", { r: 15, "class": "gn-mhalo" }, CH);
		mk.dot = el("circle", { r: 8, "class": "gn-mdot" }, CH);
		mk.lab = txt(CH, 0, 0, "", "gn-st gn-mlab", { "text-anchor": "middle" });
		drawStrip(); placeMarker();
	}
	function drawStrip() {
		var box = $("gn-strip"), h = "", seen = {};
		M.segs.forEach(function (s, i) {
			var w = 100 * (s.t1 - s.t0) / M.T, P = G.PHASES[s.p];
			h += '<button type="button" class="gn-sp" data-i="' + i + '" style="flex:' + w.toFixed(3) + ' 1 0" title="' + esc(P.name) + '"><i style="background:' + P.color + '"></i><span>' + (w > 7 ? esc(P.short) : "") + "</span></button>";
			seen[s.p] = 1;
		});
		box.innerHTML = h;
	}
	function placeMarker() {
		var t = S.t * M.T, ph = G.phaseAt(M, t), x = X(t), y = Y(ph.y), P = G.PHASES[ph.p];
		mk.line.setAttribute("x1", x); mk.line.setAttribute("x2", x);
		[mk.halo, mk.dot].forEach(function (c) { c.setAttribute("cx", x); c.setAttribute("cy", y); });
		mk.dot.setAttribute("fill", P.color); mk.halo.setAttribute("stroke", P.color);
		mk.lab.textContent = P.short + (ph.rec ? " (recurrence)" : "");
		mk.lab.setAttribute("x", clamp(x, L + 50, W - R - 60)); mk.lab.setAttribute("y", ph.y > 0.6 ? y + 34 : ph.y < -0.6 ? y - 20 : y - 22);
		CH.setAttribute("aria-valuenow", Math.round(S.t * 100)); CH.setAttribute("aria-valuetext", P.name);
		[].forEach.call($("gn-strip").children, function (b) { var s = M.segs[+b.getAttribute("data-i")]; b.classList.toggle("is-on", s === ph.seg); });
		renderInfo(ph); save();
	}
	function setT(f) { S.t = clamp(f, 0, 1); placeMarker(); }
	function pointerT(ev) { var pt = CH.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var m = CH.getScreenCTM(); if (!m) return; var p = pt.matrixTransform(m.inverse()); setT(tOfX(p.x) / M.T); }
	/* mouse / pen drag at once; a finger only once the move is clearly sideways (or on a tap), so an up/down swipe scrolls the page */
	(function () {
		var id = null, on = false, sx = 0, sy = 0;
		function begin(ev) { on = true; try { CH.setPointerCapture(ev.pointerId); } catch (e) {} pointerT(ev); }
		CH.addEventListener("pointerdown", function (ev) { if (ev.button > 0) return; id = ev.pointerId; sx = ev.clientX; sy = ev.clientY; on = false; if (ev.pointerType !== "touch") { begin(ev); ev.preventDefault(); } });
		CH.addEventListener("pointermove", function (ev) {
			if (ev.pointerId !== id) return; if (on) { pointerT(ev); return; }
			var dx = Math.abs(ev.clientX - sx), dy = Math.abs(ev.clientY - sy);
			if (dx > 9 && dx > dy * 1.4) begin(ev); else if (dy > 12) id = null;
		});
		CH.addEventListener("pointerup", function (ev) { if (ev.pointerId !== id) return; if (!on && Math.abs(ev.clientX - sx) < 9 && Math.abs(ev.clientY - sy) < 9) pointerT(ev); on = false; id = null; });
		CH.addEventListener("pointercancel", function () { on = false; id = null; });
	})();
	function segIndexAt() { var t = S.t * M.T; for (var i = 0; i < M.segs.length; i++) if (t >= M.segs[i].t0 && t < M.segs[i].t1) return i; return M.segs.length - 1; }
	function goSeg(i) { i = clamp(i, 0, M.segs.length - 1); var s = M.segs[i], w = s.t1 - s.t0; setT((s.t0 + w * (w < 2 ? 0.5 : 0.45)) / M.T); }
	CH.addEventListener("keydown", function (ev) {
		var k = ev.key, step = ev.shiftKey ? 0.05 : 0.01;
		if (k === "ArrowRight" || k === "ArrowUp") setT(S.t + step);
		else if (k === "ArrowLeft" || k === "ArrowDown") setT(S.t - step);
		else if (k === "Home") setT(0); else if (k === "End") setT(1);
		else if (k === "PageDown") goSeg(segIndexAt() + 1); else if (k === "PageUp") goSeg(segIndexAt() - 1);
		else return;
		ev.preventDefault();
	});
	$("gn-strip").addEventListener("click", function (ev) { var b = ev.target.closest(".gn-sp"); if (b) goSeg(+b.getAttribute("data-i")); });

	/* controls */
	var scBox = $("gn-scen");
	Object.keys(G.SCEN).forEach(function (k) { var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-sc", k); b.textContent = G.SCEN[k].split(":")[0]; b.title = G.SCEN[k]; scBox.appendChild(b); });
	function paintScen() { [].forEach.call(scBox.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-sc") === S.sc ? "true" : "false"); }); }
	scBox.addEventListener("click", function (ev) { var b = ev.target.closest("button"); if (!b) return; S.sc = b.getAttribute("data-sc"); rebuild(); });
	var aIn = $("gn-a"), dIn = $("gn-d");
	aIn.value = S.A; dIn.value = S.D;
	function word(v) { return v < 0.4 ? "mild" : v < 0.7 ? "medium" : v < 0.9 ? "strong" : "very strong"; }
	function dword(v) { return v < 0.4 ? "short" : v < 0.7 ? "a while" : v < 0.9 ? "long" : "very long"; }
	function paintSliders() {
		$("gn-a-v").textContent = word(S.A); $("gn-d-v").textContent = dword(S.D);
		var mass = S.A * S.D;
		$("gn-mass").innerHTML = "Conflict mass " + q("mass") + " (intensity × duration): <b>" + (mass < 0.15 ? "small" : mass < 0.35 ? "moderate" : mass < 0.6 ? "large" : "very large") + "</b>. In GNM, the bigger the conflict mass, the deeper and longer the healing phase.";
	}
	aIn.addEventListener("input", function () { S.A = +aIn.value; rebuild(); });
	dIn.addEventListener("input", function () { S.D = +dIn.value; rebuild(); });
	function reflow() { var w = CH.getBoundingClientRect().width; if (w && (w < 720) !== (W < 1000)) drawChart(); }
	if (window.ResizeObserver) new ResizeObserver(reflow).observe(CH.parentNode); else window.addEventListener("resize", reflow);
	function rebuild() { M = G.build({ scenario: S.sc, intensity: S.A, duration: S.D }); paintScen(); paintSliders(); drawChart(); }

	/* ---------------------------------------------------------------- info panel */
	function hhSvg(look, color) {
		var id = "gnb" + Math.random().toString(36).slice(2, 7), rings = "", c = 50, s = '<svg viewBox="0 0 100 100" class="gn-hh" role="img" aria-label="Hamer focus: ' + look + '">';
		s += '<defs><filter id="' + id + '"><feGaussianBlur stdDeviation="' + (look === "blur" ? 1.4 : 2.6) + '"/></filter></defs>';
		s += '<ellipse cx="50" cy="50" rx="44" ry="46" class="gn-hh-brain"/>';
		var n = look === "squeeze" ? 4 : 5, step = look === "squeeze" ? 4 : 6.5;
		for (var i = 1; i <= n; i++) rings += '<circle cx="' + c + '" cy="' + c + '" r="' + (i * step) + '" fill="none" stroke="' + color + '" stroke-width="' + (look === "rings" ? 2 : 2.4) + '"/>';
		if (look === "none") s += '<text x="50" y="55" text-anchor="middle" class="gn-st gn-small">no focus</text>';
		else if (look === "rings") s += rings;
		else if (look === "blur") s += '<g filter="url(#' + id + ')">' + rings + "</g>";
		else if (look === "edema") s += '<circle cx="50" cy="50" r="38" class="gn-hh-edema" filter="url(#' + id + ')"/><g filter="url(#' + id + ')" opacity="0.6">' + rings + "</g>";
		else if (look === "squeeze") s += '<circle cx="50" cy="50" r="22" class="gn-hh-edema" opacity="0.5"/>' + rings;
		else if (look === "glia") s += '<circle cx="50" cy="50" r="17" class="gn-hh-glia"/><circle cx="50" cy="50" r="27" fill="none" class="gn-hh-glia2"/>';
		return s + "</svg>";
	}
	var LOOK = { none: "No Hamer focus for this program.", rings: "Sharp concentric rings (the target configuration): the relay is active.", blur: "The rings start to blur as edema begins.", edema: "Edema: blurred, swollen rings.", squeeze: "The crisis squeezes the edema out; the rings contract.", glia: "Glia is laid down: a white spot on CT." };
	function cellsRow(p) {
		var h = '<div class="gn-cells">';
		G.LAYER_ORDER.forEach(function (k) {
			var Ly = G.LAYERS[k], sg = G.cellSign(k, p), on = G.ORGAN_BY[S.organ].layer === k;
			var lab = sg === "+" ? "cells grow" : sg === "-" ? "cells lost" : sg === "+end" ? "rebuilt" : sg === "-end" ? "cleared" : "no change";
			var ic = sg === "+" || sg === "+end" ? "+" : sg === "-" || sg === "-end" ? "−" : "·";
			h += '<div class="gn-cell' + (on ? " is-on" : "") + '" title="' + esc(Ly.name + " (" + Ly.brain + "): " + lab) + '"><b style="background:' + Ly.color + ';color:' + Ly.fg + '">' + ic + "</b><span>" + esc(Ly.name) + "<small>" + lab + "</small></span></div>";
		});
		return h + "</div>";
	}
	function renderInfo(ph) {
		var P = G.PHASES[ph.p], o = G.ORGAN_BY[S.organ], Ly = G.LAYERS[o.layer], look = G.focusLook(ph.p), note = "";
		if (ph.rec) note = "This is a recurrence " + q("recurrence") + ": a track " + q("track") + " has re-triggered the same conflict, so the program is back in its active phase (usually shorter).";
		else if (ph.hang) note = "Hanging healing " + q("hanging") + ": this healing phase keeps being interrupted before the crisis, so the program never completes.";
		else if (ph.open) note = "The conflict has not been resolved, so in GNM the program stays in the active phase and the organ change goes on.";
		var micro = ph.p === "pcla" || ph.p === "ec" || ph.p === "pclb" ? Ly.microbes + " work on the " + o.name.toLowerCase() + " now (in GNM)." : P.microbes;
		var h = '<div class="gn-ihead"><span class="gn-badge" style="background:' + P.color + '">' + esc(P.short) + "</span><h3>" + esc(P.name) + " " + q(P.g) + "</h3></div>";
		h += '<p class="gn-isum">' + esc(P.sum) + "</p>";
		if (note) h += '<p class="gn-inote">' + note + "</p>";
		h += '<div class="gn-igrid">';
		h += '<div class="gn-ib"><h4>Psyche</h4><p>' + esc(P.psyche) + "</p></div>";
		h += '<div class="gn-ib"><h4>Body (vegetative)</h4><p>' + esc(P.body) + "</p></div>";
		h += '<div class="gn-ib gn-ib--org"><h4>Organ: ' + esc(o.name) + ' <span class="gn-lay" style="background:' + Ly.color + ';color:' + Ly.fg + '">' + esc(Ly.name) + "</span></h4><p>" + esc(G.organText(o, ph.p)) + '</p><button type="button" class="gn-link" data-go="org">Choose another organ ↓</button></div>';
		h += '<div class="gn-ib gn-ib--hh">' + hhSvg(look, Ly.color) + "<div><h4>Brain relay " + q("focus") + "</h4><p>" + esc(relayText(o)) + " " + esc(LOOK[look]) + "</p></div></div>";
		h += '<div class="gn-ib"><h4>Microbes ' + q("microbes") + "</h4><p>" + esc(micro) + "</p></div>";
		h += '<div class="gn-ib gn-ib--cells"><h4>Cells in this phase, by germ layer ' + q("oldbrain") + "</h4>" + cellsRow(ph.p) + "</div>";
		h += "</div>";
		$("gn-info").innerHTML = h;
	}
	$("gn-info").addEventListener("click", function (ev) { var b = ev.target.closest("[data-go=org]"); if (b) $("gn-orgcard").scrollIntoView({ behavior: "smooth", block: "start" }); });

	/* ---------------------------------------------------------------- describe your symptoms */
	var EX = ["cold hands, can't sleep, losing weight", "fever, swelling, tired", "cough and a runny nose", "chills, palpitations, cold sweat", "peeing a lot, energy coming back", "itchy rash that keeps coming back", "back pain and swollen joints", "baby with blood in the poop after feeds", "no fever, but I wake up at 3 and keep thinking about it"];
	$("gn-ask-ex").innerHTML = EX.map(function (e) { return '<button type="button" class="tu-chip" data-ex="' + esc(e) + '">' + esc(e) + "</button>"; }).join("");
	$("gn-ask-ex").addEventListener("click", function (ev) { var b = ev.target.closest("[data-ex]"); if (!b) return; $("gn-ask-in").value = b.getAttribute("data-ex"); ask(); });
	$("gn-ask-go").addEventListener("click", ask);
	$("gn-ask-clr").addEventListener("click", function () { $("gn-ask-in").value = ""; $("gn-ask-out").innerHTML = ""; $("gn-ask-in").focus(); });
	$("gn-ask-in").addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ask(); } });
	function ask() {
		var r = G.match($("gn-ask-in").value), out = $("gn-ask-out"), h = "";
		if (r.empty) { out.innerHTML = '<p class="tu-note">Type a few words first.</p>'; return; }
		var notesH = (r.notes || []).map(function (n) { return '<p class="gn-inote">' + esc(n.s) + "</p>"; }).join("");
		if (!r.phase && !r.organs.length) { out.innerHTML = '<div class="gn-askres"><p>No symptom words from the GNM list were found. Try plain words such as <i>cold hands</i>, <i>tired</i>, <i>fever</i>, <i>cough</i>, <i>rash</i>, <i>diarrhea</i>, <i>blood in the poop</i>, <i>chills</i>, <i>joint pain</i>.</p>' + notesH + "</div>"; return; }
		if (r.scenario === "hanging" && S.sc !== "hanging") { S.sc = "hanging"; rebuild(); }
		if (r.organs.length) { S.organ = r.organs[0].id; renderOrgans(); }
		if (r.phase) { var t = G.placeFor(M, r.phase, r.phase === "ca" ? 0.6 : 0.5); if (t != null) setT(t / M.T); else placeMarker(); } else placeMarker();
		if (r.phase) {
			var P = G.PHASES[r.phase];
			h += '<div class="gn-askres"><p class="gn-askhead"><span class="gn-badge" style="background:' + P.color + '">' + esc(P.short) + "</span> In GNM terms this reads most like <b>" + esc(P.name) + "</b> " + q(P.g) + (r.conf < 0.6 ? " (mixed signs: see below)" : "") + ".</p>";
		} else h += '<div class="gn-askres"><p class="gn-askhead">No clear phase signs, but organ words were found.</p>';
		/* score bars */
		var max = 0; G.ORDER.forEach(function (p) { max = Math.max(max, r.scores[p]); });
		if (max) {
			h += '<div class="gn-bars">';
			G.ORDER.forEach(function (p) { var v = r.scores[p]; if (!v) return; h += '<div class="gn-bar"><span>' + esc(G.PHASES[p].short) + '</span><i><b style="width:' + (100 * v / max).toFixed(0) + "%;background:" + G.PHASES[p].color + '"></b></i><em>' + v + "</em></div>"; });
			h += "</div>";
		}
		if (r.scenario === "hanging") h += '<p class="gn-inote">Words like "allergy", "keeps coming back" or "chronic" point, in GNM, to a track or a hanging healing ' + q("hanging") + ", so the chart now shows that course.</p>";
		h += notesH;
		h += '<h4>Why</h4><ul class="gn-why">' + r.why.map(function (w) { return "<li" + (w.neg ? ' class="is-neg"' : "") + "><b>" + esc(w.w) + "</b>: " + esc(w.s) + (w.neg ? "" : ' <span class="gn-tag" style="background:' + (G.PHASES[w.p] ? G.PHASES[w.p].color : "#64748b") + '">' + esc(G.PHASES[w.p] ? G.PHASES[w.p].short : "recurrence") + "</span>") + "</li>"; }).join("") + "</ul>";
		if (r.organs.length) {
			h += '<h4>Organ candidates</h4><div class="gn-cands">' + r.organs.map(function (c) { var o = G.ORGAN_BY[c.id], Ly = G.LAYERS[o.layer]; return '<button type="button" class="gn-cand' + (c.id === S.organ ? " is-on" : "") + '" data-org="' + c.id + '"><i style="background:' + Ly.color + '"></i><span><b>' + esc(o.name) + "</b><small>" + esc(Ly.name) + " · " + esc(Ly.brain) + " · matched: " + esc(c.hits.join(", ")) + "</small></span></button>"; }).join("") + "</div>";
		}
		h += '<p class="tu-note">The marker on the chart and the organ have been set from this. <button type="button" class="gn-link" data-go="chart">See it on the chart ↑</button></p></div>';
		out.innerHTML = h;
	}
	$("gn-ask-out").addEventListener("click", function (ev) {
		var c = ev.target.closest("[data-org]"); if (c) { S.organ = c.getAttribute("data-org"); renderOrgans(); placeMarker(); [].forEach.call($("gn-ask-out").querySelectorAll(".gn-cand"), function (b) { b.classList.toggle("is-on", b === c); }); return; }
		if (ev.target.closest("[data-go=chart]")) $("gn-chartcard").scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------------------------------------------------------------- organs, body and brain */
	function drawBody() {
		var B = $("gn-body"); B.innerHTML = "";
		el("path", { d: "M110,20c17,0 29,13 29,32c0,19 -12,34 -29,34c-17,0 -29,-15 -29,-34c0,-19 12,-32 29,-32Z", "class": "gn-sil" }, B);
		el("path", { d: "M98,84h24v14h-24Z", "class": "gn-sil" }, B);
		el("path", { d: "M64,104c10,-6 28,-8 46,-8s36,2 46,8c8,5 10,14 10,24l0,88c0,10 -4,24 -10,40l-4,10h-84l-4,-10c-6,-16 -10,-30 -10,-40l0,-88c0,-10 2,-19 10,-24Z", "class": "gn-sil" }, B);
		el("path", { d: "M62,108c-12,4 -18,16 -20,30l-10,88c-1,10 2,16 8,18c6,2 10,-2 12,-10l12,-80Z", "class": "gn-sil" }, B);
		el("path", { d: "M158,108c12,4 18,16 20,30l10,88c1,10 -2,16 -8,18c-6,2 -10,-2 -12,-10l-12,-80Z", "class": "gn-sil" }, B);
		el("path", { d: "M70,262h38l-4,150c0,10 -6,16 -14,16h-6c-6,0 -10,-6 -10,-14Z", "class": "gn-sil" }, B);
		el("path", { d: "M112,262h38l-4,152c0,8 -4,14 -10,14h-6c-8,0 -14,-6 -14,-16Z", "class": "gn-sil" }, B);
		G.ORGANS.forEach(function (o) {
			if (S.layer && o.layer !== S.layer) return;
			var on = o.id === S.organ, Ly = G.LAYERS[o.layer], g = el("g", { "class": "gn-od" + (on ? " is-on" : ""), "data-org": o.id, tabindex: 0, role: "button", "aria-label": o.name + " (" + Ly.name + ")" }, B);
			if (on) el("circle", { cx: o.x, cy: o.y, r: 11, fill: "none", stroke: Ly.color, "stroke-width": 2.5, "class": "gn-pulse" }, g);
			el("circle", { cx: o.x, cy: o.y, r: on ? 7 : 5.5, fill: Ly.color, "class": "gn-odot" }, g);
			el("title", {}, g).textContent = o.name + " · " + Ly.name;
		});
		var o = G.ORGAN_BY[S.organ];
		if (!S.layer || o.layer === S.layer) txt(B, clamp(o.x, 40, 180), o.y < 30 ? o.y + 22 : o.y - 14, o.name.replace(/ \(.*\)/, ""), "gn-st gn-olab", { "text-anchor": "middle" });
	}
	var BRAIN = {
		ecto: "M40,150C20,110 30,55 80,32C130,10 210,12 255,40C292,62 300,110 285,148C276,170 250,176 225,172L170,166C140,170 110,176 80,174C58,172 46,164 40,150Z",
		newm: "M64,144C48,112 58,70 96,52C136,34 204,36 240,58C268,76 274,108 262,136C254,152 236,156 214,152L170,148C140,152 112,156 90,154C76,152 68,150 64,144Z",
		oldm: "M206,182C210,166 236,160 262,166C286,172 296,190 286,206C276,222 246,226 224,218C208,212 202,196 206,182Z",
		endo: "M158,150C170,144 192,146 200,156L198,190C196,212 192,232 188,246L168,246C166,226 164,206 160,186Z"
	};
	var BRAIN_LAB = { ecto: [150, 30, "Cortex"], newm: [165, 96, "Medulla"], oldm: [252, 236, "Cerebellum"], endo: [146, 228, "Brain stem"] };
	function drawBrain() {
		var B = $("gn-brain"); B.innerHTML = "";
		var cur = G.ORGAN_BY[S.organ].layer;
		["oldm", "endo", "ecto", "newm"].forEach(function (k) {
			var Ly = G.LAYERS[k], dim = S.layer && S.layer !== k;
			var p = el("path", { d: BRAIN[k], fill: Ly.color, "fill-opacity": dim ? 0.18 : k === cur ? 0.95 : 0.62, "class": "gn-bp" + (k === cur ? " is-cur" : "") + (S.layer === k ? " is-sel" : ""), "data-layer": k, tabindex: 0, role: "button", "aria-label": Ly.brain + ": " + Ly.name + " organs" }, B);
			el("title", {}, p).textContent = Ly.brain + " → " + Ly.name;
		});
		/* the Hamer focus of the selected organ, in its brain part */
		var fx = { ecto: [50, 112], newm: [118, 124], oldm: [250, 194], endo: [180, 206] }[cur];
		el("circle", { cx: fx[0], cy: fx[1], r: 9, "class": "gn-bfocus" }, B); el("circle", { cx: fx[0], cy: fx[1], r: 4.5, "class": "gn-bfocus" }, B);
		for (var k in BRAIN_LAB) { var b = BRAIN_LAB[k]; txt(B, b[0], b[1], b[2], "gn-st gn-blab", { "text-anchor": "middle" }); }
	}
	function layerChips() {
		var h = '<button type="button" class="gn-lc" data-layer=""' + (S.layer ? "" : ' aria-pressed="true"') + ">All layers</button>";
		G.LAYER_ORDER.forEach(function (k) { var Ly = G.LAYERS[k]; h += '<button type="button" class="gn-lc" data-layer="' + k + '" aria-pressed="' + (S.layer === k) + '"><i style="background:' + Ly.color + '"></i>' + esc(Ly.name) + " <small>" + esc(Ly.brain.replace(" (white matter)", "")) + "</small></button>"; });
		$("gn-layerchips").innerHTML = h;
	}
	function renderList() {
		var qv = G.normText($("gn-org-q").value).trim(), h = "";
		G.LAYER_ORDER.forEach(function (k) {
			if (S.layer && S.layer !== k) return;
			var Ly = G.LAYERS[k], items = G.ORGANS.filter(function (o) { return o.layer === k && (!qv || G.normText(o.name + " " + o.kw.join(" ") + " " + o.conflict).indexOf(qv) >= 0); });
			if (!items.length) return;
			h += '<div class="gn-og"><div class="gn-ogh"><i style="background:' + Ly.color + '"></i>' + esc(Ly.name) + " · " + esc(Ly.brain) + " " + q(k) + "</div>";
			items.forEach(function (o) { h += '<button type="button" role="option" class="gn-oi' + (o.id === S.organ ? " is-on" : "") + '" aria-selected="' + (o.id === S.organ) + '" data-org="' + o.id + '">' + esc(o.name) + "</button>"; });
			h += "</div>";
		});
		$("gn-org-list").innerHTML = h || '<p class="tu-note">No organ matches. Try another word.</p>';
	}
	function relayText(o) {   /* the organ's relay note without repeating the brain part's name */
		var b = G.LAYERS[o.layer].brain.split(" (")[0], r = o.relay;
		if (r.indexOf(b) === 0) { r = r.slice(b.length).replace(/^[.,]\s*/, ""); r = r.charAt(0).toUpperCase() + r.slice(1); }
		return G.LAYERS[o.layer].brain + "." + (r ? " " + r : "");
	}
	function renderDetail() {
		var o = G.ORGAN_BY[S.organ], Ly = G.LAYERS[o.layer], h = "";
		h += '<div class="gn-ihead"><span class="gn-badge" style="background:' + Ly.color + ';color:' + Ly.fg + '">' + esc(Ly.name) + "</span><h3>" + esc(o.name) + "</h3></div>";
		h += '<p><b>Conflict in GNM:</b> ' + esc(o.conflict) + "</p>";
		h += '<p><b>Brain relay:</b> ' + esc(relayText(o)) + "</p>";
		h += '<div class="gn-ptab">';
		[["ca", o.ca, G.cellSign(o.layer, "ca")], ["pcla", o.pcl, G.cellSign(o.layer, "pcla")], ["ec", G.organText(o, "ec"), ""], ["pclb", G.organText(o, "pclb"), ""]].forEach(function (r) {
			var P = G.PHASES[r[0]];
			h += '<button type="button" class="gn-pr" data-ph="' + r[0] + '"><span class="gn-badge" style="background:' + P.color + '">' + esc(P.short) + "</span><span>" + esc(r[1]) + (r[2] ? ' <b class="gn-sign">' + (r[2] === "+" ? "+ cells" : "− cells") + "</b>" : "") + "</span></button>";
		});
		h += "</div>";
		h += '<p class="tu-note"><b>Biological purpose</b> ' + q("purpose") + " for " + esc(Ly.name.toLowerCase()) + " programs: " + esc(Ly.purpose) + " Click a phase to see it on the chart.</p>";
		$("gn-org-detail").innerHTML = h;
	}
	function renderOrgans() { layerChips(); renderList(); renderDetail(); drawBody(); drawBrain(); save(); }
	function pickOrgan(id) { if (!G.ORGAN_BY[id]) return; S.organ = id; if (S.layer && G.ORGAN_BY[id].layer !== S.layer) S.layer = ""; renderOrgans(); placeMarker(); }
	$("gn-org-list").addEventListener("click", function (ev) { var b = ev.target.closest("[data-org]"); if (b) pickOrgan(b.getAttribute("data-org")); });
	$("gn-org-q").addEventListener("input", function () {
		renderList();
		var first = $("gn-org-list").querySelector("[data-org]"); if (first && $("gn-org-q").value.trim().length > 2 && !$("gn-org-list").querySelector(".is-on")) pickOrgan(first.getAttribute("data-org"));
	});
	$("gn-layerchips").addEventListener("click", function (ev) { var b = ev.target.closest("[data-layer]"); if (!b) return; S.layer = b.getAttribute("data-layer"); if (S.layer && G.ORGAN_BY[S.organ].layer !== S.layer) { var f = G.ORGANS.filter(function (o) { return o.layer === S.layer; })[0]; S.organ = f.id; placeMarker(); } renderOrgans(); });
	function svgPick(ev) {
		var g = ev.target.closest("[data-org]"); if (g) { pickOrgan(g.getAttribute("data-org")); return true; }
		var p = ev.target.closest("[data-layer]"); if (p) { var k = p.getAttribute("data-layer"); S.layer = S.layer === k ? "" : k; if (S.layer && G.ORGAN_BY[S.organ].layer !== S.layer) { S.organ = G.ORGANS.filter(function (o) { return o.layer === S.layer; })[0].id; placeMarker(); } renderOrgans(); return true; }
		return false;
	}
	["gn-body", "gn-brain"].forEach(function (id) {
		$(id).addEventListener("click", svgPick);
		$(id).addEventListener("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && svgPick(ev)) ev.preventDefault(); });
	});
	$("gn-org-detail").addEventListener("click", function (ev) {
		var b = ev.target.closest("[data-ph]"); if (!b) return;
		var t = G.placeFor(M, b.getAttribute("data-ph"), 0.5); if (t == null) { S.sc = "classic"; rebuild(); t = G.placeFor(M, b.getAttribute("data-ph"), 0.5); }
		setT(t / M.T); $("gn-chartcard").scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------------------------------------------------------------- the five laws */
	function lawDiagram(id) {
		var s = "";
		if (id === "iron") {
			s = '<svg viewBox="0 0 520 260" class="gn-lsvg" role="img" aria-label="Psyche, brain and organ hit by the DHS at the same moment">';
			var pts = [[260, 40, "Psyche", "the conflict"], [90, 210, "Brain", "Hamer focus"], [430, 210, "Organ", "organ change"]];
			s += '<path d="M260,40L90,210L430,210Z" class="gn-ltri"/>';
			s += '<path d="M268,96l-30,52h24l-16,48l46,-66h-26l18,-34Z" fill="#7c3aed"/><text x="300" y="150" class="gn-st gn-ev">DHS</text>';
			pts.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="34" class="gn-lnode"/><text x="' + p[0] + '" y="' + (p[1] + 2) + '" text-anchor="middle" class="gn-st gn-lnt">' + p[2] + '</text><text x="' + p[0] + '" y="' + (p[1] + 18) + '" text-anchor="middle" class="gn-st gn-small">' + p[3] + "</text>"; });
			s += '<text x="260" y="250" text-anchor="middle" class="gn-st gn-small">In GNM: one program, three levels, the same second, from then on in step</text></svg>';
		} else if (id === "two") {
			var m = G.build({ scenario: "classic", intensity: 0.8, duration: 0.5 }), w = 520, hh = 200, x = function (t) { return 20 + (w - 40) * t / m.T; }, y = function (v) { return 100 - v * 75; };
			s = '<svg viewBox="0 0 ' + w + " " + hh + '" class="gn-lsvg" role="img" aria-label="The two-phase curve">';
			s += '<line x1="20" x2="' + (w - 20) + '" y1="100" y2="100" class="gn-base"/>';
			var d = ""; G.sample(m, 240).forEach(function (p, i) { d += (i ? "L" : "M") + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); });
			s += '<path d="' + d + '" class="gn-curve"/>';
			m.segs.forEach(function (sg) { if (sg.p === "norm" || sg.p === "dhs" || sg.p === "cl") return; var mx = x((sg.t0 + sg.t1) / 2); s += '<text x="' + mx + '" y="' + (sg.p === "ca" ? 14 : sg.p === "ec" ? 14 : 192) + '" text-anchor="middle" class="gn-st gn-small" fill="' + G.PHASES[sg.p].color + '">' + G.PHASES[sg.p].short + "</text>"; });
			s += '<text x="24" y="92" class="gn-st gn-small">sympathicotonia ↑</text><text x="24" y="116" class="gn-st gn-small">vagotonia ↓</text></svg><p><button type="button" class="tu-btn tu-btn--ghost" data-go="chart">Explore it on the big chart ↑</button></p>';
		} else if (id === "onto") {
			s = '<div class="gn-onto"><div class="gn-oh"><span>Germ layer</span><span>Brain part</span><span>Active phase</span><span>Healing phase</span></div>';
			G.LAYER_ORDER.forEach(function (k) {
				var Ly = G.LAYERS[k];
				s += '<button type="button" class="gn-orow" data-layer="' + k + '"><span><i style="background:' + Ly.color + '"></i><b>' + esc(Ly.name) + "</b></span><span>" + esc(Ly.brain) + "<small>" + (Ly.brainGroup === "old" ? "old brain" : "new brain") + '</small></span><span class="gn-sgn ' + (Ly.ca === "+" ? "is-plus" : "is-minus") + '">' + cellPic(Ly.ca, Ly.color) + "<small>" + (Ly.ca === "+" ? "cells multiply" : "cells lost") + '</small></span><span class="gn-sgn ' + (Ly.pcl === "+" ? "is-plus" : "is-minus") + '">' + cellPic(Ly.pcl, Ly.color) + "<small>" + (Ly.pcl === "+" ? "rebuilt" : "broken down") + "</small></span></button>";
			});
			s += '</div><p class="tu-note">Click a row to see that layer\'s organs. Typical conflict themes: ' + G.LAYER_ORDER.map(function (k) { return "<b>" + G.LAYERS[k].name + "</b>: " + esc(G.LAYERS[k].theme); }).join(" ") + "</p>";
		} else if (id === "mic") {
			s = '<div class="gn-mic">';
			G.LAYER_ORDER.forEach(function (k) {
				var Ly = G.LAYERS[k];
				s += '<div class="gn-mrow"><span><i style="background:' + Ly.color + '"></i><b>' + esc(Ly.brain.replace(" (white matter)", "")) + "</b><small>" + esc(Ly.name) + '</small></span><span class="gn-mbar"><em class="gn-mca">active phase: idle</em><em class="gn-mpcl" style="background:' + Ly.color + ';color:' + Ly.fg + '">healing: ' + esc(Ly.microbes) + "</em></span></div>";
			});
			s += '</div><p class="tu-note">Oldest microbes for the oldest brain parts, as Hamer put it. In GNM they work only after conflictolysis; if the matching microbes are missing, the tissue is repaired more slowly or left encapsulated.</p>';
		} else {
			s = '<div class="gn-mic">';
			G.LAYER_ORDER.forEach(function (k) {
				var Ly = G.LAYERS[k], at = k === "newm" ? 92 : 30;
				s += '<div class="gn-mrow"><span><i style="background:' + Ly.color + '"></i><b>' + esc(Ly.name) + '</b></span><span class="gn-qbar"><em class="gn-qa">active</em><em class="gn-qp">healing</em><b class="gn-star" style="left:' + at + '%" title="' + esc(Ly.purpose) + '">★</b></span></div>';
			});
			s += '</div><p class="tu-note">★ = where, in GNM, the biological purpose ' + q("purpose") + " of the program lies. Example from Hamer: in a bone program the bone ends up stronger after healing; in a bronchial program the widened airway lets more air in during the active phase.</p>";
		}
		return s;
	}
	function cellPic(sign, color) {
		var s = '<svg viewBox="0 0 48 28" class="gn-cp" aria-hidden="true">', P = [[8, 8], [20, 8], [32, 8], [14, 19], [26, 19], [38, 19], [44, 8]];
		P.forEach(function (p, i) { var hole = sign === "-" && (i === 1 || i === 4 || i === 6), extra = sign === "+" || i < 5; if (!extra) return; s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5.2" ' + (hole ? 'fill="none" stroke="' + color + '" stroke-dasharray="2 2"' : 'fill="' + color + '"') + "/>"; });
		return s + "</svg>";
	}
	function renderLaws() {
		$("gn-lawtabs").innerHTML = G.LAWS.map(function (Lw, i) { return '<button type="button" role="tab" data-law="' + i + '" aria-selected="' + (i === S.law) + '"><b>' + Lw.n + "</b> " + esc(Lw.name.replace(/^The /, "")) + "</button>"; }).join("");
		var Lw = G.LAWS[S.law], gl = { iron: "dhs", two: "pcl", onto: "germ", mic: "microbes", quint: "quintessence" }[Lw.id];
		$("gn-lawpanel").innerHTML = "<h3>" + Lw.n + ". " + esc(Lw.name) + " " + q(gl) + "</h3><p>" + esc(Lw.text) + "</p>" + lawDiagram(Lw.id);
		save();
	}
	$("gn-lawtabs").addEventListener("click", function (ev) { var b = ev.target.closest("[data-law]"); if (!b) return; S.law = +b.getAttribute("data-law"); renderLaws(); });
	$("gn-lawtabs").addEventListener("keydown", function (ev) { var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0; if (!d) return; S.law = (S.law + d + 5) % 5; renderLaws(); $("gn-lawtabs").children[S.law].focus(); ev.preventDefault(); });
	$("gn-lawpanel").addEventListener("click", function (ev) {
		var r = ev.target.closest("[data-layer]"); if (r) { S.layer = r.getAttribute("data-layer"); if (G.ORGAN_BY[S.organ].layer !== S.layer) { S.organ = G.ORGANS.filter(function (o) { return o.layer === S.layer; })[0].id; placeMarker(); } renderOrgans(); $("gn-orgcard").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
		if (ev.target.closest("[data-go=chart]")) $("gn-chartcard").scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------------------------------------------------------------- glossary list + "?" popovers */
	function renderGloss() {
		var qv = G.normText($("gn-gl-q").value).trim();
		var keys = Object.keys(G.GLOSSARY).sort(function (a, b) { return G.GLOSSARY[a][0].localeCompare(G.GLOSSARY[b][0]); });
		$("gn-gl-list").innerHTML = keys.filter(function (k) { return !qv || G.normText(G.GLOSSARY[k].join(" ")).indexOf(qv) >= 0; }).map(function (k) { return '<div class="gn-gi" id="gn-g-' + k + '"><dt>' + esc(G.GLOSSARY[k][0]) + "</dt><dd>" + esc(G.GLOSSARY[k][1]) + "</dd></div>"; }).join("") || '<p class="tu-note">No term matches.</p>';
	}
	$("gn-gl-q").addEventListener("input", renderGloss);
	var pop = document.createElement("div"); pop.className = "gn-pop"; pop.id = "gn-pop"; pop.setAttribute("role", "dialog"); pop.hidden = true; root.appendChild(pop);
	var popFor = null;
	function closePop() { if (pop.hidden) return; pop.hidden = true; if (popFor) popFor.setAttribute("aria-expanded", "false"); popFor = null; }
	function openPop(btn) {
		var g = G.GLOSSARY[btn.getAttribute("data-g")]; if (!g) return;
		if (popFor === btn) { closePop(); return; }
		closePop(); popFor = btn; btn.setAttribute("aria-expanded", "true");
		pop.innerHTML = "<b>" + esc(g[0]) + '</b><p>' + esc(g[1]) + '</p><button type="button" class="gn-popx" aria-label="Close">×</button>';
		pop.hidden = false;
		var host = root.closest(".mes-pfill") || root, hr = (host === root ? root : host).getBoundingClientRect(), br = btn.getBoundingClientRect(), pw = Math.min(320, window.innerWidth - 24);
		if (pop.parentNode !== host) host.appendChild(pop);
		pop.style.width = pw + "px";
		var x = clamp(br.left - hr.left - pw / 2 + br.width / 2, 4 - hr.left + 8, window.innerWidth - hr.left - pw - 12), y = br.bottom - hr.top + (host === root ? 0 : host.scrollTop) + 6;
		pop.style.left = x + "px"; pop.style.top = y + "px";
	}
	document.addEventListener("click", function (ev) {
		var b = ev.target.closest(".gn-q"); if (b && root.contains(b) || b && b.closest(".mes-pfill")) { ev.preventDefault(); ev.stopPropagation(); openPop(b); return; }
		if (ev.target.closest(".gn-popx") || !ev.target.closest(".gn-pop")) closePop();
	}, true);
	document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !pop.hidden) { var f = popFor; closePop(); if (f) f.focus(); } });
	window.addEventListener("resize", closePop);

	/* ---------------------------------------------------------------- Fill window / Full screen */
	function panels() {
		if (!window.MESPanel) return false;
		window.MESPanel.add($("gn-chartcard"), { bar: $("gn-ch-pv"), onChange: closePop });
		window.MESPanel.add($("gn-orgcard"), { bar: $("gn-org-pv"), onChange: closePop });
		return true;
	}
	if (!panels()) { var tries = 0, iv = setInterval(function () { if (panels() || ++tries > 40) clearInterval(iv); }, 150); }

	paintScen(); paintSliders(); drawChart(); renderOrgans(); renderLaws(); renderGloss();
	window.MESGNMDebug = { S: S, model: function () { return M; }, setT: setT, ask: ask };
})();
