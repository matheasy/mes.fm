/* MESPollStats: pure helpers of the MES Polls owner page (mes.fm/polls-stats). Runs in node too (tests: tool_apps_src/polls-stats-tests.js).
 * A poll row = what api/polls-admin.js returns: {id, q, d, o, m, cl, sh, ch, c, x, hid, n, v, r, nets, why, open, closes}. */
(function (root) {
	"use strict";
	var DAY = 86400000;
	var P = {};

	function dayKey(ms) { var d = new Date(ms); return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2); }
	P.dayKey = dayKey;

	/** "open" | "closed" | "hidden" (hidden wins) */
	P.status = function (p) { return p.hid ? "hidden" : p.open ? "open" : "closed"; };

	/** how the poll closes: "date" (a closing time was set), "manual" (open until the maker closes it), "early" (closed by the maker before its date) */
	P.closeKind = function (p) {
		if (p.x && (!p.cl || p.x < p.cl)) return p.cl ? "early" : "manual-closed";
		return p.cl ? "date" : "manual";
	};

	function bump(o, k, by) { o[k] = (o[k] || 0) + (by === undefined ? 1 : by); }

	/** totals and question types */
	P.summary = function (polls, now) {
		var s = { total: polls.length, open: 0, closed: 0, hidden: 0, reported: 0, votes: 0, picks: 0, single: 0, multi: 0, mdist: {},
			sh: { always: 0, voted: 0, closed: 0 }, close: { date: 0, manual: 0, early: 0, "manual-closed": 0 }, change: 0, desc: 0,
			opts: {}, noVotes: 0, top: null, last7: 0, last30: 0 };
		polls.forEach(function (p) {
			s[P.status(p)]++;
			if (p.r > 0) s.reported++;
			s.votes += p.v || 0;
			s.picks += (p.n || []).reduce(function (a, b) { return a + b; }, 0);
			if (p.m > 1) { s.multi++; bump(s.mdist, String(p.m)); } else s.single++;
			if (s.sh[p.sh] !== undefined) s.sh[p.sh]++;
			bump(s.close, P.closeKind(p));
			if (p.ch) s.change++;
			if (p.d) s.desc++;
			var no = p.o.length; bump(s.opts, no >= 8 ? "8+" : String(no));
			if (!p.v) s.noVotes++;
			if (!s.top || (p.v || 0) > (s.top.v || 0)) s.top = p;
			if (now - p.c < 7 * DAY) s.last7++;
			if (now - p.c < 30 * DAY) s.last30++;
		});
		s.avg = s.total ? s.votes / s.total : 0;
		return s;
	};

	/** one point per UTC day, oldest first: polls made that day and the votes those polls have now */
	P.daily = function (polls, days, now) {
		var out = [], idx = {};
		for (var i = days - 1; i >= 0; i--) { var k = dayKey(now - i * DAY); idx[k] = out.length; out.push({ key: k, polls: 0, votes: 0 }); }
		polls.forEach(function (p) {
			var j = idx[dayKey(p.c)];
			if (j === undefined) return;
			out[j].polls++; out[j].votes += p.v || 0;
		});
		return out;
	};

	/** {series:{"mes.fm|/polls": {day: n}}} from api/stats-series -> numbers in the same day order */
	P.viewsFor = function (days, series) {
		var s = (series && (series["mes.fm|/polls"] || series[Object.keys(series)[0]])) || {};
		return days.map(function (d) { return Number(s[d.key]) || 0; });
	};

	function norm(t) { return String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""); }
	/** every word must match the question, description, options or id; st = all | open | closed | hidden | reported | multi | novotes */
	P.filter = function (polls, q, st) {
		var words = norm(q).split(/\s+/).filter(Boolean);
		return polls.filter(function (p) {
			if (st === "reported" && !(p.r > 0)) return false;
			if (st === "multi" && !(p.m > 1)) return false;
			if (st === "novotes" && p.v) return false;
			if ((st === "open" || st === "closed" || st === "hidden") && P.status(p) !== st) return false;
			if (!words.length) return true;
			var hay = norm([p.id, p.q, p.d].concat(p.o).join(" "));
			return words.every(function (w) { return hay.indexOf(w) >= 0; });
		});
	};

	var KEYS = {
		q: function (p) { return norm(p.q); }, opts: function (p) { return p.o.length; }, m: function (p) { return p.m; },
		v: function (p) { return p.v || 0; }, c: function (p) { return p.c; }, closes: function (p) { return p.x || p.closes || 0; },
		st: function (p) { return P.status(p); }, r: function (p) { return p.r || 0; }
	};
	P.SORTS = Object.keys(KEYS);
	P.sort = function (polls, key, dir) {
		var f = KEYS[key] || KEYS.c, d = dir === "asc" ? 1 : -1;
		return polls.slice().sort(function (a, b) {
			var x = f(a), y = f(b);
			if (x < y) return -d; if (x > y) return d;
			return b.c - a.c;
		});
	};

	/** the leading option(s) of a poll: {i:[indexes], n, share} or null when nobody voted */
	P.leader = function (p) {
		var n = p.n || [], best = 0, sum = 0;
		n.forEach(function (x) { sum += x; if (x > best) best = x; });
		if (!best) return null;
		var i = []; n.forEach(function (x, j) { if (x === best) i.push(j); });
		return { i: i, n: best, share: best / sum };
	};

	function csvCell(v) { v = String(v === undefined || v === null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
	P.csv = function (polls) {
		var rows = [["id", "link", "question", "description", "options", "votes per option", "voters", "max picks", "results shown", "vote changes", "created", "closes", "closed", "status", "reports"]];
		polls.forEach(function (p) {
			rows.push([p.id, "https://mes.fm/v/" + p.id, p.q, p.d, p.o.join(" | "), (p.n || []).join(" | "), p.v || 0, p.m, p.sh, p.ch ? "yes" : "no",
				new Date(p.c).toISOString(), p.cl ? new Date(p.cl).toISOString() : "", p.x ? new Date(p.x).toISOString() : "", P.status(p), p.r || 0]);
		});
		return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n") + "\n";
	};

	/** polls.hivehub.dev rows + vote rows -> [{id, author, permlink, q, c, end, m, hide, ch, votes}] */
	P.hiveRows = function (polls, votes) {
		var cnt = {};
		(votes || []).forEach(function (v) { bump(cnt, v.poll_id); });
		return (polls || []).map(function (p) {
			return { id: p.id, author: p.author, permlink: p.permlink, q: p.question || p.post_title || "", c: Date.parse((p.created || "") + "Z") || 0,
				end: Date.parse((p.end_time || "") + "Z") || 0, m: p.max_choices_voted || 1, hide: !!p.ui_hide_res_until_voted, ch: !!p.allow_vote_changes, votes: cnt[p.id] || 0 };
		}).sort(function (a, b) { return b.c - a.c; });
	};

	/** made-up data for 127.0.0.1 / ?mock=1 (deterministic for a given now) */
	P.sample = function (now) {
		var seed = 7;
		function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
		var QS = [["Best pizza topping?", ["Cheese", "Pepperoni", "Pineapple", "Mushroom"]], ["Which MES tool do you use most?", ["Percentage Calculator", "Timer", "Photo Editor", "Grade Calculator", "Speed Reader"]],
			["Should the next livestream be about 9/11 or the Hutchison Effect?", ["9/11", "Hutchison Effect"]], ["Where should we eat on Friday?", ["Sushi", "Tacos", "Burgers", "Pho", "Pizza", "Indian"]],
			["Team names for the soccer league", ["Rockets", "Comets", "Eagles", "Sharks"]], ["What time works for the meeting?", ["9 am", "11 am", "2 pm", "4 pm"]],
			["Favourite season?", ["Spring", "Summer", "Autumn", "Winter"]], ["Pick the logo colours", ["Blue", "Green", "Orange", "Purple", "Red", "Black", "Gold", "Teal", "Pink"]],
			["Is a hot dog a sandwich?", ["Yes", "No"]], ["Which day for the party?", ["Friday", "Saturday", "Sunday"]], ["Rate the new design", ["1", "2", "3", "4", "5"]],
			["Buy cheap fake watches here", ["Yes", "No"]], ["Coffee or tea?", ["Coffee", "Tea", "Neither"]], ["Which board game tonight?", ["Catan", "Chess", "Backgammon", "Monopoly", "Scrabble"]]];
		var out = [];
		for (var i = 0; i < 46; i++) {
			var t = QS[i % QS.length], c = now - Math.floor(rnd() * 80 * DAY) - 3600000;
			var m = rnd() < 0.25 ? Math.min(t[1].length, 2 + Math.floor(rnd() * 2)) : 1;
			var hasCl = rnd() < 0.55, cl = hasCl ? c + Math.floor((1 + rnd() * 14) * DAY) : 0;
			var x = rnd() < 0.2 ? Math.min(now, c + Math.floor(rnd() * 3 * DAY)) : 0;
			var v = Math.floor(Math.pow(rnd(), 2.2) * 140), n = t[1].map(function () { return 0; });
			for (var k = 0; k < v; k++) { var picks = m > 1 ? 1 + Math.floor(rnd() * m) : 1; for (var j = 0; j < picks; j++) n[Math.floor(rnd() * n.length)]++; }
			var p = { id: ("s" + (100000 + i * 7919).toString(36) + "xxxxxx").slice(0, 8), q: t[0], d: rnd() < 0.3 ? "Vote by the weekend please." : "", o: t[1].slice(), m: m,
				cl: cl, sh: ["always", "always", "voted", "closed"][Math.floor(rnd() * 4)], ch: rnd() < 0.3, c: c, x: x, hid: 0, n: n, v: v, r: 0, nets: 0, why: {} };
			p.closes = x || cl || c + 366 * DAY; p.open = !x && now < (cl || c + 366 * DAY);
			if (/fake watches/.test(p.q)) { p.r = 4; p.nets = 3; p.why = { spam: 4 }; p.hid = now - 5 * DAY; }
			if (i === 5) { p.r = 1; p.nets = 1; p.why = { other: 1 }; }
			out.push(p);
		}
		return out.sort(function (a, b) { return b.c - a.c; });
	};

	if (typeof module !== "undefined" && module.exports) module.exports = P;
	else root.MESPollStats = P;
})(this);
