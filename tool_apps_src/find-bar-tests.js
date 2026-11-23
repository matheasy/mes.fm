/* node tool_apps_src/find-bar-tests.js -- pure parts of mes.fm/main_js/find-bar.js (MESFind), shared by /pdf, /docx and /text */
"use strict";
const F = require("../mes.fm/main_js/find-bar.js");
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + " -> " + JSON.stringify(a) + " vs " + JSON.stringify(b)); }
eq(F.find("Cat cat CAT", "cat"), [[0, 3], [4, 7], [8, 11]], "case-insensitive");
eq(F.find("Cat cat CAT", "cat", { caseSensitive: true }), [[4, 7]], "match case");
eq(F.find("Café cafe", "cafe"), [[0, 4], [5, 9]], "accents ignored");
eq(F.find("Café cafe", "cafe", { caseSensitive: true }), [[5, 9]], "accents kept with match case");
eq(F.find("the theme then", "the", { wholeWord: true }), [[0, 3]], "whole word");
eq(F.find("a.b a-b", "a.b"), [[0, 3]], "regex characters escaped");
eq(F.find("one   two\nthree two", "one two"), [[0, 9]], "space matches any run");
eq(F.find("one\ntwo", "one two", { nl: false }), [], "nl:false keeps to one line");
eq(F.find("aaaa", "aa"), [[0, 2], [2, 4]], "no overlaps");
eq(F.find("x", "  "), [], "blank query");
eq(F.find("abc".repeat(100), "b", { max: 5 }).length, 5, "max");
eq(F.find("İstanbul istanbul", "istanbul").length >= 1, true, "odd lowercase length does not break");
const sn = F.snippet("The quick brown fox jumps over the lazy dog and runs far away into the woods", 16, 19, 12);
eq(sn.hit, "fox", "snippet hit"); ok(sn.l && sn.r, "snippet cut both sides"); ok(!/^\S*quick/.test("x") && sn.pre.length <= 14, "snippet pre short");
eq(F.snippet("ab\n\ncd", 0, 2).post, " cd", "snippet flattens new lines");
const g = F.groups([{ g: 1, gl: "Page 1" }, { g: 1 }, { g: 3, gl: "Page 3" }]);
eq(g.map(x => [x.label, x.items.length]), [["Page 1", 2], ["Page 3", 1]], "groups");
eq([F.lineOf([0, 5, 9], 0), F.lineOf([0, 5, 9], 4), F.lineOf([0, 5, 9], 5), F.lineOf([0, 5, 9], 100)], [0, 0, 1, 2], "lineOf");
eq([F.parseJump("12", 36), F.parseJump("99", 36), F.parseJump("x"), F.parseJump("0")], [12, 36, null, null], "parseJump");
console.log(bad ? bad + " of " + n + " failed" : "all " + n + " passed"); process.exit(bad ? 1 : 0);
