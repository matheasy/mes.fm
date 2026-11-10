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

/* MES Prime Numbers -- UI (maths in lib.js, global MESPrime). Tabs: check, gcd, sieve, spiral, list.
 * State: localStorage "mes-primes:v1"; links ?tab=&n= (check) / ?g= (gcd) / ?a=&b= (list). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pm"); if (!root || !window.MESPrime) return;
	var P = window.MESPrime, G = P.group, KEY = "mes-primes:v1";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var S = Object.assign({ tab: "check", n: "97", g: "84, 120", svn: "120", spm: "ulam", sps: 45, spstart: "1", la: "1", lb: "100", chn: "100000", chv: "count" }, sget());
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var q = new URLSearchParams(location.search);
	if (q.get("n")) { S.n = q.get("n").slice(0, 400); S.tab = "check"; }
	if (q.get("g")) { S.g = q.get("g").slice(0, 400); S.tab = "gcd"; }
	if (q.get("a") && q.get("b")) { S.la = q.get("a").slice(0, 30); S.lb = q.get("b").slice(0, 30); S.tab = "list"; }
	if (q.get("tab")) S.tab = q.get("tab");
	function dark() { return document.body.classList.contains("dark-mode"); }
	function toast(t) { var el = document.querySelector(".tu-toast"); if (!el) { el = document.createElement("div"); el.className = "tu-toast"; document.body.appendChild(el); } el.textContent = t; el.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 1800); }
	function copy(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg || "Copied"); }, function () { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg || "Copied"); } catch (e) {} ta.remove(); }); }
	function setURL(params) { var u = new URL(location.href); ["tab", "n", "g", "a", "b"].forEach(function (k) { u.searchParams.delete(k); }); Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); }); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); }
	function ns(n) { return G(n.toString()); }

	/* ---------- tabs ---------- */
	var TABS = ["check", "gcd", "sieve", "spiral", "list"], inited = {};
	function showTab(t, push) {
		if (TABS.indexOf(t) < 0) t = "check"; S.tab = t; save();
		root.querySelectorAll("#pm-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.t === t); b.tabIndex = b.dataset.t === t ? 0 : -1; });
		root.querySelectorAll(".pm-pane").forEach(function (p) { p.hidden = p.dataset.pane !== t; });
		if (!inited[t]) { inited[t] = 1; ({ sieve: initSieve, spiral: initSpiral, list: initList })[t] && ({ sieve: initSieve, spiral: initSpiral, list: initList })[t](); }
		if (t === "spiral") drawSpiral();
		if (t === "list") drawChart();
		if (push) setURL(t === "check" ? { n: S.n } : t === "gcd" ? { g: S.g } : { tab: t });
	}
	$("pm-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) showTab(b.dataset.t, true); });
	$("pm-tabs").addEventListener("keydown", function (e) {
		var i = TABS.indexOf(S.tab), j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -9;
		if (j === -9) return; e.preventDefault(); j = (j + TABS.length) % TABS.length; showTab(TABS[j], true); root.querySelector('#pm-tabs [data-t="' + TABS[j] + '"]').focus();
	});

	/* ---------- check ---------- */
	var EX = [["97", "97"], ["91", "91"], ["561", "561"], ["1,000,003", "1000003"], ["2^61−1", "2^61-1"], ["2^67−1", "2^67-1"], ["600851475143", "600851475143"], ["10!+1", "10!+1"], ["8128", "8128"]];
	$("pm-ex").insertAdjacentHTML("beforeend", EX.map(function (x) { return '<button type="button" class="tu-chip" data-v="' + esc(x[1]) + '">' + esc(x[0]) + "</button>"; }).join(""));
	$("pm-ex").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { $("pm-n").value = b.dataset.v; runCheck(); } });
	$("pm-form").addEventListener("submit", function (e) { e.preventDefault(); runCheck(); });
	function bump(d) { var r = P.parse($("pm-n").value); if (r.err) return; var v = r.v + BigInt(d); if (v < 0n) v = 0n; $("pm-n").value = v.toString(); runCheck(); }
	$("pm-up").onclick = function () { bump(1); }; $("pm-dn").onclick = function () { bump(-1); };
	function checkNumber(v) { $("pm-n").value = String(v); showTab("check"); runCheck(); window.scrollTo({ top: root.getBoundingClientRect().top + scrollY - 70, behavior: "smooth" }); }
	root.addEventListener("click", function (e) { var a = e.target.closest("[data-check]"); if (a) { e.preventDefault(); checkNumber(a.dataset.check); } });

	var lastRep = null;
	function runCheck(ms) {
		var src = $("pm-n").value, r = P.parse(src), err = $("pm-err");
		if (r.err) { err.textContent = r.err; err.hidden = false; return; }
		err.hidden = true; S.n = src.trim(); save(); if (S.tab === "check") setURL({ n: S.n });
		var out = $("pm-out"); out.innerHTML = '<div class="tu-card pm-wait">Working it out…</div>';
		setTimeout(function () { lastRep = P.analyze(r.v, { ms: ms || 1500 }); renderCheck(lastRep); }, 20);
	}
	function verdict(rep) {
		var n = rep.n, a = n < 0n ? -n : n, s = ns(n);
		if (rep.kind === "zero") return ["pm-v-no", "0 is not prime", "Zero is divisible by every number, so it is neither prime nor composite."];
		if (rep.kind === "one") return ["pm-v-no", s + " is not prime", "1 has only one divisor (itself). Primes need exactly two, so 1 is neither prime nor composite." + (rep.neg ? " Negative numbers are not prime either." : "")];
		if (rep.neg) return ["pm-v-no", s + " is not prime", "Primes are positive. Below is the factorization of " + ns(a) + "."];
		if (rep.kind === "prime") return [rep.status === "probable" ? "pm-v-prob" : "pm-v-yes", s + (rep.status === "probable" ? " is a probable prime" : " is a prime number"), rep.status === "probable" ? "It passed 33 Miller–Rabin rounds. No number is known that passes them and isn't prime, but for numbers this size it is not a formal proof." : "Its only divisors are 1 and " + s + "."];
		return ["pm-v-no", s + " is not prime", rep.fr.rest ? "It is composite (it failed the Miller–Rabin test), but part of it could not be split in time." : "It is composite: " + ns(rep.fr.f[0][0]) + " divides it."];
	}
	function tile(label, val, sub, cls) { return '<div class="tu-stat' + (cls ? " " + cls : "") + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value pm-tv">' + val + "</div>" + (sub ? '<div class="tu-stat__sub">' + sub + "</div>" : "") + "</div>"; }
	function renderCheck(rep) {
		var out = $("pm-out"), v = verdict(rep), n = rep.n, a = n < 0n ? -n : n, h = "";
		var digits = a.toString().length;
		h += '<div class="tu-card pm-hero ' + v[0] + '"><div class="pm-badge">' + (v[0] === "pm-v-yes" ? "✓ PRIME" : v[0] === "pm-v-prob" ? "≈ PROBABLE PRIME" : rep.kind === "composite" ? "✗ COMPOSITE" : "NEITHER") + '</div><h2 class="pm-verdict">' + esc(v[1]) + '</h2><p>' + esc(v[2]) + "</p>";
		if (rep.fr && rep.kind === "composite") h += '<div class="pm-fact"><span class="pm-fl">' + ns(a) + ' =</span> ' + factHtml(rep.fr.f) + (rep.fr.rest ? ' × <span class="pm-rest" title="composite, not split yet">' + ns(rep.fr.rest) + "</span>" : "") + "</div>";
		if (rep.fr && rep.fr.rest) h += '<p class="pm-warn">The last part (' + rep.fr.rest.toString().length + ' digits) is composite but has no small factor. <button type="button" class="tu-btn tu-btn--ghost" id="pm-more">Keep trying for 15 seconds</button></p>';
		h += '<div class="pm-acts"><button type="button" class="tu-btn tu-btn--ghost" id="pm-cp">Copy result</button><button type="button" class="tu-btn tu-btn--ghost" id="pm-ln">🔗 Copy link</button></div></div>';
		if (rep.fr) {
			h += '<div class="tu-stats pm-stats">';
			h += tile("Digits", G(digits));
			if (rep.nd != null) h += tile("Divisors", ns(rep.nd), rep.kind === "prime" ? "1 and itself" : "counting 1 and " + (digits > 12 ? "itself" : ns(a)));
			if (rep.sigma != null) h += tile("Sum of divisors σ(n)", short(rep.sigma));
			if (rep.phi != null) h += tile("Euler's totient φ(n)", short(rep.phi), "numbers up to n coprime to it");
			if (rep.index) h += tile("Position", "#" + G(rep.index), "the " + ord(rep.index) + " prime");
			h += "</div>";
		}
		if (rep.fr && rep.kind === "composite" && !rep.fr.rest) {
			var om = P.bigOmega(rep.fr.f);
			h += '<div class="tu-card"><h2 class="pm-h">Factor tree</h2>' + (om <= 18 ? '<div class="pm-tree">' + treeSvg(a, rep.fr.f) + "</div>" : '<p class="tu-note">' + G(om) + " prime factors: too many to draw as a tree.</p>") + '<p class="tu-note">Keep splitting off the smallest prime until only primes (circled) are left. In whatever order you split, you always end with the same primes.</p></div>';
		}
		if (rep.divs) {
			var d = rep.divs, big = d.length > 400, shown = big ? d.slice(0, 200).concat(["…"], d.slice(-100)) : d;
			h += '<div class="tu-card"><h2 class="pm-h">All ' + G(d.length) + ' divisors</h2><div class="pm-divs">' + shown.map(function (x) { return x === "…" ? '<span class="pm-gap">… ' + G(d.length - 300) + " more …</span>" : '<a href="?n=' + x + '" data-check="' + x + '" class="pm-dv' + (P.isPrime(x) ? " pm-isp" : "") + '">' + ns(x) + "</a>"; }).join("") + '</div><p class="tu-note">Prime divisors are green. Click one to check it.</p>';
			if (a <= 120n && a > 1n) h += rects(Number(a), d);
			else if (d.length <= 64) h += '<div class="pm-pairs">' + pairs(d, a).map(function (p) { return '<span class="pm-pair">' + ns(p[0]) + " × " + ns(p[1]) + "</span>"; }).join("") + "</div>";
			h += "</div>";
		}
		if (rep.props && rep.props.length) h += '<div class="tu-card"><h2 class="pm-h">Special properties</h2><div class="pm-props">' + rep.props.map(function (t) { return '<div class="pm-prop"><b>' + esc(t[1]) + "</b> " + esc(t[2]) + "</div>"; }).join("") + "</div>" + (rep.goldbach ? '<p class="pm-gb">Goldbach: ' + ns(a) + " = " + ns(rep.goldbach[0]) + " + " + ns(rep.goldbach[1]) + ' (two primes).</p>' : "") + "</div>";
		else if (rep.goldbach) h += '<div class="tu-card"><p class="pm-gb">Goldbach: ' + ns(a) + " = " + ns(rep.goldbach[0]) + " + " + ns(rep.goldbach[1]) + " (two primes).</p></div>";
		if (rep.fr) h += nearby(rep, a);
		if (rep.fr) h += why(rep, a);
		out.innerHTML = h;
		var more = $("pm-more"); if (more) more.onclick = function () { runCheck(15000); };
		$("pm-cp").onclick = function () { copy(v[1] + (rep.fr && rep.kind === "composite" ? "\n" + a + " = " + P.fstr(rep.fr.f, true).replace(/,/g, "") + (rep.fr.rest ? " * " + rep.fr.rest : "") : "") + (rep.nd != null ? "\nDivisors: " + rep.nd : "")); };
		$("pm-ln").onclick = function () { copy(location.origin + location.pathname + "?n=" + encodeURIComponent(S.n), "Link copied"); };
	}
	function short(x) { var s = x.toString(); return s.length > 30 ? s.slice(0, 12) + "…" + s.slice(-6) + ' <small>(' + s.length + " digits)</small>" : ns(x); }
	function ord(k) { var s = ["th", "st", "nd", "rd"], v = k % 100; return G(k) + (s[(v - 20) % 10] || s[v] || s[0]); }
	function factHtml(f) { return f.map(function (x) { return '<span class="pm-pf">' + ns(x[0]) + (x[1] > 1 ? "<sup>" + x[1] + "</sup>" : "") + "</span>"; }).join(' <span class="pm-x">×</span> '); }
	function pairs(d, a) { var out = []; for (var i = 0; i < d.length && d[i] * d[i] <= a; i++) out.push([d[i], a / d[i]]); return out; }
	function rects(n, d) {   // every way to arrange n dots in a rectangle
		var ps = pairs(d.map(function (x) { return x; }), BigInt(n)).map(function (p) { return [Number(p[0]), Number(p[1])]; });
		var h = '<h3 class="pm-h3">' + n + " dots arranged in rectangles</h3><div class=\"pm-rects\">";
		ps.forEach(function (p) {
			var r = p[0], c = p[1], cell = Math.max(4, Math.min(12, Math.floor(260 / c))), w = c * cell, hh = r * cell, s = "";
			for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) s += '<circle cx="' + (j * cell + cell / 2) + '" cy="' + (i * cell + cell / 2) + '" r="' + (cell * 0.36) + '"/>';
			h += '<figure class="pm-rect"><svg viewBox="0 0 ' + w + " " + hh + '" width="' + w + '" height="' + hh + '" aria-hidden="true">' + s + "</svg><figcaption>" + r + " × " + c + "</figcaption></figure>";
		});
		return h + '</div><p class="tu-note">' + (ps.length === 1 ? "Only one rectangle is possible, a single line: that is what makes " + n + " prime." : n + " can be arranged " + ps.length + " ways. A prime can only make one: a single line.") + "</p>";
	}
	function treeSvg(n, f) {
		var list = []; f.forEach(function (x) { for (var i = 0; i < x[1]; i++) list.push(x[0]); });
		var nodes = [], cur = n, x = 0, y = 0, CW = 8.4;
		function wOf(v) { return Math.max(34, ns(v).length * CW + 18); }
		for (var i = 0; i < list.length; i++) {
			if (i === list.length - 1) { nodes.push({ v: cur, x: x, y: y, prime: true }); break; }
			var p = list[i], rest = cur / p, wc = wOf(cur), wp = wOf(p), wr = wOf(rest), idx = nodes.length;
			nodes.push({ v: cur, x: x, y: y, kids: [idx + 1, idx + 2] });
			nodes.push({ v: p, x: x - Math.max(36, (wp + wc) / 2.6), y: y + 62, prime: true });
			x += Math.max(36, (wr + wc) / 2.6); y += 62; cur = rest;
		}
		var minX = Infinity, maxX = -Infinity, maxY = 0;
		nodes.forEach(function (nd) { var w = wOf(nd.v) / 2; minX = Math.min(minX, nd.x - w); maxX = Math.max(maxX, nd.x + w); maxY = Math.max(maxY, nd.y); });
		var pad = 6, W = maxX - minX + pad * 2, H = maxY + 40 + pad * 2, s = "";
		nodes.forEach(function (nd) { if (nd.kids) nd.kids.forEach(function (k) { var c = nodes[k]; if (c) s += '<line class="pm-tl" x1="' + (nd.x - minX + pad) + '" y1="' + (nd.y + 18 + pad) + '" x2="' + (c.x - minX + pad) + '" y2="' + (c.y + 4 + pad) + '"/>'; }); });
		nodes.forEach(function (nd) { var w = wOf(nd.v), cx = nd.x - minX + pad, cy = nd.y + 18 + pad - 7; s += '<rect class="' + (nd.prime ? "pm-tp" : "pm-tc") + '" x="' + (cx - w / 2) + '" y="' + (cy - 14) + '" width="' + w + '" height="28" rx="14"/><text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle">' + ns(nd.v) + "</text>"; });
		return '<svg viewBox="0 0 ' + W.toFixed(1) + " " + H + '" width="' + W.toFixed(0) + '" style="max-width:100%;height:auto" role="img" aria-label="Factor tree of ' + n + '">' + s + "</svg>";
	}
	function nearby(rep, a) {
		var h = '<div class="tu-card"><h2 class="pm-h">Nearby</h2>';
		if (a < 10n ** 15n) {
			var lo = a > 12n ? a - 12n : 0n, cells = "";
			for (var k = lo; k <= lo + 24n; k++) cells += '<a href="?n=' + k + '" data-check="' + k + '" class="pm-nb' + (k > 1n && P.isPrime(k) ? " pm-isp" : "") + (k === a ? " pm-me" : "") + '">' + ns(k) + "</a>";
			h += '<div class="pm-strip">' + cells + "</div>";
		}
		if (rep.prev !== undefined) {
			h += '<p class="pm-nbt">';
			if (rep.prev) h += 'Previous prime: <a href="?n=' + rep.prev + '" data-check="' + rep.prev + '">' + short(rep.prev) + "</a> (" + ns(a - rep.prev) + " below). ";
			h += 'Next prime: <a href="?n=' + rep.next + '" data-check="' + rep.next + '">' + short(rep.next) + "</a> (" + ns(rep.next - a) + " above).";
			if (a > 10n) { var ds = a.toString(), lnA = (ds.length - 1) * Math.LN10 + Math.log(Number(ds.slice(0, 15)) / Math.pow(10, Math.min(15, ds.length) - 1)); h += " On average, primes near here are about " + G(Math.round(lnA * 10) / 10) + " apart (ln n)."; }
			h += "</p>";
		}
		return h + "</div>";
	}
	function why(rep, a) {
		var h = '<details class="tu-card pm-why"><summary><h2 class="pm-h">How do we know?</h2></summary>';
		if (a < 1018081n) {
			var root2 = Math.floor(Math.sqrt(Number(a))), tried = P.SMALL.filter(function (p) { return p <= root2; });
			if (rep.kind === "prime") h += "<p>√" + ns(a) + " ≈ " + Math.sqrt(Number(a)).toFixed(2) + ". If " + ns(a) + " had a divisor other than 1 and itself, one of them would be at most √n, and it would have a prime factor no bigger than that. So we only need to try the " + tried.length + " prime" + (tried.length === 1 ? "" : "s") + " up to " + root2 + ":</p><p class=\"pm-tried\">" + (tried.length ? tried.map(function (p) { return p + " ✗"; }).join(" · ") : "(none: 2 and 3 are prime by definition)") + "</p><p>None of them divides evenly, so it is prime.</p>";
			else { var p = rep.fr.f[0][0]; h += "<p>Trying primes in order: " + tried.filter(function (x) { return BigInt(x) <= p; }).map(function (x) { return BigInt(x) === p ? "<b>" + x + " ✓</b>" : x + " ✗"; }).join(" · ") + "</p><p>" + ns(a) + " ÷ " + ns(p) + " = " + ns(a / p) + " exactly, so it is not prime.</p>"; }
		} else {
			var w = P.witness(a);
			h += "<p>For big numbers we use the <b>Miller–Rabin test</b>. Write n − 1 = 2<sup>" + w.s + "</sup> × d with d odd. For a base b, look at b<sup>d</sup>, b<sup>2d</sup>, b<sup>4d</sup>, … (mod n). If n is prime, that list must start at 1 or reach n − 1 (this follows from Fermat's little theorem).</p>";
			if (w.bad) h += "<p>Base <b>" + w.bad + "</b> breaks the rule, which proves " + (a.toString().length > 40 ? "n" : ns(a)) + " is composite" + (rep.fr.f.length ? ", even before finding a factor." : ".") + "</p>";
			else h += "<p>All " + w.tried + " bases (" + "2, 3, 5, … " + ") follow the rule. " + (rep.status === "prime" ? (a < 3317044064679887385961981n ? "For every number below 3.3 × 10²⁴ the first 13 bases are enough to prove primality, so this is certain." : "It is also a known Mersenne prime, proven by the Lucas–Lehmer test.") : "Above 3.3 × 10²⁴ this makes it a probable prime: no counterexample is known.") + "</p>";
			if (rep.kind === "composite" && rep.fr.f.length) h += "<p>The factors were then found by trial division up to 10,000 and Pollard's rho method.</p>";
		}
		return h + "</details>";
	}

	/* ---------- gcd ---------- */
	var GEX = [["84, 120", "84, 120"], ["8, 15", "8, 15"], ["12, 18, 30", "12, 18, 30"], ["1071, 462", "1071, 462"], ["35, 64", "35, 64"], ["2^20, 6^10", "2^20, 6^10"]];
	$("pm-gex").insertAdjacentHTML("beforeend", GEX.map(function (x) { return '<button type="button" class="tu-chip" data-v="' + esc(x[1]) + '">' + esc(x[0]) + "</button>"; }).join(""));
	$("pm-gex").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { $("pm-g").value = b.dataset.v; runGcd(); } });
	$("pm-gform").addEventListener("submit", function (e) { e.preventDefault(); runGcd(); });
	var COLS = ["#1d4ed8", "#b45309", "#6d28d9", "#be185d", "#0e7490", "#4d7c0f", "#b91c1c", "#4338ca", "#0f766e", "#854d0e"];
	function runGcd() {
		var r = P.parseList($("pm-g").value), err = $("pm-gerr"), out = $("pm-gout");
		if (r.err) { err.textContent = r.err; err.hidden = false; return; }
		var L = r.v.map(function (x) { return x < 0n ? -x : x; });
		if (L.length < 2) { err.textContent = "Type at least two numbers."; err.hidden = false; return; }
		if (L.length > 20) { err.textContent = "Up to 20 numbers, please."; err.hidden = false; return; }
		if (L.some(function (x) { return x.toString().length > 60; })) { err.textContent = "Numbers up to 60 digits here."; err.hidden = false; return; }
		err.hidden = true; S.g = $("pm-g").value.trim(); save(); if (S.tab === "gcd") setURL({ g: S.g });
		var g = P.gcdAll(L), l = L.some(function (x) { return x === 0n; }) ? 0n : P.lcmAll(L), co = g === 1n, h = "";
		var facts = L.map(function (x) { return x > 1n ? P.factor(x, { ms: 400 }) : { f: [], rest: null }; });
		var primeSet = []; facts.forEach(function (fr) { fr.f.forEach(function (x) { if (!primeSet.some(function (p) { return p === x[0]; })) primeSet.push(x[0]); }); });
		primeSet.sort(function (a, b) { return a < b ? -1 : 1; });
		function colr(p) { var i = primeSet.indexOf(p); return COLS[i % COLS.length]; }
		h += '<div class="tu-card pm-hero ' + (co ? "pm-v-yes" : "pm-v-no") + '"><div class="pm-badge">' + (co ? "✓ COPRIME" : "✗ NOT COPRIME") + '</div><h2 class="pm-verdict">' + (co ? "They are coprime" : "They share a factor: " + ns(g)) + "</h2><p>" + (co ? "Their greatest common divisor is 1, so they have no prime factor in common" + (L.length > 2 ? " shared by all of them" : "") + "." : "The greatest common divisor is " + ns(g) + ", not 1.") + "</p></div>";
		h += '<div class="tu-stats">' + tile("GCD (greatest common divisor)", ns(g), "also called HCF / GCF") + tile("LCM (least common multiple)", short(l)) + (L.length === 2 && g ? tile("Product ÷ GCD", short(L[0] * L[1] / g), "= LCM for two numbers") : "") + "</div>";
		// factor rows
		h += '<div class="tu-card"><h2 class="pm-h">Prime factors side by side</h2><div class="tu-table-wrap"><table class="tu-table pm-ftab"><thead><tr><th>Number</th>' + primeSet.map(function (p) { return '<th><span class="pm-dot" style="background:' + colr(p) + '"></span>' + ns(p) + "</th>"; }).join("") + "<th>Factorization</th></tr></thead><tbody>";
		L.forEach(function (x, i) {
			var fr = facts[i]; h += "<tr><td><b>" + ns(x) + "</b></td>" + primeSet.map(function (p) { var e = fr.f.filter(function (y) { return y[0] === p; })[0]; return "<td>" + (e ? e[1] : '<span class="pm-mute">0</span>') + "</td>"; }).join("") + "<td>" + (fr.f.length ? factHtml(fr.f) : x === 1n ? "1" : "0") + (fr.rest ? " × " + ns(fr.rest) : "") + "</td></tr>";
		});
		var gf = primeSet.map(function (p) { return Math.min.apply(null, facts.map(function (fr) { var e = fr.f.filter(function (y) { return y[0] === p; })[0]; return e ? e[1] : 0; })); });
		var lf = primeSet.map(function (p) { return Math.max.apply(null, facts.map(function (fr) { var e = fr.f.filter(function (y) { return y[0] === p; })[0]; return e ? e[1] : 0; })); });
		h += '<tr class="pm-sumrow"><td>GCD = smallest powers</td>' + gf.map(function (e) { return "<td>" + e + "</td>"; }).join("") + "<td>" + (g === 1n ? "1 (nothing shared)" : factHtml(primeSet.map(function (p, i) { return [p, gf[i]]; }).filter(function (x) { return x[1]; }))) + "</td></tr>";
		h += '<tr class="pm-sumrow"><td>LCM = largest powers</td>' + lf.map(function (e) { return "<td>" + e + "</td>"; }).join("") + "<td>" + factHtml(primeSet.map(function (p, i) { return [p, lf[i]]; }).filter(function (x) { return x[1]; })) + "</td></tr>";
		h += "</tbody></table></div></div>";
		if (L.length === 2 && L[0] > 1n && L[1] > 1n && !facts[0].rest && !facts[1].rest) h += venn(L, facts, colr);
		if (L.length > 2 && L.length <= 10) {
			h += '<div class="tu-card"><h2 class="pm-h">Pair by pair</h2><div class="tu-table-wrap"><table class="tu-table pm-ptab"><thead><tr><th>GCD</th>' + L.map(function (x) { return "<th>" + ns(x) + "</th>"; }).join("") + "</tr></thead><tbody>";
			var allPair = true;
			L.forEach(function (x, i) { h += "<tr><th>" + ns(x) + "</th>" + L.map(function (y, j) { if (i === j) return '<td class="pm-mute">–</td>'; var gg = P.gcd(x, y); if (gg !== 1n) allPair = false; return '<td class="' + (gg === 1n ? "pm-c1" : "pm-c0") + '">' + ns(gg) + "</td>"; }).join("") + "</tr>"; });
			h += '</tbody></table></div><p class="tu-note">' + (allPair ? "Every pair has GCD 1: the numbers are <b>pairwise coprime</b>." : "Green = that pair is coprime. " + (co ? "The whole list is coprime (GCD 1) but not every pair is." : "")) + "</p></div>";
		}
		if (L.length === 2 && L[0] && L[1]) {
			var rows = P.euclid(L[0], L[1]), e = P.egcd(L[0], L[1]);
			h += '<div class="tu-card"><h2 class="pm-h">Euclid\'s algorithm</h2><p>Divide the bigger number by the smaller, then the smaller by the remainder, until the remainder is 0. The last non-zero remainder is the GCD.</p><div class="pm-euclid">' + rows.slice(0, 60).map(function (r) { return '<div>' + ns(r[0]) + " = " + ns(r[2]) + " × " + ns(r[1]) + " + <b" + (r[3] === 0n ? ' class="pm-z"' : "") + ">" + ns(r[3]) + "</b></div>"; }).join("") + (rows.length > 60 ? "<div>… " + (rows.length - 60) + " more steps</div>" : "") + "</div>";
			h += '<p>Bézout: ' + ns(L[0]) + " × (" + ns(e[1]) + ") + " + ns(L[1]) + " × (" + ns(e[2]) + ") = " + ns(e[0]) + ".</p>";
			if (L[1] > 0n) { var a0 = L[0] / g, b0 = L[1] / g; h += "<p>As a fraction: " + ns(L[0]) + "⁄" + ns(L[1]) + (g > 1n ? " = <b>" + ns(a0) + "⁄" + ns(b0) + "</b> in lowest terms (both ÷ " + ns(g) + ")." : " is already in lowest terms.") + "</p>"; }
			h += "</div>";
		}
		out.innerHTML = h;
	}
	function venn(L, facts, colr) {
		function bag(fr) { var b = []; fr.f.forEach(function (x) { for (var i = 0; i < x[1]; i++) b.push(x[0]); }); return b; }
		var A = bag(facts[0]), B = bag(facts[1]), both = [], onlyA = [], onlyB = B.slice();
		A.forEach(function (p) { var k = onlyB.indexOf(p); if (k >= 0) { both.push(p); onlyB.splice(k, 1); } else onlyA.push(p); });
		if (A.length + B.length > 40) return "";
		function chips(arr) { return arr.length ? arr.map(function (p) { return '<span class="pm-vc" style="background:' + colr(p) + '">' + ns(p) + "</span>"; }).join("") : '<span class="pm-mute">–</span>'; }
		return '<div class="tu-card"><h2 class="pm-h">Shared prime factors</h2><div class="pm-venn"><div class="pm-vA"><div class="pm-vt">only ' + ns(L[0]) + '</div>' + chips(onlyA) + '</div><div class="pm-vM"><div class="pm-vt">both</div>' + chips(both) + '</div><div class="pm-vB"><div class="pm-vt">only ' + ns(L[1]) + "</div>" + chips(onlyB) + '</div></div><p class="tu-note">Multiply the middle to get the GCD (' + (both.length ? both.map(ns).join(" × ") + " = " : "") + ns(P.gcd(L[0], L[1])) + "). Multiply everything to get the LCM.</p></div>";
	}

	/* ---------- sieve ---------- */
	var SV = null, svTimer = null;
	function initSieve() {
		$("pm-svn").value = S.svn; $("pm-svn").onchange = function () { S.svn = this.value; save(); svReset(); };
		$("pm-svplay").onclick = function () { if (svTimer) svStop(); else svPlay(); };
		$("pm-svstep").onclick = function () { svStop(); svNextPrime(); };
		$("pm-svall").onclick = function () { svStop(); while (svTick()) {} };
		$("pm-svreset").onclick = function () { svStop(); svReset(); };
		$("pm-svgrid").addEventListener("click", function (e) { var c = e.target.closest("[data-k]"); if (c) checkNumber(c.dataset.k); });
		svReset();
	}
	var PCOL = ["#b91c1c", "#1d4ed8", "#b45309", "#6d28d9", "#0e7490", "#be185d", "#4d7c0f", "#c2410c", "#4338ca", "#0f766e", "#9f1239"];
	function svReset() {
		var N = Number(S.svn), g = $("pm-svgrid"), h = "";
		SV = { N: N, cross: new Uint8Array(N + 1), by: new Int16Array(N + 1), p: 1, m: 0, primes: [], done: false };
		for (var k = 1; k <= N; k++) h += '<button type="button" class="pm-c" data-k="' + k + '"' + (k === 1 ? ' data-s="one"' : "") + ">" + k + "</button>";
		g.innerHTML = h; g.style.setProperty("--cols", N <= 50 ? 10 : N <= 300 ? 10 : N <= 500 ? 20 : 25);
		$("pm-svleg").innerHTML = ""; $("pm-svstat").textContent = "1 is not prime. Press Play: the sieve starts with 2."; $("pm-svplay").textContent = "▶ Play";
	}
	function cell(k) { return $("pm-svgrid").children[k - 1]; }
	function svTick() {   // one event; false when finished
		if (!SV || SV.done) return false;
		var N = SV.N;
		if (SV.m) {
			var k = SV.m; SV.m += SV.p;
			if (k > N) { SV.m = 0; return true; }
			var c = cell(k); c.classList.remove("pm-hot");
			if (!SV.cross[k]) { SV.cross[k] = 1; SV.by[k] = SV.p; c.dataset.s = "x"; c.style.setProperty("--pc", PCOL[(SV.primes.length - 1) % PCOL.length]); c.classList.add("pm-hot"); }
			return true;
		}
		var p = SV.p + 1; while (p <= N && SV.cross[p]) p++;
		root.querySelectorAll("#pm-svgrid .pm-hot").forEach(function (c) { c.classList.remove("pm-hot"); });
		if (p > N) { finish(); return false; }
		if (p * p > N) {
			for (var k2 = p; k2 <= N; k2++) if (!SV.cross[k2]) { SV.primes.push(k2); cell(k2).dataset.s = "p"; }
			finish(true, p); return false;
		}
		SV.p = p; SV.primes.push(p); cell(p).dataset.s = "p"; cell(p).style.setProperty("--pc", PCOL[(SV.primes.length - 1) % PCOL.length]); SV.m = p * p;
		$("pm-svstat").innerHTML = "<b>" + p + "</b> is prime (nothing crossed it out). Now cross out its multiples, starting at " + p + " × " + p + " = " + (p * p) + " (smaller multiples are already gone).";
		$("pm-svleg").insertAdjacentHTML("beforeend", '<span class="pm-lg" style="--pc:' + PCOL[(SV.primes.length - 1) % PCOL.length] + '">multiples of ' + p + "</span>");
		return true;
	}
	function finish(early, p) {
		SV.done = true; svStop(); $("pm-svplay").textContent = "▶ Play";
		$("pm-svstat").innerHTML = (early ? "Next would be " + p + ", but " + p + " × " + p + " = " + p * p + " is bigger than " + SV.N + ", so every number still standing is prime. " : "") + "Done: <b>" + SV.primes.length + " primes</b> up to " + SV.N + ".";
	}
	function svNextPrime() { if (!SV || SV.done) svReset(); var start = SV.primes.length; while (svTick() && (SV.primes.length === start || SV.m)) {} }
	function svPlay() {
		if (!SV || SV.done) svReset();
		$("pm-svplay").textContent = "❚❚ Pause";
		(function loop() { var spd = Number($("pm-svspd").value), per = spd >= 8 ? (spd - 7) * 6 : 1, ms = spd >= 8 ? 30 : [0, 420, 300, 200, 130, 80, 50, 35][spd]; for (var i = 0; i < per; i++) if (!svTick()) return; svTimer = setTimeout(loop, ms); })();
	}
	function svStop() { clearTimeout(svTimer); svTimer = null; if (SV && !SV.done) $("pm-svplay").textContent = "▶ Play"; }

	/* ---------- spiral ---------- */
	var spFlags = null, spLayout = null;
	function initSpiral() {
		var seg = $("pm-spmode");
		seg.addEventListener("click", function (e) { var b = e.target.closest("[data-m]"); if (b) { S.spm = b.dataset.m; save(); drawSpiral(); } });
		$("pm-spsize").value = S.sps; $("pm-spsize").oninput = function () { S.sps = Number(this.value); save(); drawSpiral(); };
		$("pm-spstart").value = S.spstart; $("pm-spstart").onchange = function () { S.spstart = this.value; save(); drawSpiral(); };
		$("pm-sptwin").onchange = drawSpiral; $("pm-speuler").onchange = drawSpiral;
		var cv = $("pm-spcv");
		cv.addEventListener("mousemove", spHover); cv.addEventListener("mouseleave", function () { $("pm-sptip").hidden = true; });
		cv.addEventListener("click", function (e) { var k = spAt(e); if (k) checkNumber(k); });
		if (window.ResizeObserver) new ResizeObserver(function () { if (S.tab === "spiral") drawSpiral(); }).observe($("pm-spstage"));
		function addPanel() { if (window.MESPanel) MESPanel.add($("pm-sp-card"), { bar: $("pm-sp-card").querySelector(".pm-head"), onChange: drawSpiral }); else setTimeout(addPanel, 200); }
		addPanel();
	}
	function spParams() {
		var t = S.sps / 100;
		if (S.spm === "sacks") return { count: Math.round(Math.exp(Math.log(200) + t * (Math.log(200000) - Math.log(200)))) };
		var side = 2 * Math.round(5 + t * t * 395) + 1; return { side: side, count: side * side };
	}
	function drawSpiral() {
		if (!inited.spiral || S.tab !== "spiral") return;
		root.querySelectorAll("#pm-spmode button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.m === S.spm); });
		$("pm-spstartw").hidden = S.spm !== "ulam";
		var cv = $("pm-spcv"), stage = $("pm-spstage"), card = $("pm-sp-card"), full = card.classList.contains("mes-pfill");
		var W = stage.clientWidth, H = full ? Math.max(200, card.clientHeight - stage.offsetTop - 50) : Math.min(W, 720), Sz = Math.min(W, H), dpr = Math.min(2, window.devicePixelRatio || 1);
		cv.style.width = Sz + "px"; cv.style.height = Sz + "px"; cv.width = Math.round(Sz * dpr); cv.height = Math.round(Sz * dpr);
		var ctx = cv.getContext("2d"), pr = spParams(), start = 1, ps;
		if (S.spm === "ulam") { var r = P.parse(S.spstart); start = r.err || r.v < 1n || r.v > 10n ** 12n ? 1 : Number(r.v); }
		var maxV = start + pr.count + 10;
		ps = maxV <= 4e6 ? P.sieve(maxV) : null; spFlags = { s: ps, base: 0 };
		if (!ps) { var list = P.primesBetween(start, maxV), arr = new Uint8Array(pr.count + 12); list.forEach(function (x) { arr[x - start] = 1; }); spFlags = { s: arr, base: start }; }
		function isP(v) { return v >= 2 && spFlags.s[v - spFlags.base] === 1; }
		var dk = dark(), bg = dk ? "#121417" : "#ffffff", pc = dk ? "#e6edf3" : "#111827", tc = "#f97316", ec = dk ? "#4ade80" : "#16a34a", euler = $("pm-speuler").checked, twin = $("pm-sptwin").checked;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = bg; ctx.fillRect(0, 0, Sz, Sz);
		var eulerSet = null; if (euler) { eulerSet = new Set(); for (var e = 0; e * e + e + 41 <= maxV; e++) eulerSet.add(e * e + e + 41); }
		var nPrimes = 0;
		if (S.spm === "ulam") {
			var side = pr.side, cell = Sz / side, half = (side - 1) / 2, dot = Math.max(1, cell * (cell > 6 ? 0.82 : 1));
			spLayout = { mode: "ulam", cell: cell, half: half, side: side, start: start };
			for (var k = 1; k <= pr.count; k++) {
				var v = start + k - 1, p = isP(v), ev = eulerSet && eulerSet.has(v);
				if (!p && !ev) continue; if (p) nPrimes++;
				var u = P.ulam(k), x = (u[0] + half) * cell, y = (half - u[1]) * cell;
				ctx.fillStyle = ev ? ec : twin && p && (isP(v - 2) || isP(v + 2)) ? tc : pc;
				if (cell > 6) { ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, dot / 2.2, 0, 7); ctx.fill(); } else ctx.fillRect(x, y, dot, dot);
			}
			if (side <= 25) { ctx.font = Math.max(8, cell * 0.32) + "px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; for (k = 1; k <= pr.count; k++) { var vv = start + k - 1, uu = P.ulam(k); ctx.fillStyle = isP(vv) ? bg : dk ? "#6b7280" : "#9ca3af"; ctx.fillText(G(vv), (uu[0] + half + 0.5) * cell, (half - uu[1] + 0.5) * cell); } }
			$("pm-spsl").textContent = side + " × " + side;
			$("pm-spinfo").innerHTML = "Numbers " + G(start) + " to " + G(start + pr.count - 1) + " wound in a square spiral from the centre. <b>" + G(nPrimes) + " primes</b> are dark. Primes pile up on diagonal lines: many quadratic formulas like 4n² + bn + c produce lots of primes." + (euler ? " Green = values of n² + n + 41 (try Start at 41)." : "");
		} else {
			var N = pr.count, R = Sz / 2 - 4, sc = R / Math.sqrt(N), ds = Math.max(1, Math.min(4, sc * 0.7));
			spLayout = { mode: "sacks", sc: sc, c: Sz / 2, N: N };
			for (var j = 2; j <= N; j++) {
				var pj = isP(j), evj = eulerSet && eulerSet.has(j); if (!pj && !evj) continue; if (pj) nPrimes++;
				var rr = Math.sqrt(j) * sc, th = 2 * Math.PI * Math.sqrt(j);
				ctx.fillStyle = evj ? ec : twin && pj && (isP(j - 2) || isP(j + 2)) ? tc : pc;
				ctx.fillRect(Sz / 2 + rr * Math.cos(th) - ds / 2, Sz / 2 - rr * Math.sin(th) - ds / 2, ds, ds);
			}
			$("pm-spsl").textContent = "1 to " + G(N);
			$("pm-spinfo").innerHTML = "Each number n sits at radius √n and angle 2π√n, so the perfect squares line up on the line to the right. <b>" + G(nPrimes) + " primes</b> up to " + G(N) + " trace curves: the values of quadratic formulas." + (euler ? " Green = n² + n + 41." : "");
		}
	}
	function spAt(e) {
		if (!spLayout) return null; var r = $("pm-spcv").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
		if (spLayout.mode === "ulam") {
			var cx = Math.floor(x / spLayout.cell) - spLayout.half, cy = spLayout.half - Math.floor(y / spLayout.cell), m = Math.max(Math.abs(cx), Math.abs(cy));
			if (m > spLayout.half) return null;
			for (var k = Math.max(1, (2 * m - 1) * (2 * m - 1)); k <= (2 * m + 1) * (2 * m + 1); k++) { var u = P.ulam(k); if (u[0] === cx && u[1] === cy) return spLayout.start + k - 1; }
			return null;
		}
		var dx = x - spLayout.c, dy = spLayout.c - y, rr = Math.sqrt(dx * dx + dy * dy) / spLayout.sc, best = null, bd = 1e9;
		for (var n = Math.max(1, Math.floor((rr - 1) * (rr - 1))); n <= Math.ceil((rr + 1) * (rr + 1)) && n <= spLayout.N; n++) { var t = 2 * Math.PI * Math.sqrt(n), px = Math.sqrt(n) * spLayout.sc * Math.cos(t), py = Math.sqrt(n) * spLayout.sc * Math.sin(t), d = (px - dx) * (px - dx) + (py - dy) * (py - dy); if (d < bd) { bd = d; best = n; } }
		return bd < 64 ? best : null;
	}
	function spHover(e) {
		var k = spAt(e), tip = $("pm-sptip"); if (!k) { tip.hidden = true; return; }
		var st = $("pm-spstage").getBoundingClientRect(); tip.hidden = false; tip.textContent = G(k) + (P.isPrime(BigInt(k)) ? " · prime" : k > 1 ? " · " + P.fstr(P.factor(BigInt(k)).f) : "");
		tip.style.left = Math.min(st.width - 150, e.clientX - st.left + 12) + "px"; tip.style.top = (e.clientY - st.top + 12) + "px";
	}

	/* ---------- list & count ---------- */
	var lastList = [];
	function initList() {
		$("pm-la").value = S.la; $("pm-lb").value = S.lb;
		$("pm-lform").addEventListener("submit", function (e) { e.preventDefault(); runList(); });
		$("pm-lcopy").onclick = function () { if (lastList.length) copy(lastList.join(", "), G(lastList.length) + " primes copied"); };
		$("pm-nform").addEventListener("submit", function (e) { e.preventDefault(); var r = P.parse($("pm-nth").value); if (r.err) return out(r.err); var n = Number(r.v); if (n < 1 || n > P.NTH_MAX) return out("n must be between 1 and " + G(P.NTH_MAX) + "."); out("Working…"); setTimeout(function () { var p = P.nthPrime(n); out("The " + ord(n) + ' prime is <a href="?n=' + p + '" data-check="' + p + '"><b>' + G(p) + "</b></a>."); }, 20); });
		$("pm-cform").addEventListener("submit", function (e) {
			e.preventDefault(); var r = P.parse($("pm-cx").value); if (r.err) return out(r.err); var x = r.v;
			var tab = P.PI_TABLE.filter(function (t) { return 10n ** BigInt(t[0]) === x; })[0];
			if (tab) return out("There are <b>" + ns(tab[1]) + "</b> primes up to " + ns(x) + " (a known value).");
			if (x > BigInt(P.PI_MAX)) return out("Counting is done here up to " + G(P.PI_MAX) + ". For powers of ten the known values go up to 10²⁵ (table below). Estimate: about " + G(Math.round(P.li(Number(x)))) + " (li(x)).");
			out("Counting…"); setTimeout(function () { var c = P.piCount(Number(x)); out("There are <b>" + G(c) + "</b> primes up to " + ns(x) + ". Estimates: x ÷ ln x ≈ " + G(Math.round(Number(x) / Math.log(Number(x)))) + ", li(x) ≈ " + G(Math.round(P.li(Number(x)))) + "."); }, 20);
		});
		function out(t) { $("pm-nres").innerHTML = t; }
		$("pm-chn").value = S.chn; $("pm-chn").onchange = function () { S.chn = this.value; save(); chData = null; drawChart(); };
		$("pm-chv").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { S.chv = b.dataset.v; save(); drawChart(); } });
		$("pm-pitab").tBodies[0].innerHTML = P.PI_TABLE.map(function (t) { var est = t[0] * Math.LN10; return "<tr><td>10" + P.sup(t[0]) + "</td><td>" + ns(t[1]) + "</td><td>" + (t[0] <= 15 ? G(Math.round(Math.pow(10, t[0]) / est)) : (Math.pow(10, t[0]) / est).toExponential(3).replace("e+", " × 10^")) + "</td><td>" + (Math.round(10 / Number(t[1]) * Math.pow(10, t[0] - 1) * 10) / 10).toLocaleString("en-US") + "</td></tr>"; }).join("");
		if (window.ResizeObserver) new ResizeObserver(function () { if (S.tab === "list") drawChart(); }).observe($("pm-chart"));
		function addPanel() { if (window.MESPanel) MESPanel.add($("pm-ch-card"), { bar: $("pm-ch-card").querySelector(".pm-head"), onChange: drawChart }); else setTimeout(addPanel, 200); }
		addPanel();
		runList();
	}
	function runList() {
		var ra = P.parse($("pm-la").value), rb = P.parse($("pm-lb").value), err = $("pm-lerr");
		function bad(t) { err.textContent = t; err.hidden = false; }
		if (ra.err || rb.err) return bad(ra.err || rb.err);
		var a = ra.v, b = rb.v; if (b < a) { var t = a; a = b; b = t; }
		err.hidden = true; S.la = $("pm-la").value.trim(); S.lb = $("pm-lb").value.trim(); save();
		var list;
		if (b <= BigInt(P.RANGE_MAX) && b - a <= BigInt(P.SPAN_MAX)) list = P.primesBetween(Number(a), Number(b)).map(String);
		else if (b - a <= 20000n) { list = []; for (var k = a < 2n ? 2n : a; k <= b; k++) if (P.isPrime(k)) list.push(k.toString()); }
		else return bad("For numbers above 10 trillion the range can be at most 20,000 wide; below that, at most 5,000,000.");
		lastList = list; if (S.tab === "list") setURL({ a: S.la, b: S.lb });
		var tw = 0; for (var i = 1; i < list.length; i++) if (BigInt(list[i]) - BigInt(list[i - 1]) === 2n) tw++;
		$("pm-lsum").innerHTML = "<b>" + G(list.length) + " primes</b> from " + ns(a) + " to " + ns(b) + (list.length > 1 ? ", including " + G(tw) + " twin-prime pairs" : "") + "." + (list.length > 3000 ? " Showing the first 3,000; Copy list copies all of them." : "");
		$("pm-llist").innerHTML = list.slice(0, 3000).map(function (p) { return '<a href="?n=' + p + '" data-check="' + p + '">' + G(p) + "</a>"; }).join("");
	}
	var chData = null;
	function drawChart() {
		if (!inited.list || S.tab !== "list") return;
		root.querySelectorAll("#pm-chv button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === S.chv); });
		var N = Number(S.chn); if (!chData || chData.N !== N) { chData = P.piSamples(N, 240); chData.N = N; }
		var box = $("pm-chart"), card = $("pm-ch-card"), full = card.classList.contains("mes-pfill"), W = Math.max(280, box.clientWidth), H = full ? Math.max(240, card.clientHeight - box.offsetTop - 60) : Math.round(Math.min(420, Math.max(240, W * 0.5)));
		var dk = dark(), ax = dk ? "#9aa4b2" : "#5b6573", gr = dk ? "#2b3138" : "#e5e7eb", c1 = dk ? "#4ade80" : "#15803d", c2 = dk ? "#60a5fa" : "#2563eb", c3 = dk ? "#fbbf24" : "#b45309";
		var L = 64, R = 16, T = 16, B = 34, pw = W - L - R, ph = H - T - B, s = "";
		function nice(m) { var e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
		if (S.chv === "count") {
			var pts = chData.pts, ymax = nice(Math.max(P.li(N), chData.count) * 1.02);
			function X(x) { return L + x / N * pw; } function Y(y) { return T + ph - y / ymax * ph; }
			for (var i = 0; i <= 5; i++) { var yv = ymax * i / 5; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(yv) + '" y2="' + Y(yv) + '" stroke="' + gr + '"/><text x="' + (L - 6) + '" y="' + (Y(yv) + 4) + '" text-anchor="end" fill="' + ax + '">' + G(Math.round(yv)) + "</text>"; }
			for (i = 0; i <= 4; i++) { var xv = N * i / 4; s += '<text x="' + X(xv) + '" y="' + (H - 12) + '" text-anchor="' + (i === 0 ? "start" : i === 4 ? "end" : "middle") + '" fill="' + ax + '">' + G(Math.round(xv)) + "</text>"; }
			var p1 = "", p2 = "", p3 = "";
			pts.forEach(function (p, k) { var x = p[0]; p1 += (k ? "L" : "M") + X(x).toFixed(1) + " " + Y(p[1]).toFixed(1); if (x >= 3) { p2 += (p2 ? "L" : "M") + X(x).toFixed(1) + " " + Y(x / Math.log(x)).toFixed(1); p3 += (p3 ? "L" : "M") + X(x).toFixed(1) + " " + Y(P.li(x)).toFixed(1); } });
			s += '<path d="' + p3 + '" fill="none" stroke="' + c3 + '" stroke-width="2" stroke-dasharray="6 4"/><path d="' + p2 + '" fill="none" stroke="' + c2 + '" stroke-width="2" stroke-dasharray="2 3"/><path d="' + p1 + '" fill="none" stroke="' + c1 + '" stroke-width="2.5"/>';
			s += '<line id="pm-chx" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" stroke="' + ax + '" stroke-dasharray="3 3" visibility="hidden"/>';
			box.innerHTML = '<div class="pm-ckey"><span style="--c:' + c1 + '">π(x) actual count</span><span class="pm-dot2" style="--c:' + c2 + '">x ÷ ln x</span><span class="pm-dash" style="--c:' + c3 + '">li(x)</span></div><svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Prime counting function chart">' + s + '</svg><div class="pm-tip" id="pm-chtip" hidden></div>';
			var svg = box.querySelector("svg"), tip = $("pm-chtip");
			svg.addEventListener("mousemove", function (e) {
				var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width; if (x < L || x > W - R) { tip.hidden = true; return; }
				var xv = (x - L) / pw * N, best = pts[0]; pts.forEach(function (p) { if (Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p; });
				var ln = svg.querySelector("#pm-chx"); ln.setAttribute("x1", X(best[0])); ln.setAttribute("x2", X(best[0])); ln.setAttribute("visibility", "visible");
				tip.hidden = false; tip.innerHTML = "x = " + G(best[0]) + "<br>π(x) = <b>" + G(best[1]) + "</b><br>x ÷ ln x ≈ " + G(Math.round(best[0] / Math.log(Math.max(3, best[0])))) + "<br>li(x) ≈ " + G(Math.round(P.li(Math.max(2.1, best[0]))));
				tip.style.left = Math.min(r.width - 170, e.clientX - r.left + 14) + "px"; tip.style.top = (e.clientY - r.top + 30) + "px";
			});
			svg.addEventListener("mouseleave", function () { tip.hidden = true; svg.querySelector("#pm-chx").setAttribute("visibility", "hidden"); });
			$("pm-chinfo").innerHTML = "Up to " + G(N) + " there are <b>" + G(chData.count) + "</b> primes: about one in " + (N / chData.count).toFixed(1) + ". The Prime Number Theorem says π(x) grows like x ÷ ln x; the logarithmic integral li(x) is a much closer guess.";
		} else {
			var gaps = chData.gaps, keys = Object.keys(gaps).map(Number).sort(function (a, b) { return a - b; }), gmax = Math.max.apply(null, keys.map(function (k) { return gaps[k]; })), kmax = keys[keys.length - 1];
			var bw = pw / (kmax / 2 + 1), ym = nice(gmax);
			for (i = 0; i <= 4; i++) { var yy = T + ph - ph * i / 4; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + gr + '"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" fill="' + ax + '">' + G(Math.round(ym * i / 4)) + "</text>"; }
			keys.forEach(function (k) {
				var x = L + (k === 1 ? 0 : k / 2) * bw, hgt = gaps[k] / ym * ph;
				s += '<rect x="' + (x + 1) + '" y="' + (T + ph - hgt) + '" width="' + Math.max(1, bw - 2) + '" height="' + hgt + '" fill="' + (k % 6 === 0 ? c3 : c2) + '"><title>gap ' + k + ": " + G(gaps[k]) + " times</title></rect>";
				if (bw > 16 || k % (bw > 7 ? 4 : 10) === 0 || k <= 2) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 12) + '" text-anchor="middle" fill="' + ax + '">' + k + "</text>";
			});
			box.innerHTML = '<div class="pm-ckey"><span style="--c:' + c2 + '">gap size (how many times)</span><span style="--c:' + c3 + '">multiples of 6</span></div><svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Prime gaps chart">' + s + "</svg>";
			var mg = chData.maxGap;
			$("pm-chinfo").innerHTML = "Gaps between neighbouring primes up to " + G(N) + ". The biggest is <b>" + mg[0] + '</b>, between <a href="?n=' + mg[1] + '" data-check="' + mg[1] + '">' + G(mg[1]) + "</a> and " + G(mg[2]) + ". There are " + G(chData.twins) + " twin primes (gap 2). Gaps that are multiples of 6 are unusually common, because every prime above 3 is 6k ± 1.";
		}
	}

	/* ---------- dark mode redraw, start ---------- */
	new MutationObserver(function () { if (S.tab === "spiral") drawSpiral(); if (S.tab === "list") drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	$("pm-n").value = S.n; $("pm-g").value = S.g;
	showTab(S.tab);
	runCheck(); runGcd();
})();
