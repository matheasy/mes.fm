/* MES Font Preview and Finder -- pure helpers (no DOM). Browser global `MESFont`; node: require('./tool_apps_src/fonts/lib.js'); tests: node tool_apps_src/fonts-tests.js
 * font catalogue, style presets, CSS builder, and the picture matcher maths (binarise, crop to the ink, shrink to a grid, compare). app.js does the drawing. */
(function (root) {
	"use strict";
	var CATS = [["all", "All"], ["sans", "Sans-serif"], ["serif", "Serif"], ["mono", "Monospace"], ["display", "Display"], ["hand", "Handwriting"]];
	function list(cat, names) { return names.split("|").map(function (n) { return [n.trim(), cat]; }); }
	// fonts the page looks for on the visitor's own computer (only the ones found are shown)
	var LOCAL = [].concat(
		list("sans", "Arial|Helvetica|Helvetica Neue|Verdana|Tahoma|Trebuchet MS|Segoe UI|Calibri|Candara|Gill Sans|Optima|Futura|Avenir|Avenir Next|Geneva|Century Gothic|Franklin Gothic Medium|Arial Narrow|Lucida Grande|Corbel|Myriad Pro|San Francisco|Noto Sans|Ubuntu|Cantarell|DejaVu Sans|Liberation Sans"),
		list("serif", "Georgia|Times New Roman|Times|Palatino|Palatino Linotype|Book Antiqua|Garamond|Baskerville|Cambria|Constantia|Hoefler Text|Didot|Bodoni 72|Rockwell|Century Schoolbook|Bookman Old Style|Cochin|Charter|Noto Serif|DejaVu Serif|Liberation Serif"),
		list("mono", "Courier New|Courier|Monaco|Menlo|Consolas|Lucida Console|SF Mono|Andale Mono|DejaVu Sans Mono|Liberation Mono|Cascadia Code|Fira Code|JetBrains Mono"),
		list("display", "Impact|Arial Black|Copperplate|Papyrus|Chalkduster|Marker Felt|Comic Sans MS|Luminari|Phosphate|Herculanum|Trattatello|Party LET|American Typewriter|Big Caslon|Stencil|Jokerman|Chiller|Ravie|Showcard Gothic|Algerian|Bauhaus 93|Broadway|Cooper Black|Gill Sans Ultra Bold|Rockwell Extra Bold|Haettenschweiler|Bernard MT Condensed|Britannic Bold|Agency FB|Castellar|Playbill|Snap ITC|Curlz MT"),
		list("hand", "Brush Script MT|Segoe Script|Segoe Print|Lucida Handwriting|Bradley Hand|Snell Roundhand|Zapfino|Noteworthy|Chalkboard|Ink Free|Mistral|Kristen ITC|Monotype Corsiva|Apple Chancery|Savoye LET|Bradley Hand ITC")
	);
	// popular Google Fonts, loaded only when the visitor asks (regular weight; bold is synthesised)
	var GOOGLE = [].concat(
		list("sans", "Roboto|Open Sans|Montserrat|Lato|Poppins|Inter|Nunito|Raleway|Work Sans|Source Sans 3|DM Sans|Rubik|Oswald|Bebas Neue|Barlow|Fira Sans|Quicksand|Manrope|Outfit|Josefin Sans"),
		list("serif", "Playfair Display|Merriweather|Lora|Roboto Slab|Crimson Text|Libre Baskerville|Cormorant Garamond|PT Serif|EB Garamond|DM Serif Display|Bitter|Spectral"),
		list("mono", "Roboto Mono|Fira Code|JetBrains Mono|Source Code Pro|Space Mono|IBM Plex Mono"),
		list("display", "Anton|Bangers|Lobster|Pacifico|Righteous|Abril Fatface|Alfa Slab One|Fredoka|Press Start 2P|Permanent Marker|Orbitron|Bungee|Shrikhand|Monoton|Fascinate|Black Ops One|Rubik Mono One|Titan One"),
		list("hand", "Dancing Script|Caveat|Great Vibes|Satisfy|Shadows Into Light|Indie Flower|Sacramento|Amatic SC|Kalam|Patrick Hand|Cookie|Yellowtail")
	);
	var DEFAULT = { text: "Your headline here", size: 56, weight: "400", italic: false, color: "#111111", bg: "#ffffff", bgOn: false, ls: 0, lh: 1.15, align: "left", tf: "none",
		shadowOn: false, shadow: "#000000", shBlur: 8, shX: 4, shY: 4, strokeOn: false, stroke: "#ffffff", strokeW: 2, gradOn: false, g1: "#f97316", g2: "#db2777", gAng: 90, glowOn: false, glow: "#38bdf8", glowBlur: 16 };
	var PRESETS = [
		["Clean", {}],
		["Hero headline", { size: 84, weight: "800", ls: -2, lh: 1.02, color: "#0f172a" }],
		["Sale badge", { size: 72, weight: "900", tf: "uppercase", ls: 2, color: "#ffffff", bgOn: true, bg: "#dc2626", shadowOn: true, shadow: "#7f1d1d", shBlur: 0, shX: 5, shY: 5 }],
		["Neon sign", { size: 72, weight: "400", color: "#ffffff", bgOn: true, bg: "#0b0b1a", glowOn: true, glow: "#22d3ee", glowBlur: 22, ls: 3 }],
		["Retro 3D", { size: 84, weight: "900", color: "#fde047", bgOn: true, bg: "#1e3a8a", shadowOn: true, shadow: "#be185d", shBlur: 0, shX: 6, shY: 6, strokeOn: true, stroke: "#be185d", strokeW: 2 }],
		["Outline", { size: 96, weight: "900", color: "#ffffff", bgOn: true, bg: "#111111", strokeOn: true, stroke: "#facc15", strokeW: 3, tf: "uppercase" }],
		["Gradient pop", { size: 90, weight: "900", gradOn: true, g1: "#f97316", g2: "#db2777", gAng: 90, ls: -1 }],
		["Elegant", { size: 64, weight: "400", italic: true, ls: 1, color: "#3f2d20", bgOn: true, bg: "#f8f1e7", lh: 1.25 }],
		["Quote card", { size: 48, weight: "600", align: "center", color: "#ffffff", bgOn: true, bg: "#334155", lh: 1.3 }]
	];
	function style(o) { return Object.assign({}, DEFAULT, o || {}); }
	function ffam(name) { return /^[a-z-]+$/i.test(name) && /^(serif|sans-serif|monospace|cursive|system-ui)$/i.test(name) ? name : "'" + String(name).replace(/['\\]/g, "") + "'"; }
	// the CSS a designer can paste: font + colours + effects of a style object for a family (fallback by category)
	function css(family, cat, o) {
		o = style(o); var fb = cat === "serif" ? "serif" : cat === "mono" ? "monospace" : cat === "hand" ? "cursive" : "sans-serif", L = [];
		L.push("font-family: " + ffam(family) + ", " + fb + ";", "font-size: " + o.size + "px;", "font-weight: " + o.weight + ";");
		if (o.italic) L.push("font-style: italic;"); if (o.ls) L.push("letter-spacing: " + o.ls + "px;"); L.push("line-height: " + o.lh + ";"); if (o.align !== "left") L.push("text-align: " + o.align + ";"); if (o.tf !== "none") L.push("text-transform: " + o.tf + ";");
		if (o.gradOn) L.push("background: linear-gradient(" + o.gAng + "deg, " + o.g1 + ", " + o.g2 + ");", "-webkit-background-clip: text;", "background-clip: text;", "color: transparent;");
		else { L.push("color: " + o.color + ";"); if (o.bgOn) L.push("background: " + o.bg + ";"); }
		if (o.strokeOn) L.push("-webkit-text-stroke: " + o.strokeW + "px " + o.stroke + ";");
		var sh = []; if (o.shadowOn) sh.push(o.shX + "px " + o.shY + "px " + o.shBlur + "px " + o.shadow); if (o.glowOn) { sh.push("0 0 " + o.glowBlur + "px " + o.glow); sh.push("0 0 " + o.glowBlur * 2 + "px " + o.glow); }
		if (sh.length) L.push("text-shadow: " + sh.join(", ") + ";");
		return L.join("\n");
	}
	/* ---------- picture matcher ---------- */
	function otsu(gray) {   // threshold 0-255 separating dark from light (gray = array of 0-255)
		var h = new Array(256).fill(0), i, n = gray.length; for (i = 0; i < n; i++) h[gray[i] | 0]++; var sum = 0; for (i = 0; i < 256; i++) sum += i * h[i];
		var wB = 0, sB = 0, best = 0, th = 127; for (i = 0; i < 256; i++) { wB += h[i]; if (!wB) continue; var wF = n - wB; if (!wF) break; sB += i * h[i]; var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = i; } }
		return th;
	}
	function binarise(gray) {   // ink = the minority colour (dark text on light OR light text on dark): returns Uint8Array of 0 / 1
		var th = otsu(gray), b = new Uint8Array(gray.length), ink = 0, i; for (i = 0; i < gray.length; i++) { b[i] = gray[i] <= th ? 1 : 0; ink += b[i]; }
		if (ink > gray.length / 2) for (i = 0; i < b.length; i++) b[i] ^= 1; return b;
	}
	function inkBox(b, w, h) {
		var x0 = w, y0 = h, x1 = -1, y1 = -1; for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (b[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
		return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
	}
	function grid(b, w, h, box, gw, gh) {   // box of the binary picture averaged onto a gw x gh grid (Float32 0..1 ink density)
		var g = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh);
		for (var y = box.y; y < box.y + box.h; y++) { var gy = Math.min(gh - 1, Math.floor((y - box.y) * gh / box.h)); for (var x = box.x; x < box.x + box.w; x++) { var gx = Math.min(gw - 1, Math.floor((x - box.x) * gw / box.w)); g[gy * gw + gx] += b[y * w + x]; cnt[gy * gw + gx]++; } }
		for (var i = 0; i < g.length; i++) g[i] = cnt[i] ? g[i] / cnt[i] : 0; return g;
	}
	function blur(g, gw, gh) {
		var o = new Float32Array(g.length); for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) { var s = 0, c = 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) { var wt = (dx === 0 && dy === 0) ? 2 : 1; s += g[yy * gw + xx] * wt; c += wt; } } o[y * gw + x] = s / c; }
		return o;
	}
	function cosine(a, b) { var ab = 0, aa = 0, bb = 0; for (var i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? ab / Math.sqrt(aa * bb) : 0; }
	// similarity 0..1 of two ink grids, discounted when the shapes' proportions differ (a condensed font vs a wide one)
	function similarity(gA, gB, gw, gh, aspA, aspB) { var s = cosine(blur(gA, gw, gh), blur(gB, gw, gh)), pen = Math.exp(-Math.abs(Math.log(aspA / aspB)) * 1.6); return Math.max(0, s) * pen; }
	/* card sizes: minimum column width in em of the font grid */
	var CARD_W = { s: 13, m: 19, l: 27, xl: 38 };
	var M = { CARD_W: CARD_W, CATS: CATS, LOCAL: LOCAL, GOOGLE: GOOGLE, DEFAULT: DEFAULT, PRESETS: PRESETS, style: style, css: css, ffam: ffam, otsu: otsu, binarise: binarise, inkBox: inkBox, grid: grid, blur: blur, cosine: cosine, similarity: similarity };
	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESFont = M;
})(typeof window !== "undefined" ? window : globalThis);
