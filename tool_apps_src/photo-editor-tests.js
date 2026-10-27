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

// where a layer came from (Files and folders dialog), side-panel width
t("describeSource: every kind", () => {
	const d = P.describeSource;
	assert.strictEqual(d(null).how, "made"); assert.strictEqual(d(undefined).text, "Made in the editor"); assert.strictEqual(d({ how: "nonsense" }).how, "made");
	assert.strictEqual(d({ how: "open", file: "photo.jpg", bytes: 2516582 }).text, "Opened from a file: photo.jpg (2.4 MB)");
	assert.strictEqual(d({ how: "drop", file: "a.png", bytes: 900 }).text, "Dropped onto the editor: a.png (900 B)");
	assert.strictEqual(d({ how: "folder", dir: "Pics", file: "cat.webp", bytes: 20480 }).text, "From a folder on this computer: Pics/cat.webp (20 KB)");
	assert.strictEqual(d({ how: "folder-ro", path: "Pics/2024/cat.png" }).where, "Pics/2024/cat.png"); assert.strictEqual(d({ how: "folder-ro", dir: "Pics", file: "x.png" }).where, "Pics/x.png");
	assert.strictEqual(d({ how: "paste" }).text, "Pasted from the clipboard"); assert.strictEqual(d({ how: "paste", clip: "editor" }).label, "Pasted (copied inside the editor)");
	assert.strictEqual(d({ how: "psd", file: "design.psd" }).text, "From a Photoshop file: design.psd"); assert.strictEqual(d({ how: "xcf", file: "thumb.xcf", bytes: 2048 }).text, "From a GIMP file: thumb.xcf (2.0 KB)"); assert.strictEqual(d({ how: "project", file: "thumb.mesproj" }).where, "thumb.mesproj");
	assert.strictEqual(d({ how: "merge", from: ["A", "B", "C", "D", "E"] }).where, "A, B, C and 2 more"); assert.strictEqual(d({ how: "merge", from: ["A", "B"] }).text, "Merged from layers: A, B");
	assert.strictEqual(d({ how: "open", file: "p.jpg", copy: true, ai: ["background removed", "upscaled 2×"] }).text, "Opened from a file: p.jpg, duplicated · then AI: background removed, upscaled 2×");
	assert.strictEqual(d({ how: "made", ai: ["object erased"] }).text, "Made in the editor · then AI: object erased");
	assert.strictEqual(P.bytesText(0), "0 B"); assert.strictEqual(P.bytesText(1536), "1.5 KB"); assert.strictEqual(P.bytesText(52428800), "50 MB");
});
t("panelClamp: 12-48 em, leaves the picture 240 px", () => {
	assert.strictEqual(P.panelClamp(17.5, 1400, 60, 13), 17.5); assert.strictEqual(P.panelClamp(5, 1400, 60, 13), 12); assert.strictEqual(P.panelClamp(99, 4000, 60, 13), 48);
	assert.strictEqual(P.panelClamp(40, 800, 60, 13), Math.round((800 - 60 - 240) / 13 * 100) / 100);   // 38.46 em: the picture keeps 240 px
	assert.strictEqual(P.panelClamp(30, 300, 60, 13), 12);   // tiny editor: never below the minimum
	assert.strictEqual(P.panelClamp(NaN, 1400, 60, 13), 17.5); assert.strictEqual(P.panelClamp(20, 1400, 60, 0), 20);
});
t("panelKey: arrows follow the grip, Shift = 4 em", () => {
	assert.deepStrictEqual(P.panelKey("ArrowLeft", false, false), { d: 1 }); assert.deepStrictEqual(P.panelKey("ArrowRight", false, false), { d: -1 });   // panels on the right: grip to the left = wider
	assert.deepStrictEqual(P.panelKey("ArrowRight", true, true), { d: 4 }); assert.deepStrictEqual(P.panelKey("ArrowLeft", false, true), { d: -1 });       // panels on the left
	assert.deepStrictEqual(P.panelKey("Home"), { to: "min" }); assert.deepStrictEqual(P.panelKey("End"), { to: "max" }); assert.deepStrictEqual(P.panelKey("Enter"), { to: "reset" }); assert.strictEqual(P.panelKey("a"), null);
});

