/* MES Reminder -- pure helpers (no DOM). Browser global `RM` (needs the Clock's `CK`, loaded first via lib_from); node: require('./tool_apps_src/reminder/lib.js').
 * Tests: node tool_apps_src/reminder-tests.js
 * An event = { title, t ("2026-10-25T11:00" wall time in tz), tz, u (link), d (notes), r ("" | "weekly"), len (minutes) }. */
(function (root) {
	"use strict";
	var CK = root.CK || (typeof require !== "undefined" ? require("../clock/lib.js") : null);
	var pad = CK.pad;
	// "2026-10-25T11:00" -> {y, mo, d, h, m} or null
	function parseWall(s) {
		var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
		if (!m) return null;
		var w = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], m: +m[5] };
		if (w.mo < 1 || w.mo > 12 || w.d < 1 || w.d > 31 || w.h > 23 || w.m > 59) return null;
		return w;
	}
	function wallText(w) { return w.y + "-" + pad(w.mo) + "-" + pad(w.d) + "T" + pad(w.h) + ":" + pad(w.m); }
	// wall clock in tz -> UTC ms. Tries the offset of the day before, then the day after; a time that falls in the spring-forward gap
	// moves forward an hour, a time that happens twice (fall back) gets the first one.
	function wallToUtc(w, tz) {
		var guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.m), cands = [guess - 86400000, guess + 86400000].map(function (x) { return guess - CK.offsetMin(new Date(x), tz) * 60000; });
		for (var i = 0; i < 2; i++) { var p = CK.partsIn(new Date(cands[i]), tz); if (p.h === w.h && p.m === w.m && p.d === w.d) return cands[i]; }
		return cands[0];
	}
	function addDays(w, n) { var x = new Date(Date.UTC(w.y, w.mo - 1, w.d + n)); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), h: w.h, m: w.m }; }
	// instant (ms) of the event: absolute "...Z" / "+hh:mm" accepted too
	function startOf(ev) {
		if (/(Z|[+-]\d{2}:?\d{2})$/.test(ev.t || "")) { var a = Date.parse(ev.t); return isNaN(a) ? NaN : a; }
		var w = parseWall(ev.t); if (!w || !CK.valid(ev.tz || "UTC")) return NaN;
		return wallToUtc(w, ev.tz || "UTC");
	}
	// the occurrence to show at time `now`: a one-off is its start; a weekly one is the first start whose end (start + len) is still ahead
	function nextStart(ev, now) {
		var s = startOf(ev); if (isNaN(s) || ev.r !== "weekly") return s;
		var len = (+ev.len || 60) * 60000, w = parseWall(ev.t);
		if (!w) { while (s + len <= now) s += 7 * 86400000; return s; }
		if (s + len > now) return s;
		var k = Math.ceil((now - len - s) / (7 * 86400000)), t;
		for (var i = Math.max(k - 1, 1); ; i++) { t = wallToUtc(addDays(w, 7 * i), ev.tz || "UTC"); if (t + len > now) return t; }
	}
	// "2 d 3 h 4 min 5 s" (and parts)
	function countdown(ms) {
		var neg = ms < 0, a = Math.floor(Math.abs(ms) / 1000);
		var p = { neg: neg, d: Math.floor(a / 86400), h: Math.floor(a % 86400 / 3600), m: Math.floor(a % 3600 / 60), s: a % 60 };
		p.text = (p.d ? p.d + " d " : "") + (p.d || p.h ? p.h + " h " : "") + p.m + " min " + p.s + " s";
		return p;
	}
	function safeUrl(u) { u = String(u || "").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; try { var x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.indexOf(".") > 0 ? x.href : ""; } catch (e) { return ""; } }
	function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
	var LIMITS = { title: 120, d: 600, u: 600 };
	function clean(ev) {
		return {
			title: String(ev.title || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, LIMITS.title),
			t: String(ev.t || "").trim().slice(0, 40), tz: String(ev.tz || "").trim().slice(0, 60),
			u: safeUrl(String(ev.u || "").slice(0, LIMITS.u)), d: String(ev.d || "").replace(/\r/g, "").slice(0, LIMITS.d),
			r: ev.r === "weekly" ? "weekly" : "", len: Math.min(Math.max(Math.round(+ev.len || 60), 5), 24 * 60)
		};
	}
	// share link query (readable: ?title=..&t=2026-10-25T11:00&tz=America/Vancouver&u=..)
	function toQuery(ev) {
		var e = clean(ev), q = new URLSearchParams();
		q.set("title", e.title); q.set("t", e.t); if (e.tz && !/Z$/.test(e.t)) q.set("tz", e.tz);
		if (e.u) q.set("u", e.u); if (e.r) q.set("r", e.r); if (e.len !== 60) q.set("len", String(e.len)); if (e.d) q.set("d", e.d);
		return q.toString();
	}
	function fromQuery(search) {
		var q = new URLSearchParams(search || ""); if (!q.get("t")) return null;
		var e = clean({ title: q.get("title") || q.get("e") || "Reminder", t: q.get("t"), tz: q.get("tz") || "UTC", u: q.get("u") || "", d: q.get("d") || "", r: q.get("r") || "", len: q.get("len") || 60 });
		return isNaN(startOf(e)) ? null : e;
	}
	/* ---------- calendars ---------- */
	function utcStamp(ms) { var x = new Date(ms); return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + "T" + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + pad(x.getUTCSeconds()) + "Z"; }
	function wallStamp(w) { return w.y + pad(w.mo) + pad(w.d) + "T" + pad(w.h) + pad(w.m) + "00"; }
	function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
	function fold(line) { var out = [], s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); }
	function details(ev, pageUrl) { return [ev.u ? "Watch: " + ev.u : "", ev.d, pageUrl ? "Reminder page: " + pageUrl : ""].filter(Boolean).join("\n\n"); }
	// .ics text; leads = minutes before the start for each alarm (0 = at the start). Weekly events use the host's zone (TZID) so the time follows its daylight saving.
	function ics(ev, opts) {
		opts = opts || {}; var e = clean(ev), s = startOf(e), len = e.len * 60000, w = parseWall(e.t), now = opts.now || Date.now();
		var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MES//Reminder//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
			"UID:" + (opts.uid || ("mes-" + s + "-" + Math.abs(hash(e.title + e.t))) + "@mes.fm"), "DTSTAMP:" + utcStamp(now)];
		if (e.r === "weekly" && w && e.tz && e.tz !== "UTC") {
			var end = new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.m) + len);
			L.push("DTSTART;TZID=" + e.tz + ":" + wallStamp(w), "DTEND;TZID=" + e.tz + ":" + wallStamp({ y: end.getUTCFullYear(), mo: end.getUTCMonth() + 1, d: end.getUTCDate(), h: end.getUTCHours(), m: end.getUTCMinutes() }));
		} else L.push("DTSTART:" + utcStamp(s), "DTEND:" + utcStamp(s + len));
		if (e.r === "weekly") L.push("RRULE:FREQ=WEEKLY");
		L.push("SUMMARY:" + icsEsc(e.title));
		var det = details(e, opts.pageUrl); if (det) L.push("DESCRIPTION:" + icsEsc(det));
		if (e.u) L.push("URL:" + e.u, "LOCATION:" + icsEsc(e.u));
		(opts.leads || [15, 0]).forEach(function (m) {
			L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(e.title), "TRIGGER:" + (m ? "-PT" + m + "M" : "PT0M"), "END:VALARM");
		});
		L.push("END:VEVENT", "END:VCALENDAR");
		return L.map(fold).join("\r\n") + "\r\n";
	}
	function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
	function googleUrl(ev, pageUrl) {
		var e = clean(ev), s = startOf(e), q = new URLSearchParams(), w = parseWall(e.t);
		q.set("action", "TEMPLATE"); q.set("text", e.title);
		if (e.r === "weekly" && w && e.tz) { var end = new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.m) + e.len * 60000); q.set("dates", wallStamp(w) + "/" + wallStamp({ y: end.getUTCFullYear(), mo: end.getUTCMonth() + 1, d: end.getUTCDate(), h: end.getUTCHours(), m: end.getUTCMinutes() })); q.set("ctz", e.tz); q.set("recur", "RRULE:FREQ=WEEKLY"); }
		else q.set("dates", utcStamp(s) + "/" + utcStamp(s + e.len * 60000));
		var det = details(e, pageUrl); if (det) q.set("details", det); if (e.u) q.set("location", e.u);
		return "https://calendar.google.com/calendar/render?" + q.toString();
	}
	function outlookUrl(ev, pageUrl) {
		var e = clean(ev), s = startOf(e), q = new URLSearchParams();
		q.set("path", "/calendar/action/compose"); q.set("rru", "addevent"); q.set("subject", e.title);
		q.set("startdt", new Date(s).toISOString()); q.set("enddt", new Date(s + e.len * 60000).toISOString());
		var det = details(e, pageUrl); if (det) q.set("body", det); if (e.u) q.set("location", e.u);
		return "https://outlook.live.com/calendar/0/deeplink/compose?" + q.toString();
	}
	// browser alerts due at `now`: [{lead, at}] for leads whose time has come but not passed by more than `grace` ms and are not in `fired`
	function dueAlerts(ev, leads, fired, now, grace) {
		grace = grace || 6 * 3600000; var s = nextStart(ev, now - grace), out = [];
		if (isNaN(s)) return out;
		[s, ev.r === "weekly" ? nextStart(ev, s + (+ev.len || 60) * 60000 + 1) : NaN].forEach(function (st) {
			if (isNaN(st)) return;
			leads.forEach(function (m) { var at = st - m * 60000, key = st + ":" + m; if (now >= at && now - at < grace && !(fired && fired[key])) out.push({ lead: m, start: st, at: at, key: key }); });
		});
		return out;
	}
	function leadText(m) { return m === 0 ? "at the start" : m < 60 ? m + " min before" : m < 1440 ? (m / 60) + " hour" + (m === 60 ? "" : "s") + " before" : (m / 1440) + " day" + (m === 1440 ? "" : "s") + " before"; }
	var RM = { parseWall: parseWall, wallText: wallText, wallToUtc: wallToUtc, startOf: startOf, nextStart: nextStart, countdown: countdown, safeUrl: safeUrl, host: host, clean: clean,
		toQuery: toQuery, fromQuery: fromQuery, ics: ics, googleUrl: googleUrl, outlookUrl: outlookUrl, dueAlerts: dueAlerts, leadText: leadText, utcStamp: utcStamp };
	if (typeof module !== "undefined" && module.exports) module.exports = RM; else root.RM = RM;
})(typeof window !== "undefined" ? window : globalThis);
