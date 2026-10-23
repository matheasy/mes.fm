/* Tests for the MES Statistics Calculator maths (MESStat). Run: node tool_apps_src/statistics-calculator-tests.js */
"use strict";
var S = require("./statistics-calculator/lib.js");
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL: " + m); } }
function near(a, b, tol, m) { var d = Math.abs(a - b), t = tol == null ? 1e-9 : tol; ok(d <= t || d <= t * Math.abs(b), m + " (got " + a + ", want " + b + ")"); }
function eqArr(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

/* parsing */
eqArr(S.parseNumbers("1, 2, 3, 4").values, [1, 2, 3, 4], "comma list");
eqArr(S.parseNumbers("1 2\n3\t4").values, [1, 2, 3, 4], "spaces, lines, tabs");
eqArr(S.parseNumbers("1,5; 2,25; 3").values, [1.5, 2.25, 3], "decimal comma with semicolons");
eqArr(S.parseNumbers("1,5 2,25 3").values, [1.5, 2.25, 3], "decimal comma with spaces");
eqArr(S.parseNumbers("1,234 5,678").values, [1234, 5678], "thousands commas");
eqArr(S.parseNumbers("1,234.5\n2,000").values, [1234.5, 2000], "thousands with decimal dot");
eqArr(S.parseNumbers("Score\n$12\n15%\n−3\n2e3").values, [12, 15, -3, 2000], "header, currency, percent, unicode minus, exponent");
ok(S.parseNumbers("Score\n12").skipped[0] === "Score", "skipped header reported");
eqArr(S.parseNumbers("1.234,5; 2", "auto").values, [1234.5, 2], "European thousands");
var pc = S.parseColumns("Name\tAge\tScore\nAnn\t20\t3,5\nBo\t30\t4,5");
eqArr(pc.names, ["Age", "Score"], "column names (text column dropped)"); eqArr(pc.cols[1], [3.5, 4.5], "spreadsheet column with decimal comma");
var fq = S.parseFreq("1, 3\n2, 2\n5, 1"); eqArr(fq.values, [1, 1, 1, 2, 2, 5], "frequency table");
var pp = S.parsePairs("1 2\n3 4\n5 6"); eqArr([pp.x, pp.y], [[1, 3, 5], [2, 4, 6]], "pairs as columns");
pp = S.parsePairs("(1, 2), (3, 4.5)"); eqArr([pp.x, pp.y], [[1, 3], [2, 4.5]], "pairs in brackets");
pp = S.parsePairs("1 2 3 4\n2 4 6 8"); eqArr([pp.x, pp.y], [[1, 2, 3, 4], [2, 4, 6, 8]], "two rows");
pp = S.parsePairs("x\ty\n1\t2,5\n2\t3,5"); eqArr([pp.x, pp.y], [[1, 2], [2.5, 3.5]], "spreadsheet pairs with header");

/* descriptive */
var d = S.describe([2, 4, 4, 4, 5, 5, 7, 9], { pop: true });
near(d.sdP, 2, 1e-12, "population sd of 2,4,4,4,5,5,7,9"); near(d.mean, 5, 1e-12, "mean"); near(d.median, 4.5, 1e-12, "median");
near(d.varS, 32 / 7, 1e-12, "sample variance"); eqArr(d.modes.modes, [4], "mode"); near(d.range, 7, 0, "range");
near(d.se, Math.sqrt(32 / 7) / Math.sqrt(8), 1e-12, "standard error");
var a = [6, 7, 15, 36, 39, 40, 41, 42, 43, 47, 49], sa = S.sorted(a);   // Wikipedia quartile example
var q = S.quartiles(sa, "ti"); near(q.q1, 15, 0, "TI Q1"); near(q.q3, 43, 0, "TI Q3");
q = S.quartiles(sa, "tukey"); near(q.q1, 25.5, 0, "Tukey Q1"); near(q.q3, 42.5, 0, "Tukey Q3");
q = S.quartiles(sa, "inc"); near(q.q1, 25.5, 1e-12, "inclusive Q1"); near(q.q3, 42.5, 1e-12, "inclusive Q3");
q = S.quartiles(sa, "exc"); near(q.q1, 15, 1e-12, "exclusive Q1"); near(q.q3, 43, 1e-12, "exclusive Q3");
var b = S.sorted([1, 2, 3, 4, 5, 6, 7, 8]);   // python statistics.quantiles: exclusive [2.25, 4.5, 6.75], inclusive [2.75, 4.5, 6.25]
q = S.quartiles(b, "exc"); near(q.q1, 2.25, 1e-12, "exc Q1 even n"); near(q.q3, 6.75, 1e-12, "exc Q3 even n");
q = S.quartiles(b, "inc"); near(q.q1, 2.75, 1e-12, "inc Q1 even n"); near(q.q3, 6.25, 1e-12, "inc Q3 even n");
q = S.quartiles(b, "ti"); near(q.q1, 2.5, 0, "TI Q1 even n"); near(q.q3, 6.5, 0, "TI Q3 even n");
near(S.percentile(b, 0.9, "inc"), 7.3, 1e-12, "90th percentile (inclusive)");
near(S.percentileRank(b, 4), 43.75, 1e-12, "percentile rank");
var o = S.describe([1, 2, 3, 4, 5, 6, 100]); eqArr(o.outliers, [100], "outlier found");
var sk = S.describe([1, 2, 3, 4, 10]);   // Excel SKEW = 1.69706, KURT = 3.152
near(sk.skewS, 1.697056274847714, 1e-12, "sample skewness (Excel SKEW)"); near(sk.kurtS, 3.152, 1e-12, "sample excess kurtosis (Excel KURT)");
var gm = S.describe([1, 2, 4, 8]); near(gm.geo, Math.pow(64, 0.25), 1e-12, "geometric mean"); near(gm.harm, 4 / (1 + 0.5 + 0.25 + 0.125), 1e-12, "harmonic mean");
ok(isNaN(S.describe([-1, 2]).geo), "no geometric mean with a negative value");
eqArr(S.modes([1, 1, 2, 2, 3]).modes, [1, 2], "two modes"); eqArr(S.modes([1, 2, 3]).modes, [], "no mode");
near(S.describe([1, 2, 3, 4, 5]).madMean, 1.2, 1e-12, "mean absolute deviation");
ok(S.binCount(S.sorted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), "sturges") === 5, "Sturges bins for n = 16");
var h = S.histogram(S.sorted([1, 2, 2, 3, 9, 10]), 4); ok(h.bins.reduce(function (s, x) { return s + x.count; }, 0) === 6, "histogram counts every value");
ok(h.bins[0].lo <= 1 && h.bins[h.bins.length - 1].hi >= 10, "histogram covers min and max");

