/* MES Maxwell's Vortices UI: a charge going round is a magnet (3D Biot-Savart), Maxwell's spinning cells and idle wheels, two magnets.
   Maths: MESVortex (node-tested: tool_apps_src/maxwell-vortices-tests.js). State: localStorage mes-maxwell-vortices:v1; links ?tab=loop|cells|pair&step=&scn=&pre= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("mv"); if (!root) return;
	var M = window.MESVortex, KEY = "mes-maxwell-vortices:v1", TAU = Math.PI * 2, DEG = Math.PI / 180;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function bool(v, d) { return v === undefined ? d : !!v; }
	function mi(s) { return String(s).replace(/-/g, "−"); }
	function sg(x, d) { if (!isFinite(x)) return "–"; var a = Math.abs(x); return sg0(x, d, a).replace(/^−(0(\.0+)?)$/, "$1"); }
	function sg0(x, d, a) { return mi(a >= 1000 ? Math.round(x).toLocaleString("en-US") : a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(d == null ? 1 : d) : x.toFixed(d == null ? 2 : d)); }
	var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
	function sci(x, d) { if (!isFinite(x)) return "–"; if (x === 0) return "0"; var e = Math.floor(Math.log10(Math.abs(x))); if (e >= -2 && e < 4) return sg(x, d == null ? 3 : d); var m = x / Math.pow(10, e); if (Math.abs(m) >= 9.995) { m /= 10; e++; } return mi(m.toFixed(d == null ? 2 : d)) + "×10" + String(e).replace(/./g, function (c) { return SUP[c]; }); }
	function tesla(B) { var a = Math.abs(B); return a >= 1 ? sg(B, 2) + " T" : a >= 1e-3 ? sg(B * 1e3, 2) + " mT" : a >= 1e-6 ? sg(B * 1e6, 2) + " µT" : sg(B * 1e9, 2) + " nT"; }
	var q = new URLSearchParams(location.search), saved = sget(), toastT;
	function toast(msg) { var t = $("mv-toast"); if (!t) { t = document.createElement("div"); t.id = "mv-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	function ro(box, items) { box.innerHTML = items.map(function (it) { return '<div class="mv-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function png(cv, name) { try { var a = document.createElement("a"); a.download = name + ".png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } }
	function fitStage(stage, natural) {
		var wrap = stage.parentNode, w = wrap.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
		wrap.setAttribute("data-mes-free", "1");
		var h = natural(w); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(200, Math.round(h)); stage.style.width = w + "px"; stage.style.height = h + "px";
		var cv = stage.querySelector("canvas"), cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
		return { W: w, H: h, c: c, cv: cv };
	}
	Array.prototype.forEach.call(root.querySelectorAll(".mv-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".mv-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});
	var COL = { bg: "#070b14", grid: "#1c2436", axis: "#5d6a86", text: "#d6dcea", dim: "#8792aa", wire: "#ff8c42", wireD: "#8a4a22", line: "#4cc9f0", dip: "#c4b5fd", probe: "#ffd166", north: "#ef4444", south: "#3b82f6", cur: "#ffd166", fit: "#7ee2a8" };
	function txt(c, s, x, y, o) { o = o || {}; c.font = (o.b ? "600 " : "") + (o.size || 12) + "px system-ui,sans-serif"; c.fillStyle = o.col || COL.text; c.textAlign = o.al || "left"; c.textBaseline = o.bl || "alphabetic"; c.fillText(s, x, y); }
	function arrow2(c, x0, y0, x1, y1, col, w, head) { var a = Math.atan2(y1 - y0, x1 - x0), h = head || 7; c.strokeStyle = c.fillStyle = col; c.lineWidth = w || 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - Math.cos(a) * h * 0.6, y1 - Math.sin(a) * h * 0.6); c.stroke(); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); c.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); c.closePath(); c.fill(); }
	/* ---------- a tiny 3D camera (z up) ---------- */
	function proj(cam, x, y, z) {
		var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), x1 = x * c - y * s, y1 = x * s + y * c, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		var up = z * cp + y1 * sp, d = y1 * cp - z * sp, f = cam.F / (cam.F + d);
		return { x: cam.cx + x1 * cam.k * f, y: cam.cy - up * cam.k * f, d: d, f: f };
	}
	/* drag to orbit (a tap without moving calls tap), wheel / pinch to zoom, arrow keys */
	function orbit(cv, cam, redraw, def, tap) {
		var ptrs = {}, drag = null, pinch = null;
		cv.addEventListener("pointerdown", function (e) { ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) {}
			var ids = Object.keys(ptrs); if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zoom }; drag = null; } else drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false }; });
		cv.addEventListener("pointermove", function (e) { if (!ptrs[e.pointerId]) return; ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
			if (pinch) { var ids = Object.keys(ptrs); if (ids.length < 2) return; var a = ptrs[ids[0]], b = ptrs[ids[1]]; cam.zoom = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, pinch.d), 0.4, 4); redraw(); return; }
			if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; if (!drag.moved) return;
			cam.yaw = drag.yaw + dx * 0.008; cam.pitch = clamp(drag.pitch + dy * 0.006, def.pmin == null ? -0.15 : def.pmin, 1.45); redraw(); });
		function end(e) { var was = drag; delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null; if (was && !was.moved && tap && e.type === "pointerup") { var r = cv.getBoundingClientRect(); tap(e.clientX - r.left, e.clientY - r.top, e); } drag = null; }
		cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
		cv.addEventListener("wheel", function (e) { if (!cam.wheel) return; e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.4, 4); redraw(); }, { passive: false });
		cv.addEventListener("keydown", function (e) { var k = e.key; if (!cam.wheel) return; if (k === "ArrowLeft") cam.yaw -= 0.08; else if (k === "ArrowRight") cam.yaw += 0.08; else if (k === "ArrowUp") cam.pitch = clamp(cam.pitch + 0.06, -0.15, 1.45); else if (k === "ArrowDown") cam.pitch = clamp(cam.pitch - 0.06, -0.15, 1.45); else if (k === "+" || k === "=") cam.zoom = clamp(cam.zoom * 1.15, 0.4, 4); else if (k === "-") cam.zoom = clamp(cam.zoom / 1.15, 0.4, 4); else return; e.preventDefault(); redraw(); });
		return function reset() { cam.yaw = def.yaw; cam.pitch = def.pitch; cam.zoom = 1; redraw(); };
	}
	/* ---------- plots ---------- */
	function pow10(v) { var e = Math.round(Math.log10(v)); return e === 0 ? "1" : e === 1 ? "10" : e === 2 ? "100" : "10" + String(e).replace(/./g, function (c) { return SUP[c]; }); }
	function niceStep(range, n) { var s = range / n, p = Math.pow(10, Math.floor(Math.log10(s))), f = s / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
	function frame(c, r, o) {
		var lx = !!o.logx, ly = !!o.logy, tx = function (v) { return lx ? Math.log10(v) : v; }, ty = function (v) { return ly ? Math.log10(Math.max(1e-300, v)) : v; };
		var X = function (t) { return r.x + (tx(t) - tx(o.x0)) / (tx(o.x1) - tx(o.x0)) * r.w; }, Y = function (v) { return r.y + r.h - (ty(v) - ty(o.y0)) / (ty(o.y1) - ty(o.y0)) * r.h; };
		c.save(); c.font = "11px system-ui,sans-serif"; c.lineWidth = 1; c.textAlign = "right"; c.textBaseline = "middle";
		var yt = []; if (ly) { for (var e = Math.ceil(Math.log10(o.y0)); e <= Math.floor(Math.log10(o.y1)); e++) yt.push(Math.pow(10, e)); } else { var ys = niceStep(o.y1 - o.y0, Math.max(2, Math.floor(r.h / 30))); for (var v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) yt.push(Math.abs(v) < ys * 1e-6 ? 0 : v); }
		yt.forEach(function (v) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r.x, Y(v) + 0.5); c.lineTo(r.x + r.w, Y(v) + 0.5); c.stroke(); c.fillStyle = COL.dim; c.fillText(ly ? pow10(v) : mi(String(+v.toPrecision(6))), r.x - 4, Y(v)); });
		var xt = []; if (lx) { for (var e2 = Math.ceil(Math.log10(o.x0)); e2 <= Math.floor(Math.log10(o.x1)); e2++) xt.push(Math.pow(10, e2)); } else { var xs = niceStep(o.x1 - o.x0, Math.max(2, Math.floor(r.w / 70))); for (var t = Math.ceil(o.x0 / xs - 1e-9) * xs; t <= o.x1 + 1e-9; t += xs) xt.push(t); }
		c.textAlign = "center"; c.textBaseline = "top";
		xt.forEach(function (t) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(X(t) + 0.5, r.y); c.lineTo(X(t) + 0.5, r.y + r.h); c.stroke(); c.fillStyle = COL.dim; c.fillText(mi(String(+t.toPrecision(6))) + (o.xu || ""), X(t), r.y + r.h + 3); });
		c.strokeStyle = COL.axis; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
		if (o.xl) { c.textAlign = "right"; c.fillStyle = COL.dim; c.fillText(o.xl, r.x + r.w, r.y + r.h + 17); }
		if (o.yl) { c.save(); c.translate(r.x - 38, r.y + r.h / 2); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.textBaseline = "bottom"; c.fillStyle = COL.dim; c.fillText(o.yl, 0, 0); c.restore(); }
		c.restore();
		if (o.title) txt(c, o.title, r.x + 6, r.y + 15, { b: 1, size: 11 });
		return { X: X, Y: Y };
	}
	function trace(c, r, f, xs, ys, col, w, dash) { c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); c.strokeStyle = col; c.lineWidth = w || 1.6; c.setLineDash(dash || []); c.beginPath(); var on = false; for (var i = 0; i < xs.length; i++) { var x = f.X(xs[i]), y = f.Y(ys[i]); if (!isFinite(y)) { on = false; continue; } if (on) c.lineTo(x, y); else { c.moveTo(x, y); on = true; } } c.stroke(); c.restore(); }
	function legend(c, r, items) {
		c.save(); c.font = "11px system-ui,sans-serif"; c.textBaseline = "top"; var tot = 0; items.forEach(function (it) { tot += c.measureText(it[0]).width + 12; });
		if (tot < r.w - 200) { c.textAlign = "right"; var x = r.x + r.w - 6; for (var j = items.length - 1; j >= 0; j--) { c.fillStyle = items[j][1]; c.fillText(items[j][0], x, r.y + 5); x -= c.measureText(items[j][0]).width + 12; } }
		else { c.textAlign = "left"; var x2 = r.x + 6, y = r.y + 21; items.forEach(function (it) { var wd = c.measureText(it[0]).width; if (x2 + wd > r.x + r.w - 4) { x2 = r.x + 6; y += 14; } c.fillStyle = it[1]; c.fillText(it[0], x2, y); x2 += wd + 12; }); }
		c.restore(); }
	function slider(id, get, set, fmt) { var el = $(id), out = $(id + "-v"); el.value = get(); var show = function () { if (out) out.textContent = fmt(Number(el.value)); }; el.oninput = function () { set(Number(el.value)); show(); }; show(); return { el: el, show: show, set: function (v) { el.value = v; show(); } }; }
	function chips(box, list, onPick) { box.innerHTML = ""; list.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.name; b.dataset.id = p.id; b.setAttribute("aria-pressed", "false"); b.onclick = function () { onPick(p); }; box.appendChild(b); }); }
	function markChips(box, id) { Array.prototype.forEach.call(box.children, function (b) { b.setAttribute("aria-pressed", b.dataset.id === id ? "true" : "false"); }); }

	/* ======================================================= tabs ======================================================= */
	var TABS = ["loop", "cells", "pair"];
	var tab = TABS.indexOf(q.get("tab")) >= 0 ? q.get("tab") : (TABS.indexOf(saved.tab) >= 0 ? saved.tab : "loop");
	function setUrl() { try { var u = new URL(location.href), p = new URLSearchParams(); if (tab !== "loop") p.set("tab", tab); if (tab === "loop" && L1.step !== "wire") p.set("step", L1.step); if (tab === "cells" && C.scn !== "current") p.set("scn", C.scn); if (tab === "pair" && P.pre) p.set("pre", P.pre); u.search = p.toString() ? "?" + p.toString() : ""; history.replaceState(null, "", u); } catch (e) {} }
	function setTab(t, init) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init) { sset({ tab: t }); setUrl(); }
		setTimeout(onResize, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* ======================================================= 1. A CHARGE GOING ROUND ======================================================= */
	var STEPS = [
		{ id: "wire", name: "1. A straight wire" }, { id: "bend", name: "2. Bend it" }, { id: "loop", name: "3. A loop" }, { id: "charge", name: "4. One charge going round" },
		{ id: "electron", name: "5. The electron" }, { id: "proton", name: "6. The proton" }, { id: "neutron", name: "7. The neutron" }, { id: "magnet", name: "8. A tiny magnet, predicted" }];
	var ls = saved.l || {}, qs = q.get("step");
	var L1 = { step: STEPS.some(function (s) { return s.id === qs; }) ? qs : (STEPS.some(function (s) { return s.id === ls.step; }) ? ls.step : "wire"), I: num(ls.I, 0, 20, 8), rev: !!ls.rev, s: num(ls.s, 0, 1, 0.5), f: num(ls.f, 1, 10000, 1000), sp: num(ls.sp, 0.1, 4, 1),
		ndl: bool(ls.ndl, true), lines: bool(ls.lines, true), avg: bool(ls.avg, true), dip: bool(ls.dip, true), run: true, t: 0, probe: [1.6, 0.6], bendPlay: false, cache: null, needles: null };
	var RM = 0.05;   /* the drawn loop is 5 cm in radius: display unit = 5 cm */
	function lSave() { sset({ l: { step: L1.step, I: L1.I, rev: L1.rev, s: L1.s, f: L1.f, sp: L1.sp, ndl: L1.ndl, lines: L1.lines, avg: L1.avg, dip: L1.dip } }); }
	var LOOPISH = { loop: 1, charge: 1, electron: 1, magnet: 1 };
	function ringsSphere() { var out = [], n = 9; for (var k = 0; k < n; k++) { var th = Math.PI * (k + 0.5) / n, r = Math.sin(th), y = Math.cos(th), pts = M.circleXZ(r, 48).map(function (p) { return [p[0], y, p[2]]; }); out.push({ pts: pts, w: 1.6 * Math.sin(th) * (Math.PI / n), closed: true }); } return out; }
	/* the current paths of a step, display units (loop radius 1), weight w = current in units of the step's own current */
	function config() {
		var st = L1.step, sgn = L1.rev ? -1 : 1, paths, H = 3;
		if (st === "wire") paths = [{ pts: [[0, 0, -40], [0, 0, 40]], w: 1, closed: false }];
		else if (st === "bend") { var bp = M.bendPath(1, L1.s, L1.bendPlay ? 40 : 72, 8); paths = [{ pts: bp.pts, w: 1, closed: true }]; }
		else if (st === "neutron") paths = [{ pts: M.circleXZ(0.55, 64), w: 1, closed: true, ring: "+" }, { pts: M.circleXZ(1, 96), w: -1, closed: true, ring: "−" }];
		else if (st === "proton") paths = ringsSphere();
		else paths = [{ pts: M.circleXZ(1, 96), w: 1, closed: true }];
		if (st === "magnet") H = 6;
		paths.forEach(function (p) { p.w *= sgn; });
		/* where the currents cross the card (z = 0) */
		var cross = [];
		paths.forEach(function (p) { var n = p.pts.length, m = p.closed ? n : n - 1; for (var i = 0; i < m; i++) { var a = p.pts[i], b = p.pts[(i + 1) % n]; if (Math.abs(a[2]) < 1e-9 && Math.abs(b[2]) < 1e-9) continue; if ((a[2] <= 0 && b[2] > 0) || (a[2] >= 0 && b[2] < 0)) { var t = a[2] / (a[2] - b[2]); cross.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); } } });
		/* magnetic moment (display units, unit current): 1/2 sum r x dl */
		var mu = [0, 0, 0]; paths.forEach(function (p) { var n = p.pts.length; if (!p.closed) return; for (var i = 0; i < n; i++) { var a = p.pts[i], b = p.pts[(i + 1) % n], cr = M.cross(a, M.sub(b, a)); mu = M.add(mu, M.scl(cr, 0.5 * p.w)); } });
		return { paths: paths, H: H, cross: cross, mu: mu, key: st + "|" + (st === "bend" ? L1.s.toFixed(3) : "") + "|" + sgn };
	}
	function Bavg(cfg, P) { var B = [0, 0, 0]; cfg.paths.forEach(function (p) { var b = M.pathB(P, p.pts, p.w, p.closed); B[0] += b[0]; B[1] += b[1]; B[2] += b[2]; }); return B; }
	function chargeAngle() { return L1.t * 0.9 * (L1.rev ? -1 : 1) * (L1.step === "electron" ? -1 : 1); }   /* the electron goes the other way round from its current */
	function chargePos() { var a = chargeAngle(); return [Math.cos(a), 0, Math.sin(a)]; }
	function instantMode() { return (L1.step === "charge" || L1.step === "electron") && !L1.avg; }
	function Bnow(cfg, P) {
		if (!instantMode()) return Bavg(cfg, P);
		var a = chargeAngle(), Q = [Math.cos(a), 0, Math.sin(a)], dir = (L1.rev ? -1 : 1) * (L1.step === "electron" ? -1 : 1), v = [-Math.sin(a) * dir, 0, Math.cos(a) * dir];
		return M.chargeB(P, Q, v, L1.step === "electron" ? -1 : 1);
	}
	function lineSet(f2, H, cross, fine) {
		var h = H / (fine ? 110 : 60), n = fine ? 1400 : 700, cell = H / 26, occ = {}, lines = [];
		function key(x, y) { return Math.floor(x / cell) + "," + Math.floor(y / cell); }
		function near(x, y) { for (var i = 0; i < cross.length; i++) if (Math.hypot(x - cross[i][0], y - cross[i][1]) < 0.045 * H / 3) return true; return false; }
		var box = [-H, H, -H, H], seeds = [], ns = fine ? 15 : 10;
		for (var i = 0; i <= 2 * ns; i++) { var x = -H * 0.96 + 1.92 * H * i / (2 * ns); seeds.push([x, 0]); }
		cross.forEach(function (cp) { for (var k = 1; k <= 3; k++) seeds.push([cp[0], cp[1] + 0.12 * k * H / 3]); });
		seeds.forEach(function (s) {
			if (near(s[0], s[1]) || occ[key(s[0], s[1])]) return;
			var o = { h: h, n: n, box: box, stop: near }, fw = M.streamline(f2, s[0], s[1], o), pts = fw.pts;
			if (!fw.closed) { o.dir = -1; var bw = M.streamline(f2, s[0], s[1], o); pts = bw.pts.slice(1).reverse().concat(pts); }
			if (pts.length < 6) return;
			pts.forEach(function (p) { occ[key(p[0], p[1])] = 1; });
			lines.push({ pts: pts, closed: fw.closed });
		});
		return lines;
	}
	function lCompute(force) {
		var cfg = config(); L1.cfg = cfg;
		var f2 = function (x, y) { var b = Bavg(cfg, [x, y, 0]); return [b[0], b[1]]; };
		if (force || !L1.cache || L1.cache.key !== cfg.key) {
			var fine = !L1.bendPlay;
			L1.cache = { key: cfg.key, lines: lineSet(f2, cfg.H, cfg.cross, fine), dlines: null };
			if (L1.step === "magnet") { var m = cfg.mu; L1.cache.dlines = lineSet(function (x, y) { var b = M.dipoleB(m, [x, y, 0]); return [b[0], b[1]]; }, cfg.H, [[0, 0]], fine); }
		}
		/* compass needles on a grid over the card */
		var n = 15, H = cfg.H, nd = [];
		for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
			var x = -H + (i + 0.5) * 2 * H / n, y = -H + (j + 0.5) * 2 * H / n, skip = false;
			cfg.cross.forEach(function (cp) { if (Math.hypot(x - cp[0], y - cp[1]) < 0.16 * H / 3) skip = true; }); if (skip) continue;
			var old = L1.needles && L1.needles[nd.length] && L1.needles[nd.length].x === x && L1.needles[nd.length].y === y ? L1.needles[nd.length].a : null;
			nd.push({ x: x, y: y, a: old, ta: 0, m: 0 });
		}
		L1.needles = nd; needleTargets();
	}
	function needleTargets() {
		var cfg = L1.cfg, mn = Infinity, mx = 0;
		L1.needles.forEach(function (d) { var b = Bnow(cfg, [d.x, d.y, 0]); d.ta = Math.atan2(b[1], b[0]); d.m = Math.hypot(b[0], b[1]); if (d.a === null) d.a = d.ta; if (d.m > 0) { mn = Math.min(mn, d.m); mx = Math.max(mx, d.m); } });
		var lr = Math.log(Math.max(mx / Math.max(mn, 1e-30), 1.0001)); L1.needles.forEach(function (d) { d.al = d.m > 0 ? clamp(0.25 + 0.75 * Math.log(d.m / mn) / lr, 0.25, 1) : 0.15; });
	}
	var lStage = $("mv-l-stage"), lCv = $("mv-l-c"), lSz = null, lpStage = $("mv-lp-stage"), lpSz = null;
	var cam1 = { yaw: -0.55, pitch: 0.55, F: 14, zoom: 1, wheel: true, k: 1, cx: 0, cy: 0 };
	function lTap(x, y) {   /* move the probe to the clicked point of the card (invert the projection on z = 0) */
		var p = [L1.probe[0], L1.probe[1]], H = L1.cfg.H;
		for (var it = 0; it < 30; it++) { var a = proj(cam1, p[0], p[1], 0), e = 1e-3, ax = proj(cam1, p[0] + e, p[1], 0), ay = proj(cam1, p[0], p[1] + e, 0);
			var j11 = (ax.x - a.x) / e, j21 = (ax.y - a.y) / e, j12 = (ay.x - a.x) / e, j22 = (ay.y - a.y) / e, det = j11 * j22 - j12 * j21; if (Math.abs(det) < 1e-9) return;
			var rx = x - a.x, ry = y - a.y; p[0] += (j22 * rx - j12 * ry) / det; p[1] += (-j21 * rx + j11 * ry) / det; }
		if (Math.abs(p[0]) > H || Math.abs(p[1]) > H || !isFinite(p[0])) return;
		L1.probe = p; lReadouts(); lDraw(); lpDraw();
	}
	var lReset = orbit(lCv, cam1, function () { lDraw(); }, { yaw: -0.55, pitch: 0.55 }, lTap);
	$("mv-l-view").onclick = function () { lReset(); };
	$("mv-l-png").onclick = function () { png(lCv, "current-loop-magnet"); };
	$("mv-l-play").onclick = function () { L1.run = !L1.run; this.setAttribute("aria-pressed", L1.run ? "true" : "false"); this.textContent = L1.run ? "❚❚ Pause" : "▶ Play"; };
	$("mv-l-rev").onclick = function () { L1.rev = !L1.rev; lSave(); lCompute(); lReadouts(); lNote(); lpDraw(); toast(L1.rev ? "Current reversed: every needle turns round" : "Current back the first way"); };
	var stepBox = $("mv-l-steps");
	chips(stepBox, STEPS, function (p) { if ((p.id === "magnet") !== (L1.step === "magnet")) L1.probe = p.id === "magnet" ? [4, 2] : [1.6, 0.6]; L1.step = p.id; L1.bendPlay = false; $("mv-l-bplay").textContent = "▶ Bend it slowly"; if (p.id === "magnet") cam1.zoom = 1; lApplyStep(); });
	var iS = slider("mv-l-i", function () { return L1.I; }, function (v) { L1.I = v; lSave(); lReadouts(); lpDraw(); }, function (v) { return v.toFixed(1) + " A"; });
	var bS = slider("mv-l-b", function () { return L1.s; }, function (v) { L1.s = v; L1.bendPlay = false; $("mv-l-bplay").textContent = "▶ Bend it slowly"; lSave(); lCompute(); lReadouts(); lpDraw(); }, function (v) { return Math.round(v * 100) + "%" + (v >= 1 ? " (a full loop)" : v <= 0 ? " (straight)" : ""); });
	slider("mv-l-f", function () { return L1.f; }, function (v) { L1.f = v; lSave(); lReadouts(); }, function (v) { return Math.round(v).toLocaleString("en-US"); });
	slider("mv-l-sp", function () { return L1.sp; }, function (v) { L1.sp = v; lSave(); }, function (v) { return v.toFixed(1) + "×"; });
	[["mv-l-ndl", "ndl"], ["mv-l-lines", "lines"], ["mv-l-avg", "avg"], ["mv-l-dip", "dip"]].forEach(function (p) { var el = $(p[0]); el.checked = L1[p[1]]; el.onchange = function () { L1[p[1]] = el.checked; lSave(); if (p[1] === "avg") { needleTargets(); lNote(); lReadouts(); } lDraw(); lpDraw(); }; });
	$("mv-l-bplay").onclick = function () { if (L1.bendPlay) { L1.bendPlay = false; this.textContent = "▶ Bend it slowly"; lCompute(true); return; } if (L1.s >= 0.999) L1.s = 0; L1.bendPlay = true; this.textContent = "❚❚ Stop bending"; };
	function lApplyStep() {
		markChips(stepBox, L1.step); var st = L1.step;
		$("mv-l-i-f").hidden = !(st === "wire" || st === "bend" || st === "loop" || st === "magnet");
		$("mv-l-b-f").hidden = st !== "bend"; $("mv-l-f-f").hidden = st !== "charge";
		$("mv-l-avg-w").hidden = !(st === "charge" || st === "electron"); $("mv-l-dip-w").hidden = st !== "magnet";
		lSave(); setUrl(); lCompute(true); lNote(); lReadouts(); lResize(); lpResize();
	}
	var NOTES = {
		wire: "Current flows up the wire. The compass needles on the card line up in circles round it: the magnetic field circles the current. Right-hand rule: point your right thumb along the current and your fingers curl the way the field goes. The field gets weaker as 1/r, the further you go from the wire.",
		bend: "The wire is being bent into a circle (the leads run off to a far-away battery). As it closes, the circles from every part of the wire start to point the same way through the middle. Press Bend it slowly, or drag the Bend slider.",
		loop: "A closed loop. Through the middle the field of every bit of wire points the same way, so it is strong there; outside it loops back round. One face of the loop acts as a north pole and the other as a south pole: the arrow µ is the loop's magnetic moment, µ = I × area.",
		charge: "Now there is no wire: one charge goes round the same circle. Averaged over a turn, it is a current I = q × (turns per second), and so it is a magnet just like the loop. Untick Average to see the field of the charge right now: it swings round with the charge.",
		electron: "Bohr's picture of hydrogen: the electron goes round the proton 6.6 million billion times a second. Being negative, its current runs the opposite way to its motion, so its magnet µ points against its angular momentum. Its size is exactly one Bohr magneton. (The picture on the card is scaled up from 0.05 nm.)",
		proton: "A model: a proton pictured as a spinning ball of charge, drawn as rings. It gives a magnet of the right shape, but to give the proton's measured moment (2.79 nuclear magnetons) the surface would have to move faster than light. Spin is not literally a ball turning, which is part of the puzzle Chantal Roth's mechanical models take on.",
		neutron: "The neutron has no net charge, yet it is a magnet (−1.91 nuclear magnetons). Picture a positive core and a negative outer layer turning together: the outer charge goes round a bigger circle, so its current loop wins and the net moment points against the turning. Measurements do show a slightly positive centre and negative skin (a model picture, not the quark calculation).",
		magnet: "Zoomed out: far from the loop its field (solid) is the field of a point magnet, a dipole (dashed). Maxwell's equations predict exactly this: any small current loop looks, from far away, like a tiny bar magnet. The graph shows how quickly the two agree along the axis."
	};
	function lNote() { $("mv-l-note").textContent = NOTES[L1.step] + (instantMode() ? " Showing the field of the charge right now (needles follow it; field lines need the average)." : ""); }
	function lReadouts() {
		var cfg = L1.cfg, st = L1.step, P = [L1.probe[0], L1.probe[1], 0], b = Bavg(cfg, P), Bm = Math.hypot(b[0], b[1], b[2]), out = [];
		var rP = Math.hypot(P[0] * RM * 100, P[1] * RM * 100);
		if (st === "wire" || st === "bend" || st === "loop" || st === "magnet") {
			var Breal = Bm * L1.I / RM;
			out.push({ l: "Current", v: sg(L1.I, 1) + " A", s: L1.rev ? "reversed" : "" });
			out.push({ l: "Field at the probe", v: tesla(Breal), s: "Biot-Savart sum; Earth's field is about 50 µT" });
			if (st === "wire") { var r = Math.hypot(P[0], P[1]) * RM; out.push({ l: "µ₀I / 2πr", v: tesla(M.wireB(L1.I, r)), s: "r = " + sg(r * 100, 2) + " cm from the wire" }); }
			if (st === "bend") out.push({ l: "Bent", v: Math.round(L1.s * 100) + "%", s: L1.s >= 0.999 ? "a closed loop" : "of a full circle" });
			if (st === "loop" || st === "magnet") { out.push({ l: "Centre: µ₀I / 2R", v: tesla(M.loopCentreB(L1.I, RM)), s: "R = 5 cm" }); out.push({ l: "Moment µ = IπR²", v: sci(L1.I * Math.PI * RM * RM, 3) + " A·m²" }); }
			if (st === "magnet") { var mu = Math.hypot.apply(null, cfg.mu), bd = M.dipoleB(cfg.mu, P), err = Math.hypot(b[0] - bd[0], b[1] - bd[1], b[2] - bd[2]) / Math.max(1e-30, Bm);
				var z1 = 0; for (var z = 0.5; z < 100; z *= 1.01) if (M.loopAxisB(1, 1, z) / M.dipoleAxisB(Math.PI, z) > 0.99) { z1 = z; break; }
				out.push({ l: "Loop vs dipole at the probe", v: sg(err * 100, 1) + "% apart", s: sg(rP, 1) + " cm from the centre" }); out.push({ l: "Within 1% on the axis from", v: sg(z1 * RM * 100, 1) + " cm", s: sg(z1, 1) + " loop radii" }); void mu; }
		} else if (st === "charge") {
			var qC = 1e-6, v = TAU * RM * L1.f, I = M.orbitCurrent(qC, v, RM);
			out.push({ l: "Charge", v: "1 µC", s: "on a 5 cm circle" }); out.push({ l: "Speed", v: sg(v, 1) + " m/s", s: L1.f.toLocaleString("en-US") + " turns per second" });
			out.push({ l: "Average current q f", v: sci(I, 3) + " A" }); out.push({ l: "Moment q v r / 2", v: sci(M.orbitMoment(qC, v, RM), 3) + " A·m²" }); out.push({ l: "Field at the centre", v: tesla(M.loopCentreB(I, RM)), s: "on average" });
		} else if (st === "electron") {
			var bo = M.bohr();
			out.push({ l: "Orbit radius", v: sg(bo.r * 1e9, 4) + " nm", s: "Bohr radius" }); out.push({ l: "Speed", v: sg(bo.v / 1000, 0) + " km/s", s: sg(bo.v / M.C * 100, 2) + "% of light (= αc)" });
			out.push({ l: "Turns per second", v: sci(bo.f, 3) }); out.push({ l: "Average current", v: sg(bo.I * 1e3, 3) + " mA" });
			out.push({ l: "Moment e v r / 2", v: sci(bo.mu, 3) + " A·m²", s: "= " + sg(bo.mu / M.MUB, 4) + " Bohr magneton" }); out.push({ l: "Angular momentum", v: sg(bo.L / M.HBAR, 4) + " ħ", s: "µ / L = e / 2m" });
			out.push({ l: "Field at the proton", v: sg(M.loopCentreB(bo.I, bo.r), 1) + " T", s: "µ₀I / 2r" });
		} else if (st === "proton") {
			var mup = 2.7928473 * M.MUN, rp = 0.8409e-15, ve = M.ballEquatorSpeed(mup, M.E, rp);
			out.push({ l: "Measured moment", v: "2.793 µN", s: sci(mup, 3) + " A·m²" }); out.push({ l: "Charge radius", v: "0.84 fm" });
			out.push({ l: "Spinning ball: equator speed needed", v: sg(ve / M.C, 1) + " c", s: "faster than light: not a literal ball", c: "is-bad" });
		} else if (st === "neutron") {
			var r1 = 0.55, wr = M.ringsMoment([{ q: 1, r: r1 }, { q: -1, r: 1 }], 1);
			out.push({ l: "Measured moment", v: "−1.913 µN", s: sci(-1.9130427 * M.MUN, 3) + " A·m²" }); out.push({ l: "Net charge", v: "0" });
			out.push({ l: "Model: + core, − skin", v: (wr < 0 ? "against" : "along") + " the spin", s: "µ ∝ q₊r₊² + q₋r₋² = " + sg(wr * 2, 3) });
			out.push({ l: "Mean-square charge radius", v: "−0.116 fm²", s: "measured: negative = negative outside" });
		}
		ro($("mv-l-ro"), out);
	}
	function lResize() { lSz = fitStage(lStage, function (w) { return clamp(w * 0.64, 320, 700); }); lDraw(); }
	function lpResize() { lpSz = fitStage(lpStage, function () { return 230; }); lpDraw(); }
	function lDraw() {
		if (!lSz || !L1.cfg) return; var c = lSz.c, W = lSz.W, Hh = lSz.H, cfg = L1.cfg, H = cfg.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		cam1.k = Math.min(W / (2.5 * H), Hh / (2.3 * H)) * cam1.zoom; cam1.cx = W / 2; cam1.cy = Hh * 0.56; cam1.F = 5 * H;
		var P3 = function (x, y, z) { return proj(cam1, x, y, z); };
		/* path parts below the card first */
		var flowPts = [];
		function drawPath(below) {
			var charge = !LOOPISH[L1.step] || L1.step === "loop" || L1.step === "magnet" ? false : true;
			cfg.paths.forEach(function (p) { var n = p.pts.length, m = p.closed ? n : n - 1;
				c.lineCap = "round";
				for (var i = 0; i < m; i++) { var a = p.pts[i], b = p.pts[(i + 1) % n], mz = (a[2] + b[2]) / 2; if ((mz < 0) !== below) continue;
					var A = P3(a[0], a[1], a[2]), B = P3(b[0], b[1], b[2]);
					if (L1.step === "proton" || L1.step === "neutron" || L1.step === "charge" || L1.step === "electron") { c.strokeStyle = below ? "rgba(140,150,180,0.35)" : "rgba(170,180,210,0.6)"; c.lineWidth = 1.2; c.setLineDash([4, 4]); }
					else { c.strokeStyle = below ? COL.wireD : COL.wire; c.lineWidth = Math.max(2, 5 * A.f * cam1.zoom); c.setLineDash([]); }
					c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); }
				c.setLineDash([]); void charge;
			});
		}
		drawPath(true);
		/* the card */
		var cs = [[-H, -H], [H, -H], [H, H], [-H, H]].map(function (p) { return P3(p[0], p[1], 0); });
		c.beginPath(); cs.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath(); c.fillStyle = "rgba(38,52,82,0.55)"; c.fill(); c.strokeStyle = "#3b4a6e"; c.lineWidth = 1; c.stroke();
		c.strokeStyle = "rgba(90,110,150,0.18)"; for (var g = -H; g <= H + 1e-9; g += H / 3) { var g1 = P3(g, -H, 0), g2 = P3(g, H, 0), g3 = P3(-H, g, 0), g4 = P3(H, g, 0); c.beginPath(); c.moveTo(g1.x, g1.y); c.lineTo(g2.x, g2.y); c.moveTo(g3.x, g3.y); c.lineTo(g4.x, g4.y); c.stroke(); }
		/* field lines on the card */
		function drawLines(lines, col, dash, f2) {
			c.save(); c.strokeStyle = col; c.lineWidth = 1.4; c.setLineDash(dash || []);
			lines.forEach(function (ln) { c.beginPath(); ln.pts.forEach(function (p, i) { var s = P3(p[0], p[1], 0); if (i) c.lineTo(s.x, s.y); else c.moveTo(s.x, s.y); }); c.stroke();
				var k = Math.floor(ln.pts.length / 2), p0 = ln.pts[k], p1 = ln.pts[Math.min(ln.pts.length - 1, k + 2)]; if (!p1) return; var b = f2(p0[0], p0[1]), d = Math.hypot(b[0], b[1]); if (!d) return;
				var s0 = P3(p0[0], p0[1], 0), s1 = P3(p0[0] + b[0] / d * 0.12, p0[1] + b[1] / d * 0.12, 0); c.setLineDash([]); arrow2(c, s0.x, s0.y, s1.x, s1.y, col, 1.4, 7); c.setLineDash(dash || []); });
			c.restore();
		}
		if (L1.lines && L1.cache && !instantMode()) {
			drawLines(L1.cache.lines, COL.line, null, function (x, y) { var b = Bavg(cfg, [x, y, 0]); return [b[0], b[1]]; });
			if (L1.step === "magnet" && L1.dip && L1.cache.dlines) drawLines(L1.cache.dlines, COL.dip, [5, 5], function (x, y) { var b = M.dipoleB(cfg.mu, [x, y, 0]); return [b[0], b[1]]; });
		}
		/* compass needles */
		if (L1.ndl && L1.needles) {
			var nl = H / 15 * 0.8;
			L1.needles.forEach(function (d) { var ca = Math.cos(d.a), sa = Math.sin(d.a), wx = -sa * nl * 0.22, wy = ca * nl * 0.22;
				var tip = P3(d.x + ca * nl, d.y + sa * nl, 0), tail = P3(d.x - ca * nl, d.y - sa * nl, 0), l1 = P3(d.x + wx, d.y + wy, 0), l2 = P3(d.x - wx, d.y - wy, 0);
				c.globalAlpha = d.al;
				c.fillStyle = COL.north; c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(l1.x, l1.y); c.lineTo(l2.x, l2.y); c.closePath(); c.fill();
				c.fillStyle = "#e8ecf5"; c.beginPath(); c.moveTo(tail.x, tail.y); c.lineTo(l1.x, l1.y); c.lineTo(l2.x, l2.y); c.closePath(); c.fill();
				c.globalAlpha = 1; });
		}
		/* probe */
		var pr = P3(L1.probe[0], L1.probe[1], 0); c.strokeStyle = COL.probe; c.lineWidth = 2; c.beginPath(); c.arc(pr.x, pr.y, 6, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(pr.x - 10, pr.y); c.lineTo(pr.x + 10, pr.y); c.moveTo(pr.x, pr.y - 10); c.lineTo(pr.x, pr.y + 10); c.stroke();
		var pb = Bnow(cfg, [L1.probe[0], L1.probe[1], 0]), pm = Math.hypot(pb[0], pb[1]); if (pm > 0) { var pe = P3(L1.probe[0] + pb[0] / pm * H * 0.18, L1.probe[1] + pb[1] / pm * H * 0.18, 0); arrow2(c, pr.x, pr.y, pe.x, pe.y, COL.probe, 2.2, 9); }
		drawPath(false);
		/* moving current / charges */
		var st = L1.step, sgnI = L1.rev ? -1 : 1;
		if (st === "wire" || st === "bend" || st === "loop" || st === "magnet") {
			var p = cfg.paths[0], segs = [], tot = 0, n = p.pts.length, m = p.closed ? n : n - 1;
			for (var i = 0; i < m; i++) { var a = p.pts[i], b = p.pts[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); segs.push([a, b, tot, len]); tot += len; }
			var sp = 0.32, off = ((L1.t * 0.6 * (L1.I / 8) * sgnI) % sp + sp) % sp, view = st === "wire" ? 4.5 : 1e9;
			c.fillStyle = COL.cur;
			for (var sdist = off, si = 0; sdist < tot; sdist += sp) { while (si < segs.length - 1 && segs[si][2] + segs[si][3] < sdist) si++; var sgm = segs[si], u = (sdist - sgm[2]) / sgm[3], X = sgm[0][0] + u * (sgm[1][0] - sgm[0][0]), Y = sgm[0][1] + u * (sgm[1][1] - sgm[0][1]), Z = sgm[0][2] + u * (sgm[1][2] - sgm[0][2]);
				if (Math.abs(Z) > view || Math.abs(X) > H * 1.4) continue; var s = P3(X, Y, Z); c.globalAlpha = Z < 0 ? 0.45 : 1; c.beginPath(); c.arc(s.x, s.y, Math.max(1.5, 3 * s.f), 0, TAU); c.fill(); }
			c.globalAlpha = 1;
			if (st === "wire") { var top = P3(0, 0, H * 0.95), top2 = P3(0, 0, H * 0.95 + 0.6 * sgnI); arrow2(c, top.x, top.y, top2.x, top2.y, COL.wire, 3, 11); txt(c, "I", top2.x + 8, top2.y, { b: 1, size: 14, col: COL.wire });
				/* right-hand-rule curl */
				c.strokeStyle = COL.fit; c.lineWidth = 2; c.beginPath(); var zc = H * 0.62; for (var k = 0; k <= 40; k++) { var t = k / 40 * TAU * 0.8, sp2 = P3(0.55 * Math.cos(t * sgnI), 0.55 * Math.sin(t * sgnI), zc); if (k) c.lineTo(sp2.x, sp2.y); else c.moveTo(sp2.x, sp2.y); } c.stroke();
				var ta = TAU * 0.8, e1 = P3(0.55 * Math.cos((ta - 0.15) * sgnI), 0.55 * Math.sin((ta - 0.15) * sgnI), zc), e2 = P3(0.55 * Math.cos(ta * sgnI), 0.55 * Math.sin(ta * sgnI), zc); arrow2(c, e1.x, e1.y, e2.x, e2.y, COL.fit, 2, 9);
				txt(c, "B", e2.x + 6, e2.y - 4, { b: 1, size: 13, col: COL.fit }); }
		} else if (st === "charge" || st === "electron") {
			var Q = chargePos(), s = P3(Q[0], Q[1], Q[2]); c.fillStyle = st === "electron" ? "#4cc9f0" : COL.cur; c.beginPath(); c.arc(s.x, s.y, 8 * s.f * cam1.zoom + 2, 0, TAU); c.fill(); txt(c, st === "electron" ? "−" : "+", s.x, s.y + 1, { b: 1, size: 13, col: "#0a0d14", al: "center", bl: "middle" });
			if (st === "electron") { var pn = P3(0, 0, 0); c.fillStyle = COL.north; c.beginPath(); c.arc(pn.x, pn.y, 5, 0, TAU); c.fill(); txt(c, "p⁺", pn.x + 7, pn.y - 6, { size: 11, col: COL.text }); }
		} else if (st === "neutron" || st === "proton") {
			var ang = L1.t * 0.9 * sgnI;
			if (st === "neutron") [[0.55, "+", COL.cur, 3], [1, "−", "#4cc9f0", 5]].forEach(function (rg) { for (var k = 0; k < rg[3]; k++) { var a2 = ang + k * TAU / rg[3], s2 = P3(rg[0] * Math.cos(a2), 0, rg[0] * Math.sin(a2)); c.fillStyle = rg[2]; c.beginPath(); c.arc(s2.x, s2.y, 6 * s2.f + 1, 0, TAU); c.fill(); txt(c, rg[1], s2.x, s2.y + 1, { b: 1, size: 11, col: "#0a0d14", al: "center", bl: "middle" }); } });
			else cfg.paths.forEach(function (p, k) { if (k % 2) return; var r = Math.hypot(p.pts[0][0], p.pts[0][2]), y = p.pts[0][1]; for (var j = 0; j < 3; j++) { var a3 = ang + j * TAU / 3 + k, s3 = P3(r * Math.cos(a3), y, r * Math.sin(a3)); c.fillStyle = COL.cur; c.globalAlpha = 0.85; c.beginPath(); c.arc(s3.x, s3.y, 4 * s3.f + 1, 0, TAU); c.fill(); c.globalAlpha = 1; } });
		}
		/* the moment arrow */
		if (st !== "wire" && !(st === "bend" && L1.s < 0.98)) {
			var mu = cfg.mu, mm = Math.hypot(mu[0], mu[1], mu[2]); if (mm > 1e-9) { var L0 = st === "magnet" ? 2.2 : 1.6, o = P3(0, 0, 0), tp = P3(mu[0] / mm * L0, mu[1] / mm * L0, mu[2] / mm * L0); arrow2(c, o.x, o.y, tp.x, tp.y, "#f472b6", 3.5, 13); txt(c, "µ (north)", tp.x + 8, tp.y - 6, { b: 1, size: 12, col: "#f9a8d4" }); }
		}
		txt(c, st === "electron" ? "scale: loop = 0.053 nm" : st === "proton" || st === "neutron" ? "scale: about 1 fm" : "loop radius = 5 cm", 10, Hh - 10, { size: 11, col: COL.dim });
	}
	function lpDraw() {
		if (!lpSz || !L1.cfg) return; var c = lpSz.c, W = lpSz.W, Hh = lpSz.H, st = L1.step, cfg = L1.cfg; c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		var r = { x: 62, y: 12, w: W - 82, h: Hh - 46 }, f, xs = [], i;
		if (st === "wire" || st === "bend") {
			var I = L1.I, x0 = 0.2, x1 = 3, base = cfg.cross[0] || [0, 0];
			for (i = 0; i <= 80; i++) xs.push(x0 + (x1 - x0) * i / 80);
			var ymax = M.wireB(I || 1, x0 * RM) * 1e6 * 1.1;
			f = frame(c, r, { x0: x0 * 5, x1: x1 * 5, y0: 0, y1: ymax, xl: "distance from the wire (cm)", yl: "B (µT)", title: st === "wire" ? "Field beside the wire" : "Field beside the bent wire, along the card" });
			var xc = xs.map(function (x) { return x * 5; });
			trace(c, r, f, xc, xs.map(function (x) { return M.wireB(I, x * RM) * 1e6; }), COL.fit, 2, [6, 4]);
			trace(c, r, f, xc, xs.map(function (x) { var b = Bavg(cfg, [base[0] + x, base[1], 0]); return Math.hypot(b[0], b[1], b[2]) * I / RM * 1e6; }), COL.line, 2);
			legend(c, r, [["µ₀I / 2πr (straight)", COL.fit], ["Biot-Savart sum (this wire)", COL.line]]);
			return;
		}
		/* on the axis, log-log, normalised by the centre field of a unit loop (mu0 I / 2R) */
		var n0 = M.MU0 / 2, mu = Math.hypot(cfg.mu[0], cfg.mu[1], cfg.mu[2]), lx0 = 0.1, lx1 = 30;
		for (i = 0; i <= 120; i++) xs.push(lx0 * Math.pow(lx1 / lx0, i / 120));
		f = frame(c, r, { x0: lx0, x1: lx1, y0: 1e-5, y1: 10, logx: 1, logy: 1, xl: "distance along the axis (loop radii)", yl: "B / B(centre of loop)", title: "Field along the axis: loop vs a tiny magnet" });
		if (LOOPISH[st]) trace(c, r, f, xs, xs.map(function (z) { return 1 / Math.pow(1 + z * z, 1.5); }), COL.fit, 2.4);
		trace(c, r, f, xs, xs.map(function (z) { return M.dipoleAxisB(mu, z) / n0; }), COL.dip, 1.8, [6, 4]);
		c.fillStyle = COL.line; var ax = mu > 0 ? M.scl(cfg.mu, 1 / mu) : [0, 1, 0];
		for (i = 0; i <= 24; i++) { var z = lx0 * Math.pow(lx1 / lx0, i / 24), b = Bavg(cfg, M.scl(ax, z)), v = Math.abs(M.dot(b, ax)) / n0; if (v > 0) { c.beginPath(); c.arc(f.X(z), f.Y(v), 3, 0, TAU); c.fill(); } }
		legend(c, r, [LOOPISH[st] ? ["µ₀IR² / 2(R²+z²)^1.5", COL.fit] : ["", COL.fit], ["dipole 2µ / 4πz³", COL.dip], ["Biot-Savart sum (dots)", COL.line]].filter(function (x) { return x[0]; }));
	}
	function lTick(dt) {
		if (L1.run) L1.t += dt * L1.sp;
		if (L1.bendPlay) { L1.s = Math.min(1, L1.s + dt * 0.12 * L1.sp); bS.set(L1.s); if (L1.s >= 1) { L1.bendPlay = false; $("mv-l-bplay").textContent = "▶ Bend it slowly"; lCompute(true); lReadouts(); lpDraw(); } else { lCompute(); } }
		if (instantMode()) needleTargets();
		if (L1.needles) L1.needles.forEach(function (d) { var da = Math.atan2(Math.sin(d.ta - d.a), Math.cos(d.ta - d.a)); d.a += da * Math.min(1, dt * (instantMode() ? 14 : 5)); });
		lDraw();
	}

	/* ======================================================= 2. CELLS AND IDLE WHEELS ======================================================= */
	var SCN = [
		{ id: "uniform", name: "Uniform field" }, { id: "current", name: "A current" }, { id: "loop", name: "A current loop" },
		{ id: "induction", name: "Induction" }, { id: "wave", name: "Release a twist: a wave" }, { id: "antenna", name: "A wiggling current sends waves" }];
	var cs = saved.c || {}, qsc = q.get("scn");
	var C = { scn: SCN.some(function (s) { return s.id === qsc; }) ? qsc : (SCN.some(function (s) { return s.id === cs.scn; }) ? cs.scn : "current"), k: num(cs.k, 4, 100, 40), g: num(cs.g, 0.5, 20, 6), F: num(cs.F, 0, 6, 2), sp: num(cs.sp, 0.1, 4, 1.5),
		tilt: !!cs.tilt, abs: !!cs.abs, col: bool(cs.col, true), run: true, on: true, L: null, prim: [], psg: [], sec: [], ssg: [], hist: [], hT: 0, nx: 24, ny: 15 };
	function cSave() { sset({ c: { scn: C.scn, k: C.k, g: C.g, F: C.F, sp: C.sp, tilt: C.tilt, abs: C.abs, col: C.col } }); }
	function idx(x, y) { return y * C.nx + x; }
	function twist(L, cx, cy, amp, w2) {   /* strain the springs as if the cells near (cx, cy) had been turned by amp: stores energy, no net spin */
		for (var e = 0; e < L.M; e++) { var ci = L.ei[e], cj = L.ej[e], xi = ci % L.nx - cx, yi = Math.floor(ci / L.nx) - cy, xj = cj % L.nx - cx, yj = Math.floor(cj / L.nx) - cy;
			if (L.cond[e]) continue; L.u[e] += L.a * amp * (Math.exp(-(xi * xi + yi * yi) / w2) - Math.exp(-(xj * xj + yj * yj) / w2)) / 2; }
	}
	function cDims() { var w = (cStage && cStage.parentNode.clientWidth) || 800, small = w < 600; C.nx = small ? 14 : 24; C.ny = small ? 13 : 15; }
	function cBuild() {
		cDims(); var L = M.lattice({ nx: C.nx, ny: C.ny, k: C.k, g: C.g, I: 0.25 }), s = C.scn, x, e; C.L = L; C.prim = []; C.psg = []; C.sec = []; C.ssg = []; C.hist = []; C.hT = 0; C.on = true;
		var mid = Math.floor(C.ny / 2);
		if (s === "uniform") L.w.fill(1.2);
		if (s === "current" || s === "antenna") { var x0 = s === "antenna" ? Math.floor(C.nx / 2) - 3 : 0, x1 = s === "antenna" ? Math.floor(C.nx / 2) + 2 : C.nx - 1; for (x = x0; x <= x1; x++) { e = M.edgeAt(L, x, mid - 1, x, mid); L.cond[e] = 1; C.prim.push(e); C.psg.push(-1); } }
		var r1 = Math.floor(C.ny * 0.28), r2 = Math.floor(C.ny * 0.62);
		if (s === "induction") { for (x = 0; x < C.nx; x++) { e = M.edgeAt(L, x, r1, x, r1 + 1); L.cond[e] = 1; C.prim.push(e); C.psg.push(-1); var e2 = M.edgeAt(L, x, r2, x, r2 + 1); L.cond[e2] = 1; C.sec.push(e2); C.ssg.push(-1); } }
		if (s === "loop") { var inside = function (i) { var xx = i % C.nx, yy = Math.floor(i / C.nx); var mx0 = Math.round(C.nx / 3), mx1 = C.nx - 1 - mx0, my0 = Math.round(C.ny / 4), my1 = C.ny - 1 - my0; return xx >= mx0 && xx <= mx1 && yy >= my0 && yy <= my1; };
			for (e = 0; e < L.M; e++) { var a = inside(L.ei[e]), b = inside(L.ej[e]); if (a !== b) { L.cond[e] = 1; C.prim.push(e); C.psg.push(a ? 1 : -1); } } }
		if (s === "wave") twist(L, (C.nx - 1) / 2, (C.ny - 1) / 2, 2.2, 3);
		C.abs = s === "wave" || s === "antenna"; $("mv-c-abs").checked = C.abs; cDamp(); cSrc();
		$("mv-c-sw").hidden = !(s === "current" || s === "loop" || s === "induction"); $("mv-c-sw").textContent = "Switch the current off";
		$("mv-c-f").closest(".tu-field").hidden = !(s === "current" || s === "loop" || s === "induction" || s === "antenna");
		$("mv-c-g").closest(".tu-field").hidden = s === "uniform" || s === "wave";
	}
	function cDamp() { var L = C.L; L.damp.fill(0); if (!C.abs) return; for (var y = 0; y < C.ny; y++) for (var x = 0; x < C.nx; x++) { var d = Math.min(x, y, C.nx - 1 - x, C.ny - 1 - y); if (d < 3) L.damp[idx(x, y)] = 1.6 * Math.pow(1 - d / 3, 2) * M.waveSpeed(L); } }
	function cSrc() { var L = C.L, s = C.scn, F = C.on ? C.F : 0; if (s === "antenna") F = C.F * 1.6 * Math.sin(TAU * L.t * M.waveSpeed(L) / 9); for (var k = 0; k < C.prim.length; k++) L.src[C.prim[k]] = F * C.psg[k]; }
	var cStage = $("mv-c-stage"), cCv = $("mv-c-c"), cSz = null, cpStage = $("mv-cp-stage"), cpSz = null;
	var cam2 = { yaw: 0, pitch: 0.75, F: 60, zoom: 1, wheel: false, k: 1, cx: 0, cy: 0 };
	var scnBox = $("mv-c-scn"); chips(scnBox, SCN, function (p) { C.scn = p.id; cApply(); });
	function cApply() { markChips(scnBox, C.scn); cBuild(); cSave(); setUrl(); cNote(); cReadouts(); cDraw(); cpDraw(); }
	slider("mv-c-k", function () { return C.k; }, function (v) { C.k = v; C.L.k = v; cDamp(); cSave(); cKNote(); }, function (v) { return String(Math.round(v)); });
	function cKNote() { $("mv-c-k-n").textContent = "A twist travels at " + sg(M.waveSpeed(C.L), 2) + " cells a second (a √(k / 4I)). Stiffer cells, faster waves: Maxwell's speed of light."; }
	slider("mv-c-g", function () { return C.g; }, function (v) { C.g = v; C.L.g = v; cSave(); }, function (v) { return v.toFixed(1); });
	slider("mv-c-f", function () { return C.F; }, function (v) { C.F = v; cSrc(); cSave(); }, function (v) { return v.toFixed(1); });
	slider("mv-c-sp", function () { return C.sp; }, function (v) { C.sp = v; cSave(); }, function (v) { return v.toFixed(1) + "×"; });
	$("mv-c-tilt").checked = C.tilt; $("mv-c-tilt").onchange = function () { C.tilt = this.checked; cam2.wheel = C.tilt; cSave(); cDraw(); };
	$("mv-c-abs").onchange = function () { C.abs = this.checked; cDamp(); };
	$("mv-c-col").checked = C.col; $("mv-c-col").onchange = function () { C.col = this.checked; cSave(); cDraw(); };
	$("mv-c-play").onclick = function () { C.run = !C.run; this.setAttribute("aria-pressed", C.run ? "true" : "false"); this.textContent = C.run ? "❚❚ Pause" : "▶ Play"; };
	$("mv-c-reset").onclick = function () { cBuild(); cReadouts(); cDraw(); cpDraw(); };
	$("mv-c-sw").onclick = function () { C.on = !C.on; cSrc(); this.textContent = C.on ? "Switch the current off" : "Switch the current on"; toast(C.on ? "Battery on: watch the nearby cells start up" : "Battery off: the spinning cells keep the current going for a while"); };
	$("mv-c-kick").onclick = function () { twist(C.L, (C.nx - 1) / 2, (C.ny - 1) / 2, 2.2, 3); toast("Twisted the middle cells and let go"); };
	$("mv-c-png").onclick = function () { png(cCv, "maxwell-cells-idle-wheels"); };
	cam2.wheel = C.tilt;
	var cReset2 = orbit(cCv, cam2, function () { cDraw(); }, { yaw: 0, pitch: 0.75, pmin: 0.2 }, null); void cReset2;
	/* flat view: click / drag on a cell gives it a spin (Shift: the other way) */
	var cGeo = null, cDragging = false;
	function cCell(e) { if (!cGeo) return -1; var r = cCv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left - cGeo.ox) / cGeo.s), y = C.ny - 1 - Math.floor((e.clientY - r.top - cGeo.oy) / cGeo.s); return x >= 0 && x < C.nx && y >= 0 && y < C.ny ? idx(x, y) : -1; }
	cCv.addEventListener("pointerdown", function (e) { if (C.tilt) return; cDragging = true; var i = cCell(e); if (i >= 0) C.L.w[i] += e.shiftKey ? -2 : 2; });
	cCv.addEventListener("pointermove", function (e) { if (C.tilt || !cDragging) return; var i = cCell(e); if (i >= 0) C.L.w[i] += (e.shiftKey ? -1 : 1) * 0.35; });
	window.addEventListener("pointerup", function () { cDragging = false; });
	var CNOTES = {
		uniform: "Every cell spins the same way at the same rate: a uniform magnetic field coming out of the page. Each idle wheel is touched by two cells moving in opposite directions at their rims, so it just spins in place (the other way, faster). No wheel travels: no current.",
		current: "A row of wheels in a wire (the copper band) is pushed along by a battery. They drag the cells above one way and the cells below the other way: the field circles the current (out of the page above, into it below). Watch the spin spread outwards from the wire, then settle. Switch the battery off and the spinning cells keep the wheels going for a while: the field stores energy, like an inductor.",
		loop: "Wheels flow round a closed ring of wire. The cells inside all end up spinning one way (strong field out of the page), the cells outside a little the other way: the return field. This is the cell picture of a current loop being a magnet.",
		induction: "Two wires. Only the lower one has a battery. When it is switched on, the spin spreading outwards drags the wheels in the upper wire backwards for a while (the cyan trace): an induced current against the change (Lenz's law). Once the spin is steady, the upper wire's wheels stop. Switch off and the kick comes the other way.",
		wave: "All the wheels are held by springs here (an insulator): the cells are elastic. Twisting the middle cells and letting go sends a ring of twist outwards at a fixed speed. Maxwell worked out the speed of this wave in his medium from electrical measurements and found it close to the speed of light.",
		antenna: "A short wire whose wheels are pushed back and forth. Each push spins up the cells nearby, and through the elastic cells the twist travels out as waves: a radio antenna in Maxwell's picture."
	};
	function cNote() { $("mv-c-note").textContent = CNOTES[C.scn]; cKNote(); }
	function cReadouts() {
		var L = C.L, ke = 0, pe = 0, i, moving = 0; for (i = 0; i < L.N; i++) ke += 0.5 * L.I * L.w[i] * L.w[i]; for (i = 0; i < L.M; i++) { if (!L.cond[i]) pe += 0.5 * L.k * L.u[i] * L.u[i]; if (Math.abs(L.v[i]) > 0.03) moving++; }
		var out = [{ l: "Time", v: sg(L.t, 1) + " s" }, { l: "Wave speed", v: sg(M.waveSpeed(L), 2) + " cells/s", s: "a √(k / 4I)" }];
		if (C.prim.length) out.push({ l: C.scn === "induction" ? "Current, lower wire" : "Current in the wire", v: sg(M.current(L, C.prim, C.psg), 3), s: C.scn === "antenna" ? "wheel speed (cells/s)" : "steady: push ÷ friction = " + sg((C.on ? C.F : 0) / C.g, 3) });
		if (C.sec.length) out.push({ l: "Current, upper wire", v: sg(M.current(L, C.sec, C.ssg), 3), s: "induced" });
		var hx2 = Math.floor(C.nx / 2), probe = C.scn === "induction" ? idx(hx2, Math.floor(C.ny * 0.45)) : C.scn === "loop" ? idx(hx2, Math.floor(C.ny / 2)) : idx(hx2, Math.floor(C.ny / 2) + 2);
		out.push({ l: "Spin of a sample cell", v: sg(L.w[probe], 3) + " rad/s", s: L.w[probe] > 0.02 ? "field out of the page" : L.w[probe] < -0.02 ? "field into the page" : "no field" });
		out.push({ l: "Energy: spin / springs", v: sg(ke, 2) + " / " + sg(pe, 2), s: "magnetic / electric (stored strain)" });
		out.push({ l: "Wheels travelling", v: String(moving), s: "of " + L.M + ": that is the current" });
		ro($("mv-c-ro"), out);
	}
	function wColor(w, alpha) { var t = clamp(w / 1.6, -1, 1), a = Math.abs(t); if (!C.col) return "rgba(60,72,98," + alpha + ")"; return t >= 0 ? "rgba(" + Math.round(40 + 190 * a) + "," + Math.round(50 + 20 * a) + "," + Math.round(70 - 30 * a) + "," + alpha + ")" : "rgba(" + Math.round(40 + 10 * a) + "," + Math.round(50 + 70 * a) + "," + Math.round(70 + 170 * a) + "," + alpha + ")"; }
	function cResize() { var onx = C.nx; cDims(); if (C.nx !== onx) { cBuild(); cReadouts(); } cSz = fitStage(cStage, function (w) { return w < 600 ? w * 1.02 + 84 : clamp(w * 0.62, 300, 700); }); cDraw(); }
	function cpResize() { cpSz = fitStage(cpStage, function () { return 200; }); cpDraw(); }
	function cDraw() {
		if (!cSz) return; var c = cSz.c, W = cSz.W, Hh = cSz.H, L = C.L, i, e; c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		if (C.tilt) { cDraw3(c, W, Hh); return; }
		var top = W < 600 ? 84 : 44, s = Math.min((W - 16) / C.nx, (Hh - top - 26) / C.ny), ox = (W - s * C.nx) / 2, oy = top + (Hh - top - 26 - s * C.ny) / 2; cGeo = { s: s, ox: ox, oy: oy };
		var SX = function (x) { return ox + (x + 0.5) * s; }, SY = function (y) { return oy + (C.ny - 0.5 - y) * s; };
		/* wire bands */
		c.lineCap = "round";
		for (e = 0; e < L.M; e++) if (L.cond[e]) { var mx = SX(L.ex[e]), my = SY(L.ey[e]), tx = L.tx[e], ty = -L.ty[e]; c.strokeStyle = "rgba(184,115,51,0.55)"; c.lineWidth = s * 0.3; c.beginPath(); c.moveTo(mx - tx * s * 0.5, my - ty * s * 0.5); c.lineTo(mx + tx * s * 0.5, my + ty * s * 0.5); c.stroke(); }
		/* cells */
		var a = L.a * s;
		for (var y = 0; y < C.ny; y++) for (var x = 0; x < C.nx; x++) {
			i = idx(x, y); var cx = SX(x), cy = SY(y), w = L.w[i];
			c.fillStyle = wColor(w, 0.9); c.beginPath(); c.arc(cx, cy, a, 0, TAU); c.fill(); c.strokeStyle = "rgba(200,210,235,0.35)"; c.lineWidth = 1; c.stroke();
			c.strokeStyle = "rgba(240,244,255,0.75)"; c.lineWidth = Math.max(1, s * 0.05); c.beginPath();
			for (var k = 0; k < 3; k++) { var an = -L.th[i] + k * TAU / 3; c.moveTo(cx + Math.cos(an) * a * 0.15, cy + Math.sin(an) * a * 0.15); c.lineTo(cx + Math.cos(an) * a * 0.92, cy + Math.sin(an) * a * 0.92); } c.stroke();
			if (Math.abs(w) > 0.25 && s > 16) { c.strokeStyle = "#fff"; c.fillStyle = "#fff"; c.lineWidth = 1.3; c.beginPath(); c.arc(cx, cy, a * 0.18, 0, TAU); c.stroke(); if (w > 0) { c.beginPath(); c.arc(cx, cy, a * 0.06, 0, TAU); c.fill(); } else { var d = a * 0.12; c.beginPath(); c.moveTo(cx - d, cy - d); c.lineTo(cx + d, cy + d); c.moveTo(cx + d, cy - d); c.lineTo(cx - d, cy + d); c.stroke(); } }
		}
		/* idle wheels */
		var b = L.b * s;
		for (e = 0; e < L.M; e++) {
			var disp = L.cond[e] ? ((L.u[e] % 1) + 1.5) % 1 - 0.5 : clamp(L.u[e] * 3, -0.3, 0.3), wx = SX(L.ex[e] + L.tx[e] * disp), wy = SY(L.ey[e] + L.ty[e] * disp), sp = Math.abs(L.v[e]);
			var hot = clamp(sp / 0.3, 0, 1); c.fillStyle = hot > 0.08 ? "rgba(255," + Math.round(209 - 40 * hot) + "," + Math.round(102 - 60 * hot) + "," + (0.55 + 0.45 * hot) + ")" : "rgba(150,160,185,0.75)";
			c.beginPath(); c.arc(wx, wy, b, 0, TAU); c.fill();
			if (b > 3) { c.strokeStyle = "rgba(10,13,20,0.8)"; c.lineWidth = 1; var pa = -L.ph[e]; c.beginPath(); c.moveTo(wx - Math.cos(pa) * b, wy - Math.sin(pa) * b); c.lineTo(wx + Math.cos(pa) * b, wy + Math.sin(pa) * b); c.stroke(); }
			if (hot > 0.25 && s > 14) { var dir = L.v[e] > 0 ? 1 : -1, ax = L.tx[e] * dir, ay = -L.ty[e] * dir; arrow2(c, wx + ax * b * 1.2, wy + ay * b * 1.2, wx + ax * (b * 1.2 + s * 0.28 * hot), wy + ay * (b * 1.2 + s * 0.28 * hot), "#ffd166", 1.5, 5); }
		}
		txt(c, W < 600 ? "red ⊙ field out of page · blue ⊗ into · yellow wheels = current" : "red / ⊙ = spinning anticlockwise = field out of the page · blue / ⊗ = into the page · yellow wheels = moving = current", 10, Hh - 9, { size: Math.max(9, Math.min(12, W / 75)), col: COL.dim });
	}
	function cDraw3(c, W, Hh) {
		var L = C.L, i, e; cam2.F = 60; cam2.k = Math.min(W / (C.nx * 1.15), Hh / (C.ny * 0.95)) * cam2.zoom; cam2.cx = W / 2; cam2.cy = Hh * 0.55;
		var hx = (C.nx - 1) / 2, hy = (C.ny - 1) / 2, items = [];
		for (var y = 0; y < C.ny; y++) for (var x = 0; x < C.nx; x++) { i = idx(x, y); var p = proj(cam2, x - hx, y - hy, 0); items.push({ d: p.d, i: i, x: x - hx, y: y - hy }); }
		items.sort(function (A, B) { return B.d - A.d; });
		for (e = 0; e < L.M; e++) if (L.cond[e]) { var pa = proj(cam2, L.ex[e] - hx - L.tx[e] * 0.5, L.ey[e] - hy - L.ty[e] * 0.5, 0), pb = proj(cam2, L.ex[e] - hx + L.tx[e] * 0.5, L.ey[e] - hy + L.ty[e] * 0.5, 0); c.strokeStyle = "rgba(184,115,51,0.55)"; c.lineWidth = 0.3 * cam2.k * pa.f; c.lineCap = "round"; c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); c.stroke(); }
		items.forEach(function (it) {
			var w = L.w[it.i]; c.fillStyle = wColor(w, 0.85); c.beginPath();
			for (var k = 0; k <= 20; k++) { var t = k / 20 * TAU, p = proj(cam2, it.x + L.a * Math.cos(t), it.y + L.a * Math.sin(t), 0); if (k) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); } c.fill();
			var t0 = L.th[it.i], q0 = proj(cam2, it.x, it.y, 0), q1 = proj(cam2, it.x + L.a * Math.cos(t0), it.y + L.a * Math.sin(t0), 0); c.strokeStyle = "rgba(240,244,255,0.7)"; c.lineWidth = 1; c.beginPath(); c.moveTo(q0.x, q0.y); c.lineTo(q1.x, q1.y); c.stroke();
			if (Math.abs(w) > 0.05) { var top = proj(cam2, it.x, it.y, clamp(w, -2.5, 2.5) * 0.9); arrow2(c, q0.x, q0.y, top.x, top.y, w > 0 ? "#fca5a5" : "#93c5fd", 1.6, 6); }
		});
		for (e = 0; e < L.M; e++) { var hot = clamp(Math.abs(L.v[e]) / 0.3, 0, 1); if (hot < 0.08) continue; var disp = L.cond[e] ? ((L.u[e] % 1) + 1.5) % 1 - 0.5 : clamp(L.u[e] * 3, -0.3, 0.3), pw = proj(cam2, L.ex[e] - hx + L.tx[e] * disp, L.ey[e] - hy + L.ty[e] * disp, 0); c.fillStyle = "rgba(255,200,80," + (0.5 + 0.5 * hot) + ")"; c.beginPath(); c.arc(pw.x, pw.y, Math.max(1.5, L.b * cam2.k * pw.f), 0, TAU); c.fill(); }
		txt(c, W < 600 ? "arrows = spin axes = field · yellow = current · drag to turn" : "Arrows = spin axes = the magnetic field (up = out of the page). Yellow = moving wheels = current. Drag to turn.", 10, Hh - 9, { size: Math.max(9, Math.min(12, W / 75)), col: COL.dim });
	}
	function cpDraw() {
		if (!cpSz) return; var c = cpSz.c, W = cpSz.W, Hh = cpSz.H, h = C.hist; c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		var r = { x: 58, y: 12, w: W - 76, h: Hh - 44 }, n = h.length, tn = n ? h[n - 1].t : 0, win = 20, t0 = Math.max(0, tn - win), sel = h.filter(function (p) { return p.t >= t0; });
		var wires = C.prim.length > 0, ys = [], ts = sel.map(function (p) { return p.t; });
		if (wires) { var m = 0.05; sel.forEach(function (p) { m = Math.max(m, Math.abs(p.p), Math.abs(p.s || 0)); }); var f = frame(c, r, { x0: t0, x1: t0 + win, y0: -m * 1.1, y1: m * 1.1, xl: "time (s)", yl: "current (wheel speed)", title: "Current in the wire" + (C.sec.length ? "s" : "") });
			if (ts.length > 1) { trace(c, r, f, ts, sel.map(function (p) { return p.p; }), "#ffd166", 2); if (C.sec.length) trace(c, r, f, ts, sel.map(function (p) { return p.s; }), "#4cc9f0", 2); }
			legend(c, r, C.sec.length ? [["lower wire (battery)", "#ffd166"], ["upper wire (induced)", "#4cc9f0"]] : [["wire", "#ffd166"]]); void ys;
		} else { var me = 0.1; sel.forEach(function (p) { me = Math.max(me, p.ke + p.pe); }); var f2 = frame(c, r, { x0: t0, x1: t0 + win, y0: 0, y1: me * 1.1, xl: "time (s)", yl: "energy", title: "Energy: spin (magnetic) and strain (electric)" });
			if (ts.length > 1) { trace(c, r, f2, ts, sel.map(function (p) { return p.ke; }), "#ff6b6b", 2); trace(c, r, f2, ts, sel.map(function (p) { return p.pe; }), "#60a5fa", 2); trace(c, r, f2, ts, sel.map(function (p) { return p.ke + p.pe; }), "#e8ecf5", 1.2, [4, 4]); }
			legend(c, r, [["spin", "#ff6b6b"], ["strain", "#60a5fa"], ["total", "#e8ecf5"]]); }
	}
	function cTick(dt) {
		if (C.run) {
			var L = C.L, T = dt * C.sp, sd = M.stableDt(L) * 0.8, n = Math.min(600, Math.ceil(T / sd)), h = T / n;
			for (var k = 0; k < n; k++) { if (C.scn === "antenna") cSrc(); M.step(L, h); }
			C.hT += T; if (C.hT >= 0.05) { C.hT = 0; var ke = 0, pe = 0, i; for (i = 0; i < L.N; i++) ke += 0.5 * L.I * L.w[i] * L.w[i]; for (i = 0; i < L.M; i++) if (!L.cond[i]) pe += 0.5 * L.k * L.u[i] * L.u[i];
				C.hist.push({ t: L.t, p: M.current(L, C.prim, C.psg), s: C.sec.length ? M.current(L, C.sec, C.ssg) : 0, ke: ke, pe: pe }); if (C.hist.length > 900) C.hist.shift(); }
		}
		cDraw(); cpDraw();
	}

	/* ======================================================= 3. TWO MAGNETS ======================================================= */
	var ps = saved.p || {}, qpre = q.get("pre"), LEN = 3, WID = 1.2;
	var P = { A: { x: -4, y: 0, t: 0 }, B: { x: 4, y: 0, t: 0 }, m: num(ps.m, 0.1, 10, 4.5), lines: bool(ps.lines, true), map: bool(ps.map, true), cells: !!ps.cells, arr: bool(ps.arr, true), sel: "B", pre: null, view: 30, cache: null, phase: 0 };
	function okMag(o) { return o && isFinite(o.x) && isFinite(o.y) && isFinite(o.t) && Math.abs(o.x) < 40 && Math.abs(o.y) < 40; }
	if (okMag(ps.A) && okMag(ps.B)) { P.A = ps.A; P.B = ps.B; }
	function pSave() { sset({ p: { A: P.A, B: P.B, m: P.m, lines: P.lines, map: P.map, cells: P.cells, arr: P.arr } }); }
	function mVec(o) { return [P.m * Math.cos(o.t * DEG), P.m * Math.sin(o.t * DEG), 0]; }
	function Bxy(x, y) { var a = M.dipoleB(mVec(P.A), [(x - P.A.x) / 100, (y - P.A.y) / 100, 0]), b = M.dipoleB(mVec(P.B), [(x - P.B.x) / 100, (y - P.B.y) / 100, 0]); return [a[0] + b[0], a[1] + b[1]]; }
	function inMag(o, x, y, pad) { var dx = x - o.x, dy = y - o.y, ct = Math.cos(o.t * DEG), st = Math.sin(o.t * DEG), u = dx * ct + dy * st, v = -dx * st + dy * ct; return Math.abs(u) <= LEN / 2 + (pad || 0) && Math.abs(v) <= WID / 2 + (pad || 0); }
	var pStage = $("mv-p-stage"), pCv = $("mv-p-c"), pSz = null;
	var preBox = $("mv-p-pre"); chips(preBox, M.PAIRS, function (p) { pPreset(p.id); });
	function pPreset(id) { var p = M.PAIRS.filter(function (x) { return x.id === id; })[0]; if (!p) return; var mx = (p.a[0] + p.b[0]) / 2, my = (p.a[1] + p.b[1]) / 2; P.A = { x: p.a[0] - mx, y: p.a[1] - my, t: p.ta }; P.B = { x: p.b[0] - mx, y: p.b[1] - my, t: p.tb }; P.pre = id; markChips(preBox, id); pChanged(); setUrl(); }
	slider("mv-p-m", function () { return P.m; }, function (v) { P.m = v; pChanged(); }, function (v) { return v.toFixed(2) + " A·m²"; });
	[["mv-p-lines", "lines"], ["mv-p-map", "map"], ["mv-p-cells", "cells"], ["mv-p-arr", "arr"]].forEach(function (p) { var el = $(p[0]); el.checked = P[p[1]]; el.onchange = function () { P[p[1]] = el.checked; pSave(); pDraw(); }; });
	$("mv-p-fa").onclick = function () { P.A.t = (P.A.t + 180) % 360; P.pre = null; markChips(preBox, ""); pChanged(); };
	$("mv-p-fb").onclick = function () { P.B.t = (P.B.t + 180) % 360; P.pre = null; markChips(preBox, ""); pChanged(); };
	$("mv-p-png").onclick = function () { png(pCv, "two-magnets"); };
	$("mv-p-chk").onclick = function () {
		var cA = [P.A.x / 100, P.A.y / 100, 0], cB = [P.B.x / 100, P.B.y / 100, 0], mA = mVec(P.A), mB = mVec(P.B), d = M.norm(M.sub(cB, cA));
		var Bt = function (Pt) { return M.add(M.dipoleB(mA, M.sub(Pt, cA)), M.dipoleB(mB, M.sub(Pt, cB))); };
		var Fs = M.stressForce(Bt, cB, 0.45 * d, 100, 200), Fd = M.dipoleForce(mA, mB, M.sub(cB, cA)), diff = M.norm(M.sub(Fs, Fd)) / Math.max(1e-30, M.norm(Fd));
		$("mv-p-note").textContent = "Maxwell's stress integrated over a sphere of radius " + sg(0.45 * d * 100, 2) + " cm round magnet B gives F = (" + sci(Fs[0], 3) + ", " + sci(Fs[1], 3) + ") N. The dipole formula gives (" + sci(Fd[0], 3) + ", " + sci(Fd[1], 3) + ") N: " + (diff < 0.01 ? "the same to " + sg(diff * 100, 2) + "%." : sg(diff * 100, 1) + "% apart.") + " The pull along the lines and the push across them, added up all round, are the force.";
	};
	function pChanged() { pSave(); P.cache = null; pReadouts(); pDraw(); pNote(); }
	function pNote() {
		var cA = [P.A.x / 100, P.A.y / 100, 0], cB = [P.B.x / 100, P.B.y / 100, 0], r = M.sub(cB, cA), F = M.dipoleForce(mVec(P.A), mVec(P.B), r), rad = M.dot(F, r) / M.norm(r);
		var txtN = Math.abs(rad) < 0.02 * M.norm(F) ? "Neither pulled together nor pushed apart: " : rad < 0 ? "They attract: " : "They repel: ";
		var id = P.pre; var why = id === "headtail" ? "the field lines run straight from the north end of one into the south end of the other and, like stretched rubber bands, pull them together." : id === "headhead" ? "the lines from the two north ends meet head on, are squeezed sideways between the magnets, and the sideways push of the vortices drives the magnets apart." : id === "sidepar" ? "between the magnets the two fields point opposite ways; the lines are pushed out of the gap and crowd the outside, and the sideways pressure pushes the magnets apart." : id === "sideanti" ? "the field between them runs the same way as both magnets' return fields, so lines loop from one magnet into the other and pull them together." : id === "tee" ? "this arrangement mostly twists: magnet B is turned towards lining up head to tail with A." : "drag the magnets around; the force is along the joining line only in the symmetric arrangements.";
		$("mv-p-note").textContent = txtN + why;
	}
	function pReadouts() {
		var cA = [P.A.x / 100, P.A.y / 100, 0], cB = [P.B.x / 100, P.B.y / 100, 0], mA = mVec(P.A), mB = mVec(P.B), r = M.sub(cB, cA), d = M.norm(r), F = M.dipoleForce(mA, mB, r), Fm = M.norm(F), rad = M.dot(F, r) / d;
		var tqB = M.dipoleTorque(mA, mB, r)[2], tqA = M.dipoleTorque(mB, mA, M.scl(r, -1))[2], U = M.dipoleEnergy(mA, mB, r), Bm = Bxy((P.A.x + P.B.x) / 2, (P.A.y + P.B.y) / 2);
		ro($("mv-p-ro"), [
			{ l: "Distance between centres", v: sg(d * 100, 2) + " cm", s: d * 100 < 2 * LEN ? "close: the point-dipole numbers are only rough" : "" },
			{ l: "Force on B", v: sg(Fm, 3) + " N", s: "≈ " + sg(Fm / 9.81 * 1000, 1) + " g weight" },
			Math.abs(rad) < 0.02 * Fm ? { l: "Along the joining line", v: "neither", s: "the force is sideways" } : { l: "Along the joining line", v: rad < 0 ? "attract" : "repel", s: sg(Math.abs(rad), 3) + " N", c: rad < 0 ? "is-good" : "is-bad" },
			{ l: "Twist on B / on A", v: sg(tqB * 1000, 2) + " / " + sg(tqA * 1000, 2) + " mN·m", s: "+ = anticlockwise" },
			{ l: "Energy U = −m·B", v: sg(U * 1000, 2) + " mJ", s: "lower = what the magnets prefer" },
			{ l: "Field halfway between", v: tesla(Math.hypot(Bm[0], Bm[1])) }
		]);
	}
	function pResize() { pSz = fitStage(pStage, function (w) { return w < 600 ? w * 0.9 : clamp(w * 0.56, 300, 640); }); P.view = pSz.W < 600 ? 18 : 30; P.cache = null; pDraw(); }
	function pGeo() { var W = pSz.W, Hh = pSz.H, s = W / P.view; return { s: s, X: function (x) { return W / 2 + x * s; }, Y: function (y) { return Hh / 2 - y * s; }, wx: function (px) { return (px - W / 2) / s; }, wy: function (py) { return (Hh / 2 - py) / s; }, xr: W / 2 / s, yr: Hh / 2 / s }; }
	function pCompute() {
		var g = pGeo(), W = pSz.W, Hh = pSz.H, step = 5, gw = Math.ceil(W / step), gh = Math.ceil(Hh / step), off = document.createElement("canvas"); off.width = gw; off.height = gh;
		var oc = off.getContext("2d"), img = oc.createImageData(gw, gh), d = img.data;
		for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) { var x = g.wx((i + 0.5) * step), y = g.wy((j + 0.5) * step), b = Bxy(x, y), m = Math.hypot(b[0], b[1]), t = clamp((Math.log10(m || 1e-12) + 4.5) / 3.5, 0, 1), o = 4 * (j * gw + i);
			d[o] = Math.round(10 + 245 * Math.pow(t, 1.4)); d[o + 1] = Math.round(14 + 140 * Math.pow(t, 2.2)); d[o + 2] = Math.round(30 + 60 * t * (1 - t) * 2); d[o + 3] = 255; }
		oc.putImageData(img, 0, 0);
		var lines = [], mags = [P.A, P.B], box = [-g.xr - 1, g.xr + 1, -g.yr - 1, g.yr + 1];
		mags.forEach(function (o) {
			for (var k = 0; k < 13; k++) { var al = (-72 + 144 * k / 12) * DEG, sx = o.x + 1.65 * Math.cos(o.t * DEG + al), sy = o.y + 1.65 * Math.sin(o.t * DEG + al); if (mags.some(function (q2) { return inMag(q2, sx, sy, 0.1); })) continue;
				var sl = M.streamline(function (x, y) { return Bxy(x, y); }, sx, sy, { h: 0.12, n: 1100, box: box, stop: function (x, y) { return inMag(P.A, x, y, 0.05) || inMag(P.B, x, y, 0.05); } });
				lines.push(sl.pts); } });
		P.cache = { map: off, lines: lines };
	}
	function drawMagnet(c, g, o, sel) {
		var ct = Math.cos(o.t * DEG), st = Math.sin(o.t * DEG), hl = LEN / 2, hw = WID / 2;
		function pt(u, v) { return [g.X(o.x + u * ct - v * st), g.Y(o.y + u * st + v * ct)]; }
		[[0, hl, COL.north], [-hl, 0, COL.south]].forEach(function (half) { var a = pt(half[0], -hw), b = pt(half[1], -hw), cc = pt(half[1], hw), dd = pt(half[0], hw); c.fillStyle = half[2]; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cc[0], cc[1]); c.lineTo(dd[0], dd[1]); c.closePath(); c.fill(); });
		var a0 = pt(-hl, -hw), b0 = pt(hl, -hw), c0 = pt(hl, hw), d0 = pt(-hl, hw); c.strokeStyle = sel ? "#ffd166" : "rgba(255,255,255,0.7)"; c.lineWidth = sel ? 2.5 : 1.2; c.beginPath(); c.moveTo(a0[0], a0[1]); c.lineTo(b0[0], b0[1]); c.lineTo(c0[0], c0[1]); c.lineTo(d0[0], d0[1]); c.closePath(); c.stroke();
		var n = pt(hl * 0.55, 0), s = pt(-hl * 0.55, 0), fs = Math.max(10, Math.min(16, g.s * 0.8)); txt(c, "N", n[0], n[1] + 1, { b: 1, size: fs, col: "#fff", al: "center", bl: "middle" }); txt(c, "S", s[0], s[1] + 1, { b: 1, size: fs, col: "#fff", al: "center", bl: "middle" });
		var h1 = pt(hl, 0), h2 = pt(hl + 0.85, 0); c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(h1[0], h1[1]); c.lineTo(h2[0], h2[1]); c.stroke(); c.fillStyle = sel ? "#ffd166" : "#cbd5e1"; c.beginPath(); c.arc(h2[0], h2[1], Math.max(5, 0.32 * g.s), 0, TAU); c.fill();
		var lab = pt(0, hw + 0.7); txt(c, o === P.A ? "A" : "B", lab[0], lab[1], { b: 1, size: 13, col: "#e8ecf5", al: "center", bl: "middle" });
	}
	function pDraw() {
		if (!pSz) return; var c = pSz.c, W = pSz.W, Hh = pSz.H, g = pGeo(); if (!P.cache) pCompute();
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		if (P.map) { c.imageSmoothingEnabled = true; c.drawImage(P.cache.map, 0, 0, W, Hh); }
		if (P.cells) {   /* Maxwell's vortices: tubes along the field, spin stripes, pull along and push across, stronger where B^2 is bigger */
			var sp = 1.7;
			for (var y = -g.yr + sp / 2; y < g.yr; y += sp) for (var x = -g.xr + sp / 2; x < g.xr; x += sp) {
				if (inMag(P.A, x, y, 0.5) || inMag(P.B, x, y, 0.5)) continue;
				var b = Bxy(x, y), m = Math.hypot(b[0], b[1]); if (!m) continue; var f = clamp((Math.log10(m) + 4) / 2.5, 0, 1); if (f < 0.08) continue;
				var th = Math.atan2(b[1], b[0]), X = g.X(x), Y = g.Y(y), len = 0.6 * sp * g.s * (1 - 0.25 * f), wid = 0.22 * sp * g.s * (0.7 + 0.8 * f);
				c.save(); c.translate(X, Y); c.rotate(-th); c.globalAlpha = 0.25 + 0.6 * f;
				c.fillStyle = "rgba(255,140,66,0.35)"; c.strokeStyle = "rgba(255,170,110,0.9)"; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, len / 2, wid / 2, 0, 0, TAU); c.fill(); c.stroke();
				for (var k = 0; k < 3; k++) { var u = ((k / 3 + P.phase * (0.3 + f)) % 1) * len - len / 2; c.beginPath(); c.moveTo(u, -wid / 2 * 0.85); c.lineTo(u + wid * 0.25, wid / 2 * 0.85); c.stroke(); }
				if (f > 0.3) { var aL = wid * 0.5; c.strokeStyle = c.fillStyle = "rgba(126,226,168,0.9)"; arrow2(c, len / 2 + aL, 0, len / 2 + 1, 0, "rgba(126,226,168,0.9)", 1.2, 4); arrow2(c, -len / 2 - aL, 0, -len / 2 - 1, 0, "rgba(126,226,168,0.9)", 1.2, 4);
					arrow2(c, 0, wid / 2, 0, wid / 2 + aL, "rgba(196,181,253,0.9)", 1.2, 4); arrow2(c, 0, -wid / 2, 0, -wid / 2 - aL, "rgba(196,181,253,0.9)", 1.2, 4); }
				c.restore();
			}
		}
		if (P.lines) {
			c.save(); c.strokeStyle = "rgba(200,225,255,0.75)"; c.lineWidth = 1.2;
			P.cache.lines.forEach(function (ln) { c.beginPath(); ln.forEach(function (p, i) { var X = g.X(p[0]), Y = g.Y(p[1]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke();
				var k = Math.floor(ln.length * 0.4); if (k > 1 && k < ln.length - 1) { var p0 = ln[k], p1 = ln[k + 1]; arrow2(c, g.X(p0[0]), g.Y(p0[1]), g.X(p0[0]) + (p1[0] - p0[0]) * g.s * 4, g.Y(p0[1]) - (p1[1] - p0[1]) * g.s * 4, "rgba(200,225,255,0.85)", 1.2, 6); } });
			c.restore();
		}
		drawMagnet(c, g, P.A, P.sel === "A"); drawMagnet(c, g, P.B, P.sel === "B");
		if (P.arr) {
			var cA = [P.A.x / 100, P.A.y / 100, 0], cB = [P.B.x / 100, P.B.y / 100, 0], F = M.dipoleForce(mVec(P.A), mVec(P.B), M.sub(cB, cA)), Fm = Math.hypot(F[0], F[1]);
			if (Fm > 1e-9) { var Lp = clamp(30 + 22 * Math.log10(Fm / 1e-3), 12, 130); [[P.B, 1], [P.A, -1]].forEach(function (o) { var X = g.X(o[0].x), Y = g.Y(o[0].y); arrow2(c, X, Y, X + o[1] * F[0] / Fm * Lp, Y - o[1] * F[1] / Fm * Lp, "#7ee2a8", 3, 11); }); }
			[[P.A, P.B], [P.B, P.A]].forEach(function (pr) { var me = pr[0], ot = pr[1], tq = M.dipoleTorque(mVec(ot), mVec(me), [(me.x - ot.x) / 100, (me.y - ot.y) / 100, 0])[2]; if (Math.abs(tq) < 1e-6) return;
				var X = g.X(me.x), Y = g.Y(me.y), R = (LEN / 2 + 0.5) * g.s, dir = tq > 0 ? -1 : 1, a0 = -me.t * DEG - 0.5, a1 = a0 + dir * 1.1; c.strokeStyle = "#f9a8d4"; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, R, a0, a1, dir < 0); c.stroke();
				var ex = X + R * Math.cos(a1), ey = Y + R * Math.sin(a1), tx = -Math.sin(a1) * dir, ty = Math.cos(a1) * dir; arrow2(c, ex - tx * 6, ey - ty * 6, ex + tx * 2, ey + ty * 2, "#f9a8d4", 2, 8); });
		}
		txt(c, "point dipoles · grid of " + P.view + " cm across · green = force, pink = twist", 10, Hh - 10, { size: 11, col: COL.dim });
	}
	/* drag / rotate magnets */
	(function () {
		var drag = null;
		function hit(px, py) { var g = pGeo(), x = g.wx(px), y = g.wy(py), res = null;
			[P.B, P.A].forEach(function (o) { if (res) return; var hx = o.x + (LEN / 2 + 0.85) * Math.cos(o.t * DEG), hy = o.y + (LEN / 2 + 0.85) * Math.sin(o.t * DEG); if (Math.hypot(x - hx, y - hy) < 0.6) res = { o: o, mode: "rot" }; });
			if (!res) [P.B, P.A].forEach(function (o) { if (!res && inMag(o, x, y, 0.2)) res = { o: o, mode: "move", dx: o.x - x, dy: o.y - y }; });
			return res; }
		pCv.addEventListener("pointerdown", function (e) { var r = pCv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top); if (!h) return; drag = h; P.sel = h.o === P.A ? "A" : "B"; try { pCv.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); pDraw(); });
		pCv.addEventListener("pointermove", function (e) { var r = pCv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, g = pGeo();
			if (!drag) { pCv.style.cursor = hit(px, py) ? "move" : "default"; return; }
			var x = g.wx(px), y = g.wy(py), o = drag.o;
			if (drag.mode === "rot") { o.t = Math.round(Math.atan2(y - o.y, x - o.x) / DEG); if (!e.shiftKey) o.t = Math.round(o.t / 5) * 5; o.t = (o.t + 360) % 360; }
			else { o.x = clamp(x + drag.dx, -g.xr + 1, g.xr - 1); o.y = clamp(y + drag.dy, -g.yr + 1, g.yr - 1); var other = o === P.A ? P.B : P.A, dd = Math.hypot(o.x - other.x, o.y - other.y); if (dd < 1.6) { var k = 1.6 / Math.max(dd, 1e-6); o.x = other.x + (o.x - other.x) * k; o.y = other.y + (o.y - other.y) * k; } }
			P.pre = null; markChips(preBox, ""); P.cache = null; pReadouts(); pDraw(); });
		function end() { if (drag) { drag = null; pChanged(); } } pCv.addEventListener("pointerup", end); pCv.addEventListener("pointercancel", end);
		pCv.addEventListener("wheel", function (e) { var r = pCv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top); if (!h) return; e.preventDefault(); h.o.t = ((h.o.t + (e.deltaY > 0 ? 5 : -5)) % 360 + 360) % 360; P.sel = h.o === P.A ? "A" : "B"; P.pre = null; markChips(preBox, ""); pChanged(); }, { passive: false });
		pCv.addEventListener("keydown", function (e) { var o = P.sel === "A" ? P.A : P.B, k = e.key;
			if (k === "1" || k === "a") P.sel = "A"; else if (k === "2" || k === "b") P.sel = "B"; else if (k === "ArrowLeft") o.x -= 0.25; else if (k === "ArrowRight") o.x += 0.25; else if (k === "ArrowUp") o.y += 0.25; else if (k === "ArrowDown") o.y -= 0.25; else if (k === "[") o.t = (o.t + 355) % 360; else if (k === "]") o.t = (o.t + 5) % 360; else if (k === "f" || k === "F") o.t = (o.t + 180) % 360; else return;
			e.preventDefault(); P.pre = null; markChips(preBox, ""); pChanged(); });
	})();

	/* ======================================================= loop / sizing ======================================================= */
	function onResize() { if (tab === "loop") { lResize(); lpResize(); } else if (tab === "cells") { cResize(); cpResize(); } else pResize(); }
	var rT; window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(onResize, 60); });
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rT); rT = setTimeout(onResize, 60); }).observe(root);
	var last = 0, roT = 0;
	function tick(dt) {
		roT += dt;
		if (tab === "loop") { lTick(dt); if (roT > 0.3 && instantMode()) { roT = 0; } }
		else if (tab === "cells") { cTick(dt); if (roT > 0.25) { roT = 0; cReadouts(); } }
		else if (P.cells) { P.phase = (P.phase + dt * 0.6) % 1; pDraw(); }
	}
	function loop(ts) { var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts; if (!document.hidden) tick(dt); requestAnimationFrame(loop); }
	/* start */
	lApplyStep(); cApply(); if (qpre && M.PAIRS.some(function (x) { return x.id === qpre; })) pPreset(qpre); else if (!(okMag(ps.A) && okMag(ps.B))) pPreset("headtail"); else { pReadouts(); pNote(); }
	setTab(tab, true);
	requestAnimationFrame(loop);
	window.MESVortexUI = { L1: L1, C: C, P: P, tick: function (ms, n) { for (var i = 0; i < (n || 1); i++) tick((ms || 16) / 1000); } };
})();
