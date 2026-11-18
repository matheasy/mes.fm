// node tool_apps_src/click-test-tests.js -- MES Click Speed Test maths (tool_apps_src/click-test/lib.js)
var C = require('./click-test/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
function near(a, b, m, tol) { n++; if (a == null || Math.abs(a - b) > (tol || 1e-9)) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
function even(cps, secs) { var t = [], g = 1000 / cps; for (var x = 0; x < secs * 1000 - 1e-9; x += g) t.push(Math.round(x * 1000) / 1000); return t; }

var s = C.stats(even(10, 10), 10000);
eq(s.clicks, 100, 'even 10 cps for 10 s = 100 clicks'); near(s.cps, 10, 'cps'); eq(s.peak1s, 10, 'peak in a 1 s window');
near(s.gapAvg, 100, 'avg gap', 1e-6); eq(s.consistency, 100, 'perfect rhythm'); near(s.gapMin, 100, 'min gap', 1e-6);
var e = C.stats([], 5000); eq(e.clicks, 0, 'empty'); eq(e.cps, 0, 'empty cps'); eq(e.gapAvg, null, 'no gaps'); eq(e.consistency, null, 'no consistency');
var one = C.stats([0], 1000); eq(one.clicks, 1, 'one click'); near(one.cps, 1, 'one click in 1 s');
// record pace: 760 in 60 s
var rec = C.stats(even(760 / 60, 60), 60000); eq(rec.clicks, 760, 'record pace 760 clicks'); near(rec.cps, 12.6667, 'record cps', 1e-3);
// burst: peak counts the densest second
var burst = [0, 50, 100, 150, 200, 250, 300, 350, 2000, 4000]; eq(C.peak(burst, 1000), 8, 'burst peak');
eq(C.stats(burst, 5000).peak1s, 8, 'stats peak'); eq(C.stats([0, 100, 200], 500).peak1s, 3, 'short test peak = all');
// uneven rhythm lowers consistency
var uneven = C.stats([0, 50, 250, 300, 500, 550, 750], 1000); n++; if (!(uneven.consistency < 70)) { fails++; console.log('FAIL uneven consistency ' + uneven.consistency); }
// unsorted input
eq(C.stats([300, 0, 100, 200], 1000).clicks, 4, 'unsorted ok'); near(C.stats([300, 0, 100, 200], 1000).gapAvg, 100, 'unsorted gaps');
// series
var ser = C.series(even(10, 5), 5000, 100); eq(ser.length, 50, 'series samples'); near(ser[ser.length - 1].cps, 10, 'series steady 10 cps', 0.01);
near(ser[4].cps, 10, 'early window scaled', 0.01); eq(ser[0].t, 100, 'first sample at step');
// per second
var ps = C.perSecond(even(10, 3), 3000); eq(ps.join(','), '10,10,10', 'per second bars');
eq(C.perSecond([0, 999, 1000, 2500], 3000).join(','), '2,1,1', 'bucket edges'); eq(C.perSecond([999.9], 1000).length, 1, '1 s test one bar');
eq(C.perSecond([2999], 2500).join(','), '0,0,1', 'late click goes in last bar');
// tiers
eq(C.tier(2).name, 'Warming up', 'tier low'); eq(C.tier(7).name, 'Quick', 'tier quick'); eq(C.tier(12.7).name, 'Very fast', 'record tier'); eq(C.tier(30).name, 'Drag clicking', 'tier drag');
// refs: only the Guinness one is not approximate
var verified = C.REFS.filter(function (r) { return !r.approx; }); eq(verified.length, 1, 'one verified ref'); near(verified[0].cps, 12.6667, 'gwr cps', 1e-3);
C.REFS.forEach(function (r) { if (r.approx && r.label.indexOf('approximate') < 0) { n++; fails++; console.log('FAIL approx label ' + r.id); } });
// keys + bests
eq(C.key(10, 'touch'), '10|touch', 'key'); eq(C.key('abc', 'zzz'), '10|mouse', 'bad key falls back'); eq(C.clampSecs(0), 1, 'clamp low'); eq(C.clampSecs(9999), 600, 'clamp high');
var b1 = C.addBest({}, '10|mouse', s, 5); eq(b1.best, true, 'first is best'); eq(b1.bests['10|mouse'].clicks, 100, 'stored');
var b2 = C.addBest(b1.bests, '10|mouse', C.stats(even(5, 10), 10000), 6); eq(b2.best, false, 'worse not best'); eq(b2.bests['10|mouse'].clicks, 100, 'kept');
var b3 = C.addBest(b2.bests, '10|mouse', e, 7); eq(b3.best, false, 'zero clicks never best');
eq(b1.bests === undefined, false, 'returns object'); eq(Object.keys({}).length, 0, 'input untouched');
// pace
near(C.pace(30, 5000, { clicks: 100 }, 10000), -20, 'behind best'); eq(C.pace(5, 1000, null, 10000), null, 'no best no pace');
near(C.pace(120, 20000, { clicks: 100 }, 10000), 20, 'pace capped at the end');
// formatting
eq(C.fmt(12.666), '12.67', 'fmt'); eq(C.fmt(null), '–', 'fmt null'); eq(C.fmtSecs(60), '1 min', '60 s'); eq(C.fmtSecs(100), '100 s', '100 s');
eq(C.niceMax(12.7), 15, 'niceMax'); eq(C.niceMax(0), 5, 'niceMax 0');
n++; if (C.shareText(s, 'touch').indexOf('100 times in 10 s') < 0) { fails++; console.log('FAIL share text'); }

console.log((fails ? fails + ' FAILED of ' : 'all ') + n + ' checks' + (fails ? '' : ' passed'));
process.exit(fails ? 1 : 0);
