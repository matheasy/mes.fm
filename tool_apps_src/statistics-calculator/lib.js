/* MES Statistics Calculator: all the maths (global MESStat; also runs in node: require('./tool_apps_src/statistics-calculator/lib.js')).
   Parsing of pasted numbers, descriptive statistics, quartile methods, histogram bins, regression fits, distributions
   (normal, t, chi-square, F, binomial, Poisson, geometric, uniform), hypothesis tests, confidence intervals, sample size. */
(function (G) {
	"use strict";
	var S = {};

	/* ---------- parsing ---------- */
	var THOUS_DOT = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/, THOUS_COMMA = /^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/;
	function cleanTok(t) { return String(t).replace(/^[\s"'([{]+|[\s"')\]}]+$/g, "").replace(/^[$€£¥₫]|[$€£¥₫%]$/g, "").replace(/−/g, "-").trim(); }
	// which decimal mark does this text use? "auto" looks at the text: ";" separators or "1,5" with no dots and no ", " means a decimal comma
	S.decimalMark = function (text, pref) {
		if (pref === "dot" || pref === "comma") return pref;
		var t = String(text);
		if (/\d,\d/.test(t) && /;/.test(t)) return "comma";
		if (/\d,\d/.test(t) && !/\./.test(t) && !/,\s/.test(t) && /\S\s+\S/.test(t)) {
			// "1,234 5,678" could be thousands: only if every comma group has exactly 3 digits after it and there are no other commas
			var toks = t.split(/\s+/).filter(Boolean), allThou = toks.every(function (k) { return k.indexOf(",") < 0 || /^[+-]?\d{1,3}(,\d{3})+$/.test(cleanTok(k)); });
			return allThou ? "dot" : "comma";
		}
		return "dot";
	};
	// one token -> number (or NaN)
	S.toNum = function (tok, mark) {
		var t = cleanTok(tok); if (!t) return NaN;
		if (mark === "comma") { if (THOUS_COMMA.test(t)) t = t.replace(/\./g, ""); t = t.replace(",", "."); }
		else if (THOUS_DOT.test(t)) t = t.replace(/,/g, "");
		if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return NaN;
		return +t;
	};
	// split text into rows of cells (tabs / ; / , / spaces)
	S.parseTable = function (text, pref) {
		var t = String(text || "").replace(/\r\n?/g, "\n"), mark = S.decimalMark(t, pref);
		var lines = t.split("\n").filter(function (l) { return l.trim() !== ""; });
		var hasTab = /\t/.test(t), multi = lines.length > 1 || /\S\s+\S/.test(t.trim());   // thousands commas only when the numbers are already split by spaces or lines
		var rows = lines.map(function (l) {
			var cells;
			if (hasTab) cells = l.split("\t");
			else if (/;/.test(l)) cells = l.split(";");
			else if (mark === "dot") {
				var toks = l.trim().split(/\s+/);
				if (multi && toks.every(function (k) { return THOUS_DOT.test(cleanTok(k)) || k.indexOf(",") < 0; })) cells = toks;
				else cells = l.split(/[,\s]+/);
			} else cells = l.trim().split(/\s+/);
			return cells.map(function (c) { return c.trim(); }).filter(function (c, i, a) { return c !== "" || hasTab; });
		});
		return { rows: rows, mark: mark };
	};
	// a list of numbers: every number in the text, in reading order. Words (a header such as "Score") are skipped and counted.
	S.parseNumbers = function (text, pref) {
		var tb = S.parseTable(text, pref), vals = [], skipped = [];
		tb.rows.forEach(function (r) { [].concat.apply([], r.map(function (c) { return c.trim().split(/\s+/); })).forEach(function (c) { if (c === "") return; var v = S.toNum(c, tb.mark); if (isFinite(v)) vals.push(v); else skipped.push(c); }); });
		return { values: vals, skipped: skipped, mark: tb.mark };
	};
	// spreadsheet columns: rows with the same number of cells -> columns (a first row of words = header names)
	S.parseColumns = function (text, pref) {
		var tb = S.parseTable(text, pref), rows = tb.rows; if (!rows.length) return { cols: [], names: [], mark: tb.mark };
		var w = Math.max.apply(null, rows.map(function (r) { return r.length; })), names = [], start = 0;
		if (rows[0].some(function (c) { return c !== "" && !isFinite(S.toNum(c, tb.mark)); })) { names = rows[0].slice(); start = 1; }
		var cols = []; for (var j = 0; j < w; j++) { cols.push([]); if (names[j] == null || names[j] === "") names[j] = "Column " + (j + 1); }
		for (var i = start; i < rows.length; i++) for (var k = 0; k < w; k++) { var v = S.toNum(rows[i][k] == null ? "" : rows[i][k], tb.mark); if (isFinite(v)) cols[k].push(v); }
		var keep = []; cols.forEach(function (c, j) { if (c.length) keep.push(j); });
		return { cols: keep.map(function (j) { return cols[j]; }), names: keep.map(function (j) { return names[j]; }), mark: tb.mark };
	};
	// "value, count" lines -> expanded list (counts must be whole numbers)
	S.parseFreq = function (text, pref) {
		var tb = S.parseTable(text, pref), vals = [], pairs = [], bad = [];
		tb.rows.forEach(function (r) {
			var nums = r.map(function (c) { return S.toNum(c, tb.mark); }).filter(isFinite);
			if (nums.length < 2) { if (r.join("").trim()) bad.push(r.join(" ")); return; }
			var v = nums[0], c = nums[1];
			if (c < 0 || Math.floor(c) !== c) { bad.push(r.join(" ")); return; }
			pairs.push([v, c]);
		});
		var tot = pairs.reduce(function (s, p) { return s + p[1]; }, 0);
		if (tot > 2e6) return { values: [], pairs: pairs, bad: bad, tooBig: true };
		pairs.forEach(function (p) { for (var i = 0; i < p[1]; i++) vals.push(p[0]); });
		return { values: vals, pairs: pairs, bad: bad };
	};
	// x-y pairs: two columns, "(1, 2) (3, 4)", or two lines (x list then y list)
	S.parsePairs = function (text, pref) {
		var t = String(text || "");
		if (/\(\s*[-+.\d]/.test(t)) {
			var re = /\(\s*([^(),;]+?)\s*[,;]\s*([^()]+?)\s*\)/g, m, xs = [], ys = [], mark = S.decimalMark(t.replace(/\(([^()]*)\)/g, function (a, b) { return b.indexOf(";") >= 0 ? a : "(" + b.replace(",", " ") + ")"; }), pref);
			while ((m = re.exec(t))) { var x = S.toNum(m[1], mark), y = S.toNum(m[2], mark); if (isFinite(x) && isFinite(y)) { xs.push(x); ys.push(y); } }
			if (xs.length) return { x: xs, y: ys, skipped: 0, mark: mark };
		}
		var tb = S.parseTable(t, pref), rows = tb.rows.map(function (r) { return r.map(function (c) { return S.toNum(c, tb.mark); }); });
		var numRows = rows.filter(function (r) { return r.filter(isFinite).length >= 1; });
		if (numRows.length === 2 && numRows[0].filter(isFinite).length > 2 && numRows[1].filter(isFinite).length === numRows[0].filter(isFinite).length) {
			return { x: numRows[0].filter(isFinite), y: numRows[1].filter(isFinite), skipped: 0, mark: tb.mark, rowsMode: true };
		}
		var X = [], Y = [], skipped = 0;
		rows.forEach(function (r) { var n = r.filter(isFinite); if (n.length >= 2) { X.push(n[0]); Y.push(n[1]); } else skipped++; });
		return { x: X, y: Y, skipped: skipped, mark: tb.mark };
	};

	/* ---------- basic helpers ---------- */
	function sum(a) { var s = 0, c = 0; for (var i = 0; i < a.length; i++) { var y = a[i] - c, t = s + y; c = (t - s) - y; s = t; } return s; }
	S.sum = sum;
	S.mean = function (a) { return a.length ? sum(a) / a.length : NaN; };
	S.sorted = function (a) { return a.slice().sort(function (p, q) { return p - q; }); };
	function medianSorted(s) { var n = s.length; if (!n) return NaN; var h = n >> 1; return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
	S.median = function (a) { return medianSorted(S.sorted(a)); };
	S.variance = function (a, pop) { var n = a.length, m = S.mean(a); if (n < (pop ? 1 : 2)) return NaN; return sum(a.map(function (x) { return (x - m) * (x - m); })) / (pop ? n : n - 1); };
	S.sd = function (a, pop) { return Math.sqrt(S.variance(a, pop)); };
	S.modes = function (a) {
		var c = new Map(); a.forEach(function (x) { c.set(x, (c.get(x) || 0) + 1); });
		var mx = 0; c.forEach(function (v) { if (v > mx) mx = v; });
		if (mx < 2) return { modes: [], count: 1 };
		var out = []; c.forEach(function (v, k) { if (v === mx) out.push(k); }); out.sort(function (p, q) { return p - q; });
		if (out.length === c.size) return { modes: [], count: mx, allSame: true };
		return { modes: out, count: mx };
	};

	/* ---------- quartiles and percentiles ---------- */
	S.QMETHODS = {
		ti: "Median of each half, leaving out the middle value (TI-84 and most textbooks)",
		tukey: "Tukey's hinges: median of each half, including the middle value",
		inc: "Excel QUARTILE.INC / Google Sheets / R default: interpolate at (n − 1)p",
		exc: "Excel QUARTILE.EXC / Minitab / SPSS: interpolate at (n + 1)p"
	};
	function interp(s, h) {   // s sorted, h = 0-based fractional position, clamped
		var n = s.length; if (h <= 0) return s[0]; if (h >= n - 1) return s[n - 1];
		var lo = Math.floor(h); return s[lo] + (h - lo) * (s[lo + 1] - s[lo]);
	}
	S.percentile = function (s, p, method) {   // s sorted, p in [0,1]
		var n = s.length; if (!n) return NaN;
		if (method === "exc") return interp(s, (n + 1) * p - 1);
		return interp(s, (n - 1) * p);
	};
	S.quartiles = function (s, method) {   // s sorted
		var n = s.length; if (!n) return { q1: NaN, q2: NaN, q3: NaN };
		var q2 = medianSorted(s);
		if (method === "inc" || method === "exc") return { q1: S.percentile(s, 0.25, method), q2: q2, q3: S.percentile(s, 0.75, method) };
		if (n === 1) return { q1: s[0], q2: q2, q3: s[0] };
		var h = n >> 1, lo, hi;
		if (n % 2 && method === "tukey") { lo = s.slice(0, h + 1); hi = s.slice(h); }
		else { lo = s.slice(0, h); hi = s.slice(n % 2 ? h + 1 : h); }
		return { q1: medianSorted(lo), q2: q2, q3: medianSorted(hi) };
	};
	// percentile rank of a value: % of the data below it, counting ties as half
	S.percentileRank = function (s, x) { var below = 0, eq = 0; s.forEach(function (v) { if (v < x) below++; else if (v === x) eq++; }); return s.length ? 100 * (below + eq / 2) / s.length : NaN; };

	/* ---------- the full description ---------- */
	S.describe = function (a, opt) {
		opt = opt || {}; var method = opt.method || "ti", n = a.length;
		if (!n) return null;
		var s = S.sorted(a), total = sum(a), m = total / n, ss = sum(a.map(function (x) { return (x - m) * (x - m); }));
		var vs = n > 1 ? ss / (n - 1) : NaN, vp = ss / n, sds = Math.sqrt(vs), sdp = Math.sqrt(vp);
		var q = S.quartiles(s, method), iqr = q.q3 - q.q1, lf = q.q1 - 1.5 * iqr, uf = q.q3 + 1.5 * iqr;
		var outliers = s.filter(function (x) { return x < lf || x > uf; });
		var inside = s.filter(function (x) { return x >= lf && x <= uf; });
		var m2 = vp, m3 = sum(a.map(function (x) { return Math.pow(x - m, 3); })) / n, m4 = sum(a.map(function (x) { return Math.pow(x - m, 4); })) / n;
		var g1 = m2 > 0 ? m3 / Math.pow(m2, 1.5) : NaN, g2 = m2 > 0 ? m4 / (m2 * m2) - 3 : NaN;
		var G1 = n > 2 && m2 > 0 ? g1 * Math.sqrt(n * (n - 1)) / (n - 2) : NaN;
		var G2 = n > 3 && m2 > 0 ? ((n + 1) * g2 + 6) * (n - 1) / ((n - 2) * (n - 3)) : NaN;
		var allPos = s[0] > 0;
		var med = medianSorted(s);
		var sd = opt.pop ? sdp : sds;
		return {
			n: n, sum: total, mean: m, median: med, modes: S.modes(a), min: s[0], max: s[n - 1], range: s[n - 1] - s[0],
			q1: q.q1, q3: q.q3, iqr: iqr, lowerFence: lf, upperFence: uf, outliers: outliers,
			whiskerLo: inside.length ? inside[0] : s[0], whiskerHi: inside.length ? inside[inside.length - 1] : s[n - 1],
			ss: ss, varS: vs, varP: vp, sdS: sds, sdP: sdp, sd: sd, variance: opt.pop ? vp : vs,
			se: sds / Math.sqrt(n), cv: m !== 0 ? sd / Math.abs(m) : NaN,
			skewS: G1, skewP: g1, kurtS: G2, kurtP: g2,
			geo: allPos ? Math.exp(S.mean(a.map(Math.log))) : NaN, harm: allPos ? n / sum(a.map(function (x) { return 1 / x; })) : NaN,
			madMean: sum(a.map(function (x) { return Math.abs(x - m); })) / n,
			madMedian: medianSorted(S.sorted(a.map(function (x) { return Math.abs(x - med); }))),
			rms: Math.sqrt(sum(a.map(function (x) { return x * x; })) / n),
			sorted: s, method: method, pop: !!opt.pop
		};
	};

	/* ---------- histogram bins ---------- */
	S.BINRULES = { sturges: "Sturges", sqrt: "Square root", rice: "Rice", fd: "Freedman–Diaconis", scott: "Scott" };
	S.binCount = function (s, rule) {   // s sorted
		var n = s.length; if (n < 2) return 1;
		var range = s[n - 1] - s[0]; if (!(range > 0)) return 1;
		var k;
		if (rule === "sqrt") k = Math.ceil(Math.sqrt(n));
		else if (rule === "rice") k = Math.ceil(2 * Math.cbrt(n));
		else if (rule === "fd") { var q = S.quartiles(s, "inc"), w = 2 * (q.q3 - q.q1) / Math.cbrt(n); k = w > 0 ? Math.ceil(range / w) : Math.ceil(Math.log2(n)) + 1; }
		else if (rule === "scott") { var w2 = 3.49 * S.sd(s) / Math.cbrt(n); k = w2 > 0 ? Math.ceil(range / w2) : Math.ceil(Math.log2(n)) + 1; }
		else k = Math.ceil(Math.log2(n)) + 1;
		return Math.max(1, Math.min(100, k));
	};
	function niceStep(raw) { var e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e; var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return nf * e; }
	S.niceStep = niceStep;
	// bins of a "nice" width close to range/k, starting at a multiple of the width. Each bin is [lo, hi), the last one includes its top.
	S.histogram = function (s, k) {
		var n = s.length; if (!n) return { bins: [], width: 0 };
		var lo = s[0], hi = s[n - 1];
		if (hi === lo) return { bins: [{ lo: lo - 0.5, hi: hi + 0.5, count: n }], width: 1 };
		var w = niceStep((hi - lo) / k), start = Math.floor(lo / w) * w, bins = [];
		var nb = Math.max(1, Math.ceil((hi - start) / w - 1e-9)); if (start + nb * w <= hi + 1e-12 * Math.abs(hi)) nb++;
		for (var i = 0; i < nb; i++) bins.push({ lo: +(start + i * w).toPrecision(12), hi: +(start + (i + 1) * w).toPrecision(12), count: 0 });
		s.forEach(function (x) { var j = Math.floor((x - start) / w + 1e-9); if (j >= nb) j = nb - 1; if (j < 0) j = 0; bins[j].count++; });
		return { bins: bins, width: w };
	};

	/* ---------- special functions ---------- */
	var LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
	function lnGamma(x) {
		if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
		x -= 1; var a = LANCZOS[0], t = x + 7.5;
		for (var i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
		return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
	}
	S.lnGamma = lnGamma;
	var LNFACT = [0]; for (var fi = 1; fi <= 170; fi++) LNFACT[fi] = LNFACT[fi - 1] + Math.log(fi);
	function lnFact(k) { return k <= 170 ? LNFACT[k] : lnGamma(k + 1); }
	S.lnChoose = function (n, k) { return lnFact(n) - lnFact(k) - lnFact(n - k); };
	var EPS = 1e-16, FPMIN = 1e-300;
	// regularized lower incomplete gamma P(a, x) and upper Q(a, x)
	function gser(a, x) { var ap = a, del = 1 / a, s = del; for (var i = 0; i < 1000; i++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * EPS) break; } return s * Math.exp(-x + a * Math.log(x) - lnGamma(a)); }
	function gcf(a, x) {   // Lentz continued fraction for Q(a, x)
		var b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
		for (var i = 1; i < 1000; i++) { var an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN; c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; var del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break; }
		return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
	}
	S.gammaP = function (a, x) { if (x <= 0) return 0; if (!isFinite(x)) return 1; return x < a + 1 ? gser(a, x) : 1 - gcf(a, x); };
	S.gammaQ = function (a, x) { if (x <= 0) return 1; if (!isFinite(x)) return 0; return x < a + 1 ? 1 - gser(a, x) : gcf(a, x); };
	// regularized incomplete beta I_x(a, b)
	function betacf(a, b, x) {
		var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; var h = d;
		for (var m = 1; m <= 3000; m++) {
			var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
			d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
			aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
			d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; var del = d * c; h *= del;
			if (Math.abs(del - 1) < EPS) break;
		}
		return h;
	}
	S.betaI = function (x, a, b) {
		if (x <= 0) return 0; if (x >= 1) return 1;
		var bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
		return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
	};
	// erf / erfc through the incomplete gamma function (accurate to ~1e-15, and in the far tails)
	S.erf = function (x) { if (x === 0) return 0; var p = S.gammaP(0.5, x * x); return x < 0 ? -p : p; };
	S.erfc = function (x) { return x < 0 ? 1 + S.gammaP(0.5, x * x) : S.gammaQ(0.5, x * x); };

	/* ---------- distributions ---------- */
	var SQ2 = Math.SQRT2, LN_SQ2PI = 0.5 * Math.log(2 * Math.PI);
	S.normPdf = function (x, mu, sd) { mu = mu || 0; sd = sd == null ? 1 : sd; var z = (x - mu) / sd; return Math.exp(-0.5 * z * z - LN_SQ2PI) / sd; };
	S.normCdf = function (x, mu, sd) { mu = mu || 0; sd = sd == null ? 1 : sd; var z = (x - mu) / sd; return 0.5 * S.erfc(-z / SQ2); };
	// inverse normal: Acklam's rational approximation + one Halley step
	var AA = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
		BB = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
		CC = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
		DD = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
	S.normInv = function (p, mu, sd) {
		mu = mu || 0; sd = sd == null ? 1 : sd;
		if (!(p > 0)) return p === 0 ? -Infinity : NaN; if (!(p < 1)) return p === 1 ? Infinity : NaN;
		var q, r, x, pl = 0.02425;
		if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((CC[0] * q + CC[1]) * q + CC[2]) * q + CC[3]) * q + CC[4]) * q + CC[5]) / ((((DD[0] * q + DD[1]) * q + DD[2]) * q + DD[3]) * q + 1); }
		else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = (((((AA[0] * r + AA[1]) * r + AA[2]) * r + AA[3]) * r + AA[4]) * r + AA[5]) * q / (((((BB[0] * r + BB[1]) * r + BB[2]) * r + BB[3]) * r + BB[4]) * r + 1); }
		else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((CC[0] * q + CC[1]) * q + CC[2]) * q + CC[3]) * q + CC[4]) * q + CC[5]) / ((((DD[0] * q + DD[1]) * q + DD[2]) * q + DD[3]) * q + 1); }
		for (var it = 0; it < 2; it++) { var e = p < 0.5 ? S.normCdf(x) - p : (1 - p) - 0.5 * S.erfc(x / SQ2); var u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); x = x - u / (1 + x * u / 2); }
		return mu + sd * x;
	};
	S.tPdf = function (t, v) { return Math.exp(lnGamma((v + 1) / 2) - lnGamma(v / 2) - 0.5 * Math.log(v * Math.PI) - (v + 1) / 2 * Math.log(1 + t * t / v)); };
	S.tCdf = function (t, v) {
		if (!isFinite(t)) return t > 0 ? 1 : 0;
		var x = v / (v + t * t), tail = 0.5 * S.betaI(x, v / 2, 0.5);
		return t > 0 ? 1 - tail : tail;
	};
	S.tSf = function (t, v) { return S.tCdf(-t, v); };
	S.chiPdf = function (x, k) { if (x < 0) return 0; if (x === 0) return k === 2 ? 0.5 : k < 2 ? Infinity : 0; return Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lnGamma(k / 2)); };
	S.chiCdf = function (x, k) { return S.gammaP(k / 2, x / 2); };
	S.chiSf = function (x, k) { return S.gammaQ(k / 2, x / 2); };
	S.fCdf = function (f, d1, d2) { if (f <= 0) return 0; return S.betaI(d1 * f / (d1 * f + d2), d1 / 2, d2 / 2); };
	S.fSf = function (f, d1, d2) { if (f <= 0) return 1; return S.betaI(d2 / (d2 + d1 * f), d2 / 2, d1 / 2); };
	S.fPdf = function (f, d1, d2) { if (f <= 0) return 0; return Math.exp(0.5 * (d1 * Math.log(d1 * f) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * f + d2)) - Math.log(f) - (lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2))); };
	// invert a continuous increasing cdf by bracketing + bisection (to machine precision)
	function invert(cdf, p, lo, hi) {
		var i = 0; while (cdf(lo) > p && i++ < 200) lo = lo < 0 ? lo * 2 : lo - 1 - Math.abs(lo);
		i = 0; while (cdf(hi) < p && i++ < 200) hi = hi > 0 ? hi * 2 : hi + 1 + Math.abs(hi);
		for (i = 0; i < 300; i++) { var mid = (lo + hi) / 2; if (mid === lo || mid === hi) break; if (cdf(mid) < p) lo = mid; else hi = mid; }
		return (lo + hi) / 2;
	}
	S.tInv = function (p, v) { if (p <= 0) return -Infinity; if (p >= 1) return Infinity; if (p === 0.5) return 0; if (p < 0.5) return -S.tInv(1 - p, v); return invert(function (t) { return S.tCdf(t, v); }, p, 0, Math.max(2, S.normInv(p) * 2)); };
	S.chiInv = function (p, k) { if (p <= 0) return 0; if (p >= 1) return Infinity; return invert(function (x) { return S.chiCdf(x, k); }, p, 0, Math.max(1, k * 3)); };
	S.fInv = function (p, d1, d2) { if (p <= 0) return 0; if (p >= 1) return Infinity; return invert(function (x) { return S.fCdf(x, d1, d2); }, p, 0, 10); };
	// discrete
	S.binomPmf = function (k, n, p) {
		if (k < 0 || k > n || Math.floor(k) !== k) return 0;
		if (p === 0) return k === 0 ? 1 : 0; if (p === 1) return k === n ? 1 : 0;
		return Math.exp(S.lnChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
	};
	S.binomCdf = function (k, n, p) {   // P(X <= k)
		k = Math.floor(k); if (k < 0) return 0; if (k >= n) return 1;
		if (p === 0) return 1; if (p === 1) return 0;
		return S.betaI(1 - p, n - k, k + 1);
	};
	S.poisPmf = function (k, lam) { if (k < 0 || Math.floor(k) !== k) return 0; if (lam === 0) return k === 0 ? 1 : 0; return Math.exp(k * Math.log(lam) - lam - lnFact(k)); };
	S.poisCdf = function (k, lam) { k = Math.floor(k); if (k < 0) return 0; if (lam === 0) return 1; return S.gammaQ(k + 1, lam); };
	// geometric: X = the trial on which the first success happens (1, 2, 3, ...)
	S.geomPmf = function (k, p) { if (k < 1 || Math.floor(k) !== k) return 0; return Math.pow(1 - p, k - 1) * p; };
	S.geomCdf = function (k, p) { k = Math.floor(k); if (k < 1) return 0; return 1 - Math.pow(1 - p, k); };
	S.unifCdf = function (x, a, b) { return x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); };

	/* ---------- regression ---------- */
	function solve3(A, b) {   // Gaussian elimination with partial pivoting, small systems
		var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
		for (var c = 0; c < n; c++) {
			var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
			if (Math.abs(M[p][c]) < 1e-300) return null; var t = M[c]; M[c] = M[p]; M[p] = t;
			for (r = c + 1; r < n; r++) { var f = M[r][c] / M[c][c]; for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
		}
		var x = new Array(n); for (var i = n - 1; i >= 0; i--) { var s = M[i][n]; for (var j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
		return x;
	}
	function r2of(y, yhat) { var m = S.mean(y), sst = 0, sse = 0; for (var i = 0; i < y.length; i++) { sst += (y[i] - m) * (y[i] - m); sse += (y[i] - yhat[i]) * (y[i] - yhat[i]); } return { r2: sst > 0 ? 1 - sse / sst : NaN, sse: sse, sst: sst }; }
	S.linear = function (x, y) {
		var n = x.length; if (n < 2) return null;
		var mx = S.mean(x), my = S.mean(y), sxx = 0, syy = 0, sxy = 0;
		for (var i = 0; i < n; i++) { var dx = x[i] - mx, dy = y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
		if (!(sxx > 0)) return { error: "All the x values are the same, so no line can be fitted." };
		var b1 = sxy / sxx, b0 = my - b1 * mx, fit = x.map(function (v) { return b0 + b1 * v; }), res = y.map(function (v, i) { return v - fit[i]; });
		var sse = sum(res.map(function (e) { return e * e; })), df = n - 2;
		var r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN, s = df > 0 ? Math.sqrt(sse / df) : NaN;
		var seB1 = s / Math.sqrt(sxx), seB0 = s * Math.sqrt(1 / n + mx * mx / sxx);
		var tB1 = b1 / seB1, tB0 = b0 / seB0;
		var pB1 = df > 0 && isFinite(tB1) ? 2 * S.tSf(Math.abs(tB1), df) : (df > 0 && seB1 === 0 ? 0 : NaN);
		var pB0 = df > 0 && isFinite(tB0) ? 2 * S.tSf(Math.abs(tB0), df) : NaN;
		var tc = df > 0 ? S.tInv(0.975, df) : NaN;
		return { kind: "linear", n: n, a: b0, b: b1, slope: b1, intercept: b0, r: r, r2: syy > 0 ? 1 - sse / syy : NaN, sse: sse, s: s, df: df,
			seSlope: seB1, seIntercept: seB0, tSlope: tB1, tIntercept: tB0, pSlope: pB1, pIntercept: pB0,
			ciSlope: [b1 - tc * seB1, b1 + tc * seB1], ciIntercept: [b0 - tc * seB0, b0 + tc * seB0],
			mx: mx, my: my, sxx: sxx, syy: syy, sxy: sxy, fit: fit, res: res, predict: function (v) { return b0 + b1 * v; } };
	};
	// prediction at x0: the fitted value with a 95% confidence interval for the mean and a prediction interval for one new point
	S.linearPredict = function (L, x0, level) {
		var yh = L.intercept + L.slope * x0, tc = L.df > 0 ? S.tInv(1 - (1 - (level || 0.95)) / 2, L.df) : NaN;
		var seM = L.s * Math.sqrt(1 / L.n + (x0 - L.mx) * (x0 - L.mx) / L.sxx), seP = L.s * Math.sqrt(1 + 1 / L.n + (x0 - L.mx) * (x0 - L.mx) / L.sxx);
		return { y: yh, ci: [yh - tc * seM, yh + tc * seM], pi: [yh - tc * seP, yh + tc * seP] };
	};
	S.quadratic = function (x, y) {
		var n = x.length; if (n < 3) return { error: "A quadratic needs at least 3 points." };
		var mx = S.mean(x), sx = S.sd(x, true) || 1, u = x.map(function (v) { return (v - mx) / sx; });   // centred and scaled for accuracy
		var s0 = n, s1 = sum(u), s2 = sum(u.map(function (v) { return v * v; })), s3 = sum(u.map(function (v) { return v * v * v; })), s4 = sum(u.map(function (v) { return v * v * v * v; }));
		var t0 = sum(y), t1 = sum(u.map(function (v, i) { return v * y[i]; })), t2 = sum(u.map(function (v, i) { return v * v * y[i]; }));
		var c = solve3([[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]], [t0, t1, t2]);
		if (!c || !c.every(isFinite)) return { error: "The x values need at least 3 different values for a quadratic." };
		// back to y = a x^2 + b x + c
		var A = c[2] / (sx * sx), B = c[1] / sx - 2 * c[2] * mx / (sx * sx), C = c[0] - c[1] * mx / sx + c[2] * mx * mx / (sx * sx);
		var f = function (v) { var w = (v - mx) / sx; return c[0] + c[1] * w + c[2] * w * w; };
		var fit = x.map(f), q = r2of(y, fit);
		return { kind: "quadratic", a: A, b: B, c: C, r2: q.r2, sse: q.sse, fit: fit, predict: f };
	};
	function transformedFit(kind, x, y, tx, ty, back) {
		var X = [], Y = [];
		for (var i = 0; i < x.length; i++) { var a = tx(x[i]), b = ty(y[i]); if (!isFinite(a) || !isFinite(b)) return null; X.push(a); Y.push(b); }
		var L = S.linear(X, Y); if (!L || L.error) return null;
		var f = back(L.intercept, L.slope), fit = x.map(f), q = r2of(y, fit);
		return { kind: kind, A: L.intercept, B: L.slope, r2: q.r2, r2t: L.r2, sse: q.sse, fit: fit, predict: f };
	}
	S.exponential = function (x, y) {   // y = a e^(b x)
		if (y.some(function (v) { return v <= 0; })) return { error: "An exponential fit needs every y above 0." };
		var r = transformedFit("exponential", x, y, function (v) { return v; }, Math.log, function (A, B) { var a = Math.exp(A); return function (v) { return a * Math.exp(B * v); }; });
		if (!r) return { error: "Could not fit an exponential." }; r.a = Math.exp(r.A); r.b = r.B; return r;
	};
	S.power = function (x, y) {   // y = a x^b
		if (y.some(function (v) { return v <= 0; }) || x.some(function (v) { return v <= 0; })) return { error: "A power fit needs every x and y above 0." };
		var r = transformedFit("power", x, y, Math.log, Math.log, function (A, B) { var a = Math.exp(A); return function (v) { return a * Math.pow(v, B); }; });
		if (!r) return { error: "Could not fit a power curve." }; r.a = Math.exp(r.A); r.b = r.B; return r;
	};
	S.logarithmic = function (x, y) {   // y = a + b ln x
		if (x.some(function (v) { return v <= 0; })) return { error: "A logarithmic fit needs every x above 0." };
		var r = transformedFit("logarithmic", x, y, Math.log, function (v) { return v; }, function (A, B) { return function (v) { return A + B * Math.log(v); }; });
		if (!r) return { error: "Could not fit a logarithmic curve." }; r.a = r.A; r.b = r.B; return r;
	};
	S.ranks = function (a) {   // average ranks for ties, 1-based
		var idx = a.map(function (v, i) { return i; }).sort(function (p, q) { return a[p] - a[q]; }), r = new Array(a.length);
		for (var i = 0; i < idx.length;) { var j = i; while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++; var avg = (i + j) / 2 + 1; for (var k = i; k <= j; k++) r[idx[k]] = avg; i = j + 1; }
		return r;
	};
	S.pearson = function (x, y) { var L = S.linear(x, y); return L && !L.error ? L.r : NaN; };
	S.spearman = function (x, y) {
		var n = x.length, rho = S.pearson(S.ranks(x), S.ranks(y));
		var t = n > 2 ? rho * Math.sqrt((n - 2) / Math.max(1e-300, 1 - rho * rho)) : NaN;
		return { rho: rho, t: t, df: n - 2, p: n > 2 ? (Math.abs(rho) >= 1 ? 0 : 2 * S.tSf(Math.abs(t), n - 2)) : NaN };
	};

	/* ---------- hypothesis tests ---------- */
	// p-value for a statistic with a symmetric (z / t) or right-tailed (chi-square / F) distribution
	function pTail(stat, alt, cdf) {   // alt: "two" | "less" | "greater"
		if (alt === "less") return cdf(stat);
		if (alt === "greater") return 1 - cdf(stat);
		return Math.min(1, 2 * Math.min(cdf(stat), 1 - cdf(stat)));
	}
	function pZ(z, alt) { if (alt === "less") return S.normCdf(z); if (alt === "greater") return S.normCdf(-z); return 2 * S.normCdf(-Math.abs(z)); }
	function pT(t, df, alt) { if (alt === "less") return S.tCdf(t, df); if (alt === "greater") return S.tCdf(-t, df); return 2 * S.tCdf(-Math.abs(t), df); }
	S.pTail = pTail; S.pZ = pZ; S.pT = pT;
	function zc(conf) { return S.normInv(1 - (1 - conf) / 2); }
	function tcrit(conf, df) { return S.tInv(1 - (1 - conf) / 2, df); }
	S.zCrit = zc; S.tCrit = tcrit;
	function summ(d) { return d.values ? { n: d.values.length, mean: S.mean(d.values), sd: S.sd(d.values) } : { n: +d.n, mean: +d.mean, sd: +d.sd }; }
	S.summarise = summ;
	S.zTest1 = function (d, mu0, sigma, alt, conf) {
		var s = summ(d), se = sigma / Math.sqrt(s.n), z = (s.mean - mu0) / se, c = zc(conf);
		return { test: "z", stat: z, statName: "z", p: pZ(z, alt), est: s.mean, se: se, ci: [s.mean - c * se, s.mean + c * se], n: s.n, mean: s.mean, sd: s.sd, diff: s.mean - mu0 };
	};
	S.tTest1 = function (d, mu0, alt, conf) {
		var s = summ(d), df = s.n - 1, se = s.sd / Math.sqrt(s.n), t = (s.mean - mu0) / se, c = tcrit(conf, df);
		return { test: "t", stat: t, statName: "t", df: df, p: pT(t, df, alt), est: s.mean, se: se, ci: [s.mean - c * se, s.mean + c * se], n: s.n, mean: s.mean, sd: s.sd, diff: s.mean - mu0, d: (s.mean - mu0) / s.sd };
	};
	S.tTest2 = function (d1, d2, alt, conf, pooled, delta0) {
		var a = summ(d1), b = summ(d2), diff = a.mean - b.mean - (delta0 || 0), se, df;
		if (pooled) { var sp2 = ((a.n - 1) * a.sd * a.sd + (b.n - 1) * b.sd * b.sd) / (a.n + b.n - 2); se = Math.sqrt(sp2 * (1 / a.n + 1 / b.n)); df = a.n + b.n - 2; }
		else { var va = a.sd * a.sd / a.n, vb = b.sd * b.sd / b.n; se = Math.sqrt(va + vb); df = (va + vb) * (va + vb) / (va * va / (a.n - 1) + vb * vb / (b.n - 1)); }
		var t = diff / se, c = tcrit(conf, df), est = a.mean - b.mean;
		var spd = Math.sqrt(((a.n - 1) * a.sd * a.sd + (b.n - 1) * b.sd * b.sd) / (a.n + b.n - 2));
		return { test: pooled ? "pooled" : "welch", stat: t, statName: "t", df: df, p: pT(t, df, alt), est: est, se: se, ci: [est - c * se, est + c * se], a: a, b: b, d: (a.mean - b.mean) / spd };
	};
	S.tTestPaired = function (x, y, alt, conf, delta0) {
		if (x.length !== y.length) return { error: "The two lists need the same number of values (one pair per row)." };
		var diffs = x.map(function (v, i) { return v - y[i]; }), r = S.tTest1({ values: diffs }, delta0 || 0, alt, conf);
		r.test = "paired"; r.diffs = diffs; return r;
	};
	S.propTest1 = function (x, n, p0, alt, conf) {
		var ph = x / n, se0 = Math.sqrt(p0 * (1 - p0) / n), z = (ph - p0) / se0, se = Math.sqrt(ph * (1 - ph) / n), c = zc(conf);
		// Wilson score interval (better than the textbook Wald interval for small n or p near 0 / 1)
		var den = 1 + c * c / n, ctr = (ph + c * c / (2 * n)) / den, half = c * Math.sqrt(ph * (1 - ph) / n + c * c / (4 * n * n)) / den;
		return { test: "prop1", stat: z, statName: "z", p: pZ(z, alt), est: ph, se: se, ci: [ph - c * se, ph + c * se], wilson: [ctr - half, ctr + half], n: n, x: x, small: n * p0 < 10 || n * (1 - p0) < 10 };
	};
	S.propTest2 = function (x1, n1, x2, n2, alt, conf) {
		var p1 = x1 / n1, p2 = x2 / n2, pp = (x1 + x2) / (n1 + n2), se0 = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2)), z = (p1 - p2) / se0;
		var se = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2), c = zc(conf), est = p1 - p2;
		return { test: "prop2", stat: z, statName: "z", p: pZ(z, alt), est: est, se: se, ci: [est - c * se, est + c * se], p1: p1, p2: p2, pooled: pp, small: Math.min(x1, n1 - x1, x2, n2 - x2) < 5 };
	};
	S.chiGof = function (obs, exp) {   // exp: expected counts or proportions (scaled to the total); empty = equal
		var n = sum(obs), k = obs.length; if (k < 2) return { error: "Goodness of fit needs at least 2 categories." };
		var e;
		if (!exp || !exp.length) e = obs.map(function () { return n / k; });
		else { if (exp.length !== k) return { error: "Give one expected value per category (" + k + ")." }; var se = sum(exp); if (!(se > 0)) return { error: "The expected values must add up to more than 0." }; e = exp.map(function (v) { return v / se * n; }); }
		var chi = 0, parts = []; for (var i = 0; i < k; i++) { var c = (obs[i] - e[i]) * (obs[i] - e[i]) / e[i]; parts.push(c); chi += c; }
		var df = k - 1;
		return { test: "gof", stat: chi, statName: "χ²", df: df, p: S.chiSf(chi, df), expected: e, parts: parts, n: n, lowExp: e.filter(function (v) { return v < 5; }).length };
	};
	S.chiIndep = function (table) {
		var r = table.length, c = r ? table[0].length : 0; if (r < 2 || c < 2) return { error: "A test of independence needs a table with at least 2 rows and 2 columns." };
		if (table.some(function (row) { return row.length !== c; })) return { error: "Every row of the table needs the same number of counts." };
		var rs = table.map(sum), cs = [], n = sum(rs); for (var j = 0; j < c; j++) cs.push(sum(table.map(function (row) { return row[j]; })));
		if (rs.some(function (v) { return !(v > 0); }) || cs.some(function (v) { return !(v > 0); })) return { error: "Every row and every column needs at least one count." };
		var chi = 0, E = [], low = 0;
		for (var i = 0; i < r; i++) { E.push([]); for (j = 0; j < c; j++) { var e = rs[i] * cs[j] / n; E[i].push(e); if (e < 5) low++; chi += (table[i][j] - e) * (table[i][j] - e) / e; } }
		var df = (r - 1) * (c - 1), V = Math.sqrt(chi / (n * Math.min(r - 1, c - 1)));
		return { test: "indep", stat: chi, statName: "χ²", df: df, p: S.chiSf(chi, df), expected: E, rowSums: rs, colSums: cs, n: n, cramerV: V, lowExp: low, cells: r * c };
	};
	S.anova = function (groups) {
		groups = groups.filter(function (g) { return g.length; });
		var k = groups.length; if (k < 2) return { error: "ANOVA needs at least 2 groups." };
		var all = [].concat.apply([], groups), N = all.length, gm = S.mean(all), ssb = 0, ssw = 0;
		var info = groups.map(function (g) { var m = S.mean(g); ssb += g.length * (m - gm) * (m - gm); ssw += sum(g.map(function (v) { return (v - m) * (v - m); })); return { n: g.length, mean: m, sd: g.length > 1 ? S.sd(g) : NaN }; });
		var dfb = k - 1, dfw = N - k; if (dfw < 1) return { error: "ANOVA needs more values than groups." };
		var msb = ssb / dfb, msw = ssw / dfw, F = msb / msw;
		return { test: "anova", stat: F, statName: "F", df: dfb, df2: dfw, p: msw > 0 ? S.fSf(F, dfb, dfw) : (msb > 0 ? 0 : 1), ssb: ssb, ssw: ssw, sst: ssb + ssw, msb: msb, msw: msw, groups: info, eta2: (ssb + ssw) > 0 ? ssb / (ssb + ssw) : NaN, N: N };
	};

	/* ---------- sample size and margin of error ---------- */
	S.sizeMean = function (sigma, E, conf, N) { var z = zc(conf), n0 = Math.pow(z * sigma / E, 2), n = N ? n0 / (1 + (n0 - 1) / N) : n0; return { z: z, n0: n0, n: Math.ceil(n - 1e-9) }; };
	S.sizeProp = function (p, E, conf, N) { var z = zc(conf), n0 = z * z * p * (1 - p) / (E * E), n = N ? n0 / (1 + (n0 - 1) / N) : n0; return { z: z, n0: n0, n: Math.ceil(n - 1e-9) }; };
	S.moeProp = function (p, n, conf, N) { var z = zc(conf), fpc = N && N > 1 ? Math.sqrt((N - n) / (N - 1)) : 1; return { z: z, E: z * Math.sqrt(p * (1 - p) / n) * fpc }; };
	S.moeMean = function (sigma, n, conf, N) { var z = zc(conf), fpc = N && N > 1 ? Math.sqrt((N - n) / (N - 1)) : 1; return { z: z, E: z * sigma / Math.sqrt(n) * fpc }; };
	// people per group to detect a difference delta between two means (two-sided test, normal approximation)
	S.sizeTwoMeans = function (sigma, delta, alpha, power) { var za = S.normInv(1 - alpha / 2), zb = S.normInv(power), n = 2 * Math.pow((za + zb) * sigma / delta, 2); return { za: za, zb: zb, n0: n, n: Math.ceil(n - 1e-9) }; };
	S.sizeTwoProps = function (p1, p2, alpha, power) {
		var za = S.normInv(1 - alpha / 2), zb = S.normInv(power), pb = (p1 + p2) / 2;
		var n = Math.pow(za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p1 - p2, 2);
		return { za: za, zb: zb, n0: n, n: Math.ceil(n - 1e-9) };
	};

	/* ---------- formatting ---------- */
	S.fmt = function (x, dp) {
		if (x == null || isNaN(x)) return "–"; if (!isFinite(x)) return x > 0 ? "∞" : "−∞";
		dp = dp == null ? 4 : dp; var ax = Math.abs(x);
		if (ax !== 0 && (ax < Math.pow(10, -dp) || ax >= 1e12)) return x.toExponential(Math.max(2, dp - 1)).replace("-", "−").replace("e+", "e").replace(/e(−?)/, " × 10^$1");
		var s = (+x.toFixed(dp)).toString(); if (/e/.test(s)) s = x.toFixed(dp);
		var neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
		var parts = s.split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		return (neg ? "−" : "") + parts.join(".");
	};
	S.fmtP = function (p) { if (p == null || isNaN(p)) return "–"; if (p < 0.0001) return p === 0 ? "≈ 0" : "< 0.0001 (" + p.toExponential(2).replace("-", "−") + ")"; return p.toFixed(4); };

	/* ---------- share links ---------- */
	S.encode = function (obj) {
		var s = unescape(encodeURIComponent(JSON.stringify(obj)));
		var b = typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
		return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	};
	S.decode = function (str) {
		try { var b = String(str).replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
			var s = typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary"); return JSON.parse(decodeURIComponent(escape(s))); } catch (e) { return null; }
	};

	G.MESStat = S;
	if (typeof module !== "undefined" && module.exports) module.exports = S;
})(typeof window !== "undefined" ? window : globalThis);
