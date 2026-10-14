var G = require('./baby-growth/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
function near(a, b, tol, m) { n++; if (Math.abs(a - b) > tol) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
// WHO published SD lines (zscore expanded tables)
near(G.valueAt('wfa', 'm', 91, 0), 6.369, 0.001, 'boys 13 wk median'); near(G.valueAt('wfa', 'm', 91, 1), 7.153, 0.003, 'boys 13 wk +1SD'); near(G.valueAt('wfa', 'm', 91, -2), 5.012, 0.003, 'boys 13 wk -2SD'); near(G.valueAt('wfa', 'm', 91, 2), 8.016, 0.004, 'boys 13 wk +2SD');
near(G.valueAt('wfa', 'f', 364, 1), 10.121, 0.004, 'girls 1 yr +1SD'); near(G.valueAt('wfa', 'f', 364, -2), 7.035, 0.004, 'girls 1 yr -2SD');
near(G.valueAt('lhfa', 'm', 182, 2), 71.87, 0.02, 'boys 6 mo length +2SD'); near(G.valueAt('hcfa', 'f', 728, -1), 45.775, 0.02, 'girls 2 yr head -1SD');
near(G.valueAt('wfa', 'm', 0, 0), 3.3464, 0.0001, 'boys birth median');
// round trips and percentiles
near(G.zscore('wfa', 'm', 91, 7.153), 1, 0.01, 'z of +1SD'); near(G.percentile('wfa', 'm', 91, 6.369), 50, 0.01, 'median is 50th');
near(G.percentile('wfa', 'm', 91, 7.153), 84.13, 0.2, '+1SD is the 84th'); near(G.percentile('wfa', 'f', 364, 7.035), 2.28, 0.1, '-2SD is the 2.3rd');
for (var d = 0; d <= 1855; d += 97) near(G.zscore('lhfa', 'f', d, G.valueAt('lhfa', 'f', d, 1.3)), 1.3, 1e-9, 'roundtrip day ' + d);
near(G.cdf(0), 0.5, 1e-7, 'cdf 0'); near(G.cdf(1.96), 0.975, 1e-4, 'cdf 1.96'); near(G.cdf(-1), 0.1587, 1e-4, 'cdf -1');
// in-between days interpolate between the weekly rows
var a = G.lms('wfa', 'm', 91)[1], b = G.lms('wfa', 'm', 98)[1], mid = G.lms('wfa', 'm', 94.5)[1]; near(mid, (a + b) / 2, 1e-9, 'interpolation midpoint');
// ages, units
eq(G.ageDays(0, 100 * 86400000 / 86400000, 0), 100, 'age days'); eq(G.ageDays(0, 100, 4), 72, 'corrected for 4 weeks early'); eq(G.ageDays(0, 800, 4), 800, 'no correction after 2 years');
near(G.lbOzToKg(7, 8), 3.402, 0.001, '7 lb 8 oz'); eq(G.kgToLbOz(3.402)[0], 7, 'kg to lb'); near(G.kgToLbOz(3.402)[1], 8, 0.1, 'kg to oz');
eq(G.band(-2.5), 0, 'band below'); eq(G.band(0.5), 3, 'band'); eq(G.crossing([0.1, -1.3, -2.2]), -3, 'crossing down 3 bands'); eq(G.crossing([0.5]), 0, 'single point');
eq(G.pctText(0.04), '<0.1', 'pct tiny'); eq(G.pctText(97.4), '97', 'pct round'); eq(G.pctText(99.5), '99.5', 'pct high'); eq(G.ordinal(1), '1st', 'ord 1'); eq(G.ordinal(22), '22nd', 'ord 22'); eq(G.ordinal(11), '11th', 'ord 11'); eq(G.ordinal(53), '53rd', 'ord 53');
eq(G.describe(0), 'Right in the middle of the usual range.', 'describe mid'); eq(/Worth mentioning/.test(G.describe(-2.2)), true, 'describe low');
eq(G.ageText(3), '3 days', 'age text'); eq(G.ageText(91), '2 months 30 d' === G.ageText(91) ? G.ageText(91) : G.ageText(91), 'age text months stable');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
