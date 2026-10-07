/* MES Typing Test -- mes.fm/typing-test
 * lib.js = pure logic (word lists, seeded text generation, the typing state machine, results maths). Runs in node too:
 *   const TT = require('./tool_apps_src/typing-test/lib.js');   tests: node tool_apps_src/typing-test-tests.js
 */
var TT = (function () {
	"use strict";

	/* ---------- word lists ---------- */
	function W(s) { return s.split(/\s+/).filter(Boolean); }
	var BEGINNER = W("a an and are as at be but by can did do for get go had has he her him his how i if in is it its let me my no not of on one or our out say see she so the to up us was we who why yes you all any big bit boy cat day dog end eye far few fun got hat hot job key kid lot man map new old own pen put red run sit sun ten top try two use war way win yet ask add age air arm bad bag bed box bus car cup cut ear egg eat fan fit fly fox gas gym hit ice jam joy leg lip mix net nut oil pay pig pot rat rid row sad sea set sky tea tie toe toy van web wet zoo");
	var EASY = W("the of and to in is you that it he was for on are as with his they at be this from have or by one had not but what all were when we there can an your which their said if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know get through back much before go good new write our used me man too any day same right look think also around another came come work three word must because does part even place well such here take why things help put years different away again off went old number great tell men say small every found still between name should home big give air line set own under read last never us left end along while might next sound below saw something thought both few those always looked show large often together asked house don't world going want school important until form food keep children feet land side without boy once animals life enough took sometimes four head above kind began almost live page got earth need far hand high year mother light country father let night picture being study second soon story since white ever paper hard near sentence better best across during today however sure knew try told young sun thing whole hear example heard several change answer room sea against top turned learn point city play toward five using himself usually");
	var MEDIUM = EASY.concat(W("achieve address advice already amount anything balance believe benefit between brother building business capture careful certain chance character choose clothes comfort company complete computer consider continue control correct country courage create current customer decide delivery describe develop difference direction discover distance doctor double during economy effort electric energy engine enough entire environment evening exactly example exercise expect experience explain family favorite feeling finally flower foreign forest forward freedom friendly future garden general gentle ground happen healthy history holiday imagine improve include indeed instead interest journey kitchen language laughter library listen machine manage market measure message minute mirror modern moment morning mountain natural nothing notice number object office opinion ordinary package parent particular passage patient pattern perfect person picture planet pleasure popular possible practice present pretty prepare problem produce promise protect quality question quickly quietly reason receive record region remember report require result return science season second secret serious service several simple single society special spirit station straight strange stream strength student subject success summer support surface system teacher thought thousand together tonight travel trouble understand unusual village visitor voice weather welcome whatever whether window winter wonder worry yesterday"));
	var HARD = W("accommodate acknowledge acquaintance adolescent advantageous aesthetic aggressive ambiguous anonymous apparatus appreciate architecture atmosphere autonomous bureaucracy calculation catastrophe characteristic chronological collaborate commemorate communicate comprehensive conscientious consequence considerable constitution controversial convenience correspondence criticism curriculum deliberately demonstrate determination development dictionary disappoint discrimination distinguish documentary eccentric efficiency electricity embarrass encyclopedia enthusiastic entrepreneur environmental equilibrium especially exaggerate exceptional exhilarating extraordinary fascinating fluorescent fundamental government grandfather guarantee harassment hypothesis immediately implementation incidentally independent infrastructure intelligence interference jurisdiction laboratory legislation maintenance manufacture meticulous miscellaneous mysterious necessarily negotiation neighborhood nevertheless obstacle occasionally occurrence opportunity organization palindrome parliament particularly perseverance perspective phenomenon philosophy photograph physician pneumonia possibility preliminary pronunciation psychology questionnaire quintessential recommendation rhythm responsibility restaurant ridiculous sacrifice scholarship schedule separate significant silhouette sophisticated spontaneous statistics strategically subsequent sufficient surveillance sympathetic synchronize technique temperature thoroughly tomorrow transparent unanimous unfortunately vocabulary vulnerable whimsical xylophone yacht zeppelin");

	/* original practice passages (no copyrighted text); length class by word count */
	var PASSAGES = {
		short: [
			"The old lighthouse stood at the edge of the cliff, and every night its beam swept slowly across the dark water.",
			"Good habits are built one small step at a time, so start today and keep going even when progress feels slow.",
			"She packed a notebook, a flask of tea and two apples, then set off along the river before the town woke up."
		],
		medium: [
			"Learning to type quickly is less about speed and more about rhythm. When your fingers know where every key lives, your eyes can stay on the words ahead, and the whole sentence flows out like water finding its way downhill. Slow down just enough to stay accurate, and the speed will follow on its own.",
			"The market opened at dawn, long before the first customers arrived. Bakers stacked warm loaves in neat rows, fishmongers laid out silver catches on beds of ice, and a boy with a red cart sold oranges at three for a dollar. By noon the whole square was loud with bargaining, laughter and the clatter of wheels.",
			"A good map does not show everything. It chooses what matters, leaves out the rest, and trusts the reader to fill in the gaps. Writing works the same way: say the important thing clearly, cut the detail nobody needs, and let your reader enjoy the walk."
		],
		long: [
			"When the engineers first tested the bridge, they walked across it in silence, listening to every creak of the steel. Months of careful calculation had gone into each bolt and cable, yet nobody could be completely sure until the first heavy truck rolled over. It crossed without a sound. Years later, thousands of people used that bridge every day without a single thought about the quiet work that holds it up, which is perhaps the best compliment any piece of engineering can receive: it simply does its job, morning after morning, in rain, in wind and in the bright heat of summer.",
			"Every language has words that refuse to be translated neatly. They carry a mood, a smell, a half-forgotten afternoon. Linguists collect them like shells on a beach, turning each one over to see how the light plays on its surface. What these words teach us is that people everywhere notice the same small wonders, such as the pleasure of the first cool breeze after a hot day, or the comfort of a house where someone has left the lamp on, even if every culture finds a slightly different way to say it out loud."
		]
	};

	/* ---------- seeded random ---------- */
	function hashSeed(s) { var h = 1779033703 ^ String(s).length; for (var i = 0; i < String(s).length; i++) { h = Math.imul(h ^ String(s).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h >>> 0) || 1; }
	function rngFrom(seed) {
		var a = hashSeed(seed);
		return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}
	function newSeed() { return Math.random().toString(36).slice(2, 8); }

	/* ---------- difficulty ---------- */
	var DIFFS = {
		beginner: { name: "Beginner", pool: BEGINNER, punct: false, nums: false, caps: false, note: "Short common words, lower case." },
		easy: { name: "Easy", pool: EASY, punct: false, nums: false, caps: false, note: "The most common English words." },
		medium: { name: "Medium", pool: MEDIUM, punct: false, nums: false, caps: false, note: "A wider everyday vocabulary." },
		hard: { name: "Hard", pool: HARD, punct: false, nums: false, caps: false, note: "Long, easily misspelled words." },
		expert: { name: "Expert", pool: HARD.concat(MEDIUM), punct: true, nums: true, caps: true, note: "Hard words with capitals, punctuation and numbers." }
	};
	var DIFF_ORDER = ["beginner", "easy", "medium", "hard", "expert"];

	function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
	function digits(rng, n) { var s = String(1 + Math.floor(rng() * 9)); for (var i = 1; i < n; i++) s += Math.floor(rng() * 10); return s; }

	/* words[] for opts {diff, punct, nums, caps, letters (weak-key filter)}; the generator keeps its own sentence state so it can be called again to extend a time test */
	function makeGenerator(opts, seed) {
		var rng = rngFrom(seed), d = DIFFS[opts.diff] || DIFFS.medium, expert = opts.diff === "expert";
		var pool = d.pool, startSentence = true, prev = "";
		if (opts.letters && opts.letters.length) {
			var all = BEGINNER.concat(EASY, MEDIUM, HARD), seen = {}, f = [];
			all.forEach(function (w) { if (seen[w]) return; seen[w] = 1; for (var i = 0; i < opts.letters.length; i++) if (w.indexOf(opts.letters[i]) >= 0) { f.push(w); return; } });
			if (f.length >= 12) pool = f;
		}
		function one() {
			var w = pick(rng, pool), tries = 0;
			while (w === prev && tries++ < 5) w = pick(rng, pool);
			prev = w;
			if (opts.nums && rng() < (expert ? 0.12 : 0.15)) {
				var r = rng();
				w = (expert && r < 0.2) ? "$" + digits(rng, 2) + "." + digits(rng, 2).slice(0, 2) : (expert && r < 0.35) ? digits(rng, 2) + "%" : (expert && r < 0.45) ? (1 + Math.floor(rng() * 12)) + ":" + ("0" + Math.floor(rng() * 60)).slice(-2) : digits(rng, 1 + Math.floor(rng() * 4));
				return w;
			}
			if (opts.caps && (startSentence || rng() < 0.12)) w = w.charAt(0).toUpperCase() + w.slice(1);
			startSentence = false;
			if (opts.punct) {
				var p = rng();
				if (expert && p < 0.04) w = "(" + w + ")";
				else if (expert && p < 0.07) w = "\"" + w + "\"";
				else if (expert && p < 0.10) w = w + "-" + pick(rng, EASY);
				else if (p < 0.20) w += ",";
				else if (p < 0.27) { w += pick(rng, [".", ".", ".", "?", "!"]); startSentence = true; }
				else if (expert && p < 0.31) w += pick(rng, [";", ":"]);
			}
			return w;
		}
		return function (n) { var out = []; for (var i = 0; i < n; i++) out.push(one()); return out; };
	}
	function passageWords(len, seed) {
		var list = PASSAGES[len] || PASSAGES.medium;
		return pick(rngFrom(seed), list).split(/\s+/);
	}
	function customWords(text, max) { return String(text || "").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, max || 600); }

	/* ---------- the typing state machine ---------- */
	/* words: target words. opts: strict (a wrong letter is refused), backspace (default true), endOnLast (words / passage / custom: finish when the last word is complete). */
	function Session(words, opts) {
		this.words = words; this.opts = opts || {};
		this.idx = 0; this.cur = ""; this.done = []; this.keys = [];   // keys: {t, c (expected char or null), ok, sp?}
		this.start = null; this.end = null; this.finished = false; this.blocked = 0;
	}
	Session.prototype.extend = function (more) { for (var i = 0; i < more.length; i++) this.words.push(more[i]); };
	Session.prototype.type = function (ch, t) {
		if (this.finished) return false;
		if (this.start === null) this.start = t;
		var w = this.words[this.idx], rel = t - this.start;
		if (ch === " ") {
			if (this.cur === "") return false;
			var okw = this.cur === w;
			if (this.opts.strict && !okw) { this.blocked++; this.keys.push({ t: rel, c: null, ok: false, sp: true }); return false; }
			this.keys.push({ t: rel, c: null, ok: true, sp: true });   // the wrong letters already cost accuracy; the space itself is not a second error
			this.done[this.idx] = this.cur; this.idx++; this.cur = "";
			if (this.idx >= this.words.length && this.opts.endOnLast) this.finish(t);
			return true;
		}
		var exp = this.cur.length < w.length ? w.charAt(this.cur.length) : null, ok = exp !== null && ch === exp;
		if (this.opts.strict && !ok) { this.blocked++; this.keys.push({ t: rel, c: exp, ok: false }); return false; }
		this.keys.push({ t: rel, c: exp, ok: ok });
		this.cur += ch;
		if (this.opts.endOnLast && this.idx === this.words.length - 1 && this.cur === w) { this.done[this.idx] = this.cur; this.idx++; this.cur = ""; this.finish(t); }
		return true;
	};
	Session.prototype.backspace = function () {
		if (this.finished || this.opts.backspace === false) return false;
		if (this.cur.length) { this.cur = this.cur.slice(0, -1); return true; }
		if (this.idx > 0 && this.done[this.idx - 1] !== this.words[this.idx - 1]) { this.idx--; this.cur = this.done[this.idx]; this.done[this.idx] = undefined; return true; }
		return false;
	};
	Session.prototype.clearWord = function () { if (this.finished || this.opts.backspace === false) return false; var had = this.cur.length > 0; this.cur = ""; return had; };
	Session.prototype.finish = function (t) { if (this.finished) return; this.finished = true; this.end = t; };

	/* ---------- results ---------- */
	function tanh(x) { var e = Math.exp(2 * x); return (e - 1) / (e + 1); }
	function consistency(series) {
		var s = series.filter(function (v) { return v > 0; });
		if (s.length < 3) return null;
		var m = s.reduce(function (a, b) { return a + b; }, 0) / s.length;
		var sd = Math.sqrt(s.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / s.length), cv = sd / m;
		return Math.max(0, Math.min(100, 100 * (1 - tanh(cv + Math.pow(cv, 3) / 3 + Math.pow(cv, 5) / 5))));
	}
	/* sess: Session, durMs: the test length in ms (time mode: the limit; else the elapsed time). */
	function result(sess, durMs) {
		var words = sess.words, correctChars = 0, rawChars = 0, ok = 0, bad = 0, extra = 0, missed = 0, i;
		var last = sess.idx;            // index of the word being typed (cur) if unfinished
		var total = sess.done.length;
		for (i = 0; i <= Math.min(last, words.length - 1); i++) {
			var t = i < sess.idx ? sess.done[i] : (i === sess.idx ? sess.cur : ""), w = words[i];
			if (t === undefined || t === null) continue;
			var committed = i < sess.idx;
			if (!t.length && !committed) continue;
			var n = Math.min(t.length, w.length), cc = 0;
			for (var k = 0; k < n; k++) if (t.charAt(k) === w.charAt(k)) cc++; else bad++;
			ok += cc;
			if (t.length > w.length) extra += t.length - w.length;
			if (committed && t.length < w.length) missed += w.length - t.length;
			var sp = committed && !(i === words.length - 1 && sess.opts.endOnLast) ? 1 : 0;   // no space is typed after the final word of a fixed-length test
			rawChars += t.length + sp;
			if (t === w) correctChars += w.length + sp;
			else if (!committed && w.indexOf(t) === 0) correctChars += t.length;
		}
		// the space after the very last word is not typed when a test ends on completion: no extra credit
		var mins = Math.max(durMs, 1) / 60000;
		var keysOk = 0, keysAll = 0;
		sess.keys.forEach(function (k) { keysAll++; if (k.ok) keysOk++; });
		var secs = Math.max(1, Math.ceil(durMs / 1000)), raw = [], wpm = [], errs = [], cumOk = 0, kk = 0;
		for (var s = 0; s < secs; s++) {
			var c = 0, e = 0;
			while (kk < sess.keys.length && sess.keys[kk].t < (s + 1) * 1000) { var key = sess.keys[kk++]; c++; if (!key.ok) e++; if (key.ok) cumOk++; }
			raw.push(c * 12);
			wpm.push(cumOk / 5 / ((s + 1) / 60));
			errs.push(e);
		}
		var perKey = {}, prevT = null;
		sess.keys.forEach(function (k) {
			if (k.c) { var o = perKey[k.c] || (perKey[k.c] = { a: 0, m: 0, ms: 0, n: 0 }); o.a++; if (!k.ok) o.m++; if (prevT !== null && k.t - prevT < 2500) { o.ms += k.t - prevT; o.n++; } }
			prevT = k.t;
		});
		return {
			wpm: correctChars / 5 / mins, raw: rawChars / 5 / mins,
			acc: keysAll ? 100 * keysOk / keysAll : 100, cons: consistency(raw.slice(0, Math.max(3, raw.length - (durMs % 1000 && raw.length > 3 ? 1 : 0)))),
			secs: durMs / 1000, chars: { ok: ok, bad: bad, extra: extra, missed: missed }, keys: keysAll, errors: keysAll - keysOk,
			wordsDone: sess.done.filter(function (d, j) { return d === words[j]; }).length,
			series: { raw: raw, wpm: wpm, errs: errs }, perKey: perKey, blocked: sess.blocked
		};
	}
	function mergeKeys(into, perKey) {
		Object.keys(perKey).forEach(function (c) { var a = into[c] || (into[c] = { a: 0, m: 0, ms: 0, n: 0 }), b = perKey[c]; a.a += b.a; a.m += b.m; a.ms += b.ms; a.n += b.n; });
		return into;
	}
	/* the letters that hurt most: a-z only, at least 3 attempts, ranked by miss rate then by slowness */
	function weakLetters(perKey, max) {
		var arr = Object.keys(perKey).filter(function (c) { return /^[a-z]$/i.test(c) && perKey[c].a >= 3; }).map(function (c) {
			var o = perKey[c]; return { c: c.toLowerCase(), rate: o.m / o.a, ms: o.n ? o.ms / o.n : 0 };
		}).filter(function (x) { return x.rate > 0 || x.ms > 0; });
		arr.sort(function (a, b) { return (b.rate - a.rate) || (b.ms - a.ms); });
		var out = []; arr.forEach(function (x) { if (out.length < (max || 5) && out.indexOf(x.c) < 0) out.push(x.c); });
		return out;
	}
	var RANKS = [
		[0, "Just starting", "Everyone starts somewhere. Short daily practice moves this quickly."],
		[20, "Learning", "Below the typical adult speed, and well within reach of a few weeks of practice."],
		[35, "Average", "Close to the typical adult speed of about 40 WPM."],
		[50, "Above average", "Faster than most people. Comfortable for everyday work."],
		[65, "Fast", "Professional speed: typists doing data entry or writing all day are usually here."],
		[80, "Very fast", "Faster than around 90% of typists."],
		[100, "Expert", "Top-tier speed. Accuracy is now what separates good from great."],
		[130, "Elite", "Competition level. Very few people sustain this."]
	];
	function rankFor(wpm) { var r = RANKS[0]; for (var i = 0; i < RANKS.length; i++) if (wpm >= RANKS[i][0]) r = RANKS[i]; return { name: r[1], note: r[2] }; }

	var api = { BEGINNER: BEGINNER, EASY: EASY, MEDIUM: MEDIUM, HARD: HARD, PASSAGES: PASSAGES, DIFFS: DIFFS, DIFF_ORDER: DIFF_ORDER, RANKS: RANKS,
		rngFrom: rngFrom, newSeed: newSeed, makeGenerator: makeGenerator, passageWords: passageWords, customWords: customWords,
		Session: Session, result: result, consistency: consistency, mergeKeys: mergeKeys, weakLetters: weakLetters, rankFor: rankFor };
	return api;
})();
if (typeof module !== "undefined" && module.exports) module.exports = TT;

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

