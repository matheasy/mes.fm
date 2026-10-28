/* MES Dictionary: pure helpers (no DOM), node-testable: node tool_apps_src/define-tests.js
   Definitions come from Wiktionary (CC BY-SA): the REST "definition" endpoint gives the senses as HTML (parsed into text + clickable words),
   the page's wikitext gives what that endpoint leaves out (sense labels, synonyms / antonyms per sense, etymology, forms, derived / related
   terms, hyphenation, IPA, recordings, translations). dictionaryapi.dev (also Wiktionary-derived) is only a fallback when the REST call fails.
   Pronunciation (CMU syllables, IPA, respelling) is MES Pronounce's MESPron, loaded with this file (lib_from). */
var MESDef = (function () {
	"use strict";

	/* ---------- words, links ---------- */
	function normWord(s) {
		s = String(s == null ? "" : s).replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
		s = s.replace(/^[\s"“”«»(\[{]+|[\s"“”«»)\]}.,;:!?]+$/g, "");
		return s.slice(0, 80);
	}
	// spellings to try, in order: as typed, lower case, Capitalised (Wiktionary page titles are case-sensitive)
	function variants(w) {
		w = normWord(w);
		var out = [];
		[w, w.toLowerCase(), w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()].forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); });
		return out;
	}
	function title(w) { return normWord(w).replace(/ /g, "_"); }
	function restUrl(w) { return "https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(title(w)) + "?redirect=true"; }
	function wikitextUrl(w) { return "https://en.wiktionary.org/w/api.php?action=parse&page=" + encodeURIComponent(title(w)) + "&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*"; }
	function suggestUrl(q) { return "https://en.wiktionary.org/w/api.php?action=opensearch&search=" + encodeURIComponent(normWord(q)) + "&limit=8&namespace=0&format=json&origin=*"; }
	function dictApiUrl(w) { return "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(normWord(w).toLowerCase()); }
	function wiktionaryPage(w) { return "https://en.wiktionary.org/wiki/" + encodeURIComponent(title(w)) + "#English"; }
	function shareLink(w) { return "https://mes.fm/define?w=" + encodeURIComponent(normWord(w)).replace(/%20/g, "+"); }
	function translateLink(text, to) { return "/translate?from=en&to=" + encodeURIComponent(to || "es") + "&q=" + encodeURIComponent(String(text || "").slice(0, 1500)); }
	function pronounceLink(w) { return "/pronounce?q=" + encodeURIComponent(normWord(w)); }

	// ?w=word (also q, word), /define/<word> (a rewrite keeps that address), ?list=a,b,c (a shared word list)
	function parseQuery(search, pathname) {
		var o = {}, p;
		try { p = new URLSearchParams(search || ""); } catch (e) { p = new URLSearchParams(""); }
		var w = p.get("w") || p.get("q") || p.get("word");
		if (!w) {
			var m = /^\/define\/([^\/?#]+)\/?$/.exec(pathname || "");
			if (m && /^index$|\.(html?|php|json|js|png)$/i.test(m[1])) m = null;   // the page's own file, not a word
			if (m) { try { w = decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { w = ""; } }
		}
		w = normWord(w);
		if (w) o.w = w;
		var l = p.get("list");
		if (l) {
			var seen = {};
			o.list = l.split(",").map(normWord).filter(function (x) { var k = x.toLowerCase(); if (!x || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 200);
		}
		return o;
	}
	function listLink(words) { return "https://mes.fm/define?list=" + words.map(function (w) { return encodeURIComponent(normWord(w)); }).join(","); }

	/* ---------- HTML (REST) -> segments: [{t: text}] or [{t: text, w: word to look up}] ---------- */
	var ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", minus: "−", times: "×", deg: "°", prime: "′" };
	function decode(s) {
		return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
			if (e[0] === "#") { var n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return ""; } }
			return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
		});
	}
	function pushText(segs, t) {
		if (!t) return;
		var last = segs[segs.length - 1];
		if (last && !last.w) last.t += t; else segs.push({ t: t });
	}
	function tidySegs(segs) {
		// collapse white space across segments, trim the ends, drop empties
		var out = [];
		segs.forEach(function (s) { var t = s.t.replace(/\s+/g, " "); if (t) out.push(s.w ? { t: t, w: s.w } : { t: t }); });
		if (out.length) { out[0].t = out[0].t.replace(/^\s+/, ""); out[out.length - 1].t = out[out.length - 1].t.replace(/\s+$/, ""); }
		out = out.filter(function (s) { return s.t; });
		for (var i = 1; i < out.length; i++) if (/\s$/.test(out[i - 1].t) && /^\s/.test(out[i].t)) out[i].t = out[i].t.replace(/^\s+/, "");
		// " ," and "( " left behind by removed labels
		out.forEach(function (s) { if (!s.w) s.t = s.t.replace(/\s+([,.;:!?)])/g, "$1").replace(/\(\s+/g, "("); });
		return out.filter(function (s) { return s.t; });
	}
	function linkTarget(href) {
		var m = /^(?:\.?\/wiki\/|https:\/\/en\.wiktionary\.org\/wiki\/)([^#?]+)(#([^?]*))?/.exec(href || "");
		if (!m) return "";
		if (m[3] && !/^English$/i.test(m[3]) && !/^(Noun|Verb|Adjective|Adverb|Etymology|Pronoun|Preposition)/i.test(m[3])) return "";   // a link to another language's entry
		var t; try { t = decodeURIComponent(m[1]); } catch (e) { return ""; }
		t = t.replace(/_/g, " ");
		if (/^[A-Za-z]+:/.test(t)) return "";       // Category:, Appendix:, Thesaurus: ...
		return t;
	}
	function htmlToSegs(html) {
		var s = String(html || "");
		s = s.replace(/<(style|script|sup)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<link[^>]*>/gi, "").replace(/<span class="usage-label-sense"[^>]*>\s*<\/span>/gi, "");
		var segs = [], re = /<a\b([^>]*)>([\s\S]*?)<\/a>|<br\s*\/?>|<[^>]+>|([^<]+)/gi, m;
		while ((m = re.exec(s))) {
			if (m[3] != null) { pushText(segs, decode(m[3])); continue; }
			if (m[2] != null) {
				var label = decode(m[2].replace(/<[^>]+>/g, "")), hm = /href="([^"]*)"/.exec(m[1]), tgt = hm && /mw:WikiLink(?!\/Interwiki)/.test(m[1]) ? linkTarget(decode(hm[1])) : "";
				if (tgt && label) segs.push({ t: label, w: tgt }); else pushText(segs, label);
				continue;
			}
			if (/^<br/i.test(m[0])) pushText(segs, " ");
		}
		return tidySegs(segs);
	}
	function segsText(segs) { return (segs || []).map(function (s) { return s.t; }).join(""); }

	/* ---------- REST definitions ---------- */
	var FORM_OF = /^(plural|simple past|past participle|present participle|third-person singular|comparative|superlative|alternative (?:form|spelling)|obsolete (?:form|spelling)|archaic (?:form|spelling)|misspelling|abbreviation|initialism|acronym|short for|contraction|eye dialect spelling|nonstandard (?:form|spelling)|pronunciation spelling|clipping)\b[^.]*? of\b/i;
	function parseRest(json) {
		var out = [], other = [];
		if (!json || typeof json !== "object") return { pos: out, other: other };
		Object.keys(json).forEach(function (k) {
			if (k === "en") return;
			(json[k] || []).forEach(function (e) { if (e && e.language && other.indexOf(e.language) < 0) other.push(e.language); });
		});
		(json.en || []).forEach(function (e) {
			var senses = [];
			(e.definitions || []).forEach(function (d) {
				var segs = htmlToSegs(d.definition), text = segsText(segs);
				if (!text) return;
				var ex = (d.parsedExamples && d.parsedExamples.length ? d.parsedExamples.map(function (x) { return x.example; }) : d.examples || [])
					.map(function (x) { return segsText(htmlToSegs(x)); }).filter(function (x) { return x && x.length < 400; }).slice(0, 3);
				var sense = { segs: segs, text: text, ex: ex };
				if (FORM_OF.test(text)) {
					var link = segs.filter(function (s) { return s.w; }).pop();
					if (link) sense.formOf = link.w;
				}
				senses.push(sense);
			});
			if (senses.length) out.push({ pos: e.partOfSpeech || "", senses: senses });
		});
		return { pos: out, other: other };
	}

	/* ---------- dictionaryapi.dev fallback ---------- */
	function parseDictApi(json) {
		var out = { pos: [], syn: [], ant: [], ipa: [], audio: [] };
		if (!Array.isArray(json)) return out;
		var byPos = {};
		json.forEach(function (e) {
			(e.phonetics || []).forEach(function (p) {
				if (p.text && out.ipa.indexOf(p.text) < 0) out.ipa.push(p.text);
				if (p.audio && /^https:\/\//.test(p.audio)) { var a = /-(us|uk|au|ca|ie|nz|in)\.mp3$/i.exec(p.audio); out.audio.push({ url: p.audio, acc: a ? a[1].toUpperCase() : "" }); }
			});
			(e.meanings || []).forEach(function (m) {
				var pos = String(m.partOfSpeech || "");
				pos = pos.charAt(0).toUpperCase() + pos.slice(1);
				var g = byPos[pos];
				if (!g) { g = byPos[pos] = { pos: pos, senses: [] }; out.pos.push(g); }
				(m.definitions || []).forEach(function (d) {
					if (!d.definition) return;
					g.senses.push({ segs: [{ t: String(d.definition) }], text: String(d.definition), ex: d.example ? [String(d.example)] : [], syn: (d.synonyms || []).slice(0, 12), ant: (d.antonyms || []).slice(0, 12), labels: [] });
				});
				(m.synonyms || []).forEach(function (x) { if (out.syn.indexOf(x) < 0) out.syn.push(x); });
				(m.antonyms || []).forEach(function (x) { if (out.ant.indexOf(x) < 0) out.ant.push(x); });
			});
		});
		return out;
	}

	/* ---------- wikitext: templates ---------- */
	// split "a|b|{{c|d}}|[[e|f]]" at the top level
	function splitArgs(s) {
		var out = [], depth = 0, cur = "", i = 0;
		while (i < s.length) {
			var two = s.substr(i, 2);
			if (two === "{{" || two === "[[") { depth++; cur += two; i += 2; continue; }
			if ((two === "}}" || two === "]]") && depth > 0) { depth--; cur += two; i += 2; continue; }
			if (s[i] === "|" && depth === 0) { out.push(cur); cur = ""; i++; continue; }
			cur += s[i]; i++;
		}
		out.push(cur);
		return out;
	}
	// one template's text (without the braces) -> {name, pos: [positional], named: {k: v}}
	function tplParts(inner) {
		var a = splitArgs(inner), name = a.shift().trim(), pos = [], named = {};
		a.forEach(function (x) {
			var m = /^\s*([A-Za-z][\w-]*|\d+)\s*=([\s\S]*)$/.exec(x);
			if (m && !/^\d+$/.test(m[1])) named[m[1]] = m[2].trim(); else pos.push(x.trim());
		});
		return { name: name, pos: pos, named: named };
	}
	// replace every outermost {{...}} with fn(parts) (a string); inner templates are handled by fn itself (via expand) when it wants them
	function expand(s, fn) {
		s = String(s || "");
		var out = "", i = 0;
		while (i < s.length) {
			var j = s.indexOf("{{", i);
			if (j < 0) { out += s.slice(i); break; }
			out += s.slice(i, j);
			var depth = 0, k = j;
			for (; k < s.length; k++) {
				if (s.substr(k, 2) === "{{") { depth++; k++; continue; }
				if (s.substr(k, 2) === "}}") { depth--; k++; if (depth === 0) break; }
			}
			if (depth !== 0) { out += s.slice(j); break; }
			var r = fn(tplParts(s.slice(j + 2, k - 1)));
			out += r == null ? "" : r;
			i = k + 1;
		}
		return out;
	}
	// "word<t:gloss><q:...>" inline modifiers
	function stripMods(x) { return String(x || "").replace(/<[a-z]+:[^<>]*>/gi, "").trim(); }
	function modGloss(x) { var m = /<(?:t|gloss):([^<>]*)>/i.exec(x || ""); return m ? m[1].trim() : ""; }
	function cleanItem(x) {
		x = stripMods(x).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''?/g, "").replace(/\{\{[^{}]*\}\}/g, "").trim();
		return /^(Thesaurus|Wikisaurus|Appendix|Category|w):/i.test(x) ? "" : x;
	}

	var LANG = {
		en: "English", enm: "Middle English", ang: "Old English", sco: "Scots", "en-early": "Early Modern English",
		la: "Latin", "la-lat": "Late Latin", "la-med": "Medieval Latin", "la-new": "New Latin", "la-vul": "Vulgar Latin", "la-cla": "Classical Latin", "la-ecc": "Ecclesiastical Latin", "la-ren": "Renaissance Latin", "LL.": "Late Latin", "ML.": "Medieval Latin", "NL.": "New Latin", "VL.": "Vulgar Latin",
		fro: "Old French", frm: "Middle French", fr: "French", xno: "Anglo-Norman", "fro-nor": "Old Northern French", pro: "Old Occitan", oc: "Occitan",
		grc: "Ancient Greek", "grc-koi": "Koine Greek", el: "Greek", gkm: "Byzantine Greek",
		non: "Old Norse", is: "Icelandic", fo: "Faroese", nn: "Norwegian Nynorsk", nb: "Norwegian Bokmål", no: "Norwegian", sv: "Swedish", da: "Danish",
		de: "German", gmh: "Middle High German", goh: "Old High German", gml: "Middle Low German", osx: "Old Saxon", nl: "Dutch", dum: "Middle Dutch", odt: "Old Dutch", ofs: "Old Frisian", fy: "West Frisian", frk: "Frankish", got: "Gothic", yi: "Yiddish",
		"gem-pro": "Proto-Germanic", "gmw-pro": "Proto-West Germanic", "ine-pro": "Proto-Indo-European", "itc-pro": "Proto-Italic", "cel-pro": "Proto-Celtic", "sla-pro": "Proto-Slavic", "grk-pro": "Proto-Hellenic", "iir-pro": "Proto-Indo-Iranian",
		it: "Italian", es: "Spanish", pt: "Portuguese", ca: "Catalan", ro: "Romanian", osp: "Old Spanish",
		ga: "Irish", sga: "Old Irish", gd: "Scottish Gaelic", cy: "Welsh", br: "Breton", kw: "Cornish",
		ar: "Arabic", fa: "Persian", he: "Hebrew", hbo: "Biblical Hebrew", arc: "Aramaic", tr: "Turkish", ota: "Ottoman Turkish",
		sa: "Sanskrit", hi: "Hindi", ur: "Urdu", bn: "Bengali", ta: "Tamil", ml: "Malayalam", pi: "Pali",
		zh: "Chinese", cmn: "Mandarin", yue: "Cantonese", ja: "Japanese", ko: "Korean", vi: "Vietnamese", ms: "Malay", tl: "Tagalog",
		ru: "Russian", pl: "Polish", cs: "Czech", hu: "Hungarian", fi: "Finnish", et: "Estonian",
		nah: "Classical Nahuatl", qu: "Quechua", haw: "Hawaiian", mi: "Maori", sw: "Swahili", af: "Afrikaans", "egy": "Egyptian", akk: "Akkadian"
	};
	function langName(c) { return LANG[c] || ""; }
	function gl(g) { return g ? " (“" + g + "”)" : ""; }
	function enLink(w, label) { w = stripMods(w); return w ? "[[" + w + (label && label !== w ? "|" + label : "") + "]]" : ""; }
	function mention(lang, word, alt, gloss) {
		word = stripMods(word); alt = stripMods(alt);
		if (!word && !alt) return gloss ? "(“" + gloss + "”)" : "";
		var shown = alt || word.replace(/^\*/, "*");
		return (lang === "en" ? enLink(word, alt) : "''" + shown + "''") + gl(gloss);
	}
	var DER_PREFIX = { "inh+": "Inherited from ", "bor+": "Borrowed from ", "der+": "Derived from ", lbor: "Learned borrowing from ", slbor: "Semi-learned borrowing from ", obor: "Orthographic borrowing from ", calque: "Calque of ", cal: "Calque of ", "pcal": "Partial calque of ", "sl": "Semantic loan from ", "translit": "Transliteration of " };
	function etyTpl(p) {
		var n = p.name.toLowerCase(), a = p.pos, g;
		if (/^(inh|der|bor|uder|ubor|inh\+|der\+|bor\+|lbor|slbor|obor|calque|cal|pcal|sl|translit|inherited|derived|borrowed)$/.test(n)) {
			// {{der|en|SRC|word|alt|gloss}}
			g = a[4] || p.named.t || p.named.gloss || "";
			var lang = langName(a[1]), w = a[2] && a[2] !== "-" ? mention(a[1], a[2], a[3], g) : "";
			return (DER_PREFIX[n] || "") + (lang ? lang + (w ? " " : "") : "") + w;
		}
		if (/^(m|mention|l|link|ll|l-self|m-self)$/.test(n)) { g = a[3] || p.named.t || p.named.gloss || ""; return mention(a[0], a[1], a[2], g); }
		if (/^(cog|cognate|ncog|noncog|noncognate)$/.test(n)) { g = a[3] || p.named.t || ""; var ln = langName(a[0]); return (ln ? ln + " " : "") + mention(a[0], a[1], a[2], g); }
		if (/^(af|affix|compound|com|blend|surf|surface analysis|con|confix)$/.test(n)) {
			var parts = a.slice(1).filter(function (x) { return x && x.trim(); }).map(function (x) { var w = stripMods(x), t = modGloss(x); return w ? enLink(w) + gl(t) : ""; }).filter(Boolean);
			if (!parts.length) return "";
			return (n === "blend" ? "Blend of " : n === "surf" || n === "surface analysis" ? "By surface analysis, " : "") + parts.join(" + ");
		}
		if (n === "suffix" || n === "suf") return [a[1], a[2] && !/^-/.test(stripMods(a[2])) ? "-" + stripMods(a[2]) : a[2]].filter(Boolean).map(function (x) { return enLink(x) + gl(modGloss(x)); }).join(" + ");
		if (n === "prefix" || n === "pre") return [a[1] && !/-$/.test(stripMods(a[1])) ? stripMods(a[1]) + "-" : a[1], a[2]].filter(Boolean).map(function (x) { return enLink(x) + gl(modGloss(x)); }).join(" + ");
		if (n === "doublet" || n === "dbt") return "Doublet of " + a.slice(1).filter(Boolean).map(function (x) { return enLink(x); }).join(" and ");
		if (n === "clipping" || n === "clip") return "Clipping of " + enLink(a[1]);
		if (n === "back-form" || n === "back-formation" || n === "bf") return "Back-formation from " + enLink(a[1]);
		if (n === "short for" || n === "abbrev" || n === "abbreviation of") return "Short for " + enLink(a[1]);
		if (n === "named-after") return "Named after " + cleanItem(a[1] || "");
		if (n === "coinage" || n === "coin") return "Coined by " + cleanItem(a[1] || "");
		if (n === "onomatopoeic" || n === "onom") return "Onomatopoeic";
		if (n === "unknown" || n === "unk") return "Unknown";
		if (n === "uncertain" || n === "unc") return "Uncertain";
		if (n === "glossary" || n === "w" || n === "pedia" || n === "wp" && a.length) return cleanItem(a[1] || a[0] || "");
		if (n === "gloss" || n === "gl") return "(“" + (a[0] || "") + "”)";
		if (n === "q" || n === "qualifier" || n === "i" || n === "qual" || n === "sense" || n === "s") return "(" + a.join(", ") + ")";
		if (n === "taxlink" || n === "vern" || n === "taxfmt") return a[0] || "";
		if (n === "nb..." || n === "..." || n === "…") return "…";
		return "";
	}
	// remove refs, comments, files and formatting; [[a|b]] stays (segments make it clickable)
	function prepWiki(s) {
		return String(s || "")
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(/<ref\b[^>\/]*\/>/gi, "").replace(/<ref\b[\s\S]*?<\/ref>/gi, "")
			.replace(/\[\[(?:File|Image):[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]/gi, "")
			.replace(/<\/?(?:sup|sub|span|small|big|i|b|u)[^>]*>/gi, "");
	}
	// wiki markup -> segments (English [[links]] become clickable)
	function wikiToSegs(s) {
		s = decode(String(s || "").replace(/'''?/g, "").replace(/<[^>]+>/g, ""));
		var segs = [], re = /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, last = 0, m;
		while ((m = re.exec(s))) {
			pushText(segs, s.slice(last, m.index));
			var tgt = m[1].split("#")[0].trim(), anchor = (m[1].split("#")[1] || ""), label = (m[2] != null ? m[2] : m[1].split("#")[0]).trim();
			if (tgt && !/^[A-Za-z]+:/.test(tgt) && (!anchor || /^English|^(Noun|Verb|Adjective|Adverb|Etymology)/i.test(anchor))) segs.push({ t: label, w: tgt });
			else pushText(segs, label);
			last = re.lastIndex;
		}
		pushText(segs, s.slice(last));
		return tidySegs(segs);
	}
	function renderEty(text) {
		var s = expand(prepWiki(text), etyTpl);
		s = s.replace(/^[\s,;:.]+/, "").replace(/\(\s*\)/g, "").replace(/\s*,\s*,/g, ",").replace(/(From|from)\s*,/g, "$1").replace(/\s+\./g, ".").replace(/\n+/g, " ");
		var segs = wikiToSegs(s);
		return segsText(segs).replace(/[\s.,;:]/g, "").length > 2 ? segs : [];
	}
	// a definition line ("# {{lb|en|math}} A [[finite]] ...") -> plain text for matching
	function plainDef(line) {
		var s = expand(prepWiki(line), function (p) {
			var n = p.name.toLowerCase();
			if (/^(l|m|ll|link|mention)$/.test(n)) return p.pos[2] || p.pos[1] || "";
			if (/^(w|taxlink|vern|n-g|non-gloss definition|non-gloss|ng|gloss|gl)$/.test(n)) return p.pos[1] && n === "w" ? p.pos[1] : p.pos[0] || "";
			return "";
		});
		return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''?/g, "");
	}
	function key(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
	function similarity(a, b) {
		a = key(a); b = key(b);
		if (!a || !b) return 0;
		if (a === b) return 1;
		var n = Math.min(a.length, b.length, 50);
		if (n >= 12 && a.slice(0, n) === b.slice(0, n)) return 0.95;
		var wa = a.split(" "), wb = b.split(" "), set = {}, hit = 0;
		wb.forEach(function (w) { set[w] = (set[w] || 0) + 1; });
		wa.forEach(function (w) { if (set[w]) { set[w]--; hit++; } });
		return 2 * hit / (wa.length + wb.length);
	}

	var LABEL_NAMES = { math: "mathematics", maths: "mathematics", mathematics: "mathematics", chem: "chemistry", chemistry: "chemistry", phys: "physics", physics: "physics", bio: "biology", biology: "biology", med: "medicine", medicine: "medicine", comp: "computing", computing: "computing", programming: "programming", geom: "geometry", stats: "statistics", statistics: "statistics", astro: "astronomy", astronomy: "astronomy", law: "law", music: "music", sports: "sports", finance: "finance", economics: "economics", engineering: "engineering", mechanics: "mechanics", geology: "geology", grammar: "grammar", linguistics: "linguistics", philosophy: "philosophy", military: "military", nautical: "nautical", cooking: "cooking", "US": "US", "UK": "UK", "Britain": "UK", "Australia": "Australia", "Canada": "Canada", "Ireland": "Ireland", "Scotland": "Scotland", "India": "India", informal: "informal", colloquial: "colloquial", slang: "slang", formal: "formal", archaic: "archaic", obsolete: "obsolete", dated: "dated", rare: "rare", poetic: "poetic", literary: "literary", figuratively: "figurative", figurative: "figurative", humorous: "humorous", derogatory: "derogatory", offensive: "offensive", vulgar: "vulgar", transitive: "transitive", intransitive: "intransitive", ambitransitive: "transitive, intransitive", uncountable: "uncountable", countable: "countable", "in the plural": "in the plural", "historical": "historical", "chiefly": "chiefly", "especially": "especially", "usually": "usually", "now": "now", "rare": "rare", "nonstandard": "nonstandard", "euphemistic": "euphemistic", "idiomatic": "idiomatic", "ergative": "ergative", "attributive": "attributive", "Internet": "Internet", "internet": "Internet" };
	function labelsOf(p) {
		var out = [], join = false;
		p.pos.slice(1).forEach(function (x) {
			x = stripMods(x);
			if (!x) return;
			if (x === "_" || x === "or" || x === "and") { join = x; return; }
			var name = LABEL_NAMES[x] || x.replace(/_/g, " ");
			if (join && out.length) out[out.length - 1] += (join === "_" ? " " : " " + join + " ") + name; else out.push(name);
			join = false;
		});
		return out;
	}
	function listItems(p) {
		// {{syn|en|a|b|Thesaurus:x}} / {{col|en|a|b}} ...: positional args after the language
		return p.pos.slice(1).map(cleanItem).filter(function (x) { return x && x.length < 60; });
	}
	function uniq(a) { var seen = {}; return a.filter(function (x) { var k = String(x).toLowerCase(); if (!x || seen[k]) return false; seen[k] = 1; return true; }); }

	var POS_NAMES = ["Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Determiner", "Article", "Numeral", "Number", "Particle", "Prefix", "Suffix", "Infix", "Interfix", "Proper noun", "Phrase", "Prepositional phrase", "Proverb", "Symbol", "Letter", "Contraction", "Abbreviation", "Initialism", "Acronym", "Idiom", "Participle"];
	var LIST_SECS = { "Synonyms": "syn", "Antonyms": "ant", "Derived terms": "der", "Related terms": "rel", "See also": "see", "Hyponyms": "hypo", "Hypernyms": "hyper", "Coordinate terms": "coord", "Compounds": "der", "Alternative forms": "alt" };

	function englishSection(wt) {
		var s = String(wt || ""), i = s.search(/^==\s*English\s*==\s*$/m);
		if (i < 0) return "";
		var rest = s.slice(i), m = /\n==[^=][^\n]*==[ \t]*(\n|$)/.exec(rest.slice(5));
		return m ? rest.slice(0, m.index + 5) : rest;
	}
	var ACC = { RP: "UK", GA: "US", "General American": "US", "Received Pronunciation": "UK", UK: "UK", US: "US", "Southern England": "UK", "Standard Southern British": "UK", SSB: "UK", AU: "Australia", AUS: "Australia", Australia: "Australia", "General Australian": "Australia", CA: "Canada", Canada: "Canada", NZ: "New Zealand", "New Zealand": "New Zealand", IE: "Ireland", Ireland: "Ireland", Scotland: "Scotland", India: "India", "Indian English": "India", ZA: "South Africa", "South Africa": "South Africa", "Northern England": "Northern England", "North American": "North America", NA: "North America", "Canadian": "Canada", Wales: "Wales", "General Indian English": "India", "Philippines": "Philippines", "Singapore": "Singapore" };
	function accentOf(a) {
		if (!a) return "";
		var names = String(a).split(",").map(function (x) { x = x.trim(); return ACC[x] || ""; }).filter(Boolean);
		return uniq(names).join(", ");
	}

	// the whole English entry from the page wikitext
	function parseWikitext(wt) {
		var en = englishSection(wt), out = { etys: [], pos: [], syn: [], ant: [], der: [], rel: [], see: [], alt: [], hyph: [], rhymes: [], ipa: [], audio: [], trans: [] };
		if (!en) return out;
		var lines = en.split("\n"), sec = "", secLevel = 0, curPos = null, curEty = -1, buf = [], inTrans = null, listBuf = [], listPos = null;
		function headOf(line) { var m = /^(={2,6})\s*([^=]+?)\s*\1\s*$/.exec(line); return m ? { level: m[1].length, name: m[2].trim() } : null; }
		function flushList() {
			var kind = LIST_SECS[sec], text = listBuf.join("\n"), lp = listPos; listBuf = [];
			if (!kind || !out[kind] || !text) return;
			expand(text, function (p) {
				var n = p.name.toLowerCase();
				if (p.pos[0] === "en" && /^(col|der|rel|syn|ant|hyp|desc|coord)[1-5]?(-u)?$|^(l|l-self|ll)$/.test(n)) {
					var items = (/^(l|l-self|ll)$/.test(n) ? [cleanItem(p.pos[2] || p.pos[1])] : listItems(p)).filter(Boolean);
					out[kind] = out[kind].concat(items);
					if (lp && (kind === "syn" || kind === "ant")) lp[kind] = lp[kind].concat(items);
				}
				return "";
			}).split("\n").forEach(function (l) {
				var links = /^\*/.test(l) && l.match(/\[\[[^\]]+\]\]/g);
				if (links) out[kind] = out[kind].concat(links.map(cleanItem).filter(Boolean));
			});
		}
		function flushEty() { if (sec.indexOf("Etymology") === 0 && buf.length) { var segs = renderEty(buf.join("\n")); if (segs.length) out.etys.push(segs); } buf = []; }
		for (var li = 0; li < lines.length; li++) {
			var line = lines[li], h = headOf(line);
			if (h) {
				flushEty(); flushList();
				sec = h.name; secLevel = h.level; listPos = curPos;
				if (/^Etymology/.test(h.name)) { curEty++; curPos = null; }
				if (POS_NAMES.indexOf(h.name) >= 0) { curPos = { pos: h.name, senses: [], head: null, ety: Math.max(0, curEty), syn: [], ant: [] }; out.pos.push(curPos); }
				continue;
			}
			if (sec.indexOf("Etymology") === 0) { buf.push(line); continue; }
			// templates that can sit anywhere
			if (/\{\{(IPA|audio|hyphenation|hyph|rhymes|rhyme)\|en\|/i.test(line)) {
				expand(line, function (p) {
					var n = p.name.toLowerCase();
					if (n === "ipa" && p.pos[0] === "en") p.pos.slice(1).forEach(function (x) { if (/^[\/\[]/.test(x)) out.ipa.push({ ipa: x, acc: accentOf(p.named.a) }); });
					if (n === "audio" && p.pos[0] === "en" && p.pos[1]) { var fm = /^En-(us|uk|au|ca|nz|ie)-/i.exec(p.pos[1].trim()); out.audio.push({ file: p.pos[1].trim(), acc: accentOf(p.named.a) || (fm ? accentOf(fm[1].toUpperCase()) : "") }); }
					if ((n === "hyphenation" || n === "hyph") && p.pos[0] === "en") {
						var alts = [], cur = [];
						p.pos.slice(1).forEach(function (x) { if (x === "") { if (cur.length) alts.push(cur); cur = []; } else cur.push(x); });
						if (cur.length) alts.push(cur);
						alts.forEach(function (a) { if (a.length > 1) out.hyph.push(a.join("‧")); });
					}
					if ((n === "rhymes" || n === "rhyme") && p.pos[0] === "en") p.pos.slice(1).forEach(function (x) { if (x) out.rhymes.push("-" + stripMods(x)); });
					return "";
				});
				continue;
			}
			if (curPos && /^\{\{en-[a-z ]+[|}]/.test(line) && !curPos.head) { expand(line, function (p) { if (/^en-/.test(p.name)) curPos.head = p; return ""; }); continue; }
			if (POS_NAMES.indexOf(sec) >= 0 && curPos) {
				var dm = /^(#+)\s*([^:*#][\s\S]*)$/.exec(line);
				if (dm) {
					var labels = [];
					expand(dm[2], function (p) { if (/^(lb|lbl|label|term-label|tlb)$/i.test(p.name) && p.pos[0] === "en") labels = labels.concat(labelsOf(p)); return ""; });
					curPos.senses.push({ depth: dm[1].length, plain: plainDef(dm[2]).trim(), labels: labels, syn: [], ant: [] });
					continue;
				}
				var nm = /^#+:\s*(\{\{[\s\S]*)$/.exec(line), last = curPos.senses[curPos.senses.length - 1];
				if (nm && last) {
					expand(nm[1], function (p) {
						var n = p.name.toLowerCase();
						if ((n === "syn" || n === "synonyms" || n === "synonym of") && p.pos[0] === "en") last.syn = last.syn.concat(listItems(p));
						if ((n === "ant" || n === "antonyms") && p.pos[0] === "en") last.ant = last.ant.concat(listItems(p));
						return "";
					});
				}
				continue;
			}
			if (sec === "Translations") {
				var tt = /\{\{(trans-top-see|trans-top-also|checktrans-top|trans-top)(\|[^}]*)?\}\}/.exec(line);
				if (tt) { inTrans = { gloss: cleanItem(tplParts("x" + (tt[2] || "")).pos[0] || ""), items: [], pos: curPos ? curPos.pos : "" }; if (tt[1] === "trans-top" || tt[1] === "trans-top-also") out.trans.push(inTrans); continue; }
				if (/\{\{trans-bottom/.test(line)) { inTrans = null; continue; }
				var tl = /^\*(:?)\s*([^:{}]+?):\s*(.*)$/.exec(line);
				if (inTrans && tl) {
					var words = [], code = "";
					expand(tl[3], function (p) {
						if (/^(t|t\+|tt|tt\+|t-|t\+check|t-check|t-simple)$/.test(p.name) && p.pos[1]) { code = code || p.pos[0]; words.push(cleanItem(p.pos[1]) + (p.named.tr ? " (" + p.named.tr + ")" : "")); }
						return "";
					});
					var lname = tl[2].trim();
					if (tl[1]) lname = (inTrans.lastTop || "") + " (" + lname + ")"; else inTrans.lastTop = lname;
					words = uniq(words.filter(function (x) { return x && x.length < 50; }));
					if (words.length) inTrans.items.push({ lang: lname, code: code, words: words });
				}
				continue;
			}
			if (LIST_SECS[sec]) listBuf.push(line);
		}
		flushList();
		flushEty();
		["syn", "ant", "der", "rel", "see", "alt", "hyph", "rhymes"].forEach(function (k) { out[k] = uniq(out[k]); });
		out.pos.forEach(function (p) { p.syn = uniq(p.syn); p.ant = uniq(p.ant); p.senses.forEach(function (s) { s.syn = uniq(s.syn); s.ant = uniq(s.ant); }); });
		out.trans = out.trans.filter(function (t) { return t.items.length; });
		return out;
	}

	// add the wikitext's labels / synonyms / antonyms / depth to the REST senses (matched by text, in order) and its forms to each part of speech
	function merge(rest, wiki, word) {
		var used = {};
		if ((wiki.pos || []).length && !wiki.pos.some(function (p) { return p.pos === "Symbol"; })) rest.pos = rest.pos.filter(function (p) { return p.pos !== "Symbol"; });
		rest.pos.forEach(function (rp) {
			var cands = (wiki.pos || []).filter(function (wp, i) { return wp.pos.toLowerCase() === rp.pos.toLowerCase() && !used[i]; });
			var wp = null, best = -1;
			cands.forEach(function (c) {
				var sc = 0;
				rp.senses.slice(0, 4).forEach(function (s) { c.senses.forEach(function (cs) { sc = Math.max(sc, similarity(s.text, cs.plain)); }); });
				if (sc > best) { best = sc; wp = c; }
			});
			if (!wp || best < 0.4) { wp = null; }
			if (wp) used[wiki.pos.indexOf(wp)] = 1;
			var j = 0;
			rp.senses.forEach(function (s) {
				s.labels = s.labels || []; s.syn = s.syn || []; s.ant = s.ant || []; s.depth = 1;
				if (!wp) return;
				var bi = -1, bs = 0;
				for (var k = j; k < wp.senses.length && k < j + 8; k++) { var sc = similarity(s.text, wp.senses[k].plain); if (sc > bs) { bs = sc; bi = k; } }
				if (bi >= 0 && bs >= 0.5) {
					var ws = wp.senses[bi];
					s.labels = ws.labels; s.syn = ws.syn; s.ant = ws.ant; s.depth = ws.depth;
					// a label that the REST text already starts with ("(mathematics) ...") is not repeated
					j = bi + 1;
				}
			});
			rp.ety = wp ? wp.ety : 0;
			rp.forms = wp && wp.head ? inflect(wp.head, word) : null;
			rp.syn = wp ? wp.syn : []; rp.ant = wp ? wp.ant : [];
		});
		return rest;
	}

	/* ---------- forms (from the headword template) ---------- */
	var SIB = /(s|x|z|ch|sh)$/;
	function cons(c) { return /[bcdfghjklmnpqrstvwxz]/.test(c); }
	function plural(w) { return SIB.test(w) ? w + "es" : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : w + "s"; }
	function third(w) { return plural(w); }
	function ing(w, dbl) { if (dbl) return w + w.slice(-1) + "ing"; if (/ie$/.test(w)) return w.slice(0, -2) + "ying"; if (/[^aeiouy]e$/.test(w) && !/(ee|ye|oe)$/.test(w)) return w.slice(0, -1) + "ing"; return w + "ing"; }
	function past(w, dbl) { if (dbl) return w + w.slice(-1) + "ed"; if (/e$/.test(w)) return w + "d"; if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ied"; return w + "ed"; }
	function compar(w, sup) {
		var suf = sup ? "est" : "er";
		if (/e$/.test(w)) return w + suf.slice(1);
		if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "i" + suf;
		if (w.length <= 4 && /[^aeiou][aeiou][bdgmnpt]$/.test(w) && cons(w.slice(-1))) return w + w.slice(-1) + suf;
		return w + suf;
	}
	function inflect(head, word) {
		var n = head.name, a = head.pos.filter(function (x) { return x !== ""; }), w = normWord(head.named.head || word || "").replace(/\[\[|\]\]/g, "");
		if (!w || / /.test(w) && n !== "en-noun") return null;
		if (n === "en-noun") {
			if (!a.length || a[0] === "+") return { rows: [["plural", plural(w)]] };
			if (a[0] === "-" && a.length === 1) return { rows: [], note: "usually uncountable" };
			if (a[0] === "!" || a[0] === "?") return null;
			var pls = [], note = "";
			a.forEach(function (x) {
				x = stripMods(x);
				if (x === "~") { note = "countable and uncountable"; if (a.length === 1) pls.push(plural(w)); }
				else if (x === "-") note = "usually uncountable";
				else if (x === "s") pls.push(w + "s"); else if (x === "es") pls.push(w + "es"); else if (x === "+") pls.push(plural(w));
				else if (/^[A-Za-z' -]+$/.test(x)) pls.push(x);
			});
			if (!pls.length && note === "countable and uncountable") pls.push(plural(w));
			return { rows: pls.length ? [["plural", uniq(pls).join(", ")]] : [], note: note };
		}
		if (n === "en-verb") {
			var spec = a[0] || "", base = w, slots = ["", "", "", ""], dbl = false;
			var m = /^([^<]*)<([^>]*)>$/.exec(spec);
			if (m) { if (m[1]) base = m[1]; spec = m[2]; }
			if (spec === "++") { dbl = true; spec = ""; }
			else if (/^[^aeiou]*[aeiou][bdgklmnprtv]$/.test(base)) dbl = true;   // one syllable, single vowel + consonant: run -> running, stop -> stopped
			if (spec && (m || a.length === 1)) spec.split(",").forEach(function (x, i) { if (i < 4) slots[i] = x.replace(/\[[^\]]*\]/g, "").split(":")[0].trim(); });
			else if (a.length > 1) a.slice(0, 4).forEach(function (x, i) { slots[i] = x; });
			function fill(x, def) { if (!x || x === "+") return def; if (x === "++") return null; return /^[A-Za-z' -]+$/.test(x) ? x : def; }
			var t3 = fill(slots[0], third(base)), pp = fill(slots[1], ing(base, dbl)), ps = fill(slots[2], past(base, dbl)), pa = fill(slots[3], ps);
			if (slots[1] === "++") pp = ing(base, true);
			if (slots[2] === "++") { ps = past(base, true); pa = fill(slots[3], ps); }
			return { rows: [["third-person singular", t3], ["present participle", pp], ["simple past", ps], ["past participle", pa]] };
		}
		if (n === "en-adj" || n === "en-adv") {
			if (!a.length || a[0] === "more") return { rows: [["comparative", "more " + w], ["superlative", "most " + w]] };
			if (a[0] === "-") return { rows: [], note: "not comparable" };
			var cs = [], ss = [];
			a.forEach(function (x) {
				x = stripMods(x);
				x.split(",").forEach(function (y) {
					y = y.trim();
					if (y === "er") { cs.push(compar(w)); ss.push(compar(w, true)); }
					else if (y === "more") { cs.push("more " + w); ss.push("most " + w); }
					else if (/^[A-Za-z]+er$/.test(y)) { cs.push(y); ss.push(y.replace(/er$/, "est")); }
				});
			});
			if (!cs.length) return null;
			return { rows: [["comparative", uniq(cs).join(", ")], ["superlative", uniq(ss).join(", ")]] };
		}
		return null;
	}

	/* ---------- Wikimedia Commons recordings ---------- */
	// MD5 (RFC 1321) of a UTF-8 string: Commons stores "File:X" at /x/xy/X where xy = the first two hex digits of md5("X" with _ for spaces)
	function md5(str) {
		function add(x, y) { var l = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff); }
		function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
		function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
		function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
		function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
		function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
		function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
		var bytes = unescape(encodeURIComponent(str)), n = bytes.length, words = [], i;
		for (i = 0; i < n; i++) words[i >> 2] |= bytes.charCodeAt(i) << ((i % 4) * 8);
		words[n >> 2] |= 0x80 << ((n % 4) * 8);
		var len = (((n + 8) >> 6) + 1) * 16;
		for (i = 0; i < len; i++) words[i] = words[i] | 0;
		words[len - 2] = n * 8;
		var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
		for (i = 0; i < len; i += 16) {
			var oa = a, ob = b, oc = c, od = d, x = words.slice(i, i + 16);
			a = ff(a, b, c, d, x[0], 7, -680876936); d = ff(d, a, b, c, x[1], 12, -389564586); c = ff(c, d, a, b, x[2], 17, 606105819); b = ff(b, c, d, a, x[3], 22, -1044525330);
			a = ff(a, b, c, d, x[4], 7, -176418897); d = ff(d, a, b, c, x[5], 12, 1200080426); c = ff(c, d, a, b, x[6], 17, -1473231341); b = ff(b, c, d, a, x[7], 22, -45705983);
			a = ff(a, b, c, d, x[8], 7, 1770035416); d = ff(d, a, b, c, x[9], 12, -1958414417); c = ff(c, d, a, b, x[10], 17, -42063); b = ff(b, c, d, a, x[11], 22, -1990404162);
			a = ff(a, b, c, d, x[12], 7, 1804603682); d = ff(d, a, b, c, x[13], 12, -40341101); c = ff(c, d, a, b, x[14], 17, -1502002290); b = ff(b, c, d, a, x[15], 22, 1236535329);
			a = gg(a, b, c, d, x[1], 5, -165796510); d = gg(d, a, b, c, x[6], 9, -1069501632); c = gg(c, d, a, b, x[11], 14, 643717713); b = gg(b, c, d, a, x[0], 20, -373897302);
			a = gg(a, b, c, d, x[5], 5, -701558691); d = gg(d, a, b, c, x[10], 9, 38016083); c = gg(c, d, a, b, x[15], 14, -660478335); b = gg(b, c, d, a, x[4], 20, -405537848);
			a = gg(a, b, c, d, x[9], 5, 568446438); d = gg(d, a, b, c, x[14], 9, -1019803690); c = gg(c, d, a, b, x[3], 14, -187363961); b = gg(b, c, d, a, x[8], 20, 1163531501);
			a = gg(a, b, c, d, x[13], 5, -1444681467); d = gg(d, a, b, c, x[2], 9, -51403784); c = gg(c, d, a, b, x[7], 14, 1735328473); b = gg(b, c, d, a, x[12], 20, -1926607734);
			a = hh(a, b, c, d, x[5], 4, -378558); d = hh(d, a, b, c, x[8], 11, -2022574463); c = hh(c, d, a, b, x[11], 16, 1839030562); b = hh(b, c, d, a, x[14], 23, -35309556);
			a = hh(a, b, c, d, x[1], 4, -1530992060); d = hh(d, a, b, c, x[4], 11, 1272893353); c = hh(c, d, a, b, x[7], 16, -155497632); b = hh(b, c, d, a, x[10], 23, -1094730640);
			a = hh(a, b, c, d, x[13], 4, 681279174); d = hh(d, a, b, c, x[0], 11, -358537222); c = hh(c, d, a, b, x[3], 16, -722521979); b = hh(b, c, d, a, x[6], 23, 76029189);
			a = hh(a, b, c, d, x[9], 4, -640364487); d = hh(d, a, b, c, x[12], 11, -421815835); c = hh(c, d, a, b, x[15], 16, 530742520); b = hh(b, c, d, a, x[2], 23, -995338651);
			a = ii(a, b, c, d, x[0], 6, -198630844); d = ii(d, a, b, c, x[7], 10, 1126891415); c = ii(c, d, a, b, x[14], 15, -1416354905); b = ii(b, c, d, a, x[5], 21, -57434055);
			a = ii(a, b, c, d, x[12], 6, 1700485571); d = ii(d, a, b, c, x[3], 10, -1894986606); c = ii(c, d, a, b, x[10], 15, -1051523); b = ii(b, c, d, a, x[1], 21, -2054922799);
			a = ii(a, b, c, d, x[8], 6, 1873313359); d = ii(d, a, b, c, x[15], 10, -30611744); c = ii(c, d, a, b, x[6], 15, -1560198380); b = ii(b, c, d, a, x[13], 21, 1309151649);
			a = ii(a, b, c, d, x[4], 6, -145523070); d = ii(d, a, b, c, x[11], 10, -1120210379); c = ii(c, d, a, b, x[2], 15, 718787259); b = ii(b, c, d, a, x[9], 21, -343485551);
			a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
		}
		var hex = "";
		[a, b, c, d].forEach(function (v) { for (var k = 0; k < 4; k++) hex += ((v >> (k * 8)) & 255).toString(16).padStart(2, "0"); });
		return hex;
	}
	// "En-uk-happy.ogg" -> {mp3 (Commons' own MP3 transcode: plays in every browser), page}
	function commonsAudio(file) {
		var f = String(file || "").trim().replace(/^(File|Image):/i, "").replace(/ /g, "_");
		if (!f || /[\/#?<>]/.test(f)) return null;
		f = f.charAt(0).toUpperCase() + f.slice(1);
		var h = md5(f), enc = encodeURIComponent(f).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")");
		var base = "https://upload.wikimedia.org/wikipedia/commons/";
		return {
			mp3: /\.mp3$/i.test(f) ? base + h[0] + "/" + h.slice(0, 2) + "/" + enc : base + "transcoded/" + h[0] + "/" + h.slice(0, 2) + "/" + enc + "/" + enc + ".mp3",
			page: "https://commons.wikimedia.org/wiki/File:" + enc
		};
	}

	/* ---------- the whole entry ---------- */
	function build(word, restJson, wikitextJson) {
		var rest = parseRest(restJson), wt = wikitextJson && wikitextJson.parse ? wikitextJson.parse.wikitext : typeof wikitextJson === "string" ? wikitextJson : "";
		var wiki = parseWikitext(wt);
		merge(rest, wiki, word);
		var entry = { word: word, pos: rest.pos, other: rest.other, wiki: wiki };
		entry.short = shortDef(entry);
		return entry;
	}
	function shortDef(entry) {
		for (var i = 0; i < entry.pos.length; i++) for (var j = 0; j < entry.pos[i].senses.length; j++) {
			var s = entry.pos[i].senses[j];
			if (!s.formOf || j === entry.pos[i].senses.length - 1) return { pos: entry.pos[i].pos, text: s.text.length > 220 ? s.text.slice(0, 217).replace(/\s+\S*$/, "") + "…" : s.text };
		}
		return { pos: "", text: "" };
	}
	// the text Read aloud speaks: one item per sense, so the page can follow along
	function speechParts(entry, max) {
		var out = [{ text: entry.word + ".", id: "w" }];
		entry.pos.forEach(function (p, i) {
			out.push({ text: p.pos + ".", id: "p" + i });
			p.senses.slice(0, max || 6).forEach(function (s, j) { out.push({ text: (j + 1) + ". " + s.text.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim(), id: "s" + i + "-" + j }); });
		});
		return out;
	}
	function plainText(entry) {
		var lines = [entry.word];
		entry.pos.forEach(function (p) {
			lines.push("", p.pos);
			p.senses.forEach(function (s, j) { lines.push((j + 1) + ". " + (s.labels && s.labels.length ? "(" + s.labels.join(", ") + ") " : "") + s.text); });
		});
		lines.push("", "Source: Wiktionary (CC BY-SA 4.0), via mes.fm/define");
		return lines.join("\n");
	}

	/* ---------- suggestions ---------- */
	function parseSuggest(json, q) {
		if (!Array.isArray(json) || !Array.isArray(json[1])) return [];
		var lq = normWord(q).toLowerCase();
		return uniq(json[1].filter(function (x) { return typeof x === "string" && x.length < 60; }))
			.sort(function (a, b) { return (a.toLowerCase() === lq ? -1 : 0) - (b.toLowerCase() === lq ? -1 : 0); }).slice(0, 8);
	}
	// spelling suggestions when a word is not found: closest words of a list (edit distance)
	function edits(a, b) {
		a = a.toLowerCase(); b = b.toLowerCase();
		var m = a.length, n = b.length, prev = [], cur, i, j;
		for (j = 0; j <= n; j++) prev[j] = j;
		for (i = 1; i <= m; i++) { cur = [i]; for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
		return prev[n];
	}

	/* ---------- "On MES": site pages that match a word ---------- */
	// results = MESSearch.search(word).items; keep pages whose title / description really contains the word (or its stem) as a word
	function stems(w) {
		w = normWord(w).toLowerCase();
		var out = [w];
		if (/ies$/.test(w)) out.push(w.slice(0, -3) + "y");
		else if (/(ses|xes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
		else if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
		if (/age$/.test(w) && w.length > 6) out.push(w.slice(0, -3));        // percentage -> percent
		if (/(ing|ed)$/.test(w) && w.length > 5) out.push(w.replace(/(ing|ed)$/, ""));
		if (/al$/.test(w) && w.length > 6) out.push(w.slice(0, -2));          // torsional -> torsion
		return uniq(out).filter(function (x) { return x.length >= 3; });
	}
	var CAT_RANK = { calculators: 0, tools: 1, math: 2, articles: 3, more: 4, livestreams: 5, hutchison: 5, "911": 5, fun: 6, puzzles: 6 };
	function mesPick(items, word, max) {
		var ss = stems(word);
		if (!ss.length) return [];
		var res = ss.map(function (s) { return new RegExp("(^|[^a-z])" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|s\\b|es\\b|$)", "i"); });
		var out = [];
		(items || []).forEach(function (it) {
			if (out.length >= (max || 6) * 3) return;
			if (it.path === "/define" || /^\/define\//.test(it.path)) return;
			var inTitle = res.some(function (r) { return r.test(it.title || ""); }), inDesc = res.some(function (r) { return r.test(it.desc || ""); });
			if (inTitle || inDesc) out.push({ path: it.path, title: it.title, desc: it.desc, thumb: it.thumb, cat: it.catLabel || it.cat || "", rank: CAT_RANK[it.cat] != null ? CAT_RANK[it.cat] : 4, strong: inTitle });
		});
		// calculators and tools first, then tutorials, articles ..., memes and puzzles last; a word in the title before one only in the description
		out.sort(function (a, b) { return a.rank - b.rank || (b.strong ? 1 : 0) - (a.strong ? 1 : 0); });
		var fun = 0;
		var strong = out.filter(function (x) { return x.strong; }).length, weak = 0;
		// pages named after the word are the real matches; then at most two that only mention it
		return out.filter(function (x) { return (x.rank < 6 || fun++ < 1) && (x.strong || !strong || weak++ < 2); }).slice(0, max || 6);
	}

	/* ---------- saved words, recent, flashcards, quiz ---------- */
	function addSaved(list, item, now) {
		list = Array.isArray(list) ? list.slice() : [];
		var w = normWord(item && item.w);
		if (!w) return list;
		var i = indexOfWord(list, w), old = i >= 0 ? list[i] : null;
		if (i >= 0) list.splice(i, 1);
		list.unshift({ w: w, d: String(item.d || (old && old.d) || "").slice(0, 240), p: String(item.p || (old && old.p) || "").slice(0, 30), t: old ? old.t : now || Date.now(), b: old ? old.b || 0 : 0, n: old ? old.n || 0 : 0 });
		return list.slice(0, 2000);
	}
	function indexOfWord(list, w) { w = normWord(w).toLowerCase(); for (var i = 0; i < (list || []).length; i++) if (String(list[i].w).toLowerCase() === w) return i; return -1; }
	function removeSaved(list, w) { var i = indexOfWord(list, w); if (i < 0) return list; list = list.slice(); list.splice(i, 1); return list; }
	function addRecent(list, w, max) {
		w = normWord(w);
		var out = (Array.isArray(list) ? list : []).filter(function (x) { return typeof x === "string" && x.toLowerCase() !== w.toLowerCase(); });
		if (w) out.unshift(w);
		return out.slice(0, max || 30);
	}
	function exportJson(list) { return JSON.stringify({ app: "mes-define", v: 1, saved: list || [] }, null, 1); }
	// a backup file or a plain list (one word per line, or "word - definition") -> merged list + count added
	function importText(list, text, now) {
		var items = [], added = 0;
		try {
			var j = JSON.parse(text);
			items = Array.isArray(j) ? j : j && Array.isArray(j.saved) ? j.saved : [];
			items = items.map(function (x) { return typeof x === "string" ? { w: x } : x; });
		} catch (e) {
			items = String(text || "").split(/\r?\n/).map(function (l) { var m = /^\s*([^\t—–:-]+?)\s*(?:\t|\s[—–-]\s|:\s)\s*(.*)$/.exec(l); return m ? { w: m[1], d: m[2] } : { w: l }; });
		}
		var out = Array.isArray(list) ? list.slice() : [];
		items.reverse().forEach(function (x) {
			if (!x || !normWord(x.w)) return;
			if (indexOfWord(out, x.w) < 0) added++;
			out = addSaved(out, { w: x.w, d: x.d, p: x.p }, x.t || now);
			if (x.b) out[0].b = Math.max(0, Math.min(5, x.b | 0));
		});
		return { list: out, added: added };
	}
	var BOX_DAYS = [0, 1, 2, 4, 8, 16];
	function grade(item, ok, now) {
		var b = ok ? Math.min(5, (item.b || 0) + 1) : 0;
		return Object.assign({}, item, { b: b, n: (now == null ? Date.now() : now) + BOX_DAYS[b] * 864e5 });
	}
	// next flashcard: due cards first (lowest box, oldest due), then the lowest box
	function nextCard(list, now, skip) {
		now = now || Date.now();
		var c = (list || []).filter(function (x) { return x.d && x.w !== skip; });
		if (!c.length) c = (list || []).filter(function (x) { return x.d; });
		if (!c.length) return null;
		c.sort(function (a, b) { var da = (a.n || 0) <= now ? 0 : 1, db = (b.n || 0) <= now ? 0 : 1; return da - db || (a.b || 0) - (b.b || 0) || (a.n || 0) - (b.n || 0); });
		return c[0];
	}
	function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
	// one multiple-choice question: a definition and 4 words (the answer + 3 others from the list, else from the word-of-the-day list)
	function quiz(list, seed) {
		var r = rng(seed || 1), pool = (list || []).filter(function (x) { return x.d; });
		if (!pool.length) return null;
		var ans = pool[Math.floor(r() * pool.length)], others = pool.filter(function (x) { return x.w !== ans.w; }).map(function (x) { return x.w; });
		WOTD.forEach(function (x) { if (others.length < 30 && x[0] !== ans.w && others.indexOf(x[0]) < 0) others.push(x[0]); });
		var opts = [ans.w];
		while (opts.length < 4 && others.length) { var k = Math.floor(r() * others.length); opts.push(others.splice(k, 1)[0]); }
		for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
		var d = ans.d.replace(new RegExp("\\b" + ans.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*", "gi"), "____");
		return { word: ans.w, def: d, pos: ans.p || "", options: opts, answer: opts.indexOf(ans.w) };
	}

	/* ---------- word of the day (our own list and short definitions) ---------- */
	var WOTD = [
		["serendipity", "noun", "Finding something good or useful by chance, while not looking for it."],
		["torsion", "noun", "Twisting: the turning of one end of a bar or shaft while the other end is held or turned the other way."],
		["percentage", "noun", "A part of a whole written as a number out of 100."],
		["ephemeral", "adjective", "Lasting only a very short time."],
		["vector", "noun", "A quantity with both a size and a direction, such as a velocity or a force."],
		["ubiquitous", "adjective", "Found everywhere, or seeming to be."],
		["derivative", "noun", "In calculus, the rate at which a quantity changes as another one changes; the slope of a curve at a point."],
		["eloquent", "adjective", "Speaking or writing clearly, fluently and persuasively."],
		["orbit", "noun", "The curved path of a planet, moon or spacecraft around another body."],
		["meticulous", "adjective", "Very careful about small details."],
		["refraction", "noun", "The bending of light or another wave as it passes from one material into another."],
		["resilient", "adjective", "Able to recover quickly after something difficult, or to spring back into shape."],
		["inflation", "noun", "A general rise in prices over time, so the same money buys less."],
		["candid", "adjective", "Honest and direct, even when the truth is uncomfortable."],
		["integral", "noun", "In calculus, the total built up from many tiny pieces, such as the area under a curve."],
		["gregarious", "adjective", "Enjoying the company of other people; sociable."],
		["momentum", "noun", "The quantity of motion of a moving object: its mass times its velocity; also, the force gained by moving ahead."],
		["pragmatic", "adjective", "Dealing with things in a practical way rather than by theory."],
		["entropy", "noun", "A measure of disorder in a system; in thermodynamics, how much energy is unavailable to do work."],
		["benevolent", "adjective", "Kind and wanting to do good for others."],
		["equinox", "noun", "One of the two days of the year when day and night are about equally long."],
		["tenacious", "adjective", "Holding on firmly; not giving up easily."],
		["matrix", "noun", "A rectangular table of numbers arranged in rows and columns, used in algebra and computing."],
		["quintessential", "adjective", "Being the most typical example of something."],
		["fractal", "noun", "A shape whose parts look like smaller copies of the whole, at every scale."],
		["candor", "noun", "The quality of being open and honest."],
		["algorithm", "noun", "A step-by-step set of rules for solving a problem or doing a task."],
		["lucid", "adjective", "Clear and easy to understand; also, thinking clearly."],
		["redshift", "noun", "The stretching of light from an object moving away, which moves its colours toward red."],
		["frugal", "adjective", "Careful not to spend more money or use more than needed."],
		["hypotenuse", "noun", "The longest side of a right triangle, opposite the right angle."],
		["empathy", "noun", "The ability to understand and share the feelings of another person."],
		["mortgage", "noun", "A loan used to buy a home or land, paid back over many years, with the property as security."],
		["juxtapose", "verb", "To place two things side by side, especially to compare or contrast them."],
		["velocity", "noun", "Speed in a given direction."],
		["nostalgia", "noun", "A fond, slightly sad longing for the past."],
		["calculus", "noun", "The branch of mathematics that studies change (derivatives) and accumulation (integrals)."],
		["diligent", "adjective", "Working hard and carefully."],
		["parabola", "noun", "The U-shaped curve of a quadratic function, also the path of a thrown ball (without air)."],
		["altruism", "noun", "Caring about the welfare of others and acting for it without expecting a reward."],
		["magnetism", "noun", "The force by which magnets and electric currents attract or repel; also, a strong personal attraction."],
		["ambiguous", "adjective", "Able to be understood in more than one way."],
		["pendulum", "noun", "A weight hung from a fixed point so that it swings back and forth."],
		["cogent", "adjective", "Clear, logical and convincing."],
		["eclipse", "noun", "The hiding of the Sun by the Moon, or of the Moon by Earth's shadow."],
		["voracious", "adjective", "Very eager; wanting a great amount, as in a voracious reader."],
		["probability", "noun", "How likely something is to happen, as a number from 0 (never) to 1 (certain)."],
		["laconic", "adjective", "Using very few words."],
		["equation", "noun", "A mathematical statement that two expressions are equal."],
		["sanguine", "adjective", "Cheerfully optimistic, especially in a hard situation."],
		["photon", "noun", "A single particle (quantum) of light or other electromagnetic radiation."],
		["obfuscate", "verb", "To make something unclear or hard to understand, often on purpose."],
		["logarithm", "noun", "The power to which a base must be raised to give a number: log base 10 of 1000 is 3."],
		["zealous", "adjective", "Full of eager enthusiasm for a cause or goal."],
		["viscosity", "noun", "How thick a fluid is: how strongly it resists flowing."],
		["epiphany", "noun", "A sudden moment of understanding."],
		["interest", "noun", "Money paid for the use of borrowed money; also, the feeling of wanting to know more."],
		["mellifluous", "adjective", "Sweet and smooth to hear."],
		["gravity", "noun", "The force that pulls masses toward each other, such as objects toward Earth."],
		["paradigm", "noun", "A typical example or model; a whole way of thinking about something."],
		["statistics", "noun", "The science of collecting, summarizing and drawing conclusions from data."],
		["ineffable", "adjective", "Too great or too strange to be put into words."],
		["frequency", "noun", "How often something happens; for a wave, how many cycles pass each second."],
		["procrastinate", "verb", "To put off doing something that should be done."],
		["symmetry", "noun", "The quality of being the same on both sides of a line or around a point."],
		["verbose", "adjective", "Using more words than needed."],
		["calendar", "noun", "A system for organizing days into weeks, months and years; also, a chart of them."],
		["perseverance", "noun", "Keeping on with something in spite of difficulty or delay."],
		["exponent", "noun", "The small raised number that shows how many times to multiply a number by itself: 2 to the exponent 3 is 8."],
		["benign", "adjective", "Gentle and kind; in medicine, not harmful (not cancerous)."],
		["hologram", "noun", "A three-dimensional image made with laser light."],
		["catalyst", "noun", "A substance that speeds up a chemical reaction without being used up; anything that causes a change."],
		["anomaly", "noun", "Something that differs from what is usual or expected."],
		["quorum", "noun", "The smallest number of members who must be present for a meeting to make decisions."],
		["oscillate", "verb", "To swing or move back and forth regularly."],
		["fortitude", "noun", "Courage in facing pain or trouble."],
		["average", "noun", "A single number that represents a set: the sum divided by how many there are (the mean)."],
		["whimsical", "adjective", "Playful and fanciful, in an unusual or amusing way."],
		["axiom", "noun", "A statement accepted as true without proof, used as a starting point for reasoning."],
		["candescent", "adjective", "Glowing with heat."],
		["ratio", "noun", "A comparison of two quantities by division, such as 3 to 1."],
		["sagacious", "adjective", "Wise, with good judgment."],
		["spectrum", "noun", "A range of colours (or other values) spread out in order, as in a rainbow."],
		["innate", "adjective", "Present from birth; natural rather than learned."],
		["budget", "noun", "A plan for how much money will be earned and spent over a period."],
		["luminous", "adjective", "Giving off light; bright or shining."],
		["prime", "adjective", "Of a whole number greater than 1: divisible only by 1 and itself, like 2, 3, 5 and 7."],
		["ebullient", "adjective", "Cheerful and full of energy."],
		["friction", "noun", "The force that resists one surface sliding over another; also, disagreement between people."],
		["impeccable", "adjective", "Without any fault or mistake."],
		["dividend", "noun", "A share of a company's profits paid to its owners; in division, the number being divided."],
		["serene", "adjective", "Calm and peaceful."],
		["thermodynamics", "noun", "The science of heat, work and energy and how they change from one form to another."],
		["wanderlust", "noun", "A strong wish to travel."],
		["pronunciation", "noun", "The way a word is said aloud."],
		["kinetic", "adjective", "Having to do with motion, as in kinetic energy, the energy of a moving object."],
		["rhetoric", "noun", "The art of using language to persuade; also, speech that sounds good but may be empty."],
		["translate", "verb", "To put words from one language into another."],
		["quixotic", "adjective", "Hopeful and idealistic to an impractical degree."]
	];
	function dayIndex(date) { var d = date instanceof Date ? date : new Date(date || Date.now()); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
	// the same word for everyone on a calendar day (local date), visiting the list in a fixed shuffled order
	function wordOfDay(date) {
		var i = dayIndex(date), n = WOTD.length, k = ((i % n) + n) % n, step = 37;      // 37 and the list length share no factor, so every word comes up once per cycle
		while (gcd(step, n) !== 1) step++;
		var x = WOTD[(k * step) % n];
		return { w: x[0], p: x[1], d: x[2] };
	}
	function gcd(a, b) { return b ? gcd(b, a % b) : a; }

	/* ---------- languages for "Translate" ---------- */
	var TR_LANGS = [["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["it", "Italian"], ["vi", "Vietnamese"], ["zh", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"], ["ar", "Arabic"], ["hi", "Hindi"], ["ru", "Russian"], ["tr", "Turkish"], ["pl", "Polish"], ["nl", "Dutch"], ["id", "Indonesian"], ["fil", "Filipino"], ["uk", "Ukrainian"], ["he", "Hebrew"], ["fa", "Persian"], ["sv", "Swedish"], ["el", "Greek"], ["th", "Thai"], ["sw", "Swahili"]];
	function trDefault(navLang) {
		var c = String(navLang || "").toLowerCase().split("-")[0];
		for (var i = 0; i < TR_LANGS.length; i++) if (TR_LANGS[i][0] === c) return c;
		return "es";
	}

	return {
		normWord: normWord, variants: variants, title: title, restUrl: restUrl, wikitextUrl: wikitextUrl, suggestUrl: suggestUrl, dictApiUrl: dictApiUrl,
		wiktionaryPage: wiktionaryPage, shareLink: shareLink, listLink: listLink, translateLink: translateLink, pronounceLink: pronounceLink, parseQuery: parseQuery,
		decode: decode, htmlToSegs: htmlToSegs, segsText: segsText, parseRest: parseRest, parseDictApi: parseDictApi,
		splitArgs: splitArgs, tplParts: tplParts, expand: expand, renderEty: renderEty, wikiToSegs: wikiToSegs, plainDef: plainDef, similarity: similarity,
		englishSection: englishSection, parseWikitext: parseWikitext, merge: merge, inflect: inflect, langName: langName, accentOf: accentOf,
		md5: md5, commonsAudio: commonsAudio, build: build, shortDef: shortDef, speechParts: speechParts, plainText: plainText,
		parseSuggest: parseSuggest, edits: edits, stems: stems, mesPick: mesPick,
		addSaved: addSaved, removeSaved: removeSaved, indexOfWord: indexOfWord, addRecent: addRecent, exportJson: exportJson, importText: importText,
		grade: grade, nextCard: nextCard, quiz: quiz, WOTD: WOTD, wordOfDay: wordOfDay, dayIndex: dayIndex, TR_LANGS: TR_LANGS, trDefault: trDefault
	};
})();
if (typeof module !== "undefined" && module.exports) module.exports = MESDef;
