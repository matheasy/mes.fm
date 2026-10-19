// node tool_apps_src/fonts-tests.js
const F = require("./fonts/lib.js"), assert = require("assert"); let n = 0;
function t(name, f) { try { f(); n++; } catch (e) { console.log("FAIL " + name + ": " + e.message); process.exitCode = 1; } }
t("catalogue has no duplicates inside a list and every entry has a category", () => { for (const L of [F.LOCAL, F.GOOGLE]) { const seen = new Set(); L.forEach(([name, c]) => { assert.ok(name && F.CATS.some(k => k[0] === c), name); const key = name + "|" + c; assert.ok(!seen.has(key), key); seen.add(key); }); } assert.ok(F.LOCAL.length > 100 && F.GOOGLE.length > 50); });
t("css: plain style", () => { const c = F.css("Georgia", "serif", { size: 40 }); assert.ok(/font-family: 'Georgia', serif;/.test(c) && /font-size: 40px;/.test(c) && /color: #111111;/.test(c) && !/text-shadow/.test(c)); });
t("css: effects", () => { const c = F.css("Anton", "display", { shadowOn: true, glowOn: true, strokeOn: true, bgOn: true, italic: true, tf: "uppercase", ls: 2 }); assert.ok(/text-shadow: 4px 4px 8px #000000, 0 0 16px #38bdf8, 0 0 32px #38bdf8;/.test(c) && /-webkit-text-stroke: 2px #ffffff;/.test(c) && /background: #ffffff;/.test(c) && /font-style: italic;/.test(c) && /text-transform: uppercase;/.test(c) && /letter-spacing: 2px;/.test(c)); });
t("css: gradient text", () => { const c = F.css("X", "sans", { gradOn: true }); assert.ok(/background-clip: text;/.test(c) && /color: transparent;/.test(c) && !/background: #ffffff/.test(c)); });
t("css: quoting is safe", () => { assert.strictEqual(F.ffam("Evil'; x"), "'Evil; x'"); assert.strictEqual(F.ffam("serif"), "serif"); });
t("otsu splits two groups", () => { const g = []; for (let i = 0; i < 100; i++) g.push(i % 2 ? 20 : 230); const th = F.otsu(g); assert.ok(th >= 20 && th < 230); });
t("binarise: ink is the minority (dark on light and light on dark)", () => { const a = new Array(100).fill(240); for (let i = 0; i < 12; i++) a[i] = 10; const b1 = F.binarise(a); assert.strictEqual(b1.reduce((x, y) => x + y, 0), 12); const inv = a.map(v => 255 - v), b2 = F.binarise(inv); assert.strictEqual(b2.reduce((x, y) => x + y, 0), 12); });
t("inkBox + grid", () => { const w = 20, h = 10, b = new Uint8Array(w * h); for (let y = 2; y < 6; y++) for (let x = 5; x < 15; x++) b[y * w + x] = 1; const box = F.inkBox(b, w, h); assert.deepStrictEqual(box, { x: 5, y: 2, w: 10, h: 4 }); const g = F.grid(b, w, h, box, 10, 4); assert.ok(g.every(v => v === 1)); assert.strictEqual(F.inkBox(new Uint8Array(9), 3, 3), null); });
t("similarity: same shape high, different low, aspect penalty", () => {
	const gw = 32, gh = 8, A = new Float32Array(gw * gh), B = new Float32Array(gw * gh), C = new Float32Array(gw * gh); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { A[y * gw + x] = x % 8 < 4 ? 1 : 0; B[y * gw + x] = A[y * gw + x]; C[y * gw + x] = y % 4 < 2 ? 1 : 0; }
	const same = F.similarity(A, B, gw, gh, 4, 4), diff = F.similarity(A, C, gw, gh, 4, 4), wide = F.similarity(A, B, gw, gh, 4, 8);
	assert.ok(same > 0.99 && diff < 0.8 && wide < same * 0.7, [same, diff, wide].join());
});
console.log(n + " font checks passed");
