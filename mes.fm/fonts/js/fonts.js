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
		list("display", "Impact|Arial Black|Freelance Kamchatka|Copperplate|Papyrus|Chalkduster|Marker Felt|Comic Sans MS|Luminari|Phosphate|Herculanum|Trattatello|Party LET|American Typewriter|Big Caslon|Stencil|Jokerman|Chiller|Ravie|Showcard Gothic|Algerian|Bauhaus 93|Broadway|Cooper Black|Gill Sans Ultra Bold|Rockwell Extra Bold|Haettenschweiler|Bernard MT Condensed|Britannic Bold|Agency FB|Castellar|Playbill|Snap ITC|Curlz MT"),
		list("hand", "Brush Script MT|Segoe Script|Segoe Print|Lucida Handwriting|Bradley Hand|Snell Roundhand|Zapfino|Noteworthy|Chalkboard|Ink Free|Mistral|Kristen ITC|Monotype Corsiva|Apple Chancery|Savoye LET|Bradley Hand ITC")
	);
	// popular Google Fonts, loaded only when the visitor asks (regular weight; bold is synthesised)
	var GOOGLE = [].concat(
		list("sans", "Roboto|Open Sans|Montserrat|Lato|Poppins|Inter|Nunito|Raleway|Work Sans|Source Sans 3|DM Sans|Rubik|Oswald|Bebas Neue|Barlow|Fira Sans|Quicksand|Manrope|Outfit|Josefin Sans"),
		list("serif", "Playfair Display|Merriweather|Lora|Roboto Slab|Crimson Text|Libre Baskerville|Cormorant Garamond|PT Serif|EB Garamond|DM Serif Display|Bitter|Spectral"),
		list("mono", "Roboto Mono|Fira Code|JetBrains Mono|Source Code Pro|Space Mono|IBM Plex Mono"),
		list("display", "Anton|Bangers|Lobster|Pacifico|Righteous|Abril Fatface|Alfa Slab One|Fredoka|Press Start 2P|Permanent Marker|Orbitron|Bungee|Shrikhand|Monoton|Fascinate|Black Ops One|Rubik Mono One|Titan One|Sixtyfour|Monofett|Zen Tokyo Zoo|Workbench"),
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

/* MES Photo Editor round 8 -- the font catalogue (pure, no DOM): browser global `MESFontCat`, node: require('./tool_apps_src/photo-editor/fontcat.js').
 * LOCAL = font names the page looks for on the visitor's own computer (Windows, Mac, Linux, Office; only the ones the canvas probe finds are listed),
 * GOOGLE = popular Google Fonts families (loaded one by one, only when they are previewed or picked). Helpers: CSS stacks, the family name inside a
 * stack, a category guess for names from queryLocalFonts(), search / filter, and the Google Fonts CSS URLs. fontpick.js is the picker UI. */
(function (root) {
	"use strict";
	var CATS = [["all", "All"], ["sans", "Sans-serif"], ["serif", "Serif"], ["display", "Display"], ["hand", "Handwriting"], ["mono", "Monospace"]];
	var GENERIC = { sans: "sans-serif", serif: "serif", display: "sans-serif", hand: "cursive", mono: "monospace" };
	function list(cat, s) { return s.split("|").map(function (n) { return [n.trim(), cat]; }).filter(function (x) { return x[0]; }); }
	var LOCAL = [].concat(
		list("sans", "Arial|Arial Narrow|Arial Rounded MT Bold|Helvetica|Helvetica Neue|Verdana|Tahoma|Trebuchet MS|Segoe UI|Segoe UI Light|Segoe UI Semibold|Segoe UI Black|Calibri|Calibri Light|Candara|Corbel|Bahnschrift|Aptos|Grandview|Seaford|Tenorite|Gill Sans|Gill Sans MT|Optima|Futura|Avenir|Avenir Next|Avenir Next Condensed|Geneva|Century Gothic|Franklin Gothic Medium|Franklin Gothic Book|Lucida Grande|Lucida Sans|Lucida Sans Unicode|Microsoft Sans Serif|Tw Cen MT|Berlin Sans FB|Eras Medium ITC|Maiandra GD|Myriad Pro|Seravek|Skia|Gisha|Euphemia|Leelawadee UI|Nirmala UI|Gadugi|Ebrima|Malgun Gothic|Microsoft YaHei|Microsoft JhengHei|Yu Gothic|Meiryo|MS Gothic|MS PGothic|SimHei|Dotum|Gulim|Apple SD Gothic Neo|Hiragino Sans|PingFang SC|Arial Hebrew|Damascus|Thonburi|Sukhumvit Set|Kohinoor Devanagari|Dubai|Tajawal|Noto Sans|Ubuntu|Cantarell|DejaVu Sans|Liberation Sans|Droid Sans|FreeSans|Nimbus Sans|URW Gothic|Bitstream Vera Sans|Open Sans|Roboto|Lato|Fira Sans|Source Sans Pro|Carlito|Linux Biolinum O|PT Sans|Nanum Gothic|Montserrat|Poppins|Inter|Raleway"),
		list("serif", "Times New Roman|Times|Georgia|Cambria|Constantia|Palatino Linotype|Palatino|Book Antiqua|Bookman Old Style|Garamond|Baskerville|Baskerville Old Face|Big Caslon|Bodoni 72|Bodoni MT|Didot|Hoefler Text|Iowan Old Style|Athelas|Charter|Cochin|Century|Century Schoolbook|Californian FB|Calisto MT|Centaur|Goudy Old Style|High Tower Text|Perpetua|Rockwell|Rockwell Condensed|Bell MT|Footlight MT Light|Lucida Bright|Lucida Fax|Modern No. 20|Elephant|Sitka Text|Sylfaen|Superclarendon|Kefa|Marion|SimSun|NSimSun|MS Mincho|Yu Mincho|Batang|Gungsuh|PMingLiU|Songti SC|Hiragino Mincho ProN|David|Miriam|Traditional Arabic|Simplified Arabic|Sakkal Majalla|Angsana New|Noto Serif|DejaVu Serif|Liberation Serif|Droid Serif|FreeSerif|Nimbus Roman|URW Bookman|C059|P052|Caladea|Gentium|Linux Libertine O|PT Serif|Merriweather|Playfair Display|Lora"),
		list("mono", "Courier New|Courier|Consolas|Lucida Console|Monaco|Menlo|SF Mono|Andale Mono|OCR A Extended|Cascadia Code|Cascadia Mono|Fira Code|Fira Mono|JetBrains Mono|Source Code Pro|Roboto Mono|Inconsolata|Hack|DejaVu Sans Mono|Liberation Mono|Ubuntu Mono|Noto Mono|Droid Sans Mono|FreeMono|Nimbus Mono PS|PT Mono|IBM Plex Mono"),
		list("display", "Impact|Arial Black|Freelance Kamchatka|Haettenschweiler|Copperplate|Copperplate Gothic Bold|Papyrus|Chalkduster|Marker Felt|Comic Sans MS|Luminari|Phosphate|Herculanum|Trattatello|Party LET|American Typewriter|Stencil|Jokerman|Chiller|Ravie|Showcard Gothic|Algerian|Bauhaus 93|Broadway|Cooper Black|Gill Sans Ultra Bold|Rockwell Extra Bold|Bernard MT Condensed|Britannic Bold|Agency FB|Castellar|Playbill|Snap ITC|Curlz MT|Wide Latin|Goudy Stout|Engravers MT|Felix Titling|Colonna MT|Imprint MT Shadow|Magneto|Niagara Engraved|Niagara Solid|Old English Text MT|Onyx|Poor Richard|Harrington|Juice ITC|Gigi|Forte|Harlow Solid Italic|Elephant|Matura MT Script Capitals|Gloucester MT Extra Condensed|Blackadder ITC|Parchment|Academy Engraved LET|Bodoni 72 Smallcaps|Comfortaa|Webdings|Wingdings|Symbol"),
		list("hand", "Brush Script MT|Segoe Script|Segoe Print|Lucida Handwriting|Lucida Calligraphy|Bradley Hand|Bradley Hand ITC|Snell Roundhand|Zapfino|Noteworthy|Chalkboard|Chalkboard SE|Ink Free|Mistral|Kristen ITC|Monotype Corsiva|Apple Chancery|Savoye LET|Edwardian Script ITC|Freestyle Script|French Script MT|Kunstler Script|Palace Script MT|Rage Italic|Script MT Bold|Vivaldi|Vladimir Script|Viner Hand ITC|Tempus Sans ITC|Pristina|Informal Roman|Gabriola|MV Boli|Purisa|Z003")
	);
	var GOOGLE = [].concat(
		list("sans", "Roboto|Open Sans|Montserrat|Lato|Poppins|Inter|Noto Sans|Raleway|Nunito|Nunito Sans|Ubuntu|Rubik|Work Sans|Mulish|Kanit|Fira Sans|Quicksand|Barlow|Manrope|DM Sans|Heebo|PT Sans|Source Sans 3|Karla|Josefin Sans|Libre Franklin|Mukta|Hind|Titillium Web|Arimo|Cabin|Oxygen|Outfit|Figtree|Plus Jakarta Sans|Lexend|Inter Tight|Assistant|Prompt|IBM Plex Sans|Exo 2|Exo|Barlow Condensed|Barlow Semi Condensed|Oswald|Archivo|Archivo Narrow|Red Hat Display|Red Hat Text|Public Sans|Sora|Space Grotesk|Urbanist|Jost|Catamaran|Asap|Encode Sans|Overpass|Maven Pro|Signika|Varela Round|Varela|Abel|Dosis|M PLUS Rounded 1c|Questrial|Saira|Saira Condensed|Chivo|Be Vietnam Pro|Lexend Deca|Sarabun|Albert Sans|Onest|Golos Text|Commissioner|Epilogue|Schibsted Grotesk|Instrument Sans|Gothic A1|Noto Sans JP|Noto Sans KR|Yantramanav|Pathway Gothic One|Fjalla One|Teko|Antonio|League Spartan|Rajdhani|Khand|Russo One|Play|Ropa Sans|Cantarell|Didact Gothic|Mada|Tajawal|Cairo|Almarai|Alata|Sen|Kumbh Sans|Atkinson Hyperlegible|Hanken Grotesk|Wix Madefor Display|Readex Pro|Darker Grotesque|Familjen Grotesk|Tenor Sans|Montserrat Alternates|Nanum Gothic|Istok Web|Actor|Gudea|Magra|Armata|Carme|Telex|Average Sans|Belleza|Marvel|Jura|Advent Pro|Monda|Homenaje|Geologica|Unbounded|Bricolage Grotesque|Afacad|Reddit Sans|Noto Sans Display|Spline Sans|Anek Latin|Hind Siliguri|Ruda|Yanone Kaffeesatz|Archivo Black|Sofia Sans|Mona Sans|Geist"),
		list("serif", "Playfair Display|Merriweather|Lora|Roboto Slab|PT Serif|Noto Serif|Libre Baskerville|EB Garamond|Crimson Text|Crimson Pro|Cormorant Garamond|Cormorant|Source Serif 4|Bitter|Arvo|Zilla Slab|Josefin Slab|Domine|Vollkorn|Alegreya|Spectral|Cardo|Old Standard TT|Libre Caslon Text|DM Serif Display|DM Serif Text|Frank Ruhl Libre|Noticia Text|Slabo 27px|Roboto Serif|IBM Plex Serif|Rokkitt|Tinos|Gelasio|Prata|Cinzel|Marcellus|Bodoni Moda|Abhaya Libre|Literata|Newsreader|Fraunces|Young Serif|Instrument Serif|Gloock|Rozha One|Yeseva One|Rufina|Neuton|Sorts Mill Goudy|Gentium Book Plus|Amiri|Lusitana|Martel|Halant|Kreon|Aleo|Brawler|Unna|Petrona|Trirong|Taviraj|Faustina|Eczar|Libre Bodoni|Bellefair|Quattrocento|Lustria|Ovo|Fanwood Text|Linden Hill|Judson|Esteban|Radley|Podkova|Copse|Sanchez|Glegoo|Crete Round|Alike|Coustard|Arapey|Rasa|Hahmlet|Noto Serif JP|Nanum Myeongjo|Lancelot|Gilda Display|Bentham|Caudex|Forum|Mate|Average|Adamina|Habibi|Kurale|Poly|Junge|Trocchi|Vidaloka|Playfair|Cormorant Infant|Della Respira|Noto Serif Display|Castoro|Brygada 1918|Piazzolla|Besley|Inknut Antiqua|Lustria"),
		list("mono", "Roboto Mono|Source Code Pro|Fira Code|Fira Mono|JetBrains Mono|IBM Plex Mono|Space Mono|Inconsolata|Ubuntu Mono|PT Mono|Courier Prime|Anonymous Pro|Cousine|DM Mono|Red Hat Mono|Noto Sans Mono|Overpass Mono|Major Mono Display|Share Tech Mono|VT323|Nanum Gothic Coding|Sometype Mono|Martian Mono|Azeret Mono|Spline Sans Mono|Victor Mono|Xanh Mono|Syne Mono|B612 Mono|Cutive Mono|Oxygen Mono|Chivo Mono|Geist Mono|Kode Mono|Sono|Lekton"),
		list("display", "Bebas Neue|Anton|Lobster|Abril Fatface|Alfa Slab One|Righteous|Bangers|Fredoka|Passion One|Titan One|Bungee|Bungee Inline|Bungee Shade|Bungee Hairline|Monoton|Press Start 2P|Orbitron|Audiowide|Black Ops One|Staatliches|Rubik Mono One|Shrikhand|Fascinate|Fascinate Inline|Chewy|Luckiest Guy|Creepster|Nosifer|Eater|Frijole|Bowlby One SC|Bowlby One|Lilita One|Paytone One|Ultra|Rammetto One|Sigmar One|Holtwood One SC|Bevan|Coda|Changa One|Racing Sans One|Faster One|Codystar|Lobster Two|Cinzel Decorative|Poiret One|Unica One|Limelight|Vast Shadow|Diplomata SC|Megrim|Wallpoet|Zen Dots|Syncopate|Michroma|Gruppo|Quantico|Iceland|Turret Road|Big Shoulders Display|Silkscreen|Rubik Glitch|Rubik Wet Paint|Rubik Puddles|Rubik Bubbles|Rubik Beastly|Rubik Moonrocks|Rubik Vinyl|Rubik Dirt|Climate Crisis|Bagel Fat One|Dela Gothic One|Grandstander|Baloo 2|Concert One|Boogaloo|Bubblegum Sans|Fredericka the Great|Rye|Special Elite|Calistoga|Coiny|Gravitas One|Erica One|Emblema One|Plaster|Sonsie One|Spicy Rice|Kavoon|Knewave|Lemon|Modak|Atomic Age|Monofett|Henny Penny|Butcherman|Metal Mania|New Rocker|UnifrakturMaguntia|Pirata One|Almendra Display|Uncial Antiqua|MedievalSharp|Germania One|Graduate|Squada One|Saira Stencil One|Stardos Stencil|Allerta Stencil|Oi|Tilt Warp|Tilt Prism|Krona One|Comfortaa|Yatra One|Lily Script One|Patua One|Oleo Script|Kumar One|Playfair Display SC|Carter One|Cherry Cream Soda|Fugaz One|Goblin One|Londrina Solid|Londrina Outline|Mystery Quest|Nova Square|Original Surfer|Ranchers|Sniglet|Stalinist One|Train One|Zilla Slab Highlight|Bigshot One|Sixtyfour|Workbench|Zen Tokyo Zoo|Honk|Nabla|Kablammo|Moirai One|Tourney|Bungee Spice|Rubik Maze|Bungee Outline|Tilt Neon|Foldit|Bungee Tint"),
		list("hand", "Dancing Script|Pacifico|Caveat|Satisfy|Great Vibes|Sacramento|Indie Flower|Shadows Into Light|Amatic SC|Kalam|Patrick Hand|Cookie|Yellowtail|Permanent Marker|Gloria Hallelujah|Courgette|Kaushan Script|Allura|Parisienne|Alex Brush|Tangerine|Pinyon Script|Marck Script|Homemade Apple|Rock Salt|Reenie Beanie|Covered By Your Grace|Architects Daughter|Handlee|Nothing You Could Do|Just Another Hand|Coming Soon|Neucha|Schoolbell|Sue Ellen Francisco|The Girl Next Door|Waiting for the Sunrise|Zeyada|La Belle Aurore|Mrs Saint Delafield|Monsieur La Doulaise|Herr Von Muellerhoff|Petit Formal Script|Mr Dafoe|Italianno|Arizonia|Rochester|Playball|Damion|Leckerli One|Grand Hotel|Merienda|Mali|Gochi Hand|Itim|Sriracha|Nanum Pen Script|Nanum Brush Script|Caveat Brush|Delius|Short Stack|Annie Use Your Telescope|Cedarville Cursive|Dawning of a New Day|Meddon|Over the Rainbow|Swanky and Moo Moo|Loved by the King|Kristi|Qwigley|Ruthie|Vibur|Bad Script|Calligraffitti|Crafty Girls|Mansalva|Square Peg|Birthstone|Ephesis|Imperial Script|Licorice|Love Light|Mea Culpa|Ole|Ms Madi|Corinthia|Water Brush|Whisper|Splash|Send Flowers|Comforter|Gwendolyn|Hurricane|Lavishly Yours|Moon Dance|Updock|Island Moments|Fuggles|Shadows Into Light Two|Bilbo Swash Caps|Charm|Niconne|Norican|Euphoria Script|Clicker Script|Lovers Quarrel|Seaweed Script|Sofia|Felipa|Montez|Engagement|Kalnia Glaze")
	);
	function dedupe(a) { var seen = {}; return a.filter(function (x) { var k = x[0].toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); }
	LOCAL = dedupe(LOCAL); GOOGLE = dedupe(GOOGLE);
	var GMAP = {}; GOOGLE.forEach(function (x) { GMAP[x[0].toLowerCase()] = x[1]; });
	var SYMBOL = /^(webdings|wingdings|symbol|marlett)$/i;

	/* "'Roboto', sans-serif" -> "Roboto"; "Arial, Helvetica, sans-serif" -> "Arial" */
	function familyOf(stack) { var s = String(stack || "").split(",")[0].trim(); return s.replace(/^['"]|['"]$/g, "").trim(); }
	function quote(name) { return /^[a-z-]+$/i.test(name) && /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(name) ? name : "'" + String(name).replace(/['\\]/g, "") + "'"; }
	/* the CSS value stored on a text layer (projects keep it, so the family name travels with the file) */
	function stack(name, cat) { var g = GENERIC[cat] || "sans-serif"; return quote(name) + ", " + g; }
	function googleCat(name) { return GMAP[String(name || "").toLowerCase()] || null; }
	/* a category for a font name from queryLocalFonts() (no category comes with it) */
	function guessCat(name) {
		var n = String(name || "").toLowerCase(); var k = LOCAL.filter(function (x) { return x[0].toLowerCase() === n; })[0]; if (k) return k[1]; if (GMAP[n]) return GMAP[n];
		if (/mono|code|console|courier|typewriter|terminal/.test(n)) return "mono";
		if (/script|hand|brush|marker|chalk|calligraph|signature|pen\b|cursive|kristen|print/.test(n)) return "hand";
		if (/sans/.test(n)) return "sans";
		if (/serif|times|garamond|roman|georgia|antiqua|baskerville|bodoni|caslon|mincho|song|ming|batang|didot|slab|book\b|old style|cambria/.test(n)) return "serif";
		if (/black|poster|display|stencil|shadow|outline|inline|titling|engraved|grunge|decor/.test(n)) return "display";
		return "sans";
	}
	/* filter + order the picker's list: every word of q must be in the name (or the category name); cat "all" / a category; src "all" / "local" / "google" / "recent" */
	var CATNAME = { sans: "sans serif", serif: "serif", display: "display decorative", hand: "handwriting script", mono: "monospace code" };
	/* opts.google === false hides the Google Fonts in the "All" view (they are still listed under "Google Fonts"); in "All" the fonts that need
	 * no download (basic, this computer, your files) come first, Google families after them, unless a search ranks the matches */
	function filter(fonts, q, cat, src, recent, opts) {
		var noG = opts && opts.google === false && (src === "all" || !src), words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean), rec = recent || [];
		var out = fonts.filter(function (f) {
			if (cat && cat !== "all" && f.cat !== cat) return false;
			if (src === "recent" && rec.indexOf(f.value) < 0 && rec.indexOf(f.name) < 0) return false;
			if (noG && f.src === "google") return false;
			if (src === "local" && f.src !== "local" && f.src !== "basic" && f.src !== "file") return false; if (src === "google" && f.src !== "google") return false;
			var hay = (f.name + " " + (CATNAME[f.cat] || "")).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) >= 0; });
		});
		if (src === "recent") out.sort(function (a, b) { return idx(a) - idx(b); });
		else if (words.length) out.sort(function (a, b) { return score(b) - score(a) || g(a) - g(b) || a.name.localeCompare(b.name); });
		else { out = out.map(function (f, i) { return [f, i]; }); out.sort(function (a, b) { return g(a[0]) - g(b[0]) || a[1] - b[1]; }); out = out.map(function (x) { return x[0]; }); }
		function g(f) { return f.src === "google" ? 1 : 0; }
		function idx(f) { var i = rec.indexOf(f.value); if (i < 0) i = rec.indexOf(f.name); return i < 0 ? 999 : i; }
		function score(f) { var n = f.name.toLowerCase(), w = words.join(" "); return (n === w ? 3 : 0) + (n.indexOf(w) === 0 ? 2 : 0) + (n.indexOf(w) >= 0 ? 1 : 0); }
		return out;
	}
	/* order a filtered list: "" = as filter() made it, "az" / "za" = by name, "src" = where it comes from (basic, this computer, your files, Google) then A-Z, "kind" = by category then A-Z */
	var SRCORD = { basic: 0, local: 1, file: 2, google: 3 }, CATORD = { sans: 0, serif: 1, display: 2, hand: 3, mono: 4 };
	function sortFonts(list, how) {
		if (!how) return list; var out = list.slice(), az = function (a, b) { return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }); };
		if (how === "az") out.sort(az); else if (how === "za") out.sort(function (a, b) { return az(b, a); });
		else if (how === "src") out.sort(function (a, b) { return (SRCORD[a.src] || 0) - (SRCORD[b.src] || 0) || az(a, b); });
		else if (how === "kind") out.sort(function (a, b) { return (CATORD[a.cat] || 0) - (CATORD[b.cat] || 0) || az(a, b); });
		return out;
	}
	/* the Google Fonts CSS API: a tiny preview (only the letters of `text`), or the whole family with bold and italic when it has them (try in this order) */
	function googleUrls(name, text) {
		var f = encodeURIComponent(name).replace(/%20/g, "+"), b = "https://fonts.googleapis.com/css2?family=";
		if (text != null) return [b + f + "&text=" + encodeURIComponent(uniqChars(text)) + "&display=block"];
		return [b + f + ":ital,wght@0,400;0,700;1,400;1,700&display=swap", b + f + ":wght@400;700&display=swap", b + f + "&display=swap"];
	}
	/* ---- font strings for canvas (round 10). Firefox (and old Chromium such as Opera on Windows 7) is strict: one bad family name in a stack, e.g.
	 * an unquoted word that starts with a digit ("Press Start 2P"), makes ctx.font = ... silently do nothing, so the text drew in the previous /
	 * default font. normStack() rewrites a stack so every family that is not a plain run of CSS identifiers is double-quoted, generic names stay
	 * bare, broken quotes are repaired; fontShorthand() builds "italic bold 64px <stack>" with a finite size. Both are pure (node-tested). */
	var GENERICS = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong|-apple-system|BlinkMacSystemFont)$/i;
	var CSSWIDE = /^(inherit|initial|unset|revert|revert-layer|default)$/i;
	var IDENT = /^-?(?:[A-Za-z_]|[^\x00-\x7f])(?:[\w-]|[^\x00-\x7f])*$/;
	function splitStack(stack) {
		var out = [], cur = "", q = null, s = String(stack == null ? "" : stack);
		for (var i = 0; i < s.length; i++) { var c = s[i]; if (q) { if (c === "\\" && i + 1 < s.length) { cur += s[++i]; continue; } if (c === q) { q = null; continue; } cur += c; continue; } if (c === "'" || c === '"') { q = c; continue; } if (c === ",") { out.push(cur); cur = ""; continue; } cur += c; }
		out.push(cur); return out.map(function (x) { return x.replace(/\s+/g, " ").trim(); }).filter(Boolean);
	}
	function famToken(name, wasGeneric) {
		var n = String(name).replace(/[\u0000-\u001f]/g, "").trim(); if (!n) return "";
		if (wasGeneric && GENERICS.test(n)) return n.toLowerCase() === "blinkmacsystemfont" ? "BlinkMacSystemFont" : n.toLowerCase() === "-apple-system" ? "-apple-system" : n.toLowerCase();
		var words = n.split(" "), plain = words.every(function (w) { return IDENT.test(w) && !/^--/.test(w); }) && !(words.length === 1 && (CSSWIDE.test(n) || GENERICS.test(n)));
		return plain ? n : '"' + n.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
	}
	/* "Arial, 'Press Start 2P', cursive" -> 'Arial, "Press Start 2P", cursive'; a quoted generic ('serif') stays a family name, like CSS */
	var NSMEMO = {}, NSN = 0;
	function normStack(stack) { var k = String(stack == null ? "" : stack); if (Object.prototype.hasOwnProperty.call(NSMEMO, k)) return NSMEMO[k]; if (++NSN > 500) { NSMEMO = {}; NSN = 0; } return (NSMEMO[k] = normStack0(k)); }
	function normStack0(stack) {
		var raw = String(stack == null ? "" : stack), parts = [], q = false, cur = "", gen = true;
		for (var i = 0; i < raw.length; i++) { var c = raw[i]; if (c === "'" || c === '"') gen = false; if (c === ",") { parts.push([cur, gen]); cur = ""; gen = true; continue; } cur += c; }
		parts.push([cur, gen]);
		var names = splitStack(raw), toks = names.map(function (n, k) { var g = parts[k] ? parts[k][1] : true; return famToken(n, g); }).filter(Boolean);
		var seen = {}; toks = toks.filter(function (t) { var k = t.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
		return toks.length ? toks.join(", ") : "sans-serif";
	}
	/* the canvas / CSS font shorthand for a text: style bits (1 bold, 2 italic), size in px (rounded to 1/100, at least 1) */
	function fontShorthand(bits, size, stack) {
		var sz = +size; if (!isFinite(sz) || sz <= 0) sz = 16; sz = Math.max(1, Math.round(sz * 100) / 100);
		return (bits & 2 ? "italic " : "") + (bits & 1 ? "bold " : "") + sz + "px " + normStack(stack);
	}
	/* a FontFace family name that every browser accepts (Firefox parses it as CSS: "MESpv Press Start 2P" threw there, so previews failed) */
	function safeFamily(prefix, name) { var h = 0, s = String(name || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; var l = s.replace(/[^A-Za-z]+/g, ""); return (prefix || "MES") + (l || "Font") + "x" + h.toString(36).replace(/[0-9]/g, function (d) { return "abcdefghij"[+d]; }); }
	function uniqChars(s) { var seen = {}, o = ""; Array.from(String(s)).forEach(function (c) { if (!seen[c]) { seen[c] = 1; o += c; } }); return o; }
	/* the first font file url in a Google Fonts CSS answer */
	function firstFontUrl(css) { var m = /url\((['"]?)(https:\/\/[^)'"]+)\1\)/.exec(String(css || "")); return m ? m[2] : null; }
	/* most recently used first, no duplicates, at most n */
	function pushRecent(arr, v, n) { var a = (arr || []).filter(function (x) { return x !== v; }); a.unshift(v); return a.slice(0, n || 10); }

	var api = { CATS: CATS, GENERIC: GENERIC, LOCAL: LOCAL, GOOGLE: GOOGLE, SYMBOL: SYMBOL, familyOf: familyOf, quote: quote, stack: stack, googleCat: googleCat, guessCat: guessCat, filter: filter, sortFonts: sortFonts, googleUrls: googleUrls, uniqChars: uniqChars, firstFontUrl: firstFontUrl, pushRecent: pushRecent, splitStack: splitStack, normStack: normStack, fontShorthand: fontShorthand, safeFamily: safeFamily };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	if (root) root.MESFontCat = api;
})(typeof window !== "undefined" ? window : null);

/* MES Font Preview and Finder (mes.fm/fonts). Fonts the browser really has (canvas width test) + optional Google Fonts / local font access / a font file; live preview with effects,
 * big preview with PNG + CSS, compare, favourites, and a picture matcher (binarise -> crop to the ink -> grid -> compare with each font). Pure helpers in lib.js (MESFont). */
(function () {
	"use strict";
	var F = window.MESFont, $ = function (id) { return document.getElementById(id); }, root = $("fn"); if (!root || !F) return;
	var KEY = "mes-fonts:v1", S = Object.assign({}, F.DEFAULT), st = { cat: "all", q: "", favOnly: false, fav: [], cmp: [], big: null, tab: "browse", google: false };
	/* card layout prefs: cw = card size (s|m|l|xl), cs = sample size in the cards (%), col = collapsed font names, hid = hidden font names */
	var UI = { cw: "m", cs: 100, col: [], hid: [] };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { if (sv.S) Object.assign(S, sv.S); if (Array.isArray(sv.fav)) st.fav = sv.fav; if (sv.ui) { if (F.CARD_W[sv.ui.cw]) UI.cw = sv.ui.cw; if (+sv.ui.cs >= 40 && +sv.ui.cs <= 250) UI.cs = +sv.ui.cs; if (Array.isArray(sv.ui.col)) UI.col = sv.ui.col.slice(0, 2000); if (Array.isArray(sv.ui.hid)) UI.hid = sv.ui.hid.slice(0, 2000); } } } catch (e) { /* ignore */ }
	var qp = new URLSearchParams(location.search); if (qp.get("t")) { S.text = qp.get("t").slice(0, 300); S.runs = null; } var startFont = qp.get("f") || "";
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ S: S, fav: st.fav, ui: UI })); } catch (e) { /* ignore */ } }
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
	function lum(h) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ""); return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 : 0; }
	/* ---------- rich text: the box keeps runs of {t, b, i, u}; S.text is the plain text ---------- */
	function runsOf(root) {
		var runs = [], atStart = true;
		function push(t, st) { if (!t) return; var l = runs[runs.length - 1]; if (l && l.b === st.b && l.i === st.i && l.u === st.u) l.t += t; else runs.push({ t: t, b: st.b, i: st.i, u: st.u }); atStart = false; }
		function walk(n, st) {
			if (n.nodeType === 3) { push(n.nodeValue.replace(/\u00a0/g, " "), st); return; }
			if (n.nodeType !== 1) return; var tag = n.tagName, cs = n.style || {}, nx = { b: st.b, i: st.i, u: st.u };
			if (tag === "B" || tag === "STRONG" || cs.fontWeight === "bold" || +cs.fontWeight >= 600) nx.b = true; if (tag === "I" || tag === "EM" || cs.fontStyle === "italic") nx.i = true; if (tag === "U" || /underline/.test(cs.textDecoration || cs.textDecorationLine || "")) nx.u = true;
			if (tag === "BR") { push("\n", st); return; }
			var block = tag === "DIV" || tag === "P" || tag === "LI"; if (block && !atStart && !/\n$/.test(runs.length ? runs[runs.length - 1].t : "")) push("\n", st);
			for (var c = n.firstChild; c; c = c.nextSibling) walk(c, nx);
		}
		walk(root, { b: false, i: false, u: false });
		while (runs.length && /\n$/.test(runs[runs.length - 1].t)) { runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\n+$/, ""); if (!runs[runs.length - 1].t) runs.pop(); }
		return runs;
	}
	function runsHtml(runs) { return runs.map(function (r) { var h = esc(r.t); if (r.u) h = "<u>" + h + "</u>"; if (r.i) h = "<i>" + h + "</i>"; if (r.b) h = "<b>" + h + "</b>"; return h; }).join(""); }
	function sampleHtml() { return S.runs && S.runs.length ? runsHtml(S.runs) : esc(S.text); }
	function setRuns(runs) { S.runs = runs.some(function (r) { return r.b || r.i || r.u; }) ? runs : null; S.text = runs.map(function (r) { return r.t; }).join("").slice(0, 600); }
	function fillBox() { $("fn-text").innerHTML = sampleHtml(); }
	function applyVars(el) {
		var o = S, sh = []; if (o.shadowOn) sh.push(o.shX + "px " + o.shY + "px " + o.shBlur + "px " + o.shadow); if (o.glowOn) { sh.push("0 0 " + o.glowBlur + "px " + o.glow, "0 0 " + o.glowBlur * 2 + "px " + o.glow); }
		var s = el.style; s.setProperty("--fs", o.size + "px"); s.setProperty("--fw", o.weight); s.setProperty("--fst", o.italic ? "italic" : "normal"); s.setProperty("--ls", o.ls + "px"); s.setProperty("--lh", o.lh); s.setProperty("--al", o.align); s.setProperty("--tf", o.tf);
		s.setProperty("--fg", o.gradOn ? "transparent" : o.color); s.setProperty("--fgd", o.gradOn ? "transparent" : (!o.bgOn && lum(o.color) < 0.4 ? "#f1f1f1" : o.color));   /* dark page: the cards are dark, so a dark colour is shown light there (the PNG and CSS keep the chosen colour) */ s.setProperty("--bgi", o.gradOn ? "linear-gradient(" + o.gAng + "deg," + o.g1 + "," + o.g2 + ")" : (o.bgOn ? o.bg : "transparent")); s.setProperty("--clip", o.gradOn ? "text" : "border-box");
		s.setProperty("--sh", sh.length ? sh.join(",") : "none"); s.setProperty("--stk", o.strokeOn ? o.strokeW + "px " + o.stroke : "0 transparent");
	}
	function sample(f, txt) { var d = document.createElement("div"); d.className = "fn-sample"; d.style.fontFamily = fam(f) + "," + (f.cat === "serif" ? "serif" : f.cat === "mono" ? "monospace" : "sans-serif"); if (txt == null) d.innerHTML = sampleHtml(); else d.textContent = txt; return d; }

	/* ---------- browse grid ---------- */
	var fontByName = function (n) { for (var i = 0; i < fonts.length; i++) if (fonts[i].name === n) return fonts[i]; return null; };
	function visible() { var q = st.q.trim().toLowerCase(); return fonts.filter(function (f) { return UI.hid.indexOf(f.name) < 0 && (st.cat === "all" || f.cat === st.cat) && (!q || f.name.toLowerCase().indexOf(q) >= 0) && (!st.favOnly || st.fav.indexOf(f.name) >= 0); }); }
	function renderGrid() {
		var g = $("fn-grid"); applyVars(g); var list = visible(); g.innerHTML = ""; var frag = document.createDocumentFragment();
		list.forEach(function (f) {
			var c = document.createElement("div"), isCol = UI.col.indexOf(f.name) >= 0; c.className = "fn-card" + (st.big === f.name ? " is-on" : "") + (isCol ? " is-col" : ""); var isFav = st.fav.indexOf(f.name) >= 0, inCmp = st.cmp.indexOf(f.name) >= 0;
			var h = document.createElement("div"); h.className = "fn-chead"; h.innerHTML = '<span class="fn-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span><span class="fn-acts"><button type="button" class="fn-ib' + (isFav ? " on" : "") + '" data-a="fav" title="' + (isFav ? "Remove from favourites" : "Add to favourites") + '" aria-label="Favourite">' + (isFav ? "★" : "☆") + '</button><button type="button" class="fn-ib' + (inCmp ? " on" : "") + '" data-a="cmp" title="Add to Compare (up to four)">⇆</button><button type="button" class="fn-ib" data-a="view" title="Show this font big (fill the window)" aria-label="Show big">⤢</button><button type="button" class="fn-ib" data-a="col" title="' + (isCol ? "Expand this card" : "Collapse this card to its name") + '" aria-label="' + (isCol ? "Expand" : "Collapse") + '" aria-expanded="' + !isCol + '">' + (isCol ? "▸" : "▾") + '</button><button type="button" class="fn-ib" data-a="hide" title="Hide this font (bring it back from Hidden fonts)" aria-label="Hide">⊘</button></span>';
			c.appendChild(h); var s = sample(f); s.setAttribute("data-a", "big"); c.appendChild(s); c.setAttribute("data-f", f.name); frag.appendChild(c);
		});
		renderGsug(); g.appendChild(frag); $("fn-count").textContent = list.length + " of " + fonts.length + " fonts shown"; renderHidden(); cardVars();
		if (!list.length) g.innerHTML = '<p class="tu-note">No fonts on the list match. Pick one of the Google Fonts above, or clear the search or the filter.</p>';
	}
	$("fn-grid").addEventListener("click", function (e) {
		var c = e.target.closest(".fn-card"); if (!c) return; var name = c.getAttribute("data-f"), a = e.target.closest("[data-a]"); a = a && a.getAttribute("data-a");
		if (a === "fav") { var i = st.fav.indexOf(name); if (i >= 0) st.fav.splice(i, 1); else st.fav.push(name); save(); renderGrid(); return; }
		if (a === "col") { var k = UI.col.indexOf(name); if (k >= 0) UI.col.splice(k, 1); else UI.col.push(name); save(); renderGrid(); return; }
		if (a === "hide") { if (UI.hid.indexOf(name) < 0) UI.hid.push(name); if (st.big === name) { st.big = null; $("fn-big").hidden = true; } save(); renderGrid(); toast("Hidden " + name + ": bring it back under Hidden fonts"); return; }
		if (a === "view") { openView(name); return; }
		if (a === "cmp") { var j = st.cmp.indexOf(name); if (j >= 0) st.cmp.splice(j, 1); else if (st.cmp.length >= 4) { toast("Compare shows up to four fonts: remove one first"); return; } else st.cmp.push(name); renderGrid(); renderCompare(); toast(st.cmp.length + " font" + (st.cmp.length === 1 ? "" : "s") + " in Compare"); return; }
		openBig(name);
	});
	$("fn-cats").innerHTML = F.CATS.map(function (c) { return '<button type="button" class="tu-chip" data-c="' + c[0] + '" aria-pressed="' + (c[0] === "all") + '">' + c[1] + "</button>"; }).join("");
	$("fn-cats").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; st.cat = b.getAttribute("data-c"); Array.prototype.forEach.call($("fn-cats").children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderGrid(); });
	$("fn-q").addEventListener("input", function () { st.q = this.value; renderGrid(); }); $("fn-favonly").addEventListener("change", function () { st.favOnly = this.checked; renderGrid(); });

	/* ---------- card size, collapse, hidden fonts ---------- */
	function cardVars() { var g = $("fn-grid"); g.style.setProperty("--cw", F.CARD_W[UI.cw] + "em"); g.style.setProperty("--cs", UI.cs / 100); }
	function renderHidden() {
		var box = $("fn-hidden"), n = UI.hid.length; box.hidden = !n; $("fn-hidn").textContent = n; if (!n) { box.open = false; return; }
		$("fn-hidlist").innerHTML = UI.hid.map(function (nm) { return '<button type="button" class="tu-chip" data-r="' + esc(nm) + '" title="Show this font again">↺ ' + esc(nm) + "</button>"; }).join("");
	}
	$("fn-hidlist").addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (!b) return; var i = UI.hid.indexOf(b.getAttribute("data-r")); if (i >= 0) UI.hid.splice(i, 1); save(); renderGrid(); });
	$("fn-hidall").onclick = function () { UI.hid = []; save(); renderGrid(); toast("All fonts shown again"); };
	Array.prototype.forEach.call(document.querySelectorAll("#fn-cw [data-cw]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cw") === UI.cw)); b.onclick = function () { UI.cw = b.getAttribute("data-cw"); Array.prototype.forEach.call(document.querySelectorAll("#fn-cw [data-cw]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); }); save(); cardVars(); }; });
	var csIn = $("fn-cs"); csIn.value = UI.cs; $("fn-csv").textContent = UI.cs + "%";
	csIn.addEventListener("input", function () { UI.cs = +csIn.value; $("fn-csv").textContent = UI.cs + "%"; cardVars(); save(); });
	$("fn-colall").onclick = function () { visible().forEach(function (f) { if (UI.col.indexOf(f.name) < 0) UI.col.push(f.name); }); save(); renderGrid(); };
	$("fn-expall").onclick = function () { UI.col = []; save(); renderGrid(); };

	/* ---------- one font, filling the window (or the screen) ---------- */
	var vw = $("fn-view"), vwName = null, vwSize = 0;
	function fitView() {
		var box = $("fn-vbody"), smp = box.firstChild; if (!smp) return; var lo = 8, hi = 600, cs = getComputedStyle(box), avH = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
		if (vwSize) { smp.style.fontSize = vwSize + "px"; return; }
		for (var k = 0; k < 18; k++) { var mid = (lo + hi) / 2; smp.style.fontSize = mid + "px"; if (smp.scrollHeight <= avH && smp.scrollWidth <= smp.clientWidth + 1) lo = mid; else hi = mid; }
		smp.style.fontSize = Math.floor(lo) + "px";
	}
	function openView(name) {
		var f = fontByName(name); if (!f) return; vwName = name; vwSize = 0; $("fn-vname").textContent = f.name; applyVars(vw); var b = $("fn-vbody"); b.innerHTML = ""; var smp = sample(f); smp.classList.add("fn-vs"); b.appendChild(smp);
		vw.hidden = false; document.documentElement.classList.add("fn-viewing"); fitView(); $("fn-vclose").focus();
	}
	function closeView() { if (vw.hidden) return; if (document.fullscreenElement === vw && document.exitFullscreen) document.exitFullscreen().catch(function () {}); vw.hidden = true; document.documentElement.classList.remove("fn-viewing"); var c = document.querySelector('#fn-grid .fn-card[data-f="' + (window.CSS && CSS.escape ? CSS.escape(vwName || "") : vwName) + '"] [data-a="view"]'); if (c) c.focus(); vwName = null; }
	$("fn-vclose").onclick = closeView;
	$("fn-vfs").onclick = function () { if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; } if (vw.requestFullscreen) vw.requestFullscreen().catch(function () { toast("Your browser would not go full screen"); }); else toast("Your browser cannot go full screen: the window view stays"); };
	document.addEventListener("fullscreenchange", function () { $("fn-vfs").textContent = document.fullscreenElement === vw ? "⛶ Leave full screen" : "⛶ Full screen"; if (!vw.hidden) setTimeout(fitView, 60); });
	$("fn-vminus").onclick = function () { var s = parseFloat($("fn-vbody").firstChild.style.fontSize) || 40; vwSize = Math.max(8, Math.round(s / 1.2)); fitView(); };
	$("fn-vplus").onclick = function () { var s = parseFloat($("fn-vbody").firstChild.style.fontSize) || 40; vwSize = Math.min(1200, Math.round(s * 1.2)); fitView(); };
	$("fn-vfit").onclick = function () { vwSize = 0; fitView(); };
	$("fn-vbig").onclick = function () { var n = vwName; closeView(); openBig(n); };
	function stepView(d) { var list = visible(); if (!list.length) return; var i = -1; list.forEach(function (f, k) { if (f.name === vwName) i = k; }); var nx = list[(i + d + list.length) % list.length]; var keep = vwSize; openView(nx.name); vwSize = keep; fitView(); }
	$("fn-vprev").onclick = function () { stepView(-1); }; $("fn-vnext").onclick = function () { stepView(1); };
	document.addEventListener("keydown", function (e) { if (vw.hidden) return; if (e.key === "Escape" && !document.fullscreenElement) { e.preventDefault(); closeView(); } else if (e.key === "ArrowLeft") stepView(-1); else if (e.key === "ArrowRight") stepView(1); else if (e.key === "+" || e.key === "=") $("fn-vplus").click(); else if (e.key === "-") $("fn-vminus").click(); });
	window.addEventListener("resize", function () { if (!vw.hidden) fitView(); });

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
		var o = S, scale = 2, runs = S.runs && S.runs.length ? S.runs : [{ t: S.text, b: false, i: false, u: false }];
		function tfm(t) { return o.tf === "uppercase" ? t.toUpperCase() : o.tf === "lowercase" ? t.toLowerCase() : o.tf === "capitalize" ? t.replace(/\b(\w)/g, function (m) { return m.toUpperCase(); }) : t; }
		var lines = [[]]; runs.forEach(function (r) { tfm(r.t).split("\n").forEach(function (part, k) { if (k) lines.push([]); if (part) lines[lines.length - 1].push({ t: part, b: r.b, i: r.i, u: r.u }); }); });
		function fontOf(g) { var w = g.b ? (+o.weight >= 600 ? 900 : 700) : o.weight; return ((o.italic || g.i) ? "italic " : "") + w + " " + o.size * scale + "px " + fam(f); }
		var m = document.createElement("canvas").getContext("2d"); function wOf(g) { m.font = fontOf(g); if ("letterSpacing" in m) m.letterSpacing = o.ls * scale + "px"; return m.measureText(g.t).width; }
		var lw = lines.map(function (ln) { return ln.reduce(function (a, g) { return a + wOf(g); }, 0); });
		var mw = Math.max.apply(null, lw.concat([10])), lhp = o.size * o.lh * scale, pad = (20 + Math.max(o.shadowOn ? o.shBlur + Math.abs(o.shX) + Math.abs(o.shY) : 0, o.glowOn ? o.glowBlur * 2 : 0, o.strokeOn ? o.strokeW : 0)) * scale;
		var W = Math.ceil(mw + pad * 2), H = Math.ceil(lhp * lines.length + pad * 2 + o.size * 0.3 * scale), c = document.createElement("canvas"); c.width = Math.min(W, 8000); c.height = Math.min(H, 8000); var x = c.getContext("2d");
		if (o.bgOn) { x.fillStyle = o.bg; x.fillRect(0, 0, c.width, c.height); }
		x.textBaseline = "alphabetic"; x.textAlign = "left"; x.lineJoin = "round"; var fill = o.color;
		if (o.gradOn) { var a = (o.gAng - 90) * Math.PI / 180, cx = c.width / 2, cy = c.height / 2, r = Math.hypot(c.width, c.height) / 2, gr = x.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r); gr.addColorStop(0, o.g1); gr.addColorStop(1, o.g2); fill = gr; }
		lines.forEach(function (ln, i) {
			var py = pad + lhp * i + o.size * scale * 0.92, px = o.align === "center" ? (c.width - lw[i]) / 2 : o.align === "right" ? c.width - pad - lw[i] : pad;
			ln.forEach(function (g) {
				var gw = wOf(g); x.font = fontOf(g); if ("letterSpacing" in x) x.letterSpacing = o.ls * scale + "px";
				if (o.glowOn) { x.save(); x.shadowColor = o.glow; x.shadowBlur = o.glowBlur * scale; x.fillStyle = fill; x.fillText(g.t, px, py); x.fillText(g.t, px, py); x.restore(); }
				if (o.shadowOn) { x.save(); x.shadowColor = o.shadow; x.shadowBlur = o.shBlur * scale; x.shadowOffsetX = o.shX * scale; x.shadowOffsetY = o.shY * scale; x.fillStyle = fill; x.fillText(g.t, px, py); x.restore(); }
				if (o.strokeOn) { x.strokeStyle = o.stroke; x.lineWidth = o.strokeW * scale * 2; x.strokeText(g.t, px, py); }
				x.fillStyle = fill; x.fillText(g.t, px, py);
				if (g.u) { var th = Math.max(1, o.size * scale * 0.06); x.fillRect(px, py + o.size * scale * 0.1, gw, th); }
				px += gw;
			});
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
		var el = $(id), pair = $(id + "n"); function set(v) { S[key] = valFn ? valFn(v) : v; if (el.type === "checkbox") el.checked = !!S[key]; else if (el.value !== String(S[key])) el.value = S[key]; if (pair && pair.value !== String(S[key])) pair.value = S[key]; }
		set(S[key]);
		el.addEventListener("input", function () { var v = el.type === "checkbox" ? el.checked : (num ? parseFloat(el.value) : el.value); if (num && isNaN(v)) return; set(v); changed(); }); el.addEventListener("change", function () { var v = el.type === "checkbox" ? el.checked : (num ? parseFloat(el.value) : el.value); if (num && isNaN(v)) return; set(v); changed(); });
		if (pair) pair.addEventListener("input", function () { var v = parseFloat(pair.value); if (isNaN(v)) return; S[key] = v; el.value = v; changed(); });
	}
	var CTL = [["fn-size", "size", 1], ["fn-weight", "weight"], ["fn-italic", "italic"], ["fn-tf", "tf"], ["fn-align", "align"], ["fn-color", "color"], ["fn-bgon", "bgOn"], ["fn-bg", "bg"], ["fn-ls", "ls", 1], ["fn-lh", "lh", 1], ["fn-shon", "shadowOn"], ["fn-sh", "shadow"], ["fn-shblur", "shBlur", 1], ["fn-shx", "shX", 1], ["fn-shy", "shY", 1], ["fn-stron", "strokeOn"], ["fn-str", "stroke"], ["fn-strw", "strokeW", 1], ["fn-glon", "glowOn"], ["fn-gl", "glow"], ["fn-glb", "glowBlur", 1], ["fn-grad", "gradOn"], ["fn-g1", "g1"], ["fn-g2", "g2"], ["fn-gang", "gAng", 1]];
	CTL.forEach(function (c) { bind(c[0], c[1], c[2]); });
	var richBox = $("fn-text"); fillBox();
	richBox.addEventListener("input", function () { setRuns(runsOf(richBox)); changed(); });
	richBox.addEventListener("paste", function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t); });
	Array.prototype.forEach.call(document.querySelectorAll("[data-fmt]"), function (b) {
		b.addEventListener("mousedown", function (e) { e.preventDefault(); });   /* keep the selection in the richBox */
		b.addEventListener("click", function () { richBox.focus(); document.execCommand(b.getAttribute("data-fmt")); setRuns(runsOf(richBox)); changed(); });
	});
	$("fn-fmtclear").addEventListener("click", function () { setRuns([{ t: S.text, b: false, i: false, u: false }]); fillBox(); changed(); });
	var ct = 0; function changed() { clearTimeout(ct); ct = setTimeout(function () { save(); renderGrid(); renderCompare(); if (st.big) { var f = fontByName(st.big); if (f) { applyVars($("fn-bigprev")); $("fn-bigprev").firstChild.innerHTML = sampleHtml(); $("fn-css").textContent = F.css(f.name, f.cat, S); } } if (vwName) { applyVars(vw); var vs = $("fn-vbody").firstChild; if (vs) { vs.innerHTML = sampleHtml(); fitView(); } } }, 60); }
	var pr = $("fn-presets"); F.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = p[0]; b.addEventListener("click", function () { var keep = S.text, keepR = S.runs; S = Object.assign({}, F.DEFAULT, p[1], { text: keep, runs: keepR }); CTL.forEach(function (c) { var el = $(c[0]), v = S[c[1]]; if (el.type === "checkbox") el.checked = !!v; else el.value = v; var pair = $(c[0] + "n"); if (pair) pair.value = v; }); save(); changed(); toast(p[0] + " look applied"); }); pr.appendChild(b); });

	/* ---------- more fonts ---------- */
	/* one Google family: its stylesheet, then check the browser can really draw it; resolves true when it was added */
	function loadGoogle(name, cat) {
		if (names[name]) return Promise.resolve(false);
		return new Promise(function (res) {
			var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+") + "&display=swap"; l.onerror = function () { l.remove(); res(false); }; document.head.appendChild(l);
			var to = setTimeout(function () { res(false); }, 9000); l.onload = function () { document.fonts.load("40px '" + name + "'").then(function () { clearTimeout(to); if (document.fonts.check("40px '" + name + "'")) res(addFont(name, cat || "display", "google")); else res(false); }, function () { clearTimeout(to); res(false); }); };
		});
	}
	/* the search also offers Google Fonts that are not added yet: the photo editor's ~530-family catalogue, plus "try this exact name" for any other family */
	var GCAT = (window.MESFontCat && MESFontCat.GOOGLE && MESFontCat.GOOGLE.length ? MESFontCat.GOOGLE : F.GOOGLE).concat(F.GOOGLE);
	function titleCase(q) { return q.trim().replace(/\s+/g, " ").replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); }
	function renderGsug() {
		var box = $("fn-gsug"), q = st.q.trim().toLowerCase(); if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
		var seen = {}, hits = GCAT.filter(function (x) { var k = x[0].toLowerCase(); if (seen[k] || names[x[0]] || k.indexOf(q) < 0) return false; seen[k] = 1; return true; }).slice(0, 12);
		var exact = titleCase(st.q), haveExact = names[exact] || hits.some(function (x) { return x[0].toLowerCase() === exact.toLowerCase(); });
		if (!hits.length && haveExact) { box.hidden = true; box.innerHTML = ""; return; }
		box.hidden = false; box.innerHTML = '<span class="fn-gsug-t">From Google Fonts:</span>';
		hits.forEach(function (x) { add(x[0], x[1], x[0]); });
		if (!haveExact && /^[a-z0-9 ]{2,40}$/i.test(exact)) add(exact, "display", "Try “" + exact + "”");
		function add(name, cat, label) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = "+ " + label; b.title = "Load " + name + " from Google Fonts and add it to the list";
			b.onclick = function () { b.disabled = true; b.textContent = "Loading " + name + "…"; loadGoogle(name, cat).then(function (ok) { if (ok || names[name]) { toast("Added " + name); renderGrid(); openBig(name); } else { b.textContent = name + ": not found on Google Fonts"; } }); };
			box.appendChild(b); }
	}
	var gbtn = $("fn-google");
	gbtn.onclick = function () {
		if (st.google) return; st.google = true; gbtn.disabled = true; var todo = F.GOOGLE.filter(function (x) { return !names[x[0]]; }), done = 0, added = 0; gbtn.textContent = "Loading Google Fonts… 0 / " + todo.length;
		function one(x) { return loadGoogle(x[0], x[1]).then(function (ok) { if (ok) added++; done++; gbtn.textContent = "Loading Google Fonts… " + done + " / " + todo.length; }); }
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
			$("fn-matchnote").textContent = best.length ? "Closest fonts among the " + fonts.length + " this page can draw. A high score means the letter shapes and proportions agree; if nothing scores well, your font is probably not in the list: try “Add 72 popular Google Fonts”, or the other identifiers below." : "Nothing to compare.";
			var wrap = $("fn-results"); wrap.innerHTML = ""; best.forEach(function (r, k) {
				var d = document.createElement("div"); d.className = "fn-res"; var pic = document.createElement("canvas"); pic.width = 300; pic.height = 70; var px = pic.getContext("2d"); px.fillStyle = "#fff"; px.fillRect(0, 0, 300, 70); var s = Math.min(280 / T.crop.w, 56 / T.crop.h); px.drawImage(src, T.crop.x, T.crop.y, T.crop.w, T.crop.h, 10, (70 - T.crop.h * s) / 2, T.crop.w * s, T.crop.h * s);
				var smp = document.createElement("div"); smp.className = "fn-res-s"; smp.style.fontFamily = fam(r.f); smp.style.fontWeight = r.w; smp.style.fontStyle = r.it ? "italic" : "normal"; smp.textContent = text;
				var meta = document.createElement("div"); meta.className = "fn-res-m"; meta.innerHTML = "<b>" + (k + 1) + ". " + esc(r.f.name) + "</b> " + (r.w === "700" ? "bold " : "") + (r.it ? "italic " : "") + '<span class="fn-score">' + Math.round(r.s * 100) + "% match</span>";
				var use = document.createElement("button"); use.type = "button"; use.className = "tu-btn tu-btn--ghost"; use.textContent = "Use this font"; use.onclick = function () { S.text = text; S.runs = null; fillBox(); S.weight = r.w; $("fn-weight").value = r.w; S.italic = r.it; $("fn-italic").checked = r.it; save(); tab("browse"); changed(); openBig(r.f.name); };
				d.appendChild(meta); d.appendChild(pic); d.appendChild(smp); d.appendChild(use); wrap.appendChild(d);
			});
		}
		step();
	};

	/* ---------- start ---------- */
	renderGrid(); if (startFont && fontByName(startFont)) openBig(startFont);
	else if (startFont && qp.get("g") === "1") loadGoogle(startFont, qp.get("c") || "sans").then(function (ok) { if (ok || names[startFont]) { renderGrid(); openBig(startFont); } else toast(startFont + " was not found on Google Fonts"); });
})();
