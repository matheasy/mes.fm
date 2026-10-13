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
