// node tool_apps_src/latex-ocr-tests.js -- pure helpers of mes.fm/latex/js/latex-ocr.js (Picture to LaTeX)
"use strict";
var L = require("../mes.fm/latex/js/latex-ocr.js"), n = 0, bad = 0;
function eq(got, want, what) { n++; if (got !== want) { bad++; console.log("FAIL " + what + "\n  got:  " + JSON.stringify(got) + "\n  want: " + JSON.stringify(want)); } }

// raw model outputs recorded in the browser (Pix2Text MFR 1.5, 2026-10-25) -> tidy
eq(L.tidy("x = \\frac { - b \\pm \\sqrt { b ^ { 2 } \\: - \\: 4 a c } } { 2 a }"), "x = \\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", "quadratic");
eq(L.tidy("\\int _ { 0 } ^ { 1 } x ^ { 2 } \\, d x"), "\\int_0^1x^2\\,dx", "integral");
eq(L.tidy("\\left( \\begin{matrix} { a } & { b } \\\\ { c } & { d } \\\\ \\end{matrix} \\right)"), "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", "matrix -> pmatrix");
eq(L.tidy("e ^ { i \\pi } + 1 = 0"), "e^{i\\pi}+1 = 0", "euler");
eq(L.tidy("\\begin{aligned} { \\sum _ { n = 1 } ^ { \\infty } \\frac { 1 } { n ^ { 2 } } } & { { } = \\frac { \\pi ^ { 2 } } { 6 } } \\\\ \\end{aligned}"), "\\sum_{n = 1}^\\infty\\frac{1}{n^2} = \\frac{\\pi^2}{6}", "one-row aligned unwrapped");
eq(L.tidy("\\underset { x \\to 0 } { \\operatorname* { l i m } } \\, \\frac { \\sin x } { x } = 1"), "\\lim_{x \\to 0}\\,\\frac{\\sin x}{x} = 1", "underset lim -> \\lim_");
eq(L.tidy("f ( x ) = \\left\\{ \\begin{aligned} & { } x ^ { 2 } & & { } x \\geq 0 \\\\ & { } - x & & { } x < 0 \\\\ \\end{aligned} \\right."), "f(x) = \\begin{cases} x^2 & x\\geq0 \\\\ -x & x<0 \\end{cases}", "piecewise -> cases");
eq(L.tidy("\\cfrac { 1 } { 3 }"), "\\frac{1}{3}", "cfrac -> frac");
eq(L.tidy("\\sum _ { k = 1 } ^ { n } { k } = \\frac { n ( n + 1 ) } { 2 }"), "\\sum_{k = 1}^nk = \\frac{n(n+1)}{2}", "stray group after exponent");
eq(L.tidy("x ^ { \\pi } { a }"), "x^\\pi a", "stray group after a command exponent keeps a space");
// command + letter keeps its space; ^{\pi} unwrapped only when safe
eq(L.collapseSpaces("\\pm b"), "\\pm b", "space after command before letter");
eq(L.collapseSpaces("\\pm 4"), "\\pm4", "no space before digit");
eq(L.tidy("x ^ { \\pi } a"), "x^\\pi a", "^\\pi before a letter keeps a space");
eq(L.tidy("\\mathrm { s i n } x"), "\\sin x", "mathrm{sin} -> \\sin");
eq(L.tidy("\\left[ \\begin{matrix} 1 & 2 \\end{matrix} \\right]"), "\\begin{bmatrix} 1 & 2 \\end{bmatrix}", "bmatrix");
eq(L.tidy("\\left( \\begin{matrix} 1 \\end{matrix} \\right]"), "\\left(\\begin{matrix} 1 \\end{matrix}\\right]", "mismatched delimiters untouched");
eq(L.tidy("\\begin{aligned} a & = b \\\\ c & = d \\\\ \\end{aligned}"), "\\begin{aligned} a & = b \\\\ c & = d \\end{aligned}", "two-row aligned kept, trailing \\\\ dropped");

// detokenise (byte-level BPE): "\u0120" is a space, plain ASCII maps to itself
eq(L.detok([1, 5, 6, 2], ["<pad>", "<s>", "</s>", "<unk>", "<mask>", "x", "\u0120y"]), "x y", "detok");

// aligned
eq(L.aligned(["x+1 = 2", "x = 1"]), "\\begin{aligned}\nx+1 & = 2 \\\\\nx & = 1\n\\end{aligned}", "aligned at =");
eq(L.aligned(["\\frac{a=b}{2}", "y = 3"]), "\\begin{aligned}\n\\frac{a=b}{2} \\\\\ny = 3\n\\end{aligned}", "no alignment when a line has no top-level =");
eq(L.aligned(["x"]), "x", "one line");

// line bands
function rows(spec) { var r = []; spec.forEach(function (p) { for (var i = 0; i < p[0]; i++) r.push(p[1]); }); return r; }
eq(JSON.stringify(L.lineBands(rows([[5, 0], [30, 50], [25, 0], [30, 50], [5, 0]]), 500)), JSON.stringify([{ y0: 5, y1: 35 }, { y0: 60, y1: 90 }]), "two lines");
// a fraction: numerator, small gap, bar (2 px), small gap, denominator = one band
eq(L.lineBands(rows([[20, 40], [4, 0], [2, 300], [4, 0], [20, 40]]), 500).length, 1, "fraction stays one band");
// another line far below the fraction
eq(L.lineBands(rows([[20, 40], [4, 0], [2, 300], [4, 0], [20, 40], [30, 0], [22, 60]]), 500).length, 2, "fraction + another line");

eq(L.imageLink("https://ex.com/a.png#x"), "https://ex.com/a.png", "imageLink");
eq(L.imageLink("javascript:alert(1)"), null, "imageLink rejects");
eq(L.imageLink("https://u:p@ex.com/a.png"), null, "imageLink rejects userinfo");
console.log((n - bad) + " / " + n + " checks passed");
process.exit(bad ? 1 : 0);
