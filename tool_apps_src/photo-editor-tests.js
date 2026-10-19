// node tool_apps_src/photo-editor-tests.js
const P = require("./photo-editor/lib.js"); const assert = require("assert"); let n = 0;
function t(name, f) { try { f(); n++; } catch (e) { console.log("FAIL " + name + ": " + e.message); process.exitCode = 1; } }
const px = (arr) => new Uint8ClampedArray(arr);
t("hex roundtrip", () => { assert.deepStrictEqual(P.hexToRgb("#ff8000"), [255, 128, 0]); assert.strictEqual(P.rgbToHex(255, 128, 0), "#ff8000"); assert.deepStrictEqual(P.hexToRgb("#f00"), [255, 0, 0]); });
t("hsl roundtrip", () => { for (const c of [[200, 30, 60], [10, 250, 90], [128, 128, 128], [255, 0, 0]]) { const h = P.rgbToHsl(...c), r = P.hslToRgb(...h); c.forEach((v, i) => assert(Math.abs(v - r[i]) < 1, c + " vs " + r)); } });
t("invert", () => { const d = px([10, 20, 30, 77]); P.invert(d); assert.deepStrictEqual(Array.from(d), [245, 235, 225, 77]); });
t("grayscale keeps alpha", () => { const d = px([255, 0, 0, 128]); P.grayscale(d); assert.strictEqual(d[0], d[1]); assert.strictEqual(d[3], 128); assert.strictEqual(d[0], 54); });
t("threshold", () => { const d = px([200, 200, 200, 255, 50, 50, 50, 255]); P.threshold(d, 128); assert.deepStrictEqual(Array.from(d), [255, 255, 255, 255, 0, 0, 0, 255]); });
t("levels identity", () => { const l = P.levelsLUT(0, 255, 1, 0, 255); for (let i = 0; i < 256; i++) assert.strictEqual(l[i], i); });
t("levels stretch", () => { const l = P.levelsLUT(50, 200, 1, 0, 255); assert.strictEqual(l[50], 0); assert.strictEqual(l[200], 255); assert.strictEqual(l[0], 0); assert.strictEqual(l[255], 255); });
t("levels gamma > 1 brightens", () => { const l = P.levelsLUT(0, 255, 2, 0, 255); assert(l[128] > 128 + 40); });
t("curve identity", () => { const l = P.curveLUT([[0, 0], [255, 255]]); for (let i = 0; i < 256; i += 15) assert(Math.abs(l[i] - i) <= 1); });
t("curve passes through points + monotone", () => { const l = P.curveLUT([[0, 0], [64, 40], [192, 220], [255, 255]]); assert.strictEqual(l[64], 40); assert.strictEqual(l[192], 220); for (let i = 1; i < 256; i++) assert(l[i] >= l[i - 1]); });
t("brightness", () => { const d = px([100, 100, 100, 255]); P.brightnessContrast(d, 20, 0); assert.strictEqual(d[0], 151); });
t("contrast mid stays", () => { const d = px([128, 128, 128, 255]); P.brightnessContrast(d, 0, 50); assert.strictEqual(d[0], 128); });
t("exposure +1 EV doubles", () => { const d = px([60, 60, 60, 255]); P.exposure(d, 1, 0, 1); assert.strictEqual(d[0], 120); });
t("hueSat 120 turns red to green", () => { const d = px([255, 0, 0, 255]); P.hueSat(d, 120, 0, 0); assert(d[1] > 250 && d[0] < 5); });
t("hueSat -100 gray", () => { const d = px([200, 50, 50, 255]); P.hueSat(d, 0, -100, 0); assert(Math.abs(d[0] - d[1]) < 1 && Math.abs(d[1] - d[2]) < 1); });
t("vibrance leaves gray", () => { const d = px([100, 100, 100, 255]); P.vibrance(d, 80); assert.strictEqual(d[0], 100); });
t("posterize 2", () => { const d = px([100, 200, 130, 255]); P.posterize(d, 2); assert.deepStrictEqual(Array.from(d), [0, 255, 255, 255]); });
t("blur keeps flat colour and alpha", () => { const w = 9, h = 9, d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = 50; d[i + 1] = 100; d[i + 2] = 150; d[i + 3] = 255; } P.gaussianBlur(d, w, h, 6); assert.deepStrictEqual(Array.from(d.slice(0, 4)), [50, 100, 150, 255]); assert.deepStrictEqual(Array.from(d.slice(-4)), [50, 100, 150, 255]); });
t("blur preserves mean and spreads", () => { const w = 21, h = 21, d = new Uint8ClampedArray(w * h * 4); for (let i = 3; i < d.length; i += 4) d[i] = 255; const c = (10 * w + 10) * 4; d[c] = d[c + 1] = d[c + 2] = 255; const before = 255; P.gaussianBlur(d, w, h, 2); assert(d[c] < 120 && d[c] > 5, 'peak ' + d[c]); let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i]; assert(Math.abs(sum - before) < before * 0.1, "mean " + sum); });
t("blur transparent edge has no dark fringe", () => { const w = 16, h = 1, d = new Uint8ClampedArray(w * 4); for (let x = 0; x < 8; x++) { d[x * 4] = 255; d[x * 4 + 1] = 255; d[x * 4 + 2] = 255; d[x * 4 + 3] = 255; } P.gaussianBlur(d, w, h, 4); for (let x = 0; x < 12; x++) if (d[x * 4 + 3] > 30) assert(d[x * 4] > 240, "px " + x + " = " + d[x * 4]); });
t("unsharp raises edge contrast", () => { const w = 20, h = 1, d = new Uint8ClampedArray(w * 4); for (let x = 0; x < w; x++) { const v = x < 10 ? 80 : 160; d[x * 4] = d[x * 4 + 1] = d[x * 4 + 2] = v; d[x * 4 + 3] = 255; } P.unsharp(d, w, h, 150, 2, 0); assert(d[9 * 4] < 80 && d[10 * 4] > 160); });
t("noise reproducible", () => { const a = new Uint8ClampedArray(400).fill(128), b = new Uint8ClampedArray(400).fill(128); P.noise(a, 20, false, 7); P.noise(b, 20, false, 7); assert.deepStrictEqual(a, b); assert(a.some((v) => v !== 128)); });
t("pixelate blocks", () => { const w = 4, h = 4, d = new Uint8ClampedArray(w * h * 4); for (let p = 0; p < 16; p++) { d[p * 4] = p * 10; d[p * 4 + 3] = 255; } P.pixelate(d, w, h, 4); for (let p = 1; p < 16; p++) assert.strictEqual(d[p * 4], d[0]); });
t("vignette darkens corners only", () => { const w = 21, h = 21, d = new Uint8ClampedArray(w * h * 4).fill(200); P.vignette(d, w, h, 100, 20, 60); assert.strictEqual(d[(10 * w + 10) * 4], 200); assert(d[0] < 100); });
t("flood contiguous", () => { const w = 6, h = 3, d = new Uint8ClampedArray(w * h * 4); for (let p = 0; p < w * h; p++) { const col = p % w; const v = (col === 2 || col === 5) ? 255 : 0; d[p * 4] = v; d[p * 4 + 3] = 255; }
	const m = P.floodMask(d, w, h, 0, 0, 10, true); let cnt = 0; m.forEach((v) => { if (v) cnt++; }); assert.strictEqual(cnt, 6); const a = P.floodMask(d, w, h, 0, 0, 10, false); cnt = 0; a.forEach((v) => { if (v) cnt++; }); assert.strictEqual(cnt, 12); });
