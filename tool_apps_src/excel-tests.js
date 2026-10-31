// Tests for the MES Spreadsheet Viewer & Editor's pure logic (tool_apps_src/excel/lib.js). Run: node tool_apps_src/excel-tests.js
"use strict";
var X = require("./excel/lib.js");
var pass = 0, fail = 0;
function eq(a, b, msg) {
	var ok = JSON.stringify(a) === JSON.stringify(b);
	if (ok) pass++; else { fail++; console.log("FAIL " + msg + "\n  got:  " + JSON.stringify(a) + "\n  want: " + JSON.stringify(b)); }
}
function near(a, b, msg) { if (typeof a === "number" && Math.abs(a - b) < 1e-9) pass++; else { fail++; console.log("FAIL " + msg + ": got " + a + ", want " + b); } }
function throws(fn, msg) { try { fn(); fail++; console.log("FAIL (no throw) " + msg); } catch (e) { pass++; } }

/* A1 */
eq([X.colName(0), X.colName(25), X.colName(26), X.colName(701), X.colName(702), X.colName(16383)], ["A", "Z", "AA", "ZZ", "AAA", "XFD"], "colName");
eq([X.colIndex("A"), X.colIndex("z"), X.colIndex("AA"), X.colIndex("XFD"), X.colIndex("1")], [0, 25, 26, 16383, -1], "colIndex");
for (var i = 0; i < 16384; i += 37) if (X.colIndex(X.colName(i)) !== i) { fail++; console.log("FAIL colName round trip " + i); break; }
pass++;
eq(X.parseA1("$B$12"), { r: 11, c: 1, ac: true, ar: true }, "parseA1 absolute");
eq(X.parseA1("c3"), { r: 2, c: 2, ac: false, ar: false }, "parseA1 lower case");
eq([X.parseA1("A0"), X.parseA1("XFE1"), X.parseA1("A1048577"), X.parseA1("hello")], [null, null, null, null], "parseA1 rejects");
eq(X.a1(0, 0), "A1", "a1"); eq(X.a1(4, 27, true, false), "AB$5", "a1 abs row");
eq(X.parseRange("C5:A1"), { s: { r: 0, c: 0 }, e: { r: 4, c: 2 } }, "parseRange normalises");
eq(X.rangeA1(X.parseRange("B2")), "B2", "rangeA1 single");
eq(X.rangeA1(X.parseRange("B2:D9")), "B2:D9", "rangeA1");

/* CSV */
eq(X.parseDelimited('a,b,c\r\n1,"two, 2","say ""hi"""\n'), [["a", "b", "c"], ["1", "two, 2", 'say "hi"']], "csv quotes, CRLF, trailing newline");
eq(X.parseDelimited('x,"multi\nline",z'), [["x", "multi\nline", "z"]], "csv newline in quotes");
eq(X.parseDelimited("a;b;c\n1;2;3"), [["a", "b", "c"], ["1", "2", "3"]], "semicolon detected");
eq(X.parseDelimited("a\tb\n1\t2"), [["a", "b"], ["1", "2"]], "tab detected");
eq(X.parseDelimited("a,,c\n,\n"), [["a", "", "c"], ["", ""]], "empty fields");
eq(X.parseDelimited("﻿h1,h2\n1,2"), [["h1", "h2"], ["1", "2"]], "BOM dropped");
eq(X.detectDelimiter('"x;y",1,2\n"z",3,4'), ",", "delimiter inside quotes ignored");
eq(X.toDelimited([["a", "b,c", 'q"'], ["1", "", "line\nbreak"]]), 'a,"b,c","q"""\r\n1,,"line\nbreak"', "toDelimited");
var round = [["x", "y, z", '"', ""], ["1", "2\n3", " lead", "end"]];
eq(X.parseDelimited(X.toDelimited(round)), round, "csv round trip");
eq(X.parseDelimited(X.toDelimited(round, "\t", "\n"), "\t"), round, "tsv round trip");

/* input */
eq(X.parseInput("42"), { t: "n", v: 42 }, "input number");
eq(X.parseInput("-1,234.50"), { t: "n", v: -1234.5 }, "input thousands");
eq(X.parseInput("$12"), { t: "n", v: 12 }, "input currency");
eq(X.parseInput("15%"), { t: "n", v: 0.15, z: "0%" }, "input percent");
eq(X.parseInput("(5)"), { t: "n", v: -5 }, "input accounting negative");
eq(X.parseInput("1e3"), { t: "n", v: 1000 }, "input exponent");
eq(X.parseInput("true"), { t: "b", v: true }, "input boolean");
eq(X.parseInput("=A1+1"), { f: "A1+1" }, "input formula");
eq(X.parseInput("'007"), { t: "s", v: "007" }, "input apostrophe text");
eq(X.parseInput("1,2,3"), { t: "s", v: "1,2,3" }, "input not a number");
eq(X.parseInput(""), { t: "z" }, "input empty");
eq(X.parseInput("2026-10-30"), { t: "n", v: 46325, z: "yyyy-mm-dd" }, "input ISO date = Excel serial");
eq(X.parseInput("2026-02-30"), { t: "s", v: "2026-02-30" }, "input impossible date stays text");
eq(X.parseInput("="), { t: "s", v: "=" }, "input lone equals");

