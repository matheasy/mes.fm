// node tool_apps_src/pronounce-tests.js -- MESPron (tool_apps_src/pronounce/lib.js) + the dictionary shards in mes.fm/pronounce/data
"use strict";
var P = require("./pronounce/lib.js"), fs = require("fs"), path = require("path");
var DATA = path.join(__dirname, "..", "mes.fm", "pronounce", "data");
var n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL", msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ": got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }
var shardCache = {};
function entry(w) { var k = P.shardOf(w); if (!shardCache[k]) shardCache[k] = JSON.parse(fs.readFileSync(path.join(DATA, k + ".json"), "utf8")); return shardCache[k][P.normWord(w)]; }
function first(w) { return P.forms(w, entry(w))[0]; }

// shards
eq(P.shardOf("Tomato"), "to", "shard of a word"); eq(P.shardOf("a"), "_", "one-letter words"); eq(P.shardOf("'em"), "_", "apostrophe words");
ok(fs.existsSync(path.join(DATA, "LICENSE-cmudict.txt")), "CMU licence ships with the data");
ok(/v=\d/.test(P.shardUrl("hello")), "shard url is versioned");
ok(entry("hello") && entry("pronunciation") && entry("a"), "common words are in the shards");
eq(P.parseEntry("A B|C").length, 2, "variants split on |");

// syllables, stress, IPA, respelling
var f = first("tomato");
eq(f.syls.length, 3, "tomato has 3 syllables"); eq(f.stress, [0, 1, 2], "tomato stress"); eq(f.ipa, "/təˈmeɪˌtoʊ/", "tomato US IPA"); eq(f.respell.join("-"), "tuh-MAY-toh", "tomato respelling");
var uk = P.forms("tomato", entry("tomato")).filter(function (x) { return x.uk; })[0];
ok(uk && uk.ipa === "/təˈmɑːtəʊ/", "tomato UK IPA " + (uk && uk.ipa));
eq(first("banana").respell.join("-"), "buh-NAN-uh", "a stressed short vowel keeps the next consonant");
eq(first("banana").ipa, "/bəˈnænə/", "…but the IPA stress mark is unchanged");
eq(first("strength").syls.length, 1, "strength: one syllable");
eq(P.syllabify("EH1 K S T R AH0".split(" ")).map(function (s) { return s.ph.join(" "); }), ["EH1 K", "S T R AH0"], "maximal onset keeps 'str' together");
eq(first("pronunciation").stress.indexOf(1), 3, "pronunciation stress on the 4th");
ok(/AY/.test(first("pronunciation").respell.join("-")), "pronunciation respelling has AY");
eq(first("yesterday").respell.join("-"), "YES-ter-day", "yesterday");
eq(first("the").ipa, "/ðə/", "one syllable: no stress mark");
eq(first("schedule").ipa, "/ˈskɛdʒʊl/", "schedule US");
ok(P.forms("schedule", entry("schedule")).some(function (x) { return x.uk && x.ipa === "/ˈʃɛdjuːl/"; }), "schedule UK");
eq(P.forms("quinoa", entry("quinoa"))[0].label, "Usual", "hand-written usual form comes first");
ok(P.legalOnset(["S", "T", "R"]) && !P.legalOnset(["N", "G"]) && !P.legalOnset(["T", "L"]), "legal onsets");
eq(P.phoneIpa("ER1"), "ɝ", "ER stressed US"); eq(P.phoneIpa("ER0", true), "ə", "ER unstressed UK"); eq(P.phoneIpa("OW1", true), "əʊ", "OW UK");

// heteronyms + noun/verb stress
var rec = P.forms("record", entry("record"));
ok(rec.some(function (x) { return /noun/.test(x.note); }) && rec.some(function (x) { return /verb/.test(x.note); }), "record: noun and verb");
var rd = P.forms("read", entry("read"));
ok(rd.some(function (x) { return /past/.test(x.note); }) && rd.some(function (x) { return /present/.test(x.note); }), "read: present and past");

// spelling breaks + estimates
eq(P.spellingBreaks("tomato", 3), ["to", "ma", "to"], "to·ma·to");
eq(P.spellingBreaks("apple", 2), ["ap", "ple"], "ap·ple");
eq(P.spellingBreaks("rocket", 2), ["rock", "et"], "rock·et");
eq(P.spellingBreaks("instrument", 3), ["in", "stru", "ment"], "in·stru·ment");
eq(P.spellingBreaks("single", 2), ["sin", "gle"], "sin·gle");
eq(P.spellingBreaks("fishcake", 2), ["fish", "cake"], "fish·cake");
eq(P.spellingBreaks("cat", 1), ["cat"], "one syllable");
eq(P.spellingBreaks("little", 2), ["lit", "tle"], "lit·tle"); eq(P.spellingBreaks("handle", 2), ["han", "dle"], "han·dle"); eq(P.spellingBreaks("blorptastic", 3), ["blorp", "tas", "tic"], "blorp·tas·tic"); eq(P.spellingBreaks("children", 2), ["chil", "dren"], "chil·dren");
[["table", 2], ["make", 1], ["jumped", 1], ["wanted", 2], ["beautiful", 3], ["blorptastic", 3], ["the", 1], ["idea", 3 - 0]].forEach(function (x) {
	var got = P.estimateSyllables(x[0]); ok(Math.abs(got - x[1]) <= (x[0] === "idea" ? 1 : 0), "estimate " + x[0] + " = " + got + " (want " + x[1] + ")");
});
eq(P.estimateSyllables("123"), 0, "digits: no syllables");
// the estimate against the dictionary on common words: at least 80% exact
var words = "about after again animal answer because before beautiful between brother building children different family father favourite garden happen important interesting little machine mother morning number people picture problem question remember second simple sister something special student teacher together tomorrow understand umbrella window yellow yesterday elephant computer chocolate banana tomato potato telephone holiday".split(" ");
var exact = words.filter(function (w) { var e = entry(w); return e && P.syllabify(e.split("|")[0].split(" ")).length === P.estimateSyllables(w); }).length;
ok(exact / words.filter(function (w) { return entry(w); }).length >= 0.8, "syllable estimate matches the dictionary on " + exact + " of " + words.length + " common words");
// every dictionary pronunciation of these words gives one syllable per vowel
words.forEach(function (w) { var e = entry(w); if (!e) return; e.split("|").forEach(function (p) { var ph = p.split(" "); eq(P.syllabify(ph).length, ph.filter(P.isVowel).length, "one syllable per vowel in " + w); eq(P.syllabify(ph).map(function (s) { return s.ph.join(" "); }).join(" "), p, "syllables keep every phone of " + w); }); });

