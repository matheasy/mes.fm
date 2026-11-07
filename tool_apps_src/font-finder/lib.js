/* MES Font Finder -- pure helpers (no DOM). Browser global `MESFF`; node: require('./tool_apps_src/font-finder/lib.js'); tests: node tool_apps_src/font-finder-tests.js
 * picture -> ink -> lines -> letters -> fingerprints; letter files (data/g/<code>.bin, made by build_font_finder_data.py) -> ranking.
 * The fingerprint maths MUST match fingerprint() in build_font_finder_data.py (the tests compare them on a recorded letter). */
(function (root) {
	"use strict";
	var G = 32, KER = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

	/* ---------- ink ---------- */
	function otsu(gray) {
		var h = new Array(256).fill(0), i, n = gray.length; for (i = 0; i < n; i++) h[gray[i] | 0]++;
		var sum = 0; for (i = 0; i < 256; i++) sum += i * h[i];
		var wB = 0, sB = 0, best = -1, th = 127;
		for (i = 0; i < 256; i++) { wB += h[i]; if (!wB) continue; var wF = n - wB; if (!wF) break; sB += i * h[i]; var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = i; } }
		return th;
	}
	// gray (0-255) -> 0/1 ink. mode: "auto" (ink = the minority colour), "dark" (dark text) or "light" (light text on dark)
	function binarise(gray, mode, thr) {
		var th = thr == null ? otsu(gray) : thr, b = new Uint8Array(gray.length), ink = 0, i;
		for (i = 0; i < gray.length; i++) { b[i] = gray[i] <= th ? 1 : 0; ink += b[i]; }
		var flip = mode === "light" || (mode !== "dark" && ink > gray.length / 2);
		if (flip) for (i = 0; i < b.length; i++) b[i] ^= 1;
		return b;
	}
	// RGBA pixels -> gray; transparent pixels count as white
	function grayOf(data) {
		var n = data.length / 4, g = new Uint8Array(n);
		for (var i = 0; i < n; i++) { var a = data[i * 4 + 3] / 255; g[i] = Math.round((0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * a + 255 * (1 - a)); }
		return g;
	}

	/* ---------- connected pieces -> lines -> letters ---------- */
	function components(b, w, h) {
		var lab = new Int32Array(w * h).fill(-1), comps = [], stack = [];
		for (var s = 0; s < w * h; s++) {
			if (!b[s] || lab[s] >= 0) continue;
			var id = comps.length, c = { x0: w, y0: h, x1: -1, y1: -1, n: 0, px: [] };
			lab[s] = id; stack.push(s);
			while (stack.length) {
				var p = stack.pop(), x = p % w, y = (p - x) / w; c.n++; c.px.push(p);
				if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
				for (var dy = -1; dy <= 1; dy++) { var yy = y + dy; if (yy < 0 || yy >= h) continue; for (var dx = -1; dx <= 1; dx++) { var xx = x + dx; if (xx < 0 || xx >= w) continue; var q = yy * w + xx; if (b[q] && lab[q] < 0) { lab[q] = id; stack.push(q); } } }
			}
			comps.push(c);
		}
		return comps;
	}
	function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }
	function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1); }
	// -> { lines: [{y0,y1,glyphs:[{x0,y0,x1,y1,px:[pixel index...]}]}] } ; noise specks dropped, i / j dots and broken strokes joined to their letter
	function segment(b, w, h) {
		var comps = components(b, w, h); if (!comps.length) return { lines: [] };
		var hs = comps.map(function (c) { return c.y1 - c.y0 + 1; }), bigH = median(hs.filter(function (v) { return v >= Math.max.apply(null, hs) * 0.25; }));
		comps = comps.filter(function (c) { var ch = c.y1 - c.y0 + 1, cw = c.x1 - c.x0 + 1; return c.n >= 3 && !(ch < bigH * 0.12 && cw < bigH * 0.12 && c.n < bigH * bigH * 0.004 + 3); });
		// lines: big pieces sorted by middle; a piece joins a line when it overlaps the line's height by half of its own height
		var big = comps.filter(function (c) { return c.y1 - c.y0 + 1 >= bigH * 0.45; }).sort(function (a, c) { return (a.y0 + a.y1) - (c.y0 + c.y1); }), lines = [];
		big.forEach(function (c) {
			var hc = c.y1 - c.y0 + 1, best = null, bo = 0;
			lines.forEach(function (L) { var o = overlap(c.y0, c.y1, L.y0, L.y1); if (o > bo) { bo = o; best = L; } });
			if (best && bo >= hc * 0.5) { best.y0 = Math.min(best.y0, c.y0); best.y1 = Math.max(best.y1, c.y1); best.c.push(c); } else lines.push({ y0: c.y0, y1: c.y1, c: [c] });
		});
		comps.forEach(function (c) {   // small pieces (dots, accents, commas) go to the nearest line
			if (big.indexOf(c) >= 0) return; var best = null, bd = 1e9, mid = (c.y0 + c.y1) / 2;
			lines.forEach(function (L) { var d = mid < L.y0 ? L.y0 - mid : mid > L.y1 ? mid - L.y1 : 0; if (d < bd) { bd = d; best = L; } });
			if (best && bd <= (best.y1 - best.y0 + 1) * 0.8) best.c.push(c);
		});
		lines.sort(function (a, c) { return a.y0 - c.y0; });
		lines.forEach(function (L) {
			var cs = L.c.sort(function (a, c) { return a.x0 - c.x0; }), out = [];
			cs.forEach(function (c) {
				var cw = c.x1 - c.x0 + 1, hit = null;
				for (var i = out.length - 1; i >= 0 && i >= out.length - 3; i--) {   // join pieces stacked above one another (i, j, !, ?, broken letters)
					var g = out[i], o = overlap(c.x0, c.x1, g.x0, g.x1), gw = g.x1 - g.x0 + 1;
					if (o >= Math.min(cw, gw) * 0.6) { hit = g; break; }
				}
				if (hit) { hit.x0 = Math.min(hit.x0, c.x0); hit.x1 = Math.max(hit.x1, c.x1); hit.y0 = Math.min(hit.y0, c.y0); hit.y1 = Math.max(hit.y1, c.y1); hit.px = hit.px.concat(c.px); }
				else out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, px: c.px.slice() });
			});
			L.glyphs = out.sort(function (a, c) { return a.x0 - c.x0; }); delete L.c;
		});
		return { lines: lines };
	}
	// a letter's own pixels cut out of the picture: {m: Uint8Array, w, h}
	function cutGlyph(g, w) {
		var gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1, m = new Uint8Array(gw * gh);
		g.px.forEach(function (p) { var x = p % w, y = (p - x) / w; m[(y - g.y0) * gw + (x - g.x0)] = 1; });
		return { m: m, w: gw, h: gh };
	}
	// split a letter box in two at the column with the least ink in its middle half (for touching letters)
	function splitGlyph(g, w) {
		var gw = g.x1 - g.x0 + 1; if (gw < 4) return null; var col = new Array(gw).fill(0);
		g.px.forEach(function (p) { col[(p % w) - g.x0]++; });
		var a = Math.floor(gw * 0.25), b = Math.ceil(gw * 0.75), best = a, bv = 1e9;
		for (var x = a; x <= b; x++) { var v = col[x] + Math.abs(x - gw / 2) * 0.01; if (v < bv) { bv = v; best = x; } }
		var L = { px: [] }, R = { px: [] };
		g.px.forEach(function (p) { ((p % w) - g.x0 < best ? L : R).px.push(p); });
		if (!L.px.length || !R.px.length) return null;
		return [L, R].map(function (q) { var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; q.px.forEach(function (p) { var x = p % w, y = (p - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }); q.x0 = x0; q.y0 = y0; q.x1 = x1; q.y1 = y1; return q; });
	}
	// make a line's letter boxes match the number of letters the person typed: join the closest neighbours (broken thin strokes)
	// or split the widest box (joined-up script) until the count is right. -> new array
	function fitCount(gl, n, w) {
		gl = gl.slice(); var guard = 0;
		while (gl.length > n && gl.length > 1 && guard++ < 200) {
			var bi = 0, bv = 1e9;
			for (var i = 0; i < gl.length - 1; i++) { var a = gl[i], b = gl[i + 1], gap = b.x0 - a.x1 - 1, v = gap + (Math.max(a.x1, b.x1) - Math.min(a.x0, b.x0)) * 0.15; if (v < bv) { bv = v; bi = i; } }
			gl.splice(bi, 2, mergeGlyphs(gl[bi], gl[bi + 1]));
		}
		while (gl.length < n && guard++ < 200) {
			var wi = -1, wv = 0; gl.forEach(function (g, i) { var r = (g.x1 - g.x0 + 1) / (g.y1 - g.y0 + 1); if (r > wv) { wv = r; wi = i; } });
			var parts = wi >= 0 ? splitGlyph(gl[wi], w) : null; if (!parts) break; gl.splice(wi, 1, parts[0], parts[1]);
		}
		return gl;
	}
	function mergeGlyphs(a, b) { return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), px: a.px.concat(b.px) }; }

	/* ---------- fingerprint (= build_font_finder_data.fingerprint) ---------- */
	function cover(n, s, off) {   // [{j, i, a}] : area of source pixel i inside target cell j
		var out = [];
		for (var i = 0; i < n; i++) { var a = i * s + off, b = (i + 1) * s + off; for (var j = Math.max(0, Math.floor(a)); j < Math.min(G, Math.ceil(b)); j++) { var v = Math.min(b, j + 1) - Math.max(a, j); if (v > 0) out.push([j, i, v]); } }
		return out;
	}
	function fingerprint(m, w, h) {
		var s = G / Math.max(w, h), ox = (G - w * s) / 2, oy = (G - h * s) / 2, cy = cover(h, s, oy), cx = cover(w, s, ox);
		var t = new Float64Array(G * w), g = new Float64Array(G * G), k, x;
		for (k = 0; k < cy.length; k++) { var j = cy[k][0], y = cy[k][1], a = cy[k][2], row = y * w; for (x = 0; x < w; x++) if (m[row + x]) t[j * w + x] += a; }
		for (var r = 0; r < G; r++) for (k = 0; k < cx.length; k++) { var v = t[r * w + cx[k][1]]; if (v) g[r * G + cx[k][0]] += v * cx[k][2]; }
		for (k = 0; k < g.length; k++) if (g[k] > 1) g[k] = 1;
		return blur(g);
	}
	function blur(g) {
		var hh = new Float64Array((G + 4) * G), o = new Float32Array(G * G), y, x, k;
		for (y = 0; y < G + 4; y++) { var yy = y - 2; if (yy < 0 || yy >= G) continue; for (x = 0; x < G; x++) { var s = 0; for (k = 0; k < 5; k++) { var xx = x + k - 2; if (xx >= 0 && xx < G) s += KER[k] * g[yy * G + xx]; } hh[y * G + x] = s; } }
		for (y = 0; y < G; y++) for (x = 0; x < G; x++) { var s2 = 0; for (k = 0; k < 5; k++) s2 += KER[k] * hh[(y + k) * G + x]; o[y * G + x] = s2; }
		return o;
	}

	/* ---------- whole words (joined-up scripts, where letters can't be cut apart) ---------- */
	var WH = 40;
	function coverN(n, s, off, N) { var out = []; for (var i = 0; i < n; i++) { var a = i * s + off, b = (i + 1) * s + off; for (var j = Math.max(0, Math.floor(a)); j < Math.min(N, Math.ceil(b)); j++) { var v = Math.min(b, j + 1) - Math.max(a, j); if (v > 0) out.push([j, i, v]); } } return out; }
	// stretch a mask onto GW x GH cells (area coverage), then blur twice (words never line up exactly)
	function stretch(m, w, h, GW, GH) {
		var cy = coverN(h, GH / h, 0, GH), cx = coverN(w, GW / w, 0, GW), t = new Float64Array(GH * w), g = new Float64Array(GW * GH), k, x;
		for (k = 0; k < cy.length; k++) { var j = cy[k][0], row = cy[k][1] * w, a = cy[k][2]; for (x = 0; x < w; x++) if (m[row + x]) t[j * w + x] += a; }
		for (var r = 0; r < GH; r++) for (k = 0; k < cx.length; k++) { var v = t[r * w + cx[k][1]]; if (v) g[r * GW + cx[k][0]] += v * cx[k][2]; }
		for (k = 0; k < g.length; k++) if (g[k] > 1) g[k] = 1;
		return blurN(blurN(g, GW, GH), GW, GH);
	}
	function blurN(g, W, H) {
		var t = new Float64Array(W * H), o = new Float64Array(W * H), x, y, k;
		for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var s = 0; for (k = 0; k < 5; k++) { var xx = x + k - 2; if (xx >= 0 && xx < W) s += KER[k] * g[y * W + xx]; } t[y * W + x] = s; }
		for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var s2 = 0; for (k = 0; k < 5; k++) { var yy = y + k - 2; if (yy >= 0 && yy < H) s2 += KER[k] * t[yy * W + x]; } o[y * W + x] = s2; }
		return o;
	}
	// person's word picture vs a font's: lower = closer. Both are stretched to the person's shape; a different width costs extra
	function wordScore(a, b) {
		var W = Math.max(8, Math.min(480, Math.round(WH * a.w / a.h))), A = stretch(a.m, a.w, a.h, W, WH), B = stretch(b.m, b.w, b.h, W, WH), d = 0, n = 0;
		for (var i = 0; i < A.length; i++) { var e = A[i] - B[i]; d += e * e; n += A[i] * A[i] + B[i] * B[i]; }
		var la = Math.log((a.w / a.h) / (b.w / b.h));
		return 4 * d / (n || 1) + 1.5 * la * la;
	}
	function wordPercent(score) { return Math.max(1, Math.min(99, Math.round(100 * Math.exp(-score * 0.5)))); }

	/* ---------- letter files ---------- */
	function parseShard(buf) {
		var dv = new DataView(buf), u8 = new Uint8Array(buf);
		if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "MFF1") throw new Error("not a letter file");
		var K = dv.getUint8(5), g = dv.getUint16(6, true), N = dv.getUint32(8, true), code = dv.getUint32(12, true), cs = dv.getFloat32(16, true), bs = dv.getFloat32(20, true), D = g * g, o = 24;
		var mean = new Float32Array(D), basis = new Float32Array(K * D), i;
		for (i = 0; i < D; i++) mean[i] = u8[o + i] / 255; o += D;
		var b8 = new Int8Array(buf, o, K * D); for (i = 0; i < K * D; i++) basis[i] = b8[i] * bs; o += K * D;
		var R = K + 4, coef = new Float32Array(N * K), met = new Uint8Array(N * 3), miss = new Uint8Array(N), c8 = new Int8Array(buf, o, N * R), varSum = 0, nv = 0;
		for (var r = 0; r < N; r++) {
			var base = r * R; miss[r] = u8[o + base + K + 3];
			for (var k = 0; k < K; k++) coef[r * K + k] = c8[base + k] * cs;
			met[r * 3] = u8[o + base + K]; met[r * 3 + 1] = u8[o + base + K + 1]; met[r * 3 + 2] = u8[o + base + K + 2];
			if (!miss[r]) { var ss = 0; for (k = 0; k < K; k++) ss += coef[r * K + k] * coef[r * K + k]; varSum += ss; nv++; }
		}
		return { K: K, G: g, N: N, ch: String.fromCharCode(code), mean: mean, basis: basis, coef: coef, met: met, miss: miss, v: nv ? varSum / nv : 1 };
	}
	function project(fp, sh) {
		var K = sh.K, D = fp.length, q = new Float32Array(K), d = new Float32Array(D), i;
		for (i = 0; i < D; i++) d[i] = fp[i] - sh.mean[i];
		for (var k = 0; k < K; k++) { var s = 0, b = k * D; for (i = 0; i < D; i++) s += d[i] * sh.basis[b + i]; q[k] = s; }
		return q;
	}
	function metOf(sh, r) { return { w: sh.met[r * 3] / 120, h: sh.met[r * 3 + 1] / 120, top: sh.met[r * 3 + 2] / 120 - 0.5 }; }

	/* ---------- ranking ---------- */
	var MISSING = 4, W_ASP = 2, W_REL = 3;
	// letters: [{ch, fp (Float32 1024), w, h, top}] (top = baseline - top of the ink, same unit as h); shards: {ch: parsed}
	// -> Float32Array score per record (lower = closer), records = the order of fonts.json "prim"
	function rank(letters, shards, N) {
		var tot = new Float32Array(N), use = letters.filter(function (L) { return shards[L.ch]; });
		if (!use.length) return tot;
		var qs = use.map(function (L) { return project(L.fp, shards[L.ch]); });
		var mh = 0; use.forEach(function (L) { mh += L.h; }); mh /= use.length;
		for (var r = 0; r < N; r++) {
			var s = 0, fh = [], ft = [];
			for (var i = 0; i < use.length; i++) {
				var L = use[i], sh = shards[L.ch];
				if (sh.miss[r]) { s += MISSING; fh.push(NaN); ft.push(NaN); continue; }
				var K = sh.K, q = qs[i], d = 0, b = r * K;
				for (var k = 0; k < K; k++) { var e = sh.coef[b + k] - q[k]; d += e * e; }
				var m = metOf(sh, r), la = Math.log((m.w / m.h) / (L.w / L.h));
				s += d / sh.v + W_ASP * la * la; fh.push(m.h); ft.push(m.top);
			}
			tot[r] = s / use.length + W_REL * 0.25 * relTerm(use, fh, ft, mh);
		}
		return tot;
	}
	// do the letters' heights and positions agree (x-height, ascenders, descenders)? scale free
	function relTerm(L, fh, ft, mh) {
		var n = 0, m = 0, i; for (i = 0; i < fh.length; i++) if (fh[i] === fh[i]) { m += fh[i]; n++; }
		if (n < 2) return 0; m /= n; var s = 0;
		for (i = 0; i < fh.length; i++) { if (fh[i] !== fh[i]) continue; var a = Math.log((fh[i] / m) / (L[i].h / mh)), b = ft[i] / m - L[i].top / mh; s += a * a + b * b; }
		return s / n;
	}
	// a score -> a friendly % (calibrated on test renders: same font ~ 90-99%, a close cousin 75-88%, unrelated < 55%)
	function percent(score) { return Math.max(1, Math.min(99, Math.round(100 * Math.exp(-score * 1.1)))); }

	/* ---------- font names, links, licences ---------- */
	var WNAME = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
	function styleName(w, it) { var n = WNAME[w] || String(w); return it ? (w === 400 ? "Italic" : n + " italic") : n; }
	var CATS = [["all", "All"], ["sans", "Sans-serif"], ["serif", "Serif"], ["display", "Display"], ["hand", "Handwriting"], ["mono", "Monospace"]];
	var LIC = { "OFL-1.1": "SIL Open Font License", "Apache-2.0": "Apache 2.0", "Apache License, Version 2.0": "Apache 2.0", "UFL-1.0": "Ubuntu Font Licence", "MIT": "MIT", "CC0-1.0": "Public domain (CC0)" };
	function licName(l) { return LIC[l] || l || "Open licence"; }
	function googleCss(family, w, it, text) {
		var q = "family=" + encodeURIComponent(family).replace(/%20/g, "+") + ":ital,wght@" + (it ? 1 : 0) + "," + w + "&display=block";
		if (text) q += "&text=" + encodeURIComponent(text);
		return "https://fonts.googleapis.com/css2?" + q;
	}
	function fontsourceFile(id, w, it) { return "https://cdn.jsdelivr.net/fontsource/fonts/" + id + "@latest/latin-" + w + "-" + (it ? "italic" : "normal") + ".woff2"; }
	function googlePage(family) { return "https://fonts.google.com/specimen/" + encodeURIComponent(family).replace(/%20/g, "+"); }
	function fontsourcePage(id) { return "https://fontsource.org/fonts/" + id; }
	function cssSnippet(f, w, it) {
		var fb = f.cat === "serif" ? "serif" : f.cat === "mono" ? "monospace" : f.cat === "hand" ? "cursive" : "sans-serif", L = [];
		if (f.google) L.push("@import url('" + googleCss(f.family, w, it) + "');", "");
		else L.push("/* npm install @fontsource/" + f.id + "  then:  import '@fontsource/" + f.id + "/" + w + (it ? "-italic" : "") + ".css'; */", "");
		L.push("font-family: '" + f.family + "', " + fb + ";", "font-weight: " + w + ";"); if (it) L.push("font-style: italic;");
		return L.join("\n");
	}
	// famous paid / system fonts and their free look-alikes in this library (shown on the result cards and in the "famous fonts" box)
	var TWINS = [
		["Arial", ["Arimo"]], ["Helvetica", ["Inter", "Arimo", "Roboto"]], ["Times New Roman", ["Tinos"]],
		["Courier New", ["Cousine", "Courier Prime"]], ["Calibri", ["Carlito"]], ["Cambria", ["Caladea"]], ["Georgia", ["Gelasio"]],
		["Futura", ["Jost", "League Spartan"]], ["Gotham", ["Montserrat"]], ["Proxima Nova", ["Montserrat", "Figtree"]], ["Avenir", ["Nunito Sans", "Figtree"]],
		["Gill Sans", ["Lato", "Cabin"]], ["Franklin Gothic", ["Libre Franklin"]], ["Myriad Pro", ["PT Sans", "Source Sans 3"]], ["Segoe UI", ["Open Sans", "Noto Sans"]],
		["Century Gothic", ["Questrial", "Didact Gothic"]], ["Garamond", ["EB Garamond", "Cormorant Garamond"]], ["Baskerville", ["Libre Baskerville"]],
		["Bodoni", ["Bodoni Moda"]], ["Didot", ["Playfair Display"]], ["Trajan", ["Cinzel"]], ["Optima", ["Marcellus"]], ["Rockwell", ["Arvo", "Roboto Slab"]],
		["Impact", ["Anton", "Oswald"]], ["Comic Sans MS", ["Comic Neue"]], ["Brush Script", ["Yellowtail"]], ["Cooper Black", ["Bitter"]], ["Verdana", ["PT Sans"]]
	];
	function twinOf(family) { var out = []; TWINS.forEach(function (t) { if (t[1].indexOf(family) >= 0) out.push(t[0]); }); return out; }
	function descender(ch) { return /[gjpqy,;Q]/.test(ch); }

	var M = { G: G, otsu: otsu, binarise: binarise, grayOf: grayOf, components: components, segment: segment, cutGlyph: cutGlyph, splitGlyph: splitGlyph, fitCount: fitCount, mergeGlyphs: mergeGlyphs, median: median,
		fingerprint: fingerprint, blur: blur, stretch: stretch, wordScore: wordScore, wordPercent: wordPercent, parseShard: parseShard, project: project, metOf: metOf, rank: rank, relTerm: relTerm, percent: percent, MISSING: MISSING, W_ASP: W_ASP, W_REL: W_REL,
		WNAME: WNAME, styleName: styleName, CATS: CATS, licName: licName, googleCss: googleCss, fontsourceFile: fontsourceFile, googlePage: googlePage, fontsourcePage: fontsourcePage, cssSnippet: cssSnippet,
		TWINS: TWINS, twinOf: twinOf, descender: descender };
	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESFF = M;
})(typeof window !== "undefined" ? window : globalThis);