/* formulas */
var cells = { A1: 2, A2: 3, A3: "x", A4: true, A5: null, B1: 10, B2: "5", C1: "Hello", D1: X.err("#DIV/0!") };
function get(sheet, r, c) { if (sheet === "Other") return r === 0 && c === 0 ? 100 : null; var k = X.colName(c) + (r + 1); return k in cells ? cells[k] : null; }
function f(s) { var v = X.calc(s, get, "Sheet1"); return X.isErr(v) ? v.code : v; }
eq(f("1+2*3"), 7, "precedence");
eq(f("(1+2)*3"), 9, "brackets");
eq(f("-2^2"), 4, "negation before power (Excel)");
eq(f("2^3^2"), 64, "power left to right (Excel)");
eq(f("50%*4"), 2, "percent");
eq(f("A1*B1"), 20, "refs");
eq(f("$A$1+A$2"), 5, "absolute refs");
eq(f("B2+1"), 6, "numeric text converts");
eq(f("A3+1"), "#VALUE!", "text in arithmetic");
eq(f("A5+1"), 1, "blank is 0");
eq(f("A4+1"), 2, "TRUE is 1");
eq(f("1/0"), "#DIV/0!", "divide by zero");
eq(f("D1+1"), "#DIV/0!", "error propagates");
eq(f("SUM(A1:A5)"), 5, "SUM range skips text, booleans, blanks");
eq(f("SUM(A1:A5, 4, TRUE)"), 10, "SUM direct booleans count");
eq(f("SUM(A1,\"x\")"), "#VALUE!", "SUM direct text is #VALUE!");
eq(f("SUM(A1:D1)"), "#DIV/0!", "SUM range with an error");
eq(f("AVERAGE(A1:A3)"), 2.5, "AVERAGE");
eq(f("AVERAGE(A3:A5)"), "#DIV/0!", "AVERAGE nothing");
eq(f("MIN(A1:B2)"), 2, "MIN"); eq(f("MAX(A1:B2)"), 10, "MAX"); eq(f("MAX(A3)"), 0, "MAX of no numbers");
eq(f("COUNT(A1:B2)"), 3, "COUNT"); eq(f("COUNTA(A1:A5)"), 4, "COUNTA"); eq(f("COUNT(1,\"2\",\"a\")"), 2, "COUNT direct");
eq(f("ROUND(2.5,0)"), 3, "ROUND half away"); eq(f("ROUND(-2.5,0)"), -3, "ROUND negative half away");
eq(f("ROUND(1.005,2)"), 1.01, "ROUND 1.005 (float trap)"); eq(f("ROUND(1234.5,-2)"), 1200, "ROUND negative digits");
eq(f("ROUNDUP(1.21,1)"), 1.3, "ROUNDUP"); eq(f("ROUNDDOWN(-1.29,1)"), -1.2, "ROUNDDOWN");
eq(f("IF(A1>1,\"big\",\"small\")"), "big", "IF true");
eq(f("IF(A1>5,\"big\")"), false, "IF missing else");
eq(f("IF(A1>1,,1)"), 0, "IF empty then is 0");
eq(f("IF(A1>5,1/0,7)"), 7, "IF is lazy");
eq(f("IF(\"x\",1,2)"), "#VALUE!", "IF text condition");
eq(f("ABS(-3)"), 3, "ABS"); eq(f("SQRT(16)"), 4, "SQRT"); eq(f("SQRT(-1)"), "#NUM!", "SQRT negative");
eq(f("\"a\"&\"b\"&1&TRUE"), "ab1TRUE", "concatenation");
eq(f("C1&\" \"&A1*1.5"), "Hello 3", "concat after arithmetic");
eq(f("A1=2"), true, "equal"); eq(f("C1=\"hello\""), true, "text compare ignores case");
eq(f("\"a\"<1"), false, "text sorts after numbers"); eq(f("A5=0"), true, "blank equals 0"); eq(f("A5=\"\""), true, "blank equals empty text");
eq(f("1<>2"), true, "not equal");
eq(f("Other!A1+1"), 101, "sheet ref"); eq(f("'Other'!A1*2"), 200, "quoted sheet ref");
eq(f("SUM(A:A)"), 5, "whole column");
eq(f("IFERROR(1/0,\"none\")"), "none", "IFERROR");
eq(f("AND(A1>1,TRUE)"), true, "AND"); eq(f("OR(A1>5,FALSE)"), false, "OR"); eq(f("NOT(A4)"), false, "NOT");
eq(f("LEN(C1)&UPPER(\"x\")&LOWER(\"Y\")"), "5Xy", "text functions");
eq(f("MOD(-3,2)"), 1, "MOD sign like Excel"); eq(f("INT(-1.5)"), -2, "INT floors");
eq(f("0.1+0.2"), 0.30000000000000004, "float kept exactly");
eq(X.fmtGeneral(0.1 + 0.2), "0.3", "general format trims float noise");
eq(X.fmtGeneral(1234567), "1234567", "general integer");
eq(X.fmtGeneral(1e12), "1E+12", "general big");
throws(function () { X.parse("1+"); }, "incomplete formula");
throws(function () { X.parse("SUM(1,2"); }, "unclosed bracket");
throws(function () { X.parse("\"abc"); }, "unclosed text");
try { X.calc("VLOOKUP(1,A1:B2,2)", get); fail++; console.log("FAIL unknown function should throw"); } catch (e) { eq(e instanceof X.Unknown && e.name, "VLOOKUP", "unknown function reported"); }
eq(X.unknownFunctions(X.parse("SUM(A1)+XLOOKUP(1,A:A,B:B)+MyName")), ["XLOOKUP", "MyName"], "unknownFunctions");
eq(X.refsOf(X.parse("SUM(A1:B2)+Other!C3")).map(function (r) { return [r.sheet, X.rangeA1(r.g)]; }), [[null, "A1:B2"], ["Other", "C3"]], "refsOf");
eq(X.FUNCTIONS.indexOf("SUM") >= 0 && X.FUNCTIONS.indexOf("IF") >= 0, true, "FUNCTIONS list");

