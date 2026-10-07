/* MES Timer 3.0 -- mes.fm/timer and its family pages (countdown-timer, stopwatch, alarm-clock, pomodoro-timer, interval-timer, countdown-to-date).
 * ONE script for all of them: <div id="tm" data-views="cd,sw,al" data-customize="1"> decides which panels the page shows. /timer shows countdown + stopwatch + alarm
 * together by default (and lets you add Pomodoro, Interval and Date countdown); the other pages show one panel, big.
 * All timing is from Date.now() timestamps (a background tab, reload or throttled interval never drifts). State: localStorage "mes-timer:v1". Helpers: lib.js (TM).
 * Links: ?t=25m&label=Focus&start=1 (countdown), ?date=2026-12-25&name=Christmas (date countdown), ?show=cd,sw,po (which panels).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tm");
	if (!root || !window.TM) return;
	var KEY = "mes-timer:v1", BASE_TITLE = document.title, memOnly = false;
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
	var PRESETS = [["30s", 30000], ["1m", 60000], ["2m", 120000], ["5m", 300000], ["10m", 600000], ["15m", 900000], ["20m", 1200000], ["25m", 1500000], ["30m", 1800000], ["45m", 2700000], ["1h", 3600000]];
	var PANELS = { cd: ["Countdown Timer", "/countdown-timer"], sw: ["Stopwatch", "/stopwatch"], al: ["Alarm Clock", "/alarm-clock"], po: ["Pomodoro", "/pomodoro-timer"], iv: ["Interval Timer", "/interval-timer"], ev: ["Countdown to a Date", "/countdown-to-date"] };
	var ORDER = ["cd", "sw", "al", "po", "iv", "ev"];
	var PAGE_VIEWS = (root.dataset.views || "cd,sw,al").split(",").filter(function (v) { return PANELS[v]; });
	var CUSTOM = root.dataset.customize === "1", SOLO = PAGE_VIEWS.length === 1;

	/* ---------- state ---------- */
	function newTimer(total) { return { id: uid(), label: "", total: total || 300000, rem: total || 300000, end: 0, st: "idle" }; }
	function newSw() { return { id: uid(), label: "", st: "idle", startAt: 0, base: 0, laps: [] }; }
	function newAlarm() { return { id: uid(), time: "", label: "", daily: false, cd: false, on: false, at: 0, snooze: 0 }; }
	var S = {
		show: ["cd", "sw", "al"], display: null, order: ["cd", "sw", "al", "po", "iv", "ev"], layout: "auto", zoom: 1, fit: false, win: false, nobar: false, fs: "win", collapsed: {}, sound: "friendly", vol: 80, repeat: 1, optTitle: true, titleSrc: "auto", optAwake: true, optNotify: false, optTenths: false,
		timers: [newTimer(300000)], sws: [newSw()], alarms: [newAlarm()],
		po: { label: "", focus: 25, short: 5, long: 15, rounds: 4, auto: true, phase: "focus", round: 1, st: "idle", end: 0, rem: 25 * 60000, day: "", done: 0 },
		iv: { label: "", prep: 10, work: 20, rest: 10, rounds: 8, st: "idle", startAt: 0, base: 0 },
		ev: []
	};
	var missed = [];
	function num(v, d, lo, hi) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
	function load() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (!s) return;
			if (typeof s.sound === "string") S.sound = s.sound;
			S.vol = num(s.vol, 80, 0, 100); if (s.repeat === 0 || s.repeat === 1 || s.repeat === 3) S.repeat = s.repeat;
			["optTitle", "optAwake", "optNotify", "optTenths"].forEach(function (k) { if (typeof s[k] === "boolean") S[k] = s[k]; });
			if (Array.isArray(s.show)) S.show = s.show.filter(function (v) { return PANELS[v]; });
			if (Array.isArray(s.order)) { var o = s.order.filter(function (v) { return PANELS[v]; }); ORDER.forEach(function (v) { if (o.indexOf(v) < 0) o.push(v); }); S.order = o; }
			S.layout = s.layout === "stack" ? "stack" : "auto";
			S.zoom = num(s.zoom, 1, 0.4, 2.5); S.fit = !!s.fit; S.win = !!s.win; S.nobar = !!s.nobar; if (s.fs === "screen") S.fs = "screen";
			if (s.collapsed && typeof s.collapsed === "object") S.collapsed = s.collapsed;
			if (Array.isArray(s.display)) S.display = s.display.filter(function (k) { return typeof k === "string"; }).slice(0, 60);
			if (Array.isArray(s.timers) && s.timers.length) S.timers = s.timers.slice(0, 8).map(function (t) { return { id: String(t.id || uid()), label: String(t.label || "").slice(0, 60), total: +t.total > 0 ? +t.total : 300000, rem: +t.rem >= 0 ? +t.rem : (+t.total || 300000), end: +t.end || 0, st: /^(idle|run|pause|done)$/.test(t.st) ? t.st : "idle" }; });
			var swl = Array.isArray(s.sws) ? s.sws : (s.sw && typeof s.sw === "object" ? [s.sw] : []);
			if (swl.length) S.sws = swl.slice(0, 6).map(function (w) { return { id: String(w.id || uid()), label: String(w.label || "").slice(0, 60), st: /^(idle|run|pause)$/.test(w.st) ? w.st : "idle", startAt: +w.startAt || 0, base: +w.base || 0, laps: Array.isArray(w.laps) ? w.laps.map(Number).filter(isFinite).slice(0, 500) : [] }; });
			var al = Array.isArray(s.alarms) ? s.alarms : (s.al && typeof s.al === "object" ? [s.al] : []);
			if (al.length) S.alarms = al.slice(0, 6).map(function (a) { return { id: String(a.id || uid()), time: String(a.time || ""), label: String(a.label || "").slice(0, 60), daily: !!a.daily, cd: !!a.cd, on: !!a.on, at: +a.at || 0, snooze: +a.snooze || 0 }; });
			if (s.po && typeof s.po === "object") { var p = s.po; S.po = { label: String(p.label || "").slice(0, 60), focus: num(p.focus, 25, 1, 180), short: num(p.short, 5, 1, 60), long: num(p.long, 15, 1, 90), rounds: Math.round(num(p.rounds, 4, 1, 12)), auto: p.auto !== false, phase: /^(focus|short|long)$/.test(p.phase) ? p.phase : "focus", round: Math.round(num(p.round, 1, 1, 12)), st: /^(idle|run|pause)$/.test(p.st) ? p.st : "idle", end: +p.end || 0, rem: +p.rem > 0 ? +p.rem : 25 * 60000, day: String(p.day || ""), done: Math.round(num(p.done, 0, 0, 999)) }; }
			if (s.iv && typeof s.iv === "object") { var v = s.iv; S.iv = { label: String(v.label || "").slice(0, 60), prep: num(v.prep, 10, 0, 120), work: num(v.work, 20, 1, 3600), rest: num(v.rest, 10, 0, 3600), rounds: Math.round(num(v.rounds, 8, 1, 99)), st: /^(idle|run|pause)$/.test(v.st) ? v.st : "idle", startAt: +v.startAt || 0, base: +v.base || 0 }; }
			if (Array.isArray(s.ev)) S.ev = s.ev.slice(0, 12).map(function (e) { return { id: String(e.id || uid()), name: String(e.name || "").slice(0, 60), at: +e.at || 0 }; }).filter(function (e) { return e.at; });
		} catch (e) { memOnly = true; }
		var now = Date.now();
		S.timers.forEach(function (t) { if (t.st === "run" && t.end <= now) { t.st = "done"; t.rem = 0; missed.push((t.label || "Timer") + " finished at " + new Date(t.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); } });
		S.alarms.forEach(function (a) {
			if (a.on && a.at && a.at <= now && !(a.snooze > now)) { missed.push("The alarm" + (a.label ? " “" + a.label + "”" : "") + " for " + a.time + " went off"); if (a.daily) a.at = TM.nextAlarm(a.time, new Date()); else { a.on = false; a.at = 0; } }
		});
		if (S.po.st === "run" && S.po.end <= now) { S.po.st = "pause"; S.po.rem = 0; missed.push("A Pomodoro phase ended"); }
		if (S.po.day !== today()) { S.po.day = today(); S.po.done = 0; }
	}
	function today() { var d = new Date(); return d.getFullYear() + "-" + TM.pad(d.getMonth() + 1) + "-" + TM.pad(d.getDate()); }
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(S, function (k, v) { return k === "titleSrc" ? undefined : v; })); memOnly = false; } catch (e) { memOnly = true; }
		var n = $("tm-store-note"); if (n) n.textContent = memOnly ? "Your browser is blocking storage, so timers will not survive a reload." : "Your timers and settings are saved in this browser.";
	}
	function toast(msg) {
		var t = $("tm-toast"); if (!t) { t = document.createElement("div"); t.id = "tm-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200);
	}
	function copyText(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}

	/* ---------- sound ---------- */
	var snd = { ctx: null, audio: {}, loopT: null, left: 0, active: false };
	function unlock() {
		try { if (!snd.ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) snd.ctx = new AC(); } if (snd.ctx && snd.ctx.state === "suspended") snd.ctx.resume(); } catch (e) {}
		if (!snd.audio.friendly) { snd.audio.friendly = new Audio("/timer/audio/grandfather_alarm_clock.mp3"); snd.audio.annoying = new Audio("/timer/audio/annoying_alarm_clock.mp3"); snd.audio.friendly.preload = snd.audio.annoying.preload = "auto"; }
	}
	function vol() { return Math.max(0, Math.min(1, S.vol / 100)); }
	function tone(freq, start, dur, type, peak) {
		var c = snd.ctx; if (!c || S.sound === "off") return;
		var o = c.createOscillator(), g = c.createGain(); o.type = type || "sine"; o.frequency.value = freq;
		g.gain.setValueAtTime(0.0001, c.currentTime + start); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (peak || 0.5) * vol()), c.currentTime + start + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
		o.connect(g); g.connect(c.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
	}
	function cue(freq, dur) { unlock(); tone(freq, 0, dur || 0.18, "sine", 0.5); }   // short cue beeps (interval timer, pomodoro phase change)
	function playOnce(kind) {
		unlock();
		if (kind === "off") return 0;
		if (kind === "beep") { for (var i = 0; i < 3; i++) tone(880, i * 0.28, 0.16, "square", 0.25); return 1300; }
		if (kind === "chime") { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, i * 0.32, 1.2, "sine", 0.45); }); return 2600; }
		var a = snd.audio[kind]; if (!a) return 0;
		try { a.volume = vol(); a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
		return (isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : 6000) + 400;
	}
	function startRing(count) {
		stopSound(); if (S.sound === "off") return; snd.active = true; snd.left = count;
		(function next() {
			if (!snd.active) return; var ms = playOnce(S.sound);
			if (snd.left > 0) snd.left--; if (snd.left === 0 && count !== 0) { snd.loopT = setTimeout(function () { snd.active = false; }, ms); return; }
			snd.loopT = setTimeout(next, Math.max(800, ms));
		})();
	}
	function stopSound() { snd.active = false; clearTimeout(snd.loopT); ["friendly", "annoying"].forEach(function (k) { if (snd.audio[k]) { try { snd.audio[k].pause(); snd.audio[k].currentTime = 0; } catch (e) {} } }); }

	/* ---------- ringing banner ---------- */
	var ringing = [], blinkT = null;     // items: {type: "t"|"a"|"p"|"i", id}
	function findTimer(id) { for (var i = 0; i < S.timers.length; i++) if (S.timers[i].id === id) return S.timers[i]; return null; }
	function findAlarm(id) { for (var i = 0; i < S.alarms.length; i++) if (S.alarms[i].id === id) return S.alarms[i]; return null; }
	function notify(title) { if (!S.optNotify || !("Notification" in window) || Notification.permission !== "granted") return; try { new Notification(title, { body: "mes.fm/timer", tag: "mes-timer" }); } catch (e) {} }
	function ring(item, msg) {
		ringing.push(item); item.msg = msg; notify("⏰ " + msg); startRing(S.repeat); drawRing();
		if (!blinkT) blinkT = setInterval(function () { document.title = document.title.charAt(0) === "⏰" ? BASE_TITLE : "⏰ " + (ringing[0] ? ringing[0].msg : "Time's up!"); }, 800);
	}
	function drawRing() {
		var box = $("tm-ring"); box.hidden = !ringing.length; box.style.animation = "";
		var dr = $("tm-dp-ring"); if (dr) dr.hidden = !ringing.length;
		if (!ringing.length) { clearInterval(blinkT); blinkT = null; lastTitle = ""; updateTitle(); return; }
		$("tm-ring-msg").innerHTML = "⏰ " + esc(ringing.map(function (r) { return r.msg; }).join(" · "));
		var hasAlarm = ringing.some(function (r) { return r.type === "a"; }), hasTimer = ringing.some(function (r) { return r.type === "t"; });
		if (dr) { dr.firstChild.innerHTML = "⏰ " + esc(ringing.map(function (r) { return r.msg; }).join(" · ")); dr.lastChild.innerHTML = '<button type="button" data-r="stop">Stop</button>' + (hasAlarm ? '<button type="button" data-r="snooze5">Snooze 5 min</button><button type="button" data-r="snooze10">Snooze 10 min</button>' : "") + (hasTimer ? '<button type="button" data-r="add1">+1 min</button><button type="button" data-r="add5">+5 min</button>' : ""); }
		$("tm-ring-btns").innerHTML = '<button type="button" data-r="stop">Stop</button>' + (hasAlarm ? '<button type="button" class="alt" data-r="snooze5">Snooze 5 min</button><button type="button" class="alt" data-r="snooze10">Snooze 10 min</button>' : "") + (hasTimer ? '<button type="button" class="alt" data-r="add1">+1 min</button><button type="button" class="alt" data-r="add5">+5 min</button>' : "");
	}
	function ringAct(a) {
		var now = Date.now(); stopSound();
		ringing.forEach(function (r) {
			if (r.type === "t") { var t = findTimer(r.id); if (t && (a === "add1" || a === "add5")) { var ms = a === "add1" ? 60000 : 300000; t.st = "run"; t.total = ms; t.end = now + ms; } }
			else if (r.type === "a") { var al = findAlarm(r.id); if (al && (a === "snooze5" || a === "snooze10")) { al.snooze = now + (a === "snooze5" ? 300000 : 600000); al.on = true; if (!al.at || al.at < now) al.at = al.snooze; } }
		});
		ringing = []; drawRing(); renderTimers(); renderAlarms(); save();
	}
	$("tm-ring-btns").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) ringAct(b.dataset.r); });

	/* ================= panels ================= */
	var BODY = {
		cd: '<div id="tm-timers"></div><div class="tm-btns"><button type="button" class="tu-btn tu-btn--ghost" id="tm-add">+ Add another timer</button></div><p class="tu-note">Type a time such as <code>25</code>, <code>1h 30m</code> or <code>2:30</code>, or press a preset. <kbd>Space</kbd> starts or pauses the first timer.</p>',
		sw: '<div id="tm-sws"></div><div class="tm-btns"><button type="button" class="tu-btn tu-btn--ghost" id="tm-sw-add">+ Add another stopwatch</button></div><p class="tu-note"><kbd>Space</kbd> starts or pauses the first stopwatch &middot; <kbd>L</kbd> records a lap &middot; they keep counting if you reload the page.</p>',
		al: '<div class="tm-face tm-face--al" id="tm-al-now" aria-live="off">--:--:--</div><div id="tm-alarms"></div><div class="tm-btns tm-btns--center"><button type="button" class="tu-btn tu-btn--ghost" id="tm-al-add">+ Add another alarm</button></div><div class="tm-volrow"><label for="tm-al-vol">🔔 Alarm volume</label><input id="tm-al-vol" type="range" min="0" max="100" step="5" aria-label="Alarm volume"><button type="button" class="tu-btn tu-btn--ghost" id="tm-al-test">▶ Test</button></div><p class="tu-note"><b>Keep this page open.</b> The alarm rings from your browser, so the tab has to stay open (a background tab is fine) and your computer awake. On a phone, a countdown timer with the screen kept awake is more reliable.</p>',
		po: '<div class="tm-solo-label"><input class="tm-label" id="tm-po-label" type="text" maxlength="60" autocomplete="off" placeholder="What are you working on? (label)" aria-label="Pomodoro label"></div><div class="tm-po-tabs" id="tm-po-tabs" role="group" aria-label="Pomodoro phase"><button type="button" data-p="focus">Focus</button><button type="button" data-p="short">Short break</button><button type="button" data-p="long">Long break</button></div><div class="tm-face" id="tm-po-face">25:00</div><div class="tm-bar"><i id="tm-po-bar"></i></div><p class="tm-status" id="tm-po-info"></p><div class="tm-btns tm-btns--center"><button type="button" class="tu-btn tu-btn--primary tm-big" id="tm-po-go">Start</button><button type="button" class="tu-btn tm-big" id="tm-po-skip">Skip</button><button type="button" class="tu-btn tu-btn--ghost tm-big" id="tm-po-reset">Reset</button><button type="button" class="tu-btn tu-btn--ghost tm-big tm-hide-fs" data-fs-for="po">⤢ Full screen</button></div><div class="tm-po-set tm-hide-fs"><label>Focus <input class="tu-input" data-po="focus" type="text" inputmode="numeric"> min</label><label>Short break <input class="tu-input" data-po="short" type="text" inputmode="numeric"> min</label><label>Long break <input class="tu-input" data-po="long" type="text" inputmode="numeric"> min</label><label>Rounds <input class="tu-input" data-po="rounds" type="text" inputmode="numeric"></label><label class="tm-check"><input type="checkbox" data-po="auto"> Start the next phase automatically</label></div><p class="tu-note tm-hide-fs">The Pomodoro technique: work in focused 25-minute blocks, take a short break after each, and a longer one after four.</p>',
		iv: '<div class="tm-solo-label"><input class="tm-label" id="tm-iv-label" type="text" maxlength="60" autocomplete="off" placeholder="Workout name (label)" aria-label="Interval label"></div><div class="tm-presets" id="tm-iv-presets"></div><div class="tm-iv-face" id="tm-iv-box" data-phase="idle"><div class="tm-iv-phase" id="tm-iv-phase">Ready</div><div class="tm-face" id="tm-iv-face">00:00</div><div class="tm-iv-info" id="tm-iv-info"></div></div><div class="tm-bar"><i id="tm-iv-bar"></i></div><div class="tm-btns tm-btns--center"><button type="button" class="tu-btn tu-btn--primary tm-big" id="tm-iv-go">Start</button><button type="button" class="tu-btn tu-btn--ghost tm-big" id="tm-iv-reset">Reset</button><button type="button" class="tu-btn tu-btn--ghost tm-big tm-hide-fs" data-fs-for="iv">⤢ Full screen</button></div><div class="tm-po-set tm-hide-fs"><label>Get ready <input class="tu-input" data-iv="prep" type="text" inputmode="numeric"> s</label><label>Work <input class="tu-input" data-iv="work" type="text" inputmode="numeric"> s</label><label>Rest <input class="tu-input" data-iv="rest" type="text" inputmode="numeric"> s</label><label>Rounds <input class="tu-input" data-iv="rounds" type="text" inputmode="numeric"></label></div><p class="tu-note tm-hide-fs" id="tm-iv-total"></p>',
		ev: '<div class="tm-ev-form"><div class="tu-field" style="flex:2 1 12em;"><label for="tm-ev-name">What are you counting down to?</label><input id="tm-ev-name" class="tu-input" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Christmas, exam, holiday"></div><div class="tu-field" style="flex:1 1 10em;"><label for="tm-ev-date">Date</label><input id="tm-ev-date" class="tu-input" type="date"></div><div class="tu-field" style="flex:0 1 8em;"><label for="tm-ev-time">Time (optional)</label><input id="tm-ev-time" class="tu-input" type="time"></div><div class="tu-field" style="flex:0 0 auto;"><button type="button" class="tu-btn tu-btn--primary" id="tm-ev-add">+ Add</button></div></div><div class="tm-chips-ev tu-chips" id="tm-ev-quick" style="margin:0.4em 0 0.8em;"></div><div id="tm-events"></div>'
	};
	var visible = [];
	function chosen() { return CUSTOM ? S.order.filter(function (v) { return S.show.indexOf(v) >= 0; }) : PAGE_VIEWS; }
	function buildPanels() {
		visible = chosen(); if (!visible.length) visible = ["cd"];
		$("tm-secs").className = "tm-secs" + (SOLO ? " tm-solo" : "") + " tm-n" + visible.length + (!SOLO && S.layout !== "stack" ? " tm-row" : "");
		$("tm-secs").innerHTML = visible.map(function (v) {
			var col = !SOLO && S.collapsed[v];
			return '<section class="tu-card tm-sec' + (col ? " is-collapsed" : "") + '" data-v="' + v + '" id="tm-s-' + v + '">' + (SOLO ? "" : '<div class="tm-sec__h">' + (CUSTOM && visible.length > 1 ? '<button type="button" class="tm-grip" title="Drag to move this timer" aria-label="Move ' + PANELS[v][0] + ': drag, or use the arrow keys" data-grip="sec">⠿</button>' : "") + '<button type="button" class="tm-sec__t" aria-expanded="' + !col + '">' + PANELS[v][0] + '</button><a class="tm-sec__l" href="' + PANELS[v][1] + '" title="Open ' + PANELS[v][0] + ' on its own page">Full page ↗</a></div>') + '<div class="tm-sec__b tm-fsable" id="tm-b-' + v + '" data-v="' + v + '">' + BODY[v] + "</div></section>";
		}).join("");
		drawAddBar(); applyZoom();
		bindPanels(); renderAll(); scheduleFit();
	}
	function toolsHtml() {
		return '<button type="button" class="tu-btn tu-btn--ghost tm-dpbtn" data-dp="1" title="Show just the times, big (D)">📺 Display</button>' +
			(winOn ? '<button type="button" class="tu-btn tu-btn--ghost" data-nobar="1" title="Hide this menu bar to save space (M). A small Menu button stays in the corner.">▲ Hide menu</button>' : "") + '<button type="button" class="tu-btn tu-btn--ghost" data-win="1" aria-pressed="' + winOn + '" title="Hide the rest of the page and fill the browser window with just the timers (W)">' + (winOn ? "✕ Exit window view" : "⤢ Window view") + '</button>' +
			'<span class="tm-size" role="group" aria-label="Size of the timers"><button type="button" data-z="-" title="Smaller (-)" aria-label="Smaller">−</button><button type="button" class="tm-zl" data-z="0" title="Back to 100% (0)">' + Math.round(S.zoom * 100) + '%</button><button type="button" data-z="+" title="Bigger (+)" aria-label="Bigger">+</button><button type="button" data-z="fit" aria-pressed="' + S.fit + '" title="Fit every timer into the window and keep it fitted as the window changes">⤡ Fit</button></span>';
	}
	function drawAddBar() {
		var bar = $("tm-addbar"); bar.hidden = false;
		if (!CUSTOM || SOLO) { bar.innerHTML = '<span class="tm-addbar__sp"></span>' + toolsHtml(); return; }
		bar.innerHTML = '<span class="tm-addbar__l">Show:</span>' + ORDER.map(function (v) { var on = visible.indexOf(v) >= 0; return '<button type="button" class="tu-chip" data-v="' + v + '" aria-pressed="' + on + '">' + (on ? "✓ " : "+ ") + PANELS[v][0] + "</button>"; }).join("") + '<span class="tm-addbar__sp"></span>' + toolsHtml() + '<span class="tm-addbar__l">Layout:</span><span class="tu-seg tm-lay" role="group" aria-label="Layout"><button type="button" data-l="auto" aria-pressed="' + (S.layout !== "stack") + '" title="As many side by side as fit the window">▥ Auto</button><button type="button" data-l="stack" aria-pressed="' + (S.layout === "stack") + '" title="One under the other">☰ Stacked</button></span>';
	}
	/* ---- size, fit and window view ---- */
	var winOn = false, fitLastH = 0, fitT = 0, zSaveT = 0;
	function applyZoom() { var sc = $("tm-secs"); if (sc) sc.style.fontSize = S.zoom === 1 ? "" : S.zoom + "em"; [].forEach.call(document.querySelectorAll(".tm-zl"), function (l) { l.textContent = Math.round(S.zoom * 100) + "%"; }); [].forEach.call(document.querySelectorAll('[data-z="fit"]'), function (b) { b.setAttribute("aria-pressed", String(S.fit)); }); }
	function setZoom(z, keepFit) { S.zoom = Math.round(Math.max(0.4, Math.min(2.5, z)) * 100) / 100; if (!keepFit) S.fit = false; applyZoom(); clearTimeout(zSaveT); zSaveT = setTimeout(save, 300); }
	function fitNow() {
		var box = $("tm"), sc = $("tm-secs"); if (!winOn || !box || !sc) return;
		function ok(z) { sc.style.fontSize = z + "em"; return box.scrollHeight <= box.clientHeight + 1; }
		var lo = 0.4, hi = 2.5, best = 0.4;
		if (ok(hi)) best = hi; else { for (var i = 0; i < 14; i++) { var mid = (lo + hi) / 2; if (ok(mid)) { lo = mid; best = mid; } else hi = mid; } }
		setZoom(best, true); fitLastH = sc.offsetHeight;
	}
	function scheduleFit() { if (!S.fit || !winOn) return; clearTimeout(fitT); fitT = setTimeout(fitNow, 200); }
	window.addEventListener("resize", scheduleFit);
	if (window.MutationObserver) new MutationObserver(function () { if (S.fit && winOn && Math.abs($("tm-secs").offsetHeight - fitLastH) > 2) scheduleFit(); }).observe($("tm-secs"), { childList: true, subtree: true });
	function applyBar() { document.body.classList.toggle("tm-nobar", winOn && S.nobar); }
	function setBar(hide) { S.nobar = hide; applyBar(); save(); scheduleFit(); }
	(function () { var b = document.createElement("button"); b.type = "button"; b.id = "tm-barbtn"; b.textContent = "☰ Menu"; b.title = "Show the menu bar (M)"; b.onclick = function () { setBar(false); }; $("tm").appendChild(b); })();
	function setWin(on) {
		winOn = on; S.win = on; document.body.classList.toggle("tm-win", on); applyBar(); drawAddBar(); save();
		if (on) { $("tm").scrollTop = 0; if (S.fit) fitNow(); }
	}
	(function sizeGestures() {
		var box = $("tm"), grip = document.createElement("div"); grip.id = "tm-grip"; grip.title = "Drag to resize the TIMERS (not the browser window): up-left smaller, down-right bigger. Pinching or Ctrl+scroll also works."; grip.setAttribute("aria-hidden", "true");
		grip.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg><span class="tm-grip__t">Drag to resize timers · <span class="tm-zl">' + Math.round(S.zoom * 100) + '%</span></span>'; box.appendChild(grip);
		grip.addEventListener("pointerdown", function (e) {
			e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch (x) {}
			var x0 = e.clientX, y0 = e.clientY, z0 = S.zoom;
			function mv(ev) { setZoom(z0 * Math.exp(((ev.clientX - x0) + (ev.clientY - y0)) / 500)); }
			function up() { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up); }
			grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
		});
		var pts = {}, pd = 0, pz = 1;
		function dist() { var k = Object.keys(pts); if (k.length < 2) return 0; var a = pts[k[0]], b = pts[k[1]]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }
		box.addEventListener("pointerdown", function (e) { if (!winOn || e.pointerType !== "touch") return; pts[e.pointerId] = [e.clientX, e.clientY]; if (Object.keys(pts).length === 2) { pd = dist(); pz = S.zoom; } });
		box.addEventListener("pointermove", function (e) { if (!pts[e.pointerId]) return; pts[e.pointerId] = [e.clientX, e.clientY]; if (pd && Object.keys(pts).length === 2) setZoom(pz * dist() / pd); });
		function end(e) { delete pts[e.pointerId]; pd = 0; }
		box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
		box.addEventListener("wheel", function (e) { if (!winOn || !e.ctrlKey) return; e.preventDefault(); setZoom(S.zoom * Math.exp(-e.deltaY / 200)); }, { passive: false });
	})();
	$("tm-addbar").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.dp) { openDisplay(); return; }
		if (b.dataset.win) { setWin(!winOn); return; }
		if (b.dataset.nobar) { setBar(true); return; }
		if (b.dataset.z) { var z = b.dataset.z; if (z === "fit") { S.fit = !S.fit; if (S.fit) { if (!winOn) setWin(true); else fitNow(); } applyZoom(); save(); } else if (z === "0") setZoom(1); else setZoom(S.zoom * (z === "+" ? 1.1 : 1 / 1.1)); return; }
		if (!CUSTOM) return;
		if (b.dataset.l) { S.layout = b.dataset.l; save(); buildPanels(); return; }
		var v = b.dataset.v, i = S.show.indexOf(v);
		if (i >= 0) { if (S.show.length === 1) { toast("Keep at least one timer on the page"); return; } S.show.splice(i, 1); } else S.show.push(v);
		save(); buildPanels();
	});
	$("tm-secs").addEventListener("click", function (e) {
		var t = e.target.closest(".tm-sec__t"); if (!t) return; var sec = t.closest(".tm-sec"), v = sec.dataset.v, c = !sec.classList.contains("is-collapsed");
		sec.classList.toggle("is-collapsed", c); t.setAttribute("aria-expanded", String(!c)); S.collapsed[v] = c; save();
	});

	/* ---- countdown timers ---- */
	function remaining(t) { var now = Date.now(); return t.st === "run" ? Math.max(0, t.end - now) : t.st === "done" ? 0 : t.rem; }
	function faceText(t) {
		var ms = remaining(t);
		if (S.optTenths && t.st === "run" && ms < 60000) { var q = TM.parts(ms, false), s = TM.pad(q.m) + ":" + TM.pad(q.s) + "<small>." + q.t + "</small>"; return q.h ? q.h + ":" + s : s; }
		return TM.clock(ms, true, false);
	}
	function barPct(t) { return t.total > 0 ? Math.max(0, Math.min(100, (1 - remaining(t) / t.total) * 100)).toFixed(2) : 0; }
	function btnsFor(t) {
		var b = function (a, label, cls) { return '<button type="button" class="tu-btn ' + (cls || "") + ' tm-big" data-a="' + a + '">' + label + "</button>"; };
		if (t.st === "idle") return b("go", "Start", "tu-btn--primary");
		if (t.st === "run") return b("pause", "Pause", "tu-btn--primary") + b("add1", "+1 min", "") + b("reset", "Reset", "tu-btn--ghost");
		if (t.st === "pause") return b("go", "Resume", "tu-btn--primary") + b("add1", "+1 min", "") + b("reset", "Reset", "tu-btn--ghost");
		return b("restart", "Restart", "tu-btn--primary") + b("reset", "Dismiss", "tu-btn--ghost");
	}
	function cardHtml(t, i) {
		var p = TM.parts(t.total, false), idle = t.st === "idle" || t.st === "done", old = $("tm-timers").querySelector('.tm-timer[data-id="' + t.id + '"]'), isFs = old && old.classList.contains("tm-fs");
		return '<div class="tm-timer tm-fsable is-' + (t.st === "run" ? "running" : t.st) + (isFs ? " tm-fs" : "") + '" data-id="' + t.id + '">' +
			'<div class="tm-head">' + (S.timers.length > 1 ? '<button type="button" class="tm-grip" title="Drag to move this timer" aria-label="Move timer ' + (i + 1) + ': drag, or use the arrow keys" data-grip="timer">⠿</button>' : "") + '<input class="tm-label" type="text" maxlength="60" autocomplete="off" placeholder="Timer ' + (i + 1) + '" aria-label="Label for timer ' + (i + 1) + '" value="' + esc(t.label) + '">' +
			''+ pinBtn("t:" + t.id) + '<button type="button" class="tm-icon" data-a="full" title="Full screen" aria-label="Full screen">' + (isFs ? "✕ Close" : "⤢") + "</button>" + (S.timers.length > 1 ? '<button type="button" class="tm-icon" data-a="del" title="Remove this timer" aria-label="Remove this timer">✕</button>' : "") + "</div>" +
			'<div class="tm-face" data-face>' + faceText(t) + '</div><div class="tm-bar"><i data-bar style="width:' + barPct(t) + '%"></i></div>' +
			(idle ? '<div class="tm-presets">' + PRESETS.map(function (x) { return '<button type="button" class="tu-chip" data-p="' + x[1] + '">' + x[0] + "</button>"; }).join("") + '</div><div class="tm-set"><input class="tu-input" data-k="h" type="text" inputmode="numeric" value="' + p.h + '" aria-label="Hours"><span>h</span><input class="tu-input" data-k="m" type="text" inputmode="numeric" value="' + p.m + '" aria-label="Minutes"><span>m</span><input class="tu-input" data-k="s" type="text" inputmode="numeric" value="' + p.s + '" aria-label="Seconds"><span>s</span></div>' : "") +
			'<div class="tm-btns tm-btns--center">' + btnsFor(t) + "</div></div>";
	}
	function renderTimers() {
		var box = $("tm-timers"); if (!box) return;
		var af = document.activeElement, fid = af && af.closest && af.closest(".tm-timer") ? af.closest(".tm-timer").dataset.id : null, wasLabel = af && /tm-label/.test(af.className || "");
		box.innerHTML = S.timers.map(cardHtml).join("");
		if (fid && wasLabel) { var el = box.querySelector('.tm-timer[data-id="' + fid + '"] .tm-label'); if (el) { el.focus(); var v = el.value; el.value = ""; el.value = v; } }
		var add = $("tm-add"); if (add) add.hidden = S.timers.length >= 8;
	}
	function readInputs(card, t) { var v = {}; [].forEach.call(card.querySelectorAll(".tm-set input"), function (i) { v[i.dataset.k] = i.value; }); if (card.querySelector(".tm-set")) t.total = TM.hmsToMs(v.h, v.m, v.s); }
	function clearRingFor(type, id) { var n = ringing.length; ringing = ringing.filter(function (r) { return !(r.type === type && r.id === id); }); if (n !== ringing.length) { if (!ringing.length) stopSound(); drawRing(); } }

	/* ---- stopwatches ---- */
	function findSw(id) { for (var i = 0; i < S.sws.length; i++) if (S.sws[i].id === id) return S.sws[i]; return null; }
	function swElapsed(w) { return w.st === "run" ? w.base + (Date.now() - w.startAt) : w.base; }
	function swText(w) { var ms = swElapsed(w), p = TM.parts(ms, false); return (p.h ? p.h + ":" + TM.pad(p.m) : TM.pad(p.m)) + ":" + TM.pad(p.s) + "<small>." + TM.pad(Math.floor(p.ms / 10)) + "</small>"; }
	function swCard(w, i) {
		var old = $("tm-sws").querySelector('.tm-swc[data-id="' + w.id + '"]'), isFs = old && old.classList.contains("tm-fs"), L = TM.laps(w.laps);
		var b = function (a, label, cls, dis) { return '<button type="button" class="tu-btn ' + (cls || "") + ' tm-big" data-a="' + a + '"' + (dis ? " disabled" : "") + ">" + label + "</button>"; };
		return '<div class="tm-timer tm-swc tm-fsable is-' + (w.st === "run" ? "running" : "idle") + (isFs ? " tm-fs" : "") + '" data-id="' + w.id + '"><div class="tm-head">' + (S.sws.length > 1 ? '<button type="button" class="tm-grip" title="Drag to move this stopwatch" aria-label="Move stopwatch ' + (i + 1) + ': drag, or use the arrow keys" data-grip="sw">⠿</button>' : "") +
			'<input class="tm-label" type="text" maxlength="60" autocomplete="off" placeholder="Stopwatch ' + (i + 1) + '" aria-label="Label for stopwatch ' + (i + 1) + '" value="' + esc(w.label) + '">'+ pinBtn("s:" + w.id) + '<button type="button" class="tm-icon" data-a="full" title="Full screen" aria-label="Full screen">' + (isFs ? "✕ Close" : "⤢") + "</button>" + (S.sws.length > 1 ? '<button type="button" class="tm-icon" data-a="del" title="Remove this stopwatch" aria-label="Remove this stopwatch">✕</button>' : "") + "</div>" +
			'<div class="tm-face tm-face--sw" data-face>' + swText(w) + '</div><div class="tm-btns tm-btns--center">' + b("go", w.st === "run" ? "Pause" : w.st === "pause" ? "Resume" : "Start", "tu-btn--primary") + b("lap", "Lap", "", w.st !== "run") + b("reset", "Reset", "tu-btn--ghost", w.st === "idle" && !w.laps.length) + "</div>" +
			(L.rows.length ? '<div class="tm-hide-fs"><div class="tu-table-wrap"><table class="tu-table tm-laps"><thead><tr><th>Lap</th><th>Lap time</th><th>Total</th></tr></thead><tbody>' + L.rows.slice().reverse().map(function (r) { var k = r.n - 1; return '<tr class="' + (k === L.fast ? "tm-fast" : k === L.slow ? "tm-slow" : "") + '"><td>' + r.n + (k === L.fast ? " ▲ fastest" : k === L.slow ? " ▼ slowest" : "") + "</td><td>" + TM.precise(r.lap) + "</td><td>" + TM.precise(r.total) + '</td></tr>'; }).join("") + '</tbody></table></div><div class="tm-btns"><button type="button" class="tu-btn tu-btn--ghost" data-a="copy">Copy laps</button></div></div>' : "") + "</div>";
	}
	function renderSw() {
		var box = $("tm-sws"); if (!box) return; var af = document.activeElement, fid = af && af.closest && af.closest(".tm-swc") && /tm-label/.test(af.className || "") ? af.closest(".tm-swc").dataset.id : null;
		box.innerHTML = S.sws.map(swCard).join("");
		if (fid) { var el = box.querySelector('.tm-swc[data-id="' + fid + '"] .tm-label'); if (el) { el.focus(); var v = el.value; el.value = ""; el.value = v; } }
		var add = $("tm-sw-add"); if (add) add.hidden = S.sws.length >= 6;
	}

	/* ---- alarms ---- */
	function alarmNext(a) { return a.snooze > Date.now() ? a.snooze : a.at; }
	function alarmStatus(a) {
		var now = Date.now(), next = alarmNext(a); if (!a.on || !next) return "Off";
		var d = new Date(next), when = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (d.toDateString() !== new Date().toDateString() ? " tomorrow" : "");
		return (a.snooze > now ? "Snoozed until " : "Rings at ") + when + (a.daily && a.snooze <= now ? ", every day" : "") + " (in " + TM.human(next - now) + ")";
	}
	function alarmCd(a, any) {
		var next = alarmNext(a); if ((!a.cd && !any) || !a.on || !next) return "";
		var t = Math.max(0, Math.ceil((next - Date.now()) / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
		return (h ? h + ":" + TM.pad(m) : m) + ":" + TM.pad(sec);
	}
	var PIN_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M3 7l2-3h6l2 3"/></svg>';
	function pinBtn(key) { var on = S.optTitle && S.titleSrc === key; return '<button type="button" class="tm-icon tm-tabpin" data-tabpin="' + esc(key) + '" aria-pressed="' + on + '" title="' + (on ? "Showing in the browser tab. Click to go back to automatic." : "Show this one in the browser tab") + '" aria-label="Show in the browser tab">' + PIN_SVG + (on ? "<b>✓</b>" : "") + "</button>"; }
	var PIN_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M3 7l2-3h6l2 3"/></svg>';
	function pinBtn(key, cls) { var on = S.optTitle && S.titleSrc === key; return '<button type="button" class="tm-icon tm-tabpin ' + (cls || "") + '" data-tabpin="' + esc(key) + '" aria-pressed="' + on + '" title="' + (on ? "Showing in the browser tab. Click to go back to automatic." : "Show this one in the browser tab") + '" aria-label="Show in the browser tab">' + PIN_SVG + (on ? "<b>✓</b>" : "") + "</button>"; }
	function renderAlarms() {
		var box = $("tm-alarms"); if (!box) return;
		var af = document.activeElement, focusId = af && af.closest && af.closest(".tm-alarm") && /tm-label/.test(af.className || "") ? af.closest(".tm-alarm").dataset.id : null;
		box.innerHTML = S.alarms.map(function (a, i) {
			return '<div class="tm-alarm' + (a.on ? " is-on" : "") + '" data-id="' + a.id + '"><div class="tm-alarm__row"><input class="tu-input tu-input--big tm-time" data-k="time" type="time" step="60" value="' + esc(a.time) + '" aria-label="Alarm ' + (i + 1) + ' time"><input class="tm-label" data-k="label" type="text" maxlength="60" autocomplete="off" placeholder="Label (optional)" value="' + esc(a.label) + '" aria-label="Alarm ' + (i + 1) + ' label">' +
				'<label class="tm-check"><input type="checkbox" data-k="daily"' + (a.daily ? " checked" : "") + '> Daily</label><label class="tm-check" title="Show a big countdown to this alarm"><input type="checkbox" data-k="cd"' + (a.cd ? " checked" : "") + '> Countdown</label><button type="button" class="tu-btn ' + (a.on ? "tu-btn--ghost" : "tu-btn--primary") + '" data-a="toggle">' + (a.on ? "Turn off" : "Turn on") + "</button>" + (S.alarms.length > 1 ? '<button type="button" class="tm-icon" data-a="del" aria-label="Remove alarm" title="Remove">✕</button>' : "") + '</div><div class="tm-alarm__cd" data-cd' + (alarmCd(a) ? "" : " hidden") + '>' + esc(alarmCd(a)) + '</div><div class="tm-alarm__st" data-st>' + esc(alarmStatus(a)) + "</div>" + pinBtn("a:" + a.id, "tm-tabpin--al") + "</div>";
		}).join("");
		if (focusId) { var el = box.querySelector('.tm-alarm[data-id="' + focusId + '"] .tm-label'); if (el) { el.focus(); var v = el.value; el.value = ""; el.value = v; } }
		var add = $("tm-al-add"); if (add) add.hidden = S.alarms.length >= 6;
	}

	/* ---- pomodoro ---- */
	var PO_LABEL = { focus: "Focus", short: "Short break", long: "Long break" };
	function poLen(phase) { return Math.round((phase === "focus" ? S.po.focus : phase === "short" ? S.po.short : S.po.long) * 60000); }
	function poRemaining() { return S.po.st === "run" ? Math.max(0, S.po.end - Date.now()) : S.po.rem; }
	function renderPo() {
		if (!$("tm-po-go")) return; var p = S.po;
		[].forEach.call($("tm-po-tabs").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.p === p.phase)); });
		$("tm-po-go").textContent = p.st === "run" ? "Pause" : p.st === "pause" ? "Resume" : "Start";
		$("tm-po-info").innerHTML = (p.phase === "focus" ? "Focus session <b>" + p.round + "</b> of " + p.rounds : esc(PO_LABEL[p.phase])) + " · " + p.done + " focus " + (p.done === 1 ? "session" : "sessions") + " finished today";
		[].forEach.call(root.querySelectorAll("[data-po]"), function (i) { if (document.activeElement === i) return; if (i.type === "checkbox") i.checked = p.auto; else i.value = p[i.dataset.po]; });
		var pl = $("tm-po-label"); if (pl && document.activeElement !== pl) pl.value = p.label;
		$("tm-b-po").dataset.phase = p.phase; poFace();
	}
	function poFace() { var p = S.po, ms = poRemaining(); $("tm-po-face").textContent = TM.clock(ms, true, false); $("tm-po-bar").style.width = (poLen(p.phase) > 0 ? Math.max(0, Math.min(100, (1 - ms / poLen(p.phase)) * 100)) : 0).toFixed(2) + "%"; }
	function poSetPhase(phase, round, run) {
		var p = S.po; p.phase = phase; p.round = round; p.rem = poLen(phase); p.st = run ? "run" : "idle"; p.end = run ? Date.now() + p.rem : 0; renderPo(); updateAwake(); save();
	}

	/* ---- interval ---- */
	var IV_PRESETS = [["Tabata 20/10 × 8", { prep: 10, work: 20, rest: 10, rounds: 8 }], ["30 / 15 × 10", { prep: 10, work: 30, rest: 15, rounds: 10 }], ["40 / 20 × 6", { prep: 10, work: 40, rest: 20, rounds: 6 }], ["45 / 15 × 8", { prep: 10, work: 45, rest: 15, rounds: 8 }], ["EMOM 60 × 10", { prep: 10, work: 60, rest: 0, rounds: 10 }], ["Boxing 3 min × 12", { prep: 10, work: 180, rest: 60, rounds: 12 }]];
	function ivElapsed() { return S.iv.st === "run" ? S.iv.base + (Date.now() - S.iv.startAt) : S.iv.base; }
	function ivPlan() { return TM.itvPlan(S.iv); }
	var ivLast = -1, ivSec = -1;
	function renderIv() {
		if (!$("tm-iv-go")) return; var v = S.iv;
		$("tm-iv-presets").innerHTML = IV_PRESETS.map(function (x, i) { var same = x[1].work === v.work && x[1].rest === v.rest && x[1].rounds === v.rounds && x[1].prep === v.prep; return '<button type="button" class="tu-chip" data-i="' + i + '" aria-pressed="' + same + '">' + x[0] + "</button>"; }).join("");
		[].forEach.call(root.querySelectorAll("[data-iv]"), function (i) { if (document.activeElement !== i) i.value = v[i.dataset.iv]; });
		var il = $("tm-iv-label"); if (il && document.activeElement !== il) il.value = v.label;
		$("tm-iv-go").textContent = v.st === "run" ? "Pause" : v.st === "pause" ? "Resume" : "Start";
		var plan = ivPlan(); $("tm-iv-total").textContent = "Total workout time: " + TM.clock(TM.itvTotal(plan), false) + " (" + v.rounds + " rounds of " + v.work + " s work" + (v.rest ? " and " + v.rest + " s rest" : "") + (v.prep ? ", after a " + v.prep + " s get-ready" : "") + ").";
		ivFace();
	}
	function ivFace() {
		var plan = ivPlan(), at = TM.itvAt(plan, ivElapsed()), box = $("tm-iv-box"); if (!box) return;
		if (S.iv.st === "idle" && !S.iv.base) { box.dataset.phase = "idle"; $("tm-iv-phase").textContent = "Ready"; $("tm-iv-face").textContent = TM.clock((plan[0] ? plan[0].ms : 0), true, false); $("tm-iv-info").textContent = ""; $("tm-iv-bar").style.width = "0%"; return; }
		if (at.done) { box.dataset.phase = "done"; $("tm-iv-phase").textContent = "Done! 🎉"; $("tm-iv-face").textContent = "00:00"; $("tm-iv-info").textContent = "All " + S.iv.rounds + " rounds complete"; $("tm-iv-bar").style.width = "100%"; return; }
		box.dataset.phase = at.seg.phase; $("tm-iv-phase").textContent = at.seg.phase === "prep" ? "Get ready" : at.seg.phase === "work" ? "WORK" : "REST";
		$("tm-iv-face").textContent = TM.clock(at.left, true, false);
		$("tm-iv-info").textContent = (at.seg.round ? "Round " + at.seg.round + " of " + S.iv.rounds + " · " : "") + TM.clock(Math.max(0, TM.itvTotal(plan) - ivElapsed()), true) + " left in total";
		$("tm-iv-bar").style.width = (ivElapsed() / TM.itvTotal(plan) * 100).toFixed(2) + "%";
	}

	/* ---- events ---- */
	function renderEvents() {
		var box = $("tm-events"); if (!box) return;
		box.innerHTML = S.ev.length ? S.ev.slice().sort(function (a, b) { return a.at - b.at; }).map(function (e) { return evHtml(e); }).join("") : '<p class="tu-note">Add an event above to see how long is left, down to the second.</p>';
		var q = $("tm-ev-quick"); if (q && !q.innerHTML) { var y = new Date().getFullYear(), n = Date.now(); var cand = [["Christmas", y + "-12-25"], ["New Year", (y + 1) + "-01-01"], ["Halloween", y + "-10-31"], ["Valentine's Day", y + "-02-14"], ["Summer solstice", y + "-06-21"]].map(function (c) { var at = TM.parseDateTime(c[1], ""); if (at && at < n) { var d = c[1].split("-"); at = TM.parseDateTime((+d[0] + 1) + "-" + d[1] + "-" + d[2], ""); c[1] = (+d[0] + 1) + "-" + d[1] + "-" + d[2]; } return c; }); q.innerHTML = '<span class="tm-addbar__l">Quick add:</span>' + cand.map(function (c) { return '<button type="button" class="tu-chip" data-n="' + esc(c[0]) + '" data-d="' + c[1] + '">' + esc(c[0]) + "</button>"; }).join(""); }
	}
	function evHtml(e) {
		var p = TM.dhms(e.at - Date.now()), d = new Date(e.at), when = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + (d.getHours() || d.getMinutes() ? ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
		return '<div class="tm-event tm-fsable' + (p.past ? " is-past" : "") + '" data-id="' + e.id + '"><div class="tm-head"><b class="tm-ev-name">' + esc(e.name || "Event") + '</b><button type="button" class="tm-icon" data-a="full" title="Full screen" aria-label="Full screen">⤢</button><button type="button" class="tm-icon" data-a="del" title="Remove" aria-label="Remove event">✕</button></div><div class="tm-ev-when">' + esc(when) + '</div><div class="tm-ev-face" data-evface>' + evFace(p) + "</div></div>";
	}
	function evFace(p) { return (p.past ? '<div class="tm-ev-past">🎉 It is time! (' + (p.d ? p.d + " d " : "") + p.h + " h ago)</div>" : '<span><b>' + p.d + '</b> days</span><span><b>' + TM.pad(p.h) + '</b> hours</span><span><b>' + TM.pad(p.m) + '</b> min</span><span><b>' + TM.pad(p.s) + "</b> sec</span>"); }

	/* ================= wiring ================= */
	function renderAll() { renderTimers(); renderSw(); renderAlarms(); renderPo(); renderIv(); renderEvents(); }
	function bindPanels() {
		var tb = $("tm-timers");
		if (tb) {
			tb.onclick = function (e) {
				var card = e.target.closest(".tm-timer"); if (!card) return; var t = findTimer(card.dataset.id); if (!t) return;
				var chip = e.target.closest("[data-p]"); if (chip) { t.total = t.rem = +chip.dataset.p; t.st = "idle"; renderTimers(); save(); return; }
				var btn = e.target.closest("[data-a]"); if (!btn) return; var a = btn.dataset.a, now = Date.now(); unlock();
				if (a === "go" || a === "restart") { if (t.st === "idle" || t.st === "done") { readInputs(card, t); if (t.total <= 0) { toast("Set a time first"); return; } t.rem = t.total; } t.end = now + t.rem; t.st = "run"; }
				else if (a === "pause") { t.rem = Math.max(0, t.end - now); t.st = "pause"; }
				else if (a === "add1") { if (t.st === "run") t.end += 60000; else t.rem += 60000; t.total += 60000; }
				else if (a === "reset") { clearRingFor("t", t.id); t.st = "idle"; t.rem = t.total; }
				else if (a === "del") { clearRingFor("t", t.id); S.timers = S.timers.filter(function (x) { return x !== t; }); }
				else if (a === "full") { toggleFull(card); return; }
				renderTimers(); updateAwake(); updateTitle(); save();
			};
			tb.oninput = function (e) {
				var card = e.target.closest(".tm-timer"); if (!card) return; var t = findTimer(card.dataset.id); if (!t) return;
				if (e.target.classList.contains("tm-label")) { t.label = e.target.value; save(); return; }
				if (e.target.dataset.k) { readInputs(card, t); if (t.st === "idle") t.rem = t.total; card.querySelector("[data-face]").innerHTML = faceText(t); save(); }
			};
			tb.onkeydown = function (e) { if (e.key === "Enter" && e.target.dataset.k) { var b = e.target.closest(".tm-timer").querySelector('[data-a="go"]'); if (b) b.click(); } };
			$("tm-add").onclick = function () { if (S.timers.length >= 8) return; S.timers.push(newTimer(300000)); renderTimers(); save(); var l = tb.querySelector(".tm-timer:last-child .tm-label"); if (l) l.focus(); };
		}
		var sb = $("tm-sws");
		if (sb) {
			sb.onclick = function (e) {
				var card = e.target.closest(".tm-swc"), btn = e.target.closest("[data-a]"); if (!card || !btn) return; var w = findSw(card.dataset.id); if (!w) return; var a = btn.dataset.a, now = Date.now(); unlock();
				if (a === "go") { if (w.st === "run") { w.base += now - w.startAt; w.st = "pause"; } else { w.startAt = now; w.st = "run"; } }
				else if (a === "lap") { if (w.st !== "run") return; w.laps.push(swElapsed(w)); }
				else if (a === "reset") { w.st = "idle"; w.startAt = 0; w.base = 0; w.laps = []; }
				else if (a === "del") S.sws = S.sws.filter(function (x) { return x !== w; });
				else if (a === "copy") { var L = TM.laps(w.laps); copyText("Lap\tLap time\tTotal\n" + L.rows.map(function (r) { return r.n + "\t" + TM.precise(r.lap) + "\t" + TM.precise(r.total); }).join("\n"), "Laps copied"); return; }
				else if (a === "full") { toggleFull(card); return; }
				renderSw(); updateAwake(); updateTitle(); save();
			};
			sb.oninput = function (e) { var card = e.target.closest(".tm-swc"); if (!card || !e.target.classList.contains("tm-label")) return; var w = findSw(card.dataset.id); if (w) { w.label = e.target.value; save(); } };
			$("tm-sw-add").onclick = function () { if (S.sws.length >= 6) return; S.sws.push(newSw()); renderSw(); save(); var l = sb.querySelector(".tm-swc:last-child .tm-label"); if (l) l.focus(); };
			wireSw();
		}
		var ab = $("tm-alarms");
		if (ab) {
			ab.onclick = function (e) {
				var row = e.target.closest(".tm-alarm"), btn = e.target.closest("[data-a]"); if (!row || !btn) return; var a = findAlarm(row.dataset.id); if (!a) return; unlock();
				if (btn.dataset.a === "del") { clearRingFor("a", a.id); S.alarms = S.alarms.filter(function (x) { return x !== a; }); }
				else if (a.on) { a.on = false; a.at = 0; a.snooze = 0; clearRingFor("a", a.id); }
				else { if (!a.time) { toast("Pick a time first"); var t = row.querySelector(".tm-time"); if (t) t.focus(); return; } a.at = TM.nextAlarm(a.time, new Date()); a.snooze = 0; a.on = true; }
				renderAlarms(); save();
			};
			ab.onchange = ab.oninput = function (e) {
				var row = e.target.closest(".tm-alarm"); if (!row) return; var a = findAlarm(row.dataset.id); if (!a) return; var k = e.target.dataset.k; if (!k) return;
				if (k === "daily" || k === "cd") { a[k] = e.target.checked; if (k === "cd") { var cdEl = row.querySelector("[data-cd]"); cdEl.textContent = alarmCd(a); cdEl.hidden = !a.cd || !alarmCd(a); } } else a[k] = e.target.value;
				if (k === "time" && a.on) { a.at = TM.nextAlarm(a.time, new Date()); a.snooze = 0; }
				save();
			};
			wireAlarmVol(); $("tm-al-add").onclick = function () { if (S.alarms.length >= 6) return; S.alarms.push(newAlarm()); renderAlarms(); save(); };
		}
		if ($("tm-po-go")) {
			$("tm-po-go").onclick = function () {
				unlock(); var p = S.po, now = Date.now();
				if (p.st === "run") { p.rem = Math.max(0, p.end - now); p.st = "pause"; } else { if (p.rem <= 0) p.rem = poLen(p.phase); p.end = now + p.rem; p.st = "run"; }
				renderPo(); updateAwake(); updateTitle(); save();
			};
			$("tm-po-skip").onclick = function () { unlock(); var n = TM.pomoNext(S.po.phase, S.po.round, S.po.rounds); poSetPhase(n.phase, n.round, S.po.st === "run"); };
			$("tm-po-reset").onclick = function () { S.po.phase = "focus"; S.po.round = 1; S.po.rem = poLen("focus"); S.po.st = "idle"; S.po.end = 0; renderPo(); updateAwake(); updateTitle(); save(); };
			$("tm-po-label").oninput = function () { S.po.label = this.value; save(); };
			$("tm-po-tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; poSetPhase(b.dataset.p, S.po.round, false); };
			root.addEventListener("input", function (e) {
				var k = e.target.dataset && e.target.dataset.po; if (!k) return; var p = S.po;
				if (k === "auto") p.auto = e.target.checked; else { var lim = { focus: [1, 180], short: [1, 60], long: [1, 90], rounds: [1, 12] }[k]; p[k] = Math.round(num(e.target.value, p[k], lim[0], lim[1])); if (k === "rounds" && p.round > p.rounds) p.round = p.rounds; if (k === p.phase && p.st === "idle") p.rem = poLen(p.phase); }
				poFace(); save();
			});
		}
		if ($("tm-iv-go")) {
			$("tm-iv-go").onclick = function () { unlock(); var v = S.iv, now = Date.now(); if (v.st === "run") { v.base += now - v.startAt; v.st = "pause"; } else { if (TM.itvAt(ivPlan(), v.base).done) v.base = 0; v.startAt = now; v.st = "run"; ivLast = -1; } renderIv(); updateAwake(); updateTitle(); save(); };
			$("tm-iv-reset").onclick = function () { S.iv.st = "idle"; S.iv.base = 0; S.iv.startAt = 0; ivLast = -1; renderIv(); updateAwake(); updateTitle(); save(); };
			$("tm-iv-label").oninput = function () { S.iv.label = this.value; save(); };
			$("tm-iv-presets").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; var x = IV_PRESETS[+b.dataset.i][1]; for (var k in x) S.iv[k] = x[k]; S.iv.st = "idle"; S.iv.base = 0; renderIv(); save(); };
			root.addEventListener("input", function (e) {
				var k = e.target.dataset && e.target.dataset.iv; if (!k) return; var lim = { prep: [0, 120], work: [1, 3600], rest: [0, 3600], rounds: [1, 99] }[k]; S.iv[k] = Math.round(num(e.target.value, S.iv[k], lim[0], lim[1]));
				if (S.iv.st === "idle") S.iv.base = 0; var plan = ivPlan(); $("tm-iv-total").textContent = "Total workout time: " + TM.clock(TM.itvTotal(plan), false) + "."; ivFace(); save();
			});
		}
		if ($("tm-ev-add")) {
			var add = function (name, date, time) {
				var at = TM.parseDateTime(date, time); if (!at) { toast("Pick a date"); return; }
				if (S.ev.length >= 12) { toast("You can keep up to 12 events"); return; } S.ev.push({ id: uid(), name: (name || "").trim().slice(0, 60), at: at }); renderEvents(); save();
			};
			$("tm-ev-add").onclick = function () { add($("tm-ev-name").value, $("tm-ev-date").value, $("tm-ev-time").value); $("tm-ev-name").value = ""; };
			$("tm-ev-quick").onclick = function (e) { var b = e.target.closest("button[data-d]"); if (b) add(b.dataset.n, b.dataset.d, ""); };
			$("tm-events").onclick = function (e) { var b = e.target.closest("[data-a]"); if (!b) return; var card = b.closest(".tm-event"); if (b.dataset.a === "del") { S.ev = S.ev.filter(function (x) { return x.id !== card.dataset.id; }); renderEvents(); save(); } else toggleFull(card); };
		}
		[].forEach.call(root.querySelectorAll("[data-fs-for]"), function (b) { b.onclick = function () { toggleFull($("tm-b-" + b.dataset.fsFor)); }; });
		if (!sortWired) { wireSections(); sortWired = true; }
		wireTimers();      // #tm-timers is a new element after every rebuild of the panels
	}
	var sortWired = false;

	/* ---------- drag to reorder (mouse, touch, pen) + arrow keys on the grip ---------- */
	var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	function sortable(box, itemSel, done) {
		function items() { return [].filter.call(box.children, function (c) { return c.matches(itemSel); }); }
		function isStack() { var it = items(); return it.length < 2 || Math.abs(it[1].getBoundingClientRect().top - it[0].getBoundingClientRect().top) > it[0].getBoundingClientRect().height / 2; }
		function flip(moving, fn) {
			var others = items().filter(function (o) { return o !== moving; }), first = others.map(function (o) { return o.getBoundingClientRect(); });
			fn();
			if (reduceMotion) return;
			others.forEach(function (o, i) {
				var r = o.getBoundingClientRect(), dx = first[i].left - r.left, dy = first[i].top - r.top; if (!dx && !dy) return;
				o.style.transition = "none"; o.style.transform = "translate(" + dx + "px," + dy + "px)"; void o.offsetWidth;
				o.style.transition = "transform 220ms cubic-bezier(.2,.8,.3,1)"; o.style.transform = "";
				setTimeout(function () { o.style.transition = ""; }, 260);
			});
		}
		box.addEventListener("keydown", function (e) {
			var g = e.target.closest && e.target.closest(".tm-grip"); if (!g || !/^Arrow(Up|Down|Left|Right)$/.test(e.key)) return; var item = g.closest(itemSel); if (!item || item.parentNode !== box) return;
			e.preventDefault(); var it = items(), i = it.indexOf(item), j = i + (e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1); if (j < 0 || j >= it.length) return;
			flip(item, function () { box.insertBefore(item, j > i ? it[j].nextSibling : it[j]); }); done(items()); var ng = item.querySelector(".tm-grip"); if (ng) ng.focus();
		});
		box.addEventListener("pointerdown", function (e) {
			var g = e.target.closest(".tm-grip"); if (!g || (e.pointerType === "mouse" && e.button !== 0)) return; var item = g.closest(itemSel); if (!item || item.parentNode !== box) return;
			e.preventDefault(); var r0 = item.getBoundingClientRect(), gx = e.clientX - r0.left, gy = e.clientY - r0.top, lx = e.clientX, ly = e.clientY, raf = 0, active = true, pid = e.pointerId;
			item.classList.add("tm-dragging"); item.style.transition = "none"; box.classList.add("tm-sorting");
			function follow() { item.style.transform = "none"; var b = item.getBoundingClientRect(); item.style.transform = "translate(" + (lx - gx - b.left) + "px," + (ly - gy - b.top) + "px) scale(1.02)"; }
			function place() {
				var others = items().filter(function (o) { return o !== item; }), hit = null;
				others.forEach(function (o) { var b = o.getBoundingClientRect(); if (lx >= b.left && lx <= b.right && ly >= b.top && ly <= b.bottom) hit = o; });
				if (hit) { var b = hit.getBoundingClientRect(), stack = isStack(), after = stack ? ly > b.top + Math.min(b.height / 2, 70) : lx > b.left + Math.min(b.width / 2, 120),   /* tall panels: passing their top edge is enough */ cur = items(); if (cur.indexOf(item) < cur.indexOf(hit) !== after || true) { var wantAfter = after, isAfter = cur.indexOf(item) < cur.indexOf(hit); if (wantAfter === isAfter) { item.style.transform = "none"; flip(item, function () { box.insertBefore(item, wantAfter ? hit.nextSibling : hit); }); } } }
				follow();
			}
			function onMove(ev) { if (ev.pointerId !== pid) return; lx = ev.clientX; ly = ev.clientY; place(); }
			function tickScroll() { if (!active) return; var edge = 70, sp = 0; if (ly < edge) sp = -Math.ceil((edge - ly) / 5); else if (ly > innerHeight - edge) sp = Math.ceil((ly - (innerHeight - edge)) / 5); if (sp) { window.scrollBy(0, sp); place(); } raf = requestAnimationFrame(tickScroll); }
			function end(ev) {
				if (!active || (ev && ev.pointerId !== undefined && ev.pointerId !== pid)) return; active = false; cancelAnimationFrame(raf);
				window.removeEventListener("pointermove", onMove, true); window.removeEventListener("pointerup", end, true); window.removeEventListener("pointercancel", end, true);
				item.classList.remove("tm-dragging"); box.classList.remove("tm-sorting");
				if (reduceMotion) { item.style.transition = ""; item.style.transform = ""; } else { void item.offsetWidth; item.style.transition = "transform 200ms cubic-bezier(.2,.8,.3,1)"; item.style.transform = ""; setTimeout(function () { item.style.transition = ""; }, 260); }
				done(items());
			}
			window.addEventListener("pointermove", onMove, true); window.addEventListener("pointerup", end, true); window.addEventListener("pointercancel", end, true); follow(); raf = requestAnimationFrame(tickScroll);
		});
	}
	function wireSections() { if (CUSTOM) sortable($("tm-secs"), ".tm-sec", function (els) { var seen = els.map(function (x) { return x.dataset.v; }); S.order = seen.concat(S.order.filter(function (v) { return seen.indexOf(v) < 0; })); save(); }); }
	function wireSw() { var sb = $("tm-sws"); if (sb) sortable(sb, ".tm-swc", function (els) { var ids = els.map(function (x) { return x.dataset.id; }); S.sws.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); }); save(); renderSw(); }); }
	function wireTimers() { var tb = $("tm-timers"); if (tb) sortable(tb, ".tm-timer", function (els) { var ids = els.map(function (x) { return x.dataset.id; }); S.timers.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); }); save(); renderTimers(); }); }

	/* ---------- display mode: just the times of the timers you pick, big, full screen ---------- */
	var dpOpen = false, dpKeys = "";
	function plain(ms, up) { return TM.clock(ms, up, false); }
	function dpItems() {
		var out = [], now = Date.now();
		S.timers.forEach(function (t, i) { out.push({ key: "t:" + t.id, label: t.label || "Timer " + (i + 1), kind: "Countdown", time: plain(remaining(t), true), state: t.st === "run" ? "run" : t.st === "done" ? "done" : t.st === "pause" ? "pause" : "idle", pct: +barPct(t) }); });
		S.sws.forEach(function (w, i) { var ms = swElapsed(w), p = TM.parts(ms, false); out.push({ key: "s:" + w.id, label: w.label || "Stopwatch " + (i + 1), kind: "Stopwatch", time: (p.h ? p.h + ":" + TM.pad(p.m) : TM.pad(p.m)) + ":" + TM.pad(p.s), state: w.st === "run" ? "run" : w.st === "pause" ? "pause" : "idle", pct: -1 }); });
		S.alarms.forEach(function (a, i) { if (!a.time && !a.on) return; var next = alarmNext(a); var at12 = a.time ? new Date(2000, 0, 1, +a.time.split(":")[0], +a.time.split(":")[1]).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--"; out.push({ key: "a:" + a.id, label: a.label || "Alarm " + (i + 1), kind: "Alarm", time: new Date(now).toLocaleTimeString(), sub: a.on && next ? "alarm " + at12 + " · rings in " + TM.human(next - now) : "alarm " + at12 + " · off", state: a.on ? "run" : "idle", pct: -1 }); });
		var p = S.po; out.push({ key: "po", label: p.label || "Pomodoro", kind: PO_LABEL[p.phase], time: plain(poRemaining(), true), state: p.st === "run" ? "run" : p.st === "pause" ? "pause" : "idle", pct: poLen(p.phase) ? (1 - poRemaining() / poLen(p.phase)) * 100 : 0 });
		var v = S.iv, at = TM.itvAt(ivPlan(), ivElapsed()); out.push({ key: "iv", label: v.label || "Interval", kind: v.st === "idle" && !v.base ? "Ready" : at.done ? "Done" : at.seg.phase === "work" ? "WORK" : at.seg.phase === "rest" ? "REST" : "Get ready", time: at.done || (v.st === "idle" && !v.base) ? plain(at.done ? 0 : (ivPlan()[0] || { ms: 0 }).ms, true) : plain(at.left, true), state: v.st === "run" ? "run" : v.st === "pause" ? "pause" : "idle", pct: -1, phase: !at.done && v.st !== "idle" ? at.seg.phase : "" });
		S.ev.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (e) { var d = TM.dhms(e.at - now); out.push({ key: "e:" + e.id, label: e.name || "Event", kind: "Countdown to a date", time: d.past ? "🎉 now" : (d.d ? d.d + "d " : "") + TM.pad(d.h) + ":" + TM.pad(d.m) + ":" + TM.pad(d.s), state: d.past ? "done" : "run", pct: -1 }); });
		return out;
	}
	function dpCtl(key) {
		var m = /^([tsa]):(.+)$/.exec(key), n;
		if (m && m[1] === "t") { var t = findTimer(m[2]); if (!t) return ""; return [["go", t.st === "run" ? "Pause" : t.st === "pause" ? "Resume" : t.st === "done" ? "Restart" : "Start"], ["add1", "+1 min"], ["reset", "Reset"]].map(ctlBtn).join(""); }
		if (m && m[1] === "s") { var w = findSw(m[2]); if (!w) return ""; return [["go", w.st === "run" ? "Pause" : w.st === "pause" ? "Resume" : "Start"], ["lap", "Lap"], ["reset", "Reset"]].map(ctlBtn).join(""); }
		if (m && m[1] === "a") { var a = findAlarm(m[2]); return a ? ctlBtn(["go", a.on ? "Turn off" : "Turn on"]) : ""; }
		if (key === "po") return [["go", S.po.st === "run" ? "Pause" : S.po.st === "pause" ? "Resume" : "Start"], ["skip", "Skip"], ["reset", "Reset"]].map(ctlBtn).join("");
		if (key === "iv") return [["go", S.iv.st === "run" ? "Pause" : S.iv.st === "pause" ? "Resume" : "Start"], ["reset", "Reset"]].map(ctlBtn).join("");
		return "";
	}
	function ctlBtn(x) { return '<button type="button" data-act="' + x[0] + '">' + x[1] + "</button>"; }
	function dpAct(key, act) {
		var m = /^([tsa]):(.+)$/.exec(key), now = Date.now(); unlock();
		if (m && m[1] === "t") {
			var t = findTimer(m[2]); if (!t) return;
			if (act === "go") { if (t.st === "run") { t.rem = Math.max(0, t.end - now); t.st = "pause"; } else { if (t.st === "idle" || t.st === "done") { if (t.total <= 0) { toast("Set a time first"); return; } t.rem = t.total; } t.end = now + t.rem; t.st = "run"; } }
			else if (act === "add1") { if (t.st === "run") t.end += 60000; else t.rem += 60000; t.total += 60000; }
			else if (act === "reset") { clearRingFor("t", t.id); t.st = "idle"; t.rem = t.total; }
			renderTimers();
		} else if (m && m[1] === "s") {
			var w = findSw(m[2]); if (!w) return;
			if (act === "go") { if (w.st === "run") { w.base += now - w.startAt; w.st = "pause"; } else { w.startAt = now; w.st = "run"; } }
			else if (act === "lap") { if (w.st === "run") w.laps.push(swElapsed(w)); }
			else if (act === "reset") { w.st = "idle"; w.startAt = 0; w.base = 0; w.laps = []; }
			renderSw();
		} else if (m && m[1] === "a") {
			var a = findAlarm(m[2]); if (!a) return;
			if (a.on) { a.on = false; a.at = 0; a.snooze = 0; clearRingFor("a", a.id); } else { if (!a.time) { toast("Pick a time first"); return; } a.at = TM.nextAlarm(a.time, new Date()); a.snooze = 0; a.on = true; }
			renderAlarms();
		} else if (key === "po") {
			var p = S.po;
			if (act === "go") { if (p.st === "run") { p.rem = Math.max(0, p.end - now); p.st = "pause"; } else { if (p.rem <= 0) p.rem = poLen(p.phase); p.end = now + p.rem; p.st = "run"; } renderPo(); }
			else if (act === "skip") { var nx = TM.pomoNext(p.phase, p.round, p.rounds); poSetPhase(nx.phase, nx.round, p.st === "run"); }
			else if (act === "reset") { p.phase = "focus"; p.round = 1; p.rem = poLen("focus"); p.st = "idle"; p.end = 0; renderPo(); }
		} else if (key === "iv") {
			var v = S.iv;
			if (act === "go") { if (v.st === "run") { v.base += now - v.startAt; v.st = "pause"; } else { if (TM.itvAt(ivPlan(), v.base).done) v.base = 0; v.startAt = now; v.st = "run"; ivLast = -1; } renderIv(); }
			else if (act === "reset") { v.st = "idle"; v.base = 0; v.startAt = 0; ivLast = -1; renderIv(); }
		}
		updateAwake(); updateTitle(); save(); renderDisplay();
	}
	function dpSelected(items) {
		if (!S.display) return items.filter(function (i) { return i.state === "run" || i.state === "pause" || i.state === "done"; }).map(function (i) { return i.key; }).concat(items.filter(function (i) { return i.state === "idle" && /^[ts]:/.test(i.key); }).map(function (i) { return i.key; }).slice(0, 0));
		return S.display;
	}
	function ensureDisplay() {
		var el = $("tm-dp"); if (el) return el;
		el = document.createElement("div"); el.id = "tm-dp"; el.className = "tm-dp"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Timer display");
		el.innerHTML = '<div class="tm-dp__bar"><span class="tm-dp__hint" id="tm-dp-hint"></span><button type="button" class="tm-dp__btn" data-d="pick">Choose timers</button><button type="button" class="tm-dp__btn" data-d="fs">⛶ Full screen</button><button type="button" class="tm-dp__btn" data-d="close">✕ Close</button></div><div class="tm-dp__ring" id="tm-dp-ring" hidden><span></span><span class="tm-dp__rb"></span></div><div class="tm-dp__pick" id="tm-dp-pick" hidden></div><div class="tm-dp__grid" id="tm-dp-grid"></div>';
		document.body.appendChild(el);
		sortable($("tm-dp-grid"), ".tm-dp__tile", function (els) { var ks = els.map(function (x) { return x.dataset.k; }); S.display = ks.concat((S.display || []).filter(function (k) { return ks.indexOf(k) < 0; })); dpKeys = ks.join(","); save(); });
		el.addEventListener("click", function (e) {
			var rb = e.target.closest("#tm-dp-ring [data-r]"); if (rb) { ringAct(rb.dataset.r); return; }
			var ab = e.target.closest("[data-act]"); if (ab) { var tl = ab.closest(".tm-dp__tile"); if (tl) dpAct(tl.dataset.k, ab.dataset.act); return; }
			var b = e.target.closest("[data-d]"); if (b) { if (b.dataset.d === "close") closeDisplay(); else if (b.dataset.d === "fs") toggleScreen(); else if (b.dataset.d === "pick") { var pk = $("tm-dp-pick"); pk.hidden = !pk.hidden; if (!pk.hidden) drawPick(); } return; }
			if (e.target.matches("#tm-dp-pick input[type=checkbox]")) {
				var cur = S.display || dpSelected(dpItems()), k = e.target.dataset.k, i = cur.indexOf(k); cur = cur.slice(); if (e.target.checked && i < 0) cur.push(k); else if (!e.target.checked && i >= 0) cur.splice(i, 1);
				S.display = cur; save(); dpKeys = ""; renderDisplay();
			}
		});
		return el;
	}
	function drawPick() {
		var items = dpItems(), sel = dpSelected(items);
		$("tm-dp-pick").innerHTML = '<div class="tm-dp__pt">Choose what the display shows</div>' + items.map(function (i) { return '<label><input type="checkbox" data-k="' + esc(i.key) + '"' + (sel.indexOf(i.key) >= 0 ? " checked" : "") + '> ' + esc(i.label) + ' <small>' + esc(i.kind) + (i.state === "idle" ? " (not started)" : "") + "</small></label>"; }).join("");
	}
	function renderDisplay() {
		var items = dpItems(), sel = dpSelected(items), shown = sel.map(function (k) { return items.filter(function (i) { return i.key === k; })[0]; }).filter(Boolean), keys = shown.map(function (i) { return i.key; }).join(",");
		var grid = $("tm-dp-grid"), hint = $("tm-dp-hint");
		hint.textContent = shown.length ? "" : "Nothing selected yet: press Choose timers, or start a timer.";
		if (keys !== dpKeys) {   // the set of tiles changed: rebuild
			dpKeys = keys; grid.className = "tm-dp__grid tm-dp__n" + Math.min(shown.length, 9);
			grid.innerHTML = shown.map(function (i) { return '<div class="tm-dp__tile" data-k="' + esc(i.key) + '">' + (shown.length > 1 ? '<button type="button" class="tm-grip" title="Drag to rearrange (or focus and use the arrow keys)" aria-label="Move ' + esc(i.label) + ': drag, or use the arrow keys">⠿</button>' : "") + pinBtn(i.key, "tm-tabpin--dp") + '<div class="tm-dp__l">' + esc(i.label) + '</div><div class="tm-dp__t" data-t></div><div class="tm-dp__s" data-s></div><div class="tm-dp__b"><i data-b></i></div><div class="tm-dp__ctl" data-ctl></div></div>'; }).join("");
		}
		shown.forEach(function (i) {
			var tile = grid.querySelector('.tm-dp__tile[data-k="' + i.key.replace(/"/g, "") + '"]'); if (!tile) return;
			tile.className = "tm-dp__tile is-" + i.state + (i.phase ? " ph-" + i.phase : "") + (i.kind === "Alarm" ? " is-clock" : "");
			tile.querySelector("[data-t]").textContent = i.time; tile.querySelector("[data-s]").textContent = i.sub || i.kind + (i.state === "pause" ? " · paused" : i.state === "done" ? " · done" : "");
			var cl = tile.querySelector("[data-ctl]"), ch = dpCtl(i.key); if (cl._h !== ch) { cl._h = ch; cl.innerHTML = ch; }
				var b = tile.querySelector(".tm-dp__b"); b.style.visibility = i.pct >= 0 ? "visible" : "hidden"; tile.querySelector("[data-b]").style.width = Math.max(0, Math.min(100, i.pct)).toFixed(1) + "%";
		});
	}
	function openDisplay() {
		var el = ensureDisplay(); dpOpen = true; dpKeys = ""; el.hidden = false; $("tm-dp-pick").hidden = true; document.body.classList.add("tm-dp-on");
		if (!S.display) { var items = dpItems(), act = dpSelected(items); if (!act.length) { S.display = items.filter(function (i) { return /^[tsp]/.test(i.key) && i.key !== "iv" && i.key !== "po"; }).map(function (i) { return i.key; }); } }
		renderDisplay(); drawRing(); updateDpFs(); if (S.fs === "screen") enterScreen();
		if ("wakeLock" in navigator && !lock) navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }, function () {});
	}
	function closeDisplay() { dpOpen = false; var el = $("tm-dp"); if (el) el.hidden = true; document.body.classList.remove("tm-dp-on"); leaveScreen(); updateAwake(); }
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dpOpen) closeDisplay(); else if (e.key === "Escape" && document.querySelector(".tm-fs")) toggleFull(document.querySelector(".tm-fs")); else if (e.key === "Escape" && winOn && !inScreen()) setWin(false); else if ((e.key === "d" || e.key === "D") && !/^(input|textarea|select)$/i.test(e.target.tagName || "") && !e.ctrlKey && !e.metaKey && !e.altKey) { dpOpen ? closeDisplay() : openDisplay(); } });

	/* ---------- full screen ---------- */
	function inScreen() { return !!document.fullscreenElement; }
	function enterScreen() { try { var r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
	function leaveScreen() { if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} } }
	function toggleScreen() { if (inScreen()) { S.fs = "win"; leaveScreen(); } else { S.fs = "screen"; enterScreen(); } save(); drawFsBar(); updateDpFs(); }
	function updateDpFs() { var b = document.querySelector('#tm-dp [data-d="fs"]'); if (b) b.textContent = inScreen() ? "⛶ Exit full screen" : "⛶ Full screen"; }
	function drawFsBar() {
		var any = document.querySelector(".tm-fs"), bar = $("tm-fsbar");
		if (!any) { if (bar) bar.remove(); return; }
		if (!bar) {
			bar = document.createElement("div"); bar.id = "tm-fsbar"; bar.className = "tm-fsbar"; bar.innerHTML = '<button type="button" data-f="screen"></button><button type="button" data-f="close">✕ Close</button>';
			bar.onclick = function (e) { var x = e.target.closest("button"); if (!x) return; if (x.dataset.f === "screen") toggleScreen(); else { var c = document.querySelector(".tm-fs"); if (c) toggleFull(c); } };
			document.body.appendChild(bar);
		}
		bar.firstChild.textContent = inScreen() ? "⛶ Exit full screen" : "⛶ Full screen";
	}
	// fills the browser window; the bar's "Full screen" button (remembered) also asks the browser for real full screen
	function toggleFull(el) {
		var on = !el.classList.contains("tm-fs"); document.querySelectorAll(".tm-fs").forEach(function (x) { x.classList.remove("tm-fs"); });
		if (on) { el.classList.add("tm-fs"); if (S.fs === "screen") enterScreen(); } else leaveScreen();
		drawFsBar(); renderTimers(); renderSw();
	}
	document.addEventListener("fullscreenchange", function () { drawFsBar(); updateDpFs(); });

	/* ---------- settings ---------- */
	function fillSettings() { $("tm-sound").value = S.sound; $("tm-repeat").value = String(S.repeat); $("tm-vol").value = S.vol; $("tm-opt-title").checked = S.optTitle; $("tm-opt-awake").checked = S.optAwake; $("tm-opt-notify").checked = S.optNotify; $("tm-opt-tenths").checked = S.optTenths; }
	$("tm-sound").onchange = function () { S.sound = this.value; save(); };
	$("tm-repeat").onchange = function () { S.repeat = +this.value; save(); };
	function wireAlarmVol() { if ($("tm-al-vol")) { $("tm-al-vol").oninput = function () { S.vol = +this.value; syncVol(); save(); }; $("tm-al-test").onclick = function () { stopSound(); unlock(); if (S.sound === "off") { toast("Sound is set to Silent (see Sound and options)"); return; } playOnce(S.sound); }; syncVol(); } }
	function syncVol() { var a = $("tm-vol"), b = $("tm-al-vol"); if (a) a.value = S.vol; if (b) b.value = S.vol; }
	$("tm-vol").oninput = function () { S.vol = +this.value; syncVol(); save(); };
	$("tm-test").onclick = function () { stopSound(); unlock(); if (S.sound === "off") { toast("Sound is set to Silent"); return; } playOnce(S.sound); };
	$("tm-opt-title").onchange = function () { S.optTitle = this.checked; updateTitle(); save(); };
	function titleOptions() {
		var o = [["auto", "Automatic (the timer finishing soonest)"]]; dpItems().forEach(function (i) { if (i.key === "iv" || i.key === "po" ? visible.indexOf(i.key) >= 0 || S.titleSrc === i.key : true) o.push([i.key, i.label + " (" + i.kind + ")"]); });
		if (!o.some(function (x) { return x[0] === S.titleSrc; })) S.titleSrc = "auto";
		return o;
	}
	function fillTitleSel(sel) { if (!sel || document.activeElement === sel) return; var sig = titleOptions().map(function (x) { return x.join("|"); }).join("~") + S.titleSrc; if (sel._sig === sig) return; sel._sig = sig; sel.innerHTML = titleOptions().map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === S.titleSrc ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join(""); }
	function pickTitle(v) { S.titleSrc = v; try { sessionStorage.setItem(KEY + ":tab", v); } catch (e) {} lastTitle = ""; updateTitle(); save(); [].forEach.call(document.querySelectorAll(".tm-titlesel"), function (x) { x._sig = ""; fillTitleSel(x); }); if ($("tm-timers")) renderTimers(); if ($("tm-sws")) renderSw(); if ($("tm-alarms")) renderAlarms(); dpKeys = ""; if (dpOpen) renderDisplay(); }
	document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-tabpin]"); if (!b) return; e.stopPropagation(); var k = b.dataset.tabpin, on = S.optTitle && S.titleSrc === k; if (!S.optTitle) { S.optTitle = true; $("tm-opt-title").checked = true; } pickTitle(on ? "auto" : k); toast(on ? "Browser tab: automatic" : "Showing this one in the browser tab"); }, true);
	[].forEach.call(document.querySelectorAll(".tm-titlesel"), function (sel) { fillTitleSel(sel); sel.onchange = function () { pickTitle(this.value); }; });
	$("tm-opt-awake").onchange = function () { S.optAwake = this.checked; updateAwake(); save(); };
	$("tm-opt-tenths").onchange = function () { S.optTenths = this.checked; save(); };
	$("tm-opt-notify").onchange = function () {
		var box = this; S.optNotify = box.checked;
		if (box.checked) {
			if (!("Notification" in window)) { toast("This browser does not support notifications"); box.checked = S.optNotify = false; }
			else if (Notification.permission === "denied") { toast("Notifications are blocked for this site in your browser settings"); box.checked = S.optNotify = false; }
			else if (Notification.permission !== "granted") Notification.requestPermission().then(function (p) { if (p !== "granted") { box.checked = S.optNotify = false; toast("Notifications were not allowed"); } save(); });
		}
		save();
	};

	/* ---------- screen awake / tab title ---------- */
	var lock = null;
	function anyRunning() { return S.sws.some(function (w) { return w.st === "run"; }) || S.po.st === "run" || S.iv.st === "run" || S.timers.some(function (t) { return t.st === "run"; }); }
	function updateAwake() {
		if (!("wakeLock" in navigator)) return;
		if (S.optAwake && anyRunning() && !lock) navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }, function () {});
		else if ((!S.optAwake || !anyRunning()) && lock) { lock.release().catch(function () {}); lock = null; }
	}
	document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { lock = null; updateAwake(); } });
	var lastTitle = "";
	function titleFor(key) {
		var m = /^([tsa]):(.+)$/.exec(key), now = Date.now();
		if (m && m[1] === "t") { var t = findTimer(m[2]); return t ? TM.clock(remaining(t), true) + (t.label ? " " + t.label : "") + " | Timer" : null; }
		if (m && m[1] === "s") { var w = findSw(m[2]); return w ? TM.clock(swElapsed(w), false) + (w.label ? " " + w.label : "") + " | Stopwatch" : null; }
		if (m && m[1] === "a") { var a = findAlarm(m[2]); if (!a) return null; var c = alarmCd(a, true); return (c || a.time || "") + (a.label ? " " + a.label : "") + " | Alarm" + (c ? "" : " off"); }
		if (key === "po") return TM.clock(poRemaining(), true) + " " + (S.po.label || PO_LABEL[S.po.phase]) + " | Pomodoro";
		if (key === "iv") { var at = TM.itvAt(ivPlan(), ivElapsed()); return at.done ? null : TM.clock(at.left, true) + " " + (at.seg.phase === "work" ? "WORK" : at.seg.phase === "rest" ? "REST" : "Get ready") + (S.iv.label ? " " + S.iv.label : "") + " | Interval"; }
		if (m && m[1] === "e") return null;
		return null;
	}
	function updateTitle() {
		if (ringing.length) return; var t = BASE_TITLE;
		if (S.optTitle) {
			var picked = S.titleSrc !== "auto" ? titleFor(S.titleSrc) : null;
			if (picked) t = picked;
			else {
				var runs = S.timers.filter(function (x) { return x.st === "run"; }).sort(function (a, b) { return a.end - b.end; }), cands = [];
				if (runs.length) cands.push([remaining(runs[0]), TM.clock(remaining(runs[0]), true) + (runs[0].label ? " " + runs[0].label : "") + " | Timer"]);
				if (S.po.st === "run") cands.push([poRemaining(), TM.clock(poRemaining(), true) + " " + (S.po.label || PO_LABEL[S.po.phase]) + " | Pomodoro"]);
				if (S.iv.st === "run") { var at = TM.itvAt(ivPlan(), ivElapsed()); if (!at.done) cands.push([at.left, TM.clock(at.left, true) + " " + (at.seg.phase === "work" ? "WORK" : at.seg.phase === "rest" ? "REST" : "Get ready") + (S.iv.label ? " " + S.iv.label : "") + " | Interval"]); }
				cands.sort(function (a, b) { return a[0] - b[0]; });
				if (cands.length) t = cands[0][1]; else { var rw = S.sws.filter(function (w) { return w.st === "run"; })[0]; if (rw) t = TM.clock(swElapsed(rw), false) + (rw.label ? " " + rw.label : "") + " | Stopwatch"; }
			}
		}
		if (t !== lastTitle) { document.title = t; lastTitle = t; }
	}

	/* ---------- the tick ---------- */
	var cache = {};
	function tick() {
		var now = Date.now(), changed = false;
		S.timers.forEach(function (t) { if (t.st === "run" && t.end <= now) { t.st = "done"; t.rem = 0; changed = true; ring({ type: "t", id: t.id }, (t.label || "Timer") + " is done"); renderTimers(); } });
		S.alarms.forEach(function (a) {
			if (!a.on) return; var next = alarmNext(a);
			if (next && next <= now) {
				ring({ type: "a", id: a.id }, (a.label || "Alarm") + " · " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); changed = true;
				if (a.snooze && a.snooze <= now) { a.snooze = 0; if (!a.daily && a.at <= now) { a.on = false; a.at = 0; } }
				else if (a.daily) a.at = TM.nextAlarm(a.time, new Date(now + 1000)); else { a.on = false; a.at = 0; }
				renderAlarms();
			}
		});
		var p = S.po;
		if (p.st === "run" && p.end <= now) {
			var wasFocus = p.phase === "focus"; if (wasFocus) { if (p.day !== today()) { p.day = today(); p.done = 0; } p.done++; }
			var n = TM.pomoNext(p.phase, p.round, p.rounds); ring({ type: "p" }, (p.label ? p.label + ": " : "") + (wasFocus ? "Focus session done: time for a " + (n.phase === "long" ? "long" : "short") + " break" : "Break over: back to focus"));
			poSetPhase(n.phase, n.round, p.auto); changed = true;
		}
		var v = S.iv;
		if (v.st === "run") {
			var at = TM.itvAt(ivPlan(), ivElapsed());
			if (at.done) { v.st = "idle"; v.base = TM.itvTotal(ivPlan()); ring({ type: "i" }, (v.label ? v.label + ": " : "") + "Workout complete: " + v.rounds + " rounds done"); renderIv(); changed = true; }
			else {
				if (at.idx !== ivLast) { if (ivLast !== -1 || at.into < 1000) cue(at.seg.phase === "work" ? 988 : at.seg.phase === "rest" ? 523 : 698, 0.35); ivLast = at.idx; ivSec = -1; }
				var sec = Math.ceil(at.left / 1000); if (sec <= 3 && sec >= 1 && sec !== ivSec) { ivSec = sec; cue(784, 0.12); }
			}
		}
		if (changed) { updateAwake(); save(); }
		var f;
		if (visible.indexOf("cd") >= 0) [].forEach.call(document.querySelectorAll("#tm-timers .tm-timer"), function (card) {
			var t = findTimer(card.dataset.id); if (!t) return; f = faceText(t) + "|" + barPct(t);
			if (cache[t.id] !== f) { cache[t.id] = f; card.querySelector("[data-face]").innerHTML = faceText(t); card.querySelector("[data-bar]").style.width = barPct(t) + "%"; }
		});
		if (visible.indexOf("sw") >= 0) [].forEach.call(document.querySelectorAll("#tm-sws .tm-swc"), function (card) { var w = findSw(card.dataset.id); if (w && w.st === "run") card.querySelector("[data-face]").innerHTML = swText(w); });
		if (visible.indexOf("al") >= 0) { var nw = new Date().toLocaleTimeString(); if (cache.al !== nw) { cache.al = nw; $("tm-al-now").textContent = nw; [].forEach.call(document.querySelectorAll("#tm-alarms .tm-alarm"), function (row) { var a = findAlarm(row.dataset.id); if (a) row.querySelector("[data-st]").textContent = alarmStatus(a); }); } [].forEach.call(document.querySelectorAll("#tm-alarms .tm-alarm"), function (row) { var a = findAlarm(row.dataset.id), c = a && alarmCd(a), el = row.querySelector("[data-cd]"); if (el) { el.hidden = !c; if (c && el.textContent !== c) el.textContent = c; } }); }
		if (visible.indexOf("po") >= 0 && p.st === "run") poFace();
		if (visible.indexOf("iv") >= 0 && v.st === "run") ivFace();
		if (visible.indexOf("ev") >= 0) { var sk = Math.floor(now / 1000); if (cache.ev !== sk) { cache.ev = sk; [].forEach.call(document.querySelectorAll("#tm-events .tm-event"), function (card) { var e = S.ev.filter(function (x) { return x.id === card.dataset.id; })[0]; if (e) { var pp = TM.dhms(e.at - now); card.classList.toggle("is-past", pp.past); card.querySelector("[data-evface]").innerHTML = evFace(pp); } }); } }
		if (dpOpen) renderDisplay();
		var tk = Math.floor(now / 1000); if (cache.ts !== tk) { cache.ts = tk; [].forEach.call(document.querySelectorAll(".tm-titlesel"), fillTitleSel); }
		updateTitle();
	}

	/* ---------- keys ---------- */
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select|button)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " ") {
			var b; if (visible[0] === "cd" || !SOLO) b = document.querySelector("#tm-timers .tm-timer [data-a=go], #tm-timers .tm-timer [data-a=pause]");
			if (visible.indexOf("sw") >= 0 && (SOLO || !b)) b = document.querySelector("#tm-sws .tm-swc [data-a=go]") || b;
			if (SOLO) b = { po: $("tm-po-go"), iv: $("tm-iv-go") }[visible[0]] || b;
			if (b) { e.preventDefault(); b.click(); }
		} else if ((e.key === "l" || e.key === "L") && $("tm-sws")) { var lb = document.querySelector("#tm-sws .tm-swc.is-running [data-a=lap]"); if (lb) lb.click(); }
		else if (e.key === "w" || e.key === "W") setWin(!winOn);
		else if ((e.key === "m" || e.key === "M") && winOn) setBar(!S.nobar);
		else if (e.key === "+" || e.key === "=") setZoom(S.zoom * 1.1);
		else if (e.key === "-" || e.key === "_") setZoom(S.zoom / 1.1);
		else if (e.key === "0") setZoom(1);
		else if (e.key === "f" || e.key === "F") { var first = document.querySelector(SOLO ? ".tm-timer, .tm-sec__b" : ".tm-timer"); if (first) toggleFull(first); }
	});

	/* ---------- init ---------- */
	load(); try { S.titleSrc = (sessionStorage.getItem(KEY + ":tab") || "auto").slice(0, 40); } catch (e) {} fillSettings(); [].forEach.call(document.querySelectorAll(".tm-titlesel"), function (x) { x._sig = ""; fillTitleSel(x); });
	var q = new URLSearchParams(location.search);
	if (SOLO && $("tm-onmain")) {
		var v0 = PAGE_VIEWS[0], ob = $("tm-onmain-box"); $("tm-onmain").hidden = false; ob.checked = S.show.indexOf(v0) >= 0;
		$("tm-onmain-txt").innerHTML = "Also show this on the <a href=\"/timer\">All Timers page</a>, together with your other timers (they share the same saved timers)";
		ob.onchange = function () { var i = S.show.indexOf(v0); if (ob.checked && i < 0) S.show.push(v0); else if (!ob.checked && i >= 0) S.show.splice(i, 1); save(); toast(ob.checked ? "It will show on the All Timers page" : "Removed from the All Timers page"); };
	}
	if (CUSTOM && q.get("show")) { var sh = q.get("show").split(",").filter(function (v) { return PANELS[v]; }); if (sh.length) S.show = sh; }
	buildPanels();
	if (q.get("t") && $("tm-timers")) {
		var ms = TM.parseDuration(q.get("t"));
		if (ms) { var t0 = S.timers[0].st === "idle" ? S.timers[0] : (S.timers.push(newTimer(ms)), S.timers[S.timers.length - 1]); t0.total = t0.rem = ms; t0.label = (q.get("label") || "").slice(0, 60); if (q.get("start") === "1") { t0.st = "run"; t0.end = Date.now() + ms; } renderTimers(); }
	}
	if (q.get("date") && $("tm-events")) { var at = TM.parseDateTime(q.get("date"), q.get("time") || ""); if (at && !S.ev.some(function (x) { return x.at === at && x.name === (q.get("name") || ""); })) { S.ev.push({ id: uid(), name: (q.get("name") || "").slice(0, 60), at: at }); renderEvents(); } }
	if (q.toString()) history.replaceState(null, "", location.pathname);
	if (S.win || q.get("window") === "1") setWin(true);
	save(); updateAwake();
	if (q.get("display") === "1") setTimeout(function () { try { openDisplay(); } catch (e) {} }, 300);
	if (missed.length) { var box = $("tm-ring"); box.hidden = false; $("tm-ring-msg").textContent = "While this page was closed: " + missed.join("; ") + "."; $("tm-ring-btns").innerHTML = '<button type="button" data-r="stop">OK</button>'; ringing = []; box.style.animation = "none"; }
	setInterval(tick, 100); tick();
})();
