/* MES Water Intake Calculator -- pure maths (no DOM). Browser global `WI`; node: require('./tool_apps_src/water-intake-calculator/lib.js'); tests: node tool_apps_src/water-intake-calculator-tests.js
 * Amounts are millilitres of drinking fluid per day. */
(function (root) {
	"use strict";
	var LB = 0.45359237, OZ = 29.5735295625;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function group(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; } function mlToOz(ml) { return ml / OZ; } function ozToMl(oz) { return oz * OZ; }

	var ML_PER_KG = 32, ML_PER_MIN = 12;
	var CLIMATES = [{ id: "cool", name: "Cool or air-conditioned", ml: 0 }, { id: "temp", name: "Mild / temperate", ml: 0 }, { id: "warm", name: "Warm (25-30 C / 77-86 F)", ml: 350 }, { id: "hot", name: "Hot (30-35 C / 86-95 F)", ml: 700 }, { id: "vhot", name: "Very hot or humid (35 C+ / 95 F+)", ml: 1100 }];
	var STATUS = [{ id: "none", name: "Neither", ml: 0 }, { id: "preg", name: "Pregnant", ml: 300 }, { id: "bf", name: "Breastfeeding", ml: 700 }];
	function climate(id) { for (var i = 0; i < CLIMATES.length; i++) if (CLIMATES[i].id === id) return CLIMATES[i]; return CLIMATES[1]; }
	function status(id) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return STATUS[i]; return STATUS[0]; }
	function valid(kg) { return kg >= 20 && kg <= 400; }
	// parts of the daily target, ml
	function need(p) {
		if (!valid(p.kg)) return null;
		var ex = Math.max(0, Math.min(600, p.exMin || 0));
		var base = p.kg * ML_PER_KG, exr = ex * ML_PER_MIN, cl = climate(p.climate).ml, stt = p.sex === "f" ? status(p.status).ml : 0;
		var total = base + exr + cl + stt; return { base: base, exercise: exr, climate: cl, status: stt, total: total, low: total * 0.85, high: total * 1.15 };
	}
	// evenly spread amounts across the waking hours (start inclusive, end exclusive), rounded to 50 ml, remainder on the last slot
	function schedule(total, wake, sleep) {
		var h = []; for (var t = wake; t !== sleep && h.length < 24; t = (t + 1) % 24) h.push(t);
		if (!h.length) return []; var each = Math.round(total / h.length / 50) * 50, out = [], sum = 0;
		h.forEach(function (hr, i) { var a = i === h.length - 1 ? Math.max(0, Math.round(total - sum)) : each; sum += a; out.push({ hour: hr, ml: a, cum: sum }); }); return out;
	}
	// tracker helpers: log = { "YYYY-MM-DD": [ml, ml, ...] }
	function dayTotal(log, day) { return ((log && log[day]) || []).reduce(function (a, b) { return a + b; }, 0); }
	function streak(log, goal, today) {
		var n = 0, d = new Date(today + "T12:00:00"); if (dayTotal(log, today) < goal) d.setDate(d.getDate() - 1);
		for (var i = 0; i < 400; i++) { var k = d.toISOString().slice(0, 10); if (dayTotal(log, k) >= goal) { n++; d.setDate(d.getDate() - 1); } else break; } return n;
	}
	function lastDays(today, n) { var o = [], d = new Date(today + "T12:00:00"); for (var i = n - 1; i >= 0; i--) { var x = new Date(d); x.setDate(d.getDate() - i); o.push(x.toISOString().slice(0, 10)); } return o; }
	var WI = { num: num, fix: fix, trim: trim, group: group, lbToKg: lbToKg, kgToLb: kgToLb, mlToOz: mlToOz, ozToMl: ozToMl, CLIMATES: CLIMATES, STATUS: STATUS, valid: valid, need: need, schedule: schedule, dayTotal: dayTotal, streak: streak, lastDays: lastDays, ML_PER_KG: ML_PER_KG, ML_PER_MIN: ML_PER_MIN };
	if (typeof module !== "undefined" && module.exports) module.exports = WI; else root.WI = WI;
})(typeof window !== "undefined" ? window : this);