// Move tool: multi-selection box, rubber band, snapping
t("unionBox / boxesTouch / rectFrom", () => {
	assert.deepStrictEqual(P.unionBox([{ x: 10, y: 20, w: 30, h: 10 }, null, { x: -5, y: 25, w: 10, h: 40 }]), { x: -5, y: 20, w: 45, h: 45 }); assert.strictEqual(P.unionBox([]), null);
	assert.ok(P.boxesTouch({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 5, w: 5, h: 5 })); assert.ok(!P.boxesTouch({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 }));
	assert.deepStrictEqual(P.rectFrom(30, 5, 10, 25), { x: 10, y: 5, w: 20, h: 20 });
});
t("snapBox: canvas edges + centre, other layers, threshold, guides", () => {
	const tg = P.snapTargets(1280, 720, [{ x: 400, y: 100, w: 200, h: 50 }]);
	let r = P.snapBox({ x: 4, y: 300, w: 100, h: 40 }, tg, 6); assert.strictEqual(r.dx, -4); assert.strictEqual(r.dy, 0); assert.deepStrictEqual(r.gx, [{ p: 0, k: "c" }]); assert.deepStrictEqual(r.gy, []);
	r = P.snapBox({ x: 587, y: 300, w: 100, h: 40 }, tg, 6); assert.strictEqual(r.dx, 3); assert.ok(r.gx.some((g) => g.p === 640 && g.k === "c"));    // centre 637 -> canvas centre 640 (beats the layer's right edge 600: farther)
	r = P.snapBox({ x: 603, y: 152, w: 50, h: 30 }, tg, 6); assert.strictEqual(r.dx, -3); assert.strictEqual(r.dy, -2); assert.deepStrictEqual(r.gx, [{ p: 600, k: "l" }]); assert.deepStrictEqual(r.gy, [{ p: 150, k: "l" }]);
	r = P.snapBox({ x: 620, y: 300, w: 10, h: 10 }, tg, 6); assert.strictEqual(r.dx, 0); assert.strictEqual(r.dy, 0);
	r = P.snapBox({ x: 1180, y: 690, w: 98, h: 31 }, tg, 6); assert.strictEqual(r.dx, 2); assert.strictEqual(r.dy, -1); assert.deepStrictEqual(r.gy, [{ p: 720, k: "c" }]);
	const tie = P.snapAxis([100], [{ p: 103, k: "l" }, { p: 97, k: "c" }], 6); assert.strictEqual(tie.k, "c");
	assert.strictEqual(P.snapTargets(null, null, []).x.length, 0);
});
t("linSolve + scaleAbout (resize snapping)", () => {
	// right edge of a box anchored at x=100: edge = 100 + 50 * f; which f puts it on 300?
	assert.strictEqual(P.linSolve(1, 150, 2, 200, 300), 4); assert.strictEqual(P.linSolve(1, 5, 2, 5, 9), null);
	assert.strictEqual(P.scaleAbout(150, 100, 2), 200); assert.strictEqual(P.scaleAbout(50, 100, 0.5), 75);
});
// Text editor: wrapping with offsets, caret positions
const mono = (s) => s.length * 10;
t("wrapLines: offsets match the string, same lines as the old wrapper", () => {
	const s = "Fetzer 2.0 is here\nsecond", L = P.wrapLines(s, 100, mono);
	assert.deepStrictEqual(L.map((l) => l.text), ["Fetzer 2.0", "is here", "second"]); L.forEach((l) => assert.strictEqual(s.slice(l.start, l.end), l.text));
	const long = P.wrapLines("abcdefghijklmnop", 50, mono); assert.deepStrictEqual(long.map((l) => l.text), ["abcde", "fghij", "klmno", "p"]); assert.deepStrictEqual(long.map((l) => l.start), [0, 5, 10, 15]);
	assert.deepStrictEqual(P.wrapLines("", 50, mono), [{ text: "", start: 0, end: 0 }]); assert.deepStrictEqual(P.wrapLines("a\n\nb", 50, mono).map((l) => l.start), [0, 2, 3]);
	const sp = "one two three four", W = P.wrapLines(sp, 85, mono); W.forEach((l) => assert.strictEqual(sp.slice(l.start, l.end), l.text)); assert.deepStrictEqual(W.map((l) => l.text), ["one two", "three", "four"]);
});
t("caretLine / hitInLine / wordAt", () => {
	const L = P.wrapLines("Fetzer 2.0 is here", 100, mono);
	assert.deepStrictEqual(P.caretLine(L, 0), { line: 0, k: 0 }); assert.deepStrictEqual(P.caretLine(L, 10), { line: 0, k: 10 }); assert.deepStrictEqual(P.caretLine(L, 11), { line: 1, k: 0 }); assert.deepStrictEqual(P.caretLine(L, 18), { line: 1, k: 7 });
	assert.strictEqual(P.hitInLine(L[0], 34, mono), 3); assert.strictEqual(P.hitInLine(L[0], 999, mono), 10); assert.strictEqual(P.hitInLine(L[1], 26, mono), 14);
	assert.deepStrictEqual(P.wordAt("Fetzer 2.0 is", 2), [0, 6]); assert.deepStrictEqual(P.wordAt("Fetzer 2.0 is", 6), [0, 6]); assert.deepStrictEqual(P.wordAt("a  b", 2), [2, 2]); assert.deepStrictEqual(P.wordAt("Fetzer 2.0", 8), [7, 10]); assert.deepStrictEqual(P.wordAt("Hi Fetzer, yes", 5), [3, 9]); assert.deepStrictEqual(P.wordAt("Hi Fetzer, yes", 9), [3, 9]);
});

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

