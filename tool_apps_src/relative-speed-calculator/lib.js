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
	function fmtMass(kg, imp) { if (imp) { if (kg < 0.4536) return round(kg / MASS.oz, 3) + " oz"; if (kg < 907.18) return round(kg / MASS.lb, 3) + " lb"; return round(kg / 907.18474, 3) + " US tons"; } if (kg < 0.001) return round(kg * 1e6, 3) + " mg"; if (kg < 1) return round(kg * 1000, 3) + " g"; if (kg < 1000) return round(kg, 3) + " kg"; return round(kg / 1000, 3) + " t"; }
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
				{ id: "car", name: "Car at highway speed", v: 100 / 3.6, L: 4.5, note: "100 km/h, 4.5 m long" },
		{ id: "hummingbird", g: "fly", name: "Anna's hummingbird (dive)", v: 27.3, L: 0.071, note: "about 385 body lengths/s in its courtship dive (Clark, 2009)" },
		{ id: "falcon", g: "fly", name: "Peregrine falcon (dive)", v: 108, L: 0.42, note: "about 389 km/h in a stoop" },
		{ id: "swift", g: "fly", name: "Common swift", v: 31, L: 0.17, note: "about 110 km/h in level flight" },
		{ id: "bat", g: "fly", name: "Brazilian free-tailed bat", v: 44.5, L: 0.09, note: "about 160 km/h measured in level flight (2016)" },
		{ id: "bee", g: "fly", name: "Honeybee", v: 7, L: 0.013, note: "about 25 km/h" },
		{ id: "dragonfly", g: "fly", name: "Dragonfly", v: 10, L: 0.07, note: "about 36 km/h" },
		{ id: "pigeon", g: "fly", name: "Racing pigeon", v: 20, L: 0.32, note: "about 72 km/h over long races" },
		{ id: "jet", g: "fly", name: "Passenger jet", v: 250, L: 70, note: "about 900 km/h cruising, 70 m long" },
		{ id: "copepod", g: "swim", name: "Copepod (escape jump)", v: 0.5, L: 0.001, note: "about 500 body lengths/s, for a split second" },
		{ id: "penguin", g: "swim", name: "Gentoo penguin", v: 10, L: 0.75, note: "about 36 km/h" },
		{ id: "dolphin", g: "swim", name: "Bottlenose dolphin", v: 11, L: 2.5, note: "about 40 km/h in bursts" },
		{ id: "sailfish", g: "swim", name: "Sailfish", v: 10, L: 2.5, note: "about 36 km/h measured (older claims of 110 km/h are doubtful)" },
		{ id: "phelps", g: "swim", name: "Michael Phelps", v: 2.1, L: 1.93, note: "about 2.1 m/s in a 100 m race" },
		{ id: "trout", g: "swim", name: "Rainbow trout", v: 2, L: 0.3, note: "burst speed, about 7 km/h" }
	];
	RUNNERS.forEach(function (r) { if (!r.g) r.g = "run"; });
	var GROUPS = [{ id: "run", name: "Running" }, { id: "fly", name: "Flying" }, { id: "swim", name: "Swimming" }];
	/* strength: load as a multiple of body weight. Muscle force ~ cross-section ~ L^2 ~ M^(2/3), weight ~ M, so the multiple ~ M^(-1/3).
	 * Fair multiple at another mass Mref: x * (M / Mref)^(1/3). */
	function strengthLoad(x, Mref) { return x * Mref; }
	function fairMultiple(x, M, Mref) { return x * Math.pow(M / Mref, 1 / 3); }
	var LIFTERS = [
		{ id: "mite", name: "Oribatid mite", x: 1180, m: 1e-7, note: "holds about 1,180 times its weight (Heethoff and Koerner, 2007)" },
		{ id: "dungbeetle", name: "Dung beetle (Onthophagus taurus)", x: 1141, m: 1.5e-4, note: "pulls about 1,141 times its weight" },
		{ id: "rhinobeetle", name: "Rhinoceros beetle", x: 100, m: 0.02, note: "carries roughly 100 times its weight (claims of 850 times are exaggerated)" },
		{ id: "weaverant", name: "Asian weaver ant", x: 100, m: 5e-6, note: "holds about 100 times its weight upside down" },
		{ id: "leafcutter", name: "Leafcutter ant", x: 50, m: 5e-6, note: "carries leaf pieces up to about 50 times its weight" },
		{ id: "gant", name: "Lamar Gant (person)", x: 5, m: 60, note: "deadlifted about 5 times his body weight" },
		{ id: "gorilla", name: "Gorilla", x: 4, m: 160, note: "rough estimate; popular claims of 10 times are not measured" },
		{ id: "deadlift", name: "Deadlift world record", x: 501 / 205, m: 205, note: "Hafthor Bjornsson, 501 kg at about 205 kg body weight (2020)" },
		{ id: "horse", name: "Draft horse (pulling)", x: 1.5, m: 900, note: "pulls about 1.5 times its weight in pulling contests" },
		{ id: "elephant", name: "Asian elephant (carrying)", x: 0.2, m: 4000, note: "carries roughly 800 kg" }
	];
	var THINGS = [[1, "a litre of water"], [20, "a car tyre"], [75, "a person"], [250, "a motorbike"], [1500, "a car"], [5000, "an elephant"], [13000, "a double-decker bus"], [40000, "a loaded lorry"], [180000, "a blue whale"], [400000, "a jumbo jet"]];
	function thingFor(kg) { var best = null; THINGS.forEach(function (t) { if (kg >= t[0]) best = t; }); return best ? { n: kg / best[0], name: best[1], kg: best[0] } : null; }
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
		round: round, fmtLen: fmtLen, fmtSpeed: fmtSpeed, RUNNERS: RUNNERS, GROUPS: GROUPS, LIFTERS: LIFTERS, strengthLoad: strengthLoad, fairMultiple: fairMultiple, thingFor: thingFor, fmtMass: fmtMass, JUMPERS: JUMPERS, FALLERS: FALLERS, REFS: REFS, find: find };
	if (typeof module === "object" && module.exports) module.exports = RS; else root.RS = RS;
})(this);
