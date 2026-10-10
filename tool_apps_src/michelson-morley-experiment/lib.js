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
