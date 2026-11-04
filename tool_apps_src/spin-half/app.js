/* MES Spin-1/2 Lab UI: the belt (plate) trick, five pictures of "back after 720 degrees", the spin-1/2 torus, and a twisted elastic sheet.
   Maths: MESHalf (node-tested: tool_apps_src/spin-half-tests.js). State: localStorage mes-spin-half:v1; links ?tab=belt|five|torus|sheet (+ settings) */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sh"); if (!root) return;
	var M = window.MESHalf, KEY = "mes-spin-half:v1", TAU = Math.PI * 2, DEG = Math.PI / 180, PI = Math.PI;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function mi(s) { return String(s).replace(/-/g, "−"); }
	function degTxt(rad) { return Math.round(rad / DEG) + "°"; }
	var q = new URLSearchParams(location.search), saved = sget(), toastT;
	function toast(msg) { var t = $("sh-toast"); if (!t) { t = document.createElement("div"); t.id = "sh-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	function ro(box, items) { box.innerHTML = items.map(function (it) { return '<div class="sh-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function setPressed(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }
	function png(cv, name) { try { var a = document.createElement("a"); a.download = name + ".png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } }
	function badge(el, text, cls) { el.textContent = text || ""; el.className = "sh-badge" + (cls ? " " + cls : ""); }
	function copyLink(params) {
		var u = new URL(location.href); u.search = ""; u.hash = ""; for (var k in params) if (params[k] !== null && params[k] !== undefined) u.searchParams.set(k, params[k]);
		var s = u.toString(); try { history.replaceState(null, "", u); } catch (e) {}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(function () { toast("Link copied"); }, function () { toast(s); }); else toast(s);
	}
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
	Array.prototype.forEach.call(root.querySelectorAll(".sh-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".sh-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});
	var COL = { bg: "#070b14", grid: "#1c2436", axis: "#5d6a86", text: "#d6dcea", dim: "#8792aa", core: "#ff8c42", med: "#4cc9f0", good: "#7ee2a8", bad: "#ff8a8a", acc: "#e879f9" };
	function txt(c, s, x, y, o) { o = o || {}; c.font = (o.b ? "600 " : "") + (o.size || 12) + "px system-ui,sans-serif"; c.fillStyle = o.col || COL.text; c.textAlign = o.al || "left"; c.textBaseline = o.bl || "alphabetic"; c.fillText(s, x, y); }
	function arrow2(c, x0, y0, x1, y1, col, w, head) { var a = Math.atan2(y1 - y0, x1 - x0), h = head || 8; c.strokeStyle = c.fillStyle = col; c.lineWidth = w || 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - Math.cos(a) * h * 0.6, y1 - Math.sin(a) * h * 0.6); c.stroke(); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); c.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); c.closePath(); c.fill(); }
	function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
	function shadeRGB(c3, k) { return "rgb(" + Math.round(clamp(c3[0] * k, 0, 255)) + "," + Math.round(clamp(c3[1] * k, 0, 255)) + "," + Math.round(clamp(c3[2] * k, 0, 255)) + ")"; }
	function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; var f = function (n) { var k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }; return [f(0), f(8), f(4)]; }

	/* ---------- a small 3D camera (z up) with orbit, wheel and pinch zoom ---------- */
	function proj(cam, x, y, z) {
		var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), x1 = x * c - y * s, y1 = x * s + y * c, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		var up = z * cp + y1 * sp, d = y1 * cp - z * sp, f = cam.F / (cam.F + d);
		return { x: cam.cx + x1 * cam.k * f, y: cam.cy - up * cam.k * f, d: d, f: f };
	}
	function camVec(cam, v) { /* a direction in camera space: [right, up, away] */
		var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), x1 = v[0] * c - v[1] * s, y1 = v[0] * s + v[1] * c, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		return [x1, v[2] * cp + y1 * sp, y1 * cp - v[2] * sp];
	}
	var LIGHT = (function () { var l = [-0.45, 0.6, -0.66], n = Math.hypot(l[0], l[1], l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();
	function lightK(cam, nrm) { var v = camVec(cam, nrm); if (v[2] > 0) v = [-v[0], -v[1], -v[2]]; var d = v[0] * LIGHT[0] + v[1] * LIGHT[1] + v[2] * LIGHT[2], l = Math.hypot(v[0], v[1], v[2]) || 1; return 0.38 + 0.62 * Math.max(0, d / l); }
	function facesViewer(cam, nrm) { return camVec(cam, nrm)[2] < 0; }
	function orbit(cv, cam, redraw, def) {
		var pts = {}, drag = null, pinch = null;
		function count() { return Object.keys(pts).length; }
		cv.addEventListener("pointerdown", function (e) { pts[e.pointerId] = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) {}
			if (count() === 1) drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
			else if (count() === 2) { var a = Object.keys(pts).map(function (k) { return pts[k]; }); pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z: cam.zoom }; drag = null; } });
		cv.addEventListener("pointermove", function (e) { if (!pts[e.pointerId]) return; pts[e.pointerId] = { x: e.clientX, y: e.clientY };
			if (pinch && count() >= 2) { var a = Object.keys(pts).map(function (k) { return pts[k]; }); cam.zoom = clamp(pinch.z * Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / pinch.d, 0.4, 4); redraw(); }
			else if (drag) { cam.yaw = drag.yaw + (e.clientX - drag.x) * 0.008; cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.006, -1.45, 1.45); redraw(); } });
		function end(e) { delete pts[e.pointerId]; if (count() < 2) pinch = null; if (!count()) drag = null; }
		cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.4, 4); redraw(); }, { passive: false });
		cv.addEventListener("keydown", function (e) { var k = e.key; if (k === "ArrowLeft") cam.yaw -= 0.08; else if (k === "ArrowRight") cam.yaw += 0.08; else if (k === "ArrowUp") cam.pitch = clamp(cam.pitch + 0.06, -1.45, 1.45); else if (k === "ArrowDown") cam.pitch = clamp(cam.pitch - 0.06, -1.45, 1.45); else if (k === "+" || k === "=") cam.zoom = clamp(cam.zoom * 1.1, 0.4, 4); else if (k === "-") cam.zoom = clamp(cam.zoom / 1.1, 0.4, 4); else return; e.preventDefault(); redraw(); });
		return function reset() { cam.yaw = def.yaw; cam.pitch = def.pitch; cam.zoom = 1; redraw(); };
	}
	/* a shaded ball with marks painted on it, turned by quaternion qb */
	function drawBall(c, cam, R, qb, col) {
		var P = proj(cam, 0, 0, 0), r = R * cam.k * P.f, base = rgb(col || "#c084fc");
		var g = c.createRadialGradient(P.x - r * 0.35, P.y - r * 0.4, r * 0.1, P.x, P.y, r);
		g.addColorStop(0, shadeRGB(base, 1.45)); g.addColorStop(0.6, shadeRGB(base, 0.85)); g.addColorStop(1, shadeRGB(base, 0.35));
		c.fillStyle = g; c.beginPath(); c.arc(P.x, P.y, r, 0, TAU); c.fill();
		/* painted marks: an equator band and a meridian, plus a dot, front half only */
		function curve(fn, col2, w) { c.strokeStyle = col2; c.lineWidth = w; c.beginPath(); var on = false; for (var i = 0; i <= 72; i++) { var t = i / 72 * TAU, v = M.qrot(qb, fn(t)), p = proj(cam, v[0] * R, v[1] * R, v[2] * R); if (p.d < P.d) { if (on) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); on = true; } else on = false; } c.stroke(); }
		curve(function (t) { return [Math.cos(t), Math.sin(t), 0]; }, "rgba(255,255,255,0.75)", 2);
		curve(function (t) { return [Math.cos(t), 0, Math.sin(t)]; }, "rgba(20,10,40,0.65)", 2);
		var dv = M.qrot(qb, [1, 0, 0]), dp = proj(cam, dv[0] * R, dv[1] * R, dv[2] * R);
		if (dp.d < P.d) { c.fillStyle = "#fde047"; c.beginPath(); c.arc(dp.x, dp.y, Math.max(3, r * 0.16), 0, TAU); c.fill(); c.strokeStyle = "#422006"; c.lineWidth = 1; c.stroke(); }
	}

	/* ======================================================= tabs ======================================================= */
	var TABS = /^(belt|five|torus|sheet)$/;
	var tab = TABS.test(q.get("tab") || "") ? q.get("tab") : (TABS.test(saved.tab || "") ? saved.tab : "belt");
	function setTab(t, init) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init) { sset({ tab: t }); try { var u = new URL(location.href); u.search = t === "belt" ? "" : "?tab=" + t; history.replaceState(null, "", u); } catch (e) {} }
		setTimeout(onResize, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function slider(id, get, set, fmt) { var el = $(id), out = $(id + "-v"); el.value = get(); var show = function () { if (out) out.textContent = fmt(Number(el.value)); }; el.oninput = function () { set(Number(el.value)); show(); }; show(); return { el: el, show: show, set: function (v) { el.value = v; show(); } }; }
	function playBtn(btn, on) { btn.setAttribute("aria-pressed", on ? "true" : "false"); btn.textContent = on ? "❚❚ Pause" : "▶ Play"; }
	var fromLink = function (tabName) { return q.get("tab") === tabName; };

	/* ======================================================= 1. BELT TRICK ======================================================= */
	var bs = saved.b || {};
	var B = { mode: bs.mode === "anti" ? "anti" : "twist", th: 0, run: false, sp: num(bs.sp, 0.25, 4, 1), rib: num(bs.rib, 1, 30, 4), ax: /^(z|x|y|tilt)$/.test(bs.ax || "") ? bs.ax : "z",
		auto: bs.auto !== false, shells: !!bs.sh, un: null, hold: 0, target: null, msg: "" };
	if (fromLink("belt")) { B.rib = [1, 2, 4, 6, 30].indexOf(Number(q.get("rib"))) >= 0 ? Number(q.get("rib")) : B.rib; if (/^(z|x|y|tilt)$/.test(q.get("ax") || "")) B.ax = q.get("ax"); if (q.get("m") === "anti" || q.get("m") === "twist") B.mode = q.get("m"); B.th = num(q.get("a"), 0, 720, 0) * DEG; }
	if ([1, 2, 4, 6, 30].indexOf(B.rib) < 0) B.rib = 4;
	var bStage = $("sh-b-stage"), bCv = $("sh-b-c"), bG, bCam = { yaw: 0.65, pitch: 0.38, F: 18, k: 1, cx: 0, cy: 0, zoom: 1 };
	var bReset = orbit(bCv, bCam, function () { if (!B.run) bDraw(); }, { yaw: 0.65, pitch: 0.38 });
	function bSave() { sset({ b: { mode: B.mode, sp: B.sp, rib: B.rib, ax: B.ax, auto: B.auto, sh: B.shells } }); }
	function bAxis() { return M.AXES[B.ax]; }
	function bState() { return B.un ? { mode: "untangle", s: B.un.s, half: B.un.half } : { mode: B.mode, th: B.th }; }
	var bThS = slider("sh-b-th", function () { return Math.round(B.th / DEG); }, function (v) { B.un = null; B.target = null; B.msg = ""; B.th = v * DEG; setRun(false); bDraw(); bReadouts(); }, function (v) { return v + "°"; });
	slider("sh-b-sp", function () { return B.sp; }, function (v) { B.sp = v; bSave(); }, function (v) { return v + "×"; });
	var ribSel = $("sh-b-rib"), axSel = $("sh-b-ax"); ribSel.value = String(B.rib); axSel.value = B.ax;
	ribSel.onchange = function () { B.rib = Number(ribSel.value); bSave(); bDraw(); };
	axSel.onchange = function () { B.ax = axSel.value; bSave(); bDraw(); bReadouts(); };
	$("sh-b-auto").checked = B.auto; $("sh-b-auto").onchange = function () { B.auto = this.checked; bSave(); };
	$("sh-b-shell").checked = B.shells; $("sh-b-shell").onchange = function () { B.shells = this.checked; bSave(); bDraw(); };
	var modeBtns = Array.prototype.slice.call(root.querySelectorAll("[data-bmode]"));
	function setMode(m) { B.mode = m; B.un = null; B.target = null; if (m === "twist") B.th = clamp(M.wrap720(B.th / DEG), 0, 720) * DEG; setPressed(modeBtns, modeBtns.filter(function (b) { return b.dataset.bmode === m; })[0]); $("sh-b-un").disabled = m !== "twist"; $("sh-b-auto").disabled = m !== "twist"; bSave(); bDraw(); bReadouts(); }
	modeBtns.forEach(function (b) { b.onclick = function () { setMode(b.dataset.bmode); }; });
	function setRun(on) { B.run = on; playBtn($("sh-b-play"), on); }
	$("sh-b-play").onclick = function () { if (!B.run && B.mode === "twist" && !B.un && B.th >= 4 * PI - 1e-6) { B.th = 0; } B.target = null; setRun(!B.run); };
	$("sh-b-zero").onclick = function () { B.th = 0; B.un = null; B.target = null; B.msg = ""; setRun(false); bThS.set(0); bDraw(); bReadouts(); };
	$("sh-b-view").onclick = bReset;
	$("sh-b-png").onclick = function () { png(bCv, "belt-trick"); };
	function startUntangle(half) { B.un = { s: 0, half: !!half }; B.hold = 0; B.msg = ""; if (!B.run) setRun(true); }
	$("sh-b-un").onclick = function () {
		if (B.mode !== "twist") return;
		var d = B.th / DEG;
		if (Math.abs(d - 720) < 2) { B.th = 4 * PI; startUntangle(false); }
		else if (Math.abs(d - 360) < 2) { B.th = 2 * PI; startUntangle(true); }
		else if (d < 1) toast("Nothing to untangle: the ribbons are already straight");
		else toast("Turn the ball to 720° first (or to 360°, to see why that one fails)");
	};
	var B_PRE = [
		{ name: "Turn once (360°)", go: function () { setMode("twist"); B.th = 0; B.target = 2 * PI; setRun(true); } },
		{ name: "Turn twice (720°)", go: function () { setMode("twist"); B.th = 0; B.target = 4 * PI; setRun(true); } },
		{ name: "Untangle at 720°", go: function () { setMode("twist"); B.th = 4 * PI; startUntangle(false); } },
		{ name: "Try untangling at 360°", go: function () { setMode("twist"); B.th = 2 * PI; startUntangle(true); } },
		{ name: "Keep turning, never tangle", go: function () { setMode("anti"); B.th = 0; setRun(true); } }
	];
	B_PRE.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.name; b.onclick = function () { p.go(); bThS.set(Math.round(B.th / DEG)); bReadouts(); }; $("sh-b-pre").appendChild(b); });
	$("sh-b-link").onclick = function () { copyLink({ tab: "belt", rib: B.rib, ax: B.ax, m: B.mode, a: Math.round(M.wrap720(B.th / DEG)) }); };
	var RIBCOL = ["#f97316", "#22d3ee", "#a3e635", "#f472b6", "#facc15", "#818cf8"];
	function bResize() { bG = fitStage(bStage, function (w) { return clamp(w * 0.62, 340, 680); }); bDraw(); }
	function bDraw() {
		if (!bG) return; var c = bG.c, W = bG.W, H = bG.H, cam = bCam, rb = 1, rw = 4;
		cam.k = Math.min(W, H) / (2 * rw * 1.14) * cam.zoom; cam.cx = W / 2; cam.cy = H / 2 + 6;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var n = bAxis(), p = M.perp(n), st = bState(), sheet = B.rib >= 30, K = sheet ? 26 : 40, hw = sheet ? 0.13 : 0.3;
		/* the wall: a faint sphere */
		var C0 = proj(cam, 0, 0, 0), wr = rw * cam.k * C0.f;
		var g = c.createRadialGradient(C0.x, C0.y, wr * 0.2, C0.x, C0.y, wr); g.addColorStop(0, "rgba(120,90,180,0.02)"); g.addColorStop(1, "rgba(160,120,230,0.13)");
		c.fillStyle = g; c.beginPath(); c.arc(C0.x, C0.y, wr, 0, TAU); c.fill(); c.strokeStyle = "rgba(190,160,255,0.35)"; c.lineWidth = 1; c.stroke();
		[[0, 0, 1], [1, 0, 0], [0, 1, 0]].forEach(function (ax) { var a = M.perp(ax), b = M.cross(ax, a); c.strokeStyle = "rgba(190,160,255,0.12)"; c.beginPath(); for (var i = 0; i <= 64; i++) { var t = i / 64 * TAU, v = [rw * (a[0] * Math.cos(t) + b[0] * Math.sin(t)), rw * (a[1] * Math.cos(t) + b[1] * Math.sin(t)), rw * (a[2] * Math.cos(t) + b[2] * Math.sin(t))], P = proj(cam, v[0], v[1], v[2]); if (i) c.lineTo(P.x, P.y); else c.moveTo(P.x, P.y); } c.stroke(); });
		/* the turning shells (optional): the image of one great circle on a few shells */
		if (B.shells) [0.25, 0.5, 0.75].forEach(function (r) { var qs = M.belt(r, st, n, p), rho = rb + r * (rw - rb), a = p, b = M.cross(n, p); c.strokeStyle = "rgba(250,204,21," + (0.55 - r * 0.4) + ")"; c.setLineDash([4, 4]); c.lineWidth = 1.2; c.beginPath(); for (var i = 0; i <= 64; i++) { var t = i / 64 * TAU, v = M.qrot(qs, [rho * (a[0] * Math.cos(t) + n[0] * Math.sin(t)), rho * (a[1] * Math.cos(t) + n[1] * Math.sin(t)), rho * (a[2] * Math.cos(t) + n[2] * Math.sin(t))]), P = proj(cam, v[0], v[1], v[2]); if (i) c.lineTo(P.x, P.y); else c.moveTo(P.x, P.y); } c.stroke(); c.setLineDash([]); void b; });
		/* ribbons as depth-sorted quads */
		var items = [], dirs = M.ribbonDirs(B.rib);
		dirs.forEach(function (d, i) {
			var pts = M.strand(d, st, n, { steps: K, rBall: rb, rWall: rw }), base = sheet ? hsl2rgb(i * 360 / dirs.length, 0.8, 0.58) : rgb(RIBCOL[i % RIBCOL.length]), back = [base[0] * 0.45 + 70, base[1] * 0.45 + 70, base[2] * 0.45 + 70];
			for (var j = 0; j < K; j++) {
				var a = pts[j], b = pts[j + 1], A = [a.c[0] + a.w[0] * hw, a.c[1] + a.w[1] * hw, a.c[2] + a.w[2] * hw], Bq = [a.c[0] - a.w[0] * hw, a.c[1] - a.w[1] * hw, a.c[2] - a.w[2] * hw],
					Cq = [b.c[0] - b.w[0] * hw, b.c[1] - b.w[1] * hw, b.c[2] - b.w[2] * hw], Dq = [b.c[0] + b.w[0] * hw, b.c[1] + b.w[1] * hw, b.c[2] + b.w[2] * hw];
				var P = [A, Bq, Cq, Dq].map(function (v) { return proj(cam, v[0], v[1], v[2]); }), nrm = M.cross([b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]], a.w);
				var front = facesViewer(cam, nrm), k = lightK(cam, nrm);
				items.push({ d: (P[0].d + P[1].d + P[2].d + P[3].d) / 4, q: P, fill: shadeRGB(front ? base : back, k), edge: j === 0 || j === K - 1 });
			}
			var wp = proj(cam, d[0] * rw, d[1] * rw, d[2] * rw); items.push({ d: wp.d - 0.01, dot: wp });
		});
		items.push({ d: C0.d, ball: true });
		items.sort(function (a, b) { return b.d - a.d; });
		var qb = M.belt(0, st, n, p);
		items.forEach(function (it) {
			if (it.ball) { drawBall(c, cam, rb, qb, "#c084fc"); return; }
			if (it.dot) { c.fillStyle = "#e9d5ff"; c.beginPath(); c.arc(it.dot.x, it.dot.y, 3.2 * it.dot.f, 0, TAU); c.fill(); return; }
			c.fillStyle = it.fill; c.strokeStyle = it.fill; c.lineWidth = 0.8; c.beginPath(); c.moveTo(it.q[0].x, it.q[0].y); for (var i = 1; i < 4; i++) c.lineTo(it.q[i].x, it.q[i].y); c.closePath(); c.fill(); c.stroke();
		});
		/* the turning axis */
		var e1 = proj(cam, n[0] * 1.9, n[1] * 1.9, n[2] * 1.9), e0 = proj(cam, -n[0] * 1.6, -n[1] * 1.6, -n[2] * 1.6);
		c.save(); c.globalAlpha = 0.8; c.setLineDash([5, 4]); c.strokeStyle = "#fde68a"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(e0.x, e0.y); c.lineTo(e1.x, e1.y); c.stroke(); c.setLineDash([]); arrow2(c, (e0.x + e1.x * 3) / 4, (e0.y + e1.y * 3) / 4, e1.x, e1.y, "#fde68a", 1.6, 8); c.restore();
		/* corner: core angle dial */
		var dr = Math.min(34, W * 0.07), dx = 14 + dr, dy = 14 + dr, ang = B.un ? (B.un.half ? 2 * PI : 4 * PI) : B.th;
		c.fillStyle = "rgba(10,13,20,0.8)"; c.beginPath(); c.arc(dx, dy, dr + 6, 0, TAU); c.fill();
		c.strokeStyle = "#3a4560"; c.lineWidth = 3; c.beginPath(); c.arc(dx, dy, dr, 0, TAU); c.stroke();
		c.strokeStyle = COL.core; c.lineWidth = 3; c.beginPath(); c.arc(dx, dy, dr, -PI / 2, -PI / 2 + Math.min(ang, 2 * PI)); c.stroke();
		if (ang > 2 * PI) { c.strokeStyle = COL.acc; c.beginPath(); c.arc(dx, dy, dr - 5, -PI / 2, -PI / 2 + Math.min(ang - 2 * PI, 2 * PI)); c.stroke(); }
		txt(c, Math.round(ang / DEG) + "°", dx, dy + 1, { al: "center", bl: "middle", b: 1, size: 12 });
	}
	function bReadouts() {
		var n = bAxis(), st = bState(), qb = M.belt(0, st, n), stored = M.turnsStored(st, n, 160), lookSame = Math.abs(qb[0]) > 1 - 1e-6, ribHome = stored < 0.01;
		var angTxt = B.un ? (B.un.half ? "360°, then the move" : "720° (now held still)") : (B.mode === "anti" ? Math.round(B.th / DEG) + "° (" + (B.th / TAU).toFixed(2) + " turns)" : Math.round(B.th / DEG) + "°");
		var can = lookSame ? (qb[0] > 0 ? "Yes" : "No") : "–";
		ro($("sh-b-ro"), [
			{ l: "Ball turned", v: angTxt },
			{ l: "q of the ball (followed in from the wall)", v: M.qText(qb, 2), s: "q = cos(θ/2) + sin(θ/2)·n", c: lookSame ? (qb[0] > 0 ? "is-good" : "is-bad") : "" },
			{ l: "Ball looks as at the start?", v: lookSame ? "Yes" : "No", s: "the ball alone cannot tell q from −q" },
			{ l: "Ribbons as at the start?", v: ribHome ? "Yes" : "No", c: ribHome ? "is-good" : "" },
			{ l: "Untangle with the ball held still?", v: can, s: lookSame ? (qb[0] > 0 ? "q = +1: yes" : "q = −1: impossible") : "ask at 0°, 360° or 720°", c: can === "Yes" ? "is-good" : can === "No" ? "is-bad" : "" },
			{ l: "Turning stored in the ribbons", v: stored.toFixed(2) + " turns", s: "wall to ball, end to end" }
		]);
		var b = $("sh-b-badge"), d = B.th / DEG;
		if (B.un) badge(b, B.un.half ? "Undoing 360° the same way: watch the ball, it has to turn" : "Untangling: the ball is held still", B.un.half ? "is-bad" : "is-good");
		else if (B.msg) badge(b, B.msg, "is-good");
		else if (B.mode === "anti") badge(b, "Ball turning on and on: the ribbons never pile up", "");
		else if (Math.abs(d - 360) < 1) badge(b, "360°: ball looks the same, ribbons tangled (q = −1)", "is-bad");
		else if (Math.abs(d - 720) < 1) badge(b, "720°: q = +1, so the ribbons can be undone: press Untangle", "is-good");
		else badge(b, "", "");
		var note = $("sh-b-note");
		note.textContent = B.mode === "anti" ? "Every shell turns by A(r, θ) = R_m(r)(θ/2)·R_n(θ/2). At 360° the ribbons hold one full turn, swung round the ball; at 720° every shell is home again, and the ball can keep going." : "Each shell turns by θ·(1 − r): all of the ball's turn at the ball, none at the wall.";
	}
	function bTick(dt) {
		if (!B.run) return;
		if (B.un) {
			if (B.hold > 0) { B.hold -= dt; return; }
			B.un.s += dt * B.sp * 0.32;
			if (B.un.s >= 1) { var half = B.un.half; B.un = null; B.th = 0; B.msg = half ? "Done, but only because the ball turned an extra full turn" : "Back to the start, after two full turns of the ball"; bThS.set(0); B.hold = 1.2;
				if (!(B.auto && !half)) setRun(false); }
			return;
		}
		if (B.hold > 0) { B.hold -= dt; if (B.hold <= 0) B.msg = ""; return; }
		var w = B.sp * 100 * DEG; B.msg = "";
		if (B.mode === "anti") { B.th = (B.th + dt * w) % (4 * PI); bThS.set(Math.round(B.th / DEG)); return; }
		var stop = B.target != null ? B.target : 4 * PI;
		B.th = Math.min(stop, B.th + dt * w); bThS.set(Math.round(B.th / DEG));
		if (B.th >= stop - 1e-9) {
			if (B.target != null) { B.target = null; setRun(false); }
			else if (B.auto) { B.un = { s: 0, half: false }; B.hold = 0.9; }
			else setRun(false);
		}
	}

	/* ======================================================= 2. FIVE WAYS ======================================================= */
	var fs = saved.f || {};
	var F = { w: num(fs.w, 1, 5, 1), th: 0, run: false, sp: num(fs.sp, 0.25, 4, 1) };
	if (fromLink("five")) { F.w = num(q.get("w"), 1, 5, F.w); F.th = num(q.get("a"), 0, 720, 0) * DEG; }
	F.w = Math.round(F.w);
	var SCEN = [
		{ name: "1. A core tied to the medium", tag: "model", text: "A core (orange arrow) is tied to a fixed frame by elastic threads. When the core turns, each thread turns a little less the further out it is, so the ring of medium halfway out (blue marker) turns by θ/2. After one turn the core is home but the halfway ring is upside down and the threads are wound once. After two turns the threads hold two winds, which, in 3D, can be slipped off over the core (see the Belt trick tab)." },
		{ name: "2. A wave that closes after two laps", tag: "est", text: "A wave runs round a ring, but its pattern only repeats after going round twice: the bump at angle φ is cos(φ/2). The dot follows the core's angle. After one lap it sits on the inner track, on the opposite side of its starting height; only after the second lap is it back on top. A spinor's wave behaves this way: one turn gives it a minus sign." },
		{ name: "3. Swinging along a Möbius band", tag: "est", text: "Carry a direction (the blue arrow, across the band) once round a Möbius band and it comes back pointing the other way, because the band has a half twist. Carry it round again and it is home. The arrow's angle to the start is half of the distance travelled: θ/2." },
		{ name: "4. A ring of beads, spinor pairs", tag: "est", text: "The ring turns by θ; each bead's arrow turns by θ/2. So every bead's arrow only means something up to a sign: a spinor is really a pair ±ψ. The marked bead comes back to its place after one turn with its arrow reversed (it has swapped with its partner), and after two turns with its arrow as it was." },
		{ name: "5. An elastic solid around a turning core", tag: "model", text: "A grid drawn in an elastic solid; the core turns and drags the solid, which is held fixed at the edge (the smooth profile of the Twisted sheet tab). The circle where the solid turns half as much as the core carries the blue marker at θ/2. In a flat 2D picture the grid can never relax; in 3D, after 720°, it can (Twisted sheet tab). A core-in-elastic-medium particle is Chantal Roth's model, not standard physics." }
	];
	var fPreBtns = SCEN.map(function (s, i) { var b = document.createElement("button"); b.type = "button"; b.textContent = s.name; b.setAttribute("aria-pressed", "false"); b.onclick = function () { F.w = i + 1; fApply(); }; $("sh-f-pre").appendChild(b); return b; });
	function fSave() { sset({ f: { w: F.w, sp: F.sp } }); }
	function fApply() { setPressed(fPreBtns, fPreBtns[F.w - 1]); var s = SCEN[F.w - 1]; $("sh-f-note").innerHTML = "<h4>" + esc(s.name) + '<span class="sh-tag ' + (s.tag === "model" ? "sh-tag--model\">a model" : "sh-tag--est\">standard maths") + "</span></h4><p>" + esc(s.text) + "</p>"; fSave(); fDraw(); gDraw(); fReadouts(); }
	var fThS = slider("sh-f-th", function () { return Math.round(F.th / DEG); }, function (v) { F.th = v * DEG; fRun(false); fDraw(); gDraw(); fReadouts(); }, function (v) { return v + "°"; });
	slider("sh-f-sp", function () { return F.sp; }, function (v) { F.sp = v; fSave(); }, function (v) { return v + "×"; });
	function fRun(on) { F.run = on; playBtn($("sh-f-play"), on); }
	$("sh-f-play").onclick = function () { fRun(!F.run); };
	$("sh-f-zero").onclick = function () { F.th = 0; fRun(false); fThS.set(0); fDraw(); gDraw(); fReadouts(); };
	$("sh-f-png").onclick = function () { png($("sh-f-c"), "spin-half-five-ways"); };
	$("sh-f-link").onclick = function () { copyLink({ tab: "five", w: F.w, a: Math.round(F.th / DEG) }); };
	var fStage = $("sh-f-stage"), gStage = $("sh-g-stage"), fG, gG, mCam = { yaw: 0.35, pitch: 0.75, F: 9, k: 1, cx: 0, cy: 0, zoom: 1 };
	function fResize() { fG = fitStage(fStage, function (w) { return clamp(w * 0.55, 300, 520); }); gG = fitStage(gStage, function (w) { return w >= 640 ? 230 : 400; }); fDraw(); gDraw(); }
	function scr(cx, cy, rad, ang) { return [cx + rad * Math.cos(ang), cy - rad * Math.sin(ang)]; } /* maths angle (counter-clockwise) on screen */
	function coreDisk(c, cx, cy, r, th) { c.fillStyle = "#3b1d0e"; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.strokeStyle = COL.core; c.lineWidth = 2; c.stroke(); var e = scr(cx, cy, r * 0.92, th); arrow2(c, cx, cy, e[0], e[1], COL.core, 3, 9); }
	function fDraw() {
		if (!fG) return; var c = fG.c, W = fG.W, H = fG.H, th = F.th, cx = W / 2, cy = H / 2 + 8, s = Math.min(W, H) * 0.42;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var w = F.w, i, j;
		if (w === 1) {
			c.strokeStyle = "#475170"; c.lineWidth = 7; c.beginPath(); c.arc(cx, cy, s, 0, TAU); c.stroke();
			var rc = s * 0.22, nT = 16; s *= 0.98;
			for (j = 0; j < nT; j++) { var a0 = j / nT * TAU; c.strokeStyle = "hsla(" + (j * 360 / nT) + ",70%,65%,0.85)"; c.lineWidth = 1.6; c.beginPath();
				for (i = 0; i <= 50; i++) { var r = i / 50, ang = a0 + th * (1 - r), rad = rc + r * (s * 0.97 - rc); var P = scr(cx, cy, rad, ang); if (i) c.lineTo(P[0], P[1]); else c.moveTo(P[0], P[1]); } c.stroke(); }
			var rm = (rc + s * 0.97) / 2; c.setLineDash([5, 5]); c.strokeStyle = "rgba(76,201,240,0.7)"; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, rm, 0, TAU); c.stroke(); c.setLineDash([]);
			var mk = scr(cx, cy, rm, th / 2); c.fillStyle = COL.med; c.beginPath(); c.arc(mk[0], mk[1], 7, 0, TAU); c.fill();
			coreDisk(c, cx, cy, rc, th);
			txt(c, "grey ring: fixed frame · blue: medium halfway out, turned θ/2", 12, H - 12, { col: COL.med, size: 11 });
		} else if (w === 2) {
			var Rr = s * 0.66, A = s * 0.24;
			c.setLineDash([4, 5]); c.strokeStyle = "#3a4560"; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, Rr, 0, TAU); c.stroke(); c.setLineDash([]);
			for (var lap = 0; lap < 2; lap++) { c.strokeStyle = lap ? "#c084fc" : "#fb923c"; c.lineWidth = 2.4; c.beginPath(); for (i = 0; i <= 180; i++) { var ph = (lap + i / 180) * TAU, P2 = scr(cx, cy, Rr + A * Math.cos(ph / 2), ph); if (i) c.lineTo(P2[0], P2[1]); else c.moveTo(P2[0], P2[1]); } c.stroke(); }
			var ph0 = th % (4 * PI), Pm = scr(cx, cy, Rr + A * Math.cos(ph0 / 2), ph0), Pb = scr(cx, cy, Rr, ph0);
			c.strokeStyle = COL.med; c.lineWidth = 2; c.beginPath(); c.moveTo(Pb[0], Pb[1]); c.lineTo(Pm[0], Pm[1]); c.stroke();
			c.fillStyle = COL.med; c.beginPath(); c.arc(Pm[0], Pm[1], 7, 0, TAU); c.fill();
			coreDisk(c, cx, cy, s * 0.2, th);
			txt(c, "lap 1", cx + Rr + A + 4, cy - 4, { col: "#fb923c", size: 11 }); txt(c, "lap 2", cx + Rr - A - 40, cy - 4, { col: "#c084fc", size: 11 });
			txt(c, "height of the wave here: cos(θ/2) = " + mi(Math.cos(th / 2).toFixed(2)), 12, H - 12, { col: COL.text, size: 12 });
		} else if (w === 3) {
			var cam = mCam; cam.k = s / 1.5; cam.cx = cx; cam.cy = cy; var Rb = 1, wb = 0.42, NU = 90, quads = [];
			for (i = 0; i < NU; i++) for (j = 0; j < 4; j++) {
				var u0 = i / NU * TAU, u1 = (i + 1) / NU * TAU, v0 = -1 + j / 2, v1 = -1 + (j + 1) / 2;
				var Q = [M.mobius(u0, v0, Rb, wb), M.mobius(u1, v0, Rb, wb), M.mobius(u1, v1, Rb, wb), M.mobius(u0, v1, Rb, wb)], PP = Q.map(function (v) { return proj(cam, v[0], v[1], v[2]); });
				var nrm = M.cross([Q[1][0] - Q[0][0], Q[1][1] - Q[0][1], Q[1][2] - Q[0][2]], [Q[3][0] - Q[0][0], Q[3][1] - Q[0][1], Q[3][2] - Q[0][2]]);
				quads.push({ d: (PP[0].d + PP[1].d + PP[2].d + PP[3].d) / 4, P: PP, f: shadeRGB(facesViewer(cam, nrm) ? [140, 120, 200] : [90, 150, 170], lightK(cam, nrm)) });
			}
			quads.sort(function (a, b) { return b.d - a.d; });
			quads.forEach(function (o) { c.fillStyle = o.f; c.strokeStyle = o.f; c.lineWidth = 0.6; c.beginPath(); c.moveTo(o.P[0].x, o.P[0].y); for (var k = 1; k < 4; k++) c.lineTo(o.P[k].x, o.P[k].y); c.closePath(); c.fill(); c.stroke(); });
			c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 1.2; c.beginPath(); for (i = 0; i <= 120; i++) { var cp = M.mobius(i / 120 * TAU, 0, Rb, wb), pp = proj(cam, cp[0], cp[1], cp[2]); if (i) c.lineTo(pp.x, pp.y); else c.moveTo(pp.x, pp.y); } c.stroke();
			var s0 = M.mobius(0, 0, Rb, wb), n0 = M.mobiusNormal(0), a0p = proj(cam, s0[0], s0[1], s0[2]), a1p = proj(cam, s0[0] + n0[0] * 0.55, s0[1] + n0[1] * 0.55, s0[2] + n0[2] * 0.55);
			c.save(); c.globalAlpha = 0.5; arrow2(c, a0p.x, a0p.y, a1p.x, a1p.y, "#e8ecf5", 2, 8); c.restore(); txt(c, "start", a1p.x + 6, a1p.y, { col: COL.dim, size: 11 });
			var cm = M.mobius(th, 0, Rb, wb), nm = M.mobiusNormal(th), b0 = proj(cam, cm[0], cm[1], cm[2]), b1 = proj(cam, cm[0] + nm[0] * 0.6, cm[1] + nm[1] * 0.6, cm[2] + nm[2] * 0.6);
			arrow2(c, b0.x, b0.y, b1.x, b1.y, COL.med, 3, 10); c.fillStyle = COL.core; c.beginPath(); c.arc(b0.x, b0.y, 6, 0, TAU); c.fill();
		} else if (w === 4) {
			var Rr2 = s * 0.68, nb = 12;
			c.strokeStyle = "#3a4560"; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, Rr2, 0, TAU); c.stroke();
			for (i = 0; i < nb; i++) {
				var phi0 = i / nb * TAU, pos = scr(cx, cy, Rr2, phi0 + th), aa = M.beadArrow(phi0, th), L = s * (i === 0 ? 0.2 : 0.13), main = i === 0;
				var e1 = [pos[0] + L * Math.cos(aa), pos[1] - L * Math.sin(aa)], e2 = [pos[0] - L * Math.cos(aa), pos[1] + L * Math.sin(aa)];
				c.save(); c.globalAlpha = main ? 0.9 : 0.35; c.setLineDash([3, 3]); arrow2(c, pos[0], pos[1], e2[0], e2[1], "#94a3b8", 1.5, 7); c.restore();
				arrow2(c, pos[0], pos[1], e1[0], e1[1], main ? COL.med : "rgba(76,201,240,0.7)", main ? 3 : 1.8, main ? 10 : 7);
				c.fillStyle = main ? "#fde047" : "#c4b5fd"; c.beginPath(); c.arc(pos[0], pos[1], main ? 8 : 5.5, 0, TAU); c.fill();
			}
			coreDisk(c, cx, cy, s * 0.2, th);
			var home = scr(cx, cy, Rr2 + 18, 0); txt(c, "start", home[0], home[1] + 4, { col: COL.dim, size: 11 });
			txt(c, "solid arrow ψ, dashed partner −ψ", 12, H - 12, { col: COL.dim, size: 11 });
		} else {
			var Rg = s * 1.0, a = s * 0.18, prof = function (rho) { return M.profile(rho, a, Rg * 0.98, "smooth"); }, N = 16, step = 2 * Rg / N;
			function dpt(x, y) { var rho = Math.hypot(x, y), ang = th * prof(rho), cs = Math.cos(ang), sn = Math.sin(ang); return [cx + x * cs - y * sn, cy - (x * sn + y * cs)]; }
			c.save(); c.beginPath(); c.arc(cx, cy, Rg, 0, TAU); c.clip();
			for (var gi = 0; gi <= N; gi++) for (var dir = 0; dir < 2; dir++) {
				var fixed = -Rg + gi * step; c.beginPath();
				for (i = 0; i <= 80; i++) { var t = -Rg + i / 80 * 2 * Rg, x = dir ? fixed : t, y = dir ? t : fixed, P3 = dpt(x, y); if (i) c.lineTo(P3[0], P3[1]); else c.moveTo(P3[0], P3[1]); }
				c.strokeStyle = dir ? "rgba(167,139,250,0.75)" : "rgba(76,201,240,0.6)"; c.lineWidth = 1.1; c.stroke();
			}
			c.restore(); c.strokeStyle = "#475170"; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, Rg, 0, TAU); c.stroke();
			var lo = a, hi = Rg; for (i = 0; i < 40; i++) { var mid = (lo + hi) / 2; if (prof(mid) > 0.5) lo = mid; else hi = mid; }
			c.setLineDash([5, 5]); c.strokeStyle = "rgba(76,201,240,0.85)"; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, lo, 0, TAU); c.stroke(); c.setLineDash([]);
			var mk2 = scr(cx, cy, lo, th / 2); c.fillStyle = COL.med; c.beginPath(); c.arc(mk2[0], mk2[1], 7, 0, TAU); c.fill();
			coreDisk(c, cx, cy, a, th);
			txt(c, "held fixed at the edge", 12, H - 12, { col: COL.dim, size: 11 });
		}
		txt(c, SCEN[w - 1].name, 12, 22, { b: 1, size: 13 });
	}
	function dial(c, x, y, r, ang, col, label, sub) {
		c.strokeStyle = "#2a3350"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
		for (var i = 0; i < 4; i++) { var t = i * PI / 2, a = scr(x, y, r, t), b = scr(x, y, r - 6, t); c.strokeStyle = "#475170"; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
		var st = scr(x, y, r + 1, 0); c.fillStyle = COL.good; c.beginPath(); c.arc(st[0], st[1], 3.5, 0, TAU); c.fill();
		var e = scr(x, y, r * 0.85, ang); arrow2(c, x, y, e[0], e[1], col, 3, 9);
		txt(c, label, x, y - r - 10, { al: "center", b: 1, size: 12, col: col }); txt(c, sub, x, y + r + 18, { al: "center", size: 11, col: COL.text });
	}
	function gDraw() {
		if (!gG) return; var c = gG.c, W = gG.W, H = gG.H, th = F.th, wide = W >= 640;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var r = wide ? Math.min(62, H * 0.28) : Math.min(56, W * 0.16), y0 = wide ? H / 2 + 4 : 100;
		var x1 = wide ? 20 + r : W * 0.27, x2 = wide ? 60 + 3 * r : W * 0.73;
		dial(c, x1, y0, r, th, COL.core, "core θ", Math.round(th / DEG) + "°  cos θ = " + mi(Math.cos(th).toFixed(2)));
		dial(c, x2, y0, r, th / 2, COL.med, "medium θ/2", Math.round(th / 2 / DEG) + "°  cos θ/2 = " + mi(Math.cos(th / 2).toFixed(2)));
		var rx = wide ? x2 + r + 70 : 46, ry0 = wide ? 10 : 200, ry = ry0 + 40, rw = W - rx - 14, rh = H - ry - 24;
		var X = function (d) { return rx + d / 720 * rw; }, Y = function (v) { return ry + rh / 2 - v * rh / 2.3; };
		c.strokeStyle = COL.grid; c.lineWidth = 1; c.font = "11px system-ui,sans-serif"; c.fillStyle = COL.dim; c.textAlign = "center"; c.textBaseline = "top";
		for (var d = 0; d <= 720; d += 180) { c.beginPath(); c.moveTo(X(d) + 0.5, ry); c.lineTo(X(d) + 0.5, ry + rh); c.stroke(); c.fillText(d + "°", X(d), ry + rh + 4); }
		c.textAlign = "right"; c.textBaseline = "middle"; [-1, 0, 1].forEach(function (v) { c.beginPath(); c.moveTo(rx, Y(v) + 0.5); c.lineTo(rx + rw, Y(v) + 0.5); c.stroke(); c.fillText(mi(String(v)), rx - 4, Y(v)); });
		c.strokeStyle = COL.axis; c.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
		[[function (t) { return Math.cos(t); }, COL.core], [function (t) { return Math.cos(t / 2); }, COL.med]].forEach(function (o) { c.strokeStyle = o[1]; c.lineWidth = 2; c.beginPath(); for (var i = 0; i <= 240; i++) { var dd = i / 240 * 720, yy = Y(o[0](dd * DEG)); if (i) c.lineTo(X(dd), yy); else c.moveTo(X(dd), yy); } c.stroke(); });
		var td = M.wrap720(th / DEG); c.strokeStyle = "rgba(255,255,255,0.5)"; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(td), ry); c.lineTo(X(td), ry + rh); c.stroke(); c.setLineDash([]);
		[[Math.cos(th), COL.core], [Math.cos(th / 2), COL.med]].forEach(function (o) { c.fillStyle = o[1]; c.beginPath(); c.arc(X(td), Y(o[0]), 5, 0, TAU); c.fill(); });
		txt(c, "Compared to the start (1 = as at the start)", rx, ry0 + 14, { b: 1, size: 11 });
		txt(c, "— cos θ (core)", rx, ry0 + 30, { size: 11, col: COL.core }); txt(c, "— cos θ/2 (medium)", rx + 100, ry0 + 30, { size: 11, col: COL.med });
	}
	function fReadouts() {
		var th = F.th, cm = M.compare(th), coreHome = Math.abs(cm.core - 1) < 1e-6, medHome = Math.abs(cm.medium - 1) < 1e-6;
		ro($("sh-f-ro"), [
			{ l: "Core turned", v: Math.round(th / DEG) + "°" }, { l: "Medium turned", v: Math.round(th / 2 / DEG) + "°", s: "half as much" },
			{ l: "Core as at the start?", v: coreHome ? "Yes" : "No", c: coreHome ? "is-good" : "" },
			{ l: "Medium as at the start?", v: medHome ? "Yes" : (Math.abs(cm.medium + 1) < 1e-6 ? "No, upside down" : "No"), c: medHome ? "is-good" : Math.abs(cm.medium + 1) < 1e-6 ? "is-bad" : "" }
		]);
	}
	function fTick(dt) { if (!F.run) return; F.th = (F.th + dt * F.sp * 90 * DEG) % (4 * PI); fThS.set(Math.round(F.th / DEG)); }

	/* ======================================================= 3. TORUS ======================================================= */
	var ts = saved.t || {};
	var T = { k: /^(half|one|threehalf)$/.test(ts.k || "") ? ts.k : "half", th: 0, run: false, sp: num(ts.sp, 0.25, 4, 1), col: ts.col !== false, all: !!ts.all };
	if (fromLink("torus")) { if (/^(half|one|threehalf)$/.test(q.get("k") || "")) T.k = q.get("k"); T.th = num(q.get("a"), 0, 720, 0) * DEG; }
	var tStage = $("sh-t-stage"), tCv = $("sh-t-c"), tG, tCam = { yaw: 0.4, pitch: 0.75, F: 16, k: 1, cx: 0, cy: 0, zoom: 1 };
	var tReset = orbit(tCv, tCam, function () { if (!T.run) tDraw(); }, { yaw: 0.4, pitch: 0.75 });
	function tSave() { sset({ t: { k: T.k, sp: T.sp, col: T.col, all: T.all } }); }
	var tThS = slider("sh-t-th", function () { return Math.round(T.th / DEG); }, function (v) { T.th = v * DEG; tRun(false); tDraw(); tReadouts(); }, function (v) { return v + "°"; });
	slider("sh-t-sp", function () { return T.sp; }, function (v) { T.sp = v; tSave(); }, function (v) { return v + "×"; });
	$("sh-t-k").value = T.k; $("sh-t-k").onchange = function () { T.k = this.value; tSave(); tDraw(); tReadouts(); };
	$("sh-t-col").checked = T.col; $("sh-t-col").onchange = function () { T.col = this.checked; tSave(); tDraw(); };
	$("sh-t-all").checked = T.all; $("sh-t-all").onchange = function () { T.all = this.checked; tSave(); tDraw(); };
	function tRun(on) { T.run = on; playBtn($("sh-t-play"), on); }
	$("sh-t-play").onclick = function () { tRun(!T.run); };
	$("sh-t-zero").onclick = function () { T.th = 0; tRun(false); tThS.set(0); tDraw(); tReadouts(); };
	$("sh-t-view").onclick = tReset; $("sh-t-png").onclick = function () { png(tCv, "spin-half-torus"); };
	$("sh-t-link").onclick = function () { copyLink({ tab: "torus", k: T.k, a: Math.round(T.th / DEG) }); };
	function tResize() { tG = fitStage(tStage, function (w) { return clamp(w * 0.6, 320, 640); }); tDraw(); }
	function tDraw() {
		if (!tG) return; var c = tG.c, W = tG.W, H = tG.H, cam = tCam, R = 3, a = 1.15, wnd = M.WINDINGS[T.k], NU = 64, NV = 26, i, j;
		cam.k = Math.min(W, H) / (2 * (R + a) * 1.12) * cam.zoom; cam.cx = W / 2; cam.cy = H / 2;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var items = [];
		for (i = 0; i < NU; i++) for (j = 0; j < NV; j++) {
			var u0 = i / NU * TAU, u1 = (i + 1) / NU * TAU, v0 = j / NV * TAU, v1 = (j + 1) / NV * TAU, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
			var Q = [M.torus(u0, v0, R, a), M.torus(u1, v0, R, a), M.torus(u1, v1, R, a), M.torus(u0, v1, R, a)], P = Q.map(function (v) { return proj(cam, v[0], v[1], v[2]); });
			var nrm = [Math.cos(vm) * Math.cos(um), Math.cos(vm) * Math.sin(um), Math.sin(vm)], k = lightK(cam, nrm), front = facesViewer(cam, nrm);
			var base = T.col ? hsl2rgb(M.torusPhase(um, vm, wnd) / DEG, 0.75, 0.55) : [120, 110, 170];
			items.push({ d: (P[0].d + P[1].d + P[2].d + P[3].d) / 4, P: P, f: shadeRGB(base, front ? k : k * 0.55) });
		}
		/* marked lines: the spin path (bright) and optionally the other lines of one colour */
		function addLine(c0, upto, col, wdt) {
			var n = 260, prev = null, U = TAU * wnd.laps;
			for (var s = 0; s <= n; s++) { var u = s / n * U, v = M.torusPathV(u, wnd) + c0, p3 = M.torus(u, v, R, a * 1.04), pp = proj(cam, p3[0], p3[1], p3[2]);
				if (prev) items.push({ d: (prev.d + pp.d) / 2 - 0.02, seg: [prev, pp], col: u <= upto ? col : "rgba(255,255,255,0.35)", w: u <= upto ? wdt : 1.4 }); prev = pp; }
		}
		if (T.all) for (j = 1; j < 6; j++) addLine(j / 6 * TAU / wnd.laps * (wnd.laps), -1, "rgba(255,255,255,0.3)", 1);
		addLine(0, T.th, "#ffffff", 3.4);
		var mu = T.th, mv = M.torusPathV(mu, wnd), mp = M.torus(mu, mv, R, a * 1.06), mP = proj(cam, mp[0], mp[1], mp[2]), cc = M.torus(mu, 0, R, 0), cP = proj(cam, cc[0], cc[1], cc[2]);
		items.push({ d: mP.d - 0.05, mark: mP, ctr: cP });
		items.sort(function (x, y) { return y.d - x.d; });
		items.forEach(function (it) {
			if (it.P) { c.fillStyle = it.f; c.strokeStyle = it.f; c.lineWidth = 0.6; c.beginPath(); c.moveTo(it.P[0].x, it.P[0].y); for (var m = 1; m < 4; m++) c.lineTo(it.P[m].x, it.P[m].y); c.closePath(); c.fill(); c.stroke(); }
			else if (it.seg) { c.strokeStyle = it.col; c.lineWidth = it.w; c.beginPath(); c.moveTo(it.seg[0].x, it.seg[0].y); c.lineTo(it.seg[1].x, it.seg[1].y); c.stroke(); }
			else { arrow2(c, it.ctr.x, it.ctr.y, it.mark.x, it.mark.y, COL.med, 2.4, 9); c.fillStyle = "#fde047"; c.beginPath(); c.arc(it.mark.x, it.mark.y, 6, 0, TAU); c.fill(); c.strokeStyle = "#422006"; c.lineWidth = 1.2; c.stroke(); }
		});
		/* the core arrow in the middle of the hole */
		var o = proj(cam, 0, 0, 0), e = proj(cam, 1.7 * Math.cos(T.th), 1.7 * Math.sin(T.th), 0);
		c.fillStyle = "#3b1d0e"; c.beginPath(); c.arc(o.x, o.y, 6, 0, TAU); c.fill(); arrow2(c, o.x, o.y, e.x, e.y, COL.core, 3, 10);
		txt(c, "core: " + Math.round(T.th / DEG) + "°", 12, 22, { b: 1, col: COL.core }); txt(c, "tube: " + Math.round(mv / DEG) + "°", 12, 40, { b: 1, col: COL.med });
	}
	function tReadouts() {
		var wnd = M.WINDINGS[T.k], mv = M.torusPathV(T.th, wnd), coreHome = Math.abs(Math.cos(T.th) - 1) < 1e-6, tubeHome = Math.abs(Math.cos(mv) - 1) < 1e-6;
		ro($("sh-t-ro"), [
			{ l: "Core turned (round the hole)", v: Math.round(T.th / DEG) + "°" }, { l: "Medium turned (round the tube)", v: Math.round(mv / DEG) + "°" },
			{ l: "Core back where it started?", v: coreHome ? "Yes" : "No", c: coreHome ? "is-good" : "" },
			{ l: "Back at the starting point of the torus?", v: coreHome && tubeHome ? "Yes" : "No", c: coreHome && tubeHome ? "is-good" : coreHome ? "is-bad" : "" },
			{ l: "The line closes after", v: M.closesAfter(wnd) * 360 + "°", s: wnd.tube + " tube turn" + (wnd.tube > 1 ? "s" : "") + " per " + wnd.laps + " core turn" + (wnd.laps > 1 ? "s" : "") }
		]);
		$("sh-t-note").textContent = wnd.name + ". The colour is the phase " + (wnd.laps === 1 ? "v − " + (wnd.tube === 1 ? "" : wnd.tube) + "u" : wnd.laps + "v − " + (wnd.tube === 1 ? "" : wnd.tube) + "u") + " (u = core angle round the hole, v = angle round the tube), so the bright line keeps one colour all the way round.";
	}
	function tTick(dt) { if (!T.run) return; T.th = (T.th + dt * T.sp * 80 * DEG) % (4 * PI); tThS.set(Math.round(T.th / DEG)); }

	/* ======================================================= 4. SHEET ======================================================= */
	var ss = saved.s || {};
	var S = { th: 0, run: false, sp: num(ss.sp, 0.25, 4, 1), R: num(ss.R, 2, 8, 4), prof: /^(smooth|inv2|linear)$/.test(ss.prof || "") ? ss.prof : "smooth", naive: !!ss.naive, fill: ss.fill !== false, win: num(ss.win, 180, 720, 720), hold: 0, target: null };
	if (fromLink("sheet")) { S.R = num(q.get("R"), 2, 8, S.R); if (/^(smooth|inv2|linear)$/.test(q.get("p") || "")) S.prof = q.get("p"); S.naive = q.get("naive") === "1"; S.th = num(q.get("a"), 0, 720, 0) * DEG; }
	var sStage = $("sh-s-stage"), sCv = $("sh-s-c"), sG, sCam = { yaw: 0.55, pitch: 0.62, F: 26, k: 1, cx: 0, cy: 0, zoom: 1 }, SN = [1, 0, 0], SP = [0, 0, 1];
	var sReset = orbit(sCv, sCam, function () { if (!S.run) sDraw(); }, { yaw: 0.55, pitch: 0.62 });
	function sSave() { sset({ s: { sp: S.sp, R: S.R, prof: S.prof, naive: S.naive, fill: S.fill, win: S.win } }); }
	var sThS = slider("sh-s-th", function () { return Math.round(S.th / DEG); }, function (v) { S.th = v * DEG; S.target = null; sRun(false); sDraw(); sReadouts(); }, function (v) { return v + "°"; });
	slider("sh-s-R", function () { return S.R; }, function (v) { S.R = v; sSave(); sDraw(); sReadouts(); }, function (v) { return v.toFixed(1); });
	slider("sh-s-sp", function () { return S.sp; }, function (v) { S.sp = v; sSave(); }, function (v) { return v + "×"; });
	$("sh-s-prof").value = S.prof; $("sh-s-prof").onchange = function () { S.prof = this.value; sSave(); sDraw(); sReadouts(); };
	$("sh-s-naive").checked = S.naive; $("sh-s-naive").onchange = function () { S.naive = this.checked; sSave(); sDraw(); sReadouts(); };
	$("sh-s-fill").checked = S.fill; $("sh-s-fill").onchange = function () { S.fill = this.checked; sSave(); sDraw(); };
	function sRun(on) { S.run = on; playBtn($("sh-s-play"), on); }
	$("sh-s-play").onclick = function () { S.target = null; if (!S.run && S.th >= S.win * DEG - 1e-6) S.th = 0; sRun(!S.run); };
	$("sh-s-zero").onclick = function () { S.th = 0; S.target = null; sRun(false); sThS.set(0); sDraw(); sReadouts(); };
	$("sh-s-view").onclick = sReset; $("sh-s-png").onclick = function () { png(sCv, "spin-half-sheet"); };
	$("sh-s-link").onclick = function () { copyLink({ tab: "sheet", R: S.R, p: S.prof, naive: S.naive ? 1 : null, a: Math.round(S.th / DEG) }); };
	var sPreBtns = [180, 360, 720].map(function (d) { var b = document.createElement("button"); b.type = "button"; b.textContent = "Turn " + d + "°"; b.setAttribute("aria-pressed", "false"); b.onclick = function () { S.win = d; sSave(); setPressed(sPreBtns, b); S.th = 0; S.target = d * DEG; sRun(true); }; $("sh-s-pre").appendChild(b); return b; });
	setPressed(sPreBtns, sPreBtns[[180, 360, 720].indexOf(S.win)] || sPreBtns[2]);
	function sResize() { sG = fitStage(sStage, function (w) { return clamp(w * 0.6, 320, 640); }); sDraw(); }
	var sLastMax = 0;
	function sDraw() {
		if (!sG) return; var c = sG.c, W = sG.W, H = sG.H, cam = sCam, a = 1, R = S.R, L = R * 1.18, N = 44, i, j;
		cam.k = Math.min(W, H) / (2 * L * 1.08) * cam.zoom; cam.cx = W / 2; cam.cy = H / 2 + 10;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var G = [], zmax = 0;
		for (i = 0; i <= N; i++) { G.push([]); for (j = 0; j <= N; j++) { var x = -L + 2 * L * i / N, y = -L + 2 * L * j / N, rho = Math.hypot(x, y), P = rho < a * 0.999 ? null : M.deform([x, y, 0], S.th, SN, a, R, S.prof, S.naive, SP); if (P) zmax = Math.max(zmax, Math.abs(P[2])); G[i].push(P); } }
		sLastMax = zmax / R;
		var items = [], k3;
		for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
			var Q = [G[i][j], G[i + 1][j], G[i + 1][j + 1], G[i][j + 1]]; if (Q.some(function (v) { return !v; })) continue;
			var P4 = Q.map(function (v) { return proj(cam, v[0], v[1], v[2]); }), nrm = M.cross([Q[2][0] - Q[0][0], Q[2][1] - Q[0][1], Q[2][2] - Q[0][2]], [Q[3][0] - Q[1][0], Q[3][1] - Q[1][1], Q[3][2] - Q[1][2]]);
			var zc = (Q[0][2] + Q[1][2] + Q[2][2] + Q[3][2]) / 4 / R, t = clamp(zc * 2.2, -1, 1), base = t >= 0 ? [120 + 135 * t, 120 - 20 * t, 200 - 120 * t] : [120 + 20 * t, 120 - 30 * t, 200 + 55 * -t];
			k3 = lightK(cam, nrm); items.push({ d: (P4[0].d + P4[1].d + P4[2].d + P4[3].d) / 4, P: P4, f: shadeRGB(base, facesViewer(cam, nrm) ? k3 : k3 * 0.6), e: shadeRGB(base, 1.25) });
		}
		var C0 = proj(cam, 0, 0, 0); items.push({ d: C0.d, ball: true });
		items.sort(function (x, y) { return y.d - x.d; });
		var qb = S.naive ? M.qaxis(SN, S.th) : M.antitwist(0, S.th, SN, SP);
		items.forEach(function (it) {
			if (it.ball) return;
			c.beginPath(); c.moveTo(it.P[0].x, it.P[0].y); for (var m = 1; m < 4; m++) c.lineTo(it.P[m].x, it.P[m].y); c.closePath();
			if (S.fill) { c.fillStyle = it.f; c.globalAlpha = 0.62; c.fill(); c.globalAlpha = 1; }
			c.strokeStyle = it.e; c.lineWidth = 0.7; c.stroke();
		});
		drawBall(c, cam, a * 0.98, qb, "#e879f9"); /* on top, so it shows through the sheet */
		/* the influence radius on the (fixed) outer sheet */
		c.setLineDash([5, 5]); c.strokeStyle = "rgba(253,230,138,0.7)"; c.lineWidth = 1.3; c.beginPath(); for (i = 0; i <= 96; i++) { var t2 = i / 96 * TAU, pp = proj(cam, R * Math.cos(t2), R * Math.sin(t2), 0); if (i) c.lineTo(pp.x, pp.y); else c.moveTo(pp.x, pp.y); } c.stroke(); c.setLineDash([]);
		var ax0 = proj(cam, -1.7, 0, 0), ax1 = proj(cam, 1.9, 0, 0); c.save(); c.globalAlpha = 0.85; arrow2(c, ax0.x, ax0.y, ax1.x, ax1.y, "#fde68a", 1.6, 8); c.restore();
		txt(c, "ball turned " + Math.round(S.th / DEG) + "°", 12, 22, { b: 1, col: COL.core });
	}
	function sReadouts() {
		var flat = sLastMax < 0.004, d = S.th / DEG, qb = S.naive ? M.qaxis(SN, S.th) : M.antitwist(0, S.th, SN, SP);
		ro($("sh-s-ro"), [
			{ l: "Ball turned", v: Math.round(d) + "°" },
			{ l: "Highest point of the sheet", v: (sLastMax * 100).toFixed(1) + "%", s: "of the influence radius" },
			{ l: "Sheet flat again?", v: flat ? "Yes" : "No", c: flat ? "is-good" : d > 1 ? "is-bad" : "" },
			{ l: "q of the ball", v: M.qText(qb, 2) }
		]);
		var b = $("sh-s-badge");
		if (d < 1) badge(b, "", "");
		else if (flat) badge(b, Math.round(d) + "°: the sheet lies flat again", "is-good");
		else if (Math.abs(d - 720) < 1) badge(b, "720°, naive twist: still twisted (it never used the untangling move)", "is-bad");
		else if (Math.abs(d - 360) < 1) badge(b, "360°: the ball looks the same, the sheet is still crumpled", "is-bad");
		else badge(b, "", "");
		$("sh-s-note").textContent = S.naive ? "Naive twist: each ring of the sheet turns about the axis by θ times its drag f(ρ). Nothing makes it come back, at any angle except 0." : "Each point is turned by the never-tangle shell rotation A(r, θ) with r = 1 − f(ρ): the stronger the drag, the closer to the ball's own turn. " + (S.prof === "inv2" ? "Inverse square: f falls like 1/ρ², shifted to reach 0 at the edge." : S.prof === "linear" ? "Straight line: f falls evenly from the ball to the edge." : "Smooth: f falls like a half cosine from the ball to the edge.");
	}
	function sTick(dt) {
		if (!S.run) return;
		if (S.hold > 0) { S.hold -= dt; if (S.hold <= 0) { S.th = 0; } return; }
		var stop = S.target != null ? S.target : S.win * DEG;
		S.th = Math.min(stop, S.th + dt * S.sp * 70 * DEG); sThS.set(Math.round(S.th / DEG));
		if (S.th >= stop - 1e-9) { if (S.target != null) { S.target = null; sRun(false); } else S.hold = 1.4; }
	}

	/* ======================================================= loop / sizing ======================================================= */
	function onResize() { if (tab === "belt") { bResize(); bReadouts(); } else if (tab === "five") { fResize(); fReadouts(); } else if (tab === "torus") { tResize(); tReadouts(); } else { sResize(); sReadouts(); } }
	var rT; window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(onResize, 60); });
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rT); rT = setTimeout(onResize, 60); }).observe(root);
	var last = 0, roT = 0;
	function tick(dt) {
		roT += dt; var slow = roT > 0.15; if (slow) roT = 0;
		if (tab === "belt") { if (B.run) { bTick(dt); bDraw(); } if (slow) bReadouts(); }
		else if (tab === "five") { if (F.run) { fTick(dt); fDraw(); gDraw(); } if (slow) fReadouts(); }
		else if (tab === "torus") { if (T.run) { tTick(dt); tDraw(); } if (slow) tReadouts(); }
		else { if (S.run) { sTick(dt); sDraw(); } if (slow) sReadouts(); }
	}
	function loop(ts) { var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts; if (!document.hidden) tick(dt); requestAnimationFrame(loop); }
	setPressed(modeBtns, modeBtns.filter(function (b) { return b.dataset.bmode === B.mode; })[0]); $("sh-b-un").disabled = B.mode !== "twist"; $("sh-b-auto").disabled = B.mode !== "twist";
	bThS.set(Math.round(B.th / DEG)); fThS.set(Math.round(F.th / DEG)); tThS.set(Math.round(T.th / DEG)); sThS.set(Math.round(S.th / DEG));
	fApply(); setTab(tab, true); tReadouts(); sReadouts(); bReadouts();
	requestAnimationFrame(loop);
	window.MESHalfUI = { B: B, F: F, T: T, S: S, tick: function (ms, n) { for (var i = 0; i < (n || 1); i++) tick((ms || 16) / 1000); }, draw: function () { onResize(); } };
})();