/* adjust references on insert / delete */
function adj(fm, axis, at, n, sheet, here) { return X.adjust(fm, { axis: axis, at: at, n: n, sheet: sheet || "S", here: here || "S" }); }
eq(adj("A1+A5", "r", 2, 1), "A1+A6", "insert row shifts below");
eq(adj("SUM(A1:A5)", "r", 2, 2), "SUM(A1:A7)", "insert inside range grows it");
eq(adj("SUM(A1:A5)", "r", 0, 1), "SUM(A2:A6)", "insert above range moves it");
eq(adj("$B$3*2", "c", 1, 1), "$C$3*2", "insert column keeps $");
eq(adj("A1+A3", "r", 2, -1), "A1+#REF!", "deleted reference becomes #REF!");
eq(adj("SUM(A1:A5)", "r", 1, -2), "SUM(A1:A3)", "delete inside range shrinks it");
eq(adj("SUM(A2:A3)", "r", 1, -2), "SUM(#REF!)", "delete whole range");
eq(adj("SUM(A:A)", "r", 1, 3), "SUM(A:A)", "whole column unchanged by row insert");
eq(adj("SUM(B:C)", "c", 0, 1), "SUM(C:D)", "whole column shifts on column insert");
eq(adj("Other!A5+A5", "r", 0, 1), "Other!A5+A6", "other sheet's refs untouched");
eq(adj("Other!A5+A5", "r", 0, 1, "Other", "S"), "Other!A6+A5", "refs into the changed sheet from another sheet");
eq(adj("\"A5\"&A5", "r", 0, 1), "\"A5\"&A6", "text that looks like a ref is left alone");
eq(adj("  A1 + 1", "r", 5, 1), "  A1 + 1", "unchanged formula returned as is");
eq(X.renameSheetRefs("Data!A1+'Data'!B2+A1", "Data", "My data"), "'My data'!A1+'My data'!B2+A1", "rename sheet refs");

