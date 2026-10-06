// node tool_apps_src/weighted-average-tests.js
const WA = require("./weighted-average-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; const ok = typeof b === "number" ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, a, b); } }
let R = WA.compute([{ v: "90", w: "3" }, { v: "80", w: "4" }, { v: "70", w: "2" }, { v: "", w: "" }]);
eq(R.avg, (270 + 320 + 140) / 9, "weighted"); eq(R.simple, 80, "simple"); eq(R.used, 3, "used"); eq(R.sumW, 9, "sumW"); eq(R.rows[0].share, 100 / 3, "share");
eq(WA.compute([{ v: "90", w: "" }]).skipped, 1, "skip half row"); eq(WA.compute([{ v: "90", w: "0" }]).avg, null, "zero weights");
eq(WA.compute([{ v: "50", w: "-1" }]).used, 0, "negative"); eq(WA.compute([]).avg, null, "empty");
eq(WA.num("1,5"), 1.5, "decimal comma"); eq(WA.num("1,500"), 1500, "thousands"); eq(WA.num("85 %"), 85, "percent"); eq(WA.num("x"), null, "bad");
eq(WA.fix(83.333333, 2), "83.33", "fix"); eq(WA.fix(80, 2, true), "80", "trim"); eq(WA.fix(80.5, 2, true), "80.5", "trim2");
const rows = [{ n: "Math ✓", v: "91", w: "4" }, { n: "", v: "", w: "" }]; const d = WA.decode(WA.encode(rows, "Fall")); eq(d.title, "Fall", "title"); eq(d.rows[0], { n: "Math ✓", v: "91", w: "4" }, "row"); eq(d.rows.length, 5, "padded"); eq(WA.decode("junk"), null, "bad");
eq(WA.fromLists("90,80", "3,4,2").length, 5, "lists min 5"); eq(WA.fromLists("90,80", "3,4,2")[2], { n: "", v: "", w: "2" }, "lists pad");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
