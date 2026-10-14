/* node tool_apps_src/ovulation-calculator-tests.js */
var C = require('./ovulation-calculator/lib.js'), fails = 0, n = 0;
function eq(a, b, msg) { n++; if (a !== b && !(typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9)) { fails++; console.log('FAIL ' + msg + ': got ' + a + ', want ' + b); } }
var D = function (s) { return C.parseISO(s); };

// dates
eq(C.iso(D('2026-03-01') - 1), '2026-02-28', 'day before 1 Mar 2026');
eq(C.iso(D('2028-02-28') + 1), '2028-02-29', 'leap day');
eq(C.parseISO('2026-02-30'), null, 'invalid date rejected');
eq(C.fmt(D('2026-10-14')), 'Wednesday, October 14, 2026', 'fmt');

// 28-day cycle, LMP 1 Jan 2026: ovulation day 15 (14 Jan), fertile 9-14 Jan, next period 29 Jan
var p = C.predict({ lmp: D('2026-01-01'), cycle: 28 });
eq(C.iso(p.ovulation), '2026-01-15', 'ovulation 28d');
eq(C.iso(p.fertileStart), '2026-01-10', 'fertile start 28d');
eq(C.iso(p.fertileEnd), '2026-01-15', 'fertile end = ovulation');
eq(C.iso(p.nextPeriod), '2026-01-29', 'next period 28d');
eq(p.fertileEnd - p.fertileStart + 1, 6, 'fertile window is 6 days');
// 35-day cycle: ovulation day 22 (offset 21)
p = C.predict({ lmp: D('2026-01-01'), cycle: 35 });
eq(C.iso(p.ovulation), '2026-01-22', 'ovulation 35d');
// 24-day cycle with a 12-day luteal phase
p = C.predict({ lmp: D('2026-01-01'), cycle: 24, luteal: 12 });
eq(C.iso(p.ovulation), '2026-01-13', 'ovulation 24d luteal 12');
// positive LH test on 12 Jan -> ovulation 13 Jan, period 14 days later
p = C.predict({ lmp: D('2026-01-01'), cycle: 28, lh: D('2026-01-12') });
eq(C.iso(p.ovulation), '2026-01-13', 'LH ovulation');
eq(C.iso(p.nextPeriod), '2026-01-27', 'LH next period');
// range: cycles 26-32 -> fertile from lmp+26-14-5 = +7 to lmp+32-14 = +18
var r = C.predictRange({ lmp: D('2026-01-01'), shortest: 26, longest: 32 });
eq(C.iso(r.fertileStart), '2026-01-08', 'range fertile start');
eq(C.iso(r.fertileEnd), '2026-01-19', 'range fertile end');
// projection
var rows = C.project({ lmp: D('2026-01-01'), cycle: 30, periodLen: 5 }, 4);
eq(rows.length, 4, 'project rows');
eq(C.iso(rows[1].start), '2026-01-31', 'second cycle start');
eq(C.iso(rows[3].start), '2026-04-01', 'fourth cycle start');
eq(rows[0].periodEnd - rows[0].start, 4, 'period length 5 days');
// with an LH test the following cycle follows from the real next period
rows = C.project({ lmp: D('2026-01-01'), cycle: 28, luteal: 14, lh: D('2026-01-14') }, 2);
eq(C.iso(rows[1].start), '2026-01-29', 'cycle after LH-anchored one');
// chance table
eq(C.chanceOn(0), 0.33, 'chance day 0');
eq(C.chanceOn(-6), 0.02, 'chance far from ovulation');

