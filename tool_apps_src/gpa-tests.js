// node tool_apps_src/gpa-tests.js
const GP = require("./gpacalculator/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; const ok = typeof b === "number" ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b)); } }
// parsing
eq(GP.parseGrade("A-", "4").pts, 3.7, "A- 4.0"); eq(GP.parseGrade("a+", "433").pts, 4.33, "A+ 4.33"); eq(GP.parseGrade("A+", "4").pts, 4.0, "A+ 4.0"); eq(GP.parseGrade("b +", "4").pts, 3.3, "B + spaced");
eq(GP.parseGrade("93", "4").pts, 4.0, "93"); eq(GP.parseGrade("92.6", "4").pts, 4.0, "rounds 92.6->93"); eq(GP.parseGrade("92.4", "4").pts, 3.7, "92.4->92"); eq(GP.parseGrade("90", "433").pts, 4.33, "90 on 433");
eq(GP.parseGrade("64", "4").pts, 0, "64 fails"); eq(GP.parseGrade("65", "4").pts, 1.0, "65"); eq(GP.parseGrade("49", "433").pts, 0, "49 on 433"); eq(GP.parseGrade("50", "433").pts, 1.0, "50 on 433");
eq(GP.parseGrade("Z", "4"), null, "Z"); eq(GP.parseGrade("", "4"), null, "empty"); eq(GP.parseGrade("150", "4"), null, "150"); eq(GP.parseGrade("F-", "4").label, "F", "F-");
// term GPA: A (3 cr) + B (4 cr) + 85% (3 cr, 3.0 on 4.0) = (12 + 12 + 9) / 10
let T = GP.term([{ g: "A", c: "3" }, { g: "B", c: "4" }, { g: "85", c: "3" }, { g: "", c: "" }], "4", false);
eq(T.gpa, 3.3, "term gpa"); eq(T.credits, 10, "credits"); eq(T.used, 3, "used");
eq(GP.term([{ g: "A" }], "4", false).credits, 1, "blank credits = 1"); eq(GP.term([{ g: "Q", c: "3" }], "4", false).skipped, 1, "skipped bad grade"); eq(GP.term([{ g: "A", c: "-2" }], "4", false).skipped, 1, "negative credits");
// weighting: honors +0.5, AP +1.0, but not on an F
T = GP.term([{ g: "A", c: "1", l: "a" }, { g: "B", c: "1", l: "h" }, { g: "F", c: "1", l: "a" }], "4", true); eq(T.gpa, (5 + 3.5 + 0) / 3, "weighted");
eq(GP.term([{ g: "A", c: "1", l: "a" }], "4", false).gpa, 4, "unweighted ignores level");
// overall with prior + 2 terms
let ws = GP.blankWs(); ws.prior = { gpa: "3.5", credits: "30" }; ws.terms = [{ name: "a", courses: [{ g: "A", c: "3" }] }, { name: "b", courses: [{ g: "C", c: "3" }] }];
let O = GP.overall(ws); eq(O.credits, 36, "overall credits"); eq(O.gpa, (3.5 * 30 + 12 + 6) / 36, "overall gpa");
// planner: prior 3.5 x 30 credits, want 3.6 over 15 more -> (3.6*45 - 105)/15 = 3.8
ws = GP.blankWs(); ws.prior = { gpa: "3.5", credits: "30" }; O = GP.overall(ws); let P = GP.planNeeded(O, "4", "3.6", "15"); eq(P.need, 3.8, "plan need"); eq(P.status, "ok", "plan ok");
eq(GP.planNeeded(O, "4", "3.9", "5").status, "impossible", "plan impossible"); eq(GP.planNeeded(O, "4", "2.0", "15").status, "secure", "plan secure"); eq(GP.planNeeded(O, "4", "", "15"), null, "plan blank");
// letterFor
eq(GP.letterFor(3.5, "4"), "B+", "3.5 -> B+"); eq(GP.letterFor(4.0, "4"), "A", "4.0 -> A"); eq(GP.letterFor(4.2, "433"), "A", "4.2 on 433 -> A"); eq(GP.letterFor(4.33, "433"), "A+", "4.33 -> A+"); eq(GP.letterFor(0, "4"), "F", "0 -> F"); eq(GP.letterFor(3.7, "4"), "A-", "3.7");
// share round trip
ws = GP.blankWs(); ws.scale = "433"; ws.weighted = true; ws.prior = { gpa: "3.2", credits: "45" }; ws.terms = [GP.blankTerm("Fall ✓"), GP.blankTerm("Spring")]; ws.terms[0].courses[0] = { n: "Calc", g: "A-", c: "4", l: "a" }; ws.cur = 1; ws.plan = { target: "3.5", credits: "15" };
let d = GP.decode(GP.encode(ws)); eq(d.scale, "433", "scale"); eq(d.weighted, true, "weighted"); eq(d.prior, { gpa: "3.2", credits: "45" }, "prior"); eq(d.terms.length, 2, "terms"); eq(d.terms[0].name, "Fall ✓", "unicode"); eq(d.terms[0].courses[0], { n: "Calc", g: "A-", c: "4", l: "a" }, "course"); eq(d.cur, 1, "cur"); eq(d.plan, { target: "3.5", credits: "15" }, "plan");
d = GP.decode(GP.encode(ws, true)); eq(d.terms.length, 1, "only current"); eq(d.terms[0].name, "Spring", "only name"); eq(GP.decode("junk"), null, "bad");
// old shares
let o = GP.fromOldShare({ type: "percentage", scale: "4", grades: [["93", "3"], ["85", "4"]] }); eq(o.terms[0].courses[0], { n: "", g: "93", c: "3", l: "r" }, "old pct"); eq(GP.term(o.terms[0].courses, "4", false).used, 2, "old computes");
o = GP.fromOldShare({ type: "letter", scale: "4", grades: [["3.70", "3"], ["4.00", "4"], ["0.00", "2"]] }); eq(o.terms[0].courses.slice(0, 3).map(c => c.g), ["A-", "A", "F"], "old letters 4.0");
o = GP.fromOldShare({ type: "letter", scale: "433", grades: [["4.33", "3"], ["3.67", "3"]] }); eq(o.scale, "433", "old scale"); eq(o.terms[0].courses.slice(0, 2).map(c => c.g), ["A+", "A-"], "old letters 4.33");
eq(GP.fromOldShare({}), null, "old empty");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
