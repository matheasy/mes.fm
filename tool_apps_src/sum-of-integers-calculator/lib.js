/* MES Sum of Integers & Series Calculator -- exact maths (BigInt rationals), browser + node: require('./tool_apps_src/sum-of-integers-calculator/lib.js').
 * Natural numbers, any integer range, k-th powers (Faulhaber / Bernoulli, exact for any n), odd / even, multiples (inclusion-exclusion),
 * arithmetic and geometric series (finite and infinite), Fibonacci, triangular / tetrahedral, and a numeric Sigma of your own formula. */
var SUM = (function () {
	"use strict";
	function abs(a) { return a < 0n ? -a : a; }
	function gcd(a, b) { a = abs(a); b = abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
	/* rational number {n, d} with d > 0, always reduced */
	function Q(n, d) { n = BigInt(n); d = d === undefined ? 1n : BigInt(d); if (d === 0n) throw new Error("Division by zero"); if (d < 0n) { n = -n; d = -d; } var g = gcd(n, d); if (g > 1n) { n /= g; d /= g; } return { n: n, d: d }; }
	function add(a, b) { return Q(a.n * b.d + b.n * a.d, a.d * b.d); }
	function sub(a, b) { return Q(a.n * b.d - b.n * a.d, a.d * b.d); }
	function mul(a, b) { return Q(a.n * b.n, a.d * b.d); }
	function div(a, b) { return Q(a.n * b.d, a.d * b.n); }
	function pow(a, k) { var r = Q(1); for (var i = 0; i < k; i++) r = mul(r, a); return r; }
	function isInt(a) { return a.d === 1n; }
	function qstr(a) { return a.d === 1n ? a.n.toString() : a.n + "/" + a.d; }
	/* parse "12", "-3.5", "1,234.5", "3/4" (also "1e3") into a rational; null if not a number */
	function parseQ(s) {
		s = String(s).trim().replace(/\s/g, ""); if (!s) return null;
		if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); else s = s.replace(",", ".");
		var m;
		if ((m = /^([+-]?)(\d+)\/(\d+)$/.exec(s))) { if (BigInt(m[3]) === 0n) return null; return Q(BigInt(m[1] + m[2]), BigInt(m[3])); }
		if ((m = /^([+-]?)(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s)) && (m[2] || m[3])) {
			var ip = m[2] || "0", fp = m[3] || "", e = m[4] ? parseInt(m[4], 10) : 0, n = BigInt(ip + fp), d = 10n ** BigInt(fp.length);
			if (Math.abs(e) > 400) return null; if (e > 0) n *= 10n ** BigInt(e); else if (e < 0) d *= 10n ** BigInt(-e);
			return Q(m[1] === "-" ? -n : n, d);
		}
		return null;
	}
	function parseInt_(s) { var q = parseQ(s); return q && isInt(q) ? q.n : null; }
	/* exact decimal string of a rational to `digits` places (truncated, trailing zeros cut), with ellipsis when not terminating */
	function qdec(a, digits) {
		digits = digits || 12; var neg = a.n < 0n, n = abs(a.n), ip = n / a.d, r = n % a.d, s = "";
		for (var i = 0; i < digits && r !== 0n; i++) { r *= 10n; s += (r / a.d).toString(); r %= a.d; }
		return (neg ? "-" : "") + ip + (s ? "." + s : "") + (r !== 0n ? "…" : "");
	}
	function group(str) { var m = /^(-?)(\d+)(.*)$/.exec(str); return m ? m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + m[3] : str; }

	/* ---------- Bernoulli numbers (B1 = +1/2) and Faulhaber ---------- */
	var BERN = [Q(1)];
	function binom(n, k) { var r = 1n; for (var i = 1n; i <= BigInt(k); i++) r = r * (BigInt(n) - i + 1n) / i; return r; }
	function bern(m) {
		while (BERN.length <= m) { var k = BERN.length, s = Q(0); for (var j = 0; j < k; j++) s = add(s, mul(Q(binom(k + 1, j)), BERN[j])); BERN.push(mul(Q(-1, k + 1), s)); }
		return m === 1 ? Q(1, 2) : BERN[m];
	}
	var MAXK = 60;
	/* S_k(n) = 1^k + 2^k + ... + n^k for n >= 0 */
	function powSum(k, n) {
		n = BigInt(n); if (n <= 0n) return 0n; if (k === 0) return n;
		var s = Q(0); for (var j = 0; j <= k; j++) s = add(s, mul(mul(Q(binom(k + 1, j)), bern(j)), Q(n ** BigInt(k + 1 - j))));
		s = div(s, Q(k + 1)); return s.n;   // always an integer
	}
	/* sum of i^k for i = a..b (integers, any sign). 0^0 counts as 1. */
	function powRange(k, a, b) {
		a = BigInt(a); b = BigInt(b); if (b < a) return 0n; if (k === 0) return b - a + 1n;
		var tot = 0n, sgn = k % 2 === 0 ? 1n : -1n;
		if (a < 0n) { var hi = b < -1n ? b : -1n; tot += sgn * (powSum(k, -a) - powSum(k, -hi - 1n)); }
		if (b >= 0n) { var lo = a > 0n ? a : 0n; tot += powSum(k, b) - powSum(k, lo - 1n); }
		return tot;
	}
	function rangeSum(a, b) { a = BigInt(a); b = BigInt(b); if (b < a) return 0n; return (a + b) * (b - a + 1n) / 2n; }
	function oddSum(n) { n = BigInt(n); return n * n; }
	function evenSum(n) { n = BigInt(n); return n * (n + 1n); }
	/* sum of multiples of any of `ms` up to `limit` (inclusive or exclusive), by inclusion-exclusion */
	function lcm(a, b) { return a / gcd(a, b) * b; }
	function multiplesSum(ms, limit, inclusive) {
		var L = BigInt(limit) - (inclusive ? 0n : 1n); if (L < 1n) return 0n; var total = 0n, k = ms.length;
		for (var mask = 1; mask < (1 << k); mask++) {
			var l = 1n, bits = 0; for (var i = 0; i < k; i++) if (mask & (1 << i)) { l = lcm(l, BigInt(ms[i])); bits++; }
			var cnt = L / l, t = l * cnt * (cnt + 1n) / 2n; total += bits % 2 ? t : -t;
		}
		return total;
	}
	function arithmetic(a1, d, n) { n = BigInt(n); var two = Q(2); return div(mul(Q(n), add(mul(two, a1), mul(Q(n - 1n), d))), two); }
	function geometric(a, r, n) { if (r.n === r.d) return mul(a, Q(BigInt(n))); return mul(a, div(sub(Q(1), pow(r, Number(n))), sub(Q(1), r))); }
	function geometricInfinite(a, r) { if (abs(r.n) >= r.d) return null; return div(a, sub(Q(1), r)); }
	function fib(n) { var a = 0n, b = 1n; for (var i = 0; i < n; i++) { var t = a + b; a = b; b = t; } return a; }
	function fibSum(n) { return fib(n + 2) - 1n; }
	function triangular(n) { n = BigInt(n); return n * (n + 1n) / 2n; }
	function tetrahedral(n) { n = BigInt(n); return n * (n + 1n) * (n + 2n) / 6n; }

	/* ---------- Sigma of a formula in i (floating point) ---------- */
	function compile(src) {
		var s = String(src).replace(/\s+/g, "").replace(/×|·/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/²/g, "^2").replace(/³/g, "^3").replace(/π/g, "pi").replace(/\*\*/g, "^"), pos = 0;
		if (!s) throw new Error("Type a formula, e.g. i^2 + 3i");
		var FN = { sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan, floor: Math.floor, ceil: Math.ceil, round: Math.round,
			fact: function (x) { if (x < 0 || x !== Math.floor(x) || x > 170) return NaN; var r = 1; for (var j = 2; j <= x; j++) r *= j; return r; } };
		function peek() { return s[pos]; }
		function num() { var m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(pos)); if (!m) return null; pos += m[0].length; return parseFloat(m[0]); }
		function atom() {
			var m, v;
			if (peek() === "(") { pos++; v = expr(); if (peek() !== ")") throw new Error("Missing )"); pos++; return v; }
			if ((v = num()) !== null) return function () { return v; };
			if ((m = /^[a-z]+/i.exec(s.slice(pos)))) {
				var id = m[0].toLowerCase();
				if (id === "i" || id === "n") { pos += id.length; return function (x) { return x; }; }
				if (id === "pi") { pos += 2; return function () { return Math.PI; }; }
				if (id === "e") { pos += 1; return function () { return Math.E; }; }
				if (FN[id]) { pos += id.length; if (peek() !== "(") throw new Error("Use " + id + "(…)"); pos++; var f = expr(); if (peek() !== ")") throw new Error("Missing )"); pos++; return function (x) { return FN[id](f(x)); }; }
				throw new Error("Unknown word “" + id + "”. Use i as the variable.");
			}
			throw new Error(pos >= s.length ? "The formula ends too early" : "Unexpected “" + peek() + "”");
		}
		function postfix() { var v = atom(); while (peek() === "!") { pos++; (function (g) { v = function (x) { return FN.fact(g(x)); }; })(v); } return v; }
		function power() { var b = postfix(); if (peek() === "^") { pos++; var e = unary(); var bb = b; return function (x) { return Math.pow(bb(x), e(x)); }; } return b; }
		function unary() { if (peek() === "-") { pos++; var u = unary(); return function (x) { return -u(x); }; } if (peek() === "+") { pos++; return unary(); } return power(); }
		function term() {
			var l = unary();
			for (;;) {
				var c = peek();
				if (c === "*") { pos++; var r = unary(), ll = l; l = (function (a, b) { return function (x) { return a(x) * b(x); }; })(ll, r); }
				else if (c === "/") { pos++; var r2 = unary(), l2 = l; l = (function (a, b) { return function (x) { return a(x) / b(x); }; })(l2, r2); }
				else if (c !== undefined && c !== ")" && c !== "+" && c !== "-") { var r3 = unary(), l3 = l; l = (function (a, b) { return function (x) { return a(x) * b(x); }; })(l3, r3); }   // 3i, 2(i+1)
				else return l;
			}
		}
		function expr() { var l = term(); for (;;) { var c = peek(); if (c === "+" || c === "-") { pos++; var r = term(), ll = l, sg = c === "+" ? 1 : -1; l = (function (a, b, g) { return function (x) { return a(x) + g * b(x); }; })(ll, r, sg); } else return l; } }
		var f = expr(); if (pos < s.length) throw new Error("Unexpected “" + s[pos] + "”"); return f;
	}
	function sigma(src, a, b, limit) {
		var f = compile(src), n = b - a + 1; if (n > (limit || 5e6)) throw new Error("That is more than " + (limit || 5e6).toLocaleString() + " terms"); if (n < 0) return { sum: 0, n: 0 };
		var s = 0, c = 0, bad = 0, first = []; for (var i = a; i <= b; i++) { var y = f(i); if (!isFinite(y)) { bad++; continue; } var t = y - c, u = s + t; c = (u - s) - t; s = u; if (first.length < 12) first.push([i, y]); }
		return { sum: s, n: n, bad: bad, first: first };
	}

	return { Q: Q, add: add, sub: sub, mul: mul, div: div, pow: pow, isInt: isInt, qstr: qstr, qdec: qdec, parseQ: parseQ, parseInt: parseInt_, group: group, bern: bern, powSum: powSum, powRange: powRange, rangeSum: rangeSum, oddSum: oddSum, evenSum: evenSum,
		multiplesSum: multiplesSum, arithmetic: arithmetic, geometric: geometric, geometricInfinite: geometricInfinite, fib: fib, fibSum: fibSum, triangular: triangular, tetrahedral: tetrahedral, compile: compile, sigma: sigma, MAXK: MAXK, binom: binom, gcd: gcd, lcm: lcm };
})();
if (typeof module !== "undefined" && module.exports) module.exports = SUM;
