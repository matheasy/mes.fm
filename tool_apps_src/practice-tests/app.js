/* MES Practice Tests page script (tool_apps_src/practice-tests/app.js). One script for the hub (/practice-tests) and the four test pages;
   data-page / data-grade / data-subject on #pt pick the page. Questions, checking and scoring: lib.js (window.MESPT) + passages.js.
   State: localStorage "mes-practice-tests:v1" = { runs: { "4-numeracy": run }, hist: [...], prefs: {...} }. Nothing is uploaded. */
(function () {
	"use strict";
	var T = window.MESPT, root = document.getElementById("pt");
	if (!T || !root) return;
	function $(id) { return document.getElementById(id); }
	var esc = T.esc, KEY = "mes-practice-tests:v1", S;
	try { S = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { S = {}; }
	if (!S || typeof S !== "object") S = {};
	S.runs = S.runs || {}; S.hist = Array.isArray(S.hist) ? S.hist : []; S.prefs = S.prefs || {};
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
	var toastT;
	function toast(msg) { var t = $("pt-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	var PAGES = { "4-numeracy": ["/fsa-grade-4-numeracy", "Grade 4 Numeracy"], "4-literacy": ["/fsa-grade-4-literacy", "Grade 4 Literacy"], "7-numeracy": ["/fsa-grade-7-numeracy", "Grade 7 Numeracy"], "7-literacy": ["/fsa-grade-7-literacy", "Grade 7 Literacy"] };
	var MODE_NAME = { full: "Full test", quick: "Quick 10", topic: "Topic practice" };
	function histRow(h, withPage) {
		var p = PAGES[h.p] || ["#", h.p], d = new Date(h.d), pct = h.max ? Math.round(h.got / h.max * 100) : 0;
		return '<li><span class="pt-hpct" style="--p:' + pct + '">' + pct + '%</span><span class="pt-hmain">' + (withPage ? '<a href="' + p[0] + '">' + p[1] + '</a> · ' : "") + MODE_NAME[h.mode] + (h.diff && h.diff !== "mixed" ? " (" + h.diff + ")" : "") +
			'<small>' + fmtNum(h.got) + " / " + h.max + " · " + T.fmtTime(h.ms) + " · " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · code " + h.code + "</small></span></li>";
	}
	function fmtNum(x) { return Math.round(x * 2) / 2 === Math.round(x) ? String(Math.round(x)) : String(Math.round(x * 2) / 2).replace(".5", "½"); }

	// =============================== HUB ===============================
	if (root.getAttribute("data-page") === "hub") {
		var hl = S.hist.slice().reverse().slice(0, 12);
		if (hl.length) { $("pt-hubhist").hidden = false; $("pt-hubhist-list").innerHTML = '<ul class="pt-hlist">' + hl.map(function (h) { return histRow(h, true); }).join("") + "</ul>"; }
		$("pt-hubclear").addEventListener("click", function () { if (!confirm("Clear all your saved results?")) return; S.hist = []; save(); $("pt-hubhist").hidden = true; });
		Object.keys(S.runs).forEach(function (k) { var r = S.runs[k], a = document.querySelector('.pt-tile[href="' + (PAGES[k] || [""])[0] + '"]'); if (r && !r.done && a) a.insertAdjacentHTML("beforeend", '<em class="pt-tile-badge">Test in progress</em>'); });
		return;
	}

	// =============================== TEST PAGE ===============================
	var GRADE = +root.getAttribute("data-grade"), SUBJ = root.getAttribute("data-subject"), PK = GRADE + "-" + SUBJ, LIT = SUBJ === "literacy";
	var sw = document.querySelector('.pt-switch a[data-k="' + PK + '"]'); if (sw) sw.setAttribute("aria-current", "page");
	var prefs = S.prefs[PK] || (S.prefs[PK] = { mode: "full", diff: "mixed", topics: [], timer: true, fb: false });
	var params = new URLSearchParams(location.search);
	if (/^(full|quick|topic)$/.test(params.get("mode") || "")) prefs.mode = params.get("mode");
	if (/^(mixed|easy|medium|hard)$/.test(params.get("diff") || "")) prefs.diff = params.get("diff");
	if (params.get("topic")) prefs.topics = [params.get("topic")];
	if (/^\d{3,9}$/.test(params.get("code") || "")) $("pt-code").value = params.get("code");
	var topicList = LIT ? T.SKILLS : T.TOPICS[GRADE];

	// ---------- start screen ----------
	$("pt-full-len").textContent = LIT ? "4 passages, about 24 questions" : "25 questions";
	$("pt-quick-len").textContent = LIT ? "2 passages, about 12 questions" : "10 questions";
	$("pt-topics").innerHTML = topicList.map(function (t) { return '<button type="button" class="tu-chip" data-t="' + t[0] + '" aria-pressed="false">' + esc(t[1]) + "</button>"; }).join("");
	function paintStart() {
		root.querySelectorAll(".pt-modes button").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-mode") === prefs.mode)); b.tabIndex = b.getAttribute("data-mode") === prefs.mode ? 0 : -1; });
		$("pt-topics-row").hidden = prefs.mode !== "topic";
		root.querySelectorAll("#pt-topics button").forEach(function (b) { b.setAttribute("aria-pressed", String(prefs.topics.indexOf(b.getAttribute("data-t")) >= 0)); });
		root.querySelectorAll("#pt-diff button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-d") === prefs.diff)); });
		$("pt-o-timer").checked = prefs.timer !== false;
		$("pt-o-fb").checked = prefs.mode === "topic" ? prefs.fb !== false : !!prefs.fbTest;
		$("pt-go").textContent = prefs.mode === "topic" ? "Start practising" : "Start the test";
		var run = S.runs[PK];
		$("pt-resume").hidden = !(run && !run.done);
		if (run && !run.done) $("pt-resume-txt").textContent = MODE_NAME[run.cfg.mode] + ", question " + (run.cur + 1) + " of " + run.n + ", " + T.fmtTime(run.ms) + " so far.";
		var hl = S.hist.filter(function (h) { return h.p === PK; }).reverse().slice(0, 8);
		$("pt-hist").hidden = !hl.length;
		if (hl.length) $("pt-hist-list").innerHTML = '<ul class="pt-hlist">' + hl.map(function (h) { return histRow(h, false); }).join("") + "</ul>";
	}
	root.querySelector(".pt-modes").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; prefs.mode = b.getAttribute("data-mode"); save(); paintStart(); });
	root.querySelector(".pt-modes").addEventListener("keydown", function (e) {
		if (!/^Arrow/.test(e.key)) return; e.preventDefault();
		var ms = ["full", "quick", "topic"], i = ms.indexOf(prefs.mode); i = (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 2)) % 3; prefs.mode = ms[i]; save(); paintStart(); root.querySelector('.pt-modes [data-mode="' + ms[i] + '"]').focus();
	});
	$("pt-topics").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var t = b.getAttribute("data-t"), i = prefs.topics.indexOf(t); if (i >= 0) prefs.topics.splice(i, 1); else prefs.topics.push(t); save(); paintStart(); });
	$("pt-diff").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; prefs.diff = b.getAttribute("data-d"); save(); paintStart(); });
	$("pt-o-timer").addEventListener("change", function () { prefs.timer = this.checked; save(); });
	$("pt-o-fb").addEventListener("change", function () { if (prefs.mode === "topic") prefs.fb = this.checked; else prefs.fbTest = this.checked; save(); });
	function cfgNow(seed) {
		var code = parseInt($("pt-code").value, 10);
		return { grade: GRADE, subject: SUBJ, mode: prefs.mode, diff: prefs.diff, topics: prefs.mode === "topic" ? prefs.topics.slice() : [], seed: seed || (code > 0 ? code : T.newSeed()) };
	}
	$("pt-go").addEventListener("click", function () {
		if (prefs.mode === "topic" && !prefs.topics.length) { toast("Pick at least one topic."); $("pt-topics").querySelector("button").focus(); return; }
		startRun(cfgNow());
	});
	$("pt-resume-go").addEventListener("click", function () { resume(S.runs[PK]); });
	$("pt-resume-drop").addEventListener("click", function () { delete S.runs[PK]; save(); paintStart(); });
	$("pt-printblank").addEventListener("click", function () {
		if (prefs.mode === "topic" && !prefs.topics.length) { toast("Pick at least one topic."); return; }
		var cfg = cfgNow(), items = T.buildTest(cfg);
		printDoc(worksheetHtml(cfg, items));
	});

	// ---------- running a test ----------
	var run = null, items = [], timer = null, lastTick = 0;
	function feedbackOn() { return run && run.fb; }
	function startRun(cfg) {
		items = T.buildTest(cfg);
		run = { cfg: cfg, n: items.length, answers: [], flags: [], checked: [], cur: 0, ms: 0, done: false, started: Date.now(), timer: prefs.timer !== false, fb: prefs.mode === "topic" ? prefs.fb !== false : !!prefs.fbTest };
		S.runs[PK] = run; save();
		history.replaceState(null, "", location.pathname);
		showRun();
	}
	function resume(r) { run = r; items = T.buildTest(r.cfg); run.n = items.length; showRun(); }
	function showScreen(id) { ["pt-start", "pt-run", "pt-res"].forEach(function (s) { $(s).hidden = s !== id; }); }
	function showRun() {
		showScreen("pt-run");
		$("pt-clock").hidden = !run.timer;
		root.classList.toggle("pt-lit", LIT);
		buildMap(); render(); startClock();
		$("pt-qn").focus({ preventScroll: true });
		$("pt-run").scrollIntoView({ block: "start", behavior: "smooth" });
	}
	function startClock() {
		clearInterval(timer); lastTick = Date.now();
		timer = setInterval(function () {
			var now = Date.now();
			if (!document.hidden && run && !run.done) { run.ms += Math.min(now - lastTick, 5000); paintClock(); if (Math.floor(run.ms / 1000) % 5 === 0) save(); }
			lastTick = now;
		}, 1000);
	}
	function paintClock() { $("pt-clock").textContent = "⏱ " + T.fmtTime(run.ms); }
	function answered(i) { return T.checkAnswer(items[i], run.answers[i]).done; }
	function buildMap() {
		$("pt-map").innerHTML = items.map(function (it, i) { return '<button type="button" data-i="' + i + '" aria-label="Question ' + (i + 1) + '">' + (i + 1) + "</button>"; }).join("");
	}
	function paintMap() {
		$("pt-map").querySelectorAll("button").forEach(function (b, i) {
			b.classList.toggle("is-done", answered(i)); b.classList.toggle("is-flag", !!run.flags[i]); b.classList.toggle("is-cur", i === run.cur);
			if (run.fb && run.checked[i]) { var sc = T.checkAnswer(items[i], run.answers[i]).score; b.classList.toggle("is-right", sc === 1); b.classList.toggle("is-wrong", sc < 1); }
			b.setAttribute("aria-label", "Question " + (i + 1) + (answered(i) ? ", answered" : ", not answered") + (run.flags[i] ? ", marked for review" : ""));
			if (i === run.cur) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
		});
		var left = items.length - items.filter(function (x, i) { return answered(i); }).length;
		$("pt-prog-txt").innerHTML = "Question <b>" + (run.cur + 1) + "</b> of " + items.length + ' <span class="pt-left">· ' + (left ? left + " left to answer" : "all answered") + "</span>";
		$("pt-prog-fill").style.width = Math.round((items.length - left) / items.length * 100) + "%";
	}
	$("pt-map").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; go(+b.getAttribute("data-i")); });
	$("pt-mapbtn").addEventListener("click", function () { var m = $("pt-map"); m.hidden = !m.hidden; this.setAttribute("aria-expanded", String(!m.hidden)); });

	function metaHtml(it) {
		return '<span class="pt-badge pt-d-' + it.diff + '">' + (it.diff === "easy" ? "● Easy" : it.diff === "medium" ? "●● Medium" : "●●● Hard") + "</span>" +
			'<span class="pt-badge pt-fit">Fits ' + T.fitLabel(it.fit) + "</span>" + '<span class="pt-badge pt-topic">' + esc(it.title) + "</span>";
	}
	var curPassage = null;
	function render() {
		var i = run.cur, it = items[i], a = run.answers[i], locked = run.fb && run.checked[i];
		$("pt-meta").innerHTML = metaHtml(it);
		$("pt-qn").textContent = "Question " + (i + 1);
		$("pt-q").innerHTML = '<div class="pt-qtext">' + it.q + "</div>" + (it.svg ? '<div class="pt-fig">' + it.svg + "</div>" : "") + (it.html ? '<div class="pt-fig">' + it.html + "</div>" : "");
		// passage
		if (it.passage) {
			var p = T.passageById(it.passage);
			$("pt-passage").hidden = false;
			if (curPassage !== p.id) { curPassage = p.id; $("pt-ptitle").innerHTML = "<span>" + esc(T.GENRES[p.genre]) + "</span> " + esc(p.title); $("pt-ptext").innerHTML = p.html; $("pt-ptext").scrollTop = 0; }
		} else $("pt-passage").hidden = true;
		$("pt-layout").classList.toggle("has-passage", !!it.passage);
		// answer area
		var h = "";
		if (it.type === "mc" || it.type === "multi") {
			var multi = it.type === "multi";
			h = '<fieldset class="pt-choices' + (it.choices.some(function (c) { return /<svg/.test(c); }) ? " pt-choices--pics" : "") + '"><legend class="pt-sr">Answer choices</legend>' + (multi ? '<p class="pt-hint">Choose ' + (it.need === 2 ? "two" : it.need) + " answers.</p>" : "") +
				it.choices.map(function (c, k) {
					var on = multi ? (a || []).indexOf(k) >= 0 : a === k;
					return '<label class="pt-choice' + (on ? " is-on" : "") + '"><input type="' + (multi ? "checkbox" : "radio") + '" name="pt-a" value="' + k + '"' + (on ? " checked" : "") + (locked ? " disabled" : "") + '><span class="pt-letter">' + "ABCDEFG"[k] + '</span><span class="pt-ctext">' + c + "</span></label>";
				}).join("") + "</fieldset>";
		} else if (it.type === "num") {
			h = '<div class="pt-numrow"><label for="pt-num" class="pt-sr">Your answer</label>' + (it.prefix ? '<span class="pt-fix">' + it.prefix + "</span>" : "") +
				'<input id="pt-num" class="tu-input tu-input--big pt-num" type="text" inputmode="' + (it.neg ? "text" : "decimal") + '" autocomplete="off" spellcheck="false" placeholder="Your answer" value="' + esc(a || "") + '"' + (locked ? " disabled" : "") + ">" +
				(it.unit ? '<span class="pt-fix">' + esc(it.unit) + "</span>" : "") + "</div>" + (it.neg ? '<p class="pt-hint">Type a minus sign for a negative number, e.g. −7.</p>' : "");
		} else if (it.type === "order") {
			var ord = Array.isArray(a) ? a : it.start;
			h = '<p class="pt-hint">Use the arrows to put the events in order, first at the top.</p><ol class="pt-order">' + ord.map(function (k, pos) {
				return '<li data-k="' + k + '"><span class="pt-otext">' + esc(it.items[k]) + '</span><span class="pt-obtn"><button type="button" data-mv="-1" aria-label="Move up: ' + esc(it.items[k]) + '"' + (pos === 0 || locked ? " disabled" : "") + '>↑</button><button type="button" data-mv="1" aria-label="Move down: ' + esc(it.items[k]) + '"' + (pos === ord.length - 1 || locked ? " disabled" : "") + ">↓</button></span></li>";
			}).join("") + "</ol>";
		} else if (it.type === "written") {
			var txt = (a && a.text) || "";
			h = '<label for="pt-wr" class="pt-hint">Write your answer in full sentences. You will compare it with a model answer at the end.</label><textarea id="pt-wr" class="tu-input pt-wr" rows="5"' + (locked ? " disabled" : "") + ">" + esc(txt) + '</textarea><div class="pt-small" id="pt-wc"></div>';
		}
		$("pt-ans").innerHTML = h;
		if (it.type === "written") wc();
		// buttons
		$("pt-prev").disabled = i === 0;
		$("pt-flag").setAttribute("aria-pressed", String(!!run.flags[i]));
		$("pt-flag").textContent = run.flags[i] ? "⚑ Marked" : "⚑ Mark for review";
		$("pt-check").hidden = !run.fb || locked;
		$("pt-next").textContent = i === items.length - 1 ? "Finish →" : "Next →";
		$("pt-fb").innerHTML = locked ? fbHtml(it, a) : "";
		paintMap(); if (run.timer) paintClock();
	}
	function fbHtml(it, a) {
		var r = T.checkAnswer(it, a), good = r.score === 1;
		if (it.type === "written") return '<div class="pt-fbbox pt-fb-info"><b>Compare with a model answer:</b><p>' + esc(it.model) + "</p><p class=\"pt-small\">" + esc(it.rubric) + "</p></div>";
		return '<div class="pt-fbbox ' + (good ? "pt-fb-ok" : "pt-fb-no") + '"><b>' + (good ? "✓ Correct!" : r.score ? "Partly right." : "✗ Not quite.") + "</b>" + (good ? "" : " The answer is: <b>" + T.answerText(it) + "</b>") + "<p>" + it.explain + "</p></div>";
	}
	function wc() { var t = ($("pt-wr").value || "").trim(), n = t ? t.split(/\s+/).length : 0; $("pt-wc").textContent = n + " word" + (n === 1 ? "" : "s"); }
	function setAns(v) { run.answers[run.cur] = v; save(); paintMap(); }
	$("pt-ans").addEventListener("change", function (e) {
		var it = items[run.cur], t = e.target;
		if (t.name !== "pt-a") return;
		if (it.type === "mc") setAns(+t.value);
		else { var sel = []; $("pt-ans").querySelectorAll("input:checked").forEach(function (x) { sel.push(+x.value); }); setAns(sel.sort()); }
		$("pt-ans").querySelectorAll(".pt-choice").forEach(function (l) { l.classList.toggle("is-on", l.querySelector("input").checked); });
	});
	$("pt-ans").addEventListener("input", function (e) {
		if (e.target.id === "pt-num") setAns(e.target.value);
		if (e.target.id === "pt-wr") { var old = run.answers[run.cur] || {}; setAns({ text: e.target.value, mark: old.mark }); wc(); }
	});
	$("pt-ans").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-mv]"); if (!b) return;
		var it = items[run.cur], ord = (Array.isArray(run.answers[run.cur]) ? run.answers[run.cur] : it.start).slice(), k = +b.closest("li").getAttribute("data-k"), p = ord.indexOf(k), q = p + +b.getAttribute("data-mv");
		if (q < 0 || q >= ord.length) return;
		ord.splice(p, 1); ord.splice(q, 0, k); setAns(ord); render();
		var nb = $("pt-ans").querySelector('li[data-k="' + k + '"] button[data-mv="' + b.getAttribute("data-mv") + '"]') || $("pt-ans").querySelector('li[data-k="' + k + '"] button:not([disabled])');
		if (nb) nb.focus();
		toast("Moved to position " + (q + 1));
	});
	$("pt-ans").addEventListener("keydown", function (e) {
		if (e.key === "Enter" && e.target.id === "pt-num") { e.preventDefault(); if (run.fb && !run.checked[run.cur]) doCheck(); else next(); }
	});
	function go(i) {
		if (i < 0 || i >= items.length) return;
		run.cur = i; save(); render();
		$("pt-qn").focus({ preventScroll: true });
		var top = $("pt-run").getBoundingClientRect().top;
		if (top < 0 || top > innerHeight * 0.5) $("pt-run").scrollIntoView({ block: "start" });
	}
	function next() { if (run.cur < items.length - 1) go(run.cur + 1); else finishAsk(); }
	function doCheck() {
		if (!answered(run.cur)) { toast("Answer the question first."); return; }
		run.checked[run.cur] = true; save(); render();
		$("pt-next").focus();
	}
	$("pt-prev").addEventListener("click", function () { go(run.cur - 1); });
	$("pt-next").addEventListener("click", next);
	$("pt-check").addEventListener("click", doCheck);
	$("pt-flag").addEventListener("click", function () { run.flags[run.cur] = !run.flags[run.cur]; save(); render(); });
	$("pt-finish").addEventListener("click", finishAsk);
	function finishAsk() {
		var left = items.filter(function (x, i) { return !answered(i); }).length, fl = run.flags.filter(Boolean).length;
		if ((left || fl) && !confirm((left ? left + " question" + (left > 1 ? "s are" : " is") + " not answered. " : "") + (fl ? fl + " marked for review. " : "") + "Finish the test anyway?")) {
			var first = items.findIndex(function (x, i) { return !answered(i) || run.flags[i]; }); if (first >= 0) go(first); return;
		}
		finish();
	}
	document.addEventListener("keydown", function (e) {
		if ($("pt-run").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
		var tag = (e.target.tagName || "").toLowerCase();
		if (tag === "input" && e.target.type === "text" || tag === "textarea") return;
		var it = items[run.cur];
		if (/^[1-7]$/.test(e.key) && it && (it.type === "mc" || it.type === "multi")) {
			var inp = $("pt-ans").querySelectorAll("input")[+e.key - 1]; if (inp && !inp.disabled) { inp.click(); inp.focus(); e.preventDefault(); }
		} else if (/^[a-g]$/i.test(e.key) && it && (it.type === "mc" || it.type === "multi") && tag !== "button") {
			var inp2 = $("pt-ans").querySelectorAll("input")["abcdefg".indexOf(e.key.toLowerCase())]; if (inp2 && !inp2.disabled) { inp2.click(); inp2.focus(); e.preventDefault(); }
		}
	});

	// ---------- results ----------
	function finish() {
		run.done = true; run.finished = Date.now(); clearInterval(timer);
		var sc = T.score(items, run.answers);
		S.hist.push({ p: PK, d: Date.now(), mode: run.cfg.mode, diff: run.cfg.diff, got: sc.got, max: sc.max, ms: run.ms, code: run.cfg.seed });
		if (S.hist.length > 60) S.hist = S.hist.slice(-60);
		run.histIdx = S.hist.length - 1;
		save(); showResults();
	}
	var revFilter = "all";
	function showResults() {
		showScreen("pt-res"); paintResults();
		$("pt-res").scrollIntoView({ block: "start", behavior: "smooth" });
		var h = $("pt-score").querySelector("h2"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
	}
	function paintResults() {
		var sc = T.score(items, run.answers), lv = T.level(sc.pct);
		if (run.histIdx >= 0 && S.hist[run.histIdx]) { S.hist[run.histIdx].got = sc.got; save(); }
		$("pt-score").innerHTML = '<div class="pt-ring" style="--p:' + sc.pct + '"><span>' + sc.pct + "%</span></div><div>" +
			"<h2 class=\"pt-h2\">" + fmtNum(sc.got) + " out of " + sc.max + " · " + esc(lv[0]) + "</h2><p>" + esc(lv[1]) + "</p>" +
			'<p class="pt-small">' + PAGES[PK][1] + " · " + MODE_NAME[run.cfg.mode] + (run.cfg.diff !== "mixed" ? " · " + run.cfg.diff : "") + " · time " + T.fmtTime(run.ms) + " · test code <b>" + run.cfg.seed + "</b></p>" +
			(items.some(function (it) { return it.type === "written"; }) ? '<p class="pt-small">Written answers are marked by you: check the suggested mark for each one below.</p>' : "") + "</div>";
		$("pt-bytopic").innerHTML = sc.topics.map(function (t) {
			var p = Math.round(t.got / t.max * 100);
			return '<div class="pt-trow"><span class="pt-tname">' + esc(t.title) + '</span><span class="pt-tbar" aria-hidden="true"><i style="width:' + p + '%" class="' + (p >= 80 ? "is-good" : p >= 50 ? "is-mid" : "is-low") + '"></i></span><span class="pt-tnum">' + fmtNum(t.got) + "/" + t.max + '</span><button type="button" class="pt-link" data-prac="' + t.topic + '">Practise</button></div>';
		}).join("");
		paintReview();
	}
	function yourAnswer(it, a) {
		if (a === undefined || a === null || a === "" || (it.type === "written" && !(a.text || "").trim())) return "<i>No answer</i>";
		if (it.type === "mc") return it.choices[a];
		if (it.type === "multi") return a.map(function (k) { return it.choices[k]; }).join("; ");
		if (it.type === "order") return a.map(function (k, n) { return (n + 1) + ". " + esc(it.items[k]); }).join("<br>");
		if (it.type === "written") return esc(a.text).replace(/\n/g, "<br>");
		return esc((it.prefix && String(a).indexOf("$") < 0 ? it.prefix : "") + a + (it.unit && !/[a-z%°²]/i.test(a) ? " " + it.unit : ""));
	}
	function reviewItem(it, i, forPrint) {
		var a = run.answers[i], r = T.checkAnswer(it, a), cls = r.score === 1 ? "is-right" : r.score > 0 ? "is-part" : "is-wrong";
		var p = it.passage && (i === 0 || items[i - 1].passage !== it.passage) ? T.passageById(it.passage) : null;
		var h = (p && forPrint ? '<div class="pt-rpass"><h3>' + esc(p.title) + "</h3>" + p.html + "</div>" : "") + '<article class="pt-rev ' + cls + '"><header><b>' + (i + 1) + ".</b> " + (r.score === 1 ? "✓" : r.score > 0 ? "½" : "✗") + " " + metaHtml(it) + (it.passage && !forPrint ? '<span class="pt-badge">' + esc(T.passageById(it.passage).title) + "</span>" : "") + "</header>" +
			'<div class="pt-qtext">' + it.q + "</div>" + (it.svg ? '<div class="pt-fig">' + it.svg + "</div>" : "") + (it.html ? '<div class="pt-fig">' + it.html + "</div>" : "") +
			'<dl><dt>Your answer</dt><dd>' + yourAnswer(it, a) + "</dd><dt>" + (it.type === "written" ? "Model answer" : "Correct answer") + "</dt><dd>" + T.answerText(it) + "</dd>" +
			(it.type === "written" ? "<dt>How to mark it</dt><dd>" + esc(it.rubric) + "</dd>" : "<dt>Why</dt><dd>" + it.explain + "</dd>") + "</dl>";
		if (it.type === "written" && r.done && !forPrint) {
			var m = typeof a.mark === "number" ? a.mark : r.suggested;
			h += '<div class="pt-mark"><span>Your mark' + (typeof a.mark === "number" ? "" : " (suggested from key ideas found)") + ':</span><div class="tu-seg pt-seg" role="group" aria-label="Mark for question ' + (i + 1) + '">' +
				[[0, "Not yet"], [0.5, "Part"], [1, "Full"]].map(function (x) { return '<button type="button" data-mark="' + x[0] + '" data-i="' + i + '" aria-pressed="' + (m === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
		}
		return h + "</article>";
	}
	function paintReview() {
		root.querySelectorAll("#pt-revf button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === revFilter)); });
		var h = items.map(function (it, i) { if (revFilter === "wrong" && T.checkAnswer(it, run.answers[i]).score === 1) return ""; return reviewItem(it, i, false); }).join("");
		$("pt-review").innerHTML = h || "<p>Everything is right. Well done!</p>";
	}
	$("pt-revf").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; revFilter = b.getAttribute("data-f"); paintReview(); });
	$("pt-review").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-mark]"); if (!b) return;
		var i = +b.getAttribute("data-i"), a = run.answers[i] || {}; run.answers[i] = { text: a.text, mark: +b.getAttribute("data-mark") }; save();
		var y = scrollY; paintResults(); scrollTo(0, y);
	});
	$("pt-bytopic").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-prac]"); if (!b) return;
		prefs.mode = "topic"; prefs.topics = [b.getAttribute("data-prac")]; prefs.diff = "mixed"; save(); $("pt-code").value = ""; startRun(cfgNow());
	});
	$("pt-again").addEventListener("click", function () { $("pt-code").value = ""; delete S.runs[PK]; save(); showScreen("pt-start"); paintStart(); $("pt-start").scrollIntoView({ block: "start" }); });
	$("pt-retake").addEventListener("click", function () { var c = JSON.parse(JSON.stringify(run.cfg)); prefs.mode = c.mode; startRun(c); });
	$("pt-copy").addEventListener("click", function () {
		var sc = T.score(items, run.answers), txt = "MES Practice Test: " + PAGES[PK][1] + ", " + MODE_NAME[run.cfg.mode] + "\nScore: " + fmtNum(sc.got) + " / " + sc.max + " (" + sc.pct + "%) in " + T.fmtTime(run.ms) + "\n" +
			sc.topics.map(function (t) { return "  " + t.title + ": " + fmtNum(t.got) + "/" + t.max; }).join("\n") + "\nTest code " + run.cfg.seed + ": " + location.origin + location.pathname + "?mode=" + run.cfg.mode + "&code=" + run.cfg.seed;
		(navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Copied."); }, function () { prompt("Copy your results:", txt); });
	});
	$("pt-print").addEventListener("click", function () {
		var sc = T.score(items, run.answers);
		printDoc('<h1>' + PAGES[PK][1] + " practice test: results</h1><p>" + MODE_NAME[run.cfg.mode] + " · score <b>" + fmtNum(sc.got) + " / " + sc.max + " (" + sc.pct + "%)</b> · time " + T.fmtTime(run.ms) + " · test code " + run.cfg.seed + " · " + new Date().toLocaleDateString() + "</p>" +
			'<table class="pt-tbl"><thead><tr><th>Topic</th><th>Score</th></tr></thead><tbody>' + sc.topics.map(function (t) { return "<tr><td>" + esc(t.title) + "</td><td>" + fmtNum(t.got) + " / " + t.max + "</td></tr>"; }).join("") + "</tbody></table>" +
			items.map(function (it, i) { return reviewItem(it, i, true); }).join(""));
	});

	// ---------- printing ----------
	function worksheetHtml(cfg, its) {
		var h = "<h1>" + PAGES[PK][1] + " practice test</h1><p>" + MODE_NAME[cfg.mode] + (cfg.diff !== "mixed" ? " · " + cfg.diff : "") + " · " + its.length + " questions · test code " + cfg.seed + "</p><p class=\"pt-pname\">Name: ______________________ &nbsp; Date: ____________</p>", last = null;
		its.forEach(function (it, i) {
			if (it.passage && it.passage !== last) { var p = T.passageById(it.passage); h += '<div class="pt-rpass"><h3>' + esc(p.title) + "</h3>" + p.html + "</div>"; last = it.passage; }
			h += '<article class="pt-wq"><b>' + (i + 1) + ".</b> <span class=\"pt-wmeta\">(" + it.diff + ", " + esc(it.title) + ")</span><div class=\"pt-qtext\">" + it.q + "</div>" + (it.svg ? '<div class="pt-fig">' + it.svg + "</div>" : "") + (it.html ? '<div class="pt-fig">' + it.html + "</div>" : "");
			if (it.type === "mc" || it.type === "multi") h += '<ol class="pt-wch" type="A">' + it.choices.map(function (c) { return "<li>" + c + "</li>"; }).join("") + "</ol>";
			else if (it.type === "order") h += '<ul class="pt-wch">' + it.start.map(function (k) { return "<li>____ " + esc(it.items[k]) + "</li>"; }).join("") + "</ul>";
			else if (it.type === "written") h += '<div class="pt-lines"></div>';
			else h += '<p class="pt-wline">Answer: ' + (it.prefix || "") + " ________________ " + (it.unit ? esc(it.unit) : "") + "</p>";
			h += "</article>";
		});
		h += '<section class="pt-key"><h2>Answer key</h2><ol>' + its.map(function (it) { return "<li><b>" + (it.type === "mc" ? "ABCDEFG"[it.answer] + ". " : it.type === "multi" ? it.answer.map(function (k) { return "ABCDEFG"[k]; }).join(" and ") + ". " : "") + "</b>" + T.answerText(it) + '<div class="pt-small">' + (it.type === "written" ? esc(it.rubric) : it.explain) + "</div></li>"; }).join("") + "</ol></section>";
		return h;
	}
	function printDoc(html) {
		var d = $("pt-print-doc");
		if (!d) { d = document.createElement("div"); d.id = "pt-print-doc"; d.className = "pt-printdoc"; document.body.appendChild(d); }
		d.innerHTML = html;
		document.body.classList.add("pt-printing");
		var done = function () { document.body.classList.remove("pt-printing"); window.removeEventListener("afterprint", done); };
		window.addEventListener("afterprint", done);
		setTimeout(function () { window.print(); setTimeout(done, 1500); }, 60);
	}

	// ---------- go ----------
	paintStart();
	var r0 = S.runs[PK];
	if (r0 && r0.done) { run = r0; items = T.buildTest(r0.cfg); if (location.hash === "#results") showResults(); }
	if (params.get("start") === "1" && !(r0 && !r0.done)) startRun(cfgNow());
})();
