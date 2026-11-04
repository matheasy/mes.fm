/* MES Spin Wave Field -- pure maths (no DOM). Browser global `MESSpinWave`; node: require('./tool_apps_src/spin-wave-field/lib.js');
 * tests: node tool_apps_src/spin-wave-field-tests.js
 * Geometry (all tabs): the wave travels along +x, the barrier with the slits stands at x = 0 across y, z is up. Lengths in metres
 * (the "crowd" is a field of people about a metre apart), angles in radians unless a name ends in Deg.
 * 1. Double slit by Huygens' principle: every point of each slit re-radiates a 2D cylindrical wavelet
 *    psi(P) = sum_s psi_inc(s) * ds * sqrt(1 / (lambda r)) * e^{i (k r - pi/4)} * (1 + cos theta) / 2   (Kirchhoff-Fresnel in 2D),
 *    so the far-field maxima sit at d sin(theta) = m lambda and the single-slit minima at a sin(theta) = m lambda.
 * 2. A "spin flipper" in slit 1 multiplies that slit's wave by e^{i s alpha}: s = 1/2 for a spin-1/2 particle (360 degrees gives -1,
 *    the fringes move by half a fringe; 720 degrees gives +1 again), s = 1 for an ordinary vector (360 degrees changes nothing).
 * 3. A driven 2D wave equation u_tt = c^2 lap u (leapfrog, absorbing sponge at the edges, walls with slits), with the energy flux
 *    S = -c^2 u_t grad u that carries tracer particles. */
(function (root) {
	"use strict";
	var TAU = 2 * Math.PI;

	/* ---------- small helpers ---------- */
	function rng(seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
	function linspace(a, b, n) { var r = []; for (var i = 0; i < n; i++) r.push(n === 1 ? a : a + (b - a) * i / (n - 1)); return r; }
	function cexp(ph) { return { re: Math.cos(ph), im: Math.sin(ph) }; }

	/* phase factor a flipper gives a path: spin-1/2 -> e^{i alpha/2}, vector -> e^{i alpha} */
	function spinFactor(alpha, s) { return cexp((s == null ? 0.5 : s) * alpha); }
	/* the two things a spin-1/2 "person" shows: the arrow turns by the full angle, the sign of the medium goes as cos(phi/2) */
	function spinLook(phi) { var a = ((phi % TAU) + TAU) % TAU; return { arrow: a, sign: Math.cos(phi / 2) >= 0 ? 1 : -1, half: Math.cos(phi / 2) }; }

	/* ====================================================== 1. Huygens double slit ====================================================== */
	/* o: lam, d (centre to centre), a (slit width), slits (1 | 2), src ('plane' | 'point'), srcX (< 0, point source position), n (points per slit),
	   alpha (flipper turn in slit 1, rad), s (0.5 spin / 1 vector) */
	function setup(o) {
		var lam = o.lam || 1, k = TAU / lam, slits = o.slits === 1 ? 1 : 2, d = o.d || 4, a = o.a || 1, n = Math.max(2, o.n || Math.ceil(a / lam * 8) + 4);
		var src = o.src === "point" ? "point" : "plane", xs = Math.min(-0.5, o.srcX == null ? -12 : o.srcX), fl = spinFactor(o.alpha || 0, o.s), pts = [];
		var centres = slits === 1 ? [0] : [d / 2, -d / 2], ds = a / n, norm = ds / Math.sqrt(lam);
		centres.forEach(function (yc, si) {
			for (var j = 0; j < n; j++) {
				var y = yc - a / 2 + (j + 0.5) * ds, inc = incident({ k: k, src: src, xs: xs }, 0, y), re = inc.re, im = inc.im;
				if (si === 0 && slits === 2) { var r2 = re * fl.re - im * fl.im; im = re * fl.im + im * fl.re; re = r2; }
				pts.push({ y: y, re: re * norm, im: im * norm, slit: si });
			}
		});
		return { lam: lam, k: k, d: d, a: a, slits: slits, src: src, xs: xs, pts: pts, centres: centres };
	}
	function incident(p, x, y) {
		if (p.src === "plane") return cexp(p.k * x);
		var r = Math.hypot(x - p.xs, y), amp = Math.sqrt(Math.abs(p.xs) / Math.max(r, 1e-6)); return { re: amp * Math.cos(p.k * r), im: amp * Math.sin(p.k * r) };
	}
	var C45 = Math.SQRT1_2;
	/* complex field at (x, y). Before the barrier: the incoming wave (the reflection is left out). Behind it: the Huygens sum. */
	function field(P, x, y) {
		if (x <= 0) return incident(P, x, y);
		var re = 0, im = 0, k = P.k, pts = P.pts;
		for (var i = 0; i < pts.length; i++) {
			var q = pts[i], dy = y - q.y, r = Math.sqrt(x * x + dy * dy), ob = 0.5 * (1 + x / r), w = ob / Math.sqrt(r), ph = k * r;
			var c = Math.cos(ph), s = Math.sin(ph), wr = (c * C45 + s * C45) * w, wi = (s * C45 - c * C45) * w;   // e^{i(kr - pi/4)}
			re += q.re * wr - q.im * wi; im += q.re * wi + q.im * wr;
		}
		return { re: re, im: im };
	}
	function intensity(P, x, y) { var f = field(P, x, y); return f.re * f.re + f.im * f.im; }
	function pattern(P, L, ys) { return ys.map(function (y) { return intensity(P, L, y); }); }
	/* local maxima / minima with a parabola through the three samples around each */
	function extrema(xs, v, kind) {
		var out = [], sg = kind === "min" ? -1 : 1;
		for (var i = 1; i < v.length - 1; i++) {
			var a = sg * v[i - 1], b = sg * v[i], c = sg * v[i + 1];
			if (b > a && b >= c) { var den = a - 2 * b + c, t = den !== 0 ? 0.5 * (a - c) / den : 0; out.push({ x: xs[i] + t * (xs[i + 1] - xs[i]), v: v[i] }); }
		}
		return out;
	}
	/* average spacing of the bright fringes nearest the middle of the screen (uses the n maxima closest to y = 0) */
	function fringeSpacing(P, L, half, nPts, nUse) {
		var ys = linspace(-half, half, nPts || 2001), I = pattern(P, L, ys), mx = extrema(ys, I, "max");
		if (mx.length < 2) return NaN;
		mx.sort(function (p, q) { return Math.abs(p.x) - Math.abs(q.x); }); var use = mx.slice(0, Math.min(nUse || 5, mx.length)).map(function (p) { return p.x; }).sort(function (p, q) { return p - q; });
		return (use[use.length - 1] - use[0]) / (use.length - 1);
	}
	/* textbook positions on a screen at distance L */
	function brightY(m, lam, d, L) { var s = m * lam / d; return Math.abs(s) >= 1 ? NaN : L * Math.tan(Math.asin(s)); }
	function singleMinY(m, lam, a, L) { var s = m * lam / a; return Math.abs(s) >= 1 ? NaN : L * Math.tan(Math.asin(s)); }
	function smallAngleSpacing(lam, d, L) { return lam * L / d; }
	/* two equal ideal slits, far away: I = cos^2(pi d sin th / lam + shift/2) * sinc^2(pi a sin th / lam) */
	function farField(th, o) {
		var s = Math.sin(th), b = Math.PI * (o.a || 0) * s / o.lam, env = Math.abs(b) < 1e-12 ? 1 : Math.pow(Math.sin(b) / b, 2);
		if (o.slits === 1) return env;
		var g = Math.PI * o.d * s / o.lam - (o.shift || 0) / 2; return env * Math.pow(Math.cos(g), 2);
	}
	/* where a fringe pattern sits relative to a reference, in fringes (0 = same, 0.5 = bright and dark swapped) */
	function fringeShift(alpha, s) { var x = ((s == null ? 0.5 : s) * alpha) / TAU; x = x - Math.floor(x); return x > 0.5 ? x - 1 : x; }

	/* sample hits (photons, people, ...) from a pattern: returns a function giving one bin index per call */
	function sampler(I, seed) {
		var cdf = new Float64Array(I.length), t = 0, r = rng(seed || 5);
		for (var i = 0; i < I.length; i++) { t += Math.max(0, I[i]); cdf[i] = t; }
		return function () { if (!(t > 0)) return -1; var u = r() * t, lo = 0, hi = I.length - 1; while (lo < hi) { var m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return lo; };
	}

	/* ====================================================== 2. a tiny 3D camera (z up) ====================================================== */
	function project(cam, x, y, z) {
		var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), x1 = x * c - y * s, y1 = x * s + y * c, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		var up = z * cp + y1 * sp, d = y1 * cp - z * sp, f = cam.F / (cam.F + d);
		return { x: cam.cx + x1 * cam.k * f, y: cam.cy - up * cam.k * f, d: d, f: f };
	}
	/* the floor point (z = 0) under a screen point, or null if the ray misses the floor */
	function unprojectFloor(cam, X, Y) {
		var a = (X - cam.cx) / cam.k, b = (cam.cy - Y) / cam.k, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), den = sp * cam.F - b * cp;
		if (Math.abs(den) < 1e-9) return null;
		var y1 = b * cam.F / den, f = cam.F / (cam.F + y1 * cp); if (!(f > 0)) return null;
		var x1 = a / f, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
		return { x: x1 * c + y1 * s, y: -x1 * s + y1 * c };
	}

	/* ====================================================== 3. driven 2D wave equation ====================================================== */
	/* nx x ny cells of size 1; o.c = wave speed (cells per unit time), o.sponge = absorbing border width (cells). Leapfrog with Courant number C = c dt <= 0.5. */
	function Wave2D(nx, ny, o) {
		o = o || {};
		var N = nx * ny, u = new Float32Array(N), up = new Float32Array(N), un = new Float32Array(N), wall = new Uint8Array(N), damp = new Float32Array(N);
		var c = o.c || 1, dt = (o.C || 0.5) / c, C2 = Math.pow(c * dt, 2), sw = o.sponge == null ? 14 : o.sponge, self = { nx: nx, ny: ny, u: u, up: up, wall: wall, c: c, dt: dt, t: 0, sources: [], omega: 0 };
		for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
			var e = Math.min(i, j, nx - 1 - i, ny - 1 - j), g = e < sw ? Math.pow((sw - e) / sw, 2) * 0.12 : 0;
			if (o.open === "left" && i < sw && j >= sw && j < ny - sw) g = Math.pow((sw - i) / sw, 2) * 0.12;
			damp[j * nx + i] = g;
		}
		self.step = function () {
			var t = self.t, s, i, j, k;
			for (j = 1; j < ny - 1; j++) for (i = 1; i < nx - 1; i++) {
				k = j * nx + i;
				if (wall[k]) { un[k] = 0; continue; }
				var lap = u[k - 1] + u[k + 1] + u[k - nx] + u[k + nx] - 4 * u[k];
				un[k] = u[k] + (u[k] - up[k]) * (1 - damp[k]) + C2 * lap;
			}
			for (s = 0; s < self.sources.length; s++) {
				var q = self.sources[s], ramp = Math.min(1, t / (q.ramp || 6)), v = q.amp * ramp * Math.sin(self.omega * t + (q.phase || 0)) * dt;
				for (var m = 0; m < q.cells.length; m++) { k = q.cells[m]; if (!wall[k]) un[k] += v; }
			}
			for (i = 0; i < nx; i++) { un[i] = 0; un[(ny - 1) * nx + i] = 0; }
			for (j = 0; j < ny; j++) { un[j * nx] = 0; un[j * nx + nx - 1] = 0; }
			var tmp = up; up = u; u = un; un = tmp; self.u = u; self.up = up; self.t += dt;
		};
		self.reset = function () { u.fill(0); up.fill(0); un.fill(0); self.t = 0; };
		/* complex amplitude estimate for a steady sinusoid: u = A cos(phi), u_t = -omega A sin(phi) */
		self.phaseAmp = function (k) { var v = (u[k] - up[k]) / dt, w = self.omega || 1; return { amp: Math.sqrt(u[k] * u[k] + v * v / (w * w)), phi: Math.atan2(-v / w, u[k]) }; };
		/* energy flux S = -c^2 u_t grad u and energy density E = (u_t^2 + c^2 |grad u|^2) / 2 at a point (bilinear) */
		self.flux = function (x, y) {
			var i = Math.floor(x), j = Math.floor(y); if (i < 1 || j < 1 || i >= nx - 2 || j >= ny - 2) return null;
			var fx = x - i, fy = y - j, Sx = 0, Sy = 0, E = 0, U = 0;
			[[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]].forEach(function (p) {
				var k = (j + p[1]) * nx + i + p[0], ut = (u[k] - up[k]) / dt, gx = (u[k + 1] - u[k - 1]) / 2, gy = (u[k + nx] - u[k - nx]) / 2;
				Sx += p[2] * -c * c * ut * gx; Sy += p[2] * -c * c * ut * gy; E += p[2] * 0.5 * (ut * ut + c * c * (gx * gx + gy * gy)); U += p[2] * u[k];
			});
			return { Sx: Sx, Sy: Sy, E: E, u: U };
		};
		self.energy = function () { var e = 0; for (var k = 0; k < N; k++) { var v = (u[k] - up[k]) / dt; e += 0.5 * v * v; if (k % nx < nx - 1) { var g = u[k + 1] - u[k]; e += 0.5 * c * c * g * g; } if (k + nx < N) { var g2 = u[k + nx] - u[k]; e += 0.5 * c * c * g2 * g2; } } return e; };
		return self;
	}
	/* wall across x = ix with openings: slits given as [centre j, width] in cells */
	function buildWall(w, ix, slits, thick) {
		w.wall.fill(0); if (ix == null) return;
		for (var t = 0; t < (thick || 2); t++) for (var j = 0; j < w.ny; j++) {
			var open = slits.some(function (s) { return Math.abs(j - s[0]) <= s[1] / 2; });
			if (!open) w.wall[j * w.nx + ix + t] = 1;
		}
	}

	var PRESETS = [
		{ id: "classic", name: "Classic double slit", lam: 2.5, d: 8, a: 1.2, slits: 2, src: "plane" },
		{ id: "wide", name: "Slits far apart (fine fringes)", lam: 2, d: 14, a: 1, slits: 2, src: "plane" },
		{ id: "close", name: "Slits close (wide fringes)", lam: 3, d: 5, a: 1, slits: 2, src: "plane" },
		{ id: "single", name: "One wide slit", lam: 2, d: 8, a: 6, slits: 1, src: "plane" },
		{ id: "point", name: "Point source (ripple tank)", lam: 2.5, d: 8, a: 1.2, slits: 2, src: "point" },
		{ id: "fat", name: "Wide slits: envelope", lam: 2, d: 9, a: 3.5, slits: 2, src: "plane" }
	];
	var SPIN_PRESETS = [
		{ id: "0", name: "No turn (0°)", deg: 0 }, { id: "180", name: "180°", deg: 180 }, { id: "360", name: "360°: one full turn", deg: 360 },
		{ id: "540", name: "540°", deg: 540 }, { id: "720", name: "720°: two full turns", deg: 720 }
	];
	var FIELD_PRESETS = [
		{ id: "dslit", name: "Plane wave + double slit", mode: "dslit" }, { id: "sslit", name: "Plane wave + single slit", mode: "sslit" },
		{ id: "one", name: "One point source", mode: "one" }, { id: "two", name: "Two point sources", mode: "two" }, { id: "two-anti", name: "Two sources, opposite phase", mode: "two", anti: true }
	];

	var api = { TAU: TAU, rng: rng, linspace: linspace, spinFactor: spinFactor, spinLook: spinLook, setup: setup, incident: incident, field: field, intensity: intensity, pattern: pattern,
		extrema: extrema, fringeSpacing: fringeSpacing, brightY: brightY, singleMinY: singleMinY, smallAngleSpacing: smallAngleSpacing, farField: farField, fringeShift: fringeShift,
		sampler: sampler, project: project, unprojectFloor: unprojectFloor, Wave2D: Wave2D, buildWall: buildWall, PRESETS: PRESETS, SPIN_PRESETS: SPIN_PRESETS, FIELD_PRESETS: FIELD_PRESETS };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESSpinWave = api;
})(this);

