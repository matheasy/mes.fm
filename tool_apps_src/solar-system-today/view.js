/* MES Solar System Today -- the renderer (canvas 2D). Shared by mes.fm/solar-system-today and the mes.fm/moon widget (orrery-embed.js).
 * MESSolarView.create(canvas, opts) -> { set, setDate, setMode, fit, reset, render, resize, png, pick, V }
 * Modes: "orrery" (the whole system, drag to rotate / tilt, wheel to zoom, distances can be compressed so every planet fits),
 *        "moon" (Earth, Moon and the Sun's direction, Sun fixed on the left so the phases read left to right),
 *        "sky" (the ecliptic band as Earth sees it: constellations with the Sun, Moon and planets on it).
 * Bodies are drawn larger than life (the real sizes would be invisible dots); "True scale" in the Earth & Moon view shows the real ratio.
 */
(function (root) {
	"use strict";
	var S = root.MESSolar, TAU = Math.PI * 2, DEG = Math.PI / 180;
	var DAY = 86400000;

	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	function rgba(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a == null ? 1 : a) + ")"; }
	function mix(c, t, k) { return [c[0] + (t[0] - c[0]) * k, c[1] + (t[1] - c[1]) * k, c[2] + (t[2] - c[2]) * k]; }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function wrap(d) { d = d % 360; return d < 0 ? d + 360 : d; }

	/* ---------- the swarms: asteroid belt, Kuiper belt, Jupiter's Trojans (decorative, but they really circle at Kepler's rate) ---------- */
	function makeBelts() {
		var r = rng(20261003), ast = [], kui = [], tro = [], i, GAPS = [[2.5, 0.025], [2.82, 0.02], [2.95, 0.015], [3.27, 0.02], [2.06, 0.03]];
		while (ast.length < 1500) {
			var a = 2.05 + r() * 1.3, ok = true;
			GAPS.forEach(function (g) { if (Math.abs(a - g[0]) < g[1]) ok = false; });
			if (!ok) continue;
			ast.push({ a: a, e: r() * r() * 0.22, m0: r() * TAU, w: r() * TAU, inc: (r() - 0.5) * 0.45 * (0.3 + r()), s: 0.5 + r() * 0.9 });
		}
		for (i = 0; i < 1000; i++) kui.push({ a: 38.5 + r() * 9 + (r() < 0.12 ? r() * 30 : 0), e: r() * 0.14, m0: r() * TAU, w: r() * TAU, inc: (r() - 0.5) * 0.5, s: 0.5 + r() * 0.8 });
		for (i = 0; i < 520; i++) tro.push({ off: (i % 2 ? 1 : -1) * (Math.PI / 3 + (r() - 0.5) * 0.55), a: 5.2 + (r() - 0.5) * 0.4, z: (r() - 0.5) * 0.7, s: 0.5 + r() * 0.8 });
		return { ast: ast, kui: kui, tro: tro };
	}
	function beltPos(p, years) {
		var m = p.m0 + TAU * years / Math.pow(p.a, 1.5), th = m + 2 * p.e * Math.sin(m), r = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(th)), ang = th + p.w;
		return { x: r * Math.cos(ang), y: r * Math.sin(ang), z: r * Math.sin(p.inc) * Math.sin(th) };
	}

	/* ---------- procedural textures ---------- */
	var moonTex = null;
	function getMoonTex() {
		if (moonTex) return moonTex;
		var N = 160, c = document.createElement("canvas"); c.width = c.height = N;
		var g = c.getContext("2d"), R = N / 2, rr = rng(7);
		var base = g.createRadialGradient(R, R, R * 0.1, R, R, R); base.addColorStop(0, "#e2e0da"); base.addColorStop(1, "#c4c1ba");
		g.fillStyle = base; g.fillRect(0, 0, N, N);
		// maria (dark plains) at roughly their real places on the near side (north up)
		[[-0.28, -0.42, 0.24, 0.9], [0.17, -0.4, 0.16, 0.9], [0.36, -0.13, 0.19, 0.95], [0.63, -0.3, 0.09, 1], [-0.62, -0.08, 0.3, 0.7], [-0.27, 0.36, 0.17, 0.8], [0.55, 0.16, 0.13, 0.85], [-0.05, 0.1, 0.14, 0.7], [0.1, -0.63, 0.12, 0.7]].forEach(function (m) {
			var x = R + m[0] * R, y = R + m[1] * R, rad = m[2] * R, gg = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
			gg.addColorStop(0, "rgba(96,98,108," + 0.75 * m[3] + ")"); gg.addColorStop(0.7, "rgba(104,106,116," + 0.55 * m[3] + ")"); gg.addColorStop(1, "rgba(110,112,120,0)");
			g.fillStyle = gg; g.beginPath(); g.ellipse(x, y, rad * 1.1, rad * 0.95, 0.4, 0, TAU); g.fill();
		});
		var i;
		for (i = 0; i < 70; i++) {                       // craters: a light rim and a dark floor
			var a = rr() * TAU, d = Math.sqrt(rr()) * 0.92, x = R + Math.cos(a) * d * R, y = R + Math.sin(a) * d * R, rad = (0.012 + rr() * rr() * 0.05) * R;
			g.fillStyle = "rgba(70,70,76,0.28)"; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
			g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = Math.max(0.5, rad * 0.25); g.beginPath(); g.arc(x - rad * 0.15, y - rad * 0.15, rad, 0, TAU); g.stroke();
		}
		var ty = R + 0.72 * R, tx = R - 0.12 * R, ray = g.createRadialGradient(tx, ty, 1, tx, ty, R * 0.34);   // Tycho and its rays
		ray.addColorStop(0, "rgba(255,255,255,0.9)"); ray.addColorStop(0.2, "rgba(255,255,255,0.35)"); ray.addColorStop(1, "rgba(255,255,255,0)");
		g.fillStyle = ray; g.beginPath(); g.arc(tx, ty, R * 0.34, 0, TAU); g.fill();
		moonTex = c; return c;
	}

	/* a lit ball: flat colour, optional texture, then one lighting overlay (light toward lx,ly in screen space) */
	function ball(ctx, x, y, r, rgb, lx, ly, tex, ambient) {
		ctx.save();
		ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
		ctx.fillStyle = rgba(rgb); ctx.fillRect(x - r, y - r, r * 2, r * 2);
		if (tex) tex(ctx, x, y, r);
		var amb = ambient == null ? 0.84 : ambient;
		var g = ctx.createRadialGradient(x + lx * r * 0.55, y + ly * r * 0.55, r * 0.15, x + lx * r * 0.15, y + ly * r * 0.15, r * 1.55);
		g.addColorStop(0, "rgba(255,255,255,0.30)"); g.addColorStop(0.42, "rgba(0,0,0,0)"); g.addColorStop(0.78, "rgba(0,0,0," + (amb * 0.55) + ")"); g.addColorStop(1, "rgba(0,0,0," + amb + ")");
		ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
		ctx.restore();
	}
	function earthTex(ctx, x, y, r) {
		ctx.fillStyle = "rgba(66,150,84,0.78)";
		[[-0.25, -0.3, 0.34, 0.2, 0.5], [-0.45, 0.25, 0.2, 0.28, -0.3], [0.38, -0.12, 0.26, 0.34, 0.2], [0.2, 0.5, 0.17, 0.12, 0], [0.62, 0.38, 0.1, 0.07, 0.3]].forEach(function (b) {
			ctx.beginPath(); ctx.ellipse(x + b[0] * r, y + b[1] * r, b[2] * r, b[3] * r, b[4], 0, TAU); ctx.fill();
		});
		ctx.fillStyle = "rgba(255,255,255,0.35)";
		[[-0.1, -0.55, 0.5, 0.07, 0.2], [0.3, 0.1, 0.4, 0.06, -0.3], [-0.4, 0.5, 0.35, 0.06, 0.1]].forEach(function (b) {
			ctx.beginPath(); ctx.ellipse(x + b[0] * r, y + b[1] * r, b[2] * r, b[3] * r, b[4], 0, TAU); ctx.fill();
		});
		ctx.fillStyle = "rgba(245,250,255,0.85)"; ctx.beginPath(); ctx.ellipse(x, y - r * 0.93, r * 0.45, r * 0.16, 0, 0, TAU); ctx.fill();
	}
	function jupiterTex(ctx, x, y, r) {
		var bands = [[-0.78, 0.1, "rgba(150,110,80,.55)"], [-0.55, 0.12, "rgba(235,215,185,.5)"], [-0.3, 0.14, "rgba(160,110,75,.65)"], [-0.05, 0.12, "rgba(240,225,200,.55)"], [0.18, 0.15, "rgba(165,115,80,.6)"], [0.45, 0.12, "rgba(235,215,185,.5)"], [0.7, 0.1, "rgba(150,110,80,.5)"]];
		bands.forEach(function (b) { ctx.fillStyle = b[2]; ctx.fillRect(x - r, y + b[0] * r - b[1] * r / 2, r * 2, b[1] * r); });
		ctx.fillStyle = "rgba(196,84,52,0.85)"; ctx.beginPath(); ctx.ellipse(x + r * 0.28, y + r * 0.3, r * 0.2, r * 0.11, 0, 0, TAU); ctx.fill();
	}
	function saturnTex(ctx, x, y, r) {
		[[-0.6, 0.12, "rgba(190,160,110,.5)"], [-0.25, 0.12, "rgba(245,230,190,.45)"], [0.1, 0.16, "rgba(190,160,110,.45)"], [0.5, 0.14, "rgba(245,230,190,.4)"]].forEach(function (b) {
			ctx.fillStyle = b[2]; ctx.fillRect(x - r, y + b[0] * r - b[1] * r / 2, r * 2, b[1] * r);
		});
	}
	function marsTex(ctx, x, y, r) {
		ctx.fillStyle = "rgba(110,50,30,0.5)"; ctx.beginPath(); ctx.ellipse(x - r * 0.1, y + r * 0.1, r * 0.45, r * 0.22, 0.3, 0, TAU); ctx.fill();
		ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.ellipse(x, y - r * 0.92, r * 0.3, r * 0.12, 0, 0, TAU); ctx.fill();
	}
	var TEX = { earth: earthTex, jupiter: jupiterTex, saturn: saturnTex, mars: marsTex };

	/* the Moon as Earth sees it: lit part from the phase angle (0 new .. 180 full .. 360), north hemisphere view, with maria */
	function drawMoonPhase(ctx, x, y, r, phaseDeg) {
		var tex = getMoonTex(), ph = wrap(phaseDeg), waning = ph > 180, f = waning ? 360 - ph : ph, c = Math.cos(f * DEG);
		ctx.save();
		ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
		ctx.fillStyle = "#0b0d12"; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
		ctx.globalAlpha = 0.16; ctx.drawImage(tex, x - r, y - r, 2 * r, 2 * r); ctx.globalAlpha = 1;    // earthshine
		if (f > 0.5) {
			ctx.save();
			if (waning) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
			ctx.beginPath(); ctx.moveTo(x, y - r); ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, false);
			var rx = Math.abs(c) * r;
			if (c >= 0) ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, -Math.PI / 2, true); else ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, Math.PI * 1.5, false);
			ctx.closePath(); ctx.clip();
			if (waning) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
			ctx.drawImage(tex, x - r, y - r, 2 * r, 2 * r);
			ctx.restore();
		}
		ctx.restore();
		ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
	}

	function create(canvas, opts) {
		opts = opts || {};
		var ctx = canvas.getContext("2d"), belts = makeBelts(), J2000 = Date.UTC(2000, 0, 1, 12);
		var V = {
			mode: opts.mode || "orrery", tilt: opts.tilt == null ? 52 : opts.tilt, yaw: opts.yaw == null ? -90 : opts.yaw, zoom: 1, panX: 0, panY: 0, compress: opts.compress == null ? 0.72 : opts.compress,
			show: { orbits: true, trails: true, belts: true, labels: true, halley: true, seasons: false, rings: true, moon: true, sight: true, trueScale: false },
			date: opts.date || new Date(), sel: null, hover: null, interactive: opts.interactive !== false, light: false, fixedSun: true
		};
		var w = 0, h = 0, dpr = 1, k = 1, stars = null, snap = null, hits = [], raf = 0, ringCache = null, ringDate = 0, halleyRing = null, tNow = 0;
		var ptrs = {}, drag = null, onPick = opts.onPick, onHover = opts.onHover, onChange = opts.onChange;

		/* ---------- sizing + backdrop ---------- */
		function resize() {
			var r = canvas.getBoundingClientRect();
			dpr = Math.min(window.devicePixelRatio || 1, 2.5); w = Math.max(10, r.width); h = Math.max(10, r.height); k = clamp(Math.min(w, h) / 700, 0.62, 1.7);
			canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
			stars = null; render();
		}
		function buildStars() {
			var c = document.createElement("canvas"); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
			var g = c.getContext("2d"); g.scale(dpr, dpr);
			var bg = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
			bg.addColorStop(0, "#0d1226"); bg.addColorStop(0.55, "#070a16"); bg.addColorStop(1, "#02030a");
			g.fillStyle = bg; g.fillRect(0, 0, w, h);
			var r = rng(99), i;
			[[0.2, 0.3, 0.35, "70,60,140"], [0.8, 0.7, 0.4, "30,90,150"], [0.62, 0.15, 0.25, "120,50,110"]].forEach(function (n) {   // faint nebulae
				var x = n[0] * w, y = n[1] * h, rad = n[2] * Math.max(w, h), gg = g.createRadialGradient(x, y, 0, x, y, rad);
				gg.addColorStop(0, "rgba(" + n[3] + ",0.16)"); gg.addColorStop(1, "rgba(" + n[3] + ",0)"); g.fillStyle = gg; g.fillRect(0, 0, w, h);
			});
			var n = Math.round(w * h / 1500);
			for (i = 0; i < n; i++) {
				var x = r() * w, y = r() * h, m = r(), s = m > 0.985 ? 1.7 : m > 0.93 ? 1.1 : 0.6, tint = r();
				g.fillStyle = tint < 0.15 ? "rgba(170,200,255," + (0.5 + m * 0.5) + ")" : tint > 0.88 ? "rgba(255,220,180," + (0.5 + m * 0.5) + ")" : "rgba(235,240,255," + (0.35 + m * 0.65) + ")";
				g.beginPath(); g.arc(x, y, s * 0.6, 0, TAU); g.fill();
				if (s > 1.5) { g.strokeStyle = "rgba(200,215,255,0.25)"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke(); }
			}
			stars = c;
		}

		/* ---------- projection: world AU (ecliptic) -> screen px ---------- */
		function pw() { return 1 - 0.62 * V.compress; }          // distance exponent
		function S0() { return 0.46 * Math.min(w, h / Math.max(0.45, Math.cos(V.tilt * DEG) * 0.5 + 0.5)) / Math.pow(40, pw()); }
		var pr = { sc: 1, cy: 0, sy: 0, ct: 1, st: 0, p: 1, cx: 0, cyy: 0 };
		function prep() {
			var y = V.yaw * DEG, t = V.tilt * DEG;
			pr.cy = Math.cos(y); pr.sy = Math.sin(y); pr.ct = Math.cos(t); pr.st = Math.sin(t); pr.p = pw(); pr.sc = S0() * V.zoom;
			pr.cx = w / 2 + V.panX; pr.cyy = h * 0.5 + V.panY;
		}
		function P(x, y, z) {
			var r2 = Math.sqrt(x * x + y * y), f = r2 > 1e-9 ? Math.pow(r2, pr.p) / r2 : 1;
			var X = x * f, Y = y * f, Z = z * f;
			var xr = X * pr.cy - Y * pr.sy, yr = X * pr.sy + Y * pr.cy;
			return { x: pr.cx + xr * pr.sc, y: pr.cyy - (yr * pr.ct + Z * pr.st) * pr.sc, d: yr * pr.st - Z * pr.ct };
		}
		function unp() { return { cx: pr.cx, cy: pr.cyy }; }

		/* ---------- cached orbit rings ---------- */
		function rings(date) {
			var yrs = Math.abs(date.getTime() - ringDate) / (365.25 * DAY);
			if (ringCache && yrs < 60) return ringCache;
			ringCache = {}; ringDate = date.getTime();
			S.BODIES.forEach(function (b) {
				var Pd = S.PERIOD_DAYS[b.id], n = b.id === "mercury" ? 120 : b.id === "venus" || b.id === "earth" ? 140 : 180, pts = [], i;
				for (i = 0; i <= n; i++) {
					var p = S.helio(b.id, new Date(date.getTime() + (i / n - 0.5) * Pd * DAY));
					pts.push({ x: p.x, y: p.y, z: p.z });
				}
				ringCache[b.id] = pts;
			});
			if (!halleyRing) halleyRing = S.halleyOrbit(260);
			return ringCache;
		}

		/* ---------- drawing helpers ---------- */
		function glow(x, y, r, col, a) {
			var g = ctx.createRadialGradient(x, y, 0, x, y, r);
			g.addColorStop(0, "rgba(" + col + "," + a + ")"); g.addColorStop(1, "rgba(" + col + ",0)");
			ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
		}
		function label(text, x, y, o) {
			o = o || {};
			ctx.font = (o.bold ? "700 " : "600 ") + Math.round((o.size || 12) * Math.max(0.9, k)) + "px system-ui,-apple-system,'Segoe UI',sans-serif";
			ctx.textAlign = o.align || "left"; ctx.textBaseline = "middle";
			ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(2,4,12,0.85)"; ctx.strokeText(text, x, y);
			ctx.fillStyle = o.color || "rgba(232,238,252,0.95)"; ctx.fillText(text, x, y);
		}
		function drawSun(x, y, r, t) {
			ctx.save(); ctx.globalCompositeOperation = "lighter";
			glow(x, y, r * 7, "255,170,60", 0.2); glow(x, y, r * 3.4, "255,200,90", 0.38); glow(x, y, r * 1.9, "255,230,150", 0.6);
			ctx.lineWidth = 1; var i;
			for (i = 0; i < 18; i++) {
				var a = i / 18 * TAU + t * 0.00006, l = r * (2.6 + 1.1 * Math.sin(i * 7.3 + t * 0.0007)), g = ctx.createLinearGradient(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
				g.addColorStop(0, "rgba(255,225,140,0.5)"); g.addColorStop(1, "rgba(255,200,90,0)");
				ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
			}
			ctx.restore();
			var g2 = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
			g2.addColorStop(0, "#fffbe0"); g2.addColorStop(0.55, "#ffd45a"); g2.addColorStop(1, "#ff9a1f");
			ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
		}
		function saturnRings(x, y, r, ratio, front, lx, ly) {
			ctx.save(); ctx.translate(x, y);
			ctx.beginPath();
			if (front) ctx.rect(-r * 3, 0, r * 6, r * 3); else ctx.rect(-r * 3, -r * 3, r * 6, r * 3);
			ctx.clip();
			[[1.35, 1.6, "rgba(206,186,140,0.85)"], [1.65, 2.05, "rgba(230,214,170,0.9)"], [2.12, 2.3, "rgba(190,170,130,0.55)"]].forEach(function (b) {
				ctx.strokeStyle = b[2]; ctx.lineWidth = Math.max(1, (b[1] - b[0]) * r * 0.55);
				ctx.beginPath(); ctx.ellipse(0, 0, (b[0] + b[1]) / 2 * r, (b[0] + b[1]) / 2 * r * ratio, -0.18, 0, TAU); ctx.stroke();
			});
			ctx.restore();
		}

		/* ---------- orrery ---------- */
		function drawOrrery(t) {
			prep();
			var s = snap, date = V.date, years = (date.getTime() - J2000) / (365.25 * DAY), rg = rings(date), items = [], i;
			var c0 = P(0, 0, 0), earth = s.by.earth, ep = P(earth.x, earth.y, earth.z);
			hits = [];

			// distance guides
			if (V.show.rings) {
				ctx.save(); ctx.setLineDash([2, 6]); ctx.lineWidth = 1;
				[0.5, 1, 2, 5, 10, 20, 30, 40, 50].forEach(function (au) {
					var pts = [], a;
					for (a = 0; a <= 72; a++) pts.push(P(au * Math.cos(a / 72 * TAU), au * Math.sin(a / 72 * TAU), 0));
					var minr = Math.min.apply(null, pts.map(function (p) { return Math.hypot(p.x - c0.x, p.y - c0.y); }));
					if (minr < 24 * k || minr > Math.max(w, h) * 1.3) return;
					ctx.strokeStyle = "rgba(150,170,220,0.13)"; ctx.beginPath();
					pts.forEach(function (p, j) { if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
					var lp = pts[Math.round(72 * 0.125)];
					if (lp.x > 6 && lp.x < w - 30 && lp.y > 10 && lp.y < h - 6) { ctx.setLineDash([]); label(au + (au === 1 ? " AU" : " AU"), lp.x + 4, lp.y, { size: 10, color: "rgba(150,170,220,0.55)" }); ctx.setLineDash([2, 6]); }
				});
				ctx.restore();
			}

			// belts
			if (V.show.belts) {
				var aa = 0.5 * clamp(Math.sqrt(k), 0.8, 1.2);
				function swarm(list, rgb, alphaBase, szBase) {
					ctx.fillStyle = "rgba(" + rgb + "," + alphaBase + ")";
					for (var j = 0; j < list.length; j++) {
						var q = beltPos(list[j], years), p = P(q.x, q.y, q.z), sz = szBase * list[j].s;
						ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
					}
				}
				swarm(belts.ast, "190,176,150", aa, 1.4 * k);
				swarm(belts.kui, "130,160,210", aa * 0.8, 1.3 * k);
				var j0 = s.by.jupiter, jl = Math.atan2(j0.y, j0.x);
				ctx.fillStyle = "rgba(214,180,140," + aa + ")";
				belts.tro.forEach(function (q) {
					var an = jl + q.off, p = P(q.a * Math.cos(an), q.a * Math.sin(an), q.z), sz = 1.4 * k * q.s; ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
				});
			}

			// orbits (faint full ring) + trails (bright tail behind each planet)
			if (V.show.orbits) {
				S.BODIES.forEach(function (b) {
					var pts = rg[b.id].map(function (q) { return P(q.x, q.y, q.z); }), sel = V.sel === b.id;
					ctx.strokeStyle = rgba(b.rgb, sel ? 0.55 : 0.2); ctx.lineWidth = (sel ? 1.8 : 1) * Math.max(0.8, k * 0.9);
					ctx.beginPath(); pts.forEach(function (p, j) { if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
				});
				if (V.show.halley && halleyRing) {
					ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = "rgba(140,230,220,0.28)"; ctx.lineWidth = 1; ctx.beginPath();
					halleyRing.forEach(function (q, j) { var p = P(q.x, q.y, q.z); if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.stroke(); ctx.restore();
				}
			}
			if (V.show.trails) {
				S.BODIES.forEach(function (b) {
					var Pd = S.PERIOD_DAYS[b.id], span = Math.min(0.55, 0.16 + 0.35 * Math.min(1, Pd / 11000)) * Pd, n = 26, prev = null, j;
					for (j = 0; j <= n; j++) {
						var q = j === 0 ? s.by[b.id] : S.helio(b.id, new Date(date.getTime() - (j / n) * span * DAY)), p = P(q.x, q.y, q.z);
						if (prev) {
							ctx.strokeStyle = rgba(mix(b.rgb, [255, 255, 255], 0.25), 0.85 * Math.pow(1 - j / n, 1.4)); ctx.lineWidth = (V.sel === b.id ? 2.6 : 1.9) * Math.max(0.8, k * 0.9);
							ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
						}
						prev = p;
					}
				});
			}

			// the seasons around Earth's orbit
			if (V.show.seasons) {
				var prc = S.precession(date), marks = [["Mar equinox", 0], ["Jun solstice", 90], ["Sep equinox", 180], ["Dec solstice", 270]];
				marks.forEach(function (m) {
					var a = (m[1] - prc) * DEG, p1 = P(0.93 * Math.cos(a), 0.93 * Math.sin(a), 0), p2 = P(1.07 * Math.cos(a), 1.07 * Math.sin(a), 0), p3 = P(1.0 * Math.cos(a), 1.0 * Math.sin(a), 0);
					ctx.strokeStyle = "rgba(255,226,140,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
					var dx = p3.x - c0.x, dy = p3.y - c0.y, dl = Math.hypot(dx, dy) || 1;
					label(m[0], p3.x + dx / dl * 26 * k, p3.y + dy / dl * 14 * k, { size: 10, color: "rgba(255,226,140,0.9)", align: dx > 0 ? "left" : "right" });
				});
			}

			// bodies, far to near
			items.push({ id: "sun", p: c0, d: 0, r: 15 * k });
			S.BODIES.forEach(function (b) { var o = s.by[b.id], p = P(o.x, o.y, o.z); items.push({ id: b.id, p: p, d: p.d, r: b.px * k * (b.id === "earth" ? 1 : 1) * (V.zoom > 6 ? Math.min(2.2, Math.pow(V.zoom / 6, 0.25)) : 1), b: b }); });
			if (V.show.halley) { var hq = S.halley(date), hp = P(hq.x, hq.y, hq.z); items.push({ id: "halley", p: hp, d: hp.d, r: 3 * k }); }
			items.sort(function (a, b) { return b.d - a.d; });
			items.forEach(function (it) {
				var x = it.p.x, y = it.p.y, r = it.r, id = it.id;
				if (id === "sun") { drawSun(x, y, r, t); hits.push({ id: "sun", x: x, y: y, r: r * 1.6 }); return; }
				if (id === "halley") {
					var ang = Math.atan2(y - c0.y, x - c0.x);
					ctx.save(); ctx.globalCompositeOperation = "lighter";
					var tg = ctx.createLinearGradient(x, y, x + Math.cos(ang) * 40 * k, y + Math.sin(ang) * 40 * k); tg.addColorStop(0, "rgba(160,240,235,0.7)"); tg.addColorStop(1, "rgba(160,240,235,0)");
					ctx.strokeStyle = tg; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * 40 * k, y + Math.sin(ang) * 40 * k); ctx.stroke(); glow(x, y, 9 * k, "180,255,250", 0.7); ctx.restore();
					ctx.fillStyle = "#e9fffd"; ctx.beginPath(); ctx.arc(x, y, 2.2 * k, 0, TAU); ctx.fill();
					hits.push({ id: "halley", x: x, y: y, r: 9 * k });
					if (V.show.labels) label("Halley's Comet", x + 8 * k, y - 8 * k, { size: 10, color: "rgba(170,240,235,0.9)" });
					return;
				}
				var dx = c0.x - x, dy = c0.y - y, dl = Math.hypot(dx, dy) || 1, lx = dx / dl, ly = dy / dl;
				if (id === "earth") {                                         // "you are here" pulse
					var pu = (t % 2200) / 2200;
					ctx.strokeStyle = "rgba(120,190,255," + (0.5 * (1 - pu)) + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 4 + pu * 22 * k, 0, TAU); ctx.stroke();
				}
				var ratio = Math.max(0.14, Math.abs(Math.cos((V.tilt + 20) * DEG)));
				if (id === "saturn") saturnRings(x, y, r, ratio, false);
				glow(x, y, r * 2.4, id === "earth" ? "90,160,255" : String(Math.round(it.b.rgb[0])) + "," + Math.round(it.b.rgb[1]) + "," + Math.round(it.b.rgb[2]), id === "earth" ? 0.22 : 0.1);
				ball(ctx, x, y, r, it.b.rgb, lx, ly, TEX[id]);
				if (id === "earth") { ctx.strokeStyle = "rgba(140,200,255,0.55)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r + 0.6, 0, TAU); ctx.stroke(); }
				if (id === "saturn") saturnRings(x, y, r, ratio, true);
				hits.push({ id: id, x: x, y: y, r: Math.max(r + 5, 12) });
				if (V.sel === id || V.hover === id) { ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 5 * k + (id === "saturn" ? r : 0), 0, TAU); ctx.stroke(); }
			});

			// Moon (not to scale: on a ring around Earth)
			if (V.show.moon) {
				var mo = s.moon, mr = Math.max(15 * k, 11 + 1.5 * V.zoom * k), a = mo.lon * DEG;
				var mp = (function () { var yr = V.yaw * DEG; var gx = Math.cos(a) * mr, gy = Math.sin(a) * mr; var xr = gx * Math.cos(yr) - gy * Math.sin(yr), yv = gx * Math.sin(yr) + gy * Math.cos(yr); return { x: ep.x + xr, y: ep.y - yv * pr.ct }; })();
				ctx.save(); ctx.strokeStyle = "rgba(200,210,235,0.28)"; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(ep.x, ep.y, mr, mr * pr.ct, 0, 0, TAU); ctx.stroke(); ctx.restore();
				var mlx = c0.x - mp.x, mly = c0.y - mp.y, ml = Math.hypot(mlx, mly) || 1;
				ball(ctx, mp.x, mp.y, 2.6 * k + 0.4, [205, 205, 200], mlx / ml, mly / ml, null, 0.8);
				hits.push({ id: "moon", x: mp.x, y: mp.y, r: 9 });
				if (V.show.labels && (V.zoom > 2.2 || V.sel === "moon")) label("Moon", mp.x + 6, mp.y + 8, { size: 10, color: "rgba(214,222,240,0.9)" });
			}

			// sight line from Earth to the selected world
			if (V.show.sight && V.sel && V.sel !== "earth" && s.by[V.sel]) {
				var tg2 = s.by[V.sel], tp = P(tg2.x, tg2.y, tg2.z);
				ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ep.x, ep.y); ctx.lineTo(tp.x, tp.y); ctx.stroke(); ctx.restore();
				label(S.fmtAU(tg2.gd) + " AU · light takes " + S.lightTime(tg2.gd), (ep.x + tp.x) / 2 + 6, (ep.y + tp.y) / 2 - 8, { size: 11, color: "rgba(255,255,255,0.85)" });
			}

			// labels
			if (V.show.labels) {
				items.forEach(function (it) {
					if (it.id === "halley" || it.id === "sun") { if (it.id === "sun") label("Sun", it.p.x + 18 * k, it.p.y - 14 * k, { bold: true, size: 12, color: "rgba(255,225,150,0.95)" }); return; }
					var sel = V.sel === it.id;
					label(it.b.name + (it.id === "earth" ? "  ← you are here" : ""), it.p.x + it.r + 6, it.p.y - it.r * 0.4 - 4, { bold: sel || it.id === "earth", size: sel ? 13 : 12, color: it.id === "earth" ? "rgba(150,205,255,0.98)" : sel ? "#fff" : "rgba(226,232,248,0.92)" });
				});
			}
		}

		/* ---------- Earth & Moon ---------- */
		function drawMoonView(t) {
			var s = snap, mo = s.moon, R = Math.min(w * 0.4, h * 0.4), cx = w * 0.5 + (w > h * 1.2 ? w * 0.03 : 0), cy = h * 0.5, zoomR = R * V.zoom;
			var mean = 384400, orbitR = zoomR * (mo.dist / mean), true_ = V.show.trueScale;
			var er = true_ ? Math.max(1.6, zoomR * 6371 / mean) : Math.max(12 * k, zoomR * 0.1), mr = true_ ? Math.max(0.9, zoomR * 1737.4 / mean) : Math.max(5 * k, zoomR * 0.04);
			var ang = (mo.lon - s.sunLon + 180) * DEG, mx = cx + Math.cos(ang) * orbitR, my = cy - Math.sin(ang) * orbitR;
			hits = [];
			// the Sun's light: parallel rays from the left, Sun glow at the edge
			var sx = Math.max(-w * 0.02, cx - R * 1.9);
			ctx.save(); ctx.globalCompositeOperation = "lighter";
			var sg = ctx.createRadialGradient(-w * 0.04, cy, 0, -w * 0.04, cy, Math.max(w, h) * 0.55); sg.addColorStop(0, "rgba(255,200,90,0.5)"); sg.addColorStop(0.3, "rgba(255,170,60,0.14)"); sg.addColorStop(1, "rgba(255,170,60,0)");
			ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
			ctx.strokeStyle = "rgba(255,225,150,0.05)"; ctx.lineWidth = 1;
			var i; for (i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(0, cy + i * h * 0.075); ctx.lineTo(w, cy + i * h * 0.075); ctx.stroke(); }
			ctx.restore();
			label("☀ Sun, 150 million km away →", 12, cy - 0.46 * h * 0.5 - 14, { size: 11, color: "rgba(255,215,140,0.9)" });
			// orbit: mean circle and the real (slightly stretched) path of today
			ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = "rgba(190,205,240,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, zoomR, 0, TAU); ctx.stroke(); ctx.restore();
			ctx.strokeStyle = "rgba(190,205,240,0.5)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, orbitR, 0, TAU); ctx.stroke();
			// trail: the last 6 days
			var j, prev = null;
			for (j = 0; j <= 18; j++) {
				var d2 = new Date(V.date.getTime() - j * 8 * 3600 * 1000), sn = S.snapshot(d2), a2 = (sn.moon.lon - sn.sunLon + 180) * DEG, rr2 = zoomR * sn.moon.dist / mean;
				var qx = cx + Math.cos(a2) * rr2, qy = cy - Math.sin(a2) * rr2;
				if (prev) { ctx.strokeStyle = "rgba(235,240,255," + 0.7 * (1 - j / 18) + ")"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(qx, qy); ctx.stroke(); }
				prev = [qx, qy];
			}
			// Earth's shadow hint stays out on purpose: the Moon's orbit is tilted 5 degrees, so the flat view would claim an eclipse every full moon
			glow(cx, cy, er * 2.8, "90,160,255", 0.2);
			ball(ctx, cx, cy, er, S.BYID.earth.rgb, -1, 0, true_ ? null : earthTex);
			ctx.strokeStyle = "rgba(140,200,255,0.55)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, er + 0.6, 0, TAU); ctx.stroke();
			// Sun-to-Moon line and the angle at Earth
			ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = "rgba(255,215,140,0.4)"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - orbitR * 1.25, cy); ctx.stroke(); ctx.restore();
			ctx.save(); ctx.translate(mx, my);
			glow(0, 0, mr * 3, "230,235,255", 0.14); ctx.restore();
			ball(ctx, mx, my, mr, [210, 208, 202], -1, 0, mr > 4 ? function (c, x, y, r) { c.drawImage(getMoonTex(), x - r, y - r, 2 * r, 2 * r); } : null, 0.92);
			hits.push({ id: "earth", x: cx, y: cy, r: er + 4 }); hits.push({ id: "moon", x: mx, y: my, r: mr + 6 });
			if (V.hover === "moon" || V.sel === "moon") { ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx, my, mr + 4, 0, TAU); ctx.stroke(); }
			label("Earth", cx + er + 8, cy - er - 2, { bold: true, size: 13, color: "rgba(150,205,255,0.98)" });
			label("Moon  " + Math.round(mo.dist).toLocaleString() + " km", mx + mr + 8, my - mr - 4, { bold: true, size: 12 });
			if (true_) label("True scale: the Moon is about 30 Earth-widths away", w / 2, h - 16, { size: 12, align: "center", color: "rgba(200,210,235,0.85)" });
			else label("Sizes enlarged: shown to scale, Earth would be a speck", w / 2, h - 16, { size: 11, align: "center", color: "rgba(200,210,235,0.6)" });
			// the Moon as seen from Earth
			var ir = Math.min(52 * k, h * 0.13), ix = w - ir - 18, iy = ir + 62;
			ctx.fillStyle = "rgba(6,9,18,0.72)"; ctx.strokeStyle = "rgba(160,180,230,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ix, iy, ir + 9, 0, TAU); ctx.fill(); ctx.stroke();
			drawMoonPhase(ctx, ix, iy, ir, mo.phase);
			label("As seen from Earth", ix, iy + ir + 20, { size: 10, align: "center", color: "rgba(200,210,235,0.75)" });
		}

		/* ---------- the sky band ---------- */
		function drawSky(t) {
			var s = snap, Z = S.ZODIAC, rows = w < 700 ? 2 : 1, rowH = h / rows, span = 360 / rows, prc = S.precession(V.date), r, i;
			hits = [];
			ctx.fillStyle = "rgba(2,4,12,0.0)";
			for (r = 0; r < rows; r++) {
				var y0 = r * rowH, bandY = y0 + rowH * 0.5, bandH = Math.min(46 * k, rowH * 0.18), lo = r * span, hi = lo + span, mx = 16, pw_ = w - mx * 2;
				function X(lon) { return mx + (wrap(lon) >= lo && wrap(lon) <= hi ? (wrap(lon) - lo) / span * pw_ : -1e4); }
				function XL(lon) { return mx + (lon - lo) / span * pw_; }
				// constellation segments
				var segs = [], n = Z.length;
				for (i = 0; i < n; i++) { var st = Z[i][1], en = Z[(i + 1) % n][1]; if (en <= st) en += 360; segs.push([Z[i][0], st, en]); }
				segs.forEach(function (sg, ii) {
					[0, -360, 360].forEach(function (sh) {
						var a = Math.max(sg[1] + sh, lo), b = Math.min(sg[2] + sh, hi);
						if (b <= a) return;
						var x1 = XL(a), x2 = XL(b), hue = (ii * 27) % 360;
						ctx.fillStyle = "hsla(" + hue + ",45%,40%," + (ii % 2 ? 0.34 : 0.22) + ")"; ctx.fillRect(x1, bandY - bandH, x2 - x1, bandH * 2);
						ctx.strokeStyle = "rgba(180,200,240,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, bandY - bandH); ctx.lineTo(x1, bandY + bandH); ctx.stroke();
						if (x2 - x1 > 30) label(sg[0], (x1 + x2) / 2, bandY + bandH - 9 * k, { size: 10, align: "center", color: "rgba(214,224,248,0.85)" });
					});
				});
				ctx.strokeStyle = "rgba(255,220,140,0.65)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, bandY); ctx.lineTo(mx + pw_, bandY); ctx.stroke();
				for (i = Math.ceil(lo / 30) * 30; i <= hi; i += 30) { var tx = XL(i); ctx.strokeStyle = "rgba(180,200,240,0.4)"; ctx.beginPath(); ctx.moveTo(tx, bandY - bandH - 5); ctx.lineTo(tx, bandY - bandH); ctx.stroke(); if (i < 360) label(i + "°", tx, bandY - bandH - 12, { size: 9, align: "center", color: "rgba(160,180,220,0.6)" }); }
				// spring point (the zero of the calendar's seasons) drifts through Pisces
				var vp = wrap(-prc), vx = X(vp);
				if (vx > 0) { ctx.fillStyle = "rgba(255,226,140,0.9)"; ctx.beginPath(); ctx.moveTo(vx, bandY + bandH + 2); ctx.lineTo(vx - 5, bandY + bandH + 11); ctx.lineTo(vx + 5, bandY + bandH + 11); ctx.fill(); label("March equinox point", vx + 8, bandY + bandH + 12, { size: 9, color: "rgba(255,226,140,0.9)" }); }
				// markers, labels staggered into lanes so they never overlap
				var marks = [{ id: "sun", name: "Sun", lon: s.sunLon, rgb: [255, 210, 90], r: 11 * k }, { id: "moon", name: "Moon", lon: s.moon.lon, rgb: [225, 228, 235], r: 8 * k }];
				S.BODIES.forEach(function (b) { if (b.id !== "earth") marks.push({ id: b.id, name: b.name, lon: s.by[b.id].glon, rgb: b.rgb, r: Math.max(4, b.px * 0.7 * k) }); });
				marks.sort(function (a, b) { return a.lon - b.lon; });
				var lanes = [], gap = 6;
				marks.forEach(function (m) {
					var x = X(m.lon); if (x < 0) return;
					var wd = m.name.length * 6.6 * k + 14, lane = 0;
					while (lanes[lane] != null && lanes[lane] > x - 4) lane++;
					lanes[lane] = x + wd + gap;
					var up = lane % 2 === 0, off = (Math.floor(lane / 2) + 1) * 22 * k + bandH, ly = up ? bandY - off - 8 : bandY + off + 8;
					ctx.strokeStyle = rgba(m.rgb, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, bandY); ctx.lineTo(x, ly + (up ? 8 : -8)); ctx.stroke();
					if (m.id === "sun") { ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(x, bandY, m.r * 3, "255,190,80", 0.5); ctx.restore(); }
					ball(ctx, x, bandY, m.r, m.rgb, 0.3, -0.5, m.id === "moon" ? null : null, m.id === "sun" ? 0 : 0.6);
					if (m.id === "sun") { ctx.fillStyle = "#ffd45a"; ctx.beginPath(); ctx.arc(x, bandY, m.r, 0, TAU); ctx.fill(); }
					if (m.id === "moon") drawMoonPhase(ctx, x, bandY, m.r, s.moon.phase);
					label(m.name, x, ly, { bold: true, size: 11, align: "center", color: V.sel === m.id ? "#fff" : rgba(mix(m.rgb, [255, 255, 255], 0.5)) });
					hits.push({ id: m.id, x: x, y: bandY, r: Math.max(12, m.r + 5) });
				});
			}
			label("The ecliptic seen from Earth: where the Sun, Moon and planets sit among the zodiac constellations", w / 2, h - 12, { size: 10, align: "center", color: "rgba(160,180,220,0.6)" });
		}

		/* ---------- frame ---------- */
		function frame(t) {
			raf = 0; tNow = t;
			if (!w) return;
			if (!stars) buildStars();
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.drawImage(stars, 0, 0, w, h);
			snap = S.snapshot(V.date);
			if (V.mode === "moon") drawMoonView(t); else if (V.mode === "sky") drawSky(t); else drawOrrery(t);
			if (onChange) onChange(snap);
			if (V.animate) render();
		}
		function render() { if (!raf) raf = requestAnimationFrame(frame); }

		/* ---------- interaction ---------- */
		function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
		function pick(x, y) {
			var best = null, bd = 1e9;
			hits.forEach(function (hh) { var d = Math.hypot(x - hh.x, y - hh.y); if (d <= hh.r + 4 && d < bd) { bd = d; best = hh.id; } });
			return best;
		}
		function zoomBy(f, ax, ay) {
			var nz = clamp(V.zoom * f, V.mode === "orrery" ? 0.12 : 0.5, V.mode === "orrery" ? 900 : 8), real = nz / V.zoom;
			if (V.mode === "orrery") { V.panX = ax - w / 2 - (ax - w / 2 - V.panX) * real; V.panY = ay - h / 2 - (ay - h / 2 - V.panY) * real; }
			V.zoom = nz; render(); if (opts.onView) opts.onView(V);
		}
		if (V.interactive) {
			canvas.style.touchAction = opts.touchAction || "none";
			canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
			canvas.addEventListener("wheel", function (e) { if (opts.wheel === "ctrl" && !(e.ctrlKey || e.metaKey)) return; e.preventDefault(); var p = pos(e); zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), p.x, p.y); }, { passive: false });
			canvas.addEventListener("pointerdown", function (e) {
				canvas.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
				var ids = Object.keys(ptrs);
				drag = { x: p.x, y: p.y, moved: 0, pan: e.shiftKey || e.button === 2 || e.button === 1, n: ids.length };
				if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; drag.d0 = Math.hypot(a.x - b.x, a.y - b.y); drag.z0 = V.zoom; drag.mx = (a.x + b.x) / 2; drag.my = (a.y + b.y) / 2; }
			});
			canvas.addEventListener("pointermove", function (e) {
				var p = pos(e);
				if (!ptrs[e.pointerId]) { var hv = pick(p.x, p.y); if (hv !== V.hover) { V.hover = hv; canvas.style.cursor = hv ? "pointer" : (V.mode === "orrery" ? "grab" : "default"); render(); } if (onHover) onHover(hv, p.x, p.y); return; }
				var prev = ptrs[e.pointerId]; ptrs[e.pointerId] = p;
				if (!drag) return;
				var ids = Object.keys(ptrs);
				if (ids.length >= 2 && drag.d0) {
					var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
					V.panX += mx - drag.mx; V.panY += my - drag.my; drag.mx = mx; drag.my = my; drag.moved = 99;
					var target = drag.z0 * d / drag.d0; zoomBy(target / V.zoom, mx, my); return;
				}
				var dx = p.x - prev.x, dy = p.y - prev.y; drag.moved += Math.abs(dx) + Math.abs(dy);
				if (V.mode !== "orrery") return;
				if (drag.pan) { V.panX += dx; V.panY += dy; }
				else { V.yaw += dx * 0.35; V.tilt = clamp(V.tilt - dy * 0.28, 0, 82); if (opts.onView) opts.onView(V); }
				canvas.style.cursor = "grabbing"; render();
			});
			function up(e) {
				var p = pos(e), was = drag; delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length) drag = null;
				canvas.style.cursor = V.hover ? "pointer" : (V.mode === "orrery" ? "grab" : "default");
				if (was && was.moved < 5 && was.n === 1 && e.type === "pointerup") { var id = pick(p.x, p.y); if (onPick) onPick(id); }
			}
			canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
			canvas.addEventListener("pointerleave", function () { if (V.hover) { V.hover = null; if (onHover) onHover(null); render(); } });
			canvas.addEventListener("dblclick", function () { reset(); });
			canvas.style.cursor = V.mode === "orrery" ? "grab" : "default";
		}

		function fit(maxAU) { V.panX = 0; V.panY = 0; V.zoom = Math.pow(40, pw()) / Math.pow(maxAU, pw()) * 0.97; render(); if (opts.onView) opts.onView(V); }
		function reset() { V.tilt = opts.tilt == null ? 52 : opts.tilt; V.yaw = opts.yaw == null ? -90 : opts.yaw; V.compress = opts.compress == null ? 0.72 : opts.compress; fit(opts.fitAU || 36); }
		function setDate(d) { V.date = d; render(); }
		function set(o) { for (var kx in o) { if (kx === "show") for (var s2 in o.show) V.show[s2] = o.show[s2]; else V[kx] = o[kx]; } render(); }
		function setMode(m) { V.mode = m; V.zoom = m === "orrery" ? V.zoom : 1; if (m === "moon") { V.zoom = 1; } canvas.style.cursor = m === "orrery" ? "grab" : "default"; render(); }
		function png() { frame(tNow || 0); return canvas.toDataURL("image/png"); }

		prep();
		if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(canvas); else window.addEventListener("resize", resize);
		resize();
		if (V.mode === "orrery") fit(opts.fitAU || 36);
		return { V: V, set: set, setDate: setDate, setMode: setMode, fit: fit, reset: reset, render: render, resize: resize, png: png, pick: pick, zoomBy: function (f) { zoomBy(f, w / 2 + V.panX, h / 2 + V.panY); }, snap: function () { return snap || S.snapshot(V.date); }, size: function () { return { w: w, h: h }; } };
	}

	root.MESSolarView = { create: create, drawMoonPhase: drawMoonPhase };
})(typeof window !== "undefined" ? window : globalThis);
