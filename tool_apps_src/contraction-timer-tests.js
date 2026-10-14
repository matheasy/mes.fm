var C = require('./contraction-timer/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
var T0 = Date.UTC(2026, 0, 1, 12, 0, 0), MIN = 60000;
function mk(count, gapMin, durSec) { var out = []; for (var i = 0; i < count; i++) out.push({ s: T0 + i * gapMin * MIN, e: T0 + i * gapMin * MIN + durSec * 1000 }); return out; }
var l = mk(13, 5, 60), now = T0 + 12 * 5 * MIN + 70000;
eq(C.dur(l[0], now), 60, 'duration');
eq(C.gaps(l)[0], null, 'first gap null'); eq(C.gaps(l)[1], 300, 'gap 5 min');
var r = C.rule(l, now, '511'); eq(r.met, true, '13 contractions 5 min apart for an hour meets 5-1-1'); eq(r.run, 13, 'whole run');
eq(C.rule(mk(6, 5, 60), T0 + 5 * 5 * MIN + 70000, '511').met, false, 'only 25 minutes is not enough');
eq(C.rule(mk(13, 8, 60), T0 + 12 * 8 * MIN + 70000, '511').met, false, '8 minutes apart does not meet 5-1-1');
eq(C.rule(mk(13, 5, 30), T0 + 12 * 5 * MIN + 40000, '511').met, false, '30-second contractions do not meet 5-1-1');
eq(C.rule(mk(13, 5, 55), T0 + 12 * 5 * MIN + 60000, '511').met, true, '55 s counts (80% tolerance)');
var mixed = mk(8, 15, 45).concat(mk(13, 5, 60).map(function (x) { return { s: x.s + 8 * 15 * MIN, e: x.e + 8 * 15 * MIN }; }));
eq(C.rule(mixed, T0 + (8 * 15 + 12 * 5) * MIN + 70000, '511').met, true, 'earlier slow contractions do not hide a later qualifying run');
eq(C.rule(mk(13, 5, 60), T0 + 12 * 5 * MIN + 30 * MIN, '511').met, false, 'stale: nothing for 30 minutes breaks the run');
var s = C.summary(l, now, 62); eq(s.count, 13, 'summary count'); eq(Math.round(s.avgGap), 300, 'avg gap'); eq(Math.round(s.avgDur), 60, 'avg dur');
eq(C.summary([], now, 60).avgGap, null, 'empty summary');
eq(C.fmtDur(75), '1:15', 'fmt'); eq(C.fmtDur(5), '0:05', 'fmt small');
eq(C.toCSV(mk(2, 5, 60)).split('\n').length, 3, 'csv rows');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
