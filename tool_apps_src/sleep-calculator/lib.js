/* MES Sleep Calculator -- pure maths (no DOM). Browser global `SL`; node: require('./tool_apps_src/sleep-calculator/lib.js'); tests: node tool_apps_src/sleep-calculator-tests.js
 * Times are minutes after midnight (0-1439). */
(function (root) {
	"use strict";
	var DAY = 1440;
	function mod(n) { return ((n % DAY) + DAY) % DAY; }
	function parse(s) { var m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); if (!m || +m[1] > 23 || +m[2] > 59) return null; return +m[1] * 60 + +m[2]; }
	function fmt(t, h24) {
		t = mod(Math.round(t)); var h = Math.floor(t / 60), m = t % 60, mm = (m < 10 ? "0" : "") + m;
		if (h24) return (h < 10 ? "0" : "") + h + ":" + mm; return (h % 12 === 0 ? 12 : h % 12) + ":" + mm + " " + (h < 12 ? "AM" : "PM");
	}
	function dur(min) { var h = Math.floor(min / 60), m = Math.round(min - h * 60); return h + " h" + (m ? " " + m + " min" : ""); }
	/* ---------- the cycle maths ---------- */
	// go to bed at `bed`: it takes `latency` minutes to fall asleep, then each cycle is `cycle` minutes
	function wakeTimes(bed, latency, cycle, counts) { return counts.map(function (n) { return { cycles: n, time: mod(bed + latency + n * cycle), asleep: n * cycle }; }); }
	// wake at `wake`: go to bed one of these times
	function bedTimes(wake, latency, cycle, counts) { return counts.map(function (n) { return { cycles: n, time: mod(wake - n * cycle - latency), asleep: n * cycle }; }); }
	/* ---------- how much sleep (AASM / National Sleep Foundation, hours per 24 h) ---------- */
	var NEED = [
		{ id: "inf", name: "Infant (4-12 months)", lo: 12, hi: 16, note: "including naps" }, { id: "tod", name: "Toddler (1-2 years)", lo: 11, hi: 14, note: "including naps" }, { id: "pre", name: "Preschool (3-5)", lo: 10, hi: 13, note: "including naps" },
		{ id: "sch", name: "School age (6-12)", lo: 9, hi: 12, note: "" }, { id: "teen", name: "Teen (13-17)", lo: 8, hi: 10, note: "" }, { id: "adult", name: "Adult (18-64)", lo: 7, hi: 9, note: "" }, { id: "senior", name: "Older adult (65+)", lo: 7, hi: 8, note: "" }
	];
	function need(id) { for (var i = 0; i < NEED.length; i++) if (NEED[i].id === id) return NEED[i]; return NEED[5]; }
	function status(asleepMin, nd) { var h = asleepMin / 60; return h + 1e-9 >= nd.lo && h <= nd.hi + 1e-9 ? "good" : h > nd.hi ? "long" : h >= nd.lo - 1.5 ? "short" : "veryshort"; }
	/* ---------- a typical night: stage layout per cycle (deep sleep early, REM late) ---------- */
	function cycleStages(k, cycle) {
		var n3 = Math.max(0.04, 0.26 - 0.07 * k), rem = Math.min(0.42, 0.12 + 0.07 * k), n1 = 0.05, n2 = 1 - n3 - rem - n1;
		return [["N1", n1], ["N2", n2 * 0.55], ["N3", n3], ["N2", n2 * 0.45], ["REM", rem]].map(function (s) { return { stage: s[0], dur: s[1] * cycle }; });
	}
	function hypnogram(cycles, cycle, latency) {
		var out = [], t = 0; if (latency > 0) { out.push({ stage: "W", start: 0, dur: latency }); t = latency; }
		for (var k = 0; k < cycles; k++) cycleStages(k, cycle).forEach(function (s) { out.push({ stage: s.stage, start: t, dur: s.dur }); t += s.dur; });
		return out;
	}
	function stageTotals(h) { var o = { N1: 0, N2: 0, N3: 0, REM: 0 }; h.forEach(function (s) { if (o[s.stage] != null) o[s.stage] += s.dur; }); return o; }
	/* ---------- evening plan ---------- */
	function evening(bed) { return { caffeine: mod(bed - 360), meal: mod(bed - 180), alcohol: mod(bed - 240), screens: mod(bed - 60), winddown: mod(bed - 30) }; }
	/* ---------- naps ---------- */
	var NAPS = [{ min: 10, name: "Power nap (10 min)", note: "Quick alertness boost, no grogginess." }, { min: 20, name: "Short nap (20 min)", note: "The classic: refreshed without deep sleep." }, { min: 30, name: "30 minutes", note: "Can leave you groggy for a while (sleep inertia)." }, { min: 90, name: "Full cycle (90 min)", note: "A whole sleep cycle: wake from light sleep, good for creativity and memory." }];
	function napWake(start, napMin, latency) { return mod(start + latency + napMin); }
	/* ---------- weekly sleep debt ---------- */
	function debt(needH, slept) {
		var vals = slept.filter(function (v) { return v != null && v >= 0; }); if (!vals.length) return null;
		var total = vals.reduce(function (a, b) { return a + b; }, 0), d = 0, extra = 0; vals.forEach(function (v) { if (v < needH) d += needH - v; else extra += v - needH; });
		return { nights: vals.length, avg: total / vals.length, debt: d, extra: extra, net: Math.max(0, d - extra) };
	}
	function parseHours(s) { if (s == null) return null; s = String(s).trim(); if (!s) return null; var m = s.match(/^(\d{1,2})(?:[:h.,](\d{1,2}))?$/); if (!m) return null; var h = +m[1], mi = m[2] == null ? 0 : (String(m[2]).length === 1 && /[.,]/.test(s) ? +m[2] * 6 : +m[2]); if (/[.,]/.test(s) && m[2] != null) mi = Math.round(parseFloat("0." + m[2]) * 60); if (h > 24 || mi > 59) return null; return h + mi / 60; }
	function trimH(h) { return (Math.round(h * 10) / 10).toString(); }
	var SL = { trimH: trimH, mod: mod, parse: parse, fmt: fmt, dur: dur, wakeTimes: wakeTimes, bedTimes: bedTimes, NEED: NEED, need: need, status: status, cycleStages: cycleStages, hypnogram: hypnogram, stageTotals: stageTotals, evening: evening, NAPS: NAPS, napWake: napWake, debt: debt, parseHours: parseHours };
	if (typeof module !== "undefined" && module.exports) module.exports = SL; else root.SL = SL;
})(typeof window !== "undefined" ? window : this);
