/* node tool_apps_src/quantum-cryptography-tests.js */
var Q = require("./cryptography/qlib.js"), fails = 0, n = 0;
function ok(c, m) { n++; if (!c) { fails++; console.log("FAIL", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + ": got " + a + " want " + b); }

// BB84
var clean = Q.bb84(20000, { seed: 7 }); near(clean.sifted / 20000, 0.5, 0.02, "half sifted"); ok(clean.errors === 0, "no eve no errors"); ok(!clean.abort, "no abort");
ok(clean.aliceKey === clean.bobKey, "keys match"); ok(clean.final === clean.rest, "full key rate at 0 errors");
var eve = Q.bb84(40000, { seed: 3, eve: 1 }); near(eve.qber, 0.25, 0.015, "eve gives 25%"); ok(eve.abort, "eve aborts");
var half = Q.bb84(40000, { seed: 4, eve: 0.5 }); near(half.qber, Q.expectedQber(0.5, 0), 0.015, "half eve 12.5%");
var noisy = Q.bb84(40000, { seed: 5, noise: 0.05 }); near(noisy.qber, 0.05, 0.01, "noise 5%"); ok(!noisy.abort && noisy.final > 0 && noisy.final < noisy.rest, "noise shrinks key");
near(Q.h2(0.11) * 2, 1, 0.01, "11% limit: 1 - 2h(Q) = 0"); near(Q.angle(1, 1), 135, 0, "angle");
ok(Q.bb84(500, { seed: 9 }).photons.every(function (p) { return !p.keep || p.a === p.b; }), "sifted bits agree without eve");

// Shor
ok(Q.order(7, 15) === 4, "order 7 mod 15"); ok(Q.order(2, 21) === 6, "order 2 mod 21"); ok(Q.order(3, 15) === null, "not coprime");
var d = Q.shorDist(7, 15), sum = 0; for (var i = 0; i < d.P.length; i++) sum += d.P[i];
near(sum, 1, 1e-9, "dist sums to 1"); ok(d.Q === 256, "Q for 15"); near(d.P[0] + d.P[64] + d.P[128] + d.P[192], 1, 1e-9, "peaks at multiples of Q/r");
var d2 = Q.shorDist(2, 21), s2 = 0; for (i = 0; i < d2.P.length; i++) s2 += d2.P[i]; near(s2, 1, 1e-9, "dist 21 sums to 1");
// probability mass near the r peaks k*Q/r
var mass = 0; for (var k = 0; k < 6; k++) { var c = Math.round(k * d2.Q / 6); for (var j = -1; j <= 1; j++) mass += d2.P[(c + j + d2.Q) % d2.Q]; } ok(mass > 0.8, "21 mass near peaks " + mass.toFixed(3));
// brute-force check of the formula for a small case against direct amplitude sums
(function () { var a = 2, N = 15, q = Q.qubitsFor(N), Qn = 1 << q, f = [], x; for (x = 0; x < Qn; x++) f.push(Q.modpow(a, x, N)); var dd = Q.shorDist(a, N), maxd = 0;
	for (var y = 0; y < Qn; y += 7) { var tot = 0, vals = {}; for (x = 0; x < Qn; x++) { var v = f[x]; vals[v] = vals[v] || [0, 0]; vals[v][0] += Math.cos(2 * Math.PI * x * y / Qn); vals[v][1] += Math.sin(2 * Math.PI * x * y / Qn); }
		Object.keys(vals).forEach(function (kk) { tot += (vals[kk][0] * vals[kk][0] + vals[kk][1] * vals[kk][1]) / (Qn * Qn); }); maxd = Math.max(maxd, Math.abs(tot - dd.P[y])); }
	ok(maxd < 1e-9, "formula = direct sum (" + maxd + ")"); })();
ok(Q.periodFrom(192, 256, 7, 15).r === 4, "contfrac 192/256"); ok(Q.periodFrom(85, 512, 2, 21).r === 6, "contfrac 85/512 -> 6");
var f15 = Q.shorFactor(15, 7); ok(f15.ok && f15.p * f15.q === 15, "factor 15"); var f21 = Q.shorFactor(21, 2); ok(f21.ok && f21.p * f21.q === 21, "factor 21");
ok(!Q.shorFactor(15, 14).ok, "a = 14 fails (r = 2, -1)"); ok(Q.shorFactor(35, 2).ok, "factor 35");
var good = 0; for (var N = 15; N <= 255; N += 2) { if (Q.isPrimeSmall(N) || Q.isPrimePower(N)) continue; for (var a = 2; a < N; a++) { var r = Q.shorFactor(N, a); if (r.ok && !r.trivial) { ok(r.p * r.q === N && r.p > 1 && r.p < N, "factor " + N); good++; break; } } }
ok(good > 50, "found factors for every odd composite " + good);

// Grover
var amp = Q.groverState(4, [5], Q.groverIters(16, 1)); near(amp[5] * amp[5], Q.groverSuccess(16, 1, 3), 1e-9, "grover sim = formula"); ok(amp[5] * amp[5] > 0.95, "grover 16 success");
var norm = 0; for (i = 0; i < amp.length; i++) norm += amp[i] * amp[i]; near(norm, 1, 1e-9, "unit norm");
ok(Q.groverIters(1 << 20, 1) === 804, "grover 2^20 -> 804"); var over = Q.groverState(4, [5], 6); ok(over[5] * over[5] < 0.5, "too many iterations overshoots");

// table + mosca
ok(Q.ALGOS.filter(function (a) { return a.st === "pq"; }).length >= 4, "pq algorithms"); ok(Q.ALGOS.every(function (a) { return a.name && a.st && a.why; }), "table complete");
ok(Q.mosca(10, 5, 12).risk && !Q.mosca(2, 3, 15).risk, "mosca"); ok(Q.bytesLabel(1184) === "1.2 KB", "bytes label");

console.log(n + " checks, " + fails + " failed"); process.exit(fails ? 1 : 0);
