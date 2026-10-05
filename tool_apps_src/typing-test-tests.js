/* node tool_apps_src/typing-test-tests.js -- typing state machine + results maths */
const T = require("./typing-test/lib.js"), assert = require("assert");
let n = 0; function t(name, f) { f(); n++; }
function typeStr(s, str, t0, step) { let t = t0; for (const ch of str) { s.type(ch, t); t += step; } return t; }

t("seeded text is deterministic", () => {
	const a = T.makeGenerator({ diff: "medium" }, "abc")(30), b = T.makeGenerator({ diff: "medium" }, "abc")(30), c = T.makeGenerator({ diff: "medium" }, "abd")(30);
	assert.deepStrictEqual(a, b); assert.notDeepStrictEqual(a, c);
});
t("extending continues the same sequence", () => {
	const g1 = T.makeGenerator({ diff: "easy" }, "z"), g2 = T.makeGenerator({ diff: "easy" }, "z");
	assert.deepStrictEqual(g1(10).concat(g1(10)), g2(20));
});
t("difficulty flags: beginner is lowercase letters only, expert has punctuation / digits / capitals", () => {
	const b = T.makeGenerator({ diff: "beginner" }, "q")(200).join(" "); assert(/^[a-z ']+$/.test(b));
	const e = T.makeGenerator({ diff: "expert", punct: true, nums: true, caps: true }, "q")(300).join(" ");
	assert(/[0-9]/.test(e) && /[A-Z]/.test(e) && /[,.;:?!()"%$]/.test(e));
});
t("weak-letter filter only yields words containing a weak letter", () => {
	const w = T.makeGenerator({ diff: "easy", letters: ["z", "q"] }, "s")(40);
	w.forEach(x => assert(/[zq]/.test(x), x));
});
t("perfect typing: 60 chars in 12 s = 60 WPM, 100% accuracy", () => {
	const words = ["aaaa", "bbbb", "cccc", "dddd", "eeee", "ffff", "gggg", "hhhh", "iiii", "jjjj", "kkkk", "llll"];   // 12 x 4 + 11 spaces = 59, + final word
	const s = new T.Session(words, { endOnLast: true }); const str = words.join(" ");
	typeStr(s, str, 1000, 12000 / str.length);
	assert(s.finished);
	const r = T.result(s, s.end - s.start);
	assert(Math.abs(r.wpm - (str.length / 5) / ((s.end - s.start) / 60000)) < 0.01); assert.strictEqual(r.acc, 100); assert.strictEqual(r.chars.bad, 0);
});
t("a wrong word counts against accuracy and not against WPM", () => {
	const s = new T.Session(["cat", "dog", "bird"], { endOnLast: true });
	typeStr(s, "cxt dog bird", 0, 100);
	const r = T.result(s, s.end - s.start);
	assert(s.finished); assert.strictEqual(r.chars.bad, 1); assert(r.acc < 100 && r.acc > 85); assert.strictEqual(r.wordsDone, 2);
	assert(r.wpm < r.raw);
});
t("corrected mistakes still cost accuracy", () => {
	const s = new T.Session(["hello", "world"], { endOnLast: true });
	typeStr(s, "helo", 0, 100); s.backspace(); typeStr(s, "lo world", 500, 100);
	const r = T.result(s, s.end - s.start);
	assert(s.finished); assert.strictEqual(r.chars.bad, 0); assert(r.acc < 100);
});
t("strict mode refuses wrong letters and early spaces", () => {
	const s = new T.Session(["cat", "dog"], { strict: true, endOnLast: true });
	assert.strictEqual(s.type("x", 0), false); assert.strictEqual(s.cur, ""); s.type("c", 10); s.type("a", 20);
	assert.strictEqual(s.type(" ", 30), false); assert.strictEqual(s.cur, "ca"); assert.strictEqual(s.blocked, 2);
});
t("no-backspace option", () => { const s = new T.Session(["cat"], { backspace: false }); s.type("c", 0); assert.strictEqual(s.backspace(), false); assert.strictEqual(s.cur, "c"); });
t("backspace on an empty word returns to a wrong previous word only", () => {
	const s = new T.Session(["cat", "dog", "emu"], {});
	typeStr(s, "cxt ", 0, 50); assert.strictEqual(s.idx, 1); assert(s.backspace()); assert.strictEqual(s.idx, 0); assert.strictEqual(s.cur, "cxt");
	s.backspace(); s.backspace(); s.backspace(); typeStr(s, "cat ", 400, 50); assert.strictEqual(s.idx, 1); assert.strictEqual(s.backspace(), false);
});
t("extra and missed characters", () => {
	const s = new T.Session(["cat", "dogs"], { endOnLast: true });
	typeStr(s, "catss do ", 0, 50); s.type("g", 600); s.type("s", 650);
	const r = T.result(s, 700); assert.strictEqual(r.chars.extra, 2); assert.strictEqual(r.chars.missed, 2);
});
t("space on an empty word is ignored; typing after finish is ignored", () => {
	const s = new T.Session(["a"], { endOnLast: true }); assert.strictEqual(s.type(" ", 0), false); s.type("a", 10); assert(s.finished); assert.strictEqual(s.type("b", 20), false);
});
t("time mode: partial last word counts its correct prefix", () => {
	const s = new T.Session(["hello", "world"], {}); typeStr(s, "hello wor", 0, 100);
	const r = T.result(s, 60000); assert.strictEqual(Math.round(r.wpm * 5), 6 + 3);
});
t("consistency: steady = high, erratic = low", () => {
	assert(T.consistency([60, 61, 59, 60, 62, 58]) > 90); assert(T.consistency([10, 120, 5, 140, 20, 100]) < 50); assert.strictEqual(T.consistency([5, 5]), null);
});
t("per-key stats and weak letters", () => {
	const s = new T.Session(["zebra"], { endOnLast: true });
	typeStr(s, "xebra", 0, 100); const r = T.result(s, 500);
	assert.strictEqual(r.perKey.z.m, 1); const m = T.mergeKeys({}, r.perKey); T.mergeKeys(m, r.perKey); T.mergeKeys(m, r.perKey);
	assert.deepStrictEqual(T.weakLetters(m, 3).slice(0, 1), ["z"]);
});
t("ranks", () => { assert.strictEqual(T.rankFor(10).name, "Just starting"); assert.strictEqual(T.rankFor(41).name, "Average"); assert.strictEqual(T.rankFor(150).name, "Elite"); });
t("passages and custom text", () => {
	["short", "medium", "long"].forEach(l => assert(T.passageWords(l, "k").length >= 15));
	assert.deepStrictEqual(T.customWords("  Hi’s   “ok” \n there ", 10), ["Hi's", "\"ok\"", "there"]);
});
console.log(n + " groups passed");
