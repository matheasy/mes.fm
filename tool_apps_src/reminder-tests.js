// node tool_apps_src/reminder-tests.js
const RM = require("./reminder/lib.js");
let n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL", msg); } }
const V = "America/Vancouver";
// 11:00 in Vancouver: PDT (UTC-7) on 25 Oct 2026, PST (UTC-8) on 8 Nov 2026
ok(RM.startOf({ t: "2026-10-25T11:00", tz: V }) === Date.UTC(2026, 9, 25, 18, 0), "PDT start");
ok(RM.startOf({ t: "2026-11-08T11:00", tz: V }) === Date.UTC(2026, 10, 8, 19, 0), "PST start");
ok(RM.startOf({ t: "2026-03-08T02:30", tz: V }) === Date.UTC(2026, 2, 8, 10, 30), "spring-forward gap moves on");
ok(RM.startOf({ t: "2026-10-25T18:00Z" }) === Date.UTC(2026, 9, 25, 18, 0), "absolute Z");
ok(RM.startOf({ t: "2026-10-25T11:00", tz: "Asia/Kolkata" }) === Date.UTC(2026, 9, 25, 5, 30), "Kolkata");
ok(isNaN(RM.startOf({ t: "2026-13-01T11:00", tz: V })), "bad month");
ok(isNaN(RM.startOf({ t: "2026-10-25T11:00", tz: "Mars/Base" })), "bad zone");
// weekly: next occurrence keeps 11:00 local across the DST change
const wk = { t: "2026-10-25T11:00", tz: V, r: "weekly", len: 60 };
ok(RM.nextStart(wk, Date.UTC(2026, 9, 25, 18, 30)) === Date.UTC(2026, 9, 25, 18, 0), "weekly: still running");
ok(RM.nextStart(wk, Date.UTC(2026, 9, 25, 19, 1)) === Date.UTC(2026, 10, 1, 19, 0), "weekly: next week after DST end (PST)");
ok(RM.nextStart(wk, Date.UTC(2027, 0, 1)) === Date.UTC(2027, 0, 3, 19, 0), "weekly: months later");
ok(RM.nextStart({ ...wk, r: "" }, Date.UTC(2027, 0, 1)) === Date.UTC(2026, 9, 25, 18, 0), "one-off stays");
// share link round trip
const ev = { title: "MES Livestream 150", t: "2026-10-25T11:00", tz: V, u: "youtube.com/watch?v=abc", d: "Line 1\nLine 2", r: "weekly", len: 90 };
const back = RM.fromQuery("?" + RM.toQuery(ev));
ok(back && back.title === ev.title && back.tz === V && back.u === "https://youtube.com/watch?v=abc" && back.d === ev.d && back.r === "weekly" && back.len === 90, "query round trip");
ok(RM.fromQuery("?title=x") === null, "no time -> null");
ok(RM.fromQuery("?t=garbage") === null, "bad time -> null");
ok(RM.safeUrl("javascript:alert(1)") === "" && RM.safeUrl("data:text/html,x") === "" && RM.safeUrl("localhost") === "", "unsafe urls dropped");
// calendars
const ics = RM.ics(ev, { now: Date.UTC(2026, 9, 1), leads: [60, 0], pageUrl: "https://mes.fm/reminder?x" });
ok(/DTSTART;TZID=America\/Vancouver:20261025T110000/.test(ics) && /DTEND;TZID=America\/Vancouver:20261025T123000/.test(ics), "ics weekly local");
ok(/RRULE:FREQ=WEEKLY/.test(ics) && /TRIGGER:-PT60M/.test(ics) && /TRIGGER:PT0M/.test(ics), "ics rrule + alarms");
ok(ics.split("\r\n").every((l) => l.length <= 75), "ics lines folded");
const one = RM.ics({ ...ev, r: "" }, { now: 0 });
ok(/DTSTART:20261025T180000Z/.test(one) && /DTEND:20261025T193000Z/.test(one) && !/RRULE/.test(one), "ics one-off UTC");
ok(/dates=20261025T180000Z%2F20261025T193000Z/.test(RM.googleUrl({ ...ev, r: "" })), "google one-off");
ok(/ctz=America%2FVancouver/.test(RM.googleUrl(ev)) && /recur=RRULE/.test(RM.googleUrl(ev)), "google weekly");
ok(/startdt=2026-10-25T18%3A00%3A00.000Z/.test(RM.outlookUrl(ev)), "outlook");
// browser alerts
const s = Date.UTC(2026, 9, 25, 18, 0);
ok(RM.dueAlerts({ ...ev, r: "" }, [15, 0], {}, s - 20 * 60000).length === 0, "nothing due early");
const d15 = RM.dueAlerts({ ...ev, r: "" }, [15, 0], {}, s - 10 * 60000);
ok(d15.length === 1 && d15[0].lead === 15, "15 min alert due");
ok(RM.dueAlerts({ ...ev, r: "" }, [15, 0], { [d15[0].key]: 1 }, s - 10 * 60000).length === 0, "fired not repeated");
ok(RM.dueAlerts({ ...ev, r: "" }, [15, 0], {}, s + 7 * 3600000).length === 0, "too late");
ok(RM.dueAlerts(ev, [0], {}, Date.UTC(2026, 10, 1, 19, 0, 5)).some((a) => a.start === Date.UTC(2026, 10, 1, 19, 0)), "weekly 2nd week due");
ok(RM.countdown(90061000).text === "1 d 1 h 1 min 1 s", "countdown");
// holidays for the quick buttons
[[2024, 3, 31], [2025, 4, 20], [2026, 4, 5], [2027, 3, 28], [2038, 4, 25], [2285, 3, 22]].forEach(([y, mo, d]) => { const p = RM.easter(y); ok(p.mo === mo && p.d === d, "easter " + y); });
const nh = (id, y, mo, d, ca) => { const p = RM.nextHoliday(id, { y, mo, d }, ca); return p.y + "-" + p.mo + "-" + p.d; };
ok(nh("thanksgiving", 2026, 10, 22, false) === "2026-11-26", "US thanksgiving 2026");
ok(nh("thanksgiving", 2026, 10, 1, true) === "2026-10-12", "CA thanksgiving 2026");
ok(nh("thanksgiving", 2026, 10, 22, true) === "2027-10-11", "CA thanksgiving passed -> 2027");
ok(nh("christmas", 2026, 12, 25) === "2026-12-25", "christmas today counts");
ok(nh("christmas", 2026, 12, 26) === "2027-12-25", "christmas passed");
ok(nh("newyear", 2026, 10, 22) === "2027-1-1", "new year");
ok(nh("easter", 2026, 10, 22) === "2027-3-28", "easter next year");
console.log(bad ? bad + " of " + n + " failed" : "all " + n + " passed");
process.exit(bad ? 1 : 0);
