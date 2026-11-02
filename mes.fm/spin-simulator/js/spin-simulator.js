/* MES Spin & Angular Momentum Simulator -- pure maths (no DOM). Browser global `MESSpin`; node: require('./tool_apps_src/spin-simulator/lib.js');
 * tests: node tool_apps_src/spin-simulator-tests.js
 * SI units inside (tesla, metres, seconds, kg, J s). Angles in radians unless a name ends in Deg.
 * 1. Neutron interferometry (Rauch et al. 1975, Werner et al. 1975): a spin-1/2 neutron precessing by alpha in a field picks up the spinor
 *    factor exp(-i alpha sigma/2), so the interference term goes as cos(alpha/2): dark at 360 degrees, bright again at 720.
 * 2. Einstein-de Haas (1915): flipping the magnetization of a hanging iron rod turns the rod, since body + electrons keep their angular momentum.
 *    Electrons: L_e = -mu / gamma', gamma' = g' e / (2 m_e). Torsion fibre: I theta'' = -kappa theta - c theta' + (torque from the electrons).
 * 3. Barnett (1915): spinning the rod at omega acts like a field B = omega / gamma' on the electron spins, so it magnetizes (opposite to omega). */
(function (root) {
	"use strict";
	var H = 6.62607015e-34, MN = 1.67492750056e-27, GN = 1.83247171e8, E = 1.602176634e-19, ME = 9.1093837015e-31, MU0 = 1.25663706212e-6, MUB = 9.2740100783e-24;
	var TAU = 2 * Math.PI;

	/* ---------- random numbers (seeded, so scans and tests repeat) ---------- */
	function rng(seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
	function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
	function poisson(lam, r) {
		if (!(lam > 0)) return 0;
		if (lam < 40) { var L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
		return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(r)));
	}

	/* ====================================================== 1. neutrons ====================================================== */
	function speedFromLambda(lamA) { return H / (MN * lamA * 1e-10); }          // angstrom -> m/s
	function lambdaFromSpeed(v) { return H / (MN * v) * 1e10; }                 // m/s -> angstrom
	function energyMeV(v) { return 0.5 * MN * v * v / E * 1000; }               // kinetic energy in meV
	function larmor(B, L, v) { return GN * B * L / v; }                         // precession angle (rad) after a field region of length L at speed v
	function fieldFor(alpha, L, v) { return alpha * v / (GN * L); }             // field (T) that gives the precession angle alpha
	function larmorFreq(B) { return GN * B / TAU; }                             // Hz
	function coilCurrent(B, nPerM) { return B / (MU0 * nPerM); }                // long solenoid, B = mu0 n I
	/* fraction of the full beam that reaches a detector. spin 0.5: interference term cos(alpha/2) (spinor); spin 1: cos(alpha) (a classical vector turns back on itself at 360)
	   chi = phase shifter, vis = contrast 0..1, beam 'O' (the forward beam) or 'H' (the other one: complementary) */
	function intensity(alpha, o) {
		o = o || {}; var k = o.spin === 1 ? 1 : 0.5, vis = o.vis == null ? 1 : o.vis, c = Math.cos(k * alpha + (o.chi || 0));
		return o.beam === "H" ? (1 - vis * c) / 2 : (1 + vis * c) / 2;
	}
	/* the spinor itself: a spin-1/2 state turned by alpha about z gets the factor exp(-i alpha/2) on spin up. Returns the sign seen when it comes back round. */
	function spinorPhase(alpha) { return { re: Math.cos(alpha / 2), im: -Math.sin(alpha / 2) }; }
	function vectorPhase(alpha) { return { re: Math.cos(alpha), im: -Math.sin(alpha) }; }
	/* intensity period in field units: spin 1/2 needs alpha = 4 pi for one full fringe */
	function fringePeriodB(L, v, spin) { return fieldFor(spin === 1 ? TAU : 2 * TAU, L, v); }
	/* convert a measured fringe period (in tesla) into "how many degrees of precession bring the intensity back" */
	function periodDeg(PB, L, v) { return larmor(PB, L, v) * 180 / Math.PI; }
	/* a field scan: counts in the O beam at each field, counting time t per point, rate = counts/s at full brightness, bg = flat background counts/s */
	function scan(o) {
		var r = rng(o.seed || 1), xs = o.Bs, n = [], ex = [];
		for (var i = 0; i < xs.length; i++) {
			var a = larmor(xs[i], o.L, o.v), m = (o.rate * intensity(a, { spin: o.spin, chi: o.chi, vis: o.vis, beam: o.beam }) + (o.bg || 0)) * o.t;
			ex.push(m); n.push(poisson(m, r));
		}
		return { x: xs.slice(), n: n, expect: ex };
	}
	function linspace(a, b, n) { var o = []; for (var i = 0; i < n; i++) o.push(n === 1 ? a : a + (b - a) * i / (n - 1)); return o; }
	/* weighted least squares y = a + b cos(2 pi x / P) + c sin(2 pi x / P) for a fixed P (weights 1 / max(y, 1), i.e. Poisson errors) */
	function fitAt(x, y, P) {
		var S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], R = [0, 0, 0], k = TAU / P;
		for (var i = 0; i < x.length; i++) {
			var w = 1 / Math.max(y[i], 1), f = [1, Math.cos(k * x[i]), Math.sin(k * x[i])];
			for (var a = 0; a < 3; a++) { R[a] += w * f[a] * y[i]; for (var b = 0; b < 3; b++) S[a][b] += w * f[a] * f[b]; }
		}
		var p = solve3(S, R); if (!p) return null;
		var chi = 0; for (var j = 0; j < x.length; j++) { var m = p[0] + p[1] * Math.cos(k * x[j]) + p[2] * Math.sin(k * x[j]), d = y[j] - m; chi += d * d / Math.max(y[j], 1); }
		return { a: p[0], b: p[1], c: p[2], chi2: chi, P: P };
	}
	function solve3(A, b) {
		var M = A.map(function (r, i) { return r.concat([b[i]]); });
		for (var c = 0; c < 3; c++) {
			var piv = c; for (var r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
			if (Math.abs(M[piv][c]) < 1e-300) return null; var t = M[c]; M[c] = M[piv]; M[piv] = t;
			for (var r2 = 0; r2 < 3; r2++) if (r2 !== c) { var f = M[r2][c] / M[c][c]; for (var k = c; k < 4; k++) M[r2][k] -= f * M[c][k]; }
		}
		return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
	}
	/* best period between pmin and pmax: coarse grid, golden refine, error where chi2 rises by 1 (scaled by the reduced chi2 when it is above 1) */
	function fitPeriod(x, y, pmin, pmax) {
		var best = null, N = 400;
		for (var i = 0; i <= N; i++) { var P = pmin * Math.pow(pmax / pmin, i / N), f = fitAt(x, y, P); if (f && (!best || f.chi2 < best.chi2)) best = f; }
		if (!best) return null;
		var lo = best.P * Math.pow(pmax / pmin, -1 / N), hi = best.P * Math.pow(pmax / pmin, 1 / N), g = (Math.sqrt(5) - 1) / 2;
		for (var it = 0; it < 60; it++) { var m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo); if (fitAt(x, y, m1).chi2 < fitAt(x, y, m2).chi2) hi = m2; else lo = m1; }
		best = fitAt(x, y, (lo + hi) / 2);
		var red = Math.max(1, best.chi2 / Math.max(1, x.length - 4)), target = best.chi2 + red;
		function edge(dir) { var s = best.P * 0.0005, P = best.P; for (var k = 0; k < 4000; k++) { P += dir * s; var f = fitAt(x, y, P); if (!f || f.chi2 >= target) return P; s *= 1.01; } return P; }
		var pl = edge(-1), ph = edge(1), amp = Math.hypot(best.b, best.c);
		return { P: best.P, err: (ph - pl) / 2, a: best.a, b: best.b, c: best.c, chi2: best.chi2, vis: best.a > 0 ? amp / best.a : 0, phase: Math.atan2(-best.c, best.b) };
	}
	var NPRESETS = [
		{ id: "zero", name: "No field", B: 0 },
		{ id: "360", name: "One full turn: 360°", alphaDeg: 360 },
		{ id: "720", name: "Two full turns: 720°", alphaDeg: 720 },
		{ id: "180", name: "Half a turn: 180°", alphaDeg: 180 },
		{ id: "werner", name: "Like Werner et al. 1975", lam: 1.445, Lcm: 2.96, vis: 0.3, alphaDeg: 720 }
	];

	/* ====================================================== 2. Einstein-de Haas ====================================================== */
	/* g' = the magneto-mechanical ratio factor: mu = g' (e / 2 m_e) L_electrons. Orbital motion alone would give 1, electron spin 2.0023. */
	var MATERIALS = [
		{ id: "iron", name: "Iron (measured g' ≈ 1.92)", g: 1.92, Ms: 1.71e6, rho: 7874 },
		{ id: "nickel", name: "Nickel (g' ≈ 1.84)", g: 1.84, Ms: 4.85e5, rho: 8908 },
		{ id: "cobalt", name: "Cobalt (g' ≈ 1.85)", g: 1.85, Ms: 1.40e6, rho: 8900 },
		{ id: "orbit", name: "What 1915 expected: orbits only (g' = 1)", g: 1, Ms: 1.71e6, rho: 7874 },
		{ id: "spin", name: "Pure electron spin (g = 2.0023)", g: 2.0023, Ms: 1.71e6, rho: 7874 }
	];
	function matOf(id) { for (var i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].id === id) return MATERIALS[i]; return MATERIALS[0]; }
	function gammaPrime(g) { return g * E / (2 * ME); }
	function cylinder(o) {                                                      // o: r, len (m), rho, Ms
		var V = Math.PI * o.r * o.r * o.len, m = o.rho * V;
		return { V: V, m: m, I: 0.5 * m * o.r * o.r, muSat: o.Ms * V };
	}
	function electronL(mu, g) { return -mu / gammaPrime(g); }                  // electron angular momentum carried by a magnetic moment mu
	function kickL(dMu, g) { return dMu / gammaPrime(g); }                      // angular momentum the body gets when the moment changes by dMu
	function gFrom(dMu, dL) { return (2 * ME / E) * dMu / dL; }                 // what an experimenter infers from a measured kick
	function flipAmp(dL, I, kappa) { return dL / Math.sqrt(I * kappa); }        // first swing after a sudden kick, rod on a torsion fibre (rad)
	function kappaFor(I, period) { var w = TAU / period; return I * w * w; }

	/* the rod on its fibre. p: I, kappa (0 = no fibre, free), c (damping N m s), tauM (magnetization response s), g, muSat, noise (random torque, N m per sqrt(Hz)), seed
	   drive: field target -1 / 0 / +1, or ac: frequency (Hz) of a square-wave reversal */
	function EdH(p) {
		var s = { t: 0, th: 0, w: 0, mu: 0, field: 0, Llab: 0, L0: 0, ac: 0, acPhase: 1, meas: null, gs: [], kicks: 0 }, r = rng(p.seed || 7);
		function gp() { return gammaPrime(p.g); }
		function Lb() { return p.I * s.w; }
		function Le() { return -s.mu / gp(); }
		function setField(f) { if (f === s.field) return; s.field = f; startMeas(); }
		function startMeas() { s.meas = { t0: s.t, mu0: s.mu, Lb0: Lb(), imp: 0 }; }
		function step(dt) {
			var n = Math.max(1, Math.ceil(dt / maxDt())), h = dt / n;
			for (var i = 0; i < n; i++) sub(h);
		}
		function maxDt() { var lim = p.tauM / 8; if (p.kappa > 0) lim = Math.min(lim, TAU / Math.sqrt(p.kappa / p.I) / 200); return lim; }
		function sub(h) {
			if (s.ac > 0) { var ph = Math.floor(2 * s.ac * (s.t + h)) % 2 === 0 ? 1 : -1; if (ph !== s.acPhase) { s.acPhase = ph; s.field = ph; startMeas(); } }
			var target = s.field * p.muSat, mu1 = target + (s.mu - target) * Math.exp(-h / p.tauM), dMu = mu1 - s.mu; s.mu = mu1;
			s.w += kickL(dMu, p.g) / p.I;                                     // electrons' angular momentum goes the other way: the body takes it
			var tf = -(p.kappa || 0) * s.th - (p.c || 0) * s.w, tn = p.noise ? p.noise * gauss(r) / Math.sqrt(h) : 0, tq = tf + tn;
			s.w += tq / p.I * h; s.th += s.w * h; s.Llab -= tq * h;            // what the fibre and the room took
			if (s.meas) {
				s.meas.imp += -tf * h;                                         // the experimenter knows kappa and c, so adds back the fibre's own torque
				if (s.t - s.meas.t0 >= 6 * p.tauM) {
					var dL = Lb() - s.meas.Lb0 + s.meas.imp, dm = s.mu - s.meas.mu0;
					if (Math.abs(dm) > 0.2 * p.muSat && Math.abs(dL) > 0) { s.gs.push(gFrom(dm, dL)); if (s.gs.length > 12) s.gs.shift(); s.kicks++; }
					s.meas = null;
				}
			}
			s.t += h;
		}
		function gMeasured() { if (!s.gs.length) return NaN; var a = 0; s.gs.forEach(function (x) { a += x; }); return a / s.gs.length; }
		function total() { return Lb() + Le() + s.Llab; }
		function reset() { s.t = 0; s.th = 0; s.w = 0; s.mu = 0; s.field = 0; s.Llab = 0; s.ac = 0; s.acPhase = 1; s.meas = null; s.gs = []; s.kicks = 0; }
		return { s: s, p: p, step: step, setField: setField, Lb: Lb, Le: Le, total: total, gMeasured: gMeasured, reset: reset,
			setAC: function (f) { s.ac = f > 0 ? f : 0; if (s.ac) { s.acPhase = 0; } } };
	}
	/* resonance: a square-wave field reversal at the fibre's frequency adds 2 mu_s / gamma' of angular momentum every half period; the amplitude grows
	   until damping takes as much per half period: steady amplitude = (4 / pi) * 2 dL1 * ... -> we just give the per-half-period growth */
	function resonantGrowth(muSat, g, I, kappa) { return flipAmp(2 * muSat / gammaPrime(g), I, kappa); }

	/* ====================================================== 3. Barnett ====================================================== */
	/* spinning at omega (rad/s): equivalent field B = omega / gamma' (Larmor's theorem). chi = the rod's effective susceptibility (shape included). The moment points
	   AGAINST omega for electrons (negative charge). */
	function barnett(omega, chi, g, V) {
		var B = omega / gammaPrime(g), Hh = B / MU0, M = -chi * Hh, mu = M * V;
		return { B: B, H: Hh, M: M, mu: mu, Le: electronL(mu, g) };
	}
	function dipoleField(mu, d, onAxis) { return MU0 / (4 * Math.PI) * (onAxis ? 2 : 1) * mu / (d * d * d); }
	function rpmToOmega(rpm) { return rpm * TAU / 60; }

	var api = {
		C: { h: H, mn: MN, gn: GN, e: E, me: ME, mu0: MU0, muB: MUB }, rng: rng, gauss: gauss, poisson: poisson, linspace: linspace,
		speedFromLambda: speedFromLambda, lambdaFromSpeed: lambdaFromSpeed, energyMeV: energyMeV, larmor: larmor, fieldFor: fieldFor, larmorFreq: larmorFreq,
		coilCurrent: coilCurrent, intensity: intensity, spinorPhase: spinorPhase, vectorPhase: vectorPhase, fringePeriodB: fringePeriodB, periodDeg: periodDeg,
		scan: scan, fitAt: fitAt, fitPeriod: fitPeriod, NPRESETS: NPRESETS,
		MATERIALS: MATERIALS, matOf: matOf, gammaPrime: gammaPrime, cylinder: cylinder, electronL: electronL, kickL: kickL, gFrom: gFrom, flipAmp: flipAmp,
		kappaFor: kappaFor, EdH: EdH, resonantGrowth: resonantGrowth, barnett: barnett, dipoleField: dipoleField, rpmToOmega: rpmToOmega
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESSpin = api;
})(this);

