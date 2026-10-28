/* Tests for the MES Dictionary helpers (tool_apps_src/define/lib.js). Run: node tool_apps_src/define-tests.js
   Fixtures in tool_apps_src/define/fixtures/ are real responses recorded 2026-10-27 (Wiktionary REST + wikitext, dictionaryapi.dev, opensearch). */
"use strict";
var D = require("./define/lib.js"), fs = require("fs"), path = require("path"), crypto = require("crypto");
var FX = path.join(__dirname, "define", "fixtures");
function fx(n) { return JSON.parse(fs.readFileSync(path.join(FX, n), "utf8")); }
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function entry(w) { return D.build(w, fx("wikt-" + w + ".json"), fx("wtext-" + w + ".json")); }

// words, links, query
eq(D.normWord("  “Happy!”  "), "Happy", "normWord trims quotes and punctuation");
eq(D.variants("Torsion"), ["Torsion", "torsion"], "variants");
eq(D.variants("nasa"), ["nasa", "Nasa"], "variants add Capitalised");
eq(D.parseQuery("?w=ice+cream", "/define").w, "ice cream", "?w= with +");
eq(D.parseQuery("", "/define/serendipity").w, "serendipity", "/define/<word>");
eq(D.parseQuery("", "/define/index.html").w, undefined, "/define/index.html is not a word");
eq(D.parseQuery("", "/define/ice%20cream").w, "ice cream", "/define/<encoded>");
eq(D.parseQuery("?list=cat,Dog,cat,,bird", "/define").list, ["cat", "Dog", "bird"], "?list= de-duplicated");
eq(D.shareLink("ice cream"), "https://mes.fm/define?w=ice+cream", "share link");
eq(D.translateLink("torsion", "es"), "/translate?from=en&to=es&q=torsion", "translate link matches MES Translate's ?from=&to=&q=");
eq(D.pronounceLink("torsion"), "/pronounce?q=torsion", "pronounce link");
ok(/page\/definition\/ice_cream\?redirect=true$/.test(D.restUrl("ice cream")), "REST url uses underscores");
ok(/origin=\*/.test(D.wikitextUrl("x")) && /origin=\*/.test(D.suggestUrl("x")), "action API urls are CORS (origin=*)");

// HTML -> segments
var segs = D.htmlToSegs('The act of <a rel="mw:WikiLink" href="/wiki/turn" title="turn">turning</a> &amp; <a rel="mw:WikiLink/Interwiki" href="https://en.wikipedia.org/wiki/X" class="extiw">X</a> <b>bold</b>.');
eq(segs, [{ t: "The act of " }, { t: "turning", w: "turn" }, { t: " & X bold." }], "htmlToSegs: wiki links clickable, interwiki plain, entities decoded");
eq(D.segsText(D.htmlToSegs('<span class="usage-label-sense" about="#m"></span> <a rel="mw:WikiLink" href="/wiki/benefit">Benefit</a> or advantage.')), "Benefit or advantage.", "empty label span dropped");
eq(D.htmlToSegs('<a rel="mw:WikiLink" href="/wiki/percentage#Dutch">x</a>')[0].w, undefined, "link to another language's section is not clickable");
eq(D.decode("&#x3b1;&#946;&nbsp;&mdash;"), "αβ —", "decode numeric entities");

// REST
var r = D.parseRest(fx("wikt-torsion.json"));
eq(r.pos.map(function (p) { return p.pos; }), ["Noun", "Verb"], "torsion parts of speech");
eq(r.pos[0].senses.length, 6, "torsion noun senses");
ok(r.other.indexOf("French") >= 0, "other languages listed");
var pr = D.parseRest(fx("wikt-percentage.json"));
eq(pr.pos[0].senses[0].ex[0], "A high percentage of secondary school leavers take a gap year.", "examples are plain text");

