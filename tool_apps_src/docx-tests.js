/* node tool_apps_src/docx-tests.js   (DOCX_OUT=/path/out.docx also writes the generated test document, to open in Word / python-docx) */
"use strict";
var D = require("./docx/lib.js"), MESImg = require("./image-converter/lib.js"), fs = require("fs");
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL:", msg); } }
function eq(a, b, msg) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + "\n   got  " + A + "\n   want " + B); }

/* tiny DOM stand-in: el(tag, attrs, kids...) / text */
function el(tag, attrs) { var kids = [].slice.call(arguments, 2).map(function (k) { return typeof k === "string" ? txt(k) : k; }); return { nodeType: 1, nodeName: tag.toUpperCase(), attrs: attrs || {}, childNodes: kids, getAttribute: function (a) { return this.attrs[a] != null ? this.attrs[a] : null; } }; }
function txt(s) { return { nodeType: 3, nodeName: "#text", nodeValue: s }; }

/* well-formedness: balanced tags, one root */
function wellFormed(x) {
	var s = x.replace(/<\?xml[^>]*\?>/, ""), re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g, st = [], m, roots = 0, last = 0;
	while ((m = re.exec(s))) {
		if (/[<>]/.test(s.slice(last, m.index))) return "stray < or > before " + m.index;
		last = re.lastIndex;
		if (m[1]) { if (st.pop() !== m[2]) return "mismatch at " + m[2]; }
		else if (!m[4]) { if (!st.length) roots++; st.push(m[2]); }
		else if (!st.length) roots++;
	}
	return st.length ? "unclosed " + st.join(",") : roots === 1 ? "" : "roots " + roots;
}

/* sniff */
eq(D.sniff(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0, 0])), "doc", "old .doc");
eq(D.sniff(new Uint8Array(Buffer.from("{\\rtf1\\ansi"))), "rtf", "rtf");
eq(D.sniff(new Uint8Array(Buffer.from("%PDF-1.7"))), "pdf", "pdf");
eq(D.sniff(new Uint8Array(Buffer.from("PK\u0003\u0004 abc"))), "zip", "zip");
eq(D.sniff(new Uint8Array(Buffer.from("PK\u0003\u0004" + new Array(27).join("x") + "mimetypeapplication/vnd.oasis.opendocument.text"))), "odt", "odt");

