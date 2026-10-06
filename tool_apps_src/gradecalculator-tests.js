// node tool_apps_src/gradecalculator-tests.js
const GC = require("./gradecalculator/lib.js");
let fails = 0, n = 0;
function eq(a, b, msg) { n++; const ok = typeof b === "number" ? Math.abs(a - b) < 1e-6 : JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.log("FAIL", msg, "got", a, "want", b); } }

// parsing
eq(GC.num("82.5"), 82.5, "num"); eq(GC.num(" 82,5 % "), 82.5, "decimal comma"); eq(GC.num("1,200"), 1200, "thousands"); eq(GC.num("abc"), null, "bad"); eq(GC.num(""), null, "empty");
eq(GC.gradeOf({ s: "17", o: "20" }), 85, "gradeOf"); eq(GC.gradeOf({ s: "1", o: "0" }), null, "out of 0"); eq(GC.gradeOf({ s: "", o: "20" }), null, "no score");

// known mode: the classic 78% now, final 40%, want 80 -> 83
let c = { mode: "known", target: "80", cur: "78", fw: "40", rows: [] }, R = GC.compute(c);
eq(R.status, "ok", "status"); eq(R.needed, 83, "needed 83"); eq(R.min, 46.8, "min"); eq(R.max, 86.8, "max");
// screenshot case: desired 50, current 78, weight 78 -> 42.10
R = GC.compute({ mode: "known", target: "50", cur: "78", fw: "78" }); eq(R.needed, (50 - 78 * 22 / 100) / 78 * 100, "old formula"); eq(GC.fix(R.needed, 2), "42.10", "42.10");
// impossible / secure / nofinal
eq(GC.compute({ mode: "known", target: "95", cur: "70", fw: "20" }).status, "impossible", "impossible");
eq(GC.compute({ mode: "known", target: "60", cur: "90", fw: "20" }).status, "secure", "secure");
eq(GC.compute({ mode: "known", target: "60", cur: "90", fw: "0" }).status, "nofinal", "nofinal");
eq(GC.compute({ mode: "known", target: "60", cur: "", fw: "20" }).status, "incomplete", "incomplete");
eq(GC.compute({ mode: "known", target: "60", cur: "50", fw: "150" }).status, "incomplete", "weight > 100");
// final worth 100%: needed = target
eq(GC.compute({ mode: "known", target: "72", cur: "10", fw: "100" }).needed, 72, "fw 100");

// items mode
c = { mode: "items", target: "85", rows: [{ n: "q", s: "17", o: "20", w: "10" }, { n: "lab", s: "42", o: "50", w: "15" }, { n: "mid", s: "68", o: "80", w: "25" }, { n: "essay", s: "", o: "", w: "10" }, { s: "", o: "", w: "" }] };
R = GC.compute(c);
eq(R.usedW, 50, "usedW"); eq(R.remaining, 50, "remaining includes the pending essay"); eq(R.pending, 1, "pending");
const cur = (10 * 85 + 15 * 84 + 25 * 85) / 50; eq(R.current, cur, "current"); eq(R.base, (10 * 85 + 15 * 84 + 25 * 85) / 100, "base");
eq(R.needed, (85 - R.base) / 50 * 100, "items needed");
R = GC.compute({ mode: "items", target: "80", rows: [{ s: "50", o: "100", w: "60" }, { s: "50", o: "100", w: "60" }] }); eq(R.status, "over", "over 100");
eq(GC.compute({ mode: "items", target: "80", rows: [{}, {}] }).status, "incomplete", "no rows");

// what-if + neededFor
R = GC.compute({ mode: "known", target: "80", cur: "78", fw: "40" });
eq(GC.courseGrade(R, 83), 80, "what-if"); eq(GC.neededFor(R, 90), 108, "neededFor 90"); eq(GC.letter(90), "A-", "letter"); eq(GC.letter(59.9), "F", "F");

// even weights
c = GC.blankCourse("x"); c.mode = "items"; c.rows[0].s = "1"; c.rows[1].s = "1"; c.rows[2].s = "1";
eq(GC.evenWeights(c, 40), 3, "even count"); eq(c.rows[0].w, "20", "even weight");

// share encode / decode round trip (incl. unicode)
const a = GC.blankCourse("Cálculo ✓"); a.target = "90"; a.mode = "items"; a.rows[0] = { n: "Midterm", s: "40", o: "50", w: "30" };
const b = GC.blankCourse("Bio"); b.cur = "71.5"; b.fw = "35";
const enc = GC.encode([a, b], 1), dec = GC.decode(enc);
eq(dec.courses.length, 2, "decode count"); eq(dec.cur, 1, "decode cur"); eq(dec.courses[0].name, "Cálculo ✓", "unicode"); eq(dec.courses[0].rows[0], { n: "Midterm", s: "40", o: "50", w: "30" }, "row"); eq(dec.courses[1].fw, "35", "fw"); eq(dec.courses[0].mode, "items", "mode");
eq(/^[A-Za-z0-9_-]+$/.test(enc), true, "url safe"); eq(GC.decode("garbage"), null, "bad decode"); eq(GC.decode("1@@@"), null, "bad b64");

// old shares
let o = GC.fromOldShare({ desired: 50, current: 78, weight: 78 }); eq([o.mode, o.target, o.cur, o.fw], ["known", "50", "78", "78"], "old known");
o = GC.fromOldShare({ desired: 70, ass: [["8", "10", "20"], ["", "", ""], ["70", "100", "30"]] }); eq(o.mode, "items", "old items"); eq(o.rows[0], { n: "", s: "8", o: "10", w: "20" }, "old row"); eq(GC.compute(o).status, "ok", "old computes");
eq(GC.fromOldShare("{\"desired\":80,\"current\":70,\"weight\":30}").cur, "70", "old string"); eq(GC.fromOldShare({}), null, "old empty");

console.log(fails ? fails + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(fails ? 1 : 0);
