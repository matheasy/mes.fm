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
