/* MES One-Rep Max Calculator -- pure maths (no DOM). Browser global `RM`; node: require('./tool_apps_src/one-rep-max-calculator/lib.js'); tests: node tool_apps_src/one-rep-max-calculator-tests.js */
(function (root) {
	"use strict";
	var LB = 0.45359237;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	/* ---------- estimating a one-rep max from a set of w x r ---------- */
	var FORMULAS = {
		epley: { name: "Epley", f: function (w, r) { return w * (1 + r / 30); }, note: "w x (1 + reps / 30). Popular and good up to about 10 reps." },
		brzycki: { name: "Brzycki", f: function (w, r) { return r >= 37 ? null : w * 36 / (37 - r); }, note: "w x 36 / (37 - reps). Very accurate under 10 reps." },
		lander: { name: "Lander", f: function (w, r) { return 100 * w / (101.3 - 2.67123 * r); }, note: "100w / (101.3 - 2.67 x reps)." },
		lombardi: { name: "Lombardi", f: function (w, r) { return w * Math.pow(r, 0.10); }, note: "w x reps^0.10. Tends to read a little low." },
		mayhew: { name: "Mayhew", f: function (w, r) { return 100 * w / (52.2 + 41.9 * Math.exp(-0.055 * r)); }, note: "Fitted on bench press data." },
		oconner: { name: "O'Conner", f: function (w, r) { return w * (1 + 0.025 * r); }, note: "w x (1 + 0.025 x reps)." },
		wathan: { name: "Wathan", f: function (w, r) { return 100 * w / (48.8 + 53.8 * Math.exp(-0.075 * r)); }, note: "Similar to Mayhew with a different fit." }
	};
	var ORDER = ["epley", "brzycki", "lander", "lombardi", "mayhew", "oconner", "wathan"];
	function valid(w, r) { return w > 0 && w < 1500 && r >= 1 && r <= 30 && Math.floor(r) === r; }
	function est(id, w, r) { if (!valid(w, r) || !FORMULAS[id]) return null; if (r === 1) return w; var v = FORMULAS[id].f(w, r); return v > 0 && isFinite(v) ? v : null; }
	function all(w, r) { var o = {}; ORDER.forEach(function (id) { o[id] = est(id, w, r); }); return o; }
	function mean(w, r) { var v = ORDER.map(function (id) { return est(id, w, r); }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }
	function range(w, r) { var v = ORDER.map(function (id) { return est(id, w, r); }).filter(function (x) { return x != null; }); return { lo: Math.min.apply(null, v), hi: Math.max.apply(null, v) }; }
	// reliability: estimates are decent up to ~10 reps and poor beyond ~12
	function reliability(r) { return r <= 5 ? "high" : r <= 10 ? "good" : r <= 12 ? "fair" : "low"; }
	/* ---------- the other way: what can I lift for r reps? (average of Epley and Brzycki, inverted) ---------- */
	function weightForReps(rm, r) { if (r <= 1) return rm; var e = rm / (1 + r / 30), b = r >= 37 ? e : rm * (37 - r) / 36; return (e + b) / 2; }
	function pct(r) { return weightForReps(1, r) * 100; }                       // % of 1RM for r reps
	function repsAtPercent(p) { var lo = 1, hi = 30, i; if (p >= 100) return 1; if (pct(30) >= p) return 30; for (i = 0; i < 50; i++) { var m = (lo + hi) / 2; if (pct(m) > p) lo = m; else hi = m; } return (lo + hi) / 2; }
	function roundTo(x, step) { return step > 0 ? Math.round(x / step) * step : x; }
	// training zones by % of 1RM
	var ZONES = [{ id: "str", name: "Max strength", lo: 85, hi: 100, reps: "1-5", note: "Heavy singles, doubles and triples; long rests (3-5 min)." }, { id: "hyp", name: "Muscle growth (hypertrophy)", lo: 67, hi: 85, reps: "6-12", note: "Moderate weight, 2-3 min rests, close to failure." }, { id: "end", name: "Muscular endurance", lo: 40, hi: 67, reps: "12-25+", note: "Light weight, short rests, high reps." }];
	/* ---------- plates ---------- */
	var PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5], lb: [45, 35, 25, 10, 5, 2.5, 1.25] };
	var BARS = { kg: [20, 15, 10], lb: [45, 35, 25] };
	// plates for one side of the bar; leftover is what cannot be made with the available plates (per side)
	function plates(target, bar, unit, have) {
		var list = (have || PLATES[unit] || PLATES.kg).slice().sort(function (a, b) { return b - a; }), side = (target - bar) / 2, out = [];
		if (!(side > 0)) return { side: [], loaded: bar, short: Math.max(0, bar - target) };
		var left = side + 1e-9; list.forEach(function (p) { while (left >= p - 1e-9) { out.push(p); left -= p; } });
		var loaded = bar + 2 * out.reduce(function (a, b) { return a + b; }, 0); return { side: out, loaded: loaded, short: 0, off: target - loaded };
	}
	// bodyweight-relative strength standards (approximate community figures)
	var LIFTS = { squat: "Squat", bench: "Bench press", deadlift: "Deadlift", ohp: "Overhead press" };
	var LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
	var STANDARDS = { m: { bench: [0.5, 0.75, 1.25, 1.75, 2.0], squat: [0.75, 1.25, 1.75, 2.25, 2.75], deadlift: [1.0, 1.5, 2.0, 2.5, 3.0], ohp: [0.35, 0.55, 0.8, 1.05, 1.3] }, f: { bench: [0.25, 0.5, 0.75, 1.25, 1.5], squat: [0.5, 0.75, 1.25, 1.75, 2.25], deadlift: [0.5, 1.0, 1.5, 2.0, 2.5], ohp: [0.2, 0.35, 0.5, 0.75, 0.95] } };
	function level(sex, lift, ratio) { var s = (STANDARDS[sex] || STANDARDS.m)[lift]; if (!s) return null; var i = -1; for (var k = 0; k < s.length; k++) if (ratio >= s[k] - 1e-9) i = k; return { index: i, name: i < 0 ? "Untrained" : LEVELS[i], next: i + 1 < s.length ? { name: LEVELS[i + 1], ratio: s[i + 1] } : null }; }
	var RM = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, FORMULAS: FORMULAS, ORDER: ORDER, valid: valid, est: est, all: all, mean: mean, range: range, reliability: reliability, weightForReps: weightForReps, pct: pct, repsAtPercent: repsAtPercent, roundTo: roundTo, ZONES: ZONES, PLATES: PLATES, BARS: BARS, plates: plates, LIFTS: LIFTS, LEVELS: LEVELS, STANDARDS: STANDARDS, level: level };
	if (typeof module !== "undefined" && module.exports) module.exports = RM; else root.RM = RM;
})(typeof window !== "undefined" ? window : this);
