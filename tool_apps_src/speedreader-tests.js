/* Unit tests for the pure logic of mes.fm/speedreader (tool_apps_src/speedreader/lib.js).
 * Run: node tool_apps_src/speedreader-tests.js
 */
"use strict";
var assert = require("assert");
var L = require("./speedreader/lib.js");
var passed = 0;
function t(name, fn) { try { fn(); passed++; } catch (e) { console.error("FAIL: " + name + "\n  " + (e && e.stack || e)); process.exitCode = 1; } }

t("cleanText normalises whitespace, keeps paragraph breaks", function () {
	assert.strictEqual(L.cleanText("  a  b \r\n\r\n\r\n\r\n c​ d  "), "a b\n\nc d");
});

t("htmlToText strips tags/scripts and decodes entities", function () {
	var h = "<html><head><title>x</title><style>p{}</style></head><body><h1>Hi &amp; bye</h1><p>One&nbsp;two&#33;</p><script>alert(1)</script><p>Three &#x41;</p></body></html>";
	assert.strictEqual(L.htmlToText(h), "Hi & bye\n\nOne two!\n\nThree A");
});

t("markdownToText keeps words, drops markup", function () {
	var s = L.markdownToText("# Title\n\nSome **bold** and *it* and [a link](http://x.y) `code`.\n\n- item one\n> quote");
	assert.ok(/^Title/.test(s) && s.indexOf("bold") > 0 && s.indexOf("http") < 0 && s.indexOf("**") < 0 && s.indexOf("item one") > 0);
});

t("tokenize: offsets point at the words", function () {
	var tk = L.tokenize("Alice was  tired.\n\nShe left.");
	assert.deepStrictEqual(tk.words.map(function (w) { return w.w; }), ["Alice", "was", "tired.", "She", "left."]);
	tk.words.forEach(function (w) { assert.strictEqual(tk.text.slice(w.s, w.e), w.w); });
	assert.ok(tk.words[2].para && tk.words[2].sent);
	assert.ok(!tk.words[0].para && !tk.words[1].sent);
	assert.ok(tk.words[4].para);
});

t("tokenize: sentence ends vs abbreviations, initials, quotes", function () {
	var tk = L.tokenize("Mr. Bennet met J. Smith. “Why?” she asked. It cost 3.5 dollars! Done.");
	var ends = tk.words.filter(function (w) { return w.sent; }).map(function (w) { return w.w; });
	assert.deepStrictEqual(ends, ["Smith.", "asked.", "dollars!", "Done."]);
	assert.deepStrictEqual(tk.sentStarts.map(function (i) { return tk.words[i].w; }), ["Mr.", "“Why?”", "It", "Done."]);
});

t("tokenize: em dashes split words", function () {
	var tk = L.tokenize("never—never mind—really");
	assert.deepStrictEqual(tk.words.map(function (w) { return w.w; }), ["never—", "never", "mind—", "really"]);
});

t("tokenize: empty and whitespace input", function () {
	assert.strictEqual(L.tokenize("").words.length, 0);
	assert.strictEqual(L.tokenize(" \n \t ").words.length, 0);
	assert.strictEqual(L.countWords(" a  b\nc "), 3);
});

t("sentence navigation", function () {
	var tk = L.tokenize("One two three. Four five. Six seven eight nine.");
	var st = tk.sentStarts; // 0, 3, 5
	assert.deepStrictEqual(st, [0, 3, 5]);
	assert.strictEqual(L.nextSentenceStart(st, 0, 9), 3);
	assert.strictEqual(L.nextSentenceStart(st, 4, 9), 5);
	assert.strictEqual(L.nextSentenceStart(st, 6, 9), 8);      // last sentence -> last word
	assert.strictEqual(L.prevSentenceStart(st, 4), 3);         // inside a sentence -> its start
	assert.strictEqual(L.prevSentenceStart(st, 3), 0);         // at a start -> previous start
	assert.strictEqual(L.prevSentenceStart(st, 0), 0);
});

t("orpIndex follows the word length and skips leading punctuation", function () {
	assert.strictEqual(L.orpIndex("a"), 0);
	assert.strictEqual(L.orpIndex("the"), 1);
	assert.strictEqual(L.orpIndex("quick"), 1);
	assert.strictEqual(L.orpIndex("reading"), 2);
	assert.strictEqual(L.orpIndex("remarkable"), 3);
	assert.strictEqual(L.orpIndex("internationalization"), 4);
	assert.strictEqual(L.orpIndex("“quick"), 2);         // opening quote shifts the index by one
	assert.strictEqual(L.orpIndex("“"), 0);
	assert.strictEqual(L.orpIndex("—"), 0);
	for (var w of ["a", "it", "“hello,”", "x-ray", "...", "100%", "über"]) { var k = L.orpIndex(w); assert.ok(k >= 0 && k < w.length, w); }
});

