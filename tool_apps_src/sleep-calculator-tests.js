// node tool_apps_src/sleep-calculator-tests.js
const SL = require("./sleep-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(SL.parse("07:30"), 450, "parse"); eq(SL.parse("0:05"), 5, "parse 0:05"); eq(SL.parse("24:00"), null, "bad hour"); eq(SL.parse("7:60"), null, "bad minute"); eq(SL.parse("x"), null, "junk");
eq(SL.fmt(450), "7:30 AM", "12h"); eq(SL.fmt(0), "12:00 AM", "midnight"); eq(SL.fmt(720), "12:00 PM", "noon"); eq(SL.fmt(23 * 60 + 5), "11:05 PM", "11:05 PM"); eq(SL.fmt(450, true), "07:30", "24h"); eq(SL.fmt(-30), "11:30 PM", "negative wraps"); eq(SL.fmt(1500), "1:00 AM", "over a day wraps");
eq(SL.dur(450), "7 h 30 min", "dur"); eq(SL.dur(480), "8 h", "dur whole");
// bed 23:00, 15 min to fall asleep, 90 min cycles: 5 cycles -> 23:00 + 15 + 450 = 06:45
eq(SL.wakeTimes(23 * 60, 15, 90, [4, 5, 6]).map(x => SL.fmt(x.time, true)), ["05:15", "06:45", "08:15"], "wake times");
// wake 07:00 (420): 6 cycles back = 420 - 540 - 15 = 21:45; 5 cycles = 23:15; 4 cycles = 00:45 (past midnight)
eq(SL.bedTimes(7 * 60, 15, 90, [6, 5, 4]).map(x => SL.fmt(x.time, true)), ["21:45", "23:15", "00:45"], "bed times");
eq(SL.wakeTimes(0, 0, 90, [1])[0].time, 90, "midnight bed"); eq(SL.wakeTimes(23 * 60 + 50, 15, 90, [1])[0].time, 23 * 60 + 50 + 15 + 90 - 1440, "wraps past midnight");
eq(SL.need("adult").lo, 7, "adult"); eq(SL.need("zzz").id, "adult", "fallback"); SL.NEED.forEach(x => eq(x.lo < x.hi, true, "need ordered " + x.id));
eq(SL.status(450, SL.need("adult")), "good", "7.5 h"); eq(SL.status(420, SL.need("adult")), "good", "7 h edge"); eq(SL.status(360, SL.need("adult")), "short", "6 h"); eq(SL.status(270, SL.need("adult")), "veryshort", "4.5 h"); eq(SL.status(600, SL.need("adult")), "long", "10 h"); eq(SL.status(480, SL.need("senior")), "good", "8 h senior edge");
const h = SL.hypnogram(5, 90, 15); eq(h[0].stage, "W", "starts awake"); eq(h[0].dur, 15, "latency"); eq(h.reduce((a, x) => a + x.dur, 0), 15 + 450, "total = latency + cycles", 1e-9);
for (let i = 1; i < h.length; i++) eq(h[i].start, h[i - 1].start + h[i - 1].dur, "contiguous " + i, 1e-9);
const t = SL.stageTotals(h); eq(Math.abs(t.N1 + t.N2 + t.N3 + t.REM - 450) < 1e-9, true, "stages add up"); eq(SL.cycleStages(0, 90).find(x => x.stage === "N3").dur > SL.cycleStages(4, 90).find(x => x.stage === "N3").dur, true, "more deep sleep early"); eq(SL.cycleStages(4, 90).find(x => x.stage === "REM").dur > SL.cycleStages(0, 90).find(x => x.stage === "REM").dur, true, "more REM late");
eq(t.REM / 450 > 0.15 && t.REM / 450 < 0.35, true, "REM about 20-30% of the night"); eq(t.N3 / 450 > 0.08 && t.N3 / 450 < 0.25, true, "deep sleep about 10-20%"); eq(SL.hypnogram(2, 90, 0)[0].stage, "N1", "no latency, no wake block");
const ev = SL.evening(23 * 60); eq(SL.fmt(ev.caffeine, true), "17:00", "caffeine 6 h before"); eq(SL.fmt(ev.meal, true), "20:00", "meal 3 h before"); eq(SL.fmt(ev.screens, true), "22:00", "screens 1 h before"); eq(SL.fmt(SL.evening(60).caffeine, true), "19:00", "wraps to the evening before");
eq(SL.napWake(14 * 60, 20, 5), 14 * 60 + 25, "nap wake"); eq(SL.NAPS.length, 4, "four naps");
const d = SL.debt(8, [8, 6, 7, null, 9, 5, 8]); eq(d.nights, 6, "nights counted"); eq(d.debt, 2 + 1 + 3, "debt"); eq(d.extra, 1, "extra"); eq(d.net, 5, "net debt"); eq(d.avg, 43 / 6, "avg"); eq(SL.debt(8, [null, null]), null, "no data");
eq(SL.parseHours("7"), 7, "7"); eq(SL.parseHours("7:30"), 7.5, "7:30"); eq(SL.parseHours("7.5"), 7.5, "7.5"); eq(SL.parseHours("7h30"), 7.5, "7h30"); eq(SL.parseHours("30"), null, "over 24"); eq(SL.parseHours("abc"), null, "junk"); eq(SL.parseHours(""), null, "empty");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
