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

/* MES Typing Test -- UI. Logic lives in lib.js (TT). State: localStorage "mes-typingtest:v1" (settings, history, lifetime key stats); nothing is uploaded. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tt");
	if (!root || typeof TT === "undefined") return;
	var KEY = "mes-typingtest:v1";
	var LENS = { time: [15, 30, 60, 120], words: [10, 25, 50, 100], passage: ["short", "medium", "long"] };
	var LEN_LABEL = { time: "Seconds", words: "Words", passage: "Length" };
	var DEF = { mode: "time", len: { time: 30, words: 25, passage: "medium" }, diff: "medium", caps: false, punct: false, nums: false, strict: false, nobs: false, live: true, show: false };

	/* ---------- storage ---------- */
	var store = { opts: JSON.parse(JSON.stringify(DEF)), hist: [], keys: {} }, memOnly = false;
	try {
		var raw = localStorage.getItem(KEY);
		if (raw) { var o = JSON.parse(raw); if (o && typeof o === "object") { store.opts = Object.assign(store.opts, o.opts || {}); store.opts.len = Object.assign({}, DEF.len, (o.opts || {}).len || {}); store.hist = Array.isArray(o.hist) ? o.hist : []; store.keys = o.keys || {}; } }
	} catch (e) { memOnly = true; }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { memOnly = true; } }
	var S = store.opts;

	/* ---------- URL (challenge / share links) ---------- */
	var challenge = null;
	(function fromUrl() {
		var q = new URLSearchParams(location.search);
		if (!q.has("m") && !q.has("seed")) return;
		var m = q.get("m"); if (LENS[m] || m === "custom") S.mode = m === "custom" ? "time" : m;
		var l = q.get("l"); if (l && LENS[S.mode] && LENS[S.mode].map(String).indexOf(l) >= 0) S.len[S.mode] = isNaN(+l) ? l : +l;
		var d = q.get("d"); if (TT.DIFFS[d]) S.diff = d;
		["caps", "punct", "nums", "strict", "nobs"].forEach(function (k) { if (q.has(k)) S[k] = q.get(k) === "1"; });
		if (q.get("seed")) challenge = { seed: q.get("seed").slice(0, 16), beat: +q.get("beat") || 0 };
	})();

	/* ---------- elements ---------- */
	var el = {};
	["mode", "len", "lenwrap", "lenlabel", "diff", "diffwrap", "mix", "rules", "diffnote", "banner", "custom", "customtext", "customgo", "live", "t", "tl", "w", "a", "stage", "view", "words", "caret", "in", "focus", "restart", "new", "result", "hist", "histbody", "histsub", "toast"].forEach(function (k) { el[k] = $("tt-" + k); });

	/* ---------- test state ---------- */
	var T = { seed: "", gen: null, sess: null, wordEls: [], letterEls: [], limit: 0, running: false, timer: 0, practice: null, lastResult: null, customText: "", lastCfg: null };
	var ENDS = { time: false, words: true, passage: true, custom: true };

	function cfg() { return { mode: S.mode, len: S.len[S.mode], diff: S.diff, caps: S.caps, punct: S.punct, nums: S.nums, strict: S.strict, nobs: S.nobs, practice: T.practice ? 1 : 0 }; }
	function cfgKey(c) { return [c.mode, c.len, c.diff, +c.caps, +c.punct, +c.nums, +c.strict, +c.nobs, c.practice || 0].join("|"); }
	function textOpts() { return { diff: S.diff, caps: S.caps, punct: S.punct, nums: S.nums, letters: T.practice }; }
	function toast(msg) { el.toast.textContent = msg; el.toast.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.toast.classList.remove("is-on"); }, 2200); }

	/* ---------- controls ---------- */
	function setPressed(group, attr, val) { Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute(attr) === String(val))); }); }
	function drawControls() {
		setPressed(el.mode, "data-v", S.mode);
		var lens = LENS[S.mode];
		el.lenwrap.hidden = !lens; el.diffwrap.hidden = S.mode === "passage" || S.mode === "custom"; el.mix.hidden = S.mode === "passage" || S.mode === "custom";
		el.custom.hidden = S.mode !== "custom";
		if (lens) {
			el.lenlabel.textContent = LEN_LABEL[S.mode];
			el.len.innerHTML = lens.map(function (v) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (S.len[S.mode] === v) + '">' + (typeof v === "string" ? v.charAt(0).toUpperCase() + v.slice(1) : v) + "</button>"; }).join("");
		}
		setPressed(el.diff, "data-v", S.diff);
		var d = TT.DIFFS[S.diff];
		el.diffnote.textContent = T.practice ? "Weak-key practice: words that contain " + T.practice.map(function (c) { return c.toUpperCase(); }).join(", ") + "." : S.mode === "passage" ? "Original passages of different lengths: real sentences with capitals and punctuation." : S.mode === "custom" ? "Your own text. It stays in your browser." : d.note;
		Array.prototype.forEach.call(el.mix.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(!!S[b.getAttribute("data-f")])); });
		Array.prototype.forEach.call(el.rules.querySelectorAll("button"), function (b) { var f = b.getAttribute("data-f"); b.setAttribute("aria-pressed", String(f === "strict" ? S.strict : f === "nobs" ? S.nobs : f === "show" ? S.show : S.live)); });
		el.live.classList.toggle("is-hidden", !S.live && T.running);
	}
	function applyDiffDefaults(d) { var x = TT.DIFFS[d]; S.caps = x.caps; S.punct = x.punct; S.nums = x.nums; }

	el.mode.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.mode = b.getAttribute("data-v"); T.practice = null; challenge = null; save(); build(true); if (S.mode === "custom") el.customtext.focus(); });
	el.len.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var v = b.getAttribute("data-v"); S.len[S.mode] = isNaN(+v) ? v : +v; challenge = null; save(); build(true); });
	el.diff.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.diff = b.getAttribute("data-v"); applyDiffDefaults(S.diff); T.practice = null; challenge = null; save(); build(true); });
	el.mix.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var f = b.getAttribute("data-f"); S[f] = !S[f]; challenge = null; save(); build(true); });
	el.rules.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var f = b.getAttribute("data-f"); if (f === "strict") S.strict = !S.strict; else if (f === "nobs") S.nobs = !S.nobs; else if (f === "show") S.show = !S.show; else S.live = !S.live; save();
		if (f === "show") { drawControls(); T.wordEls.forEach(function (_, i) { paintWord(i); }); focusIn(); } else build(f === "live" ? false : true); });
	el.customgo.addEventListener("click", function () { T.customText = el.customtext.value; if (!TT.customWords(T.customText).length) { toast("Paste some text first."); return; } build(true); focusIn(); });
	el.restart.addEventListener("click", function () { build(false); focusIn(); });
	el.new.addEventListener("click", function () { build(true); focusIn(); });

	/* ---------- building a test ---------- */
	function build(fresh) {
		clearInterval(T.timer); T.running = false; T.lastResult = null;
		if (fresh || !T.seed) T.seed = (challenge && challenge.seed && !T.usedChallenge) ? challenge.seed : TT.newSeed();
		if (challenge && T.seed === challenge.seed) T.usedChallenge = true;
		var words, mode = S.mode;
		if (mode === "custom") { words = TT.customWords(T.customText, 600); if (!words.length) words = ["Paste", "your", "own", "text", "above", "and", "press", "start."]; T.gen = null; }
		else if (mode === "passage") { words = TT.passageWords(S.len.passage, T.seed); T.gen = null; }
		else { T.gen = TT.makeGenerator(textOpts(), T.seed); words = T.gen(mode === "time" ? 60 : S.len.words); }
		T.limit = mode === "time" ? S.len.time * 1000 : 0;
		T.sess = new TT.Session(words, { strict: S.strict, backspace: !S.nobs, endOnLast: ENDS[mode] });
		el.in.value = "";
		renderWords();
		el.result.hidden = true;
		el.stage.classList.remove("is-done", "is-typing");
		el.t.textContent = mode === "time" ? S.len.time : "0/" + words.length;
		el.tl.textContent = mode === "time" ? "seconds left" : "words";
		el.w.textContent = "0"; el.a.textContent = "100%";
		drawControls(); drawBanner(); drawHistory(); moveCaret(true);
	}
	function drawBanner() {
		if (challenge && challenge.beat && T.usedChallenge && T.seed === challenge.seed) { el.banner.hidden = false; el.banner.textContent = "Challenge: beat " + challenge.beat + " WPM on this exact text."; }
		else el.banner.hidden = true;
	}

	/* ---------- rendering the text ---------- */
	function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function wordHtml(w) { var h = ""; for (var i = 0; i < w.length; i++) h += '<span class="tt-l">' + esc(w.charAt(i)) + "</span>"; return h; }
	function renderWords() {
		var s = T.sess; T.wordEls = []; T.letterEls = [];
		var html = '<span class="tt-caret" id="tt-caret"></span>';
		s.words.forEach(function (w) { html += '<div class="tt-word">' + wordHtml(w) + "</div> "; });
		el.words.innerHTML = html; el.caret = $("tt-caret");
		el.words.style.transform = "translateY(0)";
		Array.prototype.forEach.call(el.words.querySelectorAll(".tt-word"), function (d) { T.wordEls.push(d); });
		T.wordEls.forEach(function (d, i) { T.letterEls[i] = d.children; });
	}
	function appendWords(list) {
		var frag = document.createElement("div"), html = "";
		list.forEach(function (w) { html += '<div class="tt-word">' + wordHtml(w) + "</div> "; });
		frag.innerHTML = html; var kids = Array.prototype.slice.call(frag.children);
		kids.forEach(function (d) { el.words.appendChild(d); el.words.appendChild(document.createTextNode(" ")); T.wordEls.push(d); T.letterEls.push(d.children); });
	}
	function paintWord(i) {
		var s = T.sess, w = s.words[i], d = T.wordEls[i]; if (!d) return;
		var typed = i < s.idx ? s.done[i] : (i === s.idx ? s.cur : null), L = T.letterEls[i];
		// drop old extras
		while (d.children.length > w.length) d.removeChild(d.lastChild);
		var committed = i < s.idx;
		for (var k = 0; k < w.length; k++) {
			var c = L[k], st = "tt-l";
			if (typed !== null && k < typed.length) st += typed.charAt(k) === w.charAt(k) ? " c" : " w";
			if (c.className !== st) c.className = st;
			// "Show my typing": a wrong letter shows the key that was actually hit (same width, the font is monospaced); otherwise the target letter
			var want = S.show && typed !== null && k < typed.length && typed.charAt(k) !== w.charAt(k) ? typed.charAt(k) : w.charAt(k);
			if (c.textContent !== want) c.textContent = want;
		}
		if (typed !== null && typed.length > w.length) { for (var x = w.length; x < typed.length; x++) { var sp = document.createElement("span"); sp.className = "tt-l x"; sp.textContent = typed.charAt(x); d.appendChild(sp); } }
		d.classList.toggle("bad", committed && typed !== w);
	}
	function lineH() { return el.words.firstElementChild && T.wordEls[0] ? T.wordEls[0].offsetHeight || 1 : 1; }
	function moveCaret(initial) {
		var s = T.sess, i = Math.min(s.idx, T.wordEls.length - 1), d = T.wordEls[i]; if (!d) return;
		var L = d.children, n = s.cur.length, x, y;
		// Measured from real boxes, relative to the (transformed) .tt-words box: offsetLeft/offsetTop are relative to whichever ancestor the browser
		// treats as the offset parent (that differs between engines), which put the caret a line / a word's width off and below the text's middle.
		var base = el.words.getBoundingClientRect(), box, atEnd = !(n < s.words[i].length && L[n]);
		box = (atEnd ? L[L.length - 1] : L[n]).getBoundingClientRect();
		x = (atEnd ? box.right : box.left) - base.left;
		y = box.top - base.top + (box.height - el.caret.offsetHeight) / 2;
		if (s.finished && s.idx >= s.words.length) { /* stay */ }
		el.caret.style.left = x + "px"; el.caret.style.top = y + "px";
		var lh = d.offsetHeight || 40, line = Math.round(d.offsetTop / (lh || 1)), shift = Math.max(0, line - 1) * lh;
		if (initial) { el.words.style.transition = "none"; }
		el.words.style.transform = "translateY(" + (-shift) + "px)";
		if (initial) { void el.words.offsetHeight; el.words.style.transition = ""; }
	}

	/* ---------- input ---------- */
	function focusIn() { try { el.in.focus({ preventScroll: true }); } catch (e) { el.in.focus(); } }
	el.stage.addEventListener("pointerdown", function () { if (!T.sess.finished) setTimeout(focusIn, 0); });
	el.in.addEventListener("focus", function () { el.stage.classList.remove("is-blur"); });
	el.in.addEventListener("blur", function () { if (!T.sess.finished) el.stage.classList.add("is-blur"); });
	el.stage.classList.add("is-blur");
	el.in.addEventListener("paste", function (e) { e.preventDefault(); });
	el.in.addEventListener("keydown", function (e) {
		if (e.key === "Escape") { e.preventDefault(); build(false); return; }
		if (e.key === "Enter") { e.preventDefault(); if (T.sess.finished) { build(true); } return; }
		if (e.key === "Backspace" && el.in.value === "") { e.preventDefault(); if (T.sess.backspace()) { sync(); } }
		else if ((e.ctrlKey || e.altKey || e.metaKey) && e.key.toLowerCase() === "z") e.preventDefault();
	});
	el.in.addEventListener("input", function (e) {
		var s = T.sess; if (s.finished) { el.in.value = ""; return; }
		if (e.isComposing) return;
		var prev = s.cur, now = el.in.value, p = 0;
		while (p < prev.length && p < now.length && prev.charAt(p) === now.charAt(p)) p++;
		var del = prev.length - p, add = now.slice(p);
		if (add.length > 8) { el.in.value = prev; return; }   // a paste or a keyboard autocorrect of a whole word
		var t = performance.now();
		if (del >= prev.length && del > 1 && add === "") { if (!s.clearWord()) s.backspace(); }
		else for (var i = 0; i < del; i++) s.backspace();
		var typedAny = false;
		for (var j = 0; j < add.length; j++) { if (s.type(add.charAt(j), t)) typedAny = true; else if (add.charAt(j) !== " " && s.opts.strict) { /* refused */ } if (s.finished) break; }
		if (!T.running && s.start !== null && !s.finished) startRun();
		sync();
	});
	el.in.addEventListener("compositionend", function () { el.in.dispatchEvent(new Event("input")); });

	function sync() {
		var s = T.sess;
		el.in.value = s.cur;
		if (s.idx > 0) paintWord(s.idx - 1);
		paintWord(s.idx); if (s.idx + 1 < T.wordEls.length) paintWord(s.idx + 1);
		for (var k = Math.max(0, s.idx - 3); k <= s.idx; k++) paintWord(k);
		if (S.mode === "time" && s.words.length - s.idx < 40 && T.gen) { var more = T.gen(40); s.extend(more); appendWords(more); }
		el.stage.classList.add("is-typing");
		moveCaret();
		if (S.mode !== "time") el.t.textContent = Math.min(s.idx, s.words.length) + "/" + s.words.length;
		liveStats();
		if (s.finished) finish();
	}

	/* ---------- running ---------- */
	function startRun() {
		T.running = true; T.t0 = performance.now(); el.live.classList.toggle("is-hidden", !S.live);
		clearInterval(T.timer);
		T.timer = setInterval(tick, 120);
	}
	function elapsed() { return T.sess.start === null ? 0 : performance.now() - T.sess.start; }
	function tick() {
		if (!T.running) return;
		var e = elapsed();
		if (S.mode === "time") {
			var left = Math.max(0, Math.ceil((T.limit - e) / 1000)); el.t.textContent = left;
			if (e >= T.limit) { T.sess.finish(T.sess.start + T.limit); sync(); return; }
		}
		liveStats();
	}
	function liveStats() {
		if (!S.live || !T.running) return;
		var s = T.sess, e = Math.max(elapsed(), 1000), r = TT.result(s, e);
		el.w.textContent = Math.round(r.wpm); el.a.textContent = Math.round(r.acc) + "%";
	}
	window.addEventListener("beforeunload", function () { clearInterval(T.timer); });

	/* ---------- results ---------- */
	function fmt(n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); }
	function finish() {
		clearInterval(T.timer); T.running = false;
		var s = T.sess, dur = S.mode === "time" ? T.limit : Math.max(1, s.end - s.start);
		if (s.keys.length < 3 || dur < 800) { build(false); return; }
		var r = TT.result(s, dur), c = cfg(), key = cfgKey(c);
		T.lastResult = r;
		el.w.textContent = Math.round(r.wpm); el.a.textContent = Math.round(r.acc) + "%"; el.live.classList.remove("is-hidden");
		if (S.mode === "time") el.t.textContent = 0; else el.t.textContent = s.words.length + "/" + s.words.length;
		var best = null; store.hist.forEach(function (h) { if (h.k === key && (!best || h.wpm > best)) best = h.wpm; });
		var pb = best === null || r.wpm > best;
		var avgBefore = store.hist.length ? store.hist.reduce(function (a, h) { return a + h.wpm; }, 0) / store.hist.length : null;
		store.hist.push({ ts: Date.now(), k: key, mode: c.mode, len: c.len, diff: c.diff, f: (+c.caps) + "" + (+c.punct) + (+c.nums) + (+c.strict) + (+c.nobs) + (c.practice || 0), wpm: Math.round(r.wpm * 10) / 10, raw: Math.round(r.raw * 10) / 10, acc: Math.round(r.acc * 10) / 10, cons: r.cons === null ? null : Math.round(r.cons), secs: Math.round(r.secs * 10) / 10 });
		if (store.hist.length > 300) store.hist = store.hist.slice(-300);
		TT.mergeKeys(store.keys, r.perKey);
		save();
		el.stage.classList.add("is-done"); el.stage.classList.remove("is-typing", "is-blur");
		showResult(r, pb && best !== null, avgBefore, c);
		drawHistory(); drawBanner();
		try { el.result.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
	}
	function chart(r, h) {
		var W = 640, H = 220, pl = 34, pr = 10, pt = 10, pb = 26, n = r.series.raw.length;
		var maxV = Math.max(20, Math.ceil(Math.max.apply(null, r.series.raw.concat(r.series.wpm)) / 20) * 20);
		function X(i) { return n > 1 ? pl + (W - pl - pr) * i / (n - 1) : pl; }
		function Y(v) { return pt + (H - pt - pb) * (1 - v / maxV); }
		var g = "", i, steps = 4;
		for (i = 0; i <= steps; i++) { var v = maxV * i / steps; g += '<line class="g" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Math.round(v) + "</text>"; }
		var tx = Math.max(1, Math.ceil(n / 8));
		for (i = 0; i < n; i += tx) g += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + (i + 1) + "s</text>";
		function pts(a) { return a.map(function (v, j) { return X(j).toFixed(1) + "," + Y(v).toFixed(1); }).join(" "); }
		var errs = "";
		r.series.errs.forEach(function (e, j) { if (e > 0) errs += '<circle class="e" cx="' + X(j).toFixed(1) + '" cy="' + (Y(0) - 7) + '" r="' + Math.min(6, 3 + e) + '"><title>' + e + " mistake" + (e > 1 ? "s" : "") + " in second " + (j + 1) + "</title></circle>"; });
		return '<svg class="tt-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Typing speed for each second of the test: ' + Math.round(r.wpm) + ' WPM overall">' + g +
			'<polyline class="l-raw" points="' + pts(r.series.raw) + '"/><polyline class="l-wpm" points="' + pts(r.series.wpm) + '"/>' + errs + "</svg>" +
			'<div class="tt-legend"><span style="color:var(--accent)">━ speed (WPM so far)</span><span>┅ raw speed each second</span><span style="color:#d93025">● mistakes</span></div>';
	}
	var KB = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
	function keyboard(perKey, mode) {
		var mx = 0, ms = [];
		Object.keys(perKey).forEach(function (c) { var o = perKey[c]; if (o.n) ms.push(o.ms / o.n); });
		ms.sort(function (a, b) { return a - b; }); var med = ms.length ? ms[Math.floor(ms.length / 2)] : 200;
		var html = "";
		KB.forEach(function (row, ri) {
			html += '<div class="tt-kbrow" style="margin-left:' + (ri * 1.1) + 'em">';
			row.split("").forEach(function (c) {
				var o = perKey[c] || perKey[c.toUpperCase()], inten = 0, tip = c.toUpperCase() + ": no data";
				var a = (perKey[c] ? perKey[c].a : 0) + (perKey[c.toUpperCase()] ? perKey[c.toUpperCase()].a : 0), m = (perKey[c] ? perKey[c].m : 0) + (perKey[c.toUpperCase()] ? perKey[c.toUpperCase()].m : 0);
				var msum = (perKey[c] ? perKey[c].ms : 0) + (perKey[c.toUpperCase()] ? perKey[c.toUpperCase()].ms : 0), mn = (perKey[c] ? perKey[c].n : 0) + (perKey[c.toUpperCase()] ? perKey[c.toUpperCase()].n : 0);
				if (mode === "err") { if (a) { inten = Math.min(1, (m / a) / 0.2); tip = c.toUpperCase() + ": " + m + " wrong of " + a + " (" + fmt(100 * m / a, 1) + "%)"; } }
				else if (mn >= 2) { var avg = msum / mn; inten = Math.max(0, Math.min(1, (avg - med) / Math.max(med, 120))); tip = c.toUpperCase() + ": " + Math.round(avg) + " ms on average"; }
				html += '<span class="tt-key" title="' + tip + '"><i style="opacity:' + (inten * 0.85).toFixed(2) + '"></i><span>' + c + "</span></span>";
			});
			html += "</div>";
		});
		return '<div class="tt-kb">' + html + '</div><div class="tt-kbnote">' + (mode === "err" ? "Redder = more mistakes. Grey keys had no data." : "Redder = slower than your typical key.") + "</div>";
	}
	function describe(c) {
		var m = c.mode === "time" ? c.len + " seconds" : c.mode === "words" ? c.len + " words" : c.mode === "passage" ? c.len + " passage" : "your text";
		var d = c.mode === "passage" || c.mode === "custom" ? "" : ", " + TT.DIFFS[c.diff].name.toLowerCase();
		var f = []; if (c.caps && c.diff !== "expert") f.push("capitals"); if (c.punct && c.diff !== "expert") f.push("punctuation"); if (c.nums && c.diff !== "expert") f.push("numbers"); if (c.strict) f.push("stop on error"); if (c.nobs) f.push("no backspace");
		return m + d + (f.length && c.mode !== "passage" && c.mode !== "custom" ? ", " + f.join(" + ") : "") + (c.practice ? ", weak-key practice" : "");
	}
	function challengeLink(c, r) {
		var q = new URLSearchParams(); q.set("m", c.mode === "custom" ? "words" : c.mode); if (c.mode !== "custom") q.set("l", c.len); q.set("d", c.diff);
		["caps", "punct", "nums", "strict", "nobs"].forEach(function (k) { if (c[k]) q.set(k, "1"); }); q.set("seed", T.seed); q.set("beat", Math.round(r.wpm));
		return location.origin + location.pathname + "?" + q.toString();
	}
	function showResult(r, newBest, avgBefore, c) {
		var rank = TT.rankFor(r.wpm), weak = TT.weakLetters(r.perKey, 5), chars = r.chars;
		var vs = ""; if (challenge && challenge.beat && T.seed === challenge.seed) vs = r.wpm > challenge.beat ? '<div class="tt-banner">You beat the challenge: ' + fmt(r.wpm, 0) + " vs " + challenge.beat + " WPM! 🎉</div>" : '<div class="tt-banner">Challenge: ' + challenge.beat + " WPM. You typed " + fmt(r.wpm, 0) + " (" + fmt(challenge.beat - r.wpm, 0) + " short). Try again!</div>";
		var avgTxt = avgBefore !== null ? " Your average so far: " + fmt(avgBefore, 0) + " WPM." : "";
		el.result.innerHTML =
			'<div class="tt-rhead"><div class="tt-rank">' + esc(rank.name) + (newBest ? '<span class="tt-pb">★ New personal best</span>' : "") + "<small>" + esc(rank.note) + avgTxt + "</small></div>" +
			'<div class="tu-note">' + esc(describe(c)) + "</div></div>" + vs +
			'<div class="tt-tiles"><div class="tt-tile tt-tile--big"><b>' + fmt(r.wpm, 0) + "</b><span>WPM</span></div>" +
			'<div class="tt-tile tt-tile--big"><b>' + fmt(r.acc, 1).replace(/\.0$/, "") + "%</b><span>accuracy</span></div>" +
			'<div class="tt-tile"><b>' + fmt(r.raw, 0) + "</b><span>raw WPM</span></div>" +
			'<div class="tt-tile"><b>' + (r.cons === null ? "–" : fmt(r.cons, 0) + "%") + "</b><span>consistency</span></div>" +
			'<div class="tt-tile"><b>' + fmt(r.secs, r.secs < 10 ? 1 : 0) + "s</b><span>time</span></div></div>" +
			'<div class="tt-detail">Characters: <strong>' + chars.ok + "</strong> correct · <strong>" + chars.bad + "</strong> wrong · <strong>" + chars.extra + "</strong> extra · <strong>" + chars.missed + "</strong> missed · " + r.keys + " key presses, " + r.errors + " mistakes" + (r.blocked ? ", " + r.blocked + " blocked" : "") + ".</div>" +
			'<div class="tt-cols"><div><h3 class="tt-h3">Speed through the test</h3>' + chart(r) + "</div>" +
			'<div><h3 class="tt-h3">Keys<span class="tt-tabs" id="tt-kbtabs"><button type="button" data-m="err" aria-pressed="true">Mistakes</button><button type="button" data-m="spd" aria-pressed="false">Speed</button></span></h3><div id="tt-kbbox">' + keyboard(r.perKey, "err") + "</div>" +
			(weak.length ? '<div class="tt-weak"><span>Hardest for you: <b>' + weak.join(" ") + '</b></span><button type="button" class="tu-btn tu-btn--primary" id="tt-practice">Practise my weak keys</button></div>' : '<div class="tt-kbnote">No weak keys this time. Clean typing!</div>') + "</div></div>" +
			'<div class="tt-actions"><button type="button" class="tu-btn tu-btn--primary" id="tt-again">Next test</button><button type="button" class="tu-btn" id="tt-same">Same text again</button><button type="button" class="tu-btn" id="tt-copy">Copy result</button>' +
			(c.mode !== "custom" ? '<button type="button" class="tu-btn" id="tt-chal">Copy challenge link</button>' : "") + (navigator.share ? '<button type="button" class="tu-btn tu-btn--ghost" id="tt-share">Share…</button>' : "") + "</div>";
		el.result.hidden = false;
		$("tt-again").onclick = function () { build(true); focusIn(); window.scrollTo({ top: Math.max(0, el.stage.getBoundingClientRect().top + window.pageYOffset - 140), behavior: "smooth" }); };
		$("tt-same").onclick = function () { build(false); focusIn(); };
		var text = "I typed " + fmt(r.wpm, 0) + " WPM with " + fmt(r.acc, 0) + "% accuracy (" + describe(c) + ") on the MES Typing Test: https://mes.fm/typing-test";
		$("tt-copy").onclick = function () { copy(text, "Result copied."); };
		if ($("tt-chal")) $("tt-chal").onclick = function () { copy(challengeLink(c, r), "Challenge link copied: same text, beat " + fmt(r.wpm, 0) + " WPM."); };
		if ($("tt-share")) $("tt-share").onclick = function () { navigator.share({ title: "MES Typing Test", text: text, url: c.mode !== "custom" ? challengeLink(c, r) : "https://mes.fm/typing-test" }).catch(function () {}); };
		if ($("tt-practice")) $("tt-practice").onclick = function () { T.practice = weak; S.mode = "words"; S.len.words = 25; challenge = null; save(); build(true); focusIn(); };
		$("tt-kbtabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; var m = b.getAttribute("data-m"); Array.prototype.forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); $("tt-kbbox").innerHTML = keyboard(r.perKey, m); };
	}
	function copy(text, msg) {
		function done() { toast(msg); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed."); } document.body.removeChild(ta); }
	}

	/* ---------- history ---------- */
	function drawHistory() {
		var h = store.hist, box = el.histbody;
		if (!h.length) { el.histsub.textContent = memOnly ? "Saving is off in this browser." : "Saved only in this browser."; box.innerHTML = '<p class="tt-empty">Finish a test and your speed over time appears here, with personal bests for each kind of test.</p>'; return; }
		var avg = h.reduce(function (a, x) { return a + x.wpm; }, 0) / h.length, best = Math.max.apply(null, h.map(function (x) { return x.wpm; }));
		var acc = h.reduce(function (a, x) { return a + x.acc; }, 0) / h.length, last10 = h.slice(-10), avg10 = last10.reduce(function (a, x) { return a + x.wpm; }, 0) / last10.length;
		el.histsub.textContent = h.length + " test" + (h.length > 1 ? "s" : "") + " saved in this browser" + (memOnly ? " (this session only)" : "");
		var bests = {}; h.forEach(function (x) { if (!bests[x.k] || x.wpm > bests[x.k].wpm) bests[x.k] = x; });
		var rows = Object.keys(bests).map(function (k) { return bests[k]; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 12).map(function (x) {
			var c = { mode: x.mode, len: x.len, diff: x.diff, caps: x.f.charAt(0) === "1", punct: x.f.charAt(1) === "1", nums: x.f.charAt(2) === "1", strict: x.f.charAt(3) === "1", nobs: x.f.charAt(4) === "1", practice: x.f.charAt(5) === "1" };
			return "<tr><td>" + esc(describe(c)) + "</td><td><strong>" + fmt(x.wpm, 0) + "</strong></td><td>" + fmt(x.acc, 1) + "%</td><td>" + new Date(x.ts).toLocaleDateString() + "</td></tr>";
		}).join("");
		box.innerHTML = '<div class="tt-sum"><div class="tt-tile"><b>' + fmt(best, 0) + '</b><span>best WPM</span></div><div class="tt-tile"><b>' + fmt(avg, 0) + '</b><span>average WPM</span></div><div class="tt-tile"><b>' + fmt(avg10, 0) + '</b><span>last 10 average</span></div><div class="tt-tile"><b>' + fmt(acc, 0) + '%</b><span>average accuracy</span></div></div>' +
			(h.length > 1 ? histChart(h.slice(-40)) : "") +
			'<h3 class="tt-h3" style="margin-top:1em">Personal bests</h3><div class="tt-tablewrap"><table class="tt-table"><thead><tr><th>Test</th><th>WPM</th><th>Accuracy</th><th>When</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
			'<h3 class="tt-h3" style="margin-top:1em">Your keys, all tests<span class="tt-tabs" id="tt-lktabs"><button type="button" data-m="err" aria-pressed="true">Mistakes</button><button type="button" data-m="spd" aria-pressed="false">Speed</button></span></h3><div id="tt-lkbox">' + keyboard(store.keys, "err") + "</div>" +
			'<div class="tt-hbtns"><button type="button" class="tu-btn tu-btn--ghost" id="tt-csv">Download CSV</button><button type="button" class="tu-btn tu-btn--ghost" id="tt-clear">Clear history</button></div>';
		$("tt-lktabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; Array.prototype.forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); $("tt-lkbox").innerHTML = keyboard(store.keys, b.getAttribute("data-m")); };
		$("tt-csv").onclick = function () {
			var lines = ["date,test,wpm,raw_wpm,accuracy,consistency,seconds"].concat(h.map(function (x) { return [new Date(x.ts).toISOString(), '"' + x.k + '"', x.wpm, x.raw, x.acc, x.cons === null ? "" : x.cons, x.secs].join(","); }));
			var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "typing-history.csv"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
		};
		$("tt-clear").onclick = function () { if (confirm("Delete all saved typing results from this browser?")) { store.hist = []; store.keys = {}; save(); drawHistory(); } };
	}
	function histChart(h) {
		var W = 640, H = 170, pl = 34, pr = 10, pt = 10, pb = 22, n = h.length, maxV = Math.max(20, Math.ceil(Math.max.apply(null, h.map(function (x) { return x.wpm; })) / 20) * 20);
		function X(i) { return pl + (W - pl - pr) * i / Math.max(1, n - 1); } function Y(v) { return pt + (H - pt - pb) * (1 - v / maxV); }
		var g = "", i; for (i = 0; i <= 4; i++) { var v = maxV * i / 4; g += '<line class="g" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Math.round(v) + "</text>"; }
		var pts = h.map(function (x, j) { return X(j).toFixed(1) + "," + Y(x.wpm).toFixed(1); }).join(" ");
		var dots = h.map(function (x, j) { return '<circle class="dot" cx="' + X(j).toFixed(1) + '" cy="' + Y(x.wpm).toFixed(1) + '" r="3"><title>' + fmt(x.wpm, 0) + " WPM, " + fmt(x.acc, 0) + "% accuracy, " + new Date(x.ts).toLocaleDateString() + "</title></circle>"; }).join("");
		return '<svg class="tt-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Your last ' + n + ' results in WPM">' + g + '<polyline class="l-wpm" points="' + pts + '"/>' + dots + '</svg><div class="tt-legend"><span>Your last ' + n + " tests, oldest to newest (WPM)</span></div>";
	}

	/* ---------- go ---------- */
	if (challenge) { /* a challenge link fixes the config it came with */ }
	drawControls(); build(true);
	window.addEventListener("resize", function () { moveCaret(true); });
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveCaret(true); });
})();
