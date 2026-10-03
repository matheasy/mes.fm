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
	// best voice for a text language (falls back to the browser's language, then the default voice); returns the voice or null
	function pickVoice(voices, lang, browserLang) {
		var best = null, bs = -1e9;
		for (var i = 0; i < voices.length; i++) {
			var sc = voiceScore(voices[i], lang, browserLang);
			if (sc > bs) { bs = sc; best = voices[i]; }
		}
		return best;
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
		detectLang: detectLang, voiceScore: voiceScore, pickVoice: pickVoice, parseParams: parseParams, buildParams: buildParams
	};
})();
if (typeof module !== "undefined" && module.exports) module.exports = SRLib;