/* special functions and distributions */
near(S.normCdf(1.96), 0.9750021048517795, 1e-12, "normal cdf 1.96");
near(S.normCdf(-3), 0.0013498980316301, 1e-14, "normal cdf -3");
near(S.normCdf(-8), 6.22096057427178e-16, 1e-6, "normal far tail -8 (relative)");
near(S.normCdf(0.5), 0.6914624612740131, 1e-12, "normal cdf 0.5");
near(S.normInv(0.975), 1.959963984540054, 1e-12, "inverse normal 0.975");
near(S.normInv(0.05), -1.6448536269514729, 1e-12, "inverse normal 0.05");
near(S.normInv(1e-10), -6.361340902404056, 1e-9, "inverse normal 1e-10");
near(S.normInv(0.9999), 3.719016485455709, 1e-10, "inverse normal 0.9999");
near(S.erf(0.5), 0.5204998778130465, 1e-14, "erf 0.5"); near(S.erfc(3), 2.209049699858544e-5, 1e-9, "erfc 3 (relative)");
near(S.normCdf(110, 100, 15), 0.7475074624530771, 1e-12, "IQ above 110");
near(Math.exp(S.lnGamma(5)), 24, 1e-12, "gamma(5)"); near(Math.exp(S.lnGamma(0.5)), Math.sqrt(Math.PI), 1e-13, "gamma(0.5)");
[0.3, 1, 2.5, 7].forEach(function (t) { near(S.tCdf(t, 1), 0.5 + Math.atan(t) / Math.PI, 1e-12, "t df 1 (Cauchy) at " + t); });
[0.5, 2, 4].forEach(function (t) { near(S.tCdf(t, 2), 0.5 + t / (2 * Math.sqrt(2 + t * t)), 1e-12, "t df 2 at " + t); });
function t3(t) { var u = t / Math.sqrt(3); return 0.5 + (u / (1 + u * u) + Math.atan(u)) / Math.PI; }
[0.7, 2.1213203435596424, 5].forEach(function (t) { near(S.tCdf(t, 3), t3(t), 1e-12, "t df 3 at " + t); });
near(S.tCdf(2.228138851986274, 10), 0.975, 1e-10, "t df 10 critical value");
near(S.tInv(0.975, 10), 2.228138851986274, 1e-9, "inverse t df 10"); near(S.tInv(0.975, 5), 2.570581835636314, 1e-9, "inverse t df 5");
near(S.tCdf(2, 5), 0.9490302605850709, 1e-10, "t cdf 2 df 5"); near(S.tCdf(-1.5, 30), 1 - S.tCdf(1.5, 30), 1e-14, "t symmetry");
near(S.tCdf(1.96, 1e7), S.normCdf(1.96), 1e-7, "t with huge df = normal");
[0.5, 2, 6].forEach(function (x) { near(S.chiCdf(x, 2), 1 - Math.exp(-x / 2), 1e-13, "chi-square df 2 at " + x); });
near(S.chiCdf(3.841458820694124, 1), 0.95, 1e-10, "chi-square 3.84 df 1"); near(S.chiSf(18.30703805327515, 10), 0.05, 1e-10, "chi-square 18.31 df 10");
near(S.chiInv(0.95, 1), 3.841458820694124, 1e-8, "inverse chi-square df 1"); near(S.chiInv(0.99, 4), 13.276704135987622, 1e-8, "inverse chi-square 0.99 df 4");
near(S.fSf(4.102821015130399, 2, 10), 0.05, 1e-10, "F(2,10) critical value");
[1, 3, 9].forEach(function (f) { near(S.fSf(f, 2, 7), Math.pow(1 + 2 * f / 7, -3.5), 1e-12, "F(2,7) closed form at " + f); });
near(S.fSf(2.5 * 2.5, 1, 8), 2 * S.tSf(2.5, 8), 1e-12, "F(1, v) = t squared");
near(S.fInv(0.95, 2, 10), 4.102821015130399, 1e-8, "inverse F");
near(S.betaI(0.3, 2, 3), 0.3483, 1e-12, "incomplete beta I_0.3(2,3)");
near(S.gammaP(3, 2), 1 - Math.exp(-2) * (1 + 2 + 2), 1e-14, "incomplete gamma P(3,2)");
near(S.binomPmf(5, 10, 0.5), 252 / 1024, 1e-14, "binomial P(X = 5), n 10");
near(S.binomCdf(3, 10, 0.5), 176 / 1024, 1e-13, "binomial P(X <= 3), n 10");
var bs = 0; for (var k = 0; k <= 7; k++) bs += S.binomPmf(k, 20, 0.3); near(S.binomCdf(7, 20, 0.3), bs, 1e-13, "binomial cdf = sum of pmf");
near(S.binomPmf(0, 1000, 0.001), Math.pow(0.999, 1000), 1e-12, "binomial large n");
near(S.poisPmf(2, 3), 4.5 * Math.exp(-3), 1e-14, "Poisson P(X = 2), mean 3");
near(S.poisCdf(2, 3), 8.5 * Math.exp(-3), 1e-13, "Poisson P(X <= 2), mean 3");
var ps = 0; for (k = 0; k <= 30; k++) ps += S.poisPmf(k, 25); near(S.poisCdf(30, 25), ps, 1e-12, "Poisson cdf = sum of pmf");
near(S.geomPmf(3, 0.2), 0.8 * 0.8 * 0.2, 1e-15, "geometric pmf"); near(S.geomCdf(3, 0.2), 1 - 0.512, 1e-15, "geometric cdf");
near(S.unifCdf(3, 2, 6), 0.25, 0, "uniform cdf");

