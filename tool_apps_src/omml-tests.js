/* node tool_apps_src/omml-tests.js -- mes.fm/main_js/omml.js (MESOmml): MathML (as MathJax.tex2mml makes it) -> Word OMML and back.
   The fixtures were made with mathjax-full 3.2.2 (same TeX input as the cdnjs build the pages load). */
"use strict";
const O = require("../mes.fm/main_js/omml.js"), FX = require("./omml-fixtures/tex2mml.json");
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
// element order rules from the OMML schema (the first child names allowed, in order)
const ORDER = { f: ["fPr", "num", "den"], rad: ["radPr", "deg", "e"], sSup: ["sSupPr", "e", "sup"], sSub: ["sSubPr", "e", "sub"], sSubSup: ["sSubSupPr", "e", "sub", "sup"],
	nary: ["naryPr", "sub", "sup", "e"], limLow: ["limLowPr", "e", "lim"], limUpp: ["limUppPr", "e", "lim"], acc: ["accPr", "e"], d: ["dPr", "e"], m: ["mPr", "mr"], eqArr: ["eqArrPr", "e"], borderBox: ["borderBoxPr", "e"], groupChr: ["groupChrPr", "e"], r: ["rPr", "t"] };
const NEED = { f: ["num", "den"], rad: ["deg", "e"], sSup: ["e", "sup"], sSub: ["e", "sub"], sSubSup: ["e", "sub", "sup"], nary: ["sub", "sup", "e"], limLow: ["e", "lim"], limUpp: ["e", "lim"], acc: ["e"], d: ["e"], eqArr: ["e"], m: ["mr"] };
function check(node, path) {
	if (typeof node === "string") return;
	const nm = node.name.replace(/^m:/, ""), kids = node.kids.filter(k => typeof k !== "string").map(k => k.name.replace(/^m:/, ""));
	if (ORDER[nm]) { let last = -1; kids.forEach(k => { const i = ORDER[nm].indexOf(k); ok(i >= 0 && i >= last, path + ": <" + k + "> allowed / in order inside <" + nm + ">"); if (i >= 0) last = i; }); }
	if (NEED[nm]) NEED[nm].forEach(k => ok(kids.indexOf(k) >= 0, path + ": <" + nm + "> has <" + k + ">"));
	if (nm === "rPr") { const ord = ["lit", "nor", "scr", "sty", "brk", "aln"]; let last = -1; kids.forEach(k => { const i = ord.indexOf(k); ok(i >= last, path + ": m:rPr order"); last = i; }); }
	node.kids.forEach(k => check(k, path));
}
FX.forEach(f => {
	const om = O.fromMathML(f.mml, true);
	ok(/^<m:oMathPara><m:oMath>[\s\S]+<\/m:oMath><\/m:oMathPara>$/.test(om), f.tex + ": display wraps in oMathPara");
	const tree = O.parse(om);
	ok(O.text(tree).replace(/\s/g, "").length > 0, f.tex + ": has text");
	check(tree.kids[0], f.tex);
	const inline = O.fromMathML(f.mml, false); ok(/^<m:oMath>/.test(inline), f.tex + ": inline is a bare oMath");
	const back = O.toMathML(om); ok(/^<math [^>]*display="block"/.test(back) && O.parse(back).kids.length === 1, f.tex + ": back to MathML");
});
const get = t => O.fromMathML(FX.find(f => f.tex === t).mml, true);
ok(/<m:f><m:num>/.test(get("\\frac{AC}{AB}=\\frac{AD}{AC} \\Longrightarrow AC^2 = AB\\cdot AD")), "fraction");
ok(/<m:eqArr>(<m:e>[\s\S]*?<\/m:e>){3}<\/m:eqArr>/.test(get("\\begin{aligned} AC^2 + BC^2 &= AB\\cdot AD + AB\\cdot DB \\\\ &= AB(AD+DB) \\\\ &= AB^2 \\end{aligned}")) , "aligned -> eqArr with 3 rows");
ok(/<m:aln\/>/.test(get("\\begin{aligned} AC^2 + BC^2 &= AB\\cdot AD + AB\\cdot DB \\\\ &= AB(AD+DB) \\\\ &= AB^2 \\end{aligned}")), "aligned keeps alignment marks");
ok(/<m:d><m:dPr><m:begChr m:val="\("\/><m:endChr m:val="\)"\/><\/m:dPr><m:e><m:m>/.test(get("\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}")), "pmatrix -> matrix in parentheses");
ok(/<m:nary><m:naryPr><m:chr m:val="∑"\/><m:limLoc m:val="undOvr"\/>/.test(get("\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}")), "sum -> n-ary with limits above / below");
ok(/△/.test(get("\\triangle ABC \\sim \\triangle ACD \\sim \\triangle CBD")) && /∼/.test(get("\\triangle ABC \\sim \\triangle ACD \\sim \\triangle CBD")), "triangle + sim symbols");
ok(/<m:rad><m:radPr><m:degHide m:val="1"\/><\/m:radPr><m:deg\/>/.test(get("\\left(\\frac{a}{b}\\right)^2 + \\int_0^1 x\\,dx + \\hat{x} + \\sqrt[3]{8} + \\sqrt{x} + \\mathbb{R} + \\text{if } x")), "square root hides the degree");
ok(/<m:borderBox>/.test(get("\\boxed{E=mc^2}")), "boxed");
ok(/<m:sty m:val="p"\/><\/m:rPr><m:t>lim<\/m:t>/.test(get("\\lim_{x\\to 0}\\frac{\\sin x}{x}=1")), "lim upright");
ok(O.fromMathML("<math><mi>a&lt;b</mi></math>").indexOf("a&lt;b") > 0, "text escaped");
const p = O.parse('<a x="1 &amp; 2"><b/>t&#x3B1;<![CDATA[<z>]]></a>');
ok(p.kids[0].attrs.x === "1 & 2" && p.kids[0].kids[1] === "tα" && p.kids[0].kids[2] === "<z>", "parser: attrs, entities, CDATA");
// Word's own OMML (as found in .docx files) -> MathML for previews
const word = '<m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>+</m:t></m:r><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f><m:func><m:fName><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>θ</m:t></m:r></m:e></m:func></m:oMath>';
const mm = O.toMathML(word);
ok(/<msup><mrow><mi>x<\/mi><\/mrow><mrow><mn>2<\/mn><\/mrow><\/msup>/.test(mm) && /<mfrac>/.test(mm) && /<mi>sin<\/mi>/.test(mm), "Word OMML -> MathML");
console.log(bad ? bad + " of " + n + " failed" : "all " + n + " passed"); process.exit(bad ? 1 : 0);
