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

/* MES Pronounce (mes.fm/pronounce): UI. Pure helpers are MESPron (lib.js) + the Speed Reader's SRLib (voices, voice-failure check).
   Dictionary = CMU Pronouncing Dictionary shards in /pronounce/data/<xx>.json (build_pronounce_data.py); recordings + extra IPA from
   dictionaryapi.dev (Wikimedia Commons audio). Settings + recent words: localStorage mes-pronounce:v1. */
(function () {
	"use strict";
	var P = window.MESPron, SR = window.SRLib;
	function $(id) { return document.getElementById(id); }
	var root = $("pr");
	if (!root || !P || !SR) return;
	var KEY = "mes-pronounce:v1", BADKEY = "mes-speedreader:badvoices";   // bad voices are shared with the Speed Reader (same device, same voices)
	var hasTTS = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
	var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;

	/* ---------- state ---------- */
	var DEF = { lang: "en", accent: "", voice: "", rate: 1, pitch: 1, vol: 1, rep: 1, gap: 800, recent: [], last: "" };
	var S = (function () { try { var o = JSON.parse(localStorage.getItem(KEY) || "{}"); return Object.assign({}, DEF, o && typeof o === "object" ? o : {}); } catch (e) { return Object.assign({}, DEF); } })();
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var bad = (function () { try { return SR.pruneBadVoices(JSON.parse(localStorage.getItem(BADKEY) || "{}"), Date.now()); } catch (e) { return {}; } })();
	function saveBad() { try { localStorage.setItem(BADKEY, JSON.stringify(bad)); } catch (e) {} }
	var Q = P.parseQuery(location.search);
	if (Q.accent) S.accent = Q.accent;
	if (Q.rate) S.rate = Q.rate;

	var cur = { text: "", single: true, word: "", forms: [], fi: 0, est: false, toks: [], wordData: [], api: null };
	var loop = false;

	function toast(msg) { var t = $("pr-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function copy(text) {
		var ok = function () { toast("Copied"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Could not copy"); } ta.remove(); }
	}

	/* ---------- dictionary ---------- */
	var shards = {};
	function shard(w) {
		var k = P.shardOf(w);
		if (!shards[k]) shards[k] = fetch(P.shardUrl(w)).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { delete shards[k]; return {}; });
		return shards[k];
	}
	function entryFor(word) {
		var k = P.normWord(word);
		if (!k || !/[a-z]/.test(k)) return Promise.resolve(null);
		return shard(k).then(function (d) {
			if (d[k]) return d[k];
			var k2 = k.replace(/^'+|'+$/g, "");
			if (k2 !== k && k2) return entryFor(k2);
			var fb = P.fallbacks(k), i = 0;
			function next() {
				if (i >= fb.length) return null;
				var f = fb[i++];
				if (Array.isArray(f[0])) {     // a hyphenated word: join the parts
					return Promise.all(f[0].map(entryFor)).then(function (es) { return es.every(Boolean) ? es.map(function (e) { return e.split("|")[0]; }).join(" ") : next(); });
				}
				return shard(f[0]).then(function (d2) { var e = d2[f[0]]; return e ? e.split("|").map(function (p) { return f[1] ? p + " " + f[1] : p; }).join("|") : next(); });
			}
			return next();
		});
	}
	var apiCache = {};
	function dictApi(word) {
		var w = P.normWord(word);
		if (!/^[a-z][a-z' -]{0,40}$/.test(w)) return Promise.resolve(null);
		if (apiCache[w]) return apiCache[w];
		try { var c = sessionStorage.getItem("mes-pron:api:" + w); if (c) return (apiCache[w] = Promise.resolve(JSON.parse(c))); } catch (e) {}
		var url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(w);
		// the service sometimes answers 400 (without CORS headers, so it looks like a network error): try once more
		function get(n) { return fetch(url).then(function (r) { if (r.status === 404) return []; if (!r.ok) throw new Error("http " + r.status); return r.json(); }).catch(function (e) { if (n) return new Promise(function (res) { setTimeout(res, 1200); }).then(function () { return get(n - 1); }); throw e; }); }
		apiCache[w] = get(2).then(function (r) { return r; })
			.then(function (j) { var p = P.parseDictApi(j); try { sessionStorage.setItem("mes-pron:api:" + w, JSON.stringify(p)); } catch (e) {} return p; })
			.catch(function () { delete apiCache[w]; return null; });
		return apiCache[w];
	}

	/* ---------- voices ---------- */
	var voices = [], dn = null;
	try { dn = new Intl.DisplayNames(["en"], { type: "language" }); } catch (e) {}
	function langName(code) { try { return dn ? dn.of(code) : code; } catch (e) { return code; } }
	function vLang(v) { return String(v.lang || "").replace("_", "-"); }
	function vBase(v) { return vLang(v).split("-")[0].toLowerCase(); }
	function vAccent(v) { return vBase(v) === "en" ? P.accentOf(v.lang, v.name) : vLang(v).toLowerCase(); }
	function accentName(id) {
		if (S.lang === "en") return P.accentLabel(id);
		var reg = id.split("-")[1];
		if (!reg) return langName(id);
		try { return new Intl.DisplayNames(["en"], { type: "region" }).of(reg.toUpperCase()); } catch (e) { return id; }
	}
	function langVoices() { return voices.filter(function (v) { return vBase(v) === S.lang && !P.isNovelty(v.name); }); }
	function byKey(k) { for (var i = 0; i < voices.length; i++) if (SR.voiceKey(voices[i]) === k) return voices[i]; return null; }
	function voicesOf(acc) { return langVoices().filter(function (v) { return vAccent(v) === acc; }); }
	function bestIn(list, lang) { return SR.pickVoice(list, lang || S.lang, navigator.language, bad) || list[0] || null; }
	function accentDefault() {
		var nav = String(navigator.language || "en-US");
		if (S.lang === "en") { var a = P.accentOf(nav, ""); return a && a !== "en" && voicesOf(a).length ? a : (voicesOf("us").length ? "us" : (langVoices()[0] ? vAccent(langVoices()[0]) : "us")); }
		var l = langVoices(); return l.length ? vAccent(bestIn(l)) : "";
	}
	function voice() {
		var v = byKey(S.voice);
		if (v && vBase(v) === S.lang && !bad[SR.voiceKey(v)]) return v;   // a voice picked by hand (novelty ones too)
		var list = voicesOf(S.accent).filter(function (x) { return !bad[SR.voiceKey(x)]; });
		v = bestIn(list.length ? list : langVoices().filter(function (x) { return !bad[SR.voiceKey(x)]; }));
		return v || null;
	}
	function voiceFor(acc) {
		if (!acc) return voice();
		var list = voicesOf(acc).filter(function (x) { return !bad[SR.voiceKey(x)]; });
		return list.length ? bestIn(list) : null;
	}
	function loadVoices() {
		try { voices = (speechSynthesis.getVoices() || []).filter(function (v) { return v && v.lang; }); } catch (e) { voices = []; }
		buildLangs();
		if (!S.accent || !voicesOf(S.accent).length) S.accent = accentDefault();
		buildAccents(); buildVoiceSel(); buildCmpAcc();
	}
	function buildLangs() {
		var sel = $("pr-langsel"), seen = { en: 1 }, list = [];
		voices.forEach(function (v) { var b = vBase(v); if (!seen[b]) { seen[b] = 1; list.push(b); } });
		list.sort(function (a, b) { return langName(a).localeCompare(langName(b)); });
		sel.innerHTML = '<option value="en">English (syllables, IPA, respelling)</option>' + list.map(function (b) { return '<option value="' + esc(b) + '">' + esc(langName(b)) + " (voice only)</option>"; }).join("");
		if (S.lang !== "en" && !seen[S.lang]) S.lang = "en";
		sel.value = S.lang;
	}
	function buildAccents() {
		var box = $("pr-accents"), ids = [], seen = {};
		if (S.lang === "en") P.ACCENTS.concat([["en"]]).forEach(function (a) { if (voicesOf(a[0]).length) ids.push(a[0]); });
		else langVoices().forEach(function (v) { var a = vAccent(v); if (!seen[a]) { seen[a] = 1; ids.push(a); } });
		box.innerHTML = ids.map(function (id) {
			return '<button type="button" class="tu-chip" data-acc="' + esc(id) + '" aria-pressed="' + (id === S.accent) + '">' + esc(accentName(id)) + ' <span class="pr-n">' + voicesOf(id).length + "</span></button>";
		}).join("");
		var note = $("pr-anote");
		if (!hasTTS) note.textContent = "This browser cannot speak (no speech synthesis). The syllables, IPA and recordings still work.";
		else if (!voices.length) note.textContent = "Waiting for the voices of this device…";
		else if (S.lang === "en") {
			var missing = ["us", "uk", "au", "in"].filter(function (a) { return !voicesOf(a).length; }).map(P.accentLabel);
			note.textContent = ids.length + " English accent" + (ids.length === 1 ? "" : "s") + " on this device." + (missing.length ? " Not on this device: " + missing.join(", ") + " (other devices and browsers have other voices; Edge and Chrome have many)." : "");
		} else note.textContent = langVoices().length + " " + langName(S.lang) + " voice" + (langVoices().length === 1 ? "" : "s") + " on this device. Syllables and IPA are only shown for English.";
	}
	function voiceLabel(v) { return v.name.replace(/^(Microsoft|Google)\s+/, "") + " · " + vLang(v) + (v.localService ? "" : " · online") + (bad[SR.voiceKey(v)] ? " · ⚠ didn't speak here" : ""); }
	function buildVoiceSel() {
		var sel = $("pr-voice");
		if (!voices.length) { sel.innerHTML = '<option value="">' + (hasTTS ? "No voices yet" : "No voices in this browser") + "</option>"; return; }
		var mine = voicesOf(S.accent), rest = langVoices().filter(function (v) { return mine.indexOf(v) < 0; }), others = voices.filter(function (v) { return vBase(v) !== S.lang && !P.isNovelty(v.name); });
		function opts(list) { return list.map(function (v) { return '<option value="' + esc(SR.voiceKey(v)) + '">' + esc(voiceLabel(v)) + "</option>"; }).join(""); }
		var html = '<option value="">Automatic (best ' + esc(accentName(S.accent) || langName(S.lang)) + " voice)</option>";
		if (mine.length) html += '<optgroup label="' + esc(accentName(S.accent)) + '">' + opts(mine) + "</optgroup>";
		if (rest.length) html += '<optgroup label="Other ' + esc(langName(S.lang)) + ' accents">' + opts(rest) + "</optgroup>";
		var fun = voices.filter(function (v) { return vBase(v) === S.lang && P.isNovelty(v.name); });
		if (others.length) html += '<optgroup label="Other languages">' + opts(others) + "</optgroup>";
		if (fun.length) html += '<optgroup label="Novelty voices">' + opts(fun) + "</optgroup>";
		sel.innerHTML = html;
		sel.value = byKey(S.voice) ? S.voice : "";
	}
	function setAccent(id, quiet) {
		S.accent = id; S.voice = ""; save();
		buildAccents(); buildVoiceSel();
		if (cur.single && !cur.est && S.lang === "en") {   // show the matching form (UK forms for British-type accents)
			var uk = P.accentIsUk(id), i = cur.forms.findIndex(function (f) { return f.uk === uk; });
			if (i >= 0 && cur.forms[cur.fi].uk !== uk) { cur.fi = i; renderWord(); }
		}
		if (!quiet) { var v = voice(); if (v) setNote("Voice: " + v.name + " (" + vLang(v) + ")."); }
	}

	/* ---------- speaking ---------- */
	var keep = [], run = 0, switches = 0;
	function setNote(t) { $("pr-vnote").textContent = t || ""; }
	function sleep(ms, my) { return new Promise(function (r) { setTimeout(function () { r(my === run); }, ms); }); }
	function speakOne(text, o) {
		o = o || {};
		return new Promise(function (resolve) {
			if (!hasTTS) return resolve({ why: "notts" });
			var v = o.voice !== undefined ? o.voice : voice();
			var u = new SpeechSynthesisUtterance(text);
			if (v) { u.voice = v; u.lang = v.lang; } else u.lang = S.lang === "en" ? "en-US" : S.lang;
			u.rate = Math.max(0.1, Math.min(10, o.rate || S.rate)); u.pitch = S.pitch; u.volume = S.vol;
			var started = false, t0 = 0, gotB = false, done = false, words = (String(text).match(/\S+/g) || []).length;
			u.onstart = function () { started = true; t0 = performance.now(); if (o.onstart) o.onstart(); };
			u.onboundary = function (e) { gotB = true; if (o.onboundary) o.onboundary(e); };
			u.onend = function () { finish(""); };
			u.onerror = function (e) { finish(e && e.error || "error"); };
			var wd = setTimeout(function () { if (!started && !done) { done = true; try { speechSynthesis.cancel(); } catch (e) {} end({ why: "nostart", voice: v }); } }, 4500);
			function finish(err) {
				if (done) return; done = true;
				var why = SR.speechFailure(err ? { error: err, started: started } : { started: started, ms: started ? performance.now() - t0 : 0, expectMs: words * 400 / u.rate, words: words, boundary: gotB });
				end({ why: why, err: err, voice: v });
			}
			function end(r) { clearTimeout(wd); var i = keep.indexOf(u); if (i >= 0) keep.splice(i, 1); resolve(r); }
			keep.push(u);
			try { speechSynthesis.speak(u); if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) { finish("error"); }
		});
	}
	// speak with voice-failure handling: a voice that makes no sound is remembered and replaced (up to 4 switches per play)
	function say(text, o, my) {
		o = o || {};
		return speakOne(text, o).then(function (r) {
			if (my !== run) return false;
			if (r.why && r.why !== "notts" && r.voice && switches < 4) {
				var k = SR.voiceKey(r.voice);
				bad[k] = { t: Date.now(), lang: vLang(r.voice) }; saveBad();
				switches++;
				var acc = vAccent(r.voice), nv = voiceFor(acc) || voice();
				if (S.voice === k) S.voice = "";
				buildVoiceSel();
				if (nv && SR.voiceKey(nv) !== k) {
					setNote("The voice " + r.voice.name + " did not make a sound here, so it was switched to " + nv.name + ".");
					var o2 = Object.assign({}, o, { voice: nv });
					return say(text, o2, my);
				}
				setNote("The voice " + r.voice.name + " did not make a sound here. Try another voice from the list.");
				return false;
			}
			if (r.why === "notts") setNote("This browser has no speech voices. Try the recordings below, or another browser.");
			return true;
		});
	}
	function stop() {
		run++; loop = loop;   // keep the Loop setting
		try { if (hasTTS) speechSynthesis.cancel(); } catch (e) {}
		try { au.pause(); } catch (e) {}
		busy(false); hl(-1);
	}
	function busy(on) { $("pr-stop").disabled = !on; root.classList.toggle("pr-busy", !!on); }
	function hl(i, kind) {
		var boxes = $("pr-syls").children;
		for (var k = 0; k < boxes.length; k++) boxes[k].classList.toggle("is-on", kind === "all" || k === i && kind !== "word");
		var wc = $("pr-sent").querySelectorAll(".pr-wc");
		for (var j = 0; j < wc.length; j++) wc[j].classList.toggle("is-on", kind === "word" && +wc[j].dataset.t === i || kind === "all");
	}
	function speechText() { return cur.text; }
	function play(mode) {
		if (!cur.text) return;
		stop();
		var my = ++run; switches = 0; busy(true);
		var reps = loop ? 1e9 : S.rep, r = 0;
		function once() {
			if (mode === "syl") return bySyllable(my);
			if (mode === "word") return byWord(my);
			return whole(mode === "slow" ? S.rate * 0.55 : S.rate, my);
		}
		function step() {
			if (my !== run) return;
			if (r >= reps) { busy(false); hl(-1); return; }
			(r++ ? sleep(S.gap, my) : Promise.resolve(true)).then(function (ok) { if (!ok) return; return once(); }).then(function () { if (my === run) step(); });
		}
		step();
	}
	function whole(rate, my) {
		var toks = cur.toks, gotB = false, fall = null;
		hl(-1, cur.single ? "all" : "");
		return say(speechText(), {
			rate: rate,
			onstart: function () {
				if (cur.single) { hl(-1, "all"); return; }
				// voices without word-boundary events: move the highlight by an estimate
				var words = toks.filter(function (t) { return t.word; }), i = 0, per = 60000 / 165 / rate;
				fall = setTimeout(function tick() { if (gotB || my !== run || i >= words.length) return; hl(words.indexOf(words[i]) >= 0 ? toks.indexOf(words[i]) : -1, "word"); fall = setTimeout(tick, per * Math.max(0.6, P.estimateSyllables(words[i].w) * 0.55)); i++; }, 60);
			},
			onboundary: function (e) {
				if (cur.single) return;
				gotB = true; clearTimeout(fall);
				var ci = e.charIndex || 0;
				for (var i = 0; i < toks.length; i++) if (toks[i].word && ci >= toks[i].s && ci < toks[i].e + 1) { hl(i, "word"); break; }
			}
		}, my).then(function () { clearTimeout(fall); if (my === run) hl(-1); });
	}
	function bySyllable(my) {
		var parts = sylTexts(), i = 0;
		function next() {
			if (my !== run) return Promise.resolve();
			if (i >= parts.length) { hl(-1, "all"); return sleep(350, my).then(function (ok) { return ok && say(speechText(), { rate: S.rate * 0.8 }, my); }).then(function () { if (my === run) hl(-1); }); }
			var k = i++; hl(k, "syl");
			return say(parts[k], { rate: S.rate * 0.75 }, my).then(function (ok) { return ok && sleep(260, my); }).then(function (ok) { return ok ? next() : null; });
		}
		return next();
	}
	function byWord(my) {
		var ws = cur.toks.map(function (t, i) { return [t, i]; }).filter(function (x) { return x[0].word; }), i = 0;
		function next() {
			if (my !== run || i >= ws.length) { hl(-1); return Promise.resolve(); }
			var x = ws[i++]; hl(x[1], "word");
			return say(x[0].w, { rate: S.rate * 0.85 }, my).then(function (ok) { return ok && sleep(Math.min(S.gap, 500), my); }).then(function (ok) { return ok ? next() : null; });
		}
		return next();
	}
	// what to say for each syllable: the respelling (lower case, so voices do not spell capitals out letter by letter)
	function sylTexts() {
		if (cur.est || !cur.forms.length) return P.spellingBreaks(cur.word, P.estimateSyllables(cur.word));
		return cur.forms[cur.fi].respell.map(function (x) { return x.toLowerCase().replace(/-/g, ""); });
	}

	/* ---------- recordings ---------- */
	var au = new Audio(), resolved = {};
	au.preload = "none";
	function commons(item) {
		if (!item.curid) return Promise.resolve("");
		if (resolved[item.curid]) return Promise.resolve(resolved[item.curid]);
		return fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&pageids=" + encodeURIComponent(item.curid))
			.then(function (r) { return r.json(); }).then(function (j) {
				var pg = j && j.query && j.query.pages && j.query.pages[item.curid], u = pg && pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].url;
				return (resolved[item.curid] = P.commonsMp3(u) || "");
			}).catch(function () { return ""; });
	}
	function playRec(item, btn) {
		stop();
		var my = run;
		au.volume = S.vol; au.playbackRate = Math.max(0.5, Math.min(2, S.rate));
		function tryUrl(u, last) {
			au.onerror = function () { if (my !== run) return; if (!last) commons(item).then(function (c) { if (c && my === run) tryUrl(c, true); else fail(); }); else fail(); };
			au.onended = function () { btn && btn.classList.remove("is-on"); busy(false); };
			au.src = u;
			btn && btn.classList.add("is-on"); busy(true);
			au.play().catch(function (e) { if (e && e.name === "NotAllowedError") { btn && btn.classList.remove("is-on"); busy(false); } });
		}
		function fail() { btn && btn.classList.remove("is-on"); busy(false); toast("That recording could not be played"); }
		tryUrl(item.url, !item.curid);
	}
	function renderApi(api, word) {
		var card = $("pr-reccard");
		if (!api || (!api.audio.length && !api.ipas.length && !api.meanings.length)) { card.hidden = true; return; }
		card.hidden = false;
		$("pr-reclist").innerHTML = api.audio.length ? api.audio.map(function (a, i) {
			return '<div class="pr-recitem"><button type="button" class="tu-btn pr-recbtn" data-rec="' + i + '">&#9654;&#65038; ' + esc(a.label) + "</button>" +
				(a.ipa ? '<span class="pr-recipa">' + esc(a.ipa) + "</span>" : "") +
				'<span class="pr-reclic">' + (a.license ? (a.licenseUrl ? '<a href="' + esc(a.licenseUrl) + '" target="_blank" rel="noopener">' + esc(a.license) + "</a>" : esc(a.license)) : "") +
				(a.source ? ' · <a href="' + esc(a.source) + '" target="_blank" rel="noopener">source</a>' : "") + "</span></div>";
		}).join("") : '<p class="tu-note">No recording of a real person for this word.</p>';
		$("pr-ipas").innerHTML = api.ipas.length ? '<p class="pr-ipasl"><b>Other transcriptions:</b> ' + api.ipas.map(function (x) { return '<span class="pr-ipa2">' + esc(x.ipa) + (x.accent ? " <i>" + esc(P.AUDIO_LABEL[x.accent] || x.accent) + "</i>" : "") + "</span>"; }).join(" ") + "</p>" : "";
		$("pr-mean").innerHTML = api.meanings.length ? '<p class="pr-meanh"><b>Meaning</b> (to tell apart words that sound alike):</p><ul>' + api.meanings.map(function (m) { return "<li><i>" + esc(m.pos) + "</i> " + esc(m.defs[0]) + "</li>"; }).join("") + "</ul>" : "";
		card._api = api;
	}

	/* ---------- showing a word or a sentence ---------- */
	var showSeq = 0;
	function show(text, opts) {
		opts = opts || {};
		text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
		if (!text) return Promise.resolve();
		var my = ++showSeq;
		cur.text = text;
		cur.toks = P.tokens(text);
		var words = cur.toks.filter(function (t) { return t.word; });
		cur.single = words.length <= 1;
		cur.word = words.length ? words[0].w : text;
		$("pr-word").textContent = text;
		$("pr-word").classList.toggle("pr-word--long", text.length > 18);
		$("pr-byword").hidden = cur.single; $("pr-bysyl").hidden = !cur.single || S.lang !== "en";
		if (!opts.noUrl) { try { history.replaceState(null, "", location.pathname + "?" + P.buildQuery({ q: text })); } catch (e) {} }
		S.last = text; save();
		if (S.lang !== "en") { renderForeign(); return Promise.resolve(); }
		if (cur.single) {
			return entryFor(cur.word).then(function (entry) {
				if (my !== showSeq) return;
				cur.forms = P.forms(cur.word, entry);
				cur.est = !cur.forms.length; cur.api = null;
				var uk = P.accentIsUk(S.accent), i = cur.forms.findIndex(function (f) { return f.label === "Usual"; });
				if (i < 0) i = cur.forms.findIndex(function (f) { return f.uk === uk; });
				cur.fi = Math.max(0, i);
				renderWord();
				$("pr-reccard").hidden = true;
				// ask dictionaryapi.dev only once the word has settled (it answers 400 to bursts while someone is typing)
				setTimeout(function () { if (my === showSeq) dictApi(cur.word).then(function (api) { if (my !== showSeq) return; cur.api = api; renderApi(api, cur.word); if (cur.est) renderWord(); }); }, opts.now ? 0 : 900);
			});
		}
		var uniq = words.map(function (t) { return t.key; });
		return Promise.all(uniq.map(entryFor)).then(function (entries) {
			if (my !== showSeq) return;
			cur.wordData = words.map(function (t, i) { var f = P.forms(t.w, entries[i]); return { t: t, forms: f }; });
			renderSentence();
			$("pr-reccard").hidden = true;
		});
	}
	function ord(n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"); }
	function renderWord() {
		$("pr-sent").hidden = true; $("pr-syls").hidden = false; $("pr-spellline").hidden = false; $("pr-soundcard").hidden = false;
		var tabs = $("pr-forms"), f = cur.forms[cur.fi], est = $("pr-est");
		tabs.innerHTML = cur.forms.length > 1 ? cur.forms.map(function (x, i) {
			return '<button type="button" role="tab" class="pr-ftab" data-fi="' + i + '" aria-selected="' + (i === cur.fi) + '">' + esc(x.label) + '<span class="pr-ftabi">' + esc(x.ipa) + "</span></button>";
		}).join("") : "";
		if (!f) {
			var n = P.estimateSyllables(cur.word), parts = P.spellingBreaks(cur.word, n);
			$("pr-syls").innerHTML = n ? parts.map(function (p, i) { return '<span class="pr-syl pr-s0" data-i="' + i + '"><b>' + esc(p) + "</b></span>"; }).join("") : "";
			var apiIpa = cur.api && cur.api.ipas.length ? cur.api.ipas.map(function (x) { return x.ipa + (x.accent ? " (" + (P.AUDIO_LABEL[x.accent] || x.accent) + ")" : ""); }).join(", ") : "";
			$("pr-resp").textContent = "—";
			$("pr-ipa").textContent = apiIpa || "not known";
			$("pr-count").textContent = n ? n + " (estimated from the spelling)" : "not a word the page knows (a number or a symbol?)";
			$("pr-spell").textContent = parts.join("·");
			$("pr-noteline").hidden = true;
			est.hidden = false;
			est.textContent = "“" + cur.word + "” is not in the dictionary, so the syllables are an estimate from the spelling" + (apiIpa ? " and the IPA comes from dictionaryapi.dev." : ". The voices can still say it.");
			$("pr-seq").innerHTML = '<p class="tu-note">Not known for this word.</p>';
			return;
		}
		est.hidden = true;
		var n1 = f.syls.length, si = f.stress.indexOf(1);
		$("pr-syls").innerHTML = f.syls.map(function (s, i) {
			return '<button type="button" class="pr-syl pr-s' + s.stress + '" data-i="' + i + '" title="' + (s.stress === 1 ? "Stressed syllable" : s.stress === 2 ? "Lighter stress" : "Unstressed") + ': press to hear it"><b>' + esc(f.respell[i]) + '</b><small>' + esc(P.syllableIpa(s, f.uk)) + "</small></button>";
		}).join("");
		$("pr-resp").innerHTML = f.respell.map(function (r, i) { return f.stress[i] === 1 && n1 > 1 ? "<strong>" + esc(r) + "</strong>" : esc(r); }).join("-");
		$("pr-ipa").textContent = f.ipa;
		$("pr-count").textContent = n1 + (n1 > 1 && si >= 0 ? " · stress on the " + ord(si + 1) : "") + "   " + f.stress.map(function (s) { return s === 1 ? "●" : s === 2 ? "•" : "·"; }).join(" ");
		$("pr-spell").textContent = P.spellingBreaks(cur.word, n1).join("·");
		$("pr-noteline").hidden = !f.note && !f.uk;
		$("pr-note").textContent = (f.uk ? "British (UK) pronunciation, written by hand. " : "") + (f.note || "");
		var sounds = P.soundsOf(f.phones, f.uk);
		$("pr-seq").innerHTML = f.phones.map(function (ph) {
			var p = ph.replace(/\d/g, ""), g = (P.GUIDE[p] || ["", "", ""]).slice(), exs = g[1].split(",");
			if (exs.length > 1) g[1] = (/0$/.test(ph) ? exs[1] : exs[0]).trim();   // ə as in about, ʌ as in cup
			return '<button type="button" class="pr-snd' + (P.isVowel(ph) ? " pr-snd--v" : "") + '" data-ex="' + esc(g[1].split(",")[0].replace(/\s*\(.*\)/, "").trim()) + '" title="as in ' + esc(g[1]) + '"><b>' + esc(P.phoneIpa(ph, f.uk)) + '</b><span>' + esc(g[2]) + '</span><i>' + esc(g[1].split(",")[0]) + "</i></button>";
		}).join("") + (sounds.length ? "" : "");
	}
	function renderSentence() {
		$("pr-forms").innerHTML = ""; $("pr-syls").hidden = true; $("pr-spellline").hidden = true; $("pr-est").hidden = true; $("pr-soundcard").hidden = true;
		var resp = [], ipa = [], nsyl = 0, unknown = 0;
		var uk = P.accentIsUk(S.accent);
		var html = cur.wordData.map(function (d, i) {
			var f = d.forms.find(function (x) { return x.uk === uk; }) || d.forms[0];
			var tIdx = cur.toks.indexOf(d.t);
			if (f) { resp.push(f.respell.join("-")); ipa.push(f.ipa.slice(1, -1)); nsyl += f.syls.length; }
			else { unknown++; var n = P.estimateSyllables(d.t.w); nsyl += n; resp.push(P.spellingBreaks(d.t.w, n).join("-")); ipa.push("?"); }
			return '<button type="button" class="pr-wc" data-t="' + tIdx + '" title="Open this word"><b>' + esc(d.t.w) + "</b><span>" + esc(f ? f.respell.join("-") : "?") + "</span><small>" + esc(f ? f.ipa : "not in the dictionary") + "</small></button>";
		}).join("");
		$("pr-sent").innerHTML = html + '<p class="tu-note pr-senth">Press a word to open it on its own.</p>';
		$("pr-sent").hidden = false;
		$("pr-resp").textContent = resp.join("  ");
		$("pr-ipa").textContent = "/" + ipa.join(" ") + "/";
		$("pr-count").textContent = nsyl + " in " + cur.wordData.length + " words" + (unknown ? " (" + unknown + " not in the dictionary: estimated)" : "");
		$("pr-noteline").hidden = true;
	}
	function renderForeign() {
		$("pr-forms").innerHTML = ""; $("pr-syls").hidden = true; $("pr-spellline").hidden = true; $("pr-soundcard").hidden = true; $("pr-reccard").hidden = true;
		var words = cur.toks.filter(function (t) { return t.word; });
		$("pr-sent").innerHTML = cur.single ? "" : words.map(function (t) { return '<button type="button" class="pr-wc" data-t="' + cur.toks.indexOf(t) + '" data-nopen="1"><b>' + esc(t.w) + "</b></button>"; }).join("");
		$("pr-sent").hidden = cur.single;
		$("pr-resp").textContent = "—"; $("pr-ipa").textContent = "only shown for English"; $("pr-count").textContent = "—"; $("pr-noteline").hidden = true;
		var e = $("pr-est"); e.hidden = false; e.textContent = langName(S.lang) + ": the voices read it; syllables and IPA are only worked out for English.";
	}
	function remember(text) {
		S.recent = P.addRecent(S.recent, text, 16); save(); renderRecent();
	}
	function renderRecent() {
		var row = $("pr-recentrow"), box = $("pr-recent");
		row.hidden = !S.recent.length;
		box.innerHTML = S.recent.map(function (w) { return '<button type="button" class="tu-chip" data-q="' + esc(w) + '">' + esc(w.length > 28 ? w.slice(0, 27) + "…" : w) + "</button>"; }).join("");
	}

	/* ---------- compare ---------- */
	var CMP_EX = [["tomato", "us", "tomato", "uk"], ["schedule", "us", "schedule", "uk"], ["either", "us", "either", "uk"], ["privacy", "us", "privacy", "uk"], ["water", "us", "water", "au"],
		["affect", "", "effect", ""], ["desert", "", "dessert", ""], ["quiet", "", "quite", ""], ["lose", "", "loose", ""], ["then", "", "than", ""], ["accept", "", "except", ""], ["live", "", "leave", ""]];
	function buildCmpAcc() {
		["pr-caa", "pr-cba"].forEach(function (id) {
			var sel = $(id), v = sel.value;
			var ids = P.ACCENTS.map(function (a) { return a[0]; }).filter(function (a) { return voicesOf(a).length; });
			sel.innerHTML = '<option value="">My accent</option>' + ids.map(function (a) { return '<option value="' + a + '">' + esc(P.accentLabel(a)) + "</option>"; }).join("");
			if (v) sel.value = v;
		});
	}
	function cmpSide(s) {
		var w = $(s === "a" ? "pr-ca" : "pr-cb").value.trim(), acc = $(s === "a" ? "pr-caa" : "pr-cba").value || S.accent, out = $(s === "a" ? "pr-cao" : "pr-cbo");
		if (!w) { out.innerHTML = ""; return Promise.resolve(); }
		return entryFor(w).then(function (e) {
			var fs = P.forms(w, e), uk = P.accentIsUk(acc), f = fs.find(function (x) { return x.uk === uk && x.label !== "Usual"; }) || fs[0];
			if (!f) { out.innerHTML = '<p class="pr-cw">' + esc(w) + '</p><p class="tu-note">Not in the dictionary.</p>'; return; }
			out.innerHTML = '<p class="pr-cw">' + esc(w) + '</p><div class="pr-csyl">' + f.respell.map(function (r, i) { return '<span class="pr-syl pr-s' + f.stress[i] + '"><b>' + esc(r) + "</b></span>"; }).join("") + '</div><p class="pr-cipa">' + esc(f.ipa) + " <i>" + esc(f.uk ? "UK form" : f.label) + "</i></p>";
		});
	}
	function cmpPlay(which) {
		stop();
		var my = ++run; switches = 0; busy(true);
		var seq = which === "both" ? ["a", "b"] : [which], i = 0, alt = $("pr-calt").getAttribute("aria-pressed") === "true";
		function next() {
			if (my !== run) return;
			if (i >= seq.length) { if (which === "both" && alt) { i = 0; return sleep(S.gap + 300, my).then(function (ok) { if (ok) next(); }); } busy(false); hl(-1); return; }
			var s = seq[i++], w = $(s === "a" ? "pr-ca" : "pr-cb").value.trim(), acc = $(s === "a" ? "pr-caa" : "pr-cba").value;
			var side = $(s === "a" ? "pr-sa" : "pr-sb");
			$("pr-sa").classList.toggle("is-on", s === "a"); $("pr-sb").classList.toggle("is-on", s === "b");
			if (!w) return next();
			var v = acc ? voiceFor(acc) : voice();
			if (acc && !v) setNote("No " + P.accentLabel(acc) + " voice on this device, so your own accent is used.");
			say(w, { voice: v || voice() }, my).then(function () { side.classList.remove("is-on"); return sleep(600, my); }).then(function (ok) { if (ok) next(); });
		}
		next();
	}

	/* ---------- practice (speech recognition) ---------- */
	var rec = null;
	function practice() {
		if (!Rec) return;
		if (rec) { try { rec.abort(); } catch (e) {} rec = null; $("pr-mic").classList.remove("is-on"); return; }
		stop();
		var v = voice(), r = new Rec();
		rec = r;
		r.lang = v ? vLang(v) : (S.lang === "en" ? "en-US" : S.lang);
		r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
		$("pr-mic").classList.add("is-on"); $("pr-pres").textContent = "Listening… say “" + cur.text + "”";
		$("pr-heard").innerHTML = "";
		r.onresult = function (e) {
			var res = e.results[0], alts = [];
			for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
			var m = P.heardMatch(cur.text, alts);
			$("pr-heard").innerHTML = alts.map(function (a, i) { return '<li class="' + (m.ok && i === m.i ? "is-ok" : "") + '">' + esc(a) + (res[i].confidence ? ' <small>' + Math.round(res[i].confidence * 100) + "%</small>" : "") + "</li>"; }).join("");
			if (m.ok) { $("pr-pres").innerHTML = '<b class="pr-ok">&#10003; Heard it right' + (m.i ? " (it was the browser's guess number " + (m.i + 1) + ")" : "") + ".</b>"; return; }
			$("pr-pres").innerHTML = "We heard “" + esc(alts[0] || "") + "”." + (m.score ? " " + Math.round(m.score * 100) + "% of the words match." : " Try again, a little slower.");
			if (cur.single && alts[0]) {      // same sounds, other spelling (a homophone) counts as right
				Promise.all([entryFor(cur.text), entryFor(alts[0])]).then(function (es) {
					if (!es[0] || !es[1]) return;
					var a = es[0].split("|").map(function (x) { return x.replace(/\d/g, ""); }), b = es[1].split("|").map(function (x) { return x.replace(/\d/g, ""); });
					if (a.some(function (x) { return b.indexOf(x) >= 0; })) $("pr-pres").innerHTML = '<b class="pr-ok">&#10003; That sounds right.</b> The browser wrote “' + esc(alts[0]) + "”, which sounds the same.";
				});
			}
		};
		r.onerror = function (e) {
			var m = { "not-allowed": "The microphone is blocked for this site. Allow it in the browser's address bar and try again.", "no-speech": "Nothing was heard. Press the microphone and speak a little louder.", "network": "The speech service could not be reached (it needs the internet).", "audio-capture": "No microphone was found." }[e.error];
			$("pr-pres").textContent = m || "Speech recognition stopped (" + e.error + ").";
		};
		r.onend = function () { rec = null; $("pr-mic").classList.remove("is-on"); if (/^Listening/.test($("pr-pres").textContent)) $("pr-pres").textContent = "Nothing was heard. Try again."; };
		try { r.start(); } catch (e) { rec = null; $("pr-mic").classList.remove("is-on"); $("pr-pres").textContent = "Could not start the microphone."; }
	}

	/* ---------- fill window / full screen ---------- */
	var stage = $("pr-stage");
	function setFill(on) {
		stage.classList.toggle("pr-fill", on); document.documentElement.classList.toggle("pr-fill-open", on);
		$("pr-fill").setAttribute("aria-pressed", String(on)); $("pr-fill").innerHTML = on ? "&#10005; Close" : "&#10530; Fill window";
	}
	function fullScreen() {
		if (document.fullscreenElement) { document.exitFullscreen(); return; }
		if (stage.requestFullscreen) stage.requestFullscreen().catch(function () { setFill(true); }); else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen(); else setFill(true);
	}
	document.addEventListener("fullscreenchange", function () { stage.classList.toggle("pr-fsmode", document.fullscreenElement === stage); });

	/* ---------- wiring ---------- */
	function go(text, speak) {
		$("pr-q").value = text;
		var p = show(text, { now: true });
		remember(text);
		if (speak) { if (hasTTS) play("normal"); }   // speak now, inside the click (the voice is set when the dictionary answers; speaking does not wait for it)
		return p;
	}
	$("pr-form").addEventListener("submit", function (e) { e.preventDefault(); var t = $("pr-q").value.trim(); if (t) go(t, true); });
	var deb;
	$("pr-q").addEventListener("input", function () { clearTimeout(deb); var t = this.value; deb = setTimeout(function () { if (t.trim()) show(t); }, 380); });
	root.addEventListener("click", function (e) {
		var t = e.target.closest("button, a"); if (!t || !root.contains(t)) return;
		if (t.dataset.q) { go(t.dataset.q, true); if (t.closest("#pr-cgrid")) stage.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
		if (t.dataset.acc) { setAccent(t.dataset.acc); return; }
		if (t.dataset.fi) { cur.fi = +t.dataset.fi; renderWord(); var f = cur.forms[cur.fi]; if (f && S.lang === "en") { var want = f.uk ? "uk" : "us"; if (P.accentIsUk(S.accent) !== f.uk && voicesOf(want).length) { setAccent(want, true); setNote("Switched to a " + P.accentLabel(want) + " voice for this form."); } } play("normal"); return; }
		if (t.classList.contains("pr-syl") && t.dataset.i !== undefined && t.closest("#pr-syls")) { var parts = sylTexts(), i = +t.dataset.i; stop(); var my = ++run; busy(true); hl(i, "syl"); say(parts[i], { rate: S.rate * 0.75 }, my).then(function () { if (my === run) { busy(false); hl(-1); } }); return; }
		if (t.classList.contains("pr-wc")) { if (t.dataset.nopen) return; var tok = cur.toks[+t.dataset.t]; if (tok) { var back = cur.text; go(tok.w, true); setNote("From the sentence: “" + back + "”"); } return; }
		if (t.classList.contains("pr-snd")) { stop(); var my2 = ++run; busy(true); say(t.dataset.ex, {}, my2).then(function () { if (my2 === run) busy(false); }); return; }
		if (t.dataset.rec !== undefined) { var api = $("pr-reccard")._api; if (api) playRec(api.audio[+t.dataset.rec], t); return; }
		if (t.dataset.cplay) { cmpPlay(t.dataset.cplay); return; }
		if (t.dataset.cmp) { var ex = CMP_EX[+t.dataset.cmp]; $("pr-ca").value = ex[0]; $("pr-cb").value = ex[2]; setSel("pr-caa", ex[1]); setSel("pr-cba", ex[3]); cmpSide("a"); cmpSide("b"); cmpPlay("both"); return; }
		if (t.dataset.kex) { stop(); var my3 = ++run; busy(true); say(t.dataset.kex, {}, my3).then(function () { if (my3 === run) busy(false); }); return; }
	});
	function setSel(id, v) { var s = $(id); s.value = v; if (s.value !== v) s.value = ""; }
	$("pr-play").addEventListener("click", function () { play("normal"); });
	$("pr-slow").addEventListener("click", function () { play("slow"); });
	$("pr-bysyl").addEventListener("click", function () { play("syl"); });
	$("pr-byword").addEventListener("click", function () { play("word"); });
	$("pr-stop").addEventListener("click", stop);
	$("pr-loop").addEventListener("click", function () { loop = !loop; this.setAttribute("aria-pressed", String(loop)); });
	$("pr-fill").addEventListener("click", function () { setFill(!stage.classList.contains("pr-fill")); });
	$("pr-fs").addEventListener("click", fullScreen);
	$("pr-share").addEventListener("click", function () { copy(location.origin + "/pronounce?" + P.buildQuery({ q: cur.text, accent: S.accent && S.lang === "en" ? S.accent : "" })); });
	$("pr-ipacopy").addEventListener("click", function () { copy($("pr-ipa").textContent); });
	$("pr-recentclr").addEventListener("click", function () { S.recent = []; save(); renderRecent(); });
	$("pr-langsel").addEventListener("change", function () { S.lang = this.value; S.voice = ""; S.accent = ""; save(); loadVoices(); show(cur.text, { noUrl: true }); });
	$("pr-voice").addEventListener("change", function () {
		S.voice = this.value; var v = byKey(S.voice);
		if (v) { if (vBase(v) !== S.lang) { S.lang = vBase(v); buildLangs(); } S.accent = vAccent(v); }
		save(); buildAccents(); if (v) setNote("Voice: " + v.name + " (" + vLang(v) + ")."); show(cur.text, { noUrl: true });
	});
	function slider(id, key, fmt) {
		var el = $(id), out = $(id + "-o");
		el.value = S[key]; out.textContent = fmt(+el.value);
		el.addEventListener("input", function () { S[key] = +el.value; out.textContent = fmt(S[key]); save(); });
	}
	slider("pr-rate", "rate", function (v) { return v.toFixed(2).replace(/0$/, "") + "×"; });
	slider("pr-pitch", "pitch", function (v) { return v.toFixed(2).replace(/0$/, ""); });
	slider("pr-vol", "vol", function (v) { return Math.round(v * 100) + "%"; });
	$("pr-rep").value = String(S.rep); $("pr-rep").addEventListener("change", function () { S.rep = +this.value || 1; save(); });
	$("pr-gap").value = String(S.gap); if (!$("pr-gap").value) $("pr-gap").value = "800";
	$("pr-gap").addEventListener("change", function () { S.gap = +this.value || 800; save(); });
	$("pr-vreset").addEventListener("click", function () { S.rate = 1; S.pitch = 1; S.vol = 1; save(); ["pr-rate", "pr-pitch", "pr-vol"].forEach(function (id) { var el = $(id); el.value = 1; el.dispatchEvent(new Event("input")); }); });
	$("pr-ca").addEventListener("input", function () { cmpSide("a"); });
	$("pr-cb").addEventListener("input", function () { cmpSide("b"); });
	$("pr-caa").addEventListener("change", function () { cmpSide("a"); });
	$("pr-cba").addEventListener("change", function () { cmpSide("b"); });
	$("pr-cboth").addEventListener("click", function () { cmpPlay("both"); });
	$("pr-calt").addEventListener("click", function () { var on = this.getAttribute("aria-pressed") !== "true"; this.setAttribute("aria-pressed", String(on)); });
	if (Rec) $("pr-mic").addEventListener("click", practice);
	else { $("pr-mic").disabled = true; $("pr-pnote").textContent = "This browser has no speech recognition. Chrome, Edge and Safari have it (on a computer or a phone)."; }
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") { if (stage.classList.contains("pr-fill")) { setFill(false); return; } stop(); return; }
		var tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
		if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " " && !(tg && tg.tagName === "BUTTON")) { e.preventDefault(); play("normal"); }
		else if (e.key === "l" || e.key === "L") $("pr-loop").click();
		else if (e.key === "w" || e.key === "W") $("pr-fill").click();
		else if (e.key === "f" || e.key === "F") fullScreen();
	});

	/* ---------- static lists ---------- */
	var EX = ["pronunciation", "tomato", "schedule", "worcestershire", "quinoa", "colonel", "either", "record", "read", "Wednesday", "How are you today?"];
	$("pr-ex").innerHTML = EX.map(function (w) { return '<button type="button" class="tu-chip" data-q="' + esc(w) + '">' + esc(w) + "</button>"; }).join("");
	$("pr-cmpex").innerHTML = CMP_EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-cmp="' + i + '">' + esc(x[0] === x[2] ? x[0] + ": " + P.accentLabel(x[1]) + " / " + P.accentLabel(x[3]) : x[0] + " / " + x[2]) + "</button>"; }).join("");
	$("pr-cgrid").innerHTML = P.COMMON.map(function (c) { return '<button type="button" class="pr-cw2" data-q="' + esc(c[0]) + '"><b>' + esc(c[0]) + "</b><span>" + esc(c[1]) + "</span></button>"; }).join("");
	var keyRows = Object.keys(P.GUIDE).map(function (p) { var g = P.GUIDE[p]; return "<tr><td class=\"pr-kipa\">" + esc(g[0]) + "</td><td>" + esc(g[2]) + "</td><td>" + esc(g[1]) + '</td><td><button type="button" class="pr-mini" data-kex="' + esc(g[1].split(",")[0].replace(/\s*\(.*\)/, "").trim()) + '" aria-label="Hear ' + esc(g[1]) + '">&#9654;&#65038;</button></td></tr>'; });
	$("pr-key").querySelector("tbody").innerHTML = keyRows.join("");
	renderRecent();

	/* ---------- start ---------- */
	if (hasTTS) {
		loadVoices();
		try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; }
		var tries = 0, iv = setInterval(function () { if (voices.length || ++tries > 20) clearInterval(iv); if (!voices.length) loadVoices(); }, 250);
	} else loadVoices();
	if (window.MESVoicePicker) MESVoicePicker.enhance($("pr-voice"), { sample: "Hello, this is how I sound." });
	$("pr-ca").value = "tomato"; $("pr-cb").value = "tomato";
	setTimeout(function () { setSel("pr-caa", "us"); setSel("pr-cba", "uk"); cmpSide("a"); cmpSide("b"); }, 600);
	var first = Q.q || S.last || "pronunciation";
	$("pr-q").value = first;
	show(first, { noUrl: !Q.q });
	window.MESPronDebug = { cur: cur, S: S, show: show, play: play, voices: function () { return voices; } };
})();
