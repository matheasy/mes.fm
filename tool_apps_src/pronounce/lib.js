/* MES Pronounce: pure helpers (no DOM), node-testable: node tool_apps_src/pronounce-tests.js
   ARPAbet (CMU Pronouncing Dictionary) -> syllables (maximal onset), stress, IPA (US, or UK for the hand-written UK forms), a plain-English
   respelling (pruh-nuhn-see-AY-shuhn), spelling breaks (an estimate), a rule-based syllable count for words the dictionary does not have,
   the dictionaryapi.dev answer (IPA variants + Wikimedia Commons recordings), accents of speech voices and the share-link query. */
var MESPron = (function () {
	"use strict";
	var DATA_V = "1";   // bump after build_pronounce_data.py --apply so browsers fetch the new shards

	/* ---------- dictionary shards ---------- */
	function normWord(w) {
		return String(w || "").toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
	}
	function shardOf(w) { w = normWord(w); return /^[a-z][a-z]/.test(w) ? w.slice(0, 2) : "_"; }
	function shardUrl(w, base) { return (base || "/pronounce/data/") + shardOf(w) + ".json?v=" + DATA_V; }
	function parseEntry(s) { return s ? String(s).split("|").map(function (p) { return p.split(" "); }) : []; }

	/* ---------- phones ---------- */
	// OH, EA, IA, UA are our own additions for British forms (LOT, SQUARE, NEAR, CURE vowels) that ARPAbet does not have
	var VOWELS = { AA: 1, AE: 1, AH: 1, AO: 1, AW: 1, AY: 1, EH: 1, ER: 1, EY: 1, IH: 1, IY: 1, OW: 1, OY: 1, UH: 1, UW: 1, OH: 1, EA: 1, IA: 1, UA: 1 };
	var CONS_IPA = { B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "ɡ", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p", R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ" };
	var V_US = { AA: "ɑ", AE: "æ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u", OH: "ɒ", EA: "ɛə", IA: "ɪə", UA: "ʊə" };
	var V_UK = { AA: "ɑː", AE: "æ", AO: "ɔː", AW: "aʊ", AY: "aɪ", EH: "ɛ", EY: "eɪ", IH: "ɪ", IY: "iː", OW: "əʊ", OY: "ɔɪ", UH: "ʊ", UW: "uː", OH: "ɒ", EA: "ɛə", IA: "ɪə", UA: "ʊə" };
	function split(ph) { var m = /^([A-Z]+)([012])?$/.exec(ph) || [0, ph, ""]; return { p: m[1], s: m[2] === undefined || m[2] === "" ? -1 : +m[2] }; }
	function isVowel(ph) { return !!VOWELS[split(ph).p]; }
	function phoneIpa(ph, uk) {
		var x = split(ph);
		if (x.p === "AH") return x.s === 0 ? "ə" : "ʌ";
		if (x.p === "ER") return uk ? (x.s === 0 ? "ə" : "ɜː") : (x.s === 0 ? "ɚ" : "ɝ");
		if (VOWELS[x.p]) {
			if (x.p === "IY" && x.s === 0 && !uk) return "i";
			if (x.p === "IY" && x.s === 0 && uk) return "i";
			return (uk ? V_UK : V_US)[x.p];
		}
		return CONS_IPA[x.p] || x.p.toLowerCase();
	}

	/* ---------- syllables (maximal onset) ---------- */
	var ONSETS = {};
	("P B T D K G F V TH DH S Z SH ZH CH JH M N L R W Y HH " +
	 "P_R P_L B_R B_L T_R D_R K_R K_L G_R G_L F_R F_L TH_R SH_R S_P S_T S_K S_M S_N S_L S_W S_F T_W D_W K_W G_W TH_W " +
	 "P_Y B_Y F_Y V_Y K_Y G_Y M_Y HH_Y " +
	 "S_P_R S_P_L S_T_R S_K_R S_K_W S_K_Y S_P_Y S_K_L").split(" ").forEach(function (o) { ONSETS[o] = 1; });
	var LAX = { AE: 1, EH: 1, IH: 1, UH: 1, AH: 1, OH: 1 }, GLIDE = { HH: 1, W: 1, Y: 1 };
	function legalOnset(c) { return !c.length || !!ONSETS[c.map(function (p) { return split(p).p; }).join("_")]; }
	// phones (array) -> [{ph: [...], stress: 0|1|2, v: index of the vowel inside ph}]
	function syllabify(phones) {
		var nuc = [];
		for (var i = 0; i < phones.length; i++) if (isVowel(phones[i])) nuc.push(i);
		if (!nuc.length) return phones.length ? [{ ph: phones.slice(), stress: 0, v: -1 }] : [];
		var starts = [0];
		for (var k = 1; k < nuc.length; k++) {
			var a = nuc[k - 1] + 1, b = nuc[k];          // consonants phones[a..b-1] between two vowels
			var cut = b;
			for (var c = a; c <= b; c++) { if (legalOnset(phones.slice(c, b))) { cut = c; break; } }
			starts.push(cut);
		}
		// a stressed short vowel keeps the next consonant when the next syllable is unstressed (ba-NAN-uh, SKEJ-ool, CIT-ee), like dictionary respellings
		for (var q = 1; q < starts.length; q++) {
			var pv = split(phones[nuc[q - 1]]), nv = split(phones[nuc[q]]);
			var on = phones.slice(starts[q], nuc[q]), open = starts[q] === nuc[q - 1] + 1;
			if (pv.s > 0 && nv.s === 0 && LAX[pv.p] && open && (on.length === 1 && !GLIDE[split(on[0]).p] || on.length > 1 && split(on[0]).p === "S")) starts[q]++;   // also yes-ter, sis-ter
		}
		var out = [];
		for (var j = 0; j < starts.length; j++) {
			var ph = phones.slice(starts[j], j + 1 < starts.length ? starts[j + 1] : phones.length);
			var vi = nuc[j] - starts[j];
			var st = split(phones[nuc[j]]).s;
			out.push({ ph: ph, stress: st < 0 ? 0 : st, v: vi });
		}
		return out;
	}
	function stressPattern(syls) { return syls.map(function (s) { return s.stress; }); }
	function syllableIpa(s, uk) { return s.ph.map(function (p) { return phoneIpa(p, uk); }).join(""); }
	// "/təˈmeɪˌtoʊ/" style: a stress mark before each stressed syllable; one-syllable words get no mark
	function toIpa(phones, uk) {
		var syls = syllabify(phones);
		return syls.map(function (s) { return (syls.length > 1 && s.stress === 1 ? "ˈ" : syls.length > 1 && s.stress === 2 ? "ˌ" : "") + syllableIpa(s, uk); }).join("");
	}

	/* ---------- respelling ---------- */
	var CONS_R = { B: "b", CH: "ch", D: "d", DH: "th", F: "f", G: "g", HH: "h", JH: "j", K: "k", L: "l", M: "m", N: "n", NG: "ng", P: "p", R: "r", S: "s", SH: "sh", T: "t", TH: "th", V: "v", W: "w", Y: "y", Z: "z", ZH: "zh" };
	function vowelR(p, st, hasOnset, hasCoda, uk) {
		switch (p) {
			case "AA": return "ah";
			case "AE": return "a";
			case "AH": return "uh";
			case "AO": return "aw";
			case "AW": return "ow";
			case "AY": return hasOnset ? "y" : "eye";
			case "EH": return hasCoda ? "e" : "eh";
			case "ER": return st === 0 ? "er" : "ur";
			case "EY": return "ay";
			case "IH": return hasCoda ? "i" : "ih";
			case "IY": return "ee";
			case "OW": return "oh";
			case "OY": return "oy";
			case "UH": return "uu";
			case "UW": return "oo";
			case "OH": return "o";
			case "EA": return "air";
			case "IA": return "eer";
			case "UA": return "oor";
		}
		return p.toLowerCase();
	}
	// syllables -> ["pruh", "nuhn", "see", "AY", "shuhn"] (primary stress in capitals)
	function respellSyllables(syls, uk) {
		return syls.map(function (s) {
			var out = "", onset = s.v > 0, coda = s.v >= 0 && s.v < s.ph.length - 1;
			for (var i = 0; i < s.ph.length; i++) {
				var x = split(s.ph[i]);
				if (VOWELS[x.p]) {
					var vr = vowelR(x.p, x.s, onset, coda, uk);
					if (x.p === "AY" && onset && i > 0 && split(s.ph[i - 1]).p === "Y") vr = "eye";
					out += vr;
				} else {
					var c = CONS_R[x.p] || x.p.toLowerCase();
					// "s" + "h" would read as "sh": keep them apart; a final "y" after a vowel (EY Y) is fine
					if (c === "h" && /s$|c$|t$/.test(out)) out += "-";
					out += c;
				}
			}
			if (s.v < 0) return out;
			return syls.length > 1 && s.stress === 1 ? out.toUpperCase() : out;
		});
	}
	function respell(phones, uk) { return respellSyllables(syllabify(phones), uk).join("-"); }

	/* ---------- the written word: syllable breaks (an estimate) + a syllable count for unknown words ---------- */
	var DIGRAPH = /^(ch|sh|th|ph|wh|ck|gh|qu|gn|kn|wr)$/;
	var LIQ = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr|thr|chr|phr|shr)$/;
	var ONSET2 = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|sc|sk|sl|sm|sn|sp|st|sw|tr|tw|thr|str|spr|spl|scr|squ|shr|chr|ph|th|sh|ch|wh|qu)$/;
	function vowelGroups(w) {
		// [start, end) of each vowel group; y counts as a vowel unless it starts the word or is followed by a vowel
		var g = [], i = 0;
		function isV(k) {
			var ch = w.charAt(k);
			if ("aeiou".indexOf(ch) >= 0) return !(ch === "u" && k > 0 && w.charAt(k - 1) === "q");
			if (ch === "y") return k > 0 && !/[aeiou]/.test(w.charAt(k + 1) || "");
			return false;
		}
		while (i < w.length) {
			if (isV(i)) { var s = i; while (i < w.length && isV(i)) i++; g.push([s, i]); } else i++;
		}
		return g;
	}
	function silentE(w, g) {
		// a final e that is not its own syllable (make, cake) -- but "the", "be", "-le" after a consonant (table) and words like "recipe" are kept
		if (g.length < 2) return false;
		var last = g[g.length - 1];
		if (last[0] !== w.length - 1 || w.charAt(w.length - 1) !== "e" || last[1] - last[0] !== 1) return false;
		if (/[^aeiouy]le$/.test(w) && w.length > 3) return false;
		return true;
	}
	function estimateSyllables(word) {
		var w = normWord(word).replace(/'/g, "");
		if (!w) return 0;
		if (!/[a-z]/.test(w)) return 0;
		var g = vowelGroups(w), n = g.length;
		if (silentE(w, g)) n--;
		if (n > 1 && /[^aeiouy](es|ed)$/.test(w) && !/(ted|ded|ses|xes|zes|ches|shes|ges|ces)$/.test(w) && !/[^aeiouy][lr]es$/.test(w)) n--;
		// two vowels that are two syllables: -ia-, -io- (not -tion/-sion/-cio-/-gio-), -eo-, -ua- (not qua), -uo-, -ya
		var hiatus = w.match(/(?:[^tcsgx]i[ao])|eo|ua|uo|ii|iu|ea(?=t?ed$)/g);
		if (hiatus) n += hiatus.filter(function (h) { return h !== "ua" || !/qua/.test(w); }).length;
		if (/[^aeiouy]ism$/.test(w)) n++;
		return Math.max(1, n);
	}
	// "tomato" (3) -> ["to", "ma", "to"]; n = the number of syllables to aim for (from the dictionary when known)
	function spellingBreaks(word, n) {
		var w = String(word || "").toLowerCase();
		var core = w.replace(/[^a-z']/g, "");
		if (!core) return [String(word || "")];
		var g = vowelGroups(core);
		if (silentE(core, g)) g = g.slice(0, -1);
		// split hiatus groups ("ia" in "pronunciation" is two syllables) when we still need more
		var target = n || g.length;
		for (var k = 0; k < g.length && g.length < target; k++) {
			var seg = core.slice(g[k][0], g[k][1]);
			if (seg.length >= 2 && /^(ia|io|eo|ua|uo|ie|ea|iu|ya|ue)$/.test(seg.slice(0, 2)) && !(seg.slice(0, 2) === "ie" && g[k][1] === core.length)) {
				g.splice(k, 1, [g[k][0], g[k][0] + 1], [g[k][0] + 1, g[k][1]]);
			}
		}
		while (g.length > Math.max(1, target)) {   // too many groups: merge the closest pair
			var best = 1, gap = 1e9;
			for (var j = 1; j < g.length; j++) { var d = g[j][0] - g[j - 1][1]; if (d < gap) { gap = d; best = j; } }
			g.splice(best - 1, 2, [g[best - 1][0], g[best][1]]);
		}
		if (g.length < 2) return [core];
		var cuts = [];
		for (var i = 1; i < g.length; i++) {
			var a = g[i - 1][1], b = g[i][0], cl = core.slice(a, b);
			var cut;
			if (cl.length === 0) cut = a;
			else if (cl.length === 1) cut = a;              // V-CV: ro-bot, to-ma-to
			else if (cl === "ck") cut = b;                  // rock-et, pick-le
			else if (cl.length === 2 && DIGRAPH.test(cl)) cut = a;   // keep "ch", "sh", "th" together
			else {
				// consonant units (digraphs count as one); split after the first unit, except before a liquid onset (a-pron, se-cret, ta-ble)
				var units = [], u = 0;
				while (u < cl.length) { var two = cl.slice(u, u + 2); if (two.length === 2 && DIGRAPH.test(two)) { units.push(two); u += 2; } else { units.push(cl.charAt(u)); u++; } }
				var lastTwo = units.length >= 2 ? units[units.length - 2] + units[units.length - 1] : "";
				if (units.length === 1) cut = units[0] === "ck" ? b : a;
				else if (LIQ.test(lastTwo) && units.length === 2) cut = a;
				else {
					// the shortest split whose right part can start a syllable (blorp-tas-tic, in-stru-ment)
					var acc = 0; cut = a + units[0].length;
					for (var ui = 1; ui < units.length; ui++) {
						acc += units[ui - 1].length;
						var rest = cl.slice(acc);
						if (units.length - ui === 1 || ONSET2.test(rest) || LIQ.test(rest)) { cut = a + acc; break; }
					}
				}
				if (/^[^aeiouy]le[sd]?$/.test(core.slice(b - 2)) && b - 2 > a) cut = b - 2;   // con-sonant + le: han-dle, lit-tle
			}
			cuts.push(cut);
		}
		var parts = [], last = 0;
		cuts.forEach(function (c) { if (c > last) { parts.push(core.slice(last, c)); last = c; } });
		parts.push(core.slice(last));
		return parts.filter(Boolean);
	}

	/* ---------- hand-written forms: British pronunciations (US is the CMU dictionary), usual forms, heteronyms ---------- */
	// word -> [[label, ARPAbet, note?]]; "UK" forms are shown with UK IPA (non-rhotic, ɒ, əʊ ...); "Usual" goes first, ahead of the dictionary
	var EXTRA = {
		tomato: [["UK", "T AH0 M AA1 T OW0"]], potato: [["UK", "P AH0 T EY1 T OW0"]],
		schedule: [["UK", "SH EH1 D Y UW0 L"], ["UK", "SH EH1 JH UW0 L"]],
		aluminum: [["UK (aluminium)", "AE2 L Y UH0 M IH1 N IY0 AH0 M"]], aluminium: [["UK", "AE2 L Y UH0 M IH1 N IY0 AH0 M"]],
		garage: [["UK", "G AE1 R IH0 JH"], ["UK", "G AE1 R AA0 ZH"]], vitamin: [["UK", "V IH1 T AH0 M IH0 N"]], privacy: [["UK", "P R IH1 V AH0 S IY0"]],
		leisure: [["UK", "L EH1 ZH ER0"]], either: [["UK", "AY1 DH ER0"]], neither: [["UK", "N AY1 DH ER0"]], route: [["UK", "R UW1 T"]],
		herb: [["UK", "HH ER1 B"]], advertisement: [["UK", "AH0 D V ER1 T IH0 S M AH0 N T"]], laboratory: [["UK", "L AH0 B OH1 R AH0 T R IY0"]],
		controversy: [["UK", "K AH0 N T R OH1 V ER0 S IY0"], ["UK", "K OH1 N T R AH0 V ER2 S IY0"]], oregano: [["UK", "OH2 R IH0 G AA1 N OW0"]],
		basil: [["UK", "B AE1 Z AH0 L"]], pasta: [["UK", "P AE1 S T AH0"]], water: [["UK", "W AO1 T ER0"]], dance: [["UK", "D AA1 N S"]],
		"can't": [["UK", "K AA1 N T"]], bath: [["UK", "B AA1 TH"]], path: [["UK", "P AA1 TH"]], ask: [["UK", "AA1 S K"]], half: [["UK", "HH AA1 F"]],
		zebra: [["UK", "Z EH1 B R AH0"]], mobile: [["UK", "M OW1 B AY0 L"]], missile: [["UK", "M IH1 S AY0 L"]], fragile: [["UK", "F R AE1 JH AY0 L"]],
		hostile: [["UK", "HH OH1 S T AY0 L"]], process: [["UK", "P R OW1 S EH0 S"]], progress: [["UK (noun)", "P R OW1 G R EH0 S"]],
		yogurt: [["UK", "Y OH1 G ER0 T"]], lieutenant: [["UK", "L EH0 F T EH1 N AH0 N T"]], clerk: [["UK", "K L AA1 K"]],
		data: [["UK", "D EY1 T AH0"]], dynasty: [["UK", "D IH1 N AH0 S T IY0"]], patriot: [["UK", "P AE1 T R IY0 AH0 T"]],
		adult: [["UK", "AE1 D AH0 L T"]], ballet: [["UK", "B AE1 L EY0"]], buoy: [["UK", "B OY1"]], address: [["UK", "AH0 D R EH1 S"]],
		been: [["UK", "B IY1 N"]], again: [["UK", "AH0 G EH1 N"], ["UK", "AH0 G EY1 N"]], tune: [["UK", "T Y UW1 N"]], new: [["UK", "N Y UW1"]],
		duty: [["UK", "D Y UW1 T IY0"]], tuesday: [["UK", "T Y UW1 Z D EY0"]], student: [["UK", "S T Y UW1 D AH0 N T"]],
		car: [["UK", "K AA1"]], hard: [["UK", "HH AA1 D"]], bird: [["UK", "B ER1 D"]], better: [["UK", "B EH1 T AH0"]], hot: [["UK", "HH OH1 T"]],
		lot: [["UK", "L OH1 T"]], coffee: [["UK", "K OH1 F IY0"]], dog: [["UK", "D OH1 G"]], hair: [["UK", "HH EA1"]], here: [["UK", "HH IA1"]],
		tour: [["UK", "T UA1"]], sure: [["UK", "SH AO1"]], world: [["UK", "W ER1 L D"]], hello: [["UK", "HH AH0 L OW1"]], tomorrow: [["UK", "T AH0 M OH1 R OW0"]],
		quinoa: [["Usual", "K IY1 N W AA0"]], acai: [["Usual", "AA2 S AA0 IY1"]], chipotle: [["Usual", "CH IH0 P OW1 T L EY0"]],
		espresso: [["Usual", "EH0 S P R EH1 S OW0"]], mischievous: [["Usual", "M IH1 S CH AH0 V AH0 S"]], nuclear: [["Usual", "N UW1 K L IY0 ER0"]],
		niche: [["UK", "N IY1 SH"]], segue: [["Usual", "S EH1 G W EY0"]], genre: [["Usual", "ZH AA1 N R AH0"]], cache: [["Usual", "K AE1 SH"]],
		debris: [["Usual", "D AH0 B R IY1"]], gnocchi: [["Usual", "N Y OW1 K IY0"]], bruschetta: [["Italian", "B R UW0 S K EH1 T AH0"]]
	};
	// one spelling, two words: label each of the dictionary's forms (tested against the ARPAbet string)
	var HETERO = {
		read: [[/IY1/, "present tense: I read every day"], [/EH1/, "past tense: I read it yesterday"]],
		lead: [[/IY1/, "to guide, to go first"], [/EH1/, "the metal"]],
		live: [[/IH1/, "to be alive, to live somewhere"], [/AY1/, "alive; happening now (a live show)"]],
		tear: [[/IH1/, "a drop from the eye"], [/EH1/, "to rip"]],
		wind: [[/IH1/, "moving air"], [/AY1/, "to turn or twist"]],
		bow: [[/OW1/, "a knot; for arrows; a violin bow"], [/AW1/, "to bend forward; the front of a ship"]],
		close: [[/Z$/, "to shut"], [/S$/, "near"]],
		wound: [[/UW1/, "an injury"], [/AW1/, "past of wind (wound the clock)"]],
		use: [[/Z$/, "the verb: to use"], [/S$/, "the noun: a use"]],
		minute: [[/^M IH1/, "60 seconds"], [/Y UW1/, "very small"]],
		desert: [[/^D EH1/, "dry land"], [/Z ER1/, "to leave; what you deserve"]],
		dove: [[/AH1/, "the bird"], [/OW1/, "past of dive"]],
		bass: [[/EY1/, "low sound; the guitar"], [/AE1/, "the fish"]],
		polish: [[/^P AA1/, "to shine"], [/^P OW1/, "from Poland"]],
		does: [[/AH1/, "he does"], [/OW1/, "female deer"]],
		sow: [[/OW1/, "to plant seeds"], [/AW1/, "a female pig"]],
		row: [[/OW1/, "a line; to row a boat"], [/AW1/, "a quarrel"]]
	};
	// two-syllable noun / verb pairs: stress on the first = noun, on the second = verb
	var NOUN_VERB = "record present object project produce conduct contract content convict permit refuse subject rebel conflict contest desert extract increase decrease insult perfect progress protest suspect transport torment export import address combat compound digest escort survey upset".split(" ");
	function labelFor(word, arpa) {
		var w = normWord(word), h = HETERO[w];
		if (h) for (var i = 0; i < h.length; i++) if (h[i][0].test(arpa)) return h[i][1];
		if (NOUN_VERB.indexOf(w) >= 0) {
			var syl = syllabify(arpa.split(" "));
			if (syl.length >= 2) {
				if (syl[0].stress === 1) return "noun: stress on the first syllable";
				if (syl[1].stress === 1) return "verb: stress on the second syllable";
			}
		}
		return "";
	}
	// everything we can show for a word: dictionary (US) forms + our hand-written ones, "Usual" first
	function forms(word, entry) {
		var w = normWord(word), out = [], seen = {};
		var ex = EXTRA[w] || [];
		ex.forEach(function (e) { if (e[0] === "Usual" || e[0] === "Italian") add(e[1], e[0], false, e[0] === "Usual" ? "Most common way to say it" : ""); });
		parseEntry(entry).forEach(function (ph, i) { add(ph.join(" "), i === 0 ? "US" : "US " + (i + 1), false, ""); });
		ex.forEach(function (e) { if (/^UK/.test(e[0])) add(e[1], e[0], true, ""); });
		function add(arpa, label, uk, note) {
			var key = (uk ? "uk:" : "us:") + arpa;
			if (seen[key]) return; seen[key] = 1;
			var phones = arpa.split(" "), syls = syllabify(phones);
			out.push({ label: label, uk: uk, arpa: arpa, phones: phones, syls: syls, ipa: "/" + toIpa(phones, uk) + "/",
				respell: respellSyllables(syls, uk), stress: stressPattern(syls), note: note || labelFor(w, arpa) });
		}
		return out;
	}

	/* ---------- the sound guide (what each symbol sounds like) ---------- */
	var GUIDE = {
		AA: ["ɑ", "father", "ah"], AE: ["æ", "cat", "a"], AH: ["ʌ / ə", "cup, about", "uh"], AO: ["ɔ", "law", "aw"], AW: ["aʊ", "now", "ow"], AY: ["aɪ", "my", "eye"],
		EH: ["ɛ", "bed", "e"], ER: ["ɝ / ɚ", "bird, butter", "ur"], EY: ["eɪ", "say", "ay"], IH: ["ɪ", "sit", "i"], IY: ["i", "see", "ee"], OW: ["oʊ", "go", "oh"],
		OY: ["ɔɪ", "boy", "oy"], UH: ["ʊ", "book", "uu"], UW: ["u", "food", "oo"], OH: ["ɒ", "hot (British)", "o"], EA: ["ɛə", "hair (British)", "air"],
		IA: ["ɪə", "near (British)", "eer"], UA: ["ʊə", "tour (British)", "oor"],
		B: ["b", "bed", "b"], CH: ["tʃ", "chair", "ch"], D: ["d", "dog", "d"], DH: ["ð", "this", "th"], F: ["f", "fish", "f"], G: ["ɡ", "go", "g"], HH: ["h", "hat", "h"],
		JH: ["dʒ", "jump", "j"], K: ["k", "cat", "k"], L: ["l", "leg", "l"], M: ["m", "man", "m"], N: ["n", "no", "n"], NG: ["ŋ", "sing", "ng"], P: ["p", "pen", "p"],
		R: ["r", "red", "r"], S: ["s", "sun", "s"], SH: ["ʃ", "she", "sh"], T: ["t", "top", "t"], TH: ["θ", "think", "th"], V: ["v", "van", "v"], W: ["w", "we", "w"],
		Y: ["j", "yes", "y"], Z: ["z", "zoo", "z"], ZH: ["ʒ", "vision", "zh"]
	};
	function soundsOf(phones, uk) {
		var out = [], seen = {};
		phones.forEach(function (ph) {
			var p = split(ph).p, g = GUIDE[p];
			if (!g) return;
			var ipa = phoneIpa(ph, uk), key = p + ipa;
			if (seen[key]) return; seen[key] = 1;
			out.push({ p: p, ipa: ipa, ex: g[1].split(",")[0].trim(), exAll: g[1], say: g[2], vowel: !!VOWELS[p] });
		});
		return out;
	}

	/* ---------- dictionaryapi.dev ---------- */
	function accentOfAudio(url) {
		var m = /-(us|uk|au|ca|nz|ie|in|za|sco)\.mp3$/i.exec(String(url || ""));
		return m ? m[1].toLowerCase() : "";
	}
	var AUDIO_LABEL = { us: "US", uk: "UK", au: "Australia", ca: "Canada", nz: "New Zealand", ie: "Ireland", "in": "India", za: "South Africa", sco: "Scotland" };
	// -> { ipas: [{ipa, accent}], audio: [{url, accent, label, source, license, licenseUrl, curid}], meanings: [{pos, defs:[...]}] }
	function parseDictApi(json) {
		var out = { ipas: [], audio: [], meanings: [] }, seenI = {}, seenA = {};
		if (!Array.isArray(json)) return out;
		json.forEach(function (e) {
			(e.phonetics || []).forEach(function (p) {
				var acc = accentOfAudio(p.audio);
				if (p.text && !seenI[p.text]) { seenI[p.text] = 1; out.ipas.push({ ipa: p.text, accent: acc }); }
				if (p.audio && /^https:\/\//.test(p.audio) && !seenA[p.audio]) {
					seenA[p.audio] = 1;
					var cm = /curid=(\d+)/.exec(p.sourceUrl || "");
					out.audio.push({ url: p.audio, accent: acc, label: AUDIO_LABEL[acc] || "Recording", ipa: p.text || "", source: /^https:\/\//.test(p.sourceUrl || "") ? p.sourceUrl : "",
						license: p.license && p.license.name || "", licenseUrl: p.license && /^https:\/\//.test(p.license.url || "") ? p.license.url : "", curid: cm ? cm[1] : "" });
				}
			});
			if (e.phonetic && !seenI[e.phonetic]) { seenI[e.phonetic] = 1; out.ipas.push({ ipa: e.phonetic, accent: "" }); }
			(e.meanings || []).forEach(function (m) {
				var defs = (m.definitions || []).slice(0, 2).map(function (d) { return String(d.definition || ""); }).filter(Boolean);
				if (defs.length && out.meanings.length < 4) out.meanings.push({ pos: m.partOfSpeech || "", defs: defs });
			});
		});
		var order = { us: 0, uk: 1, au: 2, ca: 3 };
		out.audio.sort(function (a, b) { return (a.accent in order ? order[a.accent] : 9) - (b.accent in order ? order[b.accent] : 9); });
		return out;
	}
	// Wikimedia Commons original file URL (".../commons/4/48/En-uk-hello.ogg?utm...") -> the MP3 Commons transcodes (plays in every browser)
	function commonsMp3(url) {
		var m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^?#\/]+)/.exec(String(url || ""));
		if (!m) return "";
		if (/\.mp3$/i.test(m[3])) return "https://upload.wikimedia.org/wikipedia/commons/" + m[1] + "/" + m[2] + "/" + m[3];
		return "https://upload.wikimedia.org/wikipedia/commons/transcoded/" + m[1] + "/" + m[2] + "/" + m[3] + "/" + m[3] + ".mp3";
	}

	/* ---------- voices and accents ---------- */
	var ACCENTS = [
		["us", "US", "en-US"], ["uk", "UK", "en-GB"], ["scot", "Scotland", ""], ["ie", "Ireland", "en-IE"], ["au", "Australia", "en-AU"], ["nz", "New Zealand", "en-NZ"],
		["ca", "Canada", "en-CA"], ["in", "India", "en-IN"], ["za", "South Africa", "en-ZA"], ["sg", "Singapore", "en-SG"], ["ph", "Philippines", "en-PH"],
		["ng", "Nigeria", "en-NG"], ["ke", "Kenya", "en-KE"], ["hk", "Hong Kong", "en-HK"], ["tz", "Tanzania", "en-TZ"]
	];
	// which accent chip a voice belongs to: "us", "uk", "scot" ..., "en" (English, other), or "" (not English)
	function accentOf(lang, name) {
		var l = String(lang || "").replace("_", "-").toLowerCase(), n = String(name || "");
		if (l.split("-")[0] !== "en") return "";
		if (/scot|fiona|\bgb-sct\b/i.test(n) || /-sct|gb-scotland/.test(l)) return "scot";
		var reg = (l.split("-")[1] || "").toLowerCase();
		for (var i = 0; i < ACCENTS.length; i++) if (ACCENTS[i][2] && ACCENTS[i][2].toLowerCase() === "en-" + reg) return ACCENTS[i][0];
		if (reg === "gb" || reg === "uk") return "uk";
		return "en";
	}
	// macOS / iOS novelty voices (sing, bubble, whisper): fine to pick by hand, never chosen automatically or counted as an accent
	var NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy)\b/i;
	function isNovelty(name) { return NOVELTY.test(String(name || "").replace(/^(com\.apple\.\S+\.)/, "")); }
	function accentLabel(id) {
		for (var i = 0; i < ACCENTS.length; i++) if (ACCENTS[i][0] === id) return ACCENTS[i][1];
		return id === "en" ? "Other English" : id;
	}
	// does the accent of a voice go with the UK (non-rhotic) forms?
	function accentIsUk(id) { return /^(uk|scot|ie|au|nz|za|in|sg|hk|ng|ke|tz|ph)$/.test(id); }

	/* ---------- text ---------- */
	// a sentence -> [{w (as typed), key (dictionary form), s, e (offsets), word: true|false}]
	function tokens(text) {
		var out = [], re = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-]*|[^\s\p{L}\p{N}]+/gu, m;
		var s = String(text || "");
		while ((m = re.exec(s))) {
			var w = m[0].replace(/[-']+$/, "");
			var isW = /[\p{L}\p{N}]/u.test(w);
			out.push({ w: isW ? w : m[0], key: isW ? normWord(w) : "", s: m.index, e: m.index + (isW ? w.length : m[0].length), word: isW });
		}
		return out;
	}
	function isSentence(text) { return tokens(text).filter(function (t) { return t.word; }).length > 1; }
	// a word the dictionary does not have exactly: forms to try ("dog's" -> "dog" + Z, "cats" -> "cat" + S ...)
	function fallbacks(w) {
		w = normWord(w);
		var out = [];
		if (/'s$/.test(w)) out.push([w.slice(0, -2), "Z"]);
		if (/s'$/.test(w)) out.push([w.slice(0, -1), ""]);
		if (/[^s]s$/.test(w)) out.push([w.slice(0, -1), /[ptkf]s$/.test(w) ? "S" : "Z"]);
		if (/-/.test(w)) out.push([w.split("-"), ""]);
		return out;
	}
	// match what speech recognition heard against the target (any of the alternatives, ignoring case and punctuation)
	function heardMatch(target, heard) {
		var t = tokens(target).filter(function (x) { return x.word; }).map(function (x) { return x.key; }).join(" ");
		var hs = (Array.isArray(heard) ? heard : [heard]).map(function (h) { return tokens(h).filter(function (x) { return x.word; }).map(function (x) { return x.key; }).join(" "); });
		for (var i = 0; i < hs.length; i++) if (hs[i] === t) return { ok: true, i: i, text: hs[i] };
		var tw = t.split(" "), best = { ok: false, i: 0, text: hs[0] || "", score: 0 };
		hs.forEach(function (h, i) {
			var hw = h.split(" "), hit = 0;
			tw.forEach(function (x) { if (hw.indexOf(x) >= 0) hit++; });
			var sc = tw.length ? hit / tw.length : 0;
			if (sc > best.score) best = { ok: false, i: i, text: h, score: sc };
		});
		return best;
	}

	/* ---------- the share link / saved state ---------- */
	function parseQuery(search) {
		var out = {}, p;
		try { p = new URLSearchParams(search || ""); } catch (e) { return out; }
		var q = p.get("q") || p.get("w") || p.get("word");
		if (q) out.q = String(q).slice(0, 400);
		var a = p.get("accent");
		if (a && /^[a-z]{2,4}$/.test(a)) out.accent = a;
		var r = parseFloat(p.get("rate"));
		if (isFinite(r) && r >= 0.3 && r <= 2) out.rate = r;
		var c = p.get("vs");
		if (c) out.vs = String(c).slice(0, 80);
		return out;
	}
	function buildQuery(o) {
		var p = new URLSearchParams();
		if (o.q) p.set("q", o.q);
		if (o.accent) p.set("accent", o.accent);
		if (o.rate && Math.abs(o.rate - 1) > 0.01) p.set("rate", String(Math.round(o.rate * 100) / 100));
		if (o.vs) p.set("vs", o.vs);
		return p.toString();
	}
	function addRecent(list, w, max) {
		w = String(w || "").trim();
		var out = (Array.isArray(list) ? list : []).filter(function (x) { return typeof x === "string" && x.toLowerCase() !== w.toLowerCase(); });
		if (w) out.unshift(w.slice(0, 120));
		return out.slice(0, max || 20);
	}

	/* ---------- commonly mispronounced (our own notes) ---------- */
	var COMMON = [
		["espresso", "There is no x: es-PRES-oh, not ex-PRES-oh."], ["nuclear", "NOO-klee-er, not NOO-kyuh-ler."],
		["february", "FEB-roo-er-ee; FEB-yoo-er-ee is common and accepted too."], ["library", "Say both r's: LY-brer-ee."],
		["mischievous", "Three syllables: MIS-chuh-vus, not mis-CHEE-vee-us."], ["often", "AW-fun or OFF-tun: both are fine."],
		["comfortable", "Usually three syllables: KUHMF-ter-buhl."], ["wednesday", "The first d is silent: WENZ-day."],
		["colonel", "Sounds like kernel: KUR-nul."], ["quinoa", "KEEN-wah."], ["epitome", "Four syllables: ih-PIT-uh-mee."],
		["hyperbole", "Four syllables: hy-PUR-buh-lee."], ["segue", "SEG-way."], ["niche", "NITCH or NEESH: both are heard."],
		["sherbet", "Only one r: SHUR-bit."], ["especially", "There is no x: ih-SPESH-uh-lee."], ["athlete", "Two syllables: ATH-leet."],
		["arctic", "Say the first c: ARK-tik."], ["salmon", "The l is silent: SAM-un."], ["almond", "AH-mund or AL-mund."],
		["debris", "duh-BREE: the s is silent."], ["chipotle", "chih-POHT-lay."], ["gnocchi", "NYOH-kee: the g is silent."],
		["worcestershire", "WUUS-ter-sher: three syllables."], ["arkansas", "AR-kun-saw."], ["illinois", "il-uh-NOY: the s is silent."],
		["jewelry", "JOO-ul-ree."], ["realtor", "REE-ul-ter: two syllables before the t."], ["prerogative", "pri-ROG-uh-tiv: the r comes first."],
		["pronunciation", "pruh-nuhn-see-AY-shun: no 'noun' in it."], ["supposedly", "suh-POH-zid-lee: no d in the middle."],
		["triathlon", "try-ATH-lon: no extra syllable."], ["cache", "KASH, like cash."], ["genre", "ZHAHN-ruh."], ["acai", "ah-sah-EE."],
		["data", "DAY-tuh or DAT-uh: both are fine."], ["caramel", "KAIR-uh-mel or KAR-mul."], ["ask", "ASK, not AKS."],
		["often", ""], ["tomato", "tuh-MAY-toh (US), tuh-MAH-toh (UK)."], ["schedule", "SKEJ-ool (US), SHED-yool (UK)."],
		["either", "EE-ther or EYE-ther: both are correct."], ["route", "ROOT or ROWT in the US; ROOT in the UK."],
		["lieutenant", "loo-TEN-unt (US), lef-TEN-unt (British army)."], ["aluminum", "uh-LOO-mih-num (US); aluminium al-yuh-MIN-ee-um (UK)."]
	].filter(function (x) { return x[1]; });

	return {
		DATA_V: DATA_V, normWord: normWord, shardOf: shardOf, shardUrl: shardUrl, parseEntry: parseEntry,
		isVowel: isVowel, phoneIpa: phoneIpa, syllabify: syllabify, legalOnset: legalOnset, stressPattern: stressPattern, syllableIpa: syllableIpa, toIpa: toIpa,
		respellSyllables: respellSyllables, respell: respell, estimateSyllables: estimateSyllables, spellingBreaks: spellingBreaks,
		EXTRA: EXTRA, HETERO: HETERO, labelFor: labelFor, forms: forms, GUIDE: GUIDE, soundsOf: soundsOf,
		parseDictApi: parseDictApi, commonsMp3: commonsMp3, accentOfAudio: accentOfAudio, AUDIO_LABEL: AUDIO_LABEL,
		ACCENTS: ACCENTS, accentOf: accentOf, isNovelty: isNovelty, accentLabel: accentLabel, accentIsUk: accentIsUk,
		tokens: tokens, isSentence: isSentence, fallbacks: fallbacks, heardMatch: heardMatch,
		parseQuery: parseQuery, buildQuery: buildQuery, addRecent: addRecent, COMMON: COMMON
	};
})();
if (typeof module !== "undefined" && module.exports) module.exports = MESPron;