// dictionaryapi.dev
var sample = [{ phonetic: "/həˈləʊ/", phonetics: [{ audio: "https://api.dictionaryapi.dev/media/pronunciations/en/hello-au.mp3", sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=75797336", license: { name: "BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0" } },
	{ text: "/həˈləʊ/", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3", sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=9021983", license: { name: "BY 3.0 US", url: "https://creativecommons.org/licenses/by/3.0/us" } },
	{ text: "/həˈloʊ/", audio: "" }, { text: "/x/", audio: "javascript:alert(1)" }], meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A greeting." }] }] }];
var api = P.parseDictApi(sample);
eq(api.audio.map(function (a) { return a.accent; }), ["uk", "au"], "audio sorted, US/UK first; non-https dropped");
eq(api.audio[0].curid, "9021983", "Commons page id kept");
eq(api.ipas.map(function (x) { return x.ipa; }), ["/həˈləʊ/", "/həˈloʊ/", "/x/"], "IPA variants, de-duplicated");
eq(api.meanings[0].pos, "noun", "meanings"); eq(P.parseDictApi({ title: "No Definitions Found" }).audio.length, 0, "a 404 answer");
eq(P.commonsMp3("https://upload.wikimedia.org/wikipedia/commons/4/48/En-uk-hello.ogg?utm_source=x"), "https://upload.wikimedia.org/wikipedia/commons/transcoded/4/48/En-uk-hello.ogg/En-uk-hello.ogg.mp3", "Commons transcoded MP3");
eq(P.commonsMp3("https://evil.example/4/48/x.ogg"), "", "only Commons URLs");

// accents
eq(P.accentOf("en-GB", "Daniel"), "uk", "en-GB"); eq(P.accentOf("en-GB", "Fiona"), "scot", "Fiona = Scotland"); eq(P.accentOf("en_IN", "Rishi"), "in", "underscore lang");
eq(P.accentOf("en-US", "Samantha"), "us", "US"); eq(P.accentOf("fr-FR", "Thomas"), "", "not English"); eq(P.accentOf("en-JM", "x"), "en", "other English");
ok(P.accentIsUk("uk") && P.accentIsUk("au") && !P.accentIsUk("us") && !P.accentIsUk("ca"), "which accents use the UK forms");

ok(P.isNovelty("Bahh") && P.isNovelty("Bad News") && !P.isNovelty("Samantha") && !P.isNovelty("Daniel"), "novelty voices");
// text, practice, links
var tk = P.tokens("Don't panic, it's fine.");
eq(tk.filter(function (t) { return t.word; }).map(function (t) { return t.key; }), ["don't", "panic", "it's", "fine"], "tokens keep apostrophes");
ok(P.isSentence("How are you?") && !P.isSentence("hello!"), "sentence or word");
eq(P.fallbacks("dog's")[0], ["dog", "Z"], "possessive fallback");
ok(P.heardMatch("Tomato", ["tomato"]).ok, "heard match ignores case"); ok(!P.heardMatch("tomato", ["potato"]).ok, "wrong word");
eq(P.heardMatch("how are you", ["how are ewe", "How are you?"]).i, 1, "matches the second alternative");
var q = P.parseQuery("?q=" + encodeURIComponent("either") + "&accent=uk&rate=0.8&x=<b>");
eq([q.q, q.accent, q.rate], ["either", "uk", 0.8], "query"); eq(P.parseQuery("?accent=<x>&rate=9").accent, undefined, "bad accent dropped");
eq(P.buildQuery({ q: "hi there", accent: "us", rate: 1 }), "q=hi+there&accent=us", "build query");
eq(P.addRecent(["a", "B"], "b", 3), ["b", "a"], "recent: moved to the front, case-insensitive");
ok(P.COMMON.length >= 40 && P.COMMON.every(function (c) { return c[1]; }), "commonly mispronounced list");
// every hand-written form only uses known phones
Object.keys(P.EXTRA).forEach(function (w) { P.EXTRA[w].forEach(function (e) { e[1].split(" ").forEach(function (ph) { ok(P.GUIDE[ph.replace(/\d$/, "")], "known phone " + ph + " in " + w); }); }); });

console.log((bad ? bad + " FAILED of " : "all ") + n + " checks" + (bad ? "" : " passed"));
process.exit(bad ? 1 : 0);
