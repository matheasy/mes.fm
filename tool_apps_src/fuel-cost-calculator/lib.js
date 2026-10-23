/* MES Fuel Cost Calculator maths (global FC; node: require('./tool_apps_src/fuel-cost-calculator/lib.js')). Pure. Internally:
 * distance in km, fuel in litres, economy in L/100 km, electricity in kWh/100 km, prices per litre / per kWh. Exact constants. */
(function (root) {
	"use strict";
	var FC = {};
	FC.MI = 1.609344;            // km per mile (exact)
	FC.GAL_US = 3.785411784;     // litres per US gallon (exact)
	FC.GAL_UK = 4.54609;         // litres per imperial gallon (exact)
	FC.CO2 = { gasoline: 2.31, diesel: 2.68 };   // kg CO2 per litre burned (approximate, tank-to-wheel)
	// L/100 km <-> other economy units (each conversion is its own inverse: x -> K / x)
	FC.K_US = 100 * FC.GAL_US / FC.MI;   // 235.2145833...
	FC.K_UK = 100 * FC.GAL_UK / FC.MI;   // 282.4809363...
	FC.ECON = {
		l100: { name: "L/100 km", to: function (l) { return l; }, from: function (v) { return v; }, lowerBetter: true },
		kml: { name: "km/L", to: function (l) { return 100 / l; }, from: function (v) { return 100 / v; } },
		mpgus: { name: "mpg (US)", to: function (l) { return FC.K_US / l; }, from: function (v) { return FC.K_US / v; } },
		mpguk: { name: "mpg (UK)", to: function (l) { return FC.K_UK / l; }, from: function (v) { return FC.K_UK / v; } }
	};
	FC.toL100 = function (v, unit) { var u = FC.ECON[unit]; if (!u || !(v > 0)) return null; return u.from(v); };
	FC.fromL100 = function (l, unit) { var u = FC.ECON[unit]; if (!u || !(l > 0)) return null; return u.to(l); };
	FC.allEcon = function (l) { var o = {}; Object.keys(FC.ECON).forEach(function (k) { o[k] = FC.fromL100(l, k); }); return o; };
	// distance
	FC.toKm = function (d, unit) { return unit === "mi" ? d * FC.MI : d; };
	FC.fromKm = function (km, unit) { return unit === "mi" ? km / FC.MI : km; };
	// volume: L, galus, galuk
	FC.VOL = { l: 1, galus: FC.GAL_US, galuk: FC.GAL_UK };
	FC.toL = function (v, unit) { return v * (FC.VOL[unit] || 1); };
	FC.fromL = function (l, unit) { return l / (FC.VOL[unit] || 1); };
	// price per unit volume -> per litre
	FC.pricePerL = function (p, unit) { return p / (FC.VOL[unit] || 1); };
	// electricity economy: kwh100 (kWh/100 km), kwhmi (kWh/100 mi), mikwh (mi/kWh), kmkwh (km/kWh), whkm (Wh/km), whmi (Wh/mi)
	FC.EV = {
		kwh100: { name: "kWh/100 km", from: function (v) { return v; }, to: function (e) { return e; } },
		kwh100mi: { name: "kWh/100 mi", from: function (v) { return v / FC.MI; }, to: function (e) { return e * FC.MI; } },
		mikwh: { name: "mi/kWh", from: function (v) { return 100 / (v * FC.MI); }, to: function (e) { return 100 / (e * FC.MI); } },
		kmkwh: { name: "km/kWh", from: function (v) { return 100 / v; }, to: function (e) { return 100 / e; } },
		whkm: { name: "Wh/km", from: function (v) { return v / 10; }, to: function (e) { return e * 10; } },
		whmi: { name: "Wh/mi", from: function (v) { return v / 10 / FC.MI; }, to: function (e) { return e * 10 * FC.MI; } }
	};
	FC.toKwh100 = function (v, unit) { var u = FC.EV[unit]; if (!u || !(v > 0)) return null; return u.from(v); };
	FC.fromKwh100 = function (e, unit) { var u = FC.EV[unit]; if (!u || !(e > 0)) return null; return u.to(e); };

	FC.num = function (s) {
		if (typeof s === "number") return s;
		var t = String(s == null ? "" : s).trim().replace(/[\s$€£¥₫₹]/g, "");
		if (!t) return NaN;
		if (/^-?\d+,\d+$/.test(t) && !/^-?\d{1,3},\d{3}$/.test(t)) t = t.replace(",", ".");
		if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
		t = t.replace(/,/g, "");
		return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : NaN;
	};

	/* trip: {km, l100, pricePerL, people (>=1), roundTrip} -> {km (total), litres, cost, perPerson, perKm, co2kg (with fuel)} */
	FC.trip = function (o) {
		var km = (o.km || 0) * (o.roundTrip ? 2 : 1), litres = km * o.l100 / 100, cost = litres * (o.pricePerL || 0), people = Math.max(1, Math.floor(o.people || 1));
		return { km: km, litres: litres, cost: cost, perPerson: cost / people, people: people, perKm: km ? cost / km : 0, perMi: km ? cost / km * FC.MI : 0,
			co2kg: litres * (FC.CO2[o.fuel] || FC.CO2.gasoline) };
	};
	/* fill-up: distance since the last fill (km) and litres put in -> L/100 km */
	FC.fillup = function (km, litres) { if (!(km > 0) || !(litres > 0)) return null; return litres / km * 100; };
	/* electric trip: {km, kwh100, pricePerKwh, loss (charging loss fraction, 0-0.3)} -> {kwh (from the wall), cost} */
	FC.evTrip = function (o) {
		var kwhCar = o.km * o.kwh100 / 100, wall = kwhCar / (1 - Math.min(0.5, Math.max(0, o.loss || 0)));
		return { kwhCar: kwhCar, kwh: wall, cost: wall * (o.pricePerKwh || 0), co2kg: wall * (o.gridG || 0) / 1000 };
	};
	/* break-even: extra purchase cost of car B over car A, and yearly running costs of A and B -> years (null = never) */
	FC.breakEven = function (extra, yearlyA, yearlyB) {
		var save = yearlyA - yearlyB;
		if (!(extra > 0)) return 0;
		if (!(save > 0)) return null;
		return extra / save;
	};
	FC.round = function (x, dp) { var f = Math.pow(10, dp || 0), v = Math.round(Math.abs(x) * f + 1e-9) / f; return x < 0 ? -v : v; };
	FC.fixed = function (x, dp) {
		if (x == null || !isFinite(x)) return "–";
		var v = FC.round(x, dp).toFixed(dp), p = v.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join(".");
	};
	// a sensible number of decimals for a value shown to a person
	FC.nice = function (x) { var a = Math.abs(x); return FC.fixed(x, a >= 100 ? 0 : a >= 10 ? 1 : 2); };
	// Google Maps directions link (no API key: the public "api=1" URL format)
	FC.mapUrl = function (from, to) {
		return "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(from) + "&destination=" + encodeURIComponent(to) + "&travelmode=driving";
	};

	if (typeof module !== "undefined" && module.exports) module.exports = FC; else root.FC = FC;
})(typeof window !== "undefined" ? window : globalThis);