// history
var s = C.stats([D('2026-01-01'), D('2026-01-29'), D('2026-02-26'), D('2026-03-26')]);
eq(s.count, 3, 'stats count'); eq(s.avg, 28, 'avg'); eq(s.range, 0, 'range'); eq(s.regular, 'regular', 'regular');
s = C.stats([D('2026-01-01'), D('2026-01-25'), D('2026-03-05'), D('2026-03-30')]);   // 24, 39, 25
eq(s.min, 24, 'min'); eq(s.max, 39, 'max'); eq(s.regular, 'varies', 'varies'); eq(s.outside, 1, 'outside 21-38');
eq(C.stats([D('2026-01-01')]), null, 'one date has no cycles');
eq(C.stats([D('2026-01-01'), D('2026-01-01'), D('2026-01-29')]).count, 1, 'duplicates ignored');
var fp = C.futurePeriods(D('2026-01-01'), 28.4, 3, 26, 30, 5);
eq(C.iso(fp[0].start), '2026-01-29', 'future period 1'); eq(C.iso(fp[2].start), '2026-03-26', 'future period 3');
eq(C.iso(fp[1].earliest), '2026-02-22', 'future earliest'); eq(C.iso(fp[0].end), '2026-02-02', 'future end');

// due date (known answers)
eq(C.iso(C.dueFromLMP(D('2026-01-01'), 28)), '2026-10-08', 'Naegele 1 Jan 2026');
eq(C.iso(C.dueFromLMP(D('2026-01-01'), 32)), '2026-10-12', 'cycle 32 adds 4 days');
eq(C.iso(C.dueFromLMP(D('2026-01-01'), 24)), '2026-10-04', 'cycle 24 subtracts 4 days');
eq(C.iso(C.dueFromConception(D('2026-01-15'))), '2026-10-08', 'conception +266 = same due date as LMP 1 Jan');
eq(C.iso(C.dueFromTransfer(D('2026-01-15'), 5)), '2026-10-03', 'day-5 transfer');
eq(C.iso(C.dueFromTransfer(D('2026-01-15'), 3)), '2026-10-05', 'day-3 transfer');
eq(C.iso(C.dueFromUltrasound(D('2026-03-05'), 12, 3)), C.iso(D('2026-03-05') + 280 - 87), 'ultrasound');
eq(C.iso(C.dueFromUltrasound(D('2026-03-05'), 9, 0)), '2026-11-23' === C.iso(D('2026-03-05') + 217) ? '2026-11-23' : C.iso(D('2026-03-05') + 217), 'ultrasound 9w');
var g = C.gestation(D('2026-10-08'), D('2026-03-26'));       // LMP 1 Jan -> 84 days = 12w0d
eq(g.days, 84, 'ga days'); eq(g.weeks, 12, 'ga weeks'); eq(g.rem, 0, 'ga rem'); eq(g.trimester, 1, 'trimester 1');
g = C.gestation(D('2026-10-08'), D('2026-07-09'));            // day 189 = 27w0d
eq(g.weeks, 27, '27 weeks'); eq(g.trimester, 2, 'trimester 2');
g = C.gestation(D('2026-10-08'), D('2026-07-16'));            // 28w0d
eq(g.trimester, 3, 'trimester 3');
g = C.gestation(D('2026-10-08'), D('2026-10-08')); eq(g.weeks, 40, 'due date is 40w0d'); eq(g.toGo, 0, 'zero to go');
var ms = C.milestones(D('2026-10-08'));
eq(C.iso(ms[ms.length - 3].day), '2026-10-08', 'due-date milestone');
eq(C.iso(C.conceptionWindow(D('2026-10-08')).likely), '2026-01-15', 'conception estimate');

// calendar file
var f = C.ics([{ start: D('2026-01-10'), end: D('2026-01-15'), title: 'Fertile window, with comma' }], 'Test');
eq(f.indexOf('DTSTART;VALUE=DATE:20260110') > 0, true, 'ics start');
eq(f.indexOf('DTEND;VALUE=DATE:20260116') > 0, true, 'ics end is exclusive');
eq(f.indexOf('SUMMARY:Fertile window\\, with comma') > 0, true, 'ics escaping');
eq(/\r\n$/.test(f), true, 'ics CRLF');

console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
