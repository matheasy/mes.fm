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
try { X.calc("FOOBAR(1,A1:B2,2)", get); fail++; console.log("FAIL unknown function should throw"); } catch (e) { eq(e instanceof X.Unknown && e.name, "FOOBAR", "unknown function reported"); }
eq(X.unknownFunctions(X.parse("SUM(A1)+NOSUCHFN(1,A:A,B:B)+MyName")), ["NOSUCHFN", "MyName"], "unknownFunctions");
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
		{ name: "S1", data: [[{ t: "n", v: 1 }, { t: "n", v: 2 }, { t: "n", v: 3, f: "A1+B1" }], [{ t: "n", v: 6, f: "SUM(A1:C1)" }, { t: "n", v: 12, f: "A2*2" }, { t: "n", v: 99, f: "NOSUCHFN(1,A1:B1,2)" }]] },
		{ name: "S2", data: [[{ t: "n", v: 7, f: "S1!B2+1" }]] }
	] };
}
var bk = book(), cc = new X.Calc(bk);
eq(cc.count, 5, "Calc indexed formulas");
bk.sheets[0].data[0][0] = { t: "n", v: 10 };
var res = cc.recalc([{ si: 0, r: 0, c: 0 }]);
eq([bk.sheets[0].data[0][2].v, bk.sheets[0].data[1][0].v, bk.sheets[0].data[1][1].v, bk.sheets[1].data[0][0].v], [12, 24, 48, 49], "chain recalculated in order across sheets");
eq(bk.sheets[0].data[1][2].v, 99, "unknown function keeps cached value");
eq(res.stale.map(function (s) { return s.unknown[0]; }), ["NOSUCHFN"], "stale reported");
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

/* viewRows: several header rows and hidden rows */
eq(X.viewRows({ nrows: 6, header: 2, sort: null, filters: [], hidden: function (r) { return r === 3; }, value: function () { return 0; }, text: function () { return ""; } }), [0, 1, 2, 4, 5], "viewRows header 2 + hidden row");
eq(X.viewRows({ nrows: 4, header: true, sort: null, filters: [], value: function () { return 0; }, text: function () { return ""; } }), null, "viewRows nothing to do");

/* ---------- ooxml.js (MESXLO): the parts SheetJS CE does not read ---------- */
/* copy / paste / fill / formula entry helpers (edit.js) */
require("./excel/edit.js").install(X);
eq(X.shiftFormula("SUM(A1:B2)+$C$3+D$4+$E5+Sheet2!F6", 1, 1), "SUM(B2:C3)+$C$3+E$4+$E6+Sheet2!G7", "paste shifts relative parts only");
eq(X.shiftFormula("A1", -1, 0), "#REF!", "pushed off the sheet = #REF!");
eq(X.shiftFormula('"A1"&A1', 0, 1), '"A1"&B1', "text in quotes untouched");
eq(["A5", "$A$5", "A$5", "$A5", "A5:C9"].map(X.cycleAbs), ["$A$5", "A$5", "$A5", "A5", "$A$5:$C$9"], "F4 cycles");
eq(X.f4At("=SUM(A1:B2)", 9, 9).text, "=SUM($A$1:$B$2)", "F4 inside a formula");
eq([X.canPoint("=", 1), X.canPoint("=A1", 3), X.canPoint("=SUM(", 5), X.canPoint('="x', 3), X.canPoint("=1+", 3)], [true, false, true, false, true], "where a click inserts a reference");
eq(X.refText({ s: { r: 4, c: 0 }, e: { r: 8, c: 2 } }), "A5:C9", "range text");
eq(X.refText({ s: { r: 0, c: 1 }, e: { r: 0, c: 1 } }, "My Sheet"), "'My Sheet'!B1", "sheet prefix");
eq(X.moveRefs("A1+SUM(B2:B3)+Z9", { sheet: "S", g: { s: { r: 0, c: 0 }, e: { r: 2, c: 2 } } }, 5, 5, "S", "S"), "F6+SUM(G7:G8)+Z9", "cut + paste: references into the block follow it");
eq(X.fillSeries([{ v: 1 }, { v: 2 }], 3, {}).map(function (x) { return x.v; }), [3, 4, 5], "fill series");
eq(X.fillSeries([{ v: "Mon" }], 2, {}).map(function (x) { return x.v; }), ["Tue", "Wed"], "fill weekdays");
eq(adj("A5+SUM(A1:A9)", "r", 2, 1), "A6+SUM(A1:A10)", "insert a row: references follow");
eq(adj("A3", "r", 2, -1), "#REF!", "delete the row a reference points at: #REF!");

