/* Copy Text sync logic (tool_apps_src/copy-text/lib.js): plan(), merge3(), fileText()/parseFile(). Run: node tool_apps_src/copy-text-sync-tests.js */
"use strict";
const assert = require("assert");
const CT = require("./copy-text/lib.js");
let n = 0; const t = (name, f) => { f(); n++; };
const S = (...boards) => ({ v: 1, boards: boards.map(([name, ...notes]) => ({ name, notes: notes.map((x) => typeof x === "string" ? { title: "", text: x } : x) })) });
const texts = (s, b = 0) => s.boards[b].notes.map((x) => x.text);

t("plan", () => {
	assert.strictEqual(CT.plan("a", "a", null), "push");
	assert.strictEqual(CT.plan("a", "b", "b"), "same");
	assert.strictEqual(CT.plan(null, "a", "b"), "merge");
	assert.strictEqual(CT.plan("a", "b", "a"), "push");
	assert.strictEqual(CT.plan("a", "a", "c"), "pull");
	assert.strictEqual(CT.plan("a", "b", "c"), "merge");
});
t("sig ignores ids and ui state, notices order + text", () => {
	const a = CT.snapshot({ boards: [{ id: "x", name: "B", notes: [{ id: "1", text: "a" }, { id: "2", text: "b" }] }], cur: "x" });
	const b = CT.snapshot({ boards: [{ id: "y", name: "B", notes: [{ id: "9", text: "a" }, { id: "8", text: "b" }] }], cur: "q" });
	assert.strictEqual(CT.sig(a), CT.sig(b));
	const c = CT.snapshot({ boards: [{ name: "B", notes: [{ text: "b" }, { text: "a" }] }] });
	assert.notStrictEqual(CT.sig(a), CT.sig(c));
});
t("file round trip + plain backup accepted", () => {
	const s = S(["Work", "one", { title: "T", text: "two", c: "y", pin: 1 }]);
	const f = CT.parseFile(CT.fileText(s, "dev1", 123));
	assert.strictEqual(f.saved, 123); assert.strictEqual(f.dev, "dev1");
	assert.strictEqual(CT.sig(f.data), CT.sig(s));
	assert.strictEqual(CT.parseFile(JSON.stringify(s)).data.boards[0].notes.length, 2);
	assert.strictEqual(CT.parseFile(""), null);
	assert.throws(() => CT.parseFile('{"x":1}'));
});
t("merge: adds on both sides kept", () => {
	const base = S(["B", "a"]), l = S(["B", "a", "local"]), r = S(["B", "a", "remote"]);
	assert.deepStrictEqual(texts(CT.merge3(base, l, r)).sort(), ["a", "local", "remote"]);
});
t("merge: delete here wins over untouched remote", () => {
	const base = S(["B", "a", "b"]), l = S(["B", "a"]), r = S(["B", "a", "b", "c"]);
	assert.deepStrictEqual(texts(CT.merge3(base, l, r)), ["a", "c"]);
});
t("merge: delete on the other side wins", () => {
	const base = S(["B", "a", "b"]), l = S(["B", "a", "b", "new"]), r = S(["B", "b"]);
	assert.deepStrictEqual(texts(CT.merge3(base, l, r)).sort(), ["b", "new"]);
});
t("merge: edit = delete old + add new", () => {
	const base = S(["B", "a", "b"]), l = S(["B", "a", "b edited"]), r = S(["B", "a", "b", "z"]);
	assert.deepStrictEqual(texts(CT.merge3(base, l, r)).sort(), ["a", "b edited", "z"]);
});
t("merge: colour changed here kept", () => {
	const base = S(["B", "a"]), l = S(["B", { text: "a", c: "g" }]), r = S(["B", "a", "x"]);
	assert.strictEqual(CT.merge3(base, l, r).boards[0].notes.find((x) => x.text === "a").c, "g");
});
t("merge: boards", () => {
	const base = S(["A", "1"], ["B", "2"]);
	const l = S(["A", "1"], ["New", "n"]);             // B deleted here
	const r = S(["A", "1"], ["B", "2"], ["Other", "o"]); // Other added there
	const m = CT.merge3(base, l, r);
	assert.deepStrictEqual(m.boards.map((b) => b.name).sort(), ["A", "New", "Other"]);
	// B deleted here but the other side added to it: kept
	const r2 = S(["A", "1"], ["B", "2", "3"]);
	assert.ok(CT.merge3(base, l, r2).boards.some((b) => b.name === "B"));
});
t("merge: first sync (no base) = union, no duplicates", () => {
	const m = CT.merge3(null, S(["B", "a", "b"]), S(["B", "b", "c"], ["C", "x"]));
	assert.deepStrictEqual(texts(m).sort(), ["a", "b", "c"]);
	assert.strictEqual(m.boards.length, 2);
});
t("merge is stable: merging the result again changes nothing", () => {
	const base = S(["B", "a", "b"]), l = S(["B", "a", "l"]), r = S(["B", "b", "r"]);
	const m = CT.merge3(base, l, r);
	assert.strictEqual(CT.sig(CT.merge3(m, m, m)), CT.sig(m));
	assert.strictEqual(CT.plan(CT.sig(m), CT.sig(m), CT.sig(m)), "same");
});
t("fromSnap keeps the open board", () => {
	let i = 0; const uid = () => "id" + (i++);
	const st = { boards: [{ id: "q", name: "Work", notes: [] }], cur: "q" };
	const ns = CT.fromSnap(S(["Home", "h"], ["Work", "w"]), st, uid);
	assert.strictEqual(ns.boards.find((b) => b.id === ns.cur).name, "Work");
});
t("ago", () => {
	assert.strictEqual(CT.ago(1000, 2000), "just now");
	assert.strictEqual(CT.ago(0, 120000), "2 minutes ago");
	assert.strictEqual(CT.ago(0, 3 * 86400000), "3 days ago");
});
t("which boards are backed up", function () {
	var full = { v: 1, boards: [{ name: "A", notes: [{ title: "", text: "a" }] }, { name: "B", notes: [{ title: "", text: "b" }] }] };
	var off = { B: 1 }, p = CT.pickBoards(full, off);
	assert.deepStrictEqual(p.boards.map(function (b) { return b.name; }), ["A"]); assert.strictEqual(p.part, 1);
	assert.strictEqual(CT.pickBoards(full, {}), full);
	var remote = { v: 1, boards: [{ name: "A", notes: [] }, { name: "B", notes: [{ title: "", text: "bR" }] }] };
	var local = CT.maskBoards(full, remote, off);
	assert.strictEqual(local.boards[1].notes[0].text, "bR", "the other copy of an unticked board is not touched");
	var back = CT.maskBoards(CT.merge3(remote, local, remote), full, off);
	assert.strictEqual(back.boards[1].notes[0].text, "b", "this device keeps its own unticked board");
	assert.strictEqual(back.boards[0].notes[0].text, "a");
	var rep = CT.replacePart(full, { v: 1, part: 1, boards: [{ name: "A", notes: [] }] });
	assert.deepStrictEqual(rep.boards.map(function (b) { return b.name; }), ["A", "B"], "replace with a partial backup keeps the other boards");
});
console.log("copy-text sync: " + n + " groups passed");
