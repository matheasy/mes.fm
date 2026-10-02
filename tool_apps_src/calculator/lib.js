/* MES Calculator -- pure maths (no DOM), prepended to app.js by build_tool_apps.py. Also runs in node: require() it to test. */
var MC = (function () {
	'use strict';

	/* ---------- number formatting ---------- */
	// 12 significant digits hides binary noise (0.1+0.2 -> 0.3) while keeping everything a person would read
	function fmt(n) {
		if (typeof n === 'bigint') return n.toString();
		if (n !== n) return 'Error';
		if (n === Infinity) return '∞';
		if (n === -Infinity) return '-∞';
		if (n === 0) return '0';
		return parseFloat(n.toPrecision(12)).toString().replace('e+', 'e');
	}
	function group(s) {                       // 1234567.891 -> 1,234,567.891 (leaves exponent / ∞ / Error strings alone)
		s = String(s);
		if (/[e∞A-Za-z]/.test(s)) return s;
		var m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
		if (!m) return s;
		return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '');
	}
	function gfmt(n) { return group(fmt(n)); }

	/* ---------- integer helpers ---------- */
	function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
	function lcm(a, b) { return a === 0 || b === 0 ? 0 : Math.abs(a / gcd(a, b) * b); }
	function bgcd(a, b) { if (a < 0n) a = -a; if (b < 0n) b = -b; while (b) { var t = a % b; a = b; b = t; } return a; }
	function fact(n) {
		if (n < 0 || n !== Math.floor(n)) throw new Error('Factorial needs a whole number ≥ 0');
		if (n > 170) return Infinity;
		var r = 1; for (var i = 2; i <= n; i++) r *= i; return r;
	}
	function nCr(n, r) { if (r < 0 || r > n) return 0; r = Math.min(r, n - r); var v = 1; for (var i = 1; i <= r; i++) v = v * (n - r + i) / i; return Math.round(v); }
	function nPr(n, r) { if (r < 0 || r > n) return 0; var v = 1; for (var i = 0; i < r; i++) v *= (n - i); return v; }

	/* ---------- expression parser (no eval) ---------- */
	var CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };
	var FN1 = {
		sqrt: function (x) { if (x < 0) throw new Error('√ of a negative number is not real'); return Math.sqrt(x); },
		cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc, sign: Math.sign,
		exp: Math.exp, ln: function (x) { if (x <= 0) throw new Error('ln needs a positive number'); return Math.log(x); },
		log2: function (x) { if (x <= 0) throw new Error('log needs a positive number'); return Math.log2(x); },
		sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, fact: fact, sq: function (x) { return x * x; }, inv: function (x) { return 1 / x; }
	};
	var FNX = {                                   // multi-argument / optional-argument functions
		log: function (a) { if (a[0] <= 0) throw new Error('log needs a positive number'); return a.length > 1 ? Math.log(a[0]) / Math.log(a[1]) : Math.log10(a[0]); },
		round: function (a) { var p = Math.pow(10, a[1] || 0); return Math.round(a[0] * p) / p; },
		pow: function (a) { return Math.pow(a[0], a[1]); },
		root: function (a) { var n = a[0], x = a[1]; if (x < 0 && n % 2 !== 0) return -Math.pow(-x, 1 / n); return Math.pow(x, 1 / n); },
		mod: function (a) { return a[0] - a[1] * Math.floor(a[0] / a[1]); },
		gcd: function (a) { return a.reduce(gcd); }, lcm: function (a) { return a.reduce(lcm); },
		min: function (a) { return Math.min.apply(null, a); }, max: function (a) { return Math.max.apply(null, a); },
		ncr: function (a) { return nCr(a[0], a[1]); }, npr: function (a) { return nPr(a[0], a[1]); },
		hypot: function (a) { return Math.hypot.apply(null, a); }, avg: function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
	};
	var ALIAS = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', squareroot: 'sqrt', factorial: 'fact', ln: 'ln', lg: 'log', mean: 'avg', cuberoot: 'cbrt' };

	function tokenize(src) {
		var s = String(src).replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt ').replace(/∛/g, 'cbrt ')
			.replace(/\bof\b/gi, '*').replace(/\*\*/g, '^').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\s+/g, ' ');
		var out = [], i = 0, m;
		while (i < s.length) {
			var c = s[i];
			if (c === ' ') { i++; continue; }
			if ((m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i)))) { out.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
			if ((m = /^[a-z_][a-z0-9_]*/i.exec(s.slice(i)))) { out.push({ k: 'id', v: m[0].toLowerCase() }); i += m[0].length; continue; }
			if ('+-*/^!%(),'.indexOf(c) >= 0) { out.push({ k: 'op', v: c }); i++; continue; }
			throw new Error('Unexpected “' + c + '”');
		}
		return out;
	}

	// evaluate("2(3+4)^2 + 10%", {deg:true, ans:0}) -> number.  Throws Error with a readable message.
	function evaluate(src, opt) {
		opt = opt || {};
		var t = tokenize(src), i = 0;
		if (!t.length) throw new Error('Type an expression');
		function isOp(v) { return t[i] && t[i].k === 'op' && t[i].v === v; }
		function eat(v) { if (isOp(v)) { i++; return true; } return false; }
		function toRad(x) { return opt.deg ? x * Math.PI / 180 : x; }
		function fromRad(x) { return opt.deg ? x * 180 / Math.PI : x; }
		function snap(x) { return Math.abs(x) < 1e-14 ? 0 : x; }
		var TRIG = {
			sin: function (x) { return snap(Math.sin(toRad(x))); }, cos: function (x) { return snap(Math.cos(toRad(x))); },
			tan: function (x) { var r = toRad(x); if (Math.abs(Math.cos(r)) < 1e-14) throw new Error('tan is undefined here'); return snap(Math.tan(r)); },
			asin: function (x) { if (Math.abs(x) > 1) throw new Error('asin needs a value from -1 to 1'); return fromRad(Math.asin(x)); },
			acos: function (x) { if (Math.abs(x) > 1) throw new Error('acos needs a value from -1 to 1'); return fromRad(Math.acos(x)); },
			atan: function (x) { return fromRad(Math.atan(x)); }
		};
		function expr() {
			var l = term();
			for (;;) {
				if (isOp('+') || isOp('-')) {
					var sign = t[i].v === '+' ? 1 : -1, start = ++i, r = term();
					var pct = (i - start === 2 && t[start].k === 'num' && t[i - 1].v === '%');   // 200 + 10%  ->  200 + 10% of 200
					l = l + sign * (pct ? l * r : r);
				} else return l;
			}
		}
		function startsFactor() { var x = t[i]; return x && (x.k === 'num' || (x.k === 'id' && x.v !== 'mod') || (x.k === 'op' && x.v === '(')); }
		function term() {
			var l = unary();
			for (;;) {
				if (eat('*')) l *= unary();
				else if (eat('/')) { var d = unary(); if (d === 0) throw new Error('Cannot divide by zero'); l /= d; }
				else if (t[i] && t[i].k === 'id' && t[i].v === 'mod') { i++; var m = unary(); if (m === 0) throw new Error('Cannot divide by zero'); l = l - m * Math.floor(l / m); }
				else if (startsFactor()) l *= unary();                      // 2(3+4), 2pi, 3sin(30)
				else return l;
			}
		}
		function unary() { if (eat('-')) return -unary(); if (eat('+')) return unary(); return power(); }
		function power() { var b = postfix(); if (eat('^')) return Math.pow(b, unary()); return b; }   // right-associative; -2^2 = -4
		function postfix() {
			var v = primary();
			for (;;) {
				if (eat('!')) v = fact(v);
				else if (eat('%')) v = v / 100;
				else return v;
			}
		}
		function args() {
			var a = [];
			if (eat('(')) {
				if (!isOp(')')) { do { a.push(expr()); } while (eat(',')); }
				if (!eat(')') && i < t.length) throw new Error('Missing )');   // a missing ) at the very end is closed for you
			} else a.push(unary());                                          // sqrt 16, sin 30
			return a;
		}
		function primary() {
			var x = t[i];
			if (!x) throw new Error('Unfinished expression');
			if (x.k === 'num') { i++; return x.v; }
			if (x.k === 'op' && x.v === '(') {
				i++; var v = expr();
				if (!eat(')') && i < t.length) throw new Error('Missing )');
				return v;
			}
			if (x.k === 'id') {
				var name = ALIAS[x.v] || x.v; i++;
				if (name === 'ans') return opt.ans || 0;
				if (CONST.hasOwnProperty(name)) return CONST[name];
				var a;
				if (TRIG.hasOwnProperty(name)) { a = args(); return TRIG[name](a[0]); }
				if (FN1.hasOwnProperty(name)) { a = args(); return FN1[name](a[0]); }
				if (FNX.hasOwnProperty(name)) { a = args(); return FNX[name](a); }
				throw new Error('Unknown “' + x.v + '”');
			}
			throw new Error('Unexpected “' + x.v + '”');
		}
		var r = expr();
		if (i < t.length) throw new Error(t[i].v === ')' ? 'Extra )' : 'Unexpected “' + t[i].v + '”');
		if (r !== r) throw new Error('Not a number');
		return r;
	}

	/* ---------- exact decimal arithmetic with BigInt ---------- */
	function parseDec(str) {                    // "-12,345.60" -> {m: -1234560n, s: 2} ; null if not a plain decimal
		var m = /^([+-]?)(\d*)\.?(\d*)$/.exec(String(str).replace(/[,\s_]/g, ''));
		if (!m || (m[2] === '' && m[3] === '')) return null;
		var v = BigInt((m[2] || '0') + m[3]);
		return { m: m[1] === '-' ? -v : v, s: m[3].length };
	}
	function decToString(m, s) {                // bigint mantissa + scale -> plain string, trailing zeros trimmed
		var neg = m < 0n; if (neg) m = -m;
		var d = m.toString();
		if (s > 0) { d = d.padStart(s + 1, '0'); d = d.slice(0, d.length - s) + '.' + d.slice(d.length - s); d = d.replace(/\.?0+$/, ''); }
		return (neg && d !== '0' ? '-' : '') + d;
	}
	function mulExact(a, b) { return decToString(a.m * b.m, a.s + b.s); }
	function addExact(a, b) { var s = Math.max(a.s, b.s); return decToString(a.m * 10n ** BigInt(s - a.s) + b.m * 10n ** BigInt(s - b.s), s); }
	// long division a / b -> {text, repeating, exact}. Detects repeating cycles (1/7 = 0.(142857)); caps the digits shown.
	function divExact(a, b, maxDigits) {
		maxDigits = maxDigits || 30;
		if (b.m === 0n) throw new Error('Cannot divide by zero');
		var num = a.m * 10n ** BigInt(b.s), den = b.m * 10n ** BigInt(a.s);
		var neg = (num < 0n) !== (den < 0n);
		if (num < 0n) num = -num; if (den < 0n) den = -den;
		var ip = num / den, rem = num % den, digits = '', seen = {}, repeatAt = -1, k = 0;
		while (rem !== 0n && k < 2000) {
			var key = rem.toString();
			if (seen[key] !== undefined) { repeatAt = seen[key]; break; }
			seen[key] = k;
			rem *= 10n; digits += (rem / den).toString(); rem %= den; k++;
		}
		var sign = neg && (ip !== 0n || digits.replace(/0/g, '')) ? '-' : '';
		if (rem === 0n) return { text: sign + ip.toString() + (digits ? '.' + digits : ''), repeating: false, exact: true };
		if (repeatAt >= 0) {
			var pre = digits.slice(0, repeatAt), cyc = digits.slice(repeatAt);
			var full = sign + ip + '.' + pre + '(' + cyc + ')';
			if (full.length > maxDigits + 12) return { text: sign + ip + '.' + (pre + cyc + cyc).slice(0, maxDigits) + '…', repeating: true, exact: false, cycle: cyc.length, full: full };
			return { text: full, repeating: true, exact: true, cycle: cyc.length, full: full };
		}
		return { text: sign + ip + '.' + digits.slice(0, maxDigits) + '…', repeating: false, exact: false };
	}

	/* ---------- primes, factors, roots ---------- */
	function factorize(n) {                      // n: integer 2..2^53 -> [[p, e], ...]
		var out = [], e;
		for (var p = 2; p <= 3; p++) { e = 0; while (n % p === 0) { n /= p; e++; } if (e) out.push([p, e]); }
		for (var f = 5; f * f <= n; f += 6) {
			for (var q = f; q <= f + 2; q += 2) { e = 0; while (n % q === 0) { n /= q; e++; } if (e) out.push([q, e]); }
		}
		if (n > 1) out.push([n, 1]);
		return out;
	}
	function divisors(n) {
		var f = factorize(n), d = [1];
		f.forEach(function (pe) { var cur = d.slice(), pw = 1; for (var k = 1; k <= pe[1]; k++) { pw *= pe[0]; cur.forEach(function (x) { d.push(x * pw); }); } });
		return d.sort(function (a, b) { return a - b; });
	}
	function radical(n) {                         // sqrt(n) = outside * sqrt(inside)
		var out = 1, inn = 1;
		factorize(n).forEach(function (pe) { out *= Math.pow(pe[0], Math.floor(pe[1] / 2)); if (pe[1] % 2) inn *= pe[0]; });
		return { out: out, inside: inn };
	}

	/* ---------- fractions (BigInt) ---------- */
	function frac(n, d) {
		if (d === 0n) throw new Error('A denominator cannot be 0');
		if (d < 0n) { n = -n; d = -d; }
		var g = bgcd(n, d); return { n: n / g, d: d / g };
	}
	function fracToString(f) { return f.d === 1n ? f.n.toString() : f.n + '/' + f.d; }
	function fracMixed(f) {
		var w = f.n / f.d, r = f.n % f.d; if (r < 0n) r = -r;
		if (f.d === 1n || w === 0n) return null;
		return w + ' ' + r + '/' + f.d;
	}
	function decToFrac(str) { var p = parseDec(str); return p ? frac(p.m, 10n ** BigInt(p.s)) : null; }
	function approxFrac(x, maxDen) {              // best rational approximation by continued fractions
		var neg = x < 0; x = Math.abs(x);
		var h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = x, a;
		for (var i = 0; i < 40; i++) {
			a = Math.floor(b);
			var h2 = a * h1 + h0, k2 = a * k1 + k0;
			if (k2 > maxDen) break;
			h0 = h1; h1 = h2; k0 = k1; k1 = k2;
			if (Math.abs(x - h1 / k1) < 1e-12 * Math.max(1, x)) break;
			var fr = b - a; if (fr < 1e-12) break; b = 1 / fr;
		}
		return k1 ? { n: BigInt((neg ? -1 : 1) * h1), d: BigInt(k1) } : null;
	}

	/* ---------- bases and roman numerals ---------- */
	var DIG = '0123456789abcdefghijklmnopqrstuvwxyz';
	function parseBase(str, base) {
		str = String(str).trim().toLowerCase().replace(/[\s_,]/g, '').replace(/^0[xbo]/, '');
		var neg = false; if (str[0] === '-') { neg = true; str = str.slice(1); }
		if (!str) return null;
		var v = 0n, B = BigInt(base);
		for (var i = 0; i < str.length; i++) { var d = DIG.indexOf(str[i]); if (d < 0 || d >= base) return null; v = v * B + BigInt(d); }
		return neg ? -v : v;
	}
	function toBase(v, base) {
		var neg = v < 0n; if (neg) v = -v;
		if (v === 0n) return '0';
		var B = BigInt(base), s = '';
		while (v > 0n) { s = DIG[Number(v % B)] + s; v /= B; }
		return (neg ? '-' : '') + s;
	}
	var ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
	function toRoman(n) { if (n < 1 || n > 3999 || n !== Math.floor(n)) return null; var s = ''; ROMAN.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } }); return s; }
	function fromRoman(s) {
		s = String(s).toUpperCase().replace(/\s/g, ''); if (!/^[MDCLXVI]+$/.test(s)) return null;
		var v = 0, vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
		for (var i = 0; i < s.length; i++) { var c = vals[s[i]], nx = vals[s[i + 1]] || 0; v += c < nx ? -c : c; }
		return toRoman(v) === s ? v : null;          // reject non-canonical forms like IIII or VX
	}

	/* ---------- list statistics ---------- */
	function parseList(text) { return (String(text).match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || []).map(parseFloat); }
	function stats(a) {
		var n = a.length, sum = a.reduce(function (s, v) { return s + v; }, 0), mean = sum / n;
		var s = a.slice().sort(function (x, y) { return x - y; });
		var median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
		var cnt = {}, best = 0; a.forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; if (cnt[v] > best) best = cnt[v]; });
		var mode = best > 1 ? Object.keys(cnt).filter(function (k) { return cnt[k] === best; }).map(Number).sort(function (x, y) { return x - y; }) : [];
		var ss = a.reduce(function (acc, v) { return acc + (v - mean) * (v - mean); }, 0);
		return { n: n, sum: sum, mean: mean, median: median, mode: mode, min: s[0], max: s[n - 1], range: s[n - 1] - s[0],
			product: a.reduce(function (p, v) { return p * v; }, 1), varPop: ss / n, sdPop: Math.sqrt(ss / n),
			varSample: n > 1 ? ss / (n - 1) : NaN, sdSample: n > 1 ? Math.sqrt(ss / (n - 1)) : NaN, sorted: s };
	}

	return { fmt: fmt, group: group, gfmt: gfmt, evaluate: evaluate, gcd: gcd, lcm: lcm, bgcd: bgcd, fact: fact, nCr: nCr, nPr: nPr,
		parseDec: parseDec, decToString: decToString, mulExact: mulExact, addExact: addExact, divExact: divExact,
		factorize: factorize, divisors: divisors, radical: radical, frac: frac, fracToString: fracToString, fracMixed: fracMixed,
		decToFrac: decToFrac, approxFrac: approxFrac, parseBase: parseBase, toBase: toBase, toRoman: toRoman, fromRoman: fromRoman,
		parseList: parseList, stats: stats };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MC;
