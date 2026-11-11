/* MES Timer app: native helpers (copied into www/js by build-www.py).
 * - When the app goes to the background, every upcoming alert in the saved timer state (localStorage "mes-timer:v1") is
 *   scheduled as a local notification: running countdowns, alarms (snooze first), the running Pomodoro phase, every phase
 *   change of a running interval workout (up to 50), and date countdowns in the next 30 days. When the app comes back they
 *   are cancelled again, because the page rings by itself while it is open (so nothing alerts twice).
 * - Keeps the screen awake while something runs, if the page's "Keep the screen awake" setting is on.
 * - Asks for notification permission the first time a timer or alarm is started.
 */
(function () {
	"use strict";
	var C = window.Capacitor;
	if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
	var P = C.Plugins || {}, LN = P.LocalNotifications, App = P.App, KA = P.KeepAwake;
	var KEY = "mes-timer:v1", CH = "mes-timer-alerts", MAXN = 60, asked = false;
	var android = C.getPlatform && C.getPlatform() === "android";

	function state() { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } }
	function q(s) { return s ? "“" + s + "” " : ""; }
	function fmtDur(ms) { var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + " h " : "") + (m ? m + " min " : "") + (!h && r ? r + " s" : "").trim(); }

	function upcoming() {
		var S = state(), now = Date.now(), out = [];
		function add(at, title, body) { if (at > now + 800) out.push({ at: at, title: title, body: body || "" }); }
		(S.timers || []).forEach(function (t) { if (t.st === "run" && t.end) add(t.end, (t.label ? t.label + ": " : "") + "Time is up", "Countdown of " + fmtDur(t.total || 0) + " finished." + (t.say ? " " + t.say : "")); });
		(S.alarms || []).forEach(function (a) {
			if (!a.on) return;
			var at = a.snooze > now ? a.snooze : a.at;
			if (at) add(at, "Alarm " + (a.time || "") + (a.label ? ": " + a.label : ""), a.say || (a.snooze > now ? "Snooze is over." : "Your alarm is going off."));
		});
		var po = S.po;
		if (po && po.st === "run" && po.end) {
			var names = { focus: "Focus time is over: take a break", short: "Break is over: back to focus", long: "Long break is over" };
			add(po.end, (po.label ? po.label + ": " : "") + (names[po.phase] || "Pomodoro phase finished"), "Pomodoro round " + (po.round || 1) + ".");
		}
		var iv = S.iv;
		if (iv && iv.st === "run") {
			var prep = Math.max(0, +iv.prep || 0) * 1000, work = Math.max(1, +iv.work || 1) * 1000, rest = Math.max(0, +iv.rest || 0) * 1000, rounds = Math.max(1, Math.min(99, Math.floor(+iv.rounds || 1)));
			var segs = []; if (prep) segs.push(["prep", 0, prep]);
			for (var r = 1; r <= rounds; r++) { segs.push(["work", r, work]); if (rest && r < rounds) segs.push(["rest", r, rest]); }
			var start = iv.startAt - (iv.base || 0), acc = 0, n = 0;
			for (var i = 0; i < segs.length && n < 50; i++) {
				acc += segs[i][2];
				var nx = segs[i + 1], at = start + acc;
				if (at <= now + 800) continue;
				n++;
				if (!nx) add(at, (iv.label ? iv.label + ": " : "") + "Workout done", rounds + " rounds finished.");
				else add(at, nx[0] === "work" ? "WORK – round " + nx[1] + " of " + rounds : "REST", nx[0] === "work" ? fmtDur(nx[2]) + " of work" : fmtDur(nx[2]) + " rest");
			}
		}
		(S.ev || []).forEach(function (e) { if (e.at && e.at - now < 30 * 864e5) add(e.at, q(e.name).trim() || "Countdown", "The date you were counting down to is here."); });
		out.sort(function (a, b) { return a.at - b.at; });
		return out.slice(0, MAXN);
	}

	function cancelAll() {
		if (!LN) return Promise.resolve();
		return LN.getPending().then(function (r) {
			var ids = (r && r.notifications || []).map(function (n) { return { id: n.id }; });
			return ids.length ? LN.cancel({ notifications: ids }) : null;
		}).catch(function () {}).then(function () { return LN.removeAllDeliveredNotifications && LN.removeAllDeliveredNotifications(); }).catch(function () {});
	}

	var channelDone = null;
	function channel() {
		if (!android || !LN || !LN.createChannel) return Promise.resolve();
		return channelDone || (channelDone = LN.createChannel({ id: CH, name: "Timers and alarms", description: "Countdowns, alarms, Pomodoro and interval alerts", importance: 5, visibility: 1, vibration: true, lights: true }).catch(function () {}));
	}

	function schedule() {
		var list = upcoming();
		return cancelAll().then(function () {
			if (!list.length || !LN) return;
			return LN.checkPermissions().then(function (p) {
				if (p.display !== "granted") return;
				return channel().then(function () {
					return LN.schedule({ notifications: list.map(function (x, i) {
						return { id: 1000 + i, title: x.title, body: x.body, schedule: { at: new Date(x.at), allowWhileIdle: true }, channelId: CH, autoCancel: true };
					}) });
				});
			});
		}).catch(function (e) { console.warn("schedule failed", e); });
	}

	function askOnce() {
		if (asked || !LN) return; asked = true;
		LN.checkPermissions().then(function (p) {
			if (p.display === "granted" || p.display === "denied") return p;
			return LN.requestPermissions();
		}).then(function (p) {
			if (!p || p.display !== "granted" || !android || !LN.checkExactNotificationSetting) return;
			return LN.checkExactNotificationSetting().then(function (x) {
				if (x && x.exact_alarm && x.exact_alarm !== "granted" && confirm("For timers and alarms to go off on time while the app is closed, allow “Alarms & reminders” for MES Timer. Open that setting now?")) return LN.changeExactNotificationSetting();
			});
		}).catch(function () {});
	}

	// first start of a timer / alarm -> ask for notifications
	document.addEventListener("click", function (e) {
		if (asked) return;
		var b = e.target.closest && e.target.closest("button");
		if (!b || !b.closest("#tm")) return;
		setTimeout(function () { if (upcoming().length) askOnce(); }, 400);
	}, true);

	// background / foreground
	var hidden = false;
	function goBg() { if (hidden) return; hidden = true; schedule(); }
	function goFg() { hidden = false; cancelAll(); }
	if (App && App.addListener) { App.addListener("pause", goBg); App.addListener("resume", goFg); }
	document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") goBg(); else goFg(); });
	cancelAll();

	// keep the screen awake while something runs
	var awake = false;
	function running(S) {
		return (S.timers || []).some(function (t) { return t.st === "run"; }) || (S.sws || []).some(function (w) { return w.st === "run"; }) ||
			(S.po && S.po.st === "run") || (S.iv && S.iv.st === "run");
	}
	setInterval(function () {
		if (!KA) return;
		var S = state(), want = S.optAwake !== false && running(S) && document.visibilityState === "visible";
		if (want !== awake) { awake = want; (want ? KA.keepAwake() : KA.allowSleep()).catch(function () {}); }
	}, 1500);
})();
