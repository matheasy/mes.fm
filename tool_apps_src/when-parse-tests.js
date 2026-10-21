/* Tests for mes.fm/main_js/when-parse.js (MESWhen): node tool_apps_src/when-parse-tests.js */
"use strict";
var W = require("../mes.fm/main_js/when-parse.js");
var NOW = Date.UTC(2026, 9, 21, 19, 0); // Wed 21 Oct 2026, 12:00 in Vancouver
var fails = 0, n = 0;
function check(name, ok, info) { n++; if (!ok) { fails++; console.log("FAIL " + name + (info ? "  -> " + info : "")); } }
function t(text, exp, opts) {
	var o = { now: NOW, zone: "America/Vancouver", order: "mdy" }; for (var k in opts || {}) o[k] = opts[k];
	var r = W.parse(text, o), info = JSON.stringify(r.ok ? { date: r.date, time: r.time, zone: r.zone, wk: r.weekday, notes: r.notes } : r);
	if (exp === null) { check(text + " (error)", !r.ok, info); return r; }
	if (!r.ok) { check(text, false, info); return r; }
	var ok = true;
	if ("date" in exp && r.date !== exp.date) ok = false;
	if ("time" in exp && r.time !== exp.time) ok = false;
	if ("zone" in exp && r.zone !== exp.zone) ok = false;
	if ("wk" in exp && r.weekday.ok !== exp.wk) ok = false;
	if ("note" in exp && !r.notes.some(function (x) { return exp.note.test(x); })) ok = false;
	if ("noNotes" in exp && r.notes.length) ok = false;
	check(text, ok, info);
	return r;
}
// the user's own example
var u = t("October 28, 2026 Wednesday at 10:00 AM PCT", { date: "2026-10-28", time: "10:00", zone: "America/Vancouver", wk: true });
check("user example instant", u.ms === Date.UTC(2026, 9, 28, 17, 0), u.ms);
check("user example label", /Pacific/.test(u.zoneLabel), u.zoneLabel);
t("October 28, 2026 Wednesday at 10:00 AM PCT", { zone: "America/Los_Angeles" }, { zone: "Europe/London" });
t("Oct 28 2026 10am PT", { date: "2026-10-28", time: "10:00", zone: "America/Vancouver" });
t("Oct 28 2026, Wed 10 am PT", { date: "2026-10-28", time: "10:00", wk: true });
// month names in any order
t("Oct 28 2026", { date: "2026-10-28", time: null, zone: null });
t("28 October 2026", { date: "2026-10-28" });
t("28th of October, 2026", { date: "2026-10-28" });
t("October 28th", { date: "2026-10-28" });
t("2026 Oct 28", { date: "2026-10-28" });
t("Sept 3 2027", { date: "2027-09-03" });
t("Dec. 25", { date: "2026-12-25" });
t("Jan 5", { date: "2027-01-05", note: /No year given/ });
t("march 2027", { date: "2027-03-01", note: /No day given/ });
t("Wednesday 28 October 2026", { date: "2026-10-28", wk: true });
// numeric dates
t("2026-01-02 5:30pm", { date: "2026-01-02", time: "17:30", noNotes: true });
t("2026-10-28 10am PT", { date: "2026-10-28", time: "10:00", zone: "America/Vancouver" });
t("2026-10-28", { date: "2026-10-28" });
t("2026/10/28", { date: "2026-10-28" });
t("2026-10-28T10:00Z", { date: "2026-10-28", time: "10:00", zone: "UTC" });
t("2026-10-28T10:00+07:00", { date: "2026-10-28", time: "10:00", zone: "Etc/GMT-7" });
t("10/28/2026", { date: "2026-10-28", noNotes: true });
t("28/10/2026", { date: "2026-10-28", noNotes: true });
t("10/11/2026", { date: "2026-10-11", note: /month first/ });
t("10/11/2026", { date: "2026-11-10", note: /day first/ }, { order: "dmy" });
t("28.10.2026 19:00", { date: "2026-10-28", time: "19:00" });
t("5/5/26", { date: "2026-05-05", noNotes: true });
t("13/13/2026", null);
// ordinals, day alone
t("the 28th", { date: "2026-10-28" });
t("on the 5th", { date: "2026-11-05" });
// weekdays
t("Oct 30 2026 Wednesday", { date: "2026-10-30", wk: false, note: /is a Friday, not a Wednesday.*Wed 28 Oct 2026/ });
var wr = W.parse("Oct 30 2026 Wednesday", { now: NOW, zone: "America/Vancouver" });
check("weekday suggestion", wr.weekday.suggest === "2026-10-28", wr.weekday.suggest);
t("Thu Oct 29 2026 7:30pm ET", { date: "2026-10-29", time: "19:30", zone: "America/New_York", wk: true });
t("friday", { date: "2026-10-23" });
t("this friday 7pm", { date: "2026-10-23", time: "19:00" });
t("next wednesday", { date: "2026-10-28" });
t("wednesday", { date: "2026-10-21" });
t("wednesday 9am", { date: "2026-10-28", time: "09:00" });
t("wednesday 3pm", { date: "2026-10-21", time: "15:00" });
t("monday after next", { date: "2026-11-02" });
t("last friday", { date: "2026-10-16" });
t("next week friday", { date: "2026-10-30" });
// relative words
t("today", { date: "2026-10-21", time: null });
t("tomorrow at 6pm", { date: "2026-10-22", time: "18:00" });
t("tmrw 8:15", { date: "2026-10-22", time: "08:15" });
t("tonight", { date: "2026-10-21", time: "20:00", note: /tonight/ });
t("tonight at 9", { date: "2026-10-21", time: "21:00" });
t("tomorrow morning", { date: "2026-10-22", time: "09:00" });
t("day after tomorrow", { date: "2026-10-23" });
t("yesterday", { date: "2026-10-20" });
t("in 3 days", { date: "2026-10-24" });
t("in 3 days at 5pm", { date: "2026-10-24", time: "17:00" });
t("in a week", { date: "2026-10-28" });
t("in 2 weeks", { date: "2026-11-04" });
t("in 2 hours", { date: "2026-10-21", time: "14:00", zone: "America/Vancouver" });
t("in 90 minutes", { time: "13:30" });
t("in half an hour", { time: "12:30" });
t("in 1.5 hours", { time: "13:30" });
t("in an hour and a half", { time: "13:30" });
t("3 days from now", { date: "2026-10-24" });
t("2 weeks ago", { date: "2026-10-07" });
t("next week", { date: "2026-10-28" });
t("next month", { date: "2026-11-21" });
t("next year", { date: "2027-10-21" });
t("this weekend", { date: "2026-10-24" });
t("in 1 month", { date: "2026-11-21" });
// times
t("noon tomorrow", { date: "2026-10-22", time: "12:00" });
t("12 noon Oct 28", { date: "2026-10-28", time: "12:00" });
t("midnight Oct 28", { date: "2026-10-28", time: "00:00", note: /start of/ });
t("half past 6 pm", { time: "18:30" });
t("quarter to 7 pm", { time: "18:45" });
t("quarter past 9 tomorrow", { date: "2026-10-22", time: "09:15" });
t("22:30", { date: "2026-10-21", time: "22:30" });
t("10:00", { date: "2026-10-22", time: "10:00", note: /passed today/ });
t("10:00", { date: "2026-10-21", time: "10:00" }, { futureOnly: false });
t("6.30pm", { time: "18:30" });
t("6:30p", { time: "18:30" });
t("10h30 Oct 28", { date: "2026-10-28", time: "10:30" });
t("1830h oct 28", { time: "18:30" });
t("at 6", { time: "18:00", note: /add am or pm/ });
t("at 9 oct 28", { date: "2026-10-28", time: "09:00", note: /add am or pm/ });
t("at 8 in the evening oct 28", { time: "20:00" });
t("7 o'clock tomorrow", { time: "19:00" });
t("10 a.m. Oct 28", { time: "10:00" });
t("25:00 oct 28", { time: null });
// time zones
t("oct 28 10am EST", { zone: "America/New_York", time: "10:00", note: /daylight/ });
t("dec 3 10am PDT", { zone: "America/Vancouver", note: /PDT is daylight time, but on/ });
t("Oct 28 10am PST", { zone: "America/Vancouver", note: /PST is standard time/ });
t("Oct 28 10am PT", { zone: "America/Los_Angeles" }, { zone: "Asia/Tokyo" });
t("Oct 28 10am Pacific time", { zone: "America/Vancouver" });
t("Oct 28 10am pacific", { zone: "America/Vancouver" });
t("Oct 28 10am Eastern Time", { zone: "America/New_York" });
t("Oct 28 10am ET", { zone: "America/Toronto" }, { zone: "America/Toronto" });
t("Oct 28 10am MT", { zone: "America/Denver" });
t("Oct 28 10am CT", { zone: "America/Chicago" });
t("Oct 28 10am CST", { zone: "America/Chicago", note: /China Standard Time/ });
t("Oct 28 10am CST", { zone: "Asia/Shanghai" }, { zone: "Asia/Shanghai" });
t("Oct 28 10am IST", { zone: "Asia/Kolkata", note: /India/ });
t("Oct 28 10am IST", { zone: "Europe/Dublin" }, { zone: "Europe/Dublin" });
t("Oct 28 10am BST", { zone: "Europe/London" });
t("Oct 28 10am AKT", { zone: "America/Anchorage" });
t("Oct 28 10am HST", { zone: "Pacific/Honolulu" });
t("Oct 28 10am GMT", { zone: "UTC" });
t("Oct 28 10am UTC", { zone: "UTC" });
t("Oct 28 10am CET", { zone: "Europe/Paris" });
t("Oct 28 10am CEST", { zone: "Europe/Berlin" }, { zone: "Europe/Berlin" });
t("Oct 28 10am EET", { zone: "Europe/Athens" });
t("Oct 28 10am JST", { zone: "Asia/Tokyo" });
t("Oct 28 10am AEST", { zone: "Australia/Sydney" });
t("Oct 28 10am AEDT", { zone: "Australia/Sydney" });
t("Oct 28 10am NZST", { zone: "Pacific/Auckland" });
t("Oct 28 10am ICT", { zone: "Asia/Ho_Chi_Minh" });
t("Oct 28 10am UTC+7", { zone: "Etc/GMT-7" });
t("Oct 28 10am GMT-5", { zone: "Etc/GMT+5" });
t("Oct 28 10am UTC+5:30", { zone: "Asia/Kolkata" });
t("Oct 28 10am UTC+99", { time: "10:00", zone: null, note: /not a real/ });
t("Oct 28 10am Vancouver time", { zone: "America/Vancouver" });
t("Oct 28 10am in Tokyo", { zone: "Asia/Tokyo" });
t("5:30 pm new york oct 28", { zone: "America/New_York" });
t("Oct 28 10am Los Angeles", { zone: "America/Los_Angeles" });
t("Oct 28 10am London", { zone: "Europe/London" });
t("Oct 28 10am Hanoi", { zone: "Asia/Ho_Chi_Minh" });
t("Oct 28 10am NYC", { zone: "America/New_York" });
t("oct 28 i will eat at 6 pm", { zone: null, time: "18:00" });
t("Oct 28 cat video 6 pm", { zone: null });
t("Oct 28 6 pm CAT", { zone: "Africa/Maputo" });
t("wake up oct 28 7am", { zone: null });
// filler words
t("livestream starts Oct 28 at 10 am PT", { date: "2026-10-28", time: "10:00", zone: "America/Vancouver", noNotes: true });
t("the stream is on Wednesday, October 28, 2026 at 10:00 AM PCT", { date: "2026-10-28", time: "10:00", wk: true });
t("MES Livestream Oct 28 10am PT", { date: "2026-10-28", note: /Not used: “mes”/ });
// holidays
t("Christmas", { date: "2026-12-25" });
t("christmas eve 2027 8pm", { date: "2027-12-24", time: "20:00" });
t("new year's eve", { date: "2026-12-31" });
t("new year", { date: "2027-01-01" });
t("halloween", { date: "2026-10-31" });
t("easter", { date: "2027-03-28" });
t("easter 2026", { date: "2026-04-05" });
t("canada day", { date: "2027-07-01" });
// daylight saving
var dst = t("mar 8 2026 2:30am Vancouver", { date: "2026-03-08" });
check("spring-forward gap note", dst.ok && dst.notes.some(function (x) { return /does not exist/.test(x); }), JSON.stringify(dst.notes));
var fb = W.parse("nov 1 2026 1:30am PT", { now: NOW, zone: "America/Vancouver" });
check("fall-back picks first", fb.ms === Date.UTC(2026, 10, 1, 8, 30), fb.ms);
// errors
t("Feb 30 2027", null);
t("feb 29 2028", { date: "2028-02-29" });
t("", null);
t("hello there", null);
t("xyz", null);
// ranges
function rg(text, a, b, opts) {
	var o = { now: NOW, zone: "America/Vancouver", order: "mdy" }; for (var k in opts || {}) o[k] = opts[k];
	var r = W.parseRange(text, o);
	check("range " + text, r.ok && r.a.date === a && (b === null ? !r.b : r.b && r.b.date === b), JSON.stringify(r.ok ? [r.a.date, r.b && r.b.date] : r));
}
rg("from Oct 1 2026 to Dec 25 2026", "2026-10-01", "2026-12-25");
rg("Oct 1 to Dec 25 2027", "2027-10-01", "2027-12-25");
rg("today until christmas", "2026-10-21", "2026-12-25");
rg("between 1/1/2026 and 3/1/2026", "2026-01-01", "2026-03-01");
rg("2026-01-01 - 2026-12-31", "2026-01-01", "2026-12-31");
rg("2026-01-01 for 90 days", "2026-01-01", "2026-04-01");
rg("today for 2 weeks", "2026-10-21", "2026-11-04");
rg("Oct 28 2026", "2026-10-28", null);
rg("Jan 1 2026 through Jun 30 2026", "2026-01-01", "2026-06-30");
check("range error", !W.parseRange("nothing here", { now: NOW }).ok);
t("tomorrow 6 pm Tokyo", { date: "2026-10-23", zone: "Asia/Tokyo", note: /counted from today in Tokyo/ });
// helpers
check("easter 2025", JSON.stringify(W.easter(2025)) === JSON.stringify({ mo: 4, d: 20 }));
check("toInstant", W.toInstant(2026, 10, 28, 10, 0, "America/Vancouver") === Date.UTC(2026, 9, 28, 17, 0));
console.log((n - fails) + " / " + n + " passed");
if (fails) process.exit(1);
