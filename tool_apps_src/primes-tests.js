/* node tool_apps_src/primes-tests.js */
var P = require("./primes/lib.js"), fails = 0, n = 0;
function ok(c, m) { n++; if (!c) { fails++; console.log("FAIL", m); } }
function eq(a, b, m) { ok(String(a) === String(b), m + ": got " + a + " want " + b); }
// parser
eq(P.parse("2^61-1").v, 2305843009213693951n, "2^61-1"); eq(P.parse("1,000,003").v, 1000003n, "commas"); eq(P.parse("1e9+7").v, 1000000007n, "1e9+7");
eq(P.parse("10!+1").v, 3628801n, "10!+1"); eq(P.parse("2 × (3 + 4)").v, 14n, "times"); eq(P.parse("1.5e3").v, 1500n, "1.5e3");
ok(P.parse("1/3").err, "1/3 error"); ok(P.parse("abc").err, "abc error"); ok(P.parse("10^99999").err, "too big"); eq(P.parse("-7").v, -7n, "neg");
eq(P.parseList("12, 18 30").v.join(","), "12,18,30", "list");
// primality vs sieve
var s = P.sieve(200000); for (var k = 0; k <= 200000; k++) if (P.isPrime(BigInt(k)) !== !!s[k]) { ok(false, "isPrime " + k); break; }
ok(true, "sieve agree");
eq(P.test(2n ** 61n - 1n), "prime", "M61"); eq(P.test(2n ** 67n - 1n), "composite", "M67"); eq(P.test(561n), "composite", "561");
eq(P.test(3215031751n), "composite", "spsp 2,3,5,7"); eq(P.test(3825123056546413051n), "composite", "spsp to 23");
eq(P.test(318665857834031151167461n), "composite", "spsp to 37"); eq(P.test(2n ** 89n - 1n), "prime", "M89");
eq(P.test(2n ** 127n - 1n), "prime", "M127 known"); eq(P.test(10n ** 30n + 57n), "probable", "1e30+57 probable");
// factoring
eq(P.fstr(P.factor(2n ** 67n - 1n).f, true), "193,707,721 * 761,838,257,287", "Cole");
eq(P.fstr(P.factor(600851475143n).f, true), "71 * 839 * 1,471 * 6,857", "euler3");
eq(P.fstr(P.factor(360n).f, true), "2^3 * 3^2 * 5", "360"); eq(P.fstr(P.factor(1000000016000000063n).f, true), "1,000,000,007 * 1,000,000,009", "two 1e9 primes");
eq(P.fstr(P.factor(2n ** 64n + 1n).f, true), "274,177 * 67,280,421,310,721", "F6");
var big = P.factor(10n ** 30n + 57n, { ms: 3000 }); var prod = big.f.reduce(function (a, x) { return a * x[0] ** BigInt(x[1]); }, big.rest || 1n); eq(prod, 10n ** 30n + 57n, "product back");
eq(P.fstr(P.factor(1n << 40n).f, true), "2^40", "2^40"); eq(P.fstr(P.factor(1000003n ** 3n).f, true), "1,000,003^3", "cube of prime");
// divisor functions
var f = P.factor(28n).f; eq(P.sigma(f), 56n, "sigma28"); eq(P.numDivisors(f), 6n, "d28"); eq(P.phi(P.factor(36n).f), 12n, "phi36");
eq(P.divisors(P.factor(36n).f).join(","), "1,2,3,4,6,9,12,18,36", "div36");
// gcd
eq(P.gcd(462n, 1071n), 21n, "gcd"); eq(P.lcm(4n, 6n), 12n, "lcm"); eq(P.gcdAll([12n, 18n, 30n]), 6n, "gcdAll"); eq(P.lcmAll([4n, 6n, 10n]), 60n, "lcmAll");
var e = P.egcd(240n, 46n); eq(240n * e[1] + 46n * e[2], e[0], "bezout"); eq(e[0], 2n, "egcd g"); eq(P.modInverse(3n, 11n), 4n, "inverse");
eq(P.euclid(1071n, 462n).length, 3, "euclid rows");
// neighbours, ranges
eq(P.nextPrime(100n), 101n, "next"); eq(P.prevPrime(100n), 97n, "prev"); eq(P.prevPrime(2n), null, "prev2"); eq(P.nextPrime(1n), 2n, "next1");
eq(P.primesBetween(1, 30).join(","), "2,3,5,7,11,13,17,19,23,29", "range"); eq(P.primesBetween(1e12, 1e12 + 100).length, 4, "range 1e12");
eq(P.nthPrime(1), 2, "p1"); eq(P.nthPrime(10000), 104729, "p10000"); eq(P.nthPrime(1000000), 15485863, "p1e6");
eq(P.piCount(1e6), 78498, "pi 1e6"); var sm = P.piSamples(1000, 10); eq(sm.count, 168, "samples count"); eq(sm.twins, 35, "twins<1000"); eq(sm.maxGap[0], 20, "max gap <1000");
ok(Math.abs(P.li(1e6) - 78627.5491594622) < 1e-3, "li(1e6) " + P.li(1e6));
// properties
function has(nn, id) { var r = P.analyze(BigInt(nn)); return r.props.some(function (t) { return t[0] === id; }); }
ok(has(11, "twin"), "11 twin"); ok(has(11, "sophie"), "11 SG"); ok(has(7, "safe"), "7 safe"); ok(has(31, "mersenne"), "31 mersenne"); ok(has(257, "fermat"), "257 fermat");
ok(has(13, "emirp"), "13 emirp"); ok(has(131, "pal"), "131 pal"); ok(has(28, "perfect"), "28 perfect"); ok(has(12, "abundant"), "12 abundant"); ok(has(561, "carmichael"), "561 carm");
ok(!has(15, "carmichael"), "15 not carm"); ok(has(15, "semi"), "15 semi"); ok(has(64, "pow2"), "64 pow2"); ok(has(49, "power"), "49 square");
eq(P.goldbach(100n).join("+"), "3+97", "goldbach");
var a = P.analyze(97n); eq(a.kind, "prime", "97 prime"); eq(a.index, 25, "97 is 25th"); eq(a.prev, 89n, "prev 89");
eq(P.analyze(1n).kind, "one", "one"); eq(P.analyze(-12n).kind, "composite", "neg");
// ulam
eq(P.ulam(2).join(","), "1,0", "u2"); eq(P.ulam(4).join(","), "0,1", "u4"); eq(P.ulam(9).join(","), "1,-1", "u9"); eq(P.ulam(10).join(","), "2,-1", "u10"); eq(P.ulam(13).join(","), "2,2", "u13");
var seen = {}; for (k = 1; k <= 2500; k++) { var u = P.ulam(k); if (seen[u]) { ok(false, "ulam dup " + k); break; } seen[u] = 1; } ok(true, "ulam unique");
console.log(n + " checks, " + fails + " failed"); process.exit(fails ? 1 : 0);