var O = require("./excel/ooxml.js"), zlib = require("zlib"), fs = require("fs");
var inflate = function (u) { return new Uint8Array(zlib.inflateRawSync(u)); }, deflate = function (u) { return new Uint8Array(zlib.deflateRawSync(u)); };
var x0 = O.xml('<a:root xmlns:a="x"><a:b val="1"/>t&amp;x<c r:id="rId3"><a:t>hi</a:t></c><!-- no --><![CDATA[<z>]]></a:root>');
eq([x0.n, O.kid(x0, "b").a.val, O.att(O.kid(x0, "c"), "id"), x0.t, O.txt(x0)], ["root", "1", "rId3", "t&x<z>", "hi"], "xml parser: prefixes, entities, CDATA, comments");
eq(O.resolve("xl/worksheets/sheet1.xml", "../drawings/drawing1.xml"), "xl/drawings/drawing1.xml", "resolve relative target");
eq(O.resolve("xl/worksheets/sheet1.xml", "/xl/tables/table1.xml"), "xl/tables/table1.xml", "resolve absolute target");
eq(O.relsPath("xl/charts/chart1.xml"), "xl/charts/_rels/chart1.xml.rels", "relsPath");
eq([O.tint("4472C4", 0.8), O.tint("4472C4", -0.25), O.tint("000000", 0.5)], ["DAE3F3", "2F5597", "808080"], "Excel tint (accent1 80% lighter, 25% darker)");
eq([O.color({ theme: "4" }), O.color({ rgb: "FF00B050" }), O.color({ indexed: "2" }), O.color({ auto: "1" })], ["4472C4", "00B050", "FF0000", null], "colour: theme, ARGB, indexed, auto");
eq(O.dmlColor(O.xml('<solidFill><schemeClr val="accent1"><lumMod val="75000"/></schemeClr></solidFill>')), "2F5597", "DrawingML scheme colour with lumMod");
eq(O.parseRefs("'My ''Q'' sheet'!$B$2:$B$9"), [{ sheet: "My 'Q' sheet", g: { s: { r: 1, c: 1 }, e: { r: 8, c: 1 } } }], "chart reference with quoted sheet");
eq(O.parseRefs("(Sheet1!$A$1,Sheet1!C3)").length, 2, "multi-area chart reference");
eq(O.shiftFormula('AND($B2>100,C$3<"B2",SUM(A1:A2)>0)', 2, 1), 'AND($B4>100,D$3<"B2",SUM(B3:B4)>0)', "shift a CF formula (absolute parts, strings and functions kept)");
eq(O.sheetViewsXml({ r: 1, c: 2 }, null, true), '<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="C2" sqref="C2"/></sheetView></sheetViews>', "freeze pane XML");
eq(O.sheetViewsXml(null, { showGridLines: false }), '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>', "sheet view without a pane");
var sd = '<worksheet><sheetData><row r="2"><c r="B2" s="3"><v>1</v></c></row><row r="5"/></sheetData></worksheet>';
eq(O.addStubCells(sd, [[1, 0, 4], [1, 3, 5], [3, 1, 6]], { 4: ' hidden="1"' }), '<worksheet><sheetData><row r="2"><c r="A2" s="4"/><c r="B2" s="3"><v>1</v></c><c r="D2" s="5"/></row><row r="4"><c r="B4" s="6"/></row><row r="5" hidden="1"></row></sheetData></worksheet>', "empty formatted cells and hidden rows added in order");

