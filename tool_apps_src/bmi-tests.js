// node tool_apps_src/bmi-tests.js
const BM = require("./bmicalculator/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; const ok = typeof b === "number" ? Math.abs(a - b) < 1e-6 : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b)); } }
eq(BM.num("65,8"), 65.8, "decimal comma"); eq(BM.num("1,200"), 1200, "thousands"); eq(BM.num("x"), null, "bad"); eq(BM.num("-3"), null, "negative");
// conversions
eq(BM.lbToKg(145.1), 145.1 * 0.45359237, "lb->kg"); eq(BM.ftInToCm(6, 0), 182.88, "6ft"); eq(BM.cmToFtIn(182.88), { ft: 6, inch: 0 }, "cm->ft"); eq(BM.cmToFtIn(182.8).ft, 5, "5ft11.9"); eq(Math.round(BM.cmToFtIn(182.8).inch * 100) / 100, 11.97, "inches");
eq(BM.cmToFtIn(182.879), { ft: 6, inch: 0 }, "carry 12 in");
// the old calculator: 145.1 lb at 6 ft 0 in -> 703.06957964 * 145.1 / 72^2 = 19.68
eq(Math.round(BM.bmi(BM.lbToKg(145.1), BM.ftInToCm(6, 0)) * 10) / 10, 19.7, "old example");
eq(BM.bmi(65.8, 182.9), 65.8 / (1.829 * 1.829), "metric"); eq(BM.bmi(0, 180), null, "zero weight"); eq(BM.bmi(70, 0), null, "zero height");
// categories (rounded to 1 decimal first)
eq(BM.category(18.4, "who").name, "Mild thinness", "mild"); eq(BM.category(18.45, "who").name, "Normal weight", "18.45 rounds to 18.5"); eq(BM.category(24.9, "who").group, "normal", "24.9"); eq(BM.category(24.95, "who").group, "over", "24.95 -> 25.0");
eq(BM.category(29.9, "who").group, "over", "29.9"); eq(BM.category(30, "who").name, "Obese (class I)", "30"); eq(BM.category(41, "who").name, "Obese (class III)", "41"); eq(BM.category(15, "who").name, "Severe thinness", "15");
eq(BM.category(23.0, "asia").group, "over", "asia 23"); eq(BM.category(22.9, "asia").group, "normal", "asia 22.9"); eq(BM.category(27.5, "asia").group, "obese", "asia 27.5");
// healthy range at 180 cm: 18.5 -> 59.94 kg, 24.9 -> 80.68 kg
const R = BM.healthyRange(180, "who"); eq(R.lo, 18.5 * 1.8 * 1.8, "lo"); eq(R.hi, 24.9 * 1.8 * 1.8, "hi"); eq(BM.healthyRange(180, "asia").hiBmi, 22.9, "asia hi");
// gain / lose (as the old text: gain between (18.5 h^2 - w) and (24.9 h^2 - w); lose between (w - 24.9 h^2) and (w - 18.5 h^2))
let g = BM.toNormal(50, 180, "who"); eq(g.dir, "gain", "gain"); eq(g.min, 18.5 * 3.24 - 50, "gain min"); eq(g.max, 24.9 * 3.24 - 50, "gain max");
let l = BM.toNormal(95, 180, "who"); eq(l.dir, "lose", "lose"); eq(l.min, 95 - 24.9 * 3.24, "lose min"); eq(l.max, 95 - 18.5 * 3.24, "lose max"); eq(BM.toNormal(70, 180, "who").dir, "none", "none");
eq(BM.prime(25, "who"), 1, "prime"); eq(BM.ponderal(70, 175), 70 / Math.pow(1.75, 3), "ponderal");
// entries + share
eq(BM.cleanEntry({ d: "2026-10-01", kg: "70.123", cm: "175", n: "x" }), { d: "2026-10-01", kg: 70.12, cm: 175, n: "x" }, "clean"); eq(BM.cleanEntry({ d: "bad", kg: 70, cm: 175 }), null, "bad date"); eq(BM.cleanEntry({ d: "2026-10-01", kg: 5000, cm: 175 }), null, "bad kg");
eq(BM.sortEntries([{ d: "2026-02-01" }, { d: "2025-12-31" }]).map(e => e.d), ["2025-12-31", "2026-02-01"], "sort");
const st = { kg: "70.5", cm: "175", scale: "asia", history: [{ d: "2026-10-02", kg: 70, cm: 175, n: "after trip ✓" }, { d: "2026-09-01", kg: 72, cm: 175, n: "" }] };
const d = BM.decode(BM.encode(st)); eq(d.kg, "70.5", "kg"); eq(d.scale, "asia", "scale"); eq(d.history.length, 2, "hist"); eq(d.history[0].d, "2026-09-01", "sorted in link"); eq(d.history[1].n, "after trip ✓", "unicode"); eq(BM.decode("junk"), null, "bad");
eq(BM.fromOldShare({ weight: 65.8, height: 182.9 }), { kg: "65.8", cm: "182.9" }, "old"); eq(BM.fromOldShare({}), null, "old empty"); eq(BM.fromOldShare('{"weight":70,"height":175}').kg, "70", "old string");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