// whole entries (REST + wikitext)
var t = entry("torsion");
eq(t.pos[0].senses[1].labels, ["mathematics"], "sense labels from {{lb|en|math}}");
eq(t.pos[0].forms.rows, [["plural", "torsions"]], "noun plural");
eq(t.pos[0].forms.note, "countable and uncountable", "en-noun|~ note");
ok(/^From Middle English torcion, from Middle French torsion, from Late Latin torsiōnem, from Latin tortiō, from torqueō \(“twist, turn”\)\. See torture, -tort\.$/.test(D.segsText(t.wiki.etys[0])), "torsion etymology rendered: " + D.segsText(t.wiki.etys[0]));
ok(t.wiki.etys[0].some(function (s) { return s.w === "torture"; }), "English words in the etymology are clickable");
ok(t.wiki.der.indexOf("torsion bar") >= 0 && t.wiki.der.indexOf("detorsion") >= 0 && t.wiki.der.length >= 25, "derived terms from a multi-line {{col}}");
eq(t.wiki.rel, ["torque", "torse", "tortuosity", "tortuousness"], "related terms");
eq(t.wiki.ipa[0], { ipa: "/ˈtɔː.ʃən/", acc: "UK" }, "IPA with accent");
eq(t.wiki.trans[0].gloss, "the act of turning or twisting", "translation table gloss");
ok(t.wiki.trans[0].items.some(function (x) { return x.lang === "Spanish" && x.words[0] === "torsión" && x.code === "es"; }), "Spanish translation");
ok(t.wiki.trans[0].items.some(function (x) { return x.lang === "Norwegian (Bokmål)"; }), "nested translation languages");
eq(t.short.pos, "Noun", "short definition part of speech");

var h = entry("happy");
var adj = h.pos[0];
eq(adj.pos, "Adjective", "happy adjective first");
eq(adj.senses[0].syn.slice(0, 3), ["cheerful", "content", "delighted"], "per-sense synonyms (Thesaurus: dropped)");
ok(adj.senses[0].ant.indexOf("sad") >= 0 && adj.senses[0].ant.indexOf("Thesaurus:sad") < 0, "per-sense antonyms");
eq(adj.senses[1].labels, ["of people"], "free-text label");
eq(adj.senses[2].depth, 2, "sub-sense depth from ##");
eq(adj.forms.rows, [["comparative", "happier, more happy"], ["superlative", "happiest, most happy"]], "en-adj|er,more");
eq(h.wiki.hyph, ["hap‧py"], "hyphenation");
eq(h.wiki.rhymes, ["-æpi"], "rhymes");
ok(h.wiki.audio.some(function (a) { return a.file === "En-uk-happy.ogg" && a.acc === "UK"; }), "recordings with accents");
ok(h.wiki.trans.every(function (x) { return x.gloss !== "-see"; }), "trans-top-see is not a table");
ok(/^From Middle English happy \(“fortunate, happy”\)/.test(D.segsText(h.wiki.etys[0])), "happy etymology");
ok(/hap \(“chance, luck, fortune”\) \+ -y/.test(D.segsText(h.wiki.etys[0])), "affix with <t:> glosses");

var run = entry("run");
eq(run.pos[0].pos, "Verb", "translingual Symbol dropped from run");
eq(run.pos[0].forms.rows, [["third-person singular", "runs"], ["present participle", "running"], ["simple past", "ran"], ["past participle", "run"]], "en-verb|run<,,ran,run:...>");
eq(run.pos[0].senses[1].labels, ["intransitive"], "run sense 2 label");
eq(run.pos[0].senses[1].depth, 2, "run sense 2 is a sub-sense");
ok(run.pos.some(function (p) { return p.senses.some(function (s) { return s.formOf === "rin"; }); }), "form-of senses link their word");
ok(run.wiki.der.length > 300, "many derived terms");

var pc = entry("percentage");
eq(pc.pos[0].senses[0].syn, ["centage"], "percentage synonym");
eq(pc.wiki.rel.slice(0, 2), ["percent", "percentile"], "percentage related");
ok(/^From percent, from Latin per centum \(“for every hundred”\), \+ -age\.$/.test(D.segsText(pc.wiki.etys[0])), "percentage etymology: " + D.segsText(pc.wiki.etys[0]));

// templates
eq(D.splitArgs("a|{{b|c}}|[[d|e]]|f"), ["a", "{{b|c}}", "[[d|e]]", "f"], "splitArgs keeps nested");
eq(D.tplParts("der|en|la|torsiō|t=twist").named.t, "twist", "named args");
eq(D.segsText(D.renderEty("{{bor+|en|fr|croissant}}")), "Borrowed from French croissant", "bor+");
eq(D.segsText(D.renderEty("{{blend|en|smoke|fog}}")), "Blend of smoke + fog", "blend");
eq(D.segsText(D.renderEty("{{suffix|en|kind|ness}}")), "kind + -ness", "suffix");
eq(D.segsText(D.renderEty("{{root|en|ine-pro|*x}}{{unk|en}}.")), "Unknown.", "dropped + unknown templates");
eq(D.renderEty("{{rfe|en}}"), [], "empty etymology");

