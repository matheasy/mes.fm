/* MESRel: special-relativity time-dilation maths (pure, no DOM). Tests: node tool_apps_src/time-dilation-tests.js
   Units in the trip functions: years and light-years, so c = 1. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.MESRel = factory(); })(typeof self !== "undefined" ? self : this, function () {
	"use strict";
	var C = 299792458, G0 = 9.80665, DAY = 86400, YEAR = 365.25 * DAY, LY = C * YEAR, AU = 1.495978707e11;
	var A1G = G0 * YEAR / C;                 /* 1 g in light-years per year^2 (about 1.0323) */
	var MAXR = 7.6;                          /* slider range: rapidity 0..7.6 -> gamma up to ~1000 */

	function gammaOf(b) { b = Math.abs(b); if (b >= 1) return Infinity; return 1 / Math.sqrt((1 - b) * (1 + b)); }
	function betaOf(g) { if (g < 1) return 0; return Math.sqrt((g - 1) * (g + 1)) / g; }
	function slowdown(b) { b = Math.abs(b); return b * b / (1 + Math.sqrt((1 - b) * (1 + b))); }   /* 1 - 1/gamma without cancellation */
	function fromSlider(x) { var r = Math.max(0, Math.min(1, x)) * MAXR; return Math.tanh(r); }
	function toSlider(b) { b = Math.max(0, Math.min(0.9999999999, b)); return 0.5 * Math.log((1 + b) / (1 - b)) / MAXR; }

	var UNITS = { "m/s": 1, "mps": 1, "km/s": 1000, "kps": 1000, "km/h": 1000 / 3600, "kph": 1000 / 3600, "kmh": 1000 / 3600, "mph": 1609.344 / 3600, "mi/h": 1609.344 / 3600, "mi/s": 1609.344, "ft/s": 0.3048, "kn": 1852 / 3600, "mach": 340.29 };
	/* "0.9c", "90%", "270000 km/s", "900 mph", "gamma 7", "g=7": returns { beta, gamma, error } */
	function parseSpeed(str) {
		var s = String(str == null ? "" : str).trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
		if (!s) return { error: "Type a speed." };
		var m = /^(?:gamma|γ|g|lorentz factor)\s*[=:]?\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)$/.exec(s);
		if (m) { var g = parseFloat(m[1]); if (!(g >= 1)) return { error: "The Lorentz factor is at least 1." }; return { beta: betaOf(g), gamma: g }; }
		m = /^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(%|c|\*c|x c|times c|percent|% of c|% c|%c|percent of c)?\s*(?:of the speed of light|speed of light)?$/.exec(s);
		if (m && m[2]) {
			var v = parseFloat(m[1]), b = /^(c|\*c|x c|times c)$/.test(m[2]) ? v : v / 100;
			if (!(b >= 0 && b < 1)) return { error: "A speed at or above the speed of light is not possible for anything with mass. Try less than 100%." };
			return { beta: b, gamma: gammaOf(b) };
		}
		m = /^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(m\/s|mps|km\/s|kps|km\/h|kph|kmh|mph|mi\/h|mi\/s|ft\/s|kn|mach)$/.exec(s);
		if (m) { var ms = parseFloat(m[1]) * UNITS[m[2]], b2 = ms / C; if (!(b2 < 1)) return { error: "That is the speed of light or more. Nothing with mass gets there." }; return { beta: b2, gamma: gammaOf(b2) }; }
		m = /^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)$/.exec(s);
		if (m) { var n = parseFloat(m[1]); if (n < 1) return { beta: n, gamma: gammaOf(n) }; return { error: "Add a unit (c, %, km/s, mph...) or write gamma 7." }; }
		return { error: "I could not read that. Try 0.9c, 90%, 270000 km/s or gamma 7." };
	}

	/* ------- formatting ------- */
	function sig(x, d) { if (!isFinite(x)) return x > 0 ? "∞" : "–"; if (x === 0) return "0"; d = d || 3; var a = Math.abs(x), e = Math.floor(Math.log10(a)); if (a >= 1e9 || a < 1e-3) { var s = x.toExponential(d - 1), p = s.split("e"); return p[0] + " × 10" + sup(parseInt(p[1], 10)); } var dec = Math.max(0, d - 1 - e); return trim(x.toFixed(Math.min(10, dec))); }
	function trim(s) { return s.indexOf(".") < 0 ? s : s.replace(/0+$/, "").replace(/\.$/, ""); }
	function sup(n) { var m = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" }; return String(n).split("").map(function (c) { return m[c] || c; }).join(""); }
	function commas(x, d) { var s = sig(x, d || 4); if (/×|∞|–/.test(s)) return s; var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join("."); }
	function fmtYears(y) {   /* a duration given in years -> plain words */
		if (!isFinite(y)) return "∞"; var a = Math.abs(y);
		if (a === 0) return "0";
		if (a < 1 / 365.25 / 24 / 60) return sig(a * YEAR, 3) + " seconds";
		if (a < 1 / 365.25 / 24) return sig(a * 365.25 * 24 * 60, 3) + " minutes";
		if (a < 1 / 365.25) return sig(a * 365.25 * 24, 3) + " hours";
		if (a < 0.1) return sig(a * 365.25, 3) + " days";
		if (a < 1000) return sig(a, 3) + (Math.abs(a - 1) < 1e-9 ? " year" : " years");
		if (a < 1e6) return commas(a, 4) + " years";
		if (a < 1e9) return sig(a / 1e6, 4) + " million years";
		return sig(a / 1e9, 4) + " billion years";
	}
	function fmtSpeed(b) { var v = b * C; if (v < 1e3) return sig(v, 3) + " m/s"; if (v < 1e6) return sig(v / 1e3, 4) + " km/s"; return commas(v / 1e3, 6) + " km/s"; }
	function fmtPct(b) { var p = b * 100; if (p < 99) return sig(p, 3) + "%"; var nines = Math.min(12, Math.max(2, Math.floor(-Math.log10(1 - b) + 1e-9))); return trim((b * 100).toFixed(Math.max(0, nines - 1))) + "%"; }

	/* ------- twin trips (c = 1, years, light-years) ------- */
	/* constant speed with an instant turn-around (the textbook version). model: { kind: "const", beta, d, round } */
	function tripConst(d, beta, round) {
		var legs = round ? 2 : 1, g = gammaOf(beta), t = legs * d / beta;
		return { tEarth: t, tShip: t / g, peakBeta: beta, peakGamma: g, d: d, round: !!round };
	}
	/* one half of a leg under constant proper acceleration a (ly/yr^2): accelerate for the first half of the distance, decelerate for the second.
	   u = ship (proper) time since the leg started, 0..2*tau1. Returns x (ly), t (years), beta. */
	function legGeom(d, a) { var gp = 1 + a * d / 2, tau1 = Math.acosh(gp) / a; return { gp: gp, tau1: tau1, tauLeg: 2 * tau1, tLeg: 2 * Math.sqrt(gp * gp - 1) / a }; }
	function legAt(d, a, u) {
		var L = legGeom(d, a), tau1 = L.tau1;
		if (u <= tau1) { var th = a * u; return { x: (Math.cosh(th) - 1) / a, t: Math.sinh(th) / a, beta: Math.tanh(th) }; }
		var w = Math.max(0, L.tauLeg - u), th2 = a * w;               /* time still to go until arrival */
		return { x: d - (Math.cosh(th2) - 1) / a, t: L.tLeg - Math.sinh(th2) / a, beta: Math.tanh(th2) };
	}
	function trip1g(d, round, aG) {
		var a = (aG == null ? 1 : aG) * A1G, L = legGeom(d, a), legs = round ? 2 : 1;
		return { tEarth: legs * L.tLeg, tShip: legs * L.tauLeg, peakGamma: L.gp, peakBeta: betaOf(L.gp), a: a, d: d, round: !!round, legTau: L.tauLeg, legT: L.tLeg };
	}
	/* where is everyone at progress s in 0..1 of the trip? constant speed: s is Earth time; constant acceleration: s is the traveller's own time. */
	function tripState(model, s) {
		s = Math.max(0, Math.min(1, s));
		if (model.kind === "const") {
			var T = model.tEarth, t = s * T, half = T / (model.round ? 2 : 1), out = t <= half, b = model.beta, x;
			if (!model.round) x = b * t; else x = out ? b * t : model.d - b * (t - half);
			var back = model.round && t > half;
			return { t: t, tau: t / model.peakGamma, x: x, beta: (t > 0 && t < T) ? (back ? -b : b) : 0, phase: out ? "out" : "back", gamma: (t > 0 && t < T) ? model.peakGamma : 1 };
		}
		var tauTot = model.tShip, tau = s * tauTot, leg = model.legTau, a = model.a, d = model.d;
		if (!model.round || tau <= leg) { var g1 = legAt(d, a, Math.min(tau, leg)); return { t: g1.t, tau: tau, x: g1.x, beta: g1.beta, phase: "out", gamma: gammaOf(g1.beta) }; }
		var g2 = legAt(d, a, Math.min(tau - leg, leg));
		return { t: model.legT + g2.t, tau: tau, x: d - g2.x, beta: -g2.beta, phase: "back", gamma: gammaOf(g2.beta) };
	}
	function worldline(model, n) {   /* points {x,t,tau} along the traveller's path */
		var pts = []; n = n || 240; for (var i = 0; i <= n; i++) { var st = tripState(model, i / n); pts.push({ x: st.x, t: st.t, tau: st.tau }); }
		if (model.kind === "const") { var half = model.round ? model.tEarth / 2 : model.tEarth; var h = tripState(model, half / model.tEarth); pts.push({ x: h.x, t: h.t, tau: h.tau }); pts.sort(function (a, b) { return a.t - b.t; }); }
		return pts;
	}

	/* ------- light clock: a photon bounces between mirrors L apart ------- */
	function lightClock(beta) { var g = gammaOf(beta); return { gamma: g, pathRatio: g, tickRatio: 1 / g, sideways: beta * g /* v dt / (c dtau) */ }; }

	/* ------- a few real-world numbers ------- */
	var EVERYDAY = [
		{ n: "Walking", v: 1.4 }, { n: "A fast car (120 km/h)", v: 120 / 3.6 }, { n: "Passenger jet (900 km/h)", v: 250 }, { n: "Concorde (2,180 km/h)", v: 605.6 },
		{ n: "Space Shuttle in orbit", v: 7800 }, { n: "GPS satellite (orbital speed only)", v: 3874 }, { n: "Earth around the Sun", v: 29780 }, { n: "Parker Solar Probe, closest approach", v: 192000 },
		{ n: "Sun around the Milky Way", v: 230000 }, { n: "Earth's motion relative to the cosmic microwave background", v: 369820 }
	];
	var MUON = { tau0: 2.1969811e-6 };
	function muon(beta, distKm) { var g = gammaOf(beta), v = beta * C, tLab = MUON.tau0 * g, tTravel = (distKm * 1000) / v; return { gamma: g, lifetimeLab: tLab, travelTime: tTravel, survive: Math.exp(-tTravel / tLab), surviveNoDilation: Math.exp(-tTravel / MUON.tau0), meanRangeKm: v * tLab / 1000 }; }
	function kineticEnergy(mKg, beta) { return (gammaOf(beta) - 1) * mKg * C * C; }

	/* the full "what does this speed do" block used by the calculator */
	function summary(beta, years) {
		var g = gammaOf(beta);
		return { beta: beta, gamma: g, rate: 1 / g, slowPct: 100 * slowdown(beta), shipYears: years / g, distanceLy: beta * years, lengthContraction: 1 / g };
	}

	return { C: C, G0: G0, DAY: DAY, YEAR: YEAR, LY: LY, AU: AU, A1G: A1G, MAXR: MAXR, gammaOf: gammaOf, betaOf: betaOf, slowdown: slowdown, fromSlider: fromSlider, toSlider: toSlider, parseSpeed: parseSpeed,
		sig: sig, commas: commas, fmtYears: fmtYears, fmtSpeed: fmtSpeed, fmtPct: fmtPct, tripConst: tripConst, trip1g: trip1g, legAt: legAt, legGeom: legGeom, tripState: tripState, worldline: worldline,
		lightClock: lightClock, EVERYDAY: EVERYDAY, muon: muon, kineticEnergy: kineticEnergy, summary: summary };
});
