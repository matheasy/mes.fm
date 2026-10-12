/* MES Light in a Medium -- mes.fm/light-in-a-medium
 * UI around MESLight (lib.js: wave solver with c = 1/n, ray tracer, scenarios). Paint a medium (refractive index 1-4) and mirror walls, move the light
 * source, watch the wave bend / slow / reflect, overlay the geometric-optics rays. State: localStorage mes-light-in-a-medium:v1; share links ?p=&wl=&m=&res=&v=&r=.
 * All maths lives in lib.js (node-tested: tool_apps_src/light-in-a-medium-tests.js).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("lm");
	if (!root) return;
	var L = window.MESLight;
	var KEY = "mes-light-in-a-medium:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;

	var saved = sget(), q = new URLSearchParams(location.search);
	function pickNum(v, lo, hi, d) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	var cfg = {
		preset: L.BYID[q.get("p")] ? q.get("p") : (L.BYID[saved.preset] ? saved.preset : "slab"),
		res: [192, 256, 384].indexOf(+(q.get("res") || saved.res)) >= 0 ? +(q.get("res") || saved.res) : (coarse ? 192 : 256),
		speed: [1, 2, 4, 8].indexOf(+saved.speed) >= 0 ? +saved.speed : 2,
		view: (q.get("v") || saved.view) === "int" ? "int" : "wave",
		rays: q.get("r") === "1" || (q.get("r") == null && !!saved.rays),
		wl: pickNum(q.get("wl") || saved.wl, 8, 32, 14),
		mode: (q.get("m") || saved.mode) === "pulse" ? "pulse" : "cw",
		bn: pickNum(saved.bn, 1, 4, 1.5), bs: pickNum(saved.bs, 2, 30, 9), bright: pickNum(saved.bright, 0.4, 3, 1),
		showmed: saved.showmed !== false, brush: "glass"
	};
	var fromLink = !!q.get("p");

	var canvas = $("lm-canvas"), ctx = canvas.getContext("2d"), off = document.createElement("canvas"), offctx = off.getContext("2d"), img = null;
	var med = null, wave = null, src = null, gw = 0, gh = 0, running = true, lastT = 0, accStep = 0, peak = 0.05, cursor = null, rayList = [], rayDirty = true, rayTimer = 0, tIdx = 0;
	var LUT = null;

	/* ---------- setup ---------- */
	function loadPreset(id, keepSource) {
		var p = L.BYID[id]; cfg.preset = id;
		med = new L.Medium(gw, gh);
		var s = p.build(med, gw, gh);
		if (!keepSource) src = s;
		wave = new L.Wave(med);
		wave.wl = cfg.wl; wave.mode = cfg.mode;
		applySource();
		wave.pulseAt = cfg.mode === "pulse" ? 0 : -1;
		peak = 0.05; rayDirty = true;
		$("lm-note").textContent = p.note;
		$("lm-preset").value = id;
		sset({ preset: id });
		paintSrcUi(); draw();
	}
	function applySource() { wave.sources = L.sourceList(src); wave.refresh(); }
	function setGrid(res) {
		cfg.res = res; gw = res; gh = Math.round(res * 9 / 16);
		off.width = gw; off.height = gh; img = offctx.createImageData(gw, gh);
		sset({ res: res });
	}
	function colors() {
		LUT = new Uint8Array(1024 * 3);
		for (var i = 0; i < 1024; i++) {
			var v = (i - 512) / 512, a = Math.abs(v), r, g, b;
			if (v >= 0) { r = 255 * Math.min(1, a * 1.1); g = 150 * a + 105 * a * a; b = 40 * a + 120 * a * a * a; }
			else { r = 30 * a + 110 * a * a * a; g = 110 * a + 70 * a * a; b = 255 * Math.min(1, a * 1.1); }
			LUT[i * 3] = r; LUT[i * 3 + 1] = g; LUT[i * 3 + 2] = b;
		}
	}

	/* ---------- the loop ---------- */
	function frame(t) {
		requestAnimationFrame(frame);
		if (!wave || document.hidden) { lastT = t; return; }
		var dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
		if (running) {
			var want = cfg.speed, t0 = performance.now();
			for (var i = 0; i < want; i++) { wave.step(); if (performance.now() - t0 > 14) break; }
		}
		draw();
	}
	function sizeCanvas() {
		var wrap = $("lm-wrap"), st = $("lm-stage"), full = document.fullscreenElement === wrap, W = wrap.clientWidth, asp = gw / gh, H = Math.round(W / asp);
		if (full) { var maxH = window.innerHeight - 110; if (H > maxH) { H = maxH; W = Math.round(H * asp); } }
		st.style.width = W + "px"; st.style.height = H + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
	}
	function draw() {
		if (!wave) return;
		var u = wave.u, I = wave.I, n = med.n, m = med.m, d = img.data, N = gw * gh, i, o = 0, rms = 0, c = 0;
		for (i = 0; i < N; i += 5) { rms += u[i] * u[i]; c++; }
		rms = Math.sqrt(rms / c);
		peak = Math.max(peak * 0.997, rms * 3, 0.03);
		var gain = 0.9 * cfg.bright / peak, tint = cfg.showmed ? 1 : 0, view = cfg.view;
		for (i = 0; i < N; i++, o += 4) {
			var br = 8, bg = 12, bb = 20;
			if (m[i]) { br = 150; bg = 155; bb = 165; }
			else if (tint) { var k = (n[i] - 1) * 0.33; br += 16 * k; bg += 78 * k; bb += 88 * k; }
			if (view === "wave") {
				var vv = u[i] * gain; if (vv > 1) vv = 1; else if (vv < -1) vv = -1;
				var li = ((vv * 511 + 512) | 0) * 3;
				br += LUT[li]; bg += LUT[li + 1]; bb += LUT[li + 2];
			} else {
				var s = Math.sqrt(I[i]) * gain * 2.2; if (s > 1) s = 1;
				br += 255 * Math.min(1, s * 1.6); bg += 200 * s * s; bb += 90 * s * s * s;
			}
			d[o] = br > 255 ? 255 : br; d[o + 1] = bg > 255 ? 255 : bg; d[o + 2] = bb > 255 ? 255 : bb; d[o + 3] = 255;
		}
		offctx.putImageData(img, 0, 0);
		ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
		ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
		if (cfg.rays) drawRays();
		drawSource();
		var per = wave.t / (2 * Math.PI / wave.omega());
		$("lm-t").textContent = per.toFixed(1);
	}
	function sc() { return canvas.width / gw; }
	function drawRays() {
		if (rayDirty) computeRays();
		var s = sc(); ctx.lineWidth = Math.max(1, s * 0.35); ctx.strokeStyle = "rgba(255,238,120,0.8)";
		for (var i = 0; i < rayList.length; i++) {
			var p = rayList[i]; ctx.beginPath(); ctx.moveTo(p[0] * s, p[1] * s);
			for (var j = 2; j < p.length; j += 2) ctx.lineTo(p[j] * s, p[j + 1] * s);
			ctx.stroke();
		}
	}
	function computeRays() {
		rayDirty = false;
		var sv = { type: src.type, x: src.x, y: src.y, angle: src.angle || 0, width: src.width || 20 };
		rayList = L.rayFan(med, sv, src.type === "point" ? 36 : Math.max(5, Math.round((src.width || 20) / 5)));
	}
	function drawSource() {
		var s = sc(), x = src.x * s, y = src.y * s;
		ctx.save(); ctx.lineWidth = Math.max(1.5, s * 0.5); ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.fillStyle = "rgba(255,255,255,0.9)";
		if (src.type === "point") { ctx.beginPath(); ctx.arc(x, y, s * 2.4, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, 6.2832); ctx.fill(); }
		else {
			var px = -Math.sin(src.angle) * src.width / 2 * s, py = Math.cos(src.angle) * src.width / 2 * s;
			ctx.beginPath(); ctx.moveTo(x - px, y - py); ctx.lineTo(x + px, y + py); ctx.stroke();
			var ax = Math.cos(src.angle) * s * 6, ay = Math.sin(src.angle) * s * 6;
			ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ax, y + ay); ctx.stroke();
			ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, 6.2832); ctx.fill();
		}
		ctx.restore();
	}

	/* ---------- editing the medium ---------- */
	function toGrid(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * gw, y: (e.clientY - r.top) / r.height * gh }; }
	var drag = null;
	function paintAt(p) {
		var r = cfg.bs * (gw / 256);
		if (cfg.brush === "glass") med.disc(p.x, p.y, r, cfg.bn, true);
		else if (cfg.brush === "wall") med.disc(p.x, p.y, Math.max(1.5, r * 0.4), -1);
		else if (cfg.brush === "erase") { med.disc(p.x, p.y, r, 0, true); med.disc(p.x, p.y, r, -2); }
		wave.refresh(); rayDirty = true;
	}
	canvas.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return;
		canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true });
		var p = toGrid(e); drag = true; hideHint();
		if (cfg.brush === "src") { src.x = Math.max(2, Math.min(gw - 3, p.x)); src.y = Math.max(2, Math.min(gh - 3, p.y)); applySource(); rayDirty = true; paintSrcUi(); if (cfg.mode === "pulse") { wave.pulse(); } }
		else paintAt(p);
		e.preventDefault();
	});
	canvas.addEventListener("pointermove", function (e) {
		var p = toGrid(e); cursor = p; readout(p);
		if (!drag) return;
		if (cfg.brush === "src") { src.x = Math.max(2, Math.min(gw - 3, p.x)); src.y = Math.max(2, Math.min(gh - 3, p.y)); applySource(); rayDirty = true; paintSrcUi(); }
		else paintAt(p);
	});
	function endDrag() { drag = null; }
	canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
	canvas.addEventListener("pointerleave", function () { cursor = null; });
	function readout(p) {
		var x = Math.max(0, Math.min(gw - 1, p.x | 0)), y = Math.max(0, Math.min(gh - 1, p.y | 0)), nn = med.n[y * gw + x];
		$("lm-n").textContent = "n = " + nn.toFixed(2);
		$("lm-c").textContent = "light moves at " + (1 / nn).toFixed(2) + " c";
		$("lm-wlv").textContent = (cfg.wl / nn).toFixed(1) + " cells";
	}
	function hideHint() { $("lm-hint").classList.add("is-gone"); }

	/* ---------- UI wiring ---------- */
	var MATS = [["Vacuum", 1], ["Air", 1.0003], ["Water", 1.33], ["Glass", 1.5], ["Sapphire", 1.77], ["Diamond", 2.42], ["Silicon", 3.5]];
	$("lm-mats").innerHTML = MATS.map(function (m) { return '<button type="button" data-n="' + m[1] + '">' + esc(m[0]) + " " + m[1] + "</button>"; }).join("");
	$("lm-mats").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; cfg.bn = Math.max(1, Math.min(4, +b.dataset.n)); setBrush("glass"); paintN(); sset({ bn: cfg.bn }); };
	$("lm-preset").innerHTML = L.PRESETS.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("");
	$("lm-preset").onchange = function () { loadPreset($("lm-preset").value); };
	function paintN() { $("lm-bn-in").value = cfg.bn; $("lm-bn-v").textContent = cfg.bn.toFixed(2); $("lm-bn-c").textContent = (1 / cfg.bn).toFixed(2) + " c"; }
	$("lm-bn-in").oninput = function () { cfg.bn = +this.value; paintN(); sset({ bn: cfg.bn }); setBrush("glass"); };
	$("lm-bs-in").oninput = function () { cfg.bs = +this.value; $("lm-bs-v").textContent = cfg.bs; sset({ bs: cfg.bs }); };
	$("lm-wl-in").oninput = function () { cfg.wl = +this.value; wave.wl = cfg.wl; $("lm-wl-v").textContent = cfg.wl + " cells"; sset({ wl: cfg.wl }); };
	$("lm-br-in").oninput = function () { cfg.bright = +this.value; $("lm-br-v").textContent = cfg.bright.toFixed(2) + "x"; sset({ bright: cfg.bright }); };
	$("lm-stype").onchange = function () { src.type = this.value; if (src.type === "beam") { src.angle = src.angle || 0; src.width = src.width || 40; } applySource(); rayDirty = true; paintSrcUi(); };
	$("lm-ang-in").oninput = function () { src.angle = +this.value * Math.PI / 180; applySource(); rayDirty = true; paintSrcUi(); };
	$("lm-wid-in").oninput = function () { src.width = +this.value; applySource(); rayDirty = true; paintSrcUi(); };
	$("lm-mode").onchange = function () { cfg.mode = this.value; wave.mode = cfg.mode; if (cfg.mode === "pulse") wave.pulse(); sset({ mode: cfg.mode }); };
	$("lm-pulse").onclick = function () { cfg.mode = "pulse"; $("lm-mode").value = "pulse"; wave.mode = "pulse"; wave.pulse(); sset({ mode: "pulse" }); };
	$("lm-res").onchange = function () { setGrid(+this.value); loadPreset(cfg.preset); sizeCanvas(); draw(); };
	$("lm-speed").onchange = function () { cfg.speed = +this.value; sset({ speed: cfg.speed }); };
	$("lm-showmed").onchange = function () { cfg.showmed = this.checked; sset({ showmed: cfg.showmed }); };
	$("lm-clear").onclick = function () { med.n.fill(1); med.m.fill(0); wave.refresh(); rayDirty = true; toast("Medium cleared"); };
	$("lm-reset").onclick = restart;
	function restart() { wave.reset(); peak = 0.05; if (cfg.mode === "pulse") wave.pulseAt = 0; draw(); }
	$("lm-step").onclick = function () { if (running) setRun(false); for (var i = 0; i < 6; i++) wave.step(); draw(); };
	$("lm-play").onclick = function () { setRun(!running); };
	function setRun(on) { running = on; $("lm-play").textContent = on ? "❚❚ Pause" : "▶ Play"; $("lm-play").setAttribute("aria-pressed", on ? "true" : "false"); }
	function setBrush(b) {
		cfg.brush = b;
		Array.prototype.forEach.call(document.querySelectorAll("#lm [data-brush]"), function (x) { x.setAttribute("aria-pressed", x.dataset.brush === b ? "true" : "false"); });
		$("lm-hint").textContent = { glass: "Drag on the picture to paint a medium", wall: "Drag to draw mirror walls", erase: "Drag to erase", src: "Click or drag to move the light source" }[b];
	}
	Array.prototype.forEach.call(document.querySelectorAll("#lm [data-brush]"), function (x) { x.onclick = function () { setBrush(x.dataset.brush); }; });
	function setView(v) {
		cfg.view = v; sset({ view: v });
		Array.prototype.forEach.call(document.querySelectorAll("#lm [data-view]"), function (x) { x.setAttribute("aria-pressed", x.dataset.view === v ? "true" : "false"); });
	}
	Array.prototype.forEach.call(document.querySelectorAll("#lm [data-view]"), function (x) { x.onclick = function () { setView(x.dataset.view); }; });
	$("lm-rays").onclick = function () { cfg.rays = !cfg.rays; $("lm-rays").setAttribute("aria-pressed", cfg.rays ? "true" : "false"); sset({ rays: cfg.rays }); rayDirty = true; };
	function paintSrcUi() {
		$("lm-stype").value = src.type;
		$("lm-ang-f").hidden = $("lm-wid-f").hidden = src.type !== "beam";
		var deg = Math.round(((src.angle || 0) * 180 / Math.PI + 540) % 360 - 180);
		$("lm-ang-in").value = deg; $("lm-ang-v").textContent = deg + "°";
		$("lm-wid-in").value = src.width || 40; $("lm-wid-v").textContent = Math.round(src.width || 40) + " cells";
		$("lm-srcv").textContent = src.type === "point" ? "Point" : "Beam";
		$("lm-srcs").textContent = src.type === "point" ? "waves spread in all directions" : "a flat wave moving at " + deg + "°";
	}
	$("lm-png").onclick = function () { draw(); var a = document.createElement("a"); a.download = "light-in-a-medium.png"; a.href = canvas.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove(); };
	$("lm-full").onclick = function () { var w = $("lm-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	document.addEventListener("fullscreenchange", function () { setTimeout(function () { sizeCanvas(); draw(); }, 60); });
	window.addEventListener("resize", function () { sizeCanvas(); });
	var rt;
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(function () { if (wave) { sizeCanvas(); draw(); } }, 60); }).observe($("lm-wrap"));
	document.addEventListener("keydown", function (e) {
		if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || "")) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " ") { if (document.activeElement === canvas || document.activeElement === document.body) { e.preventDefault(); setRun(!running); } }
		else if (e.key === "r" || e.key === "R") restart();
		else if (e.key === "p" || e.key === "P") $("lm-pulse").click();
		else if (e.key === "ArrowRight" && !running) $("lm-step").click();
	});

	/* ---------- share link + toast ---------- */
	var toastT;
	function toast(msg) { var t = $("lm-toast"); if (!t) { t = document.createElement("div"); t.id = "lm-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	$("lm-link").onclick = function () {
		var u = new URL(location.href); u.search = "";
		u.searchParams.set("p", cfg.preset); u.searchParams.set("wl", cfg.wl); u.searchParams.set("m", cfg.mode); u.searchParams.set("res", cfg.res); u.searchParams.set("v", cfg.view); u.searchParams.set("r", cfg.rays ? "1" : "0");
		var url = u.toString();
		function done() { toast("Link copied"); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};

	/* ---------- go ---------- */
	colors(); setGrid(cfg.res);
	$("lm-res").value = String(cfg.res); $("lm-speed").value = String(cfg.speed); $("lm-mode").value = cfg.mode; $("lm-showmed").checked = cfg.showmed;
	$("lm-bs-in").value = cfg.bs; $("lm-bs-v").textContent = cfg.bs; $("lm-wl-in").value = cfg.wl; $("lm-wl-v").textContent = cfg.wl + " cells"; $("lm-br-in").value = cfg.bright; $("lm-br-v").textContent = cfg.bright.toFixed(2) + "x";
	paintN(); setView(cfg.view); setBrush("glass"); $("lm-rays").setAttribute("aria-pressed", cfg.rays ? "true" : "false");
	loadPreset(cfg.preset); sizeCanvas(); draw();
	if (fromLink) hideHint();
	requestAnimationFrame(frame);
})();
