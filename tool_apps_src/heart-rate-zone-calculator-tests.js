// node tool_apps_src/heart-rate-zone-calculator-tests.js
const HR = require("./heart-rate-zone-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(HR.num("62"), 62, "num"); eq(HR.num("x"), null, "bad");
eq(HR.maxHr("fox", 40), 180, "fox 40"); eq(HR.maxHr("tanaka", 40), 180, "tanaka 40 = 208 - 28"); eq(HR.maxHr("tanaka", 20), 194, "tanaka 20"); eq(HR.maxHr("gellish", 40), 179, "gellish"); eq(HR.maxHr("hunt", 50), 211 - 32, "hunt"); eq(HR.maxHr("inbar", 30), 205.8 - 20.55, "inbar", 1e-9);
eq(HR.maxHr("tanaka", 5), null, "child"); eq(HR.maxHr("nope", 40), null, "unknown");
eq(HR.maxHr("tanaka", 70) > HR.maxHr("fox", 70), true, "tanaka higher than fox for older adults"); eq(HR.maxHr("tanaka", 20) < HR.maxHr("fox", 20), true, "and lower for the young");
const z = HR.zones(180, null); eq(z.length, 5, "five zones"); eq([z[0].bpmLo, z[0].bpmHi], [90, 108], "zone 1 percent of max"); eq([z[4].bpmLo, z[4].bpmHi], [162, 180], "zone 5");
const k = HR.zones(180, 60); eq([k[0].bpmLo, k[0].bpmHi], [120, 132], "zone 1 Karvonen"); eq([k[4].bpmLo, k[4].bpmHi], [168, 180], "zone 5 Karvonen"); eq(HR.zones(180, 200)[0].bpmLo, 90, "bad resting rate falls back");
eq(HR.zoneOf(100, 180, null), 1, "100 bpm zone 1"); eq(HR.zoneOf(120, 180, null), 2, "120 zone 2"); eq(HR.zoneOf(140, 180, null), 3, "140 zone 3"); eq(HR.zoneOf(144, 180, null), 4, "boundary goes to the higher zone"); eq(HR.zoneOf(150, 180, null), 4, "150 zone 4"); eq(HR.zoneOf(175, 180, null), 5, "175 zone 5"); eq(HR.zoneOf(80, 180, null), 0, "under"); eq(HR.zoneOf(190, 180, null), 6, "over max");
eq(HR.percentOfMax(90, 180), 50, "% max"); eq(HR.percentOfReserve(120, 180, 60), 50, "% reserve"); eq(HR.percentOfReserve(120, 180, null), null, "no rest");
eq(HR.fromCount(25, 10), 150, "10 s count"); eq(HR.fromCount(0, 10), null, "no beats"); eq(HR.fromCount(30, 15), 120, "15 s count");
eq(HR.restingBand(55).indexOf("low") === 0, true, "band low"); eq(HR.restingBand(70), "normal", "band normal");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
