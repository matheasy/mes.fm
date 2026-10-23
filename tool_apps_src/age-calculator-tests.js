// node tool_apps_src/age-calculator-tests.js -- MES Age Calculator maths (tool_apps_src/age-calculator/lib.js)
var AG = require('./age-calculator/lib.js');
var pass = 0, fail = 0;
function eq(a, b, msg) { var ok = JSON.stringify(a) === JSON.stringify(b); if (ok) pass++; else { fail++; console.log('FAIL ' + msg + ': got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b)); } }
function D(s) { var r = AG.parseDate(s); if (!r) throw new Error('bad date ' + s); return r.n; }
function ymd(b, on, rule) { var a = AG.age(D(b), D(on), rule || 'end'); return a ? [a.years, a.months, a.days] : null; }

// basic ages, the day before / on a birthday
eq(ymd('1990-03-15', '2026-03-14'), [35, 11, 27], 'day before birthday');
eq(ymd('1990-03-15', '2026-03-15'), [36, 0, 0], 'on birthday');
eq(ymd('1990-03-15', '1990-03-15'), [0, 0, 0], 'born today');
eq(ymd('1990-03-15', '1990-03-14'), null, 'before birth');
eq(ymd('1990-12-31', '1991-12-30'), [0, 11, 30], 'day before first birthday, year end');
// Jan 31 births: month ends clamp
eq(ymd('1990-01-31', '1990-02-28'), [0, 1, 0], 'Jan 31 -> Feb 28 (end rule)');
eq(ymd('1990-01-31', '1990-02-28', 'next'), [0, 0, 28], 'Jan 31 -> Feb 28 (next rule)');
eq(ymd('1990-01-31', '1990-03-01', 'next'), [0, 1, 0], 'Jan 31 -> Mar 1 (next rule)');
eq(ymd('1992-01-31', '1992-02-29'), [0, 1, 0], 'Jan 31 -> Feb 29 leap year');
eq(ymd('1992-01-31', '1992-02-28'), [0, 0, 28], 'Jan 31 -> Feb 28 in a leap year is not a month yet');
eq(ymd('1990-01-31', '1990-03-30'), [0, 1, 30], 'Jan 31 -> Mar 30');
eq(ymd('1990-01-31', '1990-03-31'), [0, 2, 0], 'Jan 31 -> Mar 31');
eq(ymd('1990-03-31', '1990-04-30'), [0, 1, 0], 'Mar 31 -> Apr 30');
// Feb 29 births
eq(ymd('2000-02-29', '2001-02-28'), [1, 0, 0], 'leapling turns 1 on Feb 28 (end rule)');
eq(ymd('2000-02-29', '2001-02-28', 'next'), [0, 11, 30], 'leapling not yet 1 on Feb 28 (next rule)');
eq(ymd('2000-02-29', '2001-03-01', 'next'), [1, 0, 0], 'leapling turns 1 on Mar 1 (next rule)');
eq(ymd('2000-02-29', '2004-02-29'), [4, 0, 0], 'leapling real birthday 2004');
eq(ymd('2000-02-29', '2004-02-28'), [3, 11, 30], 'day before a real leap birthday');
eq(AG.iso(AG.nextBirthday(D('2000-02-29'), D('2026-10-23'), 'end').n), '2027-02-28', 'next birthday end');
eq(AG.iso(AG.nextBirthday(D('2000-02-29'), D('2026-10-23'), 'next').n), '2027-03-01', 'next birthday next');
eq(AG.iso(AG.nextBirthday(D('2000-02-29'), D('2027-06-01'), 'end').n), '2028-02-29', 'next birthday real leap');
eq(AG.leapBirthdays(D('2000-02-29'), D('2026-10-23')), 6, 'real Feb 29s since 2000');
eq(AG.leapBirthdays(D('1896-02-29'), D('1904-03-01')), 1, '1900 is not a leap year');
// leap centuries
eq(AG.parseDate('1900-02-29'), null, '1900-02-29 does not exist');
eq(!!AG.parseDate('2000-02-29'), true, '2000-02-29 exists');
eq(D('1900-03-01') - D('1900-02-28'), 1, '1900: Feb 28 -> Mar 1 is one day');
eq(D('2000-03-01') - D('2000-02-28'), 2, '2000: Feb 28 -> Mar 1 is two days');
eq(AG.age(D('1899-12-31'), D('1999-12-31'), 'end').totalDays, 36524, '20th century has 36,524 days');
eq(AG.age(D('1999-12-31'), D('2099-12-31'), 'end').totalDays, 36525, '21st century has 36,525 days');
// DST-free day counts (US and EU spring/autumn changes)
eq(D('2026-03-09') - D('2026-03-07'), 2, 'across US spring forward');
eq(D('2026-11-02') - D('2026-10-31'), 2, 'across US fall back');
eq(D('2026-03-30') - D('2026-03-28'), 2, 'across EU change');
// totals
var a = AG.age(D('1990-03-15'), D('2026-10-23'), 'end');
eq([a.totalMonths, a.totalDays, a.weeks, a.weekDays], [439, 13371, 1910, 1], 'totals');
// next birthday / half birthday / weekdays
var nb = AG.nextBirthday(D('1990-03-15'), D('2026-10-23'), 'end');
eq([AG.iso(nb.n), nb.days, nb.turning, nb.dow], ['2027-03-15', 143, 37, 1], 'next birthday');
eq(AG.nextBirthday(D('1990-03-15'), D('2026-03-15'), 'end').today, true, 'birthday today');
eq(AG.iso(AG.nextHalfBirthday(D('1990-03-15'), D('2026-10-23'), 'end').n), '2027-09-15', 'half birthday Sep 15');
eq(AG.iso(AG.nextHalfBirthday(D('1990-08-31'), D('2026-01-10'), 'end').n), '2026-02-28', 'half birthday clamps to Feb 28');
eq(AG.fromDay(D('2000-01-01')).dow, 6, '2000-01-01 was a Saturday');
eq(AG.fromDay(D('1969-07-20')).dow, 0, 'Moon landing was a Sunday');
// milestones
var M = {}; AG.milestones(D('1990-03-15'), 'end').forEach(function (m) { M[m.key] = m; });
eq(AG.iso(M.d10000.n), '2017-07-31', '10,000 days');
eq(AG.iso(M.m500.n), '2031-11-15', '500 months');
eq(AG.iso(M.w1000.n), '2009-05-14', '1,000 weeks (same weekday, Thursday)');
eq(new Date(M.s1000000000.ms).toISOString(), '2021-11-21T01:46:40.000Z', '1 billion seconds from midnight UTC');
eq(AG.iso(AG.monthAnniv(D('2000-02-29'), 12, 'end')), '2001-02-28', 'leapling month-anniversary 12');
eq(AG.iso(AG.monthAnniv(D('2000-02-29'), 12, 'next')), '2001-03-01', 'leapling 12 months, next rule');
// sorted by date
var L = AG.milestones(D('1990-03-15'), 'end'); eq(L.every(function (m, i) { return !i || L[i - 1].n <= m.n; }), true, 'milestones sorted');
// parsing
function P(s, o) { var r = AG.parseDate(s, o, 2026); return r ? AG.iso(r.n) : null; }
eq(P('March 15, 1990'), '1990-03-15', 'month name first');
eq(P('15 March 1990'), '1990-03-15', 'day first name');
eq(P('15-Mar-1990'), '1990-03-15', 'dash');
eq(P('the 15th of March 1990'), '1990-03-15', 'ordinal');
eq(P('Thursday, March 15, 1990'), '1990-03-15', 'with weekday');
eq(P('15.03.1990'), '1990-03-15', 'dotted');
eq(P('19900315'), '1990-03-15', 'compact');
eq(P('1990/3/15'), '1990-03-15', 'ymd slashes');
eq(P('3/4/1990', 'mdy'), '1990-03-04', 'mdy');
eq(P('3/4/1990', 'dmy'), '1990-04-03', 'dmy');
eq(P('31/1/1990', 'mdy'), '1990-01-31', 'unambiguous day first');
eq(P('3/15/90'), '1990-03-15', 'two-digit year past');
eq(P('3/15/26'), '2026-03-15', 'two-digit year this year');
eq(P('3/15/27'), '1927-03-15', 'two-digit year never future');
eq(P('Feb 30 1990'), null, 'invalid day');
eq(P('hello'), null, 'garbage');
eq(AG.parseTime('6:30 pm'), 1110, 'time pm'); eq(AG.parseTime('18:30'), 1110, 'time 24h'); eq(AG.parseTime('12am'), 0, 'midnight');
// other units
var pa = AG.planetAges(3652.5, 0); eq(Math.round(pa[0].age * 100) / 100, 41.52, 'Mercury'); eq(Math.round(pa[2].age * 100) / 100, 10, 'Earth');
eq(Math.round(AG.humanFromDog(1)), 31, 'dog 1'); eq(Math.round(AG.humanFromDog(4)), 53, 'dog 4'); eq(Math.round(AG.dogFromHuman(AG.humanFromDog(7)) * 1e6) / 1e6, 7, 'dog inverse');
// zodiac + Chinese
eq(AG.sunSign(2, 15).name, 'Pisces', 'Mar 15 Pisces'); eq(AG.sunSign(0, 5).name, 'Capricorn', 'Jan 5'); eq(AG.sunSign(11, 25).name, 'Capricorn', 'Dec 25'); eq(AG.sunSign(6, 23).name, 'Leo', 'Jul 23');
eq(AG.chinese(D('1985-02-19')).animal, 'Rat', 'before CNY 1985 (Feb 20)'); eq(AG.chinese(D('1985-02-20')).animal, 'Ox', 'CNY 1985');
eq(AG.chinese(D('2000-02-29')).element + ' ' + AG.chinese(D('2000-02-29')).animal, 'Metal Dragon', '2000 Metal Dragon');
eq(AG.iso(AG.lunarNewYear(2026)), '2026-02-17', 'CNY 2026'); eq(AG.iso(AG.lunarNewYear(2034)), '2034-02-19', 'CNY 2034');
// two people
var d = AG.difference(D('1990-03-15'), D('2019-06-01'), 'end');
eq(d.older, 'a', 'older'); eq([d.gap.years, d.gap.months, d.gap.days], [29, 2, 17], 'gap');
eq(AG.iso(d.twice), '2048-08-17', 'twice'); eq((d.twice - D('1990-03-15')), 2 * (d.twice - D('2019-06-01')), 'twice exact');
eq(AG.difference(D('2019-06-01'), D('1990-03-15')).older, 'b', 'older b');
// age in year, links
var y = AG.ageInYear(D('1990-03-15'), 2050, 'end'); eq([y.turning, AG.iso(y.birthday), y.jan1], [60, '2050-03-15', 59], 'age in 2050');
eq(AG.toQuery({ d: D('1990-03-15'), on: D('2026-10-23') }), '?d=1990-03-15&on=2026-10-23', 'toQuery');
var q = AG.fromQuery('?d=2000-02-29&on=2026-10-23&t=06:30&tz=America/Vancouver&r=next');
eq([AG.iso(q.d), AG.iso(q.on), q.t, q.tz, q.rule], ['2000-02-29', '2026-10-23', 390, 'America/Vancouver', 'next'], 'fromQuery');
eq(AG.fromQuery('?d=1900-02-29&tz=<x>').d, undefined, 'fromQuery rejects bad');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
