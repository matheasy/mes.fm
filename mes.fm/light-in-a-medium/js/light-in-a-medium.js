/* MES Light in a Medium -- pure maths (browser + node: require('./lib.js')).
 * Light in a medium of refractive index n moves at c/n. Two views of the same medium:
 *   Wave: finite-difference solution of u_tt = (1/n^2) * lap(u) on a grid (units: cells and steps, vacuum speed c = COURANT cells per step).
 *   Rays: the eikonal equation d/ds (n dr/ds) = grad n, integrated with a midpoint step.
 * The medium is a Float32Array n (>= 1) plus a Uint8Array mask (1 = perfect mirror wall).
 */
(function (root) {
	"use strict";
	var L = {};
	var COURANT = 0.6; /* cells per step in vacuum; the 2D stability limit is 1/sqrt(2) = 0.707 and n >= 1 only slows light */
	L.COURANT = COURANT; L.NMAX = 4; L.SPONGE = 18;

	/* ---------- medium helpers ---------- */
	function Medium(w, h) { this.w = w; this.h = h; this.n = new Float32Array(w * h).fill(1); this.m = new Uint8Array(w * h); }
	L.Medium = Medium;
	Medium.prototype.fill = function (fn) { /* fn(x, y) -> n or 0 (leave) */
		for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) { var v = fn(x, y); if (v > 0) this.n[y * this.w + x] = v; }
	};
	Medium.prototype.wall = function (fn) { for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) if (fn(x, y)) { this.m[y * this.w + x] = 1; this.n[y * this.w + x] = 1; } };
	Medium.prototype.disc = function (cx, cy, r, val, edge) { /* soft-edged brush; val = n, or 0 = erase to vacuum, or -1 = wall, -2 = erase wall */
		var r2 = (r + 1) * (r + 1), x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(this.w - 1, Math.ceil(cx + r + 1)), y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
		for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
			var d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (d2 > r2) continue;
			var i = y * this.w + x;
			if (val === -1) { this.m[i] = 1; this.n[i] = 1; }
			else if (val === -2) { this.m[i] = 0; }
			else if (!this.m[i]) {
				var t = edge ? Math.max(0, Math.min(1, (r + 0.5 - Math.sqrt(d2)) / Math.max(1, r * 0.35))) : 1;
				var target = val === 0 ? 1 : val;
				this.n[i] = val === 0 ? 1 : this.n[i] + (target - this.n[i]) * t;
			}
		}
	};
	Medium.prototype.nAt = function (x, y) { /* bilinear */
		var w = this.w, h = this.h; x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y));
		var i = x | 0, j = y | 0, fx = x - i, fy = y - j, n = this.n, k = j * w + i;
		return (n[k] * (1 - fx) + n[k + 1] * fx) * (1 - fy) + (n[k + w] * (1 - fx) + n[k + w + 1] * fx) * fy;
	};
	Medium.prototype.copy = function () { var c = new Medium(this.w, this.h); c.n.set(this.n); c.m.set(this.m); return c; };

	/* ---------- wave solver ---------- */
	function Wave(med) {
		this.med = med; var N = med.w * med.h;
		this.u = new Float32Array(N); this.p = new Float32Array(N); this.I = new Float32Array(N);
		this.g = new Float32Array(N); this.c2 = new Float32Array(N); this.t = 0; this.sources = []; this.wl = 14; this.mode = "cw"; this.pulseAt = -1; this.amp = 1;
		this.refresh();
	}
	L.Wave = Wave;
	Wave.prototype.refresh = function () { /* after the medium changed */
		var m = this.med, w = m.w, h = m.h, S = L.SPONGE;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var i = y * w + x, nn = m.n[i], c = COURANT / nn; this.c2[i] = c * c;
			var d = Math.min(x, y, w - 1 - x, h - 1 - y), g = 0; if (d < S) { var s = (S - d) / S; g = 0.2 * s * s; }
			this.g[i] = g;
		}
	};
	Wave.prototype.reset = function () { this.u.fill(0); this.p.fill(0); this.I.fill(0); this.t = 0; this.pulseAt = this.mode === "pulse" ? 0 : -1; };
	Wave.prototype.omega = function () { return 2 * Math.PI * COURANT / this.wl; };
	Wave.prototype.drive = function () { /* source time function at the current step */
		var om = this.omega(), T = 2 * Math.PI / om;
		if (this.mode === "cw") { var ramp = Math.min(1, this.t / (2.5 * T)); return Math.sin(om * this.t) * ramp; }
		if (this.pulseAt < 0) return 0;
		var t = this.t - this.pulseAt, c = 2.2 * T, s = 0.75 * T; if (t > 2 * c) { return 0; }
		return Math.sin(om * (t - c)) * Math.exp(-((t - c) * (t - c)) / (2 * s * s));
	};
	Wave.prototype.pulse = function () { this.mode = "pulse"; this.pulseAt = this.t; };
	Wave.prototype.step = function () {
		var m = this.med, w = m.w, h = m.h, u = this.u, p = this.p, c2 = this.c2, g = this.g, mask = m.m, I = this.I, x, y, i, lap, nx;
		for (y = 1; y < h - 1; y++) for (x = 1, i = y * w + 1; x < w - 1; x++, i++) {
			if (mask[i]) { p[i] = 0; continue; }
			lap = u[i - 1] + u[i + 1] + u[i - w] + u[i + w] - 4 * u[i];
			nx = (2 * u[i] - (1 - g[i]) * p[i] + c2[i] * lap) / (1 + g[i]);
			p[i] = nx;
		}
		var tmp = this.u; this.u = this.p; this.p = tmp; u = this.u;
		var s = this.drive(), srcs = this.sources;
		if (s !== 0) for (var k = 0; k < srcs.length; k++) { var q = srcs[k]; var j = (q.y | 0) * w + (q.x | 0); if (!mask[j]) u[j] += this.amp * q.a * s; }
		for (i = 0; i < u.length; i++) I[i] = I[i] * 0.985 + u[i] * u[i] * 0.015;
		this.t++;
	};
	/* a source list: a point, or a tilted line of emitters (plane-wave beam with a soft Gaussian edge) */
	L.pointSource = function (x, y) { return [{ x: x, y: y, a: 0.5 }]; };
	L.beamSource = function (x, y, angle, width) { /* beam travels along `angle` (radians, 0 = +x, y down); emitters lie across it */
		var out = [], px = -Math.sin(angle), py = Math.cos(angle), n = Math.max(3, Math.round(width));
		for (var k = 0; k < n; k++) { var s = (k - (n - 1) / 2), e = Math.exp(-Math.pow(s / (width * 0.42), 4)); out.push({ x: x + px * s, y: y + py * s, a: 0.12 * e }); }
		return out;
	};

	/* ---------- ray tracer ---------- */
	L.trace = function (med, x, y, ang, maxSteps, ds) {
		ds = ds || 0.5; maxSteps = maxSteps || 3000;
		var n = med.nAt(x, y), px = Math.cos(ang) * n, py = Math.sin(ang) * n, pts = [x, y], w = med.w, h = med.h, e = 0.5;
		function grad(x, y) { return [(med.nAt(x + e, y) - med.nAt(x - e, y)) / (2 * e), (med.nAt(x, y + e) - med.nAt(x, y - e)) / (2 * e)]; }
		for (var s = 0; s < maxSteps; s++) {
			var nn = med.nAt(x, y), g = grad(x, y);
			var mx = x + px / nn * ds / 2, my = y + py / nn * ds / 2, mp = px + g[0] * ds / 2, mq = py + g[1] * ds / 2, mn = med.nAt(mx, my), g2 = grad(mx, my);
			var nxp = x + mp / mn * ds, nyp = y + mq / mn * ds;
			if (nxp < 0 || nyp < 0 || nxp > w - 1 || nyp > h - 1) { pts.push(Math.max(0, Math.min(w - 1, nxp)), Math.max(0, Math.min(h - 1, nyp))); break; }
			var mi = (Math.round(nyp)) * w + Math.round(nxp);
			if (med.m[mi]) { pts.push(nxp, nyp); break; }
			px += g2[0] * ds; py += g2[1] * ds; x = nxp; y = nyp;
			if (s % 2 === 1) pts.push(x, y);
		}
		return pts;
	};
	L.rayFan = function (med, src, count, spread, ang0) { /* rays from a point or along a beam */
		var out = [], i;
		if (src.type === "point") for (i = 0; i < count; i++) { var a = (i / count) * Math.PI * 2; out.push(L.trace(med, src.x, src.y, a)); }
		else { var h = src.width, px = -Math.sin(src.angle), py = Math.cos(src.angle); for (i = 0; i < count; i++) { var s = (i / (count - 1) - 0.5) * h * 0.8; out.push(L.trace(med, src.x + px * s, src.y + py * s, src.angle)); } }
		return out;
	};

	/* ---------- scenarios ---------- */
	function slab(m, x0, x1, n) { m.fill(function (x) { return x >= x0 && x <= x1 ? n : 0; }); }
	L.PRESETS = [
		{ id: "empty", name: "Empty space (draw your own)", note: "Plain vacuum. Pick the Glass brush and paint a medium, then watch the wavefronts bend and slow down inside it.",
			build: function (m, w, h) { return { type: "point", x: w * 0.3, y: h * 0.5 }; } },
		{ id: "slab", name: "Glass slab: Snell's law", note: "A beam hits a block of glass (n = 1.5) at an angle. Inside, light travels at 2/3 of c, the wavelength shrinks and the beam bends towards the normal: sin θ₁ = n sin θ₂.",
			build: function (m, w, h) { m.fill(function (x, y) { return x > w * 0.5 && x < w * 0.78 ? 1.5 : 0; }); return { type: "beam", x: w * 0.12, y: h * 0.28, angle: 0.62, width: 70 }; } },
		{ id: "lens", name: "Convex lens", note: "A glass lens (n = 1.5) is thicker in the middle, so the centre of each wavefront is delayed more than its edges. The flat wave curls into a converging one and comes to a focus.",
			build: function (m, w, h) { var R = h * 1.0, cx1 = w * 0.42 + R - h * 0.09, cx2 = w * 0.42 - R + h * 0.09, cy = h / 2; m.fill(function (x, y) { return (x - cx1) * (x - cx1) + (y - cy) * (y - cy) < R * R && (x - cx2) * (x - cx2) + (y - cy) * (y - cy) < R * R ? 1.5 : 0; }); return { type: "beam", x: w * 0.1, y: h * 0.5, angle: 0, width: h * 0.4 }; } },
		{ id: "prism", name: "Prism", note: "Light slows down in the glass and the beam turns towards the thick end. (Real glass slows blue light more than red, which is why a prism makes a rainbow; this simulator uses one colour.)",
			build: function (m, w, h) { var cx = w * 0.5, cy = h * 0.55, s = h * 0.42; m.fill(function (x, y) { var dy = y - (cy - s * 0.8); if (dy < 0) return 0; var half = dy * 0.58; return Math.abs(x - cx) < half && dy < s * 1.6 ? 1.6 : 0; }); return { type: "beam", x: w * 0.12, y: h * 0.62, angle: -0.12, width: 56 }; } },
		{ id: "tir", name: "Total internal reflection", note: "Light inside glass hitting the surface at a shallow angle cannot get out: above the critical angle (about 42° for n = 1.5) there is no refracted wave and everything reflects. This is how optical fibre works.",
			build: function (m, w, h) { m.fill(function (x, y) { return y > h * 0.5 ? 1.5 : 0; }); return { type: "beam", x: w * 0.22, y: h * 0.78, angle: -0.95, width: 56 }; } },
		{ id: "fibre", name: "Optical fibre", note: "A core of n = 1.5 inside a cladding of n = 1.3. Light that enters at a shallow angle keeps bouncing off the core wall (total internal reflection) and follows the bend-free strip.",
			build: function (m, w, h) { m.fill(function (x, y) { var d = Math.abs(y - h * 0.5); return d < h * 0.1 ? 1.5 : (d < h * 0.2 ? 1.3 : 0); }); return { type: "point", x: w * 0.12, y: h * 0.5 }; } },
		{ id: "mirage", name: "Mirage: a gradient of speed", note: "Hot air near the ground is thinner, so light is faster there (lower n). A wave front tilts towards the slower side, so a beam sent slightly downwards curves back up. Nothing here has an edge, only a smooth slope of n.",
			build: function (m, w, h) { m.fill(function (x, y) { return 1 + 0.9 * (1 - y / h) * (1 - y / h) ; }); return { type: "beam", x: w * 0.1, y: h * 0.62, angle: 0.18, width: 56 }; } },
		{ id: "gravity", name: "Gravity-lens analogue", note: "A heavy mass slows light nearby, as seen from far away. Here n = 1 + k/r around a mass, so passing waves bend towards it and cross behind it. A real lens in space bends light twice as much because space itself is curved; this shows only the 'slow light' half.",
			build: function (m, w, h) { var cx = w * 0.55, cy = h * 0.5; m.fill(function (x, y) { var r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)); return Math.min(3.2, 1 + 14 / (r + 5)); }); return { type: "beam", x: w * 0.1, y: h * 0.5, angle: 0, width: h * 0.55 }; } },
		{ id: "slits", name: "Double slit (a wall)", note: "A mirror wall with two gaps. Each gap sends out its own circular wave and the two overlap, giving bright and dark fans: interference. Draw the Wall brush to add your own barriers.",
			build: function (m, w, h) { var gap = h * 0.07, sep = h * 0.16, wx = w * 0.38; m.wall(function (x, y) { return Math.abs(x - wx) < 2 && Math.abs(Math.abs(y - h / 2) - sep) > gap; }); return { type: "beam", x: w * 0.12, y: h * 0.5, angle: 0, width: h * 0.55 }; } },
		{ id: "cloud", name: "Slow-light cloud", note: "A dense blob where light crawls at one third of c (n = 3). Waves entering it pile up, shorten and ring inside; some leak out. This is how 'slow light' experiments in cold atom clouds work.",
			build: function (m, w, h) { var cx = w * 0.55, cy = h * 0.5, R = h * 0.2; m.fill(function (x, y) { var r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)); return r < R ? 3 : (r < R + 3 ? 1 + 2 * (R + 3 - r) / 3 : 0); }); return { type: "point", x: w * 0.2, y: h * 0.5 }; } }
	];
	L.BYID = {}; L.PRESETS.forEach(function (p) { L.BYID[p.id] = p; });
	L.sourceList = function (s) { return s.type === "point" ? L.pointSource(s.x, s.y) : L.beamSource(s.x, s.y, s.angle, s.width); };

	/* ---------- formatting ---------- */
	L.speedOf = function (n) { return 1 / n; };
	L.critical = function (n1, n2) { return n1 > n2 ? Math.asin(n2 / n1) * 180 / Math.PI : null; };
	if (typeof module !== "undefined" && module.exports) module.exports = L; else root.MESLight = L;
})(typeof window !== "undefined" ? window : this);

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
