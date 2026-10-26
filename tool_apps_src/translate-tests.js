// node tool_apps_src/translate-tests.js -- pure helpers of mes.fm/translate (tool_apps_src/translate/lib.js)
"use strict";
const T = require("./translate/lib.js");
let n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL " + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + " -> " + JSON.stringify(a) + " expected " + JSON.stringify(b)); }

// codes
eq(T.norm("en-US"), "en", "norm en-US");
eq(T.norm("zh-TW"), "zh-Hant", "norm zh-TW");
eq(T.norm("zh-Hans-CN"), "zh", "norm zh-Hans");
eq(T.norm("iw"), "he", "norm iw");
eq(T.norm("nb-NO"), "no", "norm nb");
eq(T.norm("Auto"), "auto", "norm auto");
eq(T.toTess("fr"), "fra", "tess fr");
eq(T.toTess("zh-Hant"), "chi_tra", "tess zh-Hant");
eq(T.toTess("ja-JP"), "jpn", "tess ja-JP");
eq(T.toTess("zu"), null, "no OCR for zu");
eq(T.fromTess("deu+eng"), "de", "fromTess");
eq(T.tessLangs("ru", true), "rus+eng", "tessLangs + eng");
eq(T.tessLangs("en", true), "eng", "tessLangs en alone");
eq(T.tessLangs("auto", false), "eng", "tessLangs fallback");
eq(T.myMemoryCode("zh"), "zh-CN", "mm zh");
eq(T.myMemoryCode("auto"), "autodetect", "mm auto");
ok(T.isRtl("ar") && T.isRtl("he") && T.isRtl("fa-IR") && T.isRtl("ur") && !T.isRtl("en") && !T.isRtl("ja"), "rtl");
// every language has a unique code and a usable Intl name
const codes = T.LANGS.map(l => l[0]);
eq(new Set(codes).size, codes.length, "unique codes");
const tess = T.LANGS.map(l => l[1]).filter(Boolean);
eq(new Set(tess).size, tess.length, "unique tesseract codes");

// utf8
eq(T.utf8Len("abc"), 3, "utf8 ascii");
eq(T.utf8Len("é"), 2, "utf8 2");
eq(T.utf8Len("日本"), 6, "utf8 3");
eq(T.utf8Len("😀"), 4, "utf8 4");

// chunking
const text = "Hello there. This is a test! Is it working? Yes.\n\nSecond paragraph here.\nThird line";
function roundTrip(t, max, m) { const p = T.chunk(t, max, m); return T.join(p, p.map(x => x.t)); }
eq(roundTrip(text, 20), text, "round trip keeps text");
eq(roundTrip("  lead and trail  ", 500), "  lead and trail  ", "lead/trail spaces kept");
eq(roundTrip("\n\nA. B.\n\n", 500), "\n\nA. B.\n\n", "blank lines kept");
let ps = T.chunk(text, 30);
ok(ps.every(p => p.t.length <= 30), "every piece under the limit");
ok(ps.some(p => p.t === "Hello there. This is a test!"), "sentences grouped: " + JSON.stringify(ps.map(p => p.t)));
ok(ps.every(p => !p.t || /[.!?]$/.test(p.t) || p.t === "Third line"), "no sentence cut when they fit");
ps = T.chunk("word ".repeat(200).trim() + ".", 100);
ok(ps.length >= 10 && ps.every(p => p.t.length <= 100), "long sentence cut at spaces");
eq(T.join(ps, ps.map(p => p.t)), "word ".repeat(200).trim() + ".", "long sentence round trip");
const cjk = "日本語の文章です。".repeat(40);
ps = T.chunk(cjk, 480, T.utf8Len);
ok(ps.every(p => T.utf8Len(p.t) <= 480), "cjk under 480 bytes");
ok(ps.every(p => p.t.endsWith("。")), "cjk cut at 。");
const nospace = "あ".repeat(400);
ps = T.chunk(nospace, 480, T.utf8Len);
ok(ps.every(p => T.utf8Len(p.t) <= 480) && ps.map(p => p.t).join("") === nospace, "no-space text cut by characters");
eq(T.chunk("", 500).filter(p => p.t).length, 0, "empty text");
eq(T.join(T.chunk("A. B.", 3), ["x", "y"]), "x y", "join translated");

