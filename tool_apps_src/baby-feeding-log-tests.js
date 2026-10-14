var F = require('./baby-feeding-log/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
var T0 = new Date(2026, 0, 5, 6, 0, 0).getTime(), MIN = 60000;
var l = [{ t: 'bl', s: T0, e: T0 + 8 * MIN }, { t: 'br', s: T0 + 9 * MIN, e: T0 + 15 * MIN }, { t: 'bt', s: T0 + 180 * MIN, e: T0 + 190 * MIN, ml: 90 }, { t: 'wet', s: T0 + 20 * MIN }, { t: 'dirty', s: T0 + 25 * MIN }, { t: 'bl', s: T0 + 360 * MIN, e: T0 + 372 * MIN }, { t: 'pm', s: T0 + 400 * MIN, e: T0 + 415 * MIN, ml: 120 }];
eq(F.feeds(l, 20).length, 3, 'left then right is one feed, bottle and later feed are separate');
eq(F.nextSide(l), 'br', 'last breast was left so next is right'); eq(F.nextSide([]), null, 'no history');
var a = F.dayStart(T0), s = F.summary(l, a, a + 86400000, T0 + 500 * MIN);
eq(s.feeds, 3, 'feeds'); eq(s.breastSec, (8 + 6 + 12) * 60, 'breast seconds'); eq(s.bottleMl, 90, 'bottle ml'); eq(s.pumpMl, 120, 'pump ml'); eq(s.wet, 1, 'wet'); eq(s.dirty, 1, 'dirty'); eq(s.bottles, 1, 'bottles');
eq(Math.round(s.avgGapMin), 180, 'average gap between feed starts'); eq(F.lastFeed(l).start, T0 + 360 * MIN, 'last feed');
eq(F.summary(l, a + 86400000, a + 2 * 86400000, T0).feeds, 0, 'other day empty');
eq(Math.round(F.mlToOz(F.ozToMl(4)) * 100), 400, 'oz round trip'); eq(F.fmtDur(125), '2:05', 'dur'); eq(F.fmtAgo(0.2), 'just now', 'ago'); eq(F.fmtAgo(135), '2 h 15 min ago', 'ago hours'); eq(F.toCSV(l).split('\n').length, 8, 'csv');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