// GIMP (.xcf) reader: round trip through the writer, hand-made v3 / v11 files (RLE, zlib, groups, masks), and real GIMP 3.2 files in photo-editor/xcf-fixtures/
{
	const X = require("./photo-editor/xcf.js"), fs = require("fs"), zlib = require("zlib"), path = require("path"), FIX = path.join(__dirname, "photo-editor", "xcf-fixtures");
	const fx = (f) => X.read(fs.readFileSync(path.join(FIX, f))), at = (L, x, y) => Array.from(L.data.slice((y * L.w + x) * 4, (y * L.w + x) * 4 + 4));
	const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
	t("xcf read: writer round trip (v0, 32-bit pointers, uncompressed, several tiles)", () => {
		const W = 130, H = 70, d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set([x, y * 3, (x + y) & 255, x % 5 ? 255 : 90], (y * W + x) * 4);
		const top = new Uint8Array(20 * 10 * 4).fill(200);
		const b = X.write({ w: 140, h: 80, layers: [{ name: "Bottom ü", x: 3, y: -4, w: W, h: H, data: d, opacity: 1, visible: true, mode: 0 }, { name: "Top", x: 100, y: 70, w: 20, h: 10, data: top, opacity: 0.5, visible: false, mode: X.MODES.multiply }] });
		const r = X.read(b); assert.strictEqual(r.version, 0); assert.strictEqual(r.w, 140); assert.strictEqual(r.compression, "none"); assert.strictEqual(r.layers.length, 2);
		const [T, B] = r.layers; assert.strictEqual(B.name, "Bottom ü"); assert.deepStrictEqual([B.x, B.y, B.w, B.h], [3, -4, W, H]); assert.deepStrictEqual(Array.from(B.data), Array.from(d));
		assert.strictEqual(T.visible, false); assert.ok(Math.abs(T.opacity - 0.5) < 0.003); assert.strictEqual(T.blend, "multiply"); assert.deepStrictEqual(at(T, 19, 9), [200, 200, 200, 200]);
	});
	// a small XCF builder for cases GIMP 3 no longer writes: v3 (32-bit pointers) with RLE, groups via PROP_ITEM_PATH, a mask, a grey and an indexed image
	function build(o) {
		const v = o.version, wide = v >= 11, out = []; let n = 0; const push = (a) => { for (const x of a) out.push(x & 255); };
		const u32 = (x) => [x >>> 24, x >>> 16, x >>> 8, x], ptrB = (x) => wide ? [0, 0, 0, 0].concat(u32(x)) : u32(x), str = (s) => { const e = Array.from(Buffer.from(s + "\0")); return u32(e.length).concat(e); };
		const prop = (id, pl) => u32(id).concat(u32(pl.length), pl);
		const rle = (bytes, bpp) => { const r = []; const np = bytes.length / bpp; for (let c = 0; c < bpp; c++) { const plane = []; for (let i = 0; i < np; i++) plane.push(bytes[i * bpp + c]); for (let i = 0; i < np;) { let k = 1; while (i + k < np && plane[i + k] === plane[i] && k < 127) k++; if (k >= 3) { r.push(k - 1, plane[i]); i += k; } else { const m = Math.min(127, np - i); r.push(256 - m, ...plane.slice(i, i + m)); i += m; } } } return r; };
		const enc = (bytes, bpp) => o.comp === 2 ? Array.from(zlib.deflateSync(Buffer.from(bytes))) : o.comp === 1 ? rle(bytes, bpp) : Array.from(bytes);
		const blocks = []; // [{bytes, patches: [[offsetInBlock, blockIndex]]}] laid out sequentially
		const hdr = Array.from(Buffer.from("gimp xcf " + (v === 0 ? "file" : "v" + String(v).padStart(3, "0")) + "\0")).concat(u32(o.w), u32(o.h), u32(o.base || 0));
		if (v >= 4) hdr.push(...u32(o.precision || 150));
		hdr.push(...prop(17, [o.comp]));
		if (o.cmap) hdr.push(...u32(1), ...u32(o.cmap.length / 3 + 4), ...u32(o.cmap.length / 3), ...o.cmap);   // the old, wrong length word
		hdr.push(...u32(0), ...u32(0));
		// layout: header + layer ptrs, then each layer: struct, hierarchy, level, tiles (one tile per layer: layers <= 64 px), mask likewise
		let parts = [hdr]; const ptrSize = wide ? 8 : 4; let offset = hdr.length + (o.layers.length + 2) * ptrSize; const lptr = [];
		const chunks = [];
		for (const L of o.layers) {
			lptr.push(offset);
			const props = [].concat(prop(15, u32(L.x || 0).concat(u32(L.y || 0))), prop(6, u32(L.op == null ? 255 : L.op)), L.group ? prop(29, []) : [], L.path ? prop(30, [].concat(...L.path.map(u32))) : [], u32(0), u32(0));
			const head = u32(L.w).concat(u32(L.h), u32(L.type), str(L.name), props); const hptrAt = head.length; const after = head.length + ptrSize * 2;
			let block = head.concat(ptrB(0), ptrB(0));
			const pix = (bytes, bpp, w, h) => { const hp = offset + block.length; const tile = enc(bytes, bpp); const lvl = offset + block.length + 12 + ptrSize * 2; block = block.concat(u32(w), u32(h), u32(bpp), ptrB(lvl), ptrB(0)); const tp = offset + block.length + 8 + ptrSize * 2; block = block.concat(u32(w), u32(h), ptrB(tp), ptrB(0), tile); return hp; };
			const hp = pix(L.bytes, L.bpp, L.w, L.h); block.splice(hptrAt, ptrSize, ...ptrB(hp));
			if (L.mask) { const mp = offset + block.length; block = block.concat(u32(L.w), u32(L.h), str("mask"), u32(0), u32(0)); const hpAt = block.length; block = block.concat(ptrB(0)); const mh = pix(L.mask, 1, L.w, L.h); block.splice(hpAt, ptrSize, ...ptrB(mh)); block.splice(hptrAt + ptrSize, ptrSize, ...ptrB(mp)); }
			void after; chunks.push(block); offset += block.length;
		}
		parts.push([].concat(...lptr.map(ptrB), ptrB(0), ptrB(0)));
		for (const c of chunks) parts.push(c);
		const all = [].concat(...parts); return new Uint8Array(all);
	}
	const solid = (w, h, px) => { const a = []; for (let i = 0; i < w * h; i++) a.push(...px); return a; };
	for (const [v, comp] of [[3, 1], [3, 2], [11, 0], [11, 1]]) t("xcf read: hand-made v" + v + " " + ["none", "RLE", "zlib"][comp] + ", groups + mask", () => {
		const mask = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) mask.push(x < 5 ? 255 : 0);
		const b = build({ version: v, comp, w: 40, h: 30, layers: [
			{ name: "G", type: 1, w: 1, h: 1, bpp: 4, bytes: [0, 0, 0, 0], group: true, op: 128 },
			{ name: "Kid", type: 1, w: 10, h: 8, x: 5, y: 6, bpp: 4, bytes: solid(10, 8, [1, 2, 3, 255]), path: [0, 0], mask },
			{ name: "Bg", type: 0, w: 40, h: 30, bpp: 3, bytes: solid(40, 30, [9, 8, 7]) }] });
		const r = X.read(b); assert.strictEqual(r.version, v); assert.deepStrictEqual(r.notes, []);
		const [G, K, B] = r.layers; assert.ok(G.group); assert.ok(Math.abs(G.opacity - 128 / 255) < 1e-6); assert.strictEqual(K.parent, 0); assert.strictEqual(B.parent, -1);
		assert.deepStrictEqual(at(K, 9, 7), [1, 2, 3, 255]); assert.deepStrictEqual([K.x, K.y], [5, 6]); assert.strictEqual(K.mask.data[0], 255); assert.strictEqual(K.mask.data[9], 0);
		assert.deepStrictEqual(at(B, 39, 29), [9, 8, 7, 255]);
	});
	t("xcf read: hand-made grey and indexed (colour map with the old wrong length)", () => {
		const g = X.read(build({ version: 3, comp: 1, base: 1, w: 4, h: 4, layers: [{ name: "g", type: 3, w: 4, h: 4, bpp: 2, bytes: solid(4, 4, [77, 200]) }] }));
		assert.deepStrictEqual(at(g.layers[0], 3, 3), [77, 77, 77, 200]);
		const ix = X.read(build({ version: 3, comp: 0, base: 2, w: 3, h: 1, cmap: [255, 0, 0, 0, 255, 0], layers: [{ name: "i", type: 5, w: 3, h: 1, bpp: 2, bytes: [1, 255, 0, 255, 1, 0] }] }));
		assert.deepStrictEqual(Array.from(ix.layers[0].data), [0, 255, 0, 255, 255, 0, 0, 255, 0, 255, 0, 0]);
	});
	t("xcf read: bad input gives a clear error, a broken layer only a note", () => {
		assert.throws(() => X.read(new Uint8Array(40)), /not a GIMP/); assert.throws(() => X.read(new Uint8Array([0x1f, 0x8b].concat(Array(40).fill(0)))), /not a GIMP|gz/);
		const b = X.write({ w: 70, h: 70, layers: [{ name: "A", x: 0, y: 0, w: 70, h: 70, data: new Uint8Array(70 * 70 * 4).fill(9), opacity: 1, visible: true, mode: 0 }] });
		const r = X.read(b.slice(0, b.length - 100)); assert.strictEqual(r.layers.length, 0); assert.ok(/could not be read/.test(r.notes[0]));
	});
	t("xcf read: GIMP 3.2, 8-bit RGB, RLE and zlib: groups, masks, offsets, opacity, mode, text", () => {
		for (const f of ["full-rgb8-rle.xcf", "full-rgb8-zlib.xcf"]) {
			const r = fx(f); assert.strictEqual(r.compression, f.indexOf("zlib") > 0 ? "zlib" : "RLE"); assert.strictEqual(r.version, 19);
			assert.deepStrictEqual(r.layers.map((L) => L.name), ["Hello XCF", "Outer", "Inner", "Deep", "Shallow", "Masked", "Hidden", "Offset", "Background"]);
			const by = {}; r.layers.forEach((L) => { by[L.name] = L; });
			assert.strictEqual(by["Hello XCF"].text, "Hello XCF"); assert.deepStrictEqual(r.notes, ["Text layers became pixels, named after their text (Hello XCF)"]); assert.ok(by.Outer.group && by.Inner.group); assert.strictEqual(by.Inner.parent, 1); assert.strictEqual(by.Deep.parent, 2); assert.strictEqual(by.Shallow.parent, 1); assert.strictEqual(by.Masked.parent, -1);
			assert.ok(Math.abs(by.Outer.opacity - 0.8) < 1e-6); assert.ok(Math.abs(by.Shallow.opacity - 0.5) < 1e-6);
			const O = by.Offset; assert.deepStrictEqual([O.x, O.y, O.w, O.h], [-10, 30, 80, 50]); assert.ok(Math.abs(O.opacity - 0.6) < 1e-6); assert.strictEqual(O.blend, "multiply");
			for (const [x, y] of [[0, 0], [1, 1], [70, 45], [79, 49], [64, 3]]) assert.deepStrictEqual(at(O, x, y), [(x * 3) & 255, (y * 5) & 255, 77, (x + y) % 7 ? 255 : 0]);
			const B = by.Background; for (const [x, y] of [[0, 0], [99, 69], [64, 64], [63, 65]]) assert.deepStrictEqual(at(B, x, y), [(x * 2) & 255, (y * 3) & 255, 128, 255]);
			assert.strictEqual(by.Hidden.visible, false); const M = by.Masked.mask; assert.strictEqual(M.data[49], 255); assert.strictEqual(M.data[50], 0); assert.strictEqual(M.data[69 * 100 + 10], 255);
			// zlib tiles decoded by node's zlib give the same pixels
			if (f.indexOf("zlib") > 0) { const r2 = X.read(fs.readFileSync(path.join(FIX, f)), { inflate: (u, p) => new Uint8Array(zlib.inflateSync(Buffer.from(u.buffer, u.byteOffset + p, u.length - p))) }); r2.layers.forEach((L, i) => { if (L.data) assert.deepStrictEqual(Array.from(L.data), Array.from(r.layers[i].data)); }); }
		}
	});
	t("xcf read: GIMP 3.2 high bit depth (16/32-bit integer, half / float / double, linear and gamma) gives the 8-bit values", () => {
		for (const f of ["small-u16-linear-rle.xcf", "small-u32-gamma-rle.xcf", "small-half-gamma-rle.xcf", "small-half-linear-zlib.xcf", "small-float-linear-rle.xcf", "small-double-gamma-rle.xcf"]) {
			const r = fx(f), [T, B] = r.layers; assert.deepStrictEqual(r.notes, [], f);
			for (const [x, y] of [[0, 0], [1, 1], [65, 39], [64, 10], [30, 20]]) assert.ok(near(at(B, x, y), [x * 3, y * 6, 200, 255], 1), f + " bg " + x + "," + y + " = " + at(B, x, y));
			assert.ok(near(at(T, 0, 0), [250, 128, 10, 255], 1), f + " top"); assert.ok(near(at(T, 29, 19), [250, 128, 10, 100], 1), f + " top alpha " + at(T, 29, 19));
			assert.deepStrictEqual([T.x, T.y], [40, -5]); assert.ok(Math.abs(T.opacity - 0.75) < 1e-6); assert.strictEqual(T.mask.data[0], 0); assert.strictEqual(T.mask.data[5 * 30], 255);
		}
		const l8 = fx("small-u8-linear-rle.xcf"); assert.ok(near(at(l8.layers[1], 65, 39), [195, 234, 200, 255], 3));
	});
	t("xcf read: GIMP 3.2 grayscale 8/16-bit, indexed, legacy mode, live filter note", () => {
		for (const f of ["small-gray8-rle.xcf", "small-gray16-rle.xcf"]) { const r = fx(f); assert.strictEqual(r.base, "Grayscale"); const p = at(r.layers[0], 0, 0); assert.ok(p[0] === p[1] && p[1] === p[2] && Math.abs(p[0] - 163) <= 2 && p[3] === 255, f + " " + p); }
		const ix = fx("small-indexed-rle.xcf"); assert.strictEqual(ix.base, "Indexed"); assert.ok(near(at(ix.layers[0], 0, 0), [250, 128, 10, 255], 4)); assert.ok(near(at(ix.layers[1], 65, 39), [195, 234, 200, 255], 30));
		const pl = fx("plain-rgb8-rle.xcf"); assert.strictEqual(pl.layers[0].blend, "screen"); assert.deepStrictEqual(at(pl.layers[0], 0, 0), [10, 200, 90, 128]);
		const lo = fx("lossy-rgb8-rle.xcf"); assert.strictEqual(lo.version, 23); assert.strictEqual(lo.layers[0].mask, null); assert.ok(lo.layers[0].maskOff); assert.strictEqual(lo.layers[2].parent, 1); assert.strictEqual(lo.layers[3].blend, null); assert.strictEqual(lo.layers[4].blend, null);
		assert.deepStrictEqual(lo.notes, ["Disabled layer masks were left out (Mask off)", "Masks on layer groups are not supported: left out (Masked group)", "Group blend modes are not supported: groups are drawn as pass-through (Masked group)", "Layer mode “Grain merge” is not in this editor: drawn as Normal (Grain)", "Layer mode “Addition” is not in this editor: drawn as Normal (Add)"]);
		const ef = fx("effect-rgb8-rle.xcf"); assert.strictEqual(ef.version, 22); assert.strictEqual(ef.layers[1].effects, 1); assert.ok(ef.notes.some((s) => /live filters/.test(s)));
	});
}
// ---------- round 5: project files, ZIPs, recent projects ----------
{
	const zlib = require("zlib"), I = require("./image-converter/lib.js");
	t("projectKind / projectBase / projectFileName", () => {
		assert.strictEqual(P.projectKind("A.MESPROJ"), "mesproj"); assert.strictEqual(P.projectKind("a.zip"), "zip"); assert.strictEqual(P.projectKind("a.png"), null);
		assert.strictEqual(P.projectBase("Fetzer.mesproj"), "Fetzer"); assert.strictEqual(P.projectBase("Fetzer.zip"), "Fetzer"); assert.strictEqual(P.projectBase("Fetzer.mesproj.zip"), "Fetzer"); assert.strictEqual(P.projectBase("dir/x.zip"), "x"); assert.strictEqual(P.projectBase(""), "Untitled");
		assert.strictEqual(P.projectFileName("Fetzer: 9/11?", "mesproj"), "Fetzer 9 11.mesproj"); assert.strictEqual(P.projectFileName("  ", "zip"), "Untitled.zip"); assert.strictEqual(P.projectFileName("..hidden"), "hidden.mesproj");
	});
	const stored = I.zipStore([{ name: "project.json", data: Buffer.from('{"v":2}') }, { name: "layer-1.png", data: Buffer.from("PNGDATA") }]);
	t("isZipBytes + zipEntries read a stored ZIP like zipRead", () => {
		assert.ok(P.isZipBytes(stored)); assert.ok(!P.isZipBytes(Buffer.from("hello"))); const e = P.zipEntries(stored);
		assert.deepStrictEqual(e.map((x) => [x.name, x.method, Buffer.from(x.data).toString()]), [["project.json", 0, '{"v":2}'], ["layer-1.png", 0, "PNGDATA"]]);
		assert.strictEqual(P.zipEntries(Buffer.from("not a zip at all, no end record here...")), null);
	});
	t("zipEntries reads a deflated ZIP (as Finder / Explorer make), folders skipped", () => {
		// hand-built ZIP: a folder entry, then a deflated file inside it
		const files = [{ name: "Fetzer/", data: Buffer.alloc(0), m: 0 }, { name: "Fetzer/project.json", data: Buffer.from('{"app":"MES Photo Editor","v":3}'), m: 8 }];
		const parts = [], cen = []; let off = 0;
		for (const f of files) { const comp = f.m ? zlib.deflateRawSync(f.data) : f.data, nm = Buffer.from(f.name), lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(f.m, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(nm.length, 26); parts.push(lh, nm, comp);
			const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(f.m, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42); cen.push(ch, nm); off += 30 + nm.length + comp.length; }
		const cd = Buffer.concat(cen), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
		const z = new Uint8Array(Buffer.concat([...parts, cd, end])), e = P.zipEntries(z); assert.strictEqual(e.length, 1); assert.strictEqual(e[0].method, 8);
		assert.strictEqual(zlib.inflateRawSync(Buffer.from(e[0].data)).toString(), '{"app":"MES Photo Editor","v":3}'); assert.strictEqual(P.projectPrefix(e.map((x) => x.name)), "Fetzer/");
	});
	t("projectPrefix", () => {
		assert.strictEqual(P.projectPrefix(["project.json", "layer-1.png"]), ""); assert.strictEqual(P.projectPrefix(["a/b/project.json", "a/project.json"]), "a/");
		assert.strictEqual(P.projectPrefix(["__MACOSX/x/project.json", "x/project.json"]), "x/"); assert.strictEqual(P.projectPrefix(["x/._project.json"]), null); assert.strictEqual(P.projectPrefix(["layer.png"]), null);
	});
	t("pruneRecent keeps the newest 8, a byte budget, and remembered files", () => {
		const L = []; for (let i = 0; i < 10; i++) L.push({ id: "p" + i, t: 1000 + i, bytes: 10 });
		let r = P.pruneRecent(L, 8, 1e9); assert.deepStrictEqual(r.keep.map((e) => e.id), ["p9", "p8", "p7", "p6", "p5", "p4", "p3", "p2"]); assert.deepStrictEqual(r.drop, ["p1", "p0"]);
		r = P.pruneRecent([{ id: "a", t: 3, bytes: 300 }, { id: "b", t: 2, bytes: 300, file: { name: "b.mesproj" } }, { id: "c", t: 1, bytes: 100 }], 8, 500);
		assert.deepStrictEqual(r.keep.map((e) => [e.id, e.bytes]), [["a", 300], ["b", 0], ["c", 100]]); assert.deepStrictEqual(r.dropAuto, ["b"]); assert.deepStrictEqual(r.drop, []);
		r = P.pruneRecent([{ id: "a", t: 3, bytes: 900 }, { id: "b", t: 2, bytes: 1 }], 8, 500); assert.deepStrictEqual(r.keep.map((e) => e.id), ["a"]); assert.deepStrictEqual(r.drop, ["b"]);   // the newest is kept even over budget
		r = P.pruneRecent([{ id: "a", t: 1 }, { id: "a", t: 5 }, null], 8, 500); assert.strictEqual(r.keep.length, 1);
	});
	t("upsertRecent merges and moves to the top", () => { const l = P.upsertRecent([{ id: "a", name: "A", t: 1 }, { id: "b", t: 2 }], { id: "a", t: 9 }); assert.deepStrictEqual(l, [{ id: "a", name: "A", t: 9 }, { id: "b", t: 2 }]); });
	t("agoText / diskChanged", () => {
		const now = Date.UTC(2026, 9, 24, 12); assert.strictEqual(P.agoText(now - 5000, now), "just now"); assert.strictEqual(P.agoText(now - 120000, now), "2 min ago"); assert.strictEqual(P.agoText(now - 3 * 3600e3, now), "3 h ago"); assert.ok(/^on \d+ \w{3}$/.test(P.agoText(now - 3 * 86400e3, now))); assert.strictEqual(P.agoText(0, now), "");
		assert.ok(!P.diskChanged(1000, 1500)); assert.ok(P.diskChanged(1000, 5000)); assert.ok(!P.diskChanged(0, 5000));
	});
	t("layerFileNames are numbered, unique and safe", () => { assert.deepStrictEqual(P.layerFileNames(["Background", "Title: 9/11", "Background", ""]), ["01 Background.png", "02 Title 9 11.png", "03 Background.png", "04 Layer.png"]); });
	t("newProjectId", () => { assert.ok(/^p[a-z0-9]{12}$/.test(P.newProjectId())); assert.notStrictEqual(P.newProjectId(), P.newProjectId()); });
}
// Rich text (bold / italic / underline per letter), Auto-fit text, project folders
t("rich text: edits keep styles, new letters take the style before them", () => {
	assert.strictEqual(P.richMask(true, false, true), 5);
	let r = P.richSet("0000000000", 3, 6, 1, true); assert.strictEqual(r, "0001110000");
	assert.strictEqual(P.richEdit(r, "abcdefghij", "abcdeXXfghij", 0), "000111110000");   // typing inside the bold part -> bold
	assert.strictEqual(P.richEdit(r, "abcdefghij", "abcghij", 0), "0000000");          // deleting the bold part
	assert.strictEqual(P.richEdit(r, "abcdefghij", "Zabcdefghij", 0), "00001110000");  // at the start: style of the first letter
	assert.strictEqual(P.richEdit("15", "ab", "", 0), ""); assert.strictEqual(P.richEdit(null, "a", "ab", 0), null);
	assert.ok(P.richAll("0111", 1, 4, 1)); assert.ok(!P.richAll("0111", 0, 4, 1)); assert.ok(P.richAll("0110", 3, 3, 1)); assert.ok(!P.richAll("0110", 1, 1, 1));
	assert.deepStrictEqual(P.richNorm("5555"), { rich: null, mask: 5 }); assert.deepStrictEqual(P.richNorm("1513"), { rich: "1513", mask: 1 });
	assert.deepStrictEqual(P.richSegs("0011400", 1, 6, 0), [{ s: 1, e: 2, m: 0 }, { s: 2, e: 4, m: 1 }, { s: 4, e: 5, m: 4 }, { s: 5, e: 6, m: 0 }]);
	assert.deepStrictEqual(P.richSegs(null, 2, 5, 3), [{ s: 2, e: 5, m: 3 }]); assert.deepStrictEqual(P.richSegs(null, 2, 2, 3), []);
});
t("wrapLines / hitInLine pass the string position to measure (bold letters are wider)", () => {
	const s = "aaaa bbbb", rich = "000001111", me = (x, st) => { let w = 0; for (let i = 0; i < x.length; i++) w += rich[(st || 0) + i] === "1" ? 20 : 10; return w; };
	assert.deepStrictEqual(P.wrapLines(s, 100, me).map((l) => l.text), ["aaaa", "bbbb"]); assert.deepStrictEqual(P.wrapLines(s, 130, me).map((l) => l.text), ["aaaa bbbb"]);
	const L = P.wrapLines(s, 100, me); assert.strictEqual(P.hitInLine(L[1], 41, me), 7);
});
t("fitFontSize: the largest size whose wrapped text fits the box", () => {
	const at = (sz) => (x) => x.length * sz * 0.5;
	const f = P.fitFontSize("Hello world", 300, 100, 1.2, at, 4, 1000); assert.ok(f > 4 && f < 1000);
	const lines = P.wrapLines("Hello world", 300, at(f)).length; assert.ok(f * (1.2 * lines + 0.25) <= 100); assert.ok(at(f)("world") <= 300);
	const g = P.fitFontSize("Hello world", 300, 100, 1.2, at, 4, 1000), bigger = g + 1; assert.ok(at(bigger)("Hello") > 300 || bigger * (1.2 * P.wrapLines("Hello world", 300, at(bigger)).length + 0.25) > 100);
	assert.strictEqual(P.fitFontSize("x", 0, 50, 1.2, at), null); assert.ok(P.fitFontSize("a b c d e f g h", 100, 400, 1.2, at, 4, 1000) > P.fitFontSize("a b c d e f g h", 100, 100, 1.2, at, 4, 1000));
	assert.ok(f % 0.5 === 0);
});
t("folderProject: the project files of an unzipped .mesproj", () => {
	const r = P.folderProject(["Fetzer/project.json", "Fetzer/layer-1.png", "Fetzer/mask-1.png", "Fetzer/notes.txt", "__MACOSX/Fetzer/._layer-1.png", "Fetzer/._project.json", "Fetzer/old/project.json"]);
	assert.strictEqual(r.prefix, "Fetzer/"); assert.deepStrictEqual(r.files, ["Fetzer/project.json", "Fetzer/layer-1.png", "Fetzer/mask-1.png"]);
	assert.deepStrictEqual(P.folderProject(["project.json", "layer-2.png", "sub/layer-3.png"]), { prefix: "", files: ["project.json", "layer-2.png"] });
	assert.strictEqual(P.folderProject(["a.png", "b.jpg"]), null);
});
console.log(n + " checks ok");
