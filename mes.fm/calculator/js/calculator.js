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

/* MES Calculator UI (maths lives in lib.js, prepended above as MC) */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-calculator:v1';
	var state = { deg: true, hist: [], tab: 'muldiv', sci: true, sciPick: false };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) { for (var k in saved) if (k in state) state[k] = saved[k]; } } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

	var expr = $('mc-expr'), live = $('mc-live'), ans = 0, lastText = '';
	var toastTimer;
	function toast(msg) { var t = $('mc-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1500); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
		function fallback() {
			var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
			ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta);
		}
	}
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
	function stat(label, value, sub, hero) {
		return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>';
	}
	function note(msg) { return '<p class="tu-note" style="grid-column:1/-1;margin:0;">' + msg + '</p>'; }
	function num(id) { var v = String($(id).value).replace(/[,\s]/g, ''); if (v === '') return NaN; return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v) ? parseFloat(v) : NaN; }
	function onInput(ids, fn) { ids.forEach(function (id) { $(id).addEventListener('input', fn); $(id).addEventListener('change', fn); }); }
	var G = MC.gfmt;

	/* ---------- main calculator ---------- */
	function compute(text) {
		try { return { v: MC.evaluate(text, { deg: state.deg, ans: ans }) }; } catch (e) { return { err: e.message }; }
	}
	function showLive() {
		var text = expr.value.trim();
		live.className = 'mc-live';
		if (!text) { live.innerHTML = '&nbsp;'; lastText = ''; return; }
		var r = compute(text);
		if (r.err) {
			// stay quiet while the person is still typing something unfinished
			if (/^(Unfinished|Unexpected “[)]”|Type an)/.test(r.err) || /[-+*/^×÷−(,]$/.test(text)) { live.className = 'mc-live is-dim'; live.innerHTML = '&nbsp;'; }
			else { live.className = 'mc-live is-err'; live.textContent = r.err; }
			lastText = ''; return;
		}
		lastText = G(r.v); live.textContent = '= ' + lastText;
	}
	function addHistory(e, r) {
		state.hist = state.hist.filter(function (h) { return h[0] !== e; });
		state.hist.unshift([e, r]); state.hist = state.hist.slice(0, 30); save(); renderHist();
	}
	function renderHist() {
		var ul = $('mc-hist'); $('mc-hist-card').hidden = !state.hist.length;
		ul.innerHTML = state.hist.map(function (h, i) { return '<li data-i="' + i + '" title="Click to reuse"><span class="mc-h-e">' + esc(h[0]) + '</span><span class="mc-h-r">= ' + esc(G(h[1])) + '</span></li>'; }).join('');
	}
	function equals() {
		var text = expr.value.trim(); if (!text) return;
		var r = compute(text);
		if (r.err) { showLive(); return; }
		ans = r.v; addHistory(text, r.v);
		expr.value = MC.fmt(r.v); live.className = 'mc-live'; live.textContent = '= ' + G(r.v); lastText = G(r.v);
		expr.dataset.fresh = '1'; expr.scrollLeft = 0;
	}
	function toEnd(p) { if (p >= expr.value.length) expr.scrollLeft = expr.scrollWidth; }
	function insert(s) {
		var fresh = expr.dataset.fresh === '1'; delete expr.dataset.fresh;
		if (fresh && /^[0-9.π(]|^[a-z]/i.test(s) && !/^(\^|!|%)/.test(s)) expr.value = '';   // typing a new number after "=" starts over; an operator continues the answer
		var a = expr.selectionStart == null ? expr.value.length : expr.selectionStart, b = expr.selectionEnd == null ? a : expr.selectionEnd;
		expr.value = expr.value.slice(0, a) + s + expr.value.slice(b);
		var p = a + s.length; try { expr.setSelectionRange(p, p); } catch (e) {}
		showLive(); toEnd(p);
		if (!coarse.matches) expr.focus();
	}
	$('mc-pad').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });   // keep the caret in the field
	$('mc-pad').addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		if (b.dataset.ins != null) { insert(b.dataset.ins); return; }
		var act = b.dataset.act;
		if (act === 'eq') equals();
		else if (act === 'clear') { expr.value = ''; delete expr.dataset.fresh; showLive(); }
		else if (act === 'back') {
			var a = expr.selectionStart == null ? expr.value.length : expr.selectionStart, z = expr.selectionEnd == null ? a : expr.selectionEnd;
			if (a === z && a > 0) a--; expr.value = expr.value.slice(0, a) + expr.value.slice(z); try { expr.setSelectionRange(a, a); } catch (e2) {} showLive(); toEnd(a);
		}
	});
	expr.addEventListener('input', function () { delete expr.dataset.fresh; showLive(); });
	expr.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') { e.preventDefault(); equals(); }
		else if (e.key === 'Escape') { expr.value = ''; showLive(); }
	});
	$('mc-hist').addEventListener('click', function (e) { var li = e.target.closest('li'); if (!li) return; var h = state.hist[+li.dataset.i]; expr.value = h[0]; ans = h[1]; delete expr.dataset.fresh; showLive(); expr.focus(); });
	$('mc-hist-clear').addEventListener('click', function () { state.hist = []; save(); renderHist(); });
	$('mc-copy').addEventListener('click', function () { if (lastText) copy(lastText.replace(/,/g, ''), 'Result copied'); else toast('Nothing to copy yet'); });
	$('mc-link').addEventListener('click', function () {
		var u = location.origin + location.pathname + (expr.value.trim() ? '?q=' + encodeURIComponent(expr.value.trim()) : ''); copy(u, 'Link copied');
	});
	function setAngle() { Array.prototype.forEach.call($('mc-angle').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String((b.dataset.deg === '1') === state.deg)); }); }
	$('mc-angle').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; state.deg = b.dataset.deg === '1'; save(); setAngle(); showLive(); });
	var compact = window.matchMedia('(max-width:700px), (max-height:800px)'), coarse = window.matchMedia('(pointer: coarse)');
	var sciOn = true;
	function applySci() { $('mc-sci').hidden = !sciOn; $('mc-sci-toggle').setAttribute('aria-pressed', String(sciOn)); }
	function setSci() {
		if (state.sciPick) sciOn = !!state.sci;
		else {   // no explicit choice yet: on a phone-sized / short screen hide the scientific rows when display + full keypad would not fit the viewport
			sciOn = true; applySci();
			if (compact.matches) { var d = $('mc-display').getBoundingClientRect(), p = $('mc-pad').getBoundingClientRect(); if (p.bottom - d.top > window.innerHeight - 70) sciOn = false; }
		}
		applySci();
	}
	$('mc-sci-toggle').addEventListener('click', function () { sciOn = !sciOn; state.sci = sciOn; state.sciPick = true; save(); applySci(); });

	/* on touch screens the field is read-only while the keypad is used (no system keyboard popping up); the Keyboard chip / tapping the field turns it on */
	function setKbd(on) {
		expr.readOnly = !on; expr.setAttribute('inputmode', on ? 'text' : 'none'); $('mc-kbd').setAttribute('aria-pressed', String(on));
		if (on) expr.focus(); else expr.blur();
	}
	if (coarse.matches) { $('mc-kbd').hidden = false; setKbd(false); }
	$('mc-kbd').addEventListener('click', function () { setKbd(expr.readOnly); });
	expr.addEventListener('click', function () { if (expr.readOnly && coarse.matches) setKbd(true); });

	/* ---------- tabs ---------- */
	function setTab(name) {
		state.tab = name; save();
		Array.prototype.forEach.call($('mc-tabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === name)); });
		Array.prototype.forEach.call(document.querySelectorAll('.mc-panel'), function (p) { p.hidden = p.id !== 'p-' + name; });
	}
	$('mc-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });

	/* ---------- multiply & divide ---------- */
	function mulDiv() {
		var out = $('md-out'), a = MC.parseDec($('md-a').value), b = MC.parseDec($('md-b').value);
		if (!a || !b) { out.innerHTML = note('Enter two numbers.'); return; }
		var h = stat('A × B', esc(MC.group(MC.mulExact(a, b))), 'exact product', true);
		var sum = MC.addExact(a, b), diff = MC.addExact(a, { m: -b.m, s: b.s });
		var q;
		if (b.m === 0n) h += stat('A ÷ B', 'undefined', 'cannot divide by zero');
		else {
			q = MC.divExact(a, b, 30);
			var sub = q.repeating ? 'repeating decimal' + (q.cycle ? ' (cycle of ' + q.cycle + ')' : '') : q.exact ? 'exact' : 'first 30 digits';
			h += stat('A ÷ B', esc(q.text.indexOf('(') >= 0 || q.text.slice(-1) === '…' ? q.text : MC.group(q.text)), sub, true);
			if (a.s === 0 && b.s === 0) {
				var qq = a.m / b.m, rr = a.m % b.m;
				h += stat('Quotient &amp; remainder', esc(MC.group(qq.toString())) + ' r ' + esc(rr.toString()), esc(a.m + ' = ' + b.m + ' × ' + qq + (rr === 0n ? '' : ' + ' + rr)));
			}
		}
		h += stat('A + B', esc(MC.group(sum))) + stat('A − B', esc(MC.group(diff)));
		if (b.m !== 0n) { var pct = MC.divExact({ m: a.m * 100n, s: a.s }, b, 10); h += stat('A as a % of B', esc(pct.text) + '%'); }
		out.innerHTML = h;
	}
	function mulTable() {
		var n = MC.parseDec($('mt-n').value), k = Math.max(1, Math.min(100, parseInt($('mt-k').value, 10) || 12)), out = $('mt-out');
		if (!n) { out.innerHTML = ''; return; }
		var h = ''; for (var i = 1; i <= k; i++) h += '<div>' + esc(MC.group(MC.decToString(n.m, n.s))) + ' × ' + i + ' = <b>' + esc(MC.group(MC.mulExact(n, { m: BigInt(i), s: 0 }))) + '</b></div>';
		out.innerHTML = h;
	}
	onInput(['md-a', 'md-b'], mulDiv); onInput(['mt-n', 'mt-k'], mulTable);

	/* ---------- squares & roots ---------- */
	function squares() {
		var n = num('sq-n'), k = num('sq-k'), out = $('sq-out');
		if (n !== n) { out.innerHTML = note('Enter a number.'); return; }
		var h = stat('n²', G(n * n), 'n × n', true) + stat('n³', G(n * n * n), 'n × n × n', true);
		var sqrtTxt = n >= 0 ? G(Math.sqrt(n)) : G(Math.sqrt(-n)) + ' i', sub = '';
		if (n >= 0 && Number.isInteger(n) && n <= 9007199254740991) {
			var s = Math.round(Math.sqrt(n));
			if (s * s === n) sub = 'a perfect square (' + G(s) + ' × ' + G(s) + ')';
			else if (n > 1) { var r = MC.radical(n); if (r.out > 1) sub = 'simplified: ' + r.out + '√' + r.inside; else sub = 'already in simplest radical form'; }
		} else if (n < 0) sub = 'imaginary: ' + G(Math.sqrt(-n)) + 'i';
		h += stat('Square root √n', esc(sqrtTxt), esc(sub)) + stat('Cube root ∛n', G(Math.cbrt(n)));
		h += stat('Reciprocal 1/n', n === 0 ? 'undefined' : G(1 / n));
		if (k === k) {
			h += stat('n to the power ' + esc(G(k)), G(Math.pow(n, k)), 'nⁿ with n = ' + esc(G(k)));
			var rt = (n < 0 && k % 2 !== 0) ? -Math.pow(-n, 1 / k) : Math.pow(n, 1 / k);
			h += stat(esc(G(k)) + '-th root of n', k === 0 ? 'undefined' : G(rt));
		}
		out.innerHTML = h;
	}
	onInput(['sq-n', 'sq-k'], squares);
	(function () {
		var rows = ''; for (var i = 1; i <= 25; i++) rows += '<tr><td>' + i + '</td><td>' + i * i + '</td><td>' + i * i * i + '</td><td>' + MC.fmt(Math.sqrt(i)) + '</td><td>' + MC.fmt(Math.cbrt(i)) + '</td></tr>';
		$('sq-table').querySelector('tbody').innerHTML = rows;
	})();

	/* ---------- powers & logs ---------- */
	function powers() {
		var b = num('pw-b'), e = num('pw-e'), out = $('pw-out');
		if (b !== b || e !== e) { out.innerHTML = note('Enter a base and an exponent.'); return; }
		var p = Math.pow(b, e);
		var h = stat(esc(G(b)) + ' ^ ' + esc(G(e)), p === p ? G(p) : 'not a real number', '', true);
		if (Number.isInteger(b) && Number.isInteger(e) && e >= 0 && e <= 2000 && Math.abs(b) < 1e6) h += stat('Exact value', esc(MC.group(((BigInt(b)) ** BigInt(e)).toString().slice(0, 400))), 'whole-number power, no rounding');
		h += stat('e ^ ' + esc(G(e)), G(Math.exp(e))) + stat('10 ^ ' + esc(G(e)), G(Math.pow(10, e))) + stat('2 ^ ' + esc(G(e)), G(Math.pow(2, e)));
		out.innerHTML = h;
	}
	function logs() {
		var y = num('lg-y'), b = num('lg-b'), out = $('lg-out');
		if (y !== y) { out.innerHTML = note('Enter a value.'); return; }
		if (y <= 0) { out.innerHTML = note('Logarithms need a positive value.'); return; }
		var h = '';
		if (b === b && b > 0 && b !== 1) h += stat('log base ' + esc(G(b)) + ' of ' + esc(G(y)), G(Math.log(y) / Math.log(b)), '', true);
		h += stat('ln (base e)', G(Math.log(y)), '', !(b === b && b > 0 && b !== 1)) + stat('log₁₀', G(Math.log10(y))) + stat('log₂', G(Math.log2(y)));
		var ex = Math.floor(Math.log10(y)), man = y / Math.pow(10, ex), eng = Math.floor(ex / 3) * 3;
		h += stat('Scientific notation', esc(MC.fmt(man) + ' × 10^' + ex), 'e-notation: ' + esc(MC.fmt(y).indexOf('e') >= 0 ? MC.fmt(y) : MC.fmt(man) + 'e' + ex));
		h += stat('Engineering notation', esc(MC.fmt(y / Math.pow(10, eng)) + ' × 10^' + eng), 'exponent is a multiple of 3');
		out.innerHTML = h;
	}
	onInput(['pw-b', 'pw-e'], powers); onInput(['lg-y', 'lg-b'], logs);

	/* ---------- fractions ---------- */
	function big(id) { var v = $(id).value.replace(/[,\s]/g, ''); return /^[-+]?\d+$/.test(v) ? BigInt(v) : null; }
	function fractions() {
		var an = big('fr-an'), ad = big('fr-ad'), bn = big('fr-bn'), bd = big('fr-bd'), op = $('fr-op').value, out = $('fr-out');
		if (an === null || ad === null || bn === null || bd === null) { out.innerHTML = note('Use whole numbers for the numerators and denominators.'); return; }
		if (ad === 0n || bd === 0n) { out.innerHTML = note('A denominator cannot be 0.'); return; }
		var A = MC.frac(an, ad), B = MC.frac(bn, bd), R;
		if (op === '+') R = MC.frac(A.n * B.d + B.n * A.d, A.d * B.d);
		else if (op === '-') R = MC.frac(A.n * B.d - B.n * A.d, A.d * B.d);
		else if (op === '*') R = MC.frac(A.n * B.n, A.d * B.d);
		else { if (B.n === 0n) { out.innerHTML = note('Cannot divide by zero.'); return; } R = MC.frac(A.n * B.d, A.d * B.n); }
		var dec = MC.divExact({ m: R.n, s: 0 }, { m: R.d, s: 0 }, 20);
		var h = stat('Result', esc(MC.fracToString(R)), 'simplified', true);
		var mixed = MC.fracMixed(R); if (mixed) h += stat('Mixed number', esc(mixed));
		h += stat('Decimal', esc(dec.text), dec.repeating ? 'repeating' : '') + stat('Percent', esc(MC.divExact({ m: R.n * 100n, s: 0 }, { m: R.d, s: 0 }, 10).text) + '%');
		out.innerHTML = h;
	}
	function decFrac() {
		var s = $('df-x').value.trim(), out = $('df-out'), f = MC.decToFrac(s);
		if (!f) { out.innerHTML = note('Enter a decimal such as 0.375 or 2.5.'); return; }
		var h = stat('Exact fraction', esc(MC.fracToString(f)), 'from the digits you typed', true), mixed = MC.fracMixed(f);
		if (mixed) h += stat('Mixed number', esc(mixed));
		var x = parseFloat(s.replace(/,/g, '')), ap = MC.approxFrac(x, 1000);
		if (ap && MC.fracToString(ap) !== MC.fracToString(f)) h += stat('Closest simple fraction', esc(MC.fracToString(ap)), 'denominator up to 1000 (0.333333 → 1/3)');
		out.innerHTML = h;
	}
	onInput(['fr-an', 'fr-ad', 'fr-bn', 'fr-bd', 'fr-op'], fractions); onInput(['df-x'], decFrac);

	/* ---------- factors & primes ---------- */
	function factors() {
		var v = $('fa-n').value.replace(/[,\s]/g, ''), out = $('fa-out');
		if (!/^\d+$/.test(v)) { out.innerHTML = note('Enter a whole number (1 or more).'); return; }
		var n = Number(v);
		if (n < 1) { out.innerHTML = note('Enter a whole number (1 or more).'); return; }
		if (n > 9007199254740991) { out.innerHTML = note('That is too large — try a number below 9,007,199,254,740,991.'); return; }
		var f = n > 1 ? MC.factorize(n) : [], prime = f.length === 1 && f[0][1] === 1;
		var h = stat('Is it prime?', n === 1 ? 'Neither' : prime ? 'Yes' : 'No', n === 1 ? '1 is neither prime nor composite' : prime ? esc(G(n)) + ' is a prime number' : 'composite number', true);
		if (n > 1) h += stat('Prime factorization', esc(f.map(function (pe) { return pe[1] > 1 ? pe[0] + '^' + pe[1] : pe[0]; }).join(' × ')), f.length ? esc(f.map(function (pe) { return Array(pe[1] + 1).join(pe[0] + ' × '); }).join('').replace(/ × $/, '')) : '');
		if (n <= 1e12) {
			var d = MC.divisors(n), sum = d.reduce(function (s, x) { return s + x; }, 0);
			h += stat('Number of factors', String(d.length), 'sum of factors: ' + esc(G(sum)));
			h += stat('All factors', '<span style="font-size:0.6em;font-weight:400;line-height:1.5;">' + esc(d.slice(0, 200).map(G).join(', ') + (d.length > 200 ? ', …' : '')) + '</span>');
			var s = Math.round(Math.sqrt(n)); h += stat('Perfect square?', s * s === n ? 'Yes (' + G(s) + '²)' : 'No', n > 1 && s * s !== n ? '√' + esc(G(n)) + ' = ' + (MC.radical(n).out > 1 ? MC.radical(n).out + '√' + MC.radical(n).inside : '√' + MC.radical(n).inside) : '');
		}
		out.innerHTML = h;
	}
	function gcdLcm() {
		var a = MC.parseList($('gl-list').value).filter(function (x) { return Number.isInteger(x) && x > 0 && x <= 9007199254740991; }), out = $('gl-out');
		if (a.length < 2) { out.innerHTML = note('Enter at least two positive whole numbers.'); return; }
		var g = a.reduce(MC.gcd), l = a.reduce(MC.lcm);
		out.innerHTML = stat('GCD (greatest common divisor)', G(g), 'also called HCF', true) + stat('LCM (least common multiple)', l > 9007199254740991 ? 'too large' : G(l), '', true);
	}
	onInput(['fa-n'], factors); onInput(['gl-list'], gcdLcm);

	/* ---------- bases & roman ---------- */
	function bases() {
		var out = $('bs-out'), from = parseInt($('bs-from').value, 10), v = MC.parseBase($('bs-v').value, from), to = parseInt($('bs-to').value, 10);
		if (v === null) { out.innerHTML = note('That is not a valid base-' + from + ' number.'); return; }
		var h = stat('Decimal', esc(MC.group(v.toString())), '', true) + stat('Binary', '<span style="font-size:0.7em;">' + esc(MC.toBase(v, 2)) + '</span>') + stat('Octal', esc(MC.toBase(v, 8))) + stat('Hexadecimal', esc(MC.toBase(v, 16).toUpperCase()));
		if (to >= 2 && to <= 36) h += stat('Base ' + to, esc(MC.toBase(v, to).toUpperCase()));
		out.innerHTML = h;
	}
	function roman() {
		var s = $('ro-v').value.trim(), out = $('ro-out');
		if (/^\d+$/.test(s)) { var r = MC.toRoman(parseInt(s, 10)); out.innerHTML = r ? stat('Roman numeral', esc(r), '', true) : note('Roman numerals cover 1 to 3999.'); }
		else if (s) { var n = MC.fromRoman(s); out.innerHTML = n ? stat('Number', String(n), esc(s.toUpperCase()), true) : note('That is not a standard Roman numeral.'); }
		else out.innerHTML = '';
	}
	onInput(['bs-v', 'bs-from', 'bs-to'], bases); onInput(['ro-v'], roman);

	/* ---------- list statistics ---------- */
	function listStats() {
		var a = MC.parseList($('st-list').value), out = $('st-out');
		if (!a.length) { out.innerHTML = note('Enter some numbers.'); return; }
		var s = MC.stats(a);
		var h = stat('Mean (average)', G(s.mean), 'sum ÷ count', true) + stat('Median', G(s.median), '', true) + stat('Mode', s.mode.length ? esc(s.mode.map(G).join(', ')) : 'none', s.mode.length ? '' : 'no value repeats');
		h += stat('Count', String(s.n)) + stat('Sum', G(s.sum)) + stat('Product', G(s.product)) + stat('Minimum', G(s.min)) + stat('Maximum', G(s.max)) + stat('Range', G(s.range));
		h += stat('Std. deviation (population)', G(s.sdPop), 'variance ' + G(s.varPop)) + (s.n > 1 ? stat('Std. deviation (sample)', G(s.sdSample), 'variance ' + G(s.varSample)) : '');
		h += stat('Sorted', '<span style="font-size:0.6em;font-weight:400;line-height:1.5;">' + esc(s.sorted.slice(0, 200).map(G).join(', ')) + '</span>');
		out.innerHTML = h;
	}
	onInput(['st-list'], listStats);

	/* ---------- start-up ---------- */
	var q = new URLSearchParams(location.search);
	if (q.get('q')) expr.value = q.get('q').slice(0, 500);
	var wantTab = q.get('tab'); if (wantTab && $('p-' + wantTab)) state.tab = wantTab;
	setAngle(); setSci(); renderHist(); setTab(state.tab);
	mulDiv(); mulTable(); squares(); powers(); logs(); fractions(); decFrac(); factors(); gcdLcm(); bases(); roman(); listStats(); showLive();
})();
