// node tool_apps_src/typing-transcribe-tests.js
const assert = require('assert');
const TC = require('./typing-test-transcribe/lib.js');
let n = 0; const t = (name, f) => { f(); n++; };
t('norm lenient/strict', () => {
  assert.strictEqual(TC.norm("Hello, World! It’s 9 o'clock.", false), "hello world it's 9 o'clock");
  assert.strictEqual(TC.norm("  Hello,   World ", true), "Hello, World");
  assert.deepStrictEqual(TC.words("", false), []);
});
t('editDistance', () => { assert.strictEqual(TC.editDistance("kitten", "sitting"), 3); assert.strictEqual(TC.editDistance("", "abc"), 3); assert.strictEqual(TC.editDistance("abc", "abc"), 0); });
t('align: ok / sub / del / ins', () => {
  const ops = TC.alignWords(["the", "cat", "sat", "down"], ["the", "bat", "sat", "on", "down"]);
  assert.deepStrictEqual(ops.map((o) => o.t), ["ok", "sub", "ok", "ins", "ok"]);
  assert.deepStrictEqual(TC.alignWords(["a", "b", "c"], ["a", "c"]).map((o) => o.t), ["ok", "del", "ok"]);
  assert.deepStrictEqual(TC.alignWords([], ["x"]).map((o) => o.t), ["ins"]);
});
t('score: perfect, lenient punctuation, strict', () => {
  const said = "The meeting began at nine o'clock.";
  let r = TC.score(said, "the meeting began at nine o'clock", false, 0.5); assert.strictEqual(r.acc, 100); assert.strictEqual(r.wrong + r.missed + r.extra, 0);
  assert.ok(Math.abs(r.wpm - (said.replace(/[^a-z' ]/gi, "").length / 5) / 0.5) < 3);
  r = TC.score(said, "the meeting began at nine o'clock", true, 0.5); assert.ok(r.acc < 100);
  r = TC.score("one two three four", "one two thre four", false, 1); assert.strictEqual(r.wrong, 1); assert.ok(r.acc > 90 && r.acc < 100);
  r = TC.score("one two three four", "", false, 1); assert.strictEqual(r.acc, 0); assert.strictEqual(r.wpm, 0); assert.strictEqual(r.missed, 4);
});
t('chunkify', () => {
  const text = "Thank you all for coming. The first item on the agenda is the budget, which the finance team has prepared.";
  const c5 = TC.chunkify(text, 5); assert.strictEqual(c5.map((c) => c.text).join(" "), text); assert.strictEqual(c5.reduce((a, c) => a + c.words, 0), 20);
  assert.ok(c5.every((c) => c.words <= 5)); assert.strictEqual(c5[0].start, 0); assert.strictEqual(c5[1].start, c5[0].words);
  const s = TC.chunkify(text, 0); assert.strictEqual(s.length, 2); assert.strictEqual(s[0].text, "Thank you all for coming.");
  assert.deepStrictEqual(TC.chunkify("", 3), []);
});
t('pace', () => {
  assert.strictEqual(TC.rateFor(150), 1); assert.strictEqual(TC.rateFor(60), 0.8); assert.strictEqual(TC.rateFor(300), 1.6);
  assert.strictEqual(TC.gapAfter(5, 100, 1000), 2000); assert.strictEqual(TC.gapAfter(5, 400, 1500), 250);
});
t('passages and words', () => {
  TC.LENGTHS.forEach((l) => TC.PASSAGES[l].forEach((p) => { const w = p.split(/\s+/).length; assert.ok(l === "short" ? w >= 15 && w <= 45 : l === "medium" ? w >= 40 && w <= 90 : w >= 90 && w <= 180, l + " " + w); }));
  const p = TC.passageFor("medium", "abc"); assert.strictEqual(TC.passageFor("medium", "abc", p) === p, false);
  assert.strictEqual(TC.randomWords(10, "easy", "s1").split(" ").length, 10); assert.strictEqual(TC.randomWords(10, "easy", "s1"), TC.randomWords(10, "easy", "s1"));
});
console.log('typing transcribe: ' + n + ' groups passed');
