/* MES Reminder -- mes.fm/reminder (UI; maths in lib.js, global RM, on top of the Clock's CK). A share link holds the whole event
 * (?title=&t=2026-10-25T11:00&tz=America/Vancouver&u=/page&r=weekly&len=&d=); a short link mes.fm/r/<id> (or ?r=<id>) holds the same fields
 * in api/reminder-link.js (made only when "Copy short link" / "Copy text" is pressed). Viewers get a countdown in their
 * own time zone, calendar buttons (Google, .ics with alarms, Outlook.com) and an optional in-browser reminder (notification + sound while
 * a tab of this page is open). State: localStorage "mes-reminder:v1" = { items: [event + leads + added], leads, sound, fired: {key: ms} }.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("rm");
	if (!root || !window.RM || !window.CK || !window.Intl) return;
	var KEY = "mes-reminder:v1", LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", BASE_TITLE = document.title;
	var LEADS = [1440, 60, 15, 5, 0];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("rm-toast"); if (!t) { t = document.createElement("div"); t.id = "rm-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }

	/* ---------- state ---------- */
	var S = { items: [], leads: [15, 0], sound: true, fired: {} };
	function load() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (!s) return;
			if (Array.isArray(s.items)) S.items = s.items.map(function (x) { var e = RM.clean(x); e.leads = Array.isArray(x.leads) ? x.leads.filter(function (m) { return LEADS.indexOf(m) >= 0; }) : [15, 0]; e.added = +x.added || Date.now(); return e; }).filter(function (e) { return !isNaN(RM.startOf(e)); }).slice(0, 50);
			if (Array.isArray(s.leads)) S.leads = s.leads.filter(function (m) { return LEADS.indexOf(m) >= 0; });
			if (typeof s.sound === "boolean") S.sound = s.sound;
			if (s.fired && typeof s.fired === "object") S.fired = s.fired;
		} catch (e) {}
	}
	function save() {
		var cut = Date.now() - 40 * 86400000; Object.keys(S.fired).forEach(function (k) { if (S.fired[k] < cut) delete S.fired[k]; });
		try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
	}
	load();
	window.addEventListener("storage", function (e) { if (e.key === KEY) { load(); renderMine(); } });

	/* ---------- formatting ---------- */
	function fmtWhen(ms, tz, withZone) {
		var o = { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
		if (tz) o.timeZone = tz; if (withZone) o.timeZoneName = "short";
		try { return new Intl.DateTimeFormat(undefined, o).format(new Date(ms)); } catch (e) { return new Date(ms).toString(); }
	}
	function shortWhen(ms) { try { return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)); } catch (e) { return new Date(ms).toLocaleString(); } }
	function pageUrl(ev) { return ev === EV && EV_URL ? EV_URL : location.origin + "/reminder?" + RM.toQuery(ev); }
	function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "reminder"; }
	function state(ev, now) {
		var s = RM.nextStart(ev, now), end = s + (ev.len || 60) * 60000;
		return { start: s, end: end, live: now >= s && now < end, over: now >= end };
	}

	/* ---------- event view (from a share link) ---------- */
	var EV = RM.fromQuery(location.search), EV_URL = "", RID = EV ? "" : RM.shortId(location.pathname, location.search);
	function leadBoxes() {
		$("rm-leads").innerHTML = LEADS.map(function (m) { return '<label class="rm-check"><input type="checkbox" value="' + m + '"' + (S.leads.indexOf(m) >= 0 ? " checked" : "") + "> " + esc(RM.leadText(m).replace(/^at/, "At").replace(/^(\d)/, "$1")) + "</label>"; }).join("");
		$("rm-leads").addEventListener("change", function () {
			S.leads = Array.prototype.filter.call($("rm-leads").querySelectorAll("input"), function (i) { return i.checked; }).map(function (i) { return +i.value; });
			save(); calLinks();
		});
	}
	function calLinks() {
		if (!EV) return;
		$("rm-gcal").href = RM.googleUrl(EV, pageUrl(EV));
		$("rm-ocal").href = RM.outlookUrl(EV, pageUrl(EV));
	}
	// Link to the Time Zone Converter for the same moment, written in the event's own zone (its #d=&t=&f= hash form).
	function tzLink(ms, zone) {
		zone = zone || LOCAL;
		var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
		return "/timezone#d=" + p.year + "-" + p.month + "-" + p.day + "&t=" + p.hour + ":" + p.minute + "&f=" + encodeURIComponent(zone);
	}
	function tzA(ms, zone) { return ' <a class="rm-tzlink" href="' + esc(tzLink(ms, zone)) + '" target="_blank" rel="noopener">See it in other time zones →</a>'; }
	function renderCount() {
		if (!EV) return;
		var now = Date.now(), st = state(EV, now), box = $("rm-count");
		if (st.live) box.innerHTML = '<span class="rm-live">🔴 Happening now</span>';
		else if (st.over) box.innerHTML = '<span class="rm-live" style="color:#6a7280">This event has ended</span>';
		else {
			var c = RM.countdown(st.start - now), u = [["d", c.d, c.d === 1 ? "day" : "days"], ["h", c.h, "hours"], ["m", c.m, "min"], ["s", c.s, "sec"]];
			if (!c.d) u.shift();
			box.innerHTML = u.map(function (x) { return '<span class="rm-u"><span class="rm-n">' + x[1] + '</span><span class="rm-l">' + x[2] + "</span></span>"; }).join("");
		}
		var key = st.start;
		if (renderCount._k !== key) {
			renderCount._k = key;
			$("rm-when").innerHTML = "<strong>" + esc(fmtWhen(st.start, "", true)) + "</strong>" + (EV.r === "weekly" ? " · every week" : "");
			$("rm-host").innerHTML = esc(EV.tz && EV.tz !== LOCAL ? "That is " + fmtWhen(st.start, EV.tz, true) + " in " + CK.city(EV.tz) + "." : "Shown in your time zone (" + CK.city(LOCAL) + ").") + tzA(st.start, EV.tz);
		}
	}
	function showEvent() {
		$("rm-event").hidden = false; $("rm-ev-msg").hidden = true;
		$("rm-ev-title").textContent = EV.title;
		document.title = EV.title + " | Reminder | MES";
		if (EV.d) { $("rm-notes").hidden = false; $("rm-notes").textContent = EV.d; }
		if (EV.u) { $("rm-golink").hidden = false; $("rm-golink").innerHTML = '<a class="tu-btn tu-btn--primary" href="' + esc(EV.u) + '" target="_blank" rel="noopener nofollow">▶ Open the link</a> <span class="rm-item-sub">' + esc(RM.host(EV.u)) + "</span>"; }
		$("rm-make-h").textContent = "Make your own reminder link";
		leadBoxes(); calLinks(); renderCount();
		$("rm-ics").addEventListener("click", function () {
			var blob = new Blob([RM.ics(EV, { leads: S.leads, pageUrl: pageUrl(EV) })], { type: "text/calendar;charset=utf-8" });
			var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = slug(EV.title) + ".ics"; document.body.appendChild(a); a.click();
			setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
			toast("Calendar file downloaded: open it to add the event");
		});
		$("rm-browser").addEventListener("click", function () {
			var q = RM.toQuery(EV), have = S.items.filter(function (x) { return RM.toQuery(x) === q; })[0];
			if (have) have.leads = S.leads.slice(); else { var e = RM.clean(EV); e.leads = S.leads.slice(); e.added = Date.now(); S.items.unshift(e); }
			save(); renderMine();
			var msg = "Saved in this browser. Keep a tab of mes.fm/reminder open to get the alert";
			if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(function () { renderPerm(); });
			$("rm-saved").hidden = false; $("rm-saved").textContent = "✓ " + msg + (S.leads.length ? " (" + S.leads.map(RM.leadText).join(", ") + ")." : ": tick at least one time above.");
		});
	}

	/* ---------- my reminders + alerts ---------- */
	function renderPerm() {
		var p = !("Notification" in window) ? "none" : Notification.permission, el = $("rm-perm");
		el.textContent = p === "granted" ? "Notifications are on. Alerts show while a tab of this page is open; a calendar reminder works even when the browser is closed."
			: p === "denied" ? "Notifications are blocked for mes.fm in this browser, so alerts show only inside this page. Allow them in the site settings (the icon left of the address) to get a pop-up."
			: p === "none" ? "This browser has no notifications, so alerts show only inside this page."
			: "Press Test the alert to allow notifications.";
	}
	function renderMine() {
		var has = S.items.length > 0; $("rm-mine-h").hidden = !has; $("rm-mine-card").hidden = !has; if (!has) return;
		var now = Date.now();
		$("rm-mine").innerHTML = S.items.map(function (e, i) {
			var st = state(e, now), cd = st.live ? "Now" : st.over ? "Ended" : RM.countdown(st.start - now).text.replace(/ \d+ s$/, "");
			return '<div class="rm-item"><div class="rm-item-main"><a class="rm-item-title" href="/reminder?' + esc(RM.toQuery(e)) + '">' + esc(e.title) + '</a><div class="rm-item-sub">' + esc(shortWhen(st.start)) + (e.r === "weekly" ? " · weekly" : "") + " · alerts " + esc(e.leads.length ? e.leads.map(RM.leadText).join(", ") : "off") + '</div></div><span class="rm-item-cd" data-i="' + i + '">' + esc(cd) + '</span><button type="button" class="rm-x" data-del="' + i + '" aria-label="Remove">Remove</button></div>';
		}).join("");
		$("rm-sound").checked = S.sound; renderPerm();
	}
	$("rm-mine").addEventListener("click", function (e) {
		var b = e.target.closest("[data-del]"); if (!b) return;
		var gone = S.items.splice(+b.getAttribute("data-del"), 1)[0]; save(); renderMine();
		if (gone) toast("Removed " + gone.title);
	});
	$("rm-sound").addEventListener("change", function () { S.sound = this.checked; save(); });

	var AC = null;
	function chime() {
		if (!S.sound) return;
		try {
			AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume();
			[0, 0.35, 0.7].forEach(function (t, i) {
				var o = AC.createOscillator(), g = AC.createGain(), at = AC.currentTime + t;
				o.type = "sine"; o.frequency.value = [880, 1175, 1568][i]; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
				o.connect(g).connect(AC.destination); o.start(at); o.stop(at + 0.65);
			});
		} catch (e) {}
	}
	function banner(title, body, link) {
		var b = document.createElement("div"); b.className = "rm-banner"; b.setAttribute("role", "alert");
		b.innerHTML = "<div><strong>⏰ " + esc(title) + "</strong><br>" + esc(body) + (link ? ' <a href="' + esc(link) + '" target="_blank" rel="noopener nofollow">Open the link</a>' : "") + "</div><button type=\"button\">OK</button>";
		b.querySelector("button").addEventListener("click", function () { b.remove(); document.title = EV ? EV.title + " | Reminder | MES" : BASE_TITLE; });
		document.body.appendChild(b);
	}
	function fire(e, a, now) {
		var late = now - a.at > 120000, body = a.lead ? "Starts in " + RM.leadText(a.lead).replace(" before", "") + " (" + shortWhen(a.start) + ")" : "Starting now";
		if (late) body += ". This alert was due at " + shortWhen(a.at) + ".";
		banner(e.title, body, e.u); chime(); document.title = "⏰ " + e.title;
		if ("Notification" in window && Notification.permission === "granted") {
			try { var n = new Notification(e.title, { body: body, icon: "/reminder/img/logo.png", tag: a.key, requireInteraction: a.lead === 0 }); n.onclick = function () { window.focus(); if (e.u) window.open(e.u, "_blank", "noopener"); n.close(); }; } catch (x) {}
		}
	}
	function check() {
		var now = Date.now(), changed = false;
		try { var fresh = JSON.parse(localStorage.getItem(KEY) || "null"); if (fresh && fresh.fired) S.fired = fresh.fired; } catch (x) {}
		S.items.forEach(function (e) {
			RM.dueAlerts(e, e.leads, S.fired, now).forEach(function (a) { S.fired[a.key] = now; changed = true; fire(e, a, now); });
		});
		if (changed) save();
	}
	$("rm-test").addEventListener("click", function () {
		var go = function () { fire({ title: "Test reminder", u: "" }, { lead: 15, at: Date.now(), start: Date.now() + 900000, key: "test" + Date.now() }, Date.now()); renderPerm(); };
		if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(go); else go();
	});
	setInterval(function () {
		renderCount(); check();
		Array.prototype.forEach.call(document.querySelectorAll(".rm-item-cd"), function (el) {
			var e = S.items[+el.getAttribute("data-i")]; if (!e) return; var st = state(e, Date.now());
			el.textContent = st.live ? "Now" : st.over ? "Ended" : RM.countdown(st.start - Date.now()).text.replace(/ \d+ s$/, "");
		});
	}, 1000);
	renderMine(); check();

	/* ---------- maker ---------- */
	var ALL = []; try { ALL = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : []; } catch (e) {}
	if (!ALL.length) ALL = CK.POPULAR.concat(["UTC"]);
	$("rm-zones").innerHTML = ALL.map(function (z) { return '<option value="' + esc(z) + '" label="' + esc(CK.city(z)) + '">'; }).join("");
	function resolveZone(text) {
		var t = String(text || "").trim(); if (!t) return LOCAL; if (t.toUpperCase() === "UTC" || t.toUpperCase() === "GMT") return "UTC";
		if (t.indexOf("/") > 0 && CK.valid(t)) return t;
		var q = t.toLowerCase().replace(/\s+/g, "_");
		return ALL.filter(function (z) { return CK.city(z).toLowerCase().replace(/\s+/g, "_") === q; })[0] || ALL.filter(function (z) { return z.toLowerCase().indexOf(q) >= 0; })[0] || "";
	}
	var MK = "mes-reminder:draft";
	function draft() { return { title: $("rm-title").value, t: $("rm-date").value && $("rm-time").value ? $("rm-date").value + "T" + $("rm-time").value : "", tz: resolveZone($("rm-tz").value), u: $("rm-url").value, d: $("rm-desc").value, r: $("rm-rep").value, len: +$("rm-len").value }; }
	function upd() {
		var d = draft(), ok = d.t && d.tz && !isNaN(RM.startOf(d)), prev = $("rm-preview");
		try { localStorage.setItem(MK, JSON.stringify({ title: d.title, date: $("rm-date").value, time: $("rm-time").value, tz: $("rm-tz").value, u: d.u, d: d.d, r: d.r, len: d.len })); } catch (e) {}
		if (!d.tz) { prev.textContent = "Time zone not found: type a city such as Vancouver or London."; $("rm-link").value = ""; $("rm-srow").hidden = true; return; }
		if (!ok) { prev.textContent = "Pick a date and a time to get the link."; $("rm-link").value = ""; $("rm-srow").hidden = true; return; }
		if (d.u && !RM.safeUrl(d.u)) { prev.textContent = "That link does not look like a web address (it should start with https://)."; }
		else {
			var s = RM.startOf(d);
			prev.innerHTML = "Starts <strong>" + esc(fmtWhen(s, d.tz, true)) + "</strong>" + (d.tz !== LOCAL ? " (" + esc(fmtWhen(s, "", true)) + " for you)" : "") + (d.r ? ", every week" : "") + (s < Date.now() && !d.r ? '. <span style="color:#c0262d">That time has already passed.</span>' : ".") + tzA(s, d.tz);
		}
		if (!d.title.trim()) d.title = "Reminder";
		$("rm-srow").hidden = !shownKey || shownKey !== JSON.stringify(RM.apiBody(d));
		$("rm-link").value = pageUrl(d); $("rm-open").href = "/reminder?" + RM.toQuery(d);
	}
	(function restore() {
		var tomorrow = new Date(Date.now() + 86400000);
		$("rm-date").value = tomorrow.getFullYear() + "-" + CK.pad(tomorrow.getMonth() + 1) + "-" + CK.pad(tomorrow.getDate());
		$("rm-tz").value = LOCAL;
		try {
			var s = JSON.parse(localStorage.getItem(MK) || "null"); if (!s) return;
			$("rm-title").value = s.title || ""; if (s.date) $("rm-date").value = s.date; $("rm-time").value = s.time || ""; $("rm-tz").value = s.tz || LOCAL;
			$("rm-url").value = s.u || ""; $("rm-desc").value = s.d || ""; $("rm-rep").value = s.r === "weekly" ? "weekly" : ""; if ([30, 60, 90, 120, 180, 240].indexOf(+s.len) >= 0) $("rm-len").value = String(s.len);
		} catch (e) {}
	})();
	["rm-title", "rm-date", "rm-time", "rm-tz", "rm-url", "rm-desc", "rm-rep", "rm-len"].forEach(function (id) { $(id).addEventListener("input", upd); $(id).addEventListener("change", upd); });
	$("rm-tz").addEventListener("change", function () { var z = resolveZone(this.value); if (z) this.value = z; upd(); });
	function copy(text, msg) {
		if (!text) { toast("Pick a date and a time first"); return; }
		var done = function () { toast(msg); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed: select the link and copy it"); } t.remove(); }
	}
	$("rm-copy").addEventListener("click", function () { copy($("rm-link").value, "Full link copied"); });
	/* short link: POST the fields to api/reminder-link.js (same event -> same id); remembered per event for this visit */
	var shorts = {}, shownKey = "";
	function getShort(d) {
		var body = RM.apiBody(d), k = JSON.stringify(body);
		if (!shorts[k]) shorts[k] = fetch("/api/reminder-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: k }).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.id) throw new Error(r.status === 429 ? "Too many short links made from here in the last hour: try again later, or copy the full link." : "The short link could not be made right now: copy the full link instead."); return "https://mes.fm/r/" + j.id; });
		}).then(function (u) { showShort(k, u); return u; }, function (e) { delete shorts[k]; throw e; });
		return shorts[k];
	}
	function showShort(k, u) { shownKey = k; $("rm-slink").value = u; $("rm-srow").hidden = false; }
	// the clipboard write starts inside the click (Safari needs that), with the text arriving when the server answers
	function copyLater(p, msg, failMsg) {
		var fail = function (e) { toast((e && e.message) || failMsg); };
		if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
			try {
				navigator.clipboard.write([new ClipboardItem({ "text/plain": p.then(function (t) { return new Blob([t], { type: "text/plain" }); }) })]).then(function () { toast(msg); }, function () { p.then(function (t) { copy(t, msg); }, fail); });
				return;
			} catch (e) {}
		}
		p.then(function (t) { copy(t, msg); }, fail);
	}
	$("rm-short").addEventListener("click", function () {
		if (!$("rm-link").value) { copy("", ""); return; }
		var d = draft(); if (!d.title.trim()) d.title = "Reminder";
		copyLater(getShort(d), "Short link copied", "The short link could not be made: copy the full link instead.");
	});
	$("rm-scopy").addEventListener("click", function () { copy($("rm-slink").value, "Short link copied"); });
	$("rm-slink").addEventListener("focus", function () { this.select(); });
	$("rm-link").addEventListener("focus", function () { this.select(); });
	$("rm-copytext").addEventListener("click", function () {
		var d = draft(), link = $("rm-link").value; if (!link) { copy("", ""); return; }
		var text = function (l) { return "⏰ Get a reminder for " + (d.title.trim() || "this stream") + " (adds it to your calendar, in your time zone): " + l; };
		var d2 = draft(); if (!d2.title.trim()) d2.title = "Reminder";
		copyLater(getShort(d2).then(text, function () { return text(link); }), "Text copied: paste it into the description");
	});
	$("rm-clear").addEventListener("click", function () { ["rm-title", "rm-url", "rm-desc", "rm-time"].forEach(function (id) { $(id).value = ""; }); $("rm-rep").value = ""; $("rm-len").value = "60"; $("rm-tz").value = LOCAL; upd(); });
	upd();

	/* ---------- "Type it in words" (main_js/when-parse.js, loaded after this script) ---------- */
	function wireWhen() {
		if (!window.MESWhen || root.querySelector(".mes-when")) return;
		MESWhen.attach({ anchor: $("rm-date").closest(".tu-row"), date: "rm-date", time: "rm-time", zone: "rm-tz", label: "Type the date and time in words", placeholder: "Oct 28 2026, Wed 10 am PT" });
	}
	if (window.MESWhen) wireWhen(); else document.addEventListener("DOMContentLoaded", wireWhen);

	/* ---------- countdown size, Fill window (the browser window) and Full screen ---------- */
	var VK = "mes-reminder:view", V = { sz: 1, fill: false };
	try { var vv = JSON.parse(localStorage.getItem(VK) || "null"); if (vv) { V.sz = [1, 2, 3].indexOf(+vv.sz) >= 0 ? +vv.sz : 1; V.fill = vv.fill === true; } } catch (e) {}
	function saveView() { try { localStorage.setItem(VK, JSON.stringify(V)); } catch (e) {} }
	function paintView() {
		var ev = $("rm-event"), fs = document.fullscreenElement === ev;
		ev.classList.remove("rm-sz-1", "rm-sz-2", "rm-sz-3"); ev.classList.add("rm-sz-" + V.sz);
		[].forEach.call(document.querySelectorAll("#rm-view [data-sz]"), function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-sz") === V.sz)); });
		var on = V.fill || fs; ev.classList.toggle("rm-fill", on); document.documentElement.classList.toggle("rm-noscroll", on && !fs);
		$("rm-fillbtn").hidden = on; $("rm-closebtn").hidden = !on; $("rm-fsbtn").textContent = fs ? "⛶ Leave full screen" : "⛶ Full screen";
	}
	function setFill(on) { V.fill = on; saveView(); paintView(); }
	function toggleFs() {
		var ev = $("rm-event");
		if (document.fullscreenElement) { document.exitFullscreen(); return; }
		if (ev.requestFullscreen) ev.requestFullscreen().catch(function () { setFill(true); }); else setFill(true);    // no Fullscreen API (iPhone): fill the window instead
	}
	function wireView() {
		$("rm-view").addEventListener("click", function (e) { var b = e.target.closest("[data-sz]"); if (!b) return; V.sz = +b.getAttribute("data-sz"); saveView(); paintView(); });
		$("rm-fillbtn").addEventListener("click", function () { setFill(true); });
		$("rm-fsbtn").addEventListener("click", toggleFs);
		$("rm-closebtn").addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); setFill(false); });
		document.addEventListener("fullscreenchange", paintView);
		document.addEventListener("keydown", function (e) {
			if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "")) return;
			if (e.key === "Escape" && V.fill && !document.fullscreenElement) setFill(false);
			else if (e.key === "w" || e.key === "W") setFill(!V.fill);
			else if (e.key === "f" || e.key === "F") toggleFs();
		});
		paintView();
	}
	// a short link (mes.fm/r/<id>): the event comes from api/reminder-link.js
	function loadShort(id) {
		var msg = $("rm-ev-msg"); msg.hidden = false; msg.textContent = "Loading the reminder…";
		fetch("/api/reminder-link?id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? "gone" : "err"); return r.json(); }).then(function (j) {
			var e = RM.fromApi(j); if (!e) throw new Error("gone");
			EV = e; EV_URL = "https://mes.fm/r/" + id; showEvent(); wireView();
		}).catch(function (err) {
			msg.innerHTML = err && err.message === "gone" ? "This reminder link was not found. It may have expired (links are kept for a year after the event) or been mistyped. Ask whoever shared it for a new one."
				: 'The reminder could not be loaded right now. Check your connection and <a href="" id="rm-retry">try again</a>.';
			var rt = $("rm-retry"); if (rt) rt.addEventListener("click", function (e) { e.preventDefault(); loadShort(id); });
		});
	}
	if (EV) { showEvent(); wireView(); } else if (RID) loadShort(RID);

	/* ---------- next scheduled MES streams: /reminder/upcoming.json (update_upcoming_streams.py) ---------- */
	var HOSTZ = "America/Vancouver";
	function streamEv(x) { var p = CK.partsIn(new Date(x.ms), HOSTZ); return { title: x.title, t: p.y + "-" + CK.pad(p.mo) + "-" + CK.pad(p.d) + "T" + CK.pad(p.h) + ":" + CK.pad(p.m), tz: HOSTZ, u: x.url, len: 120 }; }
	function fillForm(x) {
		var e = streamEv(x), p = CK.partsIn(new Date(x.ms), HOSTZ);
		$("rm-title").value = x.title; $("rm-url").value = x.url; $("rm-tz").value = HOSTZ; $("rm-rep").value = ""; $("rm-desc").value = x.notes || "";
		$("rm-len").value = [30, 60, 90, 120, 180, 240].indexOf(x.len) >= 0 ? String(x.len) : "120";
		$("rm-date").value = e.t.slice(0, 10); $("rm-time").value = CK.pad(p.h) + ":" + CK.pad(p.m);
		["rm-date", "rm-time"].forEach(function (id) { $(id).dispatchEvent(new Event("input", { bubbles: true })); $(id).dispatchEvent(new Event("change", { bubbles: true })); });
		upd(); toast("Filled in: " + x.title);
	}
	/* quick day / time buttons: worked out in the zone in the "Time zone" box (else this browser's).
	   Day buttons keep the time already typed (9 AM when none); In 15 min / In 1 hour set both; time buttons keep the date,
	   and Midnight means the midnight at the end of the chosen day (00:00 of the next day). */
	function setDT(date, time) {
		if (date) $("rm-date").value = date; if (time) $("rm-time").value = time;
		["rm-date", "rm-time"].forEach(function (id) { $(id).dispatchEvent(new Event("input", { bubbles: true })); $(id).dispatchEvent(new Event("change", { bubbles: true })); });
		upd();
	}
	var midSet = "";
	function ymd(p) { return p.y + "-" + CK.pad(p.mo) + "-" + CK.pad(p.d); }
	function plusDays(dateStr, n) { var a = dateStr.split("-"), x = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2] + n)); return x.getUTCFullYear() + "-" + CK.pad(x.getUTCMonth() + 1) + "-" + CK.pad(x.getUTCDate()); }
	// Holiday buttons: the next one (this year or next) at the holiday's usual time (New Year 00:00, Halloween 6 PM, Thanksgiving 5 PM)
	// or the time already filled in (9 AM if none). The title is set only when the box is empty or still holds another holiday's name.
	// Thanksgiving: Canada's (2nd Monday of October) when the zone is a Canadian one, else the US date.
	var CA_ZONE = /^America\/(Vancouver|Edmonton|Calgary|Regina|Winnipeg|Toronto|Montreal|Halifax|St_Johns|Moncton|Whitehorse|Yellowknife|Iqaluit|Dawson_Creek|Fort_Nelson|Glace_Bay|Goose_Bay|Swift_Current|Rankin_Inlet|Cambridge_Bay|Inuvik|Atikokan|Blanc-Sablon|Creston|Dawson|Resolute)$/;
	function holiday(id) {
		var H = RM.HOLIDAYS[id], tz = resolveZone($("rm-tz").value) || LOCAL, now = CK.partsIn(new Date(), tz), ca = CA_ZONE.test(tz);
		var p = RM.nextHoliday(id, now, ca), cur = $("rm-title").value.trim();
		if (!cur || Object.keys(RM.HOLIDAYS).some(function (k) { return cur === RM.HOLIDAYS[k].title || cur === RM.HOLIDAYS[k].title + " (Canada)"; })) $("rm-title").value = H.title + (id === "thanksgiving" && ca ? " (Canada)" : "");
		var t0 = $("rm-time").value.slice(0, 5), keepT = /^\d\d:\d\d$/.test(t0) && t0 !== holT ? t0 : "09:00";    // a time left by another holiday button is not "yours"
		holT = H.time || keepT;
		setDT(p.y + "-" + CK.pad(p.mo) + "-" + CK.pad(p.d), holT);
	}
	var holT = "";
	$("rm-top").addEventListener("click", function (e) { var hb = e.target.closest("[data-h]"); if (hb) holiday(hb.getAttribute("data-h")); });
	$("rm-quick").addEventListener("click", function (e) {
		var b = e.target.closest("[data-q]"); if (!b) return;
		var q = b.getAttribute("data-q"), tz = resolveZone($("rm-tz").value) || LOCAL, now = CK.partsIn(new Date(), tz), today = ymd(now);
		var keepT = /^\d\d:\d\d/.test($("rm-time").value) ? $("rm-time").value.slice(0, 5) : "09:00";
		if (q === "m15" || q === "h1") {
			var p = CK.partsIn(new Date(Date.now() + (q === "m15" ? 15 : 60) * 60000), tz);
			setDT(ymd(p), CK.pad(p.h) + ":" + CK.pad(p.m));
		} else if (q.charAt(0) === "d") setDT(plusDays(today, +q.slice(1)), keepT);
		else if (q === "mo1") {
			var x = new Date(Date.UTC(now.y, now.mo, 1)), last = new Date(Date.UTC(now.y, now.mo + 1, 0)).getUTCDate();    // same day next month, clamped (Jan 31 -> Feb 28)
			setDT(x.getUTCFullYear() + "-" + CK.pad(x.getUTCMonth() + 1) + "-" + CK.pad(Math.min(now.d, last)), keepT);
		} else {
			var d = $("rm-date").value || today;
			if (q === "t24") { if (d !== midSet) { midSet = plusDays(d, 1); setDT(midSet, "00:00"); } }    // a second click does not move it on again
			else {
				var t = q.slice(1) + ":00";
				if (d === today && t <= CK.pad(now.h) + ":" + CK.pad(now.m)) d = plusDays(d, 1);    // that time has passed today: the next one
				setDT(d, t);
			}
		}
	});

	// one plain "Next MES Stream" button: fills the form with the next stream from /reminder/upcoming.json (build_upcoming_streams.py); the visitor adjusts the rest
	fetch("/reminder/upcoming.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
		if (!data || !Array.isArray(data.streams)) return;
		var now = Date.now(), list = data.streams.map(function (x) { return { title: String(x.title || ""), url: RM.safeUrl(x.url), ms: Date.parse(x.start), notes: String(x.notes || "").slice(0, 600), len: +x.len || 120 }; })
			.filter(function (x) { return x.title && x.url && x.ms > now - 2 * 3600000; });    // a stream stays 2 h after its start (it is live then)
		if (!list.length) return;
		var row = $("rm-nextrow");
		row.innerHTML = '<button type="button" class="tu-chip" id="rm-nextbtn">Next MES Stream</button>';
		row.hidden = false;
		$("rm-nextbtn").addEventListener("click", function () { fillForm(list[0]); });
	}).catch(function () {});
})();
