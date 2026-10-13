/* MES Buddhabrot Explorer -- pure maths (browser + node: require('./lib.js')).
 * The Buddhabrot is not a picture of the Mandelbrot set itself but a density plot of the ORBITS of the points that are not in it: pick a random c, iterate z -> z^p + c from z = 0,
 * and if the orbit escapes (|z| > 2) add one to every pixel the orbit visited. accumulate() does that for a batch of random points into Uint32 count buffers (one per channel).
 * It has no outside references, so it is also sent to Web Workers as source text (MESBuddha.WORKER_SRC). A "channel" is one iteration limit: an orbit that escapes in n steps is
 * counted in every channel whose limit is >= n, so a three-channel Nebulabrot costs no more iterating than its largest limit. The picture is symmetric about the real axis, so every
 * orbit is plotted twice (z and its conjugate) and only the upper half of the c-plane is sampled.
 * Credits: the technique was found by Melinda Green (1993); Lori Gardi coined the name "Buddhabrot".
 */
(function (root) {
	"use strict";
	var B = {};

	/* c-plane box that is sampled (upper half only; the lower half is the mirror image) */
	B.box = function (pw) { return pw === 2 ? { x0: -2.4, x1: 1.4, y0: 0, y1: 1.7 } : { x0: -1.9, x1: 1.9, y0: 0, y1: 1.9 }; };

	/* Pure function, no outside references (it is stringified for the workers).
	 * p: { n samples, W, H, ps (complex units per pixel along the real axis), cr, ci (centre of the view), rot (real axis vertical, negative end up = the seated Buddha is upright), pw (2..4),
	 *      lims: [iteration limits, one per channel], min (shortest escape time that is plotted), anti (plot the orbits that do NOT escape), box: {x0,x1,y0,y1} optional }
	 * bufs: Uint32Array(W*H) per channel;  st: { s } generator state (xorshift32), updated.   Returns { tried, escaped, plotted } */
	function accumulate(p, bufs, st) {
		var W = p.W, H = p.H, inv = 1 / p.ps, cr = p.cr, ci = p.ci, rot = !!p.rot, pw = p.pw | 0, anti = !!p.anti, mn = p.min | 0, lims = p.lims, nc = lims.length, n = p.n | 0;
		var maxI = 0, k, i, j;
		for (k = 0; k < nc; k++) if (lims[k] > maxI) maxI = lims[k];
		var bx = p.box || (pw === 2 ? { x0: -2.4, x1: 1.4, y0: 0, y1: 1.7 } : { x0: -1.9, x1: 1.9, y0: 0, y1: 1.9 });
		var bw = bx.x1 - bx.x0, bh = bx.y1 - bx.y0, hx = W / 2, hy = H / 2;
		var orb = new Float64Array(2 * (maxI + 2));
		var s = (st.s >>> 0) || 2463534242, tried = 0, esc = 0, plotted = 0;
		for (i = 0; i < n; i++) {
			s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; var u1 = s / 4294967296;
			s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; var u2 = s / 4294967296;
			var cx = bx.x0 + bw * u1, cy = bx.y0 + bh * u2;
			tried++;
			if (pw === 2 && !anti) {   /* the main cardioid and the period-2 bulb never escape: skip them */
				var qx = cx - 0.25, q = qx * qx + cy * cy;
				if (q * (q + qx) < 0.25 * cy * cy || (cx + 1) * (cx + 1) + cy * cy < 0.0625) continue;
			}
			var zr = 0, zi = 0, en = 0, a, b;
			for (k = 1; k <= maxI; k++) {
				if (pw === 2) { a = zr * zr - zi * zi + cx; b = 2 * zr * zi + cy; }
				else if (pw === 3) { a = zr * zr * zr - 3 * zr * zi * zi + cx; b = 3 * zr * zr * zi - zi * zi * zi + cy; }
				else { var r2 = zr * zr, i2 = zi * zi; a = r2 * r2 - 6 * r2 * i2 + i2 * i2 + cx; b = 4 * zr * zi * (r2 - i2) + cy; }
				zr = a; zi = b;
				if (zr * zr + zi * zi > 4) { en = k; break; }
				orb[2 * (k - 1)] = zr; orb[2 * k - 1] = zi;
			}
			if (en) esc++;
			if (!anti && (!en || en < mn)) continue;
			for (k = 0; k < nc; k++) {
				var cnt;
				if (!anti) { if (en > lims[k]) continue; cnt = en - 1; }
				else { if (en && en <= lims[k]) continue; cnt = lims[k]; }
				var buf = bufs[k];
				for (j = 0; j < cnt; j++) {
					var rr = orb[2 * j], ii = orb[2 * j + 1], px, py, px2, py2;
					if (rot) { px = (ii - ci) * inv + hx; px2 = (-ii - ci) * inv + hx; py = py2 = hy + (rr - cr) * inv; }
					else { px = px2 = (rr - cr) * inv + hx; py = hy - (ii - ci) * inv; py2 = hy - (-ii - ci) * inv; }
					if (px >= 0 && px < W && py >= 0 && py < H) { buf[((py | 0) * W) + (px | 0)]++; plotted++; }
					if (px2 >= 0 && px2 < W && py2 >= 0 && py2 < H) { buf[((py2 | 0) * W) + (px2 | 0)]++; plotted++; }
				}
			}
		}
		st.s = s;
		return { tried: tried, escaped: esc, plotted: plotted };
	}
	B.accumulate = accumulate;

	/* Worker body: start {id, p, seed} -> runs slices of ~60 ms and posts cumulative copies of its buffers about twice a second. */
	function workerMain(acc) {
		var bufs = null, P = null, st = { s: 1 }, run = false, id = 0, tot = { tried: 0, escaped: 0, plotted: 0 }, last = 0, chunk = 300;
		function post() {
			var cp = bufs.map(function (b) { return b.slice(); });
			self.postMessage({ id: id, bufs: cp, tot: { tried: tot.tried, escaped: tot.escaped, plotted: tot.plotted } }, cp.map(function (b) { return b.buffer; }));
			last = Date.now();
		}
		function loop() {
			if (!run) return;
			var t0 = Date.now(); P.n = chunk;
			var r = acc(P, bufs, st); tot.tried += r.tried; tot.escaped += r.escaped; tot.plotted += r.plotted;
			var dt = Math.max(1, Date.now() - t0); chunk = Math.max(50, Math.min(200000, Math.round(chunk * 60 / dt)));
			if (Date.now() - last > 500) post();
			setTimeout(loop, 0);
		}
		self.onmessage = function (e) {
			var d = e.data;
			if (d.cmd === "start") {
				id = d.id; P = d.p; st = { s: d.seed >>> 0 || 1 }; tot = { tried: 0, escaped: 0, plotted: 0 }; chunk = 300;
				bufs = P.lims.map(function () { return new Uint32Array(P.W * P.H); });
				run = true; last = Date.now(); loop();
			} else if (d.cmd === "stop") { run = false; if (bufs) post(); }
			else if (d.cmd === "snap") { if (bufs) post(); }
			else if (d.cmd === "resume") { if (bufs && !run) { run = true; last = Date.now(); loop(); } }
		};
	}
	B.WORKER_SRC = "var acc=" + accumulate.toString() + ";(" + workerMain.toString() + ")(acc);";

	/* ---------- tone mapping ---------- */
	/* value at fraction f (0..1) of the non-zero counts, sampled with a stride so it stays cheap on big pictures */
	B.scaleOf = function (buf, f) {
		var n = buf.length, step = Math.max(1, Math.floor(n / 60000)), vals = [], i;
		for (i = 0; i < n; i += step) if (buf[i] > 0) vals.push(buf[i]);
		if (!vals.length) return 1;
		vals.sort(function (a, b) { return a - b; });
		return Math.max(1, vals[Math.min(vals.length - 1, Math.floor(vals.length * f))]);
	};
	/* per-channel background levels: the low-limit channels carry far more faint haze (fast escapers) relative to their bright parts, so each channel's level is the slider value
	 * scaled by that channel's own haze (25th percentile of its non-zero counts / its scale) relative to the first channel's */
	B.autoBlack = function (bufs, scales, black) {
		var hz = bufs.map(function (b, k) { return B.scaleOf(b, 0.25) / (scales[k] || 1); }), ref = hz[0] || 1e-9;
		return hz.map(function (h) { return Math.min(0.9, black * Math.sqrt(h / ref)); });
	};
	B.PALETTES = [
		{ id: "grey", name: "Grey (classic)", stops: [[0, 0, 0, 0], [1, 255, 255, 255]] },
		{ id: "gold", name: "Gold", stops: [[0, 0, 0, 0], [0.35, 90, 45, 10], [0.7, 232, 160, 40], [1, 255, 248, 215]] },
		{ id: "ice", name: "Ice", stops: [[0, 0, 0, 8], [0.4, 20, 70, 150], [0.75, 120, 200, 240], [1, 245, 252, 255]] },
		{ id: "fire", name: "Fire", stops: [[0, 0, 0, 0], [0.3, 130, 20, 10], [0.6, 240, 110, 20], [0.85, 255, 210, 90], [1, 255, 255, 235]] },
		{ id: "violet", name: "Violet", stops: [[0, 4, 0, 10], [0.4, 80, 30, 140], [0.75, 200, 110, 230], [1, 255, 240, 255]] }
	];
	B.lut = function (id) {
		var pal = B.PALETTES.filter(function (p) { return p.id === id; })[0] || B.PALETTES[0], out = new Uint32Array(256), i, j, st = pal.stops;
		for (i = 0; i < 256; i++) {
			var t = i / 255;
			for (j = 0; j < st.length - 2 && t > st[j + 1][0]; j++);
			var a = st[j], b = st[j + 1], u = (t - a[0]) / (b[0] - a[0] || 1); u = u < 0 ? 0 : u > 1 ? 1 : u;
			out[i] = (255 << 24) | (Math.round(a[3] + (b[3] - a[3]) * u) << 16) | (Math.round(a[2] + (b[2] - a[2]) * u) << 8) | Math.round(a[1] + (b[1] - a[1]) * u);
		}
		return out;
	};
	/* bufs: 1 buffer (palette) or 3 (R, G, B);  o: { lut, scales: [per channel], bright, gamma, black (0..0.95, or one per channel: level below which a pixel is black) };  out: Uint32Array(W*H) little-endian RGBA */
	B.shade = function (bufs, o, out) {
		var n = out.length, i, nb = bufs.length, g = 1 / (o.gamma || 1), br = o.bright || 1, sc = [], k, bks = [], iks = [];
		for (k = 0; k < nb; k++) { var bb0 = Array.isArray(o.black) ? o.black[k] : o.black; bb0 = Math.min(0.95, Math.max(0, bb0 || 0)); bks.push(bb0); iks.push(1 / (1 - bb0)); }
		var bk = bks[0], ik = iks[0];
		for (k = 0; k < nb; k++) sc.push(br / (o.scales[k] || 1));
		if (nb === 1) {
			var b0 = bufs[0], s0 = sc[0], lut = o.lut;
			for (i = 0; i < n; i++) { var v = (b0[i] * s0 - bk) * ik; out[i] = lut[v <= 0 ? 0 : v >= 1 ? 255 : (Math.pow(v, g) * 255) | 0]; }
		} else {
			var r = bufs[0], gg = bufs[1], bb = bufs[2];
			for (i = 0; i < n; i++) {
				var vr = (r[i] * sc[0] - bks[0]) * iks[0], vg = (gg[i] * sc[1] - bks[1]) * iks[1], vb = (bb[i] * sc[2] - bks[2]) * iks[2];
				vr = vr <= 0 ? 0 : vr >= 1 ? 255 : (Math.pow(vr, g) * 255) | 0; vg = vg <= 0 ? 0 : vg >= 1 ? 255 : (Math.pow(vg, g) * 255) | 0; vb = vb <= 0 ? 0 : vb >= 1 ? 255 : (Math.pow(vb, g) * 255) | 0;
				out[i] = (255 << 24) | (vb << 16) | (vg << 8) | vr;
			}
		}
	};

	/* ---------- presets and helpers ---------- */
	B.PRESETS = [
		{ id: "classic", name: "Buddhabrot (classic, grey)", mode: "single", lim: 500, min: 0, pw: 2, anti: false, pal: "grey", note: "One iteration limit. Orbits that take many steps to escape draw the faint detail." },
		{ id: "nebula", name: "Nebulabrot (red, green, blue)", mode: "rgb", lims: [1000, 100, 10], min: 0, pw: 2, anti: false, note: "Three limits mapped to red, green and blue: Melinda Green's false-colour version." },
		{ id: "deep", name: "Deep orbits only", mode: "single", lim: 2000, min: 100, pw: 2, anti: false, pal: "gold", note: "Only points that survive 100+ steps are plotted: the haze goes, the structure stays. Needs patience." },
		{ id: "anti", name: "Anti-Buddhabrot", mode: "single", lim: 200, min: 0, pw: 2, anti: true, pal: "ice", note: "The orbits that do NOT escape. The cardioid and bulbs are traced by their own settling orbits." },
		{ id: "cubic", name: "Cubic Buddhabrot (z³ + c)", mode: "single", lim: 300, min: 0, pw: 3, anti: false, pal: "violet", note: "The same idea with z³ + c." },
		{ id: "quartic", name: "Quartic Buddhabrot (z⁴ + c)", mode: "single", lim: 300, min: 0, pw: 4, anti: false, pal: "fire", note: "The same idea with z⁴ + c." },
		{ id: "sparse", name: "Sparse detail (high limit)", mode: "single", lim: 5000, min: 0, pw: 2, anti: false, pal: "grey", note: "A high limit gives a sparser, more detailed picture, but it takes far longer to fill in." }
	];
	B.home = function (pw, rot) { return { cr: pw === 2 ? -0.5 : 0, ci: 0, span: 3.2 }; };
	/* the iteration itself, for the orbit lab: returns { n (escape step or 0), pts: [[re, im], ...] } */
	B.orbit = function (cx, cy, pw, maxI) {
		var zr = 0, zi = 0, pts = [[0, 0]], k, a, b;
		for (k = 1; k <= maxI; k++) {
			if (pw === 2) { a = zr * zr - zi * zi + cx; b = 2 * zr * zi + cy; }
			else if (pw === 3) { a = zr * zr * zr - 3 * zr * zi * zi + cx; b = 3 * zr * zr * zi - zi * zi * zi + cy; }
			else { var r2 = zr * zr, i2 = zi * zi; a = r2 * r2 - 6 * r2 * i2 + i2 * i2 + cx; b = 4 * zr * zi * (r2 - i2) + cy; }
			zr = a; zi = b; pts.push([zr, zi]);
			if (zr * zr + zi * zi > 4) return { n: k, pts: pts };
		}
		return { n: 0, pts: pts };
	};
	B.fmt = function (x) { var a = Math.abs(x); if (a >= 1e9) return (x / 1e9).toFixed(2) + " billion"; if (a >= 1e6) return (x / 1e6).toFixed(2) + " million"; if (a >= 1e4) return Math.round(x / 1e3) + " thousand"; return String(Math.round(x)); };

	if (typeof module !== "undefined" && module.exports) module.exports = B; else root.MESBuddha = B;
})(typeof window !== "undefined" ? window : this);

