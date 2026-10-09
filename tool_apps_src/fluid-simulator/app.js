/* MES Fluid Simulator -- mes.fm/fluid-simulator
 * UI around MESFluid (lib.js: the Navier-Stokes solver). Scenarios, live stirring / heating / wall drawing, four views (smoke, spin, speed, pressure),
 * Reynolds-number slider, readouts (flow-through time, top speed, vortex-shedding Strouhal number, energy / probe trace), share links,
 * localStorage mes-fluid-simulator:v1. All maths lives in lib.js (node-tested: tool_apps_src/fluid-simulator-tests.js).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("fl");
	if (!root) return;
	var F = window.MESFluid;
	var KEY = "mes-fluid-simulator:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmt(x, d) { return (+x).toFixed(d); }
	var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;

	var saved = sget(), q = new URLSearchParams(location.search);
	var cfg = {
		preset: F.BYID[q.get("p")] ? q.get("p") : (F.BYID[saved.preset] ? saved.preset : "cylinder"),
		res: [64, 96, 128, 192].indexOf(+(q.get("res") || saved.res)) >= 0 ? +(q.get("res") || saved.res) : (coarse ? 64 : 96),
		speed: [0.5, 1, 2, 3].indexOf(+saved.speed) >= 0 ? +saved.speed : 2,
		view: /^(smoke|vort|speed|pressure)$/.test(q.get("v") || saved.view || "") ? (q.get("v") || saved.view) : null,
		arrows: q.get("a") === "1" || (q.get("a") == null && !!saved.arrows),
		brush: "push", mac: saved.mac !== false, rake: saved.rake !== false
	};
	var fromLink = !!q.get("p");

	var canvas = $("fl-canvas"), ctx = canvas.getContext("2d"), off = document.createElement("canvas"), offctx = off.getContext("2d"), img = null;
	var sim = null, P = null, par = null, nx = 0, ny = 0, running = true, acc = 0, lastT = 0, view = "smoke";
	var hist = [], histT = 0, e0 = 0, vmaxS = 0, frameN = 0, cursor = null, hue = 0.55;

	/* ---------- scenario setup ---------- */
	function lrefCells() {
		if (par.shape && par.shape.kind !== "none") return par.shape.size * ny * (par.shape.kind === "plate" ? 1.8 : 1);
		return ny * (P.lref || 1);
	}
	function refU() { return P.mode === "tunnel" ? par.U : (P.mode === "box" && P.lid ? par.U : P.U); }
	function updateNu() { sim.nu = F.nuFor(refU(), lrefCells(), par.re); }
	function reToSlider(re) { return Math.round(1000 * Math.log(Math.max(10, Math.min(5000, re)) / 10) / Math.log(500)); }
	function sliderToRe(t) { return 10 * Math.pow(500, t / 1000); }
	function niceRe(re) { return re < 100 ? Math.round(re) : re < 1000 ? Math.round(re / 5) * 5 : Math.round(re / 50) * 50; }

	function load(id, ov) {
		ov = ov || {};
		P = F.BYID[id]; cfg.preset = id;
		ny = cfg.res; nx = Math.round(cfg.res * P.aspect);
		sim = new F.Fluid(nx, ny); sim.mac = cfg.mac; sim.rake = cfg.rake;
		par = {
			re: ov.re != null ? ov.re : P.Re, U: ov.U || P.U, vort: ov.vort != null ? ov.vort : (P.vort || 0), beta: ov.beta != null ? ov.beta : (P.beta || 0), fade: ov.fade != null ? !!ov.fade : P.mode === "tunnel",
			shape: P.shape ? { kind: ov.ob || P.shape.kind, cx: P.shape.cx, cy: P.shape.cy, size: ov.sz || P.shape.size, angle: ov.ang != null ? ov.ang : (P.shape.angle || 0) } : (P.draw ? { kind: ov.ob || "none", cx: 0.22, cy: 0.5, size: ov.sz || 0.2, angle: ov.ang != null ? ov.ang : 18 } : null)
		};
		if (par.shape) par.shape.cx = shapeCx(par.shape.kind);
		sim.mode = P.mode; sim.U = par.U; sim.lidU = P.lid ? par.U : 0; sim.vort = par.vort; sim.beta = par.beta; sim.fade = par.fade ? (P.mode === "tunnel" ? 0.006 : 0.004) : 0;
		applyShape(true);
		sim.clearFields(); initFields();
		view = cfg.view || P.view;
		hist = []; histT = 0; e0 = 0; vmaxS = 0; frameN = 0;
		$("fl-preset").value = id;
		sizeCanvas(); paintUi(); paintViews(); updateNu(); readouts(true); draw();
	}
	function shapeCx(kind) { return kind === "tandem" ? 0.16 : kind === "plate" ? 0.25 : 0.22; }
	function applyShape(silent) {
		var s = par.shape; sim.setShape(s && s.kind !== "none" ? s : null);
		if (s && s.kind !== "none" && P.probe) {
			var D = s.size * ny, off0 = s.kind === "tandem" ? 2.2 * D : 0;
			sim.probe = { x: Math.min(nx - 2, s.cx * nx + off0 + P.probe[0] * D), y: P.probe[1] * ny + 0.35 * D };
		} else sim.probe = null;
		sim.cross = []; sim.pvPrev = 0;
		if (!silent) { sim.zeroSolid(); updateNu(); }
	}
	function initFields() {
		var U = par.U;
		if (P.mode === "tunnel") sim.initUniform(U, 0.05);
		else if (P.init === "stripes" || P.init === "halves") sim.initLayers(P.init);
		else if (P.init === "shear") sim.initShear(P.U);
		else if (P.init === "vortices") sim.initVortices(2 * Math.PI * ny * 0.07 * P.U / 0.64, 0.28);
		else if (P.init === "taylor") { sim.initTaylorGreen(P.U); }
		if (P.mode === "box" && !P.lid) { /* still tank: nothing moves until you stir */ }
		e0 = sim.stats().ke;
	}
	function restart() { var keepWalls = sim ? sim.user.slice() : null; load(cfg.preset, { re: par.re, U: par.U, vort: par.vort, beta: par.beta, fade: par.fade, ob: par.shape && par.shape.kind, sz: par.shape && par.shape.size, ang: par.shape && par.shape.angle }); if (keepWalls && keepWalls.length === sim.user.length) { sim.user.set(keepWalls); sim.rebuild(); } }

	/* ---------- UI wiring ---------- */
	(function buildPresets() {
		var groups = {}, order = [];
		F.PRESETS.forEach(function (p) { if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); } groups[p.group].push(p); });
		$("fl-preset").innerHTML = order.map(function (g) { return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("") + "</optgroup>"; }).join("");
	})();
	var TRY = {
		cylinder: [["Re 20: smooth, steady wake", { re: 20 }], ["Re 60: just starting to wobble", { re: 60 }], ["Re 200: vortex street", { re: 200 }], ["Re 1000: messy wake", { re: 1000 }]],
		square: [["Re 40", { re: 40 }], ["Re 200", { re: 200 }], ["Re 1000", { re: 1000 }]],
		plate: [["5°: flow stays attached", { ang: 5 }], ["18°", { ang: 18 }], ["35°: stalled", { ang: 35 }]],
		tandem: [["Re 60", { re: 60 }], ["Re 200", { re: 200 }], ["Re 800", { re: 800 }]],
		pair: [["Re 60", { re: 60 }], ["Re 200", { re: 200 }]],
		wedge: [["Re 80", { re: 80 }], ["Re 250", { re: 250 }]],
		cavity: [["Re 100", { re: 100 }], ["Re 400", { re: 400 }], ["Re 1000", { re: 1000 }], ["Re 3000", { re: 3000 }]],
		stir: [["Honey (Re 20)", { re: 20 }], ["Water (Re 800)", { re: 800 }], ["Thin air (Re 5000)", { re: 5000 }]],
		plume: [["Gentle heat", { beta: 0.006 }], ["Strong buoyancy", { beta: 0.02 }], ["Smooth (no swirl boost)", { vort: 0 }]],
		shear: [["Re 300", { re: 300 }], ["Re 2000", { re: 2000 }], ["Re 8000", { re: 5000 }]],
		merge: [["Re 300", { re: 300 }], ["Re 3000", { re: 3000 }]],
		taylor: [["Re 30: fades fast", { re: 30 }], ["Re 100", { re: 100 }], ["Re 1000: barely fades", { re: 1000 }]]
	};
	function paintUi() {
		var tun = P.mode === "tunnel", sh = par.shape, plate = sh && sh.kind === "plate";
		$("fl-note").textContent = P.note;
		function show(id, on) { $(id).hidden = !on; }
		show("fl-u-f", tun || (P.mode === "box" && P.lid)); show("fl-beta-f", P.mode === "box");
		show("fl-ob-f", !!(tun && (P.shape || P.draw))); show("fl-sz-f", !!(tun && sh && sh.kind !== "none")); show("fl-ang-f", !!(tun && plate));
		$("fl-rake").parentNode.hidden = !tun;
		$("fl-u-l").firstChild.textContent = (P.mode === "box" ? "Lid speed" : "Wind speed") + ": ";
		var per = P.mode === "periodic";
		[].forEach.call(document.querySelectorAll('[data-brush="wall"],[data-brush="erase"]'), function (b) { b.hidden = per; });
		$("fl-clearwalls").hidden = per;
		if (per && (cfg.brush === "wall" || cfg.brush === "erase")) cfg.brush = "push";
		if (!(P.heat || P.mode === "box") && cfg.brush === "heat") cfg.brush = "push";
		[].forEach.call(document.querySelectorAll('[data-brush="heat"]'), function (b) { b.hidden = !(P.mode === "box"); });
		$("fl-re-in").value = reToSlider(par.re); $("fl-u-in").value = par.U; $("fl-vort-in").value = par.vort; $("fl-beta-in").value = par.beta;
		if (sh) { $("fl-ob").value = sh.kind; $("fl-sz-in").value = sh.size; $("fl-ang-in").value = sh.angle; }
		$("fl-res").value = String(cfg.res); $("fl-speed").value = String(cfg.speed); $("fl-mac").checked = cfg.mac; $("fl-rake").checked = cfg.rake; $("fl-fade").checked = par.fade;
		paintNums(); paintBrush(); paintTry();
		$("fl-st-box").hidden = !(sim.probe);
		$("fl-hint").textContent = per ? "Drag on the flow to stir it" : tun ? "Drag to stir · pick Wall to draw obstacles" : "Drag on the flow to stir it";
		$("fl-hint").classList.remove("is-gone");
	}
	function paintNums() {
		$("fl-re-v").textContent = niceRe(par.re); $("fl-u-v").textContent = fmt(par.U, 2) + " cells/step"; $("fl-vort-v").textContent = par.vort ? fmt(par.vort, 2) : "off";
		$("fl-beta-v").textContent = par.beta ? fmt(par.beta * 1000, 0) + "‰" : "off";
		if (par.shape) { $("fl-sz-v").textContent = Math.round(par.shape.size * 100) + "% of height"; $("fl-ang-v").textContent = par.shape.angle + "°"; }
	}
	function paintTry() {
		var t = TRY[P.id] || []; $("fl-try").innerHTML = t.length ? '<span class="tu-label">Try this</span> ' + t.map(function (x, i) { return '<button type="button" class="tu-chip" data-try="' + i + '">' + esc(x[0]) + "</button>"; }).join("") : "";
	}
	function paintViews() { [].forEach.call(document.querySelectorAll("[data-view]"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === view)); }); $("fl-arrows").setAttribute("aria-pressed", String(cfg.arrows)); }
	function paintBrush() { [].forEach.call(document.querySelectorAll("[data-brush]"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.brush === cfg.brush)); }); canvas.style.cursor = cfg.brush === "erase" ? "cell" : "crosshair"; }

	$("fl-preset").onchange = function () { load(this.value); sset({ preset: cfg.preset }); history.replaceState(null, "", location.pathname); };
	$("fl-play").onclick = function () { setRunning(!running); };
	function setRunning(on) { running = on; var b = $("fl-play"); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "❚❚ Pause" : "▶ Play"; }
	$("fl-step").onclick = function () { setRunning(false); stepOnce(); readouts(true); draw(); };
	$("fl-reset").onclick = restart;
	$("fl-re-in").oninput = function () { par.re = sliderToRe(+this.value); updateNu(); paintNums(); readouts(true); };
	$("fl-u-in").oninput = function () { par.U = +this.value; sim.U = par.U; if (P.lid) sim.lidU = par.U; sim.bndVel(); updateNu(); paintNums(); };
	$("fl-vort-in").oninput = function () { par.vort = +this.value; sim.vort = par.vort; paintNums(); };
	$("fl-beta-in").oninput = function () { par.beta = +this.value; sim.beta = par.beta; paintNums(); };
	$("fl-ob").onchange = function () { par.shape.kind = this.value; par.shape.cx = shapeCx(this.value); if (this.value === "plate" && !par.shape.angle) par.shape.angle = 18; applyShape(); paintUi(); };
	$("fl-sz-in").oninput = function () { par.shape.size = +this.value; applyShape(); paintNums(); };
	$("fl-ang-in").oninput = function () { par.shape.angle = +this.value; applyShape(); paintNums(); };
	$("fl-res").onchange = function () { cfg.res = +this.value; sset({ res: cfg.res }); restart(); };
	$("fl-speed").onchange = function () { cfg.speed = +this.value; sset({ speed: cfg.speed }); };
	$("fl-mac").onchange = function () { cfg.mac = this.checked; sim.mac = cfg.mac; sset({ mac: cfg.mac }); };
	$("fl-rake").onchange = function () { cfg.rake = this.checked; sim.rake = cfg.rake; sset({ rake: cfg.rake }); };
	$("fl-fade").onchange = function () { par.fade = this.checked; sim.fade = par.fade ? (P.mode === "tunnel" ? 0.006 : 0.004) : 0; };
	$("fl-clearwalls").onclick = function () { sim.clearUser(); sim.zeroSolid(); toast("Drawn walls cleared"); };
	$("fl-clearsmoke").onclick = function () { sim.r.fill(0); sim.g.fill(0); sim.b.fill(0); sim.T.fill(0); sim.bndScalar(sim.r, 0); sim.bndScalar(sim.g, 1); sim.bndScalar(sim.b, 2); if (P.init === "stripes" || P.init === "halves") { sim.initLayers(P.init); } toast("Smoke cleared"); };
	$("fl-try").addEventListener("click", function (e) {
		var b = e.target.closest("[data-try]"); if (!b) return; var o = TRY[P.id][+b.dataset.try][1];
		if (o.re != null) par.re = o.re; if (o.vort != null) { par.vort = o.vort; sim.vort = o.vort; } if (o.beta != null) { par.beta = o.beta; sim.beta = o.beta; }
		if (o.ang != null && par.shape) { par.shape.angle = o.ang; applyShape(); }
		updateNu(); paintUi(); readouts(true);
	});
	document.querySelector(".fl-views").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.view) { view = cfg.view = b.dataset.view; sset({ view: view }); } else if (b.id === "fl-arrows") { cfg.arrows = !cfg.arrows; sset({ arrows: cfg.arrows }); }
		paintViews(); draw();
	});
	document.querySelector(".fl-brushes").addEventListener("click", function (e) { var b = e.target.closest("[data-brush]"); if (!b) return; cfg.brush = b.dataset.brush; paintBrush(); });

	/* ---------- stepping ---------- */
	function stepOnce() {
		if (P.heat) sim.splat(nx / 2, 3, 0, 0, Math.max(2, ny * 0.035), [0.25, 0.25, 0.25], 0.5);
		sim.step();
		if (sim.steps % (sim.probe ? 2 : 8) === 0) {
			var v = sim.probe ? sim.lastProbe || 0 : sim.stats().ke;
			hist.push([sim.steps, v]); if (hist.length > 260) hist.shift();
		}
	}
	function frame(t) {
		requestAnimationFrame(frame);
		if (!sim || document.hidden) { lastT = t; return; }
		var dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
		if (running) {
			acc += dt * 60 * cfg.speed; if (acc > 8) acc = 8;
			var t0 = performance.now(), n = 0;
			while (acc >= 1 && (n === 0 || performance.now() - t0 < 14)) { stepOnce(); acc -= 1; n++; }
			if (acc >= 1) acc = 0;   // can't keep up: drop the backlog instead of running ahead
		}
		draw();
		if ((frameN++ & 3) === 0) readouts(false);
	}

	/* ---------- drawing ---------- */
	function sizeCanvas() {
		var wrap = $("fl-wrap"), st = $("fl-stage"), full = document.fullscreenElement === wrap, W = wrap.clientWidth, asp = nx / ny;
		var maxH = full ? wrap.clientHeight - 40 : window.innerHeight * 0.78, w = Math.max(240, Math.min(W, maxH * asp));
		st.style.width = w + "px"; st.style.height = w / asp + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.round(w * dpr); canvas.height = Math.round(w / asp * dpr);
		off.width = nx; off.height = ny; img = offctx.createImageData(nx, ny);
	}
	function draw() {
		if (!sim || !img) return;
		sim.render(img.data, view); offctx.putImageData(img, 0, 0);
		ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
		ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
		if (cfg.arrows) drawArrows();
		if (cursor && (cfg.brush === "wall" || cfg.brush === "erase")) {
			var sx = canvas.width / nx, rad = brushWallR() * sx; ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cursor.x * sx, (ny - cursor.y) * sx, rad, 0, 6.2832); ctx.stroke();
		}
	}
	function drawArrows() {
		var sx = canvas.width / nx, step = Math.max(10, Math.round(26 / sx * (window.devicePixelRatio || 1) * 1.2)), S = sim.S, u = sim.u, v = sim.v, U = Math.max(0.2, refU());
		ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = Math.max(1, sx * 0.12);
		for (var j = Math.floor(step / 2) + 1; j <= ny; j += step) for (var i = Math.floor(step / 2) + 1; i <= nx; i += step) {
			var k = j * S + i; if (sim.solid[k]) continue;
			var ux = u[k], uy = v[k], sp = Math.sqrt(ux * ux + uy * uy); if (sp < 0.03 * U) continue;
			var L = Math.min(1.4, sp / U) * step * 0.8 * sx, a = Math.atan2(-uy, ux), x0 = (i - 0.5) * sx, y0 = (ny - j + 0.5) * sx, x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
			ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
			var h = Math.min(6 * sx * 0.5, L * 0.4); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a - 0.5) * h, y1 - Math.sin(a - 0.5) * h); ctx.lineTo(x1 - Math.cos(a + 0.5) * h, y1 - Math.sin(a + 0.5) * h); ctx.closePath(); ctx.fill();
		}
	}

	/* ---------- readouts + trace chart ---------- */
	function readouts(force) {
		var L = lrefCells(), U = Math.max(0.05, refU()), s = sim.stats();
		$("fl-t").textContent = fmt(sim.steps * U / L, 1);
		$("fl-re").textContent = niceRe(par.re);
		$("fl-re-s").textContent = P.mode === "tunnel" && par.shape && par.shape.kind !== "none" ? "based on the obstacle size" : "based on the box size";
		vmaxS = s.vmax; $("fl-vmax").textContent = fmt(s.vmax / U, 2);
		if (sim.probe) {
			var per = sim.period();
			if (per) { $("fl-st").textContent = fmt(L / (U * per), 3); $("fl-st-s").textContent = "Strouhal number (about 0.2 for a cylinder)"; }
			else { $("fl-st").textContent = sim.steps > 400 && par.re < 45 ? "none" : "…"; $("fl-st-s").textContent = par.re < 45 && sim.steps > 400 ? "steady wake: no vortices shed below Re ≈ 47" : "waiting for a steady rhythm"; }
		}
		drawChart();
	}
	function drawChart() {
		var c = $("fl-chart"), g = c.getContext("2d"), W = c.width, H = c.height, probe = !!sim.probe, accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#0369a1";
		var dark = document.body.classList.contains("dark-mode"), fg = dark ? "#cfd6e2" : "#4b5563", grid = dark ? "#3a3f4a" : "#d7dce4";
		g.clearRect(0, 0, W, H);
		$("fl-chart-t").textContent = probe ? "Sideways speed behind the obstacle" : P.exact ? "Energy: simulated vs exact" : "Energy in the flow";
		if (hist.length < 2) { $("fl-chart-s").textContent = ""; return; }
		var t0 = hist[0][0], t1 = hist[hist.length - 1][0], lo = Infinity, hi = -Infinity, i, v, sc;
		if (!probe) { var ke0 = e0 || hist[0][1] || 1; sc = ke0; lo = 0; hi = 1; } else { for (i = 0; i < hist.length; i++) { lo = Math.min(lo, hist[i][1]); hi = Math.max(hi, hist[i][1]); } var m = Math.max(Math.abs(lo), Math.abs(hi), 0.05); lo = -m; hi = m; }
		function X(t) { return 4 + (t - t0) / Math.max(1, t1 - t0) * (W - 8); }
		function Y(val) { return H - 5 - (val - lo) / (hi - lo) * (H - 10); }
		g.strokeStyle = grid; g.lineWidth = 1; g.beginPath(); var zy = probe ? Y(0) : Y(0); g.moveTo(0, zy); g.lineTo(W, zy); g.stroke();
		g.strokeStyle = accent; g.lineWidth = 2; g.beginPath();
		for (i = 0; i < hist.length; i++) { v = probe ? hist[i][1] : Math.min(1.05, hist[i][1] / sc); var px = X(hist[i][0]), py = Y(v); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
		g.stroke();
		if (P.exact && !probe) {
			g.strokeStyle = fg; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.beginPath();
			for (i = 0; i < hist.length; i++) { var ev = F.taylorEnergy(sim.nu, nx, hist[i][0]), ex = X(hist[i][0]), ey = Y(ev); if (i) g.lineTo(ex, ey); else g.moveTo(ex, ey); }
			g.stroke(); g.setLineDash([]);
			var last = hist[hist.length - 1]; $("fl-chart-s").textContent = "now: simulated " + Math.round(100 * last[1] / sc) + "% · exact " + Math.round(100 * F.taylorEnergy(sim.nu, nx, last[0])) + "% (dashed)";
		} else $("fl-chart-s").textContent = probe ? "the swing from side to side is the vortex street" : "falls as viscosity turns motion into heat";
	}

	/* ---------- pointer: stir / heat / draw walls ---------- */
	function brushWallR() { return Math.max(1.8, ny * 0.028); }
	function toGrid(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * nx, y: ny - (e.clientY - r.top) / r.height * ny }; }
	var drag = null;
	canvas.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return; canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true }); drag = toGrid(e); $("fl-hint").classList.add("is-gone"); apply(drag, drag, e);
	});
	canvas.addEventListener("pointermove", function (e) {
		var p = toGrid(e); cursor = p; if (!drag) { if (!running) draw(); return; }
		apply(drag, p, e); drag = p; if (!running) draw();
	});
	function end() { drag = null; }
	canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("pointerleave", function () { cursor = null; });
	function apply(a, b, e) {
		var rad = Math.max(2.4, ny * 0.032), U = Math.max(0.3, refU());
		if (cfg.brush === "wall" || cfg.brush === "erase") {
			var n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.2)); for (var i = 0; i <= n; i++) sim.paintSolid(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, brushWallR(), cfg.brush === "wall");
			sim.zeroSolid(); return;
		}
		if (cfg.brush === "heat") { sim.splat(b.x, b.y, 0, 0, rad, [0.12, 0.08, 0.04], 0.35); return; }
		var dx = b.x - a.x, dy = b.y - a.y, mag = Math.hypot(dx, dy), gain = 0.9, cap = 5 * U;
		if (mag * gain > cap) { dx *= cap / (mag * gain); dy *= cap / (mag * gain); }
		hue = (hue + 0.004 + mag * 0.0015) % 1; var c = F.hsv(hue, 0.6, 1);
		sim.splat(b.x, b.y, dx * gain, dy * gain, rad, [c[0] * 0.2, c[1] * 0.2, c[2] * 0.2], 0);
	}

	/* ---------- page tools ---------- */
	function paintTheatre() { $("fl-theatre").setAttribute("aria-pressed", String(document.documentElement.classList.contains("page-theatre"))); }
	$("fl-theatre").onclick = function () {
		var on = !document.documentElement.classList.contains("page-theatre");
		document.documentElement.classList.toggle("page-theatre", on); document.documentElement.classList.toggle("page-wide", on);
		try { localStorage.setItem("pageMode", on ? "theatre" : "std"); localStorage.setItem("pageWide", on ? "1" : "0"); } catch (e) {}
		paintTheatre(); setTimeout(function () { sizeCanvas(); draw(); }, 50);
	};
	paintTheatre();
	$("fl-full").onclick = function () { var w = $("fl-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	document.addEventListener("fullscreenchange", function () { setTimeout(function () { sizeCanvas(); draw(); }, 60); });
	$("fl-png").onclick = function () { draw(); canvas.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "fluid-simulation-" + P.id + ".png"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); };
	var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (sim) { sizeCanvas(); draw(); } }, 80); });
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " " && (tag === "canvas" || tag === "body")) { e.preventDefault(); setRunning(!running); }
		else if (e.key === "r" || e.key === "R") restart(); else if (e.key === "ArrowRight" && tag === "canvas") { e.preventDefault(); $("fl-step").onclick(); }
	});
	document.addEventListener("visibilitychange", function () { lastT = 0; });

	/* ---------- share link + toast ---------- */
	var toastT;
	function toast(msg) { var t = $("fl-toast"); if (!t) { t = document.createElement("div"); t.id = "fl-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	$("fl-link").onclick = function () {
		var o = new URLSearchParams(); o.set("p", P.id); o.set("re", niceRe(par.re)); if (P.mode === "tunnel" || P.lid) o.set("u", fmt(par.U, 2)); o.set("v", view); o.set("res", cfg.res);
		if (par.vort) o.set("vort", fmt(par.vort, 2)); if (par.beta) o.set("beta", fmt(par.beta, 3)); if (cfg.arrows) o.set("a", "1");
		if (par.shape && P.mode === "tunnel") { o.set("ob", par.shape.kind); o.set("sz", fmt(par.shape.size, 2)); o.set("ang", par.shape.angle); }
		var url = location.origin + location.pathname + "?" + o.toString();
		function done() { toast("Link copied"); } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};

	/* ---------- start ---------- */
	var ov = {};
	if (fromLink) {
		var nn = function (k) { var x = parseFloat(q.get(k)); return isFinite(x) ? x : null; };
		ov = { re: nn("re"), U: nn("u"), vort: nn("vort"), beta: nn("beta"), sz: nn("sz"), ang: nn("ang"), ob: /^(cylinder|square|plate|wedge|tandem|pair|none)$/.test(q.get("ob") || "") ? q.get("ob") : null };
		if (ov.re != null) ov.re = Math.max(10, Math.min(5000, ov.re)); if (ov.U != null) ov.U = Math.max(0.3, Math.min(2.5, ov.U));
		if (ov.sz != null) ov.sz = Math.max(0.08, Math.min(0.4, ov.sz)); if (ov.ang != null) ov.ang = Math.max(-45, Math.min(45, ov.ang));
	}
	load(cfg.preset, ov);
	if (fromLink) history.replaceState(null, "", location.pathname);
	requestAnimationFrame(frame);
})();