// parsing a sheet: pane, hidden rows, styles, merges, conditional formatting
var sh = O.parseSheet('<worksheet><sheetPr><tabColor rgb="FFFF0000"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="2" ySplit="3" state="frozen"/></sheetView></sheetViews><cols><col min="2" max="3" width="20" hidden="1" style="4"/></cols><sheetData><row r="1" s="2" customFormat="1"><c r="A1" s="5" t="s"><v>0</v></c><c r="B1"><v>2</v></c></row><row r="4" hidden="1"><c r="C4" s="7"/></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B2"/></mergeCells><conditionalFormatting sqref="A1:A9 C1"><cfRule type="cellIs" operator="greaterThan" dxfId="0" priority="1"><formula>5</formula></cfRule></conditionalFormatting><drawing r:id="rId1"/><tableParts count="1"><tablePart r:id="rId2"/></tableParts></worksheet>', { dxfs: [{ fill: { c: "FFC7CE" } }] });
eq([sh.pane, sh.view.showGridLines, sh.tabColor, sh.rowsHidden, sh.rowXf, sh.cells, sh.cols[0].hidden, sh.cols[0].style, sh.merges.length, sh.cf.length, sh.cf[0].ranges.length, sh.drawingRid, sh.tableRids],
	[{ r: 3, c: 2, top: "" }, false, "FF0000", [3], { 0: 2 }, [0, 0, 5, 3, 2, 7], true, 4, 1, 1, 2, "rId1", ["rId2"]], "parseSheet");

// conditional formatting evaluation
var vals = { "0:0": 1, "1:0": 5, "2:0": 9, "3:0": 9 };
var ctx = { value: function (r, c) { return vals[r + ":" + c]; }, text: function (r, c) { var v = vals[r + ":" + c]; return v == null ? "" : String(v); }, isErr: function () { return false; },
	stats: function (rule) { return O.ruleStats(rule, this.value); }, evalF: function (f) { return +f; } };
var G = [{ s: { r: 0, c: 0 }, e: { r: 3, c: 0 } }];
eq(O.cfFor([{ type: "cellIs", op: "greaterThan", formulas: ["4"], dxf: { b: true }, ranges: G }], 1, 0, ctx).look, { b: true }, "cellIs greaterThan hit");
eq(O.cfFor([{ type: "cellIs", op: "greaterThan", formulas: ["4"], dxf: { b: true }, ranges: G }], 0, 0, ctx), null, "cellIs miss");
eq(O.cfFor([{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], colors: ["000000", "FFFFFF"], ranges: G }], 1, 0, ctx).look.fill.c, "808080", "two-colour scale midpoint");
eq(Math.round(O.cfFor([{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: "638EC6", ranges: G }], 1, 0, ctx).bar.pct), 50, "data bar length");
eq(!!O.cfFor([{ type: "duplicateValues", dxf: { b: true }, ranges: G }], 2, 0, ctx), true, "duplicate values");
eq(!!O.cfFor([{ type: "top10", rank: 1, dxf: { b: true }, ranges: G }], 2, 0, ctx) && !O.cfFor([{ type: "top10", rank: 1, dxf: { b: true }, ranges: G }], 1, 0, ctx), true, "top 1");
eq(!!O.cfFor([{ type: "aboveAverage", above: true, dxf: { b: true }, ranges: G }], 2, 0, ctx), true, "above average");

