/* MES XCF (GIMP's native format), pure, runs in node too.
 * write: window.MESXcf.write({ w, h, layers: [{ name, x, y, w, h, data (RGBA Uint8 array), opacity 0-1, visible, mode (GIMP layer mode number) }] }) -> Uint8Array.
 *   Layers are given bottom-first (like the editor); the file lists them top-first. Format "gimp xcf file" (version 0): 32-bit pointers, 8-bit RGB(A), 64x64 tiles with no compression.
 *   GIMP 2.x and 3 open it. Layer masks, groups and text are not written (the editor flattens them into pixels first). Checked against the independent `gimpformats` Python reader.
 * read: window.MESXcf.read(arrayBuffer | Uint8Array, { inflate }) -> { w, h, version, base, precision, compression, layers (TOP-first, like the file), notes }
 *   Versions 0-26 (32-bit pointers up to v10, 64-bit from v11), RGB / grayscale / indexed with or without alpha, every precision (8/16/32-bit integer, 16/32/64-bit float,
 *   linear or gamma: converted to 8-bit sRGB), tiles uncompressed / RLE / zlib (own inflate, so it is synchronous and finds the end of the last tile itself),
 *   layer masks, groups (PROP_GROUP_ITEM + PROP_ITEM_PATH), text layers (pixels + the text from the gimp-text-layer parasite), offsets, opacity, visibility, modes.
 *   Layer: { name, x, y, w, h, data (RGBA Uint8ClampedArray, null for groups), opacity, visible, mode, blend (canvas op or null when the editor has no such mode),
 *   modeName, mask: { data (Uint8Array, w*h), w, h, x, y } | null, maskOff, group (true for groups), parent (index of the parent group in layers, or -1), text, effects, floating }.
 *   Anything it cannot use is listed in notes (never thrown), except a file that is not an XCF at all. Tests: node tool_apps_src/photo-editor-tests.js (real GIMP 3.2 files in tool_apps_src/photo-editor/xcf-fixtures/). */
