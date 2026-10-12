/* MES Mandelbrot Explorer -- pure maths (browser + node: require('./lib.js')).
 * compute(p) fills a band of rows with smooth escape counts (Float32; -1 = never escaped = inside). It has no outside references so it can be sent to a Web Worker
 * as source text (MESMandel.WORKER_SRC). Fractals: 0 Mandelbrot z^2 + c, 1 Burning Ship, 2 Tricorn (conjugate), 3 Multibrot z^3 + c, 4 Multibrot z^4 + c; every one has a Julia version
 * (c fixed, z0 = the pixel). Double precision: the picture breaks down below a width of about 1e-13 (MESMandel.MINSPAN).
 */
(function (root) {
	"use strict";
	var M = {};
	M.MINSPAN = 4e-14;
	M.TYPES = [
		{ id: 0, name: "Mandelbrot  z² + c", power: 2, home: { x: -0.5, y: 0, span: 3.4 }, julia: { x: 0, y: 0, span: 3.2 } },
		{ id: 1, name: "Burning Ship", power: 2, home: { x: -0.45, y: -0.5, span: 3.6 }, julia: { x: 0, y: 0, span: 3.4 } },
		{ id: 2, name: "Tricorn  (z̄)² + c", power: 2, home: { x: -0.2, y: 0, span: 3.6 }, julia: { x: 0, y: 0, span: 3.2 } },
		{ id: 3, name: "Multibrot  z³ + c", power: 3, home: { x: 0, y: 0, span: 3.0 }, julia: { x: 0, y: 0, span: 3.0 } },
		{ id: 4, name: "Multibrot  z⁴ + c", power: 4, home: { x: -0.1, y: 0, span: 2.8 }, julia: { x: 0, y: 0, span: 2.8 } }
	];

	function compute(p) {
		var w = p.w, r0 = p.r0, r1 = p.r1, out = new Float32Array((r1 - r0) * w), type = p.type, jul = !!p.julia, maxIter = p.maxIter, cxj = p.jx, cyj = p.jy;
		var pw = type >= 3 ? type : 2, lnp = Math.log(pw), lnR = Math.log(256), tol = Math.min(1e-13, p.dx * 1e-3), isM2 = type === 0 && !jul;
		for (var j = r0; j < r1; j++) {
			var py = p.y0 - (j + 0.5) * p.dx;
			for (var i = 0; i < w; i++) {
				var px = p.x0 + (i + 0.5) * p.dx, o = (j - r0) * w + i, cx, cy, x, y;
				if (jul) { cx = cxj; cy = cyj; x = px; y = py; } else { cx = px; cy = py; x = 0; y = 0; }
				if (isM2) {   /* main cardioid and the period-2 bulb are inside for sure */
					var q = (px - 0.25) * (px - 0.25) + py * py;
					if (q * (q + (px - 0.25)) < 0.25 * py * py || (px + 1) * (px + 1) + py * py < 0.0625) { out[o] = -1; continue; }
				}
				var n = 0, x2 = x * x, y2 = y * y, esc = false, sx = x, sy = y, cnt = 0, lim = 8, nx, ny, ax, ay;
				while (n < maxIter) {
					if (x2 + y2 > 65536) { esc = true; break; }
					if (type === 0) { ny = 2 * x * y + cy; nx = x2 - y2 + cx; }
					else if (type === 1) { ax = x < 0 ? -x : x; ay = y < 0 ? -y : y; nx = ax * ax - ay * ay + cx; ny = 2 * ax * ay + cy; }
					else if (type === 2) { nx = x2 - y2 + cx; ny = -2 * x * y + cy; }
					else if (type === 3) { nx = x * (x2 - 3 * y2) + cx; ny = y * (3 * x2 - y2) + cy; }
					else { nx = x2 * x2 - 6 * x2 * y2 + y2 * y2 + cx; ny = 4 * x * y * (x2 - y2) + cy; }
					x = nx; y = ny; x2 = x * x; y2 = y * y; n++;
					if (++cnt >= lim) { sx = x; sy = y; cnt = 0; lim *= 2; } else if ((x - sx < tol && sx - x < tol) && (y - sy < tol && sy - y < tol)) break;   /* came back to a saved point: a cycle */
				}
				if (esc) { var r = Math.sqrt(x2 + y2); out[o] = n + 1 - Math.log(Math.log(r) / lnR) / lnp; if (!(out[o] >= 0)) out[o] = n; }
				else out[o] = -1;
			}
		}
		return out;
	}
	M.compute = compute;
	M.WORKER_SRC = "self.onmessage=function(e){var d=e.data;var buf=(" + compute.toString() + ")(d);self.postMessage({id:d.id,r0:d.r0,r1:d.r1,buf:buf},[buf.buffer]);};";

	/* one point: orbit z0, z1, ... until escape (or n steps); jul = Julia version (c = jc, z0 = the point) */
	M.step = function (type, x, y, cx, cy) {
		var x2 = x * x, y2 = y * y;
		if (type === 0) return [x2 - y2 + cx, 2 * x * y + cy];
		if (type === 1) { var ax = Math.abs(x), ay = Math.abs(y); return [ax * ax - ay * ay + cx, 2 * ax * ay + cy]; }
		if (type === 2) return [x2 - y2 + cx, -2 * x * y + cy];
		if (type === 3) return [x * (x2 - 3 * y2) + cx, y * (3 * x2 - y2) + cy];
		return [x2 * x2 - 6 * x2 * y2 + y2 * y2 + cx, 4 * x * y * (x2 - y2) + cy];
	};
	M.orbit = function (type, julia, jx, jy, px, py, n) {
		var pts = [], x = julia ? px : 0, y = julia ? py : 0, cx = julia ? jx : px, cy = julia ? jy : py;
		pts.push([x, y]);
		for (var i = 0; i < n; i++) { var s = M.step(type, x, y, cx, cy); x = s[0]; y = s[1]; pts.push([x, y]); if (x * x + y * y > 1e6) break; }
		return pts;
	};
	/* classify one point: {inside, n (steps to escape), period (of the cycle it falls into, 0 if unknown), smooth} */
	M.classify = function (type, julia, jx, jy, px, py, maxIter) {
		var band = compute({ w: 1, r0: 0, r1: 1, x0: px - 0.5e-12, y0: py + 0.5e-12, dx: 1e-12, type: type, julia: julia, jx: jx, jy: jy, maxIter: maxIter }), s = band[0];
		var res = { inside: s < 0, smooth: s, n: s < 0 ? maxIter : Math.floor(s), period: 0 };
		if (s < 0) {
			var x = julia ? px : 0, y = julia ? py : 0, cx = julia ? jx : px, cy = julia ? jy : py, hist = [];
			for (var i = 0; i < Math.max(2000, maxIter); i++) { var st = M.step(type, x, y, cx, cy); x = st[0]; y = st[1]; if (i > 1500) hist.push([x, y]); }
			for (var p = 1; p <= 64 && !res.period; p++) { var a = hist[hist.length - 1], b = hist[hist.length - 1 - p]; if (b && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) res.period = p; }
		}
		return res;
	};
	M.autoIter = function (span) { return Math.max(120, Math.min(6000, Math.round(130 + 70 * Math.log2(Math.max(1, 3.4 / span))))); };

	/* ---------- colours ---------- */
	var STOPS = {
		classic: [[0, 7, 100], [32, 107, 203], [237, 255, 255], [255, 170, 0], [0, 2, 0]],
		fire: [[0, 0, 0], [140, 10, 0], [255, 90, 0], [255, 220, 40], [255, 255, 235], [90, 0, 0]],
		ocean: [[2, 8, 40], [10, 70, 130], [40, 190, 200], [220, 250, 255], [20, 120, 170]],
		electric: [[10, 0, 40], [90, 20, 200], [0, 220, 255], [255, 255, 255], [255, 40, 180]],
		forest: [[5, 20, 10], [20, 100, 40], [180, 220, 90], [255, 250, 200], [60, 130, 60]],
		gray: [[0, 0, 0], [255, 255, 255], [0, 0, 0]]
	};
	M.PALETTES = [{ id: "classic", name: "Classic blue and gold" }, { id: "fire", name: "Fire" }, { id: "ocean", name: "Ocean" }, { id: "electric", name: "Electric" }, { id: "forest", name: "Forest" }, { id: "rainbow", name: "Rainbow" }, { id: "gray", name: "Greyscale" }];
	M.lut = function (id) {
		var N = 1024, out = new Uint8Array(N * 3), i;
		if (id === "rainbow") {
			for (i = 0; i < N; i++) { var h = i / N * 6, f = h - Math.floor(h), k = Math.floor(h) % 6, v = 235, p2 = 0, q2 = 235 * (1 - f), t2 = 235 * f, rgb = [[v, t2, p2], [q2, v, p2], [p2, v, t2], [p2, q2, v], [t2, p2, v], [v, p2, q2]][k]; out[i * 3] = rgb[0]; out[i * 3 + 1] = rgb[1]; out[i * 3 + 2] = rgb[2]; }
			return out;
		}
		var st = STOPS[id] || STOPS.classic, m = st.length;
		for (i = 0; i < N; i++) {
			var u = i / N * m, a = Math.floor(u) % m, b = (a + 1) % m, f2 = u - Math.floor(u), s = f2 * f2 * (3 - 2 * f2);
			for (var c = 0; c < 3; c++) out[i * 3 + c] = st[a][c] + (st[b][c] - st[a][c]) * s;
		}
		return out;
	};

	/* ---------- places worth visiting ---------- */
	M.PLACES = {
		0: [{ name: "The whole set", x: -0.5, y: 0, span: 3.4 }, { name: "Seahorse valley", x: -0.7436438870371587, y: 0.13182590420531197, span: 2.5e-3 }, { name: "Spiral", x: -0.761574, y: -0.0847596, span: 2.2e-3 },
			{ name: "Triple spiral valley", x: -0.088, y: 0.654, span: 0.02 }, { name: "Mini Mandelbrot (period 3)", x: -1.7548776662466927, y: 0, span: 0.03 }, { name: "Starfish", x: -0.374004139, y: 0.659792175, span: 4e-3 },
			{ name: "Elephant valley", x: 0.2845, y: 0.0112, span: 0.015 }, { name: "Deep zoom (1e-12)", x: -0.743643135, y: 0.131825963, span: 4e-9 }],
		1: [{ name: "The whole ship", x: -0.45, y: -0.5, span: 3.6 }, { name: "The ship's hull", x: -1.762, y: -0.028, span: 0.06 }, { name: "Mini ship", x: -1.7443, y: -0.0173, span: 0.01 }],
		2: [{ name: "The whole tricorn", x: -0.2, y: 0, span: 3.6 }, { name: "Left tip", x: -1.9, y: 0, span: 0.3 }],
		3: [{ name: "The whole set", x: 0, y: 0, span: 3.0 }, { name: "Outer arm", x: -0.9, y: 0.35, span: 0.3 }],
		4: [{ name: "The whole set", x: -0.1, y: 0, span: 2.8 }, { name: "Arm", x: 0.6, y: 0.6, span: 0.3 }]
	};
	M.JULIAS = [
		{ name: "Douady's rabbit", x: -0.123, y: 0.745 }, { name: "Dendrite", x: 0, y: 1 }, { name: "San Marco", x: -0.75, y: 0 }, { name: "Siegel disk", x: -0.391, y: -0.587 },
		{ name: "Fatou dust", x: 0.285, y: 0.01 }, { name: "Spiral galaxy", x: -0.8, y: 0.156 }, { name: "Circle (c = 0)", x: 0, y: 0 }, { name: "Basilica", x: -1, y: 0 }
	];
	M.fmt = function (x) { var a = Math.abs(x); if (a !== 0 && (a < 1e-4 || a >= 1e6)) return x.toExponential(6); return String(+x.toPrecision(Math.max(6, Math.min(16, 6 + Math.ceil(-Math.log10(Math.max(a, 1e-300))) )))); };
	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESMandel = M;
})(typeof window !== "undefined" ? window : this);