t("flood tolerance", () => { const d = new Uint8ClampedArray([100, 0, 0, 255, 110, 0, 0, 255, 160, 0, 0, 255]); const m = P.floodMask(d, 3, 1, 0, 0, 15, true); assert.deepStrictEqual(Array.from(m), [255, 255, 0]); });
t("grow/shrink", () => { const w = 9, h = 9, m = new Uint8Array(w * h); m[4 * w + 4] = 255; const g = P.growShrinkMask(m, w, h, 1, true); let c = 0; g.forEach((v) => { if (v) c++; }); assert.strictEqual(c, 9); const s = P.growShrinkMask(g, w, h, 1, false); c = 0; s.forEach((v) => { if (v) c++; }); assert.strictEqual(c, 1); });
t("feather", () => { const w = 20, h = 20, m = new Uint8Array(w * h); for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 255; const f = P.featherMask(m, w, h, 6); assert(f[10 * w + 4] > 0 && f[10 * w + 4] < 255); assert(f[0] <= 2); });
t("bounds", () => { const w = 5, h = 5, m = new Uint8Array(w * h); m[1 * w + 2] = 1; m[3 * w + 3] = 1; assert.deepStrictEqual(P.maskBounds(m, w, h), { x: 2, y: 1, w: 2, h: 3 }); assert.strictEqual(P.maskBounds(new Uint8Array(4), 2, 2), null); });
t("blendByMask", () => { const b = px([0, 0, 0, 255, 0, 0, 0, 255]), a = px([200, 200, 200, 255, 200, 200, 200, 255]); P.blendByMask(b, a, new Uint8Array([0, 255])); assert.strictEqual(a[0], 0); assert.strictEqual(a[4], 200); });
t("autoLevels", () => { const h = new Uint32Array(256); for (let i = 40; i <= 200; i++) h[i] = 100; const r = P.autoLevels(h, 0.005); assert(r.black >= 40 && r.black < 50 && r.white <= 200 && r.white > 190); });
t("convolve identity", () => { const w = 3, h = 3, d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i++) d[i] = (i * 7) % 256; const c = new Uint8ClampedArray(d); P.convolve(d, w, h, [0, 0, 0, 0, 1, 0, 0, 0, 0], 1, 0); for (let i = 0; i < d.length; i++) if (i % 4 !== 3) assert.strictEqual(d[i], c[i]); });
console.log(n + " photo-editor pixel checks passed");

