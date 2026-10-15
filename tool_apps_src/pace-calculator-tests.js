// node tool_apps_src/pace-calculator-tests.js
const PC = require("./pace-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(PC.parseTime("25:00"), 1500, "mm:ss"); eq(PC.parseTime("1:45:30"), 6330, "h:mm:ss"); eq(PC.parseTime("25"), 1500, "bare minutes"); eq(PC.parseTime("25.5"), 1530, "decimal minutes"); eq(PC.parseTime("1h 45m 30s"), 6330, "words"); eq(PC.parseTime("45m"), 2700, "45m"); eq(PC.parseTime("90s"), 90, "90s"); eq(PC.parseTime("4:75"), 4 * 60 + 75, "seconds over 59 allowed in mm:ss");
eq(PC.parseTime("1:75:00"), null, "bad minutes"); eq(PC.parseTime("abc"), null, "junk"); eq(PC.parseTime(""), null, "empty"); eq(PC.parseTime("5:"), null, "trailing colon");
eq(PC.fmt(1500), "25:00", "fmt"); eq(PC.fmt(6330), "1:45:30", "fmt h"); eq(PC.fmt(59.6), "1:00", "rounds up"); eq(PC.fmt(125.34, true), "2:05.3", "tenths"); eq(PC.fmt(-1), "", "negative");
// 25:00 for 5 km = 5:00 / km = 8:02.3 / mi
eq(PC.paceOf(1500, 5000, "km"), 300, "5:00/km"); eq(PC.paceOf(1500, 5000, "mi"), 1500 / (5000 / 1609.344), "per mile"); eq(PC.timeOf(300, 10000, "km"), 3000, "10k at 5:00"); eq(PC.distOf(3000, 300, "km"), 10000, "dist");
eq(PC.convertPace(300, "km", "mi"), 300 * 1.609344, "km->mi pace"); eq(PC.convertPace(PC.convertPace(300, "km", "mi"), "mi", "km"), 300, "round trip");
const sp = PC.speed(1500, 5000); eq(sp.kmh, 12, "12 km/h"); eq(sp.mph, 12 / 1.609344, "mph", 1e-9);
eq(PC.paceFromSpeed(12, "kmh", "km"), 300, "12 km/h = 5:00/km"); eq(PC.paceFromSpeed(6, "mph", "mi"), 600, "6 mph = 10:00/mi");
// Riegel: 20:00 5K -> 10K = 1200 * 2^1.06 = 2502 s (41:42)
eq(Math.round(PC.riegel(1200, 5000, 10000)), 2502, "riegel 10k"); eq(Math.round(PC.riegel(1200, 5000, 5000)), 1200, "same distance");
const e = PC.splits(3000, 10000, "km", 0); eq(e.length, 10, "10 splits"); eq(e[0].time, 300, "even 5:00"); eq(e[9].cum, 3000, "cum = total"); eq(e[9].to, 10000, "ends at distance");
const ng = PC.splits(3000, 10000, "km", -0.06); eq(ng[0].pace > ng[9].pace, true, "negative split: faster at the end"); eq(ng[9].cum, 3000, "negative total", 1e-9); eq(ng.reduce((a, x) => a + x.time, 0), 3000, "splits add up", 1e-9);
const ps = PC.splits(3000, 10000, "km", 0.06); eq(ps[0].pace < ps[9].pace, true, "positive split: slower at the end"); eq(Math.abs((ps[0].pace + ps[9].pace) / 2 - 300) < 3, true, "centred on the average pace");
const half = PC.splits(6000, 21097.5, "km", 0); eq(half.length, 22, "22 splits in a half"); eq(half[21].len, 97.5, "partial last km", 1e-9); eq(half[21].time, half[0].time * 0.0975, "partial split time", 1e-6); eq(half[21].cum, 6000, "half total");
eq(PC.splits(100, 1000, "km", 0.1).length, 1, "single split"); eq(PC.splits(100, 1000, "km", 0.1)[0].time, 100, "single split time");
eq(PC.clock("07:30", 5400), "09:00", "clock"); eq(PC.clock("23:30", 3600), "00:30 (+1d)", "past midnight"); eq(PC.clock("x", 5), null, "bad start");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