/* regression */
var L = S.linear([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
near(L.slope, 0.6, 1e-12, "slope"); near(L.intercept, 2.2, 1e-12, "intercept"); near(L.r2, 0.6, 1e-12, "r squared"); near(L.r, Math.sqrt(0.6), 1e-12, "r");
near(L.seSlope, Math.sqrt(0.08), 1e-12, "se of slope"); near(L.tSlope, 0.6 / Math.sqrt(0.08), 1e-12, "t of slope");
near(L.pSlope, 2 * (1 - t3(0.6 / Math.sqrt(0.08))), 1e-12, "p of slope (df 3)");
near(L.sse, 2.4, 1e-12, "SSE"); near(L.res[2], 1, 1e-12, "residual");
var Pr = S.linearPredict(L, 3); near(Pr.y, 4, 1e-12, "predict at mean x");
var Q2 = S.quadratic([0, 1, 2, 3, 4], [1, 2, 5, 10, 17]); near(Q2.a, 1, 1e-10, "quadratic a"); near(Q2.b, 0, 1e-9, "quadratic b"); near(Q2.c, 1, 1e-9, "quadratic c"); near(Q2.r2, 1, 1e-12, "quadratic exact r²");
var E = S.exponential([0, 1, 2, 3], [2, 2 * Math.E, 2 * Math.E * Math.E, 2 * Math.pow(Math.E, 3)]); near(E.a, 2, 1e-12, "exponential a"); near(E.b, 1, 1e-12, "exponential b");
var Pw = S.power([1, 2, 4, 8], [3, 12, 48, 192]); near(Pw.a, 3, 1e-12, "power a"); near(Pw.b, 2, 1e-12, "power b");
var Lg = S.logarithmic([1, Math.E, Math.E * Math.E], [5, 7, 9]); near(Lg.a, 5, 1e-12, "log a"); near(Lg.b, 2, 1e-12, "log b");
ok(!!S.exponential([1, 2], [1, -1]).error, "exponential rejects negative y");
eqArr(S.ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4], "average ranks for ties");
near(S.spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]).rho, 1, 1e-12, "Spearman monotone = 1");
near(S.spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7]).rho, 0.8207826816681233, 1e-12, "Spearman with a tie");