// GIMP (.xcf) writer: structure checked with a tiny reader (and, once, against the independent Python `gimpformats` reader)
t("xcf: header, layer list, tiles", () => {
	const X = require("./photo-editor/xcf.js"), mk = (w, h, c) => { const d = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) d.set(c, i * 4); return d; };
	const b = X.write({ w: 150, h: 90, layers: [{ name: "Bottom", x: 0, y: 0, w: 150, h: 90, data: mk(150, 90, [1, 2, 3, 255]), opacity: 1 }, { name: "Top é", x: 20, y: 10, w: 70, h: 100, data: mk(70, 100, [9, 8, 7, 200]), opacity: 0.5, mode: 3 }] });
	const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), u32 = (o) => dv.getUint32(o);
	assert.strictEqual(String.fromCharCode(...b.slice(0, 13)), "gimp xcf file"); assert.strictEqual(u32(14), 150); assert.strictEqual(u32(18), 90);
	let o = 26; for (;;) { const id = u32(o), len = u32(o + 4); o += 8 + len; if (id === 0) break; }
	const p0 = u32(o), p1 = u32(o + 4); assert.ok(p0 > 0 && p1 > 0 && u32(o + 8) === 0);
	const name = (off) => { const L = u32(off + 12); return String.fromCharCode(...b.slice(off + 16, off + 16 + L - 1)); };
	assert.strictEqual(u32(p0), 70); assert.strictEqual(u32(p0 + 4), 100); assert.ok(/^Top/.test(name(p0))); assert.strictEqual(u32(p1), 150); assert.strictEqual(name(p1), "Bottom");   // top-first
});
console.log(n + " checks ok");