/* properties, comments, styles, page */
var core = '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>Q3 &amp; Q4 plan</dc:title><dc:creator>Ann Lee</dc:creator><cp:revision>7</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-02T03:04:05Z</dcterms:created><dc:subject></dc:subject></cp:coreProperties>';
var app = '<Properties><Application>Microsoft Office Word</Application><Pages>3</Pages><Words>812</Words><Company>MES</Company></Properties>';
eq(D.parseProps(core, app), { title: "Q3 & Q4 plan", author: "Ann Lee", revision: "7", created: "2026-01-02T03:04:05Z", application: "Microsoft Office Word", company: "MES", pages: "3", words: "812" }, "props");
var cm = D.parseComments('<w:comments><w:comment w:id="0" w:author="Bo &quot;B&quot;" w:date="2026-05-01T10:00:00Z"><w:p><w:r><w:t>Check</w:t></w:r><w:r><w:t xml:space="preserve"> this</w:t></w:r></w:p></w:comment></w:comments>');
eq(cm, [{ id: "0", author: 'Bo "B"', initials: "", date: "2026-05-01T10:00:00Z", text: "Check this" }], "comments");
var hs = D.headingStyles('<w:styles><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="MyHead"><w:name w:val="Big"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:type="character" w:styleId="Heading1Char"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
eq(hs, { Heading1: 1, berschrift2: 2, MyHead: 3, Title: 0 }, "heading styles");
eq(D.styleClass("d1", "Heading 1.x"), "d1_heading-1-x", "style class like docx-preview");
var ps = D.pageSetup('<w:body><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body>');
eq([ps.w, ps.h, ps.top, ps.left, D.paperName(ps)], [11906, 16838, 1417, 1134, "A4"], "page setup A4");
eq(D.paperName(D.pageSetup("")), "Letter", "default Letter");
eq(D.docText('<w:body><w:p><w:r><w:t>Hello</w:t><w:tab/><w:t>world</w:t></w:r></w:p><w:p><w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:r><w:t>Two</w:t></w:r></w:p></w:body>'), "Hello\tworld\nTwo", "doc text skips deleted text");
var st = D.docStats('<w:ins w:id="1"/><w:del w:id="2"/><w:del w:id="3"/><w:tbl></w:tbl><w:drawing></w:drawing><w:sectPr></w:sectPr>', '<w:comment w:id="0">');
eq([st.insertions, st.deletions, st.tables, st.pictures, st.comments, st.sections], [1, 2, 1, 1, 1, 1], "doc stats");

/* counting + searching */
var c = D.countText("Hello world. It's a well-known test!\n\nSecond line 42");
eq([c.words, c.paragraphs, c.sentences], [9, 2, 3], "count words / paragraphs / sentences");
eq(D.countText("\u4f60\u597d world").words, 3, "CJK characters count as words");
eq(D.findAll("Cat cat category CAT", "cat"), [[0, 3], [4, 7], [8, 11], [17, 20]], "find, ignore case");
eq(D.findAll("Cat cat category CAT", "cat", { caseSensitive: true, wholeWord: true }), [[4, 7]], "find, case + whole word");
eq(D.findAll("abc", ""), [], "empty query");
eq([D.safeHref("javascript:alert(1)"), D.safeHref("https://a.b/c"), D.safeHref("#top"), D.safeHref(" data:text/html,x")], [null, "https://a.b/c", "#top", null], "safe links");

/* DOM -> model */
var png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHQ0CAOY1mfAAAAAASUVORK5CYII=";
var tree = el("div", {},
	el("h1", { "class": "dx-title" }, "My Title"),
	el("h2", {}, "Intro"),
	el("p", { style: "text-align: center" }, "Plain ", el("b", {}, "bold ", el("i", {}, "both")), " and ", el("a", { href: "https://mes.fm/docx" }, "a link"), " ", el("a", { href: "javascript:alert(1)" }, "bad")),
	el("p", {}, el("br")),
	el("ul", {}, el("li", {}, "One"), el("li", {}, "Two", el("ul", {}, el("li", {}, "Two A"))), el("li", {}, "Three")),
	el("ol", {}, el("li", {}, "First"), el("li", {}, "Second")),
	el("p", {}, "x", el("sup", {}, "2"), " H", el("sub", {}, "2"), "O ", el("u", {}, "under"), " ", el("s", {}, "gone"), " ", el("code", {}, "f(x)")),
	el("blockquote", {}, el("p", {}, "A quote")),
	el("pre", {}, "line 1\n  line 2"),
	el("table", {}, el("tbody", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Qty")), el("tr", {}, el("td", {}, "Apple"), el("td", {}, el("p", {}, "3"))), el("tr", {}, el("td", { colspan: "2" }, "Total")))),
	el("p", {}, "Picture: ", el("img", { src: png, width: "2", height: "2", alt: "dot" })),
	el("hr"),
	el("script", {}, "alert(1)"),
	"loose text   with   spaces");
var model = D.fromDom(tree);
eq(model[0], { t: "p", style: "Title", runs: [{ text: "My Title" }] }, "title");
eq(model[1].style, "Heading2", "h2");
eq(model[2], { t: "p", style: "Normal", runs: [{ text: "Plain " }, { text: "bold ", b: true }, { text: "both", b: true, i: true }, { text: " and " }, { text: "a link", href: "https://mes.fm/docx" }, { text: " bad" }], align: "center" }, "inline formats, unsafe link dropped");
eq(model[3], { t: "p", style: "Normal", runs: [] }, "empty paragraph kept");
eq(model.slice(4, 8).map(function (b) { return [b.runs[0].text, b.list.type, b.list.level]; }), [["One", "ul", 0], ["Two", "ul", 0], ["Two A", "ul", 1], ["Three", "ul", 0]], "nested bullets");
eq(model.slice(8, 10).map(function (b) { return [b.runs[0].text, b.list.type]; }), [["First", "ol"], ["Second", "ol"]], "numbered list");
ok(model[8].list.id !== model[4].list.id, "new list id for the numbered list");
eq(model[10].runs.map(function (r) { return Object.keys(r).sort().join(","); }), ["text", "sup,text", "text", "sub,text", "text", "text,u", "text", "s,text", "text", "code,text"], "sup sub u s code");
eq([model[11].style, model[11].runs[0].text], ["Quote", "A quote"], "quote");
eq([model[12].style, model[12].runs[0].text], ["Code", "line 1\n  line 2"], "pre keeps spaces");
var tb = model[13];
eq([tb.t, tb.rows.length, tb.rows[0].head, tb.rows[0].cells[0].blocks[0].runs[0].b, tb.rows[2].cells[0].span, tb.rows[1].cells[1].blocks[0].runs[0].text], ["table", 3, true, true, 2, "3"], "table");
eq([model[14].runs[1].img.alt, model[14].runs[1].img.w], ["dot", 2], "image run");
eq(model[15], { t: "hr" }, "hr");
eq(model[16].runs, [{ text: "loose text with spaces" }], "loose text, script skipped, spaces collapsed");
eq(model.length, 17, "block count");
eq(D.fromDom(el("div", {}, el("p", {}, el("ol", {}, el("li", {}, "A")))) ).length, 1, "a list wrongly inside <p> (Chrome) leaves no empty paragraph");

/* model -> docx */
var parts = D.toDocxParts(model, { title: "Test <doc>", author: "MES", page: ps, now: new Date(Date.UTC(2026, 9, 26, 12, 0, 0)) });
var byName = {}; parts.forEach(function (p) { byName[p.name] = p.data; });
["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml", "word/numbering.xml", "word/settings.xml", "docProps/core.xml", "docProps/app.xml", "word/media/image1.png"].forEach(function (n) { ok(byName[n], "part " + n); });
Object.keys(byName).filter(function (n) { return /\.(xml|rels)$/.test(n); }).forEach(function (n) { var e = wellFormed(Buffer.from(byName[n]).toString("utf8")); ok(!e, n + " well formed: " + e); });
var docx = Buffer.from(byName["word/document.xml"]).toString("utf8"), drels = Buffer.from(byName["word/_rels/document.xml.rels"]).toString("utf8");
ok(/<w:pStyle w:val="Title"\/>/.test(docx) && /<w:pStyle w:val="Heading2"\/>/.test(docx), "styles used");
ok(/<w:jc w:val="center"\/>/.test(docx), "alignment");
ok(/<w:numPr><w:ilvl w:val="1"\/>/.test(docx), "nested list level");
ok(/TargetMode="External"/.test(drels) && /https:\/\/mes\.fm\/docx/.test(drels), "hyperlink relationship");
ok(!/javascript/.test(docx + drels), "no javascript link");
ok(/<w:gridSpan w:val="2"\/>/.test(docx) && /<w:tblHeader\/>/.test(docx), "table span + header row");
ok(/r:embed="rId\d+"/.test(docx) && /Target="media\/image1.png"/.test(drels), "image relationship");
ok(/<w:pgSz w:w="11906" w:h="16838"\/>/.test(docx), "keeps the page size");
ok(/line 1<\/w:t><w:br\/><w:t xml:space="preserve">  line 2/.test(docx), "code line break");
ok(/<dc:title>Test &lt;doc&gt;<\/dc:title>/.test(Buffer.from(byName["docProps/core.xml"]).toString()), "title escaped");
ok(/<w:tc>(?:(?!<\/w:tc>)[\s\S])*<\/w:p><\/w:tc>/.test(docx), "cells end in a paragraph");
var zip = MESImg.zipStore(parts.map(function (p) { return { name: p.name, data: p.data }; }));
ok(zip[0] === 0x50 && zip[1] === 0x4B, "zip written");
if (process.env.DOCX_OUT) { fs.writeFileSync(process.env.DOCX_OUT, Buffer.from(zip)); console.log("wrote", process.env.DOCX_OUT); }

/* other formats */
var md = D.toMarkdown(D.fromDom(tree));
ok(/^# My Title\n\n## Intro\n/.test(md), "md headings");
ok(md.indexOf("Plain **bold *****both*** and [a link](https://mes.fm/docx) bad") >= 0 || md.indexOf("Plain **bold** ***both*** and [a link](https://mes.fm/docx) bad") >= 0, "md inline: " + md.split("\n")[4]);
ok(/\n- One\n- Two\n  - Two A\n- Three\n\n1\. First\n2\. Second\n/.test(md), "md lists:\n" + md);
ok(/\| \*\*Name\*\* \| \*\*Qty\*\* \|\n\| --- \| --- \|\n\| Apple \| 3 \|\n\| Total \|  \|/.test(md), "md table");
ok(/!\[dot\]\(image-1\.png\)/.test(md) && /```\nline 1\n  line 2\n```/.test(md) && /> A quote/.test(md) && /\n---\n/.test(md), "md image, code, quote, rule");
var tx = D.toText(D.fromDom(tree));
ok(/\u2022 One\n\u2022 Two\n    \u2022 Two A\n\u2022 Three\n\n1\. First\n2\. Second/.test(tx), "text lists:\n" + tx);
ok(/Name\tQty\nApple\t3/.test(tx), "text table");
var html = D.toHtml(D.fromDom(tree), "T");
ok(/<ul><li>One<\/li><li>Two<ul><li>Two A<\/li><\/ul><\/li><li>Three<\/li><\/ul><ol><li>First<\/li><li>Second<\/li><\/ol>/.test(html.replace(/\n/g, "")), "html lists: " + html);
ok(/<th><p><strong>Name<\/strong><\/p>/.test(html) && /colspan="2"/.test(html) && !/javascript|<script/.test(html), "html table, safe");
eq(D.modelStats(model), { paragraphs: 20, headings: 2, lists: 6, tables: 1, images: 1, links: 1 }, "model stats");
eq([D.baseName("C:\\x\\Report.final.docx"), D.fmtBytes(1536), D.minutes(0.5), D.minutes(75)], ["Report.final", "1.5 KB", "30 s", "1 h 15 min"], "names + formats");
eq(D.dataUri(png).data.length, 77, "base64 decode");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