// forms
eq(D.inflect({ name: "en-noun", pos: [], named: {} }, "box").rows, [["plural", "boxes"]], "plural -es");
eq(D.inflect({ name: "en-noun", pos: [], named: {} }, "city").rows, [["plural", "cities"]], "plural -ies");
eq(D.inflect({ name: "en-noun", pos: ["-"], named: {} }, "advice").note, "usually uncountable", "uncountable");
eq(D.inflect({ name: "en-noun", pos: ["mice"], named: {} }, "mouse").rows, [["plural", "mice"]], "irregular plural");
eq(D.inflect({ name: "en-verb", pos: [], named: {} }, "make").rows[1][1], "making", "e-drop -ing");
eq(D.inflect({ name: "en-verb", pos: [], named: {} }, "stop").rows[2][1], "stopped", "consonant doubling");
eq(D.inflect({ name: "en-verb", pos: [], named: {} }, "carry").rows[2][1], "carried", "y -> ied");
eq(D.inflect({ name: "en-adj", pos: ["-"], named: {} }, "unique").note, "not comparable", "not comparable");
eq(D.inflect({ name: "en-adj", pos: ["er"], named: {} }, "big").rows, [["comparative", "bigger"], ["superlative", "biggest"]], "big -> bigger");

// Commons recordings
eq(D.md5("En-uk-happy.ogg"), crypto.createHash("md5").update("En-uk-happy.ogg").digest("hex"), "md5 matches node crypto");
eq(D.md5("LL-Q1860_(eng)-Vealhurl-torsion.wav"), crypto.createHash("md5").update("LL-Q1860_(eng)-Vealhurl-torsion.wav").digest("hex"), "md5 of a long name");
eq(D.md5("é∑"), crypto.createHash("md5").update("é∑").digest("hex"), "md5 utf-8");
eq(D.commonsAudio("En-uk-happy.ogg").mp3, "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/fb/En-uk-happy.ogg/En-uk-happy.ogg.mp3", "Commons MP3 transcode url (checked live: 200 audio/mpeg)");
ok(D.commonsAudio("en-us-happy.ogg").mp3.indexOf("/En-us-happy.ogg/En-us-happy.ogg.mp3") > 0, "first letter capitalised (Commons titles)");
ok(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/x\.mp3$/.test(D.commonsAudio("x.mp3").mp3.replace("X.mp3", "x.mp3")), "mp3 files are not transcoded");
eq(D.commonsAudio("../evil"), null, "unsafe file names refused");

// dictionaryapi.dev fallback
var da = D.parseDictApi(fx("dictapi-run.json"));
ok(da.pos.length >= 2 && da.pos[0].pos === "Verb", "dictapi parts of speech");
ok(da.audio.some(function (a) { return a.acc === "US"; }), "dictapi recordings");
eq(D.parseDictApi({ title: "No Definitions Found" }).pos, [], "dictapi not-found shape");

// suggestions, spelling
eq(D.parseSuggest(fx("opensearch-tors.json"), "torsion")[0], "torsion", "exact match first");
eq(D.edits("recieve", "receive"), 2, "edit distance");

