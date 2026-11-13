/* MES Prime Numbers -- pure maths (global MESPrime; node: require). Exact BigInt arithmetic.
 * parse (expressions like 2^61-1, 10!+1, 1e9), isPrime (deterministic Miller-Rabin below 3.3e24, probable above),
 * factor (trial division + Pollard-Brent rho with a time budget), divisors / sigma / phi, gcd / lcm / Euclid steps / Bezout,
 * sieve, primes in a range (segmented), nth prime, pi(x) samples + li(x), number properties, Goldbach. Tests: tool_apps_src/primes-tests.js */
(function (root) {
	"use strict";
	var P = {};
	function abs(x) { return x < 0n ? -x : x; }
	P.group = function (s) { s = String(s); var neg = s[0] === "-"; if (neg) s = s.slice(1); var out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ","); return (neg ? "−" : "") + out; };
	var SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
	P.sup = function (n) { return String(n).split("").map(function (c) { return SUP[c] || c; }).join(""); };

	/* ---------- expression parser (BigInt) ---------- */
	P.MAXDIG = 3000;
	P.parse = function (src) {
		var s = String(src == null ? "" : src).replace(/[\s_,']/g, "").replace(/[×·∗]/g, "*").replace(/[−–]/g, "-").replace(/\*\*/g, "^");
		if (!s) return { err: "Type a whole number" };
		if (s.length > 400) return { err: "That is too long" };
		var i = 0;
		function fail(m) { throw new Error(m); }
		function big(x) { if (x.toString().length > P.MAXDIG + 2) fail("The number has more than " + P.MAXDIG + " digits"); return x; }
		function atom() {
			if (s[i] === "(") { i++; var v = expr(); if (s[i] !== ")") fail("A bracket is not closed"); i++; return v; }
			var m = /^\d+(\.\d+)?([eE]\d+)?/.exec(s.slice(i));
			if (!m) fail(i < s.length ? "I can't read “" + s[i] + "”" : "Something is missing at the end");
			i += m[0].length;
			if (m[1] || m[2]) {
				var parts = m[0].toLowerCase().split("e"), mant = parts[0], ex = parts[1] ? Number(parts[1]) : 0, dot = mant.indexOf(".");
				if (dot >= 0) { ex -= mant.length - dot - 1; mant = mant.replace(".", ""); }
				if (ex > P.MAXDIG) fail("The number has more than " + P.MAXDIG + " digits");
				var v2 = BigInt(mant);
				if (ex < 0) { var d = 10n ** BigInt(-ex); if (v2 % d) fail("Only whole numbers, please"); return v2 / d; }
				return v2 * 10n ** BigInt(ex);
			}
			return BigInt(m[0]);
		}
		function postfix() { var v = atom(); while (s[i] === "!") { i++; if (v < 0n || v > 1000n) fail("Factorials up to 1000! only"); var f = 1n; for (var k = 2n; k <= v; k++) f *= k; v = f; } return v; }
		function power() {
			var b = postfix();
			if (s[i] === "^") { i++; var e = unary(); if (e < 0n) fail("Negative powers are not whole numbers"); if (abs(b) > 1n && e > BigInt(Math.ceil(P.MAXDIG * 3.33))) fail("The number has more than " + P.MAXDIG + " digits"); return big(b ** e); }
			return b;
		}
		function unary() { if (s[i] === "-") { i++; return -unary(); } if (s[i] === "+") { i++; return unary(); } return power(); }
		function term() {
			var v = unary();
			while (s[i] === "*" || s[i] === "/" || s[i] === "%") {
				var op = s[i++], r = unary();
				if (op === "*") v = big(v * r);
				else { if (r === 0n) fail("Division by zero"); if (op === "/") { if (v % r) fail("That division does not come out whole"); v = v / r; } else v = ((v % r) + r) % r; }
			}
			return v;
		}
		function expr() { var v = term(); while (s[i] === "+" || s[i] === "-") { var op = s[i++], r = term(); v = op === "+" ? v + r : v - r; } return big(v); }
		try { var v = expr(); if (i < s.length) fail(s[i] === ")" ? "There is an extra “)”" : "I can't read “" + s.slice(i, i + 6) + "”"); return { v: v }; }
		catch (e) { return { err: e.message }; }
	};
	P.parseList = function (src) {
		var bits = String(src || "").split(/[\s,;]+/).filter(Boolean), out = [];
		for (var k = 0; k < bits.length; k++) { var r = P.parse(bits[k]); if (r.err) return { err: "“" + bits[k] + "”: " + r.err }; out.push(r.v); }
		return { v: out };
	};

	/* ---------- small primes ---------- */
	P.sieve = function (N) {
		N = Math.max(1, Math.floor(N)); var a = new Uint8Array(N + 1); a.fill(1, 2);
		for (var p = 2; p * p <= N; p++) if (a[p]) for (var q = p * p; q <= N; q += p) a[q] = 0;
		return a;
	};
	P.primesUpTo = function (N) { var s = P.sieve(N), out = []; for (var k = 2; k <= N; k++) if (s[k]) out.push(k); return out; };
	var SMALL = P.primesUpTo(10000), SMALLB = SMALL.map(BigInt);
	P.SMALL = SMALL;

	/* ---------- Miller-Rabin ---------- */
	function modpow(b, e, m) { var r = 1n; b %= m; if (b < 0n) b += m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
	P.modpow = modpow;
	var MRB = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
	var MRX = [43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n];
	var DET = 3317044064679887385961981n;   // bases 2..41 decide every n below this
	function mrPass(n, a, d, s) {
		var x = modpow(a, d, n); if (x === 1n || x === n - 1n) return true;
		for (var r = 1; r < s; r++) { x = x * x % n; if (x === n - 1n) return true; if (x === 1n) return false; }
		return false;
	}
	/* 'prime' | 'composite' | 'probable' (passed 33 Miller-Rabin rounds; no known counterexample, but not a proof) */
	P.test = function (n) {
		n = BigInt(n); if (n < 2n) return "composite";
		for (var k = 0; k < 168; k++) { var p = SMALLB[k]; if (n === p) return "prime"; if (n % p === 0n) return "composite"; }
		if (n < 1018081n) return "prime";   // 1009^2: every prime below 1000 has been tried
		var d = n - 1n, s = 0; while (!(d & 1n)) { d >>= 1n; s++; }
		for (var j = 0; j < MRB.length; j++) if (!mrPass(n, MRB[j], d, s)) return "composite";
		if (n < DET) return "prime";
		if (pow2(n + 1n) && P.MERSENNE.indexOf(n.toString(2).length) >= 0) return "prime";   // a known (proven) Mersenne prime
		for (j = 0; j < MRX.length; j++) if (!mrPass(n, MRX[j], d, s)) return "composite";
		return "probable";
	};
	P.MERSENNE = [2, 3, 5, 7, 13, 17, 19, 31, 61, 89, 107, 127, 521, 607, 1279, 2203, 2281, 3217, 4253, 4423, 9689, 9941, 11213, 19937, 21701, 23209, 44497, 86243, 110503, 132049, 216091];
	P.isPrime = function (n) { return P.test(n) !== "composite"; };
	P.witness = function (n) {   // for "why": the Miller-Rabin bases checked, and the first that proves n composite (if any)
		n = BigInt(n); var d = n - 1n, s = 0; while (!(d & 1n)) { d >>= 1n; s++; }
		var all = MRB.concat(n < DET ? [] : MRX);
		for (var j = 0; j < all.length; j++) if (!mrPass(n, all[j], d, s)) return { d: d, s: s, bad: all[j], tried: j + 1 };
		return { d: d, s: s, bad: null, tried: all.length };
	};

	/* ---------- factoring ---------- */
	function gcd(a, b) { a = abs(a); b = abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
	P.gcd = gcd;
	function rho(n, c, deadline) {
		var y = 2n, x = 2n, g = 1n, q = 1n, ys = 2n, r = 1, m = 64, f = function (v) { return (v * v + c) % n; }, it = 0;
		while (g === 1n) {
			x = y; for (var i = 0; i < r; i++) y = f(y);
			var k = 0;
			while (k < r && g === 1n) {
				ys = y; var lim = Math.min(m, r - k);
				for (i = 0; i < lim; i++) { y = f(y); q = q * abs(x - y) % n; }
				g = gcd(q, n); k += m; it += lim;
				if ((it & 1023) < lim && Date.now() > deadline) return null;
			}
			r *= 2;
		}
		if (g === n) { do { ys = f(ys); g = gcd(abs(x - ys), n); } while (g === 1n); }
		return g;
	}
	/* factor(n, {ms}) -> {f: [[p (BigInt), e]], rest: unfactored composite or null, probable: some factor only probable} */
	P.factor = function (n, opt) {
		n = abs(BigInt(n)); var ms = (opt && opt.ms) || 1500, deadline = Date.now() + ms, map = new Map(), rest = [], probable = false;
		function add(p, e) { var k = p.toString(); map.set(k, (map.get(k) || 0) + (e || 1)); }
		if (n < 2n) return { f: [], rest: null, probable: false };
		for (var k = 0; k < SMALLB.length && n > 1n; k++) {
			var p = SMALLB[k]; if (p * p > n) break;
			if (n % p === 0n) { var e = 0; while (n % p === 0n) { n /= p; e++; } add(p, e); }
		}
		var stack = n > 1n ? [n] : [];
		while (stack.length) {
			var m = stack.pop(), t = P.test(m);
			if (t !== "composite") { if (t === "probable") probable = true; add(m); continue; }
			var r = P.perfectPower(m); if (r) { for (var j = 0; j < r[1]; j++) stack.push(r[0]); continue; }
			var g = null;
			for (var c = 1n; c < 40n && !g; c++) { g = rho(m, c, deadline); if (g === null) break; if (g === m) g = null; }
			if (!g) { rest.push(m); continue; }
			stack.push(g, m / g);
		}
		var f = Array.from(map.entries()).map(function (x) { return [BigInt(x[0]), x[1]]; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
		var restN = rest.length ? rest.reduce(function (a, b) { return a * b; }, 1n) : null;
		return { f: f, rest: restN, probable: probable };
	};
	P.iroot = function (n, k) {   // floor(n^(1/k)) for n >= 0
		if (n < 2n) return n; var bits = n.toString(2).length, x = 1n << BigInt(Math.ceil(bits / k)), K = BigInt(k);
		while (true) { var y = ((K - 1n) * x + n / x ** (K - 1n)) / K; if (y >= x) break; x = y; }
		while (x ** K > n) x--; while ((x + 1n) ** K <= n) x++;
		return x;
	};
	P.perfectPower = function (n) {   // [base, k] with the largest k >= 2, or null
		n = BigInt(n); if (n < 4n) return null; var bits = n.toString(2).length, best = null;
		for (var k = 2; k <= bits; k++) { var r = P.iroot(n, k); if (r < 2n) break; if (r ** BigInt(k) === n) best = [r, k]; }
		return best;
	};
	P.fstr = function (f, plain) { return f.map(function (x) { return P.group(x[0].toString()) + (x[1] > 1 ? (plain ? "^" + x[1] : P.sup(x[1])) : ""); }).join(plain ? " * " : " × "); };
	P.numDivisors = function (f) { return f.reduce(function (a, x) { return a * BigInt(x[1] + 1); }, 1n); };
	P.sigma = function (f) { return f.reduce(function (a, x) { return a * ((x[0] ** BigInt(x[1] + 1) - 1n) / (x[0] - 1n)); }, 1n); };
	P.phi = function (f) { return f.reduce(function (a, x) { return a * (x[0] - 1n) * x[0] ** BigInt(x[1] - 1); }, 1n); };
	P.bigOmega = function (f) { return f.reduce(function (a, x) { return a + x[1]; }, 0); };
	P.divisors = function (f, limit) {
		if (P.numDivisors(f) > BigInt(limit || 20000)) return null;
		var d = [1n];
		f.forEach(function (x) { var cur = [], pk = 1n; for (var e = 0; e <= x[1]; e++) { d.forEach(function (v) { cur.push(v * pk); }); pk *= x[0]; } d = cur; });
		return d.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
	};

	/* ---------- gcd / lcm ---------- */
	P.lcm = function (a, b) { a = abs(a); b = abs(b); if (!a || !b) return 0n; return a / gcd(a, b) * b; };
	P.gcdAll = function (l) { return l.reduce(function (a, b) { return gcd(a, b); }, 0n); };
	P.lcmAll = function (l) { return l.length ? l.reduce(function (a, b) { return P.lcm(a, b); }) : 0n; };
	P.euclid = function (a, b) {   // rows [a, b, q, r] of a = q*b + r
		a = abs(a); b = abs(b); var rows = []; if (a < b) { var t = a; a = b; b = t; }
		while (b && rows.length < 2000) { var q = a / b, r = a % b; rows.push([a, b, q, r]); a = b; b = r; }
		return rows;
	};
	P.egcd = function (a, b) {   // [g, x, y] with a*x + b*y = g
		var r0 = a, r1 = b, s0 = 1n, s1 = 0n, t0 = 0n, t1 = 1n;
		while (r1) { var q = r0 / r1, t; t = r0 - q * r1; r0 = r1; r1 = t; t = s0 - q * s1; s0 = s1; s1 = t; t = t0 - q * t1; t0 = t1; t1 = t; }
		if (r0 < 0n) { r0 = -r0; s0 = -s0; t0 = -t0; }
		return [r0, s0, t0];
	};
	P.modInverse = function (a, m) { var e = P.egcd(((a % m) + m) % m, m); if (e[0] !== 1n) return null; return ((e[1] % m) + m) % m; };

	/* ---------- neighbours, ranges, counting ---------- */
	P.nextPrime = function (n) { n = BigInt(n); if (n < 2n) return 2n; var k = n + 1n; if (k > 2n && !(k & 1n)) k++; while (!P.isPrime(k)) k += k === 2n ? 1n : 2n; return k; };
	P.prevPrime = function (n) { n = BigInt(n); if (n <= 2n) return null; if (n === 3n) return 2n; var k = n - 1n; if (!(k & 1n)) k--; while (k > 2n && !P.isPrime(k)) k -= 2n; return k < 2n ? null : k; };
	P.RANGE_MAX = 1e13; P.SPAN_MAX = 5e6;
	/* primes in [a, b] (Numbers). Segmented sieve; b <= 1e13 and b - a <= 5e6. */
	P.primesBetween = function (a, b) {
		a = Math.max(2, Math.ceil(a)); b = Math.floor(b); if (b < a) return [];
		if (b > P.RANGE_MAX || b - a > P.SPAN_MAX) throw new Error("range too large");
		var base = P.primesUpTo(Math.floor(Math.sqrt(b)) + 1), len = b - a + 1, seg = new Uint8Array(len);
		for (var k = 0; k < base.length; k++) {
			var p = base[k], st = Math.max(p * p, Math.ceil(a / p) * p);
			for (var q = st; q <= b; q += p) seg[q - a] = 1;
		}
		var out = []; for (var i = 0; i < len; i++) if (!seg[i]) out.push(a + i);
		return out;
	};
	P.NTH_MAX = 2000000;
	P.nthPrime = function (n) {
		n = Math.floor(n); if (n < 1 || n > P.NTH_MAX) return null; if (n < 6) return [2, 3, 5, 7, 11][n - 1];
		var lim = Math.ceil(n * (Math.log(n) + Math.log(Math.log(n)))) + 10, s = P.sieve(lim), c = 0;
		for (var k = 2; k <= lim; k++) if (s[k] && ++c === n) return k;
		return null;
	};
	P.PI_MAX = 30000000;
	P.piCount = function (x) { x = Math.floor(x); if (x < 2) return 0; if (x > P.PI_MAX) return null; var s = P.sieve(x), c = 0; for (var k = 2; k <= x; k++) c += s[k]; return c; };
	/* pi(x) at `pts` evenly spaced x up to N, plus gaps histogram and twin count */
	P.piSamples = function (N, pts) {
		N = Math.floor(N); var s = P.sieve(N), out = [], step = N / pts, next = step, c = 0, gaps = {}, last = 0, twins = 0, maxGap = [0, 0, 0];
		for (var k = 2; k <= N; k++) {
			if (s[k]) { c++; if (last) { var g = k - last; gaps[g] = (gaps[g] || 0) + 1; if (g === 2) twins++; if (g > maxGap[0]) maxGap = [g, last, k]; } last = k; }
			while (k >= next - 1e-9 && out.length < pts) { out.push([k, c]); next += step; }
		}
		if (!out.length || out[out.length - 1][0] !== N) out.push([N, c]);
		return { pts: out, count: c, gaps: gaps, twins: twins, maxGap: maxGap };
	};
	P.li = function (x) {   // logarithmic integral li(x), Ramanujan's series
		if (x <= 1) return NaN; var L = Math.log(x), sum = 0, fact = 1, inner = 0, p2 = 1;
		for (var n = 1; n < 200; n++) {
			fact *= n; if (n > 1) p2 *= 2; if ((n - 1) % 2 === 0) inner += 1 / (n);   // 1/(2k+1) with 2k+1 = n for odd n
			var t = (n % 2 ? 1 : -1) * Math.pow(L, n) / (fact * p2) * inner; sum += t;
			if (Math.abs(t) < 1e-17 * Math.abs(sum) && n > 10) break;
		}
		return 0.5772156649015329 + Math.log(L) + Math.sqrt(x) * sum;
	};
	P.PI_TABLE = [[1, 4n], [2, 25n], [3, 168n], [4, 1229n], [5, 9592n], [6, 78498n], [7, 664579n], [8, 5761455n], [9, 50847534n], [10, 455052511n], [11, 4118054813n], [12, 37607912018n],
		[13, 346065536839n], [14, 3204941750802n], [15, 29844570422669n], [16, 279238341033925n], [17, 2623557157654233n], [18, 24739954287740860n], [19, 234057667276344607n],
		[20, 2220819602560918840n], [21, 21127269486018731928n], [22, 201467286689315906290n], [23, 1925320391606803968923n], [24, 18435599767349200867866n], [25, 176846309399143769411680n]];

	/* ---------- properties ---------- */
	function rev(n) { return BigInt(n.toString().split("").reverse().join("")); }
	function pow2(n) { return n > 0n && (n & (n - 1n)) === 0n; }
	P.goldbach = function (n) {   // smallest p with p and n - p prime (even n >= 4), or null
		n = BigInt(n); if (n < 4n || n & 1n) return null; if (n === 4n) return [2n, 2n];
		for (var k = 1; k < SMALLB.length; k++) { var p = SMALLB[k]; if (p > n / 2n) break; if (P.isPrime(n - p)) return [p, n - p]; }
		for (var q = SMALLB[SMALLB.length - 1] + 2n; q <= n / 2n; q += 2n) if (P.isPrime(q) && P.isPrime(n - q)) return [q, n - q];
		return null;
	};
	/* tags [[id, label, note]] for n (BigInt >= 2) with its factorisation */
	P.properties = function (n, fr) {
		n = BigInt(n); var t = [], isP = fr.f.length === 1 && fr.f[0][1] === 1 && !fr.rest, small = n < 10n ** 60n;
		function add(id, l, note) { t.push([id, l, note || ""]); }
		if (isP) {
			var tw = []; if (n > 2n && P.isPrime(n - 2n)) tw.push(n - 2n); if (P.isPrime(n + 2n)) tw.push(n + 2n);
			if (tw.length) add("twin", "Twin prime", "with " + tw.map(function (x) { return P.group(x.toString()); }).join(" and "));
			if (P.isPrime(n + 4n) || (n > 4n && P.isPrime(n - 4n))) add("cousin", "Cousin prime", "a prime 4 away");
			if (P.isPrime(n + 6n) || (n > 6n && P.isPrime(n - 6n))) add("sexy", "Sexy prime", "a prime 6 away");
			if (small && P.isPrime(2n * n + 1n)) add("sophie", "Sophie Germain prime", "2 × n + 1 = " + P.group((2n * n + 1n).toString()) + " is prime too");
			if (n > 2n && P.isPrime((n - 1n) / 2n) && (n - 1n) / 2n > 1n) add("safe", "Safe prime", "(n − 1) ÷ 2 = " + P.group(((n - 1n) / 2n).toString()) + " is prime");
			if (pow2(n + 1n)) add("mersenne", "Mersenne prime", "2" + P.sup((n + 1n).toString(2).length - 1) + " − 1");
			if (pow2(n - 1n)) { var e = (n - 1n).toString(2).length - 1; if (e === 0 || pow2(BigInt(e))) add("fermat", "Fermat prime", "2^(2^k) + 1"); }
			var r = rev(n); if (r === n && n > 9n) add("pal", "Palindromic prime", "reads the same backwards");
			else if (r !== n && P.isPrime(r)) add("emirp", "Emirp", "reversed, " + P.group(r.toString()) + " is prime too");
		} else if (!fr.rest) {
			var om = P.bigOmega(fr.f), sqf = fr.f.every(function (x) { return x[1] === 1; });
			if (om === 2) add("semi", "Semiprime", "the product of exactly two primes");
			if (pow2(n)) add("pow2", "Power of 2", "2" + P.sup(n.toString(2).length - 1));
			var pp = P.perfectPower(n); if (pp) add("power", pp[1] === 2 ? "Perfect square" : pp[1] === 3 ? "Perfect cube" : "Perfect power", P.group(pp[0].toString()) + P.sup(pp[1]));
			if (sqf) add("sqfree", "Square-free", "no prime appears twice");
			var sg = P.sigma(fr.f) - n;
			if (sg === n) add("perfect", "Perfect number", "its other divisors add up to itself");
			else if (sg > n) add("abundant", "Abundant", "other divisors add up to " + P.group(sg.toString()) + ", more than n");
			else add("deficient", "Deficient", "other divisors add up to " + P.group(sg.toString()) + ", less than n");
			if (sqf && fr.f.length >= 3 && (n & 1n) === 1n && fr.f.every(function (x) { return (n - 1n) % (x[0] - 1n) === 0n; })) add("carmichael", "Carmichael number", "fools Fermat's test for every coprime base");
		}
		if (n > 9n && rev(n) === n && !isP) add("palnum", "Palindrome", "reads the same backwards");
		return t;
	};
	/* the full report used by the page */
	P.analyze = function (n, opt) {
		n = BigInt(n); var r = { n: n, neg: n < 0n }, a = abs(n);
		if (a < 2n) { r.kind = a === 1n ? "one" : "zero"; return r; }
		r.status = P.test(a); r.fr = r.status === "composite" ? P.factor(a, opt) : { f: [[a, 1]], rest: null, probable: r.status === "probable" };
		r.kind = r.status === "composite" ? "composite" : "prime";
		if (!r.fr.rest) { r.nd = P.numDivisors(r.fr.f); r.sigma = P.sigma(r.fr.f); r.phi = P.phi(r.fr.f); r.divs = P.divisors(r.fr.f, 20000); }
		r.props = P.properties(a, r.fr);
		var digits = a.toString().length;
		if (digits <= 400) { r.prev = P.prevPrime(a); r.next = P.nextPrime(a); }
		if (a <= BigInt(P.PI_MAX) && r.kind === "prime") r.index = P.piCount(Number(a));
		if (!(a & 1n) && digits <= 30) r.goldbach = P.goldbach(a);
		return r;
	};

	/* ---------- spiral helpers ---------- */
	P.ulam = function (k) {   // [x, y] of k (k = 1 at the centre, then right, up, left, down ...), y up
		if (k <= 1) return [0, 0]; var r = Math.ceil((Math.sqrt(k) - 1) / 2), side = 2 * r, maxv = (2 * r + 1) * (2 * r + 1), d = maxv - k;
		if (d < side) return [r - d, -r];            // bottom row, from the corner going left
		d -= side; if (d < side) return [-r, -r + d]; // left column going up
		d -= side; if (d < side) return [-r + d, r];  // top row going right
		d -= side; return [r, r - d];                 // right column going down
	};

	if (typeof module === "object" && module.exports) module.exports = P; else root.MESPrime = P;
})(typeof window !== "undefined" ? window : this);

/* MES Cryptography Lab -- pure maths (global MESCrypto; node: require). Needs MESPrime (tool_apps_src/primes/lib.js) for RSA / Diffie-Hellman.
 * Classical ciphers + cracking (Caesar, Atbash, affine, Vigenere, Beaufort, keyword substitution, rail fence), letter statistics,
 * encoders (Base64, hex, binary, Morse, URL, XOR, ROT47), pure SHA-256 and MD5 (for the avalanche picture and node tests),
 * textbook RSA step by step, Diffie-Hellman, square-and-multiply, baby-step giant-step, and the MES1 AES-GCM text format. */
(function (root) {
	"use strict";
	var P = root.MESPrime || (typeof require === "function" ? require("../primes/lib.js") : null);
	var C = {};
	var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	function mod(a, m) { return ((a % m) + m) % m; }
	C.mod = mod;

	/* ---------- English letter statistics ---------- */
	// Letter frequencies in English text, per cent (classic Lewand table).
	C.EN = [8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.360, 0.150, 1.974, 0.074];
	C.letters = function (t) { return String(t).toUpperCase().replace(/[^A-Z]/g, ""); };
	C.counts = function (t) { var c = new Array(26).fill(0), s = C.letters(t); for (var i = 0; i < s.length; i++) c[s.charCodeAt(i) - 65]++; return c; };
	C.chi2 = function (c) { var n = c.reduce(function (a, b) { return a + b; }, 0); if (!n) return Infinity; var x = 0; for (var i = 0; i < 26; i++) { var e = n * C.EN[i] / 100; x += (c[i] - e) * (c[i] - e) / e; } return x; };
	C.ioc = function (c) { var n = c.reduce(function (a, b) { return a + b; }, 0); if (n < 2) return 0; var s = 0; for (var i = 0; i < 26; i++) s += c[i] * (c[i] - 1); return s / (n * (n - 1)); };
	C.IOC_EN = 0.0667; C.IOC_RANDOM = 1 / 26;
	var COMMON = ["THE", "AND", "THAT", "HAVE", "FOR", "NOT", "WITH", "YOU", "THIS", "BUT", "HIS", "FROM", "THEY", "SAY", "HER", "SHE", "WILL", "ONE", "ALL", "WOULD", "THERE", "THEIR", "WHAT", "ABOUT", "WHICH", "WHEN", "MAKE", "CAN", "LIKE", "TIME", "JUST", "KNOW", "PEOPLE", "INTO", "YEAR", "YOUR", "GOOD", "SOME", "COULD", "THEM", "SEE", "OTHER", "THAN", "THEN", "NOW", "LOOK", "ONLY", "COME", "ITS", "OVER", "THINK", "ALSO", "BACK", "AFTER", "USE", "TWO", "HOW", "OUR", "WORK", "FIRST", "WELL", "WAY", "EVEN", "NEW", "WANT", "BECAUSE", "ANY", "THESE", "GIVE", "DAY", "MOST", "ARE", "WAS", "IS", "IT", "OF", "TO", "IN", "BE", "ON", "AT", "BY", "WE", "HE", "OR", "AN", "AS", "DO", "IF", "MY", "SO", "UP", "NO", "ME", "GO", "SECRET", "MESSAGE", "ATTACK", "DAWN", "MEET", "HELLO", "WORLD"];
	var WSET = {}; COMMON.forEach(function (w) { WSET[w] = 1; });
	// Higher = more English-like: -chi2 per letter, plus a bonus for whole common words (works when spaces are kept).
	C.score = function (t) {
		var c = C.counts(t), n = c.reduce(function (a, b) { return a + b; }, 0); if (!n) return -Infinity;
		var s = -C.chi2(c) / n, words = String(t).toUpperCase().split(/[^A-Z]+/).filter(Boolean), hit = 0;
		words.forEach(function (w) { if (WSET[w]) hit += w.length; });
		return s + (words.length > 1 ? 3 * hit / n : 0);
	};

	/* ---------- letter-by-letter helper (keeps case, spacing and punctuation) ---------- */
	function mapLetters(t, f) {
		var out = "", i = 0; t = String(t);
		for (var j = 0; j < t.length; j++) {
			var ch = t[j], cc = ch.charCodeAt(0), up = cc >= 65 && cc <= 90, lo = cc >= 97 && cc <= 122;
			if (!up && !lo) { out += ch; continue; }
			var v = mod(f(cc - (up ? 65 : 97), i++), 26); out += String.fromCharCode(v + (up ? 65 : 97));
		}
		return out;
	}
	C.mapLetters = mapLetters;
	C.caesar = function (t, k, dec) { k = Math.round(+k || 0); return mapLetters(t, function (x) { return x + (dec ? -k : k); }); };
	C.rot13 = function (t) { return C.caesar(t, 13); };
	C.atbash = function (t) { return mapLetters(t, function (x) { return 25 - x; }); };
	C.AFFINE_A = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
	C.inv26 = function (a) { a = mod(a, 26); for (var x = 1; x < 26; x++) if (a * x % 26 === 1) return x; return null; };
	C.affine = function (t, a, b, dec) {
		a = Math.round(+a); b = Math.round(+b || 0); var ia = C.inv26(a); if (ia === null) return null;
		return mapLetters(t, function (x) { return dec ? ia * (x - b) : a * x + b; });
	};
	C.keyShifts = function (key) { return C.letters(key).split("").map(function (c) { return c.charCodeAt(0) - 65; }); };
	C.vigenere = function (t, key, dec) {
		var k = C.keyShifts(key); if (!k.length) return null;
		return mapLetters(t, function (x, i) { return x + (dec ? -k[i % k.length] : k[i % k.length]); });
	};
	C.beaufort = function (t, key) {   // c = k - p (its own inverse)
		var k = C.keyShifts(key); if (!k.length) return null;
		return mapLetters(t, function (x, i) { return k[i % k.length] - x; });
	};
	C.keywordAlphabet = function (kw) {
		var seen = {}, out = ""; (C.letters(kw) + A).split("").forEach(function (c) { if (!seen[c]) { seen[c] = 1; out += c; } }); return out;
	};
	C.substitute = function (t, alpha, dec) {   // alpha = 26-letter cipher alphabet for A..Z
		alpha = C.letters(alpha); if (alpha.length !== 26 || new Set(alpha).size !== 26) return null;
		var inv = new Array(26); for (var i = 0; i < 26; i++) inv[alpha.charCodeAt(i) - 65] = i;
		return mapLetters(t, function (x) { return dec ? inv[x] : alpha.charCodeAt(x) - 65; });
	};
	C.railPattern = function (len, rails) {   // rail index of every position (zig-zag)
		var r = [], row = 0, d = 1; if (rails < 2) { for (var i = 0; i < len; i++) r.push(0); return r; }
		for (var j = 0; j < len; j++) { r.push(row); if (row === 0) d = 1; else if (row === rails - 1) d = -1; row += d; }
		return r;
	};
	C.railFence = function (t, rails, dec) {
		t = String(t); rails = Math.max(2, Math.min(20, Math.round(+rails || 2))); var chars = Array.from(t), pat = C.railPattern(chars.length, rails);
		var order = []; for (var r = 0; r < rails; r++) for (var i = 0; i < chars.length; i++) if (pat[i] === r) order.push(i);
		if (!dec) return order.map(function (i) { return chars[i]; }).join("");
		var out = new Array(chars.length); order.forEach(function (pos, k) { out[pos] = chars[k]; }); return out.join("");
	};

	/* ---------- cracking ---------- */
	C.crackCaesar = function (t) {
		var r = []; for (var k = 0; k < 26; k++) { var p = C.caesar(t, k, true); r.push({ k: k, text: p, score: C.score(p) }); }
		return r.sort(function (a, b) { return b.score - a.score; });
	};
	C.crackAffine = function (t) {
		var r = []; C.AFFINE_A.forEach(function (a) { for (var b = 0; b < 26; b++) { var p = C.affine(t, a, b, true); r.push({ a: a, b: b, text: p, score: C.score(p) }); } });
		return r.sort(function (x, y) { return y.score - x.score; });
	};
	C.columns = function (s, len) { var cols = []; for (var i = 0; i < len; i++) cols.push(""); for (var j = 0; j < s.length; j++) cols[j % len] += s[j]; return cols; };
	// Friedman: average index of coincidence of the columns for each key length.
	C.keyLengths = function (t, max) {
		var s = C.letters(t), out = []; max = Math.min(max || 20, Math.floor(s.length / 2));
		for (var L = 1; L <= max; L++) { var cols = C.columns(s, L), v = 0; cols.forEach(function (c) { v += C.ioc(C.counts(c)); }); out.push({ len: L, ioc: v / L }); }
		return out;
	};
	// Kasiski: distances between repeated 3-letter groups.
	C.kasiski = function (t) {
		var s = C.letters(t), seen = {}, reps = [];
		for (var i = 0; i + 3 <= s.length; i++) { var g = s.substr(i, 3); if (seen[g] !== undefined) reps.push({ g: g, at: seen[g], to: i, d: i - seen[g] }); else seen[g] = i; }
		var fac = {}; reps.forEach(function (r) { for (var f = 2; f <= 20; f++) if (r.d % f === 0) fac[f] = (fac[f] || 0) + 1; });
		return { reps: reps, factors: fac };
	};
	C.bestShift = function (col) { var best = 0, bx = Infinity; for (var k = 0; k < 26; k++) { var x = C.chi2(C.counts(C.caesar(col, k, true))); if (x < bx) { bx = x; best = k; } } return best; };
	C.crackVigenereLen = function (t, len) {
		var s = C.letters(t), key = C.columns(s, len).map(function (c) { return A[C.bestShift(c)]; }).join(""), p = C.vigenere(t, key, true);
		return { key: key, text: p, score: C.score(p) };
	};
	C.crackVigenere = function (t, max) {
		var kl = C.keyLengths(t, max || 16); if (!kl.length) return null;
		var best = kl.reduce(function (a, b) { return b.ioc > a.ioc ? b : a; });
		// the shortest length that is nearly as good as the best (multiples of the true length score as well)
		var pick = kl.filter(function (x) { return x.ioc >= Math.max(0.055, best.ioc * 0.9); })[0] || best;
		var r = C.crackVigenereLen(t, pick.len); r.len = pick.len; r.lengths = kl; return r;
	};
	// Pick the cipher a text was most likely made with (for the "Crack it" button).
	C.autoCrack = function (t) {
		var s = C.letters(t); if (s.length < 8) return { err: "Paste at least a sentence of letters to crack." };
		var cz = C.crackCaesar(t)[0], af = C.crackAffine(t)[0], vg = s.length >= 40 ? C.crackVigenere(t, 16) : null, at = C.atbash(t);
		var cands = [{ type: "caesar", label: "Caesar shift " + cz.k, text: cz.text, score: cz.score, k: cz.k },
			{ type: "atbash", label: "Atbash", text: at, score: C.score(at) },
			{ type: "affine", label: "Affine a = " + af.a + ", b = " + af.b, text: af.text, score: af.score - 0.02, a: af.a, b: af.b }];
		if (vg && vg.len > 1) cands.push({ type: "vigenere", label: "Vigenère, key " + vg.key, text: vg.text, score: vg.score - 0.01 * vg.len, key: vg.key });
		cands.sort(function (a, b) { return b.score - a.score; });
		return { best: cands[0], all: cands, ioc: C.ioc(C.counts(t)), plain: C.score(t) };
	};

	/* ---------- bytes / encoders ---------- */
	C.utf8 = function (s) { if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s); return Uint8Array.from(Buffer.from(String(s), "utf8")); };
	C.fromUtf8 = function (b) { if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: true }).decode(b); return Buffer.from(b).toString("utf8"); };
	C.hex = function (b) { var s = ""; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s; };
	C.fromHex = function (h) { h = String(h).replace(/[\s:,]|0x/gi, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) return null; var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; };
	var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	C.b64 = function (b, url) {
		var s = "", i; for (i = 0; i + 2 < b.length; i += 3) { var n = b[i] << 16 | b[i + 1] << 8 | b[i + 2]; s += B64[n >> 18] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]; }
		var r = b.length - i; if (r === 1) { var m = b[i] << 16; s += B64[m >> 18] + B64[m >> 12 & 63] + "=="; } else if (r === 2) { var o = b[i] << 16 | b[i + 1] << 8; s += B64[o >> 18] + B64[o >> 12 & 63] + B64[o >> 6 & 63] + "="; }
		return url ? s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : s;
	};
	C.fromB64 = function (s) {
		s = String(s).replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, ""); if (/[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) return null;
		var out = [], buf = 0, bits = 0; for (var i = 0; i < s.length; i++) { buf = buf << 6 | B64.indexOf(s[i]); bits += 6; if (bits >= 8) { bits -= 8; out.push(buf >> bits & 255); } }
		return Uint8Array.from(out);
	};
	C.binary = function (b) { return Array.from(b, function (x) { return ("0000000" + x.toString(2)).slice(-8); }).join(" "); };
	C.fromBinary = function (s) { s = String(s).replace(/[^01]/g, ""); if (!s.length || s.length % 8) return null; var b = new Uint8Array(s.length / 8); for (var i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 8, 8), 2); return b; };
	C.MORSE = { A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
		"0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
		".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-", '"': ".-..-.", "$": "...-..-", "@": ".--.-." };
	var UNMORSE = {}; Object.keys(C.MORSE).forEach(function (k) { UNMORSE[C.MORSE[k]] = k; });
	C.morse = function (t) { return String(t).toUpperCase().trim().split(/\s+/).map(function (w) { return Array.from(w).map(function (c) { return C.MORSE[c] || ""; }).filter(Boolean).join(" "); }).filter(Boolean).join(" / "); };
	C.fromMorse = function (m) { return String(m).replace(/[•·]/g, ".").replace(/[–—_]/g, "-").trim().split(/\s*[\/|]\s*|\s{3,}/).map(function (w) { return w.split(/\s+/).map(function (c) { return UNMORSE[c] || (c ? "?" : ""); }).join(""); }).join(" "); };
	C.rot47 = function (t) { return Array.from(String(t), function (c) { var x = c.charCodeAt(0); return x >= 33 && x <= 126 ? String.fromCharCode(33 + (x + 14) % 94) : c; }).join(""); };
	C.xor = function (b, k) { var o = new Uint8Array(b.length); if (!k.length) return o; for (var i = 0; i < b.length; i++) o[i] = b[i] ^ k[i % k.length]; return o; };

	/* ---------- SHA-256 and MD5 (pure, byte arrays in, hex out) ---------- */
	var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
	function pad(b, little) {
		var n = b.length, total = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(total); m.set(b); m[n] = 0x80;
		var bits = n * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
		for (var i = 0; i < 4; i++) { if (little) { m[total - 8 + i] = lo >>> (8 * i) & 255; m[total - 4 + i] = hi >>> (8 * i) & 255; } else { m[total - 1 - i] = lo >>> (8 * i) & 255; m[total - 5 - i] = hi >>> (8 * i) & 255; } }
		return m;
	}
	C.sha256 = function (b) {
		if (typeof b === "string") b = C.utf8(b); var m = pad(b), H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
		function r(x, n) { return x >>> n | x << (32 - n); }
		for (var o = 0; o < m.length; o += 64) {
			for (var t = 0; t < 16; t++) W[t] = m[o + 4 * t] << 24 | m[o + 4 * t + 1] << 16 | m[o + 4 * t + 2] << 8 | m[o + 4 * t + 3];
			for (t = 16; t < 64; t++) { var s0 = r(W[t - 15], 7) ^ r(W[t - 15], 18) ^ W[t - 15] >>> 3, s1 = r(W[t - 2], 17) ^ r(W[t - 2], 19) ^ W[t - 2] >>> 10; W[t] = W[t - 16] + s0 + W[t - 7] + s1 | 0; }
			var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
			for (t = 0; t < 64; t++) {
				var t1 = h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + (e & f ^ ~e & g) + K256[t] + W[t] | 0, t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22)) + (a & bb ^ a & c ^ bb & c) | 0;
				h = g; g = f; f = e; e = d + t1 | 0; d = c; c = bb; bb = a; a = t1 + t2 | 0;
			}
			H[0] = H[0] + a | 0; H[1] = H[1] + bb | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0; H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
		}
		return H.map(function (x) { return ("0000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
	};
	var MS = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
	var MK = []; for (var mi = 0; mi < 64; mi++) MK.push(Math.floor(Math.abs(Math.sin(mi + 1)) * 4294967296) | 0);
	C.md5 = function (b) {
		if (typeof b === "string") b = C.utf8(b); var m = pad(b, true), h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, M = new Array(16);
		for (var o = 0; o < m.length; o += 64) {
			for (var t = 0; t < 16; t++) M[t] = m[o + 4 * t] | m[o + 4 * t + 1] << 8 | m[o + 4 * t + 2] << 16 | m[o + 4 * t + 3] << 24;
			var a = h0, bb = h1, c = h2, d = h3;
			for (var i = 0; i < 64; i++) {
				var f, g;
				if (i < 16) { f = bb & c | ~bb & d; g = i; } else if (i < 32) { f = d & bb | ~d & c; g = (5 * i + 1) % 16; } else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (bb | ~d); g = 7 * i % 16; }
				var tmp = d; d = c; c = bb; var x = a + f + MK[i] + M[g] | 0; bb = bb + (x << MS[i] | x >>> (32 - MS[i])) | 0; a = tmp;
			}
			h0 = h0 + a | 0; h1 = h1 + bb | 0; h2 = h2 + c | 0; h3 = h3 + d | 0;
		}
		return [h0, h1, h2, h3].map(function (x) { var s = ""; for (var i = 0; i < 4; i++) { var y = x >>> (8 * i) & 255; s += (y < 16 ? "0" : "") + y.toString(16); } return s; }).join("");
	};
	C.bitsOf = function (hex) { var s = ""; for (var i = 0; i < hex.length; i++) s += ("000" + parseInt(hex[i], 16).toString(2)).slice(-4); return s; };
	C.bitDiff = function (h1, h2) { var a = C.bitsOf(h1), b = C.bitsOf(h2), n = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
	C.CRC_T = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; t.push(c >>> 0); } return t; })();
	C.crc32 = function (b) { if (typeof b === "string") b = C.utf8(b); var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = C.CRC_T[(c ^ b[i]) & 255] ^ c >>> 8; return ("0000000" + ((c ^ 0xffffffff) >>> 0).toString(16)).slice(-8); };

	/* ---------- number theory for RSA / DH ---------- */
	C.big = function (s) { s = String(s).replace(/[\s,_]/g, ""); if (!/^-?\d+$/.test(s) || s.length > 1300) return null; return BigInt(s); };
	C.bitLen = function (n) { return n <= 0n ? 0 : n.toString(2).length; };
	C.modpowSteps = function (a, e, m) {   // square-and-multiply, one row per bit of e (from the left)
		a = mod(BigInt(a), BigInt(m)); e = BigInt(e); m = BigInt(m); var bits = e.toString(2), r = 1n, rows = [];
		for (var i = 0; i < bits.length; i++) { var sq = r * r % m, mul = bits[i] === "1" ? sq * a % m : sq; rows.push({ bit: bits[i], sq: sq, r: mul }); r = mul; }
		return { result: m === 1n ? 0n : r, rows: rows, bits: bits };
	};
	C.egcdSteps = function (a, b) {   // extended Euclid table: rows {q, r, s, t} with s*a + t*b = r
		a = BigInt(a); b = BigInt(b); var rows = [{ q: null, r: a, s: 1n, t: 0n }, { q: null, r: b, s: 0n, t: 1n }];
		while (rows[rows.length - 1].r !== 0n && rows.length < 400) { var x = rows[rows.length - 2], y = rows[rows.length - 1], q = x.r / y.r; rows.push({ q: q, r: x.r - q * y.r, s: x.s - q * y.s, t: x.t - q * y.t }); }
		return rows;
	};
	// Random BigInt in [lo, hi) from a byte source (crypto.getRandomValues in the page, Math.random in tests).
	C.randBig = function (lo, hi, rnd) {
		var span = hi - lo, bytes = Math.ceil(C.bitLen(span) / 8) + 1, x = 0n, buf = new Uint8Array(bytes); rnd(buf);
		for (var i = 0; i < bytes; i++) x = x << 8n | BigInt(buf[i]); return lo + x % span;
	};
	C.randomPrime = function (bits, rnd) { var lo = 1n << BigInt(bits - 1), hi = 1n << BigInt(bits); for (var k = 0; k < 10000; k++) { var p = P.nextPrime(C.randBig(lo, hi, rnd) - 1n); if (p < hi) return p; } return null; };
	C.E_CHOICES = [3n, 5n, 17n, 257n, 65537n];
	C.rsaKey = function (p, q, e) {
		p = BigInt(p); q = BigInt(q); var why = [];
		if (p < 2n || !P.isPrime(p)) why.push("p = " + p + " is not prime."); if (q < 2n || !P.isPrime(q)) why.push("q = " + q + " is not prime."); if (p === q) why.push("p and q must be different primes.");
		if (why.length) return { err: why.join(" ") };
		var n = p * q, phi = (p - 1n) * (q - 1n), lam = phi / P.gcd(p - 1n, q - 1n);
		if (e === undefined || e === null) { e = C.E_CHOICES.filter(function (x) { return x < phi && P.gcd(x, phi) === 1n; }).pop(); if (!e) { e = 3n; while (e < phi && P.gcd(e, phi) !== 1n) e += 2n; } }
		e = BigInt(e); if (e <= 1n || e >= phi) return { err: "e must be between 1 and φ(n) = " + phi + "." };
		if (P.gcd(e, phi) !== 1n) return { err: "e = " + e + " shares a factor with φ(n) = " + phi + " (gcd " + P.gcd(e, phi) + "), so it has no inverse. Pick another e." };
		var d = P.modInverse(e, phi);
		return { p: p, q: q, n: n, phi: phi, lambda: lam, e: e, d: d, bits: C.bitLen(n), steps: C.egcdSteps(phi, e) };
	};
	C.blockBytes = function (n) { return Math.floor((C.bitLen(n) - 1) / 8); };
	C.textToBlocks = function (text, n) {   // UTF-8 bytes packed into numbers smaller than n
		var k = C.blockBytes(n); if (k < 1) return { err: "n must be at least 256 to hold one byte. Use bigger primes." };
		var b = C.utf8(text), out = []; for (var i = 0; i < b.length; i += k) { var x = 0n; for (var j = i; j < Math.min(i + k, b.length); j++) x = x << 8n | BigInt(b[j]); out.push({ m: x, len: Math.min(k, b.length - i) }); }
		return { blocks: out, k: k };
	};
	C.blocksToText = function (nums, k, lastLen) {
		var bytes = []; nums.forEach(function (x, idx) { var len = idx === nums.length - 1 && lastLen ? lastLen : k, part = []; for (var j = 0; j < len; j++) { part.unshift(Number(x & 255n)); x >>= 8n; } bytes.push.apply(bytes, part); });
		try { return C.fromUtf8(Uint8Array.from(bytes)); } catch (e) { return null; }
	};
	C.rsaCrack = function (n, e, ms) {
		var f = P.factor(BigInt(n), { ms: ms || 1500 }); if (f.rest || f.f.length !== 2 || f.f[0][1] !== 1 || f.f[1][1] !== 1) return { ok: false, f: f };
		var k = C.rsaKey(f.f[0][0], f.f[1][0], e); return { ok: !k.err, key: k, f: f };
	};
	C.isPrimitiveRoot = function (g, p) {
		g = BigInt(g); p = BigInt(p); if (!P.isPrime(p) || g <= 1n || g >= p) return false;
		var f = P.factor(p - 1n, { ms: 800 }); if (f.rest) return null;
		return f.f.every(function (x) { return P.modpow(g, (p - 1n) / x[0], p) !== 1n; });
	};
	C.smallestRoot = function (p) { for (var g = 2n; g < p && g < 2000n; g++) { var r = C.isPrimitiveRoot(g, p); if (r === null) return null; if (r) return g; } return null; };
	C.dh = function (p, g, a, b) { p = BigInt(p); g = BigInt(g); a = BigInt(a); b = BigInt(b); var A = P.modpow(g, a, p), B = P.modpow(g, b, p); return { A: A, B: B, sA: P.modpow(B, a, p), sB: P.modpow(A, b, p) }; };
	// Baby-step giant-step discrete log: x with g^x = h (mod p), or null. Limited to p up to about 1e12.
	C.dlog = function (g, h, p) {
		g = BigInt(g); h = BigInt(h); p = BigInt(p); if (p > 1000000000000n) return { err: "too big" };
		var m = BigInt(Math.ceil(Math.sqrt(Number(p)))), tbl = new Map(), e = 1n;
		for (var j = 0n; j < m; j++) { if (!tbl.has(e)) tbl.set(e, j); e = e * g % p; }
		var f = P.modpow(P.modInverse(g, p), m, p), y = mod(h, p), steps = Number(m);
		for (var i = 0n; i < m; i++) { if (tbl.has(y)) return { x: i * m + tbl.get(y), steps: steps + Number(i) }; y = y * f % p; }
		return { x: null, steps: steps * 2 };
	};

	/* ---------- MES1 text format for AES-GCM (salt 16 + iv 12 + ciphertext) ---------- */
	C.PBKDF2_ITER = 250000;
	C.pack = function (salt, iv, ct) { var b = new Uint8Array(28 + ct.length); b.set(salt, 0); b.set(iv, 16); b.set(ct, 28); return "MES1." + C.b64(b, true); };
	C.unpack = function (s) {
		s = String(s).trim(); var m = /^MES1\.([A-Za-z0-9_-]+)$/.exec(s.replace(/\s+/g, "")); if (!m) return null;
		var b = C.fromB64(m[1]); if (!b || b.length < 28 + 16) return null; return { salt: b.slice(0, 16), iv: b.slice(16, 28), ct: b.slice(28) };
	};
	// Rough time to brute-force a password (guesses per second as given).
	C.passwordSpace = function (pw) {
		var pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/[0-9]/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
		var len = Array.from(pw).length; return { pool: pool, len: len, bits: len && pool ? len * Math.log2(pool) : 0 };
	};

	if (typeof module === "object" && module.exports) module.exports = C; else root.MESCrypto = C;
})(typeof window !== "undefined" ? window : this);

