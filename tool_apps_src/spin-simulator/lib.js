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
