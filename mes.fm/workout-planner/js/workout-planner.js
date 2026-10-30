/* MES Workout Planner -- pure logic (global MESWP; node: require('./tool_apps_src/workout-planner/lib.js')).
 * Plan model (localStorage "mes-workout-planner:v1", share links ?p=, JSON backups):
 *   { v:1, title, note,
 *     cats:  [{id, name, color}],                               // activity categories (Cardio, Workouts, ... user-addable)
 *     days:  [{id, dow 0-6, time "16:00"|"" , items:[item]}],   // the week; array ORDER = rotation order ("Currently at" walks it)
 *     here:  day id,                                            // the "Currently at / Here" pointer of the week
 *     lists: [{id, name, note, groups:[{id, title, mode "all"|"one", here:item id, items:[item]}]}],
 *     log:   [{d "YYYY-MM-DD", n name, c cat id, m minutes, k "w"|list id}] }
 *   item = {id, name, cat, sets, reps, dur (minutes), note, done "YYYY-MM-DD"|""}
 * "all" groups are checklists (each item gets a done date), "one" groups are rotations: do the item marked Here, then Here moves on.
 */
(function (root) {
	"use strict";
	var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	var DOW3 = DOW.map(function (d) { return d.slice(0, 3); });
	var PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#475569", "#9333ea", "#0d9488"];
	var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	var LIM = { cats: 12, items: 40, lists: 20, groups: 12, gitems: 80, log: 6000, text: 120, note: 600 };

	var seq = 0;
	function uid(p) { seq = (seq + 1) % 1679616; return (p || "x") + Date.now().toString(36).slice(-5) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }
	function str(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n || LIM.text); }
	function okColor(c) { return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : ""; }
	function okDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + "T12:00:00Z")) ? d : ""; }
	function okTime(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m && +m[1] < 24 && +m[2] < 60 ? ("0" + (+m[1])).slice(-2) + ":" + m[2] : ""; }
	function num(x, max) { var n = parseFloat(x); return isFinite(n) && n > 0 ? Math.min(Math.round(n * 10) / 10, max || 9999) : 0; }
	function idOk(id, p) { return /^[a-z0-9_-]{1,24}$/i.test(id || "") ? id : uid(p); }

	/* ---------- dates ---------- */
	function dateKey(dt) { dt = dt || new Date(); return dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2); }
	function parseKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
	function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
	function dowOf(k) { return parseKey(k).getDay(); }
	function shortDate(k, today) {   // "Oct 22" (+ year when not this year)
		if (!okDate(k)) return "";
		var d = parseKey(k), s = MONTHS[d.getMonth()] + " " + d.getDate();
		if (today && today.slice(0, 4) !== k.slice(0, 4)) s += ", " + k.slice(0, 4);
		return s;
	}
	function weekStart(k, startDow) { var n = (dowOf(k) - (startDow || 0) + 7) % 7; return addDays(k, -n); }
	function fmtTime(t, h24) {
		t = okTime(t); if (!t) return "";
		var h = +t.slice(0, 2), m = t.slice(3);
		if (h24) return t;
		return ((h % 12) || 12) + ":" + m + " " + (h < 12 ? "AM" : "PM");
	}
	function parseTime(s) {   // "4:00 PM", "4pm", "16:00", "1600" -> "16:00"
		s = String(s || "").trim().toLowerCase().replace(/\./g, "");
		var m = /^(\d{1,2})(?::?(\d{2}))?\s*(a|p|am|pm)?$/.exec(s);
		if (!m) return "";
		var h = +m[1], mi = m[2] ? +m[2] : 0;
		if (m[3]) { if (h > 12 || h === 0) return ""; h = h % 12 + (m[3][0] === "p" ? 12 : 0); }
		return okTime(h + ":" + ("0" + mi).slice(-2));
	}

	/* ---------- items ---------- */
	function item(name, cat, o) {
		o = o || {};
		return { id: uid("i"), name: str(name), cat: cat || "", sets: o.sets || 0, reps: o.reps || "", dur: o.dur || 0, note: o.note || "", done: o.done || "" };
	}
	function cleanItem(x, cats) {
		x = x || {};
		var it = { id: idOk(x.id, "i"), name: str(x.name) || "Activity", cat: "", sets: num(x.sets, 99) | 0, reps: str(x.reps, 20), dur: num(x.dur, 1440), note: str(x.note, 300), done: okDate(x.done) };
		if (cats && cats.some(function (c) { return c.id === x.cat; })) it.cat = x.cat;
		return it;
	}
	function meta(it) {   // "3×10 · 20 min"
		var a = [];
		if (it.sets && it.reps) a.push(it.sets + "×" + it.reps);
		else if (it.sets) a.push(it.sets + " sets");
		else if (it.reps) a.push(it.reps + " reps");
		if (it.dur) a.push(it.dur + " min");
		return a.join(" · ");
	}

	/* ---------- normalise anything loaded (storage, links, backups, imports) ---------- */
	function normalize(p) {
		p = p && typeof p === "object" ? p : {};
		var o = { v: 1, title: str(p.title, 80) || "My Workout Routine", note: str(p.note, LIM.note), cats: [], days: [], here: "", lists: [], log: [] };
		var seen = {};
		(Array.isArray(p.cats) ? p.cats : []).slice(0, LIM.cats).forEach(function (c, i) {
			if (!c) return; var id = idOk(c.id, "c"); if (seen[id]) id = uid("c"); seen[id] = 1;
			o.cats.push({ id: id, name: str(c.name, 40) || "Category", color: okColor(c.color) || PALETTE[i % PALETTE.length] });
		});
		if (!o.cats.length) o.cats = defaultCats();
		var used = {};
		(Array.isArray(p.days) ? p.days : []).forEach(function (d) {
			if (!d || !(d.dow >= 0 && d.dow <= 6) || used[d.dow]) return; used[d.dow] = 1;
			o.days.push({ id: idOk(d.id, "d"), dow: d.dow | 0, time: okTime(d.time), items: (Array.isArray(d.items) ? d.items : []).slice(0, LIM.items).map(function (x) { var it = cleanItem(x, o.cats); if (!it.cat) it.cat = o.cats[0].id; return it; }) });
		});
		for (var w = 0; w < 7; w++) if (!used[w]) o.days.push({ id: uid("d"), dow: w, time: "", items: [] });
		o.here = o.days.some(function (d) { return d.id === p.here; }) ? p.here : o.days[0].id;
		(Array.isArray(p.lists) ? p.lists : []).slice(0, LIM.lists).forEach(function (l) {
			if (!l) return;
			var L = { id: idOk(l.id, "l"), name: str(l.name, 80) || "Training list", note: str(l.note, LIM.note), groups: [] };
			(Array.isArray(l.groups) ? l.groups : []).slice(0, LIM.groups).forEach(function (g) {
				if (!g) return;
				var G = { id: idOk(g.id, "g"), title: str(g.title, 80), mode: g.mode === "one" ? "one" : "all", here: "", items: (Array.isArray(g.items) ? g.items : []).slice(0, LIM.gitems).map(function (x) { return cleanItem(x, o.cats); }) };
				G.here = G.items.some(function (x) { return x.id === g.here; }) ? g.here : (G.mode === "one" && G.items[0] ? G.items[0].id : "");
				L.groups.push(G);
			});
			if (!L.groups.length) L.groups.push({ id: uid("g"), title: "", mode: "all", here: "", items: [] });
			o.lists.push(L);
		});
		(Array.isArray(p.log) ? p.log : []).forEach(function (e) {
			if (!e || !okDate(e.d)) return;
			o.log.push({ d: e.d, n: str(e.n) || "Workout", c: str(e.c, 24), m: num(e.m, 1440), k: str(e.k, 24) || "w" });
		});
		o.log.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
		if (o.log.length > LIM.log) o.log = o.log.slice(-LIM.log);
		// ids must be unique over the whole plan (moves look items up by id)
		var ids = {};
		function uniq(x, pfx) { if (ids[x.id]) x.id = uid(pfx); ids[x.id] = 1; }
		o.days.forEach(function (d) { uniq(d, "d"); d.items.forEach(function (x) { uniq(x, "i"); }); });
		o.lists.forEach(function (l) { uniq(l, "l"); l.groups.forEach(function (g) { var h = g.here; uniq(g, "g"); g.items.forEach(function (x) { var old = x.id; uniq(x, "i"); if (h === old && x.id !== old) g.here = x.id; }); }); });
		return o;
	}
	function defaultCats() { return [{ id: "cardio", name: "Cardio", color: "#e11d48" }, { id: "work", name: "Workouts", color: "#2563eb" }]; }

	/* ---------- templates ---------- */
	function week(cats, rows, here, note, title) {   // rows: [dow, time, [[name, cat, {sets, reps, dur}], ...]]
		return normalize({ title: title, note: note, cats: cats, days: rows.map(function (r) { return { id: "d" + r[0], dow: r[0], time: r[1], items: r[2].map(function (a) { return item(a[0], a[1], a[2]); }) }; }), here: here });
	}
	var STR = [{ id: "cardio", name: "Cardio", color: "#e11d48" }, { id: "work", name: "Strength", color: "#2563eb" }];
	var TEMPLATES = {
		mes: { name: "MES default routine", make: function () {
			var p = week(defaultCats(), [
				[0, "16:00", [["Running", "cardio"]]], [1, "16:00", [["Kickboxing", "work"]]], [2, "16:00", [["Handstands", "work"]]],
				[3, "16:00", [["Running", "cardio"]]], [4, "16:00", [["Aiming Training", "cardio"]]], [5, "16:00", [["Garage", "work"]]], [6, "16:00", [["Abs", "work"]]]
			], "d4", "Pre-workout routine as needed.", "MES Current Default Workout Routine");
			var top = { id: "gmon", title: "Monday Workouts", mode: "all", items: [item("Soccer Deaks", "", { done: "2026-10-22" }), item("Soccer Jugglin'", "")] };
			var rot = ["Soccer Aiming (3 Targets)", "Basketball Aiming (3 Targets)", "Mattress Soccer Kicking", "Chair Ball Lifts", "Chair Ball Deaks and shots", "Chair dribbling", "Basketball Dunks"].map(function (n) { return item(n, ""); });
			p.lists = normalize({ cats: p.cats, lists: [{ id: "lsoc", name: "Soccer / Basketball Training List", note: "Juggle: do at the end or the beginning when practical.",
				groups: [top, { id: "grot", title: "Do one after finishing above", mode: "one", here: rot[rot.length - 1].id, items: rot }] }] }).lists;
			return p;
		} },
		beginner: { name: "Beginner full body (3 days)", make: function () {
			function fb() { return [["Goblet squat", "work", { sets: 3, reps: "10" }], ["Push-ups (knees OK)", "work", { sets: 3, reps: "8-12" }], ["Dumbbell row", "work", { sets: 3, reps: "10" }], ["Glute bridge", "work", { sets: 3, reps: "12" }], ["Plank", "work", { sets: 3, reps: "30 s" }]]; }
			function walk() { return [["Brisk walk", "cardio", { dur: 30 }]]; }
			return week(STR, [[0, "", []], [1, "18:00", fb()], [2, "18:00", walk()], [3, "18:00", fb()], [4, "18:00", walk()], [5, "18:00", fb()], [6, "10:00", [["Easy bike or swim", "cardio", { dur: 30 }]]]],
				"d1", "Warm up 5-10 minutes first. Add a little weight or a few reps when every set feels easy.", "Beginner Full Body");
		} },
		ppl: { name: "Push / Pull / Legs (6 days)", make: function () {
			var push = [["Bench press", "work", { sets: 4, reps: "6-8" }], ["Overhead press", "work", { sets: 3, reps: "8-10" }], ["Incline dumbbell press", "work", { sets: 3, reps: "10" }], ["Lateral raise", "work", { sets: 3, reps: "15" }], ["Triceps pushdown", "work", { sets: 3, reps: "12" }]];
			var pull = [["Deadlift", "work", { sets: 3, reps: "5" }], ["Pull-ups", "work", { sets: 3, reps: "6-10" }], ["Barbell row", "work", { sets: 3, reps: "8-10" }], ["Face pull", "work", { sets: 3, reps: "15" }], ["Biceps curl", "work", { sets: 3, reps: "12" }]];
			var legs = [["Back squat", "work", { sets: 4, reps: "6-8" }], ["Romanian deadlift", "work", { sets: 3, reps: "8-10" }], ["Leg press", "work", { sets: 3, reps: "10-12" }], ["Calf raise", "work", { sets: 3, reps: "15" }]];
			function cp(a) { return a.map(function (x) { return [x[0], x[1], x[2]]; }); }
			return week(STR, [[0, "", [["Easy walk", "cardio", { dur: 30 }]]], [1, "17:00", cp(push)], [2, "17:00", cp(pull)], [3, "17:00", cp(legs)], [4, "17:00", cp(push)], [5, "17:00", cp(pull)], [6, "10:00", cp(legs)]],
				"d1", "Sunday is a rest day. Keep 1-2 reps in reserve on most sets.", "Push / Pull / Legs");
		} },
		fivex5: { name: "5×5 strength (A / B)", make: function () {
			var A = [["Squat", "work", { sets: 5, reps: "5" }], ["Bench press", "work", { sets: 5, reps: "5" }], ["Barbell row", "work", { sets: 5, reps: "5" }]];
			var B = [["Squat", "work", { sets: 5, reps: "5" }], ["Overhead press", "work", { sets: 5, reps: "5" }], ["Deadlift", "work", { sets: 1, reps: "5" }]];
			return week(STR, [[1, "18:00", A], [3, "18:00", B], [5, "18:00", A.map(function (x) { return x; })], [0, "", []], [2, "", []], [4, "", []], [6, "", []]],
				"d1", "Alternate workout A (squat, bench, row) and B (squat, overhead press, deadlift), with a rest day between. Next week starts with B. Add a little weight each time you finish every set.", "5×5 Strength");
		} },
		run: { name: "Start running (3 days)", make: function () {
			return week(STR, [[0, "", []], [1, "07:00", [["Run/walk: 8 × (1 min run, 1.5 min walk)", "cardio", { dur: 30 }]]], [2, "", [["Body-weight strength", "work", { dur: 20 }]]], [3, "07:00", [["Run/walk: 8 × (1 min run, 1.5 min walk)", "cardio", { dur: 30 }]]], [4, "", []],
				[5, "07:00", [["Run/walk: 8 × (1 min run, 1.5 min walk)", "cardio", { dur: 30 }]]], [6, "", [["Stretch and mobility", "work", { dur: 15 }]]]],
				"d1", "Start and finish each run with a 5-minute brisk walk. Each week, run a little longer and walk a little less.", "Start Running");
		} },
		empty: { name: "Empty week", make: function () { return week(defaultCats(), [0, 1, 2, 3, 4, 5, 6].map(function (d) { return [d, "", []]; }), "d0", "", "My Workout Routine"); } }
	};
	function template(key) { var t = TEMPLATES[key] || TEMPLATES.mes; return normalize(t.make()); }

	/* ---------- lookups and moves ---------- */
	function findItem(p, id) {   // -> {arr, idx, item, where: {kind:"c", day, cat} | {kind:"g", list, grp}}
		for (var i = 0; i < p.days.length; i++) { var d = p.days[i]; for (var j = 0; j < d.items.length; j++) if (d.items[j].id === id) return { arr: d.items, idx: j, item: d.items[j], where: { kind: "c", day: d.id, cat: d.items[j].cat } }; }
		for (var a = 0; a < p.lists.length; a++) for (var b = 0; b < p.lists[a].groups.length; b++) { var g = p.lists[a].groups[b]; for (var k = 0; k < g.items.length; k++) if (g.items[k].id === id) return { arr: g.items, idx: k, item: g.items[k], where: { kind: "g", list: p.lists[a].id, grp: g.id } }; }
		return null;
	}
	function dayById(p, id) { for (var i = 0; i < p.days.length; i++) if (p.days[i].id === id) return p.days[i]; return null; }
	function grpById(p, lid, gid) { var l = listById(p, lid); if (!l) return null; for (var i = 0; i < l.groups.length; i++) if (l.groups[i].id === gid) return l.groups[i]; return null; }
	function listById(p, id) { for (var i = 0; i < p.lists.length; i++) if (p.lists[i].id === id) return p.lists[i]; return null; }
	function catById(p, id) { for (var i = 0; i < p.cats.length; i++) if (p.cats[i].id === id) return p.cats[i]; return null; }
	function cellItems(day, cat) { return day.items.filter(function (x) { return x.cat === cat; }); }

	/* dest = {kind:"c", day, cat} or {kind:"g", list, grp}; index = position among the destination's items (in a week cell: among
	 * that day's items of that category). copy = keep the original. Returns the moved (or new) item, or null. */
	function moveItem(p, id, dest, index, copy) {
		var f = findItem(p, id); if (!f) return null;
		var it = copy ? Object.assign({}, f.item, { id: uid("i") }) : f.item;
		var target;
		if (dest.kind === "c") { var d = dayById(p, dest.day); if (!d || !catById(p, dest.cat)) return null; target = d.items; it.cat = dest.cat; }
		else { var g = grpById(p, dest.list, dest.grp); if (!g) return null; target = g.items; }
		if (!copy) {
			f.arr.splice(f.idx, 1);
			if (f.where.kind === "g") fixHere(grpById(p, f.where.list, f.where.grp), id, f.idx, target === f.arr);
		}
		var pos;
		if (dest.kind === "c") {   // index counts only this category's items: turn it into a position in day.items
			var same = target.filter(function (x) { return x.cat === dest.cat; });
			index = Math.max(0, Math.min(index == null ? same.length : index, same.length));
			pos = index < same.length ? target.indexOf(same[index]) : (same.length ? target.indexOf(same[same.length - 1]) + 1 : target.length);
		} else pos = Math.max(0, Math.min(index == null ? target.length : index, target.length));
		target.splice(pos, 0, it);
		if (dest.kind === "g") { var G = grpById(p, dest.list, dest.grp); if (G.mode === "one" && !G.here) G.here = it.id; }
		return it;
	}
	function fixHere(g, removedId, idx, sameGroup) {   // an item left a group: keep its Here pointer on something sensible
		if (!g || g.here !== removedId || sameGroup) return;
		g.here = g.items.length ? g.items[Math.min(idx, g.items.length - 1)].id : "";
	}
	function removeItem(p, id) {
		var f = findItem(p, id); if (!f) return null;
		f.arr.splice(f.idx, 1);
		if (f.where.kind === "g") fixHere(grpById(p, f.where.list, f.where.grp), id, f.idx, false);
		return f.item;
	}
	function moveInArray(arr, from, to) { if (from < 0 || from >= arr.length) return arr; to = Math.max(0, Math.min(to, arr.length - 1)); var x = arr.splice(from, 1)[0]; arr.splice(to, 0, x); return arr; }
	function moveRow(p, from, to) { moveInArray(p.days, from, to); return p; }

	/* ---------- the "Currently at" pointers ---------- */
	function nextDay(p, skipEmpty) {   // the row after Here (in rotation order), skipping rest days unless every row is empty
		var i = Math.max(0, p.days.findIndex(function (d) { return d.id === p.here; }));
		for (var n = 1; n <= p.days.length; n++) { var d = p.days[(i + n) % p.days.length]; if (!skipEmpty || d.items.length) return d; }
		return p.days[(i + 1) % p.days.length];
	}
	function advance(p, skipEmpty) { p.here = nextDay(p, skipEmpty).id; return p.here; }
	function groupNext(g) { if (!g.items.length) return ""; var i = g.items.findIndex(function (x) { return x.id === g.here; }); return g.items[(i + 1) % g.items.length].id; }
	function todayRow(p, today) { var w = dowOf(today); return p.days.find(function (d) { return d.dow === w; }) || null; }

	/* ---------- log, streaks, summaries ---------- */
	function logItems(p, items, date, k) {
		date = okDate(date) || dateKey();
		items.forEach(function (it) { p.log.push({ d: date, n: str(it.name), c: it.cat || "", m: it.dur || 0, k: k || "w" }); });
		p.log.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
		if (p.log.length > LIM.log) p.log = p.log.slice(-LIM.log);
	}
	function byDate(log) { var m = {}; log.forEach(function (e) { (m[e.d] = m[e.d] || []).push(e); }); return m; }
	function streaks(log, today) {   // current streak counts back from today (or yesterday when today has nothing yet)
		var m = byDate(log), cur = 0, d = m[today] ? today : addDays(today, -1);
		while (m[d]) { cur++; d = addDays(d, -1); }
		var days = Object.keys(m).sort(), best = 0, run = 0, prev = "";
		days.forEach(function (k) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; if (run > best) best = run; prev = k; });
		return { current: cur, best: best, activeDays: days.length, total: log.length };
	}
	function weekStreak(log, today, min, startDow) {   // weeks in a row (ending this week, or last week if this one is not done yet) with >= min active days
		var m = byDate(log), ws = weekStart(today, startDow), n = 0;
		function active(s) { var c = 0; for (var i = 0; i < 7; i++) if (m[addDays(s, i)]) c++; return c; }
		if (active(ws) < min) ws = addDays(ws, -7);
		while (active(ws) >= min && n < 600) { n++; ws = addDays(ws, -7); }
		return n;
	}
	function heat(log, today, weeks, startDow) {   // [{d, n}] oldest first, whole weeks, ending with today's week
		var m = byDate(log), end = addDays(weekStart(today, startDow), 6), start = addDays(end, -(weeks * 7) + 1), out = [];
		for (var d = start; d <= end; d = addDays(d, 1)) out.push({ d: d, n: m[d] ? m[d].length : 0, future: d > today });
		return out;
	}
	function weekSummary(p, today, startDow) {   // planned vs done per category this week
		var ws = weekStart(today, startDow), we = addDays(ws, 6);
		var rows = p.cats.map(function (c) {
			var planned = 0, pmin = 0;
			p.days.forEach(function (d) { d.items.forEach(function (x) { if (x.cat === c.id) { planned++; pmin += x.dur || 0; } }); });
			var done = 0, min = 0;
			p.log.forEach(function (e) { if (e.d >= ws && e.d <= we && e.c === c.id) { done++; min += e.m || 0; } });
			return { id: c.id, name: c.name, color: c.color, planned: planned, done: done, minutes: min, plannedMin: pmin };
		});
		var other = p.log.filter(function (e) { return e.d >= ws && e.d <= we && !catById(p, e.c); });
		var days = {}; p.log.forEach(function (e) { if (e.d >= ws && e.d <= we) days[e.d] = 1; });
		return { start: ws, end: we, rows: rows, other: other.length, otherMin: other.reduce(function (s, e) { return s + (e.m || 0); }, 0),
			activeDays: Object.keys(days).length, plannedDays: p.days.filter(function (d) { return d.items.length; }).length };
	}

	/* ---------- export ---------- */
	function itemText(it) { var m = meta(it); return it.name + (m ? " (" + m + ")" : ""); }
	function grid(p, h24) {   // the week as rows of cells: header + one row per day (rotation order) + note
		var head = ["Day", "Time"].concat(p.cats.map(function (c) { return c.name; })).concat(["Currently At"]);
		var rows = p.days.map(function (d) {
			return [DOW[d.dow], fmtTime(d.time, h24)].concat(p.cats.map(function (c) { return cellItems(d, c.id).map(itemText).join("; "); })).concat([d.id === p.here ? "Here" : ""]);
		});
		return [head].concat(rows);
	}
	function listGrid(p, today) {
		var out = [];
		p.lists.forEach(function (l) {
			out.push([l.name]);
			l.groups.forEach(function (g) {
				out.push([(g.title || (g.mode === "one" ? "Do one" : "Do all")) + (g.mode === "one" ? " (do one, in turn)" : "")]);
				g.items.forEach(function (x) { out.push(["", itemText(x), x.done ? "Done " + shortDate(x.done, today) : "", g.mode === "one" && g.here === x.id ? "Here" : ""]); });
			});
			if (l.note) out.push([l.note]);
			out.push([]);
		});
		return out;
	}
	function csvCell(s) { s = String(s == null ? "" : s); return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
	function toCSV(rows) { return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n"); }
	function toTSV(rows) { return rows.map(function (r) { return r.map(function (s) { s = String(s == null ? "" : s); return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join("\t"); }).join("\n"); }
	function planCSV(p, today) {
		var rows = grid(p);
		if (p.note) rows.push([]), rows.push([p.note]);
		if (p.lists.length) rows.push([]), rows = rows.concat(listGrid(p, today));
		return toCSV(rows);
	}

	/* ---------- import: a table pasted from Excel / Google Sheets, or a CSV file ---------- */
	function parseDelimited(text) {
		text = String(text || "").replace(/\r\n?/g, "\n");
		var first = text.split("\n").slice(0, 5).join("\n");
		var del = first.indexOf("\t") >= 0 ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
		var rows = [], row = [], cell = "", q = false;
		for (var i = 0; i < text.length; i++) {
			var ch = text[i];
			if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
			else if (ch === '"' && cell === "") q = true;
			else if (ch === del) { row.push(cell); cell = ""; }
			else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
			else cell += ch;
		}
		if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
		return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
	}
	function dowFromText(s) {
		s = String(s || "").trim().toLowerCase();
		for (var i = 0; i < 7; i++) if (s === DOW[i].toLowerCase() || s === DOW3[i].toLowerCase() || (s.length >= 2 && DOW[i].toLowerCase().indexOf(s) === 0 && s !== "t" && s !== "s")) return i;
		if (/^tues?$/.test(s)) return 2; if (/^thur?s?$/.test(s)) return 4;
		return -1;
	}
	function splitItems(s) { return String(s || "").split(/\s*(?:\n|;|•)\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }
	function parseItemText(s) {   // "Squat (5×5 · 20 min)" / "Squat 3x10" / "Run 30 min" -> item fields
		var o = { name: s, sets: 0, reps: "", dur: 0 };
		var m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(s), meta = "";
		if (m && /\d/.test(m[2]) && /(×|x|min|sets?|reps?)/i.test(m[2])) { o.name = m[1]; meta = m[2]; }
		else { m = /^(.*\S)\s+(\d+\s*[x×]\s*[\d-]+(?:\s*s)?)$/i.exec(s); if (m) { o.name = m[1]; meta = m[2]; } }
		meta.split(/·|,/).forEach(function (t) {
			t = t.trim(); var a;
			if ((a = /^(\d+)\s*[x×]\s*(.+)$/i.exec(t))) { o.sets = +a[1]; o.reps = a[2].trim(); }
			else if ((a = /^(\d+(?:\.\d+)?)\s*min/i.exec(t))) o.dur = +a[1];
			else if ((a = /^(\d+)\s*sets?$/i.exec(t))) o.sets = +a[1];
			else if ((a = /^(.+?)\s*reps?$/i.exec(t))) o.reps = a[1];
		});
		return o;
	}
	/* -> {plan, notes[]} or {error}. Header row: a cell "Day" (any case); "Time"; "Currently at" / "Here" / "Current"; every other
	 * column is a category. Without a header the columns are taken as Day | Time | Cardio | Workouts | Currently At. */
	function parseTable(text, base) {
		var rows = parseDelimited(text).filter(function (r) { return r.some(Boolean); });
		if (!rows.length) return { error: "Nothing to import: paste a table first." };
		var hi = rows.findIndex(function (r) { return r.some(function (c) { return /^day$/i.test(c); }); }), head;
		var notes = [];
		if (hi < 0) { head = ["Day", "Time", "Cardio", "Workouts", "Currently At"]; notes.push("No header row found, so the columns were read as Day | Time | Cardio | Workouts | Currently At."); hi = -1; }
		else head = rows[hi];
		var col = { day: -1, time: -1, here: -1, cats: [] };
		head.forEach(function (h, i) {
			var t = h.toLowerCase().trim();
			if (t === "day" && col.day < 0) col.day = i;
			else if (/^time/.test(t) && col.time < 0) col.time = i;
			else if (/curr|^here$|^now$|^pointer/.test(t) && col.here < 0) col.here = i;
			else if (t) col.cats.push({ i: i, name: h.trim() });
		});
		if (col.day < 0) return { error: "Could not find a Day column." };
		base = base ? normalize(base) : null;
		var cats = col.cats.map(function (c, k) {
			var old = base && base.cats.find(function (x) { return x.name.toLowerCase() === c.name.toLowerCase(); });
			return { id: old ? old.id : (/cardio/i.test(c.name) ? "cardio" : /work|strength|lift/i.test(c.name) ? "work" : "c" + k), name: c.name, color: old ? old.color : (/cardio/i.test(c.name) ? "#e11d48" : PALETTE[(k + 1) % PALETTE.length]) };
		});
		if (!cats.length) cats = defaultCats();
		var days = [], here = "", extra = [];
		rows.slice(hi + 1).forEach(function (r) {
			var w = dowFromText(r[col.day]);
			if (w < 0) { var txt = r.filter(Boolean).join(" "); if (txt) extra.push(txt); return; }
			if (days.some(function (d) { return d.dow === w; })) { notes.push(DOW[w] + " appears twice: the second row was skipped."); return; }
			var d = { id: "d" + w, dow: w, time: col.time >= 0 ? parseTime(r[col.time]) : "", items: [] };
			if (col.time >= 0 && r[col.time] && !d.time) notes.push("Could not read the time \"" + r[col.time] + "\" on " + DOW[w] + ".");
			cats.forEach(function (c, k) { splitItems(r[col.cats[k] ? col.cats[k].i : -1]).forEach(function (s) { var o = parseItemText(s); d.items.push(item(o.name, c.id, o)); }); });
			if (col.here >= 0 && r[col.here]) here = d.id;
			days.push(d);
		});
		if (!days.length) return { error: "No rows with a day name (Sunday ... Saturday) were found." };
		var plan = normalize({ title: base ? base.title : "", cats: cats, days: days, here: here || days[0].id, note: extra.join("\n"), lists: base ? base.lists : [], log: base ? base.log : [] });
		if (extra.length) notes.push("Lines that are not days were kept as the note: " + extra.join(" / "));
		return { plan: plan, notes: notes };
	}

	/* ---------- share links (no server): base64url of the plan without the log ---------- */
	function b64e(s) {
		var b = typeof Buffer !== "undefined" ? Buffer.from(s, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(s)));
		return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}
	function b64d(s) {
		s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
		return typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s)));
	}
	function compact(p) {   // short keys, no defaults: keeps links short
		function ci(x) { var o = [x.name, x.cat || ""]; if (x.sets || x.reps || x.dur || x.note || x.done) o.push(x.sets || 0, x.reps || "", x.dur || 0, x.note || "", x.done || ""); return o; }
		var hereIdx = p.days.findIndex(function (d) { return d.id === p.here; });
		return { t: p.title, n: p.note, c: p.cats.map(function (c) { return [c.id, c.name, c.color]; }), d: p.days.map(function (d) { return [d.dow, d.time, d.items.map(ci)]; }), h: hereIdx,
			l: p.lists.map(function (l) { return [l.name, l.note, l.groups.map(function (g) { return [g.title, g.mode === "one" ? 1 : 0, Math.max(0, g.items.findIndex(function (x) { return x.id === g.here; })), g.items.map(ci)]; })]; }) };
	}
	function expand(o) {
		function ix(a) { return { name: a[0], cat: a[1], sets: a[2], reps: a[3], dur: a[4], note: a[5], done: a[6] }; }
		var days = (o.d || []).map(function (d, i) { return { id: "d" + i, dow: d[0], time: d[1], items: (d[2] || []).map(ix) }; });
		var lists = (o.l || []).map(function (l) {
			return { name: l[0], note: l[1], groups: (l[2] || []).map(function (g) { var items = (g[3] || []).map(ix).map(function (x) { x.id = uid("i"); return x; }); return { title: g[0], mode: g[1] ? "one" : "all", here: items[g[2]] ? items[g[2]].id : "", items: items }; }) };
		});
		return normalize({ title: o.t, note: o.n, cats: (o.c || []).map(function (c) { return { id: c[0], name: c[1], color: c[2] }; }), days: days, here: days[o.h] ? days[o.h].id : "", lists: lists });
	}
	function encodeShare(p) { return "1" + b64e(JSON.stringify(compact(p))); }
	function decodeShare(s) {
		try { if (!s || s[0] !== "1" || s.length > 60000) return null; return expand(JSON.parse(b64d(s.slice(1)))); } catch (e) { return null; }
	}
	function sameDays(a, b) { return JSON.stringify(compact(a)) === JSON.stringify(compact(b)); }

	var API = { DOW: DOW, DOW3: DOW3, PALETTE: PALETTE, MONTHS: MONTHS, LIM: LIM, TEMPLATES: TEMPLATES,
		uid: uid, str: str, okColor: okColor, okDate: okDate, okTime: okTime, dateKey: dateKey, parseKey: parseKey, addDays: addDays, dowOf: dowOf, shortDate: shortDate, weekStart: weekStart,
		fmtTime: fmtTime, parseTime: parseTime, item: item, cleanItem: cleanItem, meta: meta, normalize: normalize, template: template, defaultCats: defaultCats,
		findItem: findItem, dayById: dayById, grpById: grpById, listById: listById, catById: catById, cellItems: cellItems, moveItem: moveItem, removeItem: removeItem, moveInArray: moveInArray, moveRow: moveRow,
		nextDay: nextDay, advance: advance, groupNext: groupNext, todayRow: todayRow, logItems: logItems, byDate: byDate, streaks: streaks, weekStreak: weekStreak, heat: heat, weekSummary: weekSummary,
		itemText: itemText, grid: grid, listGrid: listGrid, toCSV: toCSV, toTSV: toTSV, planCSV: planCSV, parseDelimited: parseDelimited, dowFromText: dowFromText, parseItemText: parseItemText, parseTable: parseTable,
		encodeShare: encodeShare, decodeShare: decodeShare, sameDays: sameDays, b64e: b64e, b64d: b64d };
	if (typeof module !== "undefined" && module.exports) module.exports = API;
	root.MESWP = API;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Workout Planner -- mes.fm/workout-planner (UI; logic in lib.js = MESWP).
 * Plan + history in localStorage "mes-workout-planner:v1"; view settings in "mes-workout-planner:ui".
 * Drag and drop = pointer events (mouse: after 4 px; touch: press and hold 300 ms on an activity, at once on a ⠿ grip),
 * drop targets carry data-drop="c|<day>|<cat>" (a week cell) or "g|<list>|<group>" (a list group); Alt while dropping copies.
 * Share links: ?p=<MESWP.encodeShare> (no history). Fill window / Full screen: /main_js/panel-view.js (MESPanel).
 */
(function () {
	"use strict";
	var W = window.MESWP, root = document.getElementById("wp");
	if (!W || !root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-workout-planner:v1", UKEY = "mes-workout-planner:ui";
	var H24 = (function () { try { return !new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12; } catch (e) { return false; } })();
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function today() { return W.dateKey(new Date()); }
	function toast(msg, undo) {
		var t = $("wp-toast");
		if (!t) { t = document.createElement("div"); t.id = "wp-toast"; t.className = "tu-toast wp-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
		t.innerHTML = esc(msg) + (undo ? ' <button type="button" class="wp-toastundo">Undo</button>' : "");
		t.classList.add("tu-toast--show");
		var b = t.querySelector(".wp-toastundo"); if (b) b.onclick = function () { doUndo(); t.classList.remove("tu-toast--show"); };
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, undo ? 6000 : 2600);
	}

	/* ---------- state, saving, undo ---------- */
	var P, U = { orient: "rows", lay: "auto", skip: true, weeks: 26, ws: 0 }, UNDO = [];
	function load() {
		try { var s = localStorage.getItem(KEY); if (s) P = W.normalize(JSON.parse(s)); } catch (e) {}
		if (!P) P = W.template("mes");
		try { var u = JSON.parse(localStorage.getItem(UKEY) || "null"); if (u) { if (/^(rows|cols)$/.test(u.orient)) U.orient = u.orient; if (/^(auto|table|cards)$/.test(u.lay)) U.lay = u.lay; if (typeof u.skip === "boolean") U.skip = u.skip; if ([13, 26, 52].indexOf(u.weeks) >= 0) U.weeks = u.weeks; if (u.ws === 1) U.ws = 1; } } catch (e) {}
	}
	var hadData = false; try { hadData = !!localStorage.getItem(KEY); } catch (e) {}
	load();
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(P)); $("wp-saved").textContent = "Saved in this browser"; } catch (e) { $("wp-saved").textContent = "Could not save (storage full or blocked)"; }
	}
	function saveUI() { try { localStorage.setItem(UKEY, JSON.stringify(U)); } catch (e) {} }
	function snap() { UNDO.push(JSON.stringify(P)); if (UNDO.length > 60) UNDO.shift(); $("wp-undo").disabled = false; }
	function change(fn, keepFocus) { snap(); fn(); save(); render(keepFocus); }
	function doUndo() {
		if (!UNDO.length) return;
		P = W.normalize(JSON.parse(UNDO.pop())); save(); render(); $("wp-undo").disabled = !UNDO.length; toast("Undone");
	}
	window.addEventListener("storage", function (e) { if (e.key === KEY && e.newValue) { try { P = W.normalize(JSON.parse(e.newValue)); render(); } catch (x) {} } });

	/* ---------- shared bits ---------- */
	function catColor(id) { var c = W.catById(P, id); return c ? c.color : "#8a94a3"; }
	function chip(it, opt) {
		opt = opt || {};
		var m = W.meta(it), cls = "wp-chip" + (opt.row ? " wp-chip--row" : "") + (opt.here ? " is-here" : "") + (it.done && opt.row ? " is-done" : "");
		var lab = it.name + (m ? ", " + m : "") + (it.note ? ", " + it.note : "");
		var h = '<div class="' + cls + '" data-item="' + it.id + '" tabindex="0" role="button" aria-label="' + esc(lab) + '" style="--c:' + catColor(it.cat) + '">';
		if (opt.check) h += '<input type="checkbox" class="wp-done" data-done="' + it.id + '"' + (it.done ? " checked" : "") + ' aria-label="Done: ' + esc(it.name) + '">';
		h += '<span class="wp-cn">' + esc(it.name) + '</span>';
		if (m) h += '<span class="wp-cm">' + esc(m) + '</span>';
		if (it.note) h += '<span class="wp-cnote" title="' + esc(it.note) + '">✎</span>';
		if (opt.row && it.done) h += '<span class="wp-stamp">Done ' + esc(W.shortDate(it.done, today())) + '</span>';
		if (opt.rot) h += opt.here ? '<span class="wp-herepill">📍 Here</span>' : '<button type="button" class="wp-sethere" data-gh="' + it.id + '" aria-label="Mark ' + esc(it.name) + ' as Here">Set here</button>';
		return h + "</div>";
	}
	function cell(d, c) {
		return '<div class="wp-cell" data-drop="c|' + d.id + "|" + c.id + '" data-axis="x" style="--c:' + c.color + '">' + W.cellItems(d, c.id).map(function (x) { return chip(x); }).join("") +
			'<button type="button" class="wp-add" data-add="c|' + d.id + "|" + c.id + '" aria-label="Add ' + esc(c.name) + " on " + W.DOW[d.dow] + '">+</button></div>';
	}
	function timeBox(d) { return '<input type="text" class="wp-time" data-time="' + d.id + '" value="' + esc(W.fmtTime(d.time, H24)) + '" placeholder="time" aria-label="Time on ' + W.DOW[d.dow] + '" autocomplete="off" maxlength="9">'; }
	function hereBtn(d) {
		var on = d.id === P.here;
		return '<button type="button" class="wp-here' + (on ? " is-on" : "") + '" data-here="' + d.id + '" aria-pressed="' + on + '" title="' + (on ? "You are here in the rotation" : "Move the Currently at marker here") + '">' + (on ? "📍 Here" : "Set here") + "</button>";
	}
	function dayLabel(d, td) { return '<span class="wp-dname">' + W.DOW[d.dow] + "</span>" + (d.dow === td ? '<span class="wp-today">Today</span>' : ""); }
	function grip(d) { return '<button type="button" class="wp-grip" data-grip="' + d.id + '" aria-label="Move ' + W.DOW[d.dow] + ' (arrow keys or drag)" title="Drag to reorder">⠿</button>'; }

	/* ---------- the week ---------- */
	var mq = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };
	function layout() { return U.lay === "auto" ? (mq.matches ? "cards" : "table") : U.lay; }
	function renderWeek() {
		var td = W.dowOf(today()), lay = layout(), h = "";
		if (lay === "cards") {
			h = '<div class="wp-cards">' + P.days.map(function (d) {
				return '<div class="wp-dcard' + (d.id === P.here ? " is-here" : "") + (d.dow === td ? " is-today" : "") + '" data-row="' + d.id + '"><div class="wp-dhead">' + grip(d) + dayLabel(d, td) + timeBox(d) + hereBtn(d) + "</div>" +
					P.cats.map(function (c) { return '<div class="wp-crow"><span class="wp-clab" style="--c:' + c.color + '">' + esc(c.name) + "</span>" + cell(d, c) + "</div>"; }).join("") + "</div>";
			}).join("") + "</div>";
		} else if (U.orient === "cols") {
			h = '<div class="wp-tablewrap"><table class="wp-table wp-table--cols"><thead><tr><th scope="col"><span class="wp-sr">Row</span></th>' + P.days.map(function (d) {
				return '<th scope="col" data-row="' + d.id + '" class="' + (d.id === P.here ? "is-here " : "") + (d.dow === td ? "is-today" : "") + '"><div class="wp-colhead">' + grip(d) + dayLabel(d, td) + "</div></th>";
			}).join("") + "</tr></thead><tbody>" +
				'<tr><th scope="row">Time</th>' + P.days.map(function (d) { return '<td class="' + (d.id === P.here ? "is-here" : "") + '">' + timeBox(d) + "</td>"; }).join("") + "</tr>" +
				P.cats.map(function (c) { return '<tr><th scope="row"><span class="wp-clab" style="--c:' + c.color + '">' + esc(c.name) + "</span></th>" + P.days.map(function (d) { return '<td class="' + (d.id === P.here ? "is-here" : "") + '">' + cell(d, c) + "</td>"; }).join("") + "</tr>"; }).join("") +
				'<tr><th scope="row">Currently at</th>' + P.days.map(function (d) { return '<td class="' + (d.id === P.here ? "is-here" : "") + '">' + hereBtn(d) + "</td>"; }).join("") + "</tr></tbody></table></div>";
		} else {
			h = '<div class="wp-tablewrap"><table class="wp-table"><thead><tr><th class="wp-gcol"><span class="wp-sr">Move</span></th><th scope="col">Day</th><th scope="col">Time</th>' +
				P.cats.map(function (c) { return '<th scope="col"><span class="wp-clab" style="--c:' + c.color + '">' + esc(c.name) + "</span></th>"; }).join("") + '<th scope="col" class="wp-hcol">Currently at</th></tr></thead><tbody>' +
				P.days.map(function (d) {
					return '<tr data-row="' + d.id + '" class="' + (d.id === P.here ? "is-here " : "") + (d.dow === td ? "is-today" : "") + '"><td class="wp-gcol">' + grip(d) + '</td><th scope="row">' + dayLabel(d, td) + "</th><td>" + timeBox(d) + "</td>" +
						P.cats.map(function (c) { return "<td>" + cell(d, c) + "</td>"; }).join("") + '<td class="wp-hcol">' + hereBtn(d) + "</td></tr>";
				}).join("") + "</tbody></table></div>";
		}
		$("wp-week").innerHTML = h;
		$("wp-week").setAttribute("data-lay", lay === "cards" ? "cards" : U.orient);
	}
	function renderCats() {
		$("wp-cats").innerHTML = '<span class="wp-catlab">Categories</span>' + P.cats.map(function (c) {
			return '<span class="wp-cat" style="--c:' + c.color + '"><input type="color" value="' + c.color + '" data-ccol="' + c.id + '" aria-label="Colour of ' + esc(c.name) + '"><input type="text" class="wp-cname" value="' + esc(c.name) + '" data-cname="' + c.id + '" maxlength="40" aria-label="Category name" size="' + Math.max(4, Math.min(16, c.name.length + 1)) + '">' +
				(P.cats.length > 1 ? '<button type="button" class="wp-x" data-cdel="' + c.id + '" aria-label="Delete category ' + esc(c.name) + '">✕</button>' : "") + "</span>";
		}).join("") + (P.cats.length < W.LIM.cats ? '<button type="button" class="tu-chip" id="wp-addcat">+ Category</button>' : "");
	}

	/* ---------- "Currently at" card ---------- */
	var nextDate = "";
	function renderNext() {
		var d = W.dayById(P, P.here), td = today(), trow = W.todayRow(P, td), nx = W.nextDay(P, U.skip);
		var h = '<div class="wp-nexthead"><span class="wp-pin">📍 Currently at</span> <b class="wp-nday">' + W.DOW[d.dow] + "</b>" + (d.time ? ' <span class="wp-ntime">' + esc(W.fmtTime(d.time, H24)) + "</span>" : "") +
			'<span class="wp-nnav"><button type="button" class="tu-btn tu-btn--ghost" id="wp-nprev" aria-label="Move the marker back one day">←</button><button type="button" class="tu-btn tu-btn--ghost" id="wp-nskip">Skip →</button></span></div>';
		if (d.items.length) {
			h += '<ul class="wp-nlist">' + d.items.map(function (x) {
				var m = W.meta(x), c = W.catById(P, x.cat);
				return '<li style="--c:' + catColor(x.cat) + '"><label><input type="checkbox" checked data-nchk="' + x.id + '"> <span class="wp-ndot"></span><b>' + esc(x.name) + "</b>" + (m ? ' <span class="wp-cm">' + esc(m) + "</span>" : "") + (c ? ' <span class="wp-ncat">' + esc(c.name) + "</span>" : "") + (x.note ? ' <span class="wp-nnote">' + esc(x.note) + "</span>" : "") + "</label></li>";
			}).join("") + "</ul>";
		} else h += '<p class="wp-rest">Nothing planned: a rest day.</p>';
		h += '<div class="wp-nact"><button type="button" class="tu-btn tu-btn--primary wp-big" id="wp-ndone">✓ Done, move to ' + W.DOW[nx.dow] + '</button><label class="wp-ndate">on <input type="date" id="wp-ndate" class="tu-input" value="' + (nextDate || td) + '" max="' + td + '"></label></div>';
		if (P.note) h += '<p class="wp-pnote">' + esc(P.note) + "</p>";
		var after = '<p class="tu-note wp-after">Then: <b>' + W.DOW[nx.dow] + "</b>" + (nx.items.length ? " · " + esc(nx.items.map(function (x) { return x.name; }).join(", ")) : " · rest") + ".";
		if (trow && trow.id !== d.id) after += ' Today is ' + W.DOW[trow.dow] + (trow.items.length ? " (" + esc(trow.items.map(function (x) { return x.name; }).join(", ")) + ")" : "") + '. <button type="button" class="wp-link" id="wp-ntoday">Move the marker to today</button>';
		h += after + "</p>";
		var rot = [];
		P.lists.forEach(function (l) { l.groups.forEach(function (g) {
			if (g.mode === "one" && g.here) { var f = W.findItem(P, g.here); if (f) rot.push('<li><span class="wp-lname2">' + esc(l.name) + (g.title ? " › " + esc(g.title) : "") + ':</span> <b>' + esc(f.item.name) + '</b> <button type="button" class="tu-btn wp-sm" data-gdone="' + l.id + "|" + g.id + '">✓ Done, next</button></li>'); }
			else if (g.mode === "all") { var left = g.items.filter(function (x) { return !x.done; }); if (left.length) rot.push('<li><span class="wp-lname2">' + esc(l.name) + (g.title ? " › " + esc(g.title) : "") + ':</span> ' + left.length + " left (next: <b>" + esc(left[0].name) + "</b>)</li>"); }
		}); });
		if (rot.length) h += '<div class="wp-nrot"><b>From your lists</b><ul>' + rot.join("") + "</ul></div>";
		$("wp-next").innerHTML = h;
	}

	/* ---------- training lists ---------- */
	function renderLists() {
		if (!P.lists.length) { $("wp-lists").innerHTML = '<p class="wp-empty">No lists yet. A list is good for skills you rotate through, like drills or practice targets.</p>'; return; }
		$("wp-lists").innerHTML = P.lists.map(function (l, li) {
			return '<div class="wp-list" data-list="' + l.id + '"><div class="wp-lhead"><input type="text" class="wp-lname" data-lname="' + l.id + '" value="' + esc(l.name) + '" maxlength="80" aria-label="List name">' +
				'<span class="wp-lbtns"><button type="button" class="wp-ib" data-lmove="' + l.id + '|-1"' + (li ? "" : " disabled") + ' aria-label="Move list up">↑</button><button type="button" class="wp-ib" data-lmove="' + l.id + '|1"' + (li < P.lists.length - 1 ? "" : " disabled") + ' aria-label="Move list down">↓</button><button type="button" class="wp-ib wp-danger" data-ldel="' + l.id + '" aria-label="Delete list">🗑</button></span></div>' +
				l.groups.map(function (g, gi) {
					var one = g.mode === "one";
					return '<div class="wp-grp' + (one ? " wp-grp--one" : "") + '"><div class="wp-ghead"><input type="text" class="wp-gtitle" data-gtitle="' + l.id + "|" + g.id + '" value="' + esc(g.title) + '" maxlength="80" placeholder="' + (one ? "Do one after finishing above" : "Group name, e.g. Monday Workouts") + '" aria-label="Group name">' +
						'<select class="wp-gmode" data-gmode="' + l.id + "|" + g.id + '" aria-label="How this group works"><option value="all"' + (one ? "" : " selected") + '>Do all (checklist)</option><option value="one"' + (one ? " selected" : "") + '>Do one, in turn</option></select>' +
						'<span class="wp-lbtns"><button type="button" class="wp-ib" data-gmove="' + l.id + "|" + g.id + '|-1"' + (gi ? "" : " disabled") + ' aria-label="Move group up">↑</button><button type="button" class="wp-ib" data-gmove="' + l.id + "|" + g.id + '|1"' + (gi < l.groups.length - 1 ? "" : " disabled") + ' aria-label="Move group down">↓</button>' +
						(one ? "" : '<button type="button" class="wp-ib" data-greset="' + l.id + "|" + g.id + '" title="Clear every done date" aria-label="Start this checklist again">↺</button>') +
						(l.groups.length > 1 ? '<button type="button" class="wp-ib wp-danger" data-gdel="' + l.id + "|" + g.id + '" aria-label="Delete group">🗑</button>' : "") + "</span></div>" +
						'<div class="wp-gitems" data-drop="g|' + l.id + "|" + g.id + '" data-axis="y">' + g.items.map(function (x) { return chip(x, { row: true, check: !one, rot: one, here: one && g.here === x.id }); }).join("") +
						'<button type="button" class="wp-add wp-add--row" data-add="g|' + l.id + "|" + g.id + '">+ Add</button></div>' +
						(one && g.here ? '<div class="wp-gfoot"><button type="button" class="tu-btn tu-btn--primary wp-sm" data-gdone="' + l.id + "|" + g.id + '">✓ Done, next one</button></div>' : "") + "</div>";
				}).join("") +
				'<div class="wp-lfoot"><button type="button" class="tu-chip" data-gadd="' + l.id + '">+ Group</button></div>' +
				'<textarea class="wp-lnote" data-lnote="' + l.id + '" rows="1" maxlength="600" placeholder="Note, e.g. Juggle: do at the end or the beginning when practical" aria-label="Note for this list">' + esc(l.note) + "</textarea></div>";
		}).join("");
	}

	/* ---------- history ---------- */
	var selDay = "";
	function renderHist() {
		var td = today(), st = W.streaks(P.log, td), wk = W.weekSummary(P, td, U.ws), wst = W.weekStreak(P.log, td, 1, U.ws);
		function tile(lab, val, sub, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + lab + '</div><div class="tu-stat__value">' + val + '</div><div class="tu-stat__sub">' + sub + "</div></div>"; }
		$("wp-stats").innerHTML = tile("Current streak", st.current + (st.current === 1 ? " day" : " days"), "Days in a row with something logged", true) +
			tile("Best streak", st.best + (st.best === 1 ? " day" : " days"), st.activeDays + (st.activeDays === 1 ? " active day" : " active days") + " in all") +
			tile("Weeks in a row", wst, "Weeks with at least one workout") +
			tile("This week", wk.activeDays + " of " + wk.plannedDays, "Active days vs. days planned");
		var maxv = 1; wk.rows.forEach(function (r) { maxv = Math.max(maxv, r.planned, r.done); });
		var mins = wk.rows.reduce(function (s, r) { return s + r.minutes; }, 0) + wk.otherMin;
		$("wp-sum").innerHTML = '<p class="tu-note">' + esc(W.shortDate(wk.start, td)) + " to " + esc(W.shortDate(wk.end, td)) + (mins ? " · " + mins + " minutes logged" : "") + "</p>" +
			wk.rows.map(function (r) {
				return '<div class="wp-sumrow" style="--c:' + r.color + '"><span class="wp-sumlab">' + esc(r.name) + '</span><span class="wp-sumbar" role="img" aria-label="' + r.done + " done of " + r.planned + ' planned"><i class="wp-sumplan" style="width:' + (r.planned / maxv * 100) + '%"></i><i class="wp-sumdone" style="width:' + (Math.min(r.done, maxv) / maxv * 100) + '%"></i></span><span class="wp-sumnum">' + r.done + " / " + r.planned + (r.minutes ? " · " + r.minutes + " min" : "") + "</span></div>";
			}).join("") + (wk.other ? '<p class="tu-note">Plus ' + wk.other + " from your lists.</p>" : "");
		var cells = W.heat(P.log, td, U.weeks, U.ws), cols = cells.length / 7, h = '<div class="wp-hmonths" style="grid-template-columns:repeat(' + cols + ',1fr)">';
		for (var c = 0; c < cols; c++) { var first = cells[c * 7].d, prevM = c ? cells[(c - 1) * 7].d.slice(5, 7) : ""; h += "<span>" + (first.slice(5, 7) !== prevM ? W.MONTHS[+first.slice(5, 7) - 1] : "") + "</span>"; }
		h += '</div><div class="wp-hgrid" style="grid-template-columns:repeat(' + cols + ',1fr)">';
		for (var r = 0; r < 7; r++) for (c = 0; c < cols; c++) {
			var x = cells[c * 7 + r], lv = x.n ? Math.min(4, x.n) : 0;
			h += '<button type="button" class="wp-hc wp-l' + lv + (x.future ? " is-future" : "") + (x.d === td ? " is-td" : "") + (x.d === selDay ? " is-sel" : "") + '" style="grid-row:' + (r + 1) + ";grid-column:" + (c + 1) + '" data-hd="' + x.d + '" title="' + x.d + ": " + x.n + ' logged" aria-label="' + W.DOW[W.dowOf(x.d)] + " " + W.shortDate(x.d, td) + ", " + x.n + ' logged"' + (x.future ? " disabled" : "") + "></button>";
		}
		$("wp-heat").innerHTML = h + "</div>";
		renderDay();
	}
	function renderDay() {
		var td = today(), by = W.byDate(P.log), h = "";
		if (selDay) {
			var es = by[selDay] || [];
			h = '<div class="wp-dd"><b>' + W.DOW[W.dowOf(selDay)] + " " + esc(W.shortDate(selDay, td)) + "</b>: " + (es.length ? "" : "nothing logged. ") +
				'<button type="button" class="wp-link" id="wp-logthere">Log the Currently-at workout on this day</button> <button type="button" class="wp-link" id="wp-ddclose">Close</button>' + logList(es) + "</div>";
		}
		var recent = P.log.slice(-12).reverse();
		h += '<h3>Recent</h3>' + (recent.length ? logList(recent, true) : '<p class="wp-empty">Nothing logged yet. Press <b>Done</b> above when you finish a workout.</p>');
		$("wp-daydet").innerHTML = h;
	}
	function logList(es, withDate) {
		return '<ul class="wp-log">' + es.map(function (e) {
			var i = P.log.indexOf(e), c = W.catById(P, e.c), l = e.k !== "w" ? W.listById(P, e.k) : null;
			return '<li style="--c:' + (c ? c.color : "#8a94a3") + '"><span class="wp-ndot"></span>' + (withDate ? '<span class="wp-ld">' + esc(W.shortDate(e.d, today())) + "</span> " : "") + "<b>" + esc(e.n) + "</b>" + (c ? ' <span class="wp-ncat">' + esc(c.name) + "</span>" : l ? ' <span class="wp-ncat">' + esc(l.name) + "</span>" : "") + (e.m ? " · " + e.m + " min" : "") +
				' <button type="button" class="wp-x" data-ldel2="' + i + '" aria-label="Remove this entry">✕</button></li>';
		}).join("") + "</ul>";
	}

	/* ---------- render all ---------- */
	function render(focusId) {
		var ae = document.activeElement, keep = focusId || (ae && ae.getAttribute && (ae.getAttribute("data-item") ? "i:" + ae.getAttribute("data-item") : ae.getAttribute("data-grip") ? "g:" + ae.getAttribute("data-grip") : ""));
		if (document.activeElement !== $("wp-title")) $("wp-title").value = P.title;
		if (document.activeElement !== $("wp-note")) { $("wp-note").value = P.note; grow($("wp-note")); }
		renderCats(); renderWeek(); renderNext(); renderLists(); renderHist();
		Array.prototype.forEach.call(root.querySelectorAll(".wp-lnote"), grow);
		segs();
		if (keep && typeof keep === "string") {
			var el = keep.slice(0, 2) === "i:" ? root.querySelector('[data-item="' + keep.slice(2) + '"]') : keep.slice(0, 2) === "g:" ? root.querySelector('[data-grip="' + keep.slice(2) + '"]') : null;
			if (el) try { el.focus({ preventScroll: false }); } catch (e) {}
		}
		if (EDIT) { var f = W.findItem(P, EDIT); if (f) fillEditor(); else closeEditor(); }
	}
	function segs() {
		[["wp-orient", "o", U.orient], ["wp-lay", "l", U.lay], ["wp-weeks", "w", String(U.weeks)]].forEach(function (s) {
			Array.prototype.forEach.call($(s[0]).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-" + s[1]) === s[2] ? "true" : "false"); });
		});
		$("wp-orient").style.display = layout() === "cards" ? "none" : "";
		$("wp-skip").checked = U.skip; $("wp-ws").value = String(U.ws);
	}
	function grow(t) { if (!t) return; t.style.height = "auto"; t.style.height = Math.min(240, t.scrollHeight + 2) + "px"; }

	/* ---------- editor popover ---------- */
	var EDIT = "", EDANCHOR = null;
	function destOptions(cur) {
		var o = '<option value="">Choose a place…</option><optgroup label="Week">';
		P.days.forEach(function (d) { P.cats.forEach(function (c) { var v = "c|" + d.id + "|" + c.id; o += '<option value="' + v + '"' + (v === cur ? " disabled" : "") + ">" + W.DOW[d.dow] + " · " + esc(c.name) + "</option>"; }); });
		o += "</optgroup>";
		P.lists.forEach(function (l) { o += '<optgroup label="' + esc(l.name) + '">' + l.groups.map(function (g, i) { var v = "g|" + l.id + "|" + g.id; return '<option value="' + v + '"' + (v === cur ? " disabled" : "") + ">" + esc(g.title || (g.mode === "one" ? "Rotation" : "Group " + (i + 1))) + "</option>"; }).join("") + "</optgroup>"; });
		return o;
	}
	function fillEditor() {
		var f = W.findItem(P, EDIT); if (!f) return;
		var it = f.item, inWeek = f.where.kind === "c";
		[["wp-ename", it.name], ["wp-esets", it.sets || ""], ["wp-ereps", it.reps], ["wp-edur", it.dur || ""], ["wp-enote", it.note], ["wp-edone", it.done]].forEach(function (x) { if (document.activeElement !== $(x[0])) $(x[0]).value = x[1]; });
		$("wp-ecat").innerHTML = (inWeek ? "" : '<option value="">None</option>') + P.cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === it.cat ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("");
		$("wp-ecat").value = it.cat || "";
		$("wp-edonel").hidden = inWeek;
		var cur = inWeek ? "c|" + f.where.day + "|" + it.cat : "g|" + f.where.list + "|" + f.where.grp;
		$("wp-emove").innerHTML = destOptions(cur);
		$("wp-edh").textContent = inWeek ? W.DOW[W.dayById(P, f.where.day).dow] + " · " + ((W.catById(P, it.cat) || {}).name || "") : (W.listById(P, f.where.list) || {}).name || "Activity";
	}
	function openEditor(id, anchor, focusName) {
		EDIT = id; EDANCHOR = anchor; var ed = $("wp-ed");
		fillEditor(); ed.hidden = false; placeEditor();
		if (focusName !== false) setTimeout(function () { try { $("wp-ename").focus(); $("wp-ename").select(); } catch (e) {} }, 0);
	}
	function placeEditor() {
		var ed = $("wp-ed"); if (ed.hidden) return;
		var fill = document.querySelector(".mes-pfill"); if (fill && ed.parentNode !== fill) fill.appendChild(ed); else if (!fill && ed.parentNode !== root) root.appendChild(ed);
		if (window.innerWidth <= 600) { ed.classList.add("wp-ed--sheet"); ed.style.left = ed.style.top = ""; return; }
		ed.classList.remove("wp-ed--sheet");
		var a = EDANCHOR && document.body.contains(EDANCHOR) ? EDANCHOR : root.querySelector('[data-item="' + EDIT + '"]');
		var r = a ? a.getBoundingClientRect() : { left: 40, bottom: 80, top: 60 }, w = ed.offsetWidth, h = ed.offsetHeight;
		var x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), y = r.bottom + 6;
		if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
		ed.style.left = x + "px"; ed.style.top = y + "px";
	}
	function closeEditor(refocus) {
		var id = EDIT; EDIT = ""; $("wp-ed").hidden = true;
		if (refocus && id) { var el = root.querySelector('[data-item="' + id + '"]'); if (el) el.focus(); }
	}
	function editField(fn) { var f = W.findItem(P, EDIT); if (!f) return; snapOnce(); fn(f.item, f); save(); render(); }
	var snapT = 0; function snapOnce() { var now = Date.now(); if (now - snapT > 1500) snap(); snapT = now; }   // typing in the editor = one undo step
	$("wp-ename").addEventListener("input", function () { var v = W.str(this.value); editField(function (it) { it.name = v || "Activity"; }); });
	$("wp-esets").addEventListener("input", function () { var v = parseInt(this.value, 10); editField(function (it) { it.sets = v > 0 && v < 100 ? v : 0; }); });
	$("wp-ereps").addEventListener("input", function () { var v = W.str(this.value, 20); editField(function (it) { it.reps = v; }); });
	$("wp-edur").addEventListener("input", function () { var v = parseFloat(this.value); editField(function (it) { it.dur = v > 0 ? Math.min(1440, Math.round(v * 10) / 10) : 0; }); });
	$("wp-enote").addEventListener("input", function () { var v = W.str(this.value, 300); editField(function (it) { it.note = v; }); });
	$("wp-edone").addEventListener("change", function () { var v = W.okDate(this.value); editField(function (it) { it.done = v; }); });
	$("wp-ecat").addEventListener("change", function () {
		var v = this.value, f = W.findItem(P, EDIT); if (!f) return;
		if (f.where.kind === "c") change(function () { W.moveItem(P, EDIT, { kind: "c", day: f.where.day, cat: v }); }); else editField(function (it) { it.cat = v; });
	});
	$("wp-emove").addEventListener("change", function () {
		var v = this.value.split("|"); if (!v[0]) return;
		var id = EDIT; change(function () { W.moveItem(P, id, v[0] === "c" ? { kind: "c", day: v[1], cat: v[2] } : { kind: "g", list: v[1], grp: v[2] }); });
		EDANCHOR = null; toast("Moved"); placeEditor();
	});
	$("wp-elog").addEventListener("click", function () {
		var f = W.findItem(P, EDIT); if (!f) return;
		change(function () { W.logItems(P, [f.item], today(), f.where.kind === "g" ? f.where.list : "w"); if (f.where.kind === "g") f.item.done = today(); });
		toast("Logged " + f.item.name + " for today", true);
	});
	$("wp-edup").addEventListener("click", function () {
		var f = W.findItem(P, EDIT); if (!f) return; var nid;
		change(function () { var dest = f.where.kind === "c" ? { kind: "c", day: f.where.day, cat: f.item.cat } : { kind: "g", list: f.where.list, grp: f.where.grp }; var c = W.moveItem(P, f.item.id, dest, (f.where.kind === "c" ? W.cellItems(W.dayById(P, f.where.day), f.item.cat).indexOf(f.item) : f.idx) + 1, true); nid = c && c.id; });
		if (nid) { var el = root.querySelector('[data-item="' + nid + '"]'); openEditor(nid, el); }
	});
	$("wp-edel").addEventListener("click", function () { var id = EDIT; closeEditor(); delItem(id); });
	$("wp-edx").addEventListener("click", function () { closeEditor(true); });
	function delItem(id) { var f = W.findItem(P, id); if (!f) return; change(function () { W.removeItem(P, id); }); toast("Deleted " + f.item.name, true); }
	document.addEventListener("pointerdown", function (e) { if (!EDIT) return; if ($("wp-ed").contains(e.target) || e.target.closest("[data-item]")) return; closeEditor(); }, true);
	window.addEventListener("resize", function () { placeEditor(); if ($("wp-week").getAttribute("data-lay") !== (layout() === "cards" ? "cards" : U.orient)) render(); });   // only when the layout really changes: a phone keyboard resizes the window too

	/* ---------- inline add ---------- */
	function openAdd(btn) {
		var spec = btn.getAttribute("data-add"), inp = document.createElement("input");
		inp.type = "text"; inp.className = "wp-addin"; inp.maxLength = 120; inp.placeholder = "Type, then Enter"; inp.setAttribute("aria-label", "New activity name"); inp.setAttribute("data-addspec", spec);
		btn.replaceWith(inp); inp.focus();
		var done = false;
		inp.addEventListener("keydown", function (e) {
			if (e.key === "Escape") { done = true; render(); return; }
			if (e.key !== "Enter") return;
			e.preventDefault();
			var o = W.parseItemText(inp.value.trim()); if (!o.name) { done = true; render(); return; }
			done = true; addItem(spec, o, true);
		});
		inp.addEventListener("blur", function () {
			if (done) return; done = true;
			var v = inp.value.trim(); if (v) addItem(spec, W.parseItemText(v), false); else render();
		});
	}
	function addItem(spec, o, again) {
		var s = spec.split("|");
		change(function () {
			var it = W.item(o.name, s[0] === "c" ? s[2] : "", o);
			if (s[0] === "c") { var d = W.dayById(P, s[1]); if (d) d.items.push(it); }
			else { var g = W.grpById(P, s[1], s[2]); if (g) { g.items.push(it); if (g.mode === "one" && !g.here) g.here = it.id; } }
		});
		if (again) { var b = root.querySelector('[data-add="' + spec + '"]'); if (b) openAdd(b); }
	}

	/* ---------- clicks, inputs and keys in the planner ---------- */
	var suppressClick = false;
	root.addEventListener("click", function (e) {
		if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
		var t = e.target, b;
		if ((b = t.closest("[data-add]"))) return openAdd(b);
		if ((b = t.closest("[data-here]"))) { var hid = b.getAttribute("data-here"); if (hid !== P.here) change(function () { P.here = hid; }); return; }
		if ((b = t.closest("[data-gh]"))) { var gf = W.findItem(P, b.getAttribute("data-gh")); if (gf) change(function () { W.grpById(P, gf.where.list, gf.where.grp).here = gf.item.id; }); return; }
		if ((b = t.closest("[data-gdone]"))) return groupDone(b.getAttribute("data-gdone").split("|"));
		if ((b = t.closest("[data-done]"))) return;   // checkbox: handled in "change"
		if ((b = t.closest("[data-cdel]"))) return delCat(b.getAttribute("data-cdel"));
		if (t.id === "wp-addcat") return addCat();
		if ((b = t.closest("[data-ldel]"))) { var L = W.listById(P, b.getAttribute("data-ldel")); if (L) { change(function () { P.lists.splice(P.lists.indexOf(L), 1); }); toast("Deleted the list " + L.name, true); } return; }
		if ((b = t.closest("[data-lmove]"))) { var lm = b.getAttribute("data-lmove").split("|"), li = P.lists.findIndex(function (x) { return x.id === lm[0]; }); change(function () { W.moveInArray(P.lists, li, li + (+lm[1])); }); return; }
		if ((b = t.closest("[data-gadd]"))) { var gl = W.listById(P, b.getAttribute("data-gadd")); if (gl && gl.groups.length < W.LIM.groups) change(function () { gl.groups.push({ id: W.uid("g"), title: "", mode: "one", here: "", items: [] }); }); return; }
		if ((b = t.closest("[data-gdel]"))) { var gd = b.getAttribute("data-gdel").split("|"), gl2 = W.listById(P, gd[0]); if (gl2) { change(function () { gl2.groups = gl2.groups.filter(function (g) { return g.id !== gd[1]; }); }); toast("Deleted the group", true); } return; }
		if ((b = t.closest("[data-gmove]"))) { var gm = b.getAttribute("data-gmove").split("|"), gl3 = W.listById(P, gm[0]), gi = gl3.groups.findIndex(function (g) { return g.id === gm[1]; }); change(function () { W.moveInArray(gl3.groups, gi, gi + (+gm[2])); }); return; }
		if ((b = t.closest("[data-greset]"))) { var gr = b.getAttribute("data-greset").split("|"); change(function () { W.grpById(P, gr[0], gr[1]).items.forEach(function (x) { x.done = ""; }); }); toast("Checklist cleared (history kept)", true); return; }
		if ((b = t.closest("[data-hd]"))) { selDay = selDay === b.getAttribute("data-hd") ? "" : b.getAttribute("data-hd"); renderHist(); return; }
		if ((b = t.closest("[data-ldel2]"))) { var i = +b.getAttribute("data-ldel2"), en = P.log[i]; if (en) { change(function () { P.log.splice(i, 1); }); toast("Removed " + en.n + " (" + W.shortDate(en.d, today()) + ")", true); } return; }
		if (t.id === "wp-ddclose") { selDay = ""; renderDay(); renderHist(); return; }
		if (t.id === "wp-logthere") { nextDate = selDay; markDone(selDay); return; }
		if (t.id === "wp-ndone") return markDone($("wp-ndate").value);
		if (t.id === "wp-nskip") { change(function () { W.advance(P, U.skip); }); return; }
		if (t.id === "wp-nprev") { change(function () { var i2 = P.days.findIndex(function (d) { return d.id === P.here; }); P.here = P.days[(i2 + P.days.length - 1) % P.days.length].id; }); return; }
		if (t.id === "wp-ntoday") { var tr = W.todayRow(P, today()); if (tr) change(function () { P.here = tr.id; }); return; }
		var c = t.closest(".wp-chip");
		if (c && !t.closest("button,input,select,textarea,a")) openEditor(c.getAttribute("data-item"), c);
	});
	root.addEventListener("change", function (e) {
		var t = e.target, v;
		if ((v = t.getAttribute("data-done"))) {
			var f = W.findItem(P, v); if (!f) return; var on = t.checked;
			change(function () {
				if (on) { f.item.done = today(); W.logItems(P, [f.item], today(), f.where.list); }
				else { var d0 = f.item.done; f.item.done = ""; for (var i = P.log.length - 1; i >= 0; i--) if (P.log[i].d === d0 && P.log[i].n === f.item.name && P.log[i].k === f.where.list) { P.log.splice(i, 1); break; } }
			});
			if (on) toast("Done: " + f.item.name, true);
			return;
		}
		if ((v = t.getAttribute("data-time"))) {
			var raw = t.value.trim(), tm = raw ? W.parseTime(raw) : "";
			if (raw && !tm) { toast("Could not read \"" + raw + "\": try 4:00 PM or 16:00"); render(); return; }
			change(function () { W.dayById(P, v).time = tm; }); return;
		}
		if ((v = t.getAttribute("data-ccol"))) { var cc = t.value; change(function () { W.catById(P, v).color = W.okColor(cc) || W.catById(P, v).color; }); return; }
		if ((v = t.getAttribute("data-gmode"))) { var g = W.grpById.apply(null, [P].concat(v.split("|"))), mode = t.value; change(function () { g.mode = mode; if (mode === "one" && !g.here && g.items[0]) g.here = g.items[0].id; }); return; }
		if (t.id === "wp-ndate") { nextDate = W.okDate(t.value); return; }
	});
	root.addEventListener("input", function (e) {   // text fields that save as you type (one undo step per burst of typing)
		var t = e.target, v;
		if ((v = t.getAttribute("data-cname"))) { snapOnce(); W.catById(P, v).name = W.str(t.value, 40) || "Category"; save(); renderWeek(); return; }
		if ((v = t.getAttribute("data-lname"))) { snapOnce(); W.listById(P, v).name = W.str(t.value, 80) || "Training list"; save(); return; }
		if ((v = t.getAttribute("data-gtitle"))) { snapOnce(); W.grpById.apply(null, [P].concat(v.split("|"))).title = W.str(t.value, 80); save(); return; }
		if ((v = t.getAttribute("data-lnote"))) { snapOnce(); W.listById(P, v).note = W.str(t.value, 600); save(); grow(t); return; }
	});
	root.addEventListener("focusout", function (e) { if (e.target.matches && e.target.matches(".wp-cname,.wp-lname,.wp-gtitle,.wp-lnote")) renderNext(); });
	$("wp-title").addEventListener("input", function () { snapOnce(); P.title = W.str(this.value, 80) || "My Workout Routine"; save(); });
	$("wp-note").addEventListener("input", function () { snapOnce(); P.note = W.str(this.value, 600); save(); grow(this); });
	$("wp-note").addEventListener("change", renderNext);

	function markDone(date) {
		date = W.okDate(date) || today();
		if (date > today()) date = today();
		var d = W.dayById(P, P.here), picked = d.items.filter(function (x) { var cb = root.querySelector('[data-nchk="' + x.id + '"]'); return !cb || cb.checked; });
		var from = W.DOW[d.dow];
		change(function () { if (picked.length) W.logItems(P, picked, date, "w"); W.advance(P, U.skip); });
		toast((picked.length ? "Logged " + picked.length + (picked.length === 1 ? " activity" : " activities") + (date !== today() ? " on " + W.shortDate(date, today()) : "") + ". " : "") + "Moved on from " + from + " to " + W.DOW[W.dayById(P, P.here).dow] + ".", true);
	}
	function groupDone(a) {
		var g = W.grpById(P, a[0], a[1]); if (!g || !g.here) return;
		var f = W.findItem(P, g.here), date = today();
		change(function () { f.item.done = date; W.logItems(P, [f.item], date, a[0]); g.here = W.groupNext(g); });
		toast("Done: " + f.item.name + ". Next: " + W.findItem(P, g.here).item.name, true);
	}
	function addCat() {
		if (P.cats.length >= W.LIM.cats) return;
		var used = P.cats.map(function (c) { return c.color; }), col = W.PALETTE.filter(function (c) { return used.indexOf(c) < 0; })[0] || W.PALETTE[0], id = W.uid("c");
		change(function () { P.cats.push({ id: id, name: "New category", color: col }); });
		var inp = root.querySelector('[data-cname="' + id + '"]'); if (inp) { inp.focus(); inp.select(); }
	}
	function delCat(id) {
		var c = W.catById(P, id); if (!c || P.cats.length < 2) return;
		var n = P.days.reduce(function (s, d) { return s + W.cellItems(d, id).length; }, 0);
		if (n && !window.confirm("Delete the category \"" + c.name + "\"? Its " + n + " planned " + (n === 1 ? "activity moves" : "activities move") + " to \"" + P.cats.find(function (x) { return x.id !== id; }).name + "\".")) return;
		change(function () { var to = P.cats.find(function (x) { return x.id !== id; }).id; P.days.forEach(function (d) { d.items.forEach(function (x) { if (x.cat === id) x.cat = to; }); }); P.cats = P.cats.filter(function (x) { return x.id !== id; }); });
		toast("Deleted the category " + c.name, true);
	}
	$("wp-addlist").addEventListener("click", function () {
		if (P.lists.length >= W.LIM.lists) return toast("That is the most lists one plan can hold.");
		var id = W.uid("l");
		change(function () { P.lists.push({ id: id, name: "New training list", note: "", groups: [{ id: W.uid("g"), title: "", mode: "all", here: "", items: [] }, { id: W.uid("g"), title: "Do one after finishing above", mode: "one", here: "", items: [] }] }); });
		var inp = root.querySelector('[data-lname="' + id + '"]'); if (inp) { inp.focus(); inp.select(); }
	});

	/* keyboard: Alt+arrows move the focused activity, Delete removes it, Enter edits; arrows on a ⠿ grip move the day */
	root.addEventListener("keydown", function (e) {
		var t = e.target;
		if (t.classList && t.classList.contains("wp-grip")) {
			var cols = U.orient === "cols" && layout() !== "cards", k = e.key, step = (k === (cols ? "ArrowLeft" : "ArrowUp")) ? -1 : (k === (cols ? "ArrowRight" : "ArrowDown")) ? 1 : 0;
			if (!step) return; e.preventDefault();
			var id = t.getAttribute("data-grip"), i = P.days.findIndex(function (d) { return d.id === id; });
			if (i + step < 0 || i + step >= P.days.length) return;
			change(function () { W.moveRow(P, i, i + step); }, "g:" + id); return;
		}
		if (!t.classList || !t.classList.contains("wp-chip")) return;
		var iid = t.getAttribute("data-item"), f = W.findItem(P, iid); if (!f) return;
		if (e.key === "Enter" || e.key === " " || e.key === "F2") { e.preventDefault(); openEditor(iid, t); return; }
		if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); var nb = t.nextElementSibling && t.nextElementSibling.matches(".wp-chip") ? t.nextElementSibling : t.previousElementSibling; var nid = nb && nb.getAttribute("data-item"); delItem(iid); if (nid) render("i:" + nid); return; }
		if (!e.altKey || !/^Arrow/.test(e.key)) return;
		e.preventDefault();
		var dest = null, idx = null, k2 = e.key;
		if (f.where.kind === "g") {
			if (k2 === "ArrowUp" || k2 === "ArrowDown") { var to = f.idx + (k2 === "ArrowUp" ? -1 : 1); if (to < 0 || to >= f.arr.length) return; change(function () { W.moveInArray(f.arr, f.idx, to); }, "i:" + iid); }
			return;
		}
		var di = P.days.findIndex(function (d) { return d.id === f.where.day; }), ci = P.cats.findIndex(function (c) { return c.id === f.item.cat; }), cellArr = W.cellItems(P.days[di], f.item.cat), pos = cellArr.indexOf(f.item);
		var cols2 = U.orient === "cols" && layout() !== "cards";
		var dayKey = cols2 ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 }, catKey = cols2 ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 };
		if (e.shiftKey && catKey[k2]) { idx = pos + catKey[k2]; if (idx < 0 || idx >= cellArr.length) return; dest = { kind: "c", day: f.where.day, cat: f.item.cat }; }
		else if (dayKey[k2]) { var nd = P.days[di + dayKey[k2]]; if (!nd) return; dest = { kind: "c", day: nd.id, cat: f.item.cat }; }
		else if (catKey[k2]) { var nc = P.cats[ci + catKey[k2]]; if (!nc) return; dest = { kind: "c", day: f.where.day, cat: nc.id }; }
		if (dest) change(function () { W.moveItem(P, iid, dest, idx); }, "i:" + iid);
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && EDIT) { closeEditor(true); return; }
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
			var a = document.activeElement; if (a && (a.tagName === "INPUT" && a.type === "text" || a.tagName === "TEXTAREA")) return;
			if (!root.contains(a) && a !== document.body) return;
			if (UNDO.length) { e.preventDefault(); doUndo(); }
		}
	});
	$("wp-undo").addEventListener("click", doUndo);

	/* ---------- drag and drop (pointer events) ---------- */
	var D = null, IND = null, GHOST = null, AUTO = 0;
	function ind() { if (!IND) { IND = document.createElement("div"); IND.className = "wp-ind"; document.body.appendChild(IND); } return IND; }
	root.addEventListener("pointerdown", function (e) {
		if (e.button > 0 || D) return;
		var g = e.target.closest(".wp-grip"), c = e.target.closest(".wp-chip");
		if (!g && !c) return;
		if (c && !g && e.target.closest("button,input,select,textarea,a,label")) return;
		var touch = e.pointerType !== "mouse";
		D = { kind: g ? "row" : "item", id: g ? g.getAttribute("data-grip") : c.getAttribute("data-item"), el: g ? root.querySelector('[data-row="' + g.getAttribute("data-grip") + '"]') : c, src: g || c,
			x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, pid: e.pointerId, touch: touch, started: false, target: null, copy: false };
		if (g) e.preventDefault();
		if (touch && !g) D.timer = setTimeout(function () { if (D && !D.started) begin(); }, 300);
		document.addEventListener("pointermove", onMove, { passive: false });
		document.addEventListener("pointerup", onUp);
		document.addEventListener("pointercancel", onCancel);
	});
	function block(e) { if (D && D.started) e.preventDefault(); }
	function begin() {
		D.started = true;
		if (D.touch && navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
		document.addEventListener("touchmove", block, { passive: false });
		var r = D.src.getBoundingClientRect();
		GHOST = (D.kind === "row" ? (function () { var s = document.createElement("div"); s.className = "wp-chip wp-ghostrow"; var dd = W.dayById(P, D.id); s.textContent = "⠿ " + W.DOW[dd.dow] + (dd.items.length ? " · " + dd.items.map(function (x) { return x.name; }).join(", ") : ""); return s; })() : D.src.cloneNode(true));
		GHOST.classList.add("wp-ghost"); GHOST.removeAttribute("tabindex"); GHOST.removeAttribute("data-item");
		GHOST.style.width = D.kind === "row" ? "" : Math.min(r.width, 320) + "px";
		D.dx = D.kind === "row" ? 14 : D.x0 - r.left; D.dy = D.kind === "row" ? 14 : D.y0 - r.top;
		(document.querySelector(".mes-pfill:fullscreen") || document.body).appendChild(GHOST);
		D.el && D.el.classList.add("wp-src");
		root.classList.add("wp-dragging");
		if (EDIT) closeEditor();
		AUTO = setInterval(autoScroll, 16);
		track();
	}
	function onMove(e) {
		if (!D || e.pointerId !== D.pid) return;
		D.x = e.clientX; D.y = e.clientY; D.copy = e.altKey;
		if (!D.started) {
			var dist = Math.hypot(D.x - D.x0, D.y - D.y0);
			if (D.touch && D.kind === "item") { if (dist > 10) cleanup(); return; }
			if (dist < 5) return;
			begin();
		}
		e.preventDefault();
		track();
	}
	function track() {
		GHOST.style.transform = "translate(" + (D.x - D.dx) + "px," + (D.y - D.dy) + "px)";
		GHOST.classList.toggle("is-copy", !!D.copy && D.kind === "item");
		var i = ind(); i.style.display = "none";
		Array.prototype.forEach.call(root.querySelectorAll(".wp-over"), function (x) { x.classList.remove("wp-over"); });
		D.target = null;
		var under = document.elementFromPoint(D.x, D.y);
		if (D.kind === "row") return trackRow(i);
		var drop = under && under.closest && under.closest("[data-drop]");
		if (!drop || !root.contains(drop)) return;
		var axis = drop.getAttribute("data-axis"), kids = Array.prototype.filter.call(drop.children, function (k) { return k.classList.contains("wp-chip") && k !== D.el; }), idx = kids.length, ref = null, after = false;
		for (var k = 0; k < kids.length; k++) {
			var r = kids[k].getBoundingClientRect();
			if (axis === "y" ? D.y < r.top + r.height / 2 : (D.y < r.top || (D.y <= r.bottom && D.x < r.left + r.width / 2))) { idx = k; ref = r; break; }
		}
		if (!ref && kids.length) { ref = kids[kids.length - 1].getBoundingClientRect(); after = true; }
		drop.classList.add("wp-over");
		D.target = { spec: drop.getAttribute("data-drop").split("|"), index: idx };
		if (!ref) return;
		i.style.display = "block";
		if (axis === "y") { i.style.left = ref.left + "px"; i.style.width = ref.width + "px"; i.style.height = "3px"; i.style.top = ((after ? ref.bottom + 2 : ref.top - 3)) + "px"; }
		else { i.style.top = ref.top + "px"; i.style.height = ref.height + "px"; i.style.width = "3px"; i.style.left = ((after ? ref.right + 2 : ref.left - 4)) + "px"; }
	}
	function trackRow(i) {
		var x = layout() !== "cards" && U.orient === "cols", rows = Array.prototype.filter.call($("wp-week").querySelectorAll("[data-row]"), function (r) { return r.getAttribute("data-row") !== D.id; });
		if (!rows.length) return;
		var idx = rows.length, ref = null, after = false;
		for (var k = 0; k < rows.length; k++) { var r = rows[k].getBoundingClientRect(); if (x ? D.x < r.left + r.width / 2 : D.y < r.top + r.height / 2) { idx = k; ref = r; break; } }
		if (!ref) { ref = rows[rows.length - 1].getBoundingClientRect(); after = true; }
		D.target = { row: idx };
		var tb = $("wp-week").querySelector("table"), tr = tb ? tb.getBoundingClientRect() : null;
		i.style.display = "block";
		if (x) { i.style.top = (tr ? tr.top : ref.top) + "px"; i.style.height = (tr ? tr.height : ref.height) + "px"; i.style.width = "3px"; i.style.left = (after ? ref.right : ref.left - 2) + "px"; }
		else { i.style.left = (tr ? tr.left : ref.left) + "px"; i.style.width = (tr ? tr.width : ref.width) + "px"; i.style.height = "3px"; i.style.top = (after ? ref.bottom : ref.top - 2) + "px"; }
	}
	function autoScroll() {
		if (!D || !D.started) return;
		var fill = document.querySelector(".mes-pfill"), edge = 56, sp = 0, vh = window.innerHeight;
		if (D.y < edge) sp = -Math.ceil((edge - D.y) / 4); else if (D.y > vh - edge) sp = Math.ceil((D.y - (vh - edge)) / 4);
		var wrap = document.elementFromPoint(D.x, D.y); wrap = wrap && wrap.closest && wrap.closest(".wp-tablewrap");
		var hs = 0; if (wrap) { var r = wrap.getBoundingClientRect(); if (D.x < r.left + 40) hs = -8; else if (D.x > r.right - 40) hs = 8; if (hs) wrap.scrollLeft += hs; }
		if (!sp) return;
		if (fill) fill.scrollTop += sp; else window.scrollBy(0, sp);
		track();
	}
	function onUp(e) {
		if (!D || e.pointerId !== D.pid) return;
		var d = D;
		if (d.started) {
			suppressClick = true; setTimeout(function () { suppressClick = false; }, 60);
			var t = d.target;
			cleanup();
			if (t && d.kind === "row") {
				var from = P.days.findIndex(function (x) { return x.id === d.id; });
				if (t.row !== from) change(function () { W.moveRow(P, from, t.row); });
			} else if (t && d.kind === "item") {
				var s = t.spec, dest = s[0] === "c" ? { kind: "c", day: s[1], cat: s[2] } : { kind: "g", list: s[1], grp: s[2] };
				var f = W.findItem(P, d.id), same = f && (dest.kind === "c" ? f.where.kind === "c" && f.where.day === dest.day && f.item.cat === dest.cat : f.where.kind === "g" && f.where.grp === dest.grp);
				var oldPos = f ? (f.where.kind === "c" ? W.cellItems(W.dayById(P, f.where.day), f.item.cat).indexOf(f.item) : f.idx) : -1;
				if (!(same && !d.copy && oldPos === t.index)) {
					change(function () { W.moveItem(P, d.id, dest, t.index, d.copy); });
					if (d.copy) toast("Copied", true);
				}
			}
		} else cleanup();
	}
	function onCancel(e) { if (D && e.pointerId === D.pid) cleanup(); }
	function cleanup() {
		if (!D) return;
		clearTimeout(D.timer); clearInterval(AUTO);
		document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onCancel);
		document.removeEventListener("touchmove", block);
		if (GHOST) GHOST.remove(); GHOST = null;
		if (IND) IND.style.display = "none";
		D.el && D.el.classList.remove("wp-src");
		root.classList.remove("wp-dragging");
		Array.prototype.forEach.call(root.querySelectorAll(".wp-over"), function (x) { x.classList.remove("wp-over"); });
		D = null;
	}
	document.addEventListener("keydown", function (e) { if (e.key === "Escape" && D) { cleanup(); toast("Drag cancelled"); } });
	root.addEventListener("contextmenu", function (e) { if (D && D.touch) e.preventDefault(); });

	/* ---------- toolbar: segments, templates, share, export, import ---------- */
	$("wp-orient").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; U.orient = b.getAttribute("data-o"); saveUI(); render(); });
	$("wp-lay").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; U.lay = b.getAttribute("data-l"); saveUI(); render(); });
	$("wp-weeks").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; U.weeks = +b.getAttribute("data-w"); saveUI(); renderHist(); segs(); });
	$("wp-ws").addEventListener("change", function () { U.ws = +this.value ? 1 : 0; saveUI(); renderHist(); });
	$("wp-skip").addEventListener("change", function () { U.skip = this.checked; saveUI(); renderNext(); });
	if (mq.addEventListener) mq.addEventListener("change", function () { if (U.lay === "auto") render(); });

	$("wp-tplsel").innerHTML = Object.keys(W.TEMPLATES).map(function (k) { return '<option value="' + k + '">' + esc(W.TEMPLATES[k].name) + "</option>"; }).join("");
	$("wp-tplgo").addEventListener("click", function () {
		var k = $("wp-tplsel").value, t = W.template(k);
		change(function () { var log = P.log; P = t; P.log = log; });
		toast("Loaded \"" + W.TEMPLATES[k].name + "\". Your history is kept.", true);
	});

	function shareUrl() { return location.origin + "/workout-planner?p=" + W.encodeShare(P); }
	function copyText(txt, msg) {
		function fallback() { var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); toast(ok ? msg : "Copy failed: select and copy by hand"); if (!ok) window.prompt("Copy this:", txt); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast(msg); }, fallback); else fallback();
	}
	$("wp-share").addEventListener("click", function () { copyText(shareUrl(), "Share link copied: it holds your week and lists, not your history"); });

	function download(name, type, text) {
		var a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type }));
		a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
	}
	function fileBase() { return (P.title || "workout-plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "workout-plan"; }
	function tableHtml(rows, head) {
		return "<table border=\"1\" style=\"border-collapse:collapse\">" + rows.map(function (r, i) { var tg = head && i === 0 ? "th" : "td"; return "<tr>" + r.map(function (c) { return "<" + tg + (head && i === 0 ? ' style="background:#ffff00"' : "") + ">" + esc(c).replace(/\n/g, "<br>") + "</" + tg + ">"; }).join("") + "</tr>"; }).join("") + "</table>";
	}
	function exportAs(kind) {
		$("wp-exp").open = false;
		var td = today();
		if (kind === "csv") { download(fileBase() + ".csv", "text/csv;charset=utf-8", "﻿" + W.planCSV(P, td)); toast("CSV downloaded"); }
		else if (kind === "json") { download(fileBase() + "-backup-" + td + ".json", "application/json", JSON.stringify({ app: "mes-workout-planner", saved: new Date().toISOString(), plan: P }, null, 1)); toast("Backup downloaded (plan + history)"); }
		else if (kind === "print") { buildPrint(); window.print(); }
		else if (kind === "excel") {
			var rows = W.grid(P, H24); if (P.note) rows.push([P.note]);
			var tsv = W.toTSV(rows), html = "<meta charset=\"utf-8\">" + tableHtml(rows, true);
			if (P.lists.length) { var lg = W.listGrid(P, td); tsv += "\n\n" + W.toTSV(lg); html += "<br>" + tableHtml(lg, false); }
			if (navigator.clipboard && window.ClipboardItem) {
				navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([tsv], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]).then(function () { toast("Copied: paste it into Excel or Google Sheets"); }, function () { copyText(tsv, "Copied as text: paste it into Excel or Google Sheets"); });
			} else copyText(tsv, "Copied as text: paste it into Excel or Google Sheets");
		}
	}
	Array.prototype.forEach.call(root.querySelectorAll(".wp-menu"), function (dm) {   // keep the dropdown on screen; one open at a time
		dm.addEventListener("toggle", function () {
			var pop = dm.querySelector(".wp-menupop"); pop.style.left = "0px";
			if (!dm.open) return;
			Array.prototype.forEach.call(root.querySelectorAll(".wp-menu"), function (o) { if (o !== dm) o.open = false; });
			var r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8);
			if (over > 0) pop.style.left = Math.max(-r.left + 8, -over) + "px";
		});
	});
	document.addEventListener("click", function (e) { Array.prototype.forEach.call(root.querySelectorAll(".wp-menu[open]"), function (dm) { if (!dm.contains(e.target)) dm.open = false; }); });
	$("wp-exp").addEventListener("click", function (e) { var b = e.target.closest("[data-exp]"); if (b) exportAs(b.getAttribute("data-exp")); });

	function buildPrint() {
		var pr = $("wp-print"); if (!pr) { pr = document.createElement("div"); pr.id = "wp-print"; document.body.appendChild(pr); }
		var g = W.grid(P, H24), td = today();
		var h = "<h1>" + esc(P.title) + "</h1><table><thead><tr>" + g[0].map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
			g.slice(1).map(function (r, i) { var d = P.days[i]; return '<tr class="' + (d.id === P.here ? "is-here" : "") + '">' + r.map(function (c, j) { return "<td>" + (j >= 2 && j < r.length - 1 ? esc(c).split("; ").join("<br>") : j === r.length - 1 && c ? "📍 " + esc(c) : esc(c)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
		if (P.note) h += "<p><i>" + esc(P.note) + "</i></p>";
		P.lists.forEach(function (l) {
			h += '<div class="wp-plist"><h2>' + esc(l.name) + "</h2>";
			l.groups.forEach(function (gr) {
				h += "<h3>" + esc(gr.title || (gr.mode === "one" ? "Do one, in turn" : "Do all")) + (gr.mode === "one" ? " (do one, in turn)" : "") + "</h3><ul>" +
					gr.items.map(function (x) { return "<li>" + (gr.mode === "all" ? (x.done ? "☑ " : "☐ ") : "") + esc(W.itemText(x)) + (x.done ? " <b>Done " + esc(W.shortDate(x.done, td)) + "</b>" : "") + (gr.mode === "one" && gr.here === x.id ? " <b>📍 Here</b>" : "") + "</li>"; }).join("") + "</ul>";
			});
			if (l.note) h += "<p><i>" + esc(l.note) + "</i></p>";
			h += "</div>";
		});
		pr.innerHTML = h + '<p class="wp-pfoot">mes.fm/workout-planner · ' + esc(td) + "</p>";
	}
	window.addEventListener("beforeprint", buildPrint);

	function impMsg(m, bad) { var el = $("wp-impmsg"); el.textContent = m; el.classList.toggle("is-bad", !!bad); }
	function importTable(text) {
		var r = W.parseTable(text, P);
		if (r.error) return impMsg(r.error, true);
		change(function () { var lists = P.lists, log = P.log, title = P.title; P = r.plan; P.lists = lists; P.log = log; P.title = title; if (!P.note && r.plan.note === "") P.note = ""; });
		impMsg("Imported " + P.days.reduce(function (s, d) { return s + d.items.length; }, 0) + " activities in " + P.cats.length + " categories." + (r.notes.length ? " " + r.notes.join(" ") : ""));
		toast("Week imported", true);
	}
	$("wp-impgo").addEventListener("click", function () { importTable($("wp-imptext").value); });
	$("wp-imptext").addEventListener("paste", function () { setTimeout(function () { if ($("wp-imptext").value.trim()) impMsg("Pasted. Press \"Import the week\" to replace the week (lists and history stay)."); }, 0); });
	$("wp-impfile").addEventListener("change", function () { var f = this.files && this.files[0]; if (!f) return; f.text().then(function (t) { $("wp-imptext").value = t; importTable(t); }); this.value = ""; });
	$("wp-impjson").addEventListener("change", function () {
		var f = this.files && this.files[0]; if (!f) return; this.value = "";
		f.text().then(function (t) {
			var o; try { o = JSON.parse(t); } catch (e) { return impMsg("That file is not a backup from this page.", true); }
			var plan = o && o.plan ? o.plan : o;
			if (!plan || !Array.isArray(plan.days)) return impMsg("That file is not a backup from this page.", true);
			change(function () { P = W.normalize(plan); });
			impMsg("Backup restored: " + P.log.length + " history entries."); toast("Backup restored", true);
		});
	});

	/* ---------- a shared link ---------- */
	(function () {
		var m = /[?&]p=([^&#]+)/.exec(location.search); if (!m) return;
		var plan = W.decodeShare(decodeURIComponent(m[1]));
		try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
		if (!plan) { toast("That share link is damaged, so your own plan is shown."); return; }
		if (!hadData) { var log = P.log; P = plan; P.log = log; save(); toast("Opened the shared plan \"" + plan.title + "\""); return; }
		if (W.sameDays(plan, P)) { toast("This link is the plan you already have."); return; }
		$("wp-sharename").textContent = "\"" + plan.title + "\"";
		$("wp-sharebar").hidden = false;
		$("wp-shareuse").onclick = function () { change(function () { var log = P.log; P = plan; P.log = log; }); $("wp-sharebar").hidden = true; toast("Now using the shared plan", true); };
		$("wp-sharekeep").onclick = function () { $("wp-sharebar").hidden = true; };
	})();

	/* ---------- Fill window / Full screen ---------- */
	function panels() {
		if (!window.MESPanel) return;
		window.MESPanel.add($("wp-weekcard"), { bar: $("wp-weekbar").querySelector(".wp-headctl"), onChange: function () { render(); placeEditor(); } });
		window.MESPanel.add($("wp-listcard"), { bar: $("wp-listbar"), onChange: placeEditor });
	}
	if (window.MESPanel) panels(); else window.addEventListener("load", panels);

	render();
	save();
	setInterval(function () { var td = today(); if (td !== render._day) { render._day = td; render(); } }, 60000); render._day = today();
})();
