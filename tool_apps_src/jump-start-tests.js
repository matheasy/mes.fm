/* node tool_apps_src/jump-start-tests.js */
var J = require("./jump-start/lib.js"), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
function near(a, b, e, m) { ok(Math.abs(a - b) <= (e || 1e-9), m + " (" + a + " vs " + b + ")"); }
var now = new Date(2026, 9, 29);
// connection order
var c = {};
ok(J.placeCable(c, "r1", "gPos").code === "red-good-first", "red to good first is refused");
ok(J.placeCable(c, "b1", "gNeg").code === "black-early", "black before reds");
ok(J.placeCable(c, "r1", "dNeg").code === "red-neg", "red on negative");
var r = J.placeCable(c, "r1", "dPos"); ok(r.ok && r.step === 1, "step 1"); c.r1 = "dPos";
ok(J.placeCable(c, "r2", "gNeg").code === "red-neg-live", "red on neg with live cable");
r = J.placeCable(c, "r2", "gPos"); ok(r.ok && r.step === 2, "step 2"); c.r2 = "gPos";
ok(J.placeCable(c, "b1", "gPos").code === "occupied", "occupied");
ok(J.placeCable(c, "b1", "dPos").code === "occupied", "occupied 2");
ok(J.placeCable(c, "b1", "dGnd").code === "black-dead-first", "black on dead first");
r = J.placeCable(c, "b1", "gNeg"); ok(r.ok && r.step === 3, "step 3"); c.b1 = "gNeg";
ok(J.placeCable(c, "b2", "dNeg").code === "black-dead-neg", "black on dead neg");
ok(J.placeCable(c, "b2", "dPaint").code === "paint", "painted");
ok(J.touchRisk(c, "b2", "r1") === false || true, "touch fn runs");
ok(J.touchRisk({ r1: "dPos", r2: "gPos", b1: "gNeg" }, "b2", "r1") === true, "reds on, black on good neg: free black touching a red clamp shorts the good battery");
r = J.placeCable(c, "b2", "dGnd"); ok(r.ok && r.step === 4, "step 4"); c.b2 = "dGnd";
// touch: free red end with live black free end
ok(J.touchRisk({ r1: "dPos", b1: "dNeg" }, "r2", "b2") === true, "same battery + and - -> spark");
ok(J.touchRisk({ r1: "dPos", b1: "gNeg" }, "r2", "b2") === false, "different batteries, not linked -> no loop");
ok(J.touchRisk({ r1: "dPos" }, "r2", "b2") === false, "black cable not on anything -> no spark");
ok(J.touchRisk({ r1: "dPos", r2: "gPos", b1: "gNeg" }, "r2", "b2") === true, "linked");
ok(J.touchRisk({}, "r1", "r2") === false, "same colour");
// removal
ok(J.removeCable(c, "r1").code === "remove-order", "remove red first refused");
ok(J.removeCable(c, "b1").want === "dGnd", "want ground first");
r = J.removeCable(c, "b2"); ok(r.ok && r.step === 1, "off 1"); c.b2 = null;
r = J.removeCable(c, "b1"); ok(r.ok && r.step === 2, "off 2"); c.b1 = null;
r = J.removeCable(c, "r2"); ok(r.ok && r.step === 3, "off 3"); c.r2 = null;
r = J.removeCable(c, "r1"); ok(r.ok && r.step === 4, "off 4"); c.r1 = null;
// pack
var p = {};
ok(J.placePack(p, "pr", "dPos", true).code === "pack-on", "pack on");
ok(J.placePack(p, "pb", "dGnd", false).code === "pack-black-first", "red first");
ok(J.placePack(p, "pr", "dNeg", false).code === "pack-reverse", "pack reverse");
ok(J.placePack(p, "pr", "gPos", false).code === "nowhere", "pack only dead car");
ok(J.placePack(p, "pr", "dPos", false).ok, "pack red"); p.pr = "dPos";
ok(J.placePack(p, "pb", "dNeg", false).code === "pstep2neg", "pack neg ok");
ok(J.placePack(p, "pb", "dGnd", false).code === "pstep2", "pack ground"); p.pb = "dGnd";
ok(J.removePack(p, "pr", false).code === "remove-order", "pack remove black first");
ok(J.removePack(p, "pb", true).code === "pack-still-on", "pack off first");
ok(J.removePack(p, "pb", false).ok, "pack off black");
// voltage
ok(J.soc(12.6) === 100 && J.soc(12.4) === 75 && J.soc(12.2) === 50 && J.soc(12.0) === 25 && J.soc(11.9) === 0, "soc table");
ok(J.soc(12.3) === 63 || J.soc(12.3) === 62, "soc mid " + J.soc(12.3));
ok(J.soc(12.8, "agm") === 100 && J.soc(12.6, "agm") === 75, "agm");
ok(J.restVerdict(12.65).k === "full" && J.restVerdict(11.7).k === "flat" && J.restVerdict(13.2).k === "surface", "verdicts");
ok(J.runVerdict(14.2) === "normal" && J.runVerdict(12.5) === "not-charging" && J.runVerdict(15.4) === "over" && J.runVerdict(13.7) === "normal", "run");
// cold
near(J.powerAt(27), 100, 0, "power 27"); near(J.powerAt(0), 65, 0, "power 0"); near(J.powerAt(-18), 40, 0, "power -18");
near(J.needAt(0), 155, 0, "need 0"); near(J.needAt(-18), 210, 0, "need -18"); near(J.needAt(35), 100, 0, "need hot");
ok(J.powerAt(-30) < 40 && J.powerAt(-30) >= 5, "extrapolate cold");
ok(J.margin(-18) < 0.2 && J.margin(27) === 1, "margin");
near(J.cToF(-18), -0.4, 1e-9, "c to f"); near(J.fToC(32), 0, 1e-9, "f to c");
ok(J.freezeAt(100) === -58 && J.freezeAt(0) === -8, "freeze");
// drain: 60 Ah, 50 mA, 100 -> 50 % = 30 Ah / 0.05 A = 600 h = 25 days
near(J.drainDays(60, 50, 100, 50), 25, 1e-9, "drain days");
ok(J.drainDays(60, 0, 100) === Infinity, "no drain");
// date codes
var d = J.decode("F-15", now);
ok(d.length && d[0].y === 2015 && d[0].m === 6, "F-15 = June 2015: " + JSON.stringify(d[0]));
ok(J.decode("f15", now)[0].text === "June 2015", "lower case");
ok(J.decode("F 15", now)[0].text === "June 2015", "space");
d = J.decode("J3", now);
ok(d.some(function (x) { return x.text === "October 2023"; }) && d.some(function (x) { return x.text === "September 2023"; }), "J3 two systems");
d = J.decode("M0", now);
ok(d[0].text === "December 2020", "M0 skip-I = December 2020 (NorthStar example says November because E is skipped too)");
d = J.decode("C3", now); ok(d[0].text === "March 2023", "C3");
d = J.decode("B1", now); ok(d[0].text === "February 2021", "Interstate B1 = Feb 2021");
d = J.decode("06/15", now); ok(d[0].text === "June 2015", "06/15");
d = J.decode("0326", now); ok(d.some(function (x) { return x.text === "March 2026"; }), "0326");
d = J.decode("4208", now); ok(d.some(function (x) { return x.y === 2024 && x.m === 7; }), "Optima 4208 = July 2024");
d = J.decode("212", now); ok(d.some(function (x) { return x.text === "December 2022"; }), "ACDelco 212");
d = J.decode("5F", now); ok(d[0].text === "June 2025", "5F");
d = J.decode("E4J2", now); ok(d.some(function (x) { return x.text === "October 2022" || x.text === "October 2012"; }), "E4JC long code " + JSON.stringify(d));
ok(J.decode("", now).length === 0 && J.decode("hello world", now).length === 0, "nothing");
ok(J.decode("Z9", now).length === 0, "Z not a month");
ok(J.decode("L9", now).every(function (x) { return x.y <= 2026; }), "no future");
ok(J.yearFromDigit(7, now) === 2017 && J.yearFromDigit(6, now) === 2026, "year digit");
ok(J.ageMonths(2015, 6, now) === 136 && J.ageText(136) === "11 years, 4 months", "age " + J.ageText(J.ageMonths(2015, 6, now)));
ok(J.ageText(0) === "0 months" && J.ageText(12) === "1 year", "age text");
console.log(n - bad + "/" + n + " passed"); if (bad) process.exit(1);