// MyMemory answers
const mm = {"responseData":{"translatedText":"bonjour monde comment vas tu","match":0.94},"responseStatus":200,"matches":[
  {"segment":"hello world how are you","translation":"bonjour monde comment vas tu","match":0.94,"created-by":"MateCat"},
  {"segment":"Hello world. How are you?","translation":"Bonjour le monde. Comment allez-vous ?","match":0.85,"created-by":"MT!"}]};
eq(T.pickMyMemory(mm, "Hello world. How are you?").text, "Bonjour le monde. Comment allez-vous ?", "fuzzy memory hit replaced by MT");
const mm2 = {"responseData":{"translatedText":"Hallo","match":1},"responseStatus":200,"matches":[{"segment":"Hello","translation":"Hallo","match":1,"created-by":"x"}]};
eq(T.pickMyMemory(mm2, "Hello").text, "Hallo", "exact memory match");
eq(T.pickMyMemory({"responseData":{"translatedText":"Hello World","detectedLanguage":"fr"},"responseStatus":200,"matches":[]}, "Bonjour").detected, "fr", "detected");
ok(T.pickMyMemory({"responseData":{"translatedText":"MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY"},"responseStatus":200}, "x").quota, "quota warning");
ok(T.pickMyMemory({"responseStatus":"429","quotaFinished":true}, "x").quota, "429");
ok(T.pickMyMemory({"responseData":{"translatedText":"'XX' IS AN INVALID TARGET LANGUAGE"},"responseStatus":"403","responseDetails":"bad"}, "x").error, "error status");

// engine choice
eq(T.chooseEngine("auto", true, "available"), { engine: "device", download: false }, "auto available");
eq(T.chooseEngine("auto", true, "downloadable").download, true, "auto downloadable");
eq(T.chooseEngine("auto", true, "unavailable").engine, "online", "auto pair missing");
eq(T.chooseEngine("auto", false, "").engine, "online", "auto no api");
eq(T.chooseEngine("device", false, "").engine, null, "device no api");
eq(T.chooseEngine("device", true, "unavailable").reason, "pair", "device pair missing");
eq(T.chooseEngine("online", true, "available").engine, "online", "online forced");
ok(T.liveOk(T.chooseEngine("auto", true, "available")) && !T.liveOk(T.chooseEngine("auto", true, "downloadable")) && !T.liveOk(T.chooseEngine("auto", false, "")), "live typing only on device");

// query
eq(T.parseQuery("?from=fr&to=en-GB&q=Bonjour%20le+monde"), { from: "fr", to: "en", q: "Bonjour le monde" }, "parse");
eq(T.parseQuery("?from=xx&to=auto&q=%E0%A4"), { from: "", to: "", q: "" }, "bad values dropped");
eq(T.parseQuery("?to=ja"), { from: "", to: "ja", q: "" }, "only to");
eq(T.buildQuery({ from: "auto", to: "de", q: "a b&c" }), "?from=auto&to=de&q=a%20b%26c", "build");
eq(T.parseQuery(T.buildQuery({ from: "es", to: "ar", q: "¿Qué tal? 100%" })), { from: "es", to: "ar", q: "¿Qué tal? 100%" }, "build/parse round trip");
eq(T.buildQuery({ q: "x".repeat(3000) }).length, "?q=".length + 1500, "q capped in links");

