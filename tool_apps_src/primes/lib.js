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
