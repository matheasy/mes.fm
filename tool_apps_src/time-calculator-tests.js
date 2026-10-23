// node tool_apps_src/time-calculator-tests.js
var TC = require("./time-calculator/lib.js"), n = 0, bad = 0;
function eq(a, b, msg) { n++; var ok = typeof b === "number" && typeof a === "number" ? Math.abs(a - b) < 1e-6 : JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log("FAIL", msg, "got", a, "want", b); } }
// parsing durations
eq(TC.parseDuration("1:30"), 5400, "h:mm"); eq(TC.parseDuration("2:45:30"), 9930, "h:mm:ss");
eq(TC.parseDuration("1h 30m"), 5400, "1h 30m"); eq(TC.parseDuration("1h30"), 5400, "1h30"); eq(TC.parseDuration("90 min"), 5400, "90 min");
eq(TC.parseDuration("1.5 h"), 5400, "1.5 h"); eq(TC.parseDuration("1.5"), 5400, "bare hours"); eq(TC.parseDuration("90", "m"), 5400, "bare minutes");
eq(TC.parseDuration("2 hours and 15 minutes"), 8100, "words"); eq(TC.parseDuration("45s"), 45, "seconds"); eq(TC.parseDuration("-0:45"), -2700, "negative");
eq(TC.parseDuration("1d 2h"), 93600, "days"); eq(TC.parseDuration("abc"), null, "junk"); eq(TC.parseDuration("1 30"), null, "two bare numbers");
eq(TC.parseDuration("1:75"), null, "bad minutes"); eq(TC.parseDuration(""), null, "empty"); eq(TC.parseDuration("7,5"), 27000, "decimal comma");
eq(TC.parseDuration("1x"), null, "unknown unit");
// clocks
eq(TC.parseClock("18:30"), 66600, "24h clock"); eq(TC.parseClock("6:30 pm"), 66600, "pm"); eq(TC.parseClock("12am"), 0, "12am"); eq(TC.parseClock("12:15 PM"), 44100, "12pm");
eq(TC.parseClock("noon"), 43200, "noon"); eq(TC.parseClock("25:00"), null, "bad hour"); eq(TC.parseClock("930"), 34200, "930");
// between + overnight
var b = TC.between(TC.parseClock("9:00"), TC.parseClock("17:30"), { breakSec: 1800 });
eq(b.sec, 28800, "9-17:30 minus 30 min"); eq(b.overnight, false, "day shift");
b = TC.between(TC.parseClock("22:00"), TC.parseClock("6:00")); eq(b.sec, 28800, "overnight 8h"); eq(b.overnight, true, "overnight flag");
b = TC.between(TC.parseClock("8:00"), TC.parseClock("8:00")); eq(b.sec, 0, "same time = 0");
b = TC.between(TC.parseClock("8:00"), TC.parseClock("8:00"), { fullDay: true }); eq(b.sec, 86400, "same time full day");
b = TC.between(TC.parseClock("9:00"), TC.parseClock("10:00"), { breakSec: 7200 }); eq(b.error, "break", "break longer than shift");
var d1 = TC.dayNum("2026-10-23"), d2 = TC.dayNum("2026-10-25");
b = TC.between(TC.parseClock("20:00"), TC.parseClock("8:00"), { startDate: d1, endDate: d2 }); eq(b.sec, 36 * 3600, "with dates 36h"); eq(b.days, 2, "days");
b = TC.between(TC.parseClock("20:00"), TC.parseClock("8:00"), { startDate: d2, endDate: d1 }); eq(b.error, "before", "end before start with dates");
eq(TC.dayNum("2026-02-30"), null, "invalid date"); eq(TC.dayStr(d1), "2026-10-23", "dayStr");
// sums
eq(TC.hms(TC.parseDuration("2:45:30") + TC.parseDuration("1:20:45"), true), "4:06:15", "2:45:30 + 1:20:45");
eq(TC.hms(TC.parseDuration("1:20:45") - TC.parseDuration("2:45:30"), true), "-1:24:45", "negative difference");
eq(TC.hms(TC.parseDuration("1:30") * 3, true), "4:30:00", "multiply"); eq(TC.hms(TC.parseDuration("10:00") / 3, true), "3:20:00", "divide");
var a = TC.addClock(TC.parseClock("22:30"), TC.parseDuration("3h 45m")); eq(TC.clock(a.clock, true), "02:15", "clock wraps"); eq(a.days, 1, "next day");
a = TC.addClock(TC.parseClock("1:00"), -TC.parseDuration("2h")); eq(TC.clock(a.clock, false), "11:00 PM", "back over midnight"); eq(a.days, -1, "previous day");
// decimal conversions + rounding
eq(TC.hms(TC.parseDuration("7.75"), false), "7:45", "7.75 h = 7:45"); eq(TC.decimalHours(TC.parseDuration("7:45")), 7.75, "7:45 = 7.75");
eq(TC.decimalHours(TC.parseDuration("0:20")), 0.33, "20 min = 0.33"); eq(TC.decimalHours(TC.parseDuration("0:20"), 4), 0.3333, "4 dp");
eq(TC.hms(89.6, false), "0:01", "rounds to minute"); eq(TC.hms(3599.6, true), "1:00:00", "rounds seconds up");
eq(TC.round(2.345, 2), 2.35, "half up"); eq(TC.round(-2.345, 2), -2.35, "half away from zero"); eq(TC.fixed(1234.5, 2), "1,234.50", "fixed");
eq(TC.roundTo(TC.parseDuration("7:53"), 15), TC.parseDuration("8:00"), "round to 15"); eq(TC.roundTo(TC.parseDuration("7:52"), 15), TC.parseDuration("7:45"), "round down 15");
eq(TC.words(93780), "1 day 2 h 3 min", "words"); eq(TC.convert(5400).minutes, 90, "convert minutes");
// timesheet
var C = TC.parseClock, rows = [];
for (var i = 0; i < 5; i++) rows.push({ in: C("8:00"), out: C("17:30"), brk: 1800 });
var ts = TC.timesheet(rows, { rate: 20 });
eq(ts.total, 45 * 3600, "5 x 9h"); eq(ts.ot, 0, "no OT when off"); eq(ts.pay, 900, "pay 45 x 20");
ts = TC.timesheet(rows, { dayOT: 8, rate: 20 }); eq(ts.ot, 5 * 3600, "daily OT 1h/day"); eq(ts.pay, 40 * 20 + 5 * 30, "daily OT pay");
ts = TC.timesheet(rows, { weekOT: 40, rate: 20 }); eq(ts.ot, 5 * 3600, "weekly OT 5h"); eq(ts.rows[4].ot, 5 * 3600, "weekly OT on last day");
ts = TC.timesheet(rows, { dayOT: 8, weekOT: 40 }); eq(ts.ot, 5 * 3600, "daily + weekly not double counted");
rows.push({ in: C("9:00"), out: C("13:00"), brk: 0 });
ts = TC.timesheet(rows, { dayOT: 8, weekOT: 40, rate: 10, otMult: 2 }); eq(ts.ot, 9 * 3600, "6th day all OT"); eq(ts.regular, 40 * 3600, "regular capped 40"); eq(ts.pay, 400 + 180, "double time");
ts = TC.timesheet([{ in: C("22:00"), out: C("6:30"), brk: 1800 }, { in: null, out: null }, { in: C("9:00"), out: null }], {});
eq(ts.total, 8 * 3600, "overnight row"); eq(ts.rows[0].overnight, true, "overnight row flag"); eq(ts.rows[1].empty, true, "empty row"); eq(ts.errors, 1, "half row error"); eq(ts.days, 1, "days counted");
ts = TC.timesheet([{ in: C("8:02"), out: C("16:09"), brk: 0 }], { round: 15 }); eq(ts.total, 8 * 3600, "rounded day");
console.log(n - bad + "/" + n + " passed"); if (bad) process.exit(1);
