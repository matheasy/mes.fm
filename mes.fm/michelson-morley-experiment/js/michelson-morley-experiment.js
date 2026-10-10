/* MES Michelson-Morley Experiment Simulator -- physics + maths (pure JS; browser and node: require('./tool_apps_src/michelson-morley-experiment/lib.js')).
 *
 * Model (all in the frame of a stationary luminiferous aether, the hypothesis the 1881/1887 experiments tested)
 *   - the interferometer moves through the aether at speed v (beta = v/c); light always travels at c in the aether
 *   - a round trip along an arm whose lab-frame displacement is d = (dx, dy), with the motion along +x, takes
 *         t = (2/c) * sqrt(dx^2 + dy^2 - beta^2 dy^2) / (1 - beta^2)
 *     (dy = 0: 2L/c / (1 - beta^2); dx = 0: 2L/c / sqrt(1 - beta^2): the textbook parallel and transverse times)
 *   - the second arm is perpendicular to the first; the fringe position is delta = c (t1 - t2) / lambda
 *   - Lorentz-FitzGerald contraction shrinks dx by sqrt(1 - beta^2): then t = 2L / (c sqrt(1 - beta^2)) for any direction -> no fringe shift
 *   - special relativity and an emission (ballistic) theory also predict no dependence on orientation
 *   - small beta: delta(theta) = (L beta^2 / lambda) cos(2 theta), so turning the table 90 degrees shifts the fringes by N = 2 L beta^2 / lambda
 */
