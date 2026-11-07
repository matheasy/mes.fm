/* MES Relative Time Calculator -- pure maths (global RT; node: require("./lib.js")).
 * Felt-time model: time feels like it passes at a rate proportional to age^-k.
 *   k = 0   clock time (no change with age)
 *   k = 0.5 Lemlich (1975): felt time ~ square root of age
 *   k = 1   Janet (1877) proportional: a span feels as long as its share of the life lived so far
 * A span d starting at age A feels like the span d' at age B with the same felt length:
 *   integral_A^{A+d} t^-k dt = integral_B^{B+d'} t^-k dt.
 * For k = 1 this gives exactly d' = d * B / A (the "share of your life so far" rule). All times are in seconds. */
(function (root) {
	"use strict";
	var MIN = 60, HOUR = 3600, DAY = 86400, YEAR = 365.2425 * DAY, MONTH = YEAR / 12, WEEK = 7 * DAY;
	var UNITS = [
		[/^(ms|msec|millisec(ond)?s?)$/, 0.001], [/^(s|sec|secs|seconds?)$/, 1], [/^(m|min|mins|minutes?)$/, MIN],
		[/^(h|hr|hrs|hours?)$/, HOUR], [/^(d|dy|days?)$/, DAY], [/^(w|wk|wks|weeks?)$/, WEEK], [/^(mo|mos|mth|mths|months?)$/, MONTH],
		[/^(y|yr|yrs|years?)$/, YEAR], [/^(decades?)$/, 10 * YEAR], [/^(centur(y|ies))$/, 100 * YEAR],
		[/^(summers?|seasons?)$/, YEAR / 4], [/^(fortnights?)$/, 2 * WEEK], [/^(school ?years?)$/, 10 * MONTH], [/^(lifetimes?)$/, null]
	];
	var WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, quarter: 0.25 };
	function unitOf(w) { w = w.toLowerCase().replace(/\.$/, ""); for (var i = 0; i < UNITS.length; i++) if (UNITS[i][0].test(w)) return UNITS[i][1]; return undefined; }
	/* "1 hour", "9 weeks", "1h 30m", "2.5 years", "1:30" (h:mm), "a summer", "half an hour". defUnit = seconds per unit for a bare number. Returns seconds or null. */
	function parse(text, defUnit) {
		var s = String(text == null ? "" : text).trim().toLowerCase().replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/,(\d)/g, ".$1").replace(/\band\b/g, " ").replace(/-/g, " ");
		if (!s) return null;
		var hm = s.match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/); if (hm) return (+hm[1]) * HOUR + (+hm[2]) * MIN + (hm[3] ? +hm[3] : 0);
		s = s.replace(/\bhalf an?\b/g, "0.5").replace(/\ban? half\b/g, ".5");
		var toks = s.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+(?: ?years?)?|\./g); if (!toks) return null;
		var total = 0, num = null, any = false, i;
		for (i = 0; i < toks.length; i++) {
			var t = toks[i];
			if (/^\d*\.?\d+(e[+-]?\d+)?$/.test(t)) { if (num != null) return null; num = +t; continue; }
			if (t === ".") continue;
			if (WORDNUM[t] != null && num == null) { num = WORDNUM[t]; continue; }
			if (t === "of") continue;
			var u = unitOf(t);
			if (u == null) return null;
			total += (num == null ? 1 : num) * u; num = null; any = true;
		}
		if (num != null) { if (any || !defUnit) return null; total += num * defUnit; any = true; }
		return any && isFinite(total) && total > 0 ? total : null;
	}
	/* felt-time equivalent of span d at age A, at age B, model exponent k (stable for tiny d/A). */
	function equiv(d, A, B, k) {
		if (!(d > 0 && A > 0 && B > 0)) return NaN;
		if (Math.abs(1 - k) < 1e-9) return d * B / A;
		var p = 1 - k, r = Math.pow(A / B, p) * Math.expm1(p * Math.log1p(d / A));
		if (r <= -1) return Infinity;
		return B * Math.expm1(Math.log1p(r) / p);
	}
	/* how many times longer (or shorter) the span feels at A than the same clock span at B (small-span limit) */
	function ratio(A, B, k) { return Math.pow(B / A, k); }
	/* share of felt life used by age a, with felt time counted from age a0 (memories) to lifespan L */
	function feltShare(a, L, k, a0) {
		a0 = a0 > 0 ? a0 : 0; if (a <= a0) return 0; if (a >= L) return 1;
		if (Math.abs(1 - k) < 1e-9) { if (a0 <= 0) a0 = 1e-6 * L; return Math.log(a / a0) / Math.log(L / a0); }
		var p = 1 - k; return (Math.pow(a, p) - Math.pow(a0, p)) / (Math.pow(L, p) - Math.pow(a0, p));
	}
	/* age at which half the felt life is used */
	function halfway(L, k, a0) {
		a0 = a0 > 0 ? a0 : 0;
		if (Math.abs(1 - k) < 1e-9) { if (a0 <= 0) a0 = 1e-6 * L; return Math.sqrt(a0 * L); }
		var p = 1 - k; return Math.pow((Math.pow(a0, p) + Math.pow(L, p)) / 2, 1 / p);
	}
	/* share of a whole lifespan: span d of lifespan LA = d * LB / LA of lifespan LB */
	function lifespanEquiv(d, LA, LB) { return d > 0 && LA > 0 && LB > 0 ? d * LB / LA : NaN; }

	var NAMES = [["year", YEAR], ["month", MONTH], ["week", WEEK], ["day", DAY], ["hour", HOUR], ["minute", MIN], ["second", 1]];
	function round(x, sig) {
		if (!isFinite(x)) return String(x); if (x === 0) return "0";
		var d = Math.min(6, Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(x))))), s = x.toFixed(d);
		if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
		var parts = s.split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return parts.join(".");
	}
	function plural(n, w) { return n + " " + w + (n === "1" || n === 1 ? "" : "s"); }
	/* main unit: days up to 5 weeks, weeks up to 13 weeks, then months, then years */
	function bestUnit(sec) {
		if (sec >= YEAR) return NAMES[0]; if (sec >= 13 * WEEK) return NAMES[1]; if (sec >= 5 * WEEK) return NAMES[2];
		if (sec >= DAY) return NAMES[3]; if (sec >= HOUR) return NAMES[4]; if (sec >= MIN) return NAMES[5]; return NAMES[6];
	}
	function fmt(sec, sig) { if (!isFinite(sec)) return "forever"; if (sec < 0.001) return "less than a millisecond"; if (sec < 1) return round(sec * 1000, sig || 3) + " ms"; var u = bestUnit(sec); return plural(round(sec / u[1], sig || 3), u[0]); }
	/* "16 days 21 hours" (two largest whole parts) */
	function breakdown(sec) {
		if (!isFinite(sec) || sec < 60) return "";
		var list = sec >= YEAR ? [NAMES[0], NAMES[3], NAMES[4]] : [NAMES[3], NAMES[4], NAMES[5], NAMES[6]], rest = Math.round(sec), i = 0;
		while (i < list.length && rest < list[i][1]) i++;
		if (i >= list.length) return "";
		var n1 = Math.floor(rest / list[i][1]), out = plural(n1, list[i][0]);
		if (i + 1 < list.length) { var n2 = Math.floor((rest - n1 * list[i][1]) / list[i + 1][1]); if (n2 > 0) out += " " + plural(n2, list[i + 1][0]); }
		return out;
	}
	/* short form for links: 1h, 9w, 70y, 2.5d */
	function short(sec) {
		var L = [["y", YEAR], ["mo", MONTH], ["w", WEEK], ["d", DAY], ["h", HOUR], ["min", MIN], ["s", 1]];
		for (var i = 0; i < L.length; i++) { var v = sec / L[i][1]; if (v >= 1 && Math.abs(v - Math.round(v * 1000) / 1000) < 1e-9) return (Math.round(v * 1000) / 1000) + L[i][0]; }
		return Math.round(sec) + "s";
	}

	var MODELS = [
		{ k: 1, id: "share", name: "Share of your life", who: "Janet, 1877 (proportional)", note: "A span feels as long as its share of the life you have lived so far." },
		{ k: 0.5, id: "sqrt", name: "Square-root model", who: "Lemlich, 1975", note: "Felt time shrinks with the square root of age: gentler than proportional." },
		{ k: 0, id: "clock", name: "Clock time", who: "No change with age", note: "An hour is an hour at any age." }
	];
	var LIFESPANS = [
		{ id: "mayfly", name: "Mayfly (adult)", life: DAY }, { id: "fruitfly", name: "Fruit fly", life: 50 * DAY }, { id: "mouse", name: "Mouse", life: 2 * YEAR },
		{ id: "hamster", name: "Hamster", life: 2.5 * YEAR }, { id: "rabbit", name: "Rabbit", life: 9 * YEAR }, { id: "dog", name: "Dog (medium)", life: 12 * YEAR },
		{ id: "cat", name: "Cat", life: 15 * YEAR }, { id: "horse", name: "Horse", life: 28 * YEAR }, { id: "human", name: "Human", life: 79 * YEAR },
		{ id: "elephant", name: "Elephant", life: 60 * YEAR }, { id: "parrot", name: "Macaw", life: 60 * YEAR }, { id: "tortoise", name: "Giant tortoise", life: 150 * YEAR },
		{ id: "whale", name: "Bowhead whale", life: 200 * YEAR }
	];
	function lifespan(id) { for (var i = 0; i < LIFESPANS.length; i++) if (LIFESPANS[i].id === id) return LIFESPANS[i]; return null; }
	var EXAMPLES = [
		{ label: "1 hour for a 9-week-old baby vs a 70-year-old", m: "age", d: "1 hour", a: "9 weeks", b: "70 years" },
		{ label: "One summer at 6 vs at 40", m: "age", d: "3 months", a: "6 years", b: "40 years" },
		{ label: "A year at 5 vs at 50", m: "age", d: "1 year", a: "5 years", b: "50 years" },
		{ label: "Waiting 10 minutes at 3 vs at 35", m: "age", d: "10 minutes", a: "3 years", b: "35 years" },
		{ label: "A school year at 10 vs at 45", m: "age", d: "10 months", a: "10 years", b: "45 years" },
		{ label: "A day for a dog vs a person", m: "life", d: "1 day", la: "dog", lb: "human" },
		{ label: "A mayfly's hour vs a person", m: "life", d: "1 hour", la: "mayfly", lb: "human" }
	];
	var RT = { MIN: MIN, HOUR: HOUR, DAY: DAY, WEEK: WEEK, MONTH: MONTH, YEAR: YEAR, parse: parse, equiv: equiv, ratio: ratio, feltShare: feltShare, halfway: halfway,
		lifespanEquiv: lifespanEquiv, fmt: fmt, breakdown: breakdown, round: round, short: short, MODELS: MODELS, LIFESPANS: LIFESPANS, lifespan: lifespan, EXAMPLES: EXAMPLES };
	if (typeof module === "object" && module.exports) module.exports = RT; else root.RT = RT;
})(this);
