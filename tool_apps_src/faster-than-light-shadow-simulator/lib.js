/* MES Faster-Than-Light Shadow Simulator -- maths (pure JS; browser and node: require('./tool_apps_src/faster-than-light-shadow-simulator/lib.js')).
 *
 * Units inside the simulation: the screen is a flat wall at distance D from the source, D = 1 and c = 1, so time is in T0 = D/c.
 * A ray leaving the source at angle phi (measured from the line to the wall) reaches the wall at height tan(phi) after sec(phi) -- every photon moves at exactly c.
 * The SPOT is where successive rays land. If the aim changes at phi' (radians per T0), the spot's speed along the wall is NOT sec^2 * phi' alone:
 * light from a later ray also has a different distance to travel, so the arrival time is t_arr = t + Dr * sec(phi) and
 *        v = sec^2(phi) * phi' / (1 + Dr * phi' * sec(phi) * tan(phi))        (Dr = distance still to travel to the wall, 1 for a swept beam)
 * At phi = 0 this is simply D * omega. For a shadow edge (finger at distance d, so rays are selected where they cross the finger's plane) the same formula
 * holds with Dr = 1 - d and phi = atan(y_finger / d); at small angles v_shadow = v_finger * D / d.
 */
(function (root) {
	"use strict";
	var C = 299792458;

	/* ---------- physics ---------- */
	function spotSpeed(phi, dphi, Dr) { var s = 1 / Math.cos(phi), t = Math.tan(phi); return s * s * dphi / (1 + Dr * dphi * s * t); }
	function criticalRate(D) { return C / D; }                       // rad/s at which a swept spot (on axis) moves at c
	function spotAxisSpeed(omega, D) { return omega * D; }           // m/s, on the axis, small angle
	function shadowSpeed(vFinger, d, D) { return vFinger * D / d; }  // m/s
	function fingerNeeded(d, D) { return C * d / D; }                // m/s for the shadow to move at c

	/* ring buffer of samples at fixed step h (sample j is the value at time j*h), linear interpolation, clamped at both ends */
	function Hist(h, n) { this.h = h; this.n = n; this.a = new Float64Array(n); this.k = 0; }
	Hist.prototype.push = function (v) { this.a[this.k % this.n] = v; this.k++; };
	Hist.prototype.lo = function () { return Math.max(0, this.k - this.n); };
	Hist.prototype.get = function (j) { if (this.k === 0) return 0; j = Math.max(this.lo(), Math.min(this.k - 1, j)); return this.a[j % this.n]; };
	Hist.prototype.at = function (t) { var x = t / this.h, j = Math.floor(x), f = x - j; return this.get(j) * (1 - f) + this.get(j + 1) * f; };
	Hist.prototype.now = function () { return (this.k - 1) * this.h; };

	/* every place on the wall where a spot is at time t. g maps a stored value to an angle (default identity). Several spots can exist at once when the sweep reverses. */
	function spots(hist, t, Dr, g, maxA) {
		g = g || function (v) { return v; };
		var out = [], j0 = Math.max(hist.lo(), Math.floor((t - 3.6) / hist.h)), j1 = hist.k - 1, j, pa, pb, a, b, f, phi, dphi, te;
		if (j1 <= j0) return out;
		pa = g(hist.get(j0)); a = j0 * hist.h + Dr / Math.cos(pa) - t;
		for (j = j0; j < j1; j++) {
			pb = g(hist.get(j + 1)); b = (j + 1) * hist.h + Dr / Math.cos(pb) - t;
			if ((a <= 0 && b > 0) || (a > 0 && b <= 0)) {
				f = a === b ? 0 : a / (a - b); phi = pa + (pb - pa) * f; dphi = (pb - pa) / hist.h; te = (j + f) * hist.h;
				if (Math.abs(phi) <= maxA) out.push({ phi: phi, y: Math.tan(phi), v: spotSpeed(phi, dphi, Dr), te: te });
			}
			pa = pb; a = b;
		}
		return out;
	}

	/* ---------- parsing ---------- */
	var LEN = { m: 1, meter: 1, meters: 1, metre: 1, metres: 1, cm: 0.01, mm: 0.001, km: 1e3, kilometer: 1e3, kilometers: 1e3, kilometre: 1e3, kilometres: 1e3, ft: 0.3048, foot: 0.3048, feet: 0.3048, mi: 1609.344, mile: 1609.344, miles: 1609.344,
		au: 149597870700, ls: C, lights: C, lightsecond: C, lightseconds: C, lm: 60 * C, lightminute: 60 * C, ly: 9460730472580800, lightyear: 9460730472580800, lightyears: 9460730472580800, pc: 3.0856775814913673e16, parsec: 3.0856775814913673e16, parsecs: 3.0856775814913673e16 };
	var RATE = { "deg/s": Math.PI / 180, "°/s": Math.PI / 180, "deg/sec": Math.PI / 180, deg: Math.PI / 180, degrees: Math.PI / 180, "degrees/s": Math.PI / 180, "rad/s": 1, rad: 1, rpm: 2 * Math.PI / 60, "rev/s": 2 * Math.PI, rps: 2 * Math.PI, hz: 2 * Math.PI, "turn/s": 2 * Math.PI, "turns/s": 2 * Math.PI };
	var SPEED = { "m/s": 1, mps: 1, "cm/s": 0.01, "km/s": 1e3, "km/h": 1 / 3.6, kph: 1 / 3.6, "kmh": 1 / 3.6, mph: 0.44704, "mi/h": 0.44704, "ft/s": 0.3048, c: C };
	var WORDS = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
	function split(s) {
		if (s == null) return null; s = String(s).trim().toLowerCase().replace(/,(?=\d{3}\b)/g, "").replace(/×/g, "x").replace(/\s*(x|\*)\s*10\^?/, "e").replace(/\s+per\s+/g, "/").replace(/\bsecond(s)?\b|\bsec\b/g, "s").replace(/\bhour(s)?\b/g, "h").replace(/\bdegrees?\b/g, "deg").replace(/\bradians?\b/g, "rad");
		var m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(thousand|million|billion|trillion)?\s*(.*)$/.exec(s); if (!m) return null;
		var v = parseFloat(m[1]); if (m[2]) v *= WORDS[m[2]];
		return { v: v, u: m[3].replace(/\s+/g, "").replace(/^light-?/, "light") };
	}
	function parseWith(s, table, dflt) { var p = split(s); if (!p || !isFinite(p.v)) return null; if (!p.u) return p.v * dflt; var f = table[p.u]; if (f == null) f = table[p.u.replace(/s$/, "")]; return f == null ? null : p.v * f; }
	function parseLen(s) { return parseWith(s, LEN, 1); }                    // metres
	function parseRate(s) { return parseWith(s, RATE, Math.PI / 180); }       // rad/s (a bare number is degrees per second)
	function parseSpeed(s) { return parseWith(s, SPEED, 1); }                // m/s

	/* ---------- formatting ---------- */
	function sig(x, n) {
		if (!isFinite(x)) return "–"; if (x === 0) return "0"; n = n || 3; var a = Math.abs(x);
		if (a >= 1e9 || a < 1e-3) { var e = Math.floor(Math.log10(a)), m = x / Math.pow(10, e); return m.toFixed(n - 1).replace(/\.?0+$/, "") + " × 10" + String(e).replace(/-/g, "⁻").replace(/\d/g, function (d) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]; }); }
		var s = x.toPrecision(n); if (s.indexOf("e") >= 0) s = String(+s); if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
		var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join(".");
	}
	function fmtLen(m) {
		var a = Math.abs(m);
		if (a < 1) return sig(m * 100, 3) + " cm"; if (a < 1000) return sig(m, 3) + " m"; if (a < 1e9) return sig(m / 1e3, 4) + " km";
		if (a < 0.1 * 9460730472580800 && a < 1e14) return sig(m / 149597870700, 3) + " AU"; if (a < 1e16 * 100) return sig(m / 9460730472580800, 3) + " light-years"; return sig(m / 9460730472580800, 3) + " light-years";
	}
	function fmtTime(s) {
		var a = Math.abs(s); if (a < 1e-6) return sig(s * 1e9, 3) + " ns"; if (a < 1e-3) return sig(s * 1e6, 3) + " µs"; if (a < 1) return sig(s * 1e3, 3) + " ms"; if (a < 120) return sig(s, 3) + " s";
		if (a < 7200) return sig(s / 60, 3) + " min"; if (a < 172800) return sig(s / 3600, 3) + " hours"; if (a < 86400 * 730) return sig(s / 86400, 3) + " days"; return sig(s / 31557600, 3) + " years";
	}
	function fmtSpeed(v) { var a = Math.abs(v); if (a < 1) return sig(v * 100, 3) + " cm/s"; if (a < 1000) return sig(v, 3) + " m/s"; return sig(v / 1e3, 3) + " km/s"; }
	function fmtRate(w) {   // rad/s -> "x °/s" (and turns when large)
		var d = w * 180 / Math.PI, a = Math.abs(d); if (a >= 3600) return sig(w / (2 * Math.PI), 3) + " turns/s"; return sig(d, 3) + " °/s";
	}
	function fmtC(v) { var a = Math.abs(v / C); return (a >= 1e4 ? sig(a, 3) : a >= 100 ? sig(a, 3) : a >= 1 ? a.toFixed(2) : a.toFixed(3)) + " c"; }

	var PLACES = [
		{ n: "Across a room", d: 10, s: "10 m" }, { n: "The Moon", d: 384400e3, s: "384,400 km" }, { n: "The Sun", d: 149597870700, s: "1 AU" }, { n: "Neptune", d: 4.5e12, s: "30 AU" },
		{ n: "Alpha Centauri", d: 4.25 * 9460730472580800, s: "4.25 ly" }, { n: "Andromeda galaxy", d: 2.5e6 * 9460730472580800, s: "2.5 million ly" }, { n: "Edge of the observable universe", d: 4.4e26, s: "46 billion ly" }
	];

	var api = { C: C, spotSpeed: spotSpeed, criticalRate: criticalRate, spotAxisSpeed: spotAxisSpeed, shadowSpeed: shadowSpeed, fingerNeeded: fingerNeeded, Hist: Hist, spots: spots,
		parseLen: parseLen, parseRate: parseRate, parseSpeed: parseSpeed, sig: sig, fmtLen: fmtLen, fmtTime: fmtTime, fmtSpeed: fmtSpeed, fmtRate: fmtRate, fmtC: fmtC, PLACES: PLACES };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESFTL = api;
})(typeof window !== "undefined" ? window : this);
