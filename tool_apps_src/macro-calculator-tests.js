// node tool_apps_src/macro-calculator-tests.js
const MC = require("./macro-calculator/lib.js"); const BR = require("./bmr-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
// 2,000 kcal at 25 / 50 / 25 = 125 g protein, 250 g carbs, 55.56 g fat
const g = MC.grams(2000, 25, 50, 25); eq(g.p, 125, "protein g"); eq(g.c, 250, "carbs g"); eq(g.f, 2000 * 0.25 / 9, "fat g"); eq(MC.kcalOf(g), 2000, "grams add back to calories", 1e-9);
eq(MC.grams(2000, 1, 2, 1).p, 125, "ratios normalise"); eq(MC.grams(2000, 0, 0, 0).p, 125, "empty falls back");
eq(MC.target(2759, -0.5), 2209, "target = tdee - 550"); eq(MC.target(2759, 0), 2759, "maintain");
const pm = MC.perMeal(g, 4); eq(pm.p, 31.25, "per meal"); eq(pm.kcal, 500, "meal kcal"); eq(MC.perMeal(g, 0).kcal, 2000, "min one meal");
eq(MC.fibre(2000), 28, "fibre"); eq(MC.proteinCheck(60, 80, -0.5).key, "low", "0.75 g/kg low"); eq(MC.proteinCheck(100, 80, -0.5).key, "under", "1.25 g/kg while cutting is under"); eq(MC.proteinCheck(100, 80, 0).key, "good", "1.25 g/kg maintaining is fine");
eq(MC.proteinCheck(160, 80, -0.5).key, "good", "2 g/kg"); eq(MC.proteinCheck(230, 80, 0).key, "high", "2.9 g/kg"); eq(MC.proteinCheck(300, 80, 0).key, "veryhigh", "3.75 g/kg");
const pc = MC.pctOf(g); eq(pc.p, 25, "pct p"); eq(pc.c, 50, "pct c"); eq(pc.f, 25, "pct f", 1e-9);
eq(MC.custom(30, 30), { p: 30, f: 30, c: 40 }, "custom"); eq(MC.custom(70, 60).c >= 0, true, "carbs never negative"); eq(MC.custom(3, 3), { p: 5, f: 5, c: 90 }, "clamped low");
MC.PRESETS.forEach(p => eq(p.p + p.c + p.f, 100, "preset " + p.id + " sums to 100")); eq(MC.goal("-0.5").rate, -0.5, "goal lookup"); eq(MC.goal("zzz").rate, 0, "goal fallback"); eq(MC.preset("nope").id, "balanced", "preset fallback");
// end to end with the BMR maths: 30 y man, 80 kg, 180 cm, moderately active, lose 0.5 kg/week
const b = BR.bmr("mifflin", { sex: "m", kg: 80, cm: 180, age: 30 }), t = BR.tdee(b, "mod"), kc = MC.target(t, -0.5); eq(Math.round(kc), 2209, "end to end calories");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
