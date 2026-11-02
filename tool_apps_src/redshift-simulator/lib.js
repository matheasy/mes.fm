/* MES Redshift & Blueshift Simulator -- pure maths (no DOM). Browser global `MESRed`; node: require('./tool_apps_src/redshift-simulator/lib.js'); tests: node tool_apps_src/redshift-simulator-tests.js
 * Conventions: a "factor" is f_obs / f_src (frequency ratio, > 1 = blueshift); z = lambda_obs / lambda_emitted - 1 = 1 / factor - 1 (z < 0 = blueshift).
 * Doppler beta is the speed / c; theta is the angle, in the OBSERVER's frame, between the source's velocity and the direction from the source to the observer
 * (0 = coming straight at you, 180 = going straight away, 90 = sideways). Gravity uses the Schwarzschild metric (static emitter and receiver). */
(function (root) {
	"use strict";
	var C = 299792458, G = 6.6743e-11, MSUN = 1.98847e30, LY = 9.4607304725808e15, PC = 3.0856775814914e16, GYR = 3.15576e16;
	function gamma(b) { return 1 / Math.sqrt(1 - b * b); }
	/* ---------- Doppler ---------- */
	function dopplerFactor(beta, thetaDeg) { var th = (thetaDeg == null ? 0 : thetaDeg) * Math.PI / 180; return 1 / (gamma(beta) * (1 - beta * Math.cos(th))); }
	function zFromFactor(f) { return 1 / f - 1; }
	function factorFromZ(z) { return 1 / (1 + z); }
	function zFromBeta(beta) { return Math.sqrt((1 + beta) / (1 - beta)) - 1; }          // beta > 0 receding, < 0 approaching (line of sight)
	function betaFromZ(z) { var q = (1 + z) * (1 + z); return (q - 1) / (q + 1); }
	/* ---------- gravity ---------- */
	function rs(M) { return 2 * G * M / (C * C); }
	function gravLn(rsM, rEm, rObs) {                                                    // ln(nu_obs / nu_em), kept as a log so tiny shifts keep their digits
		if (!(rEm > rsM) || !(rObs > rsM)) return NaN;
		var a = rsM / rEm, b = isFinite(rObs) ? rsM / rObs : 0;
		return 0.5 * (Math.log1p(-a) - Math.log1p(-b));
	}
	function gravFactor(rsM, rEm, rObs) { return Math.exp(gravLn(rsM, rEm, rObs)); }   // nu_obs / nu_em; rObs may be Infinity
	function gravZ(rsM, rEm, rObs) { var l = gravLn(rsM, rEm, rObs); return isNaN(l) ? NaN : Math.expm1(-l); }
	function weakZ(M, rEm, rObs) { return G * M / (C * C) * (1 / rEm - (isFinite(rObs) ? 1 / rObs : 0)); }
	function clockRate(rsM, r) { return r > rsM ? Math.sqrt(1 - rsM / r) : NaN; }      // proper time per unit of far-away time
	function indexOf(rsM, r) { return 1 / clockRate(rsM, r); }                          // the "refractive index" picture: n = 1 / clock rate
	/* GPS: microseconds per day, satellite clock minus ground clock (static ground, circular orbit) */
	function gps(M, Rg, r) {
		var gm = G * M, grav = gm / (C * C) * (1 / Rg - 1 / r) * 86400e6, v2 = gm / r, sr = -v2 / (2 * C * C) * 86400e6;
		return { grav: grav, sr: sr, net: grav + sr, v: Math.sqrt(v2) };
	}
	/* ---------- cosmology (flat LCDM, radiation neglected) ---------- */
	function simpson(f, a, b, n) { n = n % 2 ? n + 1 : n; var h = (b - a) / n, s = f(a) + f(b); for (var i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; }
	function Cosmo(H0, Om) {
		Om = Om == null ? 0.3 : Om; var OL = 1 - Om, H = H0 * 1000 / (PC * 1e6);   // H in 1/s
		function E(a) { return Math.sqrt(Om / (a * a * a) + OL); }
		var tH = 1 / H;
		return {
			H0: H0, Om: Om, OL: OL, hubbleTimeGyr: tH / GYR,
			E: function (z) { return E(1 / (1 + z)); },
			// comoving distance, light-travel (lookback) time and age at redshift z
			comovingMpc: function (z) { var a = 1 / (1 + z); return C / H / (PC * 1e6) * simpson(function (x) { return 1 / (x * x * E(x)); }, a, 1, 2000); },
			lookbackGyr: function (z) { var a = 1 / (1 + z); return tH / GYR * simpson(function (x) { return 1 / (x * E(x)); }, a, 1, 2000); },
			ageGyr: function (z) { var a = 1 / (1 + z); return tH / GYR * simpson(function (x) { return Math.sqrt(x) / Math.sqrt(Om + OL * x * x * x); }, 0, a, 2000); },
			recessionC: function (z) { var Dm = this.comovingMpc(z) * PC * 1e6; return H * Dm / C; }   // v = H0 D today, in units of c (can exceed 1: space is expanding)
		};
	}
	/* ---------- light and colour ---------- */
	function wlToRgb(nm) {                                                              // Bruton's approximation; outside 380-780 nm a dim grey-violet / dark red
		var r = 0, g = 0, b = 0, w = nm;
		if (w >= 380 && w < 440) { r = -(w - 440) / 60; b = 1; } else if (w < 490) { g = (w - 440) / 50; b = 1; } else if (w < 510) { g = 1; b = -(w - 510) / 20; }
		else if (w < 580) { r = (w - 510) / 70; g = 1; } else if (w < 645) { r = 1; g = -(w - 645) / 65; } else if (w <= 780) { r = 1; }
		var f = w >= 380 && w < 420 ? 0.3 + 0.7 * (w - 380) / 40 : w > 700 && w <= 780 ? 0.3 + 0.7 * (780 - w) / 80 : w >= 420 && w <= 700 ? 1 : 0;
		if (w < 380 || w > 780) return [0, 0, 0, 0];
		function c(x) { return Math.round(255 * Math.pow(Math.max(0, x * f), 0.8)); }
		return [c(r), c(g), c(b), 1];
	}
	function bandOf(nm) {
		if (nm < 0.01) return "gamma rays"; if (nm < 10) return "X-rays"; if (nm < 121) return "extreme ultraviolet"; if (nm < 300) return "far ultraviolet"; if (nm < 380) return "near ultraviolet";
		if (nm < 450) return "violet-blue"; if (nm < 495) return "blue"; if (nm < 570) return "green"; if (nm < 590) return "yellow"; if (nm < 620) return "orange"; if (nm <= 780) return "red";
		if (nm < 2500) return "near infrared"; if (nm < 25000) return "mid infrared"; if (nm < 1e6) return "far infrared"; if (nm < 1e9) return "microwaves"; return "radio waves";
	}
	function shiftWl(nm, z) { return nm * (1 + z); }
	var LINES = [   // [id, label, rest wavelength in nm (vacuum-ish, to the usual 0.1 nm), element set]
		["lya", "Lyman-α", 121.567, "H"], ["hd", "Hδ", 410.17, "H"], ["hg", "Hγ", 434.05, "H"], ["hb", "Hβ", 486.13, "H"], ["ha", "Hα", 656.28, "H"],
		["he1", "He I", 587.56, "He"], ["he2", "He I", 667.82, "He"], ["he3", "He I", 501.57, "He"], ["he4", "He II", 468.57, "He"],
		["na1", "Na D", 589.0, "Na"], ["na2", "Na D", 589.59, "Na"],
		["caK", "Ca II K", 393.37, "Ca"], ["caH", "Ca II H", 396.85, "Ca"], ["ca3", "Ca I", 422.67, "Ca"],
		["oii", "[O II]", 372.7, "O"], ["o3a", "[O III]", 495.9, "O"], ["o3b", "[O III]", 500.7, "O"], ["o1", "[O I]", 630.0, "O"],
		["mgb", "Mg b", 517.3, "Mg"], ["nii", "[N II]", 658.3, "N"], ["sii", "[S II]", 671.6, "S"]
	];
	var SETS = [
		{ id: "H", name: "Hydrogen (Lyman-α and Balmer)", els: ["H"] }, { id: "He", name: "Helium", els: ["He"] }, { id: "Na", name: "Sodium (D lines)", els: ["Na"] },
		{ id: "Ca", name: "Calcium (H and K)", els: ["Ca"] }, { id: "O", name: "Oxygen", els: ["O"] }, { id: "gal", name: "A galaxy (H, He, O, N, S, Ca, Mg)", els: ["H", "He", "O", "N", "S", "Ca", "Mg"] }
	];
	function linesOf(setId) { var s = SETS.filter(function (x) { return x.id === setId; })[0] || SETS[0]; return LINES.filter(function (l) { return s.els.indexOf(l[3]) >= 0; }); }
	/* the exaggerated "index" used only for drawing: n_true = 1 + eps  ->  1 + k * eps */
	function exaggerate(n, k) { return 1 + (n - 1) * k; }
	function autoK(nNear, nFar, targetRatio) { var d = nNear / nFar - 1; return d > 0 ? Math.max(1, (targetRatio - 1) / d) : 1; }
	/* ---------- formatting ---------- */
	function sig(x, n) { if (!isFinite(x)) return String(x); if (x === 0) return "0"; var a = Math.abs(x); if (a >= 1e6 || a < 1e-3) { var e = x.toExponential(Math.max(0, (n || 3) - 1)).replace("e+", "e"); var m = /^(-?[\d.]+)e(-?\d+)$/.exec(e); return m ? m[1] + " × 10" + sup(m[2]) : e; } return String(parseFloat(x.toPrecision(n || 4))); }
	function sup(s) { var map = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }; return String(s).replace(/./g, function (c) { return map[c] || c; }); }
	function fmtWl(nm) { return nm < 1000 ? sig(nm, 4) + " nm" : nm < 1e6 ? sig(nm / 1000, 4) + " µm" : nm < 1e9 ? sig(nm / 1e6, 4) + " mm" : sig(nm / 1e9, 4) + " m"; }
	var BODIES = [   // name, mass kg, radius m, default near radius (in body radii), note
		{ id: "earth", name: "Earth", M: 5.9722e24, R: 6.371e6, near: 1, far: 1.0000035, note: "The Pound-Rebka tower at Harvard (22.5 m) measured this in 1959." },
		{ id: "gps", name: "Earth: ground to a GPS orbit", M: 5.9722e24, R: 6.371e6, near: 1, far: 4.1708, note: "GPS satellites orbit at 26,571 km from Earth's centre." },
		{ id: "sun", name: "The Sun", M: MSUN, R: 6.957e8, near: 1, far: Infinity, note: "From the Sun's surface to far away: about 0.64 km/s equivalent." },
		{ id: "sirius", name: "Sirius B (white dwarf)", M: 1.018 * MSUN, R: 5.84e6, near: 1, far: Infinity, note: "A star as heavy as the Sun squeezed to Earth's size." },
		{ id: "ns", name: "Neutron star", M: 1.4 * MSUN, R: 1.2e4, near: 1, far: Infinity, note: "Radius 12 km: light is stretched by about 24% just leaving the surface." },
		{ id: "bh", name: "Black hole (10 solar masses)", M: 10 * MSUN, R: 2 * G * 10 * MSUN / (C * C), near: 1.5, far: Infinity, note: "Radius here is the Schwarzschild radius; the shift grows without limit at the horizon." }
	];
	var EXAMPLES_Z = [
		{ name: "Virgo Cluster", z: 0.0038 }, { name: "Coma Cluster", z: 0.0231 }, { name: "Quasar 3C 273", z: 0.158 }, { name: "Quasar 3C 48", z: 0.367 }, { name: "Supernova of 1998 (acceleration)", z: 0.83 },
		{ name: "A quasar at the edge of reionisation", z: 7.54 }, { name: "GN-z11 (Hubble, JWST)", z: 10.6 }, { name: "JADES-GS-z14-0 (JWST)", z: 14.32 }, { name: "Cosmic microwave background", z: 1089 }
	];
	/* ---------- gravitational potential of a uniform sphere, and its optical analogue (tab "pot") ----------
	 * Outside: Phi = -GM/r. Inside (uniform density): Phi = -GM (3R^2 - r^2) / (2R^3), so the centre is 1.5 x deeper than the surface. g = GM/r^2 outside, GM r / R^3 inside.
	 * Weak-field optical analogue (isotropic coordinates): light moves as in a medium of index n = 1 - 2 Phi / c^2. It gives the full general-relativity deflection 4GM/(c^2 b)
	 * outside the body (Newton's corpuscle gets half of it); it is only valid while |Phi| << c^2. In units of R with k = GM/(R c^2): n = 1 + 2k u(rho), u = 1/rho or (3 - rho^2)/2. */
	function phiSphere(M, Rb, r) { var gm = G * M; return r >= Rb ? -gm / r : -gm * (3 * Rb * Rb - r * r) / (2 * Rb * Rb * Rb); }
	function gSphere(M, Rb, r) { var gm = G * M; return r >= Rb ? gm / (r * r) : gm * r / (Rb * Rb * Rb); }
	function vEscSphere(M, Rb, r) { return Math.sqrt(-2 * phiSphere(M, Rb, r)); }
	function nPot(M, Rb, r) { return 1 - 2 * phiSphere(M, Rb, r) / (C * C); }
	function compactness(M, Rb) { return G * M / (Rb * C * C); }
	function uRho(rho) { return rho >= 1 ? 1 / rho : (3 - rho * rho) / 2; }
	function duRho(rho) { return rho >= 1 ? -1 / (rho * rho) : -rho; }
	/* weak-field (first order in k) deflection of a ray with impact parameter b (units of R): (4k/b)(1 - s) + 4k b s, s = sqrt(1 - b^2) inside; 4k/b outside */
	function weakDeflection(k, b) { b = Math.abs(b); if (b >= 1) return 4 * k / b; var s = Math.sqrt(1 - b * b); return (b === 0 ? 0 : 4 * k / b * (1 - s)) + 4 * k * b * s; }
	/* ray through n(rho) = 1 + 2k u(rho): start at x = -X, height b, moving +x. Eikonal d/ds (n dr/ds) = grad n, RK4 with a step that grows with distance.
	 * Returns { pts (every few steps, units of R), defl (radians, positive = toward the mass), closest } */
	function traceRay(k, b, X, maxPts) {
		X = X || 2000; var st = [-X, b, 1 + 2 * k * uRho(Math.hypot(X, b)), 0], pts = [st[0], st[1]], closest = Infinity, n = 0;
		function f(s) { var rho = Math.hypot(s[0], s[1]) || 1e-12, nn = 1 + 2 * k * uRho(rho), gr = 2 * k * duRho(rho) / rho; return [s[2] / nn, s[3] / nn, gr * s[0], gr * s[1]]; }
		while (st[0] < X && n < 400000) {
			var rho = Math.hypot(st[0], st[1]); closest = Math.min(closest, rho);
			var h = Math.min(0.004 + 0.02 * rho, 20), a = f(st), q = function (d, c) { return [st[0] + d[0] * c, st[1] + d[1] * c, st[2] + d[2] * c, st[3] + d[3] * c]; };
			var b2 = f(q(a, h / 2)), c2 = f(q(b2, h / 2)), d2 = f(q(c2, h));
			for (var i = 0; i < 4; i++) st[i] += h / 6 * (a[i] + 2 * b2[i] + 2 * c2[i] + d2[i]);
			if (st[2] < 0 && Math.abs(st[0]) > 10) break;   // turned back (only for absurdly strong lenses)
			n++; if (n % 3 === 0 && Math.abs(st[0]) < 12) pts.push(st[0], st[1]);
		}
		pts.push(st[0], st[1]);
		return { pts: pts, defl: -Math.atan2(st[3], st[2]) * (b >= 0 ? 1 : -1), closest: closest };
	}
	var POT_BODIES = [
		{ id: "earth", name: "Earth", M: 5.9722e24, R: 6.371e6, note: "Uniform density is a simplification: Earth's core is denser, so its real centre is a little deeper than 1.5× the surface value." },
		{ id: "sun", name: "The Sun", M: MSUN, R: 6.957e8, note: "Real stars are far denser at the centre than at the surface; the uniform sphere is the classroom model." },
		{ id: "wd", name: "White dwarf (Sirius B)", M: 1.018 * MSUN, R: 5.84e6, note: "About the Sun's mass in Earth's size." },
		{ id: "ns", name: "Neutron star", M: 1.4 * MSUN, R: 1.2e4, note: "12 km radius: |Φ|/c² is about 0.17 at the surface, so the weak-field analogue is only a rough guide here." },
		{ id: "sun2", name: "The Sun squeezed to R = 2 km", M: MSUN, R: 2000, note: "The example from the talk. 2 km is smaller than the Sun's Schwarzschild radius (2.95 km): in general relativity this is a black hole. The Newtonian potential still draws a funnel, but |Φ|/c² ≈ 0.74 at the surface and the escape speed exceeds c, far outside where n = 1 − 2Φ/c² holds." },
		{ id: "custom", name: "Custom", M: MSUN, R: 7e8, note: "Type a mass and a radius." }
	];
	var R = { C: C, G: G, phiSphere: phiSphere, gSphere: gSphere, vEscSphere: vEscSphere, nPot: nPot, compactness: compactness, uRho: uRho, duRho: duRho, weakDeflection: weakDeflection, traceRay: traceRay, POT_BODIES: POT_BODIES, MSUN: MSUN, LY: LY, PC: PC, GYR: GYR, gamma: gamma, dopplerFactor: dopplerFactor, zFromFactor: zFromFactor, factorFromZ: factorFromZ, zFromBeta: zFromBeta, betaFromZ: betaFromZ,
		rs: rs, gravLn: gravLn, gravFactor: gravFactor, gravZ: gravZ, weakZ: weakZ, clockRate: clockRate, indexOf: indexOf, gps: gps, Cosmo: Cosmo, wlToRgb: wlToRgb, bandOf: bandOf, shiftWl: shiftWl,
		LINES: LINES, SETS: SETS, linesOf: linesOf, exaggerate: exaggerate, autoK: autoK, sig: sig, fmtWl: fmtWl, BODIES: BODIES, EXAMPLES_Z: EXAMPLES_Z };
	if (typeof module !== "undefined" && module.exports) module.exports = R; else root.MESRed = R;
})(typeof window !== "undefined" ? window : this);
