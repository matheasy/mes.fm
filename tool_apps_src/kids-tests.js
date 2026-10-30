// node tool_apps_src/kids-tests.js  -- MES Kids (tool_apps_src/kids/lib.js)
"use strict";
const K = require("./kids/lib.js"), fs = require("fs"), path = require("path");
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }

// data
const ids = new Set();
K.ITEMS.forEach(it => { ok(!ids.has(it.id), "unique id " + it.id); ids.add(it.id); ok(it.word && it.pic, "word + pic " + it.id); ok(K.CATS.some(c => c.id === it.cat), "known cat " + it.id); });
ok(K.ITEMS.filter(i => i.cat === "letters").length === 26, "26 letters");
ok(K.ITEMS.filter(i => i.cat === "numbers").length === 20, "20 numbers");
for (const m in K.MODES) K.MODES[m].cats.forEach(c => ok(K.CATS.some(x => x.id === c), "mode cat " + m + c));

// every recording: file on disk, mp3, small, credited with a free licence; every animal with a recording points at a real entry
const SND = path.join(__dirname, "..", "mes.fm", "kids", "sounds");
for (const k in K.SOUNDS) {
	const s = K.SOUNDS[k], f = path.join(SND, k + ".mp3");
	ok(fs.existsSync(f), "sound file " + k);
	if (fs.existsSync(f)) { const b = fs.readFileSync(f); ok(b.length > 2000 && b.length < 80000, "sound size " + k + " " + b.length); ok(b[0] === 0x49 || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), "mp3 header " + k); }
	ok(/^(Public domain|CC0)$/.test(s[3]), "free licence " + k);
	ok(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(s[1]), "commons page " + k);
	ok(K.ITEMS.some(i => i.snd === k), "sound used " + k);
}
fs.readdirSync(SND).forEach(f => ok(K.SOUNDS[f.replace(/\.mp3$/, "")], "no stray sound file " + f));
K.ITEMS.forEach(it => { if (it.snd) { ok(K.SOUNDS[it.snd], "snd entry " + it.id); ok(K.soundFor(it) === "/kids/sounds/" + it.snd + ".mp3", "soundFor " + it.id); ok(it.sw, "sound word " + it.id); } });
ok(K.soundFor(K.BY_ID["animals:cow"]) === "", "cow has no recording");

// decks
ok(K.deck("animals").every(id => K.hasSound(K.BY_ID[id])), "animal page only has animals with a sound");
ok(K.deck("animals").length === 33, "33 animals with a sound: " + K.deck("animals").length);
ok(K.deck("abc").length === 26 && K.deck("abc")[0] === "letters:a", "abc deck in order");
ok(K.deck("numbers", null, { maxNum: 5 }).length === 5 && K.deck("numbers", null, { maxNum: 20 }).length === 20, "numbers capped");
ok(K.deck("shapes", ["colours"]).every(id => id.startsWith("colours:")), "shapes page colours only");
ok(K.deck("shapes", ["letters"]).length === K.deck("shapes").length, "a category the page doesn't allow falls back to the default");
ok(K.deck("cards", ["food", "vehicles"]).every(id => /^(food|vehicles):/.test(id)), "flashcards chosen cats");

// shuffle / reshuffle / step
const r = K.rng(42), arr = Array.from({ length: 30 }, (_, i) => i), sh = K.shuffle(arr, r);
ok(sh.length === 30 && sh.slice().sort((a, b) => a - b).join() === arr.join(), "shuffle is a permutation");
ok(sh.join() !== arr.join(), "shuffle changes the order");
ok(K.shuffle(arr, K.rng(7)).join() === K.shuffle(arr, K.rng(7)).join(), "seeded shuffle repeatable");
for (let s = 0; s < 50; s++) ok(K.reshuffle(arr, 5, K.rng(s))[0] !== 5, "reshuffle avoids the current card");
ok(K.step(0, -1, 5) === 4 && K.step(4, 1, 5) === 0 && K.step(2, 1, 0) === 0, "step wraps");

