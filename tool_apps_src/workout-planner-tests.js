// node tool_apps_src/workout-planner-tests.js -- pure logic of mes.fm/workout-planner (MESWP)
"use strict";
const W = require("./workout-planner/lib.js");
let n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL:", msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

// MES default template = the user's spreadsheet
const p = W.template("mes");
eq(p.days.map(d => W.DOW3[d.dow]), ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], "mes rows Sun..Sat");
eq(p.days.map(d => d.time), Array(7).fill("16:00"), "all at 4 PM");
eq(W.fmtTime("16:00"), "4:00 PM", "fmtTime 12h");
eq(W.fmtTime("00:05"), "12:05 AM", "fmtTime midnight");
eq(W.dayById(p, p.here).dow, 4, "Here on Thursday");
eq(W.cellItems(p.days[4], "cardio").map(x => x.name), ["Aiming Training"], "Thu cardio");
eq(W.cellItems(p.days[1], "work").map(x => x.name), ["Kickboxing"], "Mon workout");
eq(p.note, "Pre-workout routine as needed.", "note");
const L = p.lists[0];
eq(L.name, "Soccer / Basketball Training List", "list name");
eq(L.groups[0].items.map(x => [x.name, x.done]), [["Soccer Deaks", "2026-10-22"], ["Soccer Jugglin'", ""]], "monday box");
eq(L.groups[1].mode, "one", "rotation group");
eq(W.findItem(p, L.groups[1].here).item.name, "Basketball Dunks", "list Here = dunks");
eq(W.groupNext(L.groups[1]), L.groups[1].items[0].id, "rotation wraps to first");

// every template is valid and survives a normalize round trip
Object.keys(W.TEMPLATES).forEach(k => {
	const t = W.template(k);
	ok(t.days.length === 7 && t.cats.length >= 2, "template " + k + " shape");
	eq(W.normalize(JSON.parse(JSON.stringify(t))), t, "template " + k + " normalize idempotent");
});

// times
eq(["4:00 PM", "4pm", "16:00", "1600", "12am", "12:30 pm", "13pm", "x"].map(W.parseTime), ["16:00", "16:00", "16:00", "16:00", "00:00", "12:30", "", ""], "parseTime");

// moves
let q = W.template("mes");
const run = q.days[0].items[0];
W.moveItem(q, run.id, { kind: "c", day: q.days[1].id, cat: "work" }, 0);
eq(q.days[0].items.length, 0, "moved out of Sunday");
eq(q.days[1].items.map(x => x.name + ":" + x.cat), ["Running:work", "Kickboxing:work"], "moved into Monday workouts at the start, cat changed");
W.moveItem(q, run.id, { kind: "c", day: q.days[1].id, cat: "work" }, 5);
eq(q.days[1].items.map(x => x.name), ["Kickboxing", "Running"], "reorder within a cell (index clamped)");
const cp = W.moveItem(q, run.id, { kind: "c", day: q.days[2].id, cat: "cardio" }, 0, true);
ok(cp && cp.id !== run.id && W.findItem(q, run.id), "copy keeps original");
eq(W.cellItems(q.days[2], "cardio").map(x => x.name), ["Running"], "copy into cardio of Tuesday");
// week -> list group and back; Here pointer of a rotation follows removals
const g = q.lists[0].groups[1], dunks = g.here;
W.moveItem(q, dunks, { kind: "c", day: q.days[6].id, cat: "work" });
eq(W.findItem(q, g.here).item.name, "Chair dribbling", "Here moves to a neighbour when its item leaves");
W.moveItem(q, run.id, { kind: "g", list: q.lists[0].id, grp: g.id }, 0);
eq(g.items[0].name, "Running", "week item into a list");
ok(!W.moveItem(q, "nope", { kind: "c", day: q.days[0].id, cat: "work" }), "unknown id");
ok(!W.moveItem(q, g.items[0].id, { kind: "c", day: q.days[0].id, cat: "zzz" }), "unknown category refused");
W.removeItem(q, g.items[0].id); eq(g.items[0].name, "Soccer Aiming (3 Targets)", "remove");
W.moveRow(q, 0, 6); eq(q.days.map(d => d.dow), [1, 2, 3, 4, 5, 6, 0], "row reorder");

// advancing Here skips rest days
let r = W.template("fivex5");
eq(r.days.map(d => d.dow), [1, 3, 5, 0, 2, 4, 6], "5x5 rotation order");
eq(W.dayById(r, W.advance(r, true)).dow, 3, "Mon -> Wed");
W.advance(r, true); eq(W.dayById(r, W.advance(r, true)).dow, 1, "Fri -> Mon (skips 4 rest days)");
eq(W.dayById(r, W.advance(r, false)).dow, 3, "no skip -> next row");
const e = W.template("empty"); eq(W.advance(e, true), e.days[1].id, "all empty: just the next row");

// log + streaks + heat + summary
const s = W.template("mes");
W.logItems(s, [{ name: "Running", cat: "cardio", dur: 30 }], "2026-10-27");
W.logItems(s, [{ name: "Abs", cat: "work" }], "2026-10-28");
W.logItems(s, [{ name: "Garage", cat: "work" }], "2026-10-29");
W.logItems(s, [{ name: "Running", cat: "cardio" }], "2026-10-20");
eq(W.streaks(s.log, "2026-10-29"), { current: 3, best: 3, activeDays: 4, total: 4 }, "streak incl. today");
eq(W.streaks(s.log, "2026-10-30").current, 3, "streak still alive the next morning");
eq(W.streaks(s.log, "2026-10-31").current, 0, "streak broken after a missed day");
eq(W.weekStreak(s.log, "2026-10-29", 1, 0), 2, "two weeks in a row with a workout");
const h = W.heat(s.log, "2026-10-29", 4, 0);
eq([h.length, h[0].d, h[h.length - 1].d], [28, "2026-10-04", "2026-10-31"], "heat 4 weeks, Sunday start");
eq(h.filter(x => x.n).length, 4, "heat counts"); ok(h[h.length - 1].future, "future flag");
const ws = W.weekSummary(s, "2026-10-29", 0);
eq([ws.start, ws.end, ws.activeDays, ws.plannedDays], ["2026-10-25", "2026-10-31", 3, 7], "week summary range");
eq(ws.rows.map(x => [x.name, x.planned, x.done, x.minutes]), [["Cardio", 3, 1, 30], ["Workouts", 4, 2, 0]], "planned vs done");
eq(W.weekStart("2026-10-29", 1), "2026-10-26", "Monday start");

