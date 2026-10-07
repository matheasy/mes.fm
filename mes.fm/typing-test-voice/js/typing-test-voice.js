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

/* MES Voice Typing Test -- UI. Scoring + passages come from the transcription test's lib (TC). You read a passage aloud, the browser's SpeechRecognition types it, the result is scored against the passage.
 * State: localStorage "mes-voicetest:v1" (settings, name); the person id / name are shared with the Typing Test. Nothing is uploaded except a posted score (name, speed, accuracy); audio never touches this site. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tv");
	if (!root || typeof TC === "undefined") return;
	var KEY = "mes-voicetest:v1", API = "/api/typing-leaderboard", MIN_ACC = 90, LENS = ["short", "medium", "long"];
	var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

	/* ---------- storage ---------- */
	var store = { opts: { len: "medium", lang: "", strict: false }, pid: "", name: "", best: {} }, memOnly = false;
	function rand16() { var rb = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(rb); return Array.prototype.map.call(rb, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
	try {
		var o = JSON.parse(localStorage.getItem(KEY) || "null");
		if (o && typeof o === "object") { store.opts = Object.assign(store.opts, o.opts || {}); store.pid = o.pid || ""; store.name = typeof o.name === "string" ? o.name.slice(0, 16) : ""; store.best = o.best && typeof o.best === "object" ? o.best : {}; }
		if (!store.pid || !store.name) { var tt = JSON.parse(localStorage.getItem("mes-typingtest:v1") || "null"); if (tt) { if (!store.pid && /^[a-f0-9]{16}$/.test(tt.pid)) store.pid = tt.pid; if (!store.name && typeof tt.name === "string") store.name = tt.name.slice(0, 16); } }
	} catch (e) { memOnly = true; }
	if (!/^[a-f0-9]{16}$/.test(store.pid)) store.pid = rand16();
	function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { memOnly = true; } }
	var S = store.opts;
	if (LENS.indexOf(S.len) < 0) S.len = "medium";
	if (!S.lang) { var nl = String(navigator.language || "en-US"); S.lang = /^en-/i.test(nl) ? nl.replace("_", "-") : "en-US"; }
	save();

	/* ---------- elements ---------- */
	var el = {};
	["len", "lang", "rules", "note", "banner", "passage", "t", "w", "p", "status", "statustext", "mic", "heard", "start", "done", "new", "result", "toast", "lb", "lbperiod", "lbboard", "lbfilter", "lbmine", "lbbody", "lbnote"].forEach(function (k) { el[k] = $("tv-" + k); });
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmt(n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); }
	function toast(msg) { el.toast.textContent = msg; el.toast.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.toast.classList.remove("is-on"); }, 2400); }
	function clock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
	function status(html, on) { el.statustext.innerHTML = html; el.mic.classList.toggle("is-on", !!on); el.status.classList.toggle("is-play", !!on); }

	/* ---------- the test ---------- */
	var T = { seed: "", passage: "", last: "", rec: null, running: false, finished: false, base: "", fin: "", int: "", t0: 0, tLast: 0, tok: "", timer: 0, silence: 0, restarts: 0, R: null };
	function heardText() { return (T.base + " " + T.fin + " " + T.int).replace(/\s+/g, " ").trim(); }
	function newPassage() {
		T.seed = TC.newSeed(); T.passage = TC.passageFor(S.len, T.seed, T.last); T.last = T.passage;
		el.passage.textContent = T.passage;
	}
	function reset(fresh) {
		stopRec(); clearInterval(T.timer); clearTimeout(T.silence);
		T.running = false; T.finished = false; T.base = T.fin = T.int = ""; T.t0 = T.tLast = 0; T.tok = ""; T.restarts = 0;
		if (fresh || !T.passage) newPassage();
		el.heard.innerHTML = "<i>Your words will appear here as you speak.</i>"; el.t.textContent = "0:00"; el.w.textContent = "0"; el.p.textContent = "0%";
		el.result.hidden = true; el.start.disabled = !SR; el.start.textContent = "🎤 Start"; el.done.disabled = true;
		status(SR ? "Press <b>Start</b>, allow the microphone, then read the text above out loud." : "This browser can't do speech recognition. Try Chrome, Edge or Safari.", false);
	}
	function stopRec() { var r = T.rec; T.rec = null; if (r) { r.onend = r.onresult = r.onerror = null; try { r.abort(); } catch (e) {} } }
	function makeRec() {
		var r = new SR(); r.lang = S.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
		r.onresult = function (e) {
			var fin = "", intr = "", i;
			for (i = 0; i < e.results.length; i++) { var x = e.results[i]; if (x.isFinal) fin += x[0].transcript + " "; else intr += x[0].transcript; }
			T.fin = fin; T.int = intr;
			var now = performance.now(); T.tLast = now;
			if (!T.t0 && heardText()) { T.t0 = now; startToken(); }
			paint(); armSilence();
		};
		r.onerror = function (e) {
			if (e.error === "no-speech" || e.error === "aborted") return;
			if (e.error === "not-allowed" || e.error === "service-not-allowed") { finishFail("The microphone is blocked. Allow it in the address bar (the camera / lock icon), then press Start again."); return; }
			if (e.error === "audio-capture") { finishFail("No microphone found."); return; }
			if (e.error === "network") { finishFail("Speech recognition needs an internet connection (the browser sends the audio to its speech service)."); return; }
			if (e.error === "language-not-supported") { finishFail("That language is not supported by this browser."); return; }
		};
		r.onend = function () {   // Chrome ends a "continuous" session after a pause or a minute or so: keep what was heard and start another
			if (!T.running || T.rec !== r) return;
			T.base = (T.base + " " + T.fin).trim(); T.fin = ""; T.int = "";
			if (++T.restarts > 60) { finish(); return; }
			setTimeout(function () { if (!T.running) return; T.rec = makeRec(); try { T.rec.start(); } catch (e) {} }, 120);
		};
		return r;
	}
	function finishFail(msg) { stopRec(); clearInterval(T.timer); T.running = false; status(msg, false); el.start.disabled = false; el.start.textContent = "🎤 Try again"; el.done.disabled = true; }
	function start() {
		if (!SR || T.running) return;
		reset(false); T.running = true; el.start.disabled = true; el.done.disabled = false;
		T.rec = makeRec(); try { T.rec.start(); } catch (e) { finishFail("Could not start the microphone. Reload the page and try again."); return; }
		status("Listening… <b>read the text above out loud</b>. The clock starts with your first word.", true);
		clearInterval(T.timer); T.timer = setInterval(function () { if (T.t0) el.t.textContent = clock(performance.now() - T.t0); }, 250);
	}
	function paint() {
		var h = heardText(), n = TC.norm(h, false) ? TC.norm(h, false).split(" ").length : 0, tot = TC.norm(T.passage, false).split(" ").length;
		el.heard.textContent = h || "";
		if (!h) el.heard.innerHTML = "<i>Listening…</i>";
		el.w.textContent = n; el.p.textContent = Math.min(100, Math.round(100 * n / tot)) + "%";
		el.heard.scrollTop = el.heard.scrollHeight;
	}
	// the whole passage has been read and the person has stopped talking: finish by itself
	function armSilence() {
		clearTimeout(T.silence); if (!T.running) return;
		var n = TC.norm(heardText(), false).split(" ").length, tot = TC.norm(T.passage, false).split(" ").length;
		if (n >= Math.ceil(tot * 0.9)) T.silence = setTimeout(function () { if (T.running) finish(); }, 2600);
	}
	function startToken() { T.tok = ""; lbApi({ a: "start" }).then(function (r) { if (r && r.t) T.tok = r.t; }, function () {}); }

	function finish() {
		if (!T.running) return; clearTimeout(T.silence); clearInterval(T.timer);
		var text = heardText(); stopRec(); T.running = false; T.finished = true;
		var secs = T.t0 ? Math.max(1, (T.tLast - T.t0) / 1000) : 0, nw = TC.norm(text, false) ? TC.norm(text, false).split(" ").length : 0;
		el.done.disabled = true; el.start.disabled = false; el.start.textContent = "🎤 Again (same text)";
		if (nw < 3 || !secs) { status("Not enough speech heard to score. Check your microphone and try again.", false); return; }
		var r = TC.score(T.passage, text, S.strict, secs / 60);
		el.t.textContent = clock(secs * 1000);
		var c = { len: S.len, strict: S.strict };
		T.R = { r: r, c: c, tok: T.tok, posted: null, secs: secs, heard: text };
		var key = S.len + (S.strict ? "s" : ""); if (!store.best[key] || r.wpm > store.best[key]) { T.R.pb = store.best[key] !== undefined; store.best[key] = Math.round(r.wpm * 10) / 10; save(); }
		status("Done. Your score is below.", false); showResult(T.R);
		try { el.result.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
	}
	function diffHtml(ops) {
		return ops.map(function (o) {
			if (o.t === "ok") return '<span class="ok">' + esc(o.r) + "</span>";
			if (o.t === "sub") return '<span class="sub"><s>' + esc(o.w) + "</s><b>" + esc(o.r) + "</b></span>";
			if (o.t === "del") return '<span class="del" title="Not heard">' + esc(o.r) + "</span>";
			return '<span class="ins"><s>' + esc(o.w) + "</s></span>";
		}).join(" ");
	}
	function rankNote(wpm, acc) {
		if (acc < 80) return "Recognition missed a lot. Speak a little slower and clearer, and check your microphone.";
		if (acc < 90) return "Close. Over 90% accuracy gets your score on the leaderboard.";
		if (wpm >= 170) return "Auctioneer speed, and it kept up!";
		if (wpm >= 140) return "Fast and accurate: faster than most people talk.";
		if (wpm >= 110) return "A good, natural dictation pace.";
		return "Accurate. Try a slightly quicker pace next time.";
	}
	function showResult(R) {
		var r = R.r;
		el.result.hidden = false;
		el.result.innerHTML = '<div class="tt-rhead"><div class="tt-rank">' + (R.pb && r.wpm >= store.best[R.c.len + (R.c.strict ? "s" : "")] ? '<span class="tt-pb">★ New personal best</span>' : "") + "<small>" + esc(rankNote(r.wpm, r.acc)) + '</small></div><div class="tu-note">' + esc(R.c.len + " passage" + (R.c.strict ? ", strict" : "") + ", " + S.lang) + "</div></div>" +
			'<div class="tt-tiles"><div class="tt-tile tt-tile--big"><b>' + fmt(r.wpm, 0) + "</b><span>WPM</span></div>" +
			'<div class="tt-tile tt-tile--big"><b>' + fmt(r.acc, 1).replace(/\.0$/, "") + "%</b><span>accuracy</span></div>" +
			'<div class="tt-tile"><b>' + r.ok + "/" + r.words + "</b><span>words right</span></div>" +
			'<div class="tt-tile"><b>' + fmt(R.secs, R.secs < 10 ? 1 : 0) + "s</b><span>time</span></div></div>" +
			'<div class="tt-detail">Words: <strong>' + r.ok + "</strong> right · <strong>" + r.wrong + "</strong> misheard · <strong>" + r.missed + "</strong> skipped · <strong>" + r.extra + "</strong> extra.</div>" +
			'<h3 class="tt-h3">The passage against what was heard</h3><div class="tc-diff">' + diffHtml(r.ops) + "</div>" +
			(canPost(R) ? postBox(R) : '<div class="tt-post"><span class="tu-note">' + (r.acc < MIN_ACC ? "Leaderboard scores need " + MIN_ACC + "% accuracy or more." : "") + "</span></div>") +
			'<div class="tt-hbtns"><button type="button" class="tu-btn tu-btn--primary" id="tv-next">New passage</button><button type="button" class="tu-btn" id="tv-again">Same passage again</button></div>';
		$("tv-next").onclick = function () { reset(true); try { root.scrollIntoView({ behavior: "smooth" }); } catch (e) {} };
		$("tv-again").onclick = function () { reset(false); start(); };
		wirePost(R);
	}

	/* ---------- leaderboard (boards tv-short / tv-medium / tv-long, tv-all; daily / weekly reset 00:00 UTC) ---------- */
	var PER = { day: "Today", week: "This week", all: "All time" };
	var LB = { period: "day", board: "tv-all", counts: {}, data: null, mine: false, shown: 25 };
	function lbSave() { try { localStorage.setItem(KEY + ":lb", JSON.stringify({ period: LB.period, board: LB.board })); } catch (e) {} }
	function lbApi(body) { return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { j.status = r.status; return j; }); }); }
	function boardOf(c) { return "tv-" + c.len; }
	function boardName(b) { return b === "tv-all" ? "All passages combined" : "Passage: " + b.split("-")[1]; }
	function boardOptions() { return ["tv-all"].concat(LENS.map(function (l) { return "tv-" + l; })); }
	function drawLbControls() {
		el.lbperiod.innerHTML = ["day", "week", "all"].map(function (p) { return '<button type="button" data-v="' + p + '" aria-pressed="' + (LB.period === p) + '">' + PER[p] + "</button>"; }).join("");
		el.lbboard.innerHTML = boardOptions().map(function (b) { var n = b === "tv-all" ? Object.keys(LB.counts).reduce(function (a, k) { return a + LB.counts[k]; }, 0) : LB.counts[b]; return '<option value="' + b + '">' + esc(boardName(b)) + (n ? " (" + n + ")" : "") + "</option>"; }).join("");
		el.lbboard.value = LB.board;
	}
	function until(ms) { var m = Math.max(1, Math.round((ms - Date.now()) / 60000)), h = Math.floor(m / 60); return h >= 24 ? Math.round(h / 24) + " days" : h ? h + " h " + (m % 60) + " min" : m + " min"; }
	function loadBoard() {
		var board = LB.board, period = LB.period, mine = LB.mine;
		el.lbbody.innerHTML = '<p class="tt-empty">Loading…</p>';
		fetch(API + (mine ? "?mine=" + store.pid + "&board=" : "?me=" + store.pid + "&board=") + encodeURIComponent(board) + "&period=" + period).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
			if (board !== LB.board || period !== LB.period || mine !== LB.mine) return;
			LB.data = j; LB.shown = 25; drawTable();
			el.lbnote.textContent = mine ? (j.total ? "Your last " + j.total + " posted result" + (j.total > 1 ? "s" : "") + ", newest first." : "") : (j.total ? j.total + " score" + (j.total > 1 ? "s" : "") + ". " : "") + (j.resets ? PER[period] + " resets at 00:00 UTC, in " + until(j.resets) + ". " : "") + "Accuracy of " + MIN_ACC + "% or more counts. Self-reported.";
		}).catch(function () { el.lbbody.innerHTML = '<p class="tt-empty">The leaderboard could not be loaded. Try again in a moment.</p>'; el.lbnote.textContent = ""; });
	}
	function num(v) { return fmt(v, 1).replace(/\.0$/, ""); }
	function drawTable() {
		var j = LB.data; if (!j) return; var combined = LB.board === "tv-all", words = el.lbfilter.value.toLowerCase().trim().split(/\s+/).filter(Boolean), mine = !!j.mine;
		var rows = j.rows.filter(function (x) { var hay = ((mine ? "" : x.n) + " " + boardName(x.b)).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) >= 0; }); });
		function when(t) { var d = new Date(t); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
		var body = rows.slice(0, LB.shown).map(function (x) {
			return mine ? "<tr><td>" + esc(when(x.t)) + '<span class="tt-sub">' + esc(boardName(x.b)) + "</span></td><td><strong>" + num(x.w) + "</strong> 🎤" + (x.pb ? ' <span class="tt-star" title="Your best on this test">★</span>' : "") + "</td><td>" + num(x.a) + "%</td></tr>"
				: '<tr' + (x.me ? ' class="me"' : "") + "><td>" + x.r + "</td><td>" + esc(x.n) + (x.me ? " (you)" : "") + ' <span class="tt-dev" title="Spoken with voice typing" aria-label="voice">🎤</span>' + (combined ? '<span class="tt-sub">' + esc(boardName(x.b)) + "</span>" : "") + "</td><td><strong>" + num(x.w) + "</strong></td><td>" + num(x.a) + "%</td></tr>";
		}).join("");
		var head = mine ? "<th>When</th><th>WPM</th><th>Accuracy</th>" : "<th>#</th><th>Name</th><th>WPM</th><th>Accuracy</th>";
		var more = rows.length > LB.shown ? '<div class="tt-hbtns"><button type="button" class="tu-btn tu-btn--ghost" id="tv-lbmore">Show more (' + (rows.length - LB.shown) + ")</button></div>" : "";
		el.lbbody.innerHTML = !j.rows.length ? '<p class="tt-empty">' + (mine ? "You have not posted a result for this view yet." : "No scores here yet. Read a passage and post yours to be first.") + "</p>" : !rows.length ? '<p class="tt-empty">No scores match.</p>' :
			'<div class="tt-tablewrap"><table class="tt-table tt-lbtable"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>" + more;
		if ($("tv-lbmore")) $("tv-lbmore").onclick = function () { LB.shown += 25; drawTable(); };
	}
	el.lbfilter.addEventListener("input", function () { LB.shown = 25; drawTable(); });
	function loadCounts(then) {
		var period = LB.period;
		fetch(API + "?summary=1&set=tv&period=" + period).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { if (period !== LB.period) return; LB.counts = j.counts || {}; if (then) then(); drawLbControls(); }).catch(function () { if (then) then(); });
	}
	el.lbperiod.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; LB.period = b.getAttribute("data-v"); lbSave(); drawLbControls(); loadBoard(); loadCounts(); });
	el.lbboard.addEventListener("change", function () { LB.board = el.lbboard.value; lbSave(); loadBoard(); });
	el.lbmine.addEventListener("click", function () { LB.mine = !LB.mine; el.lbmine.setAttribute("aria-pressed", String(LB.mine)); loadBoard(); });
	function lbStart() {
		try { var sv = JSON.parse(localStorage.getItem(KEY + ":lb") || "null"); if (sv && PER[sv.period] && boardOptions().indexOf(sv.board) >= 0) { LB.period = sv.period; LB.board = sv.board; } } catch (e) {}
		drawLbControls(); loadCounts(function () { drawLbControls(); loadBoard(); });
	}
	function canPost(R) { return R.r.acc >= MIN_ACC && R.r.wpm <= 350; }
	function postScore(R, name) {
		if (R.posted) return Promise.resolve({ ok: true, ranks: R.posted });
		if (!R.tok) return Promise.resolve({ ok: false, error: "Still getting a verification code for this test… try again in a second." });
		return lbApi({ a: "submit", t: R.tok, pid: store.pid, name: name, board: boardOf(R.c), wpm: Math.round(R.r.wpm * 10) / 10, acc: Math.round(R.r.acc * 10) / 10, secs: Math.round(R.secs * 10) / 10, d: "v" }).then(function (j) {
			if (j.ok) { R.posted = j.ranks; R.tok = ""; store.name = name; save(); LB.period = "day"; lbSave(); drawLbControls(); loadBoard(); loadCounts(); }
			return j;
		}, function () { return { ok: false, error: "Could not reach the leaderboard. Try again." }; });
	}
	function postBox(R) {
		return '<div class="tt-post" id="tv-post"><label for="tv-name" class="tu-label">Post to the leaderboard</label><input id="tv-name" class="tu-input" maxlength="16" placeholder="Your name" autocomplete="nickname" spellcheck="false" value="' + esc(store.name) + '"><button type="button" class="tu-btn tu-btn--primary" id="tv-postgo">Post my score</button><span class="tu-note" id="tv-postmsg">Posts your name, speed and accuracy to the public voice board for ' + esc(boardName(boardOf(R.c))) + ".</span></div>";
	}
	function wirePost(R) {
		var go = $("tv-postgo"); if (!go) return; var msg = $("tv-postmsg"), inp = $("tv-name");
		function done() { go.disabled = true; go.textContent = "Posted ✓"; msg.textContent = "You are #" + R.posted.day + " today, #" + R.posted.week + " this week, #" + R.posted.all + " all time."; }
		if (R.posted) { done(); return; }
		function post() {
			var name = inp.value.trim().replace(/\s+/g, " "); if (!name) { msg.textContent = "Type a name first."; inp.focus(); return; }
			go.disabled = true; msg.textContent = "Posting…";
			postScore(R, name).then(function (j) { if (j.ok) done(); else { go.disabled = false; msg.textContent = j.error || "Could not post the score."; } });
		}
		go.onclick = post; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); post(); } });
	}

	/* ---------- controls ---------- */
	function drawControls() {
		[].forEach.call(el.len.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === S.len)); });
		[].forEach.call(el.rules.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(!!S[b.getAttribute("data-f")])); });
		el.lang.value = S.lang; if (el.lang.value !== S.lang) { var op = document.createElement("option"); op.value = op.textContent = S.lang; el.lang.appendChild(op); el.lang.value = S.lang; }
	}
	el.len.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.len = b.getAttribute("data-v"); save(); drawControls(); reset(true); });
	el.rules.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var f = b.getAttribute("data-f"); S[f] = !S[f]; save(); drawControls(); });
	el.lang.addEventListener("change", function () { S.lang = el.lang.value; save(); });
	el.start.addEventListener("click", function () { if (T.finished) reset(false); start(); });
	el.done.addEventListener("click", finish);
	el.new.addEventListener("click", function () { reset(true); });
	document.addEventListener("keydown", function (e) {
		if (!root.offsetParent) return; var t = e.target && e.target.tagName;
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && T.running) { e.preventDefault(); finish(); }
		else if (e.key === "Escape" && !/INPUT|SELECT|TEXTAREA/.test(t || "")) { e.preventDefault(); reset(true); }
	});
	window.addEventListener("beforeunload", function () { stopRec(); });

	if (!SR) el.note.textContent = "Speech recognition isn't available in this browser. Open this page in Chrome, Edge or Safari. (Firefox does not support it yet.)";
	else el.note.textContent = "Chrome sends your audio to Google's speech service to turn it into text (Safari uses Apple's). This page never records or stores audio.";
	drawControls(); reset(true); lbStart();
})();