// built-in table styles
var T = { g: O.parseRange("A1:C5"), header: true, totals: false, rowStripes: true, firstCol: false };
var med2 = O.builtinTableStyle("TableStyleMedium2");
eq([O.tableLook(T, 0, 1, med2).fill.c, O.tableLook(T, 0, 1, med2).color, O.tableLook(T, 0, 1, med2).b], ["4472C4", "FFFFFF", true], "Medium2 header row");
eq([O.tableLook(T, 1, 1, med2).fill.c, O.tableLook(T, 2, 1, med2).fill], ["DAE3F3", undefined], "Medium2 banded rows");
eq(O.tableLook(T, 6, 1, med2), null, "outside the table");
["Light", "Medium", "Dark"].forEach(function (k) { var n = k === "Light" ? 21 : k === "Medium" ? 28 : 11; for (var i = 1; i <= n; i++) if (!O.builtinTableStyle("TableStyle" + k + i)) { fail++; console.log("FAIL missing TableStyle" + k + i); return; } pass++; });
eq(O.builtinTableStyle("TableStyleMedium29"), null, "unknown table style");
eq(O.lookCss({ fill: { c: "1F4E78" }, b: true, ha: "center" }, false).css, "background:#1F4E78;color:#FFFFFF;font-weight:700;text-align:center;", "look -> CSS (light text on a dark fill)");
eq(O.lookCss({ color: "000000" }, true).css.indexOf("color:#000000") < 0, true, "dark mode lightens black text without a fill");

// chart drawing
var ch0 = { title: "T", legend: "r", axes: { 1: { id: "1", kind: "cat" }, 2: { id: "2", kind: "val", grid: true } }, plots: [] };
var svg = O.chartSvg(ch0, { title: "T", plots: [{ type: "bar", dir: "col", grouping: "clustered", gap: 150, overlap: 0, axes: ["1", "2"], series: [{ name: "A", values: [1, 2, 3], cats: ["x", "y", "z"], color: "4472C4" }, { name: "B", values: [3, null, 1], cats: ["x", "y", "z"], color: "ED7D31" }] }] }, { w: 400, h: 240 });
eq([(svg.match(/<rect/g) || []).length, /<svg/.test(svg), svg.indexOf(">T<") > 0], [1 + 5 + 2, true, true], "column chart: background + 5 bars + 2 legend swatches");
var pie = O.chartSvg({ legend: null, axes: {} }, { title: null, plots: [{ type: "pie", axes: [], series: [{ name: "P", values: [1, 1, 2], cats: ["a", "b", "c"], ptColors: ["111111", "222222", "333333"], color: "111111" }] }] }, { w: 300, h: 200 });
eq((pie.match(/<path/g) || []).length, 3, "pie slices");
eq(O.nice(0, 207, 5).ticks, [0, 50, 100, 150, 200, 250], "nice axis ticks");

