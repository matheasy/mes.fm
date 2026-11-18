/* MES Timer app: native helpers (copied into www/js by build-www.py).
 *
 * Like a phone's own timer app:
 *  - Live status: running countdowns / stopwatches / Pomodoro / interval phases are shown outside the app.
 *    Android: ongoing notifications with a live countdown (Android 16: also a chip in the status bar), shown while the app is
 *    in the background. iPhone: a Live Activity (lock screen + Dynamic Island), kept up to date while something runs.
 *  - Alerts while the app is closed: everything due (finished countdowns, alarms, Pomodoro phase ends, interval phase
 *    changes, date countdowns) is handed to the phone when the app goes to the background and taken back when it returns
 *    (the page rings by itself while it is open, so nothing alerts twice).
 *    Android: real alarm-clock alarms (alarm icon in the status bar, full-screen Stop / Snooze screen over the lock screen,
 *    sound repeats until stopped). iPhone 26+: AlarmKit system alarms (ring like the Clock app, even on silent); older
 *    iPhones: time-sensitive notifications with the alarm sound.
 *  - Settings (in the page's Sound and options card): live status on/off, alerts on/off, "ring like an alarm" on/off.
 *  - Keeps the screen awake while something runs (the page's own setting).
 */
(function () {
	"use strict";
	var C = window.Capacitor;
	if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
	var android = C.getPlatform && C.getPlatform() === "android", ios = !android;
	var P = C.Plugins || {}, LN = P.LocalNotifications, App = P.App, KA = P.KeepAwake, TS = P.TimerStatus;
	// The app's own plugin is registered from native code after the plugin headers were read (iOS), so it may be missing
	// from Capacitor.Plugins: call it through the bridge directly then.
	if (!TS && C.nativePromise) {
		TS = {};
		["liveActivity", "alarmsAvailable", "scheduleAlarms", "cancel", "openSettings", "showRunning", "clearRunning", "takeChanges", "schedule", "status"].forEach(function (m) {
			TS[m] = function (o) { return C.nativePromise("TimerStatus", m, o || {}); };
		});
		if (!android) { delete TS.showRunning; delete TS.clearRunning; delete TS.takeChanges; delete TS.schedule; delete TS.status; }
	}
	var KEY = "mes-timer:v1", OKEY = "mes-timer-app:opts", MAXN = 60, asked = false;

	/* ---------- options ---------- */
	var O = { live: true, alerts: true, ring: true, style: "auto", icon: "big" };
	try { var so = JSON.parse(localStorage.getItem(OKEY) || "null"); if (so) Object.keys(O).forEach(function (k) { if (typeof so[k] === typeof O[k]) O[k] = so[k]; }); } catch (e) {}
	function saveO() { try { localStorage.setItem(OKEY, JSON.stringify(O)); } catch (e) {} }

	function state() { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } }
	function fmtDur(ms) { var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return ((h ? h + " h " : "") + (m ? m + " min " : "") + (!h && r ? r + " s" : "")).trim(); }
	function ivSegs(iv) {
		var prep = Math.max(0, +iv.prep || 0) * 1000, work = Math.max(1, +iv.work || 1) * 1000, rest = Math.max(0, +iv.rest || 0) * 1000, rounds = Math.max(1, Math.min(99, Math.floor(+iv.rounds || 1)));
		var segs = []; if (prep) segs.push(["prep", 0, prep]);
		for (var r = 1; r <= rounds; r++) { segs.push(["work", r, work]); if (rest && r < rounds) segs.push(["rest", r, rest]); }
		return { segs: segs, rounds: rounds };
	}
	var PO_NAME = { focus: "Focus", short: "Short break", long: "Long break" };

	/* ---------- what is due (alerts) ---------- */
	function upcoming() {
		var S = state(), now = Date.now(), out = [];
		var muted = S.muted || [];
		function add(at, title, body, ring, key) { if (at > now + 800) out.push({ at: at, title: title, body: body || "", ring: !!ring, key: key || "", mute: !!key && muted.indexOf(key) >= 0 }); }
		(S.timers || []).forEach(function (t) { if (t.st === "run" && t.end) add(t.end, (t.label ? t.label + ": " : "") + "Time is up", "Countdown of " + fmtDur(t.total || 0) + " finished." + (t.say ? " " + t.say : ""), true, "t:" + t.id); });
		(S.alarms || []).forEach(function (a) {
			if (!a.on) return;
			var at = a.snooze > now ? a.snooze : a.at;
			if (at) add(at, "Alarm " + (a.time || "") + (a.label ? ": " + a.label : ""), a.say || (a.snooze > now ? "Snooze is over." : "Your alarm is going off."), true, "a:" + a.id);
		});
		var po = S.po;
		if (po && po.st === "run" && po.end) {
			var names = { focus: "Focus time is over: take a break", short: "Break is over: back to focus", long: "Long break is over" };
			add(po.end, (po.label ? po.label + ": " : "") + (names[po.phase] || "Pomodoro phase finished"), "Pomodoro round " + (po.round || 1) + ".", true, "po");
		}
		var iv = S.iv;
		if (iv && iv.st === "run") {
			var pl = ivSegs(iv), start = iv.startAt - (iv.base || 0), acc = 0, n = 0;
			for (var i = 0; i < pl.segs.length && n < 50; i++) {
				acc += pl.segs[i][2];
				var nx = pl.segs[i + 1], at = start + acc;
				if (at <= now + 800) continue;
				n++;
				if (!nx) add(at, (iv.label ? iv.label + ": " : "") + "Workout done", pl.rounds + " rounds finished.", true, "iv");
				else add(at, nx[0] === "work" ? "WORK – round " + nx[1] + " of " + pl.rounds : "REST", nx[0] === "work" ? fmtDur(nx[2]) + " of work" : fmtDur(nx[2]) + " rest", false, "iv");
			}
		}
		(S.ev || []).forEach(function (e) { if (e.at && e.at - now < 30 * 864e5) add(e.at, e.name || "Countdown", "The date you were counting down to is here.", true); });
		out.sort(function (a, b) { return a.at - b.at; });
		return out.slice(0, MAXN);
	}

	/* ---------- what is running or paused (live status) ----------
	   Android: TimerLive / TimerService keep these as notifications with the time as the big line and Pause / Resume, Cancel and
	   Sound buttons (paused ones stay until swiped away). iPhone: the Live Activity gets the running ones (title / end / start). */
	function runningItems(withPaused) {
		var S = state(), now = Date.now(), out = [], muted = S.muted || [];
		function mu(k) { return muted.indexOf(k) >= 0; }
		(S.timers || []).forEach(function (t, i) {
			var run = t.st === "run" && t.end > now, pz = withPaused && t.st === "pause" && t.rem > 0;
			if (run || pz) out.push({ key: "t:" + t.id, kind: "t", label: t.label || (S.timers.length > 1 ? "Timer " + (i + 1) : ""), st: run ? "run" : "pause", end: t.end, rem: t.rem, total: t.total, mute: mu("t:" + t.id), title: t.label || "Countdown", text: "Countdown of " + fmtDur(t.total || 0) });
		});
		var po = S.po;
		if (po && ((po.st === "run" && po.end > now) || (withPaused && po.st === "pause" && po.rem > 0))) {
			var pt = (po.label ? po.label + " · " : "") + (PO_NAME[po.phase] || "Pomodoro");
			out.push({ key: "po", kind: "po", label: pt, st: po.st, end: po.end, rem: po.rem, mute: mu("po"), title: pt, text: "Pomodoro round " + (po.round || 1) });
		}
		var iv = S.iv;
		if (iv && (iv.st === "run" || (withPaused && iv.st === "pause"))) {
			var pl = ivSegs(iv), el = (iv.base || 0) + (iv.st === "run" ? now - iv.startAt : 0), acc = 0, segs = [], cur = null;
			pl.segs.forEach(function (sg) { segs.push([(sg[0] === "work" ? "WORK" : sg[0] === "rest" ? "REST" : "Get ready") + (sg[1] ? " – round " + sg[1] + " of " + pl.rounds : ""), sg[2]]); });
			for (var k = 0; k < pl.segs.length; k++) { acc += pl.segs[k][2]; if (el < acc) { cur = { title: segs[k][0], end: iv.startAt - (iv.base || 0) + acc }; break; } }
			if (cur) out.push({ key: "iv", kind: "iv", label: iv.label || "", st: iv.st, startAt: iv.startAt, base: iv.base || 0, segs: segs, mute: mu("iv"), title: cur.title, end: cur.end, text: iv.label || "Interval workout" });
		}
		(S.sws || []).forEach(function (w, i) {
			if (w.st === "run" || (withPaused && w.st === "pause" && w.base > 0)) out.push({ key: "s:" + w.id, kind: "s", label: w.label || (S.sws.length > 1 ? "Stopwatch " + (i + 1) : ""), st: w.st, startAt: w.startAt, base: w.base || 0, title: w.label || "Stopwatch", start: w.startAt - (w.base || 0), text: "Stopwatch running" });
		});
		out.sort(function (a, b) { return (a.st === "run" ? 0 : 1) - (b.st === "run" ? 0 : 1) || (a.end || 9e15) - (b.end || 9e15); });
		return out.slice(0, 6);
	}

	function ivLeft(x) { var acc = 0; for (var i = 0; i < x.segs.length; i++) { acc += x.segs[i][1]; if (x.base < acc) return acc - x.base; } return 0; }

	/* ---------- changes made with the notification buttons (Android) ---------- */
	function applyChanges() {
		if (!android || !TS || !TS.takeChanges) return Promise.resolve();
		return TS.takeChanges().then(function (r) {
			var ch = r && r.changes || {}, keys = Object.keys(ch);
			if (!keys.length) return;
			function patch(S) {
				S.muted = S.muted || [];
				keys.forEach(function (key) {
					var c = ch[key], m = /^([ts]):(.+)$/.exec(key), x = null;
					if (m && m[1] === "t") x = (S.timers || []).filter(function (t) { return t.id === m[2]; })[0];
					else if (m && m[1] === "s") x = (S.sws || []).filter(function (w) { return w.id === m[2]; })[0];
					else if (key === "po") x = S.po; else if (key === "iv") x = S.iv;
					if (x) {
						if (c.st === "gone") {
							if (m && m[1] === "t") { x.st = "idle"; x.rem = x.total; x.end = 0; }
							else if (m && m[1] === "s") { x.st = "idle"; x.startAt = 0; x.base = 0; x.laps = []; }
							else if (key === "po") { x.phase = "focus"; x.round = 1; x.rem = (x.focus || 25) * 60000; x.st = "idle"; x.end = 0; }
							else { x.st = "idle"; x.base = 0; x.startAt = 0; }
						} else {
							x.st = c.st;
							["end", "rem", "startAt", "base"].forEach(function (f) { if (typeof c[f] === "number" && f in x) x[f] = c[f]; });
						}
					}
					var i = S.muted.indexOf(key);
					if (c.mute && i < 0) S.muted.push(key); else if (!c.mute && i >= 0) S.muted.splice(i, 1);
				});
			}
			if (window.MESTimerHook) window.MESTimerHook.apply(patch);
			else { var S = state(); patch(S); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} location.reload(); return; }
			liveSig = ""; liveUpdate(true);
		}).catch(function () {});
	}
	if (android && TS && TS.addListener) { try { TS.addListener("liveChanged", function () { applyChanges(); }); } catch (e) {} }

	/* ---------- alerts: hand to the phone / take back ---------- */
	function lnCancelAll() {
		if (!LN || android) return Promise.resolve();   // Android alerts are TimerStatus alarms; LN.removeAllDelivered would also wipe the live countdown
		return LN.getPending().then(function (r) {
			var ids = (r && r.notifications || []).map(function (n) { return { id: n.id }; });
			return ids.length ? LN.cancel({ notifications: ids }) : null;
		}).catch(function () {}).then(function () { return LN.removeAllDeliveredNotifications && LN.removeAllDeliveredNotifications(); }).catch(function () {});
	}
	function cancelAll() {
		var ps = [lnCancelAll()];
		if (TS && TS.cancel) ps.push(TS.cancel().catch(function () {}));
		return Promise.all(ps);
	}
	function schedule() {
		var list = O.alerts ? upcoming() : [];
		return cancelAll().then(function () {
			if (!list.length) return;
			if (android && TS) return TS.schedule({ items: list, ringStyle: O.ring });
			// iPhone: AlarmKit system alarms for the ring items when allowed, notifications for the rest
			var useKit = O.ring && TS && TS.alarmsAvailable;
			return (useKit ? TS.alarmsAvailable().catch(function () { return { ok: false }; }) : Promise.resolve({ ok: false })).then(function (k) {
				var rest = list;
				var p = Promise.resolve();
				if (k && k.ok) {
					var rings = list.filter(function (x) { return x.ring; });
					rest = list.filter(function (x) { return !x.ring; });
					p = TS.scheduleAlarms({ items: rings }).catch(function () { rest = list; });
				}
				return p.then(function () {
					if (!rest.length || !LN) return;
					return LN.checkPermissions().then(function (pm) {
						if (pm.display !== "granted") return;
						return LN.schedule({ notifications: rest.map(function (x, i) {
							return { id: 1000 + i, title: x.title, body: x.body, schedule: { at: new Date(x.at), allowWhileIdle: true }, sound: x.ring && O.ring ? "mes_alarm.caf" : undefined, autoCancel: true };
						}) });
					});
				});
			});
		}).catch(function (e) { console.warn("schedule failed", e); });
	}

	/* ---------- live status ---------- */
	var liveSig = "", bg = false;
	function liveUpdate(force) {
		if (!TS) return;
		var items = O.live ? runningItems(android) : [];
		if (android) {
			// Posted while the app is open too (like the phone's own Clock app): the system hides the chip of the app on screen, and
			// some phones (Samsung) freeze the page as soon as it leaves the screen, so a notification first posted on "pause"
			// sometimes never arrived.
			if (!items.length) { if (liveSig !== "") { liveSig = ""; TS.clearRunning().catch(function () {}); } return; }
			var sigA = JSON.stringify(items);
			if (sigA !== liveSig || force) { liveSig = sigA; TS.showRunning({ items: items, style: O.style, icon: O.icon }).catch(function () {}); }
			return;
		}
		// iPhone: Live Activities can only be started while the app is open, so keep it current from here. Paused timers stay
		// on the lock screen with the time they stopped at.
		items = O.live ? runningItems(true).map(function (x) {
			if (x.st !== "pause") return x;
			var ms = x.kind === "s" ? x.base : x.kind === "iv" ? ivLeft(x) : x.rem, sec = Math.ceil(ms / 1000), h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), r = sec % 60;
			function p2(n) { return (n < 10 ? "0" : "") + n; }
			return { title: "Paused", text: x.title, frozen: (h ? h + ":" + p2(m) : p2(m)) + ":" + p2(r) };
		}).filter(function (x) { return x.frozen !== "00:00" || x.title !== "Paused"; }) : [];
		var sig = JSON.stringify(items.map(function (x) { return [x.title, x.end, x.start, x.frozen]; }));
		if (sig === liveSig && !force) return;
		liveSig = sig;
		if (TS.liveActivity) TS.liveActivity({ items: items }).catch(function () {});
	}

	/* ---------- permissions ---------- */
	function askOnce() {
		if (asked) return; asked = true;
		if (ios && TS && TS.alarmsAvailable && O.ring) TS.alarmsAvailable({ ask: true }).catch(function () {});
		if (!LN) return;
		LN.checkPermissions().then(function (p) {
			if (p.display === "granted" || p.display === "denied") return p;
			return LN.requestPermissions();
		}).then(paintStatus).catch(function () {});
	}

	document.addEventListener("click", function (e) {
		var b = e.target.closest && e.target.closest("button");
		if (!b || !b.closest("#tm")) return;
		setTimeout(function () { liveUpdate(); if (!asked && (upcoming().length || (O.live && runningItems().length))) askOnce(); }, 400);
	}, true);

	/* ---------- background / foreground ---------- */
	function goBg() { if (bg) return; bg = true; schedule(); try { liveUpdate(true); } catch (e) { console.warn("live failed", e && e.message); } }
	function goFg() { bg = false; cancelAll(); applyChanges().then(function () { liveUpdate(true); }); paintStatus(); }
	if (App && App.addListener) { App.addListener("pause", goBg); App.addListener("resume", goFg); }
	document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") goBg(); else goFg(); });
	cancelAll();
	applyChanges();

	/* ---------- settings UI (inside the page's Sound and options card) ---------- */
	var box = null;
	function chk(id, text, key) {
		var l = document.createElement("label"); l.className = "tm-check";
		var i = document.createElement("input"); i.type = "checkbox"; i.id = id; i.checked = O[key];
		i.addEventListener("change", function () { O[key] = i.checked; saveO(); if (i.checked && key !== "live") askOnce(); liveUpdate(true); paintStatus(); });
		l.appendChild(i); l.appendChild(document.createTextNode(" " + text));
		return l;
	}
	function btn(text, fn) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-btn tu-btn--ghost"; b.textContent = text; b.style.margin = ".3em .4em 0 0"; b.addEventListener("click", fn); return b; }
	function buildUI() {
		var note = document.getElementById("tm-native-note");
		if (!note || box) return;
		box = document.createElement("div"); box.id = "tm-native-opts";
		box.appendChild(chk("tm-app-live", android ? "Show running timers in the status bar and notification shade" : "Show running timers on the lock screen and in the Dynamic Island (Live Activity)", "live"));
		box.appendChild(chk("tm-app-alerts", "Alert me when a timer or alarm goes off while the app is closed", "alerts"));
		box.appendChild(chk("tm-app-ring", android ? "Ring like an alarm clock: full screen with Stop / Snooze, sound repeats until stopped" : "Ring like an alarm clock (iOS 26 and later: rings like the Clock app, even on silent)", "ring"));
		if (android) {
			var sl = document.createElement("label"); sl.className = "tm-check"; sl.style.display = "block"; sl.style.margin = ".3em 0";
			sl.appendChild(document.createTextNode("Running timer notification: "));
			var sel = document.createElement("select"); sel.id = "tm-app-style"; sel.style.maxWidth = "100%";
			[["auto", "Automatic"], ["chip", "Live Update chip (icon + time)"], ["big", "Time inside the status-bar icon"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
			sel.value = O.style;
			sel.addEventListener("change", function () { O.style = sel.value; saveO(); liveSig = ""; liveUpdate(true); paintStatus(); });
			sl.appendChild(sel); box.appendChild(sl);
			// the status bar fits the icon into a small square: fewer characters = bigger digits
			var il = document.createElement("label"); il.className = "tm-check"; il.style.display = "block"; il.style.margin = ".3em 0";
			il.appendChild(document.createTextNode("Time in the status-bar icon: "));
			var isel = document.createElement("select"); isel.id = "tm-app-icon"; isel.style.maxWidth = "100%";
			[["big", "Big: 45s, then 5m, then 2h"], ["full", "Full time, smaller (4:59)"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; isel.appendChild(op); });
			isel.value = O.icon === "full" ? "full" : "big";
			isel.addEventListener("change", function () { O.icon = isel.value; saveO(); liveSig = ""; liveUpdate(true); });
			il.appendChild(isel); box.appendChild(il);
			var showIcon = function () { il.style.display = sel.value === "chip" ? "none" : "block"; };
			sel.addEventListener("change", showIcon); showIcon();
		}
		var st = document.createElement("p"); st.id = "tm-app-status"; st.style.cssText = "font-size:.85em;margin:.3em 0 .6em;opacity:.85;";
		box.appendChild(st);
		note.parentNode.insertBefore(box, note.nextSibling);
		note.textContent = "Phone settings for this app:";
		paintStatus();
	}
	function paintStatus() {
		var st = document.getElementById("tm-app-status");
		if (!st) return;
		st.textContent = "";
		var probs = [], fixes = [];
		var pLn = LN ? LN.checkPermissions().catch(function () { return {}; }) : Promise.resolve({ display: "granted" });
		var pTs = android && TS ? TS.status().catch(function () { return {}; }) : Promise.resolve(null);
		Promise.all([pLn, pTs]).then(function (r) {
			var ln = r[0] || {}, s = r[1];
			if (android && s) {
				if (!s.notifications) { probs.push("notifications are turned off for MES Timer"); fixes.push(["Turn on notifications", function () { askOnce(); TS.openSettings({ what: "app" }); }]); }
				if (O.alerts && !s.exact) { probs.push("“Alarms & reminders” is not allowed, so alerts may be late"); fixes.push(["Allow alarms", function () { TS.openSettings({ what: "exact" }); }]); }
				if (O.live && s.sdk >= 36 && s.notifications && !s.liveUpdates && !s.big) { probs.push("the countdown chip in the status bar is turned off for MES Timer (it still shows in the notification shade)"); fixes.push(["Show it in the status bar", function () { TS.openSettings({ what: "promoted" }); }]); }
				if (O.ring && !s.fullScreen) { probs.push("full-screen alarms are not allowed, so alarms show as a notification"); fixes.push(["Allow full screen", function () { TS.openSettings({ what: "fullScreen" }); }]); }
			} else if (ln.display && ln.display !== "granted" && (O.alerts || O.live)) {
				probs.push("notifications are not allowed for MES Timer");
				fixes.push([ln.display === "denied" ? "Open Settings" : "Allow notifications", function () { if (ln.display === "denied" && TS && TS.openSettings) TS.openSettings({ what: "app" }); else { asked = false; askOnce(); } }]);
			}
			var chipNote = android && s && O.live ? (s.big ? " Running timers show the time big in the notification, and in the status-bar icon." : " Running timers show as a Live Update: the timer icon and the time in a chip in the status bar, like the Clock app. If your phone shows no chip, pick \u201cTime inside the status-bar icon\u201d above.") : "";
			st.textContent = probs.length ? "Heads-up: " + probs.join("; ") + "." + chipNote : ((O.alerts || O.live) ? "All set." + chipNote : "Alerts and live status are off: timers only ring while the app is open.");
			fixes.forEach(function (f) { st.appendChild(document.createElement("br")); st.appendChild(btn(f[0], f[1])); });
		});
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildUI); else buildUI();
	setTimeout(buildUI, 800);

	/* ---------- tick: live status + keep awake ---------- */
	var awake = false;
	setInterval(function () {
		liveUpdate();
		if (!KA) return;
		var S = state(), want = S.optAwake !== false && runningItems().length > 0 && document.visibilityState === "visible";
		if (want !== awake) { awake = want; (want ? KA.keepAwake() : KA.allowSleep()).catch(function () {}); }
	}, 1000);
})();
