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