(function (root) {
	"use strict";
	var MODES = { "source-over": 0, "multiply": 3, "screen": 4, "overlay": 5, "difference": 6, "darken": 9, "lighten": 10, "hue": 11, "saturation": 12, "color": 13, "luminosity": 14, "color-dodge": 16, "color-burn": 17, "hard-light": 18, "soft-light": 19 };
	function Writer() { this.b = new Uint8Array(1 << 16); this.n = 0; }
	Writer.prototype.need = function (k) { if (this.n + k > this.b.length) { var nb = new Uint8Array(Math.max(this.b.length * 2, this.n + k)); nb.set(this.b); this.b = nb; } };
	Writer.prototype.u8 = function (v) { this.need(1); this.b[this.n++] = v & 255; };
	Writer.prototype.u32 = function (v) { this.need(4); this.b[this.n++] = (v >>> 24) & 255; this.b[this.n++] = (v >>> 16) & 255; this.b[this.n++] = (v >>> 8) & 255; this.b[this.n++] = v & 255; };
	Writer.prototype.patch = function (at, v) { this.b[at] = (v >>> 24) & 255; this.b[at + 1] = (v >>> 16) & 255; this.b[at + 2] = (v >>> 8) & 255; this.b[at + 3] = v & 255; };
	Writer.prototype.bytes = function (arr) { this.need(arr.length); this.b.set(arr, this.n); this.n += arr.length; };
	Writer.prototype.str = function (s) { var e = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0x80) e.push(c); else if (c < 0x800) e.push(0xc0 | (c >> 6), 0x80 | (c & 63)); else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { var c2 = s.charCodeAt(++i), cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); e.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)); } else e.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); } e.push(0); this.u32(e.length); this.bytes(e); };   // GIMP strings: byte count incl. the NUL, then the bytes
	function prop(w, id, payload) { w.u32(id); w.u32(payload.length); w.bytes(payload); }
	function p32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
	function write(doc) {
		var w = new Writer(), layers = doc.layers.slice().reverse();
		w.bytes([103, 105, 109, 112, 32, 120, 99, 102, 32, 102, 105, 108, 101, 0]);   // "gimp xcf file\0"
		w.u32(doc.w); w.u32(doc.h); w.u32(0);                                          // size, RGB
		prop(w, 17, [0]);                                                               // PROP_COMPRESSION = none
		prop(w, 19, p32(0x43160000).concat(p32(0x43160000)));                          // PROP_RESOLUTION 150 x 150 dpi (floats)
		w.u32(0); w.u32(0);                                                             // PROP_END
		var ptrAt = w.n; layers.forEach(function () { w.u32(0); }); w.u32(0); w.u32(0); // layer pointers (patched), end of layers, end of channels
		layers.forEach(function (L, li) {
			w.patch(ptrAt + li * 4, w.n);
			w.u32(L.w); w.u32(L.h); w.u32(1); w.str(L.name || "Layer");               // type 1 = RGBA
			prop(w, 6, p32(Math.round(Math.max(0, Math.min(1, L.opacity == null ? 1 : L.opacity)) * 255)));
			prop(w, 8, p32(L.visible === false ? 0 : 1));
			prop(w, 7, p32(L.mode || 0));
			prop(w, 15, p32(L.x | 0).concat(p32(L.y | 0)));
			w.u32(0); w.u32(0);                                                         // PROP_END
			var hAt = w.n; w.u32(0); w.u32(0);                                          // hierarchy pointer, layer-mask pointer (none)
			w.patch(hAt, w.n);
			w.u32(L.w); w.u32(L.h); w.u32(4); var lvAt = w.n; w.u32(0); w.u32(0);       // hierarchy: size, bytes per pixel, pointer to level 0, end of levels
			w.patch(lvAt, w.n);
			var tx = Math.ceil(L.w / 64), ty = Math.ceil(L.h / 64), nt = tx * ty;
			w.u32(L.w); w.u32(L.h); var tAt = w.n; for (var t = 0; t < nt; t++) w.u32(0); w.u32(0);
			for (var j = 0; j < ty; j++) for (var i = 0; i < tx; i++) {
				w.patch(tAt + (j * tx + i) * 4, w.n);
				var x0 = i * 64, y0 = j * 64, tw = Math.min(64, L.w - x0), th = Math.min(64, L.h - y0), buf = new Uint8Array(tw * th * 4);
				for (var yy = 0; yy < th; yy++) { var so = ((y0 + yy) * L.w + x0) * 4; buf.set(L.data.subarray ? L.data.subarray(so, so + tw * 4) : L.data.slice(so, so + tw * 4), yy * tw * 4); }
				w.bytes(buf);
			}
		});
		return w.b.slice(0, w.n);
	}

	/* ================= reader ================= */
	/* zlib inflate (RFC 1950/1951), synchronous; stops at the end of the stream, so trailing bytes (the next tile) are fine. outLen = expected size (grows if needed) */
	var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258], LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
	var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577], DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
	var CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
	function huff(lengths, off, n) {
		var counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(n), i;
		for (i = 0; i < n; i++) counts[lengths[off + i]]++; counts[0] = 0;
		for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
		for (i = 0; i < n; i++) if (lengths[off + i]) syms[offs[lengths[off + i]]++] = i;
		return { c: counts, s: syms };
	}
	var FIXED = null;
	function fixedTables() {
		if (FIXED) return FIXED; var l = new Uint8Array(288), i; for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
		var d = new Uint8Array(30).fill(5); FIXED = { lt: huff(l, 0, 288), dt: huff(d, 0, 30) }; return FIXED;
	}
	function inflate(src, start, outLen) {
		var p = start || 0, end = src.length, bb = 0, bc = 0, out = new Uint8Array(Math.max(outLen || 0, 1024)), o = 0;
		function bits(n) { while (bc < n) { if (p >= end) throw new Error("zlib data ends early"); bb |= src[p++] << bc; bc += 8; } var v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v; }
		function sym(t) { var cur = 0, len = 0, sum = 0, c = t.c; do { if (bc === 0) { if (p >= end) throw new Error("zlib data ends early"); bb = src[p++]; bc = 8; } cur = 2 * cur + (bb & 1); bb >>>= 1; bc--; if (++len > 15) throw new Error("bad zlib code"); sum += c[len]; cur -= c[len]; } while (cur >= 0); return t.s[sum + cur]; }
		function need(k) { if (o + k <= out.length) return; var n2 = new Uint8Array(Math.max(out.length * 2, o + k)); n2.set(out.subarray(0, o)); out = n2; }
		var cmf = src[p], flg = src[p + 1]; if ((cmf & 15) !== 8 || ((cmf << 8) | flg) % 31) throw new Error("not zlib data"); p += 2; if (flg & 32) p += 4;
		var last;
		do {
			last = bits(1); var type = bits(2);
			if (type === 0) {
				bb = 0; bc = 0; if (p + 4 > end) throw new Error("zlib data ends early"); var len = src[p] | (src[p + 1] << 8); p += 4; if (p + len > end) throw new Error("zlib data ends early");
				need(len); out.set(src.subarray(p, p + len), o); o += len; p += len;
			} else if (type === 1 || type === 2) {
				var lt, dt;
				if (type === 1) { var f = fixedTables(); lt = f.lt; dt = f.dt; }
				else {
					var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4, cl = new Uint8Array(19), i;
					for (i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
					var ct = huff(cl, 0, 19), lens = new Uint8Array(hlit + hdist), k = 0;
					while (k < hlit + hdist) {
						var s = sym(ct);
						if (s < 16) lens[k++] = s;
						else { var rep, val = 0; if (s === 16) { if (!k) throw new Error("bad zlib lengths"); val = lens[k - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7); if (k + rep > hlit + hdist) throw new Error("bad zlib lengths"); while (rep--) lens[k++] = val; }
					}
					lt = huff(lens, 0, hlit); dt = huff(lens, hlit, hdist);
				}
				for (;;) {
					var c = sym(lt);
					if (c < 256) { need(1); out[o++] = c; }
					else if (c === 256) break;
					else {
						c -= 257; if (c >= 29) throw new Error("bad zlib length"); var ln = LBASE[c] + (LEXT[c] ? bits(LEXT[c]) : 0), dc = sym(dt); if (dc >= 30) throw new Error("bad zlib distance");
						var dist = DBASE[dc] + (DEXT[dc] ? bits(DEXT[dc]) : 0); if (dist > o) throw new Error("bad zlib distance"); need(ln);
						for (var q = 0; q < ln; q++, o++) out[o] = out[o - dist];
					}
				}
			} else throw new Error("bad zlib block");
		} while (!last);
		return out.length === o ? out : out.subarray(0, o);
	}

	/* GIMP layer modes -> canvas blend modes the editor has (null = no such mode here: drawn as Normal, and said in a note) */
	var BLEND = { 0: "source-over", 28: "source-over", 61: "source-over", 3: "multiply", 30: "multiply", 4: "screen", 31: "screen", 5: "soft-light", 23: "overlay", 6: "difference", 32: "difference",
		9: "darken", 35: "darken", 10: "lighten", 36: "lighten", 11: "hue", 37: "hue", 24: "hue", 12: "saturation", 38: "saturation", 25: "saturation", 13: "color", 39: "color", 26: "color",
		14: "luminosity", 40: "luminosity", 27: "luminosity", 56: "luminosity", 16: "color-dodge", 42: "color-dodge", 17: "color-burn", 43: "color-burn", 18: "hard-light", 44: "hard-light", 19: "soft-light", 45: "soft-light", 52: "exclusion" };
	var MODE_NAMES = ["Normal (legacy)", "Dissolve", "Behind", "Multiply (legacy)", "Screen (legacy)", "Overlay (old)", "Difference (legacy)", "Addition", "Subtract", "Darken only", "Lighten only", "Hue (HSV)", "Saturation (HSV)", "Color (HSL)", "Value (HSV)",
		"Divide", "Dodge", "Burn", "Hard light", "Soft light", "Grain extract", "Grain merge", "Color erase", "Overlay", "Hue (LCH)", "Chroma (LCH)", "Color (LCH)", "Lightness (LCH)", "Normal", "Behind", "Multiply", "Screen", "Difference",
		"Addition", "Subtract", "Darken only", "Lighten only", "Hue (HSV)", "Saturation (HSV)", "Color (HSL)", "Value (HSV)", "Divide", "Dodge", "Burn", "Hard light", "Soft light", "Grain extract", "Grain merge", "Vivid light", "Pin light",
		"Linear light", "Hard mix", "Exclusion", "Linear burn", "Luma darken only", "Luma lighten only", "Luminance", "Color erase", "Erase", "Merge", "Split", "Pass through"];

	/* precision field -> { b: bytes per component, f: float?, lin: linear light? } */
	function precisionOf(version, p) {
		if (version < 4) return { b: 1, f: false, lin: false, name: "8-bit" };
		var t;
		if (version === 4) t = [[1, 0, 0], [2, 0, 0], [4, 0, 1], [2, 1, 1], [4, 1, 1]][p];
		else if (version <= 6) t = { 100: [1, 0, 1], 150: [1, 0, 0], 200: [2, 0, 1], 250: [2, 0, 0], 300: [4, 0, 1], 350: [4, 0, 0], 400: [2, 1, 1], 450: [2, 1, 0], 500: [4, 1, 1], 550: [4, 1, 0] }[p];
		else { var base = Math.floor(p / 100); t = { 1: [1, 0], 2: [2, 0], 3: [4, 0], 5: [2, 1], 6: [4, 1], 7: [8, 1] }[base]; if (t) t = [t[0], t[1], p % 100 === 0 ? 1 : 0]; }
		if (!t) throw new Error("This GIMP file uses an unknown precision (" + p + ")");
		return { b: t[0], f: !!t[1], lin: !!t[2], name: (t[0] * 8) + "-bit " + (t[1] ? "float" : "integer") + (t[2] ? " linear" : "") };
	}
	var HALF = null, SRGB = null, SRGB_N = 16384;
	function halfTable() { if (HALF) return HALF; HALF = new Float32Array(65536); for (var h = 0; h < 65536; h++) { var s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; HALF[h] = e === 0 ? s * f * Math.pow(2, -24) : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * Math.pow(2, e - 15); } return HALF; }
	function srgbTable() { if (SRGB) return SRGB; SRGB = new Uint8Array(SRGB_N + 1); for (var i = 0; i <= SRGB_N; i++) { var v = i / SRGB_N; SRGB[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); } return SRGB; }

	function read(input, opts) {
		opts = opts || {};
		var u = input instanceof Uint8Array ? input : new Uint8Array(input.buffer ? input.buffer : input, input.byteOffset || 0, input.byteLength);
		var dv = new DataView(u.buffer, u.byteOffset, u.byteLength), N = u.length, notes = [], noteSet = {};
		function note(t, who) { if (!noteSet[t]) { noteSet[t] = []; notes.push(t); } if (who && noteSet[t].indexOf(who) < 0) noteSet[t].push(who); }   // one line per kind of problem, with the layers it concerns
		function chk(p, k) { if (p < 0 || p + k > N) throw new Error("The file ends early (damaged or not finished saving)"); }
		var magic = "gimp xcf "; if (N < 26) throw new Error("This is not a GIMP .xcf file"); for (var i = 0; i < 9; i++) if (u[i] !== magic.charCodeAt(i)) throw new Error(u[0] === 0x1f && u[1] === 0x8b ? "This is a compressed .xcf.gz / .xcfgz: unzip it first, or save it from GIMP as a plain .xcf" : "This is not a GIMP .xcf file");
		var tag = String.fromCharCode(u[9], u[10], u[11], u[12]), version;
		if (tag === "file") version = 0; else if (/^v\d{3}$/.test(tag)) version = parseInt(tag.slice(1), 10); else throw new Error("Unknown GIMP file version (" + tag + ")");
		if (version >= 100) throw new Error("This is a CinePaint file (XCF " + version + "), not supported");
		if (version > 26) note("Made by a newer GIMP (file version " + version + "): read as far as this editor understands it");
		var pos = 14, wide = version >= 11;
		function u32() { chk(pos, 4); var v = dv.getUint32(pos); pos += 4; return v; }
		function i32() { chk(pos, 4); var v = dv.getInt32(pos); pos += 4; return v; }
		function ptr() { if (!wide) return u32(); chk(pos, 8); var hi = dv.getUint32(pos), lo = dv.getUint32(pos + 4); pos += 8; return hi * 4294967296 + lo; }
		function str() { var n = u32(); if (!n) return ""; chk(pos, n); var b = u.subarray(pos, pos + n - (u[pos + n - 1] === 0 ? 1 : 0)); pos += n; return utf8(b); }
		function props(cb) {
			for (var guard = 0; guard < 100000; guard++) {
				var id = u32(), len = u32(); if (id === 0) return;
				if (id === 1) { var nc = u32(); chk(pos, nc * 3); cb(id, pos - 4, 4 + nc * 3, nc); pos += nc * 3; continue; }   // PROP_COLORMAP: the length word is wrong in some old files
				chk(pos, len); cb(id, pos, len); pos += len;
			}
			throw new Error("Damaged property list");
		}
		var W = u32(), Hh = u32(), base = u32(); if (!W || !Hh || W > 524288 || Hh > 524288) throw new Error("Damaged GIMP file (canvas " + W + " × " + Hh + ")");
		if (base > 2) throw new Error("Unknown colour mode in this GIMP file");
		var prec = precisionOf(version, version >= 4 ? u32() : 150), compression = 0, cmap = null;
		if (base === 2 && prec.b !== 1) throw new Error("Damaged GIMP file (indexed image with " + prec.name + ")");
		var little = prec.b > 1 && version >= 7 && version <= 11;   // development GIMP builds wrote high-bit data in host order (see the XCF spec)
		props(function (id, p, len, nc) {
			if (id === 17) compression = u[p];
			else if (id === 1 && base === 2) { cmap = new Uint8Array(768); cmap.set(u.subarray(p + 4, p + 4 + Math.min(nc, 256) * 3)); }
		});
		if (compression > 2) throw new Error("This GIMP file uses a compression this editor cannot read (" + compression + ")");
		if (base === 2 && !cmap) { note("Indexed image without a colour map: shown in grey"); cmap = new Uint8Array(768); for (var ci = 0; ci < 256; ci++) cmap[ci * 3] = cmap[ci * 3 + 1] = cmap[ci * 3 + 2] = ci; }
		var lptrs = []; for (var g = 0; g < 1e6; g++) { var lp = ptr(); if (!lp) break; lptrs.push(lp); }
		var chans = 0; try { while (ptr()) chans++; } catch (e) { /* channel list is not needed */ }
		if (chans) note(chans + " saved selection channel" + (chans === 1 ? " was" : "s were") + " left out");
		var srgb = prec.lin || prec.f ? srgbTable() : null;   // float GIMP images are usually linear too; gamma floats skip the curve below
		var half = prec.f && prec.b === 2 ? halfTable() : null;
		/* one component (0..1) at raw[o] */
		function comp(raw, o) {
			switch (prec.b) {
				case 2: { var h = little ? raw[o] | (raw[o + 1] << 8) : (raw[o] << 8) | raw[o + 1]; return half ? half[h] : h / 65535; }
				case 4: { var d4 = new DataView(raw.buffer, raw.byteOffset + o, 4); return prec.f ? d4.getFloat32(0, little) : d4.getUint32(0, little) / 4294967295; }
				case 8: { var d8 = new DataView(raw.buffer, raw.byteOffset + o, 8); return d8.getFloat64(0, little); }
			}
			return raw[o] / 255;
		}
		function to8(v, colour) { if (!(v > 0)) return 0; if (v >= 1) return 255; return colour && prec.lin ? srgb[Math.round(v * SRGB_N)] : Math.round(v * 255); }
		var lin8 = prec.b === 1 && prec.lin ? (function () { var t = new Uint8Array(256), s = srgbTable(); for (var k = 0; k < 256; k++) t[k] = s[Math.round(k / 255 * SRGB_N)]; return t; })() : null;

		/* the pixels of a hierarchy -> raw interleaved bytes (w*h*bpp), or null */
		function pixels(hptr, w, h, bppWant, what) {
			pos = hptr; var hw = u32(), hh = u32(), bpp = u32(), lev = ptr();
			if (hw !== w || hh !== h) throw new Error(what + ": size does not match");
			if (bpp !== bppWant) throw new Error(what + ": " + bpp + " bytes per pixel, expected " + bppWant);
			pos = lev; var lw = u32(), lh = u32(); if (lw !== w || lh !== h) throw new Error(what + ": level size does not match");
			var tx = Math.ceil(w / 64), ty = Math.ceil(h / 64), nt = tx * ty, tp = new Array(nt + 1);
			for (var t = 0; t < nt; t++) { tp[t] = ptr(); if (!tp[t]) throw new Error(what + ": missing tiles"); }
			tp[nt] = ptr() || 0;
			var raw = new Uint8Array(w * h * bpp);
			for (var j = 0; j < ty; j++) for (var i = 0; i < tx; i++) {
				var k = j * tx + i, x0 = i * 64, y0 = j * 64, tw = Math.min(64, w - x0), th = Math.min(64, h - y0), n = tw * th, size = n * bpp, tile, p = tp[k];
				chk(p, 1);
				if (compression === 0) { chk(p, size); tile = u.subarray(p, p + size); }
				else if (compression === 2) { var lim = k + 1 < nt ? Math.min(N, tp[k + 1] > p ? tp[k + 1] : N) : N; tile = (opts.inflate || inflate)(u.subarray(0, lim), p, size); if (tile.length < size) throw new Error(what + ": a tile is too short"); }
				else tile = rle(p, n, bpp);
				for (var yy = 0; yy < th; yy++) raw.set(tile.subarray(yy * tw * bpp, (yy + 1) * tw * bpp), ((y0 + yy) * w + x0) * bpp);
			}
			return raw;
		}
		function rle(p, n, bpp) {
			var out = new Uint8Array(n * bpp);
			for (var c = 0; c < bpp; c++) {
				var k = 0;
				while (k < n) {
					chk(p, 1); var op = u[p++], cnt, v;
					if (op <= 126) { cnt = op + 1; chk(p, 1); v = u[p++]; if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = v; }
					else if (op === 127) { chk(p, 3); cnt = (u[p] << 8) | u[p + 1]; v = u[p + 2]; p += 3; if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = v; }
					else if (op === 128) { chk(p, 2); cnt = (u[p] << 8) | u[p + 1]; p += 2; chk(p, cnt); if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = u[p++]; }
					else { cnt = 256 - op; chk(p, cnt); if (k + cnt > n) throw new Error("Damaged tile (RLE)"); for (; cnt--; k++) out[k * bpp + c] = u[p++]; }
				}
			}
			return out;
		}
		/* raw pixels of one layer -> RGBA 8-bit */
		function toRGBA(raw, w, h, type) {
			var nc = [3, 4, 1, 2, 1, 2][type], alpha = type & 1, out = new Uint8ClampedArray(w * h * 4), n = w * h, b = prec.b, step = nc * b, p, i, o;
			if (type >= 4) { for (p = 0, i = 0, o = 0; p < n; p++, i += step, o += 4) { var ix = raw[i] * 3; out[o] = cmap[ix]; out[o + 1] = cmap[ix + 1]; out[o + 2] = cmap[ix + 2]; out[o + 3] = alpha ? raw[i + 1] : 255; } return out; }
			var grey = type >= 2;
			if (b === 1) {
				for (p = 0, i = 0, o = 0; p < n; p++, i += step, o += 4) {
					var r = raw[i], gg = grey ? r : raw[i + 1], bl = grey ? r : raw[i + 2];
					if (lin8) { r = lin8[r]; gg = lin8[gg]; bl = lin8[bl]; }
					out[o] = r; out[o + 1] = gg; out[o + 2] = bl; out[o + 3] = alpha ? raw[i + nc - 1] : 255;
				}
				return out;
			}
			for (p = 0, i = 0, o = 0; p < n; p++, i += step, o += 4) {
				var r2 = to8(comp(raw, i), true); out[o] = r2;
				out[o + 1] = grey ? r2 : to8(comp(raw, i + b), true); out[o + 2] = grey ? r2 : to8(comp(raw, i + 2 * b), true);
				out[o + 3] = alpha ? to8(comp(raw, i + (nc - 1) * b), false) : 255;
			}
			return out;
		}
		function maskData(raw, w, h) { var n = w * h, out = new Uint8Array(n), b = prec.b; if (b === 1) return raw.length === n ? raw : raw.subarray(0, n); for (var p = 0; p < n; p++) out[p] = to8(comp(raw, p * b), false); return out; }
		function parasiteText(p, len) {
			var e = p + len, q = p, save = pos;
			try {
				while (q < e) { pos = q; var name = str(), flags = u32(), plen = u32(); q = pos + plen; if (q > e) break;
					if (name === "gimp-text-layer") { var s = utf8(u.subarray(pos, pos + plen)), m = /\(text\s+"((?:[^"\\]|\\.)*)"/.exec(s) || /\(markup\s+"((?:[^"\\]|\\.)*)"/.exec(s); pos = save; if (!m) return ""; return m[1].replace(/\\(.)/g, function (a, c) { return c === "n" ? "\n" : c; }).replace(/<[^>]*>/g, ""); } }
			} catch (x) { /* ignore a broken parasite */ }
			pos = save; return null;
		}

		var layers = [], byPath = {}, top = 0;   // top = position of the next top-level item (top-level items carry no PROP_ITEM_PATH)
		lptrs.forEach(function (lp, li) {
			var L = { name: "Layer", x: 0, y: 0, w: 0, h: 0, data: null, opacity: 1, visible: true, mode: 0, blend: "source-over", modeName: "Normal", mask: null, maskOff: false, group: false, parent: -1, text: null, effects: 0, floating: false, path: null };
			try {
				pos = lp; L.w = u32(); L.h = u32(); var type = u32(); L.name = str() || "Layer";
				var opa = null, fopa = null, applyMask = true, isText = false;
				props(function (id, p, len) {
					var v = len >= 4 ? dv.getUint32(p) : 0;
					switch (id) {
						case 5: L.floating = true; break;
						case 6: opa = v; break;
						case 7: L.mode = v; break;
						case 8: L.visible = v !== 0; break;
						case 11: applyMask = v !== 0; break;
						case 15: L.x = dv.getInt32(p); L.y = dv.getInt32(p + 4); break;
						case 21: { var tx = parasiteText(p, len); if (tx != null) { isText = true; L.text = tx; } break; }
						case 26: isText = true; break;
						case 29: L.group = true; break;
						case 30: { var path = []; for (var q = 0; q + 4 <= len; q += 4) path.push(dv.getUint32(p + q)); L.path = path; break; }
						case 33: if (len >= 4) fopa = dv.getFloat32(p); break;
					}
				});
				L.opacity = Math.max(0, Math.min(1, fopa != null && isFinite(fopa) ? fopa : opa != null ? opa / 255 : 1));
				var hptr = ptr(), mptr = ptr();
				if (version >= 20) { var ne = 0; for (var e = 0; e < 1000; e++) { var ep = ptr(); if (!ep) break; ne++; } L.effects = ne; }
				L.modeName = MODE_NAMES[L.mode] || ("Mode " + L.mode);
				if (!L.path || !L.path.length) L.path = [top]; if (L.path.length === 1) top = L.path[0] + 1;
				if (L.path.length > 1) { var pk = L.path.slice(0, -1).join(","); L.parent = byPath[pk] != null ? byPath[pk] : -1; }
				if (L.group) { byPath[L.path.join(",")] = layers.length; L.blend = null; if (mptr) note("Masks on layer groups are not supported: left out", L.name); if (L.mode !== 61 && L.mode !== 0 && L.mode !== 28) note("Group blend modes are not supported: groups are drawn as pass-through", L.name); }
				else {
					if (type > 5 || [0, 0, 2, 2, 4, 4][type] !== base * 2) throw new Error("its colour type does not match the image");
					if (!L.w || !L.h) throw new Error("it is empty");
					if (L.w * L.h > 268435456) throw new Error("it is too large (" + L.w + " × " + L.h + ")");
					var nc = [3, 4, 1, 2, 1, 2][type];
					L.data = toRGBA(pixels(hptr, L.w, L.h, nc * prec.b, "Layer “" + L.name + "”"), L.w, L.h, type);
					L.blend = BLEND[L.mode] !== undefined ? BLEND[L.mode] : null;
					if (L.blend === null) note("Layer mode “" + L.modeName + "” is not in this editor: drawn as Normal", L.name);
					if (L.mode === 5) note("“Overlay (old)” layers from old GIMP files look like Soft light, so they open as Soft light", L.name);
					if (isText) { note("Text layers became pixels, named after their text", L.name); if (L.text && (!L.name || L.name === "Layer")) L.name = L.text.slice(0, 80); }
					if (L.effects) note("GIMP live filters (effects) are not applied: those layers show their pixels without them", L.name);
					if (L.floating) note("A floating selection opened as a normal layer", L.name);
					if (mptr) {
						pos = mptr; var mw = u32(), mh = u32(); str(); props(function () {}); var mh2 = ptr();
						if (mw !== L.w || mh !== L.h) note("A layer mask with the wrong size was left out", L.name);
						else if (!applyMask) { note("Disabled layer masks were left out", L.name); L.maskOff = true; }
						else L.mask = { data: maskData(pixels(mh2, mw, mh, prec.b, "Mask of “" + L.name + "”"), mw, mh), w: mw, h: mh };
					}
				}
				layers.push(L);
			} catch (err) {
				note("Layer " + (li + 1) + (L.name && L.name !== "Layer" ? " (“" + L.name + "”)" : "") + " could not be read: " + (err && err.message || err));
				if (L.group && L.path) { byPath[L.path.join(",")] = layers.length; L.data = null; layers.push(L); }
			}
		});
		notes = notes.map(function (t) { var w = noteSet[t]; return w.length ? t + " (" + w.slice(0, 4).join(", ") + (w.length > 4 ? " and " + (w.length - 4) + " more" : "") + ")" : t; });
		return { w: W, h: Hh, version: version, base: ["RGB", "Grayscale", "Indexed"][base], precision: prec.name, compression: ["none", "RLE", "zlib"][compression], layers: layers, notes: notes };
	}
	function utf8(b) {
		if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(b);
		var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
	}

	root.MESXcf = { write: write, read: read, inflate: inflate, MODES: MODES, BLEND: BLEND, MODE_NAMES: MODE_NAMES };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESXcf;
})(typeof window !== "undefined" ? window : globalThis);
