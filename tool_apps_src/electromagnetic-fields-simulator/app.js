/* Electromagnetic Fields UI: electric charges (field lines, equipotentials, Gauss), currents (Ampere), a charged particle (Boris pusher), Maxwell waves (2D FDTD) and a 3D plane wave.
   Maths: MESEM (node-tested: tool_apps_src/electromagnetic-fields-tests.js). State: localStorage mes-electromagnetic-fields:v1; links ?tab=... plus each tab's keys. */
(function () {
	"use strict";
	/* A page that carries only one panel (data-only, e.g. /magnetic-isopotentials = "mg") leaves the other tabs' elements out: a lookup of a missing id returns a
	   detached stand-in (a canvas for the "-c" / "-sc" canvases, else a div; all inside one detached parent) so the rest of the script runs unchanged. */
	var STAND = {}, STAND_P = document.createElement("div");
	var $ = function (id) { var el = document.getElementById(id); if (el) return el; if (!STAND[id]) { STAND[id] = document.createElement(/-s?c$/.test(id) ? "canvas" : "div"); STAND_P.appendChild(STAND[id]); } return STAND[id]; };
	var root = document.getElementById("em"); if (!root) return;
	var ONLY = root.getAttribute("data-only") || "";
	var M = window.MESEM, PI = Math.PI, TAU = 2 * PI, KEY = "mes-electromagnetic-fields:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	var q = new URLSearchParams(location.search), saved = sget(), toastT, coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
	function toast(msg) { var t = $("em-toast"); if (!t) { t = document.createElement("div"); t.id = "em-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copyLink(params) {
		var u = new URL(location.href); u.search = ""; u.searchParams.set("tab", tab); for (var k in params) u.searchParams.set(k, params[k]);
		var url = u.toString(), done = function () { toast("Link copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	}
	var PFX = [[1e-15, "f"], [1e-12, "p"], [1e-9, "n"], [1e-6, "μ"], [1e-3, "m"], [1, ""], [1e3, "k"], [1e6, "M"], [1e9, "G"], [1e12, "T"], [1e15, "P"], [1e18, "E"]];
	function si(x, unit, d) {
		if (!isFinite(x)) return "∞ " + unit; if (x === 0) return "0 " + unit; var a = Math.abs(x), p = PFX[5], i; for (i = 0; i < PFX.length; i++) if (a >= PFX[i][0] * 0.9995) p = PFX[i];
		return (Number((x / p[0]).toPrecision(d || 3))).toString().replace("-", "−") + " " + p[1] + unit;
	}
	function sig(x, d) { if (!isFinite(x)) return "∞"; if (x === 0) return "0"; var a = Math.abs(x); if (a >= 1e5 || a < 1e-3) { var e = Math.floor(Math.log10(a)); return (x / Math.pow(10, e)).toPrecision(d || 3).replace(/\.?0+$/, "") + "×10" + String(e).replace("-", "⁻").replace(/\d/g, function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]; }); } return String(Number(x.toPrecision(d || 3))).replace("-", "−"); }
	function ang(x, y) { return ((Math.atan2(y, x) * 180 / PI) + 360) % 360; }

	/* ---------- tabs ---------- */
	var TABS = ["es", "ms", "mg", "pt", "wv", "pw"], tab = TABS.indexOf(q.get("tab")) >= 0 ? q.get("tab") : (TABS.indexOf(saved.tab) >= 0 ? saved.tab : "es");
	if (ONLY) tab = ONLY;
	var showers = {};
	function setTab(t, init) {
		tab = t; if (!ONLY) sset({ tab: t });
		Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init && !ONLY) try { var u = new URL(location.href); if (t === "es") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); history.replaceState(null, "", u); } catch (e) {}
		setTimeout(function () { if (showers[t]) showers[t](); }, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* ---------- canvas views ---------- */
	function mkView(prefix, aspect, extraH) {
		var cv = $("em-" + prefix + "-c"), st = $("em-" + prefix + "-stage"), V = { cv: cv, cx: cv.getContext("2d"), st: st, W: 600, H: 400, dpr: 1, aspect: aspect };
		V.resize = function () {
			var wrap = st.parentNode, w = wrap.clientWidth; if (!w) return false; var h = Math.round(w / V.aspect); wrap.setAttribute("data-mes-free", "1");
			if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(st, h);
			if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) { h = (window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 90) - (window.MESStage && window.MESStage.fillH ? 0 : (extraH || 0)); }
			st.style.width = w + "px"; st.style.height = h + "px"; V.dpr = Math.min(2, window.devicePixelRatio || 1); V.W = w; V.H = h;
			var cw = Math.round(w * V.dpr), ch = Math.round(h * V.dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; return true; } return false;
		};
		V.pos = function (e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (V.W / r.width), (e.clientY - r.top) * (V.H / r.height)]; };
		V.fit = function () { return Math.min(V.W, V.H * V.aspect); };   /* the scene is scaled to fit its design shape: a short, wide box (phone landscape, Fill window) shows more of the world instead of cropping top and bottom */
		/* a long press / drag on a phone must not select the canvas (Android paints the whole picture blue) or open the context menu */
		["contextmenu", "selectstart", "dragstart"].forEach(function (n) { st.addEventListener(n, function (e) { e.preventDefault(); }); });
		V.begin = function () { V.cx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); };
		return V;
	}
	function wirePng(id, V, draw) { $(id).onclick = function () { draw(); V.cv.toBlob(function (bl) { if (!bl) return; var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "electromagnetism.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); }; }
	function wireFull(id, V) { $(id).onclick = function () { var w = V.st.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); }; }
	function wireTools(id, cb) { var el = $(id); el.onclick = function (e) { var b = e.target.closest("button"); if (!b) return; Array.prototype.forEach.call(el.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); cb(b.dataset.t); }; }
	function chips(el, items, on) { el.innerHTML = items.map(function (it, i) { return '<button type="button" data-i="' + i + '">' + esc(it.name) + "</button>"; }).join(""); el.onclick = function (e) { var b = e.target.closest("button"); if (b) { Array.prototype.forEach.call(el.children, function (x) { x.classList.toggle("is-on", x === b); }); on(items[+b.dataset.i]); } }; }
	function arrow(cx, x0, y0, x1, y1, col, w, hs) { cx.strokeStyle = col; cx.fillStyle = col; cx.lineWidth = w || 1.5; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke(); var a = Math.atan2(y1 - y0, x1 - x0), h = hs || 7; cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); cx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); cx.closePath(); cx.fill(); }
	function lineW(cx, flat, tr, col, wd) { cx.strokeStyle = col; cx.lineWidth = wd; cx.beginPath(); for (var i = 0; i < flat.length; i += 2) { var p = tr(flat[i], flat[i + 1]); if (i === 0) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]); } cx.stroke(); }
	function segs(cx, flat, tr, col, wd) { cx.strokeStyle = col; cx.lineWidth = wd; cx.beginPath(); for (var i = 0; i < flat.length; i += 4) { var a = tr(flat[i], flat[i + 1]), b = tr(flat[i + 2], flat[i + 3]); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); } cx.stroke(); }

	/* =================== ELECTRIC CHARGES =================== */
	var ES = { ch: [], tool: "pos", sel: -1, VW: 4, nLines: 14, lines: true, arrows: true, eq: false, gauss: false, col: "none", mode: "3d", sens: [], tape: null, volt: [], ssel: -1, pre: -1, qk: 0, wk: 0.26, gc: { x: 0, y: 0, R: 0.8 }, tests: [], play: true, mouse: null, dirty: true, cache: {}, drag: null, gdirty: true, tcQ: 1e-9, tcM: 1e-3 };
	var ev = mkView("es", 1.6), esHeat = document.createElement("canvas");
	function esT(x, y) { var S = ev.fit() / ES.VW; return [ev.W / 2 + x * S, ev.H / 2 - y * S]; }
	function esW(px, py) { var S = ev.fit() / ES.VW; return [(px - ev.W / 2) / S, -(py - ev.H / 2) / S]; }
	function esBox() { var S = ev.fit() / ES.VW, hw = ev.W / 2 / S, hh = ev.H / 2 / S; return [-hw, -hh, hw, hh]; }
	function qNew() { return Math.pow(10, ES.qk) * 1e-6; }
	var ES_PRE = [
		{ name: "Dipole", ch: [[-0.7, 0, 1], [0.7, 0, -1]], VW: 4 }, { name: "Two positives", ch: [[-0.7, 0, 1], [0.7, 0, 1]], VW: 4 }, { name: "Unequal pair", ch: [[-0.9, 0, 2], [0.9, 0, -1]], VW: 5 },
		{ name: "Quadrupole", ch: [[-0.6, -0.6, 1], [0.6, 0.6, 1], [-0.6, 0.6, -1], [0.6, -0.6, -1]], VW: 4 },
		{ name: "Parallel plates", ch: (function () { var a = []; for (var i = 0; i < 11; i++) { a.push([-1.5 + i * 0.3, 0.7, 0.4]); a.push([-1.5 + i * 0.3, -0.7, -0.4]); } return a; })(), VW: 5 },
		{ name: "Ring and centre", ch: (function () { var a = [[0, 0, -4]]; for (var i = 0; i < 8; i++) a.push([Math.cos(i * TAU / 8), Math.sin(i * TAU / 8), 1]); return a; })(), VW: 4 },
		{ name: "Three charges", ch: [[-1, -0.5, 1], [1, -0.5, 1], [0, 0.9, -2]], VW: 4.5 }
	];
	function esLoad(p) { ES.pre = ES_PRE.indexOf(p); ES.sens = []; ES.tape = null; ES.volt = []; ES.ssel = -1; ES.ch = p.ch.map(function (c) { return { x: c[0], y: c[1], q: c[2] * 1e-6 }; }); ES.VW = p.VW; ES.sel = -1; ES.tests = []; ES.dirty = true; ES.gdirty = true; syncEs(); }
	function syncEs() { $("em-es-q").value = ES.qk; $("em-es-q-v").textContent = sig(Math.pow(10, ES.qk), 2) + " μC"; ES.wk = Math.log10(ES.VW / 4); $("em-es-w").value = ES.wk; $("em-es-w-v").textContent = sig(ES.VW, 3) + " m"; $("em-es-n").value = ES.nLines; $("em-es-n-v").textContent = ES.nLines; selUi(); }
	function selUi() {
		var c = ES.ch[ES.sel]; $("em-es-sel").hidden = !c; if (!c) return; $("em-es-sel-q").textContent = si(c.q, "C", 3); $("em-es-selq").value = Math.max(-10, Math.min(10, c.q * 1e6));
		var f = M.forceOn(ES.ch, ES.sel, ES.mode); $("em-es-sel-f").textContent = "force on it: " + si(Math.hypot(f[0], f[1]), ES.mode === "2d" ? "N/m" : "N", 3) + " at " + ang(f[0], f[1]).toFixed(0) + "°";
	}
	function esRecompute() {
		var box = esBox(), W = ev.W, H = ev.H, C = ES.cache, qmax = 0; ES.ch.forEach(function (c) { qmax = Math.max(qmax, Math.abs(c.q)); }); C.qmax = qmax;
		var sc = ES.VW / W; /* metres per pixel */
		C.lines = ES.lines && ES.ch.length ? M.fieldLines(ES.ch, ES.mode, [box[0] * 1.6, box[1] * 1.6, box[2] * 1.6, box[3] * 1.6], ES.nLines, 7 * sc, 2.2 * sc) : [];
		C.eq = []; if (ES.eq && ES.ch.length) {
			var ref = (ES.mode === "2d" ? qmax / (TAU * M.EPS0) : M.K * qmax / (0.2 * ES.VW)); var step = ref / 3, lv = [], j; for (j = -12; j <= 12; j++) lv.push(j * step * 0.5);
			var fn = function (x, y) { var v = M.potentialAt(ES.ch, x, y, ES.mode); return v; };
			var nx = Math.max(40, Math.round(W / 7)), ny = Math.max(30, Math.round(H / 7)); var all = M.contours(fn, box, nx, ny, lv); C.eq = all.map(function (s, i) { return { s: s, lv: lv[i] }; });
		}
		/* heat map */
		C.heat = null; if (ES.col !== "none" && ES.ch.length) {
			var hw = Math.max(40, Math.round(W / 3)), hh = Math.max(30, Math.round(H / 3)); esHeat.width = hw; esHeat.height = hh; var hc = esHeat.getContext("2d"), img = hc.createImageData(hw, hh), i, j2;
			var Vref = M.K * qmax / (0.25 * ES.VW), Eref = M.K * qmax / Math.pow(0.25 * ES.VW, 2); if (ES.mode === "2d") { Vref = qmax / (TAU * M.EPS0); Eref = qmax / (TAU * M.EPS0 * 0.25 * ES.VW); }
			for (j2 = 0; j2 < hh; j2++) for (i = 0; i < hw; i++) {
				var x = box[0] + (i + 0.5) / hw * (box[2] - box[0]), y = box[3] - (j2 + 0.5) / hh * (box[3] - box[1]), o = 4 * (j2 * hw + i), r, g, b;
				if (ES.col === "v") { var v = Math.tanh(M.potentialAt(ES.ch, x, y, ES.mode) / Vref * (ES.mode === "2d" ? 1 : 1)); if (v >= 0) { r = 255 * v; g = 60 * v; b = 40 * v; } else { r = 30 * -v; g = 90 * -v; b = 255 * -v; } }
				else { var e = M.fieldAt(ES.ch, x, y, ES.mode), m = Math.hypot(e[0], e[1]), u = Math.max(0, Math.min(1, (Math.log10(m / Eref + 1e-12) + 3) / 5)); r = 255 * Math.min(1, u * 2); g = 190 * Math.pow(u, 1.6); b = 90 * Math.pow(u, 3) + 30 * (1 - u); }
				img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 200;
			}
			hc.putImageData(img, 0, 0); C.heat = true;
		}
		ES.dirty = false;
	}
	function esDraw() {
		if (tab !== "es") return; if (ES.dirty) esRecompute(); ev.begin(); var cx = ev.cx, W = ev.W, H = ev.H, C = ES.cache, S = Math.min(W, H * ev.aspect) / ES.VW;
		cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		if (C.heat) { cx.imageSmoothingEnabled = true; cx.drawImage(esHeat, 0, 0, W, H); }
		/* faint grid */
		cx.strokeStyle = "rgba(255,255,255,0.05)"; cx.lineWidth = 1; var gs = Math.pow(10, Math.floor(Math.log10(ES.VW / 4))), x;
		for (x = Math.ceil(esBox()[0] / gs) * gs; x <= esBox()[2]; x += gs) { var px = esT(x, 0)[0]; cx.beginPath(); cx.moveTo(px, 0); cx.lineTo(px, H); cx.stroke(); }
		for (var y = Math.ceil(esBox()[1] / gs) * gs; y <= esBox()[3]; y += gs) { var py = esT(0, y)[1]; cx.beginPath(); cx.moveTo(0, py); cx.lineTo(W, py); cx.stroke(); }
		/* equipotentials */
		if (ES.eq) C.eq.forEach(function (o) { if (!o.s.length) return; segs(cx, o.s, esT, o.lv > 0 ? "rgba(255,140,120,0.7)" : o.lv < 0 ? "rgba(120,170,255,0.7)" : "rgba(255,255,255,0.8)", 1.1); });
		/* field lines with a direction arrow */
		if (ES.lines) C.lines.forEach(function (l) {
			if (l.length < 6) return; lineW(cx, l, esT, "rgba(235,240,255,0.85)", 1.3);
			var n = l.length / 2, k = Math.max(1, Math.floor(n * 0.3)), a = esT(l[2 * (k - 1)], l[2 * (k - 1) + 1]), b = esT(l[2 * k], l[2 * k + 1]); arrow(cx, a[0], a[1], b[0], b[1], "rgba(235,240,255,0.95)", 0.1, 6);   /* every line already runs along the field */
		});
		if (ES.arrows) { var gp = coarse ? 40 : 32, i, j; for (j = gp / 2; j < H; j += gp) for (i = gp / 2; i < W; i += gp) { var w = esW(i, j), e = M.fieldAt(ES.ch, w[0], w[1], ES.mode), m = Math.hypot(e[0], e[1]); if (!(m > 0)) continue; var Eref = ES.mode === "2d" ? C.qmax / (TAU * M.EPS0 * 0.25 * ES.VW) : M.K * C.qmax / Math.pow(0.25 * ES.VW, 2), u = Math.max(0.15, Math.min(1, (Math.log10(m / Eref + 1e-12) + 3) / 4)); var L = gp * 0.42 * u; arrow(cx, i - e[0] / m * L * 0.5, j + e[1] / m * L * 0.5, i + e[0] / m * L * 0.5, j - e[1] / m * L * 0.5, "rgba(255,210,120," + (0.35 + 0.6 * u) + ")", 1.3, 5); } }
		/* Gauss surface */
		if (ES.gauss) { var c0 = esT(ES.gc.x, ES.gc.y), R = ES.gc.R * S; cx.setLineDash([7, 5]); cx.strokeStyle = "#7dd3fc"; cx.lineWidth = 2; cx.beginPath(); cx.arc(c0[0], c0[1], R, 0, 7); cx.stroke(); cx.setLineDash([]); cx.fillStyle = "rgba(125,211,252,0.08)"; cx.fill(); cx.fillStyle = "#7dd3fc"; cx.beginPath(); cx.arc(c0[0], c0[1], 4, 0, 7); cx.fill(); cx.beginPath(); cx.arc(c0[0] + R, c0[1], 5, 0, 7); cx.fill(); }
		/* test charges */
		ES.tests.forEach(function (t) { if (t.trail.length > 3) lineW(cx, t.trail, esT, t.q > 0 ? "rgba(255,230,90,0.8)" : "rgba(90,230,255,0.8)", 1.6); var p = esT(t.x, t.y); cx.fillStyle = t.q > 0 ? "#ffe45a" : "#5ae6ff"; cx.beginPath(); cx.arc(p[0], p[1], t.alive ? 4.5 : 3, 0, 7); cx.fill(); });
		/* sensors */
		ES.sens.forEach(function (s, i) { var p = esT(s.x, s.y), e = M.fieldAt(ES.ch, s.x, s.y, ES.mode), m = Math.hypot(e[0], e[1]); if (m > 0) { arrow(cx, p[0], p[1], p[0] + e[0] / m * 38, p[1] - e[1] / m * 38, "#ffe45a", 2.2, 8); }
			cx.fillStyle = "#ffe45a"; cx.strokeStyle = i === ES.ssel ? "#fff" : "#7a6a00"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p[0], p[1], 5, 0, 7); cx.fill(); cx.stroke();
			var tx = si(m, "V/m", 3) + "  " + ang(e[0], e[1]).toFixed(0) + "°"; cx.font = "12px sans-serif"; var tw = cx.measureText(tx).width + 8; var bx = Math.min(p[0] + 8, W - tw - 2), by = Math.max(p[1] - 26, 2); cx.fillStyle = "rgba(0,0,0,0.65)"; cx.fillRect(bx, by, tw, 17); cx.fillStyle = "#ffe45a"; cx.fillText(tx, bx + 4, by + 13); });
		/* tape measure + voltmeter */
		function pin(p, col, txt) { cx.fillStyle = col; cx.strokeStyle = "#fff"; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(p[0], p[1], 6, 0, 7); cx.fill(); cx.stroke(); if (txt) { cx.font = "bold 10px sans-serif"; cx.fillStyle = "#fff"; cx.textAlign = "center"; cx.fillText(txt, p[0], p[1] + 3.5); cx.textAlign = "start"; } }
		function tag(x, y, t, col) { cx.font = "12px sans-serif"; var w = cx.measureText(t).width + 8, bx = Math.max(2, Math.min(x - w / 2, W - w - 2)), by = Math.max(2, Math.min(y - 9, H - 20)); cx.fillStyle = "rgba(0,0,0,0.7)"; cx.fillRect(bx, by, w, 17); cx.fillStyle = col; cx.fillText(t, bx + 4, by + 13); }
		if (ES.tape) { var ta = esT(ES.tape.a[0], ES.tape.a[1]), tb = esT(ES.tape.b[0], ES.tape.b[1]); cx.strokeStyle = "#a3e635"; cx.lineWidth = 2; cx.setLineDash([6, 4]); cx.beginPath(); cx.moveTo(ta[0], ta[1]); cx.lineTo(tb[0], tb[1]); cx.stroke(); cx.setLineDash([]); pin(ta, "#65a30d"); pin(tb, "#65a30d"); tag((ta[0] + tb[0]) / 2, (ta[1] + tb[1]) / 2 - 14, si(Math.hypot(ES.tape.a[0] - ES.tape.b[0], ES.tape.a[1] - ES.tape.b[1]), "m", 3), "#bef264"); }
		if (ES.volt.length) { var vv = ES.volt.map(function (q) { return M.potentialAt(ES.ch, q[0], q[1], ES.mode); }); pin(esT(ES.volt[0][0], ES.volt[0][1]), "#dc2626", "+"); if (ES.volt[1]) { var p1 = esT(ES.volt[0][0], ES.volt[0][1]), p2 = esT(ES.volt[1][0], ES.volt[1][1]); cx.strokeStyle = "rgba(255,255,255,0.45)"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(p1[0], p1[1]); cx.lineTo(p2[0], p2[1]); cx.stroke(); pin(p1, "#dc2626", "+"); pin(p2, "#111827", "−"); tag((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 - 16, "ΔV = " + si(vv[0] - vv[1], "V", 3), "#fde68a"); } else tag(esT(ES.volt[0][0], ES.volt[0][1])[0], esT(ES.volt[0][0], ES.volt[0][1])[1] - 16, "V = " + si(vv[0], "V", 3) + " · click to place the second probe", "#fde68a"); }
		/* charges */
		var qm = Math.max(C.qmax || 1e-6, 1e-12); ES.ch.forEach(function (c, i) { var p = esT(c.x, c.y), r = 8 + 6 * Math.sqrt(Math.abs(c.q) / qm); cx.fillStyle = c.q > 0 ? "#ef4444" : "#3b82f6"; cx.beginPath(); cx.arc(p[0], p[1], r, 0, 7); cx.fill(); cx.strokeStyle = i === ES.sel ? "#fff" : "rgba(255,255,255,0.55)"; cx.lineWidth = i === ES.sel ? 2.5 : 1.2; cx.stroke(); cx.fillStyle = "#fff"; cx.font = "bold " + Math.round(r * 1.3) + "px sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(c.q > 0 ? "+" : "−", p[0], p[1] + 1); });
		cx.textAlign = "start"; cx.textBaseline = "alphabetic";
		/* probe */
		if (ES.mouse && !ES.drag) { var mw = esW(ES.mouse[0], ES.mouse[1]), e2 = M.fieldAt(ES.ch, mw[0], mw[1], ES.mode), m2 = Math.hypot(e2[0], e2[1]); cx.strokeStyle = "rgba(255,255,255,0.7)"; cx.lineWidth = 1; cx.beginPath(); cx.arc(ES.mouse[0], ES.mouse[1], 4, 0, 7); cx.stroke(); if (m2 > 0) arrow(cx, ES.mouse[0], ES.mouse[1], ES.mouse[0] + e2[0] / m2 * 34, ES.mouse[1] - e2[1] / m2 * 34, "#fff", 2, 7); }
		/* scale bar */
		var sb = Math.pow(10, Math.floor(Math.log10(ES.VW / 3))), sp = sb * S; cx.strokeStyle = "rgba(255,255,255,0.8)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 14); cx.lineTo(12 + sp, H - 14); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.85)"; cx.font = "12px sans-serif"; cx.fillText(si(sb, "m", 2), 12, H - 20);
		$("em-es-badge").textContent = ES.drag ? "" : (ES.ch.length ? { pos: "Click to add a + charge · drag to move · select + Backspace removes", neg: "Click to add a − charge · drag to move · select + Backspace removes", move: "Drag a charge to move it", test: "Click to drop a test charge", sens: "Click to place a sensor · it shows the field there", tape: "Drag to measure a distance", volt: "Click to put down the red probe, then the black one" }[ES.tool] : "Click to add a charge, or pick an example below");
	}
	function esReadouts() {
		var m = ES.mouse; if (m) { var w = esW(m[0], m[1]), e = M.fieldAt(ES.ch, w[0], w[1], ES.mode), v = M.potentialAt(ES.ch, w[0], w[1], ES.mode), E = Math.hypot(e[0], e[1]); $("em-es-p").textContent = sig(w[0], 3) + ", " + sig(w[1], 3); $("em-es-e").textContent = si(E, ES.mode === "2d" ? "V/m" : "N/C", 3); $("em-es-es").textContent = "pointing " + ang(e[0], e[1]).toFixed(0) + "° (arrow on the picture)"; $("em-es-v").textContent = ES.mode === "2d" ? sig(v, 3) + " V" : si(v, "V", 3); $("em-es-vs").textContent = ES.mode === "2d" ? "zero at 1 m from the origin" : "zero very far away"; }
		else { $("em-es-p").textContent = "–"; $("em-es-e").textContent = "–"; $("em-es-v").textContent = "–"; $("em-es-es").textContent = "move the pointer over the picture"; $("em-es-vs").textContent = ""; }
		if (ES.gauss) { if (ES.gdirty) { ES.gres = M.gauss(ES.ch, ES.gc.x, ES.gc.y, ES.gc.R, ES.mode); ES.gdirty = false; } var g = ES.gres; $("em-es-gl").textContent = ES.mode === "2d" ? "Gauss's law (circle)" : "Gauss's law (sphere)"; var qsc = 0; ES.ch.forEach(function (c) { qsc += Math.abs(c.q); }); var fz = Math.abs(g.flux) < 1e-6 * qsc / M.EPS0; $("em-es-g").textContent = fz ? "Φ ≈ 0" : "Φ = " + sig(g.flux, 4) + (ES.mode === "2d" ? " V" : " V·m"); $("em-es-gs").textContent = "inside: " + si(g.enclosed, ES.mode === "2d" ? "C/m" : "C", 3) + " → Q/ε₀ = " + sig(g.expected, 4) + (Math.abs(g.expected) > 1e-6 * qsc / M.EPS0 ? " (" + (100 * (g.flux / g.expected - 1)).toFixed(2) + "% off)" : fz ? " (nothing net inside, so no net flux)" : ""); }
		else { $("em-es-gl").textContent = "Gauss's law"; $("em-es-g").textContent = "–"; $("em-es-gs").textContent = "tick “Gauss surface”"; }
		selUi();
	}
	function esHit(p) { var best = -1, bd = 1e9; ES.ch.forEach(function (c, i) { var s = esT(c.x, c.y), d = Math.hypot(s[0] - p[0], s[1] - p[1]); if (d < (coarse ? 26 : 16) && d < bd) { bd = d; best = i; } }); return best; }
	ev.cv.addEventListener("pointerdown", function (e) {
		ev.cv.setPointerCapture(e.pointerId); var p = ev.pos(e), i = esHit(p); ES.mouse = p;
		if (ES.gauss) { var c0 = esT(ES.gc.x, ES.gc.y), S = ev.fit() / ES.VW, d = Math.hypot(p[0] - c0[0], p[1] - c0[1]); if (i < 0 && Math.abs(d - ES.gc.R * S) < 12) { ES.drag = { k: "gR" }; ev.st.classList.add("is-grab"); return; } if (i < 0 && d < 12) { ES.drag = { k: "gC", dx: ES.gc.x - esW(p[0], p[1])[0], dy: ES.gc.y - esW(p[0], p[1])[1] }; ev.st.classList.add("is-grab"); return; } }
		var mh = null, near = function (q) { var s = esT(q[0], q[1]); return Math.hypot(s[0] - p[0], s[1] - p[1]) < (coarse ? 24 : 13); };
		if (i < 0) { if (ES.tape) { if (near(ES.tape.a)) mh = { k: "ta" }; else if (near(ES.tape.b)) mh = { k: "tb" }; } ES.volt.forEach(function (q, k) { if (!mh && near(q)) mh = { k: "v", i: k }; }); }
		if (mh) { ES.drag = mh; ES.sel = -1; ES.ssel = -1; ev.st.classList.add("is-grab"); selUi(); return; }
		var si2 = -1; ES.sens.forEach(function (s, k) { var q = esT(s.x, s.y); if (si2 < 0 && Math.hypot(q[0] - p[0], q[1] - p[1]) < (coarse ? 24 : 14)) si2 = k; });
		if (i < 0 && si2 >= 0) { ES.ssel = si2; ES.sel = -1; ES.drag = { k: "s", i: si2 }; ev.st.classList.add("is-grab"); selUi(); return; }
		ES.ssel = -1;
		if (i >= 0) { ES.sel = i; ES.drag = { k: "c", i: i }; ev.st.classList.add("is-grab"); selUi(); return; }
		var w = esW(p[0], p[1]);
		if (ES.tool === "pos" || ES.tool === "neg") { if (ES.ch.length >= 40) { toast("That is plenty of charges (40)"); return; } ES.ch.push({ x: w[0], y: w[1], q: (ES.tool === "pos" ? 1 : -1) * qNew() }); ES.sel = ES.ch.length - 1; ES.dirty = true; ES.gdirty = true; }
		else if (ES.tool === "tape") { ES.tape = { a: [w[0], w[1]], b: [w[0], w[1]] }; ES.drag = { k: "tb" }; ES.sel = -1; ES.ssel = -1; return; }
		else if (ES.tool === "volt") { if (ES.volt.length >= 2) ES.volt = []; ES.volt.push([w[0], w[1]]); ES.sel = -1; ES.ssel = -1; }
		else if (ES.tool === "sens") { if (ES.sens.length >= 12) ES.sens.shift(); ES.sens.push({ x: w[0], y: w[1] }); ES.ssel = ES.sens.length - 1; ES.sel = -1; }
		else if (ES.tool === "test") { if (ES.tests.length >= 8) ES.tests.shift(); var qq = ES.tcQ; var a0 = Math.hypot.apply(null, M.fieldAt(ES.ch, w[0], w[1], ES.mode)) * Math.abs(qq) / ES.tcM; ES.tests.push({ x: w[0], y: w[1], vx: 0, vy: 0, q: qq, m: ES.tcM, trail: [w[0], w[1]], alive: true, tau: Math.sqrt(0.08 * ES.VW / Math.max(a0, 1e-12)) }); }
		else ES.sel = -1; selUi();
	});
	ev.cv.addEventListener("pointermove", function (e) {
		var p = ev.pos(e); ES.mouse = p; if (!ES.drag) return; var w = esW(p[0], p[1]);
		if (ES.drag.k === "ta" && ES.tape) { ES.tape.a = [w[0], w[1]]; } else if (ES.drag.k === "tb" && ES.tape) { ES.tape.b = [w[0], w[1]]; } else if (ES.drag.k === "v") { var vq = ES.volt[ES.drag.i]; if (vq) { vq[0] = w[0]; vq[1] = w[1]; } } else if (ES.drag.k === "s") { var sn = ES.sens[ES.drag.i]; if (sn) { sn.x = w[0]; sn.y = w[1]; } } else if (ES.drag.k === "c") { var c = ES.ch[ES.drag.i]; if (c) { c.x = w[0]; c.y = w[1]; ES.dirty = true; ES.gdirty = true; } } else if (ES.drag.k === "gR") { ES.gc.R = Math.max(ES.VW * 0.03, Math.hypot(w[0] - ES.gc.x, w[1] - ES.gc.y)); ES.gdirty = true; } else if (ES.drag.k === "gC") { ES.gc.x = w[0] + ES.drag.dx; ES.gc.y = w[1] + ES.drag.dy; ES.gdirty = true; }
	});
	function esUp() { ES.drag = null; ev.st.classList.remove("is-grab"); }
	ev.cv.addEventListener("pointerup", esUp); ev.cv.addEventListener("pointercancel", esUp); ev.cv.addEventListener("pointerleave", function () { if (!ES.drag) ES.mouse = null; });
	document.addEventListener("keydown", function (e) {
		if ((e.key !== "Delete" && e.key !== "Backspace") || e.ctrlKey || e.metaKey || e.altKey) return;
		var t = e.target, tag = t && t.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
		if (!ev.cv.offsetParent || (ES.sel < 0 && ES.ssel < 0)) return; e.preventDefault(); esDel();
	});
	function esDel() { if (ES.ssel >= 0) { ES.sens.splice(ES.ssel, 1); ES.ssel = -1; return; } if (ES.sel >= 0) { ES.ch.splice(ES.sel, 1); ES.sel = -1; ES.dirty = true; ES.gdirty = true; selUi(); } }
	wireTools("em-es-tools", function (t) { ES.tool = t; });
	$("em-es-q").oninput = function () { ES.qk = +this.value; $("em-es-q-v").textContent = sig(Math.pow(10, ES.qk), 2) + " μC"; sset({ qk: ES.qk }); };
	$("em-es-w").oninput = function () { ES.VW = 4 * Math.pow(10, +this.value); $("em-es-w-v").textContent = sig(ES.VW, 3) + " m"; ES.dirty = true; ES.tests.forEach(function (t) { t.trail = [t.x, t.y]; }); };
	$("em-es-n").oninput = function () { ES.nLines = +this.value; $("em-es-n-v").textContent = this.value; ES.dirty = true; sset({ nLines: ES.nLines }); };
	[["em-es-lines", "lines"], ["em-es-arrows", "arrows"], ["em-es-eq", "eq"], ["em-es-gauss", "gauss"]].forEach(function (p) { $(p[0]).onchange = function () { ES[p[1]] = this.checked; ES.dirty = true; ES.gdirty = true; var o = {}; o["es_" + p[1]] = this.checked; sset(o); }; });
	$("em-es-col").onchange = function () { ES.col = this.value; ES.dirty = true; sset({ es_col: ES.col }); };
	$("em-es-mode").onchange = function () { ES.mode = this.value; ES.dirty = true; ES.gdirty = true; ES.tests = []; sset({ es_mode: ES.mode }); };
	$("em-es-selq").oninput = function () { var c = ES.ch[ES.sel]; if (!c) return; var v = +this.value; c.q = (Math.abs(v) < 0.05 ? 0.05 : Math.abs(v)) * (v < 0 ? -1 : 1) * 1e-6; ES.dirty = true; ES.gdirty = true; };
	$("em-es-del").onclick = esDel; $("em-es-sclear").onclick = function () { ES.sens = []; ES.ssel = -1; ES.tape = null; ES.volt = []; };
	$("em-es-reset").onclick = function () { if (ES.pre >= 0) esLoad(ES_PRE[ES.pre]); else { ES.ch = []; ES.sens = []; ES.tape = null; ES.volt = []; ES.tests = []; ES.sel = -1; ES.dirty = ES.gdirty = true; selUi(); } };
	$("em-es-clr2").onclick = function () { ES.ch = []; ES.sens = []; ES.tape = null; ES.volt = []; ES.tests = []; ES.sel = ES.ssel = -1; ES.pre = -1; ES.dirty = ES.gdirty = true; selUi(); }; $("em-es-clear").onclick = function () { ES.ch = []; ES.sel = -1; ES.dirty = true; ES.gdirty = true; ES.tests = []; selUi(); }; $("em-es-tclear").onclick = function () { ES.tests = []; };
	$("em-es-play").onclick = function () { ES.play = !ES.play; this.setAttribute("aria-pressed", String(ES.play)); this.textContent = ES.play ? "❚❚ Pause" : "▶ Play"; };
	wirePng("em-es-png", ev, esDraw); wireFull("em-es-full", ev);
	$("em-es-link").onclick = function () { copyLink({ c: ES.ch.map(function (c) { return [+c.x.toFixed(3), +c.y.toFixed(3), +(c.q * 1e6).toFixed(3)].join(","); }).join(";"), w: ES.VW.toFixed(3), m: ES.mode }); };
	function esStepTests(dt) {
		ES.tests.forEach(function (t) { if (!t.alive) return; M.stepFree(t, ES.ch, ES.mode, dt * 1.6 * t.tau); t.trail.push(t.x, t.y); if (t.trail.length > 1600) t.trail.splice(0, 2); var hit = ES.ch.some(function (c) { return Math.hypot(t.x - c.x, t.y - c.y) < 0.012 * ES.VW; }); if (hit || Math.abs(t.x) > 6 * ES.VW || Math.abs(t.y) > 6 * ES.VW) t.alive = false; });
	}

	/* =================== CURRENTS =================== */
	var MS = { w: [], tool: "out", sel: -1, VW: 0.4, lines: true, arrows: false, heat: false, loop: false, lc: { x: 0, y: 0, R: 0.06 }, mouse: null, drag: null, dirty: true, cache: {}, ik: 1, ldirty: true };
	var mv = mkView("ms", 1.6), msHeat = document.createElement("canvas");
	function mT(x, y) { var S = mv.fit() / MS.VW; return [mv.W / 2 + x * S, mv.H / 2 - y * S]; }
	function mW(px, py) { var S = mv.fit() / MS.VW; return [(px - mv.W / 2) / S, -(py - mv.H / 2) / S]; }
	function mBox() { var S = mv.fit() / MS.VW, hw = mv.W / 2 / S, hh = mv.H / 2 / S; return [-hw, -hh, hw, hh]; }
	function iNew() { return Math.pow(10, MS.ik); }
	var MS_PRE = [
		{ name: "One wire", w: [[0, 0, 10]], VW: 0.3 }, { name: "Parallel currents", w: [[-0.06, 0, 10], [0.06, 0, 10]], VW: 0.4 }, { name: "Opposite currents", w: [[-0.06, 0, 10], [0.06, 0, -10]], VW: 0.4 },
		{ name: "Solenoid (cross-section)", w: (function () { var a = []; for (var i = 0; i < 9; i++) { a.push([-0.16 + i * 0.04, 0.05, 10]); a.push([-0.16 + i * 0.04, -0.05, -10]); } return a; })(), VW: 0.6 },
		{ name: "Coaxial cable", w: (function () { var a = [[0, 0, 12]]; for (var i = 0; i < 12; i++) a.push([0.07 * Math.cos(i * TAU / 12), 0.07 * Math.sin(i * TAU / 12), -1]); return a; })(), VW: 0.3 },
		{ name: "Three wires", w: [[-0.08, -0.04, 10], [0.08, -0.04, 10], [0, 0.07, -20]], VW: 0.4 }
	];
	function msLoad(p) { MS.w = p.w.map(function (w) { return { x: w[0], y: w[1], I: w[2] }; }); MS.VW = p.VW; MS.sel = -1; MS.lc = { x: 0, y: 0, R: p.VW * 0.2 }; MS.dirty = true; MS.ldirty = true; syncMs(); }
	function syncMs() { $("em-ms-i").value = MS.ik; $("em-ms-i-v").textContent = sig(iNew(), 3) + " A"; $("em-ms-w").value = Math.log10(MS.VW / 0.4); $("em-ms-w-v").textContent = sig(MS.VW * 100, 3) + " cm"; msSel(); }
	function msSel() { var w = MS.w[MS.sel]; $("em-ms-sel").hidden = !w; if (!w) return; $("em-ms-sel-i").textContent = sig(w.I, 3) + " A (" + (w.I > 0 ? "out ⊙" : "into ⊗") + ")"; $("em-ms-seli").value = Math.max(-100, Math.min(100, w.I)); }
	function msRecompute() {
		var box = mBox(), W = mv.W, H = mv.H, C = mv.cache = {}; MS.cache = C; C.lines = []; C.bmax = 0;
		if (MS.lines && MS.w.length) {
			var nx = Math.max(40, Math.round(W / 6)), ny = Math.max(30, Math.round(H / 6)), vals = [], i, j, dx = (box[2] - box[0]) / nx, dy = (box[3] - box[1]) / ny; var rmin = MS.VW * 0.012;
			var fn = function (x, y) { var a = 0; for (var k = 0; k < MS.w.length; k++) { var r = Math.max(rmin, Math.hypot(x - MS.w[k].x, y - MS.w[k].y)); a += -M.MU0 * MS.w[k].I / TAU * Math.log(r); } return a; };
			for (j = 0; j <= ny; j += 2) for (i = 0; i <= nx; i += 2) vals.push(fn(box[0] + i * dx, box[1] + j * dy)); vals.sort(function (a, b) { return a - b; }); var lo = vals[Math.floor(vals.length * 0.03)], hi = vals[Math.floor(vals.length * 0.97)], n = 26, lv = [];
			if (hi - lo > 0) for (i = 0; i < n; i++) lv.push(lo + (i + 0.5) * (hi - lo) / n);
			C.lines = M.contours(fn, box, nx, ny, lv);
		}
		C.heat = null; if (MS.heat && MS.w.length) {
			var hw = Math.max(40, Math.round(W / 3)), hh = Math.max(30, Math.round(H / 3)); msHeat.width = hw; msHeat.height = hh; var hc = msHeat.getContext("2d"), img = hc.createImageData(hw, hh), imax = 0; MS.w.forEach(function (w) { imax = Math.max(imax, Math.abs(w.I)); }); var Bref = M.MU0 * imax / (TAU * 0.1 * MS.VW), x, y, o, b, u;
			for (j = 0; j < hh; j++) for (i = 0; i < hw; i++) { x = box[0] + (i + 0.5) / hw * (box[2] - box[0]); y = box[3] - (j + 0.5) / hh * (box[3] - box[1]); b = M.wireB(MS.w, x, y); u = Math.max(0, Math.min(1, (Math.log10(Math.hypot(b[0], b[1]) / Bref + 1e-12) + 2.5) / 3.5)); o = 4 * (j * hw + i); img.data[o] = 60 * u + 20 * (1 - u); img.data[o + 1] = 120 * Math.pow(u, 1.4); img.data[o + 2] = 255 * Math.pow(u, 0.8); img.data[o + 3] = 190; }
			hc.putImageData(img, 0, 0); C.heat = true;
		}
		MS.dirty = false;
	}
	function msDraw() {
		if (tab !== "ms") return; if (MS.dirty) msRecompute(); mv.begin(); var cx = mv.cx, W = mv.W, H = mv.H, C = MS.cache, S = Math.min(W, H * mv.aspect) / MS.VW; cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		if (C.heat) { cx.imageSmoothingEnabled = true; cx.drawImage(msHeat, 0, 0, W, H); }
		if (MS.lines) C.lines.forEach(function (s) { if (s.length) segs(cx, s, mT, "rgba(160,200,255,0.8)", 1.2); });
		if (MS.lines && MS.w.length) { /* direction arrows on the closest ring around each wire, counter-clockwise for current out of the page */ MS.w.forEach(function (w) { if (!w.I) return; for (var k = 0; k < 3; k++) { var r = (0.08 + 0.07 * k) * Math.min(MS.VW, 0.4 * MS.VW + 0.3) * 0.6 + MS.VW * 0.03, a = k * 1.1 + 0.5, p = mT(w.x + r * Math.cos(a), w.y + r * Math.sin(a)), t = [-Math.sin(a) * Math.sign(w.I), Math.cos(a) * Math.sign(w.I)]; arrow(cx, p[0] - t[0] * 7, p[1] + t[1] * 7, p[0] + t[0] * 7, p[1] - t[1] * 7, "rgba(200,225,255,0.95)", 0.1, 7); } }); }
		if (MS.arrows) { var gp = coarse ? 40 : 32, i, j; for (j = gp / 2; j < H; j += gp) for (i = gp / 2; i < W; i += gp) { var w = mW(i, j), b = M.wireB(MS.w, w[0], w[1]), m = Math.hypot(b[0], b[1]); if (!(m > 0)) continue; var imax = 0; MS.w.forEach(function (q) { imax = Math.max(imax, Math.abs(q.I)); }); var Bref = M.MU0 * imax / (TAU * 0.1 * MS.VW), u = Math.max(0.15, Math.min(1, (Math.log10(m / Bref + 1e-12) + 2.5) / 3.5)), L = gp * 0.42 * u; arrow(cx, i - b[0] / m * L * 0.5, j + b[1] / m * L * 0.5, i + b[0] / m * L * 0.5, j - b[1] / m * L * 0.5, "rgba(255,200,140," + (0.3 + 0.6 * u) + ")", 1.3, 5); } }
		if (MS.loop) { var c0 = mT(MS.lc.x, MS.lc.y), R = MS.lc.R * S; cx.setLineDash([7, 5]); cx.strokeStyle = "#86efac"; cx.lineWidth = 2; cx.beginPath(); cx.arc(c0[0], c0[1], R, 0, 7); cx.stroke(); cx.setLineDash([]); cx.fillStyle = "#86efac"; cx.beginPath(); cx.arc(c0[0], c0[1], 4, 0, 7); cx.fill(); cx.beginPath(); cx.arc(c0[0] + R, c0[1], 5, 0, 7); cx.fill(); }
		var r0 = Math.max(9, Math.min(16, 0.014 * W)); MS.w.forEach(function (w, i) { var p = mT(w.x, w.y), rr = r0 + 2 * Math.log10(Math.max(1, Math.abs(w.I))); cx.fillStyle = "#1f2937"; cx.beginPath(); cx.arc(p[0], p[1], rr, 0, 7); cx.fill(); cx.strokeStyle = i === MS.sel ? "#fff" : (w.I > 0 ? "#fb923c" : "#60a5fa"); cx.lineWidth = i === MS.sel ? 3 : 2; cx.stroke(); cx.strokeStyle = w.I > 0 ? "#fb923c" : "#60a5fa"; cx.fillStyle = cx.strokeStyle; cx.lineWidth = 2; if (w.I > 0) { cx.beginPath(); cx.arc(p[0], p[1], rr * 0.28, 0, 7); cx.fill(); } else { var d = rr * 0.5; cx.beginPath(); cx.moveTo(p[0] - d, p[1] - d); cx.lineTo(p[0] + d, p[1] + d); cx.moveTo(p[0] + d, p[1] - d); cx.lineTo(p[0] - d, p[1] + d); cx.stroke(); } });
		var sw = MS.w[MS.sel]; if (sw) { var f = M.wireForce(MS.w, MS.sel), fm = Math.hypot(f[0], f[1]); if (fm > 0) { var p = mT(sw.x, sw.y); arrow(cx, p[0], p[1], p[0] + f[0] / fm * 60, p[1] - f[1] / fm * 60, "#fde047", 3, 10); } }
		if (MS.mouse && !MS.drag) { var mw = mW(MS.mouse[0], MS.mouse[1]), b2 = M.wireB(MS.w, mw[0], mw[1]), m2 = Math.hypot(b2[0], b2[1]); cx.strokeStyle = "rgba(255,255,255,0.7)"; cx.lineWidth = 1; cx.beginPath(); cx.arc(MS.mouse[0], MS.mouse[1], 4, 0, 7); cx.stroke(); if (m2 > 0) arrow(cx, MS.mouse[0], MS.mouse[1], MS.mouse[0] + b2[0] / m2 * 34, MS.mouse[1] - b2[1] / m2 * 34, "#fff", 2, 7); }
		var sb = Math.pow(10, Math.floor(Math.log10(MS.VW / 3))), sp = sb * S; cx.strokeStyle = "rgba(255,255,255,0.8)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 14); cx.lineTo(12 + sp, H - 14); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.85)"; cx.font = "12px sans-serif"; cx.fillText(si(sb, "m", 2), 12, H - 20);
		$("em-ms-badge").textContent = MS.drag ? "" : (MS.w.length ? { out: "Click to add a wire carrying current out of the screen", in: "Click to add a wire carrying current into the screen", move: "Drag a wire to move it" }[MS.tool] : "Click to add a wire, or pick an example below");
	}
	function msReadouts() {
		var m = MS.mouse; if (m) { var w = mW(m[0], m[1]), b = M.wireB(MS.w, w[0], w[1]), B = Math.hypot(b[0], b[1]); $("em-ms-p").textContent = sig(w[0] * 100, 3) + ", " + sig(w[1] * 100, 3); $("em-ms-b").textContent = si(B, "T", 3); $("em-ms-bs").textContent = "pointing " + ang(b[0], b[1]).toFixed(0) + "° (arrow on the picture)"; } else { $("em-ms-p").textContent = "–"; $("em-ms-b").textContent = "–"; $("em-ms-bs").textContent = "move the pointer over the picture"; }
		if (MS.loop) { if (MS.ldirty) { MS.ares = M.ampere(MS.w, MS.lc.x, MS.lc.y, MS.lc.R); MS.ldirty = false; } var a = MS.ares; var isum = 0; MS.w.forEach(function (w) { isum += Math.abs(w.I); }); $("em-ms-a").textContent = "∮B·dl = " + (Math.abs(a.integral) < 1e-6 * M.MU0 * isum ? "≈ 0" : si(a.integral, "T·m", 4)); $("em-ms-as").textContent = "current inside " + sig(a.enclosed, 3) + " A → μ₀I = " + si(a.expected, "T·m", 4); } else { $("em-ms-a").textContent = "–"; $("em-ms-as").textContent = "tick “Ampère loop”"; }
		var w = MS.w[MS.sel]; if (w && MS.w.length > 1) { var f = M.wireForce(MS.w, MS.sel), fm = Math.hypot(f[0], f[1]); $("em-ms-f").textContent = si(fm, "N/m", 3); $("em-ms-fs").textContent = "yellow arrow: " + (fm > 0 ? "pulls toward / pushes from the other wires" : "no net force"); } else { $("em-ms-f").textContent = "–"; $("em-ms-fs").textContent = w ? "needs a second wire" : "select a wire"; }
		msSel();
	}
	function msHit(p) { var best = -1, bd = 1e9; MS.w.forEach(function (c, i) { var s = mT(c.x, c.y), d = Math.hypot(s[0] - p[0], s[1] - p[1]); if (d < (coarse ? 26 : 18) && d < bd) { bd = d; best = i; } }); return best; }
	mv.cv.addEventListener("pointerdown", function (e) {
		mv.cv.setPointerCapture(e.pointerId); var p = mv.pos(e), i = msHit(p); MS.mouse = p;
		if (MS.loop) { var c0 = mT(MS.lc.x, MS.lc.y), S = mv.fit() / MS.VW, d = Math.hypot(p[0] - c0[0], p[1] - c0[1]); if (i < 0 && Math.abs(d - MS.lc.R * S) < 12) { MS.drag = { k: "lR" }; mv.st.classList.add("is-grab"); return; } if (i < 0 && d < 12) { var w0 = mW(p[0], p[1]); MS.drag = { k: "lC", dx: MS.lc.x - w0[0], dy: MS.lc.y - w0[1] }; mv.st.classList.add("is-grab"); return; } }
		if (i >= 0) { MS.sel = i; MS.drag = { k: "w", i: i }; mv.st.classList.add("is-grab"); msSel(); return; }
		var w = mW(p[0], p[1]); if (MS.tool === "out" || MS.tool === "in") { if (MS.w.length >= 40) { toast("That is plenty of wires (40)"); return; } MS.w.push({ x: w[0], y: w[1], I: (MS.tool === "out" ? 1 : -1) * iNew() }); MS.sel = MS.w.length - 1; MS.dirty = true; MS.ldirty = true; } else MS.sel = -1; msSel();
	});
	mv.cv.addEventListener("pointermove", function (e) { var p = mv.pos(e); MS.mouse = p; if (!MS.drag) return; var w = mW(p[0], p[1]); if (MS.drag.k === "w") { var c = MS.w[MS.drag.i]; if (c) { c.x = w[0]; c.y = w[1]; MS.dirty = true; MS.ldirty = true; } } else if (MS.drag.k === "lR") { MS.lc.R = Math.max(MS.VW * 0.02, Math.hypot(w[0] - MS.lc.x, w[1] - MS.lc.y)); MS.ldirty = true; } else if (MS.drag.k === "lC") { MS.lc.x = w[0] + MS.drag.dx; MS.lc.y = w[1] + MS.drag.dy; MS.ldirty = true; } });
	function msUp() { MS.drag = null; mv.st.classList.remove("is-grab"); } mv.cv.addEventListener("pointerup", msUp); mv.cv.addEventListener("pointercancel", msUp); mv.cv.addEventListener("pointerleave", function () { if (!MS.drag) MS.mouse = null; });
	function msDel() { if (MS.sel >= 0) { MS.w.splice(MS.sel, 1); MS.sel = -1; MS.dirty = true; MS.ldirty = true; msSel(); } }
	mv.cv.addEventListener("keydown", function (e) { if ((e.key === "Delete" || e.key === "Backspace") && MS.sel >= 0) { e.preventDefault(); msDel(); } });
	wireTools("em-ms-tools", function (t) { MS.tool = t; });
	$("em-ms-i").oninput = function () { MS.ik = +this.value; $("em-ms-i-v").textContent = sig(iNew(), 3) + " A"; sset({ ik: MS.ik }); };
	$("em-ms-w").oninput = function () { MS.VW = 0.4 * Math.pow(10, +this.value); $("em-ms-w-v").textContent = sig(MS.VW * 100, 3) + " cm"; MS.dirty = true; };
	[["em-ms-lines", "lines"], ["em-ms-arrows", "arrows"], ["em-ms-heat", "heat"], ["em-ms-loop", "loop"]].forEach(function (p) { $(p[0]).onchange = function () { MS[p[1]] = this.checked; MS.dirty = true; MS.ldirty = true; }; });
	$("em-ms-seli").oninput = function () { var w = MS.w[MS.sel]; if (!w) return; w.I = +this.value; MS.dirty = true; MS.ldirty = true; $("em-ms-sel-i").textContent = sig(w.I, 3) + " A (" + (w.I > 0 ? "out ⊙" : w.I < 0 ? "into ⊗" : "off") + ")"; };
	$("em-ms-del").onclick = msDel; $("em-ms-clear").onclick = function () { MS.w = []; MS.sel = -1; MS.dirty = true; MS.ldirty = true; msSel(); };
	wirePng("em-ms-png", mv, msDraw); wireFull("em-ms-full", mv);
	$("em-ms-link").onclick = function () { copyLink({ w: MS.w.map(function (w) { return [+(w.x * 100).toFixed(3), +(w.y * 100).toFixed(3), +w.I.toFixed(3)].join(","); }).join(";"), vw: (MS.VW * 100).toFixed(3) }); };
	chips($("em-ms-pre"), MS_PRE, msLoad);
	chips($("em-es-pre"), ES_PRE, esLoad);

	/* =================== MAGNETS (permanent bar magnets: flux lines = contours of A_z, isopotentials = contours of psi) =================== */
	var MG = { m: [], tool: "move", sel: -1, VW: 0.2, wk: 0, flux: true, iso: true, arrows: false, needles: false, labels: true, nf: 16, ni: 14, col: "none", sp: 1, comps: [], drag: null, mouse: null, dirty: true, cache: {}, pre: 0, def: { Br: 1.2, L: 0.06, W: 0.02 }, fast: false };
	var gv = mkView("mg", 1.6), mgHeat = document.createElement("canvas");
	var MG_COL = { n: "#dc2626", s: "#16a34a", flux: "rgba(175,208,255,0.9)", iso: "rgba(255,196,84,0.8)" };
	function gT(x, y) { var S = gv.fit() / MG.VW; return [gv.W / 2 + x * S, gv.H / 2 - y * S]; }
	function gW(px, py) { var S = gv.fit() / MG.VW; return [(px - gv.W / 2) / S, -(py - gv.H / 2) / S]; }
	function gBox() { var S = gv.fit() / MG.VW, hw = gv.W / 2 / S, hh = gv.H / 2 / S; return [-hw, -hh, hw, hh]; }
	function deg(a) { var d = Math.round(a * 180 / PI) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; }
	function mgMag(x, y, d, L, W, Br) { return { x: x / 100, y: y / 100, a: d * PI / 180, L: L / 100, W: W / 100, Br: Br || 1.2 }; }
	var MG_PRE = [
		{ name: "Bar magnet", m: [[0, 0, 0, 6, 2]], VW: 20 },
		{ name: "Two attracting", m: [[-4.6, 0, 0, 6, 2], [4.6, 0, 0, 6, 2]], VW: 28 },
		{ name: "Two repelling", m: [[-4.6, 0, 0, 6, 2], [4.6, 0, 180, 6, 2]], VW: 28 },
		{ name: "Stacked end to end", m: [[-3, 0, 0, 6, 2], [3, 0, 0, 6, 2]], VW: 28 },
		{ name: "Side by side, opposite", m: [[0, 1.5, 0, 6, 2], [0, -1.5, 180, 6, 2]], VW: 22 },
		{ name: "Horseshoe (3 pieces)", m: [[-3, 1, -90, 5, 1.6], [3, 1, 90, 5, 1.6], [0, -2.3, 0, 7.6, 1.6]], VW: 22 },
		{ name: "Halbach row", m: [[-3.2, 0, 0, 1.6, 1.6], [-1.6, 0, 90, 1.6, 1.6], [0, 0, 180, 1.6, 1.6], [1.6, 0, 270, 1.6, 1.6], [3.2, 0, 0, 1.6, 1.6]], VW: 18, note: "a Halbach array: strong field on one side, almost none on the other" },
		{ name: "Halbach ring", m: (function () { var a = []; for (var k = 0; k < 12; k++) { var p = k * 30; a.push([5 * Math.cos(p * PI / 180), 5 * Math.sin(p * PI / 180), 2 * p, 2, 2]); } return a; })(), VW: 22, note: "each piece turned twice as far as its place round the ring: a nearly uniform field inside, almost none outside" },
		{ name: "Ring pointing out", m: (function () { var a = []; for (var k = 0; k < 8; k++) { var p = k * 45; a.push([5 * Math.cos(p * PI / 180), 5 * Math.sin(p * PI / 180), p, 2.4, 1.4]); } return a; })(), VW: 22 },
		{ name: "Compass test", m: [[0, 0, 0, 6, 2]], VW: 22, comps: [[-7, 4], [0, 5], [7, 4], [8, 0], [0, -5]] }
	];
	function mgLoad(p) {
		MG.pre = MG_PRE.indexOf(p); MG.m = p.m.map(function (a) { return mgMag(a[0], a[1], a[2], a[3], a[4], MG.def.Br); }); MG.VW = p.VW / 100; MG.sel = -1;
		MG.comps = (p.comps || []).map(function (c) { return { x: c[0] / 100, y: c[1] / 100 }; }); MG.dirty = true; mgSync(); if (p.note) toast(p.name + ": " + p.note);
	}
	function mgEdit() { return MG.sel >= 0 && MG.m[MG.sel] ? [MG.m[MG.sel]] : MG.m; }
	function mgSync() {
		var s = MG.m[MG.sel], ref = s || MG.m[0] || MG.def;
		$("em-mg-edit-h").textContent = s ? "Selected magnet" : (MG.m.length ? "All magnets (select one to change only it)" : "New magnets");
		$("em-mg-br").value = ref.Br; $("em-mg-br-v").textContent = ref.Br.toFixed(2) + " T"; $("em-mg-len").value = (ref.L * 100).toFixed(1); $("em-mg-len-v").textContent = sig(ref.L * 100, 3) + " cm"; $("em-mg-wid").value = (ref.W * 100).toFixed(1); $("em-mg-wid-v").textContent = sig(ref.W * 100, 3) + " cm";
		$("em-mg-ang-f").hidden = !s; $("em-mg-sel").hidden = !s; if (s) { $("em-mg-ang").value = deg(s.a); $("em-mg-ang-v").textContent = deg(s.a); }
		MG.wk = Math.log10(MG.VW / 0.2); $("em-mg-w").value = MG.wk; $("em-mg-w-v").textContent = sig(MG.VW * 100, 3) + " cm";
		$("em-mg-nf").value = MG.nf; $("em-mg-nf-v").textContent = MG.nf; $("em-mg-ni").value = MG.ni; $("em-mg-ni-v").textContent = MG.ni;
	}
	function grid(fn, box, nx, ny) { var F = new Float64Array((nx + 1) * (ny + 1)), dx = (box[2] - box[0]) / nx, dy = (box[3] - box[1]) / ny, i, j, lo = Infinity, hi = -Infinity, v; for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) { v = fn(box[0] + i * dx, box[1] + j * dy); F[j * (nx + 1) + i] = v; if (v < lo) lo = v; if (v > hi) hi = v; } return { F: F, lo: lo, hi: hi }; }
	function fromGrid(g) { var k = 0; return function () { return g.F[k++]; }; }   /* M.contours samples in the same order, so it can read the grid back instead of evaluating again */
	function mgRecompute() {
		var box = gBox(), W = gv.W, H = gv.H, C = MG.cache = {}, st = MG.fast ? 9 : 5, nx = Math.max(30, Math.min(260, Math.round(W / st))), ny = Math.max(20, Math.min(200, Math.round(H / st)));
		C.flux = []; C.iso = [];
		if (MG.m.length && MG.flux) { var ga = grid(function (x, y) { return M.magA(MG.m, x, y); }, box, nx, ny), la = M.evenLevels(ga.lo, ga.hi, Math.max(2, Math.round(MG.nf / 2)), MG.sp); C.flux = M.contours(fromGrid(ga), box, nx, ny, la); }
		if (MG.m.length && MG.iso) { var gp = grid(function (x, y) { return M.magPsi(MG.m, x, y); }, box, nx, ny), lp = M.evenLevels(gp.lo, gp.hi, Math.max(2, Math.round(MG.ni / 2)), MG.sp); var cs = M.contours(fromGrid(gp), box, nx, ny, lp); C.iso = cs.map(function (s, i) { return { s: s, lv: lp[i] }; }); }
		C.bref = 0; MG.m.forEach(function (m) { C.bref = Math.max(C.bref, m.Br); });
		C.heat = null; if (MG.col !== "none" && MG.m.length) {
			var hs = MG.fast ? 7 : 4, hw = Math.max(30, Math.round(W / hs)), hh = Math.max(20, Math.round(H / hs)), i, j; mgHeat.width = hw; mgHeat.height = hh; var hc = mgHeat.getContext("2d"), img = hc.createImageData(hw, hh), pref = 0;
			if (MG.col === "psi") { MG.m.forEach(function (m) { pref = Math.max(pref, m.Br / M.MU0 * m.W * 0.3); }); }
			for (j = 0; j < hh; j++) for (i = 0; i < hw; i++) {
				var x = box[0] + (i + 0.5) / hw * (box[2] - box[0]), y = box[3] - (j + 0.5) / hh * (box[3] - box[1]), o = 4 * (j * hw + i), r, g, b;
				if (MG.col === "psi") { var v = Math.tanh(M.magPsi(MG.m, x, y) / pref); if (v >= 0) { r = 230 * v; g = 50 * v; b = 50 * v; } else { r = 30 * -v; g = 190 * -v; b = 80 * -v; } }
				else { var bb = M.magB(MG.m, x, y), u = Math.max(0, Math.min(1, (Math.log10(Math.hypot(bb[0], bb[1]) / C.bref + 1e-12) + 3) / 3)); r = 120 * Math.pow(u, 1.2) + 10; g = 70 * Math.pow(u, 2) + 15 * u; b = 255 * Math.pow(u, 0.7) * 0.85 + 25; }
				img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 210;
			}
			hc.putImageData(img, 0, 0); C.heat = true;
		}
		MG.dirty = false;
	}
	function magCorners(m) { var c = Math.cos(m.a), s = Math.sin(m.a), hl = m.L / 2, hw = m.W / 2; return [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(function (p) { return gT(m.x + p[0] * c - p[1] * s, m.y + p[0] * s + p[1] * c); }); }
	function handlePos(m) { var c = Math.cos(m.a), s = Math.sin(m.a), e = gT(m.x + m.L / 2 * c, m.y + m.L / 2 * s); return { e: e, h: [e[0] + c * (coarse ? 30 : 24), e[1] - s * (coarse ? 30 : 24)] }; }
	function needle(cx, x, y, b, half, w) { var m = Math.hypot(b[0], b[1]); if (!(m > 0)) return; var ux = b[0] / m, uy = -b[1] / m; cx.lineWidth = w; cx.strokeStyle = "#ef4444"; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + ux * half, y + uy * half); cx.stroke(); cx.strokeStyle = "#d1d5db"; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - ux * half, y - uy * half); cx.stroke(); }
	function mgDraw() {
		if (tab !== "mg") return; if (MG.dirty) mgRecompute(); gv.begin(); var cx = gv.cx, W = gv.W, H = gv.H, C = MG.cache, S = gv.fit() / MG.VW;
		cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		if (C.heat) { cx.imageSmoothingEnabled = true; cx.drawImage(mgHeat, 0, 0, W, H); }
		if (MG.iso) C.iso.forEach(function (o) { if (o.s.length) segs(cx, o.s, gT, MG_COL.iso, 1.15); });
		if (MG.flux) {
			C.flux.forEach(function (s) { if (s.length) segs(cx, s, gT, MG_COL.flux, 1.35); });
			/* direction arrows spread evenly: at most one per ~56 px cell, placed where a flux line crosses it */
			var used = {}, cell = coarse ? 70 : 56; C.flux.forEach(function (s) { for (var i = 0; i < s.length; i += 4) { var a = gT(s[i], s[i + 1]), b = gT(s[i + 2], s[i + 3]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, key = Math.floor(mx / cell) + "," + Math.floor(my / cell); if (used[key] || mx < 8 || my < 8 || mx > W - 8 || my > H - 8) continue; if ((Math.floor(mx / cell) + Math.floor(my / cell)) % 2) continue;
				var w = gW(mx, my), B = M.magB(MG.m, w[0], w[1]), bm = Math.hypot(B[0], B[1]); if (!(bm > 0)) continue; used[key] = 1; arrow(cx, mx - B[0] / bm * 5, my + B[1] / bm * 5, mx + B[0] / bm * 5, my - B[1] / bm * 5, "rgba(205,225,255,0.95)", 0.1, 7); } });
		}
		if (MG.arrows && MG.m.length) { var gp = coarse ? 40 : 32, i, j; for (j = gp / 2; j < H; j += gp) for (i = gp / 2; i < W; i += gp) { var w2 = gW(i, j), b2 = M.magB(MG.m, w2[0], w2[1]), m2 = Math.hypot(b2[0], b2[1]); if (!(m2 > 0)) continue; var u = Math.max(0.15, Math.min(1, (Math.log10(m2 / C.bref + 1e-12) + 3) / 3)), L = gp * 0.42 * u; arrow(cx, i - b2[0] / m2 * L * 0.5, j + b2[1] / m2 * L * 0.5, i + b2[0] / m2 * L * 0.5, j - b2[1] / m2 * L * 0.5, "rgba(255,170,200," + (0.35 + 0.6 * u) + ")", 1.3, 5); } }
		if (MG.needles && MG.m.length) { var np = coarse ? 42 : 34, a, b3; for (b3 = np / 2; b3 < H; b3 += np) for (a = np / 2; a < W; a += np) { var w3 = gW(a, b3); if (MG.m.some(function (m) { return M.magInside(m, w3[0], w3[1]); })) continue; needle(cx, a, b3, M.magB(MG.m, w3[0], w3[1]), np * 0.36, 2.2); cx.fillStyle = "#9ca3af"; cx.beginPath(); cx.arc(a, b3, 1.6, 0, 7); cx.fill(); } }
		/* magnets: S half green, N half red */
		MG.m.forEach(function (m, k) {
			var p = magCorners(m), mid = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], mid2 = [(p[3][0] + p[2][0]) / 2, (p[3][1] + p[2][1]) / 2];
			cx.fillStyle = MG_COL.s; cx.beginPath(); cx.moveTo(p[0][0], p[0][1]); cx.lineTo(mid[0], mid[1]); cx.lineTo(mid2[0], mid2[1]); cx.lineTo(p[3][0], p[3][1]); cx.closePath(); cx.fill();
			cx.fillStyle = MG_COL.n; cx.beginPath(); cx.moveTo(mid[0], mid[1]); cx.lineTo(p[1][0], p[1][1]); cx.lineTo(p[2][0], p[2][1]); cx.lineTo(mid2[0], mid2[1]); cx.closePath(); cx.fill();
			cx.strokeStyle = k === MG.sel ? "#fff" : "rgba(255,255,255,0.45)"; cx.lineWidth = k === MG.sel ? 2.5 : 1; cx.beginPath(); p.forEach(function (q, i) { if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); }); cx.closePath(); cx.stroke();
			if (MG.labels) { var fs = Math.max(10, Math.min(20, Math.min(m.L, m.W * 2) * S * 0.32)); cx.font = "bold " + Math.round(fs) + "px sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillStyle = "#fff"; var c = Math.cos(m.a), s = Math.sin(m.a), pn = gT(m.x + m.L / 4 * c, m.y + m.L / 4 * s), ps = gT(m.x - m.L / 4 * c, m.y - m.L / 4 * s); if (m.L * S > 2.2 * fs) { cx.fillText("N", pn[0], pn[1] + 1); cx.fillText("S", ps[0], ps[1] + 1); } }
			if (k === MG.sel) { var hp = handlePos(m); cx.strokeStyle = "#fde047"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(hp.e[0], hp.e[1]); cx.lineTo(hp.h[0], hp.h[1]); cx.stroke(); cx.fillStyle = "#fde047"; cx.beginPath(); cx.arc(hp.h[0], hp.h[1], coarse ? 10 : 7, 0, 7); cx.fill(); cx.fillStyle = "#1f2937"; cx.font = "bold 11px sans-serif"; cx.fillText("↻", hp.h[0], hp.h[1] + 1); }
		});
		cx.textAlign = "start"; cx.textBaseline = "alphabetic";
		/* compasses */
		MG.comps.forEach(function (c) { var p = gT(c.x, c.y), r = coarse ? 22 : 18; cx.fillStyle = "rgba(15,23,42,0.85)"; cx.strokeStyle = "#e5e7eb"; cx.lineWidth = 2; cx.beginPath(); cx.arc(p[0], p[1], r, 0, 7); cx.fill(); cx.stroke(); needle(cx, p[0], p[1], M.magB(MG.m, c.x, c.y), r * 0.8, 3.5); cx.fillStyle = "#e5e7eb"; cx.beginPath(); cx.arc(p[0], p[1], 2.5, 0, 7); cx.fill(); });
		if (MG.mouse && !MG.drag && MG.m.length) { var mw = gW(MG.mouse[0], MG.mouse[1]), bb = M.magB(MG.m, mw[0], mw[1]), bm2 = Math.hypot(bb[0], bb[1]); cx.strokeStyle = "rgba(255,255,255,0.7)"; cx.lineWidth = 1; cx.beginPath(); cx.arc(MG.mouse[0], MG.mouse[1], 4, 0, 7); cx.stroke(); if (bm2 > 0) arrow(cx, MG.mouse[0], MG.mouse[1], MG.mouse[0] + bb[0] / bm2 * 34, MG.mouse[1] - bb[1] / bm2 * 34, "#fff", 2, 7); }
		var sb = Math.pow(10, Math.floor(Math.log10(MG.VW / 3))), sp = sb * S; cx.strokeStyle = "rgba(255,255,255,0.8)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 14); cx.lineTo(12 + sp, H - 14); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.85)"; cx.font = "12px sans-serif"; cx.fillText(si(sb, "m", 2), 12, H - 20);
		$("em-mg-badge").textContent = MG.drag ? "" : (MG.m.length ? { move: "Drag a magnet to move it · drag the yellow handle or scroll over it to turn it", add: "Click to add a magnet", compass: "Click to put down a compass · drag it around" }[MG.tool] : "Click with “Add a magnet”, or pick an example below");
		$("em-mg-legend").hidden = !(MG.flux || MG.iso); var lg = $("em-mg-legend").children; if (lg.length) { lg[0].hidden = !MG.flux; lg[1].hidden = !MG.iso; }
	}
	function mgReadouts() {
		var m = MG.mouse; if (m && MG.m.length) { var w = gW(m[0], m[1]), b = M.magB(MG.m, w[0], w[1]), h = M.magH(MG.m, w[0], w[1]), ps = M.magPsi(MG.m, w[0], w[1]), inside = MG.m.some(function (q) { return M.magInside(q, w[0], w[1]); });
			$("em-mg-p").textContent = sig(w[0] * 100, 3) + ", " + sig(w[1] * 100, 3); $("em-mg-ps").textContent = inside ? "inside a magnet" : "position in centimetres";
			$("em-mg-b").textContent = si(Math.hypot(b[0], b[1]), "T", 3); $("em-mg-bs").textContent = "pointing " + ang(b[0], b[1]).toFixed(0) + "°" + (inside ? "; H inside points " + ang(h[0], h[1]).toFixed(0) + "° (B = μ₀(H + M))" : " (B = μ₀H out here)");
			$("em-mg-v").textContent = si(ps, "A", 3); $("em-mg-vs").textContent = "H = " + si(Math.hypot(h[0], h[1]), "A/m", 3) + " = −∇ψ; ψ is 0 far away"; }
		else { $("em-mg-p").textContent = "–"; $("em-mg-b").textContent = "–"; $("em-mg-v").textContent = "–"; $("em-mg-bs").textContent = "move the pointer over the picture"; $("em-mg-vs").textContent = ""; $("em-mg-ps").textContent = "position in centimetres"; }
		var s = MG.m[MG.sel]; if (s) { $("em-mg-s").textContent = s.Br.toFixed(2) + " T · N at " + deg(s.a) + "°"; $("em-mg-ss").textContent = sig(s.L * 100, 3) + " × " + sig(s.W * 100, 3) + " cm; dipole moment " + si(M.magMoment(s), "A·m", 3) + " per metre of depth"; }
		else { $("em-mg-s").textContent = MG.m.length ? MG.m.length + (MG.m.length === 1 ? " magnet" : " magnets") : "–"; $("em-mg-ss").textContent = "click a magnet to select it"; }
	}
	function mgHit(p) { var w = gW(p[0], p[1]), tol = (coarse ? 10 : 4) / (gv.fit() / MG.VW), best = -1, i; for (i = MG.m.length - 1; i >= 0; i--) { var m = MG.m[i], c = Math.cos(m.a), s = Math.sin(m.a), dx = w[0] - m.x, dy = w[1] - m.y; if (Math.abs(dx * c + dy * s) < m.L / 2 + tol && Math.abs(-dx * s + dy * c) < m.W / 2 + tol) { best = i; break; } } return best; }
	function mgCompHit(p) { var r = coarse ? 24 : 19, k; for (k = MG.comps.length - 1; k >= 0; k--) { var q = gT(MG.comps[k].x, MG.comps[k].y); if (Math.hypot(q[0] - p[0], q[1] - p[1]) < r) return k; } return -1; }
	function mgTurn(m, a, snap) { m.a = snap ? Math.round(a / (5 * PI / 180)) * (5 * PI / 180) : a; MG.dirty = true; }
	gv.cv.addEventListener("pointerdown", function (e) {
		gv.cv.setPointerCapture(e.pointerId); var p = gv.pos(e); MG.mouse = p; var s = MG.m[MG.sel];
		if (s) { var hp = handlePos(s); if (Math.hypot(hp.h[0] - p[0], hp.h[1] - p[1]) < (coarse ? 20 : 12)) { MG.drag = { k: "rot", i: MG.sel }; MG.fast = true; gv.st.classList.add("is-grab"); return; } }
		var c = mgCompHit(p); if (c >= 0) { MG.drag = { k: "comp", i: c }; gv.st.classList.add("is-grab"); return; }
		var i = mgHit(p), w = gW(p[0], p[1]);
		if (i >= 0) { MG.sel = i; MG.drag = { k: "mag", i: i, dx: MG.m[i].x - w[0], dy: MG.m[i].y - w[1] }; MG.fast = true; gv.st.classList.add("is-grab"); mgSync(); return; }
		if (MG.tool === "add") { if (MG.m.length >= 24) { toast("That is plenty of magnets (24)"); return; } var d = MG.def; MG.m.push({ x: w[0], y: w[1], a: 0, L: d.L, W: d.W, Br: d.Br }); MG.sel = MG.m.length - 1; MG.pre = -1; MG.dirty = true; }
		else if (MG.tool === "compass") { if (MG.comps.length >= 8) MG.comps.shift(); MG.comps.push({ x: w[0], y: w[1] }); }
		else MG.sel = -1;
		mgSync();
	});
	gv.cv.addEventListener("pointermove", function (e) {
		var p = gv.pos(e); MG.mouse = p; if (!MG.drag) return; var w = gW(p[0], p[1]), d = MG.drag;
		if (d.k === "mag") { var m = MG.m[d.i]; if (m) { m.x = w[0] + d.dx; m.y = w[1] + d.dy; MG.dirty = true; } }
		else if (d.k === "rot") { var r = MG.m[d.i]; if (r) { mgTurn(r, Math.atan2(w[1] - r.y, w[0] - r.x), !e.shiftKey); mgSync(); } }
		else if (d.k === "comp") { var c = MG.comps[d.i]; if (c) { c.x = w[0]; c.y = w[1]; } }
	});
	function mgUp() { if (MG.drag && MG.drag.k !== "comp") MG.dirty = true; MG.drag = null; MG.fast = false; gv.st.classList.remove("is-grab"); }
	gv.cv.addEventListener("pointerup", mgUp); gv.cv.addEventListener("pointercancel", mgUp); gv.cv.addEventListener("pointerleave", function () { if (!MG.drag) MG.mouse = null; });
	gv.cv.addEventListener("wheel", function (e) { var i = mgHit(gv.pos(e)); if (i < 0) return; e.preventDefault(); MG.sel = i; var m = MG.m[i]; mgTurn(m, m.a + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 1 : 15) * PI / 180, !e.shiftKey); mgSync(); }, { passive: false });
	function mgDel() { if (MG.sel >= 0) { MG.m.splice(MG.sel, 1); MG.sel = -1; MG.pre = -1; MG.dirty = true; mgSync(); } }
	document.addEventListener("keydown", function (e) {
		if (e.ctrlKey || e.metaKey || e.altKey || tab !== "mg" || MG.sel < 0) return; var t = e.target, tg = t && t.tagName; if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || (t && t.isContentEditable)) return;
		if (!gv.cv.offsetParent) return;
		if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); mgDel(); } else if (e.key === "r" || e.key === "R") { e.preventDefault(); var m = MG.m[MG.sel]; mgTurn(m, m.a + (e.shiftKey ? -1 : 1) * 15 * PI / 180, true); mgSync(); }
	});
	wireTools("em-mg-tools", function (t) { MG.tool = t; });
	function mgSet(k, v) { mgEdit().forEach(function (m) { m[k] = v; }); if (MG.sel < 0) MG.def[k] = v; MG.dirty = true; mgSync(); }
	$("em-mg-br").oninput = function () { mgSet("Br", +this.value); };
	$("em-mg-len").oninput = function () { mgSet("L", +this.value / 100); };
	$("em-mg-wid").oninput = function () { mgSet("W", +this.value / 100); };
	$("em-mg-ang").oninput = function () { var m = MG.m[MG.sel]; if (m) { mgTurn(m, +this.value * PI / 180, false); $("em-mg-ang-v").textContent = this.value; } };
	$("em-mg-rl").onclick = function () { var m = MG.m[MG.sel]; if (m) { mgTurn(m, m.a + 15 * PI / 180, true); mgSync(); } };
	$("em-mg-rr").onclick = function () { var m = MG.m[MG.sel]; if (m) { mgTurn(m, m.a - 15 * PI / 180, true); mgSync(); } };
	$("em-mg-flip").onclick = function () { var m = MG.m[MG.sel]; if (m) { mgTurn(m, m.a + PI, false); mgSync(); } };
	$("em-mg-del").onclick = mgDel; $("em-mg-clear").onclick = function () { MG.m = []; MG.sel = -1; MG.pre = -1; MG.dirty = true; mgSync(); }; $("em-mg-cclear").onclick = function () { MG.comps = []; };
	$("em-mg-reset").onclick = function () { mgLoad(MG_PRE[MG.pre >= 0 ? MG.pre : 0]); };
	$("em-mg-w").oninput = function () { MG.VW = 0.2 * Math.pow(10, +this.value); $("em-mg-w-v").textContent = sig(MG.VW * 100, 3) + " cm"; MG.dirty = true; };
	$("em-mg-nf").oninput = function () { MG.nf = +this.value; $("em-mg-nf-v").textContent = this.value; MG.dirty = true; sset({ mg_nf: MG.nf }); };
	$("em-mg-ni").oninput = function () { MG.ni = +this.value; $("em-mg-ni-v").textContent = this.value; MG.dirty = true; sset({ mg_ni: MG.ni }); };
	[["em-mg-flux", "flux"], ["em-mg-iso", "iso"], ["em-mg-arrows", "arrows"], ["em-mg-needles", "needles"], ["em-mg-labels", "labels"]].forEach(function (p) { $(p[0]).onchange = function () { MG[p[1]] = this.checked; MG.dirty = true; var o = {}; o["mg_" + p[1]] = this.checked; sset(o); }; });
	$("em-mg-col").onchange = function () { MG.col = this.value; MG.dirty = true; sset({ mg_col: MG.col }); };
	$("em-mg-sp").onchange = function () { MG.sp = +this.value; MG.dirty = true; sset({ mg_sp: MG.sp }); };
	wirePng("em-mg-png", gv, mgDraw); wireFull("em-mg-full", gv);
	$("em-mg-link").onclick = function () { copyLink({ g: MG.m.map(function (m) { return [+(m.x * 100).toFixed(2), +(m.y * 100).toFixed(2), deg(m.a), +(m.L * 100).toFixed(2), +(m.W * 100).toFixed(2), +m.Br.toFixed(2)].join(","); }).join(";"), gw: (MG.VW * 100).toFixed(2) }); };
	chips($("em-mg-pre"), MG_PRE, mgLoad);
	/* =================== CHARGED PARTICLE =================== */
	var SPEC = { proton: { n: "proton", q: M.QE, m: M.MP, c: "#ef4444" }, electron: { n: "electron", q: -M.QE, m: M.ME, c: "#60a5fa" }, alpha: { n: "alpha particle", q: 2 * M.QE, m: 4.001506179 * M.AMU * 1 - 2 * M.ME, c: "#fbbf24" }, muon: { n: "muon", q: -M.QE, m: 1.883531627e-28, c: "#a78bfa" }, c12: { n: "C-12 ion", q: M.QE, m: 12 * M.AMU - M.ME, c: "#34d399" }, c13: { n: "C-13 ion", q: M.QE, m: 13.00335484 * M.AMU - M.ME, c: "#fbbf24" }, c14: { n: "C-14 ion", q: M.QE, m: 14.003241989 * M.AMU - M.ME, c: "#f472b6" } };
	var PT = { sp: "proton", Bk: 0, E: 0, vk: 6, a: 0, spd: -0.3, rel: "auto", follow: false, fields: true, play: true, parts: [], t: 0, view: { VW: 0.1, cx: 0, cy: 0 }, extra: [], note: "", dtLast: 0 };
	var pv = mkView("pt", 1.6);
	function ptRel(v) { return PT.rel === "yes" ? true : PT.rel === "no" ? false : v > 0.1 * M.C; }
	function ptB() { return Math.pow(10, PT.Bk); }
	function ptE() { return PT.E * 1e6; }
	function ptLaunch(keepView) {
		var specs = [{ sp: PT.sp, v: Math.pow(10, PT.vk), a: PT.a }].concat(PT.extra);
		PT.parts = specs.map(function (s) { var sp = SPEC[s.sp], rel = ptRel(s.v), p = M.makeParticle(sp.q, sp.m, 0, 0, Math.min(s.v, 0.9999999 * M.C), s.a * PI / 180, rel); return { p: p, spec: sp, rel: rel, trail: [0, 0], color: s.color || sp.c, v0: s.v, p0x: p.ux / (rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy) / (M.C * M.C)) : 1), p0y: p.uy / (rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy) / (M.C * M.C)) : 1), vyPrev: p.uy, periods: [], lastCross: null, x0: 0 }; });
		PT.t = 0; if (keepView !== true) ptFit(); ptReadouts(true);
	}
	function ptRadius(part) { var v = part.v0, c = M.cyclotron(part.spec.q, part.spec.m, ptB(), v, part.rel); var r = c.radius; var E = Math.abs(ptE()), B = ptB(); if (E > 0) r = Math.max(r, 2 * part.spec.m * E / (Math.abs(part.spec.q) * B * B)); return { r: r, c: c }; }
	function ptFit() { var R = 0; PT.parts.forEach(function (pt) { R = Math.max(R, ptRadius(pt).r); }); PT.view.VW = Math.max(R * 5.2, 1e-9); PT.view.cx = PT.parts.length > 1 ? 0 : 0; PT.view.cy = 0; }
	var PT_PRE = [
		{ name: "Cyclotron (proton, 1 T)", sp: "proton", Bk: 0, E: 0, vk: 6, a: 0, note: "A proton at 1000 km/s in 1 tesla goes round a circle of radius 1.04 cm in 65.6 ns, no matter how fast it is: that constant time is what a cyclotron uses." },
		{ name: "Electron, weak field", sp: "electron", Bk: -3, E: 0, vk: 7, a: 90, note: "An electron at 10,000 km/s in 1 millitesla: a circle about 5.7 cm across. The electron turns the opposite way to a proton." },
		{ name: "E × B drift (cycloid)", sp: "proton", Bk: 0, E: 0.3, vk: 3, a: 0, follow: true, note: "A proton released at rest in crossed fields makes a cycloid and drifts at E/B = 300 km/s, to the right whatever the charge or mass (the E×B direction)." },
		{ name: "Velocity selector", sp: "proton", Bk: 0, E: 0.2, vk: 5.30103, a: 0, extra: [{ sp: "proton", v: 3e5, a: 0, color: "#fbbf24" }, { sp: "proton", v: 1.4e5, a: 0, color: "#a78bfa" }], note: "The proton moving at E/B = 200 km/s goes straight through (red). A faster one is bent by the magnetic force (yellow), a slower one by the electric force (purple)." },
		{ name: "Mass spectrometer", sp: "c12", Bk: -0.30103, E: 0, vk: 5, a: 90, extra: [{ sp: "c13", v: 1e5, a: 90 }, { sp: "c14", v: 1e5, a: 90 }], note: "Ions of carbon-12, -13 and -14 start together at the same speed in 0.5 T: heavier ones go round bigger circles (r = mv/qB). Measuring where they land tells their mass." },
		{ name: "Relativistic proton (0.9 c)", sp: "proton", Bk: 0, E: 0, vk: 8.4313, a: 0, rel: "yes", note: "At 0.9 c a proton's momentum is 2.3 times larger than Newton's formula says, so its circle is 2.3 times bigger (6.5 m instead of 2.8 m) and the lap takes 2.3 times longer." },
		{ name: "Muon", sp: "muon", Bk: -1, E: 0, vk: 7, a: 0, note: "A muon is 207 times heavier than an electron, so its circle in the same field is 207 times bigger." }
	];
	function ptApply(p) {
		PT.sp = p.sp; PT.Bk = p.Bk; PT.E = p.E; PT.vk = p.vk; PT.a = p.a; PT.extra = p.extra || []; PT.rel = p.rel || "auto"; PT.follow = !!p.follow; $("em-pt-note").textContent = p.note || ""; ptSync(); ptLaunch();
	}
	function ptSync() { $("em-pt-sp-sel").value = PT.sp; $("em-pt-B").value = PT.Bk; $("em-pt-B-v").textContent = si(ptB(), "T", 3); $("em-pt-E").value = PT.E; $("em-pt-E-v").textContent = si(ptE(), "V/m", 3); $("em-pt-vs-in").value = PT.vk; $("em-pt-vv").textContent = si(Math.pow(10, PT.vk), "m/s", 3) + " (" + sig(Math.pow(10, PT.vk) / M.C, 3) + " c)"; $("em-pt-a").value = PT.a; $("em-pt-a-v").textContent = PT.a; $("em-pt-sp").value = PT.spd; $("em-pt-sp-v").textContent = sig(Math.pow(10, PT.spd), 2) + " turns per second"; $("em-pt-rel").value = PT.rel; $("em-pt-follow").checked = PT.follow; $("em-pt-fields").checked = PT.fields; }
	function ptStep(Treal) {
		if (!PT.parts.length) return; var B = ptB(), E = ptE(), Tm = Infinity; PT.parts.forEach(function (pt) { var c = M.cyclotron(pt.spec.q, pt.spec.m, B, Math.max(M.speedOf(pt.p, pt.rel), 1), pt.rel); Tm = Math.min(Tm, c.period); });
		var T0 = M.cyclotron(PT.parts[0].spec.q, PT.parts[0].spec.m, B, Math.max(M.speedOf(PT.parts[0].p, PT.parts[0].rel), 1), PT.parts[0].rel).period, simT = Treal * Math.pow(10, PT.spd) * T0, dt = Tm / 160, n = Math.min(3000, Math.max(1, Math.ceil(simT / dt))); dt = simT / n;
		for (var i = 0; i < n; i++) PT.parts.forEach(function (pt) { M.borisStep(pt.p, [0, E, 0], [0, 0, B], dt, pt.rel); }); PT.t += simT; PT.dtLast = dt;
		PT.parts.forEach(function (pt) { pt.trail.push(pt.p.x, pt.p.y); if (pt.trail.length > 12000) pt.trail.splice(0, 2); var vy = pt.p.uy; if (pt.vyPrev > 0 && vy <= 0) { if (pt.lastCross !== null) { pt.periods.push(PT.t - pt.lastCross); if (pt.periods.length > 6) pt.periods.shift(); } pt.lastCross = PT.t; } pt.vyPrev = vy; });
	}
	function ptCam() { var c = PT.view; if (PT.follow && PT.parts[0]) { c.cx = PT.parts[0].p.x; c.cy = PT.parts[0].p.y; } return c; }
	function ptT(x, y) { var c = ptCam(), S = pv.fit() / c.VW; return [pv.W / 2 + (x - c.cx) * S, pv.H / 2 - (y - c.cy) * S]; }
	function ptDraw() {
		if (tab !== "pt") return; pv.begin(); var cx = pv.cx, W = pv.W, H = pv.H, c = ptCam(), S = Math.min(W, H * pv.aspect) / c.VW; cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		if (PT.fields) {
			var gp = Math.max(28, Math.round(Math.min(W, H) / 10)), i, j; cx.fillStyle = "rgba(125,175,255,0.35)"; cx.strokeStyle = "rgba(125,175,255,0.35)"; cx.lineWidth = 1.2;
			var ox = (W / 2 - c.cx * S) % gp, oy = (H / 2 + c.cy * S) % gp; for (j = oy - gp; j < H + gp; j += gp) for (i = ox - gp; i < W + gp; i += gp) { cx.beginPath(); cx.arc(i, j, 2.2, 0, 7); cx.fill(); cx.beginPath(); cx.arc(i, j, 6, 0, 7); cx.stroke(); }
			if (ptE() !== 0) { var s = Math.sign(ptE()), ga = gp * 2, oxa = (W / 2 - c.cx * S) % ga; cx.strokeStyle = "rgba(255,160,120,0.35)"; for (i = oxa - ga / 2 - ga; i < W + ga; i += ga) { arrow(cx, i, H / 2 + s * 40, i, H / 2 - s * 40, "rgba(255,160,120,0.4)", 1.5, 8); } }
		}
		PT.parts.forEach(function (pt) { var t = pt.trail; if (t.length > 3) { var n = t.length / 2, step = 120, ch = Math.ceil((n - 1) / step); cx.lineWidth = 1.8; cx.strokeStyle = pt.color; for (var k = 0; k < ch; k++) { var f = k * step, to = Math.min(n - 1, (k + 1) * step); if (f >= to) continue; cx.globalAlpha = Math.max(0.25, 1 - (ch - 1 - k) * 0.09); cx.beginPath(); for (var j = f; j <= to; j++) { var p = ptT(t[2 * j], t[2 * j + 1]); if (j === f) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]); } cx.stroke(); } cx.globalAlpha = 1; } var q = ptT(pt.p.x, pt.p.y); cx.fillStyle = pt.color; cx.beginPath(); cx.arc(q[0], q[1], 6, 0, 7); cx.fill(); cx.strokeStyle = "#fff"; cx.lineWidth = 1.3; cx.stroke(); var v = ptVel(pt), Lv = 38; var vm = Math.hypot(v[0], v[1]); if (vm > 0) arrow(cx, q[0], q[1], q[0] + v[0] / vm * Lv, q[1] - v[1] / vm * Lv, "#fff", 1.8, 7); });
		var sb = Math.pow(10, Math.floor(Math.log10(c.VW / 3))), sp = sb * S; cx.strokeStyle = "rgba(255,255,255,0.8)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 14); cx.lineTo(12 + sp, H - 14); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.85)"; cx.font = "12px sans-serif"; cx.fillText(si(sb, "m", 2), 12, H - 20);
		$("em-pt-badge").textContent = "B out of the screen (dots)" + (ptE() ? " · E " + (ptE() > 0 ? "up" : "down") : "") + (PT.tool === "aim" ? " · drag from the start point to aim" : " · drag to move, scroll to zoom");
	}
	function ptVel(pt) { var g = pt.rel ? Math.sqrt(1 + (pt.p.ux * pt.p.ux + pt.p.uy * pt.p.uy) / (M.C * M.C)) : 1; return [pt.p.ux / g, pt.p.uy / g]; }
	function ptReadouts(force) {
		var pt = PT.parts[0]; if (!pt) return; var B = ptB(), E = ptE(), v = Math.hypot.apply(null, ptVel(pt)), c = M.cyclotron(pt.spec.q, pt.spec.m, B, pt.v0, pt.rel), rr = ptRadius(pt);
		var vperp0 = pt.v0; var rad = c.radius, rlab = "r = " + (pt.rel ? "γ" : "") + "mv/(qB)"; if (E !== 0 && !pt.rel) { var vd0 = E / B, vx0 = pt.p0x, vy0 = pt.p0y; rad = pt.spec.m * Math.hypot(vx0 - vd0, vy0) / (Math.abs(pt.spec.q) * B); rlab = "r = m|v − E/B|/(qB), the circle in the drifting frame"; } $("em-pt-r").textContent = rad < 1e-9 * Math.max(1, c.radius) ? "straight line" : si(rad, "m", 3); $("em-pt-rs").textContent = rlab + (pt.rel ? ", γ = " + c.gamma.toFixed(3) : "") + " · " + pt.spec.n;
		$("em-pt-T").textContent = si(c.period, "s", 4); var meas = pt.periods.length ? pt.periods[pt.periods.length - 1] : null; $("em-pt-Ts").textContent = "frequency " + si(c.freq, "Hz", 3) + (meas ? " · measured " + si(meas, "s", 4) : "");
		var Ek = (pt.rel ? (c.gamma - 1) * pt.spec.m * M.C * M.C : 0.5 * pt.spec.m * pt.v0 * pt.v0); var Ev = Math.hypot.apply(null, ptVel(pt)); var Ekn = pt.rel ? (1 / Math.sqrt(1 - Math.pow(Ev / M.C, 2)) - 1) * pt.spec.m * M.C * M.C : 0.5 * pt.spec.m * Ev * Ev;
		$("em-pt-v").textContent = si(Ev, "m/s", 3); $("em-pt-vs").textContent = sig(Ev / M.C, 3) + " c · energy " + si(Ekn / M.QE, "eV", 3);
		if (E !== 0) { var vd = E / B; $("em-pt-d").textContent = si(vd, "m/s", 3); $("em-pt-ds").textContent = "E/B = " + sig(vd / M.C, 3) + " c" + (Math.abs(vd) >= M.C ? " (more than c: the particle cannot drift that fast)" : ""); } else { $("em-pt-d").textContent = "none"; $("em-pt-ds").textContent = "no electric field"; }
	}
	/* mouse: move the view (drag), zoom (wheel / pinch), or aim the launch (drag from the start point: the direction is the angle and the length is the speed) */
	PT.tool = "pan";
	function ptWorld(px, py) { var c = ptCam(), S = pv.fit() / c.VW; return [c.cx + (px - pv.W / 2) / S, c.cy - (py - pv.H / 2) / S]; }
	var ptPts = {}, ptPan = null, ptPinch = null;
	function ptAim(p) {
		var o = ptT(0, 0), dx = p[0] - o[0], dy = o[1] - p[1], L = Math.hypot(dx, dy); if (L < 6) return;
		var lo = +$("em-pt-vs-in").min, hi = +$("em-pt-vs-in").max, f = Math.max(0, Math.min(1, L / (0.45 * Math.min(pv.W, pv.H))));
		PT.a = Math.round(Math.atan2(dy, dx) * 180 / PI); PT.vk = Math.round((lo + f * (hi - lo)) * 50) / 50; ptSync(); ptLaunch(true); PT.aimTo = p;
	}
	pv.cv.addEventListener("pointerdown", function (e) {
		pv.cv.setPointerCapture(e.pointerId); var p = pv.pos(e); ptPts[e.pointerId] = p; var ids = Object.keys(ptPts);
		if (ids.length === 2) { var a = ptPts[ids[0]], b = ptPts[ids[1]]; ptPinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vw: PT.view.VW }; ptPan = null; return; }
		if (PT.tool === "aim") { PT.follow = false; $("em-pt-follow").checked = false; ptAim(p); ptPan = { aim: true }; }
		else { PT.follow = false; $("em-pt-follow").checked = false; ptPan = { x: p[0], y: p[1], cx: PT.view.cx, cy: PT.view.cy }; }
		e.preventDefault();
	});
	pv.cv.addEventListener("pointermove", function (e) {
		var p = pv.pos(e); if (ptPts[e.pointerId]) ptPts[e.pointerId] = p;
		if (ptPinch && Object.keys(ptPts).length === 2) { var ids = Object.keys(ptPts), a = ptPts[ids[0]], b = ptPts[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); PT.view.VW = Math.max(1e-12, ptPinch.vw * ptPinch.d / Math.max(1, d)); return; }
		if (!ptPan) return;
		if (ptPan.aim) { ptAim(p); return; }
		var S = pv.fit() / PT.view.VW; PT.view.cx = ptPan.cx - (p[0] - ptPan.x) / S; PT.view.cy = ptPan.cy + (p[1] - ptPan.y) / S;
	});
	function ptEnd(e) { delete ptPts[e.pointerId]; if (Object.keys(ptPts).length < 2) ptPinch = null; if (!Object.keys(ptPts).length) ptPan = null; }
	pv.cv.addEventListener("pointerup", ptEnd); pv.cv.addEventListener("pointercancel", ptEnd);
	pv.cv.addEventListener("wheel", function (e) {
		e.preventDefault(); var p = pv.pos(e), f = Math.exp(e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.0015), before = PT.follow ? null : ptWorld(p[0], p[1]);
		PT.view.VW = Math.max(1e-12, Math.min(1e6, PT.view.VW * f)); if (before) { var after = ptWorld(p[0], p[1]); PT.view.cx += before[0] - after[0]; PT.view.cy += before[1] - after[1]; }
	}, { passive: false });
	wireTools("em-pt-tools", function (t) { PT.tool = t; pv.cv.style.cursor = t === "aim" ? "crosshair" : "grab"; }); pv.cv.style.cursor = "grab";
	var ptSel = { proton: 1 };
	$("em-pt-sp-sel").onchange = function () { PT.sp = this.value; PT.extra = []; ptLaunch(); };
	$("em-pt-B").oninput = function () { PT.Bk = +this.value; $("em-pt-B-v").textContent = si(ptB(), "T", 3); ptLaunch(); sset({ pt_B: PT.Bk }); };
	$("em-pt-E").oninput = function () { PT.E = +this.value; $("em-pt-E-v").textContent = si(ptE(), "V/m", 3); ptLaunch(); };
	$("em-pt-vs-in").oninput = function () { PT.vk = +this.value; $("em-pt-vv").textContent = si(Math.pow(10, PT.vk), "m/s", 3) + " (" + sig(Math.pow(10, PT.vk) / M.C, 3) + " c)"; ptLaunch(); };
	$("em-pt-a").oninput = function () { PT.a = +this.value; $("em-pt-a-v").textContent = this.value; ptLaunch(); };
	$("em-pt-sp").oninput = function () { PT.spd = +this.value; $("em-pt-sp-v").textContent = sig(Math.pow(10, PT.spd), 2) + " turns per second"; sset({ pt_spd: PT.spd }); };
	$("em-pt-rel").onchange = function () { PT.rel = this.value; ptLaunch(); };
	$("em-pt-follow").onchange = function () { PT.follow = this.checked; if (!PT.follow) ptFit(); };
	$("em-pt-fit").onclick = function () { PT.follow = false; $("em-pt-follow").checked = false; ptFit(); };
	$("em-pt-fields").onchange = function () { PT.fields = this.checked; };
	$("em-pt-play").onclick = function () { PT.play = !PT.play; this.setAttribute("aria-pressed", String(PT.play)); this.textContent = PT.play ? "❚❚ Pause" : "▶ Play"; };
	$("em-pt-reset").onclick = function () { ptLaunch(); }; wirePng("em-pt-png", pv, ptDraw); wireFull("em-pt-full", pv);
	$("em-pt-link").onclick = function () { copyLink({ sp: PT.sp, B: PT.Bk, E: PT.E, v: PT.vk, a: PT.a, rel: PT.rel }); };
	chips($("em-pt-pre"), PT_PRE, ptApply);

	/* =================== WAVES (FDTD) =================== */
	var NX = 240, NY = 140, Y = new M.Yee(NX, NY), WV = { tool: "glass", n: 1.5, brush: 4, lam: 16, speed: 3, view: "ez", stype: "point", pulse: 0, arrows: false, mat: true, play: true, probe: null, hist: [], peak: 0.05, scale: 0.122, sx: new Float32Array(NX * NY), sy: new Float32Array(NX * NY), amp: 0.5, mouseDown: false, note: "" };
	var wvv = mkView("wv", NX / NY, 90), wvImg = document.createElement("canvas"), sc = $("em-wv-sc"), scx = sc.getContext("2d"), SP = Y.sponge;
	wvImg.width = NX; wvImg.height = NY; var wvC = wvImg.getContext("2d"), wvID = wvC.createImageData(NX, NY);
	function wvClearAll() { Y.epsr.fill(1); Y.sig.fill(0); Y.pec.fill(0); Y.sources = []; Y.reset(); WV.sx.fill(0); WV.sy.fill(0); WV.hist = []; WV.peak = 0.05; Y.build(); }
	function disc(cx0, cy0, r, fn) { for (var j = Math.max(1, Math.floor(cy0 - r)); j <= Math.min(NY - 2, Math.ceil(cy0 + r)); j++) for (var i = Math.max(1, Math.floor(cx0 - r)); i <= Math.min(NX - 2, Math.ceil(cx0 + r)); i++) if ((i - cx0) * (i - cx0) + (j - cy0) * (j - cy0) <= r * r) fn(j * NX + i, i, j); }
	function rect(x0, y0, x1, y1, fn) { for (var j = Math.max(0, y0); j <= Math.min(NY - 1, y1); j++) for (var i = Math.max(0, x0); i <= Math.min(NX - 1, x1); i++) fn(j * NX + i, i, j); }
	function glassFn(n) { return function (p) { Y.epsr[p] = n * n; }; } function metalFn(p) { Y.pec[p] = 1; }
	function addSrc(type, x, y) { var w = M.omegaFor(WV.lam); if (type === "line") Y.sources.push({ type: "line", x: x, y0: SP + 1, y1: NY - SP - 2, amp: WV.amp * 0.12, w: w, pulse: WV.pulse, t0: Y.t }); else Y.sources.push({ type: "point", x: x, y: y, amp: WV.amp, w: w, pulse: WV.pulse, t0: Y.t }); }
	var WV_PRE = [
		{ name: "Plane wave", note: "A plane wave travelling right through empty space: the colour bands are the crests (red) and troughs (blue) of the electric field. Add materials with the tools above.", set: function () { addSrc("line", 40, 0); } },
		{ name: "Mirror (metal wall)", note: "A plane wave hits a metal wall. The metal forces the field to zero, so the wave reflects with its sign flipped and the incoming and reflected waves make a standing pattern with fixed nodes half a wavelength apart.", set: function () { addSrc("line", 40, 0); rect(150, SP, 153, NY - SP - 1, metalFn); } },
		{ name: "Glass slab", note: "A wave enters glass: it slows down to c/n, so the wavelength shortens (look at the crests), and a little reflects at each surface.", set: function () { addSrc("line", 40, 0); rect(110, SP, 170, NY - SP - 1, glassFn(WV.n)); } },
		{ name: "Prism (refraction)", note: "A glass prism bends a wave that arrives at a slant on its surfaces (Snell's law, n₁ sin θ₁ = n₂ sin θ₂); the beam is deviated towards the thicker part.", set: function () { addSrc("line", 40, 0); for (var j = 20; j < 120; j++) { var half = (j - 20) * 0.5; rect(110, j, Math.round(110 + half), j, glassFn(WV.n)); } } },
		{ name: "Lens", note: "A disc of glass (n = 2) acts as a cylindrical lens and brings the plane wave to a bright focus just behind it.", set: function () { addSrc("line", 40, 0); disc(130, 70, 30, glassFn(2)); WV.view = "avg"; $("em-wv-view").value = "avg"; } },
		{ name: "Double slit", note: "Two slits in a metal wall: the waves from each slit overlap and add or cancel, producing bright and dark fans (switch Show to Average brightness to see the interference pattern clearly).", set: function () { addSrc("line", 40, 0); rect(100, SP, 103, 58, metalFn); rect(100, 66, 103, 74, metalFn); rect(100, 82, 103, NY - SP - 1, metalFn); WV.view = "avg"; $("em-wv-view").value = "avg"; } },
		{ name: "Single slit", note: "One narrow opening in a metal wall: the wave spreads out behind it (diffraction); the narrower the slit compared with the wavelength, the more it spreads.", set: function () { addSrc("line", 40, 0); rect(100, SP, 103, 62, metalFn); rect(100, 78, 103, NY - SP - 1, metalFn); } },
		{ name: "Waveguide", note: "A hollow metal channel carries the wave along it with almost no loss: the waves reflect between the walls (a rectangular waveguide, like those that carry microwaves in a radar).", set: function () { addSrc("point", 50, 70); rect(40, 55, 205, 57, metalFn); rect(40, 83, 205, 85, metalFn); rect(40, 55, 42, 85, metalFn); } },
		{ name: "Antenna (dipole)", note: "A small antenna radiating: circular waves spread out in all directions with the field falling as 1/√r (in 2D).", set: function () { addSrc("point", 120, 70); WV.view = "ez"; } },
		{ name: "Resonant cavity", note: "A box with perfectly conducting walls. A pulse bounces around and settles into standing patterns (modes) that ring at certain frequencies only: how a microwave oven or a laser cavity works.", set: function () { rect(70, 30, 170, 32, metalFn); rect(70, 108, 170, 110, metalFn); rect(70, 30, 72, 110, metalFn); rect(168, 30, 170, 110, metalFn); WV.pulse0 = WV.pulse; Y.sources.push({ type: "point", x: 95, y: 55, amp: WV.amp, w: M.omegaFor(WV.lam), pulse: 3, t0: Y.t }); } },
		{ name: "Absorber", note: "A lossy block (like a radar-absorbing material or a brick wall for Wi-Fi): the wave is attenuated as it passes through, turning into heat.", set: function () { addSrc("line", 40, 0); rect(110, SP, 160, NY - SP - 1, function (p) { Y.sig[p] = 0.06; }); } }
	];
	function wvLoad(p) { wvClearAll(); WV.view = "ez"; $("em-wv-view").value = "ez"; p.set(); Y.build(); WV.note = p.note; $("em-wv-note").textContent = p.note; }
	function wvDraw() {
		if (tab !== "wv") return; wvv.begin(); var cx = wvv.cx, W = wvv.W, H = wvv.H, id = wvID.data, ez = Y.ez, avg = Y.avg, i, mx = 0, n = NX * NY;
		if (WV.view === "ez") { for (i = 0; i < n; i++) { var a = Math.abs(ez[i]); if (a > mx) mx = a; } WV.peak = Math.max(mx, WV.peak * 0.995, 1e-3); }
		var scl = 1 / (WV.peak * 0.9);
		var aMax = 0; if (WV.view === "avg") { for (i = 0; i < n; i++) if (avg[i] > aMax) aMax = avg[i]; WV.aPeak = Math.max(aMax, (WV.aPeak || 0) * 0.995, 1e-6); } var as = 1 / (WV.aPeak || 1);
		for (i = 0; i < n; i++) {
			var o = 4 * i, r, g, b;
			if (WV.view === "ez") { var v = Math.max(-1, Math.min(1, ez[i] * scl)); if (v >= 0) { r = 18 + 237 * v; g = 20 + 70 * v; b = 28 + 40 * v; } else { r = 18 + 40 * -v; g = 20 + 120 * -v; b = 28 + 227 * -v; } }
			else { var u = Math.min(1, Math.sqrt(avg[i] * as)); r = 255 * Math.min(1, u * 1.6); g = 200 * Math.pow(u, 1.7); b = 60 * Math.pow(u, 3) + 25 * (1 - u); }
			if (Y.pec[i]) { r = 190; g = 195; b = 205; } else if (WV.mat && Y.epsr[i] > 1.001) { r = r * 0.78 + 255 * 0.22 * 0.6; g = g * 0.78 + 255 * 0.22 * 0.8; b = b * 0.78 + 255 * 0.22; } else if (WV.mat && Y.sig[i] > 0) { r = r * 0.7 + 90; g = g * 0.7 + 60; b = b * 0.7 + 30; }
			id[o] = r; id[o + 1] = g; id[o + 2] = b; id[o + 3] = 255;
		}
		wvC.putImageData(wvID, 0, 0); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; cx.drawImage(wvImg, 0, 0, W, H);
		var gx = W / NX, gy = H / NY;
		if (WV.arrows) { var st = 10, k, l; for (l = SP + 4; l < NY - SP - 2; l += st) for (k = SP + 4; k < NX - SP - 2; k += st) { var p = l * NX + k, sx = WV.sx[p], sy = WV.sy[p], m = Math.hypot(sx, sy), ref = (WV.pk || 1e-6); if (m < ref * 0.08) continue; var L = Math.min(1, m / ref) * st * 0.9 * gx; arrow(cx, (k + 0.5) * gx - sx / m * L * 0.5, (l + 0.5) * gy + sy / m * L * 0.5, (k + 0.5) * gx + sx / m * L * 0.5, (l + 0.5) * gy - sy / m * L * 0.5, "rgba(255,255,255,0.8)", 1.2, 4.5); } }
		Y.sources.forEach(function (s) { cx.strokeStyle = "#fde047"; cx.fillStyle = "#fde047"; cx.lineWidth = 2; if (s.type === "line") { cx.beginPath(); cx.moveTo((s.x + 0.5) * gx, (s.y0 + 0.5) * gy); cx.lineTo((s.x + 0.5) * gx, (s.y1 + 0.5) * gy); cx.stroke(); } else { cx.beginPath(); cx.arc((s.x + 0.5) * gx, (s.y + 0.5) * gy, 5, 0, 7); cx.fill(); } });
		if (WV.probe) { var px = (WV.probe[0] + 0.5) * gx, py = (WV.probe[1] + 0.5) * gy; cx.strokeStyle = "#86efac"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(px - 8, py); cx.lineTo(px + 8, py); cx.moveTo(px, py - 8); cx.lineTo(px, py + 8); cx.stroke(); cx.beginPath(); cx.arc(px, py, 5, 0, 7); cx.stroke(); }
		var wl = WV.lam * gx; cx.strokeStyle = "rgba(255,255,255,0.85)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 16); cx.lineTo(12 + wl, H - 16); cx.moveTo(12, H - 20); cx.lineTo(12, H - 12); cx.moveTo(12 + wl, H - 20); cx.lineTo(12 + wl, H - 12); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.9)"; cx.font = "12px sans-serif"; cx.fillText("1 wavelength", 12, H - 22);
		$("em-wv-badge").textContent = { glass: "Drag to paint glass", metal: "Drag to paint metal (perfect conductor)", absorb: "Drag to paint a lossy absorber", erase: "Drag to erase materials", src: "Click to place a source (" + (WV.stype === "line" ? "plane wave line" : "point") + ")", probe: "Click to put the probe there" }[WV.tool];
		drawScope();
	}
	function drawScope() {
		var w = sc.clientWidth || 600, h = 90, dpr = Math.min(2, window.devicePixelRatio || 1); if (sc.width !== Math.round(w * dpr) || sc.height !== Math.round(h * dpr)) { sc.width = Math.round(w * dpr); sc.height = Math.round(h * dpr); } scx.setTransform(dpr, 0, 0, dpr, 0, 0); scx.fillStyle = "#080b12"; scx.fillRect(0, 0, w, h); scx.font = "11px sans-serif"; scx.fillStyle = "rgba(160,170,190,0.9)";
		if (!WV.probe) { scx.fillText("Probe: choose the ⌖ tool and click the picture to see the electric field at that point over time.", 8, 18); return; }
		scx.strokeStyle = "rgba(255,255,255,0.12)"; scx.beginPath(); scx.moveTo(0, h / 2); scx.lineTo(w, h / 2); scx.stroke(); var H = WV.hist, n = H.length; if (n < 2) return; var mx = 1e-6; H.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); }); scx.strokeStyle = "#86efac"; scx.lineWidth = 1.5; scx.beginPath(); for (var i = 0; i < n; i++) { var x = i / 600 * w, y = h / 2 - H[i] / mx * (h / 2 - 8); if (i === 0) scx.moveTo(x, y); else scx.lineTo(x, y); } scx.stroke(); scx.fillText("field at the probe, last " + n + " samples (peak " + sig(mx, 3) + ")", 8, 14);
	}
	function wvPaint(e) {
		var p = wvv.pos(e), gx = p[0] / wvv.W * NX, gy = p[1] / wvv.H * NY, r = WV.brush; if (gx < SP + 1 || gx > NX - SP - 2 || gy < SP + 1 || gy > NY - SP - 2) { if (WV.tool !== "src" && WV.tool !== "probe") return; }
		if (WV.tool === "glass") disc(gx, gy, r, function (i2, x, y) { if (x > SP && x < NX - SP - 1 && y > SP && y < NY - SP - 1) { Y.epsr[i2] = WV.n * WV.n; Y.pec[i2] = 0; Y.sig[i2] = 0; } });
		else if (WV.tool === "metal") disc(gx, gy, r, function (i2, x, y) { if (x > SP && x < NX - SP - 1 && y > SP && y < NY - SP - 1) { Y.pec[i2] = 1; Y.epsr[i2] = 1; Y.sig[i2] = 0; } });
		else if (WV.tool === "absorb") disc(gx, gy, r, function (i2, x, y) { if (x > SP && x < NX - SP - 1 && y > SP && y < NY - SP - 1) { Y.sig[i2] = 0.06; Y.pec[i2] = 0; Y.epsr[i2] = 1; } });
		else if (WV.tool === "erase") disc(gx, gy, r, function (i2) { Y.epsr[i2] = 1; Y.pec[i2] = 0; Y.sig[i2] = 0; });
		Y.build();
	}
	wvv.cv.addEventListener("pointerdown", function (e) {
		wvv.cv.setPointerCapture(e.pointerId); var p = wvv.pos(e), gx = Math.round(p[0] / wvv.W * NX - 0.5), gy = Math.round(p[1] / wvv.H * NY - 0.5);
		if (WV.tool === "src") { if (Y.sources.length >= 8) { toast("Plenty of sources (8): use “Remove the sources”"); return; } gx = Math.max(SP + 2, Math.min(NX - SP - 3, gx)); gy = Math.max(SP + 2, Math.min(NY - SP - 3, gy)); addSrc(WV.stype, gx, gy); }
		else if (WV.tool === "probe") { WV.probe = [Math.max(1, Math.min(NX - 2, gx)), Math.max(1, Math.min(NY - 2, gy))]; WV.hist = []; }
		else { WV.mouseDown = true; wvPaint(e); }
	});
	wvv.cv.addEventListener("pointermove", function (e) { if (WV.mouseDown) wvPaint(e); }); function wvUp() { WV.mouseDown = false; } wvv.cv.addEventListener("pointerup", wvUp); wvv.cv.addEventListener("pointercancel", wvUp);
	wireTools("em-wv-tools", function (t) { WV.tool = t; });
	function setLam(l) { WV.lam = l; $("em-wv-l").value = l; $("em-wv-l-v").textContent = l; var w = M.omegaFor(l); Y.sources.forEach(function (s) { s.w = w; }); }
	$("em-wv-l").oninput = function () { setLam(+this.value); sset({ wv_lam: WV.lam }); };
	$("em-wv-e").oninput = function () { WV.n = +this.value; $("em-wv-e-v").textContent = WV.n.toFixed(2); };
	$("em-wv-b").oninput = function () { WV.brush = +this.value; $("em-wv-b-v").textContent = this.value; };
	$("em-wv-s").oninput = function () { WV.speed = +this.value; $("em-wv-s-v").textContent = this.value; };
	$("em-wv-view").onchange = function () { WV.view = this.value; }; $("em-wv-stype").onchange = function () { WV.stype = this.value; }; $("em-wv-pulse").onchange = function () { WV.pulse = +this.value; };
	$("em-wv-scale").onchange = function () { WV.scale = +this.value; };
	$("em-wv-arrows").onchange = function () { WV.arrows = this.checked; }; $("em-wv-mat").onchange = function () { WV.mat = this.checked; };
	$("em-wv-clearm").onclick = function () { Y.epsr.fill(1); Y.sig.fill(0); Y.pec.fill(0); Y.build(); }; $("em-wv-clears").onclick = function () { Y.sources = []; };
	$("em-wv-play").onclick = function () { WV.play = !WV.play; this.setAttribute("aria-pressed", String(WV.play)); this.textContent = WV.play ? "❚❚ Pause" : "▶ Play"; };
	$("em-wv-reset").onclick = function () { Y.reset(); WV.sx.fill(0); WV.sy.fill(0); WV.hist = []; WV.peak = 0.05; WV.aPeak = 0; var s = Y.sources; s.forEach(function (x) { x.t0 = 0; }); };
	wirePng("em-wv-png", wvv, wvDraw); wireFull("em-wv-full", wvv);
	chips($("em-wv-pre"), WV_PRE, wvLoad);
	function wvStep() {
		if (!WV.play) return; var k, i, n = NX * NY, t0 = performance.now();
		for (k = 0; k < WV.speed; k++) { Y.stepOnce(); if (WV.probe && Y.step % 2 === 0) { WV.hist.push(Y.ez[WV.probe[1] * NX + WV.probe[0]]); if (WV.hist.length > 600) WV.hist.shift(); } if (performance.now() - t0 > 12) break; }
		if (WV.arrows) { var a = 0.04, ez = Y.ez, hx = Y.hx, hy = Y.hy, mxs = 0; for (i = 0; i < n; i++) { WV.sx[i] += a * (-ez[i] * hy[i] - WV.sx[i]); WV.sy[i] += a * (ez[i] * hx[i] - WV.sy[i]); } for (i = 0; i < n; i += 7) { var m = Math.hypot(WV.sx[i], WV.sy[i]); if (m > mxs) mxs = m; } WV.pk = Math.max(mxs, (WV.pk || 0) * 0.995); }
	}
	function wvReadouts() {
		var T = WV.lam; $("em-wv-t").textContent = sig(Y.t / T, 3) + " periods"; $("em-wv-ts").textContent = "t = " + sig(Y.t, 3) + " cell-times"; var lam = WV.scale, f = M.C / lam; $("em-wv-f").textContent = si(f, "Hz", 3); $("em-wv-fs").textContent = "λ = " + si(lam, "m", 3) + " (" + WV.lam + " cells)";
		var amax = 0, i; for (i = 0; i < NX * NY; i += 3) { var a = Math.abs(Y.ez[i]); if (a > amax) amax = a; } var ref = Y.sources.length ? Math.max.apply(null, Y.sources.map(function (s) { return s.amp; })) : 1; $("em-wv-m").textContent = sig(amax / ref, 3) + "×";
		if (WV.probe) { var H = WV.hist, mx = 0; H.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); }); var cr = [], j; for (j = 1; j < H.length; j++) if (H[j - 1] < 0 && H[j] >= 0) cr.push(j); var per = cr.length > 2 ? (cr[cr.length - 1] - cr[0]) / (cr.length - 1) * 2 * Y.S : null; $("em-wv-pr").textContent = sig(Y.ez[WV.probe[1] * NX + WV.probe[0]], 3); $("em-wv-prs").textContent = "peak " + sig(mx, 3) + (per ? " · period " + sig(per, 3) + " (source " + WV.lam + ")" : ""); } else { $("em-wv-pr").textContent = "–"; $("em-wv-prs").textContent = "⌖ tool, then click"; }
	}

	/* =================== PLANE WAVE =================== */
	var PW = { lk: -0.263, ek: 1, a: 0, pol: "lin", bOn: true, eOn: true, tip: false, yaw: -0.5, pitch: 0.35, phase: 0, play: true, drag: null };
	var pwv = mkView("pw", 1.7), BANDS = [[1e-11, "gamma ray"], [1e-8, "X-ray"], [4e-7, "ultraviolet"], [7.5e-7, "visible light"], [1e-3, "infrared"], [0.3, "microwave"], [1e3, "radio"], [1e9, "radio (very long)"]];
	function bandOf(l) { for (var i = 0; i < BANDS.length; i++) if (l < BANDS[i][0]) return BANDS[i][1]; return "radio (very long)"; }
	function visCol(l) { var nm = l * 1e9, r, g, b; if (nm < 380 || nm > 750) return null; if (nm < 440) { r = (440 - nm) / 60; g = 0; b = 1; } else if (nm < 490) { r = 0; g = (nm - 440) / 50; b = 1; } else if (nm < 510) { r = 0; g = 1; b = (510 - nm) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; b = 0; } else if (nm < 645) { r = 1; g = (645 - nm) / 65; b = 0; } else { r = 1; g = 0; b = 0; } return "rgb(" + Math.round(255 * r) + "," + Math.round(255 * g) + "," + Math.round(255 * b) + ")"; }
	var PW_PRE = [{ n: "FM radio (3 m)", l: 3 }, { n: "Wi-Fi (12.2 cm)", l: 0.122 }, { n: "Microwave oven", l: 0.1224 }, { n: "Infrared (10 μm)", l: 1e-5 }, { n: "Red light", l: 7e-7 }, { n: "Green light", l: 5.5e-7 }, { n: "Violet light", l: 4e-7 }, { n: "Ultraviolet", l: 1e-7 }, { n: "X-ray (0.1 nm)", l: 1e-10 }];
	function pwLam() { return Math.pow(10, PW.lk); }
	function pwE0() { return Math.pow(10, PW.ek); }
	function pwSync() { $("em-pw-l").value = PW.lk; $("em-pw-l-v").textContent = si(pwLam(), "m", 3); $("em-pw-e").value = PW.ek; $("em-pw-e-v").textContent = si(pwE0(), "V/m", 3); $("em-pw-a").value = PW.a; $("em-pw-a-v").textContent = PW.a; $("em-pw-pol").value = PW.pol; $("em-pw-b-on").checked = PW.bOn; $("em-pw-e-on").checked = PW.eOn; $("em-pw-tip").checked = PW.tip; }
	function pwField(x, ph) { /* unit E and B vectors (y, z) at position x along the wave (dimensionless 0..1 units of wavelength) */ var k = TAU * x - ph, c = Math.cos(k), s = Math.sin(k), a = PW.a * PI / 180, ey, ez;
		if (PW.pol === "lin") { ey = c * Math.cos(a); ez = c * Math.sin(a); } else if (PW.pol === "circR" || PW.pol === "circL") { var sg = PW.pol === "circR" ? 1 : -1; ey = c / Math.SQRT2 * 1.2; ez = sg * s / Math.SQRT2 * 1.2; } else { var A = 1, Bb = 0.5, u = A * c, v = Bb * s; ey = u * Math.cos(a) - v * Math.sin(a); ez = u * Math.sin(a) + v * Math.cos(a); }
		/* B along k x E: x_hat x (ey, ez) = (-ez, ey) in (y, z) */ return { ey: ey, ez: ez, by: -ez, bz: ey }; }
	function pwProj(x, y, z) { var cy = Math.cos(PW.yaw), sy = Math.sin(PW.yaw), cp = Math.cos(PW.pitch), sp = Math.sin(PW.pitch); var x1 = x * cy - z * sy, z1 = x * sy + z * cy; var y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp; return [x1, y1, z2]; }
	function pwDraw() {
		if (tab !== "pw") return; pwv.begin(); var cx = pwv.cx, W = pwv.W, H = pwv.H; cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		var Lx = 3.2, N = 96, sc = Math.min(W / (Lx * 1.25), H / 3.4) * 0.95, ox = W / 2, oy = H / 2; function P(x, y, z) { var p = pwProj(x - Lx / 2, y, z); return [ox + p[0] * sc, oy - p[1] * sc, p[2]]; }
		var lcol = visCol(pwLam()), ecol = "#ef4444", bcol = "#3b82f6"; if (lcol) { ecol = lcol; }
		/* axis */ var a0 = P(0, 0, 0), a1 = P(Lx, 0, 0); cx.strokeStyle = "rgba(255,255,255,0.35)"; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(a0[0], a0[1]); cx.lineTo(a1[0], a1[1]); cx.stroke(); arrow(cx, a1[0] - 0.1, a1[1], a1[0] + 18 * Math.cos(0), a1[1], "rgba(255,255,255,0.55)", 0.1, 9);
		var items = []; var k; for (k = 0; k <= N; k++) { var x = k / N * Lx, f = pwField(x, PW.phase), env = Math.min(1, Math.min(x, Lx - x) * 4); items.push({ x: x, f: f, env: env }); }
		/* wave planes: E at every sample (red) and B (blue) */
		var amp = 1.0; items.forEach(function (it) { var p0 = P(it.x, 0, 0); it.p0 = p0; it.e = P(it.x, it.f.ey * amp * it.env, it.f.ez * amp * it.env); it.b = P(it.x, it.f.by * amp * it.env, it.f.bz * amp * it.env); });
		function drawVec(it, tip, col, wd) { cx.strokeStyle = col; cx.globalAlpha = 0.35 + 0.65 * it.env; cx.lineWidth = wd; cx.beginPath(); cx.moveTo(it.p0[0], it.p0[1]); cx.lineTo(tip[0], tip[1]); cx.stroke(); cx.globalAlpha = 1; }
		var order = items.slice().sort(function (a, b) { return a.p0[2] - b.p0[2]; });
		var tipE = function (it) { return it.e; }, tipB = function (it) { return it.b; };
		/* filled ribbons give the wave its shape */
		function ribbon(key, col, fill) { cx.beginPath(); items.forEach(function (it, i) { var q = it[key]; if (i === 0) cx.moveTo(q[0], q[1]); else cx.lineTo(q[0], q[1]); }); cx.strokeStyle = col; cx.lineWidth = 2.2; cx.stroke(); if (fill) { cx.lineTo(items[N].p0[0], items[N].p0[1]); for (var i = N; i >= 0; i--) cx.lineTo(items[i].p0[0], items[i].p0[1]); cx.closePath(); cx.fillStyle = fill; cx.fill(); } }
		if (PW.eOn) { ribbon("e", ecol, "rgba(239,68,68,0.10)"); } if (PW.bOn) { ribbon("b", bcol, "rgba(59,130,246,0.10)"); }
		order.forEach(function (it, idx) { if (idx % 3 !== 0 && N > 60) return; if (PW.eOn) { drawVec(it, it.e, ecol, 1.4); } if (PW.bOn) { drawVec(it, it.b, bcol, 1.4); } });
		if (PW.tip && PW.pol !== "lin") { cx.strokeStyle = "rgba(255,255,255,0.4)"; cx.lineWidth = 1; cx.beginPath(); for (k = 0; k <= 40; k++) { var ph = k / 40 * TAU, f = pwField(0, -ph), p = P(0, f.ey, f.ez); if (k === 0) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]); } cx.stroke(); }
		/* labels */
		var ax = P(Lx * 0.5, 1.25, 0), bx = P(Lx * 0.5, 0, 1.25); cx.font = "bold 14px sans-serif"; if (PW.eOn) { cx.fillStyle = ecol; cx.fillText("E", ax[0] + 6, ax[1]); } if (PW.bOn) { cx.fillStyle = bcol; cx.fillText("B", bx[0] + 6, bx[1] + 14); } cx.fillStyle = "rgba(255,255,255,0.8)"; cx.fillText("direction of travel →", W - 160, H - 14);
		var lam = pwLam(), u0 = pwProj(0, 0, 0), u1 = pwProj(1, 0, 0), wl = Math.hypot(u1[0] - u0[0], u1[1] - u0[1]) * sc, bx0 = 16, by0 = H - 36; cx.strokeStyle = "rgba(255,255,255,0.7)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(bx0, by0); cx.lineTo(bx0 + wl, by0); cx.moveTo(bx0, by0 - 5); cx.lineTo(bx0, by0 + 5); cx.moveTo(bx0 + wl, by0 - 5); cx.lineTo(bx0 + wl, by0 + 5); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.9)"; cx.font = "12px sans-serif"; cx.fillText("one wavelength = " + si(lam, "m", 3), bx0, by0 + 18);
	}
	function pwReadouts() {
		var l = pwLam(), f = M.C / l, E0 = pwE0(), B0 = E0 / M.C, I = 0.5 * M.EPS0 * M.C * E0 * E0, h = 6.62607015e-34, Eph = h * f; $("em-pw-k").textContent = bandOf(l); $("em-pw-ks").textContent = "wavelength " + si(l, "m", 3);
		$("em-pw-f").textContent = si(f, "Hz", 3); $("em-pw-fs").textContent = "period " + si(1 / f, "s", 3); $("em-pw-b").textContent = si(B0, "T", 3); $("em-pw-i").textContent = si(I * (PW.pol === "lin" || PW.pol === "ell" ? 1 : 1.44), "W/m²", 3);
		$("em-pw-is").textContent = "photon " + (Eph / M.QE >= 0.001 ? si(Eph / M.QE, "eV", 3) : sig(Eph, 3) + " J") + (PW.pol === "circR" || PW.pol === "circL" ? " (circular: both components at full strength)" : "");
	}
	chips($("em-pw-pre"), PW_PRE.map(function (p) { return { name: p.n, l: p.l }; }), function (p) { PW.lk = Math.log10(p.l); pwSync(); });
	$("em-pw-l").oninput = function () { PW.lk = +this.value; $("em-pw-l-v").textContent = si(pwLam(), "m", 3); sset({ pw_lk: PW.lk }); };
	$("em-pw-e").oninput = function () { PW.ek = +this.value; $("em-pw-e-v").textContent = si(pwE0(), "V/m", 3); };
	$("em-pw-a").oninput = function () { PW.a = +this.value; $("em-pw-a-v").textContent = this.value; };
	$("em-pw-pol").onchange = function () { PW.pol = this.value; }; $("em-pw-b-on").onchange = function () { PW.bOn = this.checked; }; $("em-pw-e-on").onchange = function () { PW.eOn = this.checked; }; $("em-pw-tip").onchange = function () { PW.tip = this.checked; };
	$("em-pw-play").onclick = function () { PW.play = !PW.play; this.setAttribute("aria-pressed", String(PW.play)); this.textContent = PW.play ? "❚❚ Pause" : "▶ Play"; };
	wirePng("em-pw-png", pwv, pwDraw); wireFull("em-pw-full", pwv);
	pwv.cv.addEventListener("pointerdown", function (e) { pwv.cv.setPointerCapture(e.pointerId); PW.drag = { x: e.clientX, y: e.clientY, yaw: PW.yaw, pitch: PW.pitch }; });
	pwv.cv.addEventListener("pointermove", function (e) { if (!PW.drag) return; PW.yaw = PW.drag.yaw + (e.clientX - PW.drag.x) * 0.008; PW.pitch = Math.max(-1.4, Math.min(1.4, PW.drag.pitch + (e.clientY - PW.drag.y) * 0.008)); });
	function pwUp() { PW.drag = null; } pwv.cv.addEventListener("pointerup", pwUp); pwv.cv.addEventListener("pointercancel", pwUp);

	/* =================== loop and start =================== */
	var last = 0, tick = 0, views = { es: ev, ms: mv, mg: gv, pt: pv, wv: wvv, pw: pwv };
	function resizeAll() { var v = views[tab]; if (v) { v.resize(); if (tab === "es") ES.dirty = true; else if (tab === "ms") MS.dirty = true; else if (tab === "mg") MG.dirty = true; } }
	showers = { es: function () { resizeAll(); ES.dirty = true; }, ms: function () { resizeAll(); MS.dirty = true; }, mg: function () { resizeAll(); MG.dirty = true; }, pt: function () { resizeAll(); }, wv: function () { resizeAll(); }, pw: function () { resizeAll(); } };
	function frame(now) {
		requestAnimationFrame(frame); var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; if (document.hidden) return; tick++;
		if (tab === "es") { if (ES.play && ES.tests.length) esStepTests(dt); esDraw(); if (tick % 4 === 0) esReadouts(); }
		else if (tab === "ms") { msDraw(); if (tick % 4 === 0) msReadouts(); }
		else if (tab === "mg") { mgDraw(); if (tick % 4 === 0) mgReadouts(); }
		else if (tab === "pt") { if (PT.play) ptStep(dt); ptDraw(); if (tick % 6 === 0) ptReadouts(); }
		else if (tab === "wv") { wvStep(); wvDraw(); if (tick % 6 === 0) wvReadouts(); }
		else if (tab === "pw") { if (PW.play) PW.phase += dt * 1.6; pwDraw(); if (tick % 8 === 0) pwReadouts(); }
	}
	window.addEventListener("resize", resizeAll); var roq = 0; if (window.ResizeObserver) Object.keys(views).forEach(function (k) { new ResizeObserver(function () { if (k === tab && !roq) roq = requestAnimationFrame(function () { roq = 0; resizeAll(); }); }).observe(views[k].st.parentNode); }); document.addEventListener("fullscreenchange", function () { setTimeout(resizeAll, 60); });
	/* initial state */
	ES.qk = num(saved.qk, -1, 1.3, 0); ES.nLines = Math.round(num(saved.nLines, 4, 40, 14)); ["lines", "arrows", "eq", "gauss"].forEach(function (k) { if (typeof saved["es_" + k] === "boolean") ES[k] = saved["es_" + k]; }); if (/^(none|v|e)$/.test(saved.es_col || "")) ES.col = saved.es_col; if (/^(3d|2d)$/.test(saved.es_mode || "")) ES.mode = saved.es_mode;
	MS.ik = num(saved.ik, -1, 2, 1); PT.Bk = num(saved.pt_B, -4, 1, 0); PT.spd = num(saved.pt_spd, -1.5, 1, -0.3); WV.lam = Math.round(num(saved.wv_lam, 8, 40, 16)); PW.lk = num(saved.pw_lk, -10, 3, -0.263);
	var qc = q.get("c"); if (qc) { try { ES.ch = qc.split(";").slice(0, 40).map(function (s) { var a = s.split(",").map(Number); if (a.length !== 3 || a.some(function (v) { return !isFinite(v); })) throw 0; return { x: a[0], y: a[1], q: a[2] * 1e-6 }; }); ES.VW = num(q.get("w"), 0.01, 1e4, 4); if (/^(3d|2d)$/.test(q.get("m") || "")) ES.mode = q.get("m"); } catch (e) { ES.ch = []; } } else esLoad(ES_PRE[0]);
	var qw = q.get("w") && tab === "ms" ? q.get("w") : null; if (qw) { try { MS.w = qw.split(";").slice(0, 40).map(function (s) { var a = s.split(",").map(Number); if (a.length !== 3 || a.some(function (v) { return !isFinite(v); })) throw 0; return { x: a[0] / 100, y: a[1] / 100, I: a[2] }; }); MS.VW = num(q.get("vw"), 0.01, 1e5, 40) / 100; } catch (e) { MS.w = []; } } else msLoad(MS_PRE[1]);
	$("em-es-lines").checked = ES.lines; $("em-es-arrows").checked = ES.arrows; $("em-es-eq").checked = ES.eq; $("em-es-gauss").checked = ES.gauss; $("em-es-col").value = ES.col; $("em-es-mode").value = ES.mode;
	if (q.get("sp") && SPEC[q.get("sp")]) { PT.sp = q.get("sp"); PT.Bk = num(q.get("B"), -4, 1, 0); PT.E = num(q.get("E"), -1, 1, 0); PT.vk = num(q.get("v"), 3, 8.46, 6); PT.a = num(q.get("a"), -180, 180, 0); if (/^(auto|no|yes)$/.test(q.get("rel") || "")) PT.rel = q.get("rel"); } else { PT.vk = 6; PT.E = 0; }
	MG.nf = Math.round(num(saved.mg_nf, 4, 40, 16)); MG.ni = Math.round(num(saved.mg_ni, 4, 40, 14)); ["flux", "iso", "arrows", "needles", "labels"].forEach(function (k) { if (typeof saved["mg_" + k] === "boolean") MG[k] = saved["mg_" + k]; }); if (/^(none|b|psi)$/.test(saved.mg_col || "")) MG.col = saved.mg_col; if (saved.mg_sp === 1 || saved.mg_sp === 2) MG.sp = saved.mg_sp;
	var qg = q.get("g"); if (qg !== null && tab === "mg") { try { MG.m = qg ? qg.split(";").slice(0, 24).map(function (s) { var a = s.split(",").map(Number); if (a.length !== 6 || a.some(function (v) { return !isFinite(v); })) throw 0; return mgMag(a[0], a[1], a[2], Math.max(0.1, Math.min(50, a[3])), Math.max(0.1, Math.min(50, a[4])), Math.max(0.01, Math.min(2, a[5]))); }) : []; MG.VW = num(q.get("gw"), 1, 500, 20) / 100; MG.pre = -1; } catch (e) { mgLoad(MG_PRE[0]); } } else mgLoad(MG_PRE[0]);
	$("em-mg-flux").checked = MG.flux; $("em-mg-iso").checked = MG.iso; $("em-mg-arrows").checked = MG.arrows; $("em-mg-needles").checked = MG.needles; $("em-mg-labels").checked = MG.labels; $("em-mg-col").value = MG.col; $("em-mg-sp").value = String(MG.sp);
	syncEs(); syncMs(); mgSync(); ptSync(); ptLaunch(); $("em-pt-note").textContent = PT_PRE[0].note; $("em-wv-l").value = WV.lam; $("em-wv-l-v").textContent = WV.lam; $("em-wv-e").value = WV.n; $("em-wv-e-v").textContent = WV.n.toFixed(2); $("em-wv-b").value = WV.brush; $("em-wv-b-v").textContent = WV.brush; $("em-wv-s").value = WV.speed; $("em-wv-s-v").textContent = WV.speed; $("em-wv-scale").value = String(WV.scale);
	wvLoad(WV_PRE[0]); pwSync(); pwReadouts();
	setTab(tab, true); requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
	window.__em = { ES: ES, MS: MS, MG: MG, PT: PT, WV: WV, Y: Y, PW: PW, frame: function () { frame(performance.now()); } };
})();