/* Spin Wave Field UI: a crowd that waves with a double-slit wave, the same crowd with a spin-1/2 flipper in one slit, and a 3D wave field with tracers.
   Maths: MESSpinWave (node-tested: tool_apps_src/spin-wave-field-tests.js). State: localStorage mes-spin-wave-field:v1; links ?tab=people|spin|field */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sw"); if (!root) return;
	var M = window.MESSpinWave, KEY = "mes-spin-wave-field:v1", TAU = Math.PI * 2, DEG = Math.PI / 180;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function mi(s) { return String(s).replace(/-/g, "−"); }
	function sg(x, d) { if (!isFinite(x)) return "–"; var a = Math.abs(x); return mi(a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(d == null ? 1 : d) : x.toFixed(d == null ? 2 : d)); }
	var q = new URLSearchParams(location.search), saved = sget(), toastT;
	function toast(msg) { var t = $("sw-toast"); if (!t) { t = document.createElement("div"); t.id = "sw-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function ro(box, items) { box.innerHTML = items.map(function (it) { return '<div class="sw-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function setPressed(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }
	function png(cv, name) { try { var a = document.createElement("a"); a.download = name + ".png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } }
	function copyLink(params) {
		var u = new URL(location.href); u.search = new URLSearchParams(params).toString(); u.hash = "";
		var s = u.toString(); try { history.replaceState(null, "", u); } catch (e) {}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(function () { toast("Link copied"); }, function () { toast(s); }); else toast(s);
	}
	function isFull(wrap) { return document.fullscreenElement === wrap || wrap.classList.contains("mes-fill"); }
	function fitStage(stage, natural) {
		var wrap = stage.parentNode, w = wrap.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
		wrap.setAttribute("data-mes-free", "1");
		var h = natural(w); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (isFull(wrap)) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(200, Math.round(h)); stage.style.width = w + "px"; stage.style.height = h + "px";
		var cv = stage.querySelector("canvas"), cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
		return { W: w, H: h, c: c, cv: cv };
	}
	Array.prototype.forEach.call(root.querySelectorAll(".sw-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".sw-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});
	var COL = { bg: "#070b14", grid: "#1c2436", axis: "#5d6a86", text: "#d6dcea", dim: "#8792aa", acc: "#60a5fa", hit: "#ffd166", warm: "#ff8c42", cold: "#4cc9f0", plus: "#3b82f6", minus: "#ef4444" };
	function txt(c, s, x, y, o) { o = o || {}; c.font = (o.b ? "600 " : "") + (o.size || 12) + "px system-ui,sans-serif"; c.fillStyle = o.col || COL.text; c.textAlign = o.al || "left"; c.textBaseline = o.bl || "alphabetic"; c.fillText(s, x, y); }

	/* ---------- colours: a phase wheel with brightness levels, and an up / down scale ---------- */
	var NH = 72, NL = 12, HUE = [];
	for (var hh = 0; hh < NH; hh++) for (var ll = 0; ll < NL; ll++) HUE.push("hsl(" + (hh * 360 / NH) + ",85%," + (10 + ll * 5) + "%)");
	function hueCol(ph, b) { var h = Math.floor((((ph / TAU) % 1) + 1) % 1 * NH) % NH, l = clamp(Math.round(b * (NL - 1)), 0, NL - 1); return HUE[h * NL + l]; }
	var DIV = []; for (var dv = 0; dv <= 40; dv++) { var v = dv / 20 - 1, a = Math.abs(v); DIV.push(v >= 0 ? "rgb(" + Math.round(40 + 215 * a) + "," + Math.round(40 + 110 * a) + "," + Math.round(50 + 10 * a) + ")" : "rgb(" + Math.round(40 + 20 * a) + "," + Math.round(50 + 110 * a) + "," + Math.round(60 + 195 * a) + ")"); }
	var HRGB = [];
	(function () { for (var h = 0; h < NH; h++) for (var l = 0; l < 24; l++) { var H = h / NH * 6, L = l / 23, S = 0.85, C2 = (1 - Math.abs(2 * L - 1)) * S, X = C2 * (1 - Math.abs(H % 2 - 1)), m = L - C2 / 2, r = 0, g = 0, b = 0, sx = Math.floor(H);
		if (sx === 0) { r = C2; g = X; } else if (sx === 1) { r = X; g = C2; } else if (sx === 2) { g = C2; b = X; } else if (sx === 3) { g = X; b = C2; } else if (sx === 4) { r = X; b = C2; } else { r = C2; b = X; }
		HRGB.push([Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]); } })();
	function hueRGB(ph, l) { var h = Math.floor((((ph / TAU) % 1) + 1) % 1 * NH) % NH; return HRGB[h * 24 + clamp(Math.round(l * 23), 0, 23)]; }
	var DRGB = []; for (var dq = 0; dq <= 40; dq++) { var vq = dq / 20 - 1, aq = Math.abs(vq); DRGB.push(vq >= 0 ? [Math.round(30 + 225 * aq), Math.round(32 + 118 * aq), Math.round(44 + 16 * aq)] : [Math.round(30 + 30 * aq), Math.round(36 + 124 * aq), Math.round(48 + 207 * aq)]); }
	function divRGB(v) { return DRGB[clamp(Math.round((v + 1) * 20), 0, 40)]; }
	function divCol(v) { return DIV[clamp(Math.round((v + 1) * 20), 0, 40)]; }
	function signCol(h) { var a = Math.abs(h); return h >= 0 ? "rgb(" + Math.round(90 - 30 * a) + "," + Math.round(110 + 20 * a) + "," + Math.round(140 + 105 * a) + ")" : "rgb(" + Math.round(140 + 99 * a) + "," + Math.round(110 - 42 * a) + "," + Math.round(120 - 52 * a) + ")"; }

	/* ---------- camera: orbit by drag, pinch / Ctrl + wheel zoom, click ---------- */
	function P(cam, x, y, z) { return M.project(cam, x, y, z); }
	function fitCam(cam, W, H, pts, top, bot, side) {
		cam.k = 1; cam.cx = 0; cam.cy = 0; var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
		pts.forEach(function (p) { var r = P(cam, p[0], p[1], p[2]); x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y); });
		var k0 = Math.min((W - 2 * side) / Math.max(1e-6, x1 - x0), (H - top - bot) / Math.max(1e-6, y1 - y0));
		var cx0 = W / 2 - k0 * (x0 + x1) / 2, cy0 = top + (H - top - bot) / 2 - k0 * (y0 + y1) / 2, z = cam.zoom || 1;
		cam.k = k0 * z; cam.cx = W / 2 + (cx0 - W / 2) * z; cam.cy = H / 2 + (cy0 - H / 2) * z;
	}
	function controls(cv, cam, changed, onClick) {
		var pts = {}, drag = null, pinch = null;
		function n() { return Object.keys(pts).length; }
		cv.addEventListener("pointerdown", function (e) {
			pts[e.pointerId] = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) {}
			if (n() === 1) drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, t: Date.now(), moved: 0 };
			else if (n() === 2) { var p = Object.keys(pts).map(function (k) { return pts[k]; }); pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), z: cam.zoom }; drag = null; }
		});
		cv.addEventListener("pointermove", function (e) {
			if (!pts[e.pointerId]) return; pts[e.pointerId] = { x: e.clientX, y: e.clientY };
			if (pinch && n() >= 2) { var p = Object.keys(pts).map(function (k) { return pts[k]; }), dd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); cam.zoom = clamp(pinch.z * dd / Math.max(10, pinch.d), 0.4, 6); changed(true); return; }
			if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
			if (drag.moved < 4) return;
			cam.yaw = drag.yaw + dx * 0.008; cam.pitch = clamp(drag.pitch + dy * 0.006, -0.1, 1.52); changed(false);
		});
		function end(e) {
			if (drag && drag.moved < 5 && Date.now() - drag.t < 500 && onClick) { var r = cv.getBoundingClientRect(); onClick(e.clientX - r.left, e.clientY - r.top); }
			delete pts[e.pointerId]; if (n() < 2) pinch = null; drag = null;
		}
		cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", function (e) { delete pts[e.pointerId]; drag = null; pinch = null; });
		cv.addEventListener("wheel", function (e) {
			var wrap = cv.closest(".sw-wrap"); if (!(e.ctrlKey || e.metaKey || isFull(wrap))) return;
			e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.4, 6); changed(true);
		}, { passive: false });
		cv.addEventListener("keydown", function (e) {
			var k = e.key; if (k === "ArrowLeft") cam.yaw -= 0.08; else if (k === "ArrowRight") cam.yaw += 0.08; else if (k === "ArrowUp") cam.pitch = clamp(cam.pitch + 0.06, -0.1, 1.52); else if (k === "ArrowDown") cam.pitch = clamp(cam.pitch - 0.06, -0.1, 1.52);
			else if (k === "+" || k === "=") cam.zoom = clamp(cam.zoom * 1.15, 0.4, 6); else if (k === "-") cam.zoom = clamp(cam.zoom / 1.15, 0.4, 6); else return; e.preventDefault(); changed(true);
		});
	}
	function slider(id, get, set, fmt) { var el = $(id), out = $(id + "-v"); el.value = get(); var show = function () { if (out) out.textContent = fmt(Number(el.value)); }; el.oninput = function () { set(Number(el.value)); show(); }; show(); return { el: el, show: show, set: function (v) { el.value = v; show(); } }; }

	/* ======================================================= tabs ======================================================= */
	var tab = /^(people|spin|field)$/.test(q.get("tab") || "") ? q.get("tab") : (/^(people|spin|field)$/.test(saved.tab || "") ? saved.tab : "people");
	function setTab(t, init) {
		var was = tab; tab = t;
		Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel.split(" ").indexOf(t) < 0; });
		Array.prototype.forEach.call(root.querySelectorAll("[data-only]"), function (p) { p.hidden = p.dataset.only !== t; });
		if (!init) { sset({ tab: t }); try { var u = new URL(location.href); u.search = t === "people" ? "" : "?tab=" + t; history.replaceState(null, "", u); } catch (e) {} }
		if (t !== "field" && (init || was !== t)) cBuild(true);
		if (t === "field" && !Fw) fBuild();
		setTimeout(onResize, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* ======================================================= 1 + 2. THE CROWD ======================================================= */
	var cs = saved.c || {}, phone = (window.innerWidth || 800) < 600;
	var C = { lam: num(q.get("lam"), 1, 6, num(cs.lam, 1, 6, 2.5)), d: num(q.get("d"), 2, 20, num(cs.d, 2, 20, 8)), a: num(q.get("a"), 0.3, 8, num(cs.a, 0.3, 8, 1.2)),
		n: num(q.get("n"), 1, 2, num(cs.n, 1, 2, 2)), L: num(q.get("L"), 16, 60, num(cs.L, 16, 60, 34)), src: (q.get("src") || cs.src) === "point" ? "point" : "plane",
		col: /^(phase|updown|plain)$/.test(q.get("col") || cs.col || "") ? (q.get("col") || cs.col) : "phase", crowd: /^(few|normal|big)$/.test(cs.crowd || "") ? cs.crowd : (phone ? "few" : "normal"), crowdPicked: /^(few|normal|big)$/.test(cs.crowd || ""),
		sp: num(cs.sp, 0.1, 3, 1), hr: num(cs.hr, 0, 600, 80), wave: cs.wave !== false, guides: cs.guides !== false,
		al: num(q.get("al"), 0, 1080, num(cs.al, 0, 1080, 360)), kind: q.get("s") === "1" ? "vec" : q.get("s") === "0.5" ? "half" : cs.kind === "vec" ? "vec" : "half", run: true, t: 0 };
	var XS = 12, HW = 22, BOARD_H = 6, FX = 3.4, NB = 110;
	var cam = { yaw: 0.6, pitch: 0.55, F: 80, zoom: 1, view: "crowd" };
	var VIEWS = { crowd: [0.6, 0.55], top: [0, 1.5], source: [Math.PI / 2, 0.32], screen: [-Math.PI / 2, 0.32] };
	if (saved.view && VIEWS[saved.view]) { cam.view = saved.view; cam.yaw = VIEWS[saved.view][0]; cam.pitch = VIEWS[saved.view][1]; }
	var W1 = null;                                             // the built world
	function cSave() { sset({ c: { lam: C.lam, d: C.d, a: C.a, n: C.n, L: C.L, src: C.src, col: C.col, crowd: C.crowdPicked ? C.crowd : undefined, sp: C.sp, hr: C.hr, wave: C.wave, guides: C.guides, al: C.al, kind: C.kind } }); }
	function sOf() { return C.kind === "vec" ? 1 : 0.5; }
	function alphaNow() { return tab === "spin" ? C.al * DEG : 0; }
	function setupFor(alpha, s) { return M.setup({ lam: C.lam, d: C.d, a: C.a, slits: C.n, src: C.src, srcX: -XS, alpha: alpha, s: s }); }
	function cBuild(keepHits) {
		var Pz = setupFor(alphaNow(), sOf()), step = C.crowd === "few" ? 2.1 : C.crowd === "big" ? 1.05 : 1.45, spin = tab === "spin" && C.n === 2;
		var px = [], py = [], re = [], im = [], x, y, f;
		for (x = -XS + 1.2; x <= C.L - 0.8; x += step) {
			if (Math.abs(x) < 0.9) continue;
			for (y = -HW + step / 2; y <= HW; y += step) {
				if (spin && x > 0 && x < FX + 0.3 && Math.abs(y - C.d / 2) < 1.8) continue;      // the flipper's own people stand there
				f = M.field(Pz, x, y); px.push(x); py.push(y); re.push(f.re); im.push(f.im);
			}
		}
		var amps = []; for (var i = 0; i < px.length; i++) if (px[i] > 2) amps.push(Math.hypot(re[i], im[i])); amps.sort(function (p, r) { return p - r; });
		var norm = 1 / Math.max(1e-9, amps[Math.floor(amps.length * 0.95)] || 1);
		/* floor: a small texture (the wave at every few centimetres), drawn onto the floor in perspective; plain floor = big tiles */
		var gs = 2, gx = Math.ceil((C.L + XS) / gs), gy = Math.ceil(2 * HW / gs), tpm = clamp(6 / C.lam, 1.6, phone ? 2.6 : 4), tw = Math.ceil((C.L + XS) * tpm), th = Math.ceil(2 * HW * tpm), fre = new Float32Array(tw * th), fim = new Float32Array(tw * th);
		for (var j = 0; j < th; j++) for (i = 0; i < tw; i++) { var ff = M.field(Pz, -XS + (i + 0.5) / tpm, -HW + (j + 0.5) / tpm); fre[j * tw + i] = ff.re; fim[j * tw + i] = ff.im; }
		var tex = W1 && W1.tex && W1.tex.width === tw && W1.tex.height === th ? W1.tex : document.createElement("canvas"); tex.width = tw; tex.height = th;
		var tctx = tex.getContext("2d"), timg = tctx.createImageData(tw, th);
		/* the board */
		var by = M.linspace(-HW + HW / NB, HW - HW / NB, NB), Ib = M.pattern(Pz, C.L, by), Ib0 = null, Ibv = null;
		if (tab === "spin") { Ib0 = M.pattern(setupFor(0, sOf()), C.L, by); Ibv = M.pattern(setupFor(C.al * DEG, sOf() === 0.5 ? 1 : 0.5), C.L, by); }
		var sp = C.n === 2 ? M.fringeSpacing(Pz, C.L, HW * 0.8, 1601, 5) : NaN;
		var hits = keepHits && W1 && W1.hits.length === NB && W1.sig === sigOf() ? W1.hits : new Float64Array(NB), tot = keepHits && W1 && W1.sig === sigOf() ? W1.tot : 0;
		W1 = { P: Pz, px: px, py: py, re: re, im: im, norm: norm, gs: gs, gx: gx, gy: gy, fre: fre, fim: fim, tw: tw, th: th, tpm: tpm, tex: tex, tctx: tctx, timg: timg, by: by, Ib: Ib, Ib0: Ib0, Ibv: Ibv, sp: sp, hits: hits, tot: tot,
			sampler: M.sampler(Ib, 11 + Math.floor(Math.random() * 1000)), flash: [], sig: sigOf(), camKey: "" };
		cSave(); cNote(); cReadouts();
	}
	function sigOf() { return [C.lam, C.d, C.a, C.n, C.L, C.src, tab === "spin" ? C.al : 0, C.kind, tab].join("|"); }
	/* geometry seen by the camera (redone when the camera or world changes) */
	function cCamera(S) {
		var wd = W1, key = [S.W, S.H, cam.yaw, cam.pitch, cam.zoom, wd.sig, wd.px.length].join("|"); if (wd.camKey === key) return; wd.camKey = key;
		fitCam(cam, S.W, S.H, [[-XS, -HW, 0], [-XS, HW, 0], [C.L + 1, -HW, 0], [C.L + 1, HW, 0], [C.L + 1, -HW, BOARD_H], [C.L + 1, HW, BOARD_H], [-XS, 0, 2.5], [0, 0, 2.6]], 40, 14, 12);
		var n = wd.px.length, fx = new Float32Array(n), fy = new Float32Array(n), ff = new Float32Array(n), items = [], i, p;
		for (i = 0; i < n; i++) { p = P(cam, wd.px[i], wd.py[i], 0); fx[i] = p.x; fy[i] = p.y; ff[i] = p.f; items.push({ d: p.d, t: 0, i: i }); }
		var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
		wd.side = [-s * cam.k, -c * spp * cam.k]; wd.upv = [0, -cp * cam.k]; wd.fx = fx; wd.fy = fy; wd.ff = ff;
		/* floor vertices */
		var vx = new Float32Array((wd.gx + 1) * (wd.gy + 1)), vy = new Float32Array(vx.length);
		for (var j = 0; j <= wd.gy; j++) for (i = 0; i <= wd.gx; i++) { p = P(cam, -XS + i * wd.gs, -HW + j * wd.gs, 0); vx[j * (wd.gx + 1) + i] = p.x; vy[j * (wd.gx + 1) + i] = p.y; }
		wd.vx = vx; wd.vy = vy;
		var NPX = 16, NPY = 14, pv = []; for (j = 0; j <= NPY; j++) for (i = 0; i <= NPX; i++) { p = P(cam, -XS + i * (C.L + XS) / NPX, -HW + j * 2 * HW / NPY, 0); pv.push([p.x, p.y]); } wd.pv = pv; wd.NPX = NPX; wd.NPY = NPY;
		/* wall pieces (the gaps are the slits) */
		var cuts = C.n === 2 ? [[-C.d / 2 - C.a / 2, -C.d / 2 + C.a / 2], [C.d / 2 - C.a / 2, C.d / 2 + C.a / 2]] : [[-C.a / 2, C.a / 2]], segs = [], y0 = -HW;
		cuts.sort(function (u, v) { return u[0] - v[0]; }).forEach(function (cu) { if (cu[0] > y0) segs.push([y0, cu[0]]); y0 = Math.max(y0, cu[1]); }); if (y0 < HW) segs.push([y0, HW]);
		wd.segs = segs;
		/* a wall piece is cut into metre lengths so the painter's order stays right with people on both sides */
		segs.forEach(function (sg2, k) { for (var y = sg2[0]; y < sg2[1] - 1e-9; y += 1.5) { var y1 = Math.min(sg2[1], y + 1.5); items.push({ d: P(cam, 0, (y + y1) / 2, 1.3).d, t: 1, y0: y, y1: y1 }); } });
		items.push({ d: P(cam, C.L + 1, 0, BOARD_H / 2).d + 6, t: 2 });
		items.push({ d: P(cam, -XS, 0, 0.3).d, t: 4 });
		if (tab === "spin" && C.n === 2) for (i = 0; i < 6; i++) { var x = 0.55 + i * (FX - 0.8) / 5; items.push({ d: P(cam, x, C.d / 2, 0).d, t: 3, i: i, x: x }); }
		items.sort(function (u, v) { return v.d - u.d; }); wd.items = items;
		/* board columns */
		var bx = [], bb = [], bt = [];
		for (i = 0; i <= NB; i++) { var yy = -HW + i * 2 * HW / NB, a0 = P(cam, C.L + 1, yy, 0.15), a1 = P(cam, C.L + 1, yy, BOARD_H); bx.push(yy); bb.push([a0.x, a0.y]); bt.push([a1.x, a1.y]); }
		wd.bb = bb; wd.bt = bt;
	}
	var cStage = $("sw-c-stage"), cCv = $("sw-c-c"), cSz = null;
	function cResize() { cSz = fitStage(cStage, function (w) { return clamp(w * 0.6, 330, 680); }); if (W1) W1.camKey = ""; cDraw(); }
	function boardPt(wd, y, h) { var t = clamp((y + HW) / (2 * HW) * NB, 0, NB), i = Math.min(NB - 1, Math.floor(t)), f = t - i, b0 = wd.bb[i], b1 = wd.bb[i + 1], t0 = wd.bt[i], t1 = wd.bt[i + 1];
		var bx = b0[0] + (b1[0] - b0[0]) * f, byy = b0[1] + (b1[1] - b0[1]) * f, tx = t0[0] + (t1[0] - t0[0]) * f, ty = t0[1] + (t1[1] - t0[1]) * f; return [bx + (tx - bx) * h, byy + (ty - byy) * h]; }
	function cDraw() {
		if (!cSz || !W1 || tab === "field") return; var S = cSz, c = S.c, wd = W1, i, j;
		cCamera(S); c.fillStyle = COL.bg; c.fillRect(0, 0, S.W, S.H);
		var om = TAU, ct = Math.cos(om * C.t), st = Math.sin(om * C.t), norm = wd.norm, gx = wd.gx;
		/* floor */
		if (C.wave) { paintTex(wd, ct, st); drawTex(c, wd); }
		else for (j = 0; j < wd.gy; j++) for (i = 0; i < gx; i++) {
			var a = j * (gx + 1) + i, b = a + 1, d = a + gx + 1, e = d + 1;
			c.fillStyle = (i + j) % 2 ? "#141b2b" : "#111726"; c.beginPath(); c.moveTo(wd.vx[a], wd.vy[a]); c.lineTo(wd.vx[b], wd.vy[b]); c.lineTo(wd.vx[e], wd.vy[e]); c.lineTo(wd.vx[d], wd.vy[d]); c.closePath(); c.fill();
		}
		/* guides on the floor: d sin(theta) = m lambda */
		if (C.guides) { c.save(); c.setLineDash([5, 5]); c.lineWidth = 1.2; c.strokeStyle = "rgba(255,255,255,0.45)";
			for (var m = -6; m <= 6; m++) { var yb = C.n === 2 ? M.brightY(m, C.lam, C.d, C.L) : (m === 0 ? NaN : M.singleMinY(m, C.lam, C.a, C.L)); if (!isFinite(yb) || Math.abs(yb) > HW) continue;
				var p0 = P(cam, 0.3, 0, 0.02), p1 = P(cam, C.L + 1, yb, 0.02); c.strokeStyle = C.n === 2 ? "rgba(255,255,255,0.45)" : "rgba(255,120,120,0.55)"; c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke(); }
			c.restore(); }
		/* everything that stands up, far to near */
		var side = wd.side, upv = wd.upv;
		wd.items.forEach(function (it) {
			if (it.t === 0) person(c, wd, it.i, ct, st, side, upv);
			else if (it.t === 1) wallPiece(c, it.y0, it.y1);
			else if (it.t === 2) board(c, wd);
			else if (it.t === 3) flipPerson(c, wd, it.i, it.x, side, upv);
			else source(c);
		});
		if (tab === "spin" && C.n === 2) { flipper(c); flipInset(c, S.W, S.H); }
		else txt(c, tab === "spin" ? "Slit 1 (top) has the flipper: α = " + Math.round(C.al) + "°" : (C.n === 2 ? "Two slits" : "One slit") + " · λ = " + sg(C.lam) + " m", 10, S.H - 10, { col: COL.dim, size: 11 });
	}
	function paintTex(wd, ct, st) {
		var D = wd.timg.data, n = wd.tw * wd.th, nm = wd.norm, ph0 = TAU * C.t, phase = C.col === "phase";
		for (var k = 0; k < n; k++) {
			var re = wd.fre[k], im = wd.fim[k], u = (re * ct + im * st) * nm, amp = Math.sqrt(re * re + im * im) * nm, o = k * 4, rgb;
			if (phase) { var l = 0.1 + 0.48 * Math.min(1, amp) * (0.6 + 0.4 * u / Math.max(amp, 1e-9)); rgb = hueRGB(Math.atan2(im, re) - ph0, l); }
			else rgb = divRGB(clamp(u, -1, 1) * 0.8);
			D[o] = rgb[0]; D[o + 1] = rgb[1]; D[o + 2] = rgb[2]; D[o + 3] = 255;
		}
		wd.tctx.putImageData(wd.timg, 0, 0);
	}
	function tri(c, img, s0, s1, s2, d0, d1, d2) {
		var gx = (d0[0] + d1[0] + d2[0]) / 3, gy = (d0[1] + d1[1] + d2[1]) / 3, g = function (p) { var dx = p[0] - gx, dy = p[1] - gy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.7, p[1] + dy / l * 0.7]; };
		var e0 = g(d0), e1 = g(d1), e2 = g(d2);
		c.save(); c.beginPath(); c.moveTo(e0[0], e0[1]); c.lineTo(e1[0], e1[1]); c.lineTo(e2[0], e2[1]); c.closePath(); c.clip();
		var x0 = s0[0], y0 = s0[1], x1 = s1[0], y1 = s1[1], x2 = s2[0], y2 = s2[1], den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(den) < 1e-9) { c.restore(); return; }
		var ux = d1[0] - d0[0], uy = d1[1] - d0[1], vx = d2[0] - d0[0], vy = d2[1] - d0[1], sx1 = x1 - x0, sy1 = y1 - y0, sx2 = x2 - x0, sy2 = y2 - y0;
		var a = (ux * sy2 - vx * sy1) / den, b = (uy * sy2 - vy * sy1) / den, cc = (vx * sx1 - ux * sx2) / den, d = (vy * sx1 - uy * sx2) / den;
		c.transform(a, b, cc, d, d0[0] - a * x0 - cc * y0, d0[1] - b * x0 - d * y0); c.drawImage(img, 0, 0); c.restore();
	}
	function drawTex(c, wd) {
		var NPX = wd.NPX, NPY = wd.NPY, pv = wd.pv, sx = wd.tw / NPX, sy = wd.th / NPY;
		c.imageSmoothingEnabled = true;
		for (var j = 0; j < NPY; j++) for (var i = 0; i < NPX; i++) {
			var a = pv[j * (NPX + 1) + i], b = pv[j * (NPX + 1) + i + 1], d = pv[(j + 1) * (NPX + 1) + i], e = pv[(j + 1) * (NPX + 1) + i + 1];
			var A = [i * sx, j * sy], B = [(i + 1) * sx, j * sy], Dd = [i * sx, (j + 1) * sy], E = [(i + 1) * sx, (j + 1) * sy];
			tri(c, wd.tex, A, B, E, a, b, e); tri(c, wd.tex, A, E, Dd, a, e, d);
		}
	}
	function person(c, wd, i, ct, st, side, upv) {
		var f = wd.ff[i], x0 = wd.fx[i], y0 = wd.fy[i], re = wd.re[i], im = wd.im[i], amp = Math.min(1.25, Math.hypot(re, im) * wd.norm), u = clamp((re * ct + im * st) * wd.norm, -1.2, 1.2);
		var ux = upv[0] * f, uy = upv[1] * f, sx = side[0] * f, sy = side[1] * f, col;
		if (C.col === "phase") col = hueCol(Math.atan2(im, re) - TAU * C.t, 0.2 + 0.4 * Math.min(1, amp));
		else if (C.col === "updown") col = divCol(clamp(u, -1, 1));
		else col = "#8b93a7";
		var hipX = x0 + ux * 0.85, hipY = y0 + uy * 0.85, shX = x0 + ux * 1.38, shY = y0 + uy * 1.38, lw = Math.max(1, 0.4 * f * Math.abs(upv[1]) * 0.9);
		c.lineCap = "round";
		/* legs */
		c.strokeStyle = "#3a4154"; c.lineWidth = lw * 0.5; c.beginPath(); c.moveTo(x0 + sx * 0.13, y0 + sy * 0.13); c.lineTo(hipX, hipY); c.moveTo(x0 - sx * 0.13, y0 - sy * 0.13); c.lineTo(hipX, hipY); c.stroke();
		/* body */
		c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(shX, shY); c.stroke();
		/* arms: raised by the wave */
		var be = u * 1.15, ca = Math.cos(be) * 0.62, sa = Math.sin(be) * 0.62;
		c.strokeStyle = col; c.lineWidth = lw * 0.38; c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX + sx * ca + ux * sa, shY + sy * ca + uy * sa); c.moveTo(shX, shY); c.lineTo(shX - sx * ca + ux * sa, shY - sy * ca + uy * sa); c.stroke();
		/* head */
		c.fillStyle = "#e9c9a7"; c.beginPath(); c.arc(x0 + ux * 1.62, y0 + uy * 1.62, Math.max(0.8, 0.17 * f * Math.abs(upv[1])), 0, TAU); c.fill();
	}
	function quad(c, pts, fill, stroke) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); } }
	function wallPiece(c, y0, y1) {
		var h = 2.6, t = 0.25, A = function (x, y, z) { return P(cam, x, y, z); };
		var front = [A(-t, y0, 0), A(-t, y1, 0), A(-t, y1, h), A(-t, y0, h)], back = [A(t, y0, 0), A(t, y1, 0), A(t, y1, h), A(t, y0, h)], top = [A(-t, y0, h), A(-t, y1, h), A(t, y1, h), A(t, y0, h)];
		var sd = Math.cos(cam.yaw) > 0 ? front : back; quad(c, sd, "#5b6478", "#2f3646"); quad(c, top, "#7d879c", "#2f3646");
		var e0 = [A(-t, y0, 0), A(t, y0, 0), A(t, y0, h), A(-t, y0, h)], e1 = [A(-t, y1, 0), A(t, y1, 0), A(t, y1, h), A(-t, y1, h)];
		quad(c, Math.sin(cam.yaw) > 0 ? e0 : e1, "#4a5266", "#2f3646");
	}
	function source(c) {
		if (C.src === "plane") { var a = P(cam, -XS, -HW, 0), b = P(cam, -XS, HW, 0), a1 = P(cam, -XS, -HW, 0.7), b1 = P(cam, -XS, HW, 0.7); quad(c, [a, b, b1, a1], "rgba(96,165,250,0.55)", "#60a5fa"); }
		else { var p = P(cam, -XS, 0, 0), t = P(cam, -XS, 0, 2.4); c.strokeStyle = "#60a5fa"; c.lineWidth = 3; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(t.x, t.y); c.stroke(); c.fillStyle = "#bfdbfe"; c.beginPath(); c.arc(t.x, t.y, Math.max(3, 0.35 * cam.k * t.f), 0, TAU); c.fill(); }
		var l = P(cam, -XS, C.src === "plane" ? HW * 0.6 : 0, C.src === "plane" ? 1.1 : 3); txt(c, "source", l.x, l.y, { col: "#bfdbfe", size: 11, al: "center" });
	}
	function board(c, wd) {
		var bb = wd.bb, bt = wd.bt, n = NB;
		c.beginPath(); c.moveTo(bb[0][0], bb[0][1]); c.lineTo(bb[n][0], bb[n][1]); c.lineTo(bt[n][0], bt[n][1]); c.lineTo(bt[0][0], bt[0][1]); c.closePath(); c.fillStyle = "rgba(20,26,40,0.92)"; c.fill(); c.strokeStyle = "#3a4560"; c.lineWidth = 1; c.stroke();
		var mx = 0, i; for (i = 0; i < n; i++) mx = Math.max(mx, wd.hits[i]);
		if (mx > 0) for (i = 0; i < n; i++) { var h = wd.hits[i] / mx * 0.92; if (h <= 0) continue; var p0 = boardPt(wd, -HW + i * 2 * HW / n + 0.02, 0), p1 = boardPt(wd, -HW + (i + 1) * 2 * HW / n - 0.02, 0), p2 = boardPt(wd, -HW + (i + 1) * 2 * HW / n - 0.02, h), p3 = boardPt(wd, -HW + i * 2 * HW / n + 0.02, h);
			c.fillStyle = "rgba(255,209,102,0.85)"; c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p3[0], p3[1]); c.closePath(); c.fill(); }
		var im = 0; for (i = 0; i < n; i++) im = Math.max(im, wd.Ib[i]);
		c.strokeStyle = "#e8ecf5"; c.lineWidth = 1.6; c.beginPath(); for (i = 0; i < n; i++) { var q2 = boardPt(wd, wd.by[i], wd.Ib[i] / im * 0.92); if (i) c.lineTo(q2[0], q2[1]); else c.moveTo(q2[0], q2[1]); } c.stroke();
		var now = performance.now(); wd.flash = wd.flash.filter(function (fh) { return now - fh.t < 600; });
		wd.flash.forEach(function (fh) { var p = boardPt(wd, fh.y, 0.02 + 0.06 * Math.random()), a = 1 - (now - fh.t) / 600; c.fillStyle = "rgba(255,255,220," + a.toFixed(2) + ")"; c.beginPath(); c.arc(p[0], p[1], 2.5, 0, TAU); c.fill(); });
		var l = boardPt(wd, 0, 1.08); txt(c, "board: " + Math.round(wd.tot).toLocaleString("en-US") + " hits", l[0], l[1], { col: COL.hit, size: 11, al: "center", b: 1 });
	}
	function flipAngle(i) { return C.al * DEG * i / 5; }
	function flipPerson(c, wd, i, x, side, upv) {
		var p = P(cam, x, C.d / 2, 0), f = p.f, ux = upv[0] * f, uy = upv[1] * f, sx = side[0] * f, sy = side[1] * f, a = flipAngle(i), h = Math.cos(a / 2), col = signCol(h);
		var lw = Math.max(1.5, 0.48 * f * Math.abs(upv[1]) * 0.9), shX = p.x + ux * 1.38, shY = p.y + uy * 1.38;
		c.lineCap = "round"; c.strokeStyle = "#3a4154"; c.lineWidth = lw * 0.5; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + ux * 0.85, p.y + uy * 0.85); c.stroke();
		c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(p.x + ux * 0.85, p.y + uy * 0.85); c.lineTo(shX, shY); c.stroke();
		c.fillStyle = "#e9c9a7"; c.beginPath(); c.arc(p.x + ux * 1.62, p.y + uy * 1.62, Math.max(1, 0.18 * f * Math.abs(upv[1])), 0, TAU); c.fill();
		/* the spin arrow above the head, turned by the angle about the beam (x) axis */
		var bx = p.x + ux * 2.25, by = p.y + uy * 2.25, L = 0.75, ex = bx + (sx * Math.sin(a) + ux * Math.cos(a)) * L, ey = by + (sy * Math.sin(a) + uy * Math.cos(a)) * L;
		var x0 = bx - (ex - bx), y0 = by - (ey - by), ang = Math.atan2(ey - y0, ex - x0), hd = Math.max(5, 0.3 * f * Math.abs(upv[1]));
		c.strokeStyle = c.fillStyle = "#fde68a"; c.lineWidth = Math.max(1.5, lw * 0.35); c.beginPath(); c.moveTo(x0, y0); c.lineTo(ex, ey); c.stroke();
		c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - hd * Math.cos(ang - 0.45), ey - hd * Math.sin(ang - 0.45)); c.lineTo(ex - hd * Math.cos(ang + 0.45), ey - hd * Math.sin(ang + 0.45)); c.closePath(); c.fill();
	}
	/* close-up of the people inside the flipper (2D, bottom left of the picture) */
	function flipInset(c, W, H) {
		var w = Math.min(360, Math.max(230, W * 0.56)), h = Math.min(122, H * 0.28), x0 = 8, y0 = H - h - 8, n = 6, step = w / n;
		c.fillStyle = "rgba(10,14,24,0.9)"; c.strokeStyle = "#f59e0b"; c.lineWidth = 1; c.beginPath(); c.rect(x0 + 0.5, y0 + 0.5, w, h); c.fill(); c.stroke();
		txt(c, w < 300 ? "In the flipper: arrow = turn, colour = sign" : "Inside the flipper: arrow = turn, colour = sign cos(α/2)", x0 + 6, y0 + 14, { col: "#fbbf24", size: w < 300 ? 10 : 11, b: 1 });
		for (var i = 0; i < n; i++) {
			var a = flipAngle(i), hh = Math.cos(a / 2), cx = x0 + step * (i + 0.5), base = y0 + h - 16, sc = Math.min(1, h / 120), col = signCol(hh);
			c.lineCap = "round"; c.strokeStyle = col; c.lineWidth = 7 * sc; c.beginPath(); c.moveTo(cx, base); c.lineTo(cx, base - 30 * sc); c.stroke();
			c.fillStyle = "#e9c9a7"; c.beginPath(); c.arc(cx, base - 38 * sc, 6 * sc, 0, TAU); c.fill();
			var ay = base - 64 * sc, L = 17 * sc, ex = cx + Math.sin(a) * L, ey = ay - Math.cos(a) * L, sx = cx - Math.sin(a) * L, sy = ay + Math.cos(a) * L, an = Math.atan2(ey - sy, ex - sx);
			c.strokeStyle = c.fillStyle = "#fde68a"; c.lineWidth = 2.2; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke(); c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - 7 * Math.cos(an - 0.45), ey - 7 * Math.sin(an - 0.45)); c.lineTo(ex - 7 * Math.cos(an + 0.45), ey - 7 * Math.sin(an + 0.45)); c.closePath(); c.fill();
			txt(c, Math.round(a / DEG) + "°", cx, base + 12, { col: hh >= 0 ? "#93c5fd" : "#fca5a5", size: 10, al: "center", b: 1 });
		}
	}
	function flipper(c) {
		c.save(); c.globalAlpha = 0.7; c.strokeStyle = "#f59e0b"; c.lineWidth = 1.6;
		for (var r = 0; r < 7; r++) { var x = 0.35 + r * (FX - 0.4) / 6; c.beginPath(); for (var k = 0; k <= 24; k++) { var a = k / 24 * TAU, p = P(cam, x, C.d / 2 + 1.5 * Math.cos(a), 1.5 + 1.5 * Math.sin(a)); if (k) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); } c.stroke(); }
		c.restore(); var l = P(cam, FX / 2, C.d / 2, 3.4); txt(c, "spin flipper", l.x, l.y, { col: "#fbbf24", size: 11, b: 1, al: "center" });
	}
	/* the brightness plot under the crowd */
	var pStage = $("sw-p-stage"), pSz = null;
	function pResize() { pSz = fitStage(pStage, function (w) { return w < 520 ? 250 : 230; }); pDraw(); }
	function niceStep(range, n) { var s = range / n, p = Math.pow(10, Math.floor(Math.log10(s))), f = s / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
	function pDraw() {
		if (!pSz || !W1 || tab === "field") return; var c = pSz.c, W = pSz.W, H = pSz.H, wd = W1, i;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var dial = tab === "spin" && W >= 480, r = { x: dial ? 150 : 14, y: 26, w: W - (dial ? 164 : 28), h: H - 52 };
		var X = function (y) { return r.x + (y + HW) / (2 * HW) * r.w; }, Y = function (v) { return r.y + r.h - v * r.h; };
		c.strokeStyle = COL.grid; c.lineWidth = 1; var st = niceStep(2 * HW, Math.max(2, Math.floor(r.w / 70)));
		c.font = "11px system-ui,sans-serif"; c.fillStyle = COL.dim; c.textAlign = "center"; c.textBaseline = "top";
		for (var t = Math.ceil(-HW / st) * st; t <= HW; t += st) { c.beginPath(); c.moveTo(X(t) + 0.5, r.y); c.lineTo(X(t) + 0.5, r.y + r.h); c.stroke(); c.fillText(mi(String(+t.toPrecision(4))) + " m", X(t), r.y + r.h + 3); }
		c.strokeStyle = COL.axis; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
		var mx = 0; for (i = 0; i < NB; i++) mx = Math.max(mx, wd.hits[i]);
		if (mx > 0) { var bw = r.w / NB; c.fillStyle = "rgba(255,209,102,0.55)"; for (i = 0; i < NB; i++) { var h = wd.hits[i] / mx; c.fillRect(r.x + i * bw + 0.5, Y(h), Math.max(1, bw - 1), r.y + r.h - Y(h)); } }
		if (C.guides) { c.save(); c.setLineDash([4, 4]); for (var m = -8; m <= 8; m++) { var yb = C.n === 2 ? M.brightY(m, C.lam, C.d, C.L) : (m ? M.singleMinY(m, C.lam, C.a, C.L) : NaN); if (!isFinite(yb) || Math.abs(yb) > HW) continue;
			c.strokeStyle = C.n === 2 ? "rgba(255,255,255,0.35)" : "rgba(255,120,120,0.6)"; c.beginPath(); c.moveTo(X(yb), r.y); c.lineTo(X(yb), r.y + r.h); c.stroke(); if (Math.abs(m) <= 3) { c.setLineDash([]); txt(c, "m=" + mi(String(m)), X(yb) + 2, r.y + 11, { col: COL.dim, size: 10 }); c.setLineDash([4, 4]); } } c.restore(); }
		function curve(arr, col, w, dash) { var a = 0; for (var k = 0; k < NB; k++) a = Math.max(a, arr[k]); if (!(a > 0)) return; c.save(); c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (k = 0; k < NB; k++) { var x = X(wd.by[k]), y = Y(arr[k] / a); if (k) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); c.restore(); }
		if (tab === "spin" && wd.Ib0) { curve(wd.Ib0, "#94a3b8", 1.5, [6, 4]); curve(wd.Ibv, "#c4b5fd", 1.3, [2, 3]); }
		curve(wd.Ib, "#e8ecf5", 2);
		var title = W < 560 ? (tab === "spin" ? "Now (white) · no flipper (grey) · " + (C.kind === "half" ? "vector" : "spin ½") + " (violet)" : "Board: wave sum (line), hits (bars)")
			: tab === "spin" ? "Board brightness: now (white), no flipper (grey dashes), " + (C.kind === "half" ? "an ordinary vector" : "a spin-½ particle") + " (violet dots)" : "Brightness across the board: wave sum (line) and counted hits (bars)";
		txt(c, title, r.x + 4, 16, { col: COL.text, size: 11, b: 1 });
		if (dial) spinDial(c, 72, r.y + r.h / 2 + 4, Math.min(52, r.h / 2 - 6));
	}
	function spinDial(c, cx, cy, R) {
		var a = C.al * DEG, h = Math.cos(a / 2), col = signCol(h);
		c.lineWidth = 6; c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
		c.lineWidth = 1; c.strokeStyle = "#334155"; c.beginPath(); c.arc(cx, cy, R - 8, 0, TAU); c.stroke();
		var ex = cx + Math.sin(a) * (R - 12), ey = cy - Math.cos(a) * (R - 12), ang = Math.atan2(ey - cy, ex - cx);
		c.strokeStyle = c.fillStyle = "#fde68a"; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke(); c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - 10 * Math.cos(ang - 0.45), ey - 10 * Math.sin(ang - 0.45)); c.lineTo(ex - 10 * Math.cos(ang + 0.45), ey - 10 * Math.sin(ang + 0.45)); c.closePath(); c.fill();
		txt(c, "arrow " + Math.round(((C.al % 360) + 360) % 360) + "°", cx, cy - R - 10, { col: "#fde68a", size: 11, al: "center", b: 1 });
		txt(c, "sign cos(α/2) = " + mi(h.toFixed(2)), cx, cy + R + 18, { col: h >= 0 ? "#93c5fd" : "#fca5a5", size: 11, al: "center", b: 1 });
	}
	function factorText(alpha, s) { var f = M.spinFactor(alpha, s), re = Math.abs(f.re) < 1e-9 ? 0 : f.re, im = Math.abs(f.im) < 1e-9 ? 0 : f.im;
		if (im === 0) return re > 0 ? "+1" : "−1"; if (re === 0) return im > 0 ? "+i" : "−i"; return mi(re.toFixed(2)) + (im >= 0 ? " + " : " − ") + Math.abs(im).toFixed(2) + "i"; }
	function cReadouts() {
		if (!W1) return; var wd = W1, box = $("sw-c-ro"), th1 = Math.asin(Math.min(1, C.lam / C.d)) / DEG;
		if (tab === "spin") {
			var a = C.al * DEG, s = sOf(), sh = M.fringeShift(a, s), mx = 0, mid = wd.Ib[Math.floor(NB / 2)] + wd.Ib[Math.ceil(NB / 2 - 1)];
			for (var i = 0; i < NB; i++) mx = Math.max(mx, wd.Ib[i]);
			ro(box, [
				{ l: "Flipper turn α", v: Math.round(C.al) + "°", s: sg(C.al / 360, 2) + " turns" },
				{ l: "Arrow direction", v: Math.round(((C.al % 360) + 360) % 360) + "°", s: "what you would see" },
				{ l: "Sign of the medium", v: (Math.cos(a / 2) >= 0 ? "+" : "−") + "  (" + mi(Math.cos(a / 2).toFixed(2)) + ")", c: Math.cos(a / 2) < -0.05 ? "is-bad" : "is-good", s: "cos(α/2): the hidden part" },
				{ l: "Slit 1's wave multiplied by", v: factorText(a, s), s: s === 0.5 ? "e^{iα/2} (spin ½)" : "e^{iα} (vector)" },
				{ l: "Stripes moved by", v: sg(Math.abs(sh), 2) + " of a stripe", c: Math.abs(Math.abs(sh) - 0.5) < 0.01 ? "is-bad" : Math.abs(sh) < 0.01 ? "is-good" : "" },
				{ l: "Middle of the board", v: mid / 2 > 0.6 * mx ? "bright" : mid / 2 < 0.1 * mx ? "dark" : "half", s: Math.round(mid / 2 / Math.max(mx, 1e-12) * 100) + "% of the brightest" },
				{ l: "Hits counted", v: Math.round(wd.tot).toLocaleString("en-US") }
			]);
			return;
		}
		ro(box, [
			{ l: "Wavelength λ", v: sg(C.lam) + " m" },
			C.n === 2 ? { l: "Stripe spacing on the board", v: sg(wd.sp) + " m", s: "measured from the wave sum" } : { l: "First dark point", v: isFinite(M.singleMinY(1, C.lam, C.a, C.L)) ? sg(M.singleMinY(1, C.lam, C.a, C.L)) + " m" : "none", s: "a sin θ = λ" },
			C.n === 2 ? { l: "λL / d", v: sg(C.lam * C.L / C.d) + " m", s: "small-angle formula" } : { l: "Slit width a", v: sg(C.a) + " m" },
			C.n === 2 ? { l: "First bright angle", v: sg(th1, 1) + "°", s: "sin θ = λ / d" } : { l: "Central bump width", v: isFinite(M.singleMinY(1, C.lam, C.a, C.L)) ? sg(2 * M.singleMinY(1, C.lam, C.a, C.L)) + " m" : "whole board" },
			{ l: "People in the crowd", v: wd.px.length.toLocaleString("en-US") },
			{ l: "Hits counted", v: Math.round(wd.tot).toLocaleString("en-US") }
		]);
	}
	function cNote() {
		var t = tab === "spin" ? (C.n === 1 ? "The flipper needs two slits: switch to Two slits." : (C.kind === "half" ? "Spin-½: slit 1's wave is multiplied by e^{iα/2}. At 360° that is −1, so bright and dark swap on the board; at 720° it is +1 again." : "An ordinary vector: slit 1's wave is multiplied by e^{iα}. At 360° that is +1, so nothing changes; the stripes only move in between."))
			: C.n === 2 ? "Bright stripes where the paths from the two slits differ by a whole number of wavelengths: d sin θ = mλ. Each new hit lands at random, with a chance proportional to the brightness." : "One slit: the dark points are at a sin θ = mλ (red dashes). Make the slit narrower and the central bump gets wider.";
		$("sw-c-note").textContent = t;
	}
	/* controls */
	var lamS = slider("sw-lam", function () { return C.lam; }, function (v) { C.lam = v; cBuild(); }, function (v) { return v.toFixed(2); });
	var dS = slider("sw-d", function () { return C.d; }, function (v) { C.d = v; cBuild(); }, function (v) { return v.toFixed(1); });
	var aS = slider("sw-a", function () { return C.a; }, function (v) { C.a = v; cBuild(); }, function (v) { return v.toFixed(2); });
	var LS = slider("sw-L", function () { return C.L; }, function (v) { C.L = v; cBuild(); }, function (v) { return String(v); });
	slider("sw-sp", function () { return C.sp; }, function (v) { C.sp = v; cSave(); }, function (v) { return v.toFixed(2) + "×"; });
	slider("sw-hr", function () { return C.hr; }, function (v) { C.hr = v; cSave(); }, function (v) { return String(v); });
	var alS = slider("sw-al", function () { return C.al; }, function (v) { C.al = v; cBuild(true); spinPre(); }, function (v) { return Math.round(v) + "°"; });
	var n1 = $("sw-n1"), n2 = $("sw-n2"); function nSet() { setPressed([n1, n2], C.n === 1 ? n1 : n2); }
	n1.onclick = function () { C.n = 1; nSet(); cBuild(); }; n2.onclick = function () { C.n = 2; nSet(); cBuild(); }; nSet();
	var spl = $("sw-src-plane"), spt = $("sw-src-point"); function srcSet() { setPressed([spl, spt], C.src === "point" ? spt : spl); }
	spl.onclick = function () { C.src = "plane"; srcSet(); cBuild(); }; spt.onclick = function () { C.src = "point"; srcSet(); cBuild(); }; srcSet();
	var kh = $("sw-k-half"), kv = $("sw-k-vec"); function kSet() { setPressed([kh, kv], C.kind === "vec" ? kv : kh); }
	kh.onclick = function () { C.kind = "half"; kSet(); cBuild(); }; kv.onclick = function () { C.kind = "vec"; kSet(); cBuild(); }; kSet();
	$("sw-col").value = C.col; $("sw-col").onchange = function () { C.col = this.value; cSave(); };
	$("sw-crowd").value = C.crowd; $("sw-crowd").onchange = function () { C.crowd = this.value; C.crowdPicked = true; cBuild(true); };
	$("sw-wave").checked = C.wave; $("sw-wave").onchange = function () { C.wave = this.checked; cSave(); };
	$("sw-guides").checked = C.guides; $("sw-guides").onchange = function () { C.guides = this.checked; cSave(); pDraw(); };
	var cPlay = $("sw-c-play"); cPlay.onclick = function () { C.run = !C.run; cPlay.textContent = C.run ? "❚❚ Pause" : "▶ Play"; cPlay.setAttribute("aria-pressed", C.run ? "true" : "false"); };
	$("sw-c-zero").onclick = function () { if (W1) { W1.hits = new Float64Array(NB); W1.tot = 0; cReadouts(); pDraw(); } };
	$("sw-c-png").onclick = function () { png(cCv, tab === "spin" ? "spin-half-double-slit" : "wave-of-people"); };
	$("sw-c-link").onclick = function () { var p = { tab: tab, lam: C.lam, d: C.d, a: C.a, n: C.n, L: C.L, src: C.src, col: C.col }; if (tab === "spin") { p.al = C.al; p.s = sOf(); } copyLink(p); };
	var vbs = Array.prototype.slice.call(root.querySelectorAll("[data-view]"));
	function viewSet(v) { cam.view = v; cam.yaw = VIEWS[v][0]; cam.pitch = VIEWS[v][1]; cam.zoom = 1; setPressed(vbs, vbs.filter(function (b) { return b.dataset.view === v; })[0]); sset({ view: v }); if (W1) W1.camKey = ""; cDraw(); }
	vbs.forEach(function (b) { b.onclick = function () { viewSet(b.dataset.view); }; }); setPressed(vbs, vbs.filter(function (b) { return b.dataset.view === cam.view; })[0]);
	controls(cCv, cam, function () { setPressed(vbs, null); cDraw(); }, null);
	var cPre = $("sw-c-pre");
	M.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.name; b.setAttribute("aria-pressed", "false");
		b.onclick = function () { C.lam = p.lam; C.d = p.d; C.a = p.a; C.n = p.slits; C.src = p.src; lamS.set(C.lam); dS.set(C.d); aS.set(C.a); nSet(); srcSet(); cBuild(); setPressed(Array.prototype.slice.call(cPre.children), b); }; cPre.appendChild(b); });
	var sPre = $("sw-s-pre");
	M.SPIN_PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.name; b.dataset.deg = p.deg;
		b.onclick = function () { C.al = p.deg; alS.set(C.al); if (C.n !== 2) { C.n = 2; nSet(); } cBuild(true); spinPre(); }; sPre.appendChild(b); });
	function spinPre() { Array.prototype.forEach.call(sPre.children, function (b) { b.setAttribute("aria-pressed", Math.abs(Number(b.dataset.deg) - C.al) < 0.5 ? "true" : "false"); });
		var a = C.al * DEG; $("sw-al-n").textContent = "The arrow looks " + (Math.abs(((C.al % 360) + 360) % 360) < 0.5 ? "exactly as it started" : "turned by " + Math.round(((C.al % 360) + 360) % 360) + "°") + "; the hidden sign is " + (Math.cos(a / 2) >= -1e-9 ? "+" : "−") + "."; }
	spinPre();
	var hitAcc = 0;
	function cStep(dt) {
		if (!W1) return; C.t += dt * C.sp * 0.6;
		hitAcc += dt * C.hr; var n = Math.min(400, Math.floor(hitAcc)); hitAcc -= n;
		for (var i = 0; i < n; i++) { var b = W1.sampler(); if (b < 0) break; W1.hits[b]++; W1.tot++; if (i < 4) W1.flash.push({ y: W1.by[b], t: performance.now() }); }
	}

	/* ======================================================= 3. THE FIELD ======================================================= */
	var fs = saved.f || {};
	var F = { mode: /^(dslit|sslit|one|two)$/.test(q.get("fm") || fs.mode || "") ? (q.get("fm") || fs.mode) : "dslit", anti: q.get("anti") === "1" || (q.get("fm") ? false : !!fs.anti),
		fl: num(q.get("fl"), 8, 30, num(fs.fl, 8, 30, 16)), fd: num(q.get("fd"), 8, 60, num(fs.fd, 8, 60, 30)), fa: num(q.get("fa"), 2, 24, num(fs.fa, 2, 24, 6)),
		fc: /^(phase|height|amp)$/.test(fs.fc || "") ? fs.fc : "phase", fh: num(fs.fh, 0, 3, 1), fsp: num(fs.fsp, 1, 8, 3), ft: num(fs.ft, 0, 1, 0.5), trail: fs.trail !== false, scr: fs.scr !== false, run: true };
	var fcam = { yaw: 0.35, pitch: 0.8, F: 80, zoom: 1 }, FVIEWS = { tilt: [0.35, 0.8], top: [0, 1.52], low: [0.5, 0.35] };
	var Fw = null, FG = null, tracers = [], ampRef = 1, fIavg = null;
	function fSave() { sset({ f: { mode: F.mode, anti: F.anti, fl: F.fl, fd: F.fd, fa: F.fa, fc: F.fc, fh: F.fh, fsp: F.fsp, ft: F.ft, trail: F.trail, scr: F.scr } }); }
	function fBuild() {
		var small = (fStage.clientWidth || window.innerWidth) < 620, nx = small ? 120 : 170, ny = small ? 78 : 106;
		Fw = M.Wave2D(nx, ny, { c: 1, sponge: 14 }); Fw.omega = TAU * Fw.c / F.fl;
		var wix = Math.round(nx * 0.34), cj = Math.floor(ny / 2), slit = F.mode === "dslit" || F.mode === "sslit";
		if (slit) M.buildWall(Fw, wix, F.mode === "dslit" ? [[cj - F.fd / 2, F.fa], [cj + F.fd / 2, F.fa]] : [[cj, F.fa]], 2);
		if (slit) { var cells = []; for (var j = 14; j < ny - 14; j++) cells.push(j * nx + 18); Fw.sources = [{ cells: cells, amp: 1.2 }]; }
		else if (F.mode === "one") Fw.sources = [{ cells: [cj * nx + Math.round(nx * 0.3)], amp: 3 }];
		else Fw.sources = [{ cells: [Math.round(cj - F.fd / 2) * nx + Math.round(nx * 0.3)], amp: 3 }, { cells: [Math.round(cj + F.fd / 2) * nx + Math.round(nx * 0.3)], amp: 3, phase: F.anti ? Math.PI : 0 }];
		Fw.wix = slit ? wix : -1; tracers = []; ampRef = 0.3; fIavg = new Float32Array(ny);
		var rs = small ? 3 : 2; FG = { nx: nx, ny: ny, rs: rs, rx: Math.floor((nx - 1) / rs), ry: Math.floor((ny - 1) / rs), hs: 40 / nx, key: "" };
		fSave(); fNote(); fPre(); fReadouts();
	}
	function cellX(i) { return (i - FG.nx / 2) * FG.hs; } function cellY(j) { return (j - FG.ny / 2) * FG.hs; }
	var fStage = $("sw-f-stage"), fCv = $("sw-f-c"), fSz = null;
	function fResize() { fSz = fitStage(fStage, function (w) { return clamp(w * 0.62, 320, 700); }); if (FG) FG.key = ""; fDraw(); }
	function fCamera() {
		var key = [fSz.W, fSz.H, fcam.yaw, fcam.pitch, fcam.zoom, FG.nx].join("|"); if (FG.key === key) return; FG.key = key;
		var hx = FG.nx * FG.hs / 2, hy = FG.ny * FG.hs / 2;
		fitCam(fcam, fSz.W, fSz.H, [[-hx, -hy, -2], [hx, -hy, -2], [hx, hy, -2], [-hx, hy, -2], [-hx, -hy, 4], [hx, hy, 4], [hx, -hy, 4], [-hx, hy, 4]], 44, 10, 10);
		var items = [], rx = FG.rx, ry = FG.ry, rs = FG.rs;
		for (var j = 0; j < ry; j++) for (var i = 0; i < rx; i++) items.push({ d: M.project(fcam, cellX((i + 0.5) * rs), cellY((j + 0.5) * rs), 0).d, q: j * rx + i });
		if (Fw.wix >= 0) { var j0 = -1; for (var jj = 0; jj <= FG.ny; jj++) { var w = jj < FG.ny && Fw.wall[jj * FG.nx + Fw.wix]; if (w && j0 < 0) j0 = jj; if (!w && j0 >= 0) { for (var a = j0; a < jj; a += 4) { var b = Math.min(jj, a + 4); items.push({ d: M.project(fcam, cellX(Fw.wix + 1), cellY((a + b) / 2), 1).d - 0.01, w: [a, b] }); } j0 = -1; } } }
		items.sort(function (u, v) { return v.d - u.d; }); FG.items = items;
	}
	function fDraw() {
		if (!fSz || !Fw || tab !== "field") return; var c = fSz.c, W = fSz.W, H = fSz.H; fCamera();
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var rx = FG.rx, ry = FG.ry, rs = FG.rs, nx = FG.nx, u = Fw.u, up = Fw.up, dt = Fw.dt, om = Fw.omega, hsc = F.fh * 1.6 / Math.max(0.05, ampRef);
		var cyaw = Math.cos(fcam.yaw), syaw = Math.sin(fcam.yaw), cp = Math.cos(fcam.pitch), spp = Math.sin(fcam.pitch), Fc = fcam.F, k = fcam.k, cx = fcam.cx, cy = fcam.cy;
		var nv = (rx + 1) * (ry + 1), VX = FG.VX && FG.VX.length === nv ? FG.VX : (FG.VX = new Float32Array(nv)), VY = FG.VY && FG.VY.length === nv ? FG.VY : (FG.VY = new Float32Array(nv)), i, j, a;
		var mxA = 0;
		for (j = 0; j <= ry; j++) for (i = 0; i <= rx; i++) {
			var kk = j * rs * nx + i * rs, x = cellX(i * rs), y = cellY(j * rs), z = u[kk] * hsc;
			var x1 = x * cyaw - y * syaw, y1 = x * syaw + y * cyaw, upz = z * cp + y1 * spp, dd = y1 * cp - z * spp, f = Fc / (Fc + dd);
			VX[j * (rx + 1) + i] = cx + x1 * k * f; VY[j * (rx + 1) + i] = cy - upz * k * f;
		}
		FG.items.forEach(function (it) {
			if (it.w) { fWall(c, it.w[0], it.w[1]); return; }
			var qi = it.q, ii = qi % rx, jj = (qi - ii) / rx, k0 = (jj * rs + (rs >> 1)) * nx + ii * rs + (rs >> 1), uu = u[k0], v = (uu - up[k0]) / dt, amp = Math.sqrt(uu * uu + v * v / (om * om)), col;
			if (amp > mxA && !Fw.wall[k0]) mxA = amp;
			if (Fw.wall[k0]) col = "#2a3040";
			else if (F.fc === "phase") col = hueCol(Math.atan2(-v / om, uu), 0.18 + 0.62 * Math.min(1, amp / ampRef));
			else if (F.fc === "height") col = divCol(clamp(uu / ampRef, -1, 1));
			else col = hueCol(3.67, 0.08 + 0.85 * Math.min(1, amp / ampRef));
			var a0 = jj * (rx + 1) + ii, a1 = a0 + 1, a2 = a0 + rx + 2, a3 = a0 + rx + 1;
			c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.6; c.beginPath(); c.moveTo(VX[a0], VY[a0]); c.lineTo(VX[a1], VY[a1]); c.lineTo(VX[a2], VY[a2]); c.lineTo(VX[a3], VY[a3]); c.closePath(); c.fill(); c.stroke();
		});
		if (mxA > 0) ampRef = ampRef * 0.97 + Math.max(0.02, mxA * 0.8) * 0.03;
		/* brightness profile standing on the far edge */
		if (F.scr && fIavg) { var im = 0; for (j = 0; j < FG.ny; j++) im = Math.max(im, fIavg[j]);
			if (im > 0) { var xe = cellX(nx - 16); c.strokeStyle = "#ffd166"; c.lineWidth = 2; c.beginPath(); for (j = 14; j < FG.ny - 14; j++) { var p = M.project(fcam, xe, cellY(j), 0.3 + 4 * fIavg[j] / im); if (j > 14) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); } c.stroke();
				var lb = M.project(fcam, xe, cellY(FG.ny - 14), 4.6); txt(c, "brightness", lb.x, lb.y, { col: "#ffd166", size: 11, al: "center", b: 1 }); } }
		/* tracers */
		tracers.forEach(function (t) {
			if (F.trail && t.tr.length > 1) { c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1.2; c.beginPath(); t.tr.forEach(function (pt, n) { var p = M.project(fcam, cellX(pt[0]), cellY(pt[1]), pt[2] * hsc); if (n) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke(); }
			var p = M.project(fcam, cellX(t.x), cellY(t.y), t.z * hsc + 0.25); c.fillStyle = "#ffffff"; c.strokeStyle = "#0b1020"; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, Math.max(3, 0.32 * fcam.k * p.f), 0, TAU); c.fill(); c.stroke();
		});
		txt(c, "t = " + sg(Fw.t / (TAU / Fw.omega), 1) + " periods · click the sheet to drop a tracer", 10, H - 10, { col: COL.dim, size: 11 });
	}
	function fWall(c, j0, j1) {
		var x0 = cellX(Fw.wix), x1 = cellX(Fw.wix + 2), y0 = cellY(j0), y1 = cellY(j1), h = 1.6, A = function (x, y, z) { return M.project(fcam, x, y, z); };
		quad(c, [A(x0, y0, h), A(x1, y0, h), A(x1, y1, h), A(x0, y1, h)], "#8a93a8", "#2f3646");
		quad(c, Math.cos(fcam.yaw) > 0 ? [A(x0, y0, -0.4), A(x0, y1, -0.4), A(x0, y1, h), A(x0, y0, h)] : [A(x1, y0, -0.4), A(x1, y1, -0.4), A(x1, y1, h), A(x1, y0, h)], "#5b6478", "#2f3646");
	}
	function addTracer(x, y) { if (x < 15 || y < 15 || x > FG.nx - 16 || y > FG.ny - 16) return false; if (Fw.wall[Math.floor(y) * FG.nx + Math.floor(x)]) return false; tracers.push({ x: x, y: y, z: 0, vx: 0, vy: 0, tr: [], n: 0 }); if (tracers.length > 120) tracers.shift(); return true; }
	function fStepTracers() {
		var keep = [];
		tracers.forEach(function (t) {
			var f = Fw.flux(t.x, t.y); if (!f) return;
			if (t.stuck) { t.z = f.u; keep.push(t); return; }
			var tx = 0.15 * F.ft * Fw.c * f.Sx / (f.E + 1e-6 * ampRef * ampRef), ty = 0.15 * F.ft * Fw.c * f.Sy / (f.E + 1e-6 * ampRef * ampRef);
			t.vx += (tx - t.vx) * 0.015; t.vy += (ty - t.vy) * 0.015;
			var nx2 = t.x + t.vx * Fw.dt, ny2 = t.y + t.vy * Fw.dt, wk = Math.floor(ny2) * FG.nx + Math.floor(nx2);
			if (Fw.wall[wk] || Fw.wall[wk + 1] || Fw.wall[wk + FG.nx]) { t.vx *= -0.3; t.vy *= -0.3; } else { t.x = nx2; t.y = ny2; }
			t.z = f.u; if (++t.n % 6 === 0) { t.tr.push([t.x, t.y, t.z]); if (t.tr.length > 140) t.tr.shift(); }
			if (t.x >= FG.nx - 18) { t.x = FG.nx - 18; t.stuck = true; }
			if (t.x > 15 && t.y > 15 && t.y < FG.ny - 16) keep.push(t);
		});
		tracers = keep;
	}
	function fStep() {
		for (var s = 0; s < F.fsp; s++) {
			Fw.step(); if (tracers.length) fStepTracers();
			var col = FG.nx - 16; for (var j = 0; j < FG.ny; j++) { var v = Fw.u[j * FG.nx + col]; fIavg[j] = fIavg[j] * 0.997 + 0.003 * v * v; }
		}
	}
	controls(fCv, fcam, function () { setPressed(fvb, null); fDraw(); }, function (x, y) {
		var p = M.unprojectFloor(fcam, x, y); if (!p) return; var i = p.x / FG.hs + FG.nx / 2, j = p.y / FG.hs + FG.ny / 2;
		if (addTracer(i, j)) { fReadouts(); fDraw(); } else toast("Drop tracers on the open sheet, away from the edges and walls");
	});
	var fvb = Array.prototype.slice.call(root.querySelectorAll("[data-fview]"));
	fvb.forEach(function (b) { b.onclick = function () { var v = FVIEWS[b.dataset.fview]; fcam.yaw = v[0]; fcam.pitch = v[1]; fcam.zoom = 1; setPressed(fvb, b); fDraw(); }; }); setPressed(fvb, fvb[0]);
	slider("sw-fl", function () { return F.fl; }, function (v) { F.fl = v; if (Fw) { Fw.omega = TAU * Fw.c / F.fl; fSave(); fReadouts(); } }, function (v) { return v.toFixed(1); });
	slider("sw-fd", function () { return F.fd; }, function (v) { F.fd = v; fBuild(); }, function (v) { return String(v); });
	slider("sw-fa", function () { return F.fa; }, function (v) { F.fa = v; fBuild(); }, function (v) { return String(v); });
	slider("sw-fh", function () { return F.fh; }, function (v) { F.fh = v; fSave(); fDraw(); }, function (v) { return v.toFixed(2) + "×"; });
	slider("sw-fsp", function () { return F.fsp; }, function (v) { F.fsp = v; fSave(); }, function (v) { return v + " steps / frame"; });
	slider("sw-ft", function () { return F.ft; }, function (v) { F.ft = v; fSave(); }, function (v) { return v.toFixed(2); });
	$("sw-fc").value = F.fc; $("sw-fc").onchange = function () { F.fc = this.value; fSave(); fDraw(); };
	$("sw-f-trail").checked = F.trail; $("sw-f-trail").onchange = function () { F.trail = this.checked; fSave(); };
	$("sw-f-scr").checked = F.scr; $("sw-f-scr").onchange = function () { F.scr = this.checked; fSave(); };
	var fPlay = $("sw-f-play"); fPlay.onclick = function () { F.run = !F.run; fPlay.textContent = F.run ? "❚❚ Pause" : "▶ Play"; fPlay.setAttribute("aria-pressed", F.run ? "true" : "false"); };
	$("sw-f-reset").onclick = function () { fBuild(); fDraw(); };
	$("sw-f-png").onclick = function () { png(fCv, "spin-wave-field"); };
	$("sw-f-clear").onclick = function () { tracers = []; fReadouts(); fDraw(); };
	$("sw-f-line").onclick = function () { var x = Fw.wix >= 0 ? Fw.wix + 6 : Math.round(FG.nx * 0.42); for (var k = 0; k < 24; k++) addTracer(x, FG.ny * 0.22 + k * FG.ny * 0.56 / 23); fReadouts(); fDraw(); };
	$("sw-f-link").onclick = function () { var p = { tab: "field", fm: F.mode, fl: F.fl, fd: F.fd, fa: F.fa }; if (F.anti) p.anti = 1; copyLink(p); };
	var fPreBox = $("sw-f-pre");
	M.FIELD_PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.name; b.dataset.mode = p.mode; b.dataset.anti = p.anti ? "1" : "";
		b.onclick = function () { F.mode = p.mode; F.anti = !!p.anti; fBuild(); fDraw(); }; fPreBox.appendChild(b); });
	function fPre() { Array.prototype.forEach.call(fPreBox.children, function (b) { b.setAttribute("aria-pressed", b.dataset.mode === F.mode && !!b.dataset.anti === !!F.anti ? "true" : "false"); }); }
	function fNote() {
		var t = { dslit: "A plane wave from the left hits a wall with two slits. Each slit sends out half-circles; where they cross in step the sheet shakes hard (bright), out of step it stays flat. The yellow curve at the far edge is the time-averaged brightness.",
			sslit: "One slit: a single half-circle wave spreads out. A slit narrower than the wavelength spreads it almost evenly; a wide slit makes a beam with weaker side lobes.",
			one: "One point shaking up and down makes circular waves. The colour goes once round the wheel per wavelength.",
			two: F.anti ? "Two points shaking in opposite phase: now the middle line is dark, and bright and dark have swapped compared with the in-phase case (like the 360° flipper)." : "Two points shaking in step: stripes of strong and no motion fan out, the same pattern as the double slit." }[F.mode];
		$("sw-f-note").textContent = t;
	}
	function fReadouts() {
		if (!Fw) return; var dd = F.mode === "sslit" ? F.fa : F.fd, th = F.mode === "sslit" || F.mode === "one" ? NaN : Math.asin(Math.min(1, F.fl / dd)) / DEG;
		ro($("sw-f-ro"), [
			{ l: "Wavelength", v: sg(F.fl, 1) + " cells", s: sg(F.fl * FG.hs, 2) + " m in the picture" },
			{ l: "Period", v: sg(TAU / Fw.omega, 1) + " time units", s: "wave speed 1 cell per unit" },
			{ l: F.mode === "sslit" ? "First dark angle" : "First bright angle", v: F.mode === "one" ? "–" : F.mode === "sslit" ? (F.fa > F.fl ? sg(Math.asin(F.fl / F.fa) / DEG, 1) + "°" : "none") : (isFinite(th) && F.fl < dd ? sg(th, 1) + "°" : "none"), s: F.mode === "sslit" ? "a sin θ = λ" : F.mode === "one" ? "" : "d sin θ = λ" },
			{ l: "Grid", v: FG.nx + " × " + FG.ny, s: "cells" },
			{ l: "Tracers", v: String(tracers.length) }
		]);
	}

	/* ======================================================= loop / sizing ======================================================= */
	function onResize() { if (tab === "field") fResize(); else { cResize(); pResize(); } }
	var rT; window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(onResize, 60); });
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rT); rT = setTimeout(onResize, 60); }).observe(root);
	var last = 0, roT = 0, pT = 0;
	function tick(dt) {
		roT += dt; pT += dt;
		if (tab === "field") { if (!Fw) return; if (F.run) fStep(); fDraw(); if (roT > 0.5) { roT = 0; fReadouts(); } }
		else { if (C.run) cStep(dt); cDraw(); if (pT > 0.2) { pT = 0; pDraw(); } if (roT > 0.4) { roT = 0; cReadouts(); } }
	}
	function loop(ts) { var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts; if (!document.hidden) tick(dt); requestAnimationFrame(loop); }
	setTab(tab, true);
	requestAnimationFrame(loop);
	window.MESSpinWaveUI = { C: C, F: F, cam: cam, fcam: fcam, world: function () { return W1; }, wave: function () { return Fw; }, tracers: function () { return tracers; }, setTab: setTab, tick: function (ms, n) { for (var i = 0; i < (n || 1); i++) tick((ms || 16) / 1000); } };
})();
