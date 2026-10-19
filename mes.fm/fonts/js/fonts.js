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
	var M = { CATS: CATS, LOCAL: LOCAL, GOOGLE: GOOGLE, DEFAULT: DEFAULT, PRESETS: PRESETS, style: style, css: css, ffam: ffam, otsu: otsu, binarise: binarise, inkBox: inkBox, grid: grid, blur: blur, cosine: cosine, similarity: similarity };
	if (typeof module !== "undefined" && module.exports) module.exports = M; else root.MESFont = M;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Font Preview and Finder (mes.fm/fonts). Fonts the browser really has (canvas width test) + optional Google Fonts / local font access / a font file; live preview with effects,
 * big preview with PNG + CSS, compare, favourites, and a picture matcher (binarise -> crop to the ink -> grid -> compare with each font). Pure helpers in lib.js (MESFont). */
(function () {
	"use strict";
	var F = window.MESFont, $ = function (id) { return document.getElementById(id); }, root = $("fn"); if (!root || !F) return;
	var KEY = "mes-fonts:v1", S = Object.assign({}, F.DEFAULT), st = { cat: "all", q: "", favOnly: false, fav: [], cmp: [], big: null, tab: "browse", google: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { if (sv.S) Object.assign(S, sv.S); if (Array.isArray(sv.fav)) st.fav = sv.fav; } } catch (e) { /* ignore */ }
	var qp = new URLSearchParams(location.search); if (qp.get("t")) S.text = qp.get("t").slice(0, 300); var startFont = qp.get("f") || "";
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ S: S, fav: st.fav })); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	var toastT; function toast(m) { var t = $("fn-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }

	/* ---------- which fonts exist ---------- */
	var fonts = [], names = {};
	function addFont(name, cat, src) { if (names[name]) return false; names[name] = 1; fonts.push({ name: name, cat: cat, src: src }); return true; }
	var mctx = document.createElement("canvas").getContext("2d"), SAMPLE = "mmmmmmmmmmlli0Oo", BASES = ["monospace", "sans-serif", "serif"];
	function width(f) { mctx.font = f; return mctx.measureText(SAMPLE).width; }
	var baseW = BASES.map(function (b) { return width("72px " + b); });
	function installed(name) { for (var i = 0; i < BASES.length; i++) if (Math.abs(width("72px '" + name + "', " + BASES[i]) - baseW[i]) > 0.01) return true; return false; }
	F.LOCAL.forEach(function (x) { if (installed(x[0])) addFont(x[0], x[1], "local"); });
	["serif", "sans-serif", "monospace", "cursive"].forEach(function (g) { addFont(g, g === "serif" ? "serif" : g === "monospace" ? "mono" : g === "cursive" ? "hand" : "sans", "generic"); });
	function fam(f) { return F.ffam(f.name); }

	/* ---------- style -> CSS variables on the grids ---------- */
	function applyVars(el) {
		var o = S, sh = []; if (o.shadowOn) sh.push(o.shX + "px " + o.shY + "px " + o.shBlur + "px " + o.shadow); if (o.glowOn) { sh.push("0 0 " + o.glowBlur + "px " + o.glow, "0 0 " + o.glowBlur * 2 + "px " + o.glow); }
		var s = el.style; s.setProperty("--fs", o.size + "px"); s.setProperty("--fw", o.weight); s.setProperty("--fst", o.italic ? "italic" : "normal"); s.setProperty("--ls", o.ls + "px"); s.setProperty("--lh", o.lh); s.setProperty("--al", o.align); s.setProperty("--tf", o.tf);
		s.setProperty("--fg", o.gradOn ? "transparent" : o.color); s.setProperty("--bgi", o.gradOn ? "linear-gradient(" + o.gAng + "deg," + o.g1 + "," + o.g2 + ")" : (o.bgOn ? o.bg : "transparent")); s.setProperty("--clip", o.gradOn ? "text" : "border-box");
		s.setProperty("--sh", sh.length ? sh.join(",") : "none"); s.setProperty("--stk", o.strokeOn ? o.strokeW + "px " + o.stroke : "0 transparent");
	}
	function sample(f, txt) { var d = document.createElement("div"); d.className = "fn-sample"; d.style.fontFamily = fam(f) + "," + (f.cat === "serif" ? "serif" : f.cat === "mono" ? "monospace" : "sans-serif"); d.textContent = txt == null ? S.text : txt; return d; }

	/* ---------- browse grid ---------- */
	var fontByName = function (n) { for (var i = 0; i < fonts.length; i++) if (fonts[i].name === n) return fonts[i]; return null; };
	function visible() { var q = st.q.trim().toLowerCase(); return fonts.filter(function (f) { return (st.cat === "all" || f.cat === st.cat) && (!q || f.name.toLowerCase().indexOf(q) >= 0) && (!st.favOnly || st.fav.indexOf(f.name) >= 0); }); }
	function renderGrid() {
		var g = $("fn-grid"); applyVars(g); var list = visible(); g.innerHTML = ""; var frag = document.createDocumentFragment();
		list.forEach(function (f) {
			var c = document.createElement("div"); c.className = "fn-card" + (st.big === f.name ? " is-on" : ""); var isFav = st.fav.indexOf(f.name) >= 0, inCmp = st.cmp.indexOf(f.name) >= 0;
			var h = document.createElement("div"); h.className = "fn-chead"; h.innerHTML = '<span class="fn-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span><span class="fn-acts"><button type="button" class="fn-ib' + (isFav ? " on" : "") + '" data-a="fav" title="' + (isFav ? "Remove from favourites" : "Add to favourites") + '" aria-label="Favourite">' + (isFav ? "★" : "☆") + '</button><button type="button" class="fn-ib' + (inCmp ? " on" : "") + '" data-a="cmp" title="Add to Compare (up to four)">⇆</button></span>';
			c.appendChild(h); var s = sample(f); s.setAttribute("data-a", "big"); c.appendChild(s); c.setAttribute("data-f", f.name); frag.appendChild(c);
		});
		g.appendChild(frag); $("fn-count").textContent = list.length + " of " + fonts.length + " fonts shown";
		if (!list.length) g.innerHTML = '<p class="tu-note">No fonts match. Clear the search or the filter, or press “Add 80 popular Google Fonts”.</p>';
	}
	$("fn-grid").addEventListener("click", function (e) {
		var c = e.target.closest(".fn-card"); if (!c) return; var name = c.getAttribute("data-f"), a = e.target.closest("[data-a]"); a = a && a.getAttribute("data-a");
		if (a === "fav") { var i = st.fav.indexOf(name); if (i >= 0) st.fav.splice(i, 1); else st.fav.push(name); save(); renderGrid(); return; }
		if (a === "cmp") { var j = st.cmp.indexOf(name); if (j >= 0) st.cmp.splice(j, 1); else if (st.cmp.length >= 4) { toast("Compare shows up to four fonts: remove one first"); return; } else st.cmp.push(name); renderGrid(); renderCompare(); toast(st.cmp.length + " font" + (st.cmp.length === 1 ? "" : "s") + " in Compare"); return; }
		openBig(name);
	});
	$("fn-cats").innerHTML = F.CATS.map(function (c) { return '<button type="button" class="tu-chip" data-c="' + c[0] + '" aria-pressed="' + (c[0] === "all") + '">' + c[1] + "</button>"; }).join("");
	$("fn-cats").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; st.cat = b.getAttribute("data-c"); Array.prototype.forEach.call($("fn-cats").children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderGrid(); });
	$("fn-q").addEventListener("input", function () { st.q = this.value; renderGrid(); }); $("fn-favonly").addEventListener("change", function () { st.favOnly = this.checked; renderGrid(); });

	/* ---------- big preview, CSS, PNG ---------- */
	function openBig(name) {
		var f = fontByName(name); if (!f) return; st.big = name; $("fn-big").hidden = false; $("fn-bigname").textContent = f.name + (f.src === "google" ? " (Google Font)" : "");
		var p = $("fn-bigprev"); applyVars(p); p.innerHTML = ""; p.appendChild(sample(f)); $("fn-css").textContent = F.css(f.name, f.cat, S); renderGrid(); $("fn-big").scrollIntoView({ block: "nearest", behavior: "smooth" });
	}
	$("fn-bigx").onclick = function () { st.big = null; $("fn-big").hidden = true; renderGrid(); };
	$("fn-csscopy").onclick = function () { copyText($("fn-css").textContent, "CSS copied"); };
	$("fn-share").onclick = function () { var u = location.origin + location.pathname + "?t=" + encodeURIComponent(S.text) + "&f=" + encodeURIComponent(st.big || ""); copyText(u, "Link copied"); };
	function copyText(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg); }, function () { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Select the text and press Ctrl+C"); } ta.remove(); }); }
	function renderPng(f) {
		var o = S, scale = 2, lines = (o.tf === "uppercase" ? o.text.toUpperCase() : o.tf === "lowercase" ? o.text.toLowerCase() : o.tf === "capitalize" ? o.text.replace(/\b(\w)/g, function (m) { return m.toUpperCase(); }) : o.text).split("\n");
		var font = (o.italic ? "italic " : "") + o.weight + " " + o.size * scale + "px " + fam(f), m = document.createElement("canvas").getContext("2d"); m.font = font; if ("letterSpacing" in m) m.letterSpacing = o.ls * scale + "px";
		var mw = Math.max.apply(null, lines.map(function (s) { return m.measureText(s).width; }).concat([10])), lhp = o.size * o.lh * scale, pad = (20 + Math.max(o.shadowOn ? o.shBlur + Math.abs(o.shX) + Math.abs(o.shY) : 0, o.glowOn ? o.glowBlur * 2 : 0, o.strokeOn ? o.strokeW : 0)) * scale;
		var W = Math.ceil(mw + pad * 2), H = Math.ceil(lhp * lines.length + pad * 2 + o.size * 0.3 * scale), c = document.createElement("canvas"); c.width = Math.min(W, 8000); c.height = Math.min(H, 8000); var x = c.getContext("2d");
		if (o.bgOn) { x.fillStyle = o.bg; x.fillRect(0, 0, c.width, c.height); }
		x.font = font; if ("letterSpacing" in x) x.letterSpacing = o.ls * scale + "px"; x.textBaseline = "alphabetic"; x.textAlign = o.align === "center" ? "center" : o.align === "right" ? "right" : "left"; x.lineJoin = "round";
		var px = o.align === "center" ? c.width / 2 : o.align === "right" ? c.width - pad : pad, fill = o.color;
		if (o.gradOn) { var a = (o.gAng - 90) * Math.PI / 180, cx = c.width / 2, cy = c.height / 2, r = Math.hypot(c.width, c.height) / 2, gr = x.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r); gr.addColorStop(0, o.g1); gr.addColorStop(1, o.g2); fill = gr; }
		lines.forEach(function (s, i) {
			var py = pad + lhp * i + o.size * scale * 0.92;
			if (o.glowOn) { x.save(); x.shadowColor = o.glow; x.shadowBlur = o.glowBlur * scale; x.fillStyle = fill; x.fillText(s, px, py); x.fillText(s, px, py); x.restore(); }
			if (o.shadowOn) { x.save(); x.shadowColor = o.shadow; x.shadowBlur = o.shBlur * scale; x.shadowOffsetX = o.shX * scale; x.shadowOffsetY = o.shY * scale; x.fillStyle = fill; x.fillText(s, px, py); x.restore(); }
			if (o.strokeOn) { x.strokeStyle = o.stroke; x.lineWidth = o.strokeW * scale * 2; x.strokeText(s, px, py); }
			x.fillStyle = fill; x.fillText(s, px, py);
		});
		return c;
	}
	$("fn-png").onclick = function () { var f = fontByName(st.big); if (!f) return; renderPng(f).toBlob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (f.name.replace(/[^\w-]+/g, "-") + "-text.png").toLowerCase(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000); toast("Saved a PNG" + (S.bgOn ? "" : " with a transparent background")); }); };
	$("fn-pngcopy").onclick = function () { var f = fontByName(st.big); if (!f) return; renderPng(f).toBlob(function (b) { try { navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).then(function () { toast("Copied as an image"); }, function () { toast("Your browser would not copy the image: use Download PNG"); }); } catch (e) { toast("Your browser cannot copy images: use Download PNG"); } }); };

	/* ---------- compare ---------- */
	function renderCompare() {
		var b = $("fn-cmp"); applyVars(b); b.innerHTML = ""; if (!st.cmp.length) { b.innerHTML = '<p class="tu-note">Nothing here yet: press the ⇆ button on a font card.</p>'; return; }
		st.cmp.forEach(function (n) { var f = fontByName(n); if (!f) return; var c = document.createElement("div"); c.className = "fn-card"; c.innerHTML = '<div class="fn-chead"><span class="fn-name">' + esc(f.name) + '</span><span class="fn-acts"><button type="button" class="fn-ib" data-n="' + esc(n) + '" title="Remove from Compare">×</button></span></div>'; c.appendChild(sample(f)); b.appendChild(c); });
	}
	$("fn-cmp").addEventListener("click", function (e) { var x = e.target.closest("[data-n]"); if (!x) return; st.cmp.splice(st.cmp.indexOf(x.getAttribute("data-n")), 1); renderCompare(); renderGrid(); });

	/* ---------- controls ---------- */
	function bind(id, key, num, valFn) {
		var el = $(id), pair = $(id + "n"); function set(v) { S[key] = valFn ? valFn(v) : v; if (el.type === "checkbox") el.checked = !!S[key]; else if (el.value != S[key]) el.value = S[key]; if (pair && pair.value != S[key]) pair.value = S[key]; }
		set(S[key]);
		el.addEventListener("input", function () { var v = el.type === "checkbox" ? el.checked : (num ? parseFloat(el.value) : el.value); if (num && isNaN(v)) return; set(v); changed(); }); el.addEventListener("change", function () { var v = el.type === "checkbox" ? el.checked : (num ? parseFloat(el.value) : el.value); if (num && isNaN(v)) return; set(v); changed(); });
		if (pair) pair.addEventListener("input", function () { var v = parseFloat(pair.value); if (isNaN(v)) return; S[key] = v; el.value = v; changed(); });
	}
	var CTL = [["fn-text", "text"], ["fn-size", "size", 1], ["fn-weight", "weight"], ["fn-italic", "italic"], ["fn-tf", "tf"], ["fn-align", "align"], ["fn-color", "color"], ["fn-bgon", "bgOn"], ["fn-bg", "bg"], ["fn-ls", "ls", 1], ["fn-lh", "lh", 1], ["fn-shon", "shadowOn"], ["fn-sh", "shadow"], ["fn-shblur", "shBlur", 1], ["fn-shx", "shX", 1], ["fn-shy", "shY", 1], ["fn-stron", "strokeOn"], ["fn-str", "stroke"], ["fn-strw", "strokeW", 1], ["fn-glon", "glowOn"], ["fn-gl", "glow"], ["fn-glb", "glowBlur", 1], ["fn-grad", "gradOn"], ["fn-g1", "g1"], ["fn-g2", "g2"], ["fn-gang", "gAng", 1]];
	CTL.forEach(function (c) { bind(c[0], c[1], c[2]); });
	var ct = 0; function changed() { clearTimeout(ct); ct = setTimeout(function () { save(); renderGrid(); renderCompare(); if (st.big) { var f = fontByName(st.big); if (f) { applyVars($("fn-bigprev")); $("fn-bigprev").firstChild.textContent = S.text; $("fn-css").textContent = F.css(f.name, f.cat, S); } } }, 60); }
	var pr = $("fn-presets"); F.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = p[0]; b.addEventListener("click", function () { var keep = S.text; S = Object.assign({}, F.DEFAULT, p[1], { text: keep }); CTL.forEach(function (c) { var el = $(c[0]), v = S[c[1]]; if (el.type === "checkbox") el.checked = !!v; else el.value = v; var pair = $(c[0] + "n"); if (pair) pair.value = v; }); save(); changed(); toast(p[0] + " look applied"); }); pr.appendChild(b); });

	/* ---------- more fonts ---------- */
	var gbtn = $("fn-google");
	gbtn.onclick = function () {
		if (st.google) return; st.google = true; gbtn.disabled = true; var todo = F.GOOGLE.filter(function (x) { return !names[x[0]]; }), done = 0, added = 0; gbtn.textContent = "Loading Google Fonts… 0 / " + todo.length;
		function one(x) {
			return new Promise(function (res) {
				var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(x[0]).replace(/%20/g, "+") + "&display=swap"; l.onerror = function () { res(); }; document.head.appendChild(l);
				var to = setTimeout(res, 9000); l.onload = function () { document.fonts.load("40px '" + x[0] + "'").then(function () { clearTimeout(to); if (document.fonts.check("40px '" + x[0] + "'")) { addFont(x[0], x[1], "google"); added++; } res(); }, function () { clearTimeout(to); res(); }); };
			}).then(function () { done++; gbtn.textContent = "Loading Google Fonts… " + done + " / " + todo.length; });
		}
		var i = 0; function pump() { var batch = todo.slice(i, i + 8); i += 8; if (!batch.length) { gbtn.textContent = added ? "Google Fonts added (" + added + ")" : "Could not reach Google Fonts"; if (!added) { gbtn.disabled = false; st.google = false; } renderGrid(); return; } Promise.all(batch.map(one)).then(function () { renderGrid(); pump(); }); } pump();
	};
	if (window.queryLocalFonts) { $("fn-localfonts").hidden = false; $("fn-localfonts").onclick = function () { window.queryLocalFonts().then(function (list) { var seen = {}, added = 0; list.forEach(function (x) { if (seen[x.family]) return; seen[x.family] = 1; var cat = /mono|code|courier|consol/i.test(x.family) ? "mono" : /script|hand|brush|marker/i.test(x.family) ? "hand" : /serif/i.test(x.family) && !/sans/i.test(x.family) ? "serif" : "sans"; if (addFont(x.family, cat, "local")) added++; }); renderGrid(); toast(added + " more fonts added from this computer"); }, function () { toast("Permission was not given"); }); }; }
	$("fn-file").onclick = function () { $("fn-fileinp").click(); };
	$("fn-fileinp").onchange = function () { var f = this.files[0]; this.value = ""; if (!f) return; var nm = f.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]/g, "") || "My font"; f.arrayBuffer().then(function (ab) { var ff = new FontFace(nm, ab); return ff.load().then(function () { document.fonts.add(ff); if (addFont(nm, "display", "user")) toast("Added " + nm); st.q = ""; $("fn-q").value = ""; renderGrid(); openBig(nm); }); }).catch(function () { toast("Could not read that font file"); }); };

	/* ---------- tabs ---------- */
	function tab(t) { st.tab = t; ["browse", "compare", "find"].forEach(function (k) { $("fn-p-" + k).hidden = k !== t; $("fn-t-" + k).setAttribute("aria-pressed", String(k === t)); }); if (t === "compare") renderCompare(); }
	["browse", "compare", "find"].forEach(function (k) { $("fn-t-" + k).onclick = function () { tab(k); }; });

	/* ---------- find a font from a picture ---------- */
	var src = null, box = null, drag = null, cv = $("fn-cv"), cx = cv.getContext("2d");
	var drop = $("fn-drop"), inp = $("fn-img");
	drop.onclick = function () { inp.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
	inp.onchange = function () { if (inp.files[0]) loadPic(inp.files[0]); inp.value = ""; };
	["dragover", "dragenter"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); }); ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove("is-over"); }); });
	drop.addEventListener("drop", function (e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) loadPic(f); });
	document.addEventListener("paste", function (e) { if (st.tab !== "find") return; var it = (e.clipboardData && e.clipboardData.files) || []; for (var i = 0; i < it.length; i++) if (/^image\//.test(it[i].type)) { e.preventDefault(); loadPic(it[i]); return; } });
	function loadPic(f) {
		var u = URL.createObjectURL(f), im = new Image(); im.onload = function () { var s = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)); src = document.createElement("canvas"); src.width = Math.round(im.naturalWidth * s); src.height = Math.round(im.naturalHeight * s); src.getContext("2d").drawImage(im, 0, 0, src.width, src.height); URL.revokeObjectURL(u); box = null; $("fn-pic").hidden = false; $("fn-matchrow").hidden = false; $("fn-results").innerHTML = ""; $("fn-matchnote").textContent = "Drag a box around one line of text in the picture (or leave it empty to use the whole picture), then type what it says."; drawPic(); };
		im.onerror = function () { URL.revokeObjectURL(u); toast("Could not read that picture"); }; im.src = u;
	}
	function drawPic() { var maxW = Math.min(src.width, 720), s = maxW / src.width; cv.width = Math.round(src.width * s); cv.height = Math.round(src.height * s); cx.drawImage(src, 0, 0, cv.width, cv.height); showSel(); }
	function pt(e) { var r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
	function showSel() { var s = $("fn-sel"); if (!box) { s.hidden = true; return; } s.hidden = false; s.style.left = box.x0 * 100 + "%"; s.style.top = box.y0 * 100 + "%"; s.style.width = (box.x1 - box.x0) * 100 + "%"; s.style.height = (box.y1 - box.y0) * 100 + "%"; }
	cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); drag = pt(e); });
	cv.addEventListener("pointermove", function (e) { if (!drag) return; var p = pt(e); box = { x0: Math.min(drag.x, p.x), y0: Math.min(drag.y, p.y), x1: Math.max(drag.x, p.x), y1: Math.max(drag.y, p.y) }; showSel(); });
	cv.addEventListener("pointerup", function () { drag = null; if (box && (box.x1 - box.x0 < 0.02 || box.y1 - box.y0 < 0.02)) { box = null; showSel(); } });
	var GW = 96, GH = 24, matchTok = 0;
	function targetGrid() {
		var bx = box ? { x: Math.floor(box.x0 * src.width), y: Math.floor(box.y0 * src.height), w: Math.max(4, Math.ceil((box.x1 - box.x0) * src.width)), h: Math.max(4, Math.ceil((box.y1 - box.y0) * src.height)) } : { x: 0, y: 0, w: src.width, h: src.height };
		var id = src.getContext("2d").getImageData(bx.x, bx.y, bx.w, bx.h), gray = new Array(bx.w * bx.h); for (var i = 0; i < gray.length; i++) gray[i] = id.data[i * 4] * 0.299 + id.data[i * 4 + 1] * 0.587 + id.data[i * 4 + 2] * 0.114;
		var b = F.binarise(gray), ib = F.inkBox(b, bx.w, bx.h); if (!ib) return null; return { g: F.grid(b, bx.w, bx.h, ib, GW, GH), asp: ib.w / ib.h, crop: { x: bx.x + ib.x, y: bx.y + ib.y, w: ib.w, h: ib.h } };
	}
	var rc = document.createElement("canvas"), rx = rc.getContext("2d", { willReadFrequently: true });
	function candGrid(f, text, weight, italic) {
		var size = 96; rx.font = (italic ? "italic " : "") + weight + " " + size + "px " + fam(f); var w = Math.ceil(rx.measureText(text).width) + 40, h = size * 2; rc.width = Math.min(w, 3000); rc.height = h; rx.fillStyle = "#fff"; rx.fillRect(0, 0, rc.width, h); rx.fillStyle = "#000"; rx.font = (italic ? "italic " : "") + weight + " " + size + "px " + fam(f); rx.textBaseline = "alphabetic"; rx.fillText(text, 20, size * 1.2);
		var id = rx.getImageData(0, 0, rc.width, h), b = new Uint8Array(rc.width * h); for (var i = 0; i < b.length; i++) b[i] = id.data[i * 4] < 128 ? 1 : 0; var ib = F.inkBox(b, rc.width, h); if (!ib) return null; return { g: F.grid(b, rc.width, h, ib, GW, GH), asp: ib.w / ib.h };
	}
	$("fn-match").onclick = function () {
		var text = $("fn-says").value.trim(); if (!src) return; if (!text) { toast("Type the words that appear in the picture"); $("fn-says").focus(); return; }
		var T = targetGrid(); if (!T) { toast("No text found in that area: choose a clearer part of the picture"); return; } var my = ++matchTok, out = [], i = 0, combos = [];
		fonts.forEach(function (f) { combos.push([f, "400", false]); combos.push([f, "700", false]); if (f.cat !== "mono") combos.push([f, "400", true]); }); $("fn-results").innerHTML = ""; $("fn-match").disabled = true;
		function step() {
			if (my !== matchTok) return; var t0 = Date.now(); while (i < combos.length && Date.now() - t0 < 14) { var c = combos[i++], g = candGrid(c[0], text, c[1], c[2]); if (g) out.push({ f: c[0], w: c[1], it: c[2], s: F.similarity(T.g, g.g, GW, GH, T.asp, g.asp) }); }
			$("fn-matchnote").textContent = "Comparing… " + Math.round(i / combos.length * 100) + "%";
			if (i < combos.length) { setTimeout(step, 0); return; }
			$("fn-match").disabled = false; var seen = {}, best = out.sort(function (a, b) { return b.s - a.s; }).filter(function (r) { var k = r.f.name; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 12);
			$("fn-matchnote").textContent = best.length ? "Closest fonts among the " + fonts.length + " this page can draw. A high score means the letter shapes and proportions agree; if nothing scores well, your font is probably not in the list: try “Add 80 popular Google Fonts”, or the other identifiers below." : "Nothing to compare.";
			var wrap = $("fn-results"); wrap.innerHTML = ""; best.forEach(function (r, k) {
				var d = document.createElement("div"); d.className = "fn-res"; var pic = document.createElement("canvas"); pic.width = 300; pic.height = 70; var px = pic.getContext("2d"); px.fillStyle = "#fff"; px.fillRect(0, 0, 300, 70); var s = Math.min(280 / T.crop.w, 56 / T.crop.h); px.drawImage(src, T.crop.x, T.crop.y, T.crop.w, T.crop.h, 10, (70 - T.crop.h * s) / 2, T.crop.w * s, T.crop.h * s);
				var smp = document.createElement("div"); smp.className = "fn-res-s"; smp.style.fontFamily = fam(r.f); smp.style.fontWeight = r.w; smp.style.fontStyle = r.it ? "italic" : "normal"; smp.textContent = text;
				var meta = document.createElement("div"); meta.className = "fn-res-m"; meta.innerHTML = "<b>" + (k + 1) + ". " + esc(r.f.name) + "</b> " + (r.w === "700" ? "bold " : "") + (r.it ? "italic " : "") + '<span class="fn-score">' + Math.round(r.s * 100) + "% match</span>";
				var use = document.createElement("button"); use.type = "button"; use.className = "tu-btn tu-btn--ghost"; use.textContent = "Use this font"; use.onclick = function () { S.text = text; $("fn-text").value = text; S.weight = r.w; $("fn-weight").value = r.w; S.italic = r.it; $("fn-italic").checked = r.it; save(); tab("browse"); changed(); openBig(r.f.name); };
				d.appendChild(meta); d.appendChild(pic); d.appendChild(smp); d.appendChild(use); wrap.appendChild(d);
			});
		}
		step();
	};

	/* ---------- start ---------- */
	renderGrid(); if (startFont && fontByName(startFont)) openBig(startFont);
})();