/* MES Transcription Typing Test -- UI. Logic lives in lib.js (TC). State: localStorage "mes-transcribe:v1" (settings, voice, history); nothing is uploaded unless you post a score (name, speed, accuracy). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tc");
	if (!root || typeof TC === "undefined") return;
	var KEY = "mes-transcribe:v1", API = "/api/typing-leaderboard", MIN_ACC = 90;
	var LENS = { passage: ["short", "medium", "long"], words: [10, 25, 50] };
	var LEN_LABEL = { passage: "Length", words: "Words" };
	var DEF = { src: "passage", len: { passage: "medium", words: 25 }, diff: "medium", pace: 120, chunk: 5, wait: false, caps: false, strict: false, voice: "auto", vol: 1, pitch: 1 };

	/* ---------- storage ---------- */
	var store = { opts: JSON.parse(JSON.stringify(DEF)), hist: [], pid: "", name: "", noPop: false }, memOnly = false;
	function rand16() { var rb = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(rb); return Array.prototype.map.call(rb, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
	try {
		var raw = localStorage.getItem(KEY);
		if (raw) { var o = JSON.parse(raw); if (o && typeof o === "object") { store.opts = Object.assign(store.opts, o.opts || {}); store.opts.len = Object.assign({}, DEF.len, (o.opts || {}).len || {}); store.hist = Array.isArray(o.hist) ? o.hist : []; store.pid = o.pid || ""; store.name = typeof o.name === "string" ? o.name.slice(0, 16) : ""; store.noPop = !!o.noPop; } }
		if (!store.pid || !store.name) {   // same person as on the Typing Test: share the id (so "Only mine" works across both) and the name
			var tt = JSON.parse(localStorage.getItem("mes-typingtest:v1") || "null");
			if (tt) { if (!store.pid && /^[a-f0-9]{16}$/.test(tt.pid)) store.pid = tt.pid; if (!store.name && typeof tt.name === "string") store.name = tt.name.slice(0, 16); }
		}
	} catch (e) { memOnly = true; }
	if (!/^[a-f0-9]{16}$/.test(store.pid)) store.pid = rand16();
	function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { memOnly = true; } }
	save();
	var S = store.opts;
	if (TC.PACES.indexOf(S.pace) < 0) S.pace = 120;

	/* ---------- elements ---------- */
	var el = {};
	["src", "len", "lenwrap", "lenlabel", "diff", "diffwrap", "pace", "chunk", "rules", "voice", "vol", "vol-o", "pitch", "pitch-o", "note", "banner", "custom", "customtext", "live", "t", "w", "wl", "r", "status", "caption", "in", "start", "replay", "done", "new", "result", "hist", "histbody", "histsub", "toast",
		"lb", "lbperiod", "lbboard", "lbfilter", "lbdev", "lbmine", "lbbody", "lbnote"].forEach(function (k) { el[k] = $("tc-" + k); });
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmt(n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); }
	function toast(msg) { el.toast.textContent = msg; el.toast.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.toast.classList.remove("is-on"); }, 2400); }
	function clock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

	/* ---------- speech ---------- */
	var SP = { ok: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window, voices: [], voice: null, keep: [] };
	function voiceKey(v) { return (v.voiceURI || v.name) + "|" + v.lang; }
	function voiceScore(v) {
		var l = String(v.lang || "").toLowerCase().replace("_", "-"), nav = String(navigator.language || "en").toLowerCase(), want = S.src === "custom" ? nav.split("-")[0] : "en", sc = 0;
		if (l.split("-")[0] === want) sc += 100; if (l === nav) sc += 20; if (l === "en-us" || l === "en-gb") sc += 6;
		if (v.localService) sc += 8; if (/natural|neural|premium|enhanced|siri/i.test(v.name)) sc += 25; if (/google/i.test(v.name)) sc += 4;
		if (/compact|espeak|novelty|bells|boing|cellos|zarvox|trinoids|whisper|bubbles|jester|organ|bad news|good news|albert|fred|junior|ralph|kathy|superstar/i.test(v.name)) sc -= 60;
		return sc;
	}
	function autoVoice() { var best = null, bs = -1e9; SP.voices.forEach(function (v) { var s = voiceScore(v); if (s > bs) { bs = s; best = v; } }); return best; }
	function resolveVoice() {
		var v = null;
		if (S.voice !== "auto") for (var i = 0; i < SP.voices.length; i++) if (voiceKey(SP.voices[i]) === S.voice) { v = SP.voices[i]; break; }
		SP.voice = v || autoVoice(); return SP.voice;
	}
	var voicesGaveUp = false;
	function loadVoices() {
		var list = []; try { list = speechSynthesis.getVoices() || []; } catch (e) {}
		SP.voices = list.slice();
		var sel = el.voice, groups = {}, order = [], dn = null;
		try { dn = new Intl.DisplayNames([navigator.language || "en"], { type: "language" }); } catch (e) {}
		function langName(code) { var c = String(code || "").replace("_", "-"); if (!c) return "Other"; try { return (dn && dn.of(c)) || c; } catch (e) { return c; } }
		sel.innerHTML = "";
		var auto = document.createElement("option"); auto.value = "auto"; auto.textContent = "Automatic"; sel.appendChild(auto);
		if (!list.length) { var none = document.createElement("option"); none.disabled = true; none.textContent = voicesGaveUp ? "No voices found on this device" : "Loading voices…"; sel.appendChild(none); }
		list.forEach(function (v) { var k = langName(v.lang); if (!groups[k]) { groups[k] = []; order.push({ name: k, lang: String(v.lang || "").toLowerCase() }); } groups[k].push(v); });
		var ul = String(navigator.language || "en").toLowerCase().split("-")[0];
		order.sort(function (a, b) { function r(g) { var l = g.lang.split("-")[0]; return l === "en" ? 0 : l === ul ? 1 : 2; } return r(a) - r(b) || a.name.localeCompare(b.name); });
		order.forEach(function (g) {
			var og = document.createElement("optgroup"); og.label = g.name;
			groups[g.name].sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (v) { var o = document.createElement("option"); o.value = voiceKey(v); o.textContent = v.name + (v.localService === false ? " · online" : ""); og.appendChild(o); });
			sel.appendChild(og);
		});
		sel.value = S.voice !== "auto" && list.some(function (v) { return voiceKey(v) === S.voice; }) ? S.voice : "auto";
		resolveVoice(); labelAuto();
	}
	function labelAuto() { if (el.voice.options.length) el.voice.options[0].textContent = "Automatic" + (S.voice === "auto" && SP.voice ? ": " + SP.voice.name + " (" + SP.voice.lang + ")" : ""); }
	function initSpeech() {
		if (!SP.ok) { el.start.disabled = true; setStatus("This browser cannot read text aloud (no Web Speech API), so this test cannot run here. Chrome, Edge, Safari and most Android and iOS browsers support it."); return; }
		try { speechSynthesis.cancel(); } catch (e) {}
		loadVoices();
		try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; }
		var tries = 0;
		(function poll() { if (SP.voices.length || tries++ > 16) { if (!SP.voices.length) { voicesGaveUp = true; loadVoices(); } return; } setTimeout(function () { loadVoices(); poll(); }, 250); })();
		window.addEventListener("pagehide", function () { try { speechSynthesis.cancel(); } catch (e) {} });
		if (window.MESVoicePicker) MESVoicePicker.enhance(el.voice, { sample: "Hello, this is how I will read the text to you." });
	}
	el.voice.addEventListener("change", function () { S.voice = el.voice.value; resolveVoice(); labelAuto(); save(); });
	function bindRange(id, key, outFn) { var r = el[id], o = el[id + "-o"]; r.value = S[key]; o.textContent = outFn(S[key]); r.addEventListener("input", function () { S[key] = +r.value; o.textContent = outFn(S[key]); save(); }); }
	bindRange("vol", "vol", function (v) { return Math.round(v * 100) + "%"; });
	bindRange("pitch", "pitch", function (v) { return fmt(v, 1); });

	/* ---------- a run ---------- */
	var T = { state: "idle", text: "", seed: "", chunks: [], idx: -1, spokenIdx: -1, t0: 0, replays: 0, timers: [], cfg: null, tok: "", lastAvoid: "", R: null, replayFlag: false, gen: 0, lastEnd: 0, tick: 0 };
	function setStatus(html, play) { el.status.innerHTML = html; el.status.classList.toggle("is-play", !!play); }
	function clearTimers() { T.timers.forEach(clearTimeout); T.timers = []; clearInterval(T.tick); T.tick = 0; }
	function later(fn, ms) { var id = setTimeout(fn, ms); T.timers.push(id); return id; }
	function typedWords() { return TC.words(el.in.value, false).length; }
	function ranked(c) { return c.src === "passage" && !c.wait && !c.caps && !c.strict; }

	function textFor() {
		if (S.src === "custom") { var w = String(el.customtext.value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 1500); return w.join(" "); }
		if (S.src === "words") return TC.randomWords(S.len.words, S.diff, T.seed);
		var p = TC.passageFor(S.len.passage, T.seed, T.lastAvoid); T.lastAvoid = p; return p;
	}
	function drawControls() {
		Array.prototype.forEach.call(el.src.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === S.src)); });
		var lens = LENS[S.src];
		el.lenwrap.hidden = !lens; el.diffwrap.hidden = S.src !== "words"; el.custom.hidden = S.src !== "custom";
		if (lens) { el.lenlabel.textContent = LEN_LABEL[S.src]; el.len.innerHTML = lens.map(function (v) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (S.len[S.src] === v) + '">' + (typeof v === "string" ? v.charAt(0).toUpperCase() + v.slice(1) : v) + "</button>"; }).join(""); }
		Array.prototype.forEach.call(el.diff.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === S.diff)); });
		el.pace.innerHTML = TC.PACES.map(function (p) { return '<button type="button" data-v="' + p + '" aria-pressed="' + (S.pace === p) + '">' + p + "</button>"; }).join("");
		Array.prototype.forEach.call(el.chunk.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-v") === S.chunk)); });
		Array.prototype.forEach.call(el.rules.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(!!S[b.getAttribute("data-f")])); });
		var run = T.state === "playing" || T.state === "audioDone";
		[el.src, el.len, el.diff, el.pace, el.chunk, el.rules].forEach(function (g) { Array.prototype.forEach.call(g.querySelectorAll("button"), function (b) { b.disabled = run; }); });
		el.customtext.disabled = run;
		var c = { src: S.src, wait: S.wait, caps: S.caps, strict: S.strict };
		el.note.textContent = ranked(c) ? "Ranked: a passage at a preset pace, no captions, no waiting. Scores of " + MIN_ACC + "% accuracy or more can go on the leaderboard." : S.src === "custom" ? "Your own text is practice only. It stays in your browser." : "Practice only: the leaderboard takes the passage test with Wait for me, Captions and Strict off.";
	}
	function stopAll() { T.gen++; clearTimers(); try { speechSynthesis.cancel(); } catch (e) {} SP.keep = []; }
	function reset(newText) {
		stopAll(); closeModal(); window.MESAdQuiet && MESAdQuiet.release(3000);
		T.state = "idle"; T.idx = -1; T.spokenIdx = -1; T.replays = 0; T.R = null; T.tok = "";
		if (newText || !T.seed) T.seed = TC.newSeed();
		el.in.value = ""; el.in.disabled = false; el.result.hidden = true; el.caption.hidden = true; el.caption.textContent = "";
		el.start.disabled = !SP.ok; el.start.textContent = "▶ Start"; el.replay.disabled = true; el.done.disabled = true;
		el.t.textContent = "0:00"; el.w.textContent = "0"; el.r.textContent = "0"; el.banner.hidden = true;
		setStatus(SP.ok ? "Press <b>Start</b>, then type what you hear. You will not see the words." + (S.src === "custom" ? "" : "") : el.status.innerHTML);
		drawControls();
	}

	/* ---------- the speaker ---------- */
	function makeUtter(text, rate) {
		var u = new SpeechSynthesisUtterance(text), v = SP.voice || resolveVoice();
		if (v) { u.voice = v; u.lang = v.lang; }
		u.rate = rate; u.pitch = S.pitch; u.volume = S.vol; return u;
	}
	function speakChunk(i, after) {   // after(spokenMs) when it has finished; the watchdog covers voices that never fire onend
		var gen = T.gen, c = T.chunks[i], rate = TC.rateFor(T.cfg.pace), done = false, started = 0, wd = 0;
		function fin() { if (done || gen !== T.gen) return; done = true; clearTimeout(wd); after(started ? performance.now() - started : TC.estSpokenMs(c.text, rate)); }
		var u = makeUtter(c.text, rate);
		u.onstart = function () { if (gen !== T.gen) return; started = performance.now(); if (!T.t0) { T.t0 = started; startTick(); } clearTimeout(wd); wd = setTimeout(fin, TC.estSpokenMs(c.text, rate) * 2 + 4000); };
		u.onend = fin; u.onerror = function (e) { if (e && (e.error === "canceled" || e.error === "interrupted")) return; fin(); };
		SP.keep.push(u); if (SP.keep.length > 4) SP.keep.shift();
		wd = setTimeout(function () { if (!started && gen === T.gen && !done) { try { speechSynthesis.cancel(); speechSynthesis.speak(makeUtter(c.text, rate)); } catch (e) {} wd = setTimeout(fin, TC.estSpokenMs(c.text, rate) + 5000); } }, 3500);
		try { speechSynthesis.speak(u); } catch (e) { fin(); }
	}
	function startTick() { clearInterval(T.tick); T.tick = setInterval(function () { if (T.state === "idle" || T.state === "done") return; el.t.textContent = clock(performance.now() - T.t0); }, 250); }
	function showCaption(i) { if (!T.cfg.caps) return; el.caption.hidden = false; el.caption.textContent = T.chunks[i].text; }
	function playFrom(i) {
		var gen = T.gen;
		if (i >= T.chunks.length) { audioFinished(); return; }
		T.idx = i; T.spokenIdx = i; el.replay.disabled = false;
		setStatus("Listening… phrase " + (i + 1) + " of " + T.chunks.length + ". Type what you hear.", true);
		speakChunk(i, function (spokenMs) {
			if (gen !== T.gen) return;
			showCaption(i);
			if (T.replayFlag) { T.replayFlag = false; playFrom(i); return; }
			var c = T.chunks[i];
			if (i + 1 >= T.chunks.length) { audioFinished(); return; }
			if (T.cfg.wait) waitThenNext(i, gen);
			else later(function () { if (gen === T.gen) { if (T.replayFlag) { T.replayFlag = false; playFrom(i); } else playFrom(i + 1); } }, TC.gapAfter(c.words, T.cfg.pace, spokenMs));
		});
	}
	function waitThenNext(i, gen) {
		var c = T.chunks[i], need = Math.max(0, c.start + c.words - 1), t0 = performance.now();
		setStatus("Your turn: finish typing the phrase. The next one comes when you are nearly done.", true);
		(function poll() {
			if (gen !== T.gen) return;
			if (T.replayFlag) { T.replayFlag = false; playFrom(i); return; }
			if (typedWords() >= need || performance.now() - t0 > 30000) { playFrom(i + 1); return; }
			later(poll, 150);
		})();
	}
	function audioFinished() {
		T.state = "audioDone"; el.replay.disabled = false;
		setStatus("The audio has finished. Finish your last words, then press <b>Done</b> (Ctrl+Enter).", false);
		maybeAutoFinish();
	}
	var idleT = 0;
	function maybeAutoFinish() {
		clearTimeout(idleT);
		if (T.state !== "audioDone") return;
		if (typedWords() >= TC.words(T.text, false).length) idleT = setTimeout(function () { if (T.state === "audioDone") finish(); }, 2500);
	}

	/* ---------- start / replay / done ---------- */
	function start() {
		if (!SP.ok || T.state === "playing" || T.state === "audioDone") return;
		reset(false);
		if (S.src === "custom" && !String(el.customtext.value).trim()) { toast("Paste some text first."); return; }
		T.text = textFor(); T.cfg = { src: S.src, len: S.len[S.src], diff: S.diff, pace: S.pace, chunk: S.chunk, wait: S.wait, caps: S.caps, strict: S.strict };
		T.chunks = TC.chunkify(T.text, S.chunk); if (!T.chunks.length) { toast("There is nothing to read."); return; }
		window.MESAdQuiet && MESAdQuiet.hold(); T.state = "playing"; T.t0 = 0; T.replays = 0; T.gen++; T.tok = "";
		if (ranked(T.cfg)) lbApi({ a: "start" }).then(function (r) { if (r && r.t) T.tok = r.t; }, function () {});
		el.start.disabled = true; el.start.textContent = "Listening…"; el.done.disabled = false; el.replay.disabled = true; drawControls(); resolveVoice();
		setStatus("Get ready…", true); el.in.focus();
		var gen = T.gen; later(function () { if (gen === T.gen) playFrom(0); }, 900);
	}
	function replay() {
		if (T.state !== "playing" && T.state !== "audioDone") return;
		T.replays++; el.r.textContent = T.replays;
		if (T.state === "audioDone") { T.state = "playing"; T.replayFlag = false; var gen = (T.gen++, T.gen); try { speechSynthesis.cancel(); } catch (e) {} T.timers.forEach(clearTimeout); T.timers = []; speakChunk(T.chunks.length - 1, function () { if (gen === T.gen) audioFinished(); }); return; }
		// mid-run: stop what is playing and say the current phrase again, then carry on from the next one
		var i = T.spokenIdx; T.gen++; T.timers.forEach(clearTimeout); T.timers = []; try { speechSynthesis.cancel(); } catch (e) {}
		T.replayFlag = false; playFrom(i);
	}
	el.start.addEventListener("click", start);
	el.replay.addEventListener("click", function () { replay(); el.in.focus(); });
	el.done.addEventListener("click", function () { finish(); });
	el.new.addEventListener("click", function () { reset(true); });
	el.in.addEventListener("keydown", function (e) {
		if (e.key === "Tab" && !e.shiftKey && (T.state === "playing" || T.state === "audioDone")) { e.preventDefault(); replay(); }
		else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (T.state === "playing" || T.state === "audioDone") finish(); else if (T.state === "idle") start(); }
		else if (e.key === "Escape") { e.preventDefault(); reset(true); }
	});
	el.in.addEventListener("input", function () { var n = typedWords(); el.w.textContent = n; maybeAutoFinish(); });
	el.in.addEventListener("paste", function (e) { e.preventDefault(); toast("Pasting is switched off: type what you hear."); });
	el.in.addEventListener("focus", function () { if (T.state === "idle") setStatus(el.status.innerHTML); });
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && T.state !== "idle" && document.activeElement !== el.in && !modal) { reset(true); } });

	/* ---------- settings clicks ---------- */
	function pick(group, fn) { group.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || b.disabled) return; fn(b); save(); reset(true); }); }
	pick(el.src, function (b) { S.src = b.getAttribute("data-v"); });
	pick(el.len, function (b) { var v = b.getAttribute("data-v"); S.len[S.src] = isNaN(+v) ? v : +v; });
	pick(el.diff, function (b) { S.diff = b.getAttribute("data-v"); });
	pick(el.pace, function (b) { S.pace = +b.getAttribute("data-v"); });
	pick(el.chunk, function (b) { S.chunk = +b.getAttribute("data-v"); });
	el.rules.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || b.disabled) return; var f = b.getAttribute("data-f"); S[f] = !S[f]; save(); drawControls(); });

	/* ---------- finishing and results ---------- */
	function finish() {
		if (T.state !== "playing" && T.state !== "audioDone") return;
		var now = performance.now(), started = T.t0 || now; stopAll(); clearTimeout(idleT); window.MESAdQuiet && MESAdQuiet.release(7000);
		T.state = "done"; el.start.disabled = false; el.start.textContent = "▶ Start again"; el.replay.disabled = true; el.done.disabled = true; el.in.disabled = true; el.caption.hidden = true;
		var typed = el.in.value, minutes = Math.max(0.05, (now - started) / 60000), c = T.cfg;
		if (!typed.trim()) { reset(false); toast("Nothing typed, so no score."); return; }
		var r = TC.score(T.text, typed, c.strict, minutes); r.secs = (now - started) / 1000; r.replays = T.replays;
		el.t.textContent = clock(now - started); el.w.textContent = TC.words(typed, false).length;
		setStatus("Finished. Your result is below.", false);
		T.R = { r: r, c: c, tok: T.tok, posted: null, said: T.text };
		store.hist.push({ ts: Date.now(), src: c.src, len: c.len, pace: c.pace, wait: +c.wait, caps: +c.caps, strict: +c.strict, wpm: Math.round(r.wpm * 10) / 10, acc: Math.round(r.acc * 10) / 10, rep: T.replays });
		if (store.hist.length > 200) store.hist = store.hist.slice(-200);
		save(); drawControls(); showResult(T.R); drawHistory();
		try { el.result.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
		if (canPost(T.R) && !store.noPop) { var R0 = T.R; setTimeout(function () { if (T.R === R0 && !R0.posted) openModal(R0); }, 700); }
	}
	function diffHtml(ops) {
		return ops.map(function (o) {
			if (o.t === "ok") return '<span class="ok">' + esc(o.r) + "</span>";
			if (o.t === "sub") return '<span class="sub"><s>' + esc(o.w) + "</s><b>" + esc(o.r) + "</b></span>";
			if (o.t === "del") return '<span class="del" title="You did not type this word">' + esc(o.r) + "</span>";
			return '<span class="ins"><s>' + esc(o.w) + "</s></span>";
		}).join(" ");
	}
	function describe(c) {
		var m = c.src === "passage" ? c.len + " passage" : c.src === "words" ? c.len + " random words, " + c.diff : "your text";
		var f = []; if (c.wait) f.push("wait for me"); if (c.caps) f.push("captions"); if (c.strict) f.push("strict");
		return m + " at " + c.pace + " WPM" + (f.length ? ", " + f.join(" + ") : "");
	}
	function rankNote(wpm, acc) {
		if (acc < 80) return "Slow down and aim for accuracy first: replay phrases and try a lower pace.";
		if (acc < 90) return "Getting there. Over 90% accuracy is the aim before raising the pace.";
		if (acc < 97) return "Good transcription. Tighten up the last few mistakes, then raise the pace.";
		return "Excellent accuracy. Time to try a faster pace.";
	}
	function showResult(R) {
		var r = R.r, c = R.c;
		el.result.innerHTML =
			'<div class="tt-rhead"><div class="tt-rank">Transcription result<small>' + esc(rankNote(r.wpm, r.acc)) + "</small></div><div class=\"tu-note\">" + esc(describe(c)) + "</div></div>" +
			'<div class="tt-tiles"><div class="tt-tile tt-tile--big"><b>' + fmt(r.wpm, 0) + "</b><span>WPM</span></div><div class=\"tt-tile tt-tile--big\"><b>" + fmt(r.acc, 1).replace(/\.0$/, "") + "%</b><span>accuracy</span></div>" +
			'<div class="tt-tile"><b>' + r.ok + "/" + r.words + "</b><span>words right</span></div><div class=\"tt-tile\"><b>" + clockNice(r.secs) + "</b><span>time</span></div><div class=\"tt-tile\"><b>" + r.replays + "</b><span>replays</span></div></div>" +
			'<div class="tt-detail"><strong>' + r.wrong + "</strong> wrong · <strong>" + r.missed + "</strong> missed · <strong>" + r.extra + "</strong> extra" + (c.strict ? "" : " (capitals and punctuation are not counted)") + ".</div>" +
			'<details class="tt-how"><summary>How are WPM and accuracy calculated?</summary><p>One &ldquo;word&rdquo; is <strong>5 characters</strong>, spaces included (the standard for typing tests). <strong>WPM</strong> = correct characters &divide; 5 &divide; minutes, where the clock runs from the first sound to Done. Your test: ' + Math.max(0, r.chars - r.dist) + " correct characters &divide; 5 = " + fmt(Math.max(0, r.chars - r.dist) / 5, 1) + " words in " + fmt(r.secs, r.secs < 10 ? 1 : 0) + " s &rarr; <strong>" + fmt(r.wpm, 0) + ' WPM</strong>. <strong>Accuracy</strong> = 1 &minus; (letters you got wrong, missed or added &divide; letters that were said). ' + (c.strict ? "Capitals and punctuation are counted." : "Capitals and punctuation are ignored, because a speaker does not say them.") + "</p></details>" +
			'<h3 class="tt-h3">What you typed against what was said</h3><div class="tc-diff">' + diffHtml(r.ops) + "</div>" +
			'<p class="tc-legend"><s style="color:#b3261e">red</s> = what you typed, <b style="color:#1b6e3c">green</b> = what was said, <span style="background:#fff1c2;padding:0 .3em;border-radius:.25em">yellow</span> = a word you missed.</p>' +
			'<details class="tc-said"><summary>Show the original text</summary><p>' + esc(R.said) + "</p></details>" +
			'<div class="tt-actions"><button type="button" class="tu-btn tu-btn--primary" id="tc-again">Next test</button><button type="button" class="tu-btn" id="tc-same">Same text again</button><button type="button" class="tu-btn" id="tc-copy">Copy result</button></div>' + postBox(R);
		el.result.hidden = false;
		$("tc-again").onclick = function () { reset(true); try { root.scrollIntoView({ behavior: "smooth" }); } catch (e) {} };
		$("tc-same").onclick = function () { reset(false); };
		$("tc-copy").onclick = function () { var t = "I transcribed " + fmt(r.wpm, 0) + " WPM at " + fmt(r.acc, 0) + "% accuracy (" + describe(c) + ") on the MES Transcription Typing Test: https://mes.fm/typing-test-transcribe"; copyText(t, "Result copied."); };
		wirePost(R);
	}
	function clockNice(s) { return s < 90 ? fmt(s, 0) + "s" : clock(s * 1000); }
	function copyText(text, msg) {
		function ok() { toast(msg); }
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Copy failed."); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fb); else fb();
	}

	/* ---------- local history ---------- */
	function drawHistory() {
		var h = store.hist, box = el.histbody;
		if (!h.length) { el.histsub.textContent = memOnly ? "Saving is off in this browser." : "Saved only in this browser."; box.innerHTML = '<p class="tt-empty">Finish a test and your results appear here.</p>'; return; }
		var best = Math.max.apply(null, h.map(function (x) { return x.wpm; })), avg = h.reduce(function (a, x) { return a + x.wpm; }, 0) / h.length, acc = h.reduce(function (a, x) { return a + x.acc; }, 0) / h.length;
		el.histsub.textContent = h.length + " test" + (h.length > 1 ? "s" : "") + " saved in this browser";
		var rows = h.slice(-10).reverse().map(function (x) { return "<tr><td>" + new Date(x.ts).toLocaleDateString() + "</td><td>" + esc(describe({ src: x.src, len: x.len, diff: "", pace: x.pace, wait: x.wait, caps: x.caps, strict: x.strict })) + "</td><td><strong>" + fmt(x.wpm, 0) + "</strong></td><td>" + fmt(x.acc, 1) + "%</td></tr>"; }).join("");
		box.innerHTML = '<div class="tt-sum"><div class="tt-tile"><b>' + fmt(best, 0) + '</b><span>best WPM</span></div><div class="tt-tile"><b>' + fmt(avg, 0) + '</b><span>average WPM</span></div><div class="tt-tile"><b>' + fmt(acc, 0) + '%</b><span>average accuracy</span></div></div>' +
			'<h3 class="tt-h3" style="margin-top:1em">Your last 10 tests</h3><div class="tt-tablewrap"><table class="tt-table"><thead><tr><th>When</th><th>Test</th><th>WPM</th><th>Accuracy</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
			'<div class="tt-hbtns"><button type="button" class="tu-btn tu-btn--ghost" id="tc-clear">Clear history</button></div>';
		$("tc-clear").onclick = function () { if (confirm("Delete the transcription results saved in this browser?")) { store.hist = []; save(); drawHistory(); } };
	}

	/* ---------- leaderboard (same API as the Typing Test; tr- boards) ---------- */
	var PER = { day: "Today", week: "This week", all: "All time" };
	var LB = { period: "day", board: "tr-all", counts: {}, data: null, mine: false, dev: "", sort: { k: "r", d: 1 }, shown: 25 };
	// "k" keyboard / "p" phone or tablet touch: self-reported with a score, shown as an icon and usable as a filter
	function myDevice() {
		try {
			var ua = navigator.userAgent || "", pts = navigator.maxTouchPoints || 0, coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
			var ipad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && pts > 1), tab = ipad || /Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
			if (tab && (pts > 0 || coarse)) return "t";
			return coarse || (pts > 0 && /Android|iPhone|iPod|Mobile/i.test(ua)) ? "p" : "k";
		} catch (e) { return "k"; }
	}
	var DEVS = { "": "All devices", k: "⌨ Keyboard", p: "📱 Phone", t: '<span class="tt-tabicon"></span> Tablet', v: "🎤 Voice" };
	function devIcon(d) { d = d || "k"; /* scores posted before the label existed were typed on a keyboard */ return d === "k" ? ' <span class="tt-dev" title="Typed on a keyboard" aria-label="keyboard">⌨</span>' : d === "p" ? ' <span class="tt-dev" title="Typed on a phone (touch)" aria-label="phone">📱</span>' : d === "t" ? ' <span class="tt-dev" title="Typed on a tablet (touch)" aria-label="tablet"><span class="tt-tabicon"></span></span>' : d === "v" ? ' <span class="tt-dev" title="Spoken with voice typing (dictation)" aria-label="voice typing">🎤</span>' : ""; }
	function lbApi(body) { return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { j.status = r.status; return j; }); }); }
	function boardOf(c) { return "tr-" + c.pace + "-" + c.len; }
	function boardName(b) { if (b === "tr-all") return "All paces combined"; var p = b.split("-"); return p[1] + " WPM · " + p[2].charAt(0).toUpperCase() + p[2].slice(1) + " passage"; }
	function boardOptions() { var o = ["tr-all"]; TC.PACES.forEach(function (p) { TC.LENGTHS.forEach(function (l) { o.push("tr-" + p + "-" + l); }); }); return o; }
	function lbSave() { try { localStorage.setItem(KEY + ":lb", JSON.stringify({ period: LB.period, board: LB.board })); } catch (e) {} }
	function drawLbControls() {
		el.lbperiod.innerHTML = ["day", "week", "all"].map(function (p) { return '<button type="button" data-v="' + p + '" aria-pressed="' + (LB.period === p) + '">' + PER[p] + "</button>"; }).join("");
		el.lbboard.innerHTML = boardOptions().map(function (b) { var n = b === "tr-all" ? Object.keys(LB.counts).reduce(function (a, k) { return a + LB.counts[k]; }, 0) : LB.counts[b]; return '<option value="' + b + '">' + esc(boardName(b)) + (n ? " (" + n + ")" : "") + "</option>"; }).join("");
		el.lbdev.innerHTML = ["", "k", "p", "t", "v"].map(function (v) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (LB.dev === v) + '">' + DEVS[v] + "</button>"; }).join("");
		el.lbboard.value = LB.board; el.lbmine.setAttribute("aria-pressed", String(LB.mine));
	}
	function until(ms) { var m = Math.max(1, Math.round((ms - Date.now()) / 60000)), h = Math.floor(m / 60); return h >= 24 ? Math.round(h / 24) + " days" : h ? h + " h " + (m % 60) + " min" : m + " min"; }
	function loadBoard() {
		var board = LB.board, period = LB.period, mine = LB.mine;
		el.lbbody.innerHTML = '<p class="tt-empty">Loading…</p>';
		fetch(API + (mine ? "?mine=" + store.pid + "&board=" : "?me=" + store.pid + "&board=") + encodeURIComponent(board) + "&period=" + period + (LB.dev && !mine ? "&dev=" + LB.dev : "")).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
			if (board !== LB.board || period !== LB.period || mine !== LB.mine) return;
			LB.data = j; LB.shown = 25; drawTable();
			if (mine) el.lbnote.textContent = j.total ? "Your last " + j.total + " posted result" + (j.total > 1 ? "s" : "") + ", newest first. ★ = your best on that test." : "";
			else el.lbnote.textContent = (j.total ? j.total + " score" + (j.total > 1 ? "s" : "") + ". " : "") + (j.resets ? PER[period] + " resets at 00:00 UTC, in " + until(j.resets) + ". " : "") + "Accuracy of " + MIN_ACC + "% or more counts.";
		}).catch(function () { if (board === LB.board && period === LB.period && mine === LB.mine) { el.lbbody.innerHTML = '<p class="tt-empty">The leaderboard could not be loaded. Try again in a moment.</p>'; el.lbnote.textContent = ""; } });
	}
	var SORTS = { d: ["When", -1], r: ["#", 1], n: ["Name", 1], b: ["Test", 1], w: ["WPM", -1], a: ["Accuracy", -1] };
	function drawTable() {
		var j = LB.data; if (!j) return;
		var combined = LB.board === "tr-all", mine = !!j.mine, words = el.lbfilter.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
		var cols = mine ? ["d"].concat(combined ? ["b"] : [], ["w", "a"]) : ["r", "n"].concat(combined ? ["b"] : [], ["w", "a"]);
		if (cols.indexOf(LB.sort.k) < 0) LB.sort = mine ? { k: "d", d: -1 } : { k: "r", d: 1 };
		var rows = j.rows.filter(function (x) { if (mine && LB.dev && (x.d || "k") !== LB.dev) return false; var hay = ((mine ? "" : x.n) + " " + (combined ? boardName(x.b) : "")).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) >= 0; }); });
		var k = LB.sort.k, d = LB.sort.d;
		rows = rows.slice().sort(function (x, y) { var a = k === "b" ? boardName(x.b) : x[k], b = k === "b" ? boardName(y.b) : y[k], c = typeof a === "string" ? a.localeCompare(b) : a - b; return (c * d) || (mine ? y.t - x.t : x.r - y.r); });
		function num(v) { return fmt(v, 1).replace(/\.0$/, ""); }
		function when(t) { var dt = new Date(t); return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
		function trMine(x) { return "<tr><td>" + esc(when(x.t)) + (combined ? '<span class="tt-sub">' + esc(boardName(x.b)) + "</span>" : "") + "</td>" + (combined ? '<td class="tt-c-b">' + esc(boardName(x.b)) + "</td>" : "") + "<td><strong>" + num(x.w) + "</strong>" + devIcon(x.d) + (x.pb ? ' <span class="tt-star" title="Your best on this test">★</span>' : "") + "</td><td>" + num(x.a) + "%</td></tr>"; }
		function tr(x) { return '<tr' + (x.me ? ' class="me"' : "") + "><td>" + x.r + "</td><td>" + esc(x.n) + (x.me ? " (you)" : "") + devIcon(x.d) + (combined ? '<span class="tt-sub">' + esc(boardName(x.b)) + "</span>" : "") + "</td>" + (combined ? '<td class="tt-c-b">' + esc(boardName(x.b)) + "</td>" : "") + "<td><strong>" + num(x.w) + "</strong></td><td>" + num(x.a) + "%</td></tr>"; }
		var body = rows.slice(0, LB.shown).map(mine ? trMine : tr).join("");
		if (!mine && j.you && !words.length && !j.rows.some(function (x) { return x.me; })) body += tr({ r: j.you.r, n: store.name || "You", w: j.you.w, a: j.you.a, me: 1, b: LB.board });
		var head = cols.map(function (c) { var on = LB.sort.k === c; return '<th scope="col"' + (c === "b" ? ' class="tt-c-b"' : "") + ' aria-sort="' + (on ? (LB.sort.d > 0 ? "ascending" : "descending") : "none") + '"><button type="button" data-k="' + c + '">' + SORTS[c][0] + (on ? (LB.sort.d > 0 ? " ▲" : " ▼") : "") + "</button></th>"; }).join("");
		var more = rows.length > LB.shown ? '<div class="tt-hbtns"><button type="button" class="tu-btn tu-btn--ghost" id="tc-lbmore">Show more (' + (rows.length - LB.shown) + ")</button></div>" : "";
		el.lbbody.innerHTML = !j.rows.length ? '<p class="tt-empty">' + (mine ? "You have not posted a result for this view yet." : "No scores here yet. Finish a ranked passage test and post yours to be first.") + "</p>" : !rows.length ? '<p class="tt-empty">No scores match "' + esc(el.lbfilter.value) + '".</p>' :
			'<div class="tt-tablewrap"><table class="tt-table tt-lbtable"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>" + more;
		if ($("tc-lbmore")) $("tc-lbmore").onclick = function () { LB.shown += 25; drawTable(); };
	}
	el.lbbody.addEventListener("click", function (e) { var b = e.target.closest("th button"); if (!b) return; var k = b.getAttribute("data-k"); LB.sort = LB.sort.k === k ? { k: k, d: -LB.sort.d } : { k: k, d: SORTS[k][1] }; drawTable(); });
	el.lbfilter.addEventListener("input", function () { LB.shown = 25; drawTable(); });
	el.lbperiod.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; LB.period = b.getAttribute("data-v"); lbSave(); drawLbControls(); loadBoard(); loadCounts(); });
	el.lbboard.addEventListener("change", function () { LB.board = el.lbboard.value; lbSave(); loadBoard(); });
	el.lbdev.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; LB.dev = b.getAttribute("data-v"); drawLbControls(); if (LB.mine) drawTable(); else loadBoard(); });
	el.lbmine.addEventListener("click", function () { LB.mine = !LB.mine; LB.sort = LB.mine ? { k: "d", d: -1 } : { k: "r", d: 1 }; drawLbControls(); loadBoard(); });
	function loadCounts(then) {
		var period = LB.period;
		fetch(API + "?summary=1&set=tr&period=" + period).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { if (period !== LB.period) return; LB.counts = j.counts || {}; if (then) then(); drawLbControls(); }).catch(function () { if (then) then(); });
	}
	function lbStart() {
		try { var sv = JSON.parse(localStorage.getItem(KEY + ":lb") || "null"); if (sv && PER[sv.period] && boardOptions().indexOf(sv.board) >= 0) { LB.period = sv.period; LB.board = sv.board; } } catch (e) {}
		drawLbControls(); loadCounts(function () { drawLbControls(); loadBoard(); });
	}

	/* ---------- posting a score ---------- */
	function canPost(R) { return ranked(R.c) && R.r.acc >= MIN_ACC; }
	function postScore(R, name) {
		if (R.posted) return Promise.resolve({ ok: true, ranks: R.posted });
		if (!R.tok) return Promise.resolve({ ok: false, error: "This test could not be verified. Finish a new ranked test and post that." });
		return lbApi({ a: "submit", t: R.tok, pid: store.pid, name: name, board: boardOf(R.c), wpm: Math.round(R.r.wpm * 10) / 10, acc: Math.round(R.r.acc * 10) / 10, secs: Math.round(R.r.secs * 10) / 10, d: myDevice() }).then(function (j) {
			if (j.ok) { R.posted = j.ranks; R.tok = ""; store.name = name; save(); LB.period = "day"; lbSave(); drawLbControls(); loadBoard(); loadCounts(); }
			return j;
		}, function () { return { ok: false, error: "Could not reach the leaderboard. Try again." }; });
	}
	function ranksText(k) { return "You are #" + k.day + " today, #" + k.week + " this week, #" + k.all + " all time."; }
	function postBox(R) {
		var b = '<div class="tt-post" id="tc-post">', r = R.r, c = R.c;
		if (!ranked(c)) return b + '<span class="tu-note">This test is practice only (the leaderboard takes passages with Wait for me, Captions and Strict off).</span></div>';
		if (r.acc < MIN_ACC) return b + '<span class="tu-note">Leaderboard scores need ' + MIN_ACC + "% accuracy or more.</span></div>";
		return b + '<label for="tc-name" class="tu-label">Post to the leaderboard</label><input id="tc-name" class="tu-input" maxlength="16" placeholder="Your name" autocomplete="nickname" spellcheck="false" value="' + esc(store.name) + '"><button type="button" class="tu-btn tu-btn--primary" id="tc-postgo">Post my score</button><span class="tu-note" id="tc-postmsg">Posts your name, speed and accuracy to the public board for ' + esc(boardName(boardOf(c))) + ".</span></div>";
	}
	function wirePost(R) {
		var go = $("tc-postgo"); if (!go) return;
		var msg = $("tc-postmsg"), inp = $("tc-name");
		function done() { go.disabled = true; go.textContent = "Posted ✓"; msg.textContent = ranksText(R.posted); }
		if (R.posted) { done(); return; }
		R.onPosted = done;
		function post() { var name = inp.value.trim().replace(/\s+/g, " "); if (!name) { msg.textContent = "Type a name first."; inp.focus(); return; } go.disabled = true; msg.textContent = "Posting…"; postScore(R, name).then(function (j) { if (j.ok) done(); else { go.disabled = false; msg.textContent = j.error || "Could not post the score."; } }); }
		go.onclick = post; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); post(); } });
	}
	var modal = null;
	function closeModal() { if (!modal) return; modal.remove(); modal = null; document.removeEventListener("keydown", modalKey, true); }
	function modalKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeModal(); } }
	function openModal(R) {
		if (modal) return; var r = R.r, c = R.c;
		modal = document.createElement("div"); modal.className = "tt-modal"; modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "tc-mtitle");
		modal.innerHTML = '<div class="tt-mcard"><h2 id="tc-mtitle">Save your result</h2><div class="tt-mscore"><b>' + fmt(r.wpm, 0) + '</b> WPM <span>·</span> <b>' + fmt(r.acc, 1).replace(/\.0$/, "") + '%</b> accuracy</div>' +
			'<p class="tu-note">' + esc(boardName(boardOf(c))) + '. Put it on the daily, weekly and all-time leaderboard.</p><label for="tc-mname" class="tu-label">Your name (shown publicly)</label>' +
			'<input id="tc-mname" class="tu-input" maxlength="16" placeholder="Your name" autocomplete="nickname" spellcheck="false" value="' + esc(store.name) + '"><p class="tt-mmsg" id="tc-mmsg" aria-live="polite"></p>' +
			'<div class="tt-mbtns"><button type="button" class="tu-btn tu-btn--primary" id="tc-mgo">Post my score</button><button type="button" class="tu-btn" id="tc-mno">Not now</button></div><button type="button" class="tt-mlink" id="tc-mnever">Don\'t show this pop-up again</button></div>';
		root.appendChild(modal);
		var inp = $("tc-mname"), go = $("tc-mgo"), msg = $("tc-mmsg"), card = modal.firstChild;
		function post() {
			var name = inp.value.trim().replace(/\s+/g, " "); if (!name) { msg.textContent = "Type a name first."; inp.focus(); return; }
			go.disabled = true; msg.textContent = "Posting…";
			postScore(R, name).then(function (j) {
				if (!j.ok) { go.disabled = false; msg.textContent = j.error || "Could not post the score."; return; }
				if (R.onPosted) R.onPosted();
				card.innerHTML = '<h2 id="tc-mtitle">Posted ✓</h2><p class="tt-mscore">' + esc(ranksText(j.ranks)) + '</p><div class="tt-mbtns"><button type="button" class="tu-btn tu-btn--primary" id="tc-mview">See the leaderboard</button><button type="button" class="tu-btn" id="tc-mnext">Next test</button></div>';
				$("tc-mview").onclick = function () { closeModal(); try { el.lb.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} };
				$("tc-mnext").onclick = function () { closeModal(); reset(true); try { root.scrollIntoView({ behavior: "smooth" }); } catch (e) {} };
				$("tc-mview").focus();
			});
		}
		go.onclick = post; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); post(); } });
		$("tc-mno").onclick = closeModal;
		$("tc-mnever").onclick = function () { store.noPop = true; save(); closeModal(); toast("OK. You can still post from the result below."); };
		modal.addEventListener("pointerdown", function (e) { if (e.target === modal) closeModal(); });
		document.addEventListener("keydown", modalKey, true);
		if (store.name) go.focus(); else inp.focus();
	}

	/* ---------- go ---------- */
	initSpeech(); reset(true); drawHistory(); lbStart();
})();
