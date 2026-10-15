// node tool_apps_src/body-surface-area-calculator-tests.js
const BS = require("./body-surface-area-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(BS.num("1,75"), 1.75, "comma"); eq(BS.cmToFtIn(177.8), { ft: 5, inch: 10 }, "ftin");
// Mosteller: 180 cm, 80 kg -> sqrt(180 x 80 / 3600) = sqrt(4) = 2.0 exactly
eq(BS.bsa("mosteller", 180, 80), 2, "Mosteller 180/80 = 2.0"); eq(BS.bsa("mosteller", 170, 70), Math.sqrt(170 * 70 / 3600), "Mosteller 170/70");
// well-known reference values: 170 cm, 70 kg is about 1.81 (Mosteller), 1.81 (Du Bois), 1.81 (Haycock)
["mosteller", "dubois", "haycock", "gehan", "boyd", "fujimoto", "takahira", "shuter"].forEach(id => { const v = BS.bsa(id, 170, 70); eq(v > 1.70 && v < 1.90, true, id + " 170/70 in 1.70-1.90 (" + (v ? v.toFixed(3) : v) + ")"); });
eq(Math.abs(BS.bsa("dubois", 170, 70) - 1.81) < 0.02, true, "Du Bois 1.81"); eq(Math.abs(BS.bsa("haycock", 170, 70) - 1.81) < 0.03, true, "Haycock 1.81");
// Schlich splits by sex: a woman 165 cm 60 kg and a man 180 cm 80 kg
eq(BS.bsa("schlich", 165, 60, "f") > 1.55 && BS.bsa("schlich", 165, 60, "f") < 1.75, true, "Schlich f"); eq(BS.bsa("schlich", 180, 80, "m") > 1.9 && BS.bsa("schlich", 180, 80, "m") < 2.1, true, "Schlich m"); eq(BS.bsa("schlich", 170, 70, "f") !== BS.bsa("schlich", 170, 70, "m"), true, "sex matters for Schlich"); eq(BS.bsa("mosteller", 170, 70, "f"), BS.bsa("mosteller", 170, 70, "m"), "Mosteller ignores sex");
// Costeff: weight only = (4w + 7)/(w + 90); 10 kg child = 47/100 = 0.47
eq(BS.bsa("costeff", 100, 10), 0.47, "Costeff 10 kg"); eq(BS.bsa("costeff", 50, 10), 0.47, "Costeff ignores height");
// a newborn / child: 50 cm, 3.5 kg Mosteller sqrt(50 x 3.5 / 3600) = 0.22; Haycock about 0.22
eq(BS.bsa("mosteller", 50, 3.5), Math.sqrt(50 * 3.5 / 3600), "newborn"); eq(Math.abs(BS.bsa("haycock", 50, 3.5) - 0.22) < 0.03, true, "Haycock newborn");
eq(BS.bsa("mosteller", 10, 70), null, "silly height"); eq(BS.bsa("mosteller", 170, 1), null, "silly weight"); eq(BS.bsa("zzz", 170, 70), null, "unknown"); eq(BS.valid(170, 70), true, "valid");
eq(Object.keys(BS.all(170, 70, "m")).length, 10, "ten formulas"); eq(BS.mean(180, 80, "m") > 1.9 && BS.mean(180, 80, "m") < 2.1, true, "mean");
eq(BS.dose(75, 1.8), 135, "75 mg/m2 x 1.8"); eq(BS.dose(75, 2.2, 2.0), 150, "capped at 2.0"); eq(BS.dose(75, 1.8, 2.0), 135, "below the cap"); eq(BS.indexed(5, 2), 2.5, "cardiac index"); eq(BS.indexed(5, 0), null, "zero area");
eq(BS.deindexGfr(90, 1.73), 90, "gfr at 1.73"); eq(BS.deindexGfr(90, 2.0), 90 * 2 / 1.73, "gfr bigger person"); eq(BS.indexGfr(BS.deindexGfr(75, 1.9), 1.9), 75, "gfr round trip", 1e-9); eq(BS.pediatricDose(100, 0.865), 50, "child at half adult BSA");
eq(BS.category(0.8), "child-sized", "cat child"); eq(BS.category(1.7), "average", "cat average"); eq(BS.category(2.0), "larger than average", "cat larger"); eq(BS.category(2.3), "large", "cat large");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