// the whole package + saving it back (graft) with zlib standing in for the browser's (De)CompressionStream
var sample = new Uint8Array(fs.readFileSync(__dirname + "/excel/fixtures/sample.xlsx"));
O.readPackage(sample, inflate).then(function (pkg) {
	var names = pkg.sheets.map(function (s) { return s.name + ":" + s.state; });
	eq(names, ["Sales:visible", "Data2:visible", "Secret:hidden", "VerySecret:veryHidden", "Dark:visible"], "sheets with hidden states");
	var s0 = pkg.sheets[0];
	eq([s0.pane, s0.rowsHidden, s0.tables[0].name, s0.tables[0].style, s0.objects.length, s0.cf.length, s0.merges.length], [{ r: 1, c: 1, top: "B2" }, [4], "SalesTable", "TableStyleMedium2", 3, 3, 1], "Sales sheet: pane, hidden row, table, charts, CF, merge");
	eq(s0.objects.map(function (o) { return o.chart.plots[0].type + (o.chart.plots[0].dir === "col" && o.chart.plots[0].type === "bar" ? "/col" : ""); }), ["bar/col", "line", "pie"], "chart types");
	eq(s0.objects[0].chart.plots[0].series[0].val.f, "'Sales'!$B$2:$B$9", "series value reference");
	eq([s0.objects[0].chart.title, s0.objects[0].chart.axes["100"].title], ["Sales by month", "Units"], "chart and axis titles");
	eq(pkg.sheets[1].objects.map(function (o) { return o.chart.plots[0].type; }), ["scatter", "area"], "Data2 charts");
	eq(pkg.styles.xfs[1].look, { b: true, color: "FFFFFF", sz: 14, fill: { c: "1F4E78" }, ha: "center", vaAlign: "center" }, "cell style look");
	eq(pkg.styles.xfs[2].code, "0.0%", "custom number format");
	eq(pkg.styles.dxfs[0], { color: "9C0006", fill: { c: "FFC7CE" } }, "dxf for conditional formatting");
	// SheetJS-like output: the same file with the drawing / table / CF stripped and styles replaced, then grafted back
	var z = O.unzip(sample), list = [];
	return Promise.all(z.order.map(function (n) { return O.entryBytes(z, n, inflate).then(function (b) { return { name: n, data: b }; }); })).then(function (files) {
		files = files.filter(function (f) { return !/^xl\/(drawings|charts|tables)\/|worksheets\/_rels/.test(f.name); }).map(function (f) {
			if (/worksheets\/sheet\d\.xml$/.test(f.name)) { var t = O.utf8(f.data).replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView workbookViewId="0"/></sheetViews>').replace(/<conditionalFormatting[\s\S]*<\/conditionalFormatting>/, "").replace(/<drawing[^>]*\/>|<tableParts[\s\S]*?<\/tableParts>/g, "").replace(/ s="\d+"/g, ""); return { name: f.name, data: O.enc(t) }; }
			return f;
		});
		return O.zipWrite(files, null);
	}).then(function (stripped) {
		var cells = new Map([["0:5", 1], ["3:5", 2]]);
		var info = { structOk: true, active: 0, extraXfs: [], tableHeaders: { "xl/tables/table1.xml": ["Month", "North (new)", "South", "West"] },
			sheets: pkg.sheets.map(function (s, i) { return { model: s, freeze: s.pane ? { r: s.pane.r, c: s.pane.c } : null, cells: i === 0 ? cells : new Map(), stubs: i === 0 ? [[10, 0, 4]] : [], rowAttrs: i === 0 ? { 4: ' hidden="1"' } : null }; }) };
		return O.graft(stripped, pkg, info, inflate, deflate);
	}).then(function (res) {
		eq([res.report.charts, res.report.tables, res.report.cf, res.report.styles], [5, 3, 3, true], "graft report");
		return O.readPackage(res.bytes, inflate).then(function (p2) {
			var a = p2.sheets[0];
			eq([a.pane, a.rowsHidden, a.tables.length, a.objects.length, a.cf.length, p2.sheets[1].objects.length, p2.sheets[4].pane], [{ r: 1, c: 1, top: "B2" }, [4], 1, 3, 3, 2, { r: 2, c: 1, top: "B3" }], "grafted file keeps panes, hidden rows, tables, charts, CF");
			eq(a.cells.slice(0, 6), [0, 5, 1, 3, 5, 2], "cell style indexes written back");
			eq(a.cells.slice(-3), [10, 0, 4], "empty formatted cell added");
			return O.entryText(O.unzip(res.bytes), "xl/tables/table1.xml", inflate).then(function (t) { eq(/name="North \(new\)"/.test(t), true, "table header names follow the cells"); });
		});
	}).then(function () {
		eq(O.stylesWithXfs('<styleSheet><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>', [{ fmtId: 164, code: "0.000", newFmt: true, xml: '<xf numFmtId="164"/>' }]), '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>', "extra xf with a new number format");
	});
}).catch(function (e) { fail++; console.log("FAIL package tests threw: " + (e && e.stack || e)); }).then(function () {
	console.log(pass + " passed, " + fail + " failed");
	process.exit(fail ? 1 : 0);
});
