/* MES Running Pace Calculator -- pure maths (no DOM). Browser global `PC`; node: require('./tool_apps_src/pace-calculator/lib.js'); tests: node tool_apps_src/pace-calculator-tests.js
 * Distances in metres, times in seconds, pace in seconds per km or per mile. */
(function (root) {
	"use strict";
	var MI = 1609.344, KM = 1000;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	/* ---------- times: "1:45:30", "25:10", "25.5" (minutes), "1h 45m 30s" ---------- */
	function parseTime(s) {
		if (s == null) return null; s = String(s).trim().toLowerCase(); if (!s) return null;
		var m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec)?)?$/);
		if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
		if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 60;                                  // a bare number = minutes
		var p = s.split(":"); if (p.length < 2 || p.length > 3 || !p.every(function (x) { return /^\d+(\.\d+)?$/.test(x); })) return null;
		var v = p.map(parseFloat); if (v.length === 2) return v[0] * 60 + v[1]; if (v[1] >= 60 || v[2] >= 60) return null; return v[0] * 3600 + v[1] * 60 + v[2];
	}
	function fmt(sec, tenths) {
		if (sec == null || !isFinite(sec) || sec < 0) return ""; var t = tenths ? Math.round(sec * 10) / 10 : Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t - h * 3600) / 60), s = t - h * 3600 - m * 60;
		var ss = tenths ? (s < 10 ? "0" : "") + s.toFixed(1) : (s < 10 ? "0" : "") + s; return h > 0 ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
	}
	/* ---------- distances ---------- */
	var RACES = [["1 mile", MI], ["1500 m", 1500], ["3 km", 3000], ["5 km", 5000], ["8 km", 8000], ["10 km", 10000], ["15 km", 15000], ["10 miles", 10 * MI], ["Half marathon", 21097.5], ["25 km", 25000], ["30 km", 30000], ["Marathon", 42195], ["50 km", 50000]];
	function unitM(u) { return u === "mi" ? MI : KM; }
	function toMetres(v, u) { return v * unitM(u); }
	/* ---------- the pace / time / distance triangle ---------- */
	function paceOf(sec, metres, u) { return sec / (metres / unitM(u)); }       // sec per km or mile
	function timeOf(pace, metres, u) { return pace * (metres / unitM(u)); }
	function distOf(sec, pace, u) { return sec / pace * unitM(u); }             // metres
	function speed(sec, metres) { return { kmh: metres / 1000 / (sec / 3600), mph: metres / MI / (sec / 3600) }; }
	function convertPace(p, from, to) { return p * unitM(to) / unitM(from); }
	// treadmill: speed in km/h or mph -> pace per km / per mile
	function paceFromSpeed(v, kind, u) { var mps = kind === "mph" ? v * MI / 3600 : v * 1000 / 3600; return unitM(u) / mps; }
	/* ---------- race prediction (Riegel, 1977: t2 = t1 x (d2 / d1)^1.06) ---------- */
	function riegel(t1, d1, d2, k) { return t1 * Math.pow(d2 / d1, k || 1.06); }
	/* ---------- splits ----------
	 * fade: pace change from the first split to the last as a fraction of average pace (0 = even, +0.06 = positive split (slows 6%), -0.06 = negative split).
	 * The shape is linear and is scaled so the splits add up to the total time exactly. */
	function splits(total, metres, u, fade) {
		var um = unitM(u), n = Math.max(1, Math.ceil(metres / um - 1e-9)), w = [], lens = [], i, sum = 0, f = fade || 0;
		for (i = 0; i < n; i++) { var len = Math.min(um, metres - i * um); lens.push(len); w.push(1 + f * (n > 1 ? (i / (n - 1) - 0.5) : 0)); sum += w[i] * len; }
		var k = total / sum, out = [], cum = 0;
		for (i = 0; i < n; i++) { var t = w[i] * lens[i] * k; cum += t; out.push({ n: i + 1, from: i * um, to: i * um + lens[i], len: lens[i], time: t, cum: cum, pace: w[i] * um * k }); }
		return out;
	}
	// clock time of day: start "07:30" + seconds -> "09:15" (+ days)
	function clock(start, add) { var m = String(start || "").match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; var t = +m[1] * 3600 + +m[2] * 60 + Math.round(add), d = Math.floor(t / 86400); t -= d * 86400; var h = Math.floor(t / 3600), mm = Math.floor((t - h * 3600) / 60); return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm + (d > 0 ? " (+" + d + "d)" : ""); }
	var PC = { num: num, fix: fix, trim: trim, MI: MI, KM: KM, parseTime: parseTime, fmt: fmt, RACES: RACES, unitM: unitM, toMetres: toMetres, paceOf: paceOf, timeOf: timeOf, distOf: distOf, speed: speed, convertPace: convertPace, paceFromSpeed: paceFromSpeed, riegel: riegel, splits: splits, clock: clock };
	if (typeof module !== "undefined" && module.exports) module.exports = PC; else root.PC = PC;
})(typeof window !== "undefined" ? window : this);
