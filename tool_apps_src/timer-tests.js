// node tool_apps_src/timer-tests.js
const TM = require("./timer/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b)); } }
eq(TM.clock(3725000), "1:02:05", "h:mm:ss"); eq(TM.clock(125000), "02:05", "mm:ss"); eq(TM.clock(125000, false, true), "0:02:05", "alwaysH"); eq(TM.clock(200, true), "00:01", "countdown rounds up"); eq(TM.clock(200, false), "00:00", "stopwatch rounds down"); eq(TM.clock(-5), "00:00", "negative");
eq(TM.precise(125370), "02:05.37", "precise"); eq(TM.precise(3725999), "1:02:05.99", "precise h"); eq(TM.parts(3725450, false), { h: 1, m: 2, s: 5, t: 4, ms: 450 }, "parts");
eq(TM.parseDuration("25"), 1500000, "bare = minutes"); eq(TM.parseDuration("25m"), 1500000, "25m"); eq(TM.parseDuration("1h 30m"), 5400000, "1h 30m"); eq(TM.parseDuration("90s"), 90000, "90s"); eq(TM.parseDuration("1:30"), 90000, "m:s"); eq(TM.parseDuration("1:30:00"), 5400000, "h:m:s");
eq(TM.parseDuration("1.5h"), 5400000, "1.5h"); eq(TM.parseDuration("2 min 30 sec"), 150000, "words"); eq(TM.parseDuration("abc"), null, "junk"); eq(TM.parseDuration(""), null, "empty"); eq(TM.parseDuration("5 apples"), null, "trailing junk");
eq(TM.hmsToMs(1, 2, 3), 3723000, "hms"); eq(TM.hmsToMs("", "5", ""), 300000, "blank fields"); eq(TM.hmsToMs(-1, 0, 0), 0, "negative");
eq(TM.human(12000000), "3 h 20 min", "human"); eq(TM.human(45000), "45 s", "human s");
const L = TM.laps([30000, 62000, 90000, 150000]); eq(L.rows.map(r => r.lap), [30000, 32000, 28000, 60000], "laps"); eq([L.fast, L.slow], [2, 3], "fast/slow"); eq(TM.laps([1000, 3000]).fast, -1, "needs 3 laps");
const now = new Date(2026, 9, 6, 10, 0, 0); eq(new Date(TM.nextAlarm("11:30", now)).getHours(), 11, "later today"); eq(new Date(TM.nextAlarm("09:15", now)).getDate(), 7, "tomorrow"); eq(new Date(TM.nextAlarm("10:00", now)).getDate(), 7, "same minute = tomorrow"); eq(TM.nextAlarm("x", now), null, "bad");

// date countdown
eq(TM.dhms(90061000), { d: 1, h: 1, m: 1, s: 1, past: false }, "dhms"); eq(TM.dhms(-5000), { d: 0, h: 0, m: 0, s: 5, past: true }, "dhms past");
eq(new Date(TM.parseDateTime("2026-12-25", "08:30")).getHours(), 8, "parseDateTime"); eq(new Date(TM.parseDateTime("2026-12-25", "")).getHours(), 0, "no time = midnight"); eq(TM.parseDateTime("2026-02-30", ""), null, "bad date"); eq(TM.parseDateTime("x", ""), null, "junk date");
// pomodoro cycle: 4 rounds -> focus1 short focus2 short focus3 short focus4 long focus1
let ph = { phase: "focus", round: 1 }, seq = []; for (let i = 0; i < 9; i++) { seq.push(ph.phase + ph.round); ph = TM.pomoNext(ph.phase, ph.round, 4); }
eq(seq, ["focus1", "short1", "focus2", "short2", "focus3", "short3", "focus4", "long4", "focus1"], "pomodoro cycle");
// interval plan: Tabata-style 10 s prep, 20 work / 10 rest x 3 rounds
const plan = TM.itvPlan({ prep: 10, work: 20, rest: 10, rounds: 3 }); eq(plan.map(p => p.phase + (p.round || "")), ["prep", "work1", "rest1", "work2", "rest2", "work3"], "plan order"); eq(TM.itvTotal(plan), 10000 + 20000 * 3 + 10000 * 2, "plan total");
eq(TM.itvAt(plan, 5000).seg.phase, "prep", "at 5s"); eq(TM.itvAt(plan, 5000).left, 5000, "left"); eq(TM.itvAt(plan, 10000).seg.phase, "work", "at 10s = work"); eq(TM.itvAt(plan, 35000).seg.phase, "rest", "at 35s"); eq(TM.itvAt(plan, TM.itvTotal(plan)).done, true, "done at end"); eq(TM.itvPlan({ work: 30, rest: 0, rounds: 2 }).length, 2, "no rest, no prep");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