/* MES Cryptography Lab -- UI (maths in lib.js = MESCrypto, primes in MESPrime). Tabs: cipher, crack, rsa, dh, hash, aes, enc, mod.
 * State: localStorage "mes-cryptography:v1" (settings + texts; never the AES password). Links: ?tab=  (?c=&k=&t= for the cipher tab). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("cg"); if (!root || !window.MESCrypto || !window.MESPrime) return;
	var C = window.MESCrypto, P = window.MESPrime, KEY = "mes-cryptography:v1", AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var S = Object.assign({ tab: "cipher", c: "caesar", dir: "enc", shift: 3, aa: 5, ab: 8, key: "LEMON", kw: "ZEBRAS", rails: 3, rmode: "text", ef: "b64", edir: "enc" }, sget());
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var q = new URLSearchParams(location.search);
	if (q.get("tab")) S.tab = q.get("tab");
	if (q.get("c")) { S.c = q.get("c"); S.tab = "cipher"; } if (q.get("k")) { var kk = q.get("k").slice(0, 60); if (S.c === "caesar") S.shift = +kk || 0; else if (S.c === "rail") S.rails = +kk || 3; else if (S.c === "keyword") S.kw = kk; else if (S.c === "affine") { var ab = kk.split(","); S.aa = +ab[0] || 5; S.ab = +ab[1] || 0; } else S.key = kk; }
	if (q.get("d") === "1") S.dir = "dec";
	var linkText = q.get("t"); if (linkText !== null) history.replaceState(null, "", location.pathname + (S.tab !== "cipher" ? "?tab=" + S.tab : ""));
	function toast(t) { var el = document.querySelector(".tu-toast"); if (!el) { el = document.createElement("div"); el.className = "tu-toast"; document.body.appendChild(el); } el.textContent = t; el.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 1900); }
	function copy(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg || "Copied"); }, function () { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg || "Copied"); } catch (e) {} ta.remove(); }); }
	function seg(id, val, cb, attr) {
		attr = attr || "v"; var el = $(id);
		function paint(v) { el.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset[attr] === String(v)); }); }
		paint(val); el.addEventListener("click", function (e) { var b = e.target.closest("button[data-" + attr + "]"); if (!b) return; paint(b.dataset[attr]); cb(b.dataset[attr]); });
		return paint;
	}
	function grp(s) { return P.group ? P.group(String(s)) : String(s); }
	function short(s, n) { s = String(s); n = n || 60; return s.length > n ? s.slice(0, n / 2) + "…" + s.slice(-n / 2 + 1) + " (" + s.length + " digits)" : s; }
	function rnd(buf) { crypto.getRandomValues(buf); }
	function err(id, msg) { var e = $(id); if (!e) return; e.textContent = msg || ""; e.hidden = !msg; }
	function sci(x) { var m = x.toExponential(1).split("e+"); return m[0] + " × 10" + String(+m[1]).replace(/\d/g, function (d) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]; }); }
	function dark() { return document.body.classList.contains("dark-mode"); }

	/* ---------- tabs ---------- */
	var TABS = ["cipher", "crack", "rsa", "dh", "hash", "aes", "enc", "mod"], inited = {};
	var INIT = { crack: initCrack, rsa: initRsa, dh: initDh, hash: initHash, aes: initAes, enc: initEnc, mod: initMod };
	function showTab(t, push) {
		if (TABS.indexOf(t) < 0) t = "cipher"; S.tab = t; save();
		root.querySelectorAll("#cg-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.t === t); b.tabIndex = b.dataset.t === t ? 0 : -1; });
		root.querySelectorAll(".cg-pane").forEach(function (p) { p.hidden = p.dataset.pane !== t; });
		if (!inited[t] && INIT[t]) { inited[t] = 1; INIT[t](); }
		if (push) history.replaceState(null, "", location.pathname + (t === "cipher" ? "" : "?tab=" + t) + location.hash);
	}
	$("cg-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) showTab(b.dataset.t, true); });
	$("cg-tabs").addEventListener("keydown", function (e) {
		var i = TABS.indexOf(S.tab), j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -9;
		if (j === -9) return; e.preventDefault(); j = (j + TABS.length) % TABS.length; showTab(TABS[j], true); root.querySelector('#cg-tabs [data-t="' + TABS[j] + '"]').focus();
	});

	/* =================== Ciphers =================== */
	$("cg-aa").innerHTML = C.AFFINE_A.map(function (a) { return "<option>" + a + "</option>"; }).join("");
	$("cg-c").value = S.c; $("cg-shift").value = S.shift; $("cg-aa").value = S.aa; $("cg-ab").value = S.ab; $("cg-key").value = S.key; $("cg-kw").value = S.kw; $("cg-rails").value = S.rails;
	if (linkText !== null) $("cg-in").value = linkText.slice(0, 5000); else if (S.cin) $("cg-in").value = S.cin;
	var paintDir = seg("cg-dir", S.dir, function (v) { S.dir = v; runCipher(); });
	["cg-c", "cg-shift", "cg-aa", "cg-ab", "cg-key", "cg-kw", "cg-rails", "cg-in"].forEach(function (id) { $(id).addEventListener("input", runCipher); });
	function cipherOut(t) {
		var dec = S.dir === "dec";
		switch (S.c) {
			case "caesar": return C.caesar(t, S.shift, dec);
			case "rot13": return C.rot13(t);
			case "atbash": return C.atbash(t);
			case "affine": return C.affine(t, S.aa, S.ab, dec);
			case "vigenere": return C.vigenere(t, S.key, dec);
			case "beaufort": return C.beaufort(t, S.key);
			case "keyword": return C.substitute(t, C.keywordAlphabet(S.kw), dec);
			case "rail": return C.railFence(t, S.rails, dec);
		}
	}
	function runCipher() {
		S.c = $("cg-c").value; S.shift = +$("cg-shift").value; S.aa = +$("cg-aa").value; S.ab = +$("cg-ab").value; S.key = $("cg-key").value; S.kw = $("cg-kw").value; S.rails = +$("cg-rails").value;
		S.cin = $("cg-in").value.slice(0, 20000); save();
		$("cg-shiftv").textContent = S.shift; $("cg-abv").textContent = S.ab; $("cg-railsv").textContent = S.rails;
		$("cg-keys").querySelectorAll("[data-for]").forEach(function (l) { l.hidden = l.dataset.for.split(" ").indexOf(S.c) < 0; });
		$("cg-keys").hidden = ["rot13", "atbash"].indexOf(S.c) >= 0;
		var selfInv = ["rot13", "atbash", "beaufort"].indexOf(S.c) >= 0; $("cg-dir").hidden = selfInv;
		var dec = S.dir === "dec" && !selfInv;
		$("cg-inlab").textContent = dec ? "Secret message" : "Your message"; $("cg-outlab").textContent = dec ? "Decrypted" : "Encrypted";
		var out = cipherOut(S.cin);
		if (out === null) { $("cg-out").value = ""; $("cg-out").placeholder = S.c === "vigenere" || S.c === "beaufort" ? "Type a key word (letters)." : "Pick a key."; } else $("cg-out").value = out;
		drawViz(out || "");
	}
	$("cg-swap").onclick = function () { $("cg-in").value = $("cg-out").value; S.dir = S.dir === "enc" ? "dec" : "enc"; paintDir(S.dir); runCipher(); };
	$("cg-copy").onclick = function () { copy($("cg-out").value, "Result copied"); };
	$("cg-tocrack").onclick = function () { $("cg-ct").value = $("cg-out").value; showTab("crack", true); if (!inited.crack) initCrack(); doCrack(); };
	$("cg-link").onclick = function () {
		var k = S.c === "caesar" ? S.shift : S.c === "rail" ? S.rails : S.c === "keyword" ? S.kw : S.c === "affine" ? S.aa + "," + S.ab : S.key;
		var u = location.origin + location.pathname + "?c=" + S.c + (["rot13", "atbash"].indexOf(S.c) < 0 ? "&k=" + encodeURIComponent(k) : "") + "&d=1&t=" + encodeURIComponent($("cg-out").value.slice(0, 1500));
		copy(u, "Link copied: it opens the secret message ready to decrypt");
	};

	function mappingRow(f, used) {   // plain A-Z over cipher letters
		var h = '<div class="cg-map" role="table" aria-label="Letter mapping"><div class="cg-maprow"><span class="cg-maph">Plain</span>';
		for (var i = 0; i < 26; i++) h += '<span class="cg-l' + (used[i] ? " is-used" : "") + '">' + AZ[i] + "</span>";
		h += '</div><div class="cg-maprow"><span class="cg-maph">Cipher</span>';
		for (i = 0; i < 26; i++) h += '<span class="cg-l cg-l--c' + (used[i] ? " is-used" : "") + '">' + AZ[C.mod(f(i), 26)] + "</span>";
		return h + "</div></div>";
	}
	function usedPlain(t) { var u = new Array(26).fill(false), s = C.letters(t); for (var i = 0; i < s.length; i++) u[s.charCodeAt(i) - 65] = true; return u; }
	function drawViz(out) {
		var v = $("cg-viz"), n = $("cg-vizn"), dec = S.dir === "dec", plain = dec ? out : S.cin, used = usedPlain(plain);
		var h = "", note = "";
		if (S.c === "caesar" || S.c === "rot13") {
			var k = S.c === "rot13" ? 13 : S.shift;
			h = wheelSvg(k) + mappingRow(function (i) { return i + k; }, used);
			note = S.c === "caesar" ? "Drag the inner wheel to change the shift. Each letter moves " + k + " places along the alphabet; Z wraps round to A. Only 25 shifts exist, so the Crack tab tries them all." : "ROT13 is a Caesar shift of 13: doing it twice gets you back where you started, so the same button encrypts and decrypts.";
		} else if (S.c === "atbash") { h = mappingRow(function (i) { return 25 - i; }, used); note = "Atbash flips the alphabet: A ↔ Z, B ↔ Y … It was first used with the Hebrew alphabet and has no key at all."; }
		else if (S.c === "affine") { var ia = C.inv26(S.aa); h = mappingRow(function (i) { return S.aa * i + S.ab; }, used) + '<p class="cg-formula">Encrypt: E(x) = (' + S.aa + "x + " + S.ab + ") mod 26 &nbsp;·&nbsp; Decrypt: D(y) = " + ia + "(y − " + S.ab + ") mod 26</p>"; note = "Letters are numbers (A = 0 … Z = 25). a must share no factor with 26, so only 12 values work; " + ia + " is the inverse of " + S.aa + " mod 26 (" + S.aa + " × " + ia + " = " + S.aa * ia + " = " + Math.floor(S.aa * ia / 26) + " × 26 + 1)."; }
		else if (S.c === "keyword") { var al = C.keywordAlphabet(S.kw); h = mappingRow(function (i) { return al.charCodeAt(i) - 65; }, used); note = "The cipher alphabet starts with the keyword (repeated letters dropped), then the rest of the alphabet in order. There are 26! ≈ 4 × 10²⁶ possible alphabets, but letter frequencies still give it away."; }
		else if (S.c === "vigenere" || S.c === "beaufort") {
			var ks = C.keyShifts(S.key), src = S.cin, rows = { p: [], k: [], c: [] }, i = 0;
			if (ks.length) for (var j = 0; j < src.length && rows.p.length < 36; j++) { var ch = src[j]; if (!/[A-Za-z]/.test(ch)) continue; var o = out[j]; rows.p.push(ch.toUpperCase()); rows.k.push(AZ[ks[i % ks.length]]); rows.c.push((o || "").toUpperCase()); i++; }
			h = '<div class="cg-map cg-map--v"><div class="cg-maprow"><span class="cg-maph">' + (dec ? "Secret" : "Plain") + "</span>" + rows.p.map(function (x) { return '<span class="cg-l">' + x + "</span>"; }).join("") + '</div><div class="cg-maprow"><span class="cg-maph">Key</span>' + rows.k.map(function (x) { return '<span class="cg-l cg-l--k">' + x + "</span>"; }).join("") + '</div><div class="cg-maprow"><span class="cg-maph">' + (dec ? "Plain" : "Cipher") + "</span>" + rows.c.map(function (x) { return '<span class="cg-l cg-l--c">' + x + "</span>"; }).join("") + "</div></div>";
			note = S.c === "vigenere" ? "The key word repeats under the message and each key letter is a different Caesar shift (A = 0, B = 1 …). The same letter can encrypt to different letters, which beat simple frequency counting for 300 years, until Kasiski found the repeats (see the Crack tab)." : "Beaufort uses cipher = key − plain (mod 26), so encrypting twice with the same key gives the message back.";
		} else if (S.c === "rail") {
			var chars = Array.from(S.cin.slice(0, 60)), pat = C.railPattern(chars.length, S.rails), g = '<div class="cg-rail" style="--cols:' + Math.max(chars.length, 1) + '">';
			for (var r = 0; r < S.rails; r++) for (var c = 0; c < chars.length; c++) g += '<span class="' + (pat[c] === r ? "is-on" : "") + '">' + (pat[c] === r ? esc(chars[c] === " " ? "␣" : chars[c]) : "") + "</span>";
			h = g + "</div>"; note = dec ? "Decrypting refills the zig-zag row by row, then reads it diagonally." : "Write the message in a zig-zag over " + S.rails + " rails, then read each rail from left to right. The letters stay the same, only their order changes (a transposition cipher)" + (S.cin.length > 60 ? "; the picture shows the first 60 characters." : ".");
		}
		v.innerHTML = h; n.textContent = note;
	}
	function wheelSvg(k) {
		var s = '<svg class="cg-wheel" viewBox="-160 -160 320 320" role="img" aria-label="Caesar wheel, shift ' + k + '"><circle r="152" class="cg-w1"/><circle r="112" class="cg-w2"/><circle r="70" class="cg-w3"/>';
		for (var i = 0; i < 26; i++) { var a = (i / 26) * 2 * Math.PI - Math.PI / 2, x = Math.cos(a), y = Math.sin(a); s += '<text x="' + (x * 132).toFixed(1) + '" y="' + (y * 132 + 6).toFixed(1) + '" class="cg-wt">' + AZ[i] + "</text>"; }
		s += '<g class="cg-inner" transform="rotate(' + (-k * 360 / 26) + ')">';
		for (i = 0; i < 26; i++) { var b = (i / 26) * 2 * Math.PI - Math.PI / 2; s += '<text x="' + (Math.cos(b) * 91).toFixed(1) + '" y="' + (Math.sin(b) * 91 + 5).toFixed(1) + '" class="cg-wt cg-wt--in" transform="rotate(' + (k * 360 / 26) + " " + (Math.cos(b) * 91).toFixed(1) + " " + (Math.sin(b) * 91).toFixed(1) + ')">' + AZ[i] + "</text>"; }
		s += '</g><text y="-6" class="cg-wk">' + k + '</text><text y="16" class="cg-wks">shift</text><path d="M0 -158 L-7 -170 L7 -170 Z" class="cg-wp"/></svg>';
		return s;
	}
	// keep dragging after the wheel is redrawn: delegate to the viz container instead
	(function () {
		var v = $("cg-viz"), drag = null;
		function ang(e, svg) { var r = svg.getBoundingClientRect(); return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); }
		v.addEventListener("pointerdown", function (e) { var svg = e.target.closest(".cg-wheel"); if (!svg || S.c !== "caesar") return; drag = { a: ang(e, svg), k: S.shift }; v.setPointerCapture(e.pointerId); e.preventDefault(); });
		v.addEventListener("pointermove", function (e) { if (!drag) return; var svg = v.querySelector(".cg-wheel"); if (!svg) return; var k = C.mod(Math.round(drag.k - (ang(e, svg) - drag.a) * 26 / (2 * Math.PI)), 26); if (k !== S.shift) { $("cg-shift").value = k; runCipher(); } });
		function end() { drag = null; } v.addEventListener("pointerup", end); v.addEventListener("pointercancel", end);
	})();
	runCipher();

	/* =================== Crack =================== */
	var CT_PLAIN = [
		"The secret on the maps is that the treasure is buried under the old oak tree near the river, twenty paces north of the broken stone wall.",
		"We have found the missing documents and they prove everything. Meet me at the north gate of the station at nine tonight and bring the copies with you. Tell nobody else about this plan until it is done.",
		"The quick brown fox jumps over the lazy dog, and then runs back home before dark.",
		"The message is hidden in plain sight where nobody thinks to look for it. The key is under the mat."
	];
	var CT_EX = [["Caesar", C.caesar(CT_PLAIN[0], 3)], ["Vigenère", C.vigenere(CT_PLAIN[1], "SECRET")], ["Atbash", C.atbash(CT_PLAIN[2])], ["Affine", C.affine(CT_PLAIN[3], 7, 10)], ["Rail fence (not crackable here)", C.railFence("Rail fence keeps every letter, it only changes their order, so the letter counts look like English.", 3)]];
	function initCrack() {
		$("cg-ctex").insertAdjacentHTML("beforeend", CT_EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + x[0] + "</button>"; }).join(""));
		$("cg-ctex").addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (b) { $("cg-ct").value = CT_EX[+b.dataset.i][1]; doCrack(); } });
		if (!$("cg-ct").value) $("cg-ct").value = S.ct || CT_EX[0][1];
		$("cg-crack").onclick = doCrack; $("cg-ct").addEventListener("input", function () { S.ct = $("cg-ct").value.slice(0, 20000); save(); drawFreq($("cg-ct").value); });
		drawFreq($("cg-ct").value);
	}
	function drawFreq(t) {
		var c = C.counts(t), n = c.reduce(function (a, b) { return a + b; }, 0), W = 620, H = 200, L = 30, B = 22, bw = (W - L - 6) / 26, max = 13;
		for (var i = 0; i < 26; i++) if (n && c[i] / n * 100 > max) max = c[i] / n * 100;
		var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="Letter frequency chart">';
		for (var y = 0; y <= max; y += 5) { var yy = H - B - y / max * (H - B - 10); s += '<line x1="' + L + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" class="cg-grid"/><text x="' + (L - 4) + '" y="' + (yy + 4) + '" class="cg-axis" text-anchor="end">' + y + "%</text>"; }
		var line = "";
		for (i = 0; i < 26; i++) {
			var x = L + i * bw, pct = n ? c[i] / n * 100 : 0, h = pct / max * (H - B - 10);
			s += '<rect x="' + (x + 2).toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h.toFixed(1) + '" class="cg-bar"><title>' + AZ[i] + ": " + c[i] + " (" + pct.toFixed(1) + "%)</title></rect>";
			s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" class="cg-axis" text-anchor="middle">' + AZ[i] + "</text>";
			line += (i ? "L" : "M") + (x + bw / 2).toFixed(1) + " " + (H - B - C.EN[i] / max * (H - B - 10)).toFixed(1);
		}
		s += '<path d="' + line + '" class="cg-enline"/></svg>';
		$("cg-freq").innerHTML = s;
		var io = C.ioc(c);
		$("cg-fstats").innerHTML = stat("Letters", grp(n)) + stat("Index of coincidence", n > 1 ? io.toFixed(4) : "–", "English ≈ 0.067 · random ≈ 0.038") +
			stat("Looks like", n < 20 ? "too short" : io > 0.058 ? "one alphabet" : io > 0.045 ? "a few alphabets" : "many alphabets", io > 0.058 ? "Caesar, Atbash, affine or substitution" : "Vigenère-type (key word)");
	}
	function stat(l, v, sub) { return '<div class="tu-stat"><span class="tu-stat__label">' + esc(l) + '</span><span class="tu-stat__value">' + esc(v) + "</span>" + (sub ? '<span class="tu-stat__sub">' + esc(sub) + "</span>" : "") + "</div>"; }
	function doCrack() {
		var t = $("cg-ct").value, out = $("cg-crout"); drawFreq(t); var r = C.autoCrack(t);
		if (r.err) { out.innerHTML = '<div class="tu-card"><p class="cg-err">' + esc(r.err) + "</p></div>"; return; }
		var b = r.best, h = '<div class="tu-card cg-hero"><span class="cg-badge">Best guess</span><h2 class="cg-verdict">' + esc(b.label) + '</h2><p class="cg-plain">' + esc(b.text.slice(0, 1500)) + '</p><div class="cg-acts"><button type="button" class="tu-btn tu-btn--primary" data-use="1">Open in the Ciphers tab</button><button type="button" class="tu-btn tu-btn--ghost" data-cp="1">Copy</button></div>';
		if (r.plain > b.score - 0.05) h += '<p class="cg-note">The message already looks like plain English, so it may not be encrypted at all.</p>';
		h += '<details class="cg-more"><summary>Other candidates</summary><ol class="cg-cands">' + r.all.slice(1).map(function (x) { return "<li><b>" + esc(x.label) + "</b>: " + esc(x.text.slice(0, 140)) + "</li>"; }).join("") + "</ol></details></div>";
		var cz = C.crackCaesar(t);
		h += '<div class="tu-card"><h2 class="cg-h">All 26 Caesar shifts, most English-like first</h2><ol class="cg-shifts">' + cz.map(function (x, i) { return '<li class="' + (i === 0 ? "is-best" : "") + '"><span class="cg-sk">' + x.k + "</span> " + esc(x.text.slice(0, 90)) + "</li>"; }).join("") + "</ol></div>";
		if (C.letters(t).length >= 40) {
			var kl = C.keyLengths(t, 16), vg = C.crackVigenere(t, 16), ks = C.kasiski(t), W = 620, H = 170, bw = (W - 40) / kl.length, mx = Math.max(0.075, Math.max.apply(null, kl.map(function (x) { return x.ioc; })));
			var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="cg-svg" role="img" aria-label="Index of coincidence by key length">';
			var yE = H - 22 - C.IOC_EN / mx * (H - 36); s += '<line x1="34" x2="' + W + '" y1="' + yE + '" y2="' + yE + '" class="cg-enline"/><text x="' + (W - 4) + '" y="' + (yE - 4) + '" class="cg-axis" text-anchor="end">English 0.067</text>';
			kl.forEach(function (x, i) { var hh = x.ioc / mx * (H - 36), xx = 36 + i * bw; s += '<rect x="' + (xx + 3) + '" y="' + (H - 22 - hh) + '" width="' + (bw - 6) + '" height="' + hh + '" class="cg-bar' + (x.len === vg.len ? " is-pick" : "") + '"><title>Key length ' + x.len + ": " + x.ioc.toFixed(4) + "</title></rect><text x=\"" + (xx + bw / 2) + '" y="' + (H - 6) + '" class="cg-axis" text-anchor="middle">' + x.len + "</text>"; });
			s += "</svg>";
			var facs = Object.keys(ks.factors).sort(function (a, b) { return ks.factors[b] - ks.factors[a]; }).slice(0, 5);
			h += '<div class="tu-card"><h2 class="cg-h">If it is a Vigenère cipher</h2><p class="cg-note">Split the letters into columns for each possible key length. When the length is right, every column is a plain Caesar shift and looks like English (high bar). Best length: <b>' + vg.len + "</b>, key <b>" + esc(vg.key) + "</b>.</p>" + s +
				'<p class="cg-note"><b>Kasiski test:</b> ' + (ks.reps.length ? ks.reps.length + " repeated 3-letter groups; their distances are most often divisible by " + facs.map(function (f) { return f + " (" + ks.factors[f] + "×)"; }).join(", ") + ". The key length is usually one of those." : "no repeated 3-letter groups found (the message may be too short).") + "</p></div>";
		}
		out.innerHTML = h;
		out.querySelector("[data-cp]").onclick = function () { copy(b.text); };
		out.querySelector("[data-use]").onclick = function () {
			$("cg-c").value = b.type; S.dir = "dec"; paintDir("dec");
			if (b.type === "caesar") $("cg-shift").value = b.k; if (b.type === "affine") { $("cg-aa").value = b.a; $("cg-ab").value = b.b; } if (b.type === "vigenere") $("cg-key").value = b.key;
			$("cg-in").value = t; runCipher(); showTab("cipher", true); root.scrollIntoView({ behavior: "smooth" });
		};
	}

	/* =================== RSA =================== */
	var KEYOBJ = null;
	function initRsa() {
		if (S.rp) { $("cg-p").value = S.rp; $("cg-q").value = S.rq; $("cg-e").value = S.re || ""; }
		if (S.rmsg) $("cg-rmsg").value = S.rmsg;
		$("cg-rsago").onclick = makeKeys; ["cg-p", "cg-q", "cg-e"].forEach(function (id) { $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") makeKeys(); }); });
		seg("cg-bits", "", function (b) { randomKeys(+b); }, "b");
		seg("cg-rmode", S.rmode, function (v) { S.rmode = v; save(); if (v === "num" && !/^\d+$/.test($("cg-rmsg").value)) $("cg-rmsg").value = "65"; if (v === "text" && /^\d+$/.test($("cg-rmsg").value)) $("cg-rmsg").value = "Hi MES!"; rsaMsg(); });
		$("cg-rmsg").addEventListener("input", rsaMsg);
		$("cg-rsacrack").onclick = rsaCrack;
		makeKeys();
	}
	function randomKeys(bits) {
		$("cg-rsakey").innerHTML = '<p class="cg-wait">Finding two random ' + bits + "-bit primes…</p>"; err("cg-rsaerr");
		setTimeout(function () {
			var t0 = performance.now(), p = C.randomPrime(bits, rnd), qq; do { qq = C.randomPrime(bits, rnd); } while (qq === p);
			$("cg-p").value = p.toString(); $("cg-q").value = qq.toString(); $("cg-e").value = bits >= 32 ? "65537" : ""; makeKeys(performance.now() - t0);
		}, 30);
	}
	function makeKeys(ms) {
		var p = C.big($("cg-p").value), qq = C.big($("cg-q").value), e = $("cg-e").value.trim() ? C.big($("cg-e").value) : null;
		if (p === null || qq === null || ($("cg-e").value.trim() && e === null)) { err("cg-rsaerr", "p, q and e must be whole numbers."); return; }
		var k = C.rsaKey(p, qq, e); if (k.err) { err("cg-rsaerr", k.err); KEYOBJ = null; $("cg-rsakey").innerHTML = ""; $("cg-rsamsg").innerHTML = ""; return; }
		err("cg-rsaerr"); KEYOBJ = k; S.rp = $("cg-p").value; S.rq = $("cg-q").value; S.re = $("cg-e").value; save();
		var big = k.bits > 80;
		var h = '<div class="tu-stats cg-keys">' +
			kv("n = p × q", k.n, k.bits + "-bit modulus · public") + kv("φ(n) = (p − 1)(q − 1)", k.phi, "secret") + kv("e (public exponent)", k.e, "gcd(e, φ) = 1") + kv("d = e⁻¹ mod φ(n)", k.d, "private key") + "</div>";
		h += '<div class="cg-keypair"><div class="cg-kp cg-kp--pub"><b>Public key</b> (share it): e = ' + esc(short(k.e)) + ", n = " + esc(short(k.n)) + '</div><div class="cg-kp cg-kp--priv"><b>Private key</b> (keep it): d = ' + esc(short(k.d)) + "</div></div>";
		h += '<p class="cg-note">Check: e × d = ' + esc(short(k.e * k.d)) + " = " + esc(short(k.e * k.d / k.phi)) + " × φ(n) + 1 ✓" + (ms ? " · primes found in " + Math.round(ms) + " ms" : "") + ' · <a href="/primes?n=' + p + '">Check p in Prime Numbers ›</a></p>';
		var st = k.steps;
		if (st.length <= 60) h += '<details class="cg-more"><summary>How d was found (extended Euclidean algorithm)</summary><div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>q</th><th>remainder r</th><th>s</th><th>t</th></tr></thead><tbody>' +
			st.map(function (r) { return "<tr><td>" + (r.q === null ? "" : esc(short(r.q, 30))) + "</td><td>" + esc(short(r.r, 30)) + "</td><td>" + esc(short(r.s, 30)) + "</td><td>" + esc(short(r.t, 30)) + "</td></tr>"; }).join("") + '</tbody></table></div><p class="cg-note">Each row: r = s·φ(n) + t·e. When r reaches 1, t is the inverse of e (taken mod φ(n)): d = ' + esc(short(k.d)) + ".</p></details>";
		$("cg-rsakey").innerHTML = h; $("cg-rsacrout").innerHTML = ""; rsaMsg();
	}
	function kv(l, v, sub) { return '<div class="tu-stat"><span class="tu-stat__label">' + esc(l) + '</span><span class="tu-stat__value cg-num-v">' + esc(short(v, 44)) + '</span><span class="tu-stat__sub">' + esc(sub) + "</span></div>"; }
	function rsaMsg() {
		var out = $("cg-rsamsg"), k = KEYOBJ; S.rmsg = $("cg-rmsg").value.slice(0, 400); save();
		$("cg-rmsglab").textContent = S.rmode === "num" ? "A number smaller than n" : "Message (encrypted with the public key e, n)";
		if (!k) { out.innerHTML = ""; return; }
		if (S.rmode === "num") {
			var m = C.big(S.rmsg); if (m === null || m < 0n) { out.innerHTML = '<p class="cg-err">Type a whole number.</p>'; return; }
			if (m >= k.n) { out.innerHTML = '<p class="cg-err">The number must be smaller than n = ' + esc(short(k.n)) + ".</p>"; return; }
			var enc = C.modpowSteps(m, k.e, k.n), dec = C.modpowSteps(enc.result, k.d, k.n);
			out.innerHTML = '<div class="cg-flow"><div><span class="cg-fl">Message m</span><b>' + esc(short(m)) + '</b></div><div class="cg-arr">→ m<sup>e</sup> mod n →</div><div><span class="cg-fl">Encrypted c</span><b>' + esc(short(enc.result)) + '</b></div><div class="cg-arr">→ c<sup>d</sup> mod n →</div><div><span class="cg-fl">Decrypted</span><b>' + esc(short(dec.result)) + (dec.result === m ? " ✓" : "") + "</b></div></div>" + stepsTable(enc, "m", k.e);
			return;
		}
		var tb = C.textToBlocks(S.rmsg, k.n); if (tb.err) { out.innerHTML = '<p class="cg-err">' + esc(tb.err) + "</p>"; return; }
		var rows = tb.blocks.map(function (b) { var c = C.modpowSteps(b.m, k.e, k.n).result; return { m: b.m, c: c, d: C.modpowSteps(c, k.d, k.n).result }; });
		var back = C.blocksToText(rows.map(function (r) { return r.d; }), tb.k, tb.blocks[tb.blocks.length - 1].len);
		var h = '<p class="cg-note">The text becomes bytes (UTF-8), packed ' + tb.k + " byte" + (tb.k > 1 ? "s" : "") + " at a time into numbers smaller than n. Each number is encrypted on its own.</p>";
		h += '<div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>Block</th><th>Number m</th><th>Encrypted c = m<sup>e</sup> mod n</th><th>Decrypted c<sup>d</sup> mod n</th></tr></thead><tbody>' +
			rows.slice(0, 40).map(function (r, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(short(r.m, 34)) + "</td><td>" + esc(short(r.c, 34)) + "</td><td>" + esc(short(r.d, 34)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
		var ctext = rows.map(function (r) { return r.c.toString(); }).join(" ");
		h += '<p class="cg-status"><b>Back to text:</b> ' + esc(back === null ? "(could not decode)" : back) + (back === S.rmsg ? " ✓" : "") + '</p><div class="cg-acts"><button type="button" class="tu-btn tu-btn--ghost" id="cg-rcopy">Copy the encrypted numbers</button></div>';
		h += '<p class="cg-note">This is “textbook RSA”: the same block always encrypts the same way, so it leaks patterns. Real RSA adds random padding (OAEP) and mostly encrypts a short AES key, not the message itself.</p>';
		out.innerHTML = h; $("cg-rcopy").onclick = function () { copy(ctext); };
	}
	function stepsTable(st, base, e) {
		var rows = st.rows, show = rows.length <= 70 ? rows : rows.slice(0, 30).concat([null]).concat(rows.slice(-20));
		return '<details class="cg-more"' + (rows.length <= 20 ? " open" : "") + '><summary>Square and multiply: ' + rows.length + " steps instead of " + esc(short(e)) + ' multiplications</summary><p class="cg-note">e in binary is ' + esc(short(st.bits, 70)) + ". Go through the bits from the left: square the running result every time, and also multiply by " + base + " when the bit is 1.</p><div class=\"tu-table-wrap\"><table class=\"tu-table cg-tab\"><thead><tr><th>Bit</th><th>Square</th><th>Result</th></tr></thead><tbody>" +
			show.map(function (r) { return r ? "<tr><td>" + r.bit + "</td><td>" + esc(short(r.sq, 32)) + "</td><td>" + esc(short(r.r, 32)) + "</td></tr>" : '<tr><td colspan="3">…</td></tr>'; }).join("") + "</tbody></table></div></details>";
	}
	function rsaCrack() {
		var k = KEYOBJ, out = $("cg-rsacrout"); if (!k) return;
		out.innerHTML = '<p class="cg-wait">Trying to factor n = ' + esc(short(k.n)) + " …</p>";
		setTimeout(function () {
			var t0 = performance.now(), r = C.rsaCrack(k.n, k.e, 4000), ms = performance.now() - t0;
			if (r.ok) out.innerHTML = '<div class="cg-hero cg-bad"><span class="cg-badge">Broken in ' + (ms < 1000 ? Math.max(1, Math.round(ms)) + " ms" : (ms / 1000).toFixed(1) + " s") + '</span><p>n = ' + esc(short(r.key.p)) + " × " + esc(short(r.key.q)) + ", so the attacker computes φ(n) and the private key d = " + esc(short(r.key.d)) + ". Every message can now be read.</p></div>";
			else out.innerHTML = '<div class="cg-hero cg-good"><span class="cg-badge">Not broken</span><p>No factor found in ' + (ms / 1000).toFixed(1) + " s. A " + k.bits + "-bit n made of two equal-size primes is out of reach for a browser" + (k.bits >= 1024 ? "; the best known methods would need enormous computing power for 2048 bits." : ". Bigger computers with the number field sieve break up to about 830 bits.") + "</p></div>";
		}, 30);
	}

	/* =================== Diffie-Hellman =================== */
	function initDh() {
		["cg-dp", "cg-dg", "cg-da", "cg-db"].forEach(function (id) { $(id).addEventListener("input", runDh); });
		seg("cg-dbits", "", function (b) { randomDh(+b); }, "b");
		drawPaint(); runDh();
	}
	function randomDh(bits) {
		var p = bits <= 8 ? P.nextPrime(BigInt(40 + Math.floor(Math.random() * 200))) : null;
		if (!p) { var qq; for (var i = 0; i < 400; i++) { qq = C.randomPrime(bits - 1, rnd); p = 2n * qq + 1n; if (P.isPrime(p)) break; } }   // safe prime: g = 2 or small works
		var g = C.smallestRoot(p) || 2n;
		$("cg-dp").value = p.toString(); $("cg-dg").value = g.toString();
		$("cg-da").value = C.randBig(2n, p - 1n, rnd).toString(); $("cg-db").value = C.randBig(2n, p - 1n, rnd).toString(); runDh();
	}
	function runDh() {
		var p = C.big($("cg-dp").value), g = C.big($("cg-dg").value), a = C.big($("cg-da").value), b = C.big($("cg-db").value), out = $("cg-dhout");
		if ([p, g, a, b].some(function (x) { return x === null || x < 1n; })) { err("cg-dherr", "Type whole numbers above 0."); out.innerHTML = ""; return; }
		if (!P.isPrime(p)) { err("cg-dherr", "p must be a prime. Next prime: " + P.nextPrime(p) + "."); out.innerHTML = ""; return; }
		err("cg-dherr");
		var r = C.dh(p, g, a, b), root = C.isPrimitiveRoot(g, p);
		var h = '<div class="cg-dh"><div class="cg-dhcol"><h3>Alice</h3><p>secret a = <b>' + esc(short(a, 30)) + "</b></p><p>sends A = g<sup>a</sup> mod p</p><p class=\"cg-big\">" + esc(short(r.A, 30)) + "</p><p>secret = B<sup>a</sup> mod p</p><p class=\"cg-big cg-sec\">" + esc(short(r.sA, 30)) + '</p></div>' +
			'<div class="cg-dhcol cg-dhcol--eve"><h3>Eve hears</h3><p>p = ' + esc(short(p, 30)) + "</p><p>g = " + esc(short(g, 30)) + "</p><p>A = " + esc(short(r.A, 30)) + "</p><p>B = " + esc(short(r.B, 30)) + '</p></div>' +
			'<div class="cg-dhcol"><h3>Bob</h3><p>secret b = <b>' + esc(short(b, 30)) + "</b></p><p>sends B = g<sup>b</sup> mod p</p><p class=\"cg-big\">" + esc(short(r.B, 30)) + "</p><p>secret = A<sup>b</sup> mod p</p><p class=\"cg-big cg-sec\">" + esc(short(r.sB, 30)) + "</p></div></div>";
		h += '<p class="cg-status">' + (r.sA === r.sB ? "✓ Both get the same secret, because (g<sup>b</sup>)<sup>a</sup> = (g<sup>a</sup>)<sup>b</sup> = g<sup>ab</sup>." : "") + (root === false ? " Note: g is not a primitive root of p, so it only reaches some of the numbers (a smaller, weaker group)." : root ? " g is a primitive root of p: its powers reach every number 1 … p − 1." : "") + "</p>";
		if (p <= 1000000000000n) {
			var t0 = performance.now(), dl = C.dlog(g, r.A, p), ms = performance.now() - t0;
			h += '<div class="cg-hero cg-bad"><span class="cg-badge">Eve wins (p is small)</span><p>Eve solves g<sup>x</sup> ≡ A (mod p) with baby-step giant-step in ' + grp(dl.steps) + " steps (" + Math.max(1, Math.round(ms)) + " ms): x = " + esc(dl.x) + ", then the secret = B<sup>x</sup> mod p = " + esc(short(P.modpow(r.B, dl.x, p))) + ".</p></div>";
		} else {
			var bits = C.bitLen(p), steps = Math.pow(2, bits / 2);
			h += '<div class="cg-hero cg-good"><span class="cg-badge">Eve is stuck</span><p>Working back from A to a is the <b>discrete logarithm</b> problem. Baby-step giant-step would need about 2<sup>' + Math.round(bits / 2) + "</sup> ≈ " + sci(steps) + " steps for this " + bits + "-bit p. Real systems use 2048-bit primes or elliptic curves.</p></div>";
		}
		out.innerHTML = h;
	}
	function mix(a, b) { return [Math.round((a[0] + b[0]) / 2 * 0.95), Math.round((a[1] + b[1]) / 2 * 0.95), Math.round((a[2] + b[2]) / 2 * 0.95)]; }
	function drawPaint() {
		var Y = [240, 200, 40], R = [210, 50, 60], Bl = [40, 90, 220], AY = mix(Y, R), BY = mix(Y, Bl), Sk = mix(AY, Bl);
		function rgb(c) { return "rgb(" + c.join(",") + ")"; }
		function pot(x, y, c, lab, sub) { return '<g transform="translate(' + x + " " + y + ')"><path d="M-26 -18 L26 -18 L22 22 Q0 30 -22 22 Z" fill="' + rgb(c) + '" class="cg-pot"/><text y="44" class="cg-pl">' + lab + "</text>" + (sub ? '<text y="60" class="cg-ps">' + sub + "</text>" : "") + "</g>"; }
		var s = '<svg viewBox="0 0 640 420" class="cg-svg cg-paintsvg" role="img" aria-label="Diffie-Hellman paint mixing">' +
			'<text x="110" y="24" class="cg-ph">Alice</text><text x="320" y="24" class="cg-ph">Public</text><text x="530" y="24" class="cg-ph">Bob</text>' +
			'<line x1="215" y1="34" x2="215" y2="410" class="cg-dash"/><line x1="425" y1="34" x2="425" y2="410" class="cg-dash"/>' +
			pot(320, 70, Y, "common paint", "everyone sees it") + pot(110, 70, R, "Alice's secret", "never sent") + pot(530, 70, Bl, "Bob's secret", "never sent") +
			pot(110, 190, AY, "mix", "secret + common") + pot(530, 190, BY, "mix", "secret + common") +
			pot(270, 190, AY, "sent →", "") + pot(370, 190, BY, "← sent", "") +
			pot(110, 330, Sk, "shared secret", "+ her secret") + pot(530, 330, Sk, "shared secret", "+ his secret") +
			'<text x="320" y="300" class="cg-ps">Eve sees the common paint and both mixes,</text><text x="320" y="318" class="cg-ps">but can\'t un-mix them to get either secret.</text>' +
			'<path d="M110 102 L110 160 M530 102 L530 160 M140 190 L238 190 M500 190 L402 190 M370 222 Q250 280 140 318 M270 222 Q390 280 500 318" class="cg-arrowp"/></svg>';
		$("cg-paint").innerHTML = s;
	}

	/* =================== Hashes =================== */
	var subtle = window.crypto && crypto.subtle;
	function initHash() {
		if (S.hin) $("cg-hin").value = S.hin;
		$("cg-hin").addEventListener("input", runHash); ["cg-av1", "cg-av2"].forEach(function (id) { $(id).addEventListener("input", runAv); });
		var drop = $("cg-hdrop"), f = $("cg-hfile");
		drop.onclick = function () { f.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f.click(); } };
		f.onchange = function () { if (f.files[0]) hashFile(f.files[0]); f.value = ""; };
		dropZone(drop, hashFile);
		runHash(); runAv();
	}
	function dropZone(el, fn) {
		el.addEventListener("dragover", function (e) { e.preventDefault(); el.classList.add("is-over"); });
		el.addEventListener("dragleave", function () { el.classList.remove("is-over"); });
		el.addEventListener("drop", function (e) { e.preventDefault(); el.classList.remove("is-over"); var file = e.dataTransfer.files && e.dataTransfer.files[0]; if (file) fn(file); });
	}
	function hrow(name, hex, note) { return '<div class="cg-hrow"><span class="cg-hn">' + name + (note ? ' <small>' + note + "</small>" : "") + '</span><code class="cg-hv">' + hex + '</code><button type="button" class="tu-btn tu-btn--ghost cg-hc" data-h="' + hex + '" aria-label="Copy ' + name + '">Copy</button></div>'; }
	function hexOf(buf) { return C.hex(new Uint8Array(buf)); }
	var hashSeq = 0;
	function runHash() {
		var t = $("cg-hin").value; S.hin = t.slice(0, 5000); save(); var b = C.utf8(t), seq = ++hashSeq;
		var base = hrow("MD5", C.md5(b), "broken, don't use for security") + hrow("SHA-256", C.sha256(b)) + hrow("CRC32", C.crc32(b), "error check, not security");
		$("cg-hout").innerHTML = base;
		if (!subtle) return;
		Promise.all(["SHA-1", "SHA-384", "SHA-512"].map(function (n) { return subtle.digest(n, b); })).then(function (r) {
			if (seq !== hashSeq) return;
			$("cg-hout").innerHTML = hrow("MD5", C.md5(b), "broken, don't use for security") + hrow("SHA-1", hexOf(r[0]), "weak since 2017") + hrow("SHA-256", C.sha256(b)) + hrow("SHA-384", hexOf(r[1])) + hrow("SHA-512", hexOf(r[2])) + hrow("CRC32", C.crc32(b), "error check, not security");
		});
	}
	root.addEventListener("click", function (e) { var c = e.target.closest("[data-h]"); if (c) copy(c.dataset.h, "Hash copied"); });
	function hashFile(file) {
		var out = $("cg-hfout"); out.innerHTML = '<p class="cg-wait">Reading ' + esc(file.name) + "…</p>";
		file.arrayBuffer().then(function (ab) {
			var b = new Uint8Array(ab), jobs = subtle ? ["SHA-1", "SHA-256", "SHA-512"].map(function (n) { return subtle.digest(n, ab); }) : [];
			return Promise.all(jobs).then(function (r) {
				var h = '<p class="cg-status"><b>' + esc(file.name) + "</b> · " + grp(file.size) + " bytes</p>";
				if (b.length <= 128 * 1024 * 1024) h += hrow("MD5", C.md5(b));
				if (r.length) h += hrow("SHA-1", hexOf(r[0])) + hrow("SHA-256", hexOf(r[1])) + hrow("SHA-512", hexOf(r[2])); else h += hrow("SHA-256", C.sha256(b));
				h += hrow("CRC32", C.crc32(b)) + '<p class="cg-note">Compare the SHA-256 with the one the download site lists: if even one character differs, the file is not the same.</p>';
				out.innerHTML = h;
			});
		}).catch(function () { out.innerHTML = '<p class="cg-err">Could not read that file (too big for the browser?).</p>'; });
	}
	function runAv() {
		var a = C.sha256($("cg-av1").value), b = C.sha256($("cg-av2").value), A = C.bitsOf(a), B = C.bitsOf(b), d = 0, h = "";
		for (var i = 0; i < 256; i++) { var diff = A[i] !== B[i]; if (diff) d++; h += '<span class="' + (diff ? "is-diff " : "") + (A[i] === "1" ? "b1" : "b0") + '"></span>'; }
		$("cg-avbits").innerHTML = h;
		$("cg-avstat").innerHTML = "<b>" + d + " of 256 bits differ</b> (" + Math.round(d / 2.56) + "%)" + (d === 0 ? " — the two texts are the same." : ". Random would be about 128.") + '<br><code class="cg-hv cg-hv--sm">A: ' + a + '</code><br><code class="cg-hv cg-hv--sm">B: ' + b + "</code>";
	}

	/* =================== AES =================== */
	function initAes() {
		$("cg-pwshow").onclick = function () { var p = $("cg-pw"); p.type = p.type === "password" ? "text" : "password"; $("cg-pwshow").textContent = p.type === "password" ? "Show" : "Hide"; };
		$("cg-pw").addEventListener("input", pwStrength); pwStrength();
		if (!subtle) { err("cg-aerr", "Your browser has no Web Crypto here (it needs a secure https page)."); return; }
		$("cg-aenc").onclick = function () { aesText(true); }; $("cg-adec").onclick = function () { aesText(false); };
		$("cg-acopy").onclick = function () { copy($("cg-aout").value); };
		var drop = $("cg-afdrop"), f = $("cg-afile");
		drop.onclick = function () { f.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f.click(); } };
		f.onchange = function () { if (f.files[0]) aesFile(f.files[0]); f.value = ""; }; dropZone(drop, aesFile);
	}
	function fmtTime(sec) {
		if (sec < 1) return "less than a second"; var u = [["years", 31557600], ["days", 86400], ["hours", 3600], ["minutes", 60], ["seconds", 1]];
		for (var i = 0; i < u.length; i++) if (sec >= u[i][1]) { var v = sec / u[i][1]; if (u[i][0] === "years" && v > 1e6) return "about " + sci(v) + " years"; return "about " + (v < 10 ? v.toFixed(1) : grp(Math.round(v))) + " " + u[i][0]; }
	}
	function pwStrength() {
		var pw = $("cg-pw").value, s = C.passwordSpace(pw), st = $("cg-pwst");
		if (!pw) { st.textContent = "Use a long passphrase: four or five random words beat a short password with symbols."; st.className = "cg-status"; return; }
		var sec = Math.pow(2, s.bits) / 2 / 1e5;
		st.innerHTML = "About <b>" + Math.round(s.bits) + " bits</b> if it were random. A guessing attack with a strong graphics card (~100,000 guesses a second against 250,000 PBKDF2 rounds) would need " + fmtTime(sec) + ". Dictionary words and names fall much faster.";
		st.className = "cg-status " + (s.bits < 40 ? "cg-weak" : s.bits < 64 ? "cg-medium" : "cg-strong");
	}
	function deriveKey(pw, salt) {
		return subtle.importKey("raw", C.utf8(pw), "PBKDF2", false, ["deriveKey"]).then(function (k) { return subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: C.PBKDF2_ITER, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); });
	}
	function aesText(enc) {
		var pw = $("cg-pw").value, t = $("cg-ain").value; err("cg-aerr");
		if (!pw) { err("cg-aerr", "Type a password first."); $("cg-pw").focus(); return; }
		if (enc) {
			if (!t) { err("cg-aerr", "Type a message to encrypt."); return; }
			var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
			deriveKey(pw, salt).then(function (k) { return subtle.encrypt({ name: "AES-GCM", iv: iv }, k, C.utf8(t)); }).then(function (ct) { $("cg-aout").value = C.pack(salt, iv, new Uint8Array(ct)); toast("Encrypted"); });
		} else {
			var u = C.unpack(t); if (!u) { err("cg-aerr", "That is not an MES1… text. Paste the whole thing, starting with MES1."); return; }
			deriveKey(pw, u.salt).then(function (k) { return subtle.decrypt({ name: "AES-GCM", iv: u.iv }, k, u.ct); }).then(function (pt) { $("cg-aout").value = C.fromUtf8(new Uint8Array(pt)); toast("Decrypted"); }, function () { err("cg-aerr", "Wrong password, or the text was changed (AES-GCM notices any change)."); });
		}
	}
	var MAGIC = C.utf8("MESENC1");
	function aesFile(file) {
		var pw = $("cg-pw").value, st = $("cg-afst"); if (!pw) { st.innerHTML = '<span class="cg-err">Type a password above first.</span>'; $("cg-pw").focus(); return; }
		st.textContent = "Working on " + file.name + "…";
		file.arrayBuffer().then(function (ab) {
			var b = new Uint8Array(ab), isEnc = b.length > 7 + 28 && MAGIC.every(function (x, i) { return b[i] === x; });
			if (isEnc) {
				var salt = b.slice(7, 23), iv = b.slice(23, 35), ct = b.slice(35);
				return deriveKey(pw, salt).then(function (k) { return subtle.decrypt({ name: "AES-GCM", iv: iv }, k, ct); }).then(function (pt) {
					var p = new Uint8Array(pt), nl = p[0] << 8 | p[1], name = C.fromUtf8(p.slice(2, 2 + nl)) || "decrypted";
					download(p.slice(2 + nl), name); st.textContent = "Decrypted: " + name + " (" + grp(p.length - 2 - nl) + " bytes) saved to your downloads.";
				}, function () { st.innerHTML = '<span class="cg-err">Wrong password, or the file was changed.</span>'; });
			}
			var nm = C.utf8(file.name).slice(0, 1000), payload = new Uint8Array(2 + nm.length + b.length); payload[0] = nm.length >> 8; payload[1] = nm.length & 255; payload.set(nm, 2); payload.set(b, 2 + nm.length);
			var s2 = crypto.getRandomValues(new Uint8Array(16)), iv2 = crypto.getRandomValues(new Uint8Array(12));
			return deriveKey(pw, s2).then(function (k) { return subtle.encrypt({ name: "AES-GCM", iv: iv2 }, k, payload); }).then(function (ct2) {
				var c = new Uint8Array(ct2), outb = new Uint8Array(7 + 28 + c.length); outb.set(MAGIC); outb.set(s2, 7); outb.set(iv2, 23); outb.set(c, 35);
				download(outb, file.name.replace(/\.[^.]*$/, "") + ".mesenc"); st.textContent = "Encrypted to " + file.name.replace(/\.[^.]*$/, "") + ".mesenc (the real name is hidden inside). Drop it here with the same password to get the file back.";
			});
		}).catch(function () { st.innerHTML = '<span class="cg-err">Could not read that file.</span>'; });
	}
	function download(bytes, name) { var u = URL.createObjectURL(new Blob([bytes])), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }

	/* =================== Encoders =================== */
	function initEnc() {
		$("cg-ef").value = S.ef; if (S.ein) $("cg-ein").value = S.ein;
		var paint = seg("cg-edir", S.edir, function (v) { S.edir = v; runEnc(); });
		["cg-ef", "cg-ein", "cg-exk"].forEach(function (id) { $(id).addEventListener("input", runEnc); });
		$("cg-eswap").onclick = function () { $("cg-ein").value = $("cg-eout").value; S.edir = S.edir === "enc" ? "dec" : "enc"; paint(S.edir); runEnc(); };
		$("cg-ecopy").onclick = function () { copy($("cg-eout").value); };
		$("cg-eplay").onclick = playMorse; runEnc();
	}
	function runEnc() {
		S.ef = $("cg-ef").value; S.ein = $("cg-ein").value.slice(0, 20000); save();
		var f = S.ef, t = S.ein, dec = S.edir === "dec", r = null, msg = "";
		$("cg-exkw").hidden = f !== "xor"; $("cg-eplay").hidden = f !== "morse";
		try {
			if (f === "b64" || f === "b64u") { if (dec) { var b = C.fromB64(t); r = b ? C.fromUtf8(b) : null; } else r = C.b64(C.utf8(t), f === "b64u"); }
			else if (f === "hex") { if (dec) { var h = C.fromHex(t); r = h ? C.fromUtf8(h) : null; } else r = C.hex(C.utf8(t)).replace(/(..)/g, "$1 ").trim(); }
			else if (f === "bin") { if (dec) { var bb = C.fromBinary(t); r = bb ? C.fromUtf8(bb) : null; } else r = C.binary(C.utf8(t)); }
			else if (f === "morse") r = dec ? C.fromMorse(t) : C.morse(t);
			else if (f === "url") r = dec ? decodeURIComponent(t.replace(/\+/g, " ")) : encodeURIComponent(t);
			else if (f === "rot47") r = C.rot47(t);
			else if (f === "xor") { var k = C.utf8($("cg-exk").value); if (dec) { var x = C.fromHex(t); r = x ? C.fromUtf8(C.xor(x, k)) : null; } else r = C.hex(C.xor(C.utf8(t), k)); }
		} catch (e) { r = null; }
		if (r === null && t) msg = dec ? "That doesn't decode as " + $("cg-ef").selectedOptions[0].textContent + " (or it isn't text)." : "";
		err("cg-eerr", msg); $("cg-eout").value = r || "";
	}
	var actx = null;
	function playMorse() {
		var m = S.edir === "dec" ? $("cg-ein").value : $("cg-eout").value; if (!m.trim()) return;
		actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var t = actx.currentTime + 0.05, u = 0.08;
		var o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 650; g.gain.value = 0; o.connect(g); g.connect(actx.destination);
		Array.from(m).forEach(function (ch) {
			if (ch === "." || ch === "-") { var d = ch === "." ? u : 3 * u; g.gain.setValueAtTime(0.25, t); g.gain.setValueAtTime(0, t + d); t += d + u; }
			else if (ch === " ") t += 2 * u; else if (ch === "/") t += 4 * u;
		});
		o.start(); o.stop(t + 0.1);
	}

	/* =================== Modular maths =================== */
	function initMod() {
		["cg-ma", "cg-me", "cg-mm"].forEach(function (id) { $(id).addEventListener("input", runModpow); });
		["cg-ia", "cg-im"].forEach(function (id) { $(id).addEventListener("input", runInv); });
		["cg-clm", "cg-cls", "cg-cla"].forEach(function (id) { $(id).addEventListener("input", drawClock); });
		runModpow(); runInv(); drawClock();
	}
	function runModpow() {
		var a = C.big($("cg-ma").value), e = C.big($("cg-me").value), m = C.big($("cg-mm").value), out = $("cg-mout");
		if (a === null || e === null || m === null || e < 0n || m < 1n) { err("cg-merr", "Whole numbers please, with e ≥ 0 and m ≥ 1."); out.innerHTML = ""; return; }
		err("cg-merr"); var st = C.modpowSteps(a, e, m);
		out.innerHTML = '<p class="cg-big-ans">' + esc(short(a, 30)) + "<sup>" + esc(short(e, 24)) + "</sup> mod " + esc(short(m, 30)) + " = <b>" + esc(short(st.result)) + "</b></p>" + stepsTable(st, "a", e) + '<p class="cg-note">This is the one operation RSA and Diffie–Hellman are built on: easy forwards even for 600-digit numbers, but very hard to undo.</p>';
	}
	function runInv() {
		var a = C.big($("cg-ia").value), m = C.big($("cg-im").value), out = $("cg-iout");
		if (a === null || m === null || m < 2n) { out.innerHTML = '<p class="cg-err">Whole numbers, with mod at least 2.</p>'; return; }
		var g = P.gcd(C.mod(a, m), m), inv = P.modInverse(a, m), st = C.egcdSteps(m, C.mod(a, m));
		var h = inv === null ? '<p class="cg-err">' + esc(a) + " has no inverse mod " + esc(m) + ": they share the factor " + esc(g) + ' (gcd ≠ 1). <a href="/primes?g=' + a + "," + m + '">See why in Prime Numbers ›</a></p>' : '<p class="cg-big-ans">' + esc(short(a, 30)) + "<sup>−1</sup> mod " + esc(short(m, 30)) + " = <b>" + esc(short(inv)) + '</b></p><p class="cg-note">Check: ' + esc(short(a, 30)) + " × " + esc(short(inv, 30)) + " = " + esc(short(a * inv, 40)) + " ≡ 1 (mod " + esc(short(m, 30)) + ")</p>";
		if (st.length <= 60) h += '<div class="tu-table-wrap"><table class="tu-table cg-tab"><thead><tr><th>q</th><th>r</th><th>s</th><th>t</th></tr></thead><tbody>' + st.map(function (r) { return "<tr><td>" + (r.q === null ? "" : esc(short(r.q, 26))) + "</td><td>" + esc(short(r.r, 26)) + "</td><td>" + esc(short(r.s, 26)) + "</td><td>" + esc(short(r.t, 26)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
		out.innerHTML = h;
	}
	function drawClock() {
		var m = +$("cg-clm").value, s0 = +$("cg-cls").value, add = +$("cg-cla").value; $("cg-cls").max = m - 1; if (s0 > m - 1) { s0 = m - 1; $("cg-cls").value = s0; }
		$("cg-clmv").textContent = m; $("cg-clsv").textContent = s0; $("cg-clav").textContent = add;
		var end = (s0 + add) % m, s = '<svg viewBox="-150 -150 300 300" class="cg-svg cg-clocksvg" role="img" aria-label="Clock arithmetic"><circle r="120" class="cg-w1"/>';
		for (var i = 0; i < m; i++) { var a = i / m * 2 * Math.PI - Math.PI / 2; s += '<circle cx="' + (Math.cos(a) * 120).toFixed(1) + '" cy="' + (Math.sin(a) * 120).toFixed(1) + '" r="' + (i === end ? 15 : i === s0 ? 12 : 4) + '" class="' + (i === end ? "cg-cend" : i === s0 ? "cg-cstart" : "cg-cdot") + '"/><text x="' + (Math.cos(a) * 98).toFixed(1) + '" y="' + (Math.sin(a) * 98 + 5).toFixed(1) + '" class="cg-wt">' + i + "</text>"; }
		var a0 = s0 / m * 2 * Math.PI - Math.PI / 2, a1 = (s0 + add) / m * 2 * Math.PI - Math.PI / 2, r = 70, laps = Math.floor((s0 + add) / m);
		if (add) { var pts = []; for (var k = 0; k <= 80; k++) { var aa = a0 + (a1 - a0) * k / 80, rr = r - 30 * k / 80 * (laps > 0 ? 1 : 0.3); pts.push((Math.cos(aa) * rr).toFixed(1) + " " + (Math.sin(aa) * rr).toFixed(1)); } s += '<path d="M' + pts.join(" L") + '" class="cg-carc"/>'; }
		s += '<text y="6" class="cg-wk">' + end + "</text></svg>";
		$("cg-clock").innerHTML = s + '<p class="cg-status">(' + s0 + " + " + add + ") mod " + m + " = " + (s0 + add) + " mod " + m + " = <b>" + end + "</b>" + (laps ? " (" + laps + " full lap" + (laps > 1 ? "s" : "") + ")" : "") + ". The Caesar cipher is exactly this with m = 26.</p>";
	}

	showTab(S.tab);
	window.MESCryptoDebug = { S: S, showTab: showTab, runCipher: runCipher, doCrack: function () { if (!inited.crack) { inited.crack = 1; initCrack(); } doCrack(); } };
})();
