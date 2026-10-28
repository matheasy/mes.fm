/* MES Speed Reader -- pure logic (no DOM): tokenising, sentences, focus letter (ORP), chunking, pacing, timing / ETA,
 * speech chunking + word lookup by character offset, voice choice, language guess, HTML cleaning.
 * Prepended to app.js by build_tool_apps.py into one mes.fm/speedreader/js/speedreader.js; also runs in node
 * (require('./tool_apps_src/speedreader/lib.js')), see tool_apps_src/speedreader-tests.js.
 */
var SRLib = (function () {
	"use strict";

	var MIN_WPM = 60, MAX_WPM = 1500;
	var AVG_SILENT_WPM = 238, AVG_SPEECH_WPM = 150;   // Brysbaert 2019 meta-analysis (silent, English non-fiction); typical speaking pace

	function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
	function clampWpm(n) { n = Math.round(+n); return isFinite(n) ? clamp(n, MIN_WPM, MAX_WPM) : 300; }

	/* ---------- cleaning ---------- */
	// same length as the input for the characters we keep, so offsets into the cleaned text are stable after this one pass
	function cleanText(s) {
		return String(s == null ? "" : s)
			.replace(/\r\n?/g, "\n")
			.replace(/[​-‍⁠﻿­]/g, "")      // zero-width + soft hyphen
			.replace(/[     ]/g, " ")
			.replace(/[ \t\f\v]+/g, " ")
			.replace(/ *\n */g, "\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	var ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©" };
	function decodeEntities(s) {
		return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
			if (e.charAt(0) === "#") {
				var code = e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
				try { return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m; } catch (x) { return m; }
			}
			var v = ENT[e.toLowerCase()];
			return v == null ? m : v;
		});
	}
	// plain text out of an HTML document: drops script/style/head, turns block tags into line breaks
	function htmlToText(html) {
		var s = String(html || "");
		s = s.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, " ");
		s = s.replace(/<(br|hr)\b[^>]*>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article|header|footer|pre|table|ul|ol|dd|dt|figcaption)\s*>/gi, "\n\n");
		s = s.replace(/<[^>]*>/g, " ");
		return cleanText(decodeEntities(s));
	}
	// light Markdown clean-up for .md files: keep the words, lose the markup
	function markdownToText(md) {
		return String(md || "")
			.replace(/```[\s\S]*?```/g, function (m) { return m.replace(/```[^\n]*\n?/g, ""); })
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			.replace(/^\s{0,3}#{1,6}\s+/gm, "")
			.replace(/^\s{0,3}>\s?/gm, "")
			.replace(/^\s*[-*+]\s+/gm, "")
			.replace(/(\*\*|__)(.*?)\1/g, "$2")
			.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?=[^\w*]|$)/g, "$1$2")
			.replace(/`([^`]+)`/g, "$1");
	}

	/* ---------- tokenising ---------- */
	var ABBR = /^(mr|mrs|ms|dr|prof|sr|jr|st|mt|vs|inc|ltd|co|corp|no|fig|eq|vol|ch|pp|approx|dept|est|gen|gov|sen|rep|rev|hon|lt|col|capt|sgt|cf|al|i\.e|e\.g|a\.m|p\.m|u\.s|u\.k)$/i;

	function coreOf(w) { return w.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, ""); }

	// does this token end a sentence? (next = the following token or "")
	function endsSentence(w, next) {
		var m = /([.!?\u2026\u3002\uFF01\uFF1F]+)(["'\u201D\u2019)\]\u00BB]*)$/.exec(w);
		if (!m) return false;
		var n0 = next ? next.replace(/^[^\p{L}\p{N}]+/u, "") : "";
		var lowerNext = !!n0 && /^\p{Ll}/u.test(n0);
		if (/[!?\u2026\u3002\uFF01\uFF1F]/.test(m[1])) return !(lowerNext && m[2]);   // "Why?" she said -> same sentence
		var base = w.slice(0, m.index).replace(/^[^\p{L}\p{N}]+/u, "");
		if (ABBR.test(base)) return false;
		if (/^\p{Lu}$/u.test(base)) return false;                          // an initial: "J. Smith"
		if (!n0) return true;
		return !lowerNext;                                                 // a lower-case word follows: not a sentence end
	}

	// -> { words: [{w, s, e, para, sent}], sentStarts: [wordIdx...], text }
	// s/e are character offsets in `text` (the cleaned text); para = last word of a paragraph; sent = last word of a sentence
	function tokenize(raw) {
		var text = cleanText(raw);
		var words = [];
		var re = /\S+/g, m;
		while ((m = re.exec(text))) {
			var tok = m[0], start = m.index;
			// split "word—word" and long hyphen-less runs joined by dashes so each part gets its own turn
			var parts = [], last = 0, dre = /([\p{L}\p{N}][—–]+)(?=[\p{L}\p{N}"“‘(])/gu, dm;
			while ((dm = dre.exec(tok))) { parts.push(tok.slice(last, dm.index + dm[1].length)); last = dm.index + dm[1].length; }
			parts.push(tok.slice(last));
			var off = start;
			for (var p = 0; p < parts.length; p++) {
				if (parts[p]) { words.push({ w: parts[p], s: off, e: off + parts[p].length, para: false, sent: false }); }
				off += parts[p].length;
			}
		}
		for (var i = 0; i < words.length; i++) {
			var nxt = i + 1 < words.length ? words[i + 1].w : "";
			words[i].sent = endsSentence(words[i].w, nxt);
			if (i + 1 < words.length) {
				var gap = text.slice(words[i].e, words[i + 1].s);
				if (gap.indexOf("\n\n") >= 0) { words[i].para = true; words[i].sent = true; }
			} else { words[i].para = true; words[i].sent = true; }
		}
		var starts = [];
		for (var j = 0; j < words.length; j++) if (j === 0 || words[j - 1].sent) starts.push(j);
		return { words: words, sentStarts: starts, text: text };
	}

	function countWords(text) { var m = String(text || "").match(/\S+/g); return m ? m.length : 0; }

	// index of the sentence start at or before word i (binary search)
	function sentenceStartAt(starts, i) {
		var lo = 0, hi = starts.length - 1, ans = 0;
		while (lo <= hi) { var mid = (lo + hi) >> 1; if (starts[mid] <= i) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
		return ans;
	}
	function prevSentenceStart(starts, i) {
		var k = sentenceStartAt(starts, i);
		return starts.length ? (starts[k] < i ? starts[k] : starts[Math.max(0, k - 1)]) : 0;
	}
	function nextSentenceStart(starts, i, n) {
		var k = sentenceStartAt(starts, i);
		return k + 1 < starts.length ? starts[k + 1] : Math.max(0, n - 1);
	}

	/* ---------- focus letter (optimal recognition point) ---------- */
	// index into the display string of the letter to highlight and centre on the guide line
	function orpIndex(w) {
		var lead = 0;
		var m = /^[^\p{L}\p{N}]+/u.exec(w);
		if (m) lead = m[0].length;
		var core = coreOf(w);
		var len = Array.from(core).length;
		var k = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4;
		return Math.min(w.length - 1, lead + Math.min(k, Math.max(0, core.length - 1)));
	}

	/* ---------- chunking ---------- */
	// groups of up to n words that never run across a sentence end; -> [{a, b (exclusive), text}]
	function makeChunks(words, n) {
		n = clamp(Math.round(n) || 1, 1, 5);
		var out = [];
		for (var i = 0; i < words.length;) {
			var j = i + 1;
			while (j < words.length && j - i < n && !words[j - 1].sent) j++;
			var t = words[i].w;
			for (var k = i + 1; k < j; k++) t += " " + words[k].w;
			out.push({ a: i, b: j, text: t });
			i = j;
		}
		return out;
	}
	function chunkAt(chunks, wordIdx) {
		var lo = 0, hi = chunks.length - 1, ans = 0;
		while (lo <= hi) { var mid = (lo + hi) >> 1; if (chunks[mid].a <= wordIdx) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
		return ans;
	}

	/* ---------- pacing ---------- */
	// multiplier for the time one chunk stays on screen. 1 = exactly 60000/wpm per word.
	function pauseFactor(chunk, words, smart) {
		if (!smart) return 1;
		var last = words[chunk.b - 1];
		var f = 1;
		var w = last.w;
		if (last.para) f += 1.6;
		else if (last.sent) f += 1.0;
		else if (/[,;:—–)]["'”’]*$/.test(w)) f += 0.45;
		// long words and numbers need longer to recognise (judged on the longest word of the chunk)
		var longest = 0, num = false;
		for (var k = chunk.a; k < chunk.b; k++) {
			var core = coreOf(words[k].w);
			longest = Math.max(longest, Array.from(core).length);
			if (/\d/.test(core)) num = true;
		}
		var perWord = chunk.b - chunk.a;
		if (longest > 12) f += 0.5 / perWord + 0.2; else if (longest > 8) f += 0.25 / perWord;
		if (num) f += 0.3;
		return f;
	}
	// slow start: the first `ramp` chunks are eased from `from`x slower down to normal speed
	function rampFactor(k, ramp, from) {
		if (!ramp || k >= ramp) return 1;
		return 1 + (from - 1) * (1 - k / ramp);
	}
	// per-chunk multipliers (depends on text, chunk size and smart pacing only -- not on the speed, so a speed slider drag is cheap)
	function chunkFactors(chunks, words, smart) {
		var f = new Float64Array(chunks.length);
		for (var k = 0; k < chunks.length; k++) f[k] = pauseFactor(chunks[k], words, !!smart);
		return f;
	}
	// cumulative delays in ms from precomputed factors: cum[k] = time at which chunk k starts, cum[len] = total
	function timelineFrom(chunks, factors, wpm) {
		var base = 60000 / clampWpm(wpm);
		var cum = new Float64Array(chunks.length + 1);
		var t = 0;
		for (var k = 0; k < chunks.length; k++) {
			cum[k] = t;
			t += base * (chunks[k].b - chunks[k].a) * factors[k];
		}
		cum[chunks.length] = t;
		return cum;
	}
	// same thing in one call, with the optional slow start baked in (the app applies the ramp at play time instead)
	function buildTimeline(chunks, words, o) {
		var base = 60000 / clampWpm(o.wpm);
		var cum = new Float64Array(chunks.length + 1);
		var t = 0;
		for (var k = 0; k < chunks.length; k++) {
			cum[k] = t;
			var c = chunks[k];
			t += base * (c.b - c.a) * pauseFactor(c, words, !!o.smart) * rampFactor(k, o.ramp ? (o.rampChunks || 10) : 0, o.rampFrom || 2);
		}
		cum[chunks.length] = t;
		return cum;
	}
	function delayOf(cum, k) { return cum[k + 1] - cum[k]; }

	/* ---------- durations ---------- */
	function formatDuration(ms) {
		var s = Math.max(0, Math.round(ms / 1000));
		if (s < 60) return s + " s";
		var m = Math.floor(s / 60), r = s % 60;
		if (m < 60) return m + " min " + (r < 10 ? "0" : "") + r + " s";
		var h = Math.floor(m / 60); m = m % 60;
		return h + " h " + (m < 10 ? "0" : "") + m + " min";
	}
	function clock(ms) {
		var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
		return m + ":" + (r < 10 ? "0" : "") + r;
	}
	function readingMs(words, wpm) { return words / Math.max(1, wpm) * 60000; }
	function wpmFromTime(words, ms) { return ms > 0 ? Math.round(words / (ms / 60000)) : 0; }

	/* ---------- speech ---------- */
	// the next utterance: whole sentences from word `from`, up to ~maxLen characters (a sentence longer than maxLen is cut at a
	// comma / word boundary). Short utterances dodge Chrome's habit of silently stopping after ~15 s of one utterance.
	// -> { a, b (exclusive), start, end, text } with start/end = character offsets in the cleaned text
	function speechChunk(words, text, from, maxLen) {
		maxLen = maxLen || 220;
		if (from >= words.length) return null;
		var a = from, b = from, startChar = words[a].s;
		while (b < words.length) {
			var len = words[b].e - startChar;
			if (b > a && len > maxLen) {
				// cut at the last comma-ish word if there is one in the second half, else here
				var cut = b;
				for (var k = b - 1; k > a && words[k].e - startChar > maxLen * 0.5; k--) {
					if (/[,;:—–]$/.test(words[k].w)) { cut = k + 1; break; }
				}
				b = cut;
				break;
			}
			b++;
			if (words[b - 1].sent && words[b - 1].e - startChar >= Math.min(60, maxLen)) break;
			if (words[b - 1].para) break;
		}
		if (b === a) b = a + 1;
		var endChar = words[b - 1].e;
		return { a: a, b: b, start: startChar, end: endChar, text: text.slice(startChar, endChar).replace(/\s*\n\s*/g, " ") };
	}
	// the word containing character offset pos, else the next word (binary search)
	function wordAtChar(words, pos) {
		var lo = 0, hi = words.length - 1, ans = words.length - 1;
		while (lo <= hi) { var mid = (lo + hi) >> 1; if (words[mid].e > pos) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
		return ans;
	}
	// how long a voice at `rate` takes for a word, when it gives no boundary events (about 150 wpm at 1x, plus pauses)
	function speechDelay(w, rate) {
		rate = clamp(rate || 1, 0.1, 10);
		var core = coreOf(w);
		var ms = (80 + Array.from(core).length * 55) / rate;
		if (/[.!?…]["'”’)\]]*$/.test(w)) ms += 380 / rate;
		else if (/[,;:—]$/.test(w)) ms += 170 / rate;
		return ms;
	}
	function speechEstimateMs(words, from, to, rate) {
		var t = 0;
		for (var i = from; i < to && i < words.length; i++) t += speechDelay(words[i].w, rate);
		return t;
	}

	/* ---------- language + voices ---------- */
	var STOP = {
		en: "the of and to in is that it was for with as on are this be at have from or by not but they his her you an which we there their would what when one all".split(" "),
		es: "el la de que y en los se del las por un para con no una su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también".split(" "),
		fr: "le la les des de et un une du en que qui est pour dans ce il elle au sur pas plus par avec se ne sont mais ou nous vous ils comme".split(" "),
		de: "der die das und in den von zu mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei".split(" "),
		pt: "o a os as de que e do da em um uma para com não se na por mais dos como mas foi ao ele das tem à seu sua ou ser quando muito".split(" "),
		it: "il lo la i gli le di che e un una in per con non si da del della dei è sono come ma più anche al nel alla suo sua ha ho".split(" "),
		nl: "de het een van en in is dat op te zijn met voor niet aan er ook als bij maar om uit dan nog door worden naar heeft hij zij".split(" ")
	};
	// best-guess BCP-47 language code of a text ("" if no idea)
	function detectLang(text) {
		var s = String(text || "").slice(0, 4000);
		if (!s) return "";
		function share(re) { var m = s.match(re); return m ? m.length : 0; }
		var letters = share(/\p{L}/gu) || 1;
		var kana = share(/[぀-ヿ]/g), han = share(/[一-鿿]/g), hangul = share(/[가-힯]/g);
		if (kana / letters > 0.1) return "ja";
		if (hangul / letters > 0.3) return "ko";
		if (han / letters > 0.3) return "zh";
		if (share(/[Ѐ-ӿ]/g) / letters > 0.4) return "ru";
		if (share(/[؀-ۿ]/g) / letters > 0.4) return "ar";
		if (share(/[֐-׿]/g) / letters > 0.4) return "he";
		if (share(/[Ͱ-Ͽ]/g) / letters > 0.4) return "el";
		if (share(/[ऀ-ॿ]/g) / letters > 0.4) return "hi";
		if (share(/[฀-๿]/g) / letters > 0.4) return "th";
		var toks = s.toLowerCase().match(/[\p{L}']+/gu) || [];
		if (toks.length < 6) return "";
		var best = "", bestScore = 0;
		for (var lang in STOP) {
			var set = {}; STOP[lang].forEach(function (w) { set[w] = 1; });
			var hit = 0;
			for (var i = 0; i < toks.length; i++) if (set[toks[i]]) hit++;
			var score = hit / toks.length;
			if (score > bestScore) { bestScore = score; best = lang; }
		}
		return bestScore >= 0.12 ? best : "";
	}
	function voiceScore(v, lang, fallbackLang) {
		var vl = String(v.lang || "").replace("_", "-").toLowerCase();
		var s = 0, want = String(lang || "").toLowerCase(), fb = String(fallbackLang || "").toLowerCase().replace("_", "-");
		if (want) {
			if (vl.split("-")[0] === want.split("-")[0]) s += 100;
			if (vl === want) s += 5;
		}
		if (fb) {
			if (vl === fb) s += 30; else if (vl.split("-")[0] === fb.split("-")[0]) s += 20;
		}
		if (/natural|neural|premium|enhanced|online/i.test(v.name)) s += 12;
		if (v["default"]) s += 3;
		if (v.localService) s += 4;      // local voices report word boundaries; many online ones do not
		if (/novelty|whisper|bubbles|bells|boing|cellos|jester|organ|trinoids|zarvox|bad news|good news|albert|fred|junior|ralph|superstar/i.test(v.name)) s -= 40;
		return s;
	}
	// the key a voice is remembered by (same as the speed reader's <option> values)
	function voiceKey(v) { return v ? (v.voiceURI || v.name) + "|" + v.lang : ""; }
	// best voice for a text language (falls back to the browser's language, then the default voice); returns the voice or null.
	// `avoid` (optional) = { voiceKey: anything } of voices known not to work: they are skipped.
	function pickVoice(voices, lang, browserLang, avoid) {
		var best = null, bs = -1e9;
		for (var i = 0; i < voices.length; i++) {
			if (avoid && avoid[voiceKey(voices[i])]) continue;
			var sc = voiceScore(voices[i], lang, browserLang);
			if (sc > bs) { bs = sc; best = voices[i]; }
		}
		return best;
	}
	// 0 = the voice speaks the text's language, 1 = the browser's language (or there is no text language yet), 2 = another language
	function voiceLangRank(voiceLang, textLang, browserLang) {
		var vl = String(voiceLang || "").replace("_", "-").toLowerCase().split("-")[0];
		var tl = String(textLang || "").toLowerCase().split("-")[0], bl = String(browserLang || "").replace("_", "-").toLowerCase().split("-")[0];
		if (tl) return vl === tl ? 0 : vl === bl ? 1 : 2;
		return vl === bl ? 0 : 2;
	}
	/* Did an utterance really speak? Android (and some desktop engines) list voices whose voice data is not installed, or that cannot
	   read the text's script (e.g. "Bodo India" for English): speak() then ends at once in silence, never starts, or errors.
	   o = { error, started, ms (time from onstart to onend), expectMs (speechEstimateMs of the chunk), words (count), boundary }.
	   Returns "" (it worked, or no verdict) or a reason: "error", "nostart", "silent". */
	var VOICE_ERRORS = { "synthesis-unavailable": 1, "synthesis-failed": 1, "voice-unavailable": 1, "language-unavailable": 1, "audio-hardware": 1 };
	function speechFailure(o) {
		o = o || {};
		if (o.error) {
			if (o.error === "interrupted" || o.error === "canceled" || o.error === "not-allowed") return "";
			return VOICE_ERRORS[o.error] || !o.started ? "error" : "";
		}
		if (!o.started) return "nostart";
		if (o.boundary) return "";
		if ((o.words || 0) >= 3 && o.ms < Math.max(300, 0.2 * (o.expectMs || 0))) return "silent";
		return "";
	}
	// voices remembered as not working: { key: { t: ms, lang } }; entries older than `days` (default 30) are dropped (voice data may get installed later)
	function pruneBadVoices(map, now, days) {
		var out = {}, max = (days || 30) * 864e5;
		if (!map || typeof map !== "object") return out;
		for (var k in map) if (map[k] && typeof map[k].t === "number" && now - map[k].t < max && now >= map[k].t - 6e4) out[k] = { t: map[k].t, lang: String(map[k].lang || "") };
		return out;
	}

	/* ---------- settings / URL ---------- */
	var MODES = ["speed", "aloud", "both"];
	function parseParams(search) {
		var out = {}, p;
		try { p = new URLSearchParams(search || ""); } catch (e) { return out; }
		if (p.has("wpm")) out.wpm = clampWpm(p.get("wpm"));
		if (p.has("chunk")) { var c = parseInt(p.get("chunk"), 10); if (c >= 1 && c <= 5) out.chunk = c; }
		if (p.has("mode") && MODES.indexOf(p.get("mode")) >= 0) out.mode = p.get("mode");
		return out;
	}
	function buildParams(s) {
		var p = new URLSearchParams();
		p.set("wpm", String(clampWpm(s.wpm)));
		p.set("chunk", String(clamp(s.chunk || 1, 1, 5)));
		p.set("mode", MODES.indexOf(s.mode) >= 0 ? s.mode : "speed");
		return p.toString();
	}

	return {
		MIN_WPM: MIN_WPM, MAX_WPM: MAX_WPM, AVG_SILENT_WPM: AVG_SILENT_WPM, AVG_SPEECH_WPM: AVG_SPEECH_WPM, MODES: MODES,
		clamp: clamp, clampWpm: clampWpm, cleanText: cleanText, htmlToText: htmlToText, markdownToText: markdownToText, decodeEntities: decodeEntities,
		tokenize: tokenize, countWords: countWords, endsSentence: endsSentence, coreOf: coreOf,
		sentenceStartAt: sentenceStartAt, prevSentenceStart: prevSentenceStart, nextSentenceStart: nextSentenceStart,
		orpIndex: orpIndex, makeChunks: makeChunks, chunkAt: chunkAt,
		pauseFactor: pauseFactor, rampFactor: rampFactor, chunkFactors: chunkFactors, timelineFrom: timelineFrom, buildTimeline: buildTimeline, delayOf: delayOf,
		formatDuration: formatDuration, clock: clock, readingMs: readingMs, wpmFromTime: wpmFromTime,
		speechChunk: speechChunk, wordAtChar: wordAtChar, speechDelay: speechDelay, speechEstimateMs: speechEstimateMs,
		detectLang: detectLang, voiceScore: voiceScore, pickVoice: pickVoice, voiceKey: voiceKey, voiceLangRank: voiceLangRank,
		speechFailure: speechFailure, pruneBadVoices: pruneBadVoices, parseParams: parseParams, buildParams: buildParams
	};
})();
if (typeof module !== "undefined" && module.exports) module.exports = SRLib;

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

/* MES Dictionary (mes.fm/define): look up a word (Wiktionary REST + wikitext, dictionaryapi.dev as a fallback), hear it (MES Pronounce's data,
   speech voices, Commons recordings), read it aloud, translate it (MES Translate), save it, flashcards + quiz, word of the day, and "On MES"
   pages from the site search index (window.MESSearch, pre_js). Pure helpers: MESDef (lib.js), MESPron (pronounce lib), SRLib (speedreader lib). */
(function () {
	"use strict";
	var D = window.MESDef, P = window.MESPron, SR = window.SRLib;
	var root = document.getElementById("df");
	if (!root || !D) return;
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("df-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	function copy(text, msg) {
		var ok = function () { toast(msg || "Copied"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Could not copy"); } ta.remove(); }
	}

	/* ---------- saved state ---------- */
	var KEY = "mes-define:v1";
	var S = { saved: [], recent: [], tr: D.trDefault(navigator.language), sort: "new" };
	try { var st = JSON.parse(localStorage.getItem(KEY) || "{}"); if (st && typeof st === "object") Object.keys(S).forEach(function (k) { if (st[k] != null) S[k] = st[k]; }); } catch (e) {}
	if (!Array.isArray(S.saved)) S.saved = [];
	if (!Array.isArray(S.recent)) S.recent = [];
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	window.addEventListener("storage", function (e) {
		if (e.key !== KEY) return;
		try { var n = JSON.parse(e.newValue || "{}"); if (Array.isArray(n.saved)) S.saved = n.saved; if (Array.isArray(n.recent)) S.recent = n.recent; renderSaved(); renderRecent(); paintSaveBtn(); } catch (x) {}
	});

	/* ---------- fetching ---------- */
	var cache = {};
	function getJson(url, ms) {
		var ctl = typeof AbortController === "function" ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
		return fetch(url, { signal: ctl ? ctl.signal : undefined, credentials: "omit" }).then(function (r) {
			clearTimeout(t);
			if (r.status === 404) return { notFound: true };
			if (!r.ok) throw new Error("HTTP " + r.status);
			return r.json().then(function (j) { return { json: j }; });
		}, function (e) { clearTimeout(t); throw e; });
	}
	function fetchEntry(word) {
		var lk = word.toLowerCase();
		if (cache[lk]) return cache[lk];
		var tries = D.variants(word), netErr = null, onlyOther = null;
		function next(i) {
			if (i >= tries.length) return dictApi(word).then(function (e) { return e || { missing: true, other: onlyOther, netErr: netErr }; });
			var w = tries[i];
			var wt = getJson(D.wikitextUrl(w), 15000).catch(function () { return null; });
			return getJson(D.restUrl(w)).then(function (r) {
				if (r.notFound || !r.json) return next(i + 1);
				var rest = D.parseRest(r.json);
				if (!rest.pos.length) { onlyOther = onlyOther || { word: w, langs: rest.other }; return next(i + 1); }
				return wt.then(function (x) {
					var e = D.build(w, r.json, x && x.json ? x.json : null);
					e.source = "wiktionary";
					return e;
				});
			}, function (err) { netErr = err; return next(i + 1); });
		}
		cache[lk] = next(0).then(function (e) { if (!e || e.missing) delete cache[lk]; return e; }, function (err) { delete cache[lk]; throw err; });
		return cache[lk];
	}
	function dictApi(word) {
		return getJson(D.dictApiUrl(word), 9000).then(function (r) {
			if (!r.json) return null;
			var d = D.parseDictApi(r.json);
			if (!d.pos.length) return null;
			var e = { word: Array.isArray(r.json) && r.json[0] && r.json[0].word || word, pos: d.pos, other: [], wiki: { etys: [], syn: d.syn, ant: d.ant, der: [], rel: [], see: [], alt: [], hyph: [], rhymes: [], ipa: d.ipa.map(function (x) { return { ipa: x, acc: "" }; }), audio: [], trans: [] }, apiAudio: d.audio, source: "dictapi" };
			e.short = D.shortDef(e);
			return e;
		}).catch(function () { return null; });
	}

	/* ---------- the entry ---------- */
	var cur = null, posShow = "all", token = 0, expanded = {};
	function msg(html, kind) { var m = $("df-msg"); if (!html) { m.hidden = true; m.innerHTML = ""; return; } m.hidden = false; m.className = "tu-card df-msg" + (kind ? " df-msg--" + kind : ""); m.innerHTML = html; }
	function lookup(word, opts) {
		opts = opts || {};
		var w = D.normWord(word);
		if (!w) return;
		$("df-q").value = w;
		hideSug();
		stopRead();
		var my = ++token;
		msg('<span class="df-spin" aria-hidden="true"></span> Looking up <strong>' + esc(w) + "</strong>…");
		if (!opts.noHistory) {
			var url = "/define?w=" + encodeURIComponent(w).replace(/%20/g, "+");
			try { if (opts.replace) history.replaceState({ w: w }, "", opts.keepUrl ? location.href : url); else history.pushState({ w: w }, "", url); } catch (e) {}
		}
		fetchEntry(w).then(function (e) {
			if (my !== token) return;
			if (e.missing) return notFound(w, e);
			msg("");
			cur = e; posShow = "all"; expanded = {};
			if (!opts.quiet) { S.recent = D.addRecent(S.recent, e.word); save(); renderRecent(); }
			document.title = e.word + ": definition, pronunciation and translation | MES Dictionary";
			render();
			if (opts.scroll) $("df-entry").scrollIntoView({ behavior: "smooth", block: "start" });
		}, function () {
			if (my !== token) return;
			msg("Could not reach the dictionary. Check your connection and try again. <button type=\"button\" class=\"df-link\" data-w=\"" + esc(w) + "\">Try again</button>", "err");
		});
	}
	function notFound(w, info) {
		$("df-entry").hidden = true; $("df-more").hidden = true; cur = null;
		document.title = w + ": not found | MES Dictionary";
		var html = "<strong>" + esc(w) + "</strong> is not in the dictionary" + (info.netErr ? " (or the dictionary could not be reached)" : "") + ".";
		if (info.other && info.other.langs && info.other.langs.length) html += " Wiktionary has it as a word in " + esc(info.other.langs.slice(0, 5).join(", ")) + ': <a href="https://en.wiktionary.org/wiki/' + encodeURIComponent(D.title(info.other.word)) + '" target="_blank" rel="noopener">see it there</a>.';
		msg(html + '<div class="df-didyou" id="df-didyou"></div>', "warn");
		getJson(D.suggestUrl(w.slice(0, Math.max(3, w.length - 2))), 8000).then(function (r) {
			var list = D.parseSuggest(r.json, w).filter(function (x) { return x.toLowerCase() !== w.toLowerCase(); });
			list.sort(function (a, b) { return D.edits(a, w) - D.edits(b, w); });
			var box = $("df-didyou");
			if (box && list.length) box.innerHTML = '<span class="df-chiplab">Did you mean:</span> ' + list.slice(0, 6).map(function (x) { return '<button type="button" class="tu-chip" data-w="' + esc(x) + '">' + esc(x) + "</button>"; }).join(" ");
		}).catch(function () {});
	}

	function segsHtml(segs) {
		return (segs || []).map(function (s) { return s.w ? '<a class="df-wl" href="/define?w=' + encodeURIComponent(s.w) + '" data-w="' + esc(s.w) + '" title="Look up ' + esc(s.w) + '">' + esc(s.t) + "</a>" : esc(s.t); }).join("");
	}
	function chips(list, cls) { return list.map(function (x) { return '<button type="button" class="tu-chip ' + (cls || "") + '" data-w="' + esc(x) + '">' + esc(x) + "</button>"; }).join(" "); }
	var SHOW = 8;
	function render() {
		var e = cur;
		$("df-entry").hidden = false; $("df-more").hidden = false;
		$("df-word").textContent = e.word;
		$("df-pr").href = D.pronounceLink(e.word);
		paintSaveBtn();
		// parts of speech filter
		var bar = $("df-posbar");
		if (e.pos.length > 1) {
			bar.innerHTML = '<button type="button" class="df-pchip" data-pos="all" aria-pressed="true">All <span class="df-n">' + e.pos.reduce(function (a, p) { return a + p.senses.length; }, 0) + "</span></button>" +
				e.pos.map(function (p, i) { return '<button type="button" class="df-pchip" data-pos="' + i + '" aria-pressed="false">' + esc(p.pos) + ' <span class="df-n">' + p.senses.length + "</span></button>"; }).join("");
			bar.hidden = false;
		} else { bar.innerHTML = ""; bar.hidden = true; }
		renderSenses();
		$("df-src").innerHTML = e.source === "dictapi"
			? 'From <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener">dictionaryapi.dev</a> (built from Wiktionary, CC BY-SA). <a href="' + esc(D.wiktionaryPage(e.word)) + '" target="_blank" rel="noopener">Wiktionary page</a>.'
			: 'From <a href="' + esc(D.wiktionaryPage(e.word)) + '" target="_blank" rel="noopener">Wiktionary, the free dictionary</a>, under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> (formatting changed).';
		renderPron();
		renderEty(); renderForms(); renderThes(); renderRel(); renderTrans();
		renderMes();
		// a saved word without its meaning (a list imported as plain words) gets it now
		var si = D.indexOfWord(S.saved, e.word);
		if (si >= 0 && !S.saved[si].d && e.short.text) { S.saved[si].d = e.short.text; S.saved[si].p = e.short.pos; save(); renderSaved(); }
	}
	function renderSenses() {
		var e = cur, html = "";
		e.pos.forEach(function (p, i) {
			if (posShow !== "all" && String(i) !== posShow) return;
			var n = p.senses.length, lim = expanded[i] ? n : SHOW, depth1 = 0;
			html += '<section class="df-pos" data-sid="p' + i + '"><h3 class="df-posh">' + esc(p.pos);
			if (p.forms && p.forms.rows && p.forms.rows.length) html += ' <span class="df-posf">' + p.forms.rows.map(function (r) { return esc(r[1]); }).join(" · ") + "</span>";
			else if (p.forms && p.forms.note) html += ' <span class="df-posf">(' + esc(p.forms.note) + ")</span>";
			html += "</h3><ol class=\"df-ol\">";
			p.senses.forEach(function (s, j) {
				if (j >= lim) return;
				var sub = s.depth > 1;
				if (!sub) depth1++;
				html += '<li class="df-sense' + (sub ? " df-sub" : "") + '" data-sid="s' + i + "-" + j + '"><span class="df-num" aria-hidden="true">' + (sub ? "•" : depth1) + "</span><div class=\"df-sbody\">" +
					(s.labels && s.labels.length ? s.labels.map(function (l) { return '<span class="df-lab">' + esc(l) + "</span>"; }).join("") + " " : "") +
					'<span class="df-def">' + segsHtml(s.segs) + "</span>" +
					(s.formOf ? ' <button type="button" class="df-link df-formof" data-w="' + esc(s.formOf) + '">Look up “' + esc(s.formOf) + "”</button>" : "") +
					(s.ex && s.ex.length ? '<ul class="df-ex">' + s.ex.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
					(s.syn && s.syn.length ? '<div class="df-nym"><span class="df-nyml">Synonyms</span> ' + chips(s.syn.slice(0, 12), "df-syn") + "</div>" : "") +
					(s.ant && s.ant.length ? '<div class="df-nym"><span class="df-nyml">Antonyms</span> ' + chips(s.ant.slice(0, 12), "df-ant") + "</div>" : "") +
					"</div></li>";
			});
			html += "</ol>";
			if (n > SHOW) html += '<button type="button" class="df-link df-moreb" data-more="' + i + '">' + (expanded[i] ? "Show fewer" : "Show all " + n + " meanings") + "</button>";
			html += "</section>";
		});
		$("df-senses").innerHTML = html;
		Array.prototype.forEach.call($("df-posbar").querySelectorAll(".df-pchip"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pos") === posShow ? "true" : "false"); });
	}

	/* ---------- pronunciation ---------- */
	var shards = {};
	function shardFor(w) {
		if (!P) return Promise.resolve({});
		var k = P.shardOf(w);
		if (!shards[k]) shards[k] = fetch(P.shardUrl(w)).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { delete shards[k]; return {}; });
		return shards[k];
	}
	var recs = [];
	function renderPron() {
		var e = cur, w = e.word, my = token;
		var wikiIpa = e.wiki.ipa || [];
		recs = [];
		(e.wiki.audio || []).forEach(function (a) { var c = D.commonsAudio(a.file); if (c) recs.push({ url: c.mp3, page: c.page, acc: a.acc || "Recording" }); });
		(e.apiAudio || []).forEach(function (a) { recs.push({ url: a.url, page: "", acc: a.acc || "Recording" }); });
		var first = wikiIpa.filter(function (x) { return /US|UK/.test(x.acc); })[0] || wikiIpa[0];
		function line(cmu) {
			var parts = [];
			var ipa = first ? first.ipa : cmu ? cmu.ipa : "";
			if (ipa) parts.push('<span class="df-ipa" title="IPA' + (first && first.acc ? ", " + esc(first.acc) : "") + '">' + esc(ipa) + "</span>");
			if (cmu) parts.push('<span class="df-resp" title="Say it like">' + esc(cmu.respell.map(function (x, i) { return cmu.stress[i] === 1 ? x.toUpperCase() : x; }).join("-")) + "</span>");
			if (e.wiki.hyph && e.wiki.hyph[0]) parts.push('<span class="df-hyph" title="Hyphenation">' + esc(e.wiki.hyph[0]) + "</span>");
			$("df-pron").innerHTML = parts.join('<span class="df-dot" aria-hidden="true"> · </span>');
		}
		line(null);
		var body = '<div id="df-cmu"></div>';
		if (wikiIpa.length) body += '<div class="df-prrow"><span class="df-k">IPA</span><span class="df-v">' + wikiIpa.slice(0, 6).map(function (x) { return '<span class="df-ipa">' + esc(x.ipa) + "</span>" + (x.acc ? ' <span class="df-acc">' + esc(x.acc) + "</span>" : ""); }).join("<br>") + "</span></div>";
		if (recs.length) body += '<div class="df-prrow"><span class="df-k">Recordings</span><span class="df-v df-recs">' + recs.slice(0, 6).map(function (r, i) { return '<button type="button" class="df-rec" data-rec="' + i + '" title="Play this recording">&#9654;&#65038; ' + esc(r.acc) + "</button>"; }).join(" ") + '<br><span class="df-small">Real speakers from <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a>' + (recs[0].page ? ' (<a href="' + esc(recs[0].page) + '" target="_blank" rel="noopener">source and licence</a>)' : "") + ".</span></span></div>";
		if (e.wiki.rhymes && e.wiki.rhymes.length) body += '<div class="df-prrow"><span class="df-k">Rhymes</span><span class="df-v df-ipa">' + esc(e.wiki.rhymes.join(", ")) + "</span></div>";
		body += '<p class="df-prlink"><a href="' + esc(D.pronounceLink(w)) + '">Hear it slowly, syllable by syllable and in other accents in MES Pronounce</a></p>';
		$("df-prbody").innerHTML = body;
		if (!P || / /.test(w)) return;
		shardFor(w).then(function (sh) {
			if (my !== token) return;
			var entry = sh[P.normWord(w)];
			var fs = P.forms(w, entry);
			var f = fs.filter(function (x) { return x.label !== "Usual"; })[0] || fs[0];
			if (!f) { line(null); return; }
			line(f);
			var syl = f.syls.map(function (s, i) { return '<span class="df-syl df-syl' + s.stress + '">' + esc(f.respell[i]) + "</span>"; }).join('<span class="df-sylsep" aria-hidden="true">·</span>');
			$("df-cmu").innerHTML = '<div class="df-prrow"><span class="df-k">Syllables</span><span class="df-v"><span class="df-syls" aria-label="' + esc(f.respell.join("-")) + '">' + syl + '</span> <span class="df-small">(' + f.syls.length + (f.syls.length === 1 ? " syllable" : " syllables") + (f.syls.length > 1 ? ", stressed one bigger" : "") + ")</span></span></div>" +
				'<div class="df-prrow"><span class="df-k">Say it like</span><span class="df-v df-resp">' + esc(f.respell.map(function (x, i) { return f.stress[i] === 1 ? x.toUpperCase() : x; }).join("-")) + "</span></div>" +
				(fs.length > 1 ? '<div class="df-prrow"><span class="df-k">Also</span><span class="df-v">' + fs.filter(function (x) { return x !== f; }).slice(0, 3).map(function (x) { return '<span class="df-ipa">' + esc(x.ipa) + '</span> <span class="df-acc">' + esc(x.label) + (x.note ? ", " + esc(x.note) : "") + "</span>"; }).join("<br>") + "</span></div>" : "");
		});
	}
	var audioEl = null;
	function playRec(i) {
		var r = recs[i];
		if (!r) return false;
		try { if (audioEl) audioEl.pause(); audioEl = new Audio(r.url); audioEl.play().catch(function () { toast("Could not play that recording"); }); } catch (e) { return false; }
		return true;
	}

	/* ---------- speech ---------- */
	var hasTTS = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function", voices = [];
	function loadVoices() { try { voices = (speechSynthesis.getVoices() || []).filter(function (v) { return v && v.lang; }); } catch (e) { voices = []; } }
	if (hasTTS) { loadVoices(); try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; } }
	function enVoice() {
		var bad = {};
		try { bad = JSON.parse(localStorage.getItem("mes-speedreader:badvoices") || "{}") || {}; } catch (e) {}
		var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
		if (SR && SR.pickVoice) return SR.pickVoice(en.length ? en : voices, "en", navigator.language, bad) || en[0] || null;
		return en[0] || null;
	}
	function say(text, opts) {
		opts = opts || {};
		if (!hasTTS) { if (opts.fallbackRec && playRec(0)) return; toast("This browser cannot speak. Try a recording below."); return; }
		var u = new SpeechSynthesisUtterance(text), v = enVoice();
		if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
		u.rate = opts.rate || 0.95;
		if (opts.onstart) u.onstart = opts.onstart;
		u.onend = opts.onend || null; u.onerror = opts.onend || null;
		say.keep = u;   // keep a reference (Chrome drops unreferenced utterances)
		try { speechSynthesis.speak(u); } catch (e) { if (opts.onend) opts.onend(); }
	}
	function hear(w) { stopRead(); try { if (hasTTS) speechSynthesis.cancel(); } catch (e) {} say(w || (cur && cur.word) || "", { fallbackRec: true, rate: 0.9 }); }
	var reading = false;
	function stopRead() {
		if (!reading) return;
		reading = false;
		try { speechSynthesis.cancel(); } catch (e) {}
		Array.prototype.forEach.call(root.querySelectorAll(".df-reading"), function (x) { x.classList.remove("df-reading"); });
		$("df-read").setAttribute("aria-pressed", "false"); $("df-read").querySelector(".df-tbl").textContent = "Read aloud";
	}
	function readAloud() {
		if (reading) { stopRead(); return; }
		if (!cur) return;
		if (!hasTTS) { toast("This browser cannot read aloud"); return; }
		try { speechSynthesis.cancel(); } catch (e) {}
		var parts = D.speechParts(cur, 999).filter(function (p) {
			if (p.id === "w") return true;
			var m = /^[ps](\d+)(?:-(\d+))?$/.exec(p.id);
			if (!m) return true;
			if (posShow !== "all" && m[1] !== posShow) return false;
			return !m[2] || expanded[m[1]] || +m[2] < SHOW;
		});
		reading = true; $("df-read").setAttribute("aria-pressed", "true"); $("df-read").querySelector(".df-tbl").textContent = "Stop";
		var i = 0;
		(function next() {
			if (!reading) return;
			Array.prototype.forEach.call(root.querySelectorAll(".df-reading"), function (x) { x.classList.remove("df-reading"); });
			if (i >= parts.length) { stopRead(); return; }
			var p = parts[i++], el = p.id === "w" ? $("df-word") : root.querySelector('[data-sid="' + p.id + '"]');
			if (el) { el.classList.add("df-reading"); if (el.scrollIntoView && p.id[0] === "s") { var r = el.getBoundingClientRect(); if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: "center", behavior: "smooth" }); } }
			say(p.text, { onend: function () { setTimeout(next, 120); }, rate: 1 });
		})();
	}

	/* ---------- etymology, forms, synonyms, related, translations ---------- */
	function renderEty() {
		var etys = cur.wiki.etys || [];
		$("df-etycard").hidden = !etys.length;
		$("df-ety").innerHTML = etys.slice(0, 4).map(function (segs, i) { return (etys.length > 1 ? '<p class="df-etyn">' + (i + 1) + ".</p>" : "") + '<p class="df-etyp">' + segsHtml(segs) + "</p>"; }).join("");
	}
	function renderForms() {
		var rows = [];
		cur.pos.forEach(function (p) { if (p.forms && (p.forms.rows.length || p.forms.note)) rows.push(p); });
		$("df-formscard").hidden = !rows.length;
		$("df-forms").innerHTML = rows.map(function (p) {
			return '<div class="df-fgroup"><h3 class="df-fh">' + esc(p.pos) + (p.forms.note ? ' <span class="df-small">(' + esc(p.forms.note) + ")</span>" : "") + "</h3>" +
				(p.forms.rows.length ? '<table class="df-ftab"><tbody>' + p.forms.rows.map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table>" : "") + "</div>";
		}).join("");
	}
	function gatherNyms(kind) {
		var all = [];
		cur.pos.forEach(function (p) { (p[kind] || []).forEach(function (x) { all.push(x); }); p.senses.forEach(function (s) { (s[kind] || []).forEach(function (x) { all.push(x); }); }); });
		(cur.wiki[kind] || []).forEach(function (x) { all.push(x); });
		var seen = {};
		return all.filter(function (x) { var k = x.toLowerCase(); if (seen[k] || k === cur.word.toLowerCase()) return false; seen[k] = 1; return true; });
	}
	function renderThes() {
		var syn = gatherNyms("syn"), ant = gatherNyms("ant");
		$("df-thescard").hidden = !syn.length && !ant.length;
		$("df-thes").innerHTML = (syn.length ? '<h3 class="df-fh">Synonyms <span class="df-n">' + syn.length + '</span></h3><div class="df-chipbox">' + chips(syn.slice(0, 40), "df-syn") + "</div>" : "") +
			(ant.length ? '<h3 class="df-fh">Antonyms <span class="df-n">' + ant.length + '</span></h3><div class="df-chipbox">' + chips(ant.slice(0, 30), "df-ant") + "</div>" : "");
	}
	var REL_LIM = 24;
	function renderRel() {
		var w = cur.wiki, groups = [["Derived terms", w.der], ["Related terms", w.rel], ["See also", w.see], ["Other spellings", w.alt]].filter(function (g) { return g[1] && g[1].length; });
		$("df-relcard").hidden = !groups.length;
		$("df-rel").innerHTML = groups.map(function (g, i) {
			var many = g[1].length > REL_LIM;
			return '<h3 class="df-fh">' + g[0] + ' <span class="df-n">' + g[1].length + '</span></h3><div class="df-chipbox" data-rel="' + i + '">' + chips(many ? g[1].slice(0, REL_LIM) : g[1]) +
				(many ? ' <button type="button" class="df-link" data-relall="' + i + '">Show all ' + g[1].length + "</button>" : "") + "</div>";
		}).join("");
		$("df-rel").relGroups = groups;
	}
	function renderTrans() {
		var t = cur.wiki.trans || [];
		$("df-trcard").hidden = !t.length;
		if (!t.length) return;
		$("df-trgloss").innerHTML = t.map(function (x, i) { return '<option value="' + i + '">' + esc((x.pos ? x.pos + ": " : "") + (x.gloss || "meaning " + (i + 1))) + "</option>"; }).join("");
		$("df-trgloss").hidden = t.length < 2;
		$("df-trfilter").value = "";
		renderTransList();
	}
	function renderTransList() {
		var t = (cur.wiki.trans || [])[+$("df-trgloss").value || 0];
		if (!t) return;
		var f = $("df-trfilter").value.trim().toLowerCase(), mine = S.tr;
		var items = t.items.filter(function (x) { return !f || x.lang.toLowerCase().indexOf(f) >= 0; });
		items.sort(function (a, b) { return (a.code === mine ? -1 : 0) - (b.code === mine ? -1 : 0); });
		$("df-trlist").innerHTML = items.length ? '<table class="df-trtab"><tbody>' + items.slice(0, f ? 400 : 120).map(function (x) {
			return "<tr><th>" + esc(x.lang) + '</th><td lang="' + esc(x.code) + '">' + esc(x.words.join(", ")) + '</td><td><a class="df-link" href="' + esc(D.translateLink(cur.word, x.code)) + '" target="_blank" rel="noopener" title="Open in MES Translate">Translate</a></td></tr>';
		}).join("") + "</tbody></table>" : '<p class="tu-note">No language matches.</p>';
	}

	/* ---------- On MES ---------- */
	function renderMes() {
		var box = $("df-mes"), w = cur.word, my = token;
		box.hidden = true;
		if (!window.MESSearch) return;
		window.MESSearch.load().then(function () {
			if (my !== token) return;
			var picks = [];
			D.stems(w).forEach(function (s) { picks = picks.concat(D.mesPick(window.MESSearch.search(s).items, w, 8)); });
			var seen = {}; picks = picks.filter(function (p) { if (seen[p.path]) return false; seen[p.path] = 1; return true; });
			picks.sort(function (a, b) { return a.rank - b.rank || (b.strong ? 1 : 0) - (a.strong ? 1 : 0); });
			var fun = 0, strong = picks.filter(function (p) { return p.strong; }).length, weak = 0;
			picks = picks.filter(function (p) { return (p.rank < 6 || fun++ < 1) && (p.strong || !strong || weak++ < 2); }).slice(0, 6);
			if (!picks.length) return;
			$("df-mesgrid").innerHTML = picks.map(function (p) {
				return '<a class="df-mescard" href="' + esc(p.path) + '">' + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="" loading="lazy" width="64" height="64">' : '<span class="df-mesph" aria-hidden="true">&#8730;</span>') +
					'<span class="df-mest"><span class="df-mesn">' + esc(p.title) + '</span><span class="df-mesc">' + esc(p.cat) + '</span><span class="df-mesd">' + esc(String(p.desc || "").slice(0, 110)) + "</span></span></a>";
			}).join("");
			box.hidden = false;
		}).catch(function () {});
	}

	/* ---------- saving ---------- */
	function isSaved(w) { return D.indexOfWord(S.saved, w) >= 0; }
	function paintSaveBtn() {
		if (!cur) return;
		var on = isSaved(cur.word), b = $("df-save");
		b.setAttribute("aria-pressed", on ? "true" : "false");
		b.firstElementChild.innerHTML = on ? "&#9733;" : "&#9734;";
		b.querySelector(".df-tbl").textContent = on ? "Saved" : "Save";
	}
	function toggleSave() {
		if (!cur) return;
		if (isSaved(cur.word)) { var old = S.saved.slice(); S.saved = D.removeSaved(S.saved, cur.word); undoToast("Removed from your words", function () { S.saved = old; }); }
		else { S.saved = D.addSaved(S.saved, { w: cur.word, d: cur.short.text, p: cur.short.pos }); toast("Saved: " + cur.word); }
		save(); paintSaveBtn(); renderSaved();
	}
	function undoToast(text, undo) {
		var t = $("df-toast");
		t.innerHTML = esc(text) + ' <button type="button" class="df-undo">Undo</button>';
		t.classList.add("tu-toast--show");
		t.querySelector(".df-undo").onclick = function () { undo(); save(); paintSaveBtn(); renderSaved(); t.classList.remove("tu-toast--show"); };
		clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 6000);
	}
	function renderSaved() {
		var f = $("df-sfilter").value.trim().toLowerCase(), list = S.saved.slice();
		$("df-nsaved").textContent = S.saved.length ? S.saved.length : "";
		if (S.sort === "az") list.sort(function (a, b) { return a.w.localeCompare(b.w); });
		else if (S.sort === "box") list.sort(function (a, b) { return (a.b || 0) - (b.b || 0); });
		if (f) list = list.filter(function (x) { return x.w.toLowerCase().indexOf(f) >= 0 || String(x.d).toLowerCase().indexOf(f) >= 0; });
		$("df-sempty").hidden = S.saved.length > 0;
		$("df-slist").innerHTML = list.slice(0, 500).map(function (x) {
			var dots = ""; for (var i = 1; i <= 5; i++) dots += '<span class="df-box' + ((x.b || 0) >= i ? " on" : "") + '"></span>';
			return '<li class="df-sitem"><button type="button" class="df-sw" data-w="' + esc(x.w) + '">' + esc(x.w) + "</button>" + (x.p ? ' <span class="df-sp">' + esc(x.p.toLowerCase()) + "</span>" : "") +
				'<span class="df-boxes2" title="How well you know it (flashcards): ' + (x.b || 0) + ' of 5">' + dots + '</span><button type="button" class="df-x" data-del="' + esc(x.w) + '" title="Remove ' + esc(x.w) + '" aria-label="Remove ' + esc(x.w) + '">&times;</button>' +
				(x.d ? '<span class="df-sd">' + esc(x.d) + "</span>" : "") + "</li>";
		}).join("");
		$("df-ssort").value = S.sort;
	}
	function renderRecent() {
		var r = S.recent.slice(0, 10);
		$("df-recentrow").hidden = !r.length;
		$("df-recent").innerHTML = chips(r);
	}

	/* ---------- flashcards ---------- */
	var card = null, flipped = false;
	function nextFlash(skip) {
		card = D.nextCard(S.saved, Date.now(), skip);
		var has = !!card;
		$("df-cardbox").hidden = !has; $("df-cardempty").hidden = has;
		if (!has) return;
		flipped = false;
		$("df-flashf").textContent = card.w;
		$("df-flashb").innerHTML = (card.p ? '<span class="df-flashp">' + esc(card.p.toLowerCase()) + "</span>" : "") + esc(card.d);
		$("df-flashb").hidden = true; $("df-flashhint").hidden = false; $("df-flashf").hidden = false;
		var due = S.saved.filter(function (x) { return x.d && (x.n || 0) <= Date.now(); }).length;
		$("df-cardinfo").textContent = due ? due + (due === 1 ? " card is" : " cards are") + " due" : "Nothing due: practising ahead";
		var counts = [0, 0, 0, 0, 0, 0];
		S.saved.forEach(function (x) { counts[x.b || 0]++; });
		$("df-boxes").textContent = "New: " + counts[0] + " · Learning: " + (counts[1] + counts[2]) + " · Known: " + (counts[3] + counts[4]) + " · Mastered: " + counts[5];
	}
	function flip() { if (!card) return; flipped = !flipped; $("df-flashb").hidden = !flipped; $("df-flashf").hidden = false; $("df-flashhint").hidden = flipped; }
	function gradeCard(ok) {
		if (!card) return;
		var i = D.indexOfWord(S.saved, card.w);
		if (i >= 0) { S.saved[i] = D.grade(S.saved[i], ok); save(); }
		var w = card.w;
		nextFlash(w); renderSaved();
	}

	/* ---------- quiz ---------- */
	var qz = null, qseed = Date.now() % 100000, qscore = [0, 0];
	function newQuiz() {
		qz = D.quiz(S.saved, ++qseed);
		$("df-quizbox").hidden = !qz; $("df-quizempty").hidden = !!qz;
		if (!qz) return;
		$("df-qdef").innerHTML = (qz.pos ? '<span class="df-flashp">' + esc(qz.pos.toLowerCase()) + "</span> " : "") + esc(qz.def);
		$("df-qopts").innerHTML = qz.options.map(function (o, i) { return '<button type="button" class="df-qopt" data-q="' + i + '">' + esc(o) + "</button>"; }).join("");
		$("df-qres").textContent = "";
		$("df-qscore").textContent = qscore[1] ? qscore[0] + " of " + qscore[1] + " right" : "";
	}
	function answer(i) {
		if (!qz || qz.done) return;
		qz.done = true;
		var ok = i === qz.answer;
		qscore[1]++; if (ok) qscore[0]++;
		Array.prototype.forEach.call($("df-qopts").children, function (b, k) { b.disabled = true; if (k === qz.answer) b.classList.add("ok"); else if (k === i) b.classList.add("no"); });
		$("df-qres").innerHTML = ok ? "Right!" : "It was <button type=\"button\" class=\"df-link\" data-w=\"" + esc(qz.word) + "\">" + esc(qz.word) + "</button>.";
		var j = D.indexOfWord(S.saved, qz.word);
		if (j >= 0 && !ok) { S.saved[j] = D.grade(S.saved[j], false); save(); renderSaved(); }
		$("df-qscore").textContent = qscore[0] + " of " + qscore[1] + " right";
		$("df-qnext").focus();
	}

	/* ---------- word of the day ---------- */
	function renderWotd() {
		var today = D.wordOfDay(new Date());
		$("df-wotdchip").textContent = today.w;
		$("df-wotdchip").setAttribute("data-w", today.w);
		var html = "", fmt;
		try { fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch (e) { fmt = null; }
		for (var i = 0; i < 7; i++) {
			var d = new Date(); d.setDate(d.getDate() - i);
			var x = D.wordOfDay(d);
			html += '<li class="df-witem' + (i === 0 ? " df-today" : "") + '"><span class="df-wdate">' + (i === 0 ? "Today" : fmt ? esc(fmt.format(d)) : "") + '</span><button type="button" class="df-sw" data-w="' + esc(x.w) + '">' + esc(x.w) + '</button> <span class="df-sp">' + esc(x.p) + '</span><span class="df-sd">' + esc(x.d) + "</span></li>";
		}
		$("df-wlist").innerHTML = html;
	}

	/* ---------- tabs ---------- */
	var TABS = ["saved", "cards", "quiz", "wotd"], tab = "saved";
	function setTab(t) {
		tab = t;
		TABS.forEach(function (x) { $("df-t-" + x).setAttribute("aria-selected", x === t ? "true" : "false"); $("df-p-" + x).hidden = x !== t; });
		if (t === "cards") nextFlash();
		if (t === "quiz" && !qz) newQuiz();
	}

	/* ---------- fill window ---------- */
	var filled = null;
	function fill(el) {
		if (filled) unfill();
		if (!el) return;
		filled = el; el.classList.add("df-filled"); document.documentElement.classList.add("df-nofs");
	}
	function unfill() { if (!filled) return; filled.classList.remove("df-filled"); document.documentElement.classList.remove("df-nofs"); filled = null; }

	/* ---------- suggestions ---------- */
	var sugT = 0, sugList = [], sugI = -1, sugQ = "";
	function hideSug() { $("df-sug").hidden = true; $("df-q").setAttribute("aria-expanded", "false"); sugI = -1; }
	function showSug() {
		var ul = $("df-sug");
		if (!sugList.length) { hideSug(); return; }
		ul.innerHTML = sugList.map(function (x, i) { return '<li role="option" id="df-sug' + i + '" class="df-sugi' + (i === sugI ? " on" : "") + '" aria-selected="' + (i === sugI) + '" data-w="' + esc(x) + '">' + esc(x) + "</li>"; }).join("");
		ul.hidden = false; $("df-q").setAttribute("aria-expanded", "true");
		$("df-q").setAttribute("aria-activedescendant", sugI >= 0 ? "df-sug" + sugI : "");
	}
	$("df-q").addEventListener("input", function () {
		var q = D.normWord(this.value);
		clearTimeout(sugT);
		if (q.length < 2) { sugList = []; hideSug(); return; }
		sugT = setTimeout(function () {
			sugQ = q;
			getJson(D.suggestUrl(q), 6000).then(function (r) { if (sugQ !== q || D.normWord($("df-q").value) !== q) return; sugList = D.parseSuggest(r.json, q); sugI = -1; showSug(); }).catch(function () {});
		}, 220);
	});
	$("df-q").addEventListener("keydown", function (e) {
		if ($("df-sug").hidden) return;
		if (e.key === "ArrowDown") { sugI = Math.min(sugList.length - 1, sugI + 1); showSug(); e.preventDefault(); }
		else if (e.key === "ArrowUp") { sugI = Math.max(-1, sugI - 1); showSug(); e.preventDefault(); }
		else if (e.key === "Escape") { hideSug(); e.stopPropagation(); }
		else if (e.key === "Enter" && sugI >= 0) { e.preventDefault(); lookup(sugList[sugI]); }
	});
	$("df-q").addEventListener("blur", function () { setTimeout(hideSug, 180); });
	$("df-sug").addEventListener("mousedown", function (e) { var li = e.target.closest("[data-w]"); if (li) { e.preventDefault(); lookup(li.getAttribute("data-w")); } });

	/* ---------- events ---------- */
	$("df-form").addEventListener("submit", function (e) { e.preventDefault(); lookup($("df-q").value); });
	root.addEventListener("click", function (e) {
		var t = e.target.closest("button, a");
		if (!t || !root.contains(t)) return;
		var w = t.getAttribute("data-w");
		if (w && t.tagName === "A" && (e.ctrlKey || e.metaKey || e.shiftKey || e.button)) return;   // open in a new tab as usual
		if (w) { e.preventDefault(); lookup(w, { scroll: true }); return; }
		if (t.hasAttribute("data-pos")) { posShow = t.getAttribute("data-pos"); stopRead(); renderSenses(); return; }
		if (t.hasAttribute("data-more")) { var k = t.getAttribute("data-more"); expanded[k] = !expanded[k]; renderSenses(); return; }
		if (t.hasAttribute("data-relall")) { var g = $("df-rel").relGroups[+t.getAttribute("data-relall")]; t.parentNode.innerHTML = chips(g[1]); return; }
		if (t.hasAttribute("data-rec")) { playRec(+t.getAttribute("data-rec")); return; }
		if (t.hasAttribute("data-del")) { var old = S.saved.slice(), dw = t.getAttribute("data-del"); S.saved = D.removeSaved(S.saved, dw); save(); renderSaved(); paintSaveBtn(); undoToast("Removed " + dw, function () { S.saved = old; }); return; }
		if (t.hasAttribute("data-q")) { answer(+t.getAttribute("data-q")); return; }
		if (t.getAttribute("role") === "tab") { setTab(t.id.replace("df-t-", "")); return; }
	});
	$("df-hear").addEventListener("click", function () { hear(); });
	$("df-save").addEventListener("click", toggleSave);
	$("df-copy").addEventListener("click", function () { if (cur) copy(D.plainText(cur), "Definitions copied"); });
	$("df-share").addEventListener("click", function () {
		if (!cur) return;
		var link = D.shareLink(cur.word), text = cur.word + ": " + cur.short.text;
		if (navigator.share && window.matchMedia && matchMedia("(pointer:coarse)").matches) navigator.share({ title: cur.word + " | MES Dictionary", text: text, url: link }).catch(function () {});
		else copy(link, "Link copied");
	});
	$("df-read").addEventListener("click", readAloud);
	$("df-trlang").innerHTML = D.TR_LANGS.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + "</option>"; }).join("");
	$("df-trlang").value = S.tr;
	$("df-trlang").addEventListener("change", function () { S.tr = this.value; save(); if (cur) renderTransList(); });
	$("df-tr").addEventListener("click", function () { if (cur) window.open(D.translateLink(cur.word, S.tr), "_blank", "noopener"); });
	$("df-fill").addEventListener("click", function () { if (filled) unfill(); else fill($("df-entry")); });
	$("df-fillclose").addEventListener("click", unfill);
	$("df-cardfill").addEventListener("click", function () { if (filled) unfill(); else fill($("df-cardbox")); });
	$("df-trgloss").addEventListener("change", renderTransList);
	$("df-trfilter").addEventListener("input", renderTransList);
	$("df-random").addEventListener("click", function () { var x = D.WOTD[Math.floor(Math.random() * D.WOTD.length)]; lookup(x[0], { scroll: true }); });
	$("df-recentclr").addEventListener("click", function () { S.recent = []; save(); renderRecent(); });
	$("df-sfilter").addEventListener("input", renderSaved);
	$("df-ssort").addEventListener("change", function () { S.sort = this.value; save(); renderSaved(); });
	$("df-slink").addEventListener("click", function () { if (!S.saved.length) { toast("No saved words yet"); return; } copy(D.listLink(S.saved.slice(0, 200).map(function (x) { return x.w; })), "Link to your list copied"); });
	$("df-scopy").addEventListener("click", function () { if (!S.saved.length) { toast("No saved words yet"); return; } copy(S.saved.map(function (x) { return x.w + (x.d ? " - " + x.d : ""); }).join("\n"), "List copied"); });
	$("df-sexport").addEventListener("click", function () {
		if (!S.saved.length) { toast("No saved words yet"); return; }
		var a = document.createElement("a"), url = URL.createObjectURL(new Blob([D.exportJson(S.saved)], { type: "application/json" }));
		a.href = url; a.download = "mes-dictionary-words-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove();
		setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
	});
	$("df-simport").addEventListener("change", function () {
		var f = this.files && this.files[0], inp = this;
		if (!f) return;
		f.text().then(function (txt) { var r = D.importText(S.saved, txt); S.saved = r.list; save(); renderSaved(); paintSaveBtn(); toast(r.added + (r.added === 1 ? " word" : " words") + " added"); inp.value = ""; });
	});
	$("df-sclear").addEventListener("click", function () { if (!S.saved.length) return; var old = S.saved.slice(); S.saved = []; save(); renderSaved(); paintSaveBtn(); undoToast("Cleared your list", function () { S.saved = old; }); });
	$("df-flash").addEventListener("click", flip);
	$("df-again").addEventListener("click", function () { gradeCard(false); });
	$("df-knew").addEventListener("click", function () { gradeCard(true); });
	$("df-cardhear").addEventListener("click", function () { if (card) say(card.w, { rate: 0.9 }); });
	$("df-qnext").addEventListener("click", newQuiz);
	$("df-wotdchip").addEventListener("click", function (e) { e.stopPropagation(); lookup(this.getAttribute("data-w"), { scroll: true }); });
	window.addEventListener("popstate", function (e) { var w = e.state && e.state.w || D.parseQuery(location.search, location.pathname).w; if (w) lookup(w, { noHistory: true }); });
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && filled) { unfill(); return; }
		var tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
		if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
		if (tab === "cards" && !$("df-p-cards").hidden && card && (filled === $("df-cardbox") || isVisible($("df-cardbox")))) {
			if (e.key === " ") { e.preventDefault(); flip(); return; }
			if (e.key === "1") { gradeCard(false); return; }
			if (e.key === "2") { gradeCard(true); return; }
		}
		if (!cur) return;
		var k = e.key.toLowerCase();
		if (k === "h") hear(); else if (k === "s") toggleSave(); else if (k === "r") readAloud(); else if (k === "w") { if (filled) unfill(); else fill($("df-entry")); }
	});
	function isVisible(el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }

	/* ---------- start ---------- */
	renderWotd(); renderRecent(); renderSaved();
	var q = D.parseQuery(location.search, location.pathname);
	if (q.list && q.list.length) {
		var fresh = q.list.filter(function (w) { return !isSaved(w); });
		msg("This link has a list of " + q.list.length + (q.list.length === 1 ? " word" : " words") + ": " + esc(q.list.slice(0, 12).join(", ")) + (q.list.length > 12 ? "…" : "") +
			(fresh.length ? ' <button type="button" class="tu-btn tu-btn--primary" id="df-addlist">Add ' + fresh.length + " to my words</button>" : " (all already in your words)"), "info");
		if (fresh.length) $("df-addlist").onclick = function () {
			fresh.slice().reverse().forEach(function (w) { S.saved = D.addSaved(S.saved, { w: w }); });
			save(); renderSaved(); msg(""); toast(fresh.length + " words added: meanings fill in as you look them up");
			setTab("saved"); $("df-mine").scrollIntoView({ behavior: "smooth" });
			// fetch the short meanings in the background, a few at a time, so flashcards and the quiz work
			var todo = fresh.slice(0, 60);
			(function pump() {
				var w = todo.shift(); if (!w) return;
				fetchEntry(w).then(function (e) { if (e && !e.missing) { var i = D.indexOfWord(S.saved, w); if (i >= 0 && !S.saved[i].d) { S.saved[i].d = e.short.text; S.saved[i].p = e.short.pos; save(); renderSaved(); } } }).catch(function () {}).then(function () { setTimeout(pump, 350); });
			})();
		};
		if (q.w) lookup(q.w, { replace: true, keepUrl: true, quiet: true });
	} else if (q.w) lookup(q.w, { replace: true });
	else lookup(D.wordOfDay(new Date()).w, { noHistory: true, quiet: true });
})();
