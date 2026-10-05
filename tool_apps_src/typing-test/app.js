/* MES Typing Test -- UI. Logic lives in lib.js (TT). State: localStorage "mes-typingtest:v1" (settings, history, lifetime key stats); nothing is uploaded unless you post a score to the leaderboard (name, speed, accuracy). */
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
	var store = { opts: JSON.parse(JSON.stringify(DEF)), hist: [], keys: {}, pid: "", name: "", noPop: false }, memOnly = false;
	try {
		var raw = localStorage.getItem(KEY);
		if (raw) { var o = JSON.parse(raw); if (o && typeof o === "object") { store.opts = Object.assign(store.opts, o.opts || {}); store.opts.len = Object.assign({}, DEF.len, (o.opts || {}).len || {}); store.hist = Array.isArray(o.hist) ? o.hist : []; store.keys = o.keys || {}; store.pid = /^[a-f0-9]{16}$/.test(o.pid) ? o.pid : ""; store.name = typeof o.name === "string" ? o.name.slice(0, 16) : ""; store.noPop = !!o.noPop; } }
	} catch (e) { memOnly = true; }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { memOnly = true; } }
	if (!store.pid) { var rb = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(rb); store.pid = Array.prototype.map.call(rb, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); save(); }
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
	["mode", "len", "lenwrap", "lenlabel", "diff", "diffwrap", "mix", "rules", "diffnote", "banner", "custom", "customtext", "customgo", "live", "t", "tl", "w", "a", "stage", "view", "words", "caret", "in", "focus", "restart", "result", "hist", "histbody", "histsub", "toast", "lb", "lbperiod", "lbboard", "lbbody", "lbnote"].forEach(function (k) { el[k] = $("tt-" + k); });

	/* ---------- test state ---------- */
	var T = { seed: "", gen: null, sess: null, wordEls: [], letterEls: [], limit: 0, running: false, timer: 0, practice: null, lastResult: null, tok: "", R: null, replay: false, lastPassage: "", customText: "", lastCfg: null };
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
	// Restart (button, Esc) always gives fresh words, so a text can't be memorised and replayed for a better score. The one exception is a
	// challenge link's own text, which restarts as itself; "Same text again" on the result is the other deliberate way to replay.
	function restart() { if (challenge && T.seed === challenge.seed && S.mode !== "custom") { build(false); T.replay = true; } else build(true); focusIn(); }
	el.restart.addEventListener("click", restart);

	/* ---------- building a test ---------- */
	function build(fresh) {
		clearInterval(T.timer); T.running = false; T.lastResult = null;
		if (fresh) T.replay = false;
		if (fresh || !T.seed) {
			T.seed = (challenge && challenge.seed && !T.usedChallenge) ? challenge.seed : TT.newSeed();
			// passages come from a short list: never serve the one just typed
			if (S.mode === "passage" && !(challenge && T.seed === challenge.seed)) for (var tries = 0; tries < 8 && TT.passageWords(S.len.passage, T.seed).join(" ") === T.lastPassage; tries++) T.seed = TT.newSeed();
		}
		if (challenge && T.seed === challenge.seed) T.usedChallenge = true;
		var words, mode = S.mode;
		if (mode === "custom") { words = TT.customWords(T.customText, 600); if (!words.length) words = ["Paste", "your", "own", "text", "above", "and", "press", "start."]; T.gen = null; }
		else if (mode === "passage") { words = TT.passageWords(S.len.passage, T.seed); T.lastPassage = words.join(" "); T.gen = null; }
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
		if (e.key === "Escape") { e.preventDefault(); restart(); return; }
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
		T.tok = ""; if (rankable(cfg())) lbApi({ a: "start" }).then(function (r) { if (r && r.t) T.tok = r.t; }, function () {});
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
		T.R = { r: r, c: c, tok: T.tok, posted: null };
		showResult(r, pb && best !== null, avgBefore, c);
		// a moment after the test ends (so stray keystrokes of the last word don't land in the name box), offer to save it
		if (canPost(T.R) && !store.noPop) { try { el.in.blur(); } catch (e) {} var R0 = T.R; setTimeout(function () { if (T.R === R0 && T.sess.finished && !R0.posted) openModal(R0); }, 900); }
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
			'<div class="tt-actions"><button type="button" class="tu-btn tu-btn--primary" id="tt-again">Next test</button><button type="button" class="tu-btn" id="tt-same" title="Practice only: a repeat of the same text is not ranked">Same text again</button><button type="button" class="tu-btn" id="tt-copy">Copy result</button>' +
			(c.mode !== "custom" ? '<button type="button" class="tu-btn" id="tt-chal">Copy challenge link</button>' : "") + (navigator.share ? '<button type="button" class="tu-btn tu-btn--ghost" id="tt-share">Share…</button>' : "") + "</div>" + postBox(T.R);
		el.result.hidden = false;
		$("tt-again").onclick = function () { build(true); focusIn(); window.scrollTo({ top: Math.max(0, el.stage.getBoundingClientRect().top + window.pageYOffset - 140), behavior: "smooth" }); };
		$("tt-same").onclick = function () { build(false); T.replay = true; focusIn(); };
		var text = "I typed " + fmt(r.wpm, 0) + " WPM with " + fmt(r.acc, 0) + "% accuracy (" + describe(c) + ") on the MES Typing Test: https://mes.fm/typing-test";
		$("tt-copy").onclick = function () { copy(text, "Result copied."); };
		if ($("tt-chal")) $("tt-chal").onclick = function () { copy(challengeLink(c, r), "Challenge link copied: same text, beat " + fmt(r.wpm, 0) + " WPM."); };
		if ($("tt-share")) $("tt-share").onclick = function () { navigator.share({ title: "MES Typing Test", text: text, url: c.mode !== "custom" ? challengeLink(c, r) : "https://mes.fm/typing-test" }).catch(function () {}); };
		if ($("tt-practice")) $("tt-practice").onclick = function () { T.practice = weak; S.mode = "words"; S.len.words = 25; challenge = null; save(); build(true); focusIn(); };
		wirePost(T.R);
		$("tt-kbtabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; var m = b.getAttribute("data-m"); Array.prototype.forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); $("tt-kbbox").innerHTML = keyboard(r.perKey, m); };
	}
	function copy(text, msg) {
		function done() { toast(msg); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed."); } document.body.removeChild(ta); }
	}

	/* ---------- leaderboard (api/typing-leaderboard.js; daily / weekly resets 00:00 UTC) ---------- */
	var API = "/api/typing-leaderboard", MIN_ACC = 90, PER = { day: "Today", week: "This week", all: "All time" };
	var LB = { period: "day", board: "all", loaded: false, counts: {}, picked: false };
	function lbSave() { try { localStorage.setItem(KEY + ":lb", JSON.stringify({ period: LB.period, board: LB.board })); } catch (e) {} }
	function lbApi(body) { return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { j.status = r.status; return j; }); }); }
	function boardOf(c) { return c.mode === "passage" ? "passage-" + c.len : c.mode + "-" + c.len + "-" + c.diff; }
	function boardName(b) { if (b === "all") return "All tests combined"; var p = b.split("-"); if (p[0] === "passage") return "Passage: " + p[1]; var d = TT.DIFFS[p[2]].name; return (p[0] === "time" ? p[1] + " seconds" : p[1] + " words") + " · " + d; }
	// Only comparable tests count: no custom text, no weak-key practice, and the capitals / punctuation / numbers must be the difficulty's own.
	function lbEligible(c) {
		if (c.mode === "custom" || c.practice || !LENS[c.mode]) return false;
		if (c.mode === "passage") return true;
		var d = TT.DIFFS[c.diff]; return c.caps === d.caps && c.punct === d.punct && c.nums === d.nums;
	}
	function rankable(c) { return lbEligible(c) && !T.replay; }
	function boardOptions() {
		var o = ["all"], diffs = Object.keys(TT.DIFFS);
		["time", "words"].forEach(function (m) { LENS[m].forEach(function (l) { diffs.forEach(function (d) { o.push(m + "-" + l + "-" + d); }); }); });
		LENS.passage.forEach(function (l) { o.push("passage-" + l); });
		return o;
	}
	function drawLbControls() {
		el.lbperiod.innerHTML = ["day", "week", "all"].map(function (p) { return '<button type="button" data-v="' + p + '" aria-pressed="' + (LB.period === p) + '">' + PER[p] + "</button>"; }).join("");
		el.lbboard.innerHTML = boardOptions().map(function (b) { var n = b === "all" ? Object.keys(LB.counts).reduce(function (a, k) { return a + LB.counts[k]; }, 0) : LB.counts[b]; return '<option value="' + b + '">' + esc(boardName(b)) + (n ? " (" + n + ")" : "") + "</option>"; }).join("");
		el.lbboard.value = LB.board;
	}
	function until(ms) { var m = Math.max(1, Math.round((ms - Date.now()) / 60000)), h = Math.floor(m / 60); return h >= 24 ? Math.round(h / 24) + " days" : h ? h + " h " + (m % 60) + " min" : m + " min"; }
	function loadBoard() {
		LB.loaded = true; var board = LB.board, period = LB.period;
		el.lbbody.innerHTML = '<p class="tt-empty">Loading…</p>';
		fetch(API + "?board=" + encodeURIComponent(board) + "&period=" + period + "&me=" + store.pid).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
			if (board !== LB.board || period !== LB.period) return;
			var combined = board === "all";
			var rows = j.rows.map(function (x) { return '<tr' + (x.me ? ' class="me"' : "") + "><td>" + x.r + "</td><td>" + esc(x.n) + (x.me ? " (you)" : "") + "</td>" + (combined ? "<td>" + esc(boardName(x.b)) + "</td>" : "") + "<td><strong>" + fmt(x.w, 1).replace(/\.0$/, "") + "</strong></td><td>" + fmt(x.a, 1).replace(/\.0$/, "") + "%</td></tr>"; }).join("");
			if (j.you && !j.rows.some(function (x) { return x.me; })) rows += '<tr class="me"><td>' + j.you.r + "</td><td>" + esc(store.name || "You") + " (you)</td><td><strong>" + fmt(j.you.w, 1).replace(/\.0$/, "") + "</strong></td><td>" + fmt(j.you.a, 1).replace(/\.0$/, "") + "%</td></tr>";
			el.lbbody.innerHTML = j.rows.length ? '<div class="tt-tablewrap"><table class="tt-table tt-lbtable"><thead><tr><th>#</th><th>Name</th>' + (combined ? '<th>Test</th>' : '') + '<th>WPM</th><th>Accuracy</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="tt-empty">No scores here yet. Finish a test and post yours to be first.</p>';
			el.lbnote.textContent = (j.total ? j.total + " typist" + (j.total > 1 ? "s" : "") + ". " : "") + (j.resets ? PER[period] + " resets at 00:00 UTC, in " + until(j.resets) + ". " : "") + "Best score per person; accuracy of " + MIN_ACC + "% or more counts.";
		}).catch(function () { if (board === LB.board && period === LB.period) { el.lbbody.innerHTML = '<p class="tt-empty">The leaderboard could not be loaded. Try again in a moment.</p>'; el.lbnote.textContent = ""; } });
	}
	// how many typists each board has for the chosen period (boards with scores show "(n)" in the picker)
	function loadCounts(then) {
		var period = LB.period;
		fetch(API + "?summary=1&period=" + period).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { if (period !== LB.period) return; LB.counts = j.counts || {}; if (then) then(); drawLbControls(); }).catch(function () { if (then) then(); });
	}
	el.lbperiod.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; LB.period = b.getAttribute("data-v"); LB.picked = true; lbSave(); drawLbControls(); loadBoard(); loadCounts(); });
	el.lbboard.addEventListener("change", function () { LB.board = el.lbboard.value; LB.picked = true; lbSave(); loadBoard(); });
	// On load: the board last viewed (remembered), else every test combined, so the leaderboard is never empty just because the current settings point at a quiet board.
	function lbStart() {
		try { var sv = JSON.parse(localStorage.getItem(KEY + ":lb") || "null"); if (sv && PER[sv.period] && boardOptions().indexOf(sv.board) >= 0) { LB.period = sv.period; LB.board = sv.board; LB.picked = true; } } catch (e) {}
		drawLbControls();
		loadCounts(function () {
			drawLbControls(); loadBoard();
		});
	}
	// R = the finished test as the leaderboard sees it: { r: result, c: config, tok: one-time code from the start of the test, posted: null | ranks }
	function canPost(R) { return rankable(R.c) && R.r.acc >= MIN_ACC; }
	function postScore(R, name) {
		if (R.posted) return Promise.resolve({ ok: true, ranks: R.posted });
		if (!R.tok) return Promise.resolve({ ok: false, error: "Still getting a verification code for this test… try again in a second." });
		return lbApi({ a: "submit", t: R.tok, pid: store.pid, name: name, board: boardOf(R.c), wpm: Math.round(R.r.wpm * 10) / 10, acc: Math.round(R.r.acc * 10) / 10, secs: R.c.mode === "time" ? R.c.len : Math.round(R.r.secs * 10) / 10 }).then(function (j) {
			if (j.ok) { R.posted = j.ranks; R.tok = ""; store.name = name; save(); LB.period = "day"; LB.picked = true; lbSave(); drawLbControls(); loadBoard(); loadCounts(); }
			return j;
		}, function () { return { ok: false, error: "Could not reach the leaderboard. Try again." }; });
	}
	function ranksText(k) { return "You are #" + k.day + " today, #" + k.week + " this week, #" + k.all + " all time."; }
	function postBox(R) {
		var r = R.r, c = R.c, b = '<div class="tt-post" id="tt-post">';
		if (!lbEligible(c)) return b + '<span class="tu-note">This kind of test is not on the leaderboard (' + (c.mode === "custom" ? "your own text" : c.practice ? "weak-key practice" : "capitals, punctuation and numbers have to match the difficulty") + ").</span></div>";
		if (T.replay) return b + '<span class="tu-note">A repeat of the same text is for practice and is not ranked. New words (Esc) are.</span></div>';
		if (r.acc < MIN_ACC) return b + '<span class="tu-note">Leaderboard scores need ' + MIN_ACC + "% accuracy or more.</span></div>";
		return b + '<label for="tt-name" class="tu-label">Post to the leaderboard</label><input id="tt-name" class="tu-input" maxlength="16" placeholder="Your name" autocomplete="nickname" spellcheck="false" value="' + esc(store.name) + '"><button type="button" class="tu-btn tu-btn--primary" id="tt-postgo">Post my score</button><span class="tu-note" id="tt-postmsg">Posts your name, speed and accuracy to the public board for ' + esc(boardName(boardOf(c))) + ".</span></div>";
	}
	function wirePost(R) {
		var go = $("tt-postgo"); if (!go) return;
		var msg = $("tt-postmsg"), inp = $("tt-name");
		function done() { go.disabled = true; go.textContent = "Posted ✓"; msg.textContent = ranksText(R.posted); }
		if (R.posted) { done(); return; }
		R.onPosted = done;
		function post() {
			var name = inp.value.trim().replace(/\s+/g, " ");
			if (!name) { msg.textContent = "Type a name first."; inp.focus(); return; }
			go.disabled = true; msg.textContent = "Posting…";
			postScore(R, name).then(function (j) { if (j.ok) done(); else { go.disabled = false; msg.textContent = j.error || "Could not post the score."; } });
		}
		go.onclick = post; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); post(); } });
	}

	/* ---------- "save your result" pop-up, shown right after a ranked test ---------- */
	var modal = null;
	function closeModal() { if (!modal) return; modal.remove(); modal = null; document.removeEventListener("keydown", modalKey, true); }
	function modalKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeModal(); } }
	function openModal(R) {
		if (modal) return;
		var r = R.r, c = R.c;
		modal = document.createElement("div"); modal.className = "tt-modal"; modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "tt-mtitle");
		modal.innerHTML = '<div class="tt-mcard"><h2 id="tt-mtitle">Save your result</h2>' +
			'<div class="tt-mscore"><b>' + fmt(r.wpm, 0) + '</b> WPM <span>·</span> <b>' + fmt(r.acc, 1).replace(/\.0$/, "") + '%</b> accuracy</div>' +
			'<p class="tu-note">' + esc(boardName(boardOf(c))) + '. Put it on the daily, weekly and all-time leaderboard.</p>' +
			'<label for="tt-mname" class="tu-label">Your name (shown publicly)</label><input id="tt-mname" class="tu-input" maxlength="16" placeholder="Your name" autocomplete="nickname" spellcheck="false" value="' + esc(store.name) + '">' +
			'<p class="tt-mmsg" id="tt-mmsg" aria-live="polite"></p>' +
			'<div class="tt-mbtns"><button type="button" class="tu-btn tu-btn--primary" id="tt-mgo">Post my score</button><button type="button" class="tu-btn" id="tt-mno">Not now</button></div>' +
			'<button type="button" class="tt-mlink" id="tt-mnever">Don\'t show this pop-up again</button></div>';
		root.appendChild(modal);
		var inp = $("tt-mname"), go = $("tt-mgo"), msg = $("tt-mmsg"), card = modal.firstChild;
		function post() {
			var name = inp.value.trim().replace(/\s+/g, " ");
			if (!name) { msg.textContent = "Type a name first."; inp.focus(); return; }
			go.disabled = true; msg.textContent = "Posting…";
			postScore(R, name).then(function (j) {
				if (!j.ok) { go.disabled = false; msg.textContent = j.error || "Could not post the score."; return; }
				if (R.onPosted) R.onPosted();
				card.innerHTML = '<h2 id="tt-mtitle">Posted ✓</h2><p class="tt-mscore">' + esc(ranksText(j.ranks)) + '</p><div class="tt-mbtns"><button type="button" class="tu-btn tu-btn--primary" id="tt-mview">See the leaderboard</button><button type="button" class="tu-btn" id="tt-mnext">Next test</button></div>';
				$("tt-mview").onclick = function () { closeModal(); try { el.lb.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} };
				$("tt-mnext").onclick = function () { closeModal(); build(true); focusIn(); };
				$("tt-mview").focus();
			});
		}
		go.onclick = post;
		inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); post(); } });
		$("tt-mno").onclick = closeModal;
		$("tt-mnever").onclick = function () { store.noPop = true; save(); closeModal(); toast("OK. You can still post from the result below."); };
		modal.addEventListener("pointerdown", function (e) { if (e.target === modal) closeModal(); });
		document.addEventListener("keydown", modalKey, true);
		if (store.name) go.focus(); else inp.focus();
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
	drawControls(); build(true); lbStart();
	window.addEventListener("resize", function () { moveCaret(true); });
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveCaret(true); });
})();
