/* MES Relative Speed, Jump & Fall Calculator -- pure maths (global RS; node: require("./lib.js")). SI units inside (m, s, kg).
 * Speed: body lengths per second, scaled to another body length (straight scaling) and the Froude-fair speed v * sqrt(Lref / L)
 *        (equal Froude number v^2 / gL, the rule engineers use to compare walking and running animals of different sizes).
 * Jump:  height or distance in body lengths, scaled; take-off speed (sqrt(2gh) up, sqrt(g d) for a 45-degree long jump) and the push acceleration.
 * Fall:  quadratic air drag, terminal speed vt = sqrt(2 m g / (rho CdA)), impact speed after a drop h: v = vt sqrt(1 - exp(-2 g h / vt^2)). */
(function (root) {
	"use strict";
	var G = 9.80665, RHO = 1.204, SOUND = 343;
	var LEN = { m: 1, cm: 0.01, mm: 0.001, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
	var SPD = { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, "ft/s": 0.3048, "cm/s": 0.01, "mm/s": 0.001, knots: 1852 / 3600 };
	var MASS = { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125, t: 1000 };
	var ALIAS = { meter: "m", meters: "m", metre: "m", metres: "m", centimeter: "cm", centimeters: "cm", millimeter: "mm", millimeters: "mm", inch: "in", inches: "in", '"': "in", foot: "ft", feet: "ft", "'": "ft", yard: "yd", yards: "yd", mile: "mi", miles: "mi", kilometer: "km", kilometers: "km",
		kph: "km/h", "km/hr": "km/h", kmh: "km/h", "kilometers per hour": "km/h", "miles per hour": "mph", mi_h: "mph", fps: "ft/s", "feet per second": "ft/s", "ft/sec": "ft/s", "m/sec": "m/s", "meters per second": "m/s", mps: "m/s", kn: "knots", knot: "knots", kt: "knots",
		kilogram: "kg", kilograms: "kg", kgs: "kg", gram: "g", grams: "g", milligram: "mg", milligrams: "mg", pound: "lb", pounds: "lb", lbs: "lb", ounce: "oz", ounces: "oz", tonne: "t", tonnes: "t", ton: "t" };
	function num(s) { s = String(s == null ? "" : s).trim().toLowerCase().replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/,(\d)/g, ".$1"); return s; }
	/* "1.75 m", "5 ft 9 in", "5'9\"", "20 mm" -> metres; bare number -> def unit */
	function parseLen(text, def) {
		var s = num(text); if (!s) return null;
		var fi = s.match(/^(\d*\.?\d+)\s*(?:ft|feet|foot|')\s*(\d*\.?\d+)\s*(?:in|inch|inches|")?$/); if (fi) return (+fi[1]) * LEN.ft + (+fi[2]) * LEN.in;
		var m = s.match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z'"]*)$/); if (!m) return null;
		var u = m[2] ? (ALIAS[m[2]] || m[2]) : def; if (!LEN[u]) return null; var v = +m[1] * LEN[u]; return v > 0 && isFinite(v) ? v : null;
	}
	function parseSpeed(text, def) {
		var s = num(text); if (!s) return null;
		var m = s.match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*(.*)$/); if (!m) return null; var u = m[2].trim().replace(/\s+/g, " ");
		u = u ? (ALIAS[u] || u) : def; if (!SPD[u]) return null; var v = +m[1] * SPD[u]; return v > 0 && isFinite(v) ? v : null;
	}
	function parseMass(text, def) {
		var s = num(text); if (!s) return null; var m = s.match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)$/); if (!m) return null;
		var u = m[2] ? (ALIAS[m[2]] || m[2]) : def; if (!MASS[u]) return null; var v = +m[1] * MASS[u]; return v > 0 && isFinite(v) ? v : null;
	}

	/* speed */
	function bodyLengths(v, L) { return v / L; }
	function scaledSpeed(v, L, Lref) { return v / L * Lref; }
	function froudeSpeed(v, L, Lref) { return v * Math.sqrt(Lref / L); }
	function froude(v, L) { return v * v / (G * L); }
	/* jump */
	function takeoffUp(h) { return Math.sqrt(2 * G * h); }
	function takeoffLong(d) { return Math.sqrt(G * d); } /* 45 degrees, no drag */
	function pushG(v, push) { return push > 0 ? v * v / (2 * push) / G : NaN; } /* average acceleration over the push, in g */
	/* fall */
	function terminal(m, cda, rho) { return Math.sqrt(2 * m * G / ((rho || RHO) * cda)); }
	function impactSpeed(h, vt) { return vt * Math.sqrt(-Math.expm1(-2 * G * h / (vt * vt))); }
	function noDragSpeed(h) { return Math.sqrt(2 * G * h); }
	/* drop height needed to reach speed v when terminal speed is vt (Infinity if v >= vt) */
	function heightFor(v, vt) { if (v >= vt) return Infinity; return -(vt * vt) / (2 * G) * Math.log1p(-(v * v) / (vt * vt)); }
	function fallTime(h, vt) { var k = G / vt; return Math.acosh(Math.exp(G * h / (vt * vt))) / k; }
	function cdaGuess(L) { return 0.3 * L * L; }

	/* formatting */
	function round(x, sig) {
		if (!isFinite(x)) return String(x); if (x === 0) return "0"; sig = sig || 3;
		var d = Math.min(6, Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(x))))), s = x.toFixed(d);
		if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
		var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join(".");
	}
	function fmtLen(m, imp) {
		if (!isFinite(m)) return "∞";
		if (imp) { if (m < 0.3048) return round(m / LEN.in, 3) + " in"; if (m < 1609.344) return round(m / LEN.ft, 3) + " ft"; return round(m / LEN.mi, 3) + " mi"; }
		if (m < 0.01) return round(m * 1000, 3) + " mm"; if (m < 1) return round(m * 100, 3) + " cm"; if (m < 1000) return round(m, 3) + " m"; return round(m / 1000, 3) + " km";
	}
	function fmtSpeed(v, imp) { return imp ? round(v / SPD.mph, 3) + " mph" : round(v * 3.6, 3) + " km/h"; }

	/* presets: commonly cited values (rounded; individual animals vary a lot) */
	var RUNNERS = [
		{ id: "mite", name: "Paratarsotomus mite", v: 0.225, L: 0.0007, note: "322 body lengths/s, the fastest land animal for its size (Rubin et al., 2014)" },
		{ id: "tigerbeetle", name: "Tiger beetle", v: 2.5, L: 0.02, note: "Cicindela hudsoni, about 2.5 m/s" },
		{ id: "silverant", name: "Saharan silver ant", v: 0.855, L: 0.0079, note: "about 108 body lengths/s on hot sand" },
		{ id: "cockroach", name: "American cockroach", v: 1.5, L: 0.035, note: "about 50 body lengths/s (Full and Tu, 1991)" },
		{ id: "mouse", name: "House mouse", v: 3.6, L: 0.08, note: "about 13 km/h" },
		{ id: "snail", name: "Garden snail", v: 0.0013, L: 0.03, note: "about 1.3 mm/s" },
		{ id: "cat", name: "House cat", v: 13, L: 0.46, note: "sprint about 48 km/h" },
		{ id: "greyhound", name: "Greyhound", v: 19.5, L: 1.0, note: "about 70 km/h" },
		{ id: "horse", name: "Racehorse", v: 19.5, L: 2.4, note: "Thoroughbred, about 70 km/h" },
		{ id: "pronghorn", name: "Pronghorn", v: 24.6, L: 1.4, note: "about 88 km/h" },
		{ id: "cheetah", name: "Cheetah", v: 29, L: 1.2, note: "about 104 km/h, head and body length" },
		{ id: "bolt", name: "Usain Bolt", v: 12.4, L: 1.95, note: "top speed in the 2009 100 m world record" },
		{ id: "falcon", name: "Peregrine falcon (dive)", v: 108, L: 0.42, note: "about 389 km/h in a stoop" },
		{ id: "car", name: "Car at highway speed", v: 100 / 3.6, L: 4.5, note: "100 km/h, 4.5 m long" }
	];
	var JUMPERS = [
		{ id: "flea", name: "Cat flea", kind: "up", h: 0.18, L: 0.002, push: 0.0004, note: "about 18 cm high" },
		{ id: "froghopper", name: "Froghopper (spittlebug)", kind: "up", h: 0.7, L: 0.006, push: 0.002, note: "up to 70 cm high (Burrows, 2003)" },
		{ id: "grasshopper", name: "Grasshopper", kind: "up", h: 0.5, L: 0.04, push: 0.02, note: "about 50 cm high" },
		{ id: "spider", name: "Jumping spider", kind: "long", h: 0.1, L: 0.01, push: 0.005, note: "about 10 cm, 10 body lengths" },
		{ id: "squirrel", name: "Grey squirrel", kind: "up", h: 1.5, L: 0.25, push: 0.08, note: "about 1.5 m straight up, head and body 25 cm" },
		{ id: "squirrel-long", name: "Grey squirrel (leap across)", kind: "long", h: 3, L: 0.25, push: 0.08, note: "about 3 m between branches" },
		{ id: "cat", name: "House cat", kind: "up", h: 1.5, L: 0.46, push: 0.2, note: "about 1.5 m onto a fence" },
		{ id: "kangaroo", name: "Red kangaroo", kind: "long", h: 8, L: 1.4, push: 0.5, note: "about 8 m per bound" },
		{ id: "impala", name: "Impala", kind: "up", h: 3, L: 1.4, push: 0.5, note: "about 3 m high" },
		{ id: "highjump", name: "Human high jump record", kind: "up", h: 2.45, L: 1.95, push: 0.5, note: "Javier Sotomayor, 1993 (bar height)" },
		{ id: "longjump", name: "Human long jump record", kind: "long", h: 8.95, L: 1.88, push: 0.5, note: "Mike Powell, 1991" }
	];
	var FALLERS = [
		{ id: "ant", name: "Ant", m: 3e-6, cda: 1.2e-5, L: 0.006, note: "a few milligrams" },
		{ id: "mouse", name: "Mouse", m: 0.02, cda: 0.003, L: 0.08, note: "20 g" },
		{ id: "squirrel", name: "Squirrel (spread out)", m: 0.5, cda: 0.03, L: 0.25, note: "uses its tail and body as a parachute" },
		{ id: "cat", name: "Cat (spread out)", m: 4, cda: 0.09, L: 0.46, note: "cats spread their legs after turning over" },
		{ id: "human", name: "Person (belly down)", m: 80, cda: 0.47, L: 1.75, note: "a skydiver's usual terminal speed, about 190 km/h" },
		{ id: "horse", name: "Horse", m: 500, cda: 1.0, L: 2.4, note: "500 kg" },
		{ id: "elephant", name: "Elephant", m: 5000, cda: 4, L: 6, note: "5 tonnes" }
	];
	var REFS = [{ id: "human", name: "a person (1.75 m)", L: 1.75 }, { id: "car", name: "a car (4.5 m)", L: 4.5 }, { id: "giraffe", name: "a giraffe (5 m)", L: 5 }, { id: "bus", name: "a bus (12 m)", L: 12 }, { id: "custom", name: "my own height or length", L: null }];
	function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
	var RS = { G: G, RHO: RHO, SOUND: SOUND, LEN: LEN, SPD: SPD, MASS: MASS, parseLen: parseLen, parseSpeed: parseSpeed, parseMass: parseMass,
		bodyLengths: bodyLengths, scaledSpeed: scaledSpeed, froudeSpeed: froudeSpeed, froude: froude, takeoffUp: takeoffUp, takeoffLong: takeoffLong, pushG: pushG,
		terminal: terminal, impactSpeed: impactSpeed, noDragSpeed: noDragSpeed, heightFor: heightFor, fallTime: fallTime, cdaGuess: cdaGuess,
		round: round, fmtLen: fmtLen, fmtSpeed: fmtSpeed, RUNNERS: RUNNERS, JUMPERS: JUMPERS, FALLERS: FALLERS, REFS: REFS, find: find };
	if (typeof module === "object" && module.exports) module.exports = RS; else root.RS = RS;
})(this);
