// node tool_apps_src/protein-intake-calculator-tests.js
const PI = require("./protein-intake-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(PI.num("80,5"), 80.5, "comma"); eq(PI.lbToKg(176.37), 80, "lb", 0.01);
const a = PI.need(80, "rda"); eq(a.t, 64, "RDA 0.8 g/kg x 80 = 64 g"); eq(a.hi, 80, "RDA high"); const m = PI.need(80, "muscle"); eq(m.lo, 128, "muscle low 1.6"); eq(m.t, 144, "muscle target 1.8"); eq(m.hi, 176, "muscle high 2.2");
eq(PI.need(10, "rda"), null, "silly weight"); eq(PI.need(80, "zzz").perKg, 1.4, "unknown goal falls back to active");
PI.GOALS.forEach(g => { eq(g.lo <= g.t && g.t <= g.hi, true, "ordered " + g.id); eq(g.hi <= 2.5, true, "sane high " + g.id); });
eq(PI.mealsNeeded(144, 80), 5, "144 g / 32 g per meal = 5"); eq(PI.mealsNeeded(60, 80), 3, "min 3"); eq(PI.mealsNeeded(400, 80), 6, "max 6"); eq(PI.perMeal(150, 3), 50, "per meal"); eq(PI.perMeal(150, 0), 150, "min one meal");
eq(PI.percentCal(100, 2000), 20, "20% of calories"); eq(PI.percentCal(100, 0), null, "no calories");
eq(PI.servingsFor(31, PI.FOODS[0]), 1, "31 g = one 100 g chicken breast"); eq(PI.dayTotal({ 0: 2, 4: 3 }), { protein: 62 + 18, kcal: 330 + 216 }, "day total"); eq(PI.dayTotal({}), { protein: 0, kcal: 0 }, "empty day"); eq(PI.dayTotal({ 999: 3 }).protein, 0, "unknown food ignored");
PI.FOODS.forEach(fd => eq(fd[2] > 0 && fd[3] > 0 && fd[3] >= fd[2] * 4 * 0.5, true, "food sane: " + fd[0]));
eq(PI.FOODS.length, 32, "32 foods"); eq(PI.foodDiet(PI.FOODS[0]), "o", "chicken is neither"); eq(PI.foodDiet(PI.FOODS[4]), "v", "egg vegetarian"); eq(PI.foodDiet(PI.FOODS[11]), "vg", "tofu vegan"); eq(PI.foodDiet(PI.FOODS[10]), "v", "whey is vegetarian, not vegan"); eq(PI.foodDiet(PI.FOODS.filter(x => x[0] === "Pea protein powder")[0]), "vg", "pea protein vegan");
eq(PI.foodIdx("all").length, 32, "all foods"); const vg = PI.foodIdx("vegan"), ve = PI.foodIdx("veg"); eq(vg.every(i => PI.foodDiet(PI.FOODS[i]) === "vg"), true, "vegan list is plants only"); eq(ve.every(i => PI.foodDiet(PI.FOODS[i]) !== "o"), true, "vegetarian list has no meat or fish"); eq(vg.length < ve.length && ve.length < 32, true, "nested lists");
eq(vg.some(i => /milk$|whey|\begg\b|yogurt|cheese|Salmon|Chicken/i.test(PI.FOODS[i][0].split(",")[0]) && !/Soy milk/.test(PI.FOODS[i][0])), false, "no animal products in the vegan list"); eq(PI.dietLabel(PI.FOODS[0]), "", "no label for omnivore foods"); eq(PI.dietLabel(PI.FOODS[11]), "Vegan", "label");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
