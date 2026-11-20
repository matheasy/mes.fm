/* MES Falling Blocks page (mes.fm/blocks). Rules / randomiser / scoring / records: lib.js (window.MESBlocks). 3D: view3d.js (window.BK3D).
   Settings + statistics: localStorage "mes-blocks:v1". Hive: main_js/hive.js (window.MESHive) signs one custom_json (id "mes_blocks")
   per saved game; /api/blocks replays it and keeps the leaderboard, and runs live races. On localhost (no /api) an in-browser stand-in
   (localStorage "mes-blocks:mock") does both, so two tabs can race and the Hive flow can be tried without Keychain.
   Debug: window.MESBlocksDebug (game, run, step(ms) for a hidden pane where requestAnimationFrame does not run). */
(function () {
	"use strict";
	var B = window.MESBlocks;
	var root = document.getElementById("bk");
	if (!B || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var LS = "mes-blocks:v1";
	var COARSE = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
	function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	var toastT;
	function toast(msg) { var t = $("bk-toast"); t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3400); }

	/* ---------- settings + stats ---------- */
	var S = { md: "m", lv: 1, view: "2d", das: 133, arr: 10, sdf: "20", tc: "both", vol: 0.55, snd: true, ghost: true, grid: true, music: false,
		name: "", bot: "2", lbk: "d", stats: { games: 0, lines: 0, pieces: 0, quads: 0, tspins: 0, ms: 0 }, best: { s: [], u: [], m: [], d: {} }, last: null };
	try { var saved = JSON.parse(localStorage.getItem(LS) || "null"); if (saved && typeof saved === "object") for (var k in S) if (saved[k] !== undefined) S[k] = saved[k]; } catch (e) {}
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
	(function fromQuery() {
		var q = new URLSearchParams(location.search);
		var m = q.get("mode"); if (m && /^[msuzd]$/.test(m)) S.md = m;
		if (q.get("daily") === "1") S.md = "d";
		if (q.get("seed")) $("bk-seed").value = q.get("seed").slice(0, 40);
		if (q.get("view") === "3d") S.view = "3d";
	})();

	/* ---------- tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll(".bk-tab"));
	function showTab(t) {
		tabs.forEach(function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; $("bk-p-" + b.getAttribute("data-t")).hidden = !on; });
		if (t === "lb") loadLb();
		if (t === "race") loadLobby();
		if (t === "stats") renderStats();
		if (t === "play") setTimeout(layout, 0);
		if (t !== "play" && run.state === "play" && !run.race) pause(true);
	}
	tabs.forEach(function (b, i) {
		b.addEventListener("click", function () { showTab(b.getAttribute("data-t")); });
		b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { var n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); n.click(); } });
	});

	/* ---------- sound (WebAudio, made here: no files) ---------- */
	var AC = null, master = null;
	function audio() {
		if (AC) { if (AC.state === "suspended") AC.resume(); return AC; }
		var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
		AC = new C(); master = AC.createGain(); master.gain.value = S.vol; master.connect(AC.destination);
		return AC;
	}
	function tone(f, dur, type, vol, f2, when) {
		if (!S.snd || !AC) return;
		var t = AC.currentTime + (when || 0), o = AC.createOscillator(), g = AC.createGain();
		o.type = type || "square"; o.frequency.setValueAtTime(f, t);
		if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
		g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
	}
	function noise(dur, vol, freq) {
		if (!S.snd || !AC) return;
		var n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
		for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
		var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
		s.buffer = buf; f.type = "lowpass"; f.frequency.value = freq || 900; g.gain.value = vol || 0.3;
		s.connect(f); f.connect(g); g.connect(master); s.start();
	}
	var SFX = {
		move: function () { tone(1250, 0.025, "square", 0.035); },
		rotate: function () { tone(620, 0.05, "triangle", 0.09, 880); },
		hold: function () { tone(440, 0.07, "triangle", 0.1, 330); },
		hard: function () { noise(0.09, 0.35, 700); tone(110, 0.09, "sine", 0.25, 60); },
		lock: function () { tone(190, 0.05, "sine", 0.12, 140); },
		clear: function (n) { [523, 659, 784, 1047].slice(0, n).forEach(function (f, i) { tone(f, 0.12, "square", 0.1, null, i * 0.055); }); },
		quad: function () { [523, 659, 784, 1047].forEach(function (f) { tone(f, 0.45, "sawtooth", 0.06); }); tone(1568, 0.5, "square", 0.05, null, 0.18); },
		tspin: function () { tone(330, 0.35, "sawtooth", 0.08, 1320); tone(660, 0.3, "triangle", 0.07, 990, 0.05); },
		level: function () { [392, 523, 659, 784].forEach(function (f, i) { tone(f, 0.1, "triangle", 0.12, null, i * 0.07); }); },
		garbage: function () { tone(90, 0.18, "sawtooth", 0.14, 70); },
		topout: function () { [392, 330, 262, 196, 131].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.14, null, i * 0.13); }); },
		done: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.18, "square", 0.09, null, i * 0.08); }); },
		count: function () { tone(660, 0.12, "square", 0.1); },
		go: function () { tone(990, 0.25, "square", 0.12); }
	};
	function sfx(k, a) { try { if (SFX[k]) SFX[k](a); } catch (e) {} }
	/* a light background beat (our own tune), off by default */
	var beat = { on: false, next: 0, step: 0, timer: null };
	var TUNE = [[220, 330], [0, 0], [262, 392], [0, 330], [196, 294], [0, 0], [247, 370], [0, 294]];
	function beatTick() {
		if (!AC || !beat.on) return;
		var spb = 60 / 132 / 2;
		while (beat.next < AC.currentTime + 0.2) {
			var st = TUNE[beat.step % TUNE.length], w = beat.next - AC.currentTime;
			if (st[0]) tone(st[0] / 2, spb * 0.9, "triangle", 0.07, null, Math.max(0, w));
			if (st[1] && beat.step % 2 === 0) tone(st[1], spb * 0.5, "square", 0.025, null, Math.max(0, w));
			if (beat.step % 4 === 0) (function (ww) { setTimeout(function () { noise(0.05, 0.12, 2400); }, Math.max(0, ww * 1000)); })(w);
			beat.next += spb; beat.step++;
		}
	}
	function setBeat(on) {
		beat.on = on && S.music && S.snd;
		clearInterval(beat.timer);
		if (beat.on && audio()) { beat.next = AC.currentTime + 0.05; beat.timer = setInterval(beatTick, 60); }
	}

	/* ---------- the run (current game) ---------- */
	var run = { g: null, state: "idle", mode: "m", daily: null, t0: 0, goAt: 0, pausedAt: 0, pausedTotal: 0, msgs: [], flash: null, race: null, bot: null, replay: null, lastCount: -1, rec: null };
	var view = $("bk-view"), stage = $("bk-stage"), cv = $("bk-cv"), ctx = cv.getContext("2d");
	function gt() { return run.state === "play" ? Math.max(0, now() - run.t0 - run.pausedTotal) : (run.pausedAt ? run.pausedAt - run.t0 - run.pausedTotal : 0); }
	function engMode(m) { return m === "d" ? "s" : m; }

	function lvOptions() {
		var sel = $("bk-lv"), h = "";
		for (var i = 1; i <= 15; i++) h += '<option value="' + i + '">' + i + (i === 1 ? " (slowest)" : "") + "</option>";
		sel.innerHTML = h; sel.value = String(S.lv);
	}
	function setupUi() {
		[].slice.call($("bk-md").querySelectorAll("button")).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S.md ? "true" : "false"); });
		$("bk-lvf").hidden = !(S.md === "m" || S.md === "z");
		$("bk-seedf").hidden = S.md === "d";
		var d = { m: "Clear 150 lines while the pieces fall faster every 10 lines. Highest score wins (start at level 1 for the leaderboard).", s: "Clear 40 lines as fast as you can.", u: "Two minutes: as many points as you can. Quads and T-spins are worth the most.", z: "No speed-up, no clock and no game over: the well just empties when it fills.", d: "Today's daily race: a Sprint 40 on the same pieces as everyone else in the world (" + B.utcDate() + " UTC)." }[S.md];
		$("bk-desc").textContent = d;
		[].slice.call($("bk-dim").querySelectorAll("button")).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S.view ? "true" : "false"); });
		$("bk-snd").setAttribute("aria-pressed", S.snd ? "true" : "false"); $("bk-snd").textContent = S.snd ? "🔊" : "🔇";
		$("bk-das").value = S.das; $("bk-arr").value = S.arr; $("bk-sdf").value = S.sdf; $("bk-tc").value = S.tc; $("bk-vol").value = S.vol;
		$("bk-ghost").checked = !!S.ghost; $("bk-grid").checked = !!S.grid; $("bk-music").checked = !!S.music;
		$("bk-touch").hidden = !(COARSE && S.tc !== "swipe");
		$("bk-rname").value = S.name || ""; $("bk-bot").value = S.bot;
	}
	$("bk-md").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.md = b.getAttribute("data-v"); save(); setupUi(); if (run.state !== "play") newGame(); });
	$("bk-lv").addEventListener("change", function () { S.lv = +this.value || 1; save(); });
	$("bk-dim").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setView(b.getAttribute("data-v")); });
	$("bk-snd").addEventListener("click", function () { S.snd = !S.snd; save(); setupUi(); if (S.snd) audio(); setBeat(run.state === "play"); });
	$("bk-setbtn").addEventListener("click", function () { var s = $("bk-settings"); s.hidden = !s.hidden; this.setAttribute("aria-expanded", s.hidden ? "false" : "true"); if (!s.hidden) s.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
	function numSet(id, key, lo, hi) { $(id).addEventListener("change", function () { var v = Math.round(+this.value); if (!isFinite(v)) v = S[key]; S[key] = Math.max(lo, Math.min(hi, v)); this.value = S[key]; save(); }); }
	numSet("bk-das", "das", 0, 400); numSet("bk-arr", "arr", 0, 200);
	$("bk-sdf").addEventListener("change", function () { S.sdf = this.value; save(); });
	$("bk-tc").addEventListener("change", function () { S.tc = this.value; save(); setupUi(); layout(); });
	$("bk-vol").addEventListener("input", function () { S.vol = +this.value; if (master) master.gain.value = S.vol; save(); });
	$("bk-ghost").addEventListener("change", function () { S.ghost = this.checked; save(); });
	$("bk-grid").addEventListener("change", function () { S.grid = this.checked; save(); });
	$("bk-music").addEventListener("change", function () { S.music = this.checked; save(); setBeat(run.state === "play"); });

	/* ---------- starting / stopping ---------- */
	function newGame(opts) {
		opts = opts || {};
		audio();
		stopRace(opts.keepRace);
		var mode = opts.mode || S.md, seed, daily = null;
		if (mode === "d") { daily = B.utcDate(); seed = B.dailySeed(daily); }
		else if (opts.seed) seed = opts.seed;
		else { var typed = ($("bk-seed").value || "").trim().replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 40); seed = typed || B.randomSeed(); }
		var em = opts.engMode || engMode(mode);
		run.g = new B.Game({ seed: seed, mode: em, lv: (em === "m" || em === "z") ? S.lv : 1 });
		run.mode = mode; run.daily = daily; run.msgs = []; run.flash = null; run.replay = null; run.rec = null;
		run.pausedTotal = 0; run.pausedAt = 0; run.lastCount = -1;
		run.state = "count"; run.goAt = now() + (opts.countMs != null ? opts.countMs : 1600);
		resetInput();
		$("bk-after").hidden = true; $("bk-after").innerHTML = "";
		$("bk-ov").hidden = true;
		$("bk-status").textContent = opts.status || (B.MODES[em] ? B.MODES[em].name : "") + (daily ? " · daily race " + daily : "") + " · seed " + seed;
		stage.focus({ preventScroll: true });
		layout();
	}
	function pause(on) {
		if (on && run.state === "play") {
			if (run.race && !run.bot) return;   // a live race can't be paused
			run.state = "paused"; run.pausedAt = now(); resetInput(); setBeat(false);
			showOv("<b>Paused</b><p>Press P, Esc or the button to carry on.</p><button type=\"button\" class=\"bk-ovbtn\" data-o=\"resume\">▶ Resume</button>");
		} else if (!on && run.state === "paused") {
			run.pausedTotal += now() - run.pausedAt; run.pausedAt = 0; run.state = "play"; $("bk-ov").hidden = true; setBeat(true); stage.focus({ preventScroll: true });
		}
		$("bk-pause").textContent = run.state === "paused" ? "▶ Resume" : "❚❚ Pause";
	}
	function showOv(html) { var o = $("bk-ov"); o.innerHTML = html; o.hidden = false; }
	$("bk-ov").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var o = b.getAttribute("data-o");
		if (o === "resume") pause(false); else if (o === "new") newGame(); else if (o === "rematch") raceRematch(); else if (o === "close") $("bk-ov").hidden = true;
	});
	$("bk-new").addEventListener("click", function () { if (run.race && !run.bot && run.state === "play") return toast("Leave the race first (Race tab)."); newGame(); });
	$("bk-pause").addEventListener("click", function () { pause(run.state === "play"); });
	document.addEventListener("visibilitychange", function () { if (document.hidden) pause(true); });
	window.addEventListener("blur", function () { pause(true); });

	/* ---------- actions + events ---------- */
	function act(a) {
		var g = run.g; if (!g || run.state !== "play") return false;
		var ok = g.act(a, gt());
		drain();
		return ok;
	}
	function drain() {
		var g = run.g; if (!g) return;
		var ev = g.ev; g.ev = [];
		ev.forEach(function (e) {
			if (e.k === "move") sfx("move");
			else if (e.k === "rotate") sfx("rotate");
			else if (e.k === "hold") sfx("hold");
			else if (e.k === "hard") sfx("hard");
			else if (e.k === "garbage") { sfx("garbage"); }
			else if (e.k === "level") { sfx("level"); msg("Level " + e.lv, "", "#74c0fc"); }
			else if (e.k === "zenclear") msg("Fresh start", "", "#adb5bd");
			else if (e.k === "tsnone") { sfx("tspin"); msg(e.ts === "mini" ? "Mini T-Spin" : "T-Spin", "", "#cc5de8"); }
			else if (e.k === "lock") {
				if (!e.n) { sfx("lock"); return; }
				var name = B.clearName(e.n, e.ts);
				if (e.ts) sfx("tspin"); else if (e.n === 4) sfx("quad"); else sfx("clear", e.n);
				var sub = [];
				if (e.b2b) sub.push("Back-to-back" + (e.b2b > 1 ? " ×" + e.b2b : ""));
				if (e.combo) sub.push("Combo " + e.combo);
				if (e.pc) sub.push("Perfect clear!");
				if (e.n >= 4 || e.ts || e.b2b || e.combo || e.pc) msg(name, sub.join(" · "), e.ts ? "#da77f2" : e.n >= 4 ? "#3bc9db" : "#ffd43b");
				run.flash = { rows: e.rows.map(function (r) { return r - B.HID; }).filter(function (r) { return r >= 0; }), t0: now() };
			}
		});
		if (g.over && run.state === "play") finish();
	}
	function msg(text, sub, col) { run.msgs.push({ text: text, sub: sub || "", col: col || "#fff", t0: now() }); if (run.msgs.length > 3) run.msgs.shift(); }

	/* ---------- input: logical keys (keyboard, touch, gamepad) ---------- */
	var held = {}, dirs = [], das = { start: 0, rep: 0, dir: "" }, sdHeld = false;
	function resetInput() {
		if (sdHeld && run.g && run.state === "play" && S.sdf !== "inst") act(8);
		held = {}; dirs = []; sdHeld = false; das.dir = "";
		[].slice.call(document.querySelectorAll("#bk-touch button.on")).forEach(function (b) { b.classList.remove("on"); });
	}
	function press(k) {
		audio();
		if (k === "pause") { if (run.state === "play") pause(true); else if (run.state === "paused") pause(false); return; }
		if (run.state !== "play") return;
		if (held[k]) return;
		held[k] = true;
		if (k === "L" || k === "R") {
			dirs = dirs.filter(function (d) { return d !== k; }); dirs.push(k);
			act(k === "L" ? 0 : 1);
			das.dir = k; das.start = gt(); das.rep = 0;
		} else if (k === "sd") { sdHeld = true; act(S.sdf === "inst" ? 11 : 7); }
		else if (k === "hd") act(6);
		else if (k === "cw") act(2);
		else if (k === "ccw") act(3);
		else if (k === "f") act(4);
		else if (k === "hold") act(5);
	}
	function release(k) {
		if (!held[k]) return;
		held[k] = false;
		if (k === "L" || k === "R") {
			dirs = dirs.filter(function (d) { return d !== k; });
			if (dirs.length) { das.dir = dirs[dirs.length - 1]; das.start = gt(); das.rep = 0; } else das.dir = "";
		} else if (k === "sd") { sdHeld = false; if (S.sdf !== "inst") act(8); }
	}
	function inputFrame() {
		if (run.state !== "play") return;
		var t = gt();
		if (das.dir && held[das.dir]) {
			if (t - das.start >= S.das) {
				if (S.arr <= 0) act(das.dir === "L" ? 9 : 10);
				else {
					if (!das.rep) das.rep = das.start + S.das - S.arr;
					var n = 0;
					while (das.rep + S.arr <= t && n++ < 12) { das.rep += S.arr; if (!act(das.dir === "L" ? 0 : 1)) { das.rep = t; break; } }
				}
			}
		}
		if (sdHeld && S.sdf === "inst") act(11);
	}
	var KEYS = { ArrowLeft: "L", ArrowRight: "R", ArrowDown: "sd", " ": "hd", Spacebar: "hd", ArrowUp: "cw", x: "cw", X: "cw", z: "ccw", Z: "ccw", Control: "ccw", a: "f", A: "f", c: "hold", C: "hold", Shift: "hold", p: "pause", P: "pause", Escape: "pause" };
	function typing(e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && t !== stage; }
	function playVisible() { return !$("bk-p-play").hidden; }
	document.addEventListener("keydown", function (e) {
		if (typing(e) || !playVisible() || e.metaKey || e.altKey) return;
		var k = KEYS[e.key];
		if (e.ctrlKey && e.key !== "Control") return;
		if (k) {
			if (run.state === "play" || run.state === "paused" || run.state === "count") e.preventDefault();
			if (!e.repeat) press(k);
			return;
		}
		if (e.repeat) return;
		var key = e.key.toLowerCase();
		if (key === "n" || (key === "enter" && (run.state === "idle" || run.state === "over"))) { e.preventDefault(); if (!(run.race && !run.bot && run.state === "play")) newGame(); }
		else if (key === "r" && run.state !== "idle" && !(run.race && !run.bot)) {
			if (run.state === "play" && gt() > 60000 && !(run._rq && now() - run._rq < 1200)) { run._rq = now(); toast("Press R again to restart."); return; }
			if (run.bot) startBot(); else newGame({ mode: run.mode === "r" ? S.md : run.mode });
		}
		else if (key === "m") $("bk-snd").click();
		else if (key === "v") setView(S.view === "3d" ? "2d" : "3d");
	});
	document.addEventListener("keyup", function (e) { var k = KEYS[e.key]; if (k && k !== "pause") release(k); });

	/* touch buttons */
	[].slice.call($("bk-touch").querySelectorAll("button")).forEach(function (b) {
		var k = b.getAttribute("data-k");
		b.addEventListener("pointerdown", function (e) { e.preventDefault(); b.classList.add("on"); try { b.setPointerCapture(e.pointerId); } catch (er) {} press(k); });
		var up = function () { b.classList.remove("on"); release(k); };
		b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
		b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	});

	/* touch gestures + 3D orbit on the stage.
	   3D: the mouse drags the camera round the well (left or right button; the game is played with the keys), the wheel zooms,
	   two fingers orbit + pinch zoom; "🎥 Turn view" makes one finger orbit too (game swipes off until it is turned off). */
	var tp = {}, orb = null, pinch = 0, orbitMode = false;
	function threeOn() { return S.view === "3d" && !!v3; }
	stage.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	stage.addEventListener("pointerdown", function (e) {
		audio();
		if (e.pointerType === "mouse") {
			stage.focus({ preventScroll: true });
			if (threeOn()) { orb = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { stage.setPointerCapture(e.pointerId); } catch (er) {} }
			return;
		}
		tp[e.pointerId] = { x0: e.clientX, y0: e.clientY, sx: e.clientX, t0: now(), moved: false, sd: false, x: e.clientX, y: e.clientY };
		try { stage.setPointerCapture(e.pointerId); } catch (er) {}
		var ids = Object.keys(tp);
		if (threeOn() && (orbitMode || ids.length === 2)) {
			if (ids.length === 2) { var a = tp[ids[0]], b2 = tp[ids[1]]; pinch = Math.hypot(a.x - b2.x, a.y - b2.y); if (tp[ids[0]].sd) release("sd"); }
			orb = { touch: true, x: e.clientX, y: e.clientY };
		}
		e.preventDefault();
	});
	stage.addEventListener("pointermove", function (e) {
		if (orb && e.pointerType === "mouse") {
			v3.orbit((e.clientX - orb.x) * -0.006, (e.clientY - orb.y) * 0.005);
			orb.x = e.clientX; orb.y = e.clientY; return;
		}
		var p = tp[e.pointerId]; if (!p) return;
		var lx = p.x, ly = p.y; p.x = e.clientX; p.y = e.clientY;
		if (orb && orb.touch) {
			var ids = Object.keys(tp);
			if (ids.length >= 2) {
				var a = tp[ids[0]], b2 = tp[ids[1]], d = Math.hypot(a.x - b2.x, a.y - b2.y);
				if (pinch > 0 && d > 0) v3.zoom(d / pinch);
				pinch = d;
				v3.orbit((e.clientX - lx) * -0.004, (e.clientY - ly) * 0.003);   // each finger moves it half as much
			} else v3.orbit((e.clientX - lx) * -0.008, (e.clientY - ly) * 0.006);
			return;
		}
		if (S.tc === "btn") return;
		var cell = Math.max(14, L.c * 0.85), dx = e.clientX - p.sx;
		while (dx >= cell) { press("R"); release("R"); p.sx += cell; dx -= cell; p.moved = true; }
		while (dx <= -cell) { press("L"); release("L"); p.sx -= cell; dx += cell; p.moved = true; }
		var dy = e.clientY - p.y0, dt = now() - p.t0;
		if (!p.sd && dy > cell * 1.4 && dy / Math.max(1, dt) < 0.5 && Math.abs(e.clientX - p.x0) < cell * 1.5) { p.sd = true; press("sd"); }
	});
	function tEnd(e) {
		if (e.pointerType === "mouse") { orb = null; return; }
		var p = tp[e.pointerId]; if (!p) return;
		delete tp[e.pointerId];
		if (orb && orb.touch) { if (!Object.keys(tp).length) { orb = null; pinch = 0; } return; }
		if (S.tc === "btn") return;
		var dx = e.clientX - p.x0, dy = e.clientY - p.y0, dt = now() - p.t0, cell = Math.max(14, L.c * 0.85);
		if (p.sd) { release("sd"); return; }
		if (e.type === "pointercancel") return;
		if (!p.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 350) {
			var r = stage.getBoundingClientRect(), k = e.clientX - r.left < r.width / 2 ? "ccw" : "cw";
			press(k); release(k);
		} else if (dy > cell * 2 && dy / Math.max(1, dt) > 0.55 && Math.abs(dy) > Math.abs(dx)) { press("hd"); release("hd"); }
		else if (dy < -cell * 2 && -dy / Math.max(1, dt) > 0.5 && Math.abs(dy) > Math.abs(dx)) { press("hold"); release("hold"); }
	}
	stage.addEventListener("pointerup", tEnd); stage.addEventListener("pointercancel", tEnd);
	stage.addEventListener("dblclick", function () { if (v3) { v3.reset(); camUi(); } });
	stage.addEventListener("wheel", function (e) {
		if (!threeOn()) return;
		e.preventDefault();
		v3.zoom(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
		camUi();
	}, { passive: false });
	$("bk-orbit").addEventListener("click", function () { orbitMode = !orbitMode; camUi(); toast(orbitMode ? "One finger now turns the view. Tap 🎥 again to play with swipes." : "Swipes play the game again."); });
	$("bk-camreset").addEventListener("click", function () { if (v3) v3.reset(); camUi(); });
	function camUi() {
		var on = S.view === "3d";
		$("bk-cam").hidden = !on;
		$("bk-orbit").hidden = !COARSE;
		$("bk-orbit").setAttribute("aria-pressed", orbitMode ? "true" : "false");
	}

	/* gamepad */
	var padPrev = {};
	var PAD = { 14: "L", 15: "R", 13: "sd", 12: "hd", 0: "cw", 1: "ccw", 2: "f", 3: "hold", 4: "hold", 5: "hold", 9: "pause" };
	function padFrame() {
		var pads = navigator.getGamepads ? navigator.getGamepads() : [];
		for (var i = 0; i < pads.length; i++) {
			var gp = pads[i]; if (!gp) continue;
			var axL = gp.axes && gp.axes[0] < -0.6, axR = gp.axes && gp.axes[0] > 0.6, axD = gp.axes && gp.axes[1] > 0.6;
			for (var bi in PAD) {
				var b = gp.buttons[bi], down = !!(b && b.pressed) || (bi == 14 && axL) || (bi == 15 && axR) || (bi == 13 && axD);
				var key = i + ":" + bi;
				if (down && !padPrev[key]) { if (PAD[bi] === "pause" && (run.state === "idle" || run.state === "over")) newGame(); else press(PAD[bi]); }
				else if (!down && padPrev[key]) release(PAD[bi]);
				padPrev[key] = down;
			}
		}
	}
	window.addEventListener("gamepadconnected", function () { toast("Gamepad connected: d-pad moves, A / B turn, Y holds, up drops."); });

	/* ---------- layout + 2D drawing ---------- */
	var L = { c: 24, bx: 0, by: 0, w: 0, h: 0, dpr: 1, side: 5 };
	function layout() {
		var r = stage.getBoundingClientRect(), w = r.width, h = r.height;
		if (!w || !h) return;
		var dpr = Math.min(2.5, window.devicePixelRatio || 1);
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
		var opp = !!run.race;
		var side = w < 520 ? 3.5 : w / h < 0.75 ? 4.2 : 5.2;
		var cols = 10 + side * 2 + (opp ? 6.2 : 0) + 0.8;
		var c = Math.floor(Math.min(w / cols, (h - 8) / 20.8) * 10) / 10;
		c = Math.max(8, c);
		var totalW = (10 + side * 2 + (opp ? 6.2 : 0)) * c;
		L.c = c; L.side = side; L.dpr = dpr; L.w = w; L.h = h; L.opp = opp;
		L.bx = Math.round((w - totalW) / 2 + side * c);
		L.by = Math.round((h - 20 * c) / 2 + 0.3 * c);
		var b3 = $("bk-3d");
		if (S.view === "3d") {
			b3.style.left = "0px"; b3.style.top = "0px"; b3.style.width = w + "px"; b3.style.height = h + "px";
			if (v3) v3.size(w, h, c, L.bx + 5 * c, L.by + 10 * c);
		}
	}
	if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(stage); else window.addEventListener("resize", layout);

	function shade(hex, f) {
		var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
		function m(v) { return Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))); }
		return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")";
	}
	function cell(x, y, s, col, alpha) {
		var c = ctx, i = Math.max(1, s * 0.12);
		c.globalAlpha = alpha == null ? 1 : alpha;
		c.fillStyle = col; c.fillRect(x, y, s, s);
		c.fillStyle = shade(col, 0.35); c.fillRect(x, y, s, i); c.fillRect(x, y, i, s);
		c.fillStyle = shade(col, -0.35); c.fillRect(x, y + s - i, s, i); c.fillRect(x + s - i, y, i, s);
		c.fillStyle = shade(col, 0.12); c.fillRect(x + i, y + i, s - 2 * i, s - 2 * i);
		c.globalAlpha = 1;
	}
	function mini(p, cx, cy, s, dim) {
		if (!p) return;
		var sh = B.SHAPES[p][0], minX = 9, maxX = -9, minY = 9, maxY = -9;
		sh.forEach(function (q) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); });
		var w = (maxX - minX + 1) * s, h = (maxY - minY + 1) * s, col = dim ? "#5c6370" : B.COLORS[B.PIECES.indexOf(p) + 1];
		sh.forEach(function (q) { cell(cx - w / 2 + (q[0] - minX) * s, cy - h / 2 + (q[1] - minY) * s, s, col); });
	}
	function label(t, x, y, size, col, align, weight) {
		ctx.font = (weight || 700) + " " + Math.round(size) + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
		ctx.fillStyle = col || "#c9d1dc"; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
		ctx.fillText(t, x, y);
	}
	function panel(x, y, w, h) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; roundRect(x, y, w, h, Math.min(10, w / 8)); ctx.fill(); ctx.stroke(); }
	function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
	function drawBoard(g, bx, by, c, opts) {
		opts = opts || {};
		ctx.fillStyle = "#070a12"; ctx.fillRect(bx, by, 10 * c, 20 * c);
		if (S.grid && !opts.small) {
			ctx.strokeStyle = "rgba(255,255,255,0.055)"; ctx.lineWidth = 1; ctx.beginPath();
			for (var gx = 1; gx < 10; gx++) { ctx.moveTo(bx + gx * c + 0.5, by); ctx.lineTo(bx + gx * c + 0.5, by + 20 * c); }
			for (var gy = 1; gy < 20; gy++) { ctx.moveTo(bx, by + gy * c + 0.5); ctx.lineTo(bx + 10 * c, by + gy * c + 0.5); }
			ctx.stroke();
		}
		if (!g) return;
		var b = g.board, HID = B.HID;
		for (var y = HID; y < B.H; y++) for (var x = 0; x < 10; x++) { var v = b[y * 10 + x]; if (v) cell(bx + x * c, by + (y - HID) * c, c, B.COLORS[v]); }
		var cur = g.cur;
		if (cur) {
			var sh = B.SHAPES[cur.p][cur.r], col = B.COLORS[B.PIECES.indexOf(cur.p) + 1];
			if (S.ghost) {
				var gy2 = g.ghostY();
				if (gy2 !== cur.y) sh.forEach(function (q) { var yy = gy2 + q[1] - HID; if (yy >= 0) { ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, c * 0.08); ctx.strokeRect(bx + (cur.x + q[0]) * c + c * 0.08, by + yy * c + c * 0.08, c * 0.84, c * 0.84); ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.fillRect(bx + (cur.x + q[0]) * c, by + yy * c, c, c); ctx.globalAlpha = 1; } });
			}
			// lock-delay hint: the piece dims a little as the half second runs out
			var fade = 1;
			if (g.lt >= 0 && g.grounded()) fade = 0.55 + 0.45 * Math.max(0, Math.min(1, (g.lt - g.now) / B.LOCK_US));
			sh.forEach(function (q) { var yy = cur.y + q[1] - HID; if (yy > -1) cell(bx + (cur.x + q[0]) * c, by + yy * c, c, col, yy < 0 ? 0.5 : fade); });
		}
		// pending garbage meter on the left edge
		if (g.pending) { ctx.fillStyle = "#ff4d4f"; var ph = Math.min(20, g.pending) * c; ctx.fillRect(bx - Math.max(3, c * 0.22), by + 20 * c - ph, Math.max(3, c * 0.18), ph); }
	}
	function draw() {
		var dpr = L.dpr, c = L.c, g = run.g, t = now();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, L.w, L.h);
		var bx = L.bx, by = L.by, three = S.view === "3d" && v3;
		// frame
		if (!three) { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(bx - 3, by - 3, 10 * c + 6, 20 * c + 6); drawBoard(g, bx, by, c); }
		if (run.flash && !three) {
			var a = 1 - (t - run.flash.t0) / 260;
			if (a > 0) { ctx.fillStyle = "rgba(255,255,255," + (a * 0.85) + ")"; run.flash.rows.forEach(function (r) { ctx.fillRect(bx, by + r * c, 10 * c, c); }); }
		}
		// hold + stats (left), next (right)
		var sw = (L.side - 0.6) * c, lx = bx - L.side * c, rx = bx + 10.6 * c, fs = Math.max(10, c * 0.55);
		panel(lx, by, sw, c * 3.6); label("HOLD", lx + c * 0.35, by + fs * 1.2, fs * 0.85, "#8d98a8");
		if (g) mini(g.hold, lx + sw / 2, by + c * 2.15, c * 0.78, g.holdUsed);
		panel(rx, by, sw, c * 13.2); label("NEXT", rx + c * 0.35, by + fs * 1.2, fs * 0.85, "#8d98a8");
		if (g) for (var i = 0; i < 5; i++) mini(g.queue[i], rx + sw / 2, by + c * (2.2 + i * 2.35), c * (i ? 0.62 : 0.8));
		if (g) {
			var rows = statRows(g), y0 = by + c * 4.6;
			rows.forEach(function (r, j) { var yy = y0 + j * fs * 2.55; if (yy > by + 20 * c) return; label(r[0], lx + c * 0.1, yy, fs * 0.72, "#8d98a8", "left", 600); label(r[1], lx + c * 0.1, yy + fs * 1.15, fs * 1.08, "#f1f3f5", "left", 800); });
		}
		// opponent (race)
		if (L.opp && run.race) {
			var oc = c * 0.5, ox = rx + sw + c * 0.6, oy = by + c * 1.2, os = run.race.opp;
			label(run.race.oppName || "Opponent", ox, by + fs * 0.9, fs * 0.8, "#c9d1dc", "left", 700);
			ctx.fillStyle = "#070a12"; ctx.fillRect(ox, oy, 10 * oc, 20 * oc);
			if (os && os.b && os.b.length === 200) for (var q = 0; q < 200; q++) { var v = +os.b[q]; if (v) cell(ox + (q % 10) * oc, oy + Math.floor(q / 10) * oc, oc, B.COLORS[v]); }
			if (os) {
				label((os.l || 0) + " lines", ox, oy + 20 * oc + fs * 1.1, fs * 0.8, "#f1f3f5", "left", 700);
				label("sent " + (os.s || 0), ox, oy + 20 * oc + fs * 2.2, fs * 0.72, "#8d98a8", "left", 600);
				if (os.o) label("OUT", ox + 5 * oc, oy + 10 * oc, fs * 1.4, "#ff6b6b", "center", 900);
			}
		}
		// messages
		run.msgs = run.msgs.filter(function (m) { return t - m.t0 < 1500; });
		run.msgs.forEach(function (m, j) {
			var age = (t - m.t0) / 1500, al = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25, yy = by + c * (5 + j * 2.2) - age * c;
			ctx.globalAlpha = Math.max(0, al);
			ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 6;
			label(m.text, bx + 5 * c, yy, Math.max(14, c * 0.95), m.col, "center", 900);
			if (m.sub) label(m.sub, bx + 5 * c, yy + c * 0.85, Math.max(11, c * 0.55), "#e9ecef", "center", 700);
			ctx.shadowBlur = 0; ctx.globalAlpha = 1;
		});
		// countdown
		if (run.state === "count") {
			var left = Math.ceil((run.goAt - t) / 500);
			ctx.fillStyle = "rgba(7,10,18,0.55)"; ctx.fillRect(bx, by, 10 * c, 20 * c);
			label(left > 2 ? String(left - 2) : left > 0 ? "READY" : "GO", bx + 5 * c, by + 10 * c, Math.max(20, c * (left > 2 ? 2.4 : 1.5)), left > 0 ? "#ffd43b" : "#69db7c", "center", 900);
		}
		if (run.state === "idle") { ctx.fillStyle = "rgba(7,10,18,0.4)"; ctx.fillRect(bx, by, 10 * c, 20 * c); }
		if (three) v3.draw(g, { ghost: S.ghost, flash: run.flash && { rows: run.flash.rows, a: 1 - (t - run.flash.t0) / 260 } });
	}
	function statRows(g) {
		var t = run.replay ? Math.round(g.now / 1000) : (run.state === "over" ? g.endMs : gt());
		var rows = [["SCORE", B.fmtNum(g.score)]];
		if (g.mode === "s" || g.mode === "r") rows.push(["LINES", Math.max(0, B.SPRINT_LINES - g.lines) + " left"]);
		else rows.push(["LINES", String(g.lines)]);
		if (g.mode !== "s" && g.mode !== "r") rows.push(["LEVEL", String(g.mode === "z" ? g.lv0 : g.level)]);
		rows.push([g.mode === "u" ? "TIME LEFT" : "TIME", B.fmtTime(g.mode === "u" ? Math.max(0, B.ULTRA_MS - t) : t)]);
		rows.push(["PIECES/S", t > 500 ? (g.pieces / (t / 1000)).toFixed(2) : "0.00"]);
		if (g.b2b > 1) rows.push(["B2B", "×" + (g.b2b - 1)]);
		return rows;
	}

	/* ---------- 3D ---------- */
	var v3 = null, v3loading = false;
	function setView(v) {
		S.view = v === "3d" ? "3d" : "2d"; save(); setupUi(); camUi();
		$("bk-3d").hidden = S.view !== "3d";
		if (S.view === "3d" && !v3 && !v3loading) {
			if (!window.BK3D) { S.view = "2d"; setupUi(); return; }
			v3loading = true; $("bk-status").textContent = "Loading the 3D view…";
			window.BK3D.create($("bk-3d")).then(function (v) { v3 = v; v3loading = false; layout(); $("bk-status").textContent = COARSE ? "3D view: two fingers turn and zoom the view (or tap 🎥 Turn view), double-tap resets." : "3D view: drag with the mouse to look round the well, the wheel zooms, double-click resets."; }, function () {
				v3loading = false; S.view = "2d"; save(); setupUi(); $("bk-3d").hidden = true; toast("The 3D view could not load (no WebGL or offline).");
			});
		}
		layout();
	}

	/* ---------- the frame loop ---------- */
	function frame() {
		var t = now();
		padFrame();
		if (run.state === "count" && t >= run.goAt) {
			run.state = "play"; run.t0 = run.goAt; sfx("go"); setBeat(true);
		} else if (run.state === "count") {
			var cnt = Math.ceil((run.goAt - t) / 500);
			if (cnt !== run.lastCount) { run.lastCount = cnt; if (cnt > 0 && cnt <= 3) sfx("count"); }
		}
		if (run.state === "play" && run.g) {
			inputFrame();
			run.g.tick(gt()); drain();
			if (run.bot) botFrame();
			if (run.race && !run.bot) raceFrame();
		}
		if (run.race && !run.bot && run.state === "over") racePollOver();
		if (run.replay) replayFrame();
		draw();
	}
	function loop() { frame(); requestAnimationFrame(loop); }

	/* ---------- end of a game ---------- */
	function finish() {
		var g = run.g;
		run.state = "over"; resetInput(); setBeat(false);
		sfx(g.over === "top" ? "topout" : "done");
		if (run.race) { raceEnded(); return; }
		var st = S.stats;
		st.games++; st.lines += g.lines; st.pieces += g.pieces; st.quads += g.stats.quads; st.tspins += g.stats.tspins; st.ms += g.endMs;
		var newBest = "";
		var em = g.mode, ok = em === "s" ? g.over === "done" : em === "u" || em === "m";
		if (ok && em !== "z") {
			var list = S.best[em] || (S.best[em] = []), entry = { t: g.endMs, sc: g.score, l: g.lines, d: B.utcDate(), seed: g.seed };
			list.push(entry);
			list.sort(function (a, b) { return em === "s" ? a.t - b.t : b.sc - a.sc; });
			S.best[em] = list.slice(0, 10);
			if (S.best[em][0] === entry && list.length > 1) newBest = "New best!";
			if (run.daily && em === "s") { var prev = S.best.d[run.daily]; if (!prev || g.endMs < prev) S.best.d[run.daily] = g.endMs; }
		}
		run.rec = B.record(g, run.daily);
		S.last = run.rec ? { rec: run.rec, mode: run.mode } : null;
		save();
		after(newBest);
	}
	function after(newBest) {
		var g = run.g, box = $("bk-after"), em = g.mode;
		var title = em === "s" ? (g.over === "done" ? "40 lines in " + B.fmtTime(g.endMs) : "Topped out after " + g.lines + " lines") :
			em === "u" ? (g.over === "done" ? "Time! " + B.fmtNum(g.score) + " points" : "Topped out: " + B.fmtNum(g.score) + " points") :
			em === "m" ? (g.over === "done" ? "Marathon cleared! " + B.fmtNum(g.score) + " points" : "Game over: " + B.fmtNum(g.score) + " points") : "Game over";
		var h = "<h3>" + esc(title) + (newBest ? ' <span class="bk-new-best">' + newBest + "</span>" : "") + "</h3>";
		h += '<div class="bk-res"><span>Lines <b>' + g.lines + "</b></span><span>Pieces <b>" + g.pieces + "</b></span><span>Pieces/s <b>" + g.pps().toFixed(2) + "</b></span><span>Quads <b>" + g.stats.quads + "</b></span><span>T-spins <b>" + (g.stats.tspins + g.stats.minis) + "</b></span><span>Best combo <b>" + Math.max(0, g.stats.maxCombo) + "</b></span><span>Time <b>" + B.fmtTime(g.endMs) + "</b></span></div>";
		var rec = run.rec, btns = '<button type="button" class="tu-btn tu-btn--primary" data-a="again">▶ Play again</button><button type="button" class="tu-btn" data-a="replay">⟲ Watch replay</button><button type="button" class="tu-btn" data-a="copy">Copy result</button>';
		if (rec && rec.mv) btns += '<button type="button" class="tu-btn" data-a="hive">⬢ Save to Hive</button>';
		h += '<div class="bk-abtns">' + btns + "</div>";
		if (rec && !rec.mv) h += '<p class="tu-note">This game is too long to save every move to Hive, so it can not be checked for the leaderboard.</p>';
		else if (rec && em === "m" && rec.lv !== 1) h += '<p class="tu-note">The Marathon leaderboard ranks games started at level 1. You can still save this one.</p>';
		else if (em === "s" && g.over !== "done") h += "";
		h += '<div id="bk-hbox"></div>';
		box.innerHTML = h; box.hidden = false;
		box.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}
	$("bk-after").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"); if (!b) return;
		var a = b.getAttribute("data-a");
		if (a === "again") newGame({ mode: run.mode });
		else if (a === "replay") startReplay();
		else if (a === "copy") {
			var g = run.g, txt = "MES Falling Blocks " + (B.MODES[g.mode] || {}).name + (run.daily ? " (daily " + run.daily + ")" : "") + ": " + (g.mode === "s" ? B.fmtTime(g.endMs) : B.fmtNum(g.score) + " points") + ", " + g.lines + " lines, " + g.pps().toFixed(2) + " pieces/s. https://mes.fm/blocks";
			(navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Copied."); }, function () { toast(txt); });
		} else if (a === "hive") hiveBox();
	});

	/* ---------- replay ---------- */
	function startReplay(speed) {
		var src = run.g; if (!src) return;
		var g = new B.Game({ seed: src.seed, mode: src.mode, lv: src.lv0 });
		run.replay = { log: src.log.slice(), i: 0, t0: now(), speed: speed || 1, end: src.endMs, src: src };
		run.g = g; run.state = "replay"; run.msgs = []; run.flash = null;
		$("bk-status").innerHTML = 'Replay · <button type="button" class="tu-btn" data-rs="1">1×</button> <button type="button" class="tu-btn" data-rs="2">2×</button> <button type="button" class="tu-btn" data-rs="4">4×</button> <button type="button" class="tu-btn" data-rs="0">Stop</button>';
	}
	$("bk-status").addEventListener("click", function (e) {
		var b = e.target.closest("[data-rs]"); if (!b || !run.replay) return;
		var s = +b.getAttribute("data-rs");
		if (!s) { stopReplay(); return; }
		var rt = (now() - run.replay.t0) * run.replay.speed; run.replay.speed = s; run.replay.t0 = now() - rt / s;
	});
	function replayFrame() {
		var r = run.replay, g = run.g, rt = (now() - r.t0) * r.speed;
		while (r.i < r.log.length && r.log[r.i][1] <= rt) { g.act(r.log[r.i][0], r.log[r.i][1]); r.i++; }
		if (!g.over) g.tick(Math.min(rt, r.end + 1));
		drain2();
		if (g.over || rt > r.end + 1500) { run.state = "over"; var src = r.src; run.replay = null; setTimeout(function () { if (!run.replay && run.state === "over") { run.g = src; $("bk-status").textContent = "Replay finished."; } }, 1500); }
	}
	function drain2() { var g = run.g; var ev = g.ev; g.ev = []; ev.forEach(function (e) { if (e.k === "lock" && e.n) { run.flash = { rows: e.rows.map(function (q) { return q - B.HID; }).filter(function (q) { return q >= 0; }), t0: now() }; if (e.n >= 4 || e.ts) msg(B.clearName(e.n, e.ts), "", "#3bc9db"); } }); }
	function stopReplay() { if (!run.replay) return; var src = run.replay.src; run.replay = null; run.g = src; run.state = "over"; $("bk-status").textContent = "Replay stopped."; }

	/* ---------- race: the computer ---------- */
	function startBot() {
		var pps = +S.bot || 2;
		run.race = { bot: true, opp: { l: 0, s: 0, b: "" }, oppName: "Computer (" + pps + " pieces/s)", got: 0 };
		var seed = B.randomSeed();
		newGame({ mode: "r", engMode: "r", seed: seed, keepRace: true, countMs: 2400, status: "Race against the computer · seed " + seed });
		run.bot = { g: new B.Game({ seed: seed, mode: "r" }), pps: pps, next: 600, rnd: B.rng(seed + "|bot"), botGot: 0 };
		showTab("play");
	}
	function botFrame() {
		var bt = run.bot, g = bt.g, t = gt();
		g.tick(t);
		var guard = 0;
		while (!g.over && bt.next <= t && guard++ < 6) {
			var skill = Math.min(1, 0.55 + bt.pps * 0.1);
			var p = B.plan(g, skill, bt.rnd), at = bt.next;
			B.planActions(g, p).forEach(function (a) {
				if (typeof a === "string") { var x = +a.slice(1), n = 0; while (g.cur && g.cur.x !== x && n++ < 12) if (!g.act(g.cur.x < x ? 1 : 0, at)) break; }
				else g.act(a, at);
			});
			bt.next += 1000 / bt.pps * (0.75 + (bt.rnd() % 500) / 1000);
		}
		g.ev = [];
		// garbage both ways
		var me = run.g;
		if (me.sent > bt.botGot) { g.addGarbage(me.sent - bt.botGot); bt.botGot = me.sent; }
		if (g.sent > run.race.got) { me.addGarbage(g.sent - run.race.got); run.race.got = g.sent; }
		run.race.opp = { l: g.lines, s: g.sent, b: g.boardStr(), o: g.over === "top" ? 1 : 0 };
		if (g.over && run.state === "play") { run.race.result = g.over === "top" ? "win" : "lose"; run.g.end("done"); drain(); }
	}

	/* ---------- race: online ---------- */
	function stopRace(keep) {
		if (keep) return;
		if (run.race && !run.race.bot && run.race.id && run.state === "play") api("POST", { act: "leave", id: run.race.id, key: run.race.key, round: run.race.round });
		run.race = null; run.bot = null;
		clearInterval(waitTimer);
	}
	var waitTimer = null;
	$("bk-rnew").addEventListener("click", function () {
		S.name = $("bk-rname").value.trim().slice(0, 24); save();
		api("POST", { act: "new", name: S.name || "Guest", pub: $("bk-rpub").checked }).then(function (r) {
			if (!r.ok) return toast(r.error || "Could not start the race.");
			myRace(r); waitView(r.g);
			clearInterval(waitTimer);
			waitTimer = setInterval(function () {
				api("GET", null, { id: r.g.id }).then(function (x) { if (x.ok && x.g && x.g.status !== "wait") { clearInterval(waitTimer); raceGo(x.g); } });
			}, 1500);
		});
	});
	function myRace(r) { stopRace(); run.race = { id: r.g.id, key: r.key, seat: r.seat, round: r.g.round, opp: null, got: 0, oppName: "" }; try { sessionStorage.setItem("mes-blocks:race", JSON.stringify({ id: r.g.id, key: r.key, seat: r.seat })); } catch (e) {} }
	function raceLink(id) { return location.origin + "/blocks?race=" + id; }
	function waitView(g) {
		var w = $("bk-rwait"); w.hidden = false;
		w.innerHTML = '<div class="bk-wait"><p><b>Waiting for someone to join…</b> Send this link to a friend:</p><div class="bk-link"><input class="tu-input" readonly value="' + esc(raceLink(g.id)) + '" aria-label="Race link"><button type="button" class="tu-btn" data-w="copy">Copy link</button><button type="button" class="tu-btn" data-w="cancel">Cancel</button></div></div>';
	}
	$("bk-rwait").addEventListener("click", function (e) {
		var b = e.target.closest("[data-w]"); if (!b) return;
		if (b.getAttribute("data-w") === "copy") { var v = this.querySelector("input").value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast("Link copied."); }, function () { toast(v); }); }
		else { clearInterval(waitTimer); if (run.race) api("POST", { act: "cancel", id: run.race.id, key: run.race.key }); run.race = null; this.hidden = true; this.innerHTML = ""; loadLobby(); }
	});
	function joinRace(id) {
		S.name = ($("bk-rname").value || S.name || "").trim().slice(0, 24); save();
		api("POST", { act: "join", id: id, name: S.name || "Guest" }).then(function (r) {
			if (!r.ok) { toast(r.error || "Could not join."); loadLobby(); return; }
			myRace(r); raceGo(r.g);
		});
	}
	function raceGo(g) {
		var rc = run.race; if (!rc) return;
		$("bk-rwait").hidden = true; $("bk-rwait").innerHTML = "";
		rc.round = g.round; rc.got = 0; rc.opp = null; rc.result = null; rc.lastPost = 0; rc.busy = false; rc.oppName = g.names[1 - rc.seat] || "Opponent";
		var wait = Math.max(500, g.start - g.now);
		newGame({ mode: "r", engMode: "r", seed: g.seed, keepRace: true, countMs: wait, status: "Race against " + rc.oppName + " · first to 40 lines, or the last one standing" });
		showTab("play");
	}
	function raceFrame() {
		var rc = run.race; if (!rc || rc.busy) return;
		if (now() - (rc.lastPost || 0) < 600) return;
		postState();
	}
	/* after a race: watch for the other player's rematch (a new round) */
	function racePollOver() {
		var rc = run.race; if (rc.busy || now() - (rc.lastPoll || 0) < 2000) return;
		rc.busy = true; rc.lastPoll = now();
		api("GET", null, { id: rc.id }).then(function (r) {
			rc.busy = false;
			if (run.race !== rc || !r.ok || !r.g) return;
			if (r.g.round !== rc.round && r.g.status === "play") { $("bk-ov").hidden = true; raceGo(r.g); }
		});
	}
	function postState(fin) {
		var rc = run.race, g = run.g; if (!rc || !g) return;
		rc.busy = true; rc.lastPost = now();
		var st = { l: g.lines, s: g.sent, p: g.pieces, b: g.boardStr(), o: g.over === "top" ? 1 : 0, d: g.over === "done" && g.lines >= B.SPRINT_LINES ? 1 : 0, t: g.timeMs() };
		api("POST", { act: "up", id: rc.id, key: rc.key, round: rc.round, st: st }).then(function (r) {
			rc.busy = false;
			if (!r.ok || !r.g || run.race !== rc) return;
			var x = r.g;
			if (x.round !== rc.round) { if (x.status === "play") raceGo(x); return; }
			var os = x.st[1 - rc.seat];
			rc.opp = os;
			if (os && os.s > rc.got && run.state === "play") { g.addGarbage(os.s - rc.got); rc.got = os.s; }
			if (x.status === "over" && x.win) {
				rc.result = x.win.p === rc.seat ? "win" : "lose"; rc.why = x.win.why;
				if (run.state === "play") { g.end("done"); drain(); } else if (fin) raceEnded();
			}
		});
	}
	function raceEnded() {
		var rc = run.race; if (!rc) return;
		if (!rc.bot && !rc.result) { postState(true); setTimeout(function () { if (run.race === rc && !rc.result) pollResult(rc, 0); }, 700); }
		showRaceResult();
	}
	function pollResult(rc, n) {
		api("GET", null, { id: rc.id }).then(function (r) {
			if (run.race !== rc) return;
			if (r.ok && r.g && r.g.win) { rc.result = r.g.win.p === rc.seat ? "win" : "lose"; rc.why = r.g.win.why; rc.opp = r.g.st[1 - rc.seat]; showRaceResult(); }
			else if (n < 20) setTimeout(function () { pollResult(rc, n + 1); }, 1000);
		});
	}
	function showRaceResult() {
		var rc = run.race; if (!rc) return;
		var res = rc.result || (run.g.over === "top" ? "lose" : run.g.lines >= B.SPRINT_LINES ? "win" : "");
		var won = res === "win";
		var why = { topout: won ? "the other player topped out" : "you topped out", lines: won ? "you cleared 40 lines first" : "the other player cleared 40 lines first", left: won ? "the other player left" : "you left", timeout: won ? "the other player went quiet" : "you went quiet" }[rc.why] || "";
		var t = res === "win" ? '<b class="bk-win">You win!</b>' : res === "lose" ? '<b class="bk-lose">You lose</b>' : "<b>Race over</b>";
		showOv(t + "<p>" + esc(why) + (why ? " · " : "") + run.g.lines + " lines, " + run.g.sent + " sent</p>" +
			(rc.bot ? '<button type="button" class="bk-ovbtn" data-o="rematch">▶ Again</button>' : '<button type="button" class="bk-ovbtn" data-o="rematch">▶ Rematch</button>') + '<button type="button" class="bk-ovbtn bk-ovbtn--ghost" data-o="close">Close</button>');
	}
	function raceRematch() {
		var rc = run.race; $("bk-ov").hidden = true;
		if (!rc) return newGame();
		if (rc.bot) { startBot(); return; }
		api("POST", { act: "rematch", id: rc.id, key: rc.key, round: rc.round }).then(function (r) {
			if (!r.ok) return toast(r.error || "No rematch.");
			if (r.g.status === "play") raceGo(r.g);
		});
	}
	$("bk-rbot").addEventListener("click", function () { S.bot = $("bk-bot").value; save(); stopRace(); startBot(); });
	$("bk-rdaily").addEventListener("click", function () { stopRace(); S.md = "d"; save(); setupUi(); showTab("play"); newGame({ mode: "d" }); });
	$("bk-rlobby").addEventListener("click", loadLobby);
	function loadLobby() {
		api("GET", null, { lobby: 1 }).then(function (r) {
			var box = $("bk-lobby");
			if (!r.ok) { box.innerHTML = '<p class="bk-sub">' + esc(r.error || "Could not load the races.") + "</p>"; return; }
			var mine = run.race && run.race.id;
			var list = (r.open || []).filter(function (x) { return x.id !== mine; });
			box.innerHTML = list.length ? '<ul class="bk-lobby">' + list.map(function (x) { return "<li><span><b>" + esc(x.name) + "</b> <small>" + Math.max(1, Math.round(x.age / 60000)) + ' min ago</small></span><button type="button" class="tu-btn tu-btn--primary" data-j="' + esc(x.id) + '">Join</button></li>'; }).join("") + "</ul>" : '<p class="bk-sub">No open races right now. Start one and send the link, or race the computer.</p>';
		});
		api("GET", null, { daily: B.utcDate() }).then(function (r) { if (r.ok) $("bk-dcount").textContent = r.count ? r.count + " player" + (r.count === 1 ? " has" : "s have") + " a verified time today." : "Nobody has a verified time today yet."; });
	}
	$("bk-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-j]"); if (b) joinRace(b.getAttribute("data-j")); });

	/* ---------- Hive ---------- */
	var HV = window.MESHive || null;
	function me() { var u = HV && HV.user && HV.user(); return u ? u.name : (MOCK ? (sessionStorage.getItem("mes-blocks:mockacct") || "") : ""); }
	function avatar(n) { return HV && HV.avatar ? HV.avatar(n, "small") : "https://images.hive.blog/u/" + encodeURIComponent(n) + "/avatar/small"; }
	function loginHtml() {
		var u = me();
		if (u) return '<p class="bk-who">Signed in as ' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b> <button type="button" class="tu-btn" data-h="out">Log out</button></p>';
		return '<div class="bk-hrow"><input class="tu-input" data-h="user" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" data-h="in">Log in with Hive</button></div>' +
			'<p class="tu-note">' + (MOCK ? "Test copy: any username works here and nothing is signed." : "Hive Keychain (the extension or the phone app) proves you own the account by signing with your posting key. Your keys never leave Keychain.") + "</p>";
	}
	function wireLogin(box, done) {
		box.innerHTML = loginHtml();
		var out = box.querySelector('[data-h="out"]'), inb = box.querySelector('[data-h="in"]'), user = box.querySelector('[data-h="user"]');
		if (out) out.addEventListener("click", function () { if (MOCK && !(HV && HV.user && HV.user())) sessionStorage.removeItem("mes-blocks:mockacct"); else if (HV) HV.logout(); refreshLogins(); });
		if (inb) {
			var go = function () {
				var n = (user.value || "").trim().replace(/^@/, "").toLowerCase();
				if (MOCK) { if (!/^[a-z][a-z0-9.-]{2,15}$/.test(n)) return toast("That is not a Hive username."); sessionStorage.setItem("mes-blocks:mockacct", n); refreshLogins(); if (done) done(); return; }
				if (!HV) return toast("The Hive helpers did not load: reload the page.");
				inb.disabled = true; inb.textContent = "Check Keychain…";
				HV.login(n).then(function () { toast("Logged in."); refreshLogins(); if (done) done(); }, function (e) {
					inb.disabled = false; inb.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test((e.message || "") + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HV.helpHtml ? HV.helpHtml() : ""; box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			inb.addEventListener("click", go);
			user.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
		}
	}
	function refreshLogins() { wireLogin($("bk-hlogin")); if ($("bk-hbox") && $("bk-hbox").childNodes.length) hiveBox(); }
	if (HV && HV.onChange) HV.onChange(function () { refreshLogins(); });
	function hiveBox() {
		var box = $("bk-hbox"), rec = run.rec; if (!box || !rec) return;
		var u = me();
		box.innerHTML = '<p class="tu-note">Saves one public, permanent message (custom_json id <code>mes_blocks</code>) from your Hive account with the seed, your time, lines, score and every move. It uses only your posting key, through Keychain, and costs no HIVE.</p><div class="bk-hl"></div>';
		var hl = box.querySelector(".bk-hl");
		if (!u) { wireLogin(hl, hiveBox); return; }
		hl.innerHTML = '<p class="bk-who">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(u)) + '">') + "<b>@" + esc(u) + '</b></p><p><button type="button" class="tu-btn tu-btn--primary" data-h="send">Sign and save this game</button></p><p class="bk-sub" data-h="msg"></p>';
		hl.querySelector('[data-h="send"]').addEventListener("click", function () { sendHive(rec, u, this, hl.querySelector('[data-h="msg"]')); });
	}
	function sendHive(rec, u, btn, msgEl) {
		btn.disabled = true; msgEl.textContent = "Waiting for Keychain…";
		var json = B.json(rec);
		var what = rec.md === "s" ? B.fmtTime(rec.t) : B.fmtNum(rec.sc) + " points";
		var p = MOCK && !(HV && HV.user && HV.user()) ? Promise.resolve({ trx: "mock" + Date.now().toString(16) }) : (HV ? HV.keychain() : Promise.resolve(null)).then(function (kc) {
			if (!kc) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) {
				kc.requestCustomJson(u, B.ID, "Posting", json, "Save a Falling Blocks game (" + what + ")", function (r) {
					if (r && r.success) { var x = r.result || {}; ok({ trx: x.id || x.tx_id || x.trx_id || "" }); }
					else no(new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled in Keychain"));
				});
			});
		});
		p.then(function (res) {
			msgEl.innerHTML = "Saved on Hive" + (res.trx && !/^mock/.test(res.trx) ? ' (<a href="https://hivehub.dev/tx/' + esc(res.trx) + '" target="_blank" rel="noopener">transaction</a>)' : "") + ". Checking it for the leaderboard…";
			submit(u, res.trx, rec, msgEl, 0);
		}, function (e) {
			btn.disabled = false;
			msgEl.textContent = (e && e.message) || "Not saved.";
			if (e && e.code === "nokeychain" && HV && HV.helpHtml) { var d = document.createElement("div"); d.innerHTML = HV.helpHtml(); msgEl.appendChild(d); }
		});
	}
	function submit(u, trx, rec, msgEl, tries) {
		api("POST", { act: "submit", acct: u, trx: trx }, null, rec).then(function (r) {
			if (r.ok) msgEl.innerHTML = r.board ? "On the leaderboard: <b>#" + r.rank + "</b> of " + r.count + " (" + esc(boardName(r.board)) + ")." + (r.best === false ? " Your earlier result there was better, so it stays." : "") : "Checked and saved. " + esc(r.note || "");
			else if (r.code === 404 && tries < 8) { msgEl.textContent = "Waiting for the next Hive block… (" + (tries + 1) + ")"; setTimeout(function () { submit(u, trx, rec, msgEl, tries + 1); }, 3500); }
			else msgEl.textContent = "Saved on Hive, but not added to the leaderboard: " + String(r.error || "unknown problem").replace(/\.$/, "") + ".";
		});
	}
	function boardName(key) { return key[0] === "d" ? "daily race " + key.slice(2) : { s: "Sprint 40", u: "Ultra 2 min", m: "Marathon" }[key] || key; }

	/* ---------- leaderboard ---------- */
	$("bk-lbk").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.lbk = b.getAttribute("data-v"); save(); loadLb(); });
	$("bk-lbref").addEventListener("click", loadLb);
	function loadLb() {
		[].slice.call($("bk-lbk").querySelectorAll("button")).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S.lbk ? "true" : "false"); });
		var key = S.lbk === "d" ? "d:" + B.utcDate() : S.lbk, timeBoard = key[0] === "d" || key === "s";
		$("bk-lbnote").textContent = key[0] === "d" ? "Today's daily race (" + B.utcDate() + " UTC): Sprint 40 on everyone's same pieces. Fastest first." : timeBoard ? "Sprint 40 on any seed. Fastest first." : key === "u" ? "Ultra: most points in two minutes." : "Marathon from level 1: highest score.";
		$("bk-lb").innerHTML = '<p class="bk-sub">Loading…</p>';
		api("GET", null, { board: key, n: 50 }).then(function (r) {
			if (!r.ok) { $("bk-lb").innerHTML = '<p class="bk-sub">' + esc(r.error || "Could not load the leaderboard.") + "</p>"; return; }
			var top = r.top || [];
			if (!top.length) { $("bk-lb").innerHTML = '<p class="bk-sub">No results yet. Finish a game, press "Save to Hive", and yours can be the first.</p>'; return; }
			var u = me();
			$("bk-lb").innerHTML = '<table class="bk-tbl"><thead><tr><th>#</th><th>Player</th><th>' + (timeBoard ? "Time" : "Score") + "</th><th>" + (timeBoard ? "Pieces/s" : "Lines") + "</th><th>Proof</th></tr></thead><tbody>" +
				top.map(function (x, i) {
					return '<tr class="' + (x.acct === u ? "me" : "") + '"><td>' + (i + 1) + "</td><td>" + (MOCK ? "" : '<img alt="" loading="lazy" src="' + esc(avatar(x.acct)) + '">') + "@" + esc(x.acct) + "</td><td><b>" + (timeBoard ? B.fmtTime(x.t) : B.fmtNum(x.sc)) + "</b></td><td>" + (timeBoard ? (x.pc / (x.t / 1000)).toFixed(2) : x.l) + "</td><td>" +
						(x.trx && !/^mock/.test(x.trx) ? '<a href="https://hivehub.dev/tx/' + esc(x.trx) + '" target="_blank" rel="noopener">on Hive</a>' : "—") + "</td></tr>";
				}).join("") + "</tbody></table>" + (r.count > top.length ? '<p class="bk-sub">' + r.count + " players in all.</p>" : "");
		});
	}

	/* ---------- statistics ---------- */
	function renderStats() {
		var st = S.stats, b = S.best;
		function times(list) { return list && list.length ? "<ol>" + list.map(function (x) { return "<li>" + B.fmtTime(x.t) + " <small>" + esc(x.d) + "</small></li>"; }).join("") + "</ol>" : '<p class="bk-sub">None yet.</p>'; }
		function scores(list) { return list && list.length ? "<ol>" + list.map(function (x) { return "<li>" + B.fmtNum(x.sc) + " <small>" + x.l + " lines · " + esc(x.d) + "</small></li>"; }).join("") + "</ol>" : '<p class="bk-sub">None yet.</p>'; }
		var days = Object.keys(b.d || {}).sort().reverse().slice(0, 10);
		$("bk-stats").innerHTML = '<div class="bk-scards">' +
			'<div class="bk-scard"><h3>Totals</h3><p>Games: <b>' + st.games + "</b></p><p>Lines: <b>" + B.fmtNum(st.lines) + "</b></p><p>Pieces: <b>" + B.fmtNum(st.pieces) + "</b></p><p>Quads: <b>" + st.quads + "</b></p><p>T-spins: <b>" + st.tspins + "</b></p><p>Time played: <b>" + B.fmtTime(st.ms) + "</b></p></div>" +
			'<div class="bk-scard"><h3>Sprint 40: best times</h3>' + times(b.s) + "</div>" +
			'<div class="bk-scard"><h3>Ultra 2 min: best scores</h3>' + scores(b.u) + "</div>" +
			'<div class="bk-scard"><h3>Marathon: best scores</h3>' + scores(b.m) + "</div>" +
			'<div class="bk-scard"><h3>Daily races</h3>' + (days.length ? "<ol>" + days.map(function (d) { return "<li>" + esc(d) + ": " + B.fmtTime(b.d[d]) + "</li>"; }).join("") + "</ol>" : '<p class="bk-sub">None yet.</p>') + "</div></div>";
	}
	$("bk-sreset").addEventListener("click", function () { if (!confirm("Clear your statistics and best results in this browser?")) return; S.stats = { games: 0, lines: 0, pieces: 0, quads: 0, tspins: 0, ms: 0 }; S.best = { s: [], u: [], m: [], d: {} }; save(); renderStats(); });

	/* ---------- API (or the local stand-in) ---------- */
	function api(method, body, query, rec) {
		if (MOCK) return Promise.resolve(mockApi(method, body || {}, query || {}, rec));
		var url = "/api/blocks" + (query ? "?" + new URLSearchParams(query).toString() : "");
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(url, opt).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j.code = r.status; if (!r.ok && !j.error) j.error = "HTTP " + r.status; j.ok = r.ok && j.ok !== false; return j; });
		}, function () { return { ok: false, code: 0, error: "Could not reach mes.fm" }; });
	}
	var MK = "mes-blocks:mock";
	function mload() { try { return JSON.parse(localStorage.getItem(MK) || "{}"); } catch (e) { return {}; } }
	function msave(db) { try { localStorage.setItem(MK, JSON.stringify(db)); } catch (e) {} }
	function rid(n) { var s = "", a = "abcdefghjkmnpqrstuvwxyz23456789"; for (var i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
	function mpub(g) { var t = Date.now(); return { id: g.id, names: g.names, st: g.st, status: g.status, start: g.start, seed: g.seed, win: g.win, round: g.round, pub: g.pub, now: t, idle: t - g.at }; }
	function mockApi(method, b, q, rec) {
		var db = mload(); db.g = db.g || {}; db.lb = db.lb || {};
		var t = Date.now(), g;
		var blank = function () { return { l: 0, s: 0, p: 0, b: "", o: 0, d: 0, t: 0, at: 0 }; };
		if (method === "GET") {
			if (q.lobby) return { ok: true, open: Object.keys(db.g).map(function (k) { return db.g[k]; }).filter(function (x) { return x.status === "wait" && x.pub && t - x.created < 1800000; }).map(function (x) { return { id: x.id, name: x.names[0], age: t - x.created }; }) };
			if (q.id) { g = db.g[q.id]; return g ? { ok: true, g: mpub(g) } : { ok: false, code: 404, error: "Race not found." }; }
			if (q.daily) return { ok: true, count: (db.lb["d:" + q.daily] || []).length };
			var lst = db.lb[q.board] || [];
			return { ok: true, top: lst.slice(0, +q.n || 25), count: lst.length };
		}
		if (b.act === "submit") {
			var v = B.verify(rec);
			if (!v.ok) return { ok: false, code: 422, error: v.why };
			if (!v.board) return { ok: true, board: null, note: "Marathon games ranked only from level 1." };
			var L2 = db.lb[v.board] || (db.lb[v.board] = []), old = L2.filter(function (x) { return x.acct === b.acct; })[0], best = !old || v.rank < old.rank;
			if (best) { db.lb[v.board] = L2 = L2.filter(function (x) { return x.acct !== b.acct; }); L2.push({ acct: b.acct, t: v.t, sc: v.sc, l: v.l, pc: v.pc, rank: v.rank, trx: b.trx, ts: t }); L2.sort(function (x, y) { return x.rank - y.rank; }); }
			msave(db);
			return { ok: true, board: v.board, rank: 1 + L2.findIndex(function (x) { return x.acct === b.acct; }), count: L2.length, best: best };
		}
		if (b.act === "new") {
			var key = rid(24), id = rid(8);
			g = db.g[id] = { id: id, names: [b.name || "Guest", null], tok: [key, null], st: [blank(), blank()], status: "wait", start: 0, seed: "r" + rid(10), win: null, round: 0, pub: b.pub !== false, created: t, at: t };
			msave(db); return { ok: true, g: mpub(g), key: key, seat: 0 };
		}
		g = db.g[b.id]; if (!g) return { ok: false, code: 404, error: "Race not found (it may have expired)." };
		if (b.act === "join") {
			if (g.status !== "wait") return { ok: false, code: 409, error: "Someone else already joined that race." };
			var k2 = rid(24); g.tok[1] = k2; g.names[1] = b.name || "Guest"; g.status = "play"; g.start = t + 4000; g.seed = "r" + rid(10); g.at = t; g.st = [blank(), blank()];
			msave(db); return { ok: true, g: mpub(g), key: k2, seat: 1 };
		}
		var seat = g.tok.indexOf(b.key); if (seat < 0) return { ok: false, code: 403, error: "That isn't your race." };
		var stale = b.round != null && +b.round !== g.round;
		if (b.act === "up") {
			if (!stale && g.status === "play" && b.st) {
				var s = b.st; s.at = t; g.st[seat] = s; g.at = t;
				if (!g.win) { if (s.o) g.win = { p: 1 - seat, why: "topout" }; else if (s.d) g.win = { p: seat, why: "lines" }; if (g.win) g.status = "over"; }
				msave(db);
			}
			return { ok: true, g: mpub(g) };
		}
		if (b.act === "leave") { if (g.status === "play" && !stale) { g.status = "over"; g.win = { p: 1 - seat, why: "left" }; } msave(db); return { ok: true, g: mpub(g) }; }
		if (b.act === "rematch") {
			if (stale) return { ok: true, g: mpub(g) };
			if (g.status !== "over") return { ok: false, code: 409, error: "Finish this race first." };
			g.round++; g.status = "play"; g.win = null; g.seed = "r" + rid(10); g.start = t + 4000; g.at = t; g.st = [blank(), blank()];
			msave(db); return { ok: true, g: mpub(g) };
		}
		if (b.act === "cancel") { delete db.g[b.id]; msave(db); return { ok: true }; }
		return { ok: false, code: 400, error: "Unknown action." };
	}

	/* ---------- start ---------- */
	lvOptions(); setupUi(); camUi();
	wireLogin($("bk-hlogin"));
	function addPanel() { if (window.MESPanel && !view.__mesPanel) window.MESPanel.add(view, { bar: $("bk-vbar"), stage: stage, onChange: function () { setTimeout(layout, 40); } }); }
	if (window.MESPanel) addPanel(); else window.addEventListener("load", addPanel);
	layout();
	run.g = new B.Game({ seed: "preview", mode: "m" }); run.state = "idle";
	showOv("<b>MES Falling Blocks</b><p>" + (COARSE ? "Drag to move, tap to turn, flick down to drop." : "← → move, ↑ turns, Space drops, C holds.") + "</p><button type=\"button\" class=\"bk-ovbtn\" data-o=\"new\">▶ Play</button>");
	if (S.view === "3d") setView("3d");
	(function joinFromLink() {
		var id = new URLSearchParams(location.search).get("race");
		if (id && /^[a-z0-9]{8}$/.test(id)) { showTab("race"); setTimeout(function () { joinRace(id); }, 200); }
	})();
	requestAnimationFrame(loop);
	window.MESBlocksDebug = { get game() { return run.g; }, run: run, S: S, step: function (ms) { var end = now() + (ms || 16); frame(); return end; }, frame: frame, newGame: newGame, press: press, release: release, startBot: startBot };
})();
