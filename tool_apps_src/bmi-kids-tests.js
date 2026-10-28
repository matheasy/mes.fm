// Tests for the BMI Calculator for Kids and Teens (tool_apps_src/bmi-kids/lib.js). Run: node tool_apps_src/bmi-kids-tests.js
var K = require('./bmi-kids/lib.js'), n = 0, fails = 0;
function ok(c, m) { n++; if (!c) { fails++; console.log('FAIL ' + m); } }
function near(a, b, tol, m) { n++; if (!(Math.abs(a - b) <= tol)) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }

// CDC 2000 BMI-for-age percentiles as printed on the CDC charts / tables (boys and girls, 2-20 years)
near(K.bmiAt('m', 24.5, 50), 16.55, 0.02, 'boys 2y median'); near(K.bmiAt('m', 24.5, 95), 19.28, 0.03, 'boys 2y 95th');
near(K.bmiAt('m', 120.5, 5), 14.2, 0.05, 'boys 10y 5th'); near(K.bmiAt('m', 120.5, 85), 19.4, 0.05, 'boys 10y 85th'); near(K.bmiAt('m', 120.5, 95), 22.1, 0.1, 'boys 10y 95th');
near(K.bmiAt('f', 120.5, 85), 20.0, 0.05, 'girls 10y 85th'); near(K.bmiAt('f', 120.5, 95), 23.0, 0.05, 'girls 10y 95th');
near(K.bmiAt('m', 180.5, 85), 23.4, 0.1, 'boys 15y 85th'); near(K.bmiAt('f', 180.5, 95), 28.1, 0.1, 'girls 15y 95th');
// LMS round trip and the data table edges
[['m', 30], ['f', 100.3], ['m', 239.9], ['f', 24]].forEach(function (a) { [3, 25, 50, 75, 90].forEach(function (p) { near(K.percentile(a[0], a[1], K.bmiAt(a[0], a[1], p)), p, 1e-4, 'round trip ' + a + ' ' + p); }); });
var L = K.lms('f', 24.5); near(L[1], 16.388041, 1e-6, 'girls 24.5 mo M from table');
var L2 = K.lms('m', 60), La = K.lms('m', 59.5), Lb = K.lms('m', 60.5); near(L2[1], (La[1] + Lb[1]) / 2, 1e-9, 'linear between rows');
ok(isFinite(K.lms('m', 240)[1]) && isFinite(K.lms('m', 500)[1]), 'clamped past the table');
// percentiles go up with BMI, down with age (same BMI is "less" for an older child, up to the teens)
ok(K.percentile('m', 96, 18) < K.percentile('m', 96, 19), 'monotone in BMI');
ok(K.percentile('f', 60, 18) > K.percentile('f', 150, 18), 'same BMI lower percentile when older');
// extended method (CDC 2022): continuous at the 95th percentile, then 90 + 10 * Phi((BMI - P95) / sigma)
near(K.percentile('m', 120.5, K.p95('m', 120.5)), 95, 1e-6, 'extended continuous at P95');
near(K.percentile('m', 120.5, K.p95('m', 120.5) + 0.0001), 95, 1e-3, 'just above P95');
near(K.sigma('m', 120), 0.3728 + 0.5196 * 10 - 0.0091 * 100, 1e-8, 'sigma boys 10y'); near(K.sigma('f', 180), 0.8334 + 0.3712 * 15 - 0.0011 * 225, 1e-8, 'sigma girls 15y');
var b = K.p95('f', 150) + K.sigma('f', 150); near(K.percentile('f', 150, b), 90 + 10 * K.cdf(1), 1e-6, 'one sigma above P95');
near(K.bmiAt('m', 140, 98), K.p95('m', 140) + K.invcdf(0.8) * K.sigma('m', 140), 1e-9, 'extended 98th curve');
ok(K.percentile('m', 140, 60) < 100 && K.percentile('m', 140, 60) > 99.9, 'very high BMI stays below 100');
// categories
var m = 120.5;
ok(K.category('m', m, K.bmiAt('m', m, 4.9)) === 'under', 'under'); ok(K.category('m', m, K.bmiAt('m', m, 5.01)) === 'healthy', 'healthy from 5th');
ok(K.category('m', m, K.bmiAt('m', m, 84.99)) === 'healthy', 'healthy below 85th'); ok(K.category('m', m, K.bmiAt('m', m, 85.01)) === 'over', 'overweight from 85th');
ok(K.category('m', m, K.bmiAt('m', m, 95.01)) === 'obese', 'obesity from 95th'); ok(K.category('m', m, K.p95('m', m) * 1.2) === 'severe', 'severe at 120% of P95');
ok(K.category('m', m, K.p95('m', m) * 1.19) === 'obese', 'below 120% is not severe');
var A = K.analyse('f', 100.5, 30, 130); near(A.bmi, 30 / 1.69, 1e-9, 'bmi'); ok(A.cat === K.category('f', 100.5, A.bmi) && A.p5 < A.p50 && A.p50 < A.p85 && A.p85 < A.p95 && A.p95 < A.sev, 'analyse ordering');
ok(K.analyse('f', 100, 0, 120) === null, 'needs weight');
// ages
near(K.monthsFromYM(9, 6), 114.5, 1e-12, '9y6m -> 114.5 months'); near(K.monthsFromDays(365.25 * 10), 120, 1e-9, '10 years of days');
ok(K.ageCheck(23.9) !== '' && K.ageCheck(24) === '' && K.ageCheck(239.99) === '' && K.ageCheck(240) !== '', 'age range 2 to 20');
ok(K.ageText(114.5) === '9 years 6 months' && K.ageText(24.5) === '2 years', 'age text');
// units
near(K.lbToKg(K.kgToLb(31.4)), 31.4, 1e-12, 'kg <-> lb'); near(K.lbToKg(100), 45.359237, 1e-9, '100 lb');
var f = K.cmToFtIn(152.4); ok(f[0] === 5 && Math.abs(f[1]) < 1e-9, '152.4 cm = 5 ft'); near(K.ftInToCm(4, 6), 137.16, 1e-9, '4 ft 6 in');
var g = K.cmToFtIn(182.8); ok(g[0] === 6 && g[1] === 0, 'rounds 5 ft 11.97 in up to 6 ft');
// text
ok(K.pctText(72.8) === '72nd' && K.pctText(84.99) === '84th' && K.pctText(11.2) === '11th' && K.pctText(99.62) === '99.6th' && K.pctText(0.04) === 'below the 0.1st' && K.pctText(0.55) === '0.5th', 'percentile text');
console.log((fails ? fails + ' FAILED of ' : 'all ') + n + ' checks' + (fails ? '' : ' passed'));
process.exit(fails ? 1 : 0);
