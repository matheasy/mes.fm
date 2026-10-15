/* MES Heart Rate Zone Calculator -- pure maths (no DOM). Browser global `HR`; node: require('./tool_apps_src/heart-rate-zone-calculator/lib.js'); tests: node tool_apps_src/heart-rate-zone-calculator-tests.js */
(function (root) {
	"use strict";
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	/* ---------- maximum heart rate estimates (beats per minute) ---------- */
	var METHODS = {
		tanaka: { name: "Tanaka (2001)", f: function (a) { return 208 - 0.7 * a; }, note: "208 - 0.7 x age. From a review of 351 studies; the usual best choice for adults." },
		fox: { name: "Fox (220 - age)", f: function (a) { return 220 - a; }, note: "The old rule of thumb. Simple, but too low for older adults and too high for the young." },
		gellish: { name: "Gellish (2007)", f: function (a) { return 207 - 0.7 * a; }, note: "207 - 0.7 x age, from a large group of fit adults." },
		hunt: { name: "HUNT (2013)", f: function (a) { return 211 - 0.64 * a; }, note: "211 - 0.64 x age, from 3,320 healthy Norwegians." },
		inbar: { name: "Inbar (1994)", f: function (a) { return 205.8 - 0.685 * a; }, note: "205.8 - 0.685 x age, from treadmill tests of 1,424 people." }
	};
	var ORDER = ["tanaka", "fox", "gellish", "hunt", "inbar"];
	function validAge(a) { return a >= 10 && a <= 100; }
	function maxHr(id, age) { if (!validAge(age) || !METHODS[id]) return null; return METHODS[id].f(age); }
	/* ---------- zones ---------- */
	var ZONES = [
		{ n: 1, name: "Recovery", lo: 0.50, hi: 0.60, rpe: "1-2 of 10", talk: "Chat easily, even sing", use: "Warm-up, cool-down, active recovery. Builds the habit with little stress.", mins: "Any length" },
		{ n: 2, name: "Endurance (fat burning)", lo: 0.60, hi: 0.70, rpe: "3-4 of 10", talk: "Full sentences, comfortable", use: "The base of aerobic fitness. Most of your training time, long steady sessions.", mins: "30 min to several hours" },
		{ n: 3, name: "Aerobic (tempo)", lo: 0.70, hi: 0.80, rpe: "5-6 of 10", talk: "Short sentences", use: "Improves aerobic power and efficiency. Brisk, steady effort.", mins: "20-60 min" },
		{ n: 4, name: "Threshold", lo: 0.80, hi: 0.90, rpe: "7-8 of 10", talk: "A few words at a time", use: "Raises the pace you can hold for a long time. Hard but controlled.", mins: "10-30 min total, in blocks" },
		{ n: 5, name: "Maximum (VO2 max)", lo: 0.90, hi: 1.00, rpe: "9-10 of 10", talk: "Cannot talk", use: "Short, very hard intervals. Builds top-end speed and power.", mins: "30 sec to 4 min, with rests" }
	];
	// bpm range of a zone: percent of max, or Karvonen (heart-rate reserve) when a resting rate is given
	function zoneBpm(z, max, rest) {
		if (rest != null && rest > 0 && rest < max) return { lo: rest + z.lo * (max - rest), hi: rest + z.hi * (max - rest) };
		return { lo: z.lo * max, hi: z.hi * max };
	}
	function zones(max, rest) { return ZONES.map(function (z) { var b = zoneBpm(z, max, rest); return { n: z.n, name: z.name, lo: z.lo, hi: z.hi, rpe: z.rpe, talk: z.talk, use: z.use, mins: z.mins, bpmLo: Math.round(b.lo), bpmHi: Math.round(b.hi) }; }); }
	// zone number for a heart rate (0 = under zone 1, 6 = above max)
	function zoneOf(bpm, max, rest) {
		var z = zones(max, rest); if (bpm > z[4].bpmHi) return 6; for (var i = 4; i >= 0; i--) if (bpm >= z[i].bpmLo) return z[i].n; return 0;
	}
	function percentOfMax(bpm, max) { return bpm / max * 100; }
	function percentOfReserve(bpm, max, rest) { return rest != null && max > rest ? (bpm - rest) / (max - rest) * 100 : null; }
	// beats counted in a short window -> beats per minute
	function fromCount(beats, seconds) { return beats > 0 && seconds > 0 ? beats * 60 / seconds : null; }
	// resting heart rate bands (adults)
	function restingBand(r) { return r < 40 ? "very low (athletes, or see a doctor if you feel unwell)" : r < 60 ? "low: typical of fit people" : r <= 80 ? "normal" : r <= 100 ? "high-normal" : "high (above 100 at rest: ask a doctor)"; }
	var HR = { num: num, fix: fix, trim: trim, METHODS: METHODS, ORDER: ORDER, maxHr: maxHr, validAge: validAge, ZONES: ZONES, zones: zones, zoneOf: zoneOf, percentOfMax: percentOfMax, percentOfReserve: percentOfReserve, fromCount: fromCount, restingBand: restingBand };
	if (typeof module !== "undefined" && module.exports) module.exports = HR; else root.HR = HR;
})(typeof window !== "undefined" ? window : this);