// quiz
for (let s = 0; s < 300; s++) {
	const pool = K.deck(s % 2 ? "cards" : "shapes"), id = pool[s % pool.length], nn = 2 + (s % 3);
	const ch = K.quizChoices(id, pool, nn, K.rng(s));
	ok(ch.length === nn, "quiz size " + id);
	ok(ch.indexOf(id) >= 0, "quiz contains answer " + id);
	ok(new Set(ch).size === ch.length, "quiz distinct " + id);
	ok(new Set(ch.map(x => K.BY_ID[x].word.toLowerCase())).size === ch.length, "quiz distinct words " + id);
	ok(new Set(ch.map(x => K.BY_ID[x].pic)).size === ch.length, "quiz distinct pictures " + id);
}
// same category preferred
const cq = K.quizChoices("animals:dog", K.deck("cards"), 3, K.rng(1));
ok(cq.every(x => x.startsWith("animals:")), "quiz picks from the same category first");
// tiny pool still gets enough choices
ok(K.quizChoices("numbers:1", ["numbers:1", "numbers:2"], 3, K.rng(3)).length === 3, "quiz fills from outside a small pool");
// orange the colour vs orange the fruit never together
for (let s = 0; s < 100; s++) { const c = K.quizChoices("colours:orange", K.deck("cards", ["colours", "food"]), 4, K.rng(s)); ok(!c.includes("food:orange"), "no two oranges"); }

// words
ok(K.label(K.BY_ID["letters:b"], "title") === "Bb" && K.label(K.BY_ID["letters:b"], "upper") === "B" && K.label(K.BY_ID["letters:b"], "lower") === "b", "letter case");
ok(K.label(K.BY_ID["animals:cat"], "upper") === "CAT" && K.label(K.BY_ID["animals:cat"], "lower") === "cat" && K.label(K.BY_ID["things:teddy"], "title") === "Teddy bear", "word case");
ok(K.label(K.BY_ID["numbers:7"], "upper") === "7", "number label");
ok(K.speakText(K.BY_ID["letters:a"]) === "A. A is for apple.", "letter speech");
ok(K.speakText(K.BY_ID["numbers:3"], { count: true }) === "Three. One, two, three!", "counting speech");
ok(K.speakText(K.BY_ID["numbers:3"], { count: false }) === "Three.", "number speech");
ok(K.speakText(K.BY_ID["animals:cow"], { soundWord: true }) === "Cow. The cow says moo!", "animal sound speech");
ok(/Find the letter Q/.test(K.findPrompt(K.BY_ID["letters:q"])) && /Find blue/.test(K.findPrompt(K.BY_ID["colours:blue"])), "prompts");
ok(/Who says woof woof\? Find the dog/.test(K.findPrompt(K.BY_ID["animals:dog"])), "animal prompt");
ok(/Try again!$/.test(K.gentle(K.BY_ID["food:apple"])) && /That's the apple/.test(K.gentle(K.BY_ID["food:apple"])), "gentle wrong answer");
ok(/That's the pig\.$/.test(K.praise(K.BY_ID["animals:pig"], K.rng(1))), "praise");
ok(K.keyToId("c", K.deck("abc")) === "letters:c" && K.keyToId("0", K.deck("numbers")) === "numbers:10" && K.keyToId("x", K.deck("numbers")) === "", "typed keys jump");

// voices
const V = [{ name: "Zarvox", lang: "en-US", localService: true }, { name: "Samantha", lang: "en-US", localService: true }, { name: "Thomas", lang: "fr-FR", localService: true }, { name: "Google UK English Female", lang: "en-GB", localService: false }, { name: "Anna", lang: "de-DE", localService: true }];
ok(K.pickVoice(V, "en-US").name === "Samantha", "default voice skips novelty voices");
ok(K.pickVoice(V, "fr-CA").name === "Thomas", "browser language first");
ok(K.pickVoice(V, "ja-JP").name === "Samantha", "falls back to English");
ok(K.filterVoices(V, "uk female").length === 1 && K.filterVoices(V, "fr").length === 1 && K.filterVoices(V, "online").length === 1 && K.filterVoices(V, "").length === 5, "voice search");

// settings
const c = K.clean({ rate: 9, pitch: "x", lcase: "weird", maxNum: 7, adv: 6, quizN: 4, cats: { cards: ["food", "nope"], abc: "x" }, auto: false, voice: 5 });
ok(c.rate === 1.5 && c.pitch === K.DEFAULTS.pitch && c.lcase === "title" && c.maxNum === 10 && c.adv === 6 && c.quizN === 4, "clean numbers");
ok(c.cats.cards.join() === "food" && !c.cats.abc && c.auto === false && c.voice === "", "clean cats + flags");
ok(K.clean(null).rate === 0.8, "slower default speech rate");

ok(K.orderFor(K.clean({}), "abc") === "order" && K.orderFor(K.clean({}), "cards") === "shuffle" && K.orderFor(K.clean({ ord: { abc: "shuffle", x: "order" } }), "abc") === "shuffle", "order per page");

console.log(bad ? bad + " of " + n + " checks FAILED" : "all " + n + " checks passed");
process.exit(bad ? 1 : 0);