/* tests */
var t1 = S.tTest1({ values: [5.1, 4.9, 5.6, 5.8, 6.0, 5.3] }, 5, "two", 0.95);
var m1 = (5.1 + 4.9 + 5.6 + 5.8 + 6.0 + 5.3) / 6; near(t1.mean, m1, 1e-12, "one-sample mean"); ok(t1.df === 5, "one-sample df");
near(t1.p, 2 * S.tSf(Math.abs(t1.stat), 5), 1e-14, "one-sample p");
near(t1.ci[0], m1 - S.tInv(0.975, 5) * t1.se, 1e-12, "one-sample CI");
var tw = S.tTest2({ values: [1, 2, 3, 4, 5] }, { values: [2, 4, 6, 8, 10] }, "two", 0.95, false);
near(tw.stat, -3 / Math.sqrt(2.5), 1e-12, "Welch t"); near(tw.df, 6.25 / (0.0625 + 1), 1e-12, "Welch df");
var tp = S.tTest2({ values: [1, 2, 3, 4, 5] }, { values: [2, 4, 6, 8, 10] }, "two", 0.95, true);
near(tp.stat, -3 / Math.sqrt(6.25 * 0.4), 1e-12, "pooled t"); ok(tp.df === 8, "pooled df");
var tsum = S.tTest2({ n: 30, mean: 75, sd: 10 }, { n: 25, mean: 70, sd: 12 }, "greater", 0.95, false);
near(tsum.stat, 5 / Math.sqrt(100 / 30 + 144 / 25), 1e-12, "Welch from summaries");
var pr = S.tTestPaired([10, 12, 9, 11], [8, 11, 9, 8], "two", 0.95); near(pr.mean, 1.5, 1e-12, "paired mean difference"); ok(pr.df === 3, "paired df");
var z1 = S.zTest1({ n: 36, mean: 103 }, 100, 15, "two", 0.95); near(z1.stat, 1.2, 1e-12, "one-sample z"); near(z1.p, 2 * S.normCdf(-1.2), 1e-14, "z p");
var p1 = S.propTest1(60, 100, 0.5, "two", 0.95); near(p1.stat, 2, 1e-12, "one-proportion z"); near(p1.p, 0.04550026389635842, 1e-12, "one-proportion p");
var p2 = S.propTest2(45, 100, 30, 100, "two", 0.95); near(p2.pooled, 0.375, 1e-12, "pooled proportion"); near(p2.stat, 0.15 / Math.sqrt(0.375 * 0.625 * 0.02), 1e-12, "two-proportion z");
var gof = S.chiGof([30, 20, 10], []); near(gof.stat, 10, 1e-12, "goodness of fit chi-square"); near(gof.p, Math.exp(-5), 1e-13, "GOF p (df 2)");
var gof2 = S.chiGof([50, 30, 20], [0.5, 0.3, 0.2]); near(gof2.stat, 0, 1e-12, "GOF with proportions");
var ind = S.chiIndep([[10, 20], [30, 40]]); near(ind.stat, 4 / 12 + 4 / 18 + 4 / 28 + 4 / 42, 1e-12, "independence chi-square"); ok(ind.df === 1, "independence df");
near(ind.p, S.erfc(Math.sqrt(ind.stat / 2)), 1e-13, "independence p (df 1 = 2-sided normal)");
var an = S.anova([[1, 2, 3], [4, 5, 6], [7, 8, 9]]); near(an.stat, 27, 1e-12, "ANOVA F"); near(an.p, 0.001, 1e-12, "ANOVA p"); ok(an.df === 2 && an.df2 === 6, "ANOVA df");
near(an.ssb, 54, 1e-12, "ANOVA SSB"); near(an.ssw, 6, 1e-12, "ANOVA SSW");

/* sample size */
ok(S.sizeProp(0.5, 0.05, 0.95).n === 385, "survey of 385 for ±5% at 95%");
ok(S.sizeProp(0.5, 0.03, 0.95).n === 1068, "1,068 for ±3%");
ok(S.sizeMean(15, 3, 0.95).n === 97, "mean sample size");
ok(S.sizeProp(0.5, 0.05, 0.95, 1000).n === 278, "finite population correction");
near(S.moeProp(0.5, 1000, 0.95).E, 0.030990, 1e-5, "margin of error n 1000");
ok(S.sizeTwoMeans(10, 5, 0.05, 0.8).n === 63, "two-means power sample size");

/* share links */
var enc = S.encode({ t: "describe", d: "1, 2, 3 é" }); eqArr(S.decode(enc), { t: "describe", d: "1, 2, 3 é" }, "share round trip"); ok(/^[A-Za-z0-9_-]+$/.test(enc), "base64url");
ok(S.decode("%%%") === null, "bad share link");
ok(S.fmt(1234567.891, 2) === "1,234,567.89", "number format"); ok(S.fmt(-0.5, 2) === "−0.5", "minus sign");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
