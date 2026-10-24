// node tool_apps_src/compound-interest-explained-tests.js -- checks the numbers quoted on mes.fm/compound-interest-explained
var C = require("./compound-interest-explained/lib.js"), pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (" + a + " vs " + b + ")"); }
near(C.simple(5000, 0.04, 10), 7000, 1e-9, "simple interest");
near(C.compound(5000, 0.04, 12, 10), 7454.16, 0.005, "example 1 monthly");
near(C.compound(5000, 0.04, 1, 10), 7401.22, 0.005, "example 1 yearly");
near(C.compound(5000, 0.04, 0, 10), 7459.12, 0.005, "example 1 continuous");
near(C.compound(1000, 0.05, 1, 3), 1157.625, 1e-9, "three years at 5%");
var rows = C.periods(1000, 0.05, 1, 3); ok(rows.length === 3 && Math.abs(rows[2].end - 1157.625) < 1e-9 && Math.abs(rows[1].interest - 52.5) < 1e-9, "period stepper");
near(C.eApprox(1), 2, 1e-12, "(1+1/1)^1 = 2"); near(C.eApprox(12), 2.613035290, 1e-8, "n = 12"); near(C.eApprox(1e9), Math.E, 1e-8, "n -> infinity gives e");
ok(C.eApprox(100) < C.eApprox(1000) && C.eApprox(1000) < Math.E, "(1+1/n)^n increases towards e");
near(C.apy(0.05, 365) * 100, 5.1267, 5e-5, "APY 5% daily"); near(C.apy(0.05, 0) * 100, 5.1271, 5e-5, "APY 5% continuous"); near(C.apy(0.12, 12) * 100, 12.6825, 5e-5, "APY 12% monthly");
near(C.apy(0.07, 1), 0.07, 1e-15, "yearly compounding: APY = r");
near(C.fvSeries(200, 0.005, 360, false), 200903.01, 0.005, "example 2 ordinary annuity");
near(C.fvSeries(200, 0.005, 360, true), 201907.52, 0.005, "example 2 deposits at the start");
near(C.fvSeries(100, 0.05 / 12, 240, false), 41103.37, 0.005, "practice 4 end"); near(C.fvSeries(100, 0.05 / 12, 240, true), 41274.63, 0.005, "practice 4 start");
near(C.fvSeries(50, 0, 10, false), 500, 1e-12, "zero rate series");
// the closed form equals adding the deposits up one by one
(function () { var b = 0; for (var k = 0; k < 120; k++) b = b * 1.004 + 75; near(C.fvSeries(75, 0.004, 120, false), b, 1e-6, "series formula = loop"); })();
near(C.timeTo(10000, 25000, 0.07, 1), 13.5428, 5e-5, "example 3 time");
near(C.doubling(0.08, 1), 9.0065, 5e-5, "doubling at 8%"); near(C.doubling(0.09, 1), 8.0432, 5e-5, "practice 3 doubling at 9%");
near(C.doubling(0.05, 0), Math.LN2 / 0.05, 1e-12, "continuous doubling = ln 2 / r");
near(C.rule(72, 8), 9, 1e-12, "rule of 72"); near(C.rule(69.3, 8) + 0.35, 9.0125, 1e-12, "69.3 rule with correction");
// rule of 72 is closer than 69.3 for yearly compounding near 8%
ok(Math.abs(C.rule(72, 8) - C.doubling(0.08, 1)) < Math.abs(C.rule(69.3, 8) - C.doubling(0.08, 1)), "72 beats 69.3 at 8% yearly");
ok(Math.abs(C.rule(69.3, 5) - C.doubling(0.05, 0)) < 0.01, "69.3 is right for continuous compounding");
near(C.realRate(0.06, 0.03) * 100, 2.9126, 5e-5, "real rate"); near(Math.pow(2, 1 / 8) - 1, 0.0905077, 1e-6, "practice 5 rate to double in 8 years");
near(C.compound(2000, 0.03, 0, 15), 3136.62, 0.005, "practice 6 continuous");
near(C.compound(1000, 0.08, 4, 5), 1485.95, 0.005, "practice 1");
console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