// On MES
var items = [
	{ path: "/shear-stress-calculator", title: "Shear Stress Calculator", desc: "Shear stress in bolts, torsion of shafts ...", cat: "calculators" },
	{ path: "/percentagecalculator", title: "Percentage Calculator", desc: "Work out percentages.", cat: "calculators" },
	{ path: "/x", title: "Distortion", desc: "Nothing", cat: "tools" },
	{ path: "/define", title: "MES Dictionary", desc: "torsion", cat: "tools" }
];
eq(D.mesPick(items, "torsion").map(function (x) { return x.path; }), ["/shear-stress-calculator"], "torsion -> shear stress calculator (whole word only, not the dictionary itself)");
eq(D.mesPick(items, "percentage").map(function (x) { return x.path; }), ["/percentagecalculator"], "percentage -> Percentage Calculator (stem percent)");
eq(D.mesPick([{ path: "/m1", title: "Percentage meme", cat: "fun" }, { path: "/m2", title: "Percentage meme 2", cat: "fun" }, { path: "/c", title: "Tip", desc: "a percentage of the bill", cat: "calculators" }], "percentage").map(function (x) { return x.path; }), ["/c", "/m1"], "calculators before memes, at most one meme");
eq(D.mesPick([{ path: "/a", title: "Orbit Simulator", cat: "tools" }, { path: "/b", title: "X", desc: "orbit", cat: "tools" }, { path: "/c", title: "Y", desc: "orbit", cat: "tools" }, { path: "/d", title: "Z", desc: "orbit", cat: "tools" }], "orbit").map(function (x) { return x.path; }), ["/a", "/b", "/c"], "title matches + at most two that only mention the word");
ok(D.stems("percentage").indexOf("percent") >= 0 && D.stems("cities").indexOf("city") >= 0, "stems");

// saved words, flashcards, quiz
var L = D.addSaved([], { w: "torsion", d: "Twisting", p: "Noun" }, 1);
L = D.addSaved(L, { w: "happy", d: "Glad", p: "Adjective" }, 2);
L = D.addSaved(L, { w: "Torsion" }, 3);
eq(L.map(function (x) { return x.w; }), ["Torsion", "happy"], "re-saving moves to the top, keeps one copy");
eq(L[0].d, "Twisting", "keeps the old meaning");
eq(D.removeSaved(L, "HAPPY").length, 1, "remove ignores case");
var im = D.importText(L, D.exportJson([{ w: "cogent", d: "Convincing", b: 3 }, { w: "happy" }]));
eq(im.added, 1, "import counts new words");
eq(im.list[0].b, 3, "import keeps flashcard box");
eq(D.importText([], "cat - a small animal\ndog\n\n").list.map(function (x) { return [x.w, x.d]; }), [["cat", "a small animal"], ["dog", ""]], "plain-text import");
var g = D.grade({ w: "x", b: 2 }, true, 0);
eq([g.b, g.n], [3, 4 * 864e5], "grade up: next in 4 days");
eq(D.grade({ w: "x", b: 4 }, false, 0).b, 0, "grade down to box 0");
eq(D.nextCard([{ w: "a", d: "1", b: 2, n: 5 }, { w: "b", d: "2", b: 0, n: 99 }, { w: "c", d: "3", b: 1, n: 1 }], 10).w, "c", "due cards first, lowest box");
var qq = D.quiz([{ w: "torsion", d: "Twisting; torsional force", p: "noun" }], 7);
eq(qq.options.length, 4, "quiz has 4 options (pads from the word-of-the-day list)");
eq(qq.options[qq.answer], "torsion", "quiz answer index");
ok(qq.def.indexOf("torsion") < 0, "the word is blanked in the clue");

// word of the day
var w1 = D.wordOfDay(new Date(2026, 9, 27)), w2 = D.wordOfDay(new Date(2026, 9, 27, 23, 59));
eq(w1, w2, "same word all day");
var seen = {};
for (var i = 0; i < D.WOTD.length; i++) seen[D.wordOfDay(new Date(2026, 0, 1 + i)).w] = 1;
eq(Object.keys(seen).length, D.WOTD.length, "every word once per cycle");
ok(D.WOTD.every(function (x) { return x[0] && x[1] && x[2] && x[2].length < 160; }), "every word of the day has a short meaning");
var dup = {}; D.WOTD.forEach(function (x) { dup[x[0]] = (dup[x[0]] || 0) + 1; });
ok(Object.keys(dup).every(function (k) { return dup[k] === 1; }), "no duplicate words of the day");

// read aloud + copy text
var sp = D.speechParts(t);
eq(sp[0], { text: "torsion.", id: "w" }, "speech starts with the word");
ok(sp.some(function (p) { return p.id === "s0-1"; }), "speech ids match the page's sense ids");
ok(/Source: Wiktionary \(CC BY-SA 4\.0\)/.test(D.plainText(t)), "copied text credits Wiktionary");
eq(D.trDefault("vi-VN"), "vi", "translate language from the browser");
eq(D.trDefault("en-US"), "es", "English browser -> Spanish");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