// misc
eq(T.usage({ day: "2026-10-24", n: 100 }, "2026-10-24", 50).n, 150, "usage adds");
eq(T.usage({ day: "2026-10-23", n: 100 }, "2026-10-24", 50).n, 50, "usage resets next day");
eq(T.pickTarget(["fr-CA", "en"], "auto"), "fr", "target from browser");
eq(T.pickTarget(["en-US"], "en"), "es", "target avoids source");
eq(T.ocrScale(4000, 3000), 2600 / 4000, "shrink huge");
eq(T.ocrScale(500, 200), 1100 / 500, "enlarge small");
eq(T.ocrScale(100, 50), 3, "enlarge capped");
const v6 = { blocks: [{ paragraphs: [{ lines: [{ text: "Hello world\n", confidence: 91.4, bbox: { x0: 1, y0: 2, x1: 3, y1: 4 }, words: [{ text: "Hello", confidence: 90, bbox: {} }, { text: " ", bbox: {} }, { text: "world", confidence: 93, bbox: {} }] }, { text: "  ", words: [] }] }] }] };
const L = T.ocrLines(v6);
eq(L.length, 1, "ocr lines");
eq(L[0].text, "Hello world", "ocr line text");
eq(L[0].words.length, 2, "ocr words");
eq(T.ocrLines({ lines: [{ text: "A", words: [] }] })[0].text, "A", "v5 lines");

// picture links
eq(T.imageLink(" https://Site.com/a b.png "), null, "space inside refused");
eq(T.imageLink("https://site.com/a.png#x"), "https://site.com/a.png", "hash dropped");
eq(T.imageLink("//cdn.site.com/p.jpg"), "https://cdn.site.com/p.jpg", "protocol-relative");
["data:image/png;base64,AA", "blob:https://mes.fm/1", "file:///a.png", "javascript:alert(1)", "ftp://a.com/x.png", "https://u:p@a.com/x.png", "hello", ""].forEach(function (u) { eq(T.imageLink(u), null, "refuse " + u); });
eq(T.parseQuery("?img=https%3A%2F%2Fa.com%2Fx.jpg").img, "https://a.com/x.jpg", "?img= link");
eq(T.parseQuery("?img=data%3Aimage%2Fpng%3Bbase64%2CAA").img, undefined, "?img= data: dropped");
eq(T.linkName("https://a.com/photos/My%20Sign.JPG?x=1", "image/jpeg"), "My Sign.JPG", "linkName keeps the file name");
eq(T.linkName("https://a.com/render?id=4", "image/png"), "render.png", "linkName adds an extension");
eq(T.linkName("https://a.com/", "application/pdf"), "picture.pdf", "linkName fallback");
eq(T.layoutOf({}), { lay: "side", full: false }, "layout default");
eq(T.layoutOf({ lay: "stack", full: 1 }), { lay: "stack", full: true }, "layout saved");
eq(T.layoutOf({ lay: "weird" }).lay, "side", "layout unknown");
// source tabs
eq(T.sourceTabs("translate", true), ["text", "file", "link", "cam"], "translate tabs, text first");
eq(T.sourceTabs("ocr", true), ["file", "link", "cam"], "Image to Text: picture tabs only, picture first");
eq(T.sourceTabs("translate", false), ["text", "file", "link"], "no camera tab without a camera");
eq(T.nextTab(["text", "file", "link"], "text", "ArrowRight"), "file", "arrow right");
eq(T.nextTab(["text", "file", "link"], "text", "ArrowLeft"), "link", "arrow left wraps");
eq(T.nextTab(["text", "file", "link"], "link", "ArrowRight"), "text", "arrow right wraps");
eq(T.nextTab(["text", "file", "link"], "file", "Home"), "text", "Home");
eq(T.nextTab(["text", "file", "link"], "file", "End"), "link", "End");
eq(T.nextTab(["text", "file", "link"], "file", "a"), null, "other keys ignored");
eq(T.nextTab([], "x", "ArrowRight"), null, "empty list");
eq([T.editDefault(true), T.editDefault(false)], [true, false], "edit before reading: on for touch, off on a computer");

console.log((bad ? bad + " of " : "all ") + n + " checks " + (bad ? "FAILED" : "passed"));
process.exit(bad ? 1 : 0);
