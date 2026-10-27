/* Hutchison Effect Simulator page: lab floor (canvas), target camera, editor, charts, schematic and equipment views. Model: lib.js (MESHut). */
(function () {
	"use strict";
	var H = window.MESHut, root = document.getElementById("hx"); if (!H || !root) return;
	function $(id) { return document.getElementById(id); }
	var KEY = "mes-hutchison-effect-simulator:v1", DEV = H.DEV, MAT = H.MAT;
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c]; }); }
	function nameOf(d) { return d.label || (d.t === "sample" ? (H.SAMPLES[d.shape] ? H.SAMPLES[d.shape].name : "Sample") : (DEV[d.t] ? DEV[d.t].name : d.t)); }
	function isDark() { return document.body.classList.contains("dark-mode"); }
	var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	/* ================= state ================= */
	var st = null, ui = {tool: "move", sel: null, add: null, map: "D", speed: 60, run: true, opts: {cab: true, lab: true, cam: true, arr: false, ring: true}, cableFrom: null, tab: "lab"}, simT = 0, events = [], anims = [], parts = [], gapNext = {}, ostate = {}, rnd = H.rng(1989), idn = 0;
	function newId() { var id; do { id = "u" + (++idn).toString(36); } while (st.items.some(function (d) { return d.id === id; })); return id; }
	function byId(id) { for (var i = 0; i < st.items.length; i++) if (st.items[i].id === id) return st.items[i]; return null; }
	function loadPreset(k) { var P = H.PRESETS[k]; st = P.build(); st.preset = k; resetRun(); ui.sel = null; dirty(true); renderAll(); note(P.note); }
	function resetRun() { simT = 0; events = []; anims = []; parts = []; gapNext = {}; ostate = {}; rnd = H.rng(1989); }
	function save() { try { localStorage.setItem(KEY, JSON.stringify({s: H.pack(st), ui: {map: ui.map, speed: ui.speed, opts: ui.opts}})); } catch (e) { /* ignore */ } }
	var saveT = 0; function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }
	function init() {
		var q = new URLSearchParams(location.search), s = q.get("s"), saved = null;
		try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { /* ignore */ }
		if (saved && saved.ui) { if (saved.ui.map) ui.map = saved.ui.map; if (saved.ui.speed) ui.speed = saved.ui.speed; if (saved.ui.opts) Object.keys(ui.opts).forEach(function (k) { if (saved.ui.opts[k] != null) ui.opts[k] = !!saved.ui.opts[k]; }); }
		if (s) st = H.decode(s);
		if (!st && q.get("p") && H.PRESETS[q.get("p")]) { st = H.PRESETS[q.get("p")].build(); st.preset = q.get("p"); }
		if (!st && saved && saved.s) st = H.unpack(saved.s);
		if (!st) { st = H.PRESETS.lads.build(); st.preset = "lads"; }
		var tb = q.get("tab"); if (tb && /^(lab|sch|eq)$/.test(tb)) ui.tab = tb;
		if (s || q.get("p")) { try { history.replaceState(null, "", location.pathname + (tb ? "?tab=" + tb : "")); } catch (e) { /* ignore */ } }
	}

	/* ================= field cache ================= */
	var src = [], gridC = null, gridLo = false, gridT = 0, mapImg = document.createElement("canvas"), mapDirty = true, info = null;
	function dirty(now) { src = H.sources(st); info = H.resolve(st); if (st) st.items.forEach(function (d) { delete d.__fa; }); clearTimeout(gridT); if (now) computeGrid(false); else { computeGrid(true); gridT = setTimeout(function () { computeGrid(false); redrawStatic(); }, 220); } saveSoon(); }
	function computeGrid(lo) {
		var r = st.room, n = lo ? 56 : 132, nx = r.w >= r.h ? n : Math.max(12, Math.round(n * r.w / r.h)), ny = r.w >= r.h ? Math.max(12, Math.round(n * r.h / r.w)) : n;
		gridC = H.grid(src, r, nx, ny); gridLo = lo; mapDirty = true;
	}
	function fieldAtObj(d) { return H.fieldAt(src, d.x, d.y); }
	function samples() { return st.items.filter(function (d) { return d.t === "sample"; }); }
	function zone() { return st.items.filter(function (d) { return d.t === "zone"; })[0] || null; }
	function neighbour(o) { return samples().some(function (p) { return p !== o && p.mat !== o.mat && Math.hypot(p.x - o.x, p.y - o.y) < 0.6; }); }

	/* ================= colour maps ================= */
	var STOPS = {
		hot: [[0, 8, 6, 20], [0.25, 60, 15, 90], [0.5, 170, 30, 90], [0.75, 245, 130, 30], [1, 255, 245, 160]],
		drive: [[0, 6, 8, 18], [0.3, 40, 20, 90], [0.55, 120, 40, 160], [0.8, 230, 120, 60], [1, 255, 236, 120]],
		cool: [[0, 5, 10, 20], [0.35, 10, 60, 110], [0.7, 30, 170, 190], [1, 210, 255, 240]],
		div: [[0, 40, 90, 220], [0.5, 12, 14, 22], [1, 235, 70, 50]]
	};
	function cmap(name, t) { var s = STOPS[name]; t = t < 0 ? 0 : t > 1 ? 1 : t; for (var i = 1; i < s.length; i++) if (t <= s[i][0]) { var a = s[i - 1], b = s[i], u = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]; } var l = s[s.length - 1]; return [l[1], l[2], l[3]]; }
	var MAPS = {
		D: {name: "Hutchison drive (best estimate)", leg: ["0", "drive", "1"], map: "drive", v: function (g, k) { return g.D[k]; }},
		E: {name: "Electric field |E| (rms)", leg: ["10 V/m", "log scale", "300 kV/m"], map: "hot", v: function (g, k) { return (Math.log10(Math.max(10, g.E[k])) - 1) / 4.48; }},
		B: {name: "Magnetic field |B|", leg: ["0.01 µT", "log scale", "1 mT"], map: "cool", v: function (g, k) { return (Math.log10(Math.max(0.01, g.B[k])) + 2) / 5; }},
		N: {name: "Overlap: how many sources meet", leg: ["1 source", "", "5+ equal sources"], map: "cool", v: function (g, k) { return (g.N[k] - 1) / 4; }},
		W: {name: "Standing waves (locked sources)", leg: ["node", "no interference", "antinode"], map: "div", v: function (g, k) { var c = g.coh[k]; return 0.5 + 0.5 * Math.max(-1, Math.min(1, Math.log(c) / Math.log(4))); }},
		I: {name: "Camera / instrument glitch risk (10 V/m gear)", leg: ["0%", "", "100%"], map: "hot", v: function (g, k) { return H.emfRisk(g.Eac[k], 10); }},
		T: {name: "Field in time (slowed right down)", leg: ["0", "|E(t)|", "peak"], map: "hot", v: null}
	};
	function paintMap() {
		var g = gridC; if (!g) return; var m = MAPS[ui.map] || MAPS.D; mapImg.width = g.nx; mapImg.height = g.ny;
		var cx = mapImg.getContext("2d"), im = cx.createImageData(g.nx, g.ny), p = im.data;
		if (ui.map === "T") return paintTime(cx, im);
		for (var k = 0; k < g.nx * g.ny; k++) { var c = cmap(m.map, m.v(g, k)); p[k * 4] = c[0]; p[k * 4 + 1] = c[1]; p[k * 4 + 2] = c[2]; p[k * 4 + 3] = 255; }
		cx.putImageData(im, 0, 0); mapDirty = false;
	}
	// time view: every frequency group turns at a slowed-down display rate that keeps their order and their beats visible; free-running groups drift
	function dispRate(f, fmin) { return 0.7 + 2.4 * Math.tanh(8 * Math.log10(f / fmin) / 2.4); }
	var tview = 0, peakT = 1;
	function paintTime(cx, im) {
		var g = gridC, p = im.data, n = g.nx * g.ny, fmin = Infinity; g.groups.forEach(function (q) { if (q.f > 0 && q.f < fmin) fmin = q.f; });
		var w = g.groups.map(function (q, i) { return TAU * (dispRate(q.f, fmin) + 0.07 * (i % 3)); }), cs = w.map(function (x) { return Math.cos(x * tview); }), sn = w.map(function (x) { return Math.sin(x * tview); }), mx = 0;
		var val = new Float32Array(n);
		for (var k = 0; k < n; k++) {
			var ex = g.Sx[k], ey = g.Sy[k];
			for (var q = 0; q < g.Z.length; q++) { var z = g.Z[q], b = k * 4; ex += z[b] * cs[q] - z[b + 1] * sn[q]; ey += z[b + 2] * cs[q] - z[b + 3] * sn[q]; }
			var v = Math.sqrt(ex * ex + ey * ey); val[k] = v; if (v > mx) mx = v;
		}
		peakT = Math.max(peakT * 0.98, mx);
		for (var kk = 0; kk < n; kk++) { var c = cmap("hot", Math.pow(Math.log10(1 + 99 * val[kk] / peakT) / 2, 1.2)); p[kk * 4] = c[0]; p[kk * 4 + 1] = c[1]; p[kk * 4 + 2] = c[2]; p[kk * 4 + 3] = 255; }
		cx.putImageData(im, 0, 0);
	}
	var TAU = Math.PI * 2;

	/* ================= symbols (shared by floor, schematic, equipment) ================= */
	function sym(c, t, x, y, s, col, o) {
		o = o || {}; c.save(); c.translate(x, y); c.lineWidth = Math.max(1, s * 0.07); c.strokeStyle = col; c.fillStyle = col; c.lineJoin = "round"; c.lineCap = "round";
		var u = s / 2;
		function coil(x0, y0, x1, y1, n, amp) { c.beginPath(); for (var i = 0; i <= n * 8; i++) { var t2 = i / (n * 8), xx = x0 + (x1 - x0) * t2, yy = y0 + (y1 - y0) * t2, a = Math.sin(t2 * n * TAU) * amp, nx2 = -(y1 - y0), ny2 = (x1 - x0), L = Math.hypot(nx2, ny2) || 1; c.lineTo(xx + nx2 / L * a, yy + ny2 / L * a); } c.stroke(); }
		function ball(xx, yy, r) { var g = c.createRadialGradient(xx - r * 0.35, yy - r * 0.35, r * 0.1, xx, yy, r); g.addColorStop(0, "#fff"); g.addColorStop(1, col); c.fillStyle = g; c.beginPath(); c.arc(xx, yy, r, 0, TAU); c.fill(); c.fillStyle = col; }
		switch (t) {
			case "tesla_large": case "tesla_small":
				coil(0, u * 0.75, 0, -u * 0.35, t === "tesla_large" ? 7 : 5, u * 0.22); c.beginPath(); c.ellipse(0, -u * 0.55, u * 0.6, u * 0.2, 0, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(0, u * 0.75, u * 0.45, u * 0.12, 0, 0, TAU); c.stroke();
				if (t === "tesla_small") { c.beginPath(); c.arc(u * 0.62, u * 0.45, u * 0.18, 0, TAU); c.stroke(); c.beginPath(); c.arc(u * 0.62, u * 0.45, u * 0.05, 0, TAU); c.fill(); }
				break;
			case "tesla_dumbbell": coil(-u * 0.5, 0, u * 0.5, 0, 6, u * 0.18); ball(-u * 0.72, 0, u * 0.24); ball(u * 0.72, 0, u * 0.24); c.beginPath(); c.ellipse(0, 0, u * 0.12, u * 0.32, 0, 0, TAU); c.stroke(); break;
			case "vdg": c.beginPath(); c.moveTo(-u * 0.14, u * 0.85); c.lineTo(-u * 0.14, -u * 0.1); c.moveTo(u * 0.14, u * 0.85); c.lineTo(u * 0.14, -u * 0.1); c.stroke(); c.beginPath(); c.moveTo(-u * 0.45, u * 0.85); c.lineTo(u * 0.45, u * 0.85); c.stroke(); ball(0, -u * 0.38, u * 0.42); break;
			case "fieldshaper": coil(0, u * 0.8, 0, u * 0.05, 4, u * 0.18); ball(0, -u * 0.25, u * 0.3); c.beginPath(); c.ellipse(0, -u * 0.25, u * 0.75, u * 0.2, 0, 0, TAU); c.stroke(); break;
			case "hvps": c.strokeRect(-u * 0.75, -u * 0.55, u * 1.5, u * 1.1); c.font = "700 " + Math.round(u * 0.5) + "px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("HV", 0, -u * 0.08); c.beginPath(); c.moveTo(-u * 0.4, u * 0.32); c.lineTo(u * 0.4, u * 0.32); c.stroke(); break;
			case "mains": c.strokeRect(-u * 0.5, -u * 0.65, u, u * 1.3); c.fillRect(-u * 0.25, -u * 0.35, u * 0.09, u * 0.3); c.fillRect(u * 0.16, -u * 0.35, u * 0.09, u * 0.3); c.beginPath(); c.arc(0, u * 0.25, u * 0.1, 0, TAU); c.fill(); break;
			case "sparkgap": c.beginPath(); c.moveTo(-u * 0.85, 0); c.lineTo(-u * 0.22, 0); c.moveTo(u * 0.85, 0); c.lineTo(u * 0.22, 0); c.stroke(); ball(-u * 0.2, 0, u * 0.13); ball(u * 0.2, 0, u * 0.13);
				c.beginPath(); c.moveTo(-u * 0.08, -u * 0.35); c.lineTo(u * 0.05, -u * 0.12); c.lineTo(-u * 0.05, -u * 0.05); c.lineTo(u * 0.1, u * 0.2); c.stroke();
				c.beginPath(); c.moveTo(-u * 0.6, u * 0.45); c.lineTo(u * 0.6, u * 0.45); c.moveTo(-u * 0.6, u * 0.62); c.lineTo(u * 0.6, u * 0.62); c.stroke(); break;
			case "tank": c.beginPath(); c.moveTo(-u * 0.5, -u * 0.7); c.lineTo(-u * 0.5, -u * 0.12); c.moveTo(-u * 0.82, -u * 0.12); c.lineTo(-u * 0.18, -u * 0.12); c.moveTo(-u * 0.82, u * 0.08); c.lineTo(-u * 0.18, u * 0.08); c.moveTo(-u * 0.5, u * 0.08); c.lineTo(-u * 0.5, u * 0.7); c.stroke(); coil(u * 0.45, -u * 0.6, u * 0.45, u * 0.6, 4, u * 0.2);
				c.beginPath(); c.moveTo(-u * 0.5, -u * 0.7); c.lineTo(u * 0.45, -u * 0.7); c.moveTo(-u * 0.5, u * 0.7); c.lineTo(u * 0.45, u * 0.7); c.stroke(); break;
			case "inductor": c.beginPath(); c.ellipse(0, 0, u * 0.75, u * 0.75, 0, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(0, 0, u * 0.38, u * 0.38, 0, 0, TAU); c.stroke(); for (var i = 0; i < 14; i++) { var a = i / 14 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * u * 0.38, Math.sin(a) * u * 0.38); c.lineTo(Math.cos(a) * u * 0.75, Math.sin(a) * u * 0.75); c.stroke(); } break;
			case "rf_tx": c.strokeRect(-u * 0.75, -u * 0.05, u * 0.9, u * 0.7); c.beginPath(); c.moveTo(-u * 0.3, -u * 0.05); c.lineTo(-u * 0.3, -u * 0.85); c.stroke(); for (var w = 1; w <= 3; w++) { c.beginPath(); c.arc(-u * 0.3, -u * 0.85, u * 0.2 * w, -0.9, 0.9); c.stroke(); } c.beginPath(); c.arc(-u * 0.5, u * 0.3, u * 0.08, 0, TAU); c.fill(); break;
			case "siggen": c.strokeRect(-u * 0.8, -u * 0.5, u * 1.6, u); c.beginPath(); for (var k = 0; k <= 40; k++) { var xx = -u * 0.6 + k / 40 * u * 1.2; c.lineTo(xx, Math.sin(k / 40 * TAU * 2) * u * 0.25); } c.stroke(); break;
			case "dur": c.beginPath(); c.arc(0, 0, u * 0.14, 0, TAU); c.fill(); for (var b = 0; b < 3; b++) { var a0 = b * TAU / 3 - Math.PI / 2 - 0.5; c.beginPath(); c.arc(0, 0, u * 0.75, a0, a0 + 1); c.arc(0, 0, u * 0.24, a0 + 1, a0, true); c.closePath(); c.fill(); } break;
			case "camera": c.strokeRect(-u * 0.7, -u * 0.4, u * 1.05, u * 0.8); c.beginPath(); c.moveTo(u * 0.35, -u * 0.15); c.lineTo(u * 0.8, -u * 0.4); c.lineTo(u * 0.8, u * 0.4); c.lineTo(u * 0.35, u * 0.15); c.closePath(); c.stroke(); c.beginPath(); c.arc(-u * 0.45, -u * 0.6, u * 0.18, 0, TAU); c.arc(-u * 0.05, -u * 0.6, u * 0.18, 0, TAU); c.stroke(); break;
			case "meter": c.beginPath(); c.arc(0, u * 0.15, u * 0.7, Math.PI, TAU); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(0, u * 0.15); c.lineTo(u * 0.4, -u * 0.35); c.stroke(); c.strokeRect(-u * 0.8, u * 0.15, u * 1.6, u * 0.45); break;
			case "operator": c.beginPath(); c.arc(0, -u * 0.55, u * 0.25, 0, TAU); c.fill(); c.beginPath(); c.moveTo(0, -u * 0.3); c.lineTo(0, u * 0.35); c.moveTo(-u * 0.45, -u * 0.05); c.lineTo(u * 0.45, -u * 0.05); c.moveTo(0, u * 0.35); c.lineTo(-u * 0.32, u * 0.85); c.moveTo(0, u * 0.35); c.lineTo(u * 0.32, u * 0.85); c.stroke(); break;
			case "zone": c.setLineDash([u * 0.18, u * 0.12]); c.strokeRect(-u * 0.8, -u * 0.6, u * 1.6, u * 1.2); c.setLineDash([]); break;
			case "area": c.strokeRect(-u * 0.8, -u * 0.5, u * 1.6, u); break;
			case "sample": c.fillRect(-u * 0.7, -u * 0.18, u * 1.4, u * 0.36); break;
		}
		c.restore();
	}

	/* ================= the lab floor ================= */
	var stage = $("hx-stage"), cv = $("hx-c"), cx = cv.getContext("2d"), W = 800, Hh = 500, dpr = 1, view = {s: 40, ox: 20, oy: 20};
	var camC = $("hx-cam"), camX = camC.getContext("2d"), CW = 800, CH = 200;
	function layout() {
		var wrap = stage.parentNode, w = wrap.clientWidth || 800; dpr = Math.min(2, window.devicePixelRatio || 1);
		var asp = Math.max(1.1, Math.min(2.2, st.room.w / st.room.h)), h = Math.round(w / asp + 24);
		wrap.setAttribute("data-mes-free", "1"); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		var fullish = document.fullscreenElement === wrap || wrap.classList.contains("mes-fill");
		if (fullish) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 260;
		if (w < 600 && !fullish) h = Math.max(h, Math.round(w * 0.82));   // phones: room for the controls over the floor
		h = Math.max(260, h);
		stage.style.width = w + "px"; stage.style.height = h + "px"; W = w; Hh = h;
		var cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var pad = 26, s = Math.min((w - 2 * pad) / st.room.w, (h - 2 * pad - 10) / st.room.h); view = {s: s, ox: (w - s * st.room.w) / 2, oy: (h - s * st.room.h) / 2 + 4};
		camC.parentNode.style.display = ui.opts.cam ? "" : "none";
		CW = w; CH = Math.round(Math.max(150, Math.min(260, w * 0.28))); camC.style.height = CH + "px"; camC.width = Math.round(CW * dpr); camC.height = Math.round(CH * dpr);
		drawCharts();
	}
	function toPx(x, y) { return [view.ox + x * view.s, view.oy + y * view.s]; }
	function toM(px, py) { return [(px - view.ox) / view.s, (py - view.oy) / view.s]; }
	function itemR(d) { var T = DEV[d.t]; if (d.t === "sample") return Math.max(9, 0.22 * view.s); return Math.max(11, (T ? T.size : 0.5) * view.s * 0.5); }

	var flash = {};   // spark gap id -> real time of the last firing (for the drawing)
	function drawFloor(now) {
		var c = cx, dark = true; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#07090f"; c.fillRect(0, 0, W, Hh);
		var r = st.room, p0 = toPx(0, 0), sw = r.w * view.s, sh = r.h * view.s;
		if (ui.map === "T" || mapDirty) paintMap();
		c.imageSmoothingEnabled = true; c.globalAlpha = 0.92; c.drawImage(mapImg, p0[0], p0[1], sw, sh); c.globalAlpha = 1;
		// grid (1 m) + walls
		c.strokeStyle = "rgba(255,255,255,0.06)"; c.lineWidth = 1; c.beginPath();
		var step = view.s < 18 ? 2 : 1;
		for (var x = step; x < r.w; x += step) { var px = p0[0] + x * view.s; c.moveTo(px, p0[1]); c.lineTo(px, p0[1] + sh); }
		for (var y = step; y < r.h; y += step) { var py = p0[1] + y * view.s; c.moveTo(p0[0], py); c.lineTo(p0[0] + sw, py); }
		c.stroke(); c.strokeStyle = "#cbd5e1"; c.lineWidth = 3; c.strokeRect(p0[0], p0[1], sw, sh);
		c.fillStyle = "#94a3b8"; c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(r.w.toFixed(1) + " m (" + Math.round(r.w * 3.281) + " ft)", p0[0] + sw / 2, p0[1] + sh + 15);
		c.save(); c.translate(p0[0] - 12, p0[1] + sh / 2); c.rotate(-Math.PI / 2); c.fillText(r.h.toFixed(1) + " m", 0, 0); c.restore();
		// areas and zones first
		st.items.forEach(function (d) { if (d.t === "area" || d.t === "zone") drawArea(c, d); });
		if (ui.opts.cab) drawCables(c, now);
		st.items.forEach(function (d) { if (d.t !== "area" && d.t !== "zone" && d.t !== "sample") drawDevice(c, d, now); });
		samples().forEach(function (d) { drawSampleTop(c, d, now); });
		// sparks while a gap fires
		Object.keys(flash).forEach(function (id) { var d = byId(id), age = (now - flash[id]) / 1000; if (!d || age > 0.45) { delete flash[id]; return; } var p = toPx(d.x, d.y); c.save(); c.globalAlpha = 1 - age / 0.45; var g = c.createRadialGradient(p[0], p[1], 2, p[0], p[1], 60); g.addColorStop(0, "rgba(255,240,255,0.9)"); g.addColorStop(1, "rgba(200,120,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], 60, 0, TAU); c.fill(); c.restore(); });
		drawParts(c, "floor");
		// cable being drawn
		if (ui.tool === "cable" && ui.cableFrom && hover) { var a = byId(ui.cableFrom); if (a) { var pa = toPx(a.x, a.y); c.strokeStyle = "#fde047"; c.setLineDash([6, 5]); c.lineWidth = 2; c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(hover.px, hover.py); c.stroke(); c.setLineDash([]); } }
		// scale bar
		var bar = view.s >= 30 ? 1 : view.s >= 12 ? 2 : 5; c.strokeStyle = "#e2e8f0"; c.lineWidth = 2; c.beginPath(); c.moveTo(12, Hh - 12); c.lineTo(12 + bar * view.s, Hh - 12); c.stroke(); c.fillStyle = "#e2e8f0"; c.textAlign = "left"; c.font = "11px system-ui,sans-serif"; c.fillText(bar + " m", 14, Hh - 17);
		// placement ghost
		if (ui.add && hover) { c.globalAlpha = 0.55; var t = ui.add.t; sym(c, t === "sample" ? "sample" : t, hover.px, hover.py, Math.max(22, (DEV[t] ? DEV[t].size : 0.4) * view.s), "#fde047"); c.globalAlpha = 1; }
	}
	function drawArea(c, d) {
		var p = toPx(d.x - d.w / 2, d.y - d.h / 2), w = d.w * view.s, h = d.h * view.s, sel = ui.sel === d.id;
		c.save(); if (d.t === "zone") { c.setLineDash([7, 5]); c.strokeStyle = "#facc15"; c.lineWidth = 2; c.fillStyle = "rgba(250,204,21,0.06)"; c.fillRect(p[0], p[1], w, h); c.strokeRect(p[0], p[1], w, h); }
		else if (d.w * d.h > 6) { c.strokeStyle = "rgba(203,213,225,0.55)"; c.lineWidth = 2; c.strokeRect(p[0], p[1], w, h); }
		else { c.fillStyle = "rgba(71,85,105,0.55)"; c.strokeStyle = "rgba(148,163,184,0.7)"; c.lineWidth = 1; c.fillRect(p[0], p[1], w, h); c.strokeRect(p[0], p[1], w, h); }
		c.setLineDash([]);
		if (showLab(d) || d.t === "zone") { c.fillStyle = d.t === "zone" ? "#fde68a" : "#cbd5e1"; c.font = "600 11px system-ui,sans-serif"; c.textAlign = "left"; c.fillText(nameOf(d), p[0] + 4, p[1] + 13); }
		if (sel) { c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.strokeRect(p[0] - 3, p[1] - 3, w + 6, h + 6); c.fillStyle = "#fff"; c.fillRect(p[0] + w - 4, p[1] + h - 4, 9, 9); }
		c.restore();
	}
	function cableEnds(c0) { var a = byId(c0[0]), b = byId(c0[1]); return a && b ? [a, b] : null; }
	function drawCables(c, now) {
		st.cables.forEach(function (cb) {
			var e = cableEnds(cb); if (!e) return; var a = toPx(e[0].x, e[0].y), b = toPx(e[1].x, e[1].y), hv = /^(hvps|sparkgap|tank|inductor|tesla|fieldshaper)/.test(e[0].t), sig = e[0].t === "siggen";
			c.strokeStyle = sig ? "rgba(96,165,250,0.75)" : hv ? "rgba(248,113,113,0.75)" : "rgba(203,213,225,0.55)"; c.lineWidth = hv ? 2.2 : 1.5;
			var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.min(40, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.12);
			c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(mx, my, b[0], b[1]); c.stroke();
			// a dot travelling along shows the direction (from -> to)
			var t = ((now / 1600) + (cb[0].length * 0.13)) % 1, qx = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * mx + t * t * b[0], qy = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * my + t * t * b[1];
			c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(qx, qy, 2.4, 0, TAU); c.fill();
		});
	}
	function devColor(d) { return d.on === false ? "#4b5563" : (DEV[d.t] ? DEV[d.t].color : "#ccc"); }
	function drawDevice(c, d, now) {
		var T = DEV[d.t]; if (!T) return; var p = toPx(d.x, d.y), R = itemR(d), sel = ui.sel === d.id, col = devColor(d), rot = (+d.rot || 0) * Math.PI / 180;
		c.save();
		if (d.t === "tesla_dumbbell") {
			var L = 0.7 * view.s, ex = Math.cos(rot) * L, ey = Math.sin(rot) * L;
			c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.moveTo(p[0] - ex, p[1] - ey); c.lineTo(p[0] + ex, p[1] + ey); c.stroke();
			[[1, "+"], [-1, "−"]].forEach(function (q) { var x = p[0] + ex * q[0], y = p[1] + ey * q[0], rr = Math.max(7, 0.12 * view.s); c.fillStyle = "#0b0f17"; c.beginPath(); c.arc(x, y, rr + 2, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); });
		}
		if (d.on !== false && T.kind !== "inst" && T.kind !== "op" && T.kind !== "rad" && d.t !== "mains" && ui.opts.ring && T.kind !== "pow") {   // a breathing ring: the source is live
			var ph = ((now / 1000) * 0.9 + (d.x + d.y) * 0.1) % 1; c.strokeStyle = col; c.globalAlpha = 0.45 * (1 - ph); c.lineWidth = 2; c.beginPath(); c.arc(p[0], p[1], R + ph * R * 1.6, 0, TAU); c.stroke(); c.globalAlpha = 1;
		}
		c.fillStyle = "rgba(9,12,20,0.85)"; c.strokeStyle = sel ? "#fff" : col; c.lineWidth = sel ? 2.5 : 1.5; c.beginPath(); c.arc(p[0], p[1], R, 0, TAU); c.fill(); c.stroke();
		sym(c, d.t, p[0], p[1], R * 1.45, col);
		if (d.t === "rf_tx" || d.t === "fieldshaper" || d.t === "camera") {   // pointing direction
			c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2; var ax = p[0] + Math.cos(rot) * (R + 12), ay = p[1] + Math.sin(rot) * (R + 12);
			if (d.t === "camera") { c.globalAlpha = 0.18; c.beginPath(); c.moveTo(p[0], p[1]); c.arc(p[0], p[1], R + 60, rot - 0.4, rot + 0.4); c.closePath(); c.fill(); c.globalAlpha = 1; }
			else { c.beginPath(); c.moveTo(p[0] + Math.cos(rot) * R, p[1] + Math.sin(rot) * R); c.lineTo(ax, ay); c.stroke(); c.beginPath(); c.moveTo(ax + Math.cos(rot) * 5, ay + Math.sin(rot) * 5); c.lineTo(ax + Math.cos(rot + 2.5) * 6, ay + Math.sin(rot + 2.5) * 6); c.lineTo(ax + Math.cos(rot - 2.5) * 6, ay + Math.sin(rot - 2.5) * 6); c.closePath(); c.fill(); }
		}
		if (d.t === "camera" || d.t === "meter" || d.t === "operator") {   // instrument status
			var fa = H.fieldAt(src, d.x, d.y), risk = d.t === "camera" ? H.emfRisk(fa.Eac, +d.imm || 10) : d.t === "operator" ? Math.min(1, fa.E / H.eRef(fa.fDom)) : 0;
			if (risk > 0.05) { c.fillStyle = risk > 0.5 ? "#ef4444" : "#f59e0b"; c.beginPath(); c.arc(p[0] + R * 0.75, p[1] - R * 0.75, 4.5, 0, TAU); c.fill(); }
		}
		if (showLab(d)) { c.fillStyle = d.on === false ? "#6b7280" : "#e5e7eb"; c.font = "600 11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; label(c, nameOf(d), p[0], p[1] + R + 3); c.textBaseline = "alphabetic"; }
		if (sel && (d.t === "rf_tx" || d.t === "fieldshaper" || d.t === "camera" || d.t === "tesla_dumbbell" || d.t === "sample")) { var hp = rotHandle(d); c.strokeStyle = "#fff"; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(hp[0], hp[1]); c.stroke(); c.setLineDash([]); c.fillStyle = "#fde047"; c.beginPath(); c.arc(hp[0], hp[1], 6, 0, TAU); c.fill(); }
		if (ui.cableFrom === d.id) { c.strokeStyle = "#fde047"; c.lineWidth = 3; c.beginPath(); c.arc(p[0], p[1], R + 5, 0, TAU); c.stroke(); }
		c.restore();
	}
	function label(c, t, x, y) { var w = c.measureText(t).width; c.save(); c.fillStyle = "rgba(7,9,15,0.72)"; c.fillRect(x - w / 2 - 3, y - 1, w + 6, 14); c.restore(); c.fillText(t, x, y); }
	// on a small floor (a phone) only the selected item, the hovered one and the zones keep their labels
	function showLab(d) { if (!ui.opts.lab) return false; if (view.s >= 22 || ui.sel === d.id || d.t === "zone") return true; if (hover) { var p = toPx(d.x, d.y); return Math.hypot(hover.px - p[0], hover.py - p[1]) < 40; } return false; }
	function rotHandle(d) { var p = toPx(d.x, d.y), R = itemR(d) + (d.t === "tesla_dumbbell" ? 0.7 * view.s : 0) + 18, a = (+d.rot || 0) * Math.PI / 180; return [p[0] + Math.cos(a) * R, p[1] + Math.sin(a) * R]; }

	// samples seen from above, with their live state
	function os(id) { return ostate[id] || (ostate[id] = {bend: 0, broken: 0, fused: 0, n: 0}); }
	function animOf(id, now) { var out = {}; anims.forEach(function (a) { if (a.id === id) { var u = (now - a.t0) / (a.dur * 1000); if (u >= 0 && u <= 1) out[a.e] = u; } }); return out; }
	function liftAt(u) { return u < 0.3 ? u / 0.3 : u < 0.75 ? 1 + 0.06 * Math.sin((u - 0.3) * 30) : Math.max(0, 1 - (u - 0.75) / 0.25); }
	function drawSampleTop(c, d, now) {
		var M = MAT[d.mat] || MAT.al, p = toPx(d.x, d.y), s = Math.max(10, 0.32 * view.s), a = animOf(d.id, now), o = os(d.id), sel = ui.sel === d.id, rot = (+d.rot || 0) * Math.PI / 180;
		var lift = a.lev != null ? liftAt(a.lev) : 0, wob = a.wob != null ? Math.sin(a.wob * 60) * (1 - a.wob) * 0.25 : 0, gone = a.van != null ? (a.van > 0.2 && a.van < 0.8) : false;
		c.save();
		if (lift > 0) { c.fillStyle = "rgba(0,0,0,0.45)"; c.beginPath(); c.ellipse(p[0] + lift * 6, p[1] + lift * 8, s * 0.6, s * 0.3, 0, 0, TAU); c.fill(); }
		c.translate(p[0], p[1] - lift * s * 1.4); c.rotate(rot + wob); var sc = 1 + lift * 0.35; c.scale(sc, sc);
		if (gone) c.globalAlpha = 0.12;
		if (a.glo != null) { var gg = c.createRadialGradient(0, 0, 2, 0, 0, s * 1.6); gg.addColorStop(0, "rgba(255,230,120," + (0.8 * Math.sin(a.glo * Math.PI)) + ")"); gg.addColorStop(1, "rgba(255,120,40,0)"); c.fillStyle = gg; c.beginPath(); c.arc(0, 0, s * 1.6, 0, TAU); c.fill(); }
		c.fillStyle = M.color; c.strokeStyle = sel ? "#fff" : "rgba(0,0,0,0.6)"; c.lineWidth = sel ? 2 : 1;
		shapeTop(c, d.shape, s, o);
		if (o.broken) { c.strokeStyle = "#111"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-s * 0.1, -s * 0.2); c.lineTo(s * 0.05, 0); c.lineTo(-s * 0.05, s * 0.2); c.stroke(); }
		if (o.fused) { c.strokeStyle = "#c084fc"; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, s * 0.75, 0, TAU); c.stroke(); }
		c.restore();
		if (showLab(d)) { c.fillStyle = "#e5e7eb"; c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; label(c, nameOf(d), p[0], p[1] + s * 0.7 + 2); c.textBaseline = "alphabetic"; }
		if (sel) { var hp = rotHandle(d); c.fillStyle = "#fde047"; c.beginPath(); c.arc(hp[0], hp[1], 5, 0, TAU); c.fill(); }
		// drive badge
		var fa = d.__fa; if (fa && fa.D > 0.05) { c.fillStyle = "rgba(250,204,21," + (0.25 + 0.6 * fa.D) + ")"; c.beginPath(); c.arc(p[0] + s * 0.6, p[1] - s * 0.6, 3 + 3 * fa.D, 0, TAU); c.fill(); }
	}
	function shapeTop(c, sh, s, o) {
		var bend = (o.bend || 0) * Math.PI / 180;
		if (sh === "bar" || sh === "rod" || sh === "spoon") {
			var L = s * (sh === "spoon" ? 1.1 : 1.4), T = sh === "rod" ? s * 0.18 : sh === "spoon" ? s * 0.12 : s * 0.3;
			c.beginPath(); c.moveTo(-L / 2, -T / 2); c.quadraticCurveTo(0, -T / 2 + Math.sin(bend) * L * 0.4, L / 2, -T / 2); c.lineTo(L / 2, T / 2); c.quadraticCurveTo(0, T / 2 + Math.sin(bend) * L * 0.4, -L / 2, T / 2); c.closePath(); c.fill(); c.stroke();
			if (sh === "spoon") { c.beginPath(); c.ellipse(L / 2, 0, s * 0.3, s * 0.22, 0, 0, TAU); c.fill(); c.stroke(); }
		} else if (sh === "can" || sh === "disc" || sh === "jar") { c.beginPath(); c.arc(0, 0, s * (sh === "can" ? 0.3 : 0.4), 0, TAU); c.fill(); c.stroke(); }
		else if (sh === "bottle") { c.beginPath(); c.arc(0, 0, s * 0.38, 0, TAU); c.fill(); c.stroke(); c.fillStyle = "#e5e7eb"; c.beginPath(); c.arc(0, 0, s * 0.14, 0, TAU); c.fill(); }
		else if (sh === "sheet") { c.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7); c.strokeRect(-s * 0.5, -s * 0.35, s, s * 0.7); }
		else if (sh === "boat") { c.beginPath(); c.moveTo(-s * 0.6, -s * 0.22); c.lineTo(s * 0.45, -s * 0.22); c.lineTo(s * 0.7, 0); c.lineTo(s * 0.45, s * 0.22); c.lineTo(-s * 0.6, s * 0.22); c.closePath(); c.fill(); c.stroke(); }
		else { c.fillRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84); c.strokeRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84); }
	}

	/* ================= particles (smoke, dust, bubbles, sparks) ================= */
	function puff(where, x, y, kind, n) { for (var i = 0; i < n; i++) parts.push({w: where, x: x, y: y, vx: (Math.random() - 0.5) * (kind === "dust" ? 60 : 14), vy: kind === "bub" ? -10 - Math.random() * 20 : kind === "dust" ? -30 * Math.random() : -12 - Math.random() * 18, life: 0, max: 1.2 + Math.random() * 1.6, k: kind}); if (parts.length > 900) parts.splice(0, parts.length - 900); }
	function stepParts(dt) { for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life += dt; if (p.life > p.max) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === "dust") p.vy += 40 * dt; if (p.k === "smoke") p.vx *= 0.99; } }
	function drawParts(c, where) {
		parts.forEach(function (p) {
			if (p.w !== where) return; var u = p.life / p.max;
			if (p.k === "smoke") { c.fillStyle = "rgba(220,225,235," + (0.35 * (1 - u)) + ")"; c.beginPath(); c.arc(p.x, p.y, 3 + u * 12, 0, TAU); c.fill(); }
			else if (p.k === "dust") { c.fillStyle = "rgba(245,245,240," + (0.9 * (1 - u)) + ")"; c.fillRect(p.x, p.y, 2, 2); }
			else if (p.k === "bub") { c.strokeStyle = "rgba(186,230,253," + (1 - u) + ")"; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, 1.5 + u * 3, 0, TAU); c.stroke(); }
			else if (p.k === "spark") { c.fillStyle = "rgba(255,240,180," + (1 - u) + ")"; c.fillRect(p.x, p.y, 2, 2); }
		});
	}

	/* ================= the target camera (side view) ================= */
	var camCur = null;
	function camDevice() { var cams = st.items.filter(function (d) { return d.t === "camera" && d.on !== false; }); return cams[0] || null; }
	function camSamples() {
		var z = zone(), list = samples();
		if (z) { var inZ = list.filter(function (d) { return Math.abs(d.x - z.x) <= z.w / 2 + 0.2 && Math.abs(d.y - z.y) <= z.h / 2 + 0.2; }); if (inZ.length) list = inZ; }
		return list.slice().sort(function (a, b) { return a.x - b.x; }).slice(0, 8);
	}
	function drawCam(now) {
		if (!ui.opts.cam) return; var c = camX; c.setTransform(dpr, 0, 0, dpr, 0, 0);
		var cam = camDevice(), fa = cam ? H.fieldAt(src, cam.x, cam.y) : null, risk = cam ? H.emfRisk(fa.Eac, +cam.imm || 10) : 0;
		var bg = c.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, "#151a22"); bg.addColorStop(1, "#05070b"); c.fillStyle = bg; c.fillRect(0, 0, CW, CH);
		// coils in the background (silhouettes of the nearest live high-voltage gear)
		var hv = st.items.filter(function (d) { return d.on !== false && DEV[d.t] && /hv|dc/.test(DEV[d.t].kind); }).slice(0, 4);
		hv.forEach(function (d, i) { var x = CW * (0.12 + 0.76 * (i + 0.5) / Math.max(1, hv.length)), sz = CH * 0.55; c.globalAlpha = 0.28; sym(c, d.t, x, CH * 0.38, sz, "#94a3b8"); c.globalAlpha = 1; if (d.on !== false && Math.random() < 0.06) { c.strokeStyle = "rgba(200,180,255,0.7)"; c.lineWidth = 1; c.beginPath(); var yx = x, yy = CH * 0.12; c.moveTo(yx, yy); for (var k = 0; k < 6; k++) { yx += (Math.random() - 0.5) * 30; yy += 10; c.lineTo(yx, yy); } c.stroke(); } });
		// table
		var ty = CH * 0.78; c.fillStyle = "#3f2e1e"; c.fillRect(CW * 0.04, ty, CW * 0.92, 8); c.fillStyle = "#2a1f15"; c.fillRect(CW * 0.08, ty + 8, 8, CH - ty); c.fillRect(CW * 0.9, ty + 8, 8, CH - ty);
		var list = camSamples(), n = list.length;
		list.forEach(function (d, i) { drawSampleSide(c, d, CW * (0.1 + 0.8 * (i + 0.5) / Math.max(1, n)), ty, Math.min(CW / Math.max(4, n) * 0.55, CH * 0.38), now); });
		drawParts(c, "cam");
		// EMF interference on the picture
		if (cam && risk > 0.02 && !reduce) {
			var g = risk * (0.5 + 0.5 * Math.random());
			if (Math.random() < g * 0.7) { var by = Math.random() * CH, bh = 4 + Math.random() * 30 * g, sh = (Math.random() - 0.5) * 60 * g; try { c.drawImage(camC, 0, by * dpr, CW * dpr, bh * dpr, sh, by, CW, bh); } catch (e) { /* ignore */ } }
			c.fillStyle = "rgba(255,255,255," + 0.06 * g + ")"; for (var k = 0; k < 40 * g; k++) c.fillRect(Math.random() * CW, Math.random() * CH, Math.random() * 40, 1);
			if (Math.random() < g * g * 0.25) { c.fillStyle = "rgba(0,0,0,0.85)"; c.fillRect(0, 0, CW, CH); c.fillStyle = "#e5e7eb"; c.font = "700 14px ui-monospace,monospace"; c.textAlign = "center"; c.fillText("SIGNAL DROPOUT", CW / 2, CH / 2); }
		}
		c.fillStyle = "#e5e7eb"; c.font = "12px ui-monospace,monospace"; c.textAlign = "left"; c.fillText((Math.floor(now / 600) % 2 ? "● " : "  ") + "REC  " + fmtT(simT), 10, 18);
		c.textAlign = "right"; c.font = (CW < 560 ? "10px" : "12px") + " ui-monospace,monospace"; c.fillText(cam ? (nameOf(cam) + " · AC " + H.fmtE(fa.Eac) + " · glitch risk " + Math.round(risk * 100) + "%") : "no camera placed: add one to see interference", CW - 10, CW < 560 ? 34 : 18);
		if (!n) { c.textAlign = "center"; c.fillText("Place samples in the active area to watch them here", CW / 2, CH / 2); }
	}
	function drawSampleSide(c, d, x, ty, s, now) {
		var M = MAT[d.mat] || MAT.al, a = animOf(d.id, now), o = os(d.id), lift = a.lev != null ? liftAt(a.lev) : 0, sh = d.shape;
		var dy = -lift * s * (1.3 + (((d.id.charCodeAt(d.id.length - 1) || 0) % 3) * 0.3)), wob = a.wob != null ? Math.sin(a.wob * 70) * (1 - a.wob) : 0;
		if (a.van != null && a.van > 0.2 && a.van < 0.8) { if (Math.random() < 0.3) puff("cam", x, ty - s * 0.3, "spark", 1); return; }
		c.save(); c.translate(x + wob * 6, ty + dy); c.rotate(wob * 0.15);
		if (lift > 0) { c.save(); c.translate(0, -dy); c.fillStyle = "rgba(0,0,0," + (0.5 - 0.3 * lift) + ")"; c.beginPath(); c.ellipse(0, 2, s * 0.5 * (1 - lift * 0.4), 3, 0, 0, TAU); c.fill(); c.restore(); }
		if (a.glo != null) { var gg = c.createRadialGradient(0, -s * 0.2, 2, 0, -s * 0.2, s * 1.2); gg.addColorStop(0, "rgba(255,225,130," + (0.85 * Math.sin(a.glo * Math.PI)) + ")"); gg.addColorStop(1, "rgba(255,90,30,0)"); c.fillStyle = gg; c.beginPath(); c.arc(0, -s * 0.2, s * 1.2, 0, TAU); c.fill(); }
		c.fillStyle = M.color; c.strokeStyle = "rgba(0,0,0,0.7)"; c.lineWidth = 1;
		var bend = ((o.bend || 0) + (a.jel != null ? 40 * Math.sin(a.jel * Math.PI) : 0)) * Math.PI / 180, breathe = a.brt != null ? 1 + 0.12 * Math.sin(a.brt * TAU * 3) : 1;
		if (sh === "bar" || sh === "rod" || sh === "spoon") {
			var L = s * 1.3, T = sh === "rod" ? s * 0.12 : sh === "spoon" ? s * 0.08 : s * 0.2, sag = Math.sin(bend) * L * 0.45, half = o.broken ? 0.42 : 0.5;
			c.beginPath(); c.moveTo(-L * half, -T); c.quadraticCurveTo(0, -T + sag, L * half, -T - (o.broken ? 4 : 0)); c.lineTo(L * half, 0 - (o.broken ? 4 : 0)); c.quadraticCurveTo(0, sag, -L * half, 0); c.closePath(); c.fill(); c.stroke();
			if (sh === "spoon") { c.beginPath(); c.ellipse(L * 0.55, -T, s * 0.22, s * 0.1, 0, 0, TAU); c.fill(); c.stroke(); }
			if (o.broken) { c.fillStyle = M.color; c.fillRect(L * 0.48, -T * 0.8, L * 0.12, T * 0.8); c.fillStyle = "rgba(240,240,235,0.9)"; for (var k = 0; k < 6; k++) c.fillRect(L * 0.45 + k * 3, -1, 2, 1); }
		} else if (sh === "bottle") {
			c.save(); c.scale(breathe, 1); c.fillStyle = "rgba(186,230,253,0.35)"; c.beginPath(); c.moveTo(-s * 0.28, 0); c.lineTo(-s * 0.28, -s * 0.8); c.quadraticCurveTo(-s * 0.28, -s * 1.0, -s * 0.1, -s * 1.05); c.lineTo(-s * 0.1, -s * 1.2); c.lineTo(s * 0.1, -s * 1.2); c.lineTo(s * 0.1, -s * 1.05); c.quadraticCurveTo(s * 0.28, -s * 1.0, s * 0.28, -s * 0.8); c.lineTo(s * 0.28, 0); c.closePath(); c.fill(); c.strokeStyle = "rgba(186,230,253,0.8)"; c.stroke();
			c.fillStyle = "rgba(59,130,246,0.75)"; var lvl = -s * 0.62 + (a.bub != null ? Math.sin(now / 60) * 3 : 0); c.fillRect(-s * 0.26, lvl, s * 0.52, -lvl); c.restore();
			if (a.bub != null && Math.random() < 0.7) puff("cam", x + (Math.random() - 0.5) * s * 0.4, ty + dy - 4, "bub", 2);
		} else if (sh === "sheet") { c.fillRect(-s * 0.55, -3, s * 1.1, 3); c.strokeRect(-s * 0.55, -3, s * 1.1, 3); }
		else if (sh === "can") { c.fillRect(-s * 0.18, -s * 0.6, s * 0.36, s * 0.6); c.strokeRect(-s * 0.18, -s * 0.6, s * 0.36, s * 0.6); c.fillStyle = "#1e3a8a"; c.fillRect(-s * 0.18, -s * 0.45, s * 0.36, s * 0.2); }
		else if (sh === "boat") { c.beginPath(); c.moveTo(-s * 0.55, -s * 0.3); c.lineTo(s * 0.55, -s * 0.3); c.lineTo(s * 0.35, 0); c.lineTo(-s * 0.35, 0); c.closePath(); c.fill(); c.stroke(); c.fillRect(-s * 0.04, -s * 0.75, s * 0.06, s * 0.45); }
		else if (sh === "jar") { c.fillStyle = "rgba(165,243,252,0.35)"; c.fillRect(-s * 0.3, -s * 0.7, s * 0.6, s * 0.7); c.strokeStyle = "rgba(165,243,252,0.9)"; c.strokeRect(-s * 0.3, -s * 0.7, s * 0.6, s * 0.7); }
		else if (sh === "disc") { c.fillRect(-s * 0.35, -s * 0.12, s * 0.7, s * 0.12); c.strokeRect(-s * 0.35, -s * 0.12, s * 0.7, s * 0.12); }
		else { var bs = (+d.m || 0.3) > 5 ? s * 0.9 : s * 0.5; c.fillRect(-bs / 2, -bs, bs, bs); c.strokeRect(-bs / 2, -bs, bs, bs); }
		if (o.fused) { c.strokeStyle = "#c084fc"; c.lineWidth = 2; c.beginPath(); c.moveTo(-s * 0.6, -1); c.lineTo(s * 0.6, -1); c.stroke(); }
		c.restore();
		if (a.fum != null && Math.random() < 0.6) puff("cam", x + (Math.random() - 0.5) * s * 0.3, ty + dy - s * 0.3, "smoke", 1);
		if (a.frc != null && a.frc < 0.3 && Math.random() < 0.8) puff("cam", x + s * 0.4, ty + dy - 6, "dust", 4);
		if (CW / Math.max(1, camSamples().length) > 78) { c.fillStyle = "#cbd5e1"; c.font = "10px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(nameOf(d), x, ty + 22); }
	}

	/* ================= running the experiment ================= */
	function fmtT(t) { var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60; return (h ? h + ":" : "") + (m < 10 && h ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s; }
	function tick(dtReal, now) {
		if (!ui.run) return; var dt = dtReal * ui.speed; simT += dt;
		// spark gaps fire every few tens of seconds
		var boost = {};
		st.items.forEach(function (d) {
			if (d.t !== "sparkgap" || d.on === false) return; var iv = Math.max(1, +d.gap || 40);
			if (gapNext[d.id] == null) gapNext[d.id] = simT + iv * (0.3 + 0.7 * rnd());
			if (simT >= gapNext[d.id]) { gapNext[d.id] = simT + iv * (0.8 + 0.4 * rnd()); flash[d.id] = now; boost[d.id] = 1; var p = toPx(d.x, d.y); puff("floor", p[0], p[1], "spark", 10); lastGap = simT; }
		});
		var w = H.warm(simT / 60, 20), recent = simT - lastGap < 4 ? 3 : 1;
		samples().forEach(function (d) {
			var fa = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa, {neighbour: neighbour(d)}), o = os(d.id);
			H.EFFECTS.forEach(function (e) {
				var lam = r[e.id] * w * recent; if (!(lam > 0)) return;
				if (o.broken && e.id === "frc") lam *= 0.2;
				var p = 1 - Math.exp(-lam * dt / 3600);
				if (rnd() < p) fire(d, e, fa, now);
			});
		});
	}
	var lastGap = -1e9;
	function fire(d, e, fa, now) {
		if (anims.some(function (a) { return a.id === d.id && a.e === e.id && (now - a.t0) < a.dur * 1000; })) return;
		var mag = H.magnitude(e.id, d, fa.D), o = os(d.id);
		anims.push({id: d.id, e: e.id, t0: now, dur: e.dur}); if (anims.length > 60) anims.shift();
		if (e.id === "jel") o.bend = Math.min(80, (o.bend || 0) + mag.v * 0.4);
		if (e.id === "frc") o.broken = 1;
		if (e.id === "fus") o.fused = 1;
		o.n++;
		events.push({t: simT, id: d.id, e: e.id, txt: nameOf(d) + ": " + mag.txt}); if (events.length > 400) events.shift();
		var p = toPx(d.x, d.y);
		if (e.id === "fum") puff("floor", p[0], p[1], "smoke", 14); if (e.id === "frc") puff("floor", p[0], p[1], "dust", 30); if (e.id === "bub") puff("floor", p[0], p[1], "bub", 12);
		logEvent(events[events.length - 1]);
	}
	function logEvent(ev) {
		var ul = $("hx-log"); if (!ul) return; var li = document.createElement("li"), E = H.EFF[ev.e];
		li.innerHTML = "<span class=\"hx-dot\" style=\"background:" + E.color + "\"></span><b>" + fmtT(ev.t) + "</b> " + esc(E.name) + ": " + esc(ev.txt);
		ul.insertBefore(li, ul.firstChild); while (ul.children.length > 40) ul.removeChild(ul.lastChild);
		var c = $("hx-r-ev"); if (c) c.textContent = events.length;
	}

	/* ================= pointer interaction ================= */
	var hover = null, drag = null;
	function hit(px, py) {
		for (var i = st.items.length - 1; i >= 0; i--) { var d = st.items[i]; if (d.t === "zone" || d.t === "area") continue; var p = toPx(d.x, d.y), R = itemR(d) + 4; if (Math.hypot(px - p[0], py - p[1]) <= R) return d; if (d.t === "tesla_dumbbell") { var a = (+d.rot || 0) * Math.PI / 180, L = 0.7 * view.s; for (var q = -1; q <= 1; q += 2) if (Math.hypot(px - p[0] - Math.cos(a) * L * q, py - p[1] - Math.sin(a) * L * q) < 12) return d; } }
		for (var j = st.items.length - 1; j >= 0; j--) { var z = st.items[j]; if (z.t !== "zone" && z.t !== "area") continue; var pz = toPx(z.x - z.w / 2, z.y - z.h / 2); if (px >= pz[0] && px <= pz[0] + z.w * view.s && py >= pz[1] && py <= pz[1] + z.h * view.s) return z; }
		return null;
	}
	function evPos(e) { var b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
	cv.addEventListener("pointerdown", function (e) {
		var p = evPos(e), m = toM(p[0], p[1]); cv.focus({preventScroll: true});
		if (ui.add) { place(ui.add, m[0], m[1]); return; }
		var d = hit(p[0], p[1]), sd = ui.sel ? byId(ui.sel) : null;
		if (ui.tool === "move" && sd) {
			if (sd.t === "zone" || sd.t === "area") { var pz = toPx(sd.x + sd.w / 2, sd.y + sd.h / 2); if (Math.abs(p[0] - pz[0]) < 10 && Math.abs(p[1] - pz[1]) < 10) { drag = {mode: "size", d: sd}; cv.setPointerCapture(e.pointerId); return; } }
			else if (/^(rf_tx|fieldshaper|camera|tesla_dumbbell|sample)$/.test(sd.t)) { var hp = rotHandle(sd); if (Math.hypot(p[0] - hp[0], p[1] - hp[1]) < 10) { drag = {mode: "rot", d: sd}; cv.setPointerCapture(e.pointerId); return; } }
		}
		if (ui.tool === "del") { if (d) remove(d.id); return; }
		if (ui.tool === "cable") {
			if (!d || d.t === "zone" || d.t === "area" || d.t === "sample") { ui.cableFrom = null; note("Cable: click the device that feeds, then the device it feeds."); return; }
			if (!ui.cableFrom) { ui.cableFrom = d.id; note("Now click the device that " + nameOf(d) + " feeds."); return; }
			if (ui.cableFrom === d.id) { ui.cableFrom = null; return; }
			toggleCable(ui.cableFrom, d.id); ui.cableFrom = null; return;
		}
		select(d ? d.id : null);
		if (d) { drag = {mode: "move", d: d, dx: m[0] - d.x, dy: m[1] - d.y, moved: false}; cv.setPointerCapture(e.pointerId); }
	});
	cv.addEventListener("pointermove", function (e) {
		var p = evPos(e), m = toM(p[0], p[1]); hover = {px: p[0], py: p[1], x: m[0], y: m[1]};
		if (drag) {
			var d = drag.d;
			if (drag.mode === "move") { d.x = H.clamp(m[0] - drag.dx, 0, st.room.w); d.y = H.clamp(m[1] - drag.dy, 0, st.room.h); drag.moved = true; delete d.__fa; if (d.t !== "zone" && d.t !== "area" && d.t !== "sample") dirty(false); else samplesChanged(); }
			else if (drag.mode === "rot") { var c0 = toPx(d.x, d.y), a = Math.atan2(p[1] - c0[1], p[0] - c0[0]) * 180 / Math.PI; if (!e.shiftKey) a = Math.round(a / 5) * 5; d.rot = Math.round(a); dirty(false); }
			else if (drag.mode === "size") { d.w = Math.max(0.3, (m[0] - d.x) * 2); d.h = Math.max(0.3, (m[1] - d.y) * 2); samplesChanged(); }
			editor();
		}
		pointerReadout();
		cv.style.cursor = drag ? "grabbing" : ui.add ? "copy" : ui.tool === "del" ? "not-allowed" : ui.tool === "cable" ? "crosshair" : hit(p[0], p[1]) ? "grab" : "default";
	});
	function endDrag() { if (drag) { var d = drag.d; drag = null; if (d.t !== "zone" && d.t !== "area" && d.t !== "sample") dirty(true); samplesChanged(); renderPanels(); } }
	cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
	cv.addEventListener("pointerleave", function () { hover = null; pointerReadout(); });
	cv.addEventListener("keydown", function (e) {
		var d = ui.sel ? byId(ui.sel) : null;
		if (e.key === "Escape") { ui.add = null; ui.cableFrom = null; setTool("move"); select(null); return; }
		if (!d) return;
		if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(d.id); }
		else if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); duplicate(d.id); }
		else if (e.key === "r" || e.key === "R") { d.rot = ((+d.rot || 0) + (e.shiftKey ? -15 : 15)) % 360; dirty(true); editor(); }
		else if (/^Arrow/.test(e.key)) { e.preventDefault(); var st0 = e.shiftKey ? 1 : 0.1; if (e.key === "ArrowLeft") d.x -= st0; if (e.key === "ArrowRight") d.x += st0; if (e.key === "ArrowUp") d.y -= st0; if (e.key === "ArrowDown") d.y += st0; d.x = H.clamp(d.x, 0, st.room.w); d.y = H.clamp(d.y, 0, st.room.h); delete d.__fa; dirty(true); samplesChanged(); editor(); }
	});
	document.addEventListener("keydown", function (e) { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === " " && ui.tab === "lab" && (e.target === cv || e.target === document.body)) { e.preventDefault(); setRun(!ui.run); } });
	function place(a, x, y) {
		var d;
		if (a.t === "sample") d = H.smp(newId(), a.k, x, y); else d = H.dev(newId(), a.t, x, y, {label: ""});
		d.x = H.clamp(x, 0, st.room.w); d.y = H.clamp(y, 0, st.room.h); delete d.label; if (a.t === "sample") d.label = H.SAMPLES[a.k].name;
		st.items.push(d); ui.add = null; paintPalette(); select(d.id); if (d.t === "sample" || d.t === "zone" || d.t === "area") samplesChanged(); dirty(true); renderPanels();
	}
	function remove(id) { st.items = st.items.filter(function (d) { return d.id !== id; }); st.cables = st.cables.filter(function (c) { return c[0] !== id && c[1] !== id; }); if (ui.sel === id) ui.sel = null; dirty(true); samplesChanged(); renderPanels(); }
	function duplicate(id) { var d = byId(id); if (!d) return; var n = JSON.parse(JSON.stringify(d)); delete n.__fa; n.id = newId(); n.x = H.clamp(d.x + 0.5, 0, st.room.w); n.y = H.clamp(d.y + 0.5, 0, st.room.h); st.items.push(n); select(n.id); dirty(true); samplesChanged(); renderPanels(); }
	function toggleCable(a, b) { var i = st.cables.findIndex(function (c) { return c[0] === a && c[1] === b; }); if (i >= 0) { st.cables.splice(i, 1); note("Cable removed."); } else { st.cables.push([a, b]); note("Cable: " + nameOf(byId(a)) + " → " + nameOf(byId(b)) + "."); } dirty(true); renderPanels(); }
	function select(id) { ui.sel = id; editor(); }
	function samplesChanged() { samples().forEach(function (d) { delete d.__fa; }); saveSoon(); }

	/* ================= palette + toolbar ================= */
	function iconCanvas(t, size, col) { var c = document.createElement("canvas"), r = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * r; c.style.width = c.style.height = size + "px"; var x = c.getContext("2d"); x.scale(r, r); sym(x, t, size / 2, size / 2, size * 0.9, col); return c; }
	function paintPalette() {
		var box = $("hx-pal"); if (!box.__built) {
			box.__built = 1;
			H.ORDER.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.className = "hx-pb"; b.dataset.t = t; b.title = "Add: " + DEV[t].name; b.appendChild(iconCanvas(t, 26, DEV[t].color)); var sp = document.createElement("span"); sp.textContent = DEV[t].name.replace(/ \(.+\)$/, ""); b.appendChild(sp); b.onclick = function () { armAdd({t: t}); }; box.appendChild(b); });
			var sbox = $("hx-spal"); Object.keys(H.SAMPLES).forEach(function (k) { var P = H.SAMPLES[k], b = document.createElement("button"); b.type = "button"; b.className = "hx-pb hx-pb--s"; b.dataset.k = k; var dot = document.createElement("i"); dot.style.background = MAT[P.mat].color; b.appendChild(dot); var sp = document.createElement("span"); sp.textContent = P.name; b.appendChild(sp); b.title = "Add: " + P.name + " (" + MAT[P.mat].name + ", " + fmtMass(P.m) + ")"; b.onclick = function () { armAdd({t: "sample", k: k}); }; sbox.appendChild(b); });
		}
		Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-pb"), function (b) { var on = ui.add && (ui.add.t === b.dataset.t || (ui.add.k && ui.add.k === b.dataset.k)); b.setAttribute("aria-pressed", on ? "true" : "false"); });
	}
	function armAdd(a) { if (ui.add && ui.add.t === a.t && ui.add.k === a.k) { ui.add = null; note(""); } else { ui.add = a; setTool("move", true); note("Click on the floor to place: " + (a.t === "sample" ? H.SAMPLES[a.k].name : DEV[a.t].name) + ". Esc to cancel."); } paintPalette(); }
	function fmtMass(m) { return m >= 1 ? (+m.toPrecision(3)) + " kg" : Math.round(m * 1000) + " g"; }
	function setTool(t, keepAdd) { ui.tool = t; if (!keepAdd) ui.add = null; ui.cableFrom = null; Array.prototype.forEach.call(document.querySelectorAll("#hx-tools button[data-tool]"), function (b) { b.setAttribute("aria-pressed", b.dataset.tool === t ? "true" : "false"); }); paintPalette(); if (t === "cable") note("Cable: click the device that feeds, then the device it feeds (click an existing cable's pair again to remove it)."); else if (t === "del") note("Click anything to remove it."); }
	Array.prototype.forEach.call(document.querySelectorAll("#hx-tools button[data-tool]"), function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });
	function note(t) { var n = $("hx-note"); if (n) n.textContent = t || ""; }

	/* ================= editor of the selected item ================= */
	function parseF(s) { var m = String(s).trim().replace(/,/g, "").match(/^([0-9.]+(?:e[+-]?\d+)?)\s*([kKmMgG]?)\s*(hz)?$/i); if (!m) return NaN; var v = parseFloat(m[1]), u = m[2]; return v * (u === "k" || u === "K" ? 1e3 : u === "M" ? 1e6 : u === "G" || u === "g" ? 1e9 : u === "m" ? 1e6 : 1); }
	function row(label, html, help) { return "<div class=\"hx-er\"><label>" + label + "</label><div class=\"hx-ev\">" + html + "</div>" + (help ? "<small>" + help + "</small>" : "") + "</div>"; }
	function num(key, d, min, max, step, unit) { return "<input type=\"number\" class=\"tu-input hx-num\" data-k=\"" + key + "\" value=\"" + (d[key] != null ? +(+d[key]).toPrecision(6) : "") + "\" min=\"" + min + "\" max=\"" + max + "\" step=\"" + step + "\"><span class=\"hx-u\">" + unit + "</span><input type=\"range\" class=\"hx-rng\" data-k=\"" + key + "\" min=\"" + min + "\" max=\"" + max + "\" step=\"" + step + "\" value=\"" + (+d[key] || 0) + "\" aria-label=\"" + key + "\">"; }
	function editor() {
		var box = $("hx-edit"), d = ui.sel ? byId(ui.sel) : null; if (!box) return;
		if (!d) { box.innerHTML = "<h3 class=\"hx-h\">Nothing selected</h3><p class=\"tu-note\">Click a device or sample on the floor to edit it. Add equipment and samples from the palettes above the floor; use <b>Cable</b> to connect a device to the one it feeds.</p>" + statsHtml(); return; }
		var T = DEV[d.t], h = "<h3 class=\"hx-h\">" + esc(d.t === "sample" ? "Sample" : T.name) + "</h3>";
		h += row("Label", "<input type=\"text\" class=\"tu-input\" data-k=\"label\" maxlength=\"60\" value=\"" + esc(d.label || "") + "\" placeholder=\"" + esc(d.t === "sample" ? "Sample" : T.name) + "\">");
		if (d.t === "sample") {
			h += row("Material", "<select class=\"tu-select\" data-k=\"mat\">" + Object.keys(MAT).map(function (k) { return "<option value=\"" + k + "\"" + (d.mat === k ? " selected" : "") + ">" + MAT[k].name + "</option>"; }).join("") + "</select>");
			h += row("Shape", "<select class=\"tu-select\" data-k=\"shape\">" + ["bar", "rod", "spoon", "can", "block", "bottle", "sheet", "boat", "jar", "disc"].map(function (k) { return "<option" + (d.shape === k ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select>");
			h += row("Mass", num("m", d, 0.001, 750, 0.001, "kg"));
			h += row("Turn", num("rot", d, -180, 180, 5, "°"));
			h += "<div class=\"hx-rep\">" + sampleReport(d) + "</div>";
		} else {
			if (T.kind !== "zone" && T.kind !== "area") h += row("Switched on", "<label class=\"hx-ck\"><input type=\"checkbox\" data-k=\"on\"" + (d.on !== false ? " checked" : "") + "> on</label>");
			var k = T.kind;
			if (k === "zone" || k === "area") { h += row("Width", num("w", d, 0.2, 30, 0.1, "m")) + row("Depth", num("h", d, 0.2, 30, 0.1, "m")); }
			if (/hv|rf|dc|pow|pulse|tank|mag|sig/.test(k) && d.t !== "mains") h += row(k === "sig" ? "Output" : "Voltage", num("kV", d, k === "sig" ? 0.001 : -500, k === "dc" ? 500 : k === "hv" ? 600 : k === "rf" ? 5 : 60, k === "sig" ? 0.001 : 0.5, "kV"), k === "dc" ? "Negative = negative polarity." : k === "hv" ? "Peak voltage on the top electrode." : "");
			if (/hv|rf|mag|sig|pulse/.test(k)) h += row(k === "pulse" ? "Ring frequency" : "Frequency", "<input type=\"text\" class=\"tu-input hx-num\" data-k=\"f\" data-f=\"1\" value=\"" + H.fmtF(+d.f).replace(" ", "") + "\" inputmode=\"decimal\"> <span class=\"hx-u\">e.g. 180k, 14M</span>", info[d.id] && info[d.id].notes.length ? esc(info[d.id].notes.join("; ")) : "");
			if (k === "tank") h += row("Capacitance", num("C", d, 0.001, 1000, 0.1, "nF")) + row("Inductance", num("L", d, 0.1, 5000, 1, "µH"), "Resonates at " + H.fmtF(H.tankF(+d.C, +d.L)) + ". Cable it to a Tesla coil to drive it.");
			if (k === "pulse") h += row("Capacitor", num("C", d, 0.001, 2, 0.001, "µF"), "Stores " + H.gapEnergy(+d.C, +d.kV).toFixed(1) + " J per shot.") + row("Fires every", num("gap", d, 1, 600, 1, "s"));
			if (d.t === "inductor") h += row("Current", num("I", d, 0, 200, 0.5, "A")) + row("Turns", num("N", d, 1, 2000, 1, "")) + row("Radius", num("R", d, 0.01, 1, 0.01, "m"));
			if (/hv|rf|dc|pow|pulse|tank|mag|sig/.test(k)) h += row(d.t === "mains" ? "Circuit capacity" : "Input power", num("P", d, 0, d.t === "mains" ? 3000 : 5000, 5, "W"));
			if (/hv|rf|mag|sig/.test(k)) h += row("Duty / pulsing", num("duty", d, 1, 100, 1, "%")) + row("Phase", num("phase", d, -180, 180, 5, "°"), "Matters for devices on the same frequency that are cabled together (locked).");
			if (d.t === "rf_tx" || d.t === "fieldshaper" || d.t === "camera" || d.t === "tesla_dumbbell") h += row("Points at", num("rot", d, -180, 180, 5, "°"), "Or drag the yellow handle; R turns it.");
			if (d.t === "camera") h += row("Immunity", num("imm", d, 1, 200, 1, "V/m"), "Consumer cameras: 3-10 V/m. Shielded industrial: 30 V/m or more.");
			h += "<div class=\"hx-rep\">" + deviceReport(d) + "</div>";
		}
		h += "<div class=\"hx-eb\"><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"dup\">⧉ Duplicate</button><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"del\">✕ Remove</button>" + (d.t !== "sample" && d.t !== "zone" && d.t !== "area" ? "<button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"cab\">⇢ Cable from here</button><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"eq\">About this device</button>" : "") + "</div>";
		var cabs = st.cables.filter(function (c) { return c[0] === d.id || c[1] === d.id; });
		if (cabs.length) h += "<div class=\"hx-cabs\"><b>Cables</b>" + cabs.map(function (c, i) { var o = byId(c[0] === d.id ? c[1] : c[0]); return "<span>" + (c[0] === d.id ? "→ " : "← ") + esc(o ? nameOf(o) : "?") + " <button type=\"button\" data-uncab=\"" + esc(c[0]) + "|" + esc(c[1]) + "\" aria-label=\"Remove this cable\">✕</button></span>"; }).join("") + "</div>";
		box.innerHTML = h;
	}
	function statsHtml() {
		var pw = H.power(st), z = zone(), fa = z ? H.fieldAt(src, z.x, z.y) : null;
		return "<div class=\"hx-mini\">" + (z ? "<div><span>Active area</span><b>" + Math.round(fa.D * 100) + "% drive</b><small>" + H.fmtE(fa.E) + ", " + fa.groups.length + " frequencies, overlap " + fa.Neff.toFixed(1) + "</small></div>" : "") + "<div><span>Power drawn</span><b>" + Math.round(pw.W) + " W</b><small>" + pw.amps110.toFixed(1) + " A at 110 V" + (pw.outlets ? " · outlets give " + pw.outlets + " W" : "") + "</small></div></div>";
	}
	function deviceReport(d) {
		var T = DEV[d.t], fa = H.fieldAt(src, d.x, d.y), out = "<div class=\"hx-mini\">";
		if (T.kind === "inst" || T.kind === "op") {
			out += "<div><span>Field here</span><b>" + H.fmtE(fa.E) + "</b><small>" + H.fmtB(fa.B) + (fa.fDom ? " · strongest " + H.fmtF(fa.fDom) : "") + "</small></div>";
			if (d.t === "camera") out += "<div><span>Glitch risk</span><b>" + Math.round(H.emfRisk(fa.Eac, +d.imm || 10) * 100) + "%</b><small>per second, at " + (+d.imm || 10) + " V/m immunity</small></div>";
			if (d.t === "operator") { var lim = H.eRef(fa.fDom); out += "<div><span>vs occupational level</span><b>" + Math.round(fa.E / lim * 100) + "%</b><small>ICNIRP reference " + H.fmtE(lim) + " at " + H.fmtF(fa.fDom) + "</small></div>"; }
		} else if (T.kind !== "zone" && T.kind !== "area") {
			var s = src.filter(function (x) { return x.id === d.id && !x.image; })[0];
			if (s) out += "<div><span>Field at 1 m</span><b>" + H.fmtE(H.srcE(s, 1, 0) / (s.f > 0 ? Math.SQRT2 : 1)) + "</b><small>at 2 m " + H.fmtE(H.srcE(s, 2, 0) / (s.f > 0 ? Math.SQRT2 : 1)) + (s.m ? " · B at 1 m " + H.fmtB(H.srcB(s, 1) / Math.SQRT2) : "") + "</small></div>";
			if (info[d.id] && info[d.id].f > 0) out += "<div><span>Wavelength</span><b>" + fmtLen(299792458 / info[d.id].f) + "</b><small>the room is " + (st.room.w / (299792458 / info[d.id].f)).toPrecision(2) + " wavelengths wide</small></div>";
		} else if (d.t === "zone") { out += "<div><span>Drive in the middle</span><b>" + Math.round(fa.D * 100) + "%</b><small>" + H.fmtE(fa.E) + " · overlap " + fa.Neff.toFixed(1) + "</small></div>"; }
		return out + "</div>";
	}
	function fmtLen(m) { return m >= 1000 ? (m / 1000).toPrecision(3) + " km" : m >= 1 ? m.toPrecision(3) + " m" : (m * 100).toPrecision(3) + " cm"; }
	function sampleReport(d) {
		var fa = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa, {neighbour: neighbour(d)}), w = H.warm(simT / 60, 20), cl = H.classicalLift(fa.E, d);
		var rows = H.EFFECTS.map(function (e) { var p = H.probWithin(r[e.id], 10); if (p < 0.0005) return ""; return "<li><i style=\"background:" + e.color + "\"></i><span>" + esc(e.name) + "</span><b>" + pct(p) + "</b><small>" + esc(H.magnitude(e.id, d, fa.D).txt) + "</small></li>"; }).join("");
		return "<div class=\"hx-mini\"><div><span>Drive here</span><b>" + Math.round(fa.D * 100) + "%</b><small>" + H.fmtE(fa.E) + " · " + fa.groups.length + " frequencies · overlap " + fa.Neff.toFixed(1) + "</small></div><div><span>Ordinary field pull</span><b>" + fmtPct(cl) + "</b><small>of its weight (ε₀E²/2 on its top face)</small></div></div>" +
			"<p class=\"tu-note\">Chance of each effect in the next 10 minutes once warmed up" + (w < 0.95 ? " (warming up: " + Math.round(w * 100) + "%)" : "") + ":</p><ul class=\"hx-eff\">" + (rows || "<li><span>Too little drive here for any effect.</span></li>") + "</ul>";
	}
	function pct(p) { return p >= 0.995 ? ">99%" : p >= 0.1 ? Math.round(p * 100) + "%" : p >= 0.001 ? (p * 100).toFixed(1) + "%" : "<0.1%"; }
	function fmtPct(x) { return x >= 0.01 ? (x * 100).toFixed(1) + "%" : x >= 1e-6 ? (x * 100).toExponential(1).replace("e", "×10^") + "%" : "≈0%"; }
	$("hx-edit").addEventListener("input", function (e) {
		var t = e.target, k = t.dataset.k, d = ui.sel ? byId(ui.sel) : null; if (!k || !d) return;
		var v;
		if (t.type === "checkbox") v = t.checked; else if (k === "label" || k === "mat" || k === "shape") v = t.value; else if (t.dataset.f) { v = parseF(t.value); if (!(v >= 0)) return; } else { v = parseFloat(t.value); if (!isFinite(v)) return; }
		d[k] = v; delete d.__fa;
		if (t.classList.contains("hx-rng")) { var nb = t.parentNode.querySelector(".hx-num[data-k=\"" + k + "\"]"); if (nb) nb.value = v; } else if (t.classList.contains("hx-num") && !t.dataset.f) { var rg = t.parentNode.querySelector(".hx-rng[data-k=\"" + k + "\"]"); if (rg) rg.value = v; }
		if (d.t === "sample" || d.t === "zone" || d.t === "area") samplesChanged(); else { samplesChanged(); dirty(false); }
		clearTimeout(edT); edT = setTimeout(function () { if (inEditor()) refreshEditorReports(); else editor(); renderPanels(); }, 450);
	});
	var edT = 0;
	function inEditor() { var a = document.activeElement; return !!(a && a.closest && a.closest("#hx-edit")); }
	function refreshEditorReports() { var d = ui.sel ? byId(ui.sel) : null, rep = $("hx-edit").querySelector(".hx-rep"); if (!d || !rep) return; rep.innerHTML = d.t === "sample" ? sampleReport(d) : deviceReport(d); }
	$("hx-edit").addEventListener("change", function (e) { var k = e.target.dataset.k; if (k === "on" || k === "mat" || k === "shape") editor(); });
	$("hx-edit").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var d = ui.sel ? byId(ui.sel) : null; if (!d) return;
		if (b.dataset.act === "dup") duplicate(d.id); else if (b.dataset.act === "del") remove(d.id);
		else if (b.dataset.act === "cab") { setTool("cable"); ui.cableFrom = d.id; note("Now click the device that " + nameOf(d) + " feeds."); }
		else if (b.dataset.act === "eq") { setTab("eq"); var card = $("hx-eq-" + d.t); if (card) card.scrollIntoView({behavior: "smooth", block: "start"}); }
		else if (b.dataset.uncab) { var pr = b.dataset.uncab.split("|"); toggleCable(pr[0], pr[1]); editor(); }
	});

	/* ================= readouts ================= */
	function pointerReadout() {
		var p = $("hx-r-p"), e = $("hx-r-e"), es = $("hx-r-es"), dd = $("hx-r-d"), ds = $("hx-r-ds"), bt = $("hx-r-b"), bs = $("hx-r-bs");
		if (!hover || hover.x < 0 || hover.y < 0 || hover.x > st.room.w || hover.y > st.room.h) { p.textContent = "–"; e.textContent = "–"; es.textContent = "move over the floor"; dd.textContent = "–"; ds.textContent = ""; bt.textContent = "–"; bs.textContent = ""; return; }
		var fa = H.fieldAt(src, hover.x, hover.y); p.textContent = hover.x.toFixed(1) + ", " + hover.y.toFixed(1) + " m";
		e.textContent = H.fmtE(fa.E); es.textContent = "B " + H.fmtB(fa.B) + (fa.Es > 1 ? " · DC " + H.fmtE(fa.Es) : "");
		dd.textContent = Math.round(fa.D * 100) + "%"; ds.textContent = "overlap " + fa.Neff.toFixed(1) + " · " + fa.richness + " spectral parts" + (fa.coh !== 1 ? (fa.coh > 1.15 ? " · antinode" : fa.coh < 0.85 ? " · node" : "") : "");
		var beats = fa.beats.slice().sort(function (a, b) { return a.df - b.df; });
		if (beats.length) { var b0 = beats[0]; bt.textContent = b0.drift ? "drifting" : H.fmtF(b0.df); bs.textContent = beats.length + " pair" + (beats.length > 1 ? "s" : "") + ": " + beats.slice(0, 3).map(function (b) { return b.drift ? H.fmtF(b.f1) + " ×2 (free-running)" : H.fmtF(b.f1) + " vs " + H.fmtF(b.f2); }).join("; "); }
		else { bt.textContent = "none"; bs.textContent = "only one frequency here"; }
	}
	function updateReadouts() {
		$("hx-r-t").textContent = fmtT(simT); $("hx-r-ts").textContent = ui.run ? ui.speed + "× · warm-up " + Math.round(H.warm(simT / 60, 20) * 100) + "%" : "paused";
		$("hx-r-ev").textContent = events.length; var pw = H.power(st); $("hx-r-w").textContent = Math.round(pw.W) + " W"; $("hx-r-ws").textContent = pw.amps110.toFixed(1) + " A at 110 V" + (pw.W > 1650 ? " · over one 15 A circuit" : "");
		$("hx-r-ws").classList.toggle("hx-warn", pw.W > 1650);
	}

	/* ================= tables, charts, explainer ================= */
	function renderPanels() { renderTable(); drawCharts(); explain(); statsInEditor(); }
	function statsInEditor() { if (!ui.sel) editor(); }
	function renderTable() {
		var tb = $("hx-tbody"); if (!tb) return; var list = samples();
		$("hx-thead").innerHTML = "<tr><th>Sample</th><th>Drive</th>" + H.EFFECTS.map(function (e) { return "<th title=\"" + esc(e.name + ": " + e.note) + "\"><i style=\"background:" + e.color + "\"></i>" + esc(e.name.split(/[ /]/)[0]) + "</th>"; }).join("") + "<th title=\"Ordinary electrostatic pull as a share of the sample's weight\">Ordinary pull</th></tr>";
		if (!list.length) { tb.innerHTML = "<tr><td colspan=\"14\">No samples yet: add some from the Samples palette.</td></tr>"; return; }
		tb.innerHTML = list.map(function (d) {
			var fa = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa, {neighbour: neighbour(d)});
			return "<tr data-id=\"" + esc(d.id) + "\"" + (ui.sel === d.id ? " class=\"hx-on\"" : "") + "><th><button type=\"button\" class=\"hx-link\" data-sel=\"" + esc(d.id) + "\">" + esc(nameOf(d)) + "</button><small>" + esc(MAT[d.mat] ? MAT[d.mat].name : "") + ", " + fmtMass(+d.m) + "</small></th><td><b>" + Math.round(fa.D * 100) + "%</b></td>" +
				H.EFFECTS.map(function (e) { var p = H.probWithin(r[e.id], 10); return "<td style=\"--p:" + Math.min(1, p * 2).toFixed(2) + ";--c:" + e.color + "\" class=\"hx-pc\">" + (p < 0.0005 ? "·" : pct(p)) + "</td>"; }).join("") + "<td>" + fmtPct(H.classicalLift(fa.E, d)) + "</td></tr>";
		}).join("");
	}
	$("hx-table").addEventListener("click", function (e) { var b = e.target.closest("[data-sel]"); if (b) { select(b.dataset.sel); renderTable(); } });

	function chartBase(c, w, h, dark) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "11px system-ui,sans-serif"; }
	function chartCanvas(id, h) { var cvs = $(id); if (!cvs) return null; var w = cvs.parentNode.clientWidth || 300; cvs.style.height = h + "px"; cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); return {c: cvs.getContext("2d"), w: w, h: h}; }
	function ink() { return isDark() ? {fg: "#e5e7eb", dim: "#9ca3af", grid: "rgba(255,255,255,0.08)"} : {fg: "#1f2937", dim: "#6b7280", grid: "rgba(0,0,0,0.08)"}; }
	function probePoint() { var d = ui.sel ? byId(ui.sel) : null; if (d && d.t === "sample") return {x: d.x, y: d.y, name: nameOf(d)}; var z = zone(); if (z) return {x: z.x, y: z.y, name: nameOf(z)}; var s0 = samples()[0]; if (s0) return {x: s0.x, y: s0.y, name: nameOf(s0)}; return {x: st.room.w / 2, y: st.room.h / 2, name: "the middle of the room"}; }
	function drawCharts() { if (ui.tab !== "lab") return; chartDistance(); chartSpectrum(); chartTimeline(); }
	function fitText(c, t, x, y, mw) { if (c.measureText(t).width > mw) { while (t.length > 4 && c.measureText(t + "…").width > mw) t = t.slice(0, -1); t += "…"; } c.fillText(t, x, y); }
	function chartDistance() {
		var k = chartCanvas("hx-ch1", 220); if (!k) return; var c = k.c, w = k.w, h = k.h, I = ink(); chartBase(c, w, h);
		var d = ui.sel ? byId(ui.sel) : null; if (!d || !DEV[d.t] || !src.some(function (s) { return s.id === d.id; })) d = st.items.filter(function (x) { return /^tesla/.test(x.t) && x.on !== false; })[0] || st.items.filter(function (x) { return src.some(function (s) { return s.id === x.id; }); })[0];
		if (!d) { c.fillStyle = I.dim; c.fillText("Add a field source to see this chart.", 10, 20); return; }
		var pp = probePoint(), ang = Math.atan2(pp.y - d.y, pp.x - d.x); if (Math.hypot(pp.y - d.y, pp.x - d.x) < 0.3) ang = 0;
		var L = Math.max(2, Math.min(12, Math.hypot(st.room.w, st.room.h) * 0.6)), ml = 46, mr = 36, mt = 24, mb = 26, pw = w - ml - mr, ph = h - mt - mb, N = 140;
		var lo = 1, hi = 6; function Y(v) { return mt + ph * (1 - (Math.log10(Math.max(10, v)) - lo) / (hi - lo)); } function X(r) { return ml + pw * r / L; }
		c.strokeStyle = I.grid; c.fillStyle = I.dim; c.textAlign = "right"; for (var e = lo; e <= hi; e++) { var y = Y(Math.pow(10, e)); c.beginPath(); c.moveTo(ml, y); c.lineTo(ml + pw, y); c.stroke(); c.fillText(e >= 3 ? Math.pow(10, e - 3) + "k" : Math.pow(10, e) + "", ml - 4, y + 4); }
		c.textAlign = "center"; for (var m = 0; m <= L; m += L > 6 ? 2 : 1) c.fillText(m + " m", X(m), h - 8);
		var ids = []; src.forEach(function (s) { if (!s.image && ids.indexOf(s.id) < 0) ids.push(s.id); });
		ids.forEach(function (id) {
			var dd = byId(id), col = DEV[dd.t] ? DEV[dd.t].color : "#999"; c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1; c.beginPath();
			for (var i = 0; i <= N; i++) { var r = L * i / N, x = d.x + Math.cos(ang) * r, y2 = d.y + Math.sin(ang) * r, v = 0; src.forEach(function (s) { if (s.id === id && !s.image) { var dx = x - s.x, dy = y2 - s.y; v += H.srcE(s, Math.hypot(dx, dy), Math.atan2(dy, dx) - s.rot) / (s.f > 0 ? Math.SQRT2 : 1); } }); if (i) c.lineTo(X(r), Y(v)); else c.moveTo(X(r), Y(v)); }
			c.stroke(); c.globalAlpha = 1;
		});
		c.strokeStyle = I.fg; c.lineWidth = 2.2; c.beginPath(); var dl = [];
		for (var i2 = 0; i2 <= N; i2++) { var r2 = L * i2 / N, fa = H.fieldAt(src, d.x + Math.cos(ang) * r2, d.y + Math.sin(ang) * r2); dl.push(fa.D); if (i2) c.lineTo(X(r2), Y(fa.E)); else c.moveTo(X(r2), Y(fa.E)); }
		c.stroke(); c.strokeStyle = "#eab308"; c.setLineDash([5, 4]); c.lineWidth = 1.8; c.beginPath(); dl.forEach(function (v, i) { var x = X(L * i / N), y = mt + ph * (1 - v); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
		c.fillStyle = "#eab308"; c.textAlign = "right"; c.fillText("dashed: drive 0-100%", ml + pw - 4, mt + 12); c.fillStyle = I.fg; c.textAlign = "left"; fitText(c, "|E| (V/m) from " + nameOf(d) + " toward " + pp.name + ": thick = total, thin = each source", ml - 40, mt - 8, w - ml);
		c.save(); c.translate(w - 8, mt + ph / 2); c.rotate(Math.PI / 2); c.textAlign = "center"; c.fillStyle = "#eab308"; c.fillText("drive", 0, 0); c.restore();
	}
	function chartSpectrum() {
		var k = chartCanvas("hx-ch2", 200); if (!k) return; var c = k.c, w = k.w, h = k.h, I = ink(); chartBase(c, w, h);
		var pp = probePoint(), lines = H.spectrum(src, pp.x, pp.y), ml = 46, mr = 12, mt = 22, mb = 26, pw = w - ml - mr - 30, ph = h - mt - mb, f0 = 1, f1 = 9;
		function X(f) { return ml + 30 + pw * (Math.log10(Math.max(10, f)) - f0) / (f1 - f0); } function Y(v) { return mt + ph * (1 - (Math.log10(Math.max(1, v)) - 0) / 6); }
		c.strokeStyle = I.grid; c.fillStyle = I.dim; c.textAlign = "center";
		["10 Hz", "100", "1 kHz", "10k", "100k", "1 MHz", "10M", "100M", "1 GHz"].forEach(function (t, i) { var x = X(Math.pow(10, i + 1)); c.beginPath(); c.moveTo(x, mt); c.lineTo(x, mt + ph); c.stroke(); if (pw > 420 || i % 2 === 0) c.fillText(t, x, h - 8); });
		c.textAlign = "right"; for (var e = 0; e <= 6; e += 2) c.fillText(e >= 3 ? Math.pow(10, e - 3) + "k" : Math.pow(10, e) + "", ml - 4, Y(Math.pow(10, e)) + 4);
		c.fillText("DC", ml + 14, h - 8);
		lines.forEach(function (l) {
			var dd = byId(l.id), col = dd && DEV[dd.t] ? DEV[dd.t].color : "#999";
			if (l.kind === "pulse") { c.fillStyle = col; c.globalAlpha = 0.25; c.beginPath(); c.moveTo(X(l.f / 30), Y(1)); for (var i = 0; i <= 40; i++) { var ff = l.f / 30 * Math.pow(900, i / 40), a = l.A * Math.exp(-Math.pow(Math.log(ff / l.f), 2) / 2.4); c.lineTo(X(ff), Y(a)); } c.lineTo(X(l.f * 30), Y(1)); c.fill(); c.globalAlpha = 1; return; }
			var x = l.kind === "dc" ? ml + 16 : X(l.f); c.strokeStyle = col; c.lineWidth = l.kind === "line" || l.kind === "dc" ? 3 : 1.5; c.globalAlpha = l.kind === "harm" ? 0.6 : 1; c.beginPath(); c.moveTo(x, Y(1)); c.lineTo(x, Y(l.A)); c.stroke(); c.globalAlpha = 1;
		});
		c.fillStyle = I.fg; c.textAlign = "left"; fitText(c, "Spectrum at " + pp.name + " (V/m rms, with harmonics, sidebands and spark pulses)", 6, mt - 8, w - 12);
	}
	function chartTimeline() {
		var k = chartCanvas("hx-ch3", 160); if (!k) return; var c = k.c, w = k.w, h = k.h, I = ink(); chartBase(c, w, h);
		var list = samples(), ml = 110, mr = 10, mt = 20, mb = 22, pw = w - ml - mr, ph = h - mt - mb, T = Math.max(600, simT * 1.05);
		c.fillStyle = I.fg; c.textAlign = "left"; c.fillText("Events over experiment time (" + events.length + " so far)", 6, 13);
		c.fillStyle = I.dim; c.textAlign = "center"; for (var i = 0; i <= 4; i++) { var t = T * i / 4, x = ml + pw * i / 4; c.strokeStyle = I.grid; c.beginPath(); c.moveTo(x, mt); c.lineTo(x, mt + ph); c.stroke(); c.fillText(fmtT(t), x, h - 6); }
		var n = Math.max(1, list.length); c.textAlign = "right";
		list.forEach(function (d, j) { var y = mt + ph * (j + 0.5) / n; c.fillStyle = I.dim; c.fillText(nameOf(d).slice(0, 16), ml - 6, y + 4); });
		var wx = ml + pw * Math.min(1, 20 * 60 / T); c.fillStyle = isDark() ? "rgba(250,204,21,0.06)" : "rgba(234,179,8,0.08)"; c.fillRect(ml, mt, wx - ml, ph);
		events.forEach(function (ev) { var j = list.findIndex(function (d) { return d.id === ev.id; }); if (j < 0) return; var x = ml + pw * ev.t / T, y = mt + ph * (j + 0.5) / n; c.fillStyle = H.EFF[ev.e].color; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); });
		c.strokeStyle = "#ef4444"; c.beginPath(); var xn = ml + pw * simT / T; c.moveTo(xn, mt); c.lineTo(xn, mt + ph); c.stroke();
	}
	function explain() {
		var box = $("hx-explain-b"); if (!box) return; var on = st.items.filter(function (d) { return d.on !== false && DEV[d.t]; }), z = zone(), out = [];
		var coils = on.filter(function (d) { return /^tesla/.test(d.t); }), vdg = on.filter(function (d) { return d.t === "vdg"; }), gaps = on.filter(function (d) { return d.t === "sparkgap"; }), rf = on.filter(function (d) { return d.t === "rf_tx"; }), sig = on.filter(function (d) { return d.t === "siggen"; });
		out.push("<p><b>" + coils.length + " Tesla coil" + (coils.length === 1 ? "" : "s") + "</b>" + (coils.length ? " (" + coils.map(function (d) { return esc(nameOf(d)) + " at " + H.fmtF(info[d.id].f) + (info[d.id].tune < 0.9 ? ", " + Math.round(info[d.id].tune * 100) + "% tuned" : ""); }).join(", ") + ")" : "") + ", <b>" + vdg.length + " Van de Graaff</b>, " + gaps.length + " spark gap" + (gaps.length === 1 ? "" : "s") + ", " + rf.length + " RF transmitter" + (rf.length === 1 ? "" : "s") + " and " + sig.length + " signal generator" + (sig.length === 1 ? "" : "s") + ".</p>");
		var chains = st.cables.map(function (c) { var a = byId(c[0]), b = byId(c[1]); return a && b ? esc(nameOf(a)) + " → " + esc(nameOf(b)) : ""; }).filter(Boolean);
		if (chains.length) out.push("<p><b>Power and coupling:</b> " + chains.join("; ") + ". Devices cabled together share their phase, so on the same frequency their fields interfere (fixed nodes and antinodes); free-running ones drift.</p>");
		if (z) {
			var fa = H.fieldAt(src, z.x, z.y); out.push("<p><b>Active area:</b> " + H.fmtE(fa.E) + " (DC part " + H.fmtE(fa.Es) + "), " + fa.groups.length + " frequency group" + (fa.groups.length === 1 ? "" : "s") + ", overlap " + fa.Neff.toFixed(1) + " sources, drive <b>" + Math.round(fa.D * 100) + "%</b>." + (fa.beats.length ? " Beats: " + fa.beats.slice(0, 4).map(function (b) { return b.drift ? "free-running pair at " + H.fmtF(b.f1) : H.fmtF(b.df) + " (" + H.fmtF(b.f1) + " vs " + H.fmtF(b.f2) + ")"; }).join(", ") + "." : "") + "</p>");
			var tips = [];
			if (!vdg.length) tips.push("Add a Van de Graaff near the active area: the first effects appeared when John added one to two Tesla coils, and the model rewards a DC bias under the AC fields.");
			if (coils.length < 2) tips.push("Two or more Tesla coils whose fields cross in the active area raise the overlap.");
			if (fa.Neff < 2.2 && on.length > 2) tips.push("One source dominates the active area: move the others closer, or turn the field shaper toward it, so the fields meet with similar strength.");
			if (fa.coh < 0.8) tips.push("The active area sits on a node of locked sources: change one coil's phase by 180° or move it.");
			if (!gaps.length) tips.push("A spark gap firing every 30-40 s adds the pulses seen in the LADS circuit; events cluster after a firing in this model.");
			if (fa.D > 0.85) tips.push("The drive is near its maximum here: further gains come from waiting (the reports describe effects taking hours to days to appear in the early years).");
			coils.forEach(function (d) { if (info[d.id].tune < 0.6) tips.push(esc(nameOf(d)) + " is badly tuned to its tank (" + Math.round(info[d.id].tune * 100) + "%): set the tank's L and C so it resonates at " + H.fmtF(info[d.id].f) + "."); });
			var pw = H.power(st); if (pw.W > 1650) tips.push("The gear draws " + Math.round(pw.W) + " W: more than one 15 A circuit at 110 V (1,650 W). Hutchison's affidavit gives 75 W to 4 kW for his setups.");
			var ops = on.filter(function (d) { return d.t === "operator"; }); ops.forEach(function (d) { var f2 = H.fieldAt(src, d.x, d.y), lim = H.eRef(f2.fDom); if (f2.E > lim * 0.5) tips.push(esc(nameOf(d)) + " stands in " + H.fmtE(f2.E) + ", " + Math.round(f2.E / lim * 100) + "% of the occupational reference level: move the control position back."); });
			var cams = on.filter(function (d) { return d.t === "camera"; }); cams.forEach(function (d) { var f3 = H.fieldAt(src, d.x, d.y), rk = H.emfRisk(f3.Eac, +d.imm || 10); if (rk > 0.3) tips.push(esc(nameOf(d)) + " will glitch often (" + H.fmtE(f3.E) + "): move it back, shield it, or use a camera rated for stronger fields. Glitches are also part of the record: the 1988-89 footage is full of them."); });
			if (tips.length) out.push("<p><b>Suggestions for this layout:</b></p><ul>" + tips.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>");
		} else out.push("<p>Add an <b>Active (target) area</b> from the palette to get a report on the place where the fields should cross.</p>");
		var tot = 0; samples().forEach(function (d) { var fa2 = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa2, {neighbour: neighbour(d)}); Object.keys(r).forEach(function (k2) { tot += r[k2]; }); });
		out.push("<p><b>Expected rate:</b> about " + (tot >= 0.95 ? tot.toFixed(1) + " events an hour" : tot > 0.02 ? "one event every " + Math.round(60 / tot) + " minutes" : "almost none") + " across all samples once warmed up. For comparison, Hutchison's own rate improved from hours apart (1981) to about every 30 minutes (1989), and George Hathaway's 1993 plan aimed for more than one an hour.</p>");
		box.innerHTML = out.join("");
	}

	/* ================= schematic view ================= */
	function drawSchematic() {
		var cvs = $("hx-sch"); if (!cvs) return; var L = H.schematic(st), w = cvs.parentNode.clientWidth || 800, cols = Math.max(1, L.cols), bw = Math.max(110, Math.min(170, (w - 40) / Math.max(cols, 1) - 30)), bh = 86, gx = (w - 40 - cols * bw) / Math.max(1, cols - 1 || 1), rowsMain = L.rows, gy = 30;
		var freeN = L.nodes.filter(function (n) { return n.col < 0; }).length, perRow = Math.max(1, Math.floor((w - 20) / (bw + 16))), freeRows = Math.ceil(freeN / perRow);
		var h = 40 + (L.cols ? rowsMain * (bh + gy) : 0) + (freeN ? 40 + freeRows * (bh + 16) : 0) + 20; cvs.style.height = h + "px"; cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
		var c = cvs.getContext("2d"), I = ink(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "12px system-ui,sans-serif";
		var pos = {}; if (cols === 1) gx = 0;
		L.nodes.forEach(function (n) { if (n.col >= 0) pos[n.id] = {x: 20 + n.col * (bw + (cols > 1 ? gx : 0)) + (cols === 1 ? (w - 40 - bw) / 2 : 0), y: 30 + n.row * (bh + gy)}; });
		var fi = 0; L.nodes.forEach(function (n) { if (n.col < 0) { pos[n.id] = {x: 10 + (fi % perRow) * (bw + 16), y: 40 + (L.cols ? rowsMain * (bh + gy) : 0) + 30 + Math.floor(fi / perRow) * (bh + 16)}; fi++; } });
		c.fillStyle = I.dim; c.textAlign = "left"; if (L.cols) c.fillText("Power and signal flow, left to right (from the cables you drew)", 20, 18);
		if (freeN) c.fillText("Field-only devices (no cables): they act on the target through the air", 10, 40 + (L.cols ? rowsMain * (bh + gy) : 0) + 18);
		// wires
		L.cables.forEach(function (cb) {
			var a = pos[cb[0]], b = pos[cb[1]]; if (!a || !b) return; var ad = byId(cb[0]), sig = ad && ad.t === "siggen";
			var x1 = a.x + bw, y1 = a.y + bh / 2, x2 = b.x, y2 = b.y + bh / 2, mx = x2 > x1 ? (x1 + x2) / 2 : x1 + 14;
			c.strokeStyle = sig ? "#3b82f6" : "#dc2626"; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(mx, y1); c.lineTo(mx, y2); c.lineTo(x2, y2); c.stroke();
			c.fillStyle = c.strokeStyle; c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 8, y2 - 4); c.lineTo(x2 - 8, y2 + 4); c.closePath(); c.fill();
		});
		L.nodes.forEach(function (n) {
			var p = pos[n.id], d = n.d, T = DEV[d.t]; c.fillStyle = isDark() ? "#111827" : "#f8fafc"; c.strokeStyle = d.on === false ? "#9ca3af" : T.color; c.lineWidth = 2; rr(c, p.x, p.y, bw, bh, 8); c.fill(); c.stroke();
			sym(c, d.t, p.x + 26, p.y + bh / 2, 40, isDark() ? T.color : shade(T.color));
			c.fillStyle = I.fg; c.textAlign = "left"; c.font = "600 12px system-ui,sans-serif"; wrapText(c, nameOf(d), p.x + 52, p.y + 18, bw - 58, 14, 2);
			c.font = "11px system-ui,sans-serif"; c.fillStyle = I.dim; var sp = specLine(d); wrapText(c, sp, p.x + 52, p.y + 50, bw - 58, 13, 3);
			if (d.on === false) { c.fillStyle = "#ef4444"; c.fillText("off", p.x + bw - 22, p.y + 14); }
		});
		if (!L.nodes.length) { c.fillStyle = I.dim; c.fillText("Nothing to draw yet.", 20, 30); }
	}
	function shade(hex) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(r * 0.6) + "," + Math.round(g * 0.6) + "," + Math.round(b * 0.6) + ")"; }
	function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
	function wrapText(c, t, x, y, mw, lh, maxL) { var words = String(t).split(" "), line = "", n = 0; for (var i = 0; i < words.length; i++) { var test = line ? line + " " + words[i] : words[i]; if (c.measureText(test).width > mw && line) { c.fillText(line, x, y); y += lh; line = words[i]; if (++n >= maxL - 1) { var rest = words.slice(i).join(" "); while (c.measureText(rest + "…").width > mw && rest.length > 1) rest = rest.slice(0, -1); c.fillText(rest + (rest !== words.slice(i).join(" ") ? "…" : ""), x, y); return; } } else line = test; } if (line) c.fillText(line, x, y); }
	function specLine(d) {
		var T = DEV[d.t], r = info[d.id] || {}, k = T.kind, parts2 = [];
		if (k === "tank") parts2.push(+d.C + " nF, " + +d.L + " µH → " + H.fmtF(r.f));
		else if (k === "pulse") parts2.push(+d.kV + " kV, " + +d.C + " µF, every " + +d.gap + " s");
		else if (d.t === "mains") parts2.push((+d.P || 1650) + " W");
		else if (/hv|rf|dc|pow|mag|sig/.test(k)) { if (+d.kV) parts2.push((Math.abs(+d.kV) >= 1 ? +d.kV + " kV" : Math.round(+d.kV * 1000) + " V")); if (r.f > 0) parts2.push(H.fmtF(r.f)); else if (k === "dc" || k === "pow") parts2.push("DC"); if (+d.P) parts2.push(+d.P + " W"); if (r.tune != null && r.tune < 0.95) parts2.push(Math.round(r.tune * 100) + "% tuned"); }
		else if (d.t === "camera") parts2.push("immunity " + (+d.imm || 10) + " V/m");
		return parts2.join(" · ");
	}

	/* ================= equipment view ================= */
	function buildEquipment() {
		var box = $("hx-eqgrid"); if (!box || box.__built) return; box.__built = 1;
		H.ORDER.forEach(function (t) {
			var T = DEV[t], card = document.createElement("article"); card.className = "tu-card hx-eqc"; card.id = "hx-eq-" + t;
			var cvs = document.createElement("canvas"); cvs.className = "hx-eqpic"; cvs.setAttribute("role", "img"); cvs.setAttribute("aria-label", "Drawing of a " + T.name);
			card.appendChild(cvs);
			var d = T.def, specs = [];
			if (d.kV) specs.push((Math.abs(d.kV) >= 1 ? d.kV + " kV" : Math.round(d.kV * 1000) + " V")); if (d.f) specs.push(H.fmtF(d.f)); if (d.P) specs.push(d.P + " W"); if (d.C) specs.push(t === "tank" ? d.C + " nF, " + d.L + " µH" : d.C + " µF"); if (d.gap) specs.push("every " + d.gap + " s");
			card.insertAdjacentHTML("beforeend", "<h3>" + esc(T.name) + "</h3>" + (specs.length ? "<p class=\"hx-eqs\">Default in the simulator: " + esc(specs.join(" · ")) + "</p>" : "") + "<p>" + esc(T.spec) + "</p><p><b>What Hutchison used.</b> " + esc(T.used) + "</p><p><b>Planning a replication.</b> " + esc(T.plan) + "</p><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-addeq=\"" + t + "\">+ Add to the lab floor</button>");
			box.appendChild(card);
		});
		box.addEventListener("click", function (e) { var b = e.target.closest("[data-addeq]"); if (!b) return; setTab("lab"); armAdd({t: b.dataset.addeq}); stage.scrollIntoView({behavior: "smooth", block: "center"}); });
		var mt = $("hx-mattable"); if (mt) mt.innerHTML = "<thead><tr><th>Material</th><th>Density</th>" + H.EFFECTS.map(function (e) { return "<th title=\"" + esc(e.name) + "\">" + esc(e.name.split(/[ /]/)[0]) + "</th>"; }).join("") + "</tr></thead><tbody>" + Object.keys(MAT).map(function (k) { var M = MAT[k]; return "<tr><th>" + esc(M.name) + "</th><td>" + M.rho + " kg/m³</td>" + H.EFFECTS.map(function (e) { var v = e.id === "bub" ? (M.liquid ? 1 : 0) : e.id === "brt" ? (M.liquid ? 1 : 0) : (M.sus[e.id] || 0); return "<td class=\"hx-pc\" style=\"--p:" + v + ";--c:" + e.color + "\">" + (v ? v.toFixed(2) : "·") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody>";
		var et = $("hx-efftable"); if (et) et.innerHTML = "<thead><tr><th>Effect</th><th>Events / hour at full drive (100 g)</th><th>Mass dependence</th><th>As reported</th></tr></thead><tbody>" + H.EFFECTS.map(function (e) { return "<tr><th><i class=\"hx-dot\" style=\"background:" + e.color + "\"></i> " + esc(e.name) + "</th><td>" + e.base + "</td><td>" + (e.mass ? "halves near " + (e.mass >= 1000 ? e.mass / 1000 + " kg" : e.mass + " g") : "none") + "</td><td>" + esc(e.note) + "</td></tr>"; }).join("") + "</tbody>";
		paintEquipment();
	}
	function paintEquipment() { Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-eqpic"), function (cvs) { var t = cvs.parentNode.id.replace("hx-eq-", ""), w = cvs.parentNode.clientWidth - 2 || 260, h = 120; cvs.style.height = h + "px"; cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); var c = cvs.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#0b0f17"; c.fillRect(0, 0, w, h); sym(c, t, w / 2, h / 2, 96, DEV[t].color); }); }

	/* ================= tabs, controls, share ================= */
	function setTab(t) {
		ui.tab = t; Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-tabs [role=tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(document.querySelectorAll("#hx section[data-panel]"), function (s) { s.hidden = s.dataset.panel !== t; });
		if (t === "lab") { layout(); renderPanels(); } else if (t === "sch") drawSchematic(); else if (t === "eq") { buildEquipment(); paintEquipment(); }
	}
	Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-tabs [role=tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function renderAll() { layout(); setRoomInputs(); editor(); renderPanels(); if (ui.tab === "sch") drawSchematic(); paintPreset(); var sel = $("hx-map"); if (sel) sel.value = ui.map; paintLegend(); }
	function paintPreset() { Array.prototype.forEach.call(document.querySelectorAll("#hx-pre button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === st.preset ? "true" : "false"); }); }
	(function () { var box = $("hx-pre"); Object.keys(H.PRESETS).forEach(function (k) { var b = document.createElement("button"); b.type = "button"; b.dataset.p = k; b.textContent = H.PRESETS[k].name; b.onclick = function () { loadPreset(k); }; box.appendChild(b); }); var cl = document.createElement("button"); cl.type = "button"; cl.textContent = "Empty room"; cl.onclick = function () { st = {room: {w: st.room.w, h: st.room.h, refl: st.room.refl}, items: [], cables: [], preset: ""}; resetRun(); ui.sel = null; dirty(true); renderAll(); note("An empty room: add equipment from the palette."); }; box.appendChild(cl); })();
	function paintLegend() { var m = MAPS[ui.map], lg = $("hx-leg"); if (!lg) return; var g = STOPS[m.map].map(function (s) { return "rgb(" + s[1] + "," + s[2] + "," + s[3] + ") " + Math.round(s[0] * 100) + "%"; }).join(","); lg.innerHTML = "<b>" + esc(m.name) + "</b><span class=\"hx-lgbar\" style=\"background:linear-gradient(90deg," + g + ")\"></span><span class=\"hx-lgt\"><i>" + esc(m.leg[0]) + "</i><i>" + esc(m.leg[1]) + "</i><i>" + esc(m.leg[2]) + "</i></span>"; }
	$("hx-map").onchange = function () { ui.map = this.value; mapDirty = true; paintLegend(); saveSoon(); };
	["cab", "lab", "cam", "ring"].forEach(function (k) { var el = $("hx-o-" + k); if (!el) return; el.checked = ui.opts[k]; el.onchange = function () { ui.opts[k] = el.checked; if (k === "cam") layout(); saveSoon(); }; });
	function setRoomInputs() { $("hx-rw").value = st.room.w; $("hx-rh").value = st.room.h; $("hx-rr").value = st.room.refl || 0; $("hx-rr-v").textContent = Math.round((st.room.refl || 0) * 100) + "%"; }
	$("hx-rw").onchange = $("hx-rh").onchange = function () { var w = parseFloat($("hx-rw").value), h = parseFloat($("hx-rh").value); if (w >= 2 && w <= 60) st.room.w = w; if (h >= 2 && h <= 60) st.room.h = h; st.items.forEach(function (d) { d.x = H.clamp(d.x, 0, st.room.w); d.y = H.clamp(d.y, 0, st.room.h); }); samplesChanged(); dirty(true); layout(); renderPanels(); };
	$("hx-rr").oninput = function () { st.room.refl = parseFloat(this.value) || 0; $("hx-rr-v").textContent = Math.round(st.room.refl * 100) + "%"; samplesChanged(); dirty(false); clearTimeout(edT); edT = setTimeout(renderPanels, 300); };
	function setRun(r) { ui.run = r; var b = $("hx-play"); b.textContent = r ? "❚❚ Pause" : "▶ Run"; b.setAttribute("aria-pressed", r ? "true" : "false"); updateReadouts(); }
	$("hx-play").onclick = function () { setRun(!ui.run); };
	$("hx-restart").onclick = function () { resetRun(); var l = $("hx-log"); if (l) l.innerHTML = ""; samplesChanged(); renderPanels(); updateReadouts(); note("Experiment restarted: the warm-up starts again from zero."); };
	var SPEEDS = [1, 10, 60, 300, 1200];
	function paintSpeed() { $("hx-spd-v").textContent = ui.speed + "×"; }
	$("hx-slow").onclick = function () { var i = SPEEDS.indexOf(ui.speed); ui.speed = SPEEDS[Math.max(0, (i < 0 ? 2 : i) - 1)]; paintSpeed(); saveSoon(); };
	$("hx-fast").onclick = function () { var i = SPEEDS.indexOf(ui.speed); ui.speed = SPEEDS[Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + 1)]; paintSpeed(); saveSoon(); };
	$("hx-png").onclick = function () {
		var c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height + Math.round(28 * dpr); var x = c2.getContext("2d"); x.drawImage(cv, 0, 0); x.fillStyle = "#0b0f17"; x.fillRect(0, cv.height, c2.width, c2.height - cv.height); x.fillStyle = "#e5e7eb"; x.font = Math.round(13 * dpr) + "px system-ui,sans-serif"; x.fillText("MES Hutchison Effect Simulator · " + MAPS[ui.map].name + " · mes.fm/hutchison-effect-simulator", 10 * dpr, cv.height + 19 * dpr);
		c2.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "hutchison-lab-" + (st.preset || "layout") + ".png"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); });
	};
	$("hx-sch-png").onclick = function () { var c0 = $("hx-sch"); c0.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "hutchison-schematic.png"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }); };
	$("hx-full").onclick = function () { var w = stage.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () {}); };
	document.addEventListener("fullscreenchange", function () { setTimeout(layout, 60); });
	$("hx-link").onclick = function () {
		var url = location.origin + location.pathname + "?s=" + H.encode(st);
		function done() { note("Link copied: it holds the whole layout (" + url.length + " characters)."); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};
	$("hx-sch-go").onclick = function () { setTab("lab"); };

	/* ================= loop ================= */
	var last = performance.now(), frame = 0;
	function redrawStatic() { drawFloor(performance.now()); }
	function loop(now) {
		var dt = Math.min(0.1, (now - last) / 1000); last = now; frame++;
		if (ui.tab === "lab") {
			tick(dt, now); stepParts(dt); if (ui.map === "T" && ui.run) tview += dt;
			drawFloor(now); drawCam(now);
			if (frame % 15 === 0) updateReadouts();
			if (frame % 90 === 0) { chartTimeline(); if (ui.sel) { var d = byId(ui.sel); if (d && d.t === "sample") refreshEditorReports(); } }
		}
		requestAnimationFrame(loop);
	}

	/* ================= start ================= */
	init(); paintPalette(); paintSpeed(); setRun(true); dirty(true);
	var tabWanted = ui.tab; setTab(tabWanted); renderAll();
	if (st.preset && H.PRESETS[st.preset]) note(H.PRESETS[st.preset].note);
	window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(function () { layout(); if (ui.tab === "sch") drawSchematic(); if (ui.tab === "eq") paintEquipment(); }, 80); });
	var rzT = 0; if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rzT); rzT = setTimeout(function () { layout(); }, 80); }).observe(stage.parentNode);
	new MutationObserver(function () { renderPanels(); if (ui.tab === "sch") drawSchematic(); }).observe(document.body, {attributes: true, attributeFilter: ["class"]});
	requestAnimationFrame(loop);
})();
