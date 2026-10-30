/* MES Kids page script (tool_apps_src/kids/app.js). One script for the hub (/kids) and the five activity pages; data-mode on #kd picks the page.
   Data + pure logic: lib.js (window.MESKids). Settings: localStorage "mes-kids:v1" (shared by all the pages), stars: "mes-kids:stars". */
(function () {
	"use strict";
	var K = window.MESKids, root = document.getElementById("kd");
	if (!K || !root) return;
	var mode = root.getAttribute("data-mode");
	function $(id) { return document.getElementById(id); }
	var toastT;
	function toast(msg) { var t = $("kd-toast"); if (!t) return; t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	if (mode === "hub") return;
	var MODE = K.MODES[mode] || K.MODES.cards;

	// ---------- settings ----------
	var KEY = "mes-kids:v1", S;
	try { S = K.clean(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = K.clean({}); }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var stars = 0; try { stars = Math.max(0, parseInt(localStorage.getItem("mes-kids:stars") || "0", 10) || 0); } catch (e) {}
	function saveStars() { try { localStorage.setItem("mes-kids:stars", String(stars)); } catch (e) {} }
	function cats() { var c = S.cats[mode]; return c && c.length ? c : MODE.def.slice(); }
	root.setAttribute("data-theme", S.theme);

	// ---------- pictures ----------
	var SHAPE_COL = { circle: "#e53935", square: "#1e88e5", triangle: "#fdd835", rectangle: "#43a047", oval: "#8e24aa", star: "#fbc02d", heart: "#e91e63", diamond: "#00acc1", pentagon: "#fb8c00", hexagon: "#5e35b1", crescent: "#ffca28", arrow: "#26a69a" };
	function poly(n, r, rot) { var p = []; for (var i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; p.push((50 + r * Math.cos(a)).toFixed(1) + "," + (50 + r * Math.sin(a)).toFixed(1)); } return p.join(" "); }
	function starPts() { var p = []; for (var i = 0; i < 10; i++) { var r = i % 2 ? 19 : 46, a = -Math.PI / 2 + i * Math.PI / 5; p.push((50 + r * Math.cos(a)).toFixed(1) + "," + (52 + r * Math.sin(a)).toFixed(1)); } return p.join(" "); }
	function shapeSvg(name) {
		var c = SHAPE_COL[name] || "#e53935", st = ' fill="' + c + '" stroke="rgba(0,0,0,.22)" stroke-width="2.5" stroke-linejoin="round"', b;
		switch (name) {
			case "circle": b = '<circle cx="50" cy="50" r="44"' + st + '/>'; break;
			case "square": b = '<rect x="9" y="9" width="82" height="82" rx="3"' + st + '/>'; break;
			case "triangle": b = '<polygon points="50,8 94,88 6,88"' + st + '/>'; break;
			case "rectangle": b = '<rect x="2" y="24" width="96" height="52" rx="3"' + st + '/>'; break;
			case "oval": b = '<ellipse cx="50" cy="50" rx="47" ry="31"' + st + '/>'; break;
			case "star": b = '<polygon points="' + starPts() + '"' + st + '/>'; break;
			case "heart": b = '<path d="M50 88 C20 66 4 50 4 31 C4 16 16 6 29 6 C39 6 46 12 50 20 C54 12 61 6 71 6 C84 6 96 16 96 31 C96 50 80 66 50 88 Z"' + st + '/>'; break;
			case "diamond": b = '<polygon points="50,4 88,50 50,96 12,50"' + st + '/>'; break;
			case "pentagon": b = '<polygon points="' + poly(5, 46, -Math.PI / 2) + '"' + st + '/>'; break;
			case "hexagon": b = '<polygon points="' + poly(6, 46, 0) + '"' + st + '/>'; break;
			case "crescent": b = '<path d="M64 6 A44 44 0 1 0 64 94 A34 34 0 1 1 64 6 Z"' + st + '/>'; break;
			case "arrow": b = '<polygon points="4,38 56,38 56,16 96,50 56,84 56,62 4,62"' + st + '/>'; break;
			case "xylophone":
				b = '<rect x="6" y="66" width="88" height="8" rx="3" fill="#8d6e63"/><rect x="6" y="28" width="88" height="8" rx="3" fill="#8d6e63"/>';
				["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa"].forEach(function (col, i) { var h = 70 - i * 7; b += '<rect x="' + (10 + i * 14) + '" y="' + (50 - h / 2) + '" width="11" height="' + h + '" rx="3" fill="' + col + '" stroke="rgba(0,0,0,.2)"/>'; });
				b += '<line x1="70" y1="92" x2="92" y2="70" stroke="#6d4c41" stroke-width="4" stroke-linecap="round"/><circle cx="92" cy="68" r="6" fill="#e53935"/>';
				break;
			default: b = "";
		}
		return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + b + "</svg>";
	}
	function blobSvg(hex) {
		var ring = hex.toLowerCase() === "#ffffff" ? ' stroke="#9aa0b4" stroke-width="2"' : hex === "#111111" ? ' stroke="#777" stroke-width="2"' : ' stroke="rgba(0,0,0,.15)" stroke-width="2"';
		var d = "M50 6 C64 4 72 14 82 18 C94 24 96 38 92 50 C98 62 92 76 80 82 C70 92 58 96 46 92 C32 96 18 90 12 78 C4 66 6 52 10 42 C6 28 16 14 28 12 C36 6 42 8 50 6 Z";
		return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="' + d + '" fill="' + hex + '"' + ring + '/><ellipse cx="34" cy="30" rx="10" ry="6" fill="rgba(255,255,255,.35)"/></svg>';
	}
	function countHtml(it) {
		var s = ""; for (var i = 0; i < it.n; i++) s += "<span>" + it.cp + "</span>";
		return '<span class="kd-count' + (it.n <= 5 ? " kd-count--big" : "") + '" style="grid-template-columns:repeat(' + Math.min(5, it.n) + ',1fr)">' + s + "</span>";
	}
	function picHtml(it) {
		var p = it.pic;
		if (p.indexOf("svg:") === 0) return shapeSvg(p.slice(4));
		if (p.indexOf("col:") === 0) return blobSvg(p.slice(4));
		if (p.indexOf("num:") === 0) return countHtml(it);
		return esc(p);
	}
	function choiceHtml(it) {
		if (it.cat === "letters") return '<span style="font-family:var(--kd-font);font-weight:900">' + esc(K.label(it, S.lcase === "both" ? "upper" : S.lcase === "lower" ? "lower" : "upper")) + "</span>";
		if (it.cat === "numbers") return it.n <= 5 ? countHtml(it) : '<span style="font-family:var(--kd-font);font-weight:900">' + it.n + "</span>";
		return picHtml(it);
	}

	// ---------- speech + sounds ----------
	var synth = window.speechSynthesis || null, voices = [], token = 0, audio = null, unlocked = false;
	function loadVoices() { if (!synth) return; try { voices = synth.getVoices() || []; } catch (e) { voices = []; } fillVoices(); }
	function vKey(v) { return (v.voiceURI || v.name) + "|" + v.lang; }
	function voice() {
		var v = null, i;
		if (S.voice) for (i = 0; i < voices.length; i++) if (vKey(voices[i]) === S.voice) { v = voices[i]; break; }
		return v || K.pickVoice(voices, navigator.language || "en-US");
	}
	function stopAll() { token++; try { if (synth) synth.cancel(); } catch (e) {} if (audio) { try { audio.pause(); } catch (e) {} audio = null; } }
	// say(text) -> promise that resolves when speech ends (or right away without speech)
	function say(text, tk) {
		return new Promise(function (res) {
			if (!synth || !text) return res();
			var u = new SpeechSynthesisUtterance(text), v = voice(), done = false;
			if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
			u.rate = S.rate; u.pitch = S.pitch;
			function fin() { if (done) return; done = true; res(); }
			u.onend = fin; u.onerror = fin;
			setTimeout(fin, 1500 + text.length * 160 / S.rate);   // never wait forever (some voices never fire onend)
			try { synth.speak(u); } catch (e) { fin(); }
		});
	}
	function play(src) {
		return new Promise(function (res) {
			if (!src) return res();
			var a = new Audio(src); audio = a;
			var done = false; function fin() { if (done) return; done = true; res(); }
			a.onended = fin; a.onerror = fin;
			var p = a.play(); if (p && p.catch) p.catch(fin);
			setTimeout(fin, 8000);
		});
	}
	// The full "say this card" sequence; a newer call cancels an older one
	function sayCard(it, opts) {
		opts = opts || {};
		stopAll(); var tk = token;
		var isAnimal = it.cat === "animals", rec = isAnimal && S.snd ? K.soundFor(it) : "";
		var text = K.speakText(it, { count: S.count, soundWord: false });
		var p = opts.soundOnly ? Promise.resolve() : say(text, tk);
		if (isAnimal) {
			p = p.then(function () {
				if (tk !== token) return;
				if (rec) return play(rec);
				if (it.sw && (S.sw || opts.soundOnly)) return say(it.sw + "!", tk);
			}).then(function () {
				if (tk !== token || opts.soundOnly || !rec || !S.sw || !it.sw) return;
				return say("The " + it.word.toLowerCase() + " says " + it.sw.toLowerCase() + "!", tk);
			});
		}
		return p;
	}

	// ---------- deck ----------
	var pool = [], order = [], idx = 0, play_ = "learn", lastDir = 0;
	function rebuild(keepId) {
		pool = K.deck(mode, cats(), { maxNum: S.maxNum });
		order = K.orderFor(S, mode) === "order" ? pool.slice() : K.shuffle(pool);
		idx = keepId && order.indexOf(keepId) >= 0 ? order.indexOf(keepId) : 0;
	}
	function cur() { return K.BY_ID[order[idx]]; }

	var cardEl = $("kd-card"), picEl = $("kd-pic"), wordEl = $("kd-word"), subEl = $("kd-sub"), stage = $("kd-stage"), posEl = $("kd-pos");
	var bgN = 0;
	function paintBg() { bgN = (bgN + 1) % 8; stage.style.setProperty("--kd-cbg", "var(--kd-c" + bgN + ")"); }
	function render(speak) {
		var it = cur(); if (!it) return;
		paintBg();
		stage.classList.toggle("kd-qmode", play_ === "quiz");
		if (play_ === "quiz") return renderQuiz(speak);
		$("kd-qz").hidden = true; cardEl.hidden = false;
		picEl.innerHTML = picHtml(it);
		picEl.setAttribute("aria-label", "Say it again: " + it.word);
		wordEl.textContent = K.label(it, S.lcase);
		wordEl.classList.toggle("kd-hide", !S.showWord);
		subEl.textContent = S.showWord ? K.subLabel(it) : "";
		$("kd-snd").hidden = !(it.cat === "animals" && (it.snd || it.sw));
		posEl.textContent = (idx + 1) + " / " + order.length;
		cardEl.classList.remove("kd-in", "kd-l", "kd-r"); void cardEl.offsetWidth;
		cardEl.classList.add(lastDir < 0 ? "kd-l" : lastDir > 0 ? "kd-r" : "kd-in");
		if (speak && S.auto && unlocked) sayCard(it);
		armAdv();
	}
	function go(d) { if (!order.length) return; lastDir = d; idx = K.step(idx, d, order.length); if (d > 0 && idx === 0 && K.orderFor(S, mode) === "shuffle") { order = K.reshuffle(pool, order[order.length - 1]); } render(true); }
	function shuffleNow() { order = K.reshuffle(pool, order[idx]); idx = 0; lastDir = 0; render(true); toast("Shuffled!"); }

	// slideshow
	var advT;
	function armAdv() { clearTimeout(advT); if (S.adv && play_ === "learn" && $("kd-set").hidden) advT = setTimeout(function () { go(1); }, S.adv * 1000); }

	// ---------- quiz ----------
	var quiz = null;
	function renderQuiz(speak) {
		var it = cur();
		cardEl.hidden = true; $("kd-qz").hidden = false; $("kd-snd").hidden = true;
		var ids = K.quizChoices(it.id, pool, S.quizN);
		quiz = { ans: it.id, solved: false };
		var box = $("kd-choices"); box.innerHTML = ""; box.style.setProperty("--kd-n", ids.length); box.setAttribute("data-n", ids.length);
		ids.forEach(function (id) {
			var c = K.BY_ID[id], b = document.createElement("button");
			b.type = "button"; b.className = "kd-choice"; b.setAttribute("data-id", id); b.setAttribute("aria-label", c.cat === "letters" ? "Letter " + c.letter.toUpperCase() : c.word);
			b.innerHTML = choiceHtml(c);
			b.addEventListener("click", function () { pick(b, c); });
			box.appendChild(b);
		});
		$("kd-qq").textContent = "🔊 " + K.findPrompt(it);
		posEl.textContent = "";
		if (speak && unlocked) askAgain();
	}
	function askAgain() { var it = cur(); stopAll(); var tk = token; say(K.findPrompt(it), tk).then(function () { if (tk === token && it.cat === "animals" && it.snd && S.snd) play(K.soundFor(it)); }); }
	function pick(btn, it) {
		if (!quiz || quiz.solved) return;
		unlocked = true;
		if (it.id === quiz.ans) {
			quiz.solved = true; btn.classList.add("kd-yes");
			stars++; saveStars(); $("kd-stars").textContent = stars; burst();
			stopAll(); var tk = token;
			say(K.praise(it), tk).then(function () { return new Promise(function (r) { setTimeout(r, 500); }); }).then(function () { if (tk === token && play_ === "quiz") go(1); });
		} else {
			btn.classList.remove("kd-no"); void btn.offsetWidth; btn.classList.add("kd-no");
			stopAll(); say(K.gentle(it), token);
		}
	}
	function burst() {
		var b = $("kd-burst"), s = ["⭐", "🌟", "✨", "🎉", "💛", "🎈"];
		b.innerHTML = "";
		for (var i = 0; i < 14; i++) {
			var e = document.createElement("span"), a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 180;
			e.textContent = s[i % s.length]; e.style.setProperty("--x", Math.round(Math.cos(a) * r) + "px"); e.style.setProperty("--y", Math.round(Math.sin(a) * r) + "px"); e.style.setProperty("--r", Math.round(Math.random() * 360 - 180) + "deg");
			b.appendChild(e);
		}
		setTimeout(function () { b.innerHTML = ""; }, 1300);
	}
	function setPlay(p, user) {
		play_ = p; stopAll(); clearTimeout(advT);
		$("kd-m-learn").setAttribute("aria-selected", p === "learn"); $("kd-m-quiz").setAttribute("aria-selected", p === "quiz");
		$("kd-score").hidden = p !== "quiz"; $("kd-stars").textContent = stars;
		$("kd-say").innerHTML = p === "quiz" ? '<span aria-hidden="true">🔊</span> Ask again' : '<span aria-hidden="true">🔊</span> Say it again';
		$("kd-shuf").hidden = p === "quiz";
		if (user) unlock(); render(true);
	}

	// ---------- start: browsers only speak after the first tap ----------
	var startBtn = document.createElement("button");
	startBtn.type = "button"; startBtn.className = "kd-big kd-big--go kd-start"; startBtn.innerHTML = '<span aria-hidden="true">▶</span> Tap to start';
	startBtn.style.cssText = "position:absolute;left:50%;bottom:2.2em;transform:translateX(-50%);z-index:4;font-size:1.4em;box-shadow:var(--kd-shadow)";
	stage.appendChild(startBtn);
	function unlock() { if (unlocked) return; unlocked = true; startBtn.remove(); }
	startBtn.addEventListener("click", function (e) { e.stopPropagation(); unlock(); if (play_ === "quiz") askAgain(); else sayCard(cur()); stage.focus({ preventScroll: true }); });

	// ---------- buttons, swipe, keys ----------
	var swiped = false;
	picEl.addEventListener("click", function () { if (swiped) return; unlock(); picEl.classList.remove("kd-wig"); void picEl.offsetWidth; picEl.classList.add("kd-wig"); sayCard(cur()); armAdv(); });
	wordEl.addEventListener("click", function () { unlock(); sayCard(cur()); });
	$("kd-prev").addEventListener("click", function () { unlock(); go(-1); });
	$("kd-next").addEventListener("click", function () { unlock(); go(1); });
	$("kd-back").addEventListener("click", function () { unlock(); go(-1); });
	$("kd-fwd").addEventListener("click", function () { unlock(); go(1); });
	$("kd-shuf").addEventListener("click", function () { unlock(); shuffleNow(); });
	$("kd-say").addEventListener("click", function () { unlock(); if (play_ === "quiz") askAgain(); else sayCard(cur()); armAdv(); });
	$("kd-qq").addEventListener("click", function () { unlock(); askAgain(); });
	$("kd-snd").addEventListener("click", function () { unlock(); sayCard(cur(), { soundOnly: true }); armAdv(); });
	$("kd-m-learn").addEventListener("click", function () { setPlay("learn", true); });
	$("kd-m-quiz").addEventListener("click", function () { setPlay("quiz", true); });
	var sx = 0, sy = 0, sid = null;
	stage.addEventListener("pointerdown", function (e) { sid = e.pointerId; sx = e.clientX; sy = e.clientY; swiped = false; });
	stage.addEventListener("pointerup", function (e) {
		if (e.pointerId !== sid) return; sid = null;
		var dx = e.clientX - sx, dy = e.clientY - sy;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = true; unlock(); go(dx < 0 ? 1 : -1); setTimeout(function () { swiped = false; }, 50); }
	});
	stage.addEventListener("pointercancel", function () { sid = null; });
	stage.addEventListener("contextmenu", function (e) { if (kiosk) e.preventDefault(); });

	document.addEventListener("keydown", function (e) {
		if (!$("kd-set").hidden) { if (e.key === "Escape") { e.preventDefault(); closeSet(); } return; }
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
		var inStage = kiosk || $("kd-wrap").contains(t);
		if (!inStage) return;
		if (e.ctrlKey || e.metaKey || e.altKey) { if (kiosk) hint("Grown-ups: hold ✕ for 2 seconds to leave."); return; }
		var k = e.key;
		if (k === "Escape") { if (kiosk) { e.preventDefault(); hint("Grown-ups: hold ✕ for 2 seconds to leave."); } return; }
		if (k === "Tab") { if (kiosk) { /* keep focus inside the kiosk */ var f = Array.prototype.slice.call($("kd-wrap").querySelectorAll("button:not([hidden])")).filter(function (b) { return b.offsetParent; }); if (f.length && !$("kd-wrap").contains(document.activeElement)) { e.preventDefault(); f[0].focus(); } } return; }
		if (e.target && tag === "BUTTON" && (k === "Enter" || k === " ") && !t.classList.contains("kd-stage")) return;   // a focused button handles its own key
		unlock();
		if (play_ === "quiz" && /^[1-4]$/.test(k)) { var bs = $("kd-choices").children; if (bs[+k - 1]) bs[+k - 1].click(); e.preventDefault(); return; }
		if (k === "ArrowRight" || k === "PageDown" || k === "Enter") { e.preventDefault(); go(1); return; }
		if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { e.preventDefault(); go(-1); return; }
		if (k === " " || k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); if (play_ === "quiz") askAgain(); else sayCard(cur()); return; }
		if (k.length === 1) {   // a typed letter / digit jumps to that card; any other key just shows the next card (keyboard bashing is part of the fun)
			e.preventDefault();
			var id = play_ === "learn" ? K.keyToId(k, order) : "";
			if (id) { idx = order.indexOf(id); lastDir = 0; render(true); } else if (play_ === "learn") go(1);
		}
	});

	var hintT;
	function hint(msg) { var h = $("kd-hint"); h.textContent = msg; toast(msg); clearTimeout(hintT); hintT = setTimeout(function () { h.textContent = ""; }, 4000); }

	// ---------- hold-to-press (parent gate) ----------
	function holdBtn(btn, cb) {
		var t = null, fired = false;
		function start(e) { if (t) return; fired = false; btn.classList.add("kd-holding"); t = setTimeout(function () { t = null; fired = true; btn.classList.remove("kd-holding"); if (navigator.vibrate) try { navigator.vibrate(30); } catch (x) {} cb(); }, 2000); if (e && e.cancelable && e.type === "pointerdown") e.preventDefault(); }
		function stop() { if (t) { clearTimeout(t); t = null; btn.classList.remove("kd-holding"); if (!fired) hint("Grown-ups: keep holding for 2 seconds."); } }
		btn.addEventListener("pointerdown", start);
		["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { btn.addEventListener(ev, stop); });
		btn.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } });
		btn.addEventListener("keyup", function (e) { if (e.key === "Enter" || e.key === " ") stop(); });
		btn.addEventListener("click", function (e) { e.preventDefault(); });
		btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	}

	// ---------- kiosk: Fill window / Full screen ----------
	var kiosk = false, pushed = false, wrap = $("kd-wrap");
	function onBefore(e) { e.preventDefault(); e.returnValue = ""; return ""; }
	function onPop() { if (kiosk) { history.pushState({ kd: 1 }, ""); hint("Grown-ups: hold ✕ for 2 seconds to leave."); } }
	function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
	function enterKiosk(fs) {
		closeSet(true);
		if (!kiosk) {
			kiosk = true; wrap.classList.add("kd-on"); document.documentElement.classList.add("kd-lock");
			$("kd-exit").hidden = false;
			window.addEventListener("beforeunload", onBefore);
			try { history.pushState({ kd: 1 }, ""); pushed = true; } catch (e) {}
			window.addEventListener("popstate", onPop);
		}
		if (fs) {
			var r = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
			if (r) { try { var p = r.call(wrap); if (p && p.catch) p.catch(function () { hint("Full screen isn't allowed here; the page fills the window instead."); }); } catch (e) {} }
			else hint("This browser has no full screen for pages; the page fills the window instead.");
		}
		unlock(); stage.focus({ preventScroll: true }); render(false);
	}
	function exitKiosk() {
		if (!kiosk) return;
		kiosk = false; wrap.classList.remove("kd-on"); document.documentElement.classList.remove("kd-lock");
		$("kd-exit").hidden = true;
		window.removeEventListener("beforeunload", onBefore); window.removeEventListener("popstate", onPop);
		if (fsEl()) { var x = document.exitFullscreen || document.webkitExitFullscreen; if (x) try { x.call(document); } catch (e) {} }
		if (pushed) { pushed = false; try { history.back(); } catch (e) {} }
		render(false);
	}
	function onFsChange() { if (kiosk && !fsEl()) hint("Full screen closed; the cards still fill the window. Hold ✕ for 2 seconds to leave."); }
	document.addEventListener("fullscreenchange", onFsChange); document.addEventListener("webkitfullscreenchange", onFsChange);
	$("kd-fill").addEventListener("click", function () { enterKiosk(false); });
	$("kd-fs").addEventListener("click", function () { enterKiosk(true); });
	holdBtn($("kd-exit"), exitKiosk);

	// ---------- settings ----------
	var setEl = $("kd-set");
	holdBtn($("kd-gear"), openSet);
	function seg(id, val, cb) {
		var box = $(id);
		Array.prototype.forEach.call(box.children, function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-v") === String(val))); });
		if (!box.__w) { box.__w = 1; box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; cb(b.getAttribute("data-v")); syncSet(); }); }
	}
	function chk(id, key, after) { var c = $(id); c.checked = !!S[key]; if (!c.__w) { c.__w = 1; c.addEventListener("change", function () { S[key] = c.checked; save(); if (after) after(); }); } }
	function syncSet() {
		var allowed = MODE.cats, on = cats();
		$("kd-sec-cats").hidden = allowed.length < 2;
		var box = $("kd-cats"); box.innerHTML = "";
		allowed.forEach(function (cid) {
			var c = K.CATS.filter(function (x) { return x.id === cid; })[0];
			var n = K.deck(mode, [cid], { maxNum: S.maxNum }).length;
			var b = document.createElement("button"); b.type = "button"; b.className = "kd-cat"; b.setAttribute("aria-pressed", String(on.indexOf(cid) >= 0));
			b.innerHTML = '<span aria-hidden="true">' + c.icon + "</span>" + esc(c.name) + " <small>" + n + "</small>";
			b.addEventListener("click", function () {
				var list = cats().slice(), i = list.indexOf(cid);
				if (i >= 0) { if (list.length === 1) { toast("Keep at least one."); return; } list.splice(i, 1); } else list.push(cid);
				S.cats[mode] = list; save(); rebuild(order[idx]); syncSet(); render(false);
			});
			box.appendChild(b);
		});
		$("kd-count").textContent = pool.length + " cards";
		var hasLetters = on.indexOf("letters") >= 0, hasNum = on.indexOf("numbers") >= 0, hasAnimals = on.indexOf("animals") >= 0;
		$("kd-row-num").hidden = !hasNum; $("kd-row-count").hidden = !hasNum; $("kd-sec-snd").hidden = !hasAnimals;
		$("kd-row-case").hidden = mode === "numbers";
		chk("kd-o-word", "showWord", function () { render(false); });
		chk("kd-o-count", "count"); chk("kd-o-snd", "snd"); chk("kd-o-sw", "sw"); chk("kd-o-auto", "auto");
		seg("kd-o-case", S.lcase, function (v) { S.lcase = v; save(); render(false); });
		seg("kd-o-order", K.orderFor(S, mode), function (v) { S.ord[mode] = v; save(); rebuild(order[idx]); render(false); });
		seg("kd-o-num", S.maxNum, function (v) { S.maxNum = +v; save(); rebuild(order[idx]); render(false); });
		seg("kd-o-adv", S.adv, function (v) { S.adv = +v; save(); });
		seg("kd-o-qn", S.quizN, function (v) { S.quizN = +v; save(); if (play_ === "quiz") render(false); });
		seg("kd-o-theme", S.theme, function (v) { S.theme = v; save(); root.setAttribute("data-theme", v); });
		$("kd-rate").value = S.rate; $("kd-rate-v").textContent = S.rate.toFixed(2) + "×";
		$("kd-pitch").value = S.pitch; $("kd-pitch-v").textContent = S.pitch.toFixed(2);
		fillVoices();
	}
	// ABC page: the case buttons read Aa / A / a / Aa; other pages Cat / CAT / cat / Cat
	function caseLabels() {
		var b = $("kd-o-case").children;
		if (mode === "abc") { b[0].textContent = "Aa"; b[1].textContent = "A"; b[2].textContent = "a"; b[3].hidden = true; }
	}
	var lastFocus = null;
	function openSet() {
		lastFocus = document.activeElement; stopAll(); clearTimeout(advT);
		syncSet(); setEl.hidden = false; $("kd-set-x").focus();
	}
	function closeSet(quiet) { if (setEl.hidden) return; setEl.hidden = true; if (!quiet) { render(false); if (lastFocus && lastFocus.focus) lastFocus.focus(); } armAdv(); }
	$("kd-set-x").addEventListener("click", function () { closeSet(); });
	$("kd-set-done").addEventListener("click", function () { closeSet(); });
	setEl.addEventListener("click", function (e) { if (e.target === setEl) closeSet(); });
	$("kd-rate").addEventListener("input", function () { S.rate = +this.value; $("kd-rate-v").textContent = S.rate.toFixed(2) + "×"; save(); });
	$("kd-pitch").addEventListener("input", function () { S.pitch = +this.value; $("kd-pitch-v").textContent = S.pitch.toFixed(2); save(); });
	$("kd-rate").addEventListener("change", function () { stopAll(); say("Hello! Let's play.", token); });
	$("kd-pitch").addEventListener("change", function () { stopAll(); say("Hello! Let's play.", token); });
	$("kd-test").addEventListener("click", function () { unlock(); sayCard(cur()); });
	$("kd-vreset").addEventListener("click", function () { S.rate = K.DEFAULTS.rate; S.pitch = K.DEFAULTS.pitch; save(); syncSet(); });
	$("kd-s-fill").addEventListener("click", function () { enterKiosk(false); });
	$("kd-s-fs").addEventListener("click", function () { enterKiosk(true); });
	$("kd-s-stars").addEventListener("click", function () { stars = 0; saveStars(); $("kd-stars").textContent = "0"; toast("Stars reset."); });

	// voice list: English and the browser's language first; the shared searchable picker (main_js/voice-picker.js) makes it searchable
	var vsel = $("kd-voice"), vsig = "";
	function fillVoices() {
		if (!vsel) return;
		if (!synth) { $("kd-vnote").textContent = "This browser can't speak, so the cards are silent. Animal recordings still play."; vsel.disabled = true; return; }
		var sig = voices.map(vKey).join(",") + "#" + S.voice;
		if (sig === vsig) return; vsig = sig;
		var bl = (navigator.language || "en").toLowerCase().split("-")[0];
		var groups = { top: [], en: [], other: [] };
		voices.forEach(function (v) { var b = (v.lang || "").toLowerCase().split(/[-_]/)[0]; (b === bl && bl !== "en" ? groups.top : b === "en" ? groups.en : groups.other).push(v); });
		var auto = K.pickVoice(voices, navigator.language || "en-US");
		vsel.innerHTML = "";
		var o = document.createElement("option"); o.value = ""; o.textContent = "Automatic" + (auto ? " (" + auto.name + ")" : ""); vsel.appendChild(o);
		[["top", "Your language"], ["en", "English"], ["other", "Other languages"]].forEach(function (g) {
			if (!groups[g[0]].length) return;
			var og = document.createElement("optgroup"); og.label = g[1];
			groups[g[0]].sort(function (a, b) { return a.lang === b.lang ? a.name.localeCompare(b.name) : a.lang.localeCompare(b.lang); }).forEach(function (v) {
				var op = document.createElement("option"); op.value = vKey(v); op.textContent = v.name + " (" + v.lang + ")" + (v.localService ? "" : " · online"); og.appendChild(op);
			});
			vsel.appendChild(og);
		});
		vsel.value = S.voice; if (vsel.value !== S.voice) vsel.value = "";
		$("kd-vnote").textContent = voices.length ? voices.length + " voices on this device. The voice is your device's own: nothing is sent anywhere." : "Loading voices…";
	}
	if (vsel) vsel.addEventListener("change", function () { S.voice = vsel.value; save(); vsig = ""; stopAll(); unlock(); say("Hello! This is " + (cur() ? cur().word.toLowerCase() : "a cat") + ".", token); });
	if (window.MESVoicePicker && vsel) window.MESVoicePicker.enhance(vsel, { sample: "Hello! Look, a cow. Moo!" });
	if (synth) { loadVoices(); try { synth.addEventListener("voiceschanged", loadVoices); } catch (e) { synth.onvoiceschanged = loadVoices; } setTimeout(loadVoices, 600); }

	// ---------- credits ----------
	var cl = $("kd-credlist");
	if (cl) {
		var byS = {}; K.ITEMS.forEach(function (it) { if (it.snd) byS[it.snd] = it; });
		Object.keys(K.SOUNDS).forEach(function (k) {
			var s = K.SOUNDS[k], it = byS[k], li = document.createElement("li");
			li.innerHTML = "<b>" + esc(it ? it.word : k) + "</b>" + (s[4] ? " (" + esc(s[4]) + ")" : "") + ': <a href="' + esc(s[1]) + '" rel="noopener" target="_blank">' + esc(s[0]) + "</a>, by " + esc(s[2]) + ". Licence: " + esc(s[3]) + ".";
			cl.appendChild(li);
		});
		if (mode !== "animals" && !(MODE.cats.indexOf("animals") >= 0)) $("kd-credits").hidden = true;
	}

	// ---------- go ----------
	caseLabels();
	rebuild();
	render(false);
	var q = /[?&]play=quiz\b/.test(location.search);
	if (q) setPlay("quiz");
	if (!synth) hint("This browser can't speak. Pictures and animal recordings still work.");
})();
