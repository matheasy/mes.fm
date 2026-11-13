// node tool_apps_src/text-tests.js -- MES Text Viewer helpers (tool_apps_src/text/lib.js) and the link opener's file routing
const T = require("./text/lib.js"), L = require("../mes.fm/main_js/link-open.js");
let n = 0, bad = 0; function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
const enc = (s) => new TextEncoder().encode(s);
ok(T.decode(enc("héllo")).text === "héllo" && T.decode(enc("héllo")).enc === "utf-8", "utf-8");
ok(T.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).text === "A", "utf-8 bom stripped");
ok(T.decode(new Uint8Array([0xff, 0xfe, 0x41, 0, 0x42, 0])).text === "AB", "utf-16le");
ok(T.decode(new Uint8Array([0x93, 0x68, 0x69, 0x94, 0xe9])).text === "“hi”é" && T.decode(new Uint8Array([0x93, 0x68])).enc === "windows-1252", "cp1252 fallback");
ok(T.info("a.md", "# hi").kind === "md" && T.info("a.py", "x=1").lang === "python" && T.info("a.rtf", "").kind === "rtf" && T.info("x", "{\\rtf1 x}").kind === "rtf", "info kinds");
ok(T.info("data", '{"a":1}').kind === "json" && T.info("a.csv", "").kind === "csv" && T.info("notes.txt", "hello").kind === "text" && T.info("Makefile", "all:").lang === "makefile", "info json/csv/text/makefile");
ok(T.info("run", "#!/usr/bin/env python\nprint(1)").lang === "python", "shebang");
const rtf = "{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Times New Roman;}}{\\colortbl;\\red255\\green0\\blue0;}{\\*\\generator Riched20;}\\pard\\fs48\\b Title\\b0\\par\\fs24 Hello \\b bold\\b0 , \\i it\\i0  and \\cf1 red\\cf0 . Caf\\'e9 \\u8364? end\\par\\pard\\qc centred\\par}";
const r = T.rtfToHtml(rtf);
ok(/<h1>Title/.test(r.html), "rtf heading " + r.html);
ok(/<b>bold<\/b>/.test(r.html) && /<i>it<\/i>/.test(r.html), "rtf bold italic");
ok(/color:rgb\(255,0,0\)">red/.test(r.html), "rtf colour");
ok(/Café €/.test(r.text) && !/Times New Roman|Riched/.test(r.text), "rtf chars + skipped groups: " + r.text);
ok(/text-align:center">centred/.test(r.html), "rtf align");
const tb = T.rtfToHtml("{\\rtf1\\trowd\\cellx1000\\cellx2000\\pard\\intbl A\\cell B\\cell\\row\\pard after\\par}");
ok(/<table><tr><td><p>A<\/p><\/td><td><p>B<\/p><\/td><\/tr><\/table>/.test(tb.html) && /after/.test(tb.html), "rtf table " + tb.html);
ok(T.rtfToHtml("{\\rtf1 a\\line b\\tab c\\par}").html.indexOf("a<br>b c") >= 0, "rtf line/tab");
ok(T.rtfToHtml("{\\rtf1 <script>\\par}").html.indexOf("&lt;script&gt;") >= 0, "rtf escapes html");
ok(JSON.stringify(T.parseCsv('a,b\n"x, y","say ""hi"""\n')) === JSON.stringify([["a", "b"], ["x, y", 'say "hi"']]), "csv quotes");
ok(T.guessSep("a;b;c\n1;2;3") === ";" && T.guessSep("a\tb") === "\t", "csv sep");
ok(T.stats("two words\nline").words === 3 && T.stats("a\nb\nc").lines === 3, "stats");
const wrapped = Array.from({ length: 30 }, (_, i) => "This is a line of an old hard wrapped e-text file number " + i + " ok").join("\n");
ok(T.shouldUnwrap(wrapped) && !T.shouldUnwrap("short\nlines\n".repeat(20)), "unwrap detect");
ok(T.paragraphs("a\nb\n\nc", true)[0] === "a\nb" || T.paragraphs("a long first line that is longer than forty chars\nb", true)[0].indexOf(" b") > 0, "paragraphs join");
ok(T.paragraphs("p1\n\n\np2").length === 2, "paragraphs split");
ok(T.linkify("see https://mes.fm/text.").indexOf('href="https://mes.fm/text"') > 0, "linkify trims dot");
const sl = T.splitHtmlLines('<span class="a">x\ny</span>\nz');
ok(sl.length === 3 && sl[0] === '<span class="a">x</span>' && sl[1] === '<span class="a">y</span>' && sl[2] === "z", "split html lines " + JSON.stringify(sl));
// link-open routing
ok(L.kindOf("a.rtf", "", enc("{\\rtf1}").buffer) === "text" && L.kindOf("x.pdf", "", enc("%PDF-1.4").buffer) === "pdf" && L.kindOf("x.bin", "", new Uint8Array([1, 0, 2]).buffer) === "other", "kindOf bytes");
ok(L.kindOf("a.docx") === "docx" && L.kindOf("notes.md") === "text" && L.kindOf("a.doc") === "doc" && L.kindOf("photo.jpg") === "other", "kindOf names");
ok(L.fix("https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit", "text").endsWith("format=txt"), "google doc txt");
ok(L.nameFrom("https://x.com/f/notes.md", "text") === "notes.md" && L.nameFrom("https://x.com/get.php", "text") === "get.txt", "text names");
console.log(bad ? bad + " of " + n + " checks failed" : "all " + n + " checks passed"); process.exit(bad ? 1 : 0);
