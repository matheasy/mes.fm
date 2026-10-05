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
