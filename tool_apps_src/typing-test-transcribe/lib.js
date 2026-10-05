/* MES Transcription Typing Test -- mes.fm/typing-test-transcribe
 * lib.js = pure logic: spoken passages, chunking, pacing, and the scoring of what you typed against what was said (word alignment +
 * character accuracy). Needs TT (typing-test/lib.js, prepended by the build) only for random-word dictation. Runs in node too:
 *   const TC = require('./tool_apps_src/typing-test-transcribe/lib.js');   tests: node tool_apps_src/typing-transcribe-tests.js
 */
var TC = (function () {
	"use strict";
	var TTlib = (typeof TT !== "undefined") ? TT : (typeof require === "function" ? require("../typing-test/lib.js") : null);

	/* ---------- spoken passages: meeting minutes, news, instructions, a courtroom-style record ---------- */
	var PASSAGES = {
		short: [
			"The meeting began at nine o'clock. All five members were present, and the minutes of the last meeting were approved without changes.",
			"Please remember to lock the front door when you leave, switch off the lights, and leave the keys with the security desk.",
			"The committee agreed to postpone the vote until next Thursday, so that every member has time to read the full report."
		],
		medium: [
			"Thank you all for coming. The first item on the agenda is the budget for the next quarter. The finance team has prepared a summary, and copies are on the table. Please take a few minutes to read it, and then we will open the floor for questions and comments from the group.",
			"The witness stated that she arrived at the building shortly after seven in the evening. She said the front door was already unlocked and the hallway lights were on. When asked whether she saw anyone else, she replied that the only person she met was the night cleaner.",
			"To reset your password, open the settings page and choose the security tab. Enter your current password, then type a new one that is at least twelve characters long. A confirmation message will be sent to your email address, and you must click the link inside it within one hour."
		],
		long: [
			"Good morning, everyone, and welcome to the monthly planning meeting. Before we begin, I would like to thank the team for the hard work over the past four weeks. Sales are up by six percent, the new website launched on schedule, and the customer survey shows the highest satisfaction score we have ever recorded. There are three items today. First, we will review the hiring plan for the autumn. Second, we will discuss the move to the new office. Finally, we will agree who will lead the training sessions in November. Please keep your comments short, and note any action items so that they can be written into the minutes.",
			"The court will now come to order. Please be seated. This is the continuation of the hearing that was adjourned on Tuesday afternoon. Counsel for the plaintiff has asked to submit two additional documents into the record, and counsel for the defendant has been given the opportunity to examine them. Having reviewed both documents, the court finds that they are relevant and admits them as exhibits twelve and thirteen. The witness remains under oath. The clerk will remind the witness of the question that was pending when we adjourned, and we will then proceed with the cross examination.",
			"Welcome aboard. Before we depart, please take a moment to listen to the following safety information. Make sure your seat belt is fastened low and tight across your lap. Your life jacket is located under your seat, and you should only inflate it after you have left the aircraft. In the event of a sudden change in cabin pressure, oxygen masks will drop from the panel above you. Pull one mask toward you, place it firmly over your nose and mouth, and breathe normally. Please secure your own mask before helping anyone else."
		]
	};
	var LENGTHS = ["short", "medium", "long"];

	/* ---------- seeds ---------- */
	function newSeed() { return Math.random().toString(36).slice(2, 8); }
	function hashStr(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); }
	function passageFor(len, seed, avoid) {
		var list = PASSAGES[len] || PASSAGES.medium, i = hashStr(String(seed)) % list.length;
		if (avoid && list.length > 1 && list[i] === avoid) i = (i + 1) % list.length;
		return list[i];
	}
	function randomWords(n, diff, seed) { return TTlib.makeGenerator({ diff: diff || "medium", caps: false, punct: false, nums: false }, seed)(n).join(" "); }

	/* ---------- text -> what gets compared ---------- */
	function norm(s, strict) {
		s = String(s || "").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
		if (strict) return s.replace(/\s+/g, " ").trim();
		return s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/'(?=\s|$)|(?:^|\s)'/g, " ").replace(/\s+/g, " ").trim();
	}
	function words(s, strict) { var n = norm(s, strict); return n ? n.split(" ") : []; }

	/* ---------- edit distance (rolling rows) ---------- */
	function editDistance(a, b) {
		var n = a.length, m = b.length; if (!n) return m; if (!m) return n;
		var prev = new Array(m + 1), cur = new Array(m + 1), i, j;
		for (j = 0; j <= m; j++) prev[j] = j;
		for (i = 1; i <= n; i++) {
			cur[0] = i;
			for (j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			var t = prev; prev = cur; cur = t;
		}
		return prev[m];
	}

	/* word alignment: ops in order, each { t: "ok" | "sub" | "del" (a word that was said, not typed) | "ins" (typed, not said), r: said, w: typed } */
	function alignWords(ref, typed) {
		var n = ref.length, m = typed.length, D = [], i, j;
		for (i = 0; i <= n; i++) { D.push(new Array(m + 1)); D[i][0] = i; }
		for (j = 0; j <= m; j++) D[0][j] = j;
		for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (ref[i - 1] === typed[j - 1] ? 0 : 1));
		var ops = []; i = n; j = m;
		while (i > 0 || j > 0) {
			if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (ref[i - 1] === typed[j - 1] ? 0 : 1)) { ops.push({ t: ref[i - 1] === typed[j - 1] ? "ok" : "sub", r: ref[i - 1], w: typed[j - 1] }); i--; j--; }
			else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { ops.push({ t: "del", r: ref[i - 1] }); i--; }
			else { ops.push({ t: "ins", w: typed[j - 1] }); j--; }
		}
		return ops.reverse();
	}

	/* score(said, typed, strict, minutes): accuracy = 100 * (1 - character edit distance / characters said); net WPM = correct characters / 5 / minutes */
	function score(said, typed, strict, minutes) {
		var rw = words(said, strict), tw = words(typed, strict), rs = rw.join(" "), ts = tw.join(" ");
		var dist = editDistance(rs, ts), len = Math.max(1, rs.length);
		var ops = alignWords(rw, tw), c = { ok: 0, sub: 0, del: 0, ins: 0 };
		ops.forEach(function (o) { c[o.t]++; });
		var acc = Math.max(0, 100 * (1 - dist / len)), correct = Math.max(0, rs.length - dist);
		return { acc: acc, wpm: minutes > 0 ? (correct / 5) / minutes : 0, dist: dist, chars: rs.length, words: rw.length, ops: ops, ok: c.ok, wrong: c.sub, missed: c.del, extra: c.ins };
	}

	/* ---------- chunks: the text is spoken a phrase at a time ---------- */
	// n words per chunk (0 = a sentence at a time); chunks end early at a comma / full stop once they are at least half full
	function chunkify(text, n) {
		var toks = String(text || "").split(/\s+/).filter(Boolean), out = [], cur = [], start = 0;
		function flush() { if (cur.length) { out.push({ text: cur.join(" "), words: cur.length, start: start }); start += cur.length; cur = []; } }
		toks.forEach(function (t) {
			cur.push(t);
			var end = /[.!?]["')\]]*$/.test(t), clause = /[,;:]["')\]]*$/.test(t);
			if (n === 0) { if (end) flush(); }
			else if (cur.length >= n || (end && cur.length >= Math.ceil(n / 3)) || (clause && cur.length >= Math.ceil(n / 2))) flush();
		});
		flush();
		return out;
	}
	var PACES = [80, 100, 120, 140, 160, 180];
	// speech-synthesis rate for a target pace: stay close to natural speech and let the pauses between chunks do the slowing down
	function rateFor(wpm) { return Math.round(Math.max(0.8, Math.min(1.6, wpm / 150)) * 20) / 20; }
	// ms to wait after a chunk has been spoken so that, on average, the text arrives at `wpm`
	function gapAfter(chunkWords, wpm, spokenMs) { return Math.max(250, Math.round(chunkWords * 60000 / wpm - spokenMs)); }
	// rough length of a chunk spoken at `rate`, for the watchdog and for estimates before the real time is known
	function estSpokenMs(text, rate) { return Math.round((String(text).length * 62 + 400) / rate); }

	var api = { PASSAGES: PASSAGES, LENGTHS: LENGTHS, PACES: PACES, newSeed: newSeed, passageFor: passageFor, randomWords: randomWords, norm: norm, words: words, editDistance: editDistance,
		alignWords: alignWords, score: score, chunkify: chunkify, rateFor: rateFor, gapAfter: gapAfter, estSpokenMs: estSpokenMs };
	return api;
})();
if (typeof module !== "undefined" && module.exports) module.exports = TC;
