// node tool_apps_src/body-fat-calculator-tests.js
const BF = require("./body-fat-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(BF.num("65,8"), 65.8, "comma"); eq(BF.num("x"), null, "bad"); eq(BF.inToCm(10), 25.4, "in"); eq(BF.cmToFtIn(177.8), { ft: 5, inch: 10 }, "5'10");
// Navy male: 180 cm, neck 38, waist 90 -> 495 / (1.0324 - 0.19077*log10(52) + 0.15456*log10(180)) - 450
const nm = 495 / (1.0324 - 0.19077 * Math.log10(52) + 0.15456 * Math.log10(180)) - 450; eq(BF.navy("m", 180, 38, 90), nm, "navy male"); eq(nm > 15 && nm < 20, true, "navy male plausible (" + nm.toFixed(2) + ")");
const nf = 495 / (1.29579 - 0.35004 * Math.log10(75 + 100 - 33) + 0.22100 * Math.log10(165)) - 450; eq(BF.navy("f", 165, 33, 75, 100), nf, "navy female"); eq(nf > 20 && nf < 35, true, "navy female plausible (" + nf.toFixed(2) + ")");
eq(BF.navy("m", 180, 40, 38), null, "waist under neck"); eq(BF.navy("f", 165, 33, 75, 0), null, "female needs hip"); eq(BF.navy("m", 0, 38, 90), null, "no height");
// Deurenberg: 80 kg, 180 cm, 30 y male: BMI 24.69 -> 1.2*24.69 + 6.9 - 10.8 - 5.4 = 20.22
eq(BF.fromBmi("m", 80, 180, 30), 1.2 * (80 / 3.24) + 0.23 * 30 - 10.8 - 5.4, "deurenberg male"); eq(BF.fromBmi("f", 60, 165, 30), 1.2 * (60 / (1.65 * 1.65)) + 6.9 - 5.4, "deurenberg female"); eq(BF.fromBmi("m", 80, 180, 10), null, "child");
eq(BF.category("m", 5).name, "Essential fat", "m 5"); eq(BF.category("m", 6).name, "Athletes", "m 6 edge"); eq(BF.category("m", 24.9).name, "Average", "m 24.9"); eq(BF.category("m", 25).name, "Obese", "m 25"); eq(BF.category("f", 20.5).name, "Athletes", "f 20.5"); eq(BF.category("f", 31.9).name, "Average", "f 31.9"); eq(BF.category("f", 40).key, "obese", "f 40"); eq(BF.category("f", 5).key, "low", "f 5");
const ms = BF.masses(80, 20); eq(ms.fat, 16, "fat mass"); eq(ms.lean, 64, "lean mass"); eq(BF.weightAt(80, 20, 10), 64 / 0.9, "weight at 10%"); eq(BF.weightAt(80, 20, 20), 80, "same %");
eq(BF.ffmi(80, 180, 20), 64 / 3.24, "ffmi"); eq(BF.fmi(80, 180, 20), 16 / 3.24, "fmi"); eq(BF.mean([10, null, 20]), 15, "mean"); eq(BF.mean([null]), null, "mean none");
eq(BF.whtr(90, 180), 0.5, "whtr"); eq(BF.whr(90, 100), 0.9, "whr");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