/* Spin & Angular Momentum Simulator UI: neutron interferometer (the 720 degree turn), Einstein-de Haas, Barnett.
   Maths: MESSpin (node-tested: tool_apps_src/spin-simulator-tests.js). State: localStorage mes-spin-simulator:v1; links ?tab=neutron|edh|barnett */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sn"); if (!root) return;
	var M = window.MESSpin, KEY = "mes-spin-simulator:v1", TAU = Math.PI * 2, DEG = Math.PI / 180;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { v = Number(v); return v !== null && isFinite(v) && v >= lo && v <= hi ? v : d; }
	function mi(s) { return String(s).replace(/-/g, "−"); }
	function sg(x, d) { if (!isFinite(x)) return "–"; var a = Math.abs(x); return mi(a >= 1000 ? Math.round(x).toLocaleString("en-US") : a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(d == null ? 1 : d) : x.toFixed(d == null ? 2 : d)); }
	var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
	function sci(x, d) { if (!isFinite(x)) return "–"; if (x === 0) return "0"; var e = Math.floor(Math.log10(Math.abs(x))); if (e >= -2 && e < 4) return sg(x, d == null ? 3 : d); var m = x / Math.pow(10, e); return mi(m.toFixed(d == null ? 2 : d)) + "×10" + String(e).replace(/./g, function (c) { return SUP[c]; }); }
	var q = new URLSearchParams(location.search), saved = sget(), toastT;
	function toast(msg) { var t = $("sn-toast"); if (!t) { t = document.createElement("div"); t.id = "sn-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function ro(box, items) { box.innerHTML = items.map(function (it) { return '<div class="sn-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function setPressed(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }
	function png(cv, name) { try { var a = document.createElement("a"); a.download = name + ".png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } }
	function fitStage(stage, natural) {
		var wrap = stage.parentNode, w = wrap.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
		wrap.setAttribute("data-mes-free", "1");
		var h = natural(w); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(200, Math.round(h)); stage.style.width = w + "px"; stage.style.height = h + "px";
		var cv = stage.querySelector("canvas"), cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
		return { W: w, H: h, c: c, cv: cv };
	}
	Array.prototype.forEach.call(root.querySelectorAll(".sn-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".sn-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});
	var COL = { bg: "#070b14", grid: "#1c2436", axis: "#5d6a86", text: "#d6dcea", dim: "#8792aa", o: "#ffd166", h: "#4cc9f0", sp: "#ff8c42", vec: "#a78bfa", fit: "#7ee2a8", body: "#ff8c42", el: "#4cc9f0", lab: "#a78bfa", tot: "#e8ecf5" };
	function txt(c, s, x, y, o) { o = o || {}; c.font = (o.b ? "600 " : "") + (o.size || 12) + "px system-ui,sans-serif"; c.fillStyle = o.col || COL.text; c.textAlign = o.al || "left"; c.textBaseline = o.bl || "alphabetic"; c.fillText(s, x, y); }

	/* ---------- a tiny 3D camera (z up) ---------- */
	function proj(cam, x, y, z) {
		var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), x1 = x * c - y * s, y1 = x * s + y * c, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		var up = z * cp + y1 * sp, d = y1 * cp - z * sp, f = cam.F / (cam.F + d);
		return { x: cam.cx + x1 * cam.k * f, y: cam.cy - up * cam.k * f, d: d, f: f };
	}
	/* scale and centre a camera so the given 3D points fill the box (top / bottom / side margins in px) */
	function fitCam(cam, W, H, pts, top, bot, side) {
		cam.k = 1; cam.cx = 0; cam.cy = 0; var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
		pts.forEach(function (p) { var q = proj(cam, p[0], p[1], p[2]); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
		cam.k = Math.min((W - 2 * side) / Math.max(1e-6, x1 - x0), (H - top - bot) / Math.max(1e-6, y1 - y0));
		cam.cx = W / 2 - cam.k * (x0 + x1) / 2; cam.cy = top + (H - top - bot) / 2 - cam.k * (y0 + y1) / 2;
	}
	function facing(cam, nx, ny, nz) { var c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), y1 = nx * s + ny * c; return y1 * Math.cos(cam.pitch) - nz * Math.sin(cam.pitch) < 0; }
	function line3(c, cam, a, b, col, w, dash) { var p = proj(cam, a[0], a[1], a[2]), r = proj(cam, b[0], b[1], b[2]); c.strokeStyle = col; c.lineWidth = w || 1.5; c.setLineDash(dash || []); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(r.x, r.y); c.stroke(); c.setLineDash([]); }
	function box3(c, cam, x0, x1, y0, y1, z0, z1, fill, alpha, edge) {
		var V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
		var F = [[0, 1, 2, 3, 0, 0, -1, 0.55], [4, 5, 6, 7, 0, 0, 1, 1], [0, 1, 5, 4, 0, -1, 0, 0.8], [2, 3, 7, 6, 0, 1, 0, 0.8], [1, 2, 6, 5, 1, 0, 0, 0.68], [3, 0, 4, 7, -1, 0, 0, 0.68]];
		var P = V.map(function (v) { return proj(cam, v[0], v[1], v[2]); });
		F = F.map(function (f) { return { f: f, d: (P[f[0]].d + P[f[1]].d + P[f[2]].d + P[f[3]].d) / 4 }; }).sort(function (a, b) { return b.d - a.d; });
		c.save(); c.globalAlpha = alpha == null ? 1 : alpha;
		F.forEach(function (o) { var f = o.f; if (alpha == null && !facing(cam, f[4], f[5], f[6])) return; c.beginPath(); for (var i = 0; i < 4; i++) { var p = P[f[i]]; if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); } c.closePath(); c.fillStyle = shade(fill, f[7]); c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1; c.stroke(); } });
		c.restore();
	}
	function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(r * k) + "," + Math.round(g * k) + "," + Math.round(b * k) + ")"; }
	function arrow2(c, x0, y0, x1, y1, col, w, head) { var a = Math.atan2(y1 - y0, x1 - x0), h = head || 7; c.strokeStyle = c.fillStyle = col; c.lineWidth = w || 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - Math.cos(a) * h * 0.6, y1 - Math.sin(a) * h * 0.6); c.stroke(); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); c.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); c.closePath(); c.fill(); }
	function arrow3(c, cam, a, b, col, w) { var p = proj(cam, a[0], a[1], a[2]), r = proj(cam, b[0], b[1], b[2]); arrow2(c, p.x, p.y, r.x, r.y, col, w, Math.max(5, 9 * r.f)); }
	/* drag to turn a camera; arrow keys too */
	function orbit(cv, cam, redraw, def) {
		var drag = null;
		cv.addEventListener("pointerdown", function (e) { drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; try { cv.setPointerCapture(e.pointerId); } catch (er) {} });
		cv.addEventListener("pointermove", function (e) { if (!drag) return; cam.yaw = drag.yaw + (e.clientX - drag.x) * 0.008; cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.006, -0.15, 1.35); redraw(); });
		function end() { drag = null; } cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
		cv.addEventListener("keydown", function (e) { var k = e.key; if (k === "ArrowLeft") cam.yaw -= 0.08; else if (k === "ArrowRight") cam.yaw += 0.08; else if (k === "ArrowUp" && !def.keysUp) cam.pitch = clamp(cam.pitch + 0.06, -0.15, 1.35); else if (k === "ArrowDown" && !def.keysUp) cam.pitch = clamp(cam.pitch - 0.06, -0.15, 1.35); else return; e.preventDefault(); redraw(); });
		return function reset() { cam.yaw = def.yaw; cam.pitch = def.pitch; redraw(); };
	}
	/* ---------- a plain line plot ---------- */
	function niceStep(range, n) { var s = range / n, p = Math.pow(10, Math.floor(Math.log10(s))), f = s / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
	function frame(c, r, o) {
		var X = function (t) { return r.x + (t - o.x0) / (o.x1 - o.x0) * r.w; }, Y = function (v) { return r.y + r.h - (v - o.y0) / (o.y1 - o.y0) * r.h; };
		c.save(); c.font = "11px system-ui,sans-serif"; c.lineWidth = 1;
		var ys = o.ys || niceStep(o.y1 - o.y0, Math.max(2, Math.floor(r.h / 30))); c.textAlign = "right"; c.textBaseline = "middle";
		for (var v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r.x, Y(v) + 0.5); c.lineTo(r.x + r.w, Y(v) + 0.5); c.stroke(); c.fillStyle = COL.dim; c.fillText(mi(String(+v.toPrecision(6))), r.x - 4, Y(v)); }
		var xs = o.xs || niceStep(o.x1 - o.x0, Math.max(2, Math.floor(r.w / 70))); c.textAlign = "center"; c.textBaseline = "top";
		for (var t = Math.ceil(o.x0 / xs - 1e-9) * xs; t <= o.x1 + 1e-9; t += xs) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(X(t) + 0.5, r.y); c.lineTo(X(t) + 0.5, r.y + r.h); c.stroke(); c.fillStyle = COL.dim; c.fillText(mi(String(+t.toPrecision(6))) + (o.xu || ""), X(t), r.y + r.h + 3); }
		c.strokeStyle = COL.axis; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
		if (o.xl) { c.textAlign = "right"; c.fillStyle = COL.dim; c.fillText(o.xl, r.x + r.w, r.y + r.h + 17); }
		if (o.yl) { c.save(); c.translate(r.x - 36, r.y + r.h / 2); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.textBaseline = "bottom"; c.fillStyle = COL.dim; c.fillText(o.yl, 0, 0); c.restore(); }
		c.restore();
		if (o.title) txt(c, o.title, r.x + 6, r.y + 15, { b: 1, size: 11 });
		return { X: X, Y: Y };
	}
	function trace(c, r, f, xs, ys, col, w, dash) { c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); c.strokeStyle = col; c.lineWidth = w || 1.6; c.setLineDash(dash || []); c.beginPath(); for (var i = 0; i < xs.length; i++) { var x = f.X(xs[i]), y = f.Y(ys[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); c.restore(); }
	function legend(c, r, items) { /* one line at the top right, or (narrow plots) left-aligned rows under the title */
		c.save(); c.font = "11px system-ui,sans-serif"; c.textBaseline = "top"; var tot = 0; items.forEach(function (it) { tot += c.measureText(it[0]).width + 12; });
		if (tot < r.w - 230) { c.textAlign = "right"; var x = r.x + r.w - 6; for (var j = items.length - 1; j >= 0; j--) { c.fillStyle = items[j][1]; c.fillText(items[j][0], x, r.y + 5); x -= c.measureText(items[j][0]).width + 12; } }
		else { c.textAlign = "left"; var x2 = r.x + 6, y = r.y + 21; items.forEach(function (it) { var wd = c.measureText(it[0]).width; if (x2 + wd > r.x + r.w - 4) { x2 = r.x + 6; y += 14; } c.fillStyle = it[1]; c.fillText(it[0], x2, y); x2 += wd + 12; }); }
		c.restore(); }

	/* ======================================================= tabs ======================================================= */
	var tab = /^(neutron|edh|barnett)$/.test(q.get("tab") || "") ? q.get("tab") : (saved.tab || "neutron");
	function setTab(t, init) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init) { sset({ tab: t }); try { var u = new URL(location.href); u.search = t === "neutron" ? "" : "?tab=" + t; history.replaceState(null, "", u); } catch (e) {} }
		setTimeout(onResize, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function slider(id, get, set, fmt) { var el = $(id), out = $(id + "-v"); el.value = get(); var show = function () { if (out) out.textContent = fmt(Number(el.value)); }; el.oninput = function () { set(Number(el.value)); show(); }; show(); return { el: el, show: show, set: function (v) { el.value = v; show(); } }; }

	/* ======================================================= 1. NEUTRONS ======================================================= */
	var ns = saved.n || {};
	var N = { B: num(ns.B, 0, 5000, 31.7), L: num(ns.L, 0.5, 10, 2.96), lam: num(ns.lam, 0.5, 6, 1.445), chi: num(ns.chi, -180, 180, 0), vis: num(ns.vis, 0.05, 1, 0.6), rate: num(ns.rate, 1, 500, 40), sp: num(ns.sp, 0.25, 10, 1), cl: !!ns.cl };
	var S = { smax: num(ns.smax, 360, 2160, 1440), n: num(ns.sn, 8, 80, 33), t: num(ns.st, 1, 600, 60), bg: num(ns.sbg, 0, 100, 3), showCl: ns.scl !== false, xa: !!ns.sxa, data: null, shown: 0, prog: 0 };
	function nSave() { sset({ n: { B: N.B, L: N.L, lam: N.lam, chi: N.chi, vis: N.vis, rate: N.rate, sp: N.sp, cl: N.cl, smax: S.smax, sn: S.n, st: S.t, sbg: S.bg, scl: S.showCl, sxa: S.xa } }); }
	function nv() { return M.speedFromLambda(N.lam); }
	function nAlpha() { return M.larmor(N.B * 1e-4, N.L / 100, nv()); }
	function nOpt(beam) { return { spin: N.cl ? 1 : 0.5, chi: N.chi * DEG, vis: N.vis, beam: beam }; }
	function B720() { return M.fieldFor(4 * Math.PI, N.L / 100, nv()) * 1e4; }
	var bS = slider("sn-b", function () { return N.B; }, function (v) { N.B = v; nUpdate(); }, function (v) { return sg(v, 1) + " G (" + sg(v / 10, 2) + " mT)"; });
	function bMax() { var m = Math.max(50, Math.ceil(B720() * 3.2 / 10) * 10); bS.el.max = m; bS.el.step = m > 1000 ? 1 : 0.1; if (N.B > m) { N.B = m; } bS.set(N.B); }
	var lS = slider("sn-l", function () { return N.L; }, function (v) { N.L = v; bMax(); nUpdate(); }, function (v) { return sg(v, 2); });
	var wS = slider("sn-w", function () { return N.lam; }, function (v) { N.lam = v; bMax(); nUpdate(); }, function (v) { return v.toFixed(3) + " Å"; });
	var xS = slider("sn-x", function () { return N.chi; }, function (v) { N.chi = v; nUpdate(); }, function (v) { return mi(v.toFixed(0)) + "°"; });
	var vS = slider("sn-vis", function () { return N.vis; }, function (v) { N.vis = v; nUpdate(); }, function (v) { return Math.round(v * 100) + "%"; });
	var rS = slider("sn-r", function () { return N.rate; }, function (v) { N.rate = v; nUpdate(); }, function (v) { return String(v); });
	slider("sn-sp", function () { return N.sp; }, function (v) { N.sp = v; nSave(); }, function (v) { return v + "×"; });
	$("sn-cl").checked = N.cl; $("sn-cl").onchange = function () { N.cl = this.checked; nUpdate(); };
	var nPre = $("sn-n-pre");
	M.NPRESETS.forEach(function (p) {
		var b = document.createElement("button"); b.type = "button"; b.textContent = p.name; b.setAttribute("aria-pressed", "false");
		b.onclick = function () { if (p.lam) { N.lam = p.lam; wS.set(p.lam); } if (p.Lcm) { N.L = p.Lcm; lS.set(p.Lcm); } if (p.vis) { N.vis = p.vis; vS.set(p.vis); } bMax(); N.B = p.B != null ? p.B : M.fieldFor(p.alphaDeg * DEG, N.L / 100, nv()) * 1e4; N.B = Math.round(N.B * 100) / 100; bS.set(N.B); nUpdate(); };
		nPre.appendChild(b);
	});
	function nUpdate() {
		nSave(); var a = nAlpha(), ad = a / DEG, iO = M.intensity(a, nOpt("O")), b720 = B720();
		$("sn-b-n").textContent = "Coil current about " + sg(M.coilCurrent(N.B * 1e-4, 2000), 2) + " A (2000 turns/m). 720° needs " + sg(b720, 1) + " G.";
		$("sn-w-n").textContent = "Speed " + sg(nv(), 0) + " m/s, energy " + sg(M.energyMeV(nv()), 1) + " meV, " + sci(N.L / 100 / nv() * 1e6, 2) + " µs in the field.";
		var turns = ad / 360, sign = Math.cos(a / 2) < -1e-9 ? "−ψ" : "+ψ";
		var msg = "α = " + sg(ad, 0) + "° (" + sg(turns, 2) + " turns). " + (N.cl ? "A classical vector would be back to itself at every 360°." : "The neutron's wave in that path is now " + sign + (Math.abs(Math.cos(a / 2)) < 0.05 ? " (a quarter of the way: no sign)" : "") + ".") + " The O detector gets " + Math.round(iO * 100) + "% of the neutrons.";
		$("sn-n-note").textContent = msg;
		Array.prototype.forEach.call(nPre.children, function (b, i) { var p = M.NPRESETS[i], on = p.B === 0 ? N.B === 0 : p.alphaDeg && Math.abs(ad - p.alphaDeg) < 1 && (!p.lam || Math.abs(N.lam - p.lam) < 1e-3); b.setAttribute("aria-pressed", on ? "true" : "false"); });
		nReadouts(); if (tab === "neutron") { nDraw(); dDraw(); sDraw(); }
	}
	/* the live experiment: neutron packets travel the paths; counts accumulate */
	var G3 = { D: 4.2, w: 2.3, z: 1.2 }, nCam = { yaw: -0.2, pitch: 0.82, F: 60, k: 30, cx: 0, cy: 0 };
	var nT = { run: true, t: 0, pk: [], spawn: 0, flash: { O: 0, H: 0 }, cO: 0, cH: 0, binO: 0, binH: 0, binT: 0, hist: [], tCount: 0, rnd: M.rng(Date.now() & 0xffff) };
	function npt(name) {
		var D = G3.D, w = G3.w, d1 = [D, w], d2 = [D, -w], L1 = Math.hypot(D, w);
		var Sx = [0, 0], In = [-1.6 * d1[0], -1.6 * d1[1]], M1 = [D, w], M2 = [D, -w], A = [2 * D, 0], O = [A[0] + 1.5 * d2[0], A[1] + 1.5 * d2[1]], Hd = [A[0] + 1.5 * d1[0], A[1] + 1.5 * d1[1]];
		return { S: Sx, In: In, M1: M1, M2: M2, A: A, O: O, H: Hd, L1: L1 }[name];
	}
	function lerp2(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
	var nCv = $("sn-n-c"), nStage = $("sn-n-stage"), nSz = null;
	orbit(nCv, nCam, function () { nDraw(); }, { yaw: -0.2, pitch: 0.82 });
	$("sn-n-view").onclick = function () { nCam.yaw = nNarrow ? -0.95 : -0.2; nCam.pitch = nNarrow ? 1.0 : 0.82; nDraw(); };
	var nNarrow = null;
	function nResize() { nSz = fitStage(nStage, function (w) { return w >= 700 ? w * 0.48 : Math.max(340, w * 0.95); }); var nar = nSz.W < 520; if (nar !== nNarrow) { nNarrow = nar; nCam.yaw = nar ? -0.95 : -0.2; nCam.pitch = nar ? 1.0 : 0.82; } nDraw(); }
	function nStep(dt) {
		var a = nAlpha(), pO = M.intensity(a, nOpt("O")), pH = 1 - pO, ds = dt * N.sp;
		/* counts (Poisson, in the lab's own time scaled by the speed) */
		nT.tCount += ds; nT.binT += ds;
		var kO = M.poisson(N.rate * pO * ds, nT.rnd), kH = M.poisson(N.rate * pH * ds, nT.rnd); nT.cO += kO; nT.cH += kH; nT.binO += kO; nT.binH += kH;
		if (kO) nT.flash.O = 1; if (kH) nT.flash.H = 1;
		while (nT.binT >= 1) { nT.hist.push([nT.binO, nT.binH]); if (nT.hist.length > 90) nT.hist.shift(); nT.binO = nT.binH = 0; nT.binT -= 1; }
		nT.flash.O = Math.max(0, nT.flash.O - dt * 3); nT.flash.H = Math.max(0, nT.flash.H - dt * 3);
		/* packets for the picture (not the count) */
		var v = 5.5 * Math.min(N.sp, 3); nT.spawn -= dt; if (nT.spawn <= 0) { nT.spawn = 0.45 / Math.min(N.sp, 3); nT.pk.push({ u: 0, s0: nT.rnd() * TAU, out: null }); }
		var Lin = 1.6 * npt("L1"), Lp = 2 * npt("L1"), Lout = 1.5 * npt("L1");
		nT.pk.forEach(function (p) { p.u += v * dt; if (p.u > Lin + Lp && p.out === null) p.out = nT.rnd() < pO ? "O" : "H"; });
		nT.pk = nT.pk.filter(function (p) { return p.u < Lin + Lp + Lout; });
	}
	function nDraw() {
		if (!nSz) return; var c = nSz.c, W = nSz.W, H = nSz.H;
		fitCam(nCam, W, H, [npt("In"), npt("O"), npt("H"), [-0.6, -G3.w - 1.2], [2 * G3.D + 0.6, G3.w + 1.2], [-0.6, G3.w + 1.2], [2 * G3.D + 0.6, -G3.w - 1.2]].reduce(function (a, p) { a.push([p[0], p[1], -0.9], [p[0], p[1], G3.z + 1.6]); return a; }, []), W < 520 ? 88 : 46, 40, W < 520 ? 52 : 34);
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var D = G3.D, w = G3.w, z = G3.z, a = nAlpha(), pO = M.intensity(a, nOpt("O"));
		/* crystal base and plates (one silicon block) */
		box3(c, nCam, -0.6, 2 * D + 0.6, -w - 1.2, w + 1.2, -0.9, -0.3, "#6f7a90");
		var Si = "#9fb4d8";
		[0, D, 2 * D].forEach(function (x) { box3(c, nCam, x - 0.22, x + 0.22, -w - 1.1, w + 1.1, -0.3, z + 1.3, Si, 0.38, "rgba(200,220,255,0.35)"); });
		var P3 = function (p, zz) { return [p[0], p[1], zz == null ? z : zz]; };
		/* beams */
		var S0 = npt("S"), M1 = npt("M1"), M2 = npt("M2"), A = npt("A");
		line3(c, nCam, P3(npt("In")), P3(S0), "rgba(255,255,255,0.55)", 2.4);
		line3(c, nCam, P3(S0), P3(M1), "rgba(76,201,240,0.6)", 2); line3(c, nCam, P3(M1), P3(A), "rgba(76,201,240,0.6)", 2);
		line3(c, nCam, P3(S0), P3(M2), "rgba(255,140,66,0.6)", 2); line3(c, nCam, P3(M2), P3(A), "rgba(255,140,66,0.6)", 2);
		var pH = 1 - pO;
		line3(c, nCam, P3(A), P3(npt("O")), "rgba(255,209,102," + (0.15 + 0.8 * pO) + ")", 1 + 4 * pO);
		line3(c, nCam, P3(A), P3(npt("H")), "rgba(76,201,240," + (0.15 + 0.8 * pH) + ")", 1 + 4 * pH);
		/* magnet on path II (between the first two plates): two pole pieces, field arrows */
		var f0 = 0.22, f1 = 0.78, g0 = lerp2(S0, M2, f0), g1 = lerp2(S0, M2, f1), cx = (g0[0] + g1[0]) / 2, cy = (g0[1] + g1[1]) / 2, hw = 0.55;
		var on = N.B > 0.05, poleCol = on ? "#c0563a" : "#5a6274";
		box3(c, nCam, Math.min(g0[0], g1[0]) - 0.1, Math.max(g0[0], g1[0]) + 0.1, cy - hw - 0.35, cy + hw + 0.35, z + 0.55, z + 1.05, poleCol);
		if (on) for (var i = 0; i < 4; i++) { var gp = lerp2(g0, g1, (i + 0.5) / 4); arrow3(c, nCam, [gp[0], gp[1] - 0.45, z - 0.45], [gp[0], gp[1] - 0.45, z + 0.45], "rgba(255,120,90,0.75)", 1.4); }
		box3(c, nCam, Math.min(g0[0], g1[0]) - 0.1, Math.max(g0[0], g1[0]) + 0.1, cy - hw - 0.35, cy + hw + 0.35, z - 1.05, z - 0.55, poleCol);
		var lb = proj(nCam, cx, cy - hw - 0.4, z + 1.25); txt(c, "B = " + sg(N.B, 1) + " G", lb.x, lb.y - 4, { col: "#ffb199", size: 12, b: 1, al: "center" });
		/* phase shifter on path I */
		var ps = lerp2(M1, A, 0.5); box3(c, nCam, ps[0] - 0.07, ps[0] + 0.07, ps[1] - 0.5, ps[1] + 0.5, z - 0.5, z + 0.5, "#c0c8d8", 0.45);
		var lp = proj(nCam, ps[0], ps[1] + 0.5, z + 0.7); txt(c, "χ " + mi(N.chi.toFixed(0)) + "°", lp.x, lp.y, { col: COL.dim, size: 11, al: "center" });
		/* detectors */
		[["O", npt("O"), COL.o, pO], ["H", npt("H"), COL.h, pH]].forEach(function (d) {
			var p = d[1], fl = nT.flash[d[0]], lx; box3(c, nCam, p[0] - 0.45, p[0] + 0.45, p[1] - 0.45, p[1] + 0.45, z - 0.6, z + 0.6, fl > 0.05 ? (d[0] === "O" ? "#ffe08a" : "#9be3f7") : "#3b4560");
			var s = proj(nCam, p[0], p[1], z + 0.9); lx = clamp(s.x, 62, W - 62); txt(c, d[0] + " detector", lx, s.y - 20, { col: d[2], b: 1, size: 12, al: "center" }); txt(c, Math.round(d[3] * 100) + "% · " + nT["c" + d[0]].toLocaleString("en-US") + " counts", lx, s.y - 5, { col: COL.text, size: 11, al: "center" });
		});
		/* labels */
		var t1 = proj(nCam, 0, -w - 1.1, z + 1.5); txt(c, "split", t1.x, t1.y, { col: COL.dim, size: 11, al: "center" });
		var t2 = proj(nCam, D, -w - 1.1, z + 1.5); txt(c, "mirror", t2.x, t2.y, { col: COL.dim, size: 11, al: "center" });
		var t3 = proj(nCam, 2 * D, -w - 1.1, z + 1.5); txt(c, "recombine", t3.x, t3.y, { col: COL.dim, size: 11, al: "center" });
		var l1 = proj(nCam, M1[0], M1[1] + 0.3, z + 0.3); txt(c, "path I", l1.x, l1.y, { col: COL.h, size: 11 });
		var l2 = proj(nCam, M2[0] + 0.2, M2[1] - 0.4, z - 0.4); txt(c, "path II", l2.x, l2.y, { col: COL.sp, size: 11 });
		var li = proj(nCam, npt("In")[0], npt("In")[1], z + 0.3); txt(c, "neutrons in, " + N.lam.toFixed(2) + " Å", li.x, li.y, { col: COL.dim, size: 11 });
		/* packets with spin arrows */
		var Lin = 1.6 * npt("L1"), Lp = 2 * npt("L1"), L1 = npt("L1");
		nT.pk.forEach(function (p) {
			var arr = [];
			if (p.u < Lin) arr.push([lerp2(npt("In"), S0, p.u / Lin), p.s0, "#ffffff", 1]);
			else if (p.u < Lin + Lp) {
				var u = p.u - Lin, f = u / L1;
				var q1 = f < 1 ? lerp2(S0, M1, f) : lerp2(M1, A, f - 1), q2 = f < 1 ? lerp2(S0, M2, f) : lerp2(M2, A, f - 1);
				var inF = f < f0 ? 0 : f < f1 ? (f - f0) / (f1 - f0) : 1;
				arr.push([q1, p.s0, COL.h, 0.7]); arr.push([q2, p.s0 + a * inF, COL.sp, 0.7]);
			} else { var u2 = (p.u - Lin - Lp) / (1.5 * L1), dest = p.out === "O" ? npt("O") : npt("H"); arr.push([lerp2(A, dest, u2), null, p.out === "O" ? COL.o : COL.h, 1]); }
			arr.forEach(function (o) {
				var pp = o[0], sp = proj(nCam, pp[0], pp[1], z); c.globalAlpha = o[3]; c.fillStyle = o[2]; c.beginPath(); c.arc(sp.x, sp.y, Math.max(2.5, 4.5 * sp.f), 0, TAU); c.fill();
				if (o[1] != null) arrow3(c, nCam, [pp[0], pp[1], z], [pp[0] + 0.75 * Math.cos(o[1]), pp[1] + 0.75 * Math.sin(o[1]), z], o[2], 1.8);
				c.globalAlpha = 1;
			});
		});
		txt(c, "Drag to turn · arrows show each neutron's spin", 10, H - 10, { col: COL.dim, size: 11 });
	}
	function nReadouts() {
		var a = nAlpha(), ad = a / DEG, pO = M.intensity(a, nOpt("O")), sec = Math.max(nT.tCount, 1e-9);
		ro($("sn-n-ro"), [
			{ l: "Spin turned by α", v: sg(ad, 0) + "°", s: sg(ad / 360, 2) + " full turns" },
			{ l: N.cl ? "Vector phase" : "Wave phase α/2", v: sg(N.cl ? ad : ad / 2, 0) + "°", s: N.cl ? "a vector repeats every 360°" : (Math.cos(a / 2) < -0.05 ? "wave sign flipped: −ψ" : Math.cos(a / 2) > 0.05 ? "same sign: +ψ" : "between + and −") },
			{ l: "Expected in O", v: Math.round(pO * 100) + "%", s: sg(N.rate * pO, 1) + " counts/s", c: pO < 0.3 ? "is-bad" : pO > 0.7 ? "is-good" : "" },
			{ l: "Counted O / H", v: nT.cO.toLocaleString("en-US") + " / " + nT.cH.toLocaleString("en-US"), s: "O share " + (nT.cO + nT.cH ? Math.round(100 * nT.cO / (nT.cO + nT.cH)) + "% ± " + Math.round(100 * Math.sqrt(nT.cO * nT.cH / Math.pow(nT.cO + nT.cH, 3))) + "%" : "–") + " in " + sg(sec, 0) + " s" },
			{ l: "Time in the field", v: sci(N.L / 100 / nv() * 1e6, 2) + " µs", s: "Larmor " + sci(M.larmorFreq(N.B * 1e-4) / 1e3, 3) + " kHz" }
		]);
	}
	/* dial + counts history */
	var dStage = $("sn-d-stage"), dSz = null;
	function dResize() { dSz = fitStage(dStage, function (w) { return w >= 560 ? 250 : 470; }); dDraw(); }
	function dDraw() {
		if (!dSz) return; var c = dSz.c, W = dSz.W, H = dSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var a = nAlpha(), wide = W >= 560, S2 = wide ? Math.min(H, 260) : 230, cx = wide ? S2 / 2 + 10 : W / 2, cy = wide ? H / 2 : 118, R = S2 / 2 - 26;
		/* outer ring: the spin (vector) angle; inner ring: the spinor phase alpha/2 */
		c.strokeStyle = "#2a3550"; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke(); c.beginPath(); c.arc(cx, cy, R * 0.62, 0, TAU); c.stroke();
		for (var k = 0; k < 12; k++) { var t = k * TAU / 12; c.beginPath(); c.moveTo(cx + Math.cos(t) * R, cy - Math.sin(t) * R); c.lineTo(cx + Math.cos(t) * (R - 6), cy - Math.sin(t) * (R - 6)); c.stroke(); }
		var turns = Math.floor(a / TAU + 1e-9);
		c.strokeStyle = "rgba(255,140,66,0.35)"; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, R + 7, 0, -Math.min(a, 12 * TAU) % TAU || (a > 0 ? -TAU : 0), true); c.stroke();
		var ph = N.cl ? a : a / 2;
		arrow2(c, cx, cy, cx + Math.cos(a) * (R - 4), cy - Math.sin(a) * (R - 4), COL.sp, 3, 11);
		arrow2(c, cx, cy, cx + Math.cos(ph) * R * 0.6, cy - Math.sin(ph) * R * 0.6, N.cl ? COL.vec : COL.o, 3, 10);
		c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, 3, 0, TAU); c.fill();
		txt(c, "spin α = " + sg(a / DEG, 0) + "°", cx, cy - R - 12, { col: COL.sp, b: 1, al: "center", size: 12 });
		var neg = Math.cos(ph) < -0.05, pos = Math.cos(ph) > 0.05;
		txt(c, (N.cl ? "vector: " : "wave α/2 = " + sg(a / 2 / DEG, 0) + "° → ") + (N.cl ? (Math.cos(a) > 0.05 ? "back to itself" : "turned away") : neg ? "−ψ" : pos ? "+ψ" : "±"), cx, cy + R + 20, { col: N.cl ? COL.vec : COL.o, b: 1, al: "center", size: 12 });
		if (turns > 0) txt(c, turns + (turns === 1 ? " full turn" : " full turns"), cx, cy + R + 35, { col: COL.dim, al: "center", size: 11 });
		/* history */
		var r = wide ? { x: S2 + 60, y: 14, w: W - S2 - 74, h: H - 44 } : { x: 46, y: 280, w: W - 60, h: H - 310 };
		var hist = nT.hist, n = 60, top = Math.max(5, N.rate * 1.15);
		hist.forEach(function (h) { top = Math.max(top, h[0], h[1]); });
		var f = frame(c, r, { x0: -n, x1: 0, y0: 0, y1: top, xl: "seconds ago", yl: "counts / s", title: "Counts each second" });
		var pO = M.intensity(a, nOpt("O"));
		c.save(); c.setLineDash([5, 4]); c.lineWidth = 1; c.strokeStyle = COL.o; c.beginPath(); c.moveTo(r.x, f.Y(N.rate * pO)); c.lineTo(r.x + r.w, f.Y(N.rate * pO)); c.stroke(); c.strokeStyle = COL.h; c.beginPath(); c.moveTo(r.x, f.Y(N.rate * (1 - pO))); c.lineTo(r.x + r.w, f.Y(N.rate * (1 - pO))); c.stroke(); c.restore();
		var hs = hist.slice(-n), xs = hs.map(function (_, i) { return i - hs.length + 1; });
		if (hs.length > 1) { trace(c, r, f, xs, hs.map(function (h) { return h[0]; }), COL.o, 1.8); trace(c, r, f, xs, hs.map(function (h) { return h[1]; }), COL.h, 1.8); }
		legend(c, r, [["O detector", COL.o], ["H detector", COL.h], ["dashed = expected", COL.dim]]);
	}
	/* the scan */
	var sStage = $("sn-s-stage"), sSz = null;
	slider("sn-smax", function () { return S.smax; }, function (v) { S.smax = v; nSave(); sDraw(); }, function (v) { return v + "° of precession"; });
	slider("sn-sn", function () { return S.n; }, function (v) { S.n = v; nSave(); }, function (v) { return String(v); });
	slider("sn-st", function () { return S.t; }, function (v) { S.t = v; nSave(); }, function (v) { return v >= 60 ? sg(v / 60, 1) + " min" : v + " s"; });
	slider("sn-sbg", function () { return S.bg; }, function (v) { S.bg = v; nSave(); }, function (v) { return String(v); });
	$("sn-s-cl").checked = S.showCl; $("sn-s-cl").onchange = function () { S.showCl = this.checked; nSave(); sDraw(); };
	$("sn-s-x").checked = S.xa; $("sn-s-x").onchange = function () { S.xa = this.checked; nSave(); sDraw(); };
	function sResize() { sSz = fitStage(sStage, function (w) { return clamp(w * 0.46, 280, 460); }); sDraw(); }
	$("sn-s-run").onclick = function () {
		var v = nv(), L = N.L / 100, Bmax = M.fieldFor(S.smax * DEG, L, v), Bs = M.linspace(0, Bmax, S.n);
		var d = M.scan({ Bs: Bs, L: L, v: v, rate: N.rate, t: S.t, vis: N.vis, bg: S.bg, chi: N.chi * DEG, spin: N.cl ? 1 : 0.5, seed: (Math.random() * 1e9) | 0 });
		var P720 = M.fringePeriodB(L, v, 0.5), fit = M.fitPeriod(d.x, d.n, 0.3 * P720, Math.min(3 * P720, 1.5 * Bmax));
		S.data = { x: d.x, n: d.n, L: L, v: v, fit: fit, rate: N.rate, vis: N.vis, bg: S.bg, chi: N.chi * DEG, t: S.t, cl: N.cl, Bmax: Bmax };
		S.shown = 0; S.prog = 0; $("sn-s-note").textContent = "Counting…";
	};
	$("sn-s-csv").onclick = function () {
		if (!S.data) { toast("Run a scan first"); return; } var d = S.data;
		var t = "field (G)\tprecession (deg)\tO counts\n" + d.x.map(function (x, i) { return (x * 1e4).toFixed(3) + "\t" + (M.larmor(x, d.L, d.v) / DEG).toFixed(1) + "\t" + d.n[i]; }).join("\n");
		var done = function () { toast("Data copied: paste it into a spreadsheet"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { prompt("Copy:", t); }); else prompt("Copy:", t);
	};
	function sTick(dt) { if (!S.data || S.shown >= S.data.x.length) return; S.prog += dt * Math.max(8, S.data.x.length / 2.5); var k = Math.min(S.data.x.length, Math.floor(S.prog)); if (k !== S.shown) { S.shown = k; if (k === S.data.x.length) sResult(); sDraw(); } }
	function sResult() {
		var d = S.data, f = d.fit, deg = f ? M.periodDeg(f.P, d.L, d.v) : NaN, de = f ? M.periodDeg(f.err, d.L, d.v) : NaN, hrs = d.t * d.x.length / 3600;
		ro($("sn-s-ro"), [
			{ l: "Fitted period", v: f ? sg(f.P * 1e4, 1) + " ± " + sg(f.err * 1e4, 1) + " G" : "–" },
			{ l: "Precession for one fringe", v: f ? sg(deg, 0) + " ± " + sg(de, 0) + "°" : "–", s: "spin ½ predicts 720°, a vector 360°", c: f && Math.abs(deg - 720) < 2 * de + 1 ? "is-good" : "" },
			{ l: "Fitted contrast", v: f ? Math.round(f.vis * 100) + "%" : "–", s: "background lowers it" },
			{ l: "χ² per point", v: f ? sg(f.chi2 / Math.max(1, d.x.length - 4), 2) : "–", s: "about 1 = a good fit" },
			{ l: "Counting time", v: hrs >= 1 ? sg(hrs, 1) + " h" : sg(hrs * 60, 0) + " min", s: d.x.length + " settings × " + d.t + " s" }
		]);
		$("sn-s-note").textContent = f ? "This scan says one full fringe takes " + sg(deg, 0) + " ± " + sg(de, 0) + "° of precession" + (Math.abs(deg - 720) < 2 * de + 1 ? ", in line with 720°: spinors" : Math.abs(deg - 360) < 2 * de + 1 ? ", the 360° of an ordinary vector" : "") + ". Werner et al. measured 704 ± 38° in 1975. Shorter counting times give bigger error bars; try it." : "The fit did not settle: scan further or count longer.";
	}
	function sDraw() {
		if (!sSz) return; var c = sSz.c, W = sSz.W, H = sSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var d = S.data, L = d ? d.L : N.L / 100, v = d ? d.v : nv(), Bmax = d ? d.Bmax : M.fieldFor(S.smax * DEG, L, v), rate = d ? d.rate : N.rate, t = d ? d.t : S.t, vis = d ? d.vis : N.vis, bg = d ? d.bg : S.bg, chi = d ? d.chi : N.chi * DEG;
		var xa = S.xa, toX = function (B) { return xa ? M.larmor(B, L, v) / DEG : B * 1e4; }, x1 = toX(Bmax);
		var top = (rate + bg) * t * 1.18; if (d) d.n.forEach(function (n) { top = Math.max(top, n + Math.sqrt(n) * 1.3); });
		var r = { x: 58, y: 46, w: W - 86, h: H - 82 };
		var f = frame(c, r, { x0: 0, x1: x1, y0: 0, y1: top, xs: xa ? (x1 > 1100 ? 360 : 180) : null, xu: xa ? "°" : "", xl: xa ? "precession angle α" : "field (gauss)", yl: "O counts per setting", title: d ? (S.shown < d.x.length ? "Counting… " + S.shown + " / " + d.x.length : "Your scan") : "Press Run the scan" });
		/* 360 / 720 markers */
		for (var k = 1; k * 360 <= (xa ? x1 : M.larmor(Bmax, L, v) / DEG) + 1e-6; k++) { var bx = xa ? k * 360 : M.fieldFor(k * 360 * DEG, L, v) * 1e4, X = f.X(bx); c.strokeStyle = k % 2 ? "rgba(255,140,66,0.35)" : "rgba(126,226,168,0.4)"; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(X, r.y); c.lineTo(X, r.y + r.h); c.stroke(); c.setLineDash([]); txt(c, k * 360 + "°", X + 3, r.y + r.h - 6, { col: k % 2 ? "#ffb27a" : "#7ee2a8", size: 10 }); }
		var xs = [], y1 = [], y2 = [], NP = 300;
		for (var i = 0; i <= NP; i++) { var B = Bmax * i / NP, a = M.larmor(B, L, v); xs.push(toX(B)); y1.push((rate * M.intensity(a, { spin: 0.5, chi: chi, vis: vis }) + bg) * t); y2.push((rate * M.intensity(a, { spin: 1, chi: chi, vis: vis }) + bg) * t); }
		if (S.showCl) trace(c, r, f, xs, y2, COL.vec, 1.4, [6, 4]);
		trace(c, r, f, xs, y1, "rgba(255,209,102,0.55)", 1.4, [2, 3]);
		if (d && S.shown >= d.x.length && d.fit) { var F = d.fit, yf = xs.map(function (_, j) { var B = Bmax * j / NP; return F.a + F.b * Math.cos(TAU * B / F.P) + F.c * Math.sin(TAU * B / F.P); }); trace(c, r, f, xs, yf, COL.fit, 2); }
		if (d) for (var j = 0; j < S.shown; j++) { var px = f.X(toX(d.x[j])), py = f.Y(d.n[j]), e = Math.sqrt(Math.max(d.n[j], 1)); c.strokeStyle = "#e8ecf5"; c.lineWidth = 1; c.beginPath(); c.moveTo(px, f.Y(d.n[j] - e)); c.lineTo(px, f.Y(d.n[j] + e)); c.stroke(); c.fillStyle = "#fff"; c.beginPath(); c.arc(px, py, 2.6, 0, TAU); c.fill(); }
		/* where the live field is */
		var cur = toX(N.B * 1e-4); if (cur <= x1) { c.strokeStyle = "rgba(255,255,255,0.5)"; c.beginPath(); c.moveTo(f.X(cur), r.y); c.lineTo(f.X(cur), r.y + r.h); c.stroke(); }
		legend(c, r, [["data ± √N", "#fff"], ["fit", COL.fit], ["spin ½", COL.o]].concat(S.showCl ? [["vector (spin 1)", COL.vec]] : []));
		sStage.__f = { f: f, r: r, toB: function (X) { var x = (X - r.x) / r.w * x1; return xa ? M.fieldFor(x * DEG, L, v) * 1e4 : x; } };
	}
	$("sn-s-c").addEventListener("click", function (e) { var o = sStage.__f; if (!o) return; var rc = this.getBoundingClientRect(), X = e.clientX - rc.left; if (X < o.r.x || X > o.r.x + o.r.w) return; N.B = Math.round(clamp(o.toB(X), 0, Number(bS.el.max)) * 10) / 10; bS.set(N.B); nUpdate(); toast("Field set to " + sg(N.B, 1) + " G"); });
	$("sn-n-play").onclick = function () { nT.run = !nT.run; this.textContent = nT.run ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", nT.run ? "true" : "false"); };
	$("sn-n-zero").onclick = function () { nT.cO = nT.cH = 0; nT.hist = []; nT.binO = nT.binH = nT.binT = 0; nT.tCount = 0; nReadouts(); dDraw(); };
	$("sn-n-png").onclick = function () { png(nCv, "neutron-interferometer"); };
	$("sn-s-png").onclick = function () { png($("sn-s-c"), "neutron-720-scan"); };

	/* ======================================================= shared: the iron rod in 3D ======================================================= */
	function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
	/* o: rad (scene units), z0, z1, th (turned angle), frac (-1..1 spins lined up), coil: null or {on, sign, t} */
	function drawRod(c, cam, o) {
		var NS = 36, R = o.rad, segs = [];
		function coilPts(front) {
			if (!o.coil) return; var RC = R + 0.5, turns = 15, n = turns * 40, zc0 = o.z0 - 0.35, zc1 = o.z1 + 0.35;
			c.lineWidth = 2; c.strokeStyle = o.coil.on ? "#e0894a" : "#5a6274";
			c.globalAlpha = front ? 0.9 : 0.55; c.beginPath(); var pen = false;
			for (var i = 0; i <= n; i++) { var u = i / n * turns * TAU, x = RC * Math.cos(u), y = RC * Math.sin(u), zz = zc0 + (zc1 - zc0) * i / n, fr = facing(cam, Math.cos(u), Math.sin(u), 0); var p = proj(cam, x, y, zz); if (fr === front) { if (pen) c.lineTo(p.x, p.y); else { c.moveTo(p.x, p.y); pen = true; } } else pen = false; }
			c.stroke(); c.globalAlpha = 1;
			if (o.coil.on && front) { c.fillStyle = "#ffd166"; for (var k = 0; k < 30; k++) { var uu = ((k / 30 * turns * TAU) + o.coil.t * 6 * o.coil.sign) % (turns * TAU); if (uu < 0) uu += turns * TAU; if (!facing(cam, Math.cos(uu), Math.sin(uu), 0)) continue; var pp = proj(cam, RC * Math.cos(uu), RC * Math.sin(uu), zc0 + (zc1 - zc0) * uu / (turns * TAU)); c.beginPath(); c.arc(pp.x, pp.y, 2, 0, TAU); c.fill(); } }
		}
		coilPts(false);
		for (var j = 0; j < NS; j++) { var a0 = j * TAU / NS, a1 = (j + 1) * TAU / NS, am = (a0 + a1) / 2, mat = am - o.th, stripe = Math.floor(((mat % TAU) + TAU) % TAU / (TAU / 12)) % 2; segs.push({ a0: a0, a1: a1, am: am, st: stripe, d: proj(cam, R * Math.cos(am), R * Math.sin(am), (o.z0 + o.z1) / 2).d }); }
		segs.sort(function (a, b) { return b.d - a.d; });
		segs.forEach(function (s) {
			var p1 = proj(cam, R * Math.cos(s.a0), R * Math.sin(s.a0), o.z0), p2 = proj(cam, R * Math.cos(s.a1), R * Math.sin(s.a1), o.z0), p3 = proj(cam, R * Math.cos(s.a1), R * Math.sin(s.a1), o.z1), p4 = proj(cam, R * Math.cos(s.a0), R * Math.sin(s.a0), o.z1);
			var lit = 0.45 + 0.55 * Math.max(0, -Math.sin(s.am + cam.yaw + 0.6)); c.fillStyle = shade(s.st ? "#8c97ab" : "#a9b4c8", lit); c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p3.x, p3.y); c.lineTo(p4.x, p4.y); c.closePath(); c.fill(); c.strokeStyle = c.fillStyle; c.lineWidth = 0.6; c.stroke();
		});
		/* top cap */
		c.beginPath(); for (var k2 = 0; k2 <= NS; k2++) { var t = k2 * TAU / NS, p = proj(cam, R * Math.cos(t), R * Math.sin(t), o.z1); if (k2) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); } c.closePath(); c.fillStyle = cam.pitch > 0 ? "#c3cbd9" : "#7a8498"; c.fill();
		var mk = proj(cam, R * 0.8 * Math.cos(o.th), R * 0.8 * Math.sin(o.th), o.z1), cc = proj(cam, 0, 0, o.z1); c.strokeStyle = "#384056"; c.lineWidth = 2; c.beginPath(); c.moveTo(cc.x, cc.y); c.lineTo(mk.x, mk.y); c.stroke();
		/* electron spins on the front of the rod */
		var rows = 6, cols = 14, up = (1 + clamp(o.frac, -1, 1)) / 2;
		for (var rI = 0; rI < rows; rI++) for (var cI = 0; cI < cols; cI++) {
			var ang = (cI + 0.5) * TAU / cols + o.th + (rI % 2) * Math.PI / cols, nx = Math.cos(ang), ny = Math.sin(ang); if (!facing(cam, nx, ny, 0)) continue;
			var vis = -Math.sin(ang + cam.yaw); if (vis < 0.2) continue;
			var zz = o.z0 + (o.z1 - o.z0) * (rI + 0.5) / rows, h = Math.min(0.32, (o.z1 - o.z0) / rows * 0.36), u = hash(rI * 31 + cI) < up, dir = u ? 1 : -1, rr = R * 1.01;
			c.globalAlpha = 0.35 + 0.65 * vis; arrow3(c, cam, [rr * nx, rr * ny, zz - dir * h], [rr * nx, rr * ny, zz + dir * h], u ? "#ff6b6b" : "#5aa9ff", 1.6); c.globalAlpha = 1;
		}
		coilPts(true);
	}
	function spinArc(c, cam, R, z, sign, col) { if (!sign) return; c.strokeStyle = c.fillStyle = col; c.lineWidth = 2; c.beginPath(); var n = 24, a0 = -1.9, a1 = 1.3, last, prev; for (var i = 0; i <= n; i++) { var t = a0 + (a1 - a0) * i / n, ang = sign > 0 ? t : -t, p = proj(cam, R * Math.cos(ang - cam.yaw - Math.PI / 2), R * Math.sin(ang - cam.yaw - Math.PI / 2), z); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); prev = last; last = p; } c.stroke(); arrow2(c, prev.x, prev.y, last.x, last.y, col, 2, 9); }

	/* ======================================================= 2. EINSTEIN-DE HAAS ======================================================= */
	var es = saved.e || {};
	var E = { mat: M.matOf(es.mat).id, fib: es.fib !== false, per: num(es.per, 0.5, 30, 4), qv: num(es.qv, 0, 3, 3), r: num(es.r, 0.2, 10, 1), len: num(es.len, 1, 30, 5), nz: num(es.nz, 0, 100, 0), sp: num(es.sp, 0.25, 8, 1), ac: !!es.ac, half: num(es.half, 0.25, 15, 2), ex: es.ex !== false, run: true };
	function eSave() { sset({ e: { mat: E.mat, fib: E.fib, per: E.per, qv: E.qv, r: E.r, len: E.len, nz: E.nz, sp: E.sp, ac: E.ac, half: E.half, ex: E.ex } }); }
	var eCyl, eSim, eHist;
	function eParams() { var I = eCyl.I, k = E.fib ? M.kappaFor(I, E.per) : 0, Om = TAU / E.per, Q = Math.pow(10, E.qv); return { kappa: k, c: E.qv >= 2.99 ? 0 : (E.fib ? I * Om / Q : I * 0.05 / Q), noise: E.nz / 100 * 0.25 * eKick() }; }
	function eKick() { return M.kickL(eCyl.muSat, M.matOf(E.mat).g); }
	function eBuild() {
		var m = M.matOf(E.mat); eCyl = M.cylinder({ r: E.r / 1000, len: E.len / 100, rho: m.rho, Ms: m.Ms });
		var p = eParams(); eSim = M.EdH({ I: eCyl.I, kappa: p.kappa, c: p.c, tauM: 0.01, g: m.g, muSat: eCyl.muSat, noise: p.noise, seed: (Math.random() * 1e9) | 0 });
		eHist = { t: [], b: [], e: [], l: [], s: 0 }; if (E.ac) eSim.setAC(1 / (2 * E.half)); eFieldBtns(); eNotes();
	}
	function eLive() { var p = eParams(); eSim.p.kappa = p.kappa; eSim.p.c = p.c; eSim.p.noise = p.noise; eNotes(); }
	var eMat = $("sn-e-mat"); M.MATERIALS.forEach(function (m) { var o = document.createElement("option"); o.value = m.id; o.textContent = m.name; eMat.appendChild(o); }); eMat.value = E.mat;
	eMat.onchange = function () { E.mat = eMat.value; eSave(); eBuild(); };
	slider("sn-e-per", function () { return E.per; }, function (v) { E.per = v; eSave(); eLive(); }, function (v) { return sg(v, 1); });
	slider("sn-e-q", function () { return E.qv; }, function (v) { E.qv = v; eSave(); eLive(); }, function (v) { return v >= 2.99 ? "no damping" : sg(Math.pow(10, v), 0); });
	slider("sn-e-r", function () { return E.r; }, function (v) { E.r = v; eSave(); eBuild(); }, function (v) { return sg(v, 2); });
	slider("sn-e-len", function () { return E.len; }, function (v) { E.len = v; eSave(); eBuild(); }, function (v) { return sg(v, 1); });
	slider("sn-e-nz", function () { return E.nz; }, function (v) { E.nz = v; eSave(); eLive(); }, function (v) { return v ? v + "%" : "none"; });
	slider("sn-e-sp", function () { return E.sp; }, function (v) { E.sp = v; eSave(); }, function (v) { return v + "×"; });
	var halfS = slider("sn-e-f", function () { return E.half; }, function (v) { E.half = v; eSave(); if (E.ac) eSim.setAC(1 / (2 * v)); }, function (v) { return sg(v, 2); });
	$("sn-e-ac").checked = E.ac; $("sn-e-ac").onchange = function () { E.ac = this.checked; eSave(); if (E.ac) eSim.setAC(1 / (2 * E.half)); else { eSim.setAC(0); } eFieldBtns(); };
	$("sn-e-tune").onclick = function () { if (!E.fib) { E.fib = true; setPressed([$("sn-e-fib"), $("sn-e-free")], $("sn-e-fib")); eLive(); } E.half = Math.round(E.per / 2 * 100) / 100; halfS.set(E.half); E.ac = true; $("sn-e-ac").checked = true; eSave(); eSim.setAC(1 / (2 * E.half)); eFieldBtns(); toast("Reversing every half swing: the kicks add up"); };
	$("sn-e-fib").onclick = function () { E.fib = true; setPressed([$("sn-e-fib"), $("sn-e-free")], this); eSave(); eBuild(); };
	$("sn-e-free").onclick = function () { E.fib = false; setPressed([$("sn-e-fib"), $("sn-e-free")], this); eSave(); eBuild(); };
	setPressed([$("sn-e-fib"), $("sn-e-free")], E.fib ? $("sn-e-fib") : $("sn-e-free"));
	$("sn-e-ex").onclick = function () { E.ex = true; setPressed([$("sn-e-ex"), $("sn-e-true")], this); eSave(); eNotes(); };
	$("sn-e-true").onclick = function () { E.ex = false; setPressed([$("sn-e-ex"), $("sn-e-true")], this); eSave(); eNotes(); };
	setPressed([$("sn-e-ex"), $("sn-e-true")], E.ex ? $("sn-e-ex") : $("sn-e-true"));
	function eSetField(f) { if (E.ac) { E.ac = false; $("sn-e-ac").checked = false; eSim.setAC(0); eSave(); } eSim.setField(f); eFieldBtns(); }
	$("sn-e-up").onclick = function () { eSetField(1); }; $("sn-e-off").onclick = function () { eSetField(0); }; $("sn-e-dn").onclick = function () { eSetField(-1); };
	function eFieldBtns() { var f = eSim ? eSim.s.field : 0; setPressed([$("sn-e-up"), $("sn-e-off"), $("sn-e-dn")], E.ac ? null : f > 0 ? $("sn-e-up") : f < 0 ? $("sn-e-dn") : $("sn-e-off")); }
	$("sn-e-reset").onclick = function () { E.ac = false; $("sn-e-ac").checked = false; eSave(); eBuild(); };
	$("sn-e-play").onclick = function () { E.run = !E.run; this.textContent = E.run ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", E.run ? "true" : "false"); };
	var ePre = $("sn-e-pre");
	[["One flip on a fibre", function () { E.fib = true; E.qv = 3; E.nz = 0; }], ["Resonance, like 1915", function () { E.fib = true; E.qv = 1.6; E.nz = 15; setTimeout(function () { $("sn-e-tune").click(); }, 0); }], ["Hanging free", function () { E.fib = false; E.nz = 0; }], ["What 1915 expected (g′ = 1)", function () { E.mat = "orbit"; }], ["Nickel", function () { E.mat = "nickel"; }]].forEach(function (p) {
		var b = document.createElement("button"); b.type = "button"; b.textContent = p[0]; b.onclick = function () { E.ac = false; $("sn-e-ac").checked = false; if (p[0] !== "What 1915 expected (g′ = 1)" && p[0] !== "Nickel") E.mat = E.mat === "orbit" ? "iron" : E.mat; p[1](); eMat.value = E.mat; refreshE(); eSave(); eBuild(); }; ePre.appendChild(b);
	});
	function refreshE() { ["per", "q", "r", "len", "nz", "sp"].forEach(function (k) { var el = $("sn-e-" + k), map = { per: E.per, q: E.qv, r: E.r, len: E.len, nz: E.nz, sp: E.sp }; el.value = map[k]; el.oninput && el.dispatchEvent(new Event("input")); }); setPressed([$("sn-e-fib"), $("sn-e-free")], E.fib ? $("sn-e-fib") : $("sn-e-free")); }
	function eK() { /* exaggeration so the turn is visible */
		if (!E.ex) return 1; var m = M.matOf(E.mat), dL = M.kickL(eCyl.muSat, m.g);
		return E.fib ? Math.max(1, 0.3 / M.flipAmp(dL, eCyl.I, M.kappaFor(eCyl.I, E.per))) : Math.max(1, 0.7 / (dL / eCyl.I));
	}
	function eNotes() {
		if (!eCyl) return; var m = M.matOf(E.mat), dL = M.kickL(eCyl.muSat, m.g), k = eK();
		$("sn-e-exn").textContent = E.ex ? "Turn shown " + sci(Math.round(k), 2).replace(/\.00×/, "×") + " times bigger than it really is." : "True size: far too small to see without a mirror.";
		$("sn-e-per-n").textContent = E.fib ? "Stiffness κ = " + sci(M.kappaFor(eCyl.I, E.per), 2) + " N·m/rad" : "Free: no restoring twist.";
		var note = "Switching from no field to full field moves " + sci(dL, 2) + " J·s of angular momentum into the electrons and the same, the other way, into the rod. ";
		note += E.fib ? "On this fibre the first swing is " + sci(M.flipAmp(dL, eCyl.I, M.kappaFor(eCyl.I, E.per)) * 1000, 2) + " mrad (a light spot 1 m away moves " + sci(2 * M.flipAmp(dL, eCyl.I, M.kappaFor(eCyl.I, E.per)) * 1000, 2) + " mm). Reversing the field doubles it; reversing in time with the swing builds it up." : "Hanging free, the rod would turn at " + sci(dL / eCyl.I, 2) + " rad/s: one turn every " + sci(TAU / (dL / eCyl.I) / 60, 2) + " minutes.";
		$("sn-e-note").textContent = note;
	}
	var eCv = $("sn-e-c"), eStage = $("sn-e-stage"), eSz = null, eCam = { yaw: 0.5, pitch: 0.32, F: 40, k: 30, cx: 0, cy: 0 };
	$("sn-e-view").onclick = orbit(eCv, eCam, function () { eDraw(); }, { yaw: 0.5, pitch: 0.32, keysUp: true });
	eCv.addEventListener("keydown", function (e) { if (e.key === "ArrowUp") { eSetField(1); e.preventDefault(); } else if (e.key === "ArrowDown") { eSetField(-1); e.preventDefault(); } else if (e.key === "0") eSetField(0); });
	function eResize() { eSz = fitStage(eStage, function (w) { return w >= 700 ? w * 0.5 : w * 0.95; }); eDraw(); }
	function eStep(dt) {
		var h = dt * E.sp; eSim.step(h);
		eHist.s += h; if (eHist.s >= 0.03 || !eHist.t.length) { eHist.s = 0; eHist.t.push(eSim.s.t); eHist.b.push(eSim.Lb()); eHist.e.push(eSim.Le()); eHist.l.push(eSim.s.Llab); if (eHist.t.length > 2400) ["t", "b", "e", "l"].forEach(function (k) { eHist[k].shift(); }); }
		if (E.ac) eFieldBtns();
	}
	function eDraw() {
		if (!eSz) return; var c = eSz.c, W = eSz.W, H = eSz.H, s = eSim.s, k = eK(), th = s.th * k;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var rad = clamp(6 * E.r / (E.len * 10), 0.75, 2.4), z0 = -3, z1 = 3, top = 7.3, zm = 5.1, ys = 7;
		fitCam(eCam, W, H, [[-1.2, -0.5, top + 0.4], [1.2, 0.5, top + 0.4], [-rad - 0.6, -rad - 0.6, -3.5], [rad + 0.6, rad + 0.6, -3.5], [-5.5, ys, zm - 1.1], [5.5, ys, zm - 1.1], [rad + 2, 0, -3.4]], W < 520 ? 120 : 54, 46, 24);
		/* bracket, fibre */
		box3(c, eCam, -1.2, 1.2, -0.5, 0.5, top, top + 0.4, "#4a5268");
		line3(c, eCam, [0, 0, top], [0, 0, z1], "#cfd6e4", 1);
		/* light lever: lamp beside the scale, mirror on the fibre, spot on the scale */
		var n0 = Math.PI / 2 + th, nx = Math.cos(n0), ny = Math.sin(n0), lamp = [0, ys, zm + 0.35], mir = [0, 0, zm];
		var dx = mir[0] - lamp[0], dy = mir[1] - lamp[1], dz = mir[2] - lamp[2], dd = Math.hypot(dx, dy, dz); dx /= dd; dy /= dd; dz /= dd;
		var dn = dx * nx + dy * ny, rx = dx - 2 * dn * nx, ry = dy - 2 * dn * ny, rz = dz;
		box3(c, eCam, -5.5, 5.5, ys - 0.15, ys + 0.15, zm - 1.1, zm - 0.4, "#d8d2b8");
		for (var t = -5; t <= 5; t++) line3(c, eCam, [t, ys - 0.16, zm - 0.4], [t, ys - 0.16, zm - (t % 5 ? 0.6 : 0.8)], "#3a3a3a", 1);
		box3(c, eCam, lamp[0] - 0.25, lamp[0] + 0.25, ys - 0.15, ys + 0.35, lamp[2] - 0.2, lamp[2] + 0.2, "#e9c46a");
		line3(c, eCam, lamp, mir, "rgba(255,230,140,0.5)", 1.4);
		if (ry > 0.05) { var tt = (ys - 0.16 - mir[1]) / ry, sx = mir[0] + rx * tt, sz = mir[2] + rz * tt; line3(c, eCam, mir, [sx, ys - 0.16, sz], "rgba(255,230,140,0.85)", 1.6); if (Math.abs(sx) < 5.5) { var sp = proj(eCam, sx, ys - 0.16, zm - 0.75); c.fillStyle = "#fff3b0"; c.beginPath(); c.arc(sp.x, sp.y, 4, 0, TAU); c.fill(); } }
		var mw = 0.45; /* the mirror: a small square on the fibre facing n */
		var tx = -ny, ty = nx, q1 = proj(eCam, tx * mw, ty * mw, zm - 0.35), q2 = proj(eCam, -tx * mw, -ty * mw, zm - 0.35), q3 = proj(eCam, -tx * mw, -ty * mw, zm + 0.35), q4 = proj(eCam, tx * mw, ty * mw, zm + 0.35);
		c.fillStyle = facing(eCam, nx, ny, 0) ? "#dbe8ff" : "#59637a"; c.beginPath(); c.moveTo(q1.x, q1.y); c.lineTo(q2.x, q2.y); c.lineTo(q3.x, q3.y); c.lineTo(q4.x, q4.y); c.closePath(); c.fill();
		drawRod(c, eCam, { rad: rad, z0: z0, z1: z1, th: th, frac: s.mu / eCyl.muSat, coil: { on: s.field !== 0 || E.ac, sign: s.field || 1, t: s.t } });
		/* magnetization arrow and rotation sense */
		var mf = s.mu / eCyl.muSat; if (Math.abs(mf) > 0.03) arrow3(c, eCam, [rad + 1.9, 0, -2.4 * mf], [rad + 1.9, 0, 2.4 * mf], "#ff6b6b", 3);
		var mlab = proj(eCam, rad + 1.9, 0, -3.3); txt(c, "M " + (mf >= 0 ? "↑" : "↓") + " " + Math.round(Math.abs(mf) * 100) + "%", mlab.x, mlab.y, { col: "#ff9a9a", b: 1, size: 12, al: "center" });
		if (Math.abs(s.w * k) > 0.02) spinArc(c, eCam, rad + 0.25, z1 + 0.5, s.w > 0 ? 1 : -1, COL.body);
		txt(c, "Rod: " + (Math.abs(s.w * k) > 0.02 ? (s.w > 0 ? "turning ⟲ (seen from above)" : "turning ⟳ (seen from above)") : "still"), 10, H - 28, { col: COL.body, size: 12, b: 1 });
		txt(c, W < 520 ? "Spins: red ↑, blue ↓ · drag to turn" : "Electron spins: red ↑, blue ↓ · drag to turn · ↑ ↓ keys flip the field", 10, H - 10, { col: COL.dim, size: 11 });
	}
	var epStage = $("sn-ep-stage"), epSz = null;
	function epResize() { epSz = fitStage(epStage, function (w) { return w >= 560 ? 250 : 280; }); epDraw(); }
	function epDraw() {
		if (!epSz) return; var c = epSz.c, W = epSz.W, H = epSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var h = eHist, n = h.t.length, tn = n ? h.t[n - 1] : 0, win = Math.max(10, E.fib ? 4 * E.per : 12), t0 = Math.max(0, tn - win);
		var i0 = 0; while (i0 < n - 1 && h.t[i0] < t0) i0++;
		var kick = eKick(), e = Math.floor(Math.log10(kick * 2)), unit = Math.pow(10, e), ymax = kick * 1.15 / unit;
		for (var i = i0; i < n; i++) ymax = Math.max(ymax, Math.abs(h.b[i]) / unit * 1.1, Math.abs(h.e[i]) / unit * 1.1, Math.abs(h.l[i]) / unit * 1.1);
		var r = { x: 58, y: 12, w: W - 72, h: H - 46 };
		var f = frame(c, r, { x0: t0, x1: t0 + win, y0: -ymax, y1: ymax, xl: "time (s)", yl: "angular momentum (×10" + String(e).replace(/./g, function (ch) { return SUP[ch]; }) + " J·s)", title: "Angular momentum: rod + electrons + lab = 0" });
		var sl = function (a) { return a.slice(i0).map(function (v) { return v / unit; }); }, ts = h.t.slice(i0);
		if (ts.length > 1) { trace(c, r, f, ts, sl(h.l), COL.lab, 1.4, [5, 3]); trace(c, r, f, ts, sl(h.e), COL.el, 2); trace(c, r, f, ts, sl(h.b), COL.body, 2); var tot = ts.map(function (_, j) { return (h.b[i0 + j] + h.e[i0 + j] + h.l[i0 + j]) / unit; }); trace(c, r, f, ts, tot, COL.tot, 1.2); }
		legend(c, r, [["rod", COL.body], ["electrons", COL.el], ["to the lab (fibre)", COL.lab], ["total", COL.tot]]);
	}
	function eReadouts() {
		var s = eSim.s, m = M.matOf(E.mat), gm = eSim.gMeasured(), th = s.th;
		ro($("sn-e-ro"), [
			{ l: "Field", v: E.ac ? "AC, every " + sg(E.half, 2) + " s" : s.field > 0 ? "up" : s.field < 0 ? "down" : "off", s: "moment " + sci(s.mu, 2) + " A·m²" },
			{ l: "Electrons' angular momentum", v: sci(eSim.Le(), 2) + " J·s", s: "= −μ / γ′" },
			{ l: "Rod's angular momentum", v: sci(eSim.Lb(), 2) + " J·s", s: "rate " + sci(s.w, 2) + " rad/s" },
			{ l: "Rod angle", v: sci(th * 1000, 3) + " mrad", s: "spot on a scale 1 m away: " + sci(2 * th * 1000, 2) + " mm" },
			{ l: "g′ from this run", v: isFinite(gm) ? sg(gm, 2) : "flip the field", s: "true " + m.g + " · 1915 paper ≈ 1", c: isFinite(gm) ? (Math.abs(gm - m.g) < 0.1 ? "is-good" : "") : "" },
			{ l: "Total (should be 0)", v: sci(eSim.total(), 1) + " J·s", s: "rod + electrons + lab" }
		]);
	}
	$("sn-e-png").onclick = function () { png(eCv, "einstein-de-haas"); };

	/* ======================================================= 3. BARNETT ======================================================= */
	var bs = saved.b || {};
	var Bn = { rpm: num(bs.rpm, 0, 20000, 6000), mat: M.matOf(bs.mat).id, chiv: num(bs.chiv, 0, 4, 2), r: num(bs.r, 0.2, 5, 1), len: num(bs.len, 2, 60, 20), d: num(bs.d, 2, 100, 5), dir: bs.dir == null ? 1 : bs.dir, run: true, w: 0, th: 0, t: 0, hist: { t: [], w: [], m: [] }, hs: 0 };
	function bSave() { sset({ b: { rpm: Bn.rpm, mat: Bn.mat, chiv: Bn.chiv, r: Bn.r, len: Bn.len, d: Bn.d, dir: Bn.dir } }); }
	var bMat = $("sn-b-mat"); M.MATERIALS.forEach(function (m) { var o = document.createElement("option"); o.value = m.id; o.textContent = m.name; bMat.appendChild(o); }); bMat.value = Bn.mat;
	bMat.onchange = function () { Bn.mat = bMat.value; bSave(); bNotes(); };
	slider("sn-b-rpm", function () { return Bn.rpm; }, function (v) { Bn.rpm = v; bSave(); bNotes(); }, function (v) { return v.toLocaleString("en-US"); });
	slider("sn-b-chi", function () { return Bn.chiv; }, function (v) { Bn.chiv = v; bSave(); bNotes(); }, function (v) { return sg(Math.pow(10, v), 0); });
	slider("sn-b-r", function () { return Bn.r; }, function (v) { Bn.r = v; bSave(); bNotes(); }, function (v) { return sg(v, 2); });
	slider("sn-b-len", function () { return Bn.len; }, function (v) { Bn.len = v; bSave(); bNotes(); }, function (v) { return sg(v, 1); });
	slider("sn-b-d", function () { return Bn.d; }, function (v) { Bn.d = v; bSave(); bNotes(); }, function (v) { return sg(v, 1); });
	function bDir(d) { Bn.dir = d; bSave(); setPressed([$("sn-b-ccw"), $("sn-b-stop"), $("sn-b-cw")], d > 0 ? $("sn-b-ccw") : d < 0 ? $("sn-b-cw") : $("sn-b-stop")); }
	$("sn-b-ccw").onclick = function () { bDir(1); }; $("sn-b-stop").onclick = function () { bDir(0); }; $("sn-b-cw").onclick = function () { bDir(-1); };
	$("sn-b-play").onclick = function () { Bn.run = !Bn.run; this.textContent = Bn.run ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", Bn.run ? "true" : "false"); };
	function bVol() { return Math.PI * Math.pow(Bn.r / 100, 2) * Bn.len / 100; }
	function bNow(w) { return M.barnett(w, Math.pow(10, Bn.chiv), M.matOf(Bn.mat).g, bVol()); }
	function bNotes() {
		var w = M.rpmToOmega(Bn.rpm), b = bNow(w), Bm = M.dipoleField(Math.abs(b.mu), Bn.d / 100 + Bn.r / 100, false);
		$("sn-b-note").textContent = "At " + Bn.rpm.toLocaleString("en-US") + " rpm the electrons feel " + sci(b.B * 1e9, 2) + " nT, about " + sci(50e-6 / Math.max(b.B, 1e-30), 2) + " times weaker than the Earth's field. The magnetometer " + Bn.d + " cm from the rod's side would read about " + sci(Bm * 1e9, 2) + " nT.";
	}
	var bCv = $("sn-bc-c"), bStage = $("sn-b-stage"), bSz = null, bCam = { yaw: 0.5, pitch: 0.32, F: 40, k: 30, cx: 0, cy: 0 };
	$("sn-b-view").onclick = orbit(bCv, bCam, function () { bDraw(); }, { yaw: 0.5, pitch: 0.32 });
	function bResize() { bSz = fitStage(bStage, function (w) { return w >= 700 ? w * 0.46 : w * 0.95; }); bDraw(); }
	function bStep(dt) {
		var target = M.rpmToOmega(Bn.rpm) * Bn.dir; Bn.w = target + (Bn.w - target) * Math.exp(-dt / 1.2); Bn.t += dt;
		Bn.th += clamp(Bn.w / M.rpmToOmega(20000), -1, 1) * 9 * dt;  /* the picture spins at a watchable rate */
		Bn.hs += dt; if (Bn.hs >= 0.05 || !Bn.hist.t.length) { Bn.hs = 0; var b = bNow(Bn.w); Bn.hist.t.push(Bn.t); Bn.hist.w.push(Bn.w * 60 / TAU); Bn.hist.m.push(b.M); if (Bn.hist.t.length > 800) ["t", "w", "m"].forEach(function (k) { Bn.hist[k].shift(); }); }
	}
	function bDraw() {
		if (!bSz) return; var c = bSz.c, W = bSz.W, H = bSz.H; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var rad = clamp(6 * Bn.r / Bn.len, 0.75, 2.4);
		fitCam(bCam, W, H, [[-1.3, -1.3, -5.2], [1.3, 1.3, -5.2], [-1.3, 1.3, -5.2], [1.3, -1.3, -5.2], [-0.9, -0.9, 4.0], [0.9, 0.9, 4.0], [rad + 2.2, 0, 0], [-rad - 1, 0, 0]], W < 520 ? 120 : 54, 46, W >= 520 ? 150 : 30);
		var b = bNow(Bn.w), bMax = bNow(M.rpmToOmega(20000)), frac = Math.abs(bMax.M) > 0 ? 0.85 * b.M / Math.abs(bMax.M) : 0;
		/* motor and bearings */
		box3(c, bCam, -1.3, 1.3, -1.3, 1.3, -5.2, -3.8, "#3d6d8f"); line3(c, bCam, [0, 0, -3.8], [0, 0, -3], "#cfd6e4", 3);
		var ml = proj(bCam, 0, -1.4, -4.5); txt(c, "motor", ml.x, ml.y, { col: "#bcd4e6", size: 11, al: "center" });
		box3(c, bCam, -0.9, 0.9, -0.9, 0.9, 3.6, 4.0, "#4a5268"); line3(c, bCam, [0, 0, 3], [0, 0, 3.6], "#cfd6e4", 3);
		drawRod(c, bCam, { rad: rad, z0: -3, z1: 3, th: Bn.th, frac: frac, coil: null });
		if (Math.abs(Bn.w) > 1) spinArc(c, bCam, rad + 0.3, 3.3, Bn.w > 0 ? 1 : -1, COL.body);
		/* magnetization (against the spin) */
		if (Math.abs(frac) > 0.03) arrow3(c, bCam, [rad + 1.7, 0, -2.5 * frac], [rad + 1.7, 0, 2.5 * frac], "#ff6b6b", 3);
		var la = proj(bCam, rad + 1.7, 0, -3.4); txt(c, "M " + (frac >= 0 ? "↑" : "↓"), la.x, la.y, { col: "#ff9a9a", size: 12, b: 1, al: "center" });
		/* magnetometer gauge (2D, corner) */
		var gx = W - 82, gy = 128, gr = 54, Bm = M.dipoleField(Math.abs(b.mu), Bn.d / 100 + Bn.r / 100, false) * 1e9 * (b.mu < 0 ? -1 : 1), full = Math.max(1e-6, M.dipoleField(Math.abs(bMax.mu), Bn.d / 100 + Bn.r / 100, false) * 1e9);
		if (W < 520) { gx = W - 70; gy = H - 90; gr = 46; }
		c.fillStyle = "rgba(13,18,32,0.9)"; c.strokeStyle = "#3a4560"; c.lineWidth = 1; c.beginPath(); c.arc(gx, gy, gr + 10, 0, TAU); c.fill(); c.stroke();
		c.strokeStyle = "#5d6a86"; c.beginPath(); c.arc(gx, gy, gr, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
		var ang = -Math.PI / 2 + clamp(Bm / full, -1, 1) * Math.PI * 0.35; arrow2(c, gx, gy, gx + Math.cos(ang) * gr * 0.9, gy + Math.sin(ang) * gr * 0.9, "#ffd166", 2.5, 8);
		txt(c, "magnetometer", gx, gy + 18, { col: COL.dim, size: 10, al: "center" }); txt(c, mi(sci(Bm, 2)) + " nT", gx, gy + 33, { col: "#ffd166", size: 12, b: 1, al: "center" });
		txt(c, Math.abs(Bn.w) > 1 ? "Spins drawn lined up about " + sci(Math.abs(frac) / Math.max(Math.abs(b.M) / M.matOf(Bn.mat).Ms, 1e-30), 1) + " times more than real" : "Motor off: spins point every which way", 10, H - 28, { col: COL.dim, size: 11 });
		txt(c, "North pole points against the spin: electrons are negative", 10, H - 10, { col: "#ff9a9a", size: 11 });
	}
	var bpStage = $("sn-bp-stage"), bpSz = null;
	function bpResize() { bpSz = fitStage(bpStage, function () { return 230; }); bpDraw(); }
	function bpDraw() {
		if (!bpSz) return; var c = bpSz.c, W = bpSz.W, H = bpSz.H, h = Bn.hist; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var n = h.t.length, tn = n ? h.t[n - 1] : 0, win = 20, t0 = Math.max(0, tn - win), i0 = 0; while (i0 < n - 1 && h.t[i0] < t0) i0++;
		var wm = Math.max(1000, Bn.rpm * 1.1), mm = Math.abs(bNow(M.rpmToOmega(wm)).M) || 1;
		var r = { x: 58, y: 12, w: W - 116, h: H - 44 };
		var f = frame(c, r, { x0: t0, x1: t0 + win, y0: -wm, y1: wm, xl: "time (s)", yl: "spin rate (rpm)", title: "Spin rate and the magnetization it makes" });
		var ts = h.t.slice(i0); if (ts.length > 1) { trace(c, r, f, ts, h.w.slice(i0), COL.body, 2); trace(c, r, f, ts, h.m.slice(i0).map(function (v) { return v / mm * wm; }), "#ff6b6b", 2); }
		c.save(); c.font = "11px system-ui,sans-serif"; c.fillStyle = "#ff9a9a"; c.textAlign = "left"; c.textBaseline = "middle"; [-1, -0.5, 0, 0.5, 1].forEach(function (u) { c.fillText(mi(sci(u * mm, 1)), r.x + r.w + 4, f.Y(u * wm)); }); c.textAlign = "right"; c.textBaseline = "bottom"; c.fillText("M (A/m)", W - 6, H - 4); c.restore();
		legend(c, r, [["spin rate", COL.body], ["magnetization", "#ff6b6b"]]);
	}
	function bReadouts() {
		var b = bNow(Bn.w), m = M.matOf(Bn.mat), cyl = M.cylinder({ r: Bn.r / 100, len: Bn.len / 100, rho: m.rho, Ms: m.Ms }), Lb = cyl.I * Bn.w;
		ro($("sn-b-ro"), [
			{ l: "Spin rate", v: Math.round(Bn.w * 60 / TAU).toLocaleString("en-US") + " rpm", s: sg(Bn.w, 1) + " rad/s" },
			{ l: "Field the spins feel", v: sci(Math.abs(b.B) * 1e9, 2) + " nT", s: "B = ω / γ′" },
			{ l: "Magnetization", v: sci(b.M, 2) + " A/m", s: "a fraction " + sci(Math.abs(b.M) / m.Ms, 2) + " of full" },
			{ l: "Magnetic moment", v: sci(b.mu, 2) + " A·m²" },
			{ l: "Electrons vs rod", v: sci(Math.abs(Lb) > 0 ? b.Le / Lb : 0, 2), s: "share of the angular momentum the electrons took" }
		]);
	}
	$("sn-b-png").onclick = function () { png(bCv, "barnett-effect"); };

	/* ======================================================= loop / sizing ======================================================= */
	function onResize() { if (tab === "neutron") { nResize(); dResize(); sResize(); } else if (tab === "edh") { eResize(); epResize(); } else { bResize(); bpResize(); } }
	var rT; window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(onResize, 60); });
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rT); rT = setTimeout(onResize, 60); }).observe(root);
	var last = 0, roT = 0;
	function tick(dt) {
		roT += dt;
		if (tab === "neutron") { if (nT.run) nStep(dt); sTick(dt); nDraw(); dDraw(); if (roT > 0.25) { roT = 0; nReadouts(); } }
		else if (tab === "edh") { if (E.run) eStep(dt); eDraw(); epDraw(); if (roT > 0.2) { roT = 0; eReadouts(); } }
		else { if (Bn.run) bStep(dt); bDraw(); bpDraw(); if (roT > 0.2) { roT = 0; bReadouts(); } }
	}
	function loop(ts) { var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts; if (!document.hidden) tick(dt); requestAnimationFrame(loop); }
	bMax(); eBuild(); bDir(Bn.dir); bNotes(); nUpdate(); setTab(tab, true); eReadouts(); bReadouts();
	requestAnimationFrame(loop);
	window.MESSpinUI = { N: N, E: E, Bn: Bn, S: S, sim: function () { return eSim; }, tick: function (ms, n) { for (var i = 0; i < (n || 1); i++) tick((ms || 16) / 1000); } };
})();
