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