/* MES Mandelbrot Explorer -- mes.fm/mandelbrot
 * UI around MESMandel (lib.js). Escape counts are computed in a small pool of Web Workers (8-row bands, filling from the middle outwards) into a Float32 buffer, so changing the palette
 * or cycling colours never recomputes. Pan / zoom show the old picture transformed at once and re-render when you stop. Julia preview under the pointer, orbit overlay, point calculator.
 * State: localStorage mes-mandelbrot:v1; share links ?x=&y=&s=&t=&j=&jx=&jy=&i=&p=&tab=.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("mb");
	if (!root) return;
	var M = window.MESMandel, KEY = "mes-mandelbrot:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v, lo, hi, d) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function parseNum(s) { s = String(s).replace(/,/g, ".").replace(/\s+/g, ""); var v = Number(s); return isFinite(v) ? v : NaN; }
	var q = new URLSearchParams(location.search), saved = sget(), coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
	var TYPES = M.TYPES;

	/* ---------- state ---------- */
	var S = { type: num(q.get("t") || saved.type, 0, 4, 0) | 0, julia: q.get("j") === "1", jx: num(q.get("jx"), -3, 3, -0.123), jy: num(q.get("jy"), -3, 3, 0.745), cx: NaN, cy: NaN, span: NaN,
		auto: q.get("i") ? q.get("i") === "a" : saved.auto !== false, iter: num(q.get("i") || saved.iter, 50, 6000, 500), pal: M.PALETTES.some(function (p) { return p.id === (q.get("p") || saved.pal); }) ? (q.get("p") || saved.pal) : "classic",
		speed: num(saved.speed, 0.1, 4, 1), off: num(saved.off, 0, 1, 0), anim: false, quality: [0.5, 1, 2].indexOf(+saved.quality) >= 0 ? +saved.quality : (coarse ? 0.5 : 1), jprev: saved.jprev !== false, orbit: saved.orbit !== false };
	var home = S.julia ? TYPES[S.type].julia : TYPES[S.type].home;
	S.cx = num(q.get("x"), -10, 10, home.x); S.cy = num(q.get("y"), -10, 10, home.y); S.span = num(q.get("s"), M.MINSPAN, 40, home.span);
	var mview = { x: TYPES[S.type].home.x, y: TYPES[S.type].home.y, span: TYPES[S.type].home.span };   /* where the Mandelbrot view was, for "back" */
	var picked = null, hover = null;
	var tab = q.get("tab") === "calc" ? "calc" : "explore";

	var canvas = $("mb-canvas"), ctx = canvas.getContext("2d"), over = $("mb-over"), octx = over.getContext("2d"), stage = $("mb-stage"), jp = $("mb-jp"), jctx = jp.getContext("2d");
	var Wp = 0, Hp = 0, cur = null, nxt = null, renderId = 0, lut = M.lut(S.pal), rtimer = 0, paintReq = false;

	/* ---------- worker pool ---------- */
	var pool = [], poolSize = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)), workerOk = true, queue = [], busy = 0, wurl = null;
	function makePool() {
		if (pool.length || !workerOk) return;
		try {
			wurl = URL.createObjectURL(new Blob([M.WORKER_SRC], { type: "application/javascript" }));
			for (var i = 0; i < poolSize; i++) { var w = new Worker(wurl); w.busy = false; w.onmessage = onBand; w.onerror = function () { workerOk = false; killPool(); restartRender(); }; pool.push(w); }
		} catch (e) { workerOk = false; pool = []; }
	}
	function killPool() { pool.forEach(function (w) { try { w.terminate(); } catch (e) {} }); pool = []; }
	function dispatch() {
		if (!workerOk) { mainThreadStep(); return; }
		for (var i = 0; i < pool.length; i++) {
			var w = pool[i]; if (w.busy || !queue.length) continue;
			var job = queue.shift(); w.busy = true; w.postMessage(job);
		}
	}
	function onBand(e) {
		var m = e.data, w = e.target; w.busy = false;
		if (nxt && m.id === renderId) placeBand(m.r0, m.r1, m.buf);
		dispatch();
	}
	function mainThreadStep() {   /* fallback without workers: one band per tick */
		if (!queue.length) return;
		var job = queue.shift(), buf = M.compute(job);
		if (nxt && job.id === renderId) placeBand(job.r0, job.r1, buf);
		setTimeout(mainThreadStep, 0);
	}

	/* ---------- rendering ---------- */
	function sizeCanvas() {
		var wrap = stage.parentNode, W = wrap.clientWidth, asp = 16 / 9, H = Math.round(W / asp);
		if (document.fullscreenElement === wrap) { var mh = window.innerHeight - 90; if (H > mh) { H = mh; W = Math.round(H * asp); } }
		stage.style.width = W + "px"; stage.style.height = H + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1), sc = S.quality === 2 ? dpr : S.quality, cw = Math.min(1920, Math.max(160, Math.round(W * sc))), ch = Math.round(cw / asp);
		var ow = Math.round(W * dpr), oh = Math.round(H * dpr);
		var changed = canvas.width !== cw || canvas.height !== ch;
		if (changed) { canvas.width = cw; canvas.height = ch; }
		if (over.width !== ow || over.height !== oh) { over.width = ow; over.height = oh; }
		Wp = cw; Hp = ch;
		return changed;
	}
	function maxIter() { return S.auto ? M.autoIter(S.span) : S.iter; }
	function viewCopy() { return { cx: S.cx, cy: S.cy, span: S.span, W: Wp, H: Hp }; }
	function newBuf(view) {
		var c = document.createElement("canvas"); c.width = Wp; c.height = Hp; var cx = c.getContext("2d"), img = cx.createImageData(Wp, Hp);
		return { canvas: c, ctx: cx, img: img, vals: new Float32Array(Wp * Hp), view: view, rows: 0, total: Hp };
	}
	function colorRows(b, r0, r1) {
		var d = b.img.data, vals = b.vals, W = b.canvas.width, L = lut, sp = S.speed * 0.02, off = S.off;
		for (var j = r0; j < r1; j++) for (var i = 0; i < W; i++) {
			var p = j * W + i, v = vals[p], o = p * 4;
			if (v < 0) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; }
			else { var t = v * sp + off; t -= Math.floor(t); var k = ((t * 1023) | 0) * 3; d[o] = L[k]; d[o + 1] = L[k + 1]; d[o + 2] = L[k + 2]; }
			d[o + 3] = 255;
		}
	}
	function placeBand(r0, r1, buf) {
		nxt.vals.set(buf, r0 * Wp); colorRows(nxt, r0, r1); nxt.rows += r1 - r0; nxt.dirty = true;
		if (nxt.rows >= nxt.total) finishRender();
		requestPaint();
	}
	function finishRender() {
		nxt.ctx.putImageData(nxt.img, 0, 0); cur = nxt; nxt = null; $("mb-badge").textContent = ""; present();
	}
	function render() {
		clearTimeout(rtimer);
		makePool(); sizeCanvas();
		var id = ++renderId; queue = []; var view = viewCopy(); nxt = newBuf(view);
		var dx = S.span / Wp, y0 = S.cy + (S.span * Hp / Wp) / 2, x0 = S.cx - S.span / 2, mi = maxIter(), band = Wp > 1000 ? 4 : 8, bands = [];
		for (var r = 0; r < Hp; r += band) bands.push([r, Math.min(Hp, r + band)]);
		var mid = Hp / 2; bands.sort(function (a, b) { return Math.abs((a[0] + a[1]) / 2 - mid) - Math.abs((b[0] + b[1]) / 2 - mid); });
		bands.forEach(function (b) { queue.push({ id: id, r0: b[0], r1: b[1], w: Wp, x0: x0, y0: y0, dx: dx, type: S.type, julia: S.julia, jx: S.jx, jy: S.jy, maxIter: mi }); });
		$("mb-badge").textContent = "Rendering…";
		dispatch();
	}
	function restartRender() { render(); }
	function scheduleRender(ms) { clearTimeout(rtimer); rtimer = setTimeout(render, ms || 0); }
	function requestPaint() { if (!paintReq) { paintReq = true; requestAnimationFrame(function () { paintReq = false; if (nxt && nxt.dirty) { nxt.ctx.putImageData(nxt.img, 0, 0); nxt.dirty = false; } present(); }); } }

	/* draw the finished picture (moved / scaled to the current view) and, on top, the part of the new one that is ready */
	function present() {
		var W = canvas.width, H = canvas.height; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, W, H);
		ctx.imageSmoothingEnabled = true;
		if (cur) {
			var v = cur.view, pxNew = S.span / W;
			var dw = v.span / pxNew, dh = dw * (cur.canvas.height / cur.canvas.width);
			ctx.drawImage(cur.canvas, W / 2 + (v.cx - S.cx) / pxNew - dw / 2, H / 2 + (S.cy - v.cy) / pxNew - dh / 2, dw, dh);
		}
		if (nxt && nxt.rows) ctx.drawImage(nxt.canvas, 0, 0, W, H);
		drawOverlay();
	}
	function toPix(x, y) { var W = over.width, s = W / S.span; return [W / 2 + (x - S.cx) * s, over.height / 2 - (y - S.cy) * s]; }
	function fromPix(px, py) { var r = over.getBoundingClientRect(), W = r.width, s = S.span / W; return [S.cx + (px - r.left - W / 2) * s, S.cy - (py - r.top - r.height / 2) * s]; }
	function drawOverlay() {
		octx.clearRect(0, 0, over.width, over.height);
		var dpr = over.width / stage.clientWidth;
		if (picked) { var p = toPix(picked[0], picked[1]); octx.strokeStyle = "#fff"; octx.lineWidth = Math.max(1.5, dpr * 1.5); octx.beginPath(); octx.arc(p[0], p[1], 7 * dpr, 0, 6.2832); octx.stroke(); octx.beginPath(); octx.moveTo(p[0] - 11 * dpr, p[1]); octx.lineTo(p[0] + 11 * dpr, p[1]); octx.moveTo(p[0], p[1] - 11 * dpr); octx.lineTo(p[0], p[1] + 11 * dpr); octx.stroke(); }
		var pt = hover || picked;
		if (S.orbit && pt && tab === "explore") {
			var orb = M.orbit(S.type, S.julia, S.jx, S.jy, pt[0], pt[1], 70); octx.lineWidth = Math.max(1, dpr); octx.strokeStyle = "rgba(255,255,255,0.75)"; octx.beginPath();
			for (var i = 0; i < orb.length; i++) { var o = toPix(orb[i][0], orb[i][1]); if (i === 0) octx.moveTo(o[0], o[1]); else octx.lineTo(o[0], o[1]); }
			octx.stroke(); octx.fillStyle = "#ffd54a";
			for (i = 0; i < orb.length; i += Math.max(1, Math.floor(orb.length / 25))) { var o2 = toPix(orb[i][0], orb[i][1]); octx.beginPath(); octx.arc(o2[0], o2[1], 2.2 * dpr, 0, 6.2832); octx.fill(); }
		}
	}

	/* ---------- pointer: pan, zoom, pick ---------- */
	var pts = {}, drag = null, pinch = null, wheelT = 0;
	function zoomAt(f, px, py) {   /* f > 1 zooms in */
		var ns = Math.max(M.MINSPAN, Math.min(40, S.span / f));
		if (ns === S.span && f > 1) { toast("That is as deep as 64-bit numbers go (width " + S.span.toExponential(1) + ")"); return; }
		var p = fromPix(px, py); S.cx = p[0] + (S.cx - p[0]) * (ns / S.span); S.cy = p[1] + (S.cy - p[1]) * (ns / S.span); S.span = ns;
	}
	over.addEventListener("pointerdown", function (e) {
		over.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY };
		var ids = Object.keys(pts);
		if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, cx: S.cx, cy: S.cy, moved: false, t: Date.now() };
		else if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), span: S.span }; drag = null; }
		e.preventDefault();
	});
	over.addEventListener("pointermove", function (e) {
		var r = over.getBoundingClientRect(), pxs = S.span / r.width;
		if (pts[e.pointerId]) pts[e.pointerId] = { x: e.clientX, y: e.clientY };
		if (pinch && Object.keys(pts).length === 2) {
			var ids = Object.keys(pts), a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), ns = Math.max(M.MINSPAN, Math.min(40, pinch.span * pinch.d / Math.max(1, d)));
			var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, p = fromPix(mx, my); S.cx = p[0] + (S.cx - p[0]) * (ns / S.span); S.cy = p[1] + (S.cy - p[1]) * (ns / S.span); S.span = ns; present(); info(); return;
		}
		if (drag) {
			var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
			if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
			if (drag.moved) { S.cx = drag.cx - dx * pxs; S.cy = drag.cy + dy * pxs; nxt = null; renderId++; present(); info(); return; }
		}
		hover = fromPix(e.clientX, e.clientY); hoverInfo(); drawOverlay();
	});
	function endPtr(e) {
		delete pts[e.pointerId];
		if (pinch && Object.keys(pts).length < 2) { pinch = null; scheduleRender(60); sset({}); }
		if (drag) {
			var d = drag; drag = null;
			if (d.moved) scheduleRender(0);
			else if (Date.now() - d.t < 500) { picked = fromPix(e.clientX, e.clientY); hover = null; updatePicked(); present(); }
		}
	}
	over.addEventListener("pointerup", endPtr); over.addEventListener("pointercancel", endPtr);
	over.addEventListener("pointerleave", function () { hover = null; drawOverlay(); if (picked) jpreview(picked); });
	over.addEventListener("dblclick", function (e) { zoomAt(2.6, e.clientX, e.clientY); nxt = null; renderId++; present(); info(); scheduleRender(0); });
	over.addEventListener("wheel", function (e) {
		e.preventDefault(); var f = Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 16 : 1)); zoomAt(f, e.clientX, e.clientY); nxt = null; renderId++; present(); info(); scheduleRender(160);
	}, { passive: false });
	over.addEventListener("keydown", function (e) {
		var r = over.getBoundingClientRect(), k = e.key, s = S.span * 0.1;
		if (k === "+" || k === "=") { zoomAt(1.5, r.left + r.width / 2, r.top + r.height / 2); } else if (k === "-" || k === "_") { zoomAt(1 / 1.5, r.left + r.width / 2, r.top + r.height / 2); }
		else if (k === "ArrowLeft") S.cx -= s; else if (k === "ArrowRight") S.cx += s; else if (k === "ArrowUp") S.cy += s; else if (k === "ArrowDown") S.cy -= s; else if (k === "0") goHome(); else return;
		e.preventDefault(); nxt = null; renderId++; present(); info(); scheduleRender(120);
	});
	$("mb-in").onclick = function () { var r = over.getBoundingClientRect(); zoomAt(2, r.left + r.width / 2, r.top + r.height / 2); nxt = null; renderId++; present(); info(); scheduleRender(0); };
	$("mb-out").onclick = function () { var r = over.getBoundingClientRect(); zoomAt(0.5, r.left + r.width / 2, r.top + r.height / 2); nxt = null; renderId++; present(); info(); scheduleRender(0); };
	function goHome() { var h = S.julia ? TYPES[S.type].julia : TYPES[S.type].home; S.cx = h.x; S.cy = h.y; S.span = h.span; }
	$("mb-home").onclick = function () { goHome(); nxt = null; renderId++; present(); info(); scheduleRender(0); };

	/* ---------- readouts ---------- */
	function fmtC(x, y) { return M.fmt(x) + (y < 0 ? " − " : " + ") + M.fmt(Math.abs(y)) + "i"; }
	function info() {
		$("mb-r-w").textContent = S.span >= 0.01 ? (+S.span.toPrecision(4)) + "" : S.span.toExponential(2);
		var z = (S.julia ? TYPES[S.type].julia.span : TYPES[S.type].home.span) / S.span;
		$("mb-r-z").textContent = "magnification ×" + (z >= 1e6 ? z.toExponential(2) : (+z.toPrecision(4)));
		$("mb-r-m").textContent = M.fmt(S.cx) + (S.cy < 0 ? " − " : " + ") + M.fmt(Math.abs(S.cy)) + "i"; $("mb-r-i").textContent = maxIter() + " iterations" + (S.span < 4e-13 ? " · at the limit of 64-bit numbers" : "");
		$("mb-it-v").textContent = maxIter() + (S.auto ? " (auto)" : "");
		if (!S.auto) $("mb-it-in").value = S.iter;
	}
	var infoReq = false;
	function hoverInfo() { if (infoReq) return; infoReq = true; requestAnimationFrame(function () { infoReq = false; if (!hover) return; pointInfo(hover); jpreview(hover); }); }
	function pointInfo(p) {
		var c = M.classify(S.type, S.julia, S.jx, S.jy, p[0], p[1], Math.min(maxIter(), 1500));
		$("mb-r-c").textContent = fmtC(p[0], p[1]);
		$("mb-r-s").textContent = c.inside ? "never escapes (inside)" + (c.period ? ", falls into a cycle of " + c.period : "") : "escapes after " + c.n + " steps";
		return c;
	}
	function updatePicked() { if (!picked) return; pointInfo(picked); jpreview(picked); $("mb-julia").hidden = S.julia; $("mb-julia").dataset.x = picked[0]; $("mb-julia").dataset.y = picked[1]; }
	function jpreview(p) {
		var box = $("mb-jbox"); box.hidden = !(S.jprev && !S.julia); if (box.hidden) return;
		var W = jp.width, H = jp.height, jt = TYPES[S.type].julia, dx = jt.span / W, buf = M.compute({ w: W, r0: 0, r1: H, x0: jt.x - jt.span / 2, y0: jt.y + (jt.span * H / W) / 2, dx: dx, type: S.type, julia: true, jx: p[0], jy: p[1], maxIter: 160 });
		var img = jctx.createImageData(W, H), d = img.data, sp = S.speed * 0.02;
		for (var i = 0; i < buf.length; i++) { var v = buf[i], o = i * 4; if (v < 0) { d[o] = d[o + 1] = d[o + 2] = 0; } else { var t = v * sp + S.off; t -= Math.floor(t); var k = ((t * 1023) | 0) * 3; d[o] = lut[k]; d[o + 1] = lut[k + 1]; d[o + 2] = lut[k + 2]; } d[o + 3] = 255; }
		jctx.putImageData(img, 0, 0); $("mb-jcap").textContent = "Julia set of " + fmtC(p[0], p[1]);
	}

	/* ---------- controls ---------- */
	$("mb-type").innerHTML = TYPES.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "</option>"; }).join("");
	$("mb-pal").innerHTML = M.PALETTES.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("");
	function fillPlaces() {
		var sel = $("mb-place"), items = S.julia ? M.JULIAS : (M.PLACES[S.type] || []);
		$("mb-place-l").textContent = S.julia ? "Famous Julia sets" : "Places to visit";
		sel.innerHTML = '<option value="">Choose…</option>' + items.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + "</option>"; }).join("");
	}
	$("mb-place").onchange = function () {
		if (this.value === "") return;
		var items = S.julia ? M.JULIAS : M.PLACES[S.type], p = items[+this.value];
		if (S.julia) { S.jx = p.x; S.jy = p.y; var h = TYPES[S.type].julia; S.cx = h.x; S.cy = h.y; S.span = h.span; picked = null; }
		else { S.cx = p.x; S.cy = p.y; S.span = p.span; picked = null; }
		this.value = ""; nxt = null; renderId++; present(); info(); scheduleRender(0); syncMode();
	};
	$("mb-type").onchange = function () { S.type = +this.value; sset({ type: S.type }); S.julia = false; goHome(); picked = null; fillPlaces(); nxt = null; cur = null; info(); syncMode(); scheduleRender(0); };
	$("mb-pal").onchange = function () { S.pal = this.value; lut = M.lut(S.pal); sset({ pal: S.pal }); recolor(); };
	$("mb-sp-in").oninput = function () { S.speed = +this.value; $("mb-sp-v").textContent = S.speed.toFixed(2); sset({ speed: S.speed }); recolor(); };
	$("mb-of-in").oninput = function () { S.off = +this.value; $("mb-of-v").textContent = S.off.toFixed(2); sset({ off: S.off }); recolor(); };
	function recolor() { if (cur) { colorRows(cur, 0, cur.canvas.height); cur.ctx.putImageData(cur.img, 0, 0); present(); } if (nxt) { colorRows(nxt, 0, Hp); nxt.dirty = true; requestPaint(); } if (picked || hover) jpreview(hover || picked); }
	$("mb-auto").onchange = function () { S.auto = this.checked; $("mb-it-in").disabled = S.auto; sset({ auto: S.auto }); info(); scheduleRender(0); };
	$("mb-it-in").oninput = function () { S.iter = +this.value; S.auto = false; $("mb-auto").checked = false; $("mb-it-in").disabled = false; sset({ iter: S.iter, auto: false }); info(); scheduleRender(250); };
	$("mb-q").onchange = function () { S.quality = +this.value; sset({ quality: S.quality }); cur = null; scheduleRender(0); };
	$("mb-jprev").onchange = function () { S.jprev = this.checked; sset({ jprev: S.jprev }); $("mb-jbox").hidden = !S.jprev || S.julia || !(picked || hover); if (S.jprev && (picked || hover)) jpreview(hover || picked); };
	$("mb-orbit").onchange = function () { S.orbit = this.checked; sset({ orbit: S.orbit }); drawOverlay(); };
	var animT = 0;
	$("mb-anim").onchange = function () {
		S.anim = this.checked; cancelAnimationFrame(animT);
		if (S.anim) { var step = function () { animT = requestAnimationFrame(step); if (document.hidden || nxt) return; S.off = (S.off + 0.004) % 1; $("mb-of-in").value = S.off; $("mb-of-v").textContent = S.off.toFixed(2); recolor(); }; step(); }
	};
	function syncMode() {
		$("mb-julia").hidden = S.julia || !picked; $("mb-back").hidden = !S.julia; $("mb-jbox").hidden = !S.jprev || S.julia || !picked; $("mb-type").value = S.type;
		$("mb-badge").textContent = ""; fillPlaces();
	}
	$("mb-julia").onclick = function () {
		if (!picked) return; mview = { x: S.cx, y: S.cy, span: S.span }; S.jx = picked[0]; S.jy = picked[1]; S.julia = true; goHome(); picked = null; nxt = null; cur = null; info(); syncMode(); scheduleRender(0);
		$("mb-r-s").textContent = "Julia set of " + fmtC(S.jx, S.jy);
	};
	$("mb-back").onclick = function () { S.julia = false; S.cx = mview.x; S.cy = mview.y; S.span = mview.span; picked = [S.jx, S.jy]; nxt = null; cur = null; info(); syncMode(); updatePicked(); scheduleRender(0); };
	$("mb-png").onclick = function () { if (!cur) return; var c = document.createElement("canvas"); c.width = cur.canvas.width; c.height = cur.canvas.height; c.getContext("2d").drawImage(cur.canvas, 0, 0); var a = document.createElement("a"); a.download = "mandelbrot.png"; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove(); };
	$("mb-full").onclick = function () { var w = stage.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	document.addEventListener("fullscreenchange", function () { setTimeout(function () { cur = null; scheduleRender(0); }, 80); });
	var toastT;
	function toast(msg) { var t = $("mb-toast"); if (!t) { t = document.createElement("div"); t.id = "mb-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	$("mb-link").onclick = function () {
		var u = new URL(location.href); u.search = ""; var P = u.searchParams; P.set("t", S.type); P.set("x", S.cx); P.set("y", S.cy); P.set("s", S.span); if (S.julia) { P.set("j", "1"); P.set("jx", S.jx); P.set("jy", S.jy); } P.set("i", S.auto ? "a" : S.iter); P.set("p", S.pal);
		var url = u.toString(), done = function () { toast("Link copied"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};
	var rz;
	function onResize() { clearTimeout(rz); rz = setTimeout(function () { if (tab === "explore") { var changed = sizeCanvas(); if (changed) { cur = null; scheduleRender(0); } else present(); } }, 120); }
	window.addEventListener("resize", onResize);
	if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage.parentNode);

	/* ---------- tabs + point calculator ---------- */
	function setTab(t) {
		tab = t; Array.prototype.forEach.call(document.querySelectorAll("#mb [data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(document.querySelectorAll("#mb [data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (history.replaceState) { try { var u = new URL(location.href); u.searchParams.set("tab", t); history.replaceState(null, "", u); } catch (e) {} }
		if (t === "explore") setTimeout(function () { onResize(); }, 0); else calc();
	}
	Array.prototype.forEach.call(document.querySelectorAll("#mb [data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function calc() {
		var a = parseNum($("mb-ca").value), b = parseNum($("mb-cb").value), mi = Math.max(10, Math.min(100000, Math.round(parseNum($("mb-cm").value) || 5000))), box = $("mb-cres"), tb = $("mb-ctab").tBodies[0];
		if (!isFinite(a) || !isFinite(b)) { box.innerHTML = "Type two numbers."; tb.innerHTML = ""; return; }
		var c = M.classify(S.type, false, 0, 0, a, b, mi), name = TYPES[S.type].name.replace(/\s+/g, " ");
		box.innerHTML = "<b>c = " + esc(fmtC(a, b)) + "</b> in the " + esc(name) + " picture:<br>" + (c.inside ? "<b>inside</b> (or too close to the edge to tell): the orbit did not escape in " + mi + " steps." + (c.period ? " It falls into a cycle that repeats every <b>" + c.period + "</b> step" + (c.period > 1 ? "s" : "") + "." : "") : "<b>outside</b>: the orbit escapes (|z| passes 256) after <b>" + c.n + "</b> steps; smooth escape value " + (+c.smooth.toFixed(4)) + ".") +
			"<br><span class=\"tu-note\">|c| = " + (+Math.hypot(a, b).toPrecision(6)) + (S.type === 0 ? (Math.hypot(a, b) > 2 ? " > 2, so it must be outside" : "") : "") + "</span>";
		var orb = M.orbit(S.type, false, 0, 0, a, b, 40), html = "";
		for (var i = 0; i < orb.length; i++) html += "<tr><td>" + i + "</td><td>" + (+orb[i][0].toPrecision(10)) + "</td><td>" + (+orb[i][1].toPrecision(10)) + "</td><td>" + (+Math.hypot(orb[i][0], orb[i][1]).toPrecision(8)) + "</td></tr>";
		tb.innerHTML = html;
	}
	$("mb-cgo").onclick = calc; ["mb-ca", "mb-cb", "mb-cm"].forEach(function (id) { $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") calc(); }); });
	$("mb-cex").onclick = function () {
		var a = parseNum($("mb-ca").value), b = parseNum($("mb-cb").value); if (!isFinite(a) || !isFinite(b)) return;
		S.julia = false; S.cx = a; S.cy = b; S.span = Math.min(TYPES[S.type].home.span, 0.05); picked = [a, b]; nxt = null; cur = null; syncMode(); setTab("explore"); info(); updatePicked(); scheduleRender(0);
	};

	/* ---------- go ---------- */
	$("mb-type").value = S.type; $("mb-pal").value = S.pal; $("mb-sp-in").value = S.speed; $("mb-sp-v").textContent = S.speed.toFixed(2); $("mb-of-in").value = S.off; $("mb-of-v").textContent = S.off.toFixed(2);
	$("mb-auto").checked = S.auto; $("mb-it-in").value = S.iter; $("mb-it-in").disabled = S.auto; $("mb-q").value = String(S.quality); $("mb-jprev").checked = S.jprev; $("mb-orbit").checked = S.orbit;
	var ca = q.get("a"), cb = q.get("b"); if (ca != null) $("mb-ca").value = ca; if (cb != null) $("mb-cb").value = cb;
	fillPlaces(); syncMode(); sizeCanvas(); info(); setTab(tab); if (tab === "explore") scheduleRender(0);
})();
