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

/* MES Redshift & Blueshift Simulator (mes.fm/redshift-simulator). Maths in lib.js (MESRed); this file is the four tabs: gravity (a pulse between a place near a mass and
 * a place far from it, drawn as a refractive-index gradient with two clocks), a moving source with relativistic wavefronts, a spectrum shifter / calculator,
 * and the expanding universe. Canvases are drawn from the same numbers as the readouts; animations pause while the page is hidden. */
(function () {
	"use strict";
	var R = window.MESRed, root = document.getElementById("rs"); if (!R || !root) return;
	var $ = function (id) { return document.getElementById(id); }, KEY = "mes-redshift-simulator:v1", TAU = Math.PI * 2;
	var DEF = { tab: "grav", g: { body: "earth", near: "1", nearU: "R", far: "1.0000035", farU: "R", wl: 550, ex: "auto", dir: "in", sp: 1, rep: true },
		d: { b: 0.5, wl: 550, sp: 1 }, s: { set: "H", mode: "em", scale: "ext", b: 0, a: 0, zc: 0 }, c: { z: 1, H0: 67.4, Om: 0.315, line: "ha" }, p: { body: "sun2", m: "1", r: "2", col: "phi", cont: true, lines: true, b: 1.5, yaw: -0.65, pitch: 0.6 } };
	var S = JSON.parse(JSON.stringify(DEF));
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in DEF) { if (typeof DEF[k] === "object") { for (var j in DEF[k]) if (sv[k] && sv[k][j] != null) S[k][j] = sv[k][j]; } else if (sv[k] != null) S[k] = sv[k]; } } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
	function num(s) { s = String(s == null ? "" : s).trim().replace(/,/g, ""); if (s === "" ) return NaN; var v = Number(s); return v; }
	function fmt(x, n) { return R.sig(x, n || 4); }
	function swatch(nm, z) { var c = R.wlToRgb(nm); return "<span class='rs-sw' style='background:" + (c[3] ? "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")" : "repeating-linear-gradient(45deg,#777,#777 3px,#444 3px,#444 6px)") + "' title='" + (c[3] ? "visible" : "not visible: " + R.bandOf(nm)) + "'></span>"; }
	function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
	function sgnZ(z) { return (z >= 0 ? "+" : "−") + fmt(Math.abs(z), 4); }
	function cls(z) { return z > 0 ? "rs-red" : z < 0 ? "rs-blue" : ""; }
	function shiftWord(z) { return z > 0 ? "redshift" : z < 0 ? "blueshift" : "no shift"; }
	function fitCanvas(c, aspect, minH) {
		var w = Math.max(280, c.parentNode.clientWidth || 600), h = Math.max(minH || 200, Math.round(w * aspect)), d = window.devicePixelRatio || 1;
		if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.height = h + "px"; }
		var x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return { x: x, w: w, h: h };
	}
	function text(x, t, px, py, size, col, al) { x.font = (size || 13) + "px system-ui,Helvetica,Arial,sans-serif"; x.fillStyle = col || "#cfd6e6"; x.textAlign = al || "left"; x.textBaseline = "middle"; x.fillText(t, px, py); }

	/* ---------- tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll(".rs-tabs button")), panels = [].slice.call(root.querySelectorAll("[data-panel]"));
	function showTab(t, keep) {
		S.tab = t; tabs.forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
		if (!keep) save(); redrawAll();
	}
	tabs.forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
	function seg(id, key, store, cb) {
		var el = $(id); function paint() { [].forEach.call(el.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(store[key]) === b.getAttribute("data-v") ? "true" : "false"); }); } paint();
		el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; store[key] = b.getAttribute("data-v"); paint(); save(); cb(); });
	}
	function chips(id, list, fn) { var el = $(id); el.innerHTML = list.map(function (p, i) { return "<button type='button' data-i='" + i + "'>" + esc(p.name || p.label) + "</button>"; }).join(""); el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) fn(list[+b.getAttribute("data-i")]); }); }

	/* =========================== 1. GRAVITY =========================== */
	var G = S.g, gs = { paused: false, pulses: [], t: 0, gap: 0, err: "", calc: null, ticksN: 0, ticksF: 0 };
	var bodySel = $("rs-g-body"), nearIn = $("rs-g-near"), farIn = $("rs-g-far"), nearU = $("rs-g-nearu"), farU = $("rs-g-faru");
	bodySel.innerHTML = R.BODIES.map(function (b) { return "<option value='" + b.id + "'>" + esc(b.name) + "</option>"; }).join("");
	var UNITS = "<option value='R'>× its radius</option><option value='rs'>× Schwarzschild radius</option><option value='km'>km</option><option value='m'>m</option>"; nearU.innerHTML = UNITS; farU.innerHTML = UNITS;
	function bodyOf() { return R.BODIES.filter(function (b) { return b.id === G.body; })[0] || R.BODIES[0]; }
	function toMeters(v, u, b) { return u === "R" ? v * b.R : u === "rs" ? v * R.rs(b.M) : u === "km" ? v * 1000 : v; }
	function gSync() { bodySel.value = G.body; nearIn.value = G.near; farIn.value = G.far; nearU.value = G.nearU; farU.value = G.farU; $("rs-g-wl").value = G.wl; $("rs-g-sp").value = G.sp; $("rs-g-rep").checked = !!G.rep; $("rs-g-bnote").textContent = bodyOf().note; seg0(); }
	function seg0() { [].forEach.call($("rs-g-ex").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(G.ex) === b.getAttribute("data-v") ? "true" : "false"); }); var d = $("rs-g-dir"); d.textContent = "Light travels: " + (G.dir === "in" ? "far → near (falls in)" : "near → far (climbs out)"); d.setAttribute("aria-pressed", G.dir === "in" ? "true" : "false"); }
	function gCompute() {
		var b = bodyOf(), rsM = R.rs(b.M), vn = num(G.near), vf = String(G.far).trim() === "" || /^(far|inf|infinity|∞)/i.test(String(G.far).trim()) ? Infinity : num(G.far);
		if (!isFinite(vn) || vn <= 0) return { err: "Type a distance for the near point." };
		if (isNaN(vf) || vf <= 0) return { err: "Type a distance for the far point, or leave it empty for very far away." };
		var rn = toMeters(vn, G.nearU, b), rf = isFinite(vf) ? toMeters(vf, G.farU, b) : Infinity, swapped = false;
		if (rf < rn) { var t = rn; rn = rf; rf = t; swapped = true; }
		if (!(rn > rsM)) return { err: "The near point is inside the black hole's horizon (r ≤ " + fmt(rsM) + " m): no light gets out from there." };
		var inw = G.dir === "in", rE = inw ? rf : rn, rO = inw ? rn : rf, f = R.gravFactor(rsM, rE, rO), z = R.gravZ(rsM, rE, rO);
		var nN = R.indexOf(rsM, rn), nF = isFinite(rf) ? R.indexOf(rsM, rf) : 1, cN = R.clockRate(rsM, rn), cF = isFinite(rf) ? R.clockRate(rsM, rf) : 1;
		var wlE = G.wl, wlO = wlE * (1 + z);
		return { b: b, rsM: rsM, rn: rn, rf: rf, swapped: swapped, f: f, z: z, nN: nN, nF: nF, cN: cN, cF: cF, wlE: wlE, wlO: wlO, weak: R.weakZ(b.M, rE, rO) * (inw ? -1 : 1) };
	}
	function gUpdate() {
		var c = gs.calc = gCompute(), res = $("rs-g-res"), cards = $("rs-g-cards");
		$("rs-g-wl-v").textContent = G.wl + " nm"; $("rs-g-sp-v").textContent = fmt(G.sp, 2) + "×"; $("rs-g-bnote").textContent = bodyOf().note;
		if (c.err) { res.innerHTML = "<p class='rs-red'>" + esc(c.err) + "</p>"; cards.innerHTML = ""; return; }
		gs.k = G.ex === "auto" ? R.autoK(c.nN, c.nF, 1.9) : 1; gs.nNd = R.exaggerate(c.nN / c.nF, gs.k); gs.nFd = 1;   // drawn relative to the far point (n = 1 there), so a huge exaggeration keeps the clock periods sensible
		$("rs-g-exn").textContent = G.ex === "auto" ? (gs.k > 1.5 ? "The real index difference is " + fmt(c.nN / c.nF - 1, 3) + ": drawn " + fmt(gs.k, 3) + "× bigger so you can see it. Every number below is the true one." : "The effect is large enough to draw as it is.") : "No exaggeration: for ordinary objects you will see almost nothing, which is the point.";
		var zw = c.f > 1 ? "blueshifted" : "redshifted", dl = c.wlO - c.wlE;
		cards.innerHTML =
			"<div class='rs-card'><h4>Emitted</h4><span class='rs-big'>" + swatch(c.wlE) + c.wlE + " nm</span><small>" + (G.dir === "in" ? "far from the mass" : "near the mass") + "</small></div>" +
			"<div class='rs-card'><h4>Received (" + zw + ")</h4><span class='rs-big " + cls(c.z) + "'>" + swatch(c.wlO) + fmt(c.wlO, 9) + " nm</span><small>z = " + sgnZ(c.z) + ", Δλ = " + (dl >= 0 ? "+" : "−") + fmt(Math.abs(dl), 3) + " nm</small></div>" +
			"<div class='rs-card'><h4>Clock rate near the mass</h4><span class='rs-big'>" + fmt(c.cN, 10) + "</span><small>compared with a clock very far away (=1)</small></div>" +
			"<div class='rs-card'><h4>Index n = 1 / clock rate</h4><span class='rs-big'>" + fmt(c.nN, 10) + "</span><small>near · far " + fmt(c.nF, 10) + "</small></div>";
		var ratio = c.cF / c.cN;
		res.innerHTML = "<h3>The numbers</h3><div class='rs-tw'><table class='rs-table'><tbody>" +
			"<tr><th>Schwarzschild radius r<sub>s</sub> = 2GM/c²</th><td>" + (c.rsM < 1 ? fmt(c.rsM * 1000, 4) + " mm" : c.rsM < 1e4 ? fmt(c.rsM, 5) + " m" : fmt(c.rsM / 1000, 5) + " km") + "</td></tr>" +
			"<tr><th>Near point / far point</th><td>" + fmt(c.rn / 1000, 7) + " km (" + fmt(c.rn / c.rsM, 5) + " r<sub>s</sub>) &nbsp;/&nbsp; " + (isFinite(c.rf) ? fmt(c.rf / 1000, 9) + " km" : "very far away") + (c.swapped ? " <i>(swapped so near is the smaller)</i>" : "") + "</td></tr>" +
			"<tr><th>Frequency ratio f<sub>received</sub> / f<sub>emitted</sub></th><td>" + fmt(c.f, 12) + "</td></tr>" +
			"<tr><th>Redshift z = λ<sub>received</sub> / λ<sub>emitted</sub> − 1</th><td class='" + cls(c.z) + "'>" + sgnZ(c.z) + " (" + shiftWord(c.z) + ")</td></tr>" +
			"<tr><th>Same as a Doppler speed of</th><td>" + fmt(c.z * R.C / 1000, 5) + " km/s (z·c, small z)</td></tr>" +
			"<tr><th>Weak-field estimate GM/c² (1/r<sub>E</sub> − 1/r<sub>O</sub>)</th><td>" + sgnZ(c.weak) + (Math.abs(c.z) > 0 ? " (" + fmt(Math.abs(c.weak / c.z) * 100, 4) + "% of the exact value)" : "") + "</td></tr>" +
			"<tr><th>Clock near the mass vs far</th><td>1 hour far away = " + fmt(c.cN / c.cF * 3600, 10) + " s on the near clock" + (Math.abs(ratio - 1) > 1e-12 ? " (" + fmt((1 - c.cN / c.cF) * 86400e6, 4) + " µs a day slower)" : "") + "</td></tr>" +
			"<tr><th>Light reaches the receiver at</th><td>" + R.fmtWl(c.wlO) + " (" + R.bandOf(c.wlO) + ")</td></tr></tbody></table></div>";
	}
	[["rs-g-body", "input", function (e) { G.body = e.target.value; var b = bodyOf(); G.near = String(b.near); G.nearU = "R"; G.far = isFinite(b.far) ? String(b.far) : ""; G.farU = "R"; }], ["rs-g-near", "input", function (e) { G.near = e.target.value; }], ["rs-g-far", "input", function (e) { G.far = e.target.value; }], ["rs-g-nearu", "change", function (e) { G.nearU = e.target.value; }], ["rs-g-faru", "change", function (e) { G.farU = e.target.value; }],
		["rs-g-wl", "input", function (e) { G.wl = +e.target.value; }], ["rs-g-sp", "input", function (e) { G.sp = +e.target.value; }], ["rs-g-rep", "change", function (e) { G.rep = e.target.checked; }]].forEach(function (a) {
		$(a[0]).addEventListener(a[1], function (e) { a[2](e); if (a[0] === "rs-g-body") gSync(); save(); gUpdate(); });
	});
	seg("rs-g-ex", "ex", G, function () { gUpdate(); });
	$("rs-g-dir").onclick = function () { G.dir = G.dir === "in" ? "out" : "in"; seg0(); save(); gs.pulses = []; gUpdate(); emit(); };
	function emit() { if (gs.calc && !gs.calc.err) gs.pulses.push({ d: 0 }); }
	$("rs-g-emit").onclick = function () { gsPause(false); emit(); };
	function gsPause(on) { gs.paused = on; var b = $("rs-g-pause"); b.innerHTML = on ? "&#9654; Play" : "&#9208; Pause"; b.setAttribute("aria-pressed", String(on)); }
	$("rs-g-pause").onclick = function () { gsPause(!gs.paused); };
	$("rs-g-reset").onclick = function () { gs.t = 0; gs.pulses = []; gsPause(false); emit(); gDraw(0); };
	var scrub = $("rs-g-scrub"), scrubbing = false;
	scrub.addEventListener("input", function () {
		scrubbing = true; gsPause(true); if (!gs.pulses.length) emit(); var c = gs.calc; if (!c || c.err) return;
		var S1 = gs.nNd * 0.5 + gs.nFd * 0.5; gs.pulses[gs.pulses.length - 1].d = (+scrub.value / 1000) * S1; gDraw(0);
	});
	scrub.addEventListener("change", function () { scrubbing = false; });
	var GPRE = [
		{ name: "Pound–Rebka tower (22.5 m)", body: "earth", near: "6371", nearU: "km", far: "6371.0225", farU: "km", dir: "in" },
		{ name: "GPS satellite to ground", body: "gps", near: "6371", nearU: "km", far: "26571", farU: "km", dir: "in" },
		{ name: "Sun's surface to far away", body: "sun", near: "1", nearU: "R", far: "", farU: "R", dir: "out" },
		{ name: "Sirius B's surface", body: "sirius", near: "1", nearU: "R", far: "", farU: "R", dir: "out" },
		{ name: "Neutron star's surface", body: "ns", near: "1", nearU: "R", far: "", farU: "R", dir: "out" },
		{ name: "Just outside a black hole (1.1 r_s)", body: "bh", near: "1.1", nearU: "rs", far: "", farU: "R", dir: "out" },
		{ name: "Falling into a black hole (from far)", body: "bh", near: "1.5", nearU: "rs", far: "", farU: "R", dir: "in" }
	];
	var GNOTE = ["Hold the clocks 22.5 m apart in a lift shaft: Pound and Rebka measured a shift of 2.5 parts in a thousand million million, using gamma rays and the Mössbauer effect (1959).", "Satellite clocks gain about 38.5 µs a day relative to the ground (45.7 from weaker gravity, −7.2 from speed). The tab shows only the gravity part for light.", "A spectral line from the Sun's surface is redshifted by 2.12 millionths: like moving away at 0.64 km/s. Sunlight is also Doppler shifted by convection, which is bigger.", "The first white dwarf where gravitational redshift was measured (1925, Adams): about 80 km/s equivalent.", "Light leaving the surface is stretched by about 24%.", "As the point gets closer to r = r_s the redshift grows without limit.", "Light from far away falling toward the hole arrives hugely blueshifted at the near point."];
	chips("rs-g-pre", GPRE, function (p) { G.body = p.body === "gps" ? "gps" : p.body; G.near = p.near; G.nearU = p.nearU; G.far = p.far; G.farU = p.farU; G.dir = p.dir; gSync(); save(); gs.pulses = []; gUpdate(); emit(); $("rs-g-pnote").textContent = GNOTE[GPRE.indexOf(p)]; });
	function gDraw(dt) {
		var cv = $("rs-g"), f = fitCanvas(cv, 0.52, 270), x = f.x, W = f.w, H = f.h, c = gs.calc;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, W, H);
		if (!c || c.err) { text(x, c ? c.err : "", W / 2, H / 2, 14, "#ffb4aa", "center"); return; }
		var left = W * 0.1, right = W * 0.95, sw = right - left, cy = H * 0.38, bandH = H * 0.34, a = gs.nNd, b = gs.nFd;
		function nAt(u) { return a + (b - a) * u; } function sAt(u) { return a * u + (b - a) * u * u / 2; } var S1 = sAt(1);
		// heavy mass on the left with a glow
		var rad = H * 0.36, g0 = x.createRadialGradient(left - rad * 0.2, cy, rad * 0.2, left - rad * 0.2, cy, rad * 1.5); g0.addColorStop(0, "rgba(255,200,120,0.95)"); g0.addColorStop(0.4, "rgba(120,80,255,0.35)"); g0.addColorStop(1, "rgba(60,80,255,0)");
		x.save(); x.beginPath(); x.rect(0, 0, left, H); x.clip(); x.fillStyle = g0; x.fillRect(0, 0, left, H); x.restore(); x.save(); x.beginPath(); x.rect(0, 0, left, H); x.clip(); x.beginPath(); x.arc(left - rad * 0.2 - rad * 0.55, cy, rad * 0.55, 0, TAU); x.fillStyle = "#f0b25a"; x.fill(); x.restore();
		text(x, "heavy mass", 6, cy + rad * 0.62, 12, "#e3d2a8"); text(x, "NEAR", left + 6, cy - bandH / 2 - 9, 12, "#8db2ff"); text(x, "FAR", right - 6, cy - bandH / 2 - 9, 12, "#ff9f8f", "right");
		// index gradient slab: bluer where the index is higher
		var gr = x.createLinearGradient(left, 0, right, 0), nmax = Math.max(a, b), nmin = Math.min(a, b);
		function idxCol(n) { var t = nmax > nmin ? (n - nmin) / (nmax - nmin) : 0.5; return "rgba(" + Math.round(40 + 20 * (1 - t)) + "," + Math.round(120 + 60 * (1 - t)) + "," + Math.round(160 + 90 * t) + "," + (0.12 + 0.32 * t) + ")"; }
		gr.addColorStop(0, idxCol(a)); gr.addColorStop(1, idxCol(b)); x.fillStyle = gr; x.fillRect(left, cy - bandH / 2, sw, bandH);
		x.strokeStyle = "rgba(160,190,255,0.5)"; x.lineWidth = 1; x.strokeRect(left + 0.5, cy - bandH / 2 + 0.5, sw, bandH);
		x.setLineDash([3, 5]); x.strokeStyle = "rgba(255,255,255,0.15)"; x.beginPath(); x.moveTo(left, cy); x.lineTo(right, cy); x.stroke(); x.setLineDash([]);
		text(x, "refractive index n: higher = slower clocks, shorter waves", left + sw / 2, cy + bandH / 2 + 13, 11, "#8794b0", "center");
		// pulses
		var inw = G.dir === "in", speed = 0.32 * G.sp * S1;
		if (dt) { gs.pulses.forEach(function (p) { p.d += dt * speed; }); gs.pulses = gs.pulses.filter(function (p) { return p.d < S1 * 1.25; }); if (!gs.pulses.length && G.rep) { gs.gap += dt; if (gs.gap > 0.5) { gs.gap = 0; emit(); } } else gs.gap = 0; }
		if (!scrubbing && gs.pulses.length) { var lp = gs.pulses[gs.pulses.length - 1]; scrub.value = Math.max(0, Math.min(1000, Math.round(lp.d / S1 * 1000))); }
		var nE = inw ? b : a, N0 = Math.max(10, sw / 38), amp = bandH * 0.36, sig = S1 * 0.11;
		gs.pulses.forEach(function (p) {
			var sc = inw ? S1 - p.d : p.d, px = null, py = 0, pts = [];
			for (var i = 0; i <= 360; i++) {
				var u = i / 360, s2 = sAt(u), env = Math.exp(-Math.pow((s2 - sc) / sig, 2)); if (env < 0.02) { pts.push(null); continue; }
				var yy = cy - amp * env * Math.cos(TAU * N0 * (s2 - sc)), xx = left + sw * u, col = R.wlToRgb(Math.min(700, Math.max(400, c.wlE * nE / nAt(u))));
				pts.push([xx, yy, col[3] ? rgba(col, 1) : "rgba(235,235,235,0.9)"]);
			}
			// a dark halo under the wave so it reads against the coloured slab, then the coloured line on top
			x.lineJoin = "round"; x.lineCap = "round"; x.strokeStyle = "rgba(4,8,20,0.88)"; x.lineWidth = 6; x.beginPath(); pts.forEach(function (q, i) { if (!q) { px = null; return; } if (px == null) x.moveTo(q[0], q[1]); else x.lineTo(q[0], q[1]); px = 1; }); x.stroke();
			x.lineWidth = 2.8; px = null; pts.forEach(function (q, i) { if (!q) { px = null; return; } var pq = pts[i - 1]; if (pq) { x.strokeStyle = q[2]; x.beginPath(); x.moveTo(pq[0], pq[1]); x.lineTo(q[0], q[1]); x.stroke(); } });
		});
		// light clocks
		var P0 = 1.1, tt = gs.t, clocks = [{ u: 0.0, n: a, nm: "near", ox: left + sw * 0.12 }, { u: 1, n: b, nm: "far", ox: right - sw * 0.12 }];
		clocks.forEach(function (ck) {
			var ph = tt / (ck.n * P0), fr = ph - Math.floor(ph), yv = fr < 0.5 ? fr * 2 : 2 - fr * 2, top = H * 0.72, bot = H * 0.87;
			x.strokeStyle = "#9fb0d6"; x.lineWidth = 2; x.beginPath(); x.moveTo(ck.ox - 16, top); x.lineTo(ck.ox + 16, top); x.moveTo(ck.ox - 16, bot); x.lineTo(ck.ox + 16, bot); x.stroke();
			x.fillStyle = ck.nm === "near" ? "#e86bff" : "#27d7ff"; x.beginPath(); x.arc(ck.ox, top + (bot - top) * yv, 6, 0, TAU); x.fill();
			var ticks = Math.floor(ph) ; if (ck.nm === "near") gs.ticksN = ticks; else gs.ticksF = ticks;
			text(x, ck.nm + " clock: " + ticks + " ticks", ck.ox, H * 0.955, 12, "#cfd6e6", "center");
			text(x, "clock rate " + fmt(ck.nm === "near" ? c.cN : c.cF, 9), ck.ox, H * 0.655, 11, "#8794b0", "center");
		});
		// receiver / emitter labels with colour dots
		var recvU = inw ? 0 : 1, emU = inw ? 1 : 0; function dotAt(u, wl, label) { var col = R.wlToRgb(wl); x.fillStyle = col[3] ? rgba(col, 1) : "#999"; x.beginPath(); x.arc(left + sw * u + (u === 0 ? -12 : 12) * 0, cy + bandH / 2 + 13, 5, 0, TAU); x.fill(); text(x, label, left + sw * u + (u === 0 ? 10 : -10), cy + bandH / 2 + 13, 11, "#cfd6e6", u === 0 ? "left" : "right"); }
		dotAt(emU, c.wlE, "emits " + c.wlE + " nm"); dotAt(recvU, c.wlO, "sees " + fmt(c.wlO, 6) + " nm");
		if (gs.k > 1.5) text(x, "drawn " + fmt(gs.k, 3) + "× exaggerated (real values below)", left + sw / 2, cy + bandH / 2 + 28, 11, "#7f8ba6", "center");
	}

	/* =========================== 2. DOPPLER =========================== */
	var D = S.d, ds = { t: 0, fronts: [], nextEmit: 0, x: 0, trail: [], flash: 0 };
	function dUpdate() {
		$("rs-d-b").value = D.b; $("rs-d-wl").value = D.wl; $("rs-d-sp").value = D.sp; $("rs-d-wl-v").textContent = D.wl + " nm"; $("rs-d-sp-v").textContent = fmt(D.sp, 2) + "×";
		var b = D.b, g = R.gamma(b), sgn = b >= 0 ? "right" : "left"; $("rs-d-b-v").innerHTML = (b === 0 ? "at rest" : fmt(Math.abs(b), 4) + " c to the " + sgn + " (" + fmt(Math.abs(b) * R.C / 1000, 6) + " km/s)") + ", γ = " + fmt(g, 4);
		var aheadF = R.dopplerFactor(Math.abs(b), 0), behindF = R.dopplerFactor(Math.abs(b), 180), sideF = R.dopplerFactor(Math.abs(b), 90);
		function card(title, f, sub) { var z = R.zFromFactor(f), wl = D.wl / f; return "<div class='rs-card'><h4>" + title + "</h4><span class='rs-big " + cls(z) + "'>" + swatch(wl) + fmt(wl, 5) + " nm</span><small>z = " + sgnZ(z) + " · f ratio " + fmt(f, 5) + " · " + R.bandOf(wl) + (sub ? "<br>" + sub : "") + "</small></div>"; }
		$("rs-d-cards").innerHTML = card("Observer ahead of the source", b === 0 ? 1 : aheadF, "") + card("Observer behind the source", b === 0 ? 1 : behindF, "") + card("Observer far off to the side", b === 0 ? 1 : sideF, "pure time dilation: 1 / γ");
		$("rs-d-res").innerHTML = "<h3>Formulas used</h3><p>Observer-frame angle θ between the velocity and the direction to the observer: <b>f<sub>obs</sub> = f<sub>src</sub> / (γ (1 − β cos θ))</b>. Ahead (θ = 0): √((1+β)/(1−β)) = " + fmt(aheadF, 6) + ". Behind (θ = 180°): √((1−β)/(1+β)) = " + fmt(behindF, 6) + ". Sideways (θ = 90°): 1/γ = " + fmt(sideF, 6) + ". The product of the two line-of-sight factors is exactly 1.</p>" +
			(Math.abs(b) > 0.1 ? "<p class='tu-note'>Why a wavefront ahead looks bluer than the classical formula says: the source's own clock is slowed by γ, so the rings are emitted every γ·T₀ (see the spacing), and the colours shown are the exact relativistic values.</p>" : "<p class='tu-note'>At low speed this is the ordinary Doppler shift, Δλ/λ ≈ v/c.</p>");
	}
	function dReset() { ds.fronts = []; ds.t = 0; ds.nextEmit = 0; ds.trail = []; ds.x = null; ds.flash = 0; }
	$("rs-d-b").addEventListener("input", function (e) { D.b = +e.target.value; save(); dUpdate(); });
	$("rs-d-wl").addEventListener("input", function (e) { D.wl = +e.target.value; save(); dUpdate(); }); $("rs-d-sp").addEventListener("input", function (e) { D.sp = +e.target.value; save(); dUpdate(); });
	$("rs-d-bin").addEventListener("change", function (e) {
		var s = String(e.target.value).trim().toLowerCase().replace(/\s+/g, ""), v = NaN; var m = /^(-?[\d.]+(?:e-?\d+)?)(c|km\/s|m\/s|kms)?$/.exec(s);
		if (m) { v = parseFloat(m[1]); if (m[2] === "km/s" || m[2] === "kms") v = v * 1000 / R.C; else if (m[2] === "m/s") v = v / R.C; else if (m[2] !== "c" && Math.abs(v) > 1) v = v * 1000 / R.C; }
		if (isFinite(v) && Math.abs(v) < 0.999) { D.b = Math.max(-0.95, Math.min(0.95, v)); save(); dUpdate(); dReset(); e.target.value = ""; } else e.target.setCustomValidity("Use a speed under the speed of light, like 0.5c or 150000 km/s");
	});
	$("rs-d-play").onclick = function () { var on = this.getAttribute("aria-pressed") !== "true"; this.setAttribute("aria-pressed", String(on)); this.innerHTML = on ? "❚❚ Pause" : "▶ Play"; };
	$("rs-d-reset").onclick = dReset;
	chips("rs-d-pre", [{ label: "Walking pace", b: 0.0000000042 }, { label: "A jet (0.0000008 c)", b: 0.0000008 }, { label: "0.1 c", b: 0.1 }, { label: "0.5 c", b: 0.5 }, { label: "0.8 c", b: 0.8 }, { label: "0.95 c", b: 0.95 }, { label: "0.5 c to the left", b: -0.5 }, { label: "At rest", b: 0 }], function (p) { D.b = p.b; save(); dUpdate(); dReset(); });
	function dDraw(dt) {
		var cv = $("rs-d"), f = fitCanvas(cv, 0.42, 240), x = f.x, W = f.w, H = f.h, cpx = W * 0.2 * D.sp, b = D.b, g = R.gamma(b), v = b * cpx, lam0 = 34, T0 = lam0 / cpx, T = g * T0;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, W, H);
		if (ds.x == null) { ds.x = W / 2; }
		var playing = $("rs-d-play").getAttribute("aria-pressed") === "true";
		if (dt && playing) {
			ds.t += dt; ds.x += v * dt; ds.trail.push({ x: ds.x, t: ds.t }); ds.trail = ds.trail.filter(function (p) { return ds.t - p.t < 2; });
			while (ds.t >= ds.nextEmit) { var te = ds.nextEmit, xe = ds.x - v * (ds.t - te); ds.fronts.push({ x: xe, y: H / 2, te: te }); ds.nextEmit += T; if (ds.fronts.length > 400) ds.fronts.shift(); }
			ds.fronts = ds.fronts.filter(function (fr) { return cpx * (ds.t - fr.te) < W * 1.1; });
			if (ds.x < W * 0.12 || ds.x > W * 0.88) { dReset(); ds.flash = 1; }
		}
		// wavefronts: each ring segment is coloured by the shift an observer in that direction sees
		var SEG = 48; ds.fronts.forEach(function (fr) {
			var r = cpx * (ds.t - fr.te), al = Math.max(0, 1 - r / (W * 0.85)); if (r < 1) return;
			for (var i = 0; i < SEG; i++) {
				var a0 = i / SEG * TAU, a1 = (i + 1) / SEG * TAU, am = (a0 + a1) / 2, th = Math.acos(Math.cos(am) * (b >= 0 ? 1 : -1)) * 180 / Math.PI, fct = R.dopplerFactor(Math.abs(b), th * 1), wl = Math.min(700, Math.max(400, D.wl / fct * 1)), col = R.wlToRgb(wl);
				x.strokeStyle = col[3] ? rgba(col, 0.75 * al) : "rgba(200,200,200," + 0.5 * al + ")"; x.lineWidth = 1.6; x.beginPath(); x.arc(fr.x, fr.y, r, a0, a1 + 0.02); x.stroke();
			}
		});
		// trail and the source
		x.strokeStyle = "rgba(255,255,255,0.25)"; x.lineWidth = 1; x.beginPath(); ds.trail.forEach(function (p, i) { if (i) x.lineTo(p.x, H / 2); else x.moveTo(p.x, H / 2); }); x.stroke();
		x.fillStyle = "#fff"; x.beginPath(); x.arc(ds.x, H / 2, 6, 0, TAU); x.fill(); x.strokeStyle = "#ffd36a"; x.lineWidth = 2; x.stroke();
		if (Math.abs(b) > 0.001) { x.strokeStyle = "#ffd36a"; x.beginPath(); x.moveTo(ds.x, H / 2 - 14); x.lineTo(ds.x + Math.sign(b) * Math.min(60, 20 + Math.abs(b) * 60), H / 2 - 14); x.stroke(); text(x, fmt(Math.abs(b), 3) + " c", ds.x + Math.sign(b) * 6, H / 2 - 26, 12, "#ffd36a", "center"); }
		// observers
		function ob(px, py, label, al) { x.fillStyle = "#6fd0ff"; x.beginPath(); x.arc(px, py, 5, 0, TAU); x.fill(); text(x, label, px + (al === "left" ? 10 : al === "right" ? -10 : 0), py + (al === "mid" ? 16 : 0), 12, "#a9d8f0", al === "mid" ? "center" : al); }
		ob(14, H / 2, "observer", "left"); ob(W - 14, H / 2, "observer", "right"); ob(W / 2, 12, "far off to the side", "mid");
		text(x, "ring spacing = γ·λ₀ in the lab: " + fmt(g * lam0, 3) + " px at c = " + fmt(cpx, 3) + " px/s", 8, H - 10, 11, "#7f8ba6");
		if (ds.flash > 0) { ds.flash -= dt * 2; x.fillStyle = "rgba(255,255,255," + Math.max(0, ds.flash) * 0.12 + ")"; x.fillRect(0, 0, W, H); }
	}

	/* =========================== 3. SPECTRUM =========================== */
	var P = S.s, SX = { z: 0 };
	var setSel = $("rs-s-set"); setSel.innerHTML = R.SETS.map(function (s) { return "<option value='" + s.id + "'>" + esc(s.name) + "</option>"; }).join("");
	function zcFromSlider(t) { return t <= 0 ? 0 : (Math.pow(1101, t) - 1) * 1; }       // 0..1 -> 0..1100 (log)
	function sliderFromZc(z) { return Math.log(1 + Math.max(0, z)) / Math.log(1101); }
	function sUpdate() {
		setSel.value = P.set; $("rs-s-b").value = P.b; $("rs-s-a").value = P.a; $("rs-s-zc").value = P.zc; $("rs-s-zr").value = sliderFromZc(P.zc);
		var zd = R.zFromBeta(P.b), zg = P.a > 0 ? 1 / Math.sqrt(1 - P.a) - 1 : 0, zc = Math.max(0, num(P.zc) || 0), tot = (1 + zd) * (1 + zg) * (1 + zc) - 1; SX.z = tot; SX.zd = zd; SX.zg = zg; SX.zc = zc;
		$("rs-s-b-v").textContent = (P.b === 0 ? "none" : fmt(Math.abs(P.b), 4) + " c " + (P.b > 0 ? "away" : "toward you")) + ", z = " + sgnZ(zd);
		$("rs-s-a-v").textContent = P.a === 0 ? "none" : fmt(P.a, 3) + ", z = " + sgnZ(zg); $("rs-s-zn").textContent = zc > 0 ? "Light has travelled " + fmt(R.Cosmo(S.c.H0, S.c.Om).lookbackGyr(zc), 4) + " billion years (flat ΛCDM, H₀ " + S.c.H0 + ")." : "No expansion shift.";
		var lines = R.linesOf(P.set), rows = lines.map(function (l) { var o = R.shiftWl(l[2], tot); return "<tr><td>" + esc(l[1]) + "</td><td>" + fmt(l[2], 6) + " nm</td><td>" + swatch(l[2]) + R.bandOf(l[2]) + "</td><td class='" + cls(tot) + "'>" + R.fmtWl(o) + "</td><td>" + swatch(o) + R.bandOf(o) + "</td></tr>"; }).join("");
		$("rs-s-res").innerHTML = "<h3>Combined shift: <span class='" + cls(tot) + "'>z = " + sgnZ(tot) + "</span> (" + shiftWord(tot) + ", 1 + z = " + fmt(1 + tot, 6) + ")</h3><p class='tu-note'>(1 + z<sub>motion</sub>) × (1 + z<sub>gravity</sub>) × (1 + z<sub>expansion</sub>) = " + fmt(1 + zd, 6) + " × " + fmt(1 + zg, 6) + " × " + fmt(1 + zc, 6) + ".</p><div class='rs-tw'><table class='rs-table'><thead><tr><th>Line</th><th>At rest</th><th></th><th>Observed</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>";
		sDraw();
	}
	function sDraw() {
		var cv = $("rs-s"), f = fitCanvas(cv, 0.4, 235), x = f.x, W = f.w, H = f.h, ext = P.scale === "ext", lo = ext ? 100 : 380, hi = ext ? 3000 : 780, pad = 12, bw = W - pad * 2, abs = P.mode === "ab";
		function xOf(nm) { return pad + bw * (ext ? (Math.log(nm) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (nm - lo) / (hi - lo)); }
		function nmOf(px) { return ext ? Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * px / bw) : lo + (hi - lo) * px / bw; }
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, W, H);
		var lines = R.linesOf(P.set), blockH = (H - 18) / 2, bar = Math.max(30, blockH - 52);
		[{ top: 2, z: 0, name: "As emitted (at rest)" }, { top: 2 + blockH, z: SX.z, name: "As observed (z = " + sgnZ(SX.z) + ")" }].forEach(function (st) {
			var y0 = st.top + 40; text(x, st.name, pad, st.top + 8, 12.5, "#c9d4ee");
			for (var px = 0; px < bw; px++) { var nm = nmOf(px), c = R.wlToRgb(nm); if (abs) { x.fillStyle = c[3] ? rgba(c, 1) : "#242a38"; } else { x.fillStyle = c[3] ? rgba(c, 0.16) : "#05070d"; } x.fillRect(pad + px, y0, 1.5, bar); }
			var shown = [], k = 0; lines.forEach(function (l) {
				var nm = l[2] * (1 + st.z), c = R.wlToRgb(nm), xx = xOf(nm); if (nm < lo || nm > hi) { shown.push([l, nm, false]); return; }
				x.fillStyle = abs ? "rgba(0,0,0,0.9)" : (c[3] ? rgba(c, 1) : "#eef1f8"); x.fillRect(xx - 1.2, y0, 2.6, bar); shown.push([l, nm, true]);
			});
			var vis = shown.filter(function (s2) { return s2[2]; }); vis.sort(function (a, b) { return a[1] - b[1]; });
			if (lines.length <= 9) vis.forEach(function (s2, i) { text(x, s2[0][1], xOf(s2[1]), st.top + 24 + (i % 2) * 11, 10.5, "#e8ecf6", "center"); });
			var ticks = ext ? [100, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000] : [400, 450, 500, 550, 600, 650, 700, 750];
			ticks.forEach(function (t) { var tx = xOf(t); x.fillStyle = "#6b7694"; x.fillRect(tx, y0 + bar, 1, 4); text(x, String(t), tx, y0 + bar + 12, 10, "#6b7694", "center"); });
			var off = shown.filter(function (s2) { return !s2[2]; }); if (off.length) text(x, off.length + " line" + (off.length > 1 ? "s" : "") + " off the scale: " + off.map(function (s2) { return s2[0][1] + " " + R.fmtWl(s2[1]); }).slice(0, 3).join(", ") + (off.length > 3 ? ", …" : ""), W - pad, st.top + 8, 10.5, "#d3b377", "right");
		});
		text(x, "nm; the faint colours behind the lines are the visible band (380–780 nm), grey = invisible", W / 2, H - 6, 10.5, "#6b7694", "center");
	}
	function sSync() { seg0s(); }
	function seg0s() { ["rs-s-mode", "rs-s-scale"].forEach(function (id) { var key = id === "rs-s-mode" ? "mode" : "scale"; [].forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(P[key]) === b.getAttribute("data-v") ? "true" : "false"); }); }); }
	seg("rs-s-mode", "mode", P, sUpdate); seg("rs-s-scale", "scale", P, sUpdate);
	setSel.addEventListener("change", function () { P.set = setSel.value; save(); sUpdate(); });
	$("rs-s-b").addEventListener("input", function (e) { P.b = +e.target.value; save(); sUpdate(); }); $("rs-s-a").addEventListener("input", function (e) { P.a = +e.target.value; save(); sUpdate(); });
	$("rs-s-zr").addEventListener("input", function (e) { P.zc = Math.round(zcFromSlider(+e.target.value) * 1000) / 1000; save(); sUpdate(); });
	$("rs-s-zc").addEventListener("input", function (e) { var v = num(e.target.value); if (isFinite(v) && v >= 0) { P.zc = Math.min(v, 1500); save(); var z = $("rs-s-zr"); z.value = sliderFromZc(P.zc); P.zc = v; sUpdate0(); } });
	function sUpdate0() { var keep = $("rs-s-zc").value; sUpdate(); $("rs-s-zc").value = keep; }
	chips("rs-s-pre", [{ name: "Nothing (rest)", b: 0, a: 0, zc: 0 }, { name: "Andromeda (toward us, −300 km/s)", b: -0.001, a: 0, zc: 0 }, { name: "White dwarf surface", b: 0, a: 0.0006, zc: 0 }, { name: "Neutron star surface", b: 0, a: 0.4, zc: 0 }, { name: "Quasar 3C 273 (z = 0.158)", b: 0, a: 0, zc: 0.158 }, { name: "Galaxy at z = 3 (Lyman-α turns blue-green)", b: 0, a: 0, zc: 3, set: "H" }, { name: "Receding at 0.5 c", b: 0.5, a: 0, zc: 0 }, { name: "z = 10 (JWST)", b: 0, a: 0, zc: 10 }],
		function (p) { P.b = p.b; P.a = p.a; P.zc = p.zc; if (p.set) P.set = p.set; save(); sUpdate(); });
	function qUpdate() {
		var r = num($("rs-q-rest").value), o = num($("rs-q-obs").value), out = $("rs-q-out");
		if (!(r > 0 && o > 0)) { out.innerHTML = "<span class='tu-note'>Type two wavelengths in nm.</span>"; return; }
		var z = o / r - 1, b = R.betaFromZ(z), lin = z * R.C / 1000;
		out.innerHTML = "<p><b class='" + cls(z) + "'>z = " + sgnZ(z) + "</b> (" + shiftWord(z) + "), Δλ = " + (o - r >= 0 ? "+" : "−") + fmt(Math.abs(o - r), 5) + " nm; observed in the " + R.bandOf(o) + " band.</p><p>If it were all Doppler: " + (z >= 0 ? "receding" : "approaching") + " at <b>" + fmt(Math.abs(b) * R.C / 1000, 6) + " km/s</b> (" + fmt(Math.abs(b), 5) + " c, relativistic); the simple v ≈ cz gives " + fmt(Math.abs(lin), 6) + " km/s.</p><p>If it were all gravity: the emitter's r<sub>s</sub>/r = " + (z > 0 ? fmt(1 - 1 / ((1 + z) * (1 + z)), 6) : "n/a (gravity only redshifts light that leaves a mass)") + ".</p>";
	}
	["rs-q-rest", "rs-q-obs"].forEach(function (id) { $(id).addEventListener("input", qUpdate); });

	/* =========================== 4. COSMOLOGY =========================== */
	var K = S.c, cache = null;
	$("rs-c-line").innerHTML = R.LINES.filter(function (l) { return ["lya", "hb", "ha", "oii", "o3b", "caK"].indexOf(l[0]) >= 0; }).map(function (l) { return "<option value='" + l[0] + "'>" + esc(l[1] + " (" + l[2] + " nm)") + "</option>"; }).join("");
	function cUpdate(fromInput) {
		var z = Math.max(0, num(K.z)); if (!isFinite(z)) z = 0; var H0 = num(K.H0), Om = num(K.Om); if (!(H0 > 0)) H0 = 67.4; if (!(Om > 0 && Om <= 1)) Om = 0.315;
		if (!fromInput) { $("rs-c-z").value = K.z; } $("rs-c-zr").value = sliderFromZc(z); $("rs-c-h").value = K.H0; $("rs-c-m").value = K.Om; $("rs-c-line").value = K.line;
		var C = R.Cosmo(H0, Om), a = 1 / (1 + z), dc = C.comovingMpc(z), lb = C.lookbackGyr(z), age = C.ageGyr(z), ageNow = C.ageGyr(0), rec = C.recessionC(z), line = R.LINES.filter(function (l) { return l[0] === K.line; })[0] || R.LINES[0], wo = line[2] * (1 + z);
		var gly = dc * 3.26156e6 / 1e9;
		$("rs-c-res").innerHTML = "<div class='rs-cards'>" +
			"<div class='rs-card'><h4>Wavelength stretch</h4><span class='rs-big'>×" + fmt(1 + z, 6) + "</span><small>1 + z = a<sub>now</sub> / a<sub>then</sub></small></div>" +
			"<div class='rs-card'><h4>" + esc(line[1]) + " " + fmt(line[2], 6) + " nm arrives as</h4><span class='rs-big'>" + swatch(wo) + R.fmtWl(wo) + "</span><small>" + R.bandOf(wo) + "</small></div>" +
			"<div class='rs-card'><h4>Universe's size then</h4><span class='rs-big'>" + fmt(a * 100, 4) + "%</span><small>of today's (scale factor a = " + fmt(a, 5) + ")</small></div>" +
			"<div class='rs-card'><h4>Light travel time</h4><span class='rs-big'>" + fmt(lb, 5) + " Gyr</span><small>the light left when the universe was " + fmt(age, 4) + " Gyr old (now " + fmt(ageNow, 4) + ")</small></div></div>" +
			"<div class='rs-tw'><table class='rs-table'><tbody><tr><th>Comoving distance today</th><td>" + fmt(dc, 5) + " Mpc = " + fmt(gly, 4) + " billion light-years</td></tr><tr><th>Distance when the light left (a × comoving)</th><td>" + fmt(dc * a, 5) + " Mpc</td></tr><tr><th>Recession speed today, H₀ × distance</th><td>" + fmt(rec, 4) + " c" + (rec > 1 ? " (faster than light: allowed, space itself is expanding)" : "") + "</td></tr><tr><th>Doppler speed if misread as motion</th><td>" + fmt(R.betaFromZ(z), 5) + " c (relativistic formula)</td></tr><tr><th>Temperature of the background radiation then</th><td>" + fmt(2.7255 * (1 + z), 5) + " K (now 2.7255 K)</td></tr><tr><th>Model</th><td>flat ΛCDM, H₀ " + H0 + " km/s/Mpc, Ωm " + Om + ", ΩΛ " + fmt(1 - Om, 4) + ", radiation neglected</td></tr></tbody></table></div>";
		cache = { z: z, line: line }; cDraw();
	}
	function cDraw() {
		if (!cache) return; var cv = $("rs-c"), f = fitCanvas(cv, 0.3, 190), x = f.x, W = f.w, H = f.h, z = cache.z, line = cache.line, pad = 14;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, W, H);
		var rows = [{ y: H * 0.27, w: Math.max(10, (W - pad * 2) / (1 + z)), wl: line[2], lab: "when it was emitted (the universe is " + fmt(100 / (1 + z), 4) + "% of today's size)" }, { y: H * 0.72, w: W - pad * 2, wl: line[2] * (1 + z), lab: "as we see it today (each wavelength ×" + fmt(1 + z, 5) + ")" }];
		rows.forEach(function (r) {
			var col = R.wlToRgb(r.wl), cs = col[3] ? rgba(col, 1) : "#d8dce8"; text(x, r.lab, pad, r.y - H * 0.19, 12, "#9fb0d6");
			x.strokeStyle = "rgba(140,160,210,0.35)"; x.lineWidth = 1; for (var gx = 0; gx <= 10; gx++) { var xx = pad + r.w * gx / 10; x.beginPath(); x.moveTo(xx, r.y - H * 0.12); x.lineTo(xx, r.y + H * 0.12); x.stroke(); }
			x.strokeStyle = cs; x.lineWidth = 2.4; x.beginPath(); var cyc = 8; for (var i = 0; i <= 240; i++) { var u = i / 240, px = pad + r.w * u, py = r.y - H * 0.1 * Math.sin(TAU * cyc * u); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
		});
		text(x, "the same 8 wave cycles, the same 10 grid squares of space", W - pad, H - 8, 11, "#7f8ba6", "right");
	}
	[["rs-c-z", function (e) { K.z = e.target.value; }, true], ["rs-c-h", function (e) { K.H0 = e.target.value; }], ["rs-c-m", function (e) { K.Om = e.target.value; }]].forEach(function (a) { $(a[0]).addEventListener("input", function (e) { a[1](e); save(); cUpdate(!!a[2] || true); }); });
	$("rs-c-zr").addEventListener("input", function (e) { K.z = String(Math.round(zcFromSlider(+e.target.value) * 10000) / 10000); save(); cUpdate(false); });
	$("rs-c-line").addEventListener("change", function (e) { K.line = e.target.value; save(); cUpdate(true); });
	chips("rs-c-pre", R.EXAMPLES_Z, function (p) { K.z = String(p.z); save(); cUpdate(false); });

	/* =========================== 5. GRAVITY AS REFRACTION =========================== */
	var P = S.p, pE = 4, pHov = null, p1x = null, pRay = null;
	var pCmapStops = [[0, [12, 14, 46]], [0.22, [52, 34, 120]], [0.45, [150, 48, 130]], [0.68, [232, 100, 72]], [0.86, [250, 182, 70]], [1, [252, 246, 196]]];
	function pCmap(t) { t = Math.max(0, Math.min(1, t)); for (var i = 1; i < pCmapStops.length; i++) if (t <= pCmapStops[i][0]) { var a = pCmapStops[i - 1], b = pCmapStops[i], f = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (j) { return Math.round(a[1][j] + (b[1][j] - a[1][j]) * f); }); } return pCmapStops[pCmapStops.length - 1][1]; }
	$("rs-p-body").innerHTML = R.POT_BODIES.map(function (b) { return "<option value='" + b.id + "'>" + esc(b.name) + "</option>"; }).join("");
	function pBody() {
		var b = R.POT_BODIES.filter(function (q) { return q.id === P.body; })[0] || R.POT_BODIES[0];
		if (b.id !== "custom") return { M: b.M, R: b.R, name: b.name, note: b.note };
		var m = num(P.m), r = num(P.r); if (!(m > 0) || !(r > 0)) return { err: "Type a mass (in solar masses) and a radius (in km), both bigger than 0." };
		return { M: m * R.MSUN, R: r * 1000, name: "Custom: " + fmt(m, 4) + " M☉, R = " + fmt(r, 5) + " km", note: b.note };
	}
	var pSegPaint = (function () { var el = $("rs-p-col"); function paint() { [].forEach.call(el.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", P.col === b.getAttribute("data-v") ? "true" : "false"); }); } el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; P.col = b.getAttribute("data-v"); paint(); save(); pUpdate(); }); return paint; })();
	function pSync() { $("rs-p-body").value = P.body; $("rs-p-m").value = P.m; $("rs-p-r").value = P.r; $("rs-p-cont").checked = !!P.cont; $("rs-p-lines").checked = !!P.lines; $("rs-p-b").value = P.b; $("rs-p-custom").hidden = P.body !== "custom"; pSegPaint(); }
	$("rs-p-body").addEventListener("change", function (e) { P.body = e.target.value; var b = R.POT_BODIES.filter(function (q) { return q.id === P.body; })[0]; if (b && b.id !== "custom") { P.m = String(+(b.M / R.MSUN).toPrecision(4)); P.r = String(+(b.R / 1000).toPrecision(5)); } pSync(); save(); pUpdate(); });
	["rs-p-m", "rs-p-r"].forEach(function (id, i) { $(id).addEventListener("input", function (e) { P[i ? "r" : "m"] = e.target.value; save(); pUpdate(); }); });
	$("rs-p-cont").addEventListener("change", function (e) { P.cont = e.target.checked; save(); pUpdate(); }); $("rs-p-lines").addEventListener("change", function (e) { P.lines = e.target.checked; save(); pUpdate(); });
	$("rs-p-b").addEventListener("input", function (e) { P.b = +e.target.value; save(); pUpdate(); });
	function pFmtU(v, unit) { return fmt(v, 4) + " " + unit; }
	function pAt(B, rho) { var r = rho * B.R, phi = R.phiSphere(B.M, B.R, r); return { phi: phi, g: R.gSphere(B.M, B.R, r), v: Math.sqrt(-2 * phi), n1: -2 * phi / (R.C * R.C) }; }
	function pUpdate() {
		var B = pBody(); $("rs-p-bnote").textContent = B.note || ""; $("rs-p-b-v").textContent = fmt(P.b, 3) + " R from the centre";
		if (B.err) { $("rs-p-res").innerHTML = "<p class='rs-red'>" + esc(B.err) + "</p>"; $("rs-p-cards").innerHTML = ""; return; }
		var k = R.compactness(B.M, B.R), kDraw = 4 * k < 0.08 ? 0.02 : k, ex = kDraw / k;
		pRay = { k: k, kDraw: kDraw, ex: ex, draw: R.traceRay(kDraw, P.b, 400), real: R.traceRay(k, P.b) };
		$("rs-p-bx").textContent = ex > 1.5 ? "The real bending is tiny: the ray on the map is bent " + fmt(ex, 3) + "× more than life. The numbers below are true." : "Drawn at its true strength.";
		pMap(B); p3d(B); p1d(B);
		var s = pAt(B, 1), c0 = pAt(B, 0), rs = R.rs(B.M), wk = k < 0.01 ? "weak: the analogy is accurate" : k < 0.3 ? "moderate: the analogy is only a rough guide" : B.R <= rs ? "inside its own Schwarzschild radius: a black hole, the analogy fails" : "strong: the analogy fails";
		var dl = pRay.real.defl, gr = P.b >= 1 ? 4 * k / P.b : R.weakDeflection(k, P.b), as = 180 / Math.PI * 3600;
		$("rs-p-cards").innerHTML =
			"<div class='rs-card'><h4>Pull at the surface</h4><span class='rs-big'>" + pFmtU(s.g, "m/s²") + "</span><small>" + fmt(s.g / 9.80665, 4) + " × Earth's g; zero at the centre</small></div>" +
			"<div class='rs-card'><h4>Potential Φ: surface / centre</h4><span class='rs-big'>" + fmt(s.phi, 4) + "</span><small>centre " + fmt(c0.phi, 4) + " J/kg (1.5 ×)</small></div>" +
			"<div class='rs-card'><h4>Escape speed: surface / centre</h4><span class='rs-big'>" + (s.v >= R.C ? "&gt; c" : fmt(s.v / 1000, 5) + " km/s") + "</span><small>centre " + (c0.v >= R.C ? "&gt; c (" + fmt(c0.v / R.C, 3) + " c)" : fmt(c0.v / 1000, 5) + " km/s") + "</small></div>" +
			"<div class='rs-card'><h4>Index n = 1 − 2Φ/c²</h4><span class='rs-big'>" + (s.n1 < 1e-3 ? "1 + " + fmt(s.n1, 4) : fmt(1 + s.n1, 5)) + "</span><small>at the surface; centre " + (c0.n1 < 1e-3 ? "1 + " + fmt(c0.n1, 4) : fmt(1 + c0.n1, 5)) + "</small></div>" +
			"<div class='rs-card'><h4>|Φ| / c² at the surface</h4><span class='rs-big" + (k >= 0.3 ? " rs-red" : "") + "'>" + fmt(k, 4) + "</span><small>" + wk + "</small></div>" +
			"<div class='rs-card'><h4>Bending of the ray (b = " + fmt(P.b, 3) + " R)</h4><span class='rs-big'>" + (dl * as < 3600 ? fmt(dl * as, 4) + "″" : fmt(dl * 180 / Math.PI, 4) + "°") + "</span><small>weak-field formula " + (gr * as < 3600 ? fmt(gr * as, 4) + "″" : fmt(gr * 180 / Math.PI, 4) + "°") + "; Newton gets half</small></div>";
		$("rs-p-res").innerHTML = "<h3>" + esc(B.name) + "</h3><div class='rs-tw'><table class='rs-table'><tbody>" +
			"<tr><th>Mass, radius</th><td>" + fmt(B.M, 4) + " kg (" + fmt(B.M / R.MSUN, 4) + " M☉), " + fmt(B.R / 1000, 5) + " km</td></tr>" +
			"<tr><th>Schwarzschild radius 2GM/c²</th><td>" + (rs < 1 ? fmt(rs * 1000, 4) + " mm" : rs < 1e4 ? fmt(rs, 5) + " m" : fmt(rs / 1000, 5) + " km") + (B.R <= rs ? " <b class='rs-red'>(bigger than the ball: this would be a black hole)</b>" : "") + "</td></tr>" +
			"<tr><th>Potential inside / outside</th><td>Φ = −GM(3R² − r²)/(2R³) for r &lt; R, Φ = −GM/r outside; both give " + fmt(s.phi, 5) + " J/kg at r = R</td></tr>" +
			"<tr><th>Pull inside / outside</th><td>g = GM r / R³ (grows linearly from 0) inside, GM/r² outside</td></tr>" +
			"<tr><th>Light: grazing deflection 4GM/(c²R)</th><td>" + fmt(4 * k * as, 5) + " arcseconds (Newtonian particle: " + fmt(2 * k * as, 5) + ")</td></tr>" +
			"<tr><th>Extra time for light crossing the ball through its centre</th><td>" + fmt(16 * k * B.R / (3 * R.C), 4) + " s (∫(n − 1) dx / c inside the ball = 16GM/(3c³); the part outside grows with distance, like the Shapiro delay)</td></tr></tbody></table></div>";
		save();
	}
	function pMap(B) {
		var c = $("rs-p-map"), f = fitCanvas(c, 0.92, 240), x = f.x, w = f.w, h = f.h, s = Math.min(w, h) / (2 * pE), cx = w / 2, cy = h / 2;
		var gw = 150, gh = Math.round(gw * h / w), oc = pMap.oc || (pMap.oc = document.createElement("canvas")); oc.width = gw; oc.height = gh; var oxc = oc.getContext("2d"), id = oxc.createImageData(gw, gh);
		for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
			var X = ((i + 0.5) / gw * w - cx) / s, Y = ((j + 0.5) / gh * h - cy) / s, rho = Math.hypot(X, Y), t = P.col === "g" ? (rho < 1 ? rho : 1 / (rho * rho)) : R.uRho(rho) / 1.5, col = pCmap(P.col === "g" ? Math.sqrt(t) : t), q = (j * gw + i) * 4;
			id.data[q] = col[0]; id.data[q + 1] = col[1]; id.data[q + 2] = col[2]; id.data[q + 3] = 255;
		}
		oxc.putImageData(id, 0, 0); x.imageSmoothingEnabled = true; x.drawImage(oc, 0, 0, w, h);
		if (P.lines) for (var a = 0; a < 16; a++) { var th = a / 16 * TAU, ca = Math.cos(th), sa = Math.sin(th), r0 = pE * 1.5, x0 = cx + ca * r0 * s, y0 = cy + sa * r0 * s;
			x.beginPath(); x.moveTo(x0, y0); x.lineTo(cx + ca * 0.08 * s, cy + sa * 0.08 * s); x.strokeStyle = "rgba(255,255,255,0.28)"; x.lineWidth = 1; x.stroke();
			[2.6, 1.5, 0.55].forEach(function (rr) { var px = cx + ca * rr * s, py = cy + sa * rr * s, hl = 6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (ca * Math.cos(0.5) - sa * Math.sin(0.5)) * hl, py + (sa * Math.cos(0.5) + ca * Math.sin(0.5)) * hl); x.moveTo(px, py); x.lineTo(px + (ca * Math.cos(-0.5) - sa * Math.sin(-0.5)) * hl, py + (sa * Math.cos(-0.5) + ca * Math.sin(-0.5)) * hl); x.strokeStyle = "rgba(255,255,255,0.55)"; x.stroke(); }); }
		if (P.cont) [[0.25, 4], [1 / 3, 3], [0.5, 2], [0.75, 4 / 3], [1, 1], [1.2, Math.sqrt(3 - 2.4)], [1.4, Math.sqrt(3 - 2.8)]].forEach(function (L) {
			x.beginPath(); x.arc(cx, cy, L[1] * s, 0, TAU); x.strokeStyle = L[0] === 1 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)"; x.lineWidth = L[0] === 1 ? 2 : 1; x.setLineDash(L[0] === 1 ? [] : [4, 4]); x.stroke(); x.setLineDash([]);
			if (L[1] * s < Math.min(w, h) / 2 - 4) text(x, (L[0] === 1 ? "surface: " : "") + fmt(L[0], 2) + " Φ(R)", cx + L[1] * s * 0.71 + 3, cy - L[1] * s * 0.71 - 6, 10, "#fff");
		});
		else { x.beginPath(); x.arc(cx, cy, s, 0, TAU); x.strokeStyle = "#fff"; x.lineWidth = 2; x.stroke(); }
		if (pRay) {   // straight reference + traced ray
			var by = cy - P.b * s; x.beginPath(); x.moveTo(0, by); x.lineTo(w, by); x.strokeStyle = "rgba(160,220,255,0.45)"; x.setLineDash([6, 5]); x.lineWidth = 1; x.stroke(); x.setLineDash([]);
			var pts = pRay.draw.pts; x.beginPath(); var first = true; for (var q2 = 0; q2 < pts.length; q2 += 2) { if (Math.abs(pts[q2]) > pE * 1.6) continue; var px = cx + pts[q2] * s, py = cy - pts[q2 + 1] * s; if (first) { x.moveTo(px, py); first = false; } else x.lineTo(px, py); }
			x.strokeStyle = "#7fe3ff"; x.lineWidth = 2.6; x.stroke(); text(x, pRay.ex > 1.5 ? "light ray (bending ×" + fmt(pRay.ex, 3) + ")" : "light ray", 8, Math.max(14, by - 12), 12, "#7fe3ff");
		}
		if (pHov) { var hp = pAt(B, Math.hypot(pHov.x, pHov.y)), hx = cx + pHov.x * s, hy = cy - pHov.y * s; x.beginPath(); x.arc(hx, hy, 4, 0, TAU); x.fillStyle = "#fff"; x.fill();
			var lines = ["r = " + fmt(Math.hypot(pHov.x, pHov.y), 3) + " R", "Φ = " + fmt(hp.phi, 4) + " J/kg", "g = " + fmt(hp.g, 4) + " m/s²", "v esc = " + (hp.v >= R.C ? "> c" : fmt(hp.v / 1000, 4) + " km/s"), "n − 1 = " + fmt(hp.n1, 4)];
			x.fillStyle = "rgba(8,10,24,0.78)"; x.fillRect(6, 6, 168, lines.length * 16 + 8); lines.forEach(function (l, i) { text(x, l, 12, 18 + i * 16, 12, "#f2f4f8"); }); }
		text(x, P.col === "g" ? "colour: strength of the pull |g|" : "colour: depth of the potential (bright = deep)", w - 8, h - 12, 11, "#dfe5f2", "right");
	}
	(function () {
		var c = $("rs-p-map"), drag = false;
		function at(e) { var r = c.getBoundingClientRect(), w = r.width, h = r.height, s = Math.min(w, h) / (2 * pE); return { x: (e.clientX - r.left - w / 2) / s, y: -(e.clientY - r.top - h / 2) / s }; }
		c.addEventListener("pointerdown", function (e) { drag = true; c.setPointerCapture(e.pointerId); var p = at(e); P.b = Math.round(Math.max(0, Math.min(4, Math.abs(p.y))) * 100) / 100; $("rs-p-b").value = P.b; pUpdate(); });
		c.addEventListener("pointermove", function (e) { var p = at(e); pHov = p; if (drag) { P.b = Math.round(Math.max(0, Math.min(4, Math.abs(p.y))) * 100) / 100; $("rs-p-b").value = P.b; pUpdate(); } else { var B = pBody(); if (!B.err) pMap(B); } });
		c.addEventListener("pointerup", function () { drag = false; }); c.addEventListener("pointerleave", function () { pHov = null; var B = pBody(); if (!B.err) pMap(B); });
	})();
	function p3d(B) {
		var c = $("rs-p-3d"), f = fitCanvas(c, 0.92, 240), x = f.x, w = f.w, h = f.h, N = 40, yaw = P.yaw, pit = P.pitch, cy0 = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit), depthScale = 2.4;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		function zOf(X, Y) { return -R.uRho(Math.hypot(X, Y)) / 1.5 * depthScale; }
		function proj(X, Y, Z) { var x1 = X * cy0 - Y * sy0, y1 = X * sy0 + Y * cy0; return [x1, Z * cp + y1 * sp, y1 * cp - Z * sp]; }
		var sc = Math.min(w, h) / (pE * 2 * 1.45), ox = w / 2, oy = h * 0.42, quads = [], grid = [];
		for (var j = 0; j <= N; j++) { grid.push([]); for (var i = 0; i <= N; i++) { var X = -pE + 2 * pE * i / N, Y = -pE + 2 * pE * j / N, Z = zOf(X, Y), p = proj(X, Y, Z); grid[j].push([ox + p[0] * sc, oy - p[1] * sc, p[2], Z]); } }
		for (j = 0; j < N; j++) for (i = 0; i < N; i++) { var a = grid[j][i], b = grid[j][i + 1], cc = grid[j + 1][i + 1], d = grid[j + 1][i]; quads.push([a, b, cc, d, (a[2] + b[2] + cc[2] + d[2]) / 4, (a[3] + b[3] + cc[3] + d[3]) / 4]); }
		quads.sort(function (q1, q2) { return q2[4] - q1[4]; });
		quads.forEach(function (q) { var col = pCmap(-q[5] / depthScale); x.beginPath(); x.moveTo(q[0][0], q[0][1]); x.lineTo(q[1][0], q[1][1]); x.lineTo(q[2][0], q[2][1]); x.lineTo(q[3][0], q[3][1]); x.closePath(); x.fillStyle = "rgb(" + col.join(",") + ")"; x.fill(); x.strokeStyle = "rgba(0,0,0,0.35)"; x.lineWidth = 0.6; x.stroke(); });
		x.beginPath(); for (var a2 = 0; a2 <= 64; a2++) { var th = a2 / 64 * TAU, p2 = proj(Math.cos(th), Math.sin(th), zOf(Math.cos(th), Math.sin(th))); if (a2) x.lineTo(ox + p2[0] * sc, oy - p2[1] * sc); else x.moveTo(ox + p2[0] * sc, oy - p2[1] * sc); } x.strokeStyle = "#fff"; x.lineWidth = 2; x.stroke();
		text(x, "surface of the ball", 10, h - 30, 11, "#fff"); text(x, "deepest: Φ = 1.5 Φ(R) at the centre", 10, h - 14, 11, "#dfe5f2");
	}
	(function () {
		var c = $("rs-p-3d"), drag = null;
		c.addEventListener("pointerdown", function (e) { drag = { x: e.clientX, y: e.clientY, yaw: P.yaw, pitch: P.pitch }; c.setPointerCapture(e.pointerId); });
		c.addEventListener("pointermove", function (e) { if (!drag) return; P.yaw = drag.yaw + (e.clientX - drag.x) * 0.01; P.pitch = Math.max(0.12, Math.min(1.5, drag.pitch + (e.clientY - drag.y) * 0.008)); var B = pBody(); if (!B.err) p3d(B); });
		c.addEventListener("pointerup", function () { drag = null; save(); }); c.addEventListener("pointercancel", function () { drag = null; });
		c.addEventListener("keydown", function (e) { var d = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key]; if (!d) return; P.yaw += d[0]; P.pitch = Math.max(0.12, Math.min(1.5, P.pitch + d[1])); var B = pBody(); if (!B.err) p3d(B); save(); e.preventDefault(); });
	})();
	function p1d(B) {
		var c = $("rs-p-1d"), w0 = Math.max(280, c.parentNode.clientWidth || 600), f = fitCanvas(c, 0, Math.min(560, Math.max(420, Math.round(w0 * 0.42)))), x = f.x, w = f.w, h = f.h, L = 64, Rm = 12, panes = 4, ph = h / panes, NS = 480;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		var defs = [
			{ name: "horizontal pull gₓ (m/s², + = to the right)", f: function (X) { var r = Math.abs(X); return X === 0 ? 0 : -Math.sign(X) * pAt(B, r).g; }, col: "#ffd166" },
			{ name: "potential Φ (J/kg)", f: function (X) { return pAt(B, Math.abs(X)).phi; }, col: "#ff8fb1" },
			{ name: "escape speed (km/s)", f: function (X) { return pAt(B, Math.abs(X)).v / 1000; }, col: "#9ef0a8", cLine: R.C / 1000 },
			{ name: "index n − 1 = −2Φ/c²", f: function (X) { return pAt(B, Math.abs(X)).n1; }, col: "#7fe3ff" }];
		defs.forEach(function (d, k) {
			var top = k * ph + 18, bot = (k + 1) * ph - 14, vals = [], mn = Infinity, mx = -Infinity;
			for (var i = 0; i <= NS; i++) { var X = -pE + 2 * pE * i / NS, v = d.f(X); vals.push(v); mn = Math.min(mn, v); mx = Math.max(mx, v); }
			if (mn > 0 && k > 1) mn = 0; if (mx < 0) mx = 0; var pad = (mx - mn) * 0.06 || 1; mn -= pad; mx += pad;
			function Y(v) { return bot - (bot - top) * (v - mn) / (mx - mn); } function Xp(X) { return L + (w - L - Rm) * (X + pE) / (2 * pE); }
			x.fillStyle = "rgba(255,255,255,0.04)"; x.fillRect(L, top, w - L - Rm, bot - top);
			[-1, 1].forEach(function (sg) { x.fillStyle = "rgba(255,255,255,0.05)"; }); x.fillStyle = "rgba(255,255,255,0.07)"; x.fillRect(Xp(-1), top, Xp(1) - Xp(-1), bot - top);
			if (mn < 0 && mx > 0) line0(x, L, Y(0), w - Rm, Y(0));
			text(x, d.name, L + 4, top - 8, 11, d.col); text(x, fmt(mx - pad, 3), L - 4, top + 6, 10, "#9aa6bb", "right"); text(x, fmt(mn + pad, 3), L - 4, bot - 4, 10, "#9aa6bb", "right");
			if (d.cLine && d.cLine < mx) { x.beginPath(); x.moveTo(L, Y(d.cLine)); x.lineTo(w - Rm, Y(d.cLine)); x.strokeStyle = "rgba(255,120,120,0.8)"; x.setLineDash([4, 4]); x.stroke(); x.setLineDash([]); text(x, "speed of light", w - Rm - 4, Y(d.cLine) - 8, 10, "#ff9b9b", "right"); }
			x.beginPath(); vals.forEach(function (v, i) { var px = L + (w - L - Rm) * i / NS; if (i) x.lineTo(px, Y(v)); else x.moveTo(px, Y(v)); }); x.strokeStyle = d.col; x.lineWidth = 2; x.stroke();
			if (p1x != null) { var vx = d.f(p1x); x.beginPath(); x.arc(Xp(p1x), Y(vx), 3.5, 0, TAU); x.fillStyle = d.col; x.fill(); text(x, fmt(vx, 4), Math.min(w - 60, Xp(p1x) + 6), Math.max(top + 6, Y(vx) - 9), 11, "#fff"); }
			if (k === panes - 1) [-4, -2, -1, 0, 1, 2, 4].forEach(function (t) { text(x, (t === 0 ? "0" : t + " R"), Xp(t), h - 5, 10, "#9aa6bb", "center"); });
		});
		if (p1x != null) { var xx = L + (w - L - Rm) * (p1x + pE) / (2 * pE); x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, h); x.strokeStyle = "rgba(255,255,255,0.35)"; x.lineWidth = 1; x.stroke(); }
	}
	function line0(x, a, b, c, d) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.strokeStyle = "rgba(255,255,255,0.25)"; x.lineWidth = 1; x.stroke(); }
	(function () {
		var c = $("rs-p-1d");
		function upd(e) { var r = c.getBoundingClientRect(), L = 64, Rm = 12, X = ((e.clientX - r.left) - L) / (r.width - L - Rm) * 2 * pE - pE; p1x = X < -pE || X > pE ? null : X; var B = pBody(); if (!B.err) p1d(B); }
		c.addEventListener("pointermove", upd); c.addEventListener("pointerdown", upd); c.addEventListener("pointerleave", function () { p1x = null; var B = pBody(); if (!B.err) p1d(B); });
	})();

	/* ---------- loop ---------- */
	var last = 0;
	function redrawAll() { if (S.tab === "grav") gDraw(0); else if (S.tab === "dop") dDraw(0); else if (S.tab === "spec") sDraw(); else if (S.tab === "pot") pUpdate(); else cDraw(); }
	function frame(ts) {
		requestAnimationFrame(frame); if (document.hidden) { last = 0; return; }
		var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
		if (S.tab === "grav") { if (!gs.paused) gs.t += dt; gDraw(gs.paused ? 0 : dt); } else if (S.tab === "dop") dDraw(dt);
	}
	if (window.ResizeObserver) new ResizeObserver(function () { redrawAll(); }).observe(root); else window.addEventListener("resize", redrawAll);
	/* ---------- links ---------- */
	(function fromUrl() {
		var q = new URLSearchParams(location.search); if (q.get("tab") && ["grav", "dop", "spec", "cos", "pot"].indexOf(q.get("tab")) >= 0) S.tab = q.get("tab");
		if (q.get("z") && isFinite(+q.get("z"))) { K.z = q.get("z"); S.tab = q.get("tab") || "cos"; } if (q.get("b") && isFinite(+q.get("b")) && Math.abs(+q.get("b")) < 0.96) { D.b = +q.get("b"); S.tab = q.get("tab") || "dop"; }
	})();

	// phones: keep the picture visible while you work the controls (pin it under the floating bar), or hide it
	(function () {
		var pinned = false, hid = false; try { pinned = localStorage.getItem(KEY + ":pin") === "1"; } catch (e) {}
		var wraps = [];
		[].forEach.call(root.querySelectorAll(".rs-stage"), function (st) {
			var w = document.createElement("div"); w.className = "rs-pinwrap"; var bar = document.createElement("div"); bar.className = "rs-pinbar";
			bar.innerHTML = '<button type="button" class="rs-pill rs-pb-pin" aria-pressed="false">&#128204; Keep picture at top</button><button type="button" class="rs-pill rs-pb-hide" aria-pressed="false">Hide picture &#9652;</button>';
			st.parentNode.insertBefore(w, st); w.appendChild(bar); w.appendChild(st); wraps.push(w);
		});
		function apply() { wraps.forEach(function (w) { w.classList.toggle("rs-pinned", pinned); w.classList.toggle("rs-hid", hid); var p = w.querySelector(".rs-pb-pin"), h = w.querySelector(".rs-pb-hide"); p.setAttribute("aria-pressed", String(pinned)); p.innerHTML = pinned ? "&#128204; Pinned at top" : "&#128204; Keep picture at top"; h.setAttribute("aria-pressed", String(hid)); h.innerHTML = hid ? "Show picture &#9662;" : "Hide picture &#9652;"; }); }
		root.addEventListener("click", function (e) { var p = e.target.closest(".rs-pb-pin"), h = e.target.closest(".rs-pb-hide"); if (p) { pinned = !pinned; try { localStorage.setItem(KEY + ":pin", pinned ? "1" : ""); } catch (x) {} apply(); } else if (h) { hid = !hid; apply(); window.dispatchEvent(new Event("resize")); } });
		apply();
	})();
	gSync(); gUpdate(); dUpdate(); sUpdate(); qUpdate(); cUpdate(false); pSync(); showTab(S.tab, true); emit(); requestAnimationFrame(frame);
})();
