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
	var P = C.Plugins || {}, LN = P.LocalNotifications, App = P.App, KA = P.KeepAwake, TS = P.TimerStatus;
	// The app's own plugin is registered from native code after the plugin headers were read (iOS), so it may be missing
	// from Capacitor.Plugins: call it through the bridge directly then.
	if (!TS && C.nativePromise) {
		TS = {};
		["liveActivity", "alarmsAvailable", "scheduleAlarms", "cancel", "openSettings", "showRunning", "clearRunning", "schedule", "status"].forEach(function (m) {
			TS[m] = function (o) { return C.nativePromise("TimerStatus", m, o || {}); };
		});
		if (!android) { delete TS.showRunning; delete TS.clearRunning; delete TS.schedule; delete TS.status; }
	}
	var KEY = "mes-timer:v1", OKEY = "mes-timer-app:opts", MAXN = 60, asked = false;
	var android = C.getPlatform && C.getPlatform() === "android", ios = !android;

	/* ---------- options ---------- */
	var O = { live: true, alerts: true, ring: true };
	try { var so = JSON.parse(localStorage.getItem(OKEY) || "null"); if (so) Object.keys(O).forEach(function (k) { if (typeof so[k] === "boolean") O[k] = so[k]; }); } catch (e) {}
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
		function add(at, title, body, ring) { if (at > now + 800) out.push({ at: at, title: title, body: body || "", ring: !!ring }); }
		(S.timers || []).forEach(function (t) { if (t.st === "run" && t.end) add(t.end, (t.label ? t.label + ": " : "") + "Time is up", "Countdown of " + fmtDur(t.total || 0) + " finished." + (t.say ? " " + t.say : ""), true); });
		(S.alarms || []).forEach(function (a) {
			if (!a.on) return;
			var at = a.snooze > now ? a.snooze : a.at;
			if (at) add(at, "Alarm " + (a.time || "") + (a.label ? ": " + a.label : ""), a.say || (a.snooze > now ? "Snooze is over." : "Your alarm is going off."), true);
		});
		var po = S.po;
		if (po && po.st === "run" && po.end) {
			var names = { focus: "Focus time is over: take a break", short: "Break is over: back to focus", long: "Long break is over" };
			add(po.end, (po.label ? po.label + ": " : "") + (names[po.phase] || "Pomodoro phase finished"), "Pomodoro round " + (po.round || 1) + ".", true);
		}
		var iv = S.iv;
		if (iv && iv.st === "run") {
			var pl = ivSegs(iv), start = iv.startAt - (iv.base || 0), acc = 0, n = 0;
			for (var i = 0; i < pl.segs.length && n < 50; i++) {
				acc += pl.segs[i][2];
				var nx = pl.segs[i + 1], at = start + acc;
				if (at <= now + 800) continue;
				n++;
				if (!nx) add(at, (iv.label ? iv.label + ": " : "") + "Workout done", pl.rounds + " rounds finished.", true);
				else add(at, nx[0] === "work" ? "WORK – round " + nx[1] + " of " + pl.rounds : "REST", nx[0] === "work" ? fmtDur(nx[2]) + " of work" : fmtDur(nx[2]) + " rest", false);
			}
		}
		(S.ev || []).forEach(function (e) { if (e.at && e.at - now < 30 * 864e5) add(e.at, e.name || "Countdown", "The date you were counting down to is here.", true); });
		out.sort(function (a, b) { return a.at - b.at; });
		return out.slice(0, MAXN);
	}

	/* ---------- what is running (live status) ---------- */
	function runningItems() {
		var S = state(), now = Date.now(), out = [];
		(S.timers || []).forEach(function (t, i) {
			if (t.st === "run" && t.end > now) out.push({ key: "t" + i, title: t.label || "Countdown", end: t.end, text: "Countdown of " + fmtDur(t.total || 0), chip: "" });
		});
		var po = S.po;
		if (po && po.st === "run" && po.end > now) out.push({ key: "po", title: (po.label ? po.label + " · " : "") + (PO_NAME[po.phase] || "Pomodoro"), end: po.end, text: "Pomodoro round " + (po.round || 1) });
		var iv = S.iv;
		if (iv && iv.st === "run") {
			var pl = ivSegs(iv), el = (iv.base || 0) + (now - iv.startAt), acc = 0;
			for (var k = 0; k < pl.segs.length; k++) {
				acc += pl.segs[k][2];
				if (el < acc) { var sg = pl.segs[k]; out.push({ key: "iv", title: (sg[0] === "work" ? "WORK" : sg[0] === "rest" ? "REST" : "Get ready") + (sg[1] ? " – round " + sg[1] + " of " + pl.rounds : ""), end: iv.startAt - (iv.base || 0) + acc, text: iv.label || "Interval workout" }); break; }
			}
		}
		(S.sws || []).forEach(function (w, i) { if (w.st === "run") out.push({ key: "s" + i, title: w.label || "Stopwatch", start: w.startAt - (w.base || 0), text: "Stopwatch running" }); });
		out.sort(function (a, b) { return (a.end || 9e15) - (b.end || 9e15); });
		return out.slice(0, 6);
	}

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
		var items = O.live ? runningItems() : [];
		if (android) {
			if (!bg || !items.length) { if (liveSig !== "") { liveSig = ""; TS.clearRunning().catch(function () {}); } return; }
			var sigA = JSON.stringify(items);
			if (sigA !== liveSig || force) { liveSig = sigA; TS.showRunning({ items: items.slice().reverse() }).catch(function () {}); }   // last posted owns the status-bar chip: the soonest countdown
			return;
		}
		// iPhone: Live Activities can only be started while the app is open, so keep it current from here
		var sig = JSON.stringify(items.map(function (x) { return [x.title, x.end, x.start]; }));
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
		setTimeout(function () { liveUpdate(); if (!asked && upcoming().length) askOnce(); }, 400);
	}, true);

	/* ---------- background / foreground ---------- */
	function goBg() { if (bg) return; bg = true; schedule(); try { liveUpdate(true); } catch (e) { console.warn("live failed", e && e.message); } }
	function goFg() { bg = false; cancelAll(); liveUpdate(true); paintStatus(); }
	if (App && App.addListener) { App.addListener("pause", goBg); App.addListener("resume", goFg); }
	document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") goBg(); else goFg(); });
	cancelAll();

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
				if (O.ring && !s.fullScreen) { probs.push("full-screen alarms are not allowed, so alarms show as a notification"); fixes.push(["Allow full screen", function () { TS.openSettings({ what: "fullScreen" }); }]); }
			} else if (ln.display && ln.display !== "granted" && (O.alerts || O.live)) {
				probs.push("notifications are not allowed for MES Timer");
				fixes.push([ln.display === "denied" ? "Open Settings" : "Allow notifications", function () { if (ln.display === "denied" && TS && TS.openSettings) TS.openSettings({ what: "app" }); else { asked = false; askOnce(); } }]);
			}
			st.textContent = probs.length ? "Heads-up: " + probs.join("; ") + "." : ((O.alerts || O.live) ? "All set." : "Alerts and live status are off: timers only ring while the app is open.");
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