/* MES Buddhabrot Explorer -- mes.fm/buddhabrot
 * UI around MESBuddha (lib.js). A pool of Web Workers throws random points at z -> z^p + c and keeps cumulative Uint32 count buffers; the page adds the workers' latest snapshots and
 * tone-maps them (palette, brightness, contrast curve, background level change instantly: nothing is recomputed). Drag / scroll move the window and restart the count.
 * The orbit lab picks one c on a small Mandelbrot silhouette and shows its orbit (also over the main picture).
 * State: localStorage mes-buddhabrot:v1 (display + size). The URL is never rewritten; "Copy link" builds ?p=&m=&l=&n=&w=&a=&r=&pal=&bt=&gm=&bk=&sz=&x=&y=&s=.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bb");
	if (!root) return;
	var B = window.MESBuddha, KEY = "mes-buddhabrot:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function toast(msg) { var t = document.createElement("div"); t.textContent = msg; t.style.cssText = "position:fixed;left:50%;bottom:1.2em;transform:translateX(-50%);background:#222;color:#fff;padding:0.5em 1em;border-radius:0.5em;z-index:99999;font-size:0.9em"; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200); }
	var q = new URLSearchParams(location.search), saved = sget(), coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;

	/* ---------- state ---------- */
	var S = { mode: "single", lim: 500, lims: [1000, 100, 10], min: 0, pw: 2, anti: false, rot: true, cr: NaN, ci: 0, span: NaN,
		pal: "grey", bright: 1, gamma: 1.5, black: 0.35, size: coarse ? 500 : 800, show: true, pre: "classic" };
	function applyPreset(p) {
		S.mode = p.mode; if (p.lim) S.lim = p.lim; if (p.lims) S.lims = p.lims.slice(); S.min = p.min || 0; S.pw = p.pw; S.anti = !!p.anti; if (p.pal) S.pal = p.pal; S.pre = p.id;
		var h = B.home(S.pw, S.rot); S.cr = h.cr; S.ci = h.ci; S.span = h.span;
	}
	var P0 = B.PRESETS.filter(function (p) { return p.id === q.get("p"); })[0] || B.PRESETS.filter(function (p) { return p.id === saved.pre; })[0] || B.PRESETS[0];
	applyPreset(P0);
	S.pal = B.PALETTES.some(function (p) { return p.id === (saved.pal || "x"); }) && !q.get("p") ? saved.pal : S.pal;
	S.bright = num(saved.bright, 0.3, 4, S.bright); S.gamma = num(saved.gamma, 0.6, 3, S.gamma); S.black = num(saved.black, 0, 0.8, S.black); S.show = saved.show !== false;
	S.size = [500, 800, 1200].indexOf(+saved.size) >= 0 ? +saved.size : S.size; S.rot = saved.rot !== false;
	/* link overrides */
	if (q.get("m") === "rgb" || q.get("m") === "single") S.mode = q.get("m");
	if (q.get("l")) { var ls = q.get("l").split(",").map(Number).filter(function (v) { return isFinite(v) && v >= 5 && v <= 20000; }); if (ls.length === 1) S.lim = ls[0]; if (ls.length === 3) S.lims = ls; }
	S.min = num(q.get("n"), 0, 20000, S.min) | 0; if (q.get("w")) S.pw = [2, 3, 4].indexOf(+q.get("w")) >= 0 ? +q.get("w") : S.pw; if (q.get("a")) S.anti = q.get("a") === "1"; if (q.get("r")) S.rot = q.get("r") !== "0";
	if (q.get("pal") && B.PALETTES.some(function (p) { return p.id === q.get("pal"); })) S.pal = q.get("pal");
	S.bright = num(q.get("bt"), 0.3, 4, S.bright); S.gamma = num(q.get("gm"), 0.6, 3, S.gamma); S.black = num(q.get("bk"), 0, 0.8, S.black); if ([500, 800, 1200].indexOf(+q.get("sz")) >= 0) S.size = +q.get("sz");
	var hh = B.home(S.pw, S.rot); if (!isFinite(S.cr)) { S.cr = hh.cr; S.span = hh.span; }
	S.cr = num(q.get("x"), -10, 10, S.cr); S.ci = num(q.get("y"), -10, 10, S.ci); S.span = num(q.get("s"), 0.005, 12, S.span);

	var canvas = $("bb-canvas"), ctx = canvas.getContext("2d"), over = $("bb-over"), octx = over.getContext("2d"), stage = $("bb-stage"), badge = $("bb-badge");
	var W = 0, H = 0, ps = 1, lut = B.lut(S.pal), img = null, out32 = null;
	var pool = [], wurl = null, runId = 0, snaps = [], running = true, workerOk = true, t0 = 0, lastTried = 0, lastT = 0, rate = 0, picked = null, comb = null, scales = null, totals = { tried: 0, escaped: 0, plotted: 0 };

	/* ---------- layout ---------- */
	function dims() { var L = S.size; return S.rot ? { w: Math.round(L * 0.8), h: L } : { w: L, h: Math.round(L * 0.8) }; }
	function sizeStage() {
		var wrap = stage.parentNode, avail = wrap.clientWidth || 600, asp = W / H || 0.8, maxH = Math.max(320, window.innerHeight * 0.85), w = Math.min(avail, maxH * asp);
		if (document.fullscreenElement === wrap) { w = Math.min(avail, (window.innerHeight - 90) * asp); }
		stage.style.width = Math.round(w) + "px"; stage.style.height = Math.round(w / asp) + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1), ow = Math.round(w * dpr), oh = Math.round(w / asp * dpr);
		if (over.width !== ow || over.height !== oh) { over.width = ow; over.height = oh; }
		drawOverlay();
	}
	function useCanvas() { var d = dims(); W = d.w; H = d.h; canvas.width = W; canvas.height = H; img = ctx.createImageData(W, H); out32 = new Uint32Array(img.data.buffer); ps = S.span / (S.rot ? H : W); }

	/* ---------- workers ---------- */
	function lims() { return S.mode === "rgb" ? S.lims.slice() : [S.lim]; }
	function killPool() { pool.forEach(function (w) { try { w.terminate(); } catch (e) {} }); pool = []; }
	function params() { return { n: 1000, W: W, H: H, ps: ps, cr: S.cr, ci: S.ci, rot: S.rot, pw: S.pw, lims: lims(), min: Math.min(S.min, Math.max.apply(null, lims())), anti: S.anti }; }
	function start() {
		runId++; killPool(); useCanvas(); sizeStage();
		snaps = []; comb = null; scales = null; totals = { tried: 0, escaped: 0, plotted: 0 }; lastTried = 0; rate = 0; t0 = Date.now(); lastT = t0; running = true; $("bb-go").textContent = "Pause";
		ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, W, H);
		var n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); if (S.size === 1200) n = Math.min(n, 3);
		if (workerOk) {
			try {
				if (!wurl) wurl = URL.createObjectURL(new Blob([B.WORKER_SRC], { type: "application/javascript" }));
				for (var i = 0; i < n; i++) {
					var w = new Worker(wurl); w.idx = i; w.onmessage = onSnap; w.onerror = function () { workerOk = false; killPool(); start(); };
					w.postMessage({ cmd: "start", id: runId, seed: (Date.now() ^ (i + 1) * 2654435761) >>> 0, p: params() }); pool.push(w);
				}
			} catch (e) { workerOk = false; pool = []; }
		}
		if (!workerOk) mainLoop(runId);
		status();
	}
	var mainBufs = null, mainSt = null;
	function mainLoop(id) {   /* fallback when workers are unavailable: one thread, 40 ms slices */
		if (id !== runId) return;
		if (!mainBufs) { mainBufs = lims().map(function () { return new Uint32Array(W * H); }); mainSt = { s: (Date.now() >>> 0) || 1 }; }
		if (running) { var p = params(); p.n = 20000; var r = B.accumulate(p, mainBufs, mainSt); totals.tried += r.tried; totals.escaped += r.escaped; totals.plotted += r.plotted; snaps = [{ bufs: mainBufs, tot: totals }]; schedulePaint(); }
		setTimeout(function () { mainLoop(id); }, 30);
	}
	function onSnap(e) {
		var m = e.data; if (m.id !== runId) return;
		snaps[e.target.idx] = m; schedulePaint();
	}
	var paintT = 0;
	function schedulePaint() { if (paintT) return; paintT = setTimeout(function () { paintT = 0; combine(); paint(true); status(); }, 120); }
	function combine() {
		var live = snaps.filter(Boolean); if (!live.length) return;
		var nc = live[0].bufs.length, k, i, j;
		if (!comb || comb.length !== nc || comb[0].length !== W * H) comb = live[0].bufs.map(function () { return new Uint32Array(W * H); });
		totals = { tried: 0, escaped: 0, plotted: 0 };
		for (k = 0; k < nc; k++) { var c = comb[k]; c.set(live[0].bufs[k]); for (j = 1; j < live.length; j++) { var b = live[j].bufs[k]; for (i = 0; i < c.length; i++) c[i] += b[i]; } }
		live.forEach(function (s) { totals.tried += s.tot.tried; totals.escaped += s.tot.escaped; totals.plotted += s.tot.plotted; });
		scales = comb.map(function (b) { return B.scaleOf(b, S.mode === "rgb" ? 0.999 : 0.999); });
		var now = Date.now(); if (now - lastT > 900) { rate = (totals.tried - lastTried) / ((now - lastT) / 1000); lastTried = totals.tried; lastT = now; }
	}
	function paint(fresh) {
		if (!comb || !scales) return;
		B.shade(comb, { lut: lut, scales: scales, bright: S.bright, gamma: S.gamma, black: comb.length === 3 ? B.autoBlack(comb, scales, S.black) : S.black }, out32);
		ctx.putImageData(img, 0, 0);
	}
	function status() {
		$("bb-r-t").textContent = B.fmt(totals.tried); $("bb-r-s").textContent = rate > 0 && running ? "about " + B.fmt(rate) + " a second" : (running ? "starting…" : "paused");
		$("bb-r-e").textContent = totals.tried ? (S.anti ? 100 - 100 * totals.escaped / Math.max(1, totals.tried) : 100 * totals.escaped / Math.max(1, totals.tried)).toFixed(1) + "%" : "–";
		$("bb-r-p").textContent = S.anti ? "of the random points stay bounded (drawn)" : "of the random points escape (drawn); the rest are inside";
		$("bb-r-d").textContent = B.fmt(totals.plotted); var sec = Math.max(1, (Date.now() - t0) / 1000);
		$("bb-r-a").textContent = "after " + (sec < 90 ? Math.round(sec) + " s" : Math.round(sec / 60) + " min") + (workerOk ? " on " + pool.length + " thread" + (pool.length === 1 ? "" : "s") : " (one thread)");
		var bits = [B.PRESETS.filter(function (p) { return p.id === S.pre; })[0]]; var zoomed = S.span < hh.span * 0.7;
		badge.textContent = zoomed ? "Zoomed: " + (hh.span / S.span).toFixed(1) + "×. Zoomed views fill in slowly." : "";
	}

	/* ---------- controls ---------- */
	var preSel = $("bb-pre"), palSel = $("bb-pal");
	B.PRESETS.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.name; preSel.appendChild(o); });
	B.PALETTES.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.name; palSel.appendChild(o); });
	function show(id, v, d) { var e = $(id); if (e) e.textContent = v; }
	function writeControls() {
		preSel.value = S.pre; $("bb-mode").value = S.mode; $("bb-lim").value = S.lim; $("bb-lr").value = S.lims[0]; $("bb-lg").value = S.lims[1]; $("bb-lb").value = S.lims[2];
		$("bb-min").value = S.min; $("bb-pw").value = S.pw; $("bb-anti").value = S.anti ? "1" : "0"; $("bb-rot").value = S.rot ? "1" : "0"; $("bb-sz").value = S.size; palSel.value = S.pal;
		$("bb-br").value = S.bright; $("bb-gm").value = S.gamma; $("bb-bk").value = S.black; $("bb-show").checked = S.show; showDisplay();
		root.querySelector(".bb-lim1").hidden = S.mode === "rgb"; root.querySelector(".bb-lim3").hidden = S.mode !== "rgb";
		palSel.disabled = S.mode === "rgb"; palSel.title = S.mode === "rgb" ? "The three-limit picture uses red, green and blue" : "";
	}
	function showDisplay() { show("bb-br-v", (+S.bright).toFixed(2)); show("bb-gm-v", (+S.gamma).toFixed(2)); show("bb-bk-v", Math.round(S.black * 100) + "%"); }
	function readStructural() {
		S.mode = $("bb-mode").value; S.lim = num($("bb-lim").value, 5, 20000, S.lim) | 0; S.lims = [num($("bb-lr").value, 5, 20000, S.lims[0]) | 0, num($("bb-lg").value, 5, 20000, S.lims[1]) | 0, num($("bb-lb").value, 5, 20000, S.lims[2]) | 0];
		S.min = num($("bb-min").value, 0, 20000, 0) | 0; S.pw = +$("bb-pw").value; S.anti = $("bb-anti").value === "1"; S.rot = $("bb-rot").value === "1"; S.size = +$("bb-sz").value;
		var h = B.home(S.pw, S.rot); if (S.pw !== hh.pw) { S.cr = h.cr; S.ci = h.ci; S.span = h.span; } hh = { cr: h.cr, span: h.span, pw: S.pw };
		sset({ size: S.size, rot: S.rot }); S.pre = "custom"; writeControls(); mainBufs = null; start();
	}
	hh.pw = S.pw;
	["bb-mode", "bb-lim", "bb-lr", "bb-lg", "bb-lb", "bb-min", "bb-pw", "bb-anti", "bb-rot", "bb-sz"].forEach(function (id) { $(id).addEventListener("change", readStructural); });
	preSel.onchange = function () { var p = B.PRESETS.filter(function (x) { return x.id === preSel.value; })[0]; if (!p) return; applyPreset(p); hh = { cr: S.cr, span: S.span, pw: S.pw }; sset({ pre: p.id, pal: S.pal }); writeControls(); mainBufs = null; start(); toast(p.note); };
	palSel.onchange = function () { S.pal = palSel.value; lut = B.lut(S.pal); sset({ pal: S.pal }); paint(); };
	function slider(id, key) { $(id).addEventListener("input", function () { S[key] = +this.value; showDisplay(); sset({ bright: S.bright, gamma: S.gamma, black: S.black }); paint(); }); }
	slider("bb-br", "bright"); slider("bb-gm", "gamma"); slider("bb-bk", "black");
	$("bb-show").onchange = function () { S.show = this.checked; sset({ show: S.show }); drawOverlay(); };
	$("bb-go").onclick = function () {
		running = !running; this.textContent = running ? "Pause" : "Resume";
		pool.forEach(function (w) { w.postMessage({ cmd: running ? "resume" : "stop" }); }); status();
	};
	$("bb-reset").onclick = function () { mainBufs = null; start(); };
	$("bb-home").onclick = function () { var h = B.home(S.pw, S.rot); S.cr = h.cr; S.ci = h.ci; S.span = h.span; mainBufs = null; start(); };
	$("bb-png").onclick = function () {
		combine(); paint(); canvas.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "buddhabrot-" + (S.mode === "rgb" ? "nebulabrot-" : "") + W + "x" + H + ".png"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }, "image/png");
	};
	$("bb-full").onclick = function () { var w = stage.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	document.addEventListener("fullscreenchange", function () { setTimeout(sizeStage, 50); });
	window.addEventListener("resize", function () { sizeStage(); });
	$("bb-link").onclick = function () {
		var p = new URLSearchParams(); if (S.pre !== "custom") p.set("p", S.pre); p.set("m", S.mode); p.set("l", S.mode === "rgb" ? S.lims.join(",") : String(S.lim)); if (S.min) p.set("n", S.min); p.set("w", S.pw); if (S.anti) p.set("a", "1"); if (!S.rot) p.set("r", "0");
		p.set("pal", S.pal); p.set("bt", S.bright); p.set("gm", S.gamma); p.set("bk", S.black); p.set("sz", S.size); if (S.span < hh.span * 0.99) { p.set("x", +S.cr.toPrecision(8)); p.set("y", +S.ci.toPrecision(8)); p.set("s", +S.span.toPrecision(6)); }
		var url = location.origin + location.pathname + "?" + p.toString(), done = function () { toast("Link copied"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};

	/* ---------- pan and zoom (CSS preview, then restart) ---------- */
	var drag = null, tx = 0, ty = 0, sc = 1, ox = 0, oy = 0, commitT = 0;
	function cssT() { canvas.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + sc + ")"; over.style.transform = canvas.style.transform; }
	function commit() {
		var r = stage.getBoundingClientRect(), fx = (r.width) / W; /* css px per picture px */
		/* the picture point under the stage centre after the CSS transform */
		var cx = (r.width / 2 - tx) / sc / fx, cy = (r.height / 2 - ty) / sc / fx;   /* picture pixels */
		var dx = cx - W / 2, dy = cy - H / 2;
		if (S.rot) { S.ci += dx * ps; S.cr += dy * ps; } else { S.cr += dx * ps; S.ci -= dy * ps; }
		S.span = Math.max(0.005, Math.min(12, S.span / sc)); tx = ty = 0; sc = 1; cssT(); S.pre = S.pre; mainBufs = null; start();
	}
	function later() { clearTimeout(commitT); commitT = setTimeout(commit, 260); }
	canvas.addEventListener("pointerdown", function (e) { drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty }; canvas.setPointerCapture(e.pointerId); });
	canvas.addEventListener("pointermove", function (e) { if (!drag) return; tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; cssT(); });
	canvas.addEventListener("pointerup", function () { if (drag && (tx || ty)) later(); drag = null; });
	canvas.addEventListener("wheel", function (e) {
		e.preventDefault(); var r = stage.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015);
		if (S.span / (sc * f) < 0.005 || S.span / (sc * f) > 12) return;
		tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; sc *= f; cssT(); later();
	}, { passive: false });
	canvas.addEventListener("dblclick", function (e) { var r = stage.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = 2; tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; sc *= f; cssT(); later(); });

	/* ---------- orbit lab ---------- */
	var lab = $("bb-lab"), lctx = lab.getContext("2d"), LW = lab.width, LH = lab.height, LV = { x0: -2.2, x1: 0.8, y0: -1.2, y1: 1.2 }, labBase = null;
	function drawLabBase() {
		var im = lctx.createImageData(LW, LH), d = new Uint32Array(im.data.buffer), px, py, k;
		for (py = 0; py < LH; py++) for (px = 0; px < LW; px++) {
			var cx = LV.x0 + (LV.x1 - LV.x0) * (px + 0.5) / LW, cy = LV.y1 - (LV.y1 - LV.y0) * (py + 0.5) / LH, o = B.orbit(cx, cy, S.pw, 60), v;
			if (!o.n) v = 0xff0d0a05; else { var t = Math.min(1, Math.log(o.n + 1) / 4); v = (255 << 24) | (Math.round(70 + 120 * t) << 16) | (Math.round(40 + 70 * t) << 8) | Math.round(20 + 30 * t); }
			d[py * LW + px] = v;
		}
		lctx.putImageData(im, 0, 0); labBase = lctx.getImageData(0, 0, LW, LH);
	}
	function lx(x) { return (x - LV.x0) / (LV.x1 - LV.x0) * LW; } function ly(y) { return (LV.y1 - y) / (LV.y1 - LV.y0) * LH; }
	function pickLab(e) {
		var r = lab.getBoundingClientRect(), cx = LV.x0 + (LV.x1 - LV.x0) * (e.clientX - r.left) / r.width, cy = LV.y1 - (LV.y1 - LV.y0) * (e.clientY - r.top) / r.height;
		setPicked(cx, cy);
	}
	function setPicked(cx, cy) {
		var o = B.orbit(cx, cy, S.pw, Math.max.apply(null, lims())); picked = { c: [cx, cy], o: o }; lctx.putImageData(labBase, 0, 0);
		lctx.strokeStyle = "rgba(255,210,90,0.9)"; lctx.lineWidth = 1.2; lctx.beginPath(); o.pts.slice(0, 200).forEach(function (p, i) { var X = lx(p[0]), Y = ly(p[1]); if (i) lctx.lineTo(X, Y); else lctx.moveTo(X, Y); }); lctx.stroke();
		lctx.fillStyle = "#fff"; lctx.beginPath(); lctx.arc(lx(cx), ly(cy), 3, 0, 6.3); lctx.fill();
		var c = (+cx.toFixed(4)) + (cy < 0 ? " − " : " + ") + Math.abs(+cy.toFixed(4)) + "i", t = $("bb-labtxt");
		if (o.n) t.innerHTML = "<p><b>c = " + c + "</b> escapes after <b>" + o.n + "</b> step" + (o.n === 1 ? "" : "s") + ".</p><p>" + (S.anti ? "The Anti-Buddhabrot ignores it: it escapes." : "It adds <b>" + (2 * (o.n - 1)) + "</b> dots to the picture (" + (o.n - 1) + " points of the orbit and their mirror images)" + (o.n < S.min ? ", except that your “shortest escape that counts” of " + S.min + " throws it away" : "") + (o.n > Math.max.apply(null, lims()) ? ", except that it needs more steps than your iteration limit, so it is thrown away" : "") + ".") + "</p>";
		else t.innerHTML = "<p><b>c = " + c + "</b> never escapes in " + Math.max.apply(null, lims()) + " steps: it is inside the set.</p><p>" + (S.anti ? "The Anti-Buddhabrot draws its orbit (" + Math.max.apply(null, lims()) + " dots and mirror images)." : "The Buddhabrot throws it away.") + "</p>";
		drawOverlay();
	}
	lab.addEventListener("click", pickLab); lab.addEventListener("pointermove", function (e) { if (e.buttons) pickLab(e); });
	function drawOverlay() {
		octx.clearRect(0, 0, over.width, over.height);
		if (!S.show || !picked || !W) return;
		var f = over.width / W, o = picked.o, cnt = o.n ? o.n - 1 : Math.max.apply(null, lims());
		octx.fillStyle = "rgba(255,210,90,0.95)"; octx.strokeStyle = "rgba(255,255,255,0.8)";
		for (var j = 1; j <= Math.min(cnt, o.pts.length - 1, 400); j++) {
			var p = o.pts[j];
			[[p[0], p[1]], [p[0], -p[1]]].forEach(function (z) {
				var px, py; if (S.rot) { px = (z[1] - S.ci) / ps + W / 2; py = H / 2 + (z[0] - S.cr) / ps; } else { px = (z[0] - S.cr) / ps + W / 2; py = H / 2 - (z[1] - S.ci) / ps; }
				if (px < 0 || py < 0 || px > W || py > H) return; octx.beginPath(); octx.arc(px * f, py * f, Math.max(2.5, 2.5 * f), 0, 6.3); octx.fill();
			});
		}
	}

	/* ---------- go ---------- */
	writeControls(); useCanvas(); sizeStage(); drawLabBase(); setPicked(-0.745, 0.2); start();
	document.addEventListener("visibilitychange", function () { /* workers keep running in a hidden tab; nothing to do */ });
})();
