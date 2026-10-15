// node tool_apps_src/ideal-weight-calculator-tests.js
const IW = require("./ideal-weight-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(IW.num("5,5"), 5.5, "comma"); eq(IW.ftInToCm(5, 10), 177.8, "5'10");
// exactly 5 ft (152.4 cm): Devine 50 / 45.5, Robinson 52 / 49, Miller 56.2 / 53.1, Hamwi 48 / 45.4
eq(IW.value("devine", "m", 152.4), 50, "devine m 5ft"); eq(IW.value("devine", "f", 152.4), 45.5, "devine f 5ft"); eq(IW.value("robinson", "m", 152.4), 52, "robinson m"); eq(IW.value("robinson", "f", 152.4), 49, "robinson f"); eq(IW.value("miller", "m", 152.4), 56.2, "miller m"); eq(IW.value("miller", "f", 152.4), 53.1, "miller f"); eq(IW.value("hamwi", "m", 152.4), 48, "hamwi m"); eq(IW.value("hamwi", "f", 152.4), 45.4, "hamwi f");
// 180 cm = 70.866 in = 10.866 over: devine 74.99, robinson 72.65, miller 71.52, hamwi 77.34
const o = 180 / 2.54 - 60; eq(IW.value("devine", "m", 180), 50 + 2.3 * o, "devine 180"); eq(IW.value("hamwi", "m", 180), 48 + 2.7 * o, "hamwi 180", 1e-9); eq(Math.round(IW.value("devine", "m", 180) * 10) / 10, 75, "devine ~75 kg");
eq(IW.value("devine", "x", 180), null, "sex required"); eq(IW.value("devine", "m", 100), null, "too short"); eq(IW.value("nope", "m", 180), null, "unknown formula");
const r = IW.bmiRange(180); eq(r.lo, 18.5 * 3.24, "bmi lo"); eq(r.hi, 24.9 * 3.24, "bmi hi");
const sp = IW.span("m", 180); eq(sp.lo, IW.value("miller", "m", 180), "lowest is Miller"); eq(sp.hi, IW.value("hamwi", "m", 180), "highest is Hamwi");
eq(IW.mean("m", 180), (IW.value("devine", "m", 180) + IW.value("robinson", "m", 180) + IW.value("miller", "m", 180) + IW.value("hamwi", "m", 180)) / 4, "mean");
eq(IW.bmi(81, 180), 25, "bmi", 1e-9);
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
