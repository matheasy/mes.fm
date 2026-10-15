// node tool_apps_src/waist-to-hip-ratio-calculator-tests.js
const WH = require("./waist-to-hip-ratio-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(WH.num("85,5"), 85.5, "comma"); eq(WH.inToCm(10), 25.4, "in"); eq(WH.cmToFtIn(177.8), { ft: 5, inch: 10 }, "ftin");
eq(WH.whr(80, 100), 0.8, "whr"); eq(WH.whr(0, 100), null, "no waist"); eq(WH.whtr(90, 180), 0.5, "whtr"); eq(WH.whtr(90, 0), null, "no height");
eq(WH.whrBand("m", 0.89).key, "low", "m .89"); eq(WH.whrBand("m", 0.90).key, "mid", "m .90"); eq(WH.whrBand("m", 0.99).key, "mid", "m .99"); eq(WH.whrBand("m", 1.0).key, "high", "m 1.0");
eq(WH.whrBand("f", 0.79).key, "low", "f .79"); eq(WH.whrBand("f", 0.80).key, "mid", "f .80"); eq(WH.whrBand("f", 0.84).key, "mid", "f .84"); eq(WH.whrBand("f", 0.85).key, "high", "f .85"); eq(WH.whrBand("f", 0.804).key, "mid", "rounds to 2 decimals");
eq(WH.whtrBand(0.39).key, "under", "whtr .39"); eq(WH.whtrBand(0.49).key, "low", ".49"); eq(WH.whtrBand(0.50).key, "mid", ".50"); eq(WH.whtrBand(0.60).key, "high", ".60");
eq(WH.waistBand("m", 93.9).key, "low", "waist m 93.9"); eq(WH.waistBand("m", 94).key, "mid", "waist m 94"); eq(WH.waistBand("m", 102).key, "high", "m 102"); eq(WH.waistBand("f", 79).key, "low", "f 79"); eq(WH.waistBand("f", 88).key, "high", "f 88");
eq(WH.shape("f", 0.9), "apple", "apple f"); eq(WH.shape("f", 0.75), "pear", "pear f"); eq(WH.shape("m", 0.97), "apple", "apple m"); eq(WH.waistFor(0.5, 175), 87.5, "waist for 0.5");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
