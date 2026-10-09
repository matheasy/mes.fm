/* node tool_apps_src/sum-of-integers-tests.js */
const S = require("./sum-of-integers-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (String(a) !== String(b)) { f++; console.log("FAIL", m, String(a), "vs", String(b)); } else console.log("ok  ", m, String(a).slice(0, 40)); }
eq(S.rangeSum(1, 100), 5050, "1..100"); eq(S.rangeSum(-5, 5), 0, "-5..5"); eq(S.rangeSum(10, 20), 165, "10..20"); eq(S.rangeSum(1, 10n ** 30n), (10n ** 30n) * (10n ** 30n + 1n) / 2n, "1..1e30 exact");
eq(S.powSum(2, 10), 385, "squares to 10"); eq(S.powSum(3, 10), 3025, "cubes to 10"); eq(S.powSum(1, 100), 5050, "k=1");
for (let k = 0; k <= 14; k++) { let t = 0n; for (let i = 1n; i <= 40n; i++) t += i ** BigInt(k); eq(S.powSum(k, 40), t, "faulhaber k=" + k + " n=40"); }
eq(S.powSum(2, 10n ** 12n), (10n ** 12n) * (10n ** 12n + 1n) * (2n * 10n ** 12n + 1n) / 6n, "squares to 1e12 exact");
eq(S.powSum(40, 30) > 0n, true, "k=40 works");
{ let t = 0n; for (let i = 1n; i <= 30n; i++) t += i ** 40n; eq(S.powSum(40, 30), t, "k=40 n=30 brute"); }
eq(S.powRange(2, -3, 4), 44, "squares -3..4"); eq(S.powRange(3, -3, 4), 64 + 0 - 0 + (-27 - 8 - 1 + 0 + 1 + 8 + 27) , "cubes -3..4"); eq(S.powRange(2, 5, 9), 25 + 36 + 49 + 64 + 81, "squares 5..9"); eq(S.powRange(2, -9, -5), 25 + 36 + 49 + 64 + 81, "squares -9..-5");
eq(S.oddSum(10), 100, "first 10 odd"); eq(S.evenSum(10), 110, "first 10 even");
eq(S.multiplesSum([3, 5], 1000, false), 233168, "multiples of 3 or 5 below 1000"); eq(S.multiplesSum([3, 5, 7], 100, true), (() => { let t = 0; for (let i = 1; i <= 100; i++) if (i % 3 === 0 || i % 5 === 0 || i % 7 === 0) t += i; return t; })(), "3,5,7 up to 100");
eq(S.qstr(S.arithmetic(S.parseQ("2"), S.parseQ("3"), 10)), 155, "arithmetic 2,5,8.. 10 terms"); eq(S.qstr(S.arithmetic(S.parseQ("0.5"), S.parseQ("0.25"), 5)), 5, "arithmetic with decimals");
eq(S.qstr(S.geometric(S.parseQ("1"), S.parseQ("2"), 10)), 1023, "geometric 1,2,4.. 10 terms"); eq(S.qstr(S.geometric(S.parseQ("3"), S.parseQ("1"), 7)), 21, "ratio 1"); eq(S.qstr(S.geometricInfinite(S.parseQ("1"), S.parseQ("1/2"))), 2, "infinite 1/2"); eq(S.geometricInfinite(S.parseQ("1"), S.parseQ("2")), null, "diverges");
eq(S.fibSum(10), 143, "fibonacci sum to F10"); eq(S.tetrahedral(10), 220, "tetrahedral 10"); eq(S.triangular(10), 55, "triangular 10");
eq(S.qdec(S.parseQ("1/3"), 5), "0.33333…", "decimal of 1/3"); eq(S.qstr(S.parseQ("1,234.5")), "2469/2", "parse with comma"); eq(S.parseQ("abc"), null, "garbage");
eq(S.sigma("i^2+3i", 1, 10).sum, 385 + 3 * 55, "sigma i^2+3i"); eq(Math.round(S.sigma("1/i", 1, 1000).sum * 1e6), 7485471, "harmonic H1000"); eq(S.sigma("2(i+1)", 1, 4).sum, 2 * (2 + 3 + 4 + 5), "implicit multiplication");
let threw = false; try { S.compile("i +* 2"); } catch (e) { threw = true; } eq(threw, true, "bad formula throws");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