/* Calc: dependency recalculation */
function book() {
	return { sheets: [
		{ name: "S1", data: [[{ t: "n", v: 1 }, { t: "n", v: 2 }, { t: "n", v: 3, f: "A1+B1" }], [{ t: "n", v: 6, f: "SUM(A1:C1)" }, { t: "n", v: 12, f: "A2*2" }, { t: "n", v: 99, f: "VLOOKUP(1,A1:B1,2)" }]] },
		{ name: "S2", data: [[{ t: "n", v: 7, f: "S1!B2+1" }]] }
	] };
}
var bk = book(), cc = new X.Calc(bk);
eq(cc.count, 5, "Calc indexed formulas");
bk.sheets[0].data[0][0] = { t: "n", v: 10 };
var res = cc.recalc([{ si: 0, r: 0, c: 0 }]);
eq([bk.sheets[0].data[0][2].v, bk.sheets[0].data[1][0].v, bk.sheets[0].data[1][1].v, bk.sheets[1].data[0][0].v], [12, 24, 48, 49], "chain recalculated in order across sheets");
eq(bk.sheets[0].data[1][2].v, 99, "unknown function keeps cached value");
eq(res.stale.map(function (s) { return s.unknown[0]; }), ["VLOOKUP"], "stale reported");
eq(bk.sheets[0].data[0][2].f, "A1+B1", "formula kept");
// new formula + cycle
bk.sheets[0].data[0][0] = { t: "n", v: 0, f: "C1" }; cc.add(0, 0, 0, "C1");
res = cc.recalc([{ si: 0, r: 0, c: 0 }]);
eq(res.cycles > 0, true, "cycle detected");
// big chain stays fast
var big = { sheets: [{ name: "B", data: [] }] };
for (var r2 = 0; r2 < 20000; r2++) big.sheets[0].data.push([r2 ? { t: "n", v: r2, f: "A" + r2 + "+1" } : { t: "n", v: 0 }]);
var t0 = Date.now(), cb = new X.Calc(big);
big.sheets[0].data[0][0] = { t: "n", v: 5 };
cb.recalc([{ si: 0, r: 0, c: 0 }]);
eq(big.sheets[0].data[19999][0].v, 20004, "20k chain");
eq(Date.now() - t0 < 4000, true, "20k chain under 4 s (" + (Date.now() - t0) + " ms)");
// range dependency (large range -> range list)
var rb = { sheets: [{ name: "R", data: [] }] };
for (var r3 = 0; r3 < 200; r3++) rb.sheets[0].data.push([{ t: "n", v: 1 }]);
rb.sheets[0].data[0][1] = { t: "n", v: 200, f: "SUM(A1:A200)" };
var cr = new X.Calc(rb); rb.sheets[0].data[150][0] = { t: "n", v: 51 };
cr.recalc([{ si: 0, r: 150, c: 0 }]);
eq(rb.sheets[0].data[0][1].v, 250, "large range dependency");
cr.remove(0, 0, 1); eq(cr.dependents(0, 150, 0).length, 0, "remove drops dependency");
eq(X.resultCell(X.err("#DIV/0!"), { f: "1/0" }), { f: "1/0", t: "e", v: 7, w: "#DIV/0!" }, "error result cell");
eq(X.cellValue({ t: "e", v: 42 }).code, "#N/A", "cellValue error");

/* view */
var data = [["Name", "Qty"], ["pear", 3], ["Apple", 10], ["fig", null], ["apple 2", 2], ["kiwi", "n/a"]];
function vr(o) { o.nrows = data.length; o.value = function (r, c) { return data[r][c]; }; o.text = function (r, c) { var v = data[r][c]; return v == null ? "" : String(v); }; return X.viewRows(o); }
eq(vr({ header: true, sort: { c: 0, dir: 1 } }), [0, 2, 4, 3, 5, 1], "sort text A-Z, case-insensitive, numeric aware");
eq(vr({ header: true, sort: { c: 1, dir: -1 } }), [0, 5, 2, 1, 4, 3], "sort numbers Z-A: text after numbers flips, blanks last");
eq(vr({ header: true, sort: { c: 1, dir: 1 } }), [0, 4, 1, 2, 5, 3], "numbers first, then text, blanks last");
eq(vr({ header: true, filters: [{ c: 0, op: "contains", v: "APP" }] }), [0, 2, 4], "filter contains");
eq(vr({ header: false, filters: [{ c: 1, op: "gt", v: "2" }] }), [1, 2], "filter > number");
eq(vr({ header: true, filters: [{ c: 1, op: "blank" }] }), [0, 3], "filter blank");
eq(vr({ header: true, filters: [{ c: 1, op: "eq", v: "10" }, { c: 0, op: "begins", v: "a" }] }), [0, 2], "two filters");
eq(vr({ header: true }), null, "no view");
eq(X.cmpValues(2, "a") < 0 && X.cmpValues("a", true) < 0 && X.cmpValues(null, 1) > 0, true, "cmpValues type order");

/* misc */
eq([X.kindOf("a.xlsx", new Uint8Array([0x50, 0x4b, 3, 4])), X.kindOf("a.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), X.kindOf("x.csv", new Uint8Array([97, 44, 98, 10])), X.kindOf("b.ods", new Uint8Array([0x50, 0x4b, 3, 4]))], ["zip", "xls", "text", "ods"], "kindOf");
eq(X.baseName("Budget 2026.xlsx"), "Budget 2026", "baseName");
eq(X.safeSheetName("a/b:c", ["a b c"]), "a b c (2)", "safeSheetName");
eq(X.fmtBytes(2048), "2.0 KB", "fmtBytes");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
