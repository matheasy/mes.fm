// node tool_apps_src/calories-burned-calculator-tests.js
const CB = require("./calories-burned-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(CB.num("70,5"), 70.5, "comma"); eq(CB.lbToKg(154.3236), 70, "lb", 1e-3);
// running at 6 mph (MET 9.8) for 30 min at 70 kg = 9.8 x 70 x 0.5 = 343
eq(CB.kcal(9.8, 70, 30), 343, "run 30 min"); eq(CB.kcal(9.8, 70, 30, true), 8.8 * 70 * 0.5, "net"); eq(CB.perHour(3.5, 80), 280, "walking 3 mph 80 kg"); eq(CB.kcal(0.5, 70, 60, true), 0, "net never negative");
eq(CB.minutesFor(300, 8, 75), 300 / 600 * 60, "minutes to burn 300 at MET 8, 75 kg = 30"); eq(CB.minutesFor(300, 0, 75, true), null, "no burn");
eq(CB.intensity(2.8), "light", "light"); eq(CB.intensity(3), "moderate", "moderate edge"); eq(CB.intensity(5.9), "moderate", "5.9"); eq(CB.intensity(6), "vigorous", "vigorous edge");
eq(CB.guidelineMin(8, 30), 60, "vigorous counts double"); eq(CB.guidelineMin(4, 30), 30, "moderate"); eq(CB.guidelineMin(1.3, 60), 0, "light = 0");
eq(CB.fatGrams(7700), 1000, "7700 kcal = 1 kg fat"); eq(CB.valid(5), false, "silly weight");
eq(CB.byId("run-6")[1].indexOf("6 mph") > 0, true, "lookup"); eq(CB.byId("nope"), null, "unknown");
const ids = CB.ACTIVITIES.map(a => a[0]); eq(new Set(ids).size, ids.length, "unique ids"); CB.ACTIVITIES.forEach(a => { eq(a[2] >= 0.9 && a[2] <= 16, true, "MET range " + a[0]); eq(CB.CATS.some(c => c[0] === a[3]), true, "category " + a[0]); });
eq(CB.search("run").every(a => /run/i.test(a[1])), true, "search"); eq(CB.search("", "cycle").every(a => a[3] === "cycle"), true, "category filter"); eq(CB.search("yoga mind").length, 0, "words are ANDed against the name only"); eq(CB.search("yoga power")[0][0], "yoga-p", "two words");
eq(CB.ACTIVITIES.length >= 80, true, "80+ activities"); eq(CB.byId("run-8")[2] > CB.byId("run-6")[2], true, "faster is higher"); eq(CB.byId("hiit")[2] >= 8, true, "hiit");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
