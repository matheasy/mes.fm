// node tool_apps_src/bmr-calculator-tests.js
const BR = require("./bmr-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(BR.num("65,8"), 65.8, "decimal comma"); eq(BR.num("1,200"), 1200, "thousands"); eq(BR.num("x"), null, "bad"); eq(BR.num("-3"), null, "negative");
eq(BR.ftInToCm(5, 10), 177.8, "5'10"); eq(BR.cmToFtIn(182.88), { ft: 6, inch: 0 }, "6ft"); eq(BR.lbToKg(154.3235835), 70, "lb", 1e-6);
// Mifflin-St Jeor: male 30 y, 80 kg, 180 cm = 800 + 1125 - 150 + 5 = 1780; female 30 y, 60 kg, 165 cm = 600 + 1031.25 - 150 - 161 = 1320.25
const m = { sex: "m", kg: 80, cm: 180, age: 30 }, w = { sex: "f", kg: 60, cm: 165, age: 30 };
eq(BR.bmr("mifflin", m), 1780, "mifflin male"); eq(BR.bmr("mifflin", w), 1320.25, "mifflin female");
// Revised Harris-Benedict, male: 88.362 + 13.397*80 + 4.799*180 - 5.677*30 = 88.362 + 1071.76 + 863.82 - 170.31 = 1853.632
eq(BR.bmr("harris", m), 1853.632, "harris male", 1e-3);
// female: 447.593 + 9.247*60 + 3.098*165 - 4.330*30 = 447.593 + 554.82 + 511.17 - 129.9 = 1383.683
eq(BR.bmr("harris", w), 1383.683, "harris female", 1e-3);
// Katch-McArdle: 80 kg at 20% fat -> LBM 64 -> 370 + 21.6*64 = 1752.4; Cunningham 500 + 22*64 = 1908
eq(BR.bmr("katch", Object.assign({ bf: 20 }, m)), 1752.4, "katch"); eq(BR.bmr("cunningham", Object.assign({ bf: 20 }, m)), 1908, "cunningham");
eq(BR.bmr("katch", m), null, "katch needs body fat"); eq(BR.bmr("katch", Object.assign({ bf: 80 }, m)), null, "silly body fat");
eq(BR.bmr("mifflin", { sex: "m", kg: 80, cm: 180, age: 5 }), null, "child age rejected"); eq(BR.bmr("mifflin", { sex: "x", kg: 80, cm: 180, age: 30 }), null, "sex required"); eq(BR.bmr("mifflin", { sex: "m", kg: 0, cm: 180, age: 30 }), null, "zero weight");
eq(BR.kcalToKj(1780), 7447.52, "kJ", 1e-6);
eq(BR.tdee(1780, "sed"), 2136, "tdee sedentary"); eq(BR.tdee(1780, "mod"), 2759, "tdee moderate"); eq(BR.tdee(1780, "nope"), 2136, "unknown activity falls back"); eq(BR.tdee(null, "sed"), null, "tdee null");
eq(BR.kcalForRate(0.5), 550, "0.5 kg/week = 550 kcal/day");
const g = BR.goalRows(2759, m, 1780); eq(g.length, 6, "goal rows"); eq(g[0].kcal, 2759 - 1100, "lose 1 kg/week"); eq(g[3].kcal, 2759, "maintain"); eq(g[5].kcal, 2759 + 550, "gain 0.5 kg/week", 1e-6);
eq(BR.goalRows(1700, w, 1320)[0].low, true, "women under 1,200 or BMR flagged"); eq(BR.goalRows(2759, m, 1780)[1].low, false, "ok deficit not flagged");
eq(BR.floor("f", 1320), 1320, "floor never under BMR"); eq(BR.floor("f", 1000), 1200, "women floor"); eq(BR.floor("m", 1000), 1500, "men floor");
eq(BR.weeksTo(80, 75, -0.5), 10, "10 weeks"); eq(BR.weeksTo(80, 75, 0.5), null, "wrong direction"); eq(BR.weeksTo(80, 80, 0), 0, "already there");
eq(BR.qs({ kg: 80, cm: 180, age: 30, sex: "m", act: "mod", bf: 20, f: "katch" }), "kg=80&cm=180&age=30&sex=m&act=mod&bf=20&f=katch", "query string");
// projection: eating exactly maintenance holds the weight; a deficit loses with a slowing rate; a surplus gains
const pj0 = BR.project(m, 2759, "mod", "mifflin", 20); eq(pj0.length, 21, "weeks+1 points"); eq(pj0[20], 80, "maintenance holds", 0.01);
const pj1 = BR.project(m, 2259, "mod", "mifflin", 52); eq(pj1[0], 80, "starts at weight"); eq(pj1[1] < 80 && pj1[1] > 79.3, true, "first week about -0.65 kg");
eq((pj1[1] - pj1[0]) < (pj1[40] - pj1[39]), true, "loss slows as the body shrinks"); eq(pj1[52] > 62, true, "does not fall without limit");
eq(BR.project(m, 3259, "mod", "mifflin", 10)[10] > 80, true, "surplus gains");
eq(BR.project(Object.assign({ bf: 20 }, m), 2000, "mod", "katch", 4).length, 5, "lean-mass projection");
eq(BR.weekReached([80, 79, 78, 77], 78), 2, "reached"); eq(BR.weekReached([80, 79], 70), null, "not reached"); eq(BR.weekReached([70, 71, 72], 72), 2, "gain reached");
const ba = BR.bmrByAge("mifflin", m, 20, 60); eq(ba.length, 41, "ages"); eq(ba[0][1] - ba[40][1], 200, "-5 kcal per year of age", 1e-9);
eq(BR.ORGANS.reduce((a, x) => a + x[1], 0), 100, "organ shares sum to 100");
const es = BR.energySplit(1780, 2759); eq(es.rest + es.food + es.move, 2759, "split adds up", 1e-9); eq(BR.energySplit(1000, 1000).move, 0, "no negative movement");
eq(BR.qs({ kg: 80, cm: 180, age: 30, sex: "m", act: "mod", intake: 2200 }), "kg=80&cm=180&age=30&sex=m&act=mod&kcal=2200", "intake in link");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
