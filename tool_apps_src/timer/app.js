/* MES Timer 2.0 -- mes.fm/timer (UI; helpers in lib.js, global TM).
 * Countdown timers (several), stopwatch with laps, alarm clock. Time is always measured from Date.now() timestamps, so a background tab, a reload or a
 * throttled interval never drifts. State: localStorage "mes-timer:v1". Links: ?t=25m&label=Focus&start=1, ?tab=sw|al.
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

	/* ---------- state ---------- */
	function newTimer(total) { return { id: uid(), label: "", total: total || 300000, rem: total || 300000, end: 0, st: "idle" }; }
	var S = { tab: "cd", sound: "friendly", vol: 80, repeat: 1, optTitle: true, optAwake: true, optNotify: false, optTenths: false, timers: [newTimer(300000)],
		sw: { st: "idle", startAt: 0, base: 0, laps: [] }, al: { time: "", label: "", daily: false, at: 0, snooze: 0, on: false } };
	var missed = [];     // things that finished while the page was closed
	function load() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (!s) return;
			["tab", "sound"].forEach(function (k) { if (typeof s[k] === "string") S[k] = s[k]; });
			if (!/^(cd|sw|al)$/.test(S.tab)) S.tab = "cd";
			if (typeof s.vol === "number") S.vol = Math.max(0, Math.min(100, s.vol));
			if (s.repeat === 0 || s.repeat === 1 || s.repeat === 3) S.repeat = s.repeat;
			["optTitle", "optAwake", "optNotify", "optTenths"].forEach(function (k) { if (typeof s[k] === "boolean") S[k] = s[k]; });
			if (Array.isArray(s.timers) && s.timers.length) S.timers = s.timers.slice(0, 8).map(function (t) { return { id: String(t.id || uid()), label: String(t.label || "").slice(0, 60), total: +t.total > 0 ? +t.total : 300000, rem: +t.rem >= 0 ? +t.rem : (+t.total || 300000), end: +t.end || 0, st: /^(idle|run|pause|done)$/.test(t.st) ? t.st : "idle" }; });
			if (s.sw && typeof s.sw === "object") S.sw = { st: /^(idle|run|pause)$/.test(s.sw.st) ? s.sw.st : "idle", startAt: +s.sw.startAt || 0, base: +s.sw.base || 0, laps: Array.isArray(s.sw.laps) ? s.sw.laps.map(Number).filter(isFinite).slice(0, 500) : [] };
			if (s.al && typeof s.al === "object") S.al = { time: String(s.al.time || ""), label: String(s.al.label || "").slice(0, 60), daily: !!s.al.daily, at: +s.al.at || 0, snooze: +s.al.snooze || 0, on: !!s.al.on };
		} catch (e) { memOnly = true; }
		var now = Date.now();
		S.timers.forEach(function (t) { if (t.st === "run" && t.end <= now) { t.st = "done"; t.rem = 0; missed.push((t.label || "Timer") + " finished at " + new Date(t.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); } });
		if (S.al.on && S.al.at && S.al.at <= now && !(S.al.snooze > now)) {
			missed.push("The alarm" + (S.al.label ? " “" + S.al.label + "”" : "") + " for " + S.al.time + " went off while the page was closed");
			if (S.al.daily) S.al.at = TM.nextAlarm(S.al.time, new Date()); else { S.al.on = false; S.al.at = 0; }
		}
	}
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(S)); memOnly = false; } catch (e) { memOnly = true; }
		$("tm-store-note").textContent = memOnly ? "Your browser is blocking storage, so timers will not survive a reload." : "Your timers and settings are saved in this browser.";
	}
	function toast(msg) {
		var t = $("tm-toast"); if (!t) { t = document.createElement("div"); t.id = "tm-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200);
	}

	/* ---------- sound ---------- */
	var snd = { ctx: null, gain: null, audio: {}, loopT: null, left: 0, active: false };
	function unlock() {
		try {
			if (!snd.ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) { snd.ctx = new AC(); snd.gain = snd.ctx.createGain(); snd.gain.connect(snd.ctx.destination); } }
			if (snd.ctx && snd.ctx.state === "suspended") snd.ctx.resume();
		} catch (e) {}
		if (!snd.audio.friendly) { snd.audio.friendly = new Audio("/timer/audio/grandfather_alarm_clock.mp3"); snd.audio.annoying = new Audio("/timer/audio/annoying_alarm_clock.mp3"); snd.audio.friendly.preload = snd.audio.annoying.preload = "auto"; }
	}
	function vol() { return Math.max(0, Math.min(1, S.vol / 100)); }
	function tone(freq, start, dur, type, peak) {
		var c = snd.ctx; if (!c) return;
		var o = c.createOscillator(), g = c.createGain(); o.type = type || "sine"; o.frequency.value = freq;
		g.gain.setValueAtTime(0.0001, c.currentTime + start); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (peak || 0.5) * vol()), c.currentTime + start + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
		o.connect(g); g.connect(snd.ctx.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
	}
	// plays one repetition of the chosen sound; returns its length in ms (for the repeat loop)
	function playOnce(kind) {
		unlock();
		if (kind === "off") return 0;
		if (kind === "beep") { for (var i = 0; i < 3; i++) tone(880, i * 0.28, 0.16, "square", 0.25); return 1300; }
		if (kind === "chime") { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, i * 0.32, 1.2, "sine", 0.45); }); return 2600; }
		var a = snd.audio[kind]; if (!a) return 0;
		try { a.volume = vol(); a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
		return (isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : 6000) + 400;
	}
	function startRing(count) {      // count: repetitions; 0 = until stopped
		stopSound(); if (S.sound === "off") return; snd.active = true; snd.left = count;
		(function next() {
			if (!snd.active) return; var ms = playOnce(S.sound);
			if (snd.left > 0) snd.left--; if (snd.left === 0 && count !== 0) { snd.loopT = setTimeout(function () { snd.active = false; }, ms); return; }
			snd.loopT = setTimeout(next, Math.max(800, ms));
		})();
	}
	function stopSound() {
		snd.active = false; clearTimeout(snd.loopT);
		["friendly", "annoying"].forEach(function (k) { if (snd.audio[k]) { try { snd.audio[k].pause(); snd.audio[k].currentTime = 0; } catch (e) {} } });
	}

	/* ---------- ringing ---------- */
	var ringing = [];       // [{type: "t", id} | {type: "a"}]
	var blinkT = null;
	function notify(title, body) {
		if (!S.optNotify || !("Notification" in window) || Notification.permission !== "granted") return;
		try { new Notification(title, { body: body || "", tag: "mes-timer" }); } catch (e) {}
	}
	function ring(item, msg) {
		ringing.push(item); notify("⏰ " + msg, "mes.fm/timer");
		startRing(S.repeat); drawRing();
		if (!blinkT) blinkT = setInterval(function () { document.title = document.title.charAt(0) === "⏰" ? BASE_TITLE : "⏰ Time's up! | Timer"; }, 800);
	}
	function drawRing() {
		var box = $("tm-ring"); box.hidden = !ringing.length; if (!ringing.length) { clearInterval(blinkT); blinkT = null; updateTitle(); return; }
		var names = ringing.map(function (r) { if (r.type === "t") { var t = findTimer(r.id); return (t && t.label) || "Timer"; } return S.al.label || "Alarm"; });
		$("tm-ring-msg").innerHTML = "⏰ " + esc(names.join(", ")) + (ringing.every(function (r) { return r.type === "t"; }) ? " — time is up!" : " — it is " + esc(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) + "!");
		var hasAlarm = ringing.some(function (r) { return r.type === "a"; });
		$("tm-ring-btns").innerHTML = '<button type="button" data-r="stop">Stop</button>' + (hasAlarm ? '<button type="button" class="alt" data-r="snooze5">Snooze 5 min</button><button type="button" class="alt" data-r="snooze10">Snooze 10 min</button>' : '<button type="button" class="alt" data-r="add1">+1 min</button><button type="button" class="alt" data-r="add5">+5 min</button>');
	}
	$("tm-ring-btns").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var a = b.dataset.r, now = Date.now();
		stopSound();
		ringing.forEach(function (r) {
			if (r.type === "t") { var t = findTimer(r.id); if (!t) return; if (a === "add1" || a === "add5") { var ms = a === "add1" ? 60000 : 300000; t.st = "run"; t.total = ms; t.end = now + ms; } }
			else if (a === "snooze5" || a === "snooze10") { S.al.snooze = now + (a === "snooze5" ? 300000 : 600000); S.al.on = true; if (!S.al.at || S.al.at < now) S.al.at = S.al.snooze; }
		});
		ringing = []; drawRing(); renderTimers(); renderAlarm(); save();
	});

	/* ---------- countdown timers ---------- */
	function findTimer(id) { for (var i = 0; i < S.timers.length; i++) if (S.timers[i].id === id) return S.timers[i]; return null; }
	function remaining(t) { var now = Date.now(); return t.st === "run" ? Math.max(0, t.end - now) : t.st === "done" ? 0 : t.rem; }
	function faceText(t) {
		var ms = remaining(t), p = TM.parts(ms, true), s;
		if (S.optTenths && t.st === "run" && ms < 60000) { var q = TM.parts(ms, false); s = TM.pad(q.m) + ":" + TM.pad(q.s) + "<small>." + q.t + "</small>"; if (q.h) s = q.h + ":" + s; return s; }
		return TM.clock(ms, true, false);
	}
	function btnsFor(t) {
		var b = function (a, label, cls) { return '<button type="button" class="tu-btn ' + (cls || "") + ' tm-big" data-a="' + a + '">' + label + "</button>"; };
		if (t.st === "idle") return b("go", "Start", "tu-btn--primary");
		if (t.st === "run") return b("pause", "Pause", "tu-btn--primary") + b("add1", "+1 min", "") + b("reset", "Reset", "tu-btn--ghost");
		if (t.st === "pause") return b("go", "Resume", "tu-btn--primary") + b("add1", "+1 min", "") + b("reset", "Reset", "tu-btn--ghost");
		return b("restart", "Restart", "tu-btn--primary") + b("reset", "Dismiss", "tu-btn--ghost");
	}
	function cardHtml(t, i) {
		var p = TM.parts(t.total, false), idle = t.st === "idle" || t.st === "done", full = $("tm-timers").querySelector('.tm-timer[data-id="' + t.id + '"]');
		var isFs = full && full.classList.contains("tm-fs");
		return '<div class="tm-timer is-' + (t.st === "run" ? "running" : t.st) + (isFs ? " tm-fs" : "") + '" data-id="' + t.id + '">' +
			'<div class="tm-head"><input class="tm-label" type="text" maxlength="60" autocomplete="off" placeholder="Timer ' + (i + 1) + '" aria-label="Label for timer ' + (i + 1) + '" value="' + esc(t.label) + '">' +
			'<button type="button" class="tm-icon" data-a="full" title="Full screen" aria-label="Full screen">' + (isFs ? "✕ Close" : "⤢") + '</button>' + (S.timers.length > 1 ? '<button type="button" class="tm-icon" data-a="del" title="Remove this timer" aria-label="Remove this timer">✕</button>' : "") + "</div>" +
			'<div class="tm-face" data-face>' + faceText(t) + "</div>" +
			'<div class="tm-bar"><i data-bar style="width:' + barPct(t) + '%"></i></div>' +
			(idle ? '<div class="tm-presets">' + PRESETS.map(function (x) { return '<button type="button" class="tu-chip" data-p="' + x[1] + '">' + x[0] + "</button>"; }).join("") + "</div>" +
				'<div class="tm-set"><input class="tu-input" data-k="h" type="text" inputmode="numeric" value="' + p.h + '" aria-label="Hours"><span>h</span><input class="tu-input" data-k="m" type="text" inputmode="numeric" value="' + p.m + '" aria-label="Minutes"><span>m</span><input class="tu-input" data-k="s" type="text" inputmode="numeric" value="' + p.s + '" aria-label="Seconds"><span>s</span></div>' : "") +
			'<div class="tm-btns tm-btns--center">' + btnsFor(t) + "</div></div>";
	}
	function barPct(t) { return t.total > 0 ? Math.max(0, Math.min(100, (1 - remaining(t) / t.total) * 100)).toFixed(2) : 0; }
	function renderTimers() {
		var focusId = document.activeElement && document.activeElement.closest && document.activeElement.closest(".tm-timer") ? document.activeElement.closest(".tm-timer").dataset.id : null, focusCls = focusId && document.activeElement.className;
		$("tm-timers").innerHTML = S.timers.map(cardHtml).join("");
		if (focusId && /tm-label/.test(focusCls)) { var el = $("tm-timers").querySelector('.tm-timer[data-id="' + focusId + '"] .tm-label'); if (el) { el.focus(); var v = el.value; el.value = ""; el.value = v; } }
		$("tm-add").hidden = S.timers.length >= 8;
	}
	var timersBox = $("tm-timers");
	timersBox.addEventListener("click", function (e) {
		var card = e.target.closest(".tm-timer"); if (!card) return; var t = findTimer(card.dataset.id); if (!t) return;
		var chip = e.target.closest("[data-p]"); if (chip) { t.total = t.rem = +chip.dataset.p; t.st = "idle"; renderTimers(); save(); return; }
		var btn = e.target.closest("[data-a]"); if (!btn) return; var a = btn.dataset.a, now = Date.now();
		unlock();
		if (a === "go" || a === "restart") {
			if (t.st === "idle" || t.st === "done") { readInputs(card, t); if (t.total <= 0) { toast("Set a time first"); return; } t.rem = t.total; }
			t.end = now + t.rem; t.st = "run"; ensureNotify();
		} else if (a === "pause") { t.rem = Math.max(0, t.end - now); t.st = "pause"; }
		else if (a === "add1") { if (t.st === "run") t.end += 60000; else t.rem += 60000; t.total += 60000; }
		else if (a === "reset") { clearRingFor(t.id); t.st = "idle"; t.rem = t.total; }
		else if (a === "del") { clearRingFor(t.id); S.timers = S.timers.filter(function (x) { return x !== t; }); }
		else if (a === "full") { toggleFull(card); return; }
		renderTimers(); updateAwake(); updateTitle(); save();
	});
	function readInputs(card, t) {
		var v = {}; [].forEach.call(card.querySelectorAll(".tm-set input"), function (i) { v[i.dataset.k] = i.value; });
		if (card.querySelector(".tm-set")) { var ms = TM.hmsToMs(v.h, v.m, v.s); t.total = ms; }
	}
	timersBox.addEventListener("input", function (e) {
		var card = e.target.closest(".tm-timer"); if (!card) return; var t = findTimer(card.dataset.id); if (!t) return;
		if (e.target.classList.contains("tm-label")) { t.label = e.target.value; save(); return; }
		if (e.target.dataset.k) { readInputs(card, t); if (t.st === "idle") t.rem = t.total; card.querySelector("[data-face]").innerHTML = faceText(t); save(); }
	});
	timersBox.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.dataset.k) { var b = e.target.closest(".tm-timer").querySelector('[data-a="go"]'); if (b) b.click(); } });
	$("tm-add").onclick = function () { if (S.timers.length >= 8) return; S.timers.push(newTimer(300000)); renderTimers(); save(); var l = timersBox.querySelector(".tm-timer:last-child .tm-label"); if (l) l.focus(); };
	function clearRingFor(id) { var n = ringing.length; ringing = ringing.filter(function (r) { return !(r.type === "t" && r.id === id); }); if (n !== ringing.length) { if (!ringing.length) stopSound(); drawRing(); } }
	function ensureNotify() { /* permission is requested when the option is switched on */ }

	/* ---------- full screen ---------- */
	function toggleFull(el) {
		var on = !el.classList.contains("tm-fs");
		document.querySelectorAll(".tm-fs").forEach(function (x) { x.classList.remove("tm-fs"); });
		if (on) { el.classList.add("tm-fs"); try { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); } catch (e) {} }
		else if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
		renderTimers(); if (S.tab === "sw") swFullBtn();
	}
	document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement) { document.querySelectorAll(".tm-fs").forEach(function (x) { x.classList.remove("tm-fs"); }); renderTimers(); swFullBtn(); } });
	function swFullBtn() { $("tm-sw-full").textContent = $("tm-sw").classList.contains("tm-fs") ? "✕ Close" : "⤢ Full screen"; }

	/* ---------- stopwatch ---------- */
	function swElapsed() { return S.sw.st === "run" ? S.sw.base + (Date.now() - S.sw.startAt) : S.sw.base; }
	function swText() { var ms = swElapsed(), p = TM.parts(ms, false); return (p.h ? p.h + ":" + TM.pad(p.m) : TM.pad(p.m)) + ":" + TM.pad(p.s) + "<small>." + TM.pad(Math.floor(p.ms / 10)) + "</small>"; }
	function renderSw() {
		var st = S.sw.st; $("tm-sw-go").textContent = st === "run" ? "Pause" : st === "pause" ? "Resume" : "Start"; $("tm-sw-lap").disabled = st !== "run"; $("tm-sw-reset").disabled = st === "idle" && !S.sw.laps.length;
		var L = TM.laps(S.sw.laps); $("tm-laps-box").hidden = !L.rows.length;
		$("tm-laps").innerHTML = L.rows.length ? "<thead><tr><th>Lap</th><th>Lap time</th><th>Total</th></tr></thead><tbody>" + L.rows.slice().reverse().map(function (r) { var i = r.n - 1; return '<tr class="' + (i === L.fast ? "tm-fast" : i === L.slow ? "tm-slow" : "") + '"><td>' + r.n + (i === L.fast ? " ▲ fastest" : i === L.slow ? " ▼ slowest" : "") + "</td><td>" + TM.precise(r.lap) + "</td><td>" + TM.precise(r.total) + "</td></tr>"; }).join("") + "</tbody>" : "";
		$("tm-sw-face").innerHTML = swText();
	}
	$("tm-sw-go").onclick = function () {
		unlock(); var now = Date.now();
		if (S.sw.st === "run") { S.sw.base += now - S.sw.startAt; S.sw.st = "pause"; } else { S.sw.startAt = now; S.sw.st = "run"; }
		renderSw(); updateAwake(); updateTitle(); save();
	};
	$("tm-sw-lap").onclick = function () { if (S.sw.st !== "run") return; S.sw.laps.push(swElapsed()); renderSw(); save(); };
	$("tm-sw-reset").onclick = function () { S.sw = { st: "idle", startAt: 0, base: 0, laps: [] }; renderSw(); updateAwake(); updateTitle(); save(); };
	$("tm-sw-full").onclick = function () { toggleFull($("tm-sw")); };
	$("tm-laps-copy").onclick = function () {
		var L = TM.laps(S.sw.laps), t = "Lap\tLap time\tTotal\n" + L.rows.map(function (r) { return r.n + "\t" + TM.precise(r.lap) + "\t" + TM.precise(r.total); }).join("\n");
		copyText(t, "Laps copied");
	};
	function copyText(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}

	/* ---------- alarm ---------- */
	function alarmStatus() {
		var a = S.al, now = Date.now(), next = a.snooze > now ? a.snooze : a.at;
		if (!a.on || !next) return "No alarm set.";
		var d = new Date(next), when = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (new Date(next).toDateString() !== new Date().toDateString() ? " tomorrow" : "");
		return "⏰ " + (a.snooze > now ? "Snoozed until " : "Alarm set for ") + "<b>" + esc(when) + "</b>" + (a.label ? " (" + esc(a.label) + ")" : "") + (a.daily && a.snooze <= now ? ", every day" : "") + " — rings in " + TM.human(next - now) + ".";
	}
	function renderAlarm() {
		$("tm-al-time").value = S.al.time; $("tm-al-label").value = S.al.label; $("tm-al-daily").checked = S.al.daily;
		$("tm-al-set").textContent = S.al.on ? "Update alarm" : "Set alarm"; $("tm-al-clear").hidden = !S.al.on; $("tm-al-status").innerHTML = alarmStatus();
	}
	$("tm-al-set").onclick = function () {
		var time = $("tm-al-time").value; if (!time) { toast("Pick a time first"); $("tm-al-time").focus(); return; }
		unlock(); S.al.time = time; S.al.label = $("tm-al-label").value.trim(); S.al.daily = $("tm-al-daily").checked; S.al.at = TM.nextAlarm(time, new Date()); S.al.snooze = 0; S.al.on = true;
		ensureNotify(); renderAlarm(); save();
	};
	$("tm-al-clear").onclick = function () { S.al.on = false; S.al.at = 0; S.al.snooze = 0; renderAlarm(); save(); };

	/* ---------- tabs ---------- */
	function showTab(tab) {
		S.tab = tab; [].forEach.call($("tm-tabs").children, function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
		["cd", "sw", "al"].forEach(function (k) { $("tm-" + k).hidden = k !== tab; });
		if (tab === "sw") renderSw(); if (tab === "al") renderAlarm(); save();
	}
	$("tm-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });

	/* ---------- settings ---------- */
	function fillSettings() { $("tm-sound").value = S.sound; $("tm-repeat").value = String(S.repeat); $("tm-vol").value = S.vol; $("tm-opt-title").checked = S.optTitle; $("tm-opt-awake").checked = S.optAwake; $("tm-opt-notify").checked = S.optNotify; $("tm-opt-tenths").checked = S.optTenths; }
	$("tm-sound").onchange = function () { S.sound = this.value; save(); };
	$("tm-repeat").onchange = function () { S.repeat = +this.value; save(); };
	$("tm-vol").oninput = function () { S.vol = +this.value; save(); };
	$("tm-test").onclick = function () { stopSound(); unlock(); if (S.sound === "off") { toast("Sound is set to Silent"); return; } playOnce(S.sound); };
	$("tm-opt-title").onchange = function () { S.optTitle = this.checked; updateTitle(); save(); };
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

	/* ---------- keep the screen awake / tab title ---------- */
	var lock = null;
	function anyRunning() { return S.sw.st === "run" || S.timers.some(function (t) { return t.st === "run"; }); }
	function updateAwake() {
		if (!("wakeLock" in navigator)) return;
		if (S.optAwake && anyRunning() && !lock) navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }, function () {});
		else if ((!S.optAwake || !anyRunning()) && lock) { lock.release().catch(function () {}); lock = null; }
	}
	document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { lock = null; updateAwake(); } });
	var lastTitle = "";
	function updateTitle() {
		if (ringing.length) return;
		var t = BASE_TITLE;
		if (S.optTitle) {
			var runs = S.timers.filter(function (x) { return x.st === "run"; }).sort(function (a, b) { return a.end - b.end; });
			if (runs.length) t = TM.clock(remaining(runs[0]), true) + (runs[0].label ? " " + runs[0].label : "") + " | Timer";
			else if (S.sw.st === "run") t = TM.clock(swElapsed(), false) + " | Stopwatch";
		}
		if (t !== lastTitle) { document.title = t; lastTitle = t; }
	}

	/* ---------- the tick ---------- */
	var cache = {};
	function tick() {
		var now = Date.now(), changed = false;
		S.timers.forEach(function (t) {
			if (t.st === "run" && t.end <= now) { t.st = "done"; t.rem = 0; changed = true; ring({ type: "t", id: t.id }, (t.label || "Timer") + " is done"); renderTimers(); }
		});
		if (S.al.on) {
			var next = S.al.snooze > now ? S.al.snooze : S.al.at;
			if (next && next <= now) {
				ring({ type: "a" }, S.al.label || "Alarm"); changed = true;
				if (S.al.snooze && S.al.snooze <= now) { S.al.snooze = 0; if (!S.al.daily && S.al.at <= now) { S.al.on = false; S.al.at = 0; } }
				else if (S.al.daily) S.al.at = TM.nextAlarm(S.al.time, new Date(now + 1000)); else { S.al.on = false; S.al.at = 0; }
				renderAlarm();
			}
		}
		if (changed) { updateAwake(); save(); }
		if (S.tab === "cd") [].forEach.call(timersBox.querySelectorAll(".tm-timer"), function (card) {
			var t = findTimer(card.dataset.id); if (!t) return; var f = faceText(t) + "|" + barPct(t);
			if (cache[t.id] !== f) { cache[t.id] = f; card.querySelector("[data-face]").innerHTML = faceText(t); card.querySelector("[data-bar]").style.width = barPct(t) + "%"; }
		});
		else if (S.tab === "sw") { if (S.sw.st === "run") $("tm-sw-face").innerHTML = swText(); }
		else { var n = new Date().toLocaleTimeString(); if (cache.al !== n) { cache.al = n; $("tm-al-now").textContent = n; if (S.al.on) $("tm-al-status").innerHTML = alarmStatus(); } }
		updateTitle();
	}

	/* ---------- keys ---------- */
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select|button)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " ") { e.preventDefault(); if (S.tab === "cd") { var b = timersBox.querySelector(".tm-timer [data-a=go], .tm-timer [data-a=pause]"); if (b) b.click(); } else if (S.tab === "sw") $("tm-sw-go").click(); }
		else if ((e.key === "l" || e.key === "L") && S.tab === "sw") $("tm-sw-lap").click();
		else if ((e.key === "f" || e.key === "F")) { if (S.tab === "cd") { var c = timersBox.querySelector(".tm-timer"); if (c) toggleFull(c); } else if (S.tab === "sw") toggleFull($("tm-sw")); }
	});

	/* ---------- init ---------- */
	load(); fillSettings(); renderTimers(); renderSw(); renderAlarm();
	var q = new URLSearchParams(location.search);
	if (q.get("tab") === "sw" || q.get("tab") === "al") S.tab = q.get("tab");
	if (q.get("t")) {
		var ms = TM.parseDuration(q.get("t"));
		if (ms) { var t0 = S.timers[0].st === "idle" ? S.timers[0] : (S.timers.push(newTimer(ms)), S.timers[S.timers.length - 1]); t0.total = t0.rem = ms; t0.label = (q.get("label") || "").slice(0, 60); if (q.get("start") === "1") { t0.st = "run"; t0.end = Date.now() + ms; } S.tab = "cd"; renderTimers(); }
	}
	if (q.toString()) history.replaceState(null, "", location.pathname);
	showTab(S.tab); save(); updateAwake();
	if (missed.length) { var box = $("tm-ring"); box.hidden = false; $("tm-ring-msg").textContent = "While this page was closed: " + missed.join("; ") + "."; $("tm-ring-btns").innerHTML = '<button type="button" data-r="stop">OK</button>'; ringing = []; box.style.animation = "none"; }
	setInterval(tick, 100); tick();
})();
