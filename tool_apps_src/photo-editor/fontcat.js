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
		list("display", "Impact|Arial Black|Haettenschweiler|Copperplate|Copperplate Gothic Bold|Papyrus|Chalkduster|Marker Felt|Comic Sans MS|Luminari|Phosphate|Herculanum|Trattatello|Party LET|American Typewriter|Stencil|Jokerman|Chiller|Ravie|Showcard Gothic|Algerian|Bauhaus 93|Broadway|Cooper Black|Gill Sans Ultra Bold|Rockwell Extra Bold|Bernard MT Condensed|Britannic Bold|Agency FB|Castellar|Playbill|Snap ITC|Curlz MT|Wide Latin|Goudy Stout|Engravers MT|Felix Titling|Colonna MT|Imprint MT Shadow|Magneto|Niagara Engraved|Niagara Solid|Old English Text MT|Onyx|Poor Richard|Harrington|Juice ITC|Gigi|Forte|Harlow Solid Italic|Elephant|Matura MT Script Capitals|Gloucester MT Extra Condensed|Blackadder ITC|Parchment|Academy Engraved LET|Bodoni 72 Smallcaps|Comfortaa|Webdings|Wingdings|Symbol"),
		list("hand", "Brush Script MT|Segoe Script|Segoe Print|Lucida Handwriting|Lucida Calligraphy|Bradley Hand|Bradley Hand ITC|Snell Roundhand|Zapfino|Noteworthy|Chalkboard|Chalkboard SE|Ink Free|Mistral|Kristen ITC|Monotype Corsiva|Apple Chancery|Savoye LET|Edwardian Script ITC|Freestyle Script|French Script MT|Kunstler Script|Palace Script MT|Rage Italic|Script MT Bold|Vivaldi|Vladimir Script|Viner Hand ITC|Tempus Sans ITC|Pristina|Informal Roman|Gabriola|MV Boli|Purisa|Z003")
	);
	var GOOGLE = [].concat(
		list("sans", "Roboto|Open Sans|Montserrat|Lato|Poppins|Inter|Noto Sans|Raleway|Nunito|Nunito Sans|Ubuntu|Rubik|Work Sans|Mulish|Kanit|Fira Sans|Quicksand|Barlow|Manrope|DM Sans|Heebo|PT Sans|Source Sans 3|Karla|Josefin Sans|Libre Franklin|Mukta|Hind|Titillium Web|Arimo|Cabin|Oxygen|Outfit|Figtree|Plus Jakarta Sans|Lexend|Inter Tight|Assistant|Prompt|IBM Plex Sans|Exo 2|Exo|Barlow Condensed|Barlow Semi Condensed|Oswald|Archivo|Archivo Narrow|Red Hat Display|Red Hat Text|Public Sans|Sora|Space Grotesk|Urbanist|Jost|Catamaran|Asap|Encode Sans|Overpass|Maven Pro|Signika|Varela Round|Varela|Abel|Dosis|M PLUS Rounded 1c|Questrial|Saira|Saira Condensed|Chivo|Be Vietnam Pro|Lexend Deca|Sarabun|Albert Sans|Onest|Golos Text|Commissioner|Epilogue|Schibsted Grotesk|Instrument Sans|Gothic A1|Noto Sans JP|Noto Sans KR|Yantramanav|Pathway Gothic One|Fjalla One|Teko|Antonio|League Spartan|Rajdhani|Khand|Russo One|Play|Ropa Sans|Cantarell|Didact Gothic|Mada|Tajawal|Cairo|Almarai|Alata|Sen|Kumbh Sans|Atkinson Hyperlegible|Hanken Grotesk|Wix Madefor Display|Readex Pro|Darker Grotesque|Familjen Grotesk|Tenor Sans|Montserrat Alternates|Nanum Gothic|Istok Web|Actor|Gudea|Magra|Armata|Carme|Telex|Average Sans|Belleza|Marvel|Jura|Advent Pro|Monda|Homenaje|Geologica|Unbounded|Bricolage Grotesque|Afacad|Reddit Sans|Noto Sans Display|Spline Sans|Anek Latin|Hind Siliguri|Ruda|Yanone Kaffeesatz|Archivo Black|Sofia Sans|Mona Sans|Geist"),
		list("serif", "Playfair Display|Merriweather|Lora|Roboto Slab|PT Serif|Noto Serif|Libre Baskerville|EB Garamond|Crimson Text|Crimson Pro|Cormorant Garamond|Cormorant|Source Serif 4|Bitter|Arvo|Zilla Slab|Josefin Slab|Domine|Vollkorn|Alegreya|Spectral|Cardo|Old Standard TT|Libre Caslon Text|DM Serif Display|DM Serif Text|Frank Ruhl Libre|Noticia Text|Slabo 27px|Roboto Serif|IBM Plex Serif|Rokkitt|Tinos|Gelasio|Prata|Cinzel|Marcellus|Bodoni Moda|Abhaya Libre|Literata|Newsreader|Fraunces|Young Serif|Instrument Serif|Gloock|Rozha One|Yeseva One|Rufina|Neuton|Sorts Mill Goudy|Gentium Book Plus|Amiri|Lusitana|Martel|Halant|Kreon|Aleo|Brawler|Unna|Petrona|Trirong|Taviraj|Faustina|Eczar|Libre Bodoni|Bellefair|Quattrocento|Lustria|Ovo|Fanwood Text|Linden Hill|Judson|Esteban|Radley|Podkova|Copse|Sanchez|Glegoo|Crete Round|Alike|Coustard|Arapey|Rasa|Hahmlet|Noto Serif JP|Nanum Myeongjo|Lancelot|Gilda Display|Bentham|Caudex|Forum|Mate|Average|Adamina|Habibi|Kurale|Poly|Junge|Trocchi|Vidaloka|Playfair|Cormorant Infant|Della Respira|Noto Serif Display|Castoro|Brygada 1918|Piazzolla|Besley|Inknut Antiqua|Lustria"),
		list("mono", "Roboto Mono|Source Code Pro|Fira Code|Fira Mono|JetBrains Mono|IBM Plex Mono|Space Mono|Inconsolata|Ubuntu Mono|PT Mono|Courier Prime|Anonymous Pro|Cousine|DM Mono|Red Hat Mono|Noto Sans Mono|Overpass Mono|Major Mono Display|Share Tech Mono|VT323|Nanum Gothic Coding|Sometype Mono|Martian Mono|Azeret Mono|Spline Sans Mono|Victor Mono|Xanh Mono|Syne Mono|B612 Mono|Cutive Mono|Oxygen Mono|Chivo Mono|Geist Mono|Kode Mono|Sono|Lekton"),
		list("display", "Bebas Neue|Anton|Lobster|Abril Fatface|Alfa Slab One|Righteous|Bangers|Fredoka|Passion One|Titan One|Bungee|Bungee Inline|Bungee Shade|Bungee Hairline|Monoton|Press Start 2P|Orbitron|Audiowide|Black Ops One|Staatliches|Rubik Mono One|Shrikhand|Fascinate|Fascinate Inline|Chewy|Luckiest Guy|Creepster|Nosifer|Eater|Frijole|Bowlby One SC|Bowlby One|Lilita One|Paytone One|Ultra|Rammetto One|Sigmar One|Holtwood One SC|Bevan|Coda|Changa One|Racing Sans One|Faster One|Codystar|Lobster Two|Cinzel Decorative|Poiret One|Unica One|Limelight|Vast Shadow|Diplomata SC|Megrim|Wallpoet|Zen Dots|Syncopate|Michroma|Gruppo|Quantico|Iceland|Turret Road|Big Shoulders Display|Silkscreen|Rubik Glitch|Rubik Wet Paint|Rubik Puddles|Rubik Bubbles|Rubik Beastly|Rubik Moonrocks|Rubik Vinyl|Rubik Dirt|Climate Crisis|Bagel Fat One|Dela Gothic One|Grandstander|Baloo 2|Concert One|Boogaloo|Bubblegum Sans|Fredericka the Great|Rye|Special Elite|Calistoga|Coiny|Gravitas One|Erica One|Emblema One|Plaster|Sonsie One|Spicy Rice|Kavoon|Knewave|Lemon|Modak|Atomic Age|Monofett|Henny Penny|Butcherman|Metal Mania|New Rocker|UnifrakturMaguntia|Pirata One|Almendra Display|Uncial Antiqua|MedievalSharp|Germania One|Graduate|Squada One|Saira Stencil One|Stardos Stencil|Allerta Stencil|Oi|Tilt Warp|Tilt Prism|Krona One|Comfortaa|Yatra One|Lily Script One|Patua One|Oleo Script|Kumar One|Playfair Display SC|Carter One|Cherry Cream Soda|Fugaz One|Goblin One|Londrina Solid|Londrina Outline|Mystery Quest|Nova Square|Original Surfer|Ranchers|Sniglet|Stalinist One|Train One|Zilla Slab Highlight|Bigshot One|Abril Fatface"),
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
