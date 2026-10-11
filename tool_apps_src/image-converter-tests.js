// node tool_apps_src/image-converter-tests.js
const I = require("./image-converter/lib.js"); const assert = require("assert"); let n = 0;
function t(name, f) { f(); n++; }
t("fitSize keep", () => assert.deepStrictEqual(I.fitSize(4000, 3000, {}), { w: 4000, h: 3000, scale: 1 }));
t("fitSize width", () => assert.strictEqual(I.fitSize(4000, 3000, { mode: "width", w: 1000 }).h, 750));
t("fitSize no enlarge", () => assert.strictEqual(I.fitSize(800, 600, { mode: "width", w: 2000 }).w, 800));
t("fitSize enlarge", () => assert.strictEqual(I.fitSize(800, 600, { mode: "width", w: 1600, enlarge: true }).h, 1200));
t("fitSize box", () => { const r = I.fitSize(4000, 3000, { mode: "box", w: 1000, h: 1000 }); assert.deepStrictEqual([r.w, r.h], [1000, 750]); });
t("fitSize percent", () => assert.strictEqual(I.fitSize(1000, 500, { mode: "percent", p: 50 }).w, 500));
t("uniqueName", () => { const u = {}; assert.strictEqual(I.uniqueName("a.jpg", u), "a.jpg"); assert.strictEqual(I.uniqueName("A.jpg", u), "A (2).jpg"); assert.strictEqual(I.uniqueName("a.jpg", u), "a (3).jpg"); });
t("outName suffix", () => assert.strictEqual(I.outName("-small", "photos/IMG 1.PNG", 1, "jpg"), "IMG 1-small.jpg"));
t("outName pattern", () => assert.strictEqual(I.outName("pic-{n}-{w}x{h}", "x.png", 3, "webp", 100, 50), "pic-3-100x50.webp"));
t("outName unsafe", () => assert.strictEqual(I.outName("", "a:b?.png", 1, "png"), "a_b_.png"));
t("crc32", () => assert.strictEqual(I.crc32(Buffer.from("123456789")), 0xCBF43926));
t("zip roundtrip", () => {
	const z = I.zipStore([{ name: "a.txt", data: Buffer.from("hello") }, { name: "dir/é.bin", data: new Uint8Array([1, 2, 3, 255]) }]);
	const r = I.zipRead(new Uint8Array(z)); assert.strictEqual(r.length, 2); assert.strictEqual(Buffer.from(r[0].data).toString(), "hello"); assert.strictEqual(r[1].name, "dir/é.bin"); assert.deepStrictEqual(Array.from(r[1].data), [1, 2, 3, 255]);
});
t("formatBytes", () => assert.strictEqual(I.formatBytes(1536), "1.5 KB"));
console.log(n + " image-converter checks passed");
