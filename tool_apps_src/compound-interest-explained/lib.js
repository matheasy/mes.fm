/* Compound Interest Explained -- the small maths behind the page's interactive figures (global CIX; require()-able in node:
 * tool_apps_src/compound-interest-explained-tests.js). r = yearly rate as a decimal, n = compounding periods per year (0 = continuous), t = years. */
(function (root) {
	"use strict";
	function simple(P, r, t) { return P * (1 + r * t); }
	function compound(P, r, n, t) { return n === 0 ? P * Math.exp(r * t) : P * Math.exp(n * t * Math.log1p(r / n)); }
	function eApprox(n) { return Math.exp(n * Math.log1p(1 / n)); }            // (1 + 1/n)^n without rounding trouble for huge n
	function apy(r, n) { return n === 0 ? Math.expm1(r) : Math.expm1(n * Math.log1p(r / n)); }
	// future value of N deposits D, growth i per period; due = deposits at the start of each period
	function fvSeries(D, i, N, due) { var s = i === 0 ? D * N : D * Math.expm1(N * Math.log1p(i)) / i; return due ? s * (1 + i) : s; }
	// years for P to grow to A (A > P > 0)
	function timeTo(P, A, r, n) { if (!(A > 0 && P > 0 && r > 0)) return NaN; return Math.log(A / P) / (n === 0 ? r : n * Math.log1p(r / n)); }
	function doubling(r, n) { return timeTo(1, 2, r, n); }
	// rule of thumb estimates; pct = rate in percent
	function rule(k, pct) { return k / pct; }
	function realRate(r, inf) { return (1 + r) / (1 + inf) - 1; }
	// one row per period: {k, start, interest, end}
	function periods(P, r, n, count) {
		var out = [], b = P, g = r / n;
		for (var k = 1; k <= count; k++) { var i = b * g; out.push({ k: k, start: b, interest: i, end: b + i }); b += i; }
		return out;
	}
	var CIX = { simple: simple, compound: compound, eApprox: eApprox, apy: apy, fvSeries: fvSeries, timeTo: timeTo, doubling: doubling, rule: rule, realRate: realRate, periods: periods };
	if (typeof module !== "undefined" && module.exports) module.exports = CIX; else root.CIX = CIX;
})(this);
