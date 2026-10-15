// node tool_apps_src/water-intake-calculator-tests.js
const WI = require("./water-intake-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(WI.num("2,5"), 2.5, "comma"); eq(WI.mlToOz(WI.ozToMl(8)), 8, "oz round trip"); eq(WI.ozToMl(8), 236.5882365, "8 oz", 1e-6);
const a = WI.need({ kg: 70, sex: "m", exMin: 0, climate: "temp", status: "none" }); eq(a.total, 2240, "70 kg = 2.24 L"); eq(a.low, 2240 * 0.85, "low"); eq(a.high, 2240 * 1.15, "high");
const b = WI.need({ kg: 70, sex: "m", exMin: 60, climate: "hot", status: "none" }); eq(b.total, 2240 + 720 + 700, "exercise + heat"); eq(b.exercise, 720, "12 ml per minute");
eq(WI.need({ kg: 60, sex: "f", exMin: 0, climate: "temp", status: "bf" }).total, 1920 + 700, "breastfeeding"); eq(WI.need({ kg: 60, sex: "m", exMin: 0, climate: "temp", status: "bf" }).total, 1920, "status ignored for men"); eq(WI.need({ kg: 60, sex: "f", exMin: 0, climate: "temp", status: "preg" }).status, 300, "pregnant");
eq(WI.need({ kg: 5, sex: "m" }), null, "silly weight"); eq(WI.need({ kg: 70, sex: "m", exMin: 9999 }).exercise, 600 * 12, "exercise capped at 10 h"); eq(WI.need({ kg: 70, sex: "m", climate: "zzz" }).climate, 0, "unknown climate");
const s = WI.schedule(2400, 7, 23); eq(s.length, 16, "16 waking hours"); eq(s[0].hour, 7, "first hour"); eq(s[15].hour, 22, "last hour"); eq(s[15].cum, 2400, "adds up to the target"); eq(s[0].ml, 150, "150 ml an hour");
eq(WI.schedule(2000, 22, 6).map(x => x.hour), [22, 23, 0, 1, 2, 3, 4, 5], "wraps midnight"); eq(WI.schedule(2000, 7, 7), [], "no hours");
const log = { "2026-10-12": [500, 500, 1000], "2026-10-13": [2500], "2026-10-14": [800] };
eq(WI.dayTotal(log, "2026-10-12"), 2000, "day total"); eq(WI.dayTotal(log, "2030-01-01"), 0, "empty day");
eq(WI.streak(log, 2000, "2026-10-14"), 2, "streak ignores an unfinished today"); eq(WI.streak(log, 800, "2026-10-14"), 3, "today counts once it is reached"); eq(WI.streak({}, 2000, "2026-10-14"), 0, "no streak");
eq(WI.lastDays("2026-10-14", 3), ["2026-10-12", "2026-10-13", "2026-10-14"], "last days");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