// export / import round trip
const csv = W.planCSV(W.template("mes"), "2026-10-29");
ok(csv.split("\r\n")[0] === "Day,Time,Cardio,Workouts,Currently At", "csv header");
ok(csv.indexOf("Thursday,4:00 PM,Aiming Training,,Here") > 0, "csv here row");
ok(csv.indexOf("Done Oct 22") > 0, "csv list done date");
const tsv = W.toTSV(W.grid(W.template("ppl")));
const back = W.parseTable(tsv);
ok(!back.error, "tsv import ok");
eq(back.plan.days.map(d => d.items.length), W.template("ppl").days.map(d => d.items.length), "tsv round trip item counts");
eq(W.findItem(back.plan, back.plan.days[1].items[0].id).item.sets, 4, "sets parsed back from Bench press (4×6-8)");
eq(back.plan.days[1].items[0].reps, "6-8", "reps parsed back");
// the user's sheet pasted from Excel (tab separated, quoted multi-line cell, note line)
const excel = "Day\tTime\tCardio\tWorkouts\tCurrently At\nSunday\t4:00 PM\tRunning\t\t\nMonday\t4:00 PM\t\tKickboxing\t\nTuesday\t4:00 PM\t\tHandstands\t\nWednesday\t4:00 PM\tRunning\t\t\nThursday\t4:00 PM\tAiming Training\t\tHere\nFriday\t4:00 PM\t\t\"Garage\nAbs 3x20\"\t\nSaturday\t4:00 PM\t\tAbs\t\n\nPre-workout routine as needed.\t\t\t\t";
const im = W.parseTable(excel);
ok(!im.error, "excel import ok");
eq(W.dayById(im.plan, im.plan.here).dow, 4, "excel Here");
eq(im.plan.days[5].items.map(x => [x.name, x.sets, x.reps]), [["Garage", 0, ""], ["Abs", 3, "20"]], "multi-line cell");
eq(im.plan.note, "Pre-workout routine as needed.", "excel note");
eq(im.plan.cats.map(c => c.id), ["cardio", "work"], "known category ids");
eq(W.parseTable("Sun,7am,Run\nMon,,").plan.days[0].items[0].name, "Run", "headerless CSV");
ok(W.parseTable("a,b\nc,d").error, "no days -> error");
eq(W.parseItemText("Run (30 min)"), { name: "Run", sets: 0, reps: "", dur: 30 }, "item text minutes");
eq(W.parseItemText("Soccer Aiming (3 Targets)").name, "Soccer Aiming (3 Targets)", "brackets that are not sets stay in the name");
eq(["Thu", "thurs", "tu", "SAT", "s", "x"].map(W.dowFromText), [4, 4, 2, 6, -1, -1], "day names");

// share links
const t = W.template("mes"); W.logItems(t, [{ name: "x" }], "2026-10-01");
const enc = W.encodeShare(t), dec = W.decodeShare(enc);
ok(/^1[A-Za-z0-9_-]+$/.test(enc) && enc.length < 2000, "share link short and url-safe (" + enc.length + ")");
ok(W.sameDays(dec, t), "share round trip");
eq(dec.log.length, 0, "log never in links");
eq(W.findItem(dec, dec.lists[0].groups[1].here).item.name, "Basketball Dunks", "list Here survives the link");
eq(dec.lists[0].groups[0].items[0].done, "2026-10-22", "done date survives the link");
ok(W.decodeShare("1!!!") === null && W.decodeShare("x") === null, "bad links");
const uni = W.template("empty"); uni.title = "Entraînement été 💪"; eq(W.decodeShare(W.encodeShare(uni)).title, "Entraînement été 💪", "unicode title");

// normalize is defensive
const junk = W.normalize({ cats: [{ id: "<b>", name: "x".repeat(500), color: "red" }], days: [{ dow: 9 }, { dow: 2, time: "25:00", items: [{ name: "<img>", cat: "nope", sets: "abc", dur: -4 }] }], log: [{ d: "bad" }, { d: "2026-01-02", n: "a" }] });
eq(junk.days.length, 7, "always 7 days");
ok(/^#[0-9a-f]{6}$/.test(junk.cats[0].color) && junk.cats[0].name.length <= 40 && /^[a-z0-9_-]+$/i.test(junk.cats[0].id), "bad category cleaned");
const tue = junk.days.find(d => d.dow === 2);
eq([tue.time, tue.items[0].cat, tue.items[0].sets, tue.items[0].dur], ["", junk.cats[0].id, 0, 0], "bad item cleaned");
eq(junk.log.length, 1, "bad log rows dropped");
const dup = W.normalize({ days: [{ id: "a", dow: 0, items: [{ id: "z", name: "1" }, { id: "z", name: "2" }] }] });
ok(dup.days[0].items[0].id !== dup.days[0].items[1].id, "duplicate ids made unique");

console.log(bad ? bad + " of " + n + " checks FAILED" : "All " + n + " checks passed");
process.exit(bad ? 1 : 0);