t("makeChunks never crosses a sentence and covers every word once", function () {
	var tk = L.tokenize("One two three four five. Six seven eight. Nine.");
	var c = L.makeChunks(tk.words, 2);
	assert.deepStrictEqual(c.map(function (x) { return x.text; }), ["One two", "three four", "five.", "Six seven", "eight.", "Nine."]);
	var total = 0; c.forEach(function (x, i) { total += x.b - x.a; if (i) assert.strictEqual(x.a, c[i - 1].b); });
	assert.strictEqual(total, tk.words.length);
	assert.strictEqual(L.makeChunks(tk.words, 1).length, tk.words.length);
	assert.strictEqual(L.chunkAt(c, 3), 1);
	assert.strictEqual(L.chunkAt(c, 4), 2);
	assert.strictEqual(L.chunkAt(c, 5), 3);
	assert.strictEqual(L.chunkAt(c, 99), c.length - 1);
});

t("timeline: plain pacing is exactly 60000/wpm per word", function () {
	var tk = L.tokenize("one two three four five six seven eight nine ten.");
	var c = L.makeChunks(tk.words, 1);
	var cum = L.buildTimeline(c, tk.words, { wpm: 600, smart: false, ramp: false });
	assert.ok(Math.abs(cum[c.length] - 10 * 100) < 1e-6);
	var cum3 = L.buildTimeline(L.makeChunks(tk.words, 3), tk.words, { wpm: 300, smart: false });
	assert.ok(Math.abs(cum3[cum3.length - 1] - 10 * 200) < 1e-6);
	assert.ok(Math.abs(L.delayOf(cum, 0) - 100) < 1e-6);
});

t("timeline: smart pacing slows sentence ends, commas, long words, numbers", function () {
	var tk = L.tokenize("Hello, big world. The extraordinarily large number 2024 arrived.\n\nNew.");
	var c = L.makeChunks(tk.words, 1);
	function f(i) { return L.pauseFactor(c[i], tk.words, true); }
	assert.strictEqual(L.pauseFactor(c[0], tk.words, false), 1);
	assert.ok(f(0) > 1 && f(0) < 1.6);                          // "Hello,"
	assert.strictEqual(f(1), 1);                                // "big"
	assert.ok(f(2) >= 2);                                       // "world." sentence end
	var idx = tk.words.map(function (w) { return w.w; });
	assert.ok(L.pauseFactor(c[idx.indexOf("extraordinarily")], tk.words, true) > 1.2);
	assert.ok(L.pauseFactor(c[idx.indexOf("2024")], tk.words, true) > 1.2);
	assert.ok(L.pauseFactor(c[idx.indexOf("arrived.")], tk.words, true) > f(2));   // paragraph end is the longest
	var plain = L.buildTimeline(c, tk.words, { wpm: 300, smart: false })[c.length];
	var smart = L.buildTimeline(c, tk.words, { wpm: 300, smart: true })[c.length];
	assert.ok(smart > plain);
});

t("timeline: slow start eases in and then does nothing", function () {
	var tk = L.tokenize(Array(40).join("word ") + "end");
	var c = L.makeChunks(tk.words, 1);
	var base = L.buildTimeline(c, tk.words, { wpm: 300 });
	var ramp = L.buildTimeline(c, tk.words, { wpm: 300, ramp: true, rampChunks: 10, rampFrom: 2 });
	assert.ok(Math.abs(L.delayOf(ramp, 0) - 2 * L.delayOf(base, 0)) < 1e-6);
	assert.ok(L.delayOf(ramp, 5) < L.delayOf(ramp, 0) && L.delayOf(ramp, 5) > L.delayOf(base, 5));
	assert.ok(Math.abs(L.delayOf(ramp, 10) - L.delayOf(base, 10)) < 1e-6);
	assert.strictEqual(L.rampFactor(0, 0, 2), 1);
});

t("clampWpm", function () {
	assert.strictEqual(L.clampWpm(5), 60); assert.strictEqual(L.clampWpm(99999), 1500);
	assert.strictEqual(L.clampWpm("350"), 350); assert.strictEqual(L.clampWpm("abc"), 300); assert.strictEqual(L.clampWpm(250.6), 251);
});

t("durations", function () {
	assert.strictEqual(L.formatDuration(45000), "45 s");
	assert.strictEqual(L.formatDuration(192000), "3 min 12 s");
	assert.strictEqual(L.formatDuration(125 * 60000), "2 h 05 min");
	assert.strictEqual(L.formatDuration(-5), "0 s");
	assert.strictEqual(L.clock(65000), "1:05");
	assert.strictEqual(L.readingMs(238, 238), 60000);
	assert.strictEqual(L.wpmFromTime(300, 60000), 300);
	assert.strictEqual(L.wpmFromTime(300, 0), 0);
});

