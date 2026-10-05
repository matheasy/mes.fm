/* MES Speed Reader -- mes.fm/speedreader
 * Three ways to read the same text: (1) silent RSVP (one word / chunk at a fixed focus point, red focus letter on a guide),
 * (2) read aloud with the browser's Web Speech API, current word + sentence highlighted in the text view, (3) both: the RSVP word
 * follows the voice (boundary events, or a timed estimate when a voice sends none). Pure logic lives in lib.js (SRLib, node-tested).
 * Everything is local: text, settings and position live in localStorage "mes-speedreader:v1"; nothing is uploaded.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sr");
	if (!root) return;
	var L = SRLib;

	/* ---------- samples (all public domain) ---------- */
	var SAMPLES = {
		alice: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”\n\nSo she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.\n\nThere was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.\n\n(From Alice’s Adventures in Wonderland by Lewis Carroll, 1865. Public domain.)",
		pride: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.\n\nHowever little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.\n\n“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”\n\nMr. Bennet replied that he had not.\n\n“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”\n\nMr. Bennet made no answer.\n\n“Do you not want to know who has taken it?” cried his wife impatiently.\n\n“You want to tell me, and I have no objection to hearing it.”\n\nThis was invitation enough.\n\n(From Pride and Prejudice by Jane Austen, 1813. Public domain.)",
		moby: "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people’s hats off—then, I account it high time to get to sea as soon as I can.\n\n(From Moby-Dick by Herman Melville, 1851. Public domain.)"
	};
	var MEASURE_TEXT = SAMPLES.alice.replace(/\n\n\(From[\s\S]*$/, "");

	/* ---------- storage (every access guarded) ---------- */
	var KEY = "mes-speedreader:v1";
	var store = {
		get: function () { try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
		set: function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },
		clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
	};

	/* ---------- settings ---------- */
	var DEF = { wpm: 300, chunk: 1, mode: "speed", smart: true, ramp: false, rewind: false, font: "sans", size: 56, theme: "auto", orp: true, guide: true, ctx: false, prog: true, tv: false, voice: "auto", rate: 1, pitch: 1, vol: 1 };
	var S = {}, k;
	for (k in DEF) S[k] = DEF[k];
	function sanitize(o) {
		var r = {};
		if (!o || typeof o !== "object") return r;
		if (typeof o.wpm === "number") r.wpm = L.clampWpm(o.wpm);
		if (o.chunk >= 1 && o.chunk <= 5) r.chunk = Math.round(o.chunk);
		if (L.MODES.indexOf(o.mode) >= 0) r.mode = o.mode;
		["smart", "ramp", "rewind", "orp", "guide", "ctx", "prog", "tv"].forEach(function (b) { if (typeof o[b] === "boolean") r[b] = o[b]; });
		if (["sans", "serif", "mono", "easy"].indexOf(o.font) >= 0) r.font = o.font;
		if (typeof o.size === "number") r.size = L.clamp(Math.round(o.size), 24, 120);
		if (["auto", "light", "dark", "sepia", "night"].indexOf(o.theme) >= 0) r.theme = o.theme;
		if (typeof o.voice === "string") r.voice = o.voice.slice(0, 300);
		if (typeof o.rate === "number") r.rate = L.clamp(o.rate, 0.5, 3);
		if (typeof o.pitch === "number") r.pitch = L.clamp(o.pitch, 0.5, 2);
		if (typeof o.vol === "number") r.vol = L.clamp(o.vol, 0, 1);
		return r;
	}

	/* ---------- state ---------- */
	var T = { raw: "", text: "", words: [], starts: [], chunks: [], cum: null, lang: "" };
	var P = { idx: 0, playing: false, shown: false, finished: false, focus: false, startCi: 0, playMs: 0, playFrom: 0, sessionStart: 0, sessionWords: 0 };
	var timer = 0, saveTimer = 0, restartTimer = 0, liveTimer = 0;
	var reduceMotion = false;
	try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

	var el = {};
	["reader", "stage", "word", "pre", "orp", "post", "ctx", "ctxl", "ctxr", "msg", "progress", "seek", "pos", "eta", "play", "restart", "prevs", "prevw", "nextw", "nexts",
	 "speedrow", "wpm", "wpmr", "wpmminus", "wpmplus", "presets", "voicerow", "voice", "rate", "rateo", "pitch", "pitcho", "vol", "volo", "note", "settings", "chunk", "smart", "ramp", "rewind",
	 "font", "size", "sizeo", "th", "orpon", "guideon", "ctxon", "progon", "link", "reset", "tv", "tvtoggle", "tvbody", "tvnav", "tvprev", "tvnext", "tvpage", "pane", "grip", "live", "modes", "focus",
	 "input", "text", "count", "drop", "paste", "open", "here", "measurebtn", "clear", "file", "warn", "stw", "stc", "stl1", "stt1", "sts1", "stt2", "stt3", "measure", "mtext", "mstart", "mdone", "mclose", "mtime", "mresult", "toast"].forEach(function (id) {
		var map = { wpmr: "wpm-r", wpmminus: "wpm-minus", wpmplus: "wpm-plus", rateo: "rate-o", pitcho: "pitch-o", volo: "vol-o", sizeo: "size-o", orpon: "orpon", measurebtn: "measure-btn",
			stw: "st-w", stc: "st-c", stl1: "st-l1", stt1: "st-t1", sts1: "st-s1", stt2: "st-t2", stt3: "st-t3", mstart: "m-start", mdone: "m-done", mclose: "m-close", mtime: "m-time", mresult: "m-result", mtext: "mtext",
			ctxl: "ctx-l", ctxr: "ctx-r", tvtoggle: "tvtoggle", tvbody: "tvbody", tvnav: "tvnav", tvprev: "tvprev", tvnext: "tvnext", tvpage: "tvpage", orp: "orp" };
		el[id] = $("sr-" + (map[id] || id));
	});
	var wpmNum = el.wpm;

	function fmt(n) { return Number(n).toLocaleString(); }
	function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
	function toast(msg) {
		el.toast.textContent = msg;
		el.toast.classList.add("tu-toast--show");
		clearTimeout(toast.t);
		toast.t = setTimeout(function () { el.toast.classList.remove("tu-toast--show"); }, 1800);
	}
	function announce(msg) {            // screen readers: status changes only, never the flashing words
		clearTimeout(liveTimer);
		liveTimer = setTimeout(function () { el.live.textContent = msg; }, 60);
	}
	var ready = false;
	function persist() {
		if (!ready) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(function () {
			store.set({ v: 1, t: T.raw.length < 1500000 ? T.raw : "", s: S, p: P.idx });
		}, 400);
	}
	function isSpeech() { return S.mode !== "speed"; }
	function atEnd() { return T.words.length && P.idx >= T.words.length - 1 && P.finished; }

	/* =========================================================== text ===== */
	function setText(raw, opts) {
		opts = opts || {};
		stopAll(true);
		T.raw = raw;
		var tk = L.tokenize(raw);
		T.text = tk.text; T.words = tk.words; T.starts = tk.sentStarts;
		T.lang = L.detectLang(T.text);
		spCumKey = "";
		rebuild();
		P.idx = opts.pos ? L.clamp(opts.pos, 0, Math.max(0, T.words.length - 1)) : 0;
		P.shown = !!opts.pos; P.finished = false;
		el.seek.max = Math.max(0, T.words.length - 1);
		paneStart = -1;
		renderStats();
		renderPane(true);
		refreshVoiceLabel();
		show();
		persist();
	}
	function rebuild() {                      // chunks + timeline after text / words-at-a-time / speed / pacing change
		T.chunks = L.makeChunks(T.words, S.chunk);
		T.fac = L.chunkFactors(T.chunks, T.words, S.smart);
		T.cum = L.timelineFrom(T.chunks, T.fac, S.wpm);
	}
	function retime() { T.cum = L.timelineFrom(T.chunks, T.fac, S.wpm); }
	function renderStats() {
		var n = T.words.length, w = L.countWords(T.raw), chars = T.raw.length;
		el.count.textContent = n ? fmt(w) + " words" : "";
		el.stw.textContent = fmt(w);
		el.stc.textContent = fmt(chars) + " characters";
		var total = T.cum ? T.cum[T.cum.length - 1] : 0;
		el.stl1.textContent = "At " + S.wpm + " wpm" + (S.smart ? " (smart pauses)" : "");
		el.stt1.textContent = L.formatDuration(total);
		var eff = total > 0 ? n / (total / 60000) : 0;
		el.sts1.textContent = n ? (eff / L.AVG_SILENT_WPM >= 1 ? (eff / L.AVG_SILENT_WPM).toFixed(1) + "× the average adult" : Math.round(eff / L.AVG_SILENT_WPM * 100) + "% of the average adult") + (S.smart ? ", about " + Math.round(eff) + " effective wpm" : "") : "Paste some text to begin";
		el.stt2.textContent = L.formatDuration(L.readingMs(n, L.AVG_SILENT_WPM));
		el.stt3.textContent = L.formatDuration(L.readingMs(n, L.AVG_SPEECH_WPM * S.rate));
		var lab3 = el.stt3.parentNode.querySelector(".tu-stat__label"), sub3 = el.stt3.parentNode.querySelector(".tu-stat__sub");
		lab3.textContent = "Listening at " + S.rate.toFixed(1) + "×";
		sub3.textContent = "about " + Math.round(L.AVG_SPEECH_WPM * S.rate) + " words per minute";
	}

	/* ========================================================= stage ===== */
	var stageW = 0;
	function themeNow() {
		if (S.theme !== "auto") return S.theme;
		return document.body.classList.contains("dark-mode") ? "dark" : "light";
	}
	function applyDisplay() {
		var st = el.stage;
		st.setAttribute("data-th", themeNow());
		st.setAttribute("data-font", S.font);
		st.setAttribute("data-orp", S.orp ? "1" : "0");
		st.setAttribute("data-guide", S.guide ? "1" : "0");
		st.setAttribute("data-ctx", S.ctx ? "1" : "0");
		st.style.setProperty("--sr-fs", (P.focus ? Math.min(170, Math.round(S.size * 1.5)) : S.size) + "px");
		el.progress.hidden = !S.prog;
		stageW = st.clientWidth;
	}
	function orpFor(text, multi) {
		if (!multi) return L.orpIndex(text);
		var i = Math.floor(text.length / 2);
		while (i > 0 && /\s/.test(text.charAt(i))) i--;
		return i;
	}
	function paint(text, multi) {
		if (!stageW) stageW = el.stage.clientWidth;
		if (!stageW) return;
		var oi = Math.min(orpFor(text, multi), Math.max(0, text.length - 1));
		var cl = 1;
		if (text.charCodeAt(oi) >= 0xD800 && text.charCodeAt(oi) <= 0xDBFF) cl = 2;
		el.pre.textContent = text.slice(0, oi);
		el.orp.textContent = text.slice(oi, oi + cl);
		el.post.textContent = text.slice(oi + cl);
		var wEl = el.word, W = wEl.offsetWidth, X = el.pre.offsetWidth + el.orp.offsetWidth / 2;
		var half = stageW / 2 - 14, need = Math.max(X, W - X), sc = need > half ? half / need : 1;
		wEl.style.transformOrigin = X + "px 50%";
		wEl.style.transform = "translateX(" + (-X) + "px) scale(" + sc + ")";
	}
	function ctxHtml(a, b) {
		var out = "";
		for (var i = a; i < b; i++) if (i >= 0 && i < T.words.length) out += (out ? " " : "") + T.words[i].w;
		return "<i>" + esc(out) + "</i>";
	}
	function paintCtx(a, b) {
		if (!S.ctx) return;
		el.ctxl.innerHTML = ctxHtml(a - 4, a);
		el.ctxr.innerHTML = ctxHtml(b, b + 5);
	}
	// what the stage shows for word index i in the current mode
	function drawStage(i) {
		if (S.mode === "aloud" || !T.words.length) return;
		el.msg.hidden = true;
		if (S.mode === "speed") {
			var c = T.chunks[L.chunkAt(T.chunks, i)];
			paint(c.text, c.b - c.a > 1);
			paintCtx(c.a, c.b);
		} else {
			paint(T.words[i].w, false);
			paintCtx(i, i + 1);
		}
	}
	function setMsg(html) { el.msg.innerHTML = html; el.msg.hidden = false; el.pre.textContent = el.orp.textContent = el.post.textContent = ""; el.ctxl.textContent = el.ctxr.textContent = ""; }

	// full refresh of everything that depends on the position
	function show() {
		var n = T.words.length;
		if (!n) {
			setMsg("Paste or type some text below, or load a sample.");
			el.pos.textContent = "Word 0 of 0"; el.eta.textContent = ""; el.seek.value = 0;
			markCur(-1);
			return;
		}
		P.idx = L.clamp(P.idx, 0, n - 1);
		if (P.shown) drawStage(P.idx);
		else if (P.finished) { /* finish() has written its own message */ }
		else setMsg("Press <b>play</b> or <b>Space</b> to start<br><small>" + fmt(n) + " words</small>");
		updatePos();
		markCur(P.idx);
	}
	var spCum = null, spCumKey = "";
	function speechCumFor() {
		var key = S.rate + ":" + T.words.length;
		if (spCumKey !== key) {
			spCum = new Float64Array(T.words.length + 1);
			for (var i = 0; i < T.words.length; i++) spCum[i + 1] = spCum[i] + L.speechDelay(T.words[i].w, S.rate);
			spCumKey = key;
		}
		return spCum;
	}
	function updatePos() {
		var n = T.words.length, i = P.idx;
		if (!n) return;
		el.seek.value = i;
		var pct = n > 1 ? Math.round(i / (n - 1) * 100) : 100;
		el.pos.textContent = "Word " + fmt(i + 1) + " of " + fmt(n) + " · " + pct + "%";
		var done, total, tilde = "";
		if (S.mode === "speed") {
			var ci = L.chunkAt(T.chunks, i);
			done = T.cum[ci]; total = T.cum[T.cum.length - 1];
		} else {
			var sc = speechCumFor();
			done = sc[i]; total = sc[n]; tilde = "~";
		}
		el.eta.textContent = tilde + L.clock(done) + " / " + tilde + L.clock(total) + " · " + tilde + L.formatDuration(total - done) + " left";
	}

	/* ===================================================== text view ===== */
	var PAGE = 1200, paneStart = -1, paneEls = [], curEl = null, sentA = -1, sentB = -1;
	function paneVisible() { return !el.tvbody.hidden; }
	function renderPane(force) {
		if (!paneVisible() && !force) { paneStart = -1; return; }
		if (!paneVisible()) return;
		var n = T.words.length;
		if (!n) { el.pane.innerHTML = "<span class=\"sr-empty\">Your text will appear here.</span>"; paneEls = []; paneStart = -1; el.tvnav.hidden = true; return; }
		var page = Math.floor(P.idx / PAGE), start = page * PAGE;
		if (start === paneStart && !force) return;
		paneStart = start;
		var end = Math.min(n, start + PAGE), html = [];
		for (var i = start; i < end; i++) {
			html.push("<span class=\"sr-w\" data-i=\"" + i + "\">" + esc(T.words[i].w) + "</span>" + (T.words[i].para ? "<span class=\"sr-para\"></span>" : " "));
		}
		el.pane.innerHTML = html.join("");
		paneEls = el.pane.querySelectorAll(".sr-w");
		curEl = null; sentA = sentB = -1;
		var pages = Math.ceil(n / PAGE);
		el.tvnav.hidden = pages < 2;
		el.tvpage.textContent = "Page " + (page + 1) + " of " + pages;
		el.tvprev.disabled = page === 0; el.tvnext.disabled = page >= pages - 1;
		el.pane.scrollTop = 0;
	}
	function markCur(i) {
		if (!paneVisible()) return;
		if (i < 0 || !T.words.length) { if (curEl) curEl.classList.remove("is-cur"); curEl = null; return; }
		if (paneStart < 0 || i < paneStart || i >= paneStart + PAGE) renderPane(true);
		var j = i - paneStart, e = paneEls[j];
		if (!e) return;
		if (curEl && curEl !== e) curEl.classList.remove("is-cur");
		e.classList.add("is-cur"); curEl = e;
		// sentence band
		var k = L.sentenceStartAt(T.starts, i), a = T.starts[k] || 0, b = k + 1 < T.starts.length ? T.starts[k + 1] : T.words.length;
		if (a !== sentA || b !== sentB) {
			var s;
			if (sentA >= 0 && sentB - sentA <= 150) for (s = Math.max(sentA, paneStart); s < Math.min(sentB, paneStart + PAGE); s++) if (paneEls[s - paneStart]) paneEls[s - paneStart].classList.remove("is-sent");
			sentA = a; sentB = b;
			if (b - a <= 150) for (s = Math.max(a, paneStart); s < Math.min(b, paneStart + PAGE); s++) if (paneEls[s - paneStart]) paneEls[s - paneStart].classList.add("is-sent");
		}
		var p = el.pane, top = e.offsetTop, h = e.offsetHeight;
		if (top < p.scrollTop + 10 || top + h > p.scrollTop + p.clientHeight * 0.78) p.scrollTop = Math.max(0, top - p.clientHeight * 0.3);
	}
	function setTv(open) {
		el.tvbody.hidden = !open;
		el.tvtoggle.setAttribute("aria-expanded", open ? "true" : "false");
		if (open) { renderPane(true); markCur(P.idx); }
	}
	function syncTv() {
		if (S.mode === "aloud") setTv(true);
		else setTv(!!S.tv);
	}

	/* =================================================== playback core ===== */
	function setPlayUI() {
		el.play.setAttribute("data-playing", P.playing ? "1" : "0");
		el.play.setAttribute("aria-label", P.playing ? "Pause (Space)" : "Play (Space)");
	}
	function stopAll(quiet) {                 // stop timers + speech without touching the position
		clearTimeout(timer); clearTimeout(restartTimer);
		cancelSpeech();
		if (P.playing) { P.playMs += performance.now() - P.playFrom; }
		P.playing = false;
		setPlayUI();
		if (!quiet) announce("Paused at word " + fmt(P.idx + 1) + " of " + fmt(T.words.length));
	}
	function play() {
		if (!T.words.length) { toast("Add some text first"); el.text.focus(); return; }
		if (P.playing) return;
		if (isSpeech() && !SP.ok) { note("Read aloud is not available in this browser.", true); return; }
		if (P.finished || P.idx >= T.words.length - 1 && !P.shown) { P.idx = 0; }
		if (P.finished) { P.finished = false; P.idx = 0; P.playMs = 0; P.sessionWords = 0; }
		if (!P.shown && P.idx === 0) { P.playMs = 0; }
		P.finished = false; P.shown = true;
		P.playing = true; P.playFrom = performance.now(); P.startIdx = P.idx;
		setPlayUI();
		announce("Playing");
		if (S.mode === "speed") startSilent(); else speakFrom(P.idx);
		show();
	}
	function pause() {
		if (!P.playing) return;
		stopAll(true);
		if (S.mode === "speed" && S.rewind) P.idx = Math.max(0, T.chunks[L.chunkAt(T.chunks, P.idx)].a - 5);
		P.shown = true;
		show();
		announce("Paused at word " + fmt(P.idx + 1) + " of " + fmt(T.words.length));
	}
	function toggle() { if (P.playing) pause(); else play(); }
	function restart() {
		stopAll(true);
		P.idx = 0; P.shown = false; P.finished = false; P.playMs = 0;
		show(); persist();
		announce("Back at the start");
	}
	function finish() {
		var ms = P.playMs + (P.playing ? performance.now() - P.playFrom : 0);
		var words = T.words.length - (P.startIdx || 0);
		stopAll(true);
		P.finished = true; P.shown = false;
		P.idx = Math.max(0, T.words.length - 1);
		var wpm = L.wpmFromTime(words, ms);
		var msg = "<b>Finished.</b> " + fmt(words) + " words in " + L.clock(ms) + (isSpeech() ? "" : " (about " + fmt(wpm) + " wpm)") + "<br><small>Press play to read it again</small>";
		setMsg(msg);
		updatePos(); markCur(P.idx);
		announce("Finished. " + fmt(words) + " words in " + L.formatDuration(ms));
		if (S.mode === "aloud") toast("Finished");
		persist();
	}
	// jump to a word (text view click, progress bar, buttons); keeps playing if it was playing
	function seek(i, opts) {
		opts = opts || {};
		if (!T.words.length) return;
		i = L.clamp(Math.round(i), 0, T.words.length - 1);
		var was = P.playing;
		P.idx = i; P.shown = true; P.finished = false;
		if (was) {
			if (S.mode === "speed") { clearTimeout(timer); startSilent(true); }
			else { clearTimeout(restartTimer); restartTimer = setTimeout(function () { if (P.playing) speakFrom(P.idx); }, opts.fast ? 0 : 220); }
		}
		show();
		persist();
	}
	function stepWord(d) { if (P.playing && S.mode === "speed") { var c = T.chunks[L.chunkAt(T.chunks, P.idx)]; seek(d > 0 ? c.b : c.a - 1, { fast: true }); } else seek(P.idx + d, { fast: true }); }
	function stepSentence(d) { seek(d > 0 ? L.nextSentenceStart(T.starts, P.idx, T.words.length) : L.prevSentenceStart(T.starts, P.idx), { fast: true }); }

	/* ----- silent RSVP ----- */
	function startSilent(fromSeek) {
		var ci = L.chunkAt(T.chunks, P.idx);
		P.startCi = ci;
		P.idx = T.chunks[ci].a;
		drawStage(P.idx);
		updatePos(); markCur(P.idx);
		var due = performance.now() + delayAt(ci);
		loopSilent(ci, due);
	}
	function delayAt(ci) {
		return L.delayOf(T.cum, ci) * L.rampFactor(ci - P.startCi, S.ramp ? 10 : 0, 2);
	}
	function loopSilent(ci, due) {
		clearTimeout(timer);
		timer = setTimeout(function () {
			if (!P.playing || S.mode !== "speed") return;
			ci++;
			if (ci >= T.chunks.length) { finish(); return; }
			P.idx = T.chunks[ci].a;
			drawStage(P.idx);
			updatePos(); markCur(P.idx);
			due += delayAt(ci);
			var now = performance.now();
			if (due < now - 150) due = now;            // a throttled background tab must not burst-play to catch up
			if ((ci & 15) === 0) persist();
			loopSilent(ci, due);
		}, Math.max(0, due - performance.now()));
	}

	/* ----- speech ----- */
	var SP = { ok: false, voices: [], voice: null, gen: 0, keep: [], hasBoundary: false, sawEnd: false, est: 0, wd: 0, warned: false };
	function note(msg, force) {
		if (!msg) { el.note.hidden = true; el.note.textContent = ""; return; }
		el.note.textContent = msg; el.note.hidden = false;
	}
	function voiceKey(v) { return (v.voiceURI || v.name) + "|" + v.lang; }
	function loadVoices() {
		var list = [];
		try { list = speechSynthesis.getVoices() || []; } catch (e) {}
		SP.voices = list.slice();
		var sel = el.voice, groups = {}, order = [], dn = null;
		try { dn = new Intl.DisplayNames([navigator.language || "en"], { type: "language" }); } catch (e) {}
		function langName(code) {
			var c = String(code || "").replace("_", "-");
			if (!c) return "Other";
			try { return (dn && dn.of(c)) || c; } catch (e) { return c; }
		}
		sel.innerHTML = "";
		var auto = document.createElement("option");
		auto.value = "auto"; auto.textContent = "Automatic (best match for the text)";
		sel.appendChild(auto);
		if (!list.length) {
			var none = document.createElement("option");
			none.disabled = true; none.textContent = voicesGaveUp ? "No voices found on this device" : "Loading voices…";
			sel.appendChild(none);
		}
		list.forEach(function (v) {
			var key = langName(v.lang);
			if (!groups[key]) { groups[key] = []; order.push({ name: key, lang: String(v.lang || "").toLowerCase() }); }
			groups[key].push(v);
		});
		var ul = String(navigator.language || "en").toLowerCase().split("-")[0], tl = (T.lang || "").toLowerCase();
		order.sort(function (a, b) {
			function r(g) { var l = g.lang.split("-")[0]; return l === tl ? 0 : l === ul ? 1 : 2; }
			return r(a) - r(b) || a.name.localeCompare(b.name);
		});
		order.forEach(function (g) {
			var og = document.createElement("optgroup");
			og.label = g.name;
			groups[g.name].sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (v) {
				var o = document.createElement("option");
				o.value = voiceKey(v);
				o.textContent = v.name + (v.localService === false ? " · online" : "");
				og.appendChild(o);
			});
			sel.appendChild(og);
		});
		var has = S.voice !== "auto" && list.some(function (v) { return voiceKey(v) === S.voice; });
		sel.value = has ? S.voice : "auto";
		resolveVoice();
		refreshVoiceLabel();
	}
	var voicesGaveUp = false;
	function resolveVoice() {
		var v = null;
		if (S.voice !== "auto") for (var i = 0; i < SP.voices.length; i++) if (voiceKey(SP.voices[i]) === S.voice) { v = SP.voices[i]; break; }
		if (!v) v = L.pickVoice(SP.voices, T.lang, navigator.language);
		SP.voice = v;
		return v;
	}
	function refreshVoiceLabel() {
		if (!SP.ok || !el.voice.options.length) return;
		if (S.voice === "auto") resolveVoice();
		var o = el.voice.options[0];
		o.textContent = "Automatic" + (SP.voice ? ": " + SP.voice.name + " (" + SP.voice.lang + ")" : "");
	}
	function initSpeech() {
		SP.ok = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
		if (!SP.ok) {
			el.modes.querySelectorAll("button[data-m=aloud], button[data-m=both]").forEach(function (b) { b.disabled = true; b.title = "Not supported by this browser"; });
			if (S.mode !== "speed") S.mode = "speed";
			note("This browser does not support the speech feature (Web Speech API), so Read aloud and Read + listen are switched off. Speed read works as normal. Chrome, Edge, Safari and most Android and iOS browsers support it.");
			return;
		}
		try { speechSynthesis.cancel(); } catch (e) {}
		loadVoices();
		try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; }
		var tries = 0;                                  // Chrome and Safari fill the list late (or never fire voiceschanged)
		(function poll() {
			if (SP.voices.length || tries++ > 16) { if (!SP.voices.length) { voicesGaveUp = true; loadVoices(); } return; }
			setTimeout(function () { loadVoices(); poll(); }, 250);
		})();
		window.addEventListener("pagehide", function () { try { speechSynthesis.cancel(); } catch (e) {} });
	}
	function cancelSpeech() {
		SP.gen++;
		clearTimeout(SP.est); clearTimeout(SP.wd);
		SP.keep = [];
		if (SP.ok) { try { speechSynthesis.cancel(); } catch (e) {} }
	}
	function speakFrom(idx) {
		if (!SP.ok) return;
		var busy = false;
		try { busy = speechSynthesis.speaking || speechSynthesis.pending; } catch (e) {}
		cancelSpeech();
		var gen = SP.gen;
		SP.hasBoundary = false; SP.sawEnd = false;
		resolveVoice();
		P.idx = idx;
		var go = function () { if (gen === SP.gen && P.playing) queueChunk(L.speechChunk(T.words, T.text, idx, 200), gen, 0); };
		// Chrome can drop a speak() issued straight after cancel(); iOS needs the first speak() inside the click, so only delay when something was playing
		if (busy) setTimeout(go, 70); else go();
	}
	function queueChunk(ch, gen, attempt) {
		if (!ch) return;
		var u = new SpeechSynthesisUtterance(ch.text);
		var v = SP.voice;
		if (v) { u.voice = v; u.lang = v.lang; } else if (T.lang) u.lang = T.lang;
		u.rate = S.rate; u.pitch = S.pitch; u.volume = S.vol;
		var started = false;
		u.onstart = function () {
			if (gen !== SP.gen) return;
			started = true; clearTimeout(SP.wd);
			setSpeechWord(ch.a);
			if (!ch.next) {                              // queue the next sentence right away so there is no gap between utterances
				ch.next = L.speechChunk(T.words, T.text, ch.b, 200);
				if (ch.next) { ch.next.isNext = true; queueChunk(ch.next, gen, 0); }
			}
			// no boundary events within ~0.8 s -> follow an estimate of the voice's pace instead
			clearTimeout(SP.est);
			SP.est = setTimeout(function () { if (gen === SP.gen && !ch.gotB) estimate(ch, gen, performance.now() - 800); }, 800);
		};
		u.onboundary = function (e) {
			if (gen !== SP.gen) return;
			if (e.name && e.name !== "word") return;
			ch.gotB = true; SP.hasBoundary = true;
			clearTimeout(SP.est);
			if (SP.warned) { SP.warned = false; note(""); }
			setSpeechWord(L.wordAtChar(T.words, ch.start + (e.charIndex || 0)));
		};
		u.onend = function () {
			if (gen !== SP.gen) return;
			clearTimeout(SP.est);
			if (!ch.gotB && ch.b - ch.a > 3 && !SP.warned) {
				SP.warned = true;
				note(S.mode === "both" ? "This voice does not report which word it is saying, so the word display is timed to an estimate of its speed. Pick another voice (a local one, not marked online) for exact sync." : "This voice does not report which word it is saying, so the highlight follows an estimate of its speed. Pick another voice (a local one, not marked online) for exact sync.");
			}
			if (ch.b >= T.words.length) { P.idx = T.words.length - 1; finish(); }
		};
		u.onerror = function (e) {
			if (gen !== SP.gen) return;
			var err = e && e.error;
			if (err === "interrupted" || err === "canceled") return;
			clearTimeout(SP.est);
			if (!started && attempt < 1) { try { speechSynthesis.cancel(); } catch (x) {} setTimeout(function () { if (gen === SP.gen) queueChunk(ch, gen, attempt + 1); }, 150); return; }
			var msg = err === "not-allowed" ? "The browser blocked speech until you interact with the page. Press play again."
				: err === "synthesis-unavailable" || err === "voice-unavailable" || err === "language-unavailable" ? "That voice is not available on this device. Pick another voice."
				: "The voice stopped (" + (err || "unknown error") + "). Try another voice.";
			stopAll(true); show(); note(msg);
		};
		SP.keep.push(u);
		if (SP.keep.length > 6) SP.keep.shift();          // Chrome can garbage-collect a playing utterance and lose its events: hold a few
		if (attempt === 0 && !ch.isNext) {                // watchdog for a speak() that silently never starts
			clearTimeout(SP.wd);
			SP.wd = setTimeout(function () {
				if (gen !== SP.gen || started) return;
				try { speechSynthesis.cancel(); } catch (x) {}
				setTimeout(function () { if (gen === SP.gen) queueChunk(ch, gen, 1); }, 120);
			}, 3500);
		}
		try { speechSynthesis.speak(u); } catch (x) { note("Speech failed to start: " + x.message); stopAll(true); }
	}
	// timed fallback: advance word by word from the speech-rate estimate until real boundary events show up
	function estimate(ch, gen, t0) {
		function step() {
			if (gen !== SP.gen || ch.gotB || !P.playing) return;
			var elapsed = performance.now() - t0, wi = P.idx;
			if (wi < ch.a) wi = ch.a;
			while (wi + 1 < ch.b && L.speechEstimateMs(T.words, ch.a, wi + 1, S.rate) <= elapsed) wi++;
			setSpeechWord(wi);
			var nextAt = wi + 1 < ch.b ? L.speechEstimateMs(T.words, ch.a, wi + 1, S.rate) - elapsed : 400;
			SP.est = setTimeout(step, Math.max(40, nextAt));
		}
		step();
	}
	function setSpeechWord(wi) {
		if (!P.playing) return;
		wi = L.clamp(wi, 0, T.words.length - 1);
		P.idx = wi;
		if (S.mode === "both") drawStage(wi);
		updatePos(); markCur(wi);
		if ((wi & 15) === 0) persist();
	}

	/* ====================================================== controls ===== */
	function setMode(m, quiet) {
		if (L.MODES.indexOf(m) < 0 || (m !== "speed" && !SP.ok)) return;
		var was = P.playing;
		if (was) stopAll(true);
		S.mode = m;
		el.reader.setAttribute("data-mode", m);
		[].forEach.call(el.modes.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === m ? "true" : "false"); });
		el.speedrow.hidden = m !== "speed";
		el.voicerow.hidden = m === "speed";
		if (m === "speed") { if (SP.warned) { SP.warned = false; note(""); } }
		syncTv();
		P.shown = P.shown || false;
		stageW = el.stage.clientWidth;
		renderStats();
		show();
		persist();
		if (!quiet) announce({ speed: "Speed read mode", aloud: "Read aloud mode", both: "Read and listen mode" }[m]);
	}
	function setWpm(w, opts) {
		opts = opts || {};
		S.wpm = L.clampWpm(w);
		wpmNum.value = S.wpm;
		el.wpmr.value = Math.round(1000 * Math.log(S.wpm / L.MIN_WPM) / Math.log(L.MAX_WPM / L.MIN_WPM));
		[].forEach.call(el.presets.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-w") === S.wpm ? "true" : "false"); });
		if (opts.rebuild) rebuild(); else retime();
		renderStats();
		if (P.playing && S.mode === "speed") { clearTimeout(timer); startSilentKeep(); }
		updatePos();
		if (!opts.noSave) persist();
	}
	function startSilentKeep() {                 // after a speed change: keep going from the current chunk without re-ramping
		var ci = L.chunkAt(T.chunks, P.idx);
		var due = performance.now() + L.delayOf(T.cum, ci);
		loopSilent(ci, due);
	}
	function snapWpm(v) { return v < 200 ? Math.round(v / 5) * 5 : v < 500 ? Math.round(v / 10) * 10 : Math.round(v / 25) * 25; }
	function nudgeWpm(dir) { var w = S.wpm, st = w < 200 ? 10 : w < 600 ? 25 : 50; setWpm(dir > 0 ? (Math.floor(w / st) + 1) * st : (Math.ceil(w / st) - 1) * st); }
	function setRate(r, noSave) {
		S.rate = L.clamp(Math.round(r * 10) / 10, 0.5, 3);
		el.rate.value = S.rate; el.rateo.textContent = S.rate.toFixed(1) + "×";
		renderStats(); updatePos();
		if (!noSave) persist();
		restartSpeechSoon();
	}
	function restartSpeechSoon() {
		if (P.playing && isSpeech()) { clearTimeout(restartTimer); restartTimer = setTimeout(function () { if (P.playing) speakFrom(P.idx); }, 350); }
	}
	function setChunk(n) {
		S.chunk = n;
		[].forEach.call(el.chunk.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-n") === n ? "true" : "false"); });
		var w = P.idx;
		rebuild(); renderStats();
		if (P.playing && S.mode === "speed") { clearTimeout(timer); startSilentKeep(); }
		P.idx = w;
		if (P.shown) drawStage(P.idx);
		updatePos(); persist();
	}
	function setTheme(t) {
		S.theme = t;
		[].forEach.call(el.th.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-t") === t ? "true" : "false"); });
		applyDisplay(); persist();
	}
	function syncControls() {
		setWpm(S.wpm, { noSave: true, rebuild: true });
		setChunk(S.chunk);
		el.smart.checked = S.smart; el.ramp.checked = S.ramp; el.rewind.checked = S.rewind;
		el.font.value = S.font; el.size.value = S.size; el.sizeo.textContent = S.size;
		el.orpon.checked = S.orp; el.guideon.checked = S.guide; el.ctxon.checked = S.ctx; el.progon.checked = S.prog;
		el.rate.value = S.rate; el.rateo.textContent = S.rate.toFixed(1) + "×";
		el.pitch.value = S.pitch; el.pitcho.textContent = S.pitch.toFixed(1);
		el.vol.value = S.vol; el.volo.textContent = Math.round(S.vol * 100) + "%";
		[].forEach.call(el.th.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-t") === S.theme ? "true" : "false"); });
		applyDisplay();
	}

	/* focus mode */
	function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
	function setFocus(on) {
		if (on === P.focus) return;
		P.focus = on;
		el.reader.classList.toggle("is-focus", on);
		el.focus.setAttribute("aria-pressed", on ? "true" : "false");
		el.focus.setAttribute("aria-label", on ? "Exit focus mode" : "Focus mode (full screen)");
		document.documentElement.classList.toggle("sr-lock", on);
		try {
			if (on) {
				var f = el.reader.requestFullscreen || el.reader.webkitRequestFullscreen;
				var pr = f && f.call(el.reader);
				if (pr && pr.catch) pr.catch(function () {});
			} else if (fsElement()) {
				var x = document.exitFullscreen || document.webkitExitFullscreen;
				var pr2 = x && x.call(document);
				if (pr2 && pr2.catch) pr2.catch(function () {});
			}
		} catch (e) {}
		applyDisplay();
		requestAnimationFrame(function () { stageW = el.stage.clientWidth; if (P.shown) drawStage(P.idx); });
		if (on) el.reader.scrollTop = 0;
	}

	/* input helpers */
	function readFile(file) {
		if (!file) return;
		var name = (file.name || "").toLowerCase();
		el.warn.textContent = "";
		if (/\.(pdf|docx?|odt|rtf|epub|pages)$/.test(name) || /^(application\/pdf|application\/msword|application\/vnd)/.test(file.type || "")) {
			el.warn.textContent = "That file type can’t be read here. Open it, copy the text and paste it into the box. Text (.txt), Markdown (.md) and HTML (.html) files work directly.";
			return;
		}
		if (file.size > 8 * 1024 * 1024) { el.warn.textContent = "That file is over 8 MB. Try a smaller piece of it."; return; }
		var done = function (txt) {
			if ((txt.match(/�/g) || []).length > 20 + txt.length / 100) { el.warn.textContent = "That does not look like a text file."; return; }
			if (/\.html?$/.test(name) || /^\s*<(!doctype|html)/i.test(txt)) txt = L.htmlToText(txt);
			else if (/\.(md|markdown)$/.test(name)) txt = L.markdownToText(txt);
			loadIntoBox(txt);
			toast("Loaded " + (file.name || "file"));
		};
		if (file.text) file.text().then(done, function () { el.warn.textContent = "Could not read that file."; });
		else {
			var fr = new FileReader();
			fr.onload = function () { done(String(fr.result || "")); };
			fr.onerror = function () { el.warn.textContent = "Could not read that file."; };
			fr.readAsText(file);
		}
	}
	function loadIntoBox(txt) {
		var c = L.cleanText(txt);
		el.text.value = c;
		setText(c);
		el.text.scrollTop = 0;
	}
	function copyText(s, okMsg) {
		function fallback() {
			var ta = document.createElement("textarea");
			ta.value = s; ta.style.position = "fixed"; ta.style.opacity = "0";
			document.body.appendChild(ta); ta.select();
			var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
			document.body.removeChild(ta);
			toast(ok ? okMsg : "Copy failed");
		}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(function () { toast(okMsg); }, fallback);
		else fallback();
	}

	/* measure my reading speed */
	var M = { t0: 0, raf: 0, words: 0 };
	function measureOpen() {
		el.measure.hidden = false;
		el.mtext.textContent = MEASURE_TEXT;
		el.mtext.classList.add("is-hidden");
		M.words = L.countWords(MEASURE_TEXT);
		el.mstart.disabled = false; el.mdone.disabled = true;
		el.mresult.textContent = ""; el.mtime.textContent = "";
		el.measure.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
	}
	function measureStart() {
		el.mtext.classList.remove("is-hidden"); el.mtext.scrollTop = 0;
		el.mstart.disabled = true; el.mdone.disabled = false; el.mresult.textContent = "";
		M.t0 = performance.now();
		(function tick() { el.mtime.textContent = L.clock(performance.now() - M.t0); M.raf = setTimeout(tick, 250); })();
	}
	function measureDone() {
		clearTimeout(M.raf);
		var ms = performance.now() - M.t0, wpm = L.wpmFromTime(M.words, ms);
		el.mdone.disabled = true; el.mstart.disabled = false; el.mstart.textContent = "Try again";
		el.mtime.textContent = L.clock(ms);
		if (ms < 3000 || wpm > 1500) { el.mresult.textContent = "That was too fast to be reading it all. Try again at your normal pace."; return; }
		var tip = L.clampWpm(Math.round(wpm * 1.15 / 10) * 10);
		el.mresult.innerHTML = "";
		var s = document.createElement("span");
		s.textContent = "You read " + M.words + " words in " + L.clock(ms) + ": about " + fmt(wpm) + " words per minute" + (wpm >= 150 && wpm < 500 ? " (the average adult is around 238). " : ". ");
		el.mresult.appendChild(s);
		var b = document.createElement("button");
		b.type = "button"; b.className = "tu-btn"; b.textContent = "Set speed to " + tip + " wpm";
		b.addEventListener("click", function () { setWpm(tip); toast("Speed set to " + tip + " wpm (your speed +15%)"); });
		el.mresult.appendChild(b);
		el.mtext.classList.add("is-hidden");
	}
	function measureClose() { clearTimeout(M.raf); el.measure.hidden = true; el.mstart.textContent = "Start"; }

	/* ===================================================== wiring ===== */
	function bind() {
		el.modes.addEventListener("click", function (e) { var b = e.target.closest("button[data-m]"); if (b && !b.disabled) setMode(b.getAttribute("data-m")); });
		el.focus.addEventListener("click", function () { setFocus(!P.focus); });
		el.play.addEventListener("click", toggle);
		el.restart.addEventListener("click", restart);
		el.prevw.addEventListener("click", function () { stepWord(-1); });
		el.nextw.addEventListener("click", function () { stepWord(1); });
		el.prevs.addEventListener("click", function () { stepSentence(-1); });
		el.nexts.addEventListener("click", function () { stepSentence(1); });
		el.seek.addEventListener("input", function () { seek(+el.seek.value); });

		wpmNum.addEventListener("change", function () { setWpm(wpmNum.value); });
		wpmNum.addEventListener("keydown", function (e) { if (e.key === "Enter") { setWpm(wpmNum.value); wpmNum.blur(); } });
		el.wpmr.addEventListener("input", function () { setWpm(snapWpm(L.MIN_WPM * Math.pow(L.MAX_WPM / L.MIN_WPM, +el.wpmr.value / 1000))); });
		el.wpmminus.addEventListener("click", function () { nudgeWpm(-1); });
		el.wpmplus.addEventListener("click", function () { nudgeWpm(1); });
		el.presets.addEventListener("click", function (e) { var b = e.target.closest("button[data-w]"); if (b) setWpm(+b.getAttribute("data-w")); });

		if (window.MESVoicePicker) MESVoicePicker.enhance(el.voice, { sample: "Hello, this is how I will read your text aloud." });   // searchable list with a preview button per voice
		el.voice.addEventListener("change", function () { S.voice = el.voice.value; resolveVoice(); refreshVoiceLabel(); persist(); restartSpeechSoon(); });
		el.rate.addEventListener("input", function () { setRate(+el.rate.value); });
		el.pitch.addEventListener("input", function () { S.pitch = +el.pitch.value; el.pitcho.textContent = S.pitch.toFixed(1); persist(); restartSpeechSoon(); });
		el.vol.addEventListener("input", function () { S.vol = +el.vol.value; el.volo.textContent = Math.round(S.vol * 100) + "%"; persist(); restartSpeechSoon(); });

		el.chunk.addEventListener("click", function (e) { var b = e.target.closest("button[data-n]"); if (b) setChunk(+b.getAttribute("data-n")); });
		el.smart.addEventListener("change", function () { S.smart = el.smart.checked; setWpm(S.wpm, { rebuild: true }); });
		el.ramp.addEventListener("change", function () { S.ramp = el.ramp.checked; persist(); });
		el.rewind.addEventListener("change", function () { S.rewind = el.rewind.checked; persist(); });
		el.font.addEventListener("change", function () { S.font = el.font.value; applyDisplay(); if (P.shown) drawStage(P.idx); persist(); });
		el.size.addEventListener("input", function () { S.size = +el.size.value; el.sizeo.textContent = S.size; applyDisplay(); if (P.shown) drawStage(P.idx); persist(); });
		el.th.addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) setTheme(b.getAttribute("data-t")); });
		[["orpon", "orp"], ["guideon", "guide"], ["ctxon", "ctx"], ["progon", "prog"]].forEach(function (p) {
			el[p[0]].addEventListener("change", function () { S[p[1]] = el[p[0]].checked; applyDisplay(); if (P.shown) drawStage(P.idx); persist(); });
		});
		el.link.addEventListener("click", function () {
			var u = location.origin + location.pathname + "?" + L.buildParams(S);
			copyText(u, "Link to your settings copied");
		});
		el.reset.addEventListener("click", function () {
			var keepVoice = S.voice, w = S.mode;
			for (var k2 in DEF) S[k2] = DEF[k2];
			S.mode = w; S.voice = keepVoice;
			syncControls(); setMode(S.mode, true); renderStats(); show(); persist();
			toast("Settings reset");
		});

		el.tvtoggle.addEventListener("click", function () { S.tv = el.tvbody.hidden; setTv(S.tv); persist(); });
		el.pane.addEventListener("click", function (e) {
			var w = e.target.closest(".sr-w");
			if (!w) return;
			seek(+w.getAttribute("data-i"), { fast: true });
		});
		el.tvprev.addEventListener("click", function () { seek(Math.max(0, paneStart - PAGE), { fast: true }); });
		el.tvnext.addEventListener("click", function () { var s = Math.min(T.words.length - 1, paneStart + PAGE); seek(s, { fast: true }); });

		// text input
		var typeTimer = 0;
		el.text.addEventListener("input", function () {
			clearTimeout(typeTimer);
			el.warn.textContent = "";
			typeTimer = setTimeout(function () { setText(el.text.value); }, 300);
		});
		el.paste.addEventListener("click", function () {
			if (navigator.clipboard && navigator.clipboard.readText) {
				navigator.clipboard.readText().then(function (t) {
					if (!t || !t.trim()) { el.warn.textContent = "The clipboard is empty."; return; }
					loadIntoBox(t); toast("Pasted from the clipboard");
				}, function () { el.warn.textContent = "Your browser blocked clipboard access. Click in the text box and press Ctrl+V (Cmd+V on a Mac) instead."; el.text.focus(); });
			} else { el.warn.textContent = "This browser can’t read the clipboard from a button. Click in the text box and press Ctrl+V (Cmd+V on a Mac)."; el.text.focus(); }
		});
		el.open.addEventListener("click", function () { el.file.click(); });
		el.file.addEventListener("change", function () { readFile(el.file.files && el.file.files[0]); el.file.value = ""; });
		el.here.addEventListener("click", function () {
			if (!T.words.length) return;
			var pos = el.text.selectionStart || 0;
			var prefixWords = L.countWords(el.text.value.slice(0, pos));
			var wi = Math.min(T.words.length - 1, Math.max(0, prefixWords - (pos > 0 && /\S$/.test(el.text.value.slice(0, pos)) ? 1 : 0)));
			seek(wi, { fast: true }); P.shown = true; show();
			toast("Starting from word " + fmt(wi + 1));
			el.reader.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
		});
		el.clear.addEventListener("click", function () { el.text.value = ""; el.warn.textContent = ""; setText(""); el.text.focus(); });
		root.querySelector(".sr-samples").addEventListener("click", function (e) {
			var b = e.target.closest("button[data-s]");
			if (b && SAMPLES[b.getAttribute("data-s")]) { loadIntoBox(SAMPLES[b.getAttribute("data-s")]); }
		});
		el.measurebtn.addEventListener("click", measureOpen);
		el.mstart.addEventListener("click", measureStart);
		el.mdone.addEventListener("click", measureDone);
		el.mclose.addEventListener("click", measureClose);

		// drag and drop a file anywhere on the tool
		var dragN = 0;
		function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
		root.addEventListener("dragenter", function (e) { if (hasFiles(e)) { dragN++; el.input.classList.add("is-drag"); e.preventDefault(); } });
		root.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
		root.addEventListener("dragleave", function (e) { if (hasFiles(e) && --dragN <= 0) { dragN = 0; el.input.classList.remove("is-drag"); } });
		root.addEventListener("drop", function (e) {
			if (!hasFiles(e)) return;
			e.preventDefault(); dragN = 0; el.input.classList.remove("is-drag");
			var f = e.dataTransfer.files && e.dataTransfer.files[0];
			if (f) readFile(f);
		});

		// keyboard shortcuts
		document.addEventListener("keydown", function (e) {
			if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
			var t = e.target, tag = t && t.tagName, type = t && t.type;
			if (tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
			if (tag === "INPUT" && type !== "range" && type !== "checkbox" && type !== "radio") return;
			if (document.querySelector("#mes-search.is-open")) return;
			var key = e.key, onBtn = tag === "BUTTON" || tag === "SUMMARY" || tag === "A" || (tag === "INPUT" && (type === "checkbox" || type === "radio"));
			var inRange = tag === "INPUT" && type === "range";
			if (!P.focus && !readerInView()) { if (!(key === "Escape" && P.playing && root.contains(t))) return; }
			var handled = true;
			if (key === " " || key === "Spacebar") { if (onBtn) return; toggle(); }
			else if (key === "ArrowLeft" || key === "ArrowRight") { if (inRange) return; var d = key === "ArrowRight" ? 1 : -1; if (e.shiftKey) stepSentence(d); else stepWord(d); }
			else if (key === "ArrowUp" || key === "ArrowDown" || key === "+" || key === "=" || key === "-" || key === "_") {
				if (inRange) return;
				var dir = (key === "ArrowUp" || key === "+" || key === "=") ? 1 : -1;
				if (S.mode === "speed") nudgeWpm(dir); else setRate(S.rate + dir * 0.1);
			}
			else if (key === "r" || key === "R") restart();
			else if (key === "f" || key === "F") setFocus(!P.focus);
			else if (key === "1" || key === "2" || key === "3") setMode(L.MODES[+key - 1]);
			else if (key === "Escape") { if (P.focus) setFocus(false); else if (P.playing) pause(); else handled = false; }
			else handled = false;
			if (handled) e.preventDefault();
		});
		/* drag the grip under the text view to make it taller / shorter (default is short so a phone page still scrolls) */
		(function () {
			var y0 = 0, h0 = 0, drag = false, g = el.grip;
			if (!g) return;
			g.addEventListener("pointerdown", function (e) { drag = true; y0 = e.clientY; h0 = el.pane.getBoundingClientRect().height; try { g.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
			g.addEventListener("pointermove", function (e) {
				if (!drag) return;
				var h = Math.max(96, Math.min(window.innerHeight * 0.9, h0 + e.clientY - y0));
				el.pane.style.setProperty("--sr-ph", Math.round(h) + "px");
			});
			function end() { drag = false; }
			g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
		})();
		document.addEventListener("fullscreenchange", function () { if (!fsElement() && P.focus) setFocus(false); });
		document.addEventListener("webkitfullscreenchange", function () { if (!fsElement() && P.focus) setFocus(false); });

		// theme + size follow the page
		try { new MutationObserver(function () { if (S.theme === "auto") { applyDisplay(); if (P.shown) drawStage(P.idx); } }).observe(document.body, { attributes: true, attributeFilter: ["class"] }); } catch (e) {}
		try {
			new ResizeObserver(function () {
				var w = el.stage.clientWidth;
				if (w && w !== stageW) { stageW = w; if (P.shown) drawStage(P.idx); }
			}).observe(el.stage);
		} catch (e) { window.addEventListener("resize", function () { stageW = el.stage.clientWidth; if (P.shown) drawStage(P.idx); }); }
		window.addEventListener("beforeunload", function () { if (!ready) return; clearTimeout(saveTimer); store.set({ v: 1, t: T.raw.length < 1500000 ? T.raw : "", s: S, p: P.idx }); });
		document.addEventListener("visibilitychange", function () { if (document.hidden && P.playing && S.mode === "speed") pause(); });
	}
	function readerInView() {
		var r = el.reader.getBoundingClientRect();
		return r.bottom > 80 && r.top < (window.innerHeight || 800) - 80;
	}

	/* ======================================================== init ===== */
	function init() {
		var saved = store.get();
		var o = sanitize(saved && saved.s), q = sanitize(L.parseParams(location.search));
		for (var a in o) S[a] = o[a];
		for (var b in q) S[b] = q[b];
		bind();
		initSpeech();
		syncControls();
		el.reader.setAttribute("data-mode", S.mode);
		var text = saved && typeof saved.t === "string" ? saved.t : SAMPLES.alice;   // first visit: something to read straight away (a cleared box stays cleared)
		el.text.value = text;
		setText(text, { pos: saved && saved.t === text && typeof saved.p === "number" ? saved.p : 0 });
		setMode(S.mode, true);
		setWpm(S.wpm, { noSave: true });
		el.speedrow.hidden = S.mode !== "speed"; el.voicerow.hidden = S.mode === "speed";
		syncTv();
		show();
		ready = true;
		persist();
	}
	init();
	// small hook for tests / debugging
	window.MESSpeedReader = { state: S, pos: P, text: T, speech: SP, play: play, pause: pause, seek: seek, setMode: setMode, setWpm: setWpm };
})();