(function (root) {
	"use strict";
	var C = 299792458;

	function rng(seed) {
		var a = (seed >>> 0) || 1, spare = null;
		function u() { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
		u.normal = function () {
			if (spare !== null) { var s = spare; spare = null; return s; }
			var x, y, r; do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0);
			var m = Math.sqrt(-2 * Math.log(r) / r); spare = y * m; return x * m;
		};
		return u;
	}

	var MODELS = {
		aether: { name: "Stationary aether", short: "Aether", predicts: true, note: "Light travels at c through a fixed aether; the Earth moves through it. This is what Michelson set out to measure." },
		lorentz: { name: "Aether + Lorentz–FitzGerald contraction", short: "Aether + contraction", predicts: false, note: "Same aether, but every length along the direction of motion shrinks by √(1 − v²/c²). The two effects cancel exactly." },
		sr: { name: "Special relativity (no aether)", short: "Relativity", predicts: false, note: "Light moves at c in every inertial frame, so nothing depends on the apparatus's orientation or velocity." },
		emission: { name: "Emission (ballistic) theory", short: "Emission", predicts: false, note: "Light moves at c relative to its source, which sits on the apparatus. Also gives a null here (it fails other tests, such as double stars)." }
	};

	/* Round-trip time (s) along an arm of length L at angle theta (rad, from the wind direction), wind speed v (m/s). contract = Lorentz-FitzGerald. */
	function armTime(L, v, theta, contract) {
		var b2 = (v / C) * (v / C);
		var dx = L * Math.cos(theta) * (contract ? Math.sqrt(1 - b2) : 1), dy = L * Math.sin(theta);
		return (2 / C) * Math.sqrt(dx * dx + dy * dy - b2 * dy * dy) / (1 - b2);
	}
	/* Fringe position (in fringes) of arm 1 at angle theta relative to arm 2 (theta + 90 degrees), for a model. `felt` = fraction of the wind that reaches the lab (1 = full, 0 = fully dragged along). */
	function fringePos(model, L, lambda, v, theta, felt) {
		if (model !== "aether" && model !== "lorentz") return 0;
		var ve = v * (felt == null ? 1 : felt); if (ve === 0) return 0;
		var t1 = armTime(L, ve, theta, model === "lorentz"), t2 = armTime(L, ve, theta + Math.PI / 2, model === "lorentz");
		return C * (t1 - t2) / lambda;
	}
	/* Shift in fringes when the table turns by 90 degrees from the best position (the textbook N = 2 L v^2 / (lambda c^2)); exact value too. */
	function shift90(L, lambda, v) { return 2 * L * v * v / (lambda * C * C); }
	function shift90Exact(L, lambda, v) { return Math.abs(fringePos("aether", L, lambda, v, 0, 1) - fringePos("aether", L, lambda, v, Math.PI / 2, 1)); }
	/* Inverse: wind speed (m/s) that gives a 90-degree shift of N fringes; arm length (m) for a shift N at speed v. */
	function speedFromShift(N, L, lambda) { return C * Math.sqrt(Math.abs(N) * lambda / (2 * L)); }
	function lengthForShift(N, lambda, v) { return Math.abs(N) * lambda * C * C / (2 * v * v); }
	/* Peak (cos 2 theta) amplitude of the fringe position in fringes: L beta^2 / lambda */
	function amplitude(L, lambda, v) { return L * v * v / (lambda * C * C); }
	/* Time and path difference between the two arms at the best orientation */
	function armDifference(L, v) { var t1 = armTime(L, v, 0, false), t2 = armTime(L, v, Math.PI / 2, false); return { t1: t1, t2: t2, dt: t1 - t2, dpath: C * (t1 - t2) }; }

	/* A turntable run: n azimuths over one full turn, noise sigma (fringes) per reading, `turns` readings averaged per azimuth (the 1887 run averaged 6 turns of 16). */
	function simulateRun(p) {
		var n = p.n || 16, turns = p.turns || 1, r = rng(p.seed || 1), out = [];
		for (var i = 0; i < n; i++) {
			var th = 2 * Math.PI * i / n, truth = fringePos(p.model, p.L, p.lambda, p.v, th - (p.windAz || 0), p.felt);
			var noise = 0; for (var k = 0; k < turns; k++) noise += (p.sigma || 0) * r.normal(); noise /= turns;
			out.push({ theta: th, truth: truth, y: truth + noise });
		}
		return out;
	}
	/* Least-squares fit of y = a cos 2th + b sin 2th + c; returns amplitude A = hypot(a, b), wind azimuth (rad, 0..pi), implied speed (m/s). */
	function fit2theta(pts, L, lambda) {
		var n = pts.length, Sc = 0, Ss = 0, Scc = 0, Sss = 0, Scs = 0, Sy = 0, Syc = 0, Sys = 0;
		pts.forEach(function (p) { var c = Math.cos(2 * p.theta), s = Math.sin(2 * p.theta); Sc += c; Ss += s; Scc += c * c; Sss += s * s; Scs += c * s; Sy += p.y; Syc += p.y * c; Sys += p.y * s; });
		// normal equations for [a b c]
		var M = [[Scc, Scs, Sc, Syc], [Scs, Sss, Ss, Sys], [Sc, Ss, n, Sy]];
		for (var i = 0; i < 3; i++) {
			var piv = i; for (var j = i + 1; j < 3; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
			var t = M[i]; M[i] = M[piv]; M[piv] = t;
			for (j = i + 1; j < 3; j++) { var f = M[j][i] / M[i][i]; for (var k = i; k < 4; k++) M[j][k] -= f * M[i][k]; }
		}
		var x = [0, 0, 0]; for (i = 2; i >= 0; i--) { var s2 = M[i][3]; for (var k2 = i + 1; k2 < 3; k2++) s2 -= M[i][k2] * x[k2]; x[i] = s2 / M[i][i]; }
		var A = Math.hypot(x[0], x[1]), az = Math.atan2(x[1], x[0]) / 2; if (az < 0) az += Math.PI;
		return { a: x[0], b: x[1], c: x[2], amp: A, azimuth: az, v: C * Math.sqrt(A * lambda / L) };
	}

	/* Historical interferometers: L = effective optical path per arm (m), lambda (m). Reported figures are from the papers as commonly cited. */
	var HISTORY = [
		{ id: "1881", year: "1881", who: "Michelson (Potsdam)", L: 1.2, lambda: 5.9e-7, result: "No shift of the predicted size; Michelson concluded the aether is not stationary. (Lorentz later found an error in his arithmetic: the expected effect was half as large.)", reported: "none seen" },
		{ id: "1887", year: "1887", who: "Michelson & Morley (Cleveland)", L: 11, lambda: 5.7e-7, result: "Mirrors on a stone slab floating in mercury; 16 azimuths, 6 turns. Shift at most about 0.01 fringe against 0.4 expected, so “less than one-sixth” of the Earth's orbital speed.", reported: "≤ ~0.01 fringe" },
		{ id: "1902", year: "1902–04", who: "Morley & Miller", L: 32, lambda: 5.7e-7, result: "A longer folded path, mounted on a wooden frame. No effect of the size expected for 30 km/s.", reported: "no 30 km/s effect" },
		{ id: "1925", year: "1925–26", who: "Miller (Mount Wilson)", L: 32, lambda: 5.7e-7, result: "Miller reported a small, steady signal equal to about 10 km/s, varying with sidereal time. Later studies (Shankland et al., 1955) traced it to temperature gradients.", reported: "~10 km/s claimed" },
		{ id: "1930", year: "1930", who: "Joos (Jena)", L: 21, lambda: 5.5e-7, result: "A sealed, temperature-controlled instrument. An upper limit of about 1.5 km/s: no effect at the 30 km/s scale.", reported: "< ~1.5 km/s" }
	];

	/* ---------------- speeds worth trying ---------------- */
	var SPEEDS = [
		{ id: "spin", label: "Earth's spin (equator)", v: 465 },
		{ id: "orbit", label: "Earth's orbit", v: 29780 },
		{ id: "galaxy", label: "Sun around the Galaxy", v: 230000 },
		{ id: "cmb", label: "Sun vs the cosmic microwave background", v: 369800 }
	];

	/* ---------------- parsing / formatting ---------------- */
	var LEN = { nm: 1e-9, "µm": 1e-6, um: 1e-6, mm: 1e-3, cm: 1e-2, m: 1, km: 1e3, ft: 0.3048, in: 0.0254 };
	var SPD = { "m/s": 1, "km/s": 1e3, "km/h": 1 / 3.6, "mph": 0.44704, "c": C };
	function parseVal(s, table, defUnit) {
		var m = String(s).trim().replace(/,/g, "").match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-zµ/]*)$/i);
		if (!m) return NaN; var u = m[2] || defUnit, k = table[u] != null ? table[u] : table[u.toLowerCase()]; if (k == null) return NaN; return parseFloat(m[1]) * k;
	}
	function parseLength(s) { return parseVal(s, LEN, "m"); }
	function parseSpeed(s) { return parseVal(s, SPD, "km/s"); }
	function fmtSig(x, n) {
		if (!isFinite(x)) return "–"; if (x === 0) return "0"; n = n || 3; var a = Math.abs(x);
		if (a >= 1e6 || a < 1e-3) { var e = x.toExponential(n - 1).split("e"); return e[0] + " × 10" + sup(parseInt(e[1], 10)); }
		var d = Math.max(0, n - 1 - Math.floor(Math.log10(a))), parts = String(parseFloat(x.toFixed(Math.min(d, 12)))).split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return parts.join(".");
	}
	function sup(n) { var map = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }; return String(n).split("").map(function (c) { return map[c]; }).join(""); }
	function fmtLen(m) { var a = Math.abs(m); if (a >= 1e3) return fmtSig(m / 1e3, 3) + " km"; if (a >= 1) return fmtSig(m, 3) + " m"; if (a >= 1e-2) return fmtSig(m * 1e2, 3) + " cm"; if (a >= 1e-3) return fmtSig(m * 1e3, 3) + " mm"; if (a >= 1e-6) return fmtSig(m * 1e6, 3) + " µm"; return fmtSig(m * 1e9, 3) + " nm"; }
	function fmtSpeed(v) { var a = Math.abs(v); if (a >= 1e3) return fmtSig(v / 1e3, 3) + " km/s"; return fmtSig(v, 3) + " m/s"; }
	function fmtTime(s) { var a = Math.abs(s); if (a >= 1) return fmtSig(s, 3) + " s"; if (a >= 1e-3) return fmtSig(s * 1e3, 3) + " ms"; if (a >= 1e-6) return fmtSig(s * 1e6, 3) + " µs"; if (a >= 1e-9) return fmtSig(s * 1e9, 3) + " ns"; if (a >= 1e-12) return fmtSig(s * 1e12, 3) + " ps"; if (a >= 1e-16) return fmtSig(s * 1e15, 3) + " fs"; return fmtSig(s * 1e18, 3) + " as"; }
	function fmtFringe(n) { var a = Math.abs(n); if (a === 0) return "0 fringe"; if (a >= 100) return fmtSig(n, 3) + " fringes"; if (a >= 0.001) return (n < 0 ? "−" : "") + String(parseFloat(a.toFixed(a >= 1 ? 2 : 3))) + (a === 1 ? " fringe" : " fringes"); return fmtSig(n, 2) + " fringe"; }

	var api = {
		C: C, MODELS: MODELS, HISTORY: HISTORY, SPEEDS: SPEEDS, rng: rng, armTime: armTime, fringePos: fringePos, shift90: shift90, shift90Exact: shift90Exact,
		speedFromShift: speedFromShift, lengthForShift: lengthForShift, amplitude: amplitude, armDifference: armDifference, simulateRun: simulateRun, fit2theta: fit2theta,
		parseLength: parseLength, parseSpeed: parseSpeed, fmtSig: fmtSig, fmtLen: fmtLen, fmtSpeed: fmtSpeed, fmtTime: fmtTime, fmtFringe: fmtFringe
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESMM = api;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Michelson-Morley Experiment Simulator -- mes.fm/michelson-morley-experiment
 * UI around MESMM (lib.js: arm times in the aether frame, fringe position, turntable run + fit, history, calculator maths).
 * Five tabs: Interferometer (rotating table + fringes), Why the times differ (aether-frame animation), Turntable run (noisy 16-point run + fit),
 * Real experiments, Calculator. State: localStorage mes-michelson-morley-experiment:v1; share links ?tab=&m=&v=&L=&l=&felt= (and mode/kL/kl/kv/kN for the calculator).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("mm");
	if (!root) return;
	var M = window.MESMM, C = M.C;
	var KEY = "mes-michelson-morley-experiment:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
	var saved = sget(), q = new URLSearchParams(location.search);
	var TABS = ["lab", "frame", "rot", "hist", "calc"];
	var COL = { bg: "#070d1f", line: "#26325a", text: "#e6ecfb", dim: "#93a1c4", gold: "#fbbf24", cyan: "#22d3ee", red: "#f87171", grid: "rgba(147,161,196,0.16)", steel: "#cbd5e1" };

	/* ---------------- state ---------------- */
	function pick(k, fallback) { var a = num(q.get(k)); if (a != null) return a; var b = num(saved[k]); return b != null ? b : fallback; }
	var S = {
		tab: TABS.indexOf(q.get("tab")) >= 0 ? q.get("tab") : (TABS.indexOf(saved.tab) >= 0 ? saved.tab : "lab"),
		model: M.MODELS[q.get("m") || saved.model] ? (q.get("m") || saved.model) : "aether",
		v: clamp(pick("v", 29780), 100, 1e6), L: clamp(pick("L", 11), 0.1, 100), lam: clamp(pick("l", 570), 400, 700), felt: clamp(pick("felt", 100), 0, 100),
		th: 0, spin: false, spinspd: clamp(num(saved.spinspd) || 30, 5, 180), ghost: saved.ghost !== false, pulses: saved.pulses !== false,
		fb: clamp(num(saved.fb) || 50, 5, 85), fs: clamp(num(saved.fs) || 10, 1, 30), fc: !!saved.fc,
		sigma: clamp(num(saved.sigma) || 0.01, 0.0005, 0.2), turns: clamp(Math.round(num(saved.turns) || 6), 1, 40), az: clamp(num(saved.az) != null ? num(saved.az) : 40, 0, 180), fit: saved.fit !== false, band: saved.band !== false,
		seed: 1 + Math.floor(Math.random() * 99999),
		k: { mode: /^(shift|speed|length)$/.test(q.get("mode") || saved.kmode || "") ? (q.get("mode") || saved.kmode) : "shift", L: q.get("kL") || saved.kL || "11 m", lam: q.get("kl") || saved.kl || "570 nm", v: q.get("kv") || saved.kv || "29.78 km/s", N: q.get("kN") || saved.kN || "0.01" }
	};
	function save() { sset({ tab: S.tab, model: S.model, v: S.v, L: S.L, l: S.lam, felt: S.felt, spinspd: S.spinspd, ghost: S.ghost, pulses: S.pulses, fb: S.fb, fs: S.fs, fc: S.fc, sigma: S.sigma, turns: S.turns, az: S.az, fit: S.fit, band: S.band, kmode: S.k.mode, kL: S.k.L, kl: S.k.lam, kv: S.k.v, kN: S.k.N }); }

	/* ---------------- shared helpers ---------------- */
	var toastT;
	function toast(msg) { var t = $("mm-toast"); if (!t) { t = document.createElement("div"); t.id = "mm-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copy(text, ok) {
		function fallback() { prompt("Copy this:", text); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(ok || "Copied"); }, fallback); else fallback();
	}
	function setup(canvas, w, h) {
		var dpr = Math.min(window.devicePixelRatio || 1, 2), c = canvas.getContext("2d");
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
		c.setTransform(dpr, 0, 0, dpr, 0, 0); return c;
	}
	function sizeStage(stage, ratioWide, ratioNarrow) { var w = stage.clientWidth || 600; var h = Math.max(w < 640 ? w * ratioNarrow : w * ratioWide, 260); stage.style.height = Math.round(h) + "px"; return { w: w, h: h }; }
	function label(c, txt, x, y, col, size, align) { c.fillStyle = col || COL.text; c.font = (size || 12) + "px system-ui,-apple-system,Segoe UI,Roboto,sans-serif"; c.textAlign = align || "left"; c.textBaseline = "middle"; c.fillText(txt, x, y); }
	function arrowHead(c, x, y, a, col, s) { s = s || 8; c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(x - s * Math.cos(a - 0.4), y - s * Math.sin(a - 0.4)); c.lineTo(x - s * Math.cos(a + 0.4), y - s * Math.sin(a + 0.4)); c.closePath(); c.fill(); }
	function wl2rgb(w) {
		var r = 0, g = 0, b = 0;
		if (w < 440) { r = -(w - 440) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = -(w - 510) / 20; } else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = -(w - 645) / 65; } else r = 1;
		var f = w < 420 ? 0.4 + 0.6 * (w - 400) / 20 : w > 680 ? 0.5 + 0.5 * (700 - w) / 20 : 1;
		return [Math.round(255 * Math.pow(r * f, 0.8)), Math.round(255 * Math.pow(g * f, 0.8)), Math.round(255 * Math.pow(b * f, 0.8))];
	}
	function rgba(rgb, a) { return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")"; }
	function toggleFull(wrapId) { var w = $(wrapId); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); }
	function path(pts, f) {      // point at fraction f along a polyline
		var tot = 0, i, segs = []; for (i = 1; i < pts.length; i++) { var d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); tot += d; }
		var t = clamp(f, 0, 1) * tot; for (i = 0; i < segs.length; i++) { if (t <= segs[i] || i === segs.length - 1) { var u = segs[i] ? t / segs[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]; } t -= segs[i]; }
		return pts[pts.length - 1];
	}

	/* ---------------- derived numbers for the current set-up ---------------- */
	function lamM() { return S.lam * 1e-9; }
	function felt() { return S.felt / 100; }
	function pos(th) { return M.fringePos(S.model, S.L, lamM(), S.v, th, felt()); }
	function bigN() { return Math.abs(pos(0) - pos(Math.PI / 2)); }
	function veff() { return S.model === "aether" || S.model === "lorentz" ? S.v * felt() : S.v; }

	/* ================= tab 1: interferometer ================= */
	var tt = 0, off = document.createElement("canvas"); off.width = off.height = 150;
	function drawLab(dt) {
		var sz = sizeStage($("mm-stage1"), 0.5, 1.3), c = setup($("mm-lab"), sz.w, sz.h);
		c.fillStyle = COL.bg; c.fillRect(0, 0, sz.w, sz.h);
		tt += dt;
		if (S.spin) { S.th = (S.th + S.spinspd * dt) % 360; $("mm-th").value = S.th; }
		var narrow = sz.w < 640, A = narrow ? { x: 0, y: 0, w: sz.w, h: sz.h * 0.54 } : { x: 0, y: 0, w: sz.w * 0.54, h: sz.h }, F = narrow ? { x: 0, y: sz.h * 0.54, w: sz.w, h: sz.h * 0.46 } : { x: sz.w * 0.54, y: 0, w: sz.w * 0.46, h: sz.h };
		var fs = clamp(sz.w / 62, 11, 15), rgb = wl2rgb(S.lam), th = S.th * Math.PI / 180;
		var cx = A.x + A.w / 2, cy = A.y + A.h / 2 + fs * 0.6, R = Math.min(A.w, A.h) * 0.42, La = R * 0.64;
		var u1 = [Math.cos(th), -Math.sin(th)], u2 = [-Math.sin(th), -Math.cos(th)];
		function P(a, k) { return [cx + a[0] * k, cy + a[1] * k]; }
		// wind (the aether streams past the apparatus the opposite way to its motion)
		var wa = S.model === "aether" ? 0.1 + 0.4 * felt() : 0.12;
		c.save(); c.strokeStyle = rgba([34, 211, 238], wa); c.lineWidth = 1.4; c.setLineDash([12, 16]); c.lineDashOffset = -(tt * 70);
		for (var i = 0; i < 6; i++) { var wy = A.y + A.h * (0.14 + 0.14 * i); c.beginPath(); c.moveTo(A.x + A.w - 14, wy); c.lineTo(A.x + 14, wy); c.stroke(); }
		c.restore();
		for (i = 0; i < 6; i++) arrowHead(c, A.x + 12, A.y + A.h * (0.14 + 0.14 * i), Math.PI, rgba([34, 211, 238], wa), 7);
		label(c, S.model === "aether" ? "aether wind: " + M.fmtSpeed(S.v * felt()) : "motion through space: " + M.fmtSpeed(S.v) + " (no effect predicted)", A.x + 14, A.y + fs + 4, COL.cyan, fs);
		// table
		c.fillStyle = "rgba(255,255,255,0.04)"; c.strokeStyle = COL.line; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.fill(); c.stroke();
		c.lineWidth = 1;
		for (i = 0; i < 16; i++) { var a = th + i * Math.PI / 8, ti = i % 4 === 0 ? 0.88 : 0.94; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * ti, cy - Math.sin(a) * R * ti); c.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R); c.stroke(); }
		// beams
		var S0 = P(u1, -La * 0.9), BS = [cx, cy], M1 = P(u1, La), M2 = P(u2, La), D = P(u2, -La * 0.9);
		c.strokeStyle = rgba(rgb, 0.55); c.lineWidth = 2;
		[[S0, BS], [BS, M1], [BS, M2], [BS, D]].forEach(function (s) { c.beginPath(); c.moveTo(s[0][0], s[0][1]); c.lineTo(s[1][0], s[1][1]); c.stroke(); });
		if (S.pulses) {
			var f = (tt * 0.3) % 1, p1 = [S0, BS, M1, BS, D], p2 = [S0, BS, M2, BS, D];
			[p1, p2].forEach(function (pp, k) { var pt = path(pp, f); c.fillStyle = k ? "#fbbf24" : "#22d3ee"; c.beginPath(); c.arc(pt[0], pt[1], 4.2, 0, 6.2832); c.fill(); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1; c.stroke(); });
		}
		// optics
		var m = R * 0.1; c.strokeStyle = COL.steel; c.lineWidth = 5; c.lineCap = "round";
		c.beginPath(); c.moveTo(M1[0] - u2[0] * m, M1[1] - u2[1] * m); c.lineTo(M1[0] + u2[0] * m, M1[1] + u2[1] * m); c.stroke();
		c.beginPath(); c.moveTo(M2[0] - u1[0] * m, M2[1] - u1[1] * m); c.lineTo(M2[0] + u1[0] * m, M2[1] + u1[1] * m); c.stroke();
		c.strokeStyle = "rgba(147,197,253,0.9)"; c.lineWidth = 4; var bs = R * 0.11; c.beginPath(); c.moveTo(cx - (u1[0] + u2[0]) * bs, cy - (u1[1] + u2[1]) * bs); c.lineTo(cx + (u1[0] + u2[0]) * bs, cy + (u1[1] + u2[1]) * bs); c.stroke(); c.lineCap = "butt";
		var gl = c.createRadialGradient(S0[0], S0[1], 1, S0[0], S0[1], R * 0.14); gl.addColorStop(0, rgba(rgb, 1)); gl.addColorStop(1, rgba(rgb, 0)); c.fillStyle = gl; c.beginPath(); c.arc(S0[0], S0[1], R * 0.14, 0, 6.2832); c.fill();
		c.fillStyle = COL.text; c.beginPath(); c.arc(D[0], D[1], R * 0.045, 0, 6.2832); c.fill(); c.fillStyle = COL.bg; c.beginPath(); c.arc(D[0], D[1], R * 0.02, 0, 6.2832); c.fill();
		label(c, "arm 1", M1[0] + u1[0] * (m + 22), M1[1] + u1[1] * (m + 22), COL.text, fs - 1, "center");
		label(c, "arm 2", M2[0] + u2[0] * (m + 22), M2[1] + u2[1] * (m + 22), COL.text, fs - 1, "center");
		label(c, "lamp", S0[0] - u1[0] * 14, S0[1] - u1[1] * 14 + 12, COL.dim, fs - 2, "center");
		label(c, "eyepiece", D[0] - u2[0] * 16, D[1] - u2[1] * 16 + 10, COL.dim, fs - 2, "center");
		label(c, "table: " + S.th.toFixed(0) + "°", A.x + 14, A.y + A.h - fs, COL.dim, fs);
		// fringes
		var Rf = Math.min(F.w * 0.4, F.h * 0.38), fx = F.x + F.w / 2, fy = F.y + F.h / 2 + fs * 0.4, k = 4.5, d0 = pos(0), d = pos(th), shift = d - d0;
		var ctx = off.getContext("2d"), img = ctx.createImageData(150, 150), dat = img.data, ph = shift;
		for (var yy = 0; yy < 150; yy++) for (var xx = 0; xx < 150; xx++) {
			var nx = (xx - 74.5) / 75, ny = (yy - 74.5) / 75, r2 = nx * nx + ny * ny, o = (yy * 150 + xx) * 4;
			if (r2 > 1) { dat[o + 3] = 0; continue; }
			var cs = Math.cos(Math.PI * (ph + k * r2)), I = 0.05 + 0.95 * cs * cs;
			dat[o] = rgb[0] * I; dat[o + 1] = rgb[1] * I; dat[o + 2] = rgb[2] * I; dat[o + 3] = 255;
		}
		ctx.putImageData(img, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(off, fx - Rf, fy - Rf, 2 * Rf, 2 * Rf);
		c.strokeStyle = COL.line; c.lineWidth = 3; c.beginPath(); c.arc(fx, fy, Rf, 0, 6.2832); c.stroke();
		if (S.ghost) { c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 1; c.setLineDash([4, 4]); for (var mm = 1; mm <= k; mm++) { c.beginPath(); c.arc(fx, fy, Rf * Math.sqrt(mm / k), 0, 6.2832); c.stroke(); } c.setLineDash([]); }
		label(c, "what the eyepiece shows", fx, F.y + fs + 4, COL.text, fs, "center");
		label(c, S.ghost ? "dashed circles: bright fringes at 0°" : "", fx, fy + Rf + fs * 1.3, COL.dim, fs - 1, "center");
		// readouts
		var N = bigN(), ab = M.armDifference(S.L, veff()), live = S.model === "aether";
		$("mm-r-move").textContent = M.fmtFringe(shift); $("mm-r-move-s").textContent = "since the table was at 0°";
		$("mm-r-n").textContent = M.fmtFringe(N); $("mm-r-n-s").textContent = live ? "N = 2 L v² / (λ c²)" : "the theory predicts none";
		$("mm-r-dt").textContent = live ? M.fmtTime(Math.abs(ab.dt)) : "0"; $("mm-r-dt-s").textContent = live ? "with the arm along the wind" : "arms always take the same time";
		$("mm-r-dp").textContent = live ? M.fmtLen(Math.abs(ab.dpath)) : "0"; $("mm-r-dp-s").textContent = live ? "= " + M.fmtSig(Math.abs(ab.dpath) / lamM(), 2) + " wavelengths" : "";
		var vd = !live ? ["No shift", "every orientation looks the same"] : N >= 0.1 ? ["Easily seen", "N is " + M.fmtSig(N / 0.01, 2) + "× the 0.01-fringe limit"] : N >= 0.01 ? ["Detectable", "just above the 0.01-fringe limit of 1880s observers"] : ["Too small to see", "below 0.01 fringe: need a longer arm or faster wind"];
		$("mm-r-v").textContent = vd[0]; $("mm-r-v-s").textContent = vd[1];
	}

	/* ================= tab 2: seen from the aether ================= */
	var fr = { t: 0, hold: 0 }, frPlaying = true;
	function frTimes() {
		var b = S.fb / 100, Lp = S.fc ? Math.sqrt(1 - b * b) : 1, vy = Math.sqrt(1 - b * b);
		return { b: b, Lp: Lp, vy: vy, t1a: Lp / (1 - b), t1: 2 * Lp / (1 - b * b), t2h: 1 / vy, t2: 2 / vy };
	}
	function drawFrame(dt) {
		var sz = sizeStage($("mm-stage2"), 0.46, 0.9), c = setup($("mm-fr"), sz.w, sz.h), T = frTimes(), b = T.b, fs = clamp(sz.w / 62, 11, 15);
		c.fillStyle = COL.bg; c.fillRect(0, 0, sz.w, sz.h);
		var total = Math.max(T.t1, T.t2);
		if (frPlaying) { if (fr.t < total) fr.t += dt * S.fs * 0.12; else { fr.hold += dt; if (fr.hold > 1.6) { fr.t = 0; fr.hold = 0; } } }
		var t = Math.min(fr.t, total);
		var x0 = -0.2, x1 = Math.max(T.t1a, b * total + T.Lp) + 0.25, y0 = -0.4, y1 = 1.4, pad = 14;
		var sc = Math.min((sz.w - 2 * pad) / (x1 - x0), (sz.h - 2 * pad - fs * 2) / (y1 - y0)), ox = (sz.w - sc * (x1 - x0)) / 2, oy = pad + fs * 1.4 + ((sz.h - 2 * pad - fs * 2) - sc * (y1 - y0)) / 2;
		function X(x) { return ox + (x - x0) * sc; } function Y(y) { return oy + (y1 - y) * sc; }
		// aether at rest: a lattice of dots
		c.fillStyle = "rgba(147,161,196,0.25)"; for (var gx = Math.ceil(x0 * 4) / 4; gx < x1; gx += 0.25) for (var gy = Math.ceil(y0 * 4) / 4; gy < y1; gy += 0.25) c.fillRect(X(gx) - 0.8, Y(gy) - 0.8, 1.6, 1.6);
		label(c, "the aether, at rest", 10, 12 + fs * 0.4, COL.dim, fs);
		// ghosts of the apparatus at t = 0
		function apparatus(tm, alpha) {
			var bx = b * tm; c.globalAlpha = alpha; c.strokeStyle = COL.steel; c.lineWidth = 2;
			c.beginPath(); c.moveTo(X(bx), Y(0)); c.lineTo(X(bx + T.Lp), Y(0)); c.moveTo(X(bx), Y(0)); c.lineTo(X(bx), Y(1)); c.stroke();
			c.lineWidth = 5; c.lineCap = "round"; c.beginPath(); c.moveTo(X(bx + T.Lp), Y(0) - 9); c.lineTo(X(bx + T.Lp), Y(0) + 9); c.moveTo(X(bx) - 9, Y(1)); c.lineTo(X(bx) + 9, Y(1)); c.stroke();
			c.strokeStyle = "rgba(147,197,253,1)"; c.beginPath(); c.moveTo(X(bx) - 6, Y(0) + 6); c.lineTo(X(bx) + 6, Y(0) - 6); c.stroke(); c.lineCap = "butt"; c.globalAlpha = 1;
		}
		apparatus(0, 0.28); apparatus(total, 0.28); apparatus(t, 1);
		// pulse 1 (with the wind): out at c, back at c
		var p1 = [[0, 0]], x1p; if (t <= T.t1a) x1p = t; else x1p = T.t1a - (t - T.t1a);
		p1.push([Math.min(t, T.t1a), 0]); if (t > T.t1a) p1.push([Math.max(x1p, b * Math.min(t, T.t1)), 0]);
		// pulse 2 (across): diagonal up, diagonal down
		var p2 = [[0, 0]], y2; if (t <= T.t2h) y2 = T.vy * t; else y2 = 1 - T.vy * (t - T.t2h);
		if (t <= T.t2h) p2.push([b * t, y2]); else { p2.push([b * T.t2h, 1]); p2.push([b * Math.min(t, T.t2), Math.max(y2, 0)]); }
		function trail(pts, col, dy) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); pts.forEach(function (p, i) { var px = X(p[0]), py = Y(p[1]) + dy; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.stroke(); }
		trail(p1, "rgba(34,211,238,0.75)", 3); trail(p2, "rgba(251,191,36,0.75)", 0);
		function dot(p, col, done) { c.fillStyle = col; c.beginPath(); c.arc(X(p[0]), Y(p[1]), done ? 5 : 6, 0, 6.2832); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 1.2; c.stroke(); }
		var e1 = p1[p1.length - 1], e2 = p2[p2.length - 1];
		dot(e1, "#22d3ee", t >= T.t1); dot(e2, "#fbbf24", t >= T.t2);
		if (t >= T.t1) label(c, "arm 1 back", X(e1[0]), Y(0) + 24, "#22d3ee", fs, "center");
		if (t >= T.t2) label(c, "arm 2 back", X(e2[0]), Y(0) - 20, "#fbbf24", fs, "center");
		label(c, "t = " + t.toFixed(2) + " L/c", sz.w - 10, 12 + fs * 0.4, COL.text, fs, "right");
		label(c, "→ apparatus moves at " + (b).toFixed(2) + " c", sz.w - 10, 12 + fs * 1.8, COL.dim, fs - 1, "right");
		label(c, "arm 1 (along the motion)", 10, sz.h - 22, "#22d3ee", fs - 1); label(c, "arm 2 (across)", 10, sz.h - 8, "#fbbf24", fs - 1);
		// readouts
		var u1 = T.t1 / 2, u2 = T.t2 / 2, dif = u1 - u2;
		$("mm-f-t1").textContent = u1.toFixed(4) + " ×"; $("mm-f-t2").textContent = u2.toFixed(4) + " ×"; $("mm-f-d").textContent = (dif >= 0 ? "+" : "−") + Math.abs(dif).toFixed(4) + " ×";
		var same = Math.abs(dif) < 1e-9;
		$("mm-f-first").textContent = same ? "Together" : dif > 0 ? "Arm 2" : "Arm 1"; $("mm-f-first-s").textContent = same ? "both beams get back at the same moment" : "by " + Math.abs(dif / u2 * 100).toFixed(1) + "% of a round trip";
		$("mm-f-explain").textContent = S.fc
			? "Arm 1 is contracted to " + T.Lp.toFixed(3) + " L. Now both round trips take " + u2.toFixed(4) + " × 2L/c, and the pulses return together: the delay and the contraction cancel for any speed. Switch the box off to see the delay come back."
			: "With the wind, arm 1 takes " + u1.toFixed(4) + " × 2L/c, and the beam across takes " + u2.toFixed(4) + " ×. The light going with the motion gains little on the way out and loses a lot catching the mirror again on the way back, so it falls behind by " + Math.abs(dif).toFixed(4) + " × 2L/c. At the Earth's real speed (v/c = 0.0001) that difference is about 5 × 10⁻⁹ of a round trip: tiny, but 11 m of arm turns it into a fifth of a wavelength.";
	}

	/* ================= tab 3: turntable run ================= */
	var chDirty = true, run = null;
	function invalidate() { run = null; chDirty = true; if (S.tab === "rot") newRun(); }
	function sigmaEff() { return S.sigma / Math.sqrt(S.turns); }
	function newRun() {
		run = M.simulateRun({ model: S.model, L: S.L, lambda: lamM(), v: S.v, felt: felt(), n: 16, turns: S.turns, sigma: S.sigma, windAz: S.az * Math.PI / 180, seed: S.seed });
		var f = M.fit2theta(run, S.L, lamM()), mean = 0, i; run.forEach(function (p) { mean += p.truth; }); mean /= run.length; run.mean = mean; run.fit = f;
		var curve = []; for (i = 0; i <= 180; i++) { var th = i * 2 * Math.PI / 180; curve.push({ th: th, y: M.fringePos(S.model, S.L, lamM(), S.v, th - S.az * Math.PI / 180, felt()) - mean }); }
		run.curve = curve; chDirty = true;
		var unc = sigmaEff() * Math.sqrt(2 / run.length), amp = f.amp, pred = 0; curve.forEach(function (p) { pred = Math.max(pred, Math.abs(p.y)); });
		var swing = 2 * amp, snr = amp / unc, found = amp > 3 * unc;
		$("mm-c-pred").textContent = M.fmtFringe(2 * pred);
		$("mm-c-meas").textContent = M.fmtFringe(swing); $("mm-c-meas-s").textContent = "± " + M.fmtSig(2 * unc, 2) + " fringe (1σ)";
		$("mm-c-v").textContent = found ? M.fmtSpeed(f.v) : "< " + M.fmtSpeed(C * Math.sqrt(3 * unc * lamM() / S.L)); $("mm-c-v-s").textContent = found ? "fitted wind, at table azimuth " + (f.azimuth * 180 / Math.PI).toFixed(0) + "°" : "no wobble above the noise: this is a 3σ upper limit";
		$("mm-c-snr").textContent = snr >= 100 ? M.fmtSig(snr, 3) + " : 1" : snr.toFixed(1) + " : 1"; $("mm-c-snr-s").textContent = found ? "a clear twice-per-turn signal" : "the 2θ wobble does not stand out";
		var live = S.model === "aether";
		$("mm-c-explain").textContent = live
			? "A stationary aether would swing the fringes by " + M.fmtFringe(2 * pred) + " over the turn. " + (found ? "That is " + M.fmtSig(snr, 2) + " times the noise, so the run finds it and recovers the wind. Michelson and Morley's real readings did not show this." : "With this noise the wobble is lost: try more turns, a longer arm or a faster wind.")
			: "This theory predicts no wobble at all, so everything you see is noise. The fit still returns a small amplitude (it always will); the honest result is an upper limit on the wind, which gets tighter as you average more turns or lengthen the arm.";
	}
	function drawChart() {
		if (!run) newRun();
		var sz = sizeStage($("mm-stage3"), 0.42, 0.85), c = setup($("mm-ch"), sz.w, sz.h), fs = clamp(sz.w / 62, 11, 14);
		c.fillStyle = COL.bg; c.fillRect(0, 0, sz.w, sz.h);
		var pl = 62, pr = 16, pt = 24, pb = 40, W = sz.w - pl - pr, H = sz.h - pt - pb, ymax = 0.025;
		run.curve.forEach(function (p) { ymax = Math.max(ymax, Math.abs(p.y) * 1.2); }); run.forEach(function (p) { ymax = Math.max(ymax, Math.abs(p.y - run.fit.c) * 1.15); });
		var nice = [0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; for (var i = 0; i < nice.length; i++) if (nice[i] >= ymax) { ymax = nice[i]; break; }
		function X(deg) { return pl + deg / 360 * W; } function Y(y) { return pt + H / 2 - y / ymax * H / 2; }
		if (S.band) { c.fillStyle = "rgba(34,211,238,0.12)"; c.fillRect(pl, Y(0.01), W, Y(-0.01) - Y(0.01)); label(c, "±0.01 fringe: about the smallest shift an 1880s observer could trust", pl + 6, Y(0.01) - 7, COL.cyan, fs - 1); }
		c.strokeStyle = COL.grid; c.lineWidth = 1; c.fillStyle = COL.dim;
		for (var d = 0; d <= 360; d += 45) { c.beginPath(); c.moveTo(X(d), pt); c.lineTo(X(d), pt + H); c.stroke(); label(c, d + "°", X(d), pt + H + 14, COL.dim, fs, "center"); }
		for (var k = -2; k <= 2; k++) { var yv = k * ymax / 2; c.beginPath(); c.moveTo(pl, Y(yv)); c.lineTo(pl + W, Y(yv)); c.stroke(); label(c, (yv > 0 ? "+" : "") + String(parseFloat(yv.toPrecision(2))), pl - 8, Y(yv), COL.dim, fs, "right"); }
		label(c, "table azimuth", pl + W / 2, sz.h - 8, COL.dim, fs, "center");
		c.save(); c.translate(14, pt + H / 2); c.rotate(-Math.PI / 2); label(c, "fringe position (fringes)", 0, 0, COL.dim, fs, "center"); c.restore();
		c.strokeStyle = "#e6ecfb"; c.lineWidth = 2; c.beginPath(); run.curve.forEach(function (p, i) { var x = X(p.th * 180 / Math.PI), y = Y(p.y); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
		if (S.fit) { c.strokeStyle = COL.gold; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); for (i = 0; i <= 180; i++) { var th = i * 2 * Math.PI / 180, y = run.fit.a * Math.cos(2 * th) + run.fit.b * Math.sin(2 * th); if (i) c.lineTo(X(i * 2), Y(y)); else c.moveTo(X(0), Y(y)); } c.stroke(); c.setLineDash([]); }
		run.forEach(function (p) { c.fillStyle = COL.red; c.beginPath(); c.arc(X(p.theta * 180 / Math.PI), Y(p.y - run.fit.c), 4, 0, 6.2832); c.fill(); });
		label(c, "● readings   — " + (S.model === "aether" ? "prediction" : "prediction (flat)") + (S.fit ? "   - - best fit" : ""), pl + W, 12, COL.text, fs, "right");
	}

	/* ================= tab 4: history ================= */
	function renderHist() {
		var orb = 29780, mx = 0, rows = M.HISTORY.map(function (h) { var n = M.shift90(h.L, h.lambda, orb); mx = Math.max(mx, n); return { h: h, n: n }; });
		$("mm-hist").innerHTML = rows.map(function (r) {
			return '<div class="mm-h"><div class="mm-h__y">' + esc(r.h.year) + '<small>' + esc(r.h.who) + '</small></div>' +
				'<div class="mm-h__t">' + esc(r.h.result) + '</div>' +
				'<div class="mm-h__n"><strong>' + esc(M.fmtSig(r.n, 2)) + ' fringe</strong> expected <small>(' + esc(M.fmtLen(r.h.L)) + ' arm, ' + Math.round(r.h.lambda * 1e9) + ' nm)</small><div class="mm-h__bar"><i style="width:' + Math.round(100 * r.n / mx) + '%"></i></div>Reported: ' + esc(r.h.reported) + '<br><button type="button" class="tu-btn tu-btn--ghost" data-load="' + r.h.id + '">Load this instrument</button></div></div>';
		}).join("");
		[].forEach.call($("mm-hist").querySelectorAll("[data-load]"), function (b) {
			b.onclick = function () { var h = M.HISTORY.filter(function (x) { return x.id === b.getAttribute("data-load"); })[0]; loadSetup(h.L, h.lambda * 1e9, orb, "aether"); setTab("lab", true); toast("Loaded: " + h.who); };
		});
	}

	/* ================= tab 5: calculator ================= */
	var lastAnswer = "";
	function parseLam(s) { var t = String(s).trim(); if (/^[\d.]+$/.test(t)) return parseFloat(t) * 1e-9; return M.parseLength(t); }
	function renderCalc() {
		var k = S.k, L = M.parseLength(k.L), lam = parseLam(k.lam), v = M.parseSpeed(k.v), N = parseFloat(String(k.N).replace(",", "."));
		[].forEach.call(root.querySelectorAll("[data-kmode]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-kmode") === k.mode)); });
		$("mm-k-fL").hidden = k.mode === "length"; $("mm-k-fv").hidden = k.mode === "speed"; $("mm-k-fN").hidden = k.mode === "shift";
		var ans = $("mm-k-ans"), facts = $("mm-k-facts"), items = [], out = null;
		var need = [[k.mode !== "length", L, "arm length"], [true, lam, "wavelength"], [k.mode !== "speed", v, "speed"], [k.mode !== "shift", N, "fringe shift"]].filter(function (r) { return r[0] && !(isFinite(r[1]) && r[1] > 0); });
		if (need.length) { ans.textContent = "Enter " + need.map(function (r) { return r[2]; }).join(", ") + "."; facts.innerHTML = ""; lastAnswer = ""; return; }
		function vs(n) { return n >= 0.01 ? "above" : "below"; }
		if (k.mode === "shift") {
			out = M.shift90(L, lam, v); ans.textContent = "N = " + M.fmtFringe(out); lastAnswer = "A " + M.fmtLen(L) + " arm at " + Math.round(lam * 1e9) + " nm and " + M.fmtSpeed(v) + " through a stationary aether gives a shift of " + M.fmtFringe(out) + " on a 90° turn.";
			var ab = M.armDifference(L, v);
			items = ["Path difference between the arms: <b>" + M.fmtLen(Math.abs(ab.dpath)) + "</b> (" + M.fmtSig(Math.abs(ab.dpath) / lam, 3) + " wavelengths); time difference <b>" + M.fmtTime(Math.abs(ab.dt)) + "</b>.", "Speed as a fraction of light: v/c = <b>" + M.fmtSig(v / C, 3) + "</b>, and the effect goes with its square, <b>" + M.fmtSig(v * v / (C * C), 3) + "</b>.", "That is " + vs(out) + " the 0.01 fringe an 1880s observer could trust (" + M.fmtSig(out / 0.01, 2) + "× the limit).", "Over one full turn the fringes swing <b>" + M.fmtFringe(out) + "</b> peak to peak, twice per turn."];
		} else if (k.mode === "speed") {
			out = M.speedFromShift(N, L, lam); ans.textContent = "v = " + M.fmtSpeed(out); lastAnswer = "A shift of " + M.fmtSig(N, 3) + " fringe in a " + M.fmtLen(L) + " arm at " + Math.round(lam * 1e9) + " nm means a speed of " + M.fmtSpeed(out) + " through the aether.";
			items = ["That is <b>" + M.fmtSig(out / 29780 * 100, 3) + "%</b> of the Earth's orbital speed (29.78 km/s) and v/c = " + M.fmtSig(out / C, 3) + ".", "Any shift smaller than N means a smaller speed: this is how an upper limit is quoted. Halving the shift lowers the speed only by √2.", "The 1887 instrument could not see less than about 0.01 fringe, which is <b>" + M.fmtSpeed(M.speedFromShift(0.01, 11, 5.7e-7)) + "</b> for its 11 m path."];
		} else {
			out = M.lengthForShift(N, lam, v); ans.textContent = "L = " + M.fmtLen(out); lastAnswer = "To see " + M.fmtSig(N, 3) + " fringe from " + M.fmtSpeed(v) + " at " + Math.round(lam * 1e9) + " nm you need an arm of " + M.fmtLen(out) + ".";
			items = ["That is <b>" + M.fmtSig(out / 11, 3) + "×</b> the effective path of the 1887 instrument (11 m).", "Fold the beam back and forth between mirrors to build a long path on a small table: a " + M.fmtLen(out) + " path takes about " + Math.max(1, Math.ceil(out / 1.5)) + " passes across a 1.5 m stone.", "Shorter wavelengths help: halving λ halves the length needed."];
		}
		facts.innerHTML = items.map(function (t) { return "<li>" + t + "</li>"; }).join("");
	}
	function bindCalc() {
		var map = { "mm-k-L": "L", "mm-k-l": "lam", "mm-k-v": "v", "mm-k-N": "N" };
		for (var id in map) (function (id, key) { $(id).value = S.k[key]; $(id).addEventListener("input", function () { S.k[key] = this.value; renderCalc(); save(); }); })(id, map[id]);
		[].forEach.call(root.querySelectorAll("[data-kmode]"), function (b) { b.onclick = function () { S.k.mode = b.getAttribute("data-kmode"); renderCalc(); save(); }; });
		$("mm-k-sp").innerHTML = M.SPEEDS.map(function (s) { return '<button type="button" class="tu-chip" data-ksp="' + s.v + '">' + esc(s.label) + ' (' + esc(M.fmtSpeed(s.v)) + ')</button>'; }).join(" ");
		[].forEach.call($("mm-k-sp").querySelectorAll("[data-ksp]"), function (b) { b.onclick = function () { S.k.v = M.fmtSig(parseFloat(b.getAttribute("data-ksp")) / 1e3, 5) + " km/s"; $("mm-k-v").value = S.k.v; if (S.k.mode === "speed") S.k.mode = "shift"; renderCalc(); save(); }; });
		$("mm-k-copy").onclick = function () { if (lastAnswer) copy(lastAnswer, "Answer copied"); };
		$("mm-k-link").onclick = function () { var o = new URLSearchParams(); o.set("tab", "calc"); o.set("mode", S.k.mode); o.set("kL", S.k.L); o.set("kl", S.k.lam); o.set("kv", S.k.v); o.set("kN", S.k.N); copy(location.origin + location.pathname + "?" + o.toString(), "Link copied"); };
		$("mm-k-open").onclick = function () {
			var L = M.parseLength(S.k.L), lam = parseLam(S.k.lam), v = M.parseSpeed(S.k.v), N = parseFloat(S.k.N);
			if (S.k.mode === "speed" && isFinite(N)) v = M.speedFromShift(N, L, lam); if (S.k.mode === "length" && isFinite(N)) L = M.lengthForShift(N, lam, v);
			if (!(L > 0 && lam > 0 && v > 0)) { toast("Fill in the numbers first"); return; }
			loadSetup(clamp(L, 0.1, 100), clamp(lam * 1e9, 400, 700), clamp(v, 100, 1e6), "aether"); setTab("lab", true);
		};
	}

	/* ================= set-up card (Interferometer + Turntable run) ================= */
	var vOf = function (s) { return 100 * Math.pow(10, 4 * s / 1000); }, vTo = function (v) { return 1000 * Math.log10(v / 100) / 4; };
	var lOf = function (s) { return 0.1 * Math.pow(10, 3 * s / 1000); }, lTo = function (L) { return 1000 * Math.log10(L / 0.1) / 3; };
	var sOf = function (s) { return 0.0005 * Math.pow(10, 2.6 * s / 1000); }, sTo = function (x) { return 1000 * Math.log10(x / 0.0005) / 2.6; };
	function loadSetup(L, lam, v, model) { S.L = L; S.lam = lam; S.v = v; S.felt = 100; if (model) S.model = model; paintSetup(); invalidate(); save(); }
	function paintSetup() {
		$("mm-model").value = S.model; $("mm-model-n").textContent = M.MODELS[S.model].note;
		$("mm-v").value = vTo(S.v); $("mm-v-v").textContent = M.fmtSpeed(S.v) + " (v/c = " + M.fmtSig(S.v / C, 2) + ")";
		$("mm-L").value = lTo(S.L); $("mm-L-v").textContent = M.fmtLen(S.L);
		$("mm-lam").value = S.lam; $("mm-lam-v").textContent = Math.round(S.lam) + " nm"; $("mm-felt").value = S.felt; $("mm-felt-v").textContent = Math.round(S.felt) + "%";
		$("mm-felt-f").style.opacity = S.model === "aether" ? 1 : 0.45;
		$("mm-th").value = S.th; $("mm-th-v").textContent = Math.round(S.th) + "°"; $("mm-spinspd").value = S.spinspd; $("mm-spinspd-v").textContent = S.spinspd + "°/s";
		$("mm-c-sig").value = sTo(S.sigma); $("mm-c-sig-v").textContent = M.fmtSig(S.sigma, 2) + " fringe"; $("mm-c-turns").value = S.turns; $("mm-c-turns-v").textContent = S.turns; $("mm-c-az").value = S.az; $("mm-c-az-v").textContent = Math.round(S.az) + "°";
		$("mm-ghost").checked = S.ghost; $("mm-pulses").checked = S.pulses; $("mm-c-fit").checked = S.fit; $("mm-c-band").checked = S.band;
		$("mm-f-b").value = S.fb; $("mm-f-b-v").textContent = (S.fb / 100).toFixed(2) + " c"; $("mm-f-s").value = S.fs; $("mm-f-s-v").textContent = S.fs; $("mm-f-contract").checked = S.fc;
		chDirty = true;
	}
	$("mm-model").innerHTML = Object.keys(M.MODELS).map(function (k) { return '<option value="' + k + '">' + esc(M.MODELS[k].name) + "</option>"; }).join("");
	$("mm-v-chips").innerHTML = M.SPEEDS.map(function (s) { return '<button type="button" class="tu-chip" data-sp="' + s.v + '" title="' + esc(s.label) + '">' + esc(s.label) + "</button>"; }).join(" ");
	var PRESETS = [{ n: "1881 Potsdam", L: 1.2, l: 590, v: 29780 }, { n: "1887 Cleveland", L: 11, l: 570, v: 29780 }, { n: "Miller 1925", L: 32, l: 570, v: 29780 }, { n: "Exaggerated wind: 100 km/s", L: 11, l: 570, v: 1e5 }, { n: "Desktop 1 m laser", L: 1, l: 633, v: 29780 }];
	$("mm-presets").innerHTML = PRESETS.map(function (p, i) { return '<button type="button" class="tu-chip" data-pre="' + i + '">' + esc(p.n) + "</button>"; }).join(" ");
	function ev(id, fn, evt) { $(id).addEventListener(evt || "input", function () { fn(this); paintSetup(); invalidate(); save(); }); }
	ev("mm-model", function (e) { S.model = e.value; }, "change");
	ev("mm-v", function (e) { S.v = vOf(parseFloat(e.value)); }); ev("mm-L", function (e) { S.L = lOf(parseFloat(e.value)); }); ev("mm-lam", function (e) { S.lam = parseFloat(e.value); }); ev("mm-felt", function (e) { S.felt = parseFloat(e.value); });
	ev("mm-th", function (e) { S.th = parseFloat(e.value); S.spin = false; paintSpin(); }); ev("mm-spinspd", function (e) { S.spinspd = parseFloat(e.value); });
	ev("mm-c-sig", function (e) { S.sigma = sOf(parseFloat(e.value)); }); ev("mm-c-turns", function (e) { S.turns = parseInt(e.value, 10); }); ev("mm-c-az", function (e) { S.az = parseFloat(e.value); });
	ev("mm-f-b", function (e) { S.fb = parseFloat(e.value); fr.t = 0; fr.hold = 0; }); ev("mm-f-s", function (e) { S.fs = parseFloat(e.value); });
	ev("mm-ghost", function (e) { S.ghost = e.checked; }, "change"); ev("mm-pulses", function (e) { S.pulses = e.checked; }, "change"); ev("mm-c-fit", function (e) { S.fit = e.checked; }, "change"); ev("mm-c-band", function (e) { S.band = e.checked; }, "change");
	ev("mm-f-contract", function (e) { S.fc = e.checked; fr.t = 0; fr.hold = 0; }, "change");
	[].forEach.call(root.querySelectorAll("[data-sp]"), function (b) { b.onclick = function () { S.v = parseFloat(b.getAttribute("data-sp")); paintSetup(); invalidate(); save(); }; });
	[].forEach.call(root.querySelectorAll("[data-pre]"), function (b) { b.onclick = function () { var p = PRESETS[+b.getAttribute("data-pre")]; loadSetup(p.L, p.l, p.v, "aether"); }; });
	function paintSpin() { var b = $("mm-spin"); b.setAttribute("aria-pressed", String(S.spin)); b.textContent = S.spin ? "❚❚ Stop turning" : "↻ Turn the table"; }
	$("mm-spin").onclick = function () { S.spin = !S.spin; paintSpin(); };
	$("mm-zero").onclick = function () { S.th = 0; S.spin = false; paintSpin(); paintSetup(); };
	$("mm-c-new").onclick = function () { S.seed = 1 + Math.floor(Math.random() * 99999); invalidate(); };
	$("mm-f-play").onclick = function () { frPlaying = !frPlaying; this.setAttribute("aria-pressed", String(frPlaying)); this.textContent = frPlaying ? "❚❚ Pause" : "▶ Play"; };
	$("mm-f-replay").onclick = function () { fr.t = 0; fr.hold = 0; if (!frPlaying) $("mm-f-play").click(); };

	/* ================= tabs, theatre, full screen ================= */
	function setTab(t, fromUser) {
		if (TABS.indexOf(t) < 0) t = "lab"; S.tab = t;
		TABS.forEach(function (k) { var on = k === t; $("mm-p-" + k).hidden = !on; $("mm-t-" + k).setAttribute("aria-selected", String(on)); $("mm-t-" + k).tabIndex = on ? 0 : -1; });
		$("mm-setup").hidden = !(t === "lab" || t === "rot");
		if (t === "rot") invalidate(); if (t === "calc") renderCalc(); if (t === "frame") { fr.t = 0; fr.hold = 0; }
		paintSetup(); save();
		if (fromUser) { var u = new URL(location.href); u.search = ""; history.replaceState(null, "", u.pathname); }
	}
	[].forEach.call(root.querySelectorAll(".mm-tabs button"), function (b) {
		b.onclick = function () { setTab(b.getAttribute("data-tab"), true); };
		b.onkeydown = function (e) { var i = TABS.indexOf(b.getAttribute("data-tab")); if (e.key === "ArrowRight") { setTab(TABS[(i + 1) % TABS.length], true); $("mm-t-" + S.tab).focus(); e.preventDefault(); } else if (e.key === "ArrowLeft") { setTab(TABS[(i + TABS.length - 1) % TABS.length], true); $("mm-t-" + S.tab).focus(); e.preventDefault(); } };
	});
	function paintTheatre() { $("mm-theatre").setAttribute("aria-pressed", String(document.documentElement.classList.contains("page-theatre"))); }
	$("mm-theatre").onclick = function () {
		var on = !document.documentElement.classList.contains("page-theatre");
		document.documentElement.classList.toggle("page-theatre", on); document.documentElement.classList.toggle("page-wide", on);
		try { localStorage.setItem("pageMode", on ? "theatre" : "std"); localStorage.setItem("pageWide", on ? "1" : "0"); } catch (e) {}
		paintTheatre(); chDirty = true;
	};
	paintTheatre();
	$("mm-full1").onclick = function () { toggleFull("mm-wrap1"); }; $("mm-full2").onclick = function () { toggleFull("mm-wrap2"); };
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (S.tab === "lab" && e.key === " " && tag !== "button") { e.preventDefault(); $("mm-spin").click(); }
	});

	/* ================= main loop ================= */
	var last = 0, vis = true;
	document.addEventListener("visibilitychange", function () { vis = !document.hidden; last = 0; });
	function frame(ts) {
		requestAnimationFrame(frame);
		if (!vis) return;
		var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts;
		if (S.tab === "lab") drawLab(dt);
		else if (S.tab === "frame") drawFrame(dt);
		else if (S.tab === "rot") { if (!run) newRun(); if (chDirty) { drawChart(); chDirty = false; } }
	}
	var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { chDirty = true; }, 60); });
	document.addEventListener("fullscreenchange", function () { chDirty = true; });

	renderHist(); bindCalc(); renderCalc(); paintSetup(); paintSpin();
	setTab(S.tab, false);
	if (q.get("tab") || q.get("m") || q.get("v") || q.get("mode")) history.replaceState(null, "", location.pathname);
	requestAnimationFrame(frame);
})();