t("speechChunk: sentence groups, offsets, long sentences", function () {
	var tk = L.tokenize("Short one. Another short sentence here. A third.\n\nNext paragraph starts. It goes on.");
	var out = [], from = 0, ch;
	while ((ch = L.speechChunk(tk.words, tk.text, from, 60))) { out.push(ch); from = ch.b; }
	assert.strictEqual(out[0].a, 0);
	assert.strictEqual(out[out.length - 1].b, tk.words.length);
	out.forEach(function (c, i) {
		if (i) assert.strictEqual(c.a, out[i - 1].b);
		assert.strictEqual(tk.text.slice(c.start, c.end).replace(/\s*\n\s*/g, " "), c.text);
		assert.ok(c.text.indexOf("\n") < 0);
	});
	// a paragraph break always ends an utterance
	assert.ok(out.some(function (c) { return /A third\.$/.test(c.text); }));
	// a very long sentence is cut near maxLen, preferring a comma
	var long = L.tokenize("alpha beta gamma delta, epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega.");
	var c1 = L.speechChunk(long.words, long.text, 0, 60);
	assert.ok(c1.text.length <= 60 + 12 && c1.b < long.words.length);
	assert.strictEqual(L.speechChunk(long.words, long.text, long.words.length, 60), null);
	// starting in the middle
	var mid = L.speechChunk(tk.words, tk.text, 2, 220);
	assert.strictEqual(mid.a, 2); assert.ok(mid.text.indexOf("Another") === 0);
});

t("wordAtChar maps speech boundary offsets to words", function () {
	var tk = L.tokenize("The quick brown fox.");
	assert.strictEqual(L.wordAtChar(tk.words, 0), 0);
	assert.strictEqual(L.wordAtChar(tk.words, 2), 0);
	assert.strictEqual(L.wordAtChar(tk.words, 3), 1);      // the space belongs to the next word
	assert.strictEqual(L.wordAtChar(tk.words, 4), 1);
	assert.strictEqual(L.wordAtChar(tk.words, 10), 2);
	assert.strictEqual(L.wordAtChar(tk.words, 999), tk.words.length - 1);
	// offset inside a speech chunk -> add chunk.start
	var big = L.tokenize("One two three four five six. Seven eight nine ten.");
	var ch = L.speechChunk(big.words, big.text, 6, 220);
	assert.strictEqual(big.words[L.wordAtChar(big.words, ch.start + ch.text.indexOf("nine"))].w, "nine");
});

t("speech estimate scales with rate and punctuation", function () {
	assert.ok(L.speechDelay("word", 2) < L.speechDelay("word", 1));
	assert.ok(L.speechDelay("word.", 1) > L.speechDelay("word", 1) + 300);
	assert.ok(L.speechDelay("a", 1) < L.speechDelay("internationalization", 1));
	var tk = L.tokenize("one two three four five six seven eight nine ten");
	var wpm = 10 / (L.speechEstimateMs(tk.words, 0, 10, 1) / 60000);
	assert.ok(wpm > 110 && wpm < 220, "estimated wpm " + wpm);
});

t("detectLang", function () {
	assert.strictEqual(L.detectLang("It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife."), "en");
	assert.strictEqual(L.detectLang("El perro y el gato están en la casa con los niños que no quieren salir por la lluvia."), "es");
	assert.strictEqual(L.detectLang("Le chat est sur la table et il mange le poisson que les enfants ont laissé pour sa famille."), "fr");
	assert.strictEqual(L.detectLang("Der Hund und die Katze sind in dem Haus und sie haben nicht auf den Regen gewartet, der von der Stadt kam."), "de");
	assert.strictEqual(L.detectLang("Москва столица России и крупнейший город"), "ru");
	assert.strictEqual(L.detectLang("これはペンです。私は学生です。"), "ja");
	assert.strictEqual(L.detectLang("今天天气很好，我们去公园玩吧"), "zh");
	assert.strictEqual(L.detectLang("xyzzy qwerty"), "");
	assert.strictEqual(L.detectLang(""), "");
});

t("pickVoice prefers the text language, then quality, then the browser language", function () {
	var v = [
		{ name: "Alex", lang: "en-US", "default": true, localService: true },
		{ name: "Google español", lang: "es-ES", localService: false },
		{ name: "Microsoft Jenny Online (Natural) - English (United States)", lang: "en-US", localService: false },
		{ name: "Bad News", lang: "en-US", localService: true },
		{ name: "Thomas", lang: "fr-FR", localService: true }
	];
	assert.strictEqual(L.pickVoice(v, "es", "en-US").name, "Google español");
	assert.strictEqual(L.pickVoice(v, "fr", "en-US").name, "Thomas");
	assert.ok(/Natural/.test(L.pickVoice(v, "en", "en-US").name));
	assert.strictEqual(L.pickVoice(v, "", "fr-CA").name, "Thomas");          // no text language: the browser's
	assert.strictEqual(L.pickVoice([], "en", "en"), null);
	assert.ok(L.voiceScore({ name: "Bad News", lang: "en-US" }, "en") < L.voiceScore({ name: "Alex", lang: "en-US" }, "en"));
});

t("params round-trip and reject junk", function () {
	var q = L.buildParams({ wpm: 450, chunk: 2, mode: "both" });
	assert.deepStrictEqual(L.parseParams("?" + q), { wpm: 450, chunk: 2, mode: "both" });
	assert.deepStrictEqual(L.parseParams("?wpm=5000&chunk=9&mode=evil"), { wpm: 1500 });
	assert.deepStrictEqual(L.parseParams(""), {});
	assert.ok(q.indexOf("text") < 0);
});

console.log(process.exitCode ? "FAILED" : "all " + passed + " tests passed");
