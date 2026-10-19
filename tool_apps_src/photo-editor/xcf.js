/* MES XCF writer (GIMP's native format), pure: window.MESXcf.write({ w, h, layers: [{ name, x, y, w, h, data (RGBA Uint8 array), opacity 0-1, visible, mode (GIMP layer mode number) }] }) -> Uint8Array.
 * Layers are given bottom-first (like the editor); the file lists them top-first. Format "gimp xcf file" (version 0): 32-bit pointers, 8-bit RGB(A), 64x64 tiles with no compression.
 * GIMP 2.x and 3 open it. Layer masks, groups and text are not written (the editor flattens them into pixels first). Checked against the independent `gimpformats` Python reader (tool_apps_src/photo-editor-tests.js notes). */
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
	root.MESXcf = { write: write, MODES: MODES };
	if (typeof module !== "undefined" && module.exports) module.exports = root.MESXcf;
})(typeof window !== "undefined" ? window : globalThis);
